// Shared wire contract. Rules are declarations; this module evaluates no time.
export const TIME_CATALOG_VERSION = 'time-catalog.v1';
export const TIME_CATALOG_KINDS = Object.freeze(['calendar', 'shift', 'rule_profile', 'assignment']);
export const TIME_CATALOG_STATUSES = Object.freeze(['draft', 'submitted', 'approved', 'rejected', 'retired']);
export const TIME_CATALOG_REASONS = Object.freeze({
  create_draft: ['catalog_onboarding', 'new_revision'], update_draft: ['draft_corrected'],
  submit: ['ready_for_review'], approve: ['configuration_verified'],
  reject: ['configuration_invalid', 'evidence_insufficient', 'source_not_authoritative'],
  retire: ['superseded', 'catalog_retired', 'binding_changed'],
});
export class TimeCatalogInputError extends Error {
  constructor(message = 'Revisá las fechas, los valores y la configuración completa.') {
    super(message); this.name = 'TimeCatalogInputError'; this.code = 'TIME_CATALOG_INPUT_INVALID';
  }
}
const fail = message => { throw new TimeCatalogInputError(message); };
export const timeCatalogUuid = v => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
export const timeCatalogKey = v => timeCatalogUuid(v) && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
export const timeCatalogSha = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export const timeCatalogScope = v => typeof v === 'string' && /^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(v);
export function timeCatalogExact(v, required, optional = []) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    && required.every(k => Object.hasOwn(v, k))
    && Object.keys(v).every(k => required.includes(k) || optional.includes(k));
}
export const timeCatalogInteger = (v, min, max) => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max && !Object.is(v, -0);
export function timeCatalogDate(v) {
  if (typeof v !== 'string' || !/^(19|20|21)\d{2}-\d{2}-\d{2}$/.test(v) || v < '1900-01-01' || v > '2100-12-31') return false;
  const d = new Date(v + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
const time = v => typeof v === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(v);
const code = (v, pattern) => typeof v === 'string' && pattern.test(v);
const list = (v, min, max) => Array.isArray(v) && v.length >= min && v.length <= max;
const unique = (rows, key) => new Set(rows.map(key)).size === rows.length;
export function timeCatalogNumeric(v, kind) {
  const pattern = kind === 'integer' ? /^-?(?:0|[1-9]\d{0,17})$/ : /^-?(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/;
  if (typeof v !== 'string' || !pattern.test(v)) fail('Los valores enteros y decimales deben conservar su texto exacto, sin exponentes ni redondeo.');
  const trimmed = v.includes('.') ? v.replace(/0+$/, '').replace(/\.$/, '') : v;
  return trimmed === '-0' ? '0' : trimmed;
}
export function timeCatalogReference(v) {
  const text = (s, min, max) => typeof s === 'string' && s === s.trim() && s.length >= min && s.length <= max && !/[\u0000-\u001f\u007f]/.test(s);
  if (!timeCatalogExact(v, ['title'], ['code', 'legalReference']) || !text(v.title, 3, 120)
    || (Object.hasOwn(v, 'code') && (typeof v.code !== 'string' || !/^[a-z][a-z0-9_.-]{1,63}$/.test(v.code)))
    || (Object.hasOwn(v, 'legalReference') && !text(v.legalReference, 3, 200))) fail('Revisá el nombre de la configuración, su código y la referencia documental.');
  return v;
}
export async function timeCatalogReferenceKey(kind, code) {
  if (!TIME_CATALOG_KINDS.includes(kind) || typeof code !== 'string' || !/^[a-z][a-z0-9_.-]{1,63}$/.test(code)) fail('Ingresá un código estable para esta configuración.');
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(kind + ':' + code))), b => b.toString(16).padStart(2, '0')).join('');
}
function intervals(rows) {
  if (!list(rows, 1, 224) || !unique(rows, r => `${r.day}:${r.sequence}`)) fail();
  const segments = [];
  for (const r of rows) {
    if (!timeCatalogExact(r, ['day', 'sequence', 'kind', 'start', 'end', 'crossesMidnight'])
      || !timeCatalogInteger(r.day, 1, 7) || !timeCatalogInteger(r.sequence, 1, 32)
      || !['work', 'break', 'on_call'].includes(r.kind) || !time(r.start) || !time(r.end)
      || typeof r.crossesMidnight !== 'boolean' || (r.crossesMidnight ? r.start <= r.end : r.start >= r.end)) fail();
    const seconds = t => t.split(':').reduce((a, n) => a * 60 + Number(n), 0);
    const start = (r.day - 1) * 86400 + seconds(r.start), end = (r.day - 1) * 86400 + seconds(r.end) + (r.crossesMidnight ? 86400 : 0);
    segments.push([start, Math.min(end, 604800)]);
    if (end > 604800) segments.push([0, end - 604800]);
  }
  segments.sort((a, b) => a[0] - b[0]);
  if (segments.some((s, i) => i > 0 && s[0] < segments[i - 1][1])) fail('Los tramos de trabajo, pausa o guardia se superponen.');
}
function parameter(p, snapshot = false) {
  const field = ({integer: 'integerValue', decimal: 'decimalValue', boolean: 'booleanValue', time: 'timeValue', code: 'codeValue'})[p?.valueKind];
  if (!field || !timeCatalogExact(p, ['key', 'valueKind', 'unitCode', snapshot ? field : 'value'])
    || !code(p.key, /^[a-z][a-z0-9_.-]{2,95}$/) || !code(p.unitCode, /^[a-z][a-z0-9_]{1,31}$/)) fail();
  const v = p[snapshot ? field : 'value'];
  if (['integer', 'decimal'].includes(p.valueKind)) return timeCatalogNumeric(v, p.valueKind);
  if (p.valueKind === 'boolean' ? typeof v !== 'boolean' : p.valueKind === 'time' ? !time(v) : !code(v, /^[a-z][a-z0-9_.-]{1,95}$/)) fail();
  return v;
}
function spec(kind, s, from, to, snapshot = false) {
  if (kind === 'calendar') {
    if (!timeCatalogExact(s, ['days']) || !list(s.days, 1, 732) || !unique(s.days, d => d.date)) fail();
    for (const d of s.days) {
      if (!timeCatalogExact(d, snapshot ? ['date', 'kind', 'code', 'evidencePresent'] : ['date', 'kind', 'code'], snapshot ? [] : ['evidenceSha256'])
        || !timeCatalogDate(d.date) || d.date < from || (to && d.date > to)
        || !['working', 'non_working', 'holiday', 'special'].includes(d.kind) || !code(d.code, /^[a-z][a-z0-9_.-]{1,63}$/)
        || (snapshot ? typeof d.evidencePresent !== 'boolean' : Object.hasOwn(d, 'evidenceSha256') && !timeCatalogSha(d.evidenceSha256))) fail();
    }
  } else if (kind === 'shift') {
    if (!timeCatalogExact(s, ['entryToleranceSeconds', 'exitToleranceSeconds', 'intervals'])
      || !timeCatalogInteger(s.entryToleranceSeconds, 0, 21600) || !timeCatalogInteger(s.exitToleranceSeconds, 0, 21600)) fail();
    intervals(s.intervals);
  } else if (kind === 'rule_profile') {
    if (!timeCatalogExact(s, ['parameters']) || !list(s.parameters, 1, 256) || !unique(s.parameters, p => p.key)) fail();
    s.parameters.forEach(p => parameter(p, snapshot));
  } else if (snapshot) {
    if (!timeCatalogExact(s, ['targetType', 'targetProjected', 'shiftRevision', 'calendarRevision', 'ruleProfileRevision'])
      || s.targetType !== 'canonical_employment_contract' || s.targetProjected !== false
      || !['shiftRevision', 'calendarRevision', 'ruleProfileRevision'].every(k => timeCatalogInteger(s[k], 1, 999999))) fail();
  } else if (!timeCatalogExact(s, ['employmentContractId', 'shiftEntryId', 'calendarEntryId', 'ruleProfileEntryId'])
    || !Object.values(s).every(timeCatalogUuid)) fail();
}
export function timeCatalogPayload(kind, p) {
  if (!TIME_CATALOG_KINDS.includes(kind) || !timeCatalogExact(p, ['effectiveFrom', 'logicalKeyHash', 'revision', 'spec', 'timezone'], ['effectiveTo', 'sourceContractId', 'reference'])
    || !timeCatalogDate(p.effectiveFrom) || (Object.hasOwn(p, 'effectiveTo') && (!timeCatalogDate(p.effectiveTo) || p.effectiveTo < p.effectiveFrom))
    || !timeCatalogSha(p.logicalKeyHash) || !timeCatalogInteger(p.revision, 1, 999999)
    || p.timezone !== 'America/Argentina/Mendoza' || (Object.hasOwn(p, 'sourceContractId') && !timeCatalogUuid(p.sourceContractId))) fail();
  spec(kind, p.spec, p.effectiveFrom, p.effectiveTo);
  if (Object.hasOwn(p, 'reference')) timeCatalogReference(p.reference);
  return structuredClone(p);
}
export function timeCatalogCommand(body) {
  if (!timeCatalogExact(body, ['command', 'kind', 'id', 'expectedVersion', 'payload', 'reasonCode', 'reason', 'manualValidationConfirmed', 'scopeVersion'])
    || !Object.hasOwn(TIME_CATALOG_REASONS, body.command) || !TIME_CATALOG_REASONS[body.command].includes(body.reasonCode)
    || !timeCatalogScope(body.scopeVersion) || !timeCatalogInteger(body.expectedVersion, 0, 2147483646)
    || typeof body.reason !== 'string' || body.reason.trim().length < 10 || body.reason.length > 500 || /[\u0000-\u001f\u007f]/.test(body.reason)
    || body.manualValidationConfirmed !== (body.command === 'approve')) fail();
  if (['create_draft', 'update_draft'].includes(body.command)) {
    if (body.command === 'create_draft' ? body.id !== null || body.expectedVersion !== 0 : !timeCatalogUuid(body.id) || body.expectedVersion < 1) fail();
    timeCatalogPayload(body.kind, body.payload);
  } else if (body.kind !== null || body.payload !== null || !timeCatalogUuid(body.id) || body.expectedVersion < 1) fail();
  return structuredClone(body);
}
export function timeCatalogRecord(r) {
  if (!timeCatalogExact(r, ['id', 'kind', 'revision', 'effectiveFrom', 'timezone', 'sourceLinked', 'status', 'version', 'reasonCode', 'configuration', 'timestamps'], ['effectiveTo', 'reference'])
    || !timeCatalogUuid(r.id) || !TIME_CATALOG_KINDS.includes(r.kind) || !TIME_CATALOG_STATUSES.includes(r.status)
    || !timeCatalogInteger(r.revision, 1, 999999) || !timeCatalogInteger(r.version, 1, 2147483647)
    || !timeCatalogDate(r.effectiveFrom) || (Object.hasOwn(r, 'effectiveTo') && (!timeCatalogDate(r.effectiveTo) || r.effectiveTo < r.effectiveFrom))
    || r.timezone !== 'America/Argentina/Mendoza' || typeof r.sourceLinked !== 'boolean'
    || !Object.values(TIME_CATALOG_REASONS).flat().includes(r.reasonCode)
    || !timeCatalogExact(r.timestamps, ['createdAt', 'updatedAt'], ['submittedAt', 'decidedAt', 'retiredAt'])
    || !Object.values(r.timestamps).every(t => typeof t === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(t) && Number.isFinite(Date.parse(t)))) fail('La respuesta del catálogo no pudo verificarse.');
  spec(r.kind, r.configuration, r.effectiveFrom, r.effectiveTo, true);
  if (Object.hasOwn(r, 'reference')) timeCatalogReference(r.reference);
  return r;
}
export function timeCatalogMatches(r, body) {
  timeCatalogRecord(r);
  const status = ({create_draft: 'draft', update_draft: 'draft', submit: 'submitted', approve: 'approved', reject: 'rejected', retire: 'retired'})[body.command];
  if (r.version !== body.expectedVersion + 1 || r.status !== status || r.reasonCode !== body.reasonCode
    || (body.id !== null && r.id.toLowerCase() !== body.id.toLowerCase())) fail('La confirmación corresponde a otra operación.');
  if (!body.payload) return r;
  const p = body.payload;
  if (r.kind !== body.kind || r.revision !== p.revision || r.effectiveFrom !== p.effectiveFrom || r.effectiveTo !== p.effectiveTo
    || r.sourceLinked !== Object.hasOwn(p, 'sourceContractId')) fail('La confirmación contiene otra configuración.');
  if (p.reference && ['title','code','legalReference'].some(k => r.reference?.[k] !== p.reference[k])) fail('La confirmación contiene otra referencia.');
  if (r.kind === 'assignment') return r; // References remain deliberately private in the SQL facade.
  const s = structuredClone(p.spec);
  if (r.kind === 'calendar') s.days = s.days.map(({evidenceSha256, ...d}) => ({...d, evidencePresent: evidenceSha256 !== undefined})).sort((a, b) => a.date.localeCompare(b.date));
  if (r.kind === 'shift') s.intervals.sort((a, b) => a.day - b.day || a.sequence - b.sequence);
  if (r.kind === 'rule_profile') s.parameters = s.parameters.map(p => ({key: p.key, valueKind: p.valueKind, unitCode: p.unitCode,
    [({integer: 'integerValue', decimal: 'decimalValue', boolean: 'booleanValue', time: 'timeValue', code: 'codeValue'})[p.valueKind]]: parameter(p)})).sort((a, b) => a.key.localeCompare(b.key));
  const equal = v => Array.isArray(v) ? '[' + v.map(equal).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + equal(v[k])).join(',') + '}' : JSON.stringify(v);
  const c = structuredClone(r.configuration);
  if (r.kind === 'rule_profile') c.parameters.forEach(p => { if (p.valueKind === 'decimal') p.decimalValue = timeCatalogNumeric(p.decimalValue, 'decimal'); });
  if (equal(c) !== equal(s)) fail('La confirmación contiene otros valores.');
  return r;
}
export function timeCatalogEditPayload(r, p) {
  if (r.status !== 'draft') fail('Esta revisión ya no permite corregir el borrador.');
  timeCatalogPayload(r.kind, p);
  timeCatalogMatches(r, {command:'update_draft',id:r.id,kind:r.kind,expectedVersion:r.version-1,reasonCode:r.reasonCode,payload:p});
  return p;
}
export function timeCatalogAssignment(v, r) {
  if (r.kind !== 'assignment' || !timeCatalogExact(v, ['target','shift','calendar','ruleProfile'])
    || !timeCatalogExact(v.target, ['contractId','legajo','name']) || !timeCatalogUuid(v.target.contractId)
    || typeof v.target.legajo !== 'string' || !/^[1-9]\d{0,19}$/.test(v.target.legajo)
    || !(v.target.name === null || (typeof v.target.name === 'string' && v.target.name.length >= 1 && v.target.name.length <= 240 && !/[\u0000-\u001f\u007f]/.test(v.target.name)))) fail('No se pudo verificar el contrato de la asignación.');
  for (const [key, kind, revision] of [['shift','shift','shiftRevision'],['calendar','calendar','calendarRevision'],['ruleProfile','rule_profile','ruleProfileRevision']]) {
    timeCatalogRecord(v[key]); if (v[key].kind !== kind || v[key].revision !== r.configuration[revision]) fail('La asignación contiene otra revisión vinculada.');
  }
  return v;
}
