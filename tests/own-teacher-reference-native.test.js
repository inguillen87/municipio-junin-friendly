import test from 'node:test';
import assert from 'node:assert/strict';
import {salaryNativeDefinition,salaryNativeDraft} from '../assets/own-contract-salary-conditions-native-model.js';
import {nativeDefinition,nativeBootstrap,nativeSources,sealNativeSources} from './fixtures/own-native-salary-conditions-synthetic.js';
import {prepareOwnPayrollInput} from '../lib/own-payroll-approved-input.js';
import {createOwnPayrollSnapshot} from '../lib/own-payroll-snapshot.js';
import {ownProgramDefinition} from '../assets/own-payroll-program-model.js';
import {lit,fact} from './fixtures/own-payroll-synthetic.js';

const amount='teacherReferenceAmount';
function sources({enabled=true,value='237.00000001'}={}){
 const s=nativeSources(1),p=s.programState.program.definition;
 Object.assign(s.salaryConditions.records[0].definition,{teacherPayEnabled:enabled,[amount]:value});
 p.bindings.push({agreementCode:'1',key:amount,unit:'money',sourceKind:'salary_condition_fact',sourceField:amount,onMissing:'error',combine:'single',ruleReference:'Synthetic reference declaration, independent from payment permission'});
 p.rules.find(r=>r.code==='901').expression={op:'choose',condition:{op:'match',key:'teacherPayEnabled',type:'boolean',operator:'eq',value:true},then:fact(amount,'money'),else:lit('0','money')};
 return sealNativeSources(s);
}
function result(s){return createOwnPayrollSnapshot(prepareOwnPayrollInput(s)).result.rows.find(r=>r.conceptCode==='901');}
test('reference starts as explicit null and does not activate payment',()=>{
 const d=salaryNativeDraft(nativeBootstrap())[0].definition;
 assert.equal(d.teacherPayEnabled,null);assert.equal(d.teacherReferenceAmount,null);
 for(const value of [null,'0','237','237.00000001','-237.12345678','999999999999999999.12345678']){
  const input={...nativeDefinition(),teacherPayEnabled:false,[amount]:value};assert.deepEqual(salaryNativeDefinition(input,'2026-10'),input);
 }
 assert.equal(result(sources({enabled:false})).amount,'0.00000000');
 assert.throws(()=>result(sources({enabled:null})),e=>e.code==='INPUT_MISSING');
});
for(const [name,value] of [['numeric',237],['boolean',false],['empty',''],['comma','237,01'],['whitespace','237 '],['exponent','2.37e2'],['leading zero','0237'],['excess decimals','237.123456789'],['excess integer','1000000000000000000'],['negative zero','-0'],['negative zero decimals','-0.00000000']]){
 test('native monetary reference rejects '+name+' without coercion',()=>assert.throws(()=>salaryNativeDefinition({...nativeDefinition(),[amount]:value},'2026-10'),e=>e.code==='SALARY_CONDITIONS_INPUT_INVALID'));
}
test('unpublished V2 requires the new explicit field and rejects silently upgraded old shapes',()=>{
 const d=nativeDefinition();delete d[amount];assert.throws(()=>salaryNativeDefinition(d,'2026-10'),e=>e.code==='SALARY_CONDITIONS_INPUT_INVALID');
});
test('producer retains eight decimal money and native approval provenance',()=>{
 const s=sources(),input=prepareOwnPayrollInput(s),a=input.employees[0].inputs.find(v=>v.key===amount);
 assert.equal(a.unit,'money');assert.equal(a.value,'237.00000001');assert.ok(a.sourceReference.includes(s.salaryConditions.records[0].approvalId));assert.ok(!a.sourceReference.includes(s.salaryConditions.legacy.records[0].approvalId));
 assert.equal(result(s).amount,'237.00000001');
});
test('null is preserved and consumed only in the activated branch',()=>{
 const s=sources({enabled:false,value:null});assert.equal(prepareOwnPayrollInput(s).employees[0].inputs.find(v=>v.key===amount).value,null);assert.equal(result(s).amount,'0.00000000');
 s.salaryConditions.records[0].definition.teacherPayEnabled=true;sealNativeSources(s);assert.throws(()=>result(s),e=>e.code==='INPUT_MISSING');
});
test('decimal comparison distinguishes 237 from 237.00000001 without rounding the selector',()=>{
 const s=sources({value:'237'}),r=s.programState.program.definition.rules.find(r=>r.code==='901');
 r.expression.then={op:'choose',condition:{op:'compare',operator:'eq',left:fact(amount,'money'),right:lit('237','money')},then:lit('11','money'),else:lit('20','money')};
 assert.equal(result(s).amount,'11.00000000');s.salaryConditions.records[0].definition[amount]='237.00000001';sealNativeSources(s);assert.equal(result(s).amount,'20.00000000');
});
test('new money source cannot be used under V1 or as days/boolean and missing approval blocks',()=>{
 for(const modify of [s=>s.programState.program.definition.salaryConditionsVersion='own-contract-salary-conditions.v1',s=>s.programState.program.definition.bindings.find(b=>b.key===amount).unit='days',s=>Object.assign(s.salaryConditions.records[0],{revision:0,definition:null,approvalId:null})]){const s=sources();modify(s);sealNativeSources(s);assert.throws(()=>prepareOwnPayrollInput(s));}
 const s=sources();assert.doesNotThrow(()=>ownProgramDefinition(s.programState.program.definition,s.programState.salaryCatalog.items));
});
