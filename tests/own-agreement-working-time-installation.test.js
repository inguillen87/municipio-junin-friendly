import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildOwnAgreementWorkingTimeInstallation,assertOwnAgreementWorkingTimeDurability,AGREEMENT_WORKING_TIME_MIGRATION,AGREEMENT_WORKING_TIME_PROGRAM_MIGRATION,AGREEMENT_WORKING_TIME_SQL_SHA256,AGREEMENT_WORKING_TIME_PROGRAM_SQL_SHA256} from '../scripts/lib/own-agreement-working-time-installation.mjs';
import {AGREEMENT_CAPTURE177_SHA256,AGREEMENT_READY177_SHA256} from '../scripts/lib/own-agreement-working-time-consumers.mjs';
import {ownInstallationFunctionPin} from '../scripts/lib/own-payroll-installation.mjs';
import {buildAgreementWorkingTimeQaRelocation} from '../scripts/lib/own-agreement-working-time-qa-relocation.mjs';
import {buildNoeliaCircuitQa} from '../scripts/lib/noelia-payroll-circuit-qa.mjs';
import {CLASSIFICATION_USE_PRIOR_PINS,CLASSIFICATION_USE_FINAL_HASHES,CLASSIFICATION_USE_ADMINISTRATIVE_PIN} from '../scripts/lib/classification-registration-use-pins.mjs';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8'),sourceCommit='a'.repeat(40);
const batch=buildOwnAgreementWorkingTimeInstallation({read,sourceCommit});
const sha=s=>createHash('sha256').update(s.replace(/\r\n?/g,'\n')).digest('hex');

test('reviewed179/180 generation refuses drift in either new source or complete177 foundation',()=>{
 assert.equal(sha(read(AGREEMENT_WORKING_TIME_MIGRATION)),AGREEMENT_WORKING_TIME_SQL_SHA256);
 assert.equal(sha(read(AGREEMENT_WORKING_TIME_PROGRAM_MIGRATION)),AGREEMENT_WORKING_TIME_PROGRAM_SQL_SHA256);
 for(const file of[AGREEMENT_WORKING_TIME_MIGRATION,AGREEMENT_WORKING_TIME_PROGRAM_MIGRATION,'scripts/migrations/177-own-period-classification.sql','scripts/migrations/172-own-salary-conditions-program-source.sql','scripts/migrations/167-classification-registration-use.sql']){
  assert.throws(()=>buildOwnAgreementWorkingTimeInstallation({sourceCommit,read:p=>read(p)+(p===file?'\n-- unreviewed change':'')}),/CHANGED/);
 }
 assert.throws(()=>buildOwnAgreementWorkingTimeInstallation({read,sourceCommit:'main'}));
 assert.equal(batch.connects,false);assert.equal(batch.executesSql,false);
});

test('agreement installation refuses the legacy103 or mixed167 catalogue before changing any function',()=>{
 const expected=[...CLASSIFICATION_USE_PRIOR_PINS.map(p=>({...p,sha256:CLASSIFICATION_USE_FINAL_HASHES[p.name]})),CLASSIFICATION_USE_ADMINISTRATIVE_PIN];
 for(const p of expected){
  assert.deepEqual(batch.prerequisitePins.find(v=>v.signature===p.signature),p);
  assert.ok(batch.beforeCheck.includes(p.sha256),p.name);
  assert.ok(batch.afterCheck.includes(p.sha256),p.name);
 }
 assert.equal(new Set(batch.prerequisitePins.map(p=>p.signature)).size,batch.prerequisitePins.length);
 assert.ok(batch.sourceHashes['scripts/migrations/167-classification-registration-use.sql']);
 assert.ok(batch.sourceHashes['scripts/lib/classification-registration-use-pins.mjs']);
 assert.ok(batch.statements.indexOf(batch.choose)<batch.statements.indexOf(batch.apply));
 assert.ok(!batch.mutations.some(s=>/CREATE(?: OR REPLACE)? FUNCTION public\.(?:native_employment_catalog_|employment_adoption_administrative_context_v1)/.test(s)));
});

test('agreement extension preserves every byte of177 capture except its three explicit additions',()=>{
 assert.equal(batch.capture177Preserved,true);
 const before=batch.originals[2],after=batch.changed[2];
 assert.equal(ownInstallationFunctionPin(before).sha256,AGREEMENT_CAPTURE177_SHA256);
 assert.equal(ownInstallationFunctionPin(batch.originals[3]).sha256,AGREEMENT_READY177_SHA256);
 let restored=after.replace('working_facts jsonb;agreement_facts jsonb;','working_facts jsonb;');
 restored=restored.replace(/ IF program_state#>>'\{program,definition,agreementWorkingTimeVersion\}'='own-agreement-working-time\.v1' THEN\n  agreement_facts:=[\s\S]*?\n END IF;\n/,'');
 restored=restored.replace(" IF program_state#>>'{program,definition,agreementWorkingTimeVersion}'='own-agreement-working-time.v1' THEN payload_value:=payload_value||jsonb_build_object('agreementWorkingTime',agreement_facts);END IF;\n",'');
 assert.equal(restored,before.replace(/^CREATE FUNCTION /,'CREATE OR REPLACE FUNCTION '));
 assert.match(after,/own_period_classification_resolve_v1/);
 assert.match(after,/'departmentSource','sourceInventory\.periodClassifications\.rows\[\]\.definition\.sectorCode'/);
 assert.ok(after.indexOf('IF FOUND THEN')<after.indexOf('own_agreement_working_time_capture_v1'));
 assert.match(after,/RETURN public\.own_run_receipt_v1\(prior,true\)/);
 assert.ok(!batch.changed.some(s=>/FUNCTION public\.(?:own_run_context_v1|own_run_complete_full_v1|internal_employee_payroll|internal_payroll_document)/.test(s)));
});

test('exact four adapted metadata contracts and both finalizers stay unchanged',()=>{
 assert.equal(batch.changed.length,4);assert.equal(batch.beforePins.length,4);
 assert.deepEqual(batch.beforePins.map(p=>p.name),['own_program_definition_v1','own_program_command_v1','own_run_capture_v1','municipal_adoption_ready_v1']);
 for(let i=0;i<4;i++)assert.deepEqual({...batch.beforePins[i],sha256:null},{...batch.afterConsumerPins[i],sha256:null});
 for(const [name,hash]of Object.entries({own_run_complete_v1:'f303a27603c035919449d05a1b4af9228a512a79b7667a4ede34011c2f334dc7',own_run_complete_full_v1:'1b2198ac93bd66ed5f7191ffabb69000de340e20d115cbddd1e32e85db6a8d37'}))assert.equal(batch.prerequisitePins.find(p=>p.name===name)?.sha256,hash);
 const capturePin=batch.afterConsumerPins.find(p=>p.name==='own_run_capture_v1').sha256;
 assert.ok(batch.changed[3].includes(capturePin));assert.ok(!batch.changed[3].includes(AGREEMENT_CAPTURE177_SHA256));
});

test('PostgreSQL SET TO headers preserve exact search_path and TimeZone metadata without changing function bodies',()=>{
 const expected=[['search_path=pg_catalog, public, pg_temp'],['search_path=pg_catalog, public, pg_temp','TimeZone=UTC'],['search_path=pg_catalog, public, pg_temp','TimeZone=UTC'],['search_path=pg_catalog, public, pg_temp','TimeZone=UTC']];
 for(let i=0;i<4;i++){
  const original=ownInstallationFunctionPin(batch.originals[i]),changed=ownInstallationFunctionPin(batch.changed[i]);
  assert.deepEqual(batch.beforePins[i].config,expected[i]);
  assert.deepEqual(batch.afterConsumerPins[i].config,expected[i]);
  assert.equal(batch.beforePins[i].sha256,original.sha256);
  assert.equal(batch.afterConsumerPins[i].sha256,changed.sha256);
  assert.deepEqual({...batch.beforePins[i],config:original.config},{...original,runtime:batch.beforePins[i].runtime});
  assert.deepEqual({...batch.afterConsumerPins[i],config:changed.config},{...changed,runtime:batch.afterConsumerPins[i].runtime});
 }
 // Normalize only the parser representation: emitted SQL retains its original PostgreSQL header.
 assert.match(batch.originals[0],/SET search_path TO 'pg_catalog', 'public', 'pg_temp'/);
 assert.match(batch.changed[1],/SET "TimeZone" TO 'UTC'/);
 assert.ok(batch.beforeCheck.includes('search_path=pg_catalog, public, pg_temp'));
 assert.ok(batch.afterCheck.includes('TimeZone=UTC'));
});

test('new ledger stays private with four existing-capability facades and complete table guards',()=>{
 assert.equal(batch.newPins.length,15);
 assert.deepEqual(batch.newPins.filter(p=>p.runtime).map(p=>p.name).sort(),['own_agreement_working_time_attempt_v1','own_agreement_working_time_bootstrap_v1','own_agreement_working_time_command_v1','own_agreement_working_time_detail_v1']);
 assert.ok(batch.mutations.every(s=>!/^\s*(INSERT|UPDATE|DELETE|TRUNCATE|ALTER ROLE)\b/i.test(s)));
 assert.doesNotMatch(batch.mutations.join('\n'),/GRANT.*ON TABLE|INSERT INTO public\.(?:iam_|tenant_action_)/);
 for(const guard of['TABLE_SECURITY','TABLE_SHAPE','CHECK_SHAPE','FOREIGN_SHAPE','UNIQUE_SHAPE','NOT_NULL_SHAPE','INDEX_SHAPE','IMMUTABLE_GUARD','FOREIGN_GUARD'])assert.ok(batch.afterCheck.includes('AGREEMENT_INSTALL_'+guard));
 assert.match(batch.afterCheck,/aclexplode/);assert.match(batch.afterCheck,/grantee<>/);assert.match(batch.afterCheck,/attacl IS NOT NULL/);
});

test('agreement writes reuse the existing pinned cluster capacity guard and preserve their private ledger ceiling',()=>{
 const guard=batch.prerequisitePins.find(p=>p.name==='native_employment_catalog_capacity_v1');
 assert.equal(guard.sha256,'fc2b910ebde0e560de0b2bf07f4d7af7492f1b6f98ca27badaf1d0186befa0c4');assert.equal(guard.runtime,false);
 const command=batch.migration.find(s=>s.startsWith('CREATE FUNCTION public.own_agreement_working_time_command_v1('));
 assert.match(command,/native_employment_catalog_capacity_v1\(added_bytes::integer\)/);
 assert.match(command,/NATIVE_EMPLOYMENT_CATALOG_CAPACITY_LIMIT.*AGREEMENT_WORKING_TIME_LIMIT/);
 assert.match(command,/NATIVE_EMPLOYMENT_CATALOG_BUSY.*AGREEMENT_WORKING_TIME_BUSY/);
 assert.match(command,/>536870912/);assert.doesNotMatch(command,/pg_database_size|1056964608|2097152/);
});

test('repeat is verify-only and preserves both all prior tables including leave and its own existing ledger',()=>{
 assert.equal(batch.statements.length,8);assert.equal(batch.verification.length,4);
 assert.match(batch.mode,/transaction_isolation'\)<>'repeatable read'/);
 assert.match(batch.mode,/NOT IN\(17,18\)/);assert.match(batch.mode,/WRITABLE_TRANSACTION_REQUIRED/);
 assert.match(batch.verification[0],/transaction_read_only'\)<>'on'/);
 assert.match(batch.apply,/mode'\)='install'/);assert.match(batch.conservation,/PRIOR_STATE_CHANGED/);
 assert.match(batch.conservation,/LEDGER_CHANGED/);assert.match(batch.mode,/ledger_before/);
 assert.ok(!batch.before.includes("LIKE 'native_leave_%'"));
 assert.ok(!batch.before.includes("to_regclass('public.native_leave_event')"));
 assert.match(batch.before,/to_jsonb\(p\)-'prosrc'/);assert.match(batch.before,/tgconstraint IN/);
 assert.match(batch.conservation,/NEW_TABLE_NOT_EMPTY/);
 assert.match(batch.verification.at(-1),/'transactionDataPreserved',false/);
});

test('every agreement snapshot rejects unaudited materialized foreign and event-trigger scope before scanning rows',()=>{
 const scopeGuard="IF EXISTS(SELECT 1 FROM pg_class agreement_relation JOIN pg_namespace agreement_namespace ON agreement_namespace.oid=agreement_relation.relnamespace WHERE agreement_namespace.nspname NOT LIKE 'pg_%' AND agreement_namespace.nspname<>'information_schema' AND agreement_relation.relkind IN('m','f')) OR EXISTS(SELECT 1 FROM pg_event_trigger) THEN RAISE EXCEPTION 'AGREEMENT_INSTALL_UNAUDITED_OBJECT_SCOPE';END IF;";
 for(const snapshot of[batch.before,batch.after]){
  assert.equal(snapshot.split(scopeGuard).length,2);
  assert.ok(snapshot.indexOf(scopeGuard)<snapshot.indexOf('FOR c IN SELECT'));
  assert.match(snapshot,/p\.relkind IN \('r','p'\)/);
  assert.doesNotMatch(snapshot,/relispopulated|relkind IN\('m','f'\).*relispopulated/s);
 }
 assert.ok(batch.statements.includes(batch.before));assert.ok(batch.statements.includes(batch.after));
 assert.ok(batch.verification.includes(batch.after));assert.match(batch.apply,/mode'\)='install'/);
 // Repetition uses these same guarded snapshots and never reapplies its mutations.
 assert.ok(!batch.before.includes("LIKE 'native_leave_%'"));
 assert.ok(!batch.before.includes("to_regclass('public.native_leave_event')"));
 assert.equal(sha(read(AGREEMENT_WORKING_TIME_MIGRATION)),AGREEMENT_WORKING_TIME_SQL_SHA256);
 assert.equal(sha(read(AGREEMENT_WORKING_TIME_PROGRAM_MIGRATION)),AGREEMENT_WORKING_TIME_PROGRAM_SQL_SHA256);
});

test('durability distinguishes own transactional conservation from unrelated later business activity',()=>{
 const installed={version:'own-agreement-working-time-installation.v1',sourceCommit,sourceHashes:batch.sourceHashes,mode:'install',newTables:1,newFunctions:15,runtimeFacades:4,adaptedFunctions:4,roleAssignmentsAdded:0,existingAclChanges:0,associationWrites:0,businessWrites:0,nominalRowsReturned:0,eventRows:0,transactionDataPreserved:true,preservationSha256:'a'.repeat(64),priorMetadataSha256:'b'.repeat(64),objectFingerprint:'c'.repeat(64)};
 const durable={...installed,mode:'verify',transactionDataPreserved:false,preservationSha256:'d'.repeat(64),eventRows:3};
 assert.equal(assertOwnAgreementWorkingTimeDurability({installed,durable,batch}).wholeDatabaseStaticAcrossConnections,false);
 for(const patch of[{existingAclChanges:1},{businessWrites:1},{newFunctions:14},{eventRows:null},{sourceHashes:{}},{sourceCommit:'b'.repeat(40)},{mode:'install'},{transactionDataPreserved:true},{priorMetadataSha256:'e'.repeat(64)},{objectFingerprint:'f'.repeat(64)}])assert.throws(()=>assertOwnAgreementWorkingTimeDurability({installed,durable:{...durable,...patch},batch}));
 assert.throws(()=>assertOwnAgreementWorkingTimeDurability({installed:{...installed,transactionDataPreserved:false},durable,batch}));
});

test('synthetic relocation derives its sole differing readiness from the source-pinned177 predecessor',()=>{
 const qa=buildNoeliaCircuitQa(17),fixture=buildAgreementWorkingTimeQaRelocation({read,sourceCommit,schema:qa.schema,relocate:s=>qa.normalized(s),batch});
 assert.equal(fixture.productionCompatible,false);assert.equal(fixture.statements.length,9);assert.equal(fixture.verification.length,5);
 assert.equal(fixture.connects,false);assert.equal(fixture.executesSql,false);
 assert.match(fixture.statements[0],/current_database\(\)<>'own_payroll_run_qa'/);assert.match(fixture.statements[0],/neon\.project_id/);
 assert.ok(!fixture.afterCheck.includes(AGREEMENT_READY177_SHA256));
 assert.ok(fixture.beforeCheck.includes(fixture.fixtureBeforeSha256));assert.ok(fixture.afterCheck.includes(fixture.fixtureAfterSha256));
 assert.throws(()=>buildAgreementWorkingTimeQaRelocation({read,sourceCommit,schema:'public',relocate:s=>s,batch}));
});
