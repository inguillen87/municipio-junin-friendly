// Pure causal regression for the re-login button of three own payroll panels.
// Synthetic DOM/HTTP only: no database, provider, browser, child process,
// municipal actor, native receipt or acceptance claim. The login page reads its
// destination from `next` only (login.html allowedDestination); a `returnTo`
// query is never read, so a panel that sends it lands on the Personal fallback
// instead of returning to its own task. Every other own panel already uses
// `/acceso?next=%2Fnomina%23<tarea>`; these three must follow the same contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {setTimeout as delay} from 'node:timers/promises';
import {mountOwnPayrollClose} from '../assets/own-payroll-close-panel.js';
import {mountOwnPayrollLiquidation} from '../assets/own-payroll-liquidation-panel.js';
import {PayrollPanelElement as Element,payrollPanelEvents as events} from './fixtures/payroll-panel-dom.js';
import {webcrypto} from 'node:crypto';
import {detail as liquidationDetail,receipt as liquidationReceipt} from './fixtures/own-payroll-liquidation-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';
import {OWN_LIQ_REVIEW,ownLiquidationDetail,ownLiquidationReceipt,ownLiquidationReview} from '../assets/own-payroll-liquidation-model.js';
import {OWN_RUN_FULL_JSON} from '../assets/own-payroll-response.js';

const ROOT=path.resolve(process.cwd()),read=file=>fs.readFileSync(path.join(ROOT,file),'utf8');
const ORIGIN='https://municontrol.invalid';
const ACCESS='/acceso?next=';
const expected=Object.freeze({cierre:ACCESS+'%2Fnomina%23cierre',decisiones:ACCESS+'%2Fnomina%23decisiones',reportes:ACCESS+encodeURIComponent('/nomina#reportes'),informe:ACCESS+encodeURIComponent('/nomina#informe-liquidacion-propia')});

// Real public route table (assets/app-routes.js) executed as login.html does.
function routes(){const sandbox={URL};vm.runInNewContext(read('assets/app-routes.js'),sandbox,{filename:'assets/app-routes.js'});assert.ok(sandbox.MuniControlRoutes,'MuniControlRoutes must be installed on the page global');return sandbox.MuniControlRoutes;}
// Real tenant allow-list of login.html; the page passes it to safeDestination.
function tenantSafeNext(){const login=read('login.html'),m=login.match(/var tenantSafeNext = \[([^\]]*)\]/);assert.ok(m,'login.html must declare tenantSafeNext');return JSON.parse('['+m[1].replace(/'/g,'"')+']');}
// What login.html will do with a destination handed to it by a panel.
function landing(destination){const url=new URL(destination,ORIGIN);assert.equal(url.origin,ORIGIN);return routes().safeDestination(url.searchParams.get('next')||'',tenantSafeNext(),'internal-dashboard.html');}

test('login.html derives its post-login destination from next only; returnTo is never read',()=>{
 const login=read('login.html'),start=login.indexOf('function allowedDestination('),end=login.indexOf('function sessionContextKind(');assert.ok(start>0&&end>start);
 const fn=login.slice(start,end);
 assert.match(fn,/new URLSearchParams\(window\.location\.search\)\.get\('next'\)/);
 assert.doesNotMatch(login,/get\(\s*['"]returnTo['"]\s*\)/);
 assert.ok(tenantSafeNext().includes('nomina-control.html'),'Control de nómina is an allowed login destination');
 assert.match(login,/window\.MuniControlRoutes\.safeDestination\(next, allowedNext, fallback\)/);
 assert.match(login,/<script src="\/assets\/app-routes\.js">/);
});

test('the route contract returns to each own task only through next; a returnTo query degrades to the Personal fallback',()=>{
 assert.equal(landing(expected.cierre),'/nomina#cierre');
 assert.equal(landing(expected.decisiones),'/nomina#decisiones');
 assert.equal(landing(expected.reportes),'/nomina#reportes');
 assert.equal(landing(expected.informe),'/nomina#informe-liquidacion-propia');
 // The former destination form of the three panels: login.html never reads returnTo.
 for(const task of ['cierre','decisiones','reportes'])assert.equal(landing('login.html?returnTo='+encodeURIComponent('nomina-control.html#'+task)),'/personal');
 assert.equal(routes().resolve('/personal').file,'internal-dashboard.html');
});

test('no own asset hands login.html a returnTo query',()=>{
 const dir=path.join(ROOT,'assets'),offenders=[];
 for(const name of fs.readdirSync(dir))if(name.endsWith('.js')&&/[?&]returnTo=/.test(fs.readFileSync(path.join(dir,name),'utf8')))offenders.push(name);
 assert.deepEqual(offenders,[]);
});

test('the report panel login handler uses the shared next contract for both of its views',()=>{
 const source=read('assets/own-payroll-report-panel.js'),handlers=source.match(/\$\('login'\)\.addEventListener\('click',[^\n]*?\)\);/g);
 assert.ok(handlers&&handlers.length===1,'exactly one login handler');
 assert.equal(handlers[0],"$('login').addEventListener('click',()=>location.assign('/acceso?next='+encodeURIComponent('/nomina#'+(initialView==='statement'?'informe-liquidacion-propia':'reportes'))));");
 assert.doesNotMatch(source,/login\.html/);
});

// Executes the real close and liquidation panels with a 401 session and
// captures every navigation the re-login button requests. Both `assign` and an
// `href` assignment are recorded so the assertion is about the destination, not
// about which Location API the panel happens to call.
function harness(t,{mount,taskId,prefix,respond=null}){
 // The real liquidation panel inserts its review as an adjacent sibling. The
 // shared minimal DOM does not implement after; scope this extension per test.
 const previousAfter=Object.getOwnPropertyDescriptor(Element.prototype,'after');
 if(!previousAfter)Object.defineProperty(Element.prototype,'after',{configurable:true,value:function(...items){const parent=this.parentElement;if(!parent)return;const at=parent.children.indexOf(this);items.forEach(item=>{item.parentElement=parent;});parent.children.splice(at+1,0,...items);}});
 t.after(()=>{if(previousAfter)Object.defineProperty(Element.prototype,'after',previousAfter);else delete Element.prototype.after;});
 const host=new Element('div'),docEvents=events(),winEvents=events(),navigations=[],timers=new Map();let timer=0;
 const names=['document','window','fetch','setTimeout','clearTimeout','setInterval','clearInterval','location','crypto'],originals=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 const createElement=tag=>{const element=new Element(tag);element.dataset=new Proxy(element.dataset,{set(target,key,value){target[key]=String(value);element.setAttribute('data-'+String(key).replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),String(value));return true;}});return element;};
 const document={...docEvents,hidden:false,head:new Element('head'),createElement,querySelectorAll:()=>[],getElementById:()=>null};
 const location={origin:ORIGIN,pathname:'/nomina',hash:'#'+taskId,assign:target=>{navigations.push(String(target));},replace:target=>{navigations.push(String(target));},get href(){return ORIGIN+'/nomina#'+taskId;},set href(target){navigations.push(String(target));}};
 const state={authStatus:401,requests:[]};
 const fetch=async(url,options={})=>{state.requests.push({url,method:options.method??'GET'});if(respond)return respond(url,options,state);assert.equal(url,'/api/internal-auth','A 401 session must stop the panel before any payroll read');return new Response(JSON.stringify({ok:false,error:'Sesión sintética vencida'}),{status:state.authStatus,headers:{'Content-Type':'application/json'}});};
 if(respond)Object.defineProperty(globalThis,'crypto',{configurable:true,value:webcrypto});
 Object.assign(globalThis,{document,window:winEvents,fetch,setTimeout:fn=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id),setInterval:fn=>{timers.set(++timer,fn);return timer;},clearInterval:id=>timers.delete(id),location});
 t.after(()=>{winEvents.dispatch('pagehide');for(const [name,descriptor]of originals)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];});
 mount(host);
 const q=key=>{const element=host.querySelector('[data-'+prefix+'-'+key+']');assert.ok(element,'Actual control '+prefix+'-'+key);return element;};
 const settled=async()=>{const deadline=Date.now()+5000;while(host.getAttribute('aria-busy')==='true'&&Date.now()<deadline)await delay(1);assert.notEqual(host.getAttribute('aria-busy'),'true');};
 return{host,q,state,navigations,settled,documentEvents:docEvents,start:async()=>{docEvents.dispatch('taskchange',{id:taskId});await settled();}};
}

test('Cerrar liquidación: after a 401 the re-login button returns to /nomina#cierre through next',async t=>{
 const h=harness(t,{mount:host=>mountOwnPayrollClose(host),taskId:'cierre',prefix:'close'});
 assert.equal(h.q('login').hidden,true);await h.start();
 assert.equal(h.q('login').hidden,false);assert.match(h.q('status').textContent,/La sesión venció/);assert.equal(h.state.requests.length,1);
 await h.q('login').emit('click');
 assert.deepEqual(h.navigations,[expected.cierre]);assert.equal(landing(h.navigations[0]),'/nomina#cierre');
 assert.equal(h.state.requests.length,1,'The button navigates; it never retries the session itself');
});

test('Confirmar y anular: after a 401 the re-login button returns to /nomina#decisiones through next',async t=>{
 const h=harness(t,{mount:host=>mountOwnPayrollLiquidation(host,{}),taskId:'decisiones',prefix:'liq'});
 assert.equal(h.q('login').hidden,true);await h.start();
 assert.equal(h.q('login').hidden,false);assert.match(h.q('status').textContent,/La sesión venció/);assert.equal(h.state.requests.length,1);
 await h.q('login').emit('click');
 assert.deepEqual(h.navigations,[expected.decisiones]);assert.equal(landing(h.navigations[0]),'/nomina#decisiones');
 assert.equal(h.state.requests.length,1);
});

// One harness per test: each installs and restores its own globals.
for(const config of [{label:'Cerrar liquidación',mount:host=>mountOwnPayrollClose(host),taskId:'cierre',prefix:'close'},{label:'Confirmar y anular',mount:host=>mountOwnPayrollLiquidation(host,{}),taskId:'decisiones',prefix:'liq'}])test(config.label+': a 403 keeps the re-login button hidden; it is a session prompt, not a permission shortcut',async t=>{
 const h=harness(t,config);h.state.authStatus=403;await h.start();
 assert.equal(h.q('login').hidden,true);assert.equal(h.navigations.length,0);assert.equal(h.state.requests.length,1);
});

// Source-only behavioral proposal. No test or product was executed while
// preparing this private candidate. All actors and HTTP outcomes are synthetic.
const effectiveDisabled=element=>{for(let node=element;node;node=node.parentElement)if(node.disabled)return true;return false;};
const responseJson=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json'}});
const reviewNumbers=h=>h.q('review-rows').querySelectorAll('tr').map(row=>row.children[0].textContent);
const assertDecisionLocked=h=>{
 for(const key of ['command','kind','values','reason','confirm'])assert.equal(effectiveDisabled(h.q(key)),true,'the frozen attempt keeps '+key+' effectively disabled');
};
const assertReviewLocked=h=>{
 for(const key of ['review-search','review-next'])assert.equal(effectiveDisabled(h.q(key)),true,'unverified outcome keeps '+key+' effectively disabled');
};
async function until(predicate,message){const deadline=Date.now()+5000;while(!predicate()){assert.ok(Date.now()<deadline,message);await delay(1);}}

// Existing detail(29): approvedSources -> prepareOwnPayrollInput ->
// createOwnPayrollSnapshot -> saved result. The transport does not replace
// amounts, formulas or totals. Receipt body/key come from the REAL panel POST.
function liquidationOutcomeScenario(){
 const before=liquidationDetail(29),originalSaved=structuredClone(before.capture.saved);
 const state={before,originalSaved,receipt:null,after:null,posts:[],attemptKeys:[],deliveredDetails:[],releaseAck:null,detailUnavailable:false,detailMode:'matching'};
 const bootstrap={version:'own-liquidation-bootstrap.v1',scopeVersion:before.scopeVersion,runs:[{id:before.id,period:before.capture.body.period,liquidationType:before.capture.body.liquidationType,createdAt:before.capture.createdAt,employeeCount:before.capture.saved.result.employeeCount,resultSha256:before.capture.saved.resultSha256,canConsult:true}],complete:true};
 function detailAfter(receipt){
  const value=structuredClone(before),byId=new Map(receipt.affected.map(row=>[row.contractId,row]));
  value.stateVersion=ownRunHash({scopeVersion:before.scopeVersion,runId:before.id,resultSha256:receipt.resultSha256,events:[{id:receipt.id,bodySha256:receipt.bodySha256}]});
  for(const row of value.employees){
   const affected=byId.get(row.contractId);assert.ok(affected,'every saved synthetic contract belongs to the actual all selection');
   Object.assign(row,{state:affected.state,version:affected.version,liquidationVersion:affected.liquidationVersion,allowedCommands:['annul'],events:[{id:receipt.id,command:receipt.body.command,version:affected.version,liquidationVersion:affected.liquidationVersion,recordedAt:receipt.recordedAt,actorLabel:'Revisor exclusivamente sintético',reason:receipt.body.reason}]});
  }
  ownLiquidationDetail(value);assert.deepEqual(value.capture.saved,originalSaved,'a decision changes history, never the captured engine result');return value;
 }
 function currentDetail(){
  if(!state.receipt)return structuredClone(before);
  const value=structuredClone(state.after);
  if(state.detailMode==='other-event'){
   // A valid complete DTO, but the LAST affected contract has another event.
   value.employees.at(-1).events[0].id=uid(81);
   value.stateVersion=ownRunHash({prior:value.stateVersion,syntheticOtherDecision:uid(81)});
  }else if(state.detailMode==='later-annulment'){
   // A later valid event must not erase the original historical receipt.
   for(const row of value.employees){
    row.events.push({id:uid(82),command:'annul',version:2,liquidationVersion:1,recordedAt:'2026-10-05T12:01:00Z',actorLabel:'Segundo revisor exclusivamente sintético',reason:'Anulación posterior únicamente sintética'});
    Object.assign(row,{state:'annulled',version:2,allowedCommands:[]});
   }
   value.stateVersion=ownRunHash({prior:value.stateVersion,syntheticLaterDecision:uid(82)});
  }else assert.equal(state.detailMode,'matching');
  ownLiquidationDetail(value);assert.deepEqual(value.capture.saved,originalSaved);return value;
 }
 const respond=async(url,options,session)=>{
  const method=options.method??'GET';
  assert.equal(options.credentials,'same-origin');assert.equal(options.cache,'no-store');
  if(url==='/api/internal-auth'){
   if(session.authStatus!==200)return responseJson({ok:false,error:'Acceso sintético retirado'},session.authStatus);
   return responseJson({ok:true,authenticated:true,sessionVersion:2,user:{id:'liquidation-review-synthetic-user',email:'liquidation-review@example.invalid'},access:{context:'tenant',tenant:{id:uid(700),roleKey:'liquidation-review-synthetic-role'},tenantCapabilities:[...OWN_LIQ_REVIEW]},expiresAt:'2099-01-01T00:00:00Z'});
  }
  assert.equal(new Headers(options.headers).get('Accept'),OWN_RUN_FULL_JSON,'the real panel negotiates complete responses');
  if(method==='POST'){
   assert.equal(url,'/api/internal-own-payroll-liquidation');assert.equal(state.posts.length,0,'only one actual panel POST is admitted');
   const envelope=JSON.parse(options.body);assert.equal(envelope.operation,'command');
   const body=envelope.payload,key=new Headers(options.headers).get('Idempotency-Key'),selected=ownLiquidationReview(before,body.selection,body.command);
   assert.equal(body.command,'confirm');assert.deepEqual(body.selection,{kind:'all',values:[]});assert.equal(selected.count,29);
   const receipt=liquidationReceipt({id:uid(80),key,body,bodySha256:ownRunHash(body),runId:body.runId,resultSha256:body.resultSha256,affected:selected.rows.map(row=>({contractId:row.contractId,state:'confirmed',version:1,liquidationVersion:1})),recordedAt:'2026-10-05T12:00:00Z',replayed:false});
   ownLiquidationReceipt(receipt,{key,body,expectedContracts:selected.rows.map(row=>row.contractId)});
   state.posts.push({url,method,body:options.body,key});state.receipt=receipt;state.after=detailAfter(receipt);
   // The synthetic commit exists but its ACK is held, then lost with503.
   return new Promise(resolve=>{state.releaseAck=()=>{state.releaseAck=null;resolve(responseJson({ok:false,code:'OWN_LIQ_UNAVAILABLE',error:'Acuse sintético perdido después del registro'},503));};});
  }
  assert.equal(method,'GET');const query=new URL(url,ORIGIN).searchParams;
  assert.equal(new URL(url,ORIGIN).pathname,'/api/internal-own-payroll-liquidation');
  if(query.get('resource')==='bootstrap')return responseJson({ok:true,data:structuredClone(bootstrap)});
  if(query.get('resource')==='attempt'){
   assert.ok(state.receipt);assert.equal(query.get('key'),state.receipt.key);state.attemptKeys.push(query.get('key'));
   return responseJson({ok:true,data:{...structuredClone(state.receipt),replayed:true}});
  }
  assert.equal(query.get('resource'),'detail');assert.equal(query.get('id'),before.id);
  if(state.detailUnavailable)return responseJson({ok:false,code:'OWN_LIQ_UNAVAILABLE',error:'FULL detail sintético no disponible después del comprobante'},503);
  const value=currentDetail();state.deliveredDetails.push(structuredClone(value));return responseJson({ok:true,data:value});
 };
 return{state,respond};
}
function liquidationOutcomeHarness(t){
 const scenario=liquidationOutcomeScenario(),h=harness(t,{mount:host=>mountOwnPayrollLiquidation(host,{}),taskId:'decisiones',prefix:'liq',respond:scenario.respond});
 h.state.authStatus=200;
 return{...h,scenario:scenario.state,act:async(key,event)=>{await h.q(key).emit(event);await h.settled();}};
}
async function beginLiquidationOutcome(h){
 await h.start();const choose=h.q('history').querySelector('button');assert.ok(choose,'the real bootstrap renders its run');await choose.emit('click');await h.settled();
 assert.equal(h.q('detail').hidden,false);h.q('kind').value='all';await h.act('kind','change');h.q('command').value='confirm';await h.act('command','change');
 h.q('reason').value='Confirmación del universo exclusivamente sintético';await h.act('reason','input');h.q('confirm').checked=true;await h.act('confirm','change');
 assert.equal(h.q('review').hidden,false);assert.match(h.q('review-summary').textContent,/29 legajos/);assert.equal(h.q('send').disabled,false);
 const initial={totals:h.q('review-totals').textContent,first:reviewNumbers(h)};
 assert.equal(initial.first.length,25);assert.equal(h.q('review-page').textContent,'1 / 2');
 await h.q('form').emit('submit');await until(()=>h.scenario.releaseAck!==null,'the actual panel POST reaches the held ACK');
 initial.post=structuredClone(h.scenario.posts[0]);assert.ok(initial.post.key);return initial;
}

test('Confirmar y anular: a same-key FULL outcome unlocks read navigation after lostACK; stale503 or one foreign event stays locked',{timeout:20000},async t=>{
 const h=liquidationOutcomeHarness(t),initial=await beginLiquidationOutcome(h);
 assert.equal(h.host.getAttribute('aria-busy'),'true');assertDecisionLocked(h);assertReviewLocked(h);
 await h.q('review-next').emit('click');assert.equal(h.q('review-page').textContent,'1 / 2','disabled ancestry prevents pending navigation');
 h.scenario.releaseAck();await h.settled();assertDecisionLocked(h);assertReviewLocked(h);assert.equal(h.q('send').hidden,false,'lost ACK remains unknown to the panel');
 assert.deepEqual(h.scenario.posts,[initial.post]);

 h.scenario.detailUnavailable=true;await h.act('recover','click');
 assert.equal(h.q('send').hidden,true,'the receipt was verified before the subsequent detail503');
 assert.match(h.q('status').textContent,/FULL detail sintético no disponible/);assertDecisionLocked(h);assertReviewLocked(h);
 assert.equal(h.q('detail').hidden,false,'old current remains present; receipt truthiness alone cannot unlock it');
 assert.deepEqual(h.scenario.posts,[initial.post]);

 h.scenario.detailUnavailable=false;h.scenario.detailMode='other-event';await h.act('recover','click');
 const other=h.scenario.deliveredDetails.at(-1);assert.equal(ownLiquidationDetail(other),other);assert.equal(other.employees.length,29);assert.equal(other.employees.at(-1).events[0].id,uid(81));
 assertDecisionLocked(h);assertReviewLocked(h);await h.q('review-next').emit('click');assert.equal(h.q('review-page').textContent,'1 / 2','member29 with another event blocks the entire read gate');

 h.scenario.detailMode='matching';await h.act('recover','click');assert.match(h.q('status').textContent,/Confirmar: 29 legajos registrados/);
 assert.equal(h.q('send').hidden,true);assertDecisionLocked(h);const readsBefore=h.state.requests.length,first=reviewNumbers(h);
 assert.deepEqual(first,initial.first);assert.equal(h.q('review-totals').textContent,initial.totals);
 await h.act('review-next','click');const last=reviewNumbers(h);assert.equal(last.length,4,'the actual next handler reaches the four off-page members after receipt');assert.equal(h.q('review-page').textContent,'2 / 2');
 const expected=h.scenario.before.capture.saved.input.employees.map(row=>row.employeeNumber).sort();
 assert.deepEqual([...first,...last].sort(),expected,'all29 exact saved identities remain consultable');
 assert.equal(h.q('fields').disabled,true);assert.equal(h.q('confirmation-fields').disabled,true);assert.equal(h.q('review-fields').disabled,false);
 assert.equal(effectiveDisabled(h.q('review-search')),false);await h.act('review-prev','click');assert.deepEqual(reviewNumbers(h),first);

 const scope=h.q('scope').textContent;h.q('review-search').value=expected.at(-1);await h.act('review-search','input');assert.deepEqual(reviewNumbers(h),[expected.at(-1)]);
 h.q('review-search').value='sin-coincidencias-sinteticas';await h.act('review-search','input');assert.match(h.q('review-range').textContent,/^0 legajos de la búsqueda · 29 afectados/);
 assert.equal(h.q('review-totals').textContent,initial.totals);assert.equal(h.q('scope').textContent,scope);
 h.q('review-search').value='';await h.act('review-search','input');assert.deepEqual(reviewNumbers(h),first);
 assert.equal(h.state.requests.length,readsBefore,'search and pagination send no additional GET');assert.deepEqual(h.scenario.posts,[initial.post],'the sole POST retains its exact original body/key');
 assert.deepEqual(h.scenario.attemptKeys,[initial.post.key,initial.post.key,initial.post.key]);assert.deepEqual(h.scenario.after.capture.saved,h.scenario.originalSaved);

 h.documentEvents.dispatch('municontrol:capabilities-ready',{tenantCapabilities:[]});
 assert.equal(h.q('detail').hidden,true);assert.equal(h.q('review').hidden,true);assert.equal(h.q('review-rows').querySelectorAll('tr').length,0);assert.equal(h.q('review-totals').textContent,'');assertDecisionLocked(h);assertReviewLocked(h);
 h.documentEvents.dispatch('municontrol:capabilities-ready',{tenantCapabilities:[...OWN_LIQ_REVIEW]});
 assert.equal(h.q('detail').hidden,true,'restored permissions never resurrect retired outcome data');assert.deepEqual(h.scenario.posts,[initial.post]);
});

test('Confirmar y anular: a matching receipt event retained before later valid annulment still permits historical read navigation only',{timeout:20000},async t=>{
 const h=liquidationOutcomeHarness(t),initial=await beginLiquidationOutcome(h);h.scenario.releaseAck();await h.settled();
 h.scenario.detailMode='later-annulment';await h.act('recover','click');
 const delivered=h.scenario.deliveredDetails.at(-1);assert.equal(ownLiquidationDetail(delivered),delivered);assert.equal(delivered.employees.every(row=>row.state==='annulled'&&row.events[0].id===h.scenario.receipt.id&&row.events[1].id===uid(82)),true);
 assertDecisionLocked(h);assert.equal(h.q('send').hidden,true);assert.equal(h.q('review-totals').textContent,initial.totals);
 await h.act('review-next','click');assert.equal(reviewNumbers(h).length,4);assert.equal(h.q('review-page').textContent,'2 / 2');
 for(const row of h.q('review-rows').querySelectorAll('tr'))assert.equal(row.children[3].textContent,'Anulada');
 assert.equal(h.q('review-fields').disabled,false);assert.deepEqual(h.scenario.posts,[initial.post]);assert.deepEqual(h.scenario.attemptKeys,[initial.post.key]);
});
