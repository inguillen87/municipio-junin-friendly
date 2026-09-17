export const config={api:{bodyParser:false}};
import {getActionCenterSql} from './internal-actions.js';
import {resolveInternalCertifiedDataContractSha,InternalCertifiedDataContractError} from '../lib/internal-certified-release.js';
import {AttendanceGatewayError} from '../lib/internal-attendance-gateway.js';
import {ZK40_MAX_BODY,validateZk40Payload,zk40Hash,zk40Fail,receiveZk40} from '../lib/internal-zk40-reception.js';
function header(req,k){const matches=Object.entries(req.headers||{}).filter(([name])=>name.toLowerCase()===k);if(matches.length>1||matches.some(([,v])=>typeof v!=='string')||Array.isArray(req.rawHeaders)&&req.rawHeaders.filter((v,i)=>i%2===0&&String(v).toLowerCase()===k).length>1)zk40Fail('ZK40_PAYLOAD_INVALID');return matches[0]?.[1]||'';}
function send(res,s,x){res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');return res.status(s).json(x);}
export function createZk40Receiver({env=process.env,getSql=getActionCenterSql,receive=receiveZk40}={}){return async(req,res)=>{
 try{
  if(req.method!=='POST'){res.setHeader('Allow','POST');return send(res,405,{ok:false,code:'METHOD_NOT_ALLOWED'});}
  const auth=header(req,'authorization');
  if(!/^Bearer [A-Za-z0-9_-]{43,128}$/.test(auth))zk40Fail('ZK40_AUTH_DENIED',401);
  if(header(req,'origin')||Object.keys(req.query||{}).length)zk40Fail('ZK40_CONTEXT_DENIED',403);
  if(header(req,'content-type').split(';')[0].trim()!=='application/json')zk40Fail('ZK40_PAYLOAD_INVALID',415);
  const connector=header(req,'x-clock-connector');if(!/^[a-z0-9][a-z0-9._-]{7,127}$/.test(connector))zk40Fail('ZK40_AUTH_DENIED',401);
  const length=header(req,'content-length');if(length&&(!/^\d+$/.test(length)||Number(length)>ZK40_MAX_BODY))zk40Fail('ZK40_PAYLOAD_INVALID',413);
  let body=req.body;
  if(body===undefined&&req[Symbol.asyncIterator]){let n=0;const a=[];for await(const chunk of req){n+=Buffer.byteLength(chunk);if(n>ZK40_MAX_BODY)zk40Fail('ZK40_PAYLOAD_INVALID',413);a.push(Buffer.from(chunk));}body=Buffer.concat(a);}
  if(Buffer.isBuffer(body))body=body.toString('utf8');
  if(typeof body==='string'){if(Buffer.byteLength(body)>ZK40_MAX_BODY)zk40Fail('ZK40_PAYLOAD_INVALID',413);try{body=JSON.parse(body);}catch{zk40Fail('ZK40_PAYLOAD_INVALID');}}
  if(body&&Buffer.byteLength(JSON.stringify(body))>ZK40_MAX_BODY)zk40Fail('ZK40_PAYLOAD_INVALID',413);
  validateZk40Payload(body);
  const release=resolveInternalCertifiedDataContractSha(env);
  const sql=await getSql(env);const result=await receive(sql,connector,zk40Hash(auth.slice(7)),body,release);
  return send(res,200,{ok:true,receipt:result});
 }catch(e){if(e instanceof AttendanceGatewayError)return send(res,e.status||400,{ok:false,code:e.code,error:e.message});
  const configuration=e instanceof InternalCertifiedDataContractError || /^ACTIONS_(?:DATABASE|RUNTIME|ROLE)/.test(String(e?.code||''));
  return send(res,503,{ok:false,code:configuration?'ZK40_NOT_READY':'ZK40_TEMPORARY_UNAVAILABLE',error:'Recepción no disponible; el colector debe conservar el lote'});}
};}
export default createZk40Receiver();
