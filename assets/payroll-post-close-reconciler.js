import {
  createPayrollPostClosePdfArtifact,
  createPayrollPostCloseXlsxArtifact,
  downloadPayrollPostCloseArtifact,
} from './payroll-post-close-exporter.js';

export const PAYROLL_POST_CLOSE_CONTRACT_VERSION = 'payroll-post-close-701-703.v1';
export const PAYROLL_POST_CLOSE_MAX_FILE_BYTES = 16 * 1024;
export const PAYROLL_POST_CLOSE_MAX_OBSERVATION_LENGTH = 500;

const HEADER = 'periodo;jurisdiccion;concepto;importe_ars';
const PERIOD = /^(?:19|20)[0-9]{2}-(?:0[1-9]|1[0-2])$/;
const AMOUNT = /^-?(?:0|[1-9][0-9]{0,17}),[0-9]{2}$/;
const MIN_INT64 = -9223372036854775808n;
const MAX_INT64 = 9223372036854775807n;
const CENTS = /^-?(?:0|[1-9][0-9]*)$/;
const JURISDICTIONS = Object.freeze(['42', '55']);
const CONCEPTS = Object.freeze(['701', '703']);
const INPUT_KEYS = new Set([
  'period', 'jurisdiction', 'observedBytes', 'controlBytes', 'observation',
]);

export class PayrollPostCloseReconciliationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PayrollPostCloseReconciliationError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new PayrollPostCloseReconciliationError(code, message);
}

function exactInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some((key) => !INPUT_KEYS.has(key))
      || !Object.hasOwn(value, 'period')
      || !Object.hasOwn(value, 'jurisdiction')
      || !Object.hasOwn(value, 'observedBytes')
      || !Object.hasOwn(value, 'controlBytes')) {
    fail('POST_CLOSE_INPUT_INVALID', 'La conciliación requiere un contexto y dos fuentes exactas');
  }
}

function canonicalContext(input) {
  if (typeof input.period !== 'string' || !PERIOD.test(input.period)) {
    fail('POST_CLOSE_PERIOD_INVALID', 'El período debe usar el formato YYYY-MM');
  }
  if (typeof input.jurisdiction !== 'string' || !JURISDICTIONS.includes(input.jurisdiction)) {
    fail('POST_CLOSE_JURISDICTION_INVALID', 'La jurisdicción debe ser 42 o 55');
  }
  return Object.freeze({ period: input.period, jurisdiction: input.jurisdiction });
}

function sourceBytes(value) {
  let bytes;
  if (value instanceof Uint8Array) bytes = value;
  else if (value instanceof ArrayBuffer) bytes = new Uint8Array(value);
  else fail('POST_CLOSE_SOURCE_INVALID', 'Cada fuente debe aportar bytes locales');
  if (bytes.byteLength === 0) {
    fail('POST_CLOSE_SOURCE_EMPTY', 'La fuente local está vacía');
  }
  if (bytes.byteLength > PAYROLL_POST_CLOSE_MAX_FILE_BYTES) {
    fail('POST_CLOSE_SOURCE_TOO_LARGE', 'La fuente local supera el límite de 16 KiB');
  }
  return bytes;
}

function amountToCents(value) {
  if (!AMOUNT.test(value)) {
    fail(
      'POST_CLOSE_AMOUNT_INVALID',
      'El importe debe ser decimal canónico con coma y exactamente dos centavos',
    );
  }
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [integer, decimals] = unsigned.split(',');
  const cents = (BigInt(integer) * 100n) + BigInt(decimals);
  if (negative && cents === 0n) {
    fail('POST_CLOSE_AMOUNT_INVALID', 'El importe negativo cero no es canónico');
  }
  const signed = negative ? -cents : cents;
  if (signed < MIN_INT64 || signed > MAX_INT64) {
    fail(
      'POST_CLOSE_AMOUNT_OUT_OF_RANGE',
      'El importe excede el rango exacto admitido por el registro institucional',
    );
  }
  return signed;
}

function decodeSource(bytes) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail('POST_CLOSE_ENCODING_INVALID', 'La fuente debe estar codificada en UTF-8 válido');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text.includes('\u0000') || /\r(?!\n)/.test(text)) {
    fail('POST_CLOSE_SOURCE_INVALID', 'La fuente contiene caracteres no permitidos');
  }
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.length !== 3 || lines.some((line) => line.length === 0)) {
    fail('POST_CLOSE_ROW_COUNT_INVALID', 'Cada fuente debe contener encabezado y dos conceptos');
  }
  if (lines[0] !== HEADER) {
    fail('POST_CLOSE_HEADER_INVALID', 'El encabezado de la fuente no coincide con el contrato');
  }
  return lines.slice(1);
}

function parseSource(bytes, context) {
  const rows = new Map();
  for (const line of decodeSource(bytes)) {
    const cells = line.split(';');
    if (cells.length !== 4 || cells.some((cell) => cell.trim() !== cell)) {
      fail('POST_CLOSE_ROW_INVALID', 'Una fila no coincide con el contrato canónico');
    }
    const [period, jurisdiction, concept, rawAmount] = cells;
    if (period !== context.period) {
      fail('POST_CLOSE_PERIOD_MISMATCH', 'La fuente no pertenece al período seleccionado');
    }
    if (jurisdiction !== context.jurisdiction) {
      fail(
        'POST_CLOSE_JURISDICTION_MISMATCH',
        'La fuente no pertenece a la jurisdicción seleccionada',
      );
    }
    if (!CONCEPTS.includes(concept)) {
      fail('POST_CLOSE_CONCEPT_INVALID', 'La fuente sólo admite los conceptos 701 y 703');
    }
    if (rows.has(concept)) {
      fail('POST_CLOSE_CONCEPT_DUPLICATED', 'La fuente repite un concepto');
    }
    rows.set(concept, amountToCents(rawAmount));
  }
  if (rows.size !== CONCEPTS.length || CONCEPTS.some((concept) => !rows.has(concept))) {
    fail('POST_CLOSE_CONCEPT_MISSING', 'La fuente debe informar los conceptos 701 y 703');
  }
  return rows;
}

function observationState(value) {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > PAYROLL_POST_CLOSE_MAX_OBSERVATION_LENGTH
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    fail('POST_CLOSE_OBSERVATION_INVALID', 'La observación no cumple el contrato local');
  }
  return value.trim();
}

async function rawSha256(bytes, cryptoImpl) {
  if (!cryptoImpl?.subtle || typeof cryptoImpl.subtle.digest !== 'function') {
    fail('POST_CLOSE_CRYPTO_UNAVAILABLE', 'SHA-256 local no está disponible');
  }
  let digest;
  try {
    digest = await cryptoImpl.subtle.digest('SHA-256', bytes);
  } catch {
    fail('POST_CLOSE_CRYPTO_UNAVAILABLE', 'SHA-256 local no está disponible');
  }
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function frozenComparison(concept, observed, control) {
  const difference = observed - control;
  return Object.freeze({
    concept,
    observedCents: observed.toString(),
    controlCents: control.toString(),
    differenceCents: difference.toString(),
    matches: difference === 0n,
  });
}

function frozenSourceEvidence(sha256, byteLength) {
  return Object.freeze({ sha256, byteLength });
}

/**
 * Compares two canonical, aggregate-only local sources for one period and one
 * jurisdiction. The function performs no network or persistence operation.
 * Monetary arithmetic is BigInt cents; JSON-facing values remain strings.
 */
export async function reconcilePostClose701703(input, options = {}) {
  exactInput(input);
  const context = canonicalContext(input);
  const observedBytes = sourceBytes(input.observedBytes);
  const controlBytes = sourceBytes(input.controlBytes);
  const observation = observationState(input.observation);
  const observed = parseSource(observedBytes, context);
  const control = parseSource(controlBytes, context);
  const cryptoImpl = options.cryptoImpl ?? globalThis.crypto;
  const [observedSha256, controlSha256] = await Promise.all([
    rawSha256(observedBytes, cryptoImpl),
    rawSha256(controlBytes, cryptoImpl),
  ]);
  const comparisons = Object.freeze(CONCEPTS.map((concept) => (
    frozenComparison(concept, observed.get(concept), control.get(concept))
  )));
  const observedTotal = CONCEPTS.reduce((sum, concept) => sum + observed.get(concept), 0n);
  const controlTotal = CONCEPTS.reduce((sum, concept) => sum + control.get(concept), 0n);
  const jurisdictionTotal = frozenComparison('701+703', observedTotal, controlTotal);
  const matched = comparisons.every(({ matches }) => matches);
  const observationProvided = observation.length > 0;
  const status = matched
    ? 'matched' : observationProvided ? 'difference_acknowledged' : 'difference_requires_observation';
  const warnings = Object.freeze(observedSha256 === controlSha256
    ? ['SOURCE_BYTES_IDENTICAL'] : []);

  return Object.freeze({
    contractVersion: PAYROLL_POST_CLOSE_CONTRACT_VERSION,
    period: context.period,
    jurisdiction: context.jurisdiction,
    status,
    reconciled: matched,
    inputRequirementsSatisfied: matched || observationProvided,
    observationRequired: !matched,
    observationProvided,
    sources: Object.freeze({
      observed: frozenSourceEvidence(observedSha256, observedBytes.byteLength),
      control: frozenSourceEvidence(controlSha256, controlBytes.byteLength),
    }),
    comparisons,
    jurisdictionTotal,
    warnings,
    includesPersonalRecords: false,
    rulesInferred: false,
    persistencePerformed: false,
    networkPerformed: false,
    fiscalArtifactGenerated: false,
  });
}

export function formatArsCents(centsInput) {
  const value = String(centsInput);
  if (!CENTS.test(value)) fail('POST_CLOSE_CENTS_INVALID', 'Centavos fuera del contrato');
  const negative = value.startsWith('-');
  const digits = (negative ? value.slice(1) : value).padStart(3, '0');
  const integer = digits.slice(0, -2).replace(/\B(?=([0-9]{3})+(?![0-9]))/g, '.');
  return `${negative ? '-' : ''}$ ${integer},${digits.slice(-2)}`;
}

function appendCell(row, value, className = '', label = '') {
  const cell = document.createElement('td');
  cell.textContent = value;
  if (className) cell.className = className;
  if (label) cell.dataset.label = label;
  row.appendChild(cell);
}

export function mountPayrollPostCloseReconciler(root = document) {
  const host = root.querySelector('[data-payroll-post-close-reconciler]');
  if (!host || host.dataset.mounted === 'true') return false;
  const form = host.querySelector('[data-post-close-form]');
  const period = host.querySelector('[data-post-close-period]');
  const jurisdiction = host.querySelector('[data-post-close-jurisdiction]');
  const observedFile = host.querySelector('[data-post-close-observed-file]');
  const controlFile = host.querySelector('[data-post-close-control-file]');
  const observedFileState = host.querySelector('[data-post-close-observed-file-state]');
  const controlFileState = host.querySelector('[data-post-close-control-file-state]');
  const observation = host.querySelector('[data-post-close-observation]');
  const submit = host.querySelector('[data-post-close-submit]');
  const reset = host.querySelector('[data-post-close-reset]');
  const status = host.querySelector('[data-post-close-status]');
  const errorSummary = host.querySelector('[data-post-close-error-summary]');
  const errorTitle = host.querySelector('[data-post-close-error-title]');
  const errorList = host.querySelector('[data-post-close-error-list]');
  const resultHost = host.querySelector('[data-post-close-result]');
  const rows = host.querySelector('[data-post-close-rows]');
  const observationNote = host.querySelector('[data-post-close-observation-note]');
  const evidenceSummary = host.querySelector('[data-post-close-evidence-summary]');
  const evidenceDetails = host.querySelector('[data-post-close-evidence-details]');
  const exportActions = host.querySelector('[data-post-close-export-actions]');
  const exportXlsx = host.querySelector('[data-post-close-export-xlsx]');
  const exportPdf = host.querySelector('[data-post-close-export-pdf]');
  const exportStatus = host.querySelector('[data-post-close-export-status]');
  const outputSelectors = [
    '[data-post-close-total-observed]', '[data-post-close-total-control]',
    '[data-post-close-total-difference]', '[data-post-close-observed-hash]',
    '[data-post-close-observed-bytes]', '[data-post-close-control-hash]',
    '[data-post-close-control-bytes]',
  ];
  const outputs = Object.fromEntries(outputSelectors.map((selector) => (
    [selector, host.querySelector(selector)]
  )));
  if (!form || !period || !jurisdiction || !observedFile || !controlFile
      || !observedFileState || !controlFileState || !observation || !submit || !reset
      || !status || !errorSummary || !errorTitle || !errorList || !resultHost || !rows
      || !observationNote || !evidenceSummary || !evidenceDetails
      || !exportActions || !exportXlsx || !exportPdf || !exportStatus
      || Object.values(outputs).some((value) => !value)) return false;

  let exportSnapshot = null;

  function setStatus(state, message) {
    status.dataset.state = state;
    status.textContent = message;
  }

  function setExportStatus(state, message) {
    exportStatus.dataset.state = state;
    exportStatus.textContent = message;
  }

  function updateFileState(input, output) {
    const file = input.files && input.files[0];
    if (!file) {
      output.dataset.state = '';
      output.textContent = 'No hay un archivo seleccionado.';
      input.setAttribute('aria-invalid', 'false');
      return;
    }
    const tooLarge = file.size > PAYROLL_POST_CLOSE_MAX_FILE_BYTES;
    output.dataset.state = tooLarge ? 'error' : 'ready';
    output.textContent = tooLarge
      ? `Archivo seleccionado · ${file.size} bytes · supera el máximo de 16 KiB.`
      : `Archivo seleccionado · ${file.size} bytes.`;
    input.setAttribute('aria-invalid', String(tooLarge));
  }

  function clearFormErrors() {
    errorSummary.hidden = true;
    errorList.replaceChildren();
    for (const element of [period, jurisdiction, observedFile, controlFile]) {
      element.setAttribute('aria-invalid', 'false');
    }
  }

  function showFormErrors(title, entries) {
    errorTitle.textContent = title;
    errorList.replaceChildren();
    for (const entry of entries) {
      entry.element.setAttribute('aria-invalid', 'true');
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = `#${entry.element.id}`;
      link.textContent = entry.message;
      link.addEventListener('click', (event) => {
        event.preventDefault();
        entry.element.focus();
      });
      item.appendChild(link);
      errorList.appendChild(item);
    }
    errorSummary.hidden = false;
    errorSummary.focus();
  }

  function clearResult() {
    exportSnapshot = null;
    observation.required = false;
    resultHost.hidden = true;
    rows.replaceChildren();
    observation.required = false;
    exportActions.hidden = true;
    exportXlsx.disabled = true;
    exportPdf.disabled = true;
    setExportStatus('warning', 'Primero completá una conciliación exportable.');
    for (const output of Object.values(outputs)) output.textContent = '—';
    evidenceSummary.textContent = 'Sin huellas calculadas.';
    evidenceDetails.open = false;
    observationNote.textContent = 'La observación sólo es obligatoria cuando existe diferencia.';
    observationNote.dataset.state = '';
  }

  function render(result) {
    rows.replaceChildren();
    for (const comparison of result.comparisons) {
      const row = document.createElement('tr');
      appendCell(row, result.jurisdiction, '', 'Jurisdicción');
      appendCell(row, comparison.concept, '', 'Concepto');
      appendCell(row, formatArsCents(comparison.observedCents), 'numeric', 'Reporte GRH');
      appendCell(row, formatArsCents(comparison.controlCents), 'numeric', 'Control');
      appendCell(row, formatArsCents(comparison.differenceCents), 'numeric', 'Diferencia');
      appendCell(row, comparison.matches ? 'Coincide' : 'Diferencia', '', 'Estado');
      rows.appendChild(row);
    }
    outputs['[data-post-close-total-observed]'].textContent = formatArsCents(
      result.jurisdictionTotal.observedCents,
    );
    outputs['[data-post-close-total-control]'].textContent = formatArsCents(
      result.jurisdictionTotal.controlCents,
    );
    outputs['[data-post-close-total-difference]'].textContent = formatArsCents(
      result.jurisdictionTotal.differenceCents,
    );
    outputs['[data-post-close-observed-hash]'].textContent = result.sources.observed.sha256;
    outputs['[data-post-close-observed-bytes]'].textContent = `${result.sources.observed.byteLength} bytes`;
    outputs['[data-post-close-control-hash]'].textContent = result.sources.control.sha256;
    outputs['[data-post-close-control-bytes]'].textContent = `${result.sources.control.byteLength} bytes`;
    const identicalSources = result.warnings.includes('SOURCE_BYTES_IDENTICAL');
    evidenceSummary.textContent = `2 fuentes identificadas · ${result.sources.observed.byteLength} y ${result.sources.control.byteLength} bytes · ${identicalSources ? 'huellas iguales' : 'huellas diferentes'}.`;
    evidenceDetails.open = false;
    observation.required = result.observationRequired && !result.inputRequirementsSatisfied;
    if (result.status === 'matched') {
      observationNote.textContent = 'Los conceptos coinciden al centavo para esta jurisdicción.';
      observationNote.dataset.state = 'ok';
      setStatus('ok', 'Coincidencia exacta. Este control local no aprueba ni cierra la liquidación.');
    } else if (result.status === 'difference_acknowledged') {
      observationNote.textContent = 'Se recibió una observación para esta ejecución local, pero su texto no se conserva. La diferencia sigue abierta.';
      observationNote.dataset.state = 'warning';
      setStatus('warning', 'Observación recibida. La diferencia no está conciliada ni documentada de forma durable.');
    } else {
      observationNote.textContent = 'Escribí una observación para satisfacer el requisito de esta revisión local; el texto no se conservará.';
      observationNote.dataset.state = 'error';
      setStatus('error', 'Hay diferencias. La observación es obligatoria y no convierte el resultado en coincidencia.');
    }
    if (result.warnings.includes('SOURCE_BYTES_IDENTICAL')) {
      observationNote.textContent += ' Los dos archivos tienen bytes idénticos; el segundo no aporta contenido diferente.';
    }
    const sourceBytesDiffer = !result.warnings.includes('SOURCE_BYTES_IDENTICAL');
    if (result.inputRequirementsSatisfied && sourceBytesDiffer) {
      exportSnapshot = Object.freeze({ result, generatedAt: new Date().toISOString() });
      exportActions.hidden = false;
      exportXlsx.disabled = false;
      exportPdf.disabled = false;
      setExportStatus(
        result.reconciled ? 'ok' : 'warning',
        result.reconciled
          ? 'Listo para descargar como borrador local con coincidencia aritmética. Procedencia e independencia no verificadas por el servidor.'
          : 'Listo para descargar como borrador local con diferencia abierta. Procedencia e independencia no verificadas por el servidor.',
      );
    } else {
      exportSnapshot = null;
      exportActions.hidden = true;
      exportXlsx.disabled = true;
      exportPdf.disabled = true;
      setExportStatus(
        sourceBytesDiffer ? 'warning' : 'error',
        sourceBytesDiffer
          ? 'Completá el requisito local antes de descargar.'
          : 'La descarga está bloqueada porque los dos archivos contienen exactamente los mismos bytes.',
      );
    }
    resultHost.hidden = false;
  }

  function exportArtifact(kind) {
    if (!exportSnapshot) {
      setExportStatus('error', 'Ejecutá una conciliación exportable antes de descargar.');
      return;
    }
    exportXlsx.disabled = true;
    exportPdf.disabled = true;
    try {
      const options = { generatedAt: exportSnapshot.generatedAt };
      const artifact = kind === 'xlsx'
        ? createPayrollPostCloseXlsxArtifact(exportSnapshot.result, options)
        : createPayrollPostClosePdfArtifact(exportSnapshot.result, options);
      const fileName = downloadPayrollPostCloseArtifact(artifact);
      setExportStatus('ok', `${fileName} se preparó sin incluir observaciones ni filas nominales.`);
    } catch (error) {
      setExportStatus(
        'error',
        error instanceof Error ? error.message : 'No se pudo preparar la descarga local.',
      );
    } finally {
      const enabled = Boolean(exportSnapshot);
      exportXlsx.disabled = !enabled;
      exportPdf.disabled = !enabled;
    }
  }

  exportXlsx.addEventListener('click', () => exportArtifact('xlsx'));
  exportPdf.addEventListener('click', () => exportArtifact('pdf'));

  for (const element of [period, jurisdiction, observedFile, controlFile]) {
    element.addEventListener('change', () => {
      clearFormErrors();
      if (element === observedFile) updateFileState(observedFile, observedFileState);
      if (element === controlFile) updateFileState(controlFile, controlFileState);
      observation.value = '';
      clearResult();
      setStatus('', 'Contexto modificado. Ejecutá una nueva conciliación local.');
    });
  }

  reset.addEventListener('click', () => {
    form.reset();
    clearFormErrors();
    updateFileState(observedFile, observedFileState);
    updateFileState(controlFile, controlFileState);
    clearResult();
    setStatus('', 'Esperando período, jurisdicción y dos fuentes locales.');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFormErrors();
    const observed = observedFile.files && observedFile.files[0];
    const control = controlFile.files && controlFile.files[0];
    const missing = [];
    if (!period.value) missing.push({ element: period, message: 'Seleccioná el período del control.' });
    if (!jurisdiction.value) missing.push({ element: jurisdiction, message: 'Seleccioná la jurisdicción 42 o 55.' });
    if (!observed) missing.push({ element: observedFile, message: 'Elegí el extracto agregado del reporte GRH.' });
    if (!control) missing.push({ element: controlFile, message: 'Elegí el extracto agregado de la planilla de control.' });
    if (missing.length) {
      showFormErrors('Completá los datos requeridos antes de conciliar.', missing);
      setStatus('error', 'Faltan datos requeridos. Revisá el resumen de errores.');
      return;
    }
    const oversized = [];
    if (observed.size > PAYROLL_POST_CLOSE_MAX_FILE_BYTES) {
      oversized.push({ element: observedFile, message: 'El extracto GRH supera el máximo de 16 KiB.' });
    }
    if (control.size > PAYROLL_POST_CLOSE_MAX_FILE_BYTES) {
      oversized.push({ element: controlFile, message: 'La planilla de control supera el máximo de 16 KiB.' });
    }
    if (oversized.length) {
      showFormErrors('Reducí los archivos antes de volver a intentar.', oversized);
      setStatus('error', 'Una fuente supera el límite local de 16 KiB.');
      return;
    }
    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');
    setStatus('', 'Conciliando importes exactos y calculando huellas locales…');
    let observedBytes;
    let controlBytes;
    try {
      observedBytes = new Uint8Array(await observed.arrayBuffer());
      controlBytes = new Uint8Array(await control.arrayBuffer());
      const result = await reconcilePostClose701703({
        period: period.value,
        jurisdiction: jurisdiction.value,
        observedBytes,
        controlBytes,
        observation: observation.value,
      });
      render(result);
      clearFormErrors();
      if (result.inputRequirementsSatisfied) {
        observedFile.value = '';
        controlFile.value = '';
        observation.value = '';
        updateFileState(observedFile, observedFileState);
        updateFileState(controlFile, controlFileState);
      } else {
        observation.focus();
      }
    } catch (error) {
      const message = error instanceof PayrollPostCloseReconciliationError
        ? error.message : 'No se pudo completar la conciliación local.';
      clearResult();
      const fields = error instanceof PayrollPostCloseReconciliationError
        && error.code === 'POST_CLOSE_PERIOD_INVALID'
        ? [{ element: period, message: 'Revisá el período seleccionado.' }]
        : error instanceof PayrollPostCloseReconciliationError
          && error.code === 'POST_CLOSE_JURISDICTION_INVALID'
          ? [{ element: jurisdiction, message: 'Revisá la jurisdicción seleccionada.' }]
          : [
            { element: observedFile, message: 'Revisá el formato y contenido del extracto GRH.' },
            { element: controlFile, message: 'Revisá el formato y contenido de la planilla de control.' },
          ];
      showFormErrors(message, fields);
      setStatus('error', message);
    } finally {
      if (observedBytes) observedBytes.fill(0);
      if (controlBytes) controlBytes.fill(0);
      submit.disabled = false;
      submit.removeAttribute('aria-busy');
    }
  });

  globalThis.addEventListener?.('pagehide', () => { exportSnapshot = null; }, { once: true });

  host.dataset.mounted = 'true';
  return true;
}

if (typeof document !== 'undefined') mountPayrollPostCloseReconciler(document);
