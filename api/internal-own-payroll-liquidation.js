import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {actionMutationSession,getActionCenterSql} from './internal-actions.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {schoolCertificateHttp} from './internal-family-certificates.js';
import {schoolCertificateSafeError} from '../lib/internal-family-certificates.js';
import {readRawPrivateJson} from '../lib/private-json-body.js';
import {employeeContext} from '../lib/internal-native-employees.js';
import {salaryExact} from '../assets/native-salary-catalog-model.js';
import {OWN_RUN_MAX_BODY} from '../assets/own-payroll-run-model.js';
import {ownLiquidationCommand} from '../assets/own-payroll-liquidation-model.js';
import {OWN_LIQ_READ,OWN_LIQ_NOMINAL,OWN_LIQ_REVIEW,OWN_LIQ_CANCEL,liquidationFail,liquidationError,ownLiquidationOperation} from '../lib/internal-own-payroll-liquidation.js';
export const config={api:{bodyParser:false}};
export function createOwnLiquidationHandler(deps={}){
 const env=deps.env??process.env,authorize=deps.requireAccess??requireCompatibleInternalAccess,getSql=deps.getSql??getActionCenterSql,sessionFor=deps.sessionFor??actionMutationSession;
 return async(req,res)=>{schoolCertificateHttp.headers(res);
  try{
   const method=req.method||'GET',q=req.query??{};let operation,input,access;
   if(!['GET','POST'].includes(method)){res.setHeader('Allow','GET, POST');liquidationFail('METHOD_INVALID',405,'Método no admitido.');}
   if(!q||typeof q!=='object'||Array.isArray(q)||Object.values(q).some(v=>typeof v!=='string'))liquidationFail('QUERY_INVALID',400,'Consulta inválida.');
   if(req.url){const entries=[...new URL(req.url,'http://local.invalid').searchParams];if(entries.length!==Object.keys(q).length||entries.some(([k,v])=>q[k]!==v)||new Set(entries.map(([k])=>k)).size!==entries.length)liquidationFail('QUERY_INVALID',400,'Consulta ambigua.');}
   if(method==='POST'){
    if(Object.keys(q).length)liquidationFail('QUERY_INVALID',400,'La decisión no admite parámetros.');schoolCertificateHttp.assertOrigin(req,env);
    if(schoolCertificateHttp.header(req,'content-type').split(';')[0].trim().toLowerCase()!=='application/json')liquidationFail('CONTENT_TYPE',415,'Se requiere un formulario JSON.');schoolCertificateHttp.checkLength(req,OWN_RUN_MAX_BODY);operation='command';
   }else if(q.resource==='bootstrap'&&Object.keys(q).join('|')==='resource'){operation='bootstrap';input={};}
   else if(q.resource==='detail'&&Object.keys(q).sort().join('|')==='id|resource'){operation='detail';input={id:q.id};}
   else if(q.resource==='attempt'&&Object.keys(q).sort().join('|')==='key|resource'){operation='attempt';input={key:q.key};}
   else liquidationFail('QUERY_INVALID',400,'Consulta inválida.');
   const required=operation==='bootstrap'?OWN_LIQ_READ:OWN_LIQ_NOMINAL;
   access=await authorize(req,res,{env,requiredCapabilities:required,capabilityMode:'all',requireDataPlaneReady:true,requireCertifiedDataBinding:true,allowLegacy:false});if(!access)return;
   if(access.mode!=='managed'||access.principal?.tenant?.source!=='membership'||!principalHasCapabilities(access.principal,required))liquidationFail('FORBIDDEN',403,'La membresía no permite consultar estas liquidaciones.');
   const session=sessionFor(access,env);employeeContext(access.principal,session);
   if(method==='POST'){
    // Checking both possible authorities before reading private body preserves
    // the independent reviewer path without requiring prepare permission.
    if(![OWN_LIQ_REVIEW,OWN_LIQ_CANCEL].some(caps=>principalHasCapabilities(access.principal,caps)))liquidationFail('FORBIDDEN',403,'No tenés autoridad para decidir sobre este resultado.');
    const body=await readRawPrivateJson(req,{maxBytes:OWN_RUN_MAX_BODY,timeoutMs:10000,declaredLength:schoolCertificateHttp.header(req,'content-length'),fail:kind=>liquidationFail(kind==='large'?'LIMIT':kind==='unavailable'?'UNAVAILABLE':'INPUT_INVALID',kind==='large'?413:kind==='unavailable'?503:400,'No se pudo verificar el envío completo. Consultá el mismo intento.')});
    if(!salaryExact(body,['operation','payload'])||body.operation!=='command')liquidationFail('INPUT_INVALID',400,'Operación o formulario no admitidos.');
    let payload;try{payload=ownLiquidationCommand(body.payload);}catch{liquidationFail('INPUT_INVALID',422,'Revisá decisión, alcance y motivo.');}const caps=payload.command==='cancel'?OWN_LIQ_CANCEL:OWN_LIQ_REVIEW;if(!principalHasCapabilities(access.principal,caps))liquidationFail('FORBIDDEN',403,'Tu cuenta no permite esta decisión.');input={body:payload,key:schoolCertificateHttp.header(req,'idempotency-key')};
   }
   const data=await ownLiquidationOperation(await getSql(env),access.principal,session,operation,input);if(data.replayed)res.setHeader('Idempotency-Replayed','true');return res.status(method==='POST'&&!data.replayed?201:200).json({ok:true,data});
  }catch(e){const safe=String(e?.code??'').startsWith('SCHOOL_CERTIFICATE_')?schoolCertificateSafeError(e):liquidationError(e);return res.status(safe.status).json({ok:false,code:safe.code,error:safe.message});}
 };
}
export default createOwnLiquidationHandler();
