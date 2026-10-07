// Complete synthetic cycle, committed between independent loopback connections.
// No municipal database URL or endpoint, permissions or production writes.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {randomUUID} from 'node:crypto';
import {buildAdoptedOwnReceiptQa,adoptSyntheticReceiptContracts} from './lib/adopted-own-payroll-receipt-qa.mjs';
import {createOwnReceiptPsqlQa} from './lib/own-payroll-receipt-qa.mjs';
import {ownReceiptOperation} from '../lib/internal-own-payroll-receipts.js';
import {OWN_RECEIPT_PREPARE,OWN_RECEIPT_SELF,emptyOwnReceiptParams} from '../assets/own-payroll-receipt-model.js';
import {createOwnReceiptPdf} from '../assets/own-payroll-receipt-pdf.js';
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
const qa=buildAdoptedOwnReceiptQa(major),execute=promisify(execFile),executable=args.psql??'psql';
const db=createOwnReceiptPsqlQa({executable,major,port:55400+major,schema:qa.schema,pins:qa.pins});
let sqlDiagnostic;const originalQuery=db.query;db.query=async(...args)=>{try{return await originalQuery(...args);}catch(error){sqlDiagnostic={message:error.message,stderr:error.stderr?.slice(0,2400)};throw error;}};
const prefix=output.replace(/\.json$/,''),seed=prefix+'-seed.sql';fs.writeFileSync(seed,qa.sql,{flag:'wx'});
const identity=(actor,caps)=>({principal:{user:{email:actor.actorEmail},tenant:{source:'membership',id:actor.tenantId,membershipId:actor.membershipId,effectiveCapabilities:caps}},session:{email:actor.actorEmail,id:actor.actorSessionId,version:actor.actorSessionVersion,releaseSha:actor.releaseSha}});
let installed=false,checks=0,report;const eventSame=(actual,expected)=>{assert.equal(Date.parse(actual.recordedAt),Date.parse(expected.recordedAt));assert.deepEqual({...actual,recordedAt:null},{...expected,recordedAt:null});};const check=(v,label)=>{assert.ok(v,label);checks++;};
try{
 const initial=await execute(executable,[...db.args,'-f',seed],{windowsHide:true,maxBuffer:4*1024*1024,timeout:90000});installed=true;fs.writeFileSync(prefix+'-seed.log',initial.stdout+initial.stderr);
 const maker=identity(qa.actors.maker,RUN_CALCULATE),reviewer=identity(qa.actors.checker,OWN_CLOSE_WRITE),alias=identity(qa.actors.samePerson,OWN_CLOSE_WRITE);
 const run=(op,input)=>ownRunOperation(db,maker.principal,maker.session,op,input),liq=(actor,op,input)=>ownLiquidationOperation(db,actor.principal,actor.session,op,input),close=(actor,op,input)=>ownCloseOperation(db,actor.principal,actor.session,op,input);
 const receipt=(actor,op,input)=>ownReceiptOperation(db,actor.principal,actor.session,op,input);
 const receiptParams=period=>({...emptyOwnReceiptParams(period),issuer:{name:'Municipio exclusivamente sintético QA',taxId:'30990000001',address:'Domicilio inventado 123'},legend:'Documento exclusivamente sintético QA'});
 const receiptBody=p=>({command:'prepare',scopeVersion:p.scopeVersion,sourceVersion:p.snapshot.sourceVersion,params:p.snapshot.params,batchId:null,batchSha256:null,reason:'Preparación exclusivamente sintética QA',reviewConfirmed:false});
 const boot=await run('bootstrap'),body=(period,selection={kind:'all',values:[]})=>({period,liquidationType:'monthly',selection,scopeVersion:boot.scopeVersion,programVersion:boot.programVersion,populationDomain:'native_registered'});
 const query={period:'2026-11',liquidationType:'monthly'};
 const lc=(d,command='confirm',selection={kind:'all',values:[]})=>({runId:d.id,resultSha256:d.capture.saved.resultSha256,scopeVersion:d.scopeVersion,stateVersion:d.stateVersion,command,selection,reason:'Decisión inventada para regresión sintética QA',reviewConfirmed:true});
 const cc=(d,selection={kind:'all',values:[]},patch={})=>({period:d.period,liquidationType:d.liquidationType,scopeVersion:d.scopeVersion,stateVersion:d.stateVersion,selection,command:'close',groupId:null,reason:'Cierre exclusivamente sintético QA',reviewConfirmed:true,...patch});
 const old=await run('calculate',{key:randomUUID(),body:body('2026-10')});await liq(reviewer,'command',{key:randomUUID(),body:lc(await liq(reviewer,'detail',{id:old.id}))});
 const oldDetail=await close(reviewer,'detail',{period:'2026-10',liquidationType:'monthly'}),oldBody=cc(oldDetail),oldKey=randomUUID();
 const oldClose=await close(reviewer,'command',{key:oldKey,body:oldBody});
 const oldReceiptPreview=await receipt(maker,'preview',{params:receiptParams('2026-10')}),oldReceiptBody=receiptBody(oldReceiptPreview),oldReceiptKey=randomUUID(),oldReceiptEvent=await receipt(maker,'command',{key:oldReceiptKey,body:oldReceiptBody}),oldReceiptBatch=await receipt(maker,'batch',{id:oldReceiptEvent.batchId});
 check(oldReceiptBatch.snapshot.recordCount===26&&oldReceiptBatch.snapshot.version==='own-receipt-snapshot.v1','original numeric receipts prepared before adapter');
 check(oldClose.snapshot.populationComplete,'baseline close covers the complete original own roster');
 const before=await db.run("SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid='"+qa.schema+".own_close_roster_v1(jsonb,text)'::regprocedure");
 // SQL132/133 adoption is private, authorized only inside this synthetic QA.
 const j=v=>q(JSON.stringify(v))+'::jsonb',mk=j(qa.actors.maker),ck=j(qa.actors.checker);
 const receiptMetadataQuery="SELECT jsonb_agg(to_jsonb(p)-'prosrc' ORDER BY p.proname) FROM pg_proc p WHERE p.oid IN('"+qa.schema+".own_receipt_params_v1(jsonb)'::regprocedure,'"+qa.schema+".own_receipt_snapshot_v1(jsonb,jsonb)'::regprocedure,'"+qa.schema+".own_receipt_self_v1(jsonb)'::regprocedure)",receiptMetadataBefore=await db.run(receiptMetadataQuery);
 const install=qa.metadata+'\n'+qa.adaptation;
 fs.writeFileSync(prefix+'-adaptation.sql',db.prefix+'\n'+install+'\nCOMMIT;',{flag:'wx'});
 await db.run(install);assert.deepEqual(await db.run(receiptMetadataQuery),receiptMetadataBefore);checks++;
 check(JSON.stringify(before)===JSON.stringify(await db.run("SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid='"+qa.schema+".own_close_roster_v1(jsonb,text)'::regprocedure")),'roster OID/owner/ACL/settings/arguments unchanged');
 await adoptSyntheticReceiptContracts(db,qa);

 check((await db.run("SELECT to_jsonb(count(*)) FROM employment_adoption_application"))===3,'three original synthetic contracts become approved owned registrations');
 const oldReceiptAfter=await receipt(maker,'batch',{id:oldReceiptEvent.batchId});assert.deepEqual(oldReceiptAfter,oldReceiptBatch);checks++;
 eventSame(await receipt(maker,'attempt',{key:oldReceiptKey}),{...oldReceiptEvent,replayed:true});checks++;
 assert.deepEqual((await receipt(maker,'preview',{params:receiptParams('2026-10')})).snapshot,oldReceiptPreview.snapshot);checks++;
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

 const fullPreview=await receipt(maker,'preview',{params:receiptParams(query.period)});check(fullPreview.snapshot.recordCount===29&&fullPreview.snapshot.version==='own-receipt-snapshot.v2','all owned and adopted receipts, complete original concepts');
 const numericTies=fullPreview.snapshot.records.filter(r=>['901','0901'].includes(r.employeeNumber));check(numericTies.length===2&&new Set(numericTies.map(r=>r.contractId)).size===2,'raw leading zero adopted identifiers remain distinct');assert.deepEqual(numericTies.map(r=>r.contractId),numericTies.map(r=>r.contractId).sort());checks++;
 check(fullPreview.snapshot.records.some(r=>r.employeeNumber==='A/3501'&&r.dni&&r.cuil),'raw opaque identifier and declared synthetic adopted identity');
 const completePdf=await createOwnReceiptPdf(fullPreview.snapshot,{preview:true});check(completePdf.recordCount===29&&completePdf.pageCount>=29,'complete PDF includes more than one UI page');
 await assert.rejects(receipt(maker,'preview',{params:{...receiptParams(query.period),filters:{...emptyOwnReportFilters(),employeeFrom:'1'}}}),e=>e.code==='OWN_RECEIPT_RANGE_INVALID');checks++;
 await assert.rejects(receipt(maker,'preview',{params:{...receiptParams(query.period),contracts:[randomUUID()]}}),e=>e.code==='OWN_RECEIPT_SELECTION_INVALID');checks++;
 const exactPreview=await receipt(maker,'preview',{params:{...receiptParams(query.period),contracts:selected.values}});check(exactPreview.snapshot.recordCount===1&&exactPreview.snapshot.records[0].employeeNumber==='A/3501','exact UUID selection retains entire source census');
 const fullReceiptBody=receiptBody(fullPreview),fullReceiptKey=randomUUID(),fullEvent=await receipt(maker,'command',{key:fullReceiptKey,body:fullReceiptBody}),fullBatch=await receipt(maker,'batch',{id:fullEvent.batchId});
 assert.deepEqual(fullBatch.snapshot,fullPreview.snapshot);checks++;
 eventSame(await receipt(maker,'attempt',{key:fullReceiptKey}),{...fullEvent,replayed:true});checks++;
 await assert.rejects(receipt(maker,'command',{key:fullReceiptKey,body:{...fullReceiptBody,params:exactPreview.snapshot.params}}),e=>e.code==='OWN_RECEIPT_IDEMPOTENCY_REUSE');checks++;
 check(!(await receipt(alias,'batch',{id:fullEvent.batchId})).permissions.canApprove,'same person membership cannot approve own receipts');
 const receiptReview={command:'approve',scopeVersion:(await receipt(reviewer,'list',{period:query.period})).scopeVersion,sourceVersion:fullBatch.snapshot.sourceVersion,params:null,batchId:fullEvent.batchId,batchSha256:fullBatch.snapshotSha256,reason:'Revisión independiente exclusivamente sintética QA',reviewConfirmed:true};
 await receipt(reviewer,'command',{key:randomUUID(),body:receiptReview});const approved=await receipt(reviewer,'batch',{id:fullEvent.batchId});check(approved.state==='approved','independent receipt approval saved durably');
 const exactBody=receiptBody(exactPreview),exactKey=randomUUID(),exactEvent=await receipt(maker,'command',{key:exactKey,body:exactBody}),exactBatch=await receipt(maker,'batch',{id:exactEvent.batchId});check(exactBatch.snapshot.recordCount===1,'selected receipt preparation remains independent of full batch');
 await assert.rejects(receipt(identity(qa.actors.outsider,OWN_RECEIPT_PREPARE),'batch',{id:fullEvent.batchId}),e=>e.status===404);checks++;
 const selfFixtures=[];
 for(const [name,target]of [['maker',qa.ids.targetContract],['checker',fullBatch.snapshot.records.find(r=>r.employeeNumber==='19041').contractId]]){
  await db.run('UPDATE tenant_action_employment_link SET employment_contract_id='+q(target)+'::uuid WHERE membership_id='+q(qa.ids[name])+"::uuid;INSERT INTO capabilities VALUES("+q(qa.ids[name])+"::uuid,'payroll.receipt.self.read')");
  const actor=identity(qa.actors[name],OWN_RECEIPT_SELF),self=await receipt(actor,'self');check(self.items.length===1&&self.items[0].record.contractId===target,'linked '+name+' sees only own approved receipt');
  check(!JSON.stringify(self).includes('contracts')&&!JSON.stringify(self).includes('populationCount')&&!JSON.stringify(self).includes('selectedCount'),'self has no population/selection disclosure');
  check((await createOwnReceiptPdf(self,{self:true})).recordCount===1,'individual PDF for '+name);selfFixtures.push(self);
  await db.run('UPDATE tenant_action_employment_link SET active=false WHERE membership_id='+q(qa.ids[name])+'::uuid');await assert.rejects(receipt(actor,'self'),e=>e.status===403);checks++;
  await db.run('UPDATE tenant_action_employment_link SET active=true WHERE membership_id='+q(qa.ids[name])+'::uuid');
  await db.run('DELETE FROM capabilities WHERE membership_id='+q(qa.ids[name])+"::uuid AND capability_key='payroll.receipt.self.read'");await assert.rejects(receipt(actor,'self'),e=>e.status===403);checks++;
  await db.run('UPDATE tenant_action_employment_link SET employment_contract_id='+q(qa.ids[name+'Contract'])+'::uuid WHERE membership_id='+q(qa.ids[name])+'::uuid');
 }
 const storedDetail=await close(reviewer,'detail',query);
 await close(reviewer,'command',{key:randomUUID(),body:cc(storedDetail,{kind:'all',values:[]},{command:'reopen',groupId:whole.groupId})});
 const invalidated=await receipt(reviewer,'batch',{id:fullEvent.batchId});check(!invalidated.sourceCurrent&&!invalidated.permissions.canDownload&&invalidated.snapshotSha256===approved.snapshotSha256,'reopened source withdraws PDF without changing receipt');
 assert.deepEqual(await receipt(maker,'command',{key:fullReceiptKey,body:fullReceiptBody}),{...fullEvent,replayed:true});checks++;
 await assert.rejects(receipt(reviewer,'command',{key:randomUUID(),body:{...receiptReview,batchId:exactEvent.batchId,batchSha256:exactBatch.snapshotSha256}}),e=>e.code==='OWN_RECEIPT_DECISION_INVALID');checks++;
 await receipt(reviewer,'command',{key:randomUUID(),body:{...receiptReview,command:'withdraw'}});check((await receipt(reviewer,'batch',{id:fullEvent.batchId})).state==='withdrawn','withdrawal preserves reviewed receipt');
 await assert.rejects(db.run(qa.relocate(fs.readFileSync(new URL('./migrations/142-adopted-own-payroll-receipts.sql',import.meta.url),'utf8'))),/OWN_RECEIPT_ADOPTION_DEFINITION_CHANGED/);checks++;
 for(const statement of ['UPDATE own_payroll_receipt_event SET command=command','DELETE FROM own_payroll_receipt_event','TRUNCATE own_payroll_receipt_event']){await assert.rejects(db.run(statement),/OWN_RECEIPT_IMMUTABLE/);checks++;}
 await db.run('DELETE FROM capabilities WHERE membership_id='+q(qa.ids.maker)+"::uuid AND capability_key='payroll.receipt.prepare'");await assert.rejects(receipt(maker,'command',{key:fullReceiptKey,body:fullReceiptBody}),e=>e.status===403);checks++;
 await assert.rejects(db.run(qa.relocate(fs.readFileSync(new URL('./migrations/141-adopted-own-payroll-close.sql',import.meta.url),'utf8'))),/OWN_CLOSE_ADOPTION_DEFINITION_CHANGED/);checks++;
 await db.run('DELETE FROM capabilities WHERE membership_id='+q(qa.ids.checker)+"::uuid AND capability_key='payroll.calculation.close'");
 const revoked=await close(reviewer,'detail',query);check(!revoked.canWrite&&revoked.groups.every(g=>!g.canReopen),'actual permission revocation withdraws close and reopen authority');
 await assert.rejects(close(reviewer,'command',{key:wholeKey,body:wholeBody}),e=>e.status===403);checks++;
 await db.run('DELETE FROM capabilities WHERE membership_id='+q(qa.ids.checker)+"::uuid AND capability_key='payroll.calculation.approve'");
 await assert.rejects(close(reviewer,'group',{id:whole.groupId}),e=>e.status===403);checks++;
 fs.writeFileSync(prefix+'-fixture.json',JSON.stringify({synthetic:true,actor:qa.actors.checker,partialBefore,before:d,detail:finalDetail,receipt:storedGroup,partial,old:oldClose,reopened,captures:[capture,recalculated],receiptFixtures:{fullPreview,exactPreview,fullEvent,fullBatch,approved,exactEvent,exactBatch,invalidated,selfFixtures,oldReceiptBatch,oldReceiptAfter}},null,2),{flag:'wx'});
 report={passed:true,synthetic:true,major,checks,separateConnections:db.connections.length,completePopulation:qa.completePopulation,oldClosesAndPendingKeysPreserved:true,oldReceiptSnapshotsPreserved:true,allReceiptConceptsFromClosedSource:true,ownAgentIsolation:true,municipalInstallation:false,payrollPosted:false,paymentExecuted:false};
}catch(e){report={passed:false,synthetic:true,major,checks,message:e.message,cause:e.cause?.message,sqlDetail:e.cause?.stderr?.slice(0,2400),sqlDiagnostic};process.exitCode=1;}
finally{if(installed)try{await db.run('DROP SCHEMA '+qa.schema+' CASCADE');}catch(e){report.cleanupError=e.message;process.exitCode=1;}fs.writeFileSync(output,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report));}
