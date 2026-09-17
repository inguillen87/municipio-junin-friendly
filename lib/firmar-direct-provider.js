// Server-only PFDR transport, based on SIU's published FirmAR integration contract.
// No HTTP route imports this module until enrollment, persistence and validation are ready.
import {createHash, randomBytes} from 'node:crypto';

const HOSTS = Object.freeze({test:'https://tst.firmar.gob.ar', production:'https://firmar.gob.ar'});
const MAX_PDF = 2 * 1024 * 1024;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const safeText = v => typeof v === 'string' && v.length >= 3 && v.length <= 180 && !/[\x00-\x1f\x7f]/.test(v);
const hash = v => createHash('sha256').update(v).digest('hex');
const exact = (v, keys) => v && typeof v === 'object' && !Array.isArray(v)
  && Object.keys(v).length === keys.length && Object.keys(v).every(k=>keys.includes(k));
const validToken = v => typeof v === 'string' && TOKEN.test(v)
  && Buffer.from(v,'base64url').length === 32 && Buffer.from(v,'base64url').toString('base64url') === v;

export class FirmarIntegrationError extends Error {
  constructor(code, stage) { super(code); this.name='FirmarIntegrationError'; this.code=code; this.stage=stage; }
}
const fail = (code, stage='preflight') => { throw new FirmarIntegrationError(code,stage); };
export const FIRMAR_DIRECT_LIMITS = Object.freeze({pdfBytes:MAX_PDF, callbackBytes:3*1024*1024, attemptMinutes:30});

// This only checks format/check digit. The caller must resolve CUIL from a verified
// municipal signing identity, never from a browser-supplied name, email or employee match.
export function validSigningCuil(value) {
  if (typeof value !== 'string' || !/^(20|23|24|27|30|33|34)[0-9]{9}$/.test(value)) return false;
  const sum=[5,4,3,2,7,6,5,4,3,2].reduce((s,w,i)=>s+w*Number(value[i]),0);
  const raw=11-sum%11, digit=raw===11?0:raw===10?9:raw;
  return Number(value[10])===digit;
}
function appOrigin(value) {
  let url;try{url=new URL(value);}catch{fail('FIRMAR_CONFIGURATION_REQUIRED');}
  if (url.origin!=='https://municipio-junin-friendly.vercel.app' || url.href!==url.origin+'/') fail('FIRMAR_CONFIGURATION_REQUIRED');
  return url.origin;
}
export function firmarDirectReadiness(env={}) {
  // Expose only readiness categories, never credential values or sensitive references.
  const missing=[];
  if (!Object.hasOwn(HOSTS,env.FIRMAR_ENVIRONMENT)) missing.push('environment');
  if (!safeText(env.FIRMAR_INTEGRATION_APPROVAL_REF)) missing.push('institutional_enrollment');
  if (typeof env.FIRMAR_API_USER!=='string'||!env.FIRMAR_API_USER||/[:\x00-\x1f\x7f]/.test(env.FIRMAR_API_USER)||env.FIRMAR_API_USER.length>256) missing.push('api_user');
  if (typeof env.FIRMAR_API_SECRET!=='string'||!env.FIRMAR_API_SECRET||/[\x00-\x1f\x7f]/.test(env.FIRMAR_API_SECRET)||env.FIRMAR_API_SECRET.length>512) missing.push('api_secret');
  if (!UUID.test(env.FIRMAR_TENANT_ID||'')) missing.push('tenant_binding');
  if (!['pfdr-v13-object','siu-array-single'].includes(env.FIRMAR_CALLBACK_PROFILE)) missing.push('callback_contract');
  try {appOrigin(env.FIRMAR_APP_ORIGIN);}catch{missing.push('application_origin');}
  if (env.FIRMAR_CALLBACK_REGISTERED!=='true') missing.push('registered_callback');
  if (env.FIRMAR_DIRECT_ENABLED!=='true') missing.push('activation');
  return Object.freeze({provider:'firmar',configured:missing.length===0,missing:Object.freeze(missing),
    pdfOnly:true,documentsPerOperation:1,institutionalAuthorizationVerified:false,
    cryptographicValidation:'not_performed',officialEmissionEnabled:false});
}
function configuration(env) {
  if (!firmarDirectReadiness(env).configured) fail('FIRMAR_CONFIGURATION_REQUIRED');
  return Object.freeze({origin:HOSTS[env.FIRMAR_ENVIRONMENT],tenantId:env.FIRMAR_TENANT_ID,
    appOrigin:appOrigin(env.FIRMAR_APP_ORIGIN),user:env.FIRMAR_API_USER,secret:env.FIRMAR_API_SECRET,
    callbackProfile:env.FIRMAR_CALLBACK_PROFILE});
}
export function prepareFirmarBinding({tenantId,requestId,sourceSha256,signerCuil}, {now=()=>Date.now(),random=randomBytes}={}) {
  if (!UUID.test(tenantId||'')||!UUID.test(requestId||'')||!SHA.test(sourceSha256||'')||!validSigningCuil(signerCuil)) fail('FIRMAR_INPUT_INVALID');
  const callbackToken=random(32).toString('base64url'), returnState=random(32).toString('base64url');
  if (!validToken(callbackToken)||!validToken(returnState)||callbackToken===returnState) fail('FIRMAR_RANDOM_FAILURE');
  const created=now();if(!Number.isSafeInteger(created))fail('FIRMAR_INPUT_INVALID');
  return Object.freeze({tenantId,requestId,sourceSha256,signerCuil,callbackToken,callbackTokenSha256:hash(callbackToken),
    returnState,returnStateSha256:hash(returnState),expiresAt:new Date(created+30*60000).toISOString()});
}
function validateBinding(binding,cfg,now) {
  const fields=['tenantId','requestId','sourceSha256','signerCuil','callbackToken','callbackTokenSha256','returnState','returnStateSha256','expiresAt'];
  if (!exact(binding,fields)||binding.tenantId!==cfg.tenantId||!UUID.test(binding.requestId)||!SHA.test(binding.sourceSha256)
      ||!validSigningCuil(binding.signerCuil)||!validToken(binding.callbackToken)||!validToken(binding.returnState)
      ||binding.callbackToken===binding.returnState||hash(binding.callbackToken)!==binding.callbackTokenSha256
      ||hash(binding.returnState)!==binding.returnStateSha256) fail('FIRMAR_BINDING_INVALID');
  const expiry=Date.parse(binding.expiresAt);
  if (!Number.isFinite(expiry)||expiry<=now||expiry>now+30*60000) fail('FIRMAR_ATTEMPT_EXPIRED');
}
function pdfBytes(bytes) {
  if (!Buffer.isBuffer(bytes)||bytes.length<8||bytes.length>MAX_PDF||!/^%PDF-1\.[0-9]|^%PDF-2\.0/.test(bytes.subarray(0,8).toString('ascii'))) fail('FIRMAR_PDF_INVALID');
  // This is an envelope check, not a PDF security/parser validation or signature verification.
  return bytes;
}
export function firmarAuthorizationUrl(location,origin) {
  if (!Object.values(HOSTS).includes(origin)||typeof location!=='string'||location.length>400
      ||/[\x00-\x20\x7f\\%?#]/.test(location)||location.startsWith('//')) fail('FIRMAR_AUTHORIZATION_URL_INVALID','submit');
  let url;try{url=new URL(location,origin+'/firmador/');}catch{fail('FIRMAR_AUTHORIZATION_URL_INVALID','submit');}
  if(url.origin!==origin||url.username||url.password||url.search||url.hash
     ||!/^\/(?:firmador\/)?api\/signatures\/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}\/?$/i.test(url.pathname)) fail('FIRMAR_AUTHORIZATION_URL_INVALID','submit');
  return url.href;
}
async function boundedJson(response,max,stage) {
  if(!response.body||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||''))fail('FIRMAR_PROVIDER_RESPONSE_INVALID',stage);
  const length=response.headers.get('content-length');if(length&&(!/^\d+$/.test(length)||Number(length)>max))fail('FIRMAR_PROVIDER_RESPONSE_INVALID',stage);
  const reader=response.body.getReader();const chunks=[];let size=0;
  try{for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;
    if(size>max){await reader.cancel();fail('FIRMAR_PROVIDER_RESPONSE_INVALID',stage);}chunks.push(Buffer.from(r.value));}
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }catch(e){if(e instanceof FirmarIntegrationError)throw e;fail('FIRMAR_PROVIDER_RESPONSE_INVALID',stage);}
  finally{reader.releaseLock();}
}
async function discard(response) { try {await response.body?.cancel();} catch {/* Do not log remote response bodies. */} }

// Called ONLY AFTER an authorized, persistent request reserves the binding atomically.
// No automatic retry after upload: a lost response can mean the request was created.
export async function submitFirmarPdf({binding,pdf,sourceValidation,consent},{env={},fetchImpl=fetch,now=()=>Date.now(),signal}={}) {
  const cfg=configuration(env);validateBinding(binding,cfg,now());pdfBytes(pdf);
  if(sourceValidation?.validated!==true||sourceValidation.sha256!==binding.sourceSha256||hash(pdf)!==binding.sourceSha256
     ||consent?.approved!==true||consent.requestId!==binding.requestId||consent.sha256!==binding.sourceSha256) fail('FIRMAR_APPROVED_SOURCE_REQUIRED');
  if(signal?.aborted)fail('FIRMAR_CANCELLED');
  let tokenResponse;
  try{tokenResponse=await fetchImpl(cfg.origin+'/ra/oauth/token?grant_type=client_credentials',{
    method:'POST',redirect:'error',cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(8000)]):AbortSignal.timeout(8000),
    headers:{Accept:'application/json',Authorization:'Basic '+Buffer.from(cfg.user+':'+cfg.secret).toString('base64')}});
  }catch{fail(signal?.aborted?'FIRMAR_CANCELLED':'FIRMAR_TOKEN_UNAVAILABLE','token');}
  if(tokenResponse.status!==200||tokenResponse.redirected){await discard(tokenResponse);fail(tokenResponse.status===401?'FIRMAR_APPLICATION_NOT_AUTHORIZED':'FIRMAR_TOKEN_UNAVAILABLE','token');}
  const token=await boundedJson(tokenResponse,16384,'token');
  if(typeof token?.access_token!=='string'||token.access_token.length<8||token.access_token.length>8192||!/^[A-Za-z0-9._~-]+$/.test(token.access_token)
      ||String(token.token_type).toLowerCase()!=='bearer'||!Number.isSafeInteger(token.expires_in)||token.expires_in<1||token.expires_in>86400) fail('FIRMAR_PROVIDER_RESPONSE_INVALID','token');
  validateBinding(binding,cfg,now());if(signal?.aborted)fail('FIRMAR_CANCELLED');
  const returnUrl=cfg.appOrigin+'/firmas/retorno#'+binding.returnState;
  const body={cuil:binding.signerCuil,metadata:{tipo:'firmar',token:binding.callbackToken},urlRedirect:returnUrl,type:'PDF',documento:pdf.toString('base64')};
  let response;
  try{response=await fetchImpl(cfg.origin+'/firmador/api/signatures',{
    method:'POST',redirect:'error',cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000),
    headers:{Accept:'application/json','Content-Type':'application/json',Authorization:'Bearer '+token.access_token},body:JSON.stringify(body)});
  }catch{fail('FIRMAR_SUBMISSION_OUTCOME_UNKNOWN','submit');}
  if(response.status!==200||response.redirected){const status=response.status;await discard(response);
    fail([400,401,403,415,422].includes(status)?'FIRMAR_SUBMISSION_REJECTED':'FIRMAR_SUBMISSION_OUTCOME_UNKNOWN','submit');}
  const location=response.headers.get('location');await discard(response);
  let authorizationUrl;try{authorizationUrl=firmarAuthorizationUrl(location,cfg.origin);}catch{fail('FIRMAR_SUBMISSION_OUTCOME_UNKNOWN','submit');}
  return Object.freeze({requestId:binding.requestId,authorizationUrl,expiresAt:binding.expiresAt,
    status:'awaiting_authorization',providerReceiptVerified:false,cryptographicValidation:'not_performed',officialEmissionEnabled:false});
}

// The manual's success flag is NOT authentication or signature validation. Normalize
// to quarantine evidence only; the storage boundary must match a live secret binding,
// enforce tenant/expiry/idempotency, and run independent cryptographic verification.
export function parseFirmarCallback(value,{profile='pfdr-v13-object'}={}) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['documento','metadata','status','msg'].includes(k)))fail('FIRMAR_CALLBACK_INVALID','callback');
  const metadata=profile==='pfdr-v13-object'?value.metadata:profile==='siu-array-single'&&Array.isArray(value.metadata)&&value.metadata.length===1?value.metadata[0]:null;
  if(!exact(metadata,['tipo','token'])||metadata.tipo!=='firmar'||!validToken(metadata.token)
     ||!exact(value.status,['success'])||typeof value.status.success!=='boolean')fail('FIRMAR_CALLBACK_INVALID','callback');
  if(!value.status.success){if(value.documento!==undefined&&value.documento!=='')fail('FIRMAR_CALLBACK_INVALID','callback');
    return {callbackTokenSha256:hash(metadata.token),outcome:'provider_reported_failure',providerAuthenticated:false,cryptographicValidation:'not_performed',officialEmissionEnabled:false};}
  if(value.msg!==undefined||typeof value.documento!=='string'||value.documento.length>Math.ceil(MAX_PDF/3)*4||!/^([A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.documento))fail('FIRMAR_CALLBACK_INVALID','callback');
  const bytes=Buffer.from(value.documento,'base64');
  if(bytes.toString('base64')!==value.documento)fail('FIRMAR_CALLBACK_INVALID','callback');pdfBytes(bytes);
  return {callbackTokenSha256:hash(metadata.token),outcome:'received_unverified',document:bytes,sha256:hash(bytes),
    providerAuthenticated:false,cryptographicValidation:'not_performed',officialEmissionEnabled:false};
}
