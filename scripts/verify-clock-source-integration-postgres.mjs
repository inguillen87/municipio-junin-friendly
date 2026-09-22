// Offline SQL generator. All actual migrations, roles and synthetic fixtures run
// in a rollback-only transaction on a pinned disposable LOCAL PostgreSQL database.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {syntheticClockSourcePayload,syntheticClockSourceRecord} from './verify-clock-source-postgres.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const q=s=>"'"+String(s).replaceAll("'","''")+"'";
const json=v=>q(JSON.stringify(v))+'::jsonb';
const sha=v=>createHash('sha256').update(v).digest('hex');
export function buildClockSourceIntegrationQa({serverMajor}={}){
 assert.ok([17,18].includes(Number(serverMajor)),'Explicit PostgreSQL major 17 or 18 required');
 const read=name=>fs.readFileSync(path.join(root,'scripts/clock-database',name),'utf8').replaceAll('\r\n','\n');
 const base=read('001-source-store.sql'),integration=read('002-source-integration.sql');
 assert.equal(sha(base),'5d87b9daf1ad86353d9cb77dc819264e0b869945606472987c14144bfd526fc3','Frozen source foundation changed');
 const owner='clock_source_integration_qa_owner',writer='clocks_source_ingest_app',reader='clocks_source_reader_app';
 const tenant=randomUUID(),foreign=randomUUID(),binding=sha('synthetic certified source binding'),site=randomUUID();
 const clocks=Array.from({length:3},(_,i)=>({id:randomUUID(),device:randomUUID(),tenant:i===2?foreign:tenant,serial:'QA-INTEGRATION-'+i,key:'qa-integration-'+i,token:sha('synthetic credential '+i)}));
 const a=clocks[0],b=clocks[1],c=clocks[2],missing=randomUUID();
 const statements=[];let checks=0;
 const exec=s=>statements.push(s);
 const ok=(expr,label)=>{exec(`PERFORM pg_temp.qa_assert((${expr}),${q(label)}); checks:=checks+1;`);checks++;};
 const reject=(sql,code,label,role=null)=>ok(`pg_temp.qa_rejects(${q(sql)},${q(code)},${role?q(role):'NULL'})`,label);
 const call=(sql,role)=>`pg_temp.qa_as_login(${q(sql)},${q(role)})`;
 const arr=ids=>`ARRAY[${ids.map(id=>q(id)+'::uuid').join(',')}]::uuid[]`;
 const fleet=(ids=[a.device,b.device],t=tenant,hash=binding,revision=null)=>`SELECT clock_source.fleet_v1(${q(t)}::uuid,${arr(ids)},${q(hash)},${revision?q(revision):'NULL'})`;
 const receive=(body,clock=a)=>`SELECT clock_source.receive_v1(${q(clock.key)},${q(clock.token)},${json(body)})`;
 const restore=(body)=>{exec('BEGIN');body();exec("RAISE EXCEPTION USING ERRCODE='PI002',MESSAGE='RESTORE_QA'; EXCEPTION WHEN SQLSTATE 'PI002' THEN NULL; END;");};
 const rerun=`DO $reinstall$ BEGIN SET LOCAL ROLE ${owner}; EXECUTE ${q(integration)}; RESET ROLE; END $reinstall$;`;
 const tableNames=['installation','enrollment','batch','part','completion','integration','device_binding'];

 ok("(SELECT count(*)=7 AND bool_and(c.relrowsecurity) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='clock_source' AND c.relkind='r')",'all seven private tables retain RLS');
 ok("encode(public.digest(pg_get_functiondef('clock_source.receive_v1(text,text,jsonb)'::regprocedure),'sha256'),'hex')='bf2d2982fc375d33d2ba3ad4695cdc32870ca17bce6e5664930fa7d1546551bd'",'foundation receiver is byte-for-byte unchanged');
 ok("(SELECT count(*)=2 AND bool_and(NOT rolcanlogin AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication) FROM pg_roles WHERE rolname IN ('clocks_source_runtime','clocks_source_reader'))",'permission groups have no login or administration');
 for(const app of [writer,reader]){
  exec(`answer:=${call("SELECT jsonb_build_object('current',current_user,'session',session_user)",app)};`);
  ok(`answer=jsonb_build_object('current',${q(app)},'session',${q(app)})`,app+' runs with effective LOGIN session and current identity');
  ok(`(SELECT rolcanlogin AND rolinherit AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication FROM pg_roles WHERE rolname=${q(app)})`,app+' has no elevated role attributes');
  for(const table of tableNames)for(const action of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']){
   const sql=action==='SELECT'?`SELECT * FROM clock_source.${table}`:action==='INSERT'?`INSERT INTO clock_source.${table} DEFAULT VALUES`:action==='UPDATE'?`UPDATE clock_source.${table} SET ${['installation','integration'].includes(table)?'singleton=singleton':table==='device_binding'?'tenant_id=tenant_id':table==='completion'?'batch_id=batch_id':'id=id'}`:action==='DELETE'?`DELETE FROM clock_source.${table}`:`TRUNCATE clock_source.${table} CASCADE`;
   reject(sql,'42501',app+' rejects direct '+action+' '+table,app);
  }
  reject('CREATE TABLE clock_source.not_allowed(id integer)','42501',app+' cannot create source objects',app);
  reject(`SET ROLE ${owner}`,'42501',app+' cannot become schema owner',app);
 }
 reject(fleet(),'42501','ingest LOGIN cannot use reader facade',writer);
 const body=syntheticClockSourcePayload(a.serial,Buffer.concat([syntheticClockSourceRecord(1),syntheticClockSourceRecord(2)]));
 reject(receive(body),'42501','reader LOGIN cannot receive or acknowledge source parts',reader);
 ok("NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl WHERE n.nspname='clock_source' AND acl.grantee=0 AND acl.privilege_type='EXECUTE')",'PUBLIC cannot execute any source function');
 exec(`answer:=${call(fleet(),reader)};`);
 ok(`jsonb_array_length(answer->'devices')=2 AND (answer->'devices' @> '[{"deviceId":"${a.device}","enrolled":true,"enabled":true,"receipts":0,"recordsPersisted":0,"completedBatches":0,"pendingBatches":0}]'::jsonb)`, 'mapped empty devices are enrolled with no fabricated receipts');
 exec(`answer:=${call(fleet([missing]),reader)};`);
 ok(`answer->'devices'=${json([{deviceId:missing,siteId:null,enrolled:false,enabled:false,receipts:0,recordsPersisted:0,completedBatches:0,pendingBatches:0,lastReceivedAt:null,lastCapturedAt:null}])}`,'missing authorized device has an explicit unconfigured state');
 exec(`answer:=${call(fleet([]),reader)};`);
 ok("answer->'devices'='[]'::jsonb",'empty scope never falls through to all tenant records');
 exec(`receipt:=${call(receive(body),writer)}; answer:=${call(fleet(),reader)}; snapshot:=answer->>'revision';`);
 const top=['version','checkedAt','tenantId','sourceBindingSha256','revision','devices','scope','reconciliationState','payrollModified'].sort();
 const deviceKeys=['deviceId','siteId','enrolled','enabled','receipts','recordsPersisted','completedBatches','pendingBatches','lastReceivedAt','lastCapturedAt'].sort();
 ok(`(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(answer) k)=ARRAY[${top.map(q)}]::text[]`,'reader has an exact versioned top-level contract');
 ok(`NOT EXISTS(SELECT 1 FROM jsonb_array_elements(answer->'devices') d WHERE (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(d) k)<>ARRAY[${deviceKeys.map(q)}]::text[])`,'devices expose only allowed aggregate fields');
 ok(`answer->>'version'='clock-source-fleet.v1' AND answer->>'tenantId'=${q(tenant)} AND answer->>'sourceBindingSha256'=${q(binding)} AND answer->>'scope'='source_only' AND answer->>'reconciliationState'='pending' AND answer->>'payrollModified'='false'`,'reader never claims reconciliation or payroll activity');
 ok(`answer->'devices' @> ${json([{deviceId:a.device,siteId:site,enrolled:true,enabled:true,receipts:1,recordsPersisted:2,completedBatches:1,pendingBatches:0}])}`,'committed single-part source appears in the correct device aggregate');
 ok(`answer::text NOT LIKE '%'||${q(a.serial)}||'%' AND answer::text NOT LIKE '%99000001%' AND answer::text NOT LIKE '%'||${q(a.token)}||'%' AND answer::text NOT LIKE '%recordsBase64%' AND answer::text NOT LIKE '%raw_payload%'`,'reader does not disclose source identifiers, serials, tokens or bytes');
 exec(`prior:=answer; answer:=${call(fleet([b.device,a.device]),reader)};`);
 ok("answer-'checkedAt'=prior-'checkedAt'",'device input order does not change scope or snapshot');
 exec(`answer:=pg_temp.qa_as_login(format('SELECT clock_source.fleet_v1(%L::uuid,%L::uuid[],%L,%L)',${q(tenant)},${arr([a.device,b.device])},${q(binding)},snapshot),${q(reader)});`);
 ok("answer->>'revision'=snapshot",'unchanged snapshot can be explicitly revalidated');
 exec(`answer:=${call(receive(body),writer)}; answer:=${call(fleet(),reader)};`);
 ok("answer->>'revision'=snapshot",'source replay does not change snapshot or totals');
 const foreignBody=syntheticClockSourcePayload(c.serial,syntheticClockSourceRecord(9));
 exec(`answer:=${call(receive(foreignBody,c),writer)}; answer:=${call(fleet([c.device]),reader)};`);
 ok("answer->'devices'->0->>'enrolled'='false' AND answer->'devices'->0->>'recordsPersisted'='0'",'cross-tenant device cannot leak enrollment or records');
 exec(`answer:=${call(fleet([c.device],foreign),reader)};`);
 ok("answer->'devices'->0->>'recordsPersisted'='1'",'separate explicitly authorized tenant scope retrieves its own source');
 for(const [args,label] of [[`NULL,${arr([a.device])},${q(binding)},NULL`,'null tenant'],[`${q(tenant)},NULL,${q(binding)},NULL`,'null scope'],[`${q(tenant)},${arr([a.device,a.device])},${q(binding)},NULL`,'duplicate devices'],[`${q(tenant)},ARRAY[NULL]::uuid[],${q(binding)},NULL`,'null device'],[`${q(tenant)},${arr(Array.from({length:201},()=>randomUUID()))},${q(binding)},NULL`,'unbounded scope'],[`${q(tenant)},${arr([a.device])},'INVALID',NULL`,'malformed binding'],[`${q(tenant)},${arr([a.device])},${q(binding)},'INVALID'`,'malformed revision']])reject('SELECT clock_source.fleet_v1('+args+')','CLOCK_SOURCE_QUERY_INVALID','reader rejects '+label,reader);
 reject(fleet([a.device],tenant,sha('changed binding')),'CLOCK_SOURCE_BINDING_CHANGED','mapped device refuses a changed certified source binding',reader);
 reject(fleet([a.device],tenant,binding,'0'.repeat(64)),'CLOCK_SOURCE_SNAPSHOT_CHANGED','stale snapshot cannot silently return current data',reader);
 restore(()=>{
  exec(`UPDATE clock_source.enrollment SET enabled=false WHERE id=${q(a.id)}; answer:=${call(fleet(),reader)};`);
  ok(`answer->>'revision'<>snapshot AND answer->'devices' @> ${json([{deviceId:a.device,enrolled:true,enabled:false,receipts:1,recordsPersisted:2}])}`,'disabled source retains evidence but invalidates previous snapshot');
  reject(receive(body),'CLOCK_SOURCE_AUTH_DENIED','disabled enrollment denies ingest LOGIN even on receipt replay',writer);
 });
 const bytes=Buffer.concat(Array.from({length:501},(_,i)=>syntheticClockSourceRecord(1000+i))),whole=sha(bytes);
 const head=syntheticClockSourcePayload(a.serial,bytes.subarray(0,20000),{snapshot:'qa integration multipart',recordsHash:whole,total:501,snapshotCount:501});
 const tail=syntheticClockSourcePayload(a.serial,bytes.subarray(20000),{snapshot:'qa integration multipart',recordsHash:whole,total:501,snapshotCount:501,start:500});
 exec(`answer:=${call(receive(tail),writer)}; answer:=${call(fleet(),reader)};`);
 ok(`answer->'devices' @> ${json([{deviceId:a.device,receipts:2,recordsPersisted:3,completedBatches:1,pendingBatches:1}])}`,'partial multipart batch remains visibly incomplete');
 exec(`snapshot:=answer->>'revision'; answer:=${call(receive(head),writer)}; answer:=${call(fleet(),reader)};`);
 ok(`answer->>'revision'<>snapshot AND answer->'devices' @> ${json([{deviceId:a.device,receipts:3,recordsPersisted:503,completedBatches:2,pendingBatches:0}])}`,'final hash-verified completion changes revision and complete/pending counts');
 for(const sql of ['UPDATE clock_source.device_binding SET core_site_id=core_site_id','DELETE FROM clock_source.device_binding','TRUNCATE clock_source.device_binding CASCADE'])reject(sql,'CLOCK_SOURCE_IMMUTABLE','bridge provenance is append-only: '+sql.split(' ')[0]);
 reject(`INSERT INTO clock_source.device_binding(enrollment_id,tenant_id,serial,core_device_id,core_site_id,source_binding_sha256,evidence_sha256,approved_by_membership_id) VALUES(${q(randomUUID())},${q(tenant)},'QA-NO-ENROLLMENT',${q(randomUUID())},${q(site)},${q(binding)},${q(sha('evidence'))},${q(randomUUID())})`,'23503','bridge requires real enrollment coordinates within this source database');
 restore(()=>{
  const pending=randomUUID(),device=randomUUID(),actor=randomUUID();
  exec(`INSERT INTO clock_source.enrollment(id,tenant_id,connector_key,serial,token_sha256) VALUES(${q(pending)},${q(tenant)},'qa-unbound-source','QA-UNBOUND',${q(sha('unused synthetic credential'))});`);
  const bridge=(t,serial,s)=>`INSERT INTO clock_source.device_binding(enrollment_id,tenant_id,serial,core_device_id,core_site_id,source_binding_sha256,evidence_sha256,approved_by_membership_id) VALUES(${q(pending)},${q(t)},${q(serial)},${q(device)},${q(s)},${q(binding)},${q(sha('evidence'))},${q(actor)})`;
  reject(bridge(foreign,'QA-UNBOUND',site),'23503','bridge cannot reassign an enrollment to another tenant');
  reject(bridge(tenant,'QA-SUBSTITUTED',site),'23503','bridge cannot substitute another serial');
  reject(bridge(tenant,'QA-UNBOUND','00000000-0000-0000-0000-000000000000'),'23514','bridge requires a nonnil core site reference');
 });
 exec(`prior:=pg_temp.qa_counts(); ${rerun}`);
 ok('pg_temp.qa_counts()=prior','phase2 rerun under original non-superuser owner preserves source, bridges and receipts after LOGIN provisioning');
 restore(()=>{exec(`GRANT SELECT ON clock_source.part TO ${reader};`);reject(rerun,'CLOCK_SOURCE_INTEGRATION_ROLE_DENIED','installer rejects an overprivileged application reader');});
 restore(()=>{exec(`GRANT clocks_source_runtime TO ${reader} WITH INHERIT TRUE, SET FALSE, ADMIN FALSE;`);reject(rerun,'CLOCK_SOURCE_INTEGRATION_ROLE_DENIED','reader cannot also inherit the ingest group');});
 restore(()=>{exec(`GRANT clocks_source_reader TO ${reader} WITH INHERIT TRUE, SET TRUE, ADMIN FALSE;`);reject(rerun,'CLOCK_SOURCE_INTEGRATION_ROLE_DENIED','runtime group cannot be assumed through SET ROLE');});
 restore(()=>{exec('CREATE ROLE clock_source_unexpected_login LOGIN; GRANT clocks_source_reader TO clock_source_unexpected_login;');reject(rerun,'CLOCK_SOURCE_INTEGRATION_ROLE_DENIED','unknown LOGIN cannot inherit source reader');});
 restore(()=>{exec(`ALTER ROLE ${reader} BYPASSRLS;`);reject(rerun,'CLOCK_SOURCE_INTEGRATION_ROLE_DENIED','reader BYPASSRLS is rejected');});
 restore(()=>{exec('ALTER TABLE clock_source.device_binding DISABLE TRIGGER immutable_rows;');reject(rerun,'CLOCK_SOURCE_INTEGRATION_PREREQUISITE','rerun does not silently repair disabled bridge protections');});
 restore(()=>{exec('ALTER TABLE clock_source.device_binding OWNER TO CURRENT_USER;');reject(rerun,'CLOCK_SOURCE_INTEGRATION_PREREQUISITE','rerun rejects bridge owned by an unexpected role');});
 restore(()=>{exec('ALTER FUNCTION clock_source.fleet_v1(uuid,uuid[],text,text) OWNER TO CURRENT_USER;');reject(rerun,'CLOCK_SOURCE_INTEGRATION_PREREQUISITE','rerun rejects reader facade owned by an unexpected role');});
 restore(()=>{exec('ALTER FUNCTION clock_source.receive_v1(text,text,jsonb) RENAME TO receive_drift;');reject(rerun,'CLOCK_SOURCE_INTEGRATION_PREREQUISITE','migration refuses receiver drift or missing prerequisite');});
 const fixtures=clocks.map(clock=>`INSERT INTO clock_source.enrollment(id,tenant_id,connector_key,serial,token_sha256,enabled) VALUES(${q(clock.id)},${q(clock.tenant)},${q(clock.key)},${q(clock.serial)},${q(clock.token)},true);
 INSERT INTO clock_source.device_binding(enrollment_id,tenant_id,serial,core_device_id,core_site_id,source_binding_sha256,evidence_sha256,approved_by_membership_id) VALUES(${q(clock.id)},${q(clock.tenant)},${q(clock.serial)},${q(clock.device)},${q(site)},${q(binding)},${q(sha('synthetic evidence '+clock.id))},${q(randomUUID())});`).join('\n');
 const report={ok:true,checksPassed:checks,serverMajor:Number(serverMajor),foundationSha256:sha(base),integrationSha256:sha(integration),nativeMigrations:true,effectiveLoginRolesExercised:true,syntheticRowsRolledBack:true,productionContacted:false,limitations:['Core IAM and cross-database authorization are enforced by the API and need separate integration tests.','SET LOCAL SESSION AUTHORIZATION exercises effective LOGIN SQL privileges; this test does not create or test production passwords or network authentication.','No real clock, enrollment, employee, payroll or remote database is contacted.']};
 const sql=`\\set ON_ERROR_STOP on
 BEGIN;
 SET LOCAL statement_timeout='90s'; SET LOCAL lock_timeout='2s'; SET LOCAL search_path=pg_catalog,public,pg_temp;
 DO $qa$ DECLARE checks integer:=0; answer jsonb; receipt jsonb; prior jsonb; snapshot text;
 BEGIN
 IF current_database()<>'clock_source_qa' OR current_setting('server_version_num')::int/10000<>${Number(serverMajor)} OR (inet_server_addr() IS NOT NULL AND inet_server_addr() NOT IN ('127.0.0.1'::inet,'::1'::inet)) OR nullif(current_setting('neon.project_id',true),'') IS NOT NULL OR nullif(current_setting('neon.branch_id',true),'') IS NOT NULL THEN RAISE EXCEPTION 'CLOCK_SOURCE_QA_LOCAL_REQUIRED'; END IF;
 IF to_regnamespace('clock_source') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN (${[owner,writer,reader,'clocks_source_runtime','clocks_source_reader'].map(q)})) THEN RAISE EXCEPTION 'CLOCK_SOURCE_QA_EMPTY_REQUIRED'; END IF;
 BEGIN
 CREATE ROLE ${owner} NOLOGIN CREATEROLE CREATEDB NOSUPERUSER NOBYPASSRLS;
 GRANT CREATE,TEMPORARY ON DATABASE clock_source_qa TO ${owner}; ALTER SCHEMA public OWNER TO ${owner};
 SET LOCAL ROLE ${owner}; EXECUTE ${q(base)}; EXECUTE ${q(integration)};
 CREATE ROLE ${writer} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 CREATE ROLE ${reader} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 GRANT clocks_source_runtime TO ${writer} WITH INHERIT TRUE, SET FALSE, ADMIN FALSE;
 GRANT clocks_source_reader TO ${reader} WITH INHERIT TRUE, SET FALSE, ADMIN FALSE;
 RESET ROLE;
 CREATE FUNCTION pg_temp.qa_assert(value boolean,label text) RETURNS void LANGUAGE plpgsql AS $h$ BEGIN IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'CLOCK_SOURCE_INTEGRATION_QA_FAILED: %',label; END IF; END $h$;
 CREATE FUNCTION pg_temp.qa_as_login(statement text,app text) RETURNS jsonb LANGUAGE plpgsql AS $h$
 DECLARE result jsonb; BEGIN EXECUTE format('SET LOCAL SESSION AUTHORIZATION %I',app); EXECUTE statement INTO result; RESET SESSION AUTHORIZATION; RETURN result; EXCEPTION WHEN OTHERS THEN RESET SESSION AUTHORIZATION; RAISE; END $h$;
 CREATE FUNCTION pg_temp.qa_rejects(statement text,wanted text,app text) RETURNS boolean LANGUAGE plpgsql AS $h$
 BEGIN IF app IS NOT NULL THEN EXECUTE format('SET LOCAL SESSION AUTHORIZATION %I',app); END IF; EXECUTE statement; RESET SESSION AUTHORIZATION; RETURN false;
 EXCEPTION WHEN OTHERS THEN RESET SESSION AUTHORIZATION; IF SQLERRM=wanted OR SQLSTATE=wanted THEN RETURN true; END IF; RAISE; END $h$;
 CREATE FUNCTION pg_temp.qa_counts() RETURNS jsonb LANGUAGE plpgsql AS $h$
 DECLARE result jsonb:='{}'; t record; cut text; BEGIN FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='clock_source' AND c.relkind='r' LOOP EXECUTE format('SELECT md5(coalesce(string_agg(to_jsonb(r)::text,%L ORDER BY to_jsonb(r)::text),%L)) FROM clock_source.%I r','','',t.relname) INTO cut; result:=result||jsonb_build_object(t.relname,cut); END LOOP; RETURN result; END $h$;
 ${fixtures}
 ${statements.join('\n')}
 RAISE EXCEPTION USING ERRCODE='PI001',MESSAGE='CLOCK_SOURCE_INTEGRATION_QA_SUCCESS_ROLLBACK';
 EXCEPTION WHEN SQLSTATE 'PI001' THEN NULL; END;
 IF checks<>${checks} OR to_regnamespace('clock_source') IS NOT NULL OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN (${[owner,writer,reader,'clocks_source_runtime','clocks_source_reader'].map(q)})) THEN RAISE EXCEPTION 'CLOCK_SOURCE_INTEGRATION_QA_ROLLBACK_FAILED'; END IF;
 PERFORM set_config('mc.clock_source_integration_qa_report',${json(report)}::text,true);
 END $qa$;
 SELECT current_setting('mc.clock_source_integration_qa_report')::jsonb AS evidence;
 ROLLBACK;
 `;
 return{sql,report};
}
export function parseClockIntegrationArgs(argv){
 const result={};for(const arg of argv){if(arg==='--ci'){assert.equal(result.ci,undefined,'Duplicate --ci');result.ci=true;continue;}const m=/^--(expected-major|write-sql)=(.+)$/.exec(arg);assert.ok(m,'Only explicit offline CI generation is supported');assert.equal(result[m[1]],undefined,'Duplicate argument');result[m[1]]=m[2];}
 assert.equal(result.ci,true,'--ci required');assert.ok(result['write-sql'],'Output required');return result;
}
function main(){const args=parseClockIntegrationArgs(process.argv.slice(2)),qa=buildClockSourceIntegrationQa({serverMajor:args['expected-major']}),file=path.resolve(args['write-sql']);assert.ok(!fs.existsSync(file),'Output exists');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,qa.sql,{flag:'wx'});console.log(JSON.stringify({generated:true,databaseExecuted:false,checksPlanned:qa.report.checksPassed,integrationSha256:qa.report.integrationSha256}));}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{main();}catch(e){console.error(JSON.stringify({ok:false,message:e.message}));process.exitCode=1;}
