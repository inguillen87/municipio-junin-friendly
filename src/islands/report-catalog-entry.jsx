import { createRoot } from 'react-dom/client';
import ReportCatalog from './ReportCatalog.jsx';

const mounts = new WeakMap();

// Called only after the legacy workspace has placed its own catalog container.
export function mountReportCatalog(host, { cards }) {
  if (!host?.isConnected) throw new Error('REPORT_CATALOG_HOST_REQUIRED');
  const existing = mounts.get(host);
  if (existing) return existing;
  const document = host.ownerDocument;
  const browser = document.defaultView;
  const previousInput = host.querySelector('[data-catalog-search]');
  const initialQuery = previousInput?.value || '';
  const restoreFocus = document.activeElement === previousInput;
  const selection = previousInput ? [previousInput.selectionStart, previousInput.selectionEnd] : null;
  const root = createRoot(host);
  let active = true;
  function unmount() {
    if (!active) return;
    active = false;
    browser.removeEventListener('pagehide', leave);
    root.unmount();
    delete host.dataset.reactCatalog;
    mounts.delete(host);
  }
  function leave(event) { if (!event.persisted) unmount(); }
  const handle = Object.freeze({ unmount });
  mounts.set(host, handle);
  browser.addEventListener('pagehide', leave);
  root.render(<ReportCatalog cards={cards} initialQuery={initialQuery} onReady={input => {
    if (!active) return;
    host.dataset.reactCatalog = 'ready';
    if (restoreFocus && document.activeElement === document.body) {
      input.focus({ preventScroll: true });
      if (selection?.every(value => Number.isInteger(value))) input.setSelectionRange(...selection);
    }
  }} />);
  return handle;
}
