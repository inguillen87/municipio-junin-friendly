// Composition tests: requires the separately reviewed temporal consumer patch.
// All approvals, identities, sources and economic values below are synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {ownProgramDefinition} from '../assets/own-payroll-program-model.js';
import {policySha256} from '../assets/own-payroll-policy-validity.js';
import {familyTariffPolicyId} from '../assets/own-payroll-family-tariffs.js';
import {rowEmissionPolicyId,normalizeRowEmissionPolicies} from '../assets/own-payroll-row-emission.js';
import {prepareOwnPayrollFamilyTariffSnapshot,verifyOwnPayrollFamilyTariffSnapshot} from '../lib/own-payroll-family-tariff-snapshot.js';
import {prepareOwnPayrollProgrammeSource} from '../lib/own-payroll-programme-source-preparation.js';
import {createOwnPayrollNonapplicationPreview} from '../lib/own-payroll-nonapplication-preview.js';
import {temporalPolicySources,temporalTariffPolicy,temporalEmissionPolicies} from './fixtures/own-payroll-policy-validity-synthetic.js';
import {temporalNonapplicationFixture} from './fixtures/own-payroll-nonapplication-validity-synthetic.js';
import {emissionPreparerEvidence} from './fixtures/own-payroll-row-emission-synthetic.js';
import {args} from './fixtures/own-payroll-nonapplication-synthetic.js';

for(const period of ['2027-09','2028-12','2031-01'])test('composed normal consumer captures tariff and emission in '+period,()=>{
 const sources=temporalPolicySources({period,validFrom:'2027-01',validUntil:null}),snapshot=prepareOwnPayrollFamilyTariffSnapshot(sources);
 assert.equal(snapshot.input.version,'own-payroll-input.v5');assert.equal(snapshot.input.familyTariffsVersion,'own-payroll-family-tariffs.v3');assert.equal(snapshot.input.rowEmissionVersion,'own-payroll-row-emission.v2');assert.equal(snapshot.input.familyTariffCapture.period,period);assert.equal(snapshot.result.rowEmissions.length,2);assert.deepEqual(verifyOwnPayrollFamilyTariffSnapshot(snapshot),snapshot);assert.equal(snapshot.approved,false);assert.equal(snapshot.payrollPosted,false);
});
test('normal proposal preparation accepts declared future policies without granting approval',()=>{
 const sources=temporalPolicySources({period:'2028-10',validFrom:'2027-01',validUntil:null}),evidence=emissionPreparerEvidence(sources);evidence.period=sources.period;
 const result=prepareOwnPayrollProgrammeSource(evidence);assert.deepEqual(result.incidents,[]);assert.equal(result.presentable.programme,true);assert.equal(result.draft.programme.familyTariffsVersion,'own-payroll-family-tariffs.v3');assert.equal(result.draft.programme.rowEmissionVersion,'own-payroll-row-emission.v2');assert.equal(result.approved,false);assert.equal(result.executable,false);
});
test('composed consumer retains predecessor ID+hash and only uses the successor in the later period',()=>{
 const sources=temporalPolicySources({period:'2028-08',validFrom:'2026-08',validUntil:null}),program=sources.programState.program.definition,priorTariff=program.familyTariffPolicies[0],priorEmission=program.rowEmissionPolicies;
 program.familyTariffPolicies.push(temporalTariffPolicy({validFrom:'2027-01',validUntil:null,rate:'9.00',supersedes:{policyId:familyTariffPolicyId(priorTariff),policySha256:policySha256(priorTariff)}}));
 const successors=temporalEmissionPolicies({validFrom:'2027-01',validUntil:null}).map(p=>{const prior=priorEmission.find(q=>q.conceptCode===p.conceptCode);return{...p,supersedes:{policyId:rowEmissionPolicyId(prior),policySha256:policySha256(prior)}};});
 program.rowEmissionPolicies=normalizeRowEmissionPolicies([...priorEmission,...successors],program.rowEmissionVersion);
 program.officialTotalsPolicies.unshift({...structuredClone(program.officialTotalsPolicies[0]),period:'2026-12',sourceReference:'Invented prior complete monthly total declaration for QA'});
 sources.programState.program.definition=ownProgramDefinition(program,sources.programState.salaryCatalog.items);
 const snapshot=prepareOwnPayrollFamilyTariffSnapshot(sources);assert.equal(snapshot.input.familyTariffCapture.policies.length,2);assert.equal(snapshot.input.rowEmissionPolicies.length,4);assert.ok(snapshot.result.rowEmissions.every(d=>d.policyKey.includes('2027-01')));assert.equal(snapshot.result.rows.find(r=>r.conceptCode==='302').amount,'9.00');assert.equal(salarySerialized(snapshot.input.familyTariffCapture.policies[0]),salarySerialized(priorTariff));assert.deepEqual(verifyOwnPayrollFamilyTariffSnapshot(snapshot),snapshot);
});
for(const period of ['2027-11','2028-02'])test('composed nonapplication preview respects distinct agreement and monthly evidence in '+period,()=>{
 const f=temporalNonapplicationFixture({period}),preview=createOwnPayrollNonapplicationPreview(args(f));
 assert.equal(preview.input.nonApplicationVersion,'own-payroll-nonapplication.v2');assert.equal(preview.input.calculationInput.period,period);assert.equal(preview.nonApplicationDecisions.length,4);assert.ok(preview.result.rows.every(r=>r.agreementCode==='7'&&!['740','741'].includes(r.conceptCode)));assert.equal(preview.approved,false);assert.equal(preview.registered,false);assert.equal(preview.officialReceiptReady,false);
});
test('composed nonapplication consumer refuses sources from another month despite an open declaration',()=>{
 const f=temporalNonapplicationFixture({period:'2027-11'});f.sources.period='2027-12';assert.throws(()=>createOwnPayrollNonapplicationPreview(args(f)),e=>e?.code==='NONAPPLICATION_SOURCE_CHANGED');
});
