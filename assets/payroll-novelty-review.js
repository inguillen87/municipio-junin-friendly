/** Local review only. Never drops an invalid row into a partially accepted draft. */
export const NOVELTY_CSV_HEADER = Object.freeze([
  'legajo', 'concepto', 'centro_costo', 'mes_ajuste', 'unidades', 'importe_ars',
  'movimiento', 'instrumento_legal', 'observacion', 'forzado',
]);
export const NOVELTY_REVIEW_MAX_ROWS = 500;
export const NOVELTY_REVIEW_MAX_BYTES = 480 * 1024;

export class NoveltyReviewError extends Error {
  constructor(issues, rowCount = 0) {
    super(`${issues.length} incidencia${issues.length === 1 ? '' : 's'}: corregí la carga completa antes de guardar.`);
    this.name = 'NoveltyReviewError';
    this.issues = issues;
    this.rowCount = rowCount;
  }
}

function fail(message, line = 1) {
  throw new NoveltyReviewError([{ rowOrdinal: null, line, code: 'structure', message }]);
}

/** Strict semicolon CSV, including BOM, escaped quotes and quoted newlines. */
export function noveltyCsvRecords(raw) {
  if (typeof raw !== 'string' || !raw.trim()) fail('Pegá o cargá un CSV antes de validar.');
  if (new TextEncoder().encode(raw).byteLength > NOVELTY_REVIEW_MAX_BYTES) fail('El archivo supera 480 KiB.');
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const records = [];
  let cells = [], value = '', quoted = false, closed = false, line = 1, startLine = 1;
  const cell = () => { cells.push(value); value = ''; closed = false; };
  const record = () => {
    cell(); records.push({ cells, line: startLine }); cells = [];
    if (records.length > NOVELTY_REVIEW_MAX_ROWS + 1) fail('El lote admite hasta 500 filas.', startLine);
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { value += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else { value += c; if (c === '\n') line++; }
    } else if (c === ';') cell();
    else if (c === '\n') { record(); line++; startLine = line; }
    else if (c === '"' && value === '' && !closed) quoted = true;
    else if (c === '"' || closed) fail('Comillas inválidas: revisá el cierre y los separadores del CSV.', line);
    else value += c;
  }
  if (quoted) fail('Hay una comilla sin cerrar en el archivo.', startLine);
  if (value !== '' || cells.length || closed) record();
  const header = records.shift()?.cells.map(c => c.trim().toLowerCase());
  if (JSON.stringify(header) !== JSON.stringify(NOVELTY_CSV_HEADER)) {
    fail(`El encabezado debe ser: ${NOVELTY_CSV_HEADER.join(';')}`);
  }
  if (!records.length) fail('El lote debe tener entre 1 y 500 filas.');
  return records;
}

export function reviewNoveltyCsv(raw, parseRow, periodMonth) {
  const records = noveltyCsvRecords(raw), rows = [], issues = [], seen = new Map();
  records.forEach((record, index) => {
    const ordinal = index + 1;
    try {
      if (record.cells.length !== NOVELTY_CSV_HEADER.length) throw Error('Cantidad de columnas inválida; se esperan 10.');
      const row = parseRow(record.cells, ordinal, periodMonth);
      const key = JSON.stringify([row.legajo, row.conceptSourceId, row.costCenterSourceId || '', row.adjustmentMonth || '', row.movementType || '']);
      if (seen.has(key)) {
        issues.push({ rowOrdinal: ordinal, line: record.line, code: 'duplicate', message: `Duplica la fila ${seen.get(key)}: mismo legajo, concepto, centro, ajuste y movimiento.` });
      } else seen.set(key, ordinal);
      rows.push(row);
    } catch (error) {
      issues.push({ rowOrdinal: ordinal, line: record.line, code: 'row', message: String(error.message || 'Fila inválida.').replace(/^Fila \d+:\s*/, '') });
    }
  });
  if (issues.length) throw new NoveltyReviewError(issues, records.length);
  return rows;
}

const fold = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function noveltyReviewPage(rows, { search = '', kind = 'all', concept = 'all', page = 1, pageSize = 25 } = {}) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > NOVELTY_REVIEW_MAX_ROWS) throw Error('Lote de revisión inválido.');
  if (!Object.hasOwn(NOVELTY_REVIEW_KINDS, kind) || typeof concept !== 'string' || (concept !== 'all' && !SOURCE_ID.test(concept)) || ![25, 50, 100].includes(pageSize)
      || !Number.isSafeInteger(page) || page < 1 || typeof search !== 'string' || search.length > 100) throw Error('Filtro de revisión inválido.');
  const q = fold(search.trim());
  const filtered = rows.filter(r => (kind === 'all' || kind === 'missing' && r.amountCents === null
      || kind === 'manual' && r.amountCents !== null || kind === 'forced' && r.forced
      || kind === 'zero' && r.amountCents === '0' || kind === 'negative' && typeof r.amountCents === 'string' && r.amountCents.startsWith('-')
      || kind === 'adjustment' && r.adjustmentMonth !== null)
    && (concept === 'all' || r.conceptSourceId === concept)
    && (!q || fold([r.legajo, r.conceptSourceId, r.costCenterSourceId, r.legalInstrument, r.observation].join(' ')).includes(q)));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize)), current = Math.min(page, pages);
  return {
    rows: filtered.slice((current - 1) * pageSize, current * pageSize), total: rows.length,
    filtered: filtered.length, page: current, pages, first: filtered.length ? (current - 1) * pageSize + 1 : 0,
    last: Math.min(current * pageSize, filtered.length),
    distinctLegajos: new Set(rows.map(r => r.legajo)).size,
    missing: rows.filter(r => r.amountCents === null).length,
    manual: rows.filter(r => r.amountCents !== null).length,
    forced: rows.filter(r => r.forced).length,
  };
}

const csvCell = value => '"' + String(value ?? '').replace(/^[\s\u0000-\u001f]*[=+@-]/, "'$&").replaceAll('"', '""') + '"';
export function noveltyIssuesCsv(issues) {
  if (!Array.isArray(issues) || !issues.length || issues.length > NOVELTY_REVIEW_MAX_ROWS) throw Error('Incidencias inválidas.');
  return '\ufeff' + [['Fila de datos', 'Línea del CSV', 'Código', 'Incidencia'], ...issues.map(i => [i.rowOrdinal, i.line, i.code, i.message])]
    .map(r => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}


/** Draft arithmetic, not a payroll calculation or an authorization to pay. */
export const NOVELTY_REVIEW_KINDS = Object.freeze({
  all: 'Todas las filas', missing: 'Sin importe informado', manual: 'Con importe informado',
  forced: 'Forzadas', zero: 'Importe explícito en cero', negative: 'Importe negativo', adjustment: 'Con mes de ajuste',
});
const SOURCE_ID = /^(?:0|[1-9]\d{0,19})$/;
const CENTS = /^-?(?:0|[1-9]\d{0,17})$/;
function checkedReviewRows(rows) {
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > NOVELTY_REVIEW_MAX_ROWS) throw Error('Lote de control inválido.');
  const ordinals = new Set();
  for (const row of rows) {
    if (!row || !Number.isSafeInteger(row.rowOrdinal) || row.rowOrdinal < 1 || row.rowOrdinal > NOVELTY_REVIEW_MAX_ROWS
      || ordinals.has(row.rowOrdinal) || typeof row.legajo !== 'string' || !SOURCE_ID.test(row.legajo)
      || typeof row.conceptSourceId !== 'string' || !SOURCE_ID.test(row.conceptSourceId)
      || (row.amountCents !== null && (typeof row.amountCents !== 'string' || !CENTS.test(row.amountCents) || row.amountCents === '-0'))
      || typeof row.forced !== 'boolean' || (row.forced && row.amountCents === null)
      || (row.adjustmentMonth !== null && (typeof row.adjustmentMonth !== 'string'
        || !/^20[0-9]{2}-(?:0[1-9]|1[0-2])-01$/.test(row.adjustmentMonth) || row.adjustmentMonth < '2008-01-01'))) throw Error('Fila de control no verificable.');
    ordinals.add(row.rowOrdinal);
  }
}
export function noveltyBatchControl(rows) {
  checkedReviewRows(rows);
  function summary(selected) {
    let sum = 0n;
    for (const row of selected) if (row.amountCents !== null) sum += BigInt(row.amountCents);
    const missing = selected.filter(row => row.amountCents === null).length;
    return { rows: selected.length, distinctLegajos: new Set(selected.map(row => row.legajo)).size,
      missing, manual: selected.length - missing, forced: selected.filter(row => row.forced).length,
      zero: selected.filter(row => row.amountCents === '0').length,
      negative: selected.filter(row => row.amountCents !== null && row.amountCents.startsWith('-')).length,
      adjustments: selected.filter(row => row.adjustmentMonth !== null).length,
      knownAmountCents: sum.toString(), completeAmountCents: missing ? null : sum.toString() };
  }
  const grouped = new Map();
  for (const row of rows) { if (!grouped.has(row.conceptSourceId)) grouped.set(row.conceptSourceId, []); grouped.get(row.conceptSourceId).push(row); }
  const concepts = [...grouped].sort(([a], [b]) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0)
    .map(([conceptSourceId, selected]) => Object.freeze({ conceptSourceId, ...summary(selected) }));
  return Object.freeze({ version: 'novelty-draft-control.v1', ...summary(rows), concepts: Object.freeze(concepts),
    scope: 'complete_validated_draft', saved: false, payrollCalculated: false, payrollPosted: false,
    quantitiesSummed: false });
}
function controlAmount(cents) {
  const value = BigInt(cents), abs = (value < 0n ? -value : value).toString().padStart(3, '0');
  return (value < 0n ? '-' : '') + abs.slice(0, -2) + '.' + abs.slice(-2);
}
export function noveltyControlCsv(rows) {
  const summary = noveltyBatchControl(rows);
  const header = ['Nivel', 'Concepto', 'Filas', 'Legajos distintos', 'Con importe', 'Sin importe', 'Forzadas',
    'En cero', 'Negativas', 'Con mes de ajuste', 'Suma aritmética informada ARS', 'Cobertura de importes', 'Alcance'];
  const scope = 'Control local antes de guardar. No es liquidación, aprobación ni pago. No sumar LOTE y CONCEPTO ni legajos entre conceptos.';
  const values = (level, code, s) => [level, code, s.rows, s.distinctLegajos, s.manual, s.missing, s.forced, s.zero,
    s.negative, s.adjustments, controlAmount(s.knownAmountCents), s.missing ? 'Parcial: faltan importes' : 'Todos informados: no implica neto ni aprobación', scope];
  return '\ufeff' + [header, values('LOTE', 'Todos', summary), ...summary.concepts.map(c => values('CONCEPTO', c.conceptSourceId, c))]
    .map(row => row.map(value => {
      const raw = String(value ?? '');
      return csvCell(/^-?\d+(?:\.\d+)?$/.test(raw) && raw.replace(/[-.]/g, '').length > 15 ? "'" + raw : raw);
    }).join(';')).join('\r\n') + '\r\n';
}
