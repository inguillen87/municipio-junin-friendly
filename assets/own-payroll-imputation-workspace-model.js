import {salaryExact,salaryHash,salaryUuid,salaryKey,salarySerialized,SalaryInputError} from './native-salary-catalog-model.js';
import {accountingHash, accountingBankDestination, ACCOUNTING_NET_CREDITORS, ACCOUNTING_BANK_DESTINATION_VERSION} from './own-payroll-accounting-model.js';
import {verifiedImputation} from './own-payroll-imputation-model.js';
import {ownRunWorkspaceAccess,OWN_RUN_NOMINAL,OWN_RUN_TYPES,OWN_RUN_NATURES} from './own-payroll-run-workspace-model.js';

export const IMPUTATION_VERSION='own-payroll-imputation.v1';
export const IMPUTATION_READ=Object.freeze([...OWN_RUN_NOMINAL,'payroll.calculation.approve']);
export const IMPUTATION_CAPS=Object.freeze({propose:['payroll.parameter.prepare'],approve:['payroll.parameter.approve'],reject:['payroll.parameter.approve']});
export const IMPUTATION_MAX_BYTES=32768;
export const imputationAccess=ownRunWorkspaceAccess;
const need=(v,m,code='CONTRACT_INVALID')=>{if(!v)throw new SalaryInputError('IMPUTATION_'+code,m);};
const text=(s,min=10,max=1000)=>typeof s==='string'&&s===s.trim()&&s===s.normalize('NFC')&&s.length>=min&&s.length<=max&&!/[<>\u0000-\u001f\u007f]/.test(s);
const rev=v=>Number.isSafeInteger(v)&&v>=0&&v<=1000;
const ownRunPeriod=v=>typeof v==='string'&&/^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(v);
const ownRunType=v=>Object.hasOwn(OWN_RUN_TYPES,v);
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export function imputationCommand(v){
 need(salaryExact(v,['version','command','groupId','fiscalYear','scopeVersion','sourceVersion','allocationSha256','baseRevision','proposalId','proposalSha256','reason','reviewConfirmed'])&&v.version===IMPUTATION_VERSION&&['propose','approve','reject'].includes(v.command)&&salaryUuid(v.groupId)&&typeof v.fiscalYear==='string'&&/^(19|20)[0-9]{2}$/.test(v.fiscalYear)&&[v.scopeVersion,v.sourceVersion,v.allocationSha256].every(salaryHash)&&rev(v.baseRevision)&&text(v.reason)&&v.reviewConfirmed===true,'Revisá grupo cerrado, año, fuente, revisión y motivo completos.','INPUT_INVALID');
 need(v.command==='propose'?v.proposalId===null&&v.proposalSha256===null:salaryUuid(v.proposalId)&&salaryHash(v.proposalSha256),'La decisión requiere la propuesta exacta revisada.','INPUT_INVALID');return structuredClone(v);
}
export function imputationReceipt(v,attempt=null){
 need(salaryExact(v,['version','eventId','proposalId','requestKey','requestSha256','body','status','revision','allocationSha256','sourceVersion','replayed','accountingPosted','paymentExecuted'])&&v.version===IMPUTATION_VERSION&&[v.eventId,v.proposalId].every(salaryUuid)&&salaryKey(v.requestKey)&&[v.requestSha256,v.allocationSha256,v.sourceVersion].every(salaryHash)&&rev(v.revision)&&typeof v.replayed==='boolean'&&v.accountingPosted===false&&v.paymentExecuted===false,'No se verificó el comprobante de imputación.');
 const b=imputationCommand(v.body);need(v.status===({propose:'pending',approve:'approved',reject:'rejected'})[b.command]&&v.sourceVersion===b.sourceVersion&&v.allocationSha256===b.allocationSha256&&v.revision===b.baseRevision+(b.command==='approve'?1:0)&&(b.command==='propose'?v.eventId.toLowerCase()===v.proposalId.toLowerCase():v.proposalId.toLowerCase()===b.proposalId.toLowerCase()),'El comprobante corresponde a otra revisión.');
 if(attempt)need(v.requestKey===attempt.key&&salarySerialized(v.body)===salarySerialized(attempt.body),'Cambió el contenido o la clave del intento.');return v;
}
export async function verifiedImputationReceipt(v,attempt=null){imputationReceipt(v,attempt);need(await accountingHash(v.body)===v.requestSha256,'No se verificó el cuerpo original del intento.');return v;}
export function imputationSummary(v){
 need(salaryExact(v,['id','requestSha256','sourceVersion','allocationSha256','groupId','fiscalYear','baseRevision','reason','createdAt','authorLabel','employeeCount','conceptCount','canReview','status','decision'])&&[v.id,v.groupId].every(salaryUuid)&&[v.requestSha256,v.sourceVersion,v.allocationSha256].every(salaryHash)&&typeof v.fiscalYear==='string'&&/^(19|20)[0-9]{2}$/.test(v.fiscalYear)&&rev(v.baseRevision)&&text(v.reason)&&text(v.authorLabel,1,160)&&typeof v.createdAt==='string'&&!isNaN(Date.parse(v.createdAt))&&Number.isSafeInteger(v.employeeCount)&&v.employeeCount>0&&v.employeeCount<=10000&&Number.isSafeInteger(v.conceptCount)&&v.conceptCount>=0&&v.conceptCount<=250000&&typeof v.canReview==='boolean'&&['pending','approved','rejected'].includes(v.status),'No se verificó la propuesta completa.');
 need(v.status==='pending'?v.decision===null:salaryExact(v.decision,['command','reason','actorLabel','recordedAt','revision'])&&v.decision.command===(v.status==='approved'?'approve':'reject')&&text(v.decision.reason)&&text(v.decision.actorLabel,1,160)&&!isNaN(Date.parse(v.decision.recordedAt))&&v.decision.revision===v.baseRevision+(v.status==='approved'?1:0),'La decisión no corresponde a la propuesta.');return v;
}
export function imputationBootstrap(v){
 need(salaryExact(v,['version','scopeVersion','period','liquidationType','groups','proposals','permissions','complete','accountingPosted','paymentExecuted'])&&v.version===IMPUTATION_VERSION&&salaryHash(v.scopeVersion)&&ownRunPeriod(v.period)&&ownRunType(v.liquidationType)&&v.complete===true&&v.accountingPosted===false&&v.paymentExecuted===false&&salaryExact(v.permissions,['canPropose','canReview'])&&Object.values(v.permissions).every(x=>typeof x==='boolean')&&Array.isArray(v.groups)&&v.groups.length<=1000&&Array.isArray(v.proposals)&&v.proposals.length<=500,'No se verificó la consulta completa de imputación.');
 const ids=new Set();for(const g of v.groups){need(salaryExact(g,['id','state','snapshotSha256','employeeCount','populationCount','populationComplete','recordedAt','actorLabel'])&&salaryUuid(g.id)&&salaryHash(g.snapshotSha256)&&['closed','reopened'].includes(g.state)&&Number.isSafeInteger(g.employeeCount)&&g.employeeCount>0&&Number.isSafeInteger(g.populationCount)&&g.populationCount>=g.employeeCount&&g.populationCount<=10000&&g.populationComplete===(g.employeeCount===g.populationCount)&&!isNaN(Date.parse(g.recordedAt))&&text(g.actorLabel,1,160)&&!ids.has(g.id.toLowerCase()),'No se verificó cada grupo cerrado.');ids.add(g.id.toLowerCase());}
 const seen=new Set();for(const p of v.proposals){imputationSummary(p);need(ids.has(p.groupId.toLowerCase())&&!seen.has(p.id.toLowerCase()),'La cola perdió un grupo o repitió propuestas.');seen.add(p.id.toLowerCase());}return v;
}
export async function imputationPreview(v){
 need(salaryExact(v,['version','source','allocation','allocationSha256','revision'])&&v.version===IMPUTATION_VERSION&&salaryHash(v.allocationSha256)&&rev(v.revision),'No se verificó la previa completa.');
 const allocation=await verifiedImputation(v.source);need(salarySerialized(allocation)===salarySerialized(v.allocation)&&await accountingHash(allocation)===v.allocationSha256,'Los destinos o importes no coinciden con el cierre íntegro.');return v;
}
export async function imputationDetail(v){
 need(salaryExact(v,['version','scopeVersion','proposal','body','source','allocation','allocationSha256','sourceCurrent'])&&v.version===IMPUTATION_VERSION&&salaryHash(v.scopeVersion)&&typeof v.sourceCurrent==='boolean','No se verificó la revisión conservada.');
 const p=imputationSummary(v.proposal),b=imputationCommand(v.body);await imputationPreview({version:v.version,source:v.source,allocation:v.allocation,allocationSha256:v.allocationSha256,revision:b.baseRevision});
 need(b.command==='propose'&&await accountingHash(b)===p.requestSha256&&b.groupId.toLowerCase()===p.groupId.toLowerCase()&&b.groupId.toLowerCase()===v.source.group.groupId.toLowerCase()&&b.sourceVersion===p.sourceVersion&&b.sourceVersion===v.source.sourceVersion&&b.allocationSha256===p.allocationSha256&&b.allocationSha256===v.allocationSha256&&b.baseRevision===p.baseRevision&&b.fiscalYear===p.fiscalYear&&b.fiscalYear===v.source.fiscalYear&&v.allocation.ready&&v.allocation.employeeCount===p.employeeCount&&v.allocation.conceptCount===p.conceptCount,'La propuesta perdió o alteró su fuente y distribución.');return v;
}
// Internal control copy of one complete, current, approved distribution. This
// is not an accounting exchange format. Every nonnumeric cell is literal text
// (including money) to preserve codes/decimals and prevent spreadsheet formulas.
export async function approvedImputationCsv(value){
 const d=await imputationDetail(value),p=d.proposal,a=d.allocation,s=d.source.group.snapshot;
 need(p.status==='approved'&&d.sourceCurrent,'Abrí una imputación aprobada vigente. Una propuesta pendiente, rechazada o reemplazada no habilita esta descarga.','EXPORT_UNAVAILABLE');
 const headers=['Período','Tipo de liquidación','Año presupuestario','Revisión aprobada','Fila del grupo completo','Estado del concepto','Legajo','Fecha de liquidación','Jurisdicción','Convenio','Repartición','Concepto','Naturaleza','Unidad','Importe o valor exacto (texto)','Partida','Institución','Función','Proveedor','Acreedor','Cuenta contable','Cuenta bancaria','Banco','Vigencia del destino desde','Vigencia del destino hasta','Documento del destino','Documento institucional','Huella del cierre','Huella de la distribución','Legajos del grupo','Legajos de la población original','Alcance del grupo'];
 const bankColumns=a.rows.some(r=>r.destination?.bankDestinationVersion===ACCOUNTING_BANK_DESTINATION_VERSION);
 if(bankColumns)headers.push('Concepto bancario','Movimiento bancario','Acreedor de neto · declaración','Acreedor de neto · referencia','Indica neto');
 const quote=v=>'"'+v.replaceAll('"','""')+'"';
 const cell=v=>quote(v===null?'':typeof v==='number'?String(v):"'"+v);
 const lines=[headers.map(quote).join(';')];
 for(const r of a.rows){const dest=r.destination;
  const values=[s.period,OWN_RUN_TYPES[s.liquidationType],a.fiscalYear,p.decision.revision,r.ordinal,r.state==='auxiliary'?'Auxiliar · sin movimiento monetario':'Imputado',r.employeeNumber,r.liquidationDate,r.jurisdictionCode,r.agreementCode,r.departmentCode,r.conceptCode,OWN_RUN_NATURES[r.nature],r.unit,r.amount,...['budgetItemReference','institutionalReference','functionReference','supplierReference','creditorReference','accountingAccountReference','bankAccountReference','bankReference','validFrom','validUntil','ruleReference','institutionRuleReference'].map(k=>dest?.[k]??null),a.snapshotSha256,d.allocationSha256,s.employeeCount,s.populationCount,s.populationComplete?'Población completa':'Grupo parcial'];
  if(bankColumns){const b=dest?accountingBankDestination(dest):null;values.push(b?.bankConceptReference??null,b?.bankMovementReference??null,b?ACCOUNTING_NET_CREDITORS[b.netCreditorKind]:null,b?.netCreditorReference??null,b?b.indicatesNet===null?'No informado':b.indicatesNet?'Sí':'No':null);}
  lines.push(values.map(cell).join(';'));
 }
 return lines.join('\r\n')+'\r\n';
}
export async function prepareImputation(boot,preview,reason){
 imputationBootstrap(boot);await imputationPreview(preview);need(boot.permissions.canPropose&&preview.source.scopeVersion===boot.scopeVersion&&boot.groups.some(g=>g.id.toLowerCase()===preview.source.group.groupId.toLowerCase()&&g.state==='closed'&&g.snapshotSha256===preview.source.group.snapshotSha256)&&preview.allocation.ready,'Revisá todas las observaciones del grupo cerrado antes de preparar.','INPUT_INVALID');
 return imputationCommand({version:IMPUTATION_VERSION,command:'propose',groupId:preview.source.group.groupId,fiscalYear:preview.source.fiscalYear,scopeVersion:boot.scopeVersion,sourceVersion:preview.source.sourceVersion,allocationSha256:preview.allocationSha256,baseRevision:preview.revision,proposalId:null,proposalSha256:null,reason,reviewConfirmed:true});
}
export async function decideImputation(boot,detail,command,reason){
 imputationBootstrap(boot);await imputationDetail(detail);const p=detail.proposal;
 need(boot.permissions.canReview&&p.canReview&&p.status==='pending'&&boot.scopeVersion===detail.scopeVersion&&boot.proposals.some(x=>x.id.toLowerCase()===p.id.toLowerCase()&&x.requestSha256===p.requestSha256)&&['approve','reject'].includes(command),'La decisión requiere otra persona habilitada y la propuesta consultada.','INPUT_INVALID');
 need(command!=='approve'||detail.sourceCurrent,'Cambió el cierre, la configuración o su revisión. La propuesta no puede aprobarse.','SOURCE_CHANGED');
 return imputationCommand({...detail.body,scopeVersion:boot.scopeVersion,command,proposalId:p.id,proposalSha256:p.requestSha256,reason});
}
export function imputationAttempt(key,body,accessKey){need(salaryKey(key)&&typeof accessKey==='string'&&accessKey,'No se pudo conservar el intento.','INPUT_INVALID');return freeze({key,body:imputationCommand(body),accessKey});}
