// Panel real con DOM y transporte sintéticos. No certifica disposición visual ni una API real.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import * as model from '../assets/payroll-fixed-novelties-model.js';
import * as bulk from '../assets/payroll-fixed-bulk-model.js';
import * as groups from '../assets/payroll-fixed-groups-model.js';
import * as concepts from '../assets/payroll-fixed-concepts.js';
import * as centers from '../assets/grh-cost-centers.js';
import * as junin from '../assets/payroll-junin-638-review.js';
import {countWords} from '../assets/count-words.js';
import {fixedFixture,fixedSubject,fixedApprovedRecord} from './fixtures/payroll-fixed-novelties-synthetic.js';

const camel=value=>value.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
class Element{
 constructor(tag='div'){this.tagName=tag;this.children=[];this.parent=null;this.dataset={};this.attributes={};this.events={};this.hidden=false;this.disabled=false;this.checked=false;this.isConnected=true;this._text='';this._value=undefined;}
 get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
 set textContent(value){this._text=String(value);this.children=[];}
 get value(){return this._value??(this.tagName==='select'?this.children[0]?.value??'':'');}
 set value(value){this._value=String(value);}
 append(...nodes){for(const child of nodes){child.parent=this;this.children.push(child);}}
 prepend(...nodes){for(const child of nodes)child.parent=this;this.children.unshift(...nodes);}
 replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes);}
 before(...nodes){for(const child of nodes)child.parent=this.parent;this.parent.children.splice(this.parent.children.indexOf(this),0,...nodes);}
 remove(){this.parent.children.splice(this.parent.children.indexOf(this),1);}
 setAttribute(key,value){this.attributes[key]=String(value);if(key.startsWith('data-'))this.dataset[camel(key.slice(5))]=String(value);else if(['hidden','disabled','checked'].includes(key))this[key]=true;else this[key]=String(value);}
 toggleAttribute(key,value){if(value)this.setAttribute(key,'');else{delete this.attributes[key];this[key]=false;}}
 addEventListener(type,fn){this.events[type]=fn;}
 emit(type){return this.events[type]?.({preventDefault(){}});}
 focus(){}
 reset(){}
 matches(selector){const match=/^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);if(match){const value=match[1].startsWith('data-')?this.dataset[camel(match[1].slice(5))]:this.attributes[match[1]];return value!==undefined&&(match[2]===undefined||value===match[2]);}return this.tagName===selector;}
 querySelectorAll(selector){const result=[];const visit=node=>{for(const child of node.children){if(selector.split(',').some(s=>child.matches(s.trim())))result.push(child);visit(child);}};visit(this);return result;}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 closest(selector){return this.matches(selector)?this:this.parent?.closest(selector);}
 set innerHTML(html){
  this.replaceChildren();const stack=[this];
  for(const token of html.matchAll(/<\/?[^>]+>|[^<]+/g)){const text=token[0];if(text.startsWith('</')){stack.pop();continue;}if(!text.startsWith('<')){const n=new Element('text');n.textContent=text;stack.at(-1).append(n);continue;}
   const [,tag,attrs]=/^<(\w+)([^>]*)>/.exec(text),n=new Element(tag);for(const attr of attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g))n.setAttribute(attr[1],attr[2]??'');stack.at(-1).append(n);if(!['input','br'].includes(tag))stack.push(n);
  }
 }
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function settle(h){for(let i=0;i<100;i++){await tick();if(h.host.attributes['aria-busy']==='false')return;}throw Error('La operación sintética no terminó.');}
async function setup({records=[],role='preparer'}={}){
 const fixture=fixedFixture();fixture.state.records=records;fixture.state.role=role;
 const document={hidden:false,events:{},createElement:tag=>new Element(tag),addEventListener(type,fn){this.events[type]=fn;},removeEventListener(){}};
 const shell=new Element('details');shell.open=true;const host=new Element();host.dataset.fixedHost='';shell.append(host);
 const requests=[],h={fixture,document,shell,host,requests,postHook:null,employeeHook:null};
 const response=(data,status=200,code='')=>({ok:status<400,status,json:async()=>status<400?{ok:true,data}:{code}});
 const fetch=async(url,options)=>{
  const query=new URL(url,'https://example.invalid').searchParams,entry={resource:query.get('resource'),legajo:query.get('legajo'),method:options.method||'GET',key:options.headers['Idempotency-Key'],body:options.body?JSON.parse(options.body):null};requests.push(entry);
  if(options.method==='POST'){if(h.postHook){const override=await h.postHook(entry,options);if(override)return override;}const result=fixture.mutate(entry.body.command,entry.body.payload,entry.key);return response(result.data,result.status,result.code);}
  if(entry.resource==='bootstrap')return response(fixture.bootstrap());
  if(entry.resource==='list')return response(fixture.list(query.get('periodMonth')));
  if(entry.resource==='employee'){if(h.employeeHook){const override=await h.employeeHook(entry,options);if(override)return override;}return response({version:'payroll-fixed-employee.v1',subject:fixedSubject(entry.legajo)});}
  throw Error('Consulta sintética inesperada: '+entry.resource);
 };
 const context=vm.createContext({...model,...bulk,...groups,...concepts,...centers,...junin,countWords,Set,document,window:{addEventListener(){},removeEventListener(){}},location:{href:'https://example.invalid'},URL,URLSearchParams,AbortController,AbortSignal,DOMException,crypto:webcrypto,structuredClone,fetch,console});
 const source=fs.readFileSync('assets/payroll-fixed-novelties.js','utf8').replace(/^import[\s\S]*?;\r?\n/gm,'').replace('export function mountFixedNovelties','function mountFixedNovelties');
 vm.runInContext(source,context);h.panel=context.mountFixedNovelties(shell);h.panel.setAccess({capabilities:fixture.cap(),principalKey:'synthetic'});await settle(h);
 h.q=name=>host.querySelector('[data-fn-'+name+']');h.field=name=>host.querySelector('[data-fn-field="'+name+'"]');h.response=response;
 h.open=()=>h.q('bulk-new').emit('click');
 h.fill=(sheet)=>{h.field('sheet').value=sheet;h.field('legalInstrument').value='Acto sintético común';h.field('reason').value='Carga sintética de prueba';h.field('sheet').emit('input');};
 h.verify=async()=>{await h.q('bulk-verify').emit('click');await settle(h);};
 h.save=async()=>{h.q('bulk-reviewed').checked=true;h.q('bulk-reviewed').emit('change');assert.equal(h.q('save').disabled,false);await h.q('save').emit('click');await settle(h);};
 h.posts=()=>requests.filter(r=>r.method==='POST');return h;
}
const row=(legajo,concept='80')=>`${legajo};${concept};1;;2026-09-15;;`;

test('permiso de preparación y un solo editor; mensual por defecto',async()=>{
 const reader=await setup({role:'reader'});assert.equal(reader.q('bulk-new').hidden,true);reader.open();assert.equal(reader.field('sheet'),null);
 const h=await setup();assert.equal(h.q('bulk-new').hidden,false);h.open();assert.equal(h.field('payrollType').value,'monthly');assert.equal(h.q('new').disabled,true);assert.equal(h.q('bulk-new').disabled,true);assert.match(h.host.textContent,/no admite modo forzado/);assert.match(h.host.textContent,/no calcula haberes ni modifica GRH/);
});
test('verifica una vez por legajo en serie, muestra existentes aparte y guarda solo altas nuevas',async()=>{
 const h=await setup({records:[fixedApprovedRecord(0)]});h.open();h.fill([row('1001'),row('1001','81'),row('1002')].join('\n'));
 let pending=0;h.employeeHook=async()=>{assert.equal(++pending,1);await tick();pending--;};await h.verify();
 assert.deepEqual(h.requests.filter(r=>r.resource==='employee').map(r=>r.legajo),['1001','1002']);assert.match(h.q('preview-result').textContent,/Ya existe/);assert.match(h.q('preview-result').textContent,/AGENTE SINTÉTICO 1002/);assert.equal(h.q('save').textContent,'Guardar 2 propuestas para revisión');assert.equal(h.q('save').disabled,true);
 h.postHook=async()=>{assert.equal(++pending,1);await tick();pending--;};await h.save();assert.equal(h.posts().length,2);assert.equal(h.posts()[0].body.payload.values.conceptSourceId,'81');assert.equal(h.posts()[1].body.payload.legajo,'1002');assert.equal(new Set(h.posts().map(r=>r.key)).size,2);assert.match(h.q('form-status').textContent,/2 propuestas guardadas de 2/);assert.equal(h.requests.at(-1).resource,'list');assert.equal(h.fixture.state.records.filter(r=>r.pending).length,2);
});
test('errores de formato o legajo bloquean todas las propuestas y editar invalida la revisión',async()=>{
 const h=await setup();h.open();h.fill(row('1001')+'\n1002;80;;;2026-09-15');await h.verify();assert.equal(h.q('save').disabled,true);assert.match(h.q('preview-result').textContent,/Fila 2:.*ausente/);
 h.fill(row('1001')+'\n'+row('1002'));h.employeeHook=entry=>entry.legajo==='1002'?h.response(null,404,'PAYROLL_FIXED_NOT_FOUND'):null;await h.verify();assert.equal(h.q('save').disabled,true);assert.match(h.q('preview-result').textContent,/Fila 2:.*No se encontró/);assert.equal(h.posts().length,0);
 h.employeeHook=null;await h.verify();h.q('bulk-reviewed').checked=true;h.q('bulk-reviewed').emit('change');assert.equal(h.q('save').disabled,false);h.field('reason').emit('input');assert.equal(h.q('save').disabled,true);assert.equal(h.q('bulk-reviewed').checked,false);
});
test('falla intermedia detiene la serie; reintentar conserva clave y cuerpo sin reenviar las guardadas',async()=>{
 const h=await setup();h.open();h.fill(['1001','1002','1003'].map(n=>row(n)).join('\n'));await h.verify();let fail=true;
 h.postHook=entry=>entry.body.payload.legajo==='1002'&&fail?h.response(null,409,'PAYROLL_FIXED_CAPACITY_LIMIT'):null;await h.save();
 assert.equal(h.posts().length,2);assert.match(h.q('form-status').textContent,/1 propuesta guardada de 3/);assert.match(h.q('form-status').textContent,/Fila 2:.*capacidad/);assert.equal(h.q('cancel').disabled,true);assert.equal(h.q('retry').hidden,false);
 fail=false;await h.q('retry').emit('click');await settle(h);const posts=h.posts();assert.deepEqual(posts.map(p=>p.body.payload.legajo),['1001','1002','1002','1003']);assert.equal(posts[1].key,posts[2].key);assert.deepEqual(posts[1].body,posts[2].body);assert.match(h.q('form-status').textContent,/3 propuestas guardadas de 3/);
});
test('respuesta perdida luego de guardar recupera por la misma clave sin duplicar',async()=>{
 const h=await setup();h.open();h.fill(row('1001')+'\n'+row('1002'));await h.verify();let lose=true;
 h.postHook=entry=>{if(lose){lose=false;h.fixture.mutate(entry.body.command,entry.body.payload,entry.key);throw TypeError('Interrupción sintética');}};await h.save();assert.equal(h.posts().length,1);assert.equal(h.fixture.state.records.length,1);
 await h.q('retry').emit('click');await settle(h);assert.equal(h.posts().length,3);assert.equal(h.posts()[0].key,h.posts()[1].key);assert.equal(h.fixture.state.records.length,2);assert.match(h.q('form-status').textContent,/2 propuestas guardadas de 2/);
});
test('ocultar durante el segundo envío conserva progreso y al volver permite continuar sin envío automático',async()=>{
 const h=await setup();h.open();h.fill(['1001','1002','1003'].map(n=>row(n)).join('\n'));await h.verify();
 h.postHook=(entry,options)=>{if(entry.body.payload.legajo==='1002'){h.document.hidden=true;h.document.events.visibilitychange();assert.equal(options.signal.aborted,true);throw new DOMException('Interrupción sintética','AbortError');}};
 await h.save();assert.equal(h.posts().length,2);assert.equal(h.q('preview-result').hidden,true);
 h.document.hidden=false;h.document.events.visibilitychange();await settle(h);assert.equal(h.posts().length,2);assert.match(h.q('form-status').textContent,/1 propuesta guardada de 3/);assert.equal(h.q('retry').disabled,false);
 h.postHook=null;await h.q('retry').emit('click');await settle(h);assert.deepEqual(h.posts().map(p=>p.body.payload.legajo),['1001','1002','1002','1003']);assert.equal(h.posts()[1].key,h.posts()[2].key);assert.match(h.q('form-status').textContent,/3 propuestas guardadas de 3/);
});
test('ocultar durante verificación no permite guardar un resultado parcial',async()=>{
 const h=await setup();h.open();h.fill(row('1001')+'\n'+row('1002'));h.employeeHook=()=>{h.document.hidden=true;h.document.events.visibilitychange();};await h.verify();assert.equal(h.q('preview-result').hidden,true);assert.equal(h.posts().length,0);
 h.employeeHook=null;h.document.hidden=false;h.document.events.visibilitychange();await settle(h);assert.equal(h.q('save').disabled,true);await h.verify();assert.equal(h.q('save').textContent,'Guardar 2 propuestas para revisión');
});
test('identidad cambiada antes de guardar exige otra revisión sin crear intentos',async()=>{
 const h=await setup();h.open();h.fill(row('1001'));await h.verify();h.employeeHook=entry=>h.response({version:'payroll-fixed-employee.v1',subject:{...fixedSubject(entry.legajo),identityToken:'f'.repeat(64)}});await h.save();assert.equal(h.posts().length,0);assert.match(h.q('form-status').textContent,/Cambió la identidad/);assert.equal(h.q('save').disabled,true);
});
test('pérdida de permiso durante el envío detiene y retira la vista consultada',async()=>{
 const h=await setup();h.open();h.fill(row('1001')+'\n'+row('1002'));await h.verify();h.postHook=()=>h.response(null,403,'PAYROLL_FIXED_CAPABILITY_REQUIRED');await h.save();assert.equal(h.posts().length,1);assert.equal(h.q('retry').disabled,true);assert.equal(h.q('preview-result').hidden,true);assert.match(h.q('form-status').textContent,/0 propuestas guardadas de 2/);
});
test('cerrar y reabrir la sección recupera progreso sin reenviar ni perder el nombre',async()=>{
 const h=await setup();h.open();h.fill(row('1001'));await h.verify();h.postHook=()=>h.response(null,409,'PAYROLL_FIXED_CAPACITY_LIMIT');await h.save();
 h.shell.open=false;h.shell.emit('toggle');assert.equal(h.q('preview-result').hidden,true);h.shell.open=true;h.shell.emit('toggle');await settle(h);
 assert.equal(h.posts().length,1);assert.match(h.q('preview-result').textContent,/AGENTE SINTÉTICO 1001/);assert.match(h.q('form-status').textContent,/0 propuestas guardadas de 1/);assert.equal(h.q('retry').disabled,false);
 h.postHook=null;await h.q('retry').emit('click');await settle(h);assert.match(h.q('form-status').textContent,/1 propuesta guardada de 1/);assert.equal(h.posts()[0].key,h.posts()[1].key);
});
test('otro ámbito no recupera ni reenvía el intento original',async()=>{
 const h=await setup();h.open();h.fill(row('1001'));await h.verify();h.postHook=()=>h.response(null,409,'PAYROLL_FIXED_CAPACITY_LIMIT');await h.save();h.fixture.state.role='reviewer';
 await h.q('refresh').emit('click');await settle(h);assert.equal(h.posts().length,1);assert.equal(h.q('retry').disabled,true);assert.match(h.q('form-status').textContent,/otro ámbito/);
});
test('todas existentes no habilita guardar y una sola novedad usa singular',async()=>{
 const h=await setup({records:[fixedApprovedRecord(0)]});h.open();h.fill(row('1001'));await h.verify();assert.equal(h.q('save').disabled,true);assert.match(h.q('form-status').textContent,/Todas las novedades ya existen/);assert.equal(h.posts().length,0);
 h.fill(row('1002'));await h.verify();assert.equal(h.q('save').textContent,'Guardar 1 propuesta para revisión');assert.match(h.host.textContent,/Revisé la novedad y su respaldo/);await h.save();assert.match(h.q('form-status').textContent,/1 propuesta guardada de 1/);
});
