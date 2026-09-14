import {getActionCenterSql} from './internal-actions.js';
import {resolveInternalCertifiedDataContractSha,InternalCertifiedDataContractError} from '../lib/internal-certified-release.js';
import {AttendanceGatewayError} from '../lib/internal-attendance-gateway.js';
import {PM10_MAX_BODY,validatePm10Payload,pm10Hash,pm10Fail,receivePm10} from '../lib/internal-pm10-reception.js';
function header(req,k){const v=req?.headers?.[k];return typeof v==='string'?v:'';}
function send(res,s,x){res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');return res.status(s).json(x);}
export function createPm10Receiver({env=process.env,getSql=getActionCenterSql,receive=receivePm10}={}){return async(req,res)=>{
 try{
  if(req.method!=='POST'){res.setHeader('Allow','POST');return send(res,405,{ok:false,code:'METHOD_NOT_ALLOWED'});}
  const auth=header(req,'authorization');
  if(!/^Bearer [A-Za-z0-9_-]{43,128}$/.test(auth))pm10Fail('PM10_AUTH_DENIED',401);
  if(header(req,'origin')||Object.keys(req.query||{}).length)pm10Fail('PM10_CONTEXT_DENIED',403);
  if(header(req,'content-type').split(';')[0].trim()!=='application/json')pm10Fail('PM10_PAYLOAD_INVALID',415);
  const connector=header(req,'x-pm10-connector');if(!/^[a-z0-9][a-z0-9._-]{7,127}$/.test(connector))pm10Fail('PM10_AUTH_DENIED',401);
  const length=header(req,'content-length');if(length&&(!/^\d+$/.test(length)||Number(length)>PM10_MAX_BODY))pm10Fail('PM10_PAYLOAD_INVALID',413);
  let body=req.body;
  if(body===undefined&&req[Symbol.asyncIterator]){let n=0;const a=[];for await(const chunk of req){n+=Buffer.byteLength(chunk);if(n>PM10_MAX_BODY)pm10Fail('PM10_PAYLOAD_INVALID',413);a.push(Buffer.from(chunk));}body=Buffer.concat(a);}
  if(Buffer.isBuffer(body))body=body.toString('utf8');
  if(typeof body==='string'){if(Buffer.byteLength(body)>PM10_MAX_BODY)pm10Fail('PM10_PAYLOAD_INVALID',413);try{body=JSON.parse(body);}catch{pm10Fail('PM10_PAYLOAD_INVALID');}}
  if(body&&Buffer.byteLength(JSON.stringify(body))>PM10_MAX_BODY)pm10Fail('PM10_PAYLOAD_INVALID',413);
  validatePm10Payload(body);
  const release=resolveInternalCertifiedDataContractSha(env);
  const sql=await getSql(env);const result=await receive(sql,connector,pm10Hash(auth.slice(7)),body,release);
  return send(res,200,{ok:true,receipt:result});
 }catch(e){if(e instanceof AttendanceGatewayError)return send(res,e.status||400,{ok:false,code:e.code,error:e.message});
  const configuration=e instanceof InternalCertifiedDataContractError || /^ACTIONS_(?:DATABASE|RUNTIME|ROLE)/.test(String(e?.code||''));
  return send(res,503,{ok:false,code:configuration?'PM10_NOT_READY':'PM10_TEMPORARY_UNAVAILABLE',error:'Recepción no disponible; el colector debe conservar el lote'});}
};}
export default createPm10Receiver();
