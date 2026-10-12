import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import{buildParticipationCommandGuardInstallation,assertParticipationCommandGuardDurability}from'../scripts/lib/own-participation-command-guard-installation.mjs';
import{buildOwnPeriodParticipationSql,SQL157_SHA256,SQL161_SHA256}from'../scripts/lib/own-period-participation-installation.mjs';
import{buildOwnSalarySenioritySql,SQL156_SHA256,SQL162_SHA256}from'../scripts/lib/own-salary-seniority-installation.mjs';
import{splitPostgresStatements}from'../scripts/lib/sql-statements.mjs';
import{ownInstallationFunctionPin}from'../scripts/lib/own-payroll-installation.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'),options={read,sourceCommit:'a'.repeat(40)};
const batch=buildParticipationCommandGuardInstallation(options),old=buildOwnPeriodParticipationSql({...options,commandContentionGuard:false}),next=buildOwnPeriodParticipationSql(options);
test('two existing commands change; every other function and consumer remains exact',()=>{
 assert.equal(batch.connects,false);assert.equal(batch.executesSql,false);assert.equal(batch.beforePin.signature,'public.own_participation_command_v1(jsonb,jsonb,uuid)');
 assert.deepEqual({...batch.beforePin,sha256:null},{...batch.afterPin,sha256:null});assert.deepEqual(old.changed,next.changed);
 assert.equal(next.newPins.length,16);assert.equal(next.newPins.filter((p,i)=>p.sha256!==old.newPins[i].sha256).length,1);
 assert.equal(batch.sourceHashes['scripts/migrations/157-own-period-participation.sql'],SQL157_SHA256);assert.equal(batch.sourceHashes['scripts/migrations/161-own-participation-command-guard.sql'],SQL161_SHA256);
 assert.equal(batch.sourceHashes['scripts/migrations/156-own-salary-seniority.sql'],SQL156_SHA256);assert.equal(batch.sourceHashes['scripts/migrations/162-own-seniority-command-guard.sql'],SQL162_SHA256);
 const prior=buildOwnSalarySenioritySql({...options,commandContentionGuard:false}),guarded=buildOwnSalarySenioritySql(options);
 assert.deepEqual(prior.changed,guarded.changed);assert.equal(guarded.newPins.length,12);assert.equal(guarded.newPins.filter((p,i)=>p.sha256!==prior.newPins[i].sha256).length,1);
 assert.equal(batch.pairs.length,2);assert.equal(batch.mutations.length,2);
 assert.doesNotMatch(batch.mutation,/CREATE (?:TABLE|ROLE|DATABASE)|GRANT|REVOKE|DROP|TRUNCATE|INSERT INTO [^;]*tenant_membership/i);
});
test('incoming payload, exact fingerprints, independent decisions and original NOWAIT guard survive',()=>{
 const anchor=' PERFORM public.own_participation_lock_v1(ctx);fingerprint:=';
 assert.equal(batch.original.split(anchor).length,2);assert.equal(batch.replacement.split(anchor).length,2);
 assert.equal(batch.original.split(anchor)[1],batch.replacement.split(anchor)[1]);
 assert.ok(batch.replacement.startsWith(batch.original.split(anchor)[0]));
 const lock=b=>b.migration.find(s=>s.startsWith('CREATE FUNCTION public.own_participation_lock_v1('));assert.equal(lock(old),lock(next));assert.match(lock(next),/IN SHARE MODE NOWAIT/);
 assert.match(batch.replacement,/LOCK TABLE public\.%I IN SHARE MODE/);assert.match(batch.replacement,/limit_ms>1000/);
 assert.match(batch.replacement,/lock_deadline:=clock_timestamp\(\)\+limit_ms\*interval '1 millisecond'/);
 assert.match(batch.replacement,/FOREACH locked_relation IN ARRAY ARRAY\['native_employee_registration','employment_contract','person_identity'\]/);
 assert.match(batch.replacement,/lock_deadline-clock_timestamp\(\)/);assert.match(batch.replacement,/remaining_ms<=0 THEN RAISE lock_not_available/);
 assert.match(batch.replacement,/remaining_ms::text\|\|'ms',true/);
 assert.equal((batch.replacement.match(/set_config\('lock_timeout',previous_timeout,true\)/g)||[]).length,2);
 assert.match(batch.replacement,/expires_at>clock_timestamp\(\)/);assert.match(batch.replacement,/last_seen_at>clock_timestamp\(\)-interval '1 hour'/);
 assert.match(batch.replacement,/fresh:=public.native_salary_administrative_context_v1\(p\)/);
});
test('technical batch preserves complete tables and all metadata except the two admitted bodies',()=>{
 assert.match(batch.before,/mc_participation_guard_no_excluded_table/);assert.match(batch.before,/mc_participation_guard_no_excluded_function_%/);
 assert.match(batch.before,/to_jsonb\(p\)-'prosrc'/);assert.match(batch.before,/roles/);assert.match(batch.before,/memberships/);assert.match(batch.before,/sequences/);
 assert.match(batch.mode,/repeatable read/);assert.match(batch.mode,/mode','verify'/);assert.match(batch.conservation,/PARTICIPATION_GUARD_PRIOR_STATE_CHANGED/);
 assert.equal(splitPostgresStatements(read('scripts/migrations/161-own-participation-command-guard.sql')).length,1);
 assert.equal(splitPostgresStatements(read('scripts/migrations/162-own-seniority-command-guard.sql')).length,1);
 assert.deepEqual(ownInstallationFunctionPin(batch.mutation),ownInstallationFunctionPin(batch.replacement));
 for(let i=0;i<2;i++)assert.deepEqual(ownInstallationFunctionPin(batch.mutations[i]),ownInstallationFunctionPin(batch.pairs[i].replacement));
 assert.match(batch.before,/own_seniority_command_v1\(jsonb,jsonb,uuid\)'::regprocedure/);
 for(const p of batch.pairs){assert.ok(batch.beforeCheck.includes(p.beforePin.sha256));assert.ok(batch.afterCheck.includes(p.afterPin.sha256));assert.ok(batch.beforeCheck.includes(p.beforePin.signature));assert.ok(batch.afterCheck.includes(p.afterPin.signature));}
});
test('unknown source or invalid configuration never generates an installable body',()=>{
 assert.throws(()=>buildParticipationCommandGuardInstallation({...options,sourceCommit:'main'}));
 for(const file of['156-own-salary-seniority.sql','157-own-period-participation.sql','161-own-participation-command-guard.sql','162-own-seniority-command-guard.sql'])assert.throws(()=>buildParticipationCommandGuardInstallation({...options,read:p=>read(p)+(p.endsWith(file)?'\n-- changed':'')}),/SOURCE_CHANGED/);
 assert.throws(()=>buildOwnPeriodParticipationSql({...options,commandContentionGuard:'true'}));
});
test('durability rejects incorrect source, extra mutations, ACL change and altered footprints',()=>{
 const base={version:'participation-command-guard-installation.v2',sourceCommit:options.sourceCommit,sourceHashes:batch.sourceHashes,newTables:0,newFunctions:0,adaptedFunctions:2,existingAclChanges:0,businessWrites:0,nominalRowsReturned:0,preservationSha256:'b'.repeat(64),objectFingerprint:'c'.repeat(64)},installed={...base,mode:'install'},durable={...base,mode:'verify'};
 assert.equal(assertParticipationCommandGuardDurability({installed,durable,batch}).passed,true);
 for(const patch of[{sourceCommit:'d'.repeat(40)},{newTables:1},{newFunctions:1},{adaptedFunctions:1},{existingAclChanges:1},{businessWrites:1},{nominalRowsReturned:1},{objectFingerprint:'e'.repeat(64)},{preservationSha256:'f'.repeat(64)},{sourceHashes:{}}])assert.throws(()=>assertParticipationCommandGuardDurability({installed,durable:{...durable,...patch},batch}));
});

test('seniority retains its exact original payload and decision logic and rejects invalid time or authority after waiting',()=>{
 const pair=batch.pairs[1],anchor=' PERFORM public.own_seniority_lock_v1(ctx);fingerprint:=';
 assert.equal(pair.original.split(anchor).length,2);assert.equal(pair.replacement.split(anchor).length,2);
 assert.equal(pair.original.split(anchor)[1],pair.replacement.split(anchor)[1]);assert.ok(pair.replacement.startsWith(pair.original.split(anchor)[0]));
 const prior=buildOwnSalarySenioritySql({...options,commandContentionGuard:false}),next=buildOwnSalarySenioritySql(options),lock=b=>b.migration.find(s=>s.startsWith('CREATE FUNCTION public.own_seniority_lock_v1('));
 assert.equal(lock(prior),lock(next));assert.match(lock(next),/IN SHARE MODE NOWAIT/);
 assert.match(pair.replacement,/limit_ms>1000/);assert.match(pair.replacement,/lock_deadline-clock_timestamp\(\)/);
 assert.match(pair.replacement,/fresh:=public.native_salary_administrative_context_v1\(p\)/);
 assert.match(pair.replacement,/expires_at>clock_timestamp\(\)/);assert.match(pair.replacement,/last_seen_at>clock_timestamp\(\)-interval '1 hour'/);
 assert.equal((pair.replacement.match(/set_config\('lock_timeout',previous_timeout,true\)/g)||[]).length,2);
});
