import test from 'node:test';
import assert from 'node:assert/strict';
import {loadOwnAnnulReview,ownAnnulReviewRows} from '../assets/own-payroll-annulment-review-model.js';
import {annulReviewScenario} from './fixtures/own-payroll-annulment-review-synthetic.js';
import {setTimeout as delay} from 'node:timers/promises';
import {mountOwnPayrollAnnulment} from '../assets/own-payroll-annulment-panel.js';
import {OWN_ANNUL_ACCESS} from '../assets/own-payroll-annulment-model.js';
import {uid} from './fixtures/own-payroll-program-synthetic.js';
import {PayrollPanelElement as Element,payrollPanelEvents as events} from './fixtures/payroll-panel-dom.js';
test('hiding an entire active run cannot leave a partial review eligible for all',async()=>{
 const s=annulReviewScenario(),read=async id=>structuredClone(s.details.find(r=>r.id===id));
 const complete=await loadOwnAnnulReview(s.index,read);assert.equal(ownAnnulReviewRows(complete).length,9);
 const legacyState=s.index.stateVersion,hidden=s.index.index.find(r=>r.states.confirmed>0);
 hidden.states.calculated+=hidden.states.confirmed;hidden.states.confirmed=0;hidden.confirmedContractIds=[];
 assert.equal(s.index.stateVersion,legacyState);
 await assert.rejects(loadOwnAnnulReview(s.index,read));
});

// Proposed functional regression: real208 panel, existing minimal DOM and
// synthetic HTTP. No browser layout, SQL or municipal authority is simulated.
function singleReviewPanelHarness(t){
 const s=annulReviewScenario(),host=new Element(),docEvents=events(),winEvents=events(),requests=[],timers=new Map();let timer=0;
 const names=['document','window','fetch','setTimeout','clearTimeout','setInterval','clearInterval'],before=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 const state={authFailure:null,caps:[...OWN_ANNUL_ACCESS],postFailure:true};
 const document={...docEvents,hidden:false,head:new Element('head'),createElement:tag=>new Element(tag),querySelectorAll:()=>[],getElementById:()=>null};
 Object.assign(globalThis,{document,window:winEvents,setTimeout:fn=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id),setInterval:fn=>{timers.set(++timer,fn);return timer;},clearInterval:id=>timers.delete(id)});
 const auth=()=>({ok:true,authenticated:true,sessionVersion:2,user:{id:'single-review-synthetic-checker',email:'single-review@example.invalid'},access:{context:'tenant',tenant:{id:uid(700),roleKey:'single-review-synthetic-role'},tenantCapabilities:state.caps},expiresAt:'2099-01-01T00:00:00Z'});
 const accountKey=JSON.stringify(['single-review-synthetic-checker','single-review@example.invalid',uid(700),'single-review-synthetic-role']);
 const reference=runIndex=>{const run=s.details[runIndex],row=run.employees.find(employee=>employee.state==='confirmed');return{period:s.index.period,liquidationType:s.index.liquidationType,runId:run.id,resultSha256:run.capture.saved.resultSha256,contractId:row.contractId,version:row.version,liquidationVersion:row.liquidationVersion,accessKey:accountKey};};
 globalThis.fetch=async(url,options={})=>{
  const method=options.method??'GET';requests.push({url,method,body:options.body??null,key:options.headers?.['Idempotency-Key']??null});let status=200,payload;
  if(url==='/api/internal-auth'){
   if(state.authFailure==='AbortError')throw Object.assign(Error('Synthetic first-session abort'),{name:'AbortError'});
   if(state.authFailure){status=state.authFailure;payload={ok:false,code:'SYNTHETIC_SESSION_REJECTED'};}else payload=auth();
  }else if(method==='POST'){
   assert.equal(url,'/api/internal-own-payroll-annulment');assert.equal(state.postFailure,true,'Only an uncertain synthetic command is admitted by this harness');status=503;payload={ok:false,code:'OWN_LIQ_UNAVAILABLE',error:'Synthetic uncertain208 acknowledgement'};
  }else{
   const query=new URL(url,'https://synthetic.example.invalid').searchParams;
   if(url.startsWith('/api/internal-own-payroll-annulment?')&&query.get('resource')==='review'){
    assert.equal(query.get('period'),s.index.period);assert.equal(query.get('liquidationType'),s.index.liquidationType);payload={ok:true,data:structuredClone(s.index)};
   }else if(url.startsWith('/api/internal-own-payroll-liquidation?')&&query.get('resource')==='detail'){
    const detail=s.details.find(row=>row.id===query.get('id'));assert.ok(detail,'Only actual synthetic active captures may be read');payload={ok:true,data:structuredClone(detail)};
   }else assert.fail('Unexpected synthetic HTTP '+url);
  }
  return new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json'}});
 };
 const mounted=mountOwnPayrollAnnulment(host),q=key=>{const found=host.querySelector('[data-annul-'+key+']');assert.ok(found,'Actual208 control '+key);return found;};
 const settled=async()=>{const deadline=Date.now()+5000;while(host.getAttribute('aria-busy')==='true'&&Date.now()<deadline)await delay(1);assert.equal(host.getAttribute('aria-busy'),'false','Actual208 panel settles');};
 const activate=async()=>{docEvents.dispatch('taskchange',{id:'anulacion'});await settled();};
 const act=async(key,event)=>{await q(key).emit(event);await settled();};
 t.after(()=>{winEvents.dispatch('pagehide');for(const[name,descriptor]of before)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];});
 return{state,requests,q,reference,activate,act,queueReview:mounted.queueReview};
}
const reviewReads=h=>h.requests.filter(row=>row.url.startsWith('/api/internal-own-payroll-annulment?resource=review&'));
const decisionPosts=h=>h.requests.filter(row=>row.method==='POST');
const assertNoQueuedSelection=h=>{assert.equal(h.q('kind').value,'');assert.deepEqual(h.q('values').selectedOptions.map(option=>option.value),[]);assert.equal(h.q('reason').value,'');assert.equal(h.q('confirm').checked,false);assert.equal(h.q('send').disabled,true);};
const assertSelectedB=(h,reference)=>{assert.equal(h.q('kind').value,'contracts');assert.deepEqual(h.q('values').selectedOptions.map(option=>option.value),[reference.contractId]);assert.equal(h.q('reason').value,'');assert.equal(h.q('confirm').checked,false);assert.equal(h.q('send').disabled,true);assert.match(h.q('scope').textContent,/1 legajos/);assert.equal(decisionPosts(h).length,0);};

for(const failure of[401,403,'AbortError'])test('first-session '+failure+' consumes queuedA; plain reactivation cannot selectA or read its review',async t=>{
 const h=singleReviewPanelHarness(t),a=h.reference(0),b=h.reference(1);h.state.authFailure=failure;assert.equal(h.queueReview(a),true);await h.activate();assertNoQueuedSelection(h);assert.equal(h.requests.length,1);assert.equal(h.requests[0].url,'/api/internal-auth');assert.equal(reviewReads(h).length,0);assert.equal(decisionPosts(h).length,0);
 h.state.authFailure=null;await h.activate();assertNoQueuedSelection(h);assert.equal(reviewReads(h).length,0);assert.equal(decisionPosts(h).length,0);
 assert.equal(h.queueReview(b),true);await h.activate();assertSelectedB(h,b);assert.notEqual(a.contractId,b.contractId);assert.equal(reviewReads(h).length,2);assert.equal(h.requests.some(row=>row.url.includes('resource=attempt')),false);
});

for(const failure of[401,403,'AbortError'])test('first-session '+failure+' does not leave queuedA blocking an immediately queuedB',async t=>{
 const h=singleReviewPanelHarness(t),a=h.reference(0),b=h.reference(1);h.state.authFailure=failure;assert.equal(h.queueReview(a),true);await h.activate();assertNoQueuedSelection(h);assert.equal(reviewReads(h).length,0);assert.equal(decisionPosts(h).length,0);
 h.state.authFailure=null;assert.equal(h.queueReview(b),true);await h.activate();assertSelectedB(h,b);assert.notEqual(a.contractId,b.contractId);assert.equal(reviewReads(h).length,2);
});

test('consuming a local reference does not clear or replace a valid uncertain208 command',async t=>{
 const h=singleReviewPanelHarness(t),b=h.reference(1);assert.equal(h.queueReview(b),true);await h.activate();h.q('reason').value='Synthetic explicit single-contract annulment review';h.q('confirm').checked=true;await h.act('confirm','change');await h.act('form','submit');const original=structuredClone(decisionPosts(h)[0]);assert.ok(original?.key);assert.deepEqual(JSON.parse(original.body).payload.selection,{kind:'contracts',values:[b.contractId]});assert.equal(h.queueReview(h.reference(0)),false);
 h.state.authFailure=401;await h.activate();assert.equal(h.q('fields').disabled,true);assert.equal(decisionPosts(h).length,1);h.state.authFailure=null;await h.activate();assert.equal(h.queueReview(h.reference(0)),false);await h.act('form','submit');const sends=decisionPosts(h);assert.equal(sends.length,2);assert.equal(sends[1].key,original.key);assert.equal(sends[1].body,original.body);
});
