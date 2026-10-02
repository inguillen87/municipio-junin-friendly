// Generates synthetic integration in a disposable loopback PG17/18 database.
// The original110 regression is retained and every new object/row is rolled back.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildNativeEmploymentLifecycleQa} from './verify-native-employment-lifecycle-sql.mjs';
import {splitPostgresStatements} from './lib/sql-statements.mjs';
import {annual,profile,command} from '../tests/fixtures/native-leave-synthetic.js';
import {nativeLeaveFingerprint} from '../lib/internal-native-leave.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),q=v=>"'"+String(v).replaceAll("'","''")+"'",j=v=>q(JSON.stringify(v))+'::jsonb';
const read=f=>fs.readFileSync(path.join(root,f),'utf8').replaceAll('\r\n','\n');
function original(file,name){const def=splitPostgresStatements(read(file)).find(s=>new RegExp('CREATE OR REPLACE FUNCTION (?:public\\.)?'+name+'\\s*\\(').test(s));assert.ok(def,name);return def;}
export function buildNativeLeaveQa({serverMajor,requireConcurrency=false}){
 const base=buildNativeEmploymentLifecycleQa({serverMajor,requireConcurrency}),{schema,ids}=base,migration=read('scripts/migrations/111-native-leave-workflow.sql');
 const relocate=s=>s.replaceAll('public.',schema+'.').replaceAll(schema+'.digest(','public.digest(').replaceAll("'public'::regnamespace",q(schema)+'::regnamespace').replace(/SET search_path\s*=\s*(?:pg_catalog,\s*)?public,\s*pg_temp/gi,'SET search_path=pg_catalog,'+schema+',public,pg_temp');
 const normalize=s=>s.replaceAll("replace(p.prosrc,E'\\r\\n',E'\\n')","replace(replace(p.prosrc,E'\\r\\n',E'\\n'),"+q(schema+'.')+",'public'||'.')");
 const statements=[];let count=0;const exec=s=>statements.push(s),ok=(s,label)=>{exec('PERFORM qa_assert(('+s+'),'+q(label)+');checks:=checks+1;');count++;};
 const reject=(sql,error,label)=>ok('qa_rejects('+sql+','+q('NATIVE_LEAVE_'+error)+')',label);
 const write=(actor,body='leave_body',key='gen_random_uuid()')=>'native_leave_command_v1('+actor+','+body+','+key+')';
 const rejectWrite=(body,error,label,actor='maker',key='gen_random_uuid()')=>reject('format('+q('SELECT '+write('%1$L::jsonb','%2$L::jsonb','%3$L::uuid'))+','+actor+','+body+','+key+')',error,label);
 const factory=(actor,cmd,payload='NULL::jsonb',entity='NULL::uuid',reason=q('Fundamento sintético QA para revisión'))=>'qa_leave_input('+[actor,'target_id',q(cmd),payload,entity,reason].join(',')+')';
 const temporary=(mutation,fn)=>{const start=statements.length;fn();exec("BEGIN "+mutation+' '+statements.splice(start).join('\n')+" RAISE EXCEPTION USING ERRCODE='P1112',MESSAGE='RESTORE_LEAVE_FAULT'; EXCEPTION WHEN SQLSTATE 'P1112' THEN NULL; END;");};
 exec(`${relocate(original('scripts/migrations/003-action-center.sql','action_center_valid_leave_payload'))};
 ${relocate(original('scripts/migrations/006-tenant-action-authority.sql','action_center_tenant_actor_authorized'))};
 REVOKE ALL ON FUNCTION action_center_valid_leave_payload(jsonb),action_center_tenant_actor_authorized(text,uuid,uuid,text,uuid,bigint,text,text,text,text) FROM PUBLIC,municontrol_actions_runtime_app;
 INSERT INTO capabilities SELECT m,k FROM(VALUES ${['maker','checker','samePerson','unlinked','outsider'].flatMap(actor=>['actions.read','leave.request.all.manage','leave.request.restricted.read','leave.request.restricted.decide'].map(cap=>'('+q(ids[actor])+'::uuid,'+q(cap)+')')).join(',')}) v(m,k) WHERE NOT EXISTS(SELECT 1 FROM capabilities c WHERE c.membership_id=v.m AND c.capability_key=v.k);
 INSERT INTO capabilities SELECT ${q(ids.reader)}::uuid,k FROM unnest(ARRAY['actions.read','leave.request.all.read','leave.request.restricted.read']) k WHERE NOT EXISTS(SELECT 1 FROM capabilities c WHERE c.membership_id=${q(ids.reader)}::uuid AND c.capability_key=k);
 EXECUTE ${q(normalize(relocate(migration)))};
 CREATE FUNCTION qa_leave_input(actor jsonb,target uuid,cmd text,payload_value jsonb,entity uuid,reason_value text) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,${schema},public,pg_temp AS $input$
 DECLARE b jsonb; expected integer:=0; BEGIN
  b:=native_leave_bootstrap_v1(actor,target);
  IF entity IS NOT NULL THEN SELECT (x->>'version')::integer INTO expected FROM jsonb_array_elements((b->'requests')||(b->'profileProposals')) x WHERE x->>'id'=entity::text; END IF;
  RETURN jsonb_build_object('contractId',b#>>'{subject,contractId}','identityToken',b#>>'{subject,identityToken}','scopeVersion',b->>'scopeVersion','employmentVersion',b#>>'{employment,version}','snapshotVersion',b->>'snapshotVersion','command',cmd,'entityId',entity,'expectedVersion',expected,'payload',payload_value,'reason',CASE WHEN cmd IN ('create','update_draft') THEN NULL ELSE reason_value END,'evidenceStatus',CASE WHEN cmd='approve' THEN 'verified' END,'manualValidationConfirmed',cmd IN ('approve','profile_approve'));
 END $input$;
 leave_canonical:=(SELECT md5(jsonb_agg(to_jsonb(ec) ORDER BY ec.id)::text) FROM employment_contract ec);
 leave_boot:=native_leave_bootstrap_v1(maker,target_id);`);
 ok("leave_boot->>'version'='native-leave-workflow.v1' AND leave_boot->>'complete'='true' AND leave_boot->'requests'='[]'::jsonb AND leave_boot->'balances'='[]'::jsonb",'native-only employee starts with no invented leave or entitlement');
 ok("encode(public.digest(native_leave_serialized_v1("+j(command())+"),'sha256'),'hex')="+q(nativeLeaveFingerprint(command())),'SQL and JavaScript hash all original fields identically');
 const funcs="p.pronamespace="+q(schema)+"::regnamespace AND p.proname LIKE 'native_leave_%'";
 ok("(SELECT count(*)=16 AND count(*) FILTER(WHERE has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE'))=3 FROM pg_proc p WHERE "+funcs+')','exactly three facades and thirteen private helpers');
 ok("NOT has_table_privilege('municontrol_actions_runtime_app','native_leave_event','SELECT') AND NOT has_table_privilege('municontrol_actions_runtime_app','native_leave_event','INSERT') AND(SELECT relrowsecurity FROM pg_class WHERE oid='native_leave_event'::regclass)",'private immutable RLS ledger has no runtime table access');
 exec('SET LOCAL ROLE municontrol_actions_runtime_app;leave_boot:=native_leave_bootstrap_v1(reader,target_id);RESET ROLE;');
 ok("leave_boot#>>'{permissions,canCreate}'='false' AND leave_boot#>>'{permissions,canProposeProfile}'='false'",'read authority cannot prepare requests or balances');
 exec('leave_body:='+factory('maker','create',j(annual()))+';');
 const areaScope=`DELETE FROM capabilities WHERE membership_id=${q(ids.maker)}::uuid AND capability_key='leave.request.all.manage';
 INSERT INTO capabilities VALUES(${q(ids.maker)}::uuid,'leave.request.area.create');
 INSERT INTO tenant_action_area_scope SELECT gen_random_uuid(),'leave.request.area.create','sector',ec.legacy_company_id,ec.organization_unit_source_id,ec.sector_source_id,${q(ids.maker)}::uuid,ec.tenant_id,${q(ids.binding)}::uuid,true FROM employment_contract ec WHERE ec.id=target_id;`;
 temporary(areaScope,()=>ok(write('maker')+"->>'status'='draft'",'real006 permits the native beneficiary only within the authorized sector'));
 temporary(areaScope+" UPDATE tenant_action_area_scope SET organization_unit_source_id='outside-qa' WHERE membership_id="+q(ids.maker)+"::uuid;",()=>rejectWrite('leave_body','FORBIDDEN','another organization never inherits sector creation authority'));
 temporary(areaScope+' UPDATE tenant_action_area_scope SET active=false WHERE membership_id='+q(ids.maker)+'::uuid;',()=>rejectWrite('leave_body','FORBIDDEN','revoked sector scope cannot create a native request'));
 for(const[field,error]of [['identityToken','IDENTITY_CHANGED'],['scopeVersion','SCOPE_CHANGED'],['employmentVersion','EMPLOYMENT_CHANGED'],['snapshotVersion','SNAPSHOT_CHANGED']])rejectWrite('leave_body||jsonb_build_object('+q(field)+",repeat('f',64))",error,'stale '+field);
 for(const patch of [{tenantId:ids.tenant},{expectedVersion:1},{command:'pay'},{reason:'ocultar'},{manualValidationConfirmed:true},{evidenceStatus:'verified'}])rejectWrite('leave_body||'+j(patch),'INPUT_INVALID','closed native input '+Object.keys(patch)[0]);
 rejectWrite('leave_body','FORBIDDEN','read-only actor cannot write','reader');
 rejectWrite('leave_body','EMPLOYMENT_REQUIRED','unlinked actor cannot write','unlinked');
 exec('SET LOCAL ROLE municontrol_actions_runtime_app;leave_receipt:='+write('maker','leave_body','leave_key')+';RESET ROLE;leave_id:=(leave_receipt->>\'entityId\')::uuid;');
 ok("leave_receipt->>'status'='draft' AND leave_receipt->>'payrollModified'='false'",'draft has no payroll or approved-leave effect');
 ok("(SELECT actor_session_id=(maker->>'actorSessionId')::uuid AND actor_session_version=(maker->>'actorSessionVersion')::integer AND release_sha=maker->>'releaseSha' AND actor_membership_id=(maker->>'membershipId')::uuid FROM native_leave_event WHERE request_key=leave_key)",'audit retains the authenticated original session and release instead of a reduced authorization context');
 ok(write('maker','leave_body','leave_key')+"-'replayed'=leave_receipt-'replayed' AND native_leave_attempt_v1(maker,target_id,leave_key)->>'replayed'='true'",'lost acknowledgement recovers the original receipt without another event');
 rejectWrite("leave_body||jsonb_build_object('payload',"+j(annual({endsOn:'2026-10-03'}))+')','IDEMPOTENCY_REUSE','same key never acknowledges different dates','maker','leave_key');
 exec('leave_body:='+factory('maker','submit','NULL::jsonb','leave_id')+';');
 rejectWrite('leave_body','BALANCE_UNAVAILABLE','unknown entitlement is never treated as zero or permission');
 exec('leave_receipt:='+write('maker',factory('maker','profile_propose',j(profile())))+';leave_profile_id:=(leave_receipt->>\'entityId\')::uuid;leave_body:='+factory('maker','profile_approve','NULL::jsonb','leave_profile_id')+';');
 rejectWrite('leave_body','MAKER_CHECKER_REQUIRED','author cannot approve own declared balance');
 exec('leave_body:='+factory('same_person','profile_approve','NULL::jsonb','leave_profile_id')+';');
 rejectWrite('leave_body','MAKER_CHECKER_REQUIRED','another membership of the same person cannot approve balance','same_person');
 exec('leave_receipt:='+write('checker',factory('checker','profile_approve','NULL::jsonb','leave_profile_id'))+';leave_boot:=native_leave_bootstrap_v1(maker,target_id);');
 ok("leave_boot#>>'{balances,0,availableUnits}'='20'",'independently reviewed balance retains explicit integer units');
 exec('leave_receipt:='+write('maker',factory('maker','submit','NULL::jsonb','leave_id'))+';leave_boot:=native_leave_bootstrap_v1(maker,target_id);');
 ok("leave_boot#>>'{balances,0,reservedUnits}'='2' AND leave_boot#>>'{balances,0,availableUnits}'='18'",'submission reserves exact civil days once');
 exec('leave_body:='+factory('maker','approve','NULL::jsonb','leave_id')+';');rejectWrite('leave_body','MAKER_CHECKER_REQUIRED','request preparer cannot approve own request');
 exec('leave_body:='+factory('checker','approve','NULL::jsonb','leave_id')+';');rejectWrite("leave_body||'{\"manualValidationConfirmed\":false}'",'EVIDENCE_REQUIRED','approval requires explicit human confirmation','checker');
 exec('leave_receipt:='+write('checker')+';leave_boot:=native_leave_bootstrap_v1(maker,target_id);');
 ok("leave_boot#>>'{balances,0,reservedUnits}'='0' AND leave_boot#>>'{balances,0,approvedUnits}'='2' AND leave_boot#>>'{balances,0,availableUnits}'='18'",'approval changes reservation into approved units without a second debit');
 exec('leave_body:='+factory('same_person','cancel','NULL::jsonb','leave_id')+';');rejectWrite('leave_body','MAKER_CHECKER_REQUIRED','preparer alternate membership cannot cancel an approved request','same_person');
 exec('leave_receipt:='+write('maker',factory('maker','create',j(annual())))+';leave_other_id:=(leave_receipt->>\'entityId\')::uuid;leave_body:='+factory('maker','submit','NULL::jsonb','leave_other_id')+';');rejectWrite('leave_body','OVERLAP','overlap never omits or double-reserves an approved request');
 temporary(`DELETE FROM capabilities WHERE membership_id=${q(ids.maker)}::uuid AND capability_key='actions.read';`,()=>rejectWrite('leave_body','FORBIDDEN','revoked action authority prevents writes'));
 rejectWrite('leave_body','SESSION_INVALID','a withdrawn original session never writes','maker||jsonb_build_object(\'actorSessionId\',gen_random_uuid())');
 rejectWrite('leave_body','FORBIDDEN','an uncertified release never writes','maker||jsonb_build_object(\'releaseSha\',repeat(\'f\',40))');
 exec('leave_receipt:='+write('checker',factory('checker','cancel','NULL::jsonb','leave_id'))+';leave_boot:=native_leave_bootstrap_v1(maker,target_id);');
 ok("leave_boot#>>'{balances,0,approvedUnits}'='0' AND leave_boot#>>'{balances,0,availableUnits}'='20'",'authorized independent cancellation releases balance and keeps all approved history');
 exec('leave_receipt:='+write('maker',factory('maker','profile_propose',j(profile({year:2027,entitledUnits:0}))))+';leave_profile_id:=(leave_receipt->>\'entityId\')::uuid;PERFORM '+write('checker',factory('checker','profile_approve','NULL::jsonb','leave_profile_id'))+';leave_receipt:='+write('maker',factory('maker','create',j(annual({startsOn:'2027-01-01',endsOn:'2027-01-01'}))))+';leave_extra_id:=(leave_receipt->>\'entityId\')::uuid;leave_body:='+factory('maker','submit','NULL::jsonb','leave_extra_id')+';');
 rejectWrite('leave_body','BALANCE_INSUFFICIENT','explicit zero is retained and cannot reserve a day');
 exec('leave_receipt:='+write('maker',factory('maker','profile_propose',j(profile({year:2027,entitledUnits:1}))))+';leave_profile_id:=(leave_receipt->>\'entityId\')::uuid;PERFORM '+write('checker',factory('checker','profile_approve','NULL::jsonb','leave_profile_id'))+';leave_receipt:='+write('maker',factory('maker','create',j(annual({startsOn:'2026-12-31',endsOn:'2027-01-01'}))))+';leave_extra_id:=(leave_receipt->>\'entityId\')::uuid;PERFORM '+write('maker',factory('maker','submit','NULL::jsonb','leave_extra_id'))+';leave_boot:=native_leave_bootstrap_v1(maker,target_id);');
 ok("(SELECT b->>'reservedUnits'='1' AND b->>'availableUnits'='0' FROM jsonb_array_elements(leave_boot->'balances') b WHERE b->>'year'='2027' AND b->>'reasonCode'='19')",'cross-year request reserves both years without dropping the second portion');
 exec('PERFORM '+write('checker',factory('checker','reject','NULL::jsonb','leave_extra_id'))+';leave_boot:=native_leave_bootstrap_v1(maker,target_id);');
 ok("(SELECT b->>'reservedUnits'='0' AND b->>'availableUnits'='1' FROM jsonb_array_elements(leave_boot->'balances') b WHERE b->>'year'='2027' AND b->>'reasonCode'='19')",'rejection releases reservation without recording approved time');
 const minutePayload=annual({reasonCode:'13',policyRuleId:'lactation',startsOn:'2026-10-03',endsOn:'2026-10-03',durationUnit:'minute',startsAtLocal:'09:00',endsAtLocal:'09:30',confidentiality:'restricted'});
 exec('leave_receipt:='+write('maker',factory('maker','profile_propose',j(profile({reasonCode:'13',durationUnit:'minute',mode:'not_applicable',entitledUnits:null}))))+';leave_profile_id:=(leave_receipt->>\'entityId\')::uuid;PERFORM '+write('checker',factory('checker','profile_approve','NULL::jsonb','leave_profile_id'))+';leave_receipt:='+write('maker',factory('maker','create',j(minutePayload)))+';leave_extra_id:=(leave_receipt->>\'entityId\')::uuid;PERFORM '+write('maker',factory('maker','submit','NULL::jsonb','leave_extra_id'))+';leave_body:='+factory('checker','approve','NULL::jsonb','leave_extra_id')+';');
 rejectWrite("leave_body||'{\"evidenceStatus\":\"not_required\"}'",'EVIDENCE_REQUIRED','restricted approval never substitutes not-required evidence for verified evidence','checker');
 exec('PERFORM '+write('checker')+';leave_boot:=native_leave_bootstrap_v1(maker,target_id);');
 ok("(SELECT b->>'approvedUnits'='30' AND b->'availableUnits'='null'::jsonb AND b->>'mode'='not_applicable' FROM jsonb_array_elements(leave_boot->'balances') b WHERE b->>'reasonCode'='13' AND b->>'durationUnit'='minute')",'thirty exact approved minutes remain minutes and no entitlement is invented');
 temporary(`DELETE FROM capabilities WHERE membership_id=${q(ids.reader)}::uuid AND capability_key='leave.request.restricted.read';`,()=>reject('format('+q('SELECT native_leave_bootstrap_v1(%L::jsonb,%L::uuid)')+',reader,target_id)','FORBIDDEN','full disclosure fails closed when restricted access is withdrawn'));
 exec('leave_receipt:='+write('maker',factory('maker','profile_propose',j(profile({year:2028,entitledUnits:100}))))+';leave_profile_id:=(leave_receipt->>\'entityId\')::uuid;PERFORM '+write('checker',factory('checker','profile_approve','NULL::jsonb','leave_profile_id'))+';FOR leave_n IN 0..74 LOOP leave_receipt:='+write('maker',factory('maker','create',"jsonb_set(jsonb_set("+j(annual())+",'{startsOn}',to_jsonb(to_char(DATE '2028-01-01'+leave_n,'YYYY-MM-DD'))),'{endsOn}',to_jsonb(to_char(DATE '2028-01-01'+leave_n,'YYYY-MM-DD')))") )+';leave_extra_id:=(leave_receipt->>\'entityId\')::uuid;PERFORM '+write('maker',factory('maker','submit','NULL::jsonb','leave_extra_id'))+';PERFORM '+write('checker',factory('checker','approve','NULL::jsonb','leave_extra_id'))+';END LOOP;leave_boot:=native_leave_bootstrap_v1(maker,target_id);');
 ok("jsonb_array_length(leave_boot->'requests')>75 AND (SELECT b->>'approvedUnits'='75' AND b->>'availableUnits'='25' FROM jsonb_array_elements(leave_boot->'balances') b WHERE b->>'year'='2028' AND b->>'reasonCode'='19')",'real ledger includes every request across multiple pages and sums all75 approved days');
 exec('leave_receipt:='+write('maker',factory('maker','profile_propose',j(profile({year:2028,entitledUnits:74}))))+';leave_profile_id:=(leave_receipt->>\'entityId\')::uuid;leave_body:='+factory('checker','profile_approve','NULL::jsonb','leave_profile_id')+';');
 rejectWrite('leave_body','BALANCE_CONFLICT','replacement balance below approved units rolls back atomically','checker');
 for(const op of ['UPDATE native_leave_event SET reason=reason','DELETE FROM native_leave_event','TRUNCATE native_leave_event'])reject(q(op),'IMMUTABLE','immutable history '+op.split(' ')[0]);
 ok("(SELECT md5(jsonb_agg(to_jsonb(ec) ORDER BY ec.id)::text) FROM employment_contract ec)=leave_canonical",'every original canonical employee column is preserved');
 reject(q(relocate(migration)),'ALREADY_INSTALLED','second installation fails before changing objects');
 const block=`DECLARE leave_canonical text;leave_boot jsonb;leave_body jsonb;leave_receipt jsonb;leave_key uuid:=gen_random_uuid();leave_id uuid;leave_other_id uuid;leave_profile_id uuid;leave_extra_id uuid;leave_n integer; BEGIN BEGIN ${statements.join('\n')} RAISE EXCEPTION USING ERRCODE='P1111',MESSAGE='RESTORE_LEAVE_FIXTURES';EXCEPTION WHEN SQLSTATE 'P1111' THEN NULL;END;END;`;
 const anchor='-- LIFECYCLE_ROSTER_QA_ANCHOR';assert.equal(base.sql.split(anchor).length,2);
 const report={...base.report,nativeLeaveChecksPassed:count,checksPassed:base.report.checksPassed+count,migration111Sha256:createHash('sha256').update(migration).digest('hex'),limitations:[...base.report.limitations,'111 uses original006 scope authorization and003 payload validation with synthetic IAM tables. It is not a productive installation, native employee login acceptance or payroll calculation.']};
 const sql=base.sql.replace(anchor,()=>block+'\n'+anchor).replace('checks<>'+base.report.checksPassed,'checks<>'+report.checksPassed).replace(j(base.report),()=>j(report));return{...base,sql:sql.replace("SET LOCAL statement_timeout='90s'","SET LOCAL statement_timeout='180s'"),lockSql:base.lockSql.replace('SELECT pg_sleep(45)','SELECT pg_sleep(180)'),report};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const args={};for(const a of process.argv.slice(2)){if(a==='--ci'||a==='--require-concurrency'){args[a.slice(2)]=true;continue;}const m=/^--(expected-major|write-sql|write-lock-sql)=(.+)$/.exec(a);assert.ok(m);assert.equal(args[m[1]],undefined);args[m[1]]=m[2];}assert.equal(args.ci,true);assert.ok(args['write-sql']);assert.ok(!args['require-concurrency']||args['write-lock-sql']);const qa=buildNativeLeaveQa({serverMajor:args['expected-major'],requireConcurrency:!!args['require-concurrency']});for(const[key,data]of [['write-sql',qa.sql],['write-lock-sql',qa.lockSql]])if(args[key]){const target=path.resolve(args[key]);assert.ok(!fs.existsSync(target));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data,{flag:'wx'});}console.log(JSON.stringify({generated:true,databaseExecuted:false,checksPlanned:qa.report.checksPassed,nativeLeaveChecksPlanned:qa.report.nativeLeaveChecksPassed}));}catch(error){console.error(JSON.stringify({ok:false,message:error.message}));process.exitCode=1;}
}
