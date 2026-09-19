import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {getActionCenterSql} from './internal-actions.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {schoolCertificateHttp as http} from './internal-family-certificates.js';
import {strictLegalJson} from './internal-legal-registry.js';
import {legalContext,legalSafeError} from '../lib/internal-legal-registry.js';
import {followupId,FollowupInputError} from '../assets/legal-followups-model.js';
import {normalizeCoordination,verifyCoordination} from '../assets/legal-coordination-model.js';
export const config={api:{bodyParser:false}};
const LIMIT=6000;
const fail=()=>{throw new FollowupInputError('Datos de coordinación inválidos.');};
export function coordinationQuery(req){const q=req.query||{},u=new URL(req.url||'','http://local.invalid').searchParams;
 if(Object.values(q).some(v=>typeof v!=='string')||u.size!==Object.keys(q).length||new Set(u.keys()).size!==u.size||[...u].some(([k,v])=>q[k]!==v))fail();
 if(req.method==='POST'){if(u.size)fail();return {op:'save'};}
 if(q.resource==='detail'&&Object.keys(q).sort().join()==='followupId,resource'&&followupId(q.followupId))return {op:'detail',input:{followupId:q.followupId}};
 if(q.resource==='attempt'&&Object.keys(q).sort().join()==='key,resource'&&followupId(q.key)&&q.key[14]==='4')return {op:'attempt',input:{},key:q.key};fail();
}
async function body(req){http.checkLength(req,LIMIT);let v=req.body;
 if(v===undefined&&req[Symbol.asyncIterator]){const parts=[];let n=0;for await(const part of req){const b=Buffer.from(part);n+=b.length;if(n>LIMIT)fail();parts.push(b);}v=Buffer.concat(parts);}
 if(Buffer.isBuffer(v))v=v.toString('utf8');if(typeof v==='string'){if(Buffer.byteLength(v)>LIMIT)fail();v=strictLegalJson(v);}
 if(!v||Buffer.byteLength(JSON.stringify(v))>LIMIT)fail();return normalizeCoordination(v);
}
const ERRORS={INPUT_INVALID:[422,'Revisá los datos ingresados.'],NOT_FOUND:[404,'No se encontró ese seguimiento o intento dentro del municipio.'],CLOSED:[409,'El seguimiento está cerrado. Su coordinación se conserva; no se cambió nada.'],VERSION_CONFLICT:[409,'El seguimiento o su coordinación cambió. Conservá tu propuesta y revisá la versión actual.'],MEMBER_UNAVAILABLE:[409,'La persona ya no está habilitada para este municipio y circuito.'],NO_CHANGE:[422,'No cambió el responsable ni la próxima actuación.'],CAPACITY:[409,'Se alcanzó el límite de revisiones o candidatos; no se eliminó información.'],IDEMPOTENCY_CONFLICT:[409,'La clave pertenece a otra propuesta. Consultá el intento original.'],BUSY:[409,'Otra operación está en curso. Reintentá con la misma clave.']};
export function createLegalCoordinationHandler(deps={}){const env=deps.env??process.env;return async(req,res)=>{
 http.headers(res);try{
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({ok:false,error:'Método no permitido.'});}
  const query=coordinationQuery(req),writing=query.op!=='detail';
  if(query.op==='save'){http.assertOrigin(req,env);if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(http.header(req,'content-type')))fail();http.checkLength(req,LIMIT);}
  const caps=['legal.norm.read',...(writing?['legal.norm.register']:[])];
  const access=await(deps.authorize??requireCompatibleInternalAccess)(req,res,{env,requiredCapabilities:caps,capabilityMode:'all',allowLegacy:false,requireDataPlaneReady:false,requireCertifiedDataBinding:false});
  if(!access)return;if(access.mode!=='managed'||access.principal?.tenant?.source!=='membership'||!principalHasCapabilities(access.principal,caps))return res.status(403).json({ok:false,error:'No tenés permiso para coordinar este seguimiento.'});
  const context=legalContext(access.principal,access.session),key=query.op==='save'?http.header(req,'idempotency-key'):query.key;
  if(writing&&(!followupId(key)||key[14]!=='4'))fail();
  const payload=query.op==='save'?await body(req):query.input,sql=await(deps.getSql??getActionCenterSql)(env);
  const rows=await sql.query('SELECT public.legal_coordination_v1($1::jsonb,$2::text,$3::jsonb,$4::uuid) AS result',[JSON.stringify(context),query.op,JSON.stringify(payload),key??null]);
  let data;try{data=verifyCoordination(query.op,(Array.isArray(rows)?rows:rows?.rows)?.[0]?.result);if(query.op==='detail'&&data.followup.id!==payload.followupId||query.op==='save'&&(data.followupId!==payload.followupId||data.revision!==payload.expectedRevision+1||data.followupVersion!==payload.expectedFollowupVersion))throw Error('SCOPE');}catch{throw Error('COORDINATION_RESPONSE_INVALID');}
  if(data.replayed)res.setHeader('Idempotency-Replayed','true');return res.status(query.op==='save'&&!data.replayed?201:200).json({ok:true,data});
 }catch(e){if(e instanceof FollowupInputError)return res.status(422).json({ok:false,code:'COORDINATION_INPUT_INVALID',error:e.message});
  const entry=Object.entries(ERRORS).find(([key])=>e?.message==='COORDINATION_'+key);if(entry)return res.status(entry[1][0]).json({ok:false,code:'COORDINATION_'+entry[0],error:entry[1][1]});
  const safe=legalSafeError(e);return res.status(safe.status).json({ok:false,code:safe.code,error:safe.message});}
};}
export default createLegalCoordinationHandler();
