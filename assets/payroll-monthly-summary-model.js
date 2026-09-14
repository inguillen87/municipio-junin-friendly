import { civilDate } from './civil-date.js';

export const MONTHLY_SUMMARY_VERSION = 'payroll-monthly-source-summary.v1';
export const MONTHLY_SUMMARY_LIMITS = Object.freeze({ catalog: 240, sources: 24, concepts: 1000 });
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const hash = /^[a-f0-9]{64}$/;
const decimal = /^-?(?:0|[1-9]\d{0,21})\.\d{2}$/;
const fail = () => { throw Error('No se pudo verificar el resumen recibido. Volvé a consultar las corridas disponibles.'); };
const keys = (v, names) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join(',') === names.split(' ').sort().join(',');
const text = (v, max = 240) => typeof v === 'string' && v.length <= max && !/[\x00-\x1f]/.test(v);
const count = v => Number.isSafeInteger(v) && v >= 0;
export const validMonthlyPeriod = v => typeof v === 'string' && /^(?:19\d{2}|20\d{2}|2100)-(?:0[1-9]|1[0-2])$/.test(v);
const scopeKeys = 'kind completeMonthCertified payrollCalculated payrollPosted official';
function checkedScope(s) {
  if (!keys(s, scopeKeys) || s.kind !== 'selected_available_general' || s.completeMonthCertified !== false
    || s.payrollCalculated !== false || s.payrollPosted !== false || s.official !== false) fail();
  return Object.freeze({ ...s });
}
function instant(v) {
  if (!text(v, 40) || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?Z$/.test(v) || !Number.isFinite(Date.parse(v))) fail();
  try { civilDate(v.slice(0, 10)); } catch { fail(); } return v;
}
export function sourceMonthlyPeriod(s) { return String(s.sourcePeriod) + '-' + String(s.sourceMonth).padStart(2, '0'); }
function checkedSources(items, period, limit) {
  if (!Array.isArray(items) || items.length > limit) fail();
  const seen = new Set();
  return Object.freeze(items.map(s => {
    if (!keys(s, 'datasetId date sourcePeriod sourceMonth type closureStatus statementCount lineCount sourceLabel sourceSha256 payloadHash importedAt')
      || !uuid.test(s.datasetId) || seen.has(s.datasetId.toLowerCase()) || !Number.isInteger(s.sourcePeriod) || !Number.isInteger(s.sourceMonth)
      || !validMonthlyPeriod(sourceMonthlyPeriod(s)) || period && sourceMonthlyPeriod(s) !== period
      || !/^[A-Z]$/.test(s.type) || !['closed', 'open', 'unknown'].includes(s.closureStatus)
      || !count(s.statementCount) || s.statementCount < 1 || !count(s.lineCount) || s.lineCount < 1 || !text(s.sourceLabel) || !s.sourceLabel
      || !hash.test(s.sourceSha256) || !hash.test(s.payloadHash)) fail();
    try { if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date) || civilDate(s.date) !== s.date) fail(); } catch { fail(); }
    instant(s.importedAt); seen.add(s.datasetId.toLowerCase());
    return Object.freeze({ ...s, datasetId: s.datasetId.toLowerCase() });
  }).sort((a, b) => a.datasetId.localeCompare(b.datasetId)));
}
export function monthlySummaryData(payload, { resource, period = null, datasetIds = [] } = {}) {
  const d = payload?.data;
  if (payload?.ok !== true || d?.version !== MONTHLY_SUMMARY_VERSION || !['catalog', 'summary'].includes(resource)
    || d.mode !== resource || period !== null && !validMonthlyPeriod(period) || d.period !== period) fail();
  const scope = checkedScope(d.scope);
  if (resource === 'catalog') {
    if (!keys(d, 'version mode period items total scope') || !count(d.total) || d.total !== d.items?.length) fail();
    return Object.freeze({ ...d, scope, items: checkedSources(d.items, period, MONTHLY_SUMMARY_LIMITS.catalog) });
  }
  if (!keys(d, 'version mode period sources counts rows reportHash scope') || !validMonthlyPeriod(d.period) || !hash.test(d.reportHash)
    || !Array.isArray(datasetIds) || datasetIds.length < 1 || datasetIds.length > MONTHLY_SUMMARY_LIMITS.sources
    || datasetIds.some(id => !uuid.test(id)) || new Set(datasetIds.map(id => id.toLowerCase())).size !== datasetIds.length) fail();
  const sources = checkedSources(d.sources, period, MONTHLY_SUMMARY_LIMITS.sources);
  if (sources.map(s => s.datasetId).join(',') !== datasetIds.map(id => id.toLowerCase()).sort().join(',')
    || new Set(sources.map(s => s.sourceSha256)).size !== 1) fail();
  const c = d.counts;
  if (!keys(c, 'datasetCount statementParticipations distinctLegajos lineCount conceptCount') || !Object.values(c).every(v => count(v) && v > 0)
    || c.datasetCount !== sources.length || c.statementParticipations !== sources.reduce((n, s) => n + s.statementCount, 0)
    || c.lineCount !== sources.reduce((n, s) => n + s.lineCount, 0) || c.distinctLegajos > c.statementParticipations
    || c.distinctLegajos < Math.max(0, ...sources.map(s => s.statementCount))
    || !Array.isArray(d.rows) || d.rows.length > MONTHLY_SUMMARY_LIMITS.concepts || c.conceptCount !== d.rows.length) fail();
  const codes = new Set();
  const rows = d.rows.map(r => {
    if (!keys(r, 'code description unit totalGroup sourceRows distinctLegajos missingQuantities quantity missingAmounts amount')
      || typeof r.code !== 'string' || !/^\d{1,6}$/.test(r.code) || codes.has(r.code) || !text(r.description) || !r.description
      || r.unit !== null && !text(r.unit, 32) || r.totalGroup !== null && (typeof r.totalGroup !== 'string' || !/^\d{1,6}$/.test(r.totalGroup))
      || !count(r.sourceRows) || r.sourceRows < 1 || !count(r.distinctLegajos) || r.distinctLegajos < 1
      || r.distinctLegajos > r.sourceRows || r.distinctLegajos > c.distinctLegajos
      || !count(r.missingQuantities) || !count(r.missingAmounts) || r.missingQuantities > r.sourceRows || r.missingAmounts > r.sourceRows
      || (r.missingQuantities > 0 ? r.quantity !== null : typeof r.quantity !== 'string' || !decimal.test(r.quantity) || r.quantity === '-0.00')
      || (r.missingAmounts > 0 ? r.amount !== null : typeof r.amount !== 'string' || !decimal.test(r.amount) || r.amount === '-0.00')) fail();
    codes.add(r.code); return Object.freeze({ ...r });
  }).sort((a, b) => Number(a.code) - Number(b.code) || a.code.localeCompare(b.code));
  if (rows.reduce((n, r) => n + r.sourceRows, 0) !== c.lineCount) fail();
  return Object.freeze({ ...d, scope, sources, rows: Object.freeze(rows), counts: Object.freeze({ ...c }) });
}
export function monthlySummaryRevision(d) { return JSON.stringify(d); }
export function monthlyDecimal(value) {
  if (value === null) return 'No informado';
  if (typeof value !== 'string' || !decimal.test(value)) fail();
  const [whole, fraction] = value.split('.'), negative = whole.startsWith('-');
  return (negative ? '−' : '') + (negative ? whole.slice(1) : whole).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + fraction;
}
export function monthlyClosure(value) { return { closed: 'Cerrada en origen', open: 'Abierta en origen', unknown: 'Cierre no informado' }[value]; }
export function monthlyType(value) { return { M: 'Mensual / segunda quincena', O: 'Otras liquidaciones', V: 'Vacaciones', P: 'Primera quincena', S: 'Complementaria', F: 'Final' }[value] || 'Tipo ' + value; }
export function monthlyObservations(r) {
  const notes = [];
  if (r.missingQuantities) notes.push(r.missingQuantities + (r.missingQuantities === 1 ? ' cantidad sin informar' : ' cantidades sin informar'));
  if (r.missingAmounts) notes.push(r.missingAmounts + (r.missingAmounts === 1 ? ' importe sin informar' : ' importes sin informar'));
  if (!notes.length) notes.push('Sin faltantes en las líneas incluidas');
  return notes.join(' · ');
}
export function monthlySummaryFilter(data, { search = '', status = 'all' } = {}) {
  if (!text(search, 100) || !['all', 'missing', 'informed'].includes(status)) fail();
  const fold = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(), query = fold(search.trim());
  const rows = data.rows.filter(r => (!query || fold(r.code + ' ' + r.description).includes(query))
    && (status === 'all' || status === 'missing' && (r.missingQuantities || r.missingAmounts) || status === 'informed' && !r.missingQuantities && !r.missingAmounts));
  return { rows, filters: { search: search.trim(), status } };
}
