// Complete atomic installation/repetition on synthetic committed QA only.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import {randomUUID} from 'node:crypto';
import {buildAdoptedConsumersInstallation,assertAdoptedConsumersDurability} from './lib/adopted-consumers-installation.mjs';
import {buildAdoptedConsumersInstallationQa,relocateAdoptedConsumersInstallation} from './lib/adopted-consumers-installation-qa.mjs';
import {preservationSnapshot} from './lib/native-leave-installation.mjs';import {adoptSyntheticReceiptContracts} from './lib/adopted-own-payroll-receipt-qa.mjs';
import {createOwnReceiptPsqlQa} from './lib/own-payroll-receipt-qa.mjs';import {qaLiteral as q} from './lib/own-payroll-durable-qa.mjs';
import {ownRunOperation,RUN_CALCULATE} from '../lib/internal-own-payroll-run.js';import {ownLiquidationOperation} from '../lib/internal-own-payroll-liquidation.js';import {ownCloseOperation,OWN_CLOSE_WRITE} from '../lib/internal-own-payroll-close.js';import {ownReceiptOperation} from '../lib/internal-own-payroll-receipts.js';
import {OWN_RECEIPT_PREPARE,OWN_RECEIPT_APPROVE,emptyOwnReceiptParams} from '../assets/own-payroll-receipt-model.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
export async function verifyAdoptedConsumersInstallation({major,psql,output,sourceCommit}){
 assert.ok([17,18].includes(major));assert.match(sourceCommit,/^[a-f0-9]{40}$/);const binary=fs.realpathSync(psql),expected=path.join(root,'verification','postgresql-qa-20261004','pg'+major,'pgsql','bin','psql.exe');assert.equal(binary.toLowerCase(),fs.realpathSync(expected).toLowerCase());
 const destination=path.resolve(output);assert.ok(destination.startsWith(path.join(root,'verification')+path.sep));assert.ok(!fs.existsSync(destination));fs.mkdirSync(destination);
 const env={...process.env};for(const k of Object.keys(env))if(/^PG/i.test(k))delete env[k];let step=0,checks=0;const steps=[];
 const run=(sql,error)=>{const name=String(++step).padStart(3,'0'),file=path.join(destination,name+'.sql');fs.writeFileSync(file,sql,{flag:'wx'});const r=spawnSync(binary,['-X','-q','-A','-t','--no-password','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p',String(55400+major),'-U','postgres','-d','own_payroll_run_qa','-f',file],{encoding:'utf8',maxBuffer:8*1024*1024,env,windowsHide:true});fs.writeFileSync(path.join(destination,name+'.log'),r.stdout+r.stderr);steps.push({step,expectedRejection:!!error,status:r.status});if(error){assert.equal(r.status,3,'Expected rejection at step '+name);assert.ok(r.stderr.includes('ERROR:  '+error),'Unexpected rejection: '+r.stderr.slice(-2500));return;}assert.equal(r.status,0,'SQL step '+name+' failed: '+r.stderr.slice(-3200));return r.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);};
 const batch=buildAdoptedConsumersInstallation({read,sourceCommit});const proofs=[];
 for(const scenario of ['first','upgrade']){
  const qa=buildAdoptedConsumersInstallationQa(major),{schema}=qa,relocated=relocateAdoptedConsumersInstallation(batch,qa);let seeded=false;
  const transaction=(sql,{readOnly=false,rollback=false}={})=>`BEGIN ISOLATION LEVEL REPEATABLE READ ${readOnly?'READ ONLY':''};SET LOCAL timezone='UTC';SET LOCAL statement_timeout='180s';SET LOCAL lock_timeout='2s';SET LOCAL search_path=pg_catalog,${schema},public,pg_temp;DO $local$ BEGIN ${qa.pins} END $local$;\n${sql.join(';\n')};\n${rollback?'ROLLBACK':'COMMIT'};`;
  const proof=()=>JSON.parse(run(transaction(relocated.verification,{readOnly:true}))),same=(a,b)=>{assertAdoptedConsumersDurability({installed:a,durable:b,sourceCommit});checks++;};
  const databaseProof=()=>JSON.parse(run(`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;SET LOCAL timezone='UTC';SET LOCAL statement_timeout='180s';DO $local$ BEGIN ${qa.pins} END $local$;${preservationSnapshot('after')};SELECT jsonb_build_object('fingerprint',encode(public.digest(current_setting('municontrol_sql111.after')::jsonb::text,'sha256'),'hex'),'qaSchemas',(SELECT count(*) FROM pg_namespace WHERE nspname LIKE 'mc_qa_%'));COMMIT;`));
  const prior=databaseProof();assert.equal(prior.qaSchemas,0);
  const db=createOwnReceiptPsqlQa({executable:binary,major,port:55400+major,schema,pins:qa.pins});
  const identity=(actor,caps)=>({principal:{user:{email:actor.actorEmail},tenant:{source:'membership',id:actor.tenantId,membershipId:actor.membershipId,effectiveCapabilities:caps}},session:{email:actor.actorEmail,id:actor.actorSessionId,version:actor.actorSessionVersion,releaseSha:actor.releaseSha}});
  const caps=[...new Set([...RUN_CALCULATE,...OWN_CLOSE_WRITE,...OWN_RECEIPT_PREPARE,...OWN_RECEIPT_APPROVE])],maker=identity(qa.actors.maker,caps),reviewer=identity(qa.actors.checker,caps);
  const op=(fn,actor,operation,input)=>fn(db,actor.principal,actor.session,operation,input),runOp=(operation,input)=>op(ownRunOperation,maker,operation,input),closeOp=(operation,input)=>op(ownCloseOperation,reviewer,operation,input),receiptOp=(actor,operation,input)=>op(ownReceiptOperation,actor,operation,input);
  const params=period=>({...emptyOwnReceiptParams(period),issuer:{name:'Municipio exclusivamente sintético QA',taxId:'30990000001',address:'Domicilio inventado 123'},legend:'No corresponde a haberes municipales'});
  const receiptBody=p=>({command:'prepare',scopeVersion:p.scopeVersion,sourceVersion:p.snapshot.sourceVersion,params:p.snapshot.params,batchId:null,batchSha256:null,reason:'Preparación sintética conservada durante instalación',reviewConfirmed:false});
  const cycle=async period=>{
   const boot=await runOp('bootstrap'),body={period,liquidationType:'monthly',selection:{kind:'all',values:[]},scopeVersion:boot.scopeVersion,programVersion:boot.programVersion,populationDomain:'native_registered'},key=randomUUID(),capture=await runOp('calculate',{key,body});
   const detail=await op(ownLiquidationOperation,reviewer,'detail',{id:capture.id}),decision={runId:capture.id,resultSha256:detail.capture.saved.resultSha256,scopeVersion:detail.scopeVersion,stateVersion:detail.stateVersion,command:'confirm',selection:{kind:'all',values:[]},reason:'Confirmación exclusivamente sintética QA',reviewConfirmed:true};await op(ownLiquidationOperation,reviewer,'command',{key:randomUUID(),body:decision});
   const d=await closeOp('detail',{period,liquidationType:'monthly'}),closeBody={period,liquidationType:'monthly',scopeVersion:d.scopeVersion,stateVersion:d.stateVersion,selection:{kind:'all',values:[]},command:'close',groupId:null,reason:'Cierre exclusivamente sintético QA',reviewConfirmed:true},closeKey=randomUUID(),closed=await closeOp('command',{key:closeKey,body:closeBody});
   const preview=await receiptOp(maker,'preview',{params:params(period)}),command=receiptBody(preview),receiptKey=randomUUID(),event=await receiptOp(maker,'command',{key:receiptKey,body:command}),stored=await receiptOp(maker,'batch',{id:event.batchId});
   return {capture,key,body,closed,closeKey,closeBody,preview,receiptKey,command,event,stored};
  };
  try{
   run(qa.sql);seeded=true;const old=await cycle('2026-10');assert.equal(old.preview.snapshot.version,'own-receipt-snapshot.v1');assert.equal(old.preview.snapshot.recordCount,26);checks+=2;
   if(scenario==='upgrade'){run(transaction(relocated.baseStatements));await adoptSyntheticReceiptContracts(db,qa);assert.equal(await db.run('SELECT to_jsonb(count(*)) FROM employment_adoption_application'),3);checks++;}
   const beforeFault=databaseProof();run(transaction([...relocated.statements,"DO $fault$ BEGIN RAISE EXCEPTION 'QA_ADOPTED_CONSUMERS_COMMIT_INTERRUPTED';END $fault$"]),'QA_ADOPTED_CONSUMERS_COMMIT_INTERRUPTED');assert.deepEqual(databaseProof(),beforeFault);checks++;
   const installed=JSON.parse(run(transaction(relocated.statements)));assert.equal(installed.mode,scenario);checks++;same(installed,proof());same(installed,JSON.parse(run(transaction(relocated.statements))));
   assert.deepEqual(await receiptOp(maker,'batch',{id:old.event.batchId}),old.stored);assert.deepEqual((await runOp('calculate',{key:old.key,body:old.body})).saved,old.capture.saved);assert.deepEqual(await closeOp('command',{key:old.closeKey,body:old.closeBody}),{...old.closed,replayed:true});checks+=3;
   const oldReplay=await receiptOp(maker,'attempt',{key:old.receiptKey});assert.equal(oldReplay.batchId,old.event.batchId);assert.equal(oldReplay.snapshotSha256,old.event.snapshotSha256);checks+=2;
   if(scenario==='first')await adoptSyntheticReceiptContracts(db,qa);
   const owned=await cycle('2026-11');assert.equal(owned.preview.snapshot.version,'own-receipt-snapshot.v2');assert.equal(owned.preview.snapshot.recordCount,29);assert.ok(owned.preview.snapshot.records.some(r=>r.employeeNumber==='A/3501'));checks+=3;
   const review={command:'approve',scopeVersion:(await receiptOp(reviewer,'list',{period:'2026-11'})).scopeVersion,sourceVersion:owned.stored.snapshot.sourceVersion,params:null,batchId:owned.event.batchId,batchSha256:owned.stored.snapshotSha256,reason:'Revisión independiente exclusivamente sintética QA',reviewConfirmed:true};await receiptOp(reviewer,'command',{key:randomUUID(),body:review});assert.equal((await receiptOp(reviewer,'batch',{id:owned.event.batchId})).state,'approved');checks++;
   const history=proof();assert.equal(history.counts.employment_adoption_application.count,3);checks++;same(history,JSON.parse(run(transaction(relocated.statements))));same(history,proof());
   const failures=[
    ['ALTER FUNCTION own_receipt_snapshot_v1(jsonb,jsonb) COST 101','ADOPTED_CONSUMERS_AFTER_METADATA'],
    ['GRANT EXECUTE ON FUNCTION employment_adoption_decide_v1(jsonb,jsonb,uuid) TO municontrol_actions_runtime_app','ADOPTION_INSTALL_FUNCTION_METADATA'],
    ['GRANT EXECUTE ON FUNCTION payroll_fixed_registry_subject_v2(jsonb,uuid,boolean) TO municontrol_actions_runtime_app','ADOPTED_CONSUMERS_HELPER_METADATA'],
    ['ALTER FUNCTION payroll_fixed_registry_subject_v2(jsonb,uuid,boolean) RENAME TO missing_subject','ADOPTED_CONSUMERS_PARTIAL_STATE'],
    ['CREATE FUNCTION '+schema+'.payroll_fixed_registry_unreviewed_v2() RETURNS void LANGUAGE sql AS '+q('SELECT NULL::void'),'ADOPTED_CONSUMERS_PARTIAL_STATE'],
    ['ALTER TABLE payroll_novelty_row DROP CONSTRAINT payroll_novelty_row_legajo_ck','ADOPTED_CONSUMERS_MONTHLY_SHAPE_CHANGED'],
    ['ALTER TABLE employment_adoption_proposal ADD COLUMN unexpected text','ADOPTION_INSTALL_TABLE_METADATA'],
    ['ALTER FUNCTION native_employment_lifecycle_context_v1(jsonb,text) COST 101','ADOPTED_CONSUMERS_PREREQUISITE_METADATA'],
    ["DO $drift$ DECLARE d text;BEGIN SELECT pg_get_functiondef('own_close_roster_v1(jsonb,text)'::regprocedure) INTO d;EXECUTE replace(d,'BEGIN','BEGIN /* altered body */');END $drift$",'ADOPTED_CONSUMERS_AFTER_METADATA'],
   ];
   for(const[mutation,error]of failures){run(transaction([mutation,...relocated.statements],{rollback:true}),error);checks++;same(history,proof());}
   const boundary=relocated.statements.indexOf(qa.normalized(batch.after));assert.ok(boundary>0);run(transaction([...relocated.statements.slice(0,boundary),'ALTER TABLE payroll_novelty_row ADD COLUMN unexpected text',...relocated.statements.slice(boundary)],{rollback:true}),'ADOPTED_CONSUMERS_PRIOR_STATE_CHANGED');checks++;same(history,proof());
   run(transaction([...relocated.statements.slice(0,boundary),`INSERT INTO capabilities VALUES(${q(qa.ids.maker)}::uuid,'invented.qa.capability')`,...relocated.statements.slice(boundary)],{rollback:true}),'ADOPTED_CONSUMERS_PRIOR_STATE_CHANGED');checks++;same(history,proof());
   assert.deepEqual(await receiptOp(maker,'batch',{id:old.event.batchId}),old.stored);assert.deepEqual(await closeOp('command',{key:old.closeKey,body:old.closeBody}),{...old.closed,replayed:true});checks+=2;
   proofs.push({scenario,installed,retainedHistory:history,rollbackVerified:true,negativeCases:11,originalReceiptPreserved:true,ownedReceiptCount:29});
  }finally{if(seeded)run(`BEGIN;DO $local$ BEGIN ${qa.pins} END $local$;DROP SCHEMA ${schema} CASCADE;COMMIT;`);}
  assert.deepEqual(databaseProof(),prior,'QA changed objects or rows outside its exact synthetic schema');checks++;
 }
 const report={passed:true,sourceCommit,serverMajor:major,checks,synthetic:true,scenarios:proofs,installationConnectionSteps:step,steps,independentConnections:true,firstAndUpgradeVerified:true,repeatWithExistingReceipts:true,priorStatePreserved:true,roleAssignmentsAdded:0,nominalRowsReturned:0,municipalWrites:false,productiveBusinessOperations:0};fs.writeFileSync(path.join(destination,'result.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args={};for(const a of process.argv.slice(2)){const m=/^--(major|psql|output|source-commit)=(.+)$/.exec(a);assert.ok(m);assert.equal(args[m[1]],undefined);args[m[1]]=m[2];}
 try{const r=await verifyAdoptedConsumersInstallation({major:Number(args.major),psql:args.psql,output:args.output,sourceCommit:args['source-commit']});console.log(JSON.stringify({passed:r.passed,serverMajor:r.serverMajor,checks:r.checks,installationConnections:r.installationConnectionSteps,synthetic:true,productiveBusinessOperations:0}));}
 catch(e){console.error(JSON.stringify({passed:false,message:e.message}));process.exitCode=1;}
}
