import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import {webcrypto} from 'node:crypto';
import {build} from 'esbuild';

// The real workspace and wire models run under virtual request/body deadlines.
// Canonical synthetic envelopes validate contracts, never municipal authority.
const root=process.cwd(),fromRoot=file=>import(pathToFileURL(path.join(root,file)));
const {ownerAdoptionFixture}=await fromRoot('tests/fixtures/municipal-owner-adoption-synthetic.js');
const {preparationEnvelope}=await fromRoot('tests/fixtures/employment-adoption-preparation-synthetic.js');
const {sealAdoptionReview,adoptionReviewHash}=await fromRoot('assets/employment-adoption-review-model.js');
const candidate=fs.readFileSync(new URL('../assets/municipal-owner-adoption-workspace-model.js',import.meta.url),'utf8');
const bundle=build({stdin:{contents:candidate,sourcefile:'municipal-owner-adoption-workspace-model.js',resolveDir:path.join(root,'assets')},bundle:true,write:false,format:'cjs',platform:'browser',logLevel:'silent'});
const reason='Aprobación del propietario exclusivamente sintética QA';
const clone=structuredClone;

async function harness(count=63){
 const fixture=await ownerAdoptionFixture(count),review=await sealAdoptionReview(fixture.stage.rawReview),preparation=await preparationEnvelope(fixture.stage.preview.body);
 Object.assign(preparation.receipt,{proposalId:fixture.command.proposalId,proposalVersion:fixture.command.proposalVersion});
 const bootstrap={version:'employment-adoption-preparation.v4',review,catalogVersion:fixture.command.catalogVersion,canPrepare:false,applicationAvailable:false,attempts:[preparation]};
 const calls=[],deadlines=[],messages=[],saved=new Map();let now=0,keys=0,live=true,plan=()=>({});
 const state={authority:clone(fixture.authorization)};
 const advance=ms=>{now+=ms;for(const d of deadlines)if(now>=d.at&&!d.controller.signal.aborted)d.controller.abort(new DOMException('Raw virtual signal timed out','TimeoutError'));};
 const signals={any:AbortSignal.any.bind(AbortSignal),timeout(ms){assert.equal(ms,30000);const controller=new AbortController();deadlines.push({at:now+ms,controller});return controller.signal;}};
 async function request(url,init={}){
  const u=new URL(url,'https://fixture.invalid'),resource=u.searchParams.get('resource'),kind=init.method==='POST'?'post':resource==='authority'?'authority':resource==='preview'?'preview':resource==='attempt'?'attempt':'bootstrap';
  const call={kind,url,method:init.method??'GET',key:init.headers?.['Idempotency-Key']??u.searchParams.get('key'),bytes:init.body??null,signal:init.signal};calls.push(call);
  const step=await plan(call,calls)??{};advance(step.elapsed??0);init.signal?.throwIfAborted();if(step.failBefore)throw new TypeError('Synthetic lost transport before commit');
  let status=step.status??200,data;
  if(kind==='authority')data=state.authority;
  else if(kind==='bootstrap')data=bootstrap;
  else if(kind==='preview')data={...fixture.stage.preview,review};
  else if(kind==='attempt'){data=saved.get(call.key);if(!data)status=404;}
  else{
   const wrapper=JSON.parse(call.bytes);assert.equal(wrapper.operation,'approve_owner');const command=wrapper.payload;
   const prior=saved.get(call.key);if(prior)assert.deepEqual(prior.command,command);
   data=prior??{version:'municipal-adoption-owner-stored.v1',preview:{...fixture.stage.preview,review},command,attempt:{...clone(fixture.stored.attempt),requestKey:call.key,bodySha256:await adoptionReviewHash(command),receipt:{...clone(fixture.stored.attempt.receipt),reason:command.reason}}};
   saved.set(call.key,data);status=201;step.onStored?.();
  }
  if(step.wait)await step.wait;
  if(step.afterCommit)step.afterCommit();
  if(step.failAfterCommit)throw new TypeError('Synthetic lost acknowledgement after commit');
  const payload=JSON.stringify(status===200||status===201?{ok:true,data}:{ok:false,code:status===404?'OWNER_ADOPTION_NOT_FOUND':'OWNER_ADOPTION_AUTHORITY_REQUIRED'}),bytes=new TextEncoder().encode(payload);
  let delivered=false,cancelled=false,released=false;
  const body={getReader:()=>({async read(){if(delivered)return{done:true};delivered=true;advance(step.bodyElapsed??0);init.signal?.throwIfAborted();return{done:false,value:bytes};},async cancel(){cancelled=true;},releaseLock(){released=true;}})};
  call.bodyState=()=>({cancelled,released});return{ok:status===200||status===201,status,headers:{get:k=>k==='content-length'?String(bytes.length):null},body};
 }
 const module={exports:{}},context=vm.createContext({module,exports:module.exports,crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,URLSearchParams,URL,AbortController,AbortSignal:signals,DOMException,TypeError,console});
 vm.runInContext('globalThis.structuredClone=value=>JSON.parse(JSON.stringify(value))',context);new vm.Script((await bundle).outputFiles[0].text).runInContext(context);
 const machine=module.exports.createOwnerAdoptionWorkspace({request,randomUUID:()=>{keys++;return fixture.key;},isLive:()=>live,onChange:s=>messages.push(s.message)}),intoVm=v=>vm.runInContext('JSON.parse('+JSON.stringify(JSON.stringify(v))+')',context);
 const ready=async()=>{await machine.load();machine.selectProposal(fixture.command.proposalId);await machine.useReview(intoVm(review));assert.equal(machine.getState().preview.proposal.total,count);};
 return{fixture,review,state,bootstrap,calls,deadlines,messages,saved,machine,ready,keys:()=>keys,now:()=>now,setPlan:p=>{plan=p;},setLive:v=>{live=v;}};
}

test('owner application spans auth20 preview20 POST20 auth20 GET20 with all851 rows and only one original key',async()=>{
 const h=await harness(851);await h.ready();const at=h.calls.length;h.setPlan(()=>({elapsed:20000}));const receipt=await h.machine.send({reason,reviewConfirmed:true});
 assert.equal(h.now(),100000);assert.deepEqual(h.calls.slice(at).map(r=>r.kind),['authority','preview','post','authority','attempt']);assert.equal(receipt.total,851);assert.equal(receipt.effects.contractsAdopted,851);assert.equal(receipt.effects.payrollCalculated,false);assert.equal(receipt.effects.paymentsExecuted,false);
 assert.equal(h.calls.filter(r=>r.kind==='post').length,1);assert.equal(h.keys(),1);assert.equal(h.saved.size,1);assert.equal(h.machine.getState().pending,null);assert.equal(h.machine.getState().busy,false);assert.match(h.machine.getState().message,/851 contratos/);
});

test('pre-freeze authority timeout uses an actionable Spanish message and sends no command or key',async()=>{
 const h=await harness();await h.ready();h.setPlan(r=>r.kind==='authority'?{elapsed:30001}:{});await assert.rejects(h.machine.send({reason,reviewConfirmed:true}),{code:'OWNER_WORKSPACE_INTERRUPTED'});
 assert.equal(h.keys(),0);assert.equal(h.calls.filter(r=>r.kind==='post').length,0);assert.equal(h.machine.getState().pending,null);assert.equal(h.machine.getState().busy,false);assert.match(h.machine.getState().message,/no se envió ninguna decisión/);assert.doesNotMatch(h.machine.getState().message,/signal|timed out|TimeoutError/i);
});

test('body deadline after a committed POST preserves exact pending bytes and recovery GET-first never reposts',async()=>{
 const h=await harness();await h.ready();h.setPlan(r=>r.kind==='post'?{elapsed:20000,bodyElapsed:10001}:{});await assert.rejects(h.machine.send({reason,reviewConfirmed:true}),{code:'OWNER_WORKSPACE_INTERRUPTED'});
 const pending=h.machine.getState().pending,original=h.calls.find(r=>r.kind==='post');assert.ok(Object.isFrozen(pending));assert.equal(h.saved.size,1);assert.equal(pending.bytes,original.bytes);assert.equal(pending.key,original.key);assert.equal(h.machine.getState().retryReady,false);assert.match(h.machine.getState().message,/consultá el resultado del mismo intento antes de reenviar/);assert.doesNotMatch(h.machine.getState().message,/signal|timed out/i);
 const at=h.calls.length;h.setPlan(()=>({elapsed:20000}));await h.machine.recover();assert.deepEqual(h.calls.slice(at).map(r=>r.kind),['authority','attempt','authority','attempt']);assert.equal(h.calls[at+1].key,pending.key);assert.equal(h.calls.filter(r=>r.kind==='post').length,1);assert.equal(h.keys(),1);assert.equal(h.machine.getState().receipt.total,63);
});

test('confirmation GET body timeout retains the same attempt and a later full GET confirms it once',async()=>{
 const h=await harness();await h.ready();h.setPlan(r=>r.kind==='attempt'?{bodyElapsed:30001}:{});await assert.rejects(h.machine.send({reason,reviewConfirmed:true}),{code:'OWNER_WORKSPACE_INTERRUPTED'});
 const pending=h.machine.getState().pending;assert.ok(pending);assert.equal(h.saved.size,1);assert.equal(h.machine.getState().receipt,null);h.setPlan(()=>({elapsed:20000}));await h.machine.recover();assert.equal(h.machine.getState().pending,null);assert.equal(h.calls.filter(r=>r.kind==='post').length,1);assert.equal(h.keys(),1);
});

test('only a complete404 enables an explicit manual retry with unchanged key and bytes',async()=>{
 const h=await harness();await h.ready();h.setPlan(r=>r.kind==='post'?{failBefore:true}:{});await assert.rejects(h.machine.send({reason,reviewConfirmed:true}));const pending=h.machine.getState().pending,post=h.calls.find(r=>r.kind==='post');
 await assert.rejects(h.machine.retry());h.setPlan(r=>r.kind==='attempt'?{bodyElapsed:30001}:{});await assert.rejects(h.machine.recover(),{code:'OWNER_WORKSPACE_INTERRUPTED'});assert.equal(h.machine.getState().retryReady,false);
 h.setPlan(()=>({elapsed:20000}));await assert.rejects(h.machine.recover(),{status:404});assert.equal(h.machine.getState().retryReady,true);assert.equal(h.calls.filter(r=>r.kind==='post').length,1);assert.equal(h.saved.size,0);
 await h.machine.retry();const posts=h.calls.filter(r=>r.kind==='post');assert.equal(posts.length,2);assert.equal(posts[1].key,post.key);assert.equal(posts[1].bytes,post.bytes);assert.equal(posts[1].bytes,pending.bytes);assert.equal(h.keys(),1);assert.equal(h.saved.size,1);
});

test('server revocation before send prevents a key or POST; revocation during recovery retains the original attempt',async()=>{
 const h=await harness();await h.ready();h.setPlan(r=>r.kind==='authority'?{status:403}:{});await assert.rejects(h.machine.send({reason,reviewConfirmed:true}),{status:403});assert.equal(h.machine.getState().context,null);assert.equal(h.machine.getState().review,null);assert.equal(h.keys(),0);assert.equal(h.calls.filter(r=>r.kind==='post').length,0);
 const other=await harness();await other.ready();other.setPlan(r=>r.kind==='post'?{failAfterCommit:true}:{});await assert.rejects(other.machine.send({reason,reviewConfirmed:true}));const pending=other.machine.getState().pending,at=other.calls.length;other.setPlan(r=>r.kind==='authority'?{status:401}:{});await assert.rejects(other.machine.recover(),{status:401});assert.deepEqual(other.calls.slice(at).map(r=>r.kind),['authority']);assert.equal(other.machine.getState().pending,pending);assert.equal(other.machine.getState().receipt,null);
});

test('municipality change prevents lookup or resend and keeps immutable pending contents',async()=>{
 const h=await harness();await h.ready();h.setPlan(r=>r.kind==='post'?{failAfterCommit:true}:{});await assert.rejects(h.machine.send({reason,reviewConfirmed:true}));const pending=h.machine.getState().pending,at=h.calls.length;
 h.state.authority.scope.tenantId='10000000-1000-4000-8000-000000099999';h.setPlan(()=>({elapsed:20000}));await assert.rejects(h.machine.recover(),{status:403});assert.deepEqual(h.calls.slice(at).map(r=>r.kind),['authority']);assert.equal(h.machine.getState().pending,pending);assert.equal(h.machine.getState().context,null);assert.equal(h.calls.filter(r=>r.kind==='post').length,1);await assert.rejects(h.machine.retry());
});

test('toggle invalidation cancels the same epoch, preserves committed pending bytes and enforces single flight',{timeout:10000},async()=>{
 const h=await harness();await h.ready();let release,signalStored;const hold=new Promise(r=>release=r),stored=new Promise(r=>signalStored=r);h.setPlan(r=>r.kind==='post'?{wait:hold,onStored:signalStored}:{});const sending=h.machine.send({reason,reviewConfirmed:true});
 await Promise.race([stored,sending.then(()=>{throw new Error('Synthetic send completed without the stored checkpoint');})]);assert.equal(h.saved.size,1);assert.equal(h.machine.getState().busy,true);const pending=h.machine.getState().pending;
 await assert.rejects(h.machine.send({reason,reviewConfirmed:true}));assert.equal(h.keys(),1);h.setLive(false);h.machine.invalidate('Datos retirados al cerrar el apartado.');assert.ok(h.calls.find(r=>r.kind==='post').signal.aborted);release();await assert.rejects(sending);
 assert.equal(h.machine.getState().busy,false);assert.equal(h.machine.getState().pending,pending);assert.equal(h.machine.getState().receipt,null);for(const k of ['context','history','review','preview','proposal','sources'])assert.equal(h.machine.getState()[k],null);
 h.setLive(true);h.setPlan(()=>({elapsed:20000}));await h.machine.recover();assert.equal(h.machine.getState().receipt.total,63);assert.equal(h.calls.filter(r=>r.kind==='post').length,1);assert.equal(h.keys(),1);
});
