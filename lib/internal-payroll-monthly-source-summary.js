export const MONTHLY_SOURCE_CAPABILITY = 'payroll.read';
export const MONTHLY_SOURCE_VERSION = 'payroll-monthly-source-summary.v1';
const PREFIX = 'PAYROLL_MONTHLY_SOURCE_';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const CODE = /^[0-9]{1,6}$/;
const ERRORS = Object.freeze({
  QUERY_INVALID: [400, 'Revisá el período y las liquidaciones seleccionadas.'],
  METHOD_NOT_ALLOWED: [405, 'Esta consulta sólo permite lectura.'],
  SESSION_INVALID: [401, 'La sesión ya no es válida. Volvé a ingresar.'],
  SESSION_BUSY: [409, 'El acceso se está actualizando. Reintentá en un momento.'],
  CAPABILITY_REQUIRED: [403, 'No tenés permiso para consultar estas liquidaciones.'],
  SOURCE_BINDING_REQUIRED: [503, 'La fuente municipal no está disponible para esta consulta.'],
  RELEASE_NOT_CERTIFIED: [503, 'La fuente municipal no está disponible para esta consulta.'],
  NOT_FOUND: [404, 'Una liquidación seleccionada ya no está disponible. Volvé a consultar las fuentes.'],
  MIXED_PERIOD: [409, 'Seleccioná liquidaciones del mismo período.'],
  DUPLICATE_REVISION: [409, 'Seleccioná una sola versión de cada liquidación.'],
  CATALOG_CONFLICT: [409, 'Las fuentes tienen conceptos incompatibles. Seleccioná otro conjunto o solicitá su revisión.'],
  SOURCE_INCOMPLETE: [503, 'Una fuente no está completa. No se puede emitir el resumen.'],
  SOURCE_DRIFT: [503, 'Las fuentes cambiaron o no se pueden conciliar. Volvé a consultarlas.'],
  ROW_LIMIT: [422, 'La consulta supera el límite disponible. Acotá el período o la selección.'],
  UNAVAILABLE: [503, 'No se pudo consultar el resumen. Reintentá en un momento.'],
});
export class MonthlySourceError extends Error {
  constructor(suffix) {
    const key = Object.hasOwn(ERRORS, suffix) ? suffix : 'UNAVAILABLE';
    super(ERRORS[key][1]);
    this.name = 'MonthlySourceError'; this.code = PREFIX + key; this.status = ERRORS[key][0];
  }
}
export function monthlySourceFail(suffix) { throw new MonthlySourceError(suffix); }
export function monthlySourceSafeError(error) {
  if (error instanceof MonthlySourceError) return new MonthlySourceError(error.code.slice(PREFIX.length));
  const candidates = [error?.code, error?.message].filter(value => typeof value === 'string');
  for (const suffix of Object.keys(ERRORS)) if (candidates.includes(PREFIX + suffix)) return new MonthlySourceError(suffix);
  const aliases = { ACTION_SESSION_INVALID: 'SESSION_INVALID', ACTION_SESSION_BUSY: 'SESSION_BUSY',
    ACTION_RELEASE_NOT_CERTIFIED: 'RELEASE_NOT_CERTIFIED', ACTION_SOURCE_BINDING_REQUIRED: 'SOURCE_BINDING_REQUIRED',
    ACTION_TENANT_AUTHORITY_REQUIRED: 'CAPABILITY_REQUIRED' };
  return new MonthlySourceError(candidates.map(code => aliases[code]).find(Boolean) ?? 'UNAVAILABLE');
}
export const monthlySourceUuid = value => typeof value === 'string' && UUID.test(value);
const count = value => Number.isSafeInteger(value) && value >= 0;
const text = (value, max, nonempty = false) => typeof value === 'string' && value.length <= max
  && !/[\x00-\x1f\x7f]/.test(value) && (!nonempty || value.trim().length > 0);
const hash = value => typeof value === 'string' && HASH.test(value);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function exact(value, keys) {
  if (!plain(value) || Object.keys(value).length !== keys.length || Object.keys(value).some(key => !keys.includes(key))) monthlySourceFail('SOURCE_DRIFT');
}
export const monthlySourcePeriod = value => typeof value === 'string' && /^(?:19[0-9]{2}|20[0-9]{2}|2100)-(?:0[1-9]|1[0-2])$/.test(value);
function civilDate(value) {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || value < '1900-01-01' || value > '2100-12-31') return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function timestamp(value) {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\.[0-9]{1,6})?Z$/.test(value)) return false;
  // Validate the civil date without round-tripping the six-digit fraction.
  return civilDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
}
export function monthlySourceDecimal(value) {
  if (typeof value !== 'string' || !/^-?(?:0|[1-9][0-9]{0,21})\.[0-9]{2}$/.test(value) || value === '-0.00') monthlySourceFail('SOURCE_DRIFT');
  return BigInt(value.replace('.', ''));
}
function selection(input) {
  if (!plain(input) || Object.keys(input).length !== 3 || Object.keys(input).some(key => !['resource', 'period', 'datasetIds'].includes(key))
      || !['catalog', 'summary'].includes(input.resource)
      || !(input.period === null || monthlySourcePeriod(input.period))) monthlySourceFail('QUERY_INVALID');
  if (input.resource === 'catalog') {
    if (input.datasetIds !== null) monthlySourceFail('QUERY_INVALID');
  } else if (!monthlySourcePeriod(input.period) || !Array.isArray(input.datasetIds)
      || input.datasetIds.length < 1 || input.datasetIds.length > 24 || input.datasetIds.some(id => !monthlySourceUuid(id))
      || new Set(input.datasetIds.map(id => id.toLowerCase())).size !== input.datasetIds.length) monthlySourceFail('QUERY_INVALID');
  return { resource: input.resource, period: input.period, datasetIds: input.datasetIds?.map(id => id.toLowerCase()) ?? null };
}
export function parseMonthlySourceQuery(req) {
  const query = req.query ?? {};
  if (!plain(query) || Object.values(query).some(value => typeof value !== 'string')) monthlySourceFail('QUERY_INVALID');
  if (typeof req.url === 'string') {
    let raw;
    try { raw = new URL(req.url, 'http://localhost').searchParams; } catch { monthlySourceFail('QUERY_INVALID'); }
    const seen = new Set();
    for (const [key, value] of raw) {
      if (seen.has(key) || !Object.hasOwn(query, key) || query[key] !== value) monthlySourceFail('QUERY_INVALID');
      seen.add(key);
    }
    if (seen.size !== Object.keys(query).length) monthlySourceFail('QUERY_INVALID');
  }
  const keys = Object.keys(query), catalog = query.resource === 'catalog';
  const allowed = catalog ? ['resource', 'period'] : ['resource', 'period', 'datasetIds'];
  if (keys.some(key => !allowed.includes(key)) || !Object.hasOwn(query, 'resource')
      || !catalog && (query.resource !== 'summary' || keys.length !== 3)
      || Object.hasOwn(query, 'period') && !monthlySourcePeriod(query.period)
      || query.datasetIds?.length > 24 * 37) monthlySourceFail('QUERY_INVALID');
  return selection({ resource: query.resource, period: query.period ?? null, datasetIds: catalog ? null : query.datasetIds.split(',') });
}
function scope(value) {
  exact(value, ['kind', 'completeMonthCertified', 'payrollCalculated', 'payrollPosted', 'official']);
  if (value.kind !== 'selected_available_general' || ['completeMonthCertified', 'payrollCalculated', 'payrollPosted', 'official'].some(key => value[key] !== false)) monthlySourceFail('SOURCE_DRIFT');
}
function sources(values, period, maximum) {
  if (!Array.isArray(values) || values.length > maximum) monthlySourceFail('SOURCE_DRIFT');
  const seen = new Set();
  for (const source of values) {
    exact(source, ['datasetId', 'date', 'sourcePeriod', 'sourceMonth', 'type', 'closureStatus', 'statementCount', 'lineCount', 'sourceLabel', 'sourceSha256', 'payloadHash', 'importedAt']);
    if (!monthlySourceUuid(source.datasetId) || source.datasetId !== source.datasetId.toLowerCase() || seen.has(source.datasetId)
        || !civilDate(source.date) || !Number.isInteger(source.sourcePeriod) || source.sourcePeriod < 1900 || source.sourcePeriod > 2100
        || !Number.isInteger(source.sourceMonth) || source.sourceMonth < 1 || source.sourceMonth > 12
        || period !== null && `${source.sourcePeriod}-${String(source.sourceMonth).padStart(2, '0')}` !== period
        || typeof source.type !== 'string' || !/^[A-Z]$/.test(source.type) || !['closed', 'open', 'unknown'].includes(source.closureStatus)
        || !count(source.statementCount) || source.statementCount < 1 || !count(source.lineCount) || source.lineCount < 1 || !text(source.sourceLabel, 240, true)
        || !hash(source.sourceSha256) || !hash(source.payloadHash) || !timestamp(source.importedAt)) monthlySourceFail('SOURCE_DRIFT');
    seen.add(source.datasetId);
  }
  return seen;
}
function sumCounts(values) {
  const result = values.reduce((sum, value) => sum + BigInt(value), 0n);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) monthlySourceFail('SOURCE_DRIFT');
  return result;
}
export function validateMonthlySourceResponse(data, input) {
  const query = selection(input);
  const catalog = query.resource === 'catalog';
  exact(data, catalog ? ['version', 'mode', 'period', 'items', 'total', 'scope'] : ['version', 'mode', 'period', 'sources', 'counts', 'rows', 'reportHash', 'scope']);
  if (data.version !== MONTHLY_SOURCE_VERSION || data.mode !== query.resource || data.period !== query.period) monthlySourceFail('SOURCE_DRIFT');
  scope(data.scope);
  const ids = sources(catalog ? data.items : data.sources, query.period, catalog ? 240 : 24);
  if (catalog) {
    if (!count(data.total) || data.total !== data.items.length) monthlySourceFail('SOURCE_DRIFT');
    return data;
  }
  if (ids.size !== query.datasetIds.length || query.datasetIds.some(id => !ids.has(id))
      || new Set(data.sources.map(source => source.sourceSha256)).size !== 1 || !hash(data.reportHash)) monthlySourceFail('SOURCE_DRIFT');
  const revisions = data.sources.map(source => `${source.date}:${source.sourcePeriod}:${source.sourceMonth}:${source.type}`);
  if (new Set(revisions).size !== revisions.length) monthlySourceFail('SOURCE_DRIFT');
  exact(data.counts, ['datasetCount', 'statementParticipations', 'distinctLegajos', 'lineCount', 'conceptCount']);
  const counts = data.counts;
  if (Object.values(counts).some(value => !count(value) || value < 1) || counts.datasetCount !== ids.size
      || BigInt(counts.statementParticipations) !== sumCounts(data.sources.map(source => source.statementCount))
      || BigInt(counts.lineCount) !== sumCounts(data.sources.map(source => source.lineCount))
      || counts.distinctLegajos > counts.statementParticipations || !Array.isArray(data.rows) || data.rows.length > 1000
      || counts.conceptCount !== data.rows.length) monthlySourceFail('SOURCE_DRIFT');
  const codes = new Set();
  for (const row of data.rows) {
    exact(row, ['code', 'description', 'unit', 'totalGroup', 'sourceRows', 'distinctLegajos', 'missingQuantities', 'quantity', 'missingAmounts', 'amount']);
    if (typeof row.code !== 'string' || !CODE.test(row.code) || codes.has(row.code) || !text(row.description, 240, true)
        || !(row.unit === null || text(row.unit, 32)) || !(row.totalGroup === null || typeof row.totalGroup === 'string' && CODE.test(row.totalGroup))
        || !count(row.sourceRows) || row.sourceRows < 1 || row.sourceRows > counts.statementParticipations || !count(row.distinctLegajos) || row.distinctLegajos < 1
        || row.distinctLegajos > row.sourceRows || row.distinctLegajos > counts.distinctLegajos
        || !count(row.missingQuantities) || row.missingQuantities > row.sourceRows
        || !count(row.missingAmounts) || row.missingAmounts > row.sourceRows
        || (row.quantity === null) !== (row.missingQuantities > 0)
        || (row.amount === null) !== (row.missingAmounts > 0)) monthlySourceFail('SOURCE_DRIFT');
    if (row.quantity !== null) monthlySourceDecimal(row.quantity);
    if (row.amount !== null) monthlySourceDecimal(row.amount);
    codes.add(row.code);
  }
  if (sumCounts(data.rows.map(row => row.sourceRows)) !== BigInt(counts.lineCount)) monthlySourceFail('SOURCE_DRIFT');
  return data;
}
function principalValues(principal, session) {
  const tenant = principal?.tenant;
  if (tenant?.source !== 'membership') monthlySourceFail('CAPABILITY_REQUIRED');
  if (!monthlySourceUuid(tenant.id) || !monthlySourceUuid(tenant.membershipId) || !monthlySourceUuid(session?.id)
      || !Number.isSafeInteger(session.version) || session.version < 1 || !text(session.email, 320, true)
      || session.email !== principal?.user?.email?.trim().toLowerCase()) monthlySourceFail('SESSION_INVALID');
  if (typeof session.releaseSha !== 'string' || !/^[a-f0-9]{40}$/.test(session.releaseSha)
      || session.releaseSha !== String(tenant.certifiedReleaseSha ?? '').trim().toLowerCase()) monthlySourceFail('RELEASE_NOT_CERTIFIED');
  return [session.email, session.id, session.version, session.releaseSha, tenant.id, tenant.membershipId];
}
export async function readMonthlySourceSummary(sql, principal, session, input) {
  const query = selection(input);
  const values = [...principalValues(principal, session), query.period, query.datasetIds];
  let rows;
  try {
    const result = await sql.query('SELECT public.payroll_monthly_source_summary_v1($1::text,$2::uuid,$3::integer,$4::text,$5::uuid,$6::uuid,$7::text,$8::uuid[]) AS result', values);
    rows = Array.isArray(result) ? result : result?.rows;
  } catch (error) { throw monthlySourceSafeError(error); }
  if (!Array.isArray(rows) || rows.length !== 1 || !plain(rows[0]?.result)) monthlySourceFail('SOURCE_DRIFT');
  return validateMonthlySourceResponse(rows[0].result, query);
}
