export const MONTHLY_CLOSE_LOCAL_PRECHECK_VERSION = 'monthly-close-local-precheck.v1';
export const MONTHLY_CLOSE_LOCAL_MAX_FILE_BYTES = 256 * 1024;

export const MONTHLY_CLOSE_LOCAL_HEADERS = Object.freeze({
  conceptStatistics: 'periodo;jurisdiccion;reparticion_codigo;concepto_codigo;ocurrencias;cantidad_centesimas;haberes_rem_centavos;haberes_no_rem_centavos;asignaciones_familiares_centavos;retenciones_centavos;contribuciones_centavos',
  bankSummary: 'periodo;jurisdiccion;reparticion_codigo;banco_codigo;tipo_cuenta;operaciones;importe_neto_centavos',
});

const PERIOD = /^(?:19|20)[0-9]{2}-(?:0[1-9]|1[0-2])$/;
const CODE = /^[0-9]{1,8}$/;
const INT64 = /^(?:0|-?[1-9][0-9]{0,18})$/;
const POSITIVE_INT = /^[1-9][0-9]{0,18}$/;
const MIN_INT64 = -9223372036854775808n;
const MAX_INT64 = 9223372036854775807n;
const MAX_INT32 = 2147483647n;
const JURISDICTIONS = Object.freeze(['42', '55']);
const ACCOUNT_TYPES = new Set([
  'cuenta_corriente', 'caja_ahorro', 'transferencia_especial',
]);
const INPUT_KEYS = new Set(['period', 'jurisdiction', 'conceptBytes', 'bankBytes']);

export class MonthlyCloseLocalPrecheckError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MonthlyCloseLocalPrecheckError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new MonthlyCloseLocalPrecheckError(code, message);
}

function exactInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some((key) => !INPUT_KEYS.has(key))
      || [...INPUT_KEYS].some((key) => !Object.hasOwn(value, key))) {
    fail('MONTHLY_CLOSE_LOCAL_INPUT_INVALID', 'El precontrol exige un contexto y dos fuentes exactas');
  }
}

function canonicalContext(input) {
  if (typeof input.period !== 'string' || !PERIOD.test(input.period)) {
    fail('MONTHLY_CLOSE_LOCAL_PERIOD_INVALID', 'El período debe usar YYYY-MM');
  }
  if (typeof input.jurisdiction !== 'string'
      || !JURISDICTIONS.includes(input.jurisdiction)) {
    fail('MONTHLY_CLOSE_LOCAL_JURISDICTION_INVALID', 'La jurisdicción debe ser 42 o 55');
  }
  return Object.freeze({ period: input.period, jurisdiction: input.jurisdiction });
}

function canonicalBytes(value) {
  let bytes;
  if (value instanceof Uint8Array) bytes = value;
  else if (value instanceof ArrayBuffer) bytes = new Uint8Array(value);
  else fail('MONTHLY_CLOSE_LOCAL_SOURCE_INVALID', 'Cada fuente debe aportar bytes locales');
  if (bytes.byteLength === 0) {
    fail('MONTHLY_CLOSE_LOCAL_SOURCE_EMPTY', 'La fuente local está vacía');
  }
  if (bytes.byteLength > MONTHLY_CLOSE_LOCAL_MAX_FILE_BYTES) {
    fail('MONTHLY_CLOSE_LOCAL_SOURCE_TOO_LARGE', 'La fuente supera el límite local de 256 KiB');
  }
  return bytes;
}

function sourceLines(bytes, expectedHeader, maxRows) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail('MONTHLY_CLOSE_LOCAL_ENCODING_INVALID', 'La fuente debe usar UTF-8 válido');
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text.includes('\u0000') || /\r(?!\n)/.test(text)
      || /[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) {
    fail('MONTHLY_CLOSE_LOCAL_SOURCE_INVALID', 'La fuente contiene caracteres no permitidos');
  }
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.length < 2 || lines.length > maxRows + 1
      || lines.some((line) => line.length === 0 || line.length > 4096)) {
    fail('MONTHLY_CLOSE_LOCAL_ROW_COUNT_INVALID', 'La cantidad o longitud de filas no coincide con el contrato');
  }
  if (lines[0] !== expectedHeader) {
    fail('MONTHLY_CLOSE_LOCAL_HEADER_INVALID', 'El encabezado no coincide con el contrato seleccionado');
  }
  return lines.slice(1);
}

function exactCells(line, count) {
  const cells = line.split(';');
  if (cells.length !== count || cells.some((cell) => cell.trim() !== cell)) {
    fail('MONTHLY_CLOSE_LOCAL_ROW_INVALID', 'Una fila no coincide con el contrato canónico');
  }
  return cells;
}

function assertRowContext(period, jurisdiction, context) {
  if (period !== context.period) {
    fail('MONTHLY_CLOSE_LOCAL_PERIOD_MISMATCH', 'La fuente no pertenece al período seleccionado');
  }
  if (jurisdiction !== context.jurisdiction) {
    fail('MONTHLY_CLOSE_LOCAL_JURISDICTION_MISMATCH', 'La fuente no pertenece a la jurisdicción seleccionada');
  }
}

function canonicalCode(value) {
  if (!CODE.test(value)) {
    fail('MONTHLY_CLOSE_LOCAL_CODE_INVALID', 'Un código no usa el formato numérico esperado');
  }
  return value;
}

function canonicalInt64(value, { positive = false } = {}) {
  if (!(positive ? POSITIVE_INT : INT64).test(value)) {
    fail('MONTHLY_CLOSE_LOCAL_INTEGER_INVALID', 'Un importe o cantidad no usa el formato entero canónico');
  }
  const parsed = BigInt(value);
  if (parsed < MIN_INT64 || parsed > MAX_INT64) {
    fail('MONTHLY_CLOSE_LOCAL_INTEGER_OUT_OF_RANGE', 'Un entero excede el rango admitido');
  }
  return parsed;
}

function checkedInt64(value) {
  if (value < MIN_INT64 || value > MAX_INT64) {
    fail(
      'MONTHLY_CLOSE_LOCAL_INTEGER_OVERFLOW',
      'Una suma o diferencia excede el rango entero admitido',
    );
  }
  return value;
}

function checkedAddInt64(left, right) {
  return checkedInt64(left + right);
}

function canonicalPositiveInt32(value) {
  const parsed = canonicalInt64(value, { positive: true });
  if (parsed > MAX_INT32) {
    fail('MONTHLY_CLOSE_LOCAL_COUNT_INVALID', 'Una cantidad excede el rango admitido');
  }
  return parsed;
}

function addCents(target, key, value) {
  target.set(key, checkedAddInt64(target.get(key) || 0n, value));
}

function parseConceptStatistics(bytes, context) {
  const rows = sourceLines(bytes, MONTHLY_CLOSE_LOCAL_HEADERS.conceptStatistics, 5000);
  const seen = new Set();
  const byRepartition = new Map();
  for (const line of rows) {
    const cells = exactCells(line, 11);
    assertRowContext(cells[0], cells[1], context);
    const repartitionCode = canonicalCode(cells[2]);
    const conceptCode = canonicalCode(cells[3]);
    const key = `${repartitionCode}:${conceptCode}`;
    if (seen.has(key)) {
      fail('MONTHLY_CLOSE_LOCAL_ROW_DUPLICATED', 'La estadística repite una repartición y concepto');
    }
    seen.add(key);
    canonicalPositiveInt32(cells[4]);
    const quantity = canonicalInt64(cells[5]);
    const haberesRem = canonicalInt64(cells[6]);
    const haberesNoRem = canonicalInt64(cells[7]);
    const asignaciones = canonicalInt64(cells[8]);
    const retenciones = canonicalInt64(cells[9]);
    const contribuciones = canonicalInt64(cells[10]);
    if (quantity === 0n
        && [haberesRem, haberesNoRem, asignaciones, retenciones, contribuciones]
          .every((value) => value === 0n)) {
      fail('MONTHLY_CLOSE_LOCAL_EMPTY_AGGREGATE', 'Una fila agregada no informa cantidades');
    }
    const reportedNet = checkedInt64(
      haberesRem + haberesNoRem + asignaciones - retenciones,
    );
    addCents(byRepartition, repartitionCode, reportedNet);
  }
  return Object.freeze({ recordCount: rows.length, byRepartition });
}

function parseBankSummary(bytes, context) {
  const rows = sourceLines(bytes, MONTHLY_CLOSE_LOCAL_HEADERS.bankSummary, 1000);
  const seen = new Set();
  const byRepartition = new Map();
  for (const line of rows) {
    const cells = exactCells(line, 7);
    assertRowContext(cells[0], cells[1], context);
    const repartitionCode = canonicalCode(cells[2]);
    const bankCode = canonicalCode(cells[3]);
    if (!ACCOUNT_TYPES.has(cells[4])) {
      fail('MONTHLY_CLOSE_LOCAL_ACCOUNT_TYPE_INVALID', 'El tipo de cuenta no pertenece al contrato');
    }
    const key = `${repartitionCode}:${bankCode}:${cells[4]}`;
    if (seen.has(key)) {
      fail('MONTHLY_CLOSE_LOCAL_ROW_DUPLICATED', 'El resumen bancario repite un grupo');
    }
    seen.add(key);
    canonicalPositiveInt32(cells[5]);
    addCents(byRepartition, repartitionCode, canonicalInt64(cells[6], { positive: true }));
  }
  return Object.freeze({ recordCount: rows.length, byRepartition });
}

async function rawSha256(bytes, cryptoImpl) {
  if (!cryptoImpl?.subtle || typeof cryptoImpl.subtle.digest !== 'function') {
    fail('MONTHLY_CLOSE_LOCAL_CRYPTO_UNAVAILABLE', 'SHA-256 local no está disponible');
  }
  let digest;
  try {
    digest = await cryptoImpl.subtle.digest('SHA-256', bytes);
  } catch {
    fail('MONTHLY_CLOSE_LOCAL_CRYPTO_UNAVAILABLE', 'SHA-256 local no está disponible');
  }
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function reconciliationRows(conceptTotals, bankTotals) {
  const repartitions = [...new Set([...conceptTotals.keys(), ...bankTotals.keys()])]
    .sort((left, right) => left.localeCompare(right, 'en', { numeric: true }));
  return Object.freeze(repartitions.map((repartitionCode) => {
    const conceptValue = conceptTotals.get(repartitionCode);
    const bankValue = bankTotals.get(repartitionCode);
    let issueCode = null;
    if (conceptValue === undefined) issueCode = 'MISSING_CONCEPT_STATISTICS';
    else if (bankValue === undefined) issueCode = 'MISSING_BANK_SUMMARY';
    const difference = conceptValue === undefined || bankValue === undefined
      ? null : checkedInt64(conceptValue - bankValue);
    if (difference !== null && difference !== 0n) issueCode = 'NET_MISMATCH';
    return Object.freeze({
      repartitionCode,
      reportedEarningsLessRetentionsCents: conceptValue?.toString() ?? null,
      reportedBankNetCents: bankValue?.toString() ?? null,
      differenceCents: difference?.toString() ?? null,
      matches: difference === 0n,
      issueCode,
    });
  }));
}

/**
 * Local, aggregate-only arithmetic precheck. It neither certifies provenance
 * nor generates bank, Tribunal, payroll or fiscal artifacts.
 */
export async function prepareMonthlyCloseLocalPrecheck(input, options = {}) {
  exactInput(input);
  const context = canonicalContext(input);
  const conceptBytes = canonicalBytes(input.conceptBytes);
  const bankBytes = canonicalBytes(input.bankBytes);
  const concepts = parseConceptStatistics(conceptBytes, context);
  const bank = parseBankSummary(bankBytes, context);
  const cryptoImpl = options.cryptoImpl ?? globalThis.crypto;
  const [conceptSha256, bankSha256] = await Promise.all([
    rawSha256(conceptBytes, cryptoImpl), rawSha256(bankBytes, cryptoImpl),
  ]);
  const comparisons = reconciliationRows(concepts.byRepartition, bank.byRepartition);
  const conceptTotal = [...concepts.byRepartition.values()]
    .reduce((total, value) => checkedAddInt64(total, value), 0n);
  const bankTotal = [...bank.byRepartition.values()]
    .reduce((total, value) => checkedAddInt64(total, value), 0n);
  const totalDifference = checkedInt64(conceptTotal - bankTotal);
  const matched = comparisons.length > 0 && comparisons.every((row) => row.matches);
  return Object.freeze({
    contractVersion: MONTHLY_CLOSE_LOCAL_PRECHECK_VERSION,
    period: context.period,
    jurisdiction: context.jurisdiction,
    status: matched ? 'matched' : 'blocked',
    readyForReview: matched,
    formula: 'haberes_rem + haberes_no_rem + asignaciones_familiares - retenciones',
    toleranceCents: '0',
    rulesInferred: false,
    comparisons,
    totals: Object.freeze({
      reportedEarningsLessRetentionsCents: conceptTotal.toString(),
      reportedBankNetCents: bankTotal.toString(),
      differenceCents: totalDifference.toString(),
    }),
    sources: Object.freeze({
      conceptStatistics: Object.freeze({
        sha256: conceptSha256,
        byteLength: conceptBytes.byteLength,
        recordCount: concepts.recordCount,
      }),
      bankSummary: Object.freeze({
        sha256: bankSha256,
        byteLength: bankBytes.byteLength,
        recordCount: bank.recordCount,
      }),
    }),
    includesPersonalRecords: false,
    provenanceVerified: false,
    persistencePerformed: false,
    governmentSummaryCompared: false,
    payrollCalculated: false,
    payrollPosted: false,
    closeApproved: false,
    bankArtifactGenerated: false,
    tribunalArtifactGenerated: false,
    fiscalArtifactGenerated: false,
  });
}

export function formatMonthlyCloseCents(value) {
  const stringValue = String(value);
  try {
    canonicalInt64(stringValue);
  } catch {
    fail('MONTHLY_CLOSE_LOCAL_CENTS_INVALID', 'El resultado no contiene centavos válidos');
  }
  const negative = stringValue.startsWith('-');
  const digits = (negative ? stringValue.slice(1) : stringValue).padStart(3, '0');
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

function issueLabel(row) {
  if (row.issueCode === 'MISSING_CONCEPT_STATISTICS') return 'Falta estadística';
  if (row.issueCode === 'MISSING_BANK_SUMMARY') return 'Falta acreditación';
  if (row.issueCode === 'NET_MISMATCH') return 'Diferencia';
  return 'Coincide';
}

export function mountMonthlyCloseLocalPrecheck(root = document) {
  const host = root.querySelector('[data-monthly-close-precheck]');
  if (!host || host.dataset.mounted === 'true') return false;
  const form = host.querySelector('[data-monthly-close-form]');
  const period = host.querySelector('[data-monthly-close-period]');
  const jurisdiction = host.querySelector('[data-monthly-close-jurisdiction]');
  const conceptFile = host.querySelector('[data-monthly-close-concept-file]');
  const bankFile = host.querySelector('[data-monthly-close-bank-file]');
  const conceptState = host.querySelector('[data-monthly-close-concept-state]');
  const bankState = host.querySelector('[data-monthly-close-bank-state]');
  const submit = host.querySelector('[data-monthly-close-submit]');
  const reset = host.querySelector('[data-monthly-close-reset]');
  const status = host.querySelector('[data-monthly-close-status]');
  const errorSummary = host.querySelector('[data-monthly-close-errors]');
  const errorList = host.querySelector('[data-monthly-close-error-list]');
  const result = host.querySelector('[data-monthly-close-result]');
  const rows = host.querySelector('[data-monthly-close-rows]');
  const totalConcept = host.querySelector('[data-monthly-close-total-concept]');
  const totalBank = host.querySelector('[data-monthly-close-total-bank]');
  const totalDifference = host.querySelector('[data-monthly-close-total-difference]');
  const evidence = host.querySelector('[data-monthly-close-evidence]');
  let operationSequence = 0;
  if (!form || !period || !jurisdiction || !conceptFile || !bankFile
      || !conceptState || !bankState || !submit || !reset || !status
      || !errorSummary || !errorList || !result || !rows || !totalConcept
      || !totalBank || !totalDifference || !evidence) return false;

  function setStatus(state, message) {
    status.dataset.state = state;
    status.textContent = message;
  }

  function updateFileState(input, output) {
    const file = input.files && input.files[0];
    if (!file) {
      output.dataset.state = '';
      output.textContent = 'No hay un archivo seleccionado.';
      input.setAttribute('aria-invalid', 'false');
      return;
    }
    const tooLarge = file.size > MONTHLY_CLOSE_LOCAL_MAX_FILE_BYTES;
    output.dataset.state = tooLarge ? 'error' : 'ready';
    output.textContent = tooLarge
      ? `Archivo seleccionado · ${file.size} bytes · supera el máximo de 256 KiB.`
      : `Archivo seleccionado · ${file.size} bytes.`;
    input.setAttribute('aria-invalid', String(tooLarge));
  }

  function clearResult() {
    result.hidden = true;
    rows.replaceChildren();
    totalConcept.textContent = '—';
    totalBank.textContent = '—';
    totalDifference.textContent = '—';
    evidence.textContent = 'Sin huellas calculadas.';
  }

  function clearErrors() {
    errorSummary.hidden = true;
    errorList.replaceChildren();
    for (const element of [period, jurisdiction, conceptFile, bankFile]) {
      element.setAttribute('aria-invalid', 'false');
    }
  }

  function showErrors(entries) {
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

  function render(precheck) {
    rows.replaceChildren();
    for (const comparison of precheck.comparisons) {
      const row = document.createElement('tr');
      appendCell(row, comparison.repartitionCode, '', 'Repartición');
      appendCell(
        row,
        comparison.reportedEarningsLessRetentionsCents === null
          ? 'No informado'
          : formatMonthlyCloseCents(comparison.reportedEarningsLessRetentionsCents),
        'numeric',
        'Haberes menos retenciones',
      );
      appendCell(
        row,
        comparison.reportedBankNetCents === null
          ? 'No informado' : formatMonthlyCloseCents(comparison.reportedBankNetCents),
        'numeric',
        'Neto bancario',
      );
      appendCell(
        row,
        comparison.differenceCents === null
          ? 'No comparable' : formatMonthlyCloseCents(comparison.differenceCents),
        'numeric',
        'Diferencia',
      );
      appendCell(row, issueLabel(comparison), '', 'Estado');
      rows.appendChild(row);
    }
    totalConcept.textContent = formatMonthlyCloseCents(
      precheck.totals.reportedEarningsLessRetentionsCents,
    );
    totalBank.textContent = formatMonthlyCloseCents(precheck.totals.reportedBankNetCents);
    totalDifference.textContent = formatMonthlyCloseCents(precheck.totals.differenceCents);
    evidence.textContent = `${precheck.sources.conceptStatistics.recordCount} filas de conceptos · ${precheck.sources.bankSummary.recordCount} filas bancarias · ${precheck.sources.conceptStatistics.sha256} · ${precheck.sources.bankSummary.sha256}`;
    setStatus(
      precheck.readyForReview ? '' : 'error',
      precheck.readyForReview
        ? 'Coincidencia exacta por repartición. Resultado local listo para revisión humana.'
        : 'Control bloqueado: hay diferencias o reparticiones ausentes.',
    );
    result.hidden = false;
  }

  for (const input of [period, jurisdiction, conceptFile, bankFile]) {
    input.addEventListener('change', () => {
      operationSequence += 1;
      clearErrors();
      if (input === conceptFile) updateFileState(conceptFile, conceptState);
      if (input === bankFile) updateFileState(bankFile, bankState);
      clearResult();
      setStatus('', 'Contexto modificado. Ejecutá nuevamente el precontrol local.');
    });
  }

  reset.addEventListener('click', () => {
    operationSequence += 1;
    form.reset();
    clearErrors();
    updateFileState(conceptFile, conceptState);
    updateFileState(bankFile, bankState);
    clearResult();
    setStatus('', 'Esperando período, jurisdicción y dos fuentes agregadas.');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors();
    const concept = conceptFile.files && conceptFile.files[0];
    const bank = bankFile.files && bankFile.files[0];
    const missing = [];
    if (!period.value) missing.push({ element: period, message: 'Seleccioná el período.' });
    if (!jurisdiction.value) missing.push({ element: jurisdiction, message: 'Seleccioná la jurisdicción.' });
    if (!concept) missing.push({ element: conceptFile, message: 'Elegí la estadística agregada de conceptos.' });
    if (!bank) missing.push({ element: bankFile, message: 'Elegí el resumen agregado de acreditación.' });
    if (missing.length > 0) {
      showErrors(missing);
      setStatus('error', 'Faltan datos requeridos. Revisá el resumen de errores.');
      return;
    }
    const oversized = [];
    if (concept.size > MONTHLY_CLOSE_LOCAL_MAX_FILE_BYTES) {
      oversized.push({ element: conceptFile, message: 'La estadística supera 256 KiB.' });
    }
    if (bank.size > MONTHLY_CLOSE_LOCAL_MAX_FILE_BYTES) {
      oversized.push({ element: bankFile, message: 'El resumen bancario supera 256 KiB.' });
    }
    if (oversized.length > 0) {
      showErrors(oversized);
      setStatus('error', 'Una fuente supera el límite local.');
      return;
    }
    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');
    setStatus('', 'Validando contratos y conciliando centavos exactos por repartición…');
    const currentOperation = ++operationSequence;
    let conceptBytes;
    let bankBytes;
    try {
      conceptBytes = new Uint8Array(await concept.arrayBuffer());
      bankBytes = new Uint8Array(await bank.arrayBuffer());
      const precheck = await prepareMonthlyCloseLocalPrecheck({
        period: period.value,
        jurisdiction: jurisdiction.value,
        conceptBytes,
        bankBytes,
      });
      if (currentOperation !== operationSequence) return;
      render(precheck);
      conceptFile.value = '';
      bankFile.value = '';
      updateFileState(conceptFile, conceptState);
      updateFileState(bankFile, bankState);
    } catch (error) {
      if (currentOperation !== operationSequence) return;
      clearResult();
      showErrors([
        { element: conceptFile, message: 'Revisá el contrato y contenido de la estadística.' },
        { element: bankFile, message: 'Revisá el contrato y contenido del resumen bancario.' },
      ]);
      setStatus(
        'error',
        error instanceof MonthlyCloseLocalPrecheckError
          ? error.message : 'No se pudo completar el precontrol mensual.',
      );
    } finally {
      if (conceptBytes) conceptBytes.fill(0);
      if (bankBytes) bankBytes.fill(0);
      submit.disabled = false;
      submit.removeAttribute('aria-busy');
    }
  });

  host.dataset.mounted = 'true';
  return true;
}

if (typeof document !== 'undefined') mountMonthlyCloseLocalPrecheck(document);
