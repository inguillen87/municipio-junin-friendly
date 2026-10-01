// Disposable loopback PG17/18 only. Real 007/067/093/095/099/103/104, synthetic IAM/source fixtures; total rollback.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildNativeEmploymentCatalogQa} from './verify-native-employment-catalog-sql.mjs';
import {splitPostgresStatements} from './lib/sql-statements.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const q=x=>"'"+String(x).replaceAll("'","''")+"'",j=x=>q(JSON.stringify(x))+'::jsonb',sha=x=>createHash('sha256').update(x).digest('hex');
const read=f=>fs.readFileSync(path.join(root,'scripts/migrations',f),'utf8').replaceAll('\r\n','\n');
export function buildNativeEmploymentChangeQa({serverMajor,requireConcurrency=false}){
 const base=buildNativeEmploymentCatalogQa({serverMajor,requireConcurrency}),{schema,ids}=base,migration=read('104-native-employment-changes.sql');
 const relocate=s=>s.replaceAll('public.',schema+'.').replaceAll(schema+'.digest(','public.digest(')
  .replaceAll("'public'::regnamespace",q(schema)+'::regnamespace')
  .replaceAll("ARRAY['search_path=public, pg_temp']","ARRAY['search_path=pg_catalog, "+schema+", public, pg_temp']")
  .replaceAll("ARRAY['search_path=pg_catalog, public, pg_temp']","ARRAY['search_path=pg_catalog, "+schema+", public, pg_temp']")
  .replaceAll("'search_path=public, pg_temp'",q('search_path=pg_catalog, '+schema+', public, pg_temp'))
  .replaceAll("'search_path=pg_catalog, public, pg_temp'",q('search_path=pg_catalog, '+schema+', public, pg_temp'))
  .replace(/SET search_path\s*=\s*(?:pg_catalog,\s*)?public,\s*pg_temp/gi,'SET search_path=pg_catalog,'+schema+',public,pg_temp');
 const normalized=s=>s.replaceAll("replace(p.prosrc,E'\\r\\n',E'\\n')","replace(replace(p.prosrc,E'\\r\\n',E'\\n'),"+q(schema+'.')+",'public'||'.')")
  .replaceAll("replace(prosrc,E'\\r\\n',E'\\n')","replace(replace(prosrc,E'\\r\\n',E'\\n'),"+q(schema+'.')+",'public'||'.')");
 const install=q(normalized(relocate(migration))),statements=[];let checks=0;
 const exec=s=>statements.push(s),ok=(expr,label)=>{exec('PERFORM qa_assert(('+expr+'),'+q(label)+'); checks:=checks+1;');checks++;};
 const reject=(sql,error,label)=>ok('qa_rejects('+sql+','+q(error.startsWith('NATIVE_')||error.startsWith('ACTION_')?error:'NATIVE_EMPLOYMENT_CHANGE_'+error)+')',label);
 const call=(op,actor='maker',tail='')=>'native_employment_change_'+op+'_v1('+actor+(tail?','+tail:'')+')';
 const rejectWrite=(op,actor,body,key,error,label)=>reject('format('+q('SELECT '+call(op,'%1$L::jsonb','%2$L::jsonb,%3$L::uuid'))+','+[actor,body,key].join(',')+')',error,label);
 const rejectRead=(op,actor,args,error,label)=>reject('format('+q('SELECT '+call(op,'%1$L::jsonb',args.map((_,i)=>'%'+(i+2)+'$L::uuid').join(',')))+','+[actor,...args].join(',')+')',error,label);
 const fault=(mutation,body)=>exec("BEGIN "+mutation+' '+body+" RAISE EXCEPTION USING ERRCODE='P1042',MESSAGE='RESTORE_CHANGE_FAULT'; EXCEPTION WHEN SQLSTATE 'P1042' THEN NULL; END;");
 const temporary=(mutation,fn)=>{const start=statements.length;fn();fault(mutation,statements.splice(start).join('\n'));};
 const snapshot='(SELECT to_jsonb(ec) FROM employment_contract ec WHERE id=target_id)';
 const preserved="(SELECT md5(jsonb_agg(to_jsonb(ec) ORDER BY id)::text) FROM employment_contract ec WHERE id<>target_id)";
 const consumerFns=[['101-native-monthly-novelties.sql','payroll_novelty_subject_v2'],['101-native-monthly-novelties.sql','payroll_novelty_native_subject_v2'],['102-native-family-schooling.sql','employee_family_subject_v2']].map(([file,name])=>{
  const d=splitPostgresStatements(read(file)).find(s=>new RegExp('CREATE OR REPLACE FUNCTION (?:public\\.)?'+name+'\\(').test(s));assert.ok(d,name);return relocate(d)+';';});
 exec(`SET LOCAL timezone='UTC'; ALTER TABLE employment_contract ADD COLUMN IF NOT EXISTS position_source_id text, ADD COLUMN IF NOT EXISTS status_explanation text, ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT clock_timestamp(), ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT clock_timestamp();
 ${consumerFns.join('\n')}
 INSERT INTO capabilities SELECT m,k FROM (VALUES (${q(ids.maker)}::uuid,'employee.record.propose'),(${q(ids.checker)}::uuid,'employee.record.approve'),(${q(ids.samePerson)}::uuid,'employee.record.approve'),(${q(ids.unlinked)}::uuid,'employee.record.propose')) v(m,k) WHERE NOT EXISTS(SELECT 1 FROM capabilities c WHERE c.membership_id=v.m AND c.capability_key=v.k);
 target_id:=(new_receipt->>'contractId')::uuid; before_row:=${snapshot}; other_contracts:=${preserved}; old_registration:=(SELECT to_jsonb(reg_row) FROM native_employee_registration reg_row WHERE contract_id=target_id); old_person:=(SELECT to_jsonb(person_row) FROM person_identity person_row WHERE person_row.id=(before_row->>'person_id')::uuid); saved_hire:=native_employee_attempt_v1(maker,hire_key);
 EXECUTE ${install};
 catalog_body:=jsonb_build_object('baseVersion',native_employment_catalog_bootstrap_v1(maker)#>>'{catalog,version}','scopeVersion',native_employment_catalog_bootstrap_v1(maker)->>'scopeVersion','reason','Opciones sintéticas para rectificación','items',(native_employment_catalog_bootstrap_v1(maker)#>'{catalog,items}')||'[{"kind":"agreements","key":"a2","code":"2","label":"Convenio nuevo QA","agreementCode":null},{"kind":"categories","key":"c2","code":"2","label":"Categoría nueva QA","agreementCode":"2"},{"kind":"organizations","key":"o2","code":"2","label":"Sector nuevo QA","agreementCode":null},{"kind":"sectors","key":"s2","code":"2","label":"Repartición nueva QA","agreementCode":null}]'::jsonb);
 catalog_receipt:=native_employment_catalog_propose_v1(maker,catalog_body,gen_random_uuid());
 PERFORM native_employment_catalog_review_v1(checker,jsonb_build_object('proposalId',catalog_receipt->>'proposalId','scopeVersion',native_employment_catalog_bootstrap_v1(checker)->>'scopeVersion','decision','approve','reason','Aprobar opciones sintéticas independientes'),gen_random_uuid());
 change_boot:=${call('bootstrap','maker','target_id')}; original_subject:=change_boot->'subject'; before_employment:=change_boot->'employment';
 own_context:=native_employee_context_v1(maker)||jsonb_build_object('certifiedBindingId',${q(ids.binding)});
 monthly_subject:=payroll_novelty_subject_v2(own_context,target_id,false); family_subject:=employee_family_subject_v2(own_context,target_id,false);
 change_body:=jsonb_build_object('contractId',target_id,'identityToken',original_subject->>'identityToken','scopeVersion',change_boot->>'scopeVersion','baseVersion',before_employment->>'version','catalogVersion',change_boot#>>'{catalog,version}','values',jsonb_build_object('agreementCode','2','categoryCode','2','organizationId','2','sectorCode','2','jobTitle','Cargo rectificado QA'),'reason','Rectificar el encuadre registrado','legalReference','Instrumento QA 104');`);
 ok("change_boot->>'version'='native-employment-change.v1' AND original_subject->>'origin'='MUNICONTROL' AND original_subject->'sourceCutoff'='null'::jsonb AND (SELECT count(*)=8 FROM jsonb_object_keys(original_subject))",'native subject is exact093 closed shape with no invented GRH cutoff');
 ok("before_employment->>'revision'='0' AND before_employment->'appliedAt'='null'::jsonb AND change_boot#>>'{permissions,canPropose}'='true'",'initial current framing has revision zero and no invented application timestamp');
 exec("SET LOCAL timezone='America/Argentina/Buenos_Aires';");
 ok(call('bootstrap','maker','target_id')+'=change_boot', 'complete bootstrap and base hash are invariant across UTC and Argentina sessions');
 exec("SET LOCAL timezone='UTC';");
 ok("monthly_subject=original_subject AND family_subject->>'identityToken'=original_subject->>'identityToken'",'real101 and102 resolvers share exact native identity');
 rejectRead('bootstrap','outsider',['target_id'],'NOT_FOUND','foreign tenant cannot see native current framing');
 rejectRead('bootstrap','maker',[q(ids.targetContract)+'::uuid'],'NOT_FOUND','GRH contract cannot enter native rectification');
 rejectWrite('propose','reader','change_body','gen_random_uuid()','FORBIDDEN','read permission cannot prepare');
 rejectWrite('propose','unlinked','change_body','gen_random_uuid()','EMPLOYMENT_REQUIRED','writes require a currently linked actor');
 for(const [field,code]of [['identityToken','IDENTITY_CHANGED'],['scopeVersion','SCOPE_CHANGED'],['baseVersion','BASE_CHANGED'],['catalogVersion','CATALOG_CHANGED']])rejectWrite('propose','maker',"change_body||jsonb_build_object("+q(field)+",repeat('a',64))",'gen_random_uuid()',code,'stale '+field+' fails closed');
 rejectWrite('propose','maker',"change_body||jsonb_build_object('values',before_employment->'values')",'gen_random_uuid()','NO_CHANGE','no-change proposal is rejected');
 rejectWrite('propose','maker','change_body',q('00000000-0000-1000-8000-000000000000')+'::uuid','INPUT_INVALID','idempotency key requires UUIDv4');
 for(const bad of [null,[],{},'text'])rejectWrite('propose','maker',j(bad),'gen_random_uuid()','INPUT_INVALID','invalid proposal container '+JSON.stringify(bad));
 for(const [patch,label]of [["change_body||'{\"unexpected\":true}'",'extra field'],["change_body-'legalReference'",'missing instrument'],["change_body||'{\"reason\":null}'",'null reason'],["change_body||'{\"legalReference\":\"x\"}'",'short instrument'],["jsonb_set(change_body,'{values,jobTitle}',to_jsonb(repeat('x',121)))",'long job title'],["jsonb_set(change_body,'{values,jobTitle}','\"<script>\"')",'markup'],["jsonb_set(change_body,'{values,agreementCode}','1')",'numeric code'],["jsonb_set(change_body,'{values,categoryCode}','\"x\"')",'non-digit code']])rejectWrite('propose','maker',patch,'gen_random_uuid()','INPUT_INVALID','rejects '+label);
 rejectWrite('propose','maker',"jsonb_set(change_body,'{values,categoryCode}','\"999999999\"')",'gen_random_uuid()','CATALOG_SELECTION_INVALID','category must exist in selected agreement');
 rejectWrite('propose','maker',"jsonb_set(change_body,'{values,agreementCode}','\" 2 \"')",'gen_random_uuid()','INPUT_INVALID','code padding is rejected consistently with API');
 rejectWrite('propose','maker',"change_body||jsonb_build_object('reason',repeat('a',33000))",'gen_random_uuid()','INPUT_INVALID','SQL command ceiling agrees with32KiB API limit');
 if(requireConcurrency){const blockedTarget=randomUUID();base.changeLock='hashtextextended('+q('native-employment-change:v1:'+ids.tenant+':'+ids.binding+':'+blockedTarget)+',0)';rejectRead('bootstrap','maker',[q(blockedTarget)+'::uuid'],'BUSY','independent connection holds exact104 contract lock before subject selection');}
 exec('change_receipt:='+call('propose','maker','change_body,change_key')+';');
 ok("change_receipt->>'status'='pending' AND change_receipt->>'revision'='0' AND change_receipt->>'payrollModified'='false' AND (SELECT count(*)=9 FROM jsonb_object_keys(change_receipt))",'preparation acknowledges exact immutable receipt without payroll effect');
 ok(snapshot+'=before_row','pending proposal does not alter canonical contract');
 ok(call('propose','maker','change_body,change_key')+"-'replayed'=change_receipt-'replayed' AND "+call('attempt','maker','target_id,change_key')+"->>'replayed'='true'",'preparation and lost ACK recover the original receipt');
 rejectWrite('propose','maker',"change_body||'{\"reason\":\"Another valid reason for this key\"}'",'change_key','IDEMPOTENCY_REUSE','changed content cannot reuse a key');
 rejectRead('attempt','maker',['gen_random_uuid()','change_key'],'NOT_FOUND','attempt is bound to the opened contract UUID');
 exec('change_detail:='+call('proposal','checker',"target_id,(change_receipt->>'proposalId')::uuid")+';');
 ok("change_detail#>>'{proposal,canReview}'='true' AND change_detail#>'{proposal,before}'=before_employment-ARRAY['version','revision','appliedAt'] AND change_detail#>>'{proposal,after,values,jobTitle}'='Cargo rectificado QA'",'review compares registered before and proposed after with real labels');
 ok("change_detail#>>'{proposal,status}'='pending' AND change_detail#>'{proposal,review}'='null'::jsonb AND change_detail#>>'{proposal,canReview}'='true'",'single statement snapshot returns coherent pending status, review and independent-review eligibility');
 rejectRead('proposal','checker',['gen_random_uuid()',"(change_receipt->>'proposalId')::uuid"],'NOT_FOUND','proposal lookup cannot cross opened contract');
 exec("change_review:=jsonb_build_object('contractId',target_id,'proposalId',change_receipt->>'proposalId','scopeVersion',"+call('bootstrap','checker','target_id')+"->>'scopeVersion','decision','approve','reason','Revisión independiente de instrumento');");
 rejectWrite('review','same_person',"change_review||jsonb_build_object('scopeVersion',"+call('bootstrap','same_person','target_id')+"->>'scopeVersion')",'gen_random_uuid()','MAKER_CHECKER_REQUIRED','same person cannot review through another membership/email');
 temporary('INSERT INTO capabilities VALUES('+q(ids.maker)+",'employee.record.approve');",()=>rejectWrite('review','maker',"change_review||jsonb_build_object('scopeVersion',change_boot->>'scopeVersion')",'gen_random_uuid()','MAKER_CHECKER_REQUIRED','same membership/email cannot review'));
 exec('competing_receipt:='+call('propose','maker',"change_body||jsonb_build_object('reason','Otra propuesta con la misma base'),gen_random_uuid()")+';');
 reject(`format(${q(`INSERT INTO native_employment_change_review(tenant_id,source_binding_id,contract_id,proposal_id,decision,reason,revision,employment_version,applied_xid,before_contract,after_contract,actor_membership_id,actor_person_id,actor_email,actor_session_id,actor_session_version,release_sha,reviewer_label,request_key,request_sha256,receipt)
 SELECT p.tenant_id,p.source_binding_id,p.contract_id,p.id,'approve','Ensayo sintético sin aplicar',1,repeat('a',64),pg_current_xact_id(),p.before_contract,p.after_contract,p.actor_membership_id,p.actor_person_id,p.actor_email,p.actor_session_id,p.actor_session_version,p.release_sha,p.author_label,gen_random_uuid(),repeat('b',64),'{}'::jsonb FROM native_employment_change_proposal p WHERE id=%L::uuid; SET CONSTRAINTS ALL IMMEDIATE;`)},change_receipt->>'proposalId')`,'APPLY_FAILED','approved ledger without its exact canonical update cannot satisfy deferred constraint');
 exec("SET LOCAL timezone='America/Argentina/Buenos_Aires'; approved_receipt:="+call('review','checker','change_review,approval_key')+"; SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED; SET LOCAL timezone='UTC'; after_row:="+snapshot+'; fresh_boot:='+call('bootstrap','maker','target_id')+';');
 ok("approved_receipt->>'status'='approved' AND approved_receipt->>'revision'='1' AND fresh_boot#>>'{employment,version}'=approved_receipt->>'employmentVersion' AND fresh_boot#>'{employment,appliedAt}'<>'null'::jsonb",'approval applies canonical framing and validates deferred application trigger');
 exec('change_detail:='+call('proposal','checker',"target_id,(change_receipt->>'proposalId')::uuid")+';');
 ok("change_detail#>>'{proposal,status}'='approved' AND change_detail#>>'{proposal,review,decision}'='approve' AND change_detail#>>'{proposal,canReview}'='false'",'single statement snapshot returns coherent decided status, review and disabled-review eligibility');
 ok("after_row-ARRAY['source_payload','agreement_code','category_code','organization_unit_source_id','sector_source_id']=before_row-ARRAY['source_payload','agreement_code','category_code','organization_unit_source_id','sector_source_id'] AND fresh_boot#>'{employment,values}'=change_body->'values'",'all five framing fields update while every other canonical field remains exact');
 ok("after_row#>'{source_payload,native}'=before_row#>'{source_payload,native}' AND (after_row#>'{source_payload,employment}')-ARRAY['cargoName','agreementName','categoryName','organizationName','sectorName']=(before_row#>'{source_payload,employment}')-ARRAY['cargoName','agreementName','categoryName','organizationName','sectorName'] AND fresh_boot#>>'{employment,labels,organizationName}'='Sector nuevo QA' AND fresh_boot#>>'{employment,labels,sectorName}'='Repartición nueva QA'",'registration provenance is exact and organization/sector labels retain their actual meaning');
 ok("fresh_boot->'subject'=original_subject AND payroll_novelty_subject_v2(own_context,target_id,false)=monthly_subject AND employee_family_subject_v2(own_context,target_id,false)=family_subject",'real093/101/102 identity and subject remain unchanged after rectification');
 ok("native_employee_attempt_v1(maker,hire_key)=saved_hire AND (SELECT to_jsonb(reg_row) FROM native_employee_registration reg_row WHERE contract_id=target_id)=old_registration AND (SELECT to_jsonb(person_row) FROM person_identity person_row WHERE person_row.id=(before_row->>'person_id')::uuid)=old_person AND "+preserved+'=other_contracts','hire receipt, person, registration and every other native/GRH contract are preserved');
 ok(call('propose','maker','change_body,change_key')+"-'replayed'=change_receipt-'replayed' AND "+call('review','checker','change_review,approval_key')+"-'replayed'=approved_receipt-'replayed'",'replays precede current-base/catalog validation and do not reapply the change');
 exec("SET LOCAL timezone='America/Argentina/Buenos_Aires';");
 ok(call('review','checker','change_review,approval_key')+"-'replayed'=approved_receipt-'replayed' AND "+call('bootstrap','maker','target_id')+'=fresh_boot','receipt replay and effective snapshot stay exact after a connection timezone change');
 exec("SET LOCAL timezone='UTC';");
 rejectWrite('review','checker','change_review','gen_random_uuid()','DECIDED','a second review command cannot decide twice');
 rejectWrite('review','checker',"change_review||jsonb_build_object('proposalId',competing_receipt->>'proposalId')",'gen_random_uuid()','BASE_CHANGED','competing proposal cannot overwrite a newly applied revision');
 exec('rejected_receipt:='+call('review','checker',"change_review||jsonb_build_object('proposalId',competing_receipt->>'proposalId','decision','reject'),gen_random_uuid()")+';');
 ok("rejected_receipt->>'status'='rejected' AND rejected_receipt->>'revision'='1' AND "+snapshot+'=after_row','stale-base proposal is rejectable without canonical mutation');
 ok("native_employment_change_version_v1(before_row,original_subject,0)<>native_employment_change_version_v1(before_row,original_subject,2)",'revision prevents ABA even if canonical values return to the same content');
 exec("second_body:=change_body||jsonb_build_object('baseVersion',fresh_boot#>>'{employment,version}','values',(fresh_boot#>'{employment,values}')||jsonb_build_object('jobTitle','Segundo cargo QA')); second_change:="+call('propose','maker','second_body,gen_random_uuid()')+';');
 rejectWrite('review','checker',"change_review||jsonb_build_object('proposalId',second_change->>'proposalId')",'gen_random_uuid()','BUSY','one contract cannot reuse a transaction approval ticket for a second application');
 exec("catalog_body:=catalog_body||jsonb_build_object('baseVersion',native_employment_catalog_bootstrap_v1(maker)#>>'{catalog,version}'); catalog_receipt:=native_employment_catalog_propose_v1(maker,catalog_body,gen_random_uuid()); PERFORM native_employment_catalog_review_v1(checker,jsonb_build_object('proposalId',catalog_receipt->>'proposalId','scopeVersion',native_employment_catalog_bootstrap_v1(checker)->>'scopeVersion','decision','approve','reason','Nueva revisión completa sintética'),gen_random_uuid());");
 rejectWrite('review','checker',"change_review||jsonb_build_object('proposalId',second_change->>'proposalId')",'gen_random_uuid()','CATALOG_CHANGED','approval revalidates catalog even if codes are unchanged');
 exec('rejected_receipt:='+call('review','checker',"change_review||jsonb_build_object('proposalId',second_change->>'proposalId','decision','reject'),gen_random_uuid()")+';');
 ok("rejected_receipt->>'status'='rejected' AND "+snapshot+'=after_row','stale catalog proposal is rejectable without application');
 ok(call('propose','maker','change_body,change_key')+"-'replayed'=change_receipt-'replayed' AND "+call('review','checker','change_review,approval_key')+"-'replayed'=approved_receipt-'replayed'",'catalog publication after correction does not rewrite or block original acknowledgements');
 for(const field of ['jurisdiction_code','legacy_legajo','start_date','status','person_id','source_batch_id','updated_at']){
  const val={jurisdiction_code:"'55'",legacy_legajo:"'123456789'",start_date:"start_date-1",status:"'inactive'",person_id:'gen_random_uuid()',source_batch_id:'gen_random_uuid()',updated_at:"clock_timestamp()"}[field];
  reject('format('+q('UPDATE employment_contract SET '+field+'='+val+' WHERE id=%L::uuid')+',target_id)','NATIVE_EMPLOYEE_IMMUTABLE','canonical guard still rejects direct change to '+field);
 }
 reject('format('+q("UPDATE employment_contract SET source_payload=jsonb_set(source_payload,'{native,registrationId}',to_jsonb(gen_random_uuid())) WHERE id=%L::uuid")+',target_id)','NATIVE_EMPLOYEE_IMMUTABLE','native provenance cannot be altered through payload');
 reject('format('+q("UPDATE employment_contract SET source_payload=jsonb_set(source_payload,'{employment,cargoName}','\"Forged change\"') WHERE id=%L::uuid")+',target_id)','NATIVE_EMPLOYEE_IMMUTABLE','valid framing field cannot be edited without an exact current-transaction review');
 exec("PERFORM set_config('mc.native_employment_change_allowed','true',true);");
 reject('format('+q("UPDATE employment_contract SET agreement_code='2' WHERE id=%L::uuid")+',target_id)','NATIVE_EMPLOYEE_IMMUTABLE','forged session GUC never authorises a native update');
 for(const [mutation,error,label]of [
  [`UPDATE tenant_identity_session SET status='revoked' WHERE id=${q(ids.makerSession)}::uuid;`,'ACTION_SESSION_INVALID','revoked session'],
  [`DELETE FROM capabilities WHERE membership_id=${q(ids.maker)}::uuid AND capability_key='employee.record.propose';`,'FORBIDDEN','revoked proposal permission'],
  [`UPDATE platform_tenant_source_binding SET verified=false WHERE id=${q(ids.binding)}::uuid;`,'ACTION_SOURCE_BINDING_REQUIRED','revoked binding'],
  [`UPDATE tenant_action_employment_link SET active=false WHERE membership_id=${q(ids.maker)}::uuid;`,'FORBIDDEN','changed actor linkage']])temporary(mutation,()=>rejectRead('attempt','maker',['target_id','change_key'],error,label+' prevents receipt recovery'));
 temporary("ALTER TABLE person_identity DISABLE TRIGGER USER; UPDATE person_identity SET full_name='Identidad sintética modificada' WHERE id=(before_row->>'person_id')::uuid;",()=>{
  ok(call('attempt','maker','target_id,change_key')+"-'replayed'=change_receipt-'replayed' AND "+call('attempt','checker','target_id,approval_key')+"-'replayed'=approved_receipt-'replayed'",'target identity drift preserves original receipts after fresh actor authority');
  rejectWrite('propose','maker','second_body','gen_random_uuid()','IDENTITY_CHANGED','new operation rejects stale target identity');
 });
 exec('SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;');
 for(const table of ['native_employment_change_proposal','native_employment_change_review']){
  ok("NOT has_table_privilege('municontrol_actions_runtime_app',"+q(schema+'.'+table)+",'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AND (SELECT relrowsecurity AND NOT relforcerowsecurity FROM pg_class WHERE oid="+q(schema+'.'+table)+"::regclass)",'private ledger ACL and RLS: '+table);
  for(const sql of ['UPDATE '+table+' SET reason=reason','DELETE FROM '+table,'TRUNCATE '+table+' CASCADE'])reject(q(sql),'IMMUTABLE','owner cannot rewrite ledger: '+sql.split(' ')[0]+' '+table);
 }
 exec('SET LOCAL ROLE municontrol_actions_runtime_app; change_detail:='+call('bootstrap','reader','target_id')+'; RESET ROLE;');
 ok("change_detail#>>'{permissions,canPropose}'='false' AND change_detail#>>'{employment,revision}'='1'",'effective runtime role reads through authenticated facade only');
 for(const command of ['SELECT * FROM native_employment_change_proposal','UPDATE native_employment_change_review SET reason=reason','SELECT native_employment_change_update_allowed_v1(NULL::employment_contract,NULL::employment_contract)']){
  exec('SET LOCAL ROLE municontrol_actions_runtime_app; BEGIN EXECUTE '+q(command)+"; RAISE EXCEPTION 'QA_RUNTIME_ACCESS_WAS_NOT_DENIED'; EXCEPTION WHEN insufficient_privilege THEN checks:=checks+1; END; RESET ROLE;");checks++;
 }
 ok("NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.pronamespace="+q(schema)+"::regnamespace AND p.proname LIKE 'native_employment_change_%' AND a.grantee=0)",'no PUBLIC execution on104 helpers or facades');
 ok("(SELECT count(*)=5 FROM pg_proc p WHERE p.pronamespace="+q(schema)+"::regnamespace AND p.proname LIKE 'native_employment_change_%' AND has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE'))",'runtime allowlist is exactly five facades');
 // METADATA104: insertion point for the private local runner, before exact rerun assertions.
 exec("-- METADATA104\ninstalled_change_functions:=(SELECT md5(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,'')||p.proowner::text,E'\\n' ORDER BY p.oid)) FROM pg_proc p WHERE p.pronamespace="+q(schema)+"::regnamespace); EXECUTE "+install+';');
 ok("installed_change_functions=(SELECT md5(string_agg(pg_get_functiondef(p.oid)||coalesce(p.proacl::text,'')||p.proowner::text,E'\\n' ORDER BY p.oid)) FROM pg_proc p WHERE p.pronamespace="+q(schema)+"::regnamespace)",'104 rerun preserves all function OIDs, definitions, ownership and ACL');
 for(const [mutation,label]of [
  ['DROP TRIGGER native_employment_change_proposal_immutable ON native_employment_change_proposal;','missing proposal immutability'],
  ['ALTER TABLE native_employment_change_review DISABLE TRIGGER native_employment_change_review_before;','disabled application guard'],
  ['DROP TRIGGER native_employment_change_review_applied ON native_employment_change_review; CREATE TRIGGER native_employment_change_review_applied AFTER INSERT ON native_employment_change_review FOR EACH ROW EXECUTE FUNCTION native_employment_change_application_guard_v1();','deferred guard replaced by ordinary trigger'],
  ["DROP INDEX native_employment_change_transaction; CREATE UNIQUE INDEX native_employment_change_transaction ON native_employment_change_review(contract_id,applied_xid) WHERE decision='reject';",'changed transaction uniqueness predicate'],
  ['ALTER TABLE native_employment_change_review DROP CONSTRAINT native_employment_change_review_check; ALTER TABLE native_employment_change_review ADD CONSTRAINT native_employment_change_review_check CHECK(true);','same-name changed before/after constraint'],
  ['ALTER TABLE native_employment_change_proposal ALTER COLUMN release_sha DROP NOT NULL;','nullable release provenance'],
  ["ALTER TABLE native_employment_change_proposal ALTER COLUMN reason SET DEFAULT 'Invented';",'unreviewed default'],
  ['ALTER TABLE native_employment_change_review DISABLE ROW LEVEL SECURITY;','RLS disabled'],
  ['CREATE POLICY unexpected_policy ON native_employment_change_review USING(true);','unexpected policy'],
  ['GRANT SELECT ON native_employment_change_review TO municontrol_actions_runtime_app;','runtime table grant'],
  ['GRANT EXECUTE ON FUNCTION native_employment_change_application_guard_v1() TO PUBLIC;','PUBLIC private helper grant'],
  ['ALTER FUNCTION native_employment_change_propose_v1(jsonb,jsonb,uuid) RESET ALL;','NULL function search path'],
  ['ALTER FUNCTION native_employment_change_scope_v1(jsonb,jsonb) STRICT;','changed strictness'],
  ["CREATE FUNCTION native_employment_change_scope_v1(text) RETURNS text LANGUAGE sql AS 'SELECT $1';",'foreign overload'],
  ['ALTER FUNCTION native_employee_contract_guard_v1() RESET ALL;','native guard configuration drift'],
  ['CREATE TRIGGER unexpected_updated_at BEFORE UPDATE ON employment_contract FOR EACH ROW EXECUTE FUNCTION native_employee_contract_guard_v1();','unexpected canonical update trigger'],
  ['ALTER FUNCTION payroll_fixed_registry_subject_by_contract_v1(jsonb,uuid,boolean) STABLE;','identity resolver volatility drift']
 ])temporary(mutation,()=>reject(install,'PREREQUISITE','104 guard rejects '+label));
 for(const name of ['native_employee_contract_guard_v1','native_employment_change_propose_v1','native_employment_change_update_allowed_v1'])temporary('SELECT pg_get_functiondef(oid) INTO damaged_change FROM pg_proc WHERE pronamespace='+q(schema)+'::regnamespace AND proname='+q(name)+"; EXECUTE replace(damaged_change,'AS $function$',E'AS $function$\\n-- unauthorized synthetic drift\\n');",()=>reject(install,'PREREQUISITE','exact body drift rejected: '+name));
 exec("second_body:=second_body||jsonb_build_object('catalogVersion',native_employment_catalog_bootstrap_v1(maker)#>>'{catalog,version}'); FOR change_n IN (SELECT count(*)::integer+1 FROM native_employment_change_proposal WHERE contract_id=target_id)..100 LOOP PERFORM "+call('propose','maker',"second_body||jsonb_build_object('reason','Historial sintético número '||change_n),gen_random_uuid()")+'; END LOOP; change_detail:='+call('bootstrap','maker','target_id')+';');
 ok("jsonb_array_length(change_detail->'proposals')=20 AND change_detail->>'historyTruncated'='true' AND (SELECT count(*)=100 FROM native_employment_change_proposal WHERE contract_id=target_id)",'bounded history is explicit and all100 registered proposals are retained');
 rejectWrite('propose','maker','second_body','gen_random_uuid()','LIMIT','101st proposal cannot exceed per-contract history bound');
 const block=`DECLARE damaged_change text; change_n integer; catalog_body jsonb; catalog_receipt jsonb; target_id uuid; before_row jsonb; after_row jsonb; old_registration jsonb; old_person jsonb; saved_hire jsonb; other_contracts text; original_subject jsonb; before_employment jsonb; own_context jsonb; monthly_subject jsonb; family_subject jsonb; change_boot jsonb; fresh_boot jsonb; change_body jsonb; change_review jsonb; change_detail jsonb; change_receipt jsonb; approved_receipt jsonb; rejected_receipt jsonb; competing_receipt jsonb; second_body jsonb; second_change jsonb; installed_change_functions text; change_key uuid:=gen_random_uuid(); approval_key uuid:=gen_random_uuid(); BEGIN BEGIN ${statements.join('\n')} RAISE EXCEPTION USING ERRCODE='P1041',MESSAGE='RESTORE_CHANGE_FIXTURES'; EXCEPTION WHEN SQLSTATE 'P1041' THEN NULL; END; END;`;
 const anchor="RAISE EXCEPTION USING ERRCODE='P1031',MESSAGE='RESTORE_CATALOG_FIXTURES';";assert.equal(base.sql.split(anchor).length,2);
 const report={...base.report,changeChecksPassed:checks,checksPassed:base.report.checksPassed+checks,migration104Sha256:sha(migration),changeConcurrentLockChecked:requireConcurrency,limitations:[...base.report.limitations,'104 executes real093/101/102 native subject resolvers and095 receipts; it does not claim full payroll/family workflow replay. A distinct connection tests104 contract-lock rejection; competing approval/base and immutable receipts are exercised sequentially inside one rolled-back transaction.']};
 let sql=base.sql.replace(anchor,()=>block+'\n'+anchor).replaceAll("current_database()<>'native_employment_catalog_qa'","current_database()<>'native_employment_change_qa'").replace('checks<>'+base.report.checksPassed,'checks<>'+report.checksPassed).replace(j(base.report),()=>j(report));
 let lockSql=base.lockSql.replaceAll("current_database()<>'native_employment_catalog_qa'","current_database()<>'native_employment_change_qa'");
 if(requireConcurrency)lockSql=lockSql.replace(" SELECT 'FIXED_NOVELTIES_QA_LOCK_READY'"," SELECT pg_advisory_xact_lock("+base.changeLock+");\n SELECT 'FIXED_NOVELTIES_QA_LOCK_READY'");
 assert.ok(!/INSERT\s+INTO\s+public\./i.test(sql));return {...base,sql,lockSql,report};
}
function main(){
 const args={};for(const a of process.argv.slice(2)){if(a==='--ci'){args.ci=true;continue;}if(a==='--require-concurrency'){args.requireConcurrency=true;continue;}const m=/^--(expected-major|write-sql|write-lock-sql)=(.+)$/.exec(a);assert.ok(m,'Unknown or incomplete argument');assert.equal(args[m[1]],undefined);args[m[1]]=m[2];}
 assert.equal(args.ci,true);assert.ok(args['write-sql']);assert.ok(!args.requireConcurrency||args['write-lock-sql']);
 const qa=buildNativeEmploymentChangeQa({serverMajor:args['expected-major'],requireConcurrency:Boolean(args.requireConcurrency)});
 const outputs=[['write-sql',qa.sql],['write-lock-sql',qa.lockSql]].filter(([k])=>args[k]).map(([k,data])=>({output:path.resolve(args[k]),data}));assert.equal(new Set(outputs.map(x=>x.output)).size,outputs.length);
 for(const {output}of outputs)assert.ok(!fs.existsSync(output),'Output exists; choose a new path');for(const {output,data}of outputs){fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,data,{flag:'wx'});}
 console.log(JSON.stringify({generated:true,databaseExecuted:false,checksPlanned:qa.report.checksPassed,changeChecksPlanned:qa.report.changeChecksPassed,migration104Sha256:qa.report.migration104Sha256}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{main();}catch(e){console.error(JSON.stringify({ok:false,message:e.message}));process.exitCode=1;}
