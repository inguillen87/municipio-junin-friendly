import test from 'node:test';import assert from 'node:assert/strict';import {setImmediate as turn} from 'node:timers/promises';
import {mountNativeEmploymentLifecycle} from '../assets/native-employment-lifecycle.js';
import {lifecycleActivity} from '../assets/native-employment-lifecycle-model.js';
import {NativeLeavePanelElement,nativeLeavePanelEnvironment} from './fixtures/native-leave-panel-dom.js';
import {lifecycleHistoryFixture} from './fixtures/native-lifecycle-history-synthetic.js';
const until=async fn=>{const end=Date.now()+2000;while(Date.now()<end){if(fn())return;await turn();}assert.fail('Synthetic history panel did not settle');};
async function fixture(t,count=100){
 const env=nativeLeavePanelEnvironment(t),f=lifecycleHistoryFixture(count),host=new NativeLeavePanelElement('section'),calls=[],state={history:f.history,forbidden:false,hold:null,decisions:new Map()};env.document.dispatchEvent=event=>env.events.dispatch(event.type,event.detail);
 const auth={ok:true,authenticated:true,user:{email:'history-review@example.test',role:'JUNIN_RRHH_OPERADOR'},access:{tenant:{id:'10000000-0000-4000-8000-000000000001',roleKey:'JUNIN_RRHH_OPERADOR'},tenantCapabilities:['workforce.employee.read','employee.record.approve']}};
 globalThis.fetch=async(url,options={})=>{calls.push({url,method:options.method??'GET',body:options.body,key:options.headers?.['Idempotency-Key']});if(url==='/api/internal-auth')return Response.json(auth);assert.ok(url==='/api/internal-employment-lifecycle'||url.startsWith('/api/internal-employment-lifecycle?'));const q=new URL(url,'https://lifecycle.invalid').searchParams;
  if(state.forbidden)return Response.json({ok:false,code:'NATIVE_EMPLOYMENT_LIFECYCLE_FORBIDDEN'},{status:403});
  if(state.hold)await state.hold;
  if(options.method==='POST'){
   const body=JSON.parse(options.body);assert.equal(body.operation,'review');assert.match(options.headers['Idempotency-Key'],/^[a-f0-9-]{36}$/);const p=body.payload,row=f.history.proposals.find(r=>r.id===p.proposalId);assert.ok(row);assert.equal(row.status,'pending');assert.equal(p.scopeVersion,f.bootstrap.scopeVersion);
   const saved=f.detail(row.id);state.decisions.set(row.id,{decision:p.decision,reason:p.reason,reviewedAt:'2026-10-21T12:00:00Z',reviewerLabel:'PERSONA REVISORA EXCLUSIVAMENTE SINTÉTICA'});row.status=p.decision==='approve'?'approved':'rejected';row.canReview=false;
   if(p.decision==='approve'){const intervals=saved.proposal.after.intervals;Object.assign(f.bootstrap.employment,{version:'b'.repeat(64),revision:1,appliedAt:'2026-10-21T12:00:00Z',intervals,status:lifecycleActivity(intervals,f.bootstrap.employment.today)});}
   f.bootstrap.proposals=structuredClone(f.history.proposals.slice(0,20));return Response.json({ok:true,data:{version:f.bootstrap.version,operation:'review',contractId:f.bootstrap.subject.contractId,proposalId:row.id,status:row.status,employmentVersion:f.bootstrap.employment.version,revision:f.bootstrap.employment.revision,replayed:false,payrollModified:false}});
  }
  if(q.get('resource')==='bootstrap')return Response.json({ok:true,data:f.bootstrap});
  if(q.get('resource')==='history')return Response.json({ok:true,data:state.history});
  if(q.get('resource')==='proposal'){const value=f.detail(q.get('id'));if(state.decisions.has(value.proposal.id))value.proposal.review=state.decisions.get(value.proposal.id);return Response.json({ok:true,data:value});}assert.fail(url);
 };
 const control=mountNativeEmploymentLifecycle(host,{contractId:f.bootstrap.subject.contractId}),node=name=>host.querySelector('[data-nlc-'+name+']');
 t.after(()=>{try{control?.close();}finally{env.restore();}});await until(()=>node('refresh').disabled===false);
 return{...f,host,calls,state,control,node,ready:()=>until(()=>!node('refresh').disabled)};
}
test('reviewer discovers and opens the pending proposal beyond the twenty recent rows without a write',async t=>{
 const f=await fixture(t,100);assert.match(f.node('history-note').textContent,/100 propuestas/);assert.equal(f.host.querySelectorAll('[data-nlc-proposal]').length,20);
 const ids=[];for(let page=1;page<=5;page++){ids.push(...f.host.querySelectorAll('[data-nlc-proposal]').map(n=>n.dataset.nlcProposal));if(page<5)await f.node('history-next').emit('click');}
 assert.equal(ids.length,100);assert.equal(new Set(ids).size,100);assert.deepEqual(ids,f.history.proposals.map(p=>p.id));assert.equal(f.node('history-next').disabled,true);
 const oldest=f.history.proposals.at(-1);assert.ok(ids.includes(oldest.id));await f.host.querySelector('[data-nlc-proposal="'+oldest.id+'"]').emit('click');await f.ready();assert.equal(f.node('detail').hidden,false);assert.match(f.node('proposal-info').textContent,/Pendiente de revisión/);assert.equal(f.node('review-form').hidden,false);assert.ok(f.calls.every(c=>c.method==='GET'));
});
test('empty complete history has no phantom page or enabled navigation',async t=>{const f=await fixture(t,0);assert.match(f.node('history-note').textContent,/0 propuestas/);assert.equal(f.host.querySelectorAll('[data-nlc-proposal]').length,0);assert.equal(f.node('history-prev').disabled,true);assert.equal(f.node('history-next').disabled,true);});
test('twenty-one proposals expose exactly one older row and return to the recent page',async t=>{const f=await fixture(t,21);await f.node('history-next').emit('click');const rows=f.host.querySelectorAll('[data-nlc-proposal]');assert.equal(rows.length,1);assert.equal(rows[0].dataset.nlcProposal,f.history.proposals[20].id);assert.match(f.node('history-note').textContent,/21 a 21/);assert.equal(f.node('history-next').disabled,true);await f.node('history-prev').emit('click');assert.equal(f.host.querySelectorAll('[data-nlc-proposal]').length,20);assert.equal(f.node('history-prev').disabled,true);});
test('forbidden history removes every previously consulted row and its subject',async t=>{const f=await fixture(t);for(let page=1;page<5;page++)await f.node('history-next').emit('click');f.state.forbidden=true;await f.node('refresh').emit('click');await f.ready();assert.equal(f.node('history').hidden,true);assert.equal(f.host.querySelectorAll('[data-nlc-proposal]').length,0);assert.ok(!f.node('source').textContent.includes('5001'));assert.equal(f.node('history-next').disabled,true);});
test('incomplete history withdraws the listing rather than presenting recent rows as complete',async t=>{const f=await fixture(t);f.state.history={...f.history,complete:false};await f.node('refresh').emit('click');await f.ready();assert.equal(f.node('history').hidden,true);assert.equal(f.host.querySelectorAll('[data-nlc-proposal]').length,0);});
test('late complete history cannot repopulate a closed sheet',async t=>{const f=await fixture(t);let release;f.state.hold=new Promise(resolve=>release=resolve);const pending=f.node('refresh').emit('click');await until(()=>f.node('refresh').disabled);f.control.close();release();await pending;assert.equal(f.node('history').hidden,true);assert.equal(f.host.querySelectorAll('[data-nlc-proposal]').length,0);assert.ok(!f.node('source').textContent.includes('5001'));});
for(const decision of ['approve','reject'])test('old pending proposal follows the existing '+decision+' command and receipt checks',async t=>{
 const f=await fixture(t),oldest=f.history.proposals.at(-1);for(let page=1;page<5;page++)await f.node('history-next').emit('click');await f.host.querySelector('[data-nlc-proposal="'+oldest.id+'"]').emit('click');await f.ready();
 f.node('review-reason').value='Decisión administrativa exclusivamente sintética';f.node('review-checked').checked=true;await f.node('review-checked').emit('change');
 const submitter=f.host.querySelector('[data-nlc-decision="'+decision+'"]');assert.equal(submitter.disabled,false);assert.equal(submitter.dataset.nlcDecision,decision,'The synthetic DOM must reflect the static data attribute used by a real submit event');
 for(const listener of f.node('review-form').listeners.get('submit'))await listener({preventDefault(){},submitter});
 await until(()=>!f.node('refresh').disabled&&f.calls.some(c=>c.method==='POST'));
 assert.match(f.node('status').textContent,decision==='approve'?/Movimiento aprobado y aplicado/:/Propuesta rechazada/,'The final message must describe the verified decision after refreshing history');
 const posts=f.calls.filter(c=>c.method==='POST');assert.equal(posts.length,1);const body=JSON.parse(posts[0].body);assert.deepEqual(body,{operation:'review',payload:{contractId:f.bootstrap.subject.contractId,proposalId:oldest.id,scopeVersion:f.bootstrap.scopeVersion,decision,reason:'Decisión administrativa exclusivamente sintética'}});assert.equal(oldest.status,decision==='approve'?'approved':'rejected');assert.equal(f.history.proposals.length,100);assert.equal(f.bootstrap.proposals.length,20);
});
