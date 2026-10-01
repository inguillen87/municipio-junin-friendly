// Executes the full panel with a minimal DOM double, real models/services and
// synthetic SQL fixtures. This is integration coverage, not browser/layout QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as model from '../assets/payroll-grh-import-model.js';
import {reviewGrhImport,prepareGrhImport} from '../lib/internal-grh-import.js';
import {GRH_GUARDED_PREPARE_SQL} from '../lib/grh-import-prepare-sql.js';
import {fixture,caps,id,principal,session} from './fixtures/grh-import-synthetic.js';

async function panel(t,count=12){
 const f=fixture(count),downloads=[],urls=new Map(),requests=[],listeners=new Map(),windowListeners=new Map();
 const state={deny:false,bootstrapCaps:[...caps],binding:id(4),hold:null,badReceipt:false};
 let urlId=0;
 class Element{
  constructor(tag='div'){this.tagName=tag;this.value='';this.textContent='';this.disabled=false;this.hidden=false;this.children=[];this.dataset={};this.attributes={};}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=[...items];}
  setAttribute(key,value){this.attributes[key]=value;}
  removeAttribute(key){delete this.attributes[key];if(key==='href')delete this.href;}
  focus(){}
  remove(){}
  click(){if(this.tagName==='a')downloads.push({name:this.download,blob:urls.get(this.href)});else return this.onclick?.();}
 }
 const html=fs.readFileSync('importar-novedades-grh.html','utf8'),elements=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],new Element()]));
 const q=id=>{assert.ok(elements.has(id),'panel element '+id+' exists in actual HTML');return elements.get(id);};
 const document={hidden:false,body:new Element(),getElementById:q,createElement:tag=>new Element(tag),addEventListener:(type,fn)=>listeners.set(type,fn)};
 const window={MuniControlCapabilityGate:{ready:Promise.resolve({tenantCapabilities:[...caps]})},addEventListener:(type,fn)=>windowListeners.set(type,fn)};
 const saved=new Map(),query=f.runtime.query;
 f.runtime.query=async(sql,args)=>{if(sql!==GRH_GUARDED_PREPARE_SQL)return query(sql,args);if(saved.has(args[5])){const replay=structuredClone(saved.get(args[5]));replay[0].result.receipt.replayed=true;return replay;}const result=await query(sql,args);saved.set(args[5],structuredClone(result));return result;};
 const fetch=async(url,options)=>{
  assert.ok(url.startsWith('/api/internal-payroll-novelties'),'no other API');
  requests.push({url,method:options.method??'GET',body:options.body,headers:options.headers});
  let data,status=200;
  if(!options.body){
   if(state.hold)await state.hold;
   if(options.signal?.aborted)throw Object.assign(Error('aborted'),{name:'AbortError'});
   if(state.deny){status=403;data={ok:false};}
   else data={ok:true,principal:{tenantId:id(1),membershipId:id(2),certifiedBindingId:state.binding,capabilities:state.bootstrapCaps}};
  }else{
   const body=JSON.parse(options.body);
   if(body.command==='grhPreview')data={ok:true,replayed:false,...await reviewGrhImport(f.readSql,f.runtime,principal(),session(),body.payload)};
   else{
    assert.equal(body.command,'grhPrepare');data={ok:true,replayed:false,...await prepareGrhImport(f.readSql,f.runtime,principal(),session(),body.payload,options.headers['Idempotency-Key'])};
    if(state.badReceipt){state.badReceipt=false;data.data.savedRows=0;}
   }
  }
  return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store'}});
 };
 const source=fs.readFileSync('assets/payroll-grh-import-panel.js','utf8');
 assert.match(source,/^import \{[^\n]+\} from '\.\/payroll-grh-import-model\.js';/);
 const executable=source.replace(/^import (\{[^\n]+\}) from '\.\/payroll-grh-import-model\.js';/,'const $1 = model;');
 await vm.runInNewContext('(async()=>{'+executable+'\n})()',{model,document,window,fetch,Uint8Array,Map,Set,AbortController,AbortSignal,TextDecoder,Blob,crypto,structuredClone,setTimeout,clearTimeout,URL:{createObjectURL:blob=>{const url='blob:test-'+(++urlId);urls.set(url,blob);return url;},revokeObjectURL:url=>urls.delete(url)},Option:class extends Element{constructor(text,value){super('option');this.textContent=text;this.value=value;}}});
 q('concept').value='614';q('period').value='2026-08';
 const bytes=Uint8Array.from(Buffer.from(f.payload.contentBase64,'base64'));
 q('file').files=[{name:'synthetic.txt',size:bytes.length,arrayBuffer:async()=>bytes.slice().buffer}];
 const event=(type,detail)=>listeners.get(type)?.({detail});
 const dispose=()=>windowListeners.get('pagehide')?.();t.after(dispose);
 return {f,q,state,requests,downloads,urls,document,event,dispose,review:()=>q('importForm').onsubmit({preventDefault(){}}),download:()=>q('downloadIncidents').onclick(),hold:()=>{let release;state.hold=new Promise(resolve=>{release=resolve;});return()=>{state.hold=null;release();};}};
}

test('full panel downloads all pages despite filters, without a write or nominal CSV',async t=>{
 const h=await panel(t,125);h.f.state.records=[];await h.review();
 const before=h.requests.length;
 h.q('search').value='nothing';h.q('search').oninput();await h.download();
 assert.equal(h.downloads.length,1);assert.equal(h.downloads[0].name,'incidencias-importacion.csv');
 const csv=await h.downloads[0].blob.text();assert.equal(csv.trimEnd().split('\r\n').length,126);assert.match(csv,/"125","Vínculo no encontrado"/);assert.doesNotMatch(csv,/99000001|12345|Persona|11111111-/);
 assert.deepEqual(h.requests.slice(before).map(r=>[r.method,r.url]),[['GET','/api/internal-payroll-novelties?resource=bootstrap']]);assert.equal(h.f.state.writes,0);
 h.dispose();assert.equal(h.urls.size,0);
});

for(const field of ['file','concept','period','profile','payrollType'])test('panel invalidates incident download when '+field+' changes',async t=>{
 const h=await panel(t);await h.review();assert.equal(h.q('downloadIncidents').disabled,false);
 (h.q(field).onchange??h.q(field).oninput)();assert.equal(h.q('downloadIncidents').disabled,true);
 const before=h.requests.length;await h.download();assert.equal(h.downloads.length,0);assert.equal(h.requests.length,before);
});

test('choosing a contract retires the report until a new verified preview',async t=>{
 const h=await panel(t,1);h.f.state.records.push({...h.f.state.records[0],contractId:id(800),legajo:'4001'});await h.review();
 const select=h.q('rows').children[0].children[2].children.find(e=>e.tagName==='select');select.value=id(800);select.onchange();
 await h.download();assert.equal(h.downloads.length,0);assert.match(h.q('reportStatus').textContent,/invalidado/);
 await h.review();await h.download();assert.match(await h.downloads[0].blob.text(),/Sin observaciones/);
});

for(const capability of caps)test('revoking '+capability+' retires the report via capability event',async t=>{
 const h=await panel(t);await h.review();h.event('municontrol:capabilities-ready',{tenantCapabilities:caps.filter(c=>c!==capability)});await h.download();
 assert.equal(h.q('previewPanel').hidden,true);assert.equal(h.q('downloadIncidents').disabled,true);assert.equal(h.downloads.length,0);assert.equal(h.f.state.writes,0);
});

for(const cause of ['server-denial','missing-capability','binding-change'])test('download rechecks current authorization: '+cause,async t=>{
 const h=await panel(t);await h.review();
 if(cause==='server-denial')h.state.deny=true;
 if(cause==='missing-capability')h.state.bootstrapCaps=caps.filter(c=>c!=='workforce.employee.read');
 if(cause==='binding-change')h.state.binding=id(99);
 await h.download();assert.equal(h.downloads.length,0);assert.equal(h.q('previewPanel').hidden,true);assert.equal(h.q('downloadIncidents').disabled,true);assert.equal(h.f.state.writes,0);
});

for(const cause of ['file','concept','visibility','pagehide','revocation'])test('late authorization cannot download an invalidated preview: '+cause,async t=>{
 const h=await panel(t);await h.review();const release=h.hold(),download=h.download();
 if(cause==='file')h.q('file').onchange();
 if(cause==='concept')h.q('concept').oninput();
 if(cause==='visibility'){h.document.hidden=true;h.event('visibilitychange');}
 if(cause==='pagehide')h.dispose();
 if(cause==='revocation')h.event('municontrol:capabilities-ready',{tenantCapabilities:[]});
 release();await download;assert.equal(h.downloads.length,0);assert.equal(h.q('downloadIncidents').disabled,true);assert.equal(h.urls.size,0);
});

test('download during uncertain save preserves the exact retry body/key and one synthetic write',async t=>{
 const h=await panel(t);await h.review();h.state.badReceipt=true;await h.q('saveButton').onclick();
 assert.match(h.q('writeMessage').textContent,/puede haberse guardado/);
 const writes=()=>h.requests.filter(r=>r.body&&JSON.parse(r.body).command==='grhPrepare');
 const before=structuredClone(writes());await h.download();assert.deepEqual(writes(),before);assert.equal(h.downloads.length,1);
 await h.q('retryButton').onclick();assert.equal(writes().length,2);assert.deepEqual(writes()[0],writes()[1]);assert.equal(h.f.state.writes,1);assert.match(h.q('writeMessage').textContent,/guardados · 0 omitidos/);
});

test('verified receipt offers the exact saved batch for voluntary review, never a second save',async t=>{
 const h=await panel(t,60);assert.equal(h.q('savedBatchReview').hidden,true);assert.equal(h.q('savedBatchLink').href,undefined);
 await h.review();assert.equal(h.q('savedBatchReview').hidden,true);
 await h.q('saveButton').onclick();assert.equal(h.q('savedBatchReview').hidden,false);
 assert.equal(h.q('savedBatchLink').href,'novedades-nomina.html?batchId='+id(900));
 assert.equal(h.f.state.writes,1);assert.equal(h.requests.filter(r=>r.body&&JSON.parse(r.body).command==='grhPrepare').length,1);
 const html=fs.readFileSync('importar-novedades-grh.html','utf8');assert.match(html,/Revisar este lote/);assert.match(html,/no anula ni recalcula una liquidación/);
});

test('unverifiable save receipt cannot offer a guessed batch; identical retry recovers the link',async t=>{
 const h=await panel(t);await h.review();h.state.badReceipt=true;await h.q('saveButton').onclick();
 assert.equal(h.q('savedBatchReview').hidden,true);assert.equal(h.q('savedBatchLink').href,undefined);
 await h.q('retryButton').onclick();assert.equal(h.q('savedBatchReview').hidden,false);assert.equal(h.q('savedBatchLink').href,'novedades-nomina.html?batchId='+id(900));assert.equal(h.f.state.writes,1);
});

for(const cause of ['new-import','revocation','hidden'])test('saved-batch link is removed when context is retired: '+cause,async t=>{
 const h=await panel(t);await h.review();await h.q('saveButton').onclick();
 if(cause==='new-import')h.q('newButton').onclick();
 if(cause==='revocation')h.event('municontrol:capabilities-ready',{tenantCapabilities:[]});
 if(cause==='hidden'){h.document.hidden=true;h.event('visibilitychange');}
 assert.equal(h.q('savedBatchReview').hidden,true);assert.equal(h.q('savedBatchLink').href,undefined);
});
