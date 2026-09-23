// Disposable PostgreSQL 17/18. Real authorization and writers; all fixtures roll back.
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
const read=n=>fs.readFileSync(path.join(root,'scripts/migrations',n),'utf8').replaceAll('\r\n','\n');
export function buildNativeFamilySchoolingQa({serverMajor,requireConcurrency=false}){
 const base=buildNativeJurisdictionQa({serverMajor,requireConcurrency}),{schema,ids}=base;
 const contentionKey=randomUUID(),finishKey=randomUUID();
 const nativeLock="hashtextextended("+q('school-certificate:'+ids.tenant+':'+ids.binding+':'+ids.maker+':family:'+contentionKey)+",0)";
 const finishSignal="hashtextextended("+q('native-family-qa-finished:'+finishKey)+",0)";
 const migration=read('102-native-family-schooling.sql');
 const relocate=s=>s.replaceAll('public.',schema+'.').replaceAll(schema+'.digest(','public.digest(')
  .replaceAll("'public'::regnamespace",q(schema)+'::regnamespace')
  .replaceAll("ARRAY['search_path=public, pg_temp']","ARRAY['search_path=pg_catalog, "+schema+", public, pg_temp']")
  .replaceAll("ARRAY['search_path=pg_catalog, public, pg_temp']","ARRAY['search_path=pg_catalog, "+schema+", public, pg_temp']")
  .replace(/SET search_path\s*=\s*(?:pg_catalog,\s*)?public,\s*pg_temp/gi,'SET search_path=pg_catalog,'+schema+',public,pg_temp');
 const normalized=s=>s.replaceAll("replace(p.prosrc,E'\\r\\n',E'\\n')","replace(replace(p.prosrc,E'\\r\\n',E'\\n'),"+q(schema+'.')+",'public'||'.')")
  .replaceAll("replace(prosrc,E'\\r\\n',E'\\n')","replace(replace(prosrc,E'\\r\\n',E'\\n'),"+q(schema+'.')+",'public'||'.')");
 const install=q(normalized(relocate(migration)));
 const sql099=read('099-grh-curated-consumers.sql');
 const lock=splitPostgresStatements(sql099).find(s=>s.includes('CREATE OR REPLACE FUNCTION public.grh_curated_source_read_lock_v1()'));assert.ok(lock);
 const patches=[7,11,12,13].map(n=>{const s=new RegExp('DO \\$curated_'+n+'\\$[\\s\\S]+?END \\$curated_'+n+'\\$;').exec(sql099)?.[0];assert.ok(s);return normalized(relocate(s));});
 const statements=[];let checks=0;
 const exec=s=>statements.push(s);
 exec('GRANT USAGE ON SCHEMA '+schema+' TO municontrol_actions_runtime_app;');
 const ok=(s,label)=>{exec('PERFORM qa_assert(('+s+'),'+q(label)+'); checks:=checks+1;');checks++;};
 const args=(c='maker')=>c+"->>'actorEmail',("+c+"->>'actorSessionId')::uuid,("+c+"->>'actorSessionVersion')::integer,"+c+"->>'releaseSha',("+c+"->>'tenantId')::uuid,("+c+"->>'membershipId')::uuid";
 const context=(contract='native_contract',actor='maker')=>'employee_family_context_v2('+args(actor)+','+contract+')';
 const declare=(payload='family_payload',key='family_key',actor='maker',version=2)=>'employee_family_declare_v'+version+'('+args(actor)+','+payload+','+key+'::text)';
 const attempt=(key='family_key',actor='maker')=>'employee_family_attempt_v2('+args(actor)+','+key+'::text)';
 const family=(contract='native_contract',actor='maker',version=5)=>'school_certificate_read_v'+version+'('+args(actor)+','+contract+')';
 const register=(payload='school_payload',key='school_key',actor='maker')=>'school_certificate_register_v3('+args(actor)+','+payload+','+key+'::text)';
 const history=()=>'school_certificate_history_v3('+args()+",native_contract,'own',family_receipt#>>'{familyRef,id}',family_receipt->>'identityToken')";
 const rejects=(sql,error,label)=>ok('qa_rejects('+sql+','+q(error)+')',label);
 const rejectCall=(call,error,label)=>{
  const literal='SELECT '+call.replaceAll('maker','(%1$L::jsonb)').replaceAll('family_payload','%2$L::jsonb').replaceAll('family_key','%3$L::uuid')
   .replaceAll('native_contract','%4$L::uuid').replaceAll('school_payload','%5$L::jsonb').replaceAll('school_key','%6$L::uuid')
   .replaceAll('outsider','(%7$L::jsonb)').replaceAll('reader','(%8$L::jsonb)');
  rejects('format('+q(literal)+',maker,family_payload,family_key,native_contract,school_payload,school_key,outsider,reader)',error,label);
 };
 const fault=(mutation,body)=>exec("BEGIN "+mutation+" "+body+" RAISE EXCEPTION USING ERRCODE='P1022',MESSAGE='RESTORE_NATIVE_FAMILY_FAULT'; EXCEPTION WHEN SQLSTATE 'P1022' THEN NULL; END;");
 exec(`
 CREATE TABLE grh_family(family_id bigint PRIMARY KEY,company_id bigint,legajo text,nombre text,fecha_nacimiento date,fecha_baja date,dni text,cuil text,import_run_id bigint,vinculo_code text,sexo text,source_payload jsonb);
 CREATE TABLE grh_family_overlay(LIKE grh_family INCLUDING ALL);
 CREATE VIEW grh_source_family_v1 AS SELECT * FROM grh_family UNION ALL SELECT * FROM grh_family_overlay;
 CREATE VIEW grh_source_catalog_rows_v1 AS SELECT * FROM grh_catalog_rows;
 CREATE TABLE grh_absences(id integer); CREATE TABLE grh_leaves(id integer); CREATE TABLE source_staging_row(id integer);
 CREATE TABLE grh_curated_source_version(id integer); CREATE TABLE grh_curated_source_delta(id integer);
 CREATE TABLE grh_curated_source_version_seal(id integer); CREATE TABLE grh_effective_source_binding(id integer);
 CREATE TABLE data_import_runs(id bigint PRIMARY KEY,source_name text,source_sha256 text,source_cutoff timestamp,status text);
 ALTER TABLE source_import_batch ADD COLUMN source_sha256 text;
 INSERT INTO data_import_runs VALUES(92001,'qa_grh',repeat('a',64),'2026-09-10 00:00:00','completed');
 UPDATE source_import_batch SET source_sha256=repeat('a',64),source_cutoff='2026-09-10 03:00:00Z' WHERE legacy_import_run_id=92001;
 INSERT INTO capabilities SELECT id,'employee.record.propose' FROM tenant_membership WHERE user_email<>'reader@example.invalid';
 INSERT INTO grh_catalog_rows VALUES(92001,'family_relationships','{"relationshipId":"2"}','HIJO','{"code":"H","name":"HIJO","sourceKey":{"relationshipId":"2"}}');
 -- Only the typed effective fixture contains this source child.
 INSERT INTO grh_family_overlay VALUES(10201,101,'903','Hija fuente de ensayo','2014-02-03',NULL,'99002001',NULL,92001,'2','F','{}');
 `);
 for(const n of ['057-family-schooling-certificates.sql','064-employee-family-members.sql','091-schooling-administrative-records.sql','094-schooling-source-recovery.sql'])exec('EXECUTE '+q(relocate(read(n)))+';');
 exec('EXECUTE '+q(relocate(lock))+'; REVOKE ALL ON FUNCTION grh_curated_source_read_lock_v1() FROM PUBLIC,municontrol_actions_runtime_app;');
 for(const s of patches)exec('EXECUTE '+q(s)+';');
 const untouched="(SELECT md5(string_agg(p.prosrc||coalesce(p.proacl::text,'')||p.proowner::text,E'\\n' ORDER BY p.oid)) FROM pg_proc p WHERE p.pronamespace="+q(schema)+"::regnamespace AND p.proname IN ('employee_family_subject_v1','employee_family_declare_v1','school_certificate_current_family_v1','school_certificate_current_family_v2','school_certificate_read_v4','school_certificate_history_v3','school_certificate_attempt_v3','school_certificate_download_v3','payroll_fixed_registry_subject_by_contract_v1','native_employee_create_v1'))";
 exec('ctx:=school_certificate_context_v1('+args()+'); grh_context:=employee_family_context_v1('+args()+','+q(ids.targetContract)+'::uuid);');
 exec("old_read:=school_certificate_read_v4("+args()+","+q(ids.targetContract)+"::uuid); grh_payload:=jsonb_build_object('contractId',"+q(ids.targetContract)+",'contractIdentityToken',grh_context#>>'{subject,identityToken}','familyName','Hijo propio GRH de ensayo','birthDate','2015-04-03','dni',NULL,'validFrom',NULL,'validTo',NULL);");
 exec('grh_family_receipt:='+declare('grh_payload','grh_family_key','maker',1)+'; unchanged_before:='+untouched+'; EXECUTE '+install+';');
 exec("SELECT md5(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,'')||p.proowner::text,E'\\n' ORDER BY p.oid)) INTO installed_before FROM pg_proc p WHERE p.pronamespace="+q(schema)+"::regnamespace; EXECUTE "+install+';');
 ok(untouched+'=unchanged_before','102 preserves exact099 readers, GRH token and native identity writer/resolver');
 ok("installed_before=(SELECT md5(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,'')||p.proowner::text,E'\\n' ORDER BY p.oid)) FROM pg_proc p WHERE p.pronamespace="+q(schema)+"::regnamespace)",'102 reapplication retains exact definitions, owner and ACL');
 const signatures=[...new Set([...migration.matchAll(/^\s*\('([\w]+\([^']*\))','[a-f0-9]{64}'/gm)].map(m=>m[1]))];
 assert.ok(signatures.length>=28);
 for(const sig of signatures){
  const start=statements.length;rejects(install,'EMPLOYEE_FAMILY_NATIVE_PREREQUISITE','modified function is refused: '+sig.split('(')[0]);
  fault("SELECT replace(pg_get_functiondef(p.oid),p.prosrc,p.prosrc||E'\\n-- unauthorized body') INTO damaged FROM pg_proc p WHERE p.oid=to_regprocedure("+q(schema+'.'+sig)+"); EXECUTE damaged;",statements.splice(start).join('\n'));
 }
 for(const mutation of [
  'ALTER TABLE employee_family_member DISABLE ROW LEVEL SECURITY;',
  'ALTER TABLE employee_family_member_event DISABLE ROW LEVEL SECURITY;',
  'ALTER TABLE employee_family_member DROP CONSTRAINT employee_family_native_pair_ck; ALTER TABLE employee_family_member ADD CONSTRAINT employee_family_native_pair_ck CHECK(true);',
  'ALTER TABLE school_certificate_record DROP CONSTRAINT school_certificate_native_pair_ck; ALTER TABLE school_certificate_record ADD CONSTRAINT school_certificate_native_pair_ck CHECK(true);',
  'ALTER TABLE employee_family_member DROP CONSTRAINT employee_family_native_registration_fk;',
  'ALTER TABLE school_certificate_record DROP CONSTRAINT school_certificate_native_registration_fk;',
  'ALTER TABLE employee_family_member ALTER COLUMN native_registration_id SET DEFAULT gen_random_uuid();',
  'DROP TRIGGER employee_family_member_immutable ON employee_family_member;',
  'ALTER TABLE school_certificate_record DISABLE TRIGGER school_certificate_record_native_link_v2;',
  'GRANT SELECT ON employee_family_member TO municontrol_actions_runtime_app;',
  'CREATE POLICY unsafe_qa ON employee_family_member USING(true);',
  'GRANT EXECUTE ON FUNCTION employee_family_subject_v2(jsonb,uuid,boolean) TO PUBLIC;',
  'GRANT EXECUTE ON FUNCTION employee_family_subject_v2(jsonb,uuid,boolean) TO municontrol_actions_runtime_app;',
  'ALTER FUNCTION employee_family_declare_v2(text,uuid,integer,text,uuid,uuid,jsonb,text) SET search_path=pg_temp;',
  'ALTER FUNCTION employee_family_context_v2(text,uuid,integer,text,uuid,uuid,uuid) IMMUTABLE;',
  'ALTER FUNCTION employee_family_context_v2(text,uuid,integer,text,uuid,uuid,uuid) STRICT;',
  'CREATE FUNCTION employee_family_subject_v2() RETURNS void LANGUAGE sql AS $$SELECT NULL::void$$;',
 ]){
  const start=statements.length;rejects(install,'EMPLOYEE_FAMILY_NATIVE_PREREQUISITE','modified schema refused: '+mutation.split(' ').slice(0,5).join(' '));fault(mutation,statements.splice(start).join('\n'));
 }
 fault('ALTER ROLE municontrol_actions_runtime_app LOGIN; EXECUTE '+install+';',"PERFORM qa_assert((SELECT rolcanlogin FROM pg_roles WHERE rolname='municontrol_actions_runtime_app'),'existing LOGIN role does not require unsafe role changes'); checks:=checks+1;");checks++;
 for(const [mutation,label]of [
  ["SELECT pg_get_functiondef('school_certificate_native_family_v5(jsonb,uuid)'::regprocedure) INTO damaged; DROP FUNCTION school_certificate_native_family_v5(jsonb,uuid); EXECUTE replace(damaged,'native_registered_at timestamp with time zone','native_registered_at text'); REVOKE ALL ON FUNCTION school_certificate_native_family_v5(jsonb,uuid) FROM PUBLIC,municontrol_actions_runtime_app;",'TABLE output type drift with identical body'],
  ["SELECT pg_get_functiondef('employee_family_subject_v2(jsonb,uuid,boolean)'::regprocedure) INTO damaged; EXECUTE replace(damaged,'DEFAULT false','DEFAULT true');",'default value drift with identical body']
 ]){const start=statements.length;rejects(install,'EMPLOYEE_FAMILY_NATIVE_PREREQUISITE',label+' rejected');fault(mutation,statements.splice(start).join('\n'));}
 ok(context(q(ids.targetContract)+'::uuid')+"->'subject'=grh_context->'subject'",'GRH v2 context preserves exact064 five-key subject');
 ok(context()+"->'subject'=native_subject",'native family context preserves exact093 eight-key subject');
 if(requireConcurrency){
  ok("EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND pid<>pg_backend_pid() AND granted AND objsubid=1 AND classid=((("+nativeLock+")>>32)&4294967295)::oid AND objid=(("+nativeLock+")&4294967295)::oid)",'independent connection holds the exact family actor/idempotency lock');
  rejectCall(declare("'{}'::jsonb",q(contentionKey)),'EMPLOYEE_FAMILY_SESSION_BUSY','family declaration cannot race another delivery with the same key');
  rejectCall(attempt(q(contentionKey)),'EMPLOYEE_FAMILY_SESSION_BUSY','lost acknowledgement lookup waits for the same delivery boundary');
  ok("(SELECT count(*)=1 FROM employee_family_member) AND (SELECT count(*)=0 FROM school_certificate_record)",'concurrent family delivery creates no partial child or certificate');
 }
 ok(declare('grh_payload','grh_family_key')+"->>'identityToken'=grh_family_receipt->>'identityToken'",'v2 recovers a historical v1 declaration');
 exec("family_payload:=jsonb_build_object('contractId',native_contract,'contractIdentityToken',native_subject->>'identityToken','familyName','Hija nativa de ensayo','birthDate','2014-02-03','dni','99001021','validFrom','2026-09-01','validTo',NULL); family_receipt:="+declare()+';');
 ok("family_receipt->>'version'='employee-family-declare.v2' AND family_receipt->>'duplicate'='false' AND family_receipt->>'contractId'=native_contract::text AND family_receipt->>'contractIdentityToken'=native_subject->>'identityToken' AND (SELECT count(*)=8 FROM jsonb_object_keys(family_receipt))",'native receipt binds exact contract and original token');
 ok("(SELECT m.source_batch_id IS NULL AND m.native_registration_id=(native_subject->>'registrationId')::uuid FROM employee_family_member m WHERE m.id=(family_receipt#>>'{familyRef,id}')::uuid)",'native child references actual registration without GRH batch');
 ok('('+declare()+"-'duplicate')=(family_receipt-'duplicate') AND "+declare()+"->>'duplicate'='true'",'exact declaration replay preserves receipt');
 ok('('+attempt()+"-'duplicate')=(family_receipt-'duplicate')",'attempt recovers original contract and token by key');
 rejectCall(context('native_contract','outsider'),'EMPLOYEE_FAMILY_NOT_FOUND','foreign tenant cannot resolve native contract');
 rejectCall(attempt('family_key','outsider'),'EMPLOYEE_FAMILY_NOT_FOUND','foreign tenant cannot recover another membership receipt');
 rejectCall(attempt('family_key','reader'),'SCHOOL_CERTIFICATE_CAPABILITY_REQUIRED','read-only membership cannot recover declaration receipt');
 rejectCall(attempt('gen_random_uuid()'),'EMPLOYEE_FAMILY_NOT_FOUND','missing attempt is not fabricated');
 rejectCall(family('native_contract','outsider'),'SCHOOL_CERTIFICATE_NOT_FOUND','foreign tenant cannot list native children');
 rejectCall(declare("family_payload||'{\"familyName\":\"Otro hijo\"}'"),'EMPLOYEE_FAMILY_IDEMPOTENCY_REUSE','changed body cannot reuse key');
 rejectCall(declare('family_payload','gen_random_uuid()'),'EMPLOYEE_FAMILY_DUPLICATE','another key cannot duplicate the same child');
 rejectCall(declare("family_payload||jsonb_build_object('contractIdentityToken',repeat('0',64))",'gen_random_uuid()'),'EMPLOYEE_FAMILY_IDENTITY_CHANGED','new declaration requires current identity');
 exec('result:='+family()+';');
 ok("result->>'version'='family-schooling.v5' AND jsonb_array_length(result->'rows')=1 AND result#>>'{rows,0,employeeOrigin}'='MUNICONTROL' AND result#>'{rows,0,sourceCutoff}'='null'::jsonb AND result#>'{rows,0,sourceSchooling}'='null'::jsonb AND result#>>'{rows,0,familyRef,kind}'='own'",'native row declares origin and absence of GRH evidence');
 ok("result#>>'{rows,0,nativeRegistrationId}'=native_subject->>'registrationId' AND (result#>>'{rows,0,nativeRegisteredAt}')::timestamptz=(native_subject->>'registeredAt')::timestamptz AND result#>>'{rows,0,effectiveDates,origin}'='none'",'registeredAt is actual local registration time');
 exec('result:='+family('NULL')+';');
 ok("jsonb_array_length(result->'rows')=3 AND (SELECT count(*)=1 FROM jsonb_array_elements(result->'rows') r WHERE r->>'employeeOrigin'='MUNICONTROL')",'v5 combines source, own GRH and own native families');
 for(const v of [1,2,3,4])ok("NOT EXISTS(SELECT 1 FROM jsonb_array_elements("+family('NULL','maker',v)+"->'rows') r WHERE r->>'contractId'=native_contract::text)",'old schooling v'+v+' remains GRH-only');
 exec(`school_payload:=jsonb_build_object('contractId',native_contract,'familyRef',family_receipt->'familyRef','identityToken',family_receipt->>'identityToken','expectedCertificateId',NULL,
 'institution','Escuela de ensayo','educationLevel','Primario','course','Sexto','schoolYear',2026,'issuedOn','2026-03-01','presentedOn','2026-09-22','expiresOn','2026-12-31',
 'evidenceMode','paper_declared','paperReference','Mesa de entradas QA102','filename',NULL,'contentBase64',NULL,'sha256',NULL,'reason','Presentación administrativa de ensayo');
 UPDATE school_certificate_storage_policy SET pdf_quota_bytes=0 WHERE singleton;`);
 exec('school_receipt:='+register()+';');
 ok("school_receipt->>'version'='family-schooling-register.v3' AND school_receipt->>'duplicate'='false'",'v3 paper evidence succeeds at zero PDF quota');
 ok("(SELECT native_registration_id=(native_subject->>'registrationId')::uuid AND source_batch_id IS NULL AND source_database IS NULL AND source_cutoff IS NULL FROM school_certificate_record WHERE id=(school_receipt->>'certificateId')::uuid)",'school record preserves actual native registration and no fabricated source');
 ok(register()+"->>'duplicate'='true' AND "+register()+"->>'certificateId'=school_receipt->>'certificateId'",'schooling replay has stable ID and no duplicate record');
 ok(history()+"->>'total'='1' AND "+history()+"#>>'{rows,0,id}'=school_receipt->>'certificateId'",'v3 native history resolves exact family');
 ok(family()+"#>>'{rows,0,effectiveDates,origin}'='manual'",'native administrative evidence has explicit manual precedence');
 const pdf=Buffer.from('%PDF-1.7\n% synthetic102\n%%EOF\n');
 exec('paper_payload:=school_payload; school_payload:=school_payload||'+j({evidenceMode:'pdf',paperReference:null,filename:'constancia.pdf',contentBase64:pdf.toString('base64'),sha256:sha(pdf)})+"||jsonb_build_object('expectedCertificateId',school_receipt->>'certificateId'); UPDATE school_certificate_storage_policy SET pdf_quota_bytes=8388608 WHERE singleton;");
 exec('pdf_receipt:='+register('school_payload','gen_random_uuid()')+'; result:=school_certificate_download_v3('+args()+",(pdf_receipt->>'certificateId')::uuid);");
 ok("result->>'sha256'="+q(sha(pdf))+" AND result->>'contentBase64'="+q(pdf.toString('base64'))+" AND result->>'version'='family-schooling-download.v3'",'v3 native PDF download preserves exact bytes');
 ok(history()+"->>'total'='2' AND "+history()+"#>>'{rows,0,supersedesId}'=school_receipt->>'certificateId'",'replacement retains ordered append-only history');
 exec("SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED; SET LOCAL ROLE municontrol_actions_runtime_app; result:="+family()+"; RESET ROLE;");
 ok("result#>>'{rows,0,employeeOrigin}'='MUNICONTROL' AND result#>>'{rows,0,historyCount}'='2'",'effective runtime role can read native evidence only through the authenticated facade');
 rejectCall(register('school_payload','gen_random_uuid()','outsider'),'SCHOOL_CERTIFICATE_NOT_FOUND','foreign tenant cannot write native certificate');
 rejectCall(register('school_payload','gen_random_uuid()','reader'),'SCHOOL_CERTIFICATE_CAPABILITY_REQUIRED','read-only membership cannot write native certificate');
 exec('school_payload:=paper_payload;');
 const noPayroll=statements.length;
 ok(context()+"->'subject'=native_subject",'family has no payroll capability dependency');
 ok('('+attempt()+"-'duplicate')=(family_receipt-'duplicate')",'attempt authority is independent of payroll permissions');
 fault("DELETE FROM capabilities WHERE membership_id="+q(ids.maker)+" AND capability_key LIKE 'payroll.%';",statements.splice(noPayroll).join('\n'));
 for(const[mutation,error,label]of [
  ["UPDATE tenant_identity_session SET status='revoked' WHERE id="+q(ids.makerSession)+';','SCHOOL_CERTIFICATE_SESSION_INVALID','session revocation'],
  ["DELETE FROM capabilities WHERE membership_id="+q(ids.maker)+" AND capability_key='employee.record.propose';",'SCHOOL_CERTIFICATE_CAPABILITY_REQUIRED','permission revocation'],
  ["UPDATE platform_tenant_source_binding SET verified=false WHERE id="+q(ids.binding)+';','SCHOOL_CERTIFICATE_SOURCE_BINDING_REQUIRED','binding revocation']
 ]){const start=statements.length;rejectCall(attempt(),error,label+' blocks recovery');fault(mutation,statements.splice(start).join('\n'));}
 const drift=statements.length;
 ok('('+declare()+"-'duplicate')=(family_receipt-'duplicate') AND ("+attempt()+"-'duplicate')=(family_receipt-'duplicate')",'later identity drift cannot hide original declaration receipt');
 rejectCall(declare("family_payload||'{\"familyName\":\"Otra hija de ensayo\",\"dni\":\"99001022\"}'",'gen_random_uuid()'),'EMPLOYEE_FAMILY_IDENTITY_CHANGED','drift blocks new declaration');
 rejectCall(register(),'SCHOOL_CERTIFICATE_IDENTITY_CHANGED','schooling revalidates current identity');
 fault("ALTER TABLE person_identity DISABLE TRIGGER USER; UPDATE person_identity SET full_name='Identidad modificada de ensayo' WHERE id=(SELECT person_id FROM employment_contract WHERE id=native_contract); ALTER TABLE person_identity ENABLE TRIGGER USER;",statements.splice(drift).join('\n'));
 for(const table of ['employee_family_member','employee_family_member_event','school_certificate_record']){
  ok("(SELECT relrowsecurity AND NOT relforcerowsecurity FROM pg_class WHERE oid="+q(schema+'.'+table)+"::regclass) AND NOT has_table_privilege('municontrol_actions_runtime_app',"+q(schema+'.'+table)+",'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')",'runtime denied direct access to '+table);
  rejects(q('DELETE FROM '+table),'SCHOOL_CERTIFICATE_IMMUTABLE',table+' stays append-only');
 }
 for(const signature of ['employee_family_subject_v2(jsonb,uuid,boolean)','employee_family_write_context_v2(text,uuid,integer,text,uuid,uuid,text)','employee_family_receipt_v2(employee_family_member,boolean)','employee_family_native_link_v2()','school_certificate_native_family_v5(jsonb,uuid)'])
  ok("NOT has_function_privilege('municontrol_actions_runtime_app',"+q(schema+'.'+signature)+",'EXECUTE')",'runtime cannot invoke internal helper '+signature.split('(')[0]);
 ok("NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.pronamespace="+q(schema)+"::regnamespace AND p.proname IN ('employee_family_subject_v2','employee_family_write_context_v2','employee_family_receipt_v2','employee_family_context_v2','employee_family_attempt_v2','employee_family_native_link_v2','school_certificate_native_family_v5','school_certificate_read_v5','employee_family_declare_v2') AND a.grantee=0)",'no new function grants PUBLIC execute');
 ok("(SELECT count(*)=0 FROM grh_family) AND (SELECT count(*)=1 FROM grh_family_overlay) AND (SELECT count(*)=0 FROM school_certificate_source_recovery) AND (SELECT count(*)=1 FROM native_employee_registration)",'native schooling never writes imported source or duplicates employee registration');
 const seed=(from,to)=>`
 WITH seed AS MATERIALIZED (
  SELECT to_jsonb(m) original,gen_random_uuid() new_id,'Hijo sintético límite '||g.n::text new_name
  FROM employee_family_member m CROSS JOIN generate_series(`+from+','+to+`) g(n)
  WHERE m.id=(family_receipt#>>'{familyRef,id}')::uuid
 ), snapshots AS MATERIALIZED (
  SELECT s.*,s.original->'identity_snapshot'||jsonb_build_object('id',s.new_id,'familyName',s.new_name,'dni',NULL) new_snapshot FROM seed s
 ), documents AS MATERIALIZED (
  SELECT original||jsonb_build_object('id',new_id,'family_name',new_name,'name_key',employee_family_name_key_v1(new_name),'dni',NULL,
   'identity_snapshot',new_snapshot,'identity_token',encode(digest(convert_to(new_snapshot::text,'UTF8'),'sha256'),'hex'),
   'idempotency_key',gen_random_uuid()::text,'request_sha256',encode(digest(new_id::text,'sha256'),'hex')) document FROM snapshots
 )
 INSERT INTO employee_family_member SELECT (jsonb_populate_record(NULL::employee_family_member,d.document)).* FROM documents d;
 `;
 const limitStart=statements.length;
 ok("jsonb_array_length("+family('NULL')+"->'rows')=5000",'combined GRH/native report includes exactly5000 rows without truncation');
 exec(seed(4998,4998));
 rejectCall(family('NULL'),'SCHOOL_CERTIFICATE_ROW_LIMIT','combined cohort5001 fails rather than silently dropping a child');
 fault(seed(1,4997),statements.splice(limitStart).join('\n'));
 exec('EXECUTE '+install+';');
 ok('('+attempt()+"-'duplicate')=(family_receipt-'duplicate') AND "+history()+"->>'total'='2'",'102 reapplication preserves existing child and history');
 const block=`
 DECLARE ctx jsonb; grh_context jsonb; old_read jsonb; grh_payload jsonb; grh_family_receipt jsonb; grh_family_key uuid:=gen_random_uuid();
 family_payload jsonb; family_receipt jsonb; family_key uuid:=gen_random_uuid(); school_payload jsonb; paper_payload jsonb;
 school_receipt jsonb; pdf_receipt jsonb; school_key uuid:=gen_random_uuid(); unchanged_before text; installed_before text; damaged text;
 BEGIN BEGIN
 `+statements.join('\n')+`
 RAISE EXCEPTION USING ERRCODE='P1021',MESSAGE='ROLLBACK_NATIVE_FAMILY_FIXTURE';
 EXCEPTION WHEN SQLSTATE 'P1021' THEN NULL; END; END;
 `;
 const end=base.sql.indexOf("'declared fixtures roll back before unchanged native and GRH regressions'");assert.ok(end>0);
 const insert=base.sql.indexOf(' END;',end)+5;assert.ok(insert>end);
 const report={...base.report,nativeFamilyChecksPassed:checks,checksPassed:base.report.checksPassed+checks,nativeFamilyConcurrentLockChecked:requireConcurrency,migration102Sha256:sha(migration),
 limitations:[...base.report.limitations,'102 executes real native/family writers, authorization and exact099 patches. Effective source views and IAM capability/SoD data are synthetic; no municipal, payroll or source recovery certification.','102 concurrency is real second-connection lock contention. Duplicate/replay and stale-token checks are sequential, not represented as simultaneous committed writers.']};
 let sql=(base.sql.slice(0,insert)+'\n'+block+base.sql.slice(insert)).replaceAll("current_database()<>'fixed_novelties_qa'","current_database()<>'native_family_schooling_qa'")
 .replace("SET LOCAL statement_timeout='90s'","SET LOCAL statement_timeout='180s'")
 .replace('checks<>'+base.report.checksPassed,'checks<>'+report.checksPassed).replace(j(base.report),()=>j(report));
 if(requireConcurrency)sql=sql.replace(" PERFORM set_config('mc.fixed_novelties_qa_report'",
  " PERFORM pg_advisory_xact_lock("+finishSignal+");\n DECLARE release_deadline timestamptz:=clock_timestamp()+interval '10 seconds'; BEGIN LOOP\n EXIT WHEN pg_try_advisory_xact_lock("+nativeLock+"); IF clock_timestamp()>release_deadline THEN RAISE EXCEPTION 'NATIVE_FAMILY_QA_BLOCKER_RELEASE_TIMEOUT'; END IF; PERFORM pg_sleep(0.05); END LOOP; END;\n PERFORM set_config('mc.fixed_novelties_qa_report'");
 const lockSql=base.lockSql.replaceAll("current_database()<>'fixed_novelties_qa'","current_database()<>'native_family_schooling_qa'")
 .replace(" SELECT 'FIXED_NOVELTIES_QA_LOCK_READY'"," SELECT pg_advisory_xact_lock("+nativeLock+");\n SELECT 'FIXED_NOVELTIES_QA_LOCK_READY'")
 .replace(' SELECT pg_sleep(45);'," DO $hold$ DECLARE deadline timestamptz:=clock_timestamp()+interval '210 seconds'; BEGIN LOOP\n IF NOT pg_try_advisory_lock("+finishSignal+") THEN EXIT; END IF; PERFORM pg_advisory_unlock("+finishSignal+");\n IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'NATIVE_FAMILY_QA_MAIN_TIMEOUT'; END IF; PERFORM pg_sleep(0.05); END LOOP; END $hold$;");
 assert.ok(!/INSERT\s+INTO\s+public\./i.test(sql));
 return{...base,sql,report,lockSql};
}
function main(){
 const args={};for(const a of process.argv.slice(2)){if(a==='--ci'){args.ci=true;continue;}if(a==='--require-concurrency'){args.requireConcurrency=true;continue;}const m=/^--(expected-major|write-sql|write-lock-sql)=(.+)$/.exec(a);assert.ok(m,'Unknown or incomplete argument');assert.equal(args[m[1]],undefined);args[m[1]]=m[2];}
 assert.equal(args.ci,true);assert.ok(args['write-sql']);assert.ok(!args.requireConcurrency||args['write-lock-sql']);
 const test=buildNativeFamilySchoolingQa({serverMajor:args['expected-major'],requireConcurrency:Boolean(args.requireConcurrency)});
 const outputs=[['write-sql',test.sql],['write-lock-sql',test.lockSql]].filter(([key])=>args[key]).map(([key,data])=>({output:path.resolve(args[key]),data}));assert.equal(new Set(outputs.map(x=>x.output)).size,outputs.length);
 for(const{output}of outputs)assert.ok(!fs.existsSync(output),'Output exists; choose a new path');
 for(const{output,data}of outputs){fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,data,{flag:'wx'});}
 console.log(JSON.stringify({generated:true,databaseExecuted:false,checksPlanned:test.report.checksPassed,nativeFamilyChecksPlanned:test.report.nativeFamilyChecksPassed,migration102Sha256:test.report.migration102Sha256}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{main();}catch(e){console.error(JSON.stringify({ok:false,message:e.message}));process.exitCode=1;}
