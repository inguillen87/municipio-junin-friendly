import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {actionMutationSession,getActionCenterSql} from './internal-actions.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {schoolCertificateHttp} from './internal-family-certificates.js';
import {schoolCertificateSafeError} from '../lib/internal-family-certificates.js';
import {readPrivateJsonBody} from './internal-employment-catalog.js';
import {employeeContext} from '../lib/internal-native-employees.js';
import {ADOPTION_PREPARATION_MAX_BYTES,adoptionFail,adoptionPreparationError,adoptionPreparationOperation} from '../lib/internal-employment-adoption.js';
export const config={api:{bodyParser:false}};
export function createEmploymentAdoptionHandler(deps={}){
 const env=deps.env??process.env,authorize=deps.requireAccess??requireCompatibleInternalAccess,getSql=deps.getSql??getActionCenterSql,sessionFor=deps.sessionFor??actionMutationSession;
 return async(req,res)=>{
  schoolCertificateHttp.headers(res);
  try{
   const method=req.method??'GET',q=req.query??{};if(!['GET','POST'].includes(method)){res.setHeader('Allow','GET, POST');adoptionFail('METHOD_INVALID',405,'Método no admitido.');}
   if(!q||typeof q!=='object'||Array.isArray(q)||Object.values(q).some(v=>typeof v!=='string'))adoptionFail('QUERY_INVALID',400,'Consulta inválida.');
   if(req.url){const entries=[...new URL(req.url,'http://local.invalid').searchParams];if(entries.length!==Object.keys(q).length||entries.some(([k,v])=>q[k]!==v)||new Set(entries.map(([k])=>k)).size!==entries.length)adoptionFail('QUERY_INVALID',400,'Consulta ambigua.');}
   let operation,input={};
   if(method==='POST'){
    if(Object.keys(q).length)adoptionFail('QUERY_INVALID',400,'La operación no admite filtros o parámetros.');schoolCertificateHttp.assertOrigin(req,env);
    if(schoolCertificateHttp.header(req,'content-type').split(';')[0].trim().toLowerCase()!=='application/json')adoptionFail('CONTENT_TYPE',415,'Se requiere un formulario JSON.');schoolCertificateHttp.checkLength(req,ADOPTION_PREPARATION_MAX_BYTES);
   }else if(q.resource==='bootstrap'&&Object.keys(q).length===1)operation='bootstrap';
   else if(q.resource==='final-sources'&&Object.keys(q).length===1)operation='final-sources';
   else if(['final-bootstrap','final-active-bootstrap'].includes(q.resource)&&Object.keys(q).sort().join('|')==='packageSha256|resource|revisionId'){operation=q.resource;input={revisionId:q.revisionId,packageSha256:q.packageSha256};}
   else if(q.resource==='attempt'&&Object.keys(q).sort().join('|')==='key|resource'){operation='attempt';input.key=q.key;}
   else adoptionFail('QUERY_INVALID',400,'Consulta inválida.');
   const access=await authorize(req,res,{env,requiredCapabilities:['workforce.employee.read'],capabilityMode:'all',requireDataPlaneReady:true,requireCertifiedDataBinding:true,allowLegacy:false});if(!access)return;
   if(access.mode!=='managed'||access.principal?.tenant?.source!=='membership'||!principalHasCapabilities(access.principal,['workforce.employee.read']))adoptionFail('FORBIDDEN',403,'La membresía no permite revisar el padrón.');
   const session=sessionFor(access,env);employeeContext(access.principal,session);
   if(method==='POST'){
    if(!principalHasCapabilities(access.principal,['employee.record.propose']))adoptionFail('FORBIDDEN',403,'Tu cuenta no permite preparar esta propuesta.');
    const body=await readPrivateJsonBody(req,{maxBytes:ADOPTION_PREPARATION_MAX_BYTES});if(!body||Array.isArray(body)||Object.keys(body).sort().join('|')!=='operation|payload'||body.operation!=='propose')adoptionFail('INPUT_INVALID',400,'Sólo se admite preparar una propuesta completa.');
    operation='propose';input={body:body.payload,key:schoolCertificateHttp.header(req,'idempotency-key')};
   }
   const data=await adoptionPreparationOperation(await getSql(env),access.principal,session,operation,input);if(data.receipt?.replayed)res.setHeader('Idempotency-Replayed','true');return res.status(method==='POST'&&!data.receipt?.replayed?201:200).json({ok:true,data});
  }catch(e){const safe=String(e?.code??'').startsWith('SCHOOL_CERTIFICATE_')?schoolCertificateSafeError(e):adoptionPreparationError(e);return res.status(safe.status).json({ok:false,code:safe.code,error:safe.message});}
 };
}
export default createEmploymentAdoptionHandler();
