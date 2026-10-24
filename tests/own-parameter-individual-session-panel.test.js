import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as turn} from 'node:timers/promises';
import {mountOwnSalarySeniority} from '../assets/own-salary-seniority-panel.js';
import {mountOwnContractWorkingTime} from '../assets/own-contract-working-time-panel.js';
import {mountOwnPeriodArtDays} from '../assets/own-art-days-panel.js';
import {mountOwnPeriodFiscalFacts} from '../assets/own-fiscal-facts-panel.js';
import {mountOwnPeriodParticipation} from '../assets/own-period-participation-panel.js';
import {SENIORITY_READ,SENIORITY_VERSION,seniorityHash} from '../assets/own-salary-seniority-model.js';
import {WORKING_TIME_READ,WORKING_TIME_VERSION,workingTimeHash} from '../assets/own-contract-working-time-model.js';
import {ART_DAYS_READ,ART_DAYS_VERSION,artDaysHash} from '../assets/own-art-days-model.js';
import {FISCAL_FACTS_READ,FISCAL_FACTS_VERSION,fiscalFactsHash} from '../assets/own-fiscal-facts-model.js';
import {PARTICIPATION_READ,PARTICIPATION_VERSION,participationHash} from '../assets/own-period-participation-model.js';
import {syntheticSeniorityBootstrap,syntheticSeniorityDefinition} from './fixtures/own-salary-seniority-synthetic.js';
import {syntheticWorkingTimeBootstrap,syntheticWorkingTimeDefinition} from './fixtures/own-contract-working-time-synthetic.js';
import {syntheticArtDaysBootstrap,syntheticArtDaysDefinition} from './fixtures/own-art-days-synthetic.js';
import {syntheticFiscalFactsBootstrap,syntheticFiscalFactsDefinition} from './fixtures/own-fiscal-facts-synthetic.js';
import {syntheticParticipationBootstrap,syntheticParticipationDefinition} from './fixtures/own-period-participation-synthetic.js';
import {OWN_PAYROLL_READINESS_FILTERS,OWN_PAYROLL_READINESS_ROSTER_URL} from '../assets/own-payroll-readiness-model.js';
import {ParameterPanelElement,parameterPanelEnvironment} from './fixtures/parameter-recovery-panel-dom.js';

// Real individual panels, real own-roster picker, synthetic HTTP and memory DOM.
// The collective journey panel is mounted but no collective decision is run.
const id=n=>'bbbbbbbb-0000-4000-8000-'+String(n).padStart(12,'0');
const cases=[
 {name:'seniority',task:'antiguedad',prefix:'seniority',mount:mountOwnSalarySeniority,boot:syntheticSeniorityBootstrap,definition:syntheticSeniorityDefinition,read:SENIORITY_READ,version:SENIORITY_VERSION,hash:seniorityHash,missing:'SENIORITY_NOT_FOUND',fields:d=>({years:d.years,months:d.months??''})},
 {name:'contract hours',task:'jornada',prefix:'working-time',mount:mountOwnContractWorkingTime,boot:syntheticWorkingTimeBootstrap,definition:syntheticWorkingTimeDefinition,read:WORKING_TIME_READ,version:WORKING_TIME_VERSION,hash:workingTimeHash,missing:'WORKING_TIME_NOT_FOUND',fields:d=>({dailyHours:d.dailyHours,monthlyHours:d.monthlyHours??''})},
 {name:'ART days',task:'dias-art',prefix:'art-days',mount:mountOwnPeriodArtDays,boot:syntheticArtDaysBootstrap,definition:syntheticArtDaysDefinition,read:ART_DAYS_READ,version:ART_DAYS_VERSION,hash:artDaysHash,missing:'ART_DAYS_NOT_FOUND',fields:d=>({workedDays:d.workedDays??''})},
 {name:'fiscal facts',task:'datos-fiscales',prefix:'fiscal-facts',mount:mountOwnPeriodFiscalFacts,boot:syntheticFiscalFactsBootstrap,definition:syntheticFiscalFactsDefinition,read:FISCAL_FACTS_READ,version:FISCAL_FACTS_VERSION,hash:fiscalFactsHash,missing:'FISCAL_FACTS_NOT_FOUND',fields:()=>({}),fill:(host,d)=>{const inputs=host.querySelectorAll('[data-fiscal-field]');assert.equal(inputs.length,Object.keys(d.fields).length);for(const input of inputs)input.value=d.fields[input.dataset.fiscalField]??'';}},
 {name:'generic participation',task:'participacion',prefix:'participation',mount:mountOwnPeriodParticipation,boot:syntheticParticipationBootstrap,definition:syntheticParticipationDefinition,read:PARTICIPATION_READ,version:PARTICIPATION_VERSION,hash:participationHash,missing:'PARTICIPATION_NOT_FOUND',fields:d=>({recognizedUnits:d.recognizedUnits??'',baseUnits:d.baseUnits??''})},
];
function ownRoster(subject,tenantId){return{version:'native-roster.v2',origin:'MUNICONTROL',complete:true,today:'2026-10-01',queriedAt:'2026-10-01T12:00:00Z',scope:{tenantId,membershipId:id(102),bindingId:id(103),companyId:7},filters:{...OWN_PAYROLL_READINESS_FILTERS},total:1,people:1,counts:{active:1,pending_start:0,inactive:0,state_error:0,unknown:0},facets:{organization:['Sector QA'],sector:['Repartición QA'],agreement:['Convenio QA']},snapshot:'c'.repeat(64),rows:[{contractId:subject.contractId,registrationId:subject.registrationId,legajo:subject.legajo,name:subject.employeeName,dni:'99999990',cuil:'20999999906',sexCode:null,birthDate:'1990-01-01',startDate:'2026-09-01',endDate:null,status:'active',jurisdictionCode:'42',agreement:'Convenio QA',category:'Clase QA',organization:'Sector QA',sector:'Repartición QA',jobTitle:null,legalReference:'Resolución sintética QA',registeredAt:subject.registeredAt,recordKind:'adopted'}]};}
async function harness(t,c){
 const env=parameterPanelEnvironment(t),container=new ParameterPanelElement(),boot=c.boot(),definition=c.definition();
 const timerNames=['setInterval','clearInterval','setTimeout','clearTimeout'],timers=Object.fromEntries(timerNames.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const nativeCrypto=globalThis.crypto,cryptoDescriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');
 const auth={ok:true,authenticated:true,sessionVersion:2,user:{id:id(100),email:'parameters@example.test'},access:{context:'tenant',tenant:{id:id(101),roleKey:'QA'},tenantCapabilities:[...c.read,'payroll.parameter.prepare','payroll.parameter.approve']},expiresAt:new Date(Date.now()+3600000).toISOString()};
 const state={auth,posts:[],calls:[],rosterReads:0,saved:null,notFound:false,lookupFailure:null,loseAck:true,afterLookup:null,afterPost:null,gateDigest:null,intervals:[]};
 t.after(()=>{try{env.win.dispatch('pagehide');}finally{for(const k of timerNames)Object.defineProperty(globalThis,k,timers[k]);Object.defineProperty(globalThis,'crypto',cryptoDescriptor);env.restore();}});
 Object.assign(globalThis,{setInterval:fn=>{state.intervals.push(fn);return state.intervals.length;},clearInterval(){},setTimeout:()=>1,clearTimeout(){}});
 Object.defineProperty(globalThis,'crypto',{configurable:true,value:{randomUUID:()=>nativeCrypto.randomUUID(),subtle:{digest:async(...args)=>{const result=await nativeCrypto.subtle.digest(...args),gate=state.gateDigest;state.gateDigest=null;if(gate)await gate();return result;}}}});
 globalThis.fetch=async(url,options={})=>{
  state.calls.push({url,method:options.method??'GET'});let status=200,payload;
  if(url==='/api/internal-auth')payload=structuredClone(state.auth);
  else if(url===OWN_PAYROLL_READINESS_ROSTER_URL){state.rosterReads++;payload={ok:true,data:ownRoster(boot.source.subject,auth.access.tenant.id)};}
  else if(url.includes('resource=bootstrap')){const q=new URL(url,'https://synthetic.invalid').searchParams;assert.equal(q.get('contractId'),boot.contractId);assert.equal(q.get('period'),boot.period);payload={ok:true,data:structuredClone(boot)};}
  else if(url.includes('resource=attempt')){
   assert.equal(new URL(url,'https://synthetic.invalid').searchParams.get('key'),state.posts[0].key);
   if(state.lookupFailure){status=state.lookupFailure;payload={ok:false,code:'FORBIDDEN',error:'Ámbito sintético distinto'};}
   else if(state.notFound){status=404;payload={ok:false,code:c.missing,error:'Intento sintético ausente'};}
   else payload={ok:true,data:{...structuredClone(state.saved),replayed:true}};
   await state.afterLookup?.();
  }else{
   assert.equal(options.method,'POST');const wire=JSON.parse(options.body),body=wire.payload;assert.equal(wire.operation,'command');assert.equal(body.command,'propose');
   state.posts.push({body:options.body,key:options.headers['Idempotency-Key']});
   state.saved={version:c.version,eventId:id(500),proposalId:id(500),requestKey:options.headers['Idempotency-Key'],requestSha256:await c.hash(body),body,status:'pending',revision:0,configurationVersion:body.baseVersion,replayed:false,payrollCalculated:false,payrollPosted:false};
   await state.afterPost?.();if(state.loseAck){state.loseAck=false;throw Error('Respuesta sintética perdida');}payload={ok:true,data:structuredClone(state.saved)};
  }
  return new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json'}});
 };
 c.mount(container);const host=container.children[0],q=k=>{const n=host.querySelector('[data-'+c.prefix+'-'+k+']');assert.ok(n,k);return n;};
 const idle=async()=>{for(let i=0;i<1000&&host.getAttribute('aria-busy')!=='false';i++)await turn();assert.equal(host.getAttribute('aria-busy'),'false',q('status').textContent);};
 env.events.dispatch('taskchange',{id:c.task});await idle();await q('picker').emit('click');
 const dialog=env.document.body.querySelector('dialog');assert.equal(dialog.open,true);const search=dialog.querySelector('input[type=search]');search.value='PROPIO';await search.emit('input');await dialog.querySelector('[data-picker-form]').emit('submit');
 const result=dialog.querySelector('[data-picker-results]');for(let i=0;i<1000&&result.getAttribute('aria-busy')==='true';i++)await turn();
 const selected=result.querySelector('input[type=radio]');assert.ok(selected,dialog.querySelector('[data-picker-state]').textContent);selected.checked=true;await selected.emit('change');await dialog.querySelector('[data-picker-apply]').emit('click');
 assert.equal(dialog.open,false);assert.equal(state.rosterReads,2,'Selection must re-read the complete own roster');
 q('period').value=boot.period;await q('refresh').emit('click');assert.equal(q('content').hidden,false,q('status').textContent);
 for(const [k,v]of Object.entries(c.fields(definition)))q(k).value=v;c.fill?.(host,definition);q('date').value=definition.asOfDate;q('document').value=definition.documentReference;q('reason').value='Declaración exclusivamente sintética QA';
 await q('prepare').emit('click');q('confirm').checked=true;await q('confirm').emit('change');assert.equal(q('send').disabled,false,q('status').textContent);
 if(c.task==='participacion')t.after(()=>assert.equal(state.calls.some(r=>r.url.includes('/api/internal-own-monthly-day-declaration')),false,'Generic participation must not query or write the typed-days endpoint'));
 const hidden=()=>{env.document.hidden=true;env.events.dispatch('visibilitychange');};
 return{state,q,host,env,idle,hidden,definition,renew:()=>{state.auth.user.id=state.auth.user.id===id(100)?id(200):id(201);},lookupCount:()=>state.calls.filter(x=>x.url.includes('resource=attempt')).length,send:()=>q('send').emit('click'),recover:()=>q('recover').emit('click'),poll:()=>state.intervals.at(-1)()};
}
for(const c of cases){
 test(c.name+': renewed same account recovers the exact declared facts and key without another POST',async t=>{const h=await harness(t,c);await h.send();const original=structuredClone(h.state.posts[0]);h.renew();await h.recover();assert.equal(h.lookupCount(),1);assert.equal(h.state.posts.length,1);assert.deepEqual(h.state.posts[0],original);assert.deepEqual(JSON.parse(original.body).payload.definition,h.definition);assert.equal(h.q('receipt').hidden,false);assert.equal(h.q('approved').children.length,0);});
 test(c.name+': fresh404 after renewal allows only the original wire to be retransmitted',async t=>{const h=await harness(t,c);await h.send();h.renew();h.state.notFound=true;await h.recover();assert.equal(h.q('retry').disabled,false);h.state.notFound=false;await h.q('retry').emit('click');assert.equal(h.state.posts.length,2);assert.deepEqual(h.state.posts[1],h.state.posts[0]);assert.equal(h.q('receipt').hidden,false);});
 test(c.name+': renewal after an earlier404 requires a new lookup before retransmission',async t=>{const h=await harness(t,c);await h.send();h.state.notFound=true;await h.recover();assert.equal(h.q('retry').disabled,false);h.renew();await h.q('retry').emit('click');assert.equal(h.state.posts.length,1);assert.equal(h.q('retry').hidden,true);await h.recover();assert.equal(h.lookupCount(),2);h.state.notFound=false;await h.q('retry').emit('click');assert.equal(h.state.posts.length,2);assert.deepEqual(h.state.posts[1],h.state.posts[0]);});
 for(const [label,change]of[['account',a=>a.user.email='other@example.test'],['municipality',a=>a.access.tenant.id=id(999)],['role',a=>a.access.tenant.roleKey='OTHER']])test(c.name+': foreign '+label+' cannot look up the pending declaration; original owner can recover later',async t=>{const h=await harness(t,c);await h.send();const original=structuredClone(h.state.auth);change(h.state.auth);await h.recover();assert.equal(h.lookupCount(),0);assert.equal(h.state.posts.length,1);assert.equal(h.q('receipt').hidden,true);h.state.auth=original;h.renew();await h.q('access').emit('click');await h.recover();assert.equal(h.lookupCount(),1);assert.equal(h.q('receipt').hidden,false);assert.equal(h.state.posts.length,1);});
 test(c.name+': session change during GET requires a new-session lookup, including its server refusal',async t=>{const h=await harness(t,c);await h.send();h.state.afterLookup=()=>{h.state.afterLookup=null;h.renew();};await h.recover();assert.equal(h.q('receipt').hidden,true);assert.equal(h.q('new').hidden,true);h.state.lookupFailure=403;await h.recover();assert.equal(h.lookupCount(),2);assert.equal(h.q('receipt').hidden,true);h.state.lookupFailure=null;await h.q('access').emit('click');await h.recover();assert.equal(h.q('receipt').hidden,false);assert.equal(h.state.posts.length,1);});
 test(c.name+': session change during404 cannot enable retry until another current-session404',async t=>{const h=await harness(t,c);await h.send();h.state.notFound=true;h.state.afterLookup=()=>{h.state.afterLookup=null;h.renew();};await h.recover();assert.equal(h.q('retry').hidden,true);await h.recover();assert.equal(h.lookupCount(),2);assert.equal(h.q('retry').disabled,false);assert.equal(h.state.posts.length,1);});
 test(c.name+': session change after POST keeps its outcome uncertain until fresh GET',async t=>{const h=await harness(t,c);h.state.loseAck=false;h.state.afterPost=()=>{h.state.afterPost=null;h.renew();};await h.send();assert.equal(h.q('receipt').hidden,true);await h.recover();assert.equal(h.lookupCount(),1);assert.equal(h.q('receipt').hidden,false);assert.equal(h.state.posts.length,1);});
 test(c.name+': an ordinary same-session send still confirms its exact facts once',async t=>{const h=await harness(t,c);h.state.loseAck=false;await h.send();assert.equal(h.state.posts.length,1);assert.equal(h.lookupCount(),0);assert.equal(h.q('receipt').hidden,false);assert.deepEqual(JSON.parse(h.state.posts[0].body).payload.definition,h.definition);});
 test(c.name+': a lost retry acknowledgement withdraws its earlier404 permission until another lookup',async t=>{const h=await harness(t,c);await h.send();h.state.notFound=true;h.state.saved=null;await h.recover();assert.equal(h.q('retry').disabled,false);h.state.notFound=false;h.state.loseAck=true;await h.q('retry').emit('click');assert.equal(h.state.posts.length,2);assert.deepEqual(h.state.posts[1],h.state.posts[0]);assert.equal(h.q('retry').hidden,true);assert.equal(h.q('receipt').hidden,true);await h.recover();assert.equal(h.lookupCount(),2);assert.equal(h.state.posts.length,2);assert.equal(h.q('receipt').hidden,false);});
 test(c.name+': polling a renewed pending session retires its old view without an automatic GET or POST',async t=>{const h=await harness(t,c);await h.send();h.renew();h.poll();await h.idle();assert.equal(h.q('content').hidden,true);assert.equal(h.q('approved').children.length,0);assert.equal(h.lookupCount(),0);assert.equal(h.state.posts.length,1);assert.equal(h.q('recover').disabled,false);if(c.task==='jornada')assert.equal(h.host.querySelector('[data-collective-time-inputs]').disabled,true);await h.recover();assert.equal(h.q('receipt').hidden,false);assert.equal(h.state.posts.length,1);});
 test(c.name+': renewal before sending retires the old preparation',async t=>{const h=await harness(t,c);h.renew();h.poll();await h.idle();assert.equal(h.q('content').hidden,true);assert.equal(h.q('send').hidden,true);assert.equal(h.state.posts.length,0);});
 test(c.name+': hiding during the receipt digest keeps all retired data hidden',async t=>{const h=await harness(t,c);await h.send();h.state.afterLookup=()=>{h.state.afterLookup=null;h.state.gateDigest=()=>h.hidden();};await h.recover();assert.equal(h.q('receipt').hidden,true);assert.equal(h.q('receipt').textContent,'');assert.equal(h.q('new').hidden,true);assert.equal(h.q('approved').children.length,0);});
 test(c.name+': hidden pending attempt remains recoverable after a same-account renewal',async t=>{const h=await harness(t,c);await h.send();const original=structuredClone(h.state.posts[0]);h.hidden();h.renew();h.env.document.hidden=false;h.env.events.dispatch('visibilitychange');await h.q('access').emit('click');await h.recover();assert.equal(h.lookupCount(),1);assert.equal(h.q('receipt').hidden,false);assert.equal(h.state.posts.length,1);assert.deepEqual(h.state.posts[0],original);});
}
