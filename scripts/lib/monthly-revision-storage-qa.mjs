// Full existing monthly circuit plus actual disposable storage boundaries.
// Generates SQL only; every actor, contract and operation is synthetic.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {buildMonthlyCorrectionQa} from '../verify-monthly-approved-corrections-sql.mjs';
import {buildMonthlyRevisionStorageInstallation} from './monthly-revision-storage-installation.mjs';
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
export function relocateMonthlyStorageSql(s,schema){
 return s.replaceAll('public.',schema+'.').replaceAll(schema+'.digest(','public.digest(')
  .replaceAll("'public'::regnamespace",q(schema)+'::regnamespace')
  .replaceAll("convert_to(prosrc,'UTF8')",`convert_to(replace(prosrc,${q(schema+'.')},'public'||'.'),'UTF8')`)
  .replaceAll('SET search_path=pg_catalog,public,pg_temp','SET search_path=pg_catalog,'+schema+',public,pg_temp')
  .replaceAll('search_path=pg_catalog, public, pg_temp','search_path=pg_catalog, '+schema+', public, pg_temp')
  .replaceAll("replace(p.prosrc,E'\\r\\n',E'\\n')",`replace(replace(p.prosrc,E'\\r\\n',E'\\n'),${q(schema+'.')},'public'||'.')`)
  .replaceAll("replace(updated.prosrc,E'\\r\\n',E'\\n')",`replace(replace(updated.prosrc,E'\\r\\n',E'\\n'),${q(schema+'.')},'public'||'.')`)
  .replaceAll("replace(after_body,E'\\r\\n',E'\\n')",`replace(replace(after_body,E'\\r\\n',E'\\n'),${q(schema+'.')},'public'||'.')`);
}
export function buildMonthlyRevisionStorageQa({serverMajor}){
 const base=buildMonthlyCorrectionQa({serverMajor}),{schema}=base;
 const protocol=buildMonthlyRevisionStorageInstallation({read:f=>fs.readFileSync(new URL('../../'+f,import.meta.url),'utf8'),sourceCommit:'a'.repeat(40),verifiedBudgetBytes:1073741824});
 const relocate=s=>relocateMonthlyStorageSql(s,schema),beforeCheck=relocate(protocol.beforeCheck),afterCheck=relocate(protocol.afterCheck),mutation=relocate(protocol.mutations[0]);
 const checks=[];let count=0;
 const ok=(expression,label)=>{checks.push(`PERFORM qa_assert((${expression}),${q(label)});checks:=checks+1;`);count++;};
 const correctionCall=`format('SELECT payroll_monthly_correction_command_v1(%L::jsonb,%L::jsonb,%L::uuid)',maker,storage_body,gen_random_uuid())`;
 const annulCall=`format('SELECT payroll_monthly_annul_command_v1(%L::jsonb,%L::jsonb,%L::uuid)',maker,storage_annul_body,gen_random_uuid())`;
 checks.push(`DECLARE storage_installed jsonb;storage_repeated jsonb;storage_definition text;storage_annul_item jsonb;storage_annul_view jsonb;storage_annul_items jsonb:='[]';
 storage_body jsonb:=body||jsonb_build_object('command','propose','previewSha256',verified->'previewSha256');
 storage_annul_body jsonb;BEGIN
 -- Annulment and correction have distinct snapshot contracts for the same rows.
 FOR storage_annul_item IN SELECT v.value FROM jsonb_array_elements(targets) AS v(value) ORDER BY v.value->>'batchId' LOOP
  storage_annul_view:=payroll_monthly_annul_detail_v1(maker,'candidate',(storage_annul_item->>'batchId')::uuid);
  storage_annul_items:=storage_annul_items||jsonb_build_array(jsonb_build_object('batchId',storage_annul_item->'batchId','expectedVersion',storage_annul_view#>'{items,0,batch,version}','snapshotSha256',storage_annul_view#>'{items,0,snapshotSha256}'));
 END LOOP;
 storage_annul_body:=jsonb_build_object('command','propose','proposalId',NULL,'proposalSha256',NULL,'items',storage_annul_items,'reason','Prueba sintética completa de capacidad mensual');
 CREATE TABLE monthly_storage_probe(slot integer PRIMARY KEY,padding text);
 ALTER TABLE monthly_storage_probe ALTER COLUMN padding SET STORAGE EXTERNAL;
 INSERT INTO monthly_storage_probe SELECT probe.slot,repeat('Q',1048576) FROM generate_series(1,600) AS probe(slot);
 -- Keep the actual physical footprint but no large values in the metadata scan.
 DELETE FROM monthly_storage_probe;`);
 ok(`qa_rejects(${correctionCall},'PAYROLL_MONTHLY_CORRECTION_CAPACITY_LIMIT')`,'old correction gate rejects actual occupied storage above 496 MiB');
 ok(`qa_rejects(${annulCall},'PAYROLL_MONTHLY_ANNUL_CAPACITY_LIMIT')`,'old annulment gate rejects the same complete approved synthetic batches');
 ok(`qa_rejects(${q(mutation)},'MONTHLY_STORAGE_PROVIDER_BUDGET_REQUIRED')`,'migration refuses an unverified provider budget');
 ok(`qa_rejects(${q(relocate(protocol.state))},'MONTHLY_STORAGE_ISOLATION_REQUIRED')`,'technical installation cannot silently use business READ COMMITTED isolation');
 checks.push(`EXECUTE ${q(beforeCheck)};EXECUTE ${q(relocate(protocol.before))};
 PERFORM set_config('municontrol_monthly_storage.provider_budget_bytes','1073741824',true);
 EXECUTE ${q(mutation)};EXECUTE ${q(afterCheck)};EXECUTE ${q(relocate(protocol.after))};EXECUTE ${q(relocate(protocol.conservation))};
 storage_installed:=current_setting('municontrol_monthly_storage.after')::jsonb;`);
 ok("storage_installed=current_setting('municontrol_monthly_storage.before')::jsonb",'adaptation preserves every prior row, security object and function attribute');
 checks.push(`EXECUTE ${q(mutation)};EXECUTE ${q(afterCheck)};EXECUTE ${q(relocate(protocol.after))};storage_repeated:=current_setting('municontrol_monthly_storage.after')::jsonb;`);
 ok('storage_repeated=storage_installed','repeat verifies the same two bodies without new adaptation');
 ok('(SELECT sum(pg_database_size(oid)) FROM pg_database)>520093696 AND (SELECT sum(pg_database_size(oid)) FROM pg_database)+2097152<1056964608','actual full-branch usage is above the former ceiling and within the new reserve');
 checks.push(`BEGIN CREATE TABLE monthly_storage_overflow(slot integer PRIMARY KEY,padding text);
 ALTER TABLE monthly_storage_overflow ALTER COLUMN padding SET STORAGE EXTERNAL;
 INSERT INTO monthly_storage_overflow SELECT overflow.slot,repeat('X',1048576) FROM generate_series(1,512) AS overflow(slot);`);
 ok(`qa_rejects(${correctionCall},'PAYROLL_MONTHLY_CORRECTION_CAPACITY_LIMIT')`,'new correction budget still rejects actual excess before recording a proposal');
 ok(`qa_rejects(${annulCall},'PAYROLL_MONTHLY_ANNUL_CAPACITY_LIMIT')`,'new annulment budget rejects the same excess without changing batches');
 checks.push("RAISE EXCEPTION USING ERRCODE='P1701',MESSAGE='RESTORE_MONTHLY_STORAGE_OVERFLOW';EXCEPTION WHEN SQLSTATE 'P1701' THEN NULL;END;");
 checks.push(`BEGIN SELECT pg_get_functiondef(${q(schema+'.payroll_monthly_annul_command_v1(jsonb,jsonb,uuid)')}::regprocedure) INTO storage_definition;
 EXECUTE replace(replace(storage_definition,'1056964608','520093696'),'(SELECT sum(pg_database_size(oid)) FROM pg_database)','pg_database_size(current_database())');`);
 ok(`qa_rejects(${q(mutation)},'MONTHLY_STORAGE_PARTIAL_STATE')`,'one original and one updated body abort before adapting either function');
 checks.push("RAISE EXCEPTION USING ERRCODE='P1702',MESSAGE='RESTORE_PARTIAL_MONTHLY_STORAGE';EXCEPTION WHEN SQLSTATE 'P1702' THEN NULL;END;");
 checks.push(`EXECUTE ${q(afterCheck)};`);
 ok(`has_function_privilege('municontrol_actions_runtime_app',${q(schema+'.payroll_monthly_annul_command_v1(jsonb,jsonb,uuid)')},'EXECUTE') AND has_function_privilege('municontrol_actions_runtime_app',${q(schema+'.payroll_monthly_correction_command_v1(jsonb,jsonb,uuid)')},'EXECUTE')`,'both existing facades retain their reviewed runtime authority');
 checks.push('END;');
 const anchor="body:=body||jsonb_build_object('command','propose','previewSha256',verified->'previewSha256');key_value:=gen_random_uuid();proposal_receipt:=payroll_monthly_correction_command_v1(maker,body,key_value);";
 assert.equal(base.sql.split(anchor).length,2);
 const report={...base.report,checksPassed:base.report.checksPassed+count,monthlyStorageChecksPassed:count,storageProbeBytes:600*1048576,overflowProbeBytes:512*1048576,adaptedFunctions:2,durableInstallationVerified:false,fixtureTransactionTimeoutSeconds:180};
 const sql=base.sql.replaceAll("current_database()<>'native_monthly_qa'","current_database()<>'own_payroll_run_qa'")
  // Only this new fixture materializes over 1 GiB. Original checks are intact;
  // application and production installation deadlines stay unchanged.
  .replace("SET LOCAL statement_timeout='90s'","SET LOCAL statement_timeout='180s'")
  .replace(anchor,()=>checks.join('\n')+'\n'+anchor)
  .replace('checks<>'+base.report.checksPassed,'checks<>'+report.checksPassed)
  .replace(q(JSON.stringify(base.report)),()=>q(JSON.stringify(report)));
 assert.doesNotMatch(sql,/INSERT\s+INTO\s+public\./i);assert.match(sql,/ROLLBACK;\s*$/);
 return{...base,sql,report};
}
