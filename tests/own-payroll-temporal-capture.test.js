import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TEMPORAL_TEST_PERIODS,multiPeriodTemporalSources,successiveTemporalSources,temporalCrossQuantitySources,temporalCapture,temporalCloseDetail,temporalReceiptEvidence,temporalHash as hash,temporalTestId,sealTemporalSources} from './fixtures/own-payroll-temporal-capture-synthetic.js';
import {temporalPolicySources,temporalTariffPolicy} from './fixtures/own-payroll-policy-validity-synthetic.js';
import {prepareOwnPayrollFamilyTariffApprovedInput} from '../lib/own-payroll-approved-input.js';
import {ownOfficialCapture,verifiedOwnOfficialCapture,buildOwnOfficialCloseSnapshot,verifiedOwnOfficialCloseSnapshot} from '../assets/own-payroll-official-snapshot-model.js';
import {ownRunOperation,verifyOwnRunReceipt,RUN_CALCULATE} from '../lib/internal-own-payroll-run.js';
import {normalizeOwnPayrollRowEmissionInput} from '../assets/own-payroll-row-emission.js';
import {ownReceiptRecord} from '../assets/own-payroll-receipt-model.js';
import {verifiedOwnOfficialReceiptEvidence} from '../assets/own-payroll-official-receipt-model.js';
import {createOwnPayrollRowEmissionSnapshot,projectOwnPayrollRowEmissionReceipt} from '../lib/own-payroll-row-emission-snapshot.js';

const beforeProgram=multiPeriodTemporalSources('2026-08').programState;
const expectedRulesHash=hash({program:beforeProgram.program,salary:beforeProgram.salaryCatalog});
const payrollError=code=>error=>error?.code===code;

for(const [index,period]of TEMPORAL_TEST_PERIODS.entries())test('approved consumer and immutable capture/close select the declared policy: '+period,async()=>{
 const source=multiPeriodTemporalSources(period),sourceBefore=structuredClone(source),capture=temporalCapture(source,index+1);
 const {input,result}=ownOfficialCapture(capture),rate=period<'2027-01'?'7.00000000':period<'2028-01'?'9.00000000':'11.00000000';
 assert.equal(input.sourceVersions.rules,expectedRulesHash,'one approved program/catalog covers every declared month');
 assert.equal(input.familyTariffCapture.version,'own-payroll-family-tariff-capture.v2');
 assert.equal(input.familyTariffCapture.period,period);
 assert.equal(input.familyTariffCapture.policies.length,3);
 assert.deepEqual(input.familyTariffCapture.policies,source.programState.program.definition.familyTariffPolicies);
 assert.equal(input.rowEmissionVersion,'own-payroll-row-emission.v2');
 assert.ok(input.rowEmissionPolicies.every(p=>!Object.hasOwn(p,'period')&&p.validFrom==='2026-08'&&p.validUntil==='2028-12'));
 assert.ok(result.familyTariffDecisions.every(d=>d.status==='resolved'&&d.value===rate));
 assert.deepEqual(source,sourceBefore,'materialization never rewrites the approved definition or the sources');
 const verified=await verifiedOwnOfficialCapture(capture);
 assert.deepEqual(verified,capture);
 assert.deepEqual(verifyOwnRunReceipt(capture),capture);
 const close=buildOwnOfficialCloseSnapshot(temporalCloseDetail(capture),{kind:'all',values:[]});
 assert.equal(close.sources[0].familyTariffCaptureMetadata.period,period);
 assert.deepEqual(close.sources[0].rowEmissionPolicies,input.rowEmissionPolicies);
 assert.deepEqual(await verifiedOwnOfficialCloseSnapshot(close),close);
 assert.equal(capture.saved.inputSha256,hash(capture.saved.input));
 assert.equal(capture.saved.resultSha256,hash(capture.saved.result));
});

test('February 2028 retains declared payroll days; calendar length never replaces the approved quantity',()=>{
 const capture=temporalCapture(multiPeriodTemporalSources('2028-02'));
 assert.deepEqual(capture.saved.result.quantities.find(q=>q.conceptCode==='1').value,{numerator:'30',denominator:'1'});
});

test('an explicitly open validity remains usable without copying a table into a future month',async()=>{
 const source=sealTemporalSources(temporalPolicySources({period:'2032-02',validFrom:'2027-08',validUntil:null,rate:'13.00'}));
 const capture=temporalCapture(source);
 assert.equal(capture.saved.input.familyTariffCapture.policies[0].validUntil,null);
 assert.ok(capture.saved.input.rowEmissionPolicies.every(p=>p.validUntil===null));
 assert.deepEqual(await verifiedOwnOfficialCapture(capture),capture);
});

test('a coverage gap rejects materialization instead of carrying the previous approved amount',()=>{
 const source=multiPeriodTemporalSources('2028-02');
 source.programState.program.definition.familyTariffPolicies=source.programState.program.definition.familyTariffPolicies.filter(p=>p.validFrom!=='2028-01');
 sealTemporalSources(source);
 assert.throws(()=>prepareOwnPayrollFamilyTariffApprovedInput(source),payrollError('FAMILY_TARIFF_POLICY_REQUIRED'));
});

test('overlapping tables reject the complete approved-source contract',()=>{
 const source=multiPeriodTemporalSources('2028-02');
 source.programState.program.definition.familyTariffPolicies.push(temporalTariffPolicy({validFrom:'2028-02',validUntil:'2028-03',rate:'17.00'}));
 assert.throws(()=>prepareOwnPayrollFamilyTariffApprovedInput(source),payrollError('POLICY_VALIDITY_OVERLAP'));
});

test('the selected table cannot change behind its declared source hash',()=>{
 const source=multiPeriodTemporalSources('2028-02');
 source.programState.program.definition.familyTariffPolicies[2].rows[0].amount='19.00';
 assert.throws(()=>prepareOwnPayrollFamilyTariffApprovedInput(source),payrollError('FAMILY_TARIFF_ROWS_CHANGED'));
});

test('the existing catalog approval and family-approval guards are still required',()=>{
 const unlinked=multiPeriodTemporalSources();unlinked.programState.program.salaryVersion='f'.repeat(64);
 assert.throws(()=>prepareOwnPayrollFamilyTariffApprovedInput(unlinked),payrollError('PROGRAM_APPROVAL_REQUIRED'));
 const unapproved=multiPeriodTemporalSources();unapproved.familyPayrollFacts.records[0].approvalId=null;
 assert.throws(()=>prepareOwnPayrollFamilyTariffApprovedInput(unapproved));
});

test('a valid policy from another agreement does not cover this captured population',()=>{
 const source=multiPeriodTemporalSources();
 source.programState.program.definition.familyTariffPolicies[2].agreementCode='2';
 assert.throws(()=>prepareOwnPayrollFamilyTariffApprovedInput(source),payrollError('FAMILY_TARIFF_POLICY_REQUIRED'));
});

test('saved readers reject an explicit capture period changed independently of the original input',()=>{
 const capture=temporalCapture();capture.saved.input.familyTariffCapture.period='2028-03';
 capture.saved.inputSha256=hash(capture.saved.input);
 assert.throws(()=>ownOfficialCapture(capture));
});

test('closed evidence keeps both the original policy interval and the selected capture period',async()=>{
 const capture=temporalCapture(),close=buildOwnOfficialCloseSnapshot(temporalCloseDetail(capture),{kind:'all',values:[]});
 close.sources[0].familyTariffCaptureMetadata.period='2028-03';
 await assert.rejects(verifiedOwnOfficialCloseSnapshot(close));
 const wrongEmission=buildOwnOfficialCloseSnapshot(temporalCloseDetail(capture),{kind:'all',values:[]});
 wrongEmission.sources[0].rowEmissionPolicies[0].validFrom='2028-03';
 await assert.rejects(verifiedOwnOfficialCloseSnapshot(wrongEmission));
});

test('new explicit comparison operators are replayed by the saved and closed readers',async()=>{
 const source=multiPeriodTemporalSources();
 for(const p of source.programState.program.definition.rowEmissionPolicies){
  p.conditions[0].operator='ge';p.conditions[0].value='30';
  p.conditions[1].operator='eq';p.conditions[1].value='1';
 }
 sealTemporalSources(source);const capture=temporalCapture(source);
 assert.ok(capture.saved.result.rowEmissions.every(r=>r.decision==='emit'));
 const close=buildOwnOfficialCloseSnapshot(temporalCloseDetail(capture),{kind:'all',values:[]});
 assert.deepEqual(await verifiedOwnOfficialCloseSnapshot(close),close);
});

test('a new operator cannot permit omission of a nonzero economic row',()=>{
 const source=multiPeriodTemporalSources();
 source.programState.program.definition.rowEmissionPolicies[0].conditions[0].operator='gt';
 source.programState.program.definition.rowEmissionPolicies[0].conditions[0].value='100';
 sealTemporalSources(source);
 assert.throws(()=>temporalCapture(source),payrollError('ROW_EMISSION_NONZERO_CONTRIBUTION'));
});

test('declared domains and quantity stages remain part of closed evidence',()=>{
 const capture=temporalCapture();capture.saved.input.rowEmissionPolicies[0].conditions[0].stage='rounded';
 assert.throws(()=>normalizeOwnPayrollRowEmissionInput(capture.saved.input),payrollError('ROW_EMISSION_QUANTITY_REQUIRED'));
});

test('a later program never mutates or reinterprets the already captured month',async()=>{
 const earlier=temporalCapture(multiPeriodTemporalSources('2027-08')),before=hash(earlier);
 const later=sealTemporalSources(temporalPolicySources({period:'2029-01',validFrom:'2029-01',validUntil:null,rate:'23.00'}));
 temporalCapture(later,501);
 assert.equal(hash(await verifiedOwnOfficialCapture(earlier)),before);
 assert.equal(hash(verifyOwnRunReceipt(earlier)),before);
});

test('the actual calculate adapter consumes the captured policy inventory and preserves retries',async()=>{
 const full=temporalCapture(),unsaved={...structuredClone(full),saved:null};
 const principal={user:{email:'qa@example.invalid'},tenant:{source:'membership',id:temporalTestId(9001),membershipId:temporalTestId(9002),effectiveCapabilities:RUN_CALCULATE}};
 const session={email:'qa@example.invalid',id:temporalTestId(9003),version:1,releaseSha:'d'.repeat(40)};
 const calls=[],sql={query:async(q,v)=>{calls.push({q,v});return[{result:calls.length===1?unsaved:full.saved}];}};
 const answer=await ownRunOperation(sql,principal,session,'calculate',{key:full.key,body:full.body},{algorithmHash:()=>full.algorithmSha256});
 assert.equal(calls.length,2);assert.match(calls[1].q,/own_run_complete_official_v1/);
 assert.equal(hash(JSON.parse(calls[1].v[2])),full.saved.inputSha256);
 assert.deepEqual(answer.saved,full.saved);
 let retries=0;const replay={query:async()=>{retries++;return[{result:{...full,replayed:true}}];}};
 const repeated=await ownRunOperation(replay,principal,session,'calculate',{key:full.key,body:full.body},{algorithmHash:()=>hash('newer installed engine')});
 assert.equal(retries,1);assert.deepEqual(repeated.saved,full.saved);
});

test('the shared temporal selector is shipped to browsers and included in the algorithm hash inputs',()=>{
 const build=readFileSync(new URL('../scripts/build-friendly.mjs',import.meta.url),'utf8');
 const run=readFileSync(new URL('../lib/internal-own-payroll-run.js',import.meta.url),'utf8');
 assert.match(build,/'assets\/own-payroll-policy-validity\.js'/);
 assert.match(run,/new URL\('\.\.\/assets\/own-payroll-policy-validity\.js',import\.meta\.url\)/);
});

test('explicit succession selects the new scale while retaining both original open policies and their hashes',async()=>{
 const earlier=temporalCapture(successiveTemporalSources('2028-02',{includeSuccessor:false}),600),earlierSha=hash(earlier);
 const source=successiveTemporalSources('2028-02'),before=structuredClone(source),later=temporalCapture(source,601);
 const policies=later.saved.input.familyTariffCapture.policies;
 assert.equal(policies.length,2);assert.ok(policies.every(p=>p.validUntil===null));
 assert.equal(policies[1].supersedes.policySha256,hash(policies[0]));
 assert.equal(later.saved.input.rowEmissionPolicies.length,4);
 assert.equal(later.saved.result.rowEmissions.length,2);
 assert.ok(later.saved.result.familyTariffDecisions.every(d=>d.value==='9.00000000'));
 assert.ok(earlier.saved.result.familyTariffDecisions.every(d=>d.value==='7.00000000'),'the same month captured before a successor is not recalculated');
 const past=temporalCapture(successiveTemporalSources('2027-12'),602);
 assert.ok(past.saved.result.familyTariffDecisions.every(d=>d.value==='7.00000000'));
 for(const capture of [earlier,later,past]){
  assert.deepEqual(await verifiedOwnOfficialCapture(capture),capture);
  const close=buildOwnOfficialCloseSnapshot(temporalCloseDetail(capture),{kind:'all',values:[]});
  assert.deepEqual(await verifiedOwnOfficialCloseSnapshot(close),close);
 }
 assert.equal(hash(earlier),earlierSha);assert.deepEqual(source,before);
});

test('receipt readers retain a generic omitted concept whose condition uses another declared quantity',async()=>{
 const source=temporalCrossQuantitySources(),capture=temporalCapture(source,750);
 const close=buildOwnOfficialCloseSnapshot(temporalCloseDetail(capture),{kind:'all',values:[]});
 const {record}=temporalReceiptEvidence(capture,close),omitted=record.omissionAudit.find(o=>o.decision.conceptCode==='740');
 assert.ok(omitted);assert.equal(omitted.quantity,null);assert.equal(omitted.calculatedRow.amount,'0.00');
 assert.equal(record.quantities.some(q=>q.conceptCode==='740'),false);
 assert.deepEqual(ownReceiptRecord(JSON.parse(JSON.stringify(record))),record);
 assert.deepEqual(await verifiedOwnOfficialReceiptEvidence(record),record);
 const snapshot=createOwnPayrollRowEmissionSnapshot(capture.saved.input);
 const preview=projectOwnPayrollRowEmissionReceipt(snapshot,source.programState,capture.saved.input.employees[0].contractId);
 assert.equal(preview.omissionAudit.find(o=>o.decision.conceptCode==='740').quantity,null);
 assert.deepEqual(JSON.parse(JSON.stringify(preview)),preview,'nullable own quantity is preserved in a saved JSON projection');
 const changed=structuredClone(record);changed.omissionAudit.find(o=>o.decision.conceptCode==='740').quantity=record.quantities[0];
 assert.throws(()=>ownReceiptRecord(changed),/auditoría/);
 const missing=structuredClone(record);missing.quantities=missing.quantities.filter(q=>q.conceptCode!=='1');
 assert.throws(()=>ownReceiptRecord(missing),'the actual quantity that supports the decision remains mandatory');
});

test('orphaned or changed predecessor evidence cannot be materialized or rehashed into a valid capture',()=>{
 const missing=successiveTemporalSources();missing.programState.program.definition.familyTariffPolicies.shift();
 assert.throws(()=>prepareOwnPayrollFamilyTariffApprovedInput(missing),payrollError('POLICY_PREDECESSOR_MISSING'));
 const changed=successiveTemporalSources();changed.programState.program.definition.familyTariffPolicies[1].supersedes.policySha256='f'.repeat(64);
 assert.throws(()=>prepareOwnPayrollFamilyTariffApprovedInput(changed),payrollError('POLICY_PREDECESSOR_CHANGED'));
 const capture=temporalCapture(successiveTemporalSources());capture.saved.input.rowEmissionPolicies.shift();capture.saved.inputSha256=hash(capture.saved.input);
 assert.throws(()=>ownOfficialCapture(capture));
});

test('closed evidence needs the retained predecessor even when the active successor is unchanged',async()=>{
 const close=buildOwnOfficialCloseSnapshot(temporalCloseDetail(temporalCapture(successiveTemporalSources())),{kind:'all',values:[]});
 const metadata=close.sources[0].familyTariffCaptureMetadata;metadata.policies.shift();metadata.policySha256=hash(metadata.policies);
 await assert.rejects(verifiedOwnOfficialCloseSnapshot(close),payrollError('POLICY_PREDECESSOR_MISSING'));
});
