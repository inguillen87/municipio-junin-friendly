// Campanita de pendientes: lo que espera a esta persona (para revisar) y lo que otros decidieron sobre lo suyo.
// Cada circuito entrega su propia lectura liviana de pendientes, ya validada por su modelo (la primera es
// «own-contract-salary-conditions.pending.v1», de Root). Esta pieza sólo las junta: no conoce fundamentos, cuerpos
// ni padrones, y la cobertura es parcial hasta que cada circuito tenga su lectura.
const text = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;
const instant = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
const period = v => typeof v === 'string' && /^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(v);
const id = v => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const href = v => typeof v === 'string' && /^\/[a-z0-9-]+(#[a-zA-Z0-9-]+)?$/.test(v);
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const periodText = p => period(p) ? MONTHS[Number(p.slice(5)) - 1] + ' de ' + p.slice(0, 4) : '';
export function ago(iso, now = Date.now()) {
  const minutes = Math.floor((now - Date.parse(iso)) / 60000);
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 1) return 'recién'; if (minutes < 60) return 'hace ' + minutes + ' min';
  const hours = Math.floor(minutes / 60); if (hours < 24) return 'hace ' + hours + ' h';
  const days = Math.floor(hours / 24); return days === 1 ? 'ayer' : 'hace ' + days + ' días';
}
// Una fuente = un circuito: {key, title, href, pending} con la lectura ya validada, o {key, title, href, error:true}.
function sourceItems(source) {
  if (!source || !text(source.key, 60) || !text(source.title, 80) || !href(source.href)) throw new TypeError('PENDING_BELL_SOURCE_INVALID');
  const p = source.pending;
  if (source.error === true || !p) return null;
  if (p.complete !== true || !Array.isArray(p.toReview) || !Array.isArray(p.decided) || !Number.isSafeInteger(p.counts?.toReview) || !Number.isSafeInteger(p.counts?.decided)
    || p.counts.toReview !== p.toReview.length || p.counts.decided !== p.decided.length) return null;
  const toReview = [], decided = [];
  for (const r of p.toReview) { if (!id(r?.proposalId) || !period(r.period) || !text(r.authorLabel, 300) || !instant(r.createdAt) || r.canReview !== true) return null;
    toReview.push({key: source.key + ':' + r.proposalId, title: source.title, href: source.href, period: r.period, who: r.authorLabel, when: r.createdAt}); }
  for (const r of p.decided) { if (!id(r?.eventId) || !id(r.proposalId) || !period(r.period) || !['approved', 'rejected'].includes(r.status) || !text(r.actorLabel, 300) || !instant(r.recordedAt)) return null;
    decided.push({key: source.key + ':' + r.eventId, title: source.title, href: source.href, period: r.period, status: r.status, who: r.actorLabel, when: r.recordedAt}); }
  return {toReview, decided};
}
// Un circuito de la bandeja «Pendientes de aprobación» (maestro, reglas, novedades, altas, licencias…): cuántas propuestas
// esperan y cuántas puede decidir esta persona. Si el circuito no informa cuáles son de ella, se avisan todas y se dice.
// Un circuito sin respuesta o con una cuenta imposible no aporta cero.
const circuitHref = v => typeof v === 'string' && /^\/[a-z0-9-]+(\?[a-z0-9=&-]+)?(#[a-zA-Z0-9-]+)?$/.test(v);
function circuitItem(c) {
  if (!c || !text(c.key, 60) || !text(c.title, 80) || !circuitHref(c.href)) throw new TypeError('PENDING_BELL_CIRCUIT_INVALID');
  if (c.error === true) return null;
  if (!Number.isSafeInteger(c.count) || c.count < 0 || !(c.reviewable === null || Number.isSafeInteger(c.reviewable) && c.reviewable >= 0 && c.reviewable <= c.count)) return null;
  const mine = c.reviewable === null ? c.count : c.reviewable;
  return {key: c.key, title: c.title, href: c.href, mine, sure: c.reviewable !== null, others: c.count - mine};
}
// El número rojo cuenta AVISOS, no filas: un circuito con 50 propuestas esperando es un aviso (el 50 se lee adentro),
// cada propuesta de la consulta liviana es un aviso y cada decisión sobre lo propio todavía no mostrada es otro.
// Así, cada vez que el número sube es porque llegó algo nuevo, no porque un lote trae muchas filas.
// «Visto» son los identificadores de eventos realmente mostrados, no la hora en que abrió la lista.
// Una fuente que falla o no cumple su forma no aporta cero: se cuenta como sin respuesta.
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
// Texto del botón para quien no ve el número: con avisos agrupados dice primero cuántos avisos son y después el detalle.
export function bellLabel(waiting, notices, news) {
  const count = notices + news; if (!count) return 'Sin pendientes';
  const detail = (waiting ? plural(waiting, 'pendiente te espera', 'pendientes te esperan') : '') + (waiting && news ? ' y ' : '') + (news ? plural(news, 'novedad de lo tuyo', 'novedades de lo tuyo') : '');
  return notices === waiting ? detail : plural(count, 'aviso', 'avisos') + ' · ' + detail;
}
export const bellBadge = count => count > 99 ? '99+' : count ? String(count) : '';
export function bellState(sources, seenKeys = [], circuitReads = []) {
  if (!Array.isArray(sources) || !Array.isArray(seenKeys) || !Array.isArray(circuitReads)) throw new TypeError('PENDING_BELL_INVALID');
  const seen = new Set(seenKeys.filter(k => typeof k === 'string')), toReview = [], decided = [], failed = [], covered = [], circuits = [];
  if (new Set(sources.map(s => s?.key)).size !== sources.length) throw new TypeError('PENDING_BELL_SOURCE_INVALID');
  if (new Set(circuitReads.map(c => c?.key)).size !== circuitReads.length) throw new TypeError('PENDING_BELL_CIRCUIT_INVALID');
  let elsewhere = 0;
  for (const read of circuitReads) { const c = circuitItem(read); if (!c) { failed.push(read.title); continue; } covered.push(c.title); elsewhere += c.others; if (c.mine > 0) circuits.push(c); }
  for (const source of sources) { const items = sourceItems(source); if (!items) { failed.push(source.title); continue; } covered.push(source.title); toReview.push(...items.toReview); decided.push(...items.decided); }
  toReview.sort((a, b) => Date.parse(a.when) - Date.parse(b.when)); decided.sort((a, b) => Date.parse(b.when) - Date.parse(a.when));
  for (const r of decided) r.fresh = !seen.has(r.key);
  // waiting: cuántas propuestas esperan su decisión (se dice en el texto). notices: en cuántos avisos llegan (se cuenta en el número).
  const waiting = toReview.length + circuits.reduce((n, c) => n + c.mine, 0), notices = toReview.length + circuits.length, news = decided.filter(r => r.fresh).length, count = notices + news;
  return {toReview, decided, circuits, elsewhere, waiting, notices, news, count, total: waiting + news, badge: bellBadge(count), label: bellLabel(waiting, notices, news), covered, failed, complete: failed.length === 0,
    shownKeys: decided.map(r => r.key)};
}
// Al abrir la lista, las decisiones mostradas dejan de contar; los avisos que esperan una decisión siguen hasta que se decida.
export const bellSeen = state => ({...state, news: 0, count: state.notices, total: state.waiting, badge: bellBadge(state.notices), label: bellLabel(state.waiting, state.notices, 0)});
// Lo que se guarda como visto: sólo claves de decisiones que siguen existiendo, para que no crezca sin límite.
export const rememberedKeys = (state, previous = []) => [...new Set([...previous.filter(k => state.shownKeys.includes(k)), ...state.shownKeys])].slice(0, 2000);
