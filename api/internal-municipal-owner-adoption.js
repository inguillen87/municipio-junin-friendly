import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {actionMutationSession,getActionCenterSql} from './internal-actions.js';
import {schoolCertificateHttp} from './internal-family-certificates.js';
import {schoolCertificateSafeError} from '../lib/internal-family-certificates.js';
import {readPrivateJsonBody} from './internal-employment-catalog.js';
import {adoptionFail} from '../lib/internal-employment-adoption.js';
import {assertOwnerAdoptionAccess,OWNER_ADOPTION_TENANT_CAPABILITIES} from '../lib/internal-municipal-owner-decision-authority.js';
import {municipalOwnerAdoptionOperation,municipalOwnerAdoptionError} from '../lib/internal-municipal-owner-adoption.js';
export const config={api:{bodyParser:false}};
const MAX_COMMAND_BYTES=8192;
export function createMunicipalOwnerAdoptionHandler(deps={}){
 const env=deps.env??process.env,authorize=deps.requireAccess??requireCompatibleInternalAccess,getSql=deps.getSql??getActionCenterSql,sessionFor=deps.sessionFor??actionMutationSession;
 return async(req,res)=>{
  schoolCertificateHttp.headers(res);
  try{
   const method=req.method??'GET',q=req.query??{};
   if(!['GET','POST'].includes(method)){res.setHeader('Allow','GET, POST');adoptionFail('METHOD_INVALID',405,'Método no admitido.');}
   if(!q||typeof q!=='object'||Array.isArray(q)||Object.values(q).some(v=>typeof v!=='string'))adoptionFail('QUERY_INVALID',400,'Consulta inválida.');
   if(req.url){const entries=[...new URL(req.url,'http://local.invalid').searchParams];if(entries.length!==Object.keys(q).length||entries.some(([k,v])=>q[k]!==v)||new Set(entries.map(([k])=>k)).size!==entries.length)adoptionFail('QUERY_INVALID',400,'Consulta ambigua.');}
   let operation,input={};
   if(method==='POST'){
    if(Object.keys(q).length)adoptionFail('QUERY_INVALID',400,'La decisión no admite filtros.');schoolCertificateHttp.assertOrigin(req,env);
    if(schoolCertificateHttp.header(req,'content-type').split(';')[0].trim().toLowerCase()!=='application/json')adoptionFail('CONTENT_TYPE',415,'Se requiere JSON.');
    schoolCertificateHttp.checkLength(req,MAX_COMMAND_BYTES);
   }else if(q.resource==='authority'&&Object.keys(q).length===1)operation='authority';
   else if(q.resource==='preview'&&Object.keys(q).sort().join('|')==='id|resource|source'){
    if(q.source.length>2048)adoptionFail('INPUT_INVALID',400,'Respaldo inválido.');
    operation='preview';try{input={id:q.id,source:JSON.parse(q.source)};}catch{adoptionFail('INPUT_INVALID',400,'Respaldo inválido.');}
   }else if(q.resource==='attempt'&&Object.keys(q).sort().join('|')==='key|resource'){operation='attempt';input.key=q.key;}
   else adoptionFail('QUERY_INVALID',400,'Consulta inválida.');
   const access=await authorize(req,res,{env,requiredCapabilities:OWNER_ADOPTION_TENANT_CAPABILITIES,capabilityMode:'all',requireDataPlaneReady:true,requireCertifiedDataBinding:true,allowLegacy:false});
   if(!access)return;const session=sessionFor(access,env);assertOwnerAdoptionAccess(access,session);
   if(method==='POST'){
    let value;try{value=await readPrivateJsonBody(req,{maxBytes:MAX_COMMAND_BYTES});}catch(error){
     // This shared parser reports catalog-domain errors; translate only its
     // bounded input failures, never arbitrary SQL errors with a status field.
     if(['NATIVE_EMPLOYMENT_CATALOG_INPUT_INVALID','NATIVE_EMPLOYMENT_CATALOG_LIMIT'].includes(error?.code)&&[400,413].includes(error.status))adoptionFail('INPUT_INVALID',error.status,'El formulario contiene datos ambiguos o inválidos.');
     throw error;
    }
    if(!value||Array.isArray(value)||Object.keys(value).sort().join('|')!=='operation|payload'||value.operation!=='approve_owner')adoptionFail('INPUT_INVALID',400,'Sólo se admite la aprobación explícita del propietario.');
    operation='command';input={body:value.payload,key:schoolCertificateHttp.header(req,'idempotency-key')};
   }
   const data=await municipalOwnerAdoptionOperation(await getSql(env),access,session,operation,input),replayed=data.attempt?.receipt?.replayed===true;
   if(replayed)res.setHeader('Idempotency-Replayed','true');return res.status(method==='POST'&&!replayed?201:200).json({ok:true,data});
  }catch(error){
   const code=String(error?.code??'');
   const safe=code.startsWith('SCHOOL_CERTIFICATE_')?schoolCertificateSafeError(error):code.startsWith('EMPLOYMENT_ADOPTION_')&&Number.isInteger(error.status)?error:municipalOwnerAdoptionError(error);
   return res.status(safe.status).json({ok:false,code:safe.code,error:safe.message});
  }
 };
}
export default createMunicipalOwnerAdoptionHandler();
