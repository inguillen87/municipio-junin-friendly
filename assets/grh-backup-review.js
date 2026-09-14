import { backupReviewBytes, backupReviewTotals, backupReviewCutoff, BackupReviewError, BACKUP_REVIEW_LABELS, BACKUP_REVIEW_ISSUES, MAX_BACKUP_REVIEW_BYTES } from './grh-backup-review-model.js';

const node = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
const shown = n => n.toLocaleString('es-AR');
export function backupReviewMessage(error) {
  // Only our own constant messages may be displayed. Browser/JSON/file errors
  // can include response fragments or personal filenames in their message.
  if (error instanceof BackupReviewError) return error.message;
  if (['AbortError', 'TimeoutError'].includes(error?.name)) return 'La verificación demoró demasiado. Conservamos la selección para reintentar.';
  return 'No se pudo abrir el informe. Conservamos la selección para reintentar.';
}
function readLocalFile(file, signal) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => reader.abort();
    const finish = () => signal.removeEventListener('abort', abort);
    reader.onload = () => { finish(); resolve(new Uint8Array(reader.result)); };
    reader.onerror = () => { finish(); reject(new BackupReviewError('No se pudo leer el informe local. Conservamos la selección para reintentar.')); };
    reader.onabort = () => { finish(); reject(new DOMException('Aborted', 'AbortError')); };
    if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    signal.addEventListener('abort', abort, { once: true }); reader.readAsArrayBuffer(file);
  });
}
export function mountBackupReview(host) {
  if (!host || host.dataset.backupMounted) return;
  host.dataset.backupMounted = 'true'; host.classList.add('backup-review');
  host.innerHTML = `<header class="section-head"><div><span class="section-index">REVISIÓN LOCAL · SIN INCORPORACIÓN</span><h2>Revisar un respaldo antes de incorporarlo</h2><p>Abrí el informe agregado generado al comparar dos respaldos en el equipo local. El respaldo SQL permanece fuera de esta pantalla.</p></div></header>
    <p class="br-notice">El archivo se lee sólo en este navegador. No se envía al servidor ni cambia los datos incorporados.</p>
    <form data-br-form><label for="backupReviewFile">Informe de revisión local · JSON de hasta 256 KiB</label><input id="backupReviewFile" type="file" accept=".json,application/json" data-br-file aria-describedby="backupReviewHelp">
    <small id="backupReviewHelp">Usá el informe agregado de la herramienta de revisión. No selecciones el respaldo SQL ni archivos con datos personales.</small>
    <div class="br-actions"><button class="button" type="submit" data-br-open disabled>Abrir revisión local</button><button class="button" type="button" data-br-clear>Limpiar revisión</button></div></form>
    <p class="br-status" role="status" aria-live="polite" data-br-status>Verificando acceso a la revisión…</p>
    <section data-br-result hidden aria-label="Resultado de la comparación local"><p class="br-verdict" data-br-verdict></p>
    <div class="br-sources"><article><h3>Base comparada</h3><p data-br-baseline></p><small>No se afirma que sea la base operativa vigente.</small></article><article><h3>Respaldo candidato</h3><p data-br-candidate></p><small>Posterior a la base según la fecha declarada en los respaldos.</small></article></div>
    <div class="br-counts"><div><span>Registros nuevos · 7 tablas</span><strong data-br-added></strong></div><div><span>Registros ausentes · 7 tablas</span><strong data-br-removed></strong></div><div><span>Registros modificados · 7 tablas</span><strong data-br-changed></strong></div></div>
    <p class="br-notice">Un registro ausente no demuestra una baja administrativa. Estos conteos son registros de tablas; no equivalen a personas ni legajos únicos.</p>
    <div class="br-table-wrap" tabindex="0" role="region" aria-label="Diferencias en siete tablas, desplazable"><table><caption>Diferencias en las siete tablas comparadas</caption><thead><tr><th scope="col">Tabla</th><th scope="col">Base</th><th scope="col">Candidato</th><th scope="col">Sin cambios</th><th scope="col">Nuevos</th><th scope="col">Ausentes</th><th scope="col">Modificados</th></tr></thead><tbody data-br-domains></tbody></table></div>
    <details class="br-details" open><summary>Cambios que requieren revisión</summary><p>Cambios de identidad, estado y fecha pueden referirse al mismo registro modificado. No sumes esas categorías entre sí.</p><ul data-br-issues></ul></details>
    <details class="br-details"><summary>Fuentes, alcance y huellas del informe</summary><div data-br-trace></div><p>La huella identifica el archivo leído. El servidor no autenticó el informe ni comprobó sus respaldos.</p></details>
    <p class="br-limit">Comparación en este equipo de siete tablas de GRH. No se compararon los registros incorporados en MuniControl, el detalle de las liquidaciones ni las fichadas, documentos y acciones propias de MuniControl. Esta revisión no autoriza incorporar ni reemplazar registros.</p></section>`;
  const $ = s => host.querySelector(s), fileInput = $('[data-br-file]'), status = $('[data-br-status]'), result = $('[data-br-result]');
  const accessNotice = document.getElementById('backupReviewAccessNotice');
  let allowed = false, busy = false, generation = 0, controller = null, suspended = false;
  const available = () => allowed && !suspended && host.isConnected && !host.hidden && document.visibilityState !== 'hidden';
  function controls() { host.setAttribute('aria-busy', String(busy)); $('[data-br-open]').disabled = busy || !allowed || !fileInput.files?.length; }
  function clearResult() { result.hidden = true; $('[data-br-domains]').replaceChildren(); $('[data-br-issues]').replaceChildren(); $('[data-br-trace]').replaceChildren(); }
  function cancel() { generation++; controller?.abort(); controller = null; busy = false; }
  function denied(unauthenticated = false) {
    cancel(); allowed = false; clearResult(); fileInput.value = ''; host.hidden = true; controls();
    if (accessNotice) { accessNotice.hidden = false; accessNotice.textContent = unauthenticated ? 'La sesión no está disponible. Ingresá al portal interno para revisar informes locales.' : 'La revisión local requiere permiso vigente de trazabilidad.'; }
  }
  async function authorize(signal) {
    // Session metadata only. File contents, filenames and hashes are never part of a request.
    const response = await fetch('/api/internal-auth', { method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json', 'Cache-Control': 'no-store' }, signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
    if (response.status === 401 || response.status === 403) throw Object.assign(Error(), { status: response.status });
    if (!response.ok) throw new BackupReviewError('No pudimos verificar la sesión. Conservamos el informe seleccionado para reintentar.');
    const payload = await response.json();
    if (payload?.ok !== true || payload.authenticated !== true) throw Object.assign(Error(), { status: 401 });
    if (!Array.isArray(payload.access?.tenantCapabilities) || !payload.access.tenantCapabilities.includes('lineage.read')) throw Object.assign(Error(), { status: 403 });
  }
  function render(data, fingerprint) {
    const totals = backupReviewTotals(data), changed = totals.added + totals.removed + totals.changed > 0n;
    $('[data-br-verdict]').textContent = changed ? 'Comparación local con diferencias para revisar. No autoriza una incorporación.' : 'Sin diferencias en las siete tablas comparadas. Esto no certifica todo GRH ni autoriza una incorporación.';
    $('[data-br-baseline]').textContent = backupReviewCutoff(data.baseline.cutoffAt);
    $('[data-br-candidate]').textContent = backupReviewCutoff(data.candidate.cutoffAt);
    for (const field of ['added', 'removed', 'changed']) $('[data-br-' + field + ']').textContent = shown(totals[field]);
    $('[data-br-domains]').replaceChildren(...data.domains.map(d => {
      const tr = node('tr'), th = node('th', BACKUP_REVIEW_LABELS[d.table]); th.scope = 'row'; tr.append(th);
      for (const field of ['baselineRows', 'candidateRows', 'unchanged', 'added', 'removed', 'changed']) tr.append(node('td', shown(d[field]))); return tr;
    }));
    $('[data-br-issues]').replaceChildren(...data.issues.map(i => node('li', BACKUP_REVIEW_LABELS[i.table] + ' · ' + BACKUP_REVIEW_ISSUES[i.code] + ': ' + shown(i.count))));
    if (!data.issues.length) $('[data-br-issues]').append(node('li', 'El informe no registró cambios en estas siete tablas. Se conservan los límites de la comparación.'));
    const trace = [['Base de origen declarada', 'GRH Junín'], ['Informe generado', new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(data.generatedAt)) + ' UTC'],
      ['Huella del respaldo base', data.baseline.sha256], ['Tamaño del respaldo base', shown(data.baseline.bytes) + ' bytes'],
      ['Huella del candidato', data.candidate.sha256], ['Tamaño del candidato', shown(data.candidate.bytes) + ' bytes'],
      ['Huella SHA-256 del informe local', fingerprint], ['Contrato', data.version], ['Herramienta', data.toolVersion], ['Reglas de comparación', data.mappingVersion]];
    $('[data-br-trace]').replaceChildren(...trace.map(([label, value]) => { const p = node('p'); p.append(node('strong', label + ': '), node('span', value)); return p; }));
    result.hidden = false; status.textContent = 'Informe local abierto. Su contenido permanece en este navegador; no se incorporaron datos.';
  }
  fileInput.addEventListener('change', () => {
    cancel(); clearResult(); status.textContent = fileInput.files?.length ? 'Informe seleccionado. Abrilo para verificar su contrato y comparar las siete tablas.' : 'Seleccioná un informe de revisión local.'; controls();
  });
  $('[data-br-form]').addEventListener('submit', async event => {
    event.preventDefault(); if (!available() || busy) return;
    const file = fileInput.files?.[0];
    if (!file || !file.size || file.size > MAX_BACKUP_REVIEW_BYTES) { clearResult(); status.textContent = 'Elegí un informe JSON de hasta 256 KiB. El respaldo SQL no se abre desde esta pantalla.'; return; }
    cancel(); controller = new AbortController(); const signal = controller.signal, seq = generation; busy = true; clearResult(); controls(); status.textContent = 'Verificando acceso antes de abrir el informe local…';
    const current = () => seq === generation && !signal.aborted && available();
    try {
      await authorize(signal); if (!current()) return;
      status.textContent = 'Leyendo y verificando el informe en este navegador…';
      const bytes = await readLocalFile(file, signal); if (!current()) return;
      const data = backupReviewBytes(bytes), hashBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)); if (!current()) return;
      render(data, [...hashBytes].map(n => n.toString(16).padStart(2, '0')).join(''));
    } catch (e) {
      if (!current()) return;
      if ([401, 403].includes(e.status)) denied(e.status === 401);
      else { clearResult(); status.textContent = backupReviewMessage(e); }
    } finally { if (seq === generation) { busy = false; controls(); } }
  });
  $('[data-br-clear]').addEventListener('click', () => { cancel(); clearResult(); fileInput.value = ''; status.textContent = 'Revisión limpiada. Seleccioná otro informe cuando lo necesites.'; controls(); fileInput.focus(); });
  function acceptGate(access) {
    cancel(); clearResult(); fileInput.value = '';
    if (!access?.tenantCapabilities?.has?.('lineage.read')) { denied(access === null); return; }
    allowed = true; host.hidden = false; if (accessNotice) accessNotice.hidden = true; controls(); status.textContent = 'Seleccioná el informe agregado generado por la revisión local.';
  }
  document.addEventListener('municontrol:capabilities-ready', event => acceptGate(event.detail));
  Promise.resolve(window.MuniControlCapabilityGate?.ready).then(access => { if (!suspended) acceptGate(access); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { cancel(); clearResult(); status.textContent = 'Volvé a abrir el informe para verificar el acceso y continuar.'; controls(); } });
  window.addEventListener('pagehide', () => { suspended = true; cancel(); clearResult(); fileInput.value = ''; controls(); });
  window.addEventListener('pageshow', e => { if (e.persisted) window.location.reload(); });
  controls();
}
if (typeof document !== 'undefined') mountBackupReview(document.querySelector('[data-grh-backup-review]'));
