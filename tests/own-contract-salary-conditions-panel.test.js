import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as turn} from 'node:timers/promises';
import {mountOwnContractSalaryConditions} from '../assets/own-contract-salary-conditions-panel.js';
import {SALARY_CONDITIONS_READ,SALARY_CONDITIONS_VERSION,salaryConditionsHash} from '../assets/own-contract-salary-conditions-model.js';
import {syntheticConditionsBootstrap,conditionsId,conditionsReason} from './fixtures/own-contract-salary-conditions-synthetic.js';
import {NativeLeavePanelElement,nativeLeavePanelEnvironment} from './fixtures/native-leave-panel-dom.js';

// Actual component with memory-only DOM and synthetic HTTP. No server, SQL,
// municipal decision, physical browser or real authentication is exercised.
async function harness(t){
 const env=nativeLeavePanelEnvironment(t),container=new NativeLeavePanelElement(),boot=syntheticConditionsBootstrap(31);
 const timerNames=['setInterval','clearInterval','setTimeout','clearTimeout'];
 const timers=Object.fromEntries(timerNames.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const originalCrypto=Object.getOwnPropertyDescriptor(globalThis,'crypto'),nativeCrypto=globalThis.crypto;
 const auth={ok:true,authenticated:true,sessionVersion:2,user:{id:conditionsId(100),email:'conditions@example.test'},access:{context:'tenant',tenant:{id:conditionsId(101),roleKey:'QA'},tenantCapabilities:[...SALARY_CONDITIONS_READ,'payroll.parameter.prepare','payroll.parameter.approve']},expiresAt:new Date(Date.now()+3600000).toISOString()};
 const state={auth,posts:[],calls:[],saved:null,notFound:false,lookupFailure:null,loseAck:true,afterLookup:null,afterPost:null,gateDigest:null,interval:null};
 t.after(()=>{try{env.win.dispatch('pagehide');}finally{for(const k of timerNames)Object.defineProperty(globalThis,k,timers[k]);Object.defineProperty(globalThis,'crypto',originalCrypto);env.restore();}});
 Object.assign(globalThis,{setInterval:fn=>{state.interval=fn;return 1;},clearInterval(){},setTimeout:()=>1,clearTimeout(){}});
 Object.defineProperty(globalThis,'crypto',{configurable:true,value:{randomUUID:()=>nativeCrypto.randomUUID(),subtle:{digest:async(...args)=>{const value=await nativeCrypto.subtle.digest(...args);const gate=state.gateDigest;state.gateDigest=null;if(gate)await gate();return value;}}}});
 env.document.head=new NativeLeavePanelElement('head');env.document.querySelector=()=>null;
 globalThis.fetch=async(url,options={})=>{
  state.calls.push({url,method:options.method??'GET'});let status=200,payload;
  if(url==='/api/internal-auth')payload=structuredClone(state.auth);
  else if(url.includes('resource=bootstrap'))payload={ok:true,data:structuredClone(boot)};
  else if(url.includes('resource=attempt')){
   assert.equal(new URL(url,'https://synthetic.invalid').searchParams.get('key'),state.posts[0].key);
   if(state.lookupFailure){status=state.lookupFailure;payload={ok:false,code:'SALARY_CONDITIONS_FORBIDDEN',error:'Alcance sintético distinto'};}
   else if(state.notFound){status=404;payload={ok:false,code:'SALARY_CONDITIONS_NOT_FOUND',error:'Intento sintético ausente'};}
   else payload={ok:true,data:{...structuredClone(state.saved),replayed:true}};
   await state.afterLookup?.();
  }else{
   assert.equal(options.method,'POST');const body=JSON.parse(options.body).payload;
   assert.equal(body.command,'propose');state.posts.push({body:options.body,key:options.headers['Idempotency-Key']});
   state.saved={version:SALARY_CONDITIONS_VERSION,eventId:conditionsId(500),proposalId:conditionsId(500),requestKey:options.headers['Idempotency-Key'],requestSha256:await salaryConditionsHash(body),body,status:'pending',revision:0,configurationVersion:body.baseVersion,replayed:false,payrollCalculated:false,payrollPosted:false};
   await state.afterPost?.();if(state.loseAck){state.loseAck=false;throw Error('Respuesta sintética perdida');}
   payload={ok:true,data:structuredClone(state.saved)};
  }
  return new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json'}});
 };
 mountOwnContractSalaryConditions(container);const host=container.children[0];
 const q=k=>{const e=host.querySelector('[data-conditions-'+k+']');assert.ok(e,k);return e;};
 const idle=async()=>{for(let i=0;i<1000&&host.getAttribute('aria-busy')!=='false';i++)await turn();assert.equal(host.getAttribute('aria-busy'),'false',q('status').textContent);};
 const hidden=()=>{env.document.hidden=true;env.events.dispatch('visibilitychange');};
 env.events.dispatch('taskchange',{id:'condiciones'});await idle();
 q('period').value=boot.period;await q('refresh').emit('click');
 assert.equal(q('content').hidden,false);q('common-date').value='2026-10-01';q('common-reference').value='Constancia exclusivamente sintética';await q('evidence').emit('click');
 q('reason').value=conditionsReason;await q('prepare').emit('click');q('confirm').checked=true;await q('confirm').emit('change');
 assert.equal(q('send').disabled,false,q('status').textContent);
 return{state,q,env,host,idle,hidden,renew:()=>{state.auth.user.id=conditionsId(Number.parseInt(state.auth.user.id.slice(-12),16)+1);},lookupCount:()=>state.calls.filter(c=>c.url.includes('resource=attempt')).length,send:()=>q('send').emit('click'),recover:()=>q('recover').emit('click')};
}

test('same-account session renewal recovers all31 proposed contracts under the original key without a second POST',async t=>{
 const h=await harness(t);await h.send();const post=structuredClone(h.state.posts[0]);h.renew();
 await h.recover();assert.equal(h.lookupCount(),1);assert.equal(h.state.posts.length,1);assert.deepEqual(h.state.posts[0],post);
 assert.equal(JSON.parse(post.body).payload.items.length,31);assert.equal(h.q('receipt').hidden,false);assert.equal(h.q('new').hidden,false);
 assert.equal(h.q('content').hidden,true);assert.equal(h.q('rows').children.length,0,'Renewal retires the old session view');
});

test('a fresh404 after renewal permits only the original31-row wire and key to be retried',async t=>{
 const h=await harness(t);await h.send();const post=structuredClone(h.state.posts[0]);h.renew();h.state.notFound=true;
 await h.recover();assert.equal(h.lookupCount(),1);assert.equal(h.q('retry').hidden,false);assert.equal(h.q('retry').disabled,false);
 h.state.notFound=false;await h.q('retry').emit('click');assert.equal(h.state.posts.length,2);assert.deepEqual(h.state.posts[1],post);assert.equal(h.q('receipt').hidden,false);
});

test('renewal between an earlier404 and retry requires another lookup before any retransmission',async t=>{
 const h=await harness(t);await h.send();h.state.notFound=true;await h.recover();assert.equal(h.q('retry').disabled,false);
 h.renew();await h.q('retry').emit('click');assert.equal(h.state.posts.length,1);assert.equal(h.q('retry').hidden,true);
 await h.recover();assert.equal(h.lookupCount(),2);h.state.notFound=false;await h.q('retry').emit('click');
 assert.equal(h.state.posts.length,2);assert.deepEqual(h.state.posts[1],h.state.posts[0]);
});

for(const [label,change]of[
 ['account',a=>a.user.email='other@example.test'],['municipality',a=>a.access.tenant.id=conditionsId(999)],['role',a=>a.access.tenant.roleKey='OTHER'],
])test('another '+label+' cannot look up or resend the pending conditions and returning to the original account can recover',async t=>{
 const h=await harness(t);await h.send();const original=structuredClone(h.state.auth),post=structuredClone(h.state.posts[0]);
 change(h.state.auth);await h.recover();assert.equal(h.lookupCount(),0);assert.equal(h.state.posts.length,1);assert.equal(h.q('receipt').hidden,true);
 h.state.auth=original;h.renew();await h.q('access').emit('click');await h.recover();
 assert.equal(h.lookupCount(),1);assert.equal(h.q('receipt').hidden,false);assert.equal(h.state.posts.length,1);assert.deepEqual(h.state.posts[0],post);
});

test('renewal during a successful lookup retires that result and requires a lookup under the new session',async t=>{
 const h=await harness(t);await h.send();h.state.afterLookup=()=>{h.state.afterLookup=null;h.renew();};
 await h.recover();assert.equal(h.lookupCount(),1);assert.equal(h.q('receipt').hidden,true);assert.equal(h.q('new').hidden,true);
 h.state.lookupFailure=403;await h.recover();assert.equal(h.lookupCount(),2);assert.equal(h.q('receipt').hidden,true);assert.equal(h.state.posts.length,1);
 h.state.lookupFailure=null;await h.q('access').emit('click');await h.recover();assert.equal(h.lookupCount(),3);assert.equal(h.q('receipt').hidden,false);
});

test('renewal during a404 lookup does not enable retry until a new-session404 is verified',async t=>{
 const h=await harness(t);await h.send();h.state.notFound=true;h.state.afterLookup=()=>{h.state.afterLookup=null;h.renew();};
 await h.recover();assert.equal(h.q('retry').hidden,true);assert.equal(h.state.posts.length,1);
 await h.recover();assert.equal(h.lookupCount(),2);assert.equal(h.q('retry').hidden,false);assert.equal(h.q('retry').disabled,false);
});

test('renewal after POST does not publish its old-session acknowledgement or repeat the business command',async t=>{
 const h=await harness(t);h.state.loseAck=false;h.state.afterPost=()=>{h.state.afterPost=null;h.renew();};
 await h.send();assert.equal(h.state.posts.length,1);assert.equal(h.q('receipt').hidden,true);assert.equal(h.q('new').hidden,true);
 await h.recover();assert.equal(h.lookupCount(),1);assert.equal(h.state.posts.length,1);assert.equal(h.q('receipt').hidden,false);
});

test('hiding during the final receipt hash prevents a late acknowledgement from republishing the cleared view',async t=>{
 const h=await harness(t);await h.send();let hashes=0;
 h.state.afterLookup=()=>{h.state.afterLookup=null;h.state.gateDigest=()=>{hashes++;h.state.gateDigest=()=>{hashes++;h.hidden();};};};
 await h.recover();assert.equal(hashes,2);assert.equal(h.q('receipt').hidden,true);assert.equal(h.q('receipt').textContent,'');assert.equal(h.q('new').hidden,true);assert.equal(h.q('rows').children.length,0);
});

test('hiding a pending proposal and renewing does not lose its key or automatically send another command',async t=>{
 const h=await harness(t);await h.send();const post=structuredClone(h.state.posts[0]);h.hidden();h.renew();
 h.env.document.hidden=false;h.env.events.dispatch('visibilitychange');await h.q('access').emit('click');await h.recover();
 assert.equal(h.lookupCount(),1);assert.equal(h.state.posts.length,1);assert.deepEqual(h.state.posts[0],post);assert.equal(h.q('receipt').hidden,false);
});

test('an ordinary same-session proposal still confirms the complete set in one POST without recovery',async t=>{
 const h=await harness(t);h.state.loseAck=false;await h.send();
 assert.equal(h.state.posts.length,1);assert.equal(h.lookupCount(),0);assert.equal(h.q('receipt').hidden,false);assert.equal(h.q('new').hidden,false);
 assert.equal(JSON.parse(h.state.posts[0].body).payload.items.length,31);
});

test('the existing access poll retires a renewed live view without automatically querying or resending its pending proposal',async t=>{
 const h=await harness(t);await h.send();h.renew();h.state.interval();await h.idle();
 assert.equal(h.q('content').hidden,true);assert.equal(h.q('rows').children.length,0);assert.equal(h.lookupCount(),0);assert.equal(h.state.posts.length,1);assert.equal(h.q('recover').disabled,false);
 await h.recover();assert.equal(h.lookupCount(),1);assert.equal(h.q('receipt').hidden,false);assert.equal(h.state.posts.length,1);
});

test('a session renewal before any send still retires the prepared view rather than authorizing it silently',async t=>{
 const h=await harness(t);h.renew();h.state.interval();await h.idle();
 assert.equal(h.q('content').hidden,true);assert.equal(h.q('rows').children.length,0);assert.equal(h.q('send').hidden,true);assert.equal(h.state.posts.length,0);assert.equal(h.lookupCount(),0);
});
