import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {actionMutationSession,getActionCenterSql} from './internal-actions.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {schoolCertificateHttp} from './internal-family-certificates.js';
import {schoolCertificateSafeError} from '../lib/internal-family-certificates.js';
import {readRawPrivateJson} from '../lib/private-json-body.js';
import {employeeContext} from '../lib/internal-native-employees.js';
import {salaryExact} from '../assets/native-salary-catalog-model.js';
import {ownNoveltyCommand,OWN_NOVELTY_MAX_BYTES,OWN_NOVELTY_READ,OWN_NOVELTY_CAPS} from '../assets/own-payroll-novelties-model.js';
import {noveltyFail,ownNoveltyError,ownNoveltyOperation} from '../lib/internal-own-payroll-novelties.js';
export const config={api:{bodyParser:false}};
export function createOwnNoveltyHandler(deps={}){
 const env=deps.env??process.env,authorize=deps.requireAccess??requireCompatibleInternalAccess,getSql=deps.getSql??getActionCenterSql,sessionFor=deps.sessionFor??actionMutationSession;
 return async(req,res)=>{schoolCertificateHttp.headers(res);try{
  const method=req.method||'GET',q=req.query??{};let operation,input;
  if(!['GET','POST'].includes(method)){res.setHeader('Allow','GET, POST');noveltyFail('METHOD_INVALID',405,'Método no admitido.');}
  if(!q||typeof q!=='object'||Array.isArray(q)||Object.values(q).some(v=>typeof v!=='string'))noveltyFail('QUERY_INVALID',400,'Consulta inválida.');
  if(req.url){const entries=[...new URL(req.url,'http://local.invalid').searchParams];if(entries.length!==Object.keys(q).length||entries.some(([k,v])=>q[k]!==v)||new Set(entries.map(([k])=>k)).size!==entries.length)noveltyFail('QUERY_INVALID',400,'Consulta ambigua.');}
  if(method==='POST'){
   if(Object.keys(q).length)noveltyFail('QUERY_INVALID',400,'El envío no admite parámetros.');schoolCertificateHttp.assertOrigin(req,env);
   if(schoolCertificateHttp.header(req,'content-type').split(';')[0].trim().toLowerCase()!=='application/json')noveltyFail('CONTENT_TYPE',415,'Se requiere un formulario JSON.');schoolCertificateHttp.checkLength(req,OWN_NOVELTY_MAX_BYTES+64);
  }else if(q.resource==='bootstrap'&&Object.keys(q).join('|')==='resource'){operation='bootstrap';input={};}
  else if(q.resource==='detail'&&Object.keys(q).sort().join('|')==='id|resource'){operation='detail';input={id:q.id};}
  else if(q.resource==='attempt'&&Object.keys(q).sort().join('|')==='key|resource'){operation='attempt';input={key:q.key};}
  else noveltyFail('QUERY_INVALID',400,'Consulta inválida.');
  const access=await authorize(req,res,{env,requiredCapabilities:OWN_NOVELTY_READ,capabilityMode:'all',requireDataPlaneReady:true,requireCertifiedDataBinding:true,allowLegacy:false});if(!access)return;
  if(access.mode!=='managed'||access.principal?.tenant?.source!=='membership'||!principalHasCapabilities(access.principal,OWN_NOVELTY_READ))noveltyFail('FORBIDDEN',403,'Tu membresía no permite consultar novedades propias.');
  const session=sessionFor(access,env);employeeContext(access.principal,session);
  if(method==='POST'){
   if(!principalHasCapabilities(access.principal,['payroll.novelty.prepare'])&&!principalHasCapabilities(access.principal,['payroll.novelty.approve']))noveltyFail('FORBIDDEN',403,'Tu membresía no permite registrar ni decidir novedades.');
   const body=await readRawPrivateJson(req,{maxBytes:OWN_NOVELTY_MAX_BYTES+64,maxDepth:16,timeoutMs:10000,declaredLength:schoolCertificateHttp.header(req,'content-length'),fail:kind=>noveltyFail(kind==='large'?'LIMIT':'INPUT_INVALID',kind==='large'?413:400,'El envío debe estar completo y no contener campos ambiguos.')});
   if(!salaryExact(body,['operation','payload'])||body.operation!=='command')noveltyFail('INPUT_INVALID',400,'Operación inválida.');const command=ownNoveltyCommand(body.payload);
   if(!principalHasCapabilities(access.principal,[OWN_NOVELTY_CAPS[command.command]]))noveltyFail('FORBIDDEN',403,'Tu membresía no permite esta operación.');operation='command';input={body:command,key:schoolCertificateHttp.header(req,'idempotency-key')};
  }
  const data=await ownNoveltyOperation(await getSql(env),access.principal,session,operation,input);if(data.replayed)res.setHeader('Idempotency-Replayed','true');return res.status(method==='POST'&&!data.replayed?201:200).json({ok:true,data});
 }catch(e){const safe=String(e?.code??'').startsWith('SCHOOL_CERTIFICATE_')?schoolCertificateSafeError(e):ownNoveltyError(e);return res.status(safe.status).json({ok:false,code:safe.code,error:safe.message});}};
}
export default createOwnNoveltyHandler();
