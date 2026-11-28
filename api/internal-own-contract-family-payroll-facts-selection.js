import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {actionMutationSession,getActionCenterSql} from './internal-actions.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {schoolCertificateHttp} from './internal-family-certificates.js';
import {schoolCertificateSafeError} from '../lib/internal-family-certificates.js';
import {readRawPrivateJson} from '../lib/private-json-body.js';
import {employeeContext} from '../lib/internal-native-employees.js';
import {ownPeriodReadScopeKey,recoverOwnPeriodRead} from '../lib/own-period-read-recovery.js';
import {salaryExact} from '../assets/native-salary-catalog-model.js';
import {FAMILY_PAYROLL_FACTS_MAX_BYTES} from '../assets/own-contract-family-payroll-facts-model.js';
import {familySelectedQuery,familySelectedCommand} from '../assets/own-contract-family-payroll-facts-selection.js';
import {FAMILY_PAYROLL_FACTS_READ,FAMILY_PAYROLL_FACTS_CAPS,familyPayrollFactsFail,familyPayrollFactsError} from '../lib/internal-own-contract-family-payroll-facts.js';
import {familySelectedOperation} from '../lib/internal-own-contract-family-payroll-facts-selection.js';
export const config={api:{bodyParser:false}};

export function createOwnContractFamilySelectedHandler(deps={}){
 const env=deps.env??process.env,authorize=deps.requireAccess??requireCompatibleInternalAccess,getSql=deps.getSql??getActionCenterSql,sessionFor=deps.sessionFor??actionMutationSession;
 return async(req,res)=>{
  schoolCertificateHttp.headers(res);
  try{
   const method=req.method||'GET',q=req.query??{};let operation,input;
   if(!['GET','POST'].includes(method)){res.setHeader('Allow','GET, POST');familyPayrollFactsFail('METHOD_INVALID',405,'Método no admitido.');}
   if(!q||typeof q!=='object'||Array.isArray(q)||Object.values(q).some(v=>typeof v!=='string'))familyPayrollFactsFail('QUERY_INVALID',400,'Consulta inválida.');
   if(req.url){const entries=[...new URL(req.url,'http://local.invalid').searchParams];if(entries.length!==Object.keys(q).length||entries.some(([k,v])=>q[k]!==v)||new Set(entries.map(([k])=>k)).size!==entries.length)familyPayrollFactsFail('QUERY_INVALID',400,'Consulta ambigua.');}
   if(method==='POST'){
    if(Object.keys(q).length)familyPayrollFactsFail('QUERY_INVALID',400,'La operación no admite parámetros.');
    schoolCertificateHttp.assertOrigin(req,env);
    if(schoolCertificateHttp.header(req,'content-type').split(';')[0].trim().toLowerCase()!=='application/json')familyPayrollFactsFail('CONTENT_TYPE',415,'Se requiere un formulario JSON.');
    schoolCertificateHttp.checkLength(req,FAMILY_PAYROLL_FACTS_MAX_BYTES);
   }else if(q.resource==='history'&&Object.keys(q).sort().join('|')==='period|resource'){operation='history';input={period:q.period};}
   else if(q.resource==='detail'&&Object.keys(q).sort().join('|')==='id|resource'){operation='detail';input={id:q.id};}
   else if(q.resource==='attempt'&&Object.keys(q).sort().join('|')==='key|resource'){operation='attempt';input={key:q.key};}
   else familyPayrollFactsFail('QUERY_INVALID',400,'Consulta inválida.');
   const accessOptions={env,requiredCapabilities:FAMILY_PAYROLL_FACTS_READ,capabilityMode:'all',requireDataPlaneReady:true,requireCertifiedDataBinding:true,allowLegacy:false};
   let access=await authorize(req,res,accessOptions);if(!access)return;
   const assertAccess=a=>{if(a.mode!=='managed'||a.principal?.tenant?.source!=='membership'||!principalHasCapabilities(a.principal,FAMILY_PAYROLL_FACTS_READ))familyPayrollFactsFail('FORBIDDEN',403,'La membresía no permite consultar datos familiares de liquidación nominales.');};
   assertAccess(access);let session=sessionFor(access,env);employeeContext(access.principal,session);
   if(method==='POST'){
    const raw=await readRawPrivateJson(req,{maxBytes:FAMILY_PAYROLL_FACTS_MAX_BYTES,maxDepth:8,timeoutMs:10000,declaredLength:schoolCertificateHttp.header(req,'content-length'),fail:kind=>{
     if(kind==='large')familyPayrollFactsFail('LIMIT',413,'La selección supera el tamaño permitido.');
     if(kind==='unavailable')familyPayrollFactsFail('UNAVAILABLE',503,'No se pudo leer el envío completo. Consultá el mismo intento.');
     familyPayrollFactsFail('INPUT_INVALID',400,'El formulario contiene datos ambiguos o inválidos.');
    }});
    if(!salaryExact(raw,['operation','payload'])||!['bootstrap','command'].includes(raw.operation))familyPayrollFactsFail('INPUT_INVALID',400,'Operación o formulario no admitidos.');
    operation=raw.operation;
    if(operation==='bootstrap'){
     if(schoolCertificateHttp.header(req,'idempotency-key'))familyPayrollFactsFail('INPUT_INVALID',400,'La consulta no registra un intento.');
     input=familySelectedQuery(raw.payload);
    }else{
     const command=familySelectedCommand(raw.payload);
     if(!principalHasCapabilities(access.principal,FAMILY_PAYROLL_FACTS_CAPS[command.command]))familyPayrollFactsFail('FORBIDDEN',403,'La membresía no permite esta operación.');
     input={body:command,key:schoolCertificateHttp.header(req,'idempotency-key')};
    }
   }
   const sql=await getSql(env),read=()=>familySelectedOperation(sql,access.principal,session,operation,input);
   const recoverable=method==='GET'&&['detail','attempt'].includes(operation),scope=recoverable?ownPeriodReadScopeKey(access.principal,session):null;
   const data=recoverable?await recoverOwnPeriodRead({method,operation,busyCode:'FAMILY_PAYROLL_FACTS_BUSY',read,reauthorize:async()=>{
    const next=await authorize(req,res,accessOptions);if(!next)return false;assertAccess(next);const nextSession=sessionFor(next,env);
    if(ownPeriodReadScopeKey(next.principal,nextSession)!==scope)familyPayrollFactsFail('SCOPE_CHANGED',409,'Cambió la cuenta, la sesión o el ámbito municipal. Volvé a abrir la consulta.');
    access=next;session=nextSession;return true;
   }}):await read();
   if(data===null)return;if(data.replayed)res.setHeader('Idempotency-Replayed','true');
   return res.status(operation==='command'&&!data.replayed?201:200).json({ok:true,data});
  }catch(e){const safe=String(e?.code??'').startsWith('SCHOOL_CERTIFICATE_')?schoolCertificateSafeError(e):familyPayrollFactsError(e);return res.status(safe.status).json({ok:false,code:safe.code,error:safe.message});}
 };
}
export default createOwnContractFamilySelectedHandler();
