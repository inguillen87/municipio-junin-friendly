// Canonical SQL061 and SQL144, both delta layers, fictional rows only.
// Returns a rollback-only experiment; it never connects to a database.
import assert from 'node:assert/strict';
import {splitPostgresStatements} from './sql-statements.mjs';
import {finalSourceStreamingFingerprintDefinition} from './final-source-fingerprint-streaming.mjs';

export function adoptionStreamingProjectionQa(read,schema){
 assert.match(schema,/^mc_qa_stream_[a-f0-9]{32}$/);
 const batch='10000000-0000-4000-8000-000000000001',version='10000000-0000-4000-8000-000000000002',revision='10000000-0000-4000-8000-000000000003',contract='10000000-0000-4000-8000-000000000004';
 const key=i=>`repeat(md5('synthetic-row-${i}'),2)`;
 const definition=(file,name)=>{
  const values=splitPostgresStatements(read(file).replace(/\r\n?/g,'\n')).map(s=>s.replace(/^(?:\s*--[^\n]*\n)+\s*/,''));
  const d=values.filter(s=>new RegExp('^CREATE(?: OR REPLACE)? FUNCTION (?:public\\.)?'+name+'\\(').test(s));
  assert.equal(d.length,1,name);return d[0];
 };
 const core=['grh_core_source_base_rows_v1','grh_core_source_unsealed_rows_v1'].map(name=>definition('scripts/migrations/061-grh-core-source-version.sql',name));
 const final=['grh_final_source_entities_v1','grh_final_source_base_rows_v1','grh_final_source_unsealed_rows_v1','grh_final_source_fingerprint_v1'].map(name=>definition('scripts/migrations/144-final-grh-source-revision.sql',name));
 const n=s=>s.replace(/\bpublic\b/g,schema);
 const baseline=`CREATE TABLE ${schema}.employment_contract(id uuid PRIMARY KEY,legacy_company_id bigint,legacy_legajo text);
 CREATE TABLE ${schema}.grh_core_source_version(id uuid PRIMARY KEY,baseline_batch_id uuid);
 CREATE TABLE ${schema}.grh_final_source_revision(id uuid PRIMARY KEY,parent_core_version_id uuid,parent_curated_version_id uuid);
 CREATE TABLE ${schema}.grh_core_source_delta(version_id uuid,entity text,source_id text,operation text,record jsonb,PRIMARY KEY(version_id,entity,source_id));
 CREATE TABLE ${schema}.grh_final_source_delta(revision_id uuid,entity text,row_key text,operation text,record jsonb,PRIMARY KEY(revision_id,entity,row_key));
 CREATE TABLE ${schema}.employment_movement(source_id text,employment_contract_id uuid,source_batch_id uuid,source_system text,movement_period date,payroll_type text,movement_type text,concept_source_id text,cost_center_source_id text,quantity numeric,installment integer,automatic_source_value numeric,adjustment_source_value numeric,forced_source_value numeric,legal_instrument text,movement_status text);
 CREATE TABLE ${schema}.payroll_monthly_fact(source_id text,employment_contract_id uuid,source_batch_id uuid,source_system text,payroll_date date,source_period integer,source_month integer,payroll_type text,item_count integer,quantity_sum numeric,technical_source_amount_sum numeric,employer_contributions numeric,social_security_taxable_base numeric,health_taxable_base numeric,total_subject_earnings numeric,total_non_subject_earnings numeric,family_allowance numeric,employee_withholdings numeric,employer_taxable_base numeric,net numeric,net_payable numeric,dominant_agreement_source_id text,dominant_sector_source_id text,distinct_concepts integer,source_payload jsonb);
 INSERT INTO ${schema}.employment_contract VALUES('${contract}',101,'QA-ONLY');
 INSERT INTO ${schema}.grh_core_source_version VALUES('${version}','${batch}');
 INSERT INTO ${schema}.grh_final_source_revision VALUES('${revision}','${version}',NULL);
 INSERT INTO ${schema}.employment_movement SELECT repeat(md5('synthetic-row-'||i),2),'${contract}','${batch}','GRH','2026-10-01','monthly','standard','QA-CODE','QA-AREA',CASE WHEN i=1 THEN NULL WHEN i=2 THEN 0 ELSE 12345678901234567890.1234567890123456789 END,1,NULL,0,0,'QA synthetic','review' FROM generate_series(1,511) i;
 INSERT INTO ${schema}.payroll_monthly_fact(source_id,employment_contract_id,source_batch_id,source_system,payroll_date,source_period,source_month,payroll_type,item_count,quantity_sum,technical_source_amount_sum,net,net_payable,distinct_concepts,source_payload) SELECT repeat(md5('synthetic-row-'||i),2),'${contract}','${batch}','GRH','2026-10-01',2026,10,'monthly',1,CASE WHEN i=1 THEN NULL WHEN i=2 THEN 0 ELSE 12345678901234567890.1234567890123456789 END,100.01,NULL,100.01,1,'{"qualityFlags":[]}'::jsonb FROM generate_series(1,511) i;
 CREATE TABLE ${schema}.qa_checks(name text PRIMARY KEY);`;
 const check=(name,condition)=>`IF NOT coalesce((${condition}),false) THEN RAISE EXCEPTION '${name}';END IF;INSERT INTO ${schema}.qa_checks VALUES('${name}');`;
 const original=e=>`${schema}.grh_final_source_fingerprint_v1('${revision}','${e}',false)`;
 const streamed=e=>`${schema}.adoption_source_streaming_fingerprint_v1('${revision}','${e}')`;
 const equal=e=>`${original(e)} IS NOT DISTINCT FROM ${streamed(e)}`;
 let tests='';
 for(const e of ['core/movements','core/payrollMonthly']){
  const k=e.slice(5),tag=k.toUpperCase(),qty=k==='movements'?'quantity':'quantity_sum',table=k==='movements'?'employment_movement':'payroll_monthly_fact';
  tests+=check(tag+'_ALL_511_BASE_ROWS',equal(e)+` AND (${streamed(e)}->>'rows')::int=511`);
  tests+=check(tag+'_NULL_DISTINCT_ZERO',`(SELECT record->'${qty}' FROM ${schema}.grh_core_source_base_rows_v1('${batch}','${k}') WHERE source_id=${key(1)})='null'::jsonb AND (SELECT record->>'${qty}' FROM ${schema}.grh_core_source_base_rows_v1('${batch}','${k}') WHERE source_id=${key(2)})='0'`);
  tests+=check(tag+'_EXACT_LONG_DECIMAL',`(SELECT record->>'${qty}' FROM ${schema}.grh_core_source_base_rows_v1('${batch}','${k}') WHERE source_id=${key(3)})='12345678901234567890.1234567890123456789'`);
  tests+=`INSERT INTO ${schema}.grh_core_source_delta VALUES('${version}','${k}',${key(1)},'replace','{"synthetic":"core-replace"}'),('${version}','${k}',${key(2)},'remove',NULL),('${version}','${k}',${key(512)},'add','{"synthetic":"core-add"}'),('${version}','${k}',${key(513)},'add','{"synthetic":"core-add-final-remove"}');`;
  tests+=check(tag+'_CORE_DELTA_EQUAL',equal(e));
  tests+=`INSERT INTO ${schema}.grh_final_source_delta VALUES('${revision}','${e}',${key(1)},'replace','{"synthetic":"final-replace"}'),('${revision}','${e}',${key(3)},'remove',NULL),('${revision}','${e}',${key(512)},'replace','{"synthetic":"final-over-core-add"}'),('${revision}','${e}',${key(513)},'remove',NULL),('${revision}','${e}',${key(514)},'add','{"synthetic":"final-add"}'),('${revision}','${e}',${key(2)},'add','{"synthetic":"final-reintroduce"}');`;
  tests+=check(tag+'_BOTH_DELTA_EQUAL',equal(e)+` AND (${streamed(e)}->>'rows')::int=512`);
  tests+=check(tag+'_FINAL_PRECEDENCE',`(SELECT record->>'synthetic' FROM ${schema}.grh_final_source_unsealed_rows_v1('${revision}','${e}') WHERE row_key=${key(1)})='final-replace' AND NOT EXISTS(SELECT 1 FROM ${schema}.grh_final_source_unsealed_rows_v1('${revision}','${e}') WHERE row_key IN(${key(3)},${key(513)}))`);
  tests+=`DELETE FROM ${schema}.grh_core_source_delta WHERE entity='${k}';DELETE FROM ${schema}.grh_final_source_delta WHERE entity='${e}';DELETE FROM ${schema}.${table};`;
  tests+=check(tag+'_EMPTY_EQUAL',equal(e)+` AND ${streamed(e)}=jsonb_build_object('rows',0,'md5',md5(''))`);
 }
 tests+=`BEGIN PERFORM ${schema}.adoption_source_streaming_fingerprint_v1('20000000-0000-4000-8000-000000000000','core/movements');RAISE EXCEPTION 'MISSING_REVISION_NOT_REJECTED';EXCEPTION WHEN no_data_found THEN INSERT INTO ${schema}.qa_checks VALUES('MISSING_REVISION_REJECTED');END;
 BEGIN PERFORM ${schema}.adoption_source_streaming_fingerprint_v1('${revision}','anything');RAISE EXCEPTION 'UNKNOWN_ENTITY_NOT_REJECTED';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'GRH_FINAL_REVISION_ENTITY' THEN RAISE;END IF;INSERT INTO ${schema}.qa_checks VALUES('ORIGINAL_FALLBACK_ENTITY_REJECTED');END;`;
 return `BEGIN;CREATE SCHEMA ${schema};SET LOCAL search_path=${schema},pg_catalog,pg_temp;${baseline}
 ${[...core,...final].map(n).join(';\n')};${n(finalSourceStreamingFingerprintDefinition(read))};
 DO $qa$ BEGIN ${tests} END $qa$;
 SELECT jsonb_build_object('major',current_setting('server_version_num')::int/10000,'checks',(SELECT count(*) FROM ${schema}.qa_checks),'names',(SELECT jsonb_agg(name ORDER BY name) FROM ${schema}.qa_checks),'synthetic',true,'liveInstalled',false);
 ROLLBACK;SELECT to_regnamespace('${schema}') IS NULL;`;
}
