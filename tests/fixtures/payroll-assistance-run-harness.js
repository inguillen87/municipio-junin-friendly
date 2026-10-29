// Actual calculation panel, models and child widgets over an in-memory DOM.
// Synthetic HTTP only; layout and real SQL remain separate release checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {mountOwnPayrollRun} from '../../assets/own-payroll-run-panel.js';
import {createEmployeePicker} from '../../assets/employee-picker.js';
import {OWN_RUN_PREPARE} from '../../assets/own-payroll-run-workspace-model.js';
import {CATALOG_VERSION} from '../../assets/native-employment-catalog-model.js';
import {bootstrap,program,uid,hash} from './own-payroll-program-synthetic.js';
import {roster} from './native-roster-synthetic.js';
import {catalog as classification} from './native-employee-synthetic.js';
import {capture} from './own-payroll-run-synthetic.js';
import {ownRunHash} from '../../lib/internal-own-payroll-run.js';
import {annulDetail,annulReceipt,afterAnnul} from './own-payroll-annulment-synthetic.js';
import {annulReviewIndexFor} from './own-payroll-annulment-review-synthetic.js';

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
 let clock=0,timerId=0;const deadlines=new Map(),advance=ms=>{clock+=ms;for(const[id,t]of [...deadlines])if(t.at<=clock){deadlines.delete(id);t.fn();}};
 const document={...docEvents,hidden:false,head:new Element('head'),body:new Element('body'),createElement:tag=>new Element(tag),querySelectorAll:()=>[],getElementById:()=>null};
 Object.assign(globalThis,{document,window:winEvents,setTimeout:(fn,ms)=>{const id=++timerId;deadlines.set(id,{at:clock+ms,fn});return id;},clearTimeout:id=>deadlines.delete(id),setInterval:()=>1,clearInterval(){}});
 globalThis.fetch=async(url,options={})=>{
  const method=options.method??'GET',request={url,method,body:options.body??null,key:options.headers?.['Idempotency-Key']??null};requests.push(request);
  if(state.readStepMs?.length){advance(state.readStepMs.shift());if(options.signal?.aborted)throw new DOMException('Synthetic single HTTP deadline','AbortError');}
  if(state.hold?.url===url)await state.hold.wait;
  let status=200,payload;
  if(url==='/api/internal-auth'){if(state.authFailure){status=state.authFailure;payload={ok:false,code:'SYNTHETIC_SESSION_UNAVAILABLE'};}else payload={ok:true,authenticated:true,sessionVersion:2,user:{id:state.sessionId,email:'synthetic-readiness@example.invalid'},access:{context:'tenant',tenant:{id:roster(1).scope.tenantId,roleKey:'QA'},tenantCapabilities:state.caps},expiresAt:new Date(Date.now()+3600000).toISOString()};}
  else if(method==='POST'){if(state.postFailure){status=503;payload={ok:false,code:'OWN_RUN_BUSY'};}else{const body=JSON.parse(options.body).payload,c=capture({version:'own-payroll-run.v2',key:request.key,body,bodySha256:ownRunHash(body)});state.receipt=c;payload={ok:true,data:c};}}
  else if(url.startsWith('/api/internal-own-payroll-run?resource=attempt')){if(state.receipt)payload={ok:true,data:state.receipt};else{status=404;payload={ok:false,code:'OWN_RUN_NOT_FOUND'};}}
  else if(url.startsWith('/api/internal-own-payroll-run?'))payload={ok:true,data:{version:'own-payroll-bootstrap.v2',scopeVersion:hash('a'),programVersion:hash('b'),canCalculate:true,runs:state.runs??[],complete:true}};
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


export {harness};
