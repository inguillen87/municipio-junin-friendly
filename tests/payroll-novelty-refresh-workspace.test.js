// Focal VM behavior of the actual source functions. No DOM mount, network, SQL or writer is invoked.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../assets/payroll-novelty-workbench.js',import.meta.url),'utf8');
const ownSource=fs.readFileSync(new URL('../assets/own-payroll-novelties-panel.js',import.meta.url),'utf8');
function functionSource(name,text=source){
 const start=text.indexOf('function '+name+'(');assert.ok(start>=0,name);const open=text.indexOf('{',start);let depth=0;
 for(let i=open;i<text.length;i++){if(text[i]==='{')depth++;if(text[i]==='}'&&--depth===0)return text.slice(start-(text.slice(start-6,start)==='async '?6:0),i+1);}
 assert.fail('Unclosed source function '+name);
}
const checkerCaps=['payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.approve'];
const sealed=()=>Object.freeze({attempt:Object.freeze({key:'synthetic-original-key',body:Object.freeze({command:'submit',rows:Object.freeze([Object.freeze({rowOrdinal:1})])})})});
function setup(){
 const calls=[],messages=[],reference={open:false},state={busy:'false'};
 const context={pendingWrite:null,monthlyDecisions:null,monthlyAnnul:null,monthlyCorrection:null,bootstrapState:{principal:{capabilities:[]},batches:[]},readBlocked:false,document:{hidden:false,body:{dataset:state}},
  byId:id=>{assert.equal(id,'noveltyReferenceWorkspace');return reference;},loadBootstrap:()=>{calls.push('legacy-read');return'legacy';},
  ownBulkNovelties:{hasPending:()=>false,refresh:()=>{calls.push('own-read');return'own';}},showMessage:(...value)=>messages.push(value),
  fetch:()=>{throw Error('Unexpected network/write in focal VM');}};
 vm.createContext(context);vm.runInContext(['capabilitySet','hasCapability','legacyNoveltyOperationPending','revealReviewableLegacyBatches','refreshNoveltyWorkspace','keepPendingLegacyVisible'].map(name=>functionSource(name)).join('\n'),context);
 return{context,calls,messages,reference,state};
}
test('without pending writes Update follows the disclosed workspace and performs only the chosen read',()=>{
 const f=setup();assert.equal(f.context.refreshNoveltyWorkspace(),'own');assert.deepEqual(f.calls,['own-read']);assert.equal(f.reference.open,false);
 f.reference.open=true;assert.equal(f.context.refreshNoveltyWorkspace(),'legacy');assert.deepEqual(f.calls,['own-read','legacy-read']);
});
for(const open of[false,true])test('own pending Update takes priority over the reference presentation '+open,()=>{
 const f=setup(),own=sealed();f.reference.open=open;
 f.context.ownBulkNovelties={attempt:own.attempt,hasPending:()=>true,refresh:()=>{f.calls.push('own-read');return'own';}};
 assert.equal(f.context.refreshNoveltyWorkspace(),'own');assert.deepEqual(f.calls,['own-read']);assert.equal(f.context.ownBulkNovelties.attempt,own.attempt);assert.deepEqual(f.messages,[]);
});
test('pending legacy body/key opens its workspace and reads without changing or resending the attempt',()=>{
 const f=setup(),pending=sealed();f.context.pendingWrite=pending;
 assert.equal(f.context.refreshNoveltyWorkspace(),'legacy');assert.equal(f.reference.open,true);assert.deepEqual(f.calls,['legacy-read']);assert.equal(f.context.pendingWrite,pending);assert.equal(f.context.pendingWrite.attempt,pending.attempt);assert.equal(f.context.pendingWrite.attempt.body,pending.attempt.body);
});
test('both pending attempts are announced and conserved with no refresh or resend in either workspace',()=>{
 const f=setup(),legacy=sealed(),own=sealed(),legacyBody=legacy.attempt.body,ownBody=own.attempt.body;f.context.pendingWrite=legacy;f.context.ownBulkNovelties={attempt:own.attempt,hasPending:()=>true,refresh:()=>{throw Error('Both pending must not start an own refresh');}};
 assert.equal(f.context.refreshNoveltyWorkspace(),undefined);assert.equal(f.reference.open,true);assert.deepEqual(f.calls,[]);assert.equal(f.messages.length,1);assert.equal(f.messages[0][1],'Hay envíos pendientes en ambos espacios');assert.match(f.messages[0][2],/No se actualizó ni reenvió ninguno/);
 assert.equal(f.context.pendingWrite,legacy);assert.equal(f.context.ownBulkNovelties.attempt,own.attempt);assert.equal(legacy.attempt.body,legacyBody);assert.equal(own.attempt.body,ownBody);
});
for(const tool of['monthlyDecisions','monthlyAnnul','monthlyCorrection'])test('a sealed tool write refreshes legacy even if not in flight '+tool,()=>{
 const f=setup(),pending=sealed();f.context[tool]={attempt:pending.attempt,hasPending:()=>true,locked:()=>false,inFlight:()=>false};
 assert.equal(f.context.refreshNoveltyWorkspace(),'legacy');assert.equal(f.reference.open,true);assert.deepEqual(f.calls,['legacy-read']);assert.equal(f.context[tool].attempt,pending.attempt);
});
test('busy body without a sealed write remains foldable and produces no recovery warning',()=>{
 const f=setup(),disclosure={open:false};f.state.busy='true';assert.equal(f.context.legacyNoveltyOperationPending(),false);
 f.context.keepPendingLegacyVisible({currentTarget:disclosure});assert.equal(disclosure.open,false);assert.deepEqual(f.messages,[]);assert.deepEqual(f.calls,[]);
});
for(const tool of['monthlyDecisions','monthlyAnnul','monthlyCorrection'])test('read/comparison/registered-pending filters remain foldable '+tool,()=>{
 const f=setup(),disclosure={open:false};f.state.busy='true';f.context[tool]={mode:'pending',period:'2026-10',hasPending:()=>false,locked:()=>true,inFlight:()=>true};
 f.context.keepPendingLegacyVisible({currentTarget:disclosure});assert.equal(disclosure.open,false);assert.deepEqual(f.messages,[]);assert.deepEqual(f.calls,[]);
});
for(const tool of['monthlyDecisions','monthlyAnnul','monthlyCorrection'])for(const inFlight of[true,false])test('real in-flight or uncertain tool write is retained '+tool+' '+inFlight,()=>{
 const f=setup(),disclosure={open:false},pending=sealed();f.context[tool]={attempt:pending.attempt,hasPending:()=>true,locked:()=>inFlight,inFlight:()=>inFlight};
 f.context.keepPendingLegacyVisible({currentTarget:disclosure});assert.equal(disclosure.open,true);assert.equal(f.messages.length,1);assert.equal(f.messages[0][1],'Hay una operación pendiente');assert.match(f.messages[0][2],/Detener o Recuperar/);assert.deepEqual(f.calls,[]);assert.equal(f.context[tool].attempt,pending.attempt);assert.equal(f.context[tool].attempt.body,pending.attempt.body);
});
test('parent pending write remains open and an already open disclosure is left untouched',()=>{
 const f=setup(),pending=sealed(),disclosure={open:false};f.context.pendingWrite=pending;f.context.keepPendingLegacyVisible({currentTarget:disclosure});assert.equal(disclosure.open,true);assert.equal(f.context.pendingWrite,pending);
 f.messages.length=0;f.context.keepPendingLegacyVisible({currentTarget:disclosure});assert.deepEqual(f.messages,[]);assert.deepEqual(f.calls,[]);
});
for(const command of['approve','reject'])test('only a real checker command on submitted bootstrap opens review '+command,()=>{
 const f=setup();f.context.bootstrapState={principal:{capabilities:checkerCaps,roleKey:'not-used'},batches:[{status:'submitted',allowedCommands:[command]}]};f.context.monthlyDecisions={view:()=>[]};
 assert.equal(f.context.revealReviewableLegacyBatches(),true);assert.equal(f.reference.open,true);assert.deepEqual(f.calls,[]);assert.deepEqual(f.messages,[]);
});
for(const change of[
 s=>s.principal.capabilities=checkerCaps.filter(c=>c!=='payroll.novelty.approve'),
 s=>s.principal.capabilities=checkerCaps.filter(c=>c!=='payroll.novelty.nominal.read'),
 s=>s.principal.capabilities=checkerCaps.filter(c=>c!=='payroll.novelty.read'),
 s=>s.principal={roleKey:'checker',capabilities:[]},
 s=>s.batches[0].status='approved',
 s=>s.batches[0].allowedCommands=[],
 s=>s.batches[0].allowedCommands=['submit','cancel']
])test('maker, role labels, missing scope access or unavailable decisions cannot trigger a review invitation '+change.toString(),()=>{
 const f=setup(),boot={principal:{capabilities:[...checkerCaps]},batches:[{status:'submitted',allowedCommands:['approve','reject']}]};change(boot);f.context.bootstrapState=boot;
 assert.equal(f.context.revealReviewableLegacyBatches(),false);assert.equal(f.reference.open,false);assert.deepEqual(f.calls,[]);
});
for(const mode of['blocked','hidden'])test('withdrawn or hidden bootstrap cannot reopen the review '+mode,()=>{
 const f=setup();f.context.bootstrapState={principal:{capabilities:checkerCaps},batches:[{status:'submitted',allowedCommands:['approve']}]};if(mode==='blocked')f.context.readBlocked=true;else f.context.document.hidden=true;
 assert.equal(f.context.revealReviewableLegacyBatches(),false);assert.equal(f.reference.open,false);
});
test('source wiring preserves existing write locks and recovery remains separate from refresh',()=>{
 assert.match(source,/renderBatches\(\); renderMonthlySubject\(\); revealReviewableLegacyBatches\(\);/);
 assert.match(source,/byId\('refreshButton'\)\.addEventListener\('click', refreshNoveltyWorkspace\)/);assert.match(source,/disclosure\.addEventListener\('toggle', keepPendingLegacyVisible\)/);
 assert.match(source,/byId\('refreshButton'\)\.disabled = busy \|\| Boolean\(monthlyDecisions\?\.inFlight\(\)\)/);
 assert.doesNotMatch(functionSource('refreshNoveltyWorkspace'),/\bPOST\b|\.recover\(|\.retry\(|executePendingWrite|\.body\s*=/);
});
// The own work/refresh controller is taken from its actual unchanged module.
// Only authorized/bootstrap dependencies are synthetic GET spies; the external/busy/live guards are real.
function ownReadController(external=false){
 const reads=[],messages=[],attempt=sealed().attempt,context={busy:false,external,stopped:false,sequence:0,attempt,receipt:null,controller:null,AbortController,live:()=>true,controls:()=>{},
  authorized:async()=>{reads.push('access-GET');},bootstrap:async()=>{reads.push('bootstrap-GET');},status:text=>messages.push(text),withdraw:()=>{throw Error('Unexpected withdrawal');}};
 vm.createContext(context);vm.runInContext([functionSource('work',ownSource),functionSource('refresh',ownSource)].join('\n'),context);
 return{context,reads,messages,attempt};
}
test('real own work and refresh preserve an own pending attempt while consulting two GET dependencies',async()=>{
 const f=ownReadController();await f.context.refresh();assert.deepEqual(f.reads,['access-GET','bootstrap-GET']);assert.equal(f.context.attempt,f.attempt);assert.equal(f.context.busy,false);assert.equal(f.context.external,false);assert.equal(f.context.receipt,null);
});
test('real own external mutual guard blocks refresh and all work; no generic bypass is introduced',async()=>{
 const f=ownReadController(true);await f.context.refresh();let writes=0;await f.context.work(async()=>{writes++;});
 assert.deepEqual(f.reads,[]);assert.equal(writes,0);assert.equal(f.context.external,true);assert.equal(f.context.attempt,f.attempt);assert.equal(f.context.busy,false);
});
test('own-only routing reaches the real read controller with legacy idle, preserving the same attempt',async()=>{
 const f=setup(),own=ownReadController();f.reference.open=true;f.context.ownBulkNovelties={hasPending:()=>true,refresh:()=>own.context.refresh()};
 await f.context.refreshNoveltyWorkspace();assert.deepEqual(f.calls,[]);assert.deepEqual(own.reads,['access-GET','bootstrap-GET']);assert.equal(own.context.attempt,own.attempt);assert.equal(own.context.external,false);
});