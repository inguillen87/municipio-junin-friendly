const API_URL = '/api/internal-grh-source-preview';
const LOGIN_URL = 'login.html?next=nomina-control.html';
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const ALLOWED_DEFINITIONS = new Set([
  'grh-calculo-pipe-utf8.v1',
  'grh-calculo-semicolon-windows1252.v1',
  'junin-638-amaru-fixed55.v1',
]);
const DEFINITION_CONTRACTS = Object.freeze({
  'grh-calculo-pipe-utf8.v1': Object.freeze({ format: 'pipe', encoding: 'utf-8' }),
  'grh-calculo-semicolon-windows1252.v1': Object.freeze({ format: 'pipe', encoding: 'windows-1252' }),
  'junin-638-amaru-fixed55.v1': Object.freeze({ format: 'fixed_width', encoding: 'ascii' }),
});
const ALLOWED_STATUSES = new Set(['valid', 'has_rejections', 'invalid_structure']);
const INTEGER_FORMAT = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const BYTE_FORMAT = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
const REJECTION_LABELS = Object.freeze({
  DNI_JUNIN638_DNI_INVALID:'DNI inválido: usá 8 dígitos, completando con ceros a la izquierda; no puede ser todo ceros',
  IMPORTE_JUNIN638_AMOUNT_INVALID:'Importe inválido: usá 8 dígitos, punto y 2 decimales, sin signo',
});

function exactObject(value, keys) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every((key) => keys.has(key)));
}

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function canonicalAggregate(payload, expected = {}) {
  if (!payload || payload.ok !== true || payload.includesRecordValues !== false
      || payload.persistencePerformed !== false || !payload.data
      || payload.data.includesRecordValues !== false
      || payload.data.persistencePerformed !== false) return null;
  if (!exactObject(payload, new Set([
    'ok', 'includesRecordValues', 'persistencePerformed', 'data',
  ]))) return null;
  const data = payload.data;
  const definitionContract = DEFINITION_CONTRACTS[data.definitionKey];
  if (!definitionContract
      || !ALLOWED_STATUSES.has(data.status)
      || data.contractVersion !== 'grh-source-preview.v1'
      || data.format !== definitionContract.format
      || data.encoding !== definitionContract.encoding
      || !/^hmac-sha256:[a-f0-9]{64}$/.test(data.contentFingerprint)
      || !/^[a-f0-9]{64}$/.test(data.schemaSha256)
      || !safeCount(data.byteLength) || data.byteLength < 1 || data.byteLength > MAX_FILE_BYTES
      || !safeCount(data.recordCount) || !safeCount(data.acceptedCount)
      || !safeCount(data.rejectedRecordCount) || !safeCount(data.issueCount)
      || !safeCount(data.structuralErrorCount)
      || data.recordCount > 100_000
      || data.acceptedCount + data.rejectedRecordCount !== data.recordCount
      || data.structuralErrorCount > data.issueCount
      || typeof data.schemaValid !== 'boolean'
      || typeof data.rejectionsTruncated !== 'boolean'
      || !data.rejectionSummary || typeof data.rejectionSummary !== 'object'
      || Array.isArray(data.rejectionSummary)) return null;
  const allowedKeys = new Set([
    'contractVersion', 'definitionKey', 'status', 'format', 'encoding',
    'contentFingerprint', 'schemaSha256', 'byteLength', 'recordCount',
    'acceptedCount', 'rejectedRecordCount', 'structuralErrorCount', 'issueCount',
    'schemaValid', 'rejectionSummary', 'rejectionsTruncated',
    'includesRecordValues', 'persistencePerformed',
  ]);
  if (!exactObject(data, allowedKeys)) return null;
  const entries = Object.entries(data.rejectionSummary);
  if (entries.length > 128 || entries.some(([code, count]) => (
    !/^[A-Z][A-Z0-9_]{1,127}$/.test(code) || !safeCount(count)
  ))) return null;
  const summarizedIssues = entries.reduce((total, [, count]) => total + count, 0);
  const expectedStatus = data.structuralErrorCount > 0
    ? 'invalid_structure' : data.issueCount > 0 ? 'has_rejections' : 'valid';
  if (summarizedIssues !== data.issueCount
      || data.schemaValid !== (data.structuralErrorCount === 0)
      || data.status !== expectedStatus) return null;
  if (expected.definitionKey !== undefined && data.definitionKey !== expected.definitionKey
      || expected.byteLength !== undefined && data.byteLength !== expected.byteLength) return null;
  return data;
}

function bytesToBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const chunks = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const slice = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    let binary = '';
    for (let index = 0; index < slice.length; index += 1) binary += String.fromCharCode(slice[index]);
    chunks.push(binary);
  }
  return btoa(chunks.join(''));
}

function shortFingerprint(value) {
  const digest = String(value).replace(/^hmac-sha256:/, '');
  return `${digest.slice(0, 12)}…${digest.slice(-8)}`;
}

function formatBytes(value) {
  if (value < 1024) return `${INTEGER_FORMAT.format(value)} bytes`;
  if (value < 1024 * 1024) return `${BYTE_FORMAT.format(value / 1024)} KiB`;
  return `${BYTE_FORMAT.format(value / (1024 * 1024))} MiB`;
}

function appendFinding(host, text, className = '') {
  const item = document.createElement('li');
  item.textContent = text;
  if (className) item.className = className;
  host.appendChild(item);
}

export const SOURCE_PREVIEW_TIMEOUT_MS = 25000;
export const SOURCE_PREVIEW_REPLY_BYTES = 64 * 1024;
export function sourcePreviewFailure(status) {
  if (status === 401) return 'La sesión venció. Volvé a ingresar para revisar el archivo.';
  if (status === 403) return 'Tu sesión no tiene acceso vigente a este análisis. Se retiraron el archivo y el resultado. Volvé a abrir la página con acceso autorizado.';
  if (status === 413) return 'El archivo supera el límite admitido. Elegí uno de hasta 2 MiB.';
  if (status === 415 || status === 422 || status === 400) return 'No se pudo validar este archivo con el formato seleccionado. Revisá su codificación y estructura; el original se conserva para reintentar.';
  if (status === 429) return 'Hay demasiadas solicitudes. Esperá antes de reintentar; el archivo sigue seleccionado y no se repetirá el envío automáticamente.';
  return 'No se pudo completar el análisis. El archivo sigue seleccionado; podés reintentar sin volver a buscarlo.';
}
export async function readSourcePreviewReply(response, signal) {
  if (!/^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('content-type') || '')
      || !/(?:^|,)\s*no-store(?:\s*,|\s*$)/i.test(response.headers.get('cache-control') || '')
      || response.headers.get('set-cookie')) throw Error('SOURCE_RESPONSE_INVALID');
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > SOURCE_PREVIEW_REPLY_BYTES)) throw Error('SOURCE_RESPONSE_INVALID');
  if (!response.body?.getReader) throw Error('SOURCE_RESPONSE_INVALID');
  const reader = response.body.getReader(), parts = []; let size = 0;
  const onAbort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted(); const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array) || (size += value.byteLength) > SOURCE_PREVIEW_REPLY_BYTES) throw Error('SOURCE_RESPONSE_INVALID');
      parts.push(value);
    }
    signal.throwIfAborted(); const bytes = new Uint8Array(size); let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } finally { signal.removeEventListener('abort', onAbort); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export function mountGrhSourcePreview(root = document, {
  request = (...args) => fetch(...args), readFile = file => file.arrayBuffer(),
  timeoutMs = SOURCE_PREVIEW_TIMEOUT_MS, navigate = url => location.replace(url),
} = {}) {
  const host = root.querySelector('[data-grh-source-preview]');
  if (!host || host.dataset.mounted === 'true') return false;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > SOURCE_PREVIEW_TIMEOUT_MS) throw Error('SOURCE_TIMEOUT_INVALID');
  const query = key => host.querySelector('[data-source-preview-' + key + ']');
  const form = query('form'), definition = query('definition'), fileInput = query('file'), fileState = query('file-state');
  const submit = query('submit'), status = query('status'), resultHost = query('result'), findings = query('findings');
  const cancel = query('cancel'), clear = query('clear'), formatHelp = query('format-help');
  if (![form, definition, fileInput, fileState, submit, status, resultHost, findings, cancel, clear, formatHelp].every(Boolean)) return false;
  let revision = 0, active = null, disposed = false, blocked = false;
  const owner = host.ownerDocument, view = owner.defaultView;
  const listeners = [];
  const on = (element, type, handler) => { element.addEventListener(type, handler); listeners.push(() => element.removeEventListener(type, handler)); };
  function setStatus(state, text) { status.dataset.state = state; status.textContent = text; }
  function renderState() {
    host.setAttribute('aria-busy', String(Boolean(active))); cancel.hidden = !active;
    submit.disabled = Boolean(active) || blocked; fileInput.disabled = definition.disabled = blocked;
  }
  function withdraw() {
    resultHost.hidden = true; findings.replaceChildren();
    for (const key of ['records', 'accepted', 'rejected', 'issues', 'contract', 'format', 'bytes', 'fingerprint']) query(key).textContent = '—';
  }
  function stop() { revision++; if (active) { clearTimeout(active.timer); active.controller.abort(); } active = null; renderState(); }
  function fileHint() {
    const file = fileInput.files?.[0];
    fileState.textContent = file ? 'Archivo seleccionado · ' + formatBytes(file.size) + '. El nombre no se envía.' : 'Seleccioná un archivo de hasta 2 MiB. Su nombre no se muestra ni se envía.';
  }
  function explainFormat() {
    formatHelp.textContent = definition.value === 'junin-638-amaru-fixed55.v1'
      ? 'Formato Junín: 55 bytes por registro; DNI en posición 5, longitud 8; importe en posición 44, longitud 11. Validar la estructura no acredita la aceptación del archivo por AMARU.'
      : 'Usá la codificación y el separador elegidos. El contenido se envía únicamente al analizador privado autorizado; no se importa ni se guarda como una liquidación.';
  }
  function clearSelection(message) {
    stop(); withdraw(); fileInput.value = ''; fileHint(); submit.textContent = 'Analizar sin importar'; setStatus('', message);
  }
  function render(data) {
    for (const [key, field] of [['records', 'recordCount'], ['accepted', 'acceptedCount'], ['rejected', 'rejectedRecordCount'], ['issues', 'issueCount']]) query(key).textContent = INTEGER_FORMAT.format(data[field]);
    query('contract').textContent = data.contractVersion + ' · ' + data.definitionKey;
    query('format').textContent = data.format + ' · ' + data.encoding;
    query('bytes').textContent = formatBytes(data.byteLength);
    query('fingerprint').textContent = shortFingerprint(data.contentFingerprint);
    findings.replaceChildren(); const entries = Object.entries(data.rejectionSummary);
    if (!entries.length) appendFinding(findings, 'Sin rechazos estructurales informados.', 'ok');
    for (const [code, count] of entries) appendFinding(findings, (REJECTION_LABELS[code] || code) + ' · ' + INTEGER_FORMAT.format(count) + (count === 1 ? ' caso' : ' casos'));
    if (data.rejectionsTruncated) appendFinding(findings, 'El detalle interno de rechazos fue truncado por el límite de seguridad.');
    if (data.definitionKey === 'junin-638-amaru-fixed55.v1') appendFinding(findings, 'Esta revisión no confirma aceptación por AMARU. El archivo no fue corregido ni transmitido al receptor.');
    resultHost.hidden = false;
    if (!data.recordCount) setStatus('warning', 'Estructura reconocida, pero el archivo no contiene registros para revisar.');
    else if (data.status === 'valid') setStatus('ok', 'Análisis válido · ' + INTEGER_FORMAT.format(data.recordCount) + (data.recordCount === 1 ? ' registro estructuralmente aceptado.' : ' registros estructuralmente aceptados.') + ' No se importó el archivo.');
    else if (data.status === 'has_rejections') setStatus('warning', 'Análisis con observaciones · ' + INTEGER_FORMAT.format(data.rejectedRecordCount) + (data.rejectedRecordCount === 1 ? ' registro rechazado.' : ' registros rechazados.') + ' Revisá los motivos debajo.');
    else setStatus('error', 'La estructura no coincide con el adaptador seleccionado. Revisá los motivos debajo.');
  }
  on(fileInput, 'change', () => { stop(); withdraw(); fileHint(); submit.textContent = 'Analizar sin importar'; setStatus('', fileInput.files?.length ? 'Archivo cambiado. Analizá esta selección para obtener un resultado vigente.' : 'Esperando un archivo local.'); });
  on(definition, 'change', () => { stop(); withdraw(); explainFormat(); submit.textContent = 'Analizar sin importar'; setStatus('', 'Formato cambiado. El resultado anterior se retiró; analizá nuevamente el archivo seleccionado.'); });
  on(cancel, 'click', () => { stop(); withdraw(); fileHint(); submit.textContent = 'Reintentar análisis'; setStatus('warning', 'Espera cancelada. El archivo sigue seleccionado; no se reintentará automáticamente.'); submit.focus(); });
  on(clear, 'click', () => { clearSelection('Archivo y resultado retirados. Esperando un archivo local.'); fileInput.focus(); });
  on(form, 'submit', async event => {
    event.preventDefault(); if (active || disposed || blocked) return;
    withdraw(); const file = fileInput.files?.[0], definitionKey = String(definition.value || '');
    if (!file) { setStatus('error', 'Seleccioná un archivo antes de analizar.'); fileInput.focus(); return; }
    if (file.size === 0) { setStatus('error', 'El archivo está vacío.'); fileInput.focus(); return; }
    if (file.size > MAX_FILE_BYTES) { setStatus('error', sourcePreviewFailure(413)); fileInput.focus(); return; }
    if (!ALLOWED_DEFINITIONS.has(definitionKey)) { setStatus('error', 'El formato seleccionado no está permitido.'); definition.focus(); return; }
    const job = { revision: ++revision, controller: new AbortController(), timer: null, timedOut: false };
    active = job; renderState(); setStatus('', 'Leyendo el archivo seleccionado…');
    const signal = job.controller.signal, current = () => active === job && revision === job.revision && !disposed && !signal.aborted;
    const interrupted = new Promise((_, reject) => signal.addEventListener('abort', () => reject(Error(job.timedOut ? 'SOURCE_TIMEOUT' : 'SOURCE_CANCELLED')), { once: true }));
    job.timer = setTimeout(() => { job.timedOut = true; job.controller.abort(); }, timeoutMs);
    try {
      const data = await Promise.race([(async () => {
        const bytes = await readFile(file); if (!current()) throw Error('SOURCE_CANCELLED');
        if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== file.size) throw Error('SOURCE_RESPONSE_INVALID');
        const contentBase64 = bytesToBase64(bytes); setStatus('', 'Validando con el analizador privado, sin importar…');
        const response = await request(API_URL, { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, signal,
          body: JSON.stringify({ definitionKey, contentBase64 }) });
        if (!current()) throw Error('SOURCE_CANCELLED');
        if (!response.ok) throw Object.assign(Error('SOURCE_HTTP'), { status: response.status });
        const payload = await readSourcePreviewReply(response, signal);
        const value = canonicalAggregate(payload, { definitionKey, byteLength: file.size });
        if (!value) throw Error('SOURCE_RESPONSE_INVALID'); return value;
      })(), interrupted]);
      if (!current() || fileInput.files?.[0] !== file || definition.value !== definitionKey) return;
      render(data); fileInput.value = ''; fileState.textContent = 'El archivo fue liberado del formulario. El resultado agregado corresponde únicamente al análisis terminado.';
      submit.textContent = 'Analizar sin importar';
    } catch (error) {
      if (active !== job || revision !== job.revision || disposed) return;
      withdraw();
      if (error.status === 401 || error.status === 403) {
        blocked = true; fileInput.value = ''; fileHint(); setStatus('error', sourcePreviewFailure(error.status));
        if (error.status === 401) navigate(LOGIN_URL);
      } else {
        fileHint(); submit.textContent = 'Reintentar análisis';
        const message = job.timedOut ? 'El análisis agotó su plazo. El archivo sigue seleccionado; podés reintentar sin volver a buscarlo.'
          : error.message === 'SOURCE_RESPONSE_INVALID' ? 'No se pudo verificar que el resultado corresponda al archivo y formato seleccionados. Se retiró el resultado; podés reintentar.'
          : sourcePreviewFailure(error.status);
        setStatus('error', message);
      }
    } finally {
      clearTimeout(job.timer);
      if (active === job) { active = null; job.controller.abort(); renderState(); }
    }
  });
  on(owner, 'municontrol:capabilities-ready', () => { if (active || fileInput.files?.length || !resultHost.hidden) clearSelection('Cambió el contexto de acceso. Se retiraron el archivo y el resultado; una nueva revisión volverá a comprobar los permisos.'); });
  on(owner, 'visibilitychange', () => { if (owner.hidden) clearSelection('La revisión se retiró al ocultar la página. Seleccioná nuevamente el archivo.'); });
  let observer;
  function destroy(event) {
    if (disposed) return; clearSelection('Revisión finalizada.'); disposed = true; listeners.splice(0).forEach(remove => remove());
    observer?.disconnect(); delete host.dataset.mounted;
    if (event?.type === 'pagehide' && event.persisted) view.addEventListener('pageshow', restored => {
      if (restored.persisted && host.isConnected) mountGrhSourcePreview(root, { request, readFile, timeoutMs, navigate });
    }, { once: true });
  }
  on(view, 'pagehide', destroy);
  observer = new view.MutationObserver(() => { if (!host.isConnected) destroy(); }); observer.observe(owner.body, { childList: true, subtree: true });
  host.dataset.mounted = 'true'; explainFormat(); renderState(); return true;
}
if (typeof document !== 'undefined') mountGrhSourcePreview(document);
