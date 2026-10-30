import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildOwnFixedForcedAmountInstallation,assertOwnFixedForcedAmountDurability,assertOwnFixedForcedAmountRollback,FIXED_FORCED_INSTALL_SQL,FIXED_FORCED_INSTALL_SQL_SHA256} from '../scripts/lib/own-fixed-forced-amount-installation.mjs';
import {splitPostgresStatements} from '../scripts/lib/sql-statements.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'),sha=s=>createHash('sha256').update(s).digest('hex');
const options={read,sourceCommit:'a'.repeat(40),operationalPairBaseline:'pre107'},batch=buildOwnFixedForcedAmountInstallation(options),sql=read(FIXED_FORCED_INSTALL_SQL);
// SQL is generated/read as text. No PostgreSQL process or handler is invoked.
test('196 is tied to the frozen additive source and effective six-function predecessor, with source-counted helpers',()=>{
 assert.equal(sha(sql),FIXED_FORCED_INSTALL_SQL_SHA256);assert.equal(batch.connects,false);assert.equal(batch.executesSql,false);
 assert.equal(batch.beforePins.length,6);assert.equal(batch.afterPins.length,6);assert.equal(batch.newPins.length,3);
 assert.deepEqual(batch.newPins.map(p=>p.name).sort(),['own_fixed_forced_capture_v1','own_fixed_forced_expression_set_v1','own_fixed_forced_policy_v1']);
 assert.equal(batch.newPins.some(p=>p.runtime),false);assert.equal(batch.afterPins.filter(p=>p.runtime).length,2);
 for(let n=0;n<6;n++){assert.deepEqual({...batch.beforePins[n],sha256:null},{...batch.afterPins[n],sha256:null});assert.notEqual(batch.beforePins[n].sha256,batch.afterPins[n].sha256);assert.equal(batch.previous.afterCheck.split(batch.beforePins[n].sha256).length-1,1);assert.ok(batch.afterCheck.includes(batch.afterPins[n].sha256));assert.ok(!batch.afterCheck.includes(batch.beforePins[n].sha256));}
 assert.ok(batch.beforeCheck.startsWith(batch.previous.afterCheck));assert.equal(batch.sourceHashes[FIXED_FORCED_INSTALL_SQL],FIXED_FORCED_INSTALL_SQL_SHA256);
});
test('all actual statements stay byte-exact, inherited signatures replace and no grant or business write is added',()=>{
 assert.deepEqual(batch.mutations,splitPostgresStatements(sql));assert.equal(batch.mutations.length,12);
 assert.ok(batch.adapted.every(d=>d.startsWith('CREATE OR REPLACE FUNCTION ')));assert.equal(batch.adapted.length,6);
 assert.equal(batch.mutations.filter(d=>d.startsWith('REVOKE ALL ON FUNCTION ')).length,batch.newPins.length);
 assert.ok(batch.mutations.every(s=>!/^\s*(?:GRANT|ALTER|INSERT|UPDATE|DELETE|DROP)\b/i.test(s)));
 assert.equal(batch.adapted.some(d=>/FUNCTION public\.own_program_command_v1\(/.test(d)),false);
 assert.ok(batch.beforeCheck.includes(batch.previous.afterPin.sha256));assert.ok(batch.afterCheck.includes(batch.previous.afterPin.sha256),'wrapper190 remains exact');
});
test('source drift cannot substitute arbitrary SQL or a changed effective predecessor',()=>{
 assert.throws(()=>buildOwnFixedForcedAmountInstallation({...options,read:p=>read(p)+(p===FIXED_FORCED_INSTALL_SQL?'\n-- drift':'')}),/SQL_CHANGED/);
 const old='scripts/migrations/173-own-full-payroll-response.sql';assert.throws(()=>buildOwnFixedForcedAmountInstallation({...options,read:p=>read(p)+(p===old?'\n-- drift':'')}),/PRIOR_SOURCE_CHANGED/);
 assert.throws(()=>buildOwnFixedForcedAmountInstallation({...options,sourceCommit:'not-a-commit'}));
 assert.throws(()=>buildOwnFixedForcedAmountInstallation({...options,operationalPairBaseline:undefined}),/BASELINE_REQUIRED/);
 assert.throws(()=>buildOwnFixedForcedAmountInstallation({...options,operationalPairBaseline:'auto'}),/BASELINE_REQUIRED/);
});
test('conservation covers190 rows wrapper and all security metadata; only six source bodies and exact new helpers are excepted',()=>{
 for(const text of[batch.before,batch.after]){
  for(const k of["'roles'","'memberships'","'defaultAcl'","'policies'","'constraints'","'indexes'","'attributes'","'types'","'triggers'","'views'","'relations'","'eventTriggers'",'relrowsecurity','relforcerowsecurity','relacl','last_value','rowsSha256'])assert.ok(text.includes(k),k);
  assert.ok(!text.includes("AND NOT(ns.nspname='public' AND left(p.proname,24)='municipal_owner_program_')"));
  assert.ok(!text.includes("IS DISTINCT FROM to_regclass('public.municipal_owner_program_provenance')"));
  assert.ok(!text.includes("p.oid=to_regprocedure('public.own_program_command_v1(jsonb,jsonb,uuid)') THEN"));
  assert.equal(text.split("THEN to_jsonb(p)-'prosrc'").length-1,1);
  for(const p of batch.beforePins)assert.ok(text.includes('to_regprocedure(\''+p.signature+'\')'));
  for(const p of batch.newPins)assert.ok(text.includes('p.oid IS DISTINCT FROM to_regprocedure(\''+p.signature+'\')'));
  assert.ok(!text.includes('p.oid NOT IN('),'NULL before new helpers exist must not omit all functions');
 }
});
test('mixed states and extra helpers or grants fail closed before apply; transaction scope is explicit',()=>{
 assert.ok(batch.mode.includes('FIXED_FORCED_INSTALL_PARTIAL_STATE'));assert.ok(batch.mode.includes("'install'"));assert.ok(batch.mode.includes("'verify'"));
 for(const p of batch.beforePins)assert.ok(batch.mode.includes(p.sha256));for(const p of batch.afterPins)assert.ok(batch.mode.includes(p.sha256));
 assert.ok(batch.mode.includes("left(proname,17)='own_fixed_forced_'"));
 assert.ok(batch.afterCheck.includes('aclexplode'));assert.ok(batch.afterCheck.includes("has_function_privilege('municontrol_actions_runtime_app'"));assert.ok(batch.afterCheck.includes('FIXED_FORCED_INSTALL_FAMILY_CHANGED'));
 assert.ok(batch.installation[0].includes("transaction_read_only')<>'off'"));assert.ok(batch.installation[0].includes('NOT IN(17,18)'));assert.ok(batch.installation[0].includes("transaction_isolation')<>'repeatable read'"));
 assert.ok(batch.verification[0].includes("transaction_read_only')<>'on'"));
});
test('strict phase choose snapshot apply full guard and readiness precede proof; verify never reinstalls',()=>{
 for(const [steps,mode]of[[batch.installation,'install'],[batch.repetition,'verify']]){
  assert.equal(steps[1],batch.mode);assert.ok(steps[2].includes("<>\'"+mode+"\'"));assert.equal(steps[3],batch.choose);assert.equal(steps[4],batch.before);assert.equal(steps[5],batch.apply);assert.equal(steps[6],batch.afterCheck);assert.equal(steps[7],batch.readiness);assert.equal(steps[8],batch.after);assert.equal(steps[9],batch.audit);
 }
 assert.deepEqual(batch.rehearsal,batch.installation);assert.ok(batch.apply.includes("mode')='install'"));assert.ok(batch.verification.includes(batch.afterCheck));assert.ok(batch.verification.includes(batch.readiness));
 assert.equal(batch.verification.some(s=>s===batch.apply),false);assert.ok(batch.readiness.includes('PERFORM public.municipal_adoption_ready_v1()'));
 for(const p of batch.beforePins)assert.equal(batch.previous.ready.includes(p.sha256),false);assert.ok(batch.afterCheck.includes(batch.previous.afterReadyPin.sha256));
});
test('rollback is writable and guarded before any DDL, preserves existing history and restores exact inherited definitions',()=>{
 const steps=batch.rollback,firstRestore=steps.findIndex(s=>s.startsWith('CREATE OR REPLACE FUNCTION '));
 assert.ok(steps[0].includes('TRANSACTION_REQUIRED'));assert.equal(steps[1],batch.afterCheck);assert.equal(steps[2],batch.noHistory);assert.ok(firstRestore>3);assert.equal(steps[3],batch.before);
 for(const k of['public.own_payroll_program_event','base_definition','public.own_payroll_run_capture','public.own_payroll_run_result','fixedForcedAmountsVersion','fixedForcedAmountsPolicy','fixedForcedAmounts'])assert.ok(batch.noHistory.includes(k));
 const expected=batch.originals.toReversed().map(d=>d.replace(/^CREATE (?:OR REPLACE )?FUNCTION /,'CREATE OR REPLACE FUNCTION '));assert.deepEqual(steps.slice(firstRestore,firstRestore+6),expected);
 assert.deepEqual(steps.filter(s=>s.startsWith('DROP FUNCTION ')),batch.newPins.toReversed().map(p=>'DROP FUNCTION '+p.signature));
 assert.ok(!/\bCASCADE\b|DELETE FROM|UPDATE public/.test(steps.join('\n')));assert.ok(steps.includes(batch.beforeCheck));assert.ok(steps.includes(batch.readiness));assert.ok(batch.rollbackVerification.includes(batch.beforeCheck));
});
function receipts(rollback=false){const base={version:batch.version,sourceCommit:batch.sourceCommit,sourceHashes:batch.sourceHashes,operationalPairBaseline:batch.operationalPairBaseline,newTables:0,newFunctions:rollback?0:batch.newPins.length,adaptedFunctions:rollback?0:batch.afterPins.length,businessWrites:0,iamWrites:0,existingAclChanges:0,nominalRowsReturned:0,priorMetadataSha256:'a'.repeat(64),objectSha256:'b'.repeat(64)},value=(mode,preserved,hash)=>({...base,mode,transactionDataPreserved:preserved,preservationSha256:hash.repeat(64)});return rollback?{rolledBack:value('rollback',true,'c'),durable:value('rollback_verify',false,'d'),batch}:{installed:value('install',true,'c'),durable:value('verify',false,'d'),repeated:value('verify',true,'e'),batch};}
test('durability compares objects and metadata across connections while conservation stays transaction-local',()=>{
 const r=receipts();assert.equal(assertOwnFixedForcedAmountDurability(r).wholeDatabaseStaticAcrossConnections,false);
 for(const patch of[{mode:'install'},{transactionDataPreserved:true},{objectSha256:'f'.repeat(64)},{priorMetadataSha256:'f'.repeat(64)},{sourceHashes:{}},{newFunctions:4},{businessWrites:1},{existingAclChanges:1},{unexpected:true}])assert.throws(()=>assertOwnFixedForcedAmountDurability({...r,durable:{...r.durable,...patch}}));
});
test('rollback durable receipts require zero remaining additions and preserved restored-object fingerprint',()=>{
 const r=receipts(true);assert.equal(assertOwnFixedForcedAmountRollback(r).objectsDurable,true);
 for(const patch of[{newFunctions:3},{adaptedFunctions:6},{transactionDataPreserved:true},{mode:'verify'},{objectSha256:'f'.repeat(64)}])assert.throws(()=>assertOwnFixedForcedAmountRollback({...r,durable:{...r.durable,...patch}}));
});
test('published107 remains an explicit alternative with identical mutations and different exact predecessor guards',()=>{
 const p=buildOwnFixedForcedAmountInstallation({...options,operationalPairBaseline:'published107'});assert.deepEqual(p.mutations,batch.mutations);assert.deepEqual(p.afterPins,batch.afterPins);assert.notEqual(p.beforeCheck,batch.beforeCheck);assert.equal(p.operationalPairBaseline,'published107');
});
