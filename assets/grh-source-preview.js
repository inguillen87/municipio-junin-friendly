const API_URL = '/api/internal-grh-source-preview';
const LOGIN_URL = 'login.html?next=nomina-control.html';
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const ALLOWED_DEFINITIONS = new Set([
  'grh-calculo-pipe-utf8.v1',
  'grh-calculo-semicolon-windows1252.v1',
]);
const DEFINITION_CONTRACTS = Object.freeze({
  'grh-calculo-pipe-utf8.v1': Object.freeze({ format: 'pipe', encoding: 'utf-8' }),
  'grh-calculo-semicolon-windows1252.v1': Object.freeze({ format: 'pipe', encoding: 'windows-1252' }),
});
const ALLOWED_STATUSES = new Set(['valid', 'has_rejections', 'invalid_structure']);
const INTEGER_FORMAT = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const BYTE_FORMAT = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

function exactObject(value, keys) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every((key) => keys.has(key)));
}

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function canonicalAggregate(payload) {
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

export function mountGrhSourcePreview(root = document) {
  const host = root.querySelector('[data-grh-source-preview]');
  if (!host || host.dataset.mounted === 'true') return false;
  const form = host.querySelector('[data-source-preview-form]');
  const definition = host.querySelector('[data-source-preview-definition]');
  const fileInput = host.querySelector('[data-source-preview-file]');
  const fileState = host.querySelector('[data-source-preview-file-state]');
  const submit = host.querySelector('[data-source-preview-submit]');
  const status = host.querySelector('[data-source-preview-status]');
  const resultHost = host.querySelector('[data-source-preview-result]');
  const findings = host.querySelector('[data-source-preview-findings]');
  if (!form || !definition || !fileInput || !fileState || !submit || !status
      || !resultHost || !findings) return false;

  function setStatus(state, text) {
    status.dataset.state = state;
    status.textContent = text;
  }

  function render(data) {
    host.querySelector('[data-source-preview-records]').textContent = INTEGER_FORMAT.format(data.recordCount);
    host.querySelector('[data-source-preview-accepted]').textContent = INTEGER_FORMAT.format(data.acceptedCount);
    host.querySelector('[data-source-preview-rejected]').textContent = INTEGER_FORMAT.format(data.rejectedRecordCount);
    host.querySelector('[data-source-preview-issues]').textContent = INTEGER_FORMAT.format(data.issueCount);
    host.querySelector('[data-source-preview-contract]').textContent = `${data.contractVersion} · ${data.definitionKey}`;
    host.querySelector('[data-source-preview-format]').textContent = `${data.format} · ${data.encoding}`;
    host.querySelector('[data-source-preview-bytes]').textContent = formatBytes(data.byteLength);
    host.querySelector('[data-source-preview-fingerprint]').textContent = shortFingerprint(data.contentFingerprint);
    findings.replaceChildren();
    const rejectionEntries = Object.entries(data.rejectionSummary);
    if (!rejectionEntries.length) appendFinding(findings, 'Sin rechazos estructurales informados.', 'ok');
    for (const [code, count] of rejectionEntries) {
      appendFinding(findings, `${code} · ${INTEGER_FORMAT.format(count)} ${count === 1 ? 'caso' : 'casos'}`);
    }
    if (data.rejectionsTruncated) appendFinding(findings, 'El detalle interno de rechazos fue truncado por el límite de seguridad.');
    resultHost.hidden = false;
    if (data.recordCount === 0) setStatus('warning', 'Estructura reconocida, pero el archivo no contiene registros para revisar.');
    else if (data.status === 'valid') setStatus('ok', `Preview válido · ${INTEGER_FORMAT.format(data.recordCount)} registros estructuralmente aceptados.`);
    else if (data.status === 'has_rejections') setStatus('warning', `Preview con observaciones · ${INTEGER_FORMAT.format(data.rejectedRecordCount)} registros rechazados.`);
    else setStatus('error', 'La estructura no coincide con el adaptador seleccionado.');
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    resultHost.hidden = true;
    if (!file) {
      fileState.textContent = 'Seleccioná un archivo de hasta 2 MiB. Su nombre no se muestra ni se envía.';
      setStatus('', 'Esperando un archivo local.');
      return;
    }
    fileState.textContent = file.size > MAX_FILE_BYTES
      ? `El archivo supera el límite de 2 MiB (${formatBytes(file.size)}).`
      : `Archivo local seleccionado · ${formatBytes(file.size)}. El nombre no se enviará.`;
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const file = fileInput.files && fileInput.files[0];
    const definitionKey = String(definition.value || '');
    resultHost.hidden = true;
    if (!file) {
      setStatus('error', 'Seleccioná un archivo antes de analizar.');
      return;
    }
    if (file.size === 0) {
      setStatus('error', 'El archivo está vacío.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setStatus('error', 'El archivo supera el límite privado de 2 MiB.');
      return;
    }
    if (!ALLOWED_DEFINITIONS.has(definitionKey)) {
      setStatus('error', 'El formato seleccionado no está permitido.');
      return;
    }
    submit.disabled = true;
    setStatus('', 'Analizando estructura sin importar…');
    try {
      const contentBase64 = bytesToBase64(await file.arrayBuffer());
      const response = await fetch(API_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ definitionKey, contentBase64 }),
      });
      if (response.status === 401) {
        location.replace(LOGIN_URL);
        return;
      }
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = payload && typeof payload.error === 'string' && payload.error.length <= 240
          ? payload.error : `La API privada respondió con estado ${response.status}.`;
        throw new Error(message);
      }
      const aggregate = canonicalAggregate(payload);
      if (!aggregate) throw new Error('La respuesta no cumple el contrato agregado de previsualización.');
      render(aggregate);
    } catch (error) {
      setStatus('error', error instanceof Error ? error.message : 'No se pudo analizar el archivo.');
    } finally {
      fileInput.value = '';
      fileState.textContent = 'El archivo fue liberado del formulario. Podés seleccionar otro para una nueva revisión.';
      submit.disabled = false;
    }
  });

  host.dataset.mounted = 'true';
  return true;
}

if (typeof document !== 'undefined') mountGrhSourcePreview(document);
