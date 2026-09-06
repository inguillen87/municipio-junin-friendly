// Presentation only: the existing tools keep their DOM, file selection and state.
export const REPORT_TASKS = Object.freeze([
  { id: 'overview', target: 'resumen', label: 'Informe de RRHH', detail: 'Indicadores y descargas' },
  { id: 'bank', target: 'bancarizacion', label: 'Control bancario', detail: 'Planilla mensual · J42 y J55' },
  { id: 'schooling', target: 'escolaridades', label: 'Escolaridades', detail: 'Revisar el archivo de control' },
  { id: 'f931', target: 'f931', label: 'F.931', detail: 'Revisar TXT antes de presentar' },
]);
const OVERVIEW_ANCHORS = new Set(['resumen', 'gestiones', 'ausentismo', 'sectores', 'metodologia', 'descargas']);

export function resolveReportLocation(hash, document) {
  let target;
  try { target = decodeURIComponent(String(hash || '').replace(/^#/, '')); }
  catch { target = ''; }
  if (!target) return { mode: 'overview', target: 'reportWorkspaceTitle' };
  if (target === 'todas-las-herramientas') return { mode: 'all', target: 'reportWorkspaceTitle' };
  const task = REPORT_TASKS.find(item => item.target === target);
  if (task) return { mode: task.id, target };
  if (OVERVIEW_ANCHORS.has(target)) return { mode: 'overview', target };
  const panel = document?.getElementById(target)?.closest('[data-report-panel]');
  if (panel && REPORT_TASKS.some(item => item.id === panel.dataset.reportPanel)) return { mode: panel.dataset.reportPanel, target };
  return { mode: 'overview', target: 'reportWorkspaceTitle' };
}

export function createReportWorkspaceController(window, document) {
  const panels = [...document.querySelectorAll('[data-report-panel]')];
  const listeners = new Set();
  const skipLink = document.getElementById('reportWorkspaceSkip');
  let current = resolveReportLocation(window.location.hash, document);
  let started = false;
  let lastHash = null;
  let frame = null;
  let sourceObserver = null;

  function apply(moveFocus) {
    const next = resolveReportLocation(window.location.hash, document);
    panels.forEach(panel => { panel.hidden = next.mode !== 'all' && panel.dataset.reportPanel !== next.mode; });
    const changed = current.mode !== next.mode;
    current = next;
    lastHash = window.location.hash;
    if (changed) listeners.forEach(listener => listener());
    if (frame !== null) window.cancelAnimationFrame(frame);
    if (moveFocus) frame = window.requestAnimationFrame(() => {
      frame = null;
      const target = document.getElementById(current.target);
      const panel = panels.find(item => item.dataset.reportPanel === current.mode);
      // The source-dependent report can still be loading or unavailable.
      const visibleTarget = target && !target.closest('[hidden]') ? target : panel;
      const heading = visibleTarget?.matches('h1, h2, h3') ? visibleTarget : visibleTarget?.querySelector('h1, h2, h3');
      const focus = heading && !heading.closest('[hidden]') ? heading : document.getElementById('reportWorkspaceTitle');
      if (focus) { focus.tabIndex = -1; focus.focus({ preventScroll: true }); }
      const scrollTarget = visibleTarget && !visibleTarget.closest('[hidden]') ? visibleTarget : focus;
      scrollTarget?.scrollIntoView({ behavior: 'instant', block: 'start' });
    });
  }
  function onLocationChange() { if (lastHash !== window.location.hash) apply(true); }
  function skipToTask(event) {
    const title = document.getElementById('reportWorkspaceTitle');
    if (!title) return;
    event.preventDefault();
    title.tabIndex = -1;
    title.focus({ preventScroll: true });
    title.scrollIntoView({ behavior: 'instant', block: 'start' });
  }

  return {
    getSnapshot: () => current.mode,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    start() {
      if (started) return;
      started = true;
      document.body.dataset.reportNavigation = 'ready';
      window.addEventListener('hashchange', onLocationChange);
      window.addEventListener('popstate', onLocationChange);
      skipLink?.addEventListener('click', skipToTask);
      const report = document.getElementById('reportContent');
      if (report && window.MutationObserver) {
        sourceObserver = new window.MutationObserver(() => {
          // Honor a bookmarked download/overview anchor when its source arrives later.
          const target = document.getElementById(current.target);
          if (!report.hidden && current.mode === 'overview' && report.contains(target)) apply(true);
        });
        sourceObserver.observe(report, { attributes: true, attributeFilter: ['hidden'] });
      }
      apply(Boolean(window.location.hash));
    },
    navigate(target) {
      if (![...REPORT_TASKS.map(item => item.target), 'descargas', 'todas-las-herramientas'].includes(target)) return;
      const next = new URL(window.location.href);
      next.hash = target;
      if (next.hash !== window.location.hash) window.history.pushState(null, '', next.href);
      apply(true);
    },
    destroy() {
      if (!started) return;
      started = false;
      window.removeEventListener('hashchange', onLocationChange);
      window.removeEventListener('popstate', onLocationChange);
      skipLink?.removeEventListener('click', skipToTask);
      sourceObserver?.disconnect();
      sourceObserver = null;
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
      panels.forEach(panel => { panel.hidden = false; });
      delete document.body.dataset.reportNavigation;
      listeners.clear();
    },
  };
}
