import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {actionMutationSession,getActionCenterSql} from './internal-actions.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {schoolCertificateHttp} from './internal-family-certificates.js';
import {schoolCertificateSafeError} from '../lib/internal-family-certificates.js';
import {readRawPrivateJson} from '../lib/private-json-body.js';
import {employeeContext} from '../lib/internal-native-employees.js';
import {salaryExact} from '../assets/native-salary-catalog-model.js';
import {OWN_RECEIPT_READ,OWN_RECEIPT_PREPARE,OWN_RECEIPT_APPROVE,OWN_RECEIPT_SELF,ownReceiptParams,ownReceiptCommand} from '../assets/own-payroll-receipt-model.js';
import {receiptFail,receiptError,ownReceiptOperation} from '../lib/internal-own-payroll-receipts.js';
export const config={api:{bodyParser:false}};
export function createOwnReceiptHandler(deps={}){
 const env=deps.env??process.env,authorize=deps.requireAccess??requireCompatibleInternalAccess,getSql=deps.getSql??getActionCenterSql,sessionFor=deps.sessionFor??actionMutationSession;
 return async(req,res)=>{schoolCertificateHttp.headers(res);try{
  const method=req.method||'GET',q=req.query??{};let operation,input={};
  if(!['GET','POST'].includes(method)){res.setHeader('Allow','GET, POST');receiptFail('METHOD_INVALID',405,'Método no admitido.');}
  if(!q||typeof q!=='object'||Array.isArray(q)||Object.values(q).some(v=>typeof v!=='string'))receiptFail('QUERY_INVALID',400,'Consulta inválida.');
  if(req.url){const entries=[...new URL(req.url,'http://local.invalid').searchParams];if(entries.length!==Object.keys(q).length||entries.some(([k,v])=>q[k]!==v)||new Set(entries.map(([k])=>k)).size!==entries.length)receiptFail('QUERY_INVALID',400,'Consulta ambigua.');}
  if(method==='POST'){if(Object.keys(q).length)receiptFail('QUERY_INVALID',400,'El formulario no admite parámetros.');schoolCertificateHttp.assertOrigin(req,env);if(schoolCertificateHttp.header(req,'content-type').split(';')[0].trim().toLowerCase()!=='application/json')receiptFail('CONTENT_TYPE',415,'Se requiere un formulario JSON.');schoolCertificateHttp.checkLength(req,16384);}
  else if(q.resource==='self'&&Object.keys(q).join('|')==='resource')operation='self';
  else if(q.resource==='list'&&Object.keys(q).sort().join('|')==='period|resource'){operation='list';input={period:q.period};}
  else if(q.resource==='batch'&&Object.keys(q).sort().join('|')==='id|resource'){operation='batch';input={id:q.id};}
  else if(q.resource==='attempt'&&Object.keys(q).sort().join('|')==='key|resource'){operation='attempt';input={key:q.key};}
  else if(method==='GET')receiptFail('QUERY_INVALID',400,'Consulta inválida.');
  const required=operation==='self'?OWN_RECEIPT_SELF:OWN_RECEIPT_READ;
  const access=await authorize(req,res,{env,requiredCapabilities:required,capabilityMode:'all',requireDataPlaneReady:true,requireCertifiedDataBinding:true,allowLegacy:false});if(!access)return;
  if(access.mode!=='managed'||access.principal?.tenant?.source!=='membership'||!principalHasCapabilities(access.principal,required))receiptFail('FORBIDDEN',403,'La membresía no permite esta operación.');const session=sessionFor(access,env);employeeContext(access.principal,session);
  if(method==='POST'){
   const body=await readRawPrivateJson(req,{maxBytes:16384,timeoutMs:10000,declaredLength:schoolCertificateHttp.header(req,'content-length'),fail:kind=>receiptFail(kind==='large'?'LIMIT':kind==='unavailable'?'UNAVAILABLE':'INPUT_INVALID',kind==='large'?413:kind==='unavailable'?503:400,'No se verificó el formulario completo. Consultá el mismo intento.')});
   if(salaryExact(body,['operation','params'])&&body.operation==='preview'){operation='preview';try{input={params:ownReceiptParams(body.params)};}catch{receiptFail('INPUT_INVALID',422,'Revisá alcance y datos declarados.');}}
   else if(salaryExact(body,['operation','payload'])&&body.operation==='command'){operation='command';let payload;try{payload=ownReceiptCommand(body.payload);}catch{receiptFail('INPUT_INVALID',422,'Revisá la operación y su motivo.');}const caps=payload.command==='prepare'?OWN_RECEIPT_PREPARE:OWN_RECEIPT_APPROVE;if(!principalHasCapabilities(access.principal,caps))receiptFail('FORBIDDEN',403,'La cuenta no permite preparar o revisar esta emisión.');input={body:payload,key:schoolCertificateHttp.header(req,'idempotency-key')};}
   else receiptFail('INPUT_INVALID',400,'Formulario no admitido.');
  }
  const data=await ownReceiptOperation(await getSql(env),access.principal,session,operation,input);if(data.replayed)res.setHeader('Idempotency-Replayed','true');return res.status(operation==='command'&&!data.replayed?201:200).json({ok:true,data});
 }catch(error){const safe=String(error?.code??'').startsWith('SCHOOL_CERTIFICATE_')?schoolCertificateSafeError(error):receiptError(error);return res.status(safe.status).json({ok:false,code:safe.code,error:safe.message});}};
}
export default createOwnReceiptHandler();
