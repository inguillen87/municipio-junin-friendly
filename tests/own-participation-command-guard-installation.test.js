import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import{buildParticipationCommandGuardInstallation,assertParticipationCommandGuardDurability}from'../scripts/lib/own-participation-command-guard-installation.mjs';
import{buildOwnPeriodParticipationSql,SQL157_SHA256,SQL161_SHA256}from'../scripts/lib/own-period-participation-installation.mjs';
import{splitPostgresStatements}from'../scripts/lib/sql-statements.mjs';
import{ownInstallationFunctionPin}from'../scripts/lib/own-payroll-installation.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'),options={read,sourceCommit:'a'.repeat(40)};
const batch=buildParticipationCommandGuardInstallation(options),old=buildOwnPeriodParticipationSql({...options,commandContentionGuard:false}),next=buildOwnPeriodParticipationSql(options);
test('one existing command changes; every other function and consumer remains exact',()=>{
 assert.equal(batch.connects,false);assert.equal(batch.executesSql,false);assert.equal(batch.beforePin.signature,'public.own_participation_command_v1(jsonb,jsonb,uuid)');
 assert.deepEqual({...batch.beforePin,sha256:null},{...batch.afterPin,sha256:null});assert.deepEqual(old.changed,next.changed);
 assert.equal(next.newPins.length,16);assert.equal(next.newPins.filter((p,i)=>p.sha256!==old.newPins[i].sha256).length,1);
 assert.equal(batch.sourceHashes['scripts/migrations/157-own-period-participation.sql'],SQL157_SHA256);assert.equal(batch.sourceHashes['scripts/migrations/161-own-participation-command-guard.sql'],SQL161_SHA256);
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
test('technical batch preserves complete tables and all metadata except the one admitted body',()=>{
 assert.match(batch.before,/mc_participation_guard_no_excluded_table/);assert.match(batch.before,/mc_participation_guard_no_excluded_function_%/);
 assert.match(batch.before,/to_jsonb\(p\)-'prosrc'/);assert.match(batch.before,/roles/);assert.match(batch.before,/memberships/);assert.match(batch.before,/sequences/);
 assert.match(batch.mode,/repeatable read/);assert.match(batch.mode,/mode','verify'/);assert.match(batch.conservation,/PARTICIPATION_GUARD_PRIOR_STATE_CHANGED/);
 assert.equal(splitPostgresStatements(read('scripts/migrations/161-own-participation-command-guard.sql')).length,1);
 assert.deepEqual(ownInstallationFunctionPin(batch.mutation),ownInstallationFunctionPin(batch.replacement));
});
test('unknown source or invalid configuration never generates an installable body',()=>{
 assert.throws(()=>buildParticipationCommandGuardInstallation({...options,sourceCommit:'main'}));
 for(const file of['157-own-period-participation.sql','161-own-participation-command-guard.sql'])assert.throws(()=>buildParticipationCommandGuardInstallation({...options,read:p=>read(p)+(p.endsWith(file)?'\n-- changed':'')}),/SOURCE_CHANGED/);
 assert.throws(()=>buildOwnPeriodParticipationSql({...options,commandContentionGuard:'true'}));
});
test('durability rejects incorrect source, extra mutations, ACL change and altered footprints',()=>{
 const base={version:'participation-command-guard-installation.v1',sourceCommit:options.sourceCommit,sourceHashes:batch.sourceHashes,newTables:0,newFunctions:0,adaptedFunctions:1,existingAclChanges:0,businessWrites:0,nominalRowsReturned:0,preservationSha256:'b'.repeat(64),objectFingerprint:'c'.repeat(64)},installed={...base,mode:'install'},durable={...base,mode:'verify'};
 assert.equal(assertParticipationCommandGuardDurability({installed,durable,batch}).passed,true);
 for(const patch of[{sourceCommit:'d'.repeat(40)},{newTables:1},{newFunctions:1},{adaptedFunctions:2},{existingAclChanges:1},{businessWrites:1},{nominalRowsReturned:1},{objectFingerprint:'e'.repeat(64)},{preservationSha256:'f'.repeat(64)},{sourceHashes:{}}])assert.throws(()=>assertParticipationCommandGuardDurability({installed,durable:{...durable,...patch},batch}));
});
