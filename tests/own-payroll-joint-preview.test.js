import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnPayrollJointPreview,verifyOwnPayrollJointPreview} from '../lib/own-payroll-joint-preview.js';
import {prepareOwnPayrollJointPreviewInput,prepareOwnPayrollInput,prepareOwnPayrollQuantityApprovedInput,prepareOwnPayrollOfficialApprovedInput,prepareOwnPayrollRowEmissionApprovedInput,prepareOwnPayrollFamilyTariffApprovedInput,prepareOwnPayrollNonapplicationPreviewInput} from '../lib/own-payroll-approved-input.js';
import {createOwnPayrollNonapplicationPreview} from '../lib/own-payroll-nonapplication-preview.js';
import {nonapplicationHash,NONAPPLICATION_CODES} from '../lib/own-payroll-nonapplication.js';
import {selectOwnPayrollReceiptRows,rowEmissionBaseInput,rowEmissionBaseResult} from '../assets/own-payroll-row-emission.js';
import {calculateOwnPayrollWithOfficialTotals} from '../assets/own-payroll-official-totals.js';
import {jointPreviewFixture,jointArgs,resealJointFamily,jointOptIns} from './fixtures/own-payroll-joint-preview-synthetic.js';
import {nonapplicationFixture,args,addMonthly,addFixed,repinCapture,uid} from './fixtures/own-payroll-nonapplication-synthetic.js';

const fails=(fn,code)=>assert.throws(fn,e=>e?.code===code);
const run=f=>createOwnPayrollJointPreview(jointArgs(f));

test('joint preview executes all three policies, preserves economic totals and audits distinct absences',()=>{
  const f=jointPreviewFixture(),before=structuredClone(f),p=run(f),r=p.result;
  assert.deepEqual(f,before);
  assert.equal(p.input.request.source.programme.program.revision,0);
  assert.equal(p.input.request.source.programme.program.approvalId,null);
  assert.deepEqual(p.input.preparationGates,['NONAPPLICATION_PREPARATION_ONLY','PROGRAM_FAMILY_TARIFF_PREPARATION_ONLY','PROGRAM_ROW_EMISSION_PREPARATION_ONLY']);
  assert.equal(p.input.preparation.completeness.conditionalNonapplicationDefinitions,14);
  assert.equal(p.nonApplicationDecisions.length,28);
  assert.ok(p.nonApplicationDecisions.every(d=>d.decision==='not_applicable'));
  assert.ok(r.rows.every(row=>row.nature==='auxiliary'||!NONAPPLICATION_CODES.includes(row.conceptCode)));
  assert.ok(r.quantities.every(row=>!NONAPPLICATION_CODES.includes(row.conceptCode)));
  assert.equal(r.familyTariffDecisions.length,12);
  assert.equal(r.familyTariffDecisions.filter(d=>d.status==='not_requested'&&d.value===null&&d.readCount===0).length,6);
  assert.equal(r.familyTariffDecisions.filter(d=>d.status==='resolved').length,6);
  assert.equal(r.familyTariffDecisions.find(d=>d.status==='resolved'&&d.sourceCode==='82').value,'180000.00000000');
  assert.equal(p.receiptSelection.omittedRowCount,2);
  assert.deepEqual(p.receiptSelection.omissionAudit.map(d=>d.conceptCode).sort(),['302','306']);
  const visible=selectOwnPayrollReceiptRows(p.input.calculationInput,r);
  const economic=r.rows.filter(row=>row.nature!=='auxiliary');
  assert.equal(visible.length,economic.length-2);
  assert.ok(economic.filter(row=>p.receiptSelection.omissionAudit.some(d=>d.rowKey===row.contractId+':concept:'+row.conceptCode)).every(row=>row.amount==='0.00'&&row.exactValue.numerator==='0'));
  assert.deepEqual(rowEmissionBaseResult(r),calculateOwnPayrollWithOfficialTotals(rowEmissionBaseInput(p.input.calculationInput)));
  assert.equal(r.lineEmployeeTotals[0].remuneration,'200.02');
  assert.equal(r.employeeTotals[0].remuneration,'200.01');
  assert.equal(p.input.calculationInput.familyTariffCapture.policies[0].rows.length,33);
  assert.ok(p.input.calculationInput.employees.every(e=>e.inputs.filter(i=>i.key.startsWith('family_tariff_')).every(i=>i.value===null)));
  for(const key of ['approved','registered','officialReceiptReady','payrollPosted','paymentExecuted'])assert.equal(p[key],false);
});

test('candidate and complete absence capture are bound into the immutable rules hash and replay',()=>{
  const p=run(jointPreviewFixture()),{input}=p,s=input.request.sources;
  const expected=nonapplicationHash({program:s.programState.program,salary:s.programState.salaryCatalog,preparationOnlyCandidate:input.preparationOnlyCandidate});
  assert.equal(input.calculationInput.sourceVersions.rules,expected);
  assert.notEqual(expected,nonapplicationHash({program:s.programState.program,salary:s.programState.salaryCatalog}));
  assert.equal(input.preparationOnlyCandidate.nativeCaptureSha256,input.evidence.captureSha256);
  assert.equal(input.candidateSha256,nonapplicationHash(input.preparationOnlyCandidate));
  assert.equal(input.requestSha256,nonapplicationHash(input.request));
  assert.equal(input.evidence.sourceCertification,'requires_trusted_complete_native_read');
  assert.ok(Object.isFrozen(input.request.sources.familyPayrollFacts.records[0].definition));
  assert.deepEqual(verifyOwnPayrollJointPreview(structuredClone(p)),p);
});

for(const family of ['monthly_import','monthly_native','fixed'])for(const forced of [false,true])test(`joint capture rejects present ${forced?'Forzado':'zero'} event in ${family}`,()=>{
  const f=jointPreviewFixture();
  if(family==='fixed')addFixed(f,'598',{forced});else addMonthly(f,'22',{native:family==='monthly_native',forced});
  fails(()=>run(f),'NONAPPLICATION_EVENT_PRESENT');
});

for(const channel of ['batches','nativeBatches','fixed'])test(`joint preview requires explicit complete ${channel} channel`,()=>{
  const f=jointPreviewFixture();
  if(channel==='fixed')f.capture.fixed=null;else delete f.capture.monthly[channel];
  repinCapture(f);
  fails(()=>run(f),'NONAPPLICATION_CONTRACT_INVALID');
});

test('joint preview rejects missing native capture and false completeness',()=>{
  let a=jointArgs(jointPreviewFixture());a.capture=null;
  fails(()=>createOwnPayrollJointPreview(a),'NONAPPLICATION_NATIVE_CAPTURE_REQUIRED');
  a=jointArgs(jointPreviewFixture());a.capture.completeness.monthly=false;
  fails(()=>createOwnPayrollJointPreview(a),'NONAPPLICATION_SOURCE_INCOMPLETE');
});

for(const branch of ['zero_quantity','insufficient_days'])test(`null tariff facts remain unread on ${branch} branch`,()=>{
  const f=jointPreviewFixture({days:branch==='insufficient_days'?'14':'30',quantities:[branch==='zero_quantity'?'0':'1'],region:null,average:null}),p=run(f);
  assert.ok(p.result.familyTariffDecisions.every(d=>d.status==='not_requested'&&d.value===null&&d.readCount===0));
  assert.equal(p.receiptSelection.omittedRowCount,2);
  assert.equal(p.nonApplicationDecisions.length,14);
  assert.equal(p.input.calculationInput.familyTariffCapture.records[0].regionCode,null);
  assert.equal(p.input.calculationInput.familyTariffCapture.records[0].priorSemesterAverage,null);
});

for(const field of ['region','semesterAverage'])test(`selected tariff branch rejects unknown ${field}`,()=>{
  const f=jointPreviewFixture({quantities:['1']});
  f.sources.familyPayrollFacts.records[0].definition.tariffSelection[field]=null;
  resealJointFamily(f);
  fails(()=>run(f),'FAMILY_TARIFF_FACT_MISSING');
});

test('unknown family quantity remains an error even outside the monetary branch',()=>{
  const f=jointPreviewFixture({days:'14',quantities:['1'],region:null,average:null});
  f.sources.familyPayrollFacts.records[0].definition.quantities.childrenWithDisability=null;
  resealJointFamily(f);
  fails(()=>run(f),'INPUT_MISSING');
});

test('capture fingerprint alteration is rejected before calculating the candidate',()=>{
  const f=jointPreviewFixture();f.capture.sourceSha256.monthly='0'.repeat(64);
  fails(()=>run(f),'NONAPPLICATION_CAPTURE_CHANGED');
});

test('each named opt-in is mandatory and cannot be silently disabled',()=>{
  for(const key of Object.keys(jointOptIns())){
    const a=jointArgs(jointPreviewFixture());a.optIns[key]=false;
    fails(()=>createOwnPayrollJointPreview(a),'JOINT_PREVIEW_OPT_IN_REQUIRED');
  }
  const a=jointArgs(jointPreviewFixture());a.optIns.unrecognized=true;
  fails(()=>createOwnPayrollJointPreview(a),'JOINT_PREVIEW_OPT_IN_REQUIRED');
});

test('rehashed stored request cannot remove a feature opt-in',()=>{
  const p=structuredClone(run(jointPreviewFixture()));
  p.input.request.optIns.familyTariffs=false;p.inputSha256=nonapplicationHash(p.input);
  fails(()=>verifyOwnPayrollJointPreview(p),'JOINT_PREVIEW_OPT_IN_REQUIRED');
});

test('changed result with recomputed envelope hashes still fails original-request replay',()=>{
  const p=structuredClone(run(jointPreviewFixture()));
  p.result.rowEmissions[0].decision='emit';p.resultSha256=nonapplicationHash(p.result);
  fails(()=>verifyOwnPayrollJointPreview(p),'JOINT_PREVIEW_CHANGED');
});

test('rewritten candidate approval and fingerprints cannot turn the preview into an approved input',()=>{
  const p=structuredClone(run(jointPreviewFixture())),i=p.input,s=i.request.sources;
  i.preparationOnlyCandidate.approved=true;i.candidateSha256=nonapplicationHash(i.preparationOnlyCandidate);
  i.calculationInput.sourceVersions.rules=nonapplicationHash({program:s.programState.program,salary:s.programState.salaryCatalog,preparationOnlyCandidate:i.preparationOnlyCandidate});
  i.calculationInputSha256=nonapplicationHash(i.calculationInput);p.inputSha256=nonapplicationHash(i);
  fails(()=>verifyOwnPayrollJointPreview(p),'JOINT_PREVIEW_CHANGED');
  p.approved=true;
  fails(()=>verifyOwnPayrollJointPreview(p),'JOINT_PREVIEW_INVALID');
});

test('all preceding approved-input adapters reject the full conditional programme',()=>{
  const f=jointPreviewFixture(),input=prepareOwnPayrollJointPreviewInput(jointArgs(f)),s=structuredClone(f.sources);
  Object.assign(s.programState.program,{revision:1,definition:input.preparation.draft.programme,salaryVersion:s.programState.salaryCatalog.version,proposalId:uid(990),approvalId:uid(991)});
  for(const prepare of [prepareOwnPayrollInput,prepareOwnPayrollQuantityApprovedInput,prepareOwnPayrollOfficialApprovedInput,prepareOwnPayrollRowEmissionApprovedInput,prepareOwnPayrollFamilyTariffApprovedInput])fails(()=>prepare(s),'PROGRAM_INVALID');
});

test('previous 14N-only preview rejects the joint gates and still accepts its original isolated scope',()=>{
  const joint=jointArgs(jointPreviewFixture());delete joint.optIns;
  fails(()=>prepareOwnPayrollNonapplicationPreviewInput(joint),'NONAPPLICATION_PROGRAMME_INCOMPLETE');
  const legacy=createOwnPayrollNonapplicationPreview(args(nonapplicationFixture()));
  assert.equal(legacy.version,'own-payroll-nonapplication-preview.v1');
  assert.equal(legacy.approved,false);
  assert.ok(legacy.result.rows.every(r=>r.nature==='auxiliary'||!NONAPPLICATION_CODES.includes(r.conceptCode)));
});
