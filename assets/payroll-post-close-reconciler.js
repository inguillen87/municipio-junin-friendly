export const PAYROLL_POST_CLOSE_CONTRACT_VERSION = 'payroll-post-close-701-703.v1';
export const PAYROLL_POST_CLOSE_MAX_FILE_BYTES = 16 * 1024;
export const PAYROLL_POST_CLOSE_MAX_OBSERVATION_LENGTH = 500;

const HEADER = 'periodo;jurisdiccion;concepto;importe_ars';
const PERIOD = /^(?:19|20)[0-9]{2}-(?:0[1-9]|1[0-2])$/;
const AMOUNT = /^-?(?:0|[1-9][0-9]{0,17}),[0-9]{2}$/;
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
  return negative ? -cents : cents;
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
  const observation = host.querySelector('[data-post-close-observation]');
  const submit = host.querySelector('[data-post-close-submit]');
  const reset = host.querySelector('[data-post-close-reset]');
  const status = host.querySelector('[data-post-close-status]');
  const resultHost = host.querySelector('[data-post-close-result]');
  const rows = host.querySelector('[data-post-close-rows]');
  const observationNote = host.querySelector('[data-post-close-observation-note]');
  const outputSelectors = [
    '[data-post-close-total-observed]', '[data-post-close-total-control]',
    '[data-post-close-total-difference]', '[data-post-close-observed-hash]',
    '[data-post-close-observed-bytes]', '[data-post-close-control-hash]',
    '[data-post-close-control-bytes]',
  ];
  const outputs = Object.fromEntries(outputSelectors.map((selector) => (
    [selector, host.querySelector(selector)]
  )));
  if (!form || !period || !jurisdiction || !observedFile || !controlFile || !observation
      || !submit || !reset || !status || !resultHost || !rows || !observationNote
      || Object.values(outputs).some((value) => !value)) return false;

  function setStatus(state, message) {
    status.dataset.state = state;
    status.textContent = message;
  }

  function clearResult() {
    resultHost.hidden = true;
    rows.replaceChildren();
    observation.required = false;
    for (const output of Object.values(outputs)) output.textContent = '—';
    observationNote.textContent = 'La observación sólo es obligatoria cuando existe diferencia.';
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
    observation.required = result.observationRequired;
    if (result.status === 'matched') {
      observationNote.textContent = 'Los conceptos coinciden al centavo para esta jurisdicción.';
      setStatus('ok', 'Coincidencia exacta. Este control local no aprueba ni cierra la liquidación.');
    } else if (result.status === 'difference_acknowledged') {
      observationNote.textContent = 'Se recibió una observación para esta ejecución local, pero su texto no se conserva. La diferencia sigue abierta.';
      setStatus('warning', 'Observación recibida. La diferencia no está conciliada ni documentada de forma durable.');
    } else {
      observationNote.textContent = 'Escribí una observación para satisfacer el requisito de esta revisión local; el texto no se conservará.';
      setStatus('error', 'Hay diferencias. La observación es obligatoria y no convierte el resultado en coincidencia.');
    }
    if (result.warnings.includes('SOURCE_BYTES_IDENTICAL')) {
      observationNote.textContent += ' Las dos fuentes tienen bytes idénticos; verificá que sean independientes.';
    }
    resultHost.hidden = false;
  }

  for (const element of [period, jurisdiction, observedFile, controlFile]) {
    element.addEventListener('change', () => {
      observation.value = '';
      clearResult();
      setStatus('', 'Contexto modificado. Ejecutá una nueva conciliación local.');
    });
  }

  reset.addEventListener('click', () => {
    form.reset();
    clearResult();
    setStatus('', 'Esperando período, jurisdicción y dos fuentes locales.');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const observed = observedFile.files && observedFile.files[0];
    const control = controlFile.files && controlFile.files[0];
    if (!observed || !control) {
      setStatus('error', 'Seleccioná las dos fuentes locales antes de conciliar.');
      return;
    }
    if (observed.size > PAYROLL_POST_CLOSE_MAX_FILE_BYTES
        || control.size > PAYROLL_POST_CLOSE_MAX_FILE_BYTES) {
      setStatus('error', 'Una fuente supera el límite local de 16 KiB.');
      return;
    }
    submit.disabled = true;
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
      if (result.inputRequirementsSatisfied) {
        observedFile.value = '';
        controlFile.value = '';
        observation.value = '';
      } else {
        observation.focus();
      }
    } catch (error) {
      const message = error instanceof PayrollPostCloseReconciliationError
        ? error.message : 'No se pudo completar la conciliación local.';
      clearResult();
      setStatus('error', message);
    } finally {
      if (observedBytes) observedBytes.fill(0);
      if (controlBytes) controlBytes.fill(0);
      submit.disabled = false;
    }
  });

  host.dataset.mounted = 'true';
  return true;
}

if (typeof document !== 'undefined') mountPayrollPostCloseReconciler(document);
