// PROPOSED by Claude (R3; source only; not run by Claude). Target: tests/own-payroll-zero-difference-connection.test.js
// Causal tests of the two REAL connection points proposed in SOURCE_DELTA.json: (1) the engine keeps the location of an
// early ROUNDING_NEEDED refusal (concept/total, agreement, stage) with the same code and no identity; (2) the run panel
// derives the reconciliation lines synchronously from the capture it has just verified. They pass only once root
// applies both public operations; the pure helper tests do not depend on them.
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {calculateOwnPayroll} from '../assets/own-payroll-engine.js';
import {createOwnPayrollSnapshot} from '../lib/own-payroll-snapshot.js';
import {OwnPayrollError} from '../assets/own-payroll-exact.js';
import {payrollInput,rule,lit,binary,ref,policy} from './fixtures/own-payroll-synthetic.js';

const exact=(code,expression,precision,patch={})=>rule(code,expression,{rounding:policy('exact',precision),...patch});
const third=binary('multiply',binary('divide',lit('1'),lit('3')),lit('10','money'));

test('motor: un concepto no representable en modo exacto conserva código, mensaje original y ubicación (concepto, convenio, etapa) sin identidad',()=>{
 const input=payrollInput({rules:[exact('100',lit('10','money'),2),exact('110',third,2)]});
 let error;try{calculateOwnPayroll(input);}catch(e){error=e;}
 assert.ok(error instanceof OwnPayrollError);assert.equal(error.code,'ROUNDING_NEEDED');
 assert.ok(error.message.startsWith('El resultado requiere un redondeo que la regla no autoriza.'));
 assert.ok(error.message.endsWith(' Ubicación: concepto 110 del convenio 1, al calcular el concepto.'));
 assert.deepEqual(error.context,{stage:'concept',conceptCode:'110',agreementCode:'1'});assert.ok(Object.isFrozen(error.context));
 for(const leak of ['1001','1002','10000000-0000-4000-8000'])assert.ok(!error.message.includes(leak)&&!JSON.stringify(error.context).includes(leak),'no contract or legajo in the early error: '+leak);
 assert.throws(()=>createOwnPayrollSnapshot(input),e=>e.code==='ROUNDING_NEEDED'&&e.context?.conceptCode==='110');
});

test('motor: la ubicación es la del concepto que falló aunque lo consuma otro concepto; un total no representable señala total, clave y convenio',()=>{
 // Codes are evaluated in sorted order: 200 (a deduction) is computed first and pulls 300 (the failing concept).
 const nested=payrollInput({rules:[exact('200',binary('multiply',ref('300'),lit('0.5')),2,{nature:'deduction'}),exact('300',third,2)]});
 assert.throws(()=>calculateOwnPayroll(nested),e=>e.code==='ROUNDING_NEEDED'&&e.context.stage==='concept'&&e.context.conceptCode==='300'&&e.message.includes('concepto 300'));
 const totals=payrollInput({rules:[exact('100',lit('0.005','money'),3),exact('120',lit('0.005','money'),3,{nature:'non_remuneration'})]});
 let error;try{calculateOwnPayroll(totals);}catch(e){error=e;}
 assert.equal(error.code,'ROUNDING_NEEDED');assert.deepEqual(error.context,{stage:'contract_total',key:'remuneration',agreementCode:'1'});
 assert.ok(error.message.endsWith(' Ubicación: total remuneration del convenio 1, en la precisión de totales.'));
 // Unchanged behaviour: representable results calculate exactly as before; other codes are not relabelled.
 assert.equal(calculateOwnPayroll(payrollInput()).employeeTotals[0].net,'128.63');
 const missing=payrollInput();missing.employees[1].inputs[1].value=null;
 assert.throws(()=>calculateOwnPayroll(missing),e=>e.code==='INPUT_MISSING'&&e.context===undefined);
});

test('espacio de corrida: la conciliación se deriva en showCapture, de forma síncrona, de la captura ya verificada',()=>{
 const source=readFileSync(new URL('../assets/own-payroll-run-panel.js',import.meta.url),'utf8');
 assert.ok(source.includes("import {ownZeroDifferenceOfVerified,ownZeroDifferenceLines} from './own-payroll-zero-difference.js';"));
 const connection="const zero=ownZeroDifferenceOfVerified({input,result,inputSha256:value.saved.inputSha256,resultSha256:value.saved.resultSha256});";
 assert.equal(source.split(connection).length,2,'exactly one connection, inside showCapture');
 const show=source.slice(source.indexOf('function showCapture(value){'),source.indexOf('async function refresh('));
 assert.ok(show.includes(connection)&&show.includes("$('trace').append(node('dt','Conciliación de la captura'));")&&show.includes('dd.dataset.zeroDifference=zero.state'));
 assert.ok(!show.includes('await '),'showCapture stays synchronous: no await, so valid() sequencing is untouched');
 assert.ok(show.indexOf('ownRunWorkspaceResult(value)')<show.indexOf(connection),'derived only after the structure validation');
 assert.ok(!source.includes('zeroDifference:'),'no DTO field is added to the capture or the saved result');
});
