// Synthetic actors only. Real C2 calculation, confirmation and new close SQL
// commit in disposable loopback schemas, each call on an independent connection.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {randomUUID} from 'node:crypto';
import {buildOwnCloseQa,createOwnClosePsqlQa} from './lib/own-payroll-close-qa.mjs';
import {qaLiteral as q} from './lib/own-payroll-durable-qa.mjs';
import {ownRunOperation,RUN_CALCULATE,ownRunAlgorithmHash} from '../lib/internal-own-payroll-run.js';
import {ownLiquidationOperation,OWN_LIQ_REVIEW} from '../lib/internal-own-payroll-liquidation.js';
import {ownCloseOperation,OWN_CLOSE_WRITE} from '../lib/internal-own-payroll-close.js';
import {ownCloseSnapshot} from '../assets/own-payroll-close-model.js';
const root=path.resolve(import.meta.dirname,'..'),execute=promisify(execFile),args={};for(const a of process.argv.slice(2)){const m=/^--(major|psql|output)=(.+)$/.exec(a);assert.ok(m);assert.equal(args[m[1]],undefined);args[m[1]]=m[2];}
const major=Number(args.major);assert.ok([17,18].includes(major));const output=path.resolve(args.output);assert.ok(output.startsWith(path.join(root,'verification')+path.sep)&&!fs.existsSync(output));
const qa=buildOwnCloseQa(major),executable=args.psql??'psql',rawDb=createOwnClosePsqlQa({executable,major,port:55400+major,schema:qa.schema,pins:qa.pins}),diagnostics=[],db={...rawDb,query:async(...args)=>{try{return await rawDb.query(...args);}catch(e){diagnostics.push(e.message);throw e;}}},prefix=output.replace(/\.json$/,''),seed=prefix+'-seed.sql';fs.writeFileSync(seed,qa.sql,{flag:'wx'});
const identity=(actor,caps)=>({principal:{user:{email:actor.actorEmail},tenant:{source:'membership',id:actor.tenantId,membershipId:actor.membershipId,effectiveCapabilities:caps}},session:{email:actor.actorEmail,id:actor.actorSessionId,version:actor.actorSessionVersion,releaseSha:actor.releaseSha}});
let installed=false,checks=0,report;const check=(v,label)=>{assert.ok(v,label);checks++;};
try{
 const r=await execute(executable,[...db.args,'-f',seed],{windowsHide:true,maxBuffer:4*1024*1024,timeout:90000});installed=true;fs.writeFileSync(prefix+'-seed.log',r.stdout+r.stderr);
 const maker=identity(qa.actors.maker,RUN_CALCULATE),reviewer=identity(qa.actors.checker,OWN_CLOSE_WRITE),alias=identity(qa.actors.samePerson,OWN_CLOSE_WRITE);
 const run=(op,input)=>ownRunOperation(db,maker.principal,maker.session,op,input),liq=(actor,op,input)=>ownLiquidationOperation(db,actor.principal,actor.session,op,input),close=(actor,op,input)=>ownCloseOperation(db,actor.principal,actor.session,op,input);
 const boot=await run('bootstrap'),period=await db.run("SELECT to_jsonb(greatest('2026-10',to_char(clock_timestamp() AT TIME ZONE 'America/Argentina/Mendoza','YYYY-MM')))");
 const body={period,liquidationType:'monthly',selection:{kind:'all',values:[]},scopeVersion:boot.scopeVersion,programVersion:boot.programVersion,populationDomain:'native_registered'},query={period,liquidationType:'monthly'};
 const command=(d,selection={kind:'all',values:[]},patch={})=>({period:d.period,liquidationType:d.liquidationType,scopeVersion:d.scopeVersion,stateVersion:d.stateVersion,selection,command:'close',groupId:null,reason:'Cierre exclusivamente sintético QA',reviewConfirmed:true,...patch});
 let detail=await close(reviewer,'detail',query);check(detail.rows.length===2&&detail.rows.every(e=>e.state==='missing'),'full authoritative roster includes every unconfirmed own employee');
 await assert.rejects(close(reviewer,'command',{key:randomUUID(),body:command(detail)}),e=>e.code==='OWN_CLOSE_DECISION_INVALID');checks++;
 const c=await run('calculate',{body,key:randomUUID()}),original=structuredClone(c.saved),ld=await liq(reviewer,'detail',{id:c.id});
 const lc=(d,kind='confirm',selection={kind:'all',values:[]})=>({runId:d.id,resultSha256:d.capture.saved.resultSha256,scopeVersion:d.scopeVersion,stateVersion:d.stateVersion,command:kind,selection,reason:'Confirmación exclusivamente sintética QA',reviewConfirmed:true});
 const first=ld.employees[0].contractId,second=ld.employees[1].contractId;
 const confirmKey=randomUUID(),confirmBody=lc(ld,'confirm',{kind:'contracts',values:[first]});await liq(reviewer,'command',{key:confirmKey,body:confirmBody});
 detail=await close(reviewer,'detail',query);check(detail.rows.filter(e=>e.state==='missing').length===1,'partially confirmed population retains the missing legajo');
 await assert.rejects(close(reviewer,'command',{key:randomUUID(),body:command(detail)}),e=>e.code==='OWN_CLOSE_DECISION_INVALID');checks++;
 const aliasDetail=await close(alias,'detail',query);check(aliasDetail.rows.every(e=>!e.canClose),'same person under another membership cannot close their own calculation');
 await assert.rejects(close(alias,'command',{key:randomUUID(),body:command(aliasDetail,{kind:'contracts',values:[first]})}),e=>e.code==='OWN_CLOSE_DECISION_INVALID');checks++;
 await liq(reviewer,'command',{key:randomUUID(),body:lc(await liq(reviewer,'detail',{id:c.id}),'confirm',{kind:'contracts',values:[second]})});
 const uncompletedKey=randomUUID(),uncompleted=(await db.query('SELECT public.own_run_capture_v1($1::jsonb,$2::jsonb,$3::uuid,$4::text) AS result',[JSON.stringify(qa.actors.maker),JSON.stringify(body),uncompletedKey,ownRunAlgorithmHash()]))[0].result;
 detail=await close(reviewer,'detail',query);const before=structuredClone(detail),closeKey=randomUUID(),closeBody=command(detail,{kind:'contracts',values:[first]});
 const raced=await Promise.allSettled([close(reviewer,'command',{key:closeKey,body:closeBody}),close(reviewer,'command',{key:closeKey,body:closeBody})]);check(raced.some(r=>r.status==='fulfilled')&&raced.every(r=>r.status==='fulfilled'||r.reason.status===409),'same-key race yields a single close or recoverable conflict');
 const receipt=await close(reviewer,'attempt',{key:closeKey});assert.deepEqual(receipt.snapshot,ownCloseSnapshot(before,closeBody.selection));checks++;check(receipt.snapshot.employeeCount===1&&!receipt.snapshot.populationComplete,'partial close freezes one legajo without claiming the whole population');
 const replay=await close(reviewer,'command',{key:closeKey,body:closeBody});assert.deepEqual(replay,receipt);checks++;
 await assert.rejects(close(reviewer,'command',{key:closeKey,body:{...closeBody,reason:'Un motivo sintético distinto'}}),e=>e.code==='OWN_CLOSE_IDEMPOTENCY_REUSE');checks++;
 await assert.rejects(close(reviewer,'command',{key:randomUUID(),body:command(before)}),e=>e.code==='OWN_CLOSE_STATE_CHANGED');checks++;
 detail=await close(reviewer,'detail',query);check(detail.rows.find(e=>e.contractId===first).state==='closed'&&detail.rows.find(e=>e.contractId===second).canClose,'closed group leaves unrelated native employee available');
 const frozen=await close(reviewer,'group',{id:receipt.groupId});assert.deepEqual(frozen,receipt);checks++;
 await assert.rejects(run('calculate',{body,key:randomUUID()}),e=>e.code==='OWN_RUN_REOPEN_REQUIRED');checks++;
 await assert.rejects(run('calculate',{body,key:uncompletedKey}),e=>e.code==='OWN_RUN_REOPEN_REQUIRED');checks++;
 await assert.rejects(db.query('SELECT public.own_run_complete_v1($1::jsonb,$2::uuid,$3::jsonb,$4::jsonb,$5::text) AS result',[JSON.stringify(qa.actors.maker),uncompleted.id,JSON.stringify(original.input),JSON.stringify(original.result),ownRunAlgorithmHash()]),/OWN_CLOSE_REOPEN_REQUIRED/);checks++;
 await assert.rejects(liq(reviewer,'command',{key:randomUUID(),body:lc(await liq(reviewer,'detail',{id:c.id}),'annul',{kind:'contracts',values:[first]})}),e=>e.code==='OWN_LIQ_REOPEN_REQUIRED');checks++;
 const replayConfirm=await liq(reviewer,'command',{key:confirmKey,body:confirmBody});check(replayConfirm.replayed,'original committed confirmation replay stays available after close');
 const replayRun=await run('calculate',{key:c.key,body});assert.deepEqual(replayRun.saved,original);checks++;
 const secondRun=await run('calculate',{body:{...body,selection:{kind:'contracts',values:[second]}},key:randomUUID()});check(secondRun.saved.result.employeeCount===1,'unrelated legajo still calculates under its own declared scope');
 const otherType=await close(reviewer,'detail',{...query,liquidationType:'vacation'});check(otherType.rows.every(e=>e.state==='missing')&&otherType.groups.length===0,'monthly close never masquerades as vacation close');
 const remainingDetail=await close(reviewer,'detail',query),remaining=await close(reviewer,'command',{key:randomUUID(),body:command(remainingDetail,{kind:'contracts',values:[second]})});check(!remaining.snapshot.populationComplete,'two separate partial groups each preserve their actual coverage');
 let reopenedDetail=await close(reviewer,'detail',query),reopenKey=randomUUID(),reopenBody=command(reopenedDetail,{kind:'all',values:[]},{command:'reopen',groupId:receipt.groupId});
 const aliasClosed=await close(alias,'detail',query);check(aliasClosed.groups.every(g=>!g.canReopen),'same maker person never receives a reopen control');await assert.rejects(close(alias,'command',{key:randomUUID(),body:command(aliasClosed,{kind:'all',values:[]},{command:'reopen',groupId:receipt.groupId})}),e=>e.code==='OWN_CLOSE_FORBIDDEN');checks++;
 const reopened=await close(reviewer,'command',{key:reopenKey,body:reopenBody});assert.deepEqual(reopened.snapshot,receipt.snapshot);checks++;assert.deepEqual(await close(reviewer,'attempt',{key:reopenKey}),{...reopened,replayed:true});checks++;
 detail=await close(reviewer,'detail',query);check(detail.rows.find(e=>e.contractId===first).state==='confirmed'&&detail.rows.find(e=>e.contractId===second).state==='closed'&&detail.groups.some(g=>g.id===receipt.groupId&&g.state==='reopened'),'reopen only frees original complete group, keeping history and other group locked');
 await assert.rejects(close(reviewer,'command',{key:randomUUID(),body:command(detail,{kind:'all',values:[]},{command:'reopen',groupId:receipt.groupId})}),e=>e.code==='OWN_CLOSE_DECISION_INVALID');checks++;
 await liq(reviewer,'command',{key:randomUUID(),body:lc(await liq(reviewer,'detail',{id:c.id}),'annul',{kind:'contracts',values:[first]})});
 const fresh=await run('calculate',{body:{...body,selection:{kind:'contracts',values:[first]}},key:randomUUID()});await liq(reviewer,'command',{key:randomUUID(),body:lc(await liq(reviewer,'detail',{id:fresh.id}))});
 const reclosed=await close(reviewer,'command',{key:randomUUID(),body:command(await close(reviewer,'detail',query),{kind:'contracts',values:[first]})});check(reclosed.snapshot.employees[0].liquidationVersion===2&&reclosed.groupId!==receipt.groupId,'recalculation after reopening creates a new immutable close of version two');
 assert.deepEqual((await close(reviewer,'group',{id:receipt.groupId})).snapshot,receipt.snapshot);checks++;assert.deepEqual((await liq(reviewer,'detail',{id:c.id})).capture.saved,original);checks++;
 for(const statement of ['DELETE FROM own_payroll_close_event','UPDATE own_payroll_close_event SET command=command','TRUNCATE own_payroll_close_event']){await assert.rejects(db.run(statement),/OWN_CLOSE_IMMUTABLE/);checks++;}
 await assert.rejects(db.run('SELECT to_jsonb(count(*)) FROM own_payroll_close_event',true),/permission denied/);checks++;
 await db.run('DELETE FROM capabilities WHERE membership_id='+q(qa.ids.checker)+"::uuid AND capability_key='payroll.calculation.close'");
 detail=await close(reviewer,'detail',query);check(detail.rows.every(e=>!e.canClose)&&detail.groups.every(g=>!g.canReopen),'actual close permission revocation withdraws every write authority');
 await assert.rejects(close(reviewer,'command',{key:closeKey,body:closeBody}),e=>e.status===403);checks++;
 await db.run('DELETE FROM capabilities WHERE membership_id='+q(qa.ids.checker)+"::uuid AND capability_key='payroll.calculation.approve'");await assert.rejects(close(reviewer,'attempt',{key:closeKey}),e=>e.status===403);checks++;await assert.rejects(close(reviewer,'group',{id:receipt.groupId}),e=>e.status===403);checks++;
 check(new Set(db.connections).size===db.connections.length,'all commits/readbacks use separate connections');
 report={passed:true,checks,serverMajor:major,synthetic:true,committed:true,ownEmployeesWithoutGrh:2,fullRosterVerified:true,immutableHistory:true,reopenBeforeChange:true,originalReplaysPreserved:true,actualSqlRevocation:true,authenticationPrincipalFixture:true,productiveBusinessOperations:0,connections:db.connections.length};
}catch(e){report={passed:false,checks,message:e.message,cause:e.cause?.message,sqlDiagnostics:diagnostics,synthetic:true};process.exitCode=1;}
finally{if(installed){try{await db.run('DROP SCHEMA '+qa.schema+' CASCADE');report.syntheticSchemaRemoved=true;}catch(e){report.cleanupError=e.message;process.exitCode=1;}}fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
