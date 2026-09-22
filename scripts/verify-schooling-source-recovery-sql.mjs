// Standalone real PostgreSQL QA; reuses 091's isolated 007/057/064/091 foundation.
// Generates SQL only. No Neon access and no municipal fixtures are loaded.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildSchoolingQa} from './verify-schooling-records-sql.mjs';
const quote=x=>"'"+String(x).replaceAll("'","''")+"'";
export function buildSchoolingSourceQa({serverMajor}){
 const base=buildSchoolingQa({serverMajor});const {schema,ids}=base;
 const source=fs.readFileSync(new URL('./migrations/094-schooling-source-recovery.sql',import.meta.url),'utf8');
 const relocate=s=>s.replaceAll('public.',schema+'.').replaceAll(schema+'.digest(', 'public.digest(').replaceAll("'public'::regnamespace","'"+schema+"'::regnamespace").replaceAll("||', pg_temp']","||', public, pg_temp']").replace(/SET search_path=pg_catalog,public,pg_temp/g,`SET search_path=pg_catalog,${schema},public,pg_temp`);
 const sql094=relocate(source);
 const guard094=sql094.slice(sql094.indexOf('DO $source_prerequisite$'),sql094.indexOf('END $source_prerequisite$;')+'END $source_prerequisite$;'.length);
 const migrationSha256=createHash('sha256').update(source).digest('hex');
 const start=base.sql.indexOf('ctx:=school_certificate_context_v1(',base.sql.indexOf('-- The original quota/storage functions remain real'));
 const end=base.sql.indexOf(" RAISE EXCEPTION USING ERRCODE='P0910'",start);
 assert.ok(start>0 && end>start,'091_QA_FIXTURE_BOUNDARY_CHANGED');
 const fragments=[];let checks=0;
 const run=s=>fragments.push(s.trim().replace(/;+$/,'')+';');
 const ok=(s,label)=>{run(`PERFORM qa_assert((${s}),${quote(label)}); checks:=checks+1`);checks++;};
 const args=`c->>'email',(c->>'session')::uuid,(c->>'version')::integer,c->>'release',(c->>'tenant')::uuid,(c->>'membership')::uuid`;
 const read=(contract='NULL')=>`school_certificate_read_v4(${args},${contract})`;
 const imp=(data='payload',apply='false',tenant=quote(ids.tenant),binding=quote(ids.binding),batch=quote(ids.batch))=>`school_certificate_source_import_v4(${tenant}::uuid,${binding}::uuid,${batch}::uuid,${data},'technical authorized source recovery',${apply})`;
 const rejects=(call,code,label)=>ok(`qa_rejects(format(${quote('SELECT '+call.replaceAll('payload','%1$L::jsonb'))},payload),${quote('SCHOOL_CERTIFICATE_'+code)})`,label);
 run(`CREATE TABLE data_import_runs(id bigint PRIMARY KEY,source_name text,source_sha256 text,source_cutoff timestamp,status text)`);
 run(`ALTER TABLE source_import_batch ADD COLUMN source_sha256 text; ALTER TABLE grh_family ADD COLUMN sexo text; ALTER TABLE grh_family ADD COLUMN source_payload jsonb DEFAULT '{}'::jsonb`);
 run(`INSERT INTO data_import_runs VALUES(91001,'qa_grh',repeat('a',64),'2026-09-10 00:00:00','completed'),(91002,'qa_other',repeat('b',64),'2026-09-10 00:00:00','completed')`);
 run(`UPDATE source_import_batch SET source_sha256=CASE WHEN legacy_import_run_id=91001 THEN repeat('a',64) ELSE repeat('b',64) END,source_cutoff=source_cutoff+interval '3 hours'`);
 run(`CREATE FUNCTION qa_guard_rejects(mutation text,guard_sql text) RETURNS boolean LANGUAGE plpgsql AS $f$ BEGIN EXECUTE mutation; EXECUTE guard_sql; RETURN false; EXCEPTION WHEN OTHERS THEN RETURN SQLERRM='SCHOOL_CERTIFICATE_SOURCE_PREREQUISITE'; END $f$`);
 ok(`qa_guard_rejects('CREATE TABLE school_certificate_source_date(unrelated text)',${quote(guard094)})`,'installation refuses unrelated existing table');
 run(sql094);
 run(sql094); // Idempotent installation does not create any municipal row.
 const pinnedFunctions=[['school_certificate_context_v1','text,uuid,integer,text,uuid,uuid,boolean,text'],['school_certificate_current_family_v2','jsonb,uuid'],['school_certificate_read_v3','text,uuid,integer,text,uuid,uuid,uuid'],['school_certificate_source_immutable_v4',''],['school_certificate_source_identity_v4','jsonb'],['school_certificate_source_field_v4','jsonb,text'],['school_certificate_source_import_v4','uuid,uuid,uuid,jsonb,text,boolean'],['school_certificate_read_v4','text,uuid,integer,text,uuid,uuid,uuid']];
 for(const[name,args] of pinnedFunctions)ok(`qa_guard_rejects((SELECT replace(pg_get_functiondef(p.oid),p.prosrc,p.prosrc||E'\\n-- altered body') FROM pg_proc p WHERE p.oid=to_regprocedure(${quote(name+'('+args+')')})),${quote(guard094)})`,'altered pinned body rejected: '+name);
 for(const mutation of [
  'ALTER TABLE school_certificate_source_date ALTER COLUMN legajo DROP NOT NULL',
  'ALTER TABLE school_certificate_source_date DROP CONSTRAINT school_certificate_source_date_family_id_check',
  'ALTER TABLE school_certificate_source_date DISABLE ROW LEVEL SECURITY',
  'ALTER TABLE school_certificate_source_date DISABLE TRIGGER school_certificate_source_date_immutable',
  'GRANT SELECT ON school_certificate_source_date TO municontrol_actions_runtime_app',
  'CREATE FUNCTION school_certificate_source_field_v4() RETURNS text LANGUAGE sql AS $$SELECT NULL::text$$',
  'GRANT EXECUTE ON FUNCTION school_certificate_read_v4(text,uuid,integer,text,uuid,uuid,uuid) TO PUBLIC',
  'CREATE POLICY untrusted_read ON school_certificate_source_date FOR SELECT USING (true)',
 ])ok(`qa_guard_rejects(${quote(mutation)},${quote(guard094)})`,'installation refuses modified object: '+mutation.split(' ').slice(0,4).join(' '));

 run(`CREATE FUNCTION qa_permission_denied(statement text) RETURNS boolean LANGUAGE plpgsql AS $f$ BEGIN EXECUTE statement; RETURN false; EXCEPTION WHEN insufficient_privilege THEN RETURN true; END $f$`);
 run(`SELECT md5(jsonb_agg(to_jsonb(g) ORDER BY family_id)::text) INTO source_before FROM grh_family g`);
 run(`SELECT jsonb_build_object('version','schooling-source-recovery.v1','sourceSystem','GRH','sourceDatabase','qa_school_source','sourceSha256',repeat('a',64),'sourceDeclaredCutoff','2026-09-10T00:00:00','rows',jsonb_agg(jsonb_build_object(
 'familyId',family_id::text,'companyId',company_id,'legajo',legajo,'identitySha256',school_certificate_source_identity_v4(to_jsonb(f)),
 'sourceFields',CASE WHEN legajo='QA-2' THEN '{"PRES_14":null}'::jsonb WHEN nombre='Hijo para concurrencia' THEN '{"PRES_14":null,"VENC_14":"2026-02-30"}'::jsonb ELSE '{"PRES_14":"2024-03-10","VENC_14":"2050-12-31"}'::jsonb END) ORDER BY family_id)) INTO payload FROM grh_family f WHERE import_run_id=91001`);
 run(`result:=${read()}`);
 ok("result->>'version'='family-schooling.v4' AND jsonb_array_length(result->'rows')=3",'read v4 reuses real context and cohort');
 ok("NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'rows') r WHERE r->'sourceSchooling'<>'null'::jsonb OR r#>>'{effectiveDates,origin}'<>'none')",'before recovery nothing is invented');
 run(`receipt:=${imp()}`);
 ok("receipt->>'matched'='3' AND receipt->>'applied'='false' AND (SELECT count(*)=0 FROM school_certificate_source_recovery)",'complete owner preflight writes no row');
 const bad=[
  ["payload||'{\"sourceSystem\":null}'",'SOURCE_PAYLOAD_INVALID','null source system rejected'],
  ["payload||'{\"sourceDatabase\":\"wrong\"}'",'SOURCE_MISMATCH','wrong database rejected'],
  ["payload||jsonb_build_object('sourceSha256',repeat('b',64))",'SOURCE_MISMATCH','backup hash mismatch rejected'],
  ["payload||'{\"sourceDeclaredCutoff\":\"2026-09-10T03:00:00\"}'",'SOURCE_MISMATCH','declared cutoff is not silently converted to batch time'],
  ["jsonb_set(payload,'{rows,0,identitySha256}',to_jsonb(repeat('0',64)))",'SOURCE_IDENTITY_MISMATCH','exact source identity required'],
  ["jsonb_set(payload,'{rows,0,legajo}',to_jsonb('QA-2'::text))",'SOURCE_IDENTITY_MISMATCH','legajo does not redirect child evidence'],
  ["jsonb_set(payload,'{rows}',(payload->'rows')-0)",'SOURCE_IDENTITY_MISMATCH','partial cohorts rejected'],
  ["jsonb_set(payload,'{rows}',(payload->'rows')||jsonb_build_array(payload#>'{rows,0}'))",'SOURCE_PAYLOAD_INVALID','duplicate keys rejected'],
  ["jsonb_set(payload,'{rows,0,sourceFields}',jsonb_build_object('FBAJ_14','2026-12-01'))",'SOURCE_PAYLOAD_INVALID','family termination cannot become expiry'],
  ["jsonb_set(payload,'{rows,0,sourceFields,PRES_14}','42'::jsonb)",'SOURCE_PAYLOAD_INVALID','numeric source date rejected'],
 ];
 for(const [data,code,label]of bad)rejects(imp(data),code,label);
 rejects(imp('payload','false',quote(ids.otherTenant)),'SOURCE_MISMATCH','tenant binding cannot be crossed');
 rejects(imp('payload','false',quote(ids.tenant),quote(ids.otherBinding)),'SOURCE_MISMATCH','other certified binding rejected');
 run(`UPDATE platform_tenant_source_binding SET verified=false WHERE id=${quote(ids.binding)};`);
 rejects(imp(),'SOURCE_MISMATCH','binding revocation blocks even preflight');
 run(`UPDATE platform_tenant_source_binding SET verified=true WHERE id=${quote(ids.binding)}`);
 for(const column of ['source_sha256','source_cutoff']){
  run(`UPDATE data_import_runs SET ${column}=NULL WHERE id=91001`);
  rejects(imp(),'SOURCE_MISMATCH','missing import '+column+' is not a match');
  run(`UPDATE data_import_runs SET ${column}=${column==='source_sha256'?"repeat('a',64)":"'2026-09-10 00:00:00'"} WHERE id=91001`);
 }
 run(`UPDATE source_import_batch SET source_cutoff=source_cutoff+interval '1 hour' WHERE id=${quote(ids.batch)}`);
 rejects(imp(),'SOURCE_MISMATCH','batch timestamp must equal the original documented timezone conversion');
 run(`UPDATE source_import_batch SET source_cutoff=source_cutoff-interval '1 hour' WHERE id=${quote(ids.batch)}`);
 run(`result:=${imp('payload','true')}`);
 ok("result->>'applied'='true' AND result->>'replayed'='false' AND result->>'manualRecordsCreated'='0' AND result->>'originalRowsModified'='0' AND result->>'payrollModified'='false'",'committable import has a truthful source-only receipt');
 ok('(SELECT count(*)=1 FROM school_certificate_source_recovery) AND (SELECT count(*)=3 FROM school_certificate_source_date)','complete cohort appended exactly once');
 run(`receipt:=${imp('payload','true')}`);
 ok("receipt->>'replayed'='true' AND receipt->>'rowsetSha256'=result->>'rowsetSha256'",'same source recovery replays stably');
 run(`payload:=jsonb_set(payload,'{rows}',(SELECT jsonb_agg(v ORDER BY ord DESC) FROM jsonb_array_elements(payload->'rows') WITH ORDINALITY x(v,ord)))`);
 run(`receipt:=${imp('payload','true')}`);
 ok("receipt->>'replayed'='true'",'input row order does not create duplicate recovery');
 rejects(imp("jsonb_set(payload,'{rows,0,sourceFields}',jsonb_build_object('PRES_14','2026-01-01'))",'true'),'SOURCE_CONFLICT','same source with changed date bytes conflicts');
 run(`result:=${read()}`);
 ok("(SELECT count(*)=3 FROM jsonb_array_elements(result->'rows') r WHERE r#>>'{sourceSchooling,sourceSystem}'='GRH' AND r#>>'{effectiveDates,origin}'='grh_source' AND r->'certificate'='null'::jsonb AND r->>'historyCount'='0')",'source dates never fabricate a PDF or manual-history event');
 ok("(SELECT bool_and(r#>>'{sourceSchooling,sourceCutoff}'=r->>'sourceCutoff' AND r#>>'{sourceSchooling,sourceDeclaredCutoff}'='2026-09-10T00:00:00') FROM jsonb_array_elements(result->'rows') r)",'both original cutoff representations remain separate');
 ok("EXISTS(SELECT 1 FROM jsonb_array_elements(result->'rows') r WHERE r#>>'{sourceSchooling,expiryState}'='invalid' AND r#>'{effectiveDates,expiresOn}'='null'::jsonb)",'invalid source date stays unknown');
 ok("EXISTS(SELECT 1 FROM jsonb_array_elements(result->'rows') r WHERE r#>>'{sourceSchooling,presentationState}'='null' AND r#>>'{sourceSchooling,expiryState}'='absent')",'SQL NULL and absent field remain distinct');
 ok("NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'rows') r WHERE r#>>'{sourceSchooling,documentAvailable}'<>'false' OR r#>>'{sourceSchooling,reviewState}'<>'historical_unreviewed')",'no document or review acceptance invented');
 run(`ctx:=school_certificate_context_v1(${args}); SELECT to_jsonb(f) INTO family_row FROM school_certificate_current_family_v2(ctx,${quote(ids.contract)}::uuid) f WHERE f.family_name='Hija de ensayo'; token:=family_row->>'identity_token'`);
 run(`paper_payload:=jsonb_build_object('contractId',${quote(ids.contract)},'familyRef',jsonb_build_object('kind','grh','id',family_row->>'family_id'),'identityToken',token,'expectedCertificateId',NULL,'institution',NULL,'educationLevel',NULL,'course',NULL,'schoolYear',NULL,'issuedOn',NULL,'presentedOn','2026-09-20','expiresOn',NULL,'evidenceMode','paper_declared','paperReference','Synthetic paper register','filename',NULL,'contentBase64',NULL,'sha256',NULL,'reason','Synthetic source precedence test')`);
 run(`receipt:=school_certificate_register_v3(${args},paper_payload,${quote(randomUUID())})`);
 run(`result:=${read()}`);
 ok("EXISTS(SELECT 1 FROM jsonb_array_elements(result->'rows') r WHERE r#>>'{familyRef,id}'=family_row->>'family_id' AND r#>>'{effectiveDates,origin}'='manual' AND r#>>'{effectiveDates,presentedOn}'='2026-09-20' AND r#>'{effectiveDates,expiresOn}'='null'::jsonb AND r#>>'{sourceSchooling,expiresOn}'='2050-12-31' AND r->>'historyCount'='1')",'manual pair wins including explicitly unknown expiry');
 run(`result:=school_certificate_read_v4(outsider->>'email',(outsider->>'session')::uuid,1,outsider->>'release',(outsider->>'tenant')::uuid,(outsider->>'membership')::uuid,NULL)`);
 ok("NOT EXISTS(SELECT 1 FROM jsonb_array_elements(result->'rows') r WHERE r->'sourceSchooling'<>'null'::jsonb)",'foreign tenant never receives recovered source rows');
 run(`UPDATE grh_family SET dni='synthetic changed identity' WHERE family_id=(family_row->>'family_id')::bigint`);
 run(`result:=${read()}`);
 ok("EXISTS(SELECT 1 FROM jsonb_array_elements(result->'rows') r WHERE r#>>'{familyRef,id}'=family_row->>'family_id' AND r->'sourceSchooling'='null'::jsonb AND r->'certificate'='null'::jsonb)",'same key reused with different identity exposes neither source nor manual evidence');
 rejects(imp('payload','true'),'SOURCE_IDENTITY_MISMATCH','replay revalidates current exact identity');
 run(`UPDATE grh_family SET dni=NULL WHERE family_id=(family_row->>'family_id')::bigint`);
 ok('(SELECT md5(jsonb_agg(to_jsonb(g) ORDER BY family_id)::text)=source_before FROM grh_family g)','original source rows remain unchanged');
 for(const table of ['school_certificate_source_recovery','school_certificate_source_date'])for(const action of [`UPDATE ${table} SET ${table.endsWith('date')?'legajo=legajo':'operator_label=operator_label'}`,`DELETE FROM ${table}`,`TRUNCATE ${table} CASCADE`])ok(`qa_rejects(${quote(action)},'SCHOOL_CERTIFICATE_SOURCE_IMMUTABLE')`,table+' is append-only: '+action.split(' ')[0]);
 ok("NOT has_function_privilege('municontrol_actions_runtime_app','school_certificate_source_import_v4(uuid,uuid,uuid,jsonb,text,boolean)','EXECUTE') AND has_function_privilege('municontrol_actions_runtime_app','school_certificate_read_v4(text,uuid,integer,text,uuid,uuid,uuid)','EXECUTE')",'runtime can read but cannot provision backup evidence');
 ok("NOT has_table_privilege('municontrol_actions_runtime_app','school_certificate_source_date','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('municontrol_actions_runtime_app','school_certificate_source_recovery','SELECT,INSERT,UPDATE,DELETE')",'runtime has no source table access');
 ok("NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.pronamespace=current_schema()::regnamespace AND p.proname LIKE 'school_certificate_%_v4' AND a.grantee=0)",'no v4 function is public');
 run(`GRANT USAGE ON SCHEMA ${schema} TO municontrol_actions_runtime_app; SET LOCAL ROLE municontrol_actions_runtime_app`);
 ok(`qa_permission_denied(${quote('SELECT * FROM school_certificate_source_date')})`,'actual runtime SELECT denied');
 ok(`qa_permission_denied(${quote('DELETE FROM school_certificate_source_date')})`,'actual runtime DML denied');
 ok(`qa_permission_denied(${quote('SELECT '+imp("'{}'::jsonb"))})`,'actual runtime owner import denied');
 run('RESET ROLE');
 run(`UPDATE tenant_identity_session SET status='revoked' WHERE id=${quote(ids.writerSession)}`);
 ok(`qa_rejects(${quote(`SELECT school_certificate_read_v4('writer@example.invalid','${ids.writerSession}',1,'${'9'.repeat(40)}','${ids.tenant}','${ids.writer}',NULL)`)},'SCHOOL_CERTIFICATE_SESSION_INVALID')`,'source reader uses real revoked-session guard');
 const report={ok:true,checksPassed:checks,serverMajor:Number(serverMajor),migrationSha256,actualMigrations:['007','057','064','091','094'],syntheticSchemaRolledBack:true,municipalRowsWritten:0,limitations:['IAM capability fixtures are synthetic; original session/MFA/binding/source and manual writer functions execute. No physical devices or municipal backup are used.']};
 let tail=base.sql.slice(end).replace(`checks<>${base.report.checksPassed}`,`checks<>${checks}`).replace(quote(JSON.stringify(base.report)),quote(JSON.stringify(report)));
 const sql=base.sql.slice(0,start)+fragments.join('\n')+'\n'+tail;
 return {sql,report};
}
function main(){
 const a={};for(const x of process.argv.slice(2)){if(x==='--ci'){a.ci=true;continue;}const m=/^--(expected-major|write-sql)=(.+)$/.exec(x);assert.ok(m && !a[m[1]],'INVALID_ARGUMENT');a[m[1]]=m[2];}
 assert.ok(a.ci && a['write-sql'],'CI_AND_OUTPUT_REQUIRED');const result=buildSchoolingSourceQa({serverMajor:a['expected-major']});
 const output=path.resolve(a['write-sql']);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,result.sql,{flag:'wx'});console.log(JSON.stringify({...result.report,generatedOnly:true}));
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
