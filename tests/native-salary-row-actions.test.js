// «Acciones» de una fila del borrador del maestro: activar para un mes o período, aumentar desde un mes y dar de baja
// desde un mes. Cada acción devuelve el borrador completo siguiente y lo que cambia; nunca envía ni aprueba. Los tres
// pedidos reales de la liquidación (bono 550 en noviembre y diciembre, ayuda escolar sólo en febrero, aumento «por 1,02»)
// están como casos, con definiciones sintéticas.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {salaryRowActionAvailability,salaryRowActivatePlan,salaryRowEndPlan,salaryRowIncreasePlan,salaryRowMonthAfter,salaryRowPeriod} from '../assets/native-salary-row-actions-model.js';
import {salaryEffectivePlan} from '../assets/native-salary-effective-model.js';
import {SALARY_MAX_ITEMS,salaryItems,salaryRowKey,salarySerialized} from '../assets/native-salary-catalog-model.js';
import {row} from './fixtures/native-salary-synthetic.js';

const chosen=before=>({key:salaryRowKey(before),before:structuredClone(before)});
const money=(patch={})=>row({unit:'money',value:'1000.00',validFrom:'2026-01',...patch});
const bonus=(patch={})=>money({code:'550',label:'Bono no remunerativo sintético',nature:'non_remuneration',value:null,...patch});
const school=(code,patch={})=>money({code,label:'Ayuda escolar sintética '+code,value:'15000.00',validFrom:'2026-02',validUntil:'2026-02',...patch});
// A master with other agreements, units, a scale and a closed history around the definition under test.
const others=()=>[row({code:'1'}),row({code:'2',agreementCode:'4',unit:'hours',value:'12.50'}),money({code:'550',agreementCode:'4',value:'5.00'}),row({kind:'scale',code:'1',categoryCode:'6',nature:null,unit:'money',value:'375188.93',validFrom:'2026-09'}),money({code:'88',kind:'auxiliary',nature:'auxiliary',value:'0.00'}),row({code:'9',validFrom:'2025-01',validUntil:'2025-12',active:false})];
const activation=(patch={})=>({validFrom:'2026-11',validUntil:'2026-12',value:'240000',ruleReference:'Decreto sintético del bono, no municipal',...patch});
const increase=(patch={})=>({validFrom:'2026-11',increaseForm:'percentage',increase:'2',precision:2,ruleReference:'Acta sintética de aumento, no municipal',...patch});
const find=(items,code,validFrom,agreementCode='1')=>items.find(item=>item.code===code&&item.validFrom===validFrom&&item.agreementCode===agreementCode&&item.kind!=='scale');
// Every definition of the input that is not listed stays byte for byte as it was, and none disappears.
function untouched(input,plan,changedKeys){
 const after=new Map(plan.items.map(item=>[salaryRowKey(item),item]));
 for(const before of salaryItems(input))if(!changedKeys.includes(salaryRowKey(before)))assert.deepEqual(after.get(salaryRowKey(before)),before,salaryRowKey(before));
 assert.deepEqual(plan.changes.map(change=>change.key).sort(),[...changedKeys].sort());
}

test('bono 550: $240.000 en noviembre y diciembre de 2026 y después no va más',()=>{
 const source=bonus(),input=[source,...others()],snapshot=salarySerialized(input);
 const plan=salaryRowActivatePlan(input,chosen(source),activation());
 assert.equal(plan.action,'activate');assert.equal(plan.items.length,input.length+1);assert.equal(salarySerialized(input),snapshot,'la entrada no se modifica');
 assert.deepEqual(find(plan.items,'550','2026-01'),{...source,validUntil:'2026-10'},'la vigencia abierta se cierra el mes anterior, con su valor y respaldo');
 assert.deepEqual(find(plan.items,'550','2026-11'),{...source,validFrom:'2026-11',validUntil:'2026-12',value:'240000.00',ruleReference:activation().ruleReference});
 assert.equal(plan.items.filter(item=>item.code==='550'&&item.agreementCode==='1'&&item.active&&(item.validUntil??'9999-12')>='2027-01').length,0,'en enero de 2027 no queda ninguna vigencia del bono');
 assert.equal(plan.gapFrom,'2027-01');assert.equal(plan.previousUntil,'2026-10');
 assert.deepEqual(plan.summary,['Vigencia nueva de Concepto 550 · convenio 1: de 2026-11 a 2026-12, con valor 240000.00.','La vigencia anterior (desde 2026-01) se cierra en 2026-10 y conserva su valor.','Desde 2027-01 esta definición queda sin vigencia, hasta que la actives otra vez.']);
 assert.equal(plan.done,'Vigencia nueva de Concepto 550 · convenio 1 (de 2026-11 a 2026-12) incorporada al borrador. Todavía no se guardó ni aprobó la versión.');
 untouched(input,plan,[salaryRowKey(source),'concept:1::550:2026-11']);
});

test('ayuda escolar 311 sólo en febrero: desde su vigencia terminada se agrega febrero y lo demás queda igual',()=>{
 const source=school('311'),input=[source,school('312'),school('317'),...others()];
 const plan=salaryRowActivatePlan(input,chosen(source),{validFrom:'2027-02',validUntil:'2027-02',value:'15000.00',ruleReference:'Resolución sintética de ayuda escolar'});
 assert.deepEqual(find(plan.items,'311','2026-02'),source,'la vigencia de origen no cambia');
 assert.deepEqual(find(plan.items,'311','2027-02'),{...source,validFrom:'2027-02',validUntil:'2027-02',ruleReference:'Resolución sintética de ayuda escolar'});
 assert.deepEqual(plan.items.filter(item=>item.code==='311').map(item=>[item.validFrom,item.validUntil]),[['2026-02','2026-02'],['2027-02','2027-02']],'sólo febrero de cada año');
 assert.equal(plan.previousUntil,null);assert.equal(plan.gapFrom,'2027-03');assert.equal(plan.summary[0],'Vigencia nueva de Concepto 311 · convenio 1: sólo 2027-02, con valor 15000.00.');assert.equal(plan.summary[1],'La vigencia de origen (sólo 2026-02) no cambia.');
 untouched(input,plan,['concept:1::311:2027-02']);
});

test('ayuda escolar con vigencia sin término: activar febrero la cierra en enero, y la comparación lo dice',()=>{
 const source=school('311',{validFrom:'2025-01',validUntil:null}),input=[source,...others()];
 const plan=salaryRowActivatePlan(input,chosen(source),{validFrom:'2027-02',validUntil:'2027-02',value:'18000',ruleReference:'Resolución sintética de ayuda escolar'});
 assert.deepEqual(find(plan.items,'311','2025-01'),{...source,validUntil:'2027-01'});assert.equal(find(plan.items,'311','2027-02').value,'18000.00');
 assert.equal(plan.summary[1],'La vigencia anterior (desde 2025-01) se cierra en 2027-01 y conserva su valor.');assert.equal(plan.gapFrom,'2027-03');
 untouched(input,plan,[salaryRowKey(source),'concept:1::311:2027-02']);
});

test('activar sin mes final deja la vigencia nueva sin término y es el mismo plan que «Iniciar vigencia desde otro mes»',()=>{
 const source=money({code:'40'}),input=[source,...others()];
 const plan=salaryRowActivatePlan(input,chosen(source),activation({validUntil:null,value:'1200.00'}));
 const reviewed=salaryEffectivePlan(input,[chosen(source)],{unit:'money',precision:2,value:'1200.00',ruleReference:activation().ruleReference},'2026-11');
 assert.deepEqual(plan.items,reviewed.items);assert.deepEqual(plan.changes,reviewed.changes);assert.equal(plan.gapFrom,null);assert.equal(plan.summary.length,2);
});

test('aumento «por 1,02» es el mismo aumento exacto que 2 %, también sobre un concepto de importe fijo',()=>{
 const source=money({code:'40',value:'375188.50'}),input=[source,...others()];
 const byPercentage=salaryRowIncreasePlan(input,chosen(source),increase({precision:2}));
 const byCoefficient=salaryRowIncreasePlan(input,chosen(source),increase({increaseForm:'coefficient',increase:'1.02'}));
 assert.deepEqual(byCoefficient.items,byPercentage.items);assert.deepEqual(byCoefficient.changes,byPercentage.changes);assert.equal(byCoefficient.percentage,'2');
 assert.equal(byCoefficient.value,'382692.27');assert.equal(byCoefficient.increment,'7503.77');
 assert.deepEqual(find(byCoefficient.items,'40','2026-01'),{...source,validUntil:'2026-10'},'la vigencia anterior se cierra el mes previo con su importe');
 assert.deepEqual(find(byCoefficient.items,'40','2026-11'),{...source,validFrom:'2026-11',value:'382692.27',ruleReference:increase().ruleReference});
 assert.equal(byCoefficient.summary[0],'Aumento del 2 % (coeficiente 1,02) para Concepto 40 · convenio 1: de 375188.50 a 382692.27 desde 2026-11. Incremento exacto: 7503.77.');
 assert.equal(byPercentage.summary[0],'Aumento del 2 % para Concepto 40 · convenio 1: de 375188.50 a 382692.27 desde 2026-11. Incremento exacto: 7503.77.');
 assert.match(byCoefficient.done,/incorporado al borrador\. Todavía no se guardó ni aprobó la versión\.$/);
 untouched(input,byCoefficient,[salaryRowKey(source),'concept:1::40:2026-11']);
});

test('un aumento que no da exacto se detiene sin redondear y dice con cuántos decimales sí da',()=>{
 const source=money({code:'40',value:'375188.93'}),input=[source,...others()],snapshot=salarySerialized(input);
 assert.throws(()=>salaryRowIncreasePlan(input,chosen(source),increase()),error=>error.name==='SalaryInputError'&&error.code==='ROW_ACTION_PRECISION_REQUIRED'&&error.message==='El importe nuevo no se puede escribir exacto con 2 decimales, y no se redondea. Con 4 decimales da exacto: 382692.7086.');
 assert.equal(salarySerialized(input),snapshot);
 const exact=salaryRowIncreasePlan(input,chosen(source),increase({precision:4}));
 assert.equal(exact.value,'382692.7086');assert.equal(find(exact.items,'40','2026-11').precision,4);assert.equal(find(exact.items,'40','2026-01').value,'375188.93');assert.equal(exact.increment,'7503.7786');
 // More than eight decimals would be needed: nothing is proposed, whatever the choice.
 const tiny=money({code:'41',precision:8,value:'0.00000001'});
 assert.throws(()=>salaryRowIncreasePlan([tiny],chosen(tiny),increase({increase:'0.00000001',precision:8})),/El importe nuevo no se puede escribir exacto con 8 decimales, y no se redondea\. Tampoco da exacto con 8 decimales: revisá el aumento\./);
});

test('aumentar es sólo para importes en pesos informados, y dentro de la vigencia elegida',()=>{
 const hours=row({code:'20',unit:'hours',value:'12.50',validFrom:'2026-01'}),unknown=bonus(),zero=money({code:'21',value:'0.00'}),closed=money({code:'22',validUntil:'2026-06'});
 assert.throws(()=>salaryRowIncreasePlan([hours],chosen(hours),increase()),/es sólo para valores en pesos\. Esta definición está en horas\./);
 assert.throws(()=>salaryRowIncreasePlan([unknown],chosen(unknown),increase()),/necesita un importe informado/);
 assert.throws(()=>salaryRowIncreasePlan([zero],chosen(zero),increase()),/no cambia un importe en cero/);
 assert.throws(()=>salaryRowIncreasePlan([closed],chosen(closed),increase()),/Esta vigencia termina en 2026-06: en 2026-11 ya no rige\. Para ese mes usá «Activar para un mes o período»\./);
 assert.throws(()=>salaryRowIncreasePlan([closed],chosen(closed),increase({validFrom:'2026-01'})),/El aumento tiene que empezar después de 2026-01/);
 // Inside a finished validity the increase keeps its declared last month.
 const inside=salaryRowIncreasePlan([closed],chosen(closed),increase({validFrom:'2026-04'}));
 assert.deepEqual(inside.items.map(item=>[item.validFrom,item.validUntil,item.value]),[['2026-01','2026-03','1000.00'],['2026-04','2026-06','1020.00']]);assert.equal(inside.summary[2],'La vigencia nueva termina en 2026-06, como la anterior.');
 for(const patch of [{increase:'0'},{increase:'-2'},{increase:'2,5'},{increase:'1e1'},{increase:''},{increase:2},{increaseForm:'coefficient',increase:'1'},{increaseForm:'coefficient',increase:'0.98'},{increaseForm:'factor'},{precision:9},{precision:null},{precision:'2'},{validFrom:''},{validFrom:'2026-13'},{ruleReference:''},{ruleReference:'ab'},{ruleReference:'<acta>'},{rounding:'half_up'}])
  assert.throws(()=>salaryRowIncreasePlan([money({code:'40'})],chosen(money({code:'40'})),increase(patch)),{name:'SalaryInputError'},JSON.stringify(patch));
});

test('un período que pisa otra vigencia de la misma definición se rechaza con una explicación',()=>{
 const closed=school('311'),open=school('311',{validFrom:'2026-07',validUntil:null}),input=[closed,open,...others()];
 // over the finished validity itself
 assert.throws(()=>salaryRowActivatePlan(input,chosen(closed),activation({validFrom:'2026-01',validUntil:'2026-03',value:'15000'})),/Ese período se superpone con la vigencia de esta misma definición que rige sólo 2026-02\. Elegí meses que no se pisen/);
 // inside the later open validity: the action belongs to that row
 assert.throws(()=>salaryRowActivatePlan(input,chosen(closed),activation({value:'15000'})),/Ese período cae dentro de otra vigencia de esta definición, la que rige desde 2026-07, sin término\. Abrí «Acciones» en la fila de esa vigencia/);
 // an open source cannot be stepped on from before its first month
 assert.throws(()=>salaryRowActivatePlan(input,chosen(open),activation({validFrom:'2026-05',validUntil:'2026-08',value:'15000'})),/se superpone con la vigencia de esta misma definición que rige desde 2026-07, sin término/);
 assert.throws(()=>salaryRowActivatePlan(input,chosen(open),activation({validFrom:'2026-03',validUntil:null,value:'15000'})),/se superpone/);
 // same first month as an existing validity, enabled or kept as history
 assert.throws(()=>salaryRowActivatePlan(input,chosen(open),activation({validFrom:'2026-07',value:'15000'})),/Esta vigencia ya empieza en 2026-07\. Para cambiar su valor o su mes final usá «Editar»\./);
 const history={...school('311',{validFrom:'2027-02',validUntil:'2027-02'}),active:false};
 assert.throws(()=>salaryRowActivatePlan([closed,history],chosen(closed),activation({validFrom:'2027-02',validUntil:'2027-02',value:'15000'})),/Ya hay una vigencia de esta definición que empieza en 2027-02, desactivada\./);
 // between two validities there is room, and nothing else moves
 const between=salaryRowActivatePlan(input,chosen(closed),activation({validFrom:'2026-03',validUntil:'2026-06',value:'15000'}));
 untouched(input,between,['concept:1::311:2026-03']);assert.equal(between.gapFrom,null,'la vigencia siguiente empieza el mes posterior');
 // the same code in another agreement is another definition
 untouched([closed,school('311',{agreementCode:'4',validFrom:'2026-01',validUntil:null})],salaryRowActivatePlan([closed,school('311',{agreementCode:'4',validFrom:'2026-01',validUntil:null})],chosen(closed),activation({validFrom:'2027-02',validUntil:'2027-02',value:'15000'})),['concept:1::311:2027-02']);
});

test('dar de baja pone el último mes a una vigencia sin término; una ya cerrada se rechaza',()=>{
 const source=money({code:'40'}),input=[source,...others()],snapshot=salarySerialized(input);
 const plan=salaryRowEndPlan(input,chosen(source),{validUntil:'2026-12'});
 assert.equal(plan.action,'end');assert.equal(plan.items.length,input.length);assert.deepEqual(find(plan.items,'40','2026-01'),{...source,validUntil:'2026-12'},'sólo cambia el mes final');
 assert.deepEqual(plan.summary,['Concepto 40 · convenio 1 vale hasta 2026-12 inclusive. Su valor y su documento no cambian.','Desde 2027-01 queda sin vigencia, hasta que la actives otra vez.']);
 assert.equal(plan.done,'Concepto 40 · convenio 1 queda con último mes 2026-12 en el borrador. Todavía no se guardó ni aprobó la versión.');assert.equal(salarySerialized(input),snapshot);
 untouched(input,plan,[salaryRowKey(source)]);
 assert.equal(salaryRowEndPlan([source],chosen(source),{validUntil:'2026-01'}).items[0].validUntil,'2026-01','puede valer sólo su primer mes');
 const closed=money({code:'40',validUntil:'2026-12'});
 assert.throws(()=>salaryRowEndPlan([closed],chosen(closed),{validUntil:'2026-10'}),error=>error.name==='SalaryInputError'&&error.message==='«Dar de baja desde un mes» es para vigencias sin término, y esta ya termina en 2026-12. Para cambiar ese mes usá «Editar».');
 assert.throws(()=>salaryRowEndPlan([source],chosen(source),{validUntil:'2025-12'}),/El último mes no puede ser anterior a 2026-01/);
 for(const change of [{validUntil:''},{validUntil:null},{validUntil:'2026-13'},{validUntil:'2100-01'},{},{validUntil:'2026-12',active:false}])assert.throws(()=>salaryRowEndPlan([source],chosen(source),change),{name:'SalaryInputError'},JSON.stringify(change));
});

test('las definiciones que dependen de la elegida se muestran y conservan sus valores; nunca quedan colgadas',()=>{
 const base=money({code:'88'}),dependent=row({code:'95',unit:'percent',value:'50.00',validFrom:'2026-01',dependencies:[salaryRowKey(base)]}),apart=row({code:'1'}),input=[base,dependent,apart];
 const plan=salaryRowIncreasePlan(input,chosen(base),increase());
 assert.equal(plan.relatedDefinitionsCount,1);assert.equal(plan.items.length,5);assert.equal(plan.summary.at(-1),'Una definición que depende de esta pasa a la vigencia nueva con su mismo valor; está en la comparación.');
 assert.deepEqual(find(plan.items,'95','2026-01'),{...dependent,validUntil:'2026-10'});assert.deepEqual(find(plan.items,'95','2026-11'),{...dependent,validFrom:'2026-11',dependencies:['concept:1::88:2026-11']});
 untouched(input,plan,[salaryRowKey(base),salaryRowKey(dependent),'concept:1::88:2026-11','concept:1::95:2026-11']);
 // A period with a last month, or a last month for the source, would leave the dependent without what it refers to.
 assert.throws(()=>salaryRowActivatePlan(input,chosen(base),activation({value:'1200'})),/Concepto 95 · convenio 1 · desde 2026-01 depende de esta y sigue vigente después de 2026-12\. Dejá la vigencia nueva sin mes final/);
 assert.throws(()=>salaryRowEndPlan(input,chosen(base),{validUntil:'2026-12'}),/Concepto 95 · convenio 1 · desde 2026-01 depende de esta y sigue vigente después de 2026-12\. Dala de baja primero/);
 const second=row({code:'96',unit:'percent',value:'10.00',validFrom:'2026-03',dependencies:[salaryRowKey(base)]});
 assert.throws(()=>salaryRowEndPlan([...input,second],chosen(base),{validUntil:'2026-12'}),/y otra definición dependen de esta y siguen vigentes después de 2026-12\. Dalas de baja primero/);
 // Once the dependent has its own last month, the source can end with it.
 const ended=salaryRowEndPlan(input,chosen(dependent),{validUntil:'2026-12'}),endedBase=salaryRowEndPlan(ended.items,chosen(base),{validUntil:'2026-12'});
 assert.deepEqual(endedBase.items.map(item=>[item.code,item.validUntil]),[['1',null],['88','2026-12'],['95','2026-12']]);
});

test('un período nuevo de una definición con dependencias se refiere a las vigencias que rigen en esos meses',()=>{
 const oldBase=money({code:'88',validFrom:'2025-06',validUntil:'2026-06'}),newBase=money({code:'88',validFrom:'2026-07',value:'1100.00'}),source=school('311',{dependencies:[salaryRowKey(oldBase)]}),input=[oldBase,newBase,source];
 const plan=salaryRowActivatePlan(input,chosen(source),activation({validFrom:'2027-02',validUntil:'2027-02',value:'15000'}));
 assert.deepEqual(find(plan.items,'311','2027-02').dependencies,[salaryRowKey(newBase)]);assert.deepEqual(find(plan.items,'311','2026-02'),source);
 assert.ok(plan.summary.includes('Sus dependencias pasan a referirse a las vigencias que rigen en ese período.'));untouched(input,plan,['concept:1::311:2027-02']);
 // A dependency still in force during the whole period is kept as it is.
 const kept=salaryRowActivatePlan([money({code:'88',validFrom:'2025-06'}),school('311',{dependencies:['concept:1::88:2025-06']})],chosen(school('311',{dependencies:['concept:1::88:2025-06']})),activation({validFrom:'2027-02',validUntil:'2027-02',value:'15000'}));
 assert.deepEqual(find(kept.items,'311','2027-02').dependencies,['concept:1::88:2025-06']);assert.ok(!kept.summary.some(line=>line.startsWith('Sus dependencias')));
 // No validity of the dependency covers the period: it is said by name and nothing is prepared.
 assert.throws(()=>salaryRowActivatePlan([oldBase,source],chosen(source),activation({validFrom:'2027-02',validUntil:'2027-02',value:'15000'})),/Esta definición depende de Concepto 88 · convenio 1, que no tiene una vigencia que cubra todo el período elegido\. Activá primero esa definición/);
 assert.throws(()=>salaryRowActivatePlan(input,chosen(source),activation({validFrom:'2026-06',validUntil:'2026-08',value:'15000'})),/no tiene una vigencia que cubra todo el período elegido/);
});

test('el valor se declara exacto: se completan ceros, nunca se recorta ni se interpreta un separador de miles',()=>{
 const source=bonus(),plan=patch=>salaryRowActivatePlan([source],chosen(source),activation(patch)),started=patch=>find(plan(patch).items,'550','2026-11').value;
 assert.equal(started({value:'240000'}),'240000.00');assert.equal(started({value:'240000.5'}),'240000.50');assert.equal(started({value:'0'}),'0.00');assert.equal(started({value:'-10.25'}),'-10.25');
 assert.equal(started({value:null}),null,'vacío es no informado en un concepto');assert.equal(started({value:''}),null);
 for(const value of ['240.000,00','240,000.00','240.000.00','240000.123','$240000','240000,5',' 240000','1e5','-0','-0.00',240000,'1234567890123456789'])assert.throws(()=>plan({value}),{name:'SalaryInputError'},String(value));
 assert.throws(()=>plan({value:'240000.123'}),/Esta definición declara 2 decimales y el valor tiene más\. No se redondea/);
 assert.throws(()=>plan({value:'240.000,00'}),/sin puntos de miles; la coma separa los decimales\. Por ejemplo 240000 o 240000,50\./);
 const whole=bonus({precision:0}),scale=row({kind:'scale',code:'1',categoryCode:'6',nature:null,unit:'money',value:'100.00',validFrom:'2026-01'});
 assert.equal(find(salaryRowActivatePlan([whole],chosen(whole),activation({value:'240000'})).items,'550','2026-11').value,'240000');
 assert.throws(()=>salaryRowActivatePlan([scale],chosen(scale),activation({value:null})),/Una escala necesita un importe/);
 for(const patch of [{validFrom:''},{validFrom:'2026-13'},{validUntil:''},{validUntil:'2026-10'},{validUntil:'2026-1'},{ruleReference:''},{ruleReference:'ab'},{ruleReference:' Decreto '},{ruleReference:'x'.repeat(181)},{ruleReference:'<b>'},{active:false}])assert.throws(()=>plan(patch),{name:'SalaryInputError'},JSON.stringify(patch));
 assert.throws(()=>plan({validUntil:'2026-10'}),/El mes final no puede ser anterior al mes inicial\./);
});

test('la fila elegida se verifica contra el borrador actual, y una definición desactivada no admite acciones',()=>{
 const source=money({code:'40'}),input=[source,...others()];
 for(const run of [selection=>salaryRowActivatePlan(input,selection,activation({value:'1'})),selection=>salaryRowIncreasePlan(input,selection,increase()),selection=>salaryRowEndPlan(input,selection,{validUntil:'2026-12'})]){
  assert.throws(()=>run({key:salaryRowKey(source),before:{...source,value:'999.00'}}),/Esta definición cambió en el borrador después de abrir «Acciones»/);
  assert.throws(()=>run({key:'concept:1::41:2026-01',before:source}),/No se pudo verificar la definición elegida/);
  assert.throws(()=>run({key:'concept:1::41:2026-01',before:money({code:'41'})}),/Esta definición cambió en el borrador/);
  for(const selection of [null,{},{key:salaryRowKey(source)},{key:salaryRowKey(source),before:source,extra:true},[chosen(source)]])assert.throws(()=>run(selection),{name:'SalaryInputError'});
 }
 const history={...money({code:'40'}),active:false},reason=/Esta definición está desactivada y se conserva como antecedente\. Para volver a usarla, habilitala con «Editar»\./;
 assert.throws(()=>salaryRowActivatePlan([history],chosen(history),activation()),reason);assert.throws(()=>salaryRowIncreasePlan([history],chosen(history),increase()),reason);assert.throws(()=>salaryRowEndPlan([history],chosen(history),{validUntil:'2026-12'}),reason);
});

test('cada fila sabe qué acciones admite y por qué no las otras',()=>{
 assert.deepEqual(salaryRowActionAvailability(money()),{activate:null,increase:null,end:null});
 const closed=salaryRowActionAvailability(money({validUntil:'2026-12'}));assert.equal(closed.activate,null);assert.equal(closed.increase,null);assert.match(closed.end,/ya termina en 2026-12/);
 assert.match(salaryRowActionAvailability(row({unit:'percent',value:'50.00'})).increase,/Esta definición está en porcentaje\./);
 assert.match(salaryRowActionAvailability(bonus()).increase,/necesita un importe informado/);assert.equal(salaryRowActionAvailability(bonus()).activate,null);
 const off=salaryRowActionAvailability({...money(),active:false});assert.equal(new Set(Object.values(off)).size,1);assert.match(off.activate,/desactivada/);
 assert.equal(salaryRowActionAvailability(row({kind:'scale',code:'1',categoryCode:'6',nature:null,unit:'money',value:'100.00'})).increase,null,'una escala elegida también se puede aumentar');
 assert.equal(salaryRowPeriod('2026-11','2026-12'),'de 2026-11 a 2026-12');assert.equal(salaryRowPeriod('2027-02','2027-02'),'sólo 2027-02');assert.equal(salaryRowPeriod('2026-11',null),'desde 2026-11, sin término');
 assert.equal(salaryRowMonthAfter('2026-12'),'2027-01');assert.equal(salaryRowMonthAfter('2026-02'),'2026-03');assert.equal(salaryRowMonthAfter(''),null);assert.equal(salaryRowMonthAfter('2026-1'),null);
});

test('el límite del maestro completo cuenta la vigencia nueva; no se recorta',()=>{
 const rows=salaryItems(Array.from({length:SALARY_MAX_ITEMS},(_,number)=>school(String(number+1))));
 assert.throws(()=>salaryRowActivatePlan(rows,chosen(rows[0]),activation({validFrom:'2027-02',validUntil:'2027-02',value:'15000'})),/tendría 10001 definiciones y el límite es 10000/);
 const open=salaryItems(Array.from({length:SALARY_MAX_ITEMS},(_,number)=>money({code:String(number+1)})));
 assert.throws(()=>salaryRowIncreasePlan(open,chosen(open[0]),increase()),/10001/);
 assert.equal(salaryRowEndPlan(open,chosen(open[0]),{validUntil:'2026-12'}).items.length,SALARY_MAX_ITEMS,'dar de baja no agrega definiciones');
});

// Behaviour is exercised end to end by scripts/verify-native-salary-browser.mjs (scripts/lib/native-salary-row-actions-browser.mjs:
// real component, modal, 1440/390/320, no POST). These guards keep the wiring from drifting in a change that never runs it.
const catalog=fs.readFileSync(new URL('../src/islands/NativeSalaryCatalog.jsx',import.meta.url),'utf8'),panel=fs.readFileSync(new URL('../src/islands/NativeSalaryRowActions.jsx',import.meta.url),'utf8');

test('la grilla ofrece un solo «Acciones» por fila, sólo en el borrador, y su panel se carga aparte',()=>{
 assert.equal((catalog.match(/>Acciones<\/button>/g)??[]).length,1);
 assert.ok(catalog.includes("{draft&&<td><button type=\"button\" disabled={disabled} onClick="),'«Editar» sigue primero, sólo en el borrador');
 assert.ok(catalog.includes(">Editar</button><button type=\"button\" data-salary-row-actions aria-label={'Acciones de '+display(r)} disabled={disabled} onClick={e=>openRowActions(r,e.currentTarget)}>Acciones</button></td>}"),'«Acciones» comparte la celda y el bloqueo de «Editar»');
 assert.doesNotMatch(catalog,/import [^;]*NativeSalaryRowActions/,'fuera del presupuesto inicial de Parámetros');assert.match(catalog,/await import\('\.\/NativeSalaryRowActions\.jsx'\)/);
 assert.match(catalog,/\{draft&&rowAction&&<rowAction\.Panel /,'el panel sólo existe con un borrador');assert.match(catalog,/<\/table><\/div>\{draft&&rowAction&&/,'y se abre fuera de la tabla');
 assert.match(catalog,/function suspend\(\)\{[^}]*setRowAction\(null\);\}/,'ocultar la página, cerrar sesión o perder el permiso lo retiran');assert.match(catalog,/function prepare\(\)\{setRowAction\(null\);/);
 // The panel never reaches the API: it only hands the reviewed draft back.
 for(const source of [panel,fs.readFileSync(new URL('../assets/native-salary-row-actions-model.js',import.meta.url),'utf8')])assert.doesNotMatch(source,/fetch\(|XMLHttpRequest|sendBeacon|salaryCommand|\/api\//);
});

test('el panel ofrece las tres acciones con sus nombres, compara antes de incorporar y no baja ningún control de 44 px',()=>{
 assert.match(panel,/const ACTIONS=\[\['activate','Activar para un mes o período'\],\['increase','Aumentar desde un mes'\],\['end','Dar de baja desde un mes'\]\];/);
 assert.match(panel,/<option value="percentage">Porcentaje \(2 es un 2 %\)<\/option><option value="coefficient">Coeficiente \(1,02 es un 2 %\)<\/option>/);
 assert.match(panel,/node\.showModal\(\)/);assert.match(panel,/\(origin\?\.isConnected\?origin:document\.querySelector\('\[data-native-salary\] \.sc-grid-wrap'\)\)\?\.focus\(\)/,'al cerrar, el foco vuelve a la fila');
 assert.match(panel,/if\(salarySerialized\(next\)!==salarySerialized\(review\)\)throw Error\(/,'sólo se incorpora lo que se comparó');assert.match(panel,/<div role="alert">/);
 const css=panel.match(/\nconst css=`([^`]+)`;/)?.[1]??'';assert.ok(css.length>500);
 for(const [,property,pixels] of css.matchAll(/(?:^|[;{])\s*((?:min-|max-)?height):(\d+(?:\.\d+)?)px/g))assert.ok(Number(pixels)>=44,`${property}:${pixels}px`);
 assert.match(css,/@media\(max-width:700px\)\{[^@]*\.sc-row-choice,\.sc-row-form\{grid-template-columns:minmax\(0,1fr\)\}/,'en el teléfono, una sola columna');
});
