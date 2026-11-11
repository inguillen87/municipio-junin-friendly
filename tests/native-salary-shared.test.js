import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {salarySharedGroups,salarySharedFirstMonth,salarySharedLastMonth,salarySharedPeriodPlan,salarySharedTitle,salarySharedSummary} from '../assets/native-salary-shared-model.js';
import {salaryEffectivePlan} from '../assets/native-salary-effective-model.js';
import {salaryBulkPlan} from '../assets/native-salary-bulk-model.js';
import {salaryItems,salaryRowKey,salarySerialized} from '../assets/native-salary-catalog-model.js';
import {row} from './fixtures/native-salary-synthetic.js';

// Fictitious codes and amounts only.
const scale=(agreementCode,categoryCode,value,patch={})=>row({kind:'scale',code:'1',agreementCode,categoryCode,nature:null,unit:'money',precision:2,value,label:'Escala sintética clase '+categoryCode,validFrom:'2026-09',...patch});
const parameter=(agreementCode,code,value,patch={})=>row({kind:'auxiliary',code,agreementCode,nature:'auxiliary',unit:'money',precision:2,value,label:'Valor sintético '+code,validFrom:'2026-09',...patch});
const monthly=month=>({validFrom:month,validUntil:month});
const selected=rows=>rows.map(before=>({key:salaryRowKey(before),before:structuredClone(before)}));
const change=(value='102.60')=>({unit:'money',precision:2,value,ruleReference:'Acta sintética de prueba, no norma municipal'});

test('agrupa lo que hoy vale lo mismo en varios convenios y deja afuera lo que no se repite',()=>{
 const items=salaryItems([scale('1','3','100.00'),scale('4','3','100.00'),scale('6','3','100.00'),scale('1','4','107.00'),parameter('1','196','255000.00'),parameter('4','196','255000.00'),parameter('1','88','1.00')]);
 const before=salarySerialized(items),groups=salarySharedGroups(items);
 assert.deepEqual(groups.map(g=>g.id),['auxiliary|196||money|2|255000.00','scale|1|3|money|2|100.00']);
 const [garantia,clase]=groups;
 assert.deepEqual(garantia.agreements,['1','4']);assert.equal(garantia.value,'255000.00');assert.equal(garantia.mode,'open');
 assert.deepEqual(clase.agreements,['1','4','6']);assert.equal(clase.rows.length,3);
 assert.equal(salarySharedTitle(clase),'Escala 1 · clase 3 · Escala sintética clase 3');
 assert.equal(salarySharedSummary(clase),'3 convenios (1, 4, 6) · hoy 100.00 · sin fecha de fin');
 assert.equal(salarySerialized(items),before,'agrupar no modifica el maestro');
});

test('un mismo código con otro valor en otro convenio es otro grupo: no decide cuál es el correcto',()=>{
 const groups=salarySharedGroups(salaryItems([parameter('1','196','255000.00'),parameter('4','196','255000.00'),parameter('8','196','25500.00'),scale('2','3','900.00'),scale('5','3','900.00'),scale('1','3','100.00'),scale('4','3','100.00')]));
 assert.deepEqual(groups.map(g=>[g.code,g.categoryCode,g.value,g.agreements]),[['196',null,'255000.00',['1','4']],['1','3','100.00',['1','4']],['1','3','900.00',['2','5']]]);
 assert.deepEqual(groups[0].others,[{value:'25500.00',agreements:['8']}]);
 assert.equal(salarySharedSummary(groups[0]),'2 convenios (1, 4) · hoy 255000.00 · sin fecha de fin · en otros convenios: 25500.00 (8)');
 assert.deepEqual(groups[1].others,[{value:'900.00',agreements:['2','5']}]);
});

test('«hoy» es la última vigencia de cada definición habilitada y con valor declarado',()=>{
 const september=[scale('1','3','90.00',monthly('2026-09')),scale('4','3','90.00',monthly('2026-09'))];
 const october=[scale('1','3','100.00',monthly('2026-10')),scale('4','3','100.00',monthly('2026-10'))];
 const unknown=[parameter('1','300',null),parameter('4','300',null)];
 const disabled=[parameter('1','301','5.00',{active:false}),parameter('4','301','5.00')];
 const groups=salarySharedGroups(salaryItems([...september,...october,...unknown,...disabled]));
 assert.deepEqual(groups.map(g=>g.id),['scale|1|3|money|2|100.00']);
 assert.deepEqual(groups[0].rows.map(salaryRowKey),october.map(salaryRowKey));
 assert.equal(groups[0].mode,'closed');assert.equal(groups[0].validUntil,'2026-10');assert.equal(groups[0].periodMonths,0);
 assert.equal(salarySharedSummary(groups[0]),'2 convenios (1, 4) · hoy 100.00 · vigente hasta 2026-10');
});

test('no mezcla unidades ni precisiones distintas bajo el mismo código',()=>{
 assert.deepEqual(salarySharedGroups(salaryItems([parameter('1','500','2.00'),parameter('4','500','2.000',{precision:3}),parameter('6','500','2.00',{unit:'percent'})])),[]);
 assert.equal(salarySharedGroups(salaryItems([parameter('1','500','2.00')]),{minAgreements:1}).length,1);
 assert.throws(()=>salarySharedGroups(salaryItems([parameter('1','500','2.00')]),{minAgreements:0}),TypeError);
});

test('vigencias que no terminan igual en todos los convenios quedan marcadas y no se eligen de una vez',()=>{
 const [group]=salarySharedGroups(salaryItems([scale('1','3','100.00',monthly('2026-10')),scale('4','3','100.00',{validFrom:'2026-10',validUntil:null})]));
 assert.equal(group.mode,'mixed');assert.equal(group.validUntil,null);
 assert.match(salarySharedSummary(group),/con vigencias distintas entre convenios/);
 const [uneven]=salarySharedGroups(salaryItems([scale('1','3','100.00',monthly('2026-10')),scale('4','3','100.00',monthly('2026-09'))]));
 assert.equal(uneven.mode,'mixed');
});

test('primer y último mes propuestos según cómo está cargada la vigencia',()=>{
 const [open]=salarySharedGroups(salaryItems([scale('1','3','100.00',{validFrom:'2026-09'}),scale('4','3','100.00',{validFrom:'2026-11'})]));
 assert.equal(salarySharedFirstMonth(open),'2026-12');assert.equal(salarySharedLastMonth(open,'2026-12'),null);
 const [closed]=salarySharedGroups(salaryItems([scale('1','3','100.00',monthly('2026-12')),scale('4','3','100.00',monthly('2026-12'))]));
 assert.equal(salarySharedFirstMonth(closed),'2027-01');assert.equal(salarySharedLastMonth(closed,'2027-01'),'2027-01');
 const [quarter]=salarySharedGroups(salaryItems([scale('1','3','100.00',{validFrom:'2026-07',validUntil:'2026-09'}),scale('4','3','100.00',{validFrom:'2026-07',validUntil:'2026-09'})]));
 assert.equal(salarySharedFirstMonth(quarter),'2026-10');assert.equal(salarySharedLastMonth(quarter,'2026-10'),'2026-12');
});

test('vigencia abierta: el grupo pasa completo por el plan de nueva vigencia',()=>{
 const items=salaryItems([scale('1','3','100.00'),scale('4','3','100.00'),scale('6','3','100.00'),scale('1','4','107.00')]);
 const [group]=salarySharedGroups(items);
 const plan=salaryEffectivePlan(items,selected(group.rows),change(),salarySharedFirstMonth(group));
 const next=plan.items.filter(item=>item.categoryCode==='3'&&item.validFrom==='2026-10');
 assert.equal(next.length,3);assert.ok(next.every(item=>item.value==='102.60'&&item.validUntil===null));
 assert.ok(plan.items.filter(item=>item.categoryCode==='3'&&item.validFrom==='2026-09').every(item=>item.value==='100.00'&&item.validUntil==='2026-09'));
 assert.equal(plan.items.find(item=>item.categoryCode==='4').value,'107.00');
 assert.equal(salaryBulkPlan(items,selected(group.rows),change()).changes.length,3);
});

test('período finalizado: prepara el mes nuevo con un valor para todos los convenios y no toca el origen',()=>{
 const source=[scale('1','3','100.00',monthly('2026-10')),scale('4','3','100.00',monthly('2026-10')),scale('6','3','100.00',monthly('2026-10'))];
 const items=salaryItems([...source,scale('1','4','107.00',monthly('2026-10'))]),before=salarySerialized(items);
 const [group]=salarySharedGroups(items);
 const first=salarySharedFirstMonth(group),plan=salarySharedPeriodPlan(items,selected(group.rows),change(),first,salarySharedLastMonth(group,first));
 assert.equal(first,'2026-11');assert.equal(plan.preparationMode,'closed_period');assert.equal(plan.newDefinitionsCount,3);assert.equal(plan.changes.length,3);assert.equal(plan.items.length,7);
 const created=plan.items.filter(item=>item.validFrom==='2026-11');
 assert.deepEqual(created.map(item=>[item.agreementCode,item.categoryCode,item.value,item.validUntil]),[['1','3','102.60','2026-11'],['4','3','102.60','2026-11'],['6','3','102.60','2026-11']]);
 assert.ok(plan.changes.every(entry=>entry.before===null||entry.before===undefined));
 for(const original of source)assert.deepEqual(plan.items.find(item=>salaryRowKey(item)===salaryRowKey(original)),salaryItems([original])[0]);
 assert.equal(salarySerialized(items),before);
 // El resultado vuelve a agruparse como el valor de hoy.
 assert.deepEqual(salarySharedGroups(plan.items).map(g=>[g.value,g.validUntil]),[['102.60','2026-11']]);
});

test('período finalizado: rechaza lo que no puede prepararse sin inventar',()=>{
 const closed=[scale('1','3','100.00',monthly('2026-10')),scale('4','3','100.00',monthly('2026-10'))],items=salaryItems(closed);
 const plan=(rows,from,until,all=items,ch=change())=>salarySharedPeriodPlan(all,selected(rows),ch,from,until);
 assert.throws(()=>plan(closed,'2026-10','2026-10'),/todavía está vigente/);
 assert.throws(()=>plan(closed,'2026-11','2026-10'),/mes final/);
 assert.throws(()=>plan(closed,'','2026-11'),/empieza el período/);
 assert.throws(()=>plan(closed,'2026-11','2026-11',items,change('102.6')),Error,'el valor respeta los decimales declarados');
 const open=salaryItems([scale('1','3','100.00'),scale('4','3','100.00')]);
 assert.throws(()=>plan(open,'2026-11','2026-11',open),/todavía está vigente/);
 const aux=parameter('1','88','1.00',monthly('2026-10')),dependent=[parameter('1','500','5.00',{...monthly('2026-10'),dependencies:[salaryRowKey(aux)]}),parameter('4','500','5.00',monthly('2026-10'))],withDeps=salaryItems([aux,...dependent]);
 assert.throws(()=>plan(dependent,'2026-11','2026-11',withDeps),/depende de otras definiciones/);
 const stale=salaryItems([scale('1','3','90.00',monthly('2026-09')),scale('1','3','100.00',monthly('2026-10')),scale('4','3','90.00',monthly('2026-09'))]);
 assert.throws(()=>plan([stale.find(item=>item.agreementCode==='1'&&item.validFrom==='2026-09')],'2026-11','2026-11',stale),/ya tiene una vigencia posterior/);
 // Repetir la preparación sobre el resultado choca con el período ya creado.
 const once=plan(closed,'2026-11','2026-11');
 assert.throws(()=>salarySharedPeriodPlan(once.items,selected(closed),change(),'2026-11','2026-11'));
});

test('la pantalla ofrece el atajo dentro de la actualización conjunta y no agrega otra forma de guardar',()=>{
 const source=fs.readFileSync(new URL('../src/islands/NativeSalaryBulk.jsx',import.meta.url),'utf8');
 assert.match(source,/data-salary-shared /);
 assert.match(source,/Valores que se repiten en varios convenios/);
 assert.match(source,/function pick\(group\)\{if\(disabled\|\|group\.mode==='mixed'\)return;/);
 assert.match(source,/setOperation\(group\.mode==='closed'\?'period':'effective'\)/);
 assert.match(source,/operation==='period'\?salarySharedPeriodPlan\(items,selection,change\(\),startMonth,endMonth\)/);
 assert.match(source,/<option value="period">Preparar un período nuevo desde uno finalizado<\/option>/);
 assert.match(source,/data-salary-period-impact/);
 assert.equal((source.match(/onApply\(/g)??[]).length,1,'un solo camino al borrador: el plan revisado');
 assert.doesNotMatch(source,/fetch\(|localStorage|sessionStorage/);
});
