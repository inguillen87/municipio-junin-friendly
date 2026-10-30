// PROPOSED by Claude (R3; source only; not run by Claude). Target: tests/own-payroll-zero-difference-panel.test.js
// Causal UI tests on the REAL calculation panel (mountOwnPayrollRun) over the same in-memory DOM and synthetic HTTP
// used by tests/own-payroll-readiness-panel.test.js, with the existing own-payroll-run-synthetic capture + saved
// fixtures (engine-produced, genuinely hashed). They pass only once root applies the panel operation of
// SOURCE_DELTA.json. No SQL, server, payroll execution or municipal acceptance is implied.
import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {mountOwnPayrollRun} from '../assets/own-payroll-run-panel.js';
import {OWN_RUN_PREPARE,formatOwnRunDecimal} from '../assets/own-payroll-run-workspace-model.js';
import {CATALOG_VERSION} from '../assets/native-employment-catalog-model.js';
import {ownZeroDifferenceMoney} from '../assets/own-payroll-zero-difference.js';
import {decimal,exactAdd,quantize} from '../assets/own-payroll-exact.js';
import {bootstrap,program,uid,hash} from './fixtures/own-payroll-program-synthetic.js';
import {roster} from './fixtures/native-roster-synthetic.js';
import {catalog as classification} from './fixtures/native-employee-synthetic.js';
import {capture,saved} from './fixtures/own-payroll-run-synthetic.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';

// The DOM shim, event bus, roster helpers and harness are those of own-payroll-readiness-panel.test.js, verbatim,
// except that the synthetic POST answers with a SAVED capture shaped by state.shape (identity by default).
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
 const state={annul:null,lookup:null,caps:[...OWN_RUN_PREPARE],sessionId:uid(30),program:bootstrap({program:approved()}),catalogItems:classification.items,roster:ownRoster(1),readFailure:null,readThrow:null,malformedRoster:false,authFailure:null,postFailure:false,hold:null,receipt:null,shape:s=>s};
 let clock=0,timerId=0;const deadlines=new Map(),advance=ms=>{clock+=ms;for(const[id,t]of [...deadlines])if(t.at<=clock){deadlines.delete(id);t.fn();}};
 const document={...docEvents,hidden:false,head:new Element('head'),body:new Element('body'),createElement:tag=>new Element(tag),querySelectorAll:()=>[],getElementById:()=>null};
 Object.assign(globalThis,{document,window:winEvents,setTimeout:(fn,ms)=>{const id=++timerId;deadlines.set(id,{at:clock+ms,fn});return id;},clearTimeout:id=>deadlines.delete(id),setInterval:()=>1,clearInterval(){}});
 globalThis.fetch=async(url,options={})=>{
  const method=options.method??'GET',request={url,method,body:options.body??null,key:options.headers?.['Idempotency-Key']??null};requests.push(request);
  if(state.readStepMs?.length){advance(state.readStepMs.shift());if(options.signal?.aborted)throw new DOMException('Synthetic single HTTP deadline','AbortError');}
  if(state.hold?.url===url)await state.hold.wait;
  let status=200,payload;
  if(url==='/api/internal-auth'){if(state.authFailure){status=state.authFailure;payload={ok:false,code:'SYNTHETIC_SESSION_UNAVAILABLE'};}else payload={ok:true,authenticated:true,sessionVersion:2,user:{id:state.sessionId,email:'synthetic-readiness@example.invalid'},access:{context:'tenant',tenant:{id:roster(1).scope.tenantId,roleKey:'QA'},tenantCapabilities:state.caps},expiresAt:new Date(Date.now()+3600000).toISOString()};}
  else if(method==='POST'){const body=JSON.parse(options.body).payload,c=capture({version:'own-payroll-run.v2',key:request.key,body,bodySha256:ownRunHash(body)});c.saved=state.shape(saved(c));state.receipt=c;payload={ok:true,data:c};}
  else if(url.startsWith('/api/internal-own-payroll-run?resource=attempt')){if(state.receipt)payload={ok:true,data:state.receipt};else{status=404;payload={ok:false,code:'OWN_RUN_NOT_FOUND'};}}
  else if(url.startsWith('/api/internal-own-payroll-run?'))payload={ok:true,data:{version:'own-payroll-bootstrap.v2',scopeVersion:hash('a'),programVersion:hash('b'),canCalculate:true,runs:[],complete:true}};
  else if(url==='/api/internal-employment-catalog?resource=bootstrap')payload={ok:true,data:{version:CATALOG_VERSION,scopeVersion:hash('a'),catalog:{items:state.catalogItems.map((r,i)=>({...r,key:'synthetic-'+i,agreementCode:r.agreementCode??null})),version:hash('d'),origin:'GRH',revision:0,publishedAt:null},permissions:{canPropose:true,canReview:true},proposals:[],historyTruncated:false}};
  else if(url==='/api/internal-own-payroll-program?resource=bootstrap')payload={ok:true,data:state.program};
  else if(url.startsWith('/api/internal-own-payroll-annulment?resource=attempt')){assert.ok(state.annul);payload={ok:true,data:state.annul.receipt};}
  else if(url.startsWith('/api/internal-own-payroll-annulment?resource=detail')){assert.ok(state.annul);payload={ok:true,data:state.annul.detail};}
  else if(url.startsWith('/api/internal-own-payroll-annulment?resource=review')){assert.ok(state.annul);assert.equal(url,'/api/internal-own-payroll-annulment?resource=review&period='+state.annul.detail.period+'&liquidationType='+state.annul.detail.liquidationType);payload={ok:true,data:state.annul.index};}
  else if(url.startsWith('/api/internal-own-payroll-liquidation?resource=detail')){assert.ok(state.annul);const run=state.annul.detail.runs.find(run=>url==='/api/internal-own-payroll-liquidation?resource=detail&id='+run.id);assert.ok(run,'Requested individual detail belongs to the complete synthetic annulment census');payload={ok:true,data:run};}
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
 return {state,requests,q,host,start,idle,prepare,submit,refresh:mounted.refresh,queuePreparation:mounted.queuePreparation,event:docEvents.dispatch,document,now:()=>clock};
}

// A saved result "shaped" by the synthetic server: the pins are recomputed, so the panel verifies real hashes.
const plusOneCent=s=>{const m=structuredClone(s),t=m.result.employeeTotals[0];t.net=quantize(exactAdd(decimal(t.net),decimal('0.01')),{precision:m.input.totalsPrecision,mode:'exact'}).amount;m.resultSha256=ownRunHash(m.result);return m;};
const zeroLines=h=>h.q('trace').children.filter(n=>n.tagName==='dd'&&n.dataset.zeroDifference!==undefined);
const traceTitles=h=>h.q('trace').children.filter(n=>n.tagName==='dt').map(n=>n.textContent);

test('conciliado visible: el panel real muestra el estado derivado de la captura verificada, después de la integridad y sin esperar nada',async t=>{
 const h=harness(t);await h.start();await h.prepare();await h.submit();
 assert.equal(h.q('result').hidden,false);assert.match(h.q('status').textContent,/Resultado guardado y recuperable/);
 const titles=traceTitles(h);assert.equal(titles.filter(x=>x==='Conciliación de la captura').length,1);
 assert.ok(titles.indexOf('Integridad del resultado')<titles.indexOf('Conciliación de la captura'));
 const lines=zeroLines(h);assert.ok(lines.length>=3);
 assert.equal(lines[0].textContent,'Conciliado · 2 legajos, 12 conceptos · captura completa del alcance guardado: todos · hash verificado');
 assert.ok(lines.every(n=>n.dataset.zeroDifference==='reconciled'));
 assert.ok(lines.some(n=>n.textContent.startsWith('Compatibilidad con el instrumento de pago: se comprueba en la emisión bancaria')));
 assert.ok(lines.every(n=>!/[0-9a-f]{8}-[0-9a-f]{4}-/.test(n.textContent)&&!/\b(remuneration|non_remuneration|deduction|employer_contribution|gross|net)\b/.test(n.textContent)),'no UUIDs or keys on screen');
 const integrity=h.q('trace').children[titles.indexOf('Integridad del resultado')*2+1];assert.equal(integrity.textContent,h.state.receipt.saved.resultSha256);
});

test('diferencia localizada: un total guardado distinto de sus conceptos se nombra por legajo y etiqueta, sin alterar la tabla de totales',async t=>{
 const h=harness(t);h.state.shape=plusOneCent;await h.start();await h.prepare();await h.submit();
 const s=h.state.receipt.saved,t0=s.result.employeeTotals[0],legajo=s.input.employees.find(e=>e.contractId===t0.contractId).employeeNumber;
 const computed=quantize(exactAdd(decimal(t0.net),decimal('-0.01')),{precision:s.input.totalsPrecision,mode:'exact'}).amount;
 const lines=zeroLines(h);
 assert.equal(lines[0].textContent,'Diferencia · 1 hallazgos · cobertura 2 de 2 legajos completos · alcance guardado: todos');
 assert.equal(lines[1].textContent,'Legajo '+legajo+' · Neto calculado: guardado '+ownZeroDifferenceMoney(t0.net)+' vs conceptos '+ownZeroDifferenceMoney(computed)+' (diferencia $ 0,01).');
 assert.ok(lines.every(n=>n.dataset.zeroDifference==='difference'));assert.ok(lines.at(-1).textContent.includes('Recalculá'));
 const row=h.q('totals').children.find(tr=>tr.children[0].textContent===legajo);assert.ok(row,'the saved totals table still lists the legajo');
 assert.equal(row.children[3].textContent,formatOwnRunDecimal(t0.net),'the panel shows the saved net untouched; nothing is corrected on screen');
 assert.equal(h.q('result').hidden,false);assert.match(h.q('status').textContent,/Resultado guardado y recuperable/);
});

test('refresco y revocación: una nueva captura reemplaza las líneas y una sesión vencida no deja datos anteriores',async t=>{
 const h=harness(t);h.state.shape=plusOneCent;await h.start();await h.prepare();await h.submit();
 assert.equal(zeroLines(h)[0].dataset.zeroDifference,'difference');
 const first=h.requests.find(r=>r.method==='POST'),body=JSON.parse(first.body).payload;
 // The same attempt is consulted again and the synthetic server now returns a reconciled result for it.
 const fresh=capture({version:'own-payroll-run.v2',key:first.key,body,bodySha256:ownRunHash(body)});fresh.saved=saved(fresh);h.state.receipt=fresh;
 await h.q('recover').emit('click');await h.idle();
 assert.equal(h.requests.at(-1).url,'/api/internal-own-payroll-run?resource=attempt&key='+first.key);
 assert.equal(traceTitles(h).filter(x=>x==='Conciliación de la captura').length,1,'one block, not appended');
 const lines=zeroLines(h);assert.ok(lines[0].textContent.startsWith('Conciliado · 2 legajos'));assert.ok(lines.every(n=>n.dataset.zeroDifference==='reconciled'));
 assert.ok(!h.q('trace').textContent.includes('Diferencia')&&!h.q('trace').textContent.includes('guardado $'),'no previous difference line survives the refresh');
 // Revocation: the session is gone; every view is cleared, including the reconciliation block.
 h.state.authFailure=401;await h.refresh();
 assert.equal(h.q('result').hidden,true);assert.equal(h.q('trace').children.length,0);assert.equal(zeroLines(h).length,0);assert.equal(h.q('login').hidden,false);
});
