import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {setImmediate as turn} from 'node:timers/promises';
import {mountAttendancePreparte} from '../assets/attendance-preparte-panel.js';
import {NativeLeavePanelElement,nativeLeavePanelEnvironment} from './fixtures/native-leave-panel-dom.js';

const CAPS=['attendance.read','workforce.employee.read','payroll.novelty.prepare'];
const hash=value=>createHash('sha256').update(value).digest('hex');
const until=async predicate=>{const end=Date.now()+2000;while(Date.now()<end){if(predicate())return;await turn();}assert.fail('Synthetic preparte did not settle');};
function synthetic(count=30){
 return{ok:true,version:'attendance-preparte.v1',period:'2026-09',site:{key:'pm-10',label:'PUNTO EXCLUSIVAMENTE SINTÉTICO'},nominalReadAllowed:true,sourceComplete:true,coverageCertified:false,payrollCalculated:false,payrollPosted:false,snapshotId:'10000000-0000-4000-8000-000000000001',evidenceHash:hash('synthetic-complete-cut'),observations:0,generatedAt:'2026-10-01T12:00:00Z',lastReceiptAt:'2026-10-01T11:00:00Z',timezone:'America/Argentina/Mendoza',rulesVersion:'SYNTHETIC-ONLY',summary:{people:count,readyForReview:count,withIncidents:0},rows:Array.from({length:count},(_,i)=>({key:hash('synthetic-row-'+i),evidenceHash:hash('synthetic-evidence-'+i),name:'PERSONA EXCLUSIVAMENTE SINTÉTICA '+i,legajo:String(99000+i),daysObserved:1,daysToReview:0,extraIntervals:1,ordinarySeconds:28800,extraSeconds:14400,issues:[],canPropose:true}))};
}
function fixture(t,{gate}={}){
 const env=nativeLeavePanelEnvironment(t),oldGate=Object.getOwnPropertyDescriptor(globalThis,'MuniControlCapabilityGate');globalThis.MuniControlCapabilityGate=gate;
 const host=new NativeLeavePanelElement('details'),calls=[],denied=[],transfers=[],source=synthetic(),state={allowed:true,next:null,period:'2026-09'};
 env.document.body=new NativeLeavePanelElement('body');env.win.confirm=()=>true;
 globalThis.fetch=async(url,options={})=>{
  assert.ok(url.startsWith('/api/internal-attendance?'));assert.equal(options.method,undefined);const query=new URL(url,'https://preparte-access.invalid').searchParams;assert.equal(query.get('resource'),'clock-preparte');
  const config=state.next??{};state.next=null;let releaseFetch=()=>{},releaseJson=()=>{};const fetchWait=config.holdFetch?new Promise(resolve=>{releaseFetch=resolve;}):null,jsonWait=config.holdJson?new Promise(resolve=>{releaseJson=resolve;}):null;
  const value=config.status?{error:'Acceso exclusivamente sintético retirado'}:structuredClone(source),call={url,signal:options.signal,releaseFetch,releaseJson,jsonStarted:false};calls.push(call);
  if(fetchWait)await fetchWait;return{ok:!config.status,status:config.status??200,json:async()=>{call.jsonStarted=true;if(jsonWait)await jsonWait;return value;}};
 };
 const controller=mountAttendancePreparte(host,{canUse:()=>state.allowed,period:()=>state.period,payrollType:()=> 'monthly',onUse:value=>{transfers.push(value);},onDenied:error=>{denied.push(error.status);}}),node=name=>host.querySelector('[data-ap-'+name+']');
 const notify=(caps=CAPS)=>env.events.dispatch('municontrol:capabilities-ready',{tenantCapabilities:caps});
 t.after(()=>{try{controller.clear();}finally{if(oldGate)Object.defineProperty(globalThis,'MuniControlCapabilityGate',oldGate);else delete globalThis.MuniControlCapabilityGate;env.restore();}});
 async function load(){await node('load').emit('click');}
 async function select(){await load();for(let page=0;page<2;page++){for(const row of host.querySelectorAll('[data-ap-key]')){const selected=row.querySelector('[data-ap-field="selected"]'),cap=row.querySelector('[data-ap-field="cap"]');cap.value='3';await cap.emit('input');selected.checked=true;await selected.emit('change');}if(page===0)await node('next').emit('click');}node('reference').value='Documento exclusivamente sintético';await node('reference').emit('input');node('reviewed').checked=true;await node('reviewed').emit('change');}
 return{...env,controller,host,node,calls,denied,transfers,source,state,notify,load,select};
}

test('revoking attendance alone withdraws all pages, review decisions and nominal source text without calling its parent',async t=>{
 const f=fixture(t);await f.select();assert.equal(f.node('use').disabled,false);const before=f.calls.length;
 f.notify(CAPS.filter(cap=>cap!=='attendance.read'));
 assert.equal(f.node('result').hidden,true);assert.equal(f.node('rows').children.length,0);assert.equal(f.node('metrics').textContent,'');assert.equal(f.node('source').textContent,'');assert.equal(f.node('count').textContent,'');assert.equal(f.node('reference').value,'');assert.equal(f.node('reviewed').checked,false);
 for(const name of ['load','use','check','export'])assert.equal(f.node(name).disabled,true,name);await f.node('use').emit('click');await f.node('export').emit('click');assert.equal(f.calls.length,before);assert.equal(f.transfers.length,0);assert.equal(f.denied.length,0);
});

test('a temporary parent write lock retains the reviewed preparte and is not an authority withdrawal',async t=>{
 const f=fixture(t);await f.select();f.controller.setDisabled(true);f.state.allowed=false;f.controller.refreshAccess();assert.equal(f.node('result').hidden,false);assert.match(f.node('count').textContent,/30 seleccionados/);assert.equal(f.node('reference').value,'Documento exclusivamente sintético');assert.equal(f.node('reviewed').checked,true);
 f.state.allowed=true;f.controller.setDisabled(false);assert.equal(f.node('use').disabled,false);assert.equal(f.calls.length,1);assert.equal(f.transfers.length,0);
});

test('restoring authority requires a fresh GET and never restores former selections',async t=>{
 const f=fixture(t);await f.select();f.notify([]);f.notify();assert.equal(f.node('result').hidden,true);assert.equal(f.node('load').disabled,false);assert.equal(f.node('use').disabled,true);assert.equal(f.calls.length,1);
 await f.load();assert.equal(f.calls.length,2);assert.match(f.node('count').textContent,/0 seleccionados/);assert.equal(f.node('reviewed').checked,false);assert.equal(f.node('reference').value,'');
});

test('retired initial GET is aborted and cannot repopulate after authority has already returned',async t=>{
 const f=fixture(t);f.state.next={holdFetch:true};const pending=f.load();await until(()=>f.calls.length===1);f.notify([]);assert.equal(f.calls[0].signal.aborted,true);f.notify();f.calls[0].releaseFetch();await pending;
 assert.equal(f.node('result').hidden,true);assert.equal(f.node('rows').children.length,0);assert.equal(f.transfers.length,0);assert.equal(f.denied.length,0);
});

test('an old finally cannot unlock a new read started after authority returns',async t=>{
 const f=fixture(t);f.state.next={holdFetch:true};const old=f.load();await until(()=>f.calls.length===1);f.notify([]);f.notify();f.state.next={holdFetch:true};const current=f.load();await until(()=>f.calls.length===2);
 f.calls[0].releaseFetch();await old;assert.equal(f.node('load').disabled,true);assert.equal(f.node('result').hidden,true);f.calls[1].releaseFetch();await current;assert.equal(f.node('load').disabled,false);assert.equal(f.node('result').hidden,false);
});

test('changing the period retires its read without leaving the next query permanently busy',async t=>{
 const f=fixture(t);f.state.next={holdFetch:true};const old=f.load();await until(()=>f.calls.length===1);f.state.period='2026-10';f.controller.periodChanged();assert.equal(f.calls[0].signal.aborted,true);f.state.period='2026-09';f.controller.periodChanged();f.state.next={holdFetch:true};const current=f.load();await until(()=>f.calls.length===2);
 f.calls[0].releaseFetch();await old;assert.equal(f.node('load').disabled,true);f.calls[1].releaseFetch();await current;assert.equal(f.node('load').disabled,false);assert.equal(f.node('result').hidden,false);
});

for(const status of [401,403])for(const phase of ['fetch','json'])test('retired '+status+' during '+phase+' cannot call the parent denial handler or restore data',async t=>{
 const f=fixture(t);await f.select();f.state.next={status,...(phase==='fetch'?{holdFetch:true}:{holdJson:true})};const pending=f.load();await until(()=>f.calls.length===2&&(phase==='fetch'||f.calls[1].jsonStarted));f.notify([]);f.notify();
 f.calls[1][phase==='fetch'?'releaseFetch':'releaseJson']();await pending;assert.equal(f.denied.length,0);assert.equal(f.node('result').hidden,true);assert.equal(f.node('rows').children.length,0);assert.equal(f.transfers.length,0);
});

test('a current server denial still withdraws the cut and informs its parent exactly once',async t=>{
 const f=fixture(t);await f.select();f.state.next={status:403};await f.load();assert.deepEqual(f.denied,[403]);assert.equal(f.node('result').hidden,true);assert.equal(f.node('rows').children.length,0);assert.equal(f.transfers.length,0);
});

test('authority withdrawal during revalidation prevents all thirty selected rows from being transferred',async t=>{
 const f=fixture(t);await f.select();f.state.next={holdFetch:true};const pending=f.node('use').emit('click');await until(()=>f.calls.length===2);f.notify(CAPS.filter(cap=>cap!=='attendance.read'));f.notify();f.calls[1].releaseFetch();await pending;
 assert.equal(f.transfers.length,0);assert.equal(f.node('result').hidden,true);assert.equal(f.node('reviewed').checked,false);assert.equal(f.node('reference').value,'');
});

for(const eventCaps of [CAPS,[]])test('late initial gate result cannot supersede a later '+(eventCaps.length?'grant':'withdrawal')+' event',async t=>{
 let resolve;const ready=new Promise(done=>{resolve=done;}),f=fixture(t,{gate:{ready}});f.notify(eventCaps);resolve({tenantCapabilities:eventCaps.length?[]:CAPS});await turn();await turn();
 assert.equal(f.node('load').disabled,eventCaps.length===0);await f.load();assert.equal(f.calls.length,eventCaps.length?1:0);
});
