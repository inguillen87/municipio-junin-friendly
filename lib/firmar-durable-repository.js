// Server-only repository. Facades recheck live membership and per-document signing authority.
import {createHash} from 'node:crypto';
import {FIRMAR_DIRECT_LIMITS,validSigningCuil,firmarAuthorizationUrl} from './firmar-direct-provider.js';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA=/^[a-f0-9]{64}$/;
const STATES=new Set(['awaiting_authorization','awaiting_receipt','outcome_unknown','received_unverified','expired','cancelled']);
const STATUS={FIRMAR_SESSION_INVALID:401,FIRMAR_AUTHORITY_REQUIRED:403,FIRMAR_NOT_FOUND:404,FIRMAR_ATTEMPT_NOT_FOUND:404,FIRMAR_RETURN_EXPIRED:410,FIRMAR_ATTEMPT_EXPIRED:410,FIRMAR_INPUT_INVALID:400,FIRMAR_CALLBACK_INVALID:400,FIRMAR_REQUEST_CANCELLED:409,FIRMAR_VERSION_CONFLICT:409,FIRMAR_BUSY:409,FIRMAR_SUBMISSION_CONFLICT:409,FIRMAR_QUARANTINE_FULL:507};
export class FirmarPersistenceError extends Error {constructor(code='FIRMAR_PERSISTENCE_UNAVAILABLE',status=503){super(code);this.name='FirmarPersistenceError';this.code=code;this.status=status;this.safeToRetry=false;}}
export const firmarPersistenceFail=(code,status=STATUS[code]??503)=>{throw new FirmarPersistenceError(code,status);};
export const exactFirmarKeys=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===keys.length&&Object.keys(x).every(k=>keys.includes(k));
export function firmarActorContext(value){
 if(!exactFirmarKeys(value,['actorEmail','actorSessionId','actorSessionVersion','membershipId','tenantId'])||typeof value.actorEmail!=='string'||value.actorEmail!==value.actorEmail.trim().toLowerCase()||value.actorEmail.length>254||!/^\S+@\S+\.\S+$/.test(value.actorEmail)||!['actorSessionId','membershipId','tenantId'].every(k=>UUID.test(value[k]||''))||!Number.isSafeInteger(value.actorSessionVersion)||value.actorSessionVersion<1)firmarPersistenceFail('FIRMAR_SESSION_INVALID');
 return Object.freeze({...value});
}
const hash=b=>createHash('sha256').update(b).digest('hex');
export function checkedFirmarAttempt(value,{requestId,attemptId,reservation=false}={}){
 const keys=['requestId','attemptId','expiresAt','state','authorizationUrl','officialEmissionEnabled',...(reservation?['created']:[])];
 if(!exactFirmarKeys(value,keys)||!UUID.test(value.requestId||'')||!UUID.test(value.attemptId||'')||value.requestId!==requestId||attemptId&&value.attemptId!==attemptId||typeof value.expiresAt!=='string'||!Number.isFinite(Date.parse(value.expiresAt))||!STATES.has(value.state)||value.officialEmissionEnabled!==false||reservation&&typeof value.created!=='boolean')firmarPersistenceFail('FIRMAR_PERSISTENCE_CONTRACT');
 if(value.authorizationUrl!==null){let origin;try{origin=new URL(value.authorizationUrl).origin;}catch{firmarPersistenceFail('FIRMAR_PERSISTENCE_CONTRACT');}try{firmarAuthorizationUrl(value.authorizationUrl,origin);}catch{firmarPersistenceFail('FIRMAR_PERSISTENCE_CONTRACT');}if(value.state!=='awaiting_authorization')firmarPersistenceFail('FIRMAR_PERSISTENCE_CONTRACT');}
 if(value.state==='awaiting_authorization'&&value.authorizationUrl===null)firmarPersistenceFail('FIRMAR_PERSISTENCE_CONTRACT');
 return Object.freeze({...value});
}
export function checkedFirmarSource(x,requestId){
 if(!exactFirmarKeys(x,['requestId','version','sourceVersionId','sourceSha256','pdfBase64','signerCuil','sourceValidationRef','approvalRef'])||x.requestId!==requestId||x.version!==1||!UUID.test(x.sourceVersionId||'')||!SHA.test(x.sourceSha256||'')||!validSigningCuil(x.signerCuil)||!['approvalRef','sourceValidationRef'].every(k=>typeof x[k]==='string'&&x[k].trim().length>=5&&x[k].length<=240)||typeof x.pdfBase64!=='string'||x.pdfBase64.length>Math.ceil(FIRMAR_DIRECT_LIMITS.pdfBytes/3)*4)firmarPersistenceFail('FIRMAR_PERSISTENCE_CONTRACT');
 const pdf=Buffer.from(x.pdfBase64,'base64');
 if(pdf.length<10||pdf.length>FIRMAR_DIRECT_LIMITS.pdfBytes||pdf.toString('base64')!==x.pdfBase64||!/^%PDF-(?:1\.[0-9]|2\.0)/.test(pdf.subarray(0,8).toString('ascii'))||hash(pdf)!==x.sourceSha256)firmarPersistenceFail('FIRMAR_PERSISTENCE_CONTRACT');
 const {pdfBase64,...rest}=x;return Object.freeze({...rest,pdf});
}
export function createFirmarPgRepository(sql){
 if(typeof sql?.query!=='function')throw new TypeError('SQL client required');
 async function call(statement,args){
  let value;try{const r=await sql.query(statement,args);value=(Array.isArray(r)?r:r?.rows)?.[0]?.result;}
  catch(e){const code=String(e?.message??'').match(/^FIRMAR_[A-Z_]+$/)?.[0];firmarPersistenceFail(code&&Object.hasOwn(STATUS,code)?code:'FIRMAR_PERSISTENCE_UNAVAILABLE');}
  if(!value||typeof value!=='object'||Array.isArray(value))firmarPersistenceFail('FIRMAR_PERSISTENCE_CONTRACT');return value;
 }
 const op=(ctx,command,data)=>call('SELECT public.firmar_attempt_operation_v1($1::jsonb,$2::text,$3::jsonb) AS result',[JSON.stringify(firmarActorContext(ctx)),command,JSON.stringify(data)]);
 function request(id){if(!UUID.test(id||''))firmarPersistenceFail('FIRMAR_INPUT_INVALID');return id;}
 return Object.freeze({
  async getPrepared(ctx,requestId){return checkedFirmarSource(await op(ctx,'source',{requestId:request(requestId)}),requestId);},
  async reserve(ctx,input){if(!exactFirmarKeys(input,['requestId','expectedVersion','attemptId','callbackTokenSha256','returnStateSha256','expiresAt'])||!UUID.test(input.requestId||'')||!UUID.test(input.attemptId||'')||input.expectedVersion!==1||!SHA.test(input.callbackTokenSha256||'')||!SHA.test(input.returnStateSha256||'')||input.callbackTokenSha256===input.returnStateSha256||!Number.isFinite(Date.parse(input.expiresAt)))firmarPersistenceFail('FIRMAR_INPUT_INVALID');return checkedFirmarAttempt(await op(ctx,'reserve',input),{requestId:input.requestId,reservation:true});},
  async recover(ctx,requestId){return checkedFirmarAttempt(await op(ctx,'recover',{requestId:request(requestId)}),{requestId});},
  async readStatus(ctx,requestId,attemptId){request(attemptId);return checkedFirmarAttempt(await op(ctx,'status',{requestId:request(requestId),attemptId}),{requestId,attemptId});},
  async resolveReturn(ctx,returnStateSha256){if(!SHA.test(returnStateSha256||''))firmarPersistenceFail('FIRMAR_INPUT_INVALID');const r=await op(ctx,'return',{returnStateSha256});if(!exactFirmarKeys(r,['requestId','attemptId','state','officialEmissionEnabled'])||!UUID.test(r.requestId||'')||!UUID.test(r.attemptId||'')||r.state!=='return_bound'||r.officialEmissionEnabled!==false)firmarPersistenceFail('FIRMAR_PERSISTENCE_CONTRACT');return Object.freeze({...r});},
  async recordSubmission(tokenHash,state,url=null){if(!SHA.test(tokenHash||'')||!['awaiting_authorization','outcome_unknown'].includes(state)||state==='outcome_unknown'&&url!==null)firmarPersistenceFail('FIRMAR_INPUT_INVALID');if(state==='awaiting_authorization'){try{firmarAuthorizationUrl(url,new URL(url).origin);}catch{firmarPersistenceFail('FIRMAR_INPUT_INVALID');}}const r=await call('SELECT public.firmar_submission_record_v1($1::text,$2::text,$3::text) AS result',[tokenHash,state,url]);if(!exactFirmarKeys(r,['recorded','replayed','officialEmissionEnabled'])||r.recorded!==true||typeof r.replayed!=='boolean'||r.officialEmissionEnabled!==false)firmarPersistenceFail('FIRMAR_PERSISTENCE_CONTRACT');return r;},
  async receive(parsed){
   if(!SHA.test(parsed?.callbackTokenSha256||'')||!['received_unverified','provider_reported_failure'].includes(parsed.outcome)||parsed.providerAuthenticated!==false||parsed.cryptographicValidation!=='not_performed'||parsed.officialEmissionEnabled!==false)firmarPersistenceFail('FIRMAR_CALLBACK_INVALID');
   const pdf=parsed.document;
   if(parsed.outcome==='received_unverified'&&(!Buffer.isBuffer(pdf)||pdf.length<10||pdf.length>FIRMAR_DIRECT_LIMITS.pdfBytes||hash(pdf)!==parsed.sha256))firmarPersistenceFail('FIRMAR_CALLBACK_INVALID');
   const r=await call('SELECT public.firmar_callback_quarantine_v1($1::text,$2::text,$3::text) AS result',[parsed.callbackTokenSha256,parsed.outcome,pdf?.toString('base64')??null]);
   if(r.outcome==='receipt_conflict'&&exactFirmarKeys(r,['outcome','officialEmissionEnabled'])&&r.officialEmissionEnabled===false)firmarPersistenceFail('FIRMAR_RECEIPT_CONFLICT',409);
   const base=['outcome','providerAuthenticated','cryptographicValidation','officialEmissionEnabled'];
   if(!exactFirmarKeys(r,[...base,...(parsed.outcome==='received_unverified'?['receiptId','sha256','replayed']:[])])||r.outcome!==parsed.outcome||r.providerAuthenticated!==false||r.cryptographicValidation!=='not_performed'||r.officialEmissionEnabled!==false||r.outcome==='received_unverified'&&(!UUID.test(r.receiptId||'')||r.sha256!==parsed.sha256||typeof r.replayed!=='boolean'))firmarPersistenceFail('FIRMAR_PERSISTENCE_CONTRACT');return Object.freeze({...r});
  }
 });
}
