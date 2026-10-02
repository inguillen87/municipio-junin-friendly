import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {actionMutationSession,getActionCenterSql} from './internal-actions.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {schoolCertificateHttp} from './internal-family-certificates.js';
import {schoolCertificateSafeError} from '../lib/internal-family-certificates.js';
import {readPrivateJsonBody} from './internal-employment-catalog.js';
import {employeeContext} from '../lib/internal-native-employees.js';
import {salaryExact,salaryCommand} from '../assets/native-salary-catalog-model.js';
import {SALARY_READ,SALARY_CAPS,SALARY_MAX_BYTES,salaryFail,salaryError,salaryOperation} from '../lib/internal-native-salary.js';
export const config={api:{bodyParser:false}};
export function createNativeSalaryHandler(deps={}){
 const env=deps.env??process.env,authorize=deps.requireAccess??requireCompatibleInternalAccess,getSql=deps.getSql??getActionCenterSql,sessionFor=deps.sessionFor??actionMutationSession;
 return async(req,res)=>{
  schoolCertificateHttp.headers(res);
  try{const method=req.method||'GET',q=req.query??{};let operation,input;
   if(!['GET','POST'].includes(method)){res.setHeader('Allow','GET, POST');salaryFail('METHOD_INVALID',405,'Método no admitido.');}
   if(!q||typeof q!=='object'||Array.isArray(q)||Object.values(q).some(v=>typeof v!=='string'))salaryFail('QUERY_INVALID',400,'Consulta inválida.');
   if(req.url){const entries=[...new URL(req.url,'http://local.invalid').searchParams];if(entries.length!==Object.keys(q).length||entries.some(([k,v])=>q[k]!==v)||new Set(entries.map(([k])=>k)).size!==entries.length)salaryFail('QUERY_INVALID',400,'Consulta ambigua.');}
   if(method==='POST'){if(Object.keys(q).length)salaryFail('QUERY_INVALID',400,'La operación no admite parámetros.');schoolCertificateHttp.assertOrigin(req,env);if(schoolCertificateHttp.header(req,'content-type').split(';')[0].trim().toLowerCase()!=='application/json')salaryFail('CONTENT_TYPE',415,'Se requiere un formulario JSON.');schoolCertificateHttp.checkLength(req,SALARY_MAX_BYTES);}
   else if(q.resource==='bootstrap'&&Object.keys(q).join('|')==='resource'){operation='bootstrap';input={};}
   else if(q.resource==='attempt'&&Object.keys(q).sort().join('|')==='key|resource'){operation='attempt';input={key:q.key};}else salaryFail('QUERY_INVALID',400,'Consulta inválida.');
   const access=await authorize(req,res,{env,requiredCapabilities:SALARY_READ,capabilityMode:'all',requireDataPlaneReady:true,requireCertifiedDataBinding:true,allowLegacy:false});if(!access)return;
   if(access.mode!=='managed'||access.principal?.tenant?.source!=='membership'||!principalHasCapabilities(access.principal,SALARY_READ))salaryFail('FORBIDDEN',403,'La membresía no permite consultar el maestro salarial.');
   const session=sessionFor(access,env);employeeContext(access.principal,session);
   if(method==='POST'){const body=await readPrivateJsonBody(req,{maxBytes:SALARY_MAX_BYTES});if(!salaryExact(body,['operation','payload'])||body.operation!=='command')salaryFail('INPUT_INVALID',400,'Operación o formulario no admitidos.');const command=salaryCommand(body.payload);if(!principalHasCapabilities(access.principal,SALARY_CAPS[command.command]))salaryFail('FORBIDDEN',403,'La membresía no permite esta operación.');operation='command';input={body:command,key:schoolCertificateHttp.header(req,'idempotency-key')};}
   const data=await salaryOperation(await getSql(env),access.principal,session,operation,input);if(data.replayed)res.setHeader('Idempotency-Replayed','true');return res.status(method==='POST'&&!data.replayed?201:200).json({ok:true,data});
  }catch(e){const safe=String(e?.code??'').startsWith('SCHOOL_CERTIFICATE_')?schoolCertificateSafeError(e):salaryError(e);return res.status(safe.status).json({ok:false,code:safe.code,error:safe.message});}
 };
}
export default createNativeSalaryHandler();
