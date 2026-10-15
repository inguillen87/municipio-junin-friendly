// Approved monthly hours of an agreement are a separate municipal fact.
// They do not come from a contract, a clock, a calendar or a payroll formula.
import { salaryExact as shape, salaryHash, salaryUuid, salaryKey, salarySerialized, salaryJsonbBytes, SalaryInputError } from './native-salary-catalog-model.js';
import { civilDay } from './employment-adoption-review-model.js';

export const AGREEMENT_WORKING_TIME_VERSION = 'own-agreement-working-time.v1';
export const AGREEMENT_WORKING_TIME_MAX_ROWS = 10000;
export const AGREEMENT_WORKING_TIME_MAX_BYTES = 4 * 1024 * 1024;
export const AGREEMENT_WORKING_TIME_READ = Object.freeze(['workforce.employee.read', 'payroll.parameter.read']);
const need = (ok, message, code = 'INPUT_INVALID') => { if (!ok) throw new SalaryInputError('AGREEMENT_WORKING_TIME_' + code, message); };
const periodValid = v => typeof v === 'string' && /^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(v);
const codeValid = v => typeof v === 'string' && /^[0-9]{1,9}$/.test(v);
const text = (v, min, max) => typeof v === 'string' && v === v.trim() && v === v.normalize('NFC') && v.length >= min && v.length <= max && !/[<>\u0000-\u001f\u007f]/.test(v);
const instant = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
const exact = (v, keys) => shape(v, keys) && Object.getPrototypeOf(v) === Object.prototype && Reflect.ownKeys(v).length === keys.length && Object.values(Object.getOwnPropertyDescriptors(v)).every(d => Object.hasOwn(d, 'value') && d.enumerable);
function list(v, empty = true, maximum = AGREEMENT_WORKING_TIME_MAX_ROWS) {
 need(Array.isArray(v) && v.length <= maximum && (empty || v.length > 0) && Reflect.ownKeys(v).length === v.length + 1 && Array.from({length:v.length}, (_, i) => Object.getOwnPropertyDescriptor(v, String(i))).every(d => d && Object.hasOwn(d, 'value')), 'Se necesita el conjunto completo, sin huecos ni filas agregadas.', 'CONTRACT_INVALID');
}
function size(v) { need(salaryJsonbBytes(v) <= AGREEMENT_WORKING_TIME_MAX_BYTES, 'El conjunto completo supera su capacidad. No se recortaron convenios.', 'LIMIT'); }

export function agreementWorkingTimeDefinition(v, period) {
 need(periodValid(period) && exact(v, ['monthlyHours', 'asOfDate', 'documentReference']), 'Revisá período, horas mensuales del convenio y respaldo municipal.');
 need(v.monthlyHours === null || typeof v.monthlyHours === 'string' && /^(0|[1-9][0-9]{0,17})(\.[0-9]{1,8})?$/.test(v.monthlyHours), 'Las horas del convenio son un decimal exacto declarado. Vacío no equivale a cero ni se obtiene de la jornada de una persona.');
 need(civilDay(v.asOfDate) && v.asOfDate.slice(0, 7) <= period && text(v.documentReference, 3, 180), 'Informá una fecha válida hasta el período y la constancia que respalda el convenio.');
 return {...v};
}

export function agreementWorkingTimeSource(v) {
 need(exact(v, ['version', 'agreements']) && salaryHash(v.version), 'No se verificó el catálogo completo de convenios propios.', 'CONTRACT_INVALID');
 list(v.agreements); let previous = '';
 for (const r of v.agreements) {
  need(exact(r, ['agreementCode', 'agreementToken', 'label', 'registrationAllowed']) && codeValid(r.agreementCode) && salaryHash(r.agreementToken) && text(r.label, 1, 160) && typeof r.registrationAllowed === 'boolean' && r.agreementCode > previous, 'Hay un convenio sin verificar, repetido o desordenado. Los convenios conservados tampoco se descartan.', 'CONTRACT_INVALID');
  previous = r.agreementCode;
 }
 size(v); return v;
}

export function agreementWorkingTimeItems(v, period, {empty = true} = {}) {
 need(periodValid(period), 'Elegí un período válido.'); list(v, empty); let previous = '';
 for (const r of v) {
  need(exact(r, ['agreementCode', 'agreementToken', 'definition']) && codeValid(r.agreementCode) && salaryHash(r.agreementToken) && r.agreementCode > previous, 'Las declaraciones deben conservar cada convenio ordenado, sin duplicados.', 'CONTRACT_INVALID');
  previous = r.agreementCode; agreementWorkingTimeDefinition(r.definition, period);
 }
 size(v); return v;
}

function matchSource(items, source) {
 need(items.length === source.agreements.length && items.every((r, i) => r.agreementCode === source.agreements[i].agreementCode && r.agreementToken === source.agreements[i].agreementToken), 'La declaración debe contener todos los convenios de la fuente consultada, conservando códigos e identidades. La búsqueda no cambia el conjunto.', 'POPULATION_CHANGED');
}

export function agreementWorkingTimeCommand(v) {
 need(exact(v, ['command', 'period', 'scopeVersion', 'baseVersion', 'sourceVersion', 'proposalId', 'proposalSha256', 'items', 'reason', 'reviewConfirmed']) && ['propose', 'approve', 'reject'].includes(v.command) && periodValid(v.period) && [v.scopeVersion, v.baseVersion, v.sourceVersion].every(salaryHash) && text(v.reason, 10, 1000) && typeof v.reviewConfirmed === 'boolean', 'Revisá operación, período, versiones y fundamento completos.');
 if (v.command === 'propose') {
  need(v.proposalId === null && v.proposalSha256 === null && v.reviewConfirmed === false, 'Preparar conserva una propuesta para otra persona.');
  agreementWorkingTimeItems(v.items, v.period, {empty:false});
 } else need(salaryUuid(v.proposalId) && salaryHash(v.proposalSha256) && v.items === null && v.reviewConfirmed === true, 'Elegí una propuesta y confirmá su revisión independiente.');
 size(v); return v;
}

export function agreementWorkingTimeConfiguration(v, period) {
 need(exact(v, ['version', 'revision', 'items', 'proposalId', 'approvalId']) && salaryHash(v.version) && Number.isInteger(v.revision) && v.revision >= 0 && v.revision <= 1000, 'No se verificó la revisión aprobada del período.', 'CONTRACT_INVALID');
 agreementWorkingTimeItems(v.items, period);
 need(v.revision === 0 ? v.items.length === 0 && v.proposalId === null && v.approvalId === null : v.items.length > 0 && [v.proposalId, v.approvalId].every(salaryUuid), 'La revisión no conserva una declaración y su aprobación.', 'CONTRACT_INVALID');
 return v;
}

export function agreementWorkingTimeSummary(v) {
 need(exact(v, ['id', 'requestSha256', 'baseVersion', 'sourceVersion', 'itemCount', 'reason', 'createdAt', 'authorLabel', 'canReview', 'status', 'decision']) && salaryUuid(v.id) && [v.requestSha256, v.baseVersion, v.sourceVersion].every(salaryHash) && Number.isInteger(v.itemCount) && v.itemCount > 0 && v.itemCount <= AGREEMENT_WORKING_TIME_MAX_ROWS && text(v.reason, 10, 1000) && instant(v.createdAt) && text(v.authorLabel, 1, 160) && typeof v.canReview === 'boolean' && ['pending', 'approved', 'rejected'].includes(v.status), 'No se verificó una propuesta completa de horas del convenio.', 'CONTRACT_INVALID');
 need(v.status === 'pending' ? v.decision === null : exact(v.decision, ['command', 'reason', 'actorLabel', 'recordedAt', 'revision']) && v.decision.command === (v.status === 'approved' ? 'approve' : 'reject') && text(v.decision.reason, 10, 1000) && text(v.decision.actorLabel, 1, 160) && instant(v.decision.recordedAt) && Number.isInteger(v.decision.revision) && v.decision.revision >= 0 && v.decision.revision <= 1000, 'La decisión no coincide con la propuesta conservada.', 'CONTRACT_INVALID');
 need(v.status === 'pending' || v.canReview === false, 'La propuesta ya decidida no admite otra decisión.', 'CONTRACT_INVALID'); return v;
}

export function agreementWorkingTimeBootstrap(v) {
 need(exact(v, ['version', 'period', 'scopeVersion', 'source', 'configuration', 'proposals', 'permissions', 'complete', 'payrollCalculated', 'payrollPosted']) && v.version === AGREEMENT_WORKING_TIME_VERSION && periodValid(v.period) && salaryHash(v.scopeVersion) && v.complete === true && v.payrollCalculated === false && v.payrollPosted === false && exact(v.permissions, ['canPropose', 'canReview']) && Object.values(v.permissions).every(x => typeof x === 'boolean'), 'No se verificó la consulta completa del período y sus permisos.', 'CONTRACT_INVALID');
 agreementWorkingTimeSource(v.source); agreementWorkingTimeConfiguration(v.configuration, v.period); list(v.proposals, true, 1000);
 const ids = new Set();
 for (const p of v.proposals) { agreementWorkingTimeSummary(p); need(!ids.has(p.id.toLowerCase()), 'Hay propuestas repetidas.', 'CONTRACT_INVALID'); ids.add(p.id.toLowerCase()); }
 return v;
}

export async function agreementWorkingTimeHash(v) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salarySerialized(v))))].map(b => b.toString(16).padStart(2, '0')).join(''); }
export async function agreementWorkingTimeDetail(v) {
 need(exact(v, ['version', 'period', 'scopeVersion', 'proposal', 'body', 'baseItems', 'source', 'current']) && v.version === AGREEMENT_WORKING_TIME_VERSION && periodValid(v.period) && salaryHash(v.scopeVersion) && typeof v.current === 'boolean', 'No se verificó el detalle conservado.', 'CONTRACT_INVALID');
 agreementWorkingTimeSummary(v.proposal); agreementWorkingTimeCommand(v.body); agreementWorkingTimeItems(v.baseItems, v.period); agreementWorkingTimeSource(v.source);
 need(v.body.command === 'propose' && v.body.period === v.period && v.body.baseVersion === v.proposal.baseVersion && v.body.sourceVersion === v.proposal.sourceVersion && v.source.version === v.body.sourceVersion && v.body.reason === v.proposal.reason && v.body.items.length === v.proposal.itemCount && v.proposal.requestSha256 === await agreementWorkingTimeHash(v.body), 'El contenido no coincide con la propuesta conservada.', 'CONTRACT_INVALID');
 matchSource(v.body.items, v.source); return v;
}

export function prepareAgreementWorkingTime(bootstrap, items, reason) {
 const b = agreementWorkingTimeBootstrap(bootstrap); agreementWorkingTimeItems(items, b.period, {empty:false});
 need(b.permissions.canPropose, 'Tu cuenta no permite preparar horas del convenio.', 'FORBIDDEN'); matchSource(items, b.source);
 need(salarySerialized(items) !== salarySerialized(b.configuration.items), 'La declaración completa no contiene cambios.');
 return agreementWorkingTimeCommand({command:'propose', period:b.period, scopeVersion:b.scopeVersion, baseVersion:b.configuration.version, sourceVersion:b.source.version, proposalId:null, proposalSha256:null, items:items.map(r => ({...r, definition:agreementWorkingTimeDefinition(r.definition, b.period)})), reason, reviewConfirmed:false});
}

export async function decideAgreementWorkingTime(bootstrap, detail, command, reason) {
 const b = agreementWorkingTimeBootstrap(bootstrap), d = await agreementWorkingTimeDetail(detail), p = d.proposal;
 need(['approve', 'reject'].includes(command) && b.permissions.canReview && p.canReview && p.status === 'pending' && b.proposals.some(r => r.id === p.id && r.requestSha256 === p.requestSha256 && r.canReview && r.status === 'pending' && r.itemCount === p.itemCount && r.baseVersion === p.baseVersion && r.sourceVersion === p.sourceVersion) && d.period === b.period && d.scopeVersion === b.scopeVersion, 'Elegí una propuesta del mismo período que pueda revisar otra persona.', 'INDEPENDENT_REQUIRED');
 need(command !== 'approve' || d.current && p.baseVersion === b.configuration.version && p.sourceVersion === b.source.version, 'Cambió el catálogo o la revisión. No se puede aprobar esta propuesta.', 'BASE_CHANGED');
 return agreementWorkingTimeCommand({command, period:b.period, scopeVersion:b.scopeVersion, baseVersion:p.baseVersion, sourceVersion:p.sourceVersion, proposalId:p.id, proposalSha256:p.requestSha256, items:null, reason, reviewConfirmed:true});
}

export async function agreementWorkingTimeReceipt(v, attempt = null) {
 need(exact(v, ['version', 'eventId', 'proposalId', 'requestKey', 'requestSha256', 'body', 'status', 'revision', 'configurationVersion', 'replayed', 'payrollCalculated', 'payrollPosted']) && v.version === AGREEMENT_WORKING_TIME_VERSION && [v.eventId, v.proposalId].every(salaryUuid) && salaryKey(v.requestKey) && [v.requestSha256, v.configurationVersion].every(salaryHash) && Number.isInteger(v.revision) && v.revision >= 0 && v.revision <= 1000 && typeof v.replayed === 'boolean' && v.payrollCalculated === false && v.payrollPosted === false, 'No se verificó el comprobante de la operación.', 'CONTRACT_INVALID');
 agreementWorkingTimeCommand(v.body);
 need(v.requestSha256 === await agreementWorkingTimeHash(v.body) && v.status === ({propose:'pending', approve:'approved', reject:'rejected'})[v.body.command] && (v.body.command === 'propose' ? v.eventId.toLowerCase() === v.proposalId.toLowerCase() && v.configurationVersion === v.body.baseVersion : v.proposalId.toLowerCase() === v.body.proposalId.toLowerCase()), 'El comprobante no coincide con la operación y sus bytes.', 'CONTRACT_INVALID');
 if (v.body.command === 'approve') need(v.revision > 0 && v.configurationVersion !== v.body.baseVersion, 'La aprobación no conservó una revisión nueva.', 'CONTRACT_INVALID');
 if (attempt) need(v.requestKey === attempt.key && salarySerialized(v.body) === salarySerialized(attempt.body), 'El comprobante cambió el cuerpo o la clave originales.', 'CONTRACT_INVALID'); return v;
}

export function agreementWorkingTimeCapture(v, employees, period) {
 need(exact(v, ['complete', 'version', 'records']) && v.complete === true && salaryHash(v.version) && periodValid(period), 'No se verificó la captura del período.', 'CAPTURE_INVALID');
 list(v.records); list(employees); const selected = new Set(), contracts = new Set();
 for (const e of employees) { need(salaryUuid(e?.contractId) && codeValid(e.agreementCode) && !contracts.has(e.contractId.toLowerCase()), 'La selección tiene contratos repetidos o sin convenio verificado.', 'CAPTURE_INVALID'); contracts.add(e.contractId.toLowerCase()); selected.add(e.agreementCode); }
 need(v.records.length === selected.size, 'La captura no contiene todos los convenios de la selección.', 'CAPTURE_INVALID'); const seen = new Set();
 for (const r of v.records) {
  need(exact(r, ['agreementCode', 'agreementToken', 'revision', 'definition', 'approvalId', 'approvedAgreementToken']) && codeValid(r.agreementCode) && salaryHash(r.agreementToken) && selected.has(r.agreementCode) && !seen.has(r.agreementCode) && Number.isInteger(r.revision) && r.revision >= 0 && r.revision <= 1000, 'Hay un convenio repetido, ajeno a la selección o sin revisión verificable.', 'CAPTURE_INVALID'); seen.add(r.agreementCode);
  need(r.revision === 0 ? r.definition === null && r.approvalId === null && r.approvedAgreementToken === null : r.definition !== null && salaryUuid(r.approvalId) && salaryHash(r.approvedAgreementToken), 'La ausencia de aprobación no equivale a horas cero.', 'CAPTURE_INVALID');
  if (r.revision > 0) { need(r.approvedAgreementToken === r.agreementToken, 'Cambió el convenio desde su aprobación. No se calculó el conjunto.', 'IDENTITY_CHANGED'); agreementWorkingTimeDefinition(r.definition, period); }
 }
 size(v); return v;
}
