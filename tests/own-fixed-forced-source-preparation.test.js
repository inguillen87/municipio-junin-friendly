import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareOwnPayrollProgrammeSource,OWN_PROGRAMME_SOURCE_VERSION} from '../lib/own-payroll-programme-source-preparation.js';
import {salaryItems,SALARY_VERSION,salarySerialized} from '../assets/native-salary-catalog-model.js';
import {OWN_PROGRAM_VERSION,ownProgramRuleKey,ownProgramDefinition} from '../assets/own-payroll-program-model.js';
import {OWN_PAYROLL_NAMESPACE_VERSION,calculateOwnPayroll} from '../assets/own-payroll-engine.js';
import {requireExactProgramChanges} from '../assets/own-payroll-program-precision.js';
// All definitions and evidence are synthetic. The expected wrapper is built
// from explicit raw quantity evidence, independently of the lowering routine.
const h=c=>c.repeat(64), hash=v=>createHash('sha256').update(salarySerialized(v)).digest('hex');
const literal=(unit,value)=>({op:'literal',unit,value});
// These literal amounts terminate at two decimals; newly authored policies are exact.
const definition=(code,expression,quantity=null,extra={})=>({kind:'concept',agreementCode:'71',code,label:'Concepto ficticio '+code,active:true,nature:'remuneration',quantityUnit:'days',outputUnit:'money',precision:2,validFrom:'2026-09',validUntil:null,value:null,dependencies:[],ruleReference:'Fuente ficticia revisada',sourceSha256:h('e'),liquidationTypes:['monthly'],rounding:{precision:2,mode:'exact'},expression,quantity,...extra});
const nativeRule=d=>({code:d.code,agreementCode:d.agreementCode,nature:d.nature,unit:d.outputUnit,validFrom:d.validFrom,validUntil:d.validUntil,liquidationTypes:d.liquidationTypes,ruleReference:d.ruleReference,rounding:d.rounding,expression:d.expression});
function fixture(stage='rounded',{historical=false}={}){
 const q={unit:'days',stage,rounding:stage==='rounded'?{precision:0,mode:'half_even'}:null,expression:literal('days','2.5'),sourceReference:'Cantidad ficticia revisada',sourceSha256:h('1')};
 const amount={op:'multiply',left:literal('money','1'),right:{op:'divide',left:{op:'quantity',code:'301',unit:'days'},right:literal('days','1')}};
 const definitions=[definition('301',amount,q),definition('302',literal('money','9')),definition('303',literal('coefficient','0.7'),null,{kind:'auxiliary',nature:'auxiliary',quantityUnit:null,outputUnit:'coefficient'})];
 const items=salaryItems(definitions.map(d=>({kind:d.kind,agreementCode:d.agreementCode,categoryCode:null,code:d.code,label:d.label,active:true,nature:d.nature,unit:d.kind==='concept'?d.quantityUnit:d.outputUnit,precision:d.precision,validFrom:d.validFrom,validUntil:d.validUntil,value:d.value,dependencies:d.dependencies,ruleReference:d.ruleReference})));
 const scopeVersion=h('a'),salaryVersion=h('b');
 const input={version:OWN_PROGRAMME_SOURCE_VERSION,salary:{version:SALARY_VERSION,scopeVersion,classification:{version:h('c'),items:[]},catalog:{version:salaryVersion,revision:1,items},proposals:[],complete:true,permissions:{canPropose:true,canReview:false},payrollCalculated:false,payrollPosted:false},programme:{version:OWN_PROGRAM_VERSION,scopeVersion,salaryCatalog:{version:salaryVersion,revision:1,items:structuredClone(items)},program:{version:h('d'),revision:0,definition:null,salaryVersion:null,proposalId:null,approvalId:null},proposals:[],permissions:{canPropose:true,canReview:false},payrollCalculated:false,payrollPosted:false},period:'2026-09',agreementCodes:['71'],source:{sha256:h('f'),complete:true,expectedDefinitions:definitions.length},definitions,bindings:[],programmeOptions:{namespaceVersion:OWN_PAYROLL_NAMESPACE_VERSION},totalsPrecision:2};
 const expectedRules=definitions.map(nativeRule);expectedRules[0].expression=structuredClone(amount);expectedRules[0].expression.right.left={op:'quantity_phase',code:'301',unit:q.unit,stage:q.stage,rounding:q.rounding,value:q.expression,sourceReference:q.sourceReference,sourceSha256:q.sourceSha256};
 const policy={ruleKey:ownProgramRuleKey(expectedRules[1],OWN_PAYROLL_NAMESPACE_VERSION),sourceKind:'fixed_amount',sourceCode:'302',quantityPolicy:'reject',sourceSha256:h('2'),ruleReference:'Política ficticia revisada'};
 const expressionSet=expectedRules.map(r=>({ruleKey:ownProgramRuleKey(r,OWN_PAYROLL_NAMESPACE_VERSION),expression:r.expression})).sort((a,b)=>a.ruleKey<b.ruleKey?-1:a.ruleKey>b.ruleKey?1:0);
 input.programmeOptions.fixedForcedAmountsVersion='own-fixed-forced-amount.v1';input.programmeOptions.fixedForcedAmountsPolicy={quantityLineage:{version:'own-quantity-lineage-review.v1',sourceSha256:h('3'),sourceControlSha256:h('4'),expressionSetSha256:hash(expressionSet),complete:true},policies:[policy]};
 if(historical){
  // An explicitly authored prior revision is a history control, never a new rounding approval.
  const prior=ownProgramDefinition({...input.programmeOptions,rules:structuredClone(expectedRules),bindings:[],totalsPrecision:input.totalsPrecision},items);
  input.programme.program={...input.programme.program,revision:1,definition:prior,salaryVersion,proposalId:'10000000-0000-4000-8000-000000000001',approvalId:'10000000-0000-4000-8000-000000000002'};
 }
 return {input,expectedRules};
}
test('exact new U and identical historical rounded U retain the original wrapper, amounts and single evaluation stage',()=>{
 for(const [stage,amount] of [['exact','2.50'],['rounded','2.00']]){
  if(stage==='rounded'){
   const fresh=fixture(stage),before=structuredClone(fresh.input),blocked=prepareOwnPayrollProgrammeSource(fresh.input);
   assert.equal(blocked.status,'not_presentable');assert.equal(blocked.presentable.programme,false);assert.equal(blocked.draft.programme,null);
   assert.deepEqual(blocked.incidents,[{code:'PROGRAMME_PRECISION_REVIEW_REQUIRED',definition:null,path:'PROGRAM_PRECISION_REQUIRED',sourceReference:null}]);
   assert.deepEqual(blocked.draft.typedRules,fresh.expectedRules);assert.deepEqual(blocked.draft.definitions[0].quantity,fresh.input.definitions[0].quantity);assert.deepEqual(fresh.input,before);
   assert.ok(blocked.trace.some(t=>t.phase==='quantity'&&t.stage==='rounded'));assert.equal(blocked.approved,false);assert.equal(blocked.executable,false);
  }
  const {input,expectedRules}=fixture(stage,{historical:stage==='rounded'}),before=structuredClone(input),result=prepareOwnPayrollProgrammeSource(input);
  assert.deepEqual(result.incidents,[]);assert.equal(result.status,'proposal_draft');assert.equal(result.presentable.programme,true);
  assert.deepEqual(result.draft.programme.rules,expectedRules);assert.deepEqual(input,before);
  assert.equal(result.pins.programRevision,stage==='rounded'?1:0);
  const snapshot={version:'own-payroll-input.v2',period:'2026-09',liquidationType:'monthly',selection:{kind:'all',values:[]},populationComplete:true,totalsPrecision:2,sourceVersions:{population:h('5'),rules:h('6'),novelties:h('7')},employees:[{contractId:'10000000-0000-4000-8000-000000000001',employeeNumber:'QA-1',agreementCode:'71',departmentCode:'1',inputs:[],fixedForcedAmounts:[]}],rules:result.draft.programme.rules,fixedForcedAmountsVersion:input.programmeOptions.fixedForcedAmountsVersion,fixedForcedAmountsPolicy:input.programmeOptions.fixedForcedAmountsPolicy};
  const calculated=calculateOwnPayroll(snapshot),row=calculated.rows.find(r=>r.conceptCode==='301');assert.equal(row.amount,amount);
  assert.equal(row.trace.filter(t=>t.operation==='quantity_phase').length,1);assert.equal(row.trace.filter(t=>t.operation==='round').length,0);assert.equal(calculated.municipalApprovalVerified,false);
 }
});
test('lineage digest binds every overlapping expression including auxiliaries, not historical equivalence',()=>{
 const {input}=fixture();input.definitions[2].expression.value='0.8';
 const result=prepareOwnPayrollProgrammeSource(input);assert.equal(result.draft.programme,null);assert.ok(result.incidents.some(i=>i.code==='PROGRAMME_CURRENT_CONTRACT_REJECTED'&&i.path==='FORCED_LINEAGE_REQUIRED'));
 const changed=fixture();changed.input.programmeOptions.fixedForcedAmountsPolicy.quantityLineage.complete=false;
 assert.equal(prepareOwnPayrollProgrammeSource(changed.input).draft.programme,null);
});
test('new legacy rounded quantity evidence stays pending while retaining its inline-round AST and no forced feature',()=>{
 const {input}=fixture();delete input.programmeOptions.fixedForcedAmountsVersion;delete input.programmeOptions.fixedForcedAmountsPolicy;
 const before=structuredClone(input),result=prepareOwnPayrollProgrammeSource(input);
 assert.equal(result.status,'not_presentable');assert.equal(result.presentable.programme,false);assert.equal(result.draft.programme,null);
 assert.deepEqual(result.incidents,[{code:'PROGRAMME_PRECISION_REVIEW_REQUIRED',definition:null,path:'PROGRAM_PRECISION_REQUIRED',sourceReference:null}]);
 const expression=result.draft.typedRules.find(r=>r.code==='301').expression;assert.equal(expression.right.left.op,'round');assert.equal(expression.right.left.value.value,'2.5');
 assert.equal(Object.hasOwn(input.programmeOptions,'fixedForcedAmountsPolicy'),false);assert.equal(result.approved,false);assert.equal(result.executable,false);assert.deepEqual(input,before);
});
test('new rounded quantity wrappers cannot bypass the existing exact-stage proposal guard',()=>{
 const {input,expectedRules}=fixture(),blocked=prepareOwnPayrollProgrammeSource(input);
 assert.equal(blocked.draft.programme,null);assert.ok(blocked.incidents.some(i=>i.code==='PROGRAMME_PRECISION_REVIEW_REQUIRED'));
 // Construct the independent raw native expectation, not a proposal returned by the blocked preparer.
 const proposed=ownProgramDefinition({...input.programmeOptions,rules:structuredClone(expectedRules),bindings:[],totalsPrecision:input.totalsPrecision},input.salary.catalog.items);
 for(const rule of proposed.rules)rule.rounding={mode:'exact',precision:2};
 assert.throws(()=>requireExactProgramChanges(null,proposed),e=>e.code==='PROGRAM_PRECISION_REQUIRED');
 const unchanged=structuredClone(proposed);assert.deepEqual(requireExactProgramChanges(unchanged,proposed),proposed);
 proposed.rules[0].expression.right.left.rounding={mode:'exact',precision:8};
 assert.deepEqual(requireExactProgramChanges(null,proposed),proposed);
 proposed.rules[0].expression.right.left.stage='exact';proposed.rules[0].expression.right.left.rounding=null;
 assert.deepEqual(requireExactProgramChanges(null,proposed),proposed);
});
