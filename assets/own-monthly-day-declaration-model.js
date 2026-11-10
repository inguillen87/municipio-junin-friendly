// Typed monthly-day declarations; no calendar, attendance or payroll inference.
import { salaryExact, salaryHash, salaryUuid, salaryKey, salarySerialized, SalaryInputError } from './native-salary-catalog-model.js';
import { civilDay } from './employment-adoption-review-model.js';
import { assertNativeMonthlySubject } from './payroll-native-monthly-model.js';
export const MONTHLY_DAY_DECLARATION_POLICY_VERSION = 'own-monthly-approved-days-policy.v1';
export const MONTHLY_DAY_DECLARATION_FACTS_VERSION = 'own-monthly-approved-days.v1';
export const MONTHLY_DAY_DECLARATION_VERSION = 'own-monthly-day-declaration.v1';
export const MONTHLY_DAY_DECLARATION_MAX_BYTES = 32768;
export const MONTHLY_DAY_DECLARATION_READ = Object.freeze(['workforce.employee.read', 'payroll.parameter.read']);
export const monthlyDayDeclarationPeriod = v => typeof v === 'string' && /^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(v);
const need = (ok, message, code = 'INPUT_INVALID') => { if (!ok) throw new SalaryInputError('MONTHLY_DAY_DECLARATION_' + code, message); };
const text = (v, min, max) => typeof v === 'string' && v === v.trim() && v === v.normalize('NFC') && v.length >= min && v.length <= max && !/[<>\u0000-\u001f\u007f]/.test(v);
const instant = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
const count = v => v === null || typeof v === 'string' && /^(0|[1-9][0-9]{0,17})(\.[0-9]{1,8})?$/.test(v);
const scaled = v => { const [a,b='']=v.split('.'); return BigInt(a)*100000000n+BigInt(b.padEnd(8,'0')); };
export function monthlyDayDeclarationPlain(value,depth=0,budget={nodes:0}){
 need(++budget.nodes<=300000&&depth<=20,'La declaración supera su capacidad.');
 if(value===null||['string','boolean'].includes(typeof value)||typeof value==='number'&&Number.isSafeInteger(value))return value;
 need(value&&typeof value==='object','La declaración debe ser JSON simple.');
 const array=Array.isArray(value),keys=Reflect.ownKeys(value),d=Object.getOwnPropertyDescriptors(value);
 need(Object.getPrototypeOf(value)===(array?Array.prototype:Object.prototype)&&keys.every(k=>typeof k==='string'&&Object.hasOwn(d[k],'value')&&(array&&k==='length'||d[k].enumerable)),'No se admiten propiedades ejecutables.');
 if(array)need(value.length<=10000&&keys.length===value.length+1&&Array.from({length:value.length},(_,i)=>String(i)).every(k=>Object.hasOwn(d,k)),'No se recorta el conjunto.');
 return array?Array.from({length:value.length},(_,i)=>monthlyDayDeclarationPlain(d[String(i)].value,depth+1,budget)):Object.fromEntries(keys.map(k=>[k,monthlyDayDeclarationPlain(d[k].value,depth+1,budget)]));
}
export function monthlyDayDeclarationDefinition(v,period){
 v=monthlyDayDeclarationPlain(v);
 need(monthlyDayDeclarationPeriod(period)&&salaryExact(v,['recognizedDays','baseDays','unit','policyVersion','fullMonthDeclared','asOfDate','documentReference']),'Declarar días, base, unidad, política y constancia completos es obligatorio.');
 need(count(v.recognizedDays)&&v.baseDays==='30'&&v.unit==='days'&&v.policyVersion===MONTHLY_DAY_DECLARATION_POLICY_VERSION&&typeof v.fullMonthDeclared==='boolean','La política explícita usa días aprobados y base 30; no se convierten unidades.');
 need(v.recognizedDays===null||scaled(v.recognizedDays)<=3000000000n,'Los días declarados no pueden superar 30.');
 need(typeof v.asOfDate==='string'&&/^(19|20)[0-9]{2}-/.test(v.asOfDate)&&civilDay(v.asOfDate)&&v.asOfDate.slice(0,7)<=period&&text(v.documentReference,3,180),'Informá fecha y constancia municipal.');
 return v;
}
export function monthlyDayDeclarationApprovedDefinition(v,source,period){
 const d=monthlyDayDeclarationDefinition(v,period);need(d.recognizedDays!==null,'Faltan días explícitos; NULL no equivale a cero.','VALUE_REQUIRED');
 need(typeof source?.fullPeriod==='boolean','Falta cobertura laboral verificada.','SOURCE_CHANGED');
 need(!d.fullMonthDeclared||source.fullPeriod,'La cobertura laboral no permite declarar un mes completo.','SOURCE_CHANGED');
 need(!d.fullMonthDeclared||scaled(d.recognizedDays)===3000000000n,'Declarar un mes completo liquidable exige 30 días explícitos.','FULL_MONTH_REQUIRED');return d;
}
export function monthlyDayDeclarationCommand(v) {
 v=monthlyDayDeclarationPlain(v);
 need(salaryExact(v, ['command', 'contractId', 'period', 'scopeVersion', 'baseVersion', 'sourceVersion', 'proposalId', 'proposalSha256', 'definition', 'reason', 'reviewConfirmed']) && ['propose', 'approve', 'reject'].includes(v.command) && salaryUuid(v.contractId) && monthlyDayDeclarationPeriod(v.period) && [v.scopeVersion, v.baseVersion, v.sourceVersion].every(salaryHash) && text(v.reason, 10, 1000) && typeof v.reviewConfirmed === 'boolean', 'Revisá contrato, período, versiones y fundamento de la operación.');
 if (v.command === 'propose') {
  need(v.proposalId === null && v.proposalSha256 === null && v.definition !== null && v.reviewConfirmed === false, 'Preparar conserva una propuesta para otra persona.');
  return { ...v, definition: monthlyDayDeclarationDefinition(v.definition, v.period) };
 }
 need(salaryUuid(v.proposalId) && salaryHash(v.proposalSha256) && v.definition === null && v.reviewConfirmed === true, 'Elegí una propuesta y confirmá la revisión independiente.');
 return { ...v };
}
export function monthlyDayDeclarationSource(v, contractId) {
 v=monthlyDayDeclarationPlain(v);
 need(salaryExact(v, ['version', 'subject', 'period', 'fullPeriod']) && salaryHash(v.version) && monthlyDayDeclarationPeriod(v.period) && typeof v.fullPeriod==='boolean', 'No se verificó la fuente del contrato propio.', 'CONTRACT_INVALID');
 assertNativeMonthlySubject(v.subject);
 need(v.subject.contractId.toLowerCase() === contractId.toLowerCase(), 'La fuente devolvió otro contrato.', 'CONTRACT_INVALID');
 return v;
}
export function monthlyDayDeclarationConfiguration(v, period) {
 v=monthlyDayDeclarationPlain(v);
 need(salaryExact(v, ['version', 'revision', 'definition', 'proposalId', 'approvalId', 'identityToken', 'sourceVersion']) && salaryHash(v.version) && Number.isInteger(v.revision) && v.revision >= 0 && v.revision <= 1000, 'No se verificó la revisión aprobada.', 'CONTRACT_INVALID');
 need(v.revision === 0 ? v.definition === null && v.proposalId === null && v.approvalId === null && v.identityToken === null && v.sourceVersion===null : v.definition !== null && [v.proposalId, v.approvalId].every(salaryUuid) && salaryHash(v.identityToken) && salaryHash(v.sourceVersion), 'La revisión no coincide con su declaración y aprobación.', 'CONTRACT_INVALID');
 if (v.definition !== null) {
  const d=monthlyDayDeclarationDefinition(v.definition, period);
  need(d.recognizedDays!==null&&(!d.fullMonthDeclared||scaled(d.recognizedDays)===3000000000n),'La configuración aprobada no conserva días explícitos coherentes con su declaración.','CONTRACT_INVALID');
 }
 // Historical approvals remain readable after source/lifecycle changes.
 // Current-source eligibility is checked separately at decision and capture.
 return v;
}
export function monthlyDayDeclarationSummary(v) {
 v=monthlyDayDeclarationPlain(v);
 need(salaryExact(v, ['id', 'requestSha256', 'baseVersion', 'sourceVersion', 'reason', 'createdAt', 'authorLabel', 'canReview', 'status', 'decision']) && salaryUuid(v.id) && [v.requestSha256, v.baseVersion, v.sourceVersion].every(salaryHash) && text(v.reason, 10, 1000) && text(v.authorLabel, 1, 160) && instant(v.createdAt) && typeof v.canReview === 'boolean' && ['pending', 'approved', 'rejected'].includes(v.status), 'No se verificó una propuesta de participación.', 'CONTRACT_INVALID');
 need(v.status === 'pending' ? v.decision === null : salaryExact(v.decision, ['command', 'reason', 'actorLabel', 'recordedAt', 'revision']) && v.decision.command === (v.status === 'approved' ? 'approve' : 'reject') && text(v.decision.reason, 10, 1000) && text(v.decision.actorLabel, 1, 160) && instant(v.decision.recordedAt) && Number.isInteger(v.decision.revision) && v.decision.revision >= 0 && v.decision.revision <= 1000, 'La decisión no coincide con su propuesta.', 'CONTRACT_INVALID');
 need(v.status === 'pending' || v.canReview === false, 'Una propuesta decidida no admite otra revisión.', 'CONTRACT_INVALID');
 return v;
}
export function monthlyDayDeclarationBootstrap(v) {
 v=monthlyDayDeclarationPlain(v);
 need(salaryExact(v, ['version', 'contractId', 'period', 'scopeVersion', 'source', 'configuration', 'proposals', 'permissions', 'complete', 'payrollCalculated', 'payrollPosted']) && v.version === MONTHLY_DAY_DECLARATION_VERSION && salaryUuid(v.contractId) && monthlyDayDeclarationPeriod(v.period) && salaryHash(v.scopeVersion) && v.complete === true && v.payrollCalculated === false && v.payrollPosted === false && salaryExact(v.permissions, ['canPropose', 'canReview']) && Object.values(v.permissions).every(x => typeof x === 'boolean'), 'No se verificó la consulta completa de participación.', 'CONTRACT_INVALID');
 monthlyDayDeclarationSource(v.source, v.contractId); need(v.source.period===v.period,'La fuente corresponde a otro período.','CONTRACT_INVALID'); monthlyDayDeclarationConfiguration(v.configuration, v.period);
 need(Array.isArray(v.proposals) && v.proposals.length <= 500 && Reflect.ownKeys(v.proposals).length === v.proposals.length + 1, 'El historial supera su capacidad; no se recortaron propuestas.', 'CONTRACT_INVALID');
 const ids = new Set();
 for (const p of v.proposals) { monthlyDayDeclarationSummary(p); need(!ids.has(p.id.toLowerCase()), 'Hay una propuesta repetida.', 'CONTRACT_INVALID'); ids.add(p.id.toLowerCase()); }
 return v;
}
export function monthlyDayDeclarationReceipt(v, attempt = null) {
 v=monthlyDayDeclarationPlain(v);
 need(salaryExact(v, ['version', 'eventId', 'proposalId', 'requestKey', 'requestSha256', 'body', 'status', 'revision', 'configurationVersion', 'replayed', 'payrollCalculated', 'payrollPosted']) && v.version === MONTHLY_DAY_DECLARATION_VERSION && [v.eventId, v.proposalId].every(salaryUuid) && salaryKey(v.requestKey) && [v.requestSha256, v.configurationVersion].every(salaryHash) && Number.isInteger(v.revision) && v.revision >= 0 && v.revision <= 1000 && typeof v.replayed === 'boolean' && v.payrollCalculated === false && v.payrollPosted === false, 'No se verificó el comprobante de participación.', 'CONTRACT_INVALID');
 monthlyDayDeclarationCommand(v.body);
 need(v.status === ({ propose: 'pending', approve: 'approved', reject: 'rejected' })[v.body.command] && (v.body.command === 'propose' ? v.eventId.toLowerCase() === v.proposalId.toLowerCase() && v.configurationVersion === v.body.baseVersion : v.proposalId.toLowerCase() === v.body.proposalId.toLowerCase()), 'El comprobante no corresponde a la operación.', 'CONTRACT_INVALID');
 if (v.body.command === 'approve') need(v.revision > 0 && v.configurationVersion !== v.body.baseVersion, 'La aprobación no conservó una nueva revisión.', 'CONTRACT_INVALID');
 if (attempt) need(v.requestKey === attempt.key && salarySerialized(v.body) === salarySerialized(attempt.body), 'El comprobante cambió el cuerpo o la clave originales.', 'CONTRACT_INVALID');
 return v;
}
export async function monthlyDayDeclarationHash(v) { v=monthlyDayDeclarationPlain(v); return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salarySerialized(v))))].map(b => b.toString(16).padStart(2, '0')).join(''); }
export async function monthlyDayDeclarationDetail(v) {
 v=monthlyDayDeclarationPlain(v);
 need(salaryExact(v, ['version', 'scopeVersion', 'proposal', 'body', 'baseDefinition', 'source', 'current']) && v.version === MONTHLY_DAY_DECLARATION_VERSION && salaryHash(v.scopeVersion) && typeof v.current === 'boolean', 'No se verificó el detalle de la propuesta.', 'CONTRACT_INVALID');
 monthlyDayDeclarationSummary(v.proposal); monthlyDayDeclarationCommand(v.body); monthlyDayDeclarationSource(v.source, v.body.contractId);need(v.source.period===v.body.period,'La propuesta conserva una fuente de otro período.','CONTRACT_INVALID');
 if (v.baseDefinition !== null) monthlyDayDeclarationDefinition(v.baseDefinition, v.body.period);
 need(v.body.command === 'propose' && v.body.baseVersion === v.proposal.baseVersion && v.body.sourceVersion === v.proposal.sourceVersion && v.source.version === v.body.sourceVersion && v.body.reason === v.proposal.reason && v.proposal.requestSha256 === await monthlyDayDeclarationHash(v.body), 'El contenido no coincide con la propuesta conservada.', 'CONTRACT_INVALID');
 return v;
}
export function prepareMonthlyDayDeclaration(bootstrap, definition, reason) {
 const b = monthlyDayDeclarationBootstrap(bootstrap), d = monthlyDayDeclarationDefinition(definition, b.period);
 need(!d.fullMonthDeclared||b.source.fullPeriod,'La cobertura laboral no permite declarar un mes completo.','FULL_MONTH_REQUIRED');
 if(d.recognizedDays!==null)monthlyDayDeclarationApprovedDefinition(d,b.source,b.period);
 need(b.permissions.canPropose, 'Tu cuenta no permite preparar participación.', 'FORBIDDEN');
 need(salarySerialized(d) !== salarySerialized(b.configuration.definition) || b.configuration.sourceVersion !== b.source.version, 'La declaración no contiene cambios ni una fuente laboral nueva para revisar.');
 return monthlyDayDeclarationCommand({ command: 'propose', contractId: b.contractId, period: b.period, scopeVersion: b.scopeVersion, baseVersion: b.configuration.version, sourceVersion: b.source.version, proposalId: null, proposalSha256: null, definition: d, reason, reviewConfirmed: false });
}
export function decideMonthlyDayDeclaration(bootstrap, detail, command, reason) {
 detail=monthlyDayDeclarationPlain(detail);
 const b = monthlyDayDeclarationBootstrap(bootstrap), p = detail?.proposal;
 need(b.permissions.canReview && p?.canReview && p.status === 'pending' && b.proposals.some(r => r.id === p.id && r.requestSha256 === p.requestSha256) && detail.body?.contractId === b.contractId && detail.body?.period === b.period && detail.scopeVersion === b.scopeVersion, 'Elegí una propuesta del contrato y período que pueda decidir otra persona.', 'INDEPENDENT_REQUIRED');
 if(command==='approve')monthlyDayDeclarationApprovedDefinition(detail.body.definition,b.source,b.period);
 need(command !== 'approve' || detail.current && p.baseVersion === b.configuration.version && p.sourceVersion === b.source.version, 'Cambió la revisión o la identidad del contrato. No se puede aprobar esta propuesta.', 'BASE_CHANGED');
 return monthlyDayDeclarationCommand({ command, contractId: b.contractId, period: b.period, scopeVersion: b.scopeVersion, baseVersion: p.baseVersion, sourceVersion: p.sourceVersion, proposalId: p.id, proposalSha256: p.requestSha256, definition: null, reason, reviewConfirmed: true });
}
export function monthlyDayDeclarationCapture(v, employees, period) {
 v=monthlyDayDeclarationPlain(v); employees=monthlyDayDeclarationPlain(employees);
 need(monthlyDayDeclarationPeriod(period)&&Array.isArray(employees)&&employees.length>0&&employees.length<=10000&&employees.every(e=>e&&salaryUuid(e.contractId)&&salaryHash(e.identityToken))&&new Set(employees.map(e=>e.contractId.toLowerCase())).size===employees.length,'La selección debe estar completa y sin duplicados.','CAPTURE_INVALID');
 need(salaryExact(v, ['complete', 'version', 'factsVersion', 'period', 'records']) && v.complete === true && v.factsVersion===MONTHLY_DAY_DECLARATION_FACTS_VERSION && v.period===period && salaryHash(v.version) && Array.isArray(v.records) && v.records.length <= 10000 && Reflect.ownKeys(v.records).length === v.records.length + 1 && v.records.length === employees.length, 'Se necesita la fuente completa de participación de la selección.', 'CAPTURE_INVALID');
 const selected = new Map(employees.map(e => [e.contractId.toLowerCase(), e.identityToken])), seen = new Set();
 for (const r of v.records) {
  need(salaryExact(r, ['contractId', 'identityToken', 'fullPeriod', 'sourceVersion', 'configuration']) && typeof r.fullPeriod === 'boolean' && salaryUuid(r.contractId) && salaryHash(r.identityToken) && !seen.has(r.contractId.toLowerCase()) && selected.get(r.contractId.toLowerCase()) === r.identityToken, 'La participación no coincide con la identidad capturada.', 'CAPTURE_INVALID');
  seen.add(r.contractId.toLowerCase()); monthlyDayDeclarationConfiguration(r.configuration, period);
  need(salaryHash(r.sourceVersion)&&r.configuration.revision>0&&r.configuration.sourceVersion===r.sourceVersion,'Falta una aprobación tipada contra la fuente actual.','APPROVAL_REQUIRED');
  monthlyDayDeclarationApprovedDefinition(r.configuration.definition,r,period);
  need(r.configuration.revision === 0 || r.configuration.identityToken === r.identityToken, 'Cambió la identidad desde la aprobación de participación.', 'IDENTITY_CHANGED');
 }
 return v;
}
