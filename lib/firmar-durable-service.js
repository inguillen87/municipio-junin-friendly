// Server orchestration. No HTTP route yet: authority/source issuance, provider enrollment
// and independent cryptographic validation must be closed before public activation.
import {randomUUID,createHash} from 'node:crypto';
import {prepareFirmarBinding,submitFirmarPdf,parseFirmarCallback,firmarDirectReadiness,firmarAuthorizationUrl} from './firmar-direct-provider.js';
import {firmarActorContext,checkedFirmarAttempt,firmarPersistenceFail,exactFirmarKeys} from './firmar-durable-repository.js';
export function createFirmarDurableService({repository,env={},fetchImpl=fetch,now=()=>Date.now(),newId=randomUUID}={}){
 if(!repository||!['getPrepared','reserve','recover','readStatus','recordSubmission','resolveReturn','receive'].every(k=>typeof repository[k]==='function'))throw new TypeError('Durable repository required');
 function enabled(){if(!firmarDirectReadiness(env).configured)firmarPersistenceFail('FIRMAR_CONFIGURATION_REQUIRED');}
 function actor(ctx){const c=firmarActorContext(ctx);if(c.tenantId!==env.FIRMAR_TENANT_ID)firmarPersistenceFail('FIRMAR_AUTHORITY_REQUIRED');return c;}
 return Object.freeze({
  async begin({context,requestId,expectedVersion,expectedSha256,signal}){
   enabled();const ctx=actor(context);if(!Number.isSafeInteger(expectedVersion)||expectedVersion<1)firmarPersistenceFail('FIRMAR_INPUT_INVALID');
   const source=await repository.getPrepared(ctx,requestId);
   if(source.requestId!==requestId||source.version!==expectedVersion||expectedSha256!==undefined&&expectedSha256!==source.sourceSha256)firmarPersistenceFail('FIRMAR_VERSION_CONFLICT');
   const binding=prepareFirmarBinding({tenantId:ctx.tenantId,requestId,sourceSha256:source.sourceSha256,signerCuil:source.signerCuil},{now});
   const candidateId=newId();
   const attempt=await repository.reserve(ctx,{requestId,expectedVersion,attemptId:candidateId,callbackTokenSha256:binding.callbackTokenSha256,returnStateSha256:binding.returnStateSha256,expiresAt:binding.expiresAt});
   checkedFirmarAttempt(attempt,{requestId,reservation:true});
   if(!attempt.created){const {created,...safe}=attempt;return safe;}
   if(attempt.attemptId!==candidateId)firmarPersistenceFail('FIRMAR_PERSISTENCE_CONTRACT');
   // Reservation committed BEFORE talking to the provider. Never automatically resubmit.
   let submitted;
   try{
    submitted=await submitFirmarPdf({binding,pdf:source.pdf,sourceValidation:{validated:true,sha256:source.sourceSha256},consent:{approved:true,requestId,sha256:source.sourceSha256}},{env,fetchImpl,now,signal});
   }catch{
    // Even a pre-upload failure stays recoverable and requires an explicit new request.
    // A missing response is not evidence that the provider did not create the document.
    try{await repository.recordSubmission(binding.callbackTokenSha256,'outcome_unknown',null);}catch{}
    firmarPersistenceFail('FIRMAR_SUBMISSION_OUTCOME_UNKNOWN');
   }
   if(submitted.requestId!==requestId||submitted.expiresAt!==binding.expiresAt||submitted.status!=='awaiting_authorization'||submitted.officialEmissionEnabled!==false)firmarPersistenceFail('FIRMAR_SUBMISSION_OUTCOME_UNKNOWN');
   const origin=env.FIRMAR_ENVIRONMENT==='test'?'https://tst.firmar.gob.ar':'https://firmar.gob.ar';
   const url=firmarAuthorizationUrl(submitted.authorizationUrl,origin);
   await repository.recordSubmission(binding.callbackTokenSha256,'awaiting_authorization',url);
   // A revocation, cancellation or callback that raced with the provider wins over the launch URL.
   return repository.readStatus(ctx,requestId,candidateId);
  },
  async prepared({context,requestId}){
   enabled();const source=await repository.getPrepared(actor(context),requestId);
   return Object.freeze({requestId:source.requestId,version:source.version,sourceVersionId:source.sourceVersionId,sourceSha256:source.sourceSha256,bytes:source.pdf.length,officialEmissionEnabled:false});
  },
  async recover({context,requestId}){enabled();return repository.recover(actor(context),requestId);},
  async status({context,requestId,attemptId}){enabled();return repository.readStatus(actor(context),requestId,attemptId);},
  async resolveReturn({context,state}){
   enabled();const ctx=actor(context);
   if(typeof state!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(state)||Buffer.from(state,'base64url').length!==32||Buffer.from(state,'base64url').toString('base64url')!==state)firmarPersistenceFail('FIRMAR_INPUT_INVALID');
   return repository.resolveReturn(ctx,createHash('sha256').update(state).digest('hex'));
  },
  async receiveCallback(value){enabled();const parsed=parseFirmarCallback(value,{profile:env.FIRMAR_CALLBACK_PROFILE});return repository.receive(parsed);}
 });
}
