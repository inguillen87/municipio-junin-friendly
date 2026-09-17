import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {createFirmarDurableService} from '../lib/firmar-durable-service.js';
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`,hash=b=>createHash('sha256').update(b).digest('hex');
const now=Date.parse('2026-09-17T19:00:00.000Z');
const context={actorEmail:'qa-signer@example.invalid',actorSessionId:id(1),actorSessionVersion:1,membershipId:id(2),tenantId:id(3)};
function setup(mode='normal'){
 const env={FIRMAR_ENVIRONMENT:'test',FIRMAR_INTEGRATION_APPROVAL_REF:'SYNTHETIC-ONLY',FIRMAR_API_USER:'synthetic-application',FIRMAR_API_SECRET:'synthetic-no-credential',FIRMAR_TENANT_ID:id(3),FIRMAR_CALLBACK_PROFILE:'pfdr-v13-object',FIRMAR_APP_ORIGIN:'https://municipio-junin-friendly.vercel.app',FIRMAR_CALLBACK_REGISTERED:'true',FIRMAR_DIRECT_ENABLED:'true'};
 const calls=[],requests=[];let attempt=null,revoked=false,received=null;
 const prefix='2099999999',weights=[5,4,3,2,7,6,5,4,3,2],sum=weights.reduce((s,w,i)=>s+w*Number(prefix[i]),0),raw=11-sum%11;
 const source={requestId:id(4),version:1,sourceVersionId:id(5),pdf:Buffer.from('%PDF-1.4\nSYNTHETIC TRANSPORT ENVELOPE\n%%EOF'),signerCuil:prefix+(raw===11?0:raw===10?9:raw),sourceValidationRef:'qa-envelope-only',approvalRef:'qa-not-an-official-approval'};source.sourceSha256=hash(source.pdf);
 const auth=()=>{if(revoked)throw Object.assign(Error('FIRMAR_SESSION_INVALID'),{status:401});};
 const view=()=>({requestId:id(4),attemptId:attempt.attemptId,expiresAt:attempt.expiresAt,state:received?'received_unverified':attempt.state??'outcome_unknown',authorizationUrl:received?null:attempt.url??null,officialEmissionEnabled:false});
 const repository={
  getPrepared:async()=>{calls.push('source');auth();return source;},
  reserve:async(_ctx,input)=>{calls.push('reserve');auth();if(mode==='reservation-failure')throw Error('DB write not confirmed');if(attempt)return{...view(),created:false};attempt={...input};return{...view(),created:true};},
  recover:async()=>{calls.push('recover');auth();return view();},
  readStatus:async()=>{calls.push('status');auth();return view();},
  recordSubmission:async(_hash,state,url)=>{calls.push('record');if(mode==='record-failure')throw Error('DB response lost');attempt.state=state;attempt.url=url;return{recorded:true,replayed:false,officialEmissionEnabled:false};},
  resolveReturn:async(_ctx,digest)=>{calls.push('return');auth();assert.equal(digest,attempt.returnStateSha256);return{requestId:id(4),attemptId:attempt.attemptId,state:'return_bound',officialEmissionEnabled:false};},
  receive:async(parsed)=>{calls.push('callback');assert.equal(parsed.callbackTokenSha256,attempt.callbackTokenSha256);received=parsed;return{outcome:parsed.outcome,officialEmissionEnabled:false,cryptographicValidation:'not_performed'};}
 };
 const fetchImpl=async(url,options)=>{
  requests.push({url,options});assert.ok(attempt,'reservation must precede every external call');
  if(url.includes('/ra/oauth/token'))return new Response(JSON.stringify({access_token:'synthetic-access-not-real',token_type:'bearer',expires_in:1800}),{status:200,headers:{'Content-Type':'application/json'}});
  if(mode==='upload-response-lost')throw Error('ECONNRESET with private content');
  if(mode==='revocation-after-upload')revoked=true;
  if(mode==='callback-first'){const b=JSON.parse(options.body);await service.receiveCallback({metadata:b.metadata,documento:Buffer.from('%PDF-1.4\nQA RETURNED NOT VALIDATED\n%%EOF').toString('base64'),status:{success:true}});}
  return new Response(null,{status:200,headers:{Location:'/api/signatures/'+id(8)}});
 };
 let n=6;const service=createFirmarDurableService({repository,env,fetchImpl,now:()=>now,newId:()=>id(n++)});
 return{service,repository,env,requests,calls,source,readAttempt:()=>attempt,revoke:()=>{revoked=true;}};
}
const begin=service=>service.begin({context,requestId:id(4),expectedVersion:1});
test('reserve -> upload once -> durable result -> authenticated status',async()=>{const t=setup(),r=await begin(t.service);assert.equal(r.state,'awaiting_authorization');assert.equal(r.officialEmissionEnabled,false);assert.deepEqual(t.calls,['source','reserve','record','status']);assert.equal(t.requests.length,2);const wire=JSON.parse(t.requests[1].options.body);assert.equal(hash(wire.metadata.token),t.readAttempt().callbackTokenSha256);assert.equal(hash(new URL(wire.urlRedirect).hash.slice(1)),t.readAttempt().returnStateSha256);assert.notEqual(wire.metadata.token,new URL(wire.urlRedirect).hash.slice(1));for(const secret of [wire.metadata.token,wire.cuil,t.env.FIRMAR_API_SECRET])assert.ok(!JSON.stringify(r).includes(secret));});
test('simultaneous clicks and independent service instances reuse one reservation',async()=>{const t=setup();const other=createFirmarDurableService({repository:t.repository,env:t.env,fetchImpl:async()=>assert.fail('second upload'),now:()=>now});const results=await Promise.all([begin(t.service),begin(other)]);assert.equal(t.requests.length,2);assert.equal(results[0].attemptId,results[1].attemptId);assert.ok(results.some(x=>x.state==='outcome_unknown'));await begin(t.service);assert.equal(t.requests.length,2);});
test('reservation uncertainty never uploads a document',async()=>{const t=setup('reservation-failure');await assert.rejects(begin(t.service));assert.equal(t.requests.length,0);});
test('lost provider response is recovered without a second upload',async()=>{const t=setup('upload-response-lost');await assert.rejects(begin(t.service),e=>e.code==='FIRMAR_SUBMISSION_OUTCOME_UNKNOWN'&&!e.message.includes('private'));const r=await t.service.recover({context,requestId:id(4)});assert.equal(r.state,'outcome_unknown');await begin(t.service);assert.equal(t.requests.length,2);});
test('lost database acknowledgement after provider response never sends launch URL prematurely',async()=>{const t=setup('record-failure');await assert.rejects(begin(t.service));const r=await t.service.recover({context,requestId:id(4)});assert.equal(r.state,'outcome_unknown');assert.equal(r.authorizationUrl,null);await begin(t.service);assert.equal(t.requests.length,2);});
test('receipt arriving before transport completion is preserved as unverified',async()=>{const t=setup('callback-first');const r=await begin(t.service);assert.equal(r.state,'received_unverified');assert.equal(r.authorizationUrl,null);assert.equal(r.officialEmissionEnabled,false);assert.ok(t.calls.indexOf('callback')<t.calls.indexOf('record'));});
test('revocation after upload prevents disclosure of the launch URL',async()=>{const t=setup('revocation-after-upload');await assert.rejects(begin(t.service),e=>e.status===401);assert.ok(t.calls.includes('record'));assert.equal(t.requests.length,2);});
test('browser return is idempotent, hashed and not treated as successful signature',async()=>{const t=setup();await begin(t.service);const wire=JSON.parse(t.requests[1].options.body),state=new URL(wire.urlRedirect).hash.slice(1);const a=await t.service.resolveReturn({context,state}),b=await t.service.resolveReturn({context,state});assert.deepEqual(a,b);assert.equal(a.state,'return_bound');assert.equal(a.officialEmissionEnabled,false);assert.equal(t.requests.length,2);});
for(const state of ['bad','/'.repeat(43),'A'.repeat(42),'A'.repeat(42)+'B'])test('malformed return token rejected '+state.slice(-3),async()=>{const t=setup();await assert.rejects(t.service.resolveReturn({context,state}));assert.ok(!t.calls.includes('return'));});
test('other municipality cannot reach source lookup',async()=>{const t=setup();await assert.rejects(t.service.begin({context:{...context,tenantId:id(99)},requestId:id(4),expectedVersion:1}),e=>e.status===403);assert.equal(t.calls.length,0);assert.equal(t.requests.length,0);});
test('stale source version cannot reserve or call provider',async()=>{const t=setup();await assert.rejects(t.service.begin({context,requestId:id(4),expectedVersion:2}),e=>e.code==='FIRMAR_VERSION_CONFLICT');assert.deepEqual(t.calls,['source']);});
test('disabled/unconfigured integration cannot receive callbacks or start provider calls',async()=>{const t=setup();t.env.FIRMAR_DIRECT_ENABLED='false';await assert.rejects(begin(t.service));await assert.rejects(t.service.receiveCallback({}));assert.equal(t.calls.length,0);assert.equal(t.requests.length,0);});
test('callback body never marks valid, emits, approves payroll or changes signer',async()=>{const t=setup();await begin(t.service);const wire=JSON.parse(t.requests[1].options.body);const r=await t.service.receiveCallback({metadata:wire.metadata,documento:Buffer.from('%PDF-1.4\nQA UNVERIFIED\n%%EOF').toString('base64'),status:{success:true}});assert.equal(r.outcome,'received_unverified');assert.equal(r.officialEmissionEnabled,false);assert.equal(r.cryptographicValidation,'not_performed');const state=await t.service.status({context,requestId:id(4),attemptId:id(6)});assert.equal(state.state,'received_unverified');});
