import { verifyRelease, compareRelease, releaseLabel } from './release-status-model.js';
const ENDPOINT = '/release-info.json';
export async function readPublishedRelease(fetcher, signal) {
  const response = await fetcher(ENDPOINT, { credentials: 'omit', cache: 'no-store',
    redirect: 'error', headers: { Accept: 'application/json' }, signal });
  if (response.status !== 200 || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') || '')
      || !/\bno-store\b/i.test(response.headers.get('cache-control') || '')) {
    throw new Error('RELEASE_READ_UNCONFIRMED');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('RELEASE_READ_UNCONFIRMED');
  const parts = []; let length = 0, complete = false;
  try {
    for (;;) {
      const part = await reader.read(); if (part.done) { complete = true; break; }
      length += part.value.byteLength;
      if (length > 4096) throw new Error('RELEASE_READ_LIMIT');
      parts.push(part.value);
    }
    const bytes = new Uint8Array(length); let index = 0;
    for (const part of parts) { bytes.set(part, index); index += part.length; }
    return verifyRelease(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  } finally { if (!complete) await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
const copy = {
  same: 'Esta pantalla coincide con la publicación consultada.',
  different_commit: 'El dominio está publicando otro commit. Guardá tu trabajo antes de recargar.',
  different_artifact: 'El commit coincide, pero la compilación de esta pantalla es diferente. Revisar el despliegue.',
  unverified: 'No hay dos versiones de commit confirmadas para comparar. No se declara la pantalla actualizada.'
};
export function mountReleaseStatus(host, { loaded, fetcher = globalThis.fetch.bind(globalThis),
  available = () => true, clock = () => new Date(), clipboard = globalThis.navigator?.clipboard } = {}) {
  let initial = null;
  try { initial = verifyRelease(loaded); } catch { /* No atribuir un commit a una página sin sello. */ }
  const add = (parent, tag, text, className) => {
    const element = document.createElement(tag); if (text !== undefined) element.textContent = text;
    if (className) element.className = className; parent.append(element); return element;
  };
  host.className = 'release-status';
  const summary = add(host, 'summary');
  add(summary, 'strong', 'Versión del sistema');
  add(summary, 'span', releaseLabel(initial), 'release-code');
  const content = add(host, 'div', undefined, 'release-content');
  add(content, 'p', 'Compará el código que abrió este navegador con el publicado en este mismo dominio. No se recarga ni se modifica tu trabajo.', 'release-intro');
  const cards = add(content, 'div', undefined, 'release-cards');
  const cell = label => { const box = add(cards, 'div'); add(box, 'span', label); return add(box, 'strong', 'Sin consultar'); };
  const page = cell('Esta pantalla'), published = cell('Publicación consultada');
  page.textContent = releaseLabel(initial); page.dataset.releaseLoaded = '';
  published.dataset.releasePublished = '';
  const buttons = add(content, 'div', undefined, 'release-buttons');
  const check = add(buttons, 'button', 'Comprobar versión publicada', 'button primary'); check.type = 'button';
  const diagnostic = add(buttons, 'button', 'Copiar diagnóstico técnico', 'button'); diagnostic.type = 'button';
  const status = add(content, 'p', 'Todavía no se consultó la publicación.', 'release-result');
  status.setAttribute('role', 'status'); status.dataset.releaseStatus = '';
  const time = add(content, 'p', '', 'release-time');
  const trace = add(content, 'details', undefined, 'release-trace'); add(trace, 'summary', 'Identificadores completos');
  const traceText = add(trace, 'pre', 'Sin consulta realizada.');
  add(content, 'p', 'Código no es actualización de datos. Este control no certifica el respaldo de GRH, las fichadas, la nómina ni los permisos. Tampoco consulta la rama de GitHub.', 'release-boundary');
  let current = null, checkedAt = null, outcome = 'not_checked', controller = null, revision = 0, busy = false;
  const report = () => ({ version: 'municontrol-release-diagnostic.v1', loaded: initial,
    published: current, checkedAt, comparison: outcome, dataFreshnessVerified: false });
  function controls() {
    check.disabled = busy || !available(); diagnostic.disabled = busy || !available();
    check.textContent = busy ? 'Consultando publicación…' : 'Comprobar versión publicada';
    host.setAttribute('aria-busy', String(busy));
  }
  function invalidate() {
    revision++; controller?.abort(); controller = null; busy = false; current = null; checkedAt = null;
    outcome = 'not_checked'; published.textContent = 'Sin consultar'; time.textContent = '';
    status.textContent = 'Volvé a consultar para comparar con la publicación actual.';
    host.dataset.result = 'not_checked'; traceText.textContent = JSON.stringify(report(), null, 2); controls();
  }
  check.addEventListener('click', async () => {
    if (busy || !available()) return;
    invalidate(); const token = revision, abort = new AbortController(); controller = abort; busy = true;
    const active = () => token === revision && !abort.signal.aborted && available();
    controls(); status.textContent = 'Consultando sólo la identidad pública de la aplicación…';
    try {
      const value = await readPublishedRelease(fetcher, AbortSignal.any([abort.signal, AbortSignal.timeout(8000)]));
      if (!active()) return;
      current = value; checkedAt = clock().toISOString();
      outcome = initial ? compareRelease(initial, current) : 'unverified';
      published.textContent = releaseLabel(current); status.textContent = copy[outcome];
      time.textContent = 'Consulta realizada: ' + new Date(checkedAt).toLocaleString('es-AR') + '. No es monitoreo continuo.';
      host.dataset.result = outcome; traceText.textContent = JSON.stringify(report(), null, 2);
    } catch { if (active()) { outcome = 'unavailable'; host.dataset.result = outcome;
      status.textContent = 'No se pudo verificar la publicación. No se declara la pantalla actualizada; podés reintentar.';
      traceText.textContent = JSON.stringify(report(), null, 2); } }
    finally { if (token === revision) { busy = false; controller = null; controls(); } }
  });
  diagnostic.addEventListener('click', async () => {
    if (busy || !available()) return; const token = revision;
    try {
      if (!clipboard?.writeText) throw new Error('CLIPBOARD_UNAVAILABLE');
      await clipboard.writeText(JSON.stringify(report(), null, 2));
      if (token === revision && available()) status.textContent = 'Diagnóstico técnico copiado. No contiene nombres, sesiones ni datos municipales.';
    } catch {
      if (token === revision && available()) {
        trace.open = true; status.textContent = 'No se pudo copiar. Podés seleccionar los identificadores completos.';
        traceText.textContent = JSON.stringify(report(), null, 2);
      }
    }
  });
  controls();
  return { invalidate, refreshAvailability: controls, report };
}
const host = globalThis.document?.getElementById('releaseStatus');
if (host) {
  const shell = document.getElementById('platformAdminShell');
  let loaded = null; try { loaded = JSON.parse(document.querySelector('meta[name="municontrol-release"]')?.content || 'null'); } catch {}
  const ui = mountReleaseStatus(host, { loaded, available: () => !!shell && !shell.hidden && !document.hidden });
  new MutationObserver(() => { if (shell.hidden) ui.invalidate(); else ui.refreshAvailability(); })
    .observe(shell, { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('visibilitychange', () => { if (document.hidden) ui.invalidate(); else ui.refreshAvailability(); });
  window.addEventListener('pagehide', ui.invalidate);
  window.addEventListener('pageshow', ui.refreshAvailability);
}
