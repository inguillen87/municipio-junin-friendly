// Generate rollback-only SQL for the installed psql client; no extra database driver dependency.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {batchFixture,batchPreview,BATCH_DATASET,BATCH_TENANT} from '../tests/fixtures/payroll-document-selection-synthetic.js';
const f=batchFixture();await batchPreview({},f);
const output=process.argv.find(a=>a.startsWith('--write-sql='))?.slice(12);if(!output)throw Error('QA_SQL_OUTPUT_REQUIRED');
const literal=v=>Array.isArray(v)?'ARRAY['+v.map(literal).join(',')+']':v===null?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
const render=(entry,overrides={})=>entry.text.replace(/\$(\d+)/g,(_,i)=>literal(Object.hasOwn(overrides,i)?overrides[i]:entry.values[Number(i)-1]));
const batch='44444444-4444-4444-8444-444444444444',binding='55555555-5555-4555-8555-555555555555';
let sql=`BEGIN;
DO $guard$ BEGIN IF current_database()<>'payroll_selection_qa' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN RAISE EXCEPTION 'LOCAL_QA_DATABASE_REQUIRED'; END IF; END $guard$;
SET LOCAL statement_timeout='15s';
CREATE TEMP TABLE platform_tenant_source_binding(id uuid,tenant_id uuid,source_database text,source_company_id bigint,source_system text,verified boolean);
CREATE TEMP TABLE grh_effective_source_batch_v1(id uuid,source_database text,source_system text,source_cutoff timestamptz);
CREATE TEMP TABLE payroll_detail_dataset(id uuid,tenant_id uuid,source_binding_id uuid,source_database text,company_id bigint,payroll_date date,source_period int,source_month int,payroll_type text,source_closed_flag int,payload_sha256 text,source_sha256 text,source_label text,statement_count int);
CREATE TEMP TABLE employment_contract(id uuid,source_batch_id uuid,source_system text,legacy_company_id bigint,legacy_legajo text);
CREATE TEMP TABLE grh_effective_employees_v1(company_id bigint,legajo text,nombre text,sector_code text,sector text);
CREATE TEMP TABLE qa_checks(label text);
CREATE FUNCTION pg_temp.selection_ok(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $f$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'SELECTION_QA_FAILED: %',label;END IF;INSERT INTO qa_checks VALUES(label);END $f$;
INSERT INTO platform_tenant_source_binding VALUES('${binding}','${BATCH_TENANT}','grh_qa',101,'GRH',true);
INSERT INTO grh_effective_source_batch_v1 VALUES('${batch}','grh_qa','GRH','2026-09-10 15:17:30-03:00');
INSERT INTO payroll_detail_dataset VALUES('${BATCH_DATASET}','${BATCH_TENANT}','${binding}','grh_qa',101,'2026-08-31',2026,8,'M',1,'${'b'.repeat(64)}','${'c'.repeat(64)}','Detalle QA',62);
INSERT INTO employment_contract SELECT (a->>'contractId')::uuid,'${batch}','GRH',101,r->>'number' FROM jsonb_array_elements(${literal(JSON.stringify(f.records))}::jsonb) r CROSS JOIN LATERAL jsonb_array_elements(r->'assignments') a;
INSERT INTO grh_effective_employees_v1 SELECT 101,r->>'number',r#>>'{assignments,0,name}',r#>>'{assignments,0,sectorCode}',r#>>'{assignments,0,sectorLabel}' FROM jsonb_array_elements(${literal(JSON.stringify(f.records))}::jsonb) r WHERE jsonb_array_length(r->'assignments')>0;
`;
assert.equal(f.calls.length,2);
sql+=`WITH actual AS (${render(f.calls[0])}) SELECT pg_temp.selection_ok((SELECT count(*)=1 AND min(period)=2026 AND min(month)=8 AND min(total)=62 FROM actual),'exact dataset metadata');\n`;
sql+=`WITH actual AS (${render(f.calls[1])}) SELECT pg_temp.selection_ok((SELECT count(*)=62 AND count(*) FILTER(WHERE jsonb_array_length(assignments)=0)=1 AND count(*) FILTER(WHERE jsonb_array_length(assignments)>1)=1 FROM actual),'complete directory and ambiguous identities');\n`;
for(const [name,override]of [['tenant',{2:'99999999-9999-4999-8999-999999999999'}],['database',{3:'other_source'}],['company',{4:202}]]){
 for(const entry of f.calls)sql+=`WITH actual AS (${render(entry,override)}) SELECT pg_temp.selection_ok((SELECT count(*)=0 FROM actual),'foreign ${name} rejected');\n`;
}
sql+=`UPDATE platform_tenant_source_binding SET verified=false;\nWITH actual AS (${render(f.calls[0])}) SELECT pg_temp.selection_ok((SELECT count(*)=0 FROM actual),'unverified binding rejected');\n`;
sql+=`SELECT jsonb_build_object('ok',true,'checksPassed',count(*),'synthetic',true,'municipalWrites',0) FROM qa_checks;
ROLLBACK;
SELECT to_regclass('pg_temp.payroll_detail_dataset') IS NULL AS temporary_schema_reverted;
`;
fs.writeFileSync(path.resolve(output),sql);console.log('Generated guarded, temporary-table PostgreSQL QA. No connection was opened.');
