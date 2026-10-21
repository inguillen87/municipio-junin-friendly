// CI-only continuation. The enclosing194 runner owns destination guards,
// real PostgreSQL transactions, identities, preservation checks and cleanup.
// This helper never substitutes responses or grants an application capability.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ownComparison} from '../../assets/own-payroll-comparison-model.js';
import {emptyOwnReceiptParams} from '../../assets/own-payroll-receipt-model.js';
import {createOwnReceiptPdf} from '../../assets/own-payroll-receipt-pdf.js';

export async function verifyMonthlyDayEngineCircuit(h){
 const {api,setActor,actors,run,captureBody,captureKey,period,contractIds,check}=h;
 assert.equal(h.synthetic,true,'Only the guarded synthetic194 runner may invoke this continuation');
 assert.equal(h.transport,'ci','SQL execution belongs to the admitted native CI environment');
 assert.equal(typeof api,'function');assert.equal(typeof setActor,'function');assert.equal(typeof check,'function');
 for(const actor of [actors.maker,actors.checker])assert.match(actor.actorEmail,/@[^@]*\.invalid$/);
 assert.notEqual(actors.maker.membershipId,actors.checker.membershipId);
 assert.notEqual(actors.maker.actorEmail,actors.checker.actorEmail);
 const ids=[...contractIds].sort(),selection={kind:'contracts',values:ids};
 assert.ok(ids.length>0);assert.equal(new Set(ids).size,ids.length);
 const receiptScope=h.receiptScope??'exact_contracts';assert.ok(['exact_contracts','closed_period'].includes(receiptScope));
 assert.ok(receiptScope==='closed_period'||ids.length<=200,'A larger receipt scope requires an explicit complete closed-period query');
 assert.deepEqual([...run.saved.input.employees.map(e=>e.contractId)].sort(),ids);
 assert.equal(run.body.period,period);assert.equal(run.body.liquidationType,'monthly');
 assert.equal(run.key,captureKey);assert.deepEqual(run.body,captureBody);
 assert.ok(run.payload.monthlyDayDeclarations,'The approved193 source must be physically captured');
 const original=structuredClone(run),reason='Circuito completo exclusivamente sintético QA194';
 const done=(label)=>check(true,label),actor=a=>setActor(a);
 const detail=id=>api('liquidation',{query:{resource:'detail',id}});
 const decision=async(id,command)=>{
  const d=await detail(id),body={runId:id,resultSha256:d.capture.saved.resultSha256,scopeVersion:d.scopeVersion,stateVersion:d.stateVersion,command,selection,reason,reviewConfirmed:true},key=randomUUID();
  const receipt=await api('liquidation',{key,body,expected:201});
  const replay=await api('liquidation',{key,body,expected:200});
  assert.equal(replay.replayed,true);assert.deepEqual(replay.body,receipt.body);
  return {receipt,body,key};
 };
 const closeDetail=()=>api('close',{query:{resource:'detail',period,liquidationType:'monthly'}});
 const closing=async(command,groupId=null)=>{
  const d=await closeDetail(),body={period,liquidationType:'monthly',scopeVersion:d.scopeVersion,stateVersion:d.stateVersion,selection:command==='close'?selection:{kind:'all',values:[]},command,groupId,reason,reviewConfirmed:true},key=randomUUID();
  return {receipt:await api('close',{body,key,expected:201}),body,key};
 };
 actor(actors.maker);
 const ownDetail=await detail(run.id),selfReview={runId:run.id,resultSha256:run.saved.resultSha256,scopeVersion:ownDetail.scopeVersion,stateVersion:ownDetail.stateVersion,command:'confirm',selection,reason,reviewConfirmed:true};
 const selfDenied=await api('liquidation',{body:selfReview,expected:409});assert.equal(selfDenied.code,'OWN_LIQ_DECISION_INVALID');assert.deepEqual(await detail(run.id),ownDetail);
 done('a preparer with receipt read authority still cannot confirm their own calculated result');
 actor(actors.checker);
 const first=await detail(run.id);assert.ok(first.employees.every(e=>e.state==='calculated'));
 const confirmed=await decision(run.id,'confirm');
 const c1=await detail(run.id);assert.ok(c1.employees.every(e=>e.state==='confirmed'&&e.liquidationVersion>0));
 assert.deepEqual(c1.capture.payload.monthlyDayDeclarations,original.payload.monthlyDayDeclarations);
 done('approved193 result confirms with an independent synthetic identity and exact replay');
 await decision(run.id,'annul');
 const annulled=await detail(run.id);assert.ok(annulled.employees.every(e=>e.state==='annulled'));
 assert.deepEqual(annulled.capture.saved,original.saved);assert.deepEqual(annulled.capture.payload,original.payload);
 done('annulment retains every original amount, approved193 source and immutable calculation');
 actor(actors.maker);
 const bootstrap=await api('run'),secondBody={...captureBody,scopeVersion:bootstrap.scopeVersion,programVersion:bootstrap.programVersion,selection:structuredClone(captureBody.selection)},secondKey=randomUUID();
 const second=await api('run',{body:secondBody,key:secondKey,expected:201});
 assert.notEqual(second.id,run.id);assert.notEqual(second.key,run.key);
 assert.deepEqual(second.saved.input,original.saved.input);assert.deepEqual(second.saved.result,original.saved.result);
 assert.deepEqual(second.payload.monthlyDayDeclarations,original.payload.monthlyDayDeclarations);
 done('explicit recalculation creates a distinct capture with the same exact approved input and result');
 actor(actors.checker);
 const historical=await detail(run.id),recalculated=await detail(second.id),comparison=ownComparison(historical.capture,recalculated.capture,[historical,recalculated]);
 assert.equal(comparison.employees,ids.length);assert.ok(comparison.rows.length>0);
 assert.ok(comparison.rows.every(row=>row.changed===false&&row.before!==null&&row.after!==null));
 assert.ok(comparison.totals.every(row=>row.changed===false));
 await decision(second.id,'confirm');
 const c2=await detail(second.id);
 for(const e of c2.employees)assert.equal(e.liquidationVersion,c1.employees.find(o=>o.contractId===e.contractId).liquidationVersion+1);
 done('comparison reads both saved versions and the next confirmation advances the liquidation version');
 const closed=await closing('close'),group=await api('close',{query:{resource:'group',id:closed.receipt.groupId}});
 assert.deepEqual([...group.snapshot.employees.map(e=>e.contractId)].sort(),ids);
 for(const e of group.snapshot.employees){
  const total=second.saved.result.employeeTotals.find(t=>t.contractId===e.contractId);
  for(const key of ['gross','deduction','net'])assert.equal(e.totals[key],total[key]);
 }
 done('closure contains exactly the recalculated contracts and original saved totals');
 actor(actors.maker);
 const params={...emptyOwnReceiptParams(period),contracts:receiptScope==='closed_period'?[]:ids,issuer:{name:'Municipio exclusivamente sintetico QA194',taxId:'30990000001',address:'Domicilio ficticio QA194'},legend:reason};
 const preview=await api('receipt',{previewParams:params});
 assert.equal(preview.snapshot.recordCount,ids.length);
 assert.deepEqual([...preview.snapshot.records.map(r=>r.contractId)].sort(),ids);
 for(const row of preview.snapshot.records){
  assert.equal(row.sourceGroupId,group.groupId);
  const total=second.saved.result.employeeTotals.find(t=>t.contractId===row.contractId);
  for(const key of ['gross','deduction','net'])assert.equal(row.totals[key],total[key]);
 }
 const pdf=await createOwnReceiptPdf(preview.snapshot,{preview:true});
 assert.equal(pdf.recordCount,ids.length);assert.ok(pdf.pageCount>=ids.length);
 assert.equal(new TextDecoder().decode(pdf.bytes.subarray(0,5)),'%PDF-');
 pdf.bytes.fill(0);
 done('unsigned review PDF uses the exact closed result without requiring a digital signature');
 const prepare={command:'prepare',scopeVersion:preview.scopeVersion,sourceVersion:preview.snapshot.sourceVersion,params:preview.snapshot.params,batchId:null,batchSha256:null,reason,reviewConfirmed:false},receiptKey=randomUUID();
 const prepared=await api('receipt',{body:prepare,key:receiptKey,expected:201});
 const batch=await api('receipt',{query:{resource:'batch',id:prepared.batchId}});
 assert.equal(batch.permissions.canApprove,false);assert.equal(batch.permissions.canDownload,true);
 actor(actors.checker);
 const listed=await api('receipt',{query:{resource:'list',period}}),approve={command:'approve',scopeVersion:listed.scopeVersion,sourceVersion:batch.snapshot.sourceVersion,params:null,batchId:batch.id,batchSha256:batch.snapshotSha256,reason,reviewConfirmed:true};
 await api('receipt',{body:approve,expected:201});
 const issued=await api('receipt',{query:{resource:'batch',id:batch.id}});
 assert.equal(issued.state,'approved');assert.deepEqual(issued.snapshot,batch.snapshot);
 done('an independent reviewer approves availability without rewriting the institutional receipt');
 const reopened=await closing('reopen',group.groupId);
 assert.deepEqual(reopened.receipt.snapshot,group.snapshot);
 const afterReopen=await api('receipt',{query:{resource:'batch',id:batch.id}});
 assert.equal(afterReopen.sourceCurrent,false);assert.equal(afterReopen.permissions.canDownload,false);
 assert.deepEqual(afterReopen.snapshot,issued.snapshot);assert.equal(afterReopen.snapshotSha256,issued.snapshotSha256);
 const preserved=await detail(run.id);assert.deepEqual(preserved.capture.saved,original.saved);assert.deepEqual(preserved.capture.payload,original.payload);
 const replay=await api('liquidation',{body:confirmed.body,key:confirmed.key,expected:200});assert.equal(replay.replayed,true);
 actor(actors.maker);
 const runReplay=await api('run',{body:captureBody,key:captureKey,expected:200});assert.deepEqual(runReplay.saved,original.saved);
 done('reopening invalidates current download while preserving receipt, calculation, decisions and original replay');
 return {version:'own-monthly193-engine-full-circuit-qa.v1',synthetic:true,executed:true,contractCount:ids.length,receiptScope,oldRunId:run.id,newRunId:second.id,closeGroupId:group.groupId,receiptBatchId:batch.id,comparisonRows:comparison.rows.length,pdfRecordCount:pdf.recordCount,pdfPages:pdf.pageCount,originalHistoryPreserved:true,municipalAcceptance:false,paymentExecuted:false};
}
