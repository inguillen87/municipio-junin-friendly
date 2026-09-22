// Offline SQL generator. Execution is limited to a disposable loopback PostgreSQL database.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {splitPostgresStatements} from './lib/sql-statements.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const schema='legal_alert_center_100_qa';
const read=file=>readFileSync(resolve(root,file),'utf8').replaceAll('\r\n','\n');
const migration=name=>read('scripts/migrations/'+name);
const section=(source,start,end)=>{
 const from=source.indexOf(start),to=source.indexOf(end,from);
 if(from<0||to<from||source.indexOf(start,from+1)>=0)throw Error('QA source section drift: '+start);
 return source.slice(from,to);
};
const relocate=sql=>sql.replaceAll('public.',schema+'.').replaceAll('SET search_path=pg_catalog,public,pg_temp',`SET search_path=pg_catalog,${schema},public,pg_temp`);
export function buildLegalAlertCenterQa({expectedMajor=17}={}){
 if(![17,18].includes(expectedMajor))throw Error('Expected PostgreSQL major 17 or 18');
 const registry=migration('069-native-legal-registry.sql'),followup=migration('079-native-legal-followups.sql');
 const coordination=migration('081-legal-coordination.sql'),matter=migration('082-legal-matters.sql');
 const contract=migration('086-legal-contracts.sql'),obligation=migration('087-legal-contract-obligations.sql');
 const v1=migration('089-legal-alert-center.sql'),v2=migration('100-legal-alert-center-matters.sql');
 const immutable=splitPostgresStatements(migration('002-canonical-integration.sql')).find(sql=>/CREATE OR REPLACE FUNCTION reject_immutable_source_change\(\)/.test(sql));
 if(!immutable)throw Error('Actual immutable-source guard missing');
 const definitions=[
  immutable+';',
  registry.slice(0,registry.indexOf('CREATE FUNCTION legal_norm_metadata_valid_v1(')),
  followup.slice(0,followup.indexOf('CREATE FUNCTION legal_followup_record_v1(')),
  coordination.slice(0,coordination.indexOf('CREATE FUNCTION public.legal_coordination_v1(')),
  matter.slice(0,matter.indexOf('CREATE FUNCTION public.legal_matter_record_v1(')),
  // The optional case linkage is not exercised; only its referenced key is scaffolded.
  'CREATE TABLE legal_matter_case_link(tenant_id uuid,matter_id uuid,case_id uuid,PRIMARY KEY(tenant_id,matter_id,case_id));',
  section(contract,'CREATE FUNCTION public.legal_contract_counterparties_valid_v1(','CREATE FUNCTION public.legal_contract_validate_payload_v1('),
  section(contract,'CREATE TABLE public.legal_contract (','CREATE FUNCTION public.legal_contract_record_v1('),
  obligation.slice(0,obligation.indexOf('CREATE FUNCTION public.legal_contract_obligation_validate_v1(')),
  v1
 ].map(relocate).join('\n');
 return `-- Migration 100 SHA256 (LF): ${createHash('sha256').update(v2).digest('hex')}
-- Actual 069 context, 081 eligibility, legal DDL/constraints/triggers and 089/100 facades.
-- Synthetic IAM row/capability scaffolding and SoD switch only; this is not full IAM integration QA.
BEGIN;
SET LOCAL statement_timeout='60s'; SET LOCAL lock_timeout='2s'; SET LOCAL timezone='UTC';
DO $target$ BEGIN
 IF current_database()<>'legal_alert_center_qa' OR inet_server_addr() IS NULL
  OR inet_server_addr() NOT IN('127.0.0.1'::inet,'::1'::inet)
  OR current_setting('server_version_num')::integer/10000<>${expectedMajor}
 THEN RAISE EXCEPTION 'LOCAL_LEGAL_ALERT_QA_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='municontrol_actions_runtime_app') THEN
  CREATE ROLE municontrol_actions_runtime_app NOLOGIN;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='municontrol_actions_runtime_app' AND (rolsuper OR rolbypassrls))
 THEN RAISE EXCEPTION 'QA_RUNTIME_ROLE_UNSAFE'; END IF;
END $target$;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
CREATE SCHEMA ${schema};
SET LOCAL search_path=${schema},public,pg_catalog;
CREATE TABLE platform_tenant(id uuid PRIMARY KEY,status text);
CREATE TABLE internal_users(email text PRIMARY KEY,active boolean,auth_mode text,identity_version integer);
CREATE TABLE tenant_membership(id uuid PRIMARY KEY,tenant_id uuid,user_email text,status text,UNIQUE(id,tenant_id));
CREATE TABLE tenant_identity_session(id uuid PRIMARY KEY,user_email text,active_tenant_id uuid,session_version integer,identity_version integer,source text,auth_level text,status text,expires_at timestamptz,last_seen_at timestamptz);
CREATE TABLE capabilities(membership_id uuid,capability_key text);
CREATE TABLE sod_blocked(membership_id uuid PRIMARY KEY);
CREATE FUNCTION tenant_iam_assert_no_sod_conflict(m uuid) RETURNS void LANGUAGE plpgsql AS $sod$
 BEGIN IF EXISTS(SELECT 1 FROM sod_blocked WHERE membership_id=m) THEN RAISE EXCEPTION 'IAM_SOD_CONFLICT';END IF;END $sod$;
CREATE FUNCTION tenant_iam_effective_capabilities(m uuid) RETURNS TABLE(capability_key text)
 LANGUAGE sql STABLE SET search_path=pg_catalog,${schema},pg_temp AS $caps$
 SELECT c.capability_key FROM capabilities c WHERE c.membership_id=m $caps$;
${definitions}
REVOKE ALL ON ALL TABLES IN SCHEMA ${schema} FROM PUBLIC,municontrol_actions_runtime_app;
REVOKE ALL ON FUNCTION legal_norm_context_v1(jsonb,boolean),legal_coordination_member_v1(uuid,uuid) FROM PUBLIC,municontrol_actions_runtime_app;
CREATE TABLE qa_original_functions AS
 SELECT p.oid,p.prosrc,p.proacl,p.proowner FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='${schema}';
${relocate(v2)}
GRANT USAGE ON SCHEMA ${schema} TO municontrol_actions_runtime_app;
CREATE TABLE qa_checks(label text PRIMARY KEY);
CREATE FUNCTION qa_assert(v boolean,label text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,${schema},pg_temp AS $assert$
 BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'ALERT_QA_FAILED: %',label; END IF;
 INSERT INTO qa_checks VALUES(label);END $assert$;
CREATE FUNCTION qa_rejects(c jsonb,wanted text) RETURNS boolean LANGUAGE plpgsql AS $reject$
 BEGIN PERFORM legal_alert_center_v2(c);RETURN false;
 EXCEPTION WHEN OTHERS THEN IF SQLERRM=wanted THEN RETURN true;END IF;RAISE;END $reject$;
CREATE FUNCTION qa_sql_rejects(statement text,wanted_state text) RETURNS boolean LANGUAGE plpgsql AS $reject$
 BEGIN EXECUTE statement;RETURN false;
 EXCEPTION WHEN OTHERS THEN IF SQLSTATE=wanted_state THEN RETURN true;END IF;RAISE;END $reject$;
CREATE FUNCTION qa_id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $id$
 SELECT ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $id$;
CREATE FUNCTION qa_context(n integer) RETURNS jsonb LANGUAGE sql STABLE AS $ctx$
 SELECT jsonb_build_object('actorEmail',m.user_email,'actorSessionId',s.id,'actorSessionVersion',1,'membershipId',m.id,'tenantId',m.tenant_id)
 FROM tenant_membership m JOIN tenant_identity_session s ON s.user_email=m.user_email WHERE m.id=qa_id(n) $ctx$;
CREATE FUNCTION qa_source_state() RETURNS jsonb LANGUAGE plpgsql AS $state$
 DECLARE name text;value text;result jsonb:='{}';BEGIN
 FOREACH name IN ARRAY ARRAY['legal_norm','legal_norm_document','legal_norm_revision','legal_followup','legal_followup_event','legal_coordination_event','legal_matter','legal_matter_event','legal_contract','legal_contract_revision','legal_contract_obligation','legal_contract_obligation_event'] LOOP
 EXECUTE format('SELECT md5(coalesce(string_agg(row::text,'''' ORDER BY row::text),'''')) FROM (SELECT to_jsonb(t) AS row FROM %I t) q',name) INTO value;
 result:=result||jsonb_build_object(name,value);END LOOP;RETURN result;END $state$;
${read('scripts/fixtures/legal-alert-center-100-qa.sql.txt')}
DO $coverage$ BEGIN IF (SELECT count(*) FROM qa_checks)<>81 THEN RAISE EXCEPTION 'QA_COVERAGE_INCOMPLETE';END IF;END $coverage$;
SELECT 'legal_alert_center_v2' AS suite,count(*)::integer AS passed FROM qa_checks;
ROLLBACK;
DO $rollback$ BEGIN IF to_regnamespace('${schema}') IS NOT NULL THEN RAISE EXCEPTION 'QA_ROLLBACK_FAILED';END IF;END $rollback$;
SELECT true AS rollback_schema_absent;
`;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const options={};for(const arg of process.argv.slice(2)){
  const match=/^--(expected-major|write-sql)=(.+)$/.exec(arg);
  if(!match||Object.hasOwn(options,match[1]))throw Error('Unknown or duplicate argument');options[match[1]]=match[2];
 }
 if(options['expected-major']!==undefined&&!/^(17|18)$/.test(options['expected-major']))throw Error('Expected PostgreSQL major 17 or 18');
 const sql=buildLegalAlertCenterQa({expectedMajor:Number(options['expected-major']??17)});
 if(options['write-sql']){writeFileSync(resolve(options['write-sql']),sql);console.log('Legal alert SQL generated for PostgreSQL '+(options['expected-major']??17));}
 else process.stdout.write(sql);
}
