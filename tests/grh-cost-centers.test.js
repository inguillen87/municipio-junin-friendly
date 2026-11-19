// Centro de costo y concepto: se eligen por nombre y se guarda el código.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {GRH_COST_CENTERS,costCenterInfo,costCenterOption,costCenterText,searchCostCenters,costCenterCode,costCenterHint} from '../assets/grh-cost-centers.js';
import {attachCodeHelp,conceptCodeFromText,conceptHintFromText,conceptText} from '../assets/code-name-help.js';
import {ownNoveltyRowExtras} from '../assets/own-payroll-novelties-extra.js';

const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');

test('la lista de centros de costo tiene códigos únicos y nombres legibles',()=>{
  assert.equal(GRH_COST_CENTERS.length,46);
  assert.equal(new Set(GRH_COST_CENTERS.map(c=>c.code)).size,46);
  for(const c of GRH_COST_CENTERS){assert.match(c.code,/^[1-9]\d?$/);assert.ok(c.label.length>=4&&c.label.length<=40,c.label);assert.doesNotMatch(c.label,/[Ã�]/);}
  assert.deepEqual(costCenterInfo('2'),{code:'2',label:'Servicios Públicos'});assert.equal(costCenterInfo('999'),null);
});

test('un código guardado se lee con su nombre; uno desconocido se muestra tal cual',()=>{
  assert.equal(costCenterText('22'),'22 · Despacho Admin. Intendencia');
  assert.equal(costCenterText('999'),'999');
  assert.equal(costCenterText(null),'Sin informar');assert.equal(costCenterText(''),'Sin informar');
  assert.deepEqual(ownNoveltyRowExtras({forced:false,costCenterSourceId:'19',adjustmentMonth:null,movementType:null,legalInstrument:null,observation:null}),['Centro de costo 19 · I.B.Z.E.']);
  assert.deepEqual(ownNoveltyRowExtras({forced:false,costCenterSourceId:'777',adjustmentMonth:null,movementType:null,legalInstrument:null,observation:null}),['Centro de costo 777']);
});

test('lo escrito se convierte en código sólo cuando reconoce un único centro',()=>{
  assert.equal(costCenterCode(''),'');assert.equal(costCenterCode('   '),'');
  assert.equal(costCenterCode('22'),'22');assert.equal(costCenterCode(' 999 '),'999');
  assert.equal(costCenterCode('servicios publicos'),'2');assert.equal(costCenterCode('Acción social'),'6');assert.equal(costCenterCode('2 · Servicios Públicos'),'2');
  assert.equal(costCenterCode('tesoreria'),'7');assert.equal(costCenterCode('ibze'),null);assert.equal(costCenterCode('i.b.z.e.'),'19');
  // Hay dos «Hacienda» (4 y 26) y varias «Obras…»: no se adivina.
  assert.equal(costCenterCode('hacienda'),null);assert.equal(costCenterCode('obras'),null);assert.equal(costCenterCode('26 hacienda'),'26');
  assert.equal(costCenterCode('no existe'),null);assert.equal(costCenterCode(null),'');
  assert.deepEqual(searchCostCenters('jardin').map(c=>c.code),['42','43','44']);
  assert.equal(costCenterOption(costCenterInfo('4')),'4 · Hacienda');
});

test('la línea de ayuda dice a qué corresponde lo escrito, o entre cuáles hay que elegir',()=>{
  assert.equal(costCenterHint(''),'');assert.equal(costCenterHint('2'),'Servicios Públicos');
  assert.match(costCenterHint('999'),/no está en la lista de referencia/);
  assert.equal(costCenterHint('cultura'),'9 · Cultura');
  assert.equal(costCenterHint('hacienda'),'¿Cuál? 4 · Hacienda / 26 · Hacienda');
  assert.match(costCenterHint('zzz'),/Sin coincidencias/);
});

test('el concepto también se resuelve por nombre sin adivinar entre varios',()=>{
  assert.equal(conceptCodeFromText(''),'');assert.equal(conceptCodeFromText('638'),'638');assert.equal(conceptCodeFromText('0'),'0');
  assert.equal(conceptCodeFromText('zzzz no existe'),null);
  assert.equal(conceptHintFromText(''),'');assert.match(conceptHintFromText('1'),/^1 · /);
  assert.match(conceptHintFromText('99999'),/no está en la lista de referencia/);assert.match(conceptHintFromText('zzzz no existe'),/Sin coincidencias/);
});

// Documento mínimo para ejercitar la ayuda sin navegador.
function fakeInput(){
  const listeners={},attrs={},siblings=[];
  const el=tag=>({tag,children:[],dataset:{},attrs:{},setAttribute(k,v){this.attrs[k]=v;},append(...n){this.children.push(...n);},textContent:''});
  const input={value:'',dataset:{},maxLength:20,inputMode:'numeric',placeholder:'',ownerDocument:{createElement:el},setAttribute(k,v){attrs[k]=v;},addEventListener(type,fn){(listeners[type]??=[]).push(fn);},dispatchEvent(event){for(const fn of listeners[event.type]??[])fn(event);return true;},after(...n){siblings.push(...n);}};
  return {input,attrs,siblings,fire:type=>input.dispatchEvent({type})};
}
test('la ayuda agrega la lista, explica lo escrito y cambia un nombre único por su código',()=>{
  const {input,attrs,siblings,fire}=fakeInput();
  attachCodeHelp(input,{options:GRH_COST_CENTERS,resolve:costCenterCode,hint:costCenterHint,placeholder:'Nombre o número'});
  const [list,line]=siblings;assert.equal(list.tag,'datalist');assert.equal(list.children.length,46);assert.deepEqual([list.children[1].value,list.children[1].label],['2','Servicios Públicos']);
  assert.equal(attrs.list,list.id);assert.equal(input.inputMode,'text');assert.equal(input.maxLength,80);assert.equal(input.placeholder,'Nombre o número');assert.equal(line.textContent,'');
  input.value='cultura';fire('input');assert.equal(line.textContent,'9 · Cultura');
  fire('change');assert.equal(input.value,'9');assert.equal(line.textContent,'Cultura');
  input.value='hacienda';fire('change');assert.equal(input.value,'hacienda');assert.match(line.textContent,/^¿Cuál\?/);
  input.value='';fire('change');assert.equal(input.value,'');assert.equal(line.textContent,'');
  // No se instala dos veces sobre el mismo campo.
  assert.equal(attachCodeHelp(input,{options:[],resolve:()=>'',hint:()=>''}),null);assert.equal(siblings.length,2);
});

test('las pantallas de novedades ofrecen nombres donde antes pedían un código',()=>{
  const own=read('assets/own-payroll-novelties-panel.js'),fixed=read('assets/payroll-fixed-novelties.js');
  assert.doesNotMatch(own,/<input inputmode="numeric" data-n-cost>/);assert.match(own,/data-n-cost list="ownNoveltyCostCenters"/);assert.match(own,/costCenterSourceId:costCenter,/);
  assert.match(own,/Elegí el centro de costo de la lista o escribí su número\./);
  assert.match(fixed,/costCenterChooser\(fields\.costCenterSourceId\)/);assert.match(fixed,/conceptChooser\(correctionFields,\{fillUnits:false\}\);costCenterChooser\(correctionFields\.costCenterSourceId\)/);
  assert.doesNotMatch(fixed,/'Código del concepto'/);assert.match(fixed,/\['Centro de costo',costCenterText\(value\.costCenterSourceId\)\]/);
  assert.match(read('assets/payroll-novelty-workbench.js'),/attachConceptHelp\(byId\('conceptSourceId'\)\);attachCostCenterHelp\(byId\('costCenterSourceId'\)\);/);
  assert.match(read('assets/payroll-novelty-txt-panel.js'),/attachConceptHelp\(get\('bulkCommonConcept'\)\)/);
  assert.match(read('assets/payroll-grh-import-concept-help.js'),/attachConceptHelp\(document\.getElementById\('concept'\)\)/);assert.match(read('importar-novedades-grh.html'),/<script type="module" src="assets\/payroll-grh-import-concept-help\.js"><\/script>/);
  assert.match(read('assets/payroll-monthly-correction.js'),/if\(key==='conceptSourceId'\)attachConceptHelp\(value\);else if\(key==='costCenterSourceId'\)attachCostCenterHelp\(value\);/);
  const build=read('scripts/build-friendly.mjs');assert.match(build,/'assets\/grh-cost-centers\.js'/);assert.match(build,/'assets\/code-name-help\.js'/);
});

test('al revisar o anular, el concepto y el centro de costo se leen con su nombre',()=>{
  assert.equal(conceptText('144'),'144 · PRESENTISMO');assert.equal(conceptText('99999'),'99999');assert.equal(conceptText(null),'');
  const annul=read('assets/payroll-monthly-annul.js'),decisions=read('assets/payroll-monthly-decisions.js'),review=read('assets/payroll-native-monthly-review.js'),correction=read('assets/payroll-monthly-correction.js');
  assert.match(annul,/Concepto \$\{conceptText\(r\.conceptSourceId\)\}/);assert.match(annul,/\['Concepto',conceptText\(r\.conceptSourceId\)\]/);
  assert.match(annul,/\['Centro de costo',r\.costCenterSourceId===null\?null:costCenterText\(r\.costCenterSourceId\)\]/);
  assert.match(annul,/\['Importe informado',r\.amountCents===null\?null:centsToPesosText\(r\.amountCents\)\]/);assert.doesNotMatch(annul,/centavos/i);
  assert.match(decisions,/Concepto \$\{conceptText\(row\.conceptSourceId\)\}/);assert.match(decisions,/\['Concepto',conceptText\(row\.conceptSourceId\)\]/);
  assert.match(review,/\['Concepto', conceptText\(row\.conceptSourceId\)\]/);assert.match(review,/costCenterText\(row\.costCenterSourceId\)/);
  assert.match(correction,/import \{attachConceptHelp,attachCostCenterHelp,conceptText\} from '\.\/code-name-help\.js';/);
});
