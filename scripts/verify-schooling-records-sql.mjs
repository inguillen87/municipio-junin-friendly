// Offline PostgreSQL 17/18 CI verifier. Execute emitted SQL with psql ON_ERROR_STOP.
// All synthetic identities, source rows and records are created in one isolated schema.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const j=value=>q(JSON.stringify(value))+'::jsonb';
const read=name=>fs.readFileSync(path.join(root,'scripts/migrations',name),'utf8');
function section(source,start,end){
 assert.equal(source.split(start).length,2,`Missing or repeated function ${start}`);
 const offset=source.indexOf(start),finish=source.indexOf(end,offset);
 assert.ok(finish>offset,`Missing section end ${end}`);return source.slice(offset,finish);
}

export function buildSchoolingQa({serverMajor,requireConcurrency=false}){
 assert.ok([17,18].includes(Number(serverMajor)),'Expected PostgreSQL major must be 17 or 18');
 const schema='mc_qa_schooling_091_'+randomUUID().replaceAll('-','');
 const sources={
  '057-family-schooling-certificates.sql':read('057-family-schooling-certificates.sql'),
  '064-employee-family-members.sql':read('064-employee-family-members.sql'),
  '091-schooling-administrative-records.sql':read('091-schooling-administrative-records.sql'),
 };
 const identity=read('007-action-center-read-facades.sql');
 const actualContext=section(identity,'CREATE OR REPLACE FUNCTION action_center_assert_tenant_read_session_v2(','CREATE OR REPLACE FUNCTION action_center_context_has_area_scope(');
 const normalizeDigits=section(read('002-canonical-integration.sql'),'CREATE OR REPLACE FUNCTION normalize_digits(input text)','CREATE OR REPLACE FUNCTION is_valid_cuil(input text)');
 const relocate=source=>source.replaceAll('public.',schema+'.')
  .replace(/SET search_path\s*=\s*public,\s*pg_temp/gi,`SET search_path=pg_catalog,${schema},public,pg_temp`)
  .replace(/SET search_path\s*=\s*pg_catalog,\s*public,\s*pg_temp/gi,`SET search_path=pg_catalog,${schema},public,pg_temp`);
 const ids=Object.fromEntries(['tenant','otherTenant','binding','otherBinding','writer','reader','outsider','writerSession','readerSession','outsiderSession','person','otherPerson','foreignPerson','contract','otherContract','foreignContract','batch','otherBatch','paperKey','pdfKey'].map(name=>[name,randomUUID()]));
 const release='9'.repeat(40),family='910000000000000001',otherFamily='910000000000000002',foreignFamily='910000000000000003',blockedFamily='910000000000000004';
 const context=(actor,session,tenant,email)=>({email,session,version:1,release,tenant,membership:actor});
 const writer=context(ids.writer,ids.writerSession,ids.tenant,'writer@example.invalid');
 const reader=context(ids.reader,ids.readerSession,ids.tenant,'reader@example.invalid');
 const outsider=context(ids.outsider,ids.outsiderSession,ids.otherTenant,'outsider@example.invalid');
 const args=c=>`${c}->>'email',(${c}->>'session')::uuid,(${c}->>'version')::integer,${c}->>'release',(${c}->>'tenant')::uuid,(${c}->>'membership')::uuid`;
 const call=(version,operation,c,tail)=>`school_certificate_${operation}_v${version}(${args(c)}${tail?', '+tail:''})`;
 const statements=[];let checks=0;
 const exec=sql=>statements.push(sql);
 const ok=(expression,label)=>{statements.push(`PERFORM qa_assert((${expression}),${q(label)}); checks:=checks+1;`);checks++;};
 const rejects=(statement,error,label)=>ok(`qa_rejects(${statement},${q(error)})`,label);
 const register=(payload,key=q(randomUUID()),ctx='c')=>call(3,'register',ctx,`${payload},${key}`);
 const latest=(ctx='c',contract=q(ids.contract)+'::uuid')=>call(3,'read',ctx,contract);
 const history=(ctx='c',contract=q(ids.contract)+'::uuid',kind="'grh'",id=q(family),identity='token')=>call(3,'history',ctx,`${contract},${kind},${id},${identity}`);
 const rejectCall=(expression,values,error,label,ctx='c')=>rejects(`format(${q('SELECT '+expression+' FROM (SELECT %1$L::jsonb qa_ctx) p')},${[ctx,...values].join(',')})`,'SCHOOL_CERTIFICATE_'+error,label);
 const badRegister=(expression,error,label,ctx='c',key=q(randomUUID()))=>rejectCall(register('%2$L::jsonb','%3$L','qa_ctx'),[expression,key],error,label,ctx);
 const pdfBytes=Buffer.from('%PDF-1.7\n% SQL storage fixture; API parser tested separately\n%%EOF\n');
 const pdf={filename:'constancia.pdf',contentBase64:pdfBytes.toString('base64'),sha256:createHash('sha256').update(pdfBytes).digest('hex')};
 const paper={contractId:ids.contract,familyRef:{kind:'grh',id:family},identityToken:null,expectedCertificateId:null,institution:'Escuela de ensayo',educationLevel:'Primario',course:'Sexto',schoolYear:2026,issuedOn:'2026-03-01',presentedOn:'2026-03-02',expiresOn:'2026-12-31',evidenceMode:'paper_declared',paperReference:'Mesa de entradas QA-091',filename:null,contentBase64:null,sha256:null,reason:'Presentación administrativa de ensayo'};
 const lockToken=`encode(digest(convert_to(jsonb_build_object('contractId',${q(ids.contract)}::uuid,'personId',${q(ids.person)}::uuid,'sourceDatabase','qa_school_source','companyId',101::bigint,'legajo','QA-1','familyId',${q(blockedFamily)},'familyName','Hijo para concurrencia','birthDate',DATE '2016-03-04','dni',NULL::text,'cuil',NULL::text)::text,'UTF8'),'sha256'),'hex')`;
 const lockKey=`hashtextextended(${q('school-certificate:record:v3:'+ids.tenant+':'+ids.binding+':'+ids.contract+':grh:'+blockedFamily+':')}||${lockToken},0)`;

 const tables=`
 CREATE TABLE platform_tenant(id uuid PRIMARY KEY,status text);
 CREATE TABLE internal_users(email text PRIMARY KEY,display_name text,active boolean,auth_mode text,identity_version integer);
 CREATE TABLE tenant_membership(id uuid PRIMARY KEY,tenant_id uuid,user_email text,role_key text,status text,UNIQUE(id,tenant_id));
 CREATE TABLE tenant_identity_session(id uuid PRIMARY KEY,user_email text,active_tenant_id uuid,session_version integer,identity_version integer,source text,auth_level text,status text,expires_at timestamptz,last_seen_at timestamptz);
 CREATE TABLE platform_tenant_source_binding(id uuid PRIMARY KEY,tenant_id uuid,source_system text,source_company_id bigint,source_database text,verified boolean,UNIQUE(tenant_id,id));
 CREATE TABLE tenant_identity_policy(tenant_id uuid PRIMARY KEY,tenant_data_plane_ready boolean,certified_release_sha text,certified_source_binding_id uuid);
 CREATE TABLE tenant_action_authority(membership_id uuid,tenant_id uuid);
 CREATE TABLE person_identity(id uuid PRIMARY KEY,full_name text);
 CREATE TABLE source_import_batch(id uuid PRIMARY KEY,source_system text,source_database text,validation_state text,legacy_import_run_id bigint,source_cutoff timestamptz);
 CREATE TABLE employment_contract(id uuid PRIMARY KEY,person_id uuid,source_system text,source_batch_id uuid,legacy_company_id bigint,legacy_legajo text,status text);
 CREATE TABLE employment_status_snapshot(employment_contract_id uuid,source_system text,source_batch_id uuid,administrative_status text,snapshot_date date,recorded_at timestamptz DEFAULT clock_timestamp());
 CREATE TABLE tenant_action_employment_link(membership_id uuid,tenant_id uuid,source_binding_id uuid,employment_contract_id uuid,active boolean);
 CREATE TABLE tenant_action_area_scope(id uuid,capability_key text,scope_level text,company_id bigint,organization_unit_source_id text,sector_source_id text,membership_id uuid,tenant_id uuid,source_binding_id uuid,active boolean);
 CREATE TABLE capabilities(membership_id uuid,capability_key text);
 CREATE TABLE grh_family(family_id bigint PRIMARY KEY,company_id bigint,legajo text,nombre text,fecha_nacimiento date,fecha_baja date,dni text,cuil text,import_run_id bigint,vinculo_code text);
 CREATE TABLE grh_catalog_rows(catalog text,import_run_id bigint,label text,source_key text,source_payload jsonb);
 CREATE FUNCTION tenant_iam_assert_no_sod_conflict(uuid) RETURNS void LANGUAGE sql AS 'SELECT NULL::void';
 CREATE FUNCTION tenant_iam_effective_capabilities(mid uuid) RETURNS TABLE(capability_key text) LANGUAGE sql SET search_path=pg_catalog,${schema},pg_temp AS $f$ SELECT c.capability_key FROM capabilities c WHERE c.membership_id=mid $f$;
 ${relocate(normalizeDigits)}
 ${relocate(actualContext)}
 ${Object.values(sources).map(relocate).join('\n')}
 CREATE FUNCTION qa_assert(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $f$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'SCHOOLING_QA_FAILED: %',label; END IF; END $f$;
 CREATE FUNCTION qa_rejects(statement text,wanted text) RETURNS boolean LANGUAGE plpgsql SET search_path=pg_catalog,${schema},public,pg_temp AS $f$
 BEGIN EXECUTE statement; RETURN false; EXCEPTION WHEN OTHERS THEN IF SQLERRM=wanted THEN RETURN true; END IF; RAISE; END $f$;
 `;
 const memberships=[writer,reader,outsider];
 const fixtures=`
 INSERT INTO platform_tenant VALUES(${q(ids.tenant)},'active'),(${q(ids.otherTenant)},'active');
 INSERT INTO platform_tenant_source_binding VALUES(${q(ids.binding)},${q(ids.tenant)},'GRH',101,'qa_school_source',true),(${q(ids.otherBinding)},${q(ids.otherTenant)},'GRH',202,'qa_school_other',true);
 INSERT INTO tenant_identity_policy VALUES(${q(ids.tenant)},true,${q(release)},${q(ids.binding)}),(${q(ids.otherTenant)},true,${q(release)},${q(ids.otherBinding)});
 ${memberships.map(c=>`INSERT INTO internal_users VALUES(${q(c.email)},'Operador de ensayo',true,'managed',1);
 INSERT INTO tenant_membership VALUES(${q(c.membership)},${q(c.tenant)},${q(c.email)},'QA_ROLE','active');
 INSERT INTO tenant_identity_session VALUES(${q(c.session)},${q(c.email)},${q(c.tenant)},1,1,'membership','mfa','active',now()+interval '1 hour',now());
 INSERT INTO tenant_action_authority VALUES(${q(c.membership)},${q(c.tenant)});`).join('\n')}
 INSERT INTO capabilities SELECT id,'actions.read' FROM tenant_membership;
 INSERT INTO capabilities SELECT id,'workforce.employee.read' FROM tenant_membership;
 INSERT INTO capabilities SELECT id,'employee.record.propose' FROM tenant_membership WHERE user_email<>'reader@example.invalid';
 INSERT INTO person_identity VALUES(${q(ids.person)},'Agente de ensayo'),(${q(ids.otherPerson)},'Otro agente de ensayo'),(${q(ids.foreignPerson)},'Agente externo de ensayo');
 INSERT INTO source_import_batch VALUES(${q(ids.batch)},'GRH','qa_school_source','published',91001,'2026-09-10T00:00:00Z'),(${q(ids.otherBatch)},'GRH','qa_school_other','published',91002,'2026-09-10T00:00:00Z');
 INSERT INTO employment_contract VALUES(${q(ids.contract)},${q(ids.person)},'GRH',${q(ids.batch)},101,'QA-1','active'),(${q(ids.otherContract)},${q(ids.otherPerson)},'GRH',${q(ids.batch)},101,'QA-2','active'),(${q(ids.foreignContract)},${q(ids.foreignPerson)},'GRH',${q(ids.otherBatch)},202,'QA-3','active');
 INSERT INTO employment_status_snapshot SELECT id,'GRH',source_batch_id,'active','2026-09-10',clock_timestamp() FROM employment_contract;
 INSERT INTO grh_catalog_rows SELECT 'family_relationships',n,'HIJO','{"relationshipId":"2"}','{"code":"H","name":"HIJO","sourceKey":{"relationshipId":"2"}}'::jsonb FROM unnest(ARRAY[91001,91002]) n;
 INSERT INTO grh_family VALUES(${family},101,'QA-1','Hija de ensayo','2012-02-29',NULL,NULL,NULL,91001,'2'),(${otherFamily},101,'QA-2','Hijo de otro agente','2013-05-01',NULL,NULL,NULL,91001,'2'),(${foreignFamily},202,'QA-3','Hija de otro municipio','2011-04-03',NULL,NULL,NULL,91002,'2'),(${blockedFamily},101,'QA-1','Hijo para concurrencia','2016-03-04',NULL,NULL,NULL,91001,'2');
 -- The original quota/storage functions remain real; increase only the synthetic cluster ceiling.
 UPDATE school_certificate_storage_policy SET cluster_limit_bytes=1099511627776,cluster_reserve_bytes=16777216 WHERE singleton;
 `;

 exec(`ctx:=school_certificate_context_v1(${args('c')});
 SELECT to_jsonb(f) INTO family_row FROM school_certificate_current_family_v2(ctx,${q(ids.contract)}::uuid) f WHERE f.family_kind='grh' AND f.family_id=${q(family)};
 token:=family_row->>'identity_token';`);
 ok(`family_row->>'contract_id'=${q(ids.contract)} AND family_row->>'family_id'=${q(family)} AND length(token)=64`,'actual source identity helpers locate only authorized child');
 exec(`result:=${latest()};`);
 ok("result->>'version'='family-schooling.v3' AND result->>'canRegister'='true' AND jsonb_array_length(result->'rows')=2",'v3 facade reuses actual context and source population');
 ok("result#>>'{scope,currentCensusCertified}'='false' AND result#>>'{scope,payrollEligibilityCertified}'='false'",'administrative records never certify census or payroll eligibility');
 exec(`SELECT md5(jsonb_agg(to_jsonb(g) ORDER BY family_id)::text) INTO source_before FROM grh_family g;
 payload:=${j(paper)}||jsonb_build_object('identityToken',token);`);
 if(requireConcurrency){
  ok(`EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND pid<>pg_backend_pid() AND granted AND objsubid=1 AND classid=(((${lockKey})>>32)&4294967295)::oid AND objid=((${lockKey})&4294967295)::oid)`,'independent connection holds this exact family identity lock');
  exec(`SELECT to_jsonb(f) INTO blocked_row FROM school_certificate_current_family_v2(ctx,${q(ids.contract)}::uuid) f WHERE f.family_id=${q(blockedFamily)};`);
  ok(`blocked_row->>'identity_token'=${lockToken}`,'blocker identity exactly matches the unchanged real source helper');
  badRegister(`payload||jsonb_build_object('familyRef',jsonb_build_object('kind','grh','id',${q(blockedFamily)}),'identityToken',blocked_row->>'identity_token')`,'SESSION_BUSY','concurrent request for the same family fails before writing');
  ok('(SELECT count(*)=0 FROM school_certificate_record)','busy family leaves no partial record');
 }
 // Create historical evidence through the unchanged v2 writer, not a write stub.
 exec(`legacy_payload:=jsonb_build_object('contractId',${q(ids.contract)},'familyRef',jsonb_build_object('kind','grh','id',${q(family)}),'identityToken',token,'presentedOn','2025-03-01','expiresOn','2025-12-31')||${j(pdf)};
 legacy_receipt:=${call(2,'register','c',`legacy_payload,${q(randomUUID())}`)};`);
 ok("legacy_receipt->>'version'='family-schooling-register.v2' AND legacy_receipt->>'duplicate'='false'",'original v2 PDF writer remains operational');
 exec(`result:=${history()};`);
 ok("result->>'total'='1' AND result#>>'{rows,0,recordKind}'='legacy_pdf' AND result#>'{rows,0,institution}'='null'::jsonb",'legacy PDF history is projected without inventing missing metadata');
 badRegister('payload','REVISION_CONFLICT','expected latest also protects existing legacy evidence');
 exec(`payload:=payload||jsonb_build_object('expectedCertificateId',legacy_receipt->>'certificateId');
 UPDATE school_certificate_storage_policy SET pdf_quota_bytes=0 WHERE singleton;
 SELECT generation INTO generation_before FROM school_certificate_storage_policy;
 receipt:=${register('payload',q(ids.paperKey))}; paper_payload:=payload;`);
 ok("receipt->>'version'='family-schooling-register.v3' AND receipt->>'duplicate'='false'",'paper record succeeds with zero PDF quota');
 ok('(SELECT generation=generation_before FROM school_certificate_storage_policy) AND (SELECT count(*)=1 FROM school_certificate_blob)','paper declaration neither reserves storage nor creates a blob');
 exec(`result:=${latest()};`);
 ok("result->>'canRegister'='true' AND result#>>'{storage,remainingBytes}'='0'",'paper registration remains available at zero PDF quota');
 ok(`EXISTS(SELECT 1 FROM jsonb_array_elements(result->'rows') r WHERE r#>>'{familyRef,id}'=${q(family)} AND r->>'historyCount'='2' AND r#>>'{certificate,id}'=receipt->>'certificateId' AND r#>>'{certificate,recordKind}'='schooling_record' AND r#>>'{certificate,evidenceMode}'='paper_declared' AND r#>'{certificate,byteLength}'='null'::jsonb)`,'latest projection includes paper metadata and complete mixed count');
 exec(`result:=${history()};`);
 ok("result->>'total'='2' AND result#>>'{rows,0,supersedesId}'=legacy_receipt->>'certificateId' AND result#>>'{rows,1,id}'=legacy_receipt->>'certificateId' AND result#>>'{rows,0,recordedBy}'=c->>'email'",'mixed history preserves exact previous evidence and server-resolved actor');
 exec(`result:=${register('paper_payload',q(ids.paperKey))};`);
 ok("result->>'duplicate'='true' AND result->>'certificateId'=receipt->>'certificateId' AND (SELECT count(*)=1 FROM school_certificate_record)",'idempotent replay succeeds before now-stale expected revision and writes no second record');
 badRegister("paper_payload||'{\"reason\":\"Otro motivo administrativo\"}'",'IDEMPOTENCY_REUSE','same key cannot be reused for changed content','c',q(ids.paperKey));
 exec(`result:=${call(3,'attempt','c',q(ids.paperKey))};`);
 ok("result->>'duplicate'='true' AND result->>'certificateId'=receipt->>'certificateId'",'attempt recovery retrieves the exact committed receipt');
 rejectCall(call(3,'attempt','qa_ctx','%2$L'),[q(randomUUID())],'NOT_FOUND','unknown attempt is not fabricated');
 rejectCall(call(3,'download','qa_ctx','%2$L::uuid'),["receipt->>'certificateId'"],'NOT_FOUND','paper declaration cannot be downloaded as a document');
 exec(`result:=${call(3,'download','c',"(legacy_receipt->>'certificateId')::uuid")};`);
 ok(`result->>'version'='family-schooling-download.v3' AND result->>'sha256'=${q(pdf.sha256)} AND result->>'contentBase64'=${q(pdf.contentBase64)}`,'legacy PDF download retains the exact original bytes');
 exec(`payload:=paper_payload||jsonb_build_object('expectedCertificateId',receipt->>'certificateId','evidenceMode','pdf','paperReference',NULL)||${j(pdf)};`);
 badRegister('payload','STORAGE_FULL','PDF upload still enforces quota while paper remains allowed');
 exec(`UPDATE school_certificate_storage_policy SET pdf_quota_bytes=8388608 WHERE singleton;
 pdf_receipt:=${register('payload',q(ids.pdfKey))};`);
 ok("pdf_receipt->>'duplicate'='false' AND (SELECT count(*)=1 FROM school_certificate_blob)",'PDF version reuses identical tenant blob through the real storage reservation');
 exec(`result:=${history()};`);
 ok("result->>'total'='3' AND result#>>'{rows,0,id}'=pdf_receipt->>'certificateId' AND result#>>'{rows,0,supersedesId}'=receipt->>'certificateId' AND result#>>'{rows,1,id}'=receipt->>'certificateId'",'replacement is append-only and history order preserves the chain');
 exec(`result:=${call(3,'download','c',"(pdf_receipt->>'certificateId')::uuid")};`);
 ok(`result->>'sha256'=${q(pdf.sha256)} AND result->>'contentBase64'=${q(pdf.contentBase64)}`,'new PDF download verifies tenant blob hash and bytes');
 badRegister('paper_payload','REVISION_CONFLICT','another key cannot overwrite a newer revision');
 exec(`result:=${register('paper_payload',q(ids.paperKey))};`);
 ok("result->>'certificateId'=receipt->>'certificateId' AND result->>'duplicate'='true'",'old successful attempt remains recoverable after a later revision');
 // Privileges are rechecked from actual IAM/session rows on every call.
 exec(`result:=${latest('reader')};`);
 ok("result->>'canRegister'='false'",'read-only operator can consult evidence without gaining record permission');
 badRegister('payload','CAPABILITY_REQUIRED','read-only membership cannot register','reader');
 rejectCall(call(3,'attempt','qa_ctx','%2$L'),[q(ids.paperKey)],'CAPABILITY_REQUIRED','attempt recovery also requires record permission','reader');
 rejectCall(history('qa_ctx','%2$L::uuid',"'grh'",'%3$L','%4$L'),[q(ids.contract),q(family),'token'],'NOT_FOUND','foreign tenant cannot read family history','outsider');
 rejectCall(call(3,'download','qa_ctx','%2$L::uuid'),["pdf_receipt->>'certificateId'"],'NOT_FOUND','foreign tenant cannot download record bytes','outsider');
 rejectCall(call(3,'attempt','qa_ctx','%2$L'),[q(ids.paperKey)],'NOT_FOUND','foreign tenant cannot recover another operator attempt','outsider');
 badRegister('payload','NOT_FOUND','foreign tenant cannot register against this contract','outsider');
 badRegister(`payload||jsonb_build_object('contractId',${q(ids.otherContract)})`,'NOT_FOUND','same-tenant wrong contract cannot capture another child evidence');
 badRegister("payload||jsonb_build_object('identityToken',repeat('0',64))",'IDENTITY_CHANGED','stale identity token rejected');
 rejectCall(latest('qa_ctx'),[],'SESSION_INVALID','stale session version is rejected',"c||'{\"version\":2}'");
 for(const [mutation,undo,error,label] of [
  [`UPDATE tenant_identity_session SET auth_level='password' WHERE id='${ids.writerSession}'`,`UPDATE tenant_identity_session SET auth_level='mfa' WHERE id='${ids.writerSession}'`,'SESSION_INVALID','MFA is required by actual session assertion'],
  [`UPDATE tenant_identity_session SET status='revoked' WHERE id='${ids.writerSession}'`,`UPDATE tenant_identity_session SET status='active' WHERE id='${ids.writerSession}'`,'SESSION_INVALID','session revocation immediately blocks reads'],
  [`UPDATE tenant_identity_policy SET certified_release_sha=repeat('0',40) WHERE tenant_id='${ids.tenant}'`,`UPDATE tenant_identity_policy SET certified_release_sha='${release}' WHERE tenant_id='${ids.tenant}'`,'RELEASE_NOT_CERTIFIED','uncertified release cannot read schooling data'],
  [`UPDATE platform_tenant_source_binding SET verified=false WHERE id='${ids.binding}'`,`UPDATE platform_tenant_source_binding SET verified=true WHERE id='${ids.binding}'`,'SOURCE_BINDING_REQUIRED','unverified source binding fails closed'],
  [`DELETE FROM capabilities WHERE membership_id='${ids.writer}' AND capability_key='workforce.employee.read'`,`INSERT INTO capabilities VALUES('${ids.writer}','workforce.employee.read')`,'CAPABILITY_REQUIRED','read capability revocation is checked live'],
 ]){exec(mutation+';');rejectCall(latest('qa_ctx'),[],error,label);exec(undo+';');}
 exec(`DELETE FROM capabilities WHERE membership_id=${q(ids.writer)} AND capability_key='employee.record.propose';`);
 badRegister('payload','CAPABILITY_REQUIRED','write capability revocation is checked live');
 exec(`INSERT INTO capabilities VALUES(${q(ids.writer)},'employee.record.propose');
 payload:=paper_payload||jsonb_build_object('expectedCertificateId',pdf_receipt->>'certificateId');`);
 for(const [mutation,error,label] of [
  ["payload-'course'",'INVALID_PAYLOAD','missing field rejected'],["payload||'{\"recordedBy\":\"forged@example.invalid\"}'",'INVALID_PAYLOAD','client cannot choose recording actor'],
  ["payload||'{\"reason\":null}'",'INVALID_PAYLOAD','administrative reason is required'],["payload||'{\"reason\":\"<forged>\"}'",'INVALID_PAYLOAD','markup is rejected'],
  ["payload||'{\"schoolYear\":\"2026\"}'",'INVALID_PAYLOAD','year requires numeric JSON type'],["payload||'{\"schoolYear\":2101}'",'INVALID_PAYLOAD','year range bounded'],
  ["payload||'{\"presentedOn\":null}'",'DATES_INVALID','presentation date required'],["payload||'{\"issuedOn\":\"2026-02-30\"}'",'DATES_INVALID','invalid calendar date rejected'],
  ["payload||'{\"presentedOn\":\"2026-3-02\"}'",'DATES_INVALID','date format canonical'],["payload||'{\"filename\":\"fake.pdf\"}'",'INVALID_PAYLOAD','paper mode cannot claim a PDF filename'],
  ["payload||'{\"paperReference\":null}'",'INVALID_PAYLOAD','paper mode requires an accountable location reference'],["'null'::jsonb",'INVALID_PAYLOAD','JSON null rejected at SQL boundary'],
  ["payload||jsonb_build_object('evidenceMode','pdf','paperReference',NULL,'filename','evidence.pdf','contentBase64','bm90LXBkZi1ieXRlcw==','sha256',repeat('0',64))",'PDF_INVALID','SQL independently rejects non-PDF bytes'],
 ])badRegister(mutation,error,label);
 badRegister('payload','IDEMPOTENCY_KEY_INVALID','non-UUID idempotency key rejected','c',"'invalid-key'");
 ok('(SELECT count(*)=2 FROM school_certificate_record) AND (SELECT count(*)=1 FROM school_certificate)','failed validation leaves all existing versions intact');
 // Use the real owned-family writer before testing new records for that source.
 exec(`subject:=employee_family_subject_v1(ctx,${q(ids.contract)}::uuid);
 own_receipt:=employee_family_declare_v1(${args('c')},jsonb_build_object('contractId',${q(ids.contract)},'contractIdentityToken',subject->>'identityToken','familyName','Hija declarada de ensayo','birthDate','2014-04-03','dni',NULL,'validFrom','2026-03-01','validTo',NULL),${q(randomUUID())});
 own_payload:=paper_payload||jsonb_build_object('familyRef',own_receipt->'familyRef','identityToken',own_receipt->>'identityToken','expectedCertificateId',NULL);
 own_record:=${register('own_payload',q(randomUUID()))};`);
 ok("own_record->>'duplicate'='false' AND (SELECT family_kind='own' AND family_id=own_receipt#>>'{familyRef,id}' FROM school_certificate_record WHERE id=(own_record->>'certificateId')::uuid)",'real own-family declaration accepts a scoped paper record');
 exec(`result:=${history('c',q(ids.contract)+'::uuid',"'own'","own_receipt#>>'{familyRef,id}'","own_receipt->>'identityToken'")};`);
 ok("result->>'total'='1' AND result#>>'{rows,0,id}'=own_record->>'certificateId'",'own history is distinct from the legacy GRH identity');
 // A later imported collision is a source condition, never a merge by name.
 exec(`INSERT INTO grh_family VALUES(910000000000000005,101,'QA-1','Hija declarada de ensayo','2014-04-03',NULL,NULL,NULL,91001,'2');`);
 badRegister("own_payload||jsonb_build_object('expectedCertificateId',own_record->>'certificateId')",'IDENTITY_REVIEW_REQUIRED','overlap with refreshed GRH identity blocks new declarations');
 exec(`DELETE FROM grh_family WHERE family_id=910000000000000005;
 UPDATE grh_family SET nombre='Identidad reemplazada' WHERE family_id=${family};`);
 rejectCall(history('qa_ctx','%2$L::uuid',"'grh'",'%3$L','%4$L'),[q(ids.contract),q(family),'token'],'IDENTITY_CHANGED','recycled source family id cannot expose old history');
 rejectCall(call(3,'download','qa_ctx','%2$L::uuid'),["pdf_receipt->>'certificateId'"],'IDENTITY_CHANGED','changed source identity cannot download old record');
 rejectCall(call(3,'attempt','qa_ctx','%2$L'),[q(ids.paperKey)],'IDENTITY_CHANGED','attempt recovery revalidates current identity');
 badRegister('paper_payload','IDENTITY_CHANGED','idempotent replay cannot bypass changed source identity','c',q(ids.paperKey));
 exec(`UPDATE grh_family SET nombre='Hija de ensayo' WHERE family_id=${family};
 UPDATE source_import_batch SET legacy_import_run_id=91003,source_cutoff='2026-09-11T00:00:00Z' WHERE id=${q(ids.batch)};
 UPDATE grh_family SET import_run_id=91003 WHERE company_id=101;
 UPDATE grh_catalog_rows SET import_run_id=91003 WHERE import_run_id=91001;
 result:=${history()};`);
 ok("result->>'total'='3' AND result#>>'{rows,2,id}'=legacy_receipt->>'certificateId'",'equivalent refresh preserves exact historical records without copying them');
 exec(`UPDATE source_import_batch SET legacy_import_run_id=91001,source_cutoff='2026-09-10T00:00:00Z' WHERE id=${q(ids.batch)};
 UPDATE grh_family SET import_run_id=91001 WHERE company_id=101;
 UPDATE grh_catalog_rows SET import_run_id=91001 WHERE import_run_id=91003;`);
 ok('(SELECT md5(jsonb_agg(to_jsonb(g) ORDER BY family_id)::text)=source_before FROM grh_family g)','real administrative writers leave imported municipal source rows unchanged');
 for(const table of ['school_certificate_record','school_certificate_record_event']){
  for(const mutation of [`UPDATE ${table} SET tenant_id=tenant_id`,`DELETE FROM ${table}`,`TRUNCATE ${table==='school_certificate_record'?'school_certificate_record,school_certificate_record_event':table}`])rejects(q(mutation),'SCHOOL_CERTIFICATE_IMMUTABLE',`${table} blocks ${mutation.split(' ')[0]}`);
  ok(`NOT has_table_privilege('municontrol_actions_runtime_app',${q(schema+'.'+table)},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')`,`${table} denies all direct runtime table access`);
  ok(`(SELECT relrowsecurity FROM pg_class WHERE oid=${q(schema+'.'+table)}::regclass)`,`${table} enables row security`);
 }
 for(const signature of ['school_certificate_family_v3(jsonb,uuid,text,text,text,boolean)','school_certificate_records_v3(jsonb,jsonb)','school_certificate_date_v3(text,boolean)'])ok(`NOT has_function_privilege('municontrol_actions_runtime_app',${q(schema+'.'+signature)},'EXECUTE')`,'helper stays private: '+signature);
 for(const signature of ['school_certificate_read_v3(text,uuid,integer,text,uuid,uuid,uuid)','school_certificate_register_v3(text,uuid,integer,text,uuid,uuid,jsonb,text)','school_certificate_history_v3(text,uuid,integer,text,uuid,uuid,uuid,text,text,text)','school_certificate_attempt_v3(text,uuid,integer,text,uuid,uuid,text)','school_certificate_download_v3(text,uuid,integer,text,uuid,uuid,uuid)'])ok(`has_function_privilege('municontrol_actions_runtime_app',${q(schema+'.'+signature)},'EXECUTE')`,'runtime receives only bounded facade: '+signature);
 ok(`NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE n.nspname=${q(schema)} AND p.proname LIKE 'school_certificate_%_v3' AND a.grantee=0 AND a.privilege_type='EXECUTE')`,'PUBLIC cannot execute any new facade or helper');
 ok("(SELECT count(*)=3 FROM school_certificate_record_event WHERE operation='register') AND EXISTS(SELECT 1 FROM school_certificate_record_event WHERE operation='replay') AND EXISTS(SELECT 1 FROM school_certificate_record_event WHERE operation='attempt') AND EXISTS(SELECT 1 FROM school_certificate_record_event WHERE operation='download')",'successful actions retain immutable audit receipts');
 // Populate only the private CI fixture to reach the real bounded-history edge.
 const recordColumns=['tenant_id','source_binding_id','contract_id','person_id','source_batch_id','source_database','company_id','source_legajo','family_kind','family_id','identity_token','identity_snapshot','source_cutoff','institution','education_level','course','school_year','issued_on','presented_on','expires_on','evidence_mode','paper_reference','filename','blob_sha256','reason','recorded_by','recorded_by_membership_id','recorded_by_session_id','request_sha256'];
 exec(`INSERT INTO school_certificate_record(${recordColumns.join(',')},idempotency_key,supersedes_id)
 SELECT ${recordColumns.map(name=>'s.'+name).join(',')},gen_random_uuid()::text,s.id
 FROM school_certificate_record s CROSS JOIN generate_series(1,4999) g WHERE s.id=(own_record->>'certificateId')::uuid;
 result:=${history('c',q(ids.contract)+'::uuid',"'own'","own_receipt#>>'{familyRef,id}'","own_receipt->>'identityToken'")};`);
 ok("result->>'total'='5000' AND jsonb_array_length(result->'rows')=5000",'maximum supported history is returned completely without truncation');
 badRegister("own_payload||jsonb_build_object('expectedCertificateId',result#>>'{rows,0,id}')",'ROW_LIMIT','new record cannot make family history unreadable');
 ok('(SELECT count(*)=5002 FROM school_certificate_record)','capacity failure does not append a partial version');
 exec(`INSERT INTO school_certificate_record(${recordColumns.join(',')},idempotency_key,supersedes_id,recorded_at)
 SELECT ${recordColumns.map(name=>'s.'+name).join(',')},gen_random_uuid()::text,(pdf_receipt->>'certificateId')::uuid,clock_timestamp()+interval '1 hour'
 FROM school_certificate_record s WHERE s.id=(receipt->>'certificateId')::uuid RETURNING id,recorded_at INTO future_id,future_recorded_at;
 payload:=paper_payload||jsonb_build_object('expectedCertificateId',future_id,'institution',NULL,'educationLevel',NULL,'course',NULL,'schoolYear',NULL,'issuedOn',NULL,'expiresOn',NULL);
 result:=${register('payload')};`);
 ok("(SELECT recorded_at>future_recorded_at AND supersedes_id=future_id FROM school_certificate_record WHERE id=(result->>'certificateId')::uuid)",'correction remains later than its predecessor even if clock moved backwards');
 ok("(SELECT institution IS NULL AND education_level IS NULL AND course IS NULL AND school_year IS NULL AND issued_on IS NULL AND expires_on IS NULL FROM school_certificate_record WHERE id=(result->>'certificateId')::uuid)",'optional unknown school metadata remains null rather than inferred');

 const sha=createHash('sha256').update(sources['091-schooling-administrative-records.sql']).digest('hex');
 const report={ok:true,checksPassed:checks,serverMajor:Number(serverMajor),migrationSha256:sha,syntheticSchemaRolledBack:true,municipalRowsWritten:0,concurrentConnectionCheck:requireConcurrency,actualMigrations:['057','064','091'],actualSessionContext:'007 action_center_assert_tenant_read_session_v2',limitations:['IAM effective capability rows and separation-of-duties helper are synthetic; original session, membership, MFA, certified release and binding validation execute unchanged.','SQL validates storage and source identity; PDF rendering/parser validation remains an API test.']};
 const pins=`IF nullif(current_setting('neon.project_id',true),'') IS NOT NULL OR nullif(current_setting('neon.branch_id',true),'') IS NOT NULL OR current_database()<>'schooling_qa' OR current_setting('server_version_num')::int/10000<>${Number(serverMajor)} THEN RAISE EXCEPTION 'SCHOOLING_QA_LOCAL_CI_REQUIRED'; END IF;`;
 const sql=`-- Isolated schooling QA, migration SHA256 ${sha}.
 BEGIN ISOLATION LEVEL READ COMMITTED;
 SET LOCAL statement_timeout='90s';
 SET LOCAL lock_timeout='2s';
 DO $qa$
 DECLARE c jsonb:=${j(writer)}; reader jsonb:=${j(reader)}; outsider jsonb:=${j(outsider)};
 ctx jsonb; family_row jsonb; blocked_row jsonb; token text; result jsonb; payload jsonb; receipt jsonb;
 legacy_payload jsonb; legacy_receipt jsonb; paper_payload jsonb; pdf_receipt jsonb; own_receipt jsonb; own_payload jsonb; own_record jsonb; subject jsonb;
 source_before text; generation_before bigint; future_id uuid; future_recorded_at timestamptz; checks integer:=0;
 BEGIN
 ${pins}
 IF to_regclass('public.school_certificate') IS NOT NULL OR to_regclass('public.employee_family_member') IS NOT NULL THEN RAISE EXCEPTION 'SCHOOLING_QA_EMPTY_CI_DATABASE_REQUIRED'; END IF;
 IF to_regnamespace(${q(schema)}) IS NOT NULL THEN RAISE EXCEPTION 'SCHOOLING_QA_SCHEMA_EXISTS'; END IF;
 BEGIN
 CREATE SCHEMA ${schema};
 SET LOCAL search_path=${schema},pg_catalog,public,pg_temp;
 ${tables}
 ${fixtures}
 ${statements.join('\n')}
 RAISE EXCEPTION USING ERRCODE='P0910',MESSAGE='SCHOOLING_QA_ROLLBACK_SUCCESS';
 EXCEPTION WHEN SQLSTATE 'P0910' THEN NULL;
 END;
 IF to_regnamespace(${q(schema)}) IS NOT NULL OR checks<>${checks} THEN RAISE EXCEPTION 'SCHOOLING_QA_NOT_ROLLED_BACK'; END IF;
 PERFORM set_config('mc.schooling_qa_report',${j(report)}::text,true);
 END $qa$;
 SELECT current_setting('mc.schooling_qa_report')::jsonb AS evidence;
 ROLLBACK;
 `;
 assert.ok(!/INSERT\s+INTO\s+public\./i.test(sql),'Synthetic public writes prohibited');
 const lockSql=`-- A second connection holds the actual family-key advisory lock without rows or schemas.
 BEGIN;
 SET LOCAL idle_in_transaction_session_timeout='60s';
 DO $pins$ BEGIN ${pins} END $pins$;
 SELECT pg_advisory_xact_lock(${lockKey});
 SELECT 'SCHOOLING_QA_LOCK_READY' AS readiness;
 SELECT pg_sleep(45);
 ROLLBACK;
 `;
 return {sql,lockSql,report,schema,ids};
}

function main(){
 const args={};
 for(const arg of process.argv.slice(2)){
  if(arg==='--help'){console.log('node scripts/verify-schooling-records-sql.mjs --ci --expected-major=17 --write-sql=PATH [--require-concurrency --write-lock-sql=LOCK_PATH]\nCI prerequisites: disposable empty database schooling_qa; CREATE EXTENSION pgcrypto; CREATE ROLE municontrol_actions_runtime_app;\nExecute generated output with psql -v ON_ERROR_STOP=1 -f PATH. For concurrency, start the lock SQL in a second psql connection first; wait for SCHOOLING_QA_LOCK_READY, then immediately run the main SQL. Stop or await the blocker after main completes. Both transactions roll back. No database calls are made by this generator.');return;}
  if(arg==='--ci'){args.ci=true;continue;}
  if(arg==='--require-concurrency'){args.requireConcurrency=true;continue;}
  const match=/^--(expected-major|write-sql|write-lock-sql)=(.+)$/.exec(arg);assert.ok(match,'Unknown or incomplete argument');assert.equal(args[match[1]],undefined,'Duplicate argument');args[match[1]]=match[2];
 }
 assert.equal(args.ci,true,'Only --ci generation is supported; no Neon execution');assert.ok(args['write-sql'],'Explicit output path required');
 assert.ok(!args.requireConcurrency||args['write-lock-sql'],'Concurrency requires --write-lock-sql for a second connection');
 const test=buildSchoolingQa({serverMajor:args['expected-major'],requireConcurrency:Boolean(args.requireConcurrency)});
 const outputs=[['write-sql',test.sql],['write-lock-sql',test.lockSql]].filter(([key])=>args[key]).map(([key,contents])=>({key,contents,output:path.resolve(args[key])}));
 assert.equal(new Set(outputs.map(item=>item.output)).size,outputs.length,'Output paths must differ');
 for(const {output} of outputs)assert.ok(!fs.existsSync(output),'Output exists; choose a new path');
 for(const {output,contents} of outputs){fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,contents,{flag:'wx'});}
 console.log(JSON.stringify({generated:true,databaseExecuted:false,sqlPath:path.resolve(args['write-sql']),lockSqlPath:args['write-lock-sql']?path.resolve(args['write-lock-sql']):null,checksPlanned:test.report.checksPassed,migrationSha256:test.report.migrationSha256,concurrentConnectionCheckPlanned:test.report.concurrentConnectionCheck}));
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{main();}catch(error){console.error(JSON.stringify({ok:false,message:error.message}));process.exitCode=1;}
