import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Only the real UI/client sources are evaluated. Every domain/auth/hash/file
// renderer import is an explicit seam; none of the engine models is imported.
const source=path=>fs.readFileSync(new URL('../../assets/'+path,import.meta.url),'utf8');
const sha='a'.repeat(64),otherSha='b'.repeat(64),caps=['comparison.synthetic.read'];
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(check){for(let i=0;i<200;i++){if(check())return;await tick();}throw Error('Expected UI barrier was not reached');}
function harness(t,{mode='comparison',holdCall=3,holdVerificationCall=0,holdSessionCall=0,holdSessionCalls=[],holdSessionJsonCalls=[],holdDetailTextCall=0,holdPostCalls=[],holdBootstrapCalls=[],holdReceiptCall=0,manualTimers=false,initialCaps=caps}={}){
 const listeners=new Map(),windowListeners=new Map(),requests=[],urls=[],downloads=[],rendered=[],tasks=[],clients=[],authBodies=[],receiptChecks=[],captureChecks=[],releases={session:new Map(),json:new Map(),detail:new Map(),post:new Map(),receipt:new Map(),bootstrap:new Map()},timers=new Map();
 let hashCalls=0,verificationCalls=0,sessionCalls=0,detailCalls=0,postCalls=0,receiptCalls=0,bootstrapCalls=0,releaseHash,releaseVerification,blobCount=0,lastOperation,owner='synthetic-owner',authCaps=[...initialCaps];
 const sessionHolds=new Set([...holdSessionCalls,...(holdSessionCall?[holdSessionCall]:[])]),jsonHolds=new Set(holdSessionJsonCalls),postHolds=new Set(holdPostCalls),bootstrapHolds=new Set(holdBootstrapCalls),failures=new Map();
 const deferred=(kind,n)=>new Promise(resolve=>releases[kind].set(n,resolve));
 const release=(kind,n)=>{const fn=releases[kind].get(n);assert.ok(fn,'pending '+kind+' '+n);fn();};
 class Element{
  constructor(tag='div'){this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.events=new Map();this.value='';this.textContent='';this.hidden=false;this.disabled=false;this.isConnected=true;this.nodes=new Map();}
  set innerHTML(value){for(const match of value.matchAll(/data-(?:comparison|position)-([a-z-]+)/g))if(!this.nodes.has(match[1]))this.nodes.set(match[1],new Element());for(const match of value.matchAll(/<[^>]*data-(?:comparison|position)-([a-z-]+)[^>]*>/g))if(/\bhidden\b/.test(match[0]))this.nodes.get(match[1]).hidden=true;for(const [key,val]of Object.entries({active:'all',order:'number',view:'simple'}))if(this.nodes.has(key))this.nodes.get(key).value=val;}
  get firstChild(){return this.children[0];}
  append(...items){this.children.push(...items);}replaceChildren(...items){this.children=[...items];}
  setAttribute(key,value){this.attributes[key]=value;}
  querySelector(selector){if(selector==='button'){if(!this.nodes.has('button'))this.nodes.set('button',new Element('button'));return this.nodes.get('button');}return this.nodes.get(/^\[data-(?:comparison|position)-(.+)\]$/.exec(selector)?.[1])??null;}
  querySelectorAll(){return [...this.nodes.values()];}
  addEventListener(type,fn){const list=this.events.get(type)??[];list.push(fn);this.events.set(type,list);}
  removeEventListener(type,fn){this.events.set(type,(this.events.get(type)??[]).filter(v=>v!==fn));}
  fire(type){for(const fn of this.events.get(type)??[])fn({preventDefault(){}});}
  click(){if(this.tagName==='a')downloads.push({href:this.href,filename:this.download});else this.fire('click');}
  remove(){this.isConnected=false;}
 }
 const addListener=(map,type,fn)=>{const set=map.get(type)??new Set();set.add(fn);map.set(type,set);},removeListener=(map,type,fn)=>map.get(type)?.delete(fn),emit=(map,type)=>{for(const fn of [...(map.get(type)??[])])fn();};
 const logout=new Element('button'),container=new Element();
 const document={hidden:false,head:new Element('head'),body:new Element('body'),createElement:tag=>new Element(tag),getElementById:id=>id==='logoutButton'?logout:null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(type,fn)=>addListener(listeners,type,fn),removeEventListener:(type,fn)=>removeListener(listeners,type,fn)};
 const window={addEventListener:(type,fn)=>addListener(windowListeners,type,fn),removeEventListener:(type,fn)=>removeListener(windowListeners,type,fn)};
 const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
 const fetch=async(url,options={})=>{
  requests.push({url,method:options.method??'GET',body:options.body,key:options.headers?.['Idempotency-Key'],signal:options.signal});
  if(url==='/api/internal-auth'){
   const n=++sessionCalls,body={key:owner,caps:[...authCaps]},status=failures.get('auth')??200;
   if(sessionHolds.has(n))await deferred('session',n);
   const r=response(body,status);if(jsonHolds.has(n))r.json=async()=>{await deferred('json',n);return body;};return r;
  }
  const query=new URL(url,'https://synthetic.invalid').searchParams,resource=query.get('resource');
  if(options.method==='POST'){postCalls++;const n=postCalls;if(postHolds.has(n))await deferred('post',n);return response({ok:true,data:{syntheticReceipt:true}});}
  const failure=failures.get(resource);if(failure)return response({ok:false,error:'Synthetic current failure',code:'SYNTHETIC_FAILURE'},failure);
  if(resource==='detail-v2'){
   detailCalls++;const n=detailCalls;assert.equal(query.get('period').slice(0,4),query.get('year'));
   const body={ok:true,data:{version:'own-position-comparison.v2',year:Number(query.get('year')),period:query.get('period'),revision:Number(query.get('revision')),liquidationType:query.get('liquidationType'),groups:[{id:'synthetic-group'}]}},r=response(body);
   if(holdDetailTextCall===n)r.text=async()=>{await deferred('detail',n);return JSON.stringify(body);};return r;
  }
  if(resource==='bootstrap'){bootstrapCalls++;const n=bootstrapCalls,body={ok:true,data:{contractId:query.get('contractId'),year:Number(query.get('year')),scopeVersion:sha,state:{revision:0,version:sha,allocations:[]},annual:{catalog:{version:sha},proposals:[]},proposals:[],permissions:{canPropose:true}}},r=response(body);if(bootstrapHolds.has(n))r.text=async()=>{await deferred('bootstrap',n);return JSON.stringify(body);};return r;}
  if(resource==='attempt')return response({ok:true,data:{syntheticReceipt:true}});
  if(resource==='capture'){const id=query.get('captureId');return response({ok:true,data:{status:'captured',captureId:id,period:'2026-10',liquidationType:'monthly',payloadSha256:id==='capture-a'?sha:otherSha,payload:{employeeCount:1},rows:[{employeeNumber:id==='capture-a'?'101':'202',status:'unassigned',quantity:null,normative:null}]}});}
  throw Error('Unexpected synthetic request '+url);
 };
 class ObservedURL extends URL{static createObjectURL(blob){urls.push(blob);return 'blob:synthetic-'+urls.length;}static revokeObjectURL(){}}
 class ObservedBlob extends Blob{constructor(...args){super(...args);blobCount++;}}
 const timeout=(fn,ms)=>{if(!manualTimers)return setTimeout(fn,ms);const id={};timers.set(id,{fn,ms});return id;},clearTimer=id=>{if(!manualTimers)clearTimeout(id);else timers.delete(id);};
 const context=vm.createContext({document,window,fetch,URL:ObservedURL,URLSearchParams,Blob:ObservedBlob,TextEncoder,AbortController,setTimeout:timeout,clearTimeout:clearTimer,setInterval,clearInterval,crypto:globalThis.crypto,structuredClone,container});
 context.clientBindings={ownRunWorkspaceAccess:v=>{authBodies.push(structuredClone(v));return v;},hasOwnRunAccess:(given,required)=>required.every(c=>given?.includes(c)),POSITION_MAX_RESPONSE:67108864};
 const clientSource=source('position-assignment-client.js');assert.equal([...clientSource.matchAll(/^import /gm)].length,2);
 const clientExecutable=clientSource.replace(/^import[^\n]*\n/gm,'').replace(/^export /gm,'').replaceAll('import.meta.url',JSON.stringify(new URL('../../assets/position-assignment-client.js',import.meta.url).href));
 const realClient=vm.runInContext('(function(){const {ownRunWorkspaceAccess,hasOwnRunAccess,POSITION_MAX_RESPONSE}=clientBindings;'+clientExecutable+';return {createPositionClient,positionNode,positionFreeze,positionStyles};})()',context);
 const doc=(value,f)=>({title:'Synthetic '+value.period,columns:[{label:'Row'}],rows:Array.from({length:60},(_,i)=>[String(i+1)]),notes:['Synthetic UI fixture'],filename:'synthetic-'+value.period+'-'+f.active+'-'+f.view});
 const renderer=format=>value=>{rendered.push({format,rows:value.rows.length,filename:value.filename});return new Uint8Array([1,2,3]);};
 const bindings={
  COMPARISON_READ:caps,positionComparisonQuery:v=>v,verifiedPositionComparison:async v=>{verificationCalls++;if(holdVerificationCall&&verificationCalls===holdVerificationCall)await new Promise(resolve=>{releaseVerification=resolve;});return v;},
  positionComparisonDocument:doc,positionComparisonVisible:(value,_search,page)=>({rows:value.rows.slice((page-1)*25,page*25),filtered:value.rows.length,total:value.rows.length,page,pages:Math.ceil(value.rows.length/25)}),emptyPositionComparisonFilters:()=>({active:'all',order:'number',view:'simple'}),
  verifiedAnnualBudgetBootstrap:async v=>v,budgetHash:async()=>{hashCalls++;if(holdCall&&hashCalls===holdCall)return new Promise(resolve=>{releaseHash=resolve;});return sha;},OWN_RUN_TYPES:{monthly:'Mensual'},
  createPositionClient:(...args)=>{const client=realClient.createPositionClient(...args),perform=client.perform;clients.push(client);client.perform=work=>{const result=perform((valid,op)=>{lastOperation=op;return work(valid,op);});tasks.push(result);return result;};return client;},
  node:realClient.positionNode,positionFreeze:realClient.positionFreeze,positionStyles:realClient.positionStyles,reportCsv:renderer('csv'),reportPdf:renderer('pdf'),reportXlsx:renderer('xlsx'),
  POSITION_READ:caps,POSITION_CAPS:{propose:'synthetic.prepare',approve:'synthetic.approve',reject:'synthetic.approve'},BUDGET_UNITS:{position:'Cargos'},
  positionCommand:v=>structuredClone(v),positionReferences:v=>structuredClone(v),verifiedPositionBootstrap:async v=>v,
  verifiedPositionReceipt:async(value,attempt)=>{receiptCalls++;receiptChecks.push({key:attempt?.key,body:JSON.stringify(attempt?.body)});if(holdReceiptCall===receiptCalls)await deferred('receipt',receiptCalls);return value;},
  verifiedPositionRunCapture:async(v,capture)=>{captureChecks.push(capture.id);assert.equal(v.captureId,capture.id);return v;},
  positionCaptureVisible:(value,_search,page)=>({rows:value.rows,filtered:value.rows.length,total:value.rows.length,page,pages:1}),positionCaptureCsv:()=>{rendered.push({format:'capture-csv'});return 'synthetic complete rows';}
 };
 context.bindings=bindings;
 const filename=({comparison:'position-comparison-panel.js',assignment:'position-assignment-panel.js',capture:'position-capture-panel.js'})[mode],panelSource=source(filename);
 assert.equal([...panelSource.matchAll(/^import /gm)].length,mode==='comparison'?5:3);
 const executable=panelSource.replace(/^import[^\n]*\n/gm,'').replace(/^export /gm,'').replaceAll('import.meta.url',JSON.stringify(new URL('../../assets/'+filename,import.meta.url).href)).replace(/^if\(typeof document[^\n]*$/m,'');
 const names=Object.keys(bindings).join(','),returnCode=mode==='comparison'?'return {mount:mountPositionComparison};':mode==='assignment'?'return {mount:mountPositionAssignment,attempt:id=>contexts.get(id)?.attempt};':'return {mount:mountPositionCapture};';
 const panelModule=vm.runInContext('(function(){const {'+names+'}=bindings;'+executable+';'+returnCode+'})()',context);
 const contractId='10000000-0000-4000-8000-000000000001',instance=mode==='assignment'?panelModule.mount(container,{contractId}):panelModule.mount(container);
 const mounted=mode==='assignment'?{host:instance,dispose:()=>{for(const c of clients){c.invalidate('cleanup',true);c.dispose();}}}:instance;
 const host=mode==='capture'?container:mounted.host,prefix=mode==='comparison'?'comparison':'position',q=(key,target=host)=>target.querySelector('[data-'+prefix+'-'+key+']');
 t.after(async()=>{if(mode==='assignment')mounted.dispose();else mounted.dispose();for(const c of clients){c.invalidate('cleanup',true);c.dispose();}releaseHash?.(sha);releaseVerification?.();for(const map of Object.values(releases))for(const fn of map.values())fn();await Promise.allSettled(tasks);});
 const startQuery=(year=2026)=>{q('year').value=String(year);if(mode==='comparison'){q('revision').value='1';q('period').value=year+'-10';q('type').value='monthly';}q('query').fire('submit');return tasks.at(-1);};
 const submit=year=>startQuery(year);
 const start=(format,target=host)=>{q(format,target).fire('click');return tasks.at(-1);};
 const retire=cause=>{if(cause==='hidden'){document.hidden=true;emit(listeners,'visibilitychange');}else if(cause==='revoked')emit(listeners,'municontrol:capabilities-ready');else if(cause==='logout')logout.click();else if(cause==='pagehide')emit(windowListeners,'pagehide');else if(cause==='disposed')mounted.dispose();else if(cause==='query')q('year').fire('input');else if(cause==='detached')host.isConnected=false;else throw Error(cause);};
 return {
  q,mounted,requests,urls,downloads,rendered,receiptChecks,captureChecks,authBodies,submit,startQuery,start,retire,lastTask:()=>tasks.at(-1),submitProposal:()=>{q('form').fire('submit');return tasks.at(-1);},
  waitHash:()=>until(()=>Boolean(releaseHash)),waitVerification:()=>until(()=>Boolean(releaseVerification)),waitSession:(n=holdSessionCall)=>until(()=>releases.session.has(n)),waitSessionJson:n=>until(()=>releases.json.has(n)),waitDetail:n=>until(()=>releases.detail.has(n)),waitPost:n=>until(()=>releases.post.has(n)),waitReceipt:n=>until(()=>releases.receipt.has(n)),waitBootstrap:n=>until(()=>releases.bootstrap.has(n)),
  release:(value=sha)=>releaseHash(value),releaseVerification:()=>releaseVerification(),releaseSession:(n=holdSessionCall)=>release('session',n),releaseSessionJson:n=>release('json',n),releaseDetail:n=>release('detail',n),releasePost:n=>release('post',n),releaseReceipt:n=>release('receipt',n),releaseBootstrap:n=>release('bootstrap',n),
  setOwner:value=>{owner=value;},setCaps:value=>{authCaps=[...value];},fail:(resource,status)=>failures.set(resource,status),has:required=>clients[0].has(required),get accessKey(){return clients[0].accessKey;},get hashCalls(){return hashCalls;},get verificationCalls(){return verificationCalls;},get blobCount(){return blobCount;},get busy(){return clients[0].busy;},
  fireDeadline(){const timer=[...timers.values()].find(v=>v.ms===45000);assert.ok(timer);timer.fn();},run:work=>clients[0].perform((valid,op)=>{lastOperation=op;return work(op??clients[0],valid);}),get operation(){return lastOperation??clients[0];},
  attempt:()=>panelModule.attempt?.(contractId),show:()=>{document.hidden=false;emit(listeners,'visibilitychange');},
  mountAnotherAssignment(){assert.equal(mode,'assignment');const second=panelModule.mount(new Element(),{contractId});return {host:second,q:key=>q(key,second),start:key=>start(key,second)};}
 };
}
export {harness,sha,otherSha};
