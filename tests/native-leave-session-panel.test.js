import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {setImmediate as turn} from 'node:timers/promises';
import {mountNativeLeave} from '../assets/native-leave.js';
import {mountNativeSelf} from '../assets/native-self.js';
import {NATIVE_LEAVE_VERSION} from '../assets/native-leave-model.js';
import {NativeLeavePanelElement,nativeLeavePanelEnvironment} from './fixtures/native-leave-panel-dom.js';

let serial=0;
const uid=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const sorted=v=>Array.isArray(v)?v.map(sorted):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sorted(v[k])])):v;
const fingerprint=body=>createHash('sha256').update(JSON.stringify(sorted(body))).digest('hex');
const until=async predicate=>{const deadline=Date.now()+2000;while(Date.now()<deadline){if(predicate())return;await turn();}assert.fail('The synthetic component did not settle');};
const selector=name=>'[data-nleave-'+name+']';
function fixture(t,{self=false}={}){
 const env=nativeLeavePanelEnvironment(t),contractId=uid(100+(++serial)),caps=self?['actions.read','leave.request.self.read','leave.request.self.create','leave.request.self.update','leave.request.self.submit','leave.request.self.cancel']:['workforce.employee.read','actions.read','leave.request.all.manage','leave.request.all.read'];
 const auth={ok:true,authenticated:true,sessionVersion:2,user:{id:uid(1),email:'leave-component@example.test',role:self?'JUNIN_EMPLEADO':'JUNIN_RRHH_OPERADOR'},access:{tenant:{id:uid(2),roleKey:self?'JUNIN_EMPLEADO':'JUNIN_RRHH_OPERADOR'},tenantCapabilities:caps},expiresAt:'2099-01-01T00:00:00.000Z'};
 const bootstrap={version:NATIVE_LEAVE_VERSION,scopeVersion:'d'.repeat(64),snapshotVersion:'a'.repeat(64),subject:{contractId,legajo:'5001',employeeName:'PERSONA EXCLUSIVAMENTE SINTÉTICA',identityToken:'e'.repeat(64),sourceCutoff:null,origin:'MUNICONTROL',registrationId:uid(9),registeredAt:'2026-09-23T12:00:00.000000Z'},employment:{version:'b'.repeat(64),revision:0,appliedAt:null,intervals:[{startDate:'2026-09-21',endDate:null}],today:'2026-10-01',status:'active'},permissions:{canCreate:true,canProposeProfile:!self},complete:true,requests:[],profileProposals:[],balances:[]};
 const state={auth,bootstrap,lost:true,missing:false,hold:false,held:[],holdBootstrap:false,heldBootstrap:[],corrupt:false},calls=[],receipts=new Map(),controls=[];
 const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
 globalThis.fetch=async(url,options={})=>{
  const call={url,method:options.method??'GET',body:options.body,key:options.headers?.['Idempotency-Key']};calls.push(call);
  const endpoint=new URL(url,'https://leave-component.invalid').pathname,allowed=self?['/api/internal-auth','/api/internal-native-self','/api/internal-native-self-leave']:['/api/internal-auth','/api/internal-native-leave'];
  assert.ok(allowed.includes(endpoint),'Only the selected leave protocol may be requested');assert.ok(['GET','POST'].includes(call.method));
  if(call.method==='POST')assert.equal(endpoint,self?'/api/internal-native-self-leave':'/api/internal-native-leave');
  if(url==='/api/internal-auth')return json(structuredClone(state.auth));
  const query=new URL(url,'https://leave-component.invalid').searchParams;
  if(url.startsWith('/api/internal-native-self?'))return json({ok:true,data:{version:'native-employee-self.v1',state:'native',subject:structuredClone(bootstrap.subject)}});
  if(options.method==='POST'){
   const body=JSON.parse(options.body).payload;
   const receipt={version:NATIVE_LEAVE_VERSION,command:body.command,contractId,entityId:uid(10),entityVersion:body.expectedVersion+1,status:'draft',payload:body.payload,requestSha256:fingerprint(body),replayed:false,payrollModified:false};receipts.set(call.key,receipt);
   if(state.lost)throw Error('Synthetic lost acknowledgement');return json({ok:true,data:receipt});
  }
  if(query.get('resource')==='bootstrap'){const value=structuredClone(state.bootstrap);if(state.holdBootstrap){state.holdBootstrap=false;await new Promise(resolve=>state.heldBootstrap.push(resolve));}return json({ok:true,data:value});}
  if(query.get('resource')==='attempt'){
   if(state.hold)await new Promise(resolve=>state.held.push(resolve));
   if(state.missing)return json({ok:false,code:'NATIVE_LEAVE_NOT_FOUND',error:'Intento sintético aún sin comprobante.'},404);
   const receipt=receipts.get(query.get('key'));assert.ok(receipt);return json({ok:true,data:{...receipt,replayed:true,...(state.corrupt?{requestSha256:'0'.repeat(64)}:{})}});
  }
  assert.fail('Unexpected synthetic transport: '+url);
 };
 const makeHost=()=>new NativeLeavePanelElement('section');
 async function mount(){const host=makeHost(),control=mountNativeLeave(host,{contractId,selfService:self});controls.push(control);await until(()=>!host.querySelector(selector('refresh')).disabled);return host;}
 t.after(()=>{try{for(const control of controls)control?.close();}finally{env.restore();}});
 const node=(host,name)=>host.querySelector(selector(name));
 const ready=host=>until(()=>!node(host,'refresh').disabled);
 async function create(host){await node(host,'create').emit('click');node(host,'checked').checked=true;await node(host,'checked').emit('change');await node(host,'form').emit('submit');await until(()=>!node(host,'refresh').disabled&&!node(host,'pending').hidden);}
 return{...env,auth,state,calls,contractId,mount,makeHost,node,ready,create,controls};
}

test('same live session recovers or retries exactly its original leave body and key',async t=>{
 const f=fixture(t),host=await f.mount();await f.create(host);const first=f.calls.find(c=>c.method==='POST');
 f.state.missing=true;await f.node(host,'recover').emit('click');await f.ready(host);assert.equal(f.node(host,'retry').disabled,false);
 f.state.missing=false;f.state.lost=false;await f.node(host,'retry').emit('click');await f.ready(host);
 const posts=f.calls.filter(c=>c.method==='POST');assert.equal(posts.length,2);assert.equal(posts[1].body,first.body);assert.equal(posts[1].key,first.key);assert.equal(f.node(host,'pending').hidden,true);
});

test('new session of the same account does not inherit another session pending leave attempt',async t=>{
 const f=fixture(t),first=await f.mount();await f.create(first);const original=f.calls.find(c=>c.method==='POST');f.controls[0].close();
 f.state.auth={...f.auth,user:{...f.auth.user,id:uid(3)}};const second=await f.mount();
 assert.equal(f.node(second,'pending').hidden,true);assert.equal(f.node(second,'create').hidden,false);assert.ok(!f.node(second,'reference').textContent.includes(original.key));
 await f.create(second);const later=f.calls.filter(c=>c.method==='POST').at(-1);assert.notEqual(later.key,original.key);f.controls[1].close();
 f.state.auth=f.auth;const restored=await f.mount();assert.match(f.node(restored,'reference').textContent,new RegExp(original.key));await f.node(restored,'recover').emit('click');await f.ready(restored);assert.equal(f.node(restored,'pending').hidden,true);assert.equal(f.calls.filter(c=>c.method==='POST').length,2);
});

test('live leave panel withdraws data before rereading a contract when its session changes',async t=>{
 const f=fixture(t),host=await f.mount(),before=f.calls.filter(c=>c.url.includes('resource=bootstrap')).length;
 f.state.auth={...f.auth,user:{...f.auth.user,id:uid(3)}};await f.node(host,'refresh').emit('click');await f.ready(host);
 assert.equal(f.calls.filter(c=>c.url.includes('resource=bootstrap')).length,before);assert.equal(f.node(host,'content').hidden,true);assert.ok(!f.node(host,'source').textContent.includes('5001'));assert.match(f.node(host,'status').textContent,/cuenta|sesión|ámbito/);
});

test('employee self-service rejects an initial/current session mismatch before resolving a contract',async t=>{
 const f=fixture(t,{self:true}),host=f.makeHost();f.state.auth={...f.auth,user:{...f.auth.user,id:uid(3)}};
 const control=await mountNativeSelf(host,{auth:f.auth});f.controls.push(control);await turn();
 assert.equal(f.calls.filter(c=>c.url.startsWith('/api/internal-native-self')).length,0);assert.ok(!host.textContent.includes('5001'));assert.match(host.textContent,/sesión|cuenta|permisos/);
});

test('a late recovery for an older attempt cannot clear the next attempt in a second live mount',async t=>{
 const f=fixture(t),first=await f.mount();await f.create(first);const second=await f.mount();f.state.hold=true;
 const recoverFirst=f.node(first,'recover').emit('click'),recoverSecond=f.node(second,'recover').emit('click');await until(()=>f.state.held.length===2);
 f.state.held[0]();await recoverFirst;await f.ready(first);await f.create(first);const next=f.calls.filter(c=>c.method==='POST').at(-1);assert.match(f.node(first,'reference').textContent,new RegExp(next.key));
 f.state.held[1]();await recoverSecond;await f.ready(second);assert.equal(f.node(second,'pending').hidden,false);assert.match(f.node(second,'reference').textContent,new RegExp(next.key));assert.equal(f.calls.filter(c=>c.method==='POST').length,2);
});

test('a superseded retry does not post after its held bootstrap returns',async t=>{
 const f=fixture(t),first=await f.mount();await f.create(first);const second=await f.mount();
 f.state.missing=true;await f.node(second,'recover').emit('click');await f.ready(second);assert.equal(f.node(second,'retry').disabled,false);
 f.state.holdBootstrap=true;const stale=f.node(second,'retry').emit('click');await until(()=>f.state.heldBootstrap.length===1);
 f.state.missing=false;await f.node(first,'recover').emit('click');await f.ready(first);await f.create(first);const next=f.calls.filter(c=>c.method==='POST').at(-1);
 f.state.heldBootstrap[0]();await stale;await f.ready(second);assert.equal(f.calls.filter(c=>c.method==='POST').length,2);assert.equal(f.node(second,'pending').hidden,false);assert.match(f.node(second,'reference').textContent,new RegExp(next.key));
});

test('a late missing receipt for an older attempt cannot enable retry on the new attempt',async t=>{
 const f=fixture(t),first=await f.mount();await f.create(first);const second=await f.mount();f.state.hold=true;
 const stale=f.node(second,'recover').emit('click');await until(()=>f.state.held.length===1);f.state.hold=false;
 await f.node(first,'recover').emit('click');await f.ready(first);await f.create(first);const next=f.calls.filter(c=>c.method==='POST').at(-1);
 f.state.missing=true;f.state.held[0]();await stale;await f.ready(second);assert.equal(f.node(second,'retry').disabled,true);assert.match(f.node(second,'reference').textContent,new RegExp(next.key));assert.equal(f.calls.filter(c=>c.method==='POST').length,2);
});

test('a closed panel discards its held recovery while the same session can recover from a new panel',async t=>{
 const f=fixture(t),first=await f.mount();await f.create(first);const original=f.calls.find(c=>c.method==='POST');f.state.hold=true;
 const stale=f.node(first,'recover').emit('click');await until(()=>f.state.held.length===1);f.controls[0].close();const second=await f.mount();
 f.state.held[0]();await stale;assert.equal(f.node(first,'content').hidden,true);assert.equal(f.node(second,'pending').hidden,false);assert.match(f.node(second,'reference').textContent,new RegExp(original.key));
 f.state.hold=false;await f.node(second,'recover').emit('click');await f.ready(second);assert.equal(f.node(second,'pending').hidden,true);assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
});

test('a mismatched receipt cannot confirm or replace the original pending request',async t=>{
 const f=fixture(t),host=await f.mount();await f.create(host);const original=f.calls.find(c=>c.method==='POST');f.state.corrupt=true;
 await f.node(host,'recover').emit('click');await f.ready(host);assert.equal(f.node(host,'pending').hidden,true);assert.match(f.node(host,'status').textContent,/respuesta no pudo verificarse/);assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
 f.controls[0].close();f.state.corrupt=false;const restored=await f.mount();assert.match(f.node(restored,'reference').textContent,new RegExp(original.key));await f.node(restored,'recover').emit('click');await f.ready(restored);assert.equal(f.node(restored,'pending').hidden,true);
});

test('valid self-service resolves only its own contract without general directory access',async t=>{
 const f=fixture(t,{self:true}),host=f.makeHost(),control=await mountNativeSelf(host,{auth:f.auth});f.controls.push(control);
 await until(()=>host.querySelector(selector('refresh'))?.disabled===false);assert.equal(control.ownOnly,true);assert.match(host.textContent,/legajo 5001/);
 assert.equal(f.node(host,'profile').hidden,true);assert.equal(f.node(host,'create').hidden,false);assert.equal(f.calls.filter(c=>c.method==='POST').length,0);assert.ok(!f.calls.some(c=>c.url.startsWith('/api/internal-native-leave')));
});

for(const [label,patch] of [['missing managed session UUID',auth=>{delete auth.user.id;}],['expired session',auth=>{auth.expiresAt='2000-01-01T00:00:00.000Z';}],['revoked leave capabilities',auth=>{auth.access.tenantCapabilities=['actions.read'];}]])test(label+' cannot read a leave bootstrap',async t=>{
 const f=fixture(t);f.state.auth=structuredClone(f.auth);patch(f.state.auth);const host=await f.mount();assert.equal(f.calls.length,1);assert.equal(f.node(host,'content').hidden,true);assert.equal(f.node(host,'create').hidden,true);assert.ok(!f.node(host,'source').textContent.includes('5001'));
});
