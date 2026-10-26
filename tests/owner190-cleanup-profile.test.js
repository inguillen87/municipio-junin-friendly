// Synthetic pure transcript checks. No connection, subprocess or SQL execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwner190NativeOutcomeLatch} from '../scripts/lib/owner190-native-outcome.mjs';
import {registerOwner190CleanupProfile,inspectOwner190CleanupNotice} from '../scripts/lib/owner190-cleanup-profile.mjs';
import {assertOwner190OwnedSchema,composeOwner190CanonicalCleanup,bindOwner190CanonicalCleanup} from '../scripts/lib/owner190-canonical-cleanup.mjs';
import {finalReviewAdmissionQaCleanup} from '../scripts/lib/final-grh-source-review-admission-qa.mjs';
const schema='mc_qa_fixed_092_'+'a'.repeat(32),sqlFile='C:/synthetic/verification/cleanup/255.sql',token='01234567-89ab-4cde-8fab-0123456789ab';
const outerBefore={tables:0,fingerprint:'d'.repeat(64)},sourceCommit='e'.repeat(40);
function setup(){
 const sql='BEGIN;\nDROP SCHEMA '+schema+' CASCADE;\nCOMMIT;',profile=registerOwner190CleanupProfile({sql,schema,schemaOid:500,ownerOid:10,sourceCommit,outerBefore},sqlFile);
 const latch=createOwner190NativeOutcomeLatch(),attempt=latch.begin({sql,end:'COMMIT',token,fullJson:true,noticeProfile:profile});
 const pre={version:'owner190-cleanup-inventory.v1',sourceCommit,schema,schemaOid:500,ownerOid:10,
  objects:[{classid:1255,objid:600,objsubid:0,description:'function synthetic_one()'},{classid:1259,objid:601,objsubid:0,description:'table synthetic_two'}],nodeCount:2,inventorySha256:'c'.repeat(64)};
 const post={version:'owner190-cleanup-proof.v1',sourceCommit,schema,schemaOidBefore:500,schemaAbsent:true,globalTables:0,globalFingerprint:outerBefore.fingerprint,inventorySha256:pre.inventorySha256,production:false};
 const stdout=()=>Buffer.from([attempt.marker+':BEGIN','BEGIN','SET','SET','SET','SET','DO','DO','DO',JSON.stringify(pre),'DO','DROP SCHEMA','DO','DO',JSON.stringify(post),'COMMIT',attempt.marker+':END',''].join('\n'));
 // The framing adds two lines; the DROP semicolon is on framed line4.
 const stderr=Buffer.from('psql:'+sqlFile+':4: NOTICE:  drop cascades to 2 other objects\nDETAIL:  drop cascades to function synthetic_one()\ndrop cascades to table synthetic_two\n');
 const result={status:0,signal:null,error:undefined,stdout:stdout(),stderr};
 return {sql,profile,latch,attempt,pre,post,result,stdout};
}
function evaluate(s){
 s.latch.markInvoked(s.attempt);s.latch.recordReturn(s.attempt,s.result);
 return s.latch.evaluate(s.attempt,s.result,{stdout:true,stderr:true,capture:true});
}
function rejects(s,pattern){
 assert.throws(()=>evaluate(s),pattern);s.latch.fail(s.attempt,Error('synthetic profile rejection'),'synthetic');
 assert.equal(s.latch.stopped,true);assert.equal(s.latch.snapshot().state,'UNCERTAIN');
}
test('cleanup finite profile requires pre/drop/post/COMMIT and stays latched until receipt persistence',()=>{
 const s=setup(),out=evaluate(s);assert.equal(out.value.schemaAbsent,true);assert.equal(out.receipt.noticeDiagnostics.announcedObjects,2);
 assert.equal(out.receipt.descriptorClosureEstablished,false);assert.equal(out.receipt.protocolEmpiricallyVerified,false);
 assert.equal(s.latch.stopped,true);s.latch.complete(s.attempt,out);assert.equal(s.latch.stopped,false);
});
test('cleanup unknown version/ruta/copied descriptor and source SQL changes reject before invocation',()=>{
 const s=setup();
 for(const noticeProfile of[{...s.profile,version:'unknown.v1'},{...s.profile,sqlFile:'255.sql'},{...s.profile}])
  assert.throws(()=>createOwner190NativeOutcomeLatch().begin({sql:s.sql,end:'COMMIT',token,fullJson:true,noticeProfile}));
 assert.throws(()=>createOwner190NativeOutcomeLatch().begin({sql:s.sql+'\nSELECT 1',end:'COMMIT',token,fullJson:true,noticeProfile:s.profile}),/COMPLETE_SQL_CHANGED/);
 for(const change of[{end:'ROLLBACK'},{expectedCode:'EXPECTED_ERROR'},{fullJson:false}])
  assert.throws(()=>createOwner190NativeOutcomeLatch().begin({sql:s.sql,end:'COMMIT',token,fullJson:true,noticeProfile:s.profile,...change}));
});
test('cleanup does not admit legacy255 lacking its two proofs or any extra stdout',()=>{
 for(const update of[
  s=>s.result.stdout=Buffer.from(s.attempt.marker+':BEGIN\nBEGIN\nSET\nSET\nSET\nSET\nDO\nDO\nDROP SCHEMA\nCOMMIT\n'+s.attempt.marker+':END\n'),
  s=>s.result.stdout=Buffer.from(s.stdout().toString().replace('DROP SCHEMA\n','unreviewed\nDROP SCHEMA\n')),
  s=>{s.post.globalFingerprint='f'.repeat(64);s.result.stdout=s.stdout();},
  s=>{s.post.schemaAbsent=false;s.result.stdout=s.stdout();},
  s=>{s.pre.schemaOid=501;s.result.stdout=s.stdout();}
 ]){const s=setup();update(s);rejects(s,/PROOFS|TRANSCRIPT|equal|strict|Assertion/i);}
});
test('cleanup unknown detail/NOTICE/WARNING/trailer/count/EOL and unterminated data poison latch',()=>{
 for(const change of[
  x=>x.replace('function synthetic_one()','function foreign()'),
  x=>x+'WARNING: synthetic\n',
  x=>x+'NOTICE: another\n',
  x=>x.replace('2 other objects','3 other objects'),
  x=>x.replace(':4: NOTICE:',':5: NOTICE:'),
  x=>x.replace('/255.sql:','/254.sql:'),
  x=>x.replace('DETAIL:','HINT:'),
  x=>x.replace('\n','\r\n'),
  x=>x.slice(0,-1)
 ]){const s=setup();s.result.stderr=Buffer.from(change(s.result.stderr.toString()));rejects(s,/CLEANUP|equal|strict|Assertion/i);}
});
test('cleanup grammar truncation is bounded100 and N is never equated to pg_depend count',()=>{
 const names=Array.from({length:100},(_,n)=>'table synthetic_'+n),header='psql:'+sqlFile+':4: NOTICE:  drop cascades to 692 other objects\n';
 const stderr=header+names.map((s,n)=>(n?'':'DETAIL:  ')+'drop cascades to '+s).join('\n')+'\nand 592 other objects (see server log for list)\n';
 const options={sqlFile,dropLine:4,allowedDescriptions:new Set(names),nodeCount:2000};
 assert.deepEqual(inspectOwner190CleanupNotice(stderr,options),{count:1,announcedObjects:692,listedObjects:100,truncatedObjects:592,dropSourceLine:4});
 assert.throws(()=>inspectOwner190CleanupNotice(stderr.replace('and 592','and 591'),options),/TRUNCATED_COUNT/);
 assert.throws(()=>inspectOwner190CleanupNotice(stderr,{...options,nodeCount:691}),/NODE_BOUND/);
});
test('cleanup signal/error/buffer/unpersisted RAW or terminal mismatch never complete',()=>{
 for(const update of[s=>s.result.signal='SIGTERM',s=>s.result.error=Object.assign(Error('timeout'),{code:'ETIMEDOUT'}),s=>s.result.stdout=s.result.stdout.subarray(0,-10)]){
  const s=setup();update(s);rejects(s,/SIGNAL|timeout|FRAME|UNTERMINATED/);
 }
 const s=setup();s.latch.markInvoked(s.attempt);s.latch.recordReturn(s.attempt,s.result);
 assert.throws(()=>s.latch.evaluate(s.attempt,s.result,{stdout:true,stderr:true,capture:false}),/RAW_NOT_PERSISTED/);
});

test('exactly101 cascaded objects use the singular one-object trailer',()=>{
 const names=Array.from({length:100},(_,n)=>'table independent_'+n),stderr='psql:'+sqlFile+':4: NOTICE:  drop cascades to 101 other objects\n'+names.map((s,n)=>(n?'':'DETAIL:  ')+'drop cascades to '+s).join('\n')+'\nand 1 other object (see server log for list)\n';
 const options={sqlFile,dropLine:4,allowedDescriptions:new Set(names),nodeCount:150};
 assert.equal(inspectOwner190CleanupNotice(stderr,options).truncatedObjects,1);
 assert.throws(()=>inspectOwner190CleanupNotice(stderr.replace('1 other object (','1 other objects ('),options),/TRUNCATED_COUNT/);
});

test('the actual compositor binds the complete guarded transaction and the observed17/18 version',()=>{
 for(const serverVersionNum of [170011,180000]){
  const owned={version:'owner190-owned-schema.v1',schema,schemaOid:500,ownerOid:10,serverVersionNum,sourceCommit};
  assertOwner190OwnedSchema(owned,{schema,sourceCommit});
  const originalBaseline={...outerBefore},plan=composeOwner190CanonicalCleanup({schema,pins:"IF false THEN RAISE EXCEPTION 'SYNTHETIC_DESTINATION';END IF;",ownedSchema:owned,outerBefore:originalBaseline,sourceCommit});
  const originalGuard=finalReviewAdmissionQaCleanup(schema)[0];assert.equal(plan.transaction.sql.split(originalGuard).length,3);assert.equal((plan.transaction.sql.match(/DROP SCHEMA /g)??[]).length,1);
  assert.ok(plan.transaction.sql.includes("current_setting('server_version_num')::integer<>"+serverVersionNum));
  owned.schemaOid=501;originalBaseline.fingerprint='f'.repeat(64);
  assert.throws(()=>bindOwner190CanonicalCleanup({...plan},plan.transaction,sqlFile),/UNMINTED_PLAN/);
  assert.throws(()=>bindOwner190CanonicalCleanup(plan,{...plan.transaction},sqlFile),/TRANSACTION_IDENTITY/);
  const profile=bindOwner190CanonicalCleanup(plan,plan.transaction,sqlFile),latch=createOwner190NativeOutcomeLatch();
  const attempt=latch.begin({...plan.transaction,token,fullJson:true,noticeProfile:profile});assert.equal(attempt.noticeProfile.schemaOid,500);assert.equal(attempt.noticeProfile.outerBefore.fingerprint,outerBefore.fingerprint);
  assert.throws(()=>createOwner190NativeOutcomeLatch().begin({...plan.transaction,sql:plan.transaction.sql+'SELECT 1',token,fullJson:true,noticeProfile:profile}),/COMPLETE_SQL_CHANGED/);
 }
 for(const serverVersionNum of [160011,190000,NaN,170011.5])assert.throws(()=>assertOwner190OwnedSchema({version:'owner190-owned-schema.v1',schema,schemaOid:500,ownerOid:10,serverVersionNum,sourceCommit},{schema,sourceCommit}));
});
