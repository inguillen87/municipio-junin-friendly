import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import {webcrypto} from 'node:crypto';
import {build} from 'esbuild';

// Real review/preparation/navigation models, a unit DOM, and virtual HTTP time.
// Child workspaces are outside this read-only controller test and stay inert.
const root=process.cwd(),fromRoot=file=>import(pathToFileURL(path.join(root,file)));
const {reviewRaw,reviewId}=await fromRoot('tests/fixtures/employment-adoption-review-synthetic.js');
const {mixedAdoptionRaw}=await fromRoot('tests/fixtures/mixed-contract-adoption-synthetic.js');
const {sealAdoptionReview,verifiedAdoptionReview,adoptionReviewCsv}=await fromRoot('assets/employment-adoption-review-model.js');
const {catalogVersion,session}=await fromRoot('tests/fixtures/employment-adoption-preparation-synthetic.js');
const candidate=fs.readFileSync(new URL('../assets/employment-adoption-review-ui.js',import.meta.url),'utf8');
const childMounts=new Map([
 ['employment-adoption-preparation-ui.js','export function mountAdoptionPreparation(root){return{invalidate(){root.lastReview=null;},setReview(value){root.lastReview=value;}};}'],
 ['municipal-adoption-operator-ui.js','export function mountMunicipalAdoptionOperator(){return{invalidate(){},refreshControls(){},async openNavigation(){}};}'],
 ['municipal-owner-adoption-workspace.js','export function mountMunicipalOwnerAdoption(){return{invalidate(){},setReview(){},refreshControls(){}};}']
]);
const bundle=build({stdin:{contents:candidate,sourcefile:'employment-adoption-review-ui.js',resolveDir:path.join(root,'assets')},bundle:true,write:false,format:'cjs',platform:'browser',logLevel:'silent',plugins:[{name:'inert-child-workspaces',setup(b){
 b.onResolve({filter:/^\.\/(?:employment-adoption-preparation-ui|municipal-adoption-operator-ui|municipal-owner-adoption-workspace)\.js$/},args=>({path:path.basename(args.path),namespace:'inert-child'}));
 b.onLoad({filter:/.*/,namespace:'inert-child'},args=>({contents:childMounts.get(args.path),loader:'js'}));
}}]});

class Element{
 constructor(tag='div'){Object.assign(this,{tagName:tag,children:[],events:new Map(),queries:new Map(),attributes:new Map(),dataset:{},isConnected:true,hidden:false,disabled:false,open:true,value:'',textContent:''});}
 append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=[...nodes];}
 setAttribute(k,v){this.attributes.set(k,String(v));}getAttribute(k){return this.attributes.get(k)??null;}
 querySelector(s){if(!this.queries.has(s))this.queries.set(s,new Element());return this.queries.get(s);}
 querySelectorAll(s){return s==='button'?this.children.filter(n=>n.tagName==='button'):[];}
 closest(){return null;}cloneNode(){return new Element(this.tagName);}
 addEventListener(k,fn){this.events.set(k,fn);}focus(){}remove(){this.removed=true;}
}
async function harness({own=false,initialPlan=()=>({})}={}){
 const listeners=new Map(),host=new Element(),field=k=>host.querySelector('[data-ar-'+k+']'),calls=[],deadlines=[],downloads=[],transportErrors=[];
 let now=0,plan=initialPlan;
 const normal=await sealAdoptionReview(reviewRaw()),mixed=await sealAdoptionReview(mixedAdoptionRaw());
 const document={hidden:false,body:new Element('body'),querySelector:()=>null,createElement:t=>{const e=new Element(t);if(t==='a')e.click=()=>downloads.push({name:e.download,href:e.href});return e;},createTextNode:v=>v,getElementById:()=>null,addEventListener:(k,fn)=>listeners.set(k,fn)};
 for(const k of ['own','result'])field(k).hidden=true;
 const advance=ms=>{now+=ms;for(const d of deadlines)if(now>=d.at&&!d.controller.signal.aborted)d.controller.abort(new DOMException('Virtual HTTP deadline','TimeoutError'));};
 const signals={any:AbortSignal.any.bind(AbortSignal),timeout(ms){assert.equal(ms,30000);const controller=new AbortController();deadlines.push({at:now+ms,controller});return controller.signal;}};
 const blobs=new Map();class FixtureURL extends URL{static createObjectURL(blob){const key='blob:synthetic-'+(blobs.size+1);blobs.set(key,blob);return key;}static revokeObjectURL(){}}
 const transport=async(url,options={})=>{
  const u=new URL(url,'https://fixture.invalid'),resource=u.searchParams.get('resource'),kind=u.pathname==='/api/internal-auth'?'access':resource==='employmentadoptionreview'?'review':resource;
  const row={kind,method:options.method??'GET',url,signal:options.signal};calls.push(row);assert.equal(row.method,'GET','This review must never POST');
  const step=await plan(row,calls)??{};advance(step.elapsed??0);options.signal?.throwIfAborted();
  let value,status=step.status??200;
  if(kind==='access')value={ok:status===200,authenticated:status===200,user:{email:step.actor??session.email},access:{context:'tenant',tenant:{id:normal.scope.tenantId},tenantCapabilities:step.capabilities??['workforce.employee.read']}};
  else if(kind==='review')value={ok:true,data:step.review??normal};
  else if(kind==='mixed-sources'||kind==='final-sources'){const s=mixed.source.finalRevision;value={ok:true,data:{version:kind==='mixed-sources'?'employment-adoption-final-sources.v2':'employment-adoption-final-sources.v1',scope:mixed.scope,total:1,rows:[{revisionId:s.revisionId,packageSha256:s.packageSha256,cutoff:s.cutoff}]}};}
  else if(kind==='mixed-bootstrap')value={ok:true,data:{version:'employment-adoption-preparation.v8',review:step.review??mixed,catalogVersion,canPrepare:true,applicationAvailable:false,attempts:[]}};
  else if(kind==='bootstrap')value={ok:true,data:{version:'employment-adoption-preparation.v1',review:step.review??normal,catalogVersion,canPrepare:true,applicationAvailable:false,attempts:[]}};
  else throw Error('Unadmitted mock route: '+kind);
  if(step.hide){document.hidden=true;listeners.get('visibilitychange')();}
  const body=async()=>{advance(step.bodyElapsed??0);options.signal?.throwIfAborted();return value;};
  return{ok:status>=200&&status<300,status,json:body,text:async()=>JSON.stringify(await body())};
 };
 const fetch=async(...args)=>{try{return await transport(...args);}catch(e){transportErrors.push(e.name);throw e;}};
 const module={exports:{}},context=vm.createContext({module,exports:module.exports,document,window:{location:{href:'https://fixture.invalid/personal'+(own?'?adopcion=pendientes#legajos':'#legajos')},addEventListener(){}},URL:FixtureURL,URLSearchParams,TextEncoder,Blob,AbortController,AbortSignal:signals,DOMException,TypeError,crypto:webcrypto,fetch,setTimeout:()=>0,console});
 vm.runInContext('globalThis.structuredClone=value=>JSON.parse(JSON.stringify(value))',context);
 new vm.Script((await bundle).outputFiles[0].text).runInContext(context);module.exports.mountAdoptionReview(host);
 const grant=()=>listeners.get('municontrol:capabilities-ready')({detail:vm.runInContext('({tenantCapabilities:new Set(["workforce.employee.read"])})',context)});
 const settle=async()=>{const end=Date.now()+5000;do{await new Promise(setImmediate);if(host.getAttribute('aria-busy')==='false')return;}while(Date.now()<end);throw Error('Review controller did not settle: '+field('status').textContent);};
 const click=async k=>{field(k).events.get('click')();await settle();};grant();if(own)await settle();
 return{field,calls,deadlines,downloads,transportErrors,normal,mixed,document,listeners,blobs,click,settle,grant,now:()=>now,setPlan:p=>{plan=p;},async selectMixed(){await click('mixed-cuts');const button=field('mixed-options').children.find(n=>n.tagName==='button');assert.ok(button,field('status').textContent);button.events.get('click')();await settle();}};
}

test('mixed-cut auth20s plus GET20s completes each full review without a chain deadline or POST',async()=>{
 const h=await harness();h.setPlan(()=>({elapsed:20000}));await h.selectMixed();
 assert.equal(h.now(),80000);assert.deepEqual(h.calls.map(r=>r.kind),['access','mixed-sources','access','mixed-bootstrap']);assert.equal(h.transportErrors.length,0);
 assert.equal(h.field('result').hidden,false,h.field('status').textContent);assert.match(h.field('counts').textContent,/63 registros.*37 activos conocidos/);
 assert.equal(h.field('preparation').lastReview.total,37);assert.equal(h.field('preparation').lastReview.rows.length,37);assert.equal(h.deadlines.length,4);assert.equal(h.downloads.length,0);
});

test('normal review and two independently authorized CSV reads keep all bytes despite a visible one-row filter',async()=>{
 const h=await harness();h.setPlan(()=>({elapsed:20000}));await h.click('consult');assert.equal(h.now(),40000);assert.equal(h.field('result').hidden,false,h.field('status').textContent);
 h.field('search').value='001';h.field('search').events.get('input')();const at=h.calls.length;await h.click('download');
 assert.equal(h.now(),120000);assert.deepEqual(h.calls.slice(at).map(r=>r.kind),['access','review','access','review']);assert.equal(h.downloads.length,1);assert.deepEqual(new Uint8Array(await h.blobs.get(h.downloads[0].href).arrayBuffer()),new TextEncoder().encode(adoptionReviewCsv(await verifiedAdoptionReview(h.normal))));
 assert.match(h.field('status').textContent,/La búsqueda no recortó el reporte/);assert.equal(h.field('preparation').lastReview.total,57);assert.equal(h.transportErrors.length,0);
});

test('a single authority deadline withdraws the review and allows only an explicit fresh GET retry',async()=>{
 const h=await harness();h.setPlan(row=>row.kind==='access'?{elapsed:30001}:{});await h.click('consult');
 assert.deepEqual(h.calls.map(r=>r.kind),['access']);assert.equal(h.field('result').hidden,true);assert.equal(h.field('rows').children.length,0);assert.equal(h.field('consult').disabled,false);assert.match(h.field('status').textContent,/se interrumpió/);
 h.setPlan(()=>({elapsed:20000}));await h.click('consult');assert.equal(h.field('result').hidden,false);assert.deepEqual(h.calls.map(r=>r.kind),['access','access','review']);assert.equal(h.downloads.length,0);
});

test('a response body shares its own HTTP deadline and cannot borrow time from another request',async()=>{
 const h=await harness();h.setPlan(row=>row.kind==='review'?{elapsed:20000,bodyElapsed:10001}:{});await h.click('consult');
 assert.equal(h.field('result').hidden,true);assert.equal(h.field('preparation').lastReview,null);assert.equal(h.field('rows').children.length,0);assert.equal(h.downloads.length,0);assert.match(h.field('status').textContent,/se interrumpió/);
});

test('hiding during a read aborts the shared controller and never restores nominal data automatically',async()=>{
 const h=await harness();h.setPlan(row=>row.kind==='review'?{hide:true}:{});await h.click('consult');
 assert.equal(h.document.hidden,true);assert.equal(h.field('result').hidden,true);assert.equal(h.field('rows').children.length,0);assert.ok(h.calls.at(-1).signal.aborted);assert.equal(h.downloads.length,0);
 const at=h.calls.length;h.document.hidden=false;h.listeners.get('visibilitychange')();assert.equal(h.calls.length,at);h.setPlan(()=>({elapsed:20000}));await h.click('consult');assert.equal(h.field('result').hidden,false);
});

test('revoked authority prevents the next data read and removes the previous nominal review',async()=>{
 const h=await harness();await h.click('consult');assert.equal(h.field('result').hidden,false,h.field('status').textContent);const at=h.calls.length;h.setPlan(row=>row.kind==='access'?{status:403,capabilities:[]}:{});await h.click('download');
 assert.deepEqual(h.calls.slice(at).map(r=>r.kind),['access']);assert.equal(h.field('consult').disabled,true);assert.equal(h.field('result').hidden,true);assert.equal(h.field('rows').children.length,0);assert.equal(h.downloads.length,0);assert.match(h.field('status').textContent,/acceso ya no permite/);
});

test('membership changes in the second full CSV read withdraw the snapshot and prevent any download',async()=>{
 const h=await harness();await h.click('consult');const changed=reviewRaw();changed.scope.membershipId=reviewId(9999);const changedReview=await sealAdoptionReview(changed);let reads=0;
 h.setPlan(row=>row.kind==='review'?{elapsed:20000,review:++reads===2?changedReview:h.normal}:{elapsed:20000});await h.click('download');
 assert.equal(reads,2);assert.equal(h.downloads.length,0);assert.equal(h.field('result').hidden,true);assert.equal(h.field('rows').children.length,0);assert.match(h.field('status').textContent,/Cambió el padrón o el ámbito/);
});

test('own proposals use fresh per-HTTP deadlines while retaining the two-account and tenant comparison',async()=>{
 const h=await harness({own:true,initialPlan:()=>({elapsed:20000})});assert.equal(h.now(),60000);assert.deepEqual(h.calls.map(r=>r.kind),['access','bootstrap','access']);assert.match(h.field('status').textContent,/no tiene comprobantes/);
 let accesses=0;h.setPlan(row=>row.kind==='access'?{actor:++accesses===2?'another-synthetic@example.invalid':session.email}:{});await h.click('own-load');
 assert.equal(h.field('own-items').children.length,0);assert.match(h.field('status').textContent,/Cambió la cuenta o el municipio/);assert.equal(h.calls.some(r=>r.method!=='GET'),false);
});
