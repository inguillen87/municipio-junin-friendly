// Real multi-connection quota QA, only on the explicitly restored local database.
// Commits at most two synthetic 64-byte blobs; exact fixture cleanup restores policy.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';

const args=Object.fromEntries(process.argv.slice(2).map(value=>{const at=value.indexOf('=');return [value.slice(2,at),value.slice(at+1)];}));
if(args['confirm-local-fixture-commit']!=='true'||!path.isAbsolute(args['connection-file']||'')||!path.isAbsolute(args.psql||''))throw Error('EXPLICIT_LOCAL_QA_REQUIRED');
if(/^[/\\]{2}/.test(args.psql)||/^[/\\]{2}/.test(args['connection-file']))throw Error('LOCAL_FILES_REQUIRED');
const connection=JSON.parse(fs.readFileSync(args['connection-file'],'utf8'));
if(connection.host!=='127.0.0.1'||Number(connection.port)!==55439||connection.database!=='restore_check'||connection.user!=='restore_owner')throw Error('LOCAL_RESTORE_SCOPE_REQUIRED');
const environment={...process.env,PGHOSTADDR:connection.host,PGPASSWORD:connection.password,PGSSLMODE:'disable',PGOPTIONS:''};
delete environment.PGSERVICE;delete environment.PGSERVICEFILE;
const psqlArgs=['-X','--no-password','-qAt','-v','ON_ERROR_STOP=1','-h',connection.host,'-p',String(connection.port),'-U',connection.user,'-d',connection.database];
const logFile=path.join(path.dirname(args['connection-file']),'schooling-storage-race.private.log');
let diagnostic='';
function query(sql){
 const result=spawnSync(args.psql,[...psqlArgs,'-c',sql],{env:environment,encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024});
 diagnostic+=(result.stderr||'');
 if(result.status!==0)throw Error('LOCAL_QA_SQL_FAILED');
 return result.stdout.trim();
}
function open(applicationName){
 const child=spawn(args.psql,psqlArgs,{env:{...environment,PGAPPNAME:applicationName},windowsHide:true,stdio:['pipe','pipe','pipe']});
 const state={child,output:'',error:'',closed:new Promise(resolve=>child.on('close',code=>resolve(code)))};
 child.stdout.on('data',bytes=>{state.output+=bytes.toString()});child.stderr.on('data',bytes=>{state.error+=bytes.toString()});
 return state;
}
async function until(predicate,label,timeout=5000){
 const end=Date.now()+timeout;
 while(!predicate()){if(Date.now()>end)throw Error(label);await new Promise(resolve=>setTimeout(resolve,25));}
}
async function finish(state){
 let timer;
 try{return await Promise.race([state.closed,new Promise((_,reject)=>{timer=setTimeout(()=>{state.child.kill();reject(Error('LOCAL_QA_PROCESS_TIMEOUT'));},8000)})]);}
 finally{clearTimeout(timer);diagnostic+=state.error;}
}
const sqlString=value=>"'"+String(value).replaceAll("'","''")+"'";
const baselineSql=`SELECT jsonb_build_object('policy',(SELECT to_jsonb(p) FROM school_certificate_storage_policy p WHERE singleton),
 'blobs',(SELECT count(*) FROM school_certificate_blob),'bytes',(SELECT coalesce(sum(byte_length),0) FROM school_certificate_blob),
 'certificates',(SELECT count(*) FROM school_certificate),'events',(SELECT count(*) FROM school_certificate_event),
 'family',(SELECT count(*) FROM grh_family),'contracts',(SELECT count(*) FROM employment_contract),
 'users',(SELECT count(*) FROM internal_users),'sessions',(SELECT count(*) FROM tenant_identity_session),
 'blobHash',(SELECT md5(coalesce(string_agg(tenant_id::text||sha256||byte_length::text,',' ORDER BY tenant_id,sha256),'')) FROM school_certificate_blob))`;
const baseline=JSON.parse(query(baselineSql));
const tenant=query('SELECT id FROM platform_tenant ORDER BY id LIMIT 1');assert.match(tenant,/^[a-f0-9-]{36}$/);
assert.ok(Number(baseline.bytes)+128<8388608,'LOCAL_QA_NEEDS_128_BYTES_QUOTA_MARGIN');
const fixtures=Array.from({length:4},()=>{const bytes=Buffer.from(('%PDF-1.7\n'+randomUUID()+'\n%%EOF\n').padEnd(64,' '));return {hex:bytes.toString('hex'),sha:createHash('sha256').update(bytes).digest('hex'),length:bytes.length};});
const fixtureList=fixtures.map(item=>sqlString(item.sha)).join(',');
function cleanup(){
 const policy=baseline.policy;
 query(`BEGIN; SET LOCAL lock_timeout='5s';
  SELECT pg_advisory_xact_lock(hashtextextended('school-certificate:storage:v1',0));
  ALTER TABLE school_certificate_blob DISABLE TRIGGER school_certificate_blob_immutable;
  DELETE FROM school_certificate_blob WHERE tenant_id=${sqlString(tenant)}::uuid AND sha256 IN (${fixtureList});
  ALTER TABLE school_certificate_blob ENABLE TRIGGER school_certificate_blob_immutable;
  UPDATE school_certificate_storage_policy SET pdf_quota_bytes=${Number(policy.pdf_quota_bytes)},
   cluster_limit_bytes=${Number(policy.cluster_limit_bytes)},cluster_reserve_bytes=${Number(policy.cluster_reserve_bytes)},generation=${Number(policy.generation)} WHERE singleton;
  COMMIT;`);
 assert.deepEqual(JSON.parse(query(baselineSql)),baseline,'LOCAL_QA_BASELINE_MISMATCH');
}
const insert=item=>`SELECT school_certificate_storage_reserve_v1(${sqlString(tenant)}::uuid,${sqlString(item.sha)},${item.length});
 INSERT INTO school_certificate_blob(tenant_id,sha256,content,byte_length) VALUES(${sqlString(tenant)}::uuid,${sqlString(item.sha)},decode(${sqlString(item.hex)},'hex'),${item.length}) ON CONFLICT DO NOTHING;`;
const passed=[];
async function race({first,second,repeatable=false,expectedFailure}){
 query(`UPDATE school_certificate_storage_policy SET cluster_limit_bytes=2147483648,pdf_quota_bytes=${Number(baseline.bytes)+96} WHERE singleton`);
 const appA='qa-schooling-storage-a-'+randomUUID(),appB='qa-schooling-storage-b-'+randomUUID();
 const a=open(appA),b=open(appB);
 try{
  a.child.stdin.write(`BEGIN; SET LOCAL statement_timeout='10s'; ${insert(first)}\n\\echo QA_A_READY\n`);
  await until(()=>a.output.includes('QA_A_READY'),'LOCAL_QA_FIRST_WRITER_NOT_READY');
  b.child.stdin.end(`BEGIN ISOLATION LEVEL ${repeatable?'REPEATABLE READ':'READ COMMITTED'};
   SET LOCAL statement_timeout='10s'; SELECT count(*) FROM school_certificate_blob;
   \\echo QA_B_ENTER
   ${insert(second)} COMMIT;\n\\q\n`);
  await until(()=>b.output.includes('QA_B_ENTER'),'LOCAL_QA_SECOND_WRITER_NOT_READY');
  await until(()=>query(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name=${sqlString(appB)} AND wait_event_type='Lock' AND wait_event='advisory')`)==='t','LOCAL_QA_ADVISORY_WAIT_NOT_OBSERVED');
  a.child.stdin.end('COMMIT;\n\\q\n');assert.equal(await finish(a),0,'LOCAL_QA_FIRST_COMMIT_FAILED');
  const secondStatus=await finish(b);
  if(expectedFailure){assert.notEqual(secondStatus,0,'LOCAL_QA_SECOND_WRITER_SHOULD_FAIL');assert.match(b.error,expectedFailure);}
  else assert.equal(secondStatus,0,'LOCAL_QA_DUPLICATE_SHOULD_FIT');
  const usage=JSON.parse(query(`SELECT jsonb_build_object('bytes',(SELECT sum(byte_length) FROM school_certificate_blob),'quota',(SELECT pdf_quota_bytes FROM school_certificate_storage_policy WHERE singleton),'rows',(SELECT count(*) FROM school_certificate_blob WHERE tenant_id=${sqlString(tenant)}::uuid AND sha256 IN (${fixtureList})))`));
  assert.ok(Number(usage.bytes)<=Number(usage.quota),'LOCAL_QA_QUOTA_EXCEEDED');assert.equal(Number(usage.rows),1);
 }finally{
  if(!a.child.stdin.destroyed)a.child.stdin.end('ROLLBACK;\n\\q\n');
  if(!b.child.stdin.destroyed)b.child.stdin.end('ROLLBACK;\n\\q\n');
  await Promise.allSettled([finish(a),finish(b)]);
  cleanup();
 }
}
try{
 await race({first:fixtures[0],second:fixtures[1],expectedFailure:/SCHOOL_CERTIFICATE_STORAGE_FULL/});
 passed.push('distinct concurrent PDFs cannot exceed shared quota after commit');
 await race({first:fixtures[0],second:fixtures[0]});
 passed.push('concurrent duplicate blob consumes storage once');
 await race({first:fixtures[2],second:fixtures[3],repeatable:true,expectedFailure:/could not serialize access/});
 passed.push('stale repeatable-read snapshot cannot bypass shared quota');
 console.log(JSON.stringify({passed,baselineRestored:true,fixturesRemoved:true,localOnly:true}));
}finally{
 try{cleanup();}finally{fs.writeFileSync(logFile,diagnostic);}
}
