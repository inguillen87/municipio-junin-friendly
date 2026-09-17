import {normalizeWorkspaceQuery,checkWorkspaceData,sourceSelection,FIRMAR_PDF_LIMIT,exact} from './firmar-workspace-model.js';
const errorText={FIRMAR_SESSION_INVALID:'Tu sesión cambió. Volvé a ingresar.',FIRMAR_AUTHORITY_REQUIRED:'No tenés autorización vigente para este documento.',FIRMAR_NOT_FOUND:'El documento ya no está disponible para tu cuenta.',FIRMAR_REQUEST_CANCELLED:'La solicitud fue cancelada. Volvé a la bandeja.',FIRMAR_VERSION_CONFLICT:'Cambió la versión. Actualizá la bandeja antes de continuar.',FIRMAR_BUSY:'La solicitud está siendo actualizada. Volvé a consultar.',FIRMAR_RATE_LIMITED:'Esperá un momento antes de volver a consultar.',FIRMAR_WORKSPACE_DISABLED:'El portafirmas está pendiente de habilitación del piloto.'};
export class FirmarWorkspaceClientError extends Error{constructor(code,status=0){super(errorText[code]||'No se pudo comprobar el documento. Volvé a consultar sin reenviar una firma.');this.name='FirmarWorkspaceClientError';this.code=code;this.status=status;this.safeToRetry=false;}}
const invalid=()=>{throw new FirmarWorkspaceClientError('FIRMAR_WORKSPACE_RESPONSE_INVALID');};
export function createFirmarWorkspaceClient({fetchImpl=fetch,digest=bytes=>crypto.subtle.digest('SHA-256',bytes)}={}){
 async function bytes(response,max,signal){if(!response.body)invalid();const reader=response.body.getReader(),chunks=[];let total=0,complete=false;
  try{for(;;){const r=await reader.read();if(signal?.aborted)throw new DOMException('Cancelado','AbortError');if(r.done){complete=true;break;}total+=r.value.byteLength;if(total>max)invalid();chunks.push(r.value);}const out=new Uint8Array(total);let at=0;for(const c of chunks){out.set(c,at);at+=c.length;}return out;}
  finally{if(!complete)await reader.cancel().catch(()=>{});reader.releaseLock();}
 }
 async function call(query,signal){
  const deadline=AbortSignal.timeout(30000),combined=signal?AbortSignal.any([signal,deadline]):deadline;let r;
  try{r=await fetchImpl('/api/internal-firmar-workspace?'+new URLSearchParams(query),{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',headers:{Accept:query.operation==='source'?'application/pdf':'application/json','X-MuniControl-Intent':'signing-v1'},signal:combined});}
  catch{if(signal?.aborted)throw new DOMException('Cancelado','AbortError');throw new FirmarWorkspaceClientError('FIRMAR_WORKSPACE_UNAVAILABLE');}
  if(signal?.aborted){void r.body?.cancel().catch(()=>{});throw new DOMException('Cancelado','AbortError');}
  if(r.redirected){void r.body?.cancel().catch(()=>{});invalid();}
  if(!r.ok){let raw;try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await bytes(r,8192,combined)));}catch(e){if(e.name==='AbortError')throw e;invalid();}const code=Object.hasOwn(errorText,raw?.code)?raw.code:r.status===401?'FIRMAR_SESSION_INVALID':r.status===403?'FIRMAR_AUTHORITY_REQUIRED':'FIRMAR_WORKSPACE_UNAVAILABLE';throw new FirmarWorkspaceClientError(code,r.status);}
  if(r.status!==200||!/\bno-store\b/.test(r.headers.get('cache-control')||'')){void r.body?.cancel().catch(()=>{});invalid();}return{r,signal:combined};
 }
 return Object.freeze({
  async list(query,{signal}={}){const q=normalizeWorkspaceQuery(query),res=await call({operation:'list',...q},signal);if(!/^application\/json(?:;|$)/i.test(res.r.headers.get('content-type')||''))invalid();const raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await bytes(res.r,65536,res.signal)));if(!exact(raw,['ok','data'])||raw.ok!==true)invalid();try{return checkWorkspaceData(raw.data,q);}catch{invalid();}},
  async source(selection,{signal}={}){sourceSelection(selection);const res=await call({operation:'source',...selection},signal),r=res.r;
   if(r.headers.get('content-type')!=='application/pdf'||r.headers.get('x-municontrol-source-sha256')!==selection.sha256||r.headers.get('x-municontrol-source-version')!==String(selection.version)||r.headers.get('x-municontrol-request-id')!==selection.requestId)invalid();
   const length=Number(r.headers.get('content-length'));if(!Number.isSafeInteger(length)||length<10||length>FIRMAR_PDF_LIMIT)invalid();
   const data=await bytes(r,FIRMAR_PDF_LIMIT,res.signal);if(data.length!==length||!/^%PDF-(?:1\.[0-9]|2\.0)/.test(new TextDecoder('ascii').decode(data.subarray(0,8))))invalid();
   const sha=[...new Uint8Array(await digest(data))].map(x=>x.toString(16).padStart(2,'0')).join('');if(res.signal.aborted)throw new DOMException('Cancelado','AbortError');if(sha!==selection.sha256)invalid();return data;
  }
 });
}
