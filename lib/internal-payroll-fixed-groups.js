import {fixedFail,fixedSafeError,fixedContext,fixedUuid,fixedHash,prepareFixedCommand,validateFixedResponse} from './internal-payroll-fixed-novelties.js';

export const FIXED_GROUP_MAX_BODY=192*1024;
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value))&&Object.keys(value).length===keys.length&&Object.keys(value).every(k=>keys.includes(k));
export function prepareFixedGroup(payload){
 if(!exact(payload,['items','reason'])||!Array.isArray(payload.items)||payload.items.length<1||payload.items.length>500)fixedFail('INVALID_PAYLOAD');
 const seen=new Set();
 const items=payload.items.map(item=>{
  if(!exact(item,['recordId','expectedVersion','contractId','legajo','identityToken'])||item.recordId===null)fixedFail('INVALID_PAYLOAD');
  const validated=prepareFixedCommand('propose',{...item,operation:'annul',values:null,reason:payload.reason});
  if(seen.has(validated.recordId))fixedFail('INVALID_PAYLOAD');seen.add(validated.recordId);
  return Object.fromEntries(Object.keys(item).map(k=>[k,validated[k]]));
 });
 return {items,reason:payload.reason};
}
export function fixedGroupResponse(data,{key,payload,attempt=false}={}){
 if(!exact(data,['version','groupId','key','requestSha256','total','rows','duplicate','effects'])||data.version!=='payroll-fixed-annul-group.v1'
 ||!fixedUuid(data.groupId)||!fixedUuid(data.key)||data.key!==key||!fixedHash(data.requestSha256)||typeof data.duplicate!=='boolean'||attempt&&!data.duplicate
 ||!Number.isSafeInteger(data.total)||data.total<1||data.total>500||!Array.isArray(data.rows)||data.total!==data.rows.length
 ||!exact(data.effects,['approvalEffect','grhMutation','payrollCalculated','payrollPosted'])||data.effects.approvalEffect!=='control_export_only'
 ||[data.effects.grhMutation,data.effects.payrollCalculated,data.effects.payrollPosted].some(v=>v!==false)
 ||payload&&payload.items.length!==data.total)fixedFail('CONTRACT_DRIFT');
 const ids=new Set();
 for(let i=0;i<data.rows.length;i++){
  const row=data.rows[i];validateFixedResponse(row,'propose',{command:'propose',...payload?.items[i]});
  if(row.duplicate!==false||ids.has(row.recordId))fixedFail('CONTRACT_DRIFT');ids.add(row.recordId);
 }
 return data;
}
export async function fixedGroupCall(sql,principal,session,{key,payload}){
 const context=fixedContext(principal,session),attempt=payload===undefined;
 try{
  const result=await sql.query(attempt?'SELECT public.payroll_fixed_group_attempt_v1($1::jsonb,$2::uuid) AS result':'SELECT public.payroll_fixed_group_annul_v1($1::jsonb,$2::jsonb,$3::uuid) AS result',attempt?[JSON.stringify(context),key]:[JSON.stringify(context),JSON.stringify(payload),key]);
  const rows=Array.isArray(result)?result:result?.rows;if(!Array.isArray(rows)||rows.length!==1)fixedFail('CONTRACT_DRIFT');
  return fixedGroupResponse(rows[0]?.result,{key,payload,attempt});
 }catch(error){throw fixedSafeError(error);}
}
