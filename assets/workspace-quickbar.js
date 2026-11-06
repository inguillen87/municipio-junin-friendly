// Quick-action bar for long work screens: one sticky row that jumps, filters, exports or prints using the
// controls each screen already has. No requests of its own and no data: every action clicks, focuses or
// opens an existing control, and an action is offered only while its target exists and is enabled.
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
      { text: 'Hijos y certificados', run: 'link', href: 'reportes-rrhh.html#certificados-escolares' },
      { text: 'Antecedentes', run: 'open', target: '#employeeHistory' },
    ],
  },
});

export function mountQuickbar(host, config = QUICKBARS[host?.dataset?.quickbar]) {
  if (!host || !config || host.dataset.bound === 'true') return null;
  host.dataset.bound = 'true'; host.classList.add('mc-quickbar'); host.setAttribute('aria-label', config.label);
  const row = document.createElement('div'); row.className = 'mc-quickbar-row';
  const status = document.createElement('span'); status.className = 'mc-quickbar-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const buttons = config.actions.map((action, index) => {
    const element = action.run === 'link' ? document.createElement('a') : document.createElement('button');
    if (action.run === 'link') element.href = action.href; else element.type = 'button';
    element.className = 'mc-quick' + (action.kind ? ' mc-quick-' + action.kind : '');
    element.textContent = action.text; element.style.setProperty('--mc-quick-i', String(index));
    element.addEventListener('click', event => {
      if (action.run === 'link') return;
      const target = document.querySelector(action.target);
      if (!target || target.disabled) { status.textContent = 'Esa acción todavía no está disponible en esta pantalla.'; return; }
      if (action.run === 'focus') { reveal(target); target.focus({ preventScroll: true }); }
      else if (action.run === 'scroll' || action.run === 'open') reveal(target);
      else if (action.run === 'click') { target.click(); status.textContent = action.kind === 'export' ? 'Descarga iniciada con el filtro vigente.' : ''; }
      else if (action.run === 'print') printScope(action.target, 'mc-print-scope');
      else if (action.run === 'filter') {
        target.value = action.value; target.dispatchEvent(new Event('change', { bubbles: true }));
        const submit = document.querySelector(action.submit);
        if (submit && !submit.disabled) { submit.click(); reveal(target.closest('form') || target); status.textContent = action.text + ': consultando…'; }
      }
      event.currentTarget.blur?.();
    });
    row.append(element); return [action, element];
  });
  row.append(status); host.replaceChildren(row);
  // Offer only actions whose control exists and is usable right now (permissions, loading, empty results).
  const refresh = () => {
    if (!host.isConnected) return;
    for (const [action, element] of buttons) {
      if (action.run === 'link') continue;
      const target = document.querySelector(action.target);
      const available = Boolean(target) && !target.disabled && (action.run === 'open' || action.run === 'focus' || action.run === 'filter' || visible(target) || target.closest('details:not([open])') !== null);
      element.hidden = !target || (action.run === 'click' && target.hidden);
      element.disabled = !available;
    }
  };
  refresh();requestAnimationFrame(refresh);
  const timer = setInterval(() => { if (!host.isConnected) clearInterval(timer); else if (!document.hidden) refresh(); }, 1200);
  document.addEventListener('click', () => requestAnimationFrame(refresh), true);
  return { refresh };
}

if (typeof document !== 'undefined') {
  const start = () => document.querySelectorAll('[data-quickbar]').forEach(host => mountQuickbar(host));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
}
