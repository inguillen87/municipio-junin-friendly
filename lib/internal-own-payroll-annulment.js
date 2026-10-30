import {OWN_RUN_FULL_MAX_BYTES} from '../assets/own-payroll-response.js';
import {employeeContext} from './internal-native-employees.js';
import {ownRunHash,verifyOwnRunReceipt} from './internal-own-payroll-run.js';
import {liquidationFail,liquidationError} from './internal-own-payroll-liquidation.js';
import {salaryKey} from '../assets/native-salary-catalog-model.js';
import {OWN_RUN_MAX_RESPONSE} from '../assets/own-payroll-run-model.js';
import {ownAnnulCommand,ownAnnulDetail,ownAnnulReceipt} from '../assets/own-payroll-annulment-model.js';
import {verifiedOwnAnnulReviewIndex,ownAnnulReviewCommand,ownAnnulReviewReceipt} from '../assets/own-payroll-annulment-review-model.js';
export async function ownAnnulOperation(sql,principal,session,operation,input={},deps={}){
 try{
  const fullJson=deps.fullJson===true,limit=fullJson?OWN_RUN_FULL_MAX_BYTES:OWN_RUN_MAX_RESPONSE;
  const ctx=JSON.stringify(employeeContext(principal,session)),query=async(q,values)=>{const rows=await sql.query(q,values);return(Array.isArray(rows)?rows:rows?.rows)?.[0]?.result;};let data;
  if(operation==='review'){
   data=await verifiedOwnAnnulReviewIndex(await query(fullJson?'SELECT public.own_annul_review_full_v2($1::jsonb,$2::text,$3::text) AS result':'SELECT public.own_annul_review_v2($1::jsonb,$2::text,$3::text) AS result',[ctx,input.period,input.liquidationType]));
   if(data.period!==input.period||data.liquidationType!==input.liquidationType)liquidationFail('CONTRACT_INVALID',503,'La revisión corresponde a otro período o tipo.');
  }else if(operation==='detail'){
   data=ownAnnulDetail(await query(fullJson?'SELECT public.own_annul_detail_full_v1($1::jsonb,$2::text,$3::text) AS result':'SELECT public.own_annul_detail_v1($1::jsonb,$2::text,$3::text) AS result',[ctx,input.period,input.liquidationType]));
   if(data.period!==input.period||data.liquidationType!==input.liquidationType)liquidationFail('CONTRACT_INVALID',503,'La revisión corresponde a otro período o tipo.');
   for(const r of data.runs)verifyOwnRunReceipt(r.capture,{fullJson});
  }else{
   if(!salaryKey(input.key))liquidationFail('INPUT_INVALID',428,'Se requiere una referencia de intento.');let attempt=null;
   if(operation==='attempt')data=await query(fullJson?'SELECT public.own_annul_attempt_full_v1($1::jsonb,$2::uuid) AS result':'SELECT public.own_annul_attempt_v1($1::jsonb,$2::uuid) AS result',[ctx,input.key]);
   else if(operation==='command'||operation==='command-v2'){let body;try{body=operation==='command-v2'?ownAnnulReviewCommand(input.body):ownAnnulCommand(input.body);}catch{liquidationFail('INPUT_INVALID',422,'Revisá período, tipo, alcance, motivo y revisión.');}attempt={key:input.key,body};const statement=operation==='command-v2'?(fullJson?'SELECT public.own_annul_command_full_v2($1::jsonb,$2::jsonb,$3::uuid) AS result':'SELECT public.own_annul_command_v2($1::jsonb,$2::jsonb,$3::uuid) AS result'):(fullJson?'SELECT public.own_annul_command_full_v1($1::jsonb,$2::jsonb,$3::uuid) AS result':'SELECT public.own_annul_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result');data=await query(statement,[ctx,JSON.stringify(body),input.key]);}
   else liquidationFail('INPUT_INVALID',400,'Operación no admitida.');
   // The server validates structure/content; the browser also binds every pair
   // to the full review frozen before transmission.
   if(operation==='command-v2'&&data?.version!=='own-annul-receipt.v2')liquidationFail('CONTRACT_INVALID',503,'El comprobante no corresponde al protocolo de revisión enviado.');
   if(data?.version==='own-annul-receipt.v2')ownAnnulReviewReceipt(data);else ownAnnulReceipt(data);if(data.key!==input.key||data.bodySha256!==ownRunHash(data.body)||attempt&&ownRunHash(data.body)!==ownRunHash(attempt.body)||data.receipts.some(r=>r.bodySha256!==ownRunHash(r.body)))liquidationFail('CONTRACT_INVALID',503,'No se verificó el comprobante completo. Consultá el intento original.');
  }
  if(Buffer.byteLength(JSON.stringify({ok:true,data}))>limit)liquidationFail('LIMIT',422,'El alcance completo supera la capacidad. No se recortaron filas.');return data;
 }catch(e){throw liquidationError(e);}
}
