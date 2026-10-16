// Actual calculation panel, models and child widgets over an in-memory DOM.
// Synthetic HTTP only; layout and real SQL remain separate release checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {mountOwnPayrollRun} from '../assets/own-payroll-run-panel.js';
import {OWN_RUN_PREPARE} from '../assets/own-payroll-run-workspace-model.js';
import {CATALOG_VERSION} from '../assets/native-employment-catalog-model.js';
import {bootstrap,program,uid,hash} from './fixtures/own-payroll-program-synthetic.js';
import {roster} from './fixtures/native-roster-synthetic.js';
import {catalog as classification} from './fixtures/native-employee-synthetic.js';
import {capture} from './fixtures/own-payroll-run-synthetic.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';
import {annulDetail,annulReceipt,afterAnnul} from './fixtures/own-payroll-annulment-synthetic.js';

class Element{
 constructor(tag='div'){this.tagName=tag.toLowerCase();this.children=[];this.parentElement=null;this.attributes={};this.listeners=new Map();this.hidden=false;this.disabled=false;this.checked=false;this.selected=false;this.open=false;this._value=undefined;this._text='';this.isConnected=true;this.dataset=new Proxy({}, {set:(target,key,value)=>{target[key]=String(value);this.attributes['data-'+String(key).replace(/[A-Z]/g,c=>'-'+c.toLowerCase())]=String(value);return true;}});}
 append(...items){for(const item of items){item.parentElement=this;this.children.push(item);}}
 replaceChildren(...items){this.children=[];this._text='';this.append(...items);}
 setAttribute(name,value){this.attributes[name.toLowerCase()]=String(value);if(name==='hidden')this.hidden=true;if(name==='disabled')this.disabled=true;if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;}
 getAttribute(name){return this.attributes[name.toLowerCase()]??null;}
 removeAttribute(name){delete this.attributes[name.toLowerCase()];if(name==='href')delete this.href;}
 get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
 set textContent(value){this._text=String(value);this.children=[];}
 get options(){return this.tagName==='select'?this.children:[];}
 get selectedOptions(){return this.options.filter(o=>o.selected);}
 get value(){return this._value??(this.tagName==='select'?this.children[0]?.value??'':'');}
 set value(value){const s=String(value);this._value=this.tagName==='select'&&!this.children.some(o=>o.value===s)?'':s;}
 focus(){} showModal(){this.open=true;} close(){this.open=false;}
 set innerHTML(html){this.replaceChildren();const stack=[this];for(const token of html.match(/<[^>]*>|[^<]+/g)??[]){if(token.startsWith('</')){stack.pop();continue;}if(token.startsWith('<')){const m=token.match(/^<([a-z][\w-]*)\b([^>]*)>/i);if(!m)continue;const element=new Element(m[1]);for(const a of m[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))element.setAttribute(a[1],a[2]??'');if(element.tagName==='input')element.type=element.getAttribute('type');if(element.tagName==='option')element._value=element.getAttribute('value')??'';stack.at(-1).append(element);if(!['input','link','br','hr','meta'].includes(element.tagName)&&!token.endsWith('/>'))stack.push(element);}else{const text=new Element('#text');text._text=token;stack.at(-1).append(text);}}}
 matches(selector){if(selector.startsWith('#'))return this.getAttribute('id')===selector.slice(1);const attr=selector.match(/^(?:([\w-]+))?\[([\w-]+)(?:="?([^"\]]+)"?)?\]$/);return attr?(!attr[1]||this.tagName===attr[1])&&Object.hasOwn(this.attributes,attr[2])&&(attr[3]===undefined||this.getAttribute(attr[2])===attr[3]):this.tagName===selector;}
 querySelectorAll(selector){const matches=n=>selector.split(',').some(s=>{const parts=s.trim().split(/\s+/);if(!n.matches(parts.pop()))return false;let p=n.parentElement;while(parts.length&&p){if(p.matches(parts.at(-1)))parts.pop();p=p.parentElement;}return !parts.length;}),result=[];const walk=n=>{for(const c of n.children){if(matches(c))result.push(c);walk(c);}};walk(this);return result;}
 querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
 addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(fn);}
 removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)??[]).filter(f=>f!==fn));}
 async emit(type){for(let n=this;n;n=n.parentElement)if(n.disabled)return;await Promise.all((this.listeners.get(type)??[]).map(fn=>fn({target:this,preventDefault(){}})));}
}
const events=()=>{const listeners=new Map();return{addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},removeEventListener(type,fn){listeners.set(type,(listeners.get(type)??[]).filter(f=>f!==fn));},dispatch(type,detail){for(const fn of listeners.get(type)??[])fn({detail});}};};
const approved=()=>({version:hash('b'),revision:1,definition:program(),salaryVersion:hash('c'),proposalId:uid(1),approvalId:uid(2)});
const ownRoster=count=>{const n=roster(count);n.version='native-roster.v2';n.counts.unknown=0;n.rows=n.rows.map(r=>({...r,recordKind:'hire'}));return n;};
const settle=()=>new Promise(resolve=>setImmediate(resolve));

function harness(t){
 const host=new Element(),docEvents=events(),winEvents=events(),requests=[],names=['document','window','fetch','setTimeout','clearTimeout','setInterval','clearInterval'],before=new Map(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));
 const state={annul:null,lookup:null,caps:[...OWN_RUN_PREPARE],sessionId:uid(30),program:bootstrap({program:approved()}),catalogItems:classification.items,roster:ownRoster(1),readFailure:null,readThrow:null,malformedRoster:false,authFailure:null,postFailure:true,hold:null,receipt:null};
 const document={...docEvents,hidden:false,head:new Element('head'),body:new Element('body'),createElement:tag=>new Element(tag),querySelectorAll:()=>[],getElementById:()=>null};
 Object.assign(globalThis,{document,window:winEvents,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){}});
 globalThis.fetch=async(url,options={})=>{
  const method=options.method??'GET',request={url,method,body:options.body??null,key:options.headers?.['Idempotency-Key']??null};requests.push(request);
  if(state.hold?.url===url)await state.hold.wait;
  let status=200,payload;
  if(url==='/api/internal-auth'){if(state.authFailure){status=state.authFailure;payload={ok:false,code:'SYNTHETIC_SESSION_UNAVAILABLE'};}else payload={ok:true,authenticated:true,sessionVersion:2,user:{id:state.sessionId,email:'synthetic-readiness@example.invalid'},access:{context:'tenant',tenant:{id:roster(1).scope.tenantId,roleKey:'QA'},tenantCapabilities:state.caps},expiresAt:new Date(Date.now()+3600000).toISOString()};}
  else if(method==='POST'){if(state.postFailure){status=503;payload={ok:false,code:'OWN_RUN_BUSY'};}else{const body=JSON.parse(options.body).payload,c=capture({version:'own-payroll-run.v2',key:request.key,body,bodySha256:ownRunHash(body)});state.receipt=c;payload={ok:true,data:c};}}
  else if(url.startsWith('/api/internal-own-payroll-run?resource=attempt')){if(state.receipt)payload={ok:true,data:state.receipt};else{status=404;payload={ok:false,code:'OWN_RUN_NOT_FOUND'};}}
  else if(url.startsWith('/api/internal-own-payroll-run?'))payload={ok:true,data:{version:'own-payroll-bootstrap.v2',scopeVersion:hash('a'),programVersion:hash('b'),canCalculate:true,runs:[],complete:true}};
  else if(url==='/api/internal-employment-catalog?resource=bootstrap')payload={ok:true,data:{version:CATALOG_VERSION,scopeVersion:hash('a'),catalog:{items:state.catalogItems.map((r,i)=>({...r,key:'synthetic-'+i,agreementCode:r.agreementCode??null})),version:hash('d'),origin:'GRH',revision:0,publishedAt:null},permissions:{canPropose:true,canReview:true},proposals:[],historyTruncated:false}};
  else if(url==='/api/internal-own-payroll-program?resource=bootstrap')payload={ok:true,data:state.program};
  else if(url.startsWith('/api/internal-own-payroll-annulment?resource=attempt')){assert.ok(state.annul);payload={ok:true,data:state.annul.receipt};}
  else if(url.startsWith('/api/internal-own-payroll-annulment?resource=detail')){assert.ok(state.annul);payload={ok:true,data:state.annul.detail};}
  else if(url.startsWith('/api/internal-data?resource=employees')){assert.ok(state.lookup,'Explicit synthetic directory fixture');payload=state.lookup;}
  else if(url.startsWith('/api/internal-data?resource=nativeroster')){if(state.readThrow)throw state.readThrow;if(state.malformedRoster)return new Response('not JSON');if(state.readFailure){status=state.readFailure.status;payload={ok:false,code:state.readFailure.code};}else payload={ok:true,data:state.roster};}
  else assert.fail('Unexpected synthetic HTTP '+url);
  return new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json'}});
 };
 const mounted=mountOwnPayrollRun(host),q=key=>{const value=host.querySelector('[data-own-'+key+']');assert.ok(value,'Actual panel control '+key);return value;};
 const idle=async()=>{const deadline=performance.now()+5000;while(host.getAttribute('aria-busy')!=='false'){if(performance.now()>=deadline)assert.fail('Panel did not settle within 5s; status: '+q('status').textContent+'; preparation: '+q('readiness-title').textContent);await delay(5);}};
 const start=async()=>{docEvents.dispatch('taskchange',{id:'calculo'});await idle();};
 const prepare=async()=>{q('period').value='2026-10';q('date').value='2026-10-31';q('type').value='monthly';q('kind').value='all';await q('kind').emit('change');q('confirm').checked=true;await q('confirm').emit('change');};
 const submit=async()=>{await q('form').emit('submit');await idle();};
 t.after(()=>{winEvents.dispatch('pagehide');for(const [key,descriptor]of before)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
 return {state,requests,q,host,start,idle,prepare,submit,refresh:mounted.refresh,queuePreparation:mounted.queuePreparation,event:docEvents.dispatch,document};
}

test('permiso de calcular con cero legajos propios no habilita el botón ni una captura',async t=>{
 const h=harness(t);h.state.roster=ownRoster(0);h.state.program=bootstrap({salaryCatalog:{version:hash('c'),revision:0,items:[]}});await h.start();
 assert.equal(h.q('fields').disabled,true);assert.equal(h.q('send').disabled,true);assert.equal(h.q('send').hidden,true);assert.match(h.q('readiness-title').textContent,/incorporar el padrón propio/);assert.equal(h.q('readiness-link').href,'/personal?adopcion=pendientes#legajos');assert.match(h.q('readiness-facts').textContent,/0 legajos propios/);
 await h.submit();assert.equal(h.requests.filter(r=>r.method==='POST').length,0);assert.equal(h.q('recover').hidden,true);
});
test('maestro pendiente y programa pendiente muestran su paso real, sin aprobarlos en pantalla',async t=>{
 const h=harness(t);h.state.program=bootstrap({salaryCatalog:{version:hash('c'),revision:0,items:[]}});await h.start();assert.equal(h.q('readiness-link').href,'/nomina#parametros');assert.equal(h.q('fields').disabled,true);
 h.state.program=bootstrap();await h.refresh();assert.equal(h.q('readiness-link').href,'/nomina#reglas');assert.match(h.q('readiness-facts').textContent,/programa sin aprobación/);assert.equal(h.q('send').disabled,true);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
});
test('error de servicio, capacidad, aborto, JSON inválido y filtro se muestran sin verificar, nunca como cero',async t=>{
 const h=harness(t);await h.start();assert.equal(h.q('fields').disabled,false);
 for(const failure of [{status:503,code:'UNAVAILABLE'},{status:422,code:'NATIVE_ROSTER_LIMIT'}]){h.state.readFailure=failure;await h.refresh();assert.match(h.q('readiness-facts').textContent,/sin verificar/);assert.doesNotMatch(h.q('readiness-facts').textContent,/0 legajos/);assert.equal(h.q('readiness-link').hidden,true);assert.equal(h.q('readiness-check').hidden,false);assert.equal(h.q('fields').disabled,true);}
 h.state.readFailure=null;h.state.readThrow=Object.assign(Error('Synthetic aborted response'),{name:'AbortError'});await h.refresh();assert.match(h.q('readiness-facts').textContent,/sin verificar/);assert.equal(h.q('fields').disabled,true);h.state.readThrow=null;
 h.state.malformedRoster=true;await h.refresh();assert.match(h.q('readiness-facts').textContent,/sin verificar/);assert.equal(h.q('fields').disabled,true);h.state.malformedRoster=false;
 h.state.roster={...ownRoster(0),filters:{...ownRoster(0).filters,search:'NO COINCIDE'}};await h.refresh();assert.match(h.q('readiness-facts').textContent,/sin verificar/);assert.equal(h.q('send').disabled,true);
});
test('la consulta verifica lista propia completa, conserva alcance explícito y vuelve a leer antes del POST',async t=>{
 const h=harness(t);h.state.postFailure=false;await h.start();await h.prepare();assert.equal(h.q('send').disabled,false);await h.submit();
 const reads=h.requests.filter(r=>r.url.startsWith('/api/internal-data?resource=nativeroster'));assert.equal(reads.length,2);for(const r of reads){const q=new URL(r.url,'https://example.invalid').searchParams;assert.equal(q.get('schema'),'2');assert.equal(q.get('status'),'all');for(const field of ['search','jurisdiction','organization','sector','agreement'])assert.equal(q.get(field),'');}
 const post=h.requests.find(r=>r.method==='POST'),body=JSON.parse(post.body).payload;assert.deepEqual(body.selection,{kind:'all',values:[]});assert.equal(body.populationDomain,'native_registered');assert.equal(body.liquidationDate,'2026-10-31');assert.equal(h.q('recover').hidden,false);assert.match(h.q('status').textContent,/Captura recuperada/);
});
test('si cambia padrón o reglas después de revisar, no crea clave ni captura hasta nueva revisión',async t=>{
 const h=harness(t);await h.start();await h.prepare();h.state.roster.snapshot=hash('e');await h.submit();assert.equal(h.q('confirm').checked,false);assert.match(h.q('status').textContent,/Cambió el padrón o el programa/);assert.equal(h.q('recover').hidden,true);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
 await h.prepare();h.state.program=bootstrap();await h.submit();assert.equal(h.q('fields').disabled,false);assert.equal(h.q('confirm').disabled,true);assert.equal(h.q('send').disabled,true);assert.equal(h.q('readiness-link').href,'/nomina#reglas');assert.equal(h.q('recover').hidden,true);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
});
test('consulta y reintento existentes conservan clave y cuerpo aunque el padrón actual esté vacío',async t=>{
 const h=harness(t);await h.start();await h.prepare();await h.submit();const first=h.requests.find(r=>r.method==='POST');assert.ok(first);h.state.roster=ownRoster(0);h.state.program=bootstrap();await h.refresh();
 assert.equal(h.q('recover').disabled,false);assert.equal(h.q('send').disabled,false);assert.equal(h.q('fields').disabled,true);assert.equal(h.q('readiness').hidden,true);
 await h.q('recover').emit('click');await h.idle();assert.equal(h.requests.at(-1).url,'/api/internal-own-payroll-run?resource=attempt&key='+first.key);
 const before=h.requests.filter(r=>r.url.startsWith('/api/internal-data?resource=nativeroster')).length;await h.submit();const posts=h.requests.filter(r=>r.method==='POST');assert.equal(posts.length,2);assert.equal(posts[1].key,first.key);assert.equal(posts[1].body,first.body);assert.equal(h.requests.filter(r=>r.url.startsWith('/api/internal-data?resource=nativeroster')).length,before);
 await h.q('revise').emit('click');await h.idle();assert.equal(h.q('recover').hidden,true);assert.equal(h.q('send').disabled,true);assert.equal(h.q('readiness-link').href,'/personal?adopcion=pendientes#legajos');
});
test('respuesta tardía después de ocultar la página no restituye datos ni preparación',async t=>{
 const h=harness(t);await h.start();let resolve;h.state.hold={url:'/api/internal-own-payroll-program?resource=bootstrap',wait:new Promise(r=>{resolve=r;})};const pending=h.refresh();await settle();h.document.hidden=true;h.event('visibilitychange');resolve();await pending;
 assert.equal(h.q('fields').disabled,true);assert.match(h.q('readiness-facts').textContent,/sin verificar/);assert.equal(h.q('readiness-link').hidden,true);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
});
test('otra sesión o permiso retirado no recupera la habilitación de preparar',async t=>{
 const h=harness(t);await h.start();h.state.sessionId=uid(31);await h.refresh();assert.equal(h.q('fields').disabled,true);assert.match(h.q('readiness-facts').textContent,/sin verificar/);
 h.state.sessionId=uid(30);await h.refresh();h.event('municontrol:capabilities-ready',{tenantCapabilities:h.state.caps.filter(c=>c!=='payroll.calculation.prepare')});assert.equal(h.q('fields').disabled,true);assert.equal(h.q('send').disabled,true);
});

test('volver visible revalida sólo GET y restaura fecha y reparticiones del borrador después del permiso fresco',async t=>{
 const h=harness(t);await h.start();await h.prepare();h.q('kind').value='departments';await h.q('kind').emit('change');assert.ok(h.q('codes').options.length);h.q('codes').options[0].selected=true;const selected=h.q('codes').selectedOptions.map(o=>o.value),before=h.requests.length;h.q('confirm').checked=true;
 h.document.hidden=true;h.event('visibilitychange');assert.equal(h.q('result').hidden,true);assert.equal(h.q('history').children.length,0);assert.equal(h.q('date').value,'');assert.equal(h.q('readiness-check').disabled,true);
 h.document.hidden=false;h.event('visibilitychange');await h.idle();
 assert.equal(h.q('fields').disabled,false);assert.equal(h.q('readiness-check').disabled,false);assert.equal(h.q('period').value,'2026-10');assert.equal(h.q('date').value,'2026-10-31');assert.equal(h.q('kind').value,'departments');assert.deepEqual(h.q('codes').selectedOptions.map(o=>o.value),selected);assert.equal(h.q('confirm').checked,false);assert.equal(h.q('send').disabled,true);
 const reads=h.requests.slice(before);assert.equal(reads.filter(r=>r.url==='/api/internal-auth').length,2);assert.ok(reads.some(r=>r.url.startsWith('/api/internal-data?resource=nativeroster')));assert.ok(reads.every(r=>r.method==='GET'));assert.ok(reads.every(r=>!r.url.includes('resource=attempt')&&!r.url.includes('resource=detail')));
});
test('un envío incierto conserva cuerpo y clave al volver visible y nunca se reintenta automáticamente',async t=>{
 const h=harness(t);await h.start();await h.prepare();await h.submit();const first=h.requests.find(r=>r.method==='POST');assert.ok(first);const count=h.requests.length;
 h.document.hidden=true;h.event('visibilitychange');h.state.roster=ownRoster(0);h.state.program=bootstrap();h.document.hidden=false;h.event('visibilitychange');await h.idle();
 const automatic=h.requests.slice(count);assert.ok(automatic.every(r=>r.method==='GET'));assert.ok(automatic.every(r=>!r.url.includes('resource=attempt')&&!r.url.includes('resource=detail')));assert.equal(h.requests.filter(r=>r.method==='POST').length,1);assert.equal(h.q('recover').disabled,false);assert.equal(h.q('fields').disabled,true);
 await h.submit();const posts=h.requests.filter(r=>r.method==='POST');assert.equal(posts.length,2);assert.equal(posts[1].key,first.key);assert.equal(posts[1].body,first.body);
});
test('fallo de acceso al regresar deja alternativa manual y restaura el borrador sólo tras otra respuesta autorizada',async t=>{
 const h=harness(t);await h.start();await h.prepare();h.document.hidden=true;h.event('visibilitychange');h.state.authFailure=503;h.document.hidden=false;h.event('visibilitychange');await h.idle();
 assert.equal(h.q('fields').disabled,true);assert.equal(h.q('readiness-check').disabled,true);assert.equal(h.q('refresh').disabled,false);assert.match(h.q('readiness-facts').textContent,/sin verificar/);assert.equal(h.q('date').value,'');
 h.state.authFailure=null;await h.q('refresh').emit('click');await h.idle();assert.equal(h.q('fields').disabled,false);assert.equal(h.q('date').value,'2026-10-31');assert.equal(h.q('confirm').checked,false);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
});
test('otra cuenta o permiso nominal retirado no restaura el borrador de la sesión anterior',async t=>{
 const h=harness(t);await h.start();await h.prepare();h.document.hidden=true;h.event('visibilitychange');h.state.sessionId=uid(31);h.document.hidden=false;h.event('visibilitychange');await h.idle();
 assert.equal(h.q('date').value,'');assert.equal(h.q('confirm').checked,false);assert.equal(h.q('chips').children.length,0);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
 await h.prepare();h.document.hidden=true;h.event('visibilitychange');h.state.caps=h.state.caps.filter(c=>c!=='payroll.calculation.nominal.read');h.document.hidden=false;h.event('visibilitychange');await h.idle();assert.equal(h.q('fields').disabled,true);assert.equal(h.q('date').value,'');assert.equal(h.q('download').disabled,true);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
});
test('respuesta anterior al ocultamiento no sobrescribe una revalidación nueva ni publica datos fuera de la tarea',async t=>{
 const h=harness(t);await h.start();await h.prepare();let release;h.state.hold={url:'/api/internal-auth',wait:new Promise(resolve=>{release=resolve;})};const prior=h.refresh();await settle();h.document.hidden=true;h.event('visibilitychange');h.document.hidden=false;h.event('visibilitychange');release();await prior;await h.idle();
 assert.equal(h.q('fields').disabled,false);assert.equal(h.q('date').value,'2026-10-31');assert.equal(h.q('confirm').checked,false);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
 const before=h.requests.length;h.event('taskchange',{id:'recibos'});h.document.hidden=true;h.event('visibilitychange');h.document.hidden=false;h.event('visibilitychange');await settle();assert.equal(h.requests.length,before);assert.equal(h.q('result').hidden,true);
});

test('un código retirado del catálogo fresco impide restaurar una parte de la selección anterior',async t=>{
 const h=harness(t);await h.start();await h.prepare();h.q('kind').value='departments';await h.q('kind').emit('change');assert.ok(h.q('codes').options.length);const removed=h.q('codes').options[0].value;h.q('codes').options[0].selected=true;
 h.document.hidden=true;h.event('visibilitychange');h.state.catalogItems=h.state.catalogItems.filter(item=>item.kind!=='sectors'||item.code!==removed);h.document.hidden=false;h.event('visibilitychange');await h.idle();
 assert.equal(h.q('date').value,'2026-10-31');assert.equal(h.q('kind').value,'departments');assert.equal(h.q('codes').selectedOptions.length,0);assert.equal(h.q('confirm').checked,false);assert.equal(h.q('send').disabled,true);assert.match(h.q('status').textContent,/selección anterior cambió/);assert.match(h.q('status').textContent,/No se seleccionó una parte/);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
});

test('una preparación encolada mientras está oculta no provoca lectura nominal automática al regresar',async t=>{
 const h=harness(t);await h.start();await h.prepare();h.document.hidden=true;h.event('visibilitychange');const accessKey=JSON.stringify([h.state.sessionId,'synthetic-readiness@example.invalid',roster(1).scope.tenantId,'QA']);assert.equal(h.queuePreparation({kind:'consolidated',liquidationDate:null,key:uid(61),accessKey}),true);const before=h.requests.length;
 h.document.hidden=false;h.event('visibilitychange');await h.idle();const automatic=h.requests.slice(before);assert.ok(automatic.length>0);assert.ok(automatic.every(r=>r.method==='GET'));assert.ok(automatic.every(r=>!r.url.includes('resource=attempt')&&!r.url.includes('resource=detail')));assert.ok(automatic.every(r=>!r.url.includes('internal-own-payroll-annulment')&&!r.url.includes('internal-own-payroll-liquidation')));assert.equal(h.requests.filter(r=>r.method==='POST').length,0);assert.equal(h.q('date').value,'2026-10-31');assert.equal(h.q('confirm').checked,false);
});


test('851 propios verificados y programa cero permiten borrador completo sin clave, ACK ni POST',async t=>{
 const h=harness(t);h.state.program=bootstrap();h.state.roster=ownRoster(851);h.state.roster.rows[0].recordKind='adopted';h.state.roster.rows[0].sexCode='Femenino';h.state.roster.rows[1].recordKind='adopted';h.state.roster.rows[1].sexCode='Masculino';await h.start();
 assert.match(h.q('readiness-facts').textContent,/851 legajos propios/);assert.match(h.q('readiness-facts').textContent,/programa sin aprobación/);assert.match(h.q('readiness-description').textContent,/borrador/);assert.equal(h.q('fields').disabled,false);assert.equal(h.q('confirm').disabled,true);assert.equal(h.q('send').hidden,false);assert.equal(h.q('send').disabled,true);
 h.q('period').value='2026-10';await h.q('period-end').emit('click');assert.equal(h.q('date').value,'2026-10-31');h.q('type').value='monthly';h.q('kind').value='departments';await h.q('kind').emit('change');assert.ok(h.q('codes').options.length);h.q('codes').options[0].selected=true;await h.q('codes').emit('change');assert.equal(h.q('codes').selectedOptions.length,1);
 // A forged DOM checkbox/submission still cannot cross the unchanged canStart gate.
 h.q('confirm').checked=true;await h.submit();assert.equal(h.requests.filter(r=>r.method==='POST').length,0);assert.equal(h.q('recover').hidden,true);
 h.q('kind').value='all';await h.q('kind').emit('change');assert.match(h.q('scope').textContent,/verificará la elegibilidad/);assert.equal(h.q('confirm').checked,false);assert.equal(h.q('send').disabled,true);
});

test('picker real selecciona un legajo propio sin programa; histórico sigue bloqueado y no calcula',async t=>{
 const h=harness(t);h.state.program=bootstrap();h.state.roster=ownRoster(851);const r=h.state.roster.rows[0];
 h.state.lookup={ok:true,version:'employee-picker.v1',data:[{contractId:r.contractId,legajo:r.legajo,nombre:r.name,sector:r.sector,convenio:r.agreement,activo:true,statusSnapshotDate:'2026-10-14',recordOrigin:'MUNICONTROL'},{contractId:uid(888),legajo:'99999',nombre:'HISTÓRICO SINTÉTICO QA',sector:'REPARTICIÓN QA',convenio:'CONVENIO QA',activo:true,statusSnapshotDate:'2026-10-14',recordOrigin:'GRH'}],pagination:{page:1,limit:20,total:2,pages:1},scope:{status:'administrative_active',payrollEligibilityCertified:false,sourceCutoffFrom:'2026-10-14',sourceCutoffTo:'2026-10-14'}};
 await h.start();h.q('kind').value='contracts';await h.q('kind').emit('change');await h.q('picker').emit('click');const dialog=h.document.body.querySelector('dialog');assert.equal(dialog.open,true);dialog.querySelector('#ownRunPickerSearch').value='QA';await dialog.querySelector('[data-picker-form]').emit('submit');for(let i=0;i<20&&dialog.querySelector('[data-picker-form]').getAttribute('aria-busy')!=='false';i++)await settle();
 const rows=dialog.querySelectorAll('[data-picker-results] input');assert.equal(rows.length,2);assert.equal(rows[0].disabled,false);assert.equal(rows[1].disabled,true);rows[0].checked=true;await rows[0].emit('change');assert.equal(dialog.querySelector('[data-picker-apply]').disabled,false);await dialog.querySelector('[data-picker-apply]').emit('click');assert.equal(dialog.open,false);assert.match(h.q('chips').textContent,new RegExp(r.legajo));assert.match(h.q('scope').textContent,/1 legajos propios elegidos/);assert.equal(h.q('confirm').disabled,true);assert.equal(h.q('send').disabled,true);await h.submit();assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
});

test('aprobación posterior conserva borrador completo y exige revisión manual antes de POST fresco',async t=>{
 const h=harness(t);h.state.program=bootstrap();h.state.postFailure=false;await h.start();await h.prepare();h.q('kind').value='departments';await h.q('kind').emit('change');h.q('codes').options[0].selected=true;const codes=h.q('codes').selectedOptions.map(o=>o.value);h.state.program=bootstrap({program:approved()});await h.refresh();
 assert.equal(h.q('period').value,'2026-10');assert.equal(h.q('date').value,'2026-10-31');assert.equal(h.q('type').value,'monthly');assert.equal(h.q('kind').value,'departments');assert.deepEqual(h.q('codes').selectedOptions.map(o=>o.value),codes);assert.equal(h.q('confirm').disabled,false);assert.equal(h.q('confirm').checked,false);assert.equal(h.q('send').disabled,true);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
 h.q('confirm').checked=true;await h.q('confirm').emit('change');assert.equal(h.q('send').disabled,false);const before=h.requests.length;await h.submit();const posts=h.requests.filter(r=>r.method==='POST');assert.equal(posts.length,1);assert.deepEqual(JSON.parse(posts[0].body).payload.selection,{kind:'departments',values:codes});assert.ok(h.requests.slice(before).some(r=>r.url.startsWith('/api/internal-data?resource=nativeroster')));
});

test('borrador sin programa se retira al ocultar; sólo vuelve tras padrón y acceso completos frescos',async t=>{
 const h=harness(t);h.state.program=bootstrap();await h.start();await h.prepare();h.q('kind').value='departments';await h.q('kind').emit('change');h.q('codes').options[0].selected=true;const code=h.q('codes').options[0].value;h.document.hidden=true;h.event('visibilitychange');assert.equal(h.q('chips').children.length,0);assert.equal(h.q('date').value,'');assert.equal(h.q('fields').disabled,true);h.document.hidden=false;h.event('visibilitychange');await h.idle();
 assert.equal(h.q('date').value,'2026-10-31');assert.deepEqual(h.q('codes').selectedOptions.map(o=>o.value),[code]);assert.equal(h.q('fields').disabled,false);assert.equal(h.q('confirm').disabled,true);assert.equal(h.q('confirm').checked,false);assert.equal(h.q('send').disabled,true);
 h.state.roster={...ownRoster(851),complete:false};await h.refresh();assert.equal(h.q('fields').disabled,true);assert.match(h.q('readiness-facts').textContent,/sin verificar/);await h.submit();assert.equal(h.q('recover').hidden,true);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
});

test('cuenta distinta y revocación parcial retiran borrador y picker aun sin programa',async t=>{
 const h=harness(t);h.state.program=bootstrap();await h.start();await h.prepare();h.document.hidden=true;h.event('visibilitychange');h.state.sessionId=uid(31);h.document.hidden=false;h.event('visibilitychange');await h.idle();assert.equal(h.q('date').value,'');assert.equal(h.q('confirm').checked,false);assert.equal(h.q('send').disabled,true);
 assert.equal(h.q('fields').disabled,false);h.event('municontrol:capabilities-ready',{tenantCapabilities:h.state.caps.filter(c=>c!=='payroll.calculation.prepare')});assert.equal(h.q('fields').disabled,true);await h.q('picker').emit('click');assert.equal(h.document.body.querySelector('dialog').open,false);await h.submit();assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
});

test('programa pendiente no consume contexto externo ni consulta intentos o detalles nominales',async t=>{
 const h=harness(t);h.state.program=bootstrap();await h.start();const accessKey=JSON.stringify([h.state.sessionId,'synthetic-readiness@example.invalid',roster(1).scope.tenantId,'QA']);assert.equal(h.queuePreparation({kind:'consolidated',liquidationDate:null,key:uid(61),accessKey}),true);const before=h.requests.length;await h.refresh();assert.equal(h.q('fields').disabled,false);assert.equal(h.q('confirm').disabled,true);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);assert.ok(h.requests.slice(before).every(r=>!r.url.includes('resource=attempt')&&!r.url.includes('resource=detail')&&!r.url.includes('internal-own-payroll-annulment')&&!r.url.includes('internal-own-payroll-liquidation')));
});


test('contexto externo espera reglas y, tras aceptación real, reemplaza el borrador sin reaparecer después',async t=>{
 const h=harness(t),d=annulDetail(1),r=annulReceipt(d);h.state.annul={receipt:r,detail:afterAnnul(d,r)};h.state.program=bootstrap();const selected=r.affected[0],employee=d.runs.find(run=>run.id===selected.runId).capture.saved.input.employees.find(e=>e.contractId===selected.contractId);h.state.roster.rows[0].contractId=selected.contractId;h.state.roster.rows[0].legajo=employee.employeeNumber;
 await h.start();await h.prepare();h.q('period').value='2026-11';h.q('date').value='2026-11-30';const accessKey=JSON.stringify([h.state.sessionId,'synthetic-readiness@example.invalid',roster(1).scope.tenantId,'QA']);assert.equal(h.queuePreparation({kind:'consolidated',liquidationDate:'2026-10-31',key:r.key,accessKey}),true);await h.refresh();assert.equal(h.q('period').value,'2026-11');assert.equal(h.requests.filter(req=>req.url.includes('internal-own-payroll-annulment')).length,0);
 h.state.program=bootstrap({program:approved()});await h.refresh();assert.equal(h.requests.filter(req=>req.url.includes('internal-own-payroll-annulment')).length,2);assert.equal(h.q('period').value,'2026-10');assert.equal(h.q('date').value,'2026-10-31');assert.equal(h.q('kind').value,'contracts');assert.match(h.q('chips').textContent,new RegExp(employee.employeeNumber));assert.equal(h.q('confirm').checked,false);
 await h.refresh();assert.equal(h.q('period').value,'2026-10');assert.equal(h.q('date').value,'2026-10-31');assert.equal(h.q('kind').value,'contracts');assert.match(h.q('chips').textContent,new RegExp(employee.employeeNumber));assert.equal(h.q('confirm').checked,false);assert.equal(h.requests.filter(req=>req.method==='POST').length,0);
});
