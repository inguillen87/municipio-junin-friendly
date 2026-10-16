import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import {webcrypto} from 'node:crypto';
import {build} from 'esbuild';

// A unit DOM and virtual clock drive the real bundled controller and models.
// There is no browser, HTTP server, SQL adapter or real 30-second wait.
const root=process.cwd(),fromRoot=file=>import(pathToFileURL(path.join(root,file)));
const {mixedAdoptionRaw}=await fromRoot('tests/fixtures/mixed-contract-adoption-synthetic.js');
const {sealAdoptionReview}=await fromRoot('assets/employment-adoption-review-model.js');
const {preparationEnvelope,catalogVersion,session}=await fromRoot('tests/fixtures/employment-adoption-preparation-synthetic.js');
const candidate=fs.readFileSync(new URL('../assets/employment-adoption-preparation-ui.js',import.meta.url),'utf8');
const bundle=build({stdin:{contents:candidate,sourcefile:'employment-adoption-preparation-ui.js',resolveDir:path.join(root,'assets')},bundle:true,write:false,format:'cjs',platform:'browser',logLevel:'silent'});

class Element{
 constructor(tag='div'){Object.assign(this,{tagName:tag,children:[],events:new Map(),queries:new Map(),attributes:new Map(),dataset:{},isConnected:true,hidden:false,disabled:false,checked:false,value:'',textContent:''});}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=[...nodes];}
 setAttribute(k,v){this.attributes.set(k,String(v));}getAttribute(k){return this.attributes.get(k)??null;}
 querySelector(s){if(!this.queries.has(s))this.queries.set(s,new Element());return this.queries.get(s);}
 querySelectorAll(){return[];}closest(s){return this.querySelector('closest:'+s);}
 addEventListener(k,fn){this.events.set(k,fn);}focus(){}checkValidity(){return true;}reportValidity(){}
}
async function harness(){
 const listeners=new Map(),host=new Element(),field=k=>host.querySelector('[data-ap-'+k+']'),saved=new Map(),calls=[],deadlines=[],statuses=[],transportErrors=[];
 let now=0,plan=()=>({}),uuidCount=0,nextScope=null;
 const review=await sealAdoptionReview(mixedAdoptionRaw());
 const document={hidden:false,createElement:t=>new Element(t),createTextNode:v=>v,getElementById:()=>null,addEventListener:(k,fn)=>listeners.set(k,fn)};
 for(const k of ['panel','form','pending','history','facts','jurisdiction-panel'])field(k).hidden=true;
 field('form').querySelectorAll=()=>['jurisdiction','reference','reason','confirm','send'].map(field);
 const advance=ms=>{now+=ms;for(const d of deadlines)if(now>=d.at&&!d.controller.signal.aborted)d.controller.abort(new DOMException('Virtual operation deadline','TimeoutError'));};
 const signals={any:AbortSignal.any.bind(AbortSignal),timeout(ms){assert.equal(ms,30000);const controller=new AbortController();deadlines.push({at:now+ms,controller});return controller.signal;}};
 const bootstrap=async()=>({version:'employment-adoption-preparation.v8',review:nextScope??review,catalogVersion,canPrepare:true,applicationAvailable:false,attempts:[...saved.values()].map(v=>({...v,receipt:{...v.receipt,replayed:true}}))});
 const transport=async(url,options={})=>{
  const target=new URL(url,'https://fixture.invalid'),method=options.method??'GET',resource=target.searchParams.get('resource');
  const kind=target.pathname==='/api/internal-auth'?'access':method==='POST'?'post':resource==='attempt'?'attempt':'bootstrap';
  const row={kind,method,url,key:options.headers?.['Idempotency-Key']??target.searchParams.get('key'),bytes:options.body??null,statusAtStart:field('status').textContent};calls.push(row);statuses.push(row.statusAtStart);
  const step=plan(row,calls)??{};advance(step.elapsed??0);options.signal?.throwIfAborted();
  if(step.failBefore)throw new TypeError('Synthetic interrupted transport before response');
  let status=200,value;
  if(kind==='access')value={ok:true,authenticated:true,user:{email:step.actor??session.email},access:{tenantCapabilities:step.capabilities??['workforce.employee.read','employee.record.propose']}};
  else if(kind==='bootstrap')value={ok:true,data:await bootstrap()};
  else if(kind==='post'){const wrapper=JSON.parse(options.body);assert.deepEqual(Object.keys(wrapper).sort(),['operation','payload']);assert.equal(wrapper.operation,'propose');const body=wrapper.payload;const prior=saved.get(row.key);value={ok:true,data:prior??await preparationEnvelope(body,row.key)};saved.set(row.key,value.data);status=201;}
  else{const found=saved.get(row.key);status=found?200:404;value=found?{ok:true,data:{...found,receipt:{...found.receipt,replayed:true}}}:{ok:false,code:'EMPLOYMENT_ADOPTION_NOT_FOUND',error:'No se encontró ese intento dentro de tu cuenta y municipio.'};}
  if(step.hide){document.hidden=true;listeners.get('visibilitychange')();}
  return{ok:status>=200&&status<300,status,json:async()=>{advance(step.bodyElapsed??0);options.signal?.throwIfAborted();return value;},text:async()=>{advance(step.bodyElapsed??0);options.signal?.throwIfAborted();return JSON.stringify(value);}};
 };
 const fetch=async(...args)=>{try{return await transport(...args);}catch(e){transportErrors.push({name:e.name,message:e.message,stack:e.stack});throw e;}};
 const module={exports:{}},context=vm.createContext({module,exports:module.exports,document,window:{addEventListener(){}},URL,URLSearchParams,TextEncoder,Uint8Array,ArrayBuffer,AbortController,AbortSignal:signals,DOMException,TypeError,crypto:{subtle:webcrypto.subtle,randomUUID(){uuidCount++;return webcrypto.randomUUID();}},fetch,console});
 vm.runInContext('globalThis.structuredClone=value=>JSON.parse(JSON.stringify(value))',context);
 new vm.Script((await bundle).outputFiles[0].text).runInContext(context);
 const mounted=module.exports.mountAdoptionPreparation(host,{isLive:()=>true});
 mounted.setReview(vm.runInContext('JSON.parse('+JSON.stringify(JSON.stringify(review))+')',context));
 const grant=()=>listeners.get('municontrol:capabilities-ready')({detail:{tenantCapabilities:['workforce.employee.read','employee.record.propose']}});
 grant();field('open').events.get('click')();
 const settle=async()=>{const end=Date.now()+5000;do{await new Promise(setImmediate);if(host.getAttribute('aria-busy')==='false')return;}while(Date.now()<end);throw Error('Controller did not settle: '+field('status').textContent);};
 const click=async k=>{field(k).events.get('click')();await settle();};
 await click('load');assert.equal(field('form').hidden,false,field('status').textContent);
 const fill=()=>{field('reference').value='Resolución enteramente sintética QA';field('reason').value='Propuesta sintética completa para comprobar transporte e idempotencia';field('confirm').checked=true;field('confirm').events.get('change')();};
 fill();
 const submit=async()=>{field('form').events.get('submit')({preventDefault(){}});await settle();};
 return{field,calls,saved,statuses,transportErrors,submit,click,fill,settle,grant,document,review,now:()=>now,uuidCount:()=>uuidCount,setPlan:p=>{plan=p;},async changedScope(){const raw=mixedAdoptionRaw();raw.scope.bindingId='10000000-1000-4000-8000-000000009999';nextScope=await sealAdoptionReview(raw);}};
}

test('separate operation deadlines permit a fully fresh chain longer than thirty seconds with exactly one complete POST',async()=>{
 const h=await harness(),at=h.calls.length;h.setPlan(()=>({elapsed:20000}));await h.submit();
 assert.deepEqual(h.transportErrors,[],'Synthetic response construction must succeed: '+JSON.stringify(h.transportErrors));assert.equal(h.now(),100000);assert.deepEqual(h.calls.slice(at).map(r=>r.kind),['access','bootstrap','post','access','bootstrap']);
 const posts=h.calls.filter(r=>r.kind==='post');assert.equal(posts.length,1);assert.equal(JSON.parse(posts[0].bytes).payload.rows.length,h.review.total);assert.equal(h.uuidCount(),1);assert.equal(h.saved.size,1);
 assert.match(h.field('status').textContent,/Propuesta completa guardada/);assert.equal(h.field('pending').hidden,true);
 for(const text of ['Verificando el acceso','Verificando el padrón completo','Enviando la propuesta completa','Confirmando el mismo intento'])assert.ok(h.statuses.some(s=>s.includes(text)),text);
});

test('pre-freeze timeout keeps the form and creates neither a key nor POST; a later explicit submit performs one fresh attempt',async()=>{
 const h=await harness(),reason=h.field('reason').value;h.setPlan(row=>row.kind==='bootstrap'?{elapsed:30001}:{});await h.submit();
 assert.equal(h.calls.filter(r=>r.kind==='post').length,0);assert.equal(h.uuidCount(),0);assert.equal(h.field('reason').value,reason);assert.equal(h.field('pending').hidden,true);assert.equal(h.field('send').disabled,false);assert.match(h.field('status').textContent,/No se envió ninguna propuesta/);
 h.setPlan(()=>({elapsed:20000}));await h.submit();assert.equal(h.calls.filter(r=>r.kind==='post').length,1);assert.equal(h.uuidCount(),1);assert.match(h.field('status').textContent,/Propuesta completa guardada/);
});

test('a committed POST response timeout retains exact bytes/key; recovery looks up that key before any full bootstrap and never reposts',async()=>{
 const h=await harness();h.setPlan(row=>row.kind==='post'?{bodyElapsed:30001}:{});await h.submit();
 const original=h.calls.find(r=>r.kind==='post');assert.ok(original);assert.equal(h.saved.size,1);assert.equal(h.field('pending').hidden,false);assert.equal(h.field('send').disabled,true);
 const at=h.calls.length;h.setPlan(()=>({elapsed:20000}));await h.click('recover');
 assert.deepEqual(h.calls.slice(at).map(r=>r.kind),['access','attempt','access','bootstrap']);assert.equal(h.calls[at+1].key,original.key);assert.equal(h.calls.filter(r=>r.kind==='post').length,1);assert.equal(h.uuidCount(),1);assert.match(h.field('status').textContent,/Propuesta completa guardada/);
});

test('post-commit confirmation timeout retains the original attempt and a scoped GET recovers it without another POST',async()=>{
 const h=await harness();let posted=false;h.setPlan(row=>{if(row.kind==='post')posted=true;return posted&&row.kind==='bootstrap'?{bodyElapsed:30001}:{};});await h.submit();
 const original=h.calls.find(r=>r.kind==='post');assert.equal(h.field('pending').hidden,false);assert.equal(h.saved.size,1);h.setPlan(()=>({}));await h.click('recover');
 assert.equal(h.calls.filter(r=>r.kind==='post').length,1);assert.equal(h.calls.findLast(r=>r.kind==='attempt').key,original.key);assert.match(h.field('status').textContent,/Propuesta completa guardada/);
});

test('a 404 enables retry only after the original full scope is verified and resends exactly the frozen key and bytes',async()=>{
 const h=await harness();h.setPlan(row=>row.kind==='post'?{failBefore:true}:{});await h.submit();const original=h.calls.find(r=>r.kind==='post');
 assert.equal(h.saved.size,0);h.setPlan(()=>({}));const at=h.calls.length;await h.click('recover');assert.deepEqual(h.calls.slice(at).map(r=>r.kind),['access','attempt','access','bootstrap']);assert.equal(h.field('retry').disabled,false);
 await h.click('retry');const posts=h.calls.filter(r=>r.kind==='post');assert.equal(posts.length,2);assert.equal(posts[1].key,original.key);assert.equal(posts[1].bytes,original.bytes);assert.equal(h.uuidCount(),1);assert.equal(h.saved.size,1);
});

test('another account prevents lookup; a municipality change after 404 prevents retry and withdraws visible nominal fields',async()=>{
 const h=await harness();h.setPlan(row=>row.kind==='post'?{failBefore:true}:{});await h.submit();const before=h.calls.length;
 h.setPlan(row=>row.kind==='access'?{actor:'another-synthetic-actor@example.invalid'}:{});await h.click('recover');assert.deepEqual(h.calls.slice(before).map(r=>r.kind),['access']);assert.equal(h.saved.size,0);assert.equal(h.field('reference').value,'');assert.equal(h.field('form').hidden,true);
 h.grant();h.setPlan(()=>({}));await h.changedScope();const at=h.calls.length;await h.click('recover');assert.deepEqual(h.calls.slice(at).map(r=>r.kind),['access','attempt','access','bootstrap']);assert.equal(h.field('retry').disabled,true);assert.equal(h.field('reference').value,'');assert.equal(h.calls.filter(r=>r.kind==='post').length,1);assert.equal(h.saved.size,0);
});

test('hiding during a committed send aborts transport and withdraws fields while preserving the exact recoverable attempt',async()=>{
 const h=await harness();h.setPlan(row=>row.kind==='post'?{hide:true}:{});await h.submit();const original=h.calls.find(r=>r.kind==='post');
 assert.equal(h.saved.size,1);assert.equal(h.field('reference').value,'');assert.equal(h.field('reason').value,'');assert.equal(h.field('form').hidden,true);assert.doesNotMatch(h.field('status').textContent,/Propuesta completa guardada/);
 h.document.hidden=false;h.grant();assert.equal(h.field('pending').hidden,false);h.setPlan(()=>({}));await h.click('recover');assert.equal(h.calls.findLast(r=>r.kind==='attempt').key,original.key);assert.equal(h.calls.filter(r=>r.kind==='post').length,1);assert.equal(h.uuidCount(),1);assert.match(h.field('status').textContent,/Propuesta completa guardada/);
});
