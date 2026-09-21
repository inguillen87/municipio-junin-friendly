import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildClockSourcePostgresQa,parseClockSourceQaArgs,syntheticClockSourcePayload,syntheticClockSourceRecord} from '../../verify-clock-source-postgres.mjs';
import {validateZk40Payload} from '../../../lib/internal-zk40-reception.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const script=path.join(root,'scripts/verify-clock-source-postgres.mjs');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

test('SQL QA synthetic raw40 payloads satisfy the existing wire receiver for 1, 500 and 501 records',()=>{
 for(const count of [1,500,501]){
  const bytes=Buffer.concat(Array.from({length:count},(_,i)=>syntheticClockSourceRecord(i+1)));
  assert.equal(bytes.length,count*40);
  for(let start=0;start<count;start+=500){
   const part=bytes.subarray(start*40,Math.min(count,start+500)*40);
   const value=syntheticClockSourcePayload('SYNTHETIC-SOURCE-0',part,{recordsHash:hash(bytes),total:count,start,snapshotCount:count+99,ordinals:Array.from({length:part.length/40},(_,i)=>start+i+100)});
   assert.equal(validateZk40Payload(value),value);
   assert.equal(value.partSha256,hash(Buffer.from(value.recordsBase64,'base64')));
  }
 }
 assert.throws(()=>syntheticClockSourceRecord(-1));
 assert.throws(()=>syntheticClockSourceRecord(65536));
});

test('QA generation requires an explicit supported version and never accepts execution or remote-connection arguments',()=>{
 for(const version of [undefined,16,19,'17;SELECT 1'])assert.throws(()=>buildClockSourcePostgresQa({serverMajor:version}));
 for(const argv of [[],['--ci'],['--ci','--write-sql=qa.sql','--execute'],['--ci','--write-sql=qa.sql','--database-url=postgresql://remote/production'],['--ci','--write-sql=qa.sql','--require-concurrency'],['--ci','--ci','--write-sql=qa.sql'],['--ci','--write-sql=a.sql','--write-sql=b.sql']])assert.throws(()=>parseClockSourceQaArgs(argv));
 assert.deepEqual(parseClockSourceQaArgs(['--ci','--expected-major=18','--write-sql=qa.sql','--require-concurrency','--write-lock-sql=lock.sql']),{ci:true,'expected-major':'18','write-sql':'qa.sql',concurrency:true,'write-lock-sql':'lock.sql'});
});

test('generated SQL is pinned to an empty local disposable database and rolls back the actual migration',()=>{
 for(const serverMajor of [17,18]){
  const qa=buildClockSourcePostgresQa({serverMajor,requireConcurrency:true});
  assert.equal(qa.report.serverMajor,serverMajor);
  assert.equal(qa.report.productionContacted,false);
  assert.equal(qa.report.clockContacted,false);
  assert.equal(qa.report.concurrentWriterCheck,true);
  for(const sql of [qa.sql,qa.lockSql]){
   assert.match(sql,/current_database\(\)<>'clock_source_qa'/);
   assert.match(sql,/inet_server_addr\(\).*127\.0\.0\.1/s);
   assert.match(sql,/neon\.project_id/);
   assert.match(sql,/\\set ON_ERROR_STOP on/);
   assert.match(sql,/ROLLBACK;\s*$/);
   assert.doesNotMatch(sql,/^\s*COMMIT\s*;/mi);
  }
  assert.match(qa.sql,/CLOCK_SOURCE_QA_ROLLBACK_FAILED/);
  assert.match(qa.sql,/CLOCK_SOURCE_QA_ROLLBACK_LEFT_OBJECTS/);
  assert.match(qa.sql,/CREATE OR REPLACE FUNCTION clock_source\.receive_v1/);
  const signal=qa.sql.match(/clock-source:qa-release:([a-f0-9-]+)/)?.[0];
  assert.ok(signal);assert.ok(qa.lockSql.includes(signal));
 }
});

test('CLI generates offline evidence without executing SQL and will not replace an existing output',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'clock-source-generator-'));
 try{
  const sql=path.join(dir,'source.sql'),lock=path.join(dir,'lock.sql');
  const args=['--ci','--expected-major=17','--require-concurrency','--write-sql='+sql,'--write-lock-sql='+lock];
  const result=spawnSync(process.execPath,[script,...args],{cwd:root,encoding:'utf8',timeout:10000,env:{...process.env,DATABASE_URL:'postgresql://unused.invalid/never-contacted'}});
  assert.equal(result.status,0,result.stderr);
  const report=JSON.parse(result.stdout);assert.equal(report.generated,true);assert.equal(report.databaseExecuted,false);
  assert.match(await readFile(sql,'utf8'),/CLOCK_SOURCE_QA_SUCCESS_ROLLBACK/);
  assert.match(await readFile(lock,'utf8'),/CLOCK_SOURCE_QA_LOCK_READY/);
  await writeFile(sql,'preserved existing evidence');
  const retry=spawnSync(process.execPath,[script,...args],{cwd:root,encoding:'utf8',timeout:10000});
  assert.equal(retry.status,1);assert.equal(await readFile(sql,'utf8'),'preserved existing evidence');
 }finally{await rm(dir,{recursive:true,force:true});}
});
