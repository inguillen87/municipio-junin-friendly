// Only disposable loopback PostgreSQL and synthetic approved sources.
// Auth principal/IAM are declared fixtures; handlers, source writers, own CPU
// results, session checks, decision events and COMMIT are the actual product.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {buildOwnLiquidationQa,createOwnLiquidationPsqlQa} from './lib/own-payroll-liquidation-qa.mjs';
import {qaLiteral as q} from './lib/own-payroll-durable-qa.mjs';
import {ownRunOperation,RUN_CALCULATE,ownRunHash} from '../lib/internal-own-payroll-run.js';
import {ownLiquidationOperation,OWN_LIQ_REVIEW} from '../lib/internal-own-payroll-liquidation.js';
const root=path.resolve(import.meta.dirname,'..'),execute=promisify(execFile),args={};
for(const a of process.argv.slice(2)){const m=/^--(major|psql|output)=(.+)$/.exec(a);assert.ok(m);assert.equal(args[m[1]],undefined);args[m[1]]=m[2];}
const major=Number(args.major);assert.ok([17,18].includes(major));const output=path.resolve(args.output);assert.ok(output.startsWith(path.join(root,'verification')+path.sep)&&!fs.existsSync(output));
const qa=buildOwnLiquidationQa(major),executable=args.psql??'psql',rawDb=createOwnLiquidationPsqlQa({executable,major,port:55400+major,schema:qa.schema,pins:qa.pins}),sqlDiagnostics=[],db={...rawDb,query:async(...args)=>{try{return await rawDb.query(...args);}catch(e){sqlDiagnostics.push(e.message);throw e;}}},prefix=output.replace(/\.json$/,''),seed=prefix+'-seed.sql';fs.writeFileSync(seed,qa.sql,{flag:'wx'});
const identity=(actor,caps)=>({principal:{user:{email:actor.actorEmail},tenant:{source:'membership',id:actor.tenantId,membershipId:actor.membershipId,effectiveCapabilities:caps}},session:{email:actor.actorEmail,id:actor.actorSessionId,version:actor.actorSessionVersion,releaseSha:actor.releaseSha}});
let installed=false,checks=0,report;const check=(v,label)=>{assert.ok(v,label);checks++;};
try{
 const r=await execute(executable,[...db.args,'-f',seed],{windowsHide:true,maxBuffer:4*1024*1024,timeout:90000});installed=true;fs.writeFileSync(prefix+'-seed.log',r.stdout+r.stderr);
 const maker=identity(qa.actors.maker,RUN_CALCULATE),reviewer=identity(qa.actors.checker,OWN_LIQ_REVIEW);
 const run=(op,input)=>ownRunOperation(db,maker.principal,maker.session,op,input),liq=(actor,op,input)=>ownLiquidationOperation(db,actor.principal,actor.session,op,input);
 const boot=await run('bootstrap'),period=await db.run("SELECT to_jsonb(greatest('2026-10',to_char(clock_timestamp() AT TIME ZONE 'America/Argentina/Mendoza','YYYY-MM')))");
 const body={period,liquidationType:'monthly',selection:{kind:'all',values:[]},scopeVersion:boot.scopeVersion,programVersion:boot.programVersion,populationDomain:'native_registered'};
 const c=await run('calculate',{body,key:randomUUID()}),original=structuredClone(c.saved);check(c.saved.result.employeeCount===2,'full own population has two genuine native employees');
 check(c.saved.result.employeeCount===c.saved.input.employees.length&&c.saved.result.rowCount===12,'full six-rule exact result per native employee');
 const list=await liq(reviewer,'bootstrap');check(list.runs.length===1&&!JSON.stringify(list).includes('19041'),'bootstrap includes other maker without nominal fields');
 let detail=await liq(reviewer,'detail',{id:c.id});check(detail.employees.every(e=>e.allowedCommands.join('|')==='confirm'),'independent reviewer can confirm all calculated own employees');
 const command=(d,command,selection={kind:'all',values:[]})=>({runId:d.id,resultSha256:d.capture.saved.resultSha256,scopeVersion:d.scopeVersion,stateVersion:d.stateVersion,command,selection,reason:'Decisión exclusivamente sintética QA',reviewConfirmed:true});
 const makerDetail=await liq(maker,'detail',{id:c.id});check(makerDetail.employees.every(e=>e.allowedCommands.join('|')==='cancel'),'maker cannot confirm or annul own calculation');
 const firstId=detail.employees[0].contractId,key=randomUUID(),firstBody=command(detail,'confirm',{kind:'contracts',values:[firstId]});
 const samePerson=identity(qa.actors.samePerson,OWN_LIQ_REVIEW),aliasDetail=await liq(samePerson,'detail',{id:c.id});check(aliasDetail.employees.every(e=>e.allowedCommands.length===0),'another membership/email of the maker person cannot self-confirm');await assert.rejects(liq(samePerson,'command',{key:randomUUID(),body:command(aliasDetail,'confirm')}),e=>e.code==='OWN_LIQ_DECISION_INVALID');checks++;
 for(const actor of [qa.actors.unlinked,qa.actors.outsider]){await assert.rejects(liq(identity(actor,OWN_LIQ_REVIEW),'detail',{id:c.id}),e=>[403,404].includes(e.status));checks++;}
 const raced=await Promise.allSettled([liq(reviewer,'command',{key,body:firstBody}),liq(reviewer,'command',{key,body:firstBody})]);check(raced.some(r=>r.status==='fulfilled')&&raced.every(r=>r.status==='fulfilled'||r.reason.status===409),'simultaneous same-key decisions retain one commit or retryable conflict');
 const first=raced.find(r=>r.status==='fulfilled'&&!r.value.replayed)?.value??await liq(reviewer,'attempt',{key});check(first.affected.length===1&&first.affected[0].liquidationVersion===1,'confirm one legajo from a complete two-legajo result');
 const recovery=await liq(reviewer,'attempt',{key});assert.deepEqual(recovery,{...first,replayed:true});checks++;
 const replay=await liq(reviewer,'command',{key,body:first.body});assert.deepEqual(replay,recovery);checks++;
 await assert.rejects(liq(reviewer,'command',{key,body:{...first.body,reason:'Otro motivo sintético distinto'}}),e=>e.code==='OWN_LIQ_IDEMPOTENCY_REUSE');checks++;
 await assert.rejects(liq(reviewer,'command',{key:randomUUID(),body:command(detail,'confirm')}),e=>e.code==='OWN_LIQ_STATE_CHANGED');checks++;
 detail=await liq(reviewer,'detail',{id:c.id});check(detail.employees.filter(e=>e.state==='confirmed').length===1,'partial decision keeps other legajo calculated');
 await assert.rejects(liq(reviewer,'command',{key:randomUUID(),body:command(detail,'confirm')}),e=>e.code==='OWN_LIQ_DECISION_INVALID');checks++;
 const department=c.saved.input.employees[0].departmentCode;
 const annul=await liq(reviewer,'command',{key:randomUUID(),body:command(detail,'annul',{kind:'contracts',values:[firstId]})});check(annul.affected[0].version===2&&annul.affected[0].liquidationVersion===1,'annul preserves liquidation version and adds a decision');
 detail=await liq(reviewer,'detail',{id:c.id});check(detail.employees[0].events.length===2&&detail.employees[0].state==='annulled','annul retains complete original confirmation history');
 const c2=await run('calculate',{body,key:randomUUID()}),d2=await liq(reviewer,'detail',{id:c2.id});
 await assert.rejects(liq(reviewer,'command',{key:randomUUID(),body:command(d2,'confirm',{kind:'contracts',values:[firstId,randomUUID()]})}),e=>e.code==='OWN_LIQ_SELECTION_INVALID');checks++;
 let before=await db.run('SELECT to_jsonb(count(*)) FROM own_payroll_liquidation_event');check(before===2,'unknown selected legajo rolls back the whole decision');
 const confirmed=await liq(reviewer,'command',{key:randomUUID(),body:command(d2,'confirm',{kind:'departments',values:[department]})});check(confirmed.affected.length===2&&confirmed.affected.find(e=>e.contractId===firstId).liquidationVersion===2,'recalculate then confirm full repartition; per-legajo version increments');
 const c3=await run('calculate',{body,key:randomUUID()}),d3=await liq(reviewer,'detail',{id:c3.id});check(d3.employees.every(e=>e.blockedBy===c2.id&&!e.allowedCommands.includes('confirm')),'other active confirmed run blocks every duplicate destination');
 await assert.rejects(liq(reviewer,'command',{key:randomUUID(),body:command(d3,'confirm')}),e=>e.code==='OWN_LIQ_DECISION_INVALID');checks++;
 const d2current=await liq(reviewer,'detail',{id:c2.id});const allAnnul=await liq(reviewer,'command',{key:randomUUID(),body:command(d2current,'annul',{kind:'agreements',values:[c2.saved.input.employees[0].agreementCode]})});check(allAnnul.affected.length===2,'annul by convenio includes whole chosen group');
 const d3fresh=await liq(reviewer,'detail',{id:c3.id});const all=await liq(reviewer,'command',{key:randomUUID(),body:command(d3fresh,'confirm')});check(all.affected.length===2&&all.affected.every(e=>e.liquidationVersion>=2),'all selects entire saved run after prior active versions annulled');
 const cancelled=await liq(maker,'command',{key:randomUUID(),body:command(await liq(maker,'detail',{id:c.id}),'cancel',{kind:'contracts',values:[c.saved.input.employees.find(e=>e.contractId!==firstId).contractId]})});check(cancelled.affected.length===1&&cancelled.affected[0].liquidationVersion===null&&cancelled.affected[0].state==='cancelled','maker cancels only its unconfirmed legajo without touching another active liquidation');
 const after=await liq(reviewer,'detail',{id:c.id});assert.deepEqual(after.capture.saved,original);checks++;check(after.capture.saved.resultSha256===ownRunHash(original.result)&&!after.effects.paymentExecuted&&!after.effects.periodClosed&&!after.capture.saved.result.municipalApprovalVerified,'administrative decisions never rewrite technical result or fabricate posting/payment/close');
 for(const statement of ['DELETE FROM own_payroll_liquidation_event','UPDATE own_payroll_liquidation_event SET command=command','TRUNCATE own_payroll_liquidation_event']){await assert.rejects(db.run(statement),/OWN_LIQ_IMMUTABLE/);checks++;}
 await assert.rejects(db.run('SELECT to_jsonb(count(*)) FROM own_payroll_liquidation_event',true),/permission denied/);checks++;
 await db.run('DELETE FROM capabilities WHERE membership_id='+q(qa.ids.checker)+"::uuid AND capability_key='payroll.calculation.approve'");
 const revoked=await liq(reviewer,'bootstrap');check(revoked.runs.every(e=>e.canConsult===false),'real review revocation retires authority to consult another maker result');
 await assert.rejects(liq(reviewer,'detail',{id:c3.id}),e=>e.code==='OWN_LIQ_FORBIDDEN');checks++;
 await assert.rejects(liq(reviewer,'command',{key:randomUUID(),body:command(d3fresh,'annul')}),e=>e.code==='OWN_LIQ_FORBIDDEN');checks++;
 await db.run('DELETE FROM capabilities WHERE membership_id='+q(qa.ids.checker)+"::uuid AND capability_key='payroll.calculation.nominal.read'");
 await assert.rejects(liq(reviewer,'detail',{id:c3.id}),e=>e.status===403);checks++;await assert.rejects(liq(reviewer,'attempt',{key}),e=>e.status===403);checks++;
 check(new Set(db.connections).size===db.connections.length,'every write/read/replay uses an independent committed PostgreSQL connection');
 report={passed:true,checks,serverMajor:major,synthetic:true,committed:true,ownEmployeesWithoutGrh:2,selectionKindsVerified:['contracts','departments','agreements','all'],immutableOriginalResult:true,actualSqlRevocation:true,authenticationPrincipalFixture:true,productUiVerified:false,productiveBusinessOperations:0,connections:db.connections.length};
}catch(e){report={passed:false,checks,message:e.message,sqlDiagnostics,synthetic:true};process.exitCode=1;}
finally{if(installed){try{await db.run('DROP SCHEMA '+qa.schema+' CASCADE');report.syntheticSchemaRemoved=true;}catch(e){report.cleanupError=e.message;process.exitCode=1;}}fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
