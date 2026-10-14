import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildOwnPeriodClassificationInstallation,assertOwnPeriodClassificationDurability,OWN_PERIOD_CLASSIFICATION_MIGRATION,OWN_PERIOD_CLASSIFICATION_SQL_SHA256} from '../scripts/lib/own-period-classification-installation.mjs';
import {ownInstallationFunctionPin} from '../scripts/lib/own-payroll-installation.mjs';
import {splitPostgresStatements} from '../scripts/lib/sql-statements.mjs';

const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const sourceCommit='aaf35dfe5b9dec5529090607c5ba753f42ba1917';
const batch=buildOwnPeriodClassificationInstallation({read,sourceCommit});
const sha=s=>createHash('sha256').update(s.replace(/\r\n?/g,'\n')).digest('hex');
const metadata=s=>{const at=s.search(/\bAS\s+\$/);return ownInstallationFunctionPin(s.slice(0,at).replace(/SET search_path TO 'pg_catalog', 'public', 'pg_temp'/g,'SET search_path=pg_catalog,public,pg_temp').replace(/SET "TimeZone" TO 'UTC'/g,"SET timezone='UTC'").replace(/\s+/g,' ')+s.slice(at));};
const sourceFunction=(file,name)=>splitPostgresStatements(read(file).replace(/\r\n?/g,'\n')).map(s=>s.replace(/^(?:\s*--[^\n]*(?:\n|$))+/,'').trim()).find(s=>new RegExp('^CREATE (?:OR REPLACE )?FUNCTION public\\.'+name+'\\(').test(s));

test('177 pins the reviewed source and rejects a changed prior source before generation',()=>{
 assert.equal(batch.sourceHashes[OWN_PERIOD_CLASSIFICATION_MIGRATION],OWN_PERIOD_CLASSIFICATION_SQL_SHA256);
 assert.equal(sha(read(OWN_PERIOD_CLASSIFICATION_MIGRATION)),OWN_PERIOD_CLASSIFICATION_SQL_SHA256);
 for(const file of[OWN_PERIOD_CLASSIFICATION_MIGRATION,'scripts/migrations/172-own-salary-conditions-program-source.sql','scripts/migrations/165-working-time-adoption-readiness.sql','scripts/lib/adoption-source-streaming-installation.mjs','scripts/migrations/136-adopted-employment-lifecycle.sql','scripts/migrations/138-adopted-fixed-novelties.sql','scripts/lib/adoption-inactive-jurisdiction-installation.mjs']){
  assert.throws(()=>buildOwnPeriodClassificationInstallation({sourceCommit,read:p=>read(p)+(p===file?'\n-- unreviewed change':'')}),/CHANGED/);
 }
 assert.throws(()=>buildOwnPeriodClassificationInstallation({read,sourceCommit:'master'}));
});

test('only six existing bodies change; metadata, both finalizers and replay remain canonical',()=>{
 assert.equal(batch.beforePins.length,6);assert.equal(batch.changed.length,6);assert.equal(batch.newPins.length,22);assert.equal(batch.afterPins.length,28);
 assert.deepEqual(batch.beforePins.map(p=>p.name),['own_run_capture_v1','own_close_roster_v1','own_close_detail_v1','own_run_jurisdictions_v1','payroll_fixed_registry_range_v2','municipal_adoption_ready_v1']);
 for(let i=0;i<batch.beforePins.length;i++)assert.deepEqual({...batch.beforePins[i],sha256:null},{...batch.afterConsumerPins[i],sha256:null});
 for(const [name,hash]of Object.entries({
  own_run_capture_v1:'ab89246306b8b5b337b40b8508f0d36e4890a5f6c5aef3ea997cff6e396e3af3',
  own_close_roster_v1:'aa89d27c43d147d9150f141522350445d3ef6e48203f88b63531992b3945d84d',
  municipal_adoption_ready_v1:'c4546ebd3e2dacfff29aad1edfea16b6dc4061774598110e7b10c58f264fdb08',
  payroll_fixed_registry_range_v2:'30afb71e97988bd4862d98d3d56d84603252bbb600812d5f40c63a5596a69546',
 }))assert.equal(batch.beforePins.find(p=>p.name===name)?.sha256,hash);
 for(const [name,hash]of Object.entries({
  own_run_complete_v1:'f303a27603c035919449d05a1b4af9228a512a79b7667a4ede34011c2f334dc7',
  own_run_complete_full_v1:'1b2198ac93bd66ed5f7191ffabb69000de340e20d115cbddd1e32e85db6a8d37',
  own_run_owned_v1:'c854eb2ff94fba5e24e675c52c0be9a31b009d4b6ebc010050c04f57df6b7766',
  own_run_attempt_v1:'24021c17f479e52ea9a5bb8edd36388d6e8dde76c89938e46f167b39aa51eea2',
 }))assert.equal(batch.prerequisitePins.find(p=>p.name===name)?.sha256,hash);
 const capture=batch.changed[0];assert.ok(capture.indexOf('IF FOUND THEN')<capture.indexOf('own_period_classification_resolve_v1'));
 assert.match(capture,/prior\.body<>body OR prior\.body_sha256<>fingerprint/);
 assert.match(capture,/RETURN public\.own_run_receipt_v1\(prior,true\)/);
 assert.match(capture,/'departmentSource','sourceInventory\.periodClassifications\.rows\[\]\.definition\.sectorCode'/);
 assert.doesNotMatch(capture,/'departmentSource','employment_contract\.sector_source_id'/);
 assert.match(batch.originals[0],/'departmentSource','employment_contract\.sector_source_id'/);
});

test('the four new facades are the only runtime grants and all new storage is private',()=>{
 assert.deepEqual(batch.newPins.filter(p=>p.runtime).map(p=>p.name).sort(),['own_period_classification_attempt_v1','own_period_classification_bootstrap_v1','own_period_classification_command_v1','own_period_classification_detail_v1']);
 assert.equal(batch.newPins.filter(p=>!p.runtime).length,18);
 assert.equal(batch.mutations.filter(s=>/^GRANT /.test(s)).length,1);
 assert.ok(batch.mutations.every(s=>!/^\s*(INSERT|UPDATE|DELETE|TRUNCATE)\b/i.test(s)));
 assert.doesNotMatch(batch.mutations.join('\n'),/GRANT.*ON TABLE|ALTER ROLE|INSERT INTO public\.iam_|INSERT INTO public\.tenant_action_/);
 assert.match(batch.migration.join('\n'),/REVOKE ALL ON public\.own_period_classification_event FROM PUBLIC,municontrol_actions_runtime_app/);
 for(const name of['CHECK_SHAPE','FOREIGN_SHAPE','UNIQUE_SHAPE','NOT_NULL_SHAPE','INDEX_SHAPE','TABLE_SECURITY','TABLE_IMMUTABILITY','FOREIGN_GUARD'])assert.ok(batch.afterCheck.includes('PERIOD_CLASSIFICATION_'+name));
 assert.match(batch.afterCheck,/has_table_privilege/);assert.match(batch.afterCheck,/pg_get_constraintdef/);assert.match(batch.afterCheck,/confupdtype<>'a'/);assert.match(batch.afterCheck,/count\(\*\)<>4/);
});

test('the known capacity guard is read-only pinned; catalogue items are referenced once in existing ledgers',()=>{
 const p=batch.prerequisitePins.find(p=>p.name==='native_employment_catalog_capacity_v1');
 assert.equal(p.sha256,'fc2b910ebde0e560de0b2bf07f4d7af7492f1b6f98ca27badaf1d0186befa0c4');assert.equal(p.runtime,false);
 assert.deepEqual(p.argNames,['extra_bytes']);assert.equal(p.resultType,'void');
 const command=batch.migration.find(s=>s.startsWith('CREATE FUNCTION public.own_period_classification_command_v1('));
 assert.match(command,/native_employment_catalog_capacity_v1\(added_bytes::integer\)/);
 assert.match(command,/NATIVE_EMPLOYMENT_CATALOG_CAPACITY_LIMIT.*PERIOD_CLASSIFICATION_LIMIT/);
 assert.match(command,/SQLERRM IN\('NATIVE_SALARY_BUSY','NATIVE_EMPLOYMENT_CATALOG_BUSY'\) THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_BUSY'/);
 const lock=batch.migration.find(s=>s.startsWith('CREATE FUNCTION public.own_period_classification_lock_v1('));
 assert.match(lock,/SQLERRM IN\('NATIVE_SALARY_BUSY','NATIVE_EMPLOYMENT_CATALOG_BUSY'\) THEN RAISE EXCEPTION 'PERIOD_CLASSIFICATION_BUSY'/);
 assert.match(command,/'classificationRef',public\.own_period_classification_catalogue_reference_v1\(ctx,k\)/);
 assert.doesNotMatch(command,/pg_database_size|536870912|1056964608|jsonb_build_object\('source',s,'classification',k\)/);
 assert.ok(batch.newPins.some(p=>p.name==='own_period_classification_catalogue_read_v1'&&!p.runtime));
});

test('historical consumption needs immutable evidence and the existing real full-month employment reader',()=>{
 const resolve=batch.migration.find(s=>s.startsWith('CREATE FUNCTION public.own_period_classification_resolve_v1('));
 assert.match(resolve,/s-'version' IS DISTINCT FROM \(r\.source_snapshot->'source'\)-'version'/);
 assert.match(resolve,/payroll_fixed_registry_range_v2\([\s\S]*,true\) THEN RAISE EXCEPTION 'OWN_RUN_PRORATION_REQUIRED'/);
 assert.match(resolve,/n\.created_at[\s\S]*native_employment_change_review[\s\S]*OWN_RUN_HISTORY_REQUIRED/);
 const source=batch.migration.find(s=>s.startsWith('CREATE FUNCTION public.own_period_classification_source_v1('));
 assert.match(source,/subject,proof,to_jsonb\(c\)/);
 const close=batch.changed.find(s=>s.includes('FUNCTION public.own_close_detail_v1(')),roster=batch.changed.find(s=>s.includes('FUNCTION public.own_close_roster_v1('));
 assert.match(close,/IF group_value IS NULL THEN PERFORM public\.own_period_classification_close_match_v1/);
 assert.match(close,/ELSE SELECT x\.value INTO decision FROM jsonb_array_elements\(group_value#>'\{snapshot,employees\}'\)/);
 assert.ok(roster.indexOf('FOR frozen_group')<roster.indexOf('FOR reg'));
 assert.match(roster,/frozen_employee->'agreementCode'/);assert.match(roster,/ownCloseLiquidationType/);
 const match=batch.migration.find(s=>s.startsWith('CREATE FUNCTION public.own_period_classification_close_match_v1('));
 assert.match(match,/capture\.payload#>'\{population,employees\}'/);assert.match(match,/capture_row_v1\(row_value,employee,period_value\)/);
 assert.doesNotMatch(match,/payroll_fixed_registry_subject_v2/);
 const jurisdictions=batch.changed.find(s=>s.includes('FUNCTION public.own_run_jurisdictions_v1('));
 assert.match(jurisdictions,/IF NOT coalesce\(inventory \? 'jurisdictions',false\) THEN IF coalesce\(inventory \? 'periodClassifications',false\) THEN RAISE EXCEPTION 'OWN_CLOSE_JURISDICTION_INVALID';END IF;RETURN 'null'::jsonb/);
});

test('relation aliases do not shadow declared variables in the 22 published classification functions',()=>{
 const functions=batch.migration.filter(s=>s.startsWith('CREATE FUNCTION public.own_period_classification_'));
 assert.equal(functions.length,22);
 const assertDistinctAliases=sql=>{
  const declaration=/\bDECLARE\b([\s\S]*?)\bBEGIN\b/.exec(sql)?.[1]??'';
  const variables=new Set(declaration.split(';').map(s=>/^\s*([a-z_][a-z0-9_]*)\s+/i.exec(s)?.[1].toLowerCase()).filter(Boolean));
  for(const alias of sql.matchAll(/\b(?:FROM|JOIN)\s+public\.[a-z_][a-z0-9_]*\s+(?:AS\s+)?([a-z_][a-z0-9_]*)\b/gi)){
   assert.ok(!variables.has(alias[1].toLowerCase()),sql.slice(0,sql.indexOf('('))+': relation alias shadows declared variable '+alias[1]);
  }
 };
 for(const sql of functions)assertDistinctAliases(sql);
 const resolve=functions.find(s=>s.startsWith('CREATE FUNCTION public.own_period_classification_resolve_v1('));
 assert.match(resolve,/native_employment_change_review change_review WHERE change_review\.contract_id=target AND change_review\.decision='approve' AND\(change_review\.reviewed_at[\s\S]*OWN_RUN_HISTORY_REQUIRED/);
 assert.match(resolve,/SELECT \* INTO STRICT r FROM public\.own_period_classification_event/);
 assert.match(resolve,/r\.source_snapshot->'source'/);
 const originalAmbiguity=resolve.replace(/\bchange_review\b/g,'r');
 assert.throws(()=>assertDistinctAliases(originalAmbiguity),/relation alias shadows declared variable r/);
});

test('the private lifecycle subject is the exact reviewed ownership reader without changing the strict salary guard',()=>{
 const original=sourceFunction('scripts/migrations/138-adopted-fixed-novelties.sql','payroll_fixed_registry_adopted_subject_v1');
 const helper=batch.migration.find(s=>s.startsWith('CREATE FUNCTION public.own_period_classification_lifecycle_subject_v1('));
 assert.equal(helper,original.replace('public.payroll_fixed_registry_adopted_subject_v1(','public.own_period_classification_lifecycle_subject_v1('));
 const privatePin=batch.newPins.find(p=>p.name==='own_period_classification_lifecycle_subject_v1');
 assert.deepEqual(privatePin,{...metadata(original),name:'own_period_classification_lifecycle_subject_v1',signature:'public.own_period_classification_lifecycle_subject_v1(jsonb,uuid,boolean)',runtime:false});
 assert.equal(privatePin.sha256,'83b3f8944c437424ed97ba277094af4a68d4b14af197e9371223eedb40d5f4fa');
 assert.doesNotMatch(helper,/PAYROLL_FIXED_JURISDICTION_REQUIRED/);
 const strict=batch.lifecyclePrerequisiteDefinitions.find(s=>s.includes('FUNCTION public.payroll_fixed_registry_adopted_subject_v1('));
 assert.equal(strict,original.replace(' subject:=jsonb_build_object'," IF c.jurisdiction_code IS NULL THEN RAISE EXCEPTION 'PAYROLL_FIXED_JURISDICTION_REQUIRED';END IF;\n subject:=jsonb_build_object"));
 const strictPin=batch.prerequisitePins.find(p=>p.name==='payroll_fixed_registry_adopted_subject_v1');
 assert.equal(strictPin.sha256,'47aa5dda0e474a3efa9279d526d86855d670dce0f0c47097cd6d97e7e4e32672');
 assert.equal(strictPin.runtime,false);
 assert.ok(!batch.beforePins.some(p=>p.name===strictPin.name));assert.ok(!batch.changed.some(s=>s.includes('FUNCTION '+strictPin.signature.split('(')[0]+'(')));
 for(const name of['native_employment_lifecycle_adopted_state_v2','native_employment_lifecycle_adopted_intervals_v2','native_employment_lifecycle_adopted_date_v2','native_employment_lifecycle_adopted_activity_v2','native_employment_lifecycle_version_v1']){
  const source=sourceFunction('scripts/migrations/'+(name==='native_employment_lifecycle_version_v1'?'110-native-employment-lifecycle.sql':'136-adopted-employment-lifecycle.sql'),name);
  const expected={...metadata(source),runtime:false};
  assert.deepEqual(batch.prerequisitePins.find(p=>p.name===name),expected);
  assert.equal(batch.lifecyclePrerequisiteDefinitions.find(s=>s.includes('FUNCTION public.'+name+'(')),source);
 }
 assert.equal(batch.lifecyclePrerequisiteDefinitions.length,6);assert.equal(batch.prerequisitePins.length,41);
});

test('range filtering validates provenance before exclusions and requires the unchanged salary subject before true',()=>{
 const prior=batch.originals.find(s=>s.startsWith('CREATE FUNCTION public.payroll_fixed_registry_range_v2('));
 const range=batch.changed.find(s=>s.startsWith('CREATE OR REPLACE FUNCTION public.payroll_fixed_registry_range_v2('));
 const native="IF NOT EXISTS(SELECT 1 FROM public.employment_adoption_application WHERE contract_id=target)\n THEN RETURN public.native_employment_lifecycle_range_v1(ctx,target,first_date,last_date,continuous); END IF;";
 assert.ok(prior.includes(native));assert.ok(range.includes(native));
 const mismatch=range.indexOf("THEN RAISE EXCEPTION 'PAYROLL_FIXED_IDENTITY_CHANGED'"),binding=range.indexOf("coalesce(ctx->>'sourceBindingId',ctx->>'certifiedBindingId')"),identity=range.indexOf('own_period_classification_lifecycle_subject_v1(ctx,target,true)'),dates=range.indexOf('IF first_date IS NULL'),excluded=range.indexOf('IF NOT covered THEN RETURN false'),salary=range.indexOf('PERFORM public.payroll_fixed_registry_adopted_subject_v1(ctx,target,true)'),eligible=range.indexOf('RETURN true');
 assert.ok(0<mismatch&&mismatch<binding&&binding<identity&&identity<dates&&dates<excluded&&excluded<salary&&salary<eligible);
 assert.match(range,/state_value:=public\.native_employment_lifecycle_adopted_state_v2\(ctx,target,subject\)/);
 assert.doesNotMatch(range,/jsonb_build_object\('sourceBindingId',ctx->>'certifiedBindingId'\)|WHEN OTHERS|WHEN raise_exception/);
 const intervalPredicates=sql=>[...sql.matchAll(/EXISTS\(SELECT 1 FROM jsonb_array_elements\(state_value->'intervals'\) r\s+WHERE ([\s\S]*?);/g)].map(m=>m[1]);
 assert.equal(intervalPredicates(prior).length,2);assert.deepEqual(intervalPredicates(range),intervalPredicates(prior));
 const beforePin=batch.beforePins.find(p=>p.name==='payroll_fixed_registry_range_v2'),afterPin=batch.afterConsumerPins.find(p=>p.name===beforePin.name);
 assert.deepEqual({...beforePin,sha256:null},{...afterPin,sha256:null});
 assert.ok(!batch.prerequisitePins.some(p=>p.name===beforePin.name));
 const beforeReady=batch.originals.at(-1),afterReady=batch.changed.at(-1);
 assert.equal(beforeReady.split(beforePin.sha256).length,2);assert.equal(afterReady.split(afterPin.sha256).length,2);assert.ok(!afterReady.includes(beforePin.sha256));
 assert.equal(afterReady.split('47aa5dda0e474a3efa9279d526d86855d670dce0f0c47097cd6d97e7e4e32672').length,beforeReady.split('47aa5dda0e474a3efa9279d526d86855d670dce0f0c47097cd6d97e7e4e32672').length);
 assert.match(batch.before,/payroll_fixed_registry_range_v2\(jsonb,uuid,date,date,boolean\)/);
 assert.match(batch.afterCheck,/payroll_fixed_registry_range_v2\(jsonb,uuid,date,date,boolean\)/);
});

test('installation modes are explicit, repeat verifies only, and prior objects retain every audit boundary',()=>{
 assert.equal(batch.connects,false);assert.equal(batch.executesSql,false);
 assert.equal(batch.statements.length,8);assert.equal(batch.verification.length,3);
 assert.match(batch.mode,/transaction_isolation'\)<>'repeatable read'/);assert.match(batch.mode,/NOT IN\(17,18\)/);
 assert.match(batch.choose,/mode'\)='install'/);assert.match(batch.choose,/ELSE EXECUTE/);
 assert.match(batch.apply,/mode'\)='install'/);assert.match(batch.apply,/NEW_TABLE_NOT_EMPTY/);
 assert.match(batch.conservation,/IS DISTINCT FROM/);
 assert.match(batch.before,/to_jsonb\(p\)-'prosrc'/);assert.match(batch.before,/tgconstraint IN/);
 assert.match(batch.verification.at(-1),/'transactionDataPreserved',false/);
 assert.ok(batch.migration.every(s=>!/^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(s)));
 const ignored=read('.vercelignore');assert.ok(ignored.split(/\r?\n/).some(s=>s.trim()==='!scripts/migrations/177-own-period-classification.sql'));
 for(let i=0;i<batch.changed.length;i++)assert.equal(metadata(batch.changed[i]).sha256,batch.afterConsumerPins[i].sha256);
});

test('independent durability refuses changed permissions, body pins, source, counts or preservation flags',()=>{
 const proof={version:'own-period-classification-installation.v1',sourceCommit,sourceHashes:batch.sourceHashes,mode:'install',newTables:1,newFunctions:22,runtimeFacades:4,adaptedFunctions:6,roleAssignmentsAdded:0,existingAclChanges:0,associationWrites:0,businessWrites:0,nominalRowsReturned:0,eventRows:0,transactionDataPreserved:true,preservationSha256:'a'.repeat(64),priorMetadataSha256:'b'.repeat(64),objectFingerprint:'c'.repeat(64)};
 const durable={...proof,mode:'verify',transactionDataPreserved:false};
 assert.doesNotThrow(()=>assertOwnPeriodClassificationDurability({installed:proof,durable,batch}));
 assert.doesNotThrow(()=>assertOwnPeriodClassificationDurability({installed:{...proof,mode:'verify'},durable,batch}));
 for(const patch of[{existingAclChanges:1},{businessWrites:1},{newFunctions:19},{eventRows:null},{sourceCommit:'b'.repeat(40)},{sourceHashes:{}},{transactionDataPreserved:true},{objectFingerprint:'d'.repeat(64)},{priorMetadataSha256:'e'.repeat(64)},{mode:'install'}]){
  assert.throws(()=>assertOwnPeriodClassificationDurability({installed:proof,durable:{...durable,...patch},batch}));
 }
 assert.throws(()=>assertOwnPeriodClassificationDurability({installed:{...proof,transactionDataPreserved:false},durable,batch}));
});
