// Documented fiscal facts; no tax, calendar or attendance inference.
import { salaryExact, salaryHash, salaryUuid, salaryKey, salarySerialized, SalaryInputError } from './native-salary-catalog-model.js';
import { civilDay } from './employment-adoption-review-model.js';
import { assertNativeMonthlySubject } from './payroll-native-monthly-model.js';
export const FISCAL_FACTS_VERSION = 'own-fiscal-facts.v1';
export const FISCAL_FACTS_MAX_BYTES = 32768;
export const FISCAL_FACTS_READ = Object.freeze(['workforce.employee.read', 'payroll.parameter.read', 'payroll.calculation.nominal.read']);
export const fiscalFactsPeriod = v => typeof v === 'string' && /^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(v);
const need = (ok, message, code = 'INPUT_INVALID') => { if (!ok) throw new SalaryInputError('FISCAL_FACTS_' + code, message); };
const text = (v, min, max) => typeof v === 'string' && v === v.trim() && v === v.normalize('NFC') && v.length >= min && v.length <= max && !/[<>\u0000-\u001f\u007f]/.test(v);
const instant = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
// These are documented literal facts, not an ARCA code catalogue or a TXT encoder.
export const FISCAL_FACT_FIELDS = Object.freeze([3,4,5,6,7,8,9,10,11,12,20,24,25,27,29,30,31,32,33,34,35,41,43,45,50,56,57]);
export function fiscalFactsDefinition(v, period) {
 need(fiscalFactsPeriod(period) && salaryExact(v,['referenceVersion','fields','asOfDate','documentReference']) && v.referenceVersion==='47.5' && salaryExact(v.fields,FISCAL_FACT_FIELDS.map(String)), 'Informá los 27 datos documentales, con su referencia y constancia.');
 for(const number of FISCAL_FACT_FIELDS) need(v.fields[number]===null || text(v.fields[number],1,180),'Un dato fiscal debe ser texto literal o quedar sin informar. No se completan ceros ni se convierten códigos.');
 need(v.fields[43]===null || ['0','1'].includes(v.fields[43]), 'Trabajador convencionado: el manual de referencia indica 0 (No) o 1 (Sí).');
 need(civilDay(v.asOfDate) && text(v.documentReference,3,180),'Informá la fecha de la constancia y su referencia municipal. Puede documentar retroactivamente este período.');
 return {...v,fields:{...v.fields}};
}
export function fiscalFactsCommand(v) {
 need(salaryExact(v, ['command', 'contractId', 'period', 'scopeVersion', 'baseVersion', 'sourceVersion', 'proposalId', 'proposalSha256', 'definition', 'reason', 'reviewConfirmed']) && ['propose', 'approve', 'reject'].includes(v.command) && salaryUuid(v.contractId) && fiscalFactsPeriod(v.period) && [v.scopeVersion, v.baseVersion, v.sourceVersion].every(salaryHash) && text(v.reason, 10, 1000) && typeof v.reviewConfirmed === 'boolean', 'Revisá contrato, período, versiones y fundamento de la operación.');
 if (v.command === 'propose') {
  need(v.proposalId === null && v.proposalSha256 === null && v.definition !== null && v.reviewConfirmed === false, 'Preparar conserva una propuesta para otra persona.');
  return { ...v, definition: fiscalFactsDefinition(v.definition, v.period) };
 }
 need(salaryUuid(v.proposalId) && salaryHash(v.proposalSha256) && v.definition === null && v.reviewConfirmed === true, 'Elegí una propuesta y confirmá la revisión independiente.');
 return { ...v };
}
export function fiscalFactsSource(v, contractId) {
 need(salaryExact(v, ['version', 'subject', 'period', 'fullPeriod']) && salaryHash(v.version) && fiscalFactsPeriod(v.period) && typeof v.fullPeriod==='boolean', 'No se verificó la fuente del contrato propio.', 'CONTRACT_INVALID');
 assertNativeMonthlySubject(v.subject);
 need(v.subject.contractId.toLowerCase() === contractId.toLowerCase(), 'La fuente devolvió otro contrato.', 'CONTRACT_INVALID');
 return v;
}
export function fiscalFactsConfiguration(v, period) {
 need(salaryExact(v, ['version', 'revision', 'definition', 'proposalId', 'approvalId', 'identityToken', 'sourceVersion']) && salaryHash(v.version) && Number.isInteger(v.revision) && v.revision >= 0 && v.revision <= 1000, 'No se verificó la revisión aprobada.', 'CONTRACT_INVALID');
 need(v.revision === 0 ? v.definition === null && v.proposalId === null && v.approvalId === null && v.identityToken === null && v.sourceVersion===null : v.definition !== null && [v.proposalId, v.approvalId].every(salaryUuid) && salaryHash(v.identityToken) && salaryHash(v.sourceVersion), 'La revisión no coincide con su declaración y aprobación.', 'CONTRACT_INVALID');
 if (v.definition !== null) fiscalFactsDefinition(v.definition, period);
 return v;
}
export function fiscalFactsSummary(v) {
 need(salaryExact(v, ['id', 'requestSha256', 'baseVersion', 'sourceVersion', 'reason', 'createdAt', 'authorLabel', 'canReview', 'status', 'decision']) && salaryUuid(v.id) && [v.requestSha256, v.baseVersion, v.sourceVersion].every(salaryHash) && text(v.reason, 10, 1000) && text(v.authorLabel, 1, 160) && instant(v.createdAt) && typeof v.canReview === 'boolean' && ['pending', 'approved', 'rejected'].includes(v.status), 'No se verificó una propuesta de datos fiscales.', 'CONTRACT_INVALID');
 need(v.status === 'pending' ? v.decision === null : salaryExact(v.decision, ['command', 'reason', 'actorLabel', 'recordedAt', 'revision']) && v.decision.command === (v.status === 'approved' ? 'approve' : 'reject') && text(v.decision.reason, 10, 1000) && text(v.decision.actorLabel, 1, 160) && instant(v.decision.recordedAt) && Number.isInteger(v.decision.revision) && v.decision.revision >= 0 && v.decision.revision <= 1000, 'La decisión no coincide con su propuesta.', 'CONTRACT_INVALID');
 need(v.status === 'pending' || v.canReview === false, 'Una propuesta decidida no admite otra revisión.', 'CONTRACT_INVALID');
 return v;
}
export function fiscalFactsBootstrap(v) {
 need(salaryExact(v, ['version', 'contractId', 'period', 'scopeVersion', 'source', 'configuration', 'proposals', 'permissions', 'complete', 'payrollCalculated', 'payrollPosted']) && v.version === FISCAL_FACTS_VERSION && salaryUuid(v.contractId) && fiscalFactsPeriod(v.period) && salaryHash(v.scopeVersion) && v.complete === true && v.payrollCalculated === false && v.payrollPosted === false && salaryExact(v.permissions, ['canPropose', 'canReview']) && Object.values(v.permissions).every(x => typeof x === 'boolean'), 'No se verificó la consulta completa de datos fiscales.', 'CONTRACT_INVALID');
 fiscalFactsSource(v.source, v.contractId); need(v.source.period===v.period,'La fuente corresponde a otro período.','CONTRACT_INVALID'); fiscalFactsConfiguration(v.configuration, v.period);
 need(Array.isArray(v.proposals) && v.proposals.length <= 500 && Reflect.ownKeys(v.proposals).length === v.proposals.length + 1, 'El historial supera su capacidad; no se recortaron propuestas.', 'CONTRACT_INVALID');
 const ids = new Set();
 for (const p of v.proposals) { fiscalFactsSummary(p); need(!ids.has(p.id.toLowerCase()), 'Hay una propuesta repetida.', 'CONTRACT_INVALID'); ids.add(p.id.toLowerCase()); }
 return v;
}
export function fiscalFactsReceipt(v, attempt = null) {
 need(salaryExact(v, ['version', 'eventId', 'proposalId', 'requestKey', 'requestSha256', 'body', 'status', 'revision', 'configurationVersion', 'replayed', 'payrollCalculated', 'payrollPosted']) && v.version === FISCAL_FACTS_VERSION && [v.eventId, v.proposalId].every(salaryUuid) && salaryKey(v.requestKey) && [v.requestSha256, v.configurationVersion].every(salaryHash) && Number.isInteger(v.revision) && v.revision >= 0 && v.revision <= 1000 && typeof v.replayed === 'boolean' && v.payrollCalculated === false && v.payrollPosted === false, 'No se verificó el comprobante de datos fiscales.', 'CONTRACT_INVALID');
 fiscalFactsCommand(v.body);
 need(v.status === ({ propose: 'pending', approve: 'approved', reject: 'rejected' })[v.body.command] && (v.body.command === 'propose' ? v.eventId.toLowerCase() === v.proposalId.toLowerCase() && v.configurationVersion === v.body.baseVersion : v.proposalId.toLowerCase() === v.body.proposalId.toLowerCase()), 'El comprobante no corresponde a la operación.', 'CONTRACT_INVALID');
 if (v.body.command === 'approve') need(v.revision > 0 && v.configurationVersion !== v.body.baseVersion, 'La aprobación no conservó una nueva revisión.', 'CONTRACT_INVALID');
 if (attempt) need(v.requestKey === attempt.key && salarySerialized(v.body) === salarySerialized(attempt.body), 'El comprobante cambió el cuerpo o la clave originales.', 'CONTRACT_INVALID');
 return v;
}
export async function fiscalFactsHash(v) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salarySerialized(v))))].map(b => b.toString(16).padStart(2, '0')).join(''); }
export async function fiscalFactsDetail(v) {
 need(salaryExact(v, ['version', 'scopeVersion', 'proposal', 'body', 'baseDefinition', 'source', 'current']) && v.version === FISCAL_FACTS_VERSION && salaryHash(v.scopeVersion) && typeof v.current === 'boolean', 'No se verificó el detalle de la propuesta.', 'CONTRACT_INVALID');
 fiscalFactsSummary(v.proposal); fiscalFactsCommand(v.body); fiscalFactsSource(v.source, v.body.contractId);
 if (v.baseDefinition !== null) fiscalFactsDefinition(v.baseDefinition, v.body.period);
 need(v.body.command === 'propose' && v.body.baseVersion === v.proposal.baseVersion && v.body.sourceVersion === v.proposal.sourceVersion && v.source.version === v.body.sourceVersion && v.body.reason === v.proposal.reason && v.proposal.requestSha256 === await fiscalFactsHash(v.body), 'El contenido no coincide con la propuesta conservada.', 'CONTRACT_INVALID');
 return v;
}
export function prepareFiscalFacts(bootstrap, definition, reason) {
 const b = fiscalFactsBootstrap(bootstrap), d = fiscalFactsDefinition(definition, b.period);
 need(b.permissions.canPropose, 'Tu cuenta no permite preparar datos fiscales.', 'FORBIDDEN');
 need(salarySerialized(d) !== salarySerialized(b.configuration.definition) || b.configuration.sourceVersion !== b.source.version, 'La declaración no contiene cambios ni una fuente laboral nueva para revisar.');
 return fiscalFactsCommand({ command: 'propose', contractId: b.contractId, period: b.period, scopeVersion: b.scopeVersion, baseVersion: b.configuration.version, sourceVersion: b.source.version, proposalId: null, proposalSha256: null, definition: d, reason, reviewConfirmed: false });
}
export function decideFiscalFacts(bootstrap, detail, command, reason) {
 const b = fiscalFactsBootstrap(bootstrap), p = detail?.proposal;
 need(b.permissions.canReview && p?.canReview && p.status === 'pending' && b.proposals.some(r => r.id === p.id && r.requestSha256 === p.requestSha256) && detail.body?.contractId === b.contractId && detail.body?.period === b.period && detail.scopeVersion === b.scopeVersion, 'Elegí una propuesta del contrato y período que pueda decidir otra persona.', 'INDEPENDENT_REQUIRED');
 need(command !== 'approve' || detail.current && p.baseVersion === b.configuration.version && p.sourceVersion === b.source.version, 'Cambió la revisión o la identidad del contrato. No se puede aprobar esta propuesta.', 'BASE_CHANGED');
 return fiscalFactsCommand({ command, contractId: b.contractId, period: b.period, scopeVersion: b.scopeVersion, baseVersion: p.baseVersion, sourceVersion: p.sourceVersion, proposalId: p.id, proposalSha256: p.requestSha256, definition: null, reason, reviewConfirmed: true });
}

export const FISCAL_CENSUS_VERSION='own-fiscal-census.v1';
export function fiscalFactsCensus(v,period){
 need(salaryExact(v,['version','period','scopeVersion','stateVersion','rows','complete','payrollCalculated','payrollPosted']) && v.version===FISCAL_CENSUS_VERSION && v.period===period && fiscalFactsPeriod(period) && [v.scopeVersion,v.stateVersion].every(salaryHash) && v.complete===true && v.payrollCalculated===false && v.payrollPosted===false && Array.isArray(v.rows) && v.rows.length<=10000 && Reflect.ownKeys(v.rows).length===v.rows.length+1,'No se verificó el censo fiscal completo.','CONTRACT_INVALID');
 let previous='';
 for(const row of v.rows){need(salaryExact(row,['contractId','configuration','source','current']) && salaryUuid(row.contractId) && row.contractId===row.contractId.toLowerCase() && row.contractId>previous && typeof row.current==='boolean','Hay contratos repetidos, desordenados o incompletos en el censo fiscal.','CONTRACT_INVALID');previous=row.contractId;fiscalFactsSource(row.source,row.contractId);fiscalFactsConfiguration(row.configuration,period);need(row.source.period===period && row.configuration.revision>0 && row.current===(row.configuration.sourceVersion===row.source.version && row.configuration.identityToken===row.source.subject.identityToken),'La vigencia del dato fiscal no coincide con su fuente.','CONTRACT_INVALID');}
 return v;
}
export async function verifiedFiscalFactsCensus(v,period){fiscalFactsCensus(v,period);need(v.stateVersion===await fiscalFactsHash(v.rows),'El sello no coincide con el censo fiscal completo.','CONTRACT_INVALID');return v;}
