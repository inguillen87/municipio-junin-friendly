// Conecta la campanita de pendientes a la barra superior. Los avisos salen de dos lugares:
// - la consulta liviana de pendientes de condiciones salariales (migración 227), que trae quién pidió y qué se decidió;
// - los mismos circuitos de la bandeja «Pendientes de aprobación» (maestro, reglas, novedades, cuentas, altas,
//   licencias…), de los que la campanita toma sólo cuántos esperan y cuántos puede decidir esta cuenta.
// Así la campanita y la bandeja nunca dicen cosas distintas. No guarda fundamentos, nombres ni legajos.
import {mountPendingBell} from './pending-bell.js';
import {visibleApprovalSources, lastClosedMonth} from './approvals-inbox-model.js';
import {patientRead} from './approvals-inbox-model.js';
import {salaryConditionsPending} from './own-contract-salary-conditions-pending.js';
import {SALARY_CONDITIONS_READ} from './own-contract-salary-conditions-model.js';
import {ownRunWorkspaceAccess} from './own-payroll-run-workspace-model.js';

export const PENDING_BELL_READERS = Object.freeze([
  Object.freeze({key: 'condiciones', title: 'Condiciones salariales', href: '/nomina#condiciones', url: '/api/internal-own-contract-salary-conditions?resource=pending', capabilities: SALARY_CONDITIONS_READ, parse: salaryConditionsPending}),
]);

/** Lectores que esta cuenta puede consultar: sólo los que tienen todos sus permisos. */
export function pendingBellReadersFor(caps, readers = PENDING_BELL_READERS) {
  return readers.filter(r => r.capabilities.every(c => caps.has(c)));
}

/** Una lectura por lector. La que falla o no cumple su contrato queda como «sin respuesta», nunca como cero.
 *  Si la base estaba ocupada con otra lectura igual, se reintenta antes de darla por perdida. */
export async function pendingBellSources(getJson, readers) {
  return Promise.all(readers.map(async r => {
    const source = {key: r.key, title: r.title, href: r.href};
    try { const body = await patientRead(() => getJson(r.url)); if (body?.ok !== true) throw new Error('PENDING_READ_FAILED'); r.parse(body.data); return {...source, pending: body.data}; }
    catch { return {...source, error: true}; }
  }));
}

/** Los circuitos de la bandeja, de a dos lecturas por vez como ella. De cada uno sale sólo la cuenta; el que falla queda sin respuesta. */
export async function pendingBellCircuits(getJson, sources, period = lastClosedMonth()) {
  const out = new Array(sources.length); let next = 0;
  const worker = async () => {
    while (next < sources.length) {
      const i = next++, s = sources[i], circuit = {key: s.key, title: s.title, href: s.href};
      try {
        const body = await patientRead(() => getJson(s.url({period}))); if (body?.ok !== true) throw new Error('PENDING_READ_FAILED');
        const r = s.pick(body); if (!Number.isSafeInteger(r?.count)) throw new Error('PENDING_READ_FAILED');
        out[i] = {...circuit, count: r.count, reviewable: Number.isSafeInteger(r.reviewable) ? r.reviewable : null};
      } catch { out[i] = {...circuit, error: true}; }
    }
  };
  await Promise.all([worker(), worker()]); return out;
}

// Asistencia diaria (T4): sólo cuentas con lectura de asistencia por área. El servidor arma el corte por área y sede de los
// días civiles cerrados y devuelve únicamente conteos, estado y bloqueos; nunca nombres, legajos ni motivos.
export const PENDING_BELL_DAILY = Object.freeze({capability: 'attendance.area.read', url: '/api/internal-attendance-daily-notice?resource=notices', everyMs: 300000});
const DAILY_READ_FIELDS = ['version', 'ready', 'days', 'scopeCount', 'notices', 'failedScopes'];
const dailyCount = v => Number.isSafeInteger(v) && v >= 0;

/** Convierte la lectura del servidor en fuentes para la campanita. Mientras el productor no esté instalado no hay avisos
 *  ni falla. Un área que no respondió, o una lectura que no cumple el contrato, se informa como «sin respuesta» (null),
 *  nunca como cero. Cada aviso lo valida después attendanceDailyNotice dentro de bellState. */
export function pendingBellDailySources(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length !== DAILY_READ_FIELDS.length
    || !DAILY_READ_FIELDS.every(k => Object.hasOwn(data, k)) || data.version !== 'attendance-daily-notice-read.v1'
    || typeof data.ready !== 'boolean' || !Array.isArray(data.days) || !Array.isArray(data.notices)
    || !dailyCount(data.scopeCount) || !dailyCount(data.failedScopes) || data.failedScopes > data.scopeCount) return [null];
  if (!data.ready) return data.notices.length || data.scopeCount || data.failedScopes ? [null] : [];
  return data.failedScopes ? [...data.notices, null] : [...data.notices];
}

/** Lectura completa de la campanita. Las consultas livianas van siempre; los circuitos de la bandeja son lecturas grandes
 *  y se repiten como mucho cada tres minutos, o enseguida cuando una pantalla avisa que registró algo. La asistencia diaria
 *  se relee como mucho cada cinco minutos. */
export function pendingBellReading(getJson, readers, sources, {now = () => Date.now(), everyMs = 180000, daily = false} = {}) {
  let circuits = null, readAt = 0, running = null, dailySources = null, dailyAt = 0, dailyRunning = null;
  const refresh = () => running ??= pendingBellCircuits(getJson, sources).then(value => { circuits = value; readAt = now(); }).finally(() => { running = null; });
  const refreshDaily = () => dailyRunning ??= patientRead(() => getJson(PENDING_BELL_DAILY.url))
    .then(body => body?.ok === true ? pendingBellDailySources(body.data) : [null], () => [null])
    .then(value => { dailySources = value; dailyAt = now(); }).finally(() => { dailyRunning = null; });
  return {
    invalidate() { readAt = 0; dailyAt = 0; },
    async read() {
      const light = pendingBellSources(getJson, readers);
      const pending = [];
      if (sources.length && (circuits === null || now() - readAt >= everyMs)) pending.push(refresh());
      if (daily && (dailySources === null || now() - dailyAt >= PENDING_BELL_DAILY.everyMs)) pending.push(refreshDaily());
      await Promise.all(pending);
      return {sources: await light, circuits: circuits ?? [], dailySources: daily ? dailySources ?? [null] : []};
    },
  };
}

/** Clave de «lo ya visto» de esta cuenta, municipio y rol, sin dejar el correo en el almacenamiento del navegador. */
export async function pendingBellAccountKey(accessKey, subtle = globalThis.crypto?.subtle) {
  const bytes = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(accessKey)));
  return [...bytes.slice(0, 16)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getJson(url) {
  const response = await fetch(url, {credentials: 'same-origin', cache: 'no-store', headers: {accept: 'application/json'}, signal: AbortSignal.timeout(20000)});
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error('PENDING_READ_FAILED'), {status: response.status, code: body?.code});
  return body;
}

/** Monta la campanita en la barra superior si hay sesión y al menos un circuito que la cuenta pueda consultar. Si no, no muestra nada. */
export async function startPendingBell(doc = document, read = getJson, {retry = (fn, ms) => setTimeout(fn, ms)} = {}) {
  const actions = doc.querySelector('.topbar .top-actions, .topbar .topbar-actions');
  if (!actions || actions.querySelector('[data-pending-bell-host]')) return null;
  let access; try { access = ownRunWorkspaceAccess(await read('/api/internal-auth')); } catch { return null; }
  const readers = pendingBellReadersFor(access.caps), sources = visibleApprovalSources(access.caps), daily = access.caps.has(PENDING_BELL_DAILY.capability);
  if (readers.length === 0 && sources.length === 0 && !daily) return null;
  const reading = pendingBellReading(read, readers, sources, {daily});
  // Una cuenta que sólo lee asistencia por área ve la campanita recién cuando la lectura diaria está instalada y responde;
  // antes no hay nada que avisarle y una campanita vacía diría que ningún circuito respondió.
  if (readers.length === 0 && sources.length === 0) {
    const first = await reading.read().catch(() => null);
    if (!first || first.dailySources.length === 0 || first.dailySources.every(s => s === null)) {
      // Sin avisos todavía o la lectura falló: se vuelve a intentar sola cada cinco minutos, sin recargar la página.
      retry(() => startPendingBell(doc, read, {retry}), PENDING_BELL_DAILY.everyMs);
      return null;
    }
  }
  if (actions.querySelector('[data-pending-bell-host]')) return null;
  const host = doc.createElement('div'); host.dataset.pendingBellHost = ''; actions.prepend(host);
  // Va antes que el aviso que escucha la campanita: cuando una pantalla registra algo, los circuitos se leen de nuevo.
  doc.addEventListener('mc:pending-refresh', () => reading.invalidate());
  return mountPendingBell({host, accountKey: await pendingBellAccountKey(access.key), read: reading.read, inboxHref: sources.length ? '/nomina#resumen' : ''});
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => startPendingBell(), {once: true}); else startPendingBell();
}
