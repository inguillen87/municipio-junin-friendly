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
import {reportCensusFixture,reopenEvent,liquidationDetailFor,fiscalCensusFor,withIdentityToken} from './fixtures/own-payroll-report-census-synthetic.js';
import {fiscalCoverageFixture} from './fixtures/own-f931-fiscal-coverage-synthetic.js';
import {PayrollPanelElement as Element,payrollPanelEvents as events} from './fixtures/payroll-panel-dom.js';
const settle=()=>new Promise(r=>setImmediate(r)),flush=async()=>{for(let i=0;i<12;i++)await settle();};
const ACTIVE=Object.freeze({version:'own-f931-history-admission.v1',activated:true,sourceCommit:'4dc2c19b7549e07e1cad52b16924d25f87ea5589',epoch:'201',target:{major:18,projectId:'wild-cake-87689498',branchId:'br-plain-dawn-ac8crb1h',endpointId:'ep-falling-rain-aca27ph1',database:'neondb',role:'neondb_owner'},protocol:'1'.repeat(32),mode:'install_fresh',custodyRunSha256:'d'.repeat(64),capacityPostflightSha256:'a'.repeat(64),ledgerProjectionSha256:'b'.repeat(64),facades:{census:'5'.repeat(64),groupFull:'2'.repeat(64),liquidationDetailFull:'8'.repeat(64)},durableProofSha256:'c'.repeat(64)});
const auth=caps=>({ok:true,authenticated:true,sessionVersion:2,user:{id:'f931-synthetic',email:'f931@example.invalid'},access:{context:'tenant',tenant:{id:'aaaaaaaa-0000-4000-8000-000000000001',roleKey:'test'},tenantCapabilities:[...caps]},expiresAt:'2099-01-01T00:00:00Z'});
const stream=bytes=>new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=65536)c.enqueue(bytes.subarray(i,i+65536));c.close();}});
function harness(t,{admission,fixture}={}){
 const saved=new Map(['document','window','fetch','setTimeout','clearTimeout','setInterval','clearInterval','URL'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)])),root=new Element(),head=new Element('head'),docEvents=events(),winEvents=events(),requests=[],intervals=[],urls={created:0,revoked:0,clicked:0,removed:0,blobs:[],filenames:[]};
 const f=fixture??jurisdictionFixture(4,()=>'42'),state={f,census:reportCensusFixture(f),receipts:structuredClone(f.receipts),captures:structuredClone(f.details[0].captures),fiscal:null,caps:OWN_CLOSE_NOMINAL,failure:null,oversize:null,sessionStatus:200};
 const doc={...docEvents,hidden:false,head,body:new Element('body'),createElement:tag=>{const n=new Element(tag);if(tag==='a'){n.click=()=>{urls.clicked++;urls.filenames.push(n.download);};n.remove=()=>{const p=n.parentElement;if(p)p.children=p.children.filter(c=>c!==n);n.parentElement=null;n.isConnected=false;urls.removed++;};}return n;},querySelector:s=>head.querySelector(s)};
 Object.assign(globalThis,{document:doc,window:winEvents,setTimeout:()=>1,clearTimeout(){},setInterval(fn,ms){intervals.push({fn,ms,cleared:false});return intervals.length;},clearInterval(id){if(intervals[id-1])intervals[id-1].cleared=true;},URL:Object.assign(function URLShim(...a){return new (saved.get('URL').value)(...a);},{createObjectURL(blob){urls.created++;urls.blobs.push(blob);return 'blob:synthetic-'+urls.created;},revokeObjectURL(){urls.revoked++;}})});
 globalThis.fetch=async(url,options={})=>{const q=new (saved.get('URL').value)(url,'https://synthetic.invalid'),entry={url,options,query:q.searchParams,signal:options.signal};requests.push(entry);
  const reply=(status,data,{full=false,announced}={})=>{const bytes=new TextEncoder().encode(JSON.stringify(data));return {ok:status<400,status,headers:{get:name=>name==='content-type'?(full?OWN_RUN_FULL_JSON:'application/json'):name==='x-municontrol-json-bytes'?(full?String(announced??bytes.length):null):null},body:stream(bytes),async json(){return JSON.parse(new TextDecoder().decode(bytes));}};};
  if(q.pathname==='/api/internal-auth'){if(state.authOverride)return state.authOverride(reply,entry);return state.sessionStatus===200?reply(200,auth(state.caps)):reply(state.sessionStatus,{ok:false,code:'UNAUTHENTICATED',error:'La sesión venció.'});}
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
 return {q,requests,state,urls,start,complete,events:docEvents,windowEvents:winEvents,tickPoll(){const interval=intervals.find(x=>!x.cleared&&x.ms===20000);assert.ok(interval,'session polling interval required');return interval.fn();}};
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
 await h.q('csv').emit('click');await h.complete();assert.equal(h.urls.created,1);assert.equal(h.q('status').textContent,'Control de revisión descargado. No es un TXT fiscal ni acredita presentación.');
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

for(const [label,admission]of [['operational',INACTIVE],['historical',ACTIVE]]){
 test(label+' empty review explains missing own closures without presenting zero fiscal facts as completed work',async t=>{
  const value=await fiscalCoverageFixture(0),h=harness(t,{admission,fixture:value.report});
  await h.start();h.state.fiscal=value.census;await h.q('form').emit('submit');await h.complete();
  assert.equal(h.q('view').hidden,false,h.q('status').textContent);
  assert.equal(h.q('empty').hidden,false);assert.equal(h.q('populated').hidden,true);
  assert.match(h.q('empty-copy').textContent,/no encontró cierres propios/);
  assert.equal(h.q('status').getAttribute('role'),'status');
  assert.match(h.q('status').textContent,new RegExp('Sin liquidaciones propias cerradas en '+value.params.period));
  assert.equal(h.q('empty').querySelector('a').getAttribute('href'),'/nomina#cierre');
  assert.equal(h.q('empty').querySelectorAll('a')[1].getAttribute('href'),'/nomina#calculo');
  assert.equal(h.q('technical').open,false);assert.equal(h.q('technical').getAttribute('open'),null);
  assert.equal(h.q('requirements').children.length,4,'fiscal requirements remain visible');
  assert.equal(h.q('coverage').textContent.includes('0 de 0 contratos con revisión vigente'),false);
  assert.equal(h.requests.some(r=>r.options.method&&r.options.method!=='GET'),false);
  assert.equal(h.requests.some(r=>r.query.get('resource')==='group'),false);
  assert.equal(h.requests.some(r=>r.url.startsWith('/api/internal-own-payroll-liquidation')),false);
 });
}

test('jurisdiction with zero selected contracts is not an empty universe and retains all pending fiscal work',async t=>{
 const h=harness(t,{admission:ACTIVE});await h.start();
 h.state.fiscal=await fiscalCensusFor(h.state.receipts[0],h.state.captures);
 await h.q('form').emit('submit');await h.complete();
 const requirements=h.q('requirements').textContent;
 h.q('jurisdiction').value='55';await h.q('jurisdiction').emit('change');
 await h.q('form').emit('submit');await h.complete();
 assert.equal(h.q('view').hidden,false,h.q('status').textContent);
 assert.equal(h.q('empty').hidden,true);assert.equal(h.q('populated').hidden,false);
 assert.match(h.q('count').textContent,/0 participaciones en Jurisdicción 55 de 4 del alcance completo/);
 assert.equal(h.q('selection-note').hidden,false);assert.match(h.q('selection-note').textContent,/conserva 4 participaciones/);
 assert.match(h.q('status').textContent,/Sin participaciones en Jurisdicción 55.*4 participaciones del alcance completo/);
 assert.match(h.q('contract-count').textContent,/4 contratos distintos/);
 assert.equal(h.q('requirements').textContent,requirements);
 assert.ok(h.requests.every(r=>!r.query.has('jurisdiction')),'scope selection must not trim source queries');
});

test('an excluded reopened group remains explicit in the empty historical review',async t=>{
 const h=harness(t,{admission:ACTIVE}),emptyFiscal=await fiscalCoverageFixture(0);await h.start();
 h.state.census=reportCensusFixture(h.state.f,{reopened:[reopenEvent(h.state.receipts[0].groupId)]});
 h.state.fiscal=emptyFiscal.census;await h.q('form').emit('submit');await h.complete();
 assert.equal(h.q('view').hidden,false,h.q('status').textContent);
 assert.equal(h.q('empty').hidden,false);assert.equal(h.q('populated').hidden,true);
 assert.match(h.q('empty-copy').textContent,/1 grupo reabierto excluido/);
 assert.match(h.q('coverage').textContent,/1 grupos reabiertos excluidos/);
 assert.equal(h.requests.some(r=>r.query.get('resource')==='group'),false);
 assert.equal(h.requests.some(r=>r.url.startsWith('/api/internal-own-payroll-liquidation')),false);
});

test('compact manual reaches all 60 fields; search cannot trim the downloaded control and invalidation retires every region',async t=>{
 const h=harness(t,{admission:ACTIVE,fixture:jurisdictionFixture(61,()=>'42')});await h.start();
 h.state.fiscal=await fiscalCensusFor(h.state.receipts[0],h.state.captures);
 await h.q('form').emit('submit');await h.complete();
 assert.equal(h.q('view').hidden,false,h.q('status').textContent);
 assert.equal(h.q('technical').open,false);
 const body=h.q('fields').querySelector('tbody');assert.equal(body.children.length,60);
 assert.equal(new Set(body.children.map(row=>row.children[0].textContent.split(' · ')[0])).size,60);
 assert.match(body.children.at(-1).children[0].textContent,/^60 · /);
 assert.ok(h.q('fields').querySelector('caption'));assert.equal(h.q('fields').getAttribute('tabindex'),'0');
 assert.equal(h.q('contract-rows').querySelectorAll('article').length,20);
 await h.q('contract-next').emit('click');await h.q('contract-next').emit('click');await h.q('contract-next').emit('click');
 assert.equal(h.q('contract-rows').querySelectorAll('article').length,1,'contract pagination remains separate');
 await h.q('csv').emit('click');await h.complete();const full=await h.urls.blobs[0].text();
 h.q('search').value='no-such-synthetic-field';await h.q('search').emit('input');
 assert.equal(h.q('fields').querySelector('tbody').children.length,0);
 await h.q('csv').emit('click');await h.complete();assert.equal(await h.urls.blobs[1].text(),full);
 assert.equal((full.match(/"Campo \d+ ·/g)??[]).length,60);
 assert.match(h.urls.filenames[0],/^municontrol_control_revision_F931_.*\.csv$/);
 assert.equal(full.includes(h.state.receipts[0].groupId),false);
 // The minimal DOM does not bubble events; dispatch the fieldset's real change listener.
 h.q('technical').open=true;h.q('period').value='2026-08';await h.q('target').emit('change');
 assert.equal(h.q('view').hidden,true);assert.equal(h.q('empty').hidden,true);assert.equal(h.q('populated').hidden,true);
 assert.equal(h.q('technical').open,false);assert.equal(h.q('fields').children.length,0);assert.equal(h.q('contract-rows').children.length,0);
 assert.equal(h.urls.revoked,2);const before=h.urls.created;await h.q('csv').emit('click');assert.equal(h.urls.created,before);
});

test('background session polling preserves focused controls, nodes and live regions during pending and identical success',async t=>{
 const h=harness(t,{admission:ACTIVE});await h.start();h.state.fiscal=await fiscalCensusFor(h.state.receipts[0],h.state.captures);await h.q('form').emit('submit');await h.complete();
 const search=h.q('search'),table=h.q('fields').querySelector('table'),legajos=h.q('contract-rows').children.slice(),disabledWrites=[],liveWrites=[];document.activeElement=search;
 for(const key of ['search','contract-search','contract-state','csv']){const n=h.q(key);let value=n.disabled;Object.defineProperty(n,'disabled',{configurable:true,get:()=>value,set(next){disabledWrites.push([key,next]);if(next&&document.activeElement===n)document.activeElement=null;value=next;}});}
 const text=Object.getOwnPropertyDescriptor(Element.prototype,'textContent');for(const key of ['status','page','contract-count','contract-page']){const n=h.q(key);Object.defineProperty(n,'textContent',{configurable:true,get(){return text.get.call(this);},set(value){liveWrites.push(key);text.set.call(this,value);}});}
 let release;h.state.authOverride=reply=>new Promise(resolve=>{release=()=>resolve(reply(200,auth(OWN_CLOSE_NOMINAL)));});const at=h.requests.length;h.tickPoll();await flush();
 try{
  assert.equal(h.requests.length,at+1);assert.equal(h.requests.at(-1).url,'/api/internal-auth');assert.equal(h.q('target').disabled,false);assert.equal(document.activeElement,search);assert.deepEqual(disabledWrites,[]);assert.equal(h.q('fields').querySelector('table'),table);assert.ok(h.q('contract-rows').children.length===legajos.length&&h.q('contract-rows').children.every((row,i)=>row===legajos[i]));assert.deepEqual(liveWrites,[]);
  release();await flush();assert.equal(h.q('view').hidden,false);assert.equal(document.activeElement,search);assert.deepEqual(disabledWrites,[]);assert.equal(h.q('fields').querySelector('table'),table);assert.ok(h.q('contract-rows').children.length===legajos.length&&h.q('contract-rows').children.every((row,i)=>row===legajos[i]));assert.deepEqual(liveWrites,[]);
 }finally{release?.();await flush();}
});

for(const kind of ['401','403','changed-account','revoked-capability']){
 test('background session polling withdraws on '+kind+' and permits explicit renewed access',async t=>{
  const h=harness(t,{admission:ACTIVE});await h.start();h.state.fiscal=await fiscalCensusFor(h.state.receipts[0],h.state.captures);await h.q('form').emit('submit');await h.complete();await h.q('csv').emit('click');await h.complete();assert.equal(h.urls.created,1);
  if(kind==='changed-account')h.state.authOverride=reply=>reply(200,{...auth(OWN_CLOSE_NOMINAL),user:{id:'another-synthetic-account',email:'other@example.invalid'}});else if(kind==='revoked-capability')h.state.caps=[];else h.state.sessionStatus=Number(kind);
  h.tickPoll();await flush();assert.equal(h.q('view').hidden,true);assert.equal(h.q('fields').children.length,0);assert.equal(h.q('contract-rows').children.length,0);assert.equal(h.q('technical').open,false);assert.equal(h.q('csv').disabled,true);assert.equal(h.q('access').hidden,false);assert.equal(h.q('login').hidden,kind!=='401');assert.equal(h.urls.revoked,1);
  h.state.authOverride=null;h.state.caps=OWN_CLOSE_NOMINAL;h.state.sessionStatus=200;await h.q('access').emit('click');await h.complete();await h.q('form').emit('submit');await h.complete();assert.equal(h.q('view').hidden,false,h.q('status').textContent);
 });
}

for(const terminal of ['visibilitychange','pagehide']){
 test('a late successful poll cannot restore or write a review retired by '+terminal,async t=>{
  const h=harness(t,{admission:ACTIVE});await h.start();h.state.fiscal=await fiscalCensusFor(h.state.receipts[0],h.state.captures);await h.q('form').emit('submit');await h.complete();
  let release;h.state.authOverride=reply=>new Promise(resolve=>{release=()=>resolve(reply(200,auth(OWN_CLOSE_NOMINAL)));});h.tickPoll();await flush();const pending=h.requests.at(-1);h.state.authOverride=null;
  try{
   if(terminal==='visibilitychange'){document.hidden=true;h.events.dispatch('visibilitychange');}else h.windowEvents.dispatch('pagehide');assert.equal(pending.signal.aborted,true);assert.equal(h.q('view').hidden,true);assert.equal(h.q('csv').disabled,true);
   const login=h.q('login');let hidden=login.hidden,writes=0;Object.defineProperty(login,'hidden',{configurable:true,get:()=>hidden,set(value){writes++;hidden=value;}});release();await flush();assert.equal(writes,0,'retired callbacks cannot write even login state');assert.equal(h.q('view').hidden,true);assert.equal(h.q('fields').children.length,0);assert.equal(h.q('contract-rows').children.length,0);
   if(terminal==='visibilitychange'){document.hidden=false;h.events.dispatch('visibilitychange');assert.equal(h.q('target').disabled,true);assert.equal(h.q('access').hidden,false);}
  }finally{release?.();await flush();}
 });
}

test('foreground reconsultation aborts a session poll and ignores its late failure',async t=>{
 const h=harness(t,{admission:ACTIVE});await h.start();h.state.fiscal=await fiscalCensusFor(h.state.receipts[0],h.state.captures);await h.q('form').emit('submit');await h.complete();
 let release;h.state.authOverride=reply=>new Promise(resolve=>{release=()=>resolve(reply(401,{ok:false,code:'UNAUTHENTICATED',error:'Synthetic late session result'}));});h.tickPoll();await flush();const pending=h.requests.at(-1);h.state.authOverride=null;
 try{
  await h.q('form').emit('submit');await h.complete();assert.equal(pending.signal.aborted,true);assert.equal(h.q('view').hidden,false);const freshTable=h.q('fields').querySelector('table'),freshStatus=h.q('status').textContent;release();await flush();assert.equal(h.q('view').hidden,false);assert.equal(h.q('fields').querySelector('table'),freshTable);assert.equal(h.q('status').textContent,freshStatus);assert.equal(h.q('login').hidden,true);assert.equal(h.q('target').disabled,false);
 }finally{release?.();await flush();}
});
