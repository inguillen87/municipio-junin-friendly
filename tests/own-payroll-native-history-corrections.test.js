// Pure causal UI/source tests. Synthetic DOM and HTTP only; no database,
// provider, child process, municipal actor, native receipt or acceptance claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {mountOwnPayrollSummary} from '../assets/own-payroll-summary-panel.js';
import {ownSummaryTaskProfile,ownSummaryPreparationReference} from '../assets/own-payroll-summary-model.js';
import {OWN_LIQ_NOMINAL} from '../assets/own-payroll-liquidation-model.js';
import {OWN_RUN_PREPARE} from '../assets/own-payroll-run-workspace-model.js';
import {PayrollPanelElement as Element,payrollPanelEvents} from './fixtures/payroll-panel-dom.js';
import {uid,hash} from './fixtures/own-payroll-program-synthetic.js';

const bootstrap=()=>({version:'own-liquidation-bootstrap.v1',scopeVersion:hash('a'),complete:true,runs:[{id:uid(10),period:'2026-10',liquidationType:'monthly',createdAt:'2026-10-11T12:00:00Z',employeeCount:1,resultSha256:hash('b'),canConsult:true},{id:uid(11),period:'2026-10',liquidationType:'monthly',createdAt:'2026-10-12T12:00:00Z',employeeCount:1,resultSha256:hash('c'),canConsult:true}]});
function harness(t,taskId='historial'){
 const docEvents=payrollPanelEvents(),winEvents=payrollPanelEvents(),head=new Element('head'),requests=[],reviews=[],preparations=[],data=bootstrap();
 let deferredAuth=null;const state={caps:[...OWN_RUN_PREPARE],user:'synthetic-native-history',rows:data,deferNextAuth:false,authStatus:200},expiresAt=new Date(Date.now()+120000).toISOString();
 const auth=()=>({ok:true,authenticated:true,sessionVersion:2,expiresAt,user:{id:state.user,email:'native-history@example.invalid'},access:{context:'tenant',tenant:{id:uid(1),roleKey:'SYNTHETIC_HISTORY'},tenantCapabilities:[...state.caps]}});
 const document={...docEvents,head,hidden:false,createElement:tag=>new Element(tag),querySelectorAll:()=>[],getElementById:()=>null};
 const fetch=async(url,options={})=>{requests.push({url,method:options.method??'GET'});assert.equal(options.method??'GET','GET');if(url==='/api/internal-auth'){const captured=auth(),status=state.authStatus;if(state.deferNextAuth){state.deferNextAuth=false;return new Promise(resolve=>{deferredAuth={resolve,payload:captured,status,signal:options.signal};});}return new Response(JSON.stringify(captured),{status});}if(url==='/api/internal-own-payroll-liquidation?resource=bootstrap')return new Response(JSON.stringify({ok:true,data:state.rows}));assert.fail('Unexpected endpoint '+url);};
 const globals={document,window:winEvents,location:{origin:'http://127.0.0.1:32123'},fetch,Option:function(label,value){const n=new Element('option');n.textContent=label;n._value=value;return n;}};
 const before=new Map(Object.keys(globals).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));Object.assign(globalThis,globals);
 t.after(()=>{winEvents.dispatch('pagehide');for(const[k,v]of before)if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];});
 const mount=task=>{const host=new Element('div');const component=mountOwnPayrollSummary(host,{taskId:task,onReview:value=>{reviews.push(value);return true;},onTask:()=>true,onPreparation:value=>{preparations.push(value);return true;}});return{host,component};};
 const {host,component}=mount(taskId),get=k=>{const n=host.querySelector('[data-own-summary-'+k+']');assert.ok(n,k);return n;};docEvents.dispatch('taskchange',{id:taskId});
 return{host,component,get,mount,document,docEvents,requests,reviews,preparations,state,pendingAuth:()=>deferredAuth,releaseAuth:()=>{assert.ok(deferredAuth);const held=deferredAuth;deferredAuth=null;held.resolve(new Response(JSON.stringify(held.payload),{status:held.status}));}};
}

test('closed native profiles reject arbitrary tasks and keep unique DOM ids',t=>{
 assert.throws(()=>ownSummaryTaskProfile('external'));assert.throws(()=>ownSummaryTaskProfile('constructor'));
 const h=harness(t,'resumen'),hosts=[h.host,h.mount('historial').host,h.mount('correcciones').host],ids=hosts.flatMap(host=>host.querySelectorAll('[id]').map(n=>n.getAttribute('id')));
 assert.equal(new Set(ids).size,ids.length);assert.match(hosts[1].textContent,/Historial de liquidaciones propias/);assert.match(hosts[2].textContent,/Corregir una liquidación propia/);
});
for(const task of ['historial','correcciones'])test(task+' activates real native GET and opens the exact saved result',async t=>{
 const h=harness(t,task);await h.get('consult').emit('click');assert.ok(h.requests.some(r=>r.url==='/api/internal-own-payroll-liquidation?resource=bootstrap'));
 assert.equal(h.requests.some(r=>r.url.includes('payrollControl')||r.url.includes('reprocessing')),false);
 const button=h.get('runs').querySelector('button');assert.ok(button);await button.emit('click');assert.equal(h.reviews.length,1);
 const row=h.state.rows.runs.find(r=>r.id===h.reviews[0].runId);assert.ok(row);assert.equal(h.reviews[0].resultSha256,row.resultSha256);assert.equal(h.reviews[0].contractId,null);assert.equal(typeof h.reviews[0].accessKey,'string');assert.ok(Object.isFrozen(h.reviews[0]));
});
test('native review refuses a changed source even when the row UUID remains',async t=>{
 const h=harness(t);await h.get('consult').emit('click');const button=h.get('runs').querySelector('button');h.state.rows=structuredClone(h.state.rows);h.state.rows.runs.find(r=>r.id===uid(11)).resultSha256=hash('d');await button.emit('click');assert.equal(h.reviews.length,0);assert.match(h.get('status').textContent,/Cambió/);
});
test('complete native history pagination and filtering do not infer liquidation state',async t=>{
 const h=harness(t);h.state.rows.runs=Array.from({length:41},(_,i)=>({...bootstrap().runs[0],id:uid(i+100),period:i%2?'2026-09':'2026-10'}));await h.get('consult').emit('click');assert.equal(h.get('runs').children.length,20);await h.get('next').emit('click');assert.equal(h.get('runs').children.length,20);await h.get('next').emit('click');assert.equal(h.get('runs').children.length,1);h.get('period').value='2026-09';await h.get('period').emit('change');assert.equal(h.get('runs').children.length,20);assert.equal(h.host.textContent.includes('Ejecución externa autorizada'),false);
});
test('209 link transfers only a purpose reference; fresh Calcular must reread it',async t=>{
 const h=harness(t,'correcciones');await h.get('consult').emit('click');h.get('preparation-link').value='/nomina?anulacion='+uid(80)+'#calculo';await h.get('preparation-use').emit('click');assert.deepEqual(h.preparations,[{kind:'projected_annulment',sourceId:uid(80)}]);assert.ok(Object.isFrozen(h.preparations[0]));assert.ok(h.requests.every(r=>r.method==='GET'));assert.equal(h.requests.some(r=>r.url.includes('annulment-preparation')),false,'The widget queues; it never pretends209 has already been read');
});
for(const value of ['https://other.invalid/nomina?anulacion='+uid(80)+'#calculo','/nomina?corrida='+uid(10)+'&decision='+uid(80)+'#calculo','/nomina?anulacion='+uid(80)+'&actor=else#calculo','/nomina?anulacion='+uid(80)+'&anulacion='+uid(81)+'#calculo','/nomina?anulacion='+uid(80)+'#recibos',' /nomina?anulacion='+uid(80)+'#calculo'])test('209 reference rejects unbound input '+value,()=>assert.throws(()=>ownSummaryPreparationReference(value,'http://127.0.0.1:32123')));
test('lost preparation permission prevents the209 callback',async t=>{
 const h=harness(t,'correcciones');await h.get('consult').emit('click');h.get('preparation-link').value='/nomina?anulacion='+uid(80)+'#calculo';h.state.caps=[...OWN_LIQ_NOMINAL];await h.get('preparation-use').emit('click');assert.equal(h.preparations.length,0);assert.equal(h.get('preparation-link').value,'');assert.equal(h.get('runs').children.length,0);assert.equal(h.get('preparation-use').disabled,true);assert.equal(h.requests.some(r=>r.method!=='GET'),false);
});
test('prepare-only revocation aborts pending auth and rejects its late stale response',async t=>{
 const h=harness(t,'correcciones');await h.get('consult').emit('click');assert.ok(h.get('runs').children.length>0);assert.equal(h.get('preparation-use').disabled,false);h.get('preparation-link').value='/nomina?anulacion='+uid(80)+'#calculo';
 h.state.deferNextAuth=true;const pending=h.get('preparation-use').emit('click'),held=h.pendingAuth();assert.ok(held);assert.equal(held.signal.aborted,false);assert.ok(held.payload.access.tenantCapabilities.includes('payroll.calculation.prepare'));
 h.docEvents.dispatch('municontrol:capabilities-ready',{tenantCapabilities:[...OWN_LIQ_NOMINAL]});assert.equal(held.signal.aborted,true);assert.equal(h.get('preparation-link').value,'');assert.equal(h.get('runs').children.length,0);assert.equal(h.get('preparation-use').disabled,true);
 // This synthetic fetch intentionally ignores abort to exercise the sequence
 // fence as well. A late response cannot restore access or invoke the callback.
 h.releaseAuth();await pending;assert.equal(h.preparations.length,0);assert.equal(h.get('preparation-link').value,'');assert.equal(h.get('runs').children.length,0);assert.equal(h.get('preparation-use').disabled,true);assert.ok(h.requests.every(r=>r.method==='GET'));
});
test('auth401 erases a typed209 reference and previously read native rows',async t=>{
 const h=harness(t,'correcciones');await h.get('consult').emit('click');h.get('preparation-link').value='/nomina?anulacion='+uid(80)+'#calculo';h.state.authStatus=401;await h.get('preparation-use').emit('click');assert.equal(h.preparations.length,0);assert.equal(h.get('preparation-link').value,'');assert.equal(h.get('runs').children.length,0);assert.equal(h.get('preparation-use').disabled,true);
});
test('changed actor cannot carry the209 reference into another session',async t=>{
 const h=harness(t,'correcciones');await h.get('consult').emit('click');h.get('preparation-link').value='/nomina?anulacion='+uid(80)+'#calculo';h.state.user='another-synthetic-actor';await h.get('preparation-use').emit('click');assert.equal(h.preparations.length,0);assert.equal(h.get('preparation-link').value,'');assert.equal(h.get('runs').children.length,0);
});
test('task change withdraws the native source and209 reference',async t=>{
 const h=harness(t,'correcciones');await h.get('consult').emit('click');h.get('preparation-link').value='/nomina?anulacion='+uid(80)+'#calculo';h.docEvents.dispatch('taskchange',{id:'historial'});assert.equal(h.get('runs').children.length,0);assert.equal(h.get('preparation-link').value,'');assert.equal(h.get('preparation-use').disabled,true);
});

// Execute the actual navigation source with mount/workspace adapters. No project
// entrypoint is imported and no service/PG result is fabricated as acceptance.
test('actual navigation wires both native tasks while retaining explicit external history',()=>{
 const source=fs.readFileSync(new URL('../assets/payroll-navigation.js',import.meta.url),'utf8'),calls=[],queues=[],activations=[],sections=new Map();let groups;
 const node=()=>({children:[],dataset:{},classList:{add(){}},append(...items){this.children.push(...items);},insertBefore(child){this.children.push(child);},prepend(child){this.children.unshift(child);},setAttribute(){},querySelector(){return node();},querySelectorAll(){return[];}});
 const main=node(),heading=node();main.querySelector=selector=>selector==='.page-head'?heading:null;
 const anchor=id=>{if(!sections.has(id)){const section=node(),n=node();n.closest=()=>section;n.section=section;sections.set(id,n);}return sections.get(id);};
 const document={readyState:'complete',body:node(),createElement:()=>node(),getElementById:id=>id==='mainContent'?main:anchor(id)};
 const sandbox={document,location:{search:''},console};
 for(const match of source.matchAll(/^import\s*\{([^}]+)\}[^\n]*$/gm))for(const field of match[1].split(',')){const name=field.trim();if(name.startsWith('mount'))sandbox[name]=(host,options={})=>{calls.push({name,host,options});return{queuePreparation:v=>{queues.push(['calculo',v]);return true;},queueConsult:v=>{queues.push(['decisiones',v]);return true;},queueReview:v=>{queues.push(['anulacion',v]);return true;}};}}
 sandbox.requestedOwnAnnulPreparation=()=>null;sandbox.toolDetails=(child,label)=>{const n=node();n.label=label;n.children.push(child);return n;};sandbox.taskWorkspace=config=>{groups=config.groups;return{activate:id=>{activations.push(id);return true;}};};
 vm.runInNewContext(source.replace(/^import[^\n]*\n/gm,''),sandbox,{filename:'actual-payroll-navigation.js'});
 const native=calls.filter(c=>c.name==='mountOwnPayrollSummary'),history=native.find(c=>c.options.taskId==='historial'),corrections=native.find(c=>c.options.taskId==='correcciones');assert.ok(history);assert.ok(corrections);
 const hg=groups.find(g=>g.id==='historial').nodes[0],cg=groups.find(g=>g.id==='correcciones').nodes[0];assert.ok(hg.children.includes(history.host));assert.ok(cg.children.includes(corrections.host));
 assert.ok(cg.children.some(n=>n.children?.includes(anchor('reprocessingTitle').section)),'External035 stays reachable in its explicit details');assert.ok(hg.children.some(n=>n.children?.some(child=>child.children?.includes(anchor('historyTitle').section))),'Incorporated history is retained');
 const review={runId:uid(10),resultSha256:hash('a'),contractId:null,accessKey:'native-source'};assert.equal(history.options.onReview(review),true);assert.deepEqual(queues.at(-1),['decisiones',review]);assert.equal(activations.at(-1),'decisiones');
 const ref={kind:'projected_annulment',sourceId:uid(80)};assert.equal(corrections.options.onPreparation(ref),true);assert.deepEqual(queues.at(-1),['calculo',ref]);assert.equal(activations.at(-1),'calculo');
});
