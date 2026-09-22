// Emits synthetic, rollback-only PostgreSQL QA. No connection or municipal data access.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './lib/sql-statements.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const schema='grh_reference_rotation_qa';
const read=file=>readFileSync(resolve(root,file),'utf8').replaceAll('\r\n','\n');

export function buildGrhReferenceRotationQa({expectedMajor=17}={}){
 if(![17,18].includes(expectedMajor))throw Error('Unsupported PostgreSQL major');
 const source=read('scripts/canonical-promote-current-grh.sql'),statements=splitPostgresStatements(source),rotation=statements[7];
 if(statements.length!==17||!rotation?.includes('UPDATE source_xref existing\nSET valid_to = batch.source_cutoff')
  ||!rotation.includes('FROM public.grh_employees'))throw Error('Reference rotation statement drift');
 const canonical=read('scripts/migrations/002-canonical-integration.sql');
 const tables=['source_import_batch','source_xref'].map(name=>{
  const start=canonical.indexOf('CREATE TABLE IF NOT EXISTS '+name+' ('),end=canonical.indexOf('\n);',start);
  if(start<0||end<0)throw Error('Canonical fixture table missing');
  return canonical.slice(start,end+3);
 }).join('\n');
 const compile=(sql,revision)=>sql.replace(/\b(FROM|JOIN) public\.(grh_employees|grh_absences|grh_leaves|grh_family|grh_catalog_rows|source_staging_row)\b/g,(_m,operation,table)=>{
  const names={grh_employees:'grh_source_employees_v1',grh_absences:'grh_source_absences_v1',grh_leaves:'grh_source_leaves_v1',grh_family:'grh_source_family_v1',grh_catalog_rows:'grh_source_catalog_rows_v1',source_staging_row:'grh_effective_source_staging_v1'};
  return `${operation} ${schema}.${revision?names[table]:table}`;
 });
 const functions=[false,true].map(revision=>`CREATE FUNCTION rotate_${revision?'revision':'physical'}() RETURNS bigint LANGUAGE plpgsql AS $rotation$
 DECLARE changed_rows bigint;
 BEGIN
 ${compile(rotation,revision)};
 GET DIAGNOSTICS changed_rows=ROW_COUNT;
 RETURN changed_rows;
 END $rotation$;`).join('\n');
 return `-- Canonical ordinal 8 SHA256 (LF): ${createHash('sha256').update(rotation).digest('hex')}
-- The real UPDATE is extracted above. Fixtures test its predicates, not IAM or the complete publisher.
BEGIN;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='2s'; SET LOCAL timezone='UTC';
DO $target$ BEGIN
 IF current_database()<>'reference_rotation_qa' OR inet_server_addr() IS NULL
  OR inet_server_addr() NOT IN('127.0.0.1'::inet,'::1'::inet)
  OR current_setting('server_version_num')::integer/10000<>${expectedMajor}
 THEN RAISE EXCEPTION 'LOCAL_REFERENCE_ROTATION_QA_REQUIRED'; END IF;
END $target$;
CREATE SCHEMA ${schema};
SET LOCAL search_path=${schema},pg_catalog;
CREATE TABLE data_import_runs(id bigint PRIMARY KEY,source_name text,source_sha256 text,status text);
${tables}
ALTER TABLE source_xref ADD COLUMN qa_case text NOT NULL UNIQUE;
CREATE UNIQUE INDEX source_xref_active_source_uk ON source_xref(source_system,source_entity,source_id) WHERE valid_to IS NULL;
CREATE TABLE grh_employees(import_run_id bigint,company_id bigint,legajo text,person_id bigint);
CREATE TABLE projection_employees(LIKE grh_employees);
CREATE VIEW grh_source_employees_v1 AS SELECT * FROM projection_employees;
CREATE TABLE qa_checks(label text PRIMARY KEY);
CREATE FUNCTION assert_ok(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $assert$
 BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'REFERENCE_ROTATION_QA_FAILED: %',label; END IF;
 INSERT INTO qa_checks VALUES(label); END $assert$;
${functions}
${read('scripts/fixtures/grh-reference-rotation-qa.sql.txt')}
SELECT 'grh_reference_rotation_qa' AS suite,count(*)::int AS passed FROM qa_checks;
ROLLBACK;
DO $rollback$ BEGIN IF to_regnamespace('${schema}') IS NOT NULL THEN RAISE EXCEPTION 'QA_ROLLBACK_FAILED'; END IF; END $rollback$;
SELECT true AS rollback_schema_absent;
`;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const options={};
 for(const arg of process.argv.slice(2)){
  const match=/^--(expected-major|write-sql)=(.+)$/.exec(arg);
  if(!match||Object.hasOwn(options,match[1]))throw Error('Unsupported or duplicate argument');
  options[match[1]]=match[2];
 }
 if(options['expected-major']!==undefined&&!/^(17|18)$/.test(options['expected-major']))throw Error('Unsupported PostgreSQL major');
 const sql=buildGrhReferenceRotationQa({expectedMajor:Number(options['expected-major']??17)});
 if(options['write-sql']){writeFileSync(resolve(options['write-sql']),sql,'utf8');console.log('Synthetic reference rotation SQL generated for PostgreSQL '+(options['expected-major']??17));}
 else process.stdout.write(sql);
}
