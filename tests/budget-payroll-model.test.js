import test from 'node:test';import assert from 'node:assert/strict';
import {parseBudgetStructure} from '../assets/budget-structure-model.js';
import {compareBudgetPopulation,budgetComparisonDocument,budgetComparisonDetailDocument} from '../assets/budget-payroll-model.js';
import {syntheticStructurePages} from '../scripts/budget-structure-synthetic.mjs';
const tenant='22222222-2222-4222-8222-222222222222',dataset='11111111-1111-4111-8111-111111111111';
const structure=()=>parseBudgetStructure(syntheticStructurePages(),{sha256:'a'.repeat(64)});
const roster=(numbers=['0001','0029','0031','0999'])=>({version:'budget-payroll-roster.v1',tenantId:tenant,datasetId:dataset,date:'2026-08-31',type:'M',total:numbers.length,sourceLabel:'Conjunto sintético',closureStatus:'closed',payloadHash:'b'.repeat(64),reportHash:'c'.repeat(64),official:false,rows:numbers.map(number=>({number}))});
test('módulo 10 conserva ocupantes del PDF y sólo usa nómina como presencia por legajo',()=>{
 const model=compareBudgetPopulation(structure(),roster());
 assert.deepEqual(model.counts,{present:3,document_only:32,payroll_only:1,ambiguous:0});
 assert.equal(model.groups[0].members.length,30);assert.deepEqual(model.groups[0].members[0],{number:'0001',name:'PERSONA QA 001',sourcePage:1,state:'present',payrollNumber:'0001',formatChanged:false});
 assert.deepEqual(model.payrollOnly,[{number:'0999',key:'0999'}]);assert.equal(model.positionAssignmentVerified,false);assert.equal(model.official,false);
});
test('detalle completo incluye ocupantes nominales del PDF y legajos sólo en nómina sin inventar nombres',()=>{
 const detail=budgetComparisonDetailDocument(compareBudgetPopulation(structure(),roster()));
 assert.equal(detail.rows.length,36);assert.ok(detail.rows.some(r=>r[3]==='0001'&&r[4]==='PERSONA QA 001'&&r[5]==='En documento y corrida'));
 const only=detail.rows.find(r=>r[3]==='0999');assert.deepEqual(only.slice(0,6),['—','Sin estructura en el PDF','—','0999','No provisto por este cotejo','Sólo en corrida']);
 assert.doesNotMatch(detail.columns.map(c=>c.label).join(' '),/DNI|CUIL|Concepto 993|Concepto 995|Importe/i);
});
test('modo diferencias y búsqueda filtran el detalle sin modificar el modelo',()=>{
 const model=compareBudgetPopulation(structure(),roster()),before=JSON.stringify(model);
 const differences=budgetComparisonDetailDocument(model,{differencesOnly:true});assert.equal(differences.rows.length,33);assert.ok(differences.rows.every(r=>r[5]!=='En documento y corrida'));
 assert.equal(budgetComparisonDetailDocument(model,{query:'persona qa 001'}).rows.length,1);
 assert.equal(budgetComparisonDetailDocument(model,{query:'AREA SINTETICA PRINCIPAL'}).rows.length,30);
 assert.equal(budgetComparisonDetailDocument(model,{query:'0999'}).rows.length,1);
 assert.equal(JSON.stringify(model),before);
});
test('comparación numérica conserva textos originales y marca diferencias de formato',()=>{
 const model=compareBudgetPopulation(structure(),roster(['1','29','31','999']),{keyMode:'numeric'});
 assert.deepEqual(model.counts,{present:3,document_only:32,payroll_only:1,ambiguous:0});
 const first=model.groups[0].members[0];assert.equal(first.number,'0001');assert.equal(first.payrollNumber,'1');assert.equal(first.formatChanged,true);
});
test('resumen sigue separado del detalle nominal y declara la limitación del cargo',()=>{
 const model=compareBudgetPopulation(structure(),roster()),summary=budgetComparisonDocument(model),detail=budgetComparisonDetailDocument(model);
 assert.equal(summary.rows.length,7);assert.equal(detail.rows.length,36);
 assert.match(summary.notes.join(' '),/no informa un código de cargo/i);assert.match(detail.notes.join(' '),/no prueba que la liquidación haya utilizado ese cargo/i);
});
for(const bad of [{query:'x'.repeat(121)},{differencesOnly:'yes'}])test('detalle rechaza filtro inválido '+JSON.stringify(bad),()=>assert.throws(()=>budgetComparisonDetailDocument(compareBudgetPopulation(structure(),roster()),bad)));
