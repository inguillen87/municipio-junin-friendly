import test from 'node:test';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {ownSummaryAccess,ownSummaryRows,ownSummaryReviewContext} from '../assets/own-payroll-summary-model.js';
import {uid,hash} from './fixtures/own-payroll-program-synthetic.js';
import {OWN_LIQ_READ} from '../assets/own-payroll-liquidation-model.js';
const bootstrap=count=>({version:'own-liquidation-bootstrap.v1',scopeVersion:hash('a'),complete:true,runs:Array.from({length:count},(_,i)=>({id:uid(i+10),period:i%2?'2026-09':'2026-10',liquidationType:i%3?'monthly':'supplementary',createdAt:'2026-10-11T12:00:00Z',employeeCount:2,resultSha256:hash('b'),canConsult:true}))});
const access=()=>({ok:true,authenticated:true,sessionVersion:2,expiresAt:'2026-10-12T12:00:00Z',user:{id:'synthetic-user',email:'qa@example.invalid'},access:{context:'tenant',membershipId:uid(3),bindingVersion:1,tenant:{id:uid(1),roleKey:'QA'},tenantCapabilities:[...OWN_LIQ_READ]}});
test('el montaje y los módulos de resumen tienen sintaxis válida antes de publicar la página',()=>{for(const module of['payroll-navigation.js','own-payroll-summary-model.js','own-payroll-summary-panel.js'])assert.doesNotThrow(()=>execFileSync(process.execPath,['--check',fileURLToPath(new URL('../assets/'+module,import.meta.url))],{stdio:'pipe'}));});
test('conjunto completo de 61 corridas conserva varias páginas sin sumar personas ni deducir estados',()=>{const b=bootstrap(61),before=structuredClone(b),r=ownSummaryRows(b,{page:4});assert.equal(r.total,61);assert.equal(r.filtered,61);assert.equal(r.pages,4);assert.equal(r.rows.length,1);assert.equal(r.page,4);assert.deepEqual(b,before);assert.equal(r.employeeCount,undefined);assert.equal(r.confirmed,undefined);assert.equal(r.closed,undefined);});
test('período y tipo filtran toda la consulta, incluso fuera de la página inicial',()=>{const b=bootstrap(61),r=ownSummaryRows(b,{period:'2026-09',liquidationType:'supplementary'});assert.equal(r.total,61);assert.equal(r.filtered,10);assert.ok(r.rows.every(x=>x.period==='2026-09'&&x.liquidationType==='supplementary'));});
test('consulta vacía y filtro sin coincidencias informan cero sin inventar error ni resultado',()=>{for(const[b,options]of[[bootstrap(0),{}],[bootstrap(61),{period:'2026-08'}]]){const r=ownSummaryRows(b,options);assert.equal(r.filtered,0);assert.equal(r.pages,1);assert.deepEqual(r.rows,[]);}});
for(const [label,patch]of[['mes inválido',{period:'2026-13'}],['fecha libre',{period:'hoy'}],['tipo desconocido',{liquidationType:'pay'}],['tipo heredado',{liquidationType:'toString'}],['página fraccionada',{page:1.5}],['límite excesivo',{pageSize:1000}],['límite nulo',{pageSize:0}]])test('rechaza '+label,()=>assert.throws(()=>ownSummaryRows(bootstrap(2),patch)));
for(const [label,mutate]of[['respuesta incompleta',b=>b.complete=false],['UUID duplicado',b=>b.runs[1].id=b.runs[0].id],['estado inferido',b=>b.runs[0].state='confirmed'],['importe agregado',b=>b.runs[0].net='1.00'],['cantidad insegura',b=>b.runs[0].employeeCount=null],['recorte superior',b=>b.runs=bootstrap(1001).runs]])test('rechaza '+label+' antes de mostrar datos',()=>{const b=bootstrap(2);mutate(b);assert.throws(()=>ownSummaryRows(b));});
test('períodos y fechas ordenan sin mutar la fuente y página se ajusta al filtro completo',()=>{const b=bootstrap(61),r=ownSummaryRows(b,{period:'2026-09',page:999});assert.equal(r.page,2);assert.equal(r.pages,2);assert.equal(r.rows.length,10);});
test('revisión conserva el resultado exacto de la corrida, sin decisión ni envío',()=>{const b=bootstrap(2),row=b.runs[1],r=ownSummaryReviewContext(b,{row,accessKey:'original-scope'});assert.deepEqual(r,{runId:row.id,resultSha256:hash('b'),contractId:null,accessKey:'original-scope'});assert.ok(Object.isFrozen(r));});
for(const [label,mutate]of[['fuente cambiada',b=>b.runs[0].resultSha256=hash('c')],['autoridad retirada',b=>b.runs[0].canConsult=false],['corrida retirada',b=>b.runs=[]]])test('revisión rechaza '+label,()=>{const b=bootstrap(2),row={...b.runs[0]};mutate(b);assert.throws(()=>ownSummaryReviewContext(b,{row,accessKey:'original'}));});
test('metadatos completos sin permiso nominal conservan canConsult=false',()=>{const b=bootstrap(61);for(const row of b.runs)row.canConsult=false;const r=ownSummaryRows(b);assert.equal(r.total,61);assert.ok(r.rows.every(row=>row.canConsult===false));});
test('el pin de sesión distingue membresía, binding y sesión renovada aunque coincidan usuario y rol',()=>{const a=access(),key=ownSummaryAccess(a,0).key;for(const change of[v=>v.access.membershipId=uid(4),v=>v.access.bindingVersion=2,v=>v.expiresAt='2026-10-13T12:00:00Z',v=>v.access.tenant.roleKey='QA2']){const next=structuredClone(a);change(next);assert.notEqual(ownSummaryAccess(next,0).key,key);}});
test('sesión expirada y permiso privado corrupto no crean una consulta válida',()=>{const a=access();assert.throws(()=>ownSummaryAccess(a,Date.parse(a.expiresAt)));a.access.tenantCapabilities=[null];assert.throws(()=>ownSummaryAccess(a,0));});
for(const[label,change]of[['período',r=>r.period='2026-08'],['tipo',r=>r.liquidationType='vacation'],['cantidad',r=>r.employeeCount=3],['fecha',r=>r.createdAt='2026-10-11T13:00:00Z']])test('mismo UUID y hash no permiten sustituir '+label+' al abrir el resultado',()=>{const b=bootstrap(2),row={...b.runs[0]};change(b.runs[0]);assert.throws(()=>ownSummaryReviewContext(b,{row,accessKey:'original'}));});
// APPEND ONLY to tests/own-payroll-summary.test.js; existing prefix is unchanged.
// Synthetic DOM/HTTP substrate, actual shell IIFE, gate, summary and workspace.
import SHELL_fs from 'node:fs';
import SHELL_vm from 'node:vm';
import {setImmediate as SHELL_turn} from 'node:timers/promises';
import {PayrollPanelElement as SHELL_Element} from './fixtures/payroll-panel-dom.js';
import {mountOwnPayrollSummary as SHELL_mountSummary} from '../assets/own-payroll-summary-panel.js';
import {taskWorkspace as SHELL_taskWorkspace} from '../assets/task-workspace.js';

// Add only the native DOM operations used by these real components. The shared
// payroll fixture still constructs/parses every element and dispatches clicks.
function SHELL_dom(html) {
 const inner=Object.getOwnPropertyDescriptor(SHELL_Element.prototype,'innerHTML');let document;
 const camel=s=>s.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
 const match=(n,selector)=>{
  let s=selector.trim();if(s==='*')return true;
  const attrs=[...s.matchAll(/\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]/g)];s=s.replace(/\[[^\]]*\]/g,'');
  if(attrs.some(([,key,value])=>n.getAttribute(key)===null||value!==undefined&&n.getAttribute(key)!==value))return false;
  const id=s.match(/#([\w-]+)/)?.[1];if(id&&n.id!==id)return false;
  if([...s.matchAll(/\.([\w-]+)/g)].some(([,c])=>!n.classList.contains(c)))return false;
  const tag=s.match(/^[\w-]+/)?.[0];return !tag||n.tagName.toLowerCase()===tag.toLowerCase();
 };
 const select=(root,selector)=>{
  const all=[],walk=n=>{for(const child of n.children){all.push(child);walk(child);}};walk(root);
  return all.filter(n=>selector.split(',').some(part=>{
   const terms=part.trim().split(/\s+/);let current=n;
   if(!match(current,terms.pop()))return false;
   while(terms.length){const term=terms.pop();current=current.parentElement;while(current&&!match(current,term))current=current.parentElement;if(!current)return false;}
   return true;
  }));
 };
 const make=(tag='div',text)=>{const n=upgrade(new SHELL_Element(tag));if(text!==undefined)n.textContent=text;return n;};
 function upgrade(n){
  if(n.__shellDom)return n;n.__shellDom=true;n.id=n.attributes.id??'';n.className=n.attributes.class??'';n.style={};
  for(const[key,value]of Object.entries(n.attributes))if(key.startsWith('data-'))n.dataset[camel(key.slice(5))]=value;
  n.getAttribute=key=>{key=key.toLowerCase();if(key==='id')return n.id||null;if(key==='class')return n.className||null;if(key.startsWith('data-'))return n.dataset[camel(key.slice(5))]??null;return n.attributes[key]??null;};
  n.hasAttribute=key=>n.getAttribute(key)!==null;
  n.setAttribute=(key,value)=>{key=key.toLowerCase();n.attributes[key]=String(value);if(key==='id')n.id=String(value);if(key==='class')n.className=String(value);if(key==='hidden')n.hidden=true;if(key==='disabled')n.disabled=true;if(key.startsWith('data-'))n.dataset[camel(key.slice(5))]=String(value);};
  n.removeAttribute=key=>{key=key.toLowerCase();delete n.attributes[key];if(key==='hidden')n.hidden=false;if(key==='disabled')n.disabled=false;if(key.startsWith('data-'))delete n.dataset[camel(key.slice(5))];};
  n.classList={contains:c=>n.className.split(/\s+/).includes(c),add:(...cs)=>{n.className=[...new Set([...n.className.split(/\s+/).filter(Boolean),...cs])].join(' ');},remove:(...cs)=>{n.className=n.className.split(/\s+/).filter(c=>!cs.includes(c)).join(' ');},toggle:(c,force)=>{const present=n.classList.contains(c),next=force===undefined?!present:!!force;if(next)n.classList.add(c);else n.classList.remove(c);return next;}};
  const detach=child=>{if(child.parentElement){const i=child.parentElement.children.indexOf(child);if(i>=0)child.parentElement.children.splice(i,1);}child.parentElement=null;};
  n.append=(...items)=>{for(let child of items){if(typeof child==='string')child=make('#text',child);upgrade(child);detach(child);child.parentElement=n;n.children.push(child);}};
  n.appendChild=child=>{n.append(child);return child;};
  n.prepend=(...items)=>{for(const child of items.slice().reverse()){upgrade(child);detach(child);child.parentElement=n;n.children.unshift(child);}};
  n.insertBefore=(child,before)=>{if(!before)return n.appendChild(child);detach(child);upgrade(child);const i=n.children.indexOf(before);assert.ok(i>=0);n.children.splice(i,0,child);child.parentElement=n;return child;};
  n.replaceChildren=(...items)=>{for(const child of n.children)child.parentElement=null;n.children=[];n._text='';if(n.tagName==='select')delete n._value;n.append(...items);};
  n.remove=()=>detach(n);n.contains=child=>{for(let p=child;p;p=p.parentElement)if(p===n)return true;return false;};
  n.closest=selector=>{for(let p=n;p;p=p.parentElement)if(match(p,selector))return p;return null;};
  n.querySelectorAll=selector=>select(n,selector);n.querySelector=selector=>n.querySelectorAll(selector)[0]??null;
  n.scrollIntoView=()=>{};n.dispatchEvent=event=>{event.target??=n;for(const callback of n.listeners.get(event.type)??[])callback(event);if(event.bubbles){if(n.parentElement)n.parentElement.dispatchEvent(event);else document?.dispatchEvent(event);}return true;};
  Object.defineProperty(n,'innerHTML',{configurable:true,get:()=>'',set:value=>inner.set.call(n,value)});
  for(const child of n.children)upgrade(child);return n;
 }
 const events=()=>{const listeners=new Map();return{addEventListener:(name,fn)=>{if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(fn);},removeEventListener:(name,fn)=>listeners.set(name,(listeners.get(name)??[]).filter(f=>f!==fn)),dispatchEvent:event=>{for(const fn of listeners.get(event.type)??[])fn(event);return true;}};};
 const root=make('html'),head=make('head'),body=make('body');root.append(head,body);
 const markup=html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1];assert.ok(markup,'Actual body required');
 // The reused parser recognizes self-closing tags; normalize only HTML voids.
 body.innerHTML=markup.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<!--[\s\S]*?-->/g,'').replace(/<(img|area|base|col|embed|param|source|track|wbr)\b([^>]*?)(?:\/?)>/gi,'<$1$2/>');
 document={...events(),head,body,documentElement:root,hidden:false,readyState:'complete',createElement:tag=>make(tag),createTextNode:text=>make('#text',text),getElementById:id=>select(root,'#'+id)[0]??null,querySelector:selector=>select(root,selector)[0]??null,querySelectorAll:selector=>select(root,selector)};
 return{document,windowEvents:events(),make};
}

function SHELL_harness(t,{ownStatus=200,ownData=bootstrap(2),active='calculo'}={}){
 const html=SHELL_fs.readFileSync(new URL('../nomina-control.html',import.meta.url),'utf8'),scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]),script=scripts.find(s=>s.includes("var DATA_URL = '/api/internal-data?resource=payrollControl'"));assert.ok(script,'Actual historical IIFE required');
 const dom=SHELL_dom(html),{document,make}=dom,requests=[],pending=[],location={href:'https://municontrol.example.test/nomina-control.html#'+active,hash:'#'+active,replace:value=>{location.replaced=value;}},window={...dom.windowEvents,history:{pushState:(_,__,hash)=>{location.hash=hash;}}};window.location=location;window.document=document;
 class ShellEvent{constructor(type,options={}){this.type=type;this.detail=options.detail;this.bubbles=!!options.bubbles;this.target=null;}}
 const state={ownStatus,ownData,authCaps:['payroll.read',...OWN_LIQ_READ]},auth=()=>({...access(),expiresAt:new Date(Date.now()+60000).toISOString(),access:{...access().access,tenantCapabilities:[...state.authCaps]}});
 const fetch=async(url,options={})=>{requests.push({url,method:options.method??'GET'});if(url==='/api/internal-data?resource=payrollControl')return new Promise((resolve,reject)=>pending.push({resolve,reject}));if(url==='/api/internal-auth')return new Response(JSON.stringify(auth()));if(url==='/api/internal-own-payroll-liquidation?resource=bootstrap')return new Response(JSON.stringify(state.ownStatus===200?{ok:true,data:state.ownData}:{ok:false,error:{code:'SYNTHETIC_UNAVAILABLE'}}),{status:state.ownStatus});assert.fail('Unexpected request '+url);};
 window.fetch=fetch;
 const names=['document','window','location','CustomEvent','Option','fetch','requestAnimationFrame'],prior=new Map(names.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 Object.assign(globalThis,{document,window,location,CustomEvent:ShellEvent,Option:function(text,value){const n=make('option',text);n.value=value;return n;},fetch,requestAnimationFrame:fn=>fn()});
 let disposed=false;const dispose=()=>{if(disposed)return;window.dispatchEvent(new ShellEvent('pagehide'));for(const[key,descriptor]of prior)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];disposed=true;};t.after(dispose);
 const context=SHELL_vm.createContext({document,window,location,fetch,CustomEvent:ShellEvent,URL,Intl,Date,console,sessionStorage:{removeItem(){}},setTimeout,clearTimeout});
 // Capture only the existing load closure for a refresh after success. Its body,
 // startup call and real Retry listener stay unchanged and execute in the VM.
 const at=script.lastIndexOf('load();');assert.ok(at>=0);SHELL_vm.runInContext(script.slice(0,at)+'globalThis.__shellReload=load;\n'+script.slice(at),context,{filename:'actual-nomina-control-iife.js'});
 const main=document.getElementById('mainContent');assert.ok(main);const draft=make('input');draft.value='borrador propio sin enviar';const draftPanel=make('section');draftPanel.append(draft);const summaryHost=make('div');const summary=SHELL_mountSummary(summaryHost,{onTask:id=>workspace.activate(id,true),onReview:()=>true});
 const reference=document.getElementById('historicalReference')??document.getElementById('runsTitle').closest('section.section'),workspaceHost=make('div');main.append(workspaceHost);const workspace=SHELL_taskWorkspace({host:workspaceHost,groups:[{id:'resumen',label:'Resumen',nodes:[summaryHost,reference]},{id:'calculo',label:'Calcular',nodes:[draftPanel]}],initial:'resumen'});
 const settle=async()=>{for(let i=0;i<12;i++)await SHELL_turn();},reply=async(payload,status=200)=>{assert.ok(pending.length,'Historical request pending');pending.shift().resolve(new Response(JSON.stringify(payload),{status}));await settle();};
 const gate=async(caps=state.authCaps)=>{state.authCaps=[...caps];const source=SHELL_fs.readFileSync(new URL('../assets/internal-capability-gate.js',import.meta.url),'utf8');SHELL_vm.runInContext(source,context,{filename:'actual-internal-capability-gate.js'});await window.MuniControlCapabilityGate.ready;return window.MuniControlCapabilityGate;};
 return{document,main,draft,reference,summaryHost,summary,workspaceHost,workspace,requests,pending,state,window,context,reply,settle,gate,dispose,reload:()=>context.__shellReload(),byId:id=>{const n=document.getElementById(id);assert.ok(n,id);return n;}};
}
function SHELL_reference(status='ready'){
 const closed={month:'2026-09',closureStatus:'closed',arithmeticReconciled:true,executivePublishable:true,contracts:3,grossPayable:1500,employeeWithholdings:125,netPayable:1375,employerCostProxy:1625,employerContributions:125,arithmeticDifference:0,roundingTolerance:0,payrollRunId:'dddddddd-0000-4000-8000-000000000001'};
 const open={month:'2026-10',closureStatus:'open',arithmeticReconciled:false,executivePublishable:false,contracts:4,netPayable:9999,employerCostProxy:9999,payrollRunId:'dddddddd-0000-4000-8000-000000000002'};
 return{ok:true,status,sourcePolicy:{label:'RESPALDO SINTÉTICO DECLARADO',detail:'Referencia incorporada exclusivamente sintética'},latestClosed:closed,currentOpen:open,runs:[closed,open],quality:{ready:true,arithmeticReconciled:true},limitations:['Referencia sintética; no acredita un cálculo propio.']};
}

test('shell independiente conserva ambos accesos canónicos y la denegación ante referencia fallida',async t=>{
 for(const capabilities of [['payroll.read'],['payroll.calculation.read']]){
  const h=SHELL_harness(t);try{
   assert.equal(h.main.hidden,true,'No gate means fail closed');
   const gate=await h.gate(capabilities);assert.equal(h.main.hidden,false,'Either documented page access exposes the workspace while historical fetch is pending');
   assert.deepEqual(h.main.getAttribute('data-requires-any-capability').split(/\s+/),['payroll.read','payroll.calculation.read']);
   assert.match(h.byId('mcCapabilityGateStyle').textContent,/html:not\(\[data-mc-capability-ready="true"\]\) \[data-requires-any-capability\]/);
   gate.apply(h.document,{tenantCapabilities:[]},h.context.location.href);assert.equal(h.main.hidden,true);
   await h.reply({ok:false},503);assert.equal(h.main.hidden,true,'Historical error cannot undo a gate denial');assert.equal(h.main.getAttribute('aria-hidden'),'true');
  }finally{h.dispose();}
 }
});

test('shell independiente mantiene tarea y borrador durante pendiente,503 y Reintentar real',async t=>{
 const h=SHELL_harness(t);await h.gate();const originalTask=h.workspaceHost.dataset.activeTask,originalDraft=h.draft.value;
 assert.equal(originalTask,'calculo');assert.equal(h.main.hidden,false);await h.reply({ok:false},503);
 assert.equal(h.workspaceHost.dataset.activeTask,originalTask);assert.equal(h.draft.value,originalDraft);assert.equal(h.main.hidden,false);assert.equal(h.byId('errorHost').hidden,false);
 assert.equal(h.byId('errorHost').querySelector('h1'),null);assert.ok(h.byId('errorHost').querySelector('h3'));assert.match(h.byId('errorHost').textContent,/503/);
 h.workspace.activate('resumen',true);const retry=h.byId('errorHost').querySelector('button'),operation=retry.emit('click');assert.equal(h.pending.length,1);assert.equal(h.main.hidden,false);assert.equal(h.draft.value,originalDraft);await h.reply({ok:false},503);await operation;assert.equal(h.workspaceHost.dataset.activeTask,'resumen');assert.equal(h.draft.value,originalDraft);
});
test('shell independiente encierra loading,error,estado y fuente dentro del Resumen histórico real',async t=>{
 const h=SHELL_harness(t);await h.gate();for(const id of ['loading','errorHost','overallPanel','sourceChip'])assert.ok(h.reference.contains(h.byId(id)),id+' must move with historical context');
 assert.equal(h.workspace.panels.get('resumen').hidden,true);await h.reply({ok:false},503);assert.ok(h.workspace.panels.get('resumen').contains(h.byId('errorHost')));assert.equal(h.workspace.panels.get('calculo').hidden,false);h.workspace.activate('resumen',true);assert.equal(h.workspace.panels.get('resumen').hidden,false);assert.equal(h.byId('errorHost').hidden,false);
});
test('shell independiente acepta estados históricos NULL documentados sin fabricar cero ni propias',async t=>{
 for(const status of ['not_loaded','incompatible']){const h=SHELL_harness(t);try{await h.gate();await h.reply({...SHELL_reference(),status,latestClosed:null,currentOpen:null,runs:[],quality:{ready:false}});assert.equal(h.byId('errorHost').hidden,true,status);assert.equal(h.byId('closedContracts').textContent,'—');assert.equal(h.byId('closedNet').textContent,'No publicable');assert.equal(h.document.querySelector('[data-reprocessing-run]').options.length,1);assert.equal(h.summaryHost.querySelector('[data-own-summary-count]').textContent,'Sin consulta verificada.');}finally{h.dispose();}}
});
test('shell independiente conserva referencia válida,IDs y bloqueo de importes abiertos sin asumir estado propio',async t=>{
 for(const status of ['ready','needs_review']){const h=SHELL_harness(t);try{await h.gate();const footer=h.main.querySelector('footer').textContent;await h.reply(SHELL_reference(status));assert.equal(h.byId('errorHost').hidden,true);assert.match(h.byId('closedNet').textContent,/1[.\s]?375/);assert.equal(h.document.querySelector('[data-reprocessing-run]').options[1].value,SHELL_reference().latestClosed.payrollRunId);assert.ok(h.byId('runRows').children[1].textContent.includes('Bloqueado'));assert.equal(h.main.querySelector('footer').textContent,footer);assert.equal(h.summaryHost.querySelector('[data-own-summary-count]').textContent,'Sin consulta verificada.');}finally{h.dispose();}}
 const h=SHELL_harness(t);await h.gate();await h.reply({...SHELL_reference('needs_review'),latestClosed:null,currentOpen:null,runs:[],quality:{ready:false}});assert.equal(h.byId('errorHost').hidden,true);
});
test('shell independiente rechaza shapes desconocidos y malformados sin habilitar referencia ni cero',async t=>{
 const bad=[p=>p.status='unknown',p=>p.latestClosed=[],p=>p.currentOpen=[],p=>p.quality=[],p=>p.limitations=[null],p=>p.runs=[null],p=>p.sourcePolicy='',p=>{p.status='not_loaded';p.latestClosed=null;p.currentOpen=null;p.runs=[];p.quality.ready=true;},p=>{p.status='ready';p.latestClosed=null;}];
 for(const mutate of bad){const h=SHELL_harness(t);try{await h.gate();const payload=SHELL_reference();mutate(payload);await h.reply(payload);assert.equal(h.byId('errorHost').hidden,false);assert.equal(h.byId('closedContracts').textContent,'—');assert.equal(h.document.querySelector('[data-reprocessing-run]').options.length,1);assert.equal(h.main.hidden,false);}finally{h.dispose();}}
});
test('shell independiente limpia IDs,importes y calidad al iniciar refresco y conserva borrador si falla',async t=>{
 const h=SHELL_harness(t);await h.gate();await h.reply(SHELL_reference());const select=h.document.querySelector('[data-reprocessing-run]');select.value=SHELL_reference().latestClosed.payrollRunId;const draft=h.draft.value;
 const operation=h.reload();assert.equal(h.pending.length,1);assert.equal(h.main.hidden,false);assert.equal(select.value,'');assert.equal(select.options.length,1);assert.equal(h.byId('closedContracts').textContent,'—');assert.equal(h.byId('qualityList').children.length,0);assert.ok(!h.byId('runRows').textContent.includes('1.375'));assert.equal(h.draft.value,draft);
 await h.reply({ok:false},503);await operation;assert.equal(select.value,'');assert.equal(h.byId('closedNet').textContent,'No publicable');assert.equal(h.byId('qualityList').children.length,0);assert.equal(h.draft.value,draft);assert.equal(h.workspaceHost.dataset.activeTask,'calculo');
});
test('shell independiente permite consulta propia real mientras referencia queda pendiente o503',async t=>{
 const h=SHELL_harness(t,{active:'resumen'});await h.gate();await h.summary.consult();const count=h.summaryHost.querySelector('[data-own-summary-count]');assert.match(count.textContent,/2 corridas propias consultadas/);assert.equal(h.summaryHost.querySelector('[data-own-summary-runs]').children.length,2);
 await h.reply({ok:false},503);assert.match(count.textContent,/2 corridas propias consultadas/);assert.equal(h.main.hidden,false);assert.ok(h.requests.some(r=>r.url==='/api/internal-own-payroll-liquidation?resource=bootstrap'));assert.ok(h.requests.every(r=>r.method==='GET'));
});
test('shell independiente muestra error propio real aunque referencia esté lista y retira datos propios previos',async t=>{
 const h=SHELL_harness(t,{active:'resumen'});await h.gate();await h.reply(SHELL_reference());await h.summary.consult();assert.match(h.summaryHost.querySelector('[data-own-summary-count]').textContent,/2 corridas propias/);const historical=h.byId('closedNet').textContent;h.state.ownStatus=503;await h.summary.consult();
 assert.equal(h.summaryHost.querySelector('[data-own-summary-count]').textContent,'Sin consulta verificada.');assert.equal(h.summaryHost.querySelector('[data-own-summary-runs]').children.length,0);assert.match(h.summaryHost.querySelector('[data-own-summary-status]').textContent,/servicio no completó/);assert.equal(h.byId('closedNet').textContent,historical);assert.equal(h.byId('errorHost').hidden,true);
});
