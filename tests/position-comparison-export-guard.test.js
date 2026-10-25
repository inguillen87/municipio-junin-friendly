import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Evaluate only the mounted UI/client source. Domain, auth, hash and file
// renderers are seams: importing their real models would reach the engine.
const source=path=>fs.readFileSync(new URL('../assets/'+path,import.meta.url),'utf8');
const sha='a'.repeat(64),otherSha='b'.repeat(64),caps=['comparison.synthetic.read'];
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(check){for(let i=0;i<200;i++){if(check())return;await tick();}throw Error('Expected UI barrier was not reached');}
function harness(t,{holdCall=3,holdVerificationCall=0,holdSessionCall=0}={}){
 const listeners=new Map(),windowListeners=new Map(),requests=[],urls=[],downloads=[],rendered=[],tasks=[];let hashCalls=0,verificationCalls=0,sessionCalls=0,releaseHash,releaseVerification,releaseSession,observedClient,blobCount=0;
 class Element{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.events=new Map();this.value='';this.textContent='';this.hidden=false;this.disabled=false;this.isConnected=true;this.nodes=new Map();}
  set innerHTML(value){for(const match of value.matchAll(/data-comparison-([a-z-]+)/g))if(!this.nodes.has(match[1]))this.nodes.set(match[1],new Element());for(const [key,val]of Object.entries({active:'all',order:'number',view:'simple'}))this.nodes.get(key).value=val;}
  get firstChild(){return this.children[0];}append(...items){this.children.push(...items);}replaceChildren(...items){this.children=[...items];}
  setAttribute(key,value){this.attributes[key]=value;}querySelector(selector){return this.nodes.get(/^\[data-comparison-(.+)\]$/.exec(selector)?.[1])??null;}querySelectorAll(){return [...this.nodes.values()];}
  addEventListener(type,fn){const list=this.events.get(type)??[];list.push(fn);this.events.set(type,list);}removeEventListener(type,fn){this.events.set(type,(this.events.get(type)??[]).filter(v=>v!==fn));}
  fire(type){for(const fn of this.events.get(type)??[])fn({preventDefault(){}});}click(){if(this.tagName==='a')downloads.push({href:this.href,filename:this.download});else this.fire('click');}remove(){this.isConnected=false;}
 }
 const logout=new Element('button'),container=new Element(),document={hidden:false,head:new Element('head'),body:new Element('body'),createElement:tag=>new Element(tag),getElementById:id=>id==='logoutButton'?logout:null,querySelector:()=>null,addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:(type,fn)=>{if(listeners.get(type)===fn)listeners.delete(type);}},window={addEventListener:(type,fn)=>windowListeners.set(type,fn),removeEventListener:(type,fn)=>{if(windowListeners.get(type)===fn)windowListeners.delete(type);}};
 const fetch=async(url,options={})=>{
  requests.push({url,method:options.method??'GET'});assert.ok(!options.method||options.method==='GET','read-only UI requests');
  if(url==='/api/internal-auth'){sessionCalls++;if(holdSessionCall&&sessionCalls===holdSessionCall)await new Promise(resolve=>{releaseSession=resolve;});return new Response(JSON.stringify({key:'synthetic-owner',caps}));}
  const query=new URL(url,'https://synthetic.invalid').searchParams;assert.equal(query.get('resource'),'detail-v2');assert.equal(query.get('period').slice(0,4),query.get('year'));
  return new Response(JSON.stringify({ok:true,data:{version:'own-position-comparison.v2',year:Number(query.get('year')),period:query.get('period'),revision:Number(query.get('revision')),liquidationType:query.get('liquidationType'),groups:[{id:'synthetic-group'}]}}));
 };
 class ObservedURL extends URL{static createObjectURL(blob){urls.push(blob);return 'blob:synthetic-'+urls.length;}static revokeObjectURL(){}}
 class ObservedBlob extends Blob{constructor(...args){super(...args);blobCount++;}}
 const context=vm.createContext({document,window,fetch,URL:ObservedURL,URLSearchParams,Blob:ObservedBlob,TextEncoder,AbortController,setTimeout,clearTimeout,setInterval,clearInterval,container});
 context.clientBindings={ownRunWorkspaceAccess:v=>v,hasOwnRunAccess:(given,required)=>required.every(c=>given?.includes(c)),POSITION_MAX_RESPONSE:67108864};
 const clientSource=source('position-assignment-client.js');assert.equal([...clientSource.matchAll(/^import /gm)].length,2);
 const clientExecutable=clientSource.replace(/^import[^\n]*\n/gm,'').replace(/^export /gm,'').replaceAll('import.meta.url',JSON.stringify(new URL('../assets/position-assignment-client.js',import.meta.url).href));
 const realClient=vm.runInContext('(function(){const {ownRunWorkspaceAccess,hasOwnRunAccess,POSITION_MAX_RESPONSE}=clientBindings;'+clientExecutable+';return {createPositionClient,positionNode,positionFreeze};})()',context);
 const doc=(value,f)=>({title:'Synthetic '+value.period,columns:[{label:'Row'}],rows:Array.from({length:60},(_,i)=>[String(i+1)]),notes:['Synthetic UI fixture'],filename:'synthetic-'+value.period+'-'+f.active+'-'+f.view});
 const renderer=format=>value=>{rendered.push({format,rows:value.rows.length,filename:value.filename});return new Uint8Array([1,2,3]);};
 context.bindings={COMPARISON_READ:caps,positionComparisonQuery:v=>v,verifiedPositionComparison:async v=>{verificationCalls++;if(holdVerificationCall&&verificationCalls===holdVerificationCall)await new Promise(resolve=>{releaseVerification=resolve;});return v;},positionComparisonDocument:doc,positionComparisonVisible:(value,_search,page)=>({rows:value.rows.slice((page-1)*25,page*25),filtered:value.rows.length,total:value.rows.length,page,pages:Math.ceil(value.rows.length/25)}),emptyPositionComparisonFilters:()=>({active:'all',order:'number',view:'simple'}),verifiedAnnualBudgetBootstrap:async v=>v,budgetHash:async()=>{hashCalls++;if(holdCall&&hashCalls===holdCall)return new Promise(resolve=>{releaseHash=resolve;});return sha;},OWN_RUN_TYPES:{monthly:'Mensual'},createPositionClient:(...args)=>{const client=realClient.createPositionClient(...args),perform=client.perform;observedClient=client;client.perform=work=>{const result=perform(work);tasks.push(result);return result;};return client;},node:realClient.positionNode,positionFreeze:realClient.positionFreeze,reportCsv:renderer('csv'),reportPdf:renderer('pdf'),reportXlsx:renderer('xlsx')};
 const panelSource=source('position-comparison-panel.js');assert.equal([...panelSource.matchAll(/^import /gm)].length,5);
 const executable=panelSource.replace(/^import[^\n]*\n/gm,'').replace(/^export /gm,'').replaceAll('import.meta.url',JSON.stringify(new URL('../assets/position-comparison-panel.js',import.meta.url).href)).replace(/^if\(typeof document[^\n]*$/m,'');
 const mounted=vm.runInContext('(function(){const {COMPARISON_READ,positionComparisonQuery,verifiedPositionComparison,positionComparisonDocument,positionComparisonVisible,emptyPositionComparisonFilters,verifiedAnnualBudgetBootstrap,budgetHash,OWN_RUN_TYPES,createPositionClient,node,positionFreeze,reportCsv,reportPdf,reportXlsx}=bindings;'+executable+';return mountPositionComparison(container);})()',context);
 t.after(async()=>{mounted.dispose();releaseHash?.(sha);releaseVerification?.();releaseSession?.();await Promise.allSettled(tasks);});const q=key=>mounted.host.querySelector('[data-comparison-'+key+']');
 const submit=async(year=2026)=>{q('year').value=String(year);q('revision').value='1';q('period').value=year+'-10';q('type').value='monthly';q('query').fire('submit');await tasks.at(-1);};
 const start=format=>{q(format).fire('click');return tasks.at(-1);};
 const retire=cause=>{if(cause==='hidden'){document.hidden=true;listeners.get('visibilitychange')();}else if(cause==='revoked')listeners.get('municontrol:capabilities-ready')();else if(cause==='logout')logout.click();else if(cause==='pagehide')windowListeners.get('pagehide')();else if(cause==='disposed')mounted.dispose();else if(cause==='query')q('year').fire('input');else if(cause==='detached')mounted.host.isConnected=false;else throw Error(cause);};
 return {q,mounted,requests,urls,downloads,rendered,submit,start,retire,waitHash:()=>until(()=>Boolean(releaseHash)),waitVerification:()=>until(()=>Boolean(releaseVerification)),waitSession:()=>until(()=>Boolean(releaseSession)),release:(value=sha)=>releaseHash(value),releaseVerification:()=>releaseVerification(),releaseSession:()=>releaseSession(),get accessKey(){return observedClient.accessKey;},get hashCalls(){return hashCalls;},get blobCount(){return blobCount;}};
}

test('final hash cannot download after visibility, access, logout, pagehide, dispose, query or detach retirement',async t=>{
 for(const cause of ['hidden','revoked','logout','pagehide','disposed','query','detached']){
  const h=harness(t);await h.submit();const exporting=h.start('pdf');await h.waitHash();h.retire(cause);h.release();await exporting;
  assert.equal(h.blobCount,0,cause+' prevents Blob construction');assert.equal(h.urls.length,0,cause);assert.equal(h.downloads.length,0,cause);
 }
});
test('an old differing final hash cannot invalidate a newer verified query',async t=>{
 const h=harness(t);await h.submit();const exporting=h.start('pdf');await h.waitHash();h.retire('query');await h.submit(2027);const current=h.q('status').textContent;assert.equal(h.q('content').hidden,false);h.release(otherSha);await exporting;
 assert.equal(h.q('content').hidden,false);assert.equal(h.q('status').textContent,current);assert.match(h.q('source').textContent,/2027/);assert.equal(h.urls.length,0);assert.equal(h.downloads.length,0);
});
test('PDF Excel and CSV still download the complete captured scope with a current query',async t=>{
 for(const holdCall of [2,3])for(const format of ['pdf','xlsx','csv']){
  const h=harness(t,{holdCall});await h.submit();h.q('active').value='yes';h.q('view').value='detailed';h.q('search').value='view-only';const exporting=h.start(format);await h.waitHash();h.release();await exporting;
  assert.equal(h.blobCount,1);assert.equal(h.urls.length,1);assert.equal(h.downloads.length,1);assert.deepEqual(h.rendered,[{format,rows:60,filename:'synthetic-2026-10-yes-detailed'}]);assert.equal(h.downloads[0].filename,'synthetic-2026-10-yes-detailed.'+format);assert.ok(h.requests.every(r=>r.method==='GET'));
 }
});
test('a current differing final hash withdraws the report without producing a download',async t=>{
 const h=harness(t);await h.submit();const exporting=h.start('pdf');await h.waitHash();h.release(otherSha);await exporting;assert.equal(h.q('content').hidden,true);assert.match(h.q('status').textContent,/Cambió el cierre/);assert.equal(h.blobCount,0);assert.equal(h.downloads.length,0);
});
test('an old differing first export hash cannot invalidate a newer verified query',async t=>{
 const h=harness(t,{holdCall:2});await h.submit();const exporting=h.start('pdf');await h.waitHash();h.retire('query');await h.submit(2027);const current=h.q('status').textContent;h.release(otherSha);await exporting;
 assert.equal(h.q('content').hidden,false);assert.equal(h.q('status').textContent,current);assert.match(h.q('source').textContent,/2027/);assert.equal(h.rendered.length,0);assert.equal(h.urls.length,0);assert.equal(h.downloads.length,0);
});
test('retirement during the first export hash cannot render, request detail or restore access',async t=>{
 for(const cause of ['logout','hidden','pagehide','revoked','query','disposed']){
  const h=harness(t,{holdCall:2});await h.submit();const exporting=h.start('pdf');await h.waitHash();h.retire(cause);const sent=h.requests.length;assert.equal(h.accessKey,undefined);h.release();await exporting;
  assert.deepEqual({additionalRequests:h.requests.length-sent,renders:h.rendered.length,accessKey:h.accessKey,blobs:h.blobCount,downloads:h.downloads.length},{additionalRequests:0,renders:0,accessKey:undefined,blobs:0,downloads:0},cause+' stops before every stale effect');
 }
});
for(const holdVerificationCall of [2,3])test('retirement during asynchronous export verification '+holdVerificationCall+' fences the next hash or session request',async t=>{
  const h=harness(t,{holdCall:0,holdVerificationCall});await h.submit();const exporting=h.start('pdf');await h.waitVerification();h.retire('logout');const sent=h.requests.length,rendered=h.rendered.length,hashed=h.hashCalls;h.releaseVerification();await exporting;
  assert.deepEqual({additionalRequests:h.requests.length-sent,renders:h.rendered.length-rendered,hashes:h.hashCalls-hashed,accessKey:h.accessKey,blobs:h.blobCount,downloads:h.downloads.length},{additionalRequests:0,renders:0,hashes:0,accessKey:undefined,blobs:0,downloads:0},'read verification '+holdVerificationCall+' is withdrawn before further work');
});
test('a current differing first export hash withdraws the source before rendering',async t=>{
 const h=harness(t,{holdCall:2});await h.submit();const exporting=h.start('pdf');await h.waitHash();h.release(otherSha);await exporting;assert.equal(h.q('content').hidden,true);assert.match(h.q('status').textContent,/Cambió el cierre o la fuente/);assert.equal(h.rendered.length,0);assert.equal(h.blobCount,0);assert.equal(h.downloads.length,0);
});
test('an export waiting for its initial session cannot read a newer query after retirement',async t=>{
 const h=harness(t,{holdCall:0,holdSessionCall:3});await h.submit();const exporting=h.start('pdf');await h.waitSession();h.retire('query');await h.submit(2027);const sent=h.requests.length,current=h.q('status').textContent;h.releaseSession();await exporting;
 assert.equal(h.requests.length,sent);assert.equal(h.rendered.length,0);assert.equal(h.q('content').hidden,false);assert.equal(h.q('status').textContent,current);assert.match(h.q('source').textContent,/2027/);assert.equal(h.blobCount,0);
});
