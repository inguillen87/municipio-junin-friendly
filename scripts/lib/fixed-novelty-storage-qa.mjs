// Real SQL169 with disposable synthetic storage and all 315 prior SQL cases.
// Generates SQL only. No municipal endpoint, credentials or source files.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {buildFixedReviewGroupsQa} from '../verify-payroll-fixed-review-groups-sql.mjs';
import {buildFixedNoveltyStorageInstallation} from './fixed-novelty-storage-installation.mjs';
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
export function buildFixedNoveltyStorageQa({serverMajor}){
 const base=buildFixedReviewGroupsQa({serverMajor}),{schema}=base;
 const protocol=buildFixedNoveltyStorageInstallation({read:f=>fs.readFileSync(new URL('../../'+f,import.meta.url),'utf8'),sourceCommit:'a'.repeat(40),verifiedBudgetBytes:1073741824});
 const relocate=s=>s.replaceAll('public.',schema+'.').replaceAll(schema+'.digest(','public.digest(')
  .replaceAll('SET search_path=pg_catalog,public,pg_temp','SET search_path=pg_catalog,'+schema+',public,pg_temp')
  .replaceAll('search_path=pg_catalog, public, pg_temp','search_path=pg_catalog, '+schema+', public, pg_temp')
  .replaceAll("replace(p.prosrc,E'\\r\\n',E'\\n')",`replace(replace(p.prosrc,E'\\r\\n',E'\\n'),${q(schema+'.')},'public'||'.')`)
  .replaceAll("replace(updated.prosrc,E'\\r\\n',E'\\n')",`replace(replace(updated.prosrc,E'\\r\\n',E'\\n'),${q(schema+'.')},'public'||'.')`)
  .replaceAll("replace(after_body,E'\\r\\n',E'\\n')",`replace(replace(after_body,E'\\r\\n',E'\\n'),${q(schema+'.')},'public'||'.')`);
 const beforeCheck=relocate(protocol.beforeCheck),afterCheck=relocate(protocol.afterCheck);
 const mutation=relocate(protocol.mutations[0]);
 const statements=protocol.statements.map(s=>s===protocol.choose?`DO $choose$ BEGIN IF current_setting('municontrol_fixed_storage.mode')='install' THEN EXECUTE ${q(beforeCheck)};ELSE EXECUTE ${q(afterCheck)};END IF;END $choose$`:s===protocol.apply?`DO $apply$ BEGIN IF current_setting('municontrol_fixed_storage.mode')='install' THEN EXECUTE ${q(mutation)};END IF;END $apply$`:relocate(s));
 const checks=[];let count=0;
 const ok=(expression,label)=>{checks.push(`PERFORM qa_assert((${expression}),${q(label)});checks:=checks+1;`);count++;};
 // The existing suite rolls back its annulment/correction groups before review.
 // Recreate the exact published 117/118 fixtures present in both real targets;
 // do not remove either target from the conservative protocol.
 const annulFixture=relocate(fs.readFileSync(new URL('../migrations/117-fixed-novelty-annul-groups.sql',import.meta.url),'utf8'));
 const correctionFixture=relocate(fs.readFileSync(new URL('../migrations/118-fixed-novelty-correction-groups.sql',import.meta.url),'utf8'));
 checks.push(`DECLARE installed jsonb;repeated jsonb;changed_definition text;BEGIN
 EXECUTE ${q(annulFixture)};EXECUTE ${q(correctionFixture)};
 CREATE TABLE fixed_storage_probe(slot integer PRIMARY KEY,padding text);
 ALTER TABLE fixed_storage_probe ALTER COLUMN padding SET STORAGE EXTERNAL;
 INSERT INTO fixed_storage_probe SELECT probe.slot,repeat('Q',1048576) FROM generate_series(1,600) AS probe(slot);
 -- Keep the actual relation/TOAST footprint but no large live values in the
 -- conservation scan. This models occupied disk, including reclaimable bloat.
 DELETE FROM fixed_storage_probe;`);
 ok("qa_rejects('SELECT payroll_fixed_registry_capacity_v1()','PAYROLL_FIXED_CAPACITY_LIMIT')",'old 496 MiB gate rejects actual synthetic disk usage above its ceiling');
 ok(`qa_rejects(${q(mutation)},'FIXED_STORAGE_PROVIDER_BUDGET_REQUIRED')`,'raw migration refuses missing verified provider budget');
 // The business writers deliberately require READ COMMITTED. Test the raw
 // migration here, keeping that contract; the installation protocol requires
 // a separate REPEATABLE READ transaction and is not weakened for this suite.
 ok(`qa_rejects(${q(relocate(protocol.state))},'FIXED_STORAGE_ISOLATION_REQUIRED')`,'production installation protocol refuses the business transaction isolation');
 checks.push(`RAISE NOTICE 'FIXED_STORAGE_QA_METADATA %',(SELECT jsonb_agg(jsonb_build_object('name',p.proname,'config',p.proconfig,'runtime',has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE'),'bodyHash',encode(public.digest(replace(replace(p.prosrc,E'\\r\\n',E'\\n'),${q(schema+'.')},'public'||'.'),'sha256'),'hex')) ORDER BY p.proname) FROM pg_proc p WHERE p.oid=ANY(ARRAY[${protocol.beforePins.map(p=>q(p.signature.replace('public.',schema+'.'))+'::regprocedure::oid').join(',')} ]));
 EXECUTE ${q(beforeCheck)};EXECUTE ${q(relocate(protocol.before))};
 PERFORM set_config('municontrol_fixed_storage.provider_budget_bytes','1073741824',true);
 EXECUTE ${q(mutation)};EXECUTE ${q(afterCheck)};EXECUTE ${q(relocate(protocol.after))};
 EXECUTE ${q(relocate(protocol.conservation))};installed:=current_setting('municontrol_fixed_storage.after')::jsonb;`);
 ok("installed=current_setting('municontrol_fixed_storage.before')::jsonb",'exact raw adaptation preserves rows and mixed private/public ACLs');
 checks.push('PERFORM payroll_fixed_registry_capacity_v1();');
 ok('TRUE','new budget admits storage above the former ceiling without raising quantity limits');
 checks.push(`EXECUTE ${q(mutation)};EXECUTE ${q(afterCheck)};EXECUTE ${q(relocate(protocol.after))};repeated:=current_setting('municontrol_fixed_storage.after')::jsonb;`);
 ok('repeated=installed','raw repeat verifies the same four bodies without any new adaptation');
 ok(`NOT has_function_privilege('municontrol_actions_runtime_app',${q(schema+'.payroll_fixed_registry_capacity_v1()')},'EXECUTE')`,'runtime still cannot call the private capacity function');
 // New storage is created in its own subtransaction so its files are reclaimed
 // on rollback, rather than leaving a bloated pre-existing relation behind.
 checks.push(`BEGIN
 CREATE TABLE fixed_storage_overflow(slot integer PRIMARY KEY,padding text);
 ALTER TABLE fixed_storage_overflow ALTER COLUMN padding SET STORAGE EXTERNAL;
 INSERT INTO fixed_storage_overflow SELECT overflow.slot,repeat('X',1048576) FROM generate_series(1,512) AS overflow(slot);`);
 ok("qa_rejects('SELECT payroll_fixed_registry_capacity_v1()','PAYROLL_FIXED_CAPACITY_LIMIT')",'new 1 GiB budget still refuses actual over-budget storage');
 checks.push("RAISE EXCEPTION USING ERRCODE='P1691',MESSAGE='RESTORE_STORAGE_OVERFLOW';EXCEPTION WHEN SQLSTATE 'P1691' THEN NULL;END;");
 checks.push(`BEGIN SELECT pg_get_functiondef(${q(schema+'.payroll_fixed_registry_capacity_v1()')}::regprocedure) INTO changed_definition;
 EXECUTE replace(changed_definition,'1056964608','520093696');`);
 ok(`qa_rejects(${q(mutation)},'FIXED_STORAGE_PARTIAL_STATE')`,'one old and three updated functions abort before any adaptation');
 checks.push("RAISE EXCEPTION USING ERRCODE='P1692',MESSAGE='RESTORE_PARTIAL_STORAGE';EXCEPTION WHEN SQLSTATE 'P1692' THEN NULL;END;");
 checks.push(`EXECUTE ${q(afterCheck)};PERFORM payroll_fixed_registry_capacity_v1();`);
 ok('TRUE','post-refusal bodies, permissions and usable capacity remain intact');
 // The existing review cases now run with the actual 600 MiB synthetic table
 // and new ceiling. Their enclosing rollback restores every fixture and body.
 checks.push('END;');
 const anchor="p1:=payroll_fixed_registry_propose_v1(maker,np||jsonb_build_object('recordId',nr->>'recordId','expectedVersion',2,'values',(np->'values')||jsonb_build_object('conceptSourceId','614')";
 assert.equal(base.sql.split(anchor).length,2);
 const report={...base.report,checksPassed:base.report.checksPassed+count,storageChecksPassed:count,storageProbeBytes:600*1048576,overflowProbeBytes:512*1048576,adaptedFunctions:4,installationReplayedWithoutAdaptation:true,durableInstallationVerified:false,fixtureTransactionTimeoutSeconds:180};
 const sql=base.sql.replace("current_database()<>'fixed_novelties_qa'","current_database()<>'own_payroll_run_qa'")
  // Only this new fixture materializes over 1 GiB of disposable disk storage.
  // Keep all prior assertions and production/installation timeouts unchanged.
  .replace("SET LOCAL statement_timeout='90s'","SET LOCAL statement_timeout='180s'")
  .replace(anchor,()=>checks.join('\n')+'\n'+anchor)
  .replace('checks<>'+base.report.checksPassed,'checks<>'+report.checksPassed)
  .replace(q(JSON.stringify(base.report)),()=>q(JSON.stringify(report)));
 assert.ok(!/INSERT\s+INTO\s+public\./i.test(sql));
 return{...base,sql,report};
}
