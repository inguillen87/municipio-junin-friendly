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
function harness(t,{mount,taskId,prefix}){
 // The real liquidation panel inserts its review as an adjacent sibling. The
 // shared minimal DOM does not implement after; scope this extension per test.
 const previousAfter=Object.getOwnPropertyDescriptor(Element.prototype,'after');
 if(!previousAfter)Object.defineProperty(Element.prototype,'after',{configurable:true,value:function(...items){const parent=this.parentElement;if(!parent)return;const at=parent.children.indexOf(this);items.forEach(item=>{item.parentElement=parent;});parent.children.splice(at+1,0,...items);}});
 t.after(()=>{if(previousAfter)Object.defineProperty(Element.prototype,'after',previousAfter);else delete Element.prototype.after;});
 const host=new Element('div'),docEvents=events(),winEvents=events(),navigations=[],timers=new Map();let timer=0;
 const names=['document','window','fetch','setTimeout','clearTimeout','setInterval','clearInterval','location'],originals=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 const createElement=tag=>{const element=new Element(tag);element.dataset=new Proxy(element.dataset,{set(target,key,value){target[key]=String(value);element.setAttribute('data-'+String(key).replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),String(value));return true;}});return element;};
 const document={...docEvents,hidden:false,head:new Element('head'),createElement,querySelectorAll:()=>[],getElementById:()=>null};
 const location={origin:ORIGIN,pathname:'/nomina',hash:'#'+taskId,assign:target=>{navigations.push(String(target));},replace:target=>{navigations.push(String(target));},get href(){return ORIGIN+'/nomina#'+taskId;},set href(target){navigations.push(String(target));}};
 const state={authStatus:401,requests:[]};
 const fetch=async(url,options={})=>{state.requests.push({url,method:options.method??'GET'});assert.equal(url,'/api/internal-auth','A 401 session must stop the panel before any payroll read');return new Response(JSON.stringify({ok:false,error:'Sesión sintética vencida'}),{status:state.authStatus,headers:{'Content-Type':'application/json'}});};
 Object.assign(globalThis,{document,window:winEvents,fetch,setTimeout:fn=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id),setInterval:fn=>{timers.set(++timer,fn);return timer;},clearInterval:id=>timers.delete(id),location});
 t.after(()=>{winEvents.dispatch('pagehide');for(const [name,descriptor]of originals)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];});
 mount(host);
 const q=key=>{const element=host.querySelector('[data-'+prefix+'-'+key+']');assert.ok(element,'Actual control '+prefix+'-'+key);return element;};
 const settled=async()=>{const deadline=Date.now()+5000;while(host.getAttribute('aria-busy')==='true'&&Date.now()<deadline)await delay(1);assert.notEqual(host.getAttribute('aria-busy'),'true');};
 return{host,q,state,navigations,settled,start:async()=>{docEvents.dispatch('taskchange',{id:taskId});await settled();}};
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
