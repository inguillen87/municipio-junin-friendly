import test from 'node:test';
import assert from 'node:assert/strict';
import {createOwn190NativeErrorExpectations, own190ExpectedNativeRpcError} from '../scripts/lib/own-payroll-expected-native-rpc.mjs';
import {employeeContext} from '../lib/internal-native-employees.js';
import {ownerAdoptionFixture} from './fixtures/municipal-owner-adoption-synthetic.js';
import {bindOwnFullCapacity190} from '../scripts/lib/own-payroll-full-capacity-190-continuation.mjs';
import {ownLiquidationOperation} from '../lib/internal-own-payroll-liquidation.js';
import {ownReceiptOperation} from '../lib/internal-own-payroll-receipts.js';
import {ownAnnulOperation} from '../lib/internal-own-payroll-annulment.js';
import {journalOperation} from '../lib/internal-own-payroll-journal.js';
import {accountingOperation} from '../lib/internal-own-payroll-accounting.js';
import {receiptCommand} from './fixtures/own-payroll-receipt-synthetic.js';
import {annulReviewScenario} from './fixtures/own-payroll-annulment-review-synthetic.js';
import {syntheticAccountingCommand} from './fixtures/own-payroll-accounting-synthetic.js';
import {ownReceiptCommand} from '../assets/own-payroll-receipt-model.js';
import {ownAnnulReviewCommand} from '../assets/own-payroll-annulment-review-model.js';
import {accountingCommand} from '../assets/own-payroll-accounting-model.js';

const text = 'SELECT public.own_liquidation_detail_v1($1::jsonb,$2::uuid) AS result';
const id = 'abcdefab-cdef-4abc-8abc-abcdefabcdef';
const spec = {caseId: '855-legacy-detail', nativeCode: 'OWN_LIQ_LIMIT', text, values: ['{"actorEmail":"fixture@example.invalid"}', id]};
const complete=(n,expected)=>n.completeExpectedError(expected,{status:3,stderr:'ERROR: '+expected.nativeCode+'\n'});

test('expectativa exige RPC y todos los argumentos exactos; normalidad fuera del caso', async () => {
  const n = createOwn190NativeErrorExpectations();
  assert.equal(n.consumeQuery({text, values: spec.values}), null);
  await n.expectQueryError(spec, async () => {
    for (const request of [{text: text + ' ', values: spec.values}, {text, values: [spec.values[0], id + '0']}, {text, values: ['{}', id]}, {text, values: [...spec.values, 'extra']}]) assert.equal(n.consumeQuery(request), null);
    assert.equal(n.consumeRun({statement: 'SELECT 1', runtime: true}), null);
    const expected = n.consumeQuery({text, values: [...spec.values]});
    assert.equal(expected.nativeCode, 'OWN_LIQ_LIMIT');
    assert.equal(expected.end, 'ROLLBACK');
    assert.equal(Object.isFrozen(expected), true);
    assert.equal(Object.isFrozen(expected.values), true);
    complete(n,expected);
  });
  n.assertIdle();assert.equal(n.consumeQuery({text, values: spec.values}), null);
});

test('el contexto real no se sustituye por el actorQA ni por una proyección parcial', async () => {
  const fixture = await ownerAdoptionFixture(), context = JSON.stringify(employeeContext(fixture.access.principal, fixture.session)), n = createOwn190NativeErrorExpectations();
  const original = [context, id];
  await n.expectQueryError({...spec, values: original}, async () => {
    original[0] = '{}';
    assert.equal(n.consumeQuery({text, values: original}), null);
    const partial = JSON.parse(context);delete partial.actorSessionVersion;
    assert.equal(n.consumeQuery({text, values: [JSON.stringify(partial), id]}), null);
    complete(n,n.consumeQuery({text, values: [context, id]}));
  });
});

test('reentrancia, segunda coincidencia y reutilización no emiten otra operación admitida', async () => {
  const n = createOwn190NativeErrorExpectations();let emissions = 0;
  await assert.rejects(n.expectQueryError(spec, async () => {
    await assert.rejects(n.expectQueryError({...spec, caseId: 'other-case'}, async () => {}), /REENTRANT/);
    const expected=n.consumeQuery({text, values: spec.values});if (expected) emissions++;
    assert.throws(() => n.consumeQuery({text, values: spec.values}), /ALREADY_CONSUMED/);
    complete(n,expected);
  }), /EXTRA_INVOCATION/);
  assert.equal(emissions, 1);n.assertIdle();
  await assert.rejects(n.expectQueryError(spec, async () => {}), /CASE_REUSED/);
});

test('rechazo previo al SQL no acredita el caso y un fallo original se propaga intacto', async () => {
  const n = createOwn190NativeErrorExpectations();
  await assert.rejects(n.expectQueryError(spec, async () => ({status: 403})), /NOT_OBSERVED/);n.assertIdle();
  const failure = Object.assign(Error('native raw persistence failed'), {code: 'QA_CAPTURE_FAILED'});
  await assert.rejects(n.expectQueryError({...spec, caseId: 'capture-failure'}, async () => {n.consumeQuery({text, values: spec.values});throw failure;}), error => error === failure);
  n.assertIdle();
});

test('reentrancia atrapada invalida el exterior aun con una sola emisión correcta', async () => {
  const n = createOwn190NativeErrorExpectations();let emissions = 0;
  await assert.rejects(n.expectQueryError(spec, async () => {
    await assert.rejects(n.expectQueryError({...spec, caseId: 'nested-only'}, async () => {}), /REENTRANT/);
    const expected=n.consumeQuery({text, values: spec.values});if (expected) emissions++;complete(n,expected);
  }), /EXTRA_INVOCATION/);
  assert.equal(emissions, 1);n.assertIdle();
});

test('run liga el SELECT completo y runtime; no cubre DDL ni otro canal', async () => {
  const n = createOwn190NativeErrorExpectations(), statement = 'SELECT own_annul_command_full_v1(\'{}\'::jsonb)';
  await n.expectRunError({caseId: '855-late-fault', nativeCode: 'QA_LATE_FAULT', statement, runtime: true}, async () => {
    assert.equal(n.consumeRun({statement, runtime: false}), null);
    assert.equal(n.consumeRun({statement: statement + ' ', runtime: true}), null);
    assert.equal(n.consumeQuery({text, values: spec.values}), null);
    complete(n,n.consumeRun({statement, runtime: true}));
  });n.assertIdle();
});

test('descriptores no aceptan campos extra, códigos numéricos o argumentos dispersos', async () => {
  for (const change of [{extra: true}, {nativeCode: '42501'}, {values: new Array(2)}, {values: ['{}', 1]}, {values: Object.assign(['{}', id], {extra: 'x'})}]) {
    const n = createOwn190NativeErrorExpectations();await assert.rejects(n.expectQueryError({...spec, ...change}, async () => {}));n.assertIdle();
  }
  const n = createOwn190NativeErrorExpectations();await assert.rejects(n.expectRunError({caseId: 'invalid-run', nativeCode: 'QA_REJECTED', statement: 'DROP SCHEMA anything', runtime: true}, async () => {}));n.assertIdle();
});

test('sólo un retorno esperado validado se transforma en error del driver', () => {
  const expected = {nativeCode: 'OWN_LIQ_LIMIT'}, stderr = 'ERROR: OWN_LIQ_LIMIT\nCONTEXT: fixture\n';
  assert.equal(own190ExpectedNativeRpcError({status: 3, stderr}, expected).message, stderr);
  for (const result of [{status: 0, stderr}, {status: 3, stderr: 'ERROR: OWN_LIQ_FORBIDDEN\n'}, {status: 3}]) assert.throws(() => own190ExpectedNativeRpcError(result, expected));
});

test('bind y servicio reales conservan el código seguro después del retorno nativo esperado', async () => {
  const fixture = await ownerAdoptionFixture();
  fixture.access.principal.tenant.effectiveCapabilities.push('payroll.calculation.read', 'payroll.calculation.nominal.read', 'payroll.calculation.approve');
  const context = JSON.stringify(employeeContext(fixture.access.principal, fixture.session)), calls = [];
  const h = {qa: {schema: 'mc_qa_fixed_092_' + 'b'.repeat(32)},
    json(statements, options) {calls.push({kind: 'normal', statements, options});return {connection: {pid: 7, backendStart: 'synthetic-start'}, result: {normal: true}};},
    expectRollback(statements, code, options) {calls.push({kind: 'expected', statements, code, options});return {status: 3, stderr: 'ERROR: OWN_LIQ_LIMIT\nCONTEXT: PRIVATE_SYNTHETIC\n'};}
  };
  const db = bindOwnFullCapacity190(h);
  await db.expectQueryError({...spec, values: [context, id]}, () => assert.rejects(
    ownLiquidationOperation(db, fixture.access.principal, fixture.session, 'detail', {id}, {fullJson: false}),
    error => error.code === 'OWN_LIQ_LIMIT' && error.status === 422 && !error.message.includes('PRIVATE_SYNTHETIC')));
  assert.equal(calls.length, 1);assert.equal(calls[0].kind, 'expected');assert.equal(calls[0].code, 'OWN_LIQ_LIMIT');assert.deepEqual(calls[0].options, {command: true});
  assert.equal(calls[0].statements[0], 'SET LOCAL ROLE municontrol_actions_runtime_app');assert.match(calls[0].statements[1], /own_liquidation_detail_v1/);
  assert.equal(db.connections.length, 0, 'expected error has no fabricated connection envelope');db.assertNoExpectedRpc();
  assert.deepEqual(await db.query(text, [context, id]), [{result: {normal: true}}]);assert.equal(calls.at(-1).kind, 'normal');assert.equal(calls.at(-1).options.fullJson, true);
});

test('bind no transforma un fallo de captura; comandos sin fila JSON conservan su perfil', async () => {
  const failure = Object.assign(Error('capture persistence failed'), {code: 'QA_RAW_FAILED'}), calls = [];
  const db = bindOwnFullCapacity190({qa: {schema: 'mc_qa_fixed_092_' + 'c'.repeat(32)},
    expectRollback() {throw failure;},
    json(statements, options) {calls.push({statements, options});return 'CREATE TRIGGER';}
  });
  await assert.rejects(db.expectQueryError(spec, () => db.query(text, spec.values)), error => error === failure);db.assertNoExpectedRpc();
  assert.equal(calls.length, 0);
  assert.equal(await db.run('CREATE TRIGGER synthetic_only'), 'CREATE TRIGGER');assert.equal(calls.length, 1);assert.deepEqual(calls[0].options, {command: false});
});

for(const scenario of [
  {name:'recibos',service:ownReceiptOperation,operation:'command',body:()=>receiptCommand(),normalize:ownReceiptCommand,rpc:'own_receipt_command_v1',code:'OWN_RECEIPT_IDEMPOTENCY_REUSE'},
  {name:'anulación v2',service:ownAnnulOperation,operation:'command-v2',body:()=>annulReviewScenario().receipt.body,normalize:ownAnnulReviewCommand,rpc:'own_annul_command_full_v2',code:'OWN_LIQ_IDEMPOTENCY_REUSE'},
  {name:'asociaciones',service:accountingOperation,operation:'command',body:()=>syntheticAccountingCommand(),normalize:accountingCommand,rpc:'own_accounting_command_v1',code:'ACCOUNTING_IDEMPOTENCY_REUSE'}
])test('bind alcanza el rechazo real de '+scenario.name+' con el cuerpo normalizado completo',async()=>{
  const fixture=await ownerAdoptionFixture(),context=JSON.stringify(employeeContext(fixture.access.principal,fixture.session));
  const body=scenario.body(),calls=[],rpc='SELECT public.'+scenario.rpc+'($1::jsonb,$2::jsonb,$3::uuid) AS result';
  const db=bindOwnFullCapacity190({qa:{schema:'mc_qa_fixed_092_'+'d'.repeat(32)},json(){assert.fail('unexpected ordinary SQL');},expectRollback(statements,code){calls.push({statements,code});return{status:3,stderr:'ERROR: '+code+'\nCONTEXT: PRIVATE_SYNTHETIC\n'};}});
  await db.expectQueryError({caseId:'service-'+scenario.rpc,nativeCode:scenario.code,text:rpc,values:[context,JSON.stringify(scenario.normalize(body)),id]},()=>assert.rejects(
    scenario.service(db,fixture.access.principal,fixture.session,scenario.operation,{key:id,body},{fullJson:true}),
    error=>error.code===scenario.code&&error.status===409&&!error.message.includes('PRIVATE_SYNTHETIC')));
  assert.equal(calls.length,1);assert.equal(calls[0].code,scenario.code);db.assertNoExpectedRpc();assert.equal(db.connections.length,0);
});

test('journal conserva IMPUTATION_LIMIT nativo y responde JOURNAL_LIMIT seguro',async()=>{
  const fixture=await ownerAdoptionFixture(),context=JSON.stringify(employeeContext(fixture.access.principal,fixture.session));let emissions=0;
  const db=bindOwnFullCapacity190({qa:{schema:'mc_qa_fixed_092_'+'e'.repeat(32)},json(){assert.fail('wrong source selector or arguments');},expectRollback(statements,code){emissions++;assert.equal(code,'IMPUTATION_LIMIT');return{status:3,stderr:'ERROR: IMPUTATION_LIMIT\nCONTEXT: PRIVATE_SYNTHETIC\n'};}});
  await db.expectQueryError({caseId:'journal-legacy-source',nativeCode:'IMPUTATION_LIMIT',text:'SELECT public.own_journal_source_v1($1::jsonb,$2::text,$3::uuid) AS result',values:[context,'imputation',id]},()=>assert.rejects(
    journalOperation(db,fixture.access.principal,fixture.session,'source',{basis:'imputation',id},{fullJson:false}),
    error=>error.code==='JOURNAL_LIMIT'&&error.status===422&&!error.message.includes('PRIVATE_SYNTHETIC')));
  assert.equal(emissions,1);db.assertNoExpectedRpc();
});

test('un fallo de captura con token nativo no acredita el rechazo aunque el servicio lo traduzca',async()=>{
  const fixture=await ownerAdoptionFixture(),context=JSON.stringify(employeeContext(fixture.access.principal,fixture.session));
  const failure=Error('capture persistence failed after ERROR: OWN_LIQ_LIMIT');
  const db=bindOwnFullCapacity190({qa:{schema:'mc_qa_fixed_092_'+'f'.repeat(32)},json(){assert.fail('ordinary emission');},expectRollback(){throw failure;}});
  await assert.rejects(db.expectQueryError({...spec,values:[context,id]},()=>assert.rejects(
    ownLiquidationOperation(db,fixture.access.principal,fixture.session,'detail',{id},{fullJson:false}),
    error=>error.code==='OWN_LIQ_LIMIT'&&error.status===422)),/NOT_VALIDATED/);
  db.assertNoExpectedRpc();
});

test('completado ajeno, duplicado o inválido atrapado también invalida el scope exterior',async()=>{
  for(const mode of ['foreign','duplicate','invalid']){
    const n=createOwn190NativeErrorExpectations();let expected;
    await assert.rejects(n.expectQueryError({...spec,caseId:'completion-'+mode},async()=>{
      expected=n.consumeQuery({text,values:spec.values});
      if(mode==='duplicate')complete(n,expected);
      if(mode==='invalid')assert.throws(()=>n.completeExpectedError(expected,{status:0,stderr:'ERROR: OWN_LIQ_LIMIT'}),/RESULT/);
      else assert.throws(()=>complete(n,mode==='foreign'?{...expected}:expected),/RESULT_SCOPE/);
      if(mode!=='duplicate')complete(n,expected);
    }),/EXTRA_INVOCATION/);
    n.assertIdle();assert.throws(()=>complete(n,expected),/RESULT_SCOPE/);
  }
});
