import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {buildFixedNoveltyStorageInstallation,assertFixedNoveltyStorageDurability,FIXED_STORAGE_TARGETS} from '../scripts/lib/fixed-novelty-storage-installation.mjs';
import {buildFixedNoveltyStorageQa} from '../scripts/lib/fixed-novelty-storage-qa.mjs';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8').replace(/\r\n?/g,'\n');
const options={read,sourceCommit:'d'.repeat(40),verifiedBudgetBytes:1073741824};
const sha=s=>createHash('sha256').update(s).digest('hex');

test('new SQL suite retains every prior case and distinguishes business from installation isolation',()=>{
 for(const major of[17,18]){
  const b=buildFixedNoveltyStorageQa({serverMajor:major});assert.equal(b.report.checksPassed,325);assert.equal(b.report.storageChecksPassed,10);
  assert.equal(b.report.reviewGroupChecksPassed,42);assert.equal(b.report.correctionGroupChecksPassed,36);assert.equal(b.report.groupChecksPassed,30);
  assert.equal(b.report.durableInstallationVerified,false);assert.match(b.sql,/BEGIN ISOLATION LEVEL READ COMMITTED/);
  assert.match(b.sql,/FIXED_STORAGE_ISOLATION_REQUIRED/);assert.match(b.sql,/FIXED_STORAGE_PARTIAL_STATE/);
  assert.match(b.sql,/SET STORAGE EXTERNAL/);assert.match(b.sql,/DELETE FROM fixed_storage_probe/);
  assert.doesNotMatch(b.sql,/INSERT\s+INTO\s+public\./i);
 }
});

test('four installed fixed-novelty bodies change only one ceiling and preserve every reserve',()=>{
 const sources=['092-payroll-fixed-novelties.sql','117-fixed-novelty-annul-groups.sql','118-fixed-novelty-correction-groups.sql','119-fixed-novelty-review-groups.sql'].map(f=>read('scripts/migrations/'+f));
 for(const p of FIXED_STORAGE_TARGETS){
  const source=sources.find(s=>new RegExp('CREATE(?: OR REPLACE)? FUNCTION public\\.'+p.name+'\\(').test(s));assert.ok(source,p.name);
  const start=source.search(new RegExp('CREATE(?: OR REPLACE)? FUNCTION public\\.'+p.name+'\\('));
  const opening=source.indexOf('$$',start),closing=source.indexOf('$$',opening+2),body=source.slice(opening+2,closing);
  assert.equal(sha(body),p.sha256,p.name);assert.equal(body.split('520093696').length,2,p.name);
  assert.equal(sha(body.replace('520093696','1056964608')),p.afterSha256,p.name);
 }
 const p=buildFixedNoveltyStorageInstallation(options);
 assert.equal(p.beforePins.length,4);assert.deepEqual(p.beforePins.map(p=>p.runtime),[false,true,true,true]);
 assert.doesNotMatch(p.mutations[0],/CREATE TABLE|GRANT |REVOKE |DROP |TRUNCATE |INSERT INTO|DELETE FROM|UPDATE public\./i);
});

test('unverified budget, changed source and partial installations are refused',()=>{
 for(const budget of[undefined,null,0,536870912,1073741825])assert.throws(()=>buildFixedNoveltyStorageInstallation({...options,verifiedBudgetBytes:budget}),/PROVIDER_BUDGET_REQUIRED/);
 assert.throws(()=>buildFixedNoveltyStorageInstallation({...options,read:f=>read(f)+(f.endsWith('.sql')?'\n-- source changed':'')}),/SOURCE_CHANGED/);
 const p=buildFixedNoveltyStorageInstallation(options);assert.match(p.state,/old_count=4/);assert.match(p.state,/new_count=4/);assert.match(p.state,/PARTIAL_STATE/);
 assert.match(p.mutations[0],/old_count<>4 AND new_count<>4/);assert.match(p.mutations[0],/FUNCTION_CHANGED/);
});

test('installation protects full prior state, mixed runtime ACLs and verify-only replay',()=>{
 const p=buildFixedNoveltyStorageInstallation(options);
 assert.match(p.state,/repeatable read/);assert.match(p.state,/payroll-fixed:capacity:v1/);
 assert.match(p.beforeCheck,/has_function_privilege/);assert.match(p.afterCheck,/aclexplode/);
 assert.match(p.before,/payroll_fixed_registry_capacity_v1/);assert.match(p.before,/payroll_fixed_review_group_decide_v1/);
 assert.match(p.before,/to_jsonb\(p\)-'prosrc'/);assert.match(p.conservation,/PRIOR_STATE_CHANGED/);
 assert.equal(p.verification[0],'SET TRANSACTION READ ONLY');assert.equal(p.connects,false);assert.equal(p.executesSql,false);
 const installed={version:'fixed-novelty-storage-installation.v1',sourceCommit:options.sourceCommit,sourceHashes:p.sourceHashes,mode:'install',providerBudgetBytes:1073741824,storageCeilingBytes:1056964608,safetyMarginBytes:16777216,adaptedFunctions:4,newTables:0,newFunctions:0,businessWrites:0,existingAclChanges:0,nominalRowsReturned:0,preservationSha256:'a'.repeat(64)};
 assertFixedNoveltyStorageDurability(installed,{...installed,mode:'verify'});
 for(const patch of[{preservationSha256:'b'.repeat(64)},{adaptedFunctions:3},{businessWrites:1},{existingAclChanges:1},{mode:'install'}])assert.throws(()=>assertFixedNoveltyStorageDurability(installed,{...installed,mode:'verify',...patch}));
});

test('build packages the reviewed protocol while private municipal sources remain excluded',()=>{
 const rules=read('.vercelignore').split('\n').map(s=>s.trim()).filter(s=>s&&!s.startsWith('#'));
 const included=file=>{let keep=true;for(const rule of rules){const neg=rule.startsWith('!'),p=neg?rule.slice(1):rule;if(p.endsWith('/')?file.startsWith(p):path.matchesGlob(file,p)||!p.includes('/')&&path.matchesGlob(path.basename(file),p))keep=neg;}return keep;};
 const batch=buildFixedNoveltyStorageInstallation({...options,read:f=>{assert.ok(included(f),'Build dependency excluded: '+f);return read(f);}});assert.equal(batch.mutations.length,1);
 for(const f of['.handoff/noelia-payroll-visible-source-20261014.json','AGENTS.md','CODEX_TASK.md','MUNICONTROL_HANDOFF.md','.env.local','verification/SQL169_INSTALLATION_REVIEW.json','data-rrhh/private.json','private.sql.gz'])assert.equal(included(f),false,f);
});
