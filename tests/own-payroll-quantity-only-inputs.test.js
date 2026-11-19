import test from 'node:test';
import assert from 'node:assert/strict';
import {quantityOnlySources,quantityOnlyPolicy} from './fixtures/own-payroll-quantity-only-synthetic.js';
import {sealAdjustmentSources} from './fixtures/own-payroll-declared-adjustments-synthetic.js';
import {ownProgramDefinition,ownProgramHistory} from '../assets/own-payroll-program-model.js';
import {prepareOwnPayrollInput} from '../lib/own-payroll-approved-input.js';
import {calculateOwnPayroll} from '../assets/own-payroll-engine.js';
import {quantityOnlyExpectedInputs,verifyQuantityOnlyInput} from '../assets/own-payroll-quantity-only-capture.js';
import {policySha256} from '../assets/own-payroll-policy-validity.js';
import {describeProgramPolicy,programPolicyLabel} from '../assets/own-payroll-program-workspace-model.js';
import {programError} from '../lib/internal-own-payroll-program.js';
import {municipalOwnerProgramError} from '../lib/internal-municipal-owner-program.js';
import {runError} from '../lib/internal-own-payroll-run.js';
const error=code=>e=>e.code===code;
const normal=s=>ownProgramDefinition(s.programState.program.definition,s.programState.salaryCatalog.items);
const calculate=s=>calculateOwnPayroll(prepareOwnPayrollInput(s));
const amount=s=>calculate(s).rows.find(r=>r.contractId===s.population.employees[0].contractId).amount;

test('SQL quantity-policy rejections remain actionable in both programme decision routes',()=>{
 for(const suffix of ['CONTRACT_INVALID','BINDING_REQUIRED','OWNER_REQUIRED','CONSUMER_REQUIRED','POLICY_COLLISION'])for(const convert of [programError,municipalOwnerProgramError]){
  const result=convert(new Error('QUANTITY_ONLY_'+suffix+' private source detail'));assert.equal(result.status,422);assert.match(result.code,/QUANTITY_ONLY_/);assert.doesNotMatch(result.message,/private source/);
 }
});
test('SQL quantity-source errors explain the rejected field without exposing original rows',()=>{
 for(const suffix of ['AMOUNT_INCOMPATIBLE','QUANTITY_REQUIRED','CHANNEL_INCOMPATIBLE','FORCED_INCOMPATIBLE','ORIGIN_INCOMPATIBLE','CHANNEL_INCOMPLETE','INPUT_CHANGED']){
  const result=runError(new Error('QUANTITY_ONLY_'+suffix+' private source detail'));assert.equal(result.status,422);assert.match(result.code,new RegExp(suffix+'$'));assert.doesNotMatch(result.message,/private source/);
 }
 assert.equal(runError(new Error('QUANTITY_ONLY_CAPTURE_INVALID')).status,503);
});

test('historical programmes retain the observed owned-quantity behavior without automatic opt-in',()=>{
 const s=quantityOnlySources({events:[{quantity:'10',amount:'99999'}]});delete s.programState.program.definition.quantityOnlyInputsVersion;delete s.programState.program.definition.quantityOnlyInputPolicies;
 assert.equal(amount(s),'10.00');assert.equal(quantityOnlyExpectedInputs(s.programState.program.definition,s),null);
});
for(const channel of ['native','imported','mixed'])test('complete '+channel+' approved quantities sum exact signed values and preserve provenance',()=>{
 const s=quantityOnlySources({channel,events:[{quantity:'123.456',amount:null},{quantity:'-0.006',amount:'0'}]}),before=structuredClone(s);
 assert.equal(amount(s),'123.45');const input=prepareOwnPayrollInput(s);assert.equal(input.employees[0].inputs[0].value,'123.45000000');verifyQuantityOnlyInput(s,input);assert.deepEqual(s,before);
});
for(const channel of ['native','imported'])test(channel+' amount is rejected before a quantity-owned monetary rule can ignore it',()=>{
 const s=quantityOnlySources({channel,events:[{quantity:'10',amount:'99999'}]});assert.throws(()=>calculate(s),error('QUANTITY_ONLY_AMOUNT_INCOMPATIBLE'));
});
test('fixed quantity policy validates its own channel and original fixed provenance',()=>{
 const s=quantityOnlySources({sourceKind:'fixed_quantity',events:[{quantity:'2.5',amount:null}]}),input=prepareOwnPayrollInput(s);
 assert.equal(amount(s),'2.50');assert.match(input.employees[0].inputs[0].sourceReference,/^Fijas:[a-f0-9]{64}$/);verifyQuantityOnlyInput(s,input);
 const bad=quantityOnlySources({sourceKind:'fixed_quantity',events:[{quantity:'2.5',amount:'100'}]});assert.throws(()=>calculate(bad),error('QUANTITY_ONLY_AMOUNT_INCOMPATIBLE'));
});
test('monthly decision rejects a fixed event even when its amount is zero',()=>{
 const s=quantityOnlySources({channel:'fixed'});assert.throws(()=>calculate(s),error('QUANTITY_ONLY_CHANNEL_INCOMPATIBLE'));
});
test('fixed decision rejects a monthly event rather than dropping it',()=>{
 const s=quantityOnlySources({sourceKind:'fixed_quantity',events:[]});s.monthly=quantityOnlySources().monthly;assert.throws(()=>calculate(s),error('QUANTITY_ONLY_CHANNEL_INCOMPATIBLE'));
});
test('a present null quantity fails, whereas complete absence gives zero without an event',()=>{
 const bad=quantityOnlySources({events:[{quantity:null,amount:'0'}]});assert.throws(()=>calculate(bad),error('QUANTITY_ONLY_QUANTITY_REQUIRED'));
 const s=quantityOnlySources({events:[]});assert.equal(amount(s),'0.00');assert.deepEqual(s.monthly,{complete:true,batches:[],nativeBatches:[]});verifyQuantityOnlyInput(s,prepareOwnPayrollInput(s));
});
for(const channel of ['native','imported','fixed'])test(channel+' forced source is incompatible even with amount zero',()=>{
 const s=quantityOnlySources({channel,sourceKind:channel==='fixed'?'fixed_quantity':'monthly_quantity',events:[{quantity:'1',amount:'0',values:{forced:true,...(channel==='fixed'?{forcedReason:'Synthetic forced source to reject'}:{observation:'Synthetic forced source to reject'})}}]});
 assert.throws(()=>calculate(s),error('QUANTITY_ONLY_FORCED_INCOMPATIBLE'));
});
test('both channels and coherent fixed export are mandatory before absence can become zero',()=>{
 for(const mutate of [s=>s.monthly.complete=false,s=>delete s.monthly.nativeBatches,s=>delete s.monthly.batches,s=>s.population.complete=false,s=>s.fixed.export.data.total=1]){
  const s=quantityOnlySources({events:[]});mutate(s);assert.throws(()=>calculate(s));
 }
});
test('original identity, rows hash and independent reviewer remain required',()=>{
 for(const mutate of [s=>s.monthly.nativeBatches[0].rows[0].identityCurrent=false,s=>s.monthly.nativeBatches[0].rowsSha256='f'.repeat(64),s=>s.monthly.nativeBatches[0].approvals=[s.monthly.nativeBatches[0].preparedBy]]){
  const s=quantityOnlySources();mutate(s);assert.throws(()=>calculate(s));
 }
});
test('quantity policy preserves days, percent and money without relabeling the amount field',()=>{
 for(const [code,unit,quantity,expected] of [['5','days','2.5','14.25'],['45','percent','12.5','125.00'],['204','money','-1.25','-1.25'],['647','days','2','20.00']]){
  const s=quantityOnlySources({code,unit,events:[{quantity,amount:null}]});assert.equal(amount(s),expected);assert.equal(prepareOwnPayrollInput(s).employees[0].inputs[0].unit,unit);
 }
});
test('stored input cannot change quantity, unit or original row reference',()=>{
 const s=quantityOnlySources(),input=prepareOwnPayrollInput(s);verifyQuantityOnlyInput(s,input);
 for(const [field,value] of [['value','99.00000000'],['unit','days'],['sourceReference','Novedades:'+'f'.repeat(64)]]){const bad=structuredClone(input);bad.employees[0].inputs[0][field]=value;assert.throws(()=>verifyQuantityOnlyInput(s,bad),error('QUANTITY_ONLY_INPUT_CHANGED'));}
});
test('known source outside policy scope has no silent legacy fallback',()=>{
 const s=quantityOnlySources({period:'2035-12'});s.programState.program.definition.quantityOnlyInputPolicies[0].validUntil='2026-10';assert.throws(()=>calculate(s),error('QUANTITY_ONLY_POLICY_REQUIRED'));
});
test('open temporal policy admits future years and explicit immutable successors',()=>{
 const s=quantityOnlySources({period:'2035-12'});assert.equal(amount(s),'10.00');
 const before=normal(s),after=structuredClone(before),prior=after.quantityOnlyInputPolicies[0];after.quantityOnlyInputPolicies.push({...prior,policyId:'successor-2027',validFrom:'2027-08',supersedes:{policyId:prior.policyId,policySha256:policySha256(prior)}});
 ownProgramHistory(before,ownProgramDefinition(after,s.programState.salaryCatalog.items));
 after.quantityOnlyInputPolicies[0].ruleReference='Changed original policy';assert.throws(()=>ownProgramHistory(before,after),error('POLICY_PREDECESSOR_CHANGED'));
});
test('missing version, empty policies, duplicates and extra fields fail instead of downgrading',()=>{
 for(const mutate of [p=>delete p.quantityOnlyInputsVersion,p=>p.quantityOnlyInputPolicies=[],p=>p.quantityOnlyInputPolicies.push(p.quantityOnlyInputPolicies[0]),p=>p.quantityOnlyInputPolicies[0].extra=true]){
  const s=quantityOnlySources();mutate(s.programState.program.definition);assert.throws(()=>normal(s));
 }
});
test('payable owner and active consumption are separate requirements',()=>{
 const s=quantityOnlySources();s.programState.program.definition.rules[0].expression={op:'literal',value:'10',unit:'money'};assert.throws(()=>normal(s),error('QUANTITY_ONLY_CONSUMER_REQUIRED'));
 const missing=quantityOnlySources();missing.programState.program.definition.rules[0].code='999';assert.throws(()=>normal(missing),error('QUANTITY_ONLY_OWNER_REQUIRED'));
});
test('a second amount binding or forced policy cannot coexist with quantity-only ownership',()=>{
 const s=quantityOnlySources();s.programState.program.definition.bindings.push({...s.programState.program.definition.bindings[0],key:'otherAmount',unit:'money',sourceKind:'monthly_amount'});assert.throws(()=>normal(s));
});
test('retroactive quantity needs a separate decision and is never silently admitted as current',()=>{
 const s=quantityOnlySources({events:[{quantity:'1',amount:'0',values:{adjustmentMonth:'2026-09-01'}}]});sealAdjustmentSources(s);assert.throws(()=>calculate(s),error('QUANTITY_ONLY_ORIGIN_INCOMPATIBLE'));
});
test('review text distinguishes the amount restriction from a quantity declaration',()=>{
 assert.equal(programPolicyLabel('quantityOnlyInputPolicies'),'Políticas de cantidad y rechazo de importes incompatibles');
 assert.match(describeProgramPolicy('quantityOnlyInputPolicies',[quantityOnlyPolicy()]),/Importe sin informar o cero explícito/);
});
