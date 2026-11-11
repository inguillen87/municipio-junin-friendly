import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareOwnPayrollInput} from '../lib/own-payroll-approved-input.js';
import {createOwnPayrollSnapshot} from '../lib/own-payroll-snapshot.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {approvedSources} from './fixtures/own-payroll-approved-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';
import {rule, lit, fact} from './fixtures/own-payroll-synthetic.js';
import {fixedApprovedRecord} from './fixtures/payroll-fixed-novelties-synthetic.js';
const sha = v => createHash('sha256').update(salarySerialized(v)).digest('hex');

function fixture({family = 'monthly', native = false, forced = true, amount = '0', quantity = '2'} = {}) {
  const s = approvedSources(1), original = s.monthly.batches[0].rows[0];
  const inputRow = {...s.programState.salaryCatalog.items.find(r => r.code === '100'), code: '101', label: 'Entrada de días sintética', unit: 'days', precision: 2};
  s.programState.salaryCatalog.items.push(inputRow);
  s.programState.program.definition = {totalsPrecision: 2, bindings: [{agreementCode:'1', key:'daysInput', unit:'days', sourceKind:family+'_quantity', sourceCode:'101', combine:'sum', onMissing:'zero', ruleReference:'Entrada de cantidad explícita sintética, sin importe propio'}], rules:[rule('100', {op:'multiply', left:lit('100','money'), right:{op:'divide', left:fact('daysInput','days'), right:lit('1','days')}}, {nature:'remuneration'})]};
  Object.assign(original, {conceptSourceId:'101', quantityDecimal:quantity, amountCents:amount, forced, observation:'Prueba de cantidad forzada con importe cero explícito.'});
  if (family === 'fixed') {
    const row = fixedApprovedRecord(1, {conceptSourceId:'101', quantityDecimal:quantity, amountCents:amount, forced, forcedReason:forced?'Prueba sintética de cantidad fija, no reemplazo monetario.':null, validFrom:'2026-10-01', validTo:null});
    row.subject = structuredClone(original.subject);
    s.monthly.batches=[]; s.fixed.list.data.rows=[row]; s.fixed.list.data.total=1;
    s.fixed.export.data.rows=[{recordId:row.id,version:row.version,proposalId:row.approved.id,subject:row.subject,values:row.approved.values}]; s.fixed.export.data.total=1;
  } else if (native) {
    const subject=structuredClone(original.subject), values={rowOrdinal:1,legajo:subject.legajo,contractId:subject.contractId,identityToken:subject.identityToken,conceptSourceId:'101',costCenterSourceId:null,adjustmentMonth:null,quantityDecimal:quantity,amountCents:amount,movementType:null,legalInstrument:null,observation:'Cantidad nativa sintética con cero explícito.',forced};
    const rows=[{values,subject,identityCurrent:true}], preparedBy={membershipId:uid(8101),personId:uid(8102)}, firstReviewer={membershipId:uid(8103),personId:uid(8104)}, secondReviewer={membershipId:uid(8106),personId:uid(8107)};
    const decidedBy=forced?secondReviewer:firstReviewer, approvals=forced?[firstReviewer,secondReviewer]:[firstReviewer];
    const batch={version:'own-payroll-novelty-batch.v1',id:uid(8105),revision:forced?4:3,status:'approved',periodMonth:'2026-10-01',payrollType:'monthly',rows,rowCount:1,rowsSha256:sha(rows.map(({values,subject})=>({values,subject}))),preparedBy,decidedBy,approvals,grhMutation:false,payrollCalculated:false,payrollPosted:false};
    s.monthly={complete:true,batches:[],nativeBatches:[batch]};
  }
  return s;
}

for (const mode of [{label:'mensual importada'}, {label:'mensual propia',native:true}, {label:'fija',family:'fixed'}]) {
  test(mode.label+': el forzado de cantidad explícita no inventa ni reemplaza un pago', () => {
    const source=fixture(mode), before=structuredClone(source), input=prepareOwnPayrollInput(source), result=createOwnPayrollSnapshot(input).result;
    assert.equal(input.employees[0].inputs[0].value,'2.00000000');
    assert.equal(result.rows.length,1); assert.equal(result.rows[0].conceptCode,'100'); assert.equal(result.rows[0].amount,'200.00');
    assert.ok(!result.rows.some(r=>r.conceptCode==='101'));
    assert.deepEqual(source,before);
  });
  for (const amount of ['1','-1']) test(mode.label+': rechaza importe '+amount+' sin descartar datos', () => {
    assert.throws(()=>prepareOwnPayrollInput(fixture({...mode,amount})), e=>e.code==='SOURCE_INPUT_AMOUNT_UNUSED');
  });
  test(mode.label+': un importe ausente no acredita el cero del campo no usado', () => {
    assert.throws(()=>prepareOwnPayrollInput(fixture({...mode,amount:null})));
  });
}
test('el cero explícito de cantidad se conserva como dato sin fabricar un renglón del input', () => {
  const input=prepareOwnPayrollInput(fixture({quantity:'0'}));
  assert.equal(input.employees[0].inputs[0].value,'0.00000000');
  assert.equal(createOwnPayrollSnapshot(input).result.rows[0].amount,'0.00');
});
test('el indicador Forzado queda trazado y modifica las huellas sin cambiar la cantidad', () => {
  const no=prepareOwnPayrollInput(fixture({forced:false})), yes=prepareOwnPayrollInput(fixture());
  assert.equal(no.employees[0].inputs[0].value,yes.employees[0].inputs[0].value);
  assert.notEqual(no.employees[0].inputs[0].sourceReference,yes.employees[0].inputs[0].sourceReference);
  assert.notEqual(no.sourceVersions.novelties,yes.sourceVersions.novelties);
});
test('una entrada no forzada tampoco descarta silenciosamente un importe informado', () => {
  assert.throws(()=>prepareOwnPayrollInput(fixture({forced:false,amount:'900'})),e=>e.code==='SOURCE_INPUT_AMOUNT_UNUSED');
});
test('si existe un pago del mismo código el forzado sigue necesitando el contrato monetario', () => {
  const s=fixture(); s.programState.program.definition.rules.push(rule('101',lit('12','money'),{nature:'remuneration'}));
  assert.throws(()=>prepareOwnPayrollInput(s),e=>e.code==='FORCED_RULE_REQUIRED');
});
test('un pago histórico o de otro tipo no altera la propiedad del período capturado', () => {
  const s=fixture(); s.programState.program.definition.rules.push(rule('101',lit('12','money'),{nature:'remuneration',validFrom:'2026-11'}));
  assert.equal(prepareOwnPayrollInput(s).employees[0].inputs[0].value,'2.00000000');
});
test('consumir el importe del mismo canal impide calificarlo como sólo cantidad', () => {
  const s=fixture(), p=s.programState.program.definition;
  p.bindings.push({agreementCode:'1',key:'amountInput',unit:'money',sourceKind:'monthly_amount',sourceCode:'101',combine:'sum',onMissing:'error',ruleReference:'Importe sintético declarado para demostrar que no es sólo cantidad'});
  p.rules[0].expression={op:'add',left:p.rules[0].expression,right:fact('amountInput','money')};
  assert.throws(()=>prepareOwnPayrollInput(s),e=>e.code==='FORCED_RULE_REQUIRED');
});
test('otro convenio no autoriza la entrada del convenio seleccionado', () => {
  const s=fixture(); s.programState.program.definition.bindings[0].agreementCode='2';
  assert.throws(()=>prepareOwnPayrollInput(s),e=>['BINDING_MISSING','BINDING_UNUSED'].includes(e.code));
});
test('el lote propio mantiene la verificación del hash íntegro', () => {
  const s=fixture({native:true});s.monthly.nativeBatches[0].rows[0].values.quantityDecimal='3';
  assert.throws(()=>prepareOwnPayrollInput(s),e=>e.code==='SOURCE_SCOPE_INVALID');
});
test('el lote propio mantiene la aprobación independiente', () => {
  const s=fixture({native:true}), b=s.monthly.nativeBatches[0]; b.decidedBy=b.preparedBy;b.approvals=[b.preparedBy];
  assert.throws(()=>prepareOwnPayrollInput(s),e=>e.code==='OWN_NOVELTY_CONTRACT_INVALID');
});
test('la cantidad fija no permite prorrateo implícito', () => {
  const s=fixture({family:'fixed'});s.fixed.list.data.rows[0].approved.values.validFrom='2026-10-15';
  assert.throws(()=>prepareOwnPayrollInput(s),e=>e.code==='PRORATION_REQUIRED');
});
test('V1 comparte códigos: un auxiliar monetario del mismo código sigue requiriendo el contrato de forzado', () => {
  const s=fixture(), p=s.programState.program.definition;
  Object.assign(s.programState.salaryCatalog.items.find(r=>r.code==='101'),{nature:'auxiliary',unit:'money'});
  p.bindings[0].unit='money';
  p.rules=[rule('101',fact('daysInput','money'),{nature:'auxiliary'}),rule('100',{op:'concept',code:'101',stage:'exact'},{nature:'remuneration'})];
  assert.throws(()=>prepareOwnPayrollInput(s),e=>e.code==='FORCED_RULE_REQUIRED');
});
test('V2 distingue el input de concepto y un auxiliar con igual código, sin alterar el auxiliar', () => {
  const s=fixture(), p=s.programState.program.definition;
  p.namespaceVersion='own-payroll-namespaces.v2';
  const row=s.programState.salaryCatalog.items.find(r=>r.code==='101');
  s.programState.salaryCatalog.items.push({...row,kind:'auxiliary',nature:'auxiliary',unit:'money'});
  p.rules.push(rule('101',lit('77','money'),{nature:'auxiliary'}));
  const input=prepareOwnPayrollInput(s),result=createOwnPayrollSnapshot(input).result;
  assert.equal(input.employees[0].inputs[0].value,'2.00000000');
  assert.equal(result.rows.find(r=>r.nature==='auxiliary'&&r.conceptCode==='101').amount,'77.00');
  assert.ok(!result.rows.some(r=>r.nature!=='auxiliary'&&r.conceptCode==='101'));
});
test('Forzado con importe cero no inventa una cantidad ausente', () => {
  assert.throws(()=>prepareOwnPayrollInput(fixture({quantity:null})),e=>e.code==='FORCED_RULE_REQUIRED');
});
