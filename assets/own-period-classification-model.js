// Explicit classification for one own contract and payroll month. This model
// validates declarations, review commands and receipts without business effects.
// A source is a trusted server projection of immutable registration/adoption
// records, not a claim that a backup cutoff proves historical applicability.
import { salaryHash, salaryUuid, salaryKey, salarySerialized, salaryJsonbBytes, SalaryInputError } from './native-salary-catalog-model.js';
import { catalogItems } from './native-employment-catalog-model.js';
import { civilDay } from './employment-adoption-review-model.js';

export const PERIOD_CLASSIFICATION_VERSION = 'own-period-classification.v1';
export const PERIOD_CLASSIFICATION_MAX_BYTES = 32768;
export const PERIOD_CLASSIFICATION_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
export const PERIOD_CLASSIFICATION_READ = Object.freeze(['workforce.employee.read', 'payroll.parameter.read']);
export const periodClassificationPeriod = v => typeof v === 'string' && /^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(v);
const need = (ok, message, code = 'INPUT_INVALID') => { if (!ok) throw new SalaryInputError('PERIOD_CLASSIFICATION_' + code, message); };
const uuid = v => salaryUuid(v) && v !== '00000000-0000-0000-0000-000000000000';
const text = (v, min, max) => typeof v === 'string' && v === v.trim() && v === v.normalize('NFC') && v.length >= min && v.length <= max && !/[<>\u0000-\u001f\u007f]/.test(v);
const code = v => typeof v === 'string' && /^[0-9]{1,9}$/.test(v);
const nullable = (v, check) => v === null || check(v);
const exact = (v, keys) => {
 if (v === null || typeof v !== 'object' || Array.isArray(v) || Object.getPrototypeOf(v) !== Object.prototype) return false;
 const descriptors = Object.getOwnPropertyDescriptors(v);
 return Reflect.ownKeys(v).length === keys.length && keys.every(k => Object.hasOwn(descriptors, k) && Object.hasOwn(descriptors[k], 'value') && descriptors[k].enumerable);
};
const immutable = v => {
 if (v === null || typeof v !== 'object') return v;
 const copy = Array.isArray(v) ? v.map(immutable) : Object.fromEntries(Object.entries(v).map(([k, value]) => [k, immutable(value)]));
 return Object.freeze(copy);
};
const same = (a, b) => salarySerialized(a) === salarySerialized(b);
const size = v => need(salaryJsonbBytes(v) <= PERIOD_CLASSIFICATION_MAX_BYTES, 'La declaración completa supera su capacidad; no se recortó su procedencia.', 'LIMIT');
const cutoff = v => typeof v === 'string' && civilDay(v.slice(0, 10)) && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(v);
const instant = v => typeof v === 'string' && civilDay(v.slice(0, 10)) && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(v) && Number.isFinite(Date.parse(v));
const revision = v => Number.isInteger(v) && v >= 0 && v <= 1000;
const list = (v, maximum) => need(Array.isArray(v) && Object.getPrototypeOf(v) === Array.prototype && v.length <= maximum && Reflect.ownKeys(v).length === v.length + 1 && Array.from({length:v.length}, (_, i) => Object.getOwnPropertyDescriptor(v, String(i))).every(d => d && Object.hasOwn(d, 'value') && d.enumerable), 'El historial debe estar completo, sin huecos ni campos adicionales.', 'CONTRACT_INVALID');

export function periodClassificationScope(v) {
 need(exact(v, ['tenantId', 'bindingId', 'companyId']) && [v.tenantId, v.bindingId].every(uuid) && Number.isSafeInteger(v.companyId) && v.companyId > 0, 'Se necesita el ámbito municipal exacto.', 'CONTRACT_INVALID');
 return immutable(v);
}

// organizationId identifies the organizational sector; sectorCode identifies
// the payroll department. Neither is converted into the other or jurisdiction.
// Employment dates and classification dates are independent declared facts.
// A null endDate declares no end date; it never implies an active contract.
export function periodClassificationDefinition(v, period) {
 need(periodClassificationPeriod(period) && exact(v, ['agreementCode', 'categoryCode', 'organizationId', 'sectorCode', 'jurisdictionCode', 'startDate', 'endDate', 'effectiveFrom', 'effectiveUntil', 'documentDate', 'documentReference']), 'Revisá el período, el encuadre completo y su constancia.');
 need(['agreementCode', 'categoryCode', 'organizationId', 'sectorCode'].every(k => nullable(v[k], code)), 'Conservá los códigos exactos o un nulo explícito; no se completan códigos desconocidos.');
 need(v.jurisdictionCode === null || ['42', '55'].includes(v.jurisdictionCode), 'La jurisdicción requiere un código declarado admitido; no se deduce de la repartición.');
 need(['startDate', 'endDate', 'effectiveFrom', 'effectiveUntil'].every(k => nullable(v[k], civilDay)), 'Conservá fechas civiles exactas o nulos explícitos, sin convertir cortes ni fechas de registro.');
 need(v.startDate === null || v.endDate === null || v.startDate <= v.endDate, 'El egreso no puede anteceder al ingreso.');
 need(v.effectiveFrom === null || v.effectiveUntil === null || v.effectiveFrom <= v.effectiveUntil, 'El fin declarado del encuadre no puede anteceder a su inicio.');
 // A retrospective municipal declaration can be documented after the month.
 need(civilDay(v.documentDate) && text(v.documentReference, 3, 180), 'Informá la fecha exacta y referencia de la constancia municipal.');
 return immutable(v);
}

export function periodClassificationProvenance(v) {
 const native = exact(v, ['kind', 'registrationId', 'requestSha256']) && v.kind === 'native_registration';
 const adopted = exact(v, ['kind', 'registrationId', 'requestSha256', 'adoptionProposalId', 'adoptionReviewId', 'sealSha256', 'finalRevision']) && v.kind === 'employment_adoption_final';
 need((native || adopted) && uuid(v.registrationId) && salaryHash(v.requestSha256), 'Se necesita la procedencia inmutable del alta propia.', 'CONTRACT_INVALID');
 if (adopted) {
  need([v.adoptionProposalId, v.adoptionReviewId].every(uuid) && salaryHash(v.sealSha256), 'Se necesita la aplicación de adopción, su decisión y su sello originales.', 'CONTRACT_INVALID');
  const r = v.finalRevision;
  need(exact(r, ['revisionId', 'packageSha256', 'sourceSha256', 'cutoff', 'coreManifestSha256', 'curatedManifestSha256', 'factsSha256']) && uuid(r.revisionId) && [r.packageSha256, r.sourceSha256, r.coreManifestSha256, r.curatedManifestSha256, r.factsSha256].every(salaryHash) && cutoff(r.cutoff), 'El paquete final no conserva sus referencias exactas.', 'CONTRACT_INVALID');
 }
 return immutable(v);
}

export function periodClassificationSource(v) {
 need(exact(v, ['version', 'scope', 'period', 'subject', 'provenance']) && salaryHash(v.version) && periodClassificationPeriod(v.period), 'Se necesita la fuente propia del contrato y período.', 'CONTRACT_INVALID');
 const scope = periodClassificationScope(v.scope), s = v.subject, provenance = periodClassificationProvenance(v.provenance);
 need(exact(s, ['origin', 'contractId', 'personId', 'registrationId', 'identityToken']) && s.origin === 'MUNICONTROL' && [s.contractId, s.personId, s.registrationId].every(uuid) && salaryHash(s.identityToken) && s.registrationId === provenance.registrationId, 'La procedencia no coincide con la identidad propia del contrato.', 'CONTRACT_INVALID');
 return immutable({ ...v, scope, provenance });
}

export function periodClassificationCatalogue(v) {
 need(exact(v, ['version', 'items']) && salaryHash(v.version) && Array.isArray(v.items) && v.items.length >= 4 && v.items.length <= 1500 && Object.getPrototypeOf(v.items) === Array.prototype && Reflect.ownKeys(v.items).length === v.items.length + 1 && Array.from({ length: v.items.length }, (_, i) => Object.getOwnPropertyDescriptor(v.items, String(i))).every(d => d && Object.hasOwn(d, 'value') && d.enumerable), 'Se necesita el catálogo propio completo, sin omisiones ni campos adicionales.', 'CONTRACT_INVALID');
 for (const row of v.items) {
  need(exact(row, ['kind', 'key', 'code', 'label', 'agreementCode']) || exact(row, ['kind', 'key', 'code', 'label', 'agreementCode', 'registrationAllowed']), 'El catálogo contiene campos no verificados.', 'CONTRACT_INVALID');
  need(text(row.label, 1, 160) && text(row.key, 1, 120), 'El catálogo debe conservar sus referencias sin normalización implícita.', 'CONTRACT_INVALID');
 }
 // The existing helper validates references but also rebuilds row keys/order.
 // Validation must not replace any published item under its original version.
 try { catalogItems(v.items); } catch { need(false, 'No se verificó una clasificación municipal única y completa.', 'CONTRACT_INVALID'); }
 // registrationAllowed concerns new hires; it does not grant or deny historical
 // classification of an existing contract. The reviewed catalog remains intact.
 return immutable({ version: v.version, items: v.items });
}

function matchCatalogue(definition, catalogue) {
 const rows = catalogue.items;
 for (const [field, kind] of [['agreementCode', 'agreements'], ['organizationId', 'organizations'], ['sectorCode', 'sectors']]) {
  need(definition[field] === null || rows.filter(r => r.kind === kind && r.code === definition[field]).length === 1, 'Un código declarado no existe de forma única en el catálogo propio.', 'CLASSIFICATION_UNKNOWN');
 }
 if (definition.categoryCode !== null) {
  const matches = rows.filter(r => r.kind === 'categories' && r.code === definition.categoryCode && (definition.agreementCode === null || r.agreementCode === definition.agreementCode));
  need(matches.length === 1, 'La clase declarada no coincide de forma única con su convenio; no se infiere un convenio faltante.', 'CLASSIFICATION_UNKNOWN');
 }
}

// This checks explicit full-month facts only. It is not payroll eligibility or
// an approval: the API must also verify documentary evidence, independent review,
// catalog validity, employment eligibility and current authority. Partial/multiple
// classifications require a future interval model; they are never prorated here.
export function periodClassificationForFullPeriod(v, period, classification) {
 const d = periodClassificationDefinition(v, period), c = periodClassificationCatalogue(classification);
 matchCatalogue(d, c);
 need(['agreementCode', 'categoryCode', 'organizationId', 'sectorCode', 'jurisdictionCode', 'startDate', 'effectiveFrom', 'effectiveUntil'].every(k => d[k] !== null), 'Faltan datos o vigencias explícitas del período; su procedencia no los completa.', 'INCOMPLETE');
 const first = period + '-01', last = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0)).toISOString().slice(0, 10);
 need(d.effectiveFrom <= first && d.effectiveUntil >= last && d.startDate <= first && (d.endDate === null || d.endDate >= last), 'La declaración no cubre el mes completo. El tramo parcial requiere tratamiento explícito.', 'PARTIAL_PERIOD');
 return d;
}

export function periodClassificationPreparation(v) {
 need(exact(v, ['version', 'scope', 'contractId', 'period', 'scopeVersion', 'baseVersion', 'source', 'classification', 'canPropose']) && v.version === PERIOD_CLASSIFICATION_VERSION && uuid(v.contractId) && periodClassificationPeriod(v.period) && [v.scopeVersion, v.baseVersion].every(salaryHash) && typeof v.canPropose === 'boolean', 'No se verificó el contexto completo de preparación.', 'CONTRACT_INVALID');
 const scope = periodClassificationScope(v.scope), source = periodClassificationSource(v.source), classification = periodClassificationCatalogue(v.classification);
 need(same(scope, source.scope) && v.contractId === source.subject.contractId && v.period === source.period, 'La fuente corresponde a otro contrato, período o vínculo municipal.', 'SOURCE_CHANGED');
 return immutable({ ...v, scope, source, classification });
}

// Command validation alone is structural. A server must validate the proposal
// against its own trusted preparation projection before saving a new command.
export function periodClassificationCommand(v) {
 need(exact(v, ['version', 'command', 'scope', 'contractId', 'period', 'scopeVersion', 'baseVersion', 'sourceVersion', 'classificationVersion', 'identityToken', 'provenance', 'definition', 'reason', 'proposalId', 'proposalSha256', 'reviewConfirmed']) && v.version === PERIOD_CLASSIFICATION_VERSION && ['propose', 'approve', 'reject'].includes(v.command) && uuid(v.contractId) && periodClassificationPeriod(v.period) && [v.scopeVersion, v.baseVersion, v.sourceVersion, v.classificationVersion].every(salaryHash) && text(v.reason, 10, 1000) && typeof v.reviewConfirmed === 'boolean', 'La operación requiere su cuerpo completo y referencias originales.');
 const scope = periodClassificationScope(v.scope);
 let provenance = null, definition = null;
 if (v.command === 'propose') {
  need(salaryHash(v.identityToken) && v.proposalId === null && v.proposalSha256 === null && v.reviewConfirmed === false, 'Preparar conserva una declaración para otra persona.');
  provenance = periodClassificationProvenance(v.provenance); definition = periodClassificationDefinition(v.definition, v.period);
 } else need(v.identityToken === null && v.provenance === null && v.definition === null && uuid(v.proposalId) && salaryHash(v.proposalSha256) && v.reviewConfirmed === true, 'Elegí la propuesta original y confirmá su revisión independiente.');
 const body = immutable({ ...v, scope, provenance, definition });
 size(body); return body;
}

export function periodClassificationValidateProposal(v, preparation) {
 const body = periodClassificationCommand(v), p = periodClassificationPreparation(preparation);
 need(body.command === 'propose', 'La preparación requiere una nueva declaración.');
 need(p.canPropose, 'Tu cuenta no permite preparar un encuadre histórico propio.', 'FORBIDDEN');
 need(body.contractId === p.contractId && body.period === p.period && same(body.scope, p.scope) && body.scopeVersion === p.scopeVersion && body.baseVersion === p.baseVersion && body.sourceVersion === p.source.version && body.classificationVersion === p.classification.version && body.identityToken === p.source.subject.identityToken && same(body.provenance, p.source.provenance), 'Cambió el contexto o la procedencia original de la declaración.', 'SOURCE_CHANGED');
 matchCatalogue(body.definition, p.classification);
 return body;
}

export function preparePeriodClassification(preparation, definition, reason) {
 const p = periodClassificationPreparation(preparation);
 return periodClassificationValidateProposal({ version: PERIOD_CLASSIFICATION_VERSION, command: 'propose', scope: p.scope, contractId: p.contractId, period: p.period, scopeVersion: p.scopeVersion, baseVersion: p.baseVersion, sourceVersion: p.source.version, classificationVersion: p.classification.version, identityToken: p.source.subject.identityToken, provenance: p.source.provenance, definition, reason, proposalId: null, proposalSha256: null, reviewConfirmed: false }, p);
}

const digest = async body => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salarySerialized(body))))].map(b => b.toString(16).padStart(2, '0')).join('');
export async function periodClassificationHash(v) { return digest(periodClassificationCommand(v)); }

export async function createPeriodClassificationAttempt(v, key) {
 need(salaryKey(key), 'Se necesita una clave de intento explícita; no se generó otra.', 'CONTRACT_INVALID');
 const body = periodClassificationCommand(v), requestSha256 = await digest(body);
 return immutable({ key, requestSha256, body });
}

// Old attempts retain their original body/key/provenance, including obsolete
// versions. Recovery and replay must recheck the original actor on the server;
// this validator never refreshes the body from a newly queried source.
export async function periodClassificationAttempt(v) {
 need(exact(v, ['key', 'requestSha256', 'body']) && salaryKey(v.key) && salaryHash(v.requestSha256), 'No se verificó el intento original completo.', 'CONTRACT_INVALID');
 const key = v.key, requestSha256 = v.requestSha256, body = periodClassificationCommand(v.body);
 need(requestSha256 === await digest(body), 'El intento cambió el contenido original de la declaración.', 'CONTRACT_INVALID');
 return immutable({ key, requestSha256, body });
}

export function periodClassificationConfiguration(v, period) {
 const fields = ['version', 'revision', 'definition', 'proposalId', 'approvalId', 'sourceVersion', 'identityToken', 'provenance', 'classificationVersion'];
 need(periodClassificationPeriod(period) && exact(v, fields) && salaryHash(v.version) && revision(v.revision), 'No se verificó la revisión propia del período.', 'CONTRACT_INVALID');
 if (v.revision === 0) need(fields.slice(2).every(k => v[k] === null), 'Una revisión inicial no contiene una aprobación supuesta.', 'CONTRACT_INVALID');
 else {
  need([v.proposalId, v.approvalId].every(uuid) && [v.sourceVersion, v.identityToken, v.classificationVersion].every(salaryHash), 'La configuración no conserva la propuesta y aprobación originales.', 'CONTRACT_INVALID');
  periodClassificationDefinition(v.definition, period); periodClassificationProvenance(v.provenance);
  const d = v.definition, first = period + '-01', last = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0)).toISOString().slice(0, 10);
  need(['agreementCode', 'categoryCode', 'organizationId', 'sectorCode', 'jurisdictionCode', 'startDate', 'effectiveFrom', 'effectiveUntil'].every(k => d[k] !== null) && d.effectiveFrom <= first && d.effectiveUntil >= last && d.startDate <= first && (d.endDate === null || d.endDate >= last), 'La aprobación no conserva hechos completos del mes.', 'CONTRACT_INVALID');
 }
 return immutable(v);
}

export function periodClassificationSummary(v) {
 need(exact(v, ['id', 'requestSha256', 'baseVersion', 'sourceVersion', 'classificationVersion', 'reason', 'createdAt', 'authorLabel', 'canReview', 'status', 'decision']) && uuid(v.id) && [v.requestSha256, v.baseVersion, v.sourceVersion, v.classificationVersion].every(salaryHash) && text(v.reason, 10, 1000) && instant(v.createdAt) && text(v.authorLabel, 1, 160) && typeof v.canReview === 'boolean' && ['pending', 'approved', 'rejected'].includes(v.status), 'No se verificó la propuesta del período.', 'CONTRACT_INVALID');
 if (v.status === 'pending') need(v.decision === null, 'Una propuesta pendiente no contiene una decisión.', 'CONTRACT_INVALID');
 else need(v.canReview === false && exact(v.decision, ['command', 'reason', 'actorLabel', 'recordedAt', 'revision']) && v.decision.command === (v.status === 'approved' ? 'approve' : 'reject') && text(v.decision.reason, 10, 1000) && text(v.decision.actorLabel, 1, 160) && instant(v.decision.recordedAt) && revision(v.decision.revision) && (v.status !== 'approved' || v.decision.revision > 0), 'La decisión no corresponde a la propuesta conservada.', 'CONTRACT_INVALID');
 return immutable(v);
}

export function periodClassificationBootstrap(v) {
 need(exact(v, ['version', 'preparation', 'configuration', 'proposals', 'permissions', 'complete', 'payrollCalculated', 'payrollPosted']) && v.version === PERIOD_CLASSIFICATION_VERSION && v.complete === true && v.payrollCalculated === false && v.payrollPosted === false && exact(v.permissions, ['canPropose', 'canReview']) && Object.values(v.permissions).every(x => typeof x === 'boolean'), 'No se verificó la consulta completa del encuadre propio.', 'CONTRACT_INVALID');
 const p = periodClassificationPreparation(v.preparation), c = periodClassificationConfiguration(v.configuration, p.period);
 need(p.baseVersion === c.version && p.canPropose === v.permissions.canPropose, 'La preparación no coincide con la revisión o permiso vigente.', 'CONTRACT_INVALID');
 list(v.proposals, 1000); const ids = new Set();
 for (const row of v.proposals) { periodClassificationSummary(row); need(!ids.has(row.id.toLowerCase()) && (!row.canReview || v.permissions.canReview), 'El historial repite una propuesta o amplía el permiso de revisión.', 'CONTRACT_INVALID'); ids.add(row.id.toLowerCase()); }
 need(salaryJsonbBytes(v) <= PERIOD_CLASSIFICATION_MAX_RESPONSE_BYTES, 'La consulta completa supera su capacidad; no se recortaron propuestas.', 'LIMIT');
 return immutable(v);
}

export async function periodClassificationDetail(v) {
 need(exact(v, ['version', 'scopeVersion', 'proposal', 'body', 'baseDefinition', 'source', 'classification', 'current']) && v.version === PERIOD_CLASSIFICATION_VERSION && salaryHash(v.scopeVersion) && typeof v.current === 'boolean', 'No se verificó el detalle completo del encuadre.', 'CONTRACT_INVALID');
 const p = periodClassificationSummary(v.proposal), body = periodClassificationCommand(v.body), source = periodClassificationSource(v.source), classification = periodClassificationCatalogue(v.classification);
 need(body.command === 'propose' && body.baseVersion === p.baseVersion && body.sourceVersion === p.sourceVersion && body.classificationVersion === p.classificationVersion && body.reason === p.reason && body.contractId === source.subject.contractId && body.period === source.period && same(body.scope, source.scope) && body.identityToken === source.subject.identityToken && body.sourceVersion === source.version && body.classificationVersion === classification.version && same(body.provenance, source.provenance), 'El detalle no coincide con la identidad, procedencia y catálogo originales.', 'CONTRACT_INVALID');
 if (v.baseDefinition !== null) periodClassificationDefinition(v.baseDefinition, body.period);
 matchCatalogue(body.definition, classification);
 const copy = immutable(v);
 need(p.requestSha256 === await digest(body), 'El contenido no coincide con el hash de la propuesta conservada.', 'CONTRACT_INVALID');
 return copy;
}

export async function decidePeriodClassification(bootstrap, detail, command, reason) {
 const b = periodClassificationBootstrap(bootstrap), d = await periodClassificationDetail(detail), p = d.proposal, preparation = b.preparation;
 need(['approve', 'reject'].includes(command) && b.permissions.canReview && p.canReview && p.status === 'pending' && d.scopeVersion === preparation.scopeVersion && d.body.contractId === preparation.contractId && d.body.period === preparation.period && same(d.body.scope, preparation.scope) && b.proposals.some(row => row.id === p.id && row.requestSha256 === p.requestSha256 && row.baseVersion === p.baseVersion && row.sourceVersion === p.sourceVersion && row.classificationVersion === p.classificationVersion && row.status === 'pending' && row.canReview), 'Elegí una propuesta del mismo contrato y período que pueda revisar otra persona.', 'INDEPENDENT_REQUIRED');
 if (command === 'approve') {
  need(d.current && p.baseVersion === b.configuration.version && p.sourceVersion === preparation.source.version && p.classificationVersion === preparation.classification.version && d.body.identityToken === preparation.source.subject.identityToken && same(d.body.provenance, preparation.source.provenance), 'Cambió la revisión, identidad, procedencia o catálogo. No se puede aprobar esta propuesta.', 'BASE_CHANGED');
  periodClassificationForFullPeriod(d.body.definition, preparation.period, preparation.classification);
 }
 return periodClassificationCommand({ ...d.body, command, scopeVersion: preparation.scopeVersion, identityToken: null, provenance: null, definition: null, reason, proposalId: p.id, proposalSha256: p.requestSha256, reviewConfirmed: true });
}

export async function periodClassificationReceipt(v, attempt = null) {
 need(exact(v, ['version', 'eventId', 'proposalId', 'requestKey', 'requestSha256', 'body', 'status', 'revision', 'configurationVersion', 'replayed', 'payrollCalculated', 'payrollPosted']) && v.version === PERIOD_CLASSIFICATION_VERSION && [v.eventId, v.proposalId].every(uuid) && salaryKey(v.requestKey) && [v.requestSha256, v.configurationVersion].every(salaryHash) && revision(v.revision) && typeof v.replayed === 'boolean' && v.payrollCalculated === false && v.payrollPosted === false, 'No se verificó el comprobante completo del encuadre.', 'CONTRACT_INVALID');
 const body = periodClassificationCommand(v.body), copy = immutable(v), original = attempt === null ? null : await periodClassificationAttempt(attempt);
 need(copy.status === ({propose:'pending', approve:'approved', reject:'rejected'})[body.command] && (body.command === 'propose' ? copy.eventId === copy.proposalId && copy.configurationVersion === body.baseVersion : copy.proposalId === body.proposalId), 'El comprobante no corresponde a la operación original.', 'CONTRACT_INVALID');
 need(body.command !== 'approve' || copy.revision > 0 && copy.configurationVersion !== body.baseVersion, 'La aprobación no conservó una nueva revisión.', 'CONTRACT_INVALID');
 need(copy.requestSha256 === await digest(body), 'El comprobante cambió el contenido original.', 'CONTRACT_INVALID');
 if (original) need(copy.requestKey === original.key && copy.requestSha256 === original.requestSha256 && same(copy.body, original.body), 'El comprobante sustituyó el cuerpo o clave del intento.', 'CONTRACT_INVALID');
 return copy;
}

export const periodClassificationRetainAttempt = (error, attempt, recovery = false) => !!(recovery || attempt?.uncertain || !error?.status || error.status >= 500 || error.status === 409 && error.code === 'PERIOD_CLASSIFICATION_BUSY');
export function periodClassificationErrorGuidance(error) {
 const messages = { PERIOD_CLASSIFICATION_BUSY: 'Otra operación está en curso. Conservamos el mismo intento; consultá su confirmación.', PERIOD_CLASSIFICATION_BASE_CHANGED: 'Cambió la revisión o el catálogo. Conservamos el borrador para comparar antes de preparar otro envío.', PERIOD_CLASSIFICATION_SOURCE_CHANGED: 'Cambió la identidad o procedencia. Conservamos el borrador y la referencia original del intento.', PERIOD_CLASSIFICATION_SCOPE_CHANGED: 'Cambió la cuenta, el contrato o el período. Recuperá el intento desde su ámbito original.', PERIOD_CLASSIFICATION_INDEPENDENT_REQUIRED: 'La decisión requiere otra persona habilitada.', PERIOD_CLASSIFICATION_INCOMPLETE: 'Completá los hechos y vigencias explícitas del período; la procedencia no los completa.', PERIOD_CLASSIFICATION_PARTIAL_PERIOD: 'La declaración no cubre todo el mes. Revisá sus intervalos sin calcular una proporción supuesta.' };
 if (messages[error?.code]) return messages[error.code];
 if ([401, 403].includes(error?.status)) return 'Tu sesión o permiso cambió. Consultá con una sesión autorizada.';
 if (!error?.status || error.status >= 500) return 'No se pudo confirmar la operación. Conservamos el cuerpo y clave originales; consultá el mismo intento.';
 return 'Revisá la declaración y su constancia municipal. Conservamos los datos del formulario.';
}
