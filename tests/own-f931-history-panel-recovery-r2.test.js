import test from 'node:test';import assert from 'node:assert/strict';
import {mountOwnF931Preparation} from '../assets/own-f931-preparation-panel.js';
import {INACTIVE_F931_HISTORY_ADMISSION as INACTIVE} from './fixtures/own-f931-inactive-admission.js';
import {OWN_CLOSE_NOMINAL} from '../assets/own-payroll-close-model.js';
import {OWN_RUN_FULL_JSON} from '../assets/own-payroll-response.js';
import {OWN_REPORT_MAX_BYTES} from '../assets/own-payroll-report-model.js';
import {jurisdictionFixture} from './fixtures/own-payroll-jurisdiction-synthetic.js';
import {reportFixture} from './fixtures/own-payroll-report-synthetic.js';
import {verifiedWorkspaceCapture} from '../assets/own-payroll-run-workspace-model.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';
import {reportCensusFixture,liquidationDetailFor,fiscalCensusFor,withIdentityToken} from './fixtures/own-payroll-report-census-synthetic.js';
import {PayrollPanelElement as Element,payrollPanelEvents as events} from './fixtures/payroll-panel-dom.js';
const settle=()=>new Promise(r=>setImmediate(r)),flush=async()=>{for(let i=0;i<12;i++)await settle();};
const ACTIVE=Object.freeze({version:'own-f931-history-admission.v1',activated:true,sourceCommit:'4dc2c19b7549e07e1cad52b16924d25f87ea5589',epoch:'201',target:{major:18,projectId:'wild-cake-87689498',branchId:'br-plain-dawn-ac8crb1h',endpointId:'ep-falling-rain-aca27ph1',database:'neondb',role:'neondb_owner'},protocol:'1'.repeat(32),mode:'install_fresh',custodyRunSha256:'d'.repeat(64),capacityPostflightSha256:'a'.repeat(64),ledgerProjectionSha256:'b'.repeat(64),facades:{census:'5'.repeat(64),groupFull:'2'.repeat(64),liquidationDetailFull:'8'.repeat(64)},durableProofSha256:'c'.repeat(64)});
const auth=caps=>({ok:true,authenticated:true,sessionVersion:2,user:{id:'f931-synthetic',email:'f931@example.invalid'},access:{context:'tenant',tenant:{id:'aaaaaaaa-0000-4000-8000-000000000001',roleKey:'test'},tenantCapabilities:[...caps]},expiresAt:'2099-01-01T00:00:00Z'});
const stream=bytes=>new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=65536)c.enqueue(bytes.subarray(i,i+65536));c.close();}});
function harness(t,{admission,fixture}={}){
 const saved=new Map(['document','window','fetch','setTimeout','clearTimeout','setInterval','clearInterval','URL'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)])),root=new Element(),head=new Element('head'),docEvents=events(),winEvents=events(),requests=[],urls={created:0,revoked:0,clicked:0,removed:0};
 const f=fixture??jurisdictionFixture(4,()=>'42'),state={f,census:reportCensusFixture(f),receipts:structuredClone(f.receipts),captures:structuredClone(f.details[0].captures),fiscal:null,caps:OWN_CLOSE_NOMINAL,failure:null,oversize:null,sessionStatus:200};
 const doc={...docEvents,hidden:false,head,body:new Element('body'),createElement:tag=>{const n=new Element(tag);if(tag==='a'){n.click=()=>{urls.clicked++;};n.remove=()=>{const p=n.parentElement;if(p)p.children=p.children.filter(c=>c!==n);n.parentElement=null;n.isConnected=false;urls.removed++;};}return n;},querySelector:s=>head.querySelector(s)};
 Object.assign(globalThis,{document:doc,window:winEvents,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},URL:Object.assign(function URLShim(...a){return new (saved.get('URL').value)(...a);},{createObjectURL(){urls.created++;return 'blob:synthetic-'+urls.created;},revokeObjectURL(){urls.revoked++;}})});
 globalThis.fetch=async(url,options={})=>{const q=new (saved.get('URL').value)(url,'https://synthetic.invalid'),entry={url,options,query:q.searchParams,signal:options.signal};requests.push(entry);
  const reply=(status,data,{full=false,announced}={})=>{const bytes=new TextEncoder().encode(JSON.stringify(data));return {ok:status<400,status,headers:{get:name=>name==='content-type'?(full?OWN_RUN_FULL_JSON:'application/json'):name==='x-municontrol-json-bytes'?(full?String(announced??bytes.length):null):null},body:stream(bytes),async json(){return JSON.parse(new TextDecoder().decode(bytes));}};};
  if(q.pathname==='/api/internal-auth')return state.sessionStatus===200?reply(200,auth(state.caps)):reply(401,{ok:false,code:'UNAUTHENTICATED',error:'La sesión venció.'});
  if(state.failure){const x=state.failure;state.failure=null;return reply(x.status,{ok:false,code:x.code,error:x.error});}
  if(state.oversize&&q.searchParams.get('resource')===state.oversize.resource){const x=state.oversize;state.oversize=null;return reply(x.status??200,{ok:true,data:{padding:'x'.repeat(x.bytes)}},{full:x.full});}
  const resource=q.searchParams.get('resource'),full=options.headers?.Accept===OWN_RUN_FULL_JSON;
  if(q.pathname==='/api/internal-own-fiscal-facts')return reply(200,{ok:true,data:state.fiscal});
  if(q.pathname==='/api/internal-own-payroll-liquidation'){const c=state.captures.find(c=>c.id===q.searchParams.get('id'));return c?reply(200,{ok:true,data:liquidationDetailFor(structuredClone(c))},{full}):reply(404,{ok:false,code:'OWN_LIQ_NOT_FOUND',error:'No se encontró la corrida.'});}
  if(resource==='report-census')return reply(200,{ok:true,data:state.census},{full});
  if(resource==='group')return reply(200,{ok:true,data:state.receipts.find(r=>r.groupId===q.searchParams.get('id'))},{full});
  if(resource==='detail')return reply(200,{ok:true,data:state.f.details[0]});
  return reply(400,{ok:false,code:'OWN_CLOSE_QUERY_INVALID',error:'Consulta inválida.'});
 };
 mountOwnF931Preparation(root,admission?{admission}:{});const q=k=>{const n=root.querySelector('[data-own-f931-'+k+']');assert.ok(n,k);return n;};
 const types=q('types'),select=types.querySelectorAll.bind(types);types.querySelectorAll=selector=>selector==='input:checked'?select('input').filter(input=>input.checked):select(selector);
 const start=async()=>{docEvents.dispatch('taskchange',{id:'f931'});await flush();q('period').value=f.query.from;q('date').value='2026-10-31';};
 const complete=async()=>{const end=Date.now()+5000;while(root.querySelector('section')?.getAttribute('aria-busy')==='true'){assert.ok(Date.now()<end,'bounded synthetic read did not settle');await settle();}};
 t.after(()=>{winEvents.dispatch('pagehide');for(const[k,d]of saved)if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];});
 return {q,requests,state,urls,start,complete,events:docEvents};
}
test('inactive admission: the panel keeps the operational v1 route (detail/group, plain JSON) and says so; no census or FULL is ever requested',async t=>{
 const h=harness(t,{admission:INACTIVE});await h.start();h.state.fiscal=await fiscalCensusFor(h.state.receipts[0],h.state.captures);await h.q('form').emit('submit');await h.complete();
 assert.equal(h.q('view').hidden,false,h.q('status').textContent);assert.match(h.q('basis').textContent,/detalle operativo vigente/);
 const close=h.requests.filter(r=>r.url.startsWith('/api/internal-own-payroll-close'));assert.ok(close.length>=3);assert.ok(close.every(r=>r.options.headers.Accept==='application/json'));assert.deepEqual([...new Set(close.map(r=>r.query.get('resource')))].sort(),['detail','group']);
 assert.equal(h.requests.some(r=>r.url.startsWith('/api/internal-own-payroll-liquidation')),false);
});
test('active admission: census + group FULL + original captures FULL + fiscal JSON, never detail; basis line names the historical source',async t=>{
 const h=harness(t,{admission:ACTIVE});await h.start();h.state.fiscal=await fiscalCensusFor(h.state.receipts[0],h.state.captures);await h.q('form').emit('submit');await h.complete();
 assert.equal(h.q('view').hidden,false,h.q('status').textContent);assert.match(h.q('basis').textContent,/censo completo de cierres conservados/);
 const closeRequests=h.requests.filter(r=>r.url.startsWith('/api/internal-own-payroll-close')),resources=closeRequests.map(r=>r.query.get('resource'));assert.equal(resources.includes('detail'),false);assert.ok(resources.includes('report-census')&&resources.includes('group'));
 const captures=h.requests.filter(r=>r.url.startsWith('/api/internal-own-payroll-liquidation'));assert.equal(captures.length,2);assert.ok(captures.every(r=>r.query.get('resource')==='detail'&&r.options.headers.Accept===OWN_RUN_FULL_JSON));
 assert.ok(h.requests.filter(r=>r.url.startsWith('/api/internal-own-payroll-close')).every(r=>r.options.headers.Accept===OWN_RUN_FULL_JSON));assert.ok(h.requests.filter(r=>r.url.startsWith('/api/internal-own-fiscal-facts')).every(r=>r.options.headers.Accept==='application/json'));
});
test('download refuses/renews when an original capture changed with the same census, snapshot and fiscal census; no object URL is created',async t=>{
 const h=harness(t,{admission:ACTIVE,fixture:reportFixture(4)});await h.start();h.state.fiscal=await fiscalCensusFor(h.state.receipts[0],h.state.captures);await h.q('form').emit('submit');await h.complete();assert.equal(h.q('view').hidden,false);
 const contractId=h.state.receipts[0].snapshot.employees[0].contractId,runId=h.state.receipts[0].snapshot.employees[0].runId;
 h.state.captures=h.state.captures.map(c=>c.id===runId?withIdentityToken(c,contractId,'9'.repeat(64)):c);
 await h.q('csv').emit('click');await h.complete();
 assert.match(h.q('status').textContent,/Cambió la fuente/);assert.equal(h.urls.created,0);assert.equal(h.q('view').hidden,false);
 await h.q('csv').emit('click');await h.complete();assert.equal(h.urls.created,1);assert.match(h.q('status').textContent,/descargada/);
});
test('v2 capture payload mutation is rejected by the preserved jurisdiction hash before any download',async t=>{
 const h=harness(t,{admission:ACTIVE});await h.start();h.state.fiscal=await fiscalCensusFor(h.state.receipts[0],h.state.captures);await h.q('form').emit('submit');await h.complete();assert.equal(h.q('view').hidden,false);
 const e=h.state.receipts[0].snapshot.employees[0],c=h.state.captures.find(c=>c.id===e.runId);assert.notEqual(h.state.receipts[0].snapshot.version,'own-close-snapshot.v1');assert.equal(e.jurisdiction.sourceSha256,c.payloadSha256);
 const changed=withIdentityToken(c,e.contractId,'9'.repeat(64)),inventory=changed.payload.sourceInventory.jurisdictions.rows.find(r=>r.contractId===e.contractId);assert.ok(inventory);inventory.identityToken='9'.repeat(64);changed.payloadSha256=ownRunHash(changed.payload);await verifiedWorkspaceCapture(structuredClone(changed));assert.notEqual(changed.payloadSha256,e.jurisdiction.sourceSha256);h.state.captures=h.state.captures.map(x=>x.id===c.id?changed:x);
 await h.q('csv').emit('click');await h.complete();assert.match(h.q('status').textContent,/jurisdicción del cierre no corresponde/);assert.equal(h.q('view').hidden,true);assert.equal(h.urls.created,0);assert.equal(h.urls.clicked,0);
});

test('v2 inconsistent identity token is rejected by the captured inventory before historical source comparison',async t=>{
 const h=harness(t,{admission:ACTIVE});await h.start();h.state.fiscal=await fiscalCensusFor(h.state.receipts[0],h.state.captures);await h.q('form').emit('submit');await h.complete();assert.equal(h.q('view').hidden,false);
 const e=h.state.receipts[0].snapshot.employees[0],c=h.state.captures.find(c=>c.id===e.runId),changed=withIdentityToken(c,e.contractId,'9'.repeat(64)),person=changed.payload.population.employees.find(p=>p.contractId===e.contractId),inventory=changed.payload.sourceInventory.jurisdictions.rows.find(r=>r.contractId===e.contractId);assert.ok(person&&inventory);assert.notEqual(person.identityToken,inventory.identityToken);
 await assert.rejects(verifiedWorkspaceCapture(structuredClone(changed)),/Una jurisdicción no corresponde exactamente al contrato y registro capturados/);
 h.state.captures=h.state.captures.map(x=>x.id===c.id?changed:x);await h.q('csv').emit('click');await h.complete();assert.match(h.q('status').textContent,/Una jurisdicción no corresponde exactamente al contrato y registro capturados/);assert.equal(h.q('view').hidden,true);assert.equal(h.urls.created,0);assert.equal(h.urls.clicked,0);
});

test('bounded reads: an oversized census, an oversized error body and an exhausted budget fail before any materialisation; period stays editable and a new query works without reload',async t=>{
 const h=harness(t,{admission:ACTIVE});await h.start();h.state.fiscal=await fiscalCensusFor(h.state.receipts[0],h.state.captures);
 h.state.oversize={resource:'report-census',bytes:4*1024*1024+64,full:true};await h.q('form').emit('submit');await h.complete();
 assert.equal(h.q('view').hidden,true);assert.match(h.q('status').textContent,/supera la capacidad/);assert.equal(h.q('target').disabled,false);assert.equal(h.q('consult').disabled,false);
 h.state.oversize={resource:'report-census',bytes:4*1024*1024+64,status:503,full:false};await h.q('form').emit('submit');await h.complete();assert.match(h.q('status').textContent,/supera la capacidad/);
 h.state.failure={status:503,code:'OWN_CLOSE_UNAVAILABLE',error:'No se pudo verificar el histórico cerrado. Volvé a consultar; no se reunió un informe parcial.'};await h.q('form').emit('submit');await h.complete();assert.ok(h.q('status').textContent.startsWith('No se pudo verificar el histórico cerrado'));
 await h.q('form').emit('submit');await h.complete();assert.equal(h.q('view').hidden,false,h.q('status').textContent);
 assert.ok(OWN_REPORT_MAX_BYTES>=256*1024*1024);
});
test('session loss during the review shows the login path and a renewed access consults again without reload',async t=>{
 const h=harness(t,{admission:ACTIVE});await h.start();h.state.fiscal=await fiscalCensusFor(h.state.receipts[0],h.state.captures);h.state.sessionStatus=401;await h.q('form').emit('submit');await h.complete();
 assert.equal(h.q('view').hidden,true);assert.equal(h.q('login').hidden,false);
 h.state.sessionStatus=200;await h.q('access').emit('click');await h.complete();await h.q('form').emit('submit');await h.complete();assert.equal(h.q('view').hidden,false,h.q('status').textContent);
});

test('source default is the real active literal: the panel uses complete history and original captures without an admission override',async t=>{
 const h=harness(t);await h.start();h.state.fiscal=await fiscalCensusFor(h.state.receipts[0],h.state.captures);await h.q('form').emit('submit');await h.complete();
 assert.equal(h.q('view').hidden,false,h.q('status').textContent);assert.match(h.q('basis').textContent,/censo completo de cierres conservados/);
 const close=h.requests.filter(r=>r.url.startsWith('/api/internal-own-payroll-close'));assert.ok(close.length>=3);
 assert.ok(close.some(r=>r.query.get('resource')==='report-census'));assert.ok(close.some(r=>r.query.get('resource')==='group'));
 assert.equal(close.some(r=>r.query.get('resource')==='detail'),false);assert.ok(close.every(r=>r.options.headers.Accept===OWN_RUN_FULL_JSON));
 const originals=h.requests.filter(r=>r.url.startsWith('/api/internal-own-payroll-liquidation'));assert.equal(originals.length,2);assert.ok(originals.every(r=>r.options.headers.Accept===OWN_RUN_FULL_JSON));
 assert.ok(h.requests.filter(r=>r.url.startsWith('/api/internal-own-fiscal-facts')).every(r=>r.options.headers.Accept==='application/json'));
});
