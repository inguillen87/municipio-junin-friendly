import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {actionMutationSession,getActionCenterSql} from './internal-actions.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {schoolCertificateHttp} from './internal-family-certificates.js';
import {schoolCertificateSafeError} from '../lib/internal-family-certificates.js';
import {readRawPrivateJson} from '../lib/private-json-body.js';
import {employeeContext} from '../lib/internal-native-employees.js';
import {ownPeriodReadScopeKey,recoverOwnPeriodRead} from '../lib/own-period-read-recovery.js';
import {salaryExact} from '../assets/native-salary-catalog-model.js';
import {salaryConditionsCommand,SALARY_CONDITIONS_MAX_BYTES} from '../assets/own-contract-salary-conditions-model.js';
import {SALARY_CONDITIONS_READ,SALARY_CONDITIONS_CAPS,salaryConditionsFail,salaryConditionsError,salaryConditionsOperation} from '../lib/internal-own-contract-salary-conditions.js';
export const config={api:{bodyParser:false}};
export function createOwnContractSalaryConditionsHandler(deps={}){
 const env=deps.env??process.env,authorize=deps.requireAccess??requireCompatibleInternalAccess,getSql=deps.getSql??getActionCenterSql,sessionFor=deps.sessionFor??actionMutationSession;
 return async(req,res)=>{
  schoolCertificateHttp.headers(res);
  try{
   const method=req.method||'GET',q=req.query??{};let operation,input;
   if(!['GET','POST'].includes(method)){res.setHeader('Allow','GET, POST');salaryConditionsFail('METHOD_INVALID',405,'Método no admitido.');}
   if(!q||typeof q!=='object'||Array.isArray(q)||Object.values(q).some(v=>typeof v!=='string'))salaryConditionsFail('QUERY_INVALID',400,'Consulta inválida.');
   if(req.url){const entries=[...new URL(req.url,'http://local.invalid').searchParams];if(entries.length!==Object.keys(q).length||entries.some(([k,v])=>q[k]!==v)||new Set(entries.map(([k])=>k)).size!==entries.length)salaryConditionsFail('QUERY_INVALID',400,'Consulta ambigua.');}
   if(method==='POST'){
    if(Object.keys(q).length)salaryConditionsFail('QUERY_INVALID',400,'La operación no admite parámetros.');
    schoolCertificateHttp.assertOrigin(req,env);
    if(schoolCertificateHttp.header(req,'content-type').split(';')[0].trim().toLowerCase()!=='application/json')salaryConditionsFail('CONTENT_TYPE',415,'Se requiere un formulario JSON.');
    schoolCertificateHttp.checkLength(req,SALARY_CONDITIONS_MAX_BYTES);
   }else if(q.resource==='bootstrap'&&Object.keys(q).sort().join('|')==='period|resource'){operation='bootstrap';input={period:q.period};}
   else if(q.resource==='detail'&&Object.keys(q).sort().join('|')==='id|resource'){operation='detail';input={id:q.id};}
   else if(q.resource==='attempt'&&Object.keys(q).sort().join('|')==='key|resource'){operation='attempt';input={key:q.key};}
   else salaryConditionsFail('QUERY_INVALID',400,'Consulta inválida.');
   const accessOptions={env,requiredCapabilities:SALARY_CONDITIONS_READ,capabilityMode:'all',requireDataPlaneReady:true,requireCertifiedDataBinding:true,allowLegacy:false};
   let access=await authorize(req,res,accessOptions);if(!access)return;
   const assertAccess=a=>{if(a.mode!=='managed'||a.principal?.tenant?.source!=='membership'||!principalHasCapabilities(a.principal,SALARY_CONDITIONS_READ))salaryConditionsFail('FORBIDDEN',403,'La membresía no permite consultar condiciones salariales nominales.');};
   assertAccess(access);let session=sessionFor(access,env);employeeContext(access.principal,session);
   if(method==='POST'){
    const body=await readRawPrivateJson(req,{maxBytes:SALARY_CONDITIONS_MAX_BYTES,maxDepth:8,timeoutMs:10000,declaredLength:schoolCertificateHttp.header(req,'content-length'),fail:kind=>{
     if(kind==='large')salaryConditionsFail('LIMIT',413,'El conjunto completo supera el tamaño permitido.');
     if(kind==='unavailable')salaryConditionsFail('UNAVAILABLE',503,'No se pudo leer el envío completo. Consultá el mismo intento.');
     salaryConditionsFail('INPUT_INVALID',400,'El formulario contiene datos ambiguos o inválidos.');
    }});
    if(!salaryExact(body,['operation','payload'])||body.operation!=='command')salaryConditionsFail('INPUT_INVALID',400,'Operación o formulario no admitidos.');
    const command=salaryConditionsCommand(body.payload);
    if(!principalHasCapabilities(access.principal,SALARY_CONDITIONS_CAPS[command.command]))salaryConditionsFail('FORBIDDEN',403,'La membresía no permite esta operación.');
    operation='command';input={body:command,key:schoolCertificateHttp.header(req,'idempotency-key')};
   }
   const sql=await getSql(env),read=()=>salaryConditionsOperation(sql,access.principal,session,operation,input),scope=method==='GET'?ownPeriodReadScopeKey(access.principal,session):null;
   const data=method==='GET'?await recoverOwnPeriodRead({method,operation,busyCode:'SALARY_CONDITIONS_BUSY',read,reauthorize:async()=>{
    const next=await authorize(req,res,accessOptions);if(!next)return false;assertAccess(next);const nextSession=sessionFor(next,env);
    if(ownPeriodReadScopeKey(next.principal,nextSession)!==scope)salaryConditionsFail('SCOPE_CHANGED',409,'Cambió la cuenta, la sesión o el ámbito municipal. Volvé a abrir la consulta.');
    access=next;session=nextSession;return true;
   }}):await read();
   if(data===null)return;if(data.replayed)res.setHeader('Idempotency-Replayed','true');
   return res.status(method==='POST'&&!data.replayed?201:200).json({ok:true,data});
  }catch(e){const safe=String(e?.code??'').startsWith('SCHOOL_CERTIFICATE_')?schoolCertificateSafeError(e):salaryConditionsError(e);return res.status(safe.status).json({ok:false,code:safe.code,error:safe.message});}
 };
}
export default createOwnContractSalaryConditionsHandler();
