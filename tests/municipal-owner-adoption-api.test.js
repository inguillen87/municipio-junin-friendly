import test from 'node:test';import assert from 'node:assert/strict';
import {createMunicipalOwnerAdoptionHandler} from '../api/internal-municipal-owner-adoption.js';
import {municipalOwnerAdoptionOperation,municipalOwnerAdoptionError} from '../lib/internal-municipal-owner-adoption.js';
import {ownerDecisionCommandInput,ownerDecisionExpectedSource} from '../assets/municipal-adoption-owner-decision-model.js';
import {ownerAdoptionFixture} from './fixtures/municipal-owner-adoption-synthetic.js';
const clone=structuredClone;
function http(f,{result=f.stored,access=f.access,session=f.session,error}={}){
 const queries=[],authorization=[];const response={headers:{},setHeader(k,v){this.headers[k]=v;},status(v){this.statusCode=v;return this;},json(v){this.payload=v;return this;}};
 const handler=createMunicipalOwnerAdoptionHandler({env:{INTERNAL_APP_ORIGIN:'https://municipio.example'},requireAccess:(_req,_res,options)=>{authorization.push(options);return access;},sessionFor:()=>session,
  getSql:()=>({query:async(text,args)=>{queries.push({text,args});if(error)throw error;return[{result}];}})});
 return{handler,response,queries,authorization};
}
const post=f=>({method:'POST',url:'/api/internal-municipal-owner-adoption',query:{},headers:{origin:'https://municipio.example','sec-fetch-site':'same-origin','content-type':'application/json','idempotency-key':f.key},body:JSON.stringify({operation:'approve_owner',payload:f.command})});
const get=query=>({method:'GET',query,url:'/api/internal-municipal-owner-adoption?'+new URLSearchParams(query),headers:{}});
const letterKey='abcdefab-cdef-4abc-8abc-abcdefabcdef';
function useLetterKey(f){f.key=letterKey;f.stored.attempt.requestKey=letterKey;return f;}

for(const operation of ['command','attempt'])test(operation+' rejects an uppercase UUID nonce before SQL can commit or canonicalize it',async()=>{
 const f=useLetterKey(await ownerAdoptionFixture());f.key=letterKey.toUpperCase();const h=http(f);
 await h.handler(operation==='command'?post(f):get({resource:'attempt',key:f.key}),h.response);
 assert.equal(h.response.statusCode,400);assert.equal(h.response.payload.code,'OWNER_ADOPTION_INPUT_INVALID');assert.equal(h.queries.length,0);
 let directQueries=0;await assert.rejects(municipalOwnerAdoptionOperation({query(){directQueries++;}},f.access,f.session,operation,{key:f.key,...(operation==='command'?{body:f.command}:{})}),{code:'OWNER_ADOPTION_INPUT_INVALID',status:400});assert.equal(directQueries,0);
});

test('a lowercase nonce containing letters supports first201 and exact command/recovery replays',async()=>{
 const f=useLetterKey(await ownerAdoptionFixture()),first=http(f);await first.handler(post(f),first.response);assert.equal(first.response.statusCode,201);assert.equal(first.response.payload.data.attempt.requestKey,letterKey);assert.equal(first.queries[0].args[2],letterKey);
 const saved=clone(f.stored);saved.attempt.receipt.replayed=true;
 for(const method of ['POST','GET']){const h=http(f,{result:saved});await h.handler(method==='POST'?post(f):get({resource:'attempt',key:letterKey}),h.response);assert.equal(h.response.statusCode,200);assert.equal(h.response.headers['Idempotency-Replayed'],'true');assert.equal(h.response.payload.data.attempt.requestKey,letterKey);assert.deepEqual(h.response.payload.data.command,f.command);assert.equal(h.response.payload.data.attempt.bodySha256,first.response.payload.data.attempt.bodySha256);assert.equal(h.queries.length,1);assert.equal(h.queries[0].args.at(-1),letterKey);}
});

test('owner nonces reject mixed case, whitespace and non-v4 values with zero SQL calls',async()=>{
 const f=await ownerAdoptionFixture();for(const key of ['Abcdefab-cdef-4abc-8abc-abcdefabcdef',letterKey+'\n',' '+letterKey,letterKey.replace('-4abc-','-1abc-'),letterKey.replace('-8abc-','-7abc-'),new String(letterKey)]){
  let queries=0;await assert.rejects(municipalOwnerAdoptionOperation({query(){queries++;}},f.access,f.session,'attempt',{key}),{code:'OWNER_ADOPTION_INPUT_INVALID',status:400});assert.equal(queries,0);
 }
});

const sqlErrors=[
 ['EMPLOYMENT_ADOPTION_BUSY','BUSY',409],['EMPLOYMENT_ADOPTION_SOURCE_CHANGED','SOURCE_CHANGED',409],['EMPLOYMENT_ADOPTION_IDEMPOTENCY_REUSE','IDEMPOTENCY_REUSE',409],
 ['EMPLOYMENT_ADOPTION_SELECTION_CHANGED','STALE_PREVIEW',409],['EMPLOYMENT_ADOPTION_ALREADY_DECIDED','STALE_PREVIEW',409],['EMPLOYMENT_ADOPTION_REPLAY_CONFLICT','STALE_PREVIEW',409],
 ['EMPLOYMENT_ADOPTION_NOT_FOUND','NOT_FOUND',404],['EMPLOYMENT_ADOPTION_FORBIDDEN','FORBIDDEN',403],['EMPLOYMENT_ADOPTION_ACTOR_REQUIRED','FORBIDDEN',403],
 ['NATIVE_EMPLOYEE_FORBIDDEN','FORBIDDEN',403],['TENANT_IAM_SOD_CONFLICT','FORBIDDEN',403],['ACTION_TENANT_AUTHORITY_REQUIRED','FORBIDDEN',403],
 ['ACTION_SOURCE_BINDING_REQUIRED','FORBIDDEN',403],['ACTION_RELEASE_NOT_CERTIFIED','FORBIDDEN',403],
 ['ACTION_SESSION_INVALID','SESSION_INVALID',401],['NATIVE_EMPLOYEE_SESSION_INVALID','SESSION_INVALID',401],
 ['OWNER_ADOPTION_AUTHORITY_REQUIRED','AUTHORITY_REQUIRED',403],['OWNER_ADOPTION_AUTHORITY_BUSY','AUTHORITY_BUSY',409],['OWNER_ADOPTION_INPUT_INVALID','INPUT_INVALID',400],
 ['EMPLOYMENT_ADOPTION_UNSEALED','STALE_PREVIEW',409],['EMPLOYMENT_ADOPTION_LIMIT','LIMIT',413],
];
for(const[sqlCode,suffix,status]of sqlErrors)test('SQL '+sqlCode+' returns a bounded safe '+status+' owner error for command and recovery',async()=>{
 const f=await ownerAdoptionFixture();
 // P0001/message is the normal driver form; a supplied SQL-domain status must
 // also be sanitized rather than entering the route's legacy HTTP-error path.
 for(const error of[Object.assign(Error(sqlCode+' private SQL relation marker'),{code:'P0001',detail:'private SQL detail'}),Object.assign(Error('private SQL relation marker'),{code:sqlCode,status:418,detail:'private SQL detail'})]){
  const safe=municipalOwnerAdoptionError(error);assert.equal(safe.status,status);assert.equal(safe.code,'OWNER_ADOPTION_'+suffix);assert.ok(!safe.message.includes('private SQL'));
  for(const operation of ['command','attempt']){const h=http(f,{error});await h.handler(operation==='command'?post(f):get({resource:'attempt',key:f.key}),h.response);assert.equal(h.response.statusCode,status);assert.equal(h.response.payload.code,safe.code);assert.equal(h.response.payload.ok,false);assert.equal(h.queries.length,1);assert.ok(!JSON.stringify(h.response.payload).includes('private SQL'));assert.equal(Object.hasOwn(h.response.payload,'data'),false);}
 }
});

test('unknown SQL and lookalike error names remain unavailable without leaking a driver message',async()=>{
 const f=await ownerAdoptionFixture();for(const error of[Object.assign(Error('private SQL relation marker'),{code:'P0001',status:401}),Object.assign(Error('private SQL relation marker'),{code:'EMPLOYMENT_ADOPTION_BUSY_OTHER',status:409})]){
  const h=http(f,{error});await h.handler(post(f),h.response);assert.equal(h.response.statusCode,503);assert.equal(h.response.payload.code,'OWNER_ADOPTION_UNAVAILABLE');assert.ok(!JSON.stringify(h.response.payload).includes('private SQL'));assert.equal(h.queries.length,1);
 }
});

test('owner HTTP route keeps true owner/MFA authority and returns a complete explicitly non-independent acknowledgement',async()=>{
 const f=await ownerAdoptionFixture(),h=http(f);await h.handler(post(f),h.response);assert.equal(h.response.statusCode,201);
 assert.equal(h.response.payload.data.attempt.receipt.total,63);assert.equal(h.response.payload.data.attempt.receipt.independence,false);
 assert.equal(h.response.payload.data.attempt.receipt.effects.payrollCalculated,false);assert.equal(h.queries.length,1);
 assert.equal(h.queries[0].text,'SELECT public.municipal_owner_adoption_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result');
 assert.deepEqual(JSON.parse(h.queries[0].args[1]),f.command);assert.equal(h.queries[0].args[2],f.key);
 assert.equal(JSON.parse(h.queries[0].args[0]).actorSessionId,f.session.id);assert.equal(h.authorization[0].allowLegacy,false);
 assert.deepEqual(h.authorization[0].requiredCapabilities,['workforce.employee.read','employee.record.propose']);assert.equal(h.response.headers['Cache-Control'],'private, no-store, max-age=0');
});
test('preview requires the exact explicitly requested source and seals the original raw facts',async()=>{
 const f=await ownerAdoptionFixture(),query={resource:'preview',id:f.command.proposalId,source:JSON.stringify(f.stage.rawReview.source.finalRevision)},h=http(f,{result:f.stage});
 await h.handler(get(query),h.response);assert.equal(h.response.statusCode,200);assert.equal(h.response.payload.data.rawReviewSha256,f.stage.preview.rawReviewSha256);
 assert.equal(h.response.payload.data.review.rows.length,63);assert.equal(h.queries.length,1);
 const wrong=http(f,{result:f.stage});query.source=JSON.stringify({...f.stage.rawReview.source.finalRevision,sourceSha256:'0'.repeat(64)});
 await wrong.handler(get(query),wrong.response);assert.equal(wrong.response.statusCode,409);assert.equal(wrong.response.payload.ok,false);
});
test('a fresh MFA session recovers the original receipt and never overwrites its audit identity',async()=>{
 const f=await ownerAdoptionFixture(),access=clone(f.access),session={...f.session,id:'10000000-1000-4000-8000-000000081111',version:5};
 access.session={id:session.id,email:session.email,version:5};Object.assign(access.principal.session,{id:session.id,version:5});access.principal.user.identityVersion=8;
 const result=clone(f.stored);result.authorization.authority.actor={...result.authorization.authority.actor,sessionId:session.id,sessionVersion:5,identityVersion:8};result.attempt.receipt.replayed=true;
 // Original preview and receipt are independent immutable copies in a real SQL result.
 result.preview=clone(f.stage.preview);result.attempt.receipt.authority=clone(f.stage.preview.authority);
 const h=http(f,{access,session,result});await h.handler(get({resource:'attempt',key:f.key}),h.response);
 assert.equal(h.response.statusCode,200);assert.equal(h.response.headers['Idempotency-Replayed'],'true');
 assert.equal(h.response.payload.data.attempt.receipt.authority.actor.sessionId,f.session.id);assert.equal(h.response.payload.data.attempt.receipt.authority.actor.identityVersion,7);
});
for(const name of['legacy','platformAdmin','noPlatformCapability','noProposalCapability','passwordOnly','revokedSession','foreignActor'])test('HTTP refuses '+name+' before SQL',async()=>{
 const f=await ownerAdoptionFixture(),access=clone(f.access);if(name==='legacy')access.mode='legacy';
 if(name==='platformAdmin')access.principal.platform.roles=['PLATFORM_ADMIN'];if(name==='noPlatformCapability')access.principal.platform.capabilities=[];
 if(name==='noProposalCapability')access.principal.tenant.effectiveCapabilities=['workforce.employee.read'];if(name==='passwordOnly')access.principal.session.authLevel='password';
 if(name==='revokedSession')access.principal.session.expiresAt='2000-01-01T00:00:00Z';if(name==='foreignActor')access.principal.user.email='another@example.invalid';
 const h=http(f,{access});await h.handler(post(f),h.response);assert.equal(h.response.statusCode,403);assert.equal(h.queries.length,0);
});
for(const[name,edit,status]of[
 ['cross-site',r=>r.headers.origin='https://evil.example',403],['wrong-method',r=>r.method='DELETE',405],['query',r=>{r.query={crop:'1'};r.url+='?crop=1';},400],
 ['wrong-operation',r=>r.body=JSON.stringify({operation:'command',payload:{}}),400],['missing-key',r=>delete r.headers['idempotency-key'],400],
 ['oversized',r=>r.headers['content-length']='8193',413],['extra-authority',r=>{const v=JSON.parse(r.body);v.payload.isOwner=true;r.body=JSON.stringify(v);},400],
 ['duplicate-property',r=>r.body=r.body.replace('"reviewConfirmed":true','"reviewConfirmed":false,"reviewConfirmed":true'),400],
])test('HTTP refuses '+name+' without SQL',async()=>{const f=await ownerAdoptionFixture(),r=post(f);edit(r);const h=http(f);await h.handler(r,h.response);assert.equal(h.response.statusCode,status);assert.equal(h.queries.length,0);});
test('a different actor cannot recover another owner receipt even when the gateway authenticates that owner',async()=>{
 const f=await ownerAdoptionFixture(),result=clone(f.stored);result.preview=clone(f.stage.preview);result.authorization=clone(f.authorization);
 result.authorization.authority.actor.personId='10000000-1000-4000-8000-000000081112';const h=http(f,{result});await h.handler(get({resource:'attempt',key:f.key}),h.response);
 assert.equal(h.response.statusCode,503);assert.equal(h.response.payload.ok,false);
});
test('forged or incomplete SQL receipts never produce a success response',async()=>{
 const f=await ownerAdoptionFixture();for(const mutate of[v=>v.attempt.receipt.effects.contractsAdopted--,v=>v.attempt.bodySha256='f'.repeat(64),v=>v.preview.rawReviewSha256='f'.repeat(64),v=>v.command.reason='Another synthetic reason',v=>v.extra='private marker']){
  const result=clone(f.stored);mutate(result);const h=http(f,{result});await h.handler(post(f),h.response);assert.equal(h.response.payload.ok,false);assert.ok(!JSON.stringify(h.response.payload).includes('private marker'));
 }
});
test('structural parsing grants no authority and refuses owner flags, forged sources and invalid identifiers',async()=>{
 const f=await ownerAdoptionFixture();assert.deepEqual(ownerDecisionCommandInput(f.command),f.command);assert.deepEqual(ownerDecisionExpectedSource(f.stage.rawReview.source.finalRevision),f.stage.rawReview.source.finalRevision);
 for(const v of[{...f.command,actor:{}},{...f.command,proposalId:'latest'},{...f.command,reviewVersion:'x'},{...f.command,reason:'sí'}])assert.throws(()=>ownerDecisionCommandInput(v));
 for(const v of[null,{...f.stage.rawReview.source.finalRevision,sourceSha256:'x'},{...f.stage.rawReview.source.finalRevision,authority:{}}])assert.throws(()=>ownerDecisionExpectedSource(v));
 let queries=0;await assert.rejects(municipalOwnerAdoptionOperation({query(){queries++;}},f.access,f.session,'preview',{id:f.command.proposalId,source:{}}));assert.equal(queries,0);
 assert.ok(!municipalOwnerAdoptionError(Error('raw SQL private marker')).message.includes('private marker'));
});
