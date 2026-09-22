// Offline generator. Real 067 creation, 007/026 authorization and 092/093 writers;
// every synthetic row and schema is rolled back in disposable local PostgreSQL.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildFixedNoveltiesQa} from './verify-payroll-fixed-novelties-sql.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'scripts/migrations');
const q=x=>"'"+String(x).replaceAll("'","''")+"'";
const j=x=>q(JSON.stringify(x))+'::jsonb';
const sha=x=>createHash('sha256').update(x).digest('hex');
function original(file,name){
 const s=fs.readFileSync(path.join(dir,file),'utf8');
 const re=new RegExp('CREATE OR REPLACE FUNCTION (?:public\\.)?'+name+'\\s*\\(','g');
 const m=re.exec(s);assert.ok(m,'Missing original function '+name);
 const a=s.indexOf('$$',m.index),b=s.indexOf('$$',a+2),e=s.indexOf(';',b+2);
 assert.ok(a>m.index&&b>a&&e>b);return s.slice(m.index,e+1);
}
export function buildNativeFixedQa({serverMajor,requireConcurrency=false}){
 const base=buildFixedNoveltiesQa({serverMajor,requireConcurrency});
 const {schema,ids}=base;
 const native=fs.readFileSync(path.join(dir,'067-native-employee-registration.sql'),'utf8');
 const migration=fs.readFileSync(path.join(dir,'093-native-fixed-novelties.sql'),'utf8');
 const relocate=s=>s.replaceAll('public.',schema+'.').replaceAll(schema+'.digest(','public.digest(')
  .replaceAll("'public'::regnamespace",q(schema)+'::regnamespace')
  .replace(/SET search_path\s*=\s*(?:pg_catalog,\s*)?public,\s*pg_temp/gi,`SET search_path=pg_catalog,${schema},public,pg_temp`);
 const originals=[['002-canonical-integration.sql','normalize_digits'],['002-canonical-integration.sql','is_valid_cuil'],['002-canonical-integration.sql','reject_immutable_source_change'],['002-canonical-integration.sql','validate_source_batch_system'],['007-action-center-read-facades.sql','action_center_assert_tenant_read_session_v2'],['007-action-center-read-facades.sql','action_center_context_has_capability']].map(([file,name])=>({file,name,sql:original(file,name)}));
 const setup=`
 ALTER TABLE internal_users ADD COLUMN display_name text;
 ALTER TABLE person_identity ADD COLUMN dni text,ADD COLUMN cuil text UNIQUE,ADD COLUMN birth_date date,ADD COLUMN sex_code text,ADD COLUMN identity_state text DEFAULT 'active';
 ALTER TABLE source_import_batch ADD COLUMN recorded_at timestamptz DEFAULT clock_timestamp();
 ALTER TABLE employment_contract ADD COLUMN start_date date DEFAULT DATE '2020-01-01',ADD COLUMN end_date date,ADD COLUMN agreement_code text,ADD COLUMN category_code text,ADD COLUMN organization_unit_source_id text,ADD COLUMN sector_source_id text,ADD COLUMN source_payload jsonb DEFAULT '{}';
 ALTER TABLE employment_contract ADD CONSTRAINT employment_contract_grh_authority_ck CHECK(source_system='GRH');
 CREATE TABLE tenant_action_area_scope(id uuid,capability_key text,scope_level text,company_id bigint,organization_unit_source_id text,sector_source_id text,membership_id uuid,tenant_id uuid,source_binding_id uuid,active boolean);
 CREATE TABLE grh_employees(company_id bigint,legajo text);
 CREATE TABLE grh_catalog_rows(import_run_id bigint,catalog text,source_key text,label text,source_payload jsonb);
 CREATE TABLE iam_role(role_key text,scope_kind text);
 CREATE TABLE iam_role_capability(role_key text,capability_key text);
 ${originals.map(x=>relocate(x.sql)).join('\n')}
 CREATE TRIGGER employment_contract_batch_system BEFORE INSERT OR UPDATE ON employment_contract FOR EACH ROW EXECUTE FUNCTION validate_source_batch_system();
 INSERT INTO grh_catalog_rows VALUES
 (92001,'agreements','1','Convenio de ensayo','{"sourceKey":{"agreementCode":"1"}}'),
 (92001,'categories','1','Categoría de ensayo','{"sourceKey":{"agreementCode":"1","categoryCode":"1"}}'),
 (92001,'organizations','10','Organización de ensayo','{"activeSourceValue":"1","sourceKey":{"organizationId":"10"}}'),
 (92001,'sectors','20','Sector de ensayo','{"sourceKey":{"sectorCode":"20"}}');
 INSERT INTO capabilities SELECT id,c FROM tenant_membership CROSS JOIN unnest(ARRAY['actions.read','workforce.employee.read','employee.record.create']) c;
 EXECUTE ${q(relocate(native))};
 `;
 const statements=[];let checks=0;
 const exec=s=>statements.push(s);
 const ok=(s,label)=>{statements.push(`PERFORM qa_assert((${s}),${q(label)}); checks:=checks+1;`);checks++;};
 const rejects=(s,error,label)=>ok(`qa_rejects(${s},${q(error)})`,label);
 const rejectCall=(name,args,error,label,actor='maker')=>rejects(`format(${q('SELECT payroll_fixed_registry_'+name+'_v1(%1$L::jsonb'+args.map((x,i)=>`,%${i+2}$L${x[1]??''}`).join('')+')')},${[actor,...args.map(x=>x[0])].join(',')})`,'PAYROLL_FIXED_'+error,label);
 const fault=(mutation,body)=>exec(`BEGIN ${mutation} ${body} RAISE EXCEPTION USING ERRCODE='P0932',MESSAGE='RESTORE_NATIVE_FAULT'; EXCEPTION WHEN SQLSTATE 'P0932' THEN NULL; END;`);
 const vals={conceptSourceId:'80',costCenterSourceId:null,payrollType:'monthly',quantityDecimal:'1.5',amountCents:null,forced:false,forcedReason:null,legalInstrument:'Alta administrativa sintética',validFrom:'2026-09-01',validTo:null};
 const draft={agreementCode:'1',birthDate:'1990-01-01',categoryCode:'1',cuil:'',dni:'99000011',fullName:'Agente nativo de ensayo',jobTitle:'Administración',legajo:'19001',legalReference:'Resolución sintética QA',organizationId:'10',sectorCode:'20',sexCode:'X',startDate:'2026-09-01'};
 const first='20'+draft.dni;let rem=11-[5,4,3,2,7,6,5,4,3,2].reduce((n,w,i)=>n+Number(first[i])*w,0)%11;draft.cuil=first+(rem===11?0:rem===10?9:rem);
 // A real GRH proposal predates 093: its persisted subject must be unchanged.
 exec(`grh_subject:=payroll_fixed_registry_employee_v1(maker,'903')->'subject';
 grh_payload:=jsonb_build_object('recordId',NULL,'expectedVersion',0,'contractId',grh_subject->>'contractId','legajo','903','identityToken',grh_subject->>'identityToken','operation','set','values',${j(vals)},'reason','Declaración previa a migración');
 grh_receipt:=payroll_fixed_registry_propose_v1(maker,grh_payload,grh_key);
 old_legacy:=qa_legacy_fingerprint();
 SELECT md5(jsonb_agg(to_jsonb(n) ORDER BY id)::text) INTO old_roots FROM payroll_fixed_novelty n;
 EXECUTE ${q(relocate(migration))};
 SELECT md5(string_agg(pg_get_functiondef(p.oid),E'\n' ORDER BY p.proname,p.oid)) INTO definitions_before FROM pg_proc p WHERE p.pronamespace=${q(schema)}::regnamespace AND p.proname LIKE 'payroll_fixed_registry_%';
 EXECUTE ${q(relocate(migration))};`);
 ok(`definitions_before=(SELECT md5(string_agg(pg_get_functiondef(p.oid),E'\n' ORDER BY p.proname,p.oid)) FROM pg_proc p WHERE p.pronamespace=${q(schema)}::regnamespace AND p.proname LIKE 'payroll_fixed_registry_%')`,'093 reapplication preserves exact function definitions');
 for(const name of ['subject','identity_current','propose','review','event_identity','list','export','subject_by_contract','native_dates','employee_by_contract']){
  const start=statements.length;
  rejects(q(relocate(migration)),'PAYROLL_FIXED_NATIVE_PREREQUISITE','093 rejects altered '+name+' even when its migration marker is retained');
  const assertion=statements.splice(start).join('\n');
  fault(`SELECT pg_get_functiondef(p.oid) INTO damaged_definition FROM pg_proc p WHERE p.pronamespace=${q(schema)}::regnamespace AND p.proname=${q('payroll_fixed_registry_'+name+'_v1')}; EXECUTE replace(damaged_definition,'AS $function$',E'AS $function$\n-- owner QA drift');`,assertion);
 }
 ok(`old_legacy=qa_legacy_fingerprint() AND old_roots=(SELECT md5(jsonb_agg(to_jsonb(n) ORDER BY id)::text) FROM payroll_fixed_novelty n)`,'093 changes no legacy functions, IAM grants or existing fixed roots');
 ok(`payroll_fixed_registry_employee_by_contract_v1(maker,${q(ids.targetContract)}::uuid)->'subject'=grh_subject AND (SELECT count(*)=5 FROM jsonb_object_keys(grh_subject))`,'GRH five-key subject and token remain identical across 093');
 exec(`grh_review:=jsonb_build_object('recordId',grh_receipt->>'recordId','proposalId',grh_receipt->>'proposalId','expectedVersion',1,'decision','approve','reason','Revisión posterior a migración');
 result:=payroll_fixed_registry_review_v1(checker,grh_review,gen_random_uuid());`);
 ok("result->>'recordVersion'='2'",'a GRH proposal created before 093 can be approved afterwards');
 ok("payroll_fixed_registry_propose_v1(maker,grh_payload,grh_key)->>'duplicate'='true'",'pre-093 GRH proposal replay retains its original receipt after 093');
 exec(`catalog_version:=native_employee_bootstrap_v1(maker)#>>'{catalog,version}';
 SELECT count(*) INTO batches_before FROM source_import_batch;
 native_receipt:=native_employee_create_v1(maker,${j(draft)},catalog_version,native_key);
 SET CONSTRAINTS ALL IMMEDIATE;
 SET CONSTRAINTS ALL DEFERRED;
 native_contract:=(native_receipt->>'contractId')::uuid;
 native_subject:=payroll_fixed_registry_employee_by_contract_v1(maker,native_contract)->'subject';`);
 ok("native_receipt->>'origin'='MUNICONTROL' AND native_receipt->>'accountCreated'='false' AND native_receipt->>'payrollCalculated'='false'",'real 067 writer creates native contract without account or payroll');
 ok(`(SELECT source_system='MUNICONTROL' AND source_batch_id IS NULL AND tenant_id=${q(ids.tenant)}::uuid FROM employment_contract WHERE id=native_contract) AND (SELECT count(*) FROM source_import_batch)=batches_before`,'native creation adds no invented GRH source batch');
 ok(`(SELECT r.tenant_id=${q(ids.tenant)}::uuid AND r.source_binding_id=${q(ids.binding)}::uuid AND r.person_id=c.person_id FROM native_employee_registration r JOIN employment_contract c ON c.id=r.contract_id WHERE c.id=native_contract)`,'native registration retains canonical person, contract and real certified binding');
 ok("(SELECT count(*)=8 FROM jsonb_object_keys(native_subject)) AND native_subject->>'origin'='MUNICONTROL' AND native_subject->'sourceCutoff'='null'::jsonb AND native_subject->>'registrationId'=native_receipt->>'registrationId' AND (native_subject->>'registeredAt')::timestamptz=(native_receipt->>'createdAt')::timestamptz",'native eight-key subject distinguishes registration time from imported cutoff');
 ok("length(native_subject->>'identityToken')=64 AND native_subject->>'contractId'=native_contract::text AND native_subject->>'legajo'='19001'",'native identity token binds the selected canonical UUID');
 rejectCall('employee',[ ["'19001'",''] ],'LEGAJO_NOT_FOUND','GRH legajo lookup never silently resolves a native contract');
 rejectCall('employee_by_contract',[[ 'native_contract','::uuid' ]],'NOT_FOUND','foreign tenant cannot read a native UUID','outsider');
 rejectCall('employee_by_contract',[[q(ids.foreignContract),'::uuid']],'NOT_FOUND','foreign GRH contract cannot be selected by UUID');
 exec(`np:=jsonb_build_object('recordId',NULL,'expectedVersion',0,'contractId',native_contract,'legajo','19001','identityToken',native_subject->>'identityToken','operation','set','values',${j(vals)},'reason','Declaración nativa de ensayo');`);
 rejectCall('propose',[["np||jsonb_build_object('values',np->'values'||jsonb_build_object('validFrom','2026-08-31'))",'::jsonb'],['gen_random_uuid()','::uuid']],'DATES_INVALID','native fixed declaration cannot start before native employment');
 rejectCall('propose',[["np||jsonb_build_object('legajo','903')",'::jsonb'],['gen_random_uuid()','::uuid']],'IDENTITY_CHANGED','payload legajo cannot redirect a native canonical UUID');
 rejectCall('propose',[["np||jsonb_build_object('identityToken',repeat('a',64))",'::jsonb'],['gen_random_uuid()','::uuid']],'IDENTITY_CHANGED','stale or fabricated native identity token is rejected');
 rejectCall('propose',[['np','::jsonb'],['gen_random_uuid()','::uuid']],'EMPLOYMENT_REQUIRED','native target does not authorize an unlinked operator','unlinked');
 exec(`nr:=payroll_fixed_registry_propose_v1(maker,np,proposal_key);
 nv:=jsonb_build_object('recordId',nr->>'recordId','proposalId',nr->>'proposalId','expectedVersion',1,'decision','approve','reason','Aprobación nativa de ensayo');`);
 ok("nr->>'recordVersion'='1' AND (payroll_fixed_registry_detail_v1(checker,(nr->>'recordId')::uuid)#>'{record,subject}')=native_subject",'real native proposal persists exact provenance and a pending event');
 ok("payroll_fixed_registry_propose_v1(maker,np,proposal_key)->>'duplicate'='true' AND payroll_fixed_registry_attempt_v1(maker,'propose',proposal_key)->>'recordId'=nr->>'recordId'",'native exact retry and lost acknowledgement recovery are stable');
 rejectCall('propose',[["np||jsonb_build_object('reason','Otro cuerpo de ensayo')",'::jsonb'],['proposal_key','::uuid']],'IDEMPOTENCY_REUSE','native attempt cannot reuse a key for a changed payload');
 rejectCall('review',[['nv','::jsonb'],['gen_random_uuid()','::uuid']],'MAKER_CHECKER_REQUIRED','same membership cannot approve a native proposal');
 rejectCall('review',[['nv','::jsonb'],['gen_random_uuid()','::uuid']],'MAKER_CHECKER_REQUIRED','another login for the same person cannot approve native proposal','same_person');
 rejectCall('review',[["nv||'{\"expectedVersion\":3}'::jsonb",'::jsonb'],['gen_random_uuid()','::uuid']],'VERSION_CONFLICT','native approval checks exact version','checker');
 exec(`result:=payroll_fixed_registry_review_v1(checker,nv,review_key);
 result:=payroll_fixed_registry_list_v1(maker,DATE '2026-09-01');snapshot_native:=result->>'snapshotToken';
 result:=payroll_fixed_registry_export_v1(maker,DATE '2026-09-01',snapshot_native);`);
 ok("result->>'total'='2' AND EXISTS(SELECT 1 FROM jsonb_array_elements(result->'rows') r WHERE r->>'recordId'=nr->>'recordId' AND r->'subject'=native_subject)",'export combines approved native and GRH entries without changing provenance');
 ok("result#>>'{effects,payrollCalculated}'='false' AND result#>>'{effects,payrollPosted}'='false' AND result#>>'{effects,grhMutation}'='false'",'native export has no payroll, accounting or GRH side effects');
 exec(`next_payload:=np||jsonb_build_object('recordId',nr->>'recordId','expectedVersion',2,'reason','Corrección nativa de ensayo','values',np->'values'||jsonb_build_object('quantityDecimal','2'));
 next_receipt:=payroll_fixed_registry_propose_v1(maker,next_payload,gen_random_uuid());`);
 rejectCall('export',[["DATE '2026-09-01'",'::date'],['snapshot_native','']],'SNAPSHOT_CHANGED','native pending correction invalidates prepared export snapshot');
 exec(`result:=payroll_fixed_registry_review_v1(checker,jsonb_build_object('recordId',nr->>'recordId','proposalId',next_receipt->>'proposalId','expectedVersion',3,'decision','reject','reason','Rechazo nativo de ensayo'),gen_random_uuid());
 result:=payroll_fixed_registry_detail_v1(maker,(nr->>'recordId')::uuid);`);
 ok("result#>>'{record,version}'='4' AND result#>>'{record,approved,values,quantityDecimal}'='1.5' AND jsonb_array_length(result->'history')=2",'rejected native correction preserves approved value and immutable history');
 rejects(`format('UPDATE employment_contract SET start_date=DATE ''2026-08-01'' WHERE id=%L::uuid',native_contract)`,'NATIVE_EMPLOYEE_IMMUTABLE','native employment dates cannot be silently rewritten');
 rejects(`format('UPDATE person_identity SET full_name=''Otra identidad'' WHERE id=(SELECT person_id FROM employment_contract WHERE id=%L::uuid)',native_contract)`,'NATIVE_EMPLOYEE_IDENTITY_IMMUTABLE','registered native identity remains immutable');
 rejects(`format('DELETE FROM native_employee_registration WHERE contract_id=%L::uuid',native_contract)`,'native_employee_registration is append-only; DELETE is not allowed','native registration provenance cannot be deleted');
 const mutationTests=[
  [`UPDATE tenant_identity_session SET status='revoked' WHERE id=${q(ids.makerSession)}::uuid;`,'SESSION_INVALID','revoked maker session rejects native read and replay'],
  [`DELETE FROM capabilities WHERE membership_id=${q(ids.maker)}::uuid AND capability_key='payroll.fixed.prepare';`,'CAPABILITY_REQUIRED','revoked fixed permission rejects native replay'],
  [`UPDATE tenant_action_employment_link SET active=false WHERE membership_id=${q(ids.maker)}::uuid;`,'EMPLOYMENT_REQUIRED','unlinked maker cannot recover a native receipt']
 ];
 for(const [mutation,code,label] of mutationTests){
  const before=statements.length;rejectCall('propose',[['np','::jsonb'],['proposal_key','::uuid']],code,label);const assertion=statements.splice(before).join('\n');fault(mutation,assertion);
 }
 // Owner-only fault injection checks fail-closed readers even if the immutable
 // source is damaged outside the application. These changes are rolled back.
 const beforeFault=statements.length;
 exec(`result:=payroll_fixed_registry_list_v1(maker,DATE '2026-09-01');snapshot_native:=result->>'snapshotToken';`);
 ok("EXISTS(SELECT 1 FROM jsonb_array_elements(result->'rows') r WHERE r->>'id'=nr->>'recordId' AND r->>'identityCurrent'='false' AND r->>'canPropose'='false')",'changed native provenance disables row actions instead of reassigning ownership');
 rejectCall('export',[["DATE '2026-09-01'",'::date'],['snapshot_native','']],'IDENTITY_CHANGED','fresh export cannot bypass native identity drift');
 rejectCall('propose',[['np','::jsonb'],['proposal_key','::uuid']],'IDENTITY_CHANGED','native retry rechecks registration identity before returning old receipt');
 const faultAssertions=statements.splice(beforeFault).join('\n');
 fault(`ALTER TABLE employment_contract DISABLE TRIGGER employment_contract_batch_system; UPDATE employment_contract SET source_payload=jsonb_set(source_payload,'{native,registrationId}',to_jsonb(gen_random_uuid()::text)) WHERE id=native_contract; ALTER TABLE employment_contract ENABLE TRIGGER employment_contract_batch_system;`,faultAssertions);
 const beforeEnd=statements.length;
 rejectCall('propose',[["np||jsonb_build_object('identityToken',payroll_fixed_registry_employee_by_contract_v1(maker,native_contract)#>>'{subject,identityToken}')",'::jsonb'],['gen_random_uuid()','::uuid']],'DATES_INVALID','finite native employment cannot create an open-ended fixed declaration');
 rejectCall('propose',[["np||jsonb_build_object('identityToken',payroll_fixed_registry_employee_by_contract_v1(maker,native_contract)#>>'{subject,identityToken}','values',np->'values'||jsonb_build_object('validTo','2026-10-01'))",'::jsonb'],['gen_random_uuid()','::uuid']],'DATES_INVALID','native declaration cannot extend beyond the employment end date');
 exec("PERFORM payroll_fixed_registry_native_dates_v1(payroll_fixed_registry_context_v1(maker),native_contract,np->'values'||jsonb_build_object('validTo','2026-09-30'));");
 ok('true','native declaration may end exactly on the employment end date');
 const endAssertions=statements.splice(beforeEnd).join('\n');
 fault(`ALTER TABLE employment_contract DISABLE TRIGGER employment_contract_batch_system; UPDATE employment_contract SET end_date=DATE '2026-09-30' WHERE id=native_contract; ALTER TABLE employment_contract ENABLE TRIGGER employment_contract_batch_system;`,endAssertions);
 const beforeBinding=statements.length;
 rejectCall('employee_by_contract',[['native_contract','::uuid']],'IDENTITY_CHANGED','native registration in another certified binding is not reassigned');
 const bindingAssertions=statements.splice(beforeBinding).join('\n');
 fault(`INSERT INTO platform_tenant_source_binding VALUES(other_binding,${q(ids.tenant)}::uuid,'GRH',101,'qa_fixed_source',true); ALTER TABLE native_employee_registration DISABLE TRIGGER native_employee_registration_immutable; UPDATE native_employee_registration SET source_binding_id=other_binding WHERE contract_id=native_contract; SET CONSTRAINTS ALL IMMEDIATE; ALTER TABLE native_employee_registration ENABLE TRIGGER native_employee_registration_immutable;`,bindingAssertions);
 const beforeDuplicate=statements.length;
 rejectCall('employee_by_contract',[['native_contract','::uuid']],'IDENTITY_CHANGED','two active native contracts sharing the same scoped legajo fail closed');
 const duplicateAssertions=statements.splice(beforeDuplicate).join('\n');
 fault(`INSERT INTO native_employee_registration(id,tenant_id,source_binding_id,contract_id,person_id,actor_membership_id,actor_session_id,release_sha,request_key,request_sha256,catalog_sha256,legal_reference) SELECT duplicate_registration,tenant_id,source_binding_id,duplicate_contract,person_id,actor_membership_id,actor_session_id,release_sha,gen_random_uuid(),request_sha256,catalog_sha256,legal_reference FROM native_employee_registration WHERE contract_id=native_contract; INSERT INTO employment_contract(id,person_id,source_system,source_batch_id,legacy_company_id,legacy_legajo,status,start_date,tenant_id,source_payload) SELECT duplicate_contract,person_id,source_system,source_batch_id,legacy_company_id,legacy_legajo,status,start_date,tenant_id,jsonb_set(source_payload,'{native,registrationId}',to_jsonb(duplicate_registration::text)) FROM employment_contract WHERE id=native_contract;`,duplicateAssertions);
 exec(`GRANT USAGE ON SCHEMA ${schema} TO municontrol_actions_runtime_app;
 SET LOCAL ROLE municontrol_actions_runtime_app;
 result:=payroll_fixed_registry_employee_by_contract_v1(maker,native_contract);
 RESET ROLE;`);
 ok("result->'subject'=native_subject",'actual runtime role can call the new authenticated UUID facade');
 ok(`NOT has_table_privilege('municontrol_actions_runtime_app',${q(schema+'.native_employee_registration')},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AND NOT has_table_privilege('municontrol_actions_runtime_app',${q(schema+'.payroll_fixed_novelty')},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')`,'runtime has no native provenance or fixed-root direct table access');
 ok(`NOT has_function_privilege('municontrol_actions_runtime_app',${q(schema+'.payroll_fixed_registry_subject_by_contract_v1(jsonb,uuid,boolean)')},'EXECUTE') AND NOT has_function_privilege('municontrol_actions_runtime_app',${q(schema+'.payroll_fixed_registry_native_dates_v1(jsonb,uuid,jsonb)')},'EXECUTE')`,'runtime cannot bypass authenticated facade through private native helpers');
 ok(`NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.pronamespace=${q(schema)}::regnamespace AND p.proname IN ('payroll_fixed_registry_subject_by_contract_v1','payroll_fixed_registry_native_dates_v1','payroll_fixed_registry_employee_by_contract_v1') AND a.grantee=0 AND a.privilege_type='EXECUTE')`,'new functions revoke PUBLIC execution');
 ok(`(SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('native_employee_registration'::regclass,'payroll_fixed_novelty'::regclass,'payroll_fixed_novelty_event'::regclass))`,'native provenance and both fixed tables retain row-level security');
 ok(`old_legacy=qa_legacy_fingerprint() AND (SELECT count(*) FROM source_import_batch)=batches_before AND (SELECT count(*)=1 FROM native_employee_registration) AND (SELECT count(*)=4 FROM payroll_fixed_novelty_event e WHERE e.record_id=(nr->>'recordId')::uuid)`,'native cycle changes only its real registration and append-only administrative events');
 const block=`
 -- Native extension deliberately rolls back before the unchanged 092 regression.
 -- Minimal schema/IAM fixtures are declared; no writer or auth guard is stubbed.
 DECLARE native_receipt jsonb; native_subject jsonb; native_contract uuid; native_key uuid:=gen_random_uuid(); proposal_key uuid:=gen_random_uuid(); review_key uuid:=gen_random_uuid();
 catalog_version text; np jsonb; nr jsonb; nv jsonb; next_payload jsonb; next_receipt jsonb; snapshot_native text; batches_before integer; damaged_definition text;
 other_binding uuid:=gen_random_uuid(); duplicate_registration uuid:=gen_random_uuid(); duplicate_contract uuid:=gen_random_uuid();
 grh_subject jsonb; grh_payload jsonb; grh_receipt jsonb; grh_review jsonb; grh_key uuid:=gen_random_uuid(); old_roots text; old_legacy text; definitions_before text;
 BEGIN
 ${setup}
 ${statements.join('\n')}
 RAISE EXCEPTION USING ERRCODE='P0930',MESSAGE='NATIVE_FIXED_QA_RESTORE_BASELINE';
 EXCEPTION WHEN SQLSTATE 'P0930' THEN NULL;
 END;
 `;
 const report={...base.report,nativeChecksPassed:checks,checksPassed:base.report.checksPassed+checks,migration093Sha256:sha(migration),nativeWriterMigration:'067-native-employee-registration.sql',nativeWriterSha256:sha(native),originalHelpers:originals.map(({file,name,sql})=>({file,name,sha256:sha(sql)})),limitations:[...base.report.limitations,'Native extension uses original 067/007 functions with minimal canonical/catalog fixtures. Owner-only source-drift injections are explicitly rolled back. Full unchanged 092 regression runs after the native subtransaction is restored.']};
 const anchor="PERFORM qa_assert((qa_legacy_fingerprint()=legacy_before),";
 assert.equal(base.sql.split(anchor).length,2,'Unique QA insertion anchor required');
 let sql=base.sql.replace(anchor,()=>block+'\n'+anchor).replace('checks<>'+base.report.checksPassed,'checks<>'+report.checksPassed).replace(j(base.report),()=>j(report));
 assert.ok(!/INSERT\s+INTO\s+public\./i.test(sql),'Synthetic public writes prohibited');
 assert.ok(sql.includes('checks<>'+report.checksPassed));
 return {...base,sql,report};
}
function main(){
 const args={};for(const a of process.argv.slice(2)){
  if(a==='--ci'){args.ci=true;continue;}if(a==='--require-concurrency'){args.requireConcurrency=true;continue;}
  const m=/^--(expected-major|write-sql|write-lock-sql)=(.+)$/.exec(a);assert.ok(m,'Unknown or incomplete argument');assert.equal(args[m[1]],undefined);args[m[1]]=m[2];
 }
 assert.equal(args.ci,true,'Only disposable CI generation is supported');assert.ok(args['write-sql']);assert.ok(!args.requireConcurrency||args['write-lock-sql']);
 const test=buildNativeFixedQa({serverMajor:args['expected-major'],requireConcurrency:Boolean(args.requireConcurrency)});
 const outputs=[['write-sql',test.sql],['write-lock-sql',test.lockSql]].filter(([k])=>args[k]).map(([k,data])=>({output:path.resolve(args[k]),data}));
 assert.equal(new Set(outputs.map(x=>x.output)).size,outputs.length);
 for(const {output} of outputs)assert.ok(!fs.existsSync(output),'Output exists; choose a new path');
 for(const {output,data} of outputs){fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,data,{flag:'wx'});}
 console.log(JSON.stringify({generated:true,databaseExecuted:false,checksPlanned:test.report.checksPassed,nativeChecksPlanned:test.report.nativeChecksPassed,migration093Sha256:test.report.migration093Sha256}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{main();}catch(e){console.error(JSON.stringify({ok:false,message:e.message}));process.exitCode=1;}
