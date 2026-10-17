import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {mountOwnPayrollClose} from '../assets/own-payroll-close-panel.js';
import {OWN_CLOSE_WRITE} from '../assets/own-payroll-close-model.js';
import {closeDetail} from './fixtures/own-payroll-close-synthetic.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';
import {PayrollPanelElement as Element,payrollPanelEvents as events} from './fixtures/payroll-panel-dom.js';

function harness(t){
 const host=new Element(),docEvents=events(),winEvents=events(),requests=[],timers=new Map();let timer=0;
 const names=['document','window','fetch','setTimeout','clearTimeout','setInterval','clearInterval'],originalGlobals=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 const document={...docEvents,hidden:false,head:new Element('head'),createElement:tag=>new Element(tag),querySelectorAll:()=>[],getElementById:()=>null};
 Object.assign(globalThis,{document,window:winEvents,setTimeout:fn=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id),setInterval:fn=>{timers.set(++timer,fn);return timer;},clearInterval:id=>timers.delete(id)});
 const d=closeDetail(1),state={detail:{...d,rows:[],captures:[],groups:[],canWrite:true},caps:[...OWN_CLOSE_WRITE],readError:null,networkOnWrite:false};
 globalThis.fetch=async(url,options={})=>{
  requests.push({url,method:options.method??'GET',body:options.body?JSON.parse(options.body):null,key:options.headers?.['Idempotency-Key']});
  if(url==='/api/internal-auth')return new Response(JSON.stringify({ok:true,authenticated:true,sessionVersion:2,user:{id:'close-synthetic-operator',email:'synthetic@example.test'},access:{context:'tenant',tenant:{id:uid(700),roleKey:'synthetic-role'},tenantCapabilities:state.caps},expiresAt:'2099-01-01T00:00:00Z'}));
  const q=new URL(url,'https://synthetic.example.test').searchParams;
  if(q.get('resource')==='detail')return state.readError?new Response(JSON.stringify({ok:false,code:'SYNTHETIC_UNAVAILABLE',error:'No se pudo consultar el cierre de ensayo'}),{status:503}):new Response(JSON.stringify({ok:true,data:state.detail}));
  if(options.method==='POST'&&state.networkOnWrite)throw Error('Fallo de red exclusivamente sintético');
  if(q.get('resource')==='attempt')return new Response(JSON.stringify({ok:false,code:'OWN_CLOSE_NOT_FOUND',error:'No se encontró el intento sintético'}),{status:404});
  assert.fail('Unexpected API operation '+url);
 };
 t.after(()=>{winEvents.dispatch('pagehide');for(const [name,descriptor]of originalGlobals)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];});
 const q=key=>{const element=host.querySelector('[data-close-'+key+']');assert.ok(element,'Actual close control '+key);return element;};
 const settled=async()=>{const deadline=Date.now()+5000;while(host.getAttribute('aria-busy')==='true'&&Date.now()<deadline)await delay(1);assert.notEqual(host.getAttribute('aria-busy'),'true');};
 const act=async(key,type='click')=>{await q(key).emit(type);await settled();};
 mountOwnPayrollClose(host);
 const start=async()=>{q('period').value=d.period;q('type').value=d.liquidationType;docEvents.dispatch('taskchange',{id:'cierre'});await settled();};
 return{host,q,state,requests,act,start,settled,event:docEvents.dispatch,hide:()=>{document.hidden=true;docEvents.dispatch('visibilitychange');},show:()=>{document.hidden=false;docEvents.dispatch('visibilitychange');}};
}

test('a verified empty closing period guides to calculation without enabling a municipal decision',async t=>{
 const h=harness(t);assert.equal(h.q('empty').hidden,true);await h.start();assert.equal(h.q('empty').hidden,false);assert.match(h.q('empty').textContent,/confirmar sus resultados/);assert.equal(h.q('empty').querySelector('a').getAttribute('href'),'/nomina#calculo');assert.equal(h.q('detail').hidden,true);assert.equal(h.q('send').disabled,true);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
 h.q('period').value='2026-10';await h.act('period','change');assert.equal(h.q('empty').hidden,true,'No empty state survives a period change');
});

test('an unavailable close query is not presented as an empty liquidated period',async t=>{
 const h=harness(t);h.state.readError=true;await h.start();assert.equal(h.q('empty').hidden,true);assert.equal(h.q('detail').hidden,true);assert.match(h.q('status').textContent,/No se pudo consultar/);assert.equal(h.q('send').disabled,true);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
});

test('confirmed nonempty closing data retains its original explicit review controls',async t=>{
 const h=harness(t);h.state.detail=closeDetail(1);await h.start();assert.equal(h.q('empty').hidden,true);assert.equal(h.q('detail').hidden,false);assert.equal(h.q('status').textContent,'Consulta actualizada. Revisá el alcance antes de registrar una decisión.');h.q('kind').value='all';await h.act('kind','change');assert.equal(h.q('send').disabled,true);h.q('confirm').checked=true;await h.act('confirm','change');assert.equal(h.q('send').disabled,false);h.hide();assert.equal(h.q('detail').hidden,true);assert.equal(h.q('empty').hidden,true);assert.equal(h.q('send').disabled,true);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
});

test('a missing closing attempt never becomes a navigation prompt that discards its original key',async t=>{
 const h=harness(t);h.state.detail=closeDetail(1);await h.start();h.q('kind').value='all';await h.act('kind','change');h.q('reason').value='Cierre exclusivamente sintético para QA';h.q('confirm').checked=true;await h.act('confirm','change');h.state.networkOnWrite=true;await h.act('form','submit');const original=structuredClone(h.requests.find(r=>r.method==='POST'));assert.ok(original.key);h.state.detail={...closeDetail(1),rows:[],captures:[],groups:[],canWrite:true};await h.act('recover');assert.equal(h.q('empty').hidden,true);assert.equal(h.q('recover').hidden,false);assert.equal(h.q('query-fields').disabled,true);assert.equal(h.q('revise').hidden,false);await h.act('form','submit');const sends=h.requests.filter(r=>r.method==='POST');assert.equal(sends.length,2);assert.deepEqual(sends[1],original);
});


test('an uncertain partial close restores the original locked review after hiding before retry',async t=>{
 const h=harness(t);h.state.detail=closeDetail(2);await h.start();h.q('kind').value='contracts';await h.act('kind','change');h.q('values').options[1].selected=true;await h.act('values','change');h.q('reason').value='Cierre parcial exclusivamente sintético conservado';h.q('confirm').checked=true;await h.act('confirm','change');h.state.networkOnWrite=true;await h.act('form','submit');const original=structuredClone(h.requests.find(r=>r.method==='POST'));
 assert.equal(original.body.payload.selection.values.length,1);h.hide();assert.equal(h.q('detail').hidden,true);assert.equal(h.q('reason').value,'');h.show();h.event('taskchange',{id:'cierre'});await h.settled();assert.equal(h.q('status').textContent,'Se conserva el intento original. Consultá su comprobante antes de reintentar la misma decisión.');assert.doesNotMatch(h.q('status').textContent,/No se registró/);
 assert.equal(h.q('fields').disabled,true);assert.equal(h.q('command').value,original.body.payload.command);assert.equal(h.q('kind').value,original.body.payload.selection.kind);assert.equal(h.q('reason').value,original.body.payload.reason);assert.equal(h.q('confirm').checked,true);assert.deepEqual(h.q('values').selectedOptions.map(o=>o.value),original.body.payload.selection.values);assert.match(h.q('scope').textContent,/Intento original: cierre/);assert.match(h.q('scope').textContent,/1 legajo exacto/);assert.equal(h.q('preview').textContent,'','Fresh totals must not impersonate the original reviewed snapshot');assert.equal(h.requests.filter(r=>r.method==='POST').length,1);
 await h.act('recover');await h.act('form','submit');assert.deepEqual(h.requests.filter(r=>r.method==='POST')[1],original);
});

test('an uncertain reopen stays a reopen even if its group is no longer currently reopenable',async t=>{
 const h=harness(t);h.state.detail=closeDetail(1);const group={id:uid(400),state:'closed',employeeCount:1,populationCount:1,populationComplete:true,recordedAt:'2026-10-05T14:00:00.000Z',reopenedAt:null,actorLabel:'Otra persona sintética',reason:'Cierre de ensayo exclusivamente sintético',snapshotSha256:'b'.repeat(64),canReopen:true};h.state.detail.groups=[group];await h.start();h.q('command').value='reopen';await h.act('command','change');h.q('group').value=group.id;await h.act('group','change');h.q('reason').value='Reapertura exclusivamente sintética conservada';h.q('confirm').checked=true;await h.act('confirm','change');h.state.networkOnWrite=true;await h.act('form','submit');const original=structuredClone(h.requests.find(r=>r.method==='POST'));assert.equal(original.body.payload.command,'reopen');
 h.hide();h.state.detail.groups=[{...group,state:'reopened',reopenedAt:'2026-10-06T14:00:00.000Z',canReopen:false}];h.show();h.event('taskchange',{id:'cierre'});await h.settled();assert.equal(h.q('command').value,'reopen');assert.equal(h.q('group').value,original.body.payload.groupId);assert.equal(h.q('reason').value,original.body.payload.reason);assert.equal(h.q('fields').disabled,true);assert.equal(h.q('kind-box').hidden,true);assert.equal(h.q('group-box').hidden,false);assert.match(h.q('scope').textContent,/Intento original: reapertura/);assert.match(h.q('group').textContent,/Grupo del intento original/);assert.equal(h.requests.filter(r=>r.method==='POST').length,1);
 await h.act('form','submit');assert.deepEqual(h.requests.filter(r=>r.method==='POST')[1],original);
});

test('a changed current population cannot erase or broaden an original pending contract selection',async t=>{
 const h=harness(t);h.state.detail=closeDetail(2);await h.start();h.q('kind').value='contracts';await h.act('kind','change');h.q('values').options[0].selected=true;await h.act('values','change');h.q('reason').value='Cierre conservado frente a cambio de consulta';h.q('confirm').checked=true;await h.act('confirm','change');h.state.networkOnWrite=true;await h.act('form','submit');const original=structuredClone(h.requests.find(r=>r.method==='POST'));h.hide();h.state.detail={...closeDetail(1),rows:[],captures:[],groups:[],canWrite:true};h.show();h.event('taskchange',{id:'cierre'});await h.settled();await h.act('recover');
 assert.equal(h.q('fields').disabled,true);assert.equal(h.q('kind').value,'contracts');assert.deepEqual(h.q('values').selectedOptions.map(o=>o.value),original.body.payload.selection.values);assert.match(h.q('values').textContent,/fuera de la consulta actual/);assert.match(h.q('scope').textContent,/1 legajo exacto/);assert.equal(h.q('empty').hidden,true);assert.equal(h.q('reason').value,original.body.payload.reason);await h.act('form','submit');assert.deepEqual(h.requests.filter(r=>r.method==='POST')[1],original);
});

test('authority withdrawal keeps a pending closure review hidden until the original account is reauthorized',async t=>{
 const h=harness(t);h.state.detail=closeDetail(1);await h.start();h.q('kind').value='all';await h.act('kind','change');h.q('reason').value='Cierre sintético con autorización original';h.q('confirm').checked=true;await h.act('confirm','change');h.state.networkOnWrite=true;await h.act('form','submit');const original=structuredClone(h.requests.find(r=>r.method==='POST'));h.hide();h.state.caps=[];h.show();h.event('taskchange',{id:'cierre'});await h.settled();assert.equal(h.q('detail').hidden,true);assert.equal(h.q('reason').value,'');assert.equal(h.q('send').disabled,true);assert.equal(h.requests.filter(r=>r.method==='POST').length,1);
 h.state.caps=[...OWN_CLOSE_WRITE];h.event('taskchange',{id:'cierre'});await h.settled();await h.act('recover');assert.equal(h.q('reason').value,original.body.payload.reason);assert.equal(h.q('kind').value,'all');assert.equal(h.q('fields').disabled,true);assert.equal(h.requests.filter(r=>r.method==='POST').length,1);
});
