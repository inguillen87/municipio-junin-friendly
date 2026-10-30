// One hire and one immutable source chain. No SQL/HTTP transport is created here.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {monthlyNativeFullCycleFixture} from '../../tests/fixtures/own-monthly-native-full-cycle-synthetic.js';
import {monthlyDayDeclarationBootstrap,prepareMonthlyDayDeclaration,monthlyDayDeclarationDetail,decideMonthlyDayDeclaration} from '../../assets/own-monthly-day-declaration-model.js';
import {fixedEmployee,fixedReceipt} from '../../assets/payroll-fixed-novelties-model.js';
import {salarySerialized} from '../../assets/native-salary-catalog-model.js';
import {monthlyNativeHistoryPublished} from '../../tests/fixtures/monthly-native-programme-history-synthetic.js';
import {verifyNativeEmployeePayrollCircuit} from './native-employee-payroll-circuit-qa.mjs';
import {verifyNativeEmployeeBankTail} from './native-employee-bank-tail-qa.mjs';
import {verifyNativeEmployeeAccountingTail} from './native-employee-accounting-tail-qa.mjs';
import {assertMonthlyNativePhysicalAddition} from './monthly-native-full-circuit-baseline-qa.mjs';

const sha=value=>createHash('sha256').update(salarySerialized(value)).digest('hex');
export async function prepareMonthlyNativeFullCycleSources({created,fixture,monthly,approveProgram,call,maker,checker,setCurrent,api,state,expect,normalized}){
 assert.equal(fixture.version,'monthly-native-full-cycle-synthetic.v1');
 assert.notEqual(maker.principal.tenant.membershipId,checker.principal.tenant.membershipId);
 for(const value of [api,state,expect,normalized])assert.equal(typeof value,'function');
 const approvedProgramme=monthlyNativeHistoryPublished(await approveProgram(fixture));
 const period=fixture.period,contractId=created.contractId;
 const approve=async definition=>{
  const boot=monthlyDayDeclarationBootstrap(await monthly('bootstrap',maker,{contractId,period}));
  const body=prepareMonthlyDayDeclaration(boot,definition,'Preparación independiente exclusivamente sintética del mismo alta');
  const proposal=await monthly('command',maker,{body,key:randomUUID()});
  const reviewBoot=monthlyDayDeclarationBootstrap(await monthly('bootstrap',checker,{contractId,period}));
  const pending=await monthlyDayDeclarationDetail(await monthly('detail',checker,{id:proposal.proposalId}));
  const decision=decideMonthlyDayDeclaration(reviewBoot,pending,'approve','Revisión independiente exclusivamente sintética del mismo alta');
  const approval=await monthly('command',checker,{body:decision,key:randomUUID()});
  setCurrent(maker);return{proposal,approval};
 };
 const firstDeclaration=await approve(fixture.declaration);
 const subject=fixedEmployee(call('payroll_fixed_registry_employee_by_contract_v1',['uuid'],[contractId]),{contractId});assert.equal(subject.legajo,created.legajo);
 const reason='Importe25 exclusivamente sintético del mismo alta; sin fórmula municipal';
 const payload={recordId:null,expectedVersion:0,contractId,legajo:subject.legajo,identityToken:subject.identityToken,operation:'set',values:{conceptSourceId:fixture.forcedConcept,costCenterSourceId:null,payrollType:'monthly',quantityDecimal:null,amountCents:fixture.expected.fixedAmountCents,forced:true,forcedReason:reason,legalInstrument:'Acto exclusivamente sintético del circuito unido',validFrom:period+'-01',validTo:null},reason};
 const fixedProposal=fixedReceipt(call('payroll_fixed_registry_propose_v1',['jsonb','uuid'],[payload,randomUUID()]),'propose',{expectedVersion:0});
 setCurrent(checker);const fixedReview={recordId:fixedProposal.recordId,proposalId:fixedProposal.proposalId,expectedVersion:fixedProposal.recordVersion,decision:'approve',reason};
 const fixedApproval=fixedReceipt(call('payroll_fixed_registry_review_v1',['jsonb','uuid'],[fixedReview,randomUUID()]),'review',fixedReview);setCurrent(maker);
 const prepared={contractId,registrationId:created.registrationId,programmeSha256:approvedProgramme.programmeSha256,latestProgramVersion:approvedProgramme.latestProgramVersion,declaration:structuredClone(fixture.declaration),declarationProposalId:firstDeclaration.proposal.proposalId,declarationApprovalId:firstDeclaration.approval.eventId,fixedRecordId:fixedProposal.recordId,fixedProposalId:fixedProposal.proposalId,fixedApprovalEventId:fixedApproval.eventId,fixedIdentityToken:subject.identityToken};
 const captureBody=async()=>{setCurrent(maker);const boot=await api('run',{resource:'bootstrap'});assert.equal(boot.programVersion,approvedProgramme.latestProgramVersion,'JOINT_APPROVED_PROGRAMME_CHANGED');return{period,liquidationType:'monthly',selection:{kind:'contracts',values:[contractId]},scopeVersion:boot.scopeVersion,programVersion:boot.programVersion,populationDomain:'native_registered',version:'own-payroll-run-command.v2',liquidationDate:fixture.liquidationDate};};
 // This preparation-only full30 capture is never the principal first capture.
 // It supplies real saved SQL input/result for the private16-day guard witness.
 const fullBody=await captureBody(),fullKey=randomUUID(),preparation=await api('run',null,fullBody,fullKey,201);
 assertMonthlyNativeFullCycleCapture(preparation,{created,fixture,prepared});
 const before=state();await approve({...fixture.declaration,recognizedDays:'16',fullMonthDeclared:false});
 const partialBody=await captureBody(),partialKey=randomUUID(),denied=await api('run',null,partialBody,partialKey,422);
 assert.match(denied.code,/PRORATION_REQUIRED/);assert.equal(state().results,before.results);
 const partial=await api('run',{resource:'attempt',key:partialKey});assert.equal(partial.saved,null);assert.equal(partial.payload.monthlyDayDeclarations.records.length,1);assert.equal(partial.payload.monthlyDayDeclarations.records[0].contractId,contractId);assert.equal(partial.payload.monthlyDayDeclarations.records[0].configuration.definition.recognizedDays,'16');
 const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
 expect([normalized('SELECT public.own_fixed_forced_capture_v1(c,'+quote(JSON.stringify(preparation.saved.input))+'::jsonb,'+quote(JSON.stringify(preparation.saved.result))+'::jsonb) FROM public.own_payroll_run_capture c WHERE c.id='+quote(partial.id)+'::uuid')],'OWN_RUN_PRORATION_REQUIRED');assert.equal(state().results,before.results);
 const restored=await approve(fixture.declaration);
 assert.deepEqual((await api('run',{resource:'attempt',key:fullKey})).saved,preparation.saved);
 return{...prepared,declarationProposalId:restored.proposal.proposalId,declarationApprovalId:restored.approval.eventId,negative16:{contractId,preparationOnlyRunId:preparation.id,rejectedCaptureId:partial.id,jsRejected:true,sqlGuardRejected:true,resultsUnchanged:true,restored30ApprovalId:restored.approval.eventId,principalCaptureNotStarted:true}};
}

export function assertMonthlyNativeFullCycleCapture(capture,{created,fixture,prepared}){
 assert.equal(prepared.contractId,created.contractId);
 assert.equal(sha(capture.payload.programState.program.definition),prepared.programmeSha256,'JOINT_CAPTURED_PROGRAMME_CHANGED');
 assert.equal(capture.body.programVersion,prepared.latestProgramVersion,'JOINT_CAPTURED_PROGRAMME_VERSION_CHANGED');assert.equal(capture.payload.programState.program.version,prepared.latestProgramVersion,'JOINT_CAPTURED_PROGRAMME_VERSION_CHANGED');
 assert.deepEqual(capture.saved.input.employees.map(e=>e.contractId),[created.contractId]);
 assert.deepEqual(capture.saved.result.employeeTotals.map(e=>e.contractId),[created.contractId]);
 assert.equal(capture.body.version,'own-payroll-run-command.v2');
 assert.equal(capture.body.liquidationDate,fixture.liquidationDate);
 assert.equal(Object.hasOwn(capture.payload,'periodParticipation'),false,'JOINT_UNUSED157_MUST_REMAIN_ABSENT');
 const records=capture.payload.monthlyDayDeclarations.records;
 assert.equal(records.length,1);assert.equal(records[0].contractId,created.contractId);assert.equal(records[0].fullPeriod,true);
 assert.deepEqual(records[0].configuration.definition,fixture.declaration);
 assert.equal(records[0].configuration.proposalId,prepared.declarationProposalId);
 assert.equal(records[0].configuration.approvalId,prepared.declarationApprovalId);
 const employee=capture.saved.input.employees[0],ledger=employee.fixedForcedAmounts;
 assert.equal(ledger.length,1);assert.equal(ledger[0].recordId,prepared.fixedRecordId);assert.equal(ledger[0].proposalId,prepared.fixedProposalId);assert.equal(ledger[0].amountCents,fixture.expected.fixedAmountCents);assert.match(ledger[0].sourceRowSha256,/^[a-f0-9]{64}$/);
 assert.equal(capture.saved.result.rowCount,fixture.expected.rowCount);
 const rows=capture.saved.result.rows;assert.equal(rows.length,fixture.expected.rowCount);assert.deepEqual(new Set(rows.map(r=>r.conceptCode)),new Set(Object.keys(fixture.expected.byCode)));
 for(const row of rows){assert.equal(row.contractId,created.contractId);assert.equal(row.amount,fixture.expected.byCode[row.conceptCode]);}
 for(const[key,value]of Object.entries(fixture.expected.totals))assert.equal(capture.saved.result.employeeTotals[0][key],value,'JOINT_SIX_TOTALS_CHANGED:'+key);
 return{contractId:created.contractId,sourceSha256:sha({declarations:capture.payload.monthlyDayDeclarations,fixed:ledger}),programmeSha256:prepared.programmeSha256,prepared};
}

// The caller supplies the canonical190 binding and an explicitly created,
// calculated, confirmed, closed and reviewed one-hire B0. Original Noelia29 is
// a separate unchanged default scenario, never a label for this population.
export async function verifyMonthlyNativeFullCircuit(h,steps={native:verifyNativeEmployeePayrollCircuit,bank:verifyNativeEmployeeBankTail,accounting:verifyNativeEmployeeAccountingTail}){
 assert.equal(h.synthetic,true);assert.equal(h.transport,'ci');
 assert.equal(h.monthlyContext.schema,h.qa.schema,'JOINT_SAME_QA_SCHEMA_REQUIRED');
 assert.equal(h.monthlyContext.sourceCommit,h.sourceCommit,'JOINT_SAME_SOURCE_COMMIT_REQUIRED');
 assert.equal(h.monthlyContext.normalized,h.qa.normalized,'JOINT_SAME_PROJECTION_REQUIRED');
 assert.equal(h.monthlyContext.maker,h.maker);assert.equal(h.monthlyContext.checker,h.checker);
 for(const key of ['monthly','approveProgram','call','state','expect'])assert.equal(typeof h.monthlyContext[key],'function');
 for(const key of ['native','bank','accounting'])assert.equal(typeof steps[key],'function');
 assert.ok(h.browserQa,'The original11UI commands and bank/accounting HTTP/export controls remain required');
 assert.equal(h.baseline.version,'monthly-native-complete-b0.v1');assert.equal(h.baseline.complete,true);assert.equal(h.baseline.baselineNativeHires,1);assert.equal(h.baseline.journeyAdditionalHires,0);
 assert.deepEqual(h.original.capture.saved.input.employees.map(row=>row.contractId).sort(),h.baseline.eligibleContractIds);
 assert.equal(h.original.capture.saved.result.employeeCount,h.baseline.eligibleContractIds.length);
 assert.equal(h.original.receipt.snapshot.sources.length,1);assert.equal(h.original.receipt.snapshot.sources[0].id,h.baseline.originalGroup.id);assert.equal(h.original.receipt.snapshot.sources[0].snapshotSha256,h.baseline.originalGroup.snapshotSha256);
 assert.equal(typeof h.readPhysical,'function');
 assert.equal(h.period,'2026-10');
 const fixture=monthlyNativeFullCycleFixture();
 const monthlyFixed={fixture,baseline:h.baseline,prepare:created=>prepareMonthlyNativeFullCycleSources({...h.monthlyContext,created,fixture,setCurrent:h.setCurrent,api:h.api}),assertCapture:assertMonthlyNativeFullCycleCapture};
 // One invocation owns the only hire. The preparation hook receives that
 // returned registration; it never calls native/create or substitutes an ID.
 const journey=await steps.native({...h,monthlyFixed,createViaUi:input=>h.browserQa.createNativeEmployee(input),positiveViaUi:{command:input=>h.browserQa.nativePayrollCommand({...input,populationCount:h.baseline.closeRows.length+1}),preview:input=>h.browserQa.nativeReceiptPreview(input),download:input=>h.browserQa.nativeReceiptDownload(input)}});
 assert.equal(journey.monthlyFixed?.fixtureVersion,fixture.version,'JOINT_MONTHLY_FIXED_PROOF_REQUIRED');
 assert.equal(journey.monthlyFixed.contractId,journey.contractId,'JOINT_NATIVE_UUID_CHANGED');
 assert.equal(journey.monthlyFixed.registrationId,journey.registrationId,'JOINT_REGISTRATION_CHANGED');
 assert.equal(journey.monthlyFixed.firstSourceSha256,journey.monthlyFixed.secondSourceSha256,'JOINT_RECAPTURE_PROVENANCE_CHANGED');
 assert.equal(journey.monthlyFixed.prepared.negative16.principalCaptureNotStarted,true);assert.equal(journey.monthlyFixed.prepared.negative16.contractId,journey.contractId);assert.notEqual(journey.firstRunId,journey.monthlyFixed.prepared.negative16.preparationOnlyRunId);assert.notEqual(journey.secondRunId,journey.monthlyFixed.prepared.negative16.preparationOnlyRunId);
 assert.equal(journey.liquidationVersion,2);
 const common={db:h.db,qa:h.qa,sourceCommit:h.sourceCommit,maker:h.maker,checker:h.checker,getCurrent:h.getCurrent,setCurrent:h.setCurrent,journey,transport:h.browserQa,output:h.output,ok:h.ok,preserveOriginal:h.preserveOriginal};
 const bank=await steps.bank(common);assert.equal(bank.contractId,journey.contractId);assert.equal(bank.runId,journey.secondRunId);assert.equal(bank.closeGroupId,journey.closeGroupId);assert.equal(bank.receiptBatchId,journey.receiptBatchId);
 const accounting=await steps.accounting({...common,bankTail:bank});assert.equal(accounting.contractId,journey.contractId);assert.equal(accounting.closeGroupId,journey.closeGroupId);assert.equal(accounting.receiptBatchId,journey.receiptBatchId);
 const physicalAfter=h.readPhysical();assertMonthlyNativePhysicalAddition(h.baseline.physicalAfter,physicalAfter,journey);
 return{version:'monthly-native-full-circuit-connection.v1',journey,bank,accounting,fixtureVersion:fixture.version,baselineNativeHires:1,journeyAdditionalHires:1,baseline:h.baseline,physicalAfter,sourceFrozenBetweenCaptures:true,municipalAcceptance:false,paymentExecuted:false};
}
