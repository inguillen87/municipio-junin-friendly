import test from 'node:test';import assert from 'node:assert/strict';
import {mountOwnF931Preparation} from '../assets/own-f931-preparation-panel.js';
import {OWN_CLOSE_NOMINAL} from '../assets/own-payroll-close-model.js';
import {fiscalFactsHash} from '../assets/own-fiscal-facts-model.js';
import {historicalReportFixture} from './fixtures/own-payroll-report-synthetic.js';
import {reportCensusFixture} from './fixtures/own-payroll-report-census-synthetic.js';
import {OWN_RUN_FULL_JSON} from '../assets/own-payroll-response.js';
import {PayrollPanelElement as Element,payrollPanelEvents as events} from './fixtures/payroll-panel-dom.js';
const settle=()=>new Promise(r=>setImmediate(r)),flush=async()=>{for(let i=0;i<8;i++)await settle();};
const auth=caps=>({ok:true,authenticated:true,sessionVersion:2,user:{id:'f931-synthetic',email:'f931@example.invalid'},access:{context:'tenant',tenant:{id:'aaaaaaaa-0000-4000-8000-000000000001',roleKey:'test'},tenantCapabilities:[...caps]},expiresAt:'2099-01-01T00:00:00Z'});
function harness(t){
 const saved=new Map(['document','window','fetch','setTimeout','clearTimeout','setInterval','clearInterval'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)])),root=new Element(),head=new Element('head'),docEvents=events(),winEvents=events(),requests=[];let caps=OWN_CLOSE_NOMINAL,hold=false,failure=null,badHeader=false;
 const doc={...docEvents,hidden:false,head,createElement:tag=>new Element(tag),querySelector:s=>head.querySelector(s)};
 Object.assign(globalThis,{document:doc,window:winEvents,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){}});
 globalThis.fetch=async(url,options={})=>{const q=new URL(url,'https://synthetic.invalid'),entry={url,options,query:q.searchParams};requests.push(entry);if(q.pathname==='/api/internal-auth')return{ok:true,status:200,json:async()=>auth(caps)};
  const response=async()=>{if(failure){const f=failure;failure=null;return{ok:false,status:f.status,text:async()=>JSON.stringify({ok:false,code:f.code,error:f.error})};}const period=q.searchParams.get('period')||'2026-09',f=historicalReportFixture(period,'monthly');const data=q.pathname==='/api/internal-own-fiscal-facts'?{version:'own-fiscal-census.v1',period,scopeVersion:'a'.repeat(64),stateVersion:await fiscalFactsHash([]),rows:[],complete:true,payrollCalculated:false,payrollPosted:false}:q.searchParams.get('resource')==='report-census'?reportCensusFixture({period,liquidationType:q.searchParams.get('liquidationType')}):q.searchParams.get('resource')==='detail'?f.details[0]:f.receipts[0];const raw=JSON.stringify({ok:true,data}),bytes=new TextEncoder().encode(raw);return{ok:true,status:200,text:async()=>raw,headers:{get:name=>name==='content-type'?(badHeader?'application/json':OWN_RUN_FULL_JSON):name==='x-municontrol-json-bytes'?String(bytes.length):null},body:new ReadableStream({start(c){c.enqueue(bytes);c.close();}})};};
  if(hold&&q.pathname==='/api/internal-own-payroll-close'){hold=false;entry.response=response;return new Promise(resolve=>entry.finish=async()=>resolve(await response()));}return response();
 };
 mountOwnF931Preparation(root);const q=k=>{const n=root.querySelector('[data-own-f931-'+k+']');assert.ok(n,k);return n;};
 const types=q('types'),select=types.querySelectorAll.bind(types);types.querySelectorAll=selector=>selector==='input:checked'?select('input').filter(input=>input.checked):select(selector); // real DOM checkbox semantics absent from the shared memory substrate

 const start=async()=>{docEvents.dispatch('taskchange',{id:'f931'});await flush();q('period').value='2026-10';q('date').value='2026-10-31';};
 t.after(()=>{winEvents.dispatch('pagehide');for(const[k,d]of saved)if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];});
 const complete=async()=>{const end=Date.now()+5000;while(root.querySelector('section')?.getAttribute('aria-busy')==='true'){assert.ok(Date.now()<end,'bounded synthetic read did not settle');await settle();}};
 return{q,requests,start,doc,complete,events:docEvents,hold:()=>{hold=true;},fail:f=>{failure=f;},badHeader:()=>{badHeader=true;},revoke:()=>{caps=[];docEvents.dispatch('municontrol:capabilities-ready');}};
}
test('period remains editable during a pending GET, invalidates it and reconsults withoutF5',async t=>{
 const h=harness(t);await h.start();h.hold();await h.q('form').emit('submit');await flush();const old=h.requests.find(r=>r.finish);assert.ok(old);assert.equal(h.q('target').disabled,false,'GET cannot lock all period inputs');assert.equal(h.q('consult').disabled,true,'same pending consultation cannot duplicate');
 h.q('period').value='2026-09';h.q('date').value='2026-09-30';await h.q('target').emit('change');assert.equal(old.options.signal.aborted,true);assert.equal(h.q('view').hidden,true);assert.equal(h.q('consult').disabled,false);await h.q('form').emit('submit');await h.complete();assert.equal(h.q('view').hidden,false,h.q('status').textContent);assert.match(h.q('status').textContent,/completa verificada|Sin cierres propios conservados/);const status=h.q('status').textContent;await old.finish();await flush();assert.equal(h.q('status').textContent,status);assert.ok(h.requests.filter(r=>r.query.get('period')==='2026-09').length>=2);
});
for(const failure of [{status:503,code:'OWN_CLOSE_CONTRACT_INVALID',error:'No se verificó el resultado histórico contra todas sus fuentes guardadas.'},{status:422,code:'OWN_CLOSE_HISTORY_REQUIRED',error:'El encuadre de un período anterior requiere una fuente histórica propia verificada.'}])test('backend'+failure.status+' stays a failure, keeps period inputs and permits an explicit new query',async t=>{
 const h=harness(t);await h.start();h.fail(failure);await h.q('form').emit('submit');await flush();assert.equal(h.q('view').hidden,true);assert.equal(h.q('csv').disabled,true);assert.equal(h.q('target').disabled,false);assert.equal(h.q('consult').disabled,false);assert.ok(h.q('status').textContent.startsWith(failure.error));assert.match(h.q('status').textContent,/sin recargar la página/);h.q('period').value='2026-09';h.q('date').value='2026-09-30';await h.q('target').emit('change');await h.q('form').emit('submit');await h.complete();assert.equal(h.q('view').hidden,false,h.q('status').textContent);assert.match(h.q('status').textContent,/completa verificada|Sin cierres propios conservados/);
});
test('revoking authority during a pending read disables target and late data cannot restore it',async t=>{
 const h=harness(t);await h.start();h.hold();await h.q('form').emit('submit');await flush();const old=h.requests.find(r=>r.finish);h.revoke();await flush();assert.equal(old.options.signal.aborted,true);assert.equal(h.q('target').disabled,true);assert.equal(h.q('view').hidden,true);await old.finish();await flush();assert.equal(h.q('target').disabled,true);assert.equal(h.q('view').hidden,true);assert.equal(h.q('csv').disabled,true);
});

test('successful full-history responses require the negotiated content type and complete byte envelope',async t=>{
 const h=harness(t);await h.start();h.badHeader();await h.q('form').emit('submit');await h.complete();assert.equal(h.q('view').hidden,true);assert.equal(h.q('csv').disabled,true);assert.match(h.q('status').textContent,/lectura completa del histórico/);assert.ok(h.requests.some(r=>r.query.get('resource')==='report-census'&&r.options.headers.Accept===OWN_RUN_FULL_JSON));assert.equal(h.requests.some(r=>r.query.get('resource')==='detail'),false);
});
