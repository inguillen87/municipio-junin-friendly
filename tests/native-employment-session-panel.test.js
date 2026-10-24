import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as turn} from 'node:timers/promises';
import {mountNativeEmploymentChange} from '../assets/native-employment-change.js';
import {mountNativeEmploymentLifecycle} from '../assets/native-employment-lifecycle.js';
import {lifecycleFixture} from './fixtures/native-employment-lifecycle-synthetic.js';
import {catalog} from './fixtures/native-employee-synthetic.js';
import {NativeLeavePanelElement,nativeLeavePanelEnvironment} from './fixtures/native-leave-panel-dom.js';

let serial=0;
const uid=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const until=async fn=>{const end=Date.now()+2000;while(Date.now()<end){if(fn())return;await turn();}assert.fail('Synthetic employment panel did not settle');};
const summary=p=>Object.fromEntries(Object.entries(p).filter(([key])=>!['contractId','subject','catalogVersion','before','after','review'].includes(key)));
function data(kind,contractId){
 const f=lifecycleFixture();f.bootstrap.subject.contractId=contractId;f.proposal.contractId=contractId;f.proposal.subject.contractId=contractId;
 if(kind==='lifecycle')return f;
 const values={agreementCode:'1',categoryCode:'6',organizationId:'7',sectorCode:'2',jobTitle:'Cargo original QA'},items=catalog.items.map((r,i)=>({...r,key:'synthetic-'+i,agreementCode:r.agreementCode??null}));
 const labels=Object.fromEntries([['agreementCode','agreements','agreementName'],['categoryCode','categories','categoryName'],['organizationId','organizations','organizationName'],['sectorCode','sectors','sectorName']].map(([field,group,name])=>[name,items.find(i=>i.kind===group&&i.code===values[field]&&(group!=='categories'||i.agreementCode===values.agreementCode)).label]));
 const bootstrap={version:'native-employment-change.v1',scopeVersion:'d'.repeat(64),subject:structuredClone(f.bootstrap.subject),employment:{values,labels,version:'a'.repeat(64),revision:0,appliedAt:null},catalog:{items,version:'c'.repeat(64),origin:'MUNICONTROL',revision:1,publishedAt:'2026-09-23T12:00:00Z'},permissions:{canPropose:true,canReview:true},proposals:[],historyTruncated:false};
 const proposal={...f.proposal,catalogVersion:bootstrap.catalog.version,before:{values:structuredClone(values),labels:structuredClone(labels)},after:{values:{...values,jobTitle:'Cargo rectificado QA'},labels:structuredClone(labels)}};delete proposal.movement;delete proposal.date;
 return{bootstrap,proposal};
}
function fixture(t,kind){
 const env=nativeLeavePanelEnvironment(t),contractId=uid(1000+(++serial)),f=data(kind,contractId),prefix=kind==='change'?'nec':'nlc',api='/api/internal-employment-'+(kind==='change'?'changes':'lifecycle'),mount=kind==='change'?mountNativeEmploymentChange:mountNativeEmploymentLifecycle;
 const auth={ok:true,authenticated:true,sessionVersion:2,user:{id:uid(1),email:'employment-session@example.test',role:'JUNIN_RRHH_OPERADOR'},access:{tenant:{id:uid(2),roleKey:'JUNIN_RRHH_OPERADOR'},tenantCapabilities:['workforce.employee.read','employee.record.propose','employee.record.approve']},expiresAt:'2099-01-01T00:00:00.000Z'};
 const state={auth,missing:false,deniedReceipt:false,holdAttempt:false,heldAttempts:[],holdFresh:false,heldFresh:[],holdAuthAfter:0,holdFreshAfter:0,holdDetail:false,heldAccept:[],lost:true},calls=[],receipts=new Map(),proposals=new Map(),controls=[];
 env.document.dispatchEvent=event=>env.events.dispatch(event.type,event.detail);
 const json=(value,status=200)=>Response.json(value,{status});
 globalThis.fetch=async(url,options={})=>{
  calls.push({url,method:options.method??'GET',body:options.body,key:options.headers?.['Idempotency-Key'],session:state.auth.user.id});
  if(url==='/api/internal-auth'){const a=structuredClone(state.auth);if(state.holdAuthAfter&&--state.holdAuthAfter===0)await new Promise(resolve=>state.heldAccept.push(resolve));return json(a);}
  assert.ok(url===api||url.startsWith(api+'?'),'Only the selected employment API is called');
  const query=new URL(url,'https://employment-session.invalid').searchParams;
  if(options.method==='POST'){
   const known=receipts.get(options.headers['Idempotency-Key']);if(known){if(state.lost)throw Error('Synthetic lost replay acknowledgement');return json({ok:true,data:{...known,replayed:true}});}
   const body=JSON.parse(options.body),p=body.payload,id=uid(2000+receipts.size),proposal=structuredClone(f.proposal);assert.equal(body.operation,'propose');
   Object.assign(proposal,{id,reason:p.reason,legalReference:p.legalReference,canReview:false});if(kind==='change')proposal.after.values=structuredClone(p.values);else Object.assign(proposal,{movement:p.movement,date:p.date});
   proposals.set(id,proposal);f.bootstrap.proposals=[summary(proposal),...f.bootstrap.proposals];
   const receipt={version:f.bootstrap.version,operation:'propose',contractId,proposalId:id,status:'pending',employmentVersion:f.bootstrap.employment.version,revision:0,replayed:false,payrollModified:false};receipts.set(options.headers['Idempotency-Key'],receipt);
   if(state.lost)throw Error('Synthetic lost acknowledgement');return json({ok:true,data:receipt});
  }
  if(['bootstrap','history'].includes(query.get('resource'))){
   const b=structuredClone(f.bootstrap);if(state.holdFresh){state.holdFresh=false;await new Promise(resolve=>state.heldFresh.push(resolve));}if(state.holdFreshAfter&&--state.holdFreshAfter===0)await new Promise(resolve=>state.heldAccept.push(resolve));
   return json({ok:true,data:query.get('resource')==='history'?{version:'native-employment-lifecycle-history.v1',bootstrap:b,proposals:structuredClone(b.proposals),total:b.proposals.length,complete:true}:b});
  }
  if(query.get('resource')==='proposal'){const p=proposals.get(query.get('id'));assert.ok(p);const value=structuredClone(p);if(state.holdDetail){state.holdDetail=false;await new Promise(resolve=>state.heldAccept.push(resolve));}return json({ok:true,data:{version:f.bootstrap.version,proposal:value}});}
  if(query.get('resource')==='attempt'){
   if(state.holdAttempt)await new Promise(resolve=>state.heldAttempts.push(resolve));
   if(state.deniedReceipt)return json({ok:false,code:'SESSION_INVALID'},401);
   if(state.missing)return json({ok:false,code:'NOT_FOUND'},404);const r=receipts.get(query.get('key'));assert.ok(r);return json({ok:true,data:{...r,replayed:true}});
  }
  assert.fail(url);
 };
 const node=(host,name)=>host.querySelector('[data-'+prefix+'-'+name+']'),ready=host=>until(()=>!node(host,'refresh').disabled);
 async function open(){const host=new NativeLeavePanelElement('section'),control=mount(host,{contractId});controls.push(control);await ready(host);return host;}
 async function prepare(host){await node(host,'create').emit('click');node(host,'reference').value='Documento exclusivamente sintético';await node(host,'reference').emit('input');node(host,'reason').value='Motivo exclusivamente sintético';await node(host,'reason').emit('input');const field=host.querySelector('[data-'+prefix+'-field="'+(kind==='change'?'jobTitle':'date')+'"]');field.value=kind==='change'?'Cargo rectificado QA':'2026-10-01';await field.emit('input');}
 async function create(host){await prepare(host);node(host,'propose-checked').checked=true;await node(host,'propose-checked').emit('change');await node(host,'form').emit('submit');await ready(host);assert.equal(node(host,'pending').hidden,false);}
 t.after(()=>{try{for(const c of controls)c?.close();}finally{env.restore();}});
 return{state,calls,auth,controls,node,ready,open,prepare,create,api};
}

for(const kind of ['change','lifecycle']){
 test(kind+': renewed access to the same account preserves the draft but requires a new explicit review',async t=>{
  const f=fixture(t,kind),first=await f.open();await f.prepare(first);f.node(first,'propose-checked').checked=true;await f.node(first,'propose-checked').emit('change');f.controls[0].close();f.state.auth={...f.auth,user:{...f.auth.user,id:uid(3)}};const next=await f.open();
  assert.equal(f.node(next,'form').hidden,false);assert.equal(f.node(next,'propose-checked').checked,false);assert.equal(f.node(next,'reason').value,'Motivo exclusivamente sintético');assert.equal(f.calls.filter(c=>c.method==='POST').length,0);
 });
 test(kind+': another account withdraws the view before another subject read',async t=>{
  const f=fixture(t,kind),host=await f.open(),before=f.calls.filter(c=>c.url.startsWith(f.api)).length;f.state.auth={...f.auth,user:{...f.auth.user,id:uid(3),email:'another-employment@example.test'}};
  await f.node(host,'refresh').emit('click');await f.ready(host);assert.equal(f.calls.filter(c=>c.url.startsWith(f.api)).length,before);assert.equal(f.node(host,'content').hidden,true);assert.equal(f.node(host,'source').textContent,'');
 });
 test(kind+': renewed access recovers the original pending key without another POST',async t=>{
  const f=fixture(t,kind),first=await f.open();await f.create(first);const original=f.calls.find(c=>c.method==='POST');f.controls[0].close();f.state.auth={...f.auth,user:{...f.auth.user,id:uid(3)}};const next=await f.open();
  assert.equal(f.node(next,'pending').hidden,false);assert.equal(f.node(next,'create').hidden,true);assert.match(f.node(next,'attempt').textContent,new RegExp(original.key));
  await f.node(next,'recover').emit('click');await f.ready(next);assert.equal(f.node(next,'pending').hidden,true);assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
 });
 test(kind+': retry after an explicit missing-receipt check preserves the original bytes and key',async t=>{
  const f=fixture(t,kind),host=await f.open();await f.create(host);const original=f.calls.find(c=>c.method==='POST');f.state.missing=true;
  await f.node(host,'recover').emit('click');await f.ready(host);assert.equal(f.node(host,'retry').disabled,false);assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
  f.state.missing=false;f.state.lost=false;await f.node(host,'retry').emit('click');await f.ready(host);const posts=f.calls.filter(c=>c.method==='POST');assert.equal(posts.length,2);assert.equal(posts[1].body,original.body);assert.equal(posts[1].key,original.key);assert.equal(f.node(host,'pending').hidden,true);
 });
 test(kind+': a late old recovery cannot clear a newer pending attempt in another live mount',async t=>{
  const f=fixture(t,kind),first=await f.open();await f.create(first);const second=await f.open();f.state.holdAttempt=true;
  const a=f.node(first,'recover').emit('click'),b=f.node(second,'recover').emit('click');await until(()=>f.state.heldAttempts.length===2);f.state.holdAttempt=false;f.state.heldAttempts[0]();await a;await f.ready(first);await f.create(first);const next=f.calls.filter(c=>c.method==='POST').at(-1);
  f.state.heldAttempts[1]();await b;await f.ready(second);assert.equal(f.node(second,'pending').hidden,false);assert.match(f.node(second,'attempt').textContent,new RegExp(next.key));assert.equal(f.calls.filter(c=>c.method==='POST').length,2);
 });
 test(kind+': a superseded retry never posts after its held fresh context returns',async t=>{
  const f=fixture(t,kind),first=await f.open();await f.create(first);const second=await f.open();f.state.missing=true;await f.node(second,'recover').emit('click');await f.ready(second);assert.equal(f.node(second,'retry').disabled,false);
  f.state.holdFresh=true;const stale=f.node(second,'retry').emit('click');await until(()=>f.state.heldFresh.length===1);f.state.missing=false;await f.node(first,'recover').emit('click');await f.ready(first);await f.create(first);const next=f.calls.filter(c=>c.method==='POST').at(-1);
  f.state.heldFresh[0]();await stale;await f.ready(second);assert.equal(f.calls.filter(c=>c.method==='POST').length,2);assert.match(f.node(second,'attempt').textContent,new RegExp(next.key));
 });
 for(const stage of ['authority','fresh context','proposal detail'])test(kind+': receipt acceptance held at '+stage+' cannot erase a newer attempt',async t=>{
  const f=fixture(t,kind),first=await f.open();await f.create(first);const second=await f.open();
  if(stage==='authority')f.state.holdAuthAfter=2;else if(stage==='fresh context')f.state.holdFreshAfter=2;else f.state.holdDetail=true;
  const stale=f.node(first,'recover').emit('click');await until(()=>f.state.heldAccept.length===1);await f.node(second,'recover').emit('click');await f.ready(second);await f.create(second);const next=f.calls.filter(c=>c.method==='POST').at(-1);
  f.state.heldAccept[0]();await stale;await f.ready(first);assert.equal(f.node(first,'pending').hidden,false);assert.match(f.node(first,'attempt').textContent,new RegExp(next.key));assert.equal(f.calls.filter(c=>c.method==='POST').length,2);
 });
 for(const status of [404,401])test(kind+': a superseded '+status+' preserves the new attempt and still honors access withdrawal',async t=>{
  const f=fixture(t,kind),first=await f.open();await f.create(first);const second=await f.open();f.state.holdAttempt=true;
  const stale=f.node(first,'recover').emit('click');await until(()=>f.state.heldAttempts.length===1);f.state.holdAttempt=false;await f.node(second,'recover').emit('click');await f.ready(second);await f.create(second);const next=f.calls.filter(c=>c.method==='POST').at(-1);
  f.state.missing=status===404;f.state.deniedReceipt=status===401;f.state.heldAttempts[0]();await stale;await f.ready(first);
  if(status===404){assert.equal(f.node(first,'status').dataset.error,'false');assert.equal(f.node(first,'retry').disabled,true);assert.match(f.node(first,'attempt').textContent,new RegExp(next.key));}
  else{assert.equal(f.node(first,'content').hidden,true);assert.equal(f.node(first,'source').textContent,'');f.state.deniedReceipt=false;const reopened=await f.open();assert.match(f.node(reopened,'attempt').textContent,new RegExp(next.key));await f.node(reopened,'recover').emit('click');await f.ready(reopened);assert.equal(f.node(reopened,'pending').hidden,true);}
  assert.equal(f.calls.filter(c=>c.method==='POST').length,2);
 });
}
