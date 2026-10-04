import {verifyMonthlyBatch} from './payroll-native-monthly-model.js';

export const MONTHLY_ANNUL_VERSION='payroll-monthly-annul.v1';
export const MONTHLY_ANNUL_LIMITS=Object.freeze({batches:100,rows:5000,candidates:1000,proposals:1000});
export const monthlyAnnulExact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v))&&Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k));
export const monthlyAnnulUuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v)&&v!=='00000000-0000-0000-0000-000000000000';
export const monthlyAnnulKey=v=>monthlyAnnulUuid(v)&&v[14]==='4'&&/[89ab]/.test(v[19]);
export const monthlyAnnulHash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export const monthlyAnnulMonth=v=>typeof v==='string'&&/^20(?:0[8-9]|[1-9]\d)-(?:0[1-9]|1[0-2])-01$/.test(v);
const types=['monthly','first_fortnight','sac','vacation','supplementary','final','other'];
const stamp=v=>typeof v==='string'&&/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)===v.slice(0,10);
const count=(v,max)=>Number.isSafeInteger(v)&&v>0&&v<=max;
const reason=v=>typeof v==='string'&&v===v.trim()&&v===v.normalize('NFC')&&v.length>=10&&v.length<=1000&&!/[<>\u0000-\u001f\u007f]/.test(v);
const requireValue=(v,message='No se pudo verificar la anulación. Volvé a consultar.')=>{if(!v)throw Error(message);};
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
export const monthlyAnnulCanonical=v=>Array.isArray(v)?'['+v.map(monthlyAnnulCanonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+monthlyAnnulCanonical(v[k])).join(',')+'}':JSON.stringify(v);
const noPay=v=>monthlyAnnulExact(v,['grhMutation','payrollCalculated','payrollPosted'])&&Object.values(v).every(x=>x===false);
const batchKeys=['id','sourceMode','periodMonth','payrollType','contractVersion','releaseSha','status','version','rowCount','reasonCode','reasonReference','exportable','grhMutation','payrollCalculated','payrollPosted','blockingIssueCount','warningIssueCount','createdAt','updatedAt','submittedAt','decidedAt','rows'];
const rowKeys=['rowOrdinal','employmentContractId','legajo','conceptSourceId','costCenterSourceId','adjustmentMonth','quantityDecimal','amountCents','movementType','legalInstrument','observation','forced','issues'];
const code=v=>typeof v==='string'&&/^(?:0|[1-9][0-9]{0,19})$/.test(v);
const text=(v,max)=>v===null||typeof v==='string'&&v.length>0&&v.length<=max&&v===v.trim()&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v);
export function monthlyAnnulBatch(b){
 verifyMonthlyBatch(b,{mode:'receipt'});
 const approvedReason=b.reasonCode==='validated_for_export'||b.reasonCode==='corrected_after_review'&&b.version>=4&&typeof b.reasonReference==='string'&&b.reasonReference.startsWith('ref:')&&monthlyAnnulUuid(b.reasonReference.slice(4));
 requireValue(monthlyAnnulExact(b,batchKeys)&&b.status==='approved'&&b.exportable===true&&b.version>=3&&b.version<2147483647&&b.rows.length===b.rowCount&&typeof b.releaseSha==='string'&&/^[a-f0-9]{40}$/.test(b.releaseSha)
 &&approvedReason&&text(b.reasonReference,128)&&b.blockingIssueCount===0&&Number.isSafeInteger(b.warningIssueCount)&&b.warningIssueCount>=0
 &&['createdAt','updatedAt','submittedAt','decidedAt'].every(k=>stamp(b[k])));
 for(const[rIndex,r]of b.rows.entries()){
  requireValue(monthlyAnnulExact(r,[...rowKeys,...(b.contractVersion.endsWith('v2')?['subject']:[])])&&r.rowOrdinal===rIndex+1&&monthlyAnnulUuid(r.employmentContractId)
  &&code(r.legajo)&&code(r.conceptSourceId)&&(r.costCenterSourceId===null||code(r.costCenterSourceId))&&(r.adjustmentMonth===null||monthlyAnnulMonth(r.adjustmentMonth)&&r.adjustmentMonth<=b.periodMonth)
  &&(r.quantityDecimal===null||typeof r.quantityDecimal==='string'&&/^-?(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$/.test(r.quantityDecimal)&&! /^-0(?:\.0+)?$/.test(r.quantityDecimal))
  &&(r.amountCents===null||typeof r.amountCents==='string'&&/^-?(?:0|[1-9][0-9]{0,18})$/.test(r.amountCents)&&r.amountCents!=='-0'&&BigInt(r.amountCents)>=-9223372036854775808n&&BigInt(r.amountCents)<=9223372036854775807n)
  &&(r.quantityDecimal!==null||r.amountCents!==null)&&(r.movementType===null||typeof r.movementType==='string'&&/^[a-z0-9][a-z0-9._-]{0,31}$/.test(r.movementType))
  &&text(r.legalInstrument,160)&&text(r.observation,500)&&typeof r.forced==='boolean'&&(!r.forced||r.amountCents!==null&&(r.observation?.length??0)>=10)
  &&Array.isArray(r.issues)&&r.issues.every(i=>monthlyAnnulExact(i,['code','severity','blocking','field','details'])&&typeof i.code==='string'&&i.code.length>0&&['info','warning','error'].includes(i.severity)&&i.blocking===false&&(i.field===null||typeof i.field==='string')&&i.details&&typeof i.details==='object'));
 }
 return b;
}
export function monthlyAnnulCommand(raw){
 requireValue(monthlyAnnulExact(raw,['command','proposalId','proposalSha256','items','reason'])&&['propose','approve','reject'].includes(raw.command)&&reason(raw.reason),'Completá un motivo de 10 a 1.000 caracteres y revisá la operación.');
 if(raw.command==='propose'){
  requireValue(raw.proposalId===null&&raw.proposalSha256===null&&Array.isArray(raw.items)&&count(raw.items.length,100),'Elegí entre 1 y 100 lotes completos. No se recorta la selección.');
  requireValue(raw.items.every(x=>monthlyAnnulExact(x,['batchId','expectedVersion','snapshotSha256'])&&monthlyAnnulUuid(x.batchId)&&count(x.expectedVersion,2147483646)&&monthlyAnnulHash(x.snapshotSha256))&&new Set(raw.items.map(x=>x.batchId)).size===raw.items.length,'Un lote está repetido o su versión no pudo verificarse.');
  // Preserve exact request order. A reviewed plan sorts once before creating its key.
  return structuredClone(raw);
 }
 requireValue(monthlyAnnulUuid(raw.proposalId)&&monthlyAnnulHash(raw.proposalSha256)&&raw.items===null,'Elegí una propuesta completa y verificable.');return {...raw};
}
export function monthlyAnnulBootstrap(v){
 requireValue(monthlyAnnulExact(v,['version','scopeKey','permissions','candidates','proposals','complete','effects'])&&v.version===MONTHLY_ANNUL_VERSION&&monthlyAnnulHash(v.scopeKey)&&v.complete===true&&noPay(v.effects));
 requireValue(monthlyAnnulExact(v.permissions,['canPropose','canReview'])&&Object.values(v.permissions).every(x=>typeof x==='boolean'));
 requireValue(Array.isArray(v.candidates)&&v.candidates.length<=1000&&v.candidates.every(x=>monthlyAnnulExact(x,['batchId','expectedVersion','periodMonth','payrollType','rowCount','canPropose'])&&monthlyAnnulUuid(x.batchId)&&count(x.expectedVersion,2147483646)&&monthlyAnnulMonth(x.periodMonth)&&types.includes(x.payrollType)&&count(x.rowCount,500)&&typeof x.canPropose==='boolean'&&(!x.canPropose||v.permissions.canPropose))&&new Set(v.candidates.map(x=>x.batchId)).size===v.candidates.length);
 requireValue(Array.isArray(v.proposals)&&v.proposals.length<=1000&&v.proposals.every(x=>monthlyAnnulExact(x,['id','status','reason','createdAt','batchCount','rowCount','canReview'])&&monthlyAnnulUuid(x.id)&&['pending','approved','rejected'].includes(x.status)&&reason(x.reason)&&stamp(x.createdAt)&&count(x.batchCount,100)&&count(x.rowCount,5000)&&typeof x.canReview==='boolean'&&(!x.canReview||x.status==='pending'&&v.permissions.canReview))&&new Set(v.proposals.map(x=>x.id)).size===v.proposals.length);
 return v;
}
export function monthlyAnnulDetail(v){
 requireValue(monthlyAnnulExact(v,['version','scopeKey','proposalId','proposalSha256','status','reason','canPropose','canReview','items','decision','effects'])&&v.version===MONTHLY_ANNUL_VERSION&&monthlyAnnulHash(v.scopeKey)&&noPay(v.effects)&&typeof v.canPropose==='boolean'&&typeof v.canReview==='boolean');
 requireValue(Array.isArray(v.items)&&count(v.items.length,100)&&v.items.every(x=>monthlyAnnulExact(x,['snapshotSha256','batch'])&&monthlyAnnulHash(x.snapshotSha256)));
 let rows=0;for(const x of v.items){monthlyAnnulBatch(x.batch);rows+=x.batch.rowCount;}
 requireValue(rows<=5000&&new Set(v.items.map(x=>x.batch.id)).size===v.items.length);
 if(v.status==='candidate')requireValue(v.proposalId===null&&v.proposalSha256===null&&v.reason===null&&v.items.length===1&&v.decision===null&&v.canReview===false);
 else{
  requireValue(['pending','approved','rejected'].includes(v.status)&&monthlyAnnulUuid(v.proposalId)&&monthlyAnnulHash(v.proposalSha256)&&reason(v.reason)&&v.canPropose===false);
  requireValue(v.status==='pending'?v.decision===null:monthlyAnnulExact(v.decision,['command','reason','recordedAt'])&&v.decision.command===({approved:'approve',rejected:'reject'})[v.status]&&reason(v.decision.reason)&&stamp(v.decision.recordedAt)&&v.canReview===false);
 }return v;
}
export function monthlyAnnulPlan(details,scopeKey,reasonText){
 requireValue(monthlyAnnulHash(scopeKey)&&Array.isArray(details)&&count(details.length,100));
 const reviewed=details.map(monthlyAnnulDetail);requireValue(reviewed.every(v=>v.status==='candidate'&&v.canPropose&&v.scopeKey===scopeKey),'Cambió el acceso o un lote ya no admite proponer su anulación.');
 const items=reviewed.flatMap(v=>v.items).sort((a,b)=>a.batch.id<b.batch.id?-1:1);
 requireValue(items.reduce((n,x)=>n+x.batch.rowCount,0)<=5000,'La selección supera 5.000 filas. No se omitió ni dividió ningún lote.');
 const body=monthlyAnnulCommand({command:'propose',proposalId:null,proposalSha256:null,reason:reasonText,items:items.map(x=>({batchId:x.batch.id,expectedVersion:x.batch.version,snapshotSha256:x.snapshotSha256}))});
 return freeze({scopeKey,body,items:structuredClone(items)});
}
export function monthlyAnnulReviewPlan(detail,command,reasonText){
 monthlyAnnulDetail(detail);requireValue(detail.status==='pending'&&detail.canReview&&['approve','reject'].includes(command),'La propuesta requiere otra persona con permiso de aprobación vigente.');
 return freeze({scopeKey:detail.scopeKey,body:monthlyAnnulCommand({command,proposalId:detail.proposalId,proposalSha256:detail.proposalSha256,items:null,reason:reasonText}),items:structuredClone(detail.items)});
}
export function monthlyAnnulUnchanged(plan,details){
 try{const current=details.map(monthlyAnnulDetail);return current.every(d=>d.scopeKey===plan.scopeKey)&&monthlyAnnulCanonical(plan.items)===monthlyAnnulCanonical(current.flatMap(d=>d.items).sort((a,b)=>a.batch.id<b.batch.id?-1:1));}catch{return false;}
}
export function monthlyAnnulAttempt(plan,key){requireValue(monthlyAnnulKey(key)&&monthlyAnnulHash(plan.scopeKey));const body=monthlyAnnulCommand(plan.body);return freeze({scopeKey:plan.scopeKey,key,body,serializedBody:JSON.stringify({command:'annul',payload:body})});}
export function monthlyAnnulReceipt(v,attempt){
 requireValue(monthlyAnnulExact(v,['version','eventId','proposalId','key','bodySha256','body','replayed','status','recordedAt','effects'])&&v.version===MONTHLY_ANNUL_VERSION&&monthlyAnnulUuid(v.eventId)&&monthlyAnnulUuid(v.proposalId)&&monthlyAnnulKey(v.key)&&monthlyAnnulHash(v.bodySha256)&&typeof v.replayed==='boolean'&&stamp(v.recordedAt)&&noPay(v.effects));
 const body=monthlyAnnulCommand(v.body);requireValue(v.status===({propose:'pending',approve:'approved',reject:'rejected'})[body.command]&&(body.command==='propose'?v.proposalId===v.eventId:v.proposalId===body.proposalId));
 if(attempt)requireValue(v.key===attempt.key&&monthlyAnnulCanonical(body)===monthlyAnnulCanonical(attempt.body),'La confirmación no corresponde al envío original. Recuperá su mismo comprobante.');return v;
}
