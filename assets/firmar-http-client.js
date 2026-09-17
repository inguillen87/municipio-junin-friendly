// First-party transport for the journey. No provider URLs, files, CUIL, PIN or secrets
// are accepted as inputs here. Context is re-derived from the live server session.
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA=/^[a-f0-9]{64}$/;
const STATES=new Set(['awaiting_authorization','awaiting_receipt','outcome_unknown','received_unverified','expired','cancelled']);
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k));
const MESSAGES={
 FIRMAR_BUSY:'La solicitud está siendo procesada. Reintentá la consulta sin volver a firmar.',
 FIRMAR_SESSION_INVALID:'Tu sesión cambió. Volvé a ingresar.',FIRMAR_AUTHORITY_REQUIRED:'No tenés autorización vigente para este documento.',
 FIRMAR_ATTEMPT_NOT_FOUND:'La solicitud todavía no tiene un intento guardado.',FIRMAR_NOT_FOUND:'No se encontró una solicitud disponible para tu cuenta.',
 FIRMAR_HTTP_DISABLED:'La integración está pendiente de habilitación del piloto.',FIRMAR_VERSION_CONFLICT:'Cambió la versión revisada. Volvé a abrir el documento.',
 FIRMAR_RATE_LIMITED:'Esperá antes de actualizar. La solicitud permanece guardada.',FIRMAR_RECEIPT_CONFLICT:'El documento recibido requiere revisión.',
 FIRMAR_RETURN_EXPIRED:'El retorno venció. Volvé a la solicitud.',FIRMAR_ATTEMPT_EXPIRED:'El intento venció.',FIRMAR_REQUEST_CANCELLED:'La solicitud está cancelada.',
 FIRMAR_SUBMISSION_OUTCOME_UNKNOWN:'Confirmación pendiente. Recuperá el intento guardado sin repetir el envío.'
};
export class FirmarHttpClientError extends Error{constructor(code,status=0){super(MESSAGES[code]||'No se pudo confirmar la operación. Conservá la solicitud y consultá su estado.');this.name='FirmarHttpClientError';this.code=code;this.status=status;this.safeToRetry=false;}}
const invalid=()=>{throw new FirmarHttpClientError('FIRMAR_RESPONSE_INVALID');};
function identifier(id){if(!UUID.test(id||''))invalid();return id;}
function attempt(r,expected){
 if(!exact(r,['requestId','attemptId','expiresAt','state','authorizationUrl','officialEmissionEnabled'])||r.requestId!==expected.requestId||!UUID.test(r.attemptId||'')||expected.attemptId&&r.attemptId!==expected.attemptId||typeof r.expiresAt!=='string'||!Number.isFinite(Date.parse(r.expiresAt))||!STATES.has(r.state)||r.officialEmissionEnabled!==false)invalid();
 if(r.authorizationUrl!==null){
  if(typeof r.authorizationUrl!=='string'||r.authorizationUrl.length>400||/[\x00-\x20\x7f\\%?#]/.test(r.authorizationUrl)||r.state!=='awaiting_authorization')invalid();
  let u;try{u=new URL(r.authorizationUrl);}catch{invalid();}
  if(u.origin!=='https://tst.firmar.gob.ar'||u.username||u.password||!/^\/(firmador\/)?api\/signatures\/[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}\/?$/i.test(u.pathname))invalid();
 }else if(r.state==='awaiting_authorization')invalid();
 return Object.freeze({...r});
}
export function createFirmarHttpClient({fetchImpl=fetch}={}){
 async function request(method,input,signal){
  let response;try{response=await fetchImpl('/api/internal-firmar'+(method==='GET'?'?'+new URLSearchParams(input):''),{
   method,credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',
   headers:{Accept:'application/json','X-MuniControl-Intent':'signing-v1',...(method==='POST'?{'Content-Type':'application/json'}:{})},
   ...(method==='POST'?{body:JSON.stringify(input)}:{}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(40000)]):AbortSignal.timeout(40000)
  });}catch{if(signal?.aborted)throw new DOMException('Operación cancelada','AbortError');throw new FirmarHttpClientError('FIRMAR_SUBMISSION_OUTCOME_UNKNOWN');}
  if(signal?.aborted){void response.body?.cancel().catch(()=>{});throw new DOMException('Operación cancelada','AbortError');}
  if(response.redirected||!/^application\/json(?:;|$)/i.test(response.headers.get('content-type')||'')||!response.body){void response.body?.cancel().catch(()=>{});invalid();}
  const reader=response.body.getReader();const chunks=[];let total=0,raw;
  try{for(;;){const r=await reader.read();if(signal?.aborted)throw new DOMException('Operación cancelada','AbortError');if(r.done)break;total+=r.value.byteLength;if(total>8192){await reader.cancel();invalid();}chunks.push(r.value);}const data=new Uint8Array(total);let at=0;for(const c of chunks){data.set(c,at);at+=c.byteLength;}raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(data));}
  catch(error){if(error.name==='AbortError')throw error;invalid();}finally{reader.releaseLock();}
  if(!response.ok){const code=typeof raw?.code==='string'&&Object.hasOwn(MESSAGES,raw.code)?raw.code:[401,403].includes(response.status)?(response.status===401?'FIRMAR_SESSION_INVALID':'FIRMAR_AUTHORITY_REQUIRED'):'FIRMAR_HTTP_UNAVAILABLE';const error=new FirmarHttpClientError(code,response.status);if(response.status===429){const seconds=Number(response.headers.get('retry-after'));error.retryAfterSeconds=Number.isInteger(seconds)&&seconds>0&&seconds<=300?seconds:60;}throw error;}
  if(!exact(raw,['ok','data'])||raw.ok!==true||response.status!==200)invalid();return raw.data;
 }
 return Object.freeze({
  async prepared({requestId,signal}){identifier(requestId);const r=await request('GET',{operation:'prepared',requestId},signal);if(!exact(r,['requestId','version','sourceVersionId','sourceSha256','bytes','officialEmissionEnabled'])||r.requestId!==requestId||!UUID.test(r.sourceVersionId||'')||!SHA.test(r.sourceSha256||'')||!Number.isSafeInteger(r.version)||r.version<1||!Number.isSafeInteger(r.bytes)||r.bytes<10||r.bytes>2097152||r.officialEmissionEnabled!==false)invalid();return Object.freeze({...r});},
  async begin({requestId,expectedVersion,sourceSha256,signal}){identifier(requestId);if(!Number.isSafeInteger(expectedVersion)||expectedVersion<1||!SHA.test(sourceSha256||''))invalid();return attempt(await request('POST',{operation:'begin',requestId,expectedVersion,sourceSha256},signal),{requestId});},
  async readStatus({requestId,attemptId,signal}){identifier(requestId);identifier(attemptId);return attempt(await request('GET',{operation:'status',requestId,attemptId},signal),{requestId,attemptId});},
  async recoverAttempt({requestId,signal}){identifier(requestId);return attempt(await request('GET',{operation:'recover',requestId},signal),{requestId});},
  async resolveReturn({state,signal}){if(typeof state!=='string'||!/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(state))invalid();const r=await request('POST',{operation:'return',state},signal);if(!exact(r,['requestId','attemptId','state','officialEmissionEnabled'])||!UUID.test(r.requestId||'')||!UUID.test(r.attemptId||'')||r.state!=='return_bound'||r.officialEmissionEnabled!==false)invalid();return Object.freeze({...r});},
 });
}
/** Bind a prepared source once: stale props cannot silently sign another request/version. */
export function bindFirmarDocument(client,document){
 identifier(document?.id);if(!Number.isSafeInteger(document.version)||document.version<1||!SHA.test(document.sha256||''))invalid();
 const {id,version,sha256}=document;const same=args=>{if(args.requestId!==id)invalid();};
 return Object.freeze({
  async confirmPrepared(signal){const r=await client.prepared({requestId:id,signal});if(r.version!==version||r.sourceSha256!==sha256)throw new FirmarHttpClientError('FIRMAR_VERSION_CONFLICT',409);return r;},
  begin:args=>{same(args);if(args.expectedVersion!==version)invalid();return client.begin({...args,sourceSha256:sha256});},
  readStatus:args=>{same(args);return client.readStatus(args);},
  recoverAttempt:args=>{same(args);return client.recoverAttempt(args);}
 });
}
