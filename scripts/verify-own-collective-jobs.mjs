// Scoped durable SQL regression. IAM/source fixtures are synthetic; canonical
// bootstrap/detail/command functions below come unchanged from 156/162/163.
// Requires an explicitly supplied psql and the fixed loopback PG17 QA server.
// The opt-in ci transport admits only the existing GitHub Actions Docker service.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {collectiveWorkingTimeFile} from '../assets/own-contract-working-time-collective.js';
import {collectiveJobsQaOptions} from './lib/own-collective-jobs-qa-options.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const options=collectiveJobsQaOptions(process.argv.slice(2));
const {executable,destination,transport,skipBenchmark,argsForPsql:args,guard,processEnv}=options;
if(destination)fs.mkdirSync(path.dirname(path.resolve(destination)),{recursive:true});
const schema='mc_qa_collective_'+randomUUID().replaceAll('-','');
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
const j=value=>q(JSON.stringify(value))+'::jsonb';
const n=sql=>sql.replaceAll('public.digest','__QA_PGCRYPTO_DIGEST__').replaceAll('public.',schema+'.')
 .replaceAll("'public'",q(schema)).replaceAll('SCHEMA public','SCHEMA '+schema)
 .replaceAll('search_path=pg_catalog,public,pg_temp','search_path=pg_catalog,'+schema+',public,pg_temp')
 .replaceAll('__QA_PGCRYPTO_DIGEST__','public.digest');
let assertions=0;const checks=[],metrics={};
const ok=(name,test=true)=>{assert.ok(test,name);assertions++;checks.push(name);console.log('PASS '+name);};
async function execute(sql){return await new Promise((resolve,reject)=>{
 const child=execFile(executable,args,{cwd:root,encoding:'utf8',timeout:45000,maxBuffer:16*1024*1024,
  env:processEnv},(error,stdout,stderr)=>{
   if(error){reject(Object.assign(Error(stderr.trim()||error.message),{cause:error}));return;}
   const lines=stdout.trim().split(/\r?\n/).filter(Boolean);resolve(lines.length?JSON.parse(lines.at(-1)):null);
  });child.stdin.on('error',()=>{});child.stdin.end(sql,'utf8');
 });}
async function run(sql,runtime=false){return execute(`BEGIN ISOLATION LEVEL READ COMMITTED;SET LOCAL statement_timeout='30s';SET LOCAL lock_timeout='2s';${guard}
 SET LOCAL search_path=${schema},pg_catalog,public,pg_temp;${runtime?'SET LOCAL ROLE municontrol_actions_runtime_app;':''}${n(sql)};COMMIT;`);}
async function denied(sql,pattern,runtime=true){await assert.rejects(()=>run(sql,runtime),pattern);}
const context=label=>run(`SELECT p FROM public.qa_actor WHERE label=${q(label)}`);
const manifest=(family,period,variant=1)=>run(`SELECT public.qa_manifest(${q(family)},${q(period)},${variant})`);
const create=(p,family,file,command='propose',key=randomUUID(),reason='Synthetic review with complete manifest')=>
 run(`SELECT public.own_collective_job_create_v1(${j(p)},${q(family)},${j(file)},${q(command)},${q(reason)},${q(key)}::uuid)`,true);
const inspect=(p,id,include=false,offset=0,limit=200)=>run(`SELECT public.own_collective_job_inspect_v1(${j(p)},${q(id)}::uuid,${include},${offset},${limit})`,true);
const step=(s,limit=8,generation=s.dispatchGeneration)=>run(`SELECT public.own_collective_job_step_v1(${q(s.id)}::uuid,${generation},${limit})`,true);
const confirm=(p,s)=>run(`SELECT public.own_collective_job_confirm_v1(${j(p)},${q(s.id)}::uuid,${q(s.reviewHash)})`,true);
const resume=(p,s)=>run(`SELECT public.own_collective_job_resume_v1(${j(p)},${q(s.id)}::uuid)`,true);
const cancel=(p,s)=>run(`SELECT public.own_collective_job_cancel_v1(${j(p)},${q(s.id)}::uuid)`,true);
async function drive(s,phase,limit=8){let calls=0;while(s.phase===phase){s=await step(s,limit);assert.ok(++calls<2000,'finite chunk count');}
 assert.equal(s.phase,phase==='preparing'?'prepared':'complete',JSON.stringify(s));return{s,calls};}
const fingerprint=()=>run(`SELECT jsonb_object_agg(p.proname,encode(public.digest(pg_get_functiondef(p.oid),'sha256'),'hex'))
 FROM pg_proc p WHERE p.pronamespace=${q(schema)}::regnamespace AND p.proname IN('own_working_time_command_v1','own_seniority_command_v1','own_working_time_bootstrap_v1','own_seniority_bootstrap_v1')`);
const read=name=>fs.readFileSync(path.join(root,'scripts/migrations',name),'utf8');
function extract(file,name){const source=read(file),start=source.indexOf('CREATE FUNCTION public.'+name+'(');assert.ok(start>=0,name);
 const body=source.indexOf('AS $$',start);assert.ok(body>start,name);const end=source.indexOf('$$;',body+5);assert.ok(end>body,name);return source.slice(start,end+3);}
const result={version:'own-collective-sql-qa.v1',schema,postgres:17,transport,scale848:!skipBenchmark,fixture:'synthetic IAM and source; unchanged canonical 156/162/163',checks,metrics};
try{
 await execute(`BEGIN;${guard}DO $role$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='municontrol_actions_runtime_app') THEN CREATE ROLE municontrol_actions_runtime_app NOLOGIN;END IF;END $role$;
 CREATE SCHEMA ${schema};GRANT USAGE ON SCHEMA ${schema} TO municontrol_actions_runtime_app;COMMIT;`);
 await run(fs.readFileSync(path.join(root,'tests/fixtures/own-collective-jobs-qa.sql.txt'),'utf8'));
 for(const name of ['native_salary_serialized_v1','native_salary_scope_v1','native_salary_lock_v1'])await run(extract('112-native-salary-definitions.sql',name));
 for(const name of ['own_program_exact_v1','own_program_text_v1'])await run(extract('122-own-payroll-programs.sql',name));
 for(const file of ['156-own-salary-seniority.sql','162-own-seniority-command-guard.sql','163-own-contract-working-time.sql'])await run(read(file));
 const canonicalBefore=await fingerprint();await run(read('225-own-collective-jobs.sql'));
 assert.deepEqual(await fingerprint(),canonicalBefore);ok('225 installs without changing canonical reader/writer definitions');
 await run('SELECT to_jsonb(public.qa_seed(19))');
 let maker=await context('maker');const checker=await context('checker'),samePerson=await context('samePerson'),sameEmail=await context('sameEmail');
 await run("UPDATE public.employment_contract SET legacy_legajo='  QA <A>  ' WHERE id=public.qa_uuid(200001)");
 const identityFile=collectiveWorkingTimeFile(await manifest('working-time','2027-08'));
 await cancel(maker,await create(maker,'working-time',identityFile));
 await run("UPDATE public.employment_contract SET legacy_legajo='500001' WHERE id=public.qa_uuid(200001)");
 ok('legajo matches the canonical file validator without trimming or transforming identity');
 await denied('SELECT to_jsonb(count(*)) FROM public.own_collective_job',/permission denied/);
 await denied(`SELECT public.own_collective_job_authority_v1(${j(maker)})`,/permission denied/);
 const acl=await run(`SELECT to_jsonb(count(*)) FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a
  WHERE p.pronamespace=${q(schema)}::regnamespace AND p.proname LIKE 'own_collective_job_%_v1' AND a.grantee=0`);
 assert.equal(acl,0);ok('no PUBLIC RPC grant; runtime cannot read tables or call helpers');
 for(const family of ['working-time','seniority']){
  const file=await manifest(family,'2026-11'),key=randomUUID();let s=await create(maker,family,file,'propose',key);
  const original=s;assert.deepEqual(await create(maker,family,file,'propose',key),s);
  assert.equal((await create(maker,family,file)).id,s.id);
  await denied(`SELECT public.own_collective_job_create_v1(${j(maker)},${q(family)},${j(file)},'propose','Changed reason for same request key',${q(key)}::uuid)`,/IDEMPOTENCY_REUSE/);
  await denied(`SELECT public.own_collective_job_inspect_v1(${j(checker)},${q(s.id)}::uuid)`,/NOT_FOUND/);
  await denied(`SELECT public.own_collective_job_inspect_v1(${j(maker)},${q(s.id)}::uuid,true)`,/REVIEW_REQUIRED/);
  s=await step(s);assert.equal(s.prepared,8);assert.equal((await step(original)).prepared,8);
  s=(await drive(s,'preparing')).s;assert.match(s.reviewHash,/^[a-f0-9]{64}$/);assert.equal(s.confirmed,0);
  const detail=await inspect(maker,s.id,true);assert.equal(detail.comparisons.length,19);assert.equal(detail.comparisonTotal,19);
  assert.equal(detail.nextOffset,null);assert.equal(detail.reviewHash,s.reviewHash);
  assert.deepEqual(detail.comparisons[0].after,file.records[0].definition);
  const listing=await run(`SELECT public.own_collective_job_list_v1(${j(maker)},${q(family)},'2026-11')`,true);
  assert.equal(listing.jobs[0].id,s.id);
  await denied(`SELECT public.own_collective_job_confirm_v1(${j(maker)},${q(s.id)}::uuid,${q('0'.repeat(64))})`,/REVIEW_REQUIRED/);
  s=await confirm(maker,s);assert.deepEqual(await confirm(maker,s),s);s=(await drive(s,'running')).s;
  assert.equal(s.confirmed,19);assert.equal(s.completed,19);assert.equal((await step(s)).confirmed,19);
  ok(family+': exact file, idempotence, generation fence, review, committed progress and list types');
  for(const [label,p]of [['same membership',maker],['same person',samePerson],['same email',sameEmail]]){
   let deniedJob=await create(p,family,file,'approve');deniedJob=await step(deniedJob);
   assert.equal(deniedJob.phase,'paused');assert.equal(deniedJob.pauseCode,'COLLECTIVE_JOB_INDEPENDENT_REQUIRED');assert.equal(deniedJob.prepared,0);
   await cancel(p,deniedJob);ok(family+': '+label+' cannot approve');
  }
  let approval=await create(checker,family,file,'approve');approval=(await drive(approval,'preparing')).s;
  approval=await confirm(checker,approval);approval=(await drive(approval,'running')).s;assert.equal(approval.confirmed,19);
  const name=family==='working-time'?'working_time':'seniority';
  assert.equal(await run(`SELECT to_jsonb(count(*)) FROM public.own_${name}_event WHERE command='approve'`),19);
  let unchanged=await create(maker,family,file);unchanged=(await drive(unchanged,'preparing')).s;
  assert.equal(unchanged.unchanged,19);assert.equal(unchanged.completed,0);
  unchanged=await confirm(maker,unchanged);unchanged=(await drive(unchanged,'running')).s;
  assert.equal(unchanged.confirmed,0);assert.equal(unchanged.completed,19);ok(family+': independent approval and unchanged rows preserve exact zero and unknown values');
 }

 // Failed row 11 must roll back rows 9 and 10 in the same chunk, retaining first8.
 let file=await manifest('working-time','2026-12'),s=await create(maker,'working-time',file);
 s=(await drive(s,'preparing')).s;s=await confirm(maker,s);s=await step(s);assert.equal(s.confirmed,8);
 const keys=await run(`SELECT jsonb_agg(request_key ORDER BY ordinal) FROM public.own_collective_job_item WHERE job_id=${q(s.id)}::uuid`);
 await run(`UPDATE public.employment_contract SET source_revision=2 WHERE id=${q(file.records[10].contractId)}::uuid`);
 s=await step(s);assert.equal(s.phase,'paused');assert.equal(s.pauseCode,'WORKING_TIME_BASE_CHANGED');assert.equal(s.confirmed,8);
 assert.equal(await run("SELECT to_jsonb(count(*)) FROM public.own_working_time_event WHERE period_month='2026-12-01'"),8);
 await run(`UPDATE public.employment_contract SET source_revision=1 WHERE id=${q(file.records[10].contractId)}::uuid`);
 const beforeResume=s;s=await resume(maker,s);assert.equal((await step(beforeResume)).confirmed,8);s=(await drive(s,'running')).s;
 assert.equal(s.confirmed,19);assert.deepEqual(await run(`SELECT jsonb_agg(request_key ORDER BY ordinal) FROM public.own_collective_job_item WHERE job_id=${q(s.id)}::uuid`),keys);
 ok('failed chunk rolls back its events and progress; resume preserves committed receipts and request keys');

 file=await manifest('seniority','2026-12');s=await create(maker,'seniority',file);s=(await drive(s,'preparing')).s;s=await confirm(maker,s);
 await run("UPDATE public.qa_actor SET ctx=jsonb_set(ctx,'{areaScopes}','[]'::jsonb) WHERE label='maker'");
 s=await step(s);assert.equal(s.pauseCode,'COLLECTIVE_JOB_SCOPE_CHANGED');assert.equal(s.prepared,19);
 await denied(`SELECT public.own_collective_job_inspect_v1(${j(maker)},${q(s.id)}::uuid,true)`,/SCOPE_CHANGED/);
 await denied(`SELECT public.own_collective_job_resume_v1(${j(maker)},${q(s.id)}::uuid)`,/SCOPE_CHANGED/);
 await run("UPDATE public.qa_actor SET ctx=jsonb_set(ctx,'{areaScopes}','[\"*\"]'::jsonb) WHERE label='maker'");
 s=await resume(maker,s);s=await step(s);assert.equal(s.confirmed,8);
 await run(`UPDATE public.tenant_identity_session SET expires_at=clock_timestamp()-interval '1 second' WHERE id=${q(maker.actorSessionId)}::uuid`);
 s=await step(s);assert.equal(s.pauseCode,'ACTION_SESSION_INVALID');assert.equal(s.confirmed,8);
 const oldMaker=maker,newSession=randomUUID();
 await run(`INSERT INTO public.tenant_identity_session VALUES(${q(newSession)}::uuid,1,'active',clock_timestamp()+interval '1 day',clock_timestamp());
 UPDATE public.qa_actor SET p=jsonb_set(p,'{actorSessionId}',to_jsonb(${q(newSession)}::text)) WHERE label='maker'`);
 maker=await context('maker');s=await resume(maker,s);s=(await drive(s,'running')).s;assert.equal(s.confirmed,19);
 const audited=await run("SELECT jsonb_object_agg(actor_session_id,amount) FROM (SELECT actor_session_id,count(*) amount FROM public.own_seniority_event WHERE period_month='2026-12-01' GROUP BY actor_session_id) t");
 assert.equal(audited[oldMaker.actorSessionId],8);assert.equal(audited[newSession],11);
 ok('area restriction blocks detail/resume; expired session pauses; fresh same-actor session resumes with truthful per-event audit');

 file=await manifest('working-time','2027-01');s=await create(maker,'working-time',file);s=await step(s);
 await run(`UPDATE public.employment_contract SET status='inactive' WHERE id=${q(file.records[0].contractId)}::uuid`);
 s=await step(s);assert.equal(s.pauseCode,'COLLECTIVE_JOB_POPULATION_CHANGED');assert.equal(s.prepared,8);
 await run(`UPDATE public.employment_contract SET status='active' WHERE id=${q(file.records[0].contractId)}::uuid`);
 s=await resume(maker,s);const oldDelivery=s;s=await cancel(maker,s);assert.equal(s.phase,'cancelled');assert.equal((await step(oldDelivery)).phase,'cancelled');
 ok('population drift pauses without clearing comparisons; cancellation fences old deliveries');

 // Duplicate queue consumers either fail NOWAIT or observe the generation fence.
 file=await manifest('working-time','2027-02');s=await create(maker,'working-time',file);
 await denied(`SET LOCAL collective_qa.force_busy='on';SELECT public.own_collective_job_step_v1(${q(s.id)}::uuid,${s.dispatchGeneration},8)`,/NATIVE_SALARY_BUSY/);
 assert.deepEqual(await inspect(maker,s.id),s);ok('transient lock conflict leaves the same runnable generation for durable retry');
 const concurrent=await Promise.allSettled([step(s),step(s)]);
 for(const r of concurrent)if(r.status==='rejected')assert.match(r.reason.message,/lock|BUSY/i);
 s=await inspect(maker,s.id);assert.equal(s.prepared,8);await cancel(maker,s);
 ok('concurrent duplicate deliveries prepare one chunk only');

 file=await manifest('working-time','2027-06');s=await create(maker,'working-time',file);s=(await drive(s,'preparing')).s;
 await run("UPDATE public.qa_actor SET p=jsonb_set(p,'{releaseSha}',to_jsonb(repeat('b',40))) WHERE label='maker'");
 const changedContract=await context('maker');
 await denied(`SELECT public.own_collective_job_confirm_v1(${j(changedContract)},${q(s.id)}::uuid,${q(s.reviewHash)})`,/SCOPE_CHANGED/);
 await denied(`SELECT public.own_collective_job_resume_v1(${j(changedContract)},${q(s.id)}::uuid)`,/SCOPE_CHANGED/);
 await run("UPDATE public.qa_actor SET p=jsonb_set(p,'{releaseSha}',to_jsonb(repeat('a',40))) WHERE label='maker'");
 await cancel(maker,s);ok('confirm/resume cannot replace the original certified contract; independent session renewal remains allowed');

 // The canonical single-row writer permits multiple proposals. The collective
 // contract must preserve its existing no-ambiguous-pending guard for decisions.
 for(const command of ['approve','reject']){
  const period=command==='approve'?'2027-04':'2027-05';file=await manifest('working-time',period);
  let proposal=await create(maker,'working-time',file);proposal=(await drive(proposal,'preparing')).s;
  proposal=await confirm(maker,proposal);proposal=(await drive(proposal,'running')).s;
  s=await create(checker,'working-time',file,command);s=(await drive(s,'preparing')).s;s=await confirm(checker,s);
  const third=await context('third'),contractId=file.records[10].contractId;
  const boot=await run(`SELECT public.own_working_time_bootstrap_v1(${j(third)},${q(contractId)}::uuid,${q(period)})`,true);
  const body={command:'propose',contractId,period,scopeVersion:boot.scopeVersion,baseVersion:boot.configuration.version,
   sourceVersion:boot.source.version,proposalId:null,proposalSha256:null,definition:file.records[10].definition,
   reason:'Synthetic concurrent extra proposal',reviewConfirmed:false};
  await run(`SELECT public.own_working_time_command_v1(${j(third)},${j(body)},${q(randomUUID())}::uuid)`,true);
  s=await step(s);assert.equal(s.confirmed,8);s=await step(s);assert.equal(s.phase,'paused');assert.equal(s.pauseCode,'COLLECTIVE_JOB_PENDING');
  assert.equal(s.confirmed,8);assert.equal(await run(`SELECT to_jsonb(count(*)) FROM public.own_working_time_event WHERE period_month=${q(period+'-01')}::date AND command=${q(command)}`),8);
  await cancel(checker,s);ok(command+': additional pending proposal after review blocks and rolls back the affected chunk');
 }

 // Enough rows to cross the 200-row review response limit and real 848 manifest size.
 if(!skipBenchmark)await run('SELECT to_jsonb(public.qa_seed(848))');
 for(const family of skipBenchmark?[]:['working-time','seniority']){
  file=await manifest(family,'2027-03');assert.equal(file.total,848);s=await create(maker,family,file);
  let started=performance.now(),out=await drive(s,'preparing',8);s=out.s;
  metrics[family]={prepareMs:Math.round(performance.now()-started),prepareChunks:out.calls};
  console.log('MEASURE '+family+' prepare '+JSON.stringify(metrics[family]));
  const pages=[];let offset=0;do{const page=await inspect(maker,s.id,true,offset,200);assert.equal(page.reviewHash,s.reviewHash);
   pages.push(...page.comparisons);offset=page.nextOffset;}while(offset!==null);
  assert.equal(pages.length,848);assert.equal(new Set(pages.map(x=>x.contractId)).size,848);
  s=await confirm(maker,s);started=performance.now();out=await drive(s,'running',8);s=out.s;
  Object.assign(metrics[family],{proposeMs:Math.round(performance.now()-started),proposeChunks:out.calls});assert.equal(s.confirmed,848);
  console.log('MEASURE '+family+' propose '+JSON.stringify(metrics[family]));
  let approval=await create(checker,family,file,'approve');started=performance.now();out=await drive(approval,'preparing',8);approval=out.s;
  Object.assign(metrics[family],{reviewMs:Math.round(performance.now()-started),reviewChunks:out.calls});
  console.log('MEASURE '+family+' review '+JSON.stringify(metrics[family]));
  approval=await confirm(checker,approval);started=performance.now();out=await drive(approval,'running',8);approval=out.s;
  Object.assign(metrics[family],{approveMs:Math.round(performance.now()-started),approveChunks:out.calls});assert.equal(approval.confirmed,848);
  ok(family+': 848 proposals and 848 independent decisions committed in bounded chunks, complete paginated review');
 }
 const pending=await run('SELECT public.own_collective_job_pending_v1(100)',true);assert.deepEqual(pending,[]);
 assert.deepEqual(await fingerprint(),canonicalBefore);ok('no runnable job remains; canonical reader/writer definitions still identical');
 result.assertions=assertions;result.status='PASS';result.finishedAt=new Date().toISOString();
 if(destination)fs.writeFileSync(destination,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
}catch(error){result.status='FAIL';result.assertions=assertions;result.error=error.stack;
 if(destination)fs.writeFileSync(destination,JSON.stringify(result,null,2)+'\n');console.error(error.stack);console.error('Disposable failure schema retained: '+schema);process.exitCode=1;}
