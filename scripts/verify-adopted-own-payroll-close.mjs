// Complete synthetic cycle, committed between independent loopback connections.
// No municipal database URL or endpoint, permissions or production writes.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {randomUUID} from 'node:crypto';
import {buildAdoptedOwnCloseQa} from './lib/adopted-own-payroll-close-qa.mjs';
import {createOwnClosePsqlQa} from './lib/own-payroll-close-qa.mjs';
import {qaLiteral as q} from './lib/own-payroll-durable-qa.mjs';
import {ownRunOperation,RUN_CALCULATE} from '../lib/internal-own-payroll-run.js';
import {ownLiquidationOperation} from '../lib/internal-own-payroll-liquidation.js';
import {ownCloseOperation,OWN_CLOSE_WRITE} from '../lib/internal-own-payroll-close.js';
import {ownCloseSnapshot} from '../assets/own-payroll-close-model.js';
import {ownReportBundle,ownReportDocument,emptyOwnReportFilters,verifiedOwnReportBundle} from '../assets/own-payroll-report-model.js';
import {reportCsv,reportXlsx,reportPdf} from '../assets/report-document.js';
const root=fs.realpathSync(new URL('../verification/',import.meta.url)),args={};
for(const a of process.argv.slice(2)){const m=/^--(major|psql|output)=(.+)$/.exec(a);assert.ok(m);assert.equal(args[m[1]],undefined);args[m[1]]=m[2];}
const major=Number(args.major);assert.ok([17,18].includes(major));
const output=path.resolve(args.output),parent=fs.realpathSync(path.dirname(output)),relative=path.relative(root,parent);
assert.ok(!relative.startsWith('..')&&!path.isAbsolute(relative)&&!fs.existsSync(output));
const qa=buildAdoptedOwnCloseQa(major),execute=promisify(execFile),executable=args.psql??'psql';
const db=createOwnClosePsqlQa({executable,major,port:55400+major,schema:qa.schema,pins:qa.pins});
const prefix=output.replace(/\.json$/,''),seed=prefix+'-seed.sql';fs.writeFileSync(seed,qa.sql,{flag:'wx'});
const identity=(actor,caps)=>({principal:{user:{email:actor.actorEmail},tenant:{source:'membership',id:actor.tenantId,membershipId:actor.membershipId,effectiveCapabilities:caps}},session:{email:actor.actorEmail,id:actor.actorSessionId,version:actor.actorSessionVersion,releaseSha:actor.releaseSha}});
let installed=false,checks=0,report;const check=(v,label)=>{assert.ok(v,label);checks++;};
try{
 const initial=await execute(executable,[...db.args,'-f',seed],{windowsHide:true,maxBuffer:4*1024*1024,timeout:90000});installed=true;fs.writeFileSync(prefix+'-seed.log',initial.stdout+initial.stderr);
 const maker=identity(qa.actors.maker,RUN_CALCULATE),reviewer=identity(qa.actors.checker,OWN_CLOSE_WRITE),alias=identity(qa.actors.samePerson,OWN_CLOSE_WRITE);
 const run=(op,input)=>ownRunOperation(db,maker.principal,maker.session,op,input),liq=(actor,op,input)=>ownLiquidationOperation(db,actor.principal,actor.session,op,input),close=(actor,op,input)=>ownCloseOperation(db,actor.principal,actor.session,op,input);
 const boot=await run('bootstrap'),body=(period,selection={kind:'all',values:[]})=>({period,liquidationType:'monthly',selection,scopeVersion:boot.scopeVersion,programVersion:boot.programVersion,populationDomain:'native_registered'});
 const query={period:'2026-11',liquidationType:'monthly'};
 const lc=(d,command='confirm',selection={kind:'all',values:[]})=>({runId:d.id,resultSha256:d.capture.saved.resultSha256,scopeVersion:d.scopeVersion,stateVersion:d.stateVersion,command,selection,reason:'Decisión inventada para regresión sintética QA',reviewConfirmed:true});
 const cc=(d,selection={kind:'all',values:[]},patch={})=>({period:d.period,liquidationType:d.liquidationType,scopeVersion:d.scopeVersion,stateVersion:d.stateVersion,selection,command:'close',groupId:null,reason:'Cierre exclusivamente sintético QA',reviewConfirmed:true,...patch});
 const old=await run('calculate',{key:randomUUID(),body:body('2026-10')});await liq(reviewer,'command',{key:randomUUID(),body:lc(await liq(reviewer,'detail',{id:old.id}))});
 const oldDetail=await close(reviewer,'detail',{period:'2026-10',liquidationType:'monthly'}),oldBody=cc(oldDetail),oldKey=randomUUID();
 const oldClose=await close(reviewer,'command',{key:oldKey,body:oldBody});check(oldClose.snapshot.populationComplete,'baseline close covers the complete original own roster');
 const before=await db.run("SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid='"+qa.schema+".own_close_roster_v1(jsonb,text)'::regprocedure");
 // SQL132/133 adoption is private, authorized only inside this synthetic QA.
 const j=v=>q(JSON.stringify(v))+'::jsonb',mk=j(qa.actors.maker),ck=j(qa.actors.checker);
 const install=qa.metadata+'\n'+qa.adaptation;
 fs.writeFileSync(prefix+'-adaptation.sql',db.prefix+'\n'+install+'\nCOMMIT;',{flag:'wx'});
 await db.run(install);
 check(JSON.stringify(before)===JSON.stringify(await db.run("SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid='"+qa.schema+".own_close_roster_v1(jsonb,text)'::regprocedure")),'roster OID/owner/ACL/settings/arguments unchanged');
 const adoption=`DO $adopt$ DECLARE source jsonb;boot jsonb;context_hash text;versions jsonb;rows_value jsonb;body jsonb;saved jsonb;stage jsonb;BEGIN
 source:=employment_adoption_source_v1(${mk});boot:=employment_adoption_bootstrap_v1(${mk});
 context_hash:=employment_adoption_hash_v1(jsonb_build_object('scope',source->'scope','source',source->'source'));
 SELECT jsonb_agg(jsonb_build_object('contractId',r.v->>'contractId','contractVersion',employment_adoption_hash_v1(jsonb_build_object('sourceContextVersion',context_hash,'row',r.v))) ORDER BY r.n) INTO versions FROM jsonb_array_elements(source->'rows') WITH ORDINALITY r(v,n);
 SELECT jsonb_agg(v||jsonb_build_object('jurisdictionCode','42') ORDER BY v->>'contractId') INTO rows_value FROM jsonb_array_elements(versions) v;
 body:=jsonb_build_object('sourceContextVersion',context_hash,'selectionVersion',employment_adoption_hash_v1(versions),'catalogVersion',boot->>'catalogVersion','rows',rows_value,'legalReference','Resolución inventada QA','reason','Adopción de contratos exclusivamente sintéticos QA');
 saved:=employment_adoption_propose_v1(${mk},body,gen_random_uuid());stage:=employment_adoption_decision_source_v1(${ck},(saved#>>'{receipt,proposalId}')::uuid);
 PERFORM employment_adoption_decide_v1(${ck},jsonb_build_object('reviewVersion',stage->>'reviewVersion','review',jsonb_build_object('proposalId',saved#>>'{receipt,proposalId}','proposalVersion',saved#>>'{receipt,proposalVersion}','sourceContextVersion',context_hash,'catalogVersion',boot->>'catalogVersion','decision','approve','reason','Revisión independiente de adopción sintética QA')),gen_random_uuid());END $adopt$`;
 await db.run(adoption);
 check((await db.run("SELECT to_jsonb(count(*)) FROM employment_adoption_application"))===3,'three original synthetic contracts become approved owned registrations');
 const originalStored=await close(reviewer,'group',{id:oldClose.groupId});assert.deepEqual(originalStored,{...oldClose,replayed:true});checks++;
 assert.deepEqual(await close(reviewer,'command',{key:oldKey,body:oldBody}),{...oldClose,replayed:true});checks++;
 assert.deepEqual((await run('calculate',{key:old.key,body:old.body})).saved,old.saved);checks++;
 const capture=await run('calculate',{key:randomUUID(),body:body(query.period)});
 check(capture.saved.input.employees.length===qa.completePopulation&&capture.saved.input.employees.some(e=>e.employeeNumber==='A/3501'),'capture and JS calculation include all adopted and original UUIDs');
 await liq(reviewer,'command',{key:randomUUID(),body:lc(await liq(reviewer,'detail',{id:capture.id}))});
 let d=await close(reviewer,'detail',query);check(d.rows.length===qa.completePopulation&&d.rows.every(r=>r.canClose),'full confirmed roster includes adopted employees with exact source identifiers');
 const partialBefore=structuredClone(d),selected={kind:'contracts',values:[qa.ids.targetContract]},key=randomUUID(),command=cc(d,selected),expected=ownCloseSnapshot(d,selected);
 const samePerson=await close(alias,'detail',query);check(samePerson.rows.every(r=>!r.canClose),'same maker person under another membership cannot close');
 await assert.rejects(close(alias,'command',{key:randomUUID(),body:cc(samePerson,selected)}),e=>e.code==='OWN_CLOSE_DECISION_INVALID');checks++;
 const partial=await close(reviewer,'command',{key,body:command});assert.deepEqual(partial.snapshot,expected);checks++;
 check(partial.snapshot.employeeCount===1&&partial.snapshot.populationCount===qa.completePopulation&&!partial.snapshot.populationComplete&&partial.snapshot.employees[0].employeeNumber==='A/3501','selected opaque legajo retains partial census coverage');
 assert.deepEqual(await close(reviewer,'attempt',{key}),{...partial,replayed:true});checks++;
 await assert.rejects(close(reviewer,'command',{key,body:{...command,reason:'Otro motivo inventado'}}),e=>e.code==='OWN_CLOSE_IDEMPOTENCY_REUSE');checks++;
 await assert.rejects(run('calculate',{key:randomUUID(),body:body(query.period,selected)}),e=>e.code==='OWN_RUN_REOPEN_REQUIRED');checks++;
 d=await close(reviewer,'detail',query);
 for(const selection of [{kind:'all',values:[]},{kind:'departments',values:['20']}]){await assert.rejects(close(reviewer,'command',{key:randomUUID(),body:cc(d,selection)}),e=>e.code==='OWN_CLOSE_DECISION_INVALID');checks++;}
 const reopened=await close(reviewer,'command',{key:randomUUID(),body:cc(d,{kind:'all',values:[]},{command:'reopen',groupId:partial.groupId})});assert.deepEqual(reopened.snapshot,partial.snapshot);checks++;
 await liq(reviewer,'command',{key:randomUUID(),body:lc(await liq(reviewer,'detail',{id:capture.id}),'annul',selected)});
 const recalculated=await run('calculate',{key:randomUUID(),body:body(query.period,selected)});
 await liq(reviewer,'command',{key:randomUUID(),body:lc(await liq(reviewer,'detail',{id:recalculated.id}))});
 d=await close(reviewer,'detail',query);check(d.rows.find(r=>r.contractId===qa.ids.targetContract).liquidationVersion===2&&d.rows.every(r=>r.canClose),'reopen, annul and recalculate preserve history and advance only the selected version');
 const wholeBody=cc(d,{kind:'departments',values:['20']}),wholeKey=randomUUID(),whole=await close(reviewer,'command',{key:wholeKey,body:wholeBody});assert.deepEqual(whole.snapshot,ownCloseSnapshot(d,wholeBody.selection));checks++;
 check(whole.snapshot.employeeCount===qa.completePopulation&&whole.snapshot.populationComplete&&new Set(whole.snapshot.employees.map(e=>e.runId)).size===2,'department close retains all confirmed versions from both runs');
 const finalDetail=await close(reviewer,'detail',query),storedGroup=await close(reviewer,'group',{id:whole.groupId}),bundle=await verifiedOwnReportBundle({from:query.period,to:query.period,types:['monthly']},[finalDetail],[storedGroup]);
 check(finalDetail.rows.every(r=>r.state==='closed')&&bundle.employees.length===qa.completePopulation,'whole roster close feeds current complete reports');
 const rawReport=JSON.stringify(bundle);
 for(const view of ['payroll','summary','concepts','statistics','sources']){const document=ownReportDocument(bundle,emptyOwnReportFilters(),view);for(const format of [reportCsv,reportXlsx,reportPdf])check(format(document).length>100,'complete '+view+' export');}
 check(ownReportDocument(bundle,emptyOwnReportFilters(),'payroll','concept',selected.values).rows[0][2]==='A/3501','exact filter uses retained municipal UUID rather than inferred numeric legajo');
 check(JSON.stringify(bundle)===rawReport,'exports never change original decisions or saved sources');
 await assert.rejects(db.run(qa.relocate(fs.readFileSync(new URL('./migrations/141-adopted-own-payroll-close.sql',import.meta.url),'utf8'))),/OWN_CLOSE_ADOPTION_DEFINITION_CHANGED/);checks++;
 await db.run('DELETE FROM capabilities WHERE membership_id='+q(qa.ids.checker)+"::uuid AND capability_key='payroll.calculation.close'");
 const revoked=await close(reviewer,'detail',query);check(!revoked.canWrite&&revoked.groups.every(g=>!g.canReopen),'actual permission revocation withdraws close and reopen authority');
 await assert.rejects(close(reviewer,'command',{key:wholeKey,body:wholeBody}),e=>e.status===403);checks++;
 await db.run('DELETE FROM capabilities WHERE membership_id='+q(qa.ids.checker)+"::uuid AND capability_key='payroll.calculation.approve'");
 await assert.rejects(close(reviewer,'group',{id:whole.groupId}),e=>e.status===403);checks++;
 fs.writeFileSync(prefix+'-fixture.json',JSON.stringify({synthetic:true,actor:qa.actors.checker,partialBefore,before:d,detail:finalDetail,receipt:storedGroup,partial,old:oldClose,reopened,captures:[capture,recalculated]},null,2),{flag:'wx'});
 report={passed:true,synthetic:true,major,checks,separateConnections:db.connections.length,completePopulation:qa.completePopulation,oldClosesAndPendingKeysPreserved:true,municipalInstallation:false,payrollPosted:false,paymentExecuted:false};
}catch(e){report={passed:false,synthetic:true,major,checks,message:e.message,cause:e.cause?.message,sqlDetail:e.cause?.stderr?.slice(0,2400)};process.exitCode=1;}
finally{if(installed)try{await db.run('DROP SCHEMA '+qa.schema+' CASCADE');}catch(e){report.cleanupError=e.message;process.exitCode=1;}fs.writeFileSync(output,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report));}
