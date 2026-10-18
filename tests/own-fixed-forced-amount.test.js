// Invented arithmetic and approved-source fixtures only; no municipal rates or writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as engine from '../assets/own-payroll-engine.js';
import {ownProgramRuleKey,ownProgramStructure} from '../assets/own-payroll-program-model.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {prepareOwnPayrollInput} from '../lib/own-payroll-approved-input.js';
import {payrollInput,employee,rule,lit,fact,ref,binary,policy,payrollId} from './fixtures/own-payroll-synthetic.js';
import {approvedSources} from './fixtures/own-payroll-approved-synthetic.js';
import {fixedFixture,fixedApprovedRecord,fixedNativeSubject} from './fixtures/payroll-fixed-novelties-synthetic.js';

const NS='own-payroll-namespaces.v2',FEATURE='own-fixed-forced-amount.v1';
const clone=value=>structuredClone(value);
const H=value=>createHash('sha256').update(salarySerialized(value)).digest('hex');
const ruleKey=value=>ownProgramRuleKey(value,NS);
const hasCode=code=>error=>error?.code===code;
function declaredFeature(rules){
  const entry={ruleKey:ruleKey(rules.find(value=>value.code==='100')),sourceKind:'fixed_amount',sourceCode:'100',quantityPolicy:'reject',sourceSha256:'d'.repeat(64),ruleReference:'Política nativa ficticia revisada QA; sin norma municipal'};
  // All fixture rules share one agreement, period and type, so the complete scope is literal.
  const expressions=rules.map(value=>({ruleKey:ruleKey(value),expression:value.expression})).sort((a,b)=>a.ruleKey<b.ruleKey?-1:a.ruleKey>b.ruleKey?1:0);
  return{fixedForcedAmountsVersion:FEATURE,fixedForcedAmountsPolicy:{quantityLineage:{version:'own-quantity-lineage-review.v1',sourceSha256:'a'.repeat(64),sourceControlSha256:'b'.repeat(64),expressionSetSha256:H(expressions),complete:true},policies:[entry]}};
}
function directInput({amount='12863',expression=fact('defaultAmount'),extraRules=[],inputs=[],force=true,feature=true}={}){
  const rules=[rule('100',expression),rule('110',ref('100','exact')),rule('120',ref('100','rounded')),...extraRules];
  const pair=declaredFeature(rules),entry=pair.fixedForcedAmountsPolicy.policies[0];
  const ledger={ruleKey:entry.ruleKey,policySha256:H({version:FEATURE,policy:entry}),recordId:payrollId(500),recordVersion:2,proposalId:payrollId(501),sourceRowSha256:'e'.repeat(64),amountCents:amount};
  return payrollInput({version:'own-payroll-input.v2',employees:[employee(1,{inputs,...(feature?{fixedForcedAmounts:force?[ledger]:[]}: {})})],rules,...(feature?pair:{})});
}
const resultRow=(result,code)=>{const row=result.rows.find(value=>value.conceptCode===code);assert.ok(row,'complete result includes '+code);return row;};
function quantityNode(stage='exact',patch={}){
  return{op:'quantity_phase',code:'100',unit:'units',stage,rounding:stage==='rounded'?policy('half_up',2):null,value:lit('1.005','units'),sourceReference:'Cantidad ficticia declarada QA; sin norma municipal',sourceSha256:'f'.repeat(64),...patch};
}
function adapterFixture(amount='0'){
  const sources=approvedSources(1),person=sources.population.employees[0];
  const expression={op:'convert',value:fact('fixedUnits100','units'),unit:'money',factor:'12.50',conversionReference:'Conversión ficticia explícita QA; no tarifa municipal'};
  const rules=[rule('100',expression),rule('110',ref('100','exact'))];
  const bindings=[{agreementCode:'1',key:'fixedUnits100',unit:'units',sourceKind:'fixed_quantity',sourceCode:'100',onMissing:'error',combine:'single',ruleReference:'Cantidad fija ficticia QA; ausencia no equivale a cero'}];
  sources.programState.program.definition={namespaceVersion:NS,rules,bindings,totalsPrecision:2,...declaredFeature(rules)};
  sources.monthly={complete:true,batches:[]};
  const fixture=fixedFixture(),record=fixedApprovedRecord(1,{conceptSourceId:'100',quantityDecimal:null,amountCents:amount,forced:true,forcedReason:'Importe fijo ficticio aprobado QA',validFrom:'2026-10-01',validTo:'2026-10-31'});
  record.subject={...fixedNativeSubject(person.employeeNumber),contractId:person.contractId,legajo:person.employeeNumber,identityToken:person.identityToken};
  fixture.state.records.push(record);
  const refresh=()=>{sources.fixed={list:{ok:true,data:fixture.list('2026-10-01')},export:{ok:true,data:fixture.exporter('2026-10-01')}};};refresh();
  return{sources,fixture,record,refresh};
}

test('importe fijo forzado conserva cero signo y centavos grandes y R exact/rounded sin pedir fórmula sustituida',()=>{
  for(const [amount,expected]of [['0','0.00'],['12863','128.63'],['-12863','-128.63'],['999999999999999999','9999999999999999.99']]){
    const input=directInput({amount}),before=clone(input),result=engine.calculateOwnPayroll(input),producer=resultRow(result,'100');
    assert.deepEqual(input,before);assert.equal(producer.amount,expected);assert.equal(producer.trace.length,1);assert.equal(producer.trace[0].operation,'fixed_forced_amount');
    for(const [code,stage]of [['110','exact'],['120','rounded']]){
      const consumer=resultRow(result,code);assert.equal(consumer.amount,expected);assert.deepEqual(consumer.exactValue,producer.exactValue);assert.equal(consumer.trace.find(value=>value.operation==='concept').stage,stage);assert.equal(consumer.trace.find(value=>value.operation==='concept').reference,'concept:100');
    }
  }
});

test('importe fijo forzado no ejecuta fallo aritmético del target y conserva raíces auxiliares demandadas',()=>{
  const expression=binary('divide',lit('1','money'),lit('0'));
  assert.equal(resultRow(engine.calculateOwnPayroll(directInput({expression,amount:'0'})),'100').amount,'0.00');
  assert.throws(()=>engine.calculateOwnPayroll(directInput({expression,force:false})),hasCode('DIVISION_BY_ZERO'));
  assert.throws(()=>engine.calculateOwnPayroll(directInput({force:false})),hasCode('INPUT_MISSING'));
  const auxiliary=rule('900',fact('unrelatedRequired','units'),{nature:'auxiliary',unit:'units',rounding:policy('exact',3)});
  assert.throws(()=>engine.calculateOwnPayroll(directInput({extraRules:[auxiliary]})),hasCode('INPUT_MISSING'));
  assert.throws(()=>engine.calculateOwnPayroll(directInput({expression:lit('1','units')})),hasCode('UNIT_MISMATCH'));
});

test('importe fijo forzado conserva U normal exacta o redondeada y rechaza U al target aun en rama no elegida',()=>{
  for(const [stage,expected]of [['exact','1.005'],['rounded','1.010']]){
    const auxiliary=rule('900',quantityNode(stage),{nature:'auxiliary',unit:'units',rounding:policy('exact',3)});
    const result=engine.calculateOwnPayroll(directInput({expression:lit('10','money'),force:false,extraRules:[auxiliary]})),row=resultRow(result,'900');
    assert.equal(row.amount,expected);assert.equal(row.trace.filter(value=>value.operation==='quantity_phase').length,1);assert.equal(row.trace.find(value=>value.operation==='quantity_phase').stage,stage);
  }
  const unknown=quantityNode('exact',{value:fact('unknownUnits','units')});
  const hidden={op:'choose',condition:{op:'compare',operator:'eq',left:lit('0'),right:lit('1')},then:unknown,else:lit('0','units')};
  const auxiliary=rule('900',hidden,{nature:'auxiliary',unit:'units',rounding:policy('exact',3)});
  assert.throws(()=>engine.calculateOwnPayroll(directInput({extraRules:[auxiliary]})),hasCode('FORCED_QUANTITY_UNKNOWN'));
  const unknownCode=rule('900',quantityNode('exact',{code:'999999'}),{nature:'auxiliary',unit:'units',rounding:policy('exact',3)});
  assert.throws(()=>engine.calculateOwnPayroll(directInput({expression:lit('10','money'),force:false,extraRules:[unknownCode]})),hasCode('FORCED_LINEAGE_REQUIRED'));
  const auxiliaryOnly=rule('900',quantityNode('exact',{code:'900'}),{nature:'auxiliary',unit:'units',rounding:policy('exact',3)});
  assert.throws(()=>engine.calculateOwnPayroll(directInput({expression:lit('10','money'),force:false,extraRules:[auxiliaryOnly]})),hasCode('FORCED_LINEAGE_REQUIRED'));
  for(const sourceReference of ['U','U1']){
    const phase=rule('900',quantityNode('exact',{sourceReference}),{nature:'auxiliary',unit:'units',rounding:policy('exact',3)});
    assert.equal(resultRow(engine.calculateOwnPayroll(directInput({expression:lit('10','money'),force:false,extraRules:[phase]})),'900').amount,'1.005');
  }
  for(const sourceReference of ['', ' ', ' U', 'U ', 'e\u0301']){
    const phase=rule('900',quantityNode('exact',{sourceReference}),{nature:'auxiliary',unit:'units',rounding:policy('exact',3)});
    assert.throws(()=>engine.calculateOwnPayroll(directInput({expression:lit('10','money'),force:false,extraRules:[phase]})),hasCode('FORCED_LINEAGE_REQUIRED'));
  }
  const legacyReference=directInput({feature:false,force:false,inputs:[{key:'defaultAmount',unit:'money',value:'1',sourceReference:'U'}]});
  assert.throws(()=>engine.calculateOwnPayroll(legacyReference),hasCode('INPUT_INVALID'));
  const legacyRule=directInput({feature:false,force:false});legacyRule.rules[0].ruleReference='U';
  assert.throws(()=>engine.calculateOwnPayroll(legacyRule),hasCode('RULE_INVALID'));
});

test('importe fijo forzado exige importe canónico política completa fuente única y precisión aprobada',()=>{
  for(const amount of [null,'-0','01'])assert.throws(()=>engine.calculateOwnPayroll(directInput({amount})),hasCode('FORCED_AMOUNT_MISSING'));
  const duplicate=directInput();duplicate.employees[0].fixedForcedAmounts.push({...duplicate.employees[0].fixedForcedAmounts[0],recordId:payrollId(502)});
  assert.throws(()=>engine.calculateOwnPayroll(duplicate),hasCode('FORCED_SOURCE_COLLISION'));
  const incomplete=directInput();incomplete.fixedForcedAmountsPolicy.quantityLineage.complete=false;assert.throws(()=>engine.calculateOwnPayroll(incomplete),hasCode('FORCED_LINEAGE_REQUIRED'));
  const wrongPolicy=directInput();wrongPolicy.fixedForcedAmountsPolicy.policies[0].sourceCode='110';assert.throws(()=>engine.calculateOwnPayroll(wrongPolicy),hasCode('FORCED_POLICY_INVALID'));
  const precision=directInput({amount:'12863'});precision.rules[0].rounding=policy('half_up',0);assert.throws(()=>engine.calculateOwnPayroll(precision),hasCode('FORCED_PRECISION_LOSS'));
});

test('importe fijo forzado no añade campos legacy y no presenta declaración documental como prueba histórica',()=>{
  const options={force:false,inputs:[{key:'defaultAmount',unit:'money',value:'12.34',sourceReference:'Valor nativo ficticio QA'}]};
  const legacy=directInput({...options,feature:false}),before=clone(legacy),normal=engine.normalizeOwnPayrollInput(legacy),opted=directInput(options);
  assert.equal(Object.hasOwn(normal,'fixedForcedAmountsVersion'),false);assert.equal(Object.hasOwn(normal.employees[0],'fixedForcedAmounts'),false);
  assert.equal(salarySerialized(engine.calculateOwnPayroll(legacy)),salarySerialized(engine.calculateOwnPayroll(opted)));assert.deepEqual(legacy,before);
  // Runtime cannot identify a historical U once it was inlined. These are declared native literals.
  const declared=directInput({expression:lit('7','money')});declared.fixedForcedAmountsPolicy.quantityLineage.sourceSha256='9'.repeat(64);
  assert.equal(resultRow(engine.calculateOwnPayroll(declared),'100').amount,'128.63');
});

test('importe fijo forzado adapter conserva lista export completa y ledger exacto sin fabricar cantidad cero',()=>{
  const {sources}=adapterFixture(),before=clone(sources),input=prepareOwnPayrollInput(sources),row=sources.fixed.export.data.rows[0],entry=sources.programState.program.definition.fixedForcedAmountsPolicy.policies[0];
  assert.deepEqual(sources,before);assert.deepEqual(input.employees[0].inputs,[]);assert.equal(sources.fixed.list.data.rows[0].approved.values.quantityDecimal,null);
  assert.deepEqual(input.employees[0].fixedForcedAmounts,[{ruleKey:entry.ruleKey,policySha256:H({version:FEATURE,policy:entry}),recordId:row.recordId,recordVersion:row.version,proposalId:row.proposalId,sourceRowSha256:H(row),amountCents:'0'}]);
  assert.equal(input.sourceVersions.novelties,H({monthly:sources.monthly,fixed:sources.fixed.export.data}));assert.equal(resultRow(engine.calculateOwnPayroll(input),'100').amount,'0.00');
  const noFeature=clone(sources);delete noFeature.programState.program.definition.fixedForcedAmountsVersion;delete noFeature.programState.program.definition.fixedForcedAmountsPolicy;
  assert.throws(()=>prepareOwnPayrollInput(noFeature),hasCode('FORCED_RULE_REQUIRED'));
});

test('importe fijo forzado adapter rechaza colisión de última fija y mensual sin priorizar ni omitir fuente',()=>{
  const fixed=adapterFixture(),other=fixedApprovedRecord(2,{conceptSourceId:'100',quantityDecimal:'1',amountCents:'1',validFrom:'2026-10-01',validTo:'2026-10-31'});other.subject=clone(fixed.record.subject);fixed.fixture.state.records.push(other);fixed.refresh();
  assert.equal(fixed.sources.fixed.export.data.rows.length,2);assert.throws(()=>prepareOwnPayrollInput(fixed.sources),hasCode('FORCED_SOURCE_COLLISION'));
  const monthly=adapterFixture(),batch=approvedSources(1).monthly.batches[0];batch.rows[0].conceptSourceId='100';monthly.sources.monthly.batches.push(batch);
  assert.throws(()=>prepareOwnPayrollInput(monthly.sources),hasCode('FORCED_SOURCE_COLLISION'));
  const truncated=adapterFixture();truncated.sources.fixed.export.data.rows=[];truncated.sources.fixed.export.data.total=0;
  assert.throws(()=>prepareOwnPayrollInput(truncated.sources));
});

test('importe fijo forzado adapter comprueba AST actual identidad y fuente no usada conservando captura',()=>{
  const badDigest=adapterFixture();badDigest.sources.programState.program.definition.fixedForcedAmountsPolicy.quantityLineage.expressionSetSha256='0'.repeat(64);
  assert.throws(()=>prepareOwnPayrollInput(badDigest.sources),hasCode('FORCED_LINEAGE_REQUIRED'));
  const changed=adapterFixture();changed.record.subject.identityToken='1'.repeat(64);changed.refresh();assert.throws(()=>prepareOwnPayrollInput(changed.sources),hasCode('SOURCE_IDENTITY_CHANGED'));
  const unused=adapterFixture(),extra=fixedApprovedRecord(2,{conceptSourceId:'120',quantityDecimal:'1',amountCents:null,validFrom:'2026-10-01',validTo:'2026-10-31'});extra.subject=clone(unused.record.subject);unused.fixture.state.records.push(extra);unused.refresh();
  const before=clone(unused.sources);assert.throws(()=>prepareOwnPayrollInput(unused.sources),hasCode('SOURCE_UNUSED'));assert.deepEqual(unused.sources,before);
});
test('importe fijo forzado requiere período completo cuando el programa declara participación explícita',()=>{
  const {sources}=adapterFixture(),program=sources.programState.program.definition,person=sources.population.employees[0];
  program.periodParticipation={version:'own-period-participation.v1',fullPeriod:'neutral_fraction',fixedValidity:'declared_values',treatments:program.rules.map(r=>({ruleKey:ruleKey(r),treatment:'declared_formula',reference:'Tratamiento ficticio QA explícito'}))};
  const configuration={version:'c'.repeat(64),revision:1,definition:{recognizedUnits:'1',baseUnits:'2',asOfDate:'2026-10-01',documentReference:'Constancia ficticia QA'},proposalId:payrollId(510),approvalId:payrollId(511),identityToken:person.identityToken,sourceVersion:'d'.repeat(64)};
  const record={contractId:person.contractId,identityToken:person.identityToken,fullPeriod:false,configuration};
  const repin=()=>{sources.periodParticipation={complete:true,version:H(['own-period-participation.v1',sources.period,[record]]),records:[record]};sources.population.version=H({employees:sources.population.employees,periodParticipation:sources.periodParticipation});};
  repin();assert.throws(()=>prepareOwnPayrollInput(sources),hasCode('PRORATION_REQUIRED'));
  record.fullPeriod=true;repin();assert.equal(prepareOwnPayrollInput(sources).employees[0].fixedForcedAmounts[0].amountCents,'0');
  delete record.fullPeriod;repin();assert.throws(()=>prepareOwnPayrollInput(sources),hasCode('PARTICIPATION_CAPTURE_INVALID'));
});
test('importe fijo forzado exige namespace explícito al admitir el programa, antes de crear entrada',()=>{
  const input=directInput(),raw={namespaceVersion:NS,rules:input.rules,bindings:[{agreementCode:'1',key:'defaultAmount',unit:'money',sourceKind:'parameter',sourceCode:'8800',onMissing:'error',combine:'single',ruleReference:'Parámetro ficticio QA'}],totalsPrecision:2,fixedForcedAmountsVersion:input.fixedForcedAmountsVersion,fixedForcedAmountsPolicy:input.fixedForcedAmountsPolicy};
  assert.equal(ownProgramStructure(raw).namespaceVersion,NS);
  const noNamespace=clone(raw);delete noNamespace.namespaceVersion;
  assert.throws(()=>ownProgramStructure(noNamespace),hasCode('FORCED_POLICY_INVALID'));
  const legacy=clone(noNamespace);delete legacy.fixedForcedAmountsVersion;delete legacy.fixedForcedAmountsPolicy;
  assert.equal(Object.hasOwn(ownProgramStructure(legacy),'namespaceVersion'),false);
});
