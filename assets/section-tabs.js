// Section tabs for long work screens: each tab shows its own blocks and hides the rest (CSS class, never the
// `hidden` attribute the screen itself uses for permissions). Jumps and quick actions that target a block in
// another tab switch to it first (globalThis.mcSectionTabsReveal). The last tab is remembered per screen; a deep link
// (hash or the screen's own `initial` rule, e.g. ?batchId=) opens its tab for that visit only, even when the block
// appears after permissions load, and never overwrites the remembered choice.
const store = key => ({ get() { try { return localStorage.getItem(key); } catch { return null; } }, set(v) { try { localStorage.setItem(key, v); } catch {} } });

export function mountSectionTabs({ host, tabs, storageKey, label = 'Secciones de la pantalla', initial = null, skipEmpty = false }) {
  if (!host || !Array.isArray(tabs) || tabs.length < 2) return null;
  const memory = store(storageKey);
  const items = tabs.map(t => ({ ...t, nodes: () => t.panels.map(s => document.querySelector(s)).filter(Boolean) }));
  const nav = document.createElement('nav'); nav.className = 'mc-section-tabs'; nav.setAttribute('aria-label', label);
  const list = document.createElement('div'); list.setAttribute('role', 'tablist'); nav.append(list);
  const indicator = document.createElement('span'); indicator.className = 'mc-section-tabs-ink'; indicator.setAttribute('aria-hidden', 'true'); list.append(indicator);
  let current = null, wanted = null, chosen = false, restore = null, lost = null;
  const buttons = items.map((t, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.id = 'mcTab-' + t.id; b.dataset.tab = t.id;
    const name = document.createElement('span'); name.textContent = t.label; b.append(name);
    if (t.hint) { const hint = document.createElement('small'); hint.textContent = t.hint; b.append(hint); }
    b.addEventListener('click', () => { wanted = null; lost = null; chosen = true; activate(t.id, true); });
    b.addEventListener('keydown', e => { const n = visibleButtons(), at = n.indexOf(b); let next = null;
      if (e.key === 'ArrowRight') next = n[(at + 1) % n.length]; else if (e.key === 'ArrowLeft') next = n[(at - 1 + n.length) % n.length]; else if (e.key === 'Home') next = n[0]; else if (e.key === 'End') next = n[n.length - 1];
      if (next) { e.preventDefault(); wanted = null; lost = null; chosen = true; next.focus(); activate(next.dataset.tab, false); } });
    list.append(b); return b;
  });
  const visibleButtons = () => buttons.filter(b => !b.hidden);
  // skipEmpty: a container another module has not filled (no permission, nothing to show yet) does not earn a tab.
  const filled = n => !skipEmpty || n.childElementCount > 0 || Boolean(n.textContent.trim());
  const usable = t => t.nodes().some(n => !n.hidden && filled(n));
  function place() { const b = buttons.find(x => x.dataset.tab === current); if (!b || b.hidden) { indicator.style.opacity = '0'; return; } indicator.style.opacity = '1'; indicator.style.width = b.offsetWidth + 'px'; indicator.style.transform = `translateX(${b.offsetLeft}px)`; }
  function activate(id, remember) {
    const tab = items.find(t => t.id === id && usable(t)) ?? items.find(t => t.id === memory.get() && usable(t)) ?? items.find(usable); if (!tab) return;
    // Maps and other size-aware widgets inside a block that was not displayed need to measure again once it shows.
    if (current !== null && current !== tab.id) requestAnimationFrame(() => dispatchEvent(new Event('resize')));
    current = tab.id; if (current === wanted) wanted = null; if (current === restore) restore = null;
    for (const t of items) for (const n of t.nodes()) { n.classList.toggle('mc-tab-off', t.id !== current); if (t.id === current && !n.classList.contains('mc-tab-in')) n.classList.add('mc-tab-in'); }
    for (const b of buttons) { const on = b.dataset.tab === current; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; if (on) delete b.dataset.attention; }
    if (remember) memory.set(current);
    requestAnimationFrame(place);
  }
  function refresh() {
    for (const [i, t] of items.entries()) buttons[i].hidden = !usable(t);
    // A block that went away for a moment (a reload, a session check) brings its tab back when it returns, unless the
    // person moved to another tab in the meantime.
    if (lost && items.find(t => t.id === lost && usable(t))) { const back = lost; lost = null; activate(back, false); return; }
    if (wanted && items.find(t => t.id === wanted && usable(t))) activate(wanted, false);
    // The remembered tab may only become usable once permissions load: return to it unless the person already moved.
    else if (!chosen && restore && restore !== current && items.find(t => t.id === restore && usable(t))) activate(restore, false);
    else if (!items.find(t => t.id === current && usable(t))) { if (current !== null) lost = lost ?? current; activate(memory.get() ?? items[0].id, false); } else place();
  }
  host.after(nav);
  // remember=false (deep links): this visit only; if the block is still hidden by permissions, it opens once it shows.
  const reveal = (node, remember) => { if (!node?.isConnected) return; const tab = items.find(t => t.nodes().some(n => n.contains(node))); if (!tab) return; wanted = remember ? null : tab.id; restore = null; lost = null; if (remember) chosen = true; if (tab.id !== current) activate(tab.id, remember); };
  globalThis.mcSectionTabsReveal = node => reveal(node, true);
  // Guided tours and other visits show a block without changing the remembered tab.
  globalThis.mcSectionTabsShow = node => reveal(node, false);
  document.addEventListener('click', e => { const jump = e.target.closest?.('[data-novelty-jump],[data-tab-jump]'); if (!jump) return; const target = document.getElementById(jump.dataset.noveltyJump || jump.dataset.tabJump); if (target) globalThis.mcSectionTabsReveal(target); }, true);
  const observer = new MutationObserver(refresh); for (const t of items) for (const n of t.nodes()) observer.observe(n, { attributes: true, attributeFilter: ['hidden'] });
  // Modules that mount later may replace a panel's whole className (e.g. the own-novelties shell): keep the tab state on it,
  // or a block from another tab shows under the selected one.
  const keep = new MutationObserver(() => { if (current === null) return; for (const t of items) for (const n of t.nodes()) { const off = t.id !== current; if (n.classList.contains('mc-tab-off') !== off) n.classList.toggle('mc-tab-off', off); } });
  for (const t of items) for (const n of t.nodes()) keep.observe(n, { attributes: true, attributeFilter: ['class'] });
  addEventListener('resize', place, { passive: true });
  // The bar may mount while its screen is still hidden (loading state): place the marker once it gets a size.
  if (typeof ResizeObserver === 'function') new ResizeObserver(place).observe(list);
  const asked = typeof initial === 'function' ? initial() : null; if (asked && items.some(t => t.id === asked)) wanted = asked;
  // Without a remembered choice the first tab is the home: if it only shows up after permissions/data load, the bar
  // returns to it (unless the person already picked one) instead of staying on whichever block happened to be visible.
  if (!wanted) restore = memory.get() ?? items[0].id;
  activate(wanted ?? memory.get() ?? items[0].id, false); refresh();
  // Deep links (e.g. «Revisar» from the approvals bandeja: /novedades#fixedNovelties) open the tab that holds the target.
  const followHash = () => { const id = decodeURIComponent(location.hash.slice(1)); if (!id) return; const target = document.getElementById(id); if (!target) return; reveal(target, false); for (let d = target; d; d = d.parentElement?.closest('details')) if (d.tagName === 'DETAILS') d.open = true; requestAnimationFrame(() => target.scrollIntoView({ block: 'start' })); };
  addEventListener('hashchange', followHash); followHash();
  // Something in another tab needs the person (a lote to review, a pending send): show it for this visit if they have
  // not picked a tab yet; otherwise never pull them away mid-work — mark that tab instead.
  const attention = node => { const tab = node?.isConnected && items.find(t => t.nodes().some(n => n.contains(node))); if (!tab || tab.id === current) return;
    if (!chosen) return reveal(node, false); const b = buttons.find(x => x.dataset.tab === tab.id); if (b) b.dataset.attention = 'true'; };
  // sync(): re-applies the current tab to blocks registered after mounting, without changing the remembered choice.
  // show(id): opens a tab for this visit only (deep links), like `initial`, without touching the remembered choice.
  return { activate: id => activate(id, true), refresh, attention, sync: () => { if (current !== null) activate(current, false); }, show: id => { if (!items.some(t => t.id === id)) return; wanted = id; activate(id, false); } };
}
