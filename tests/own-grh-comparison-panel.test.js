import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {mountOwnGrhComparisonPanel} from '../assets/own-grh-comparison-panel.js';

class Element{
 constructor(tag='div'){this.tagName=tag.toLowerCase();this.children=[];this.dataset={};this.hidden=false;this.disabled=false;this.listeners=new Map();this.isConnected=true;this.textContent='';this.attributes={};this.value='';}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=[...items];}
 setAttribute(k,v){this.attributes[k]=v;}
 getAttribute(k){return this.attributes[k]??null;}
 addEventListener(k,fn){this.listeners.set(k,[...(this.listeners.get(k)??[]),fn]);}
 removeEventListener(k,fn){this.listeners.set(k,(this.listeners.get(k)??[]).filter(f=>f!==fn));}
 focus(){}
 closest(){return null;}
 set innerHTML(html){this.raw=html;this.controls=new Map();for(const match of html.matchAll(/data-ogc-([a-z-]+)/g)){if(!this.controls.has(match[1]))this.controls.set(match[1],new Element());}
  for(const [key,el]of this.controls)if(['view','filter','own','grh'].includes(key))el.value=key==='view'?'concepts':key==='filter'?'all':'';}
 querySelector(q){if(q==='h3')return new Element('h3');const m=q.match(/^\[data-ogc-([a-z-]+)\]$/);return m?this.controls.get(m[1])??null:null;}
 querySelectorAll(){return [];}
}
test('monta sin red, sin escribir datos ni pedir permisos nuevos; sólo consulta bajo acción explícita',t=>{
 const originals=['document','window','setInterval','clearInterval'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]);
 const listeners=new Map(),body=new Element(),head=new Element();
 globalThis.document={hidden:false,head,querySelectorAll:()=>[],createElement:tag=>new Element(tag),
  addEventListener:(k,fn)=>listeners.set(k,fn),removeEventListener:k=>listeners.delete(k),getElementById:()=>null};
 globalThis.window={addEventListener:(k,fn)=>listeners.set(k,fn)};
 globalThis.setInterval=()=>1;globalThis.clearInterval=()=>{};
 t.after(()=>{for(const [k,v]of originals)if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];});
 const panel=mountOwnGrhComparisonPanel(body);
 assert.equal(panel.hasComparison,false);
 assert.ok(body.raw.includes('MuniControl contra GRH'));
 for(const key of ['catalog','own','grh','compare','view','filter','search','summary','csv','xlsx','pdf','trace','rows'])assert.ok(body.controls.has(key),key);
 assert.ok((body.controls.get('catalog').listeners.get('click')??[]).length);
 assert.equal((body.controls.get('form').listeners.get('submit')??[]).length,1);
 assert.equal(body.controls.get('compare').disabled,true);
 assert.equal(body.controls.get('pdf').disabled,true);
 assert.ok(body.raw.includes('Diferencia de redondeo')||body.raw.includes('redondeo'));
 assert.ok(body.raw.includes('Las descargas incluyen todas las filas'));
 assert.equal(body.raw.includes('method="POST"'),false);
 panel.clear();assert.equal(panel.hasComparison,false);
});
test('ambos centros integran la pantalla sin reemplazar las dos comparaciones anteriores',()=>{
 for(const path of ['assets/payroll-navigation.js','assets/report-centre.js']){
  const source=fs.readFileSync(path,'utf8');assert.match(source,/mountOwnGrhComparisonPanel\(grhComparison\)/);
  assert.match(source,/mountOwnPayrollComparison\(ownComparison\)/);
  assert.match(source,/mountPayrollComparison\(sourceComparison\)/);
  assert.match(source,/Comparar MuniControl contra GRH por legajo/);
 }
 const source=fs.readFileSync('assets/own-grh-comparison-panel.js','utf8');
 assert.match(source,/resource=owngrhstatementlines&datasetId=/);
 assert.match(source,/resource=payrollsourcereport/);
 assert.match(source,/OWN_GRH_JOIN/);assert.match(source,/verifiedHistoricalCapture/);
 assert.match(source,/reportCsv\(doc\).*reportXlsx\(doc\).*reportPdf\(doc\)/s);
 assert.doesNotMatch(source,/localStorage|sessionStorage|method:'POST'|method:"POST"/);
});
