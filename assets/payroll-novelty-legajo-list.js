/** Pure preparation helpers. No employee lookup, inferred identity or payroll mutation. */
export const LEGAJO_LIST_MAX_ROWS = 500;
export const LEGAJO_LIST_MAX_CHARS = 12000;
const canonicalLegajo = /^(?:0|[1-9]\d{0,19})$/;

/** Analyze the complete input. Invalid/repeated items are never silently discarded. */
export function analyzeLegajoList(raw, existingLegajos = [], maximum = LEGAJO_LIST_MAX_ROWS) {
  if (typeof raw !== 'string' || !Array.isArray(existingLegajos)
      || !Number.isSafeInteger(maximum) || maximum < 1 || maximum > LEGAJO_LIST_MAX_ROWS
      || existingLegajos.length > maximum || existingLegajos.some(id => typeof id !== 'string' || !canonicalLegajo.test(id))) {
    throw new Error('La lista de preparación no es válida.');
  }
  const remaining = maximum - existingLegajos.length;
  const error = message => ({ items: [], count: 0, remaining, issues: [{ position: null, message }], ready: false });
  if (raw.length > LEGAJO_LIST_MAX_CHARS) return error('El texto supera 12.000 caracteres. Pegá sólo los legajos.');
  if (!raw.trim()) return { items: [], count: 0, remaining, issues: [], ready: false };
  // Deliberately do not remove punctuation, expand ranges or coerce to Number.
  const items = raw.trim().split(/[\s,;]+/u);
  if (items.length > maximum) return error(`La lista supera el máximo de ${maximum} legajos por lote.`);
  const seen = new Map(), existing = new Set(existingLegajos), issues = [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index], position = index + 1;
    if (!canonicalLegajo.test(item)) {
      issues.push({ position, message: 'Legajo inválido: usá el código completo, sin nombres, rangos, puntos ni ceros iniciales.' });
    } else if (existing.has(item)) {
      issues.push({ position, message: `El legajo ${item} ya está en el lote.` });
    } else if (seen.has(item)) {
      issues.push({ position, message: `El legajo ${item} repite la posición ${seen.get(item)} de esta lista.` });
    } else seen.set(item, position);
  }
  if (items.length > remaining) issues.push({ position: null, message: `Quedan ${remaining} lugares en el lote y la lista contiene ${items.length} legajos.` });
  return { items, count: items.length, remaining, issues, ready: items.length > 0 && issues.length === 0 };
}

/** Return a new array only after every candidate has been parsed and duplicate checked. */
export function appendLegajoList({ raw, existingRows, commonValues, periodMonth, parseRow, maximum = LEGAJO_LIST_MAX_ROWS }) {
  if (!Array.isArray(existingRows) || !Array.isArray(commonValues) || commonValues.length !== 9 || typeof parseRow !== 'function') {
    throw new Error('La novedad común no está preparada.');
  }
  const analysis = analyzeLegajoList(raw, existingRows.map(row => row.legajo), maximum);
  if (!analysis.ready) throw new Error(analysis.issues[0]?.message || 'Pegá al menos un legajo antes de agregar la lista.');
  const added = analysis.items.map((legajo, index) => parseRow([legajo, ...commonValues], existingRows.length + index + 1, periodMonth));
  return [...existingRows, ...added];
}

export function filterAgileRows(rows, search = '') {
  if (!Array.isArray(rows) || rows.length > LEGAJO_LIST_MAX_ROWS || typeof search !== 'string' || search.length > 20) {
    throw new Error('El filtro de legajos no es válido.');
  }
  const q = search.trim();
  return rows.map((row, index) => ({ row, index })).filter(({ row }) => !q || row.legajo.includes(q));
}
