import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {getActionCenterSql} from './internal-actions.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {schoolCertificateHttp as http} from './internal-family-certificates.js';
import {strictLegalJson} from './internal-legal-registry.js';
import {legalContext,legalSafeError} from '../lib/internal-legal-registry.js';
import {legalUuid} from '../assets/legal-registry-model.js';
import {normalizeMatterCommand,verifyMatterResponse,MatterInputError} from '../assets/legal-matters-model.js';

export const config={api:{bodyParser:false}};
const LIMIT=24000;
const fail=()=>{throw new MatterInputError();};
export function matterQuery(req){
 const q=req.query||{},u=new URL(req.url||'','http://local.invalid').searchParams;
 if(Object.values(q).some(v=>typeof v!=='string')||u.size!==Object.keys(q).length||new Set(u.keys()).size!==u.size||[...u].some(([k,v])=>q[k]!==v))fail();
 if(req.method==='POST'){if(u.size)fail();return{op:'save',input:{}};}
 if(q.resource==='bootstrap'&&Object.keys(q).length===1)return{op:'bootstrap',input:{}};
 if(q.resource==='list'){
  if(Object.keys(q).sort().join('|')!=='page|q|resource|state'||q.q.length>120||!/^[1-9][0-9]{0,2}$/.test(q.page)||+q.page>200||!['','assigned','in_review','returned','responded','reviewed','closed','cancelled'].includes(q.state))fail();
  return{op:'list',input:{q:q.q,state:q.state,page:+q.page}};
 }
 if(q.resource==='detail'&&Object.keys(q).sort().join('|')==='id|resource'&&legalUuid(q.id))return{op:'detail',input:{id:q.id}};
 if(q.resource==='attempt'&&Object.keys(q).sort().join('|')==='key|resource'&&legalUuid(q.key)&&q.key[14]==='4')return{op:'attempt',input:{},key:q.key};
 fail();
}
async function matterBody(req){
 http.checkLength(req,LIMIT);let value=req.body;
 if(value===undefined&&req[Symbol.asyncIterator]){let size=0;const parts=[];for await(const part of req){const b=Buffer.isBuffer(part)?part:Buffer.from(part);size+=b.length;if(size>LIMIT)fail();parts.push(b);}value=Buffer.concat(parts);}
 if(Buffer.isBuffer(value))value=value.toString('utf8');
 if(typeof value==='string'){if(Buffer.byteLength(value)>LIMIT)fail();value=strictLegalJson(value);}
 if(!value||Array.isArray(value)||typeof value!=='object'||Buffer.byteLength(JSON.stringify(value))>LIMIT)fail();
 return normalizeMatterCommand(value);
}
const ERRORS={
 INPUT_INVALID:[422,'Revisá los datos del asunto.'],
 NOT_FOUND:[404,'No se encontró el asunto dentro de tu municipio.'],
 SOURCE_NOT_FOUND:[404,'La versión normativa fuente no está disponible en este municipio.'],
 MEMBER_UNAVAILABLE:[409,'La persona responsable ya no está habilitada para este municipio y circuito.'],
 VERSION_CONFLICT:[409,'El asunto cambió. Conservá tu propuesta y revisá la versión actual.'],
 TRANSITION_INVALID:[409,'Ese cambio de estado no corresponde a la etapa actual.'],
 ASSIGNMENT_IMMUTABLE:[409,'Esta transición no puede cambiar responsable o área; usá Cambiar coordinación.'],
 EVIDENCE_NOT_FOUND:[422,'El artículo citado no existe en la versión normativa fuente.'],
 NO_CHANGE:[422,'No cambió la coordinación del asunto.'],
 CAPACITY:[409,'Se alcanzó el límite inicial de asuntos o revisiones. No se eliminó información.'],
 IDEMPOTENCY_CONFLICT:[409,'La clave ya pertenece a otro contenido. Consultá el intento original.'],
 BUSY:[409,'Otra operación está en curso. Reintentá con la misma información.'],
};
export function createLegalMattersHandler(deps={}){
 const env=deps.env??process.env;
 return async(req,res)=>{
  http.headers(res);
  try{
   if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({ok:false,code:'MATTER_METHOD',error:'Método no permitido.'});}
   const {op,input,key}=matterQuery(req),writing=['save','attempt'].includes(op);
   if(op==='save'){http.assertOrigin(req,env);if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(http.header(req,'content-type')))fail();http.checkLength(req,LIMIT);}
   const caps=['legal.norm.read',...(writing?['legal.norm.register']:[])];
   const access=await(deps.authorize??requireCompatibleInternalAccess)(req,res,{env,requiredCapabilities:caps,capabilityMode:'all',allowLegacy:false,requireDataPlaneReady:false,requireCertifiedDataBinding:false});
   if(!access)return;
   if(access.mode!=='managed'||access.principal?.tenant?.source!=='membership'||!principalHasCapabilities(access.principal,caps))return res.status(403).json({ok:false,code:'MATTER_FORBIDDEN',error:'No tenés permiso para esta operación jurídica.'});
   const context=legalContext(access.principal,access.session),attempt=op==='save'?http.header(req,'idempotency-key'):key;
   if(writing&&(!legalUuid(attempt)||attempt[14]!=='4'))fail();
   const payload=op==='save'?await matterBody(req):input;
   const sql=await(deps.getSql??getActionCenterSql)(env);
   const rows=await sql.query('SELECT public.legal_matter_operation_v1($1::jsonb,$2::text,$3::jsonb,$4::uuid) AS result',[JSON.stringify(context),op,JSON.stringify(payload),attempt??null]);
   const raw=(Array.isArray(rows)?rows:rows?.rows)?.[0]?.result;let data;
   try{data=verifyMatterResponse(op,raw);if(op==='detail'&&data.record.id!==payload.id||op==='save'&&payload.id&&data.id!==payload.id)throw Error('SCOPE');}catch{throw Error('MATTER_RESPONSE_INVALID');}
   if(data.replayed)res.setHeader('Idempotency-Replayed','true');
   return res.status(op==='save'&&!data.replayed?201:200).json({ok:true,data});
  }catch(e){
   if(e instanceof MatterInputError)return res.status(422).json({ok:false,code:'MATTER_INPUT_INVALID',error:e.message});
   const entry=Object.entries(ERRORS).find(([code])=>e?.message==='MATTER_'+code);
   if(entry)return res.status(entry[1][0]).json({ok:false,code:'MATTER_'+entry[0],error:entry[1][1]});
   const safe=legalSafeError(e);return res.status(safe.status).json({ok:false,code:safe.code,error:safe.message});
  }
 };
}
export default createLegalMattersHandler();
