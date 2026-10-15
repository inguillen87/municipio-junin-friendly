import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareOwnPayrollProgrammeSource,OWN_PROGRAMME_SOURCE_VERSION} from '../lib/own-payroll-programme-source-preparation.js';
import {salaryItems,SALARY_VERSION} from '../assets/native-salary-catalog-model.js';
import {ownProgramDefinition,OWN_PROGRAM_VERSION,OWN_PROGRAM_WORKING_TIME_VERSION,OWN_AGREEMENT_WORKING_TIME_VERSION,OWN_PAYROLL_CONDITIONS_VERSION} from '../assets/own-payroll-program-model.js';
import {OWN_PAYROLL_NAMESPACE_VERSION} from '../assets/own-payroll-engine.js';
import {prepareOwnPayrollInput} from '../lib/own-payroll-approved-input.js';
import {createOwnPayrollSnapshot} from '../lib/own-payroll-snapshot.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';
import {approvedSources} from './fixtures/own-payroll-approved-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';
import {OWN_PAYROLL_PERIOD_CONTEXT_VERSION} from '../assets/own-payroll-period-context.js';
// All concepts, rules, quantities and references below are fictional. No municipal formula fixture.
const h=c=>c.repeat(64), literal=(unit,value)=>({op:'literal',unit,value});
const definition=(code='301',overrides={})=>({kind:'concept',agreementCode:'71',code,label:`Concepto ficticio ${code}`,active:true,nature:'remuneration',quantityUnit:'days',outputUnit:'money',precision:2,validFrom:'2026-09',validUntil:null,value:null,dependencies:[],ruleReference:'Fuente ficticia revisada',sourceSha256:h('e'),liquidationTypes:['monthly'],rounding:{precision:2,mode:'half_even'},expression:literal('money','9007199254740993.00000001'),quantity:null,...overrides});
const row=d=>({kind:d.kind,agreementCode:d.agreementCode,categoryCode:null,code:d.code,label:d.label,active:d.active,nature:d.nature,unit:d.kind==='concept'?d.quantityUnit:d.outputUnit,precision:d.precision,validFrom:d.validFrom,validUntil:d.validUntil,value:d.value,dependencies:d.dependencies,ruleReference:d.ruleReference});
function fixture(definitions=[definition()],{approved=true,prior=null}={}){
 const items=approved?salaryItems(definitions.map(row)):[];
 const scopeVersion=h('a'),salaryVersion=h('b');
 return{version:OWN_PROGRAMME_SOURCE_VERSION,salary:{version:SALARY_VERSION,scopeVersion,classification:{version:h('c'),items:[]},catalog:{version:salaryVersion,revision:1,items:structuredClone(items)},proposals:[],complete:true,permissions:{canPropose:true,canReview:false},payrollCalculated:false,payrollPosted:false},programme:{version:OWN_PROGRAM_VERSION,scopeVersion,salaryCatalog:{version:salaryVersion,revision:1,items:structuredClone(items)},program:{version:h('d'),revision:prior?1:0,definition:prior,salaryVersion:prior?salaryVersion:null,proposalId:prior?'10000000-0000-4000-8000-000000000001':null,approvalId:prior?'10000000-0000-4000-8000-000000000002':null},proposals:[],permissions:{canPropose:true,canReview:false},payrollCalculated:false,payrollPosted:false},period:'2026-09',agreementCodes:['71'],source:{sha256:h('f'),complete:true,expectedDefinitions:definitions.length},definitions:structuredClone(definitions),bindings:[],programmeOptions:{namespaceVersion:OWN_PAYROLL_NAMESPACE_VERSION},totalsPrecision:2};
}
const codes=r=>r.incidents.map(i=>i.code);
const quantity=(expression=literal('days','2.00000000'),overrides={})=>({unit:'days',stage:'exact',rounding:null,expression,sourceReference:'Cantidad ficticia revisada',sourceSha256:h('1'),...overrides});
const amountWithQuantity=()=>({op:'multiply',left:literal('money','1.00000001'),right:{op:'divide',left:{op:'quantity',code:'301',unit:'days'},right:literal('days','1')}});

test('resolved evidence produces only a pinned proposal draft against current approved contracts, without evaluating money',()=>{
 const input=fixture(),before=structuredClone(input),r=prepareOwnPayrollProgrammeSource(input);
 assert.equal(r.status,'proposal_draft');assert.equal(r.presentable.programme,true);assert.equal(r.presentable.master,false);
 for(const k of['approved','executable','payrollCalculated','payrollPosted'])assert.equal(r[k],false);
 assert.deepEqual(r.draft.programme,ownProgramDefinition(r.draft.programme,input.salary.catalog.items));
 assert.equal(r.draft.programme.rules[0].expression.value,'9007199254740993.00000001');
 assert.deepEqual(input,before);assert.deepEqual(r,prepareOwnPayrollProgrammeSource(input));
 assert.match(r.pins.preparationSha256,/^[a-f0-9]{64}$/);assert.equal(r.pins.salaryVersion,input.salary.catalog.version);
 assert.ok(Object.isFrozen(r.draft.programme.rules[0].expression));assert.throws(()=>{r.draft.programme.rules[0].expression.value='0';});
 assert.equal(Object.hasOwn(r,'command'),false);assert.equal(Object.hasOwn(r,'results'),false);
});

test('new complete definitions prepare a complete master draft while programme waits for actual approval',()=>{
 const input=fixture(undefined,{approved:false}),r=prepareOwnPayrollProgrammeSource(input);
 assert.equal(r.presentable.master,true);assert.equal(r.presentable.programme,false);assert.equal(r.draft.programme,null);
 assert.ok(codes(r).includes('CATALOGUE_APPROVAL_REQUIRED'));assert.equal(r.draft.masterItems.length,1);
 assert.equal(r.executable,false);assert.equal(r.approved,false);
});

test('typed U is inlined with explicit rounding, separate from an auxiliary carrying the same numeric code',()=>{
 const d=definition('301',{quantity:quantity(undefined,{stage:'rounded',rounding:{precision:8,mode:'half_up'}}),expression:amountWithQuantity()});
 const a=definition('301',{kind:'auxiliary',nature:'auxiliary',quantityUnit:null,outputUnit:'coefficient',expression:literal('coefficient','0.01000000')});
 const r=prepareOwnPayrollProgrammeSource(fixture([d,a]));assert.deepEqual(r.incidents,[]);assert.equal(r.presentable.programme,true);
 const paid=r.draft.programme.rules.find(x=>x.nature==='remuneration');assert.equal(paid.expression.right.left.op,'round');
 assert.equal(paid.expression.right.left.value.value,'2.00000000');assert.equal(paid.expression.right.left.rounding.precision,8);
 assert.ok(r.trace.some(t=>t.phase==='quantity'&&t.quantity==='quantity:71:301'&&t.unit==='days'&&t.sourceSha256===h('1')));
 assert.ok(r.dependencies.some(e=>e.to==='quantity:71:301'));assert.equal(r.draft.programme.rules.filter(x=>x.code==='301').length,2);
 assert.equal(JSON.stringify(paid.expression).includes('auxiliary'),false);
});

test('quantity stage, unit and absent phases produce explicit incidents without fabricated inputs or zero',()=>{
 for(const [patch,expected]of[[{quantity:null},'QUANTITY_PHASE_MISSING'],[{quantity:quantity(undefined,{stage:null})},'QUANTITY_PHASE_STAGE_UNRESOLVED'],[{quantity:quantity(undefined,{unit:'hours'})},'QUANTITY_PHASE_UNIT_MISMATCH']]){
  const d=definition('301',{expression:amountWithQuantity(),...patch}),input=fixture([definition()]);input.definitions=[d];
  const r=prepareOwnPayrollProgrammeSource(input);assert.equal(r.draft.programme,null);assert.ok(codes(r).includes(expected));
  assert.equal(r.draft.typedRules.length,0);assert.deepEqual(input.bindings,[]);
 }
});

test('recursive U phases and unused phases stay nonpresentable rather than being aliased to auxiliary rules',()=>{
 const q=quantity({op:'quantity',code:'301',unit:'days'}),d=definition('301',{expression:amountWithQuantity(),quantity:q});
 const r=prepareOwnPayrollProgrammeSource(fixture([d]));assert.ok(codes(r).includes('QUANTITY_PHASE_CYCLE'));assert.equal(r.presentable.programme,false);
 const unused=prepareOwnPayrollProgrammeSource(fixture([definition('301',{quantity:quantity()})]));assert.ok(codes(unused).includes('QUANTITY_PHASE_NOT_EMBEDDED'));assert.equal(unused.draft.programme,null);
});

test('L101 is a typed month from the declared period, never a literal frozen into an executable multimonth programme',()=>{
 const d=definition('301',{expression:{op:'period_month'}});
 for(const [period,value]of[['2026-09','9'],['2026-12','12']]){
  const input=fixture([d]);input.period=period;const r=prepareOwnPayrollProgrammeSource(input);
  assert.deepEqual(r.context.month,{reference:'L[101]',unit:'units',value,nativeBindingSupported:false});
  assert.ok(codes(r).includes('PERIOD_MONTH_BINDING_UNSUPPORTED'));assert.equal(r.draft.programme,null);assert.equal(r.draft.typedRules.length,0);
 }
});

test('a parameter offered for L101 cannot masquerade as current period context',()=>{
 const input=fixture([definition('301',{expression:{op:'source',reference:'L[101]',unit:'units'}})]);
 input.bindings=[{agreementCode:'71',reference:'L[101]',sourceSha256:h('2'),binding:{agreementCode:'71',key:'Month',unit:'units',sourceKind:'parameter',sourceCode:'301',onMissing:'error',combine:'single',ruleReference:'Fuente ficticia'}}];
 const r=prepareOwnPayrollProgrammeSource(input);assert.ok(codes(r).includes('PERIOD_MONTH_BINDING_UNSUPPORTED'));assert.equal(r.draft.programme,null);
});

test('all conditional branches retain unresolved L18 and N101 without guessing units or missing-as-zero',()=>{
 const expression={op:'choose',condition:{op:'compare',operator:'eq',left:literal('units','1'),right:literal('units','1')},then:{op:'source',reference:'L[18]',unit:'days'},else:{op:'source',reference:'N[101]',unit:'hours'}};
 const r=prepareOwnPayrollProgrammeSource(fixture([definition('301',{expression})]));
 assert.deepEqual(r.incidents.filter(i=>i.code==='SOURCE_BINDING_UNRESOLVED').map(i=>i.sourceReference),['L[18]','N[101]']);
 assert.equal(r.draft.programme,null);assert.equal(r.draft.typedRules.length,0);
});

test('current explicit source bindings are checked against native catalogue units',()=>{
 const d=definition('301',{quantityUnit:'units',value:'1.00',expression:{op:'source',reference:'N[9]',unit:'units'}}),input=fixture([d]);
 input.bindings=[{agreementCode:'71',reference:'N[9]',sourceSha256:h('2'),binding:{agreementCode:'71',key:'Count',unit:'units',sourceKind:'monthly_quantity',sourceCode:'301',onMissing:'error',combine:'single',ruleReference:'Fuente ficticia'}}];
 const r=prepareOwnPayrollProgrammeSource(input);assert.equal(r.draft.programme,null);assert.ok(codes(r).includes('PROGRAMME_CURRENT_CONTRACT_REJECTED'));
 input.definitions[0].expression.unit='hours';const bad=prepareOwnPayrollProgrammeSource(input);assert.ok(codes(bad).includes('SOURCE_BINDING_UNIT_MISMATCH'));
});

test('explicit class, scale, agreement hours and contract hours preserve distinct current native bindings',()=>{
 const source=(reference,unit)=>({op:'source',reference,unit});
 const expression={op:'choose',condition:{op:'source_match',reference:'L[8]',type:'code',operator:'ne',value:'18'},then:{op:'multiply',left:source('L[10]','money'),right:{op:'divide',left:source('L[17]','hours'),right:source('L[15]','hours')}},else:literal('money','0.00000001')};
 const input=fixture([definition('301',{expression})]);
 const scale={...input.salary.catalog.items[0],kind:'scale',nature:null,categoryCode:'13',code:'801',unit:'money',value:'1234567890123456.01'};
 input.salary.catalog.items.push(scale);input.programme.salaryCatalog.items.push(structuredClone(scale));
 input.programmeOptions={...input.programmeOptions,workingTimeVersion:OWN_PROGRAM_WORKING_TIME_VERSION,agreementWorkingTimeVersion:OWN_AGREEMENT_WORKING_TIME_VERSION,salaryConditionsVersion:OWN_PAYROLL_CONDITIONS_VERSION};
 input.bindings=[['L[8]','Class','code','classification_fact','categoryCode'],['L[10]','Scale','money','scale','801'],['L[15]','AgreementHours','hours','agreement_time_fact','monthlyHours'],['L[17]','ContractHours','hours','working_time_fact','monthlyHours']].map(([reference,key,unit,sourceKind,field])=>({agreementCode:'71',reference,sourceSha256:h('2'),binding:{agreementCode:'71',key,unit,sourceKind,[sourceKind==='scale'?'sourceCode':'sourceField']:field,onMissing:'error',combine:'single',ruleReference:'Fuente ficticia tipada'}}));
 const r=prepareOwnPayrollProgrammeSource(input);assert.deepEqual(r.incidents,[]);assert.equal(r.presentable.programme,true);
 const [rule]=r.draft.programme.rules;assert.equal(rule.expression.condition.value,'18');
 assert.equal(rule.expression.then.right.left.key,'ContractHours');assert.equal(rule.expression.then.right.right.key,'AgreementHours');
 assert.equal(r.draft.programme.bindings.find(b=>b.key==='AgreementHours').sourceKind,'agreement_time_fact');
 assert.equal(r.draft.programme.bindings.find(b=>b.key==='ContractHours').sourceKind,'working_time_fact');
 assert.equal(r.draft.masterItems.find(r=>r.kind==='scale').value,'1234567890123456.01');
});

test('inactive, empty and unspecified rounding remain separate incidents',()=>{
 const input=fixture();input.definitions[0]={...input.definitions[0],active:false,expression:null,rounding:null};
 const r=prepareOwnPayrollProgrammeSource(input);for(const c of['SOURCE_DEFINITION_INACTIVE','EXPRESSION_UNRESOLVED','ROUNDING_UNRESOLVED'])assert.ok(codes(r).includes(c));
 assert.equal(r.draft.programme,null);assert.equal(r.draft.typedRules.length,0);
});

test('an incomplete whole source and missing agreement cannot become a partial proposal',()=>{
 const input=fixture();input.source.complete=false;input.source.expectedDefinitions=2;input.agreementCodes.push('72');
 const r=prepareOwnPayrollProgrammeSource(input);assert.ok(codes(r).includes('SOURCE_SET_INCOMPLETE'));assert.ok(codes(r).includes('AGREEMENT_DEFINITION_MISSING'));
 assert.equal(r.presentable.master,false);assert.equal(r.presentable.programme,false);assert.equal(r.completeness.receivedDefinitions,1);assert.equal(r.completeness.expectedDefinitions,2);
});

test('different scope/catalogue views, foreign definitions and duplicates fail before constructing a draft',()=>{
 for(const mutate of[i=>i.programme.scopeVersion=h('9'),i=>i.programme.salaryCatalog.version=h('9'),i=>i.programme.salaryCatalog.items[0].label='changed']){
  const input=fixture();mutate(input);assert.throws(()=>prepareOwnPayrollProgrammeSource(input),e=>e.code==='PREPARATION_BASE_CHANGED');
 }
 const foreign=fixture();foreign.definitions[0].agreementCode='99';assert.throws(()=>prepareOwnPayrollProgrammeSource(foreign));
 const duplicate=fixture();duplicate.definitions.push(structuredClone(duplicate.definitions[0]));assert.throws(()=>prepareOwnPayrollProgrammeSource(duplicate),e=>e.code==='PREPARATION_DEFINITION_DUPLICATE');
});

test('dependency absence and cycles are reported even when other source semantics remain unresolved',()=>{
 const missing=definition('301',{rounding:null,expression:{op:'concept',code:'999',stage:'exact'}}),r=prepareOwnPayrollProgrammeSource(fixture([missing]));
 assert.ok(codes(r).includes('DEPENDENCY_DEFINITION_MISSING'));assert.ok(codes(r).includes('ROUNDING_UNRESOLVED'));
 const a=definition('301',{expression:{op:'concept',code:'302',stage:'exact'}}),b=definition('302',{expression:{op:'concept',code:'301',stage:'exact'}});
 const cycle=prepareOwnPayrollProgrammeSource(fixture([a,b]));assert.ok(codes(cycle).includes('DEPENDENCY_CYCLE'));assert.equal(cycle.draft.programme,null);
 const stage=definition('301',{expression:{op:'concept',code:'302',stage:null}});const unreviewed=prepareOwnPayrollProgrammeSource(fixture([stage,b]));assert.ok(codes(unreviewed).includes('REFERENCE_STAGE_UNRESOLVED'));assert.equal(unreviewed.draft.programme,null);
});

test('prior approved rules are preserved and conflicting replacements cannot silently rewrite history',()=>{
 const old=definition('300'),prior={namespaceVersion:OWN_PAYROLL_NAMESPACE_VERSION,rules:[{code:old.code,agreementCode:old.agreementCode,nature:old.nature,unit:old.outputUnit,validFrom:old.validFrom,validUntil:old.validUntil,liquidationTypes:old.liquidationTypes,ruleReference:old.ruleReference,rounding:old.rounding,expression:old.expression}],bindings:[],totalsPrecision:2};
 const input=fixture([definition()],{prior});input.salary.catalog.items.push(row(old));input.programme.salaryCatalog.items.push(row(old));
 const r=prepareOwnPayrollProgrammeSource(input);assert.equal(r.draft.programme.rules.length,2);assert.deepEqual(r.draft.programme.rules.find(x=>x.code==='300'),prior.rules[0]);
 const conflict=fixture([definition('300',{expression:literal('money','2')})],{prior});
 assert.ok(codes(prepareOwnPayrollProgrammeSource(conflict)).includes('PROGRAMME_EXISTING_RULE_CONFLICT'));
});

test('unresolved validity/precision retain null while malformed exact decimal is never rounded or coerced',()=>{
 for(const patch of[{validFrom:null},{precision:null},{value:'1.234'}]){
  const input=fixture();Object.assign(input.definitions[0],patch);const r=prepareOwnPayrollProgrammeSource(input);
  assert.ok(codes(r).includes('CATALOGUE_DEFINITION_UNRESOLVED'));assert.equal(r.presentable.programme,false);assert.equal(r.draft.masterItems,null);
 }
 const outside=fixture();outside.period='2026-08';assert.ok(codes(prepareOwnPayrollProgrammeSource(outside)).includes('DEFINITION_PERIOD_OUTSIDE_VALIDITY'));
});

test('pins cover period, options, totals precision and all source evidence without replacing current version pins',()=>{
 const input=fixture(),a=prepareOwnPayrollProgrammeSource(input);input.totalsPrecision=3;const b=prepareOwnPayrollProgrammeSource(input);
 assert.notEqual(a.pins.evidenceSha256,b.pins.evidenceSha256);assert.notEqual(a.pins.preparationSha256,b.pins.preparationSha256);assert.equal(a.pins.salaryVersion,b.pins.salaryVersion);
});

test('no source text, accessors, sparse arrays, extra fields or executable operations are accepted',()=>{
 const textInput=fixture();textInput.definitions[0].expression='process.exit(1)';assert.throws(()=>prepareOwnPayrollProgrammeSource(textInput));
 const opInput=fixture();opInput.definitions[0].expression={op:'eval',value:'throw 1'};assert.throws(()=>prepareOwnPayrollProgrammeSource(opInput),e=>e.code==='PREPARATION_OPERATION_UNSUPPORTED');
 const getter=fixture();let accessed=false;Object.defineProperty(getter.source,'complete',{enumerable:true,get(){accessed=true;return true;}});assert.throws(()=>prepareOwnPayrollProgrammeSource(getter));assert.equal(accessed,false);
 const sparse=fixture();sparse.definitions.length=2;assert.throws(()=>prepareOwnPayrollProgrammeSource(sparse));
 const extra=fixture();extra.secret='synthetic';assert.throws(()=>prepareOwnPayrollProgrammeSource(extra));
});

test('existing permission decisions are preserved and no draft is labelled approved or executable',()=>{
 const input=fixture();input.programme.permissions.canPropose=false;input.salary.permissions.canPropose=false;
 const r=prepareOwnPayrollProgrammeSource(input);assert.equal(r.presentable.programme,false);assert.equal(r.presentable.master,false);
 assert.ok(codes(r).includes('PROGRAMME_PROPOSAL_NOT_PERMITTED'));assert.ok(codes(r).includes('MASTER_PROPOSAL_NOT_PERMITTED'));assert.equal(r.executable,false);assert.equal(r.approved,false);
});

test('prepared typed U, class, scale and distinct approved hour facts reach the real input adapter and exact engine',()=>{
 // Fictional expected arithmetic: 100.11 * (80.125 / 160.250) * ((3 - 1) / 2)
 // is exactly10011/200 =50.055; explicit half-even at2 decimals gives50.06.
 // Auxiliary301 separately equals7 days and must never replace quantity U301.
 const expected={exactValue:{numerator:'10011',denominator:'200'},amount:'50.06',net:'50.06',quantity:{numerator:'2',denominator:'1'},hourRatio:{numerator:'1',denominator:'2'}};
 const source=(reference,unit)=>({op:'source',reference,unit});
 const d=definition('301',{quantity:quantity({op:'subtract',left:literal('days','3'),right:literal('days','1')}),expression:{op:'choose',condition:{op:'source_match',reference:'L[8]',type:'code',operator:'eq',value:'13'},then:{op:'multiply',left:{op:'multiply',left:source('L[10]','money'),right:{op:'divide',left:source('L[17]','hours'),right:source('L[15]','hours')}},right:{op:'divide',left:{op:'quantity',code:'301',unit:'days'},right:literal('days','2')}},else:literal('money','0.00')}});
 const a=definition('301',{kind:'auxiliary',nature:'auxiliary',quantityUnit:null,outputUnit:'days',expression:literal('days','7'),rounding:{precision:2,mode:'exact'}});
 const preparedInput=fixture([d,a]);preparedInput.period='2026-10';
 const scale={...row(d),kind:'scale',nature:null,categoryCode:'13',code:'801',unit:'money',value:'100.11'};
 preparedInput.salary.catalog.items.push(scale);preparedInput.programme.salaryCatalog.items.push(structuredClone(scale));
 preparedInput.programmeOptions={...preparedInput.programmeOptions,workingTimeVersion:OWN_PROGRAM_WORKING_TIME_VERSION,agreementWorkingTimeVersion:OWN_AGREEMENT_WORKING_TIME_VERSION,salaryConditionsVersion:OWN_PAYROLL_CONDITIONS_VERSION};
 preparedInput.bindings=[['L[8]','Class','code','classification_fact','categoryCode'],['L[10]','Scale','money','scale','801'],['L[15]','AgreementHours','hours','agreement_time_fact','monthlyHours'],['L[17]','ContractHours','hours','working_time_fact','monthlyHours']].map(([reference,key,unit,sourceKind,field])=>({agreementCode:'71',reference,sourceSha256:h('2'),binding:{agreementCode:'71',key,unit,sourceKind,[sourceKind==='scale'?'sourceCode':'sourceField']:field,onMissing:'error',combine:'single',ruleReference:'Fuente ficticia tipada de integración'}}));
 const prepared=prepareOwnPayrollProgrammeSource(preparedInput);assert.deepEqual(prepared.incidents,[]);assert.equal(prepared.approved,false);assert.equal(prepared.executable,false);
 const sources=approvedSources(1),employee=sources.population.employees[0];
 Object.assign(employee,{agreementCode:'71',categoryCode:'13'});sources.monthly.batches=[];
 // This fixture supplies an explicit synthetic approved revision. Preparation itself cannot approve it.
 assert.throws(()=>prepareOwnPayrollInput({...sources,programState:preparedInput.programme}),e=>e.code==='PROGRAM_APPROVAL_REQUIRED');
 sources.programState={...preparedInput.programme,program:{version:h('5'),revision:1,definition:prepared.draft.programme,salaryVersion:prepared.pins.salaryVersion,proposalId:uid(8101),approvalId:uid(8102)}};
 sources.workingTime={complete:true,version:h('3'),records:[{contractId:employee.contractId,identityToken:employee.identityToken,configuration:{version:h('4'),revision:1,proposalId:uid(8103),approvalId:uid(8104),identityToken:employee.identityToken,definition:{dailyHours:null,monthlyHours:'80.125',asOfDate:'2026-10-01',documentReference:'Jornada contractual sólo ficticia integración'}}}]};
 sources.agreementWorkingTime={complete:true,version:h('3'),records:[{agreementCode:'71',agreementToken:h('6'),revision:1,definition:{monthlyHours:'160.250',asOfDate:'2026-10-01',documentReference:'Horas de convenio sólo ficticias integración'},approvalId:uid(8105),approvedAgreementToken:h('6')}]};
 sources.salaryConditions={complete:true,version:h('3'),records:[{contractId:employee.contractId,identityToken:employee.identityToken,revision:1,approvalId:uid(8106),definition:{partialSeniorityYears:null,title:{status:'not_reported',code:null,percentage:null},unhealthyWork:null,asOfDate:'2026-10-01',documentReference:'Condiciones sólo ficticias integración'}}]};
 sources.workingTime.version=ownRunHash([OWN_PROGRAM_WORKING_TIME_VERSION,sources.period,sources.workingTime.records]);
 sources.agreementWorkingTime.version=ownRunHash([OWN_AGREEMENT_WORKING_TIME_VERSION,sources.period,sources.agreementWorkingTime.records]);
 sources.salaryConditions.version=ownRunHash([OWN_PAYROLL_CONDITIONS_VERSION,sources.period,sources.salaryConditions.records]);
 sources.population.version=ownRunHash({employees:sources.population.employees,workingTime:sources.workingTime,agreementWorkingTime:sources.agreementWorkingTime,salaryConditions:sources.salaryConditions});
 const input=prepareOwnPayrollInput(sources),snapshot=createOwnPayrollSnapshot(input),paid=snapshot.result.rows.find(r=>r.conceptCode==='301'&&r.nature==='remuneration'),aux=snapshot.result.rows.find(r=>r.conceptCode==='301'&&r.nature==='auxiliary');
 assert.equal(input.employees.length,1);assert.equal(snapshot.result.employeeCount,1);assert.equal(snapshot.result.rowCount,2);
 const facts=input.employees[0].inputs;assert.equal(facts.find(i=>i.key==='Class').value,'13');assert.equal(facts.find(i=>i.key==='Class').unit,'code');
 assert.equal(facts.find(i=>i.key==='Scale').value,'100.11000000');assert.equal(facts.find(i=>i.key==='ContractHours').value,'80.12500000');assert.equal(facts.find(i=>i.key==='AgreementHours').value,'160.25000000');
 assert.notEqual(facts.find(i=>i.key==='ContractHours').sourceReference,facts.find(i=>i.key==='AgreementHours').sourceReference);
 assert.equal(paid.amount,expected.amount);assert.deepEqual(paid.exactValue,expected.exactValue);assert.equal(snapshot.result.employeeTotals[0].net,expected.net);assert.equal(aux.amount,'7.00');
 assert.ok(paid.trace.some(t=>t.operation==='subtract'&&t.result.numerator===expected.quantity.numerator&&t.result.denominator===expected.quantity.denominator));
 assert.ok(paid.trace.some(t=>t.operation==='divide'&&t.result.numerator===expected.hourRatio.numerator&&t.result.denominator===expected.hourRatio.denominator));
 for(const key of['Scale','ContractHours','AgreementHours'])assert.ok(paid.trace.some(t=>t.operation==='input'&&t.reference===key));
 assert.ok(paid.trace.some(t=>t.operation==='match'&&t.reference==='Class'&&t.result===true));assert.ok(prepared.trace.some(t=>t.phase==='quantity'&&t.quantity==='quantity:71:301'&&t.stage==='exact'));
 assert.deepEqual(prepared.draft.programme,sources.programState.program.definition);assert.equal(snapshot.result.payrollPosted,false);assert.equal(snapshot.result.paymentExecuted,false);assert.equal(snapshot.result.municipalApprovalVerified,false);
});

test('explicit L101 preparation lowers to a versioned runtime input and one programme works in September, December and leap February',()=>{
 const expression={op:'choose',condition:{op:'compare',operator:'eq',left:{op:'period_month'},right:literal('units','9')},then:literal('money','0.015'),else:literal('money','0.035')};
 const input=fixture([definition('301',{validFrom:'1900-01',expression})]);input.programmeOptions.periodContextVersion=OWN_PAYROLL_PERIOD_CONTEXT_VERSION;
 const prepared=prepareOwnPayrollProgrammeSource(input);assert.deepEqual(prepared.incidents,[]);assert.equal(prepared.presentable.programme,true);
 const p=prepared.draft.programme,b=p.bindings[0];assert.equal(b.sourceKind,'period_context_fact');assert.equal(b.sourceField,'monthNumber');assert.equal(b.unit,'units');assert.equal(b.combine,'single');assert.equal(b.onMissing,'error');
 assert.deepEqual(p.rules[0].expression.condition.left,{op:'input',key:b.key,unit:'units'});assert.equal(p.periodContextVersion,OWN_PAYROLL_PERIOD_CONTEXT_VERSION);assert.equal(prepared.context.month.nativeBindingSupported,true);
 assert.ok(prepared.trace.some(t=>t.sourceReference==='L[101]'&&t.contextVersion===OWN_PAYROLL_PERIOD_CONTEXT_VERSION));
 const prior=structuredClone(prepared);for(const[period,month,amount]of[['2026-09','9','0.02'],['2026-12','12','0.04'],['2028-02','2','0.04']]){
  const s=approvedSources(1);s.period=period;s.population.employees[0].agreementCode='71';s.monthly.batches=[];
  for(const f of[s.fixed.list.data,s.fixed.export.data])f.periodMonth=period+'-01';
  s.programState={...input.programme,program:{version:h('5'),revision:1,definition:p,salaryVersion:input.programme.salaryCatalog.version,proposalId:uid(9901),approvalId:uid(9902)}};
  const fields={version:OWN_PAYROLL_PERIOD_CONTEXT_VERSION,period,monthNumber:month};s.periodContext={...fields,sha256:ownRunHash(fields)};s.population.version=ownRunHash({employees:s.population.employees,periodContext:s.periodContext});
  const native=prepareOwnPayrollInput(s),result=createOwnPayrollSnapshot(native).result;assert.equal(native.employees[0].inputs.find(v=>v.key===b.key).value,month);assert.equal(result.rows[0].amount,amount);assert.equal(result.paymentExecuted,false);
 }
 assert.deepEqual(prepared,prior);assert.equal(prepared.approved,false);assert.equal(prepared.executable,false);assert.equal(Object.hasOwn(prepared,'command'),false);
});

test('explicit L101 source node shares the same lowering but rejects a parameter or a different unit; L18 and N101 remain unresolved',()=>{
 const source=(reference,unit)=>({op:'source',reference,unit});
 for(const reference of['L[101]']){
  const input=fixture([definition('301',{expression:{op:'choose',condition:{op:'compare',operator:'eq',left:source(reference,'units'),right:literal('units','9')},then:literal('money','1'),else:literal('money','0')}})]);input.programmeOptions.periodContextVersion=OWN_PAYROLL_PERIOD_CONTEXT_VERSION;
  assert.equal(prepareOwnPayrollProgrammeSource(input).presentable.programme,true);
  const conflict=structuredClone(input);conflict.bindings=[{agreementCode:'71',reference,sourceSha256:h('2'),binding:{agreementCode:'71',key:'month',unit:'units',sourceKind:'parameter',sourceCode:'301',combine:'single',onMissing:'error',ruleReference:'Parámetro ficticio distinto'}}];
  assert.ok(codes(prepareOwnPayrollProgrammeSource(conflict)).includes('PERIOD_MONTH_BINDING_CONFLICT'));
  input.definitions[0].expression.condition.left.unit='days';assert.ok(codes(prepareOwnPayrollProgrammeSource(input)).includes('SOURCE_BINDING_UNIT_MISMATCH'));
 }
 for(const reference of['L[18]','N[101]']){const input=fixture([definition('301',{expression:source(reference,'money')})]);input.programmeOptions.periodContextVersion=OWN_PAYROLL_PERIOD_CONTEXT_VERSION;const r=prepareOwnPayrollProgrammeSource(input);assert.equal(r.presentable.programme,false);assert.ok(codes(r).includes('SOURCE_BINDING_UNRESOLVED'));}
 for(const suffix of['\n','\r','\u2028','\u2029']){const input=fixture();input.period+=suffix;assert.throws(()=>prepareOwnPayrollProgrammeSource(input));}
});

test('two rules reuse one custom supplied L101 source without generating a duplicate or freezing a period literal',()=>{
 const expression={op:'choose',condition:{op:'compare',operator:'eq',left:{op:'period_month'},right:literal('units','9')},then:literal('money','1'),else:literal('money','0')},input=fixture([definition('301',{expression}),definition('302',{expression})]);input.programmeOptions.periodContextVersion=OWN_PAYROLL_PERIOD_CONTEXT_VERSION;
 input.bindings=[{agreementCode:'71',reference:'L[101]',sourceSha256:h('2'),binding:{agreementCode:'71',key:'customMonth',unit:'units',sourceKind:'period_context_fact',sourceField:'monthNumber',combine:'single',onMissing:'error',ruleReference:'Origen de período exclusivamente ficticio QA'}}];
 const r=prepareOwnPayrollProgrammeSource(input);assert.deepEqual(r.incidents,[]);assert.equal(r.draft.programme.bindings.length,1);assert.ok(r.draft.programme.rules.every(rule=>rule.expression.condition.left.key==='customMonth'));assert.equal(r.approved,false);assert.equal(r.executable,false);
});
