// Offline SQL generator. Actual 055/070 migrations run only in a disposable CI database.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const quote=x=>"'"+String(x).replaceAll("'","''")+"'";
const json=x=>quote(JSON.stringify(x))+'::jsonb';
const hash=x=>createHash('sha256').update(x).digest('hex');
const read=name=>fs.readFileSync(path.join(root,'scripts/migrations',name),'utf8').replaceAll('\r\n','\n');
function section(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,'Native SQL section missing');return source.slice(a,b);}
function nativeFunction(source,name){const a=source.indexOf('CREATE OR REPLACE FUNCTION '+name+'(');assert.ok(a>=0,'Native function missing: '+name);const b=source.indexOf('$$',a),c=source.indexOf('$$;',b+2);assert.ok(b>a&&c>b);return source.slice(a,c+3);}
function raw(sequence,{identity='99000001',invalidDate=false}={}){
 const bytes=Buffer.alloc(40);bytes.writeUInt16LE(sequence,0);bytes.write(identity,2,'ascii');bytes[26]=1;bytes[31]=255;
 const packed=((((2026-2000)*12+(invalidDate?1:8))*31+(invalidDate?29:9))*24+7)*3600+(sequence%3600);
 bytes.writeUInt32LE(packed,27);return bytes;
}
function payload(serial,bytes,{snapshot='qa snapshot',recordsHash=hash(bytes),total=bytes.length/40,start=0,snapshotCount=total,ordinals}={}){
 const snapshotSha256=hash(snapshot);return {version:'zk40-delivery.v1',serial,batchId:hash(snapshotSha256+':'+recordsHash),snapshotSha256,recordsSha256:recordsHash,snapshotRecordCount:snapshotCount,totalRecords:total,partStart:start,capturedAt:'2026-09-11T12:00:00.000Z',partSha256:hash(bytes),ordinals:ordinals??Array.from({length:bytes.length/40},(_,i)=>start+i+1),recordsBase64:bytes.toString('base64')};
}
export function buildZk40PostgresQa({serverMajor,requireConcurrency=false}){
 assert.ok([17,18].includes(Number(serverMajor)),'Expected PostgreSQL major must be 17 or 18');
 const source002=read('002-canonical-integration.sql'),source022=read('022-attendance-device-gateway.sql'),source045=read('045-clock-snapshot-operations.sql'),source055=read('055-pm10-continuous-reception.sql'),source070=read('070-zk40-multiclock-reception.sql');
 const gateway=section(source022,'CREATE TABLE IF NOT EXISTS attendance_marking_site (','CREATE OR REPLACE FUNCTION attendance_gateway_assert_actor_v1(');
 const snapshots=section(source045,'CREATE TABLE IF NOT EXISTS attendance_clock_snapshot (','CREATE OR REPLACE FUNCTION public.attendance_clock_operations_v1(');
 const tenant=randomUUID(),foreignTenant=randomUUID(),membership=randomUUID(),foreignMembership=randomUUID(),binding=randomUUID(),foreignBinding=randomUUID(),batch=randomUUID(),foreignBatch=randomUUID(),person=randomUUID(),contract=randomUUID();
 const release='a'.repeat(40),email='qa-clock@example.invalid';
 const clocks=Array.from({length:8},(_,i)=>({id:randomUUID(),site:randomUUID(),connector:randomUUID(),key:'qa-clock-connector-'+i,serial:i===5?'CQTU225360168':'SYNTHETIC-CLOCK-'+i,tenant:i===6?foreignTenant:tenant,membership:i===6?foreignMembership:membership,token:hash('public synthetic connector '+i)}));
 const main=clocks[0],foreign=clocks[6],blocked=clocks[7];
 const firstBody=payload(main.serial,Buffer.concat([raw(1),raw(2),raw(3,{invalidDate:true})]));
 const statements=[];let checks=0;
 const exec=s=>statements.push(s);
 const ok=(expr,label)=>{exec(`PERFORM qa_assert((${expr}),${quote(label)}); checks:=checks+1;`);checks++;};
 const receive=(body='body',clock=main)=>`attendance_zk40_receive_v1(${quote(clock.key)},${quote(clock.token)},${body},${quote(release)})`;
 const rejects=(sql,error,label)=>ok(`qa_rejects(${sql},${quote(error)})`,label);
 const rejectBody=(body,error,label,clock=main)=>rejects(`format(${quote('SELECT attendance_zk40_receive_v1(%L,%L,%L::jsonb,%L)')},${quote(clock.key)},${quote(clock.token)},${body},${quote(release)})`,error,label);
 const restoreStart=sql=>exec('BEGIN '+sql);
 const restoreEnd=()=>exec("RAISE EXCEPTION USING ERRCODE='P0701',MESSAGE='RESTORE_QA_FIXTURE'; EXCEPTION WHEN SQLSTATE 'P0701' THEN NULL; END;");
 ok("encode(digest(pg_get_functiondef('attendance_pm10_receive_v1(text,text,jsonb,text)'::regprocedure),'sha256'),'hex')=pm10_before",'070 preserves the exact original PM10 receiver definition');
 ok("(SELECT relrowsecurity FROM pg_class WHERE oid='attendance_zk40_enrollment'::regclass)",'enrollment has row security enabled');
 ok("NOT has_table_privilege('municontrol_actions_runtime_app','attendance_zk40_enrollment','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')",'runtime cannot read or modify enrollment directly');
 ok("has_function_privilege('municontrol_actions_runtime_app','attendance_zk40_receive_v1(text,text,jsonb,text)','EXECUTE') AND has_function_privilege('municontrol_actions_runtime_app','attendance_pm10_receive_v1(text,text,jsonb,text)','EXECUTE')",'new receiver and preserved PM10 receiver have explicit runtime grants');
 ok("NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid IN ('attendance_zk40_receive_v1(text,text,jsonb,text)'::regprocedure,'attendance_pm10_receive_v1(text,text,jsonb,text)'::regprocedure) AND a.grantee=0 AND a.privilege_type='EXECUTE')",'PUBLIC cannot invoke either receiver');
 for(const mutation of ['UPDATE attendance_zk40_enrollment SET serial_number=serial_number','DELETE FROM attendance_zk40_enrollment','TRUNCATE attendance_zk40_enrollment'])rejects(quote(mutation),'55000','enrollment rejects '+mutation.split(' ')[0]);
 if(requireConcurrency){
  const key=`hashtextextended(${quote('clock-owner-import:'+blocked.tenant+':'+blocked.serial)},0)`;
  ok(`EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND pid<>pg_backend_pid() AND granted AND objsubid=1 AND classid=(((${key})>>32)&4294967295)::oid AND objid=((${key})&4294967295)::oid)`,'independent session owns this exact device import lock');
  rejectBody(json(payload(blocked.serial,raw(1))),'ZK40_BUSY','concurrent import blocks reception before any receipt',blocked);
 }
 exec(`body:=${json(firstBody)};`);
 rejects(quote(`SELECT attendance_zk40_receive_v1(${quote(main.key)},${quote(clocks[1].token)},${json(firstBody)},${quote(release)})`),'ZK40_AUTH_DENIED','one device token cannot authenticate another connector');
 rejectBody("body||jsonb_build_object('serial',"+quote(clocks[1].serial)+")",'ZK40_PAYLOAD_INVALID','connector cannot submit another enrolled serial');
 rejectBody("body||jsonb_build_object('tenantId',"+quote(foreignTenant)+")",'ZK40_PAYLOAD_INVALID','client cannot choose a tenant');
 for(const [change,error,label] of [
  [`UPDATE attendance_connector SET status='suspended' WHERE id=${quote(main.connector)}`,'ZK40_AUTH_DENIED','suspended connector'],
  [`UPDATE attendance_device SET status='suspended' WHERE id=${quote(main.id)}`,'ZK40_CONTEXT_DENIED','suspended device'],
  [`UPDATE attendance_marking_site SET status='suspended' WHERE id=${quote(main.site)}`,'ZK40_CONTEXT_DENIED','suspended site'],
  [`UPDATE platform_tenant SET status='suspended' WHERE id=${quote(tenant)}`,'ZK40_BINDING_REQUIRED','suspended tenant'],
  [`UPDATE platform_tenant_source_binding SET verified=false WHERE id=${quote(binding)}`,'ZK40_BINDING_REQUIRED','unverified binding'],
  [`UPDATE tenant_identity_policy SET certified_release_sha=repeat('b',40) WHERE tenant_id=${quote(tenant)}`,'ZK40_BINDING_REQUIRED','uncertified release'],
  [`DELETE FROM attendance_clock_identity_key WHERE tenant_id=${quote(tenant)}`,'ZK40_IDENTITY_KEY_REQUIRED','missing tenant identity key'],
  [`UPDATE attendance_device SET site_id=${quote(clocks[1].site)} WHERE id=${quote(main.id)}`,'ZK40_CONTEXT_DENIED','enrollment cannot follow a changed site'],
 ]){restoreStart(change+';');rejectBody('body',error,label+' is rejected');restoreEnd();}
 rejectBody(json(payload(clocks[5].serial,raw(1))),'ZK40_CONTEXT_DENIED','PM10 device is not silently enrolled in the multi-clock endpoint',clocks[5]);
 exec(`receipt:=${receive()}; before_counts:=qa_counts();`);
 ok("receipt->>'version'='zk40-receipt.v1' AND receipt->>'serial'=body->>'serial' AND receipt->>'persisted'='true' AND receipt->>'payrollModified'='false' AND receipt->>'newCanonical'='2' AND receipt->>'observed'='1' AND receipt->>'duplicates'='0'",'exact durable receipt counts two raw marks and one observed invalid date');
 ok(`(SELECT count(*)=2 AND bool_and(review_state='pending' AND reconciliation_state='mapped' AND method='unknown' AND direction='unknown') FROM attendance_canonical_punch WHERE device_id=${quote(main.id)})`,'mapped source marks remain pending and never infer direction or approval');
 ok(`(SELECT count(*)=1 FROM attendance_pm10_record WHERE device_id=${quote(main.id)} AND issue_codes @> ARRAY['timestamp_invalid'])`,'invalid civil date remains source evidence');
 ok(`(SELECT count(*)=2 AND bool_and(event_key='zk40-v1:'||lower(${quote(main.serial)})||':'||encode(digest(r.raw_record,'sha256'),'hex')) FROM attendance_raw_event e JOIN attendance_pm10_record r ON r.raw_event_id=e.id WHERE e.device_id=${quote(main.id)})`,'event keys retain lowercase serial and exact raw-record hash');
 ok(`(SELECT bool_and(identity_hmac_sha256=encode(hmac(convert_to('clock-v1:'||${quote(tenant)}||':99000001','UTF8'),decode(repeat('1a',32),'hex'),'sha256'),'hex')) FROM attendance_raw_event WHERE device_id=${quote(main.id)})`,'native HMAC contract remains tenant-bound clock-v1');
 exec(`result:=${receive()};`);
 ok("result->>'replayed'='true' AND result-'replayed'=receipt-'replayed' AND qa_counts()=before_counts",'same request returns exact prior receipt without any duplicate writes');
 rejectBody("body||'{\"capturedAt\":\"2026-09-11T11:00:00.000Z\"}'",'ZK40_IDEMPOTENCY_CONFLICT','same batch and part with different bytes or metadata conflicts');
 restoreStart(`UPDATE attendance_connector SET token_sha256=repeat('f',64) WHERE id=${quote(main.connector)};`);
 rejectBody('body','ZK40_AUTH_DENIED','rotated token cannot recover a previously accepted receipt');restoreEnd();
 exec(`result:=${receive(json(payload(main.serial,Buffer.concat([raw(1),raw(2),raw(3,{invalidDate:true})]),{snapshot:'another complete source capture'})))};`);
 ok("result->>'duplicates'='3' AND result->>'newCanonical'='0' AND result->>'observed'='0'",'another capture of known bytes returns duplicates while retaining its receipt');
 for(const clock of clocks.slice(1,5)){
  exec(`result:=${receive(json(payload(clock.serial,raw(1))),clock)};`);
  ok(`result->>'serial'=${quote(clock.serial)} AND result->>'newCanonical'='1' AND result->>'duplicates'='0'`,'same source bytes on '+clock.serial+' remain a separate enrolled device event');
 }
 exec(`result:=${receive(json(payload(foreign.serial,raw(1))),foreign)};`);
 ok("result->>'newCanonical'='1' AND result->>'duplicates'='0'",'same raw bytes in another tenant do not collide');
 ok(`(SELECT reconciliation_state='unmapped' AND employment_contract_id IS NULL FROM attendance_canonical_punch WHERE device_id=${quote(foreign.id)})`,'another tenant cannot inherit this municipality contract mapping');
 const pmBody={...payload(clocks[5].serial,raw(1)),version:'pm10-delivery.v1'};
 exec(`result:=attendance_pm10_receive_v1(${quote(clocks[5].key)},${quote(clocks[5].token)},${json(pmBody)},${quote(release)});`);
 ok("result->>'version'='pm10-receipt.v1' AND result->>'newCanonical'='1' AND NOT result?'serial'",'existing PM10 endpoint retains its original receipt contract');
 // Native identity guard and current source rules are retained in this fixture.
 restoreStart(`UPDATE attendance_identity_map SET status='revoked',revoked_at=clock_timestamp(),version=version+1 WHERE device_id=${quote(main.id)};`);
 exec(`result:=${receive(json(payload(main.serial,raw(21))))};`);
 ok(`(SELECT count(*)=1 AND bool_and(status='revoked') FROM attendance_identity_map WHERE device_id=${quote(main.id)}) AND (SELECT reconciliation_state='unmapped' FROM attendance_canonical_punch p JOIN attendance_raw_event e ON e.id=p.raw_event_id WHERE e.device_id=${quote(main.id)} AND e.event_key LIKE '%${hash(raw(21))}')`,'revoked identity is never recreated or silently mapped');restoreEnd();
 const all=Buffer.concat(Array.from({length:501},(_,i)=>raw(1000+i))),allHash=hash(all);
 const tail=payload(main.serial,all.subarray(500*40),{snapshot:'multipart reverse order',recordsHash:allHash,total:501,start:500});
 const head=payload(main.serial,all.subarray(0,500*40),{snapshot:'multipart reverse order',recordsHash:allHash,total:501});
 exec(`result:=${receive(json(tail))}; receipt:=${receive(json(head))};`);
 ok("result->>'count'='1' AND receipt->>'count'='500'",'native receiver accepts out-of-order parts and verifies the final assembled 501-record hash');
 ok(`(SELECT sum(record_count)=501 AND count(*)=2 FROM attendance_pm10_receipt WHERE connector_id=${quote(main.connector)} AND batch_key=${quote(head.batchId)})`,'every multipart byte is retained under exact source ordinals');
 const badHead=payload(main.serial,all.subarray(0,500*40),{snapshot:'wrong assembled hash',recordsHash:'d'.repeat(64),total:501});
 const badTail=payload(main.serial,all.subarray(500*40),{snapshot:'wrong assembled hash',recordsHash:'d'.repeat(64),total:501,start:500});
 exec(`result:=${receive(json(badHead))}; before_counts:=qa_counts();`);
 rejectBody(json(badTail),'ZK40_PAYLOAD_INVALID','final part cannot confirm an incorrect assembled delta hash');
 ok('qa_counts()=before_counts','rejected final part preserves accepted earlier evidence without appending anything');
 const ordinalHead=payload(main.serial,all.subarray(0,500*40),{snapshot:'overlapping source ordinals',recordsHash:allHash,total:501});
 const ordinalTail=payload(main.serial,all.subarray(500*40),{snapshot:'overlapping source ordinals',recordsHash:allHash,total:501,start:500,ordinals:[500]});
 exec(`result:=${receive(json(ordinalHead))};`);rejectBody(json(ordinalTail),'ZK40_PAYLOAD_INVALID','assembled source ordinals must be globally increasing');
 // Abort at the final audit insert: no earlier mark, identity, receipt or telemetry survives.
 exec(`before_counts:=qa_counts();
 CREATE FUNCTION qa_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $fail$ BEGIN RAISE EXCEPTION 'QA_AUDIT_FAILURE'; END $fail$;
 CREATE TRIGGER qa_fail_late BEFORE INSERT ON attendance_gateway_audit_event FOR EACH ROW EXECUTE FUNCTION qa_fail_audit();`);
 rejectBody(json(payload(main.serial,raw(2500,{identity:'99000002'}))),'QA_AUDIT_FAILURE','a final audit failure aborts the entire native receive operation');
 ok('qa_counts()=before_counts','audit failure rolls back source, raw, canonical, identity, receipt and connector telemetry together');
 exec('DROP TRIGGER qa_fail_late ON attendance_gateway_audit_event;');
 for(const table of ['attendance_pm10_receipt','attendance_pm10_record','attendance_raw_event','attendance_gateway_audit_event']){
  rejects(quote('UPDATE '+table+' SET tenant_id=tenant_id'),'ATTENDANCE_APPEND_ONLY',table+' remains append-only');
  ok(`NOT has_table_privilege('municontrol_actions_runtime_app',${quote(table)},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')`,table+' denies direct runtime access');
 }
 ok("encode(digest(pg_get_functiondef('attendance_pm10_receive_v1(text,text,jsonb,text)'::regprocedure),'sha256'),'hex')=pm10_before",'all ZK40 operations preserve the original PM10 function');
 exec('SET CONSTRAINTS ALL IMMEDIATE;');
 ok('true','native deferred receipt and tenant foreign keys validate before rollback');

 const pins=`IF current_database()<>'zk40_reception_qa' OR current_setting('server_version_num')::int/10000<>${Number(serverMajor)} OR nullif(current_setting('neon.project_id',true),'') IS NOT NULL OR nullif(current_setting('neon.branch_id',true),'') IS NOT NULL THEN RAISE EXCEPTION 'ZK40_QA_DISPOSABLE_LOCAL_DATABASE_REQUIRED'; END IF;`;
 const foundational=`
 CREATE TABLE platform_tenant(id uuid PRIMARY KEY,status text);
 CREATE TABLE tenant_membership(id uuid PRIMARY KEY,tenant_id uuid,UNIQUE(id,tenant_id));
 CREATE TABLE internal_users(email text PRIMARY KEY);
 CREATE TABLE platform_tenant_source_binding(id uuid PRIMARY KEY,tenant_id uuid,source_system text,source_company_id bigint,source_database text,verified boolean,UNIQUE(tenant_id,id));
 CREATE TABLE tenant_identity_policy(tenant_id uuid PRIMARY KEY,tenant_data_plane_ready boolean,certified_release_sha text,certified_source_binding_id uuid);
 CREATE TABLE person_identity(id uuid PRIMARY KEY,dni text,identity_state text,full_name text);
 CREATE TABLE source_import_batch(id uuid PRIMARY KEY,source_system text,source_database text,validation_state text,legacy_import_run_id bigint);
 CREATE TABLE employment_contract(id uuid PRIMARY KEY,person_id uuid,source_system text,legacy_company_id bigint,source_batch_id uuid,status text,start_date date,end_date date,legacy_legajo text);
 ${nativeFunction(source002,'reject_immutable_source_change')}
 ${gateway}
 ${snapshots}
 REVOKE ALL ON attendance_marking_site,attendance_device,attendance_connector,attendance_identity_map,attendance_ingest_batch,attendance_raw_event,attendance_canonical_punch,attendance_gateway_audit_event FROM PUBLIC,municontrol_actions_runtime_app;
 CREATE FUNCTION qa_assert(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $assert$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'ZK40_QA_FAILED: %',label; END IF; END $assert$;
 CREATE FUNCTION qa_rejects(statement text,wanted text) RETURNS boolean LANGUAGE plpgsql AS $rejects$ BEGIN EXECUTE statement; RETURN false; EXCEPTION WHEN OTHERS THEN IF SQLERRM=wanted OR SQLSTATE=wanted THEN RETURN true; END IF; RAISE; END $rejects$;
 CREATE FUNCTION qa_counts() RETURNS jsonb LANGUAGE sql AS $counts$ SELECT jsonb_build_object('raw',(SELECT count(*) FROM attendance_raw_event),'canonical',(SELECT count(*) FROM attendance_canonical_punch),'receipts',(SELECT count(*) FROM attendance_pm10_receipt),'records',(SELECT count(*) FROM attendance_pm10_record),'audit',(SELECT count(*) FROM attendance_gateway_audit_event),'identities',(SELECT count(*) FROM attendance_identity_map),'batches',(SELECT count(*) FROM attendance_ingest_batch),'telemetry',(SELECT md5(jsonb_agg(to_jsonb(c) ORDER BY id)::text) FROM attendance_connector c)) $counts$;
 `;
 // qa_counts references the real 055 tables, so create it after the migration.
 const split=foundational.indexOf(' CREATE FUNCTION qa_counts()');
 const fixtures=`
 INSERT INTO platform_tenant VALUES(${quote(tenant)},'active'),(${quote(foreignTenant)},'active');
 INSERT INTO tenant_membership VALUES(${quote(membership)},${quote(tenant)}),(${quote(foreignMembership)},${quote(foreignTenant)});
 INSERT INTO internal_users VALUES(${quote(email)});
 INSERT INTO platform_tenant_source_binding VALUES(${quote(binding)},${quote(tenant)},'GRH',1,'qa_source',true),(${quote(foreignBinding)},${quote(foreignTenant)},'GRH',2,'qa_other_source',true);
 INSERT INTO tenant_identity_policy SELECT tenant_id,true,${quote(release)},id FROM platform_tenant_source_binding;
 INSERT INTO source_import_batch VALUES(${quote(batch)},'GRH','qa_source','published',1),(${quote(foreignBatch)},'GRH','qa_other_source','published',2);
 INSERT INTO person_identity VALUES(${quote(person)},'99000001','active','Persona sintética');
 INSERT INTO employment_contract VALUES(${quote(contract)},${quote(person)},'GRH',1,${quote(batch)},'active','2020-01-01',NULL,'901');
 INSERT INTO attendance_clock_identity_key(tenant_id,secret) VALUES(${quote(tenant)},decode(repeat('1a',32),'hex')),(${quote(foreignTenant)},decode(repeat('2b',32),'hex'));
 ${clocks.map((c,i)=>`INSERT INTO attendance_marking_site(id,tenant_id,external_key,label,network_enabled,status,created_by_membership_id) VALUES(${quote(c.site)},${quote(c.tenant)},${quote(i===5?'pm-10':'qa-site-'+i)},'Punto sintético',true,'active',${quote(c.membership)});
 INSERT INTO attendance_device(id,tenant_id,site_id,external_key,vendor_key,model,transport,driver_key,serial_number,firmware_version,protocol_key,network_host,network_port,capabilities,status,created_by_membership_id) VALUES(${quote(c.id)},${quote(c.tenant)},${quote(c.site)},${quote('qa-device-'+i)},'qa','Synthetic','network_pull','zk40-snapshot.v1',${quote(c.serial)},'qa-only','zk40','127.0.0.1',4370,'{"pull":true,"push":false,"biometric":false,"card":false,"pin":false}','active',${quote(c.membership)});
 INSERT INTO attendance_connector(id,tenant_id,device_id,external_key,driver_key,token_sha256,status,created_by_membership_id) VALUES(${quote(c.connector)},${quote(c.tenant)},${quote(c.id)},${quote(c.key)},'zk40-snapshot.v1',${quote(c.token)},'active',${quote(c.membership)});
 ${i===5?'':`INSERT INTO attendance_zk40_enrollment(tenant_id,device_id,connector_id,site_id,serial_number,protocol_profile,source_evidence_sha256,capture_evidence_sha256,enrolled_by_email) VALUES(${quote(c.tenant)},${quote(c.id)},${quote(c.connector)},${quote(c.site)},${quote(c.serial)},'zk40-readonly.v1',repeat('a',64),repeat('b',64),${quote(email)});`}`).join('\n')}
 `;
 const report={ok:true,checksPassed:checks,serverMajor:Number(serverMajor),migration055Sha256:hash(source055),migration070Sha256:hash(source070),nativePrerequisiteHashEnforced:true,concurrentImportCheck:requireConcurrency,syntheticRowsRolledBack:true,productionContacted:false,clockContacted:false,limitations:['Canonical/IAM parent tables are minimal synthetic fixtures; receiver token, enrollment, binding and tenant checks and 022 attendance constraints/triggers run natively.','055 and 070 run unchanged in public inside a disposable empty local CI database because the exact pg_get_functiondef prerequisite pins that schema.','No device protocol, live host, capacity sufficiency or production acceptance is certified. Operator read-session/fleet UI authorization is outside this receiver SQL suite.']};
 const sql=`BEGIN ISOLATION LEVEL READ COMMITTED;
 SET LOCAL statement_timeout='90s'; SET LOCAL lock_timeout='2s'; SET LOCAL search_path=public,pg_catalog,pg_temp;
 DO $qa$ DECLARE checks integer:=0; pm10_before text; body jsonb; receipt jsonb; result jsonb; before_counts jsonb;
 BEGIN ${pins}
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')) THEN RAISE EXCEPTION 'ZK40_QA_EMPTY_PUBLIC_REQUIRED'; END IF;
 BEGIN
 ${foundational.slice(0,split)}
 EXECUTE ${quote(source055)};
 ${foundational.slice(split)}
 pm10_before:=encode(digest(pg_get_functiondef('attendance_pm10_receive_v1(text,text,jsonb,text)'::regprocedure),'sha256'),'hex');
 EXECUTE ${quote(source070)};
 ${fixtures}
 ${statements.join('\n')}
 RAISE EXCEPTION USING ERRCODE='P0700',MESSAGE='ZK40_QA_SUCCESS_ROLLBACK';
 EXCEPTION WHEN SQLSTATE 'P0700' THEN NULL; END;
 IF checks<>${checks} OR to_regclass('public.attendance_zk40_enrollment') IS NOT NULL OR to_regclass('public.attendance_pm10_receipt') IS NOT NULL OR to_regclass('public.platform_tenant') IS NOT NULL OR to_regprocedure('public.attendance_zk40_receive_v1(text,text,jsonb,text)') IS NOT NULL THEN RAISE EXCEPTION 'ZK40_QA_ROLLBACK_FAILED'; END IF;
 PERFORM set_config('mc.zk40_qa_report',${json(report)}::text,true);
 END $qa$;
 SELECT current_setting('mc.zk40_qa_report')::jsonb AS evidence;
 ROLLBACK;
 `;
 const lockSql=`BEGIN; SET LOCAL idle_in_transaction_session_timeout='60s'; DO $pin$ BEGIN ${pins} END $pin$;
 SELECT pg_advisory_xact_lock(hashtextextended(${quote('clock-owner-import:'+blocked.tenant+':'+blocked.serial)},0));
 SELECT 'ZK40_QA_LOCK_READY' AS readiness; SELECT pg_sleep(45); ROLLBACK;
 `;
 return {sql,lockSql,report};
}
function main(){
 const args={};for(const arg of process.argv.slice(2)){if(arg==='--ci'){args.ci=true;continue;}if(arg==='--require-concurrency'){args.concurrency=true;continue;}const match=/^--(expected-major|write-sql|write-lock-sql)=(.+)$/.exec(arg);assert.ok(match,'Unknown or incomplete argument');assert.equal(args[match[1]],undefined,'Duplicate argument');args[match[1]]=match[2];}
 assert.equal(args.ci,true,'Only offline --ci generation is supported');assert.ok(args['write-sql'],'Explicit SQL output required');assert.ok(!args.concurrency||args['write-lock-sql'],'Concurrency requires independent lock SQL output');
 const value=buildZk40PostgresQa({serverMajor:args['expected-major'],requireConcurrency:!!args.concurrency});const outputs=[['write-sql',value.sql],['write-lock-sql',value.lockSql]].filter(([key])=>args[key]).map(([key,contents])=>({file:path.resolve(args[key]),contents}));assert.equal(new Set(outputs.map(x=>x.file)).size,outputs.length,'Output paths must differ');
 for(const {file} of outputs)assert.ok(!fs.existsSync(file),'Output exists; choose a new path');for(const {file,contents} of outputs){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,contents,{flag:'wx'});}
 console.log(JSON.stringify({generated:true,databaseExecuted:false,checksPlanned:value.report.checksPassed,migration055Sha256:value.report.migration055Sha256,migration070Sha256:value.report.migration070Sha256}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{main();}catch(error){console.error(JSON.stringify({ok:false,message:error.message}));process.exitCode=1;}
