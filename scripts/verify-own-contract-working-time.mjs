// Loopback/PostgreSQL and actual HTTP handlers; invented data only.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { verifyOwnPeriodParticipation } from './verify-own-period-participation.mjs';
import { qaLiteral as q } from './lib/own-payroll-durable-qa.mjs';
import { createOwnContractWorkingTimeHandler } from '../api/internal-own-contract-working-time.js';
import { row } from '../tests/fixtures/native-salary-synthetic.js';
import { buildOwnContractWorkingTimeInstallation, assertOwnContractWorkingTimeDurability } from './lib/own-contract-working-time-installation.mjs';
import { WORKING_TIME_CONSUMER_DEFINITION_HASHES } from './lib/own-contract-working-time-source-pins.mjs';
import { employeeDraft } from '../assets/native-employee-contract.js';
import { rule, policy } from '../tests/fixtures/own-payroll-synthetic.js';
import { salaryItems } from '../assets/native-salary-catalog-model.js';
import { ownProgramDefinition } from '../assets/own-payroll-program-model.js';
import { participationRuleKey } from '../assets/own-period-participation-program.js';
const j=v=>q(JSON.stringify(v))+'::jsonb';
const sha=s=>createHash('sha256').update(s).digest('hex');
export async function verifyOwnContractWorkingTime(options){
 return verifyOwnPeriodParticipation({...options,browser:'none',continuation:async h=>{
  const {qa,db,sql,relocate,adapter,deps,handlers,api,ok,setActor}=h;
  const period=h.period,people=[];
  // A new complete cohort avoids reusing contracts that earlier regressions closed or exited.
  const hireBoot=await db.run('SELECT native_employee_bootstrap_v1('+j(qa.actors.maker)+')',true);
  const category=hireBoot.catalog.items.find(x=>x.kind==='categories'&&x.agreementCode==='1');
  assert.ok(category);
  for(let i=0;i<Math.max(37,h.count);i++){
   const dni=String(97030000+i),cuilBase='20'+dni,rem=11-[5,4,3,2,7,6,5,4,3,2].reduce((n,w,k)=>n+w*Number(cuilBase[k]),0)%11;
   const draft=employeeDraft({legajo:String(41000+i),fullName:'JORNADA EXCLUSIVAMENTE SINTETICA QA '+i,dni,cuil:cuilBase+(rem===11?'0':rem===10?'9':String(rem)),birthDate:'1990-01-01',sexCode:'X',startDate:period+'-01',agreementCode:'1',categoryCode:category.code,organizationId:hireBoot.catalog.items.find(x=>x.kind==='organizations').code,sectorCode:hireBoot.catalog.items.find(x=>x.kind==='sectors').code,jobTitle:'Agente exclusivamente sintético QA',legalReference:'Alta exclusivamente sintética QA',jurisdictionCode:i%2?'55':'42'});
   const created=await db.run('SELECT native_employee_create_v1('+j(qa.actors.maker)+','+j(draft)+','+q(hireBoot.catalog.version)+','+q(randomUUID())+'::uuid)',true);
   assert.equal(created.origin,'MUNICONTROL');people.push({contractId:created.contractId,employeeNumber:created.legajo});
  }
  people.sort((a,b)=>a.contractId.localeCompare(b.contractId));
  ok(true,'explicit new cohort of37 native-only employees has no inherited close, exit or GRH requirement');
  const beforePins=WORKING_TIME_CONSUMER_DEFINITION_HASHES;
  const normalize=s=>s.replaceAll("SET search_path TO 'pg_catalog', '"+qa.schema+"', 'public', 'pg_temp'","SET search_path TO 'pg_catalog', 'public', 'pg_temp'").replaceAll('search_path=pg_catalog, '+qa.schema+', public, pg_temp','search_path=pg_catalog, public, pg_temp').replaceAll(qa.schema,'public');
  const deployed=await db.run("SELECT jsonb_agg(jsonb_build_object('name',p.proname,'definition',pg_get_functiondef(p.oid)) ORDER BY p.proname) FROM pg_proc p WHERE p.pronamespace="+q(qa.schema)+"::regnamespace AND p.proname IN('own_program_definition_v1','own_program_command_v1','own_run_capture_v1','own_run_complete_v1')");
  fs.writeFileSync(path.join(h.destination,'before-consumers.json'),JSON.stringify(deployed,null,2));
  for(const p of beforePins)assert.equal(sha(normalize(deployed.find(r=>r.name===p.name).definition)),p.sha256,'CANONICAL_BEFORE_CHANGED: '+p.name);
  ok(true,'all four disposable consumers reproduce the exact published PG17/18 source before the new installation');
  const preserved=()=>db.run("SELECT jsonb_build_object('contracts',(SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY id)::text) FROM employment_contract e),'seniority',(SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY id)::text) FROM own_seniority_event e),'participation',(SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY id)::text) FROM own_participation_event e),'salary',(SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY id)::text) FROM native_salary_event e),'program',(SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY id)::text) FROM own_payroll_program_event e),'captures',(SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY id)::text) FROM own_payroll_run_capture e),'results',(SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY capture_id)::text) FROM own_payroll_run_result e))");
  const before=await preserved();
  const batch=buildOwnContractWorkingTimeInstallation(h.options);
  const n=s=>relocate(s.replaceAll("SET search_path TO 'pg_catalog', 'public', 'pg_temp'",'SET search_path=pg_catalog,public,pg_temp'));
  const transplanted=source=>{let value=source;for(const p of beforePins){const original=deployed.find(r=>r.name===p.name).definition;value=value.replaceAll(p.sha256,sha(original));}return n(value);};
  const beforeCheck=n(batch.beforeCheck),afterCheck=n(batch.afterCheck);
  const statements=batch.statements.map(s=>s===batch.choose?"DO $choose$ BEGIN IF current_setting('municontrol_working_time.mode')='install' THEN EXECUTE "+q(beforeCheck)+";ELSE EXECUTE "+q(afterCheck)+";END IF;END $choose$":s===batch.apply?"DO $apply$ BEGIN IF current_setting('municontrol_working_time.mode')='install' THEN "+batch.mutations.map(m=>'EXECUTE '+q(transplanted(m))+';').join('\n')+' END IF;END $apply$':n(s));
  const installed=await sql(statements.join(';')),durable=await sql(batch.verification.map(n).join(';'));
  assertOwnContractWorkingTimeDurability({installed,durable,batch});const repeated=await sql(statements.join(';'));assert.equal(installed.mode,'install');assert.deepEqual(repeated,durable);
  assert.deepEqual(await preserved(),before);assert.equal(await db.run('SELECT to_jsonb(count(*)) FROM own_working_time_event'),0);
  ok(true,'complete installation conserves every old row and security object, durable metadata and verify-only repetition');
  await assert.rejects(()=>sql('GRANT SELECT ON '+qa.schema+'.own_working_time_event TO municontrol_actions_runtime_app;'+afterCheck),/WORKING_TIME_TABLE_SECURITY/);
  assert.deepEqual(await sql(batch.verification.map(n).join(';')),durable);
  ok(true,'unexpected direct table access is rejected and rolled back without changing existing permissions');
  const workingAdapter={query:async(query,values)=>{
   if(!query.startsWith('SELECT public.own_working_time_'))return adapter.query(query,values);
   assert.match(query,/^SELECT public\.own_working_time_(?:bootstrap|detail|attempt|command)_v1\([\s\S]+\) AS result$/);
   return[{result:await db.run(query.replaceAll('public.',qa.schema+'.').replace(/\$(\d+)/g,(_,n)=>q(values[Number(n)-1])),true)}];
  }};
  handlers.workingTime=createOwnContractWorkingTimeHandler({...deps,getSql:()=>workingAdapter});
  const query=e=>({resource:'bootstrap',contractId:e.contractId,period});
  async function propose(e,d){setActor(qa.actors.maker);const b=await api('workingTime',{query:query(e)}),key=randomUUID();const body={command:'propose',contractId:e.contractId,period,scopeVersion:b.scopeVersion,baseVersion:b.configuration.version,sourceVersion:b.source.version,proposalId:null,proposalSha256:null,definition:{...d,asOfDate:period+'-01',documentReference:'Jornada exclusivamente sintética QA'},reason:'Declaración de jornada exclusivamente sintética QA',reviewConfirmed:false};return{body,key,receipt:await api('workingTime',{body,key,expected:201})};}
  async function approve(p){setActor(qa.actors.checker);const b=await api('workingTime',{query:{resource:'bootstrap',contractId:p.body.contractId,period}});return api('workingTime',{expected:201,body:{...p.body,command:'approve',scopeVersion:b.scopeVersion,proposalId:p.receipt.proposalId,proposalSha256:p.receipt.requestSha256,definition:null,reason:'Revisión independiente exclusivamente sintética QA',reviewConfirmed:true}});}
  const first=await propose(people[0],{dailyHours:'0.00',monthlyHours:null});
  setActor(qa.actors.samePerson);const same=await api('workingTime',{query:query(people[0])});assert.equal(same.proposals.find(p=>p.id===first.receipt.proposalId).canReview,false);
  await api('workingTime',{expected:403,body:{...first.body,command:'approve',scopeVersion:same.scopeVersion,proposalId:first.receipt.proposalId,proposalSha256:first.receipt.requestSha256,definition:null,reason:'No debe aceptar misma persona con otro perfil',reviewConfirmed:true}});
  await approve(first);setActor(qa.actors.maker);assert.equal((await api('workingTime',{query:query(people[0])})).configuration.definition.monthlyHours,null);
  const replay=await api('workingTime',{query:{resource:'attempt',key:first.key}});assert.deepEqual(replay.body,first.body);assert.equal(replay.replayed,true);
  ok(true,'actual independent SQL approval preserves exact zero and missing hours; another membership of the author cannot decide');
  let b=await api('salary');const items=salaryItems([...b.catalog.items,...['9961','9962'].map(code=>row({kind:'auxiliary',code,nature:'auxiliary',unit:'hours',validFrom:period}))]);
  const sb={command:'propose',scopeVersion:b.scopeVersion,baseVersion:b.catalog.version,classificationVersion:b.classification.version,items,proposalId:null,proposalSha256:null,reason:'Definiciones de jornada exclusivamente sintéticas QA',reviewConfirmed:false};const sr=await api('salary',{body:sb,expected:201});setActor(qa.actors.checker);b=await api('salary');await api('salary',{expected:201,body:{...sb,command:'approve',scopeVersion:b.scopeVersion,items:null,proposalId:sr.proposalId,proposalSha256:sr.requestSha256,reviewConfirmed:true}});
  setActor(qa.actors.maker);const pb=await api('program'),p=structuredClone(pb.program.definition);p.workingTimeVersion='own-contract-working-time.v1';
  for(const [code,key,field]of[['9961','contractDailyHours','dailyHours'],['9962','contractMonthlyHours','monthlyHours']]){
   const r=rule(code,{op:'input',key,unit:'hours'},{nature:'auxiliary',unit:'hours',validFrom:period,rounding:policy('exact',8)});p.rules.push(r);p.periodParticipation.treatments.push({ruleKey:participationRuleKey(r),treatment:'declared_formula',reference:'Unidad horas exclusivamente sintética QA'});
   p.bindings.push({agreementCode:'1',key,unit:'hours',sourceKind:'working_time_fact',sourceField:field,onMissing:'error',combine:'single',ruleReference:'Jornada aprobada exclusivamente sintética QA'});
  }
  const pg={command:'propose',scopeVersion:pb.scopeVersion,baseVersion:pb.program.version,salaryVersion:pb.salaryCatalog.version,program:ownProgramDefinition(p,pb.salaryCatalog.items),proposalId:null,proposalSha256:null,reason:'Entradas de jornada exclusivamente sintéticas QA',reviewConfirmed:false};const pr=await api('program',{body:pg,expected:201});setActor(qa.actors.checker);const cb=await api('program');await api('program',{expected:201,body:{...pg,command:'approve',scopeVersion:cb.scopeVersion,program:null,proposalId:pr.proposalId,proposalSha256:pr.requestSha256,reviewConfirmed:true}});
  ok(true,'whole existing program independently admits explicitly versioned working-time bindings without changing old namespaces, rules or facts');
  for(const e of people){
   setActor(qa.actors.maker);const s=await api('seniority',{query:query(e)}),body={command:'propose',contractId:e.contractId,period,scopeVersion:s.scopeVersion,baseVersion:s.configuration.version,sourceVersion:s.source.version,proposalId:null,proposalSha256:null,definition:{years:'8',months:'0',asOfDate:period+'-01',documentReference:'Antigüedad exclusivamente sintética QA'},reason:'Fuente requerida explícita exclusivamente sintética',reviewConfirmed:false};const r=await api('seniority',{body,expected:201});setActor(qa.actors.checker);const c=await api('seniority',{query:query(e)});await api('seniority',{expected:201,body:{...body,command:'approve',scopeVersion:c.scopeVersion,proposalId:r.proposalId,proposalSha256:r.requestSha256,definition:null,reason:'Revisión independiente de fuente sintética QA',reviewConfirmed:true}});
   if(e!==people[0])await approve(await propose(e,{dailyHours:'7.50000001',monthlyHours:'160.250'}));
  }
  setActor(qa.actors.maker);const runBoot=await api('run'),selection={kind:'contracts',values:people.map(e=>e.contractId).sort()},runBody={...h.oldBody,period,scopeVersion:runBoot.scopeVersion,programVersion:runBoot.programVersion,selection},missingKey=randomUUID();const missingError=await api('run',{body:runBody,key:missingKey,expected:422});fs.writeFileSync(path.join(h.destination,'missing-source-error.json'),JSON.stringify(missingError,null,2));assert.equal(missingError.code,'OWN_RUN_INPUT_MISSING');
  const missing=await api('run',{query:{resource:'attempt',key:missingKey}});assert.equal(missing.saved,null);assert.equal(missing.payload.workingTime.records.length,people.length);assert.equal(missing.payload.workingTime.records.find(r=>r.contractId===people[0].contractId).configuration.definition.monthlyHours,null);
  await approve(await propose(people[0],{dailyHours:'0.00',monthlyHours:'0'}));setActor(qa.actors.maker);const ready=await api('run');const run=await api('run',{body:{...runBody,scopeVersion:ready.scopeVersion,programVersion:ready.programVersion},expected:201});
  assert.equal(run.payload.workingTime.records.length,people.length);assert.equal(run.saved.input.employees.length,people.length);assert.equal(run.saved.input.employees.at(-1).inputs.find(i=>i.key==='contractDailyHours').value,'7.50000001');assert.ok(run.saved.input.employees.every(e=>e.inputs.some(i=>i.key==='contractMonthlyHours')));
  const original=structuredClone(run);await approve(await propose(people.at(-1),{dailyHours:'8',monthlyHours:'180'}));setActor(qa.actors.maker);const recovered=await api('run',{query:{resource:'attempt',key:run.key}});assert.deepEqual(recovered.payload,original.payload);assert.deepEqual(recovered.saved,original.saved);
  const recoveredMissing=await api('run',{query:{resource:'attempt',key:missingKey}});assert.equal(recoveredMissing.saved,null);assert.equal(recoveredMissing.payload.workingTime.records.find(r=>r.contractId===people[0].contractId).configuration.definition.monthlyHours,null);
  ok(true,'complete actual capture and rational engine preserve every selected employee, exact hours, original source hashes and earlier unknowns after later approvals');
  if(options.browser&&options.browser!=='none'){
   const {createInternalDataHandler}=await import('../api/internal-data.js');
   Object.assign(h.env,{FRIENDLY_GRH_SOURCE_DATABASE:'qa_fixed_source',FRIENDLY_GRH_COMPANY_ID:'101'});
   handlers.directory=createInternalDataHandler({env:h.env,requireCompatibleInternalAccess:deps.requireAccess,actionMutationSession:deps.sessionFor,getInternalSql:()=>adapter,getActionCenterSql:()=>adapter});
   const {verifyOwnContractWorkingTimeBrowser}=await import('./lib/own-contract-working-time-browser.mjs');
   await verifyOwnContractWorkingTimeBrowser({handlers,env:h.env,actors:qa.actors,setActor,people,period,output:h.destination,check:ok,browserName:options.browser,revoke:()=>sql('UPDATE tenant_action_employment_link SET active=false,revoked_at=clock_timestamp() WHERE membership_id='+q(qa.actors.maker.membershipId)+'::uuid'),restore:()=>sql('UPDATE tenant_action_employment_link SET active=true,revoked_at=NULL WHERE membership_id='+q(qa.actors.maker.membershipId)+'::uuid')});
  }
  const eventCount=await db.run('SELECT to_jsonb(count(*)) FROM own_working_time_event');for(const mutation of["UPDATE own_working_time_event SET actor_label='Alteración QA'",'DELETE FROM own_working_time_event','TRUNCATE own_working_time_event'])await assert.rejects(()=>sql(mutation),/WORKING_TIME_IMMUTABLE/);assert.equal(await db.run('SELECT to_jsonb(count(*)) FROM own_working_time_event'),eventCount);
  await sql('UPDATE tenant_action_employment_link SET active=false,revoked_at=clock_timestamp() WHERE membership_id='+q(qa.actors.maker.membershipId)+'::uuid');assert.equal((await api('workingTime',{query:query(people[0])})).permissions.canPropose,false);await api('workingTime',{query:{resource:'attempt',key:first.key},expected:403});await sql('UPDATE tenant_action_employment_link SET active=true,revoked_at=NULL WHERE membership_id='+q(qa.actors.maker.membershipId)+'::uuid');
  ok(true,'append-only SQL and real access revocation preserve every declared hour and original attempt');
  const result={version:'own-contract-working-time-qa.v1',syntheticOnly:true,productiveBusinessWrites:0,definitions:2,employees:people.length,workingPeriod:period,oldRecordsPreserved:true,eventCount,installed,durable,repeated};
  fs.writeFileSync(path.join(h.destination,'working-time-proof.json'),JSON.stringify(result,null,2)+'\n');
  if(options.continuation)return options.continuation({...h,workingTime:{people,period,result}});
  return result;
 }});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const o=Object.fromEntries(process.argv.slice(2).map(a=>{const m=/^--(major|transport|source-commit|output|browser)=(.+)$/.exec(a);assert.ok(m);return[m[1],m[2]];}));
 try{const r=await verifyOwnContractWorkingTime({major:Number(o.major),transport:o.transport,sourceCommit:o['source-commit'],output:o.output,browser:o.browser??'none'});console.log(JSON.stringify({ok:r.ok,major:r.major,checksPassed:r.checksPassed,syntheticOnly:true}));}catch(e){console.error(e.stack);process.exitCode=1;}
}
