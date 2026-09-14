// Explicit private QA only. All schema/fixture writes occur in a transaction
// that is rolled back. Existing captured bytes stay in memory, never in logs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { validatePm10Payload, assertPm10Receipt } from '../lib/internal-pm10-reception.js';
import { getAttendanceClockDashboard } from '../lib/internal-attendance-clock-dashboard.js';
import { verifyExport } from '../assets/clock-dashboard-model.js';
const args = Object.fromEntries(process.argv.slice(2).map(x => x.replace(/^--/, '').split('=')));
if (args['confirm-rollback-only'] !== 'true' || !args['qa-endpoint'] || !args['production-endpoint'] || args['qa-endpoint'] === args['production-endpoint']) throw Error('EXPLICIT_ISOLATED_QA_REQUIRED');
if (!/^ep-[a-z0-9-]+\.sa-east-1\.aws\.neon\.tech$/.test(args['qa-endpoint'])) throw Error('QA_ENDPOINT_INVALID');
// This verifier has authorization for this already identified QA branch only.
const authorizedQa='ep-silent-tooth-acpst3tx.sa-east-1.aws.neon.tech';
const production='ep-shiny-cherry-actlyudg.sa-east-1.aws.neon.tech';
if(args['qa-endpoint']!==authorizedQa||args['production-endpoint']!==production)throw Error('QA_SCOPE_NOT_AUTHORIZED');
const url = new URL(process.env.DATABASE_URL);
// Credentials can come from the main branch URL; never connect to that host.
// Reject routing overrides, then replace the destination before opening Pool.
if(url.searchParams.has('options'))throw Error('SOURCE_DATABASE_ROUTE_UNEXPECTED');
url.hostname = args['qa-endpoint'];
neonConfig.webSocketConstructor = WebSocket;
const pool = new Pool({ connectionString: url.toString(), max: 1, connectionTimeoutMillis: 10000 });
const client = await pool.connect();
const hash = value => createHash('sha256').update(value).digest('hex');
const passed = [];
let initial,guardFingerprint,diagnosticStage='connect';
async function counts() {
  return (await client.query(`SELECT (SELECT count(*) FROM attendance_canonical_punch)::integer AS canonical,
    (SELECT count(*) FROM attendance_clock_snapshot_row)::integer AS historical,
    (SELECT count(*) FROM attendance_identity_map)::integer AS identities,
    (SELECT count(*) FROM attendance_ingest_batch)::integer AS batches,
    (SELECT count(*) FROM internal_users)::integer AS users,
    (SELECT count(*) FROM tenant_membership)::integer AS memberships,
    (SELECT count(*) FROM tenant_identity_session)::integer AS sessions,
    (SELECT md5(string_agg(id::text||status||coalesce(last_accepted_at::text,''),',' ORDER BY id)) FROM attendance_connector) AS connector_state`)).rows[0];
}
async function expectFailure(callback, pattern) {
  await client.query('SAVEPOINT expected_failure');
  let failure;
  try { await callback(); } catch (error) { failure = error; }
  await client.query('ROLLBACK TO SAVEPOINT expected_failure');
  assert.ok(failure && pattern.test(failure.message), 'EXPECTED_REJECTION_NOT_OBSERVED');
}
async function expectReadFailure(callback,status,code){
  await client.query('SAVEPOINT expected_read_failure');
  let failure;try{await callback()}catch(error){failure=error}
  await client.query('ROLLBACK TO SAVEPOINT expected_read_failure');
  assert.equal(failure?.status,status,'EXPECTED_READ_STATUS_NOT_OBSERVED');
  assert.equal(failure?.code,code,'EXPECTED_READ_CODE_NOT_OBSERVED');
}
async function guards(){
  return (await client.query(`SELECT md5(string_agg(pg_get_functiondef(p.oid),'|' ORDER BY p.proname)) AS fingerprint
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
    AND p.proname IN ('attendance_gateway_assert_session_v1','attendance_gateway_assert_actor_v1','time_source_assert_tenant_session_v1')`)).rows[0].fingerprint;
}
async function syntheticReader(context){
  const email='qa-pm10-read-'+randomUUID()+'@example.invalid',membershipId=randomUUID(),sessionId=randomUUID();
  await client.query(`INSERT INTO internal_users(email,display_name,role,password_hash,active,auth_mode,identity_version)
    VALUES($1,'QA sintético transaccional','EMPLEADO',NULL,true,'managed',1)`,[email]);
  await client.query(`INSERT INTO tenant_membership(id,tenant_id,user_email,role_key,status,invited_by_user_email,activated_at)
    VALUES($1,$2,$3,'JUNIN_ASISTENCIA_REVISOR','active',$3,now())`,[membershipId,context.tenant_id,email]);
  await client.query(`INSERT INTO tenant_identity_session(id,user_email,active_tenant_id,source,auth_level,session_version,identity_version,status,device_label,last_seen_at,expires_at)
    VALUES($1,$2,$3,'membership','mfa',1,1,'active','QA rollback',now(),now()+interval '1 hour')`,[sessionId,email,context.tenant_id]);
  async function capability(key,allowed){
    await client.query(`INSERT INTO tenant_membership_capability_override(membership_id,capability_key,allow_override,deny_override,reason,granted_by_user_email)
      VALUES($1,$2,$3,NOT $3,'Fixture sintética; rollback obligatorio',$4)
      ON CONFLICT(membership_id,capability_key) DO UPDATE SET allow_override=EXCLUDED.allow_override,deny_override=EXCLUDED.deny_override`,[membershipId,key,allowed,email]);
  }
  await capability('workforce.employee.read',false);
  const principal={user:{email},tenant:{id:context.tenant_id,membershipId,source:'membership',certifiedReleaseSha:context.release.trim()}};
  const session={id:sessionId,email,version:1,releaseSha:context.release.trim()};
  const query=(options={})=>getAttendanceClockDashboard(client,principal,{source:'continuous',...options},session);
  return {principal,session,query,capability};
}
function payload(bytes, {capturedAt = '2026-09-13T09:00:00.000Z', snapshotSha256 = hash('synthetic snapshot'), totalRecords = bytes.length/40, recordsSha256 = hash(bytes), partStart = 0, ordinals, snapshotRecordCount = totalRecords} = {}) {
  const value = {version:'pm10-delivery.v1', serial:'CQTU225360168', batchId:hash(snapshotSha256+':'+recordsSha256), snapshotSha256, recordsSha256,
    totalRecords, snapshotRecordCount, partStart, capturedAt, partSha256:hash(bytes), ordinals:ordinals??Array.from({length:bytes.length/40},(_,i)=>partStart+i+1), recordsBase64:bytes.toString('base64')};
  validatePm10Payload(value); return value;
}
function syntheticRecord(sequence, {identity='99999999', punch=0, invalidDate=false} = {}) {
  const raw = Buffer.alloc(40); raw.writeUInt16LE(sequence,0); raw.write(identity,2,'ascii'); raw[26]=1; raw[31]=punch;
  const packed = invalidDate ? (((((2026-2000)*12+1)*31+29)*24+6)*60)*60 : (((((2026-2000)*12+8)*31+12)*24+6)*60)*60+sequence;
  raw.writeUInt32LE(packed,27); return raw;
}
try {
  const branch=(await client.query("SELECT current_setting('neon.branch_id',true) AS branch")).rows[0].branch;
  if(branch&&branch!=='br-flat-firefly-acjulr6n')throw Error('QA_BRANCH_MISMATCH');
  initial = await counts();
  guardFingerprint=await guards();
  await client.query("BEGIN; SET LOCAL statement_timeout='45s'; SET LOCAL lock_timeout='3s'");
  await client.query(fs.readFileSync(new URL('migrations/055-pm10-continuous-reception.sql',import.meta.url),'utf8'));
  passed.push('additive migration compiles on real PostgreSQL');
  diagnosticStage='compile dashboard 056';
  await client.query(fs.readFileSync(new URL('migrations/056-pm10-continuous-dashboard.sql',import.meta.url),'utf8'));
  passed.push('continuous dashboard migration compiles on real PostgreSQL');
  const context = (await client.query(`SELECT c.id,c.external_key,c.tenant_id,c.device_id,p.certified_release_sha AS release,
    cs.raw_attendance,cs.source_sha256,cs.captured_at
    FROM attendance_connector c JOIN tenant_identity_policy p ON p.tenant_id=c.tenant_id
    JOIN attendance_clock_snapshot cs ON cs.device_id=c.device_id AND cs.tenant_id=c.tenant_id
    ORDER BY cs.captured_at DESC LIMIT 1`)).rows[0];
  assert.ok(context, 'QA_CAPTURE_REQUIRED');
  diagnosticStage='seed synthetic MFA reader';
  const reader=await syntheticReader(context);
  diagnosticStage='dashboard baseline through JavaScript contract';
  const historicalBefore=await reader.query({source:'historical'});
  const continuousBefore=await reader.query();
  const syntheticDay={from:'2026-09-13',to:'2026-09-13'};
  const dayBefore=await reader.query(syntheticDay);
  assert.equal(historicalBefore.dashboard.version,'clock-dashboard.v3');
  assert.equal(continuousBefore.dashboard.sourceMode,'continuous');
  assert.equal(continuousBefore.nominalReadAllowed,false);
  assert.ok(continuousBefore.records.every(row=>row.legajo===null&&/^Persona [A-F0-9]{8}$/.test(row.personLabel)));
  assert.equal(continuousBefore.dashboard.telemetry.lastAttemptAt,null);
  assert.equal(continuousBefore.dashboard.telemetry.backlog,null);
  passed.push('real session and capability guards admit synthetic MFA reader; v3 SQL passes JS contract');
  diagnosticStage='historical HMAC compatibility';
  const compatibility = (await client.query(`WITH source AS (
    SELECT sr.identity_hmac,sr.raw_record_sha256,cs.tenant_id,d.serial_number,k.secret,
      substring(cs.raw_attendance FROM 5+(sr.ordinal-1)*40+2 FOR 24) AS identity_bytes,e.event_key
    FROM attendance_clock_snapshot_row sr JOIN attendance_clock_snapshot cs ON cs.id=sr.snapshot_id
    JOIN attendance_device d ON d.id=cs.device_id JOIN attendance_clock_identity_key k ON k.tenant_id=cs.tenant_id
    LEFT JOIN attendance_raw_event e ON e.id=sr.raw_event_id WHERE cs.device_id=$1
  ), decoded AS (SELECT *,convert_from(substring(identity_bytes FROM 1 FOR
    CASE WHEN position(decode('00','hex') IN identity_bytes)>0 THEN position(decode('00','hex') IN identity_bytes)-1 ELSE 24 END),'UTF8') AS doc FROM source)
    SELECT count(*)::int AS rows,count(*) FILTER(WHERE identity_hmac<>encode(hmac(convert_to('clock-v1:'||tenant_id||':'||doc,'UTF8'),secret,'sha256'),'hex'))::int AS wrong_identity,
    count(*) FILTER(WHERE event_key IS NOT NULL AND event_key<>'zk40-v1:'||lower(serial_number)||':'||raw_record_sha256)::int AS wrong_event FROM decoded`,[context.device_id])).rows[0];
  assert.equal(compatibility.wrong_identity,0); assert.equal(compatibility.wrong_event,0);
  passed.push('historical HMAC and event keys match every stored source row');
  const tokenHash=hash('SYNTHETIC-ROLLBACK-ONLY');
  await client.query("UPDATE attendance_connector SET status='active',token_sha256=$1 WHERE id=$2",[tokenHash,context.id]);
  async function receive(body, token=tokenHash, release=context.release, connector=context.external_key) {
    const row=(await client.query('SELECT attendance_pm10_receive_v1($1,$2,$3::jsonb,$4) AS receipt',[connector,token,JSON.stringify(body),release])).rows[0];
    return assertPm10Receipt(row.receipt,body);
  }
  const original=context.raw_attendance.subarray(4), total=original.length/40;
  let replayedHistorical=0;
  for(let start=0;start<total;start+=500){
    const body=payload(original.subarray(start*40,Math.min(total,start+500)*40),{capturedAt:context.captured_at.toISOString(),snapshotSha256:context.source_sha256.trim(),totalRecords:total,recordsSha256:hash(original),partStart:start});
    const receipt=await receive(body);assert.equal(receipt.newCanonical,0);assert.equal(receipt.observed,0);replayedHistorical+=receipt.duplicates;
    const retry=await receive(body);assert.deepEqual({...retry,replayed:false},receipt);
    if(start===0)await expectFailure(()=>receive({...body,capturedAt:'2026-09-12T09:00:00.000Z'}),/PM10_IDEMPOTENCY_CONFLICT/);
  }
  assert.equal(replayedHistorical,total);assert.equal((await counts()).canonical,initial.canonical);
  passed.push('full original capture replay preserves canonical and identity counts; stable receipts');
  diagnosticStage='dashboard historical replay deduplication';
  const afterReplay=await reader.query();
  assert.equal(afterReplay.summary.sourceRows,continuousBefore.summary.sourceRows);
  assert.equal(afterReplay.summary.marks,continuousBefore.summary.marks);
  assert.notEqual(afterReplay.dashboard.snapshotId,continuousBefore.dashboard.snapshotId);
  await expectReadFailure(()=>reader.query({snapshot:continuousBefore.dashboard.snapshotId,page:2}),409,'ATTENDANCE_CAPTURE_CHANGED');
  const historicalAfterReplay=await reader.query({source:'historical',snapshot:historicalBefore.dashboard.snapshotId});
  assert.deepEqual(historicalAfterReplay.summary,historicalBefore.summary);
  passed.push('replayed capture does not inflate dashboard; continuous cut changes while historical cut remains stable');
  const newBytes=Buffer.concat([syntheticRecord(1),syntheticRecord(2,{punch:1}),syntheticRecord(3,{invalidDate:true})]);
  const fresh=payload(newBytes), accepted=await receive(fresh);
  assert.equal(accepted.newCanonical,2);assert.equal(accepted.observed,1);assert.equal(accepted.duplicates,0);
  assert.equal((await counts()).canonical,initial.canonical+2);
  passed.push('two same-minute raw events preserved; invalid date remains observed');
  diagnosticStage='dashboard fresh events and observations';
  const afterFresh=await reader.query(syntheticDay);
  assert.equal(afterFresh.summary.marks,dayBefore.summary.marks+2);
  assert.equal(afterFresh.summary.sourceRows,continuousBefore.summary.sourceRows+3);
  assert.equal(afterFresh.summary.observedRows,continuousBefore.summary.observedRows+1);
  assert.ok(afterFresh.observations.some(row=>row.issues.includes('timestamp_invalid')));
  assert.equal(afterFresh.hourly.reduce((sum,row)=>sum+row.marks,0),afterFresh.summary.marks);
  assert.equal(afterFresh.daily.reduce((sum,row)=>sum+row.marks,0),afterFresh.summary.marks);
  const filtered=await reader.query({...syntheticDay,hour:6,identity:'unmapped'});
  assert.equal(filtered.summary.marks,afterFresh.summary.marks);
  passed.push('same-minute events, observed timestamp and chart totals agree in real filtered dashboard');
  await expectFailure(()=>receive(fresh,hash('wrong token')),/PM10_AUTH_DENIED/);
  await expectFailure(()=>receive(fresh,tokenHash,'0'.repeat(40)),/PM10_BINDING_REQUIRED/);
  await expectFailure(()=>receive({...fresh,tenantId:context.tenant_id}),/PM10_PAYLOAD_INVALID/);
  await expectFailure(()=>receive({...fresh,serial:'different-device'}),/PM10_PAYLOAD_INVALID/);
  await expectFailure(()=>receive({...fresh,partSha256:'0'.repeat(64)}),/PM10_PAYLOAD_INVALID/);
  passed.push('wrong token, release, free tenant, serial and corrupt part rejected');
  const split=Buffer.concat(Array.from({length:501},(_,i)=>syntheticRecord(i+100)));
  const capturedAt='2026-09-13T09:20:00.000Z';
  const fullHash=hash(split), snap=hash('multipart synthetic'), first=payload(split.subarray(0,20000),{totalRecords:501,recordsSha256:fullHash,snapshotSha256:snap,capturedAt});
  const last=payload(split.subarray(20000),{totalRecords:501,recordsSha256:fullHash,snapshotSha256:snap,partStart:500,capturedAt});
  diagnosticStage='dashboard partial capture telemetry';
  await receive(first);
  const partial=await reader.query(syntheticDay);
  assert.equal(partial.dashboard.telemetry.lastCompleteCaptureAt,afterFresh.dashboard.telemetry.lastCompleteCaptureAt);
  assert.ok(partial.dashboard.telemetry.lastReceiptAt);
  await receive(last);
  const complete=await reader.query({...syntheticDay,pageSize:100});
  assert.equal(Date.parse(complete.dashboard.telemetry.lastCompleteCaptureAt),Date.parse(capturedAt));
  assert.ok(Number.isSafeInteger(complete.dashboard.telemetry.deliveryLatencySeconds)&&complete.dashboard.telemetry.deliveryLatencySeconds>=0);
  assert.equal(complete.summary.marks,dayBefore.summary.marks+503);
  assert.equal(complete.summary.sourceRows,continuousBefore.summary.sourceRows+504);
  passed.push('partial capture never advances completeness; completed batch exposes separate capture, receipt and measured delay');
  diagnosticStage='dashboard stable pagination and export';
  const seen=new Set(),ordinals=new Set();let exported=0,ordinalRepeated=false;
  for(let page=1;exported<complete.pagination.total;page++){
    const part=await reader.query({...syntheticDay,page,pageSize:100,snapshot:complete.dashboard.snapshotId});
    verifyExport(complete,part,page,seen);exported+=part.records.length;
    for(const row of part.records){if(ordinals.has(row.ordinal))ordinalRepeated=true;ordinals.add(row.ordinal)}
  }
  assert.equal(exported,complete.pagination.total);assert.equal(seen.size,exported);assert.ok(ordinalRepeated);
  await receive(fresh);
  assert.equal((await reader.query(syntheticDay)).dashboard.snapshotId,complete.dashboard.snapshotId);
  passed.push('multi-page real export uses stable row keys despite repeated ordinals; ACK replay preserves the read cut');
  const badGlobal='b'.repeat(64), badFirst=payload(split.subarray(0,20000),{totalRecords:501,recordsSha256:badGlobal,snapshotSha256:hash('bad global')});
  const badLast=payload(split.subarray(20000),{totalRecords:501,recordsSha256:badGlobal,snapshotSha256:badFirst.snapshotSha256,partStart:500});
  await receive(badFirst);await expectFailure(()=>receive(badLast),/PM10_PAYLOAD_INVALID/);
  const badOrdinalFirst=payload(split.subarray(0,20000),{totalRecords:501,recordsSha256:fullHash,snapshotSha256:hash('overlap ordinal')});
  const badOrdinalLast=payload(split.subarray(20000),{totalRecords:501,recordsSha256:fullHash,snapshotSha256:badOrdinalFirst.snapshotSha256,partStart:500,ordinals:[1]});
  await receive(badOrdinalFirst);await expectFailure(()=>receive(badOrdinalLast),/PM10_PAYLOAD_INVALID/);
  passed.push('multipart completion verifies global bytes and cross-part ordinal order');
  diagnosticStage='dashboard permissions, source mismatch and revoked session';
  await expectReadFailure(()=>reader.query({search:'synthetic-unmatched-filter'}),403,'ATTENDANCE_CAPABILITY_REQUIRED');
  const permissionCut=(await reader.query()).dashboard.snapshotId;
  await reader.capability('workforce.employee.read',true);
  // Exercise nominal permission with an empty future period: no real names are
  // returned, persisted or printed by this verifier.
  const nominalEmpty=await reader.query({from:'2090-01-01',to:'2090-01-01',search:'synthetic-unmatched-filter'});
  assert.equal(nominalEmpty.nominalReadAllowed,true);assert.equal(nominalEmpty.records.length,0);
  await expectReadFailure(()=>reader.query({snapshot:permissionCut,from:'2090-01-01',to:'2090-01-01'}),409,'ATTENDANCE_CAPTURE_CHANGED');
  await reader.capability('workforce.employee.read',false);
  await expectReadFailure(()=>reader.query({source:'historical',snapshot:permissionCut}),409,'ATTENDANCE_CAPTURE_CHANGED');
  await reader.capability('attendance.read',false);
  await expectReadFailure(()=>reader.query(),403,'ATTENDANCE_CAPABILITY_REQUIRED');
  await reader.capability('attendance.read',true);
  await expectReadFailure(()=>getAttendanceClockDashboard(client,{...reader.principal,tenant:{...reader.principal.tenant,id:randomUUID()}},{source:'continuous'},reader.session),401,'ATTENDANCE_SESSION_INVALID');
  await client.query('SAVEPOINT synthetic_session_revocation');
  await client.query("UPDATE tenant_identity_session SET status='revoked',revoked_at=now(),revoked_by_user_email=user_email,version=version+1 WHERE id=$1",[reader.session.id]);
  await expectReadFailure(()=>reader.query(),401,'ATTENDANCE_SESSION_INVALID');
  await client.query('ROLLBACK TO SAVEPOINT synthetic_session_revocation');
  assert.equal(await guards(),guardFingerprint,'REAL_AUTH_GUARDS_CHANGED');
  passed.push('nominal search, membership capability, wrong tenant, source cut and revoked session enforce real guards without bypass');
  await client.query('SET CONSTRAINTS ALL IMMEDIATE');
  passed.push('deferred evidence foreign keys valid before commit boundary');
  // Role membership is granted only inside this rollback transaction so the
  // owner test connection can exercise the already restricted application role.
  await client.query('GRANT municontrol_actions_runtime_app TO CURRENT_USER');
  await client.query('SET LOCAL ROLE municontrol_actions_runtime_app');
  const replay=await receive(fresh);assert.equal(replay.replayed,true);
  const runtimeDashboard=await reader.query(syntheticDay);
  assert.equal(runtimeDashboard.summary.marks,dayBefore.summary.marks+503);
  await expectFailure(()=>client.query('SELECT * FROM attendance_pm10_record LIMIT 1'),/permission denied/);
  await expectFailure(()=>client.query('SELECT * FROM attendance_clock_identity_key LIMIT 1'),/permission denied/);
  await client.query('RESET ROLE');
  passed.push('restricted runtime executes receiver and dashboard but cannot read raw evidence or HMAC key');
} catch(error) {
  console.error(JSON.stringify({ok:false,stage:diagnosticStage,code:error.code??null,position:error.position??null,routine:error.routine??null,reason: /^[A-Z_]+$/.test(error.message)?error.message:'SQL_OR_ASSERTION_FAILED',checksPassed:passed}));
  process.exitCode=1;
} finally {
  await client.query('ROLLBACK');
  const final=await counts();assert.deepEqual(final,initial,'ROLLBACK_DID_NOT_RESTORE_BASELINE');
  const absent=(await client.query("SELECT to_regclass('public.attendance_pm10_receipt') IS NULL AS absent")).rows[0].absent;
  assert.equal(absent,true,'QA_SCHEMA_WAS_NOT_ROLLED_BACK');
  const dashboardAbsent=(await client.query("SELECT NOT EXISTS(SELECT 1 FROM pg_proc WHERE proname='attendance_clock_dashboard_v3') AS absent")).rows[0].absent;
  assert.equal(dashboardAbsent,true,'QA_DASHBOARD_SCHEMA_WAS_NOT_ROLLED_BACK');
  assert.equal(await guards(),guardFingerprint,'ROLLBACK_AUTH_GUARDS_CHANGED');
  console.log(JSON.stringify({ok:!process.exitCode,checksPassed:passed,baseline:initial,rollbackRestored:true,clockContacted:false,municipalDataPersisted:false,observedAt:new Date().toISOString()},null,2));
  await client.release();await pool.end();
}
