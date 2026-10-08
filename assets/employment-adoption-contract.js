// Ownership-adoption wire contract. No identity lookup, source parsing or writes.
export const ADOPTION_VERSION = 'employment-adoption.v1';
export const ADOPTION_PENDING_INPUT_VERSION = 'employment-adoption-input.v2';
export const ADOPTION_FINAL_INPUT_VERSION = 'employment-adoption-input.v3';
export const ADOPTION_MAX_ROWS = 10000;
export const EMPLOYMENT_ORIGINS = Object.freeze({historical: 'GRH', own: 'MUNICONTROL'});
export class AdoptionInputError extends Error {
  constructor(code, message) { super(message); Object.assign(this, {name: 'AdoptionInputError', code}); }
}
const fail = (code = 'INPUT_INVALID', message = 'Revisá la selección y el documento de adopción.') => { throw new AdoptionInputError(code, message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && Object.values(Object.getOwnPropertyDescriptors(value)).every(p => Object.hasOwn(p, 'value'));
const exact = (value, keys) => object(value) && Reflect.ownKeys(value).length === keys.length
  && Reflect.ownKeys(value).every(key => typeof key === 'string' && keys.includes(key));
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const adoptionUuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
function text(value, min, max) {
  if (typeof value !== 'string') fail();
  const result = value.normalize('NFC').trim();
  if ([...result].length < min || [...result].length > max || /[<>\u0000-\u001f\u007f-\u009f]/u.test(result)) fail();
  return result;
}
export function adoptionProposalInput(value) {
  const final=value?.version===ADOPTION_FINAL_INPUT_VERSION,pending=final||value?.version===ADOPTION_PENDING_INPUT_VERSION;
  if (!exact(value, ['sourceContextVersion', 'selectionVersion', 'catalogVersion', 'rows', 'legalReference', 'reason',...(pending?['version']:[]),...(final?['finalSource']:[])])
    || ![value.sourceContextVersion, value.selectionVersion, value.catalogVersion].every(sha) || !Array.isArray(value.rows)) fail();
  if(final&&(!exact(value.finalSource,['revisionId','packageSha256'])||!adoptionUuid(value.finalSource.revisionId)||!sha(value.finalSource.packageSha256)))fail();
  if (value.rows.length < 1 || value.rows.length > ADOPTION_MAX_ROWS) fail('LIMIT', 'La selección completa requiere entre uno y diez mil contratos. No se omitieron filas.');
  const seen = new Set(), rows = [];
  for (const row of value.rows) {
    if (!exact(row, ['contractId', 'contractVersion', 'jurisdictionCode']) || !adoptionUuid(row.contractId)
      || !sha(row.contractVersion) || !['42', '55',...(pending?[null]:[])].includes(row.jurisdictionCode)) fail();
    const identity = row.contractId.toLowerCase();
    if (seen.has(identity)) fail('DUPLICATE', 'Un contrato aparece más de una vez. Revisá la selección completa.');
    seen.add(identity);
    rows.push({contractId: row.contractId, contractVersion: row.contractVersion, jurisdictionCode: row.jurisdictionCode});
  }
  return freeze({...(pending?{version:final?ADOPTION_FINAL_INPUT_VERSION:ADOPTION_PENDING_INPUT_VERSION}:{}),...(final?{finalSource:{...value.finalSource}}:{}),sourceContextVersion: value.sourceContextVersion, selectionVersion: value.selectionVersion,
    catalogVersion: value.catalogVersion, rows, legalReference: text(value.legalReference, 3, 180), reason: text(value.reason, 10, 1000)});
}
export function adoptionReviewInput(value) {
  if (!exact(value, ['proposalId', 'proposalVersion', 'sourceContextVersion', 'catalogVersion', 'decision', 'reason'])
    || !adoptionUuid(value.proposalId) || ![value.proposalVersion, value.sourceContextVersion, value.catalogVersion].every(sha)
    || !['approve', 'reject'].includes(value.decision)) fail();
  return freeze({...value, reason: text(value.reason, 10, 1000)});
}
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(value)) return false;
  const date = value.slice(0, 10), calendar = new Date(date + 'T00:00:00Z');
  const hour = Number(value.slice(11, 13)), minute = Number(value.slice(14, 16)), second = Number(value.slice(17, 19));
  return Number.isFinite(calendar.getTime()) && calendar.toISOString().slice(0, 10) === date
    && hour < 24 && minute < 60 && second < 60 && Number.isFinite(Date.parse(value));
}
export function adoptionReceipt(value, expected = {}) {
  const invalid = () => fail('CONTRACT_INVALID', 'La confirmación de adopción no pudo verificarse. Consultá el mismo intento.');
  if (!object(expected) || !exact(expected, Object.keys(expected))
    || Object.keys(expected).some(k => !['operation', 'proposalId', 'proposalVersion', 'status', 'total', 'sourceContextVersion', 'catalogVersion'].includes(k))) invalid();
  if (!exact(value, ['version', 'operation', 'proposalId', 'proposalVersion', 'sourceContextVersion', 'catalogVersion', 'status', 'total', 'replayed', 'decidedAt', 'effects'])
    || value.version !== ADOPTION_VERSION || !['propose', 'review'].includes(value.operation) || !adoptionUuid(value.proposalId)
    || ![value.proposalVersion, value.sourceContextVersion, value.catalogVersion].every(sha)
    || !['pending', 'approved', 'rejected'].includes(value.status) || !Number.isSafeInteger(value.total) || value.total < 1 || value.total > ADOPTION_MAX_ROWS
    || typeof value.replayed !== 'boolean' || (value.operation === 'propose' ? value.status !== 'pending' : value.status === 'pending')
    || (value.status === 'pending' ? value.decidedAt !== null : !timestamp(value.decidedAt))) invalid();
  const effects = value.effects;
  if (!exact(effects, ['identitiesCreated', 'contractsCreated', 'contractsAdopted', 'sourceHistoryRetained', 'payrollCalculated', 'payrollPosted', 'paymentsExecuted'])
    || effects.identitiesCreated !== 0 || effects.contractsCreated !== 0 || effects.contractsAdopted !== (value.status === 'approved' ? value.total : 0)
    || effects.sourceHistoryRetained !== true || effects.payrollCalculated !== false || effects.payrollPosted !== false || effects.paymentsExecuted !== false) invalid();
  for (const [key, target] of Object.entries(expected)) {
    if (key === 'proposalId' ? !adoptionUuid(target) || target.toLowerCase() !== value.proposalId.toLowerCase() : target !== value[key]) invalid();
  }
  return freeze(structuredClone(value));
}
