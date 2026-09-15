// Temporary committed fixtures only in the authorized existing local restore.
// Exact inverse teardown; no broad prefix deletion and no CASCADE on base objects.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { employeeFamilyLocalSnapshot } from './rehearse-employee-family-members-local.mjs';

export const EMPLOYEE_FAMILY_064_FUNCTIONS=[
 'school_certificate_download_v2(text,uuid,integer,text,uuid,uuid,uuid)',
 'school_certificate_register_v2(text,uuid,integer,text,uuid,uuid,jsonb,text)',
 'school_certificate_read_v2(text,uuid,integer,text,uuid,uuid,uuid)',
 'school_certificate_current_family_v2(jsonb,uuid)',
 'employee_family_declare_v1(text,uuid,integer,text,uuid,uuid,jsonb,text)',
 'employee_family_context_v1(text,uuid,integer,text,uuid,uuid,uuid)',
 'employee_family_subject_v1(jsonb,uuid,boolean)',
 'employee_family_identity_matches_v1(text,date,text,text,date,text)',
 'employee_family_name_key_v1(text)',
];
const principal=c=>[c.email,c.session,1,c.release,c.tenant,c.membership];
const DECLARE='SELECT public.employee_family_declare_v1($1::text,$2::uuid,$3::integer,$4::text,$5::uuid,$6::uuid,$7::jsonb,$8::text) result';
const reject=(condition,label)=>assert.ok(condition,label);
export async function rehearseEmployeeFamilyConcurrency({admin,first,second,savePrivateEvidence}){
 const report={version:'employee-family-concurrency.v1',localOnly:true,productionWrites:false,temporaryLocalCommit:false,cleanupConfirmed:false,passed:[]};
 let before,installed=false,fixture=null,other=null,originalSchemaUsage=false;
 try{
  for(const client of [admin,first,second]){
   const t=(await client.query("SELECT current_database() database,inet_server_addr()::text host,inet_server_port() port,current_user role,current_setting('neon.branch_id',true) branch")).rows[0];
   reject(t.database==='restore_monthly_20260914'&&/^127\.0\.0\.1(?:\/32)?$/.test(t.host)&&t.port===5432&&t.role==='restore_owner'&&!t.branch,'FAMILY_RACE_LOCAL_ONLY');
  }
  reject((await admin.query("SELECT to_regclass('employee_family_member') IS NULL absent")).rows[0].absent,'FAMILY_RACE_CLEAN_BASELINE_REQUIRED');
  before=await employeeFamilyLocalSnapshot(admin);
  originalSchemaUsage=(await admin.query("SELECT has_schema_privilege('municontrol_actions_runtime_app','public','USAGE') allowed")).rows[0].allowed;
  const migration=readFileSync(new URL('./migrations/064-employee-family-members.sql',import.meta.url),'utf8');
  report.migrationSha256=createHash('sha256').update(migration).digest('hex');
  await savePrivateEvidence({report,before,stage:'baseline'});
  await admin.query("BEGIN; SET LOCAL statement_timeout='45s'; SET LOCAL lock_timeout='3s'");
  await admin.query(migration);await admin.query('GRANT USAGE ON SCHEMA public TO municontrol_actions_runtime_app');
  const suite=readFileSync(new URL('./tests/064-employee-family-members.test.sql',import.meta.url),'utf8');
  const start=suite.indexOf('DO $$ DECLARE c record;'),end=suite.indexOf('CREATE FUNCTION pg_temp.qa_family_context');
  reject(start>=0&&end>start,'FAMILY_RACE_FIXTURE_BOUNDARY_INVALID');
  // Reuse the exact synthetic setup; no quota policy mutation or base-data update.
  await admin.query(suite.slice(start,end));
  fixture=(await admin.query("SELECT current_setting('qa.school_context')::jsonb result")).rows[0].result;
  other={...fixture,email:'qa-family-race-'+randomUUID()+'@example.invalid',membership:randomUUID(),session:randomUUID()};
  await admin.query("INSERT INTO internal_users(email,display_name,role,password_hash,active,auth_mode,identity_version) VALUES($1,'QA familiar sintético','EMPLEADO',NULL,true,'managed',1)",[other.email]);
  await admin.query("INSERT INTO tenant_membership(id,tenant_id,user_email,role_key,status,invited_by_user_email,activated_at) VALUES($1,$2,$3,'JUNIN_ASISTENCIA_REVISOR','active',$3,now())",[other.membership,other.tenant,other.email]);
  await admin.query("INSERT INTO tenant_identity_session(id,user_email,active_tenant_id,source,auth_level,session_version,identity_version,status,device_label,last_seen_at,expires_at) VALUES($1,$2,$3,'membership','mfa',1,1,'active','QA familiar concurrente',now(),now()+interval '1 hour')",[other.session,other.email,other.tenant]);
  await admin.query("INSERT INTO tenant_membership_capability_override(membership_id,capability_key,allow_override,deny_override,reason,granted_by_user_email) SELECT $1,key,true,false,'Fixture local sintética',$2 FROM unnest(ARRAY['actions.read','workforce.employee.read','employee.record.propose']) key",[other.membership,other.email]);
  const context=(await admin.query('SELECT public.employee_family_context_v1($1,$2,$3,$4,$5,$6,$7) result',[...principal(fixture),fixture.contract])).rows[0].result;
  await savePrivateEvidence({report,before,fixture,other,stage:'before_temporary_commit'});
  await admin.query('COMMIT');installed=true;report.temporaryLocalCommit=true;
  await savePrivateEvidence({report,before,fixture,other,stage:'temporary_commit_confirmed'});
  for(const isolation of ['READ COMMITTED','REPEATABLE READ','SERIALIZABLE']){
   const payload={contractId:fixture.contract,contractIdentityToken:context.subject.identityToken,
    familyName:'Hija concurrente QA '+isolation,birthDate:null,dni:null,validFrom:null,validTo:null};
   const keyA=randomUUID(),keyB=randomUUID();
   await first.query("BEGIN ISOLATION LEVEL READ COMMITTED; SET LOCAL statement_timeout='15s'; SET LOCAL ROLE municontrol_actions_runtime_app");
   const created=(await first.query(DECLARE,[...principal(fixture),JSON.stringify(payload),keyA])).rows[0].result;
   await second.query(`BEGIN ISOLATION LEVEL ${isolation}; SET LOCAL statement_timeout='15s'; SET LOCAL ROLE municontrol_actions_runtime_app`);
   await second.query('SELECT 1'); // Force the fixed snapshot before the first commit.
   const waiting=second.query(DECLARE,[...principal(other),JSON.stringify(payload),keyB]).then(value=>({value}),error=>({error}));
   if(isolation==='READ COMMITTED'){
    const deadline=Date.now()+5000;let blocked=false;
    while(Date.now()<deadline){
     blocked=(await admin.query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND wait_event_type='Lock' AND wait_event='advisory') blocked",[second.processID])).rows[0].blocked;
     if(blocked)break;await new Promise(resolve=>setTimeout(resolve,25));
    }
    reject(blocked,'FAMILY_RACE_SERIALIZATION_NOT_OBSERVED');
   }
   await first.query('COMMIT');
   const observed=await waiting;
   reject(observed.error?.message===(isolation==='READ COMMITTED'?'EMPLOYEE_FAMILY_DUPLICATE':'EMPLOYEE_FAMILY_ISOLATION_UNSUPPORTED'),'FAMILY_RACE_UNEXPECTED_SECOND_RESULT');
   await second.query('ROLLBACK');
   const result=(await admin.query('SELECT count(*)::int count FROM employee_family_member WHERE contract_id=$1 AND family_name=$2',[fixture.contract,payload.familyName])).rows[0];
   assert.equal(result.count,1,'FAMILY_RACE_DUPLICATE_INSERT');
   await first.query('BEGIN; SET LOCAL ROLE municontrol_actions_runtime_app');
   const replay=(await first.query(DECLARE,[...principal(fixture),JSON.stringify(payload),keyA])).rows[0].result;
   reject(replay.duplicate&&replay.familyRef.id===created.familyRef.id,'FAMILY_RACE_RETRY_CHANGED_ID');
   await first.query('COMMIT');
   report.passed.push(isolation==='READ COMMITTED'?'two_operators_two_keys_without_dni_serialize_to_one_child':isolation.toLowerCase().replaceAll(' ','_')+'_rejected_without_duplicate');
  }
 }finally{
  await Promise.allSettled([first.query('ROLLBACK'),second.query('ROLLBACK'),admin.query('ROLLBACK')]);
  if(installed){
   // Inventory must contain only these synthetic declarations. If anything else
   // appeared, stop and retain evidence rather than delete an unowned record.
   const inventory=(await admin.query('SELECT id,contract_id,recorded_by_membership_id FROM employee_family_member ORDER BY id')).rows;
   reject(inventory.every(row=>row.contract_id===fixture.contract&&[fixture.membership,other.membership].includes(row.recorded_by_membership_id)),'FAMILY_RACE_UNOWNED_RECORD_FOUND');
   const audit=(await admin.query('SELECT id,actor_membership_id FROM employee_family_member_event ORDER BY id')).rows;
   reject(audit.every(row=>[fixture.membership,other.membership].includes(row.actor_membership_id)),'FAMILY_RACE_UNOWNED_EVENT_FOUND');
   reject((await admin.query('SELECT count(*)::int count FROM school_certificate WHERE own_family_id IS NOT NULL')).rows[0].count===0,'FAMILY_RACE_UNEXPECTED_DOCUMENT');
   await savePrivateEvidence({report,before,fixture,other,inventory,audit,stage:'before_exact_teardown'});
   await admin.query("BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='45s'");
   try{
    for(const signature of EMPLOYEE_FAMILY_064_FUNCTIONS)await admin.query('DROP FUNCTION public.'+signature);
    await admin.query('ALTER TABLE school_certificate DROP CONSTRAINT school_certificate_own_family_fk, DROP CONSTRAINT school_certificate_destination_ck');
    await admin.query('DROP INDEX school_certificate_own_identity_idx');
    await admin.query('ALTER TABLE school_certificate DROP COLUMN own_family_id, ALTER COLUMN family_id SET NOT NULL');
    await admin.query('DROP TABLE employee_family_member_event');
    await admin.query('DROP TABLE employee_family_member');
    await admin.query('DELETE FROM grh_family WHERE family_id=$1::bigint OR family_id=$1::bigint+1',[fixture.family]);
    await admin.query('DELETE FROM employment_status_snapshot WHERE employment_contract_id=$1',[fixture.contract]);
    await admin.query('DELETE FROM employment_contract WHERE id=$1',[fixture.contract]);
    await admin.query('DELETE FROM person_identity WHERE id=$1',[fixture.person]);
    await admin.query('ALTER TABLE tenant_identity_session DISABLE TRIGGER tenant_identity_session_revoked_terminal_v1');
    await admin.query('DELETE FROM tenant_identity_session WHERE id=ANY($1::uuid[])',[[fixture.session,other.session]]);
    await admin.query('ALTER TABLE tenant_identity_session ENABLE TRIGGER tenant_identity_session_revoked_terminal_v1');
    await admin.query('DELETE FROM tenant_membership_capability_override WHERE membership_id=ANY($1::uuid[])',[[fixture.membership,other.membership]]);
    await admin.query('DELETE FROM tenant_action_authority WHERE membership_id=ANY($1::uuid[])',[[fixture.membership,other.membership]]);
    await admin.query('DELETE FROM tenant_membership WHERE id=ANY($1::uuid[])',[[fixture.membership,other.membership]]);
    await admin.query('DELETE FROM internal_users WHERE email=ANY($1::text[])',[[fixture.email,other.email]]);
    // No existing sequence is reset: the exact fixtures use UUIDs and explicit family IDs.
    if(!originalSchemaUsage)await admin.query('REVOKE USAGE ON SCHEMA public FROM municontrol_actions_runtime_app');
    assert.deepEqual(await employeeFamilyLocalSnapshot(admin),before,'FAMILY_RACE_TEARDOWN_DRIFT');
    await admin.query('COMMIT');installed=false;
   }catch(error){await admin.query('ROLLBACK');await savePrivateEvidence({report,before,fixture,other,inventory,audit,stage:'teardown_failed',errorCode:error.code,errorMessage:error.message});throw error;}
   assert.deepEqual(await employeeFamilyLocalSnapshot(admin),before,'FAMILY_RACE_FINAL_BASELINE_DRIFT');
   report.cleanupConfirmed=true;
  }
  if(before&&!installed&&!report.temporaryLocalCommit){assert.deepEqual(await employeeFamilyLocalSnapshot(admin),before,'FAMILY_RACE_SETUP_ROLLBACK_DRIFT');report.cleanupConfirmed=true;}
  await savePrivateEvidence({report,before,stage:report.cleanupConfirmed?'cleanup_confirmed':'needs_recovery'});
 }
 report.completedAt=new Date().toISOString();return report;
}
