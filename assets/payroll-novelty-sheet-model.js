/** Native editable rows. Same ten-field contract and parser as individual/CSV entry. */
import { NoveltyReviewError, NOVELTY_REVIEW_MAX_ROWS } from './payroll-novelty-review.js';
export const SHEET_FIELDS = Object.freeze([
  'legajo', 'concepto', 'centro_costo', 'mes_ajuste', 'unidades', 'importe_ars',
  'movimiento', 'instrumento_legal', 'observacion', 'forzado',
]);
export function emptySheetRow(legajo = '', concepto = '', unidades = '') {
  return [legajo, concepto, '', '', unidades, '', '', '', '', 'NO'];
}
function assertRows(rows) {
  if (!Array.isArray(rows) || rows.length > NOVELTY_REVIEW_MAX_ROWS
      || rows.some(r => !Array.isArray(r) || r.length !== 10 || r.some(v => typeof v !== 'string'))) {
    throw Error('La planilla admite hasta 500 filas con diez campos de texto.');
  }
}
const businessKey = r => JSON.stringify([r.legajo, r.conceptSourceId, r.costCenterSourceId || '', r.adjustmentMonth || '', r.movementType || '']);
export function reviewSheetRows(rawRows, parseRow, periodMonth) {
  assertRows(rawRows);
  if (!rawRows.length) throw Error('Agregá al menos una novedad a la planilla.');
  const rows = [], issues = [], seen = new Map();
  rawRows.forEach((values, i) => {
    try {
      const row = parseRow([...values], i + 1, periodMonth), key = businessKey(row);
      if (seen.has(key)) issues.push({ rowOrdinal: i + 1, line: null, code: 'duplicate', message: `Duplica la fila ${seen.get(key)}: mismo legajo, concepto, centro, ajuste y movimiento.` });
      else seen.set(key, i + 1);
      rows.push(row);
    } catch (error) {
      issues.push({ rowOrdinal: i + 1, line: null, code: 'row', message: String(error.message || 'Fila inválida.').replace(/^Fila \d+:\s*/, '') });
    }
  });
  if (issues.length) { const error = new NoveltyReviewError(issues, rawRows.length); error.origin = 'screen'; throw error; }
  return rows;
}
/** One legajo per line: never reinterpret punctuation, ranges or scientific notation as IDs. */
export function appendSheetGroup(rows, { legajos, concepto = '', unidades = '' }) {
  assertRows(rows);
  if (typeof legajos !== 'string' || legajos.length > 12000) throw Error('La lista de legajos supera el tamaño permitido.');
  const tokens = legajos.trim().replace(/\r\n?/g, '\n').split('\n').map(s => s.trim());
  if (!legajos.trim()) throw Error('Ingresá un número de legajo por línea.');
  if (rows.length + tokens.length > NOVELTY_REVIEW_MAX_ROWS) throw Error('El lote completo admite hasta 500 filas.');
  if (typeof concepto !== 'string' || !/^(?:0|[1-9]\d{0,19})$/.test(concepto.trim())) throw Error('Ingresá un código de concepto válido.');
  if (typeof unidades !== 'string' || unidades.length > 24) throw Error('Las unidades superan el tamaño permitido.');
  const seen = new Set();
  for (const [i, token] of tokens.entries()) {
    if (!/^(?:0|[1-9]\d{0,19})$/.test(token)) throw Error(`Línea ${i + 1}: usá un legajo sin puntos, comas, espacios internos ni ceros iniciales.`);
    if (seen.has(token)) throw Error(`Línea ${i + 1}: el legajo ${token} está repetido. No se agregó ninguna fila.`);
    seen.add(token);
    if (rows.some(r => r[0].trim() === token && r[1].trim() === concepto.trim() && !r[2].trim() && !r[3].trim() && !r[6].trim())) {
      throw Error(`El legajo ${token} ya tiene ese concepto sin centro, ajuste ni movimiento en la planilla. Revisá la fila existente.`);
    }
  }
  return [...rows.map(r => [...r]), ...tokens.map(t => emptySheetRow(t, concepto.trim(), unidades.trim()))];
}
export function sheetPage(rows, page = 1, pageSize = 10) {
  assertRows(rows);
  if (!Number.isSafeInteger(page) || page < 1 || ![10, 25, 50].includes(pageSize)) throw Error('Página de edición inválida.');
  const pages = Math.max(1, Math.ceil(rows.length / pageSize)), current = Math.min(page, pages);
  return { rows: rows.slice((current - 1) * pageSize, current * pageSize).map(r => [...r]),
    page: current, pages, offset: (current - 1) * pageSize, total: rows.length };
}
