// Section tabs for long work screens: each tab shows its own blocks and hides the rest (CSS class, never the
// `hidden` attribute the screen itself uses for permissions). Jumps and quick actions that target a block in
// another tab switch to it first (globalThis.mcSectionTabsReveal). The last tab is remembered per screen.
const store = key => ({ get() { try { return localStorage.getItem(key); } catch { return null; } }, set(v) { try { localStorage.setItem(key, v); } catch {} } });

export function mountSectionTabs({ host, tabs, storageKey, label = 'Secciones de la pantalla' }) {
  if (!host || !Array.isArray(tabs) || tabs.length < 2) return null;
  const memory = store(storageKey);
  const items = tabs.map(t => ({ ...t, nodes: () => t.panels.map(s => document.querySelector(s)).filter(Boolean) }));
  const nav = document.createElement('nav'); nav.className = 'mc-section-tabs'; nav.setAttribute('aria-label', label);
  const list = document.createElement('div'); list.setAttribute('role', 'tablist'); nav.append(list);
  const indicator = document.createElement('span'); indicator.className = 'mc-section-tabs-ink'; indicator.setAttribute('aria-hidden', 'true'); list.append(indicator);
  let current = null;
  const buttons = items.map((t, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.id = 'mcTab-' + t.id; b.dataset.tab = t.id;
    const name = document.createElement('span'); name.textContent = t.label; b.append(name);
    if (t.hint) { const hint = document.createElement('small'); hint.textContent = t.hint; b.append(hint); }
    b.addEventListener('click', () => activate(t.id, true));
    b.addEventListener('keydown', e => { const n = visibleButtons(), at = n.indexOf(b); let next = null;
      if (e.key === 'ArrowRight') next = n[(at + 1) % n.length]; else if (e.key === 'ArrowLeft') next = n[(at - 1 + n.length) % n.length]; else if (e.key === 'Home') next = n[0]; else if (e.key === 'End') next = n[n.length - 1];
      if (next) { e.preventDefault(); next.focus(); activate(next.dataset.tab, false); } });
    list.append(b); return b;
  });
  const visibleButtons = () => buttons.filter(b => !b.hidden);
  const usable = t => t.nodes().some(n => !n.hidden);
  function place() { const b = buttons.find(x => x.dataset.tab === current); if (!b || b.hidden) { indicator.style.opacity = '0'; return; } indicator.style.opacity = '1'; indicator.style.width = b.offsetWidth + 'px'; indicator.style.transform = `translateX(${b.offsetLeft}px)`; }
  function activate(id, remember) {
    const tab = items.find(t => t.id === id && usable(t)) ?? items.find(usable); if (!tab) return;
    current = tab.id;
    for (const t of items) for (const n of t.nodes()) { n.classList.toggle('mc-tab-off', t.id !== current); if (t.id === current) n.classList.add('mc-tab-in'); }
    for (const b of buttons) { const on = b.dataset.tab === current; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; }
    if (remember) memory.set(current);
    requestAnimationFrame(place);
  }
  function refresh() { for (const [i, t] of items.entries()) buttons[i].hidden = !usable(t); if (!items.find(t => t.id === current && usable(t))) activate(memory.get() ?? items[0].id, false); else place(); }
  host.after(nav);
  globalThis.mcSectionTabsReveal = node => { if (!node?.isConnected) return; const tab = items.find(t => t.nodes().some(n => n.contains(node))); if (tab && tab.id !== current) activate(tab.id, true); };
  document.addEventListener('click', e => { const jump = e.target.closest?.('[data-novelty-jump],[data-tab-jump]'); if (!jump) return; const target = document.getElementById(jump.dataset.noveltyJump || jump.dataset.tabJump); if (target) globalThis.mcSectionTabsReveal(target); }, true);
  const observer = new MutationObserver(refresh); for (const t of items) for (const n of t.nodes()) observer.observe(n, { attributes: true, attributeFilter: ['hidden'] });
  addEventListener('resize', place, { passive: true });
  activate(memory.get() ?? items[0].id, false); refresh();
  // Deep links (e.g. «Revisar» from the approvals bandeja: /novedades#fixedNovelties) open the tab that holds the target.
  const followHash = () => { const id = decodeURIComponent(location.hash.slice(1)); if (!id) return; const target = document.getElementById(id); if (!target) return; globalThis.mcSectionTabsReveal(target); for (let d = target; d; d = d.parentElement?.closest('details')) if (d.tagName === 'DETAILS') d.open = true; requestAnimationFrame(() => target.scrollIntoView({ block: 'start' })); };
  addEventListener('hashchange', followHash); followHash();
  return { activate: id => activate(id, true), refresh };
}
