// Rollback-only extension of the complete real 111 regression in disposable
// PG17/18. No municipal database or external identity is used by this generator.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash,randomUUID} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {buildNativeLeaveQa} from './verify-native-leave-sql.mjs';
import {splitPostgresStatements} from './lib/sql-statements.mjs';
import {annual,profile} from '../tests/fixtures/native-leave-synthetic.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),q=v=>"'"+String(v).replaceAll("'","''")+"'",j=v=>q(JSON.stringify(v))+'::jsonb',read=f=>fs.readFileSync(path.join(root,'scripts/migrations',f),'utf8').replaceAll('\r\n','\n');
const original=(file,name)=>{const d=splitPostgresStatements(read(file)).find(s=>new RegExp('CREATE OR REPLACE FUNCTION (?:public\\.)?'+name+'\\s*\\(').test(s));assert.ok(d,name);return d+';';};
export function buildNativeSelfQa({serverMajor,requireConcurrency=false}){
 const base=buildNativeLeaveQa({serverMajor,requireConcurrency}),{schema,ids}=base,migration=read('113-native-employee-self-access.sql'),ownerSession=randomUUID();
 const syntheticDni='99000022',prefix='20'+syntheticDni,checkDigit=11-[5,4,3,2,7,6,5,4,3,2].reduce((sum,w,n)=>sum+Number(prefix[n])*w,0)%11,syntheticCuil=prefix+(checkDigit===11?0:checkDigit===10?9:checkDigit);
 const relocate=s=>s.replaceAll('public.',schema+'.').replaceAll(schema+'.digest(','public.digest(').replace(/SET search_path\s*=\s*(?:pg_catalog,\s*)?public,\s*pg_temp/gi,'SET search_path=pg_catalog,'+schema+',public,pg_temp');
 const normalized=s=>relocate(s).replaceAll("public.digest(replace(p.prosrc,E'\\r\\n',E'\\n')","public.digest(replace(replace(p.prosrc,E'\\r\\n',E'\\n'),"+q(schema+'.')+",'public'||'.')").replaceAll("ARRAY['search_path=public, pg_temp']","ARRAY['search_path=pg_catalog, "+schema+", public, pg_temp']").replaceAll("ARRAY['search_path=pg_catalog, public, pg_temp','timezone=UTC']","ARRAY['search_path=pg_catalog, "+schema+", public, pg_temp','timezone=UTC']");
 const curated=/DO \$curated_16\$[\s\S]+?END \$curated_16\$;/.exec(read('099-grh-curated-consumers.sql'))?.[0];assert.ok(curated);
 const curatedQa=relocate(curated).replaceAll("proconfig=ARRAY['search_path=public, pg_temp']","proconfig=ARRAY['search_path=pg_catalog, "+schema+", public, pg_temp']").replaceAll("replace(prosrc,E'\\r\\n',E'\\n')","replace(replace(prosrc,E'\\r\\n',E'\\n'),"+q(schema+'.')+",'public'||'.')").replace("encode(public.digest(current_body,'sha256')","encode(public.digest(replace(current_body,"+q(schema+'.')+",'public'||'.'),'sha256')");
 const statements=[];let count=0;const exec=s=>statements.push(s),ok=(s,label)=>{exec('PERFORM qa_assert(('+s+'),'+q(label)+');checks:=checks+1;');count++;};
 const reject=(s,error,label)=>ok('qa_rejects('+s+','+q(error)+')',label);
 const temporary=(mutation,fn)=>{const start=statements.length;fn();exec('BEGIN '+mutation+' '+statements.splice(start).join('\n')+" RAISE EXCEPTION USING ERRCODE='P1132',MESSAGE='RESTORE_SELF_FAULT';EXCEPTION WHEN SQLSTATE 'P1132' THEN NULL;END;");};
 const call=(op,actor='reader',tail='target_id')=>'native_self_leave_'+op+'_v1('+actor+','+tail+')';
 const own=actor=>'native_employee_self_bootstrap_v1('+actor+')';
 const link=(member='reader',target='target_id',key='self_link_key',version='1')=>'tenant_action_apply_provisioning_command_v2('+q('owner@example.invalid')+','+q(ownerSession)+'::uuid,1,'+q(ids.release??'9'.repeat(40))+',('+member+"->>'membershipId')::uuid,'link_employment',"+key+",repeat('a',64),"+version+",jsonb_build_object('sourceBindingId',"+q(ids.binding)+",'employmentContractId',"+target+",'reasonCode','onboarding','reason','Vínculo sintético QA con contrato propio'))";
 const body=(actor,cmd,payload='NULL::jsonb',entity='NULL::uuid')=>'qa_leave_input('+actor+',target_id,'+q(cmd)+','+payload+','+entity+','+q('Fundamento sintético para revisión')+')';
 exec(`
 ALTER TABLE tenant_action_authority ADD COLUMN version integer NOT NULL DEFAULT 1,ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
 ALTER TABLE tenant_action_employment_link ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid(),ADD COLUMN linked_by_user_email text,ADD COLUMN linked_at timestamptz DEFAULT now(),ADD COLUMN revoked_at timestamptz,ADD COLUMN updated_at timestamptz DEFAULT now();
 -- Prior regressions model two memberships of one person with one contract.
 -- Use two contracts of that same person here to exercise the real unique-link
 -- constraints without changing or skipping the prior maker/checker tests.
 self_alias_id:=gen_random_uuid();
 INSERT INTO employment_contract SELECT(jsonb_populate_record(NULL::employment_contract,to_jsonb(ec)||jsonb_build_object('id',self_alias_id,'legacy_legajo','909'))).* FROM employment_contract ec WHERE id=${q(ids.makerContract)}::uuid;
 UPDATE tenant_action_employment_link SET employment_contract_id=self_alias_id WHERE membership_id=${q(ids.samePerson)}::uuid;
 CREATE UNIQUE INDEX self_active_membership ON tenant_action_employment_link(membership_id) WHERE active;
 CREATE UNIQUE INDEX self_active_contract ON tenant_action_employment_link(tenant_id,employment_contract_id) WHERE active;
 CREATE TABLE tenant_action_authority_event(id bigint GENERATED ALWAYS AS IDENTITY,actor_user_email text,actor_session_id uuid,actor_session_version integer,release_sha text,tenant_id uuid,membership_id uuid,command text,target_type text,target_id text,idempotency_key uuid,command_hash text,expected_version integer,resulting_version integer,reason_code text,reason_hash text,before_snapshot jsonb,after_snapshot jsonb,result jsonb);
 CREATE TABLE platform_user_role(user_email text,role_key text,active boolean);
 INSERT INTO internal_users(email,active,identity_version,display_name) VALUES('owner@example.invalid',true,1,'Responsable sintético QA');
 INSERT INTO tenant_identity_session VALUES(${q(ownerSession)},'owner@example.invalid',NULL,1,1,'platform','mfa','active',now()+interval '1 hour',now());
 INSERT INTO platform_user_role VALUES('owner@example.invalid','PLATFORM_OWNER',true);
 INSERT INTO iam_capability VALUES('platform.users.manage','Vincular cuentas','Ensayo aislado','platform','privileged');
 INSERT INTO iam_role_capability VALUES('PLATFORM_OWNER','platform.users.manage');
 ${relocate(original('006-tenant-action-authority.sql','tenant_iam_assert_platform_session_v2'))}
 ${relocate(original('009-tenant-lifecycle-hardening.sql','tenant_lifecycle_assert_platform_capability_v2'))}
 ${relocate(original('009-tenant-lifecycle-hardening.sql','tenant_action_authority_snapshot'))}
 ${relocate(original('013-existing-identity-membership-governance.sql','tenant_action_validate_binding'))}
 ${relocate(original('009-tenant-lifecycle-hardening.sql','tenant_action_apply_provisioning_command_v2'))}
 ${relocate(original('009-tenant-lifecycle-hardening.sql','tenant_action_lookup_employment_v2'))}
 EXECUTE ${q(curatedQa)};
 CREATE TRIGGER self_binding_guard BEFORE INSERT OR UPDATE ON tenant_action_employment_link FOR EACH ROW EXECUTE FUNCTION tenant_action_validate_binding();
 DELETE FROM capabilities WHERE membership_id=${q(ids.reader)}::uuid;
 INSERT INTO capabilities SELECT ${q(ids.reader)}::uuid,k FROM unnest(ARRAY['actions.read','leave.request.self.read','leave.request.self.create','leave.request.self.update','leave.request.self.submit','leave.request.self.cancel']) k;
 self_other_id:=(native_employee_create_v1(maker,new_draft||jsonb_build_object('dni',${q(syntheticDni)},'cuil',${q(syntheticCuil)},'legajo','29002','fullName','Otro empleado nativo sintético QA'),native_employment_catalog_bootstrap_v1(maker)#>>'{catalog,version}',gen_random_uuid())->>'contractId')::uuid;
 SELECT md5(jsonb_agg(to_jsonb(c) ORDER BY c.membership_id,c.capability_key)::text) INTO self_capabilities FROM capabilities c;
 SELECT md5(jsonb_agg(to_jsonb(ec) ORDER BY ec.id)::text) INTO self_contracts FROM employment_contract ec;
 `);
 // Deliberate prerequisite faults must be rejected, not silently accepted.
 for(const mutation of ['ALTER FUNCTION native_leave_context_v1(jsonb) SECURITY INVOKER;','ALTER FUNCTION action_center_assert_tenant_read_session_v2(text,uuid,integer,text,uuid,uuid) SET search_path=public;','ALTER FUNCTION native_leave_authorized_v1(jsonb,uuid,text,text,text) VOLATILE;'])temporary(mutation,()=>reject(q(normalized(migration)),'NATIVE_SELF_PREREQUISITE_DRIFT','exact prerequisite metadata rejects '+mutation));
 exec('EXECUTE '+q(normalized(migration))+';');
 ok("(SELECT count(*)=5 AND count(*) FILTER(WHERE has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE'))=4 FROM pg_proc p WHERE p.pronamespace="+q(schema)+"::regnamespace AND p.proname IN('native_account_contract_v1','native_employee_self_bootstrap_v1','native_self_leave_bootstrap_v1','native_self_leave_attempt_v1','native_self_leave_command_v1'))",'four dedicated runtime facades and a private canonical source helper');
 ok(own('reader')+"->>'state'='unlinked' AND "+own('maker')+"->>'state'='reference'",'unlinked account and imported employee retain distinct states');
 reject('format('+q("SELECT tenant_action_lookup_employment_v2(%L,%L::uuid,1,%L,%L::uuid,'19001',20)")+",'reader@example.invalid',reader->>'actorSessionId',reader->>'releaseSha',reader->>'membershipId')",'TENANT_IAM_SESSION_INVALID','employee has no platform account administration authority');
 exec("self_view:=tenant_action_lookup_employment_v2('owner@example.invalid',"+q(ownerSession)+"::uuid,1,reader->>'releaseSha',(reader->>'membershipId')::uuid,(SELECT legacy_legajo FROM employment_contract WHERE id=target_id),20);");
 ok("EXISTS(SELECT 1 FROM jsonb_array_elements(self_view->'candidates') c WHERE c->>'employmentContractId'=target_id::text AND c->>'origin'='MUNICONTROL') AND jsonb_array_length(self_view->'candidates')<=20",'authorized platform lookup finds the native-only contract and labels its origin');
 exec('self_receipt:='+link()+';');
 ok("self_receipt->>'version'='2' AND "+own('reader')+"#>>'{subject,contractId}'=target_id::text AND "+own('reader')+"->>'state'='native'",'existing versioned administrative command links the account without GRH identity');
 ok(link()+"->>'replayed'='true' AND(SELECT count(*)=1 FROM tenant_action_authority_event WHERE idempotency_key=self_link_key)",'same account-link command recovers its original receipt without duplicate link or audit');
 ok("NOT EXISTS(SELECT 1 FROM grh_employees g JOIN employment_contract ec ON ec.legacy_company_id=g.company_id AND ec.legacy_legajo=g.legajo WHERE ec.id=target_id)",'native beneficiary is absent from GRH');
 ok("action_center_assert_tenant_read_session_v2(reader->>'actorEmail',(reader->>'actorSessionId')::uuid,1,reader->>'releaseSha',(reader->>'tenantId')::uuid,(reader->>'membershipId')::uuid)->>'actorPersonId'=(SELECT person_id::text FROM employment_contract WHERE id=target_id)",'real session assertion resolves the native person from the current account link');
 ok(call('bootstrap')+"#>>'{permissions,canCreate}'='true' AND "+call('bootstrap')+"#>>'{permissions,canProposeProfile}'='false'",'own read and preparation work with six self capabilities and no directory access');
 reject('format('+q('SELECT native_self_leave_bootstrap_v1(%L::jsonb,%L::uuid)')+',reader,self_other_id)','NATIVE_LEAVE_FORBIDDEN','own facade refuses another native contract in the same tenant');
 reject('format('+q('SELECT native_leave_bootstrap_v1(%L::jsonb,%L::uuid)')+',reader,self_other_id)','NATIVE_LEAVE_FORBIDDEN','the existing runtime facade cannot bypass own scope through its new context');
 reject('format('+q('SELECT native_self_leave_bootstrap_v1(%L::jsonb,%L::uuid)')+',outsider,target_id)','NATIVE_SELF_FORBIDDEN','foreign account cannot read the native beneficiary');
 temporary("UPDATE tenant_action_employment_link SET active=false,revoked_at=now(),updated_at=now() WHERE membership_id="+q(ids.reader)+"::uuid;",()=>ok(own('reader')+"->>'state'='unlinked'",'revocation removes the self-service identity immediately'));
 for(const [mutation,error,label]of[
  ["UPDATE tenant_identity_session SET status='revoked' WHERE id="+q(ids.readerSession)+"::uuid;",'ACTION_SESSION_INVALID','revoked session'],
  ["UPDATE tenant_identity_session SET session_version=2 WHERE id="+q(ids.readerSession)+"::uuid;",'ACTION_SESSION_INVALID','stale session version'],
  ["UPDATE tenant_membership SET status='suspended' WHERE id="+q(ids.reader)+"::uuid;",'ACTION_SESSION_INVALID','suspended membership'],
  ["UPDATE tenant_identity_policy SET certified_release_sha=repeat('a',40) WHERE tenant_id="+q(ids.tenant)+"::uuid;",'ACTION_RELEASE_NOT_CERTIFIED','uncertified release'],
  ["DELETE FROM capabilities WHERE membership_id="+q(ids.reader)+"::uuid AND capability_key='leave.request.self.read';",'NATIVE_SELF_FORBIDDEN','withdrawn self permission']
 ])temporary(mutation,()=>reject('format('+q('SELECT native_employee_self_bootstrap_v1(%L::jsonb)')+',reader)',error,label+' never retains own access'));
 exec('self_body:='+body('reader','create',j(annual({startsOn:'2027-02-10',endsOn:'2027-02-11'})))+';SET LOCAL ROLE municontrol_actions_runtime_app;self_receipt:='+call('command','reader','self_body,self_request_key')+';RESET ROLE;self_id:=(self_receipt->>\'entityId\')::uuid;');
 ok("self_receipt->>'status'='draft' AND self_receipt->>'payrollModified'='false'",'self create writes only a private draft');
 ok(call('attempt','reader','target_id,self_request_key')+"-'replayed'=self_receipt-'replayed'",'self recovery returns the original receipt for the exact contract and key');
 exec('self_body:='+body('reader','update_draft',j(annual({startsOn:'2027-02-10',endsOn:'2027-02-12'})),'self_id')+';self_receipt:='+call('command','reader','self_body,gen_random_uuid()')+';');
 ok("self_receipt->>'entityVersion'='2' AND self_receipt->>'status'='draft'",'own draft edit advances its exact immutable version');
 for(const cmd of ['profile_propose','profile_approve','approve','reject'])reject('format('+q('SELECT native_self_leave_command_v1(%L::jsonb,%L::jsonb,gen_random_uuid())')+',reader,self_body||jsonb_build_object(\'command\','+q(cmd)+'))','NATIVE_LEAVE_FORBIDDEN','SQL self facade refuses administrative command '+cmd);
 exec('self_receipt:=native_leave_command_v1(checker,'+body('checker','profile_propose',j(profile({year:2027,entitledUnits:100})))+',gen_random_uuid());self_profile_id:=(self_receipt->>\'entityId\')::uuid;self_receipt:=native_leave_command_v1(maker,'+body('maker','profile_approve','NULL::jsonb','self_profile_id')+',gen_random_uuid());');
 exec('self_body:='+body('reader','submit','NULL::jsonb','self_id')+';self_receipt:='+call('command','reader','self_body,gen_random_uuid()')+';');
 ok("self_receipt->>'status'='submitted' AND EXISTS(SELECT 1 FROM jsonb_array_elements("+call('bootstrap')+"->'balances') b WHERE b->>'year'='2027' AND b->>'reservedUnits'='3')",'own submission reserves exact civil units against independently reviewed entitlement');
 exec('self_receipt:=native_leave_command_v1(checker,'+body('checker','approve','NULL::jsonb','self_id')+',gen_random_uuid());self_view:='+call('bootstrap')+';');
 ok("self_receipt->>'status'='approved' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(self_view->'requests') r WHERE (r->>'canReview')::boolean)",'independent administrator approves while self view has no decision authority');
 exec('self_body:='+body('reader','create',j(annual({startsOn:'2027-03-10',endsOn:'2027-03-11'})))+';self_receipt:='+call('command','reader','self_body,gen_random_uuid()')+';self_id:=(self_receipt->>\'entityId\')::uuid;self_body:='+body('reader','submit','NULL::jsonb','self_id')+';self_receipt:='+call('command','reader','self_body,gen_random_uuid()')+';self_body:='+body('reader','cancel','NULL::jsonb','self_id')+';self_receipt:='+call('command','reader','self_body,gen_random_uuid()')+';');
 ok("self_receipt->>'status'='cancelled' AND self_receipt->>'entityVersion'='3'",'employee cancels own pending request without erasing create and submission');
 ok('self_capabilities=(SELECT md5(jsonb_agg(to_jsonb(c) ORDER BY c.membership_id,c.capability_key)::text) FROM capabilities c) AND self_contracts=(SELECT md5(jsonb_agg(to_jsonb(ec) ORDER BY ec.id)::text) FROM employment_contract ec)','the installation and account/leave circuit preserve all capability grants and canonical employee rows');
 reject(q(normalized(migration)),'NATIVE_SELF_ALREADY_INSTALLED','a second installation fails without patching an installed object');
 const block=`DECLARE self_capabilities text;self_contracts text;self_view jsonb;self_receipt jsonb;self_body jsonb;self_id uuid;self_other_id uuid;self_alias_id uuid;self_profile_id uuid;self_link_key uuid:=gen_random_uuid();self_request_key uuid:=gen_random_uuid();BEGIN BEGIN ${statements.join('\n')} RAISE EXCEPTION USING ERRCODE='P1131',MESSAGE='RESTORE_SELF_FIXTURES';EXCEPTION WHEN SQLSTATE 'P1131' THEN NULL;END;END;`;
 const anchor="RAISE EXCEPTION USING ERRCODE='P1111',MESSAGE='RESTORE_LEAVE_FIXTURES';";assert.equal(base.sql.split(anchor).length,2);
 const report={...base.report,selfChecksPassed:count,checksPassed:base.report.checksPassed+count,migration113Sha256:createHash('sha256').update(migration).digest('hex'),limitations:[...base.report.limitations,'113 executes original006 platform session,009 account-link command/lookup and013 binding trigger with synthetic IAM tables. No productive installation or human employee acceptance is asserted.']};
 const sql=base.sql.replace(anchor,()=>block+'\n'+anchor).replace('checks<>'+base.report.checksPassed,'checks<>'+report.checksPassed).replace(j(base.report),()=>j(report));return{...base,sql,report};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args={};for(const a of process.argv.slice(2)){if(a==='--ci'||a==='--require-concurrency'){args[a.slice(2)]=true;continue;}const m=/^--(expected-major|write-sql|write-lock-sql)=(.+)$/.exec(a);assert.ok(m);assert.equal(args[m[1]],undefined);args[m[1]]=m[2];}assert.equal(args.ci,true);assert.ok(args['write-sql']);assert.ok(!args['require-concurrency']||args['write-lock-sql']);const qa=buildNativeSelfQa({serverMajor:args['expected-major'],requireConcurrency:!!args['require-concurrency']});for(const[key,data]of [['write-sql',qa.sql],['write-lock-sql',qa.lockSql]])if(args[key]){const target=path.resolve(args[key]);assert.ok(!fs.existsSync(target));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data,{flag:'wx'});}console.log(JSON.stringify({generated:true,databaseExecuted:false,checksPlanned:qa.report.checksPassed,selfChecksPlanned:qa.report.selfChecksPassed}));}catch(error){console.error(JSON.stringify({ok:false,message:error.message}));process.exitCode=1;}
}
