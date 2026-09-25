import test from 'node:test';import assert from 'node:assert/strict';
import {planIndexCapacity,validateIndexCapacityPlan,verifiedIndex,executeIndexCapacity,indexCapacityHash,INDEX_CAPACITY_IDENTITY,INDEX_CAPACITY_INVENTORY} from '../scripts/lib/grh-index-capacity.mjs';
import {SOURCE_CAPACITY_QUERY} from '../scripts/lib/grh-source-capacity.mjs';
const target={projectId:'project-qa',branchId:'br-main-qa',databaseName:'neondb'},now=new Date('2026-09-25T03:00:00Z');
const row=(n=1)=>({schema:'public',name:'example_'+n+'_idx',table:'example',bytes:String(4*1024*1024),oid:String(n+100),definition_sha256:String(n).repeat(64),definition:'not emitted',method:'btree',kind:'i',table_kind:'r',valid:true,ready:true,simple:true,owner:true,inherited:false,exclusion:false});
function makePlan(inventory=[row(1),row(2)]){return planIndexCapacity({target,inventory,restoredIndexes:inventory.map(r=>({...r,bytes:String(1024*1024)})),capacity:{database_bytes:'477224960',cluster_bytes:'500154368'},restorationSha256:'a'.repeat(64),now});}
function resign(plan){const {planSha256,...body}=plan;return {...body,planSha256:indexCapacityHash(body)};}
test('plan keeps unchanged the 512 MiB ceiling, reserve and required staging margin',()=>{
 const p=makePlan();assert.equal(p.capacity.maximumBytes,536870912);assert.equal(p.capacity.reserveBytes,16777216);assert.equal(p.capacity.requiredGrowthBytes,25165824);assert.equal(p.capacity.fits,false);
 assert.equal(p.indexes.length,2);assert.equal(p.changesRows,false);assert.equal(p.changesQuota,false);assert.equal(p.selectsSource,false);validateIndexCapacityPlan(p,p.planSha256,now);
});
for(const [key,value]of [['method','gin'],['kind','I'],['table_kind','p'],['valid',false],['ready',false],['simple',false],['owner',false],['inherited',true],['exclusion',true],['schema','pg_catalog'],['name','other_ccnew'],['table','unsafe;drop']])test('rejects unsupported index '+key,()=>{const r={...row(),[key]:value};assert.throws(()=>verifiedIndex(r));assert.equal(makePlan([r]).indexes.length,0);});
test('restored sizes remain hints; unsupported size and different definitions are not candidates',()=>{
 assert.equal(makePlan([{...row(),bytes:String(9*1024*1024)}]).indexes.length,0);
 const p=planIndexCapacity({target,inventory:[row()],restoredIndexes:[{...row(),definition_sha256:'f'.repeat(64),bytes:'8192'}],capacity:{database_bytes:'477224960',cluster_bytes:'500154368'},restorationSha256:'a'.repeat(64),now});assert.equal(p.indexes.length,0);
});
test('mutating a signed plan cannot alter target or commands silently',()=>{const p=makePlan();assert.throws(()=>validateIndexCapacityPlan({...p,target:{...target,projectId:'other-project'}},p.planSha256,now));});
for(const when of ['2026-09-25T02:59:59Z','2026-09-25T03:30:00Z','2026-09-26T03:00:00Z'])test('out-of-window plan rejected '+when,()=>{const p=makePlan();assert.throws(()=>validateIndexCapacityPlan(p,p.planSha256,new Date(when)));});
function harness({failCommand=false,wrongTarget=false,invalid=false,changedRows=false,changedDefinition=false,lock=false,drift=false,enough=false,lowSpace=false}={}){
 const inventory=[row(1),row(2)],calls=[];let cluster=enough?490000000:lowSpace?515000000:500154368,rebuilds=0;
 const client={query:async(text,values)=>{calls.push({text,values});
  if(text===INDEX_CAPACITY_IDENTITY)return{rows:[{project_id:wrongTarget?'other-project':target.projectId,branch_id:target.branchId,database_name:target.databaseName,major:17,role:'owner'}]};
  if(text===SOURCE_CAPACITY_QUERY)return{rows:[{database_bytes:'477224960',cluster_bytes:String(cluster)}]};
  if(text===INDEX_CAPACITY_INVENTORY)return{rows:inventory.map(r=>({...r,...invalid?{valid:false}:{},...drift?{oid:'999'}:{}}))};
  if(text.includes('pg_try_advisory_lock'))return{rows:[{acquired:!lock}]};
  if(text.includes('index-capacity:rows'))return{rows:[{rows:'4',sha256:changedRows&&rebuilds?'d'.repeat(64):'c'.repeat(64)}]};
  if(text.startsWith('REINDEX INDEX CONCURRENTLY')){if(failCommand)throw Object.assign(Error('private db exception'),{code:'57014'});const r=inventory.find(r=>text.includes('"'+r.name+'"'));r.bytes=String(1024*1024);r.oid=String(Number(r.oid)+1000);if(changedDefinition)r.definition_sha256='f'.repeat(64);cluster-=3*1024*1024;rebuilds++;return{rows:[]};}
  if(text.includes('set_config')||text.includes('pg_advisory_unlock'))return{rows:[]};
  throw Error('UNEXPECTED_SQL');}};
 return{client,calls,get rebuilds(){return rebuilds;}};
}
const run=(h,options={})=>{const plan=makePlan();return executeIndexCapacity({client:h.client,plan,expectedSha256:plan.planSha256,confirm:true,now:()=>now,...options});};
test('two individual concurrent rebuilds recover measured margin without business SQL',async()=>{
 const h=harness(),receipt=await run(h);assert.equal(h.rebuilds,2);assert.equal(receipt.completed.length,2);assert.equal(receipt.capacityAfter.fits,true);
 assert.equal(receipt.rowsChanged,false);assert.equal(receipt.quotaChanged,false);assert.equal(receipt.sourcePromoted,false);
 assert.ok(h.calls.some(c=>c.text.includes('pg_advisory_unlock')));assert.ok(h.calls.every(c=>!/^\s*(?:DELETE|INSERT|UPDATE|TRUNCATE|DROP|BEGIN|COMMIT|ROLLBACK)\b/i.test(c.text)));
});
test('available margin stops maintenance before rebuilding anything',async()=>{const h=harness({enough:true}),r=await run(h);assert.equal(h.rebuilds,0);assert.equal(r.capacityAfter.fits,true);});
for(const [mode,code]of [['wrongTarget','INDEX_CAPACITY_WRONG_TARGET'],['invalid','INDEX_CAPACITY_INVALID_INDEX_PRESENT'],['lock','INDEX_CAPACITY_BUSY'],['drift','INDEX_CAPACITY_INDEX_CHANGED'],['lowSpace','INDEX_CAPACITY_TEMPORARY_SPACE_REQUIRED']])test('preflight stops '+mode+' before maintenance',async()=>{const h=harness({[mode]:true});await assert.rejects(run(h),{code});assert.equal(h.rebuilds,0);});
test('an interrupted rebuild is unknown and never retried or cleaned up automatically',async()=>{const h=harness({failCommand:true});await assert.rejects(run(h),e=>e.code==='INDEX_CAPACITY_REBUILD_UNCONFIRMED'&&e.outcomeUnknown===true&&!e.message.includes('private'));assert.equal(h.calls.filter(c=>c.text.startsWith('REINDEX')).length,1);});
for(const [mode,code]of [['changedRows','INDEX_CAPACITY_CONCURRENT_ROWS_CHANGED'],['changedDefinition','INDEX_CAPACITY_DEFINITION_CHANGED']])test('post-rebuild '+mode+' stops further maintenance',async()=>{const h=harness({[mode]:true});await assert.rejects(run(h),{code});assert.equal(h.rebuilds,1);});
test('no explicit confirmation means no database command',async()=>{const h=harness();await assert.rejects(run(h,{confirm:false}),{code:'INDEX_CAPACITY_CONFIRMATION_REQUIRED'});assert.equal(h.calls.length,0);});
test('expired or corrupt plan is rejected before connecting',async()=>{const h=harness();await assert.rejects(run(h,{now:()=>new Date(+now+3600000)}));assert.equal(h.calls.length,0);});
test('observer failure keeps completed maintenance in the error receipt',async()=>{const h=harness();await assert.rejects(run(h,{onProgress:()=>{throw Error('disk full');}}),e=>e.completed.length===1&&e.outcomeUnknown===false);assert.equal(h.rebuilds,1);});
import {parseIndexMaintenanceArgs} from '../scripts/maintain-grh-index-capacity.mjs';
test('CLI requires explicit execution and absolute plan with exact hash',()=>{
 for(const args of [[],['--plan','relative.json','--expect-plan','a'.repeat(64),'--execute'],['--plan','/private/plan.json','--expect-plan','a'.repeat(64)],['--plan','/private/plan.json','--expect-plan','short','--execute']])assert.throws(()=>parseIndexMaintenanceArgs(args));
 assert.equal(parseIndexMaintenanceArgs(['--plan','/private/plan.json','--expect-plan','a'.repeat(64),'--execute']).execute,true);
});
test('invalid clock cannot extend a maintenance plan indefinitely',()=>{const p=makePlan();assert.throws(()=>validateIndexCapacityPlan(p,p.planSha256,new Date('invalid')));});
test('duplicate index names cannot create repeated commands',()=>assert.throws(()=>makePlan([row(),row()])));
test('aborted maintenance issues no SQL',async()=>{const h=harness(),c=new AbortController();c.abort();await assert.rejects(run(h,{signal:c.signal}));assert.equal(h.calls.length,0);});
test('plan with recomputed hash still cannot include arbitrary SQL identifiers',()=>{const p=structuredClone(makePlan());p.indexes[0].name='index; other';const invalid=resign(p);assert.throws(()=>validateIndexCapacityPlan(invalid,invalid.planSha256,now));});
