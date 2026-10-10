import {salaryExact,salaryHash,salaryUuid,salaryKey,salarySerialized,SalaryInputError} from './native-salary-catalog-model.js';
import {imputationDetail,imputationSummary,IMPUTATION_READ} from './own-payroll-imputation-workspace-model.js';
import {OWN_RUN_TYPES,ownRunWorkspaceAccess} from './own-payroll-run-workspace-model.js';
import {accountingHash} from './own-payroll-accounting-model.js';
import {ownRunDate} from './own-payroll-run-date.js';
import {decimal,rational,exactAdd,quantize} from './own-payroll-exact.js';

export const JOURNAL_VERSION='own-payroll-journal.v1';
export const JOURNAL_SOURCE_VERSION='own-payroll-journal-source.v1';
export const JOURNAL_MAX_RULES=250000;
export const JOURNAL_MAX_BYTES=8388608;
export const JOURNAL_READ=IMPUTATION_READ;
export const JOURNAL_CAPS=Object.freeze({propose:['payroll.parameter.prepare'],post:['payroll.parameter.approve'],reject:['payroll.parameter.approve']});
export const journalAccess=ownRunWorkspaceAccess;
export const JOURNAL_ISSUES=Object.freeze({primary_account_missing:['Cuenta principal pendiente','Completar y aprobar la cuenta de la asociación contable original.'],side_missing:['Sentido pendiente','Declarar Debe o Haber para la cuenta principal.'],counter_account_missing:['Contrapartida pendiente','Declarar la cuenta de contrapartida.'],document_missing:['Respaldo pendiente','Informar el documento que respalda el par contable.'],same_account:['Par sin distribución','Revisar las dos referencias: el par usa la misma cuenta.']});
const need=(v,message,code='CONTRACT_INVALID')=>{if(!v)throw new SalaryInputError('JOURNAL_'+code,message);};
const text=(v,min=1,max=80)=>typeof v==='string'&&v===v.trim()&&v===v.normalize('NFC')&&v.length>=min&&v.length<=max&&!/[<>\u0000-\u001f\u007f]/.test(v);
const same=(a,b)=>salarySerialized(a)===salarySerialized(b);
const sum=amounts=>quantize(amounts.reduce((a,v)=>exactAdd(a,decimal(v)),rational(0n)),{precision:amounts.reduce((p,v)=>Math.max(p,v.split('.')[1]?.length??0),0),mode:'exact'}).amount;
const sourceId=v=>v.basis==='imputation'?v.imputation.proposal.id:v.original.id;
export function journalSummary(v){
 need(salaryExact(v,['id','proposalId','basis','sourceId','requestSha256','journalSha256','postingDate','number','status','reason','authorLabel','canReview','groupCount','conceptCount','reversedBy','decision'])&&[v.id,v.proposalId,v.sourceId].every(salaryUuid)&&[v.requestSha256,v.journalSha256].every(salaryHash)&&['imputation','journal'].includes(v.basis)&&ownRunDate(v.postingDate)&&['pending','posted','rejected','reversed'].includes(v.status)&&text(v.reason,10,1000)&&text(v.authorLabel,1,160)&&typeof v.canReview==='boolean'&&Number.isSafeInteger(v.groupCount)&&v.groupCount>0&&v.groupCount<=JOURNAL_MAX_RULES&&Number.isSafeInteger(v.conceptCount)&&v.conceptCount>=v.groupCount&&v.conceptCount<=JOURNAL_MAX_RULES,'No se verificó el historial completo del libro.');
 need(['pending','rejected'].includes(v.status)?v.number===null:Number.isSafeInteger(v.number)&&v.number>0,'Numeración inválida en el historial.');
 need(v.status==='reversed'?v.basis==='imputation'&&salaryUuid(v.reversedBy):v.reversedBy===null,'Referencia de reversión inválida.');
 need(v.status==='pending'?v.decision===null&&v.id.toLowerCase()===v.proposalId.toLowerCase():salaryExact(v.decision,['id','command','reason','actorLabel','recordedAt'])&&v.decision.id===v.id&&v.decision.command===(v.status==='rejected'?'reject':'post')&&text(v.decision.reason,10,1000)&&text(v.decision.actorLabel,1,160)&&typeof v.decision.recordedAt==='string'&&!isNaN(Date.parse(v.decision.recordedAt)),'Decisión inválida en el historial.');return v;
}
export function journalBootstrap(v){
 need(salaryExact(v,['version','scopeVersion','period','liquidationType','imputations','journals','permissions','complete','paymentExecuted'])&&v.version===JOURNAL_VERSION&&salaryHash(v.scopeVersion)&&typeof v.period==='string'&&/^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(v.period)&&Object.hasOwn(OWN_RUN_TYPES,v.liquidationType)&&v.complete===true&&v.paymentExecuted===false&&salaryExact(v.permissions,['canPropose','canPost'])&&Object.values(v.permissions).every(x=>typeof x==='boolean')&&Array.isArray(v.imputations)&&v.imputations.length<=500&&Array.isArray(v.journals)&&v.journals.length<=1000,'No se verificó la consulta completa del libro.');
 for(const [rows,verify]of [[v.imputations,imputationSummary],[v.journals,journalSummary]]){const seen=new Set();for(const r of rows){verify(r);need(!seen.has(r.id.toLowerCase()),'La consulta repitió una propuesta.');seen.add(r.id.toLowerCase());} }
 need(v.imputations.every(r=>r.status==='approved'),'La fuente no está aprobada.');return v;
}
export const journalStateHashValue=v=>({version:JOURNAL_VERSION,id:v.id,proposalId:v.proposalId,requestSha256:v.requestSha256,journalSha256:v.journalSha256,status:v.status,number:v.number,decision:v.decision,reversedBy:v.reversedBy});
export function journalSourceHashValue(v){
 return v.basis==='imputation'?{version:JOURNAL_SOURCE_VERSION,basis:v.basis,imputationId:v.imputation.proposal.id,requestSha256:v.imputation.proposal.requestSha256,decision:v.imputation.proposal.decision,allocationSha256:v.imputation.allocationSha256,snapshotSha256:v.imputation.allocation.snapshotSha256}:{version:JOURNAL_SOURCE_VERSION,basis:v.basis,originalId:v.original.id,journalSha256:v.original.journalSha256,stateVersion:v.original.stateVersion,number:v.original.number,postingDate:v.original.postingDate};
}
export async function journalSource(v){
 need(salaryExact(v,['version','scopeVersion','basis','imputation','original','sourceVersion','complete'])&&v.version===JOURNAL_SOURCE_VERSION&&[v.scopeVersion,v.sourceVersion].every(salaryHash)&&v.complete===true&&['imputation','journal'].includes(v.basis),'No se verificó la fuente completa del asiento.');
 if(v.basis==='imputation'){
  need(v.original===null,'La fuente de imputación contiene otro asiento.');await imputationDetail(v.imputation);
  need(v.imputation.proposal.status==='approved'&&v.imputation.sourceCurrent,'Consultá una imputación aprobada vigente.','SOURCE_CHANGED');
 }else{
  need(v.imputation===null&&v.original?.kind==='initial','La reversión requiere un asiento original.');await journalDetail(v.original,{allowHistoricalSource:true});
  need(v.original.status==='posted','El asiento original ya no está disponible para reversión.','DECIDED');
 }
 need(await accountingHash(journalSourceHashValue(v))===v.sourceVersion,'La fuente contable perdió su integridad.');return v;
}
export function journalRules(value,count,{allowPending=false}={}){
 need(Array.isArray(value)&&Number.isSafeInteger(count)&&count>=0&&count<=JOURNAL_MAX_RULES&&value.length===count,'Revisá los pares de todos los destinos, incluidos los de otras páginas.','INPUT_INVALID');
 return value.map((r,i)=>{
  need(salaryExact(r,['ordinal','side','counterAccountReference','documentReference'])&&r.ordinal===i+1&&(r.side===null||['debit','credit'].includes(r.side))&&(r.counterAccountReference===null||text(r.counterAccountReference))&&(r.documentReference===null||text(r.documentReference,3,180)),'Un par contable contiene referencias o un ordinal inválidos.','INPUT_INVALID');
  if(!allowPending)need(r.side!==null&&r.counterAccountReference!==null&&r.documentReference!==null,'Completá sentido, contrapartida y respaldo de cada destino.','REVIEW_REQUIRED');return structuredClone(r);
 });
}
export async function calculateJournal(source,postingDate,rules){
 const s=await journalSource(source);need(ownRunDate(postingDate),'Declarar una fecha civil válida para el asiento.','INPUT_INVALID');
 const entries=[],issues=[];let groupCount,conceptCount,auxiliaryCount,employeeCount,sourceTotals,originalId=null;
 if(s.basis==='imputation'){
  const a=s.imputation.allocation;need(postingDate.slice(0,4)===a.fiscalYear,'La fecha debe pertenecer al año de la imputación elegida.','INPUT_INVALID');
  const pairs=journalRules(rules,a.groups.length,{allowPending:true});groupCount=a.groups.length;conceptCount=a.conceptCount;auxiliaryCount=a.auxiliaryCount;employeeCount=a.employeeCount;sourceTotals=structuredClone(a.sourceTotals);
  for(const [i,g]of a.groups.entries()){
   const r=pairs[i],d=g.destination,codes=[];if(d.accountingAccountReference===null)codes.push('primary_account_missing');if(r.side===null)codes.push('side_missing');if(r.counterAccountReference===null)codes.push('counter_account_missing');if(r.documentReference===null)codes.push('document_missing');if(d.accountingAccountReference!==null&&d.accountingAccountReference===r.counterAccountReference)codes.push('same_account');
   codes.forEach(code=>issues.push({ordinal:r.ordinal,code}));if(codes.length)continue;
   const negative=g.amount.startsWith('-'),amount=negative?g.amount.slice(1):g.amount,side=negative?(r.side==='debit'?'credit':'debit'):r.side;
   for(const role of ['primary','counterpart']){const lineSide=role==='primary'?side:side==='debit'?'credit':'debit';entries.push({ordinal:entries.length+1,groupOrdinal:r.ordinal,role,accountReference:role==='primary'?d.accountingAccountReference:r.counterAccountReference,side:lineSide,amount,debit:lineSide==='debit'?amount:'0',credit:lineSide==='credit'?amount:'0',sourceAmount:g.amount,sourceOrdinals:[...g.ordinals],destination:structuredClone(d),documentReference:r.documentReference});}
  }
 }else{
  const o=s.original;need(rules.length===0&&postingDate>=o.postingDate,'La reversión conserva los pares originales y una fecha igual o posterior.','INPUT_INVALID');originalId=o.id;
  const j=o.journal;({groupCount,conceptCount,auxiliaryCount,employeeCount}=j);sourceTotals=structuredClone(j.sourceTotals);
  for(const e of j.entries){const side=e.side==='debit'?'credit':'debit';entries.push({...structuredClone(e),side,debit:side==='debit'?e.amount:'0',credit:side==='credit'?e.amount:'0'});}
 }
 const totals={debit:sum(entries.map(e=>e.debit)),credit:sum(entries.map(e=>e.credit))};need(decimal(totals.debit).n*decimal(totals.credit).d===decimal(totals.credit).n*decimal(totals.debit).d,'El asiento no está balanceado.');
 const group=s.basis==='imputation'?s.imputation.source.group.snapshot:s.original.journal;
 return {version:JOURNAL_VERSION,kind:s.basis==='imputation'?'initial':'reversal',sourceId:sourceId(s),sourceVersion:s.sourceVersion,groupId:s.basis==='imputation'?s.imputation.allocation.groupId:s.original.journal.groupId,period:group.period,liquidationType:group.liquidationType,postingDate,fiscalYear:postingDate.slice(0,4),originalId,groupCount,conceptCount,auxiliaryCount,employeeCount,sourceTotals,entries,issues,totals,ready:groupCount>0&&issues.length===0,paymentExecuted:false};
}
export function journalCommand(v){
 need(salaryExact(v,['version','command','basis','sourceId','scopeVersion','sourceVersion','postingDate','rules','journalSha256','proposalId','proposalSha256','reason','reviewConfirmed'])&&v.version===JOURNAL_VERSION&&['propose','post','reject'].includes(v.command)&&['imputation','journal'].includes(v.basis)&&salaryUuid(v.sourceId)&&[v.scopeVersion,v.sourceVersion,v.journalSha256].every(salaryHash)&&ownRunDate(v.postingDate)&&Array.isArray(v.rules)&&v.rules.length<=JOURNAL_MAX_RULES&&text(v.reason,10,1000)&&v.reviewConfirmed===true,'Revisá fuente, fecha, pares, motivo y confirmación del asiento.','INPUT_INVALID');
 journalRules(v.rules,v.rules.length);need(v.basis==='imputation'||v.rules.length===0,'La reversión no admite otros pares.','INPUT_INVALID');
 need(v.command==='propose'?v.proposalId===null&&v.proposalSha256===null:salaryUuid(v.proposalId)&&salaryHash(v.proposalSha256),'La decisión requiere la propuesta exacta revisada.','INPUT_INVALID');return structuredClone(v);
}
export async function journalDetail(v){
 need(salaryExact(v,['version','id','proposalId','body','requestSha256','source','journal','journalSha256','status','kind','postingDate','number','stateVersion','sourceCurrent','canReview','authorLabel','decision','reversedBy'])&&v.version===JOURNAL_VERSION&&[v.id,v.proposalId].every(salaryUuid)&&[v.requestSha256,v.journalSha256,v.stateVersion].every(salaryHash)&&['pending','posted','rejected','reversed'].includes(v.status)&&typeof v.sourceCurrent==='boolean'&&typeof v.canReview==='boolean'&&text(v.authorLabel,1,160),'No se verificó el asiento conservado.');
 const b=journalCommand(v.body);need(b.command==='propose'&&await accountingHash(b)===v.requestSha256&&b.sourceVersion===v.source.sourceVersion&&b.sourceId.toLowerCase()===sourceId(v.source).toLowerCase()&&b.basis===v.source.basis&&v.kind===(b.basis==='imputation'?'initial':'reversal')&&v.postingDate===b.postingDate,'La propuesta perdió el contenido original.');
 // A historical source remains verifiable without declaring it usable again.
 const j=await calculateJournal(v.source,b.postingDate,b.rules);need(j.ready&&same(j,v.journal)&&await accountingHash(j)===v.journalSha256&&v.journalSha256===b.journalSha256,'El asiento perdió sus conceptos o pares conservados.');
 need(v.status==='pending'?v.number===null&&v.decision===null&&v.reversedBy===null:v.status==='rejected'?v.number===null:Number.isSafeInteger(v.number)&&v.number>0,'La numeración no corresponde a su estado.');
 need(v.status==='reversed'?salaryUuid(v.reversedBy):v.reversedBy===null,'La reversión no conserva su referencia.');
 need(v.status==='pending'?v.id.toLowerCase()===v.proposalId.toLowerCase():salaryExact(v.decision,['id','command','reason','actorLabel','recordedAt'])&&salaryUuid(v.decision.id)&&v.decision.id.toLowerCase()===v.id.toLowerCase()&&v.decision.command===(v.status==='rejected'?'reject':'post')&&text(v.decision.reason,10,1000)&&text(v.decision.actorLabel,1,160)&&typeof v.decision.recordedAt==='string'&&!isNaN(Date.parse(v.decision.recordedAt)),'La decisión no corresponde al asiento.');
 need(await accountingHash(journalStateHashValue(v))===v.stateVersion,'El estado del asiento perdió su integridad.');return v;
}
export async function prepareJournal(source,postingDate,rules,reason){
 const j=await calculateJournal(source,postingDate,rules);need(j.ready,'Revisá todos los destinos pendientes antes de preparar.','REVIEW_REQUIRED');
 return journalCommand({version:JOURNAL_VERSION,command:'propose',basis:source.basis,sourceId:sourceId(source),scopeVersion:source.scopeVersion,sourceVersion:source.sourceVersion,postingDate,rules,journalSha256:await accountingHash(j),proposalId:null,proposalSha256:null,reason,reviewConfirmed:true});
}
export async function decideJournal(boot,detail,command,reason){
 journalBootstrap(boot);await journalDetail(detail);need(boot.permissions.canPost&&detail.canReview&&detail.status==='pending'&&['post','reject'].includes(command)&&boot.journals.some(v=>v.proposalId===detail.proposalId&&v.requestSha256===detail.requestSha256&&v.status==='pending'),'La decisión requiere otra persona habilitada y la propuesta consultada.','INDEPENDENT_REQUIRED');
 need(command!=='post'||detail.sourceCurrent,'La fuente cambió. La propuesta conserva su historial y no puede registrarse.','SOURCE_CHANGED');return journalCommand({...detail.body,scopeVersion:boot.scopeVersion,command,proposalId:detail.proposalId,proposalSha256:detail.requestSha256,reason});
}
export async function journalReceipt(v,attempt=null){
 need(salaryExact(v,['version','eventId','proposalId','requestKey','requestSha256','body','status','number','journalSha256','sourceVersion','replayed','accountingPosted','paymentExecuted'])&&v.version===JOURNAL_VERSION&&[v.eventId,v.proposalId].every(salaryUuid)&&salaryKey(v.requestKey)&&[v.requestSha256,v.journalSha256,v.sourceVersion].every(salaryHash)&&typeof v.replayed==='boolean'&&v.paymentExecuted===false,'No se verificó el comprobante del intento.');
 const b=journalCommand(v.body);need(await accountingHash(b)===v.requestSha256&&v.sourceVersion===b.sourceVersion&&v.journalSha256===b.journalSha256&&v.accountingPosted===(b.command==='post')&&v.status===({propose:'pending',post:'posted',reject:'rejected'})[b.command]&&(b.command==='propose'?v.eventId===v.proposalId:v.proposalId===b.proposalId)&&(b.command==='post'?Number.isSafeInteger(v.number)&&v.number>0:v.number===null),'El comprobante no corresponde al contenido conservado.');
 if(attempt)need(v.requestKey===attempt.key&&same(v.body,attempt.body),'El servicio cambió el cuerpo o la clave pendiente.');return v;
}
export function journalAttempt(key,body,accessKey){
 need(salaryKey(key)&&typeof accessKey==='string'&&accessKey,'No se pudo conservar el intento.','INPUT_INVALID');const v={key,body:journalCommand(body),accessKey};const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};return freeze(v);
}
export async function journalCsv(detail){
 await journalDetail(detail,{allowHistoricalSource:true});need(['posted','reversed'].includes(detail.status),'Consultá un asiento registrado para descargar el libro.','EXPORT_UNAVAILABLE');
 const q=v=>'"'+String(v??'').replaceAll('"','""')+'"',cell=v=>q(v===null?'':"'"+String(v));
 const rows=[['Año del libro','Número','Fecha declarada','Clase','Estado','Renglón','Cuenta','Debe exacto','Haber exacto','Destino original','Papel del renglón','Conceptos originales','Importe original','Partida','Institución','Función','Respaldo del par','Huella del asiento']];
 for(const e of detail.journal.entries)rows.push([detail.journal.fiscalYear,detail.number,detail.postingDate,detail.kind,detail.status,e.ordinal,e.accountReference,e.debit,e.credit,e.groupOrdinal,e.role,e.sourceOrdinals.join(' '),e.sourceAmount,e.destination.budgetItemReference,e.destination.institutionalReference,e.destination.functionReference,e.documentReference,detail.journalSha256]);
 return rows.map((r,i)=>r.map(i===0?q:cell).join(';')).join('\r\n')+'\r\n';
}
