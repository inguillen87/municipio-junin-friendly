// Executes the real parent/typed child over synthetic DOM and normal HTTP envelopes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mountOwnPeriodParticipation} from '../assets/own-period-participation-panel.js';
import {monthlyDayUiFixture} from './fixtures/own-monthly-day-declaration-ui-synthetic.js';
import {PayrollPanelElement as Element,payrollPanelEvents as events} from './fixtures/payroll-panel-dom.js';
import {prepareMonthlyDayDeclaration,monthlyDayDeclarationHash} from '../assets/own-monthly-day-declaration-model.js';
import {nativeRoster} from '../assets/native-roster-model.js';
import {createNativeEmployeePickerReader} from '../assets/employee-picker.js';
import {nativePayrollPickerView,nativePayrollPickerSelection} from '../assets/employee-picker-model.js';
import {ownRunWorkspaceAccess} from '../assets/own-payroll-run-workspace-model.js';
const settle=()=>new Promise(r=>setImmediate(r));
function harness(t,fixture=monthlyDayUiFixture()){
 const host=new Element(),head=new Element('head'),doc=events(),win=events(),timers=new Map();let timer=0,use;const names=['document','window','fetch','Option','setTimeout','clearTimeout','setInterval','clearInterval','location'],prior=new Map(names.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const document={...doc,hidden:false,head,body:new Element('body'),createElement:tag=>new Element(tag),querySelector:q=>head.querySelector(q)};
 Object.assign(globalThis,{document,window:win,fetch:fixture.fetch,Option:class extends Element{constructor(text,value){super('option');this.textContent=text;this._value=value;}},setTimeout:fn=>{timers.set(++timer,{fn,interval:false});return timer;},clearTimeout:k=>timers.delete(k),setInterval:fn=>{timers.set(++timer,{fn,interval:true});return timer;},clearInterval:k=>timers.delete(k),location:{pathname:'/nomina',hash:'#participacion',assign(){}}});
 mountOwnPeriodParticipation(host,{createPicker:()=>({close(){},open(options){use=options.onUse;}})});
 const query=(prefix,key)=>{const e=host.querySelector('[data-'+prefix+'-'+key+']');assert.ok(e,'Real control '+prefix+'-'+key);return e;},q=k=>query('monthly-days',k),p=k=>query('participation',k);
 async function start(){doc.dispatch('taskchange',{id:'participacion'});await settle();if(p('target').disabled)await p('access').emit('click');await p('picker').emit('click');assert.equal(typeof use,'function');use([{contractId:fixture.ids.contract,recordOrigin:'MUNICONTROL',legajo:fixture.state.boot.source.subject.legajo,nombre:fixture.state.boot.source.subject.employeeName}]);p('period').value=fixture.state.boot.period;await p('period').emit('change');}
 async function queryDays(){await q('query').emit('click');}
 async function edit({days='16',fullMonth=false}={}){for(const[key,value]of Object.entries({recognized:days,date:fixture.state.boot.period+'-01',document:'Constancia de días exclusivamente sintética QA',reason:'Preparación de días exclusivamente sintética QA'})){q(key).value=value;await q(key).emit('input');}if(fullMonth){q('full-month').checked=true;await q('full-month').emit('change');}q('policy').checked=true;await q('policy').emit('change');}
 async function prepare(options){await edit(options);await q('prepare').emit('click');}
 async function send(){q('confirm').checked=true;await q('confirm').emit('change');await q('send').emit('click');}
 const hide=()=>{document.hidden=true;doc.dispatch('visibilitychange');},show=()=>{document.hidden=false;doc.dispatch('visibilitychange');},writes=()=>fixture.requests.filter(r=>r.method==='POST');
 t.after(()=>{win.dispatch('pagehide');for(const[k,d]of prior)if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];});
 return {fixture,q,p,host,start,queryDays,edit,prepare,send,hide,show,writes,document,doc,poll:async()=>{for(const item of [...timers.values()])if(item.interval)item.fn();await settle();}};
}

test('opening and choosing a shared target issue no typed preparation or POST and declare no default policy',async t=>{const h=harness(t);await h.start();assert.equal(h.q('content').hidden,true);assert.equal(h.q('recognized').value,'');assert.equal(h.q('full-month').checked,false);assert.equal(h.q('policy').checked,false);assert.equal(h.fixture.requests.some(r=>r.url.includes('internal-own-monthly-day-declaration')),false);assert.equal(h.writes().length,0);});

test('complete employment coverage does not prefill recognizedDays or declare a liquidable full month',async t=>{const h=harness(t);await h.start();await h.queryDays();assert.equal(h.q('recognized').value,'');assert.equal(h.q('full-month').checked,false);assert.equal(h.q('policy').checked,false);assert.match(h.q('coverage').textContent,/por sí solo no acredita 30/);assert.equal(h.q('prepare').disabled,true);assert.equal(h.writes().length,0);});

test('ordinary explicit days remain allowed with full employment coverage and compare all seven fields before any POST',async t=>{const h=harness(t);await h.start();await h.queryDays();await h.prepare({days:'27.50'});assert.equal(h.q('comparison').hidden,false);assert.equal(h.q('confirm').checked,false);assert.equal(h.q('send').disabled,true);for(const text of ['27.50','30','Días','No','Días reconocidos sobre base 30','2026-10-01','Constancia de días exclusivamente sintética QA'])assert.ok(h.q('after').textContent.includes(text),text);assert.ok(!h.q('after').textContent.includes('own-monthly-approved-days-policy.v1'));assert.equal(h.writes().length,0);assert.equal(h.p('target').disabled,true);await h.q('cancel').emit('click');assert.equal(h.p('target').disabled,false);assert.equal(h.q('recognized').value,'27.50');});

test('a human full-month declaration selects30 even in February without registering or approving it',async t=>{const h=harness(t,monthlyDayUiFixture({period:'2026-02'}));await h.start();await h.queryDays();await h.prepare({fullMonth:true});assert.equal(h.q('recognized').value,'30');assert.equal(h.q('full-month').checked,true);assert.ok(h.q('after').textContent.includes('Sí'));assert.equal(h.writes().length,0);await h.send();const body=JSON.parse(h.writes()[0].body).payload;assert.equal(body.definition.fullMonthDeclared,true);assert.equal(body.definition.recognizedDays,'30');assert.equal(body.period,'2026-02');});

test('partial coverage cannot select a full month and blank is never converted to explicit zero',async t=>{const h=harness(t,monthlyDayUiFixture({fullPeriod:false}));await h.start();await h.queryDays();assert.equal(h.q('full-month').disabled,true);await h.edit({days:''});assert.equal(h.q('prepare').disabled,true);await h.q('prepare').emit('click');assert.equal(h.q('comparison').hidden,true);assert.equal(h.writes().length,0);await h.prepare({days:'0'});await h.send();assert.equal(JSON.parse(h.writes()[0].body).payload.definition.recognizedDays,'0');assert.equal(JSON.parse(h.writes()[0].body).payload.definition.fullMonthDeclared,false);});

test('the existing157 fraction remains7/12 in generic controls and never acquires typed days metadata',async t=>{const h=harness(t);await h.start();await h.p('refresh').emit('click');assert.equal(h.p('recognizedUnits').value,'7');assert.equal(h.p('baseUnits').value,'12');assert.ok(h.p('approved').textContent.includes('Unidades reconocidas'));assert.ok(!h.p('approved').textContent.includes('own-monthly-approved-days-policy'));await h.queryDays();assert.equal(h.p('recognizedUnits').value,'7');assert.equal(h.p('baseUnits').value,'12');assert.equal(h.writes().length,0);});

test('manual edits remove the reviewed command and ACK without sending or silently changing another source',async t=>{const h=harness(t);await h.start();await h.queryDays();await h.prepare();h.q('confirm').checked=true;await h.q('confirm').emit('change');h.q('recognized').value='15';await h.q('recognized').emit('input');assert.equal(h.q('comparison').hidden,true);assert.equal(h.q('send').hidden,true);assert.equal(h.q('confirm').checked,false);assert.equal(h.p('target').disabled,false);assert.equal(h.writes().length,0);});

test('recording uses the typed endpoint and fresh source with the original canonical body rather than the157 wire',async t=>{const h=harness(t);await h.start();await h.queryDays();await h.prepare();const before=h.fixture.requests.length;await h.send();const writes=h.writes();assert.equal(writes.length,1);assert.ok(writes[0].url.startsWith('/api/internal-own-monthly-day-declaration'));assert.ok(writes[0].key);const envelope=JSON.parse(writes[0].body);assert.equal(envelope.operation,'command');assert.equal(envelope.payload.definition.unit,'days');assert.equal(envelope.payload.definition.baseDays,'30');assert.equal(envelope.payload.definition.fullMonthDeclared,false);assert.equal(Object.hasOwn(envelope.payload.definition,'recognizedUnits'),false);assert.equal(envelope.payload.reviewConfirmed,false);assert.ok(h.fixture.requests.slice(before).some(r=>r.method==='GET'&&r.url.includes('resource=bootstrap')));assert.match(h.q('receipt').textContent,/No se calcularon ni confirmaron haberes/);});

test('a source change after comparison prevents allocation or POST of a stale declaration',async t=>{const h=harness(t);await h.start();await h.queryDays();await h.prepare();h.fixture.state.boot.source.version='b'.repeat(64);await h.send();assert.equal(h.writes().length,0);assert.equal(h.q('recover').hidden,true);assert.equal(h.q('comparison').hidden,true);assert.equal(h.q('recognized').value,'16');assert.match(h.q('status').textContent,/Cambió la revisión o fuente/);});

test('lost committed response hides safely and only an explicit same-account GET recovers the exact original attempt',async t=>{const h=harness(t);await h.start();await h.queryDays();await h.prepare();h.fixture.hooks.afterCommit=()=>{throw Error('Respuesta sintética perdida después de guardar');};await h.send();const original=structuredClone(h.writes()[0]);assert.equal(h.q('recover').hidden,false);assert.equal(h.p('target').disabled,true);h.hide();assert.equal(h.q('content').hidden,true);assert.equal(h.q('recognized').value,'');h.show();await settle();assert.equal(h.writes().length,1);await h.q('access').emit('click');await h.q('recover').emit('click');assert.match(h.q('status').textContent,/original recuperado/);assert.deepEqual(h.writes()[0],original);assert.equal(h.writes().length,1);});

test('unregistered attempt404 enables only explicit identical key/body retry and keeps all retargeting disabled',async t=>{const h=harness(t);await h.start();await h.queryDays();await h.prepare();let once=true;h.fixture.hooks.beforeSend=()=>{if(once){once=false;throw Error('Entrega sintética detenida antes de registrar');}};await h.send();const original=structuredClone(h.writes()[0]);assert.equal(h.q('retry').hidden,true);await h.q('recover').emit('click');assert.equal(h.writes().length,1);assert.equal(h.q('retry').hidden,false);assert.equal(h.q('fields').disabled,true);await h.q('retry').emit('click');assert.equal(h.writes().length,2);assert.equal(h.writes()[1].key,original.key);assert.equal(h.writes()[1].body,original.body);});

test('a repeated POST503 consumes the earlier404 and requires fresh recovery without changing its original body or key',async t=>{
 const h=harness(t);await h.start();await h.queryDays();await h.prepare();
 const unavailable=()=>Object.assign(Error('No se confirmó la operación. Consultá el mismo intento antes de iniciar otro.'),{status:503,code:'MONTHLY_DAY_DECLARATION_UNAVAILABLE'});
 let first=true;h.fixture.hooks.beforeSend=()=>{if(first){first=false;throw unavailable();}};
 await h.send();const original=structuredClone(h.writes()[0]);assert.equal(h.writes().length,1);assert.equal(h.fixture.ledger.size,0);assert.equal(h.q('recover').hidden,false);assert.equal(h.q('retry').hidden,true);assert.equal(h.q('receipt').hidden,true);
 await h.q('recover').emit('click');assert.equal(h.q('retry').hidden,false);assert.equal(h.writes().length,1);
 h.fixture.hooks.afterCommit=()=>{throw unavailable();};await h.q('retry').emit('click');
 assert.equal(h.writes().length,2);assert.equal(h.writes()[1].key,original.key);assert.equal(h.writes()[1].body,original.body);assert.equal(h.fixture.ledger.size,1);assert.equal(h.q('receipt').hidden,true);assert.equal(h.q('recover').hidden,false);assert.equal(h.q('retry').hidden,true,'a404 observed before another POST cannot authorise the next retry');assert.equal(h.q('fields').disabled,true);assert.equal(h.p('target').disabled,true);assert.match(h.q('status').textContent,/Consultá el mismo intento/);
 await h.q('retry').emit('click');assert.equal(h.writes().length,2,'the stale404 cannot issue even a programmatic third POST');
 h.fixture.hooks.afterCommit=undefined;await h.q('recover').emit('click');assert.equal(h.writes().length,2);assert.equal(h.q('receipt').hidden,false);assert.match(h.q('status').textContent,/original recuperado/);assert.deepEqual(h.writes()[0],original);assert.deepEqual(h.fixture.ledger.get(original.key).body,JSON.parse(original.body).payload);
});

test('late bootstrap after hiding cannot refill the typed fields or issue a POST',async t=>{const h=harness(t);await h.start();let release,entered;const began=new Promise(r=>entered=r);h.fixture.hooks.bootstrap=async()=>{entered();await new Promise(r=>release=r);};const reading=h.queryDays();await began;h.hide();release();await reading;assert.equal(h.q('content').hidden,true);assert.equal(h.q('recognized').value,'');assert.equal(h.q('subject').textContent,'');assert.equal(h.writes().length,0);});

test('revoked capabilities after a read retire typed data before staging or recording',async t=>{const h=harness(t);await h.start();await h.p('refresh').emit('click');assert.equal(h.p('recognizedUnits').value,'7');h.fixture.hooks.bootstrap=()=>{h.fixture.state.caps=[];};await h.queryDays();assert.equal(h.p('content').hidden,true);assert.equal(h.p('recognizedUnits').value,'');assert.equal(h.q('content').hidden,true);assert.equal(h.q('recognized').value,'');assert.equal(h.q('send').hidden,true);assert.equal(h.writes().length,0);});

test('a pending attempt cannot be recovered under another account or retargeted by changed fields',async t=>{const h=harness(t);await h.start();await h.queryDays();await h.prepare();h.fixture.hooks.afterCommit=()=>{throw Error('Respuesta perdida QA');};await h.send();const original=structuredClone(h.writes()[0]);h.fixture.state.actor='checker';await h.q('recover').emit('click');assert.equal(h.q('content').hidden,true);assert.equal(h.q('recover').hidden,false);assert.equal(h.writes().length,1);h.fixture.state.actor='maker';await h.q('access').emit('click');await h.q('recover').emit('click');assert.deepEqual(h.writes()[0],original);assert.match(h.q('receipt').textContent,/Pendiente de revisión/);});

test('same author cannot approve; another authorised checker reviews the exact typed proposal independently',async t=>{const h=harness(t);await h.start();await h.queryDays();await h.prepare();await h.send();await h.q('new').emit('click');await h.queryDays();const id=[...h.fixture.proposals.keys()][0];h.q('proposal').value=id;await h.q('open').emit('click');assert.equal(h.q('decision-fields').disabled,true);h.fixture.state.actor='checker';await h.queryDays();await h.start();await h.queryDays();h.q('proposal').value=id;await h.q('open').emit('click');h.q('decision').value='approve';await h.q('decision').emit('input');h.q('decision-reason').value='Revisión independiente exclusivamente sintética';await h.q('decision-reason').emit('input');await h.q('review').emit('click');await h.send();assert.equal(h.writes().length,2,h.q('status').textContent);const decision=JSON.parse(h.writes()[1].body).payload;assert.equal(decision.command,'approve');assert.equal(decision.definition,null);assert.equal(decision.reviewConfirmed,true);assert.equal(decision.proposalId,id);});

test('an incomplete typed proposal keeps NULL visible and cannot be approved or silently treated as zero',async t=>{const f=monthlyDayUiFixture(),body=prepareMonthlyDayDeclaration(f.bootstrap(),f.definition(null),'Borrador incompleto exclusivamente sintético');await f.fetch('/api/internal-own-monthly-day-declaration',{method:'POST',headers:{'Idempotency-Key':crypto.randomUUID()},body:JSON.stringify({operation:'command',payload:body})});f.state.actor='checker';const h=harness(t,f);await h.start();await h.queryDays();h.q('proposal').value=[...f.proposals.keys()][0];await h.q('open').emit('click');assert.match(h.q('after').textContent,/Sin informar; no equivale a cero/);h.q('decision').value='approve';await h.q('decision').emit('input');assert.equal(h.q('review').disabled,true);h.q('decision').value='reject';await h.q('decision').emit('input');assert.equal(h.q('review').disabled,false);assert.equal(h.writes().length,1);});

test('unavailable typed API does not fall back to generic157 or reinterpret its fraction',async t=>{const h=harness(t);await h.start();h.fixture.state.unavailable=404;await h.queryDays();assert.equal(h.q('content').hidden,true);assert.equal(h.q('send').hidden,true);assert.equal(h.p('target').disabled,false);await h.p('refresh').emit('click');assert.equal(h.p('recognizedUnits').value,'7');assert.equal(h.p('baseUnits').value,'12');assert.equal(h.writes().length,0);});

test('idle permission revocation withdraws a typed comparison without changing its prepared or pending transport',async t=>{const h=harness(t);await h.start();await h.queryDays();await h.prepare();h.fixture.state.caps=[];await h.poll();assert.equal(h.q('content').hidden,true);assert.equal(h.q('recognized').value,'');assert.equal(h.q('comparison').hidden,true);assert.equal(h.writes().length,0);});

test('a recovered receipt with a different key or body cannot acknowledge or replace the original uncertain attempt',async t=>{const h=harness(t);await h.start();await h.queryDays();await h.prepare();h.fixture.hooks.afterCommit=()=>{throw Error('Respuesta perdida QA');};await h.send();const first=structuredClone(h.writes()[0]);h.fixture.hooks.receipt=r=>{r.requestKey=crypto.randomUUID();};await h.q('recover').emit('click');assert.equal(h.q('receipt').hidden,true);assert.equal(h.q('recover').hidden,false);assert.equal(h.writes().length,1);h.fixture.hooks.receipt=async r=>{r.body.definition.recognizedDays='15';r.requestSha256=await monthlyDayDeclarationHash(r.body);};await h.q('recover').emit('click');assert.equal(h.q('receipt').hidden,true);assert.equal(h.writes().length,1);h.fixture.hooks.receipt=undefined;await h.q('recover').emit('click');assert.equal(h.q('receipt').hidden,false);assert.deepEqual(h.writes()[0],first);});

test('revocation after commit masks all fields but preserves the original key and body for a later authorised GET',async t=>{const h=harness(t);await h.start();await h.queryDays();await h.prepare();const caps=[...h.fixture.state.caps];h.fixture.hooks.afterCommit=()=>{h.fixture.state.caps=[];};await h.send();const first=structuredClone(h.writes()[0]);assert.equal(h.q('content').hidden,true);assert.equal(h.q('recover').hidden,false);assert.equal(h.q('recognized').value,'');h.fixture.state.caps=caps;await h.q('access').emit('click');await h.q('recover').emit('click');assert.equal(h.writes().length,1);assert.deepEqual(h.writes()[0],first);assert.equal(h.q('receipt').hidden,false);});

test('a157 response at the typed endpoint is rejected rather than reinterpreted as a declaration of days',async t=>{const h=harness(t);await h.start();h.fixture.hooks.bootstrap=b=>{b.version='own-period-participation.v1';};await h.queryDays();assert.equal(h.q('content').hidden,true);assert.equal(h.q('recognized').value,'');assert.equal(h.q('send').hidden,true);assert.equal(h.writes().length,0);});

const unverifiedAuthority=kind=>async()=>{
 if(kind==='network')throw TypeError('Synthetic auth transport unavailable');
 if(kind==='abort')throw new DOMException('Synthetic authority read aborted','AbortError');
 if(kind==='json')return new Response('{broken authority JSON',{status:200,headers:{'Content-Type':'application/json'}});
 return new Response(JSON.stringify({ok:false,error:'Synthetic authority envelope not verified'}),{status:200,headers:{'Content-Type':'application/json'}});
};
const assertAuthorityRetired=h=>{
 assert.equal(h.p('content').hidden,true,'generic data is withdrawn with typed authority');
 assert.equal(h.p('recognizedUnits').value,'');
 assert.equal(h.q('content').hidden,true,'typed data is withdrawn after an unverified authority read');
 assert.equal(h.q('recognized').value,'');
 assert.equal(h.q('document').value,'');
 assert.equal(h.q('reason').value,'');
 assert.equal(h.q('comparison').hidden,true);
 assert.equal(h.q('send').hidden,true);
 assert.equal(h.q('access').hidden,false);
};
for(const kind of ['network','abort','json','envelope'])test('an unverified auth '+kind+' during idle review masks both views without recording',async t=>{
 const h=harness(t);await h.start();await h.p('refresh').emit('click');await h.queryDays();await h.prepare();
 h.fixture.hooks.authorityResponse=unverifiedAuthority(kind);await h.poll();assertAuthorityRetired(h);
 await h.q('prepare').emit('click');assert.equal(h.q('comparison').hidden,true);assert.equal(h.writes().length,0);
 h.fixture.hooks.authorityResponse=undefined;await h.q('access').emit('click');assert.equal(h.q('content').hidden,true,'new authority alone does not refill removed data');assert.equal(h.writes().length,0);
});
for(const kind of ['network','json'])test('an unverified auth '+kind+' during recovery retains the original committed attempt for a later explicit GET',async t=>{
 const h=harness(t);await h.start();await h.p('refresh').emit('click');await h.queryDays();await h.prepare();
 h.fixture.hooks.afterCommit=()=>{throw Error('Synthetic committed response lost');};await h.send();
 const original=structuredClone(h.writes()[0]);h.fixture.hooks.authorityResponse=unverifiedAuthority(kind);await h.q('recover').emit('click');assertAuthorityRetired(h);
 assert.equal(h.q('recover').hidden,false);assert.equal(h.q('recover').disabled,true);assert.equal(h.writes().length,1);
 h.fixture.hooks.authorityResponse=undefined;await h.q('access').emit('click');await h.q('recover').emit('click');
 assert.equal(h.writes().length,1);assert.deepEqual(h.writes()[0],original);assert.equal(h.q('receipt').hidden,false);assert.match(h.q('status').textContent,/original recuperado/);
});
for(const kind of ['network','envelope'])test('an unverified auth '+kind+' after commit retires fields and confirms nothing until original-attempt GET',async t=>{
 const h=harness(t);await h.start();await h.p('refresh').emit('click');await h.queryDays();await h.prepare();
 h.fixture.hooks.afterCommit=()=>{h.fixture.hooks.authorityResponse=unverifiedAuthority(kind);};await h.send();
 const original=structuredClone(h.writes()[0]);assertAuthorityRetired(h);assert.equal(h.q('receipt').hidden,true);assert.equal(h.writes().length,1);
 h.fixture.hooks.authorityResponse=undefined;await h.q('access').emit('click');await h.q('recover').emit('click');
 assert.equal(h.writes().length,1);assert.deepEqual(h.writes()[0],original);assert.equal(h.q('receipt').hidden,false);
});
test('a business bootstrap failure preserves documentary inputs and is not misclassified as failed authority',async t=>{
 const h=harness(t);await h.start();await h.p('refresh').emit('click');await h.queryDays();await h.prepare();
 h.fixture.state.unavailable=503;await h.q('query').emit('click');
 assert.equal(h.p('content').hidden,false);assert.equal(h.p('recognizedUnits').value,'7');assert.equal(h.q('content').hidden,false);
 assert.equal(h.q('recognized').value,'16');assert.equal(h.q('document').value,'Constancia de días exclusivamente sintética QA');
 assert.equal(h.q('comparison').hidden,true);assert.equal(h.q('access').hidden,true);assert.equal(h.writes().length,0);
});

for(const kind of ['network','abort','json','envelope'])test('the parent refresh retires both idle views when its auth '+kind+' cannot be verified',async t=>{
 const h=harness(t);await h.start();await h.p('refresh').emit('click');await h.queryDays();await h.edit();
 assert.equal(h.p('refresh').disabled,false,'the existing parent read remains available without a prepared or pending command');
 h.fixture.hooks.authorityResponse=unverifiedAuthority(kind);await h.p('refresh').emit('click');
 assertAuthorityRetired(h);assert.equal(h.p('target').disabled,true);assert.equal(h.p('period').value,'');assert.equal(h.writes().length,0);
 h.fixture.hooks.authorityResponse=undefined;await h.p('access').emit('click');
 assert.equal(h.q('content').hidden,true);assert.equal(h.p('content').hidden,true);assert.equal(h.writes().length,0);
});
test('a parent business bootstrap503 preserves both consulted views without treating it as failed authority',async t=>{
 const h=harness(t);await h.start();await h.p('refresh').emit('click');await h.queryDays();await h.edit();
 const normal=globalThis.fetch;globalThis.fetch=async(url,options)=>String(url).startsWith('/api/internal-own-period-participation')?new Response(JSON.stringify({ok:false,error:'Synthetic generic participation business unavailable'}),{status:503,headers:{'Content-Type':'application/json'}}):normal(url,options);
 await h.p('refresh').emit('click');
 assert.equal(h.p('content').hidden,false);assert.equal(h.p('recognizedUnits').value,'7');assert.equal(h.q('content').hidden,false);assert.equal(h.q('recognized').value,'16');
 assert.equal(h.q('document').value,'Constancia de días exclusivamente sintética QA');assert.equal(h.q('access').hidden,true);assert.equal(h.writes().length,0);
});

test('the synthetic hire passes the real complete-roster reader and fresh picker application without weakening hire identity',async t=>{
 const h=harness(t),access=ownRunWorkspaceAccess(await(await h.fixture.fetch('/api/internal-auth')).json());
 const read=createNativeEmployeePickerReader({getAccess:()=>access,canUse:()=>true,required:['workforce.employee.read','payroll.parameter.read']});
 const source=h.fixture.roster();assert.equal(source.rows[0].recordKind,'hire');const first=await read();nativeRoster(source);assert.match(source.rows[0].legajo,/^[1-9]\d{0,8}$/);
 assert.equal(source.rows[0].legajo,h.fixture.state.boot.source.subject.legajo);assert.equal(source.rows[0].legajo,h.fixture.state.generic.source.subject.legajo);
 const view=nativePayrollPickerView(first,h.fixture.state.boot.source.subject.legajo);
 assert.equal(view.rows.length,1);assert.equal(view.rows[0].contractId,h.fixture.ids.contract);assert.equal(view.rows[0].recordOrigin,'MUNICONTROL');
 const fresh=await read(),selection=nativePayrollPickerSelection(fresh,view.rows,{multiple:false,maximum:1});assert.deepEqual(selection,view.rows);
 assert.equal(h.fixture.requests.filter(r=>r.url.startsWith('/api/internal-data?')&&r.url.includes('resource=nativeroster')).length,2,'application reads the complete own roster afresh');
 assert.equal(h.fixture.requests.filter(r=>r.url==='/api/internal-auth').length,5,'initial authority plus both before/after guards for each fresh roster');
 assert.equal(h.fixture.requests.some(r=>r.url.includes('resource=employees')),false);assert.equal(h.writes().length,0);
 const invalid=structuredClone(source);invalid.rows[0].legajo='PROPIO-001';assert.throws(()=>nativeRoster(invalid),e=>e.code==='NATIVE_ROSTER_INVALID','an alphanumeric label still cannot claim the own-hire contract');
});
