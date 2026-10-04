import {monthlyAnnulBatch,monthlyAnnulBootstrap,monthlyAnnulCanonical,monthlyAnnulExact,monthlyAnnulHash,monthlyAnnulKey,monthlyAnnulMonth,monthlyAnnulUuid} from './payroll-monthly-annul-model.js';

export const MONTHLY_CORRECTION_VERSION='payroll-monthly-correction.v1';
export const MONTHLY_CORRECTION_FIELDS=Object.freeze(['periodMonth','payrollType','conceptSourceId','costCenterSourceId','adjustmentMonth','quantityDecimal','amountCents','movementType','legalInstrument','observation','forced']);
export const MONTHLY_CORRECTION_LIMITS=Object.freeze({batches:100,rows:5000,candidates:1000,proposals:1000});
const types=['monthly','first_fortnight','sac','vacation','supplementary','final','other'];
const exact=monthlyAnnulExact,canonical=monthlyAnnulCanonical,has=(v,k)=>Object.hasOwn(v,k);
const fail=(message='No se pudo verificar la corrección. Volvé a consultar.')=>{throw Error(message);};
const requireValue=(value,message)=>{if(!value)fail(message);};
const freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const count=(v,max)=>Number.isSafeInteger(v)&&v>=1&&v<=max;
const code=v=>typeof v==='string'&&/^(?:0|[1-9]\d{0,19})$/.test(v);
const reason=v=>typeof v==='string'&&v===v.trim()&&v===v.normalize('NFC')&&v.length>=10&&v.length<=1000&&!/[<>\u0000-\u001f\u007f]/.test(v);
const text=(v,max)=>v===null||typeof v==='string'&&v.length>0&&v.length<=max&&v===v.trim()&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v);
const stamp=v=>typeof v==='string'&&/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)===v.slice(0,10);
const effects=v=>exact(v,['grhMutation','payrollCalculated','payrollPosted'])&&Object.values(v).every(x=>x===false);
export function monthlyCorrectionPatch(raw){
 requireValue(raw&&typeof raw==='object'&&!Array.isArray(raw)&&[Object.prototype,null].includes(Object.getPrototypeOf(raw))&&Object.keys(raw).length>0&&Object.keys(raw).every(k=>MONTHLY_CORRECTION_FIELDS.includes(k)),'Elegí los campos que vas a corregir. Los demás conservan sus valores.');
 for(const [key,value]of Object.entries(raw)){
  const valid=key==='periodMonth'?monthlyAnnulMonth(value):key==='payrollType'?types.includes(value):key==='conceptSourceId'?code(value):key==='costCenterSourceId'?value===null||code(value):key==='adjustmentMonth'?value===null||monthlyAnnulMonth(value):key==='quantityDecimal'?value===null||typeof value==='string'&&/^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(value)&&! /^-0(?:\.0+)?$/.test(value):key==='amountCents'?value===null||typeof value==='string'&&/^-?(?:0|[1-9]\d{0,17})$/.test(value)&&value!=='-0':key==='movementType'?value===null||typeof value==='string'&&/^[a-z0-9][a-z0-9._-]{0,31}$/.test(value):key==='forced'?typeof value==='boolean':text(value,key==='legalInstrument'?160:500);
  requireValue(valid,'El campo '+key+' no tiene un valor admitido. No se convirtió ni redondeó.');
 }return structuredClone(raw);
}
export function monthlyCorrectionValues(before,rawPatch){
 monthlyAnnulBatch(before);const patch=monthlyCorrectionPatch(rawPatch),after=structuredClone(before);
 for(const key of ['periodMonth','payrollType'])if(has(patch,key))after[key]=patch[key];
 requireValue(after.contractVersion!=='payroll-novelty-batch.v2'||after.payrollType==='monthly','La novedad propia admite Mensual. La selección completa requiere corregir este tipo antes de continuar.');
 const seen=new Set();let changed=false;
 for(const row of after.rows){
  for(const key of MONTHLY_CORRECTION_FIELDS.filter(k=>!['periodMonth','payrollType'].includes(k)))if(has(patch,key))row[key]=patch[key];
  if(has(patch,'quantityDecimal')&&row.quantityDecimal!==null)row.quantityDecimal=row.quantityDecimal.replace(/(\.\d*?[1-9])0+$|\.0+$/,'$1');
  requireValue(row.adjustmentMonth===null||row.adjustmentMonth<=after.periodMonth,'El mes de ajuste de una fila es posterior al período corregido. No se omitió la fila.');
  requireValue(row.quantityDecimal!==null||row.amountCents!==null,'Una fila quedó sin unidades ni importe. Revisá toda la selección.');
  requireValue(!row.forced||row.amountCents!==null&&(row.observation?.length??0)>=10,'El modo forzado requiere importe y fundamento de al menos 10 caracteres.');
  const businessKey=canonical([row.employmentContractId,row.conceptSourceId,row.costCenterSourceId,row.adjustmentMonth,row.movementType]);
  requireValue(!seen.has(businessKey),'La corrección crea un destino repetido dentro de un lote. No se omitió ni agrupó ninguna fila.');seen.add(businessKey);
  changed ||= canonical(row)!==canonical(before.rows[row.rowOrdinal-1]);
 }
 changed ||= after.periodMonth!==before.periodMonth||after.payrollType!==before.payrollType;
 requireValue(changed,'Un lote de la selección no tiene cambios. Retiralo expresamente o corregí los campos elegidos.');
 // Original identity, source, row ordinal, amounts not chosen, and approval
 // remain detached and unchanged. Server recomputes issues before persistence.
 return freeze({before:structuredClone(before),after});
}
export function monthlyCorrectionCommand(raw){
 requireValue(exact(raw,['command','proposalId','proposalSha256','previewSha256','items','patch','reason'])&&['preview','propose','approve','reject'].includes(raw.command)&&reason(raw.reason),'Completá un motivo de 10 a 1.000 caracteres y revisá el conjunto.');
 if(['preview','propose'].includes(raw.command)){
  requireValue(raw.command==='preview'?raw.previewSha256===null:monthlyAnnulHash(raw.previewSha256),'Revisá la previa verificada antes de proponer la corrección.');
  requireValue(raw.proposalId===null&&raw.proposalSha256===null&&Array.isArray(raw.items)&&count(raw.items.length,100),'Elegí entre 1 y 100 lotes completos. No se recorta la selección.');
  monthlyCorrectionPatch(raw.patch);requireValue(raw.items.every(x=>exact(x,['batchId','expectedVersion','snapshotSha256'])&&monthlyAnnulUuid(x.batchId)&&count(x.expectedVersion,2147483646)&&monthlyAnnulHash(x.snapshotSha256))&&new Set(raw.items.map(x=>x.batchId)).size===raw.items.length,'La selección tiene un lote repetido o no verificable.');
 }else requireValue(raw.previewSha256===null&&raw.items===null&&raw.patch===null&&monthlyAnnulUuid(raw.proposalId)&&monthlyAnnulHash(raw.proposalSha256),'Elegí una propuesta íntegra y verificable.');
 return structuredClone(raw);
}
export function monthlyCorrectionBootstrap(value){
 requireValue(exact(value,['version','scopeKey','permissions','candidates','proposals','complete','effects'])&&value.version===MONTHLY_CORRECTION_VERSION);
 monthlyAnnulBootstrap({...value,version:'payroll-monthly-annul.v1'});
 return value;
}
export function monthlyCorrectionDetail(v){
 requireValue(exact(v,['version','scopeKey','proposalId','proposalSha256','previewSha256','status','reason','patch','canPropose','canReview','items','decision','effects'])&&v.version===MONTHLY_CORRECTION_VERSION&&monthlyAnnulHash(v.scopeKey)&&effects(v.effects)&&typeof v.canPropose==='boolean'&&typeof v.canReview==='boolean');
 requireValue(Array.isArray(v.items)&&count(v.items.length,100));let rowCount=0;
 for(const item of v.items){requireValue(exact(item,['snapshotSha256','batch','identityCurrent',...(v.status==='candidate'?[]:['after'])])&&monthlyAnnulHash(item.snapshotSha256)&&typeof item.identityCurrent==='boolean');monthlyAnnulBatch(item.batch);rowCount+=item.batch.rowCount;if(v.status!=='candidate'){const expected=monthlyCorrectionValues(item.batch,v.patch).after;monthlyAnnulBatch(item.after);const dataOnly=b=>({...b,blockingIssueCount:0,warningIssueCount:0,rows:b.rows.map(r=>({...r,issues:[]}))});requireValue(canonical(dataOnly(expected))===canonical(dataOnly(item.after)),'La comparación no conserva todos los valores originales y corregidos.');requireValue(item.after.warningIssueCount===item.after.rows.reduce((n,r)=>n+r.issues.length,0));}}
 requireValue(rowCount<=5000&&new Set(v.items.map(x=>x.batch.id)).size===v.items.length);
 if(v.status==='candidate')requireValue(v.items.length===1&&v.proposalId===null&&v.proposalSha256===null&&v.previewSha256===null&&v.reason===null&&v.patch===null&&v.decision===null&&v.canReview===false&&(!v.canPropose||v.items[0].identityCurrent));
 else if(v.status==='preview')requireValue(v.proposalId===null&&v.proposalSha256===null&&monthlyAnnulHash(v.previewSha256)&&reason(v.reason)&&v.canPropose===true&&v.canReview===false&&v.items.every(i=>i.identityCurrent)&&v.decision===null);
 else{
  requireValue(['pending','approved','rejected'].includes(v.status)&&monthlyAnnulUuid(v.proposalId)&&monthlyAnnulHash(v.proposalSha256)&&monthlyAnnulHash(v.previewSha256)&&reason(v.reason)&&v.canPropose===false);monthlyCorrectionPatch(v.patch);
  requireValue(v.status==='pending'?v.decision===null:exact(v.decision,['command','reason','recordedAt'])&&v.decision.command===({approved:'approve',rejected:'reject'})[v.status]&&reason(v.decision.reason)&&stamp(v.decision.recordedAt)&&v.canReview===false);
 }return v;
}
export function monthlyCorrectionPlan(details,scopeKey,patch,reasonText){
 requireValue(monthlyAnnulHash(scopeKey)&&Array.isArray(details)&&count(details.length,100));monthlyCorrectionPatch(patch);
 const current=details.map(monthlyCorrectionDetail);requireValue(current.every(d=>d.status==='candidate'&&d.canPropose&&d.scopeKey===scopeKey),'Cambió el acceso o una identidad; no se omitió ningún lote.');
 const items=current.flatMap(d=>d.items).sort((a,b)=>a.batch.id<b.batch.id?-1:1);requireValue(items.reduce((n,i)=>n+i.batch.rowCount,0)<=5000,'La selección supera 5.000 filas. No se recortó ni dividió ningún lote.');
 const compared=items.map(i=>({...structuredClone(i),after:monthlyCorrectionValues(i.batch,patch).after}));
 const body=monthlyCorrectionCommand({command:'preview',proposalId:null,proposalSha256:null,previewSha256:null,items:items.map(i=>({batchId:i.batch.id,expectedVersion:i.batch.version,snapshotSha256:i.snapshotSha256})),patch,reason:reasonText});
 return freeze({scopeKey,body,items:compared});
}
export function monthlyCorrectionPreview(preview,body){
 monthlyCorrectionCommand(body);monthlyCorrectionDetail(preview);
 requireValue(body.command==='preview'&&preview.status==='preview'&&canonical(preview.patch)===canonical(body.patch)&&preview.reason===body.reason,'La previa corresponde a otra corrección.');
 const targets=preview.items.map(i=>({batchId:i.batch.id,expectedVersion:i.batch.version,snapshotSha256:i.snapshotSha256}));
 requireValue(canonical(targets)===canonical(body.items),'La previa no contiene exactamente todos los lotes seleccionados.');
 return preview;
}
export function monthlyCorrectionVerifiedPlan(preview,draft){
 monthlyCorrectionPreview(preview,draft.body);requireValue(preview.scopeKey===draft.scopeKey,'La previa corresponde a otro ámbito.');
 const originals=items=>items.map(i=>({snapshotSha256:i.snapshotSha256,batch:i.batch,identityCurrent:i.identityCurrent}));
 requireValue(Array.isArray(draft.items)&&canonical(originals(preview.items))===canonical(originals(draft.items)),'Cambió un valor original de la revisión. Consultá todos los lotes nuevamente.');
 const body=monthlyCorrectionCommand({...draft.body,command:'propose',previewSha256:preview.previewSha256});return freeze({scopeKey:preview.scopeKey,body,items:structuredClone(preview.items)});
}
export function monthlyCorrectionReviewPlan(detail,command,reasonText){
 monthlyCorrectionDetail(detail);requireValue(detail.status==='pending'&&detail.canReview&&['approve','reject'].includes(command),'La propuesta requiere otra persona con permiso de aprobación vigente.');
 return freeze({scopeKey:detail.scopeKey,body:monthlyCorrectionCommand({command,proposalId:detail.proposalId,proposalSha256:detail.proposalSha256,previewSha256:null,items:null,patch:null,reason:reasonText}),items:structuredClone(detail.items)});
}
export function monthlyCorrectionUnchanged(plan,details){
 try{
  const current=details.map(monthlyCorrectionDetail);const preparing=['preview','propose'].includes(plan.body.command);
  if(current.some(d=>d.scopeKey!==plan.scopeKey))return false;
  if(preparing&&current.some(d=>d.status!=='candidate'||!d.canPropose))return false;
  if(!preparing&&current.some(d=>d.status!=='pending'||!d.canReview||d.proposalId!==plan.body.proposalId||d.proposalSha256!==plan.body.proposalSha256))return false;
  const items=current.flatMap(d=>d.items).sort((a,b)=>a.batch.id<b.batch.id?-1:1);
  if(preparing){const beforeOnly=v=>v.map(i=>({snapshotSha256:i.snapshotSha256,batch:i.batch,identityCurrent:i.identityCurrent}));return canonical(beforeOnly(items))===canonical(beforeOnly(plan.items));}
  return canonical(items)===canonical(plan.items);
 }catch{return false;}
}
export function monthlyCorrectionAttempt(plan,key){requireValue(monthlyAnnulKey(key)&&monthlyAnnulHash(plan.scopeKey)&&plan.body.command!=='preview','La revisión preliminar no habilita un guardado. Verificá la previa completa.');const body=monthlyCorrectionCommand(plan.body);return freeze({scopeKey:plan.scopeKey,key,body,serializedBody:JSON.stringify({command:'correct',payload:body})});}
export function monthlyCorrectionReceipt(v,attempt){
 requireValue(exact(v,['version','eventId','proposalId','key','bodySha256','body','replayed','status','recordedAt','effects'])&&v.version===MONTHLY_CORRECTION_VERSION&&monthlyAnnulUuid(v.eventId)&&monthlyAnnulUuid(v.proposalId)&&monthlyAnnulKey(v.key)&&monthlyAnnulHash(v.bodySha256)&&typeof v.replayed==='boolean'&&stamp(v.recordedAt)&&effects(v.effects));
 const body=monthlyCorrectionCommand(v.body);requireValue(body.command!=='preview'&&v.status===({propose:'pending',approve:'approved',reject:'rejected'})[body.command]&&(body.command==='propose'?v.eventId===v.proposalId:v.proposalId===body.proposalId));
 if(attempt)requireValue(v.key===attempt.key&&canonical(v.body)===canonical(attempt.body),'La confirmación no corresponde al envío original. Recuperá su mismo comprobante.');return v;
}
