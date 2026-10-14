// Declared municipal facts for a complete period. No legacy-field conversion,
// entitlement decision, formula execution or payroll effect is performed here.
import { salaryExact as salaryShape, salaryHash, salaryUuid, salaryKey, salarySerialized, salaryJsonbBytes, SalaryInputError } from './native-salary-catalog-model.js';
import { civilDay } from './employment-adoption-review-model.js';
import { assertNativeMonthlySubject } from './payroll-native-monthly-model.js';

export const SALARY_CONDITIONS_VERSION = 'own-contract-salary-conditions.v1';
export const SALARY_CONDITIONS_MAX_ROWS = 10000;
export const SALARY_CONDITIONS_MAX_BYTES = 4 * 1024 * 1024;
export const SALARY_CONDITIONS_READ = Object.freeze(['workforce.employee.read','payroll.parameter.read','payroll.calculation.nominal.read']);
const need = (ok, message, code = 'INPUT_INVALID') => { if (!ok) throw new SalaryInputError('SALARY_CONDITIONS_' + code, message); };
const periodValid = v => typeof v === 'string' && /^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(v);
const text = (v, min, max) => typeof v === 'string' && v === v.trim() && v === v.normalize('NFC') && v.length >= min && v.length <= max && !/[<>\u0000-\u001f\u007f]/.test(v);
const codeValid = v => typeof v === 'string' && /^[0-9]{1,9}$/.test(v);
const yearsValid = v => v === null || typeof v === 'string' && /^(0|[1-9][0-9]{0,17})$/.test(v);
const percentageValid = v => v === null || typeof v === 'string' && /^(0|[1-9][0-9]{0,17})(\.[0-9]{1,8})?$/.test(v);
const instant = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
const identity = v => v.toLowerCase();
const salaryExact = (v, keys) => salaryShape(v, keys) && Object.getPrototypeOf(v) === Object.prototype && Reflect.ownKeys(v).length === keys.length && Object.values(Object.getOwnPropertyDescriptors(v)).every(d => Object.hasOwn(d, 'value') && d.enumerable);
function list(v, maximum, empty = true) {
 need(Array.isArray(v) && v.length <= maximum && (empty || v.length > 0) && Reflect.ownKeys(v).length === v.length + 1 && Array.from({length:v.length}, (_, i) => Object.getOwnPropertyDescriptor(v, String(i))).every(d => d && Object.hasOwn(d, 'value')), 'El conjunto debe estar completo, sin huecos ni campos adicionales.', 'CONTRACT_INVALID');
}
function size(v) { need(salaryJsonbBytes(v) <= SALARY_CONDITIONS_MAX_BYTES, 'El conjunto completo supera su capacidad. No se recortaron filas.', 'LIMIT'); }

export function salaryConditionsDefinition(v, period) {
 need(periodValid(period) && salaryExact(v, ['partialSeniorityYears', 'title', 'unhealthyWork', 'asOfDate', 'documentReference']), 'Revisá período, declaración completa y constancia municipal.');
 need(yearsValid(v.partialSeniorityYears), 'La antigüedad parcial es un entero declarado. No se obtiene de la antigüedad total ni de una fecha.');
 need(salaryExact(v.title, ['status', 'code', 'percentage']) && ['not_reported', 'none', 'declared'].includes(v.title.status), 'Declarar un título, declarar que no corresponde y dejarlo sin informar son situaciones distintas.');
 if (v.title.status === 'declared') need(codeValid(v.title.code) && percentageValid(v.title.percentage), 'El título requiere su código declarado y un porcentaje exacto o no informado.');
 else need(v.title.code === null && v.title.percentage === null, 'Una situación sin título declarado no admite un código o porcentaje supuesto.');
 need(v.unhealthyWork === null || typeof v.unhealthyWork === 'boolean', 'La insalubridad debe declararse como sí, no o no informada. No se deduce de tareas ni datos clínicos.');
 need(civilDay(v.asOfDate) && v.asOfDate.slice(0, 7) <= period && text(v.documentReference, 3, 180), 'Informá una fecha válida hasta el período elegido y su constancia municipal.');
 return {...v, title:{...v.title}};
}

export function salaryConditionsItems(v, period, {empty = true} = {}) {
 list(v, SALARY_CONDITIONS_MAX_ROWS, empty);
 let previous = '';
 for (const item of v) {
  need(salaryExact(item, ['contractId', 'identityToken', 'definition']) && salaryUuid(item.contractId) && salaryHash(item.identityToken), 'No se verificó la identidad de una fila.', 'CONTRACT_INVALID');
  const id = identity(item.contractId);
  need(id > previous, 'Las filas deben estar ordenadas por contrato, sin duplicados. No se reemplazan filas repetidas.', 'CONTRACT_INVALID'); previous = id;
  salaryConditionsDefinition(item.definition, period);
 }
 size(v); return v;
}

export function salaryConditionsSource(v) {
 need(salaryExact(v, ['version', 'subjects']) && salaryHash(v.version), 'No se verificó la fuente completa de contratos propios.', 'CONTRACT_INVALID');
 list(v.subjects, SALARY_CONDITIONS_MAX_ROWS);
 let previous = '';
 for (const subject of v.subjects) {
  need(salaryExact(subject, ['contractId','registrationId','legajo','employeeName','identityToken','sourceCutoff','origin','registeredAt']), 'La fuente incluye campos no verificados.', 'CONTRACT_INVALID');
  assertNativeMonthlySubject(subject);
  const id = identity(subject.contractId);
  need(id > previous, 'Hay contratos repetidos o desordenados en la fuente completa.', 'CONTRACT_INVALID'); previous = id;
 }
 return v;
}

function matchSource(items, source) {
 need(items.length === source.subjects.length, 'La declaración debe incluir todos los contratos de la fuente verificada. La búsqueda no recorta el conjunto.', 'POPULATION_CHANGED');
 for (let i = 0; i < items.length; i++) need(identity(items[i].contractId) === identity(source.subjects[i].contractId) && items[i].identityToken === source.subjects[i].identityToken, 'Cambió un contrato o su identidad. Volvé a consultar antes de preparar.', 'POPULATION_CHANGED');
}

export function salaryConditionsCommand(v) {
 need(salaryExact(v, ['command', 'period', 'scopeVersion', 'baseVersion', 'sourceVersion', 'proposalId', 'proposalSha256', 'items', 'reason', 'reviewConfirmed']) && ['propose','approve','reject'].includes(v.command) && periodValid(v.period) && [v.scopeVersion,v.baseVersion,v.sourceVersion].every(salaryHash) && text(v.reason, 10, 1000) && typeof v.reviewConfirmed === 'boolean', 'Revisá operación, período, versiones y fundamento.');
 if (v.command === 'propose') {
  need(v.proposalId === null && v.proposalSha256 === null && v.reviewConfirmed === false, 'Preparar conserva una propuesta para otra persona.');
  salaryConditionsItems(v.items, v.period, {empty:false});
 } else need(salaryUuid(v.proposalId) && salaryHash(v.proposalSha256) && v.items === null && v.reviewConfirmed === true, 'Elegí una propuesta y confirmá la revisión independiente.');
 size(v); return v;
}

export function salaryConditionsConfiguration(v, period) {
 need(salaryExact(v, ['version', 'revision', 'items', 'proposalId', 'approvalId']) && salaryHash(v.version) && Number.isInteger(v.revision) && v.revision >= 0 && v.revision <= 1000, 'No se verificó la revisión conservada.', 'CONTRACT_INVALID');
 salaryConditionsItems(v.items, period);
 need(v.revision === 0 ? v.items.length === 0 && v.proposalId === null && v.approvalId === null : v.items.length > 0 && [v.proposalId, v.approvalId].every(salaryUuid), 'La revisión no coincide con sus datos y aprobación.', 'CONTRACT_INVALID');
 return v;
}

export function salaryConditionsSummary(v) {
 need(salaryExact(v, ['id', 'requestSha256', 'baseVersion', 'sourceVersion', 'itemCount', 'reason', 'createdAt', 'authorLabel', 'canReview', 'status', 'decision']) && salaryUuid(v.id) && [v.requestSha256,v.baseVersion,v.sourceVersion].every(salaryHash) && Number.isInteger(v.itemCount) && v.itemCount > 0 && v.itemCount <= SALARY_CONDITIONS_MAX_ROWS && text(v.reason,10,1000) && text(v.authorLabel,1,160) && instant(v.createdAt) && typeof v.canReview === 'boolean' && ['pending','approved','rejected'].includes(v.status), 'No se verificó una propuesta de condiciones salariales.', 'CONTRACT_INVALID');
 need(v.status === 'pending' ? v.decision === null : salaryExact(v.decision, ['command','reason','actorLabel','recordedAt','revision']) && v.decision.command === (v.status === 'approved' ? 'approve' : 'reject') && text(v.decision.reason,10,1000) && text(v.decision.actorLabel,1,160) && instant(v.decision.recordedAt) && Number.isInteger(v.decision.revision) && v.decision.revision >= 0 && v.decision.revision <= 1000, 'La decisión no corresponde a su propuesta.', 'CONTRACT_INVALID');
 need(v.status === 'pending' || v.canReview === false, 'Una propuesta decidida no se revisa otra vez.', 'CONTRACT_INVALID'); return v;
}

export function salaryConditionsBootstrap(v) {
 need(salaryExact(v, ['version','period','scopeVersion','source','configuration','proposals','permissions','complete','payrollCalculated','payrollPosted']) && v.version === SALARY_CONDITIONS_VERSION && periodValid(v.period) && salaryHash(v.scopeVersion) && v.complete === true && v.payrollCalculated === false && v.payrollPosted === false && salaryExact(v.permissions, ['canPropose','canReview']) && Object.values(v.permissions).every(x => typeof x === 'boolean'), 'No se verificó la consulta completa del período y sus permisos.', 'CONTRACT_INVALID');
 salaryConditionsSource(v.source); salaryConditionsConfiguration(v.configuration, v.period); list(v.proposals, 1000);
 const ids = new Set();
 for (const p of v.proposals) { salaryConditionsSummary(p); need(!ids.has(identity(p.id)), 'Hay propuestas repetidas en la consulta.', 'CONTRACT_INVALID'); ids.add(identity(p.id)); }
 return v;
}

export async function salaryConditionsHash(v) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salarySerialized(v))))].map(b => b.toString(16).padStart(2, '0')).join(''); }
export async function salaryConditionsDetail(v) {
 need(salaryExact(v, ['version','period','scopeVersion','proposal','body','baseItems','source','current']) && v.version === SALARY_CONDITIONS_VERSION && periodValid(v.period) && salaryHash(v.scopeVersion) && typeof v.current === 'boolean', 'No se verificó el detalle completo.', 'CONTRACT_INVALID');
 salaryConditionsSummary(v.proposal); salaryConditionsCommand(v.body); salaryConditionsItems(v.baseItems,v.period); salaryConditionsSource(v.source);
 // The immutable body retains its preparer scope. The detail scope belongs to
 // the current reader/reviewer and is matched to that reader in decide below.
 need(v.body.command === 'propose' && v.body.period === v.period && v.body.baseVersion === v.proposal.baseVersion && v.body.sourceVersion === v.proposal.sourceVersion && v.source.version === v.body.sourceVersion && v.body.reason === v.proposal.reason && v.body.items.length === v.proposal.itemCount && v.proposal.requestSha256 === await salaryConditionsHash(v.body), 'El contenido no coincide con la propuesta conservada.', 'CONTRACT_INVALID');
 matchSource(v.body.items,v.source); return v;
}

export function prepareSalaryConditions(bootstrap, items, reason) {
 const b = salaryConditionsBootstrap(bootstrap); salaryConditionsItems(items,b.period,{empty:false});
 need(b.permissions.canPropose, 'Tu cuenta no permite preparar condiciones salariales.', 'FORBIDDEN'); matchSource(items,b.source);
 need(salarySerialized(items) !== salarySerialized(b.configuration.items), 'La declaración completa no contiene cambios.');
 const conserved = items.map(item => ({...item,definition:salaryConditionsDefinition(item.definition,b.period)}));
 return salaryConditionsCommand({command:'propose',period:b.period,scopeVersion:b.scopeVersion,baseVersion:b.configuration.version,sourceVersion:b.source.version,proposalId:null,proposalSha256:null,items:conserved,reason,reviewConfirmed:false});
}

export async function decideSalaryConditions(bootstrap, detail, command, reason) {
 const b = salaryConditionsBootstrap(bootstrap), d = await salaryConditionsDetail(detail), p = d.proposal;
 need(['approve','reject'].includes(command) && b.permissions.canReview && p.canReview && p.status === 'pending' && b.proposals.some(r => r.id === p.id && r.requestSha256 === p.requestSha256 && r.canReview && r.status === 'pending' && r.itemCount === p.itemCount && r.baseVersion === p.baseVersion && r.sourceVersion === p.sourceVersion) && d.body.period === b.period && d.scopeVersion === b.scopeVersion, 'Elegí una propuesta del mismo período que pueda revisar otra persona.', 'INDEPENDENT_REQUIRED');
 need(command !== 'approve' || d.current && p.baseVersion === b.configuration.version && p.sourceVersion === b.source.version, 'Cambió la revisión o la fuente completa. No se puede aprobar esta propuesta.', 'BASE_CHANGED');
 return salaryConditionsCommand({command,period:b.period,scopeVersion:b.scopeVersion,baseVersion:p.baseVersion,sourceVersion:p.sourceVersion,proposalId:p.id,proposalSha256:p.requestSha256,items:null,reason,reviewConfirmed:true});
}

export async function salaryConditionsReceipt(v, attempt = null) {
 need(salaryExact(v, ['version','eventId','proposalId','requestKey','requestSha256','body','status','revision','configurationVersion','replayed','payrollCalculated','payrollPosted']) && v.version === SALARY_CONDITIONS_VERSION && [v.eventId,v.proposalId].every(salaryUuid) && salaryKey(v.requestKey) && [v.requestSha256,v.configurationVersion].every(salaryHash) && Number.isInteger(v.revision) && v.revision >= 0 && v.revision <= 1000 && typeof v.replayed === 'boolean' && v.payrollCalculated === false && v.payrollPosted === false, 'No se verificó el comprobante de la operación.', 'CONTRACT_INVALID');
 salaryConditionsCommand(v.body);
 need(v.requestSha256 === await salaryConditionsHash(v.body), 'El contenido del comprobante no coincide con su huella.', 'CONTRACT_INVALID');
 need(v.status === ({propose:'pending',approve:'approved',reject:'rejected'})[v.body.command] && (v.body.command === 'propose' ? identity(v.eventId) === identity(v.proposalId) && v.configurationVersion === v.body.baseVersion : identity(v.proposalId) === identity(v.body.proposalId)), 'El comprobante no corresponde a la operación.', 'CONTRACT_INVALID');
 if (v.body.command === 'approve') need(v.revision > 0 && v.configurationVersion !== v.body.baseVersion, 'La aprobación no conservó una nueva revisión.', 'CONTRACT_INVALID');
 if (attempt) need(v.requestKey === attempt.key && salarySerialized(v.body) === salarySerialized(attempt.body), 'El comprobante cambió el cuerpo o la clave originales.', 'CONTRACT_INVALID'); return v;
}

export function salaryConditionsCapture(v, employees, period) {
 need(salaryExact(v, ['complete','version','records']) && v.complete === true && salaryHash(v.version) && periodValid(period), 'No se verificó la captura completa del período.', 'CAPTURE_INVALID');
 list(v.records,SALARY_CONDITIONS_MAX_ROWS); list(employees,SALARY_CONDITIONS_MAX_ROWS);
 const selected = new Map();
 for (const e of employees) { need(salaryUuid(e?.contractId) && salaryHash(e.identityToken) && !selected.has(identity(e.contractId)), 'La selección tiene identidades ausentes o contratos repetidos.', 'CAPTURE_INVALID'); selected.set(identity(e.contractId),e.identityToken); }
 need(v.records.length === selected.size, 'La captura no contiene todo el conjunto elegido.', 'CAPTURE_INVALID');
 const seen = new Set();
 for (const r of v.records) {
  need(salaryExact(r, ['contractId','identityToken','revision','definition','approvalId']) && salaryUuid(r.contractId) && salaryHash(r.identityToken) && Number.isInteger(r.revision) && r.revision >= 0 && r.revision <= 1000 && selected.get(identity(r.contractId)) === r.identityToken && !seen.has(identity(r.contractId)), 'Una condición tiene otra identidad, no pertenece a la selección o está repetida.', 'CAPTURE_INVALID'); seen.add(identity(r.contractId));
  need(r.revision === 0 ? r.definition === null && r.approvalId === null : r.definition !== null && salaryUuid(r.approvalId), 'Una condición debe conservar su declaración y aprobación; la ausencia no equivale a cero.', 'CAPTURE_INVALID');
  if (r.definition !== null) salaryConditionsDefinition(r.definition,period);
 }
 size(v); return v;
}
