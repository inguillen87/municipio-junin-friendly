// Disposable PostgreSQL QA only. No municipal connection or fixture is accepted.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { qaLiteral as q } from './own-payroll-durable-qa.mjs';
import { createOwnSalarySeniorityHandler } from '../../api/internal-own-salary-seniority.js';
import { createOwnPeriodParticipationHandler } from '../../api/internal-own-period-participation.js';
import { createOwnPeriodArtDaysHandler } from '../../api/internal-own-art-days.js';
import { createOwnPeriodFiscalFactsHandler } from '../../api/internal-own-fiscal-facts.js';
import { FISCAL_FACT_FIELDS } from '../../assets/own-fiscal-facts-model.js';

async function maintenanceLock({db,qa}) {
 assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.ok(db.args.includes('127.0.0.1'));
 const child=spawn(db.executable,db.args,{windowsHide:true,env:db.environment,stdio:['pipe','pipe','pipe']});
 let output='',error='',timer;
 const ended=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('Synthetic lock holder failed: '+error)));});
 ended.catch(()=>{});child.stderr.on('data',b=>{error+=b.toString();});
 const ready=new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Synthetic maintenance lock was not established')),10000);child.stdout.on('data',b=>{output+=b.toString();if(output.split(/\r?\n/).includes('MC_PERIOD_READ_LOCK_HELD')){clearTimeout(timer);resolve();}});child.once('error',reject);child.once('exit',()=>reject(Error('Synthetic lock holder exited before release')));});
 child.stdin.write(`BEGIN; SET LOCAL statement_timeout='15s'; SET LOCAL idle_in_transaction_session_timeout='20s'; SET LOCAL search_path=pg_catalog,${qa.schema},public,pg_temp; DO $destination$ BEGIN ${qa.pins} END $destination$; LOCK TABLE person_identity IN SHARE UPDATE EXCLUSIVE MODE; SELECT 'MC_PERIOD_READ_LOCK_HELD';\n`);
 let released=false;
 const release=async()=>{if(released)return;released=true;clearTimeout(timer);child.stdin.end('ROLLBACK;\n');await ended;};
 try{await ready;}catch(e){await release();throw e;}
 return release;
}

export async function verifyOwnPeriodReadContention(h) {
 const {db,qa,deps,period,ok,setActor}=h;setActor(qa.actors.maker);
 const contractId=h.participation.people[0].contractId;
 const state=()=>db.run("SELECT jsonb_build_object('seniority',(SELECT md5(coalesce(jsonb_agg(to_jsonb(e) ORDER BY id)::text,'[]')) FROM own_seniority_event e),'participation',(SELECT md5(coalesce(jsonb_agg(to_jsonb(e) ORDER BY id)::text,'[]')) FROM own_participation_event e),'art',(SELECT count(*) FROM own_art_days_event),'fiscal',(SELECT count(*) FROM own_fiscal_facts_event),'captures',(SELECT count(*) FROM own_payroll_run_capture),'results',(SELECT count(*) FROM own_payroll_run_result),'contracts',(SELECT md5(jsonb_agg(to_jsonb(c) ORDER BY id)::text) FROM employment_contract c))");
 const before=await state(),definition={asOfDate:period+'-01',documentReference:'Contención exclusivamente sintética QA'};
 const specs=[
  ['SENIORITY','own_seniority',createOwnSalarySeniorityHandler,{...definition,years:'0',months:null}],
  ['PARTICIPATION','own_participation',createOwnPeriodParticipationHandler,{...definition,recognizedUnits:'1',baseUnits:'3'}],
  ['ART_DAYS','own_art_days',createOwnPeriodArtDaysHandler,{...definition,workedDays:'0'}],
  ['FISCAL_FACTS','own_fiscal_facts',createOwnPeriodFiscalFactsHandler,{...definition,referenceVersion:'47.5',fields:Object.fromEntries(FISCAL_FACT_FIELDS.map(n=>[n,n===43?'0':null]))}],
 ];
 for(const[prefix,sqlName,create,facts]of specs){
  const query={resource:'bootstrap',contractId,period},stats={sql:0,auth:0,calls:[]};let mode='normal',release;
  const adapter={query:async(template,values)=>{stats.sql++;stats.calls.push({template,values:structuredClone(values)});assert.match(template,new RegExp('^SELECT public\\.'+sqlName+'_(?:bootstrap|command)_v1\\('));return [{result:await db.run(template.replaceAll('public.',qa.schema+'.').replace(/\$(\d+)/g,(_,n)=>q(values[Number(n)-1])),true)}];}};
  const handler=create({...deps,getSql:()=>adapter,requireAccess:async(req,res,options)=>{stats.auth++;const access=await deps.requireAccess(req,res,options);if(stats.auth===2){if(mode==='release')await release();if(mode==='revoke')return {...access,principal:{...access.principal,tenant:{...access.principal.tenant,effectiveCapabilities:[]}}};if(mode==='change')return {...access,principal:{...access.principal,user:{...access.principal.user,id:randomUUID()}}};if(mode==='mismatched')return {...access,principal:{...access.principal,user:{...access.principal.user,email:'changed@example.invalid'}}};}return access;}});
  const invoke=async(body,key)=>{const res={status(s){this.statusCode=s;return this;},setHeader(){},json(v){this.value=v;return this;}},posted=!!body,req={method:posted?'POST':'GET',url:'/api/period-contention'+(posted?'':'?'+new URLSearchParams(query)),query:posted?{}:query,headers:posted?{origin:deps.env.INTERNAL_APP_ORIGIN,'content-type':'application/json','idempotency-key':key}:{},...(posted?{body:JSON.stringify({operation:'command',payload:body})}:{})};await handler(req,res);return res;};
  const reset=()=>{stats.sql=stats.auth=0;stats.calls=[];};
  const initial=await invoke();assert.equal(initial.statusCode,200);const b=initial.value.data;
  const body={command:'propose',contractId,period,scopeVersion:b.scopeVersion,baseVersion:b.configuration.version,sourceVersion:b.source.version,proposalId:null,proposalSha256:null,definition:facts,reason:'Contención exclusivamente sintética documentada QA',reviewConfirmed:false},key=randomUUID();
  release=await maintenanceLock(h);
  try{
   reset();const busy=await invoke();assert.equal(busy.statusCode,409);assert.equal(busy.value.code,prefix+'_BUSY');assert.equal(stats.sql,2);assert.equal(stats.auth,2);assert.deepEqual(stats.calls[0],stats.calls[1]);ok(true,prefix+': actual maintenance-compatible persistent lock remains BUSY after exactly two authorized GET reads');
   reset();const posted=await invoke(body,key);assert.equal(posted.statusCode,409);assert.equal(posted.value.code,prefix+'_BUSY');assert.equal(stats.sql,1);assert.equal(stats.auth,1);assert.equal(stats.calls[0].values[2],key);assert.deepEqual(JSON.parse(stats.calls[0].values[1]),body);ok(true,prefix+': actual occupied POST executes once and conserves its exact original body and key');
   reset();mode='revoke';const revoked=await invoke();assert.equal(revoked.statusCode,403);assert.equal(stats.sql,1);assert.equal(stats.auth,2);assert.equal(revoked.value.data,undefined);ok(true,prefix+': access withdrawal during a real occupied read denies recovery before another SQL query');
   reset();mode='change';const changed=await invoke();assert.equal(changed.statusCode,409);assert.equal(changed.value.code,prefix+'_SCOPE_CHANGED');assert.equal(stats.sql,1);assert.equal(changed.value.data,undefined);ok(true,prefix+': changed actor during actual contention cannot read the previous municipal scope');
   reset();mode='mismatched';const invalid=await invoke();assert.equal(invalid.statusCode,401);assert.equal(invalid.value.code,prefix+'_SESSION_INVALID');assert.equal(stats.sql,1);assert.equal(stats.auth,2);assert.equal(invalid.value.data,undefined);ok(true,prefix+': inconsistent principal and session are rejected before a second SQL read during actual contention');
  }finally{await release();}
  release=await maintenanceLock(h);
  try{reset();mode='release';const recovered=await invoke();assert.equal(recovered.statusCode,200);assert.equal(stats.sql,2);assert.equal(stats.auth,2);assert.deepEqual(stats.calls[0],stats.calls[1]);assert.deepEqual(recovered.value.data,b);ok(true,prefix+': releasing a real maintenance-compatible holder during reauthorization recovers the exact complete source without a command');}finally{await release();}
 }
 assert.deepEqual(await state(),before);ok(true,'all occupied GET and POST regressions conserve every synthetic contract, period fact, capture and result');
}
