/** Compare conserved source totals. This module never recalculates payroll. */
import { payrollSourceReport } from './payroll-source-report-model.js';
import { civilDate } from './civil-date.js';
import { DOCUMENT_TYPES } from './payroll-document-library-model.js';

const trusted = new WeakSet();
const MAX_CENTS = 999999999999999n;
const GROUPS = ['concepts', 'totals', 'all'];
const CHANGES = ['all', 'changed', 'review', 'unchanged'];
const SORTS = ['code', 'difference'];
const fold = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const totalizer = code => Number(code) >= 990 && Number(code) <= 999;
const cents = value => BigInt(value.replace('.', ''));
const absolute = value => value < 0n ? -value : value;
const decimal = value => `${value < 0n ? '-' : ''}${absolute(value) / 100n}.${String(absolute(value) % 100n).padStart(2, '0')}`;
const compareCode = (a, b) => Number(a.code) - Number(b.code) || a.code.localeCompare(b.code);
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

export function comparisonTypeLabel(type) { return DOCUMENT_TYPES[type] || `Tipo ${type} (origen)`; }
export function comparisonClosureLabel(state) {
  return { closed: 'Cierre informado', open: 'Abierta / preliquidación', unknown: 'Cierre no informado' }[state];
}
export function comparisonMoney(value) {
  if (value === null) return 'No informado';
  const n = cents(value);
  return `${n < 0n ? '-' : ''}$ ${new Intl.NumberFormat('es-AR').format(absolute(n) / 100n)},${String(absolute(n) % 100n).padStart(2, '0')}`;
}
function source(raw) {
  const data = payrollSourceReport(raw);
  if (data.mode !== 'report' || data.found !== true) throw Error('Las dos liquidaciones deben estar disponibles. Volvé a consultar.');
  // The aggregate DTO also carries classification and unit. Do not infer either.
  for (const row of data.rows) {
    if (row.sourceRows < 1 || (row.totalGroup !== null && (typeof row.totalGroup !== 'string' || !/^\d{1,6}$/.test(row.totalGroup)))
      || (row.unit !== null && (typeof row.unit !== 'string' || row.unit.length > 80))) {
      throw Error('La fuente tiene conceptos incompletos. Revisá su clasificación y unidad.');
    }
  }
  return data;
}
function summary(data) {
  return Object.fromEntries(['datasetId', 'date', 'type', 'closureStatus', 'statementCount', 'lineCount', 'sourceLabel', 'payloadHash', 'reportHash'].map(key => [key, data[key]]));
}
function sourceKey(data) {
  return JSON.stringify({ ...summary(data), rows: [...data.rows].sort(compareCode).map(row =>
    [row.code, row.description, row.totalGroup, row.unit, row.sourceRows, row.missingAmounts, row.amount]) });
}
function percentage(a, difference) {
  if (a <= 0n) return null;
  const numerator = absolute(difference) * 10000n;
  const rounded = numerator / a + ((numerator % a) * 2n >= a ? 1n : 0n);
  return decimal(difference < 0n ? -rounded : rounded).replace('.', ',') + ' %';
}
function makeRow(code, a, b) {
  const missing = !a || !b || a.amount === null || b.amount === null;
  const definitionChanged = Boolean(a && b && (a.description !== b.description || a.totalGroup !== b.totalGroup || a.unit !== b.unit));
  const coverageChanged = Boolean(a && b && a.sourceRows !== b.sourceRows);
  let status, delta = null, percent = null;
  if (!a) status = 'only_target';
  else if (!b) status = 'only_base';
  else if (definitionChanged) status = 'definition';
  else if (missing) status = 'missing';
  else {
    const difference = cents(b.amount) - cents(a.amount);
    if (absolute(difference) > MAX_CENTS) status = 'range';
    else {
      delta = decimal(difference);
      percent = percentage(cents(a.amount), difference);
      status = difference !== 0n ? 'amount' : coverageChanged ? 'coverage' : 'unchanged';
    }
  }
  const descriptions = a && b && a.description !== b.description
    ? `Base: ${a.description} / Comparada: ${b.description}` : (b || a).description;
  const labels = {
    only_target: 'Solo en comparada; no figura en base', only_base: 'Solo en base; no figura en comparada',
    definition: 'Definición distinta; revisar', missing: 'Importes incompletos; no evaluable',
    range: 'Diferencia fuera de rango; no evaluable', amount: 'Importe con variación',
    coverage: 'Mismo importe; distinta cantidad de legajos', unchanged: 'Sin variación'
  };
  let state = labels[status];
  if (a?.missingAmounts) state += `; base: ${a.missingAmounts} sin importe`;
  if (b?.missingAmounts) state += `; comparada: ${b.missingAmounts} sin importe`;
  if (status === 'amount' && coverageChanged) state += '; distinta cantidad de legajos';
  return {
    code, description: descriptions, totalizer: totalizer(code), status, state,
    baseAmount: a?.amount ?? null, targetAmount: b?.amount ?? null,
    basePresent: Boolean(a), targetPresent: Boolean(b), baseCount: a?.sourceRows ?? null, targetCount: b?.sourceRows ?? null,
    delta, percent: percent ?? (delta !== null ? cents(a.amount) === 0n ? 'Base cero: no calculable' : 'Base negativa: no calculable' : 'No evaluable'),
    review: delta === null || coverageChanged, coverageChanged, definitionChanged
  };
}

export function createPayrollComparison(baseRaw, targetRaw) {
  const a = source(baseRaw), b = source(targetRaw);
  if (a.datasetId === b.datasetId) throw Error('Elegí dos liquidaciones distintas.');
  if (a.type !== b.type) throw Error('Compará liquidaciones del mismo tipo.');
  const baseRows = new Map(a.rows.map(row => [row.code, row])), targetRows = new Map(b.rows.map(row => [row.code, row]));
  const rows = [...new Set([...baseRows.keys(), ...targetRows.keys()])].map(code => makeRow(code, baseRows.get(code), targetRows.get(code))).sort(compareCode);
  const model = freeze({ version: 'payroll-comparison.v1', base: summary(a), target: summary(b),
    baseKey: sourceKey(a), targetKey: sourceKey(b), rows,
    differentPopulationSize: a.statementCount !== b.statementCount,
    sameDate: civilDate(a.date) === civilDate(b.date), reversedDates: civilDate(b.date) < civilDate(a.date),
    nonClosed: a.closureStatus !== 'closed' || b.closureStatus !== 'closed' });
  trusted.add(model);
  return model;
}
export function comparisonSourcesUnchanged(model, baseRaw, targetRaw) {
  if (!trusted.has(model)) throw Error('Consultá las fuentes antes de exportar.');
  return model.baseKey === sourceKey(source(baseRaw)) && model.targetKey === sourceKey(source(targetRaw));
}
export function comparisonView(model, filter = {}) {
  if (!trusted.has(model)) throw Error('Consultá las fuentes antes de exportar.');
  const group = filter.group ?? 'concepts', change = filter.change ?? 'all', sort = filter.sort ?? 'code';
  const search = String(filter.search ?? '').trim();
  if (!GROUPS.includes(group) || !CHANGES.includes(change) || !SORTS.includes(sort) || search.length > 100) throw Error('Revisá los filtros de la comparación.');
  const rows = model.rows.filter(row => (group === 'all' || (group === 'totals') === row.totalizer)
    && (change === 'all' || change === 'changed' && row.status !== 'unchanged' || change === 'review' && row.review || change === 'unchanged' && row.status === 'unchanged')
    && (!search || fold(row.code + ' ' + row.description).includes(fold(search))));
  if (sort === 'difference') rows.sort((a, b) => {
    if (a.delta === null || b.delta === null) return a.delta === b.delta ? compareCode(a, b) : a.delta === null ? 1 : -1;
    const d = absolute(cents(b.delta)) - absolute(cents(a.delta));
    return d === 0n ? compareCode(a, b) : d > 0n ? 1 : -1;
  });
  return { rows, filter: { group, change, sort, search }, count: rows.length,
    variations: rows.filter(row => row.delta !== null && cents(row.delta) !== 0n).length,
    review: rows.filter(row => row.review).length };
}
export function comparisonDocument(model, filter = {}) {
  const view = comparisonView(model, filter), a = model.base, b = model.target;
  const sourceDescription = x => `${civilDate(x.date)} · ${x.sourceLabel} · ${comparisonClosureLabel(x.closureStatus)} · ${x.statementCount} legajos`;
  const group = { concepts: 'Conceptos sin totalizadores', totals: 'Solo totalizadores', all: 'Conceptos y totalizadores separados por código' }[view.filter.group];
  const change = { all: 'Todos los estados', changed: 'Con cambios o incidencias', review: 'Revisar', unchanged: 'Sin variación' }[view.filter.change];
  const warnings = [
    'Diferencia = comparada menos base. No figura no equivale a cero. Si falta un importe o cambia la definición, la variación no es evaluable.',
    'Se comparan importes agregados, no sueldos individuales. Los legajos pueden ser distintos aunque las cantidades coincidan. No se suman conceptos con totalizadores.',
    `Filtro: ${group}; ${change}; búsqueda: ${view.filter.search || 'sin búsqueda'}. Orden: ${view.filter.sort === 'code' ? 'código' : 'mayor diferencia absoluta'}.`
  ];
  warnings.push(`SHA-256 base: ${a.reportHash}. SHA-256 comparada: ${b.reportHash}.`);
  if (model.nonClosed) warnings.push('Alguna fuente no informa cierre: comparación de consulta, no liquidación certificada.');
  return { title: 'Comparación de liquidaciones', filename: `municontrol_comparacion_${civilDate(a.date)}_${civilDate(b.date)}_${a.type.toLowerCase()}_${a.datasetId.slice(0, 8)}_${b.datasetId.slice(0, 8)}`,
    columns: [{ label: 'Código', type: 'text', width: 10 }, { label: 'Concepto', type: 'text', width: 37 },
      { label: 'Base', type: 'money', width: 22 }, { label: 'Comparada', type: 'money', width: 22 },
      { label: 'Diferencia', type: 'money', width: 22 }, { label: 'Variación %', type: 'text', width: 20 },
      { label: 'Legajos base / comparada', type: 'text', width: 18 }, { label: 'Estado', type: 'text', width: 33 }],
    rows: view.rows.map(row => [row.code, row.description, row.baseAmount, row.targetAmount, row.delta, row.percent,
      `${row.baseCount ?? 'No figura'} / ${row.targetCount ?? 'No figura'}`, (row.totalizer ? 'Totalizador. ' : '') + row.state]),
    totals: [], notes: warnings,
    metadata: [['Período', `${civilDate(a.date)} / ${civilDate(b.date)}`], ['Tipo', comparisonTypeLabel(a.type)],
      ['Fuente', `Base: ${sourceDescription(a)} / Comparada: ${sourceDescription(b)}`], ['Filas del filtro', view.count],
      ['ID base', a.datasetId], ['ID comparada', b.datasetId], ['SHA-256 base', a.reportHash], ['SHA-256 comparada', b.reportHash],
      ['Huella conjunto base', a.payloadHash], ['Huella conjunto comparada', b.payloadHash],
      ['Alcance', 'Consulta comparativa; no modifica sueldos, no acredita pago ni cierre.'],
      ['Filas con variación monetaria', view.variations], ['Filas para revisar', view.review]] };
}
