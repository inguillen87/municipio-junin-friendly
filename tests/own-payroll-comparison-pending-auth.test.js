// Causal stale-auth regressions using real models and synthetic responses.
// Always reads the real application panel; no candidate override.
// These pure UI checks do not claim native or production acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath,pathToFileURL} from 'node:url';
import net from 'node:net';import tls from 'node:tls';import http from 'node:http';import https from 'node:https';import dns from 'node:dns';import childProcess from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
const forbidden=()=>{throw Error('COMPARISON_UI_REGRESSION_EXTERNAL_IO_FORBIDDEN');};
net.connect=net.createConnection=net.Socket.prototype.connect=tls.connect=forbidden;http.request=http.get=https.request=https.get=forbidden;globalThis.fetch=forbidden;
for(const name of Object.keys(dns))if(/^(lookup|resolve|reverse)/.test(name)&&typeof dns[name]==='function')dns[name]=forbidden;
for(const name of Object.keys(dns.promises))if(typeof dns.promises[name]==='function')dns.promises[name]=forbidden;
for(const name of ['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork'])childProcess[name]=forbidden;syncBuiltinESMExports();
const ROOT=path.resolve(process.cwd()),HERE=path.dirname(fileURLToPath(import.meta.url));assert.ok(fs.existsSync(path.join(ROOT,'assets/own-payroll-comparison-panel.js')));

const SOURCE_FILE=path.join(ROOT,'assets/own-payroll-comparison-panel.js');
// Pure models only, imported after external IO is denied. No service/SDK/PG.
const load=file=>import(pathToFileURL(path.join(ROOT,file)).href);
const [workspace,comparison,liquidation,response,dom,runModel]=await Promise.all([
 load('assets/own-payroll-run-workspace-model.js'),load('assets/own-payroll-comparison-model.js'),load('assets/own-payroll-liquidation-model.js'),load('assets/own-payroll-response.js'),load('tests/fixtures/payroll-panel-dom.js'),load('assets/own-payroll-run-model.js')
]);
const {PayrollPanelElement:Element,payrollPanelEvents}=dom;
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const bootstrap=()=>({version:'own-liquidation-bootstrap.v1',scopeVersion:'a'.repeat(64),complete:true,runs:[1,2].map(n=>({id:uid(n+10),period:'2026-10',liquidationType:'monthly',createdAt:'2026-10-'+String(n+10)+'T12:00:00Z',employeeCount:1,resultSha256:String(n).repeat(64),canConsult:true}))});
function harness(t){
 const events=payrollPanelEvents(),win=payrollPanelEvents(),head=new Element('head'),requests=[],downloads=[],intervals=[];let deferred=null,parsed=null,notifyParsed;const parsedReady=new Promise(resolve=>{notifyParsed=resolve;});
 const state={caps:[...workspace.OWN_RUN_NOMINAL],deferNextAuth:true,deferParsedAuth:false};
 const auth=()=>({ok:true,authenticated:true,sessionVersion:2,expiresAt:new Date(Date.now()+120000).toISOString(),user:{id:'comparison-synthetic-user',email:'comparison@example.invalid'},access:{context:'tenant',tenant:{id:uid(1),roleKey:'SYNTHETIC_COMPARISON'},tenantCapabilities:[...state.caps]}});
 const document={...events,head,hidden:false,createElement:tag=>new Element(tag),querySelectorAll:()=>[],getElementById:()=>null};
 const answer=value=>{const text=JSON.stringify(value);return new Response(text,{headers:{'Content-Type':'application/json','x-municontrol-json-bytes':String(Buffer.byteLength(text))}});};
 const fetch=async(url,options={})=>{
  requests.push({url,signal:options.signal});assert.equal(options.method??'GET','GET');
  if(url==='/api/internal-auth'){
   const captured=auth();if(state.deferNextAuth){state.deferNextAuth=false;return new Promise(resolve=>{deferred={resolve,payload:captured,signal:options.signal};});}return answer(captured);
  }
  if(url==='/api/internal-own-payroll-liquidation?resource=bootstrap')return answer({ok:true,data:bootstrap()});
  assert.fail('Unexpected synthetic endpoint '+url);
 };
 let source=fs.readFileSync(SOURCE_FILE,'utf8');assert.equal(source.split('export function mountOwnPayrollComparison(').length,2);
 source=source.replace(/^import[^\n]*\n/gm,'').replace('export function mountOwnPayrollComparison(','function mountOwnPayrollComparison(').replaceAll('import.meta.url',JSON.stringify(pathToFileURL(SOURCE_FILE).href));
 // Deliberate fence hook AFTER the actual streaming parser has completely
 // read and validated its payload. There is no second parser or abort check
 // when releasing this value to request()/session().
 const readParsedResponse=async(incoming,options)=>{
  const value=await response.readOwnPayrollResponse(incoming,options);
  if(state.deferParsedAuth&&value?.authenticated===true){state.deferParsedAuth=false;return new Promise(resolve=>{parsed={resolve,payload:value,signal:options.signal};notifyParsed(parsed);});}
  return value;
 };
 const sandbox={...workspace,...comparison,...liquidation,...response,OWN_RUN_MAX_RESPONSE:runModel.OWN_RUN_MAX_RESPONSE,readOwnPayrollResponse:readParsedResponse,document,window:win,fetch,URL,Response,TextEncoder,DOMException,AbortController,console,Option:function(label,value){const e=new Element('option');e.textContent=label;e._value=value;return e;},setInterval:fn=>{intervals.push(fn);return intervals.length;},clearInterval(){},setTimeout,clearTimeout,saveReport:(...args)=>{downloads.push(args);}};
 vm.runInNewContext(source+'\nglobalThis.mount=mountOwnPayrollComparison;',sandbox,{filename:SOURCE_FILE});
 const host=new Element('div');sandbox.mount(host);events.dispatch('taskchange',{id:'comparar'});
 t.after(()=>win.dispatch('pagehide'));
 const get=key=>{const e=host.querySelector('[data-oc-'+key+']');assert.ok(e,key);return e;};
 return{state,events,requests,downloads,host,get,pending:()=>deferred,release:()=>{assert.ok(deferred);const held=deferred;deferred=null;held.resolve(answer(held.payload));},whenParsed:()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('COMPARISON_PARSED_AUTH_HOOK_TIMEOUT')),3000);parsedReady.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});}),releaseParsed:()=>{assert.ok(parsed);const held=parsed;parsed=null;held.resolve(held.payload);},poll:()=>{assert.equal(intervals.length,1);intervals[0]();}};
}
test('Comparar: retirar lectura durante la primera auth impide bootstrap y catálogo por respuesta vieja',async t=>{
 const h=harness(t),pending=h.get('refresh').emit('click'),held=h.pending();assert.ok(held);assert.equal(held.signal.aborted,false);
 h.events.dispatch('municontrol:capabilities-ready',{tenantCapabilities:[]});const aborted=held.signal.aborted;
 // This case proves the cold capability listener aborts the in-flight read.
 // The real parser can also reject signal.aborted here; it does not by itself
 // isolate the session(valid) fence. The parsed-payload case below does that.
 h.release();await pending;
 assert.equal(aborted,true,'Permission withdrawal must cancel cold pending auth even before access exists');
 assert.equal(h.requests.filter(r=>r.url.includes('resource=bootstrap')).length,0,'Late old auth must not start a new catalogue read');
 assert.equal(h.get('query').hidden,true);assert.equal(h.get('base').options.length,1);assert.equal(h.get('rows').children.length,0);
 for(const f of ['pdf','xlsx','csv'])assert.equal(h.get(f).disabled,true);assert.equal(h.downloads.length,0);
});
test('Comparar: una consulta nueva y explícita puede recuperar el catálogo con lectura vigente',async t=>{
 const h=harness(t),pending=h.get('refresh').emit('click');h.events.dispatch('municontrol:capabilities-ready',{tenantCapabilities:[]});h.release();await pending;
 h.state.caps=[...workspace.OWN_RUN_NOMINAL];h.events.dispatch('municontrol:capabilities-ready',{tenantCapabilities:[...h.state.caps]});
 await h.get('refresh').emit('click');assert.equal(h.get('query').hidden,false);assert.equal(h.get('base').options.length,3);assert.equal(h.requests.filter(r=>r.url.includes('resource=bootstrap')).length,1);
 assert.equal(h.downloads.length,0,'Catalogue recovery is not a synthetic export or native acceptance');
});


test('Comparar: auth ya parseada no restaura access después del retiro ni reactiva el polling',async t=>{
 const h=harness(t);h.state.deferNextAuth=false;h.state.deferParsedAuth=true;
 const pending=h.get('refresh').emit('click'),held=await h.whenParsed();
 assert.ok(held.payload.authenticated);assert.equal(held.signal.aborted,false);assert.deepEqual(held.payload.access.tenantCapabilities,[...workspace.OWN_RUN_NOMINAL]);
 h.state.caps=[];h.events.dispatch('municontrol:capabilities-ready',{tenantCapabilities:[]});const aborted=held.signal.aborted;
 // This is an already parsed JS payload. Releasing it does NOT call the parser
 // again and does not re-check its AbortSignal. Only the operation fence may
 // prevent session() from restoring access before its caller checks valid().
 h.releaseParsed();await pending;
 assert.equal(aborted,true);assert.equal(h.requests.filter(r=>r.url.includes('resource=bootstrap')).length,0);
 assert.equal(h.get('query').hidden,true);assert.equal(h.get('base').options.length,1);assert.equal(h.get('rows').children.length,0);
 const beforePoll=h.requests.length;
 // The production interval only starts auth while access is retained. Calling
 // its captured callback makes an otherwise invisible stale assignment observable:
 // without the session(valid) guard, an extra auth starts despite the withdrawal.
 h.poll();assert.equal(h.requests.length,beforePoll,'A late parsed payload must not restore access and restart automatic auth');
 for(const f of ['pdf','xlsx','csv'])assert.equal(h.get(f).disabled,true);assert.equal(h.downloads.length,0);
});
