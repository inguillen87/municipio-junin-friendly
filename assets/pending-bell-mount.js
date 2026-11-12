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

/** Lectura completa de la campanita. Las consultas livianas van siempre; los circuitos de la bandeja son lecturas grandes
 *  y se repiten como mucho cada tres minutos, o enseguida cuando una pantalla avisa que registró algo. */
export function pendingBellReading(getJson, readers, sources, {now = () => Date.now(), everyMs = 180000} = {}) {
  let circuits = null, readAt = 0, running = null;
  const refresh = () => running ??= pendingBellCircuits(getJson, sources).then(value => { circuits = value; readAt = now(); }).finally(() => { running = null; });
  return {
    invalidate() { readAt = 0; },
    async read() {
      const light = pendingBellSources(getJson, readers);
      if (sources.length && (circuits === null || now() - readAt >= everyMs)) await refresh();
      return {sources: await light, circuits: circuits ?? []};
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
export async function startPendingBell(doc = document, read = getJson) {
  const actions = doc.querySelector('.topbar .top-actions, .topbar .topbar-actions');
  if (!actions || actions.querySelector('[data-pending-bell-host]')) return null;
  let access; try { access = ownRunWorkspaceAccess(await read('/api/internal-auth')); } catch { return null; }
  const readers = pendingBellReadersFor(access.caps), sources = visibleApprovalSources(access.caps);
  if (readers.length === 0 && sources.length === 0) return null;
  const host = doc.createElement('div'); host.dataset.pendingBellHost = ''; actions.prepend(host);
  const reading = pendingBellReading(read, readers, sources);
  // Va antes que el aviso que escucha la campanita: cuando una pantalla registra algo, los circuitos se leen de nuevo.
  doc.addEventListener('mc:pending-refresh', () => reading.invalidate());
  return mountPendingBell({host, accountKey: await pendingBellAccountKey(access.key), read: reading.read, inboxHref: sources.length ? '/nomina#resumen' : ''});
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => startPendingBell(), {once: true}); else startPendingBell();
}
