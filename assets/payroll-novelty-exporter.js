const CONTRACT_VERSION = 'payroll-novelty-batch.v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONTH = /^(?:19|20)[0-9]{2}-(?:0[1-9]|1[0-2])-01$/;
const INT64 = /^-?(?:0|[1-9][0-9]{0,18})$/;
const MAX_ROWS = 500;
const SOURCE_MODES = new Set(['individual', 'bulk']);
const PAYROLL_TYPES = new Set([
  'monthly', 'first_fortnight', 'sac', 'vacation', 'supplementary', 'final', 'other',
]);

function validMonth(value) {
  return MONTH.test(value) && value >= '2008-01-01' && value <= '2099-12-01';
}

export class PayrollNoveltyExportError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PayrollNoveltyExportError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new PayrollNoveltyExportError(code, message);
}

function text(value, maximum) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string' || value.length > maximum
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    fail('PAYROLL_NOVELTY_EXPORT_ROW_INVALID', 'La fila aprobada no cumple el contrato de exportación');
  }
  return value;
}

function integerText(value) {
  if (value === null || value === undefined || value === '') return '';
  const result = String(value);
  if (!INT64.test(result)) {
    fail('PAYROLL_NOVELTY_EXPORT_ROW_INVALID', 'El importe aprobado no es un entero canónico');
  }
  try {
    const integer = BigInt(result);
    if (result.startsWith('-') && integer === 0n) throw new Error();
    if (integer < -9223372036854775808n || integer > 9223372036854775807n) throw new Error();
  } catch {
    fail('PAYROLL_NOVELTY_EXPORT_ROW_INVALID', 'El importe aprobado excede int64');
  }
  return result;
}

function neutralizeSpreadsheetFormula(value) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value, { numeric = false } = {}) {
  const raw = value === null || value === undefined ? '' : String(value);
  const safe = numeric ? raw : neutralizeSpreadsheetFormula(raw);
  return /[;"\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

function canonicalRow(row, index, periodMonth) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    fail('PAYROLL_NOVELTY_EXPORT_ROW_INVALID', 'La exportación contiene una fila inválida');
  }
  const ordinal = Number(row.rowOrdinal);
  const legajo = text(row.legajo ?? row.legajoSnapshot, 20);
  const conceptSourceId = text(row.conceptSourceId, 20);
  const costCenterSourceId = text(row.costCenterSourceId, 20);
  const adjustmentMonth = text(row.adjustmentMonth, 10);
  const quantityDecimal = text(row.quantityDecimal, 32);
  const amountCents = integerText(row.amountCents);
  const movementType = text(row.movementType, 32);
  const legalInstrument = text(row.legalInstrument, 160);
  const observation = text(row.observation, 500);
  if (!Number.isSafeInteger(ordinal) || ordinal !== index + 1
      || !/^(?:0|[1-9]\d{0,19})$/.test(legajo)
      || !/^(?:0|[1-9]\d{0,19})$/.test(conceptSourceId)
      || (costCenterSourceId && !/^(?:0|[1-9]\d{0,19})$/.test(costCenterSourceId))
      || (adjustmentMonth && !validMonth(adjustmentMonth))
      || (adjustmentMonth && adjustmentMonth > periodMonth)
      || (quantityDecimal && !/^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(quantityDecimal))
      || quantityDecimal === '-0' || /^-0\.0+$/.test(quantityDecimal)
      || (!quantityDecimal && !amountCents)
      || (movementType && !/^[a-z0-9][a-z0-9._-]{0,31}$/.test(movementType))
      || (legalInstrument && legalInstrument.trim() !== legalInstrument)
      || (observation && observation.trim() !== observation)
      || (row.forced !== true && row.forced !== false)
      || (row.forced === true && (!amountCents || observation.length < 10))) {
    fail('PAYROLL_NOVELTY_EXPORT_ROW_INVALID', 'La fila aprobada no cumple el contrato de exportación');
  }
  return {
    ordinal,
    legajo,
    conceptSourceId,
    costCenterSourceId,
    adjustmentMonth,
    quantityDecimal,
    amountCents,
    movementType,
    legalInstrument,
    observation,
    forced: row.forced ? 'SI' : 'NO',
  };
}

export function createPayrollNoveltyCsv(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)
      || snapshot.contractVersion !== CONTRACT_VERSION
      || !UUID.test(String(snapshot.id || ''))
      || snapshot.status !== 'approved'
      || snapshot.exportable !== true
      || !SOURCE_MODES.has(snapshot.sourceMode)
      || !validMonth(String(snapshot.periodMonth || ''))
      || !PAYROLL_TYPES.has(snapshot.payrollType)
      || snapshot.grhMutation !== false
      || snapshot.payrollCalculated !== false
      || snapshot.payrollPosted !== false
      || !Array.isArray(snapshot.rows)
      || snapshot.rows.length < 1
      || snapshot.rows.length > MAX_ROWS
      || (snapshot.sourceMode === 'individual' && snapshot.rows.length !== 1)
      || (snapshot.rowCount !== undefined && snapshot.rowCount !== snapshot.rows.length)) {
    fail(
      'PAYROLL_NOVELTY_EXPORT_NOT_ALLOWED',
      'Sólo se exporta una instantánea aprobada y no contabilizada',
    );
  }
  const rows = snapshot.rows.map((row, index) => canonicalRow(
    row, index, snapshot.periodMonth,
  ));
  const header = [
    'periodo', 'tipo_liquidacion', 'orden', 'legajo', 'concepto', 'centro_costo',
    'mes_ajuste', 'unidades', 'importe_centavos', 'movimiento', 'instrumento_legal',
    'observacion', 'forzado', 'lote_municontrol',
  ];
  const lines = [header.join(';')];
  for (const row of rows) {
    lines.push([
      csvCell(snapshot.periodMonth),
      csvCell(snapshot.payrollType),
      csvCell(row.ordinal, { numeric: true }),
      csvCell(row.legajo, { numeric: true }),
      csvCell(row.conceptSourceId, { numeric: true }),
      csvCell(row.costCenterSourceId, { numeric: true }),
      csvCell(row.adjustmentMonth),
      csvCell(row.quantityDecimal, { numeric: true }),
      csvCell(row.amountCents, { numeric: true }),
      csvCell(row.movementType),
      csvCell(row.legalInstrument),
      csvCell(row.observation),
      csvCell(row.forced),
      csvCell(snapshot.id),
    ].join(';'));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function payrollNoveltyCsvFileName(snapshot) {
  const period = String(snapshot?.periodMonth || '').slice(0, 7);
  const id = String(snapshot?.id || '').slice(0, 8).toLowerCase();
  if (!/^\d{4}-\d{2}$/.test(period) || !/^[0-9a-f]{8}$/.test(id)) {
    fail('PAYROLL_NOVELTY_EXPORT_NOT_ALLOWED', 'La instantánea no posee identidad exportable');
  }
  return `novedades-aprobadas-${period}-${id}.csv`;
}

export function downloadPayrollNoveltyCsv(snapshot, documentRef = document) {
  const csv = createPayrollNoveltyCsv(snapshot);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = documentRef.createElement('a');
  anchor.href = url;
  anchor.download = payrollNoveltyCsvFileName(snapshot);
  anchor.rel = 'noopener';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return anchor.download;
}
