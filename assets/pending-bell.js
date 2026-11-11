// Campanita de pendientes (pantalla). Recibe quién lee y cómo se consulta; no conoce ninguna API municipal.
// La monta pending-bell-mount.js, que es quien conoce las consultas livianas del servidor.
import {bellState, rememberedKeys, ago, periodText} from './pending-bell-model.js';

const node = (tag, text, className) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (className) e.className = className; return e; };
const BELL = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M12 3a6 6 0 0 0-6 6v3.2c0 .9-.3 1.7-.9 2.4L4 16v1h16v-1l-1.1-1.4a3.8 3.8 0 0 1-.9-2.4V9a6 6 0 0 0-6-6Zm-2.2 16a2.3 2.3 0 0 0 4.4 0Z" fill="currentColor"/></svg>';

export function mountPendingBell({host, read, accountKey, everyMs = 60000, now = () => Date.now(), storage = globalThis.localStorage, inboxHref = ''}) {
  if (!host || host.dataset.pendingBellMounted || typeof read !== 'function' || typeof accountKey !== 'string' || !accountKey) return null;
  host.dataset.pendingBellMounted = 'true';
  if (!document.querySelector('link[data-pending-bell-style]')) { const link = node('link'); link.rel = 'stylesheet'; link.href = new URL('./pending-bell.css', import.meta.url).href; link.dataset.pendingBellStyle = ''; document.head.append(link); }
  // La clave incluye cuenta, municipio y permisos: al cambiar cualquiera de ellos, lo visto no se hereda.
  const key = 'mc.pendientes.visto.' + accountKey, seen = () => { try { const v = JSON.parse(storage?.getItem(key) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }, remember = value => { try { storage?.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento: todo se muestra como nuevo */ } };
  const root = node('div', undefined, 'mc-bell'), button = node('button', undefined, 'mc-bell-button'), badge = node('span', '', 'mc-bell-badge'), panel = node('section', undefined, 'mc-bell-panel'), live = node('p', '', 'mc-bell-live');
  button.type = 'button'; button.innerHTML = BELL; button.append(badge); button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-label', 'Pendientes: consultando');
  badge.hidden = true; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Tus pendientes'); panel.tabIndex = -1; live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');
  root.append(button, live, panel); host.append(root);
  let state = null, failed = false, loading = false, loadedAt = 0, announced = -1, timer = null;

  const item = (r, kind) => {
    const li = node('li', undefined, 'mc-bell-item' + (kind === 'decided' && r.fresh ? ' is-fresh' : '')), link = node('a', kind === 'review' ? 'Revisar ahora' : 'Ver', 'mc-bell-go');
    link.href = r.href;
    li.append(node('strong', r.title + ' · ' + periodText(r.period)),
      node('span', kind === 'review' ? r.who + ' lo pidió ' + ago(r.when, now()) : (r.status === 'approved' ? 'Aprobado' : 'Rechazado') + ' por ' + r.who + ' ' + ago(r.when, now()), 'mc-bell-who'),
      node('span', kind === 'review' ? 'El detalle y el fundamento se ven al abrirlo.' : 'El motivo está en la propuesta.', 'mc-bell-why'), link);
    return li;
  };
  // Un circuito de la bandeja: cuántas propuestas esperan a esta persona y el enlace a su pantalla. Sin nombres ni motivos.
  const circuit = c => {
    const li = node('li', undefined, 'mc-bell-item is-circuit'), link = node('a', 'Revisar', 'mc-bell-go'); link.href = c.href; link.setAttribute('aria-label', 'Revisar ' + c.title);
    li.append(node('strong', c.title), node('span', c.sure ? (c.mine === 1 ? '1 espera tu decisión.' : c.mine + ' esperan tu decisión.')
      : (c.mine === 1 ? '1 pendiente. Al abrirlo se ve si lo decidís vos.' : c.mine + ' pendientes. Al abrirlos se ve cuáles decidís vos.'), 'mc-bell-who'), link);
    return li;
  };
  function render() {
    panel.replaceChildren(node('h2', 'Tus pendientes'));
    if (failed && !state) { panel.append(node('p', 'No se pudo consultar. Se vuelve a intentar solo en un minuto.', 'mc-bell-empty')); return; }
    if (!state) { panel.append(node('p', 'Consultando…', 'mc-bell-empty')); return; }
    // Sin ninguna lectura no se puede decir «no hay nada»: se dice que no se pudo consultar.
    if (!state.toReview.length && !state.decided.length && !state.circuits.length) panel.append(node('p', !state.covered.length ? 'No se pudo consultar ningún circuito. Se vuelve a intentar solo en un minuto.'
      : state.failed.length ? 'No hay nada esperándote en los circuitos que respondieron.' : 'No hay nada esperándote. Cuando alguien necesite tu aprobación, aparece acá.', 'mc-bell-empty'));
    if (state.toReview.length || state.circuits.length) { const list = node('ul'); for (const c of state.circuits) list.append(circuit(c)); for (const r of state.toReview) list.append(item(r, 'review')); panel.append(node('h3', 'Esperan tu decisión'), list); }
    if (state.decided.length) { const list = node('ul'); for (const r of state.decided) list.append(item(r, 'decided')); panel.append(node('h3', 'Lo que decidieron sobre lo tuyo'), list); }
    if (state.elsewhere) panel.append(node('p', state.elsewhere === 1 ? 'Hay 1 pendiente más que decide otra persona.' : 'Hay ' + state.elsewhere + ' pendientes más que deciden otras personas.', 'mc-bell-empty'));
    // Un circuito sin lectura no es un circuito sin pendientes: se nombra.
    if (state.failed.length && state.covered.length) panel.append(node('p', (state.failed.length > 3 ? 'Sin respuesta de ' + state.failed.length + ' circuitos' : 'Sin respuesta de: ' + state.failed.join(', ')) + '. No se cuentan como cero.', 'mc-bell-empty'));
    if (inboxHref) { const all = node('a', 'Ver la bandeja completa', 'mc-bell-all'); all.href = inboxHref; panel.append(all); }
    if (failed) panel.append(node('p', 'La última consulta falló; esto es lo anterior.', 'mc-bell-empty'));
  }
  function paint() {
    const text = state ? state.label : failed ? 'Pendientes: no se pudo consultar' : 'Pendientes: consultando';
    badge.hidden = !state?.badge; badge.textContent = state?.badge ?? ''; button.setAttribute('aria-label', state ? 'Pendientes: ' + text : text); button.classList.toggle('has-pending', !!state?.count);
    if (state && state.count !== announced) { if (announced >= 0 && state.count > announced) live.textContent = 'Nuevo pendiente: ' + text + '.'; announced = state.count; }
    if (!panel.hidden) render();
  }
  async function load() {
    if (loading || document.hidden) return; loading = true;
    // La lectura puede traer sólo las consultas livianas (una lista) o también los circuitos de la bandeja.
    try { const r = await read(); state = Array.isArray(r) ? bellState(r, seen()) : bellState(r.sources, seen(), r.circuits); failed = false; loadedAt = now(); } catch { failed = true; }
    finally { loading = false; paint(); }
  }
  function close(focus = false) { if (panel.hidden) return; panel.hidden = true; button.setAttribute('aria-expanded', 'false'); if (focus) button.focus(); }
  function open() {
    panel.hidden = false; button.setAttribute('aria-expanded', 'true'); render(); panel.focus();
    // Abrir la lista marca como vistas las decisiones que se muestran, por su identificador; lo que espera tu decisión sigue contando hasta que decidas.
    if (state?.news) { remember(rememberedKeys(state, seen())); state = {...state, news: 0, count: state.waiting, badge: state.waiting > 99 ? '99+' : state.waiting ? String(state.waiting) : ''}; announced = state.count; badge.hidden = !state.badge; badge.textContent = state.badge; }
  }
  button.addEventListener('click', () => panel.hidden ? open() : close());
  root.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(true); } });
  document.addEventListener('click', e => { if (!root.contains(e.target)) close(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && now() - loadedAt > 15000) load(); });
  // Las pantallas avisan cuando registran algo, para no esperar al próximo minuto.
  document.addEventListener('mc:pending-refresh', () => load());
  timer = setInterval(load, Math.max(15000, everyMs)); load();
  return {load, close, stop: () => clearInterval(timer)};
}
