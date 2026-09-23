// Shared contract: reference encuadres for future registrations, never salary rules.
export const CATALOG_VERSION = 'native-employment-catalog.v1';
export const CATALOG_KINDS = Object.freeze(['agreements', 'categories', 'organizations', 'sectors']);
export class CatalogInputError extends Error {
  constructor(code, message) { super(message); this.name = 'CatalogInputError'; this.code = code; }
}
const fail = (message, code = 'INPUT_INVALID') => { throw new CatalogInputError(code, message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
export const catalogUuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export const catalogAttemptKey = value => catalogUuid(value) && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const code = value => typeof value === 'string' && /^\d{1,9}$/.test(value);
const text = (value, min, max, label) => {
  if (typeof value !== 'string') fail(`Revisá ${label}.`);
  const result = value.normalize('NFC').trim();
  if ([...result].length < min || [...result].length > max || /[\u0000-\u001f\u007f<>]/u.test(result)) fail(`Revisá ${label}: entre ${min} y ${max} caracteres, sin etiquetas ni controles.`);
  return result;
};
const identity = row => `${row.kind}:${row.agreementCode ?? ''}:${row.code}`;
export function catalogItems(input) {
  if (!Array.isArray(input) || input.length < 4 || input.length > 1500) fail('El catálogo debe contener las cuatro clases y hasta 1.500 opciones.');
  const seen = new Set(), kinds = new Set(), agreements = new Set();
  const items = input.map(row => {
    if (!exact(row, ['kind', 'key', 'code', 'label', 'agreementCode']) || !CATALOG_KINDS.includes(row.kind) || !code(row.code)
      || typeof row.key !== 'string' || !row.key.length || row.key.length > 120 || /[\u0000-\u001f\u007f<>]/u.test(row.key)) fail('Hay una opción incompleta o con un código inválido.');
    if (row.kind === 'categories' ? !code(row.agreementCode) : row.agreementCode !== null) fail('Cada categoría debe indicar su convenio.');
    if ((row.kind === 'agreements' && ['9', '10'].includes(row.code.replace(/^0+/, ''))) || ['9', '10'].includes(row.agreementCode?.replace(/^0+/, ''))) fail('Los convenios 9 y 10 no están habilitados para altas propias.');
    const key = identity(row);
    if (seen.has(key)) fail('Hay códigos repetidos dentro de una clase o de un convenio.');
    seen.add(key); kinds.add(row.kind);
    if (row.kind === 'agreements') agreements.add(row.code);
    return {kind: row.kind, key, code: row.code, label: text(row.label, 1, 160, 'el nombre de la opción'), agreementCode: row.agreementCode};
  });
  if (kinds.size !== 4) fail('Debe quedar al menos una opción de cada clase.');
  if (items.some(row => row.kind === 'categories' && !agreements.has(row.agreementCode))) fail('Hay categorías cuyo convenio no está en el catálogo.');
  return items.sort((a, b) => identity(a) < identity(b) ? -1 : identity(a) > identity(b) ? 1 : 0);
}
export function catalogProposalInput(value) {
  if (!exact(value, ['scopeVersion', 'baseVersion', 'reason', 'items']) || !hash(value.baseVersion) || !hash(value.scopeVersion)) fail('Actualizá el catálogo antes de preparar la propuesta.');
  return {scopeVersion: value.scopeVersion, baseVersion: value.baseVersion, reason: text(value.reason, 10, 1000, 'el motivo y su referencia'), items: catalogItems(value.items)};
}
export function catalogReviewInput(value) {
  if (!exact(value, ['scopeVersion', 'proposalId', 'decision', 'reason']) || !hash(value.scopeVersion) || !catalogUuid(value.proposalId) || !['approve', 'reject'].includes(value.decision)) fail('La revisión no contiene una propuesta y decisión válidas.');
  return {scopeVersion: value.scopeVersion, proposalId: value.proposalId.toLowerCase(), decision: value.decision, reason: text(value.reason, 10, 1000, 'el motivo de la revisión')};
}
export function catalogDiff(baseItems, nextItems) {
  const before = new Map(baseItems.map(row => [identity(row), row])), after = new Map(nextItems.map(row => [identity(row), row]));
  return [...new Set([...before.keys(), ...after.keys()])].sort().flatMap(key => {
    const a = before.get(key), b = after.get(key);
    if (a && b && a.label === b.label) return [];
    const row = b || a;
    return [{change: !a ? 'added' : !b ? 'removed' : 'changed', kind: row.kind, code: row.code, agreementCode: row.agreementCode, before: a || null, after: b || null}];
  });
}
const contract = valid => { if (!valid) fail('La respuesta no pudo verificarse. Volvé a consultar antes de continuar.', 'CONTRACT_INVALID'); };
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const status = value => ['pending', 'approved', 'rejected'].includes(value);
function readItems(items) {
  try { catalogItems(items); } catch { contract(false); }
}
function proposalSummary(p) {
  contract(object(p) && catalogUuid(p.id) && status(p.status) && typeof p.reason === 'string' && [...p.reason].length <= 1000
    && date(p.createdAt) && typeof p.authorLabel === 'string' && p.authorLabel.length <= 320 && hash(p.baseVersion) && typeof p.canReview === 'boolean'
    && (p.status === 'pending' || !p.canReview));
}
export function validateCatalogBootstrap(value) {
  contract(object(value) && value.version === CATALOG_VERSION && hash(value.scopeVersion) && object(value.catalog) && hash(value.catalog.version)
    && ['GRH', 'MUNICONTROL'].includes(value.catalog.origin) && Number.isSafeInteger(value.catalog.revision) && value.catalog.revision >= 0
    && (value.catalog.origin === 'GRH' ? value.catalog.revision === 0 && value.catalog.publishedAt === null : value.catalog.revision > 0 && date(value.catalog.publishedAt))
    && object(value.permissions) && typeof value.permissions.canPropose === 'boolean' && typeof value.permissions.canReview === 'boolean'
    && Array.isArray(value.proposals) && value.proposals.length <= 20 && typeof value.historyTruncated === 'boolean');
  readItems(value.catalog.items); value.proposals.forEach(proposalSummary);
  contract(new Set(value.proposals.map(p => p.id)).size === value.proposals.length);
  return value;
}
export function validateCatalogProposal(value) {
  contract(object(value) && value.version === CATALOG_VERSION && object(value.proposal));
  const p = value.proposal; proposalSummary(p); readItems(p.items); readItems(p.baseItems);
  contract(p.status === 'pending' ? p.review === null : object(p.review) && p.review.decision === (p.status === 'approved' ? 'approve' : 'reject')
    && typeof p.review.reason === 'string' && [...p.review.reason].length <= 1000 && date(p.review.reviewedAt) && typeof p.review.reviewerLabel === 'string' && p.review.reviewerLabel.length <= 320);
  return value;
}
export function validateCatalogReceipt(value) {
  contract(object(value) && value.version === CATALOG_VERSION && ['propose', 'review'].includes(value.operation) && catalogUuid(value.proposalId)
    && status(value.status) && hash(value.catalogVersion) && Number.isSafeInteger(value.revision) && value.revision >= 0 && typeof value.replayed === 'boolean'
    && (value.operation === 'propose' ? value.status === 'pending' : value.status !== 'pending') && (value.status !== 'approved' || value.revision > 0));
  return value;
}
