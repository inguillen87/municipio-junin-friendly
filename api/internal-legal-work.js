import {createHash} from 'node:crypto';
import {requireCompatibleInternalAccess} from '../lib/internal-access-gateway.js';
import {SchoolCertificateError} from '../lib/internal-family-certificates.js';
import {getActionCenterSql} from './internal-actions.js';
import {principalHasCapabilities} from '../lib/internal-resource-access.js';
import {schoolCertificateHttp} from './internal-family-certificates.js';
import {workOperation,workContext,workSafeError,LegalWorkError} from '../lib/internal-legal-work.js';
import {exactKeys,workUuid,WORK_LIMITS,strictWorkJson} from '../assets/legal-work-model.js';
export const config={api:{bodyParser:false}};
const invalid=()=>{throw new LegalWorkError('LW_INPUT_INVALID',400,'La solicitud no tiene el formato esperado.');};
function query(req){const q=req.query||{},u=new URL(req.url||'','https://local.invalid'),raw=[...u.searchParams];if(raw.length!==Object.keys(q).length||new Set(raw.map(([k])=>k)).size!==raw.length||raw.some(([k,v])=>q[k]!==v))invalid();
 if(req.method==='POST'){if(raw.length)invalid();return{op:'save',d:{}};}
 const op=q.resource,allowed={bootstrap:['resource'],list:['resource','q','status','mine','page'],detail:['resource','id'],attempt:['resource','key']}[op];if(!allowed||!exactKeys(q,allowed))invalid();
 if(op==='list'){if(!['true','false'].includes(q.mine)||!/^[1-9][0-9]{0,3}$/.test(q.page))invalid();return{op,d:{q:q.q,status:q.status,mine:q.mine==='true',page:Number(q.page)}};}
 if(op==='detail')return{op,d:{id:q.id}};return{op,d:{},key:q.key};}
export async function readWorkBody(req){schoolCertificateHttp.checkLength(req,WORK_LIMITS.body);let raw=req.body;if(raw===undefined){let size=0;const parts=[];for await(const chunk of req){size+=Buffer.byteLength(chunk);if(size>WORK_LIMITS.body)throw new LegalWorkError('LW_TOO_LARGE',413,'La actuación supera el límite.');parts.push(Buffer.from(chunk));}raw=Buffer.concat(parts);}
 if(Buffer.isBuffer(raw))raw=raw.toString('utf8');if(typeof raw==='string'){if(Buffer.byteLength(raw)>WORK_LIMITS.body)invalid();try{raw=strictWorkJson(raw);}catch{invalid();};}if(!raw||Buffer.byteLength(JSON.stringify(raw))>WORK_LIMITS.body)invalid();return raw;}
export function createLegalWorkHandler(deps={}){const env=deps.env??process.env;return async(req,res)=>{
 schoolCertificateHttp.headers(res);res.setHeader('Vary','Cookie, Origin');
 try{
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({ok:false,code:'METHOD_NOT_ALLOWED'});}
  if(schoolCertificateHttp.header(req,'x-municontrol-intent')!=='legal-work-v1')invalid();const {op,d,key}=query(req);
  if(req.method==='POST'){schoolCertificateHttp.assertOrigin(req,env);if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(schoolCertificateHttp.header(req,'content-type')))throw new LegalWorkError('LW_CONTENT_TYPE',415,'Se requiere JSON.');schoolCertificateHttp.checkLength(req,WORK_LIMITS.body);}
  const writing=['save','attempt'].includes(op),caps=['legal.norm.read',...(writing?['legal.norm.register']:[])];
  const access=await(deps.authorize??requireCompatibleInternalAccess)(req,res,{env,requiredCapabilities:caps,capabilityMode:'all',allowLegacy:false,requireDataPlaneReady:false,requireCertifiedDataBinding:false});if(!access)return;
  if(access.mode!=='managed'||!principalHasCapabilities(access.principal,caps))throw workSafeError(Error('LW_FORBIDDEN'));
  const ctx=workContext(access.principal,access.session),scope=createHash('sha256').update(JSON.stringify(ctx)).digest('hex');
  if(op!=='bootstrap'&&schoolCertificateHttp.header(req,'x-legal-work-scope')!==scope)throw workSafeError(Error('LW_SESSION_INVALID'));
  const attempt=op==='save'?schoolCertificateHttp.header(req,'idempotency-key'):key;
  if(writing&&!workUuid(attempt))invalid();
  const data=await workOperation(await(deps.getSql??getActionCenterSql)(env),access.principal,access.session,op,op==='save'?await readWorkBody(req):d,attempt??null);
  if(op==='bootstrap')data.scope=scope;if(data.replayed)res.setHeader('Idempotency-Replayed','true');return res.status(op==='save'&&!data.replayed?201:200).json({ok:true,data});
 }catch(e){if(e instanceof SchoolCertificateError){const map={BODY_INVALID:['LW_INPUT_INVALID',400],BODY_TOO_LARGE:['LW_TOO_LARGE',413],ORIGIN_INVALID:['LW_FORBIDDEN',403]};const hit=map[e.code];if(hit)e=new LegalWorkError(hit[0],hit[1],hit[1]===413?'La solicitud supera el límite.':'Solicitud no permitida o inválida.');}const error=workSafeError(e);return res.status(error.status).json({ok:false,code:error.code,error:error.message});}
};}
export default createLegalWorkHandler();
