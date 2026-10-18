import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {nativeFinancial350Expected,nativeFinancial350Journey,assertNativeFinancialAttemptBinding,assertNativeFinancial350LedgerDelta,assertNativeFinancial350BankConfiguration} from '../scripts/lib/own-novelty-succession-financial-tail-qa.mjs';
import {nativeBankContinuationScope} from '../scripts/lib/native-employee-bank-tail-qa.mjs';
import {pinMonthlyNativeBaselineArchive,preserveMonthlyNativeBaselineArchive} from '../scripts/lib/monthly-native-baseline-archive-preservation-qa.mjs';
import {createOwnReceiptPdf} from '../assets/own-payroll-receipt-pdf.js';
import {ownCloseSnapshot} from '../assets/own-payroll-close-model.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';
import {receiptBatch} from './fixtures/own-payroll-receipt-synthetic.js';
import {closeDetail,closeReceipt} from './fixtures/own-payroll-close-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';
import {verifiedBankAccountsReceipt} from '../assets/own-bank-accounts-model.js';
import {syntheticBankAccountsReceipt,syntheticBankAccountsBootstrap,syntheticBankAccountsDefinition,syntheticCbu} from './fixtures/own-bank-accounts-synthetic.js';
import {prepareBankAccounts} from '../assets/own-bank-accounts-workspace-model.js';
const sha=v=>createHash('sha256').update(salarySerialized(v)).digest('hex');

// Small manufactured boundary input, not a SQL/model response or a native proof.
// Runtime subsequently runs the existing full bank/accounting product validators.
function boundaryFixture(){
 const expected=nativeFinancial350Expected(),baseline={version:'monthly-native-complete-b0.v1',complete:true,baselineNativeHires:1,originalGroup:{id:uid(3101),snapshotSha256:'a'.repeat(64)}},joint={journey:{contractId:uid(3102),secondRunId:uid(3103),closeGroupId:uid(3104),receiptBatchId:uid(3105)},bank:{closeSnapshotSha256:'b'.repeat(64)}},correction={version:'own-novelty-succession-native-circuit-proof.v1',contractId:uid(3110),registrationId:uid(3111),legajo:'NATIVO-350',c25:{id:uid(3112),amount:'350.00',liquidationVersion:2,onlyEffectiveSuccessor:true},closeGroupId:uid(3113),receiptBatchId:uid(3114)};
 const target={groupId:correction.closeGroupId,snapshot:{totals:expected.sixTotals,populationCount:3,employeeCount:1,employees:[{runId:correction.c25.id}]}};target.snapshotSha256=sha(target.snapshot);
 const source=(id,snapshotSha256,populationCount,selectedCount)=>({id,snapshotSha256,period:'2026-10',type:'monthly',employeeCount:1,populationCount,selectedCount}),sourcePins=[source(baseline.originalGroup.id,baseline.originalGroup.snapshotSha256,1,0),source(joint.journey.closeGroupId,joint.bank.closeSnapshotSha256,2,0),source(target.groupId,target.snapshotSha256,3,1)];
 const record={contractId:correction.contractId,registrationId:correction.registrationId,employeeNumber:correction.legajo,runId:correction.c25.id,liquidationVersion:2,sourceGroupId:correction.closeGroupId,totals:expected.sixTotals,concepts:Object.entries(expected.byCode).map(([code,amount])=>({code,amount}))},batch={id:correction.receiptBatchId,state:'approved',sourceCurrent:true,permissions:{canDownload:true},snapshot:{records:[record],recordCount:1,sources:sourcePins}};batch.snapshotSha256=sha(batch.snapshot);correction.receiptSnapshotSha256=batch.snapshotSha256;
 const closes=sourcePins.slice(0,2).map(pin=>({groupId:pin.id,snapshotSha256:pin.snapshotSha256,snapshot:{employeeCount:1,populationCount:pin.populationCount}}));closes.push(target);return{baseline,joint,correction,sources:{batch,closes}};
}
const repin=f=>{f.sources.batch.snapshotSha256=sha(f.sources.batch.snapshot);f.correction.receiptSnapshotSha256=f.sources.batch.snapshotSha256;};

test('350 continuation preserves all three source pins including both unselected closes',()=>{
 const f=boundaryFixture(),before=structuredClone(f),journey=nativeFinancial350Journey(f),scope=nativeBankContinuationScope(journey,f.sources);assert.equal(scope.sourcePins.length,3);assert.deepEqual(scope.sourcePins.map(s=>s.selectedCount),[0,0,1]);assert.equal(journey.secondRunId,f.correction.c25.id);assert.notEqual(journey.contractId,f.joint.journey.contractId);assert.deepEqual(f,before);assert.deepEqual(nativeFinancial350Expected().sixTotals,{remuneration:'325.00',non_remuneration:'25.00',deduction:'0.00',employer_contribution:'0.00',gross:'350.00',net:'350.00'});assert.equal(nativeFinancial350Expected().cents,'35000');
});
test('consistent rehashed345 totals cannot replace350 expectations',()=>{
 const f=boundaryFixture();for(const key of ['gross','net'])f.sources.batch.snapshot.records[0].totals[key]='345.00';repin(f);assert.throws(()=>nativeFinancial350Journey(f),/QA_FINANCIAL350_TOTAL_CHANGED/);
});
test('omitting a selectedCount0 close remains a failure after repinning receipt',()=>{
 const f=boundaryFixture();f.sources.batch.snapshot.sources.splice(0,1);f.sources.closes.splice(0,1);repin(f);assert.throws(()=>nativeFinancial350Journey(f));
});
test('joint345 identity and original receipt cannot masquerade as correction350',()=>{
 const f=boundaryFixture();f.correction.contractId=f.joint.journey.contractId;assert.throws(()=>nativeFinancial350Journey(f),/QA_FINANCIAL350_WRONG_JOURNEY/);const other=boundaryFixture();other.correction.receiptBatchId=other.joint.journey.receiptBatchId;assert.throws(()=>nativeFinancial350Journey(other));
});
test('both zero selections and the single350 selection are mandatory',()=>{
 for(const index of [0,1,2]){const f=boundaryFixture(),journey=nativeFinancial350Journey(f);journey.nativeFinancialContinuation.sourcePins[index].selectedCount=index===2?0:1;assert.throws(()=>nativeBankContinuationScope(journey,f.sources));}
});
test('the same actual attempt key cannot be rebound to another command body',()=>{
 const attempts=new Map(),key=uid(3201),first={command:'propose',reason:'Propuesta exclusivamente sintética350'},input={kind:'bank',key,body:first},original=assertNativeFinancialAttemptBinding(attempts,input);assert.equal(assertNativeFinancialAttemptBinding(attempts,{...input,body:structuredClone(first)}),original);assert.throws(()=>assertNativeFinancialAttemptBinding(attempts,{...input,body:{...first,reason:'Otro cuerpo exclusivamente sintético350'}}),/QA_FINANCIAL350_KEY_BODY_CHANGED/);assert.equal(attempts.get('bank:'+key),original);
});
test('real receipt verifier rejects a recovered key whose expected body changed',async()=>{
 const receipt=await syntheticBankAccountsReceipt();await verifiedBankAccountsReceipt(receipt,{key:receipt.requestKey,body:receipt.body});await assert.rejects(()=>verifiedBankAccountsReceipt({...receipt,replayed:true},{key:receipt.requestKey,body:{...receipt.body,reason:'Otro cuerpo posterior exclusivamente sintético350'}}));
});
test('canonical bank INPUT may place new1000 before priorf000 while retaining the prior row by ID',()=>{
 const bootstrap=syntheticBankAccountsBootstrap(),template=syntheticBankAccountsDefinition().accounts[0],previous={...template,id:'f0000000-0000-4000-8000-000000000001'},newAccount={...template,id:'10000000-0000-4000-8000-000000000001',contractId:uid(3501),cbu:syntheticCbu('9990001','0000000000350'),accountNumber:'00350/00'},priorDefinition={accounts:[previous]},input={accounts:[previous,newAccount]},inputBefore=structuredClone(input),priorBefore=structuredClone(priorDefinition);bootstrap.configuration={version:'c'.repeat(64),revision:1,proposalId:uid(3502),approvalId:uid(3503),definition:priorDefinition};bootstrap.sources.contracts.push({...bootstrap.sources.contracts[0],contractId:newAccount.contractId,registrationId:uid(3504),employeeNumber:'NATIVO-350'});
 const proposalBody=prepareBankAccounts(bootstrap,input,'Preparación exclusivamente sintética del orden canónico de las cuentas'),configuration={definition:structuredClone(proposalBody.definition)};assert.deepEqual(proposalBody.definition.accounts.map(a=>a.id),[newAccount.id,previous.id]);assert.notDeepEqual(proposalBody.definition,input);assert.notDeepEqual(proposalBody.definition.accounts.slice(0,-1),priorDefinition.accounts);
 assertNativeFinancial350BankConfiguration({configuration,proposalBody,priorDefinition,newAccount});assert.deepEqual(configuration.definition.accounts.find(a=>a.id===previous.id),previous);assert.deepEqual(input,inputBefore);assert.deepEqual(priorDefinition,priorBefore);const changed={definition:structuredClone(configuration.definition)};changed.definition.accounts.find(a=>a.id===previous.id).accountNumber='OTRA-REFERENCIA';assert.throws(()=>assertNativeFinancial350BankConfiguration({configuration:changed,proposalBody,priorDefinition,newAccount}),/QA_FINANCIAL350_CANONICAL_BANK_INPUT_CHANGED/);
});
function ledgers(){const before={},after={},added={};for(const [i,table]of ['bank','accounting','imputation','journal'].entries()){before[table]=[{id:uid(3300+i*4),command:'propose',body:{marker:'original345'}},{id:uid(3301+i*4),command:table==='journal'?'post':'approve',entry_number:table==='journal'?1:null}];const delta=[{id:uid(3302+i*4),command:'propose'},{id:uid(3303+i*4),command:table==='journal'?'post':'approve',entry_number:table==='journal'?2:null}];added[table]=delta.map(e=>e.id);after[table]=[...structuredClone(before[table]),...delta];}return{before,after,added};}
test('financial deltas require all prior rows byte-equivalent plus two exact new events and journal2',()=>{
 const f=ledgers();assert.equal(assertNativeFinancial350LedgerDelta(f.before,f.after,f.added).journalNumber,2);f.after.bank[0].body.marker='changed';assert.throws(()=>assertNativeFinancial350LedgerDelta(f.before,f.after,f.added),/QA_FINANCIAL350_HISTORY_CHANGED/);
});
test('reset numbering or an extra unacknowledged event is rejected',()=>{
 const f=ledgers();f.after.journal.at(-1).entry_number=1;assert.throws(()=>assertNativeFinancial350LedgerDelta(f.before,f.after,f.added));const g=ledgers();g.after.imputation.push({id:uid(3399),command:'approve'});assert.throws(()=>assertNativeFinancial350LedgerDelta(g.before,g.after,g.added));
});

async function jointArchiveFixture(){
 const detail=closeDetail(1),capture=detail.captures[0],snapshot=ownCloseSnapshot(detail,{kind:'all',values:[]}),group=closeReceipt({snapshot,snapshotSha256:ownRunHash(snapshot)}),receipt=receiptBatch(1);
 group.body.selection={kind:'contracts',values:[snapshot.employees[0].contractId]};group.bodySha256=ownRunHash(group.body);group.snapshot.selection=structuredClone(group.body.selection);group.snapshot.populationCount=2;group.snapshot.populationComplete=false;group.snapshotSha256=ownRunHash(group.snapshot);
 receipt.state='approved';receipt.review={id:uid(3401),decision:'approved',at:'2026-10-05T16:00:00Z',by:'Otra persona exclusivamente sintética',reason:'Aprobación independiente exclusivamente sintética'};receipt.permissions.canApprove=false;const targetSource={...receipt.snapshot.sources[0],snapshotSha256:group.snapshotSha256,populationCount:2,selectedCount:1},priorSource={...targetSource,id:uid(3402),snapshotSha256:'a'.repeat(64),populationCount:1,selectedCount:0};receipt.snapshot.sources=[priorSource,targetSource];receipt.snapshotSha256=ownRunHash(receipt.snapshot);const pdf=await createOwnReceiptPdf(receipt);return{capture,receipt,group,pdfBytes:pdf.bytes,jointSourceScope:{version:'monthly-native-joint-archive-scope.v1',priorSource,targetSource}};
}
test('explicit joint archive pins both actual source entries and rejects missing/changed selections',async()=>{
 const f=await jointArchiveFixture(),archive=pinMonthlyNativeBaselineArchive(f);assert.equal(archive.receiptSnapshot.sources.length,2);for(const which of ['priorSource','targetSource']){const changed={...f,jointSourceScope:structuredClone(f.jointSourceScope)};changed.jointSourceScope[which].selectedCount=which==='priorSource'?1:0;assert.throws(()=>pinMonthlyNativeBaselineArchive(changed));}const incomplete={...f,receipt:structuredClone(f.receipt)};incomplete.receipt.snapshot.sources.splice(0,1);incomplete.receipt.snapshotSha256=ownRunHash(incomplete.receipt.snapshot);assert.throws(()=>pinMonthlyNativeBaselineArchive(incomplete));assert.throws(()=>pinMonthlyNativeBaselineArchive({...f,jointSourceScope:null}));
});
test('real exporter refuses stale joint345 while its previously generated PDF stays byte-identical',async()=>{
 const f=await jointArchiveFixture(),archive=pinMonthlyNativeBaselineArchive(f),receipt=structuredClone(f.receipt);receipt.sourceCurrent=false;receipt.permissions.canDownload=false;const preserved=await preserveMonthlyNativeBaselineArchive({...f,archive,receipt,groupState:'closed'});assert.equal(preserved.archive.currentExportRejected,true);assert.equal(preserved.archive.bytesPreserved,true);await assert.rejects(()=>createOwnReceiptPdf(receipt),/La emisión no admite una descarga vigente/);
});
