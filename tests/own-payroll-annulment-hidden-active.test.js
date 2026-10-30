import test from 'node:test';
import assert from 'node:assert/strict';
import {loadOwnAnnulReview,ownAnnulReviewRows} from '../assets/own-payroll-annulment-review-model.js';
import {annulReviewScenario,annulReviewReceipt,annulReviewIndexFor} from './fixtures/own-payroll-annulment-review-synthetic.js';
import {afterAnnul} from './fixtures/own-payroll-annulment-synthetic.js';
import fs from 'node:fs';import {createHash} from 'node:crypto';
import {OWN_ANNULMENT_READONLY_REVIEW_SOURCE_PIN,OWN_ANNULMENT_READONLY_REVIEW_TEST_SOURCE_PIN,projectOwnAnnulmentReadonlyReviewRawSourceToParent,projectOwnPayrollLoginRawSourceToParent} from './fixtures/own-payroll-login-source-projection.js';
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
function singleReviewPanelHarness(t,{count=9,recoverCommitted=false}={}){
 const s=annulReviewScenario({count}),host=new Element(),docEvents=events(),winEvents=events(),requests=[],timers=new Map();let timer=0;
 const names=['document','window','fetch','setTimeout','clearTimeout','setInterval','clearInterval','location'],before=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 const state={authFailure:null,caps:[...OWN_ANNUL_ACCESS],postFailure:true,committed:null,after:null};
 const document={...docEvents,hidden:false,head:new Element('head'),createElement:tag=>new Element(tag),querySelectorAll:()=>[],getElementById:()=>null};
 Object.assign(globalThis,{document,window:winEvents,location:{origin:'https://synthetic.example.invalid'},setTimeout:fn=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id),setInterval:fn=>{timers.set(++timer,fn);return timer;},clearInterval:id=>timers.delete(id)});
 const auth=()=>({ok:true,authenticated:true,sessionVersion:2,user:{id:'single-review-synthetic-checker',email:'single-review@example.invalid'},access:{context:'tenant',tenant:{id:uid(700),roleKey:'single-review-synthetic-role'},tenantCapabilities:state.caps},expiresAt:'2099-01-01T00:00:00Z'});
 const accountKey=JSON.stringify(['single-review-synthetic-checker','single-review@example.invalid',uid(700),'single-review-synthetic-role']);
 const reference=runIndex=>{const run=s.details[runIndex],row=run.employees.find(employee=>employee.state==='confirmed');return{period:s.index.period,liquidationType:s.index.liquidationType,runId:run.id,resultSha256:run.capture.saved.resultSha256,contractId:row.contractId,version:row.version,liquidationVersion:row.liquidationVersion,accessKey:accountKey};};
 globalThis.fetch=async(url,options={})=>{
  const method=options.method??'GET';requests.push({url,method,body:options.body??null,key:options.headers?.['Idempotency-Key']??null});let status=200,payload;
  if(url==='/api/internal-auth'){
   if(state.authFailure==='AbortError')throw Object.assign(Error('Synthetic first-session abort'),{name:'AbortError'});
   if(state.authFailure){status=state.authFailure;payload={ok:false,code:'SYNTHETIC_SESSION_REJECTED'};}else payload=auth();
  }else if(method==='POST'){
   assert.equal(url,'/api/internal-own-payroll-annulment');assert.equal(state.postFailure,true,'Only an uncertain synthetic command is admitted by this harness');if(recoverCommitted){assert.equal(state.committed,null,'the fixture admits one synthetic committed command only');const body=JSON.parse(options.body).payload;state.committed=annulReviewReceipt(s.legacy,body,options.headers['Idempotency-Key']);const after=afterAnnul(s.legacy,state.committed);state.after={index:annulReviewIndexFor(after.runs),details:after.runs};}status=503;payload={ok:false,code:'OWN_LIQ_UNAVAILABLE',error:'Synthetic uncertain208 acknowledgement'};
  }else{
   const query=new URL(url,'https://synthetic.example.invalid').searchParams;
   if(url.startsWith('/api/internal-own-payroll-annulment?')&&query.get('resource')==='attempt'&&recoverCommitted){assert.ok(state.committed);assert.equal(query.get('key'),state.committed.key);payload={ok:true,data:{...structuredClone(state.committed),replayed:true}};}else if(url.startsWith('/api/internal-own-payroll-annulment?')&&query.get('resource')==='review'){
    assert.equal(query.get('period'),s.index.period);assert.equal(query.get('liquidationType'),s.index.liquidationType);payload={ok:true,data:structuredClone(state.after?.index??s.index)};
   }else if(url.startsWith('/api/internal-own-payroll-liquidation?')&&query.get('resource')==='detail'){
    const detail=(state.after?.details??s.details).find(row=>row.id===query.get('id'));assert.ok(detail,'Only actual synthetic active captures may be read');payload={ok:true,data:structuredClone(detail)};
   }else assert.fail('Unexpected synthetic HTTP '+url);
  }
  return new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json'}});
 };
 const mounted=mountOwnPayrollAnnulment(host),q=key=>{const found=host.querySelector('[data-annul-'+key+']');assert.ok(found,'Actual208 control '+key);return found;};
 const settled=async()=>{const deadline=Date.now()+5000;while(host.getAttribute('aria-busy')==='true'&&Date.now()<deadline)await delay(1);assert.equal(host.getAttribute('aria-busy'),'false','Actual208 panel settles');};
 const activate=async()=>{docEvents.dispatch('taskchange',{id:'anulacion'});await settled();};
 const act=async(key,event)=>{await q(key).emit(event);await settled();};
 t.after(()=>{winEvents.dispatch('pagehide');for(const[name,descriptor]of before)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];});
 return{state,requests,q,reference,activate,act,settled,scenario:s,host,queueReview:mounted.queueReview};
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

const effectivelyLocked=element=>{for(let n=element;n;n=n.parentElement)if(n.disabled)return true;return false;};
test('unknown command remains locked; authoritative same-key recovery permits every outcome page while both decision zones stay locked',async t=>{
 const h=singleReviewPanelHarness(t,{count:29,recoverCommitted:true});await h.activate();h.q('period').value=h.scenario.index.period;h.q('type').value=h.scenario.index.liquidationType;await h.act('query','submit');h.q('kind').value='all';await h.act('kind','change');
 assert.equal(h.q('rows').querySelectorAll('tr').length,25);assert.equal(h.q('page').textContent,'1 / 2');h.q('reason').value=h.scenario.receipt.body.reason;h.q('confirm').checked=true;await h.act('confirm','change');await h.act('form','submit');
 const original=structuredClone(decisionPosts(h)[0]);assert.ok(original.key);assert.equal(decisionPosts(h).length,1);assert.equal(h.q('recover').hidden,false);
 for(const control of ['kind','reason','confirm','search','prev','next'])assert.equal(effectivelyLocked(h.q(control)),true,'unknown attempt locks '+control);
 await h.act('next','click');assert.equal(h.q('page').textContent,'1 / 2','a disabled ancestor prevents navigation while the committed result is unknown');assert.equal(decisionPosts(h).length,1);
 const recovery=h.q('recover').emit('click');assert.equal(h.host.getAttribute('aria-busy'),'true');assert.equal(effectivelyLocked(h.q('next')),true,'busy authoritative read remains locked');await recovery;await h.settled();
 assert.match(h.q('status').textContent,/Anulación registrada: 29 legajos/);assert.equal(h.q('send').hidden,true);assert.equal(h.q('new').hidden,false);assert.equal(h.q('fields').disabled,true);assert.equal(h.q('confirmation-fields').disabled,true);assert.equal(h.q('review-fields').disabled,false);
 for(const control of ['kind','reason','confirm'])assert.equal(effectivelyLocked(h.q(control)),true,'registered decision keeps '+control+' locked');
 assert.equal(h.q('page').textContent,'1 / 2');const numbers=()=>h.q('rows').querySelectorAll('tr').map(row=>row.children[0].textContent),first=numbers();assert.equal(first.length,25);await h.act('next','click');const last=numbers();assert.equal(last.length,4);assert.equal(new Set([...first,...last]).size,29);assert.equal(h.q('page').textContent,'2 / 2');await h.act('prev','click');assert.deepEqual(numbers(),first);
 const totals=h.q('totals').textContent,scope=h.q('scope').textContent;h.q('search').value='sin-coincidencias-sinteticas';await h.act('search','input');assert.match(h.q('range').textContent,/^0 legajos.*29 afectados/);assert.equal(h.q('totals').textContent,totals);assert.equal(h.q('scope').textContent,scope);h.q('search').value='';await h.act('search','input');assert.equal(numbers().length,25);
 assert.deepEqual(decisionPosts(h),[original],'read-only navigation never resends or alters body/key');assert.equal(h.requests.filter(row=>row.url.includes('resource=attempt&key='+encodeURIComponent(original.key))).length,1);
 h.state.authFailure=403;await h.activate();assert.equal(h.q('detail').hidden,true);assert.equal(h.q('rows').querySelectorAll('tr').length,0);assert.equal(h.q('review-fields').disabled,true);h.state.authFailure=null;await h.activate();assert.equal(h.q('detail').hidden,true,'session restoration alone cannot restore old outcome data');assert.deepEqual(decisionPosts(h),[original]);
});
test('one finite product-source inverse retains all previous source contracts without weakening their pins',()=>{
 for(const pin of [OWN_ANNULMENT_READONLY_REVIEW_SOURCE_PIN,OWN_ANNULMENT_READONLY_REVIEW_TEST_SOURCE_PIN]){
 const current=fs.readFileSync(new URL('../'+pin.path,import.meta.url)),parent=projectOwnAnnulmentReadonlyReviewRawSourceToParent(pin.path,current),hash=b=>createHash('sha256').update(b).digest('hex');
 const expected=pin.path.startsWith('assets/')?'f7d3c250d654fe17e6ca921ec0e3667bcb46ea7fc4f6203fc60ee2506b8ffbe5':'5eca53c5584d441ae3d74a119170bf757fe92bb2154866e181aceb0feb0e7542';assert.equal(hash(parent),expected);assert.equal(parent.length,pin.beforeBytes);assert.deepEqual(projectOwnPayrollLoginRawSourceToParent(pin.path,current),parent);
 const changed=Buffer.from(current);changed[0]^=1;assert.throws(()=>projectOwnPayrollLoginRawSourceToParent(pin.path,changed),/ANNUL_READONLY_CURRENT_SHA/);assert.throws(()=>projectOwnPayrollLoginRawSourceToParent(pin.path,Buffer.concat([current,Buffer.from('\n')])),/ANNUL_READONLY_CURRENT_BYTES/);assert.throws(()=>projectOwnPayrollLoginRawSourceToParent(pin.path,parent),/ANNUL_READONLY_CURRENT_/);
 }
 const other=Buffer.from('unrelated source');assert.strictEqual(projectOwnAnnulmentReadonlyReviewRawSourceToParent('unrelated',other),other);
});
