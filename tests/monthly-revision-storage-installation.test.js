import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {buildMonthlyRevisionStorageInstallation,assertMonthlyRevisionStorageDurability,MONTHLY_STORAGE_TARGETS} from '../scripts/lib/monthly-revision-storage-installation.mjs';
import {buildMonthlyRevisionStorageQa} from '../scripts/lib/monthly-revision-storage-qa.mjs';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8').replace(/\r\n?/g,'\n');
const options={read,sourceCommit:'d'.repeat(40),verifiedBudgetBytes:1073741824};
const sha=s=>createHash('sha256').update(s).digest('hex');

test('storage fixture retains every monthly circuit check and its whole-set decision cases',()=>{
 for(const major of[17,18]){
  const b=buildMonthlyRevisionStorageQa({serverMajor:major});assert.equal(b.report.checksPassed,685);assert.equal(b.report.monthlyStorageChecksPassed,11);
  assert.equal(b.report.monthlyAnnulChecksPassed,35);assert.equal(b.report.monthlyCorrectionChecksPassed,143);
  assert.equal(b.report.monthlyDecisionChecksPassed,137);assert.equal(b.report.monthlyDecisionBatches,26);assert.equal(b.report.monthlyDecisionRows,39);
  assert.match(b.sql,/BEGIN ISOLATION LEVEL READ COMMITTED/);assert.match(b.sql,/MONTHLY_STORAGE_ISOLATION_REQUIRED/);
  assert.match(b.sql,/current_database\(\)<>'own_payroll_run_qa'/);assert.doesNotMatch(b.sql,/current_database\(\)<>'native_monthly_qa'/);
  assert.match(b.sql,/SET STORAGE EXTERNAL/);assert.match(b.sql,/DELETE FROM monthly_storage_probe/);
  assert.match(b.sql,/lost proposal response recovers its exact original key and body/);
  assert.match(b.sql,/existing SQL120 whole-set annulment accepts corrected approved batches/);
  assert.doesNotMatch(b.sql,/INSERT\s+INTO\s+public\./i);assert.equal(b.report.durableInstallationVerified,false);
 }
});

test('exact monthly bodies preserve business rules and reserves while counting the full branch',()=>{
 const sources=['120-monthly-approved-annulments.sql','121-monthly-approved-corrections.sql'].map(f=>read('scripts/migrations/'+f));
 for(const p of MONTHLY_STORAGE_TARGETS){
  const source=sources.find(s=>s.includes('CREATE FUNCTION public.'+p.name+'('));assert.ok(source);
  const start=source.indexOf('CREATE FUNCTION public.'+p.name+'('),open=source.indexOf('$$',start),close=source.indexOf('$$',open+2),body=source.slice(open+2,close);
  assert.equal(sha(body),p.sha256);assert.equal(body.split('520093696').length,3);
  const after=body.replaceAll('520093696','1056964608').replaceAll('pg_database_size(current_database())','(SELECT sum(pg_database_size(oid)) FROM pg_database)');
  assert.equal(sha(after),p.afterSha256);assert.equal(after.split('2097152').length,body.split('2097152').length);
 }
 const b=buildMonthlyRevisionStorageInstallation(options);assert.equal(b.beforePins.length,2);
 assert.deepEqual(b.beforePins.map(p=>p.argNames),[['p_context','p_body','p_key'],['p_context','p_body','p_key']]);
 assert.doesNotMatch(b.mutations[0],/CREATE TABLE|GRANT |REVOKE |DROP |TRUNCATE |INSERT INTO|DELETE FROM|UPDATE public\./i);
});

test('missing budget, source drift and mixed monthly installations cannot be adapted',()=>{
 for(const budget of[undefined,null,0,536870912,1073741825])assert.throws(()=>buildMonthlyRevisionStorageInstallation({...options,verifiedBudgetBytes:budget}),/PROVIDER_BUDGET_REQUIRED/);
 assert.throws(()=>buildMonthlyRevisionStorageInstallation({...options,read:f=>read(f)+(f.endsWith('.sql')?'\n-- changed':'')}),/SOURCE_CHANGED/);
 const b=buildMonthlyRevisionStorageInstallation(options);assert.match(b.state,/old_count=2/);assert.match(b.state,/new_count=2/);
 assert.match(b.state,/PARTIAL_STATE/);assert.match(b.mutations[0],/FUNCTION_CHANGED/);assert.match(b.mutations[0],/ANCHOR_CHANGED/);
});

test('installation conserves prior state, exact authority and verify-only replay',()=>{
 const b=buildMonthlyRevisionStorageInstallation(options);assert.match(b.state,/repeatable read/);
 assert.match(b.state,/payroll-monthly:storage:v1/);assert.match(b.beforeCheck,/has_function_privilege/);assert.match(b.afterCheck,/aclexplode/);
 assert.match(b.before,/to_jsonb\(p\)-'prosrc'/);assert.match(b.conservation,/PRIOR_STATE_CHANGED/);
 assert.equal(b.verification[0],'SET TRANSACTION READ ONLY');assert.equal(b.connects,false);assert.equal(b.executesSql,false);
 const installed={version:'monthly-revision-storage-installation.v1',sourceCommit:options.sourceCommit,sourceHashes:b.sourceHashes,mode:'install',providerBudgetBytes:1073741824,storageCeilingBytes:1056964608,safetyMarginBytes:16777216,adaptedFunctions:2,newTables:0,newFunctions:0,businessWrites:0,existingAclChanges:0,nominalRowsReturned:0,preservationSha256:'a'.repeat(64)};
 assertMonthlyRevisionStorageDurability(installed,{...installed,mode:'verify'});
 for(const patch of[{preservationSha256:'b'.repeat(64)},{adaptedFunctions:1},{businessWrites:1},{existingAclChanges:1},{mode:'install'}])assert.throws(()=>assertMonthlyRevisionStorageDurability(installed,{...installed,mode:'verify',...patch}));
});

test('build includes the monthly protocol and keeps municipal sources private',()=>{
 const rules=read('.vercelignore').split('\n').map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));
 const included=file=>{let keep=true;for(const rule of rules){const neg=rule.startsWith('!'),p=neg?rule.slice(1):rule;if(p.endsWith('/')?file.startsWith(p):path.matchesGlob(file,p)||!p.includes('/')&&path.matchesGlob(path.basename(file),p))keep=neg;}return keep;};
 const b=buildMonthlyRevisionStorageInstallation({...options,read:f=>{assert.ok(included(f),'Build dependency excluded: '+f);return read(f);}});assert.equal(b.mutations.length,1);
 for(const f of['.handoff/private.json','AGENTS.md','CODEX_TASK.md','MUNICONTROL_HANDOFF.md','.env.local','verification/SQL170_INSTALLATION_REVIEW.json','data-rrhh/private.json','private.sql.gz'])assert.equal(included(f),false,f);
});
