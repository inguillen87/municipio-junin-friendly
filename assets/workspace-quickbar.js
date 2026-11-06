// Quick-action bar for long work screens. The actions are grouped (Buscar · Ver · Exportar · Gestión…) and
// wrap, so every option is visible without sliding sideways. Once the bar scrolls out of view a compact dock
// keeps the same groups at hand as menus (top of the screen on desktop, bottom tab bar on phones).
// No requests of its own and no data: every action clicks, focuses or opens an existing control, and an
// action is offered only while its target exists and is enabled.
const reduceMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
const visible = node => Boolean(node && node.isConnected && !node.closest('[hidden]') && node.getClientRects().length);

function reveal(node) {
  if (!node) return;
  for (let parent = node.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'DETAILS' && !parent.open) parent.open = true;
  // Land below the sticky bar, not under it.
  const bar = document.querySelector('.mc-quickbar');
  node.style.scrollMarginTop = (bar && getComputedStyle(bar).position === 'sticky' ? Math.ceil(bar.getBoundingClientRect().height) + 24 : 12) + 'px';
  node.scrollIntoView({ block: 'start', behavior: reduceMotion() ? 'auto' : 'smooth' });
}

function printScope(selector, className) {
  const target = document.querySelector(selector);
  if (!target) return;
  target.classList.add('mc-print-target'); document.body.classList.add(className);
  const done = () => { target.classList.remove('mc-print-target'); document.body.classList.remove(className); };
  addEventListener('afterprint', done, { once: true }); window.print(); setTimeout(done, 1500);
}

/** Screen configurations: each action names a target selector and what to do with it. */
export const QUICKBARS = Object.freeze({
  legajos: {
    label: 'Acciones rápidas de Personas',
    actions: [
      { text: 'Buscar persona', run: 'focus', target: '[data-native-roster] input[name="search"]' },
      { text: 'Sólo activos', run: 'filter', target: '[data-native-roster] select[name="status"]', value: 'active', submit: '[data-native-roster] [data-nr-consult]' },
      { text: 'Todas las situaciones', run: 'filter', target: '[data-native-roster] select[name="status"]', value: 'all', submit: '[data-native-roster] [data-nr-consult]' },
      { text: 'Gráficos', run: 'scroll', target: '[data-native-roster] [data-nr-charts]' },
      { text: 'Listado', run: 'scroll', target: '[data-native-roster] .nr-table-wrap' },
      { text: 'Excel', run: 'click', target: '[data-native-roster] [data-nr-xlsx]', kind: 'export' },
      { text: 'CSV', run: 'click', target: '[data-native-roster] [data-nr-csv]', kind: 'export' },
      { text: 'Imprimir / PDF', run: 'print', target: '[data-native-roster] [data-nr-result]', kind: 'export' },
      { text: 'Nuevo legajo', run: 'click', target: '[data-employee-create]', kind: 'primary' },
      { text: 'Hijos y certificados', run: 'link', href: 'reportes-rrhh.html#certificados-escolares', group: 'go', icon: 'people' },
      { text: 'Antecedentes', run: 'open', target: '#employeeHistory', group: 'view' },
    ],
  },
  inicio: {
    label: 'Accesos rápidos a los módulos',
    actions: [
      { text: 'Buscar persona', run: 'link', href: '#legajos', kind: 'primary', group: 'people', icon: 'search' },
      { text: 'Calcular liquidación', run: 'link', href: 'nomina-control.html#calculo', group: 'payroll', icon: 'money' },
      { text: 'Revisar liquidación', run: 'link', href: 'nomina-control.html#decisiones', group: 'payroll', icon: 'check' },
      { text: 'Novedades', run: 'link', href: 'novedades-nomina.html', group: 'payroll', icon: 'plus' },
      { text: 'Haberes y reportes', run: 'link', href: 'nomina-control.html#reportes', group: 'payroll', icon: 'chart' },
      { text: 'Recibos', run: 'link', href: 'nomina-control.html#recibos', group: 'payroll', icon: 'list' },
      { text: 'Banco', run: 'link', href: 'nomina-control.html#banco', group: 'payroll', icon: 'bank' },
      { text: 'Relojes', run: 'link', href: 'relojes-marcaciones.html', group: 'attendance', icon: 'clock' },
      { text: 'Ausentismo', run: 'link', href: 'ausentismo-control.html', group: 'attendance', icon: 'calendar' },
      { text: 'Reportes RR. HH.', run: 'link', href: 'reportes-rrhh.html', group: 'people', icon: 'chart' },
      { text: 'Estructura', run: 'link', href: 'estructura.html', group: 'people', icon: 'tree' },
      { text: 'Calidad de datos', run: 'link', href: 'calidad-operativa.html', group: 'control', icon: 'shield' },
      { text: 'Centro de acciones', run: 'link', href: 'centro-acciones.html', group: 'control', icon: 'check' },
    ],
  },
  novedades: {
    label: 'Acciones rápidas de Novedades',
    actions: [
      { text: 'Preparte de relojes', run: 'open', target: '#attendancePreparte', group: 'load', icon: 'clock' },
      { text: 'Carga rápida', run: 'click', target: 'input[name="sourceMode"][value="agile"]', reveal: '#entrySection', group: 'load', icon: 'plus' },
      { text: 'Planilla', run: 'click', target: 'input[name="sourceMode"][value="sheet"]', reveal: '#entrySection', group: 'load', icon: 'grid' },
      { text: 'TXT / CSV', run: 'click', target: 'input[name="sourceMode"][value="bulk"]', reveal: '#entrySection', group: 'load', icon: 'upload' },
      { text: 'Buscar legajo', run: 'click', target: '#pickLegajoButton', group: 'find', icon: 'search' },
      { text: 'Validar y previsualizar', run: 'click', target: '#preflightButton', kind: 'primary', group: 'manage', icon: 'check' },
      { text: 'Lotes y decisiones', run: 'scroll', target: '#batchesTitle' },
      { text: 'Novedades fijas', run: 'open', target: '#fixedNovelties' },
    ],
  },
  ausentismo: {
    label: 'Acciones rápidas de Ausentismo',
    actions: [
      { text: 'Período', run: 'focus', target: '#fromInput', icon: 'calendar' },
      { text: 'Motivo', run: 'focus', target: '#reasonSelect' },
      { text: 'Sector', run: 'focus', target: '#sectorSelect' },
      { text: 'Limpiar filtros', run: 'click', target: '#resetFilters', group: 'find', icon: 'reset' },
      { text: 'Evolución', run: 'scroll', target: '[data-mc-chart="absence-trend"]' },
      { text: 'Mapa de calor', run: 'scroll', target: '[data-mc-chart="absence-calendar"]' },
      { text: 'Motivos y sectores', run: 'scroll', target: '#rankingsTitle' },
      { text: 'Buscar evento', run: 'focus', target: '#eventSearch' },
      { text: 'Eventos', run: 'scroll', target: '#eventsPanel' },
      { text: 'Imprimir / PDF', run: 'print', target: '#mainContent', kind: 'export' },
    ],
  },
  relojes: {
    label: 'Acciones rápidas de Relojes',
    actions: [
      { text: 'Jornadas', run: 'click', target: '#clockTabWorkdays', reveal: '#clockWorkdays' },
      { text: 'Buscar persona', run: 'focus', target: '#wdSearch', before: '#clockTabWorkdays' },
      { text: 'Resumen', run: 'click', target: '#clockTabOverview', reveal: '#clockOverview' },
      { text: 'Marcaciones', run: 'click', target: '#clockTabRecords', reveal: '#clockRecords' },
      { text: 'Calidad', run: 'click', target: '#clockTabIssues', reveal: '#clockIssuesWrap' },
      { text: 'Jornadas · Excel', run: 'click', target: '#wdXlsx', before: '#clockTabWorkdays', kind: 'export' },
      { text: 'Jornadas · CSV', run: 'click', target: '#wdCsv', before: '#clockTabWorkdays', kind: 'export' },
      { text: 'Marcaciones · Excel', run: 'click', target: '#clockExportXlsx', before: '#clockTabRecords', kind: 'export' },
      { text: 'Imprimir / PDF', run: 'click', target: '#clockPrint', kind: 'export' },
      { text: 'Excepciones horarias', run: 'scroll', target: '#timeExceptions', group: 'manage', icon: 'calendar' },
    ],
  },
});

const ICONS = {
  search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.2-4.2"/>',
  filter: '<path d="M4 5h16l-6 7v6l-4 2v-8z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  grid: '<path d="M4 4h16v16H4zM4 10h16M4 15h16M10 4v16"/>',
  download: '<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>',
  upload: '<path d="M12 16V5m0 0-4 4m4-4 4 4M5 20h14"/>',
  print: '<path d="M7 9V3h10v6M7 17H4v-6h16v6h-3M7 14h10v7H7z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 11a3 3 0 1 0 0-6M21 20c0-2.6-1.6-4.9-4-5.7"/>',
  archive: '<path d="M3 5h18v4H3zM5 9v10h14V9M10 13h4"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  calendar: '<path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"/>',
  money: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M7 12h.01M17 12h.01"/>',
  bank: '<path d="M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
  tree: '<path d="M10 4h4v4h-4zM4 16h4v4H4zM16 16h4v4h-4zM12 8v4M6 16v-4h12v4"/>',
  shield: '<path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6z"/><path d="m9 12 2 2 4-4"/>',
  reset: '<path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4"/>',
  go: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  caret: '<path d="m6 9 6 6 6-6"/>',
  up: '<path d="M12 19V5m0 0-6 6m6-6 6 6"/>',
};
/** Groups of the bar, in the order a screen first uses them. `short` names the group in the compact dock. */
export const QUICK_GROUPS = Object.freeze({
  find: { label: 'Buscar y filtrar', short: 'Buscar', icon: 'search' },
  load: { label: 'Cargar novedades', short: 'Cargar', icon: 'plus' },
  view: { label: 'Ver', short: 'Ver', icon: 'eye' },
  export: { label: 'Exportar e imprimir', short: 'Exportar', icon: 'download' },
  manage: { label: 'Gestión', short: 'Gestión', icon: 'gear' },
  go: { label: 'Ir a', short: 'Ir a', icon: 'go' },
  people: { label: 'Personas', short: 'Personas', icon: 'people' },
  payroll: { label: 'Liquidación', short: 'Liquidación', icon: 'money' },
  attendance: { label: 'Asistencia', short: 'Asistencia', icon: 'clock' },
  control: { label: 'Control', short: 'Control', icon: 'shield' },
});
export function quickGroupOf(action) {
  if (action.group) return action.group;
  if (action.kind === 'export' || action.run === 'print') return 'export';
  if (action.run === 'focus' || action.run === 'filter') return 'find';
  if (action.run === 'link') return 'go';
  if (action.kind === 'primary') return 'manage';
  return 'view';
}
function iconOf(action) {
  if (action.icon) return action.icon;
  if (action.run === 'print') return 'print';
  if (action.kind === 'export') return /excel/i.test(action.text) ? 'grid' : 'download';
  if (action.run === 'focus') return 'search';
  if (action.run === 'filter') return 'filter';
  if (/gráfic|evoluci|mapa|resumen|indicador|motivos/i.test(action.text)) return 'chart';
  if (/nuevo|carga|agregar/i.test(action.text)) return 'plus';
  if (/antecedente|histor|lotes|fijas/i.test(action.text)) return 'archive';
  if (/reloj|jornada|marcaci/i.test(action.text)) return 'clock';
  if (/calidad/i.test(action.text)) return 'shield';
  if (/hijo|persona|legajo/i.test(action.text)) return 'people';
  if (action.run === 'link') return 'go';
  return 'list';
}
const svg = name => `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.list}</svg>`;
let uid = 0;

export function mountQuickbar(host, config = QUICKBARS[host?.dataset?.quickbar]) {
  if (!host || !config || host.dataset.bound === 'true') return null;
  host.dataset.bound = 'true'; host.classList.add('mc-quickbar'); host.setAttribute('aria-label', config.label);
  const id = 'mcq' + (++uid);
  const row = document.createElement('div'); row.className = 'mc-quickbar-row';
  const groups = new Map();
  const groupBox = key => {
    if (!groups.has(key)) {
      const meta = QUICK_GROUPS[key] || { label: key, short: key, icon: 'list' };
      const box = document.createElement('div'); box.className = 'mc-quick-group'; box.dataset.group = key;
      const label = document.createElement('span'); label.className = 'mc-quick-label'; label.id = `${id}-${key}`; label.innerHTML = svg(meta.icon); label.append(document.createTextNode(meta.label));
      const items = document.createElement('div'); items.className = 'mc-quick-items'; items.setAttribute('role', 'group'); items.setAttribute('aria-labelledby', label.id);
      box.append(label, items); row.append(box); groups.set(key, { meta, box, items, elements: [] });
    }
    return groups.get(key);
  };
  // Canonical group order (Buscar → Cargar → Ver → Exportar → Gestión → Ir a), whatever the action order.
  const used = new Set(config.actions.map(quickGroupOf));
  for (const key of [...Object.keys(QUICK_GROUPS), ...used]) if (used.has(key)) groupBox(key);
  const status = document.createElement('span'); status.className = 'mc-quickbar-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const say = text => { status.textContent = text; };
  const buttons = config.actions.map((action, index) => {
    const element = action.run === 'link' ? document.createElement('a') : document.createElement('button');
    if (action.run === 'link') element.href = action.href; else element.type = 'button';
    element.className = 'mc-quick' + (action.kind ? ' mc-quick-' + action.kind : '');
    element.innerHTML = svg(iconOf(action)); element.append(document.createTextNode(action.text)); element.style.setProperty('--mc-quick-i', String(index));
    element.dataset.icon = iconOf(action);
    element.addEventListener('click', event => {
      if (action.run === 'link') return;
      const before = action.before && document.querySelector(action.before);
      if (before && !before.disabled && before.getAttribute('aria-selected') !== 'true') before.click();
      const target = document.querySelector(action.target);
      if (!target || target.disabled) { say('Esa acción todavía no está disponible en esta pantalla.'); return; }
      if (action.run === 'focus') { reveal(target); target.focus({ preventScroll: true }); }
      else if (action.run === 'scroll' || action.run === 'open') reveal(target);
      else if (action.run === 'click') { target.click(); say(action.kind === 'export' ? 'Exportación iniciada con el filtro vigente.' : ''); if (action.reveal) reveal(document.querySelector(action.reveal)); }
      else if (action.run === 'print') printScope(action.target, 'mc-print-scope');
      else if (action.run === 'filter') {
        target.value = action.value; target.dispatchEvent(new Event('change', { bubbles: true }));
        const submit = document.querySelector(action.submit);
        if (submit && !submit.disabled) { submit.click(); reveal(target.closest('form') || target); say(action.text + ': consultando…'); }
      }
      event.currentTarget?.blur?.();
    });
    const group = groupBox(quickGroupOf(action)); group.items.append(element); group.elements.push(element);
    return [action, element];
  });

  // Group tabs: the same groups as menus. Used by the phone version of the bar and by the compact dock.
  const menu = document.createElement('div'); menu.className = 'mc-quickmenu'; menu.setAttribute('role', 'menu'); menu.hidden = true; menu.id = id + '-menu';
  let opener = null;
  const closeMenu = (focusOpener = false) => {
    if (menu.hidden) return;
    menu.hidden = true; opener?.setAttribute('aria-expanded', 'false');
    if (focusOpener) opener?.focus(); opener = null;
  };
  const openMenu = (tab, group) => {
    if (opener === tab) { closeMenu(); return; }
    closeMenu(); opener = tab; tab.setAttribute('aria-expanded', 'true'); menu.setAttribute('aria-labelledby', tab.id);
    const head = document.createElement('div'); head.className = 'mc-quickmenu-head'; head.innerHTML = svg(group.meta.icon); head.append(document.createTextNode(group.meta.label));
    const items = group.elements.filter(element => !element.hidden).map(element => {
      const item = document.createElement('button'); item.type = 'button'; item.className = 'mc-quickmenu-item' + (element.classList.contains('mc-quick-primary') ? ' is-primary' : '');
      item.setAttribute('role', 'menuitem'); item.disabled = element.disabled || element.getAttribute('aria-disabled') === 'true';
      item.innerHTML = svg(element.dataset.icon); item.append(document.createTextNode(element.textContent));
      item.addEventListener('click', () => { closeMenu(); element.click(); });
      return item;
    });
    menu.replaceChildren(head, ...items);
    menu.hidden = false;
    // Desktop: drop down under the tab. Phone: bottom sheet (CSS), above the dock when it is showing.
    const rect = tab.getBoundingClientRect(), width = Math.min(320, innerWidth - 16);
    menu.style.setProperty('--mc-menu-left', Math.max(8, Math.min(rect.left, innerWidth - width - 8)) + 'px');
    menu.style.setProperty('--mc-menu-top', Math.round(rect.bottom + 8) + 'px');
    menu.dataset.place = rect.bottom + 8 + menu.offsetHeight > innerHeight - 8 ? 'above' : 'below';
    if (menu.dataset.place === 'above') menu.style.setProperty('--mc-menu-top', Math.max(8, Math.round(rect.top - 8 - menu.offsetHeight)) + 'px');
    menu.style.setProperty('--mc-menu-bottom', (dock.hidden ? 12 : Math.ceil(dock.getBoundingClientRect().height) + 16) + 'px');
    (items.find(item => !item.disabled) || head).focus?.({ preventScroll: true });
  };
  menu.addEventListener('keydown', event => {
    const items = [...menu.querySelectorAll('.mc-quickmenu-item:not(:disabled)')], at = items.indexOf(document.activeElement);
    if (event.key === 'Escape') { event.preventDefault(); closeMenu(true); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus(); }
    else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); items[event.key === 'Home' ? 0 : items.length - 1]?.focus(); }
    else if (event.key === 'Tab') closeMenu();
  });
  document.addEventListener('pointerdown', event => { if (!menu.hidden && !menu.contains(event.target) && !opener?.contains(event.target)) closeMenu(); }, true);
  addEventListener('resize', () => closeMenu());
  const tabsFor = (variant) => {
    const tabs = document.createElement('div'); tabs.className = 'mc-quick-tabs mc-quick-tabs-' + variant;
    const list = [];
    for (const [key, group] of groups) {
      const tab = document.createElement('button'); tab.type = 'button'; tab.className = 'mc-quick-tab'; tab.id = `${id}-${variant}-${key}`; tab.dataset.group = key;
      tab.setAttribute('aria-haspopup', 'menu'); tab.setAttribute('aria-expanded', 'false'); tab.setAttribute('aria-controls', menu.id);
      tab.setAttribute('aria-label', group.meta.label);
      tab.innerHTML = svg(group.meta.icon) + `<span>${group.meta.short}</span>` + `<i class="mc-quick-caret">${svg('caret')}</i>`;
      tab.addEventListener('click', () => openMenu(tab, group));
      tabs.append(tab); list.push([tab, group]);
    }
    return { tabs, list };
  };
  const inline = tabsFor('inline');
  host.replaceChildren(row, inline.tabs, status);

  // Compact dock, shown once the full bar is above the viewport.
  const dock = document.createElement('div'); dock.className = 'mc-quickdock'; dock.hidden = true; dock.setAttribute('role', 'toolbar'); dock.setAttribute('aria-label', config.label + ' (barra compacta)');
  const docked = tabsFor('dock');
  const top = document.createElement('button'); top.type = 'button'; top.className = 'mc-quickdock-top'; top.setAttribute('aria-label', 'Volver a la barra de acciones'); top.title = 'Volver arriba'; top.innerHTML = svg('up');
  top.addEventListener('click', () => { closeMenu(); host.scrollIntoView({ block: 'start', behavior: reduceMotion() ? 'auto' : 'smooth' }); });
  dock.append(docked.tabs, top);
  document.body.append(dock, menu);
  let above = false;
  const place = () => {
    const show = above && visible(host);
    if (dock.hidden === show) { dock.hidden = !show; if (!show && opener && dock.contains(opener)) closeMenu(); }
    document.body.classList.toggle('mc-quickdock-on', Boolean(document.querySelector('.mc-quickdock:not([hidden])')));
    if (show) { const rect = host.getBoundingClientRect(); dock.style.setProperty('--mc-dock-center', Math.round(rect.left + rect.width / 2) + 'px'); dock.style.setProperty('--mc-dock-max', Math.round(rect.width) + 'px'); }
  };
  if (typeof IntersectionObserver === 'function') {
    new IntersectionObserver(([entry]) => { above = !entry.isIntersecting && entry.boundingClientRect.bottom < 0; place(); }).observe(host);
  }
  addEventListener('resize', place);

  // Offer only actions whose control exists and is usable right now (permissions, loading, empty results).
  const refresh = () => {
    if (!host.isConnected) { dock.remove(); menu.remove(); return; }
    for (const [action, element] of buttons) {
      if (action.run === 'link') continue;
      const target = document.querySelector(action.target);
      const available = Boolean(target) && !target.disabled && (Boolean(action.before) || action.run === 'open' || action.run === 'focus' || action.run === 'filter' || visible(target) || target.closest('details:not([open])') !== null);
      element.hidden = !target || (action.run === 'click' && target.hidden);
      element.disabled = !available;
    }
    for (const group of groups.values()) group.box.hidden = !group.elements.some(element => !element.hidden);
    for (const { list } of [inline, docked]) for (const [tab, group] of list) tab.hidden = group.box.hidden;
    place();
  };
  refresh(); requestAnimationFrame(refresh);
  const timer = setInterval(() => { if (!host.isConnected) { clearInterval(timer); refresh(); } else if (!document.hidden) refresh(); }, 1200);
  document.addEventListener('click', () => requestAnimationFrame(refresh), true);
  return { refresh, openMenu: key => { const entry = (dock.hidden ? inline : docked).list.find(([, group]) => group === groups.get(key)); if (entry) openMenu(...entry); } };
}

if (typeof document !== 'undefined') {
  const start = () => document.querySelectorAll('[data-quickbar]').forEach(host => mountQuickbar(host));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
}
