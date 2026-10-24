import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createOwnNoveltyCancellation,ownNoveltyCancellationCensus,ownNoveltyCancellationScope,ownNoveltyCancellationOwnerKey} from '../assets/own-payroll-novelty-cancellation.js';
import {ownNoveltyAffectedStatePreimage} from '../assets/own-payroll-novelties-model.js';
import {batch,hash,uid} from './fixtures/own-payroll-novelty-cancellation-synthetic.js';

const scope={periodMonth:'2026-10-01',payrollType:'monthly',conceptSourceId:'120'};
const rehash=value=>{value.rowsSha256=hash(value.rows.map(({values,subject})=>({values,subject})));return value;};
function sample(n=1,count=2,patch={}){
 const value=batch(count,{id:uid(20000+n),...patch});
 for(const [i,row]of value.rows.entries()){const contractId=uid(n*100+i+1),legajo='N/'+(n*100+i+1);Object.assign(row.values,{contractId,legajo});Object.assign(row.subject,{contractId,legajo,registrationId:uid(100000+n*100+i)});}
 return rehash(value);
}
function context(value,patch={}){
 const result={version:'own-payroll-novelty-succession-context.v1',batch:structuredClone(value),snapshotSha256:hash(value),effective:true,identitiesCurrent:true,canPrepare:true,pendingSuccessor:null,approvedSuccessor:null,blockingUses:[],affectedState:{version:'own-payroll-novelty-affected-state.v1',captures:[],groups:[]},affectedStateVersion:'f'.repeat(64),...patch};
 result.affectedStateVersion=hash(ownNoveltyAffectedStatePreimage(result));return result;
}
function fixture(values=[sample(1),sample(2),sample(3)]){
 const saved=new Map(values.map(value=>[value.id,structuredClone(value)])),receipts=new Map(),posts=[],gets=[],reads=[];
 let nonce=50000,live=true,authKey='synthetic-session-scope',authCount=0,bootCount=0,controller;
 const hooks={},deps={isLive:()=>live,hash:async value=>hash(value),key:()=>uid(++nonce),authorize:async()=>{authCount++;await hooks.auth?.(authCount);return authKey;},
  readBootstrap:async()=>{bootCount++;await hooks.bootstrap?.(bootCount);return {version:'own-payroll-novelty-bootstrap.v1',complete:true,subjects:[],batches:[...saved.values()].map(value=>Object.fromEntries(['id','revision','status','periodMonth','payrollType','rowCount','preparedBy'].map(key=>[key,structuredClone(value[key])]))),permissions:{canPrepare:true,canApprove:false}};},
  readDetail:async id=>{reads.push(id);return hooks.detail?hooks.detail(id,structuredClone(saved.get(id))):structuredClone(saved.get(id));},
  readContext:async id=>hooks.context?hooks.context(id,context(saved.get(id))):context(saved.get(id)),
  readAttempt:async key=>{gets.push(key);await hooks.attempt?.(key);if(!receipts.has(key))throw Object.assign(Error('Not found'),{status:404});return structuredClone(receipts.get(key));},
  send:async attempt=>{posts.push(structuredClone(attempt));if(hooks.beforeSend)await hooks.beforeSend(attempt,posts.length);
   const original=saved.get(attempt.body.batchId),snapshot={...structuredClone(original),status:'cancelled',revision:original.revision+1};
   const result={version:'own-payroll-novelty-receipt.v1',requestKey:attempt.key,requestSha256:hash(attempt.body),body:structuredClone(attempt.body),snapshot,replayed:false};
   saved.set(snapshot.id,snapshot);receipts.set(attempt.key,result);if(hooks.afterCommit)await hooks.afterCommit(attempt,result,posts.length);return structuredClone(result);},
  onChange:()=>hooks.change?.(controller)
 };controller=createOwnNoveltyCancellation(deps);
 return {controller,deps,saved,receipts,posts,gets,reads,hooks,get bootCount(){return bootCount;},setLive:value=>{live=value;},setAuth:value=>{authKey=value;}};
}

test('exact scope separates period from adjustment month, type and terminal batches',async()=>{
 for(const change of [{periodMonth:'2026-10'},{conceptSourceId:''},{conceptSourceId:'0120'},{payrollType:'all'},{periodMonth:'2026-10-02'},{extra:true}])assert.throws(()=>ownNoveltyCancellationScope({...scope,...change}));
 const otherMonth=sample(2,2,{periodMonth:'2026-09-01'});otherMonth.rows.forEach(row=>row.values.adjustmentMonth='2026-08-01');rehash(otherMonth);
 const f=fixture([sample(1),otherMonth,sample(3,2,{payrollType:'sac'}),sample(4,2,{status:'cancelled'})]);
 const plan=await f.controller.locate(scope);assert.equal(plan.targets.length,1);assert.deepEqual(f.reads,[uid(20001)]);assert.equal(f.posts.length,0);
});
test('last row of a61-row mixed batch blocks the whole set, without trimming the other matching batch',async()=>{
 const mixed=sample(2,61);mixed.rows[60].values.conceptSourceId='121';rehash(mixed);
 const f=fixture([sample(1,61),mixed]);const view=await f.controller.locate(scope);
 assert.equal(view.matchingRows,121);assert.equal(view.targets.length,1);assert.equal(view.blocked.length,1);assert.equal(view.blocked[0].matchingRows,60);
 await assert.rejects(f.controller.execute(true),/conjunto completo/);assert.equal(f.posts.length,0);
});
test('unmatched concepts are fully inspected but do not enter cancellation',async()=>{
 const other=sample(2,61);other.rows.forEach(row=>row.values.conceptSourceId='121');rehash(other);
 const f=fixture([sample(1),other]);await f.controller.locate(scope);await f.controller.execute(true);assert.equal(f.reads.filter(id=>id===other.id).length,1);assert.deepEqual(f.posts.map(post=>post.body.batchId),[uid(20001)]);
});
test('complete census, strict detail ID and all row hashes are mandatory before any POST',async()=>{
 for(const kind of ['incomplete','limit','wrong-id','bad-hash','revision']){
  const f=fixture();if(kind==='incomplete'||kind==='limit'){const base=f.deps.readBootstrap;f.deps.readBootstrap=async()=>{const value=await base();if(kind==='incomplete')value.complete=false;else value.batches=Array.from({length:1001},(_,i)=>({...value.batches[0],id:uid(1000000+i)}));return value;};}
  if(kind==='wrong-id')f.hooks.detail=(id,value)=>({...value,id:uid(999999)});
  if(kind==='bad-hash')f.hooks.detail=(id,value)=>{value.rows.at(-1).values.amountCents='2001';return value;};
  if(kind==='revision')f.hooks.detail=(id,value)=>({...value,revision:value.revision+1});
  await assert.rejects(f.controller.locate(scope));assert.equal(f.posts.length,0);assert.equal(f.controller.hasWork(),false);
 }
});
test('new census entry or changed account during location invalidates the whole review',async()=>{
 for(const kind of ['entry','account']){const f=fixture();if(kind==='entry')f.hooks.bootstrap=n=>{if(n===2)f.saved.set(uid(20004),sample(4));};else f.hooks.auth=n=>{if(n===2)f.setAuth('another-session-scope');};await assert.rejects(f.controller.locate(scope));assert.equal(f.controller.hasWork(),false);assert.equal(f.posts.length,0);}
});
test('approved replacements, successor drafts and related historical captures block group cancellation',async()=>{
 for(const kind of ['approved-v3','pending','capture','replaced']){
  let value=sample(1);
  if(kind==='approved-v3')value={...value,version:'own-payroll-novelty-batch.v3',supersedes:{batchId:uid(70000),expectedRevision:3,rowsSha256:'a'.repeat(64),snapshotSha256:'b'.repeat(64)},correctionReason:'Corrección sintética completa'};
  const f=fixture([value]);
  if(kind==='pending')f.hooks.context=(id,v)=>context(v.batch,{pendingSuccessor:{batchId:uid(71000),revision:1,status:'draft'}});
  if(kind==='replaced')f.hooks.context=(id,v)=>context(v.batch,{effective:false,approvedSuccessor:{batchId:uid(71000),revision:3,status:'approved'}});
  if(kind==='capture')f.hooks.context=(id,v)=>{v.affectedState.captures.push({runId:uid(72000),bodySha256:'a'.repeat(64),payloadSha256:'b'.repeat(64),algorithmSha256:'c'.repeat(64),inputSha256:'d'.repeat(64),resultSha256:'e'.repeat(64),employees:[{contractId:v.batch.rows[0].values.contractId,state:'annulled',version:2,liquidationVersion:1}]});return context(v.batch,{affectedState:v.affectedState});};
  const plan=await f.controller.locate(scope);assert.equal(plan.blocked.length,1);await assert.rejects(f.controller.execute(true));assert.equal(f.posts.length,0);
 }
});
test('a context rehashed around modified rows cannot claim the reviewed source rows hash',async()=>{
 const f=fixture();f.hooks.context=(id,value)=>{value.batch.rows[0].values.amountCents='2001';return context(value.batch);};await assert.rejects(f.controller.locate(scope),/no se verificaron todos sus usos/);assert.equal(f.posts.length,0);assert.equal(f.controller.hasWork(),false);
});
test('three complete commands preserve null/zero values, original pins and a receipt per batch',async()=>{
 const one=sample(1,61),two=sample(2,61,{status:'draft',decidedBy:null,approvals:[]}),three=sample(3,61,{status:'submitted',decidedBy:null,approvals:[]});
 one.rows[0].values.amountCents=null;one.rows[0].values.quantityDecimal='0';two.rows[0].values.amountCents='0';[one,two].forEach(rehash);
 const originals=JSON.stringify([one,two,three]),f=fixture([one,two,three]);await f.controller.locate(scope);await assert.rejects(f.controller.execute(false));assert.equal(f.posts.length,0);
 const done=await f.controller.execute(true);assert.equal(done.complete,true);assert.equal(done.results.length,3);assert.equal(done.results.reduce((sum,row)=>sum+row.rowCount,0),183);assert.equal(new Set(f.posts.map(p=>p.key)).size,3);assert.equal(new Set(f.posts.map(p=>p.body.reasonReference)).size,1);
 assert.equal(JSON.stringify([one,two,three]),originals);assert.equal(f.saved.get(one.id).rows[0].values.amountCents,null);assert.equal(f.saved.get(two.id).rows[0].values.amountCents,'0');assert.ok(f.controller.hasWork());assert.equal(f.controller.hasPending(),false);f.controller.close();assert.equal(f.controller.hasWork(),false);
});
test('a draft v3 cancellation retains its command protocol; no retarget or replacement is created',async()=>{
 const value=sample(1,2,{status:'draft',decidedBy:null,approvals:[],version:'own-payroll-novelty-batch.v3',supersedes:{batchId:uid(70000),expectedRevision:3,rowsSha256:'a'.repeat(64),snapshotSha256:'b'.repeat(64)},correctionReason:'Corrección sintética completa'}),f=fixture([value]);
 await f.controller.locate(scope);await f.controller.execute(true);assert.equal(f.posts[0].body.version,'own-payroll-novelty-command.v3');assert.equal(f.posts[0].body.affectedStateVersion,null);assert.equal(f.posts[0].body.command,'cancel');
});
test('source or complete census changing before a POST prevents all writes',async()=>{
 for(const kind of ['new-batch','version','content','permission','account','capture']){
  const f=fixture();await f.controller.locate(scope);
  if(kind==='new-batch')f.saved.set(uid(20004),sample(4));
  if(kind==='version')f.saved.get(uid(20001)).revision++;
  if(kind==='content'){const b=f.saved.get(uid(20001));b.rows[0].values.amountCents='2001';rehash(b);}
  if(kind==='permission'){const base=f.deps.readBootstrap;f.deps.readBootstrap=async()=>({...await base(),permissions:{canPrepare:false,canApprove:false}});}
  if(kind==='account')f.setAuth('another-session-scope');
  if(kind==='capture')f.hooks.context=(id,v)=>context(v.batch,{pendingSuccessor:{batchId:uid(71000),revision:1,status:'submitted'}});
  await assert.rejects(f.controller.execute(true));assert.equal(f.posts.length,0);
 }
});
test('a version change after A keeps its receipt and stops before creating the B attempt',async()=>{
 const f=fixture();f.hooks.afterCommit=(attempt,result,n)=>{if(n===1)f.saved.get(uid(20002)).revision++;};await f.controller.locate(scope);await assert.rejects(f.controller.execute(true),/conjunto revisado/);assert.equal(f.posts.length,1);assert.equal(f.controller.view().results.length,1);assert.equal(f.controller.view().remaining,2);assert.equal(f.controller.hasPending(),false);assert.equal(f.controller.view().complete,false);
});
test('A committed, B acknowledgement lost, C never sent: recover only B and never replay A',async()=>{
 const f=fixture();let lost=true;f.hooks.afterCommit=(attempt,result,n)=>{if(n===2&&lost){lost=false;throw Error('Acuse perdido');}};
 await f.controller.locate(scope);await assert.rejects(f.controller.execute(true),/Acuse perdido/);
 assert.equal(f.posts.length,2);assert.equal(f.controller.view().results.length,1);assert.equal(f.controller.view().remaining,2);assert.equal(f.controller.hasPending(),true);assert.throws(()=>f.controller.close(),/intento pendiente/);
 const pending=structuredClone(f.posts[1]);await f.controller.recover();assert.deepEqual(f.gets,[pending.key]);assert.equal(f.posts.length,2);assert.equal(f.controller.view().results.length,2);assert.equal(f.controller.view().complete,false);
 await f.controller.execute(true);assert.equal(f.posts.length,3);assert.equal(f.controller.view().complete,true);assert.deepEqual(f.posts[1],pending);
});
test('404 retries exactly the same key/body/reason and rechecks the source before retrying',async()=>{
 const f=fixture();let reject=true;f.hooks.beforeSend=()=>{if(reject){reject=false;throw Error('Sin respuesta');}};
 await f.controller.locate(scope);await assert.rejects(f.controller.execute(true));const original=structuredClone(f.posts[0]);await f.controller.recover();assert.equal(f.controller.view().notFound,true);
 await f.controller.execute(true);assert.deepEqual(f.posts[1],original);assert.equal(f.posts.length,4);assert.equal(f.controller.view().complete,true);
});
test('404 does not permit retrying a changed source or releasing an attempt that committed meanwhile',async()=>{
 const f=fixture();let reject=true;f.hooks.beforeSend=()=>{if(reject){reject=false;throw Error('Sin respuesta');}};await f.controller.locate(scope);await assert.rejects(f.controller.execute(true));await f.controller.recover();
 f.saved.get(uid(20001)).revision++;await assert.rejects(f.controller.execute(true),/conjunto revisado/);assert.equal(f.posts.length,1);assert.equal(f.controller.hasPending(),true);
 await f.controller.reviseMissing();assert.equal(f.controller.hasPending(),false);assert.equal(f.controller.hasWork(),false);
});
test('server403 is authoritative, stops after A and never treats role or canPrepare as authorship',async()=>{
 const f=fixture();f.hooks.beforeSend=(attempt,n)=>{if(n===2)throw Object.assign(Error('Otro preparador'),{status:403});};await f.controller.locate(scope);await assert.rejects(f.controller.execute(true),{status:403});assert.equal(f.posts.length,2);assert.equal(f.controller.view().results.length,1);assert.equal(f.controller.hasPending(),true);assert.match(f.controller.view().message,/Otro preparador/);
});
test('a captured-source409 between preflight and command stops the remaining batch commands',async()=>{
 const f=fixture();f.hooks.beforeSend=(attempt,n)=>{if(n===2)throw Object.assign(Error('OWN_NOVELTY_IN_USE'),{status:409});};await f.controller.locate(scope);await assert.rejects(f.controller.execute(true),{status:409});assert.equal(f.posts.length,2);assert.equal(f.controller.view().results.length,1);assert.equal(f.controller.view().complete,false);
});
test('validly rehashed receipt with changed rows/author/approvals/scope cannot advance the queue',async()=>{
 for(const kind of ['rows','author','approvals','scope']){
  const f=fixture();f.hooks.afterCommit=(attempt,result)=>{if(kind==='rows'){result.snapshot.rows[0].values.amountCents='2001';rehash(result.snapshot);}if(kind==='author')result.snapshot.preparedBy={membershipId:uid(90000),personId:uid(90001)};if(kind==='approvals'){result.snapshot.decidedBy={membershipId:uid(90000),personId:uid(90001)};result.snapshot.approvals=[result.snapshot.decidedBy];}if(kind==='scope')result.snapshot.payrollType='sac';};
  await f.controller.locate(scope);await assert.rejects(f.controller.execute(true));assert.equal(f.posts.length,1);assert.equal(f.controller.view().results.length,0);assert.equal(f.controller.hasPending(),true);
 }
});
test('identityCurrent is a current-view flag, not an immutable cancellation payload field',async()=>{
 const f=fixture();f.hooks.afterCommit=(attempt,result)=>{result.snapshot.rows.forEach(row=>row.identityCurrent=false);};await f.controller.locate(scope);await f.controller.execute(true);assert.equal(f.controller.view().complete,true);
});
test('hide/revoke during B keeps the original attempt and hides all source pins, with no C POST',async()=>{
 const f=fixture();let hold,release;f.hooks.afterCommit=(attempt,result,n)=>{if(n===2){hold=new Promise(resolve=>{release=resolve;});return hold;}};
 await f.controller.locate(scope);const executing=f.controller.execute(true);while(!release)await new Promise(resolve=>setImmediate(resolve));
 f.setLive(false);f.controller.withdraw();const hidden=f.controller.view();assert.equal(hidden.visible,false);assert.equal(hidden.targets.length,0);assert.equal(hidden.results.length,0);assert.equal(hidden.scope,null);assert.equal(hidden.pending,true);release();await assert.rejects(executing,{name:'AbortError'});assert.equal(f.posts.length,2);
 f.setLive(true);await f.controller.recover();assert.equal(f.posts.length,2);assert.equal(f.controller.view().results.length,2);await f.controller.execute(true);assert.equal(f.posts.length,3);
});
test('withdrawal at the final pending-state notification prevents even starting the POST',async()=>{
 const f=fixture();await f.controller.locate(scope);f.hooks.change=controller=>{if(controller.hasPending()){f.hooks.change=null;controller.withdraw();}};await assert.rejects(f.controller.execute(true),{name:'AbortError'});assert.equal(f.posts.length,0);assert.equal(f.controller.hasPending(),true);
});
test('second action while the real coordinator is busy cannot create a second attempt',async()=>{
 const f=fixture();let release;f.hooks.beforeSend=()=>new Promise(resolve=>{release=resolve;});await f.controller.locate(scope);const first=f.controller.execute(true);while(!release)await new Promise(resolve=>setImmediate(resolve));assert.equal(await f.controller.execute(true),undefined);assert.equal(f.posts.length,1);f.hooks.beforeSend=null;release();await first;assert.equal(f.posts.length,3);
});
test('focal import closure contains no engine, server adapter, SQL constructor or application fixture',()=>{
 const seen=new Set(),walk=url=>{if(seen.has(url.href))return;seen.add(url.href);const source=fs.readFileSync(url,'utf8');for(const match of source.matchAll(/(?:import|export)\s[^;]*?\sfrom\s*['"]([^'"]+)['"]/g)){if(match[1].startsWith('.'))walk(new URL(match[1],url));}};
 walk(new URL('../assets/own-payroll-novelty-cancellation.js',import.meta.url));
 assert.equal(seen.size,4);assert.ok([...seen].every(value=>/\/assets\//.test(value)&&!/(?:engine|\/lib\/|migration|fixture)/.test(value)));
 const packaging=fs.readFileSync(new URL('../scripts/build-friendly.mjs',import.meta.url),'utf8');
 for(const url of seen){const relative='assets/'+new URL(url).pathname.split('/').at(-1);assert.equal(packaging.split("'"+relative+"'").length,2,'one explicit shell entry for '+relative);}
});
test('logical recovery locator survives session renewal without equating session and preparer identities',()=>{
 const first=salarySerializedForTest(['S1','synthetic@example.invalid',uid(99000),'role']),second=salarySerializedForTest(['S2','synthetic@example.invalid',uid(99000),'role']);
 assert.equal(ownNoveltyCancellationOwnerKey(first),ownNoveltyCancellationOwnerKey(second));
 for(const key of [salarySerializedForTest(['S2','another@example.invalid',uid(99000),'role']),salarySerializedForTest(['S2','synthetic@example.invalid',uid(99001),'role']),salarySerializedForTest(['S2','synthetic@example.invalid',uid(99000),'other-role'])])assert.notEqual(ownNoveltyCancellationOwnerKey(first),ownNoveltyCancellationOwnerKey(key));
 assert.throws(()=>ownNoveltyCancellationOwnerKey('not-json'));assert.throws(()=>ownNoveltyCancellationOwnerKey(JSON.stringify(['S1','email','invalid','role'])));
});
test('partial review with no pending attempt restores history under current read authority without accepting a changed census',async()=>{
 const f=fixture();f.hooks.afterCommit=(attempt,result,n)=>{if(n===1)f.saved.get(uid(20002)).revision++;};await f.controller.locate(scope);await assert.rejects(f.controller.execute(true));f.controller.withdraw();
 const restored=await f.controller.restore();assert.equal(restored.visible,true);assert.equal(restored.results.length,1);assert.equal(restored.remaining,2);assert.equal(restored.complete,false);assert.deepEqual(restored.scope,scope);assert.equal(f.posts.length,1);assert.equal(f.gets.length,0);
 await assert.rejects(f.controller.execute(true),/conjunto revisado/);assert.equal(f.posts.length,1);
});
test('restore cannot reveal preserved references on another account or failed/incomplete protected scope',async()=>{
 for(const kind of ['account','403','503','invalid','missing-id','prepared-by','row-count','period','prepare']){
  const f=fixture();await f.controller.locate(scope);f.controller.withdraw();const exposed=[];f.hooks.change=controller=>{const state=controller.view();if(state.visible)exposed.push(state);};
  const original=f.deps.readBootstrap;
  if(kind==='account')f.setAuth('another-session-scope');
  else f.deps.readBootstrap=async()=>{if(kind==='403'||kind==='503')throw Object.assign(Error('Rejected scope'),{status:Number(kind)});if(kind==='invalid')return {complete:false};const value=await original();if(kind==='missing-id')value.batches.shift();if(kind==='prepared-by')value.batches[0].preparedBy={membershipId:uid(97000),personId:uid(97001)};if(kind==='row-count')value.batches[0].rowCount++;if(kind==='period')value.batches[0].periodMonth='2026-09-01';if(kind==='prepare')value.permissions.canPrepare=false;return value;};
  await assert.rejects(f.controller.restore());assert.equal(f.controller.view().visible,false);assert.equal(f.controller.view().targets.length,0);assert.equal(exposed.length,0);assert.equal(f.posts.length,0);assert.equal(f.gets.length,0);
 }
});
test('hiding while the protected restore read is in flight discards the response without exposing historical pins',async()=>{
 const f=fixture();await f.controller.locate(scope);f.controller.withdraw();const original=f.deps.readBootstrap;let release;f.deps.readBootstrap=async()=>{const value=await original();await new Promise(resolve=>{release=resolve;});return value;};
 const restoring=f.controller.restore();while(!release)await new Promise(resolve=>setImmediate(resolve));f.controller.withdraw();release();await assert.rejects(restoring,{name:'AbortError'});assert.equal(f.controller.view().visible,false);assert.equal(f.controller.view().targets.length,0);assert.equal(f.posts.length,0);assert.equal(f.gets.length,0);
});
test('restore of an uncertain attempt reveals context only and never looks up or sends that attempt',async()=>{
 const f=fixture();f.hooks.beforeSend=()=>{throw Error('No response');};await f.controller.locate(scope);await assert.rejects(f.controller.execute(true));f.controller.withdraw();const restored=await f.controller.restore();assert.equal(restored.pending,true);assert.equal(restored.results.length,0);assert.equal(restored.remaining,3);assert.equal(f.gets.length,0);assert.equal(f.posts.length,1);assert.equal(restored.notFound,false);
});
test('history retained after a confirmed404 stays owner-bound without claiming a prepared or completed group',async()=>{
 const f=fixture();f.hooks.beforeSend=(attempt,n)=>{if(n===2)throw Error('No response');};await f.controller.locate(scope);await assert.rejects(f.controller.execute(true));const original=structuredClone(f.posts[0]);await f.controller.recover();await f.controller.reviseMissing();
 assert.equal(f.controller.view().historyOnly,true);assert.equal(f.controller.view().complete,false);assert.equal(f.controller.view().results.length,1);assert.deepEqual(f.controller.view().scope,scope);await assert.rejects(f.controller.locate(scope),/cerrá la revisión/);
 f.controller.withdraw();f.setAuth('another-session-scope');await assert.rejects(f.controller.restore(),{status:403});assert.equal(f.controller.view().visible,false);
 f.setAuth('synthetic-session-scope');const restored=await f.controller.restore();assert.equal(restored.historyOnly,true);assert.equal(restored.results[0].requestKey,original.key);assert.equal(restored.matchingRows,2);assert.equal(restored.targets.length,0);assert.equal(restored.complete,false);assert.equal(f.posts.length,2);
});
const salarySerializedForTest=JSON.stringify;
