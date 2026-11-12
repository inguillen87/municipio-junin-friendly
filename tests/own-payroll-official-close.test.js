import test from 'node:test';
import assert from 'node:assert/strict';
import {officialCloseCorpus,officialCapture,officialCloseDetail,officialCloseReceipt,hash} from './fixtures/own-payroll-official-close-synthetic.js';
import {closeDetail as historicalDetail} from './fixtures/own-payroll-close-synthetic.js';
import {ownOfficialCapture,verifiedOwnOfficialCapture,ownOfficialCloseSnapshot,verifiedOwnOfficialEconomicSource,ownOfficialEconomicEvidence,buildOwnOfficialCloseSnapshot} from '../assets/own-payroll-official-snapshot-model.js';
import {ownCloseSavedTotals,ownCloseDetail,ownCloseSnapshot,ownCloseReceipt,verifiedOwnCloseDetail,verifiedOwnCloseReceipt} from '../assets/own-payroll-close-model.js';
import {calculateOwnPayrollWithRowEmission} from '../assets/own-payroll-row-emission.js';

const all={kind:'all',values:[]};
const make=name=>ownCloseSnapshot(officialCloseDetail(name),all);
for(const fixture of officialCloseCorpus)test('capture and close preserve original evidence: '+fixture.name,async()=>{
 const detail=officialCloseDetail(fixture.name),capture=detail.captures[0],before=JSON.stringify(detail);
 const read=ownOfficialCapture(capture);assert.equal(read.input,capture.saved.input);assert.equal(read.result,capture.saved.result);assert.equal(read.people.size,capture.saved.input.employees.length);
 assert.equal(ownCloseSavedTotals(capture),capture);ownCloseDetail(detail);await verifiedOwnCloseDetail(detail);
 const snapshot=ownCloseSnapshot(detail,all);assert.deepEqual(snapshot,buildOwnOfficialCloseSnapshot(detail,all));assert.equal(ownOfficialCloseSnapshot(snapshot),snapshot);
 assert.equal(snapshot.conceptCount,capture.saved.result.rowCount);assert.deepEqual(snapshot.concepts,capture.saved.result.rows);assert.equal(snapshot.economicRowsPreserved,true);
 for(const e of snapshot.employees){assert.deepEqual(e.totals,capture.saved.result.employeeTotals.find(t=>t.contractId===e.contractId));assert.deepEqual(e.lineTotals,capture.saved.result.lineEmployeeTotals.find(t=>t.contractId===e.contractId));}
 const receipt=officialCloseReceipt(snapshot);assert.equal(ownCloseReceipt(receipt),receipt);await verifiedOwnCloseReceipt(receipt);
 assert.equal(JSON.stringify(detail),before);assert.equal(snapshot.payrollPosted,false);assert.equal(snapshot.paymentExecuted,false);
});

test('V5 keeps 200.02 in lines, 200.01 official and -0.01 in reconciliation without an invented row',()=>{
 const s=make('days14_both_omitted');assert.equal(s.totals.net,'200.01');assert.equal(s.lineTotals.net,'200.02');assert.equal(s.netDifferenceFromLines,'-0.01');
 assert.equal(s.conceptCount,12);assert.equal(s.receiptRowCount,2);assert.deepEqual(s.employees[0].rowEmissions.map(d=>[d.conceptCode,d.decision]),[['302','omit'],['306','omit']]);assert.equal(s.employees[0].totalReconciliation.reconciliationIsPayrollConcept,false);
 assert.deepEqual(s.concepts.filter(r=>['302','306'].includes(r.conceptCode)).map(r=>r.amount),['0.00','0.00']);
});
test('V4 zero rows remain visible and eligible V5 zero tariff rows remain visible',()=>{
 for(const name of ['legacy_v4_unchanged','eligible_zero_tariffs']){const s=make(name);assert.equal(s.receiptRowCount,4);for(const code of ['302','306'])assert.ok(s.employees[0].receiptRowKeys.includes(s.employees[0].contractId+':concept:'+code));}
 assert.equal(make('legacy_v4_unchanged').version,'own-close-snapshot.v4');
});
test('partial selection carries only selected family records while retaining the original policy table',()=>{
 const d=officialCloseDetail('tariff_v2_eligible_two'),s=ownCloseSnapshot(d,{kind:'contracts',values:[d.rows[1].contractId]});assert.equal(s.employeeCount,1);assert.equal(s.populationCount,2);assert.equal(s.populationComplete,false);assert.equal(s.sources.length,1);
 assert.equal(s.employees[0].familyTariffRecord.contractId,d.rows[1].contractId);assert.ok(!Object.hasOwn(s.sources[0].familyTariffCaptureMetadata,'records'));assert.equal(s.concepts.length,20);assert.equal(s.familyTariffDecisionCount,10);
 assert.deepEqual(s.sources[0].familyTariffCaptureMetadata.policies,d.captures[0].saved.input.familyTariffCapture.policies);
});
test('mixed close keeps historical V1 unchanged and opt-in follows selected captures only',()=>{
 const d=officialCloseDetail(),old=historicalDetail(2),oldRow=old.rows[1],oldCapture=old.captures.find(c=>c.id===oldRow.runId);
 d.rows.push(oldRow);d.captures.push(oldCapture);const before=JSON.stringify(oldCapture),s=ownCloseSnapshot(d,all);
 assert.equal(s.version,'own-close-snapshot.v5');assert.equal(s.employeeCount,2);const e=s.employees.find(e=>e.contractId===oldRow.contractId);assert.equal(e.inputVersion,'own-payroll-input.v1');assert.deepEqual(e.totals,e.lineTotals);assert.equal(e.totalReconciliation,null);assert.equal(JSON.stringify(oldCapture),before);
 const historicalOnly=ownCloseSnapshot(d,{kind:'contracts',values:[oldRow.contractId]});assert.equal(historicalOnly.version,'own-close-snapshot.v2');assert.ok(!Object.hasOwn(historicalOnly,'sources'));
});
test('shared economic check works without an employee identity envelope for receipt projection',()=>{
 const s=make('days14_both_omitted'),e=s.employees[0];const value={contractId:e.contractId,rows:s.concepts,totals:e.totals,lineTotals:e.lineTotals,totalReconciliation:e.totalReconciliation,quantities:e.quantities,familyTariffDecisions:e.familyTariffDecisions,familyTariffRecord:e.familyTariffRecord,rowEmissions:e.rowEmissions,receiptRowKeys:e.receiptRowKeys,sourceEvidence:s.sources[0],precision:e.precision,inputVersion:e.inputVersion,resultVersion:e.resultVersion};assert.equal(ownOfficialEconomicEvidence(value),value);
});
test('V4 cannot lose an unrelated quantity even if aggregate counts are rewritten',()=>{
 const s=make('legacy_v4_unchanged');s.employees[0].quantities.pop();s.quantityCount--;assert.throws(()=>ownOfficialCloseSnapshot(s));
});
test('quantity evidence must preserve the source phase metadata and complete declared coverage',()=>{
 for(const mutate of [s=>{delete s.sources[0].quantityPhases;},s=>{s.employees[0].quantities[0].sourceSha256='f'.repeat(64);},s=>{s.employees[0].quantities.reverse();}]){const s=make('legacy_v4_unchanged');mutate(s);assert.throws(()=>ownOfficialCloseSnapshot(s));}
});
test('async verification checks the original tariff policy hash even when advertised hashes are internally consistent',async()=>{
 const s=make('tariff_v2_eligible_two'),source=s.sources[0];source.familyTariffCaptureMetadata.policySha256='f'.repeat(64);for(const e of s.employees)for(const d of e.familyTariffDecisions)d.policySha256='f'.repeat(64);
 ownOfficialCloseSnapshot(s);await assert.rejects(verifiedOwnOfficialEconomicSource(source));
 const r=officialCloseReceipt(s);await assert.rejects(verifiedOwnCloseReceipt(r));
});

const mutations=[
 ['official replaced by line total',s=>{s.employees[0].totals=structuredClone(s.employees[0].lineTotals);}],
 ['reconciliation hidden',s=>{s.employees[0].totalReconciliation=null;}],
 ['difference rewritten as zero',s=>{s.netDifferenceFromLines='0.00';}],
 ['economic zero row deleted',s=>{s.concepts=s.concepts.filter(r=>r.conceptCode!=='302');s.conceptCount--;s.employees[0].conceptCount--;}],
 ['economic row duplicated',s=>{s.concepts.push(structuredClone(s.concepts[0]));s.conceptCount++;s.employees[0].conceptCount++;}],
 ['foreign row',s=>{s.concepts[0].contractId='90000000-0000-4000-8000-000000000999';}],
 ['nonzero exact amount hidden',s=>{s.concepts.find(r=>r.nature!=='auxiliary'&&r.conceptCode==='302').exactValue={numerator:'1',denominator:'1000'};}],
 ['family quantity missing',s=>{s.employees[0].quantities=s.employees[0].quantities.filter(q=>q.conceptCode!=='302');s.quantityCount--;}],
 ['emission decision removed',s=>{s.employees[0].rowEmissions.pop();s.emissionDecisionCount--;}],
 ['emission predicate forged',s=>{s.employees[0].rowEmissions[0].conditions[0].passed=true;}],
 ['emission source forged',s=>{s.employees[0].rowEmissions[0].sourceSha256='f'.repeat(64);}],
 ['unrelated row hidden',s=>{s.employees[0].receiptRowKeys.pop();s.receiptRowCount--;}],
 ['auxiliary printed',s=>{const r=s.concepts.find(r=>r.nature==='auxiliary');s.employees[0].receiptRowKeys.push(r.contractId+':auxiliary:'+r.conceptCode);s.receiptRowCount++;}],
 ['source hash changed',s=>{s.sources[0].resultSha256='f'.repeat(64);}],
 ['source dropped',s=>{s.sources=[];}],
 ['source duplicated',s=>{s.sources.push(structuredClone(s.sources[0]));}],
 ['policy threshold altered',s=>{s.sources[0].rowEmissionPolicies[0].conditions[0].value='13';}],
 ['snapshot version downgrade',s=>{s.version='own-close-snapshot.v4';}],
 ['namespace removed',s=>{delete s.employees[0].namespaceVersion;}],
 ['false coverage',s=>{s.populationCount++;}],
 ['extra nominal field',s=>{s.employees[0].dni='00000000';}],
 ['executed payment asserted',s=>{s.paymentExecuted=true;}],
];
for(const [label,mutate] of mutations)test('rejects close tampering: '+label,()=>{const s=make('days14_both_omitted');mutate(s);assert.throws(()=>ownOfficialCloseSnapshot(s));});
for(const [label,mutate] of [
 ['resolved amount',e=>{e.familyTariffDecisions[0].value='1.00000000';}],
 ['read count',e=>{e.familyTariffDecisions[0].readCount++;}],
 ['missing decision',e=>{e.familyTariffDecisions.pop();}],
 ['different family record',e=>{e.familyTariffRecord.contractId='90000000-0000-4000-8000-000000000999';}],
 ['different region',e=>{e.familyTariffRecord.regionCode='999';}],
])test('rejects tariff evidence tampering: '+label,()=>{const s=make('tariff_v2_eligible_two');mutate(s.employees[0]);assert.throws(()=>ownOfficialCloseSnapshot(s));});

test('capture recalculation rejects a forged result even if its advertised hash is changed',()=>{
 const c=officialCapture();c.saved.result.receiptRowKeys.push(c.saved.input.employees[0].contractId+':concept:302');c.saved.result.receiptRowCount++;c.saved.resultSha256=hash(c.saved.result);assert.throws(()=>ownOfficialCapture(c));
});
test('changing a family input and recalculating does not replace its original approved fact',()=>{
 const c=officialCapture('eligible_positive');c.saved.input.employees[0].inputs.find(i=>i.key==='family_primary').value='2.00000000';c.saved.result=calculateOwnPayrollWithRowEmission(c.saved.input);c.saved.inputSha256=hash(c.saved.input);c.saved.resultSha256=hash(c.saved.result);assert.throws(()=>ownOfficialCapture(c));
});
test('async verification rejects original source hashes, body and frozen family definition changes',async()=>{
 for(const mutate of [c=>{c.bodySha256='f'.repeat(64);},c=>{c.payloadSha256='f'.repeat(64);},c=>{c.saved.inputSha256='f'.repeat(64);},c=>{c.saved.resultSha256='f'.repeat(64);},c=>{c.payload.monthly.complete=false;},c=>{c.payload.familyPayrollFacts.records[0].definition.quantities.primary='2';}]){const c=officialCapture();mutate(c);await assert.rejects(verifiedOwnOfficialCapture(c));}
});
test('private readers never execute a supplied getter or silently drop additional fields',()=>{
 let invoked=0;const c=officialCapture();Object.defineProperty(c.saved.input,'rules',{enumerable:true,get(){invoked++;throw Error('executed getter');}});assert.throws(()=>ownOfficialCapture(c));assert.equal(invoked,0);
 const s=make('days14_both_omitted');s.extra='unexpected';assert.throws(()=>ownOfficialCloseSnapshot(s));
});
test('read-only, unconfirmed and independently unreviewed details cannot construct a close',()=>{
 for(const mutate of [d=>{d.canWrite=false;},d=>{d.rows[0].canClose=false;},d=>{d.rows[0].state='missing';},d=>{d.rows[0].groupId='90000000-0000-4000-8000-000000000999';},d=>{d.rows.push(structuredClone(d.rows[0]));},d=>{d.captures.push(structuredClone(d.captures[0]));}]){const d=officialCloseDetail();mutate(d);assert.throws(()=>buildOwnOfficialCloseSnapshot(d,all));}
});
test('new close receipt still verifies full snapshot hash and the original attempt',async()=>{
 const s=make('days14_both_omitted'),r=officialCloseReceipt(s);await verifiedOwnCloseReceipt(r,{key:r.key,body:r.body,snapshot:s});r.snapshotSha256='f'.repeat(64);await assert.rejects(verifiedOwnCloseReceipt(r));
 assert.throws(()=>ownCloseReceipt(officialCloseReceipt(s),{key:'90000000-0000-4000-8000-000000000999',body:r.body}));
});
