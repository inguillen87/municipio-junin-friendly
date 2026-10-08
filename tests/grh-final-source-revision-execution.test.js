import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {executeFinalSourceRevision,parseFinalSourceRevisionArgs,finalSourceMaintenanceErrorCode} from '../scripts/prepare-grh-final-source-revision.mjs';
import {loaderQaPackage} from './fixtures/successor-loader-postgres.js';
import {finalRevisionPackage,finalRevisionClient,finalRevisionTarget as target} from './fixtures/final-source-revision-synthetic.js';
const pack=await finalRevisionPackage();
const run=(connect,options={})=>executeFinalSourceRevision({connect,prepared:pack,target,expectedPackageSha256:pack.payloadSha256,installSchema:true,...options});
const lease=options=>{const client=finalRevisionClient(pack,options),releases=[];client.release=e=>releases.push(e);return {client,releases};};
const args=['target','baseline-core','candidate-core','baseline-curated','candidate-curated'].map(key=>'--'+key+'='+path.resolve('verification/synthetic-'+key)).concat('--expect-package='+pack.payloadSha256);
test('maintenance reports the global comparison limit and revocation without revealing SQL or private errors',()=>{
 for(const code of ['GRH_FINAL_TRANSITION_GLOBAL_LIMIT','GRH_FINAL_CONSUMER_CONTEXT','GRH_FINAL_REVISION_CAPACITY_REQUIRED'])
  assert.equal(finalSourceMaintenanceErrorCode({code,message:'private SQL contents'}),code);
 for(const code of ['42P01','GRH_FINAL_TRANSITION_PRIVATE\nname','private source row'])
  assert.equal(finalSourceMaintenanceErrorCode({code,message:'private SQL contents'}),'GRH_FINAL_REVISION_FAILED');
});
test('maintenance requires an explicit rehearsal or save mode and complete absolute inputs',()=>{
 assert.equal(parseFinalSourceRevisionArgs([...args,'--rehearse']).rehearse,true);
 assert.equal(parseFinalSourceRevisionArgs([...args,'--save-revision']).rehearse,undefined);
 for(const invalid of [args,[...args,'--rehearse','--save-revision'],[...args,'--rehearse','--candidate-profile=latest'],['--rehearse']])
  assert.throws(()=>parseFinalSourceRevisionArgs(invalid),{code:'GRH_FINAL_REVISION_ARGUMENT'});
});
test('contract comparison is an explicit maintenance option and never changes save authorization',async()=>{
 assert.equal(parseFinalSourceRevisionArgs([...args,'--rehearse','--review-contracts'])['review-contracts'],true);
 let opened=false;await assert.rejects(run(async()=>{opened=true;return lease().client;},{reviewContracts:'true'}),{code:'GRH_FINAL_REVISION_ARGUMENT'});
 assert.equal(opened,false);
 const {client,releases}=lease();await assert.rejects(run(async()=>client,{reviewContracts:true}),/Unexpected synthetic SQL/);
 assert.equal(client.stored,null);assert.equal(client.calls.at(-1).text,'ROLLBACK');assert.deepEqual(releases,[undefined]);
});
test('default execution rehearses and rolls back the complete preparation',async()=>{
 const {client,releases}=lease(),receipt=await run(async()=>client);
 assert.equal(receipt.committed,false);assert.equal(receipt.rolledBack,true);assert.equal(receipt.maintenanceOutcome,'rehearsal_rolled_back');
 assert.equal(client.stored,null);assert.equal(client.deltaRows,0);assert.equal(client.state.installed,false);
 assert.equal(client.calls.at(-1).text,'ROLLBACK');assert.deepEqual(releases,[undefined]);
});
test('saving and replay commit only the same verified revision and preserve the operational distinction',async()=>{
 const {client,releases}=lease(),receipt=await run(async()=>client,{commit:true});
 assert.equal(receipt.committed,true);assert.equal(receipt.rolledBack,false);assert.equal(receipt.maintenanceOutcome,'revision_saved');
 assert.equal(receipt.operationalSourceChanged,false);assert.equal(receipt.adoptionPerformed,false);assert.equal(receipt.payrollCalculated,false);
 const replay=await run(async()=>client,{commit:true});assert.equal(replay.replayed,true);assert.equal(replay.revisionId,receipt.revisionId);
 assert.equal(client.deltaRows,410);assert.deepEqual(releases,[undefined,undefined]);
});
test('the wrong profile, hash, destination or a canceled request cannot open a connection',async()=>{
 let connections=0;const connect=async()=>{connections++;return lease().client;},old=await loaderQaPackage();
 await assert.rejects(run(connect,{prepared:old,expectedPackageSha256:old.payloadSha256}),{code:'GRH_FINAL_REVISION_PROFILE'});
 await assert.rejects(run(connect,{expectedPackageSha256:'0'.repeat(64)}),{code:'GRH_FINAL_REVISION_PACKAGE_CHANGED'});
 await assert.rejects(run(connect,{target:{...target,extra:true}}));
 const abort=new AbortController();abort.abort();await assert.rejects(run(connect,{signal:abort.signal}),{name:'AbortError'});
 assert.equal(connections,0);
});
test('a SQL failure rolls back and releases the connection without reporting a save',async()=>{
 const {client,releases}=lease({fail:sql=>sql.includes('final-revision:delta */')});
 await assert.rejects(run(async()=>client,{commit:true}),/synthetic interrupted query/);
 assert.equal(client.stored,null);assert.equal(client.calls.at(-1).text,'ROLLBACK');assert.deepEqual(releases,[undefined]);
});
test('an unconfirmed COMMIT is reported as uncertain and is never automatically retried',async()=>{
 const {client,releases}=lease({fail:sql=>sql==='COMMIT'});let connections=0;
 await assert.rejects(run(async()=>{connections++;return client;},{commit:true}),{code:'GRH_FINAL_REVISION_COMMIT_UNCONFIRMED',outcomeUnknown:true});
 assert.equal(connections,1);assert.equal(releases.length,1);assert.match(releases[0].message,/CONNECTION_DISCARDED/);
});
test('a failed rollback discards its connection',async()=>{
 const {client,releases}=lease({fail:sql=>sql==='ROLLBACK'});
 await assert.rejects(run(async()=>client),/synthetic interrupted query/);
 assert.equal(releases.length,1);assert.match(releases[0].message,/CONNECTION_DISCARDED/);
});
test('cancellation after leasing still releases the connection without BEGIN',async()=>{
 const abort=new AbortController(),{client,releases}=lease();
 await assert.rejects(run(async()=>{abort.abort();return client;},{signal:abort.signal}),{name:'AbortError'});
 assert.equal(client.calls.length,0);assert.deepEqual(releases,[undefined]);
});
test('the real SQL verifier rejects a municipal database before reading a driver or connecting',()=>{
 const result=spawnSync(process.execPath,['scripts/verify-grh-final-source-revision-postgres.mjs','--expected-major=17','--port=55417','--database=neondb'],{encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/QA database required/);
});
