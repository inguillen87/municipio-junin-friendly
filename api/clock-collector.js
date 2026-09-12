import {getActionCenterSql} from './internal-actions.js';
import {resolveInternalCertifiedDataContractSha} from '../lib/internal-certified-release.js';
import {validateCollectorRequest,validateCollectorReceipt,sha256,BODY_LIMIT} from '../lib/clock-collector-contract.js';
function send(res,status,data){res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");return res.status(status).json(data);}
export function createClockCollectorHandler({getSql=getActionCenterSql,env=process.env,release=resolveInternalCertifiedDataContractSha}={}){
 return async(req,res)=>{
  if(req.method!=='POST'){res.setHeader('Allow','POST');return send(res,405,{ok:false,code:'METHOD_NOT_ALLOWED'});}
  const auth=String(req.headers?.authorization||'');
  if(req.headers?.origin||!/^Bearer [A-Za-z0-9._~-]{32,512}$/.test(auth))return send(res,401,{ok:false,code:'COLLECTOR_AUTH_REQUIRED'});
  if(String(req.headers?.['content-type']||'').split(';')[0]!=='application/json')return send(res,415,{ok:false,code:'CONTENT_TYPE_REQUIRED'});
  try{
   let body=req.body;
   if(Number(req.headers?.['content-length']||0)>BODY_LIMIT)return send(res,413,{ok:false,code:'BODY_TOO_LARGE'});
   if(body===undefined&&req[Symbol.asyncIterator]){const chunks=[];let n=0;for await(const c of req){const b=Buffer.from(c);n+=b.length;if(n>BODY_LIMIT)return send(res,413,{ok:false,code:'BODY_TOO_LARGE'});chunks.push(b);}body=Buffer.concat(chunks);}
   if(Buffer.isBuffer(body))body=body.toString('utf8');
   // A canonical wire encoding is enforced, so receipt hashes have one meaning.
   if(typeof body==='string'){if(Buffer.byteLength(body)>BODY_LIMIT)return send(res,413,{ok:false,code:'BODY_TOO_LARGE'});body=JSON.parse(body);}
   validateCollectorRequest(body);const text=JSON.stringify(body);
   const releaseSha=release(env),sql=await getSql(env);
   const rows=await sql.query('SELECT public.attendance_collector_receive_v1($1::text,$2::text,$3::text) AS result',[sha256(auth.slice(7)),text,releaseSha]);
   const receipt=validateCollectorReceipt((Array.isArray(rows)?rows:rows?.rows)?.[0]?.result,text);
   return send(res,receipt.replayed?200:202,{ok:true,receipt});
  }catch(e){
   const code=String(e?.code||''),msg=String(e?.message||'');
   const known=['COLLECTOR_AUTH_REQUIRED','COLLECTOR_NOT_ENABLED','COLLECTOR_DEVICE_MISMATCH','COLLECTOR_SOURCE_NOT_READY','COLLECTOR_REPLAY_CONFLICT','COLLECTOR_IDENTITY_KEY_REQUIRED'];
   const found=known.find(k=>msg.includes(k));
   if(msg.includes('COLLECTOR_RATE_LIMIT'))return send(res,429,{ok:false,code:'COLLECTOR_RATE_LIMIT'});
   if(found)return send(res,found==='COLLECTOR_AUTH_REQUIRED'?401:found==='COLLECTOR_REPLAY_CONFLICT'?409:403,{ok:false,code:found});
   if(code==='COLLECTOR_INVALID'||e instanceof SyntaxError||msg==='COLLECTOR_INVALID')return send(res,400,{ok:false,code:'COLLECTOR_INVALID'});
   // Never disclose a SQL value, source record or credential in errors/logs.
   return send(res,503,{ok:false,code:'COLLECTOR_RECEIVER_UNAVAILABLE'});
  }
 };
}
export default createClockCollectorHandler();
