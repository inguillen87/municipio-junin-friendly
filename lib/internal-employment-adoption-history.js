import {employeeContext} from './internal-native-employees.js';
import {adoptionUuid} from '../assets/employment-adoption-contract.js';
export class AdoptionHistoryError extends Error{constructor(code,status,message){super(message);Object.assign(this,{name:'AdoptionHistoryError',code:'EMPLOYMENT_ADOPTION_HISTORY_'+code,status});}}
const fail=(code='INVALID',status=503,message='No se pudieron verificar los antecedentes del legajo. Volvé a consultar.')=>{throw new AdoptionHistoryError(code,status,message);};
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k));
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const date=v=>v===null||typeof v==='string'&&/^\d{4}-\d\d-\d\d$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const stamp=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(v)&&date(v.slice(0,10))&&Number(v.slice(11,13))<24&&Number(v.slice(14,16))<60&&Number(v.slice(17,19))<60&&Number.isFinite(Date.parse(v));
const sourceKeys=['coreVersionId','curatedVersionId','sourceBatchId','coreBaselineBatchId','curatedBaselineBatchId','sourceSha256','coreManifestSha256','curatedManifestSha256','publicationSha256','cutoff','origin','contractSourceBatchId','adoptedAt'];
export function adoptionHistoryProof(v,expected){
 if(!exact(v,['version','scope','contract','history'])||v.version!=='employment-adoption-history.v1'
 ||!exact(v.scope,['tenantId','membershipId','bindingId','companyId','database'])||![v.scope.tenantId,v.scope.membershipId,v.scope.bindingId].every(adoptionUuid)
 ||typeof v.scope.database!=='string'||v.scope.database.length<1||v.scope.database.length>128
 ||!Number.isSafeInteger(v.scope.companyId)||v.scope.companyId<1
 ||!exact(v.contract,['id','personId','legajo','registrationId','readVersion','identityReadVersion','status','startDate','endDate','jurisdictionCode','legalReference','registeredAt'])
 ||![v.contract.id,v.contract.personId,v.contract.registrationId].every(adoptionUuid)||!sha(v.contract.readVersion)||!sha(v.contract.identityReadVersion)
 ||typeof v.contract.legajo!=='string'||v.contract.legajo.length<1||v.contract.legajo.length>64
 ||!['active','inactive','unknown','state_error','pending_start'].includes(v.contract.status)||![v.contract.startDate,v.contract.endDate].every(date)
 ||!['42','55'].includes(v.contract.jurisdictionCode)||typeof v.contract.legalReference!=='string'||v.contract.legalReference.length<3||v.contract.legalReference.length>180
 ||/[<>\u0000-\u001f]/.test(v.contract.legalReference)||!stamp(v.contract.registeredAt)||!exact(v.history,sourceKeys)||v.history.origin!=='GRH'
 ||!['coreVersionId','curatedVersionId','sourceBatchId','coreBaselineBatchId','curatedBaselineBatchId','contractSourceBatchId'].every(k=>adoptionUuid(v.history[k]))
 ||!['sourceSha256','coreManifestSha256','curatedManifestSha256','publicationSha256'].every(k=>sha(v.history[k]))
 ||typeof v.history.cutoff!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(v.history.cutoff)||!stamp(v.history.cutoff+'Z')||!stamp(v.history.adoptedAt))fail();
 if(!object(expected)||!['tenantId','membershipId','contractId'].every(k=>adoptionUuid(expected[k]))||v.scope.tenantId.toLowerCase()!==expected.tenantId.toLowerCase()||v.scope.membershipId.toLowerCase()!==expected.membershipId.toLowerCase()||v.contract.id.toLowerCase()!==expected.contractId.toLowerCase())fail('SCOPE_CHANGED',409,'Cambió el ámbito del legajo. Volvé a abrir su ficha.');
 return structuredClone(v);
}
export async function readAdoptionHistory(sql,principal,session,contractId,binding=null){
 try{
  const ctx=employeeContext(principal,session);if(!adoptionUuid(contractId))fail('INVALID',400);
  if(!principal.tenant.effectiveCapabilities?.includes('workforce.employee.read'))fail('FORBIDDEN',403,'Tu cuenta ya no permite consultar este legajo.');
  const rows=await sql.query('SELECT public.employment_adoption_history_read_v1($1::jsonb,$2::uuid) AS result',[JSON.stringify(ctx),contractId.toLowerCase()]);
  if(!Array.isArray(rows)||rows.length!==1)fail();const proof=adoptionHistoryProof(rows[0]?.result,{tenantId:ctx.tenantId,membershipId:ctx.membershipId,contractId});
  if(binding&&(proof.scope.companyId!==Number(binding.companyId)||proof.scope.database!==binding.database))fail('SCOPE_CHANGED',409,'Cambió la fuente certificada del municipio. Volvé a consultar.');return proof;
 }catch(e){
  if(e instanceof AdoptionHistoryError)throw e;
  const code=String(e?.code??'')+' '+String(e?.message??'');
  if(/SESSION_INVALID/.test(code))fail('SESSION_INVALID',401,'La sesión venció. Volvé a ingresar para consultar el legajo.');
  if(/FORBIDDEN|SOD_CONFLICT/.test(code))fail('FORBIDDEN',403,'Tu cuenta ya no permite consultar este legajo.');
  if(/HISTORY_SOURCE_CHANGED/.test(code))fail('SOURCE_CHANGED',409,'Cambió la fuente de los antecedentes. Revisá su procedencia antes de continuar.');
  if(/HISTORY_NOT_FOUND/.test(code))fail('NOT_FOUND',404,'No se encontró una adopción verificada para este legajo.');
  fail();
 }
}
