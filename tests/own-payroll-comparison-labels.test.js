// Proposed source only. Existing fixtures import preparers/normalizers/engine;
// this is not an admitted standalone PURE entry and has not been executed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {comparisonSources,resealComparison} from './fixtures/own-payroll-comparison-synthetic.js';
import {ownComparison,verifiedOwnComparison,ownComparisonView,ownComparisonDocument,ownComparisonUnitLabel,ownComparisonDefinition} from '../assets/own-payroll-comparison-model.js';

test('comparison labels admit exactly the seven numeric units and preserve the distinction between concept nature and total metric',()=>{
 for(const [unit,label]of [['money','Pesos'],['hours','Horas'],['minutes','Minutos'],['days','Días'],['percent','Porcentaje'],['units','Unidades'],['coefficient','Coeficiente']])assert.equal(ownComparisonUnitLabel(unit),label);
 for(const unit of ['ratio','code','boolean','toString',null,undefined,{}])assert.throws(()=>ownComparisonUnitLabel(unit),/unidad sin verificar/);
 assert.equal(ownComparisonDefinition({nature:'deduction',unit:'money'}),'Retención / Pesos');
 assert.equal(ownComparisonDefinition({nature:'deduction',unit:'money'},'totals'),'Retenciones / Pesos');
 assert.equal(ownComparisonDefinition({nature:'employer_contribution',unit:'money'}),'Aporte patronal / Pesos');
 assert.equal(ownComparisonDefinition({nature:'employer_contribution',unit:'money'},'totals'),'Aportes patronales / Pesos');
 assert.equal(ownComparisonDefinition({nature:'auxiliary',unit:'days'}),'Auxiliar / Días');
 assert.equal(ownComparisonDefinition(null),'No figura');
 for(const row of [{nature:'gross',unit:'money'},{nature:'toString',unit:'money'},0])assert.throws(()=>ownComparisonDefinition(row),/naturaleza sin verificar/);
 assert.throws(()=>ownComparisonDefinition({nature:'auxiliary',unit:'days'},'legacy'),/Elegí conceptos o totales/);
});

test('documents label all four original total metrics while preserving their exact before/after values',()=>{
 const {base,target}=comparisonSources(1),before=structuredClone({base,target}),model=ownComparison(base,target);
 const concepts=ownComparisonDocument(model),totals=ownComparisonDocument(model,'totals');
 assert.equal(concepts.rows.find(row=>row[2]==='120')[3],'No remunerativo / Pesos a No remunerativo / Pesos');
 for(const [metric,label]of [['gross','Bruto'],['deduction','Retenciones'],['net','Neto calculado'],['employer_contribution','Aportes patronales']]){
  const row=totals.rows.find(value=>value[2]===label);assert.ok(row);
  assert.equal(row[3],label+' / Pesos a '+label+' / Pesos');
  assert.equal(row[4],base.saved.result.employeeTotals[0][metric]);
  assert.equal(row[5],target.saved.result.employeeTotals[0][metric]);
 }
 assert.deepEqual({base,target},before);
});

test('zero values remain numeric observations while a missing concept keeps its explicit absence and unevaluable difference',()=>{
 const zero=comparisonSources(1);
 for(const capture of [zero.base,zero.target]){capture.saved.result.rows.find(row=>row.conceptCode==='120').amount=capture===zero.base?'0.00':'0.25';resealComparison(capture);}
 const present=ownComparisonDocument(ownComparison(zero.base,zero.target)).rows.find(row=>row[2]==='120');
 assert.equal(present[4],'0.00');assert.equal(present[5],'0.25');assert.equal(present[6],'0.25');
 const absent=comparisonSources(1);absent.base.saved.result.rows.find(row=>row.conceptCode==='120').amount='0.00';
 absent.target.saved.input.rules=absent.target.saved.input.rules.filter(rule=>rule.code!=='120');
 absent.target.saved.result.rows=absent.target.saved.result.rows.filter(row=>row.conceptCode!=='120');absent.target.saved.result.rowCount--;
 resealComparison(absent.base);resealComparison(absent.target);
 const missing=ownComparisonDocument(ownComparison(absent.base,absent.target)).rows.find(row=>row[2]==='120');
 assert.equal(missing[3],'No remunerativo / Pesos a No figura');assert.equal(missing[4],'0.00');assert.equal(missing[5],'No figura');assert.equal(missing[6],'No evaluable');
});

test('display filtering and pagination cannot reduce either complete document view or its source metadata',()=>{
 const {base,target}=comparisonSources(5),model=ownComparison(base,target),before=structuredClone({base,target});
 assert.equal(ownComparisonView(model,{search:'búsqueda sin coincidencias'}).rows.length,0);
 assert.equal(ownComparisonView(model,{page:2,pageSize:25}).rows.length,5);
 const concepts=ownComparisonDocument(model),totals=ownComparisonDocument(model,'totals');
 assert.equal(concepts.rows.length,30);assert.equal(totals.rows.length,20);
 for(const document of [concepts,totals]){
  assert.ok(document.metadata.some(row=>row[0]==='Captura base SHA-256'&&row[1]===base.payloadSha256));
  assert.ok(document.metadata.some(row=>row[0]==='Resultado comparada SHA-256'&&row[1]===target.saved.resultSha256));
 }
 assert.deepEqual({base,target},before);
});

test('presentation helpers do not replace the original captured-result integrity boundary',async()=>{
 const {base,target}=comparisonSources(1);await verifiedOwnComparison(base,target);
 // A verified comparison freezes its conserved row references. Tamper with a
 // detached copy so the integrity verifier, rather than assignment, rejects it.
 assert.equal(Object.isFrozen(target.saved.result.rows[0]),true);
 const changed=structuredClone(target);changed.saved.result.rows[0].amount='0.25';
 await assert.rejects(verifiedOwnComparison(base,changed),/integridad/);
});
