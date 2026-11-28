// Pure, synthetic QA-transport contract regression. No PostgreSQL/network/browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createOwnQaCaptureSql} from '../scripts/lib/qa-run-capture-lock.mjs';
import {runFinalClassificationReceiptPreviewQa} from '../scripts/lib/own-period-classification-final-qa.mjs';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const hash=s=>createHash('sha256').update(s).digest('hex'),lf=s=>s.replace(/\r\n?/g,'\n');
const file='scripts/lib/own-payroll-psql-qa.mjs';
const reviewedTransportSha256='bb8992cced0475aedae552e672ed0506d9e28b94bfde04565b0fd6c667c8a1ea';
const originalExecuteSha256='84ef17d6c1c7456bb4647c61f2cb8118959f82c115c6ae638f5dd4488d6fd0a3';
const originalTransactionAndResultTailSha256='3ab4c4344c4bbd3c4488fe90d6da842f06cf22f5250957b091b469271c358e64';
const schema='mc_qa_fixed_092_'+'b'.repeat(32);
const rendered='SELECT '+schema+'.own_receipt_preview_v1(NULL,NULL) AS result';
function captureOptions(reader,calls){
 return {read:reader,schema,db:{run:async()=>{calls.count++;assert.fail('unexpected SQL');},query:async()=>{calls.count++;assert.fail('unexpected RPC');}},record:()=>assert.fail('unexpected observation')};
}
test('reviewed opt-in transport retains exact execute, transaction, role, COMMIT and diagnostic bodies',()=>{
 const source=lf(read(file));assert.equal(hash(source),reviewedTransportSha256);
 const start=source.indexOf('function execute('),end=source.indexOf('\n// An explicit synthetic GitHub reports',start);
 assert.ok(start>=0&&end>start);assert.equal(hash(source.slice(start,end)),originalExecuteSha256);
 const at=source.indexOf('  assert.match(schema, /^mc_qa_fixed_092_');assert.ok(at>0);
 assert.equal(hash(source.slice(at)),originalTransactionAndResultTailSha256);
});
test('both reviewed consumers accept only the exact adopted transport without a real SQL call',async()=>{
 const calls={count:0};const adapter=createOwnQaCaptureSql(captureOptions(read,calls));
 assert.deepEqual(adapter.captureLockProof(),{requests:0,attempts:0,retries:0,refusals:0,maxAttempts:3,maxObservedAttempts:0});
 assert.equal(calls.count,0);
 const value={syntheticPreviewContractOnly:true};let observed=0;
 const result=await runFinalClassificationReceiptPreviewQa({read,schema,rendered,execute:async sql=>{observed++;assert.equal(sql,'\n\\set VERBOSITY verbose\n'+rendered);return value;},onSqlError:()=>assert.fail('unexpected SQL error'),pause:()=>assert.fail('unexpected retry')});
 assert.deepEqual(result,{value,attempts:1,retries:0,maxAttempts:3});assert.equal(observed,1);
});
test('unknown, changed transaction, disabled ON_ERROR_STOP and rollback transports reject before execution',async()=>{
 const canonical=read(file);
 for(const change of [
  s=>s+'\n// unknown reviewed transport is forbidden\n',
  s=>s.replace('BEGIN ISOLATION LEVEL READ COMMITTED','BEGIN ISOLATION LEVEL REPEATABLE READ'),
  s=>s.replace('ON_ERROR_STOP=1','ON_ERROR_STOP=0'),
  s=>s.replace('; COMMIT;','; ROLLBACK;')
 ]){
  const changed=change(canonical);assert.notEqual(changed,canonical);
  const reader=p=>p===file?changed:read(p),calls={count:0};
  assert.throws(()=>createOwnQaCaptureSql(captureOptions(reader,calls)),/QA_CAPTURE_TRANSACTION_TRANSPORT_CHANGED/);
  await assert.rejects(runFinalClassificationReceiptPreviewQa({read:reader,schema,rendered,execute:async()=>{calls.count++;assert.fail('changed source executed');},onSqlError:()=>assert.fail('changed source reached SQL')}),/FINAL_CLASSIFICATION_RECEIPT_PREVIEW_SOURCE_CHANGED/);
  assert.equal(calls.count,0);
 }
});
