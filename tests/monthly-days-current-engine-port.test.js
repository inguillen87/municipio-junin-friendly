import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwnPayrollSnapshot} from '../lib/own-payroll-snapshot.js';
import {prepareOwnPayrollInput} from '../lib/own-payroll-approved-input.js';
import {verifyOwnRunReceipt,ownRunHash} from '../lib/internal-own-payroll-run.js';
import {ownProgramStructure} from '../assets/own-payroll-program-model.js';
import {monthlyDayEngineSources} from './fixtures/own-monthly-day-engine-synthetic.js';
import {policySources} from './fixtures/own-monthly-day-policy-synthetic.js';
import {approvedSources} from './fixtures/own-payroll-approved-synthetic.js';
import {capture,runCommand} from './fixtures/own-payroll-run-synthetic.js';
import {rule,lit,fact} from './fixtures/own-payroll-synthetic.js';
import {row} from './fixtures/native-salary-synthetic.js';

function savedReceipt(source) {
  const c = capture({body:runCommand({period:source.period})});
  c.body.scopeVersion = source.programState.scopeVersion;
  c.body.programVersion = source.programState.program.version;
  c.bodySha256 = ownRunHash(c.body);
  c.payload = {...source,sourceInventory:structuredClone(c.payload.sourceInventory)};
  for (const [key,authority] of [['monthlyDays','approved_program_full_month'],['monthlyDayDeclarations','independently_approved_monthly_declaration']]) {
    if (!source[key]) continue;
    const f = source[key];
    c.payload.sourceInventory[key] = {version:f.version,total:f.records.length,complete:true,authority,...(key==='monthlyDays'?{programApprovalId:source.programState.program.approvalId}:{})};
  }
  c.payloadSha256 = ownRunHash(c.payload);
  const snapshot = createOwnPayrollSnapshot(prepareOwnPayrollInput(source));
  c.saved = {version:'own-payroll-saved.v1',id:c.id,algorithmSha256:c.algorithmSha256,inputSha256:snapshot.inputSha256,resultSha256:snapshot.resultSha256,input:snapshot.input,result:snapshot.result,recordedAt:'2026-11-10T12:00:00Z'};
  return c;
}
for (const [label,source,key] of [
  ['192',()=>policySources(),'recognizedDays'],
  ['193',()=>monthlyDayEngineSources(['30','16','0'],{typedOnly:true}),'dayCount'],
]) {
  for (const field of ['value','sourceReference']) test(label+' rejects rehashed saved '+field+' detached from its frozen source',()=>{
    const c = savedReceipt(source());
    assert.equal(verifyOwnRunReceipt(c),c);
    c.saved.input = structuredClone(c.saved.input);
    const input = c.saved.input.employees[0].inputs.find(i=>i.key===key);
    input[field] = field === 'value' ? '29' : 'Una aprobación exclusivamente sintética distinta';
    c.saved.inputSha256 = ownRunHash(c.saved.input);
    assert.throws(()=>verifyOwnRunReceipt(c),e=>e.code==='OWN_RUN_CONTRACT_INVALID');
  });
  test(label+' rejects a rehashed inventory with another approval authority',()=>{
    const c = savedReceipt(source()),inventoryKey = label==='192'?'monthlyDays':'monthlyDayDeclarations';
    c.payload.sourceInventory[inventoryKey].authority = 'unreviewed';
    c.payloadSha256 = ownRunHash(c.payload);
    assert.throws(()=>verifyOwnRunReceipt(c),e=>e.code==='OWN_RUN_CONTRACT_INVALID');
  });
}
test('day fields require their exact opt-in versions and cannot widen an earlier programme',()=>{
  for (const patch of [
    {monthlyDaysVersion:'unknown'},
    {monthlyDayDeclarationVersion:'unknown'},
    {monthlyDaysPolicy:policySources().programState.program.definition.monthlyDaysPolicy},
  ]) assert.throws(()=>ownProgramStructure({...approvedSources().programState.program.definition,...patch}));
});
function quantityOnlySource() {
  const source = approvedSources(1),definition = source.programState.program.definition;
  definition.namespaceVersion = 'own-payroll-namespaces.v2';
  definition.bindings = [{agreementCode:'1',key:'OwnQuantity',unit:'units',sourceKind:'monthly_quantity',sourceCode:'120',onMissing:'error',combine:'single',ruleReference:'Cantidad exclusivamente sintética aprobada'}];
  definition.rules = [rule('900',{op:'multiply',left:lit('10','money'),right:{op:'divide',left:fact('OwnQuantity','units'),right:lit('1','units')}})];
  source.programState.salaryCatalog.items = [
    row({code:'900',nature:'remuneration',unit:'money',value:null}),
    row({code:'120',nature:'non_remuneration',unit:'units',value:null}),
  ];
  Object.assign(source.monthly.batches[0].rows[0],{quantityDecimal:'2',amountCents:'0',forced:true,observation:'Cantidad sintética sin reemplazo monetario'});
  return source;
}
test('current quantity-only explicit zero amount retains its approved forced-input treatment',()=>{
  const input = prepareOwnPayrollInput(quantityOnlySource());
  assert.equal(input.employees[0].inputs[0].value,'2.00000000');
  assert.equal(createOwnPayrollSnapshot(input).result.rows[0].amount,'20.00');
});
for (const [amountCents,expected] of [['1','SOURCE_INPUT_AMOUNT_UNUSED']]) test('quantity-only forced input preserves rejection of amount '+amountCents,()=>{
  const source = quantityOnlySource();
  source.monthly.batches[0].rows[0].amountCents = amountCents;
  assert.throws(()=>prepareOwnPayrollInput(source),e=>e.code===expected);
});

test('quantity-only forced input with a missing amount retains the original source-contract rejection',()=>{
  const source = quantityOnlySource();
  source.monthly.batches[0].rows[0].amountCents = null;
  assert.throws(()=>prepareOwnPayrollInput(source),/no cumple el contrato seguro/);
});
test('an earlier non-opted capture preserves its opaque null source inventory',()=>{
  const c = capture();
  c.payload.sourceInventory = null;
  c.payloadSha256 = ownRunHash(c.payload);
  assert.equal(verifyOwnRunReceipt(c),c);
});
