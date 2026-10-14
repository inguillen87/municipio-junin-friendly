import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildOwnPeriodClassificationInstallation,assertOwnPeriodClassificationDurability,OWN_PERIOD_CLASSIFICATION_MIGRATION,OWN_PERIOD_CLASSIFICATION_SQL_SHA256} from '../scripts/lib/own-period-classification-installation.mjs';
import {ownInstallationFunctionPin} from '../scripts/lib/own-payroll-installation.mjs';

const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const sourceCommit='aaf35dfe5b9dec5529090607c5ba753f42ba1917';
const batch=buildOwnPeriodClassificationInstallation({read,sourceCommit});
const sha=s=>createHash('sha256').update(s.replace(/\r\n?/g,'\n')).digest('hex');
const metadata=s=>{const at=s.search(/\bAS\s+\$/);return ownInstallationFunctionPin(s.slice(0,at).replace(/SET search_path TO 'pg_catalog', 'public', 'pg_temp'/g,'SET search_path=pg_catalog,public,pg_temp').replace(/SET "TimeZone" TO 'UTC'/g,"SET timezone='UTC'").replace(/\s+/g,' ')+s.slice(at));};

test('177 pins the reviewed source and rejects a changed prior source before generation',()=>{
 assert.equal(batch.sourceHashes[OWN_PERIOD_CLASSIFICATION_MIGRATION],OWN_PERIOD_CLASSIFICATION_SQL_SHA256);
 assert.equal(sha(read(OWN_PERIOD_CLASSIFICATION_MIGRATION)),OWN_PERIOD_CLASSIFICATION_SQL_SHA256);
 for(const file of[OWN_PERIOD_CLASSIFICATION_MIGRATION,'scripts/migrations/172-own-salary-conditions-program-source.sql','scripts/migrations/165-working-time-adoption-readiness.sql','scripts/lib/adoption-source-streaming-installation.mjs']){
  assert.throws(()=>buildOwnPeriodClassificationInstallation({sourceCommit,read:p=>read(p)+(p===file?'\n-- unreviewed change':'')}),/CHANGED/);
 }
 assert.throws(()=>buildOwnPeriodClassificationInstallation({read,sourceCommit:'master'}));
});

test('only five existing bodies change; metadata, both finalizers and replay remain canonical',()=>{
 assert.equal(batch.beforePins.length,5);assert.equal(batch.changed.length,5);assert.equal(batch.newPins.length,21);assert.equal(batch.afterPins.length,26);
 assert.deepEqual(batch.beforePins.map(p=>p.name),['own_run_capture_v1','own_close_roster_v1','own_close_detail_v1','own_run_jurisdictions_v1','municipal_adoption_ready_v1']);
 for(let i=0;i<batch.beforePins.length;i++)assert.deepEqual({...batch.beforePins[i],sha256:null},{...batch.afterConsumerPins[i],sha256:null});
 for(const [name,hash]of Object.entries({
  own_run_capture_v1:'ab89246306b8b5b337b40b8508f0d36e4890a5f6c5aef3ea997cff6e396e3af3',
  own_close_roster_v1:'aa89d27c43d147d9150f141522350445d3ef6e48203f88b63531992b3945d84d',
  municipal_adoption_ready_v1:'c4546ebd3e2dacfff29aad1edfea16b6dc4061774598110e7b10c58f264fdb08',
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
 assert.equal(batch.newPins.filter(p=>!p.runtime).length,17);
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
 const proof={version:'own-period-classification-installation.v1',sourceCommit,sourceHashes:batch.sourceHashes,mode:'install',newTables:1,newFunctions:21,runtimeFacades:4,adaptedFunctions:5,roleAssignmentsAdded:0,existingAclChanges:0,associationWrites:0,businessWrites:0,nominalRowsReturned:0,eventRows:0,transactionDataPreserved:true,preservationSha256:'a'.repeat(64),priorMetadataSha256:'b'.repeat(64),objectFingerprint:'c'.repeat(64)};
 const durable={...proof,mode:'verify',transactionDataPreserved:false};
 assert.doesNotThrow(()=>assertOwnPeriodClassificationDurability({installed:proof,durable,batch}));
 assert.doesNotThrow(()=>assertOwnPeriodClassificationDurability({installed:{...proof,mode:'verify'},durable,batch}));
 for(const patch of[{existingAclChanges:1},{businessWrites:1},{newFunctions:19},{eventRows:null},{sourceCommit:'b'.repeat(40)},{sourceHashes:{}},{transactionDataPreserved:true},{objectFingerprint:'d'.repeat(64)},{priorMetadataSha256:'e'.repeat(64)},{mode:'install'}]){
  assert.throws(()=>assertOwnPeriodClassificationDurability({installed:proof,durable:{...durable,...patch},batch}));
 }
 assert.throws(()=>assertOwnPeriodClassificationDurability({installed:{...proof,transactionDataPreserved:false},durable,batch}));
});
