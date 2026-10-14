// Existing loopback PostgreSQL QA only. Every actor and employee is synthetic.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {verifyOwnContractWorkingTime} from './verify-own-contract-working-time.mjs';
import {createOwnContractSalaryConditionsHandler} from '../api/internal-own-contract-salary-conditions.js';
import {qaLiteral as q} from './lib/own-payroll-durable-qa.mjs';
import {splitPostgresStatements} from './lib/sql-statements.mjs';
import {employeeDraft} from '../assets/native-employee-contract.js';
import {salaryConditionsBootstrap,salaryConditionsDetail,salaryConditionsReceipt,salaryConditionsCapture,prepareSalaryConditions,decideSalaryConditions} from '../assets/own-contract-salary-conditions-model.js';
const root=fs.realpathSync(new URL('..',import.meta.url)),j=v=>q(JSON.stringify(v))+'::jsonb';

export async function verifyOwnContractSalaryConditions(options){
 return verifyOwnContractWorkingTime({...options,browser:'none',continuation:async h=>{
  const {qa,db,sql,relocate,ok,adapter,deps,handlers,api,setActor}=h,period=h.workingTime.period,maker=qa.actors.maker,checker=qa.actors.checker;
  const text=fs.readFileSync(path.join(root,'scripts/migrations/171-own-contract-salary-conditions.sql'),'utf8').replace(/\r\n?/g,'\n');
  const statements=splitPostgresStatements(text);
  assert.equal(statements.filter(s=>s.startsWith('CREATE TABLE public.own_salary_conditions_event')).length,1);
  assert.equal(statements.filter(s=>s.startsWith('CREATE FUNCTION public.own_salary_conditions_')).length,15);
  assert.ok(!/CREATE TEMP|TRUNCATE pg_temp/i.test(text));
  // The inherited checker/same-person fixtures did not need whole-cohort
  // nominal reads. Declare that additional synthetic read explicitly here.
  // The same-person negative case must also have parameter review permission,
  // so an unrelated missing right cannot masquerade as independence coverage.
  // These are disposable actor fixtures, never municipal role assignments.
  for(const actor of [checker,qa.actors.samePerson])await sql('INSERT INTO capabilities SELECT '+q(actor.membershipId)+'::uuid,\'payroll.calculation.nominal.read\' WHERE NOT EXISTS(SELECT 1 FROM capabilities WHERE membership_id='+q(actor.membershipId)+'::uuid AND capability_key=\'payroll.calculation.nominal.read\')');
  await sql('INSERT INTO capabilities SELECT '+q(qa.actors.samePerson.membershipId)+'::uuid,\'payroll.parameter.approve\' WHERE NOT EXISTS(SELECT 1 FROM capabilities WHERE membership_id='+q(qa.actors.samePerson.membershipId)+'::uuid AND capability_key=\'payroll.parameter.approve\')');
  const surface=()=>db.run("SELECT jsonb_build_object('contracts',(SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY id)::text) FROM employment_contract e),'registrations',(SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY id)::text) FROM native_employee_registration e),'seniority',(SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY id)::text) FROM own_seniority_event e),'workingTime',(SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY id)::text) FROM own_working_time_event e),'salary',(SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY id)::text) FROM native_salary_event e),'program',(SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY id)::text) FROM own_payroll_program_event e),'captures',(SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY id)::text) FROM own_payroll_run_capture e),'results',(SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY capture_id)::text) FROM own_payroll_run_result e),'capabilities',(SELECT md5(jsonb_agg(to_jsonb(e) ORDER BY membership_id,capability_key)::text) FROM capabilities e))");
  const before=await surface();await sql(statements.map(relocate).join(';'));assert.deepEqual(await surface(),before);
  ok(true,'new conditions table/functions preserve every inherited row, salary result, earlier approval and synthetic permission');
  const conditionsAdapter={query:async(query,values)=>{
   if(!query.startsWith('SELECT public.own_salary_conditions_'))return adapter.query(query,values);
   assert.match(query,/^SELECT public\.own_salary_conditions_(?:bootstrap|detail|attempt|command)_v1\([\s\S]+\) AS result$/);
   return[{result:await db.run(query.replaceAll('public.',qa.schema+'.').replace(/\$(\d+)/g,(_,n)=>{assert.ok(Number(n)>0&&Number(n)<=values.length);return q(values[Number(n)-1]);}),true)}];
  }};
  // Advertise exactly the current disposable actor's actual SQL rights. A
  // revoked right must fail in both the HTTP gateway and the SQL facade.
  handlers.salaryConditions=createOwnContractSalaryConditionsHandler({...deps,getSql:()=>conditionsAdapter,requireAccess:async(...args)=>{
   const access=await deps.requireAccess(...args);if(!access)return access;
   const capabilities=await db.run('SELECT coalesce(jsonb_agg(capability_key ORDER BY capability_key),\'[]\'::jsonb) FROM capabilities WHERE membership_id='+q(access.principal.tenant.membershipId)+'::uuid');
   return{...access,principal:{...access.principal,tenant:{...access.principal.tenant,effectiveCapabilities:capabilities}}};
  }});
  const boot=async(actor=maker)=>{setActor(actor);return salaryConditionsBootstrap(await api('salaryConditions',{query:{resource:'bootstrap',period}}));};
  const write=async(actor,body,key=randomUUID())=>{setActor(actor);return salaryConditionsReceipt(await api('salaryConditions',{body,key,expected:201}),{key,body});};
  const directWrite=async(actor,body,key=randomUUID())=>salaryConditionsReceipt(await db.run('SELECT own_salary_conditions_command_v1('+j(actor)+','+j(body)+','+q(key)+'::uuid)',true),{key,body});
  const getDetail=async(actor,pid)=>{setActor(actor);return salaryConditionsDetail(await api('salaryConditions',{query:{resource:'detail',id:pid}}));};
  const definition=i=>({partialSeniorityYears:i%3===0?null:'0',title:i%3===0?{status:'not_reported',code:null,percentage:null}:i%3===1?{status:'none',code:null,percentage:null}:{status:'declared',code:'056',percentage:'12.00000001'},unhealthyWork:i%3===0?null:i%3===1?false:true,asOfDate:period+'-01',documentReference:'Constancia exclusivamente sintética de condiciones QA'});
  const b0=await boot();assert.equal(b0.configuration.revision,0);assert.equal(b0.configuration.items.length,0);
  const hireBoot=await db.run('SELECT native_employee_bootstrap_v1('+j(maker)+')',true),category=hireBoot.catalog.items.find(x=>x.kind==='categories'&&x.agreementCode==='1');
  assert.ok(category,'The published native hire catalogue must contain agreement1');
  const hire=async i=>{
   const dni=String(62000000+i),cuilBase='20'+dni,rem=11-[5,4,3,2,7,6,5,4,3,2].reduce((n,w,k)=>n+w*Number(cuilBase[k]),0)%11;
   const draft=employeeDraft({legajo:String(61000+i),fullName:'CONDICIONES AGENTE EXCLUSIVAMENTE SINTETICO QA '+i,dni,cuil:cuilBase+(rem===11?'0':rem===10?'9':String(rem)),birthDate:'1990-01-01',sexCode:'X',startDate:period+'-01',agreementCode:'1',categoryCode:category.code,organizationId:hireBoot.catalog.items.find(x=>x.kind==='organizations').code,sectorCode:hireBoot.catalog.items.find(x=>x.kind==='sectors').code,jobTitle:'Agente exclusivamente sintético QA',legalReference:'Alta exclusivamente sintética de condiciones QA',jurisdictionCode:i%2?'55':'42'});
   return db.run('SELECT native_employee_create_v1('+j(maker)+','+j(draft)+','+q(hireBoot.catalog.version)+','+q(randomUUID())+'::uuid)',true);
  };
  const extraPeople=[];for(let i=1;i<=855;i++)extraPeople.push(await hire(i));
  const b=await boot();assert.ok(b.source.subjects.length>=855);assert.ok(b.source.subjects.every(s=>s.origin==='MUNICONTROL'&&s.sourceCutoff===null));
  const items=b.source.subjects.map((s,i)=>({contractId:s.contractId,identityToken:s.identityToken,definition:definition(i)}));
  const body=prepareSalaryConditions(b,items,'Preparación completa exclusivamente sintética QA'),key=randomUUID();
  const prepared=await write(maker,body,key);assert.equal(prepared.body.items.length,items.length);
  ok(true,'actual source and command retain the whole native-only cohort of855 additional employees, both jurisdictions and every last-row condition');
  const same=await boot(qa.actors.samePerson);assert.equal(same.permissions.canReview,true);assert.equal(same.proposals.find(p=>p.id===prepared.proposalId).canReview,false);
  await assert.rejects(()=>db.run('SELECT own_salary_conditions_command_v1('+j(qa.actors.samePerson)+','+j({...body,command:'approve',scopeVersion:same.scopeVersion,proposalId:prepared.proposalId,proposalSha256:prepared.requestSha256,items:null,reviewConfirmed:true})+','+q(randomUUID())+'::uuid)',true),/SALARY_CONDITIONS_INDEPENDENT_REQUIRED/);
  const review=await boot(checker),d=await getDetail(checker,prepared.proposalId),decision=await decideSalaryConditions(review,d,'approve','Revisión completa independiente exclusivamente sintética QA');
  await write(checker,decision);const approved=await boot();assert.deepEqual(approved.configuration.items,items);assert.equal(approved.configuration.revision,1);
  ok(true,'actual SQL independent approval distinguishes missing, explicit no-title, false insalubrity and exact title percentage without mapping the title code');
  const selected=b.source.subjects.map(s=>({contractId:s.contractId,identityToken:s.identityToken}));
  const captured=await db.run('SELECT own_salary_conditions_capture_v1(own_salary_conditions_context_v1('+j(maker)+'),'+j(selected)+','+q(period)+')');
  salaryConditionsCapture(captured,selected,period);assert.equal(captured.records.length,items.length);assert.deepEqual(captured.records.at(-1).definition,items.at(-1).definition);
  ok(true,'private complete capture preserves every reviewed value and identity through the last selected contract');
  setActor(maker);const replay=await api('salaryConditions',{query:{resource:'attempt',key}});await salaryConditionsReceipt(replay,{key,body});assert.equal(replay.replayed,true);
  const reused=await api('salaryConditions',{body:{...body,reason:'Otro fundamento sintético con la misma clave'},key,expected:409});assert.equal(reused.code,'SALARY_CONDITIONS_IDEMPOTENCY_REUSE');
  ok(true,'durable receipt recovery retains the entire original body and key; changed reuse is refused');
  const cropped=prepareSalaryConditions(approved,items.map((r,i)=>({...r,definition:{...r.definition,partialSeniorityYears:i===0?'1':r.definition.partialSeniorityYears}})),'Cambio completo exclusivamente sintético QA');
  await assert.rejects(()=>directWrite(maker,{...cropped,items:cropped.items.slice(0,-1)}),/SALARY_CONDITIONS_POPULATION_CHANGED/);
  const corrupted=structuredClone(cropped);corrupted.items.at(-1).identityToken='b'.repeat(64);await assert.rejects(()=>directWrite(maker,corrupted),/SALARY_CONDITIONS_POPULATION_CHANGED/);
  await assert.rejects(()=>directWrite(maker,{...cropped,items:[...cropped.items,cropped.items.at(-1)]}),/SALARY_CONDITIONS_INPUT_INVALID/);
  setActor(maker);const truncated=await api('salaryConditions',{body:{...cropped,items:cropped.items.slice(0,-1)},expected:409});assert.equal(truncated.code,'SALARY_CONDITIONS_POPULATION_CHANGED');
  ok(true,'direct SQL also rejects cropped, duplicated and last-row identity-corrupted complete sets without partial writes');
  const pending=await write(maker,cropped);await hire(856);const fresh=await boot(checker),stale=await getDetail(checker,pending.proposalId);assert.equal(stale.current,false);
  await assert.rejects(()=>db.run('SELECT own_salary_conditions_command_v1('+j(checker)+','+j({...cropped,command:'approve',scopeVersion:fresh.scopeVersion,proposalId:pending.proposalId,proposalSha256:pending.requestSha256,items:null,reviewConfirmed:true})+','+q(randomUUID())+'::uuid)',true),/SALARY_CONDITIONS_BASE_CHANGED/);
  await write(checker,await decideSalaryConditions(fresh,stale,'reject','Rechazo independiente de fuente cambiada exclusivamente sintética QA'));
  ok(true,'a real new native hire invalidates the complete pending source; rejection preserves that original proposal instead of rewriting it');
  const latest=await boot(),selection=latest.source.subjects.map(s=>({contractId:s.contractId,identityToken:s.identityToken})),missing=await db.run('SELECT own_salary_conditions_capture_v1(own_salary_conditions_context_v1('+j(maker)+'),'+j(selection)+','+q(period)+')');
  salaryConditionsCapture(missing,selection,period);const missingRows=missing.records.filter(r=>r.revision===0);assert.equal(missingRows.length,1);assert.equal(missingRows[0].definition,null);assert.equal(missingRows[0].approvalId,null);
  ok(true,'a later hire remains explicitly unapproved in the complete capture, without an invented zero or entitlement');
  for(const mutation of["UPDATE own_salary_conditions_event SET actor_label='Alteración QA'",'DELETE FROM own_salary_conditions_event','TRUNCATE own_salary_conditions_event'])await assert.rejects(()=>sql(mutation),/SALARY_CONDITIONS_IMMUTABLE/);
  await assert.rejects(()=>db.run('SELECT to_jsonb(count(*)) FROM own_salary_conditions_event',true),/permission denied/);
  await sql('DELETE FROM capabilities WHERE membership_id='+q(maker.membershipId)+'::uuid AND capability_key=\'payroll.calculation.nominal.read\'');
  setActor(maker);const withdrawn=await api('salaryConditions',{query:{resource:'bootstrap',period},expected:403});assert.equal(withdrawn.code,'SALARY_CONDITIONS_FORBIDDEN');
  await assert.rejects(()=>db.run('SELECT own_salary_conditions_attempt_v1('+j(maker)+','+q(key)+'::uuid)',true),/SALARY_CONDITIONS_FORBIDDEN/);
  await sql('INSERT INTO capabilities VALUES('+q(maker.membershipId)+'::uuid,\'payroll.calculation.nominal.read\')');
  ok(true,'append-only data, private table access and withdrawn nominal permission preserve the complete earlier receipts');
  if(options.browser&&options.browser!=='none'){
   const{verifySalaryConditionsBrowser}=await import('./lib/own-contract-salary-conditions-browser.mjs');
   await verifySalaryConditionsBrowser({handlers,env:h.env,actors:qa.actors,setActor,period,output:h.destination,check:ok,bootstrap:()=>boot(),browserName:options.browser,
    revoke:()=>sql('DELETE FROM capabilities WHERE membership_id='+q(maker.membershipId)+'::uuid AND capability_key=\'payroll.calculation.nominal.read\''),
    restore:()=>sql('INSERT INTO capabilities SELECT '+q(maker.membershipId)+'::uuid,\'payroll.calculation.nominal.read\' WHERE NOT EXISTS(SELECT 1 FROM capabilities WHERE membership_id='+q(maker.membershipId)+'::uuid AND capability_key=\'payroll.calculation.nominal.read\')')});
  }
  const proof={version:'own-contract-salary-conditions-sql-qa.v1',major:options.major,syntheticOnly:true,productiveBusinessWrites:0,rows:items.length,newNativeEmployees:856,eventRows:await db.run('SELECT to_jsonb(count(*)) FROM own_salary_conditions_event'),sourceSqlSha256:createHash('sha256').update(text).digest('hex'),modelBytes:4194304,actualHttpHandlers:true,engineIntegrated:false,technicalInstallationProtocol:false};
  fs.writeFileSync(path.join(h.destination,'salary-conditions-sql-proof.json'),JSON.stringify(proof,null,2)+'\n');
  if(options.continuation)return options.continuation({...h,salaryConditions:{proof,extraPeople}});return proof;
 }});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const o={};for(const a of process.argv.slice(2)){const m=/^--(major|transport|source-commit|output|browser)=(.+)$/.exec(a);assert.ok(m&&!Object.hasOwn(o,m[1]));o[m[1]]=m[2];}
 try{const r=await verifyOwnContractSalaryConditions({major:Number(o.major),transport:o.transport??'local',sourceCommit:o['source-commit'],output:o.output,browser:o.browser??'none'});console.log(JSON.stringify({ok:r.ok,major:r.major,checksPassed:r.checksPassed,syntheticOnly:true}));}catch(e){console.error(e.stack);process.exitCode=1;}
}
