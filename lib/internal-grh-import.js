// Original Formato Junin intake through existing authorized readers and novelty facades.
// No new database functions, grants, payroll calculation or GRH mutations.
import {createHash} from 'node:crypto';
import {readGrhTxt} from '../assets/payroll-grh-input.js';
import {normalizePayrollNoveltyDraft,normalizePayrollNoveltyIdempotencyKey,PayrollNoveltyError} from './internal-payroll-novelty.js';
import {effectiveSourceSnapshot,assertEffectiveSourceSnapshot} from './workforce-operational-scope.js';
import {principalHasCapabilities} from './internal-resource-access.js';
const REQUIRED=['payroll.novelty.read','payroll.novelty.prepare','payroll.novelty.nominal.read','workforce.employee.read'];
const hash=v=>createHash('sha256').update(v).digest('hex');
const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const fail=(code,message,status=422)=>{throw new PayrollNoveltyError(code,status,message);};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export function grhImportContext(principal,session){
 if(!principalHasCapabilities(principal,REQUIRED))fail('PAYROLL_NOVELTY_NOMINAL_READ_REQUIRED','La importación exige preparación y lectura nominal autorizadas.',403);
 const c={actorEmail:principal?.user?.email,actorSessionId:session?.id,actorSessionVersion:session?.version,membershipId:principal?.tenant?.membershipId,releaseSha:session?.releaseSha,tenantId:principal?.tenant?.id};
 if(principal?.tenant?.source!=='membership'||typeof c.actorEmail!=='string'||c.actorEmail!==session?.email||![c.actorSessionId,c.membershipId,c.tenantId].every(v=>typeof v==='string'&&UUID.test(v))||!Number.isInteger(c.actorSessionVersion)||c.actorSessionVersion<1||!/^[a-f0-9]{40}$/.test(c.releaseSha??''))fail('PAYROLL_NOVELTY_SESSION_INVALID','La sesión operativa ya no es válida.',401);
 return c;
}
export function grhImportInput(v){
 if(!exact(v,['profileId','concept','periodMonth','payrollType','contentBase64','choices','previewToken'])||v.profileId!=='junin55'||v.payrollType!=='monthly'||!/^20(?:0[8-9]|[1-9]\d)-(?:0[1-9]|1[0-2])-01$/.test(v.periodMonth??'')||!Array.isArray(v.choices)||v.choices.length>2000||v.previewToken!==null&&!/^[a-f0-9]{64}$/.test(v.previewToken))fail('PAYROLL_NOVELTY_PREPARE_INVALID','Revisá formato, concepto, período y archivo.');
 if(typeof v.contentBase64!=='string'||v.contentBase64.length>200000||!v.contentBase64.length||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v.contentBase64))fail('PAYROLL_NOVELTY_PREPARE_INVALID','Archivo de origen no válido.');
 if(typeof v.periodMonth!=='string'||typeof v.concept!=='string'||!/^[1-9]\d{0,19}$/.test(v.concept)||v.previewToken!==null&&typeof v.previewToken!=='string')fail('PAYROLL_NOVELTY_PREPARE_INVALID','Concepto o período inválido.');
 const bytes=Buffer.from(v.contentBase64,'base64');if(bytes.toString('base64')!==v.contentBase64)fail('PAYROLL_NOVELTY_PREPARE_INVALID','Archivo de origen no válido.');
 const parsed=readGrhTxt(bytes,{profileId:v.profileId,concept:v.concept,impliedScale:null,groupByDni:false});
 const lines=new Set();for(const c of v.choices){if(!exact(c,['rowOrdinal','contractId'])||!Number.isInteger(c.rowOrdinal)||c.rowOrdinal<1||c.rowOrdinal>parsed.rows.length||typeof c.contractId!=='string'||!UUID.test(c.contractId)||lines.has(c.rowOrdinal))fail('PAYROLL_NOVELTY_PREPARE_INVALID','La selección de vínculos es inválida.');lines.add(c.rowOrdinal);}
 return {parsed,sourceSha256:hash(bytes),choices:new Map(v.choices.map(c=>[c.rowOrdinal,c.contractId])),options:v};
}
async function authoritativeScope(runtime,readSql,context){
 const b=(await runtime.query('SELECT payroll_novelty_bootstrap_v1($1::jsonb) AS result',[JSON.stringify(context)]))[0]?.result;
 const p=b?.principal;if(!p||p.tenantId!==context.tenantId||p.membershipId!==context.membershipId||!['payroll.novelty.read','payroll.novelty.prepare','payroll.novelty.nominal.read'].every(c=>p.capabilities?.includes(c)))fail('PAYROLL_NOVELTY_CAPABILITY_REQUIRED','La sesión no habilita esta importación.',403);
 if(p.employmentLinked!==true)fail('PAYROLL_NOVELTY_EMPLOYMENT_REQUIRED','La preparación exige un vínculo operativo vigente.',403);
 if(!UUID.test(p.certifiedBindingId??''))fail('PAYROLL_NOVELTY_BINDING_REQUIRED','Fuente certificada no disponible.',503);
 const rows=await readSql.query(`SELECT source_database AS database,source_company_id::text AS company FROM platform_tenant_source_binding WHERE tenant_id=$1::uuid AND id=$2::uuid AND verified IS TRUE AND source_system='GRH'`,[context.tenantId,p.certifiedBindingId]);
 if(rows.length!==1||!/^[a-zA-Z0-9_-]{1,120}$/.test(rows[0].database)||!/^\d+$/.test(rows[0].company)||!Number.isSafeInteger(Number(rows[0].company)))fail('PAYROLL_NOVELTY_BINDING_REQUIRED','Fuente certificada no disponible.',503);
 return {...context,certifiedBindingId:p.certifiedBindingId,database:rows[0].database,companyId:Number(rows[0].company)};
}
export const GRH_IMPORT_CANDIDATES_SQL=`/* grh-import:read-only-candidates */
SELECT c.id::text AS "contractId",c.legacy_legajo AS legajo,CASE WHEN p.dni ~ '^[0-9]{5,8}$' THEN p.dni::bigint::text END AS dni,p.id::text AS "personId",p.full_name AS name,
 to_char(c.start_date,'YYYY-MM-DD') AS "startDate",to_char(c.end_date,'YYYY-MM-DD') AS "endDate",to_char(b.source_cutoff AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cutoff,
 encode(digest(convert_to(jsonb_build_object('contractId',c.id,'personId',p.id,'legajo',c.legacy_legajo,'sourceDatabase',$3::text,'companyId',$1::bigint)::text,'UTF8'),'sha256'),'hex') AS "expectedIdentityToken"
FROM employment_contract c JOIN person_identity p ON p.id=c.person_id
JOIN grh_effective_source_batch_v1 b ON b.id=c.source_batch_id AND b.source_system='GRH'
WHERE c.source_system='GRH' AND c.status='active' AND c.legacy_company_id=$1::bigint
 AND (c.tenant_id IS NULL OR c.tenant_id=$2::uuid) AND b.source_database=$3
 AND b.validation_state='published' AND b.legacy_import_run_id IS NOT NULL
 AND (CASE WHEN p.dni ~ '^[0-9]{5,8}$' THEN p.dni::bigint::text END)=ANY($4::text[])
 AND c.start_date IS NOT NULL AND c.start_date<($5::date+interval '1 month')
 AND (c.end_date IS NULL OR c.end_date>=$5::date)
ORDER BY dni,c.legacy_legajo,c.id LIMIT 20001`;
export async function reviewGrhImport(readSql,runtime,principal,session,payload){
 payload=structuredClone(payload);
 const context=grhImportContext(principal,session),input=grhImportInput(payload),scope=await authoritativeScope(runtime,readSql,context);
 const binding={tenantId:scope.tenantId,database:scope.database,companyId:scope.companyId},sourceToken=await effectiveSourceSnapshot(readSql,binding);
 const records=await readSql.query(GRH_IMPORT_CANDIDATES_SQL,[scope.companyId,scope.tenantId,scope.database,input.parsed.rows.map(r=>r.dni),payload.periodMonth]);
 if(records.length>20000)fail('PAYROLL_NOVELTY_PREPARE_INVALID','Demasiados vínculos; revisá el padrón antes de importar.');
 const byDni=new Map();for(const c of records){if(!UUID.test(c.contractId??'')||!UUID.test(c.personId??'')||!/^\d{1,20}$/.test(c.legajo??'')||typeof c.name!=='string'||c.name.length>300||/[\x00-\x1f\x7f]/.test(c.name)||!input.parsed.rows.some(r=>r.dni===c.dni))fail('PAYROLL_NOVELTY_CONTRACT_DRIFT','Respuesta de identidad no verificable.',503);const list=byDni.get(c.dni)||[];list.push(c);byDni.set(c.dni,list);}
 const selected=[];const rows=input.parsed.rows.map((r,index)=>{
  const candidates=byDni.get(r.dni)||[],choice=input.choices.get(index+1);if(choice&&!candidates.some(c=>c.contractId===choice))fail('PAYROLL_NOVELTY_IDENTITY_CHANGED','Un vínculo elegido ya no corresponde al archivo.',409);
  const identityConflict=new Set(candidates.map(c=>c.personId)).size>1;
  if(identityConflict&&choice)fail('PAYROLL_NOVELTY_IDENTITY_CHANGED','El DNI presenta personas diferentes en el padrón. Corregí la identidad antes de elegir un vínculo.',409);
  const chosen=identityConflict?null:choice?candidates.find(c=>c.contractId===choice):candidates.length===1?candidates[0]:null;
  if(chosen)selected.push({rowOrdinal:index+1,...chosen});
  return {rowOrdinal:index+1,sourceLines:r.sourceLines,dni:r.dni,conceptSourceId:payload.concept,quantityDecimal:r.quantityDecimal,amountCents:r.amountCents,
   status:identityConflict?'identity_review':chosen?'resolved':candidates.length?'choose_contract':'not_found',contractId:chosen?.contractId??null,
   candidates:candidates.map(c=>({contractId:c.contractId,legajo:c.legajo,name:c.name,startDate:c.startDate,endDate:c.endDate}))};
 });
 const identities=selected.length?await runtime.query(`SELECT ord::integer AS ordinal,payroll_novelty_employee_v2($1::jsonb,(item->>'contractId')::uuid) AS value FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY x(item,ord) ORDER BY ord`,[JSON.stringify(context),JSON.stringify(selected)]):[];
 if(identities.length!==selected.length)fail('PAYROLL_NOVELTY_CONTRACT_DRIFT','Identidades incompletas.',503);
 for(let i=0;i<selected.length;i++){const s=verifyMonthlyEmployee(identities[i].value,selected[i].contractId);if(s.origin||s.legajo!==selected[i].legajo||s.employeeName!==selected[i].name||s.identityToken!==selected[i].expectedIdentityToken||identities[i].ordinal!==i+1||Date.parse(s.sourceCutoff)!==Date.parse(selected[i].cutoff))fail('PAYROLL_NOVELTY_IDENTITY_CHANGED','Cambió un vínculo durante la lectura.',409);selected[i].subject=s;}
 await assertEffectiveSourceSnapshot(readSql,binding,sourceToken);
 const duplicateTargets=new Set(),seen=new Set();for(const s of selected){if(seen.has(s.legajo))duplicateTargets.add(s.legajo);seen.add(s.legajo);}
 for(const row of rows)if(row.contractId&&duplicateTargets.has(selected.find(s=>s.contractId===row.contractId)?.legajo))row.status='duplicate_target';
 const resolved=rows.filter(r=>r.status==='resolved').length,ready=resolved===rows.length&&rows.length<=500;
 const token=hash(canonical({sourceToken,sourceSha256:input.sourceSha256,profileId:payload.profileId,concept:payload.concept,periodMonth:payload.periodMonth,payrollType:payload.payrollType,rows,subjects:selected.map(s=>s.subject),tenantId:scope.tenantId,membershipId:scope.membershipId}));
 const data={version:'grh-import-preview.v1',profileId:payload.profileId,concept:payload.concept,periodMonth:payload.periodMonth,payrollType:payload.payrollType,sourceSha256:input.sourceSha256,previewToken:token,inputRows:input.parsed.inputRows,outputRows:rows.length,resolvedRows:resolved,readyToPrepare:ready,writerLimit:500,rows,
  totalAmountCents:rows.reduce((sum,r)=>sum+BigInt(r.amountCents??'0'),0n).toString(),persistencePerformed:false,payrollCalculated:false,payrollPosted:false};
 return {data,context,scope,input,selected};
}
import {verifyMonthlyEmployee} from '../assets/payroll-native-monthly-model.js';
import {preparePayrollNovelty} from './internal-payroll-novelty.js';
import {LEGACY_PREPARE_CALL,GRH_GUARDED_PREPARE_SQL} from './grh-import-prepare-sql.js';
export async function previewGrhImport(readSql,runtime,principal,session,payload){return {data:(await reviewGrhImport(readSql,runtime,principal,session,payload)).data};}
export async function prepareGrhImport(readSql,runtime,principal,session,payload,idempotencyKey){
 payload=structuredClone(payload);
 const key=normalizePayrollNoveltyIdempotencyKey(idempotencyKey),checked=await reviewGrhImport(readSql,runtime,principal,session,payload);
 if(!checked.data.readyToPrepare)fail('PAYROLL_NOVELTY_VALIDATION_REQUIRED','Revisá los vínculos pendientes. No se guarda una parte del archivo.');
 if(!payload.previewToken||payload.previewToken!==checked.data.previewToken)fail('PAYROLL_NOVELTY_IDENTITY_CHANGED','Cambió el archivo, la selección o la fuente. Revisá la vista previa nuevamente.',409);
 const semanticHash=hash(canonical(checked.input.parsed.rows.map(r=>({dni:r.dni,amountCents:r.amountCents,quantityDecimal:r.quantityDecimal})).sort((a,b)=>a.dni.localeCompare(b.dni))));
 const draft=normalizePayrollNoveltyDraft({sourceMode:'bulk',periodMonth:payload.periodMonth,payrollType:payload.payrollType,
  rows:checked.data.rows.map((r,i)=>({rowOrdinal:i+1,legajo:checked.selected[i].legajo,conceptSourceId:r.conceptSourceId,costCenterSourceId:null,adjustmentMonth:null,quantityDecimal:r.quantityDecimal,amountCents:r.amountCents,movementType:null,legalInstrument:null,observation:'Importación Formato Junín; contenido lógico SHA256 '+semanticHash+'.',forced:false}))});
 const subjects=checked.selected.map(s=>s.subject);
 const guarded={query:async(statement,values)=>{
  if(statement!==LEGACY_PREPARE_CALL||values.length!==7)throw Error('Unexpected legacy preparation call');
  try{
   const rows=await runtime.query(GRH_GUARDED_PREPARE_SQL,[...values,JSON.stringify(subjects)]);
   if(rows.length!==1||rows[0]?.result?.verified!==1||!rows[0].result.receipt)fail('PAYROLL_NOVELTY_CONTRACT_DRIFT','No se pudo verificar el recibo de importación.',503);
   return [{result:rows[0].result.receipt}];
  }catch(error){if(error.code==='22012')fail('PAYROLL_NOVELTY_IDENTITY_CHANGED','Cambió una identidad durante el guardado. La operación completa fue revertida.',409);throw error;}
 }};
 const receipt=await preparePayrollNovelty(guarded,principal,session,{sourceMode:draft.sourceMode,periodMonth:draft.periodMonth,payrollType:draft.payrollType,rows:draft.rows},key);
 return {replayed:receipt.replayed===true,data:{version:'grh-import-receipt.v1',sourceSha256:checked.input.sourceSha256,semanticSha256:semanticHash,profileId:payload.profileId,concept:payload.concept,periodMonth:payload.periodMonth,payrollType:payload.payrollType,inputRows:checked.data.inputRows,savedRows:receipt.data.rowCount,omittedRows:0,batch:receipt.data,payrollCalculated:false,payrollPosted:false}};
}
