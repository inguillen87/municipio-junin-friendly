// Actual F931 panel with deferred synthetic HTTP and the existing memory DOM.
// These component cases do not execute PostgreSQL or certify fiscal generation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mountOwnF931Preparation} from '../assets/own-f931-preparation-panel.js';
import {OWN_CLOSE_NOMINAL} from '../assets/own-payroll-close-model.js';
import {PayrollPanelElement as Element,payrollPanelEvents as events} from './fixtures/payroll-panel-dom.js';

const settle=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
const auth=(caps=OWN_CLOSE_NOMINAL)=>({ok:true,authenticated:true,sessionVersion:2,user:{id:'synthetic-f931-session',email:'f931@example.test'},access:{context:'tenant',tenant:{id:'aaaaaaaa-0000-4000-8000-000000000001',roleKey:'synthetic-f931-role'},tenantCapabilities:[...caps]},expiresAt:'2099-01-01T00:00:00Z'});
function harness(t){
 const keys=['document','window','fetch','setTimeout','clearTimeout','setInterval','clearInterval'],before=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const root=new Element(),head=new Element('head'),docEvents=events(),winEvents=events(),requests=[];let timer=0;
 const doc={...docEvents,hidden:false,head,createElement:tag=>new Element(tag),querySelector:s=>head.querySelector(s)};
 Object.assign(globalThis,{document:doc,window:winEvents,setTimeout:()=>++timer,clearTimeout(){},setInterval:()=>++timer,clearInterval(){}});
 globalThis.fetch=async(url,options={})=>{
  assert.equal(url,'/api/internal-auth','access withdrawal never starts a fiscal or nominal read');assert.equal(options.method??'GET','GET');
  const headers=deferred(),body=deferred(),request={url,options,headers,body,jsonStarted:false};requests.push(request);
  const response=await headers.promise;return{status:response.status,ok:response.status>=200&&response.status<300,json:async()=>{request.jsonStarted=true;await body.promise;return response.payload;}};
 };
 mountOwnF931Preparation(root);const q=k=>{const n=root.querySelector('[data-own-f931-'+k+']');assert.ok(n,k);return n;};
 t.after(()=>{winEvents.dispatch('pagehide');for(const[k,descriptor]of before)if(descriptor)Object.defineProperty(globalThis,k,descriptor);else delete globalThis[k];});
 const flush=async()=>{for(let i=0;i<5;i++)await settle();};
 const start=async()=>{docEvents.dispatch('taskchange',{id:'f931'});await flush();};
 const respond=(i,{status=200,payload=auth(),body=true}={})=>{const r=requests[i];assert.ok(r,'synthetic auth request '+i);r.headers.resolve({status,payload});if(body)r.body.resolve();};
 const hold=async stage=>{await start();if(stage==='body'){respond(0,{body:false});await flush();assert.equal(requests[0].jsonStarted,true);}return requests[0];};
 const finish=async(stage,payload=auth())=>{if(stage==='headers')respond(0,{payload});else requests[0].body.resolve();await flush();};
 const hide=()=>{doc.hidden=true;docEvents.dispatch('visibilitychange');},show=()=>{doc.hidden=false;docEvents.dispatch('visibilitychange');};
 return{q,doc,requests,start,respond,hold,finish,flush,hide,show,event:docEvents.dispatch,close:()=>winEvents.dispatch('pagehide')};
}
function retired(h,message){assert.equal(h.q('target').disabled,true);assert.equal(h.q('view').hidden,true);assert.equal(h.q('access').hidden,false);assert.match(h.q('status').textContent,message);assert.equal(h.q('coverage').textContent,'');assert.equal(h.q('contract-rows').textContent,'');}

for(const stage of ['headers','body']){
 test('F931 '+stage+': late auth cannot restore access or status after hide and show',async t=>{
  const h=harness(t);await h.hold(stage);h.hide();await h.finish(stage);h.show();retired(h,/ocultar la pantalla/);assert.equal(h.requests.length,1);assert.equal(h.requests[0].options.signal.aborted,true);
  const verification=h.q('access').emit('click');await h.flush();h.respond(1);await verification;assert.equal(h.q('target').disabled,false);assert.equal(h.requests.length,2);
 });
 test('F931 '+stage+': superseded task auth cannot override a fresh permission denial',async t=>{
  const h=harness(t);await h.hold(stage);h.event('taskchange',{id:'reportes'});h.event('taskchange',{id:'f931'});await h.flush();h.respond(1,{payload:auth([])});await h.flush();retired(h,/faltan permisos/);
  await h.finish(stage);h.show();retired(h,/faltan permisos/);assert.equal(h.requests.length,2);
 });
 test('F931 '+stage+': capability withdrawal wins over the old successful auth',async t=>{
  const h=harness(t);await h.hold(stage);h.event('municontrol:capabilities-ready');await h.flush();h.respond(1,{status:401});await h.flush();retired(h,/sesión venció/);assert.equal(h.q('login').hidden,false);
  await h.finish(stage);h.show();retired(h,/sesión venció/);assert.equal(h.q('login').hidden,false);assert.equal(h.requests.length,2);
 });
 test('F931 '+stage+': closing the page also prevents a late success message',async t=>{
  const h=harness(t);await h.hold(stage);h.close();await h.finish(stage);retired(h,/Página cerrada/);assert.equal(h.requests.length,1);
 });
}
test('F931 current authorized session enables only preparation controls',async t=>{const h=harness(t);await h.start();h.respond(0);await h.flush();assert.equal(h.q('target').disabled,false);assert.equal(h.q('access').hidden,true);assert.equal(h.q('view').hidden,true);assert.equal(h.q('csv').disabled,true);assert.match(h.q('status').textContent,/Acceso verificado/);assert.equal(h.requests.length,1);});
for(const status of [401,403])test('F931 current '+status+' remains denied without any fiscal read',async t=>{const h=harness(t);await h.start();h.respond(0,{status});await h.flush();retired(h,status===401?/sesión venció/:/No se verificó el acceso/);assert.equal(h.q('login').hidden,status!==401);assert.equal(h.requests.length,1);});
