import {fixedText,fixedReceipt,fixedForm,fixedMoneyInput} from './payroll-fixed-novelties-model.js';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const fail=()=>{throw Error('No se pudo verificar el conjunto. Volvé a consultar y revisar las novedades.');};
export const fixedGroupEligible=row=>Boolean(row?.identityCurrent&&row.canPropose&&row.approved?.operation==='set'&&row.pending===null&&row.version<200);
export const fixedReviewGroupEligible=row=>Boolean(row?.identityCurrent&&row.pending?.canReview&&row.version<200);
export function fixedReviewGroupDraft(rows,decision,reason){
 if(!Array.isArray(rows)||rows.length<1||rows.length>500||!['approve','reject'].includes(decision))fail();
 const seen=new Set(),items=rows.map(row=>{if(!fixedReviewGroupEligible(row)||!uuid(row.id)||!uuid(row.pending.id)||!Number.isSafeInteger(row.version)||seen.has(row.id))fail();seen.add(row.id);return Object.freeze({recordId:row.id,proposalId:row.pending.id,expectedVersion:row.version});});
 return Object.freeze({items:Object.freeze(items),decision,reason:fixedText(reason,'el fundamento de la decisión conjunta')});
}
export function fixedGroupDraft(rows,reason){
 if(!Array.isArray(rows)||rows.length<1||rows.length>500)fail();
 const seen=new Set();const items=rows.map(row=>{
  if(!fixedGroupEligible(row)||!uuid(row.id)||seen.has(row.id)||!uuid(row.subject?.contractId)||!Number.isSafeInteger(row.version))fail();seen.add(row.id);
  return Object.freeze({recordId:row.id,expectedVersion:row.version,contractId:row.subject.contractId,legajo:row.subject.legajo,identityToken:row.subject.identityToken});
 });return Object.freeze({items:Object.freeze(items),reason:fixedText(reason,'el motivo de las anulaciones')});
}
export function fixedCorrectionGroupDraft(rows,changes,reason){
 const base=fixedGroupDraft(rows,reason),keys=['conceptSourceId','costCenterSourceId','payrollType','quantityDecimal','amountArs','forced','forcedReason','legalInstrument','validFrom','validTo'];
 if(!changes||typeof changes!=='object'||Array.isArray(changes)||!Object.keys(changes).length||Object.keys(changes).some(k=>!keys.includes(k)))throw Error('Elegí los campos que vas a corregir. Los demás conservarán el valor de cada novedad.');
 if(Object.hasOwn(changes,'forcedReason')&&!Object.hasOwn(changes,'forced')||changes.forced===true&&!Object.hasOwn(changes,'forcedReason'))throw Error('Declarar modo forzado requiere elegir también su fundamento.');
 const items=base.items.map((item,i)=>{
  const before=rows[i].approved.values,fields={...before,legajo:item.legajo,amountArs:fixedMoneyInput(before.amountCents),reason:base.reason,...changes};
  const values=fixedForm(fields).values;
  if(Object.keys(before).every(k=>before[k]===values[k]))throw Error('La novedad del legajo '+item.legajo+' ya tiene esos valores. Retirala de la selección o cambiá la corrección; no se omiten filas automáticamente.');
  return Object.freeze({...item,values});
 });return Object.freeze({items:Object.freeze(items),reason:base.reason});
}
export function fixedGroupReceipt(envelope,key,payload){
 const review=Object.hasOwn(payload,'decision'),data=envelope?.ok===true?envelope.data:null,keys=['version','groupId','key','requestSha256','total','rows','duplicate','effects',...(review?['decision']:[])];
 const version=review?'payroll-fixed-review-group.v1':payload.items.every(item=>Object.hasOwn(item,'values'))?'payroll-fixed-correction-group.v1':'payroll-fixed-annul-group.v1';
 if(!data||Object.keys(data).length!==keys.length||Object.keys(data).some(k=>!keys.includes(k))||data.version!==version||!uuid(data.groupId)
 ||data.key!==key||!/^[a-f0-9]{64}$/.test(data.requestSha256)||typeof data.duplicate!=='boolean'||data.total!==payload.items.length||!Array.isArray(data.rows)||data.rows.length!==data.total
 ||JSON.stringify(Object.keys(data.effects??{}).sort())!==JSON.stringify(['approvalEffect','grhMutation','payrollCalculated','payrollPosted'].sort())||data.effects.approvalEffect!=='control_export_only'
 ||[data.effects.grhMutation,data.effects.payrollCalculated,data.effects.payrollPosted].some(v=>v!==false))fail();
 if(review&&data.decision!==payload.decision)fail();
 const seen=new Set();data.rows.forEach((row,i)=>{fixedReceipt({ok:true,data:row},review?'review':'propose',payload.items[i]);if(row.duplicate!==false||seen.has(row.recordId))fail();seen.add(row.recordId);});return data;
}
export function fixedGroupUnchanged(original,fresh,review=false){
 const current=new Map(fresh.rows.map(row=>[row.id,row]));
 return original.every(row=>(review?fixedReviewGroupEligible:fixedGroupEligible)(current.get(row.id))&&JSON.stringify(row)===JSON.stringify(current.get(row.id)));
}
