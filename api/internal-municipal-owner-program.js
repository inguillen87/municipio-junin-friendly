import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {actionMutationSession,getActionCenterSql} from './internal-actions.js';
import {schoolCertificateHttp} from './internal-family-certificates.js';
import {schoolCertificateSafeError} from '../lib/internal-family-certificates.js';
import {readPrivateJsonBody} from './internal-employment-catalog.js';
import {OWNER_PROGRAM_CAPABILITIES,assertOwnerProgramAccess,ownerProgramFail,municipalOwnerProgramOperation,municipalOwnerProgramError} from '../lib/internal-municipal-owner-program.js';
export const config={api:{bodyParser:false}};
export function createMunicipalOwnerProgramHandler(deps={}){
 const env=deps.env??process.env,authorize=deps.requireAccess??requireCompatibleInternalAccess,getSql=deps.getSql??getActionCenterSql,sessionFor=deps.sessionFor??actionMutationSession;
 return async(req,res)=>{
  schoolCertificateHttp.headers(res);
  try{
   const method=req.method??'GET',q=req.query??{};if(!['GET','POST'].includes(method)){res.setHeader('Allow','GET, POST');ownerProgramFail('METHOD_INVALID',405,'Método no admitido.');}
   if(!q||typeof q!=='object'||Array.isArray(q)||Object.values(q).some(v=>typeof v!=='string'))ownerProgramFail('QUERY_INVALID',400,'Consulta inválida.');
   if(req.url){const entries=[...new URL(req.url,'http://local.invalid').searchParams];if(entries.length!==Object.keys(q).length||entries.some(([k,v])=>q[k]!==v)||new Set(entries.map(([k])=>k)).size!==entries.length)ownerProgramFail('QUERY_INVALID',400,'Consulta ambigua.');}
   let operation,input={};
   if(method==='POST'){if(Object.keys(q).length)ownerProgramFail('QUERY_INVALID',400,'La decisión no admite filtros.');schoolCertificateHttp.assertOrigin(req,env);if(schoolCertificateHttp.header(req,'content-type').split(';')[0].trim().toLowerCase()!=='application/json')ownerProgramFail('CONTENT_TYPE',415,'Se requiere JSON.');schoolCertificateHttp.checkLength(req,8192);}
   else if(q.resource==='authority'&&Object.keys(q).length===1)operation='authority';
   else if(q.resource==='preview'&&Object.keys(q).sort().join('|')==='id|resource'){operation='preview';input.id=q.id;}
   else if(q.resource==='attempt'&&Object.keys(q).sort().join('|')==='key|resource'){operation='attempt';input.key=q.key;}
   else ownerProgramFail('QUERY_INVALID',400,'Consulta inválida.');
   const access=await authorize(req,res,{env,requiredCapabilities:OWNER_PROGRAM_CAPABILITIES,capabilityMode:'all',requireDataPlaneReady:true,requireCertifiedDataBinding:true,allowLegacy:false});if(!access)return;
   const session=sessionFor(access,env);assertOwnerProgramAccess(access,session);
   if(method==='POST'){
    let body;try{body=await readPrivateJsonBody(req,{maxBytes:8192});}catch(error){if(['NATIVE_EMPLOYMENT_CATALOG_INPUT_INVALID','NATIVE_EMPLOYMENT_CATALOG_LIMIT'].includes(error?.code)&&[400,413].includes(error.status))ownerProgramFail('INPUT_INVALID',error.status,'El formulario contiene datos ambiguos o inválidos.');throw error;}
    if(!body||Array.isArray(body)||Object.keys(body).sort().join('|')!=='operation|payload'||body.operation!=='approve_owner')ownerProgramFail('INPUT_INVALID',400,'Sólo se admite la aprobación explícita del propietario.');
    operation='command';input={body:body.payload,key:schoolCertificateHttp.header(req,'idempotency-key')};
   }
   const data=await municipalOwnerProgramOperation(await getSql(env),access,session,operation,input),replayed=data.receipt?.replayed===true;if(replayed)res.setHeader('Idempotency-Replayed','true');
   return res.status(method==='POST'&&!replayed?201:200).json({ok:true,data});
  }catch(error){const safe=String(error?.code??'').startsWith('SCHOOL_CERTIFICATE_')?schoolCertificateSafeError(error):municipalOwnerProgramError(error);return res.status(safe.status).json({ok:false,code:safe.code,error:safe.message});}
 };
}
export default createMunicipalOwnerProgramHandler();
