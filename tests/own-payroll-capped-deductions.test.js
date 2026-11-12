import {adjustmentSources} from './fixtures/own-payroll-declared-adjustments-synthetic.js';
import {forcedValiditySources,forcedValiditySnapshot} from './fixtures/own-monthly-forced-validity-synthetic.js';
import {describeProgramPolicy} from '../assets/own-payroll-program-workspace-model.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {cappedFixture,cappedCapture} from './fixtures/own-payroll-capped-deductions-synthetic.js';
import {officialCapture,officialCloseDetail,officialCloseReceipt} from './fixtures/own-payroll-official-close-synthetic.js';
import {cappedStepExpressions,captureCappedPolicies,normalizeCappedPolicies,normalizeCappedCapture,normalizeCappedProgram,cappedProgramHistory,verifyCappedSource,verifyCappedResult} from '../assets/own-payroll-capped-deductions.js';
import {calculateOwnPayrollWithOfficialTotals,verifyOwnPayrollOfficialProjection} from '../assets/own-payroll-official-totals.js';
import {calculateOwnPayrollWithRowEmission} from '../assets/own-payroll-row-emission.js';
import {ownOfficialCapture,ownOfficialCloseSnapshot,buildOwnOfficialCloseSnapshot,verifiedOwnOfficialCapture} from '../assets/own-payroll-official-snapshot-model.js';
import {ownCloseReceipt,verifiedOwnCloseReceipt} from '../assets/own-payroll-close-model.js';
import {policySha256} from '../assets/own-payroll-policy-validity.js';
import {ownProgramStructure} from '../assets/own-payroll-program-model.js';
import {prepareOwnPayrollOfficialApprovedInput} from '../lib/own-payroll-approved-input.js';
const all={kind:'all',values:[]};
const clone=structuredClone;
const equal=(a,b)=>assert.deepEqual(a,b);
const failed=(fn,code)=>assert.throws(fn,code?e=>e.code===code:undefined);
const close=c=>{const employees=c.saved.input.employees;return buildOwnOfficialCloseSnapshot({version:'own-close-detail.v2',period:c.body.period,liquidationType:c.body.liquidationType,populationDomain:'native_registered',rosterVersion:'a'.repeat(64),complete:true,canWrite:true,rows:employees.map(e=>({contractId:e.contractId,employeeNumber:e.employeeNumber,agreementCode:e.agreementCode,departmentCode:e.departmentCode,state:'confirmed',canClose:true,groupId:null,runId:c.id,resultSha256:c.saved.resultSha256,liquidationVersion:1})),captures:[c]},all);};

test('explicit cap preserves exact and line chains, reserve, method29 and per-concept method27',()=>{
 const {input,result}=cappedFixture();equal(result.cappedDeductionEffects.map(e=>[e.conceptCode,e.applied.amount,e.unapplied?.amount]),[['608','80.01','0.00'],['630','0.00','40.01'],['649','0.00',undefined]]);
 const [one,two]=result.cappedDeductionEffects;equal(one.applied.exact,{numerator:'16001',denominator:'200'});equal(one.rounding.appliedDelta,{numerator:'1',denominator:'200'});equal(two.availableBefore,{numerator:'2001',denominator:'100'});equal(two.officialAvailableBefore,two.availableBefore);
 assert.equal(one.effect.target,'L[133]');assert.equal(two.effect.target,'DCTONEFE');assert.equal(two.effect.sourceConceptCode,'630');assert.equal(one.effect.debtWritten,false);assert.equal(result.paymentExecuted,false);verifyCappedResult(input,result);verifyOwnPayrollOfficialProjection(input,result);
});
test('method29 assignment remains when requested or applied is zero',()=>{
 for(const options of [{requests:['0','0']},{gross:'20.004',reserve:'20.004'}]){const {result}=cappedFixture(options),e=result.cappedDeductionEffects[0];assert.equal(e.applied.amount,'0.00');equal(e.effect.exact,{numerator:'0',denominator:'1'});assert.equal(e.effect.target,'L[133]');}
});
test('subcent available and reserve never round a cap upward',()=>{
 const {result}=cappedFixture({gross:'1.015',reserve:'0.006',requests:['2','0']});const e=result.cappedDeductionEffects[0];equal(e.cashLimit,{numerator:'1',denominator:'1'});assert.equal(e.applied.amount,'1.00');equal(e.officialAvailableAfter,{numerator:'3',denominator:'200'});assert.equal(result.employeeTotals[0].net,'0.02');
});
test('multiple subcent requests consume exact official balance even when each line is zero',()=>{
 const {result}=cappedFixture({gross:'100.019',reserve:'100.001',requests:['0.004','0.004','0.004','0.004'],stepCodes:['608','630','631','632'],methods:['29','27','27','27']});equal(result.cappedDeductionEffects.map(e=>e.applied.amount),['0.00','0.00','0.00','0.00']);equal(result.cappedDeductionEffects.map(e=>e.applied.exact.numerator),['1','1','1','0']);assert.equal(result.employeeTotals[0].deduction,'0.01');equal(result.cappedDeductionEffects[3].officialAvailableBefore,{numerator:'100007',denominator:'1000'});
});
test('existing 649 keeps amount and must respect declared reserve instead of being silently reordered',()=>{
 const {result}=cappedFixture({requests:['20','10'],existing:'5'});equal(result.cappedDeductionEffects.map(e=>e.applied.amount),['20.00','10.00','5.00']);assert.equal(result.cappedDeductionEffects[2].effect,null);
 failed(()=>cappedFixture({existing:'0.01'}),'CAPPED_RESERVE_VIOLATION');
});
test('negative request and reserve are rejected',()=>{failed(()=>cappedFixture({requests:['-1','0']}),'CAPPED_VALUE_INVALID');failed(()=>cappedFixture({reserve:'-0.01'}),'CAPPED_VALUE_INVALID');});
test('future month and calendar year require no month-specific rebuild',()=>{for(const period of ['2027-08','2027-12','2028-01','2028-11','2029-12']){const {input,result}=cappedFixture({period});assert.equal(input.cappedDeductionCapture.period,period);assert.equal(result.employeeTotals[0].net,'20.01');}});
test('reusable declared 649 remains in its explicit position without receiving a capped effect',()=>{
 for(const period of ['2026-10','2027-12','2028-01']){
  const {programme,result}=cappedFixture({period,requests:['10','10'],existing:'5',monthlyForced649:true});
  assert.equal(programme.monthlyForcedAmountsVersion,'own-monthly-forced-passthrough.v2');
  equal(result.cappedDeductionEffects.map(e=>[e.conceptCode,e.applied.amount]),[['608','10.00'],['630','10.00'],['649','5.00']]);
  assert.equal(result.cappedDeductionEffects[2].effect,null);
 }
});
test('the capped policy rejects a negative existing deduction although forced V2 supports it outside this policy',()=>{
 const ordinary=forcedValiditySnapshot(forcedValiditySources({code:'649',amount:'-100'}));
 assert.equal(ordinary.result.rows.find(r=>r.conceptCode==='649').amount,'-1.00');
 failed(()=>cappedFixture({requests:['0','0'],existing:'-1',monthlyForced649:true}),'CAPPED_VALUE_INVALID');
});
test('absence of opt-in keeps saved historic output and close byte-for-byte',()=>{const c=officialCapture('legacy_v4_unchanged'),before=JSON.stringify(c);equal(calculateOwnPayrollWithOfficialTotals(c.saved.input),c.saved.result);ownOfficialCapture(c);const s=buildOwnOfficialCloseSnapshot(officialCloseDetail('legacy_v4_unchanged'),all);assert.ok(!Object.hasOwn(s,'cappedDeductionEffectCount'));assert.equal(JSON.stringify(c),before);});
test('immutable policy history requires explicit successor and preserves original',()=>{const {programme}=cappedFixture(),next=clone(programme),old=next.cappedDeductionPolicies[0];next.cappedDeductionPolicies.push({...clone(old),policyId:'synthetic-capped-next',validFrom:'2027-01',supersedes:{policyId:old.policyId,policySha256:policySha256(old)}});ownProgramStructure(next);cappedProgramHistory(programme,next);const capture=captureCappedPolicies(next,'2028-01','monthly',next.officialTotalsPolicies[0]);assert.equal(capture.cappedDeductionCapture.policies.length,2);const bad=clone(next);bad.cappedDeductionPolicies[0].orderReference='Changed history';failed(()=>cappedProgramHistory(programme,bad));});
for(const [label,mutate,code] of [
 ['missing order',p=>{delete p.orderReference;},'CAPPED_CONTRACT_INVALID'],
 ['empty steps',p=>{p.steps=[];},'CAPPED_CONTRACT_INVALID'],
 ['duplicate concept',p=>{p.steps[1].conceptCode=p.steps[0].conceptCode;},'CAPPED_ORDER_INVALID'],
 ['duplicate balance',p=>{p.steps[1].availableCode=p.steps[0].availableCode;},'CAPPED_ORDER_INVALID'],
 ['unknown method',p=>{p.steps[0].method='98';},'CAPPED_STEP_INVALID'],
 ['inferred stage',p=>{p.steps[0].effectStage=null;},'CAPPED_STEP_INVALID'],
 ['cash consumes exact implicitly',p=>{p.consumptionStage='exact';},'CAPPED_CONTRACT_INVALID'],
 ['official consumes line',p=>{p.officialConsumptionStage='rounded';},'CAPPED_CONTRACT_INVALID'],
 ['invented debt write',p=>{p.writeDebt=true;},'CAPPED_CONTRACT_INVALID'],
 ['prior and current duplicated',p=>{p.priorDeductionCodes=['649'];},'CAPPED_ORDER_INVALID'],
])test('rejects incomplete policy: '+label,()=>{const p=clone(cappedFixture().programme.cappedDeductionPolicies[0]);mutate(p);failed(()=>normalizeCappedPolicies('own-capped-deductions.v1',[p]),code);});
for(const [label,mutate,code] of [
 ['649 omitted from sequence',p=>{p.cappedDeductionPolicies[0].steps.pop();},'CAPPED_ORDER_INVALID'],
 ['sequence reversed without rules',p=>{p.cappedDeductionPolicies[0].steps.reverse();},'CAPPED_ORDER_INVALID'],
 ['net base overstated',p=>{p.rules.find(r=>r.code==='810000002').expression={op:'literal',value:'200',unit:'money'};}],
 ['cash next subtracts exact',p=>{p.rules.find(r=>r.code==='810000020').expression.right.stage='exact';},'CAPPED_ORDER_INVALID'],
 ['cap rounded up',p=>{p.rules.find(r=>r.code==='810000013').expression=p.rules.find(r=>r.code==='810000013').expression.else;},'CAPPED_FORMULA_INVALID'],
 ['self base dependency',p=>{p.rules.find(r=>r.code==='810000002').expression={op:'concept',code:'608',stage:'exact'};},'CAPPED_DEPENDENCY_CYCLE'],
 ['reserve reads future',p=>{p.rules.find(r=>r.code==='810000001').expression={op:'concept',code:'630',stage:'exact'};},'CAPPED_DEPENDENCY_CYCLE'],
])test('effective formula and order are enforced: '+label,()=>{
 const {programme,input}=cappedFixture();mutate(programme);
 if(label==='net base overstated'){const capped=captureCappedPolicies(programme,input.period,input.liquidationType,input.officialTotalsPolicy);failed(()=>calculateOwnPayrollWithOfficialTotals({...input,rules:programme.rules,...capped}),'CAPPED_NET_RECONCILIATION');}
 else failed(()=>normalizeCappedProgram(programme),code);
});
test('approved adapter requires original complete policy inventory',()=>{const c=cappedCapture();const input=prepareOwnPayrollOfficialApprovedInput(c.payload);assert.equal(input.cappedDeductionCapture.ruleClosureSha256,c.saved.input.cappedDeductionCapture.ruleClosureSha256);delete c.payload.sourceInventory.cappedDeductions;failed(()=>prepareOwnPayrollOfficialApprovedInput(c.payload),'CAPPED_CAPTURE_REQUIRED');});
test('capture closes without discarding zero assignments and reads same ledger',async()=>{const c=cappedCapture({requests:['0','5']}),s=close(c),r=officialCloseReceipt(s);await verifiedOwnOfficialCapture(c);assert.equal(s.cappedDeductionEffectCount,3);equal(s.employees[0].cappedDeductionEffects,c.saved.result.cappedDeductionEffects);assert.equal(ownOfficialCloseSnapshot(s),s);ownCloseReceipt(r);await verifiedOwnCloseReceipt(r);});
for(const [label,mutate] of [
 ['effect removed',s=>{s.employees[0].cappedDeductionEffects.shift();s.employees[0].cappedDeductionEffectCount--;s.cappedDeductionEffectCount--;}],
 ['effect amount modified',s=>{s.employees[0].cappedDeductionEffects[0].effect.amount='1.00';}],
 ['rounding hidden',s=>{s.employees[0].cappedDeductionEffects[0].rounding.appliedDelta={numerator:'0',denominator:'1'};}],
 ['source rules altered',s=>{s.sources[0].cappedDeductionCapture.ruleClosure[0].ruleReference='Other';}],
 ['capture missing',s=>{delete s.sources[0].cappedDeductionCapture;}],
 ['ledger missing',s=>{delete s.employees[0].cappedDeductionEffects;}],
 ['unknown debt side effect',s=>{s.employees[0].cappedDeductionEffects[0].effect.debtWritten=true;}],
 ['ledger reordered',s=>{s.employees[0].cappedDeductionEffects.reverse();}],
 ['different contract',s=>{s.employees[0].cappedDeductionEffects[0].contractId='00000000-0000-4000-8000-000000000001';}],
 ['close count changed',s=>{s.cappedDeductionEffectCount=0;}],
])test('closed evidence rejects tampering: '+label,()=>{const s=close(cappedCapture());mutate(s);failed(()=>ownOfficialCloseSnapshot(s));});
test('stored result rejects a fabricated effect even when monetary rows are unchanged',()=>{const {input,result}=cappedFixture();result.cappedDeductionEffects[1].effect.exact={numerator:'0',denominator:'1'};failed(()=>verifyOwnPayrollOfficialProjection(input,result));});
test('V5 projection preserves effects while its existing family-row omission policy remains intact',()=>{const {input}=cappedFixture({requests:['0','0']});input.rules.push({...clone(input.rules.find(r=>r.code==='100')),code:'302',nature:'non_remuneration',expression:{op:'literal',value:'0',unit:'money'}});input.officialTotalsPolicy.contributions['995']=['302'];input.officialTotalsCapture.policies[0].contributions['995']=['302'];input.officialTotalsCapture.policiesSha256=policySha256(input.officialTotalsCapture.policies);input.cappedDeductionCapture.officialPolicySha256=policySha256(input.officialTotalsPolicy);const rowEmissionPolicies=[{version:'own-payroll-row-emission.v2',policyId:'synthetic-omit-zero302',supersedes:null,agreementCode:'1',validFrom:'2026-10',validUntil:null,liquidationType:'monthly',conceptCode:'302',conditions:[{quantityCode:'100',unit:'units',stage:'exact',valueDomain:'nonnegative',operator:'gt',value:'1'}],whenFalse:'omit_receipt_row',nonzeroAction:'error',sourceReference:'Synthetic omission only',sourceSha256:'e'.repeat(64)}];const r=calculateOwnPayrollWithRowEmission({...input,version:'own-payroll-input.v5',rowEmissionVersion:'own-payroll-row-emission.v2',rowEmissionPolicies});assert.ok(!r.receiptRowKeys.some(k=>k.endsWith(':302')));assert.equal(r.cappedDeductionEffects[0].effect.target,'L[133]');assert.equal(r.cappedDeductionEffects[0].applied.amount,'0.00');});

for(const channel of ['native','imported','fixed'])test('explicit incompatible source rejects '+channel+' even at zero',()=>{
 const c=cappedCapture({incompatibleSourceCodes:['209']}),sources=adjustmentSources({count:1,channel:channel==='fixed'?'native':channel,events:channel==='fixed'?[]:[{code:'209',cents:'0',origin:null}],fixedCode:channel==='fixed'?'209':null});
 c.payload.monthly=sources.monthly;c.payload.fixed=sources.fixed;
 failed(()=>prepareOwnPayrollOfficialApprovedInput(c.payload),'CAPPED_SOURCE_INCOMPATIBLE');
});
test('absence proof requires both monthly channels and a complete fixed export',()=>{
 for(const change of [p=>{delete p.monthly.nativeBatches;},p=>{p.monthly.complete=false;},p=>{p.fixed.export.data.total++;}]){const c=cappedCapture({incompatibleSourceCodes:['209']});change(c.payload);failed(()=>verifyCappedSource(c.payload));}
});
test('program review shows monetary choices, prior order and incompatible source explicitly',()=>{
 const {programme}=cappedFixture({incompatibleSourceCodes:['209']}),text=describeProgramPolicy('cappedDeductionPolicies',programme.cappedDeductionPolicies);
 for(const term of ['Fuentes que impiden este cálculo: 209','Descuentos anteriores al tramo','Orden efectivo del tramo','Auxiliar del importe reservado','Conservar el importe aplicado, incluso cero'])assert.ok(text.includes(term),term);
});
