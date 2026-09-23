import {catalogItems, catalogUuid, catalogAttemptKey} from './native-employment-catalog-model.js';

export const CHANGE_VERSION = 'native-employment-change.v1';
export {catalogUuid as changeUuid, catalogAttemptKey as changeAttemptKey};
export class ChangeInputError extends Error {
  constructor(code, message) { super(message); this.name = 'ChangeInputError'; this.code = code; }
}
const fail = (message, code = 'INPUT_INVALID') => { throw new ChangeInputError(code, message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const date = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const civil = new Date(value.slice(0, 10) + 'T00:00:00Z');
  return Number.isFinite(civil.getTime()) && civil.toISOString().slice(0, 10) === value.slice(0, 10);
};
const text = (value, min, max, label) => {
  if (typeof value !== 'string') fail(`Revisá ${label}.`);
  const normalized = value.normalize('NFC').trim();
  if ([...normalized].length < min || [...normalized].length > max || /[\p{Cc}<>]/u.test(normalized)) fail(`Revisá ${label}: entre ${min} y ${max} caracteres, sin etiquetas ni controles.`);
  return normalized;
};
export function changeValues(value) {
  if (!exact(value, ['agreementCode', 'categoryCode', 'organizationId', 'sectorCode', 'jobTitle'])) fail('El encuadre debe contener convenio, categoría, sector, repartición y cargo.');
  for (const field of ['agreementCode', 'categoryCode', 'organizationId', 'sectorCode']) if (typeof value[field] !== 'string' || !/^\d{1,9}$/.test(value[field])) fail('Revisá los códigos del encuadre.');
  return {...value, jobTitle: text(value.jobTitle, 0, 120, 'el cargo o función')};
}
export function changeProposalInput(value) {
  if (!exact(value, ['contractId', 'identityToken', 'scopeVersion', 'baseVersion', 'catalogVersion', 'values', 'legalReference', 'reason'])
    || !catalogUuid(value.contractId) || ![value.identityToken, value.scopeVersion, value.baseVersion, value.catalogVersion].every(hash)) fail('Volvé a consultar el legajo y sus opciones antes de preparar la rectificación.');
  return {contractId: value.contractId.toLowerCase(), identityToken: value.identityToken, scopeVersion: value.scopeVersion,
    baseVersion: value.baseVersion, catalogVersion: value.catalogVersion, values: changeValues(value.values),
    legalReference: text(value.legalReference, 3, 180, 'la resolución o documento'), reason: text(value.reason, 10, 1000, 'el motivo')};
}
export function changeReviewInput(value) {
  if (!exact(value, ['contractId', 'proposalId', 'scopeVersion', 'decision', 'reason']) || !catalogUuid(value.contractId) || !catalogUuid(value.proposalId)
    || !hash(value.scopeVersion) || !['approve', 'reject'].includes(value.decision)) fail('La revisión debe indicar el legajo, la propuesta y una decisión.');
  return {contractId: value.contractId.toLowerCase(), proposalId: value.proposalId.toLowerCase(), scopeVersion: value.scopeVersion,
    decision: value.decision, reason: text(value.reason, 10, 1000, 'el motivo de la revisión')};
}
export function changeDiff(before, after) {
  const a = changeValues(before), b = changeValues(after);
  return ['agreementCode', 'categoryCode', 'organizationId', 'sectorCode', 'jobTitle'].filter(field => a[field] !== b[field]).map(field => ({field, before: a[field], after: b[field]}));
}
const contract = valid => { if (!valid) fail('La respuesta del legajo no pudo verificarse. Volvé a consultar antes de continuar.', 'CONTRACT_INVALID'); };
const status = value => ['pending', 'approved', 'rejected'].includes(value);
function values(value) { try { changeValues(value); } catch { contract(false); } }
function labels(value) { contract(exact(value, ['agreementName', 'categoryName', 'organizationName', 'sectorName']) && Object.values(value).every(v => typeof v === 'string' && [...v].length >= 1 && [...v].length <= 160 && !/[\p{Cc}<>]/u.test(v))); }
function subject(value, contractId) {
  contract(exact(value, ['contractId', 'legajo', 'employeeName', 'identityToken', 'sourceCutoff', 'origin', 'registrationId', 'registeredAt']) && catalogUuid(value.contractId) && (!contractId || value.contractId.toLowerCase() === contractId.toLowerCase())
    && catalogUuid(value.registrationId) && typeof value.legajo === 'string' && /^[1-9]\d{0,8}$/.test(value.legajo)
    && typeof value.employeeName === 'string' && [...value.employeeName].length >= 3 && [...value.employeeName].length <= 160
    && hash(value.identityToken) && value.sourceCutoff === null && value.origin === 'MUNICONTROL' && date(value.registeredAt));
}
function summary(value, detail = false) {
  contract(exact(value, ['id', 'status', 'reason', 'legalReference', 'createdAt', 'authorLabel', 'baseVersion', 'canReview', ...(detail ? ['contractId', 'subject', 'catalogVersion', 'before', 'after', 'review'] : [])]) && catalogUuid(value.id) && status(value.status) && hash(value.baseVersion) && date(value.createdAt)
    && typeof value.reason === 'string' && [...value.reason].length >= 10 && [...value.reason].length <= 1000
    && typeof value.legalReference === 'string' && [...value.legalReference].length >= 3 && [...value.legalReference].length <= 180
    && typeof value.authorLabel === 'string' && [...value.authorLabel].length >= 1 && [...value.authorLabel].length <= 160
    && typeof value.canReview === 'boolean' && (value.status === 'pending' || !value.canReview));
}
export function validateChangeBootstrap(value, contractId) {
  contract(exact(value, ['version', 'scopeVersion', 'subject', 'employment', 'catalog', 'permissions', 'proposals', 'historyTruncated']) && value.version === CHANGE_VERSION && hash(value.scopeVersion)); subject(value.subject, contractId);
  const current = value.employment, catalog = value.catalog;
  contract(exact(current, ['values', 'labels', 'version', 'revision', 'appliedAt']) && hash(current.version) && Number.isSafeInteger(current.revision) && current.revision >= 0 && current.revision <= 100
    && (current.revision === 0 ? current.appliedAt === null : date(current.appliedAt)));
  values(current.values); labels(current.labels);
  contract(exact(catalog, ['items', 'version', 'origin', 'revision', 'publishedAt']) && hash(catalog.version) && Number.isSafeInteger(catalog.revision) && catalog.revision >= 0 && catalog.revision <= 1000
    && (catalog.origin === 'GRH' ? catalog.revision === 0 && catalog.publishedAt === null : catalog.origin === 'MUNICONTROL' && catalog.revision > 0 && date(catalog.publishedAt)));
  try { catalogItems(catalog.items); } catch { contract(false); }
  contract(exact(value.permissions, ['canPropose', 'canReview']) && typeof value.permissions.canPropose === 'boolean' && typeof value.permissions.canReview === 'boolean'
    && Array.isArray(value.proposals) && value.proposals.length <= 20 && typeof value.historyTruncated === 'boolean');
  value.proposals.forEach(p => summary(p)); contract(new Set(value.proposals.map(p => p.id.toLowerCase())).size === value.proposals.length);
  return value;
}
export function validateChangeProposal(value, contractId, proposalId) {
  contract(exact(value, ['version', 'proposal']) && value.version === CHANGE_VERSION && object(value.proposal)); const p = value.proposal; summary(p, true);
  contract(catalogUuid(p.contractId) && (!contractId || p.contractId.toLowerCase() === contractId.toLowerCase())
    && (!proposalId || p.id.toLowerCase() === proposalId.toLowerCase()) && hash(p.catalogVersion)); subject(p.subject, p.contractId);
  contract(exact(p.before, ['values', 'labels']) && exact(p.after, ['values', 'labels'])); values(p.before.values); labels(p.before.labels); values(p.after.values); labels(p.after.labels);
  contract(p.status === 'pending' ? p.review === null : exact(p.review, ['decision', 'reason', 'reviewedAt', 'reviewerLabel']) && p.review.decision === (p.status === 'approved' ? 'approve' : 'reject')
    && typeof p.review.reason === 'string' && [...p.review.reason].length >= 10 && [...p.review.reason].length <= 1000
    && date(p.review.reviewedAt) && typeof p.review.reviewerLabel === 'string' && [...p.review.reviewerLabel].length >= 1 && [...p.review.reviewerLabel].length <= 160);
  return value;
}
export function validateChangeReceipt(value, contractId) {
  contract(exact(value, ['version', 'operation', 'contractId', 'proposalId', 'status', 'employmentVersion', 'revision', 'replayed', 'payrollModified']) && value.version === CHANGE_VERSION && ['propose', 'review'].includes(value.operation)
    && catalogUuid(value.contractId) && (!contractId || value.contractId.toLowerCase() === contractId.toLowerCase()) && catalogUuid(value.proposalId)
    && status(value.status) && hash(value.employmentVersion) && Number.isSafeInteger(value.revision) && value.revision >= 0 && value.revision <= 100
    && typeof value.replayed === 'boolean' && value.payrollModified === false
    && (value.operation === 'propose' ? value.status === 'pending' : value.status !== 'pending') && (value.status !== 'approved' || value.revision > 0));
  return value;
}
