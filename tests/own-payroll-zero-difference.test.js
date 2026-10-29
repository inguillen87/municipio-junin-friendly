// PROPOSED by Claude (R3; source only; not run by Claude). Target: tests/own-payroll-zero-difference.test.js
// Causal tests of the pure zero-differences check over synthetic captures produced by the real engine and snapshot
// (lib/own-payroll-snapshot.js), so every pin is a genuine SHA-256 of the canonical capture. Nothing municipal.
import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {createOwnPayrollSnapshot} from '../lib/own-payroll-snapshot.js';
import {verifyOwnZeroDifferenceSync} from '../lib/own-payroll-zero-difference.js';
import {beginOwnZeroDifferenceCheck,ownZeroDifferenceCheck,ownZeroDifferenceOfVerified,ownZeroDifferenceInstrument,ownZeroDifferenceLines,ownZeroDifferenceMoney,OWN_ZERO_DIFFERENCE_VERSION,OWN_ZERO_DIFFERENCE_TOTAL_LABELS} from '../assets/own-payroll-zero-difference.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {bankOutputCents} from '../assets/own-bank-output-model.js';
import {decimal,exactAdd,exactCompare,rational} from '../assets/own-payroll-exact.js';
import {payrollInput,employee,payrollId,rule,lit,policy} from './fixtures/own-payroll-synthetic.js';

const sha=v=>createHash('sha256').update(salarySerialized(v),'utf8').digest('hex');
const capture=patch=>{const s=createOwnPayrollSnapshot(payrollInput(patch));return{input:s.input,result:s.result,pins:{inputSha256:s.inputSha256,resultSha256:s.resultSha256}};};
// A capture "saved" with mutated content: the pins are recomputed, so the check judges the content, not the pins.
const resaved=(c,mutate)=>{const m={input:structuredClone(c.input),result:structuredClone(c.result)};mutate(m);return{...m,pins:{inputSha256:sha(m.input),resultSha256:sha(m.result)}};};
const check=c=>verifyOwnZeroDifferenceSync(c);
const bank={name:'banco (regla vigente)',consumes:'net',representable:v=>bankOutputCents(v)!==null};
const exact=(code,value,precision,patch={})=>rule(code,lit(value,'money'),{rounding:policy('exact',precision),...patch});
const KEYS=['remuneration','non_remuneration','deduction','employer_contribution','gross','net'];
const sum=values=>values.reduce((t,v)=>exactAdd(t,decimal(v)),rational(0n));

test('captura íntegra del motor: Conciliado, pins verificados, agregado y grupos derivados de las mismas filas, sin instrumento supuesto',async()=>{
 const c=capture(),r=check(c);
 assert.equal(r.version,OWN_ZERO_DIFFERENCE_VERSION);assert.equal(r.state,'reconciled');assert.equal(r.label,'Conciliado');assert.deepEqual(r.findings,[]);assert.deepEqual(r.contracts,[]);
 assert.deepEqual(r.pins,{inputSha256:c.pins.inputSha256,resultSha256:c.pins.resultSha256,verifiedBy:'generator'});
 assert.deepEqual(r.scope,{kind:'all',values:[],savedScope:'all',populationCertified:false});
 assert.deepEqual(r.coverage,{complete:true,contracts:{expected:2,present:2,incomplete:0},rows:{expected:12,present:12}});
 assert.deepEqual(r.arithmetic,{contractsCompared:2,differences:0});assert.deepEqual(r.aggregate.saved,r.aggregate.computed);
 for(const key of KEYS){
  assert.equal(exactCompare(decimal(r.aggregate.saved[key]),sum(c.result.employeeTotals.map(t=>t[key]))),0,key);
  for(const dimension of ['agreement','department'])assert.equal(exactCompare(sum(r.groups[dimension].map(g=>g.totals[key])),decimal(r.aggregate.computed[key])),0,dimension+':'+key);
 }
 assert.deepEqual(r.groups.agreement.map(g=>[g.code,g.contracts,g.complete]),[['1',2,true]]);assert.deepEqual(r.groups.department.map(g=>[g.code,g.contracts,g.complete]),[['1',1,true],['2',1,true]]);
 assert.deepEqual(r.lineScale,{finerThanTotals:0,rules:[],rulesOmitted:0,policyInfringed:false,note:r.lineScale.note});assert.equal(r.instrument,null);
 assert.deepEqual(r.precision,{totals:2});assert.equal(r.counts.rows,12);assert.equal(r.payrollPosted,false);assert.equal(r.paymentExecuted,false);assert.ok(Object.isFrozen(r)&&Object.isFrozen(r.aggregate));
 assert.equal(r.closeAptitude.claimed,false);assert.ok(r.closeAptitude.guard.includes('ownCloseSavedTotals'));
 assert.deepEqual(await ownZeroDifferenceCheck(c),r);
 const verified=ownZeroDifferenceOfVerified({input:c.input,result:c.result,inputSha256:c.pins.inputSha256,resultSha256:c.pins.resultSha256});
 assert.deepEqual({...verified,pins:null},{...r,pins:null});assert.equal(verified.pins.verifiedBy,'caller');
 const lines=ownZeroDifferenceLines(r);assert.equal(lines[0],'Conciliado · 2 legajos, 12 conceptos · captura completa del alcance guardado: todos · hash verificado');
 assert.ok(lines.some(l=>l.startsWith('Compatibilidad con el instrumento de pago: se comprueba en la emisión bancaria')));assert.ok(lines.at(-1).includes('no certifica el padrón municipal'));
 assert.ok(!JSON.stringify(r).includes('"1001"')&&!JSON.stringify(r).includes('"1002"'),'no legajo numbers without findings');
 assert.ok(lines.every(l=>!/[0-9a-f]{8}-[0-9a-f]{4}/.test(l)&&!/\b(remuneration|non_remuneration|deduction|employer_contribution|gross|net)\b/.test(l)),'no UUIDs or keys reach the operator');
});

test('0.005 + 0.005: concilia (0.01), se conserva con su escala y el banco representa el neto; la escala es observación, no infracción',()=>{
 const c=capture({rules:[exact('100','0.005',3),exact('110','0.005',3)]});
 assert.equal(c.result.employeeTotals[0].remuneration,'0.01');assert.deepEqual(c.result.rows.map(r=>r.amount),['0.005','0.005','0.005','0.005']);
 const r=check({...c,instrument:bank});
 assert.equal(r.state,'reconciled');assert.deepEqual(r.findings,[]);assert.deepEqual(r.aggregate.computed.net,'0.02');
 assert.equal(r.lineScale.finerThanTotals,4);assert.equal(r.lineScale.policyInfringed,false);
 assert.deepEqual(r.lineScale.rules,[{conceptCode:'100',agreementCode:'1',nature:'remuneration',declaredPrecision:3,totalsPrecision:2},{conceptCode:'110',agreementCode:'1',nature:'remuneration',declaredPrecision:3,totalsPrecision:2}]);
 assert.deepEqual(r.instrument,{name:bank.name,consumes:'net',contractsChecked:2,incompatible:[],incompatibleEmployeeNumbers:[],compatible:true});
 const lines=ownZeroDifferenceLines(r);assert.ok(lines[0].startsWith('Conciliado'));
 assert.ok(lines.some(l=>l==='Observación: 4 líneas de dinero con escala mayor que la precisión de totales (2); se conservan e imprimen tal cual, no se redondean.'));
 assert.ok(lines.some(l=>l.includes('el neto de cada legajo es representable')));
 // Peer P2: 52 distinct finer rules × 2 people = 104 lines; 50 listed rules and exactly 2 distinct omitted rules (not 4 occurrences).
 const many=capture({rules:Array.from({length:52},(_,i)=>exact(String(100+i),'0.005',3))}),m=check(many);
 assert.equal(many.result.employeeTotals[0].remuneration,'0.26');assert.equal(m.state,'reconciled');
 assert.equal(m.lineScale.finerThanTotals,104);assert.equal(m.lineScale.rules.length,50);assert.equal(m.lineScale.rulesOmitted,2);
 assert.deepEqual(m.lineScale.rules.map(x=>x.conceptCode).slice(0,2),['100','101']);assert.equal(new Set(m.lineScale.rules.map(x=>x.conceptCode)).size,50);
});

test('contraejemplo del peer: 10.3333 − 0.3333 = 10.0000 concilia a 4 decimales y el banco representa el neto; sin instrumento no se supone centavos',()=>{
 const c=capture({totalsPrecision:4,rules:[exact('100','10.3333',4),exact('210','0.3333',4,{nature:'deduction'})]});
 assert.equal(c.result.employeeTotals[0].net,'10.0000');
 const plain=check(c);assert.equal(plain.state,'reconciled');assert.equal(plain.instrument,null);assert.equal(plain.lineScale.finerThanTotals,0,'4 decimals are the approved totals precision');
 const withBank=check({...c,instrument:bank});assert.equal(withBank.state,'reconciled');assert.deepEqual(withBank.instrument,{name:bank.name,consumes:'net',contractsChecked:2,incompatible:[],incompatibleEmployeeNumbers:[],compatible:true});
 // The same programme with a net the bank cannot carry: still reconciled arithmetically, instrument reports it, nothing is rounded.
 const odd=capture({totalsPrecision:4,rules:[exact('100','10.3333',4)]}),r=check({...odd,instrument:bank});
 assert.equal(r.state,'reconciled');assert.deepEqual(r.instrument,{name:bank.name,consumes:'net',contractsChecked:2,incompatible:[payrollId(1),payrollId(2)],incompatibleEmployeeNumbers:['1001','1002'],compatible:false});
 assert.ok(ownZeroDifferenceLines(r).some(l=>l.includes('neto no representable según su propia regla en 2 legajos (1001, 1002)')));
 assert.equal(ownZeroDifferenceInstrument(null),null);assert.equal(ownZeroDifferenceInstrument(undefined),null);
 for(const bad of [{precision:2},{name:'x',consumes:'gross',representable:()=>true},{name:'x',consumes:'net'},{name:'',consumes:'net',representable:()=>true},{...bank,extra:1},2])
  assert.throws(()=>ownZeroDifferenceInstrument(bad),e=>e.code==='OWN_ZERO_DIFFERENCE_INSTRUMENT_INVALID');
});

test('valores negativos exactos concilian con su signo; una línea negativa fina es observación de escala',()=>{
 const negative=check(capture({rules:[exact('100','-10.50',2),exact('110','5.25',2),exact('210','0.25',2,{nature:'deduction'})]}));
 assert.equal(negative.state,'reconciled');assert.equal(negative.aggregate.computed.net,'-11.00');assert.equal(negative.aggregate.computed.remuneration,'-10.50');
 const fine=check(capture({rules:[exact('100','-10.555',3),exact('110','10.555',3)]}));
 assert.equal(fine.state,'reconciled');assert.equal(fine.aggregate.computed.remuneration,'0.00');assert.equal(fine.lineScale.finerThanTotals,4);
});

test('sumas por persona, grupo y corrida; alcance guardado filtrado concilia su captura sin certificar el padrón',()=>{
 const employees=Array.from({length:6},(_,i)=>employee(i+1)),full=check(capture({employees}));
 assert.equal(full.state,'reconciled');assert.equal(full.coverage.contracts.expected,6);assert.deepEqual(full.groups.department.map(g=>[g.code,g.contracts]),[['1',3],['2',3]]);
 const filtered=check(capture({employees,selection:{kind:'departments',values:['1']}}));
 assert.equal(filtered.state,'reconciled');assert.deepEqual(filtered.scope,{kind:'departments',values:['1'],savedScope:'filtered',populationCertified:false});
 assert.deepEqual(filtered.coverage.contracts,{expected:3,present:3,incomplete:0});assert.deepEqual(filtered.groups.department.map(g=>[g.code,g.contracts]),[['1',3]]);
 assert.equal(ownZeroDifferenceLines(filtered)[0],'Conciliado · 3 legajos, 18 conceptos · captura completa del alcance guardado filtrado · hash verificado');
 // Only the test knows both runs: the helper never compares a filtered capture with another run.
 for(const key of ['gross','net'])assert.equal(filtered.aggregate.computed[key],full.groups.department.find(g=>g.code==='1').totals[key]);
});

test('ausencia no es cero ni diferencia: fila cero faltante, fila no cero faltante y auxiliar faltante dan Incompleto con derivados nulos',()=>{
 const base=capture();
 const drop=(contract,code)=>m=>{const i=m.result.rows.findIndex(r=>r.contractId===payrollId(contract)&&r.conceptCode===code);assert.ok(i>=0);m.result.rows.splice(i,1);m.result.rowCount=m.result.rows.length;};
 assert.equal(base.result.rows.find(r=>r.contractId===payrollId(2)&&r.conceptCode==='120').amount,'0.00');
 for(const [contract,code,label] of [[2,'120','zero amount row'],[1,'100','non-zero row'],[1,'900','auxiliary row']]){
  const r=check(resaved(base,drop(contract,code)));
  assert.equal(r.state,'incomplete',label);assert.equal(r.label,'Incompleto');
  assert.deepEqual(r.findings,[{severity:'incomplete',stage:'rule_result',contractId:payrollId(contract),employeeNumber:String(1000+contract),conceptCode:code,nature:base.result.rows.find(x=>x.conceptCode===code).nature,issue:'missing_amount'}],label);
  assert.deepEqual(r.contracts.map(x=>[x.contractId,x.state]),[[payrollId(contract),'incomplete']],label);
  assert.deepEqual(r.coverage,{complete:false,contracts:{expected:2,present:2,incomplete:1},rows:{expected:12,present:11}},label);
  assert.equal(r.aggregate,null,label);assert.equal(r.arithmetic.contractsCompared,1,label);assert.equal(r.arithmetic.differences,0,label);
  assert.deepEqual(r.groups.agreement.map(g=>[g.code,g.complete,g.totals]),[['1',false,null]],label);
  const other=contract===1?'2':'1';assert.ok(r.groups.department.find(g=>g.code===other).complete&&r.groups.department.find(g=>g.code===other).totals!==null,label);
  assert.ok(r.groups.department.find(g=>g.code!==other).totals===null,label);
  assert.deepEqual(r.counts,{rows:11,contracts:2,findings:1,contractsWithFindings:1},label);
  const lines=ownZeroDifferenceLines(r);assert.equal(lines[0],'Incompleto · 1 hallazgos · cobertura 1 de 2 legajos completos · alcance guardado: todos');
  assert.equal(lines[1],'Legajo '+(1000+contract)+' · concepto '+code+' ('+({'120':'No remunerativo','100':'Remunerativo','900':'Auxiliar'})[code]+'): importe ausente, no se supone cero.',label);
 }
 const missingContract=check(resaved(base,m=>{m.result.employeeTotals.splice(1,1);m.result.rows=m.result.rows.filter(r=>r.contractId!==payrollId(2));m.result.rowCount=m.result.rows.length;m.result.employeeCount=1;}));
 assert.equal(missingContract.state,'incomplete');assert.ok(missingContract.findings.some(f=>f.issue==='missing_contract'&&f.contractId===payrollId(2)&&f.employeeNumber==='1002'));assert.equal(missingContract.findings.filter(f=>f.issue==='missing_amount').length,6);
 assert.ok(ownZeroDifferenceLines(missingContract,20).includes('Legajo 1002: sin totales guardados; no se supone cero.'));
 assert.deepEqual(missingContract.coverage.contracts,{expected:2,present:1,incomplete:1});assert.equal(missingContract.aggregate,null);
 const partialOutput=check(resaved(base,m=>{m.result.rowCount=m.result.rows.length+1;}));
 assert.equal(partialOutput.state,'incomplete');assert.deepEqual(partialOutput.findings.map(f=>f.issue),['partial_output']);assert.equal(partialOutput.aggregate,null);
 assert.ok(partialOutput.groups.department.every(g=>g.totals===null&&g.complete===false));assert.equal(ownZeroDifferenceLines(partialOutput)[1],'Corrida: conteos declarados distintos de las filas guardadas (13 vs 12 conceptos, 2 vs 2 legajos); no se supone cero.');
});

test('lo que el validador aguas arriba rechaza no es captura válida: importe nulo (auxiliar incluido), total ausente o no decimal, legajo ajeno',()=>{
 const base=capture();
 assert.throws(()=>check(resaved(base,m=>{m.result.rows.find(r=>r.conceptCode==='900').amount=null;})),e=>e.code==='OWN_ZERO_DIFFERENCE_AMOUNT_INVALID');
 assert.throws(()=>check(resaved(base,m=>{m.result.rows[0].amount='1.5e1';})),e=>e.code==='OWN_ZERO_DIFFERENCE_AMOUNT_INVALID');
 assert.throws(()=>check(resaved(base,m=>{delete m.result.employeeTotals[0].net;})),e=>e.code==='OWN_ZERO_DIFFERENCE_TOTAL_INVALID');
 assert.throws(()=>check(resaved(base,m=>{m.result.employeeTotals[1].gross=null;})),e=>e.code==='OWN_ZERO_DIFFERENCE_TOTAL_INVALID');
 assert.throws(()=>check(resaved(base,m=>{m.result.employeeTotals.push({...m.result.employeeTotals[0],contractId:payrollId(9)});m.result.employeeCount=3;})),e=>e.code==='OWN_ZERO_DIFFERENCE_SCOPE');
});

test('captura o hash discrepante: cualquier byte distinto de los pins detiene la comprobación; la mutación posterior no la altera',()=>{
 const c=capture();
 for(const mutate of [m=>{m.result.rows[0].amount='100.11';},m=>{m.result.employeeTotals[0].net='0.00';},m=>{m.input.totalsPrecision=3;},m=>{m.input.rules[0].ruleReference='Otra referencia QA';}]){
  const m={input:structuredClone(c.input),result:structuredClone(c.result)};mutate(m);
  assert.throws(()=>check({...m,pins:c.pins}),e=>e.code==='OWN_ZERO_DIFFERENCE_CAPTURE_CHANGED');
 }
 for(const pins of [undefined,{},{inputSha256:c.pins.inputSha256},{...c.pins,resultSha256:'x'},{...c.pins,extra:1}])assert.throws(()=>check({...c,pins}),e=>e.code==='OWN_ZERO_DIFFERENCE_PINS_INVALID');
 assert.throws(()=>ownZeroDifferenceOfVerified({input:c.input,result:c.result,inputSha256:c.pins.inputSha256}),e=>e.code==='OWN_ZERO_DIFFERENCE_PINS_INVALID');
 const steps=beginOwnZeroDifferenceCheck(c),first=steps.next();
 assert.equal(first.value,salarySerialized(c.result));assert.throws(()=>steps.next('e'.repeat(64)),e=>e.code==='OWN_ZERO_DIFFERENCE_CAPTURE_CHANGED');
 const live={input:structuredClone(c.input),result:structuredClone(c.result),pins:c.pins},started=beginOwnZeroDifferenceCheck(live);
 live.result.employeeTotals[0].net='0.00';
 let current=started.next();while(!current.done)current=started.next(createHash('sha256').update(current.value,'utf8').digest('hex'));
 assert.equal(current.value.state,'reconciled','captured before the first yield');
});

test('regla o versión alterada en la captura guardada: redondeo, unidad, referencia, vigencia o versión distintos se rechazan',()=>{
 const base=capture();
 assert.throws(()=>check(resaved(base,m=>{m.result.rows[0].rounding={precision:3,mode:'half_up'};})),e=>e.code==='OWN_ZERO_DIFFERENCE_RULE_CHANGED');
 assert.throws(()=>check(resaved(base,m=>{m.result.rows[0].unit='hours';})),e=>e.code==='OWN_ZERO_DIFFERENCE_RULE_CHANGED');
 assert.throws(()=>check(resaved(base,m=>{m.result.rows[0].ruleReference='Otra regla QA';})),e=>e.code==='OWN_ZERO_DIFFERENCE_RULE_CHANGED');
 assert.throws(()=>check(resaved(base,m=>{m.input.rules.find(r=>r.code==='100').rounding={precision:2,mode:'half_even'};})),e=>e.code==='OWN_ZERO_DIFFERENCE_RULE_CHANGED');
 assert.throws(()=>check(resaved(base,m=>{m.input.rules.find(r=>r.code==='100').validUntil='2026-09';})),e=>e.code==='OWN_ZERO_DIFFERENCE_RULE_CHANGED');
 assert.throws(()=>check(resaved(base,m=>{m.result.version='own-payroll-result.v3';})),e=>e.code==='OWN_ZERO_DIFFERENCE_VERSION');
 assert.throws(()=>check(resaved(base,m=>{m.result.version='own-payroll-result.v2';})),e=>e.code==='OWN_ZERO_DIFFERENCE_VERSION');
 assert.throws(()=>check(resaved(base,m=>{m.result.period='2026-11';})),e=>e.code==='OWN_ZERO_DIFFERENCE_SCOPE');
 assert.throws(()=>check(resaved(base,m=>{m.result.selection={kind:'contracts',values:[payrollId(1)]};})),e=>e.code==='OWN_ZERO_DIFFERENCE_SCOPE');
 assert.throws(()=>check(resaved(base,m=>{m.result.rows.push({...m.result.rows[0]});m.result.rowCount++;})),e=>e.code==='OWN_ZERO_DIFFERENCE_SCOPE');
 assert.throws(()=>check(resaved(base,m=>{m.result.rows[0].employeeNumber='9999';})),e=>e.code==='OWN_ZERO_DIFFERENCE_SCOPE');
});

test('diferencia: un total guardado distinto de sus conceptos se localiza por legajo, clave e importe exactos; nunca se corrige',()=>{
 const base=capture(),r=check(resaved(base,m=>{m.result.employeeTotals[0].net='128.64';}));
 assert.equal(r.state,'difference');assert.equal(r.label,'Diferencia');assert.deepEqual(r.arithmetic,{contractsCompared:2,differences:1});
 assert.deepEqual(r.findings,[{severity:'difference',stage:'contract_total',contractId:payrollId(1),employeeNumber:'1001',key:'net',saved:'128.64',computed:'128.63',difference:'0.01'}]);
 assert.equal(r.aggregate.saved.net,'510.74');assert.equal(r.aggregate.computed.net,'510.73');assert.equal(r.aggregate.computed.net,check(base).aggregate.computed.net,'the recomputed side is untouched');
 assert.deepEqual(r.contracts,[{contractId:payrollId(1),employeeNumber:'1001',agreementCode:'1',departmentCode:'1',state:'difference'}]);
 const lines=ownZeroDifferenceLines(r);assert.equal(lines[0],'Diferencia · 1 hallazgos · cobertura 2 de 2 legajos completos · alcance guardado: todos');
 assert.equal(lines[1],'Legajo 1001 · Neto calculado: guardado $ 128,64 vs conceptos $ 128,63 (diferencia $ 0,01).');assert.ok(lines.at(-1).includes('Recalculá'));
 assert.deepEqual(OWN_ZERO_DIFFERENCE_TOTAL_LABELS,{remuneration:'Remunerativo',non_remuneration:'No remunerativo',deduction:'Retenciones',employer_contribution:'Aportes patronales',gross:'Bruto',net:'Neto calculado'});
 assert.equal(ownZeroDifferenceMoney('1234567.5'),'$ 1.234.567,5');assert.equal(ownZeroDifferenceMoney('-0.25'),'$ -0,25');assert.equal(ownZeroDifferenceMoney({numerator:'1',denominator:'3'}),'no representable');
 // Peer: 128.630 equals 128.63 arithmetically, but the close guard compares the literal at totalsPrecision; the helper
 // reports it as a difference (total_scale) and never claims close aptitude.
 const scale=check(resaved(base,m=>{m.result.employeeTotals[0].net='128.630';}));
 assert.equal(scale.state,'difference');assert.deepEqual(scale.findings,[{severity:'difference',stage:'contract_total',contractId:payrollId(1),employeeNumber:'1001',key:'net',issue:'total_scale',saved:'128.630',expected:'128.63',closeGuard:'own-payroll-close-model.js ownCloseSavedTotals'}]);
 assert.equal(scale.aggregate.saved.net,scale.aggregate.computed.net,'arithmetic aggregate still equal');assert.equal(scale.closeAptitude.claimed,false);
 assert.equal(ownZeroDifferenceLines(scale)[1],'Legajo 1001 · Neto calculado: el total guardado 128.630 no está escrito en la precisión aprobada de totales (2); el cierre existente lo rechaza. Esperado $ 128,63.');
 const many=check(resaved(base,m=>{for(const t of m.result.employeeTotals)for(const k of ['gross','net','remuneration'])t[k]='0.01';}));
 assert.equal(many.arithmetic.differences,6);assert.ok(ownZeroDifferenceLines(many,2).some(l=>l.startsWith('… y 4 hallazgos más')));
});
