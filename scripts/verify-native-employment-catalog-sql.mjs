// Offline generator: disposable PG17/18 only, real 007/067/095/099/103 functions.
// All synthetic identities, catalog versions and registrations are rolled back.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildNativeJurisdictionQa} from './verify-native-jurisdiction-sql.mjs';
import {splitPostgresStatements} from './lib/sql-statements.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const q=x=>"'"+String(x).replaceAll("'","''")+"'";
const j=x=>q(JSON.stringify(x))+'::jsonb';
const sha=x=>createHash('sha256').update(x).digest('hex');
const read=f=>fs.readFileSync(path.join(root,'scripts/migrations',f),'utf8').replaceAll('\r\n','\n');
export function buildNativeEmploymentCatalogQa({serverMajor,requireConcurrency=false}){
 const base=buildNativeJurisdictionQa({serverMajor,requireConcurrency}),{schema,ids}=base;
 const migration=read('103-native-employment-catalog.sql'),source099=read('099-grh-curated-consumers.sql');
 const relocate=s=>s.replaceAll('public.',schema+'.').replaceAll(schema+'.digest(','public.digest(')
  .replaceAll("'public'::regnamespace",q(schema)+'::regnamespace')
  .replaceAll("ARRAY['search_path=public, pg_temp']","ARRAY['search_path=pg_catalog, "+schema+", public, pg_temp']")
  .replaceAll("ARRAY['search_path=pg_catalog, public, pg_temp']","ARRAY['search_path=pg_catalog, "+schema+", public, pg_temp']")
  .replaceAll("'search_path=public, pg_temp'",q('search_path=pg_catalog, '+schema+', public, pg_temp'))
  .replaceAll("'search_path=pg_catalog, public, pg_temp'",q('search_path=pg_catalog, '+schema+', public, pg_temp'))
  .replace(/SET search_path\s*=\s*(?:pg_catalog,\s*)?public,\s*pg_temp/gi,'SET search_path=pg_catalog,'+schema+',public,pg_temp');
 const normalized=s=>s.replaceAll("replace(p.prosrc,E'\\r\\n',E'\\n')","replace(replace(p.prosrc,E'\\r\\n',E'\\n'),"+q(schema+'.')+",'public'||'.')")
  .replaceAll("replace(prosrc,E'\\r\\n',E'\\n')","replace(replace(prosrc,E'\\r\\n',E'\\n'),"+q(schema+'.')+",'public'||'.')")
  .replaceAll("replace(current_body,E'\\r\\n',E'\\n')","replace(replace(current_body,E'\\r\\n',E'\\n'),"+q(schema+'.')+",'public'||'.')");
 const install=q(normalized(relocate(migration)));
 const patches=[8,9].map(n=>{const s=new RegExp('DO \\$curated_'+n+'\\$[\\s\\S]+?END \\$curated_'+n+'\\$;').exec(source099)?.[0];assert.ok(s);return normalized(relocate(s)).replace("encode("+schema+".digest(current_body,'sha256')","encode(public.digest(replace(current_body,"+q(schema+'.')+",'public'||'.'),'sha256')");});
 const readLock=splitPostgresStatements(source099).find(s=>s.includes('CREATE OR REPLACE FUNCTION public.grh_curated_source_read_lock_v1()'));assert.ok(readLock);
 const observed=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/native-employee-catalog-installed-099.json'),'utf8'));
 assert.equal(sha(observed.beforeBody),observed.beforeSha256);assert.equal(sha(observed.body),observed.sha256);assert.ok(source099.includes(observed.beforeSha256)&&source099.includes(observed.sha256));
 const catalogLock='hashtextextended('+q('native-employment-catalog:v1:'+ids.blockedTenant+':'+ids.blockedBinding)+',0)';
 const finishLock='hashtextextended('+q('native-employment-catalog:qa-finished:'+randomUUID())+',0)';
 const statements=[];let checks=0;const exec=s=>statements.push(s);
 const ok=(expr,label)=>{exec('PERFORM qa_assert(('+expr+'),'+q(label)+'); checks:=checks+1;');checks++;};
 const reject=(sql,error,label)=>ok('qa_rejects('+sql+','+q(error.startsWith('NATIVE_')||error.startsWith('ACTION_')?error:'NATIVE_EMPLOYMENT_CATALOG_'+error)+')',label);
 const call=(op,actor='maker',tail='')=>'native_employment_catalog_'+op+'_v1('+actor+(tail?','+tail:'')+')';
 const rejectCall=(op,actor,payload,key,error,label)=>reject('format('+q('SELECT '+call(op,'%1$L::jsonb','%2$L::jsonb,%3$L::uuid'))+','+[actor,payload,key].join(',')+')',error,label);
 const fault=(mutation,body)=>exec("BEGIN "+mutation+' '+body+" RAISE EXCEPTION USING ERRCODE='P1032',MESSAGE='RESTORE_CATALOG_FAULT'; EXCEPTION WHEN SQLSTATE 'P1032' THEN NULL; END;");
 const fingerprint="(SELECT md5(jsonb_agg(to_jsonb(c) ORDER BY id)::text) FROM employment_contract c)";
 exec(`
 CREATE VIEW grh_source_employees_v1 AS SELECT * FROM grh_employees;
 CREATE VIEW grh_source_catalog_rows_v1 AS SELECT * FROM grh_catalog_rows;
 CREATE VIEW grh_effective_source_batch_v1 AS SELECT * FROM source_import_batch;
 CREATE TABLE grh_absences(id integer); CREATE TABLE grh_leaves(id integer); CREATE TABLE grh_family(id integer); CREATE TABLE source_staging_row(id integer);
 CREATE TABLE grh_curated_source_version(id integer); CREATE TABLE grh_curated_source_delta(id integer); CREATE TABLE grh_curated_source_version_seal(id integer); CREATE TABLE grh_effective_source_binding(id integer);
 ${relocate(readLock)};
 REVOKE ALL ON FUNCTION grh_curated_source_read_lock_v1() FROM PUBLIC,municontrol_actions_runtime_app;
 CREATE OR REPLACE FUNCTION native_employee_catalog_v1(ctx jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,${schema},public,pg_temp AS $observed$${observed.beforeBody}$observed$;
 ${patches.join('\n')}
 ALTER TABLE iam_role ADD PRIMARY KEY(role_key); ALTER TABLE iam_role_capability ADD PRIMARY KEY(role_key,capability_key);
 INSERT INTO iam_role VALUES('CATALOG_MAKER_QA','tenant'),('CATALOG_REVIEWER_QA','tenant'),('CATALOG_PLATFORM_QA','platform');
 INSERT INTO iam_role_capability VALUES('CATALOG_MAKER_QA','employee.record.propose'),('CATALOG_REVIEWER_QA','employee.record.approve'),('CATALOG_PLATFORM_QA','employee.record.propose');
 old_contracts:=${fingerprint}; old_receipt:=native_employee_attempt_v1(maker,native_key);
 EXECUTE ${install};
 INSERT INTO capabilities VALUES(${q(ids.maker)},'employee.catalog.propose'),(${q(ids.checker)},'employee.catalog.approve'),(${q(ids.samePerson)},'employee.catalog.approve'),(${q(ids.unlinked)},'employee.catalog.propose'),(${q(ids.unlinked)},'employee.catalog.approve'),(${q(ids.outsider)},'employee.catalog.propose'),(${q(ids.blocked)},'employee.catalog.propose');
 boot:=${call('bootstrap')}; initial_catalog:=boot->'catalog'; items_value:=initial_catalog->'items';
 proposal_body:=jsonb_build_object('baseVersion',initial_catalog->>'version','scopeVersion',boot->>'scopeVersion','reason','Actualizar el catálogo municipal','items',items_value);
 `);
 ok("boot->>'version'='native-employment-catalog.v1' AND initial_catalog->>'origin'='GRH' AND initial_catalog->>'revision'='0' AND initial_catalog->'publishedAt'='null'::jsonb",'explicit GRH fallback before first publication');
 ok("initial_catalog-'origin'-'revision'-'publishedAt'=native_employment_catalog_grh_v1(native_employee_context_v1(maker))",'fallback preserves original099 items and version exactly');
 ok("boot#>>'{permissions,canPropose}'='true' AND boot#>>'{permissions,canReview}'='false' AND boot->>'scopeVersion'~'^[a-f0-9]{64}$'",'permissions require dedicated caps and expose an opaque scoped draft token');
 ok(call('bootstrap','unlinked')+"#>>'{permissions,canPropose}'='false' AND "+call('bootstrap','unlinked')+"#>>'{permissions,canReview}'='false'",'unlinked actor cannot prepare or review despite capabilities');
 ok("(SELECT count(*)=2 FROM iam_role_capability WHERE capability_key LIKE 'employee.catalog.%') AND EXISTS(SELECT 1 FROM iam_capability_conflict WHERE capability_key='employee.catalog.approve' AND conflicts_with_key='employee.catalog.propose')",'only corresponding tenant roles receive dedicated separated catalog capabilities');
 rejectCall('propose','reader','proposal_body','gen_random_uuid()','FORBIDDEN','old workforce/read or registration capabilities cannot prepare a catalog');
 rejectCall('propose','unlinked','proposal_body','gen_random_uuid()','EMPLOYMENT_REQUIRED','unlinked actor cannot prepare');
 rejectCall('propose','maker',"proposal_body||jsonb_build_object('scopeVersion',repeat('a',64))",'gen_random_uuid()','SCOPE_CHANGED','stale membership/binding draft is rejected before insertion');
 rejectCall('propose','maker','proposal_body',"'00000000-0000-1000-8000-000000000000'::uuid",'INPUT_INVALID','command key must be UUIDv4');
 if(requireConcurrency){
  rejectCall('propose','blocked','proposal_body','gen_random_uuid()','BUSY','second connection holds exact catalog publication lock');
  reject('format('+q('SELECT native_employee_create_v1(%L::jsonb,%L::jsonb,%L,%L::uuid)')+',blocked,legacy_draft,catalog_version,gen_random_uuid())','BUSY','native creation shares the publication lock and cannot race past activation');
 }
 exec('receipt_propose:='+call('propose','maker','proposal_body,proposal_key')+';');
 ok("receipt_propose->>'status'='pending' AND receipt_propose->>'operation'='propose' AND receipt_propose->>'replayed'='false' AND receipt_propose->>'catalogVersion'=initial_catalog->>'version'",'preparation has an immutable pending receipt and does not publish');
 ok("(SELECT actor_session_version=(maker->>'actorSessionVersion')::integer AND release_sha=maker->>'releaseSha' FROM native_employment_catalog_proposal WHERE id=(receipt_propose->>'proposalId')::uuid)",'preparation records authenticated session version and certified release');
 ok(call('bootstrap')+"->'catalog'=initial_catalog",'preparation leaves the effective catalog unchanged');
 ok(call('propose','maker','proposal_body,proposal_key')+"-'replayed'=receipt_propose-'replayed' AND "+call('attempt','maker','proposal_key')+"->>'replayed'='true'",'exact request and lost acknowledgement return the original receipt');
 rejectCall('propose','maker',"proposal_body||'{\"reason\":\"Una razón diferente para esta clave\"}'::jsonb",'proposal_key','IDEMPOTENCY_REUSE','same key cannot acquire different normalized content');
 exec('detail:='+call('proposal','checker',"(receipt_propose->>'proposalId')::uuid")+';');
 ok("detail#>>'{proposal,canReview}'='true' AND jsonb_array_length(detail#>'{proposal,items}')=4 AND detail#>'{proposal,baseItems}'=initial_catalog->'items'",'independent reviewer receives exact base and proposed items');
 ok(call('proposal','same_person',"(receipt_propose->>'proposalId')::uuid")+"#>>'{proposal,canReview}'='false'",'second membership/email linked to preparer person cannot review');
 reject('format('+q('SELECT '+call('proposal','%1$L::jsonb','%2$L::uuid'))+",outsider,receipt_propose->>'proposalId')",'NOT_FOUND','foreign tenant cannot inspect proposal');
 exec("review_body:=jsonb_build_object('proposalId',receipt_propose->>'proposalId','decision','approve','reason','Revisión independiente confirmada','scopeVersion',"+call('bootstrap','checker')+"->>'scopeVersion');");
 rejectCall('review','same_person',"review_body||jsonb_build_object('scopeVersion',"+call('bootstrap','same_person')+"->>'scopeVersion')",'gen_random_uuid()','MAKER_CHECKER_REQUIRED','same canonical person cannot approve using another login');
 exec("INSERT INTO capabilities VALUES("+q(ids.maker)+",'employee.catalog.approve');");
 rejectCall('review','maker',"review_body||jsonb_build_object('scopeVersion',boot->>'scopeVersion')",'gen_random_uuid()','MAKER_CHECKER_REQUIRED','same membership and email cannot approve even with fixture capabilities');
 exec("DELETE FROM capabilities WHERE membership_id="+q(ids.maker)+"::uuid AND capability_key='employee.catalog.approve'; receipt_review:="+call('review','checker','review_body,review_key')+'; catalog_current:='+call('bootstrap')+"->'catalog';");
 ok("receipt_review->>'status'='approved' AND receipt_review->>'revision'='1' AND catalog_current->>'origin'='MUNICONTROL' AND catalog_current->>'version'=receipt_review->>'catalogVersion' AND catalog_current->'publishedAt'<>'null'::jsonb",'approval atomically publishes the own catalog with registered timestamp');
 ok("(SELECT r.actor_session_version=(checker->>'actorSessionVersion')::integer AND r.release_sha=checker->>'releaseSha' FROM native_employment_catalog_review r WHERE r.proposal_id=(receipt_propose->>'proposalId')::uuid)",'publication records independent reviewer session version and release');
 ok("catalog_current->>'version'<>initial_catalog->>'version' AND catalog_current->'items'=native_employment_catalog_items_v1(items_value)",'same catalog content has distinct municipal provenance and deterministic keys');
 ok(fingerprint+'=old_contracts AND native_employee_attempt_v1(maker,native_key)=old_receipt','publication preserves existing contracts, labels and historical hire receipts');
 ok(call('propose','maker','proposal_body,proposal_key')+"-'replayed'=receipt_propose-'replayed' AND "+call('review','checker','review_body,review_key')+"-'replayed'=receipt_review-'replayed'",'both command receipts remain original after publication and base change');
 rejectCall('propose','maker','proposal_body','gen_random_uuid()','BASE_CHANGED','new proposal cannot use the former GRH base');
 rejectCall('review','checker','review_body','gen_random_uuid()','DECIDED','another command cannot decide a proposal twice');
 reject('format('+q('SELECT '+call('attempt','%1$L::jsonb','%2$L::uuid'))+',maker,review_key)','NOT_FOUND','another actor key does not grant access to its receipt');
 // New registrations keep the existing draft/receipt protocol and snapshot labels.
 exec("new_draft:=legacy_draft||'{\"dni\":\"99000031\",\"cuil\":\"20990000310\",\"legajo\":\"19031\",\"fullName\":\"Alta catálogo sintética\",\"jurisdictionCode\":\"42\"}'::jsonb;");
 reject('format('+q('SELECT native_employee_create_v1(%L::jsonb,%L::jsonb,%L,%L::uuid)')+',maker,new_draft,initial_catalog->>\'version\',hire_key)','NATIVE_EMPLOYEE_CATALOG_CHANGED','stale hire selector is rejected after publication');
 exec("new_receipt:=native_employee_create_v1(maker,new_draft,catalog_current->>'version',hire_key);");
 ok("new_receipt->>'jurisdictionCode'='42' AND (SELECT catalog_sha256=catalog_current->>'version' FROM native_employee_registration WHERE contract_id=(new_receipt->>'contractId')::uuid)",'real095 writer records municipal version hash while preserving native origin and jurisdiction');
 // Rejection and another publication, preserving prior acknowledgements.
 exec("proposal_body:=proposal_body||jsonb_build_object('baseVersion',catalog_current->>'version'); second_receipt:="+call('propose','maker','proposal_body,gen_random_uuid()')+"; review_body:=review_body||jsonb_build_object('proposalId',second_receipt->>'proposalId','decision','reject'); second_review:="+call('review','checker','review_body,gen_random_uuid()')+';');
 ok(call('bootstrap')+"->'catalog'=catalog_current AND second_review->>'status'='rejected' AND second_review->>'revision'='1'",'rejection leaves the effective municipal version unchanged');
 exec("second_receipt:="+call('propose','maker','proposal_body,gen_random_uuid()')+"; stale_receipt:="+call('propose','maker','proposal_body,gen_random_uuid()')+"; review_body:=review_body||jsonb_build_object('proposalId',second_receipt->>'proposalId','decision','approve'); second_review:="+call('review','checker','review_body,gen_random_uuid()')+';');
 ok("second_review->>'revision'='2' AND "+call('attempt','checker','review_key')+"-'replayed'=receipt_review-'replayed'",'later publication cannot rewrite an earlier review receipt');
 rejectCall('review','checker',"review_body||jsonb_build_object('proposalId',stale_receipt->>'proposalId')",'gen_random_uuid()','BASE_CHANGED','concurrent proposals sharing a base cannot both publish');
 exec('second_review:='+call('review','checker',"review_body||jsonb_build_object('proposalId',stale_receipt->>'proposalId','decision','reject'),gen_random_uuid()")+';');
 ok("second_review->>'status'='rejected' AND second_review->>'revision'='2'",'stale pending proposal remains rejectable');
 ok("native_employee_create_v1(maker,new_draft,catalog_current->>'version',hire_key)-'replayed'=new_receipt-'replayed'",'hire acknowledgement replays before stale catalog validation');
 for(const [mutation,actor,op,key,error,label]of [
  [`UPDATE tenant_identity_session SET status='revoked' WHERE id=${q(ids.makerSession)}::uuid;`,'maker','attempt','proposal_key','ACTION_SESSION_INVALID','revoked session cannot recover proposal'],
  [`DELETE FROM capabilities WHERE membership_id=${q(ids.maker)}::uuid AND capability_key='employee.catalog.propose';`,'maker','attempt','proposal_key','FORBIDDEN','revoked dedicated capability blocks attempt recovery'],
  [`UPDATE platform_tenant_source_binding SET verified=false WHERE id=${q(ids.binding)}::uuid;`,'maker','attempt','proposal_key','ACTION_SOURCE_BINDING_REQUIRED','binding revocation blocks read and recovery'],
  [`UPDATE tenant_action_employment_link SET active=false WHERE membership_id=${q(ids.maker)}::uuid;`,'maker','attempt','proposal_key','FORBIDDEN','unlinked identity cannot acquire a prior actor receipt']]){
  const start=statements.length;reject('format('+q('SELECT '+call(op,'%1$L::jsonb','%2$L::uuid'))+','+actor+','+key+')',error,label);fault(mutation,statements.splice(start).join('\n'));
 }
 const badItems=[null,{},[],[{kind:'agreements',code:'1',label:'A',key:'a',agreementCode:null}],
  'extra','duplicate','missingAgreement','wrongAgreementType','forbiddenAgreement','blankLabel','htmlLabel','controlLabel','longLabel','wrongCode','nullCode','wrongNull','tooMany'];
 for(const bad of badItems){
  let expression=j(bad);if(typeof bad==='string')expression=({extra:"jsonb_set(items_value,'{0,extra}','true')",duplicate:"items_value||(items_value->0)",missingAgreement:"jsonb_set(items_value,'{1,agreementCode}','\"123456789\"')",wrongAgreementType:"jsonb_set(items_value,'{1,agreementCode}','1')",forbiddenAgreement:"jsonb_set(items_value,'{0,code}','\"9\"')",blankLabel:"jsonb_set(items_value,'{0,label}','\" \"')",htmlLabel:"jsonb_set(items_value,'{0,label}','\"<x>\"')",controlLabel:"jsonb_set(items_value,'{0,label}',to_jsonb(E'bad\\nlabel'::text))",longLabel:"jsonb_set(items_value,'{0,label}',to_jsonb(repeat('x',161)))",wrongCode:"jsonb_set(items_value,'{0,code}','\"one\"')",nullCode:"jsonb_set(items_value,'{0,code}','null')",wrongNull:"jsonb_set(items_value,'{0,agreementCode}','\"1\"')",tooMany:"(SELECT jsonb_agg(items_value->0) FROM generate_series(1,1501))"})[bad];
  reject('format('+q('SELECT native_employment_catalog_items_v1(%L::jsonb)')+','+expression+')','INPUT_INVALID','invalid complete catalog rejected: '+JSON.stringify(bad));
 }
 ok("jsonb_array_length(native_employment_catalog_items_v1(items_value||coalesce((SELECT jsonb_agg(jsonb_build_object('kind','sectors','code',g.n::text,'label','Sector QA','key','s'||g.n,'agreementCode',NULL)) FROM generate_series(100,1595)g(n)),'[]')))=1500",'exact1500 item boundary is accepted');
 exec('GRANT USAGE ON SCHEMA '+schema+' TO municontrol_actions_runtime_app; SET LOCAL ROLE municontrol_actions_runtime_app; boot:='+call('bootstrap','reader')+'; RESET ROLE;');
 ok("boot#>>'{permissions,canPropose}'='false' AND boot->'catalog'->>'origin'='MUNICONTROL'",'actual runtime role can read through authenticated facade');
 for(const table of ['native_employment_catalog_proposal','native_employment_catalog_review']){
  ok("NOT has_table_privilege('municontrol_actions_runtime_app',"+q(schema+'.'+table)+",'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AND (SELECT relrowsecurity AND NOT relforcerowsecurity FROM pg_class WHERE oid="+q(schema+'.'+table)+"::regclass)",'runtime direct access blocked and RLS enabled: '+table);
  reject(q('UPDATE '+table+' SET reason=reason'),'IMMUTABLE','owner cannot edit history: '+table);
  reject(q('DELETE FROM '+table),'IMMUTABLE','owner cannot erase history: '+table);
  reject(q('TRUNCATE '+table+' CASCADE'),'IMMUTABLE','owner cannot truncate history: '+table);
 }
 ok("NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.pronamespace="+q(schema)+"::regnamespace AND p.proname LIKE 'native_employment_catalog_%' AND a.grantee=0)",'PUBLIC cannot call any catalog helper or facade');
 ok("(SELECT count(*)=5 FROM pg_proc p WHERE p.pronamespace="+q(schema)+"::regnamespace AND p.proname LIKE 'native_employment_catalog_%' AND has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE'))",'only five exact catalog facades are runtime-executable');
 exec(`installed_functions:=(SELECT md5(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,'')||p.proowner::text,E'\n' ORDER BY p.oid)) FROM pg_proc p WHERE p.pronamespace=${q(schema)}::regnamespace); EXECUTE ${install};`);
 ok(`installed_functions=(SELECT md5(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,'')||p.proowner::text,E'\n' ORDER BY p.oid)) FROM pg_proc p WHERE p.pronamespace=${q(schema)}::regnamespace)`,'103 reapplication preserves every installed definition, OID, owner and ACL');
 for(const name of ['native_employee_catalog_v1','native_employee_create_v1','native_employment_catalog_scope_v1','native_employment_catalog_grh_v1','native_employment_catalog_propose_v1']){
  const start=statements.length;reject(install,'NATIVE_EMPLOYMENT_CATALOG_PREREQUISITE','103 rejects exact function-body drift: '+name);
  fault('SELECT pg_get_functiondef(oid) INTO damaged FROM pg_proc WHERE pronamespace='+q(schema)+'::regnamespace AND proname='+q(name)+"; EXECUTE replace(damaged,'AS $function$',E'AS $function$\\n-- unauthorized QA drift\\n');",statements.splice(start).join('\n'));
 }
 for(const [mutation,label]of [
  ['DROP TRIGGER native_employment_catalog_proposal_immutable ON native_employment_catalog_proposal;','missing immutability trigger'],
  ['ALTER TABLE native_employment_catalog_review DISABLE TRIGGER native_employment_catalog_review_immutable;','disabled review trigger'],
  ['ALTER TABLE native_employment_catalog_proposal DROP CONSTRAINT native_employment_catalog_proposal_reason_check; ALTER TABLE native_employment_catalog_proposal ADD CONSTRAINT native_employment_catalog_proposal_reason_check CHECK(true);','same-name changed constraint'],
  ["DROP INDEX native_employment_catalog_publication_revision; CREATE UNIQUE INDEX native_employment_catalog_publication_revision ON native_employment_catalog_review(tenant_id,source_binding_id,revision) WHERE decision='reject';",'same-name changed publication index predicate'],
  ['ALTER TABLE native_employment_catalog_review ALTER COLUMN release_sha DROP NOT NULL;','nullable audit provenance'],
  ["ALTER TABLE native_employment_catalog_proposal ALTER COLUMN reason SET DEFAULT 'Invented default';",'invented field default'],
  ['ALTER TABLE native_employment_catalog_proposal DISABLE ROW LEVEL SECURITY;','disabled RLS'],
  ['CREATE POLICY unexpected_read ON native_employment_catalog_proposal USING(true);','unexpected RLS policy'],
  ['GRANT SELECT ON native_employment_catalog_review TO municontrol_actions_runtime_app;','runtime direct grant'],
  ['GRANT EXECUTE ON FUNCTION native_employment_catalog_scope_v1(jsonb) TO PUBLIC;','PUBLIC helper execution'],
  ['ALTER FUNCTION native_employee_catalog_v1(jsonb) RESET ALL;','NULL search_path on historical facade'],
  ['ALTER FUNCTION native_employment_catalog_scope_v1(jsonb) STRICT;','function strictness with unchanged body'],
  ["CREATE FUNCTION native_employment_catalog_scope_v1(text) RETURNS text LANGUAGE sql AS 'SELECT $1';",'unexpected overload'],
  ["UPDATE iam_capability SET sensitivity='standard' WHERE capability_key='employee.catalog.approve';",'changed dedicated capability metadata'],
  ["DELETE FROM iam_capability_conflict WHERE capability_key='employee.catalog.approve';",'missing separation rule'],
  ["INSERT INTO iam_role_capability VALUES('CATALOG_PLATFORM_QA','employee.catalog.propose');",'catalog grant expanded to platform role'],
 ]){const start=statements.length;reject(install,'NATIVE_EMPLOYMENT_CATALOG_PREREQUISITE','reapplication rejects '+label);fault(mutation,statements.splice(start).join('\n'));}
 {const start=statements.length;ok(call('bootstrap')+"#>>'{catalog,origin}'='MUNICONTROL' AND "+call('bootstrap')+"#>>'{catalog,revision}'='2'",'published own catalog never silently falls back when GRH options change');fault('DELETE FROM grh_catalog_rows;',statements.splice(start).join('\n'));}
 exec("proposal_body:=proposal_body||jsonb_build_object('baseVersion',"+call('bootstrap')+"#>>'{catalog,version}'); FOR n IN 1..18 LOOP PERFORM "+call('propose','maker',"proposal_body||jsonb_build_object('reason','Historial sintético '||n),gen_random_uuid()")+'; END LOOP; boot:='+call('bootstrap')+';');
 ok("boot->>'historyTruncated'='true' AND jsonb_array_length(boot->'proposals')=20",'history returns exactly20 recent proposals and explicitly reports truncation');
 ok("(SELECT count(*) FROM source_import_batch)=batches_before AND native_employee_attempt_v1(maker,native_key)=old_receipt",'catalog lifecycle does not create GRH batches or mutate historical hire receipt');
 // Metadata only, captured inside the rollback fixture for installer review.
 exec(`PERFORM set_config('mc.catalog_qa_metadata',(SELECT jsonb_agg(jsonb_build_object('name',p.proname,'arguments',pg_get_function_arguments(p.oid),'result',pg_get_function_result(p.oid)) ORDER BY p.proname)::text FROM pg_proc p WHERE p.pronamespace=${q(schema)}::regnamespace AND p.proname LIKE 'native_employment_catalog_%'),true);`);
 const block=`DECLARE boot jsonb; initial_catalog jsonb; catalog_current jsonb; items_value jsonb; proposal_body jsonb; review_body jsonb; receipt_propose jsonb; receipt_review jsonb;
 second_receipt jsonb; second_review jsonb; stale_receipt jsonb; detail jsonb; new_draft jsonb; new_receipt jsonb; old_receipt jsonb; old_contracts text; installed_functions text; damaged text; n integer;
 proposal_key uuid:=gen_random_uuid(); review_key uuid:=gen_random_uuid(); hire_key uuid:=gen_random_uuid();
 BEGIN BEGIN ${statements.join('\n')}
 RAISE EXCEPTION USING ERRCODE='P1031',MESSAGE='RESTORE_CATALOG_FIXTURES'; EXCEPTION WHEN SQLSTATE 'P1031' THEN NULL; END; END;`;
 const anchor="RAISE EXCEPTION USING ERRCODE='P0951',MESSAGE='RESTORE_DECLARED_JURISDICTION_FIXTURES';";assert.equal(base.sql.split(anchor).length,2);
 const report={...base.report,catalogChecksPassed:checks,checksPassed:base.report.checksPassed+checks,migration103Sha256:sha(migration),catalogConcurrentLockChecked:requireConcurrency,
  limitations:[...base.report.limitations,'103 uses real099 catalog/native-writer patches and real007 authority with synthetic source views and IAM capability/SoD fixtures. Simultaneous second-connection lock contention is checked; sequential competing-base publication and replay are not claimed to be committed simultaneous writers.']};
 let sql=base.sql.replace(anchor,()=>block+'\n'+anchor).replaceAll("current_database()<>'fixed_novelties_qa'","current_database()<>'native_employment_catalog_qa'")
  .replace("SET LOCAL statement_timeout='90s'","SET LOCAL statement_timeout='180s'")
  .replace('checks<>'+base.report.checksPassed,'checks<>'+report.checksPassed).replace(j(base.report),()=>j(report));
 if(requireConcurrency)sql=sql.replace(" PERFORM set_config('mc.fixed_novelties_qa_report'"," PERFORM pg_advisory_xact_lock("+finishLock+"); DECLARE deadline timestamptz:=clock_timestamp()+interval '10 seconds'; BEGIN LOOP EXIT WHEN pg_try_advisory_xact_lock("+catalogLock+"); IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'CATALOG_QA_BLOCKER_RELEASE_TIMEOUT'; END IF; PERFORM pg_sleep(0.05); END LOOP; END;\n PERFORM set_config('mc.fixed_novelties_qa_report'");
 const lockSql=base.lockSql.replaceAll("current_database()<>'fixed_novelties_qa'","current_database()<>'native_employment_catalog_qa'")
  .replace(" SELECT 'FIXED_NOVELTIES_QA_LOCK_READY'"," SELECT pg_advisory_xact_lock("+catalogLock+");\n SELECT 'FIXED_NOVELTIES_QA_LOCK_READY'")
  .replace(' SELECT pg_sleep(45);'," DO $hold$ DECLARE deadline timestamptz:=clock_timestamp()+interval '210 seconds'; BEGIN LOOP IF NOT pg_try_advisory_lock("+finishLock+") THEN EXIT; END IF; PERFORM pg_advisory_unlock("+finishLock+"); IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'CATALOG_QA_MAIN_TIMEOUT'; END IF; PERFORM pg_sleep(0.05); END LOOP; END $hold$;");
 assert.ok(!/INSERT\s+INTO\s+public\./i.test(sql));return {...base,sql,lockSql,report};
}
function main(){
 const args={};for(const a of process.argv.slice(2)){if(a==='--ci'){args.ci=true;continue;}if(a==='--require-concurrency'){args.requireConcurrency=true;continue;}const m=/^--(expected-major|write-sql|write-lock-sql)=(.+)$/.exec(a);assert.ok(m,'Unknown or incomplete argument');assert.equal(args[m[1]],undefined);args[m[1]]=m[2];}
 assert.equal(args.ci,true);assert.ok(args['write-sql']);assert.ok(!args.requireConcurrency||args['write-lock-sql']);
 const test=buildNativeEmploymentCatalogQa({serverMajor:args['expected-major'],requireConcurrency:Boolean(args.requireConcurrency)});
 const outputs=[['write-sql',test.sql],['write-lock-sql',test.lockSql]].filter(([k])=>args[k]).map(([k,data])=>({output:path.resolve(args[k]),data}));assert.equal(new Set(outputs.map(x=>x.output)).size,outputs.length);
 for(const {output}of outputs)assert.ok(!fs.existsSync(output),'Output exists; choose a new path');for(const {output,data}of outputs){fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,data,{flag:'wx'});}
 console.log(JSON.stringify({generated:true,databaseExecuted:false,checksPlanned:test.report.checksPassed,catalogChecksPlanned:test.report.catalogChecksPassed,migration103Sha256:test.report.migration103Sha256}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{main();}catch(e){console.error(JSON.stringify({ok:false,message:e.message}));process.exitCode=1;}
