// Actual handlers and SQL, exclusively in the existing disposable QA schema.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { qaLiteral as q } from './own-payroll-durable-qa.mjs';
import { createOwnSalarySeniorityHandler } from '../../api/internal-own-salary-seniority.js';
import { createOwnPeriodParticipationHandler } from '../../api/internal-own-period-participation.js';
import { createOwnPeriodArtDaysHandler } from '../../api/internal-own-art-days.js';
import { createOwnPeriodFiscalFactsHandler } from '../../api/internal-own-fiscal-facts.js';
import { verifyOwnPeriodParticipationBrowser } from './own-period-participation-browser.mjs';
import { OWN_PERIOD_READ_RECOVERY_WAIT_MS } from '../../lib/own-period-read-recovery.js';

async function briefHolder(h) {
 const {db,qa}=h;
 assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 assert.ok(db.args.includes('127.0.0.1'));
 const child=spawn(db.executable,db.args,{windowsHide:true,env:db.environment,stdio:['pipe','pipe','pipe']});
 let stdout='',stderr='',timer;
 child.stderr.on('data',b=>stderr+=b.toString());
 const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Synthetic brief holder failed: '+stderr)));});
 done.catch(()=>{});
 const ready=new Promise((resolve,reject)=>{
  timer=setTimeout(()=>reject(Error('Synthetic brief holder was not established')),10000);
  child.stdout.on('data',b=>{stdout+=b.toString();if(stdout.split(/\r?\n/).includes('MC_PERIOD_READ_BRIEF_HELD')){clearTimeout(timer);resolve();}});
  child.once('error',reject);
 });
 child.stdin.end(`BEGIN; SET LOCAL statement_timeout='10s'; SET LOCAL search_path=pg_catalog,${qa.schema},public,pg_temp; DO $destination$ BEGIN ${qa.pins} END $destination$; LOCK TABLE native_employee_registration IN SHARE UPDATE EXCLUSIVE MODE; SELECT 'MC_PERIOD_READ_BRIEF_HELD'; SELECT pg_sleep(0.65); COMMIT;\n`);
 try {await ready;} catch(e) {clearTimeout(timer);if(child.exitCode===null)child.kill();await done.catch(()=>{});throw e;}
 return {done,finish:async()=>{try{await done;}finally{clearTimeout(timer);if(child.exitCode===null)child.kill();}}};
}

export async function verifyOwnPeriodReadDelay(h,{major,sourceCommit}) {
 assert.ok([17,18].includes(major));assert.match(sourceCommit,/^[a-f0-9]{40}$/);
 assert.equal(h.options.sourceCommit,sourceCommit);
 const {db,qa,deps,period,ok,setActor}=h;
 setActor(qa.actors.maker);
 const contractId=h.participation.people[0].contractId;
 const state=()=>db.run("SELECT jsonb_build_object('seniority',(SELECT md5(coalesce(jsonb_agg(to_jsonb(e) ORDER BY id)::text,'[]')) FROM own_seniority_event e),'participation',(SELECT md5(coalesce(jsonb_agg(to_jsonb(e) ORDER BY id)::text,'[]')) FROM own_participation_event e),'art',(SELECT md5(coalesce(jsonb_agg(to_jsonb(e) ORDER BY id)::text,'[]')) FROM own_art_days_event e),'fiscal',(SELECT md5(coalesce(jsonb_agg(to_jsonb(e) ORDER BY id)::text,'[]')) FROM own_fiscal_facts_event e),'contracts',(SELECT md5(jsonb_agg(to_jsonb(c) ORDER BY id)::text) FROM employment_contract c))");
 const before=await state(),proof=[];
 const specs=[
  ['SENIORITY','own_seniority',createOwnSalarySeniorityHandler],
  ['PARTICIPATION','own_participation',createOwnPeriodParticipationHandler],
  ['ART_DAYS','own_art_days',createOwnPeriodArtDaysHandler],
  ['FISCAL_FACTS','own_fiscal_facts',createOwnPeriodFiscalFactsHandler],
 ];
 for(const [prefix,sqlName,create] of specs) {
  const calls=[];
  const adapter={query:async(template,values)=>{
   assert.match(template,new RegExp('^SELECT public\\.'+sqlName+'_bootstrap_v1\\('));
   calls.push({template,values:structuredClone(values)});
   return [{result:await db.run(template.replaceAll('public.',qa.schema+'.').replace(/\$(\d+)/g,(_,i)=>q(values[Number(i)-1])),true)}];
  }};
  const handler=create({...deps,getSql:()=>adapter}),query={resource:'bootstrap',contractId,period};
  const req={method:'GET',url:'/api/period-read-delay?'+new URLSearchParams(query),query,headers:{}};
  const res={setHeader(){},status(v){this.statusCode=v;return this;},json(v){this.value=v;return this;}};
  const holder=await briefHolder(h),started=Date.now();
  try {await handler(req,res);} finally {await holder.finish();}
  const elapsedMs=Date.now()-started;
  assert.equal(res.statusCode,200);
  assert.equal(res.value.data.contractId,contractId);
  assert.equal(calls.length,2);
  assert.deepEqual(calls[0],calls[1]);
  assert.ok(elapsedMs>=OWN_PERIOD_READ_RECOVERY_WAIT_MS);
  assert.equal(res.value.data.payrollCalculated,false);
  assert.equal(res.value.data.payrollPosted,false);
  proof.push({kind:prefix,holderMs:650,elapsedMs,status:200,reads:2,commands:0,queryAndScopePreserved:true});
  ok(true,prefix+': actual 650ms SQL holder releases before the second authorized GET and the complete consultation recovers');
 }
 assert.deepEqual(await state(),before);
 ok(true,'brief read recovery conserves every synthetic employee and period fact without a command');
 const original=h.handlers.participation;
 let used=false,browserRecovery;
 const handlers={...h.handlers,participation:async(req,res)=>{
  if(used||req.method!=='GET'||req.query?.resource!=='bootstrap')return original(req,res);
  used=true;const holder=await briefHolder(h),started=Date.now();
  try {await original(req,res);} finally {await holder.finish();}
  browserRecovery={holderMs:650,elapsedMs:Date.now()-started,actualHandler:true,actualSql:true};
  assert.ok(browserRecovery.elapsedMs>=OWN_PERIOD_READ_RECOVERY_WAIT_MS);
 }};
 await verifyOwnPeriodParticipationBrowser({handlers,env:h.env,actors:qa.actors,setActor,people:h.participation.people,period,output:h.destination,check:ok,browserName:'chromium',
  revoke:()=>h.sql('UPDATE tenant_action_employment_link SET active=false,revoked_at=clock_timestamp() WHERE membership_id='+q(qa.actors.maker.membershipId)+'::uuid'),
  restore:()=>h.sql('UPDATE tenant_action_employment_link SET active=true,revoked_at=NULL WHERE membership_id='+q(qa.actors.maker.membershipId)+'::uuid')});
 assert.equal(used,true);assert.ok(browserRecovery);
 ok(true,'the original participation desktop and mobile circuit completes after an actual brief lock on its first consultation');
 fs.writeFileSync(path.join(h.destination,'read-delay-proof.json'),JSON.stringify({version:'own-period-read-delay-qa.v1',sourceCommit,major,waitMs:OWN_PERIOD_READ_RECOVERY_WAIT_MS,actualHandlers:true,actualSql:true,syntheticOnly:true,productiveBusinessWrites:0,reads:proof,browserRecovery},null,2)+'\n',{flag:'wx'});
 return {version:'own-period-read-delay-qa.v1',syntheticOnly:true,productiveBusinessWrites:0,readCases:proof.length,browserRecovery};
}
