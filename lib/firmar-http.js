// Same-origin pilot HTTP boundary. Private source/authority creation and official emission
// are deliberately absent. All user identity comes from the verified session adapter.
import {randomUUID} from 'node:crypto';
import {firmarDirectReadiness,FIRMAR_DIRECT_LIMITS,FirmarIntegrationError} from './firmar-direct-provider.js';
import {firmarActorContext,exactFirmarKeys,checkedFirmarAttempt,FirmarPersistenceError} from './firmar-durable-repository.js';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA=/^[a-f0-9]{64}$/;
const ORIGIN='https://municipio-junin-friendly.vercel.app';
const REQUEST_MAX=3072;
const PUBLIC_ERRORS=Object.freeze({
 FIRMAR_SESSION_INVALID:[401,'La sesión cambió. Volvé a ingresar para recuperar tu solicitud.'],
 FIRMAR_AUTHORITY_REQUIRED:[403,'Tu autorización para este documento no está vigente.'],
 FIRMAR_NOT_FOUND:[404,'No se encontró una solicitud disponible para tu cuenta.'],
 FIRMAR_ATTEMPT_NOT_FOUND:[404,'No hay un intento guardado para esta solicitud.'],
 FIRMAR_RETURN_EXPIRED:[410,'El retorno venció. Volvé a la solicitud para consultar su estado.'],
 FIRMAR_ATTEMPT_EXPIRED:[410,'El intento venció. Revisá la solicitud antes de continuar.'],
 FIRMAR_REQUEST_CANCELLED:[409,'La solicitud fue cancelada. No se vuelve a enviar el documento.'],
 FIRMAR_VERSION_CONFLICT:[409,'La versión revisada no coincide. Volvé a abrir el documento.'],
 FIRMAR_BUSY:[409,'La solicitud está siendo procesada. Consultá el intento guardado.'],
 FIRMAR_SUBMISSION_OUTCOME_UNKNOWN:[503,'No se pudo confirmar el envío. Recuperá el intento; no lo repitas.'],
 FIRMAR_RECEIPT_CONFLICT:[409,'El archivo recibido requiere revisión. Se conservó el original anterior.'],
 FIRMAR_SUBMISSION_CONFLICT:[409,'La respuesta requiere revisión. Se conservó el intento.'],
 FIRMAR_INPUT_INVALID:[400,'La solicitud no tiene el formato esperado.'],
 FIRMAR_CALLBACK_INVALID:[400,'La recepción no tiene el formato esperado.'],
 FIRMAR_QUARANTINE_FULL:[507,'La recepción requiere revisión de capacidad.'],
 FIRMAR_RATE_LIMITED:[429,'Esperá antes de volver a consultar. El documento permanece guardado.'],
 FIRMAR_ORIGIN_DENIED:[403,'La operación debe iniciarse desde MuniControl.'],
 FIRMAR_BODY_TOO_LARGE:[413,'El archivo o la solicitud supera el límite permitido.'],
 FIRMAR_BODY_TIMEOUT:[408,'No se recibió la solicitud completa. Consultá su estado antes de repetir.'],
 FIRMAR_CONTENT_TYPE:[415,'Se requiere JSON UTF-8 sin compresión.'],
 FIRMAR_HTTP_DISABLED:[503,'La firma integrada está pendiente de habilitación del piloto.'],
 FIRMAR_HTTP_UNAVAILABLE:[503,'No se pudo completar la consulta. Conservamos la solicitud.']
});
class HttpError extends Error{constructor(code){super(code);this.code=code;}}
const fail=code=>{throw new HttpError(code);};
export function firmarHttpHeaders(res,trace){
 res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('Pragma','no-cache');res.setHeader('Vary','Cookie, Origin');
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');res.setHeader('X-Request-Id',trace);
}
export function signingSessionContext(access){
 const t=access?.principal?.tenant,u=access?.principal?.user,s=access?.session;
 if(access?.mode!=='managed'||t?.source!=='membership'||!s||s.email!==u?.email)fail('FIRMAR_SESSION_INVALID');
 return firmarActorContext({actorEmail:u.email,actorSessionId:s.id,actorSessionVersion:s.version,membershipId:t.membershipId,tenantId:t.id});
}
function header(req,name){
 const found=Object.entries(req.headers||{}).filter(([k])=>k.toLowerCase()===name);
 if(found.length>1||found.some(([,v])=>typeof v!=='string')||Array.isArray(req.rawHeaders)&&req.rawHeaders.filter((v,i)=>i%2===0&&String(v).toLowerCase()===name).length>1)fail('FIRMAR_INPUT_INVALID');
 return found[0]?.[1]??'';
}
function query(req,path){
 if(typeof req.url!=='string'||req.url.length>512||!req.url.startsWith('/')||req.url.startsWith('//')||/[\x00-\x20\x7f#\\]/.test(req.url))fail('FIRMAR_INPUT_INVALID');
 const url=new URL(req.url,ORIGIN);if(url.pathname!==path)fail('FIRMAR_INPUT_INVALID');
 const entries=[...url.searchParams];if(new Set(entries.map(([k])=>k)).size!==entries.length)fail('FIRMAR_INPUT_INVALID');
 const q=Object.fromEntries(entries);
 if(req.query!==undefined&&(!exactFirmarKeys(req.query,Object.keys(q))||Object.keys(q).some(k=>req.query[k]!==q[k])))fail('FIRMAR_INPUT_INVALID');
 return q;
}
function interactiveOrigin(req){
 const origin=header(req,'origin'),site=header(req,'sec-fetch-site');
 if(header(req,'x-municontrol-intent')!=='signing-v1'||site&&site!=='same-origin'||origin&&origin!==ORIGIN||req.method==='POST'&&origin!==ORIGIN)fail('FIRMAR_ORIGIN_DENIED');
}
function jsonHeaders(req,max){
 if(!/^application\/json(?:;\s*charset=utf-8)?$/i.test(header(req,'content-type'))||header(req,'content-encoding'))fail('FIRMAR_CONTENT_TYPE');
 const length=header(req,'content-length'),te=header(req,'transfer-encoding');
 if(length&&(!/^(?:0|[1-9][0-9]*)$/.test(length)||!Number.isSafeInteger(Number(length)))||length&&te)fail('FIRMAR_INPUT_INVALID');
 if(length&&Number(length)>max)fail('FIRMAR_BODY_TOO_LARGE');
 return length===''?null:Number(length);
}
export async function readFirmarHttpJson(req,max,{bodyDeadlineMs=12000}={}){
 const expected=jsonHeaders(req,max);let bytes;
 if(req.body!==undefined){
  if(!Buffer.isBuffer(req.body)&&typeof req.body!=='string')fail('FIRMAR_INPUT_INVALID');
  bytes=Buffer.isBuffer(req.body)?req.body:Buffer.from(req.body,'utf8');if(bytes.length>max)fail('FIRMAR_BODY_TOO_LARGE');
 }else{
  if(!req[Symbol.asyncIterator])fail('FIRMAR_INPUT_INVALID');
  const iterator=req[Symbol.asyncIterator]();const chunks=[];let total=0,timeout,done=false;
  const deadline=new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new HttpError('FIRMAR_BODY_TIMEOUT')),bodyDeadlineMs);});
  try{for(;;){const r=await Promise.race([iterator.next(),deadline]);if(r.done){done=true;break;}if(!Buffer.isBuffer(r.value)&&!(r.value instanceof Uint8Array)&&typeof r.value!=='string')fail('FIRMAR_INPUT_INVALID');const b=Buffer.from(r.value);total+=b.length;if(total>max)fail('FIRMAR_BODY_TOO_LARGE');chunks.push(b);}bytes=Buffer.concat(chunks,total);}
  finally{clearTimeout(timeout);if(!done)void Promise.resolve(iterator.return?.()).catch(()=>{});}
 }
 if(expected!==null&&expected!==bytes.length)fail('FIRMAR_INPUT_INVALID');
 let data;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('FIRMAR_INPUT_INVALID');}
 if(!data||Array.isArray(data)||typeof data!=='object')fail('FIRMAR_INPUT_INVALID');return data;
}
function noGetBody(req){if(req.body!==undefined||header(req,'content-length')&&!/^0$/.test(header(req,'content-length'))||header(req,'transfer-encoding'))fail('FIRMAR_INPUT_INVALID');}
function validateCommand(method,q,body){
 let op=method==='GET'?q.operation:body.operation;
 const data=method==='GET'?q:body;
 const shapes={prepared:['operation','requestId'],recover:['operation','requestId'],status:['operation','requestId','attemptId'],begin:['operation','requestId','expectedVersion','sourceSha256'],return:['operation','state']};
 if(!Object.hasOwn(shapes,op)||!exactFirmarKeys(data,shapes[op])||method==='GET'&&!['prepared','recover','status'].includes(op)||method==='POST'&&!['begin','return'].includes(op))fail('FIRMAR_INPUT_INVALID');
 if(op!=='return'&&!UUID.test(data.requestId||'')||op==='status'&&!UUID.test(data.attemptId||'')||op==='begin'&&(!Number.isSafeInteger(data.expectedVersion)||data.expectedVersion<1||!SHA.test(data.sourceSha256||''))||op==='return'&&(typeof data.state!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(data.state)||Buffer.from(data.state,'base64url').toString('base64url')!==data.state))fail('FIRMAR_INPUT_INVALID');
 return op;
}
function sendError(res,error,trace,callback){
 let code=(error instanceof HttpError||error instanceof FirmarPersistenceError)?error.code:error instanceof FirmarIntegrationError&&error.code==='FIRMAR_CALLBACK_INVALID'?'FIRMAR_CALLBACK_INVALID':'FIRMAR_HTTP_UNAVAILABLE';
 if(!Object.hasOwn(PUBLIC_ERRORS,code))code='FIRMAR_HTTP_UNAVAILABLE';
 // Never allow this endpoint to enumerate attempts through callback state distinctions.
 if(callback&&['FIRMAR_NOT_FOUND','FIRMAR_AUTHORITY_REQUIRED','FIRMAR_REQUEST_CANCELLED','FIRMAR_ATTEMPT_EXPIRED'].includes(code))code='FIRMAR_CALLBACK_INVALID';
 const [status,message]=PUBLIC_ERRORS[code];if(status===429)res.setHeader('Retry-After','60');
 return res.status(status).json({ok:false,code,error:message,traceId:trace,safeToRetry:false,officialEmissionEnabled:false});
}
export function createFirmarHttpHandlers({env={},authorize,serviceFor,takeBudget,bodyDeadlineMs=12000}={}){
 if(![authorize,serviceFor,takeBudget].every(f=>typeof f==='function')||!Number.isInteger(bodyDeadlineMs)||bodyDeadlineMs<1||bodyDeadlineMs>15000)throw new TypeError('Session, service and persistent rate budget required');
 function pilot(){if(env.FIRMAR_HTTP_PILOT_ENABLED!=='true'||env.FIRMAR_ENVIRONMENT!=='test'||!firmarDirectReadiness(env).configured)fail('FIRMAR_HTTP_DISABLED');}
 async function budget(scope,key){const b=await takeBudget(scope,key);if(!b||typeof b.allowed!=='boolean')fail('FIRMAR_HTTP_UNAVAILABLE');if(!b.allowed)fail('FIRMAR_RATE_LIMITED');}
 return Object.freeze({
  async interactive(req,res){const trace=randomUUID();firmarHttpHeaders(res,trace);
   try{
    if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({ok:false,code:'METHOD_NOT_ALLOWED',officialEmissionEnabled:false});}
    pilot();const q=query(req,'/api/internal-firmar');interactiveOrigin(req);
    if(req.method==='GET')noGetBody(req);else {if(Object.keys(q).length)fail('FIRMAR_INPUT_INVALID');jsonHeaders(req,REQUEST_MAX);}
    const access=await authorize(req,res);if(!access)return;const context=signingSessionContext(access);
    if(context.tenantId!==env.FIRMAR_TENANT_ID)fail('FIRMAR_AUTHORITY_REQUIRED');
    await budget('interactive',context.tenantId+':'+context.membershipId);
    const input=req.method==='GET'?q:await readFirmarHttpJson(req,REQUEST_MAX,{bodyDeadlineMs});const operation=validateCommand(req.method,q,input);
    const service=await serviceFor();let data;
    if(operation==='begin')data=await service.begin({context,requestId:input.requestId,expectedVersion:input.expectedVersion,expectedSha256:input.sourceSha256});
    else if(operation==='return')data=await service.resolveReturn({context,state:input.state});
    else if(operation==='prepared')data=await service.prepared({context,requestId:input.requestId});
    else if(operation==='recover')data=await service.recover({context,requestId:input.requestId});
    else data=await service.status({context,requestId:input.requestId,attemptId:input.attemptId});
    if(operation==='prepared'){
     if(!exactFirmarKeys(data,['requestId','version','sourceVersionId','sourceSha256','bytes','officialEmissionEnabled'])||data.requestId!==input.requestId||!UUID.test(data.sourceVersionId||'')||!SHA.test(data.sourceSha256||'')||!Number.isSafeInteger(data.version)||data.version<1||!Number.isSafeInteger(data.bytes)||data.bytes<10||data.bytes>FIRMAR_DIRECT_LIMITS.pdfBytes||data.officialEmissionEnabled!==false)fail('FIRMAR_HTTP_UNAVAILABLE');
    }else if(operation==='return'){
     if(!exactFirmarKeys(data,['requestId','attemptId','state','officialEmissionEnabled'])||!UUID.test(data.requestId||'')||!UUID.test(data.attemptId||'')||data.state!=='return_bound'||data.officialEmissionEnabled!==false)fail('FIRMAR_HTTP_UNAVAILABLE');
    }else checkedFirmarAttempt(data,{requestId:input.requestId,...(input.attemptId?{attemptId:input.attemptId}:{})});
    // Browser disconnects never cause a second upload; persistence resolves the result.
    return res.status(200).json({ok:true,data});
   }catch(error){return sendError(res,error,trace,false);}
  },
  async callback(req,res){const trace=randomUUID();firmarHttpHeaders(res,trace);
   try{
    if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,code:'METHOD_NOT_ALLOWED',officialEmissionEnabled:false});}
    pilot();if(Object.keys(query(req,'/api/firmar-callback')).length||header(req,'origin')||header(req,'cookie')||header(req,'sec-fetch-site'))fail('FIRMAR_CALLBACK_INVALID');
    jsonHeaders(req,FIRMAR_DIRECT_LIMITS.callbackBytes);
    // A fixed tenant bucket bounds unauthenticated ingress without storing attacker-chosen IDs.
    await budget('callback',env.FIRMAR_TENANT_ID);
    const body=await readFirmarHttpJson(req,FIRMAR_DIRECT_LIMITS.callbackBytes,{bodyDeadlineMs});
    const data=await (await serviceFor()).receiveCallback(body);
    if(!['received_unverified','provider_reported_failure'].includes(data?.outcome)||data.providerAuthenticated!==false||data.cryptographicValidation!=='not_performed'||data.officialEmissionEnabled!==false)fail('FIRMAR_HTTP_UNAVAILABLE');
    // Do not echo content, correlating tokens, identity, file hash or internal receipt IDs.
    return res.status(201).json({ok:true,outcome:data.outcome,providerAuthenticated:false,cryptographicValidation:'not_performed',officialEmissionEnabled:false});
   }catch(error){return sendError(res,error,trace,true);}
  }
 });
}
