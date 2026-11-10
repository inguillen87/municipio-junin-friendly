// «Pendientes de aprobación»: one screen with everything waiting for a second person, each linked to its own review.
// Read-only: it never approves, rejects or changes anything. Reads run two at a time to avoid lock contention.
import { ownRunWorkspaceAccess } from './own-payroll-run-workspace-model.js';
import { visibleApprovalSources, approvalTotals, APPROVAL_ELSEWHERE, lastClosedMonth, periodLabel } from './approvals-inbox-model.js';

const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt !== undefined) n.textContent = txt; return n; };

export function mountApprovalsInbox(host) {
  if (!host || host.dataset.approvalsMounted) return null;
  const href = new URL('approvals-inbox.css', import.meta.url).href;
  if (![...document.querySelectorAll('link[rel=stylesheet]')].some(l => l.href === href)) { const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = href; document.head.append(link); }
  host.dataset.approvalsMounted = '';
  host.className = 'mc-approvals';
  host.setAttribute('aria-labelledby', 'mcApprovalsTitle');
  host.innerHTML = '<header class="mc-approvals-head"><div><p class="mc-approvals-kicker">Bandeja</p><h2 id="mcApprovalsTitle">Pendientes de aprobación</h2>'
    + '<p class="mc-approvals-sub" data-approvals-sub>Todo lo que espera la revisión de una segunda persona, en un solo lugar.</p></div>'
    + '<div class="mc-approvals-actions"><span class="mc-approvals-total" data-approvals-total hidden></span><button type="button" class="button" data-approvals-refresh>Actualizar</button></div></header>'
    + '<p class="mc-approvals-status" role="status" aria-live="polite" data-approvals-status></p>'
    + '<div class="mc-approvals-grid" data-approvals-grid></div>'
    + '<details class="mc-approvals-others" data-approvals-others hidden><summary data-approvals-others-title></summary><div class="mc-approvals-grid" data-approvals-others-grid></div></details>'
    + '<details class="mc-approvals-empty" data-approvals-empty hidden><summary data-approvals-empty-title></summary><ul data-approvals-empty-list></ul></details>'
    + '<details class="mc-approvals-elsewhere"><summary>Otras aprobaciones que se revisan en su pantalla</summary><ul data-approvals-elsewhere></ul></details>';
  const $ = s => host.querySelector('[data-approvals-' + s + ']');
  $('elsewhere').replaceChildren(...APPROVAL_ELSEWHERE.map(x => { const li = el('li'); const a = el('a', null, x.title); a.href = x.href; li.append(a, document.createTextNode(' · ' + x.where)); return li; }));
  let run = 0, controller = null, loadedAt = 0;

  function card(source) {
    const c = el('article', 'mc-approval-card is-loading'); c.dataset.source = source.key;
    const top = el('div', 'mc-approval-top'); top.append(el('span', 'mc-approval-area', source.area), el('span', 'mc-approval-count', '…'));
    const h = el('h3', null, source.title + (source.period ? ' · ' + periodLabel(source.periodValue) : ''));
    const body = el('ul', 'mc-approval-items'); const foot = el('p', 'mc-approval-foot');
    const link = el('a', 'mc-approval-link', 'Revisar'); link.href = source.href;
    c.append(top, h, body, foot, link); return c;
  }
  function fill(c, source, r) {
    c.classList.remove('is-loading');
    const count = c.querySelector('.mc-approval-count'), body = c.querySelector('.mc-approval-items'), foot = c.querySelector('.mc-approval-foot'), link = c.querySelector('.mc-approval-link');
    if (r.error) { c.classList.add('is-error'); count.textContent = '—'; foot.textContent = 'No se pudo consultar ahora. Abrí la pantalla para revisar.'; link.textContent = 'Abrir'; return; }
    c.classList.toggle('is-zero', r.count === 0); c.classList.toggle('is-waiting', r.count > 0);
    count.textContent = String(r.count); count.setAttribute('aria-label', r.count + (r.count === 1 ? ' pendiente' : ' pendientes'));
    body.replaceChildren(...r.items.map(i => { const li = el('li'); const what = el(i.href ? 'a' : 'span', 'what', i.what || 'Propuesta'); if (i.href) what.href = i.href; li.append(what); const meta = [i.who, i.when].filter(Boolean).join(' · '); if (meta) li.append(el('span', 'meta', meta)); return li; }));
    foot.textContent = r.count === 0 ? 'Nada esperando.' : r.note ? r.note : Number.isInteger(r.reviewable) ? (r.reviewable === r.count ? 'Podés revisarlos vos.' : r.reviewable === 0 ? 'Los revisa otra persona: no podés aprobar lo propio ni sin el permiso.' : r.reviewable + ' podés revisarlos vos; el resto, otra persona.') : 'Al abrirlos, el sistema te muestra cuáles podés aprobar.';
    link.textContent = r.count > 0 ? 'Revisar (' + r.count + ')' : 'Abrir';
  }
  async function getJson(url, signal) {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }, signal });
    if (response.status === 401) throw Object.assign(Error('La sesión venció. Volvé a ingresar.'), { status: 401 });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.ok !== true) throw Object.assign(Error('No disponible'), { status: response.status, code: payload?.code });
    return payload;
  }
  async function load() {
    const mine = ++run; loadedAt = Date.now(); controller?.abort(); controller = new AbortController(); const signal = controller.signal;
    $('refresh').disabled = true; $('status').textContent = 'Consultando pendientes…'; $('total').hidden = true; $('empty').hidden = true; $('others').hidden = true; $('others-grid').replaceChildren();
    let caps;
    try { caps = ownRunWorkspaceAccess(await getJson('/api/internal-auth', signal)).caps; }
    catch (e) { if (mine !== run) return; $('status').textContent = e.status === 401 ? 'La sesión venció. Volvé a ingresar.' : 'No se pudo verificar la sesión.'; $('refresh').disabled = false; return; }
    const period = lastClosedMonth();
    const sources = visibleApprovalSources(caps).map(s => ({ ...s, periodValue: period }));
    if (!sources.length) { $('grid').replaceChildren(); $('status').textContent = 'Tu cuenta no tiene acceso a circuitos con aprobación.'; $('refresh').disabled = false; return; }
    const cards = new Map(sources.map(s => [s.key, card(s)])); $('grid').replaceChildren(...cards.values());
    const results = []; let next = 0;
    const worker = async () => {
      while (next < sources.length && mine === run) {
        const s = sources[next++]; let r;
        try { r = s.pick(await getJson(s.url({ period }), signal)); } catch (e) { if (e.name === 'AbortError') return; r = { error: true }; }
        if (mine !== run) return; results.push({ key: s.key, ...r }); fill(cards.get(s.key), s, r);
      }
    };
    await Promise.all([worker(), worker()]);
    if (mine !== run) return;
    // Waiting items first; modules with nothing pending fold into one line.
    const zero = sources.filter(s => results.find(r => r.key === s.key)?.count === 0);
    const order = r => r?.error ? 1 : r?.count > 0 ? 0 : 2;
    const shown = sources.filter(s => !zero.includes(s)).sort((a, b) => order(results.find(r => r.key === a.key)) - order(results.find(r => r.key === b.key)));
    const t = approvalTotals(results);
    // Nothing waits for this account: the items other people decide fold under one line, so the page stays short.
    const quiet = t.waiting > 0 && t.reviewable === 0 && t.unknown === 0;
    const others = quiet ? shown.filter(s => results.find(r => r.key === s.key)?.count > 0) : [];
    $('grid').replaceChildren(...shown.filter(s => !others.includes(s)).map(s => cards.get(s.key)));
    $('others-grid').replaceChildren(...others.map(s => cards.get(s.key)));
    $('others').hidden = !others.length; $('others').open = false;
    $('others-title').textContent = 'Ver ' + (t.waiting === 1 ? 'el pendiente que decide otra persona' : 'los ' + t.waiting + ' pendientes que decide otra persona');
    $('empty').hidden = !zero.length; $('empty-title').textContent = 'Sin pendientes en ' + zero.length + (zero.length === 1 ? ' circuito' : ' circuitos');
    $('empty-list').replaceChildren(...zero.map(s => { const li = el('li'); const a = el('a', null, s.title); a.href = s.href; li.append(a); return li; }));
    $('total').hidden = false; $('total').textContent = t.waiting ? t.waiting + (t.waiting === 1 ? ' pendiente' : ' pendientes') : 'Al día';
    $('total').classList.toggle('is-clear', !t.waiting);
    const failed = results.filter(r => r.error).length;
    $('status').textContent = (t.waiting ? (t.reviewable ? t.reviewable + (t.reviewable === 1 ? ' te espera a vos.' : ' te esperan a vos.') : 'Nada espera tu aprobación ahora.') : 'No hay nada esperando aprobación.') + (failed ? ' ' + failed + (failed === 1 ? ' circuito no respondió; probá Actualizar.' : ' circuitos no respondieron; probá Actualizar.') : '');
    $('refresh').disabled = false;
  }
  $('refresh').addEventListener('click', load);
  // Load when visible (the bandeja lives in Resumen); refresh when the tab comes back.
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting) && !host.dataset.approvalsLoaded) { host.dataset.approvalsLoaded = ''; load(); } }) : null;
  if (io) io.observe(host); else load();
  // Automatic refresh at most every two minutes; «Actualizar» always reads again.
  document.addEventListener('visibilitychange', () => { if (!document.hidden && host.dataset.approvalsLoaded !== undefined && host.getClientRects().length && Date.now() - loadedAt > 120000) load(); });
  return { load };
}
