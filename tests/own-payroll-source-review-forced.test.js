// Synthetic source-review regressions. No SQL, browser or municipal operations.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {ownRunHash,ownRunAlgorithmHash} from '../lib/internal-own-payroll-run.js';
import {prepareOwnPayrollInput,prepareOwnPayrollInputComplete} from '../lib/own-payroll-approved-input.js';
import {createOwnPayrollSnapshot} from '../lib/own-payroll-snapshot.js';
import {ownProgramDefinition} from '../assets/own-payroll-program-model.js';
import {fixedForcedExpressionSet,ownFixedForcedRuleKey} from '../assets/own-payroll-engine.js';
import {ownRunSourceReview,ownSourceReviewCsv} from '../assets/own-payroll-source-review.js';
import {approvedSources} from './fixtures/own-payroll-approved-synthetic.js';
import {capture} from './fixtures/own-payroll-run-synthetic.js';
import {fixedFixture,fixedApprovedRecord,fixedNativeSubject} from './fixtures/payroll-fixed-novelties-synthetic.js';
import {rule,fact,ref,lit} from './fixtures/own-payroll-synthetic.js';
import {uid,hash} from './fixtures/own-payroll-program-synthetic.js';
import {approvedSyntheticSources} from './fixtures/own-monthly-days-approved-synthetic.js';
import {row as sourceReviewSalaryRow} from './fixtures/native-salary-synthetic.js';

const clone=value=>structuredClone(value),FEATURE='own-fixed-forced-amount.v1';
const code=expected=>error=>error?.code===expected;
const sourcesOf=c=>{const {sourceInventory:_audit,...sources}=c.payload;return sources;};

test('source review package: todos los módulos relativos del lector están en el paquete estático',()=>{
 const build=fs.readFileSync('scripts/build-friendly.mjs','utf8'),block=build.match(/const shellFiles = \[([\s\S]*?)\];/);assert.ok(block);
 const shipped=new Set([...block[1].matchAll(/'([^']+)'/g)].map(m=>m[1])),seen=new Set();
 function inspect(file){
  if(seen.has(file))return;seen.add(file);assert.ok(shipped.has(file),'Módulo ausente del paquete: '+file);
  for(const m of fs.readFileSync(file,'utf8').matchAll(/(?:import|export)\s+(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/g))if(m[1].startsWith('.'))inspect(path.posix.normalize(path.posix.join(path.posix.dirname(file),m[1])));
 }
 inspect('assets/own-payroll-source-review.js');assert.ok(seen.size>10);
});
function rehash(c){c.bodySha256=ownRunHash(c.body);c.payloadSha256=ownRunHash(c.payload);return c;}
function captureSources(sources){
 const c=capture({payload:{...sources,sourceInventory:{populationDomain:'native_registered'}}});
 Object.assign(c.body,{period:sources.period,liquidationType:sources.liquidationType,selection:clone(sources.selection),scopeVersion:sources.programState.scopeVersion,programVersion:sources.programState.program.version});
 return rehash(c);
}
function repinLineage(c){
 const p=c.payload.programState.program.definition;
 p.fixedForcedAmountsPolicy.quantityLineage.expressionSetSha256=ownRunHash(fixedForcedExpressionSet(p.rules,p.fixedForcedAmountsPolicy.policies));
 return rehash(c);
}
// Same authored fixture as own-fixed-forced-amount-contract.test.js:24-35.
function fixture(amount='12863',count=1){
 const sources=approvedSources(count),person=sources.population.employees[0],
  target=rule('100',{op:'convert',value:fact('fixedUnits100','units'),unit:'money',factor:'12.50',conversionReference:'Conversión sintética QA; no tarifa municipal'}),
  rules=[target,rule('110',ref('100','exact'))],
  policy={ruleKey:ownFixedForcedRuleKey(target),sourceKind:'fixed_amount',sourceCode:'100',quantityPolicy:'reject',sourceSha256:hash('d'),ruleReference:'Política ficticia aprobada para prueba, sin norma municipal'};
 sources.programState.program.definition={namespaceVersion:'own-payroll-namespaces.v2',rules,bindings:[{agreementCode:'1',key:'fixedUnits100',unit:'units',sourceKind:'fixed_quantity',sourceCode:'100',onMissing:'error',combine:'single',ruleReference:'Cantidad fija QA; no inferir cantidad del importe'}],totalsPrecision:2,fixedForcedAmountsVersion:FEATURE,fixedForcedAmountsPolicy:{quantityLineage:{version:'own-quantity-lineage-review.v1',sourceSha256:hash('a'),sourceControlSha256:hash('b'),expressionSetSha256:ownRunHash(fixedForcedExpressionSet(rules,[policy])),complete:true},policies:[policy]}};
 sources.monthly={complete:true,batches:[]};
 const fixed=fixedFixture(),record=fixedApprovedRecord(1,{conceptSourceId:'100',quantityDecimal:null,amountCents:amount,forced:true,forcedReason:'Importe sintético con aprobación QA',validFrom:'2026-10-01',validTo:'2026-10-31'});
 record.subject={...fixedNativeSubject(person.employeeNumber),contractId:person.contractId,legajo:person.employeeNumber,identityToken:person.identityToken};fixed.state.records.push(record);
 const c=captureSources(sources);
 const refresh=()=>{c.payload.fixed={list:{ok:true,data:fixed.list('2026-10-01')},export:{ok:true,data:fixed.exporter('2026-10-01')}};return rehash(c);};refresh();
 return{c,record,fixed,refresh};
}
function participation(c,fullPeriod){
 const p=c.payload.programState.program.definition,person=c.payload.population.employees[0];
 p.periodParticipation={version:'own-period-participation.v1',fullPeriod:'neutral_fraction',fixedValidity:'declared_values',treatments:p.rules.map(r=>({ruleKey:ownFixedForcedRuleKey(r),treatment:'declared_formula',reference:'Tratamiento ficticio QA explícito'}))};
 // Same approved157 shape as own-fixed-forced-amount.test.js:140-148.
 const configuration={version:hash('c'),revision:1,definition:{recognizedUnits:'1',baseUnits:'2',asOfDate:'2026-10-01',documentReference:'Constancia ficticia QA'},proposalId:uid(510),approvalId:uid(511),identityToken:person.identityToken,sourceVersion:hash('d')};
 const record={contractId:person.contractId,identityToken:person.identityToken,fullPeriod,configuration};
 c.payload.periodParticipation={complete:true,version:ownRunHash(['own-period-participation.v1',c.payload.period,[record]]),records:[record]};
 c.payload.population.version=ownRunHash({employees:c.payload.population.employees,periodParticipation:c.payload.periodParticipation});
 return rehash(c);
}
async function expectIssues(c,expected,{employeeNumber=c.payload.population.employees[0].employeeNumber}={}){
 const before=clone(c),review=await ownRunSourceReview(c),row=review.rows.find(r=>r.employeeNumber===employeeNumber&&r.origin==='fixed'&&r.conceptCode==='100');
 assert.ok(row,'review contains the complete fixed source row');
 for(const issue of expected)assert.ok(row.issues.includes(issue),issue+' remains observable');
 assert.deepEqual(c,before,'review must not alter an approved source or its original request');
 return review;
}

for(const [amount,expected]of [['0','0.00'],['12863','128.63'],['-12863','-128.63']])test('source review forced regression: importe '+amount+' aprobado no inventa cantidad ausente ni política faltante',async()=>{
 const {c}=fixture(amount),before=clone(c),algorithm=ownRunAlgorithmHash(),input=prepareOwnPayrollInput(sourcesOf(c)),snapshot=createOwnPayrollSnapshot(input);
 assert.equal(input.employees[0].fixedForcedAmounts[0].amountCents,amount);
 assert.equal(input.employees[0].inputs.length,0,'the substituted formula does not consume its quantity binding');
 assert.equal(snapshot.result.rows.find(r=>r.conceptCode==='100').amount,expected);
 assert.equal(snapshot.result.rows.find(r=>r.conceptCode==='110').amount,expected,'the exact amount consumer remains evaluated');
 const review=await ownRunSourceReview(c);assert.equal(review.total,1);assert.equal(review.affected,0);assert.deepEqual(review.rows[0].issues,[]);
 const csv=await ownSourceReviewCsv(c);assert.equal(csv.trim().split('\r\n').length,1,'no false incident is exported');
 assert.deepEqual(c,before);assert.equal(ownRunAlgorithmHash(),algorithm);
 assert.equal(snapshot.result.paymentExecuted,false);assert.equal(snapshot.result.municipalApprovalVerified,false);
});

test('source review forced: sin opt-in conserva las incidencias y el adapter rechaza sustitución implícita',async()=>{
 const {c}=fixture(),p=c.payload.programState.program.definition;delete p.fixedForcedAmountsVersion;delete p.fixedForcedAmountsPolicy;rehash(c);
 assert.throws(()=>prepareOwnPayrollInput(sourcesOf(c)),code('FORCED_RULE_REQUIRED'));
 await expectIssues(c,['quantity_missing','forced']);
});

test('source review forced: una política válida para otra regla no autoriza el concepto observado',async()=>{
 const {c}=fixture(),p=c.payload.programState.program.definition,other=rule('120',lit('7','money'),{nature:'non_remuneration'});p.rules.push(other);
 Object.assign(p.fixedForcedAmountsPolicy.policies[0],{ruleKey:ownFixedForcedRuleKey(other),sourceCode:'120'});repinLineage(c);
 assert.doesNotThrow(()=>ownProgramDefinition(p,c.payload.programState.salaryCatalog.items),'the foreign policy itself has a valid shape');
 assert.throws(()=>prepareOwnPayrollInput(sourcesOf(c)),code('FORCED_RULE_REQUIRED'));
 await expectIssues(c,['forced','quantity_missing']);
});

test('source review forced: política incompleta o incoherente rechaza el reporte completo',async()=>{
 for(const [change,expected]of [[p=>p.fixedForcedAmountsPolicy.quantityLineage.complete=false,'FORCED_LINEAGE_REQUIRED'],[p=>p.fixedForcedAmountsPolicy.policies[0].sourceCode='110','FORCED_POLICY_INVALID']]){
  const {c}=fixture();change(c.payload.programState.program.definition);rehash(c);const before=clone(c);
  assert.throws(()=>prepareOwnPayrollInput(sourcesOf(c)),code(expected));await assert.rejects(ownRunSourceReview(c));await assert.rejects(ownSourceReviewCsv(c));assert.deepEqual(c,before);
 }
});

test('source review forced: rehacer la huella exterior no habilita un linaje de expresiones ajeno',async()=>{
 const {c}=fixture();c.payload.programState.program.definition.fixedForcedAmountsPolicy.quantityLineage.expressionSetSha256=hash('0');rehash(c);const before=clone(c);
 assert.throws(()=>prepareOwnPayrollInput(sourcesOf(c)),code('FORCED_LINEAGE_REQUIRED'));
 await assert.rejects(ownRunSourceReview(c));await assert.rejects(ownSourceReviewCsv(c));assert.deepEqual(c,before);
});

test('source review forced: cantidad cero informada no se confunde con cantidad NULL exigida',async()=>{
 const f=fixture();f.record.approved.values.quantityDecimal='0';f.refresh();
 assert.throws(()=>prepareOwnPayrollInput(sourcesOf(f.c)),code('FORCED_QUANTITY_UNKNOWN'));await expectIssues(f.c,['forced']);
});

test('source review forced: un importe NULL con cantidad NULL ya es contrato inválido, no un reemplazo cero',async()=>{
 const f=fixture();f.record.approved.values.amountCents=null;f.refresh();const before=clone(f.c);
 // The existing fixed-row model rejects this shape before policy classification.
 assert.throws(()=>prepareOwnPayrollInput(sourcesOf(f.c)));await assert.rejects(ownRunSourceReview(f.c));await assert.rejects(ownSourceReviewCsv(f.c));assert.deepEqual(f.c,before);
});

test('source review forced: colisiones de última fija y mensual conservan la negativa entre orígenes',async()=>{
 for(const origin of ['fixed','monthly']){
  const f=fixture();
  if(origin==='fixed'){const other=fixedApprovedRecord(2,{conceptSourceId:'100',quantityDecimal:'1',amountCents:'1',validFrom:'2026-10-01',validTo:'2026-10-31'});other.subject=clone(f.record.subject);f.fixed.state.records.push(other);f.refresh();}
  else{f.c.payload.monthly=approvedSources(1).monthly;f.c.payload.monthly.batches[0].rows[0].conceptSourceId='100';rehash(f.c);}
  assert.throws(()=>prepareOwnPayrollInput(sourcesOf(f.c)),code('FORCED_SOURCE_COLLISION'));const review=await expectIssues(f.c,['forced']);assert.equal(review.total,2,'no source is discarded to resolve the collision');
 }
});

test('source review forced: vigencia parcial conserva cantidad ausente y no propone prorrateo implícito',async()=>{
 const f=fixture();f.record.approved.values.validFrom='2026-10-15';f.refresh();
 assert.throws(()=>prepareOwnPayrollInput(sourcesOf(f.c)),code('PRORATION_REQUIRED'));await expectIssues(f.c,['forced','partial','quantity_missing']);
});

test('source review forced: otro contrato del mismo convenio conserva su propia cantidad faltante',async()=>{
 const f=fixture('12863',2),person=f.c.payload.population.employees[1],other=fixedApprovedRecord(2,{conceptSourceId:'100',quantityDecimal:null,amountCents:'250',forced:false,forcedReason:null,validFrom:'2026-10-01',validTo:'2026-10-31'});
 other.subject={...fixedNativeSubject(person.employeeNumber),contractId:person.contractId,legajo:person.employeeNumber,identityToken:person.identityToken};f.fixed.state.records.push(other);f.refresh();
 assert.throws(()=>prepareOwnPayrollInput(sourcesOf(f.c)),code('SOURCE_VALUE_MISSING'));
 const review=await expectIssues(f.c,['quantity_missing'],{employeeNumber:person.employeeNumber});assert.equal(review.total,2);
 assert.deepEqual(review.rows.find(r=>r.employeeNumber===f.c.payload.population.employees[0].employeeNumber).issues,[],'only the eligible contract omits the substituted expression');
 assert.ok(!review.rows.find(r=>r.employeeNumber===person.employeeNumber).issues.includes('forced'),'normal source does not inherit the other contract policy outcome');
});

test('source review forced: otra regla que consume la misma cantidad mantiene su incidencia',async()=>{
 const {c}=fixture(),p=c.payload.programState.program.definition;
 p.rules.push(rule('120',{op:'convert',value:fact('fixedUnits100','units'),unit:'money',factor:'1',conversionReference:'Conversión exclusivamente sintética de otro consumidor'},{nature:'non_remuneration'}));repinLineage(c);
 assert.doesNotThrow(()=>ownProgramDefinition(p,c.payload.programState.salaryCatalog.items));
 assert.throws(()=>prepareOwnPayrollInput(sourcesOf(c)),code('SOURCE_VALUE_MISSING'));await expectIssues(c,['quantity_missing']);
});

test('source review forced: quantity_phase de otra regla no deduce U desde el importe sustituido',async()=>{
 const {c}=fixture(),p=c.payload.programState.program.definition;
 p.rules[1].expression={op:'convert',unit:'money',factor:'1',conversionReference:'Conversión exclusivamente sintética QA',value:{op:'quantity_phase',code:'100',unit:'units',stage:'exact',rounding:null,value:lit('1','units'),sourceReference:'Cantidad ficticia declarada QA; sin norma municipal',sourceSha256:hash('f')}};repinLineage(c);
 assert.doesNotThrow(()=>ownProgramDefinition(p,c.payload.programState.salaryCatalog.items),'the independently valid phase shape reaches the forced quantity guard');
 assert.throws(()=>prepareOwnPayrollInput(sourcesOf(c)),code('FORCED_QUANTITY_UNKNOWN'));await expectIssues(c,['forced']);
});

test('source review forced: participación157 completa permite el reemplazo; parcial o huella ajena no',async()=>{
 const full=participation(fixture().c,true),before=clone(full),input=prepareOwnPayrollInput(sourcesOf(full));assert.equal(input.employees[0].fixedForcedAmounts.length,1);
 const review=await ownRunSourceReview(full);assert.equal(review.affected,0);assert.deepEqual(full,before);
 const partial=participation(fixture().c,false);assert.throws(()=>prepareOwnPayrollInput(sourcesOf(partial)),code('PRORATION_REQUIRED'));await expectIssues(partial,['forced']);
 const corrupt=clone(full);corrupt.payload.periodParticipation.version=hash('0');rehash(corrupt);await assert.rejects(ownRunSourceReview(corrupt));
});

test('source review forced: días193 completos y fuentes fijas v1/v2 conservan política, parcialidad y huellas',async()=>{
 for(const mode of ['legacy','fixed-v2']){
  const prepare=mode==='legacy'?prepareOwnPayrollInput:prepareOwnPayrollInputComplete,sources=approvedSyntheticSources('sql193',{mode,forcedFixed:true}),c=captureSources(sources),before=clone(c);
  const input=prepare(sourcesOf(c)),snapshot=createOwnPayrollSnapshot(input);assert.equal(snapshot.result.rows.find(r=>r.conceptCode==='107').amount,'25000.00');assert.equal(input.employees[0].fixedForcedAmounts.length,1);
  const review=await ownRunSourceReview(c);assert.equal(review.total,1);assert.equal(review.affected,0);assert.deepEqual(review.rows[0].issues,[]);assert.deepEqual(c,before);
  const partial=captureSources(approvedSyntheticSources('sql193',{mode,forcedFixed:true,recognizedDays:'16'}));assert.throws(()=>prepare(sourcesOf(partial)),code('PRORATION_REQUIRED'));
  const partialReview=await ownRunSourceReview(partial);assert.ok(partialReview.rows[0].issues.includes('forced'));
  const corrupt=clone(c);corrupt.payload.monthlyDayDeclarations.version=hash('0');rehash(corrupt);await assert.rejects(ownRunSourceReview(corrupt));
 }
});

test('source review forced: CSV de incidencias permanece sin PII, importes ni justificación y conserva captura/algoritmo',async()=>{
 const f=fixture(),p=f.c.payload.programState.program.definition;delete p.fixedForcedAmountsVersion;delete p.fixedForcedAmountsPolicy;rehash(f.c);
 const before=clone(f.c),algorithm=ownRunAlgorithmHash(),csv=await ownSourceReviewCsv(f.c);
 assert.equal(csv.trim().split('\r\n').length,3,'quantity and forced are distinct complete observations');
 for(const value of [f.c.id,f.c.key,f.record.subject.contractId,f.record.subject.employeeName,f.record.subject.legajo,f.record.subject.identityToken,f.record.approved.values.forcedReason,'12863'])assert.ok(!csv.includes(value),value);
 assert.ok(csv.split('\r\n').filter(Boolean).every(line=>line.split(';').length===6));assert.deepEqual(f.c,before);assert.equal(ownRunAlgorithmHash(),algorithm);
});

test('source review forced: auxiliar homónimo100 conserva su namespace y su cantidad requerida',async()=>{
 const {c}=fixture(),p=c.payload.programState.program.definition;
 const auxiliary=rule('100',fact('fixedUnits100','units'),{nature:'auxiliary',unit:'units'});
 p.rules.push(auxiliary);
 c.payload.programState.salaryCatalog.items.push(sourceReviewSalaryRow({
  kind:'auxiliary',code:'100',nature:'auxiliary',unit:'units',
  label:'Auxiliar homónimo exclusivamente sintético QA',
 }));
 repinLineage(c);
 const concept=p.rules.find(r=>r.code==='100'&&r.nature!=='auxiliary');
 const conceptKey=ownFixedForcedRuleKey(concept),auxiliaryKey=ownFixedForcedRuleKey(auxiliary);
 assert.match(conceptKey,/:concept:100:/);assert.match(auxiliaryKey,/:auxiliary:100:/);assert.notEqual(conceptKey,auxiliaryKey);
 assert.equal(p.fixedForcedAmountsPolicy.policies[0].ruleKey,conceptKey,'the policy replaces only the monetary concept');
 assert.doesNotThrow(()=>ownProgramDefinition(p,c.payload.programState.salaryCatalog.items),'both catalog namespaces and units are valid before source consumption');
 const before=clone(c),algorithm=ownRunAlgorithmHash();
 assert.throws(()=>prepareOwnPayrollInput(sourcesOf(c)),code('SOURCE_VALUE_MISSING'),'the auxiliary still consumes fixedUnits100, whose NULL cannot become zero');
 const review=await expectIssues(c,['quantity_missing']);
 assert.equal(review.total,1);assert.equal(review.affected,1);assert.deepEqual(review.rows[0].issues,['quantity_missing']);
 assert.deepEqual(c,before);assert.equal(ownRunAlgorithmHash(),algorithm);
});

// Additional authored synthetic day-boundary regressions.
// These deliberately changed synthetic digests are negative test inputs, not
// new source evidence, municipal approvals or a native execution admission.
const sourceReviewDayModes=[['legacy',prepareOwnPayrollInput],['fixed-v2',prepareOwnPayrollInputComplete]];

// The existing authored day fixture has these exact population sources.
// Rebind only enclosing fixture hashes so an unrelated stale outer hash does
// not conceal which inner digest is deliberately inconsistent in each case.
function sourceReviewDayPopulationParents(c){
  const p=c.payload,sources={employees:p.population.employees,workingTime:p.workingTime,agreementWorkingTime:p.agreementWorkingTime};
  if(Object.hasOwn(p,'monthlyDays'))Object.assign(sources,{monthlyDays:p.monthlyDays,monthlyDaysScope:p.monthlyDaysScope,periodParticipation:p.periodParticipation});
  else sources.monthlyDayDeclarations=p.monthlyDayDeclarations;
  p.population.version=ownRunHash(sources);
  return rehash(c);
}
function sourceReview192FactParents(c){
  const facts=c.payload.monthlyDays,{complete,version,payloadSha256,...body}=facts;
  facts.payloadSha256=ownRunHash(body);
  facts.version=ownRunHash(['own-monthly-day-facts.v2',facts.payloadSha256]);
  return c;
}

for(const [mode,prepare]of sourceReviewDayModes)test('source review forced gap: SQL192 completo conserva reconocimiento '+mode,async()=>{
  const c=captureSources(approvedSyntheticSources('sql192',{mode,forcedFixed:true})),before=clone(c);
  const input=prepare(sourcesOf(c)),review=await ownRunSourceReview(c);
  assert.equal(input.employees[0].fixedForcedAmounts[0].amountCents,'2500000');
  assert.equal(review.total,1);assert.equal(review.affected,0);assert.deepEqual(review.rows[0].issues,[]);
  assert.equal((await ownSourceReviewCsv(c)).trim().split('\r\n').length,1);
  assert.equal(c.saved,null,'recognition does not create a saved calculation');
  assert.deepEqual(c,before);
});

const sourceReview192DigestNegatives=[
  ['payloadSha256',c=>{
    c.payload.monthlyDays.payloadSha256=hash('0');
    // The outer version deliberately agrees with the false digest; only the
    // payload-to-digest relationship is false, not both relationships at once.
    c.payload.monthlyDays.version=ownRunHash(['own-monthly-day-facts.v2',c.payload.monthlyDays.payloadSha256]);
  }],
  ['version',c=>{c.payload.monthlyDays.version=hash('0');}],
  ['programBasis.policySha256',c=>{
    c.payload.monthlyDays.programBasis.policySha256=hash('0');
    sourceReview192FactParents(c);
  }],
  ['records[0].source.sha256',c=>{
    c.payload.monthlyDays.records[0].source.sha256=hash('0');
    sourceReview192FactParents(c);
  }],
];
for(const [field,change]of sourceReview192DigestNegatives)test('source review forced gap: SQL192 rechaza '+field+' aun con envolturas coherentes',async()=>{
  for(const [mode,prepare]of sourceReviewDayModes){
    const c=captureSources(approvedSyntheticSources('sql192',{mode,forcedFixed:true}));
    change(c);sourceReviewDayPopulationParents(c);const before=clone(c);
    assert.equal(c.payloadSha256,ownRunHash(c.payload),'outer capture is coherent');
    assert.throws(()=>prepare(sourcesOf(c)),code('MONTHLY_DAY_HASH_CHANGED'));
    await assert.rejects(ownRunSourceReview(c));await assert.rejects(ownSourceReviewCsv(c));
    assert.deepEqual(c,before);
  }
});

test('source review forced gap: SQL192 rechaza huella de población ajena con hechos internos intactos',async()=>{
  for(const [mode,prepare]of sourceReviewDayModes){
    const c=captureSources(approvedSyntheticSources('sql192',{mode,forcedFixed:true}));
    c.payload.population.version=hash('0');rehash(c);const before=clone(c);
    assert.throws(()=>prepare(sourcesOf(c)),code('SOURCE_VERSION_INVALID'));
    await assert.rejects(ownRunSourceReview(c));await assert.rejects(ownSourceReviewCsv(c));
    assert.deepEqual(c,before);
  }
});

test('source review forced gap: SQL193 reconoce30 sin declarar mes completo y conserva forced',async()=>{
  for(const [mode,prepare]of sourceReviewDayModes){
    const c=captureSources(approvedSyntheticSources('sql193',{mode,forcedFixed:true})),facts=c.payload.monthlyDayDeclarations,record=facts.records[0];
    assert.equal(record.fullPeriod,true);assert.equal(record.configuration.definition.recognizedDays,'30');
    record.configuration.definition.fullMonthDeclared=false;
    facts.version=ownRunHash(['own-monthly-approved-days.v1',c.payload.period,facts.records]);
    sourceReviewDayPopulationParents(c);const before=clone(c);
    assert.throws(()=>prepare(sourcesOf(c)),code('PRORATION_REQUIRED'));
    const review=await ownRunSourceReview(c);
    assert.equal(review.total,1);assert.equal(review.affected,1);
    assert.ok(review.rows[0].issues.includes('forced'),'30 alone does not declare a complete liquidable month');
    assert.ok((await ownSourceReviewCsv(c)).includes('Novedad en modo forzado'));
    assert.deepEqual(c,before);
  }
});
