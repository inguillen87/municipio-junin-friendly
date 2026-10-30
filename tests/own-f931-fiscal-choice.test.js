import test from 'node:test';import assert from 'node:assert/strict';
import {mountOwnF931Preparation} from '../assets/own-f931-preparation-panel.js';
import {OWN_CLOSE_NOMINAL} from '../assets/own-payroll-close-model.js';
import {OWN_RUN_FULL_JSON} from '../assets/own-payroll-response.js';
import {fiscalFactsHash} from '../assets/own-fiscal-facts-model.js';
import {historicalF931BrowserFixture,historicalF931BrowserLiquidation,historicalF931BrowserFullResponse} from './fixtures/own-f931-historical-browser-synthetic.js';
import {reportCensusFixture} from './fixtures/own-payroll-report-census-synthetic.js';
import {PayrollPanelElement as Element,payrollPanelEvents as events} from './fixtures/payroll-panel-dom.js';
// Component cases over the mounted panel and the shared memory substrate. They
// do not execute PostgreSQL, 160, 200/201 or a browser, and they certify no
// fiscal generation: they prove only which requests the real screen issues and
// what it shows when the fiscal registry is, or is not, consulted.
const settle=()=>new Promise(r=>setImmediate(r)),flush=async()=>{for(let i=0;i<8;i++)await settle();};
const auth=caps=>({ok:true,authenticated:true,sessionVersion:2,user:{id:'f931-synthetic',email:'f931@example.invalid'},access:{context:'tenant',tenant:{id:'aaaaaaaa-0000-4000-8000-000000000001',roleKey:'test'},tenantCapabilities:[...caps]},expiresAt:'2099-01-01T00:00:00Z'});
const FISCAL='/api/internal-own-fiscal-facts',CLOSE='/api/internal-own-payroll-close',LIQUIDATION='/api/internal-own-payroll-liquidation';
const FISCAL_UNAVAILABLE={status:503,code:'FISCAL_FACTS_UNAVAILABLE',error:'No se confirmó la operación. Consultá el mismo intento antes de iniciar otro.'};
if(typeof Element.prototype.click!=='function')Element.prototype.click=function(){};
// Complete synthetic own history for September and October: one closed monthly
// group of 61 invented contracts each, with captured jurisdictions 42/55. Built
// once and served as clones; nothing is borrowed from a current roster.
const FIXTURES={'2026-09':historicalF931BrowserFixture({period:'2026-09'}),'2026-10':historicalF931BrowserFixture({period:'2026-10'})};
function harness(t){
 const saved=new Map(['document','window','fetch','setTimeout','clearTimeout','setInterval','clearInterval'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)])),root=new Element(),head=new Element('head'),docEvents=events(),winEvents=events(),requests=[];let caps=OWN_CLOSE_NOMINAL,failure=null,current=null;
 const doc={...docEvents,hidden:false,head,createElement:tag=>new Element(tag),querySelector:s=>head.querySelector(s)};
 Object.assign(globalThis,{document:doc,window:winEvents,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){}});
 const wire=data=>{const w=historicalF931BrowserFullResponse(data),bytes=new TextEncoder().encode(w.body);return{ok:true,status:200,text:async()=>w.body,headers:{get:name=>name==='content-type'?w.contentType:name==='x-municontrol-json-bytes'?w.headers['x-municontrol-json-bytes']:null},body:new ReadableStream({start(c){c.enqueue(bytes);c.close();}})};};
 const plain=data=>{const raw=JSON.stringify({ok:true,data});return{ok:true,status:200,text:async()=>raw,headers:{get:name=>name==='content-type'?'application/json':null}};};
 globalThis.fetch=async(url,options={})=>{const q=new URL(url,'https://synthetic.invalid'),entry={url,path:q.pathname,resource:q.searchParams.get('resource'),period:q.searchParams.get('period'),accept:options.headers?.Accept??null,options};requests.push(entry);
  if(q.pathname==='/api/internal-auth')return{ok:true,status:200,json:async()=>auth(caps)};
  if(failure&&failure.path===q.pathname){return{ok:false,status:failure.status,text:async()=>JSON.stringify({ok:false,code:failure.code,error:failure.error}),headers:{get:()=>null}};}
  const period=q.searchParams.get('period');
  if(q.pathname===FISCAL)return plain({version:'own-fiscal-census.v1',period,scopeVersion:'a'.repeat(64),stateVersion:await fiscalFactsHash([]),rows:[],complete:true,payrollCalculated:false,payrollPosted:false});
  if(q.pathname===CLOSE&&entry.resource==='report-census'){current=period;const census=FIXTURES[period]?.censuses.find(c=>c.liquidationType===q.searchParams.get('liquidationType'));return wire(census?structuredClone(census):reportCensusFixture({period,liquidationType:q.searchParams.get('liquidationType')}));}
  const f=FIXTURES[current];assert.ok(f,'group and capture reads follow a census of a synthetic period');
  if(q.pathname===CLOSE&&entry.resource==='group'){const receipt=f.receipts.find(r=>r.groupId===q.searchParams.get('id'));assert.ok(receipt,'unknown synthetic group');return wire(structuredClone(receipt));}
  if(q.pathname===LIQUIDATION&&entry.resource==='detail'){const capture=f.captures.find(c=>c.id===q.searchParams.get('id'));assert.ok(capture,'unknown synthetic capture');return wire(historicalF931BrowserLiquidation(capture));}
  throw Error('unexpected synthetic request '+url);
 };
 mountOwnF931Preparation(root);const q=k=>{const n=root.querySelector('[data-own-f931-'+k+']');assert.ok(n,k);return n;};
 const types=q('types'),select=types.querySelectorAll.bind(types);types.querySelectorAll=selector=>selector==='input:checked'?select('input').filter(input=>input.checked):select(selector); // real DOM checkbox semantics absent from the shared memory substrate
 const start=async()=>{docEvents.dispatch('taskchange',{id:'f931'});await flush();q('period').value='2026-09';q('date').value='2026-09-30';};
 t.after(()=>{winEvents.dispatch('pagehide');for(const[k,d]of saved)if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];});
 const complete=async()=>{const end=Date.now()+20000;while(root.querySelector('section')?.getAttribute('aria-busy')==='true'){assert.ok(Date.now()<end,'bounded synthetic read did not settle');await settle();}};
 const consult=async()=>{await q('form').emit('submit');await complete();};
 const count=(path,resource=null)=>requests.filter(r=>r.path===path&&(resource===null||r.resource===resource)).length;
 const retarget=async(period,date)=>{q('period').value=period;q('date').value=date;await q('target').emit('change');};
 return{q,requests,start,consult,count,retarget,complete,fail:f=>{failure=f;},coverageTitles:()=>q('coverage').querySelectorAll('h4').map(n=>n.textContent),rowStates:()=>q('contract-rows').querySelectorAll('article').map(n=>n.dataset.fiscalState)};
}
test('the mounted panel still consults the fiscal registry by default, and a fiscal 503 discards the complete own history it had already read',async t=>{
 const h=harness(t);await h.start();
 assert.equal(h.q('fiscal').checked,true,'default keeps the current behaviour: consult 160');assert.equal(h.q('types').querySelectorAll('[data-own-f931-fiscal]').length,0,'the choice is not a liquidation type');assert.equal(h.q('target').querySelectorAll('[data-own-f931-fiscal]').length,1,'the choice lives with period, date and types so access withdrawal disables it too');
 h.fail({path:FISCAL,...FISCAL_UNAVAILABLE});await h.consult();
 assert.equal(h.count(CLOSE,'report-census'),1);assert.equal(h.count(CLOSE,'group'),1);assert.equal(h.count(LIQUIDATION,'detail'),2);assert.equal(h.count(FISCAL,'census'),1);
 const order=h.requests.map(r=>r.path);assert.ok(order.indexOf(LIQUIDATION)<order.indexOf(FISCAL),'complete own sources were read before the fiscal census');assert.ok(h.requests.filter(r=>r.path!==FISCAL&&r.path!=='/api/internal-auth').every(r=>r.accept===OWN_RUN_FULL_JSON));
 assert.equal(h.q('view').hidden,true,'no partial preparation is shown');assert.ok(h.q('status').textContent.startsWith(FISCAL_UNAVAILABLE.error),h.q('status').textContent);assert.doesNotMatch(h.q('status').textContent,/sin recargar/);assert.equal(h.q('csv').disabled,true);assert.equal(h.q('target').disabled,false);assert.equal(h.q('consult').disabled,false);
});
test('unchecking the choice reads the same complete own history without any fiscal request and reports the coverage as not queried, never as zero or complete',async t=>{
 const h=harness(t);await h.start();h.q('fiscal').checked=false;await h.q('target').emit('change');assert.match(h.q('status').textContent,/consulta fiscal/);
 await h.consult();assert.equal(h.count(FISCAL),0,'no fiscal request');assert.equal(h.count(CLOSE,'report-census'),2,'census read plus change detection');assert.equal(h.count(LIQUIDATION,'detail'),2);
 assert.equal(h.q('view').hidden,false,h.q('status').textContent);assert.match(h.q('status').textContent,/completa verificada sin consultar el registro de datos fiscales/);assert.doesNotMatch(h.q('status').textContent,/Sin cierres propios/);
 assert.match(h.q('count').textContent,/Universo verificado: 1 grupos · 61 participaciones · 61 contratos/);
 assert.ok(h.coverageTitles().includes('Datos fiscales del universo sin consultar'),h.coverageTitles().join('|'));assert.ok(!h.coverageTitles().includes('Datos fiscales del universo completo'));assert.match(h.q('coverage').textContent,/61 contratos sin consultar\. No se verificó la existencia de revisiones fiscales/);
 assert.ok(h.rowStates().length>0);assert.ok(h.rowStates().every(s=>s==='not_queried'));assert.match(h.q('contract-rows').textContent,/Datos fiscales sin consultar/);assert.doesNotMatch(h.q('contract-rows').textContent,/Sin revisión fiscal|datos documentados/);
 assert.doesNotMatch(h.q('issues').textContent,/datos fiscales/i,'an unqueried registry raises no fiscal issue and proves no absence');
 h.q('jurisdiction').value='55';await h.consult();assert.equal(h.count(FISCAL),0);assert.match(h.q('count').textContent,/^Jurisdicción 55: 1 grupos cerrados · 30 participaciones · 30 contratos distintos\./);assert.match(h.q('count').textContent,/Universo verificado: 1 grupos · 61 participaciones · 61 contratos\./);
});
test('September to October after an unqueried review re-reads the complete own history without reload and keeps the choice; re-checking it issues the census again',async t=>{
 const h=harness(t);await h.start();h.q('fiscal').checked=false;await h.q('target').emit('change');await h.consult();assert.equal(h.q('view').hidden,false,h.q('status').textContent);
 await h.retarget('2026-10','2026-10-31');assert.equal(h.q('view').hidden,true);assert.equal(h.q('fiscal').checked,false,'the choice is not cleared by a period change');await h.consult();
 assert.equal(h.q('view').hidden,false,h.q('status').textContent);assert.equal(h.count(FISCAL),0);assert.equal(h.requests.filter(r=>r.period==='2026-10'&&r.resource==='report-census').length,2);assert.match(h.q('count').textContent,/61 participaciones/);
 h.q('fiscal').checked=true;await h.q('target').emit('change');assert.equal(h.q('view').hidden,true);await h.consult();
 assert.equal(h.count(FISCAL,'census'),2,'census read plus change detection');assert.ok(h.requests.filter(r=>r.path===FISCAL).every(r=>r.period==='2026-10'));assert.ok(h.coverageTitles().includes('Datos fiscales del universo completo'));assert.ok(h.rowStates().every(s=>s==='missing'));assert.match(h.q('contract-rows').textContent,/Sin revisión fiscal/);assert.match(h.q('status').textContent,/^Revisión propia completa verificada\. Consultá la cobertura/);
});
test('the voluntary download re-reads the sources in the same fiscal mode as the review it certifies',async t=>{
 const h=harness(t);await h.start();h.q('fiscal').checked=false;await h.q('target').emit('change');await h.consult();assert.equal(h.q('csv').disabled,false);
 const created=[];const savedUrl={create:URL.createObjectURL,revoke:URL.revokeObjectURL};URL.createObjectURL=blob=>{created.push(blob);return 'blob:synthetic';};URL.revokeObjectURL=()=>{};t.after(()=>{URL.createObjectURL=savedUrl.create;URL.revokeObjectURL=savedUrl.revoke;});
 await h.q('csv').emit('click');await h.complete();assert.equal(h.count(FISCAL),0,'download never consults what the review did not');assert.equal(h.count(CLOSE,'report-census'),4);assert.equal(created.length,1);assert.match(h.q('status').textContent,/Preparación completa descargada/);
 assert.match(await created[0].text(),/Datos fiscales sin consultar/);assert.doesNotMatch(await created[0].text(),/contratos revisados vigentes/);
});
test('withdrawn access disables the fiscal choice together with period, date and types',async t=>{
 const h=harness(t);await h.start();assert.equal(h.q('target').disabled,false);globalThis.document.hidden=true;globalThis.document.dispatch('visibilitychange');await flush();
 assert.equal(h.q('target').disabled,true);assert.equal(h.q('period').value,'');assert.equal(h.count(FISCAL),0);
});
