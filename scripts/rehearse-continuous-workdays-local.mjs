// Authorized existing local restore only. No connection factory, COMMIT, or network access.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {getAttendanceWorkdaysV2} from '../lib/internal-attendance-workdays.js';
import {verifyWorkdayFunctionDefinition} from './apply-continuous-workdays-schema.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex');
const signature='attendance_clock_workday_source_v2(text,uuid,integer,text,uuid,uuid,text,date,date,uuid)';
const identifier=value=>{assert.match(value,/^[a-z_][a-z0-9_]*$/);return '"'+value+'"'};
async function snapshot(client){
 const result={tables:{},views:{},sequences:{}};
 for(const {name,kind} of (await client.query("SELECT c.relname name,c.relkind kind FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','v','m','S') ORDER BY c.relname")).rows){
  if(kind==='S')result.sequences[name]=(await client.query(`SELECT last_value::text value,is_called FROM public.${identifier(name)}`)).rows[0];
  else result[kind==='r'?'tables':'views'][name]=(await client.query(`SELECT count(*)::text rows,md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' ORDER BY md5(to_jsonb(r)::text)),'')) digest FROM public.${identifier(name)} r`)).rows[0];
 }
 result.schema=(await client.query("SELECT nspacl::text acl FROM pg_namespace WHERE nspname='public'")).rows;
 result.functions=(await client.query("SELECT p.oid::regprocedure::text name,md5(pg_get_functiondef(p.oid)) definition,p.proacl::text acl FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind IN ('f','p') ORDER BY name")).rows;
 result.relations=(await client.query("SELECT c.relname,c.relkind,c.relacl::text,c.reloptions FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','v','m','S') ORDER BY c.relname")).rows;
 result.constraints=(await client.query("SELECT c.conrelid::regclass::text relation,c.conname,pg_get_constraintdef(c.oid,true) definition FROM pg_constraint c WHERE c.connamespace='public'::regnamespace ORDER BY relation,c.conname")).rows;
 result.triggers=(await client.query("SELECT t.tgrelid::regclass::text relation,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND NOT t.tgisinternal ORDER BY relation,t.tgname")).rows;
 return result;
}
export async function rehearseContinuousWorkdays({client}){
 const report={version:'continuous-workdays-rehearsal.v1',localOnly:true,productionWrites:false,committed:false,passed:[],rollbackConfirmed:false};
 let before,transaction=false;
 try{
  const target=(await client.query("SELECT current_database() database,inet_server_addr()::text host,inet_server_port() port,current_user role,current_setting('neon.branch_id',true) branch")).rows[0];
  assert.ok(target.database==='restore_monthly_20260914'&&/^127\.0\.0\.1(?:\/32)?$/.test(target.host)&&target.port===5432&&target.role==='restore_owner'&&!target.branch,'CONTINUOUS_LOCAL_TARGET_REQUIRED');
  assert.equal((await client.query('SELECT to_regprocedure($1) IS NULL absent',[signature])).rows[0].absent,true,'CONTINUOUS_CLEAN_BASELINE_REQUIRED');
  before=await snapshot(client);report.baselineTableCount=Object.keys(before.tables).length;
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ; SET LOCAL statement_timeout='90s'; SET LOCAL lock_timeout='3s'");transaction=true;
  const sql=readFileSync(new URL('./migrations/065-clock-workday-source-continuous.sql',import.meta.url),'utf8');report.migrationSha256=hash(sql);
  await client.query(sql);report.passed.push('migration_compiles');
  await client.query(sql);report.passed.push('migration_replay');
  const metadata=(await client.query('SELECT p.prosrc body,p.proconfig config,pg_get_userbyid(p.proowner) owner,l.lanname language FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=$1::regprocedure',[signature])).rows[0];
  assert.equal(metadata.owner,'restore_owner');verifyWorkdayFunctionDefinition({...metadata,owner:'neondb_owner'},sql);
  report.passed.push('applier_definition_contract_matches_installed_body_search_path_language');
  // The no-ACL restore omits runtime schema usage; recreate it only in this transaction.
  await client.query('GRANT USAGE ON SCHEMA public TO municontrol_actions_runtime_app');
  const c=(await client.query(`SELECT p.tenant_id,p.certified_release_sha release,b.source_company_id company,b.source_system,b.source_database
   FROM tenant_identity_policy p JOIN platform_tenant_source_binding b ON b.id=p.certified_source_binding_id AND b.tenant_id=p.tenant_id
   WHERE p.tenant_data_plane_ready AND b.verified ORDER BY p.tenant_id LIMIT 1`)).rows[0];assert.ok(c,'CERTIFIED_RESTORE_CONTEXT_REQUIRED');
  const email='qa-continuous65-'+randomUUID()+'@example.invalid',membership=randomUUID(),sessionId=randomUUID();
  await client.query("INSERT INTO internal_users(email,display_name,role,password_hash,active,auth_mode,identity_version) VALUES($1,'QA jornadas sintético','EMPLEADO',NULL,true,'managed',1)",[email]);
  await client.query("INSERT INTO tenant_membership(id,tenant_id,user_email,role_key,status,invited_by_user_email,activated_at) VALUES($1,$2,$3,'JUNIN_ASISTENCIA_REVISOR','active',$3,now())",[membership,c.tenant_id,email]);
  await client.query("INSERT INTO tenant_identity_session(id,user_email,active_tenant_id,source,auth_level,session_version,identity_version,status,device_label,last_seen_at,expires_at) VALUES($1,$2,$3,'membership','mfa',1,1,'active','QA rollback',now(),now()+interval '1 hour')",[sessionId,email,c.tenant_id]);
  const capability=async(key,allowed)=>client.query(`INSERT INTO tenant_membership_capability_override(membership_id,capability_key,allow_override,deny_override,reason,granted_by_user_email)
   VALUES($1,$2,$3,NOT $3,'Fixture sintética rollback obligatorio',$4) ON CONFLICT(membership_id,capability_key) DO UPDATE SET allow_override=EXCLUDED.allow_override,deny_override=EXCLUDED.deny_override`,[membership,key,allowed,email]);
  await capability('attendance.read',true);await capability('workforce.employee.read',false);
  const principal={user:{email},tenant:{id:c.tenant_id,membershipId:membership,source:'membership',certifiedReleaseSha:c.release.trim()}},session={id:sessionId,email,version:1,releaseSha:c.release.trim()};
  const runtime={query:async(statement,params)=>{await client.query('SET LOCAL ROLE municontrol_actions_runtime_app');try{return await client.query(statement,params)}finally{await client.query('RESET ROLE').catch(()=>{})}}};
  const read=options=>getAttendanceWorkdaysV2(runtime,principal,{source:'continuous',...options},session);
  async function reject(label,callback,code,status){
   await client.query('SAVEPOINT continuous_negative');let error;try{await callback()}catch(e){error=e}await client.query('ROLLBACK TO SAVEPOINT continuous_negative');
   assert.equal(error?.code,code,label);if(status)assert.equal(error?.status,status,label);report.passed.push(label);
  }
  const baseline=await read({site:'pm-10'});assert.equal(baseline.version,'clock-workdays.v2');assert.equal(baseline.nominalReadAllowed,false);
  assert.ok(baseline.rows.every(row=>row.legajo===null&&/^Persona [A-F0-9]{8}$/.test(row.personLabel)));
  report.restoredSource={contextRecords:baseline.context.recordCount,personDays:baseline.pagination.total,placedObservations:baseline.observationSummary.placed,unplacedObservations:baseline.observationSummary.unplaced};
  report.passed.push('restored_private_source_runtime_session_sql_contract_engine');
  await reject('runtime_cannot_read_raw_records',()=>runtime.query('SELECT raw_record FROM attendance_pm10_record LIMIT 1'),'42501');
  await reject('runtime_cannot_read_identity_keys',()=>runtime.query('SELECT secret FROM attendance_clock_identity_key LIMIT 1'),'42501');
  await reject('anonymous_nominal_search_rejected',()=>read({site:'pm-10',search:'Persona QA'}),'ATTENDANCE_CAPABILITY_REQUIRED',403);
  await reject('wrong_snapshot_rejected',()=>read({site:'pm-10',snapshot:randomUUID()}),'ATTENDANCE_CAPTURE_CHANGED',409);
  const site=randomUUID(),device=randomUUID(),connector=randomUUID(),batch=randomUUID(),person=randomUUID(),contract=randomUUID(),identity=randomUUID();
  const siteKey='qa-workdays-'+site,ih=hash('synthetic-workday-identity-'+site),rawIds=Array.from({length:6},randomUUID);
  const times=['07:00:00','10:00:00','10:15:00','13:00:00','15:00:00','17:00:00'],codes=[0,2,3,1,4,5];
  const bytes=times.map((time,i)=>{const value=Buffer.alloc(40);value.write('QA65 '+site.slice(0,8)+' '+time);value.writeUInt32LE(i+1,35);value[39]=codes[i];return value});
  await client.query(`INSERT INTO attendance_marking_site(id,tenant_id,external_key,label,network_enabled,status,created_by_membership_id) VALUES($1,$2,$3,'Punto QA sintético',true,'draft',$4)`,[site,c.tenant_id,siteKey,membership]);
  await client.query(`INSERT INTO attendance_device(id,tenant_id,site_id,external_key,vendor_key,model,transport,driver_key,capabilities,status,created_by_membership_id)
   VALUES($1,$2,$3,$4,'zkteco','K20','network_pull','zk40-snapshot.v1','{"pull":true,"push":false,"biometric":false,"card":true,"pin":false}','draft',$5)`,[device,c.tenant_id,site,'qa-device-'+device,membership]);
  await client.query(`INSERT INTO attendance_connector(id,tenant_id,device_id,external_key,driver_key,token_sha256,created_by_membership_id) VALUES($1,$2,$3,$4,'zk40-snapshot.v1',$5,$6)`,[connector,c.tenant_id,device,'qa-connector-'+connector,hash('synthetic-token'),membership]);
  await client.query(`INSERT INTO person_identity(id,full_name) VALUES($1,'Persona QA jornadas')`,[person]);
  const sourceBatch=(await client.query(`SELECT id FROM source_import_batch WHERE source_system=$1 AND source_database=$2 AND validation_state='published' AND legacy_import_run_id IS NOT NULL ORDER BY source_cutoff DESC LIMIT 1`,[c.source_system,c.source_database])).rows[0].id;
  await client.query(`INSERT INTO employment_contract(id,person_id,source_system,source_batch_id,legacy_company_id,legacy_legajo,status,start_date) VALUES($1,$2,$3,$4,$5,'9999996501','active','2020-01-01')`,[contract,person,c.source_system,sourceBatch,c.company]);
  await client.query(`INSERT INTO attendance_identity_map(id,tenant_id,device_id,identity_hmac_sha256,employment_contract_id,valid_from,created_by_membership_id) VALUES($1,$2,$3,$4,$5,'2020-01-01',$6)`,[identity,c.tenant_id,device,ih,contract,membership]);
  await client.query(`INSERT INTO attendance_ingest_batch(id,tenant_id,connector_id,device_id,batch_key,payload_sha256,release_sha,status,event_count,accepted_count,duplicate_count,unmapped_count,ambiguous_count) VALUES($1,$2,$3,$4,$5,$6,$7,'accepted',6,6,0,0,0)`,[batch,c.tenant_id,connector,device,'qa-'+batch,hash(Buffer.concat(bytes)),c.release.trim()]);
  for(let i=0;i<6;i++){
   await client.query(`INSERT INTO attendance_raw_event(id,tenant_id,batch_id,connector_id,device_id,event_key,event_sha256,identity_hmac_sha256,occurred_at,method,direction,verification_result)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamp AT TIME ZONE 'America/Argentina/Mendoza','card','unknown','accepted')`,[rawIds[i],c.tenant_id,batch,connector,device,'qa-'+rawIds[i],hash(bytes[i]),ih,'2026-09-10 '+times[i]]);
   await client.query(`INSERT INTO attendance_canonical_punch(tenant_id,raw_event_id,site_id,device_id,identity_map_id,employment_contract_id,occurred_at,method,direction,reconciliation_state,review_state)
    VALUES($1,$2,$3,$4,$5,$6,$7::timestamp AT TIME ZONE 'America/Argentina/Mendoza','card','unknown','mapped','recorded')`,[c.tenant_id,rawIds[i],site,device,identity,contract,'2026-09-10 '+times[i]]);
  }
  async function history(items){
   const id=randomUUID(),data=Buffer.concat([Buffer.alloc(4),...items.map(x=>x.bytes)]);
   await client.query(`INSERT INTO attendance_clock_snapshot(id,tenant_id,device_id,source_sha256,captured_at,raw_attendance,record_count,observed_count,requested_by_membership_id,transport_complete)
    VALUES($1,$2,$3,$4,'2026-09-11Z',$5,$6,0,$7,true)`,[id,c.tenant_id,device,hash(data),data,items.length,membership]);
   for(let i=0;i<items.length;i++){const x=items[i];await client.query(`INSERT INTO attendance_clock_snapshot_row(snapshot_id,tenant_id,ordinal,source_sequence_16,identity_hmac,local_timestamp,occurred_at,verification_code,punch_code,raw_record_sha256,raw_event_id)
    VALUES($1,$2,$3,$3,$4,$5::timestamp,$5::timestamp AT TIME ZONE 'America/Argentina/Mendoza',1,$6,$7,$8)`,[id,c.tenant_id,i+1,x.ih??ih,x.time,x.code,hash(x.bytes),x.rawId??null]);}return id;
  }
  async function receipt(items,{project=true,total=items.length,start=0,fullBytes,ordinals,receiptId=randomUUID()}={}){
   const data=Buffer.concat(items.map(x=>x.bytes)),full=fullBytes??data,snapshotHash=hash('fixture-'+hash(full)),recordsHash=hash(full),batchKey=hash(snapshotHash+':'+recordsHash);
   await client.query(`INSERT INTO attendance_pm10_receipt(id,tenant_id,connector_id,device_id,batch_key,part_start,manifest_sha256,request_sha256,snapshot_sha256,captured_at,record_count,total_records,records_sha256,records_payload,source_ordinals,result)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'2026-09-11Z',$10,$11,$12,$13,$14,'{}')`,[receiptId,c.tenant_id,connector,device,batchKey,start,hash('manifest-'+batchKey),hash(data),snapshotHash,items.length,total,recordsHash,data,ordinals??items.map((x,i)=>start+i+1)]);
   if(project)for(let i=0;i<items.length;i++){const x=items[i];await client.query(`INSERT INTO attendance_pm10_record(tenant_id,device_id,receipt_id,raw_sha256,raw_record,source_ordinal,source_sequence,local_timestamp,occurred_at,identity_hmac,verification_code,punch_code,issue_codes,raw_event_id)
    VALUES($1,$2,$3,$4,$5,$6,$6,$7::timestamp,$7::timestamp AT TIME ZONE 'America/Argentina/Mendoza',$8,1,$9,$10,$11) ON CONFLICT(device_id,raw_sha256) DO NOTHING`,[c.tenant_id,device,receiptId,hash(x.bytes),x.bytes,i+1,x.time,x.ih===null?null:x.ih??ih,x.code,x.issues??[],x.rawId??null]);}return receiptId;
  }
  const items=bytes.map((value,i)=>({bytes:value,time:'2026-09-10 '+times[i],code:codes[i],rawId:rawIds[i]}));
  await history(items.slice(0,2));await receipt(items.slice(2));
  const sequence=await read({site:siteKey,from:'2026-09-10',to:'2026-09-10'});
  assert.equal(sequence.context.recordCount,6);assert.equal(sequence.rows.length,1);assert.equal(sequence.rows[0].intervals.length,2);
  assert.equal(sequence.rows[0].ordinarySeconds,20700);assert.equal(sequence.rows[0].extraSeconds,7200);
  assert.deepEqual(sequence.rows[0].events.map(x=>x.code),codes);assert.equal(new Set(sequence.rows[0].events.map(x=>x.source.ordinal)).size,4);
  assert.equal(sequence.context.from,'2026-09-09');assert.equal(sequence.context.to,'2026-09-11');
  report.passed.push('synthetic_historical_receipt_sequence_pause_extra_stable_refs_repeated_ordinals');
  await reject('confirmed_missing_pause_projection_rejected',async()=>{await client.query('DROP TRIGGER attendance_pm10_record_immutable ON attendance_pm10_record');await client.query('DELETE FROM attendance_pm10_record WHERE device_id=$1 AND raw_sha256=$2',[device,hash(items[2].bytes)]);return read({site:siteKey,from:'2026-09-10',to:'2026-09-10'})},'ATTENDANCE_WORKDAY_SOURCE_CONFLICT',409);
  await receipt(items,{project:false});
  const duplicate=await read({site:siteKey,from:'2026-09-10',to:'2026-09-10'});
  assert.equal(duplicate.context.recordCount,6);assert.deepEqual(duplicate.rows[0].events,sequence.rows[0].events);assert.notEqual(duplicate.snapshotId,sequence.snapshotId);
  report.passed.push('confirmed_duplicates_may_exist_in_history_only_exact_dedup_preserves_references');
  await reject('new_receipt_invalidates_previous_cut',()=>read({site:siteKey,from:'2026-09-10',to:'2026-09-10',snapshot:sequence.snapshotId}),'ATTENDANCE_CAPTURE_CHANGED',409);
  await reject('incomplete_batch_rejected_before_projection',async()=>{const partial=Array.from({length:500},()=>items[0]);await receipt(partial,{project:false,total:501});return read({site:siteKey,from:'2026-09-10',to:'2026-09-10'})},'ATTENDANCE_WORKDAY_SOURCE_INCOMPLETE',409);
  await reject('same_hash_conflicting_decode_rejected',async()=>{await history([{...items[0],code:1}]);return read({site:siteKey,from:'2026-09-10',to:'2026-09-10'})},'ATTENDANCE_WORKDAY_SOURCE_CONFLICT',409);
  await client.query('SAVEPOINT nominal_case');await capability('workforce.employee.read',true);
  const nominal=await read({site:siteKey,from:'2026-09-10',to:'2026-09-10',search:'9999996501'});assert.equal(nominal.rows[0].personLabel,'Persona QA jornadas');assert.equal(nominal.rows[0].legajo,'9999996501');
  await client.query("UPDATE attendance_identity_map SET status='revoked',revoked_at=now(),version=version+1 WHERE id=$1",[identity]);
  const revoked=await read({site:siteKey,from:'2026-09-10',to:'2026-09-10'});assert.ok(revoked.rows.every(x=>x.legajo===null&&x.personLabel!=='Persona QA jornadas'));assert.notEqual(revoked.snapshotId,nominal.snapshotId);
  await client.query('ROLLBACK TO SAVEPOINT nominal_case');report.passed.push('nominal_identity_requires_current_authorized_contract_and_active_map');
  await client.query('SAVEPOINT unplaced_case');
  await receipt([{bytes:Buffer.alloc(40,65),time:null,ih:null,code:3,issues:['timestamp_invalid']}]);
  const unplaced=await read({site:siteKey,from:'2026-09-10',to:'2026-09-10'});assert.equal(unplaced.observationSummary.unplaced,1);assert.ok(unplaced.rows.every(x=>x.intervals.length===0));
  await client.query('ROLLBACK TO SAVEPOINT unplaced_case');report.passed.push('unplaceable_pause_observation_stops_device_pairings');
  await client.query('SAVEPOINT multipart_case');
  const many=Array.from({length:501},()=>items[0]),fullBytes=Buffer.concat(many.map(x=>x.bytes));
  await receipt(many.slice(0,500),{project:false,total:501,fullBytes});
  await reject('partial_501_batch_requires_all_parts',()=>read({site:siteKey,from:'2026-09-10',to:'2026-09-10'}),'ATTENDANCE_WORKDAY_SOURCE_INCOMPLETE',409);
  await receipt(many.slice(500),{project:false,total:501,start:500,fullBytes});
  assert.equal((await read({site:siteKey,from:'2026-09-10',to:'2026-09-10'})).context.recordCount,6);
  report.passed.push('complete_501_duplicate_batch_verifies_joined_bytes_and_projection');
  await reject('cross_part_ordinal_overlap_rejected',async()=>{await client.query('DROP TRIGGER attendance_pm10_receipt_immutable ON attendance_pm10_receipt');await client.query('UPDATE attendance_pm10_receipt SET source_ordinals=ARRAY[500] WHERE device_id=$1 AND total_records=501 AND part_start=500',[device]);return read({site:siteKey,from:'2026-09-10',to:'2026-09-10'})},'ATTENDANCE_WORKDAY_SOURCE_INCOMPLETE',409);
  await reject('corrupted_joined_payload_rejected',async()=>{await client.query('DROP TRIGGER attendance_pm10_receipt_immutable ON attendance_pm10_receipt');await client.query("UPDATE attendance_pm10_receipt SET records_payload=set_byte(records_payload,0,255) WHERE device_id=$1 AND total_records=501 AND part_start=500",[device]);return read({site:siteKey,from:'2026-09-10',to:'2026-09-10'})},'ATTENDANCE_WORKDAY_SOURCE_INCOMPLETE',409);
  await client.query('ROLLBACK TO SAVEPOINT multipart_case');
  await client.query('SAVEPOINT midnight_case');
  const nightIdentity=hash('synthetic-midnight-'+site);
  await history([{bytes:Buffer.alloc(40,71),time:'2026-09-09 23:00:00',code:0,ih:nightIdentity},{bytes:Buffer.alloc(40,72),time:'2026-09-10 01:00:00',code:1,ih:nightIdentity}]);
  const night=await read({site:siteKey,from:'2026-09-09',to:'2026-09-09'});assert.equal(night.rows.length,1);assert.equal(night.rows[0].ordinarySeconds,7200);
  const nextDay=await read({site:siteKey,from:'2026-09-10',to:'2026-09-10'});assert.equal(nextDay.context.recordCount,8);assert.equal(nextDay.rows.length,1);
  await client.query('ROLLBACK TO SAVEPOINT midnight_case');report.passed.push('adjacent_day_context_pairs_midnight_without_orphan_or_double_day');
  await reject('device_timezone_mismatch_rejected',async()=>{await client.query("UPDATE attendance_device SET timezone='America/New_York' WHERE id=$1",[device]);return read({site:siteKey,from:'2026-09-10',to:'2026-09-10'})},'ATTENDANCE_WORKDAY_DEVICE_CONTEXT_INVALID',503);
  await client.query('SAVEPOINT limit_case');
  const count=24994,limitId=randomUUID(),bulk=Buffer.alloc(count*40);for(let i=0;i<count;i++){bulk.write('QA65 boundary',i*40);bulk.writeUInt32LE(i+1,i*40+32)}
  const capture=Buffer.concat([Buffer.alloc(4),bulk]);
  await client.query(`INSERT INTO attendance_clock_snapshot(id,tenant_id,device_id,source_sha256,captured_at,raw_attendance,record_count,observed_count,requested_by_membership_id,transport_complete)
   VALUES($1,$2,$3,$4,'2026-09-11Z',$5,$6,0,$7,true)`,[limitId,c.tenant_id,device,hash(capture),capture,count,membership]);
  await client.query(`INSERT INTO attendance_clock_snapshot_row(snapshot_id,tenant_id,ordinal,source_sequence_16,identity_hmac,local_timestamp,occurred_at,verification_code,punch_code,raw_record_sha256)
   SELECT $1::uuid,$2::uuid,position,position,$3,'2026-09-10 07:00:00','2026-09-10 10:00:00Z',1,0,
    encode(digest(substring($4::bytea FROM 1+(position-1)*40 FOR 40),'sha256'),'hex') FROM generate_series(1,$5::integer) position`,[limitId,c.tenant_id,ih,bulk,count]);
  await history([items[0]]); // Another physical row is already represented by exact bytes.
  const source=(await runtime.query('SELECT public.attendance_clock_workday_source_v2($1,$2,$3,$4,$5,$6,$7,$8,$9) result',[email,sessionId,1,c.release.trim(),c.tenant_id,membership,siteKey,'2026-09-10','2026-09-10'])).rows[0].result;
  assert.equal(source.context.recordCount,25000);assert.equal(source.events.length,25000);report.passed.push('exact_25000_limit_applies_after_duplicate_union');
  await reject('25001_context_records_rejected_before_search_or_pairing',async()=>{await history([{bytes:Buffer.alloc(40,99),time:'2026-09-09 07:00:00',code:0}]);return read({site:siteKey,from:'2026-09-10',to:'2026-09-10',search:'unmatched'})},'ATTENDANCE_WORKDAY_WINDOW_TOO_LARGE',413);
  await client.query('ROLLBACK TO SAVEPOINT limit_case');
  await reject('attendance_capability_denied',async()=>{await capability('attendance.read',false);return read({site:'pm-10'})},'ATTENDANCE_CAPABILITY_REQUIRED',403);
  await reject('revoked_session_denied',async()=>{await client.query("UPDATE tenant_identity_session SET status='revoked',revoked_at=now(),revoked_by_user_email=user_email,version=version+1 WHERE id=$1",[sessionId]);return read({site:'pm-10'})},'ATTENDANCE_SESSION_INVALID',401);
  await client.query('ROLLBACK');transaction=false;
  assert.deepEqual(await snapshot(client),before,'CONTINUOUS_RESTORE_FINGERPRINT_DRIFT');report.rollbackConfirmed=true;
  report.completedAt=new Date().toISOString();return report;
 }catch(error){
  if(transaction)await client.query('ROLLBACK');
  if(before){assert.deepEqual(await snapshot(client),before,'CONTINUOUS_FAILED_RUN_RESTORE_DRIFT');report.rollbackConfirmed=true;}
  error.continuousReport=report;throw error;
 }
}
