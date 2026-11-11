import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {emissionSources,syntheticEmissionPolicies,emissionPreparerEvidence} from './fixtures/own-payroll-row-emission-synthetic.js';
import {sealFamilySources,familyKey} from './fixtures/own-payroll-family-consumer-synthetic.js';
import {command} from './fixtures/own-payroll-program-synthetic.js';
import {lit} from './fixtures/own-payroll-synthetic.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {ownProgramDefinition,ownProgramStructure,ownProgramCommand,ownProgramHistory} from '../assets/own-payroll-program-model.js';
import {proposeC1RowEmissionPolicies} from '../assets/own-payroll-row-emission-program.js';
import {normalizeRowEmissionPolicies,normalizeOwnPayrollRowEmissionInput,calculateOwnPayrollWithRowEmission,rowEmissionBaseInput,rowEmissionBaseResult,selectOwnPayrollReceiptRows} from '../assets/own-payroll-row-emission.js';
import {calculateOwnPayrollWithOfficialTotals} from '../assets/own-payroll-official-totals.js';
import {prepareOwnPayrollInput,prepareOwnPayrollQuantityApprovedInput,prepareOwnPayrollOfficialApprovedInput,prepareOwnPayrollRowEmissionApprovedInput} from '../lib/own-payroll-approved-input.js';
import {createOwnPayrollRowEmissionSnapshot,prepareOwnPayrollRowEmissionSnapshot,verifyOwnPayrollRowEmissionSnapshot,projectOwnPayrollRowEmissionReceipt} from '../lib/own-payroll-row-emission-snapshot.js';
import {prepareOwnPayrollProgrammeSource} from '../lib/own-payroll-programme-source-preparation.js';
import {ownReceiptSnapshot} from '../assets/own-payroll-receipt-model.js';

const codeIs=code=>e=>e&&e.code===code;
const hash=v=>createHash('sha256').update(salarySerialized(v),'utf8').digest('hex');
const build=options=>{const sources=emissionSources(options),snapshot=prepareOwnPayrollRowEmissionSnapshot(sources);return{sources,snapshot,receipt:projectOwnPayrollRowEmissionReceipt(snapshot,sources.programState,snapshot.input.employees[0].contractId)};};
const concepts=r=>r.concepts.map(c=>c.code);
const row=(r,code,contractId=r.employeeTotals[0].contractId)=>r.rows.find(r=>r.contractId===contractId&&r.conceptCode===code&&r.nature!=='auxiliary');
const rehash=s=>{s.inputSha256=hash(s.input);s.resultSha256=hash(s.result);s.baseResultSha256=hash(rowEmissionBaseResult(s.result));s.rowEmissionPolicySha256=hash(s.input.rowEmissionPolicies);return s;};

test('October302/306 omissions affect receipt selection only; original rows, exact quantities, traces and reconciliation survive',()=>{
 const {snapshot:s,receipt:r}=build({days:'14'}),base=calculateOwnPayrollWithOfficialTotals(rowEmissionBaseInput(s.input));
 assert.deepEqual(rowEmissionBaseResult(s.result),base);
 assert.deepEqual(concepts(r),['1','48']);assert.equal(r.omittedRowCount,2);assert.equal(r.economicRowCount,12);
 assert.equal(s.result.rowCount,12);assert.equal(s.result.receiptRowCount,2);assert.equal(s.result.emissionDecisionCount,2);
 for(const a of r.omissionAudit){assert.equal(a.decision.decision,'omit');assert.equal(a.calculatedRow.amount,'0.00');assert.deepEqual(a.calculatedRow.exactValue,{numerator:'0',denominator:'1'});assert.ok(a.calculatedRow.trace.length);assert.equal(a.decision.conditions[0].passed,false);assert.equal(a.quantity.unit,'units');assert.equal(a.quantity.stage,'exact');}
 assert.equal(r.totals.net,'200.01');assert.equal(r.lineTotals.net,'200.02');assert.deepEqual(r.totalReconciliation,base.totalReconciliations[0]);
 assert.equal(r.economicTotalsUnchanged,true);assert.equal(r.officialReceiptReady,false);assert.equal(r.approved,false);assert.equal(r.payrollPosted,false);assert.equal(r.paymentExecuted,false);
});

test('positive entitlement keeps302/306 and preserves exact amounts',()=>{
 const {receipt:r,snapshot:s}=build({days:'15',children:'2',primary:'3'});
 assert.deepEqual(concepts(r),['1','302','306','48']);assert.equal(r.omittedRowCount,0);assert.equal(row(s.result,'302').amount,'40.00');assert.equal(row(s.result,'306').amount,'90.00');
 assert.ok(s.result.rowEmissions.every(d=>d.decision==='emit'&&d.conditions.every(c=>c.passed)));
});

test('eligibility compares exact U1, including the first fraction above14',()=>{
 assert.equal(build({days:'14.00000000'}).receipt.omittedRowCount,2);
 const {receipt:r,snapshot:s}=build({days:'14.00000001'});assert.equal(r.omittedRowCount,0);assert.deepEqual(s.result.rowEmissions[0].conditions[0].observed,{numerator:'1400000001',denominator:'100000000'});
});

test('zero beneficiaries are explicit absence of entitlement, while an eligible zero tariff remains visible',()=>{
 const absent=build({children:'0',primary:'0'});assert.equal(absent.receipt.omittedRowCount,2);
 const legitimate=build({rate302:'0.00',rate306:'0.00'});assert.deepEqual(concepts(legitimate.receipt),['1','302','306','48']);assert.equal(legitimate.receipt.omittedRowCount,0);assert.equal(row(legitimate.snapshot.result,'302').amount,'0.00');
});

test('missing quantities and tariffs remain errors, including a monetary branch that would return zero',()=>{
 for(const field of ['childrenWithDisability','primary']){const s=emissionSources({days:'14'});s.familyPayrollFacts.records[0].definition.quantities[field]=null;sealFamilySources(s);assert.throws(()=>prepareOwnPayrollRowEmissionSnapshot(s),e=>/INPUT_MISSING$/.test(e.code));}
 for(const days of ['14','30'])for(const code of ['302','306']){const s=emissionSources({days});s.programState.salaryCatalog.items.find(d=>d.code===code).value=null;assert.throws(()=>prepareOwnPayrollRowEmissionSnapshot(s));}
});

test('negative or fractional family declarations cannot be interpreted as no entitlement',()=>{
 for(const invalid of ['-1','1.5']){const s=emissionSources();s.familyPayrollFacts.records[0].definition.quantities.childrenWithDisability=invalid;sealFamilySources(s);assert.throws(()=>prepareOwnPayrollRowEmissionSnapshot(s),e=>/^FAMILY_PAYROLL_FACTS_/.test(e.code));}
 // Even a directly supplied V5 quantity phase cannot turn an invalid count into omission.
 const input=prepareOwnPayrollRowEmissionApprovedInput(emissionSources({children:'0'}));
 for(const invalid of ['-1','0.5']){const bad=structuredClone(input);bad.quantityPhases.find(q=>q.code==='302').expression=lit(invalid,'units');assert.throws(()=>calculateOwnPayrollWithRowEmission(bad),codeIs('ROW_EMISSION_QUANTITY_INVALID'));}
});

test('false eligibility cannot hide a nonzero amount or a nonzero exact value rounded to zero',()=>{
 for(const value of ['0.001','0.01','-0.001']){const input=prepareOwnPayrollRowEmissionApprovedInput(emissionSources({days:'14'}));input.rules.find(r=>r.code==='302').expression=lit(value,'money');assert.throws(()=>calculateOwnPayrollWithRowEmission(input),codeIs('ROW_EMISSION_NONZERO_CONTRIBUTION'));}
});

test('unrelated zero rows and exact R302 references remain economic and visible',()=>{
 const {snapshot:s,receipt:r}=build({days:'14',dependent:true});
 assert.deepEqual(concepts(r),['1','310','48']);assert.equal(r.concepts.find(c=>c.code==='310').amount,'0.00');
 assert.ok(row(s.result,'310').trace.some(t=>t.operation==='concept'&&t.reference==='concept:302'&&t.stage==='exact'));
 assert.equal(s.result.quantities.find(q=>q.conceptCode==='302').value.numerator,'1');assert.equal(row(s.result,'302').exactValue.numerator,'0');
 assert.deepEqual(rowEmissionBaseResult(s.result),calculateOwnPayrollWithOfficialTotals(rowEmissionBaseInput(s.input)));
});

test('each selected employee receives complete decisions; another employee cannot supply the eligibility quantity',()=>{
 const sources=emissionSources({count:3});sources.familyPayrollFacts.records[1].definition.quantities.childrenWithDisability='0';sources.familyPayrollFacts.records[2].definition.quantities.primary='0';sealFamilySources(sources);
 const s=prepareOwnPayrollRowEmissionSnapshot(sources);assert.equal(s.result.employeeCount,3);assert.equal(s.result.rowCount,36);assert.equal(s.result.emissionDecisionCount,6);assert.equal(s.result.receiptRowCount,10);
 const expected=[[],['302'],['306']];for(const [i,e]of s.input.employees.entries()){const r=projectOwnPayrollRowEmissionReceipt(s,sources.programState,e.contractId);assert.deepEqual(r.omissionAudit.map(a=>a.calculatedRow.conceptCode),expected[i]);}
 const selected=structuredClone(sources);selected.selection={kind:'contracts',values:[sources.population.employees[2].contractId]};const one=prepareOwnPayrollRowEmissionSnapshot(selected);assert.equal(one.result.employeeCount,1);assert.equal(one.result.emissionDecisionCount,2);assert.ok(one.result.rowEmissions.every(d=>d.contractId===selected.selection.values[0]));
 assert.throws(()=>projectOwnPayrollRowEmissionReceipt(one,selected.programState,sources.population.employees[0].contractId),codeIs('ROW_EMISSION_RECEIPT_SCOPE_INVALID'));
});

test('old adapters require an explicit new version and cannot silently ignore its policy',()=>{
 const sources=emissionSources();for(const adapter of [prepareOwnPayrollInput,prepareOwnPayrollQuantityApprovedInput,prepareOwnPayrollOfficialApprovedInput])assert.throws(()=>adapter(sources),codeIs('ROW_EMISSION_OPT_IN_REQUIRED'));
 assert.throws(()=>prepareOwnPayrollRowEmissionApprovedInput(emissionSources({optIn:false})),codeIs('ROW_EMISSION_PROGRAM_REQUIRED'));
});

test('legacy V4 keeps choose(false,...,0) rows with no selection policy',()=>{
 const input=prepareOwnPayrollOfficialApprovedInput(emissionSources({days:'14',optIn:false})),result=calculateOwnPayrollWithOfficialTotals(input);
 assert.equal(input.version,'own-payroll-input.v4');assert.equal(result.version,'own-payroll-result.v4');assert.equal(result.rowCount,12);assert.equal(row(result,'302').amount,'0.00');assert.equal(row(result,'306').amount,'0.00');assert.equal(Object.hasOwn(result,'rowEmissions'),false);assert.equal(Object.hasOwn(result,'receiptRowKeys'),false);
 assert.throws(()=>normalizeOwnPayrollRowEmissionInput(input),codeIs('ROW_EMISSION_VERSION_INVALID'));
});

test('policy is restricted to the reported scope and cannot infer manual315/316, obsolete659, another month or a floor',()=>{
 for(const change of [p=>p.conceptCode='315',p=>p.conceptCode='316',p=>p.conceptCode='659',p=>p.agreementCode='2',p=>p.period='2026-11',p=>p.liquidationType='sac',p=>p.floor='300000',p=>p.conditions[0].value='15',p=>p.conditions[1].quantityCode='1']){const policies=syntheticEmissionPolicies();change(policies[0]);assert.throws(()=>normalizeRowEmissionPolicies(policies));}
 const declared=syntheticEmissionPolicies()[0],proposed=proposeC1RowEmissionPolicies({sourceReference:declared.sourceReference,sourceSha256:declared.sourceSha256});assert.deepEqual(proposed,syntheticEmissionPolicies());
});

test('scope binds exact unit and original quantity phase and retains the official995 contribution',()=>{
 for(const mutate of [p=>p.quantityPhases=p.quantityPhases.filter(q=>q.code!=='1'),p=>p.quantityPhases.find(q=>q.code==='302').stage='rounded',p=>p.officialTotalsPolicies[0].contributions['995']=['306']]){const p=emissionSources().programState.program.definition;mutate(p);assert.throws(()=>ownProgramStructure(p));}
 const input=prepareOwnPayrollRowEmissionApprovedInput(emissionSources());input.rowEmissionPolicies[0].period='2026-11';assert.throws(()=>calculateOwnPayrollWithRowEmission(input));
});

test('a historical emission decision cannot be removed or reinterpreted, and proposal remains blocked',()=>{
 const sources=emissionSources(),before=sources.programState.program.definition;
 ownProgramHistory(null,before);ownProgramHistory(before,structuredClone(before));
 for(const change of [p=>{delete p.rowEmissionVersion;delete p.rowEmissionPolicies;},p=>p.rowEmissionPolicies.pop(),p=>p.rowEmissionPolicies[0].sourceSha256='b'.repeat(64)]){const after=structuredClone(before);change(after);assert.throws(()=>ownProgramHistory(before,after),codeIs('PROGRAM_HISTORY_REQUIRED'));}
 assert.throws(()=>ownProgramCommand(command({program:before}),sources.programState.salaryCatalog.items),codeIs('PROGRAM_ROW_EMISSION_PREPARATION_ONLY'));
});

test('source preparation keeps the complete candidate for review but never marks V5 presentable or approved',()=>{
 const raw=emissionPreparerEvidence(),r=prepareOwnPayrollProgrammeSource(raw);assert.deepEqual(r.incidents.map(i=>i.code),['PROGRAM_ROW_EMISSION_PREPARATION_ONLY']);
 assert.ok(r.draft.programme);assert.equal(r.completeness.programmeContractComplete,true);assert.equal(r.presentable.programme,false);assert.equal(r.status,'not_presentable');assert.equal(r.approved,false);assert.equal(r.executable,false);assert.equal(r.payrollCalculated,false);
 assert.deepEqual(r.draft.programme.rowEmissionPolicies,raw.programmeOptions.rowEmissionPolicies);assert.equal(r.draft.programme.quantityPhases.length,3);assert.equal(r.draft.programme.rules.length,12);ownProgramDefinition(r.draft.programme,raw.salary.catalog.items);
});

test('snapshot and projection are immutable, deterministic and tied to original program labels',()=>{
 const sources=emissionSources({days:'14'}),s=prepareOwnPayrollRowEmissionSnapshot(sources),r=projectOwnPayrollRowEmissionReceipt(s,sources.programState,s.input.employees[0].contractId);
 assert.deepEqual(s,prepareOwnPayrollRowEmissionSnapshot(sources));assert.deepEqual(verifyOwnPayrollRowEmissionSnapshot(s),s);assert.ok(Object.isFrozen(s.result.rowEmissions[0].conditions[0]));assert.ok(Object.isFrozen(r.omissionAudit[0].calculatedRow));
 assert.throws(()=>{s.result.receiptRowKeys.push('extra');},TypeError);assert.throws(()=>{r.omissionAudit[0].calculatedRow.amount='1.00';},TypeError);
 sources.familyPayrollFacts.records[0].definition.quantities.childrenWithDisability='3';sealFamilySources(sources);assert.equal(s.input.employees[0].inputs.find(i=>i.key===familyKey('childrenWithDisability')).value,'1.00000000');
 const changed=structuredClone(sources.programState);changed.salaryCatalog.items.find(d=>d.code==='1').label='Changed current label';assert.throws(()=>projectOwnPayrollRowEmissionReceipt(s,changed,s.input.employees[0].contractId),codeIs('ROW_EMISSION_LABEL_SOURCE_CHANGED'));
 assert.equal(r.inputSha256,s.inputSha256);assert.equal(r.resultSha256,s.resultSha256);assert.equal(r.baseResultSha256,s.baseResultSha256);assert.equal(r.rowEmissionPolicySha256,s.rowEmissionPolicySha256);
 assert.throws(()=>ownReceiptSnapshot(r)); // Candidate preview cannot enter the approved receipt/PDF reader.
});

test('rehashed altered decisions, selectors, rows, quantities and truncated audit fail replay from the frozen input',()=>{
 const {snapshot}=build({days:'14'});
 const mutations=[s=>s.result.receiptRowKeys.push(s.result.rowEmissions[0].rowKey),s=>s.result.rowEmissions.pop(),s=>s.result.rowEmissions[0].conditions[0].passed=true,s=>s.result.rowEmissions[0].conditions[0].observed.numerator='15',s=>s.result.rowEmissions[0].sourceSha256='b'.repeat(64),s=>s.result.quantities.pop(),s=>s.result.rows.pop(),s=>s.result.receiptRowCount++,s=>s.result.rowEmissions[0].contractId=s.input.employees[0].contractId.replace(/.$/,'9')];
 for(const mutate of mutations){const changed=structuredClone(snapshot);mutate(changed);rehash(changed);assert.throws(()=>verifyOwnPayrollRowEmissionSnapshot(changed),codeIs('ROW_EMISSION_RESULT_MISMATCH'));}
 const changed=structuredClone(snapshot);changed.result.rowEmissions[0].reason='manual';assert.throws(()=>verifyOwnPayrollRowEmissionSnapshot(changed),codeIs('ROW_EMISSION_SNAPSHOT_CHANGED'));
});

test('policy changes are part of source identity and need new input/result hashes',()=>{
 const a=emissionSources(),b=structuredClone(a);b.programState.program.definition.rowEmissionPolicies[0].sourceSha256='b'.repeat(64);
 const first=prepareOwnPayrollRowEmissionSnapshot(a),second=prepareOwnPayrollRowEmissionSnapshot(b);assert.notEqual(first.input.sourceVersions.rules,second.input.sourceVersions.rules);assert.notEqual(first.inputSha256,second.inputSha256);assert.notEqual(first.resultSha256,second.resultSha256);assert.notEqual(first.rowEmissionPolicySha256,second.rowEmissionPolicySha256);
 assert.deepEqual(first.result.rows.map(r=>r.amount),second.result.rows.map(r=>r.amount));
});

test('partial or executable policy data is rejected without invoking supplied getters',()=>{
 const duplicate=syntheticEmissionPolicies();duplicate[1]=structuredClone(duplicate[0]);assert.throws(()=>normalizeRowEmissionPolicies(duplicate),codeIs('ROW_EMISSION_POLICY_DUPLICATE'));
 const sparse=syntheticEmissionPolicies();delete sparse[1];assert.throws(()=>normalizeRowEmissionPolicies(sparse),codeIs('ROW_EMISSION_CONTRACT_INVALID'));
 let accessed=false;const p=syntheticEmissionPolicies();Object.defineProperty(p[0],'sourceReference',{enumerable:true,get(){accessed=true;return'Injected reference';}});assert.throws(()=>normalizeRowEmissionPolicies(p),codeIs('ROW_EMISSION_CONTRACT_INVALID'));assert.equal(accessed,false);
 const s=structuredClone(build({days:'14'}).snapshot);Object.defineProperty(s.result.rowEmissions[0],'reason',{enumerable:true,get(){accessed=true;return'conditions_not_met';}});assert.throws(()=>verifyOwnPayrollRowEmissionSnapshot(s),codeIs('ROW_EMISSION_CONTRACT_INVALID'));assert.equal(accessed,false);
});

test('selection and audit cover the complete37-person synthetic set and reject lost source records',()=>{
 const sources=emissionSources({count:37,days:'14'}),s=prepareOwnPayrollRowEmissionSnapshot(sources);assert.equal(s.result.employeeCount,37);assert.equal(s.result.rowCount,444);assert.equal(s.result.quantities.length,111);assert.equal(s.result.receiptRowCount,74);assert.equal(s.result.emissionDecisionCount,74);assert.equal(selectOwnPayrollReceiptRows(s.input,s.result).length,74);
 const last=s.input.employees.at(-1);assert.equal(s.result.rowEmissions.filter(d=>d.contractId===last.contractId).length,2);assert.equal(projectOwnPayrollRowEmissionReceipt(s,sources.programState,last.contractId).omittedRowCount,2);
 sources.familyPayrollFacts.records.pop();assert.throws(()=>prepareOwnPayrollRowEmissionSnapshot(sources),e=>/^FAMILY_PAYROLL_FACTS_/.test(e.code));
});
