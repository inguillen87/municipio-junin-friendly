// Conecta la campanita de pendientes a la barra superior. Es el único lugar que sabe de dónde salen los avisos:
// hoy, de la consulta liviana de pendientes de condiciones salariales (migración 227), que no toma bloqueos ni
// devuelve fundamentos o datos de personas. Cada circuito nuevo se suma acá como un lector más.
import {mountPendingBell} from './pending-bell.js';
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

/** Una lectura por lector. La que falla o no cumple su contrato queda como «sin respuesta», nunca como cero. */
export async function pendingBellSources(getJson, readers) {
  return Promise.all(readers.map(async r => {
    const source = {key: r.key, title: r.title, href: r.href};
    try { const body = await getJson(r.url); if (body?.ok !== true) throw new Error('PENDING_READ_FAILED'); r.parse(body.data); return {...source, pending: body.data}; }
    catch { return {...source, error: true}; }
  }));
}

/** Clave de «lo ya visto» de esta cuenta, municipio y rol, sin dejar el correo en el almacenamiento del navegador. */
export async function pendingBellAccountKey(accessKey, subtle = globalThis.crypto?.subtle) {
  const bytes = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(accessKey)));
  return [...bytes.slice(0, 16)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getJson(url) {
  const response = await fetch(url, {credentials: 'same-origin', cache: 'no-store', headers: {accept: 'application/json'}, signal: AbortSignal.timeout(20000)});
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error('PENDING_READ_FAILED'), {status: response.status});
  return body;
}

/** Monta la campanita en la barra superior si hay sesión y al menos un lector permitido. Si no, no muestra nada. */
export async function startPendingBell(doc = document, read = getJson) {
  const actions = doc.querySelector('.topbar .top-actions');
  if (!actions || actions.querySelector('[data-pending-bell-host]')) return null;
  let access; try { access = ownRunWorkspaceAccess(await read('/api/internal-auth')); } catch { return null; }
  const readers = pendingBellReadersFor(access.caps); if (readers.length === 0) return null;
  const host = doc.createElement('div'); host.dataset.pendingBellHost = ''; actions.prepend(host);
  return mountPendingBell({host, accountKey: await pendingBellAccountKey(access.key), read: () => pendingBellSources(read, readers)});
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => startPendingBell(), {once: true}); else startPendingBell();
}
