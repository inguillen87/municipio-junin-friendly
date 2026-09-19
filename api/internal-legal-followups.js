// Independent native follow-up endpoint; identity and authorization remain server-owned.
import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {getActionCenterSql} from './internal-actions.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {schoolCertificateHttp as http} from './internal-family-certificates.js';
import {strictLegalJson} from './internal-legal-registry.js';
import {legalContext,legalSafeError} from '../lib/internal-legal-registry.js';
import {followupId,normalizeFollowup,verifyFollowupResponse,FollowupInputError} from '../assets/legal-followups-model.js';
export const config={api:{bodyParser:false}};
import {verifyAgenda} from '../assets/legal-agenda-model.js';
const LIMIT=16000;
const ERRORS={INPUT_INVALID:[422,'Revisá los datos del seguimiento.'],NOT_FOUND:[404,'No se encontró el seguimiento o la norma dentro de tu acceso.'],VERSION_CONFLICT:[409,'El seguimiento cambió. Conservá tu texto, consultá el historial y abrí la versión actual.'],SOURCE_IMMUTABLE:[422,'La norma y su versión de referencia no se cambian.'],IDEMPOTENCY_CONFLICT:[409,'La clave ya pertenece a otro contenido. Consultá el intento original.'],CAPACITY:[409,'Se alcanzó el límite inicial de seguimientos o revisiones. No se eliminó información.'],NO_CHANGE:[422,'No hay cambios en el título, fecha, estado o nota.'],BUSY:[409,'Otra operación está en curso. Reintentá con la misma información.']};
function fail(){throw new FollowupInputError();}
export function followupQuery(req){
 const q=req.query||{},u=new URL(req.url||'','http://local.invalid').searchParams;
 if(Object.values(q).some(v=>typeof v!=='string')||u.size!==Object.keys(q).length||new Set(u.keys()).size!==u.size||[...u].some(([k,v])=>q[k]!==v))fail();
 if(req.method==='POST'){if(u.size)fail();return{op:'save',input:{}};}
 if(q.resource==='agenda'){if(Object.keys(q).length!==1)fail();return{op:'agenda',input:{}};}
 const allowed={list:['resource','normId'],detail:['resource','id'],attempt:['resource','key']}[q.resource];
 if(!allowed||Object.keys(q).sort().join('|')!==allowed.sort().join('|'))fail();
 if(q.resource==='list'){if(!followupId(q.normId))fail();return{op:'list',input:{normId:q.normId}};}
 if(q.resource==='detail'){if(!followupId(q.id))fail();return{op:'detail',input:{id:q.id}};}
 return{op:'attempt',input:{},key:q.key};
}
export async function followupBody(req){
 http.checkLength(req,LIMIT);let value=req.body;
 if(value===undefined&&req[Symbol.asyncIterator]){let size=0;const chunks=[];for await(const chunk of req){const b=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=b.length;if(size>LIMIT)fail();chunks.push(b);}value=Buffer.concat(chunks);}
 if(Buffer.isBuffer(value))value=value.toString('utf8');if(typeof value==='string'){if(Buffer.byteLength(value)>LIMIT)fail();value=strictLegalJson(value);}
 if(!value||Buffer.byteLength(JSON.stringify(value))>LIMIT)fail();return normalizeFollowup(value);
}
export function createLegalFollowupHandler(deps={}){const env=deps.env??process.env;return async(req,res)=>{
 http.headers(res);
 try{
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({ok:false,code:'FOLLOWUP_METHOD',error:'Método no permitido.'});}
  const {op,input,key}=followupQuery(req),writing=['save','attempt'].includes(op);
  if(op==='save'){http.assertOrigin(req,env);if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(http.header(req,'content-type')))fail();http.checkLength(req,LIMIT);}
  const caps=['legal.norm.read',...(writing?['legal.norm.register']:[])];
  const access=await(deps.authorize??requireCompatibleInternalAccess)(req,res,{env,requiredCapabilities:caps,capabilityMode:'all',allowLegacy:false,requireDataPlaneReady:false,requireCertifiedDataBinding:false});
  if(!access)return;if(access.mode!=='managed'||access.principal?.tenant?.source!=='membership'||!principalHasCapabilities(access.principal,caps))return res.status(403).json({ok:false,code:'LEGAL_FORBIDDEN',error:'No tenés permiso para esta operación jurídica.'});
  const context=legalContext(access.principal,access.session),attempt=op==='save'?http.header(req,'idempotency-key'):key;
  if(writing&&(!followupId(attempt)||attempt[14]!=='4'))fail();
  const payload=op==='save'?await followupBody(req):input;
  const sql=await(deps.getSql??getActionCenterSql)(env);
  const rows=op==='agenda'?await sql.query('SELECT public.legal_followup_agenda_v1($1::jsonb) AS result',[JSON.stringify(context)]):await sql.query('SELECT public.legal_followup_operation_v1($1::jsonb,$2::text,$3::jsonb,$4::uuid) AS result',[JSON.stringify(context),op,JSON.stringify(payload),attempt??null]);
  const raw=(Array.isArray(rows)?rows:rows?.rows)?.[0]?.result;let data;
  try{data=op==='agenda'?verifyAgenda(raw):verifyFollowupResponse(op,raw);if(op==='list'&&data.normId!==payload.normId||op==='detail'&&data.record.id!==payload.id||op==='save'&&payload.id&&data.id!==payload.id)throw Error('SCOPE');}catch{throw Error('FOLLOWUP_RESPONSE_INVALID');}
  if(data.replayed)res.setHeader('Idempotency-Replayed','true');return res.status(op==='save'&&!data.replayed?201:200).json({ok:true,data});
 }catch(e){
  if(e instanceof FollowupInputError)return res.status(422).json({ok:false,code:'FOLLOWUP_INPUT_INVALID',error:e.message});
  const entry=Object.entries(ERRORS).find(([code])=>e?.message==='FOLLOWUP_'+code);
  if(entry)return res.status(entry[1][0]).json({ok:false,code:'FOLLOWUP_'+entry[0],error:entry[1][1]});
  const safe=legalSafeError(e);return res.status(safe.status).json({ok:false,code:safe.code,error:safe.message});
 }
};}
export default createLegalFollowupHandler();
