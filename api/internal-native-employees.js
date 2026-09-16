import { requireCompatibleInternalAccess } from '../lib/internal-access-gateway.js';
import { actionMutationSession, getActionCenterSql } from './internal-actions.js';
import { principalHasCapabilities } from '../lib/internal-resource-access.js';
import { schoolCertificateHttp } from './internal-family-certificates.js';
import { schoolCertificateSafeError } from '../lib/internal-family-certificates.js';
import { employeeOperation, NativeEmployeeError, nativeEmployeeError } from '../lib/internal-native-employees.js';
export const config={api:{bodyParser:false}};
const fail=(code,status,message)=>{throw new NativeEmployeeError(code,status,message);};
export function createNativeEmployeeHandler(deps={}){
 const env=deps.env??process.env,authorize=deps.requireAccess??requireCompatibleInternalAccess,getSql=deps.getSql??getActionCenterSql,sessionFor=deps.sessionFor??actionMutationSession;
 return async(req,res)=>{
  schoolCertificateHttp.headers(res);
  try{
   const method=req.method||'GET';if(!['GET','POST'].includes(method)){res.setHeader('Allow','GET, POST');fail('METHOD_INVALID',405,'Método no admitido.');}
   const q=req.query||{};if(Object.values(q).some(v=>typeof v!=='string'))fail('QUERY_INVALID',400,'Consulta inválida.');
   if(req.url){const entries=[...new URL(req.url,'http://local.invalid').searchParams];if(entries.length!==Object.keys(q).length||entries.some(([k,v])=>q[k]!==v)||new Set(entries.map(([k])=>k)).size!==entries.length)fail('QUERY_INVALID',400,'Consulta ambigua.');}
   let operation;
   if(method==='POST'){
    if(Object.keys(q).length)fail('QUERY_INVALID',400,'No se admiten parámetros en el alta.');
    schoolCertificateHttp.assertOrigin(req,env);if(schoolCertificateHttp.header(req,'content-type').split(';')[0].trim().toLowerCase()!=='application/json')fail('CONTENT_TYPE',415,'Se requiere un formulario JSON.');
    schoolCertificateHttp.checkLength(req,8192);operation='create';
   }else if(q.resource==='bootstrap'&&Object.keys(q).length===1)operation='bootstrap';
   else if(q.resource==='attempt'&&Object.keys(q).sort().join('|')==='key|resource')operation='attempt';
   else fail('QUERY_INVALID',400,'Consulta inválida.');
   const caps=['workforce.employee.read',...(operation==='bootstrap'?[]:['employee.record.create'])];
   const access=await authorize(req,res,{env,requiredCapabilities:caps,capabilityMode:'all',requireDataPlaneReady:true,requireCertifiedDataBinding:true,allowLegacy:false});
   if(!access)return;
   if(access.mode!=='managed'||access.principal?.tenant?.source!=='membership'||!principalHasCapabilities(access.principal,caps))fail('FORBIDDEN',403,'La membresía no permite esta operación.');
   const session=sessionFor(access,env);
   const input=operation==='create'?{key:schoolCertificateHttp.header(req,'idempotency-key'),body:await schoolCertificateHttp.readBody(req,8192)}:operation==='attempt'?{key:q.key}:{};
   const data=await employeeOperation(await getSql(env),access.principal,session,operation,input);
   if(data.replayed)res.setHeader('Idempotency-Replayed','true');
   return res.status(operation==='create'&&!data.replayed?201:200).json({ok:true,data});
  }catch(error){
   const safe=String(error?.code||'').startsWith('SCHOOL_CERTIFICATE_')?schoolCertificateSafeError(error):nativeEmployeeError(error);
   return res.status(safe.status).json({ok:false,code:safe.code,error:safe.message});
  }
 };
}
export default createNativeEmployeeHandler();
