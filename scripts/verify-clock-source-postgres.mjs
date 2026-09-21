// Offline generator: the emitted QA SQL can execute only against an empty local
// clock_source_qa database. It installs the actual source store inside rollback.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const json=value=>quote(JSON.stringify(value))+'::jsonb';
const hash=value=>createHash('sha256').update(value).digest('hex');
const migrationPath=path.join(root,'scripts/clock-database/001-source-store.sql');

export function syntheticClockSourceRecord(sequence){
 assert.ok(Number.isInteger(sequence)&&sequence>=0&&sequence<=65535,'Synthetic record sequence out of range');
 const bytes=Buffer.alloc(40);bytes.writeUInt16LE(sequence,0);bytes.write('99000001',2,'ascii');bytes[26]=1;bytes[31]=255;
 const packed=(((((2026-2000)*12+8)*31+20)*24+7)*3600)+(sequence%3600);
 bytes.writeUInt32LE(packed,27);return bytes;
}
export function syntheticClockSourcePayload(serial,bytes,{snapshot='synthetic clock source',recordsHash=hash(bytes),total=bytes.length/40,start=0,snapshotCount=total,ordinals}={}){
 assert.ok(Buffer.isBuffer(bytes),'Synthetic source bytes must be a Buffer');
 const snapshotSha256=hash(snapshot);
 return {version:'zk40-delivery.v1',serial,batchId:hash(snapshotSha256+':'+recordsHash),snapshotSha256,recordsSha256:recordsHash,snapshotRecordCount:snapshotCount,totalRecords:total,partStart:start,capturedAt:'2026-09-21T12:00:00.000Z',partSha256:hash(bytes),ordinals:ordinals??Array.from({length:bytes.length/40},(_,i)=>start+i+1),recordsBase64:bytes.toString('base64')};
}
const advisoryHeld=(key,predicate='pid<>pg_backend_pid()')=>`EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND ${predicate} AND granted AND objsubid=1 AND classid=((hashtextextended(${quote(key)},0)>>32)&4294967295)::oid AND objid=(hashtextextended(${quote(key)},0)&4294967295)::oid)`;

export function buildClockSourcePostgresQa({serverMajor,requireConcurrency=false}={}){
 assert.ok([17,18].includes(Number(serverMajor)),'Expected PostgreSQL major must be 17 or 18');
 assert.equal(typeof requireConcurrency,'boolean','Concurrency option must be boolean');
 const source=fs.readFileSync(migrationPath,'utf8').replaceAll('\r\n','\n');
 assert.ok(source.trim(),'Source-store migration is empty');
 const tenant=randomUUID(),otherTenant=randomUUID();
 const clocks=Array.from({length:3},(_,i)=>({id:randomUUID(),tenant:i===2?otherTenant:tenant,serial:'SYNTHETIC-SOURCE-'+i,key:'qa-source-connector-'+i,token:hash('public synthetic source credential '+i)}));
 const main=clocks[0],peer=clocks[1],foreign=clocks[2],signalKey='clock-source:qa-release:'+randomUUID(),capacityKey='clock-source:capacity:v1',installer='clock_source_qa_installer';
 const statements=[];let checks=0;
 const exec=sql=>statements.push(sql);
 const ok=(expr,label)=>{exec(`PERFORM pg_temp.qa_assert((${expr}),${quote(label)}); checks:=checks+1;`);checks++;};
 const receive=(body='body',clock=main)=>`pg_temp.qa_receive(${quote(clock.key)},${quote(clock.token)},${body})`;
 const rejects=(statement,wanted,label,runtime=true)=>ok(`pg_temp.qa_rejects(${statement},${quote(wanted)},${runtime})`,label);
 const rejectBody=(body,wanted,label,clock=main)=>rejects(`format(${quote('SELECT clock_source.receive_v1(%L,%L,%L::jsonb)')},${quote(clock.key)},${quote(clock.token)},${body})`,wanted,label);
 const restoreStart=statement=>exec('BEGIN '+statement+';');
 const restoreEnd=()=>exec("RAISE EXCEPTION USING ERRCODE='PC002',MESSAGE='RESTORE_SOURCE_QA'; EXCEPTION WHEN SQLSTATE 'PC002' THEN NULL; END;");
 const counts='pg_temp.qa_counts()';

 ok("(SELECT count(*)=5 AND bool_and(c.relrowsecurity) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='clock_source' AND c.relkind='r')",'all five source tables enforce row security');
 ok("(SELECT NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication FROM pg_roles WHERE rolname='clocks_source_runtime')",'runtime role has no administrative or login authority');
 ok("has_schema_privilege('clocks_source_runtime','clock_source','USAGE') AND NOT has_schema_privilege('clocks_source_runtime','clock_source','CREATE') AND has_function_privilege('clocks_source_runtime','clock_source.receive_v1(text,text,jsonb)','EXECUTE')",'runtime can only enter schema and call the receiver');
 ok("NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='clock_source' AND c.relkind IN ('r','p','S') AND has_table_privilege('clocks_source_runtime',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))",'runtime has no direct table privileges');
 ok("NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::\"char\" ELSE 'r'::\"char\" END,c.relowner))) a WHERE n.nspname='clock_source' AND a.grantee=0)", 'PUBLIC has no source-table or sequence grants');
 ok("NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE n.nspname='clock_source' AND a.grantee=0 AND a.privilege_type='EXECUTE')",'PUBLIC cannot execute source functions');
 ok("NOT EXISTS(SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a WHERE n.nspname='clock_source' AND a.grantee=0)", 'PUBLIC has no source-schema grants');
 for(const table of ['installation','enrollment','batch','part','completion'])for(const statement of [`SELECT * FROM clock_source.${table}`,`INSERT INTO clock_source.${table} DEFAULT VALUES`,`DELETE FROM clock_source.${table}`,`TRUNCATE clock_source.${table}`])rejects(quote(statement),'42501','runtime rejects direct '+statement.split(' ')[0]+' on '+table);
 rejects(quote('UPDATE clock_source.enrollment SET enabled=enabled'),'42501','runtime cannot enable or revoke a connector');
 rejects(quote('CREATE TABLE clock_source.qa_runtime_write(value integer)'),'42501','runtime cannot create objects in source schema');
 exec(`before_counts:=${counts}; SET LOCAL ROLE ${installer}; EXECUTE ${quote(source)}; RESET ROLE;`);
 ok(`${counts}=before_counts`,'reinstalling the exact source schema preserves all enrollment and installation data');
 ok(`(SELECT NOT rolsuper AND rolcreaterole AND rolcreatedb AND NOT rolbypassrls FROM pg_roles WHERE rolname=${quote(installer)}) AND (SELECT nspowner=${quote(installer)}::regrole FROM pg_namespace WHERE nspname='clock_source')`,'non-superuser installer with CREATEROLE owns and successfully reinstalls its schema');

 const firstBytes=Buffer.concat([syntheticClockSourceRecord(1),syntheticClockSourceRecord(2),syntheticClockSourceRecord(3)]);
 const first=syntheticClockSourcePayload(main.serial,firstBytes);
 exec(`body:=${json(first)};`);
 rejects(quote(`SELECT clock_source.receive_v1(${quote(main.key)},${quote(peer.token)},${json(first)})`),'CLOCK_SOURCE_AUTH_DENIED','another connector token cannot authenticate this clock');
 rejects(quote(`SELECT clock_source.receive_v1('qa-unknown-connector',${quote(main.token)},${json(first)})`),'CLOCK_SOURCE_AUTH_DENIED','unknown connector has no source access');
 rejectBody(`body||jsonb_build_object('serial',${quote(peer.serial)})`,'CLOCK_SOURCE_AUTH_DENIED','connector cannot submit another enrolled serial');
 rejectBody("body||'{\"serial\":\"synthetic-source-0\"}'::jsonb",'CLOCK_SOURCE_AUTH_DENIED','serial letter case drift cannot authenticate a different exact identity');
 rejectBody(`body||jsonb_build_object('tenantId',${quote(otherTenant)})`,'CLOCK_SOURCE_PAYLOAD_INVALID','client cannot choose tenant identity');
 restoreStart(`UPDATE clock_source.enrollment SET enabled=false WHERE id=${quote(main.id)}`);
 rejectBody('body','CLOCK_SOURCE_AUTH_DENIED','disabled enrollment cannot write');restoreEnd();
 rejects(quote(`INSERT INTO clock_source.enrollment(tenant_id,connector_key,serial,token_sha256,enabled) VALUES(${quote(otherTenant)},'qa-duplicate-credential','SYNTHETIC-DUPLICATE',${quote(main.token)},true)`),'23505','one credential cannot be enrolled to another device or tenant',false);
 restoreStart(`UPDATE clock_source.enrollment SET enabled=false WHERE id=${quote(main.id)}`);
 rejects(quote(`INSERT INTO clock_source.enrollment(tenant_id,connector_key,serial,token_sha256,enabled) VALUES(${quote(otherTenant)},'qa-disabled-credential','SYNTHETIC-DISABLED',${quote(main.token)},true)`),'23505','disabled enrollment does not make its credential available for reuse',false);restoreEnd();

 if(requireConcurrency){
  ok(advisoryHeld(capacityKey),'a different PostgreSQL connection holds the exact capacity lock');
  exec(`before_counts:=${counts};`);
  rejectBody('body','CLOCK_SOURCE_BUSY','concurrent writer is retriable and cannot acknowledge new source data');
  ok(`${counts}=before_counts`,'busy reception leaves every source table unchanged');
  exec(`PERFORM pg_advisory_xact_lock(hashtextextended(${quote(signalKey)},0));
   FOR attempt IN 1..300 LOOP EXIT WHEN NOT ${advisoryHeld(capacityKey)}; PERFORM pg_sleep(0.1); END LOOP;`);
  ok(`NOT ${advisoryHeld(capacityKey)}`,'independent writer releases its lock after the verified busy probe');
 }

 const invalid=[
  ["body||'{\"unexpected\":true}'::jsonb",'unknown payload field'],
  ["body-'serial'",'missing payload field'],
  ["body||'{\"version\":\"clock-source-delivery.v1\"}'::jsonb",'unknown payload version'],
  ["body||jsonb_build_object('partSha256',repeat('0',64))",'part byte digest mismatch'],
  ["body||jsonb_build_object('batchId',repeat('0',64))",'derived batch digest mismatch'],
  ["body||jsonb_build_object('recordsSha256',upper(body->>'recordsSha256'))",'noncanonical hash'],
  ["body||'{\"totalRecords\":\"3\"}'::jsonb",'string in integer field'],
  ["body||'{\"totalRecords\":0}'::jsonb",'empty source batch'],
  ["body||'{\"totalRecords\":104858}'::jsonb",'unbounded source batch'],
  ["body||'{\"snapshotRecordCount\":2}'::jsonb",'snapshot smaller than delta'],
  ["body||'{\"partStart\":1}'::jsonb",'unaligned part start'],
  ["body||'{\"capturedAt\":\"2026-02-30T12:00:00.000Z\"}'::jsonb",'invalid capture date'],
  ["body||'{\"ordinals\":[1,1,3]}'::jsonb",'duplicate source ordinal'],
  ["body||'{\"ordinals\":[1,3,2]}'::jsonb",'unordered source ordinal'],
  ["body||'{\"ordinals\":[0,2,3]}'::jsonb",'zero source ordinal'],
  ["body||'{\"ordinals\":[1,2,4]}'::jsonb",'source ordinal outside snapshot'],
  ["body||'{\"ordinals\":[1,2]}'::jsonb",'ordinal count differs from raw count'],
  ["body||'{\"recordsBase64\":\"not base64!\"}'::jsonb",'invalid base64'],
 ];
 for(const [changed,label] of invalid){exec(`before_counts:=${counts};`);rejectBody(changed,'CLOCK_SOURCE_PAYLOAD_INVALID',label+' is rejected');ok(`${counts}=before_counts`,label+' leaves no source changes');}
 for(const length of [0,39,41,40*501])rejectBody(json(syntheticClockSourcePayload(main.serial,Buffer.alloc(length),{total:length===0?1:length===40*501?501:1,snapshotCount:length===40*501?501:1,ordinals:length===40*501?Array.from({length:501},(_,i)=>i+1):[1]})),'CLOCK_SOURCE_PAYLOAD_INVALID','raw payload of '+length+' bytes cannot bypass raw40 or 500-record limit');

 exec(`receipt:=${receive()}; before_counts:=${counts};`);
 const receiptKeys=['version','receiptId','tenantId','serial','batchId','partStart','partSha256','snapshotSha256','recordsSha256','count','receivedAt','persisted','scope','payrollModified','replayed'];
 ok(`(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(receipt) k)=ARRAY[${receiptKeys.sort().map(quote).join(',')}]::text[]`,'source ACK has exact closed schema without canonical or payroll claims');
 ok(`receipt->>'version'='clock-source-receipt.v1' AND receipt->>'tenantId'=${quote(tenant)} AND receipt->>'serial'=body->>'serial' AND receipt->>'batchId'=body->>'batchId' AND receipt->>'partStart'='0' AND receipt->>'partSha256'=body->>'partSha256' AND receipt->>'snapshotSha256'=body->>'snapshotSha256' AND receipt->>'recordsSha256'=body->>'recordsSha256' AND receipt->>'count'='3' AND receipt->>'persisted'='true' AND receipt->>'scope'='source_only' AND receipt->>'payrollModified'='false' AND receipt->>'replayed'='false'`,'ACK binds the exact durable source part and makes no attendance interpretation');
 ok("(receipt->>'receiptId')::uuid IS NOT NULL AND (receipt->>'receivedAt')::timestamptz IS NOT NULL",'ACK has a concrete receipt identifier and server timestamp');
 ok(`(SELECT count(*)=1 FROM clock_source.part WHERE id=(receipt->>'receiptId')::uuid AND raw_payload=decode(${quote(firstBytes.toString('hex'))},'hex') AND source_ordinals=ARRAY[1,2,3])`,'exact 40-byte source records and original ordinals are durable before receipt is returned');
 ok("(SELECT p.request_sha256=encode(public.digest(body::text,'sha256'),'hex') AND p.part_sha256=body->>'partSha256' AND b.manifest_sha256=encode(public.digest((body-ARRAY['partStart','partSha256','ordinals','recordsBase64'])::text,'sha256'),'hex') FROM clock_source.part p JOIN clock_source.batch b ON b.id=p.batch_id WHERE p.id=(receipt->>'receiptId')::uuid)",'stored request and manifest digests cover the exact canonical JSONB payload');
 ok('(SELECT count(*)=1 FROM clock_source.completion)','single-part batch acquires explicit immutable completion');
 exec(`result:=${receive()};`);
 ok(`result=receipt||'{"replayed":true}'::jsonb AND ${counts}=before_counts`,'same request returns the stable prior receipt without any source writes');
 rejectBody("body||'{\"capturedAt\":\"2026-09-21T11:00:00.000Z\"}'::jsonb",'CLOCK_SOURCE_IDEMPOTENCY_CONFLICT','same part with changed capture metadata conflicts');
 restoreStart(`UPDATE clock_source.enrollment SET enabled=false WHERE id=${quote(main.id)}`);
 rejectBody('body','CLOCK_SOURCE_AUTH_DENIED','revoked connector cannot retrieve an old successful receipt');restoreEnd();
 restoreStart(`UPDATE clock_source.enrollment SET token_sha256=repeat('f',64) WHERE id=${quote(main.id)}`);
 rejectBody('body','CLOCK_SOURCE_AUTH_DENIED','rotated credential cannot retrieve an old successful receipt');restoreEnd();
 restoreStart('UPDATE clock_source.installation SET max_database_bytes=1048576 WHERE singleton');
 exec(`before_counts:=${counts}; result:=${receive()};`);
 ok(`result=receipt||'{"replayed":true}'::jsonb AND ${counts}=before_counts`,'capacity limit never blocks recovery of an existing durable receipt');
 rejectBody(json(syntheticClockSourcePayload(main.serial,syntheticClockSourceRecord(2999),{snapshot:'capacity exhausted'})),'CLOCK_SOURCE_CAPACITY_LIMIT','new source writes stop before exceeding the configured database budget');
 ok(`${counts}=before_counts`,'capacity refusal preserves every earlier source record and receipt');restoreEnd();
 for(const clock of [peer,foreign]){
  exec(`result:=${receive(json(syntheticClockSourcePayload(clock.serial,firstBytes)),clock)};`);
  ok(`result->>'tenantId'=${quote(clock.tenant)} AND result->>'serial'=${quote(clock.serial)} AND result->>'count'='3' AND result->>'replayed'='false' AND result->>'receiptId'<>receipt->>'receiptId'`,'identical raw bytes retain independent source evidence for '+clock.serial);
 }
 const all=Buffer.concat(Array.from({length:501},(_,i)=>syntheticClockSourceRecord(1000+i))),allHash=hash(all);
 const multipart=(snapshot,{recordsHash=allHash,headOrdinals,tailOrdinals}={})=>({head:syntheticClockSourcePayload(main.serial,all.subarray(0,20000),{snapshot,recordsHash,total:501,snapshotCount:600,ordinals:headOrdinals}),tail:syntheticClockSourcePayload(main.serial,all.subarray(20000),{snapshot,recordsHash,total:501,start:500,snapshotCount:600,ordinals:tailOrdinals??[600]})});
 const normal=multipart('out of order original source records');
 exec('completion_count:=(SELECT count(*) FROM clock_source.completion);');
 exec(`result:=${receive(json(normal.tail))};`);
 ok("result->>'count'='1' AND (SELECT count(*) FROM clock_source.completion)=completion_count",'tail arriving first is durable but does not claim complete batch');
 exec(`receipt:=${receive(json(normal.head))};`);
 ok("receipt->>'count'='500' AND (SELECT count(*) FROM clock_source.completion)=completion_count+1",'501 source records complete only after exact combined hash and ordinal verification');
 exec(`before_counts:=${counts}; result:=${receive(json(normal.tail))};`);
 ok(`result->>'replayed'='true' AND ${counts}=before_counts`,'tail receipt remains replayable after batch completion without changing its original fields');

 const conflict=multipart('same part changed exact source bytes');
 exec(`result:=${receive(json(conflict.head))}; before_counts:=${counts};`);
 const changedHead=Buffer.from(all.subarray(0,20000));changedHead[0]^=1;
 rejectBody(json({...conflict.head,recordsBase64:changedHead.toString('base64'),partSha256:hash(changedHead)}),'CLOCK_SOURCE_IDEMPOTENCY_CONFLICT','accepted partial batch rejects replacement source bytes at the same part key');
 ok(`${counts}=before_counts`,'byte conflict does not replace the prior source receipt or payload');
 rejectBody(json({...conflict.tail,capturedAt:'2026-09-21T11:00:00.000Z'}),'CLOCK_SOURCE_IDEMPOTENCY_CONFLICT','later part cannot change original batch metadata');

 const bad=multipart('wrong complete digest',{recordsHash:'d'.repeat(64)});
 exec(`result:=${receive(json(bad.head))}; before_counts:=${counts}; completion_count:=(SELECT count(*) FROM clock_source.completion);`);
 rejectBody(json(bad.tail),'CLOCK_SOURCE_BATCH_INTEGRITY_INVALID','last part rejects an incorrect aggregate source digest');
 ok(`${counts}=before_counts AND (SELECT count(*) FROM clock_source.completion)=completion_count`,'failed final hash rolls back its part and completion while preserving earlier accepted evidence');
 const ordinal=multipart('cross part ordinal overlap',{tailOrdinals:[500]});
 exec(`result:=${receive(json(ordinal.head))}; before_counts:=${counts};`);
 rejectBody(json(ordinal.tail),'CLOCK_SOURCE_BATCH_INTEGRITY_INVALID','globally overlapping source ordinals cannot complete a batch');
 ok(`${counts}=before_counts`,'cross-part ordinal failure leaves the store unchanged');

 exec(`before_counts:=${counts};
 CREATE FUNCTION pg_temp.qa_fail_completion() RETURNS trigger LANGUAGE plpgsql AS $fail$ BEGIN RAISE EXCEPTION 'QA_COMPLETION_FAILURE'; END $fail$;
 CREATE TRIGGER qa_fail_completion BEFORE INSERT ON clock_source.completion FOR EACH ROW EXECUTE FUNCTION pg_temp.qa_fail_completion();`);
 rejectBody(json(syntheticClockSourcePayload(main.serial,syntheticClockSourceRecord(3000),{snapshot:'late transaction failure'})),'QA_COMPLETION_FAILURE','failure after source insertion aborts the whole receive operation');
 ok(`${counts}=before_counts`,'late failure leaves no batch, part, receipt or completion behind');
 exec('DROP TRIGGER qa_fail_completion ON clock_source.completion; SET CONSTRAINTS ALL IMMEDIATE;');
 for(const table of ['batch','part','completion'])for(const action of ['UPDATE','DELETE','TRUNCATE']){
  const statement=action==='UPDATE'?`UPDATE clock_source.${table} SET ${table==='completion'?'batch_id':'id'}=${table==='completion'?'batch_id':'id'}`:`${action==='DELETE'?'DELETE FROM':'TRUNCATE'} clock_source.${table}${action==='TRUNCATE'?' CASCADE':''}`;
  rejects(quote(statement),'CLOCK_SOURCE_IMMUTABLE','privileged SQL writer cannot '+action+' accepted '+table+' evidence',false);
 }
 for(const changed of [`tenant_id=${quote(otherTenant)}`,`serial='SYNTHETIC-SUBSTITUTED'`,`connector_key='qa-substituted-connector'`])rejects(quote(`UPDATE clock_source.enrollment SET ${changed} WHERE id=${quote(main.id)}`),'CLOCK_SOURCE_IMMUTABLE','enrollment identity cannot be rewritten: '+changed.split('=')[0],false);
 ok('true','all native foreign keys and constraints are valid before rollback');

 const pins=`IF current_database()<>'clock_source_qa' OR current_setting('server_version_num')::int/10000<>${Number(serverMajor)} OR (inet_server_addr() IS NOT NULL AND inet_server_addr() NOT IN ('127.0.0.1'::inet,'::1'::inet)) OR nullif(current_setting('neon.project_id',true),'') IS NOT NULL OR nullif(current_setting('neon.branch_id',true),'') IS NOT NULL THEN RAISE EXCEPTION 'CLOCK_SOURCE_QA_DISPOSABLE_LOCAL_DATABASE_REQUIRED'; END IF;`;
 const helpers=`
 CREATE FUNCTION pg_temp.qa_assert(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $assert$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'CLOCK_SOURCE_QA_FAILED: %',label; END IF; END $assert$;
 CREATE FUNCTION pg_temp.qa_receive(connector text,token text,payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $receive$
 DECLARE result jsonb; BEGIN SET LOCAL ROLE clocks_source_runtime; result:=clock_source.receive_v1(connector,token,payload); RESET ROLE; RETURN result; EXCEPTION WHEN OTHERS THEN RESET ROLE; RAISE; END $receive$;
 CREATE FUNCTION pg_temp.qa_rejects(statement text,wanted text,as_runtime boolean) RETURNS boolean LANGUAGE plpgsql AS $rejects$
 BEGIN IF as_runtime THEN SET LOCAL ROLE clocks_source_runtime; END IF; EXECUTE statement; RESET ROLE; RETURN false;
 EXCEPTION WHEN OTHERS THEN RESET ROLE; IF SQLERRM=wanted OR SQLSTATE=wanted THEN RETURN true; END IF; RAISE; END $rejects$;
 CREATE FUNCTION pg_temp.qa_counts() RETURNS jsonb LANGUAGE plpgsql AS $counts$
 DECLARE result jsonb:='{}'; rowset record; n bigint; digest text;
 BEGIN FOR rowset IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='clock_source' AND c.relkind='r' ORDER BY c.relname LOOP
 EXECUTE format('SELECT count(*),md5(coalesce(string_agg(to_jsonb(t)::text,%L ORDER BY to_jsonb(t)::text),%L)) FROM clock_source.%I t','','',rowset.relname) INTO n,digest;
 result:=result||jsonb_build_object(rowset.relname,jsonb_build_object('rows',n,'digest',digest)); END LOOP; RETURN result; END $counts$;
 `;
 const fixtures=clocks.map(clock=>`INSERT INTO clock_source.enrollment(id,tenant_id,connector_key,serial,token_sha256,enabled) VALUES(${quote(clock.id)},${quote(clock.tenant)},${quote(clock.key)},${quote(clock.serial)},${quote(clock.token)},true);`).join('\n');
 // Both wrong-database-domain probes execute the real installer, then roll back
 // the synthetic foreign schema. They must reject before creating any store.
 const installGuards=["CREATE SCHEMA qa_accounting; CREATE TABLE qa_accounting.ledger(id integer)","CREATE SCHEMA clock_source; CREATE TABLE clock_source.unrelated_ledger(id integer)"].map((setup,index)=>`BEGIN
 ${setup};
 BEGIN EXECUTE ${quote(source)}; RAISE EXCEPTION 'CLOCK_SOURCE_QA_INSTALL_GUARD_MISSING';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'CLOCK_SOURCE_INSTALLATION_DENIED' THEN RAISE; END IF; END;
 checks:=checks+1;
 RAISE EXCEPTION USING ERRCODE='PC002',MESSAGE='RESTORE_INSTALL_GUARD_${index}';
 EXCEPTION WHEN SQLSTATE 'PC002' THEN NULL; END;`).join('\n');
 checks+=2;
 const report={ok:true,checksPassed:checks,serverMajor:Number(serverMajor),migrationSha256:hash(source),nativeSourceStore:true,concurrentWriterCheck:requireConcurrency,nonSuperuserInstallerExercised:true,runtimeRoleExercised:true,syntheticRowsRolledBack:true,schemaAbsentAfterRollback:true,productionContacted:false,clockContacted:false,limitations:['Synthetic source records only; no physical device, host service, production enrollment, free-tier capacity or backup restoration is certified.','This source store preserves bytes and receipts; it does not reconcile personnel or calculate attendance/payroll.']};
 const sql=`\\set ON_ERROR_STOP on
 BEGIN ISOLATION LEVEL READ COMMITTED;
 SET LOCAL statement_timeout='90s'; SET LOCAL lock_timeout='2s'; SET LOCAL search_path=pg_catalog,public,pg_temp;
 DO $qa$ DECLARE checks integer:=0; body jsonb; receipt jsonb; result jsonb; before_counts jsonb; completion_count bigint; attempt integer; role_before jsonb;
 BEGIN ${pins}
 IF to_regnamespace('clock_source') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname=${quote(installer)}) OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND c.relkind IN ('r','p','v','m','S','f')) THEN RAISE EXCEPTION 'CLOCK_SOURCE_QA_EMPTY_DATABASE_REQUIRED'; END IF;
 SELECT to_jsonb(r) INTO role_before FROM pg_roles r WHERE rolname='clocks_source_runtime';
 BEGIN
 ${installGuards}
 CREATE ROLE ${installer} NOLOGIN CREATEROLE CREATEDB NOSUPERUSER NOBYPASSRLS;
 GRANT CREATE,TEMPORARY ON DATABASE clock_source_qa TO ${installer};
 ALTER SCHEMA public OWNER TO ${installer};
 SET LOCAL ROLE ${installer};
 EXECUTE ${quote(source)};
 RESET ROLE;
 ${helpers}
 ${fixtures}
 ${statements.join('\n')}
 RAISE EXCEPTION USING ERRCODE='PC001',MESSAGE='CLOCK_SOURCE_QA_SUCCESS_ROLLBACK';
 EXCEPTION WHEN SQLSTATE 'PC001' THEN NULL; END;
 IF checks<>${checks} OR to_regnamespace('clock_source') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname=${quote(installer)}) OR (SELECT to_jsonb(r) FROM pg_roles r WHERE rolname='clocks_source_runtime') IS DISTINCT FROM role_before THEN RAISE EXCEPTION 'CLOCK_SOURCE_QA_ROLLBACK_FAILED'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND c.relkind IN ('r','p','v','m','S','f')) THEN RAISE EXCEPTION 'CLOCK_SOURCE_QA_ROLLBACK_LEFT_OBJECTS'; END IF;
 PERFORM set_config('mc.clock_source_qa_report',${json(report)}::text,true);
 END $qa$;
 SELECT current_setting('mc.clock_source_qa_report')::jsonb AS evidence;
 ROLLBACK;
 `;
 const lockSql=`\\set ON_ERROR_STOP on
 BEGIN; SET LOCAL statement_timeout='45s'; SET LOCAL idle_in_transaction_session_timeout='45s';
 DO $pin$ BEGIN ${pins} END $pin$;
 SELECT pg_advisory_xact_lock(hashtextextended(${quote(capacityKey)},0));
 SELECT 'CLOCK_SOURCE_QA_LOCK_READY' AS readiness;
 DO $wait$ DECLARE attempt integer; BEGIN FOR attempt IN 1..300 LOOP IF ${advisoryHeld(signalKey)} THEN RETURN; END IF; PERFORM pg_sleep(0.1); END LOOP; RAISE EXCEPTION 'CLOCK_SOURCE_QA_PROBE_NOT_COMPLETED'; END $wait$;
 ROLLBACK;
 `;
 return {sql,lockSql,report};
}

export function parseClockSourceQaArgs(argv){
 const args={};for(const arg of argv){if(arg==='--ci'||arg==='--require-concurrency'){const key=arg==='--ci'?'ci':'concurrency';assert.equal(args[key],undefined,'Duplicate argument');args[key]=true;continue;}const match=/^--(expected-major|write-sql|write-lock-sql)=(.+)$/.exec(arg);assert.ok(match,'Unknown or incomplete argument');assert.equal(args[match[1]],undefined,'Duplicate argument');args[match[1]]=match[2];}
 assert.equal(args.ci,true,'Only offline --ci generation is supported');assert.ok(args['write-sql'],'Explicit SQL output required');assert.ok(!args.concurrency||args['write-lock-sql'],'Concurrency requires independent lock SQL output');return args;
}
function main(){
 const args=parseClockSourceQaArgs(process.argv.slice(2)),value=buildClockSourcePostgresQa({serverMajor:args['expected-major'],requireConcurrency:!!args.concurrency});
 const outputs=[['write-sql',value.sql],['write-lock-sql',value.lockSql]].filter(([key])=>args[key]).map(([key,contents])=>({file:path.resolve(args[key]),contents}));assert.equal(new Set(outputs.map(item=>process.platform==='win32'?item.file.toLowerCase():item.file)).size,outputs.length,'Output paths must differ');
 for(const {file} of outputs)assert.ok(!fs.existsSync(file),'Output exists; choose a new path');for(const {file,contents} of outputs){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,contents,{flag:'wx'});}
 console.log(JSON.stringify({generated:true,databaseExecuted:false,checksPlanned:value.report.checksPassed,migrationSha256:value.report.migrationSha256}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{main();}catch(error){console.error(JSON.stringify({ok:false,message:error.message}));process.exitCode=1;}
