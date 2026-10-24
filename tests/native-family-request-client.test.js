import test from 'node:test';import assert from 'node:assert/strict';
import {createNativeFamilyClient,familyClientBodyHash,familyWorkspaceAccess} from '../assets/native-family-request-client.js';
import {command,review,receipt,list,detail,scope,uid,bodyHash,syntheticSchoolPdf,school} from './fixtures/native-family-requests-synthetic.js';
import {FAMILY_SELF_SUBMIT,FAMILY_REVIEW_WRITE} from '../assets/native-family-request-model.js';
let number=0;
function fixture({view='self',caps=view==='self'?FAMILY_SELF_SUBMIT:FAMILY_REVIEW_WRITE}={}){
 const auth={ok:true,authenticated:true,sessionVersion:2,user:{id:uid(3),email:'family-client-'+(++number)+'@example.test'},access:{tenant:{id:scope.tenantId,roleKey:view==='self'?'JUNIN_EMPLEADO':'JUNIN_RRHH_OPERADOR'},tenantCapabilities:[...caps]},expiresAt:'2099-01-01T00:00:00Z'},calls=[],state={auth:structuredClone(auth),failWrite:false,writeError:null,attemptMissing:false,attemptError:null,result:null,scope:{...scope},detail:detail(view),block:null,pdfBytes:Buffer.from(syntheticSchoolPdf),pdfHook:null},json=(data,status=200)=>new Response(JSON.stringify(data),{status});
 const transport=async(url,options={})=>{calls.push({url,method:options.method??'GET',key:options.headers?.['Idempotency-Key'],body:options.body});if(state.block)await state.block;if(url==='/api/internal-auth')return json(state.auth);const q=new URL(url,'https://family.example.test').searchParams;if(options.method==='POST'){if(state.failWrite)throw Error('synthetic network failure');if(state.writeError)return json({ok:false,code:state.writeError,error:'Rechazo SQL sintético conocido.'},409);const body=JSON.parse(options.body);return json({ok:true,data:receipt(body,{key:options.headers['Idempotency-Key'],scope:{...state.scope}})});}if(['bootstrap','queue'].includes(q.get('resource')))return json({ok:true,data:state.result??list(view,{scope:{...state.scope}})});if(q.get('resource')==='detail')return json({ok:true,data:state.detail});if(q.get('resource')==='document'){state.pdfHook?.();return new Response(state.pdfBytes,{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="solicitud-familiar-'+q.get('id')+'-v'+q.get('requestVersion')+'.pdf"'}});}if(q.get('resource')==='attempt'){if(state.attemptError)return json({ok:false,code:state.attemptError,error:'Intento ocupado sintético.'},409);if(state.attemptMissing)return json({ok:false,code:'NATIVE_FAMILY_NOT_FOUND',error:'No se recuperó el comprobante sintético.'},404);const sent=calls.find(c=>c.method==='POST'&&c.key===q.get('key'));return json({ok:true,data:receipt(JSON.parse(sent.body),{key:sent.key,scope:{...state.scope},replayed:true})});}assert.fail(url);};
 return{auth,calls,state,transport,client:createNativeFamilyClient({auth,view,fetch:transport})};
}
test('family client uses normal authenticated own scope and never sends a client contract',async()=>{const f=fixture();const b=await f.client.bootstrap();assert.equal(b.subject.legajo,'5001');assert.deepEqual(f.client.scope,scope);const r=await f.client.submit(command());assert.equal(r.state,'submitted');assert.equal(f.client.pending,null);for(const c of f.calls)assert.ok(!c.url.includes('contractId'));const post=f.calls.find(c=>c.method==='POST');assert.ok(!Object.hasOwn(JSON.parse(post.body),'contractId'));assert.equal(await familyClientBodyHash(JSON.parse(post.body)),bodyHash(command()));});
test('lost acknowledgement preserves exact key, body and scope through withdrawal, consultation and retry',async()=>{const f=fixture();f.state.failWrite=true;await assert.rejects(f.client.submit(command()));const original=f.client.pending.attempt;assert.ok(Object.isFrozen(original.body.payload.definition));assert.throws(()=>original.body.reason='changed');f.client.withdraw();f.client.resume();await f.client.bootstrap();f.state.attemptMissing=true;await assert.rejects(f.client.recover(),e=>e.status===404);assert.equal(f.client.pending.retryReady,true);f.state.failWrite=false;await f.client.retry();const writes=f.calls.filter(c=>c.method==='POST');assert.equal(writes.length,2);assert.equal(writes[0].key,writes[1].key);assert.equal(writes[0].body,writes[1].body);assert.equal(f.client.pending,null);});
test('receipt lookup recovers persisted write and does not submit another command',async()=>{const f=fixture();f.state.failWrite=true;await assert.rejects(f.client.submit(command()));f.state.failWrite=false;const r=await f.client.recover();assert.equal(r.replayed,true);assert.equal(f.calls.filter(c=>c.method==='POST').length,1);assert.equal(f.client.pending,null);});
test('retry requires original receipt consultation and never recollects the form',async()=>{const f=fixture();f.state.failWrite=true;await assert.rejects(f.client.submit(command()));const count=f.calls.length;await assert.rejects(f.client.retry());assert.equal(f.calls.length,count);await assert.rejects(f.client.submit(command({reason:'Otra preparación sintética'})),e=>e.code==='NATIVE_FAMILY_PENDING');});
test('capability withdrawal before recovery removes access and preserves original attempt privately',async()=>{const f=fixture();f.state.failWrite=true;await assert.rejects(f.client.submit(command()));const pending=f.client.pending.attempt;f.state.auth.access.tenantCapabilities=['actions.read'];const writes=f.calls.filter(c=>c.method==='POST').length;await assert.rejects(f.client.recover(),e=>e.status===403);assert.equal(f.client.pending.attempt,pending);assert.equal(f.calls.filter(c=>c.method==='POST').length,writes);assert.equal(f.client.pending.retryReady,false);});
test('changed account or membership cannot inherit an old attempt or its visible records',async()=>{for(const change of ['email','membership']){const f=fixture();f.state.failWrite=true;await assert.rejects(f.client.submit(command()));if(change==='email')f.state.auth.user.email='another@example.test';else f.state.scope.membershipId=uid(800);await assert.rejects(f.client.recover(),e=>[403,409].includes(e.status));assert.equal(f.client.pending.retryReady,false);assert.equal(f.calls.filter(c=>c.method==='POST').length,1);}});
test('a delayed response after withdrawal cannot expose a record or clear an uncertain attempt',async()=>{const f=fixture();let release;f.state.block=new Promise(r=>release=r);const p=f.client.bootstrap();f.client.withdraw();release();await assert.rejects(p,e=>e.name==='AbortError');f.state.block=null;f.client.resume();assert.equal((await f.client.bootstrap()).subject.legajo,'5001');});
test('simultaneous clicks cannot prepare two independent attempt keys',async()=>{const f=fixture();f.state.failWrite=true;const first=f.client.submit(command()),second=f.client.submit(command());await assert.rejects(second,e=>e.code==='NATIVE_FAMILY_PENDING');await assert.rejects(first);assert.equal(f.calls.filter(c=>c.method==='POST').length,1);});
test('HR revalidates current decision authority and version before creating an attempt',async()=>{const f=fixture({view:'review'});f.state.detail.canReview=false;await assert.rejects(f.client.submit(review()),e=>e.code==='NATIVE_FAMILY_STATE_CHANGED');assert.equal(f.client.pending,null);assert.equal(f.calls.filter(c=>c.method==='POST').length,0);});
function pdfFixture(){const f=fixture(),payload=school();payload.document={filename:'学校.pdf',sha256:payload.document.sha256,byteLength:syntheticSchoolPdf.length,pages:1};f.state.detail=detail('self',{kind:'schooling',payload});f.state.detail.events[0].document=payload.document;return f;}
test('document download verifies exact event metadata, PDF bytes and authority again before returning bytes',async()=>{const f=pdfFixture(),event=f.state.detail.events[0],file=await f.client.documentBytes(f.state.detail.id,event);assert.deepEqual(Buffer.from(file.bytes),syntheticSchoolPdf);assert.equal(file.originalFilename,'学校.pdf');assert.match(file.filename,/^solicitud-familiar-[a-f0-9-]+-v1\.pdf$/);assert.ok(f.calls.filter(c=>c.url==='/api/internal-auth').length>=4);file.bytes.fill(0);});
test('mismatched PDF bytes or permissions revoked during transport never return a downloadable file',async()=>{for(const change of ['bytes','permission']){const f=pdfFixture();if(change==='bytes')f.state.pdfBytes[syntheticSchoolPdf.length-1]^=1;else f.state.pdfHook=()=>f.state.auth.access.tenantCapabilities=[];await assert.rejects(f.client.documentBytes(f.state.detail.id,f.state.detail.events[0]));}});
test('a definitive SQL rejection needs a fresh same-key NOT_FOUND before correction and always creates a new key',async()=>{const f=fixture();f.state.writeError='NATIVE_FAMILY_STATE_CHANGED';await assert.rejects(f.client.submit(command()));const original=f.client.pending.attempt;await assert.rejects(f.client.reviseRejected());f.state.attemptMissing=true;await assert.rejects(f.client.recover(),e=>e.status===404);const before=f.calls.length,revised=await f.client.reviseRejected();assert.deepEqual(revised,original.body);assert.equal(f.client.pending,null);assert.equal(f.client.previousAttempt.key,original.key);assert.equal(f.client.previousAttempt.bodySha256,original.bodySha256);assert.ok(f.calls.slice(before).some(c=>new URL(c.url,'https://family.test').searchParams.get('key')===original.key));f.state.writeError=null;revised.reason='Preparación corregida sintética';await f.client.submit(revised);const writes=f.calls.filter(c=>c.method==='POST');assert.notEqual(writes[0].key,writes[1].key);assert.notEqual(writes[0].body,writes[1].body);});
test('a receipt appearing after an earlier NOT_FOUND is recovered instead of discarding the original attempt',async()=>{const f=fixture();f.state.writeError='NATIVE_FAMILY_STATE_CHANGED';await assert.rejects(f.client.submit(command()));f.state.attemptMissing=true;await assert.rejects(f.client.recover());f.state.attemptMissing=false;await assert.rejects(f.client.reviseRejected(),e=>e.code==='NATIVE_FAMILY_ALREADY_RECORDED'&&e.receipt.replayed);assert.equal(f.client.pending,null);assert.equal(f.client.previousAttempt,null);assert.equal(f.calls.filter(c=>c.method==='POST').length,1);});
test('network uncertainty or BUSY never enables discarding an attempt even after a missing receipt',async()=>{for(const failure of ['network','busy']){const f=fixture();if(failure==='network')f.state.failWrite=true;else f.state.writeError='NATIVE_FAMILY_BUSY';await assert.rejects(f.client.submit(command()));const original=f.client.pending.attempt;f.state.attemptMissing=true;await assert.rejects(f.client.recover());await assert.rejects(f.client.reviseRejected());assert.equal(f.client.pending.attempt,original);assert.equal(f.client.previousAttempt,null);}});
test('a BUSY fresh lookup, revoked write capability or another account preserves the rejected attempt',async()=>{for(const change of ['busy','capability','account','membership']){const f=fixture();f.state.writeError='NATIVE_FAMILY_STATE_CHANGED';await assert.rejects(f.client.submit(command()));const original=f.client.pending.attempt;f.state.attemptMissing=true;await assert.rejects(f.client.recover());if(change==='busy')f.state.attemptError='NATIVE_FAMILY_BUSY';if(change==='capability')f.state.auth.access.tenantCapabilities=f.state.auth.access.tenantCapabilities.filter(c=>c!=='employee.family.self.submit');if(change==='account')f.state.auth.user.email='other@example.test';if(change==='membership')f.state.scope.membershipId=uid(990);await assert.rejects(f.client.reviseRejected());assert.equal(f.client.pending.attempt,original);assert.equal(f.client.previousAttempt,null);assert.equal(f.client.pending.retryReady,false);}});
test('an old definitive rejection never authorizes correction after a newer uncertain delivery',async()=>{for(const failure of ['network','busy']){const f=fixture();f.state.writeError='NATIVE_FAMILY_STATE_CHANGED';await assert.rejects(f.client.submit(command()));const original=f.client.pending.attempt;assert.equal(f.client.pending.lastRejection.code,'NATIVE_FAMILY_STATE_CHANGED');f.state.attemptMissing=true;await assert.rejects(f.client.recover());if(failure==='network'){f.state.writeError=null;f.state.failWrite=true;}else f.state.writeError='NATIVE_FAMILY_BUSY';await assert.rejects(f.client.retry());assert.equal(f.client.pending.lastRejection,null);await assert.rejects(f.client.recover());assert.equal(f.client.pending.retryReady,true);await assert.rejects(f.client.reviseRejected());assert.equal(f.client.pending.attempt,original);assert.equal(f.client.previousAttempt,null);const writes=f.calls.filter(c=>c.method==='POST');assert.equal(writes.length,2);assert.equal(writes[0].key,writes[1].key);assert.equal(writes[0].body,writes[1].body);}});

// Regressions against the REAL /internal-auth shape: tenant has no
// membershipId; user.id is the managed identity-session UUID.
async function preparedMissingRetry(){
 const f=fixture();f.state.failWrite=true;await assert.rejects(f.client.submit(command()));
 const original=f.client.pending.attempt;f.state.attemptMissing=true;
 await assert.rejects(f.client.recover(),e=>e.status===404);assert.equal(f.client.pending.retryReady,true);
 f.state.failWrite=false;return {...f,original};
}
test('a server membership change after NOT_FOUND prevents a second POST and preserves the original attempt',async()=>{
 const f=await preparedMissingRetry(),m2=uid(8101);
 assert.ok(!Object.hasOwn(f.state.auth.access.tenant,'membershipId'));
 f.state.scope={...scope,membershipId:m2};
 await assert.rejects(f.client.retry());
 assert.equal(f.calls.filter(c=>c.method==='POST').length,1,'no POST may precede current server-scope validation');
 assert.equal(f.client.pending.attempt,f.original);assert.equal(f.client.pending.retryReady,false);
 assert.equal(f.original.scope.membershipId,scope.membershipId);f.client.withdraw();
});
test('reopening under another verified server membership cannot inherit the original pending attempt',async()=>{
 const f=await preparedMissingRetry();f.client.withdraw();f.state.scope={...scope,membershipId:uid(8102)};
 const reopened=createNativeFamilyClient({auth:structuredClone(f.state.auth),fetch:f.transport});
 assert.equal(reopened.pending,null,'no cached data is exposed before a verified server scope');
 assert.equal(reopened.scope,null);await reopened.bootstrap();
 assert.deepEqual(reopened.scope,f.state.scope);assert.equal(reopened.pending,null);
 assert.equal(f.client.pending.attempt,f.original);assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
 reopened.withdraw();
});
test('reopening the SAME verified membership recovers its exact pending body and key after scope verification',async()=>{
 const f=await preparedMissingRetry();f.client.withdraw();
 const reopened=createNativeFamilyClient({auth:structuredClone(f.state.auth),fetch:f.transport});
 assert.equal(reopened.pending,null);await reopened.bootstrap();
 assert.equal(reopened.pending.attempt,f.original);assert.deepEqual(reopened.scope,scope);
 await reopened.retry();const writes=f.calls.filter(c=>c.method==='POST');
 assert.equal(writes.length,2);assert.equal(writes[0].key,writes[1].key);assert.equal(writes[0].body,writes[1].body);
 assert.equal(reopened.pending,null);assert.equal(f.client.pending,null);reopened.withdraw();
});
test('a different real identity-session UUID cannot deliver an earlier session pending retry',async()=>{
 const f=await preparedMissingRetry();f.state.auth.user.id=uid(8103);
 await assert.rejects(f.client.retry());
 assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
 assert.equal(f.client.pending.attempt,f.original);assert.equal(f.client.pending.retryReady,false);f.client.withdraw();
});
test('submit before a reopened client bootstrap cannot overwrite the same-scope cached uncertain attempt',async()=>{
 const f=await preparedMissingRetry();f.client.withdraw();
 const reopened=createNativeFamilyClient({auth:structuredClone(f.state.auth),fetch:f.transport});
 await assert.rejects(reopened.submit(command({reason:'Otro formulario exclusivamente sintético'})),e=>e.code==='NATIVE_FAMILY_PENDING');
 assert.equal(reopened.pending.attempt,f.original);assert.equal(f.client.pending.attempt,f.original);
 assert.equal(f.calls.filter(c=>c.method==='POST').length,1);reopened.withdraw();
});
test('two clients binding the same verified scope cannot replace each other while hashing an attempt',async()=>{
 const f=fixture();f.state.failWrite=true;
 const first=createNativeFamilyClient({auth:structuredClone(f.auth),fetch:f.transport}),second=createNativeFamilyClient({auth:structuredClone(f.auth),fetch:f.transport});
 const results=await Promise.allSettled([first.submit(command()),second.submit(command())]);
 assert.equal(results.filter(result=>result.status==='rejected').length,2);
 assert.equal(results.filter(result=>result.reason?.code==='NATIVE_FAMILY_PENDING').length,1);
 assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
 assert.equal(first.pending.attempt,second.pending.attempt);first.withdraw();second.withdraw();f.client.withdraw();
});
test('the real public identity-session UUID is required without inventing a membership field in auth',()=>{
 const f=fixture();assert.ok(!Object.hasOwn(f.auth.access.tenant,'membershipId'));
 for(const invalid of [undefined,null,'','not-a-uuid',3]){const auth=structuredClone(f.auth);auth.user.id=invalid;assert.throws(()=>familyWorkspaceAccess(auth),e=>e.status===401);}
 assert.equal(f.calls.length,0);f.client.withdraw();
});
test('an invalid first server scope never binds cached attempts or permits POST',async()=>{
 const f=fixture();f.state.scope={...scope,membershipId:'invalid'};
 await assert.rejects(f.client.bootstrap());assert.equal(f.client.scope,null);assert.equal(f.client.pending,null);
 assert.equal(f.calls.filter(c=>c.method==='POST').length,0);
 f.state.scope={...scope};await f.client.bootstrap();assert.deepEqual(f.client.scope,scope);f.client.withdraw();
});
test('a membership switch at POST keeps the original membership precondition and leaves rejection pending',async()=>{
 const f=fixture(),expectedHeaders=[];const transport=async(url,options={})=>{
  if(options.method==='POST'){
   // Emulates only an HTTP precondition rejection. Root tests the real handler.
   f.state.scope={...scope,membershipId:uid(8104)};
   expectedHeaders.push(options.headers?.['X-Native-Family-Membership']);
   return new Response(JSON.stringify({ok:false,code:'NATIVE_FAMILY_SCOPE_CHANGED',error:'La membresía actual no coincide con el envío original.'}),{status:403});
  }
  return f.transport(url,options);
 };
 const client=createNativeFamilyClient({auth:structuredClone(f.auth),fetch:transport});
 await assert.rejects(client.submit(command()),e=>e.status===403);
 assert.deepEqual(expectedHeaders,[scope.membershipId]);assert.equal(client.pending.attempt.scope.membershipId,scope.membershipId);
 assert.deepEqual(client.pending.attempt.body,command());assert.equal(client.pending.lastRejection,null);
 client.withdraw();f.client.withdraw();
});

// Controlled transport promises, no native SQL or timing guesses.
function familyDeferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};}
async function boundedFamilyWait(promise,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label)),3000);})]);}finally{clearTimeout(timer);}}
const familyOutcome=promise=>promise.then(value=>({ok:true,value}),error=>({ok:false,error}));
test('a second late recovery of X cannot clear a newer shared pending attempt Y',{timeout:10000},async()=>{
 const f=fixture(),aGate=familyDeferred(),bGate=familyDeferred(),bothSeen=familyDeferred();let seen=0,firstRecovery,lateRecovery;
 const transportFor=gate=>async(url,options={})=>{
  const response=await f.transport(url,options),q=new URL(url,'https://family.example.test').searchParams;
  if(q.get('resource')==='attempt'){if(++seen===2)bothSeen.resolve();await gate.promise;}
  return response;
 };
 const a=createNativeFamilyClient({auth:structuredClone(f.auth),fetch:transportFor(aGate)}),b=createNativeFamilyClient({auth:structuredClone(f.auth),fetch:transportFor(bGate)});
 try{
  f.state.failWrite=true;await assert.rejects(a.submit(command()));const originalX=a.pending.attempt;
  await b.bootstrap();assert.equal(b.pending.attempt,originalX);f.state.failWrite=false;
  firstRecovery=familyOutcome(a.recover());lateRecovery=familyOutcome(b.recover());
  await boundedFamilyWait(bothSeen.promise,'two X receipt lookups did not reach their gates');
  aGate.resolve();const first=await boundedFamilyWait(firstRecovery,'first X recovery did not finish');assert.equal(first.ok,true);assert.equal(a.pending,null);
  f.state.failWrite=true;await assert.rejects(a.submit(command({reason:'Nueva preparación Y exclusivamente sintética'})));const originalY=a.pending.attempt;
  assert.notEqual(originalY.key,originalX.key);bGate.resolve();const late=await boundedFamilyWait(lateRecovery,'late X recovery did not finish');
  assert.equal(late.ok,false,'an obsolete recovery must not report ownership of the current attempt');assert.equal(late.error.code,'NATIVE_FAMILY_PENDING');
  assert.equal(a.pending.attempt,originalY);assert.equal(b.pending.attempt,originalY);assert.equal(f.calls.filter(c=>c.method==='POST').length,2);
 }finally{aGate.resolve();bGate.resolve();await Promise.allSettled([firstRecovery,lateRecovery].filter(Boolean));a.withdraw();b.withdraw();f.client.withdraw();}
});
test('a retry X delayed in bootstrap cannot clear Y rejection or POST after another client replaces X',{timeout:10000},async()=>{
 const f=fixture(),retrySeen=familyDeferred(),releaseRetry=familyDeferred();let holdRetry=false,held=false,retrying;
 const transport=async(url,options={})=>{
  const response=await f.transport(url,options),q=new URL(url,'https://family.example.test').searchParams;
  if(holdRetry&&!held&&q.get('resource')==='bootstrap'){held=true;retrySeen.resolve();await releaseRetry.promise;}
  return response;
 };
 const a=createNativeFamilyClient({auth:structuredClone(f.auth),fetch:transport}),b=createNativeFamilyClient({auth:structuredClone(f.auth),fetch:transport});
 try{
  f.state.failWrite=true;await assert.rejects(a.submit(command()));const originalX=a.pending.attempt;await b.bootstrap();
  f.state.attemptMissing=true;await assert.rejects(a.recover(),e=>e.status===404);assert.equal(a.pending.retryReady,true);
  f.state.failWrite=false;f.state.attemptMissing=false;holdRetry=true;retrying=familyOutcome(a.retry());
  await boundedFamilyWait(retrySeen.promise,'retry X did not reach its bootstrap gate');
  await b.recover();assert.equal(b.pending,null);
  f.state.writeError='NATIVE_FAMILY_STATE_CHANGED';await assert.rejects(b.submit(command({reason:'Rechazo de Y exclusivamente sintético'})));
  const originalY=b.pending.attempt,rejectionY=b.pending.lastRejection;assert.ok(rejectionY);assert.notEqual(originalY.key,originalX.key);
  releaseRetry.resolve();const obsolete=await boundedFamilyWait(retrying,'obsolete retry X did not finish');assert.equal(obsolete.ok,false);assert.equal(obsolete.error.code,'NATIVE_FAMILY_PENDING');
  assert.equal(a.pending.attempt,originalY);assert.equal(b.pending.lastRejection,rejectionY);
  assert.equal(f.calls.filter(c=>c.method==='POST').length,2,'obsolete X must not emit a third POST');
 }finally{releaseRetry.resolve();await Promise.allSettled([retrying].filter(Boolean));a.withdraw();b.withdraw();f.client.withdraw();}
});
test('attempt lookup keeps membership M1 and scope rejection never enables retry or discards X',async()=>{
 for(const operation of ['recover','reviseRejected']){
  const f=fixture(),membershipHeaders=[];let switchAtAttempt=false;
  const transport=async(url,options={})=>{
   const q=new URL(url,'https://family.example.test').searchParams;
   if(switchAtAttempt&&q.get('resource')==='attempt'){
    f.state.scope={...scope,membershipId:uid(8201)};membershipHeaders.push(options.headers?.['X-Native-Family-Membership']);
    // Emulates only the new expected-membership HTTP guard. Root tests the real handler.
    return new Response(JSON.stringify({ok:false,code:'NATIVE_FAMILY_SCOPE_CHANGED',error:'Cambió la membresía del intento original.'}),{status:409});
   }
   return f.transport(url,options);
  };
  const client=createNativeFamilyClient({auth:structuredClone(f.auth),fetch:transport});
  f.state.writeError='NATIVE_FAMILY_STATE_CHANGED';await assert.rejects(client.submit(command()));const original=client.pending.attempt;
  if(operation==='reviseRejected'){f.state.attemptMissing=true;await assert.rejects(client.recover(),e=>e.status===404);assert.equal(client.pending.retryReady,true);}
  switchAtAttempt=true;await assert.rejects(client[operation](),e=>e.code==='NATIVE_FAMILY_SCOPE_CHANGED');
  assert.deepEqual(membershipHeaders,[scope.membershipId]);assert.equal(client.pending.attempt,original);assert.equal(client.pending.retryReady,false);
  assert.equal(client.previousAttempt,null);assert.equal(f.calls.filter(c=>c.method==='POST').length,1);client.withdraw();f.client.withdraw();
 }
});
