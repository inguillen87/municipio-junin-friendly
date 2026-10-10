import {salaryExact,salaryHash,salaryUuid,salaryKey,salarySerialized,SalaryInputError} from './native-salary-catalog-model.js';
import {JOURNAL_READ,journalAccess,journalSummary,journalDetail,journalStateHashValue} from './own-payroll-journal-model.js';
import {accountingHash} from './own-payroll-accounting-model.js';
import {OWN_RUN_TYPES} from './own-payroll-run-workspace-model.js';
import {ownRunDate} from './own-payroll-run-date.js';
import {decimal,rational,exactAdd,exactSubtract,exactCompare,quantize} from './own-payroll-exact.js';

export const RECONCILIATION_VERSION='own-payroll-reconciliation.v1';
export const RECONCILIATION_SOURCE_VERSION='own-payroll-reconciliation-source.v1';
export const RECONCILIATION_READ=JOURNAL_READ,RECONCILIATION_MAX_LINES=250000,RECONCILIATION_MAX_BYTES=8388608;
export const RECONCILIATION_CAPS=Object.freeze({propose:['payroll.parameter.prepare'],approve:['payroll.parameter.approve'],reject:['payroll.parameter.approve'],withdraw:['payroll.parameter.approve']});
export const reconciliationAccess=journalAccess;
export const RECONCILIATION_STATES=Object.freeze({balanced:'Coincide',different:'Diferencia',missing:'Cuenta ausente del documento',extra:'Cuenta ajena al asiento',incomplete:'Importe no informado'});
export const RECONCILIATION_ISSUES=Object.freeze({account_missing:'Declarar la cuenta del renglón.',debit_missing:'Declarar el Debe; si corresponde cero, informar cero.',credit_missing:'Declarar el Haber; si corresponde cero, informar cero.',document_empty:'Informar todos los renglones del documento.',document_unbalanced:'Revisar el documento: sus totales Debe y Haber son distintos.'});
const need=(v,message,code='CONTRACT_INVALID')=>{if(!v)throw new SalaryInputError('RECONCILIATION_'+code,message);};
const text=(v,min=1,max=80)=>typeof v==='string'&&v===v.trim()&&v===v.normalize('NFC')&&v.length>=min&&v.length<=max&&!/[<>\u0000-\u001f\u007f]/.test(v)&&!/[\uD800-\uDFFF]/u.test(v);
const amount=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,95})(\.[0-9]{1,8})?$/.test(v);
const precision=v=>v.split('.')[1]?.length??0;
const sum=values=>values.some(v=>v===null)?null:quantize(values.reduce((a,v)=>exactAdd(a,decimal(v)),rational(0n)),{precision:values.reduce((n,v)=>Math.max(n,precision(v)),0),mode:'exact'}).amount;
const difference=(declared,expected)=>declared===null||expected===null?null:quantize(exactSubtract(decimal(declared),decimal(expected)),{precision:Math.max(precision(declared),precision(expected)),mode:'exact'}).amount;
const equals=(a,b)=>a!==null&&b!==null&&exactCompare(decimal(a),decimal(b))===0;
const same=(a,b)=>salarySerialized(a)===salarySerialized(b);

export const reconciliationSourceHashValue=s=>({version:RECONCILIATION_SOURCE_VERSION,journal:journalStateHashValue(s.journal)});
export async function reconciliationSource(v){
 need(salaryExact(v,['version','scopeVersion','journal','sourceVersion','complete'])&&v.version===RECONCILIATION_SOURCE_VERSION&&[v.scopeVersion,v.sourceVersion].every(salaryHash)&&v.complete===true,'No se verificó el asiento completo para conciliar.');
 await journalDetail(v.journal);need(v.journal.status==='posted','Elegí un asiento registrado vigente; una propuesta o un original revertido no habilita conciliación.','SOURCE_CHANGED');
 need(await accountingHash(reconciliationSourceHashValue(v))===v.sourceVersion,'La fuente cambió su contenido o estado.');return v;
}
export function reconciliationDocument(v,{allowPending=false}={}){
 need(salaryExact(v,['reference','issuerReference','date','lines'])&&text(v.reference,3,180)&&text(v.issuerReference,1,80)&&ownRunDate(v.date)&&Array.isArray(v.lines)&&v.lines.length<=RECONCILIATION_MAX_LINES,'Declarar documento, emisor, fecha civil y todos los renglones.','INPUT_INVALID');
 if(!allowPending)need(v.lines.length>0,'El documento no tiene renglones para conciliar.','REVIEW_REQUIRED');
 for(const [i,r]of v.lines.entries()){
  need(salaryExact(r,['ordinal','accountReference','debit','credit'])&&r.ordinal===i+1&&(r.accountReference===null||text(r.accountReference))&&(r.debit===null||amount(r.debit))&&(r.credit===null||amount(r.credit)),'Un renglón contiene referencias, importes u ordinales inválidos.','INPUT_INVALID');
  if(!allowPending)need(r.accountReference!==null&&r.debit!==null&&r.credit!==null,'Completá todos los renglones del documento, incluidos los de otras páginas.','REVIEW_REQUIRED');
 }
 return structuredClone(v);
}
export async function compareReconciliation(source,document){
 const s=await reconciliationSource(source),d=reconciliationDocument(document,{allowPending:true}),entries=s.journal.journal.entries,accounts=new Map(),lineIssues=[],globalIssues=[];
 const row=accountReference=>{if(!accounts.has(accountReference))accounts.set(accountReference,{accountReference,sourceEntries:[],documentLines:[]});return accounts.get(accountReference);};
 for(const e of entries)row(e.accountReference).sourceEntries.push(e);
 for(const r of d.lines){for(const [field,code]of [['accountReference','account_missing'],['debit','debit_missing'],['credit','credit_missing']])if(r[field]===null)lineIssues.push({ordinal:r.ordinal,code});if(r.accountReference!==null)row(r.accountReference).documentLines.push(r);}
 if(d.lines.length===0)globalIssues.push('document_empty');
 const rows=[...accounts.values()].map((r,i)=>{
  const expectedDebit=r.sourceEntries.length?sum(r.sourceEntries.map(e=>e.debit)):null,expectedCredit=r.sourceEntries.length?sum(r.sourceEntries.map(e=>e.credit)):null,declaredDebit=r.documentLines.length?sum(r.documentLines.map(e=>e.debit)):null,declaredCredit=r.documentLines.length?sum(r.documentLines.map(e=>e.credit)):null;
  const status=!r.sourceEntries.length?'extra':!r.documentLines.length?'missing':declaredDebit===null||declaredCredit===null?'incomplete':equals(expectedDebit,declaredDebit)&&equals(expectedCredit,declaredCredit)?'balanced':'different';
  return {ordinal:i+1,accountReference:r.accountReference,sourceEntryOrdinals:r.sourceEntries.map(e=>e.ordinal),documentLineOrdinals:r.documentLines.map(e=>e.ordinal),expectedDebit,expectedCredit,declaredDebit,declaredCredit,differenceDebit:difference(declaredDebit,expectedDebit),differenceCredit:difference(declaredCredit,expectedCredit),status};
 });
 const totals={expectedDebit:sum(entries.map(e=>e.debit)),expectedCredit:sum(entries.map(e=>e.credit)),declaredDebit:d.lines.length?sum(d.lines.map(e=>e.debit)):null,declaredCredit:d.lines.length?sum(d.lines.map(e=>e.credit)):null};
 if(totals.declaredDebit!==null&&totals.declaredCredit!==null&&!equals(totals.declaredDebit,totals.declaredCredit))globalIssues.push('document_unbalanced');
 return {version:RECONCILIATION_VERSION,journalId:s.journal.id,journalNumber:s.journal.number,journalSha256:s.journal.journalSha256,sourceVersion:s.sourceVersion,period:s.journal.journal.period,liquidationType:s.journal.journal.liquidationType,fiscalYear:s.journal.journal.fiscalYear,postingDate:s.journal.postingDate,documentReference:d.reference,issuerReference:d.issuerReference,documentDate:d.date,sourceEntryCount:entries.length,documentLineCount:d.lines.length,accounts:rows,lineIssues,globalIssues,totals:{...totals,differenceDebit:difference(totals.declaredDebit,totals.expectedDebit),differenceCredit:difference(totals.declaredCredit,totals.expectedCredit)},ready:rows.length>0&&d.lines.length>0&&lineIssues.length===0&&globalIssues.length===0&&rows.every(r=>r.status==='balanced'),complete:true,paymentExecuted:false,externalAcceptance:false};
}
// Clipboard table has an explicit schema and decimal separator; no bank layout is inferred.
export function reconciliationTable(value,decimalSeparator){
 need(typeof value==='string'&&new TextEncoder().encode(value).length<=RECONCILIATION_MAX_BYTES&&['.',','].includes(decimalSeparator),'Elegí el separador decimal y pegá una tabla Cuenta, Debe y Haber sin separadores de miles.','INPUT_INVALID');
 const rows=[];let row=[],cell='',quoted=false,closed=false,atStart=true;
 for(let i=0;i<=value.length;i++){
  const ch=value[i],end=i===value.length;
  if(quoted){if(end)need(false,'La tabla contiene una celda sin cerrar.','INPUT_INVALID');if(ch==='"'){if(value[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=ch;continue;}
  if(atStart&&ch==='"'){quoted=true;atStart=false;continue;}
  if(end||ch==='\t'||ch==='\r'||ch==='\n'){
   row.push(cell);cell='';closed=false;atStart=true;
   if(ch==='\t')continue;
   if(ch==='\r'&&value[i+1]==='\n')i++;
   if(!(end&&row.length===1&&row[0]===''&&rows.length&&/[\r\n]$/.test(value)))rows.push(row);
   row=[];need(rows.length<=RECONCILIATION_MAX_LINES+1,'La tabla completa supera su capacidad; no se recortaron filas.','LIMIT');continue;
  }
  need(!closed&&ch!=='"','La tabla contiene comillas o separadores ambiguos.','INPUT_INVALID');cell+=ch;atStart=false;
 }
 need(rows.length>0&&same(rows.shift(),['Cuenta','Debe','Haber']),'La primera fila debe ser Cuenta, Debe y Haber, separadas por tabulaciones.','INPUT_INVALID');
 return rows.map((r,i)=>{need(r.length===3,'La fila '+(i+2)+' debe tener exactamente tres columnas.','INPUT_INVALID');const values=r.slice(1).map(v=>{if(v==='')return null;if(decimalSeparator===',')need(!v.includes('.'),'La fila '+(i+2)+' mezcla punto con separador decimal coma.','INPUT_INVALID');else need(!v.includes(','),'La fila '+(i+2)+' mezcla coma con separador decimal punto.','INPUT_INVALID');const a=decimalSeparator===','?v.replace(',','.'):v;need(amount(a),'La fila '+(i+2)+' contiene un importe inválido, exponente o separador de miles.','INPUT_INVALID');return a;});return{ordinal:i+1,accountReference:r[0]===''?null:r[0],debit:values[0],credit:values[1]};});
}
export function reconciliationCommand(v){
 need(salaryExact(v,['version','command','journalId','scopeVersion','sourceVersion','document','comparisonSha256','proposalId','proposalSha256','reason','reviewConfirmed'])&&v.version===RECONCILIATION_VERSION&&Object.hasOwn(RECONCILIATION_CAPS,v.command)&&salaryUuid(v.journalId)&&[v.scopeVersion,v.sourceVersion,v.comparisonSha256].every(salaryHash)&&text(v.reason,10,1000)&&v.reviewConfirmed===true,'Revisá asiento, documento completo, fundamento y confirmación.','INPUT_INVALID');
 reconciliationDocument(v.document);need(v.command==='propose'?v.proposalId===null&&v.proposalSha256===null:salaryUuid(v.proposalId)&&salaryHash(v.proposalSha256),'La decisión requiere la propuesta exacta revisada.','INPUT_INVALID');return structuredClone(v);
}
const validDecision=(d,commands)=>salaryExact(d,['id','command','reason','actorLabel','recordedAt'])&&salaryUuid(d.id)&&commands.includes(d.command)&&text(d.reason,10,1000)&&text(d.actorLabel,1,160)&&typeof d.recordedAt==='string'&&!isNaN(Date.parse(d.recordedAt));
export function reconciliationSummary(v){
 need(salaryExact(v,['id','proposalId','journalId','requestSha256','comparisonSha256','status','reason','authorLabel','canReview','documentReference','documentDate','accountCount','lineCount','decision','withdrawal'])&&[v.id,v.proposalId,v.journalId].every(salaryUuid)&&[v.requestSha256,v.comparisonSha256].every(salaryHash)&&['pending','approved','rejected','withdrawn'].includes(v.status)&&text(v.reason,10,1000)&&text(v.authorLabel,1,160)&&typeof v.canReview==='boolean'&&text(v.documentReference,3,180)&&ownRunDate(v.documentDate)&&Number.isSafeInteger(v.accountCount)&&v.accountCount>0&&v.accountCount<=2*RECONCILIATION_MAX_LINES&&Number.isSafeInteger(v.lineCount)&&v.lineCount>0&&v.lineCount<=RECONCILIATION_MAX_LINES,'No se verificó el historial completo de conciliaciones.');
 need(v.status==='pending'?v.id===v.proposalId&&v.decision===null&&v.withdrawal===null:validDecision(v.decision,[v.status==='rejected'?'reject':'approve'])&&(v.status==='withdrawn'?validDecision(v.withdrawal,['withdraw'])&&v.id===v.withdrawal.id:v.withdrawal===null&&v.id===v.decision.id),'La decisión no corresponde a su historial.');return v;
}
export function reconciliationBootstrap(v){
 need(salaryExact(v,['version','scopeVersion','period','liquidationType','journals','reconciliations','permissions','complete','paymentExecuted'])&&v.version===RECONCILIATION_VERSION&&salaryHash(v.scopeVersion)&&/^(19|20)[0-9]{2}-(0[1-9]|1[0-2])$/.test(v.period)&&Object.hasOwn(OWN_RUN_TYPES,v.liquidationType)&&v.complete===true&&v.paymentExecuted===false&&salaryExact(v.permissions,['canPropose','canReview'])&&Object.values(v.permissions).every(x=>typeof x==='boolean')&&Array.isArray(v.journals)&&v.journals.length<=1000&&Array.isArray(v.reconciliations)&&v.reconciliations.length<=1000,'No se verificó la consulta completa de conciliación.');
 for(const [rows,verify]of [[v.journals,journalSummary],[v.reconciliations,reconciliationSummary]]){const seen=new Set();for(const r of rows){verify(r);need(!seen.has(r.id.toLowerCase()),'La consulta repitió un asiento o una propuesta.');seen.add(r.id.toLowerCase());}}
 need(v.journals.every(r=>r.status==='posted'),'La consulta contiene asientos pendientes, rechazados o revertidos.');return v;
}
export const reconciliationStateHashValue=v=>({version:RECONCILIATION_VERSION,id:v.id,proposalId:v.proposalId,requestSha256:v.requestSha256,comparisonSha256:v.comparisonSha256,status:v.status,decision:v.decision,withdrawal:v.withdrawal});
export async function reconciliationDetail(v){
 need(salaryExact(v,['version','id','proposalId','body','requestSha256','source','comparison','comparisonSha256','status','stateVersion','sourceCurrent','canReview','authorLabel','decision','withdrawal'])&&v.version===RECONCILIATION_VERSION&&[v.id,v.proposalId].every(salaryUuid)&&[v.requestSha256,v.comparisonSha256,v.stateVersion].every(salaryHash)&&typeof v.sourceCurrent==='boolean'&&typeof v.canReview==='boolean'&&text(v.authorLabel,1,160),'No se verificó la constancia conservada.');
 await reconciliationSource(v.source);
 const b=reconciliationCommand(v.body);need(b.command==='propose'&&b.journalId.toLowerCase()===v.source.journal.id.toLowerCase()&&b.sourceVersion===v.source.sourceVersion&&await accountingHash(b)===v.requestSha256,'La propuesta perdió el contenido o asiento original.');
 const c=await compareReconciliation(v.source,b.document);need(c.ready&&same(c,v.comparison)&&await accountingHash(c)===v.comparisonSha256&&b.comparisonSha256===v.comparisonSha256,'La constancia perdió cuentas, renglones o importes originales.');
 reconciliationSummary({id:v.id,proposalId:v.proposalId,journalId:b.journalId,requestSha256:v.requestSha256,comparisonSha256:v.comparisonSha256,status:v.status,reason:b.reason,authorLabel:v.authorLabel,canReview:v.canReview,documentReference:b.document.reference,documentDate:b.document.date,accountCount:c.accounts.length,lineCount:c.documentLineCount,decision:v.decision,withdrawal:v.withdrawal});
 need(await accountingHash(reconciliationStateHashValue(v))===v.stateVersion,'El estado perdió su integridad.');return v;
}
export async function prepareReconciliation(source,document,reason){
 const c=await compareReconciliation(source,document);need(c.ready,'Resolvé todas las diferencias y renglones no informados antes de preparar.','REVIEW_REQUIRED');
 return reconciliationCommand({version:RECONCILIATION_VERSION,command:'propose',journalId:source.journal.id,scopeVersion:source.scopeVersion,sourceVersion:source.sourceVersion,document,comparisonSha256:await accountingHash(c),proposalId:null,proposalSha256:null,reason,reviewConfirmed:true});
}
export async function decideReconciliation(boot,detail,command,reason){
 reconciliationBootstrap(boot);await reconciliationDetail(detail);need(boot.permissions.canReview&&detail.canReview&&['approve','reject','withdraw'].includes(command)&&boot.reconciliations.some(v=>v.proposalId===detail.proposalId&&v.requestSha256===detail.requestSha256&&v.status===detail.status)&&(command==='withdraw'?detail.status==='approved':detail.status==='pending'),'La decisión requiere otra identidad habilitada y la versión consultada.','INDEPENDENT_REQUIRED');
 need(command!=='approve'||detail.sourceCurrent,'El asiento cambió; conservá el historial y consultá de nuevo.','SOURCE_CHANGED');return reconciliationCommand({...detail.body,command,scopeVersion:boot.scopeVersion,proposalId:detail.proposalId,proposalSha256:detail.requestSha256,reason});
}
export function reconciliationAttempt(key,body,accessKey){
 need(salaryKey(key)&&typeof accessKey==='string'&&accessKey,'No se pudo conservar el intento.','INPUT_INVALID');const v={key,body:reconciliationCommand(body),accessKey};const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};return freeze(v);
}
export async function reconciliationReceipt(v,attempt=null){
 need(salaryExact(v,['version','eventId','proposalId','requestKey','requestSha256','body','status','comparisonSha256','sourceVersion','replayed','accountingReconciled','paymentExecuted','externalAcceptance'])&&v.version===RECONCILIATION_VERSION&&[v.eventId,v.proposalId].every(salaryUuid)&&salaryKey(v.requestKey)&&[v.requestSha256,v.comparisonSha256,v.sourceVersion].every(salaryHash)&&typeof v.replayed==='boolean'&&v.paymentExecuted===false&&v.externalAcceptance===false,'No se verificó el comprobante del intento.');
 const b=reconciliationCommand(v.body);need(await accountingHash(b)===v.requestSha256&&v.sourceVersion===b.sourceVersion&&v.comparisonSha256===b.comparisonSha256&&v.accountingReconciled===(b.command==='approve')&&v.status===({propose:'pending',approve:'approved',reject:'rejected',withdraw:'withdrawn'})[b.command]&&(b.command==='propose'?v.eventId===v.proposalId:v.proposalId.toLowerCase()===b.proposalId.toLowerCase()),'El comprobante no corresponde al envío.');if(attempt)need(v.requestKey===attempt.key&&same(v.body,attempt.body),'El servicio cambió el cuerpo o la clave pendiente.');return v;
}
export async function reconciliationCsv(detail){
 await reconciliationDetail(detail);need(detail.status==='approved'&&detail.sourceCurrent,'Consultá una constancia aprobada vigente antes de descargar.','EXPORT_UNAVAILABLE');
 const q=v=>'"'+String(v??'').replaceAll('"','""')+'"',cell=v=>q(v===null?'':"'"+String(v)),c=detail.comparison;
 const rows=[['Registro','Documento','Emisor','Fecha documental','Año del libro','Número del asiento','Cuenta','Ordinal','Debe del asiento','Haber del asiento','Debe declarado','Haber declarado','Diferencia Debe · documento menos asiento','Diferencia Haber · documento menos asiento','Renglones del asiento','Renglones del documento','Estado','Huella de constancia']];
 const metadata=[c.documentReference,c.issuerReference,c.documentDate,c.fiscalYear,c.journalNumber];
 for(const r of c.accounts)rows.push(['Cuenta',...metadata,r.accountReference,r.ordinal,r.expectedDebit,r.expectedCredit,r.declaredDebit,r.declaredCredit,r.differenceDebit,r.differenceCredit,r.sourceEntryOrdinals.join(' '),r.documentLineOrdinals.join(' '),r.status,detail.comparisonSha256]);
 for(const r of detail.source.journal.journal.entries)rows.push(['Asiento',...metadata,r.accountReference,r.ordinal,r.debit,r.credit,null,null,null,null,r.ordinal,null,'Registrado',detail.comparisonSha256]);
 for(const r of detail.body.document.lines)rows.push(['Documento',...metadata,r.accountReference,r.ordinal,null,null,r.debit,r.credit,null,null,null,r.ordinal,'Declarado',detail.comparisonSha256]);
 return rows.map((r,i)=>r.map(i===0?q:cell).join(';')).join('\r\n')+'\r\n';
}
