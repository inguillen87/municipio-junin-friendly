// Campanita de pendientes: lo que espera a esta persona (para revisar) y lo que otros decidieron sobre lo suyo.
// Contrato de la lectura liviana «pending-work.v1» (propuesto a Root el 10/11/2026). Sin filas nominales.
// Todavía no hay servidor: este modelo valida la respuesta y arma la lista; no se conecta a ninguna pantalla.
export const PENDING_WORK_VERSION = 'pending-work.v1';
export const PENDING_WORK_MAX = 200;
const text = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max && v === v.trim() && !/[<>\u0000-\u001f\u007f]/.test(v);
const instant = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
const period = v => v === null || typeof v === 'string' && /^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(v);
const href = v => typeof v === 'string' && /^\/[a-z0-9-]+(\?[a-z0-9=&%_-]*)?(#[a-zA-Z0-9-]+)?$/.test(v);
const exact = (v, keys) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const fail = () => { throw new TypeError('PENDING_WORK_INVALID'); };
const id = v => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);

export function pendingWorkSummary(v) {
  if (!exact(v, ['version', 'generatedAt', 'toReview', 'decided', 'counts']) || v.version !== PENDING_WORK_VERSION || !instant(v.generatedAt)
    || !Array.isArray(v.toReview) || !Array.isArray(v.decided) || v.toReview.length > PENDING_WORK_MAX || v.decided.length > PENDING_WORK_MAX
    || !exact(v.counts, ['toReview', 'decided']) || !Number.isSafeInteger(v.counts.toReview) || !Number.isSafeInteger(v.counts.decided)
    || v.counts.toReview < v.toReview.length || v.counts.decided < v.decided.length) fail();
  for (const r of v.toReview) if (!exact(r, ['source', 'title', 'period', 'proposalId', 'authorLabel', 'createdAt', 'reason', 'href'])
    || !text(r.source, 60) || !text(r.title, 80) || !period(r.period) || !id(r.proposalId) || !text(r.authorLabel, 160) || !instant(r.createdAt) || !text(r.reason, 160) || !href(r.href)) fail();
  for (const r of v.decided) if (!exact(r, ['source', 'title', 'period', 'proposalId', 'status', 'actorLabel', 'recordedAt', 'reason', 'href'])
    || !text(r.source, 60) || !text(r.title, 80) || !period(r.period) || !id(r.proposalId) || !['approved', 'rejected'].includes(r.status) || !text(r.actorLabel, 160) || !instant(r.recordedAt) || !text(r.reason, 160) || !href(r.href)) fail();
  if (new Set([...v.toReview, ...v.decided].map(r => r.source + ':' + r.proposalId)).size !== v.toReview.length + v.decided.length) fail();
  return v;
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const periodText = p => p ? MONTHS[Number(p.slice(5)) - 1] + ' de ' + p.slice(0, 4) : '';
export function ago(iso, now = Date.now()) {
  const minutes = Math.floor((now - Date.parse(iso)) / 60000);
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 1) return 'recién'; if (minutes < 60) return 'hace ' + minutes + ' min';
  const hours = Math.floor(minutes / 60); if (hours < 24) return 'hace ' + hours + ' h';
  const days = Math.floor(hours / 24); return days === 1 ? 'ayer' : 'hace ' + days + ' días';
}
// El número rojo cuenta lo que espera una decisión de esta persona: no baja por haber abierto la lista, baja cuando
// decide. Lo decidido por otros sobre lo suyo se marca como nuevo hasta que abre la lista.
export function bellState(summary, seenAt = null) {
  const s = pendingWorkSummary(summary), seen = seenAt && Number.isFinite(Date.parse(seenAt)) ? Date.parse(seenAt) : 0;
  const toReview = [...s.toReview].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const decided = [...s.decided].sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt)).map(r => ({...r, fresh: Date.parse(r.recordedAt) > seen}));
  const news = decided.filter(r => r.fresh).length, count = s.counts.toReview + news;
  return {toReview, decided, waiting: s.counts.toReview, news, count, badge: count > 99 ? '99+' : count ? String(count) : '',
    label: count ? (s.counts.toReview ? s.counts.toReview + (s.counts.toReview === 1 ? ' pendiente te espera' : ' pendientes te esperan') : '') + (s.counts.toReview && news ? ' y ' : '') + (news ? news + (news === 1 ? ' novedad de lo tuyo' : ' novedades de lo tuyo') : '') : 'Sin pendientes',
    more: s.counts.toReview - toReview.length};
}
