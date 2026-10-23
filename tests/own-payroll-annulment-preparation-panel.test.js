// Proposed functional tests: real calculation panel and browser models over the
// same in-memory DOM used by the existing readiness tests. HTTP is synthetic.
// No SQL, actual server, payroll execution or municipal acceptance is implied.
import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {mountOwnPayrollRun} from '../assets/own-payroll-run-panel.js';
import {OWN_RUN_PREPARE,OWN_RUN_NOMINAL} from '../assets/own-payroll-run-workspace-model.js';
import {CATALOG_VERSION} from '../assets/native-employment-catalog-model.js';
import {bootstrap,program,uid,hash} from './fixtures/own-payroll-program-synthetic.js';
import {roster} from './fixtures/native-roster-synthetic.js';
import {catalog as classification} from './fixtures/native-employee-synthetic.js';
import {syntheticAnnulPreparation,sealPreparation,prepHash} from './fixtures/own-payroll-annulment-preparation-synthetic.js';
import {detail as liquidationDetail} from './fixtures/own-payroll-liquidation-synthetic.js';
class Element{
 constructor(tag='div'){this.tagName=tag.toLowerCase();this.children=[];this.parentElement=null;this.attributes={};this.listeners=new Map();this.hidden=false;this.disabled=false;this.checked=false;this.selected=false;this.open=false;this._value=undefined;this._text='';this.isConnected=true;this.dataset=new Proxy({}, {set:(target,key,value)=>{target[key]=String(value);this.attributes['data-'+String(key).replace(/[A-Z]/g,c=>'-'+c.toLowerCase())]=String(value);return true;}});}
 append(...items){for(const item of items){item.parentElement=this;this.children.push(item);}}
 replaceChildren(...items){this.children=[];this._text='';this.append(...items);}
 setAttribute(name,value){this.attributes[name.toLowerCase()]=String(value);if(name==='hidden')this.hidden=true;if(name==='disabled')this.disabled=true;if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;}
 getAttribute(name){return this.attributes[name.toLowerCase()]??null;}
 removeAttribute(name){delete this.attributes[name.toLowerCase()];if(name==='href')delete this.href;}
 get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
 set textContent(value){this._text=String(value);this.children=[];}
 get options(){return this.tagName==='select'?this.children:[];}
 get selectedOptions(){return this.options.filter(o=>o.selected);}
 get value(){return this._value??(this.tagName==='select'?this.children[0]?.value??'':'');}
 set value(value){const s=String(value);this._value=this.tagName==='select'&&!this.children.some(o=>o.value===s)?'':s;}
 focus(){} showModal(){this.open=true;} close(){this.open=false;}
 set innerHTML(html){this.replaceChildren();const stack=[this];for(const token of html.match(/<[^>]*>|[^<]+/g)??[]){if(token.startsWith('</')){stack.pop();continue;}if(token.startsWith('<')){const m=token.match(/^<([a-z][\w-]*)\b([^>]*)>/i);if(!m)continue;const element=new Element(m[1]);for(const a of m[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))element.setAttribute(a[1],a[2]??'');if(element.tagName==='input')element.type=element.getAttribute('type');if(element.tagName==='option')element._value=element.getAttribute('value')??'';stack.at(-1).append(element);if(!['input','link','br','hr','meta'].includes(element.tagName)&&!token.endsWith('/>'))stack.push(element);}else{const text=new Element('#text');text._text=token;stack.at(-1).append(text);}}}
 matches(selector){if(selector.startsWith('#'))return this.getAttribute('id')===selector.slice(1);const attr=selector.match(/^(?:([\w-]+))?\[([\w-]+)(?:="?([^"\]]+)"?)?\]$/);return attr?(!attr[1]||this.tagName===attr[1])&&Object.hasOwn(this.attributes,attr[2])&&(attr[3]===undefined||this.getAttribute(attr[2])===attr[3]):this.tagName===selector;}
 querySelectorAll(selector){const matches=n=>selector.split(',').some(s=>{const parts=s.trim().split(/\s+/);if(!n.matches(parts.pop()))return false;let p=n.parentElement;while(parts.length&&p){if(p.matches(parts.at(-1)))parts.pop();p=p.parentElement;}return !parts.length;}),result=[];const walk=n=>{for(const c of n.children){if(matches(c))result.push(c);walk(c);}};walk(this);return result;}
 querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
 addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(fn);}
 removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)??[]).filter(f=>f!==fn));}
 async emit(type){for(let n=this;n;n=n.parentElement)if(n.disabled)return;await Promise.all((this.listeners.get(type)??[]).map(fn=>fn({target:this,preventDefault(){}})));}
}
const events=()=>{const listeners=new Map();return{addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},removeEventListener(type,fn){listeners.set(type,(listeners.get(type)??[]).filter(f=>f!==fn));},dispatch(type,detail){for(const fn of listeners.get(type)??[])fn({detail});}};};
const approved=()=>({version:hash('b'),revision:1,definition:program(),salaryVersion:hash('c'),proposalId:uid(1),approvalId:uid(2)});
const ownRoster=count=>{const n=roster(count);n.version='native-roster.v2';n.counts.unknown=0;n.rows=n.rows.map(r=>({...r,recordKind:'hire'}));return n;};
const settle=()=>new Promise(resolve=>setImmediate(resolve));

const purpose='/api/internal-own-payroll-annulment-preparation?resource=detail&id=';
const projection=()=>sealPreparation({...syntheticAnnulPreparation(),scopeVersion:hash('a')});
const projectionRoster=value=>{const n=ownRoster(value.affected.length);n.rows=n.rows.map((row,i)=>({...row,contractId:value.affected[i].contractId,legajo:value.affected[i].employeeNumber}));return n;};
function harness(t){
 const host=new Element(),docEvents=events(),winEvents=events(),requests=[],names=['document','window','fetch','setTimeout','clearTimeout','setInterval','clearInterval'],before=new Map(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]));
 const projected=projection(),state={caps:[...OWN_RUN_PREPARE],sessionId:uid(333),program:bootstrap({program:approved()}),catalogItems:classification.items,roster:projectionRoster(projected),projection:projected,projectionReads:0,afterProjectionRead:null,hold:null,authFailure:null,projectionFailure:null,decision:null};
 let timerId=0;const timers=new Map();
 const document={...docEvents,hidden:false,head:new Element('head'),body:new Element('body'),createElement:tag=>new Element(tag),querySelectorAll:()=>[],getElementById:()=>null};
 Object.assign(globalThis,{document,window:winEvents,setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),setInterval:()=>1,clearInterval(){}});
 globalThis.fetch=async(url,options={})=>{
  const method=options.method??'GET',request={url,method,body:options.body??null,key:options.headers?.['Idempotency-Key']??null,accept:options.headers?.Accept??null};requests.push(request);
  if(state.hold?.url===url)await state.hold.wait;
  let status=200,payload;
  if(url==='/api/internal-auth'){if(state.authFailure){status=state.authFailure;payload={ok:false,code:'SYNTHETIC_SESSION_UNAVAILABLE'};}else payload={ok:true,authenticated:true,sessionVersion:2,user:{id:state.sessionId,email:'synthetic-readiness@example.invalid'},access:{context:'tenant',tenant:{id:roster(1).scope.tenantId,roleKey:'QA'},tenantCapabilities:state.caps},expiresAt:new Date(Date.now()+3600000).toISOString()};}
  else if(method==='POST'){assert.equal(url,'/api/internal-own-payroll-run','Only an explicit voluntary calculation may reach this synthetic POST');status=503;payload={ok:false,code:'OWN_RUN_BUSY'};}
  else if(url.startsWith(purpose)){assert.equal(url,purpose+state.projection.source.id,'Only the opaque source UUID is sent to the new endpoint');state.projectionReads++;if(state.projectionFailure){status=state.projectionFailure.status;payload={ok:false,code:state.projectionFailure.code,error:state.projectionFailure.error};}else payload={ok:true,data:structuredClone(state.projection)};state.afterProjectionRead?.(state.projectionReads);}
  else if(url.startsWith('/api/internal-own-payroll-liquidation?resource=attempt'))assert.fail('A preparer must never read the reviewer\'s attempt: '+url);
  else if(url.startsWith('/api/internal-own-payroll-liquidation?resource=detail&id=')){assert.ok(state.decision,'Only a queued decision reference reads a run detail');assert.equal(url,'/api/internal-own-payroll-liquidation?resource=detail&id='+state.decision.detail.id,'Only the referenced run is read');if(state.decision.failure){status=state.decision.failure.status;payload={ok:false,code:state.decision.failure.code,error:'synthetic server text'};}else payload={ok:true,data:structuredClone(state.decision.detail)};}
  else if(url.startsWith('/api/internal-own-payroll-run?resource=attempt')){status=404;payload={ok:false,code:'OWN_RUN_NOT_FOUND'};}
  else if(url.startsWith('/api/internal-own-payroll-run?'))payload={ok:true,data:{version:'own-payroll-bootstrap.v2',scopeVersion:hash('a'),programVersion:hash('b'),canCalculate:true,runs:[],complete:true}};
  else if(url==='/api/internal-employment-catalog?resource=bootstrap')payload={ok:true,data:{version:CATALOG_VERSION,scopeVersion:hash('a'),catalog:{items:state.catalogItems.map((r,i)=>({...r,key:'synthetic-'+i,agreementCode:r.agreementCode??null})),version:hash('d'),origin:'GRH',revision:0,publishedAt:null},permissions:{canPropose:true,canReview:true},proposals:[],historyTruncated:false}};
  else if(url==='/api/internal-own-payroll-program?resource=bootstrap')payload={ok:true,data:state.program};
  else if(url.startsWith('/api/internal-data?resource=nativeroster'))payload={ok:true,data:state.roster};
  else assert.fail('Unexpected synthetic HTTP '+url);
  return new Response(JSON.stringify(payload),{status,headers:{'Content-Type':'application/json'}});
 };
 const mounted=mountOwnPayrollRun(host),q=key=>{const value=host.querySelector('[data-own-'+key+']');assert.ok(value,'Actual panel control '+key);return value;};
 const idle=async()=>{const deadline=performance.now()+5000;while(host.getAttribute('aria-busy')!=='false'){if(performance.now()>=deadline)assert.fail('Panel did not settle: '+q('status').textContent);await delay(5);}};
 const start=async()=>{docEvents.dispatch('taskchange',{id:'calculo'});await idle();};
 const prepare=async()=>{q('period').value='2026-10';q('date').value='2026-10-31';q('type').value='monthly';q('kind').value='all';await q('kind').emit('change');q('confirm').checked=true;await q('confirm').emit('change');};
 const submit=async()=>{await q('form').emit('submit');await idle();};
 const select=async value=>{q('projected-date').value=value;await q('projected-date').emit('change');};
 const apply=async()=>{await q('projected-use').emit('click');await idle();};
 t.after(()=>{winEvents.dispatch('pagehide');for(const[key,descriptor]of before)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
 return{state,requests,q,host,start,idle,prepare,submit,select,apply,refresh:mounted.refresh,queuePreparation:mounted.queuePreparation,event:docEvents.dispatch,document};
}
const reference=h=>({kind:'projected_annulment',sourceId:h.state.projection.source.id});
const posts=h=>h.requests.filter(r=>r.method==='POST');
const purposeReads=h=>h.requests.filter(r=>r.url.startsWith(purpose));
const waitFor=async(fn,message)=>{const deadline=performance.now()+5000;while(!fn()){if(performance.now()>deadline)assert.fail(message);await settle();}};
const manualDraft=async h=>{await h.prepare();h.q('period').value='2026-11';h.q('date').value='2026-11-30';h.q('confirm').checked=false;};
const assertManualDraft=h=>{assert.equal(h.q('period').value,'2026-11');assert.equal(h.q('date').value,'2026-11-30');assert.equal(h.q('kind').value,'all');assert.equal(h.q('confirm').checked,false);};
const assertNoHistoricalAuthority=h=>{assert.ok(h.requests.every(r=>!r.url.startsWith('/api/internal-own-payroll-annulment?')&&!r.url.startsWith('/api/internal-own-payroll-liquidation?')),'No old creator receipt/capture endpoint is read');for(const r of purposeReads(h)){const query=new URL(r.url,'https://example.invalid').searchParams;assert.deepEqual([...query.keys()],['resource','id']);assert.equal(query.get('id'),h.state.projection.source.id);assert.equal(query.get('resource'),'detail');}};

test('projected queue rejects checker keys and borrowed context; no prepare capability cannot load209',async t=>{
 const h=harness(t),base=reference(h);for(const extra of[{key:uid(901)},{accessKey:'borrowed-checker-key'},{actor:uid(902)},{scopeVersion:hash('f')}])assert.equal(h.queuePreparation({...base,...extra}),false);
 h.state.caps=[...OWN_RUN_NOMINAL];assert.equal(h.queuePreparation(base),true);await h.start();assert.equal(purposeReads(h).length,0);assert.equal(h.q('projected-load').disabled,true);assert.equal(h.q('projected-date').options.length,1);assert.equal(h.q('confirm').checked,false);assert.equal(posts(h).length,0);assertNoHistoricalAuthority(h);
});

test('third preparer sees date groups only after the entire projected census is verified in the current session',async t=>{
 const h=harness(t),source=h.state.projection;assert.ok(source.runs.every(run=>run.creatorScopeVersion!==source.scopeVersion));assert.equal(new Set(source.runs.map(run=>run.creatorScopeVersion)).size,3);assert.equal(h.queuePreparation(reference(h)),true);
 let release;h.state.hold={url:purpose+source.source.id,wait:new Promise(resolve=>release=resolve)};const opening=h.start();await waitFor(()=>purposeReads(h).length===1,'The complete projection should be requested');assert.equal(h.q('projected-date').options.length,1);assert.equal(h.q('projected-date').value,'');assert.equal(h.q('projected-use').disabled,true);assert.equal(posts(h).length,0);release();await opening;h.state.hold=null;
 assert.equal(h.q('projected-date').options.length,4);assert.deepEqual(h.q('projected-date').options.map(option=>option.value),['','legacy','2026-10-15','2026-10-20']);assert.equal(h.q('projected-date').value,'');assert.match(h.q('projected-description').textContent,/6 legajos verificados en 3 grupos/);assert.equal(h.q('confirm').checked,false);assert.equal(posts(h).length,0);assertNoHistoricalAuthority(h);
});

test('explicit date group prepares exactly its two contracts without POST or consent, then a separate voluntary calculation sends those exact IDs',async t=>{
 const h=harness(t);assert.equal(h.queuePreparation(reference(h)),true);await h.start();await h.select('2026-10-15');await h.apply();
 const expected=h.state.projection.affected.filter(row=>row.liquidationDate==='2026-10-15');assert.equal(h.q('period').value,'2026-10');assert.equal(h.q('date').value,'2026-10-15');assert.equal(h.q('type').value,'monthly');assert.equal(h.q('kind').value,'contracts');assert.equal(h.q('chips').children.length,expected.length);for(const row of expected)assert.match(h.q('chips').textContent,new RegExp('Legajo '+row.employeeNumber+' '));for(const row of h.state.projection.affected.filter(row=>row.liquidationDate!=='2026-10-15'))assert.ok(!h.q('chips').textContent.includes(row.employeeNumber));
 assert.equal(h.q('confirm').checked,false);assert.equal(posts(h).length,0);assert.equal(purposeReads(h).length,2);assert.equal(h.q('projected-preparation').hidden,true);assert.equal(h.q('send').disabled,true);assertNoHistoricalAuthority(h);
 // Only this later human-equivalent confirmation and submit are a calculation.
 h.q('confirm').checked=true;await h.q('confirm').emit('change');await h.submit();assert.equal(posts(h).length,1);const body=JSON.parse(posts(h)[0].body).payload;assert.deepEqual(body.selection,{kind:'contracts',values:expected.map(row=>row.contractId)});assert.equal(body.liquidationDate,'2026-10-15');assert.equal(Object.hasOwn(body,'sourceReference'),false);assert.equal(Object.hasOwn(body,'accessKey'),false);
});

test('tamper in an unchosen date rejects ALL date groups and preserves the existing draft',async t=>{
 const h=harness(t);await h.start();await manualDraft(h);const value=structuredClone(h.state.projection);value.affected.at(-1).state='confirmed';h.state.projection=sealPreparation(value);assert.equal(h.queuePreparation(reference(h)),true);await h.refresh();assertManualDraft(h);assert.equal(h.q('projected-date').options.length,1);assert.equal(h.q('projected-use').disabled,true);assert.equal(h.q('projected-preparation').hidden,false);assert.match(h.q('status').textContent,/No se verificó la entrega completa/);assert.equal(posts(h).length,0);
});

test('a valid but changed whole projection on reread rejects the selected group without replacing a manual draft',async t=>{
 const h=harness(t);await h.start();await manualDraft(h);assert.equal(h.queuePreparation(reference(h)),true);await h.refresh();await h.select('2026-10-15');h.state.projection=sealPreparation({...h.state.projection,sourceStateSha256:prepHash(['Synthetic concurrent census change on another date'])});await h.apply();assertManualDraft(h);assert.equal(h.q('chips').children.length,0);assert.equal(h.q('projected-date').options.length,1);assert.equal(h.q('projected-preparation').hidden,false);assert.equal(purposeReads(h).length,2);assert.equal(posts(h).length,0);assert.match(h.q('status').textContent,/No se verificó la entrega completa/);
});

for(const mode of['hidden','capability-event','fresh-session'])test('pending reread after '+mode+' cannot apply late contracts or restore consent',async t=>{
 const h=harness(t);assert.equal(h.queuePreparation(reference(h)),true);await h.start();await h.select('2026-10-15');let release;h.state.hold={url:purpose+h.state.projection.source.id,wait:new Promise(resolve=>release=resolve)};const applying=h.apply();await waitFor(()=>purposeReads(h).length===2,'Explicit apply must reread the entire projection');
 if(mode==='hidden'){h.document.hidden=true;h.event('visibilitychange');}else if(mode==='capability-event'){h.state.caps=h.state.caps.filter(cap=>cap!=='payroll.calculation.prepare');h.event('municontrol:capabilities-ready',{tenantCapabilities:h.state.caps});}else h.state.afterProjectionRead=()=>{h.state.caps=h.state.caps.filter(cap=>cap!=='payroll.calculation.prepare');};
 release();await applying;assert.equal(h.q('chips').children.length,0);assert.equal(h.q('projected-date').options.length,1);assert.equal(h.q('confirm').checked,false);assert.equal(h.q('date').value,'');assert.equal(h.q('projected-preparation').hidden,false);assert.equal(posts(h).length,0);assertNoHistoricalAuthority(h);
});

test('pending rules preserve manual draft and queued reference without209 until actual approved refresh',async t=>{
 const h=harness(t);h.state.program=bootstrap();await h.start();await manualDraft(h);assert.equal(h.queuePreparation(reference(h)),true);await h.refresh();assertManualDraft(h);assert.equal(purposeReads(h).length,0);assert.equal(h.q('projected-load').disabled,true);assert.equal(h.q('projected-preparation').hidden,false);assert.equal(h.q('confirm').disabled,true);await h.q('projected-load').emit('click');assert.equal(purposeReads(h).length,0);
 h.state.program=bootstrap({program:approved()});await h.refresh();assertManualDraft(h);assert.equal(purposeReads(h).length,1);assert.equal(h.q('projected-date').options.length,4);assert.equal(h.q('projected-date').value,'');assert.equal(h.q('projected-preparation').hidden,false);assert.equal(h.q('confirm').checked,false);assert.equal(posts(h).length,0);
});

test('uncertain voluntary calculation keeps exact body and key, rejects another reference and never rereads209',async t=>{
 const h=harness(t);assert.equal(h.queuePreparation(reference(h)),true);await h.start();await h.prepare();await h.submit();assert.equal(posts(h).length,1);const original={...posts(h)[0]},count=purposeReads(h).length;assert.equal(h.queuePreparation({...reference(h),sourceId:uid(9001)}),false);await h.refresh();assert.equal(purposeReads(h).length,count);assert.equal(h.q('projected-load').disabled,true);assert.equal(h.q('fields').disabled,true);assert.equal(h.q('recover').hidden,false);await h.q('recover').emit('click');await h.idle();await h.submit();assert.equal(posts(h).length,2);assert.equal(posts(h)[1].key,original.key);assert.equal(posts(h)[1].body,original.body);assert.equal(purposeReads(h).length,count);assert.equal(h.q('projected-preparation').hidden,false);
});

test('null historical group stays null in provenance and leaves a new date blank instead of inventing the month end',async t=>{
 const h=harness(t),before=structuredClone(h.state.projection);assert.equal(h.queuePreparation(reference(h)),true);await h.start();await h.select('legacy');await h.apply();assert.equal(h.q('period').value,'2026-10');assert.equal(h.q('date').value,'');assert.equal(h.q('kind').value,'contracts');assert.equal(h.q('chips').children.length,2);assert.equal(h.q('confirm').checked,false);assert.equal(posts(h).length,0);assert.deepEqual(h.state.projection,before);assert.equal(h.state.projection.dateGroups[0].liquidationDate,null);
 // Synthetic DOM has no browser constraint validation; the actual command
 // validator must still refuse a blank date even if an event is forced.
 h.q('confirm').checked=true;await h.q('confirm').emit('change');await h.submit();assert.equal(posts(h).length,0);assert.equal(h.q('recover').hidden,true);assert.equal(h.q('date').value,'');assert.equal(h.q('projected-preparation').hidden,true);
});

// Proposed causal tests for the209 cross-user handoff by link. Before the panel
// patch they fail: every rejected209 read showed 'No se confirmó la operación.
// Consultá el mismo intento antes de continuar.' and the login destination
// dropped the source-only reference. HTTP stays synthetic; no SQL or browser.
for(const [code,status,text]of[['OWN_ANNUL_PREPARATION_CURRENT_STATE_CHANGED',409,'Cambió una liquidación del alcance anulado'],['OWN_ANNUL_PREPARATION_NOT_FOUND',404,'No se encontró la anulación en tu ámbito municipal'],['OWN_ANNUL_PREPARATION_LIMIT',422,'supera la capacidad de lectura'],['OWN_ANNUL_PREPARATION_UNAVAILABLE',503,'No se pudo consultar la preparación']])test('a rejected209 read reports its own cause, keeps the reference and never mentions an attempt: '+code,async t=>{
 const h=harness(t);h.state.projectionFailure={status,code,error:'synthetic server text the panel must not echo'};assert.equal(h.queuePreparation(reference(h)),true);await h.start();
 assert.equal(purposeReads(h).length,1);assert.match(h.q('status').textContent,new RegExp(text));assert.doesNotMatch(h.q('status').textContent,/intento/);assert.doesNotMatch(h.q('status').textContent,/synthetic server text/);
 assert.equal(h.q('projected-preparation').hidden,false);assert.equal(h.q('projected-load').disabled,false);assert.equal(h.q('projected-date').options.length,1);assert.equal(h.q('projected-use').disabled,true);assert.equal(h.q('chips').children.length,0);assert.equal(h.q('confirm').checked,false);assert.equal(posts(h).length,0);assertNoHistoricalAuthority(h);
 // Once the annulled scope is current again the same reference loads completely.
 h.state.projectionFailure=null;await h.q('projected-load').emit('click');await h.idle();assert.equal(purposeReads(h).length,2);assert.equal(h.q('projected-date').options.length,4);assert.equal(h.q('projected-date').value,'');assert.equal(h.q('confirm').checked,false);assert.equal(posts(h).length,0);
});

const withLocation=t=>{const assigned=[],previous=Object.getOwnPropertyDescriptor(globalThis,'location');Object.defineProperty(globalThis,'location',{configurable:true,writable:true,value:{assign:target=>assigned.push(target)}});t.after(()=>{if(previous)Object.defineProperty(globalThis,'location',previous);else delete globalThis.location;});return assigned;};

test('an unauthenticated preparer keeps the source-only reference through the login destination',async t=>{
 const h=harness(t),assigned=withLocation(t);h.state.authFailure=401;assert.equal(h.queuePreparation(reference(h)),true);await h.start();
 assert.equal(h.q('login').hidden,false);assert.equal(purposeReads(h).length,0);assert.equal(posts(h).length,0);
 await h.q('login').emit('click');assert.deepEqual(assigned,['/acceso?next='+encodeURIComponent('/nomina?anulacion='+h.state.projection.source.id+'#calculo')]);
 const next=new URL(assigned[0],'https://example.invalid').searchParams.get('next'),target=new URL(next,'https://example.invalid');
 assert.equal(target.pathname,'/nomina');assert.equal(target.hash,'#calculo');assert.deepEqual([...target.searchParams],[['anulacion',h.state.projection.source.id]]);assert.doesNotMatch(next,/key|accessKey|actor|scopeVersion|consent/i);
});

test('without a queued reference the login destination is unchanged',async t=>{
 const h=harness(t),assigned=withLocation(t);h.state.authFailure=401;await h.start();assert.equal(h.q('login').hidden,false);
 await h.q('login').emit('click');assert.deepEqual(assigned,['/acceso?next=%2Fnomina%23calculo']);assert.equal(posts(h).length,0);
});

// Proposed causal tests: INDIVIDUAL annul → recalculation across two users.
// Reviewer R (approve, no prepare) annulled three contracts of a run that
// preparer P created; P holds only the opaque run+decision reference and her
// own session. HTTP stays synthetic; the later calculation is an explicit POST.
const decisionId=uid(700);
function decisionDetail(count=6,annulled=3){
 const d=liquidationDetail(count);d.reviewAccessRequired=false;
 for(const [index,e]of d.employees.slice(0,annulled).entries()){e.state='annulled';e.version=2;e.liquidationVersion=1;e.allowedCommands=[];e.events=[{id:uid(100000+index),command:'confirm',version:1,liquidationVersion:1,recordedAt:'2026-10-08T12:00:00Z',actorLabel:'Revisor sintético',reason:'Confirmación exclusivamente sintética'},{id:decisionId,command:'annul',version:2,liquidationVersion:1,recordedAt:'2026-10-08T12:01:00Z',actorLabel:'Revisor sintético',reason:'Anulación exclusivamente sintética'}];}
 return d;
}
const decisionReference=h=>({kind:'projected_decision',runId:h.state.decision.detail.id,decisionId});
const liquidationReads=h=>h.requests.filter(r=>r.url.startsWith('/api/internal-own-payroll-liquidation?'));
const assertOwnAuthorisedReadOnly=h=>{for(const r of liquidationReads(h)){assert.equal(r.method,'GET');const query=new URL(r.url,'https://example.invalid').searchParams;assert.deepEqual([...query.keys()],['resource','id']);assert.equal(query.get('resource'),'detail');assert.equal(query.get('id'),h.state.decision.detail.id);}assert.ok(h.requests.every(r=>!r.url.includes('resource=attempt')&&!r.url.startsWith('/api/internal-own-payroll-annulment')));};

test('another preparer rebuilds the annulled decision from her own authenticated run read, without receipt, key or POST, then calculates explicitly',async t=>{
 const h=harness(t);h.state.decision={detail:decisionDetail(),failure:null};assert.equal(h.queuePreparation(decisionReference(h)),true);await h.start();
 const d=h.state.decision.detail,expected=d.employees.slice(0,3);
 assert.equal(h.q('chips').children.length,3);for(const e of expected)assert.match(h.q('chips').textContent,new RegExp('Legajo '+d.capture.saved.input.employees.find(p=>p.contractId===e.contractId).employeeNumber+' '));
 for(const e of d.employees.slice(3))assert.ok(!h.q('chips').textContent.includes(d.capture.saved.input.employees.find(p=>p.contractId===e.contractId).employeeNumber));
 assert.equal(h.q('period').value,d.capture.body.period);assert.equal(h.q('type').value,d.capture.body.liquidationType);assert.equal(h.q('date').value,d.capture.body.liquidationDate??'');assert.equal(h.q('kind').value,'contracts');
 assert.equal(h.q('confirm').checked,false);assert.equal(h.q('send').disabled,true);assert.equal(h.q('projected-preparation').hidden,true);assert.match(h.q('status').textContent,/Se prepararon los 3 legajos exactos de la anulación/);
 assert.equal(liquidationReads(h).length,1);assert.equal(purposeReads(h).length,0);assert.equal(posts(h).length,0);assertOwnAuthorisedReadOnly(h);
 // The historical run declared no date: the preparer completes one herself.
 h.q('date').value='2026-10-31';await h.q('date').emit('change');h.q('confirm').checked=true;await h.q('confirm').emit('change');await h.submit();assert.equal(posts(h).length,1);const body=JSON.parse(posts(h)[0].body).payload;
 assert.deepEqual(body.selection,{kind:'contracts',values:expected.map(e=>e.contractId).sort()});assert.equal(body.period,d.capture.body.period);assert.equal(body.liquidationDate,'2026-10-31');for(const secret of ['sourceReference','decisionId','receiptKey','accessKey'])assert.equal(Object.hasOwn(body,secret),false);
});

test('without prepare the reference reads nothing nominal and is kept; with prepare the same reference loads',async t=>{
 const h=harness(t);h.state.decision={detail:decisionDetail(),failure:null};h.state.caps=[...OWN_RUN_NOMINAL];assert.equal(h.queuePreparation(decisionReference(h)),true);await h.start();
 assert.equal(liquidationReads(h).length,0);assert.equal(h.q('chips').children.length,0);assert.equal(posts(h).length,0);
 h.state.caps=[...OWN_RUN_PREPARE];await h.refresh();assert.equal(liquidationReads(h).length,1);assert.equal(h.q('chips').children.length,3);assert.equal(h.q('confirm').checked,false);assert.equal(posts(h).length,0);assertOwnAuthorisedReadOnly(h);
});

test('a run the preparer may not read (403) transfers nothing, keeps the reference and never falls back to the reviewer attempt',async t=>{
 const h=harness(t);h.state.decision={detail:decisionDetail(),failure:{status:403,code:'OWN_LIQ_FORBIDDEN'}};assert.equal(h.queuePreparation(decisionReference(h)),true);await h.start();
 assert.equal(liquidationReads(h).length,1);assert.match(h.q('status').textContent,/sólo quien la creó o quien tiene acceso de revisión/);assert.match(h.q('status').textContent,/Se conserva la referencia/);assert.doesNotMatch(h.q('status').textContent,/intento/);assert.equal(h.q('chips').children.length,0);assert.equal(h.q('login').hidden,true);assert.equal(posts(h).length,0);assertOwnAuthorisedReadOnly(h);
 h.state.decision.failure=null;await h.refresh();assert.equal(liquidationReads(h).length,2);assert.equal(h.q('chips').children.length,3);assert.equal(posts(h).length,0);
});

test('another confirmed liquidation of one contract blocks the whole decision without a partial draft',async t=>{
 const h=harness(t);const d=decisionDetail();d.employees[1].blockedBy=uid(880);h.state.decision={detail:d,failure:null};assert.equal(h.queuePreparation(decisionReference(h)),true);await h.start();
 assert.equal(liquidationReads(h).length,1);assert.match(h.q('status').textContent,/otra liquidación confirmada/);assert.equal(h.q('chips').children.length,0);assert.equal(h.q('kind').value,'');assert.equal(posts(h).length,0);assertOwnAuthorisedReadOnly(h);
});

test('a decision id that belongs to a confirmation or to no contract of the run prepares nothing',async t=>{
 for(const change of [d=>{for(const e of d.employees.slice(0,3)){e.events=[{...e.events[0],id:decisionId}];e.state='confirmed';e.version=1;e.allowedCommands=['annul'];}},d=>{for(const e of d.employees.slice(0,3))e.events[1].id=uid(701);}]){
  const h=harness(t);const d=decisionDetail();change(d);h.state.decision={detail:d,failure:null};assert.equal(h.queuePreparation(decisionReference(h)),true);await h.start();
  assert.equal(liquidationReads(h).length,1);assert.match(h.q('status').textContent,/No se pudo verificar la decisión y el alcance completo/);assert.equal(h.q('chips').children.length,0);assert.equal(posts(h).length,0);
 }
});

test('the decision reference survives the login destination and hiding the page retires the draft',async t=>{
 const h=harness(t),assigned=withLocation(t);h.state.decision={detail:decisionDetail(),failure:null};h.state.authFailure=401;assert.equal(h.queuePreparation(decisionReference(h)),true);await h.start();
 assert.equal(h.q('login').hidden,false);assert.equal(liquidationReads(h).length,0);await h.q('login').emit('click');
 assert.deepEqual(assigned,['/acceso?next='+encodeURIComponent('/nomina?corrida='+h.state.decision.detail.id+'&decision='+decisionId+'#calculo')]);assert.doesNotMatch(assigned[0],/key|accessKey|actor|legajo/i);
 h.state.authFailure=null;await h.refresh();assert.equal(h.q('chips').children.length,3);
 h.document.hidden=true;h.event('visibilitychange');assert.equal(h.q('chips').children.length,0);assert.equal(h.q('confirm').checked,false);assert.equal(posts(h).length,0);
});

// R2: a rejected run read names its cause, never an attempt, and keeps the
// reference. Before R2 404/503/422 fell into «Consultá el mismo intento».
for(const [code,status,text]of[['OWN_LIQ_NOT_FOUND',404,'No se encontró la corrida de la referencia'],['OWN_LIQ_UNAVAILABLE',503,'No se pudo leer la corrida de la referencia'],['OWN_LIQ_CONTRACT_INVALID',503,'No se pudo verificar la corrida de la referencia'],['OWN_LIQ_LIMIT',422,'supera la capacidad de lectura']])test('a rejected run read reports its own cause, keeps the reference and never mentions an attempt: '+code,async t=>{
 const h=harness(t);h.state.decision={detail:decisionDetail(),failure:{status,code}};assert.equal(h.queuePreparation(decisionReference(h)),true);await h.start();
 assert.equal(liquidationReads(h).length,1);assert.match(h.q('status').textContent,new RegExp(text));assert.match(h.q('status').textContent,/[Ss]e conserva la referencia/);assert.doesNotMatch(h.q('status').textContent,/intento|reintent|descart/);assert.doesNotMatch(h.q('status').textContent,/synthetic server text/);
 assert.equal(h.q('chips').children.length,0);assert.equal(h.q('kind').value,'');assert.equal(h.q('confirm').checked,false);assert.equal(h.q('login').hidden,true);assert.equal(posts(h).length,0);assertOwnAuthorisedReadOnly(h);
 // The reference is kept: once the run is readable again, the same reference loads.
 h.state.decision.failure=null;await h.refresh();assert.equal(liquidationReads(h).length,2);assert.equal(h.q('chips').children.length,3);assert.equal(h.q('confirm').checked,false);assert.equal(posts(h).length,0);
});
