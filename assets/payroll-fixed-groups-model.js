import {fixedText,fixedReceipt} from './payroll-fixed-novelties-model.js';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
const fail=()=>{throw Error('No se pudo verificar el conjunto. Volvé a consultar y revisar las novedades.');};
export const fixedGroupEligible=row=>Boolean(row?.identityCurrent&&row.canPropose&&row.approved?.operation==='set'&&row.pending===null&&row.version<200);
export function fixedGroupDraft(rows,reason){
 if(!Array.isArray(rows)||rows.length<1||rows.length>500)fail();
 const seen=new Set();const items=rows.map(row=>{
  if(!fixedGroupEligible(row)||!uuid(row.id)||seen.has(row.id)||!uuid(row.subject?.contractId)||!Number.isSafeInteger(row.version))fail();seen.add(row.id);
  return Object.freeze({recordId:row.id,expectedVersion:row.version,contractId:row.subject.contractId,legajo:row.subject.legajo,identityToken:row.subject.identityToken});
 });return Object.freeze({items:Object.freeze(items),reason:fixedText(reason,'el motivo de las anulaciones')});
}
export function fixedGroupReceipt(envelope,key,payload){
 const data=envelope?.ok===true?envelope.data:null,keys=['version','groupId','key','requestSha256','total','rows','duplicate','effects'];
 if(!data||Object.keys(data).length!==keys.length||Object.keys(data).some(k=>!keys.includes(k))||data.version!=='payroll-fixed-annul-group.v1'||!uuid(data.groupId)
 ||data.key!==key||!/^[a-f0-9]{64}$/.test(data.requestSha256)||typeof data.duplicate!=='boolean'||data.total!==payload.items.length||!Array.isArray(data.rows)||data.rows.length!==data.total
 ||JSON.stringify(Object.keys(data.effects??{}).sort())!==JSON.stringify(['approvalEffect','grhMutation','payrollCalculated','payrollPosted'].sort())||data.effects.approvalEffect!=='control_export_only'
 ||[data.effects.grhMutation,data.effects.payrollCalculated,data.effects.payrollPosted].some(v=>v!==false))fail();
 const seen=new Set();data.rows.forEach((row,i)=>{fixedReceipt({ok:true,data:row},'propose',payload.items[i]);if(row.duplicate!==false||seen.has(row.recordId))fail();seen.add(row.recordId);});return data;
}
export function fixedGroupUnchanged(original,fresh){
 const current=new Map(fresh.rows.map(row=>[row.id,row]));
 return original.every(row=>fixedGroupEligible(current.get(row.id))&&JSON.stringify(row)===JSON.stringify(current.get(row.id)));
}
