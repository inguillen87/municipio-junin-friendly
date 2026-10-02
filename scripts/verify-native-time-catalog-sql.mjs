// Disposable PostgreSQL17/18, actual010/011 commands and067/093/104/110 identity.
// Synthetic IAM fixtures; real004 duties check. Everything rolls back.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {buildNativeEmploymentLifecycleQa} from './verify-native-employment-lifecycle-sql.mjs';
import {splitPostgresStatements} from './lib/sql-statements.mjs';
import {nativeTimePrerequisiteSource} from './prepare-native-time-catalog.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=n=>fs.readFileSync(path.join(root,'scripts/migrations',n),'utf8').replaceAll('\r\n','\n');
const q=v=>"'"+String(v).replaceAll("'","''")+"'",j=v=>q(JSON.stringify(v))+'::jsonb';
export function buildNativeTimeCatalogQa({serverMajor,requireConcurrency=false}){
 const base=buildNativeEmploymentLifecycleQa({serverMajor,requireConcurrency}),{schema,ids}=base;
 const busyContract=randomUUID();
 const relocate=s=>s.replaceAll('public.',schema+'.').replaceAll(schema+'.digest(','public.digest(')
  .replaceAll("'public'::regnamespace",q(schema)+'::regnamespace')
  .replace(/SET search_path\s*=\s*(?:pg_catalog,\s*)?public,\s*pg_temp/gi,'SET search_path=pg_catalog,'+schema+',public,pg_temp');
 const normalize=s=>s.replaceAll("replace(p.prosrc,E'\\r\\n',E'\\n')","replace(replace(p.prosrc,E'\\r\\n',E'\\n'),"+q(schema+'.')+",'public'||'.')");
 const function004=name=>splitPostgresStatements(read('004-tenant-iam-control-plane.sql')).find(s=>s.includes('CREATE OR REPLACE FUNCTION '+name+'('));
 const scripts=[];let count=0;
 const exec=s=>scripts.push(s),ok=(s,label)=>{exec('PERFORM qa_assert(('+s+'),'+q(label)+');checks:=checks+1;');count++;};
 const args=(actor='maker')=>actor+"->>'actorEmail',("+actor+"->>'actorSessionId')::uuid,("+actor+"->>'actorSessionVersion')::integer,"+actor+"->>'releaseSha',("+actor+"->>'tenantId')::uuid,("+actor+"->>'membershipId')::uuid";
 const command=(cmd,actor='maker',entry='NULL',version=0,kind='NULL',payload='NULL',key='gen_random_uuid()')=>`time_catalog_apply_command_v1(${args(actor)},${q(cmd)},${key},${entry},${version},${kind==='NULL'?kind:q(kind)},${payload},repeat('a',64),${q({create_draft:'catalog_onboarding',update_draft:'draft_corrected',submit:'ready_for_review',approve:'configuration_verified',reject:'configuration_invalid',retire:'catalog_retired'}[cmd])},repeat('b',64))`;
 const reject=(call,error,label)=>ok('qa_rejects('+call+','+q(error)+')',label);
 const fault=(mutation,check)=>exec("BEGIN "+mutation+" "+check+" RAISE EXCEPTION USING ERRCODE='P1162',MESSAGE='RESTORE_TIME_FAULT'; EXCEPTION WHEN SQLSTATE 'P1162' THEN NULL; END;");
 exec(`ALTER TABLE tenant_action_authority ADD COLUMN version integer NOT NULL DEFAULT 1;
 ALTER TABLE iam_role ADD COLUMN label text,ADD COLUMN description text,ADD COLUMN system_managed boolean;
 ${relocate(function004('tenant_iam_reject_change'))};
 EXECUTE ${q(relocate(read('010-governed-time-source-registry.sql')))};
 EXECUTE ${q(relocate(read('011-versioned-time-catalog.sql')))};
 CREATE FUNCTION tenant_iam_operational_person_pair_v1(uuid,uuid,uuid,text) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS 'SELECT false';
 REVOKE ALL ON FUNCTION tenant_iam_operational_person_pair_v1(uuid,uuid,uuid,text) FROM PUBLIC,municontrol_actions_runtime_app;
 ${relocate(splitPostgresStatements(nativeTimePrerequisiteSource()).find(s=>s.includes('CREATE OR REPLACE FUNCTION time_catalog_assert_person_sod_v1(')))};
 time_old_proof:=(SELECT jsonb_agg(jsonb_build_object('oid',p.oid,'owner',p.proowner,'acl',p.proacl,'name',p.proname) ORDER BY p.proname) FROM pg_proc p WHERE p.pronamespace=${q(schema)}::regnamespace AND p.proname IN ('time_catalog_assert_actor_authority_v1','time_catalog_assert_person_sod_v1','time_catalog_guard_entry_v1','time_catalog_assert_approvable_v1'));
 time_native_payload:=legacy_draft||jsonb_build_object('legajo','','dni','99000310','cuil','20990003107','fullName','Actor propio sintético','startDate','2020-01-01');
 time_native_receipt:=native_employee_create_v1(maker,time_native_payload,native_employee_bootstrap_v1(maker)#>>'{catalog,version}',gen_random_uuid());
 time_native_contract:=(time_native_receipt->>'contractId')::uuid;
 time_native_person:=(SELECT person_id FROM employment_contract WHERE id=time_native_contract);
 time_native_receipt:=native_employee_create_v1(maker,legacy_draft||jsonb_build_object('legajo','','dni','99000320','cuil','20990003204','fullName','Revisor propio sintético','startDate','2020-01-01'),native_employee_bootstrap_v1(maker)#>>'{catalog,version}',gen_random_uuid());
 time_native_checker:=(time_native_receipt->>'contractId')::uuid;
 time_native_receipt:=native_employee_create_v1(maker,legacy_draft||jsonb_build_object('legajo','','dni','99000330','cuil','20990003301','fullName','Actor futuro sintético','startDate','2099-01-01'),native_employee_bootstrap_v1(maker)#>>'{catalog,version}',gen_random_uuid());
 time_future_contract:=(time_native_receipt->>'contractId')::uuid;
 -- The inherited catalog QA deliberately leaves a self-review capability on
 -- its maker. Define isolated temporal-only profiles after those tests have
 -- run; no production account or original regression assertion is modified.
 DELETE FROM capabilities WHERE membership_id IN (${q(ids.maker)}::uuid,${q(ids.checker)}::uuid,${q(ids.samePerson)}::uuid,${q(ids.reader)}::uuid);
 INSERT INTO capabilities SELECT id,'time.catalog.read' FROM tenant_membership WHERE id IN (${q(ids.maker)}::uuid,${q(ids.checker)}::uuid,${q(ids.samePerson)}::uuid,${q(ids.reader)}::uuid);
 INSERT INTO capabilities VALUES (${q(ids.maker)}::uuid,'time.catalog.propose'),(${q(ids.checker)}::uuid,'time.catalog.approve');
 ${relocate(function004('tenant_iam_assert_no_sod_conflict'))};
 REVOKE ALL ON FUNCTION tenant_iam_reject_change(),tenant_iam_assert_no_sod_conflict(uuid) FROM PUBLIC,municontrol_actions_runtime_app;
 time_canonical_proof:=(SELECT jsonb_agg(to_jsonb(ec) ORDER BY ec.id) FROM employment_contract ec);
 time_original_link:=(SELECT to_jsonb(l) FROM tenant_action_employment_link l WHERE membership_id=${q(ids.maker)}::uuid);
 UPDATE tenant_action_employment_link SET employment_contract_id=time_native_contract WHERE membership_id=${q(ids.maker)}::uuid;
 `);
 reject('format('+q('SELECT time_catalog_bootstrap_v1(%1$L,%2$L::uuid,1,%3$L,%4$L::uuid,%5$L::uuid)')+',maker->>\'actorEmail\',maker->>\'actorSessionId\',maker->>\'releaseSha\',maker->>\'tenantId\',maker->>\'membershipId\')','TIME_CATALOG_EMPLOYMENT_REQUIRED','011 actually blocks an actor created solely in MuniControl before116');
 exec('EXECUTE '+q(normalize(relocate(read('116-native-time-catalog.sql'))))+';');
 ok(`time_old_proof=(SELECT jsonb_agg(jsonb_build_object('oid',p.oid,'owner',p.proowner,'acl',p.proacl,'name',p.proname) ORDER BY p.proname) FROM pg_proc p WHERE p.pronamespace=${q(schema)}::regnamespace AND p.proname IN ('time_catalog_assert_actor_authority_v1','time_catalog_assert_person_sod_v1','time_catalog_guard_entry_v1','time_catalog_assert_approvable_v1'))`,'116 keeps the original4 OIDs, owners and ACLs');
 exec('time_boot:=time_catalog_bootstrap_v1('+args()+');');
 ok("time_boot->>'catalogReady'='false' AND time_boot->>'minutesCalculated'='false' AND time_boot->>'payrollPosted'='false'",'native catalog access does not assert attendance or payroll autonomy');
 ok(`time_catalog_native_actor_v2(${q(ids.tenant)}::uuid,${q(ids.binding)}::uuid,${q(ids.maker)}::uuid)=time_native_person`,'own actor resolves through immutable canonical registration');
 ok(`time_catalog_native_subject_v2(${q(ids.tenant)}::uuid,${q(ids.binding)}::uuid,target_id,'2026-09-23','2026-10-01')=(SELECT person_id FROM employment_contract WHERE id=target_id)`,'inclusive closing date remains a valid native assignment');
 reject('format('+q('SELECT time_catalog_native_subject_v2(%L::uuid,%L::uuid,%L::uuid,%L::date,%L::date)')+','+q(ids.tenant)+','+q(ids.binding)+",target_id,'2026-09-23','2027-02-01')",'TIME_CATALOG_NATIVE_PERIOD_INVALID','an assignment cannot bridge the recorded termination and reentry gap');
 ok(`time_catalog_native_subject_v2(${q(ids.tenant)}::uuid,${q(ids.binding)}::uuid,target_id,'2027-02-01',NULL)=(SELECT person_id FROM employment_contract WHERE id=target_id)`,'reentry keeps the same contract and permits its new open period');
 const payload={effectiveFrom:'2026-09-01',effectiveTo:'2027-12-31',logicalKeyHash:'c'.repeat(64),revision:1,timezone:'America/Argentina/Mendoza',spec:{days:[{date:'2026-09-23',kind:'working',code:'qa_day'}]}};
 exec('time_payload:='+j(payload)+';time_key:=gen_random_uuid();time_receipt:='+command('create_draft','maker','NULL',0,'calendar','time_payload','time_key')+";time_calendar:=(time_receipt#>>'{data,id}')::uuid;");
 ok("time_receipt#>>'{data,status}'='draft' AND time_receipt#>>'{data,kind}'='calendar'",'actual011 writer creates the draft with a native proposer');
 ok(command('create_draft','maker','NULL',0,'calendar','time_payload','time_key')+"->>'replayed'='true'",'exact same-key and same-body retry preserves its receipt');
 exec('time_receipt:='+command('submit','maker','time_calendar',1)+';');
 ok("time_receipt#>>'{data,status}'='submitted'",'native proposer submits for independent review');
 exec('time_receipt:='+command('approve','checker','time_calendar',2)+';');
 ok("time_receipt#>>'{data,status}'='approved'",'original certified GRH approver can approve a native proposal');
 exec(`UPDATE tenant_action_employment_link SET employment_contract_id=time_native_checker WHERE membership_id=${q(ids.checker)}::uuid;`);
 ok(`time_catalog_native_actor_v2(${q(ids.tenant)}::uuid,${q(ids.binding)}::uuid,${q(ids.checker)}::uuid)=(SELECT person_id FROM employment_contract WHERE id=time_native_checker)`,'approver is now a separately registered native person with no GRH contract or batch');
 exec("time_payload:=jsonb_set(time_payload,'{logicalKeyHash}',to_jsonb(repeat('d',64)));time_payload:=jsonb_set(time_payload,'{spec}',"+j({entryToleranceSeconds:0,exitToleranceSeconds:0,intervals:[{day:1,sequence:1,kind:'work',start:'08:00:00',end:'16:00:00',crossesMidnight:false}]})+");time_receipt:="+command('create_draft','maker','NULL',0,'shift','time_payload')+";time_shift:=(time_receipt#>>'{data,id}')::uuid;time_receipt:="+command('submit','maker','time_shift',1)+';time_receipt:='+command('approve','checker','time_shift',2)+';');
 ok("time_receipt#>>'{data,status}'='approved'",'native shift follows the existing create/submit/approve circuit');
 exec("time_payload:=jsonb_set(time_payload,'{logicalKeyHash}',to_jsonb(repeat('e',64)));time_payload:=jsonb_set(time_payload,'{spec}',"+j({parameters:[{key:'qa_decimal',valueKind:'decimal',value:1.125,unitCode:'qa_units'}]})+");time_receipt:="+command('create_draft','maker','NULL',0,'rule_profile','time_payload')+";time_rules:=(time_receipt#>>'{data,id}')::uuid;time_receipt:="+command('submit','maker','time_rules',1)+';time_receipt:='+command('approve','checker','time_rules',2)+';');
 ok("time_receipt#>>'{data,status}'='approved' AND (SELECT decimal_value=1.125::numeric FROM time_rule_parameter WHERE catalog_entry_id=time_rules)",'explicit synthetic rule retains the original SQL numeric value; no municipal formula inferred');
 exec("time_payload:=jsonb_set(time_payload,'{logicalKeyHash}',to_jsonb(repeat('f',64)));time_payload:=jsonb_set(time_payload,'{effectiveFrom}',to_jsonb('2026-09-23'::text));time_payload:=jsonb_set(time_payload,'{effectiveTo}',to_jsonb('2026-10-01'::text));time_payload:=jsonb_set(time_payload,'{spec}',jsonb_build_object('employmentContractId',target_id,'shiftEntryId',time_shift,'calendarEntryId',time_calendar,'ruleProfileEntryId',time_rules));time_receipt:="+command('create_draft','maker','NULL',0,'assignment','time_payload')+";time_assignment:=(time_receipt#>>'{data,id}')::uuid;time_receipt:="+command('submit','maker','time_assignment',1)+';time_receipt:='+command('approve','checker','time_assignment',2)+';');
 ok("time_receipt#>>'{data,status}'='approved' AND time_receipt#>>'{data,configuration,targetProjected}'='false'",'actual native assignment is approved without nominal projection or GRH target');
 exec("time_payload:=jsonb_set(time_payload,'{logicalKeyHash}',to_jsonb(repeat('1',64)));time_payload:=jsonb_set(time_payload,'{effectiveTo}',to_jsonb('2027-02-01'::text));time_receipt:="+command('create_draft','maker','NULL',0,'assignment','time_payload')+";time_gap:=(time_receipt#>>'{data,id}')::uuid;");
 reject('format('+q('SELECT '+command('submit','(%1$L::jsonb)','%2$L::uuid',1))+',maker,time_gap)','TIME_CATALOG_NATIVE_PERIOD_INVALID','submission rejects a native assignment spanning a gap, not just final approval');
 // Revocations occur inside subtransactions solely to test authorization, then roll back.
 fault(`UPDATE tenant_membership SET status='suspended' WHERE id=${q(ids.maker)}::uuid;`,"PERFORM qa_assert(qa_rejects(format("+q('SELECT time_catalog_bootstrap_v1(%1$L,%2$L::uuid,1,%3$L,%4$L::uuid,%5$L::uuid)')+",maker->>'actorEmail',maker->>'actorSessionId',maker->>'releaseSha',maker->>'tenantId',maker->>'membershipId'),'TIME_SOURCE_SESSION_INVALID'),'revoked membership blocks native read');checks:=checks+1;");count++;
 fault(`UPDATE tenant_action_employment_link SET active=false WHERE membership_id=${q(ids.maker)}::uuid;`,"PERFORM qa_assert(qa_rejects(format("+q('SELECT time_catalog_native_actor_v2(%L::uuid,%L::uuid,%L::uuid)')+','+q(ids.tenant)+','+q(ids.binding)+','+q(ids.maker)+"),'TIME_CATALOG_EMPLOYMENT_REQUIRED'),'revoked native link blocks use');checks:=checks+1;");count++;
 fault(`UPDATE tenant_action_employment_link SET employment_contract_id=time_future_contract WHERE membership_id=${q(ids.reader)}::uuid;`,"PERFORM qa_assert(qa_rejects(format("+q('SELECT time_catalog_native_actor_v2(%L::uuid,%L::uuid,%L::uuid)')+','+q(ids.tenant)+','+q(ids.binding)+','+q(ids.reader)+"),'TIME_CATALOG_NATIVE_PERIOD_INVALID'),'future native employment cannot authorize a current operator');checks:=checks+1;");count++;
 fault(`UPDATE tenant_action_employment_link SET employment_contract_id=time_native_contract WHERE membership_id=${q(ids.reader)}::uuid;`,"PERFORM qa_assert(qa_rejects(format("+q('SELECT '+command('create_draft','(%1$L::jsonb)','NULL',0,'calendar','%2$L::jsonb'))+",reader,"+j(payload)+"),'TIME_CATALOG_CAPABILITY_REQUIRED'),'a native read-only account cannot propose');checks:=checks+1;");count++;
 reject('format('+q('SELECT time_catalog_native_subject_v2(%L::uuid,%L::uuid,%L::uuid,%L::date,%L::date)')+','+q(ids.foreignTenant)+','+q(ids.foreignBinding)+",time_native_contract,'2026-09-01','2026-09-30')",'TIME_CATALOG_ASSIGNMENT_CONTRACT_INVALID','a native contract from another tenant cannot be assigned');
 fault(`UPDATE tenant_action_employment_link SET employment_contract_id=time_native_contract WHERE membership_id=${q(ids.samePerson)}::uuid; INSERT INTO capabilities VALUES(${q(ids.samePerson)}::uuid,'time.catalog.approve');`,"PERFORM qa_assert(qa_rejects(format("+q('SELECT time_catalog_assert_person_sod_v1(%L::uuid,%L::uuid,%L::uuid)')+','+q(ids.tenant)+',time_native_person,'+q(ids.binding)+"),'TIME_CATALOG_PERSON_SOD_CONFLICT'),'native person cannot split proposal and approval across accounts');checks:=checks+1;");count++;
 fault(`INSERT INTO capabilities VALUES(${q(ids.maker)}::uuid,'time.catalog.approve');`,"PERFORM qa_assert(qa_rejects(format("+q('SELECT tenant_iam_assert_no_sod_conflict(%L::uuid)')+','+q(ids.maker)+"),'TENANT_IAM_SOD_CONFLICT'),'real004 blocks conflicting capabilities on one account');checks:=checks+1;");count++;
 if(requireConcurrency){
  reject('format('+q('SELECT time_catalog_native_subject_v2(%L::uuid,%L::uuid,%L::uuid,%L::date,%L::date)')+','+q(ids.tenant)+','+q(ids.binding)+','+q(busyContract)+",'2026-09-01','2026-09-30')",'TIME_CATALOG_SESSION_BUSY','independent connection holds the same110 work-period lock used by native catalog');
 }
 ok('time_canonical_proof=(SELECT jsonb_agg(to_jsonb(ec) ORDER BY ec.id) FROM employment_contract ec)','all canonical GRH and native rows are unchanged by the catalog circuit');
 ok("(SELECT count(*)=3 AND bool_and(NOT has_function_privilege('municontrol_actions_runtime_app',p.oid,'EXECUTE')) FROM pg_proc p WHERE p.pronamespace="+q(schema)+"::regnamespace AND p.proname IN ('time_catalog_native_subject_v2','time_catalog_native_actor_v2','time_catalog_native_person_caps_v2'))",'all3 new helpers are private and cannot be called by the app runtime');
 reject(q(normalize(relocate(read('116-native-time-catalog.sql')))),'TIME_CATALOG_NATIVE_ALREADY_INSTALLED','reinstallation fails before changing the installed catalog');
 const block=`DECLARE time_old_proof jsonb;time_native_payload jsonb;time_native_receipt jsonb;time_native_contract uuid;time_native_checker uuid;time_future_contract uuid;time_native_person uuid;time_canonical_proof jsonb;time_original_link jsonb;time_boot jsonb;time_payload jsonb;time_key uuid;time_receipt jsonb;time_calendar uuid;time_shift uuid;time_rules uuid;time_assignment uuid;time_gap uuid; BEGIN BEGIN ${scripts.join('\n')} RAISE EXCEPTION USING ERRCODE='P1161',MESSAGE='RESTORE_TIME_FIXTURES'; EXCEPTION WHEN SQLSTATE 'P1161' THEN NULL; END;END;`;
 const anchor="RAISE EXCEPTION USING ERRCODE='P1101',MESSAGE='RESTORE_LIFECYCLE_FIXTURES';";assert.equal(base.sql.split(anchor).length,2);
 const report={...base.report,timeCatalogChecksPassed:count,checksPassed:base.report.checksPassed+count,migration116Sha256:createHash('sha256').update(read('116-native-time-catalog.sql')).digest('hex'),limitations:[...base.report.limitations,'Temporal catalog010/011 commands and004 conflict assertion are real; memberships and effective-capability sets are synthetic fixtures. The installed operational pair exception is retained byte-for-byte but its helper returns false in this QA; no exception grant is exercised. No operator UI, attendance evaluator, municipal rule, clock operation or Production installation is proved.']};
 let sql=base.sql.replace(anchor,()=>block+'\n'+anchor).replace('checks<>'+base.report.checksPassed,'checks<>'+report.checksPassed).replace(j(base.report),()=>j(report));
 let lockSql=base.lockSql;if(requireConcurrency)lockSql=lockSql.replace(" SELECT 'FIXED_NOVELTIES_QA_LOCK_READY'"," SELECT pg_advisory_xact_lock(hashtextextended("+q('native-employment-lifecycle:v1:'+ids.tenant+':'+ids.binding+':'+busyContract)+",0));\n SELECT 'FIXED_NOVELTIES_QA_LOCK_READY'");
 return {...base,sql:sql.replaceAll('native_employment_lifecycle_qa','native_time_catalog_qa'),lockSql:lockSql.replaceAll('native_employment_lifecycle_qa','native_time_catalog_qa'),report};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args={};for(const a of process.argv.slice(2)){if(a==='--ci'||a==='--require-concurrency'){args[a.slice(2)]=true;continue;}const m=/^--(expected-major|write-sql|write-lock-sql)=(.+)$/.exec(a);assert.ok(m);assert.equal(args[m[1]],undefined);args[m[1]]=m[2];}
 assert.equal(args.ci,true);assert.ok(args['write-sql']);assert.ok(!args['require-concurrency']||args['write-lock-sql']);
 const qa=buildNativeTimeCatalogQa({serverMajor:args['expected-major'],requireConcurrency:!!args['require-concurrency']});
 for(const [key,data] of [['write-sql',qa.sql],['write-lock-sql',qa.lockSql]])if(args[key]){const p=path.resolve(args[key]);assert.ok(!fs.existsSync(p),'Output exists');fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,data,{flag:'wx'});}
 console.log(JSON.stringify({generated:true,databaseExecuted:false,checksPlanned:qa.report.checksPassed,timeCatalogChecksPlanned:qa.report.timeCatalogChecksPassed}));
}
