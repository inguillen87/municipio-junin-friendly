import test from 'node:test';
import assert from 'node:assert/strict';
import {salaryEffectivePercentagePlan as plan,salaryPercentageComparisonCsv as csv} from '../assets/native-salary-percentage-model.js';
import {salaryItems,salaryRowKey,salarySerialized} from '../assets/native-salary-catalog-model.js';
import {row} from './fixtures/native-salary-synthetic.js';

const scale=(patch={})=>row({kind:'scale',categoryCode:'6',nature:null,unit:'money',precision:3,value:'100.010',validFrom:'2026-09',validUntil:'2026-09',...patch});
const selections=rows=>rows.map(before=>({key:salaryRowKey(before),before:structuredClone(before)}));
const declaration=(patch={})=>({sourceMonth:'2026-09',percentage:'2',precision:5,ruleReference:'Documento de aumento sintético QA, no municipal',validUntil:'2026-10',...patch});
const target=(result,before)=>result.items.find(r=>r.kind===before.kind&&r.agreementCode===before.agreementCode&&r.categoryCode===before.categoryCode&&r.code===before.code&&r.validFrom==='2026-10');

test('prepara octubre desde septiembre finalizado sin prolongar o reinterpretar la fila anterior',()=>{
 const before=scale(),input=salaryItems([before]),serialized=salarySerialized(input);
 const result=plan(input,selections(input),declaration(),'2026-10');
 assert.equal(salarySerialized(input),serialized);
 assert.deepEqual(result.items.find(r=>salaryRowKey(r)===salaryRowKey(before)),before);
 assert.deepEqual(target(result,before),{...before,value:'102.01020',precision:5,validFrom:'2026-10',validUntil:'2026-10',ruleReference:declaration().ruleReference});
 assert.equal(result.preparationMode,'closed_period');assert.equal(result.changes.length,1);assert.equal(result.newDefinitionsCount,1);assert.equal(result.relatedDefinitionsCount,0);
 assert.equal(result.scaleComparisons[0].increment,'2.00020');
});

test('conserva íntegros auxiliares, nulos, conceptos y sus referencias de septiembre',()=>{
 const source=scale(),aux=row({kind:'auxiliary',nature:'auxiliary',code:'90',unit:'money',value:null,validFrom:'2026-09',validUntil:'2026-09',dependencies:[salaryRowKey(source)]}),concept=row({code:'95',validFrom:'2026-09',validUntil:'2026-09',dependencies:[salaryRowKey(aux)]});
 const input=salaryItems([source,aux,concept]),result=plan(input,selections([source]),declaration(),'2026-10');
 for(const original of input)assert.deepEqual(result.items.find(r=>salaryRowKey(r)===salaryRowKey(original)),original);
 assert.equal(result.items.length,4);assert.equal(result.items.filter(r=>r.validFrom==='2026-10'&&r.kind!=='scale').length,0);
});

test('75 escalas de tres convenios mantienen todas las filas originales y agregan75 nuevas',()=>{
 const input=salaryItems(['1','4','6'].flatMap(agreementCode=>Array.from({length:25},(_,n)=>scale({agreementCode,categoryCode:String(n+1),value:`${100+n}.010`}))));
 const result=plan(input,selections(input),declaration(),'2026-10');
 assert.equal(result.items.length,150);assert.equal(result.selectedCount,75);assert.equal(result.scaleComparisons.length,75);assert.equal(result.changes.length,75);
 for(const original of input)assert.deepEqual(result.items.find(r=>salaryRowKey(r)===salaryRowKey(original)),original);
});

test('CSV incluye todas las nuevas vigencias con la base finalizada y el fin declarado',()=>{
 const input=salaryItems(Array.from({length:25},(_,n)=>scale({categoryCode:String(n+1),label:'Descripción privada sintética no exportable'}))),selected=selections(input),review=plan(input,selected,declaration(),'2026-10'),report=csv(input,selected,declaration(),'2026-10',review);
 assert.equal(report.rows,25);assert.equal(report.selectedScales,25);assert.equal(report.text.trimEnd().split('\r\n').length,26);
 assert.ok(report.text.includes('"\'2026-09"'));assert.ok(report.text.includes('"\'2026-10"'));assert.ok(report.text.includes('"\'2.00020"'));
 assert.ok(!report.text.includes('cierre_vigencia'));assert.ok(!report.text.includes('Descripción privada'));assert.ok(!report.text.includes(declaration().ruleReference));
});

test('fin no declarado, nulo, inválido o anterior al inicio rechaza el conjunto completo',()=>{
 const input=[scale()],before=salarySerialized(input);
 for(const validUntil of [undefined,null,'','2026-13','2026-09','2026-10\n'])assert.throws(()=>plan(input,selections(input),declaration({validUntil}),'2026-10'));
 assert.equal(salarySerialized(input),before);
});

test('el modo nuevo requiere origen finalizado; el modo anterior sigue rechazando septiembre cerrado',()=>{
 const closed=scale(),legacy=declaration();delete legacy.validUntil;
 assert.throws(()=>plan([closed],selections([closed]),legacy,'2026-10'));
 for(const validUntil of [null,'2026-10','2027-01']){const source=scale({validUntil});assert.throws(()=>plan([source],selections([source]),declaration(),'2026-10'));}
});

test('no sobrescribe una vigencia futura ni recorta una superposición',()=>{
 const source=scale(),future=scale({validFrom:'2026-11',validUntil:'2026-12',value:'200.000'}),input=salaryItems([source,future]),serialized=salarySerialized(input);
 assert.throws(()=>plan(input,selections([source]),declaration({validUntil:'2026-11'}),'2026-10'),/superpuestas/);
 const result=plan(input,selections([source]),declaration(),'2026-10');assert.deepEqual(result.items.find(r=>salaryRowKey(r)===salaryRowKey(future)),future);assert.equal(salarySerialized(input),serialized);
 const existing=scale({validFrom:'2026-10',validUntil:'2026-10'});assert.throws(()=>plan([source,existing],selections([source]),declaration(),'2026-10'));
});

test('una escala con dependencias se rechaza: el período nuevo no convierte valores en fórmulas',()=>{
 const source=scale(),invalid=scale({categoryCode:'7',dependencies:[salaryRowKey(source)]}),input=[source,invalid],before=salarySerialized(input);
 assert.throws(()=>plan(input,selections([invalid]),declaration(),'2026-10'),/Una escala registra un valor; no evalúa dependencias/);
 assert.equal(salarySerialized(input),before);
});

test('precisión insuficiente y selección alterada conservan todo el maestro',()=>{
 const input=[scale(),scale({categoryCode:'7',value:'123.451'})],selected=selections(input),before=salarySerialized(input);
 assert.throws(()=>plan(input,selected,declaration({precision:2}),'2026-10'),e=>e.code==='PERCENTAGE_PRECISION_REQUIRED');
 assert.throws(()=>plan([{...input[0],value:'101.010'},input[1]],selected,declaration(),'2026-10'),/Cambió/);
 assert.equal(salarySerialized(input),before);
});

test('cero y cifras mayores que2^53 se conservan sin Number ni redondeo',()=>{
 for(const source of [scale({value:'0.000'}),scale({value:'9007199254740993.123'})]){
  const result=plan([source],selections([source]),declaration({percentage:'100',precision:3}),'2026-10');
  assert.equal(target(result,source).value,source.value==='0.000'?'0.000':'18014398509481986.246');
 }
});

test('cambiar la fecha final o la comparación invalida la descarga completa',()=>{
 const input=[scale()],selected=selections(input),review=plan(input,selected,declaration(),'2026-10');
 assert.throws(()=>csv(input,selected,declaration({validUntil:'2026-11'}),'2026-10',review),/Cambió/);
 assert.throws(()=>csv(input,selected,declaration(),'2026-10',{...review,validUntil:'2026-11'}),/Cambió/);
});

test('el límite incluye todas las definiciones anteriores y nuevas, sin dividir el período',()=>{
 const input=Array.from({length:5001},(_,n)=>scale({categoryCode:String(n+1)}));
 assert.throws(()=>plan(input,selections(input),declaration(),'2026-10'),/10002/);
});
