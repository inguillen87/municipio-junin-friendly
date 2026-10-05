import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {actionMutationSession,getActionCenterSql} from './internal-actions.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {schoolCertificateHttp} from './internal-family-certificates.js';
import {schoolCertificateSafeError} from '../lib/internal-family-certificates.js';
import {readRawPrivateJson} from '../lib/private-json-body.js';
import {employeeContext} from '../lib/internal-native-employees.js';
import {salaryExact} from '../assets/native-salary-catalog-model.js';
import {OWN_RUN_MAX_BODY} from '../assets/own-payroll-run-model.js';
import {ownCloseCommand} from '../assets/own-payroll-close-model.js';
import {OWN_CLOSE_NOMINAL,OWN_CLOSE_WRITE,closeFail,closeError,ownCloseOperation} from '../lib/internal-own-payroll-close.js';
export const config={api:{bodyParser:false}};
export function createOwnCloseHandler(deps={}){
 const env=deps.env??process.env,authorize=deps.requireAccess??requireCompatibleInternalAccess,getSql=deps.getSql??getActionCenterSql,sessionFor=deps.sessionFor??actionMutationSession;
 return async(req,res)=>{schoolCertificateHttp.headers(res);try{
  const method=req.method||'GET',q=req.query??{};let operation,input;
  if(!['GET','POST'].includes(method)){res.setHeader('Allow','GET, POST');closeFail('METHOD_INVALID',405,'Método no admitido.');}
  if(!q||typeof q!=='object'||Array.isArray(q)||Object.values(q).some(v=>typeof v!=='string'))closeFail('QUERY_INVALID',400,'Consulta inválida.');
  if(req.url){const entries=[...new URL(req.url,'http://local.invalid').searchParams];if(entries.length!==Object.keys(q).length||entries.some(([k,v])=>q[k]!==v)||new Set(entries.map(([k])=>k)).size!==entries.length)closeFail('QUERY_INVALID',400,'Consulta ambigua.');}
  if(method==='POST'){
   if(Object.keys(q).length)closeFail('QUERY_INVALID',400,'El cierre no admite parámetros.');schoolCertificateHttp.assertOrigin(req,env);
   if(schoolCertificateHttp.header(req,'content-type').split(';')[0].trim().toLowerCase()!=='application/json')closeFail('CONTENT_TYPE',415,'Se requiere un formulario JSON.');schoolCertificateHttp.checkLength(req,OWN_RUN_MAX_BODY);operation='command';
  }else if(q.resource==='detail'&&Object.keys(q).sort().join('|')==='liquidationType|period|resource'){operation='detail';input={period:q.period,liquidationType:q.liquidationType};}
  else if(q.resource==='group'&&Object.keys(q).sort().join('|')==='id|resource'){operation='group';input={id:q.id};}
  else if(q.resource==='attempt'&&Object.keys(q).sort().join('|')==='key|resource'){operation='attempt';input={key:q.key};}
  else closeFail('QUERY_INVALID',400,'Consulta inválida.');
  const required=method==='POST'?OWN_CLOSE_WRITE:OWN_CLOSE_NOMINAL;
  const access=await authorize(req,res,{env,requiredCapabilities:required,capabilityMode:'all',requireDataPlaneReady:true,requireCertifiedDataBinding:true,allowLegacy:false});if(!access)return;
  if(access.mode!=='managed'||access.principal?.tenant?.source!=='membership'||!principalHasCapabilities(access.principal,required))closeFail('FORBIDDEN',403,'La membresía no permite esta operación.');
  const session=sessionFor(access,env);employeeContext(access.principal,session);
  if(method==='POST'){
   const body=await readRawPrivateJson(req,{maxBytes:OWN_RUN_MAX_BODY,timeoutMs:10000,declaredLength:schoolCertificateHttp.header(req,'content-length'),fail:kind=>closeFail(kind==='large'?'LIMIT':kind==='unavailable'?'UNAVAILABLE':'INPUT_INVALID',kind==='large'?413:kind==='unavailable'?503:400,'No se verificó el envío completo. Consultá el mismo intento.')});
   if(!salaryExact(body,['operation','payload'])||body.operation!=='command')closeFail('INPUT_INVALID',400,'Formulario no admitido.');let payload;try{payload=ownCloseCommand(body.payload);}catch{closeFail('INPUT_INVALID',422,'Revisá cierre, alcance y motivo.');}input={body:payload,key:schoolCertificateHttp.header(req,'idempotency-key')};
  }
  const data=await ownCloseOperation(await getSql(env),access.principal,session,operation,input);if(data.replayed)res.setHeader('Idempotency-Replayed','true');return res.status(method==='POST'&&!data.replayed?201:200).json({ok:true,data});
 }catch(e){const safe=String(e?.code??'').startsWith('SCHOOL_CERTIFICATE_')?schoolCertificateSafeError(e):closeError(e);return res.status(safe.status).json({ok:false,code:safe.code,error:safe.message});}};
}
export default createOwnCloseHandler();
