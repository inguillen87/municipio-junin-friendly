// Offline generator. A disposable loopback database is required; all SQL rolls back.
// Real 007 authority and 026/031/035/048/051 writers/readers run on synthetic data.
// IAM capability resolution is fixture-backed; this is not certification of real users.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { buildGrhEffectiveSourceQa } from './verify-grh-effective-source-postgres.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>readFileSync(resolve(root,p),'utf8').replaceAll('\r\n','\n');
const migration=name=>read('scripts/migrations/'+name);
function originalFunction(source,name){const start=source.search(new RegExp(`CREATE OR REPLACE FUNCTION (?:public\\.)?${name}\\(`));const open=source.indexOf('$$',start),close=source.indexOf('$$;',open+2);if(start<0||open<start||close<open)throw Error('Missing original function '+name);return source.slice(start,close+3);}
function originalTable(source,name){const start=source.indexOf(`CREATE TABLE IF NOT EXISTS ${name} (`),end=source.indexOf('\n);',start);if(start<0||end<start)throw Error('Missing table '+name);return source.slice(start,end+3);}
export function buildGrhEffectiveConsumersQa({expectedMajor=17}={}){
 const schema='grh_effective_qa_consumers';
 let base=buildGrhEffectiveSourceQa({expectedMajor,schema});
 base=base.slice(0,base.indexOf('-- Synthetic only.'));
 base=base.replaceAll("current_database()<>'effective_source_qa'","current_database()<>'effective_consumers_qa'")
  .replace(`CREATE SCHEMA ${schema}; SET LOCAL search_path=${schema},public,pg_temp;`,"SET LOCAL search_path=public,pg_temp; DO $empty$ BEGIN IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')) THEN RAISE EXCEPTION 'EMPTY_DISPOSABLE_DATABASE_REQUIRED'; END IF; END $empty$;")
  .replaceAll(schema+'.','public.').replaceAll(`search_path=${schema},public,pg_temp`,'search_path=public,pg_temp').replaceAll(`search_path=pg_catalog,${schema},public,pg_temp`,'search_path=pg_catalog,public,pg_temp');
 const canonical=migration('002-canonical-integration.sql');
 base=base.replace('CREATE TABLE person_identity(id uuid PRIMARY KEY);','CREATE TABLE person_identity(id uuid PRIMARY KEY,cuil text,dni text,full_name text,birth_date date,sex_code text);');
 const iam=`
 CREATE TABLE platform_tenant(id uuid PRIMARY KEY,status text);
 CREATE TABLE internal_users(email text PRIMARY KEY,display_name text,active boolean,identity_version integer);
 CREATE TABLE tenant_membership(id uuid PRIMARY KEY,tenant_id uuid,user_email text,role_key text,status text,UNIQUE(id,tenant_id));
 CREATE TABLE tenant_identity_session(id uuid PRIMARY KEY,user_email text,active_tenant_id uuid,session_version integer,identity_version integer,source text,auth_level text,status text,expires_at timestamptz,last_seen_at timestamptz);
 ALTER TABLE tenant_identity_policy ADD COLUMN certified_release_sha text;
 CREATE TABLE tenant_action_authority(membership_id uuid,tenant_id uuid);
 CREATE TABLE tenant_action_employment_link(membership_id uuid,tenant_id uuid,source_binding_id uuid,employment_contract_id uuid,active boolean);
 CREATE TABLE tenant_action_area_scope(id uuid,capability_key text,scope_level text,company_id bigint,organization_unit_source_id text,sector_source_id text,membership_id uuid,tenant_id uuid,source_binding_id uuid,active boolean);
 CREATE TABLE qa_capabilities(membership_id uuid,capability_key text);
 CREATE FUNCTION tenant_iam_assert_no_sod_conflict(uuid) RETURNS void LANGUAGE sql AS 'SELECT NULL::void';
 CREATE FUNCTION tenant_iam_effective_capabilities(mid uuid) RETURNS TABLE(capability_key text) LANGUAGE sql SET search_path=public,pg_temp AS $f$ SELECT c.capability_key FROM qa_capabilities c WHERE c.membership_id=mid $f$;
 CREATE TABLE iam_capability(capability_key text PRIMARY KEY,label text,description text,scope_kind text,sensitivity text);
 CREATE TABLE iam_capability_conflict(capability_key text,conflicts_with_key text,reason text,PRIMARY KEY(capability_key,conflicts_with_key));
 CREATE TABLE iam_role(role_key text PRIMARY KEY,scope_kind text,system_managed boolean);
 CREATE TABLE iam_role_capability(role_key text,capability_key text,PRIMARY KEY(role_key,capability_key));
 INSERT INTO iam_role VALUES('CONSULTA_INTEGRAL','tenant',true),('HUGO_APROBADOR_INTEGRAL','tenant',true),('PLATFORM_OWNER_OPERATIVO_INTEGRAL','tenant',true);
 CREATE TABLE action_case(id uuid PRIMARY KEY,source_batch_id uuid,company_id bigint,organization_unit_source_id text,sector_source_id text,source_binding_id uuid,tenant_id uuid,beneficiary_contract_id uuid);
 ${originalTable(canonical,'source_staging_row')}
 ${originalFunction(canonical,'normalize_digits')}
 ${originalFunction(canonical,'is_valid_cuil')}
 ${originalFunction(migration('007-action-center-read-facades.sql'),'action_center_assert_tenant_read_session_v2')}
 ${originalFunction(migration('007-action-center-read-facades.sql'),'action_center_context_has_capability')}
 `;
 const prerequisites=['026-governed-payroll-novelties.sql','029-payroll-novelty-first-fortnight.sql','032-payroll-type-mapping-fail-closed.sql','031-governed-employee-payroll-history.sql','035-governed-payroll-reprocessing.sql','048-payroll-detail-source.sql','052-payroll-detail-closure-state.sql','051-payroll-document-library.sql'].map(migration).join('\n');
 const sourceHistory=originalFunction(migration('059-action-source-history.sql'),'action_center_case_source_context_v1')+'\nREVOKE ALL ON FUNCTION action_center_case_source_context_v1(uuid,uuid,uuid) FROM PUBLIC;';
 const m097=migration('097-grh-effective-consumers.sql');
 let fixture=read('scripts/fixtures/grh-effective-source-qa.sql.txt').replaceAll('__SCHEMA__','public').replaceAll("'001'","'1'").replaceAll("'002'","'2'")
  .replace('INSERT INTO person_identity SELECT','INSERT INTO person_identity(id) SELECT')
  .replace(/SELECT jsonb_build_object\('version','grh-effective-source-qa.v1'[\s\S]*?FROM qa_checks;/,'');
 // 096 fixtures own the policy insertion and publication; make the added column explicit.
 fixture=fixture.replace('INSERT INTO tenant_identity_policy SELECT','INSERT INTO tenant_identity_policy(tenant_id,certified_source_binding_id,tenant_data_plane_ready) SELECT');
 const tests=read('scripts/fixtures/grh-effective-consumers-qa.sql.txt');
 return `${base}\n${iam}\n${prerequisites}\n${sourceHistory}\n${m097}\n${m097}\n${fixture}\n${tests}
 SELECT jsonb_build_object('version','grh-effective-consumers-qa.v1','passed',count(*),'major',current_setting('server_version_num')::integer/10000,
 'synthetic',true,'actualSessionGuard007',true,'fixtureCapabilityResolver',true,'migration097Sha256','${createHash('sha256').update(m097).digest('hex')}','rollback',true) AS qa_result FROM qa_checks;
 ROLLBACK;
 SELECT to_regclass('public.grh_effective_source_binding') IS NULL AS rollback_tables_absent;
 `;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2);if(args.some(a=>!/^--(?:expected-major=(?:17|18)|write-sql=.+)$/.test(a)))throw Error('Unsupported argument');
 const expectedMajor=Number(args.find(a=>a.startsWith('--expected-major='))?.split('=')[1]??17),target=args.find(a=>a.startsWith('--write-sql='))?.slice(12);
 const sql=buildGrhEffectiveConsumersQa({expectedMajor});if(target){writeFileSync(resolve(target),sql);process.stdout.write('Synthetic consumer SQL generated for PostgreSQL '+expectedMajor+'\n');}else process.stdout.write(sql);
}
