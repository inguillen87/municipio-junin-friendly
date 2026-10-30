// Pure synthetic typed evidence and the actual preparation/editor guard.
// No filesystem, QA builders, SQL, handlers, database, approval or calculation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareOwnPayrollProgrammeSource,OWN_PROGRAMME_SOURCE_VERSION} from '../lib/own-payroll-programme-source-preparation.js';
import {salaryItems,SALARY_VERSION} from '../assets/native-salary-catalog-model.js';
import {ownProgramDefinition,OWN_PROGRAM_VERSION} from '../assets/own-payroll-program-model.js';
import {requireExactProgramChanges} from '../assets/own-payroll-program-precision.js';

const clone=structuredClone,hash=character=>character.repeat(64);
const literal=(unit,value)=>({op:'literal',unit,value});
const definition=(code='301',mode='half_up',patch={})=>({
  kind:'concept',agreementCode:'71',code,label:'Concepto exclusivamente sintético '+code,active:true,
  nature:'remuneration',quantityUnit:'money',outputUnit:'money',precision:2,
  validFrom:'2026-09',validUntil:null,value:null,dependencies:[],
  ruleReference:'Respaldo exclusivamente sintético; sin política municipal',sourceSha256:hash('e'),
  liquidationTypes:['monthly'],rounding:{precision:2,mode},expression:literal('money','1.005'),quantity:null,...patch
});
const catalogueRow=d=>({kind:d.kind,agreementCode:d.agreementCode,categoryCode:null,code:d.code,label:d.label,
  active:d.active,nature:d.nature,unit:d.kind==='concept'?d.quantityUnit:d.outputUnit,
  precision:d.precision,validFrom:d.validFrom,validUntil:d.validUntil,value:d.value,dependencies:d.dependencies,ruleReference:d.ruleReference});
const rule=d=>({code:d.code,agreementCode:d.agreementCode,nature:d.nature,unit:d.outputUnit,validFrom:d.validFrom,
  validUntil:d.validUntil,liquidationTypes:clone(d.liquidationTypes),ruleReference:d.ruleReference,
  rounding:clone(d.rounding),expression:clone(d.expression)});
function input(definitions=[definition()],priorCodes=[]) {
  const items=salaryItems(definitions.map(catalogueRow));
  const prior=priorCodes.length?ownProgramDefinition({namespaceVersion:'own-payroll-namespaces.v2',
    rules:definitions.filter(d=>priorCodes.includes(d.code)).map(rule),bindings:[],totalsPrecision:2},items):null;
  const scopeVersion=hash('a'),salaryVersion=hash('b');
  return {version:OWN_PROGRAMME_SOURCE_VERSION,
    salary:{version:SALARY_VERSION,scopeVersion,classification:{version:hash('c'),items:[]},
      catalog:{version:salaryVersion,revision:1,items:clone(items)},proposals:[],complete:true,
      permissions:{canPropose:true,canReview:false},payrollCalculated:false,payrollPosted:false},
    programme:{version:OWN_PROGRAM_VERSION,scopeVersion,salaryCatalog:{version:salaryVersion,revision:1,items:clone(items)},
      program:{version:hash('d'),revision:prior?1:0,definition:prior,salaryVersion:prior?salaryVersion:null,
        proposalId:prior?'10000000-0000-4000-8000-000000000001':null,
        approvalId:prior?'10000000-0000-4000-8000-000000000002':null},proposals:[],
      permissions:{canPropose:true,canReview:false},payrollCalculated:false,payrollPosted:false},
    period:'2026-09',agreementCodes:['71'],source:{sha256:hash('f'),complete:true,expectedDefinitions:definitions.length},
    definitions:clone(definitions),bindings:[],programmeOptions:{namespaceVersion:'own-payroll-namespaces.v2'},totalsPrecision:2};
}
const codes=result=>result.incidents.map(value=>value.code);
function pending(result) {
  assert.equal(result.status,'not_presentable');assert.equal(result.presentable.programme,false);
  assert.equal(result.completeness.programmeContractComplete,false);assert.equal(result.draft.programme,null);
  for(const key of ['approved','executable','payrollCalculated','payrollPosted'])assert.equal(result[key],false);
  assert.deepEqual(result.incidents.filter(value=>value.code==='PROGRAMME_PRECISION_REVIEW_REQUIRED'),[{
    code:'PROGRAMME_PRECISION_REVIEW_REQUIRED',definition:null,path:'PROGRAM_PRECISION_REQUIRED',sourceReference:null
  }]);
  assert.equal(codes(result).includes('PROGRAMME_CURRENT_CONTRACT_REJECTED'),false);
}

for(const mode of ['half_up','half_even','toward_zero','floor','ceiling'])test('new '+mode+' evidence stays pending rather than falsely presentable and keeps complete typed content',()=>{
  const raw=input([definition('301',mode)]),before=clone(raw),result=prepareOwnPayrollProgrammeSource(raw);
  pending(result);assert.deepEqual(raw,before);assert.deepEqual(result,prepareOwnPayrollProgrammeSource(raw));
  assert.equal(result.draft.typedRules.length,1);assert.deepEqual(result.draft.typedRules[0],rule(raw.definitions[0]));
  assert.equal(result.draft.definitions.length,1);assert.equal(result.draft.definitions[0].sourceSha256,hash('e'));
  assert.deepEqual(result.draft.masterItems,raw.salary.catalog.items);
  assert.equal(result.pins.sourceSha256,raw.source.sha256);assert.match(result.pins.evidenceSha256,/^[a-f0-9]{64}$/);
  assert.ok(Object.isFrozen(result.draft.typedRules[0].rounding));
  assert.throws(()=>{result.draft.typedRules[0].rounding.mode='exact';});
});

test('the same fully typed source using exact policy remains only a proposal draft, without evaluating its amount',()=>{
  const raw=input([definition('301','exact')]),before=clone(raw),result=prepareOwnPayrollProgrammeSource(raw);
  assert.deepEqual(raw,before);assert.deepEqual(result.incidents,[]);assert.equal(result.status,'proposal_draft');
  assert.equal(result.presentable.programme,true);assert.equal(result.draft.programme.rules[0].rounding.mode,'exact');
  assert.equal(result.draft.programme.rules[0].expression.value,'1.005');
  // precision2 cannot represent1.005 exactly, but source preparation never runs
  // the engine or claims payment. The existing engine remains authoritative.
  assert.equal(result.executable,false);assert.equal(result.payrollCalculated,false);
});

test('identical historical half_up survives unchanged while a genuinely new exact rule can be prepared',()=>{
  const raw=input([definition('301','half_up'),definition('302','exact')],['301']),before=clone(raw),result=prepareOwnPayrollProgrammeSource(raw);
  assert.deepEqual(raw,before);assert.deepEqual(result.incidents,[]);assert.equal(result.status,'proposal_draft');
  assert.equal(result.presentable.programme,true);
  assert.deepEqual(result.draft.programme.rules.find(value=>value.code==='301'),raw.programme.program.definition.rules[0]);
  assert.equal(result.draft.programme.rules.find(value=>value.code==='301').rounding.mode,'half_up');
  assert.equal(result.draft.programme.rules.find(value=>value.code==='302').rounding.mode,'exact');
  assert.doesNotThrow(()=>requireExactProgramChanges(raw.programme.program.definition,result.draft.programme));
});

test('a new rounded rule beside identical rounded history cannot inherit that history exception',()=>{
  const raw=input([definition('301','half_up'),definition('302','half_up')],['301']),before=clone(raw),result=prepareOwnPayrollProgrammeSource(raw);
  pending(result);assert.deepEqual(raw,before);assert.equal(result.draft.typedRules.length,2);
  assert.deepEqual(result.draft.typedRules[0].rounding,{precision:2,mode:'half_up'});
  assert.deepEqual(result.draft.typedRules[1].rounding,{precision:2,mode:'half_up'});
});

test('a structurally valid nested nonexact rounding node also keeps complete evidence but is not presentable',()=>{
  const d=definition('301','exact',{expression:{op:'round',value:literal('money','1.005'),rounding:{precision:2,mode:'half_even'}}});
  const raw=input([d]),before=clone(raw),result=prepareOwnPayrollProgrammeSource(raw);
  pending(result);assert.deepEqual(raw,before);assert.deepEqual(result.draft.typedRules[0].expression,d.expression);
});

test('a new rounded reference to an existing concept is refused by the same real editor precision guard',()=>{
  const old=definition('301','half_up'),next=definition('302','exact',{expression:{op:'concept',code:'301',stage:'rounded'}});
  const raw=input([old,next],['301']),before=clone(raw),result=prepareOwnPayrollProgrammeSource(raw);
  pending(result);assert.deepEqual(raw,before);assert.deepEqual(result.draft.typedRules[1].expression,next.expression);
  assert.ok(result.dependencies.some(value=>value.stage==='rounded'&&value.to==='concept:71:301'));
});

test('typed rounded quantity lineage remains available for correction instead of becoming an executable rule',()=>{
  const d=definition('301','exact',{quantityUnit:'days',quantity:{unit:'days',stage:'rounded',rounding:{precision:8,mode:'half_up'},
    expression:literal('days','2.00000000'),sourceReference:'Cantidad exclusivamente sintética revisada',sourceSha256:hash('1')},
    expression:{op:'multiply',left:literal('money','1.00'),right:{op:'divide',left:{op:'quantity',code:'301',unit:'days'},right:literal('days','1')}}});
  const raw=input([d]),before=clone(raw),result=prepareOwnPayrollProgrammeSource(raw);
  pending(result);assert.deepEqual(raw,before);assert.equal(result.draft.typedRules.length,1);
  assert.deepEqual(result.draft.definitions[0].quantity,d.quantity);
  assert.equal(result.draft.typedRules[0].expression.right.left.op,'round');
  assert.ok(result.trace.some(value=>value.phase==='quantity'&&value.stage==='rounded'&&value.sourceSha256===hash('1')));
});

test('existing rule conflicts retain their earlier diagnosis and do not acquire a precision approval path',()=>{
  const raw=input([definition('301','half_up')],['301']);raw.definitions[0].expression.value='2.005';
  const before=clone(raw),result=prepareOwnPayrollProgrammeSource(raw);
  assert.deepEqual(raw,before);assert.equal(result.presentable.programme,false);assert.equal(result.draft.programme,null);
  assert.ok(codes(result).includes('PROGRAMME_EXISTING_RULE_CONFLICT'));
  assert.equal(codes(result).includes('PROGRAMME_PRECISION_REVIEW_REQUIRED'),false);
});

test('the shared guard keeps a valid historical end closure and refuses extension or copied rounded content',()=>{
  const raw=input([definition('301','half_up')],['301']),before=raw.programme.program.definition,closed=clone(before);
  closed.rules[0].validUntil='2026-12';assert.doesNotThrow(()=>requireExactProgramChanges(before,closed));
  assert.equal(closed.rules[0].rounding.mode,'half_up');
  const extended=clone(closed);extended.rules[0].validUntil=null;
  assert.throws(()=>requireExactProgramChanges(closed,extended),error=>error.code==='PROGRAM_PRECISION_REQUIRED');
  const copied=clone(before);copied.rules.push({...clone(before.rules[0]),agreementCode:'72'});
  assert.throws(()=>requireExactProgramChanges(before,copied),error=>error.code==='PROGRAM_PRECISION_REQUIRED');
});

test('ordinary exact structural failures retain their existing incident rather than being mislabeled precision review',()=>{
  const raw=input([definition('301','exact')]);raw.definitions[0].expression.unit='hours';
  const before=clone(raw),result=prepareOwnPayrollProgrammeSource(raw);
  assert.deepEqual(raw,before);assert.equal(result.status,'not_presentable');assert.equal(result.draft.programme,null);
  assert.ok(codes(result).includes('PROGRAMME_CURRENT_CONTRACT_REJECTED'));
  assert.equal(codes(result).includes('PROGRAMME_PRECISION_REVIEW_REQUIRED'),false);
});
