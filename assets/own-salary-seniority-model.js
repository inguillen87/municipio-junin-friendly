// Recognized salary seniority is a declared, independently reviewed fact.
// This module never derives it from hire dates, age, elapsed time or GRH codes.
import { salaryExact, salaryHash, salaryUuid, salaryKey, salarySerialized, SalaryInputError } from './native-salary-catalog-model.js';
import { civilDay } from './employment-adoption-review-model.js';
import { assertNativeMonthlySubject } from './payroll-native-monthly-model.js';
export const SENIORITY_VERSION = 'own-salary-seniority.v1';
export const SENIORITY_MAX_BYTES = 32768;
export const SENIORITY_READ = Object.freeze(['workforce.employee.read', 'payroll.parameter.read']);
export const seniorityPeriod = v => typeof v === 'string' && /^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(v);
const need = (ok, message, code = 'INPUT_INVALID') => { if (!ok) throw new SalaryInputError('SENIORITY_' + code, message); };
const text = (v, min, max) => typeof v === 'string' && v === v.trim() && v === v.normalize('NFC') && v.length >= min && v.length <= max && !/[<>\u0000-\u001f\u007f]/.test(v);
const instant = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
const count = v => v === null || typeof v === 'string' && /^(0|[1-9][0-9]{0,17})$/.test(v);
export function seniorityDefinition(v, period) {
 need(seniorityPeriod(period) && salaryExact(v, ['years', 'months', 'asOfDate', 'documentReference']), 'Revisá período, componentes y constancia completos.');
 need(count(v.years) && (v.months === null || typeof v.months === 'string' && /^(0|[1-9]|10|11)$/.test(v.months)), 'Años y meses son enteros declarados. Los meses van de 0 a 11; vacío no equivale a cero.');
 need(civilDay(v.asOfDate) && v.asOfDate.slice(0, 7) <= period && text(v.documentReference, 3, 180), 'Informá una fecha de cómputo válida hasta el período elegido y su constancia municipal.');
 return { ...v };
}
export function seniorityCommand(v) {
 need(salaryExact(v, ['command', 'contractId', 'period', 'scopeVersion', 'baseVersion', 'sourceVersion', 'proposalId', 'proposalSha256', 'definition', 'reason', 'reviewConfirmed']) && ['propose', 'approve', 'reject'].includes(v.command) && salaryUuid(v.contractId) && seniorityPeriod(v.period) && [v.scopeVersion, v.baseVersion, v.sourceVersion].every(salaryHash) && text(v.reason, 10, 1000) && typeof v.reviewConfirmed === 'boolean', 'Revisá contrato, período, versiones y fundamento de la operación.');
 if (v.command === 'propose') {
  need(v.proposalId === null && v.proposalSha256 === null && v.definition !== null && v.reviewConfirmed === false, 'Preparar conserva una propuesta para otra persona.');
  return { ...v, definition: seniorityDefinition(v.definition, v.period) };
 }
 need(salaryUuid(v.proposalId) && salaryHash(v.proposalSha256) && v.definition === null && v.reviewConfirmed === true, 'Elegí una propuesta y confirmá la revisión independiente.');
 return { ...v };
}
export function senioritySource(v, contractId) {
 need(salaryExact(v, ['version', 'subject']) && salaryHash(v.version), 'No se verificó la fuente del contrato propio.', 'CONTRACT_INVALID');
 assertNativeMonthlySubject(v.subject);
 need(v.subject.contractId.toLowerCase() === contractId.toLowerCase(), 'La fuente devolvió otro contrato.', 'CONTRACT_INVALID');
 return v;
}
export function seniorityConfiguration(v, period) {
 need(salaryExact(v, ['version', 'revision', 'definition', 'proposalId', 'approvalId', 'identityToken']) && salaryHash(v.version) && Number.isInteger(v.revision) && v.revision >= 0 && v.revision <= 1000, 'No se verificó la revisión aprobada.', 'CONTRACT_INVALID');
 need(v.revision === 0 ? v.definition === null && v.proposalId === null && v.approvalId === null && v.identityToken === null : v.definition !== null && [v.proposalId, v.approvalId].every(salaryUuid) && salaryHash(v.identityToken), 'La revisión no coincide con su declaración y aprobación.', 'CONTRACT_INVALID');
 if (v.definition !== null) seniorityDefinition(v.definition, period);
 return v;
}
export function senioritySummary(v) {
 need(salaryExact(v, ['id', 'requestSha256', 'baseVersion', 'sourceVersion', 'reason', 'createdAt', 'authorLabel', 'canReview', 'status', 'decision']) && salaryUuid(v.id) && [v.requestSha256, v.baseVersion, v.sourceVersion].every(salaryHash) && text(v.reason, 10, 1000) && text(v.authorLabel, 1, 160) && instant(v.createdAt) && typeof v.canReview === 'boolean' && ['pending', 'approved', 'rejected'].includes(v.status), 'No se verificó una propuesta de antigüedad.', 'CONTRACT_INVALID');
 need(v.status === 'pending' ? v.decision === null : salaryExact(v.decision, ['command', 'reason', 'actorLabel', 'recordedAt', 'revision']) && v.decision.command === (v.status === 'approved' ? 'approve' : 'reject') && text(v.decision.reason, 10, 1000) && text(v.decision.actorLabel, 1, 160) && instant(v.decision.recordedAt) && Number.isInteger(v.decision.revision) && v.decision.revision >= 0 && v.decision.revision <= 1000, 'La decisión no coincide con su propuesta.', 'CONTRACT_INVALID');
 need(v.status === 'pending' || v.canReview === false, 'Una propuesta decidida no admite otra revisión.', 'CONTRACT_INVALID');
 return v;
}
export function seniorityBootstrap(v) {
 need(salaryExact(v, ['version', 'contractId', 'period', 'scopeVersion', 'source', 'configuration', 'proposals', 'permissions', 'complete', 'payrollCalculated', 'payrollPosted']) && v.version === SENIORITY_VERSION && salaryUuid(v.contractId) && seniorityPeriod(v.period) && salaryHash(v.scopeVersion) && v.complete === true && v.payrollCalculated === false && v.payrollPosted === false && salaryExact(v.permissions, ['canPropose', 'canReview']) && Object.values(v.permissions).every(x => typeof x === 'boolean'), 'No se verificó la consulta completa de antigüedad.', 'CONTRACT_INVALID');
 senioritySource(v.source, v.contractId); seniorityConfiguration(v.configuration, v.period);
 need(Array.isArray(v.proposals) && v.proposals.length <= 500 && Reflect.ownKeys(v.proposals).length === v.proposals.length + 1, 'El historial supera su capacidad; no se recortaron propuestas.', 'CONTRACT_INVALID');
 const ids = new Set();
 for (const p of v.proposals) { senioritySummary(p); need(!ids.has(p.id.toLowerCase()), 'Hay una propuesta repetida.', 'CONTRACT_INVALID'); ids.add(p.id.toLowerCase()); }
 return v;
}
export function seniorityReceipt(v, attempt = null) {
 need(salaryExact(v, ['version', 'eventId', 'proposalId', 'requestKey', 'requestSha256', 'body', 'status', 'revision', 'configurationVersion', 'replayed', 'payrollCalculated', 'payrollPosted']) && v.version === SENIORITY_VERSION && [v.eventId, v.proposalId].every(salaryUuid) && salaryKey(v.requestKey) && [v.requestSha256, v.configurationVersion].every(salaryHash) && Number.isInteger(v.revision) && v.revision >= 0 && v.revision <= 1000 && typeof v.replayed === 'boolean' && v.payrollCalculated === false && v.payrollPosted === false, 'No se verificó el comprobante de antigüedad.', 'CONTRACT_INVALID');
 seniorityCommand(v.body);
 need(v.status === ({ propose: 'pending', approve: 'approved', reject: 'rejected' })[v.body.command] && (v.body.command === 'propose' ? v.eventId.toLowerCase() === v.proposalId.toLowerCase() && v.configurationVersion === v.body.baseVersion : v.proposalId.toLowerCase() === v.body.proposalId.toLowerCase()), 'El comprobante no corresponde a la operación.', 'CONTRACT_INVALID');
 if (v.body.command === 'approve') need(v.revision > 0 && v.configurationVersion !== v.body.baseVersion, 'La aprobación no conservó una nueva revisión.', 'CONTRACT_INVALID');
 if (attempt) need(v.requestKey === attempt.key && salarySerialized(v.body) === salarySerialized(attempt.body), 'El comprobante cambió el cuerpo o la clave originales.', 'CONTRACT_INVALID');
 return v;
}
export async function seniorityHash(v) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salarySerialized(v))))].map(b => b.toString(16).padStart(2, '0')).join(''); }
export async function seniorityDetail(v) {
 need(salaryExact(v, ['version', 'scopeVersion', 'proposal', 'body', 'baseDefinition', 'source', 'current']) && v.version === SENIORITY_VERSION && salaryHash(v.scopeVersion) && typeof v.current === 'boolean', 'No se verificó el detalle de la propuesta.', 'CONTRACT_INVALID');
 senioritySummary(v.proposal); seniorityCommand(v.body); senioritySource(v.source, v.body.contractId);
 if (v.baseDefinition !== null) seniorityDefinition(v.baseDefinition, v.body.period);
 need(v.body.command === 'propose' && v.body.baseVersion === v.proposal.baseVersion && v.body.sourceVersion === v.proposal.sourceVersion && v.source.version === v.body.sourceVersion && v.body.reason === v.proposal.reason && v.proposal.requestSha256 === await seniorityHash(v.body), 'El contenido no coincide con la propuesta conservada.', 'CONTRACT_INVALID');
 return v;
}
export function prepareSeniority(bootstrap, definition, reason) {
 const b = seniorityBootstrap(bootstrap), d = seniorityDefinition(definition, b.period);
 need(b.permissions.canPropose, 'Tu cuenta no permite preparar antigüedad.', 'FORBIDDEN');
 need(salarySerialized(d) !== salarySerialized(b.configuration.definition), 'La declaración no contiene cambios.');
 return seniorityCommand({ command: 'propose', contractId: b.contractId, period: b.period, scopeVersion: b.scopeVersion, baseVersion: b.configuration.version, sourceVersion: b.source.version, proposalId: null, proposalSha256: null, definition: d, reason, reviewConfirmed: false });
}
export function decideSeniority(bootstrap, detail, command, reason) {
 const b = seniorityBootstrap(bootstrap), p = detail?.proposal;
 need(b.permissions.canReview && p?.canReview && p.status === 'pending' && b.proposals.some(r => r.id === p.id && r.requestSha256 === p.requestSha256) && detail.body?.contractId === b.contractId && detail.body?.period === b.period && detail.scopeVersion === b.scopeVersion, 'Elegí una propuesta del contrato y período que pueda decidir otra persona.', 'INDEPENDENT_REQUIRED');
 need(command !== 'approve' || detail.current && p.baseVersion === b.configuration.version && p.sourceVersion === b.source.version, 'Cambió la revisión o la identidad del contrato. No se puede aprobar esta propuesta.', 'BASE_CHANGED');
 return seniorityCommand({ command, contractId: b.contractId, period: b.period, scopeVersion: b.scopeVersion, baseVersion: p.baseVersion, sourceVersion: p.sourceVersion, proposalId: p.id, proposalSha256: p.requestSha256, definition: null, reason, reviewConfirmed: true });
}
export function seniorityCapture(v, employees, period) {
 need(salaryExact(v, ['complete', 'version', 'records']) && v.complete === true && salaryHash(v.version) && Array.isArray(v.records) && v.records.length <= 10000 && Reflect.ownKeys(v.records).length === v.records.length + 1 && v.records.length === employees.length, 'Se necesita la fuente completa de antigüedad de la selección.', 'CAPTURE_INVALID');
 const selected = new Map(employees.map(e => [e.contractId.toLowerCase(), e.identityToken])), seen = new Set();
 for (const r of v.records) {
  need(salaryExact(r, ['contractId', 'identityToken', 'configuration']) && salaryUuid(r.contractId) && salaryHash(r.identityToken) && !seen.has(r.contractId.toLowerCase()) && selected.get(r.contractId.toLowerCase()) === r.identityToken, 'La antigüedad no coincide con la identidad capturada.', 'CAPTURE_INVALID');
  seen.add(r.contractId.toLowerCase()); seniorityConfiguration(r.configuration, period);
  need(r.configuration.revision === 0 || r.configuration.identityToken === r.identityToken, 'Cambió la identidad desde la aprobación de antigüedad.', 'IDENTITY_CHANGED');
 }
 return v;
}
