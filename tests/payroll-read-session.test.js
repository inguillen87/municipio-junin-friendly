import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {buildPayrollReadSessionQa} from '../scripts/verify-payroll-read-session-postgres.mjs';
import {applyPayrollReadSession,MIGRATION_SHA256} from '../scripts/apply-payroll-read-session.mjs';
const read=n=>fs.readFileSync(new URL('../'+n,import.meta.url),'utf8').replaceAll('\r\n','\n');
const contract=JSON.parse(read('contracts/payroll-read-session.v1.json'));
const migration=read('scripts/migrations/105-payroll-independent-read-session.sql');
test('migration is fingerprint locked, private and scoped to three established readers',()=>{
 assert.equal(createHash('sha256').update(migration).digest('hex'),MIGRATION_SHA256);assert.equal(contract.callers.length,3);
 assert.deepEqual(contract.callers.map(c=>c.signature.split('(')[0]).sort(),['public.employee_payroll_detail_v1','public.employee_payroll_documents_v1','public.employee_payroll_history_v1']);
 assert.match(migration,/PAYROLL_WRITE_GUARD_CHANGED/);assert.match(migration,/PAYROLL_READER_ACL_CHANGED/);assert.match(migration,/aclexplode/);assert.match(migration,/prosecdef IS TRUE/);
 assert.doesNotMatch(migration,/\b(?:DELETE\s+FROM|UPDATE\s+\w+\s+SET|INSERT\s+INTO|DROP\s+|ALTER\s+ROLE|GRANT\s+ALL)\b/i);
 assert.match(read('.vercelignore'),/!scripts\/migrations\/105-payroll-independent-read-session.sql/);
});
for(const major of [17,18])for(const variant of ['repository','production'])test('synthetic SQL '+major+'/'+variant+' remains isolated and rolls back',()=>{
 const sql=buildPayrollReadSessionQa({expectedMajor:major,variant});assert.match(sql,/current_database\(\)<>'payroll_read_qa'/);assert.match(sql,/EMPTY_DISPOSABLE_DATABASE_REQUIRED/);
 assert.match(sql,/127\.0\.0\.1/);assert.match(sql,/TENANT_IAM_SOD_CONFLICT/);assert.match(sql,/RAISE EXCEPTION 'TENANT_IAM_SOD_CONFLICT'/);assert.match(sql,/ROLLBACK;/);assert.match(sql,/rollback_confirmed/);
 assert.equal(sql.split(migration).length,3);assert.doesNotMatch(sql,/noelia@|SCERCA|neon\.tech/);
});
function fixture(){return{functions:[{signature:contract.guardSignature.replace('public.',''),hash:contract.guardHash,securityDefiner:true,owner:'neondb_owner'},...contract.callers.map(c=>({signature:c.signature.replace('public.',''),hash:c.oldHash,securityDefiner:true,owner:'neondb_owner',acl:'owner-only-fixture'}))],sourceCutoff:'2026-09-10T18:17:30Z',capabilityFingerprint:'a'.repeat(32),publicationFingerprint:'b'.repeat(32)}}
const expected={expectedProject:'synthetic-project',expectedBranch:'br-synthetic-branch'};
test('preflight performs no transaction and never applies by default',async()=>{
 const answers=[[{database:'neondb',project:expected.expectedProject,branch:expected.expectedBranch,role:'neondb_owner'}],[{state:fixture()}],[]];let transactions=0;
 const result=await applyPayrollReadSession({sql:{query:async()=>answers.shift(),transaction:async()=>{transactions++}},...expected});
 assert.equal(result.mode,'preflight');assert.equal(result.databaseWrites,0);assert.equal(transactions,0);assert.equal(result.sourcePromoted,false);
});
for(const change of ['project','branch','database','role'])test('mismatched '+change+' cannot run schema SQL',async()=>{
 const target={database:'neondb',project:expected.expectedProject,branch:expected.expectedBranch,role:'neondb_owner',[change]:'different'};let queries=0;
 await assert.rejects(applyPayrollReadSession({sql:{query:async()=>{queries++;return[target]},transaction:()=>{throw Error('must not write')}},...expected,apply:true}),{code:'PAYROLL_READ_TARGET_MISMATCH'});assert.equal(queries,1);
});
test('changed reader and conflicting migration journal fail before a transaction',async()=>{
 for(const badLedger of [false,true]){const state=fixture();if(!badLedger)state.functions[1].hash='0'.repeat(64);
  const answers=[[{database:'neondb',project:expected.expectedProject,branch:expected.expectedBranch,role:'neondb_owner'}],[{state}],badLedger?[{checksum_sha256:'0'.repeat(64)}]:[]];
  await assert.rejects(applyPayrollReadSession({sql:{query:async()=>answers.shift(),transaction:()=>{throw Error('must not write')}},...expected,apply:true}),{code:badLedger?'PAYROLL_READ_LEDGER_DRIFT':'PAYROLL_READER_SOURCE_DRIFT'});
 }
});
