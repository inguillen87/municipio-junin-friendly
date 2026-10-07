import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {actionMutationSession,getActionCenterSql} from './internal-actions.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {schoolCertificateHttp} from './internal-family-certificates.js';
import {schoolCertificateSafeError} from '../lib/internal-family-certificates.js';
import {readPrivateJsonBody} from './internal-employment-catalog.js';
import {ADOPTION_PREPARATION_MAX_BYTES,adoptionFail} from '../lib/internal-employment-adoption.js';
import {municipalAdoptionOperation,municipalAdoptionError,MUNICIPAL_ADOPTION_CAPS} from '../lib/internal-municipal-adoption.js';
export const config={api:{bodyParser:false}};
export function createMunicipalAdoptionHandler(deps={}){
 const env=deps.env??process.env,authorize=deps.requireAccess??requireCompatibleInternalAccess,getSql=deps.getSql??getActionCenterSql,sessionFor=deps.sessionFor??actionMutationSession;
 return async(req,res)=>{
  schoolCertificateHttp.headers(res);
  try{
   const method=req.method??'GET',q=req.query??{};if(!['GET','POST'].includes(method)){res.setHeader('Allow','GET, POST');adoptionFail('METHOD_INVALID',405,'Método no admitido.');}
   if(!q||typeof q!=='object'||Array.isArray(q)||Object.values(q).some(v=>typeof v!=='string'))adoptionFail('QUERY_INVALID',400,'Consulta inválida.');
   if(req.url){const entries=[...new URL(req.url,'http://local.invalid').searchParams];if(entries.length!==Object.keys(q).length||entries.some(([k,v])=>q[k]!==v)||new Set(entries.map(([k])=>k)).size!==entries.length)adoptionFail('QUERY_INVALID',400,'Consulta ambigua.');}
   let operation,input={};
   if(method==='POST'){
    if(Object.keys(q).length)adoptionFail('QUERY_INVALID',400,'La decisión no admite filtros.');schoolCertificateHttp.assertOrigin(req,env);
    if(schoolCertificateHttp.header(req,'content-type').split(';')[0].trim().toLowerCase()!=='application/json')adoptionFail('CONTENT_TYPE',415,'Se requiere JSON.');schoolCertificateHttp.checkLength(req,ADOPTION_PREPARATION_MAX_BYTES);
   }else if(q.resource==='queue'&&Object.keys(q).length===1)operation='queue';
   else if(q.resource==='review'&&Object.keys(q).sort().join('|')==='id|resource'){operation='review';input.id=q.id;}
   else if(q.resource==='attempt'&&Object.keys(q).sort().join('|')==='key|resource'){operation='attempt';input.key=q.key;}
   else adoptionFail('QUERY_INVALID',400,'Consulta inválida.');
   const access=await authorize(req,res,{env,requiredCapabilities:MUNICIPAL_ADOPTION_CAPS,capabilityMode:'all',requireDataPlaneReady:true,requireCertifiedDataBinding:true,allowLegacy:false});if(!access)return;
   if(access.mode!=='managed'||access.principal?.tenant?.source!=='membership'||!principalHasCapabilities(access.principal,MUNICIPAL_ADOPTION_CAPS))adoptionFail('FORBIDDEN',403,'La membresía no permite decidir adopciones.');
   if(method==='POST'){const body=await readPrivateJsonBody(req,{maxBytes:ADOPTION_PREPARATION_MAX_BYTES});if(!body||Array.isArray(body)||Object.keys(body).sort().join('|')!=='operation|payload'||body.operation!=='command')adoptionFail('INPUT_INVALID',400,'Sólo se admite una decisión explícita.');operation='command';input={body:body.payload,key:schoolCertificateHttp.header(req,'idempotency-key')};}
   const data=await municipalAdoptionOperation(await getSql(env),access.principal,sessionFor(access,env),operation,input);if(data.receipt?.replayed)res.setHeader('Idempotency-Replayed','true');return res.status(method==='POST'&&!data.receipt?.replayed?201:200).json({ok:true,data});
  }catch(e){const safe=String(e?.code??'').startsWith('SCHOOL_CERTIFICATE_')?schoolCertificateSafeError(e):municipalAdoptionError(e);return res.status(safe.status).json({ok:false,code:safe.code,error:safe.message});}
 };
}
export default createMunicipalAdoptionHandler();
