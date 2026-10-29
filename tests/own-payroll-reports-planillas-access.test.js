// Pure source/UI regressions; real panel, access models, census and navigation.
// Synthetic HTTP/DOM only. No native, normal-auth or publication admission.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import {createHash,webcrypto} from 'node:crypto';
import net from 'node:net';import tls from 'node:tls';import http from 'node:http';import https from 'node:https';import dns from 'node:dns';import childProcess from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
const forbidden=()=>{throw Error('OWN_REPORT_UI_EXTERNAL_IO_FORBIDDEN');};
net.connect=net.createConnection=net.Socket.prototype.connect=tls.connect=forbidden;http.request=http.get=https.request=https.get=forbidden;globalThis.fetch=forbidden;
for(const name of Object.keys(dns))if(/^(lookup|resolve|reverse)/.test(name)&&typeof dns[name]==='function')dns[name]=forbidden;
for(const name of Object.keys(dns.promises))if(typeof dns.promises[name]==='function')dns.promises[name]=forbidden;
for(const name of ['exec','execSync','execFile','execFileSync','spawn','spawnSync','fork'])childProcess[name]=forbidden;syncBuiltinESMExports();
const ROOT=path.resolve(process.cwd()),PANEL=path.join(ROOT,'assets/own-payroll-report-panel.js'),load=file=>import(pathToFileURL(path.join(ROOT,file)).href);
const [jurisdiction,workspace,close,census,response,runModel,salary,report,documentModel,liquidation,dom,synthetic,succession]=await Promise.all([
 load('assets/own-payroll-jurisdiction-model.js'),load('assets/own-payroll-run-workspace-model.js'),load('assets/own-payroll-close-model.js'),load('assets/own-payroll-report-census-model.js'),load('assets/own-payroll-response.js'),load('assets/own-payroll-run-model.js'),load('assets/native-salary-catalog-model.js'),load('assets/own-payroll-report-model.js'),load('assets/report-document.js'),load('assets/own-payroll-liquidation-model.js'),load('tests/fixtures/payroll-panel-dom.js'),load('tests/fixtures/own-payroll-report-census-synthetic.js'),load('tests/fixtures/release-candidate-workflow-succession.js')
]);
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
// The shared DOM substrate already models the panels' controls. The real
// report also uses one unquoted, constant CSS attribute selector.
const Element=dom.PayrollPanelElement,queryElement=Element.prototype.querySelector;
Element.prototype.querySelector=function(selector){return queryElement.call(this,selector.replace(/\[value=([a-z_]+)\]/g,'[value="$1"]'));};
const waitFor=async predicate=>{const end=Date.now()+3000;while(!predicate()){assert.ok(Date.now()<end,'UI observation timed out');await new Promise(resolve=>setTimeout(resolve,5));}};
function harness(t,{initialView='payroll'}={}){
 const events=dom.payrollPanelEvents(),win=dom.payrollPanelEvents(),requests=[],downloads=[],intervals=[];let held=null,parsed=null;
 const state={caps:[...close.OWN_CLOSE_NOMINAL],deferFetch:true,deferParsed:false,authStatus:200};
 const auth=()=>({ok:true,authenticated:true,sessionVersion:2,expiresAt:new Date(Date.now()+120000).toISOString(),user:{id:'synthetic-report-user',email:'report@example.invalid'},access:{context:'tenant',tenant:{id:uid(1),roleKey:'SYNTHETIC_REPORT'},tenantCapabilities:[...state.caps]}});
 const document={...events,head:new Element('head'),hidden:false,createElement:tag=>new Element(tag),querySelectorAll:()=>[],getElementById:()=>null};
 const answer=(value,{full=false,status=200}={})=>{const body=JSON.stringify(value);return new Response(body,{status,headers:{'Content-Type':full?response.OWN_RUN_FULL_JSON:'application/json','x-municontrol-json-bytes':String(Buffer.byteLength(body))}});};
 const authResponse=payload=>{const r=answer(payload,{status:state.authStatus});if(state.deferParsed){state.deferParsed=false;const actualJson=r.json.bind(r);r.json=async()=>{const value=await actualJson();return new Promise(resolve=>{parsed={resolve,payload:value};});};}return r;};
 const fetch=async(url,options={})=>{
  requests.push({url,signal:options.signal});assert.equal(options.method??'GET','GET');
  if(url==='/api/internal-auth'){const captured=auth();if(state.deferFetch){state.deferFetch=false;return new Promise(resolve=>{held={resolve,payload:captured,signal:options.signal};});}return authResponse(captured);}
  const parsedUrl=new URL(url,'http://synthetic.invalid');
  assert.equal(parsedUrl.pathname,'/api/internal-own-payroll-close');assert.equal(parsedUrl.searchParams.get('resource'),'report-census');
  return answer({ok:true,data:synthetic.reportCensusFixture({period:parsedUrl.searchParams.get('period'),liquidationType:parsedUrl.searchParams.get('liquidationType')})},{full:true});
 };
 let source=fs.readFileSync(PANEL,'utf8');assert.equal(source.split('export function mountOwnPayrollReports(').length,2);
 source=source.replace(/^import[^\n]*\n/gm,'').replace('export function mountOwnPayrollReports(','function mountOwnPayrollReports(').replaceAll('import.meta.url',JSON.stringify(pathToFileURL(PANEL).href));
 const sandbox={...jurisdiction,...workspace,...close,...census,...response,...runModel,...salary,...report,...documentModel,...liquidation,crypto:webcrypto,document,window:win,fetch,URL,URLSearchParams,Response,TextEncoder,DOMException,AbortController,Option:function(label,value){const e=new Element('option');e.textContent=label;e._value=value;return e;},setInterval:fn=>{intervals.push(fn);return intervals.length;},clearInterval(){},setTimeout,clearTimeout,saveReportBytes:(...args)=>downloads.push(args),location:{href:''}};
 vm.runInNewContext(source+'\nglobalThis.mount=mountOwnPayrollReports;',sandbox,{filename:PANEL});
 const host=new Element('div');sandbox.mount(host,{initialView});events.dispatch('taskchange',{id:'reportes'});t.after(()=>{win.dispatch('pagehide');if(held){const value=held;held=null;value.resolve(authResponse(value.payload));}if(parsed){const value=parsed;parsed=null;value.resolve(value.payload);}});
 const get=k=>{const element=host.querySelector('[data-report-'+k+']');assert.ok(element,k);return element;};get('from').value=get('to').value='2026-10';for(const option of get('types').options)option.selected=option.value==='monthly';
 return{events,state,requests,downloads,host,get,pending:()=>held,parsed:()=>parsed,release:()=>{assert.ok(held);const value=held;held=null;value.resolve(authResponse(value.payload));},releaseParsed:()=>{assert.ok(parsed);const value=parsed;parsed=null;value.resolve(value.payload);},poll:()=>{assert.equal(intervals.length,1);intervals[0]();},submit:()=>get('query').emit('submit'),idle:async()=>{await new Promise(resolve=>setImmediate(resolve));await waitFor(()=>host.getAttribute('aria-busy')==='false');await new Promise(resolve=>setImmediate(resolve));}};
}
const rpcCount=h=>h.requests.filter(r=>r.url.startsWith('/api/internal-own-payroll-close')).length;
function withdrawn(h){assert.equal(h.get('result').hidden,true);assert.equal(h.get('rows').children.length,0);for(const key of ['pdf','xlsx','csv'])assert.equal(h.get(key).disabled,true);assert.equal(h.downloads.length,0);}
test('Informes: retirar lectura durante la primera auth pendiente impide todo RPC y descarga',async t=>{
 const h=harness(t);await h.submit();const pending=h.pending();assert.ok(pending);assert.equal(pending.signal.aborted,false);
 h.state.caps=[];h.events.dispatch('municontrol:capabilities-ready',{tenantCapabilities:[]});const aborted=pending.signal.aborted;
 // Synthetic HTTP deliberately ignores abort and returns the old authorized response.
 h.release();await h.idle();assert.equal(aborted,true);assert.equal(rpcCount(h),0);withdrawn(h);
 const before=h.requests.length;h.poll();await new Promise(resolve=>setImmediate(resolve));assert.equal(h.requests.length,before,'Old auth must not revive access or polling');
});
test('Informes: respuesta auth ya parseada no restaura acceso tras revocación',async t=>{
 const h=harness(t);h.state.deferFetch=false;h.state.deferParsed=true;await h.submit();await waitFor(()=>h.parsed()!==null);
 assert.deepEqual(h.parsed().payload.access.tenantCapabilities,[...close.OWN_CLOSE_NOMINAL]);
 h.state.caps=[];h.events.dispatch('municontrol:capabilities-ready',{tenantCapabilities:[]});
 // This releases an already parsed JS value. There is no parser or AbortSignal
 // check here: the production session(valid) fence alone stops reassignment.
 h.releaseParsed();await h.idle();assert.equal(rpcCount(h),0);withdrawn(h);
 const before=h.requests.length;h.poll();await new Promise(resolve=>setImmediate(resolve));assert.equal(h.requests.length,before);
});
test('Informes: recuperación explícita con lectura vigente consulta el censo real sin inventar filas',async t=>{
 const h=harness(t);await h.submit();h.events.dispatch('municontrol:capabilities-ready',{tenantCapabilities:[]});h.release();await h.idle();assert.equal(rpcCount(h),0);
 h.state.caps=[...close.OWN_CLOSE_NOMINAL];h.events.dispatch('municontrol:capabilities-ready',{tenantCapabilities:[...h.state.caps]});await h.submit();await h.idle();
 assert.equal(rpcCount(h),2,'One original census and its fresh source bookend');assert.equal(h.get('rows').children.length,0);assert.match(h.get('status').textContent,/No hay filas/);assert.equal(h.downloads.length,0);
});
test('Informes: ocultar la tarea durante auth conserva el retiro aunque HTTP ignore abort',async t=>{
 const h=harness(t);await h.submit();const pending=h.pending();h.events.dispatch('taskchange',{id:'recibos'});assert.equal(pending.signal.aborted,true);h.release();await h.idle();assert.equal(rpcCount(h),0);withdrawn(h);
});
test('Informe de liquidación: acceso explícito preselecciona expediente, sin consulta ni descarga automática',t=>{
 const h=harness(t,{initialView:'statement'});assert.equal(h.get('view').value,'statement');assert.equal(h.requests.length,0);withdrawn(h);
});
test('el centro ofrece dos accesos propios distintos y conserva los informes incorporados',()=>{
 const source=fs.readFileSync(path.join(ROOT,'assets/report-centre.js'),'utf8'),start=source.indexOf(' const cards=['),end=source.indexOf('\n ].map(',start);assert.ok(start>=0&&end>start);
 // Evaluate only the actual closed card data, not a second menu implementation.
 const cards=vm.runInNewContext(source.slice(start,end).replace(' const cards=','globalThis.cards=')+'\n];cards;',{});
 assert.ok(cards.some(c=>c[0]==='Planillas de sueldos propias'&&c[3]==='nomina-control.html#planillas-sueldos-propias'&&/aprobada/.test(c[1])));
 assert.ok(cards.some(c=>c[0]==='Informe de liquidación propia'&&c[3]==='nomina-control.html#informe-liquidacion-propia'&&/cierres propios/.test(c[1])));
 assert.ok(cards.some(c=>c[3]==='#haberes'));assert.ok(cards.some(c=>c[3]==='#resumen-mensual'));assert.ok(cards.some(c=>c[3]==='#planilla-bancaria'));
});
function navigation(hash){
 const source=fs.readFileSync(path.join(ROOT,'assets/payroll-navigation.js'),'utf8'),calls=[],sections=new Map();let groups;
 const node=()=>({children:[],dataset:{},classList:{add(){}},append(...nodes){this.children.push(...nodes);},insertBefore(child){this.children.push(child);},prepend(child){this.children.unshift(child);},setAttribute(){},querySelector(){return node();},querySelectorAll(){return[];}}),main=node(),heading=node();main.querySelector=selector=>selector==='.page-head'?heading:null;
 const anchor=id=>{if(!sections.has(id)){const section=node(),n=node();n.closest=()=>section;sections.set(id,n);}return sections.get(id);};
 const document={readyState:'complete',body:node(),createElement:()=>node(),getElementById:id=>id==='mainContent'?main:anchor(id)},sandbox={document,location:{search:'',hash},console};
 for(const match of source.matchAll(/^import\s*\{([^}]+)\}[^\n]*$/gm))for(const field of match[1].split(',')){const name=field.trim();if(name.startsWith('mount'))sandbox[name]=(host,options={})=>{calls.push({name,host,options});return{queuePreparation:()=>true,queueConsult:()=>true,queueReview:()=>true};};}
 sandbox.requestedOwnAnnulPreparation=()=>null;sandbox.toolDetails=(child,label)=>{const n=node();n.label=label;n.children.push(child);return n;};sandbox.taskWorkspace=config=>{groups=config.groups;return{activate:()=>true};};
 vm.runInNewContext(source.replace(/^import[^\n]*\n/gm,''),sandbox,{filename:'actual-payroll-navigation.js'});return{calls,groups};
}
for(const [hash,view]of [['#informe-liquidacion-propia','statement'],['#planillas-sueldos-propias','payroll'],['#reportes','payroll']])test('navegación real conserva un solo montaje y un destino alcanzable '+hash,()=>{
 const value=navigation(hash),reports=value.calls.filter(c=>c.name==='mountOwnPayrollReports'),planillas=value.calls.filter(c=>c.name==='mountOwnPayrollPlanillas');assert.equal(reports.length,1);assert.equal(planillas.length,1);assert.equal(reports[0].options.initialView,view);assert.equal(reports[0].host.id,'informe-liquidacion-propia');assert.equal(planillas[0].host.id,'planillas-sueldos-propias');
 const report=value.groups.find(g=>g.id==='reportes').nodes[0];assert.ok(report.children.includes(reports[0].host));assert.ok(report.children.includes(planillas[0].host));
});
for(const targetId of ['informe-liquidacion-propia','planillas-sueldos-propias'])test('workspace real abre Reportes al recibir el enlace profundo '+targetId,()=>{
 const nodes=[],events=[];
 class TaskNode{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attributes={};nodes.push(this);}
  append(...items){for(const n of items){n.parentElement=this;this.children.push(n);}}
  prepend(...items){for(const n of items)n.parentElement=this;this.children.unshift(...items);}
  setAttribute(k,v){this.attributes[k]=v;}addEventListener(){}dispatchEvent(e){events.push(e.detail.id);}
  contains(n){return n===this||this.children.some(child=>child.contains(n));}scrollIntoView(){this.scrolled=true;}
 }
 const host=new TaskNode(),summary=new TaskNode(),report=new TaskNode(),target=new TaskNode();target.id=targetId;report.append(target);
 const context={document:{createElement:tag=>new TaskNode(tag),getElementById:id=>nodes.find(n=>n.id===id)??null},location:{hash:'#'+targetId},window:{addEventListener(){},history:{pushState(){}}},CustomEvent:class{constructor(type,options){this.type=type;Object.assign(this,options);}},requestAnimationFrame:callback=>callback()};
 const source=fs.readFileSync(path.join(ROOT,'assets/task-workspace.js'),'utf8');vm.runInNewContext(source.replaceAll('export function ','function ')+'\nglobalThis.mount=taskWorkspace;',context);
 const w=context.mount({host,initial:'resumen',groups:[{id:'resumen',label:'Resumen',nodes:[summary]},{id:'reportes',label:'Reportes',nodes:[report]}]});
 assert.equal(host.dataset.activeTask,'reportes');assert.equal(w.panels.get('reportes').hidden,false);assert.equal(w.panels.get('resumen').hidden,true);assert.equal(events.at(-1),'reportes');assert.equal(target.scrolled,true);
});
test('custodia: cuatro padres RAW completos y todas las filas históricas permanecen verificables',()=>{
 const file=path.join(ROOT,'tests/fixtures/own-payroll-reports-planillas-source-parent.json'),bytes=fs.readFileSync(file),hash=b=>createHash('sha256').update(b).digest('hex');assert.equal(hash(bytes),'66dfebee29df34dae4c9d95393a97e566013faa6e758f55be2ff52c1499bc096');const saved=JSON.parse(bytes);assert.equal(saved.parentCommit,'d7c7c14b0434617f8d90d887055102e419241641');assert.equal(Object.keys(saved.rows).length,4);
 for(const [file,row]of Object.entries(saved.rows)){const current=fs.readFileSync(path.join(ROOT,file)),parent=Buffer.from(row.beforeRawBase64,'base64');assert.equal(current.length,row.afterBytes,file);assert.equal(hash(current),row.afterSha256,file);assert.equal(parent.length,row.beforeBytes,file);assert.equal(hash(parent),row.beforeSha256,file);}
 const fixturePath='tests/fixtures/release-candidate-workflow-succession.js',parent=Buffer.from(saved.rows[fixturePath].beforeRawBase64,'base64').toString('utf8'),sandbox={assert,createHash,Buffer};vm.runInNewContext(parent.replace(/^import[^\n]*\n/gm,'').replaceAll('export const ','const ').replaceAll('export function ','function ')+'\nglobalThis.oldPins=RELEASE_CANDIDATE_SOURCE_PINS;globalThis.oldProject=projectReleaseCandidateWorkflowToParent;',sandbox);
 assert.equal(Object.keys(sandbox.oldPins).length,12);assert.deepEqual(Object.keys(succession.RELEASE_CANDIDATE_SOURCE_PINS),[...Object.keys(sandbox.oldPins),'assets/own-payroll-report-panel.js']);
 for(const [key,row]of Object.entries(sandbox.oldPins))if(key!=='assets/payroll-navigation.js')assert.deepEqual(succession.RELEASE_CANDIDATE_SOURCE_PINS[key],JSON.parse(JSON.stringify(row)),key);
 const oldPanel=Buffer.from(saved.rows['assets/own-payroll-report-panel.js'].beforeRawBase64,'base64'),newPanel=fs.readFileSync(PANEL),panelPin=succession.RELEASE_CANDIDATE_SOURCE_PINS['assets/own-payroll-report-panel.js'];assert.equal(hash(oldPanel),'bd2369acf7d5003f82eb58e14e61fe88e87c2c7de0aa09c2d0d2f12a8e49fca9');assert.equal(panelPin.before,hash(oldPanel));assert.equal(panelPin.beforeBytes,oldPanel.length);assert.deepEqual(succession.projectReleaseCandidateWorkflowToParent('assets/own-payroll-report-panel.js',newPanel),oldPanel);assert.throws(()=>succession.projectReleaseCandidateWorkflowToParent('assets/own-payroll-report-panel.js',Buffer.concat([newPanel,Buffer.from('\n')])));
 const oldNav=Buffer.from(saved.rows['assets/payroll-navigation.js'].beforeRawBase64,'base64'),newNav=fs.readFileSync(path.join(ROOT,'assets/payroll-navigation.js'));assert.deepEqual(succession.projectReleaseCandidateWorkflowToParent('assets/payroll-navigation.js',newNav),sandbox.oldProject('assets/payroll-navigation.js',oldNav));
 assert.throws(()=>succession.projectReleaseCandidateWorkflowToParent('assets/payroll-navigation.js',Buffer.concat([newNav,Buffer.from('\n')])));
});
