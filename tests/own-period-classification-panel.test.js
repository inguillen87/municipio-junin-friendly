// Executes the actual panel and model against an in-memory DOM and synthetic API
// responses. Browser layout and municipal acceptance require separate checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mountOwnPeriodClassification } from '../assets/own-period-classification-panel.js';
import * as model from '../assets/own-period-classification-model.js';

const id=n=>'aaaaaaaa-0000-4000-8000-'+String(n).padStart(12,'0');
const sha=n=>String(n).repeat(64),version='own-period-classification.v1';
const definition=()=>({agreementCode:'01',categoryCode:'007',organizationId:'008',sectorCode:'009',jurisdictionCode:'42',startDate:'2020-02-29',endDate:null,effectiveFrom:'2026-09-01',effectiveUntil:'2026-09-30',documentDate:'2026-10-14',documentReference:'Constancia retrospectiva exclusivamente sintética QA'});
const provenance=()=>({kind:'native_registration',registrationId:id(5),requestSha256:sha('a')});
const preparation=()=>({version,scope:{tenantId:id(1),bindingId:id(2),companyId:901},contractId:id(3),period:'2026-09',scopeVersion:sha('5'),baseVersion:sha('6'),source:{version:sha('2'),scope:{tenantId:id(1),bindingId:id(2),companyId:901},period:'2026-09',subject:{origin:'MUNICONTROL',contractId:id(3),personId:id(4),registrationId:id(5),identityToken:sha('3')},provenance:provenance()},classification:{version:sha('4'),items:[
 {kind:'agreements',key:'synthetic-agreement',code:'01',label:'Convenio sintético',agreementCode:null,registrationAllowed:false},
 {kind:'categories',key:'synthetic-category',code:'007',label:'Clase sintética',agreementCode:'01',registrationAllowed:false},
 {kind:'organizations',key:'synthetic-organization',code:'008',label:'Sector sintético',agreementCode:null,registrationAllowed:false},
 {kind:'sectors',key:'synthetic-department',code:'009',label:'Repartición sintética',agreementCode:null,registrationAllowed:false}
 ]},canPropose:true});
const configuration=()=>({version:sha('6'),revision:0,definition:null,proposalId:null,approvalId:null,sourceVersion:null,identityToken:null,provenance:null,classificationVersion:null});
const bootstrap=()=>({version,preparation:preparation(),configuration:configuration(),proposals:[],permissions:{canPropose:true,canReview:true},complete:true,payrollCalculated:false,payrollPosted:false});
const capList=['workforce.employee.read','payroll.parameter.read','payroll.parameter.prepare','payroll.parameter.approve'];
const selected={contractId:id(3),recordOrigin:'MUNICONTROL',legajo:'9001',nombre:'PERSONA EXCLUSIVAMENTE SINTÉTICA QA'};
const reason='Encuadre documentado exclusivamente sintético QA';
const settle=()=>new Promise(resolve=>setImmediate(resolve));

class Element{
 constructor(tag='div'){this.tagName=tag.toLowerCase();this.children=[];this.parentElement=null;this.attributes={};this.dataset={};this.listeners=new Map();this.hidden=false;this.disabled=false;this.checked=false;this._value=undefined;this._text='';this.isConnected=true;}
 append(...items){for(const item of items){item.parentElement=this;this.children.push(item);}}
 replaceChildren(...items){this.children=[];this._text='';this.append(...items);}
 setAttribute(name,value){this.attributes[name.toLowerCase()]=String(value);if(name==='hidden')this.hidden=true;if(name==='disabled')this.disabled=true;}
 getAttribute(name){return this.attributes[name.toLowerCase()]??null;}
 get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
 set textContent(value){this._text=String(value);this.children=[];}
 get options(){return this.tagName==='select'?this.children:[];}
 get value(){return this._value??(this.tagName==='select'?this.children[0]?.value??'':'');}
 set value(value){const s=String(value);this._value=this.tagName==='select'&&!this.children.some(o=>o.value===s)?'':s;}
 set innerHTML(html){this.replaceChildren();const stack=[this];for(const token of html.match(/<[^>]*>|[^<]+/g)??[]){if(token.startsWith('</')){stack.pop();continue;}if(token.startsWith('<')){const m=token.match(/^<([a-z][\w-]*)\b([^>]*)>/i);if(!m)continue;const element=new Element(m[1]);for(const a of m[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))element.setAttribute(a[1],a[2]??'');if(element.tagName==='input')element.type=element.getAttribute('type');if(element.tagName==='option')element._value=element.getAttribute('value')??'';stack.at(-1).append(element);if(!['input','link','br','hr','meta'].includes(element.tagName)&&!token.endsWith('/>'))stack.push(element);}else{const text=new Element('#text');text._text=token;stack.at(-1).append(text);}}}
 querySelector(selector){const attr=selector.match(/^(?:([\w-]+))?\[([\w-]+)(?:="([^"]*)")?\]$/),match=n=>attr?(!attr[1]||n.tagName===attr[1])&&Object.hasOwn(n.attributes,attr[2].toLowerCase())&&(attr[3]===undefined||n.attributes[attr[2].toLowerCase()]===attr[3]):n.tagName===selector;const walk=n=>{for(const child of n.children){if(match(child))return child;const nested=walk(child);if(nested)return nested;}return null;};return walk(this);}
 addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(fn);}
 removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)??[]).filter(f=>f!==fn));}
 async emit(type){for(let n=this;n;n=n.parentElement)if(n.disabled)return;await Promise.all((this.listeners.get(type)??[]).map(fn=>fn({target:this})));}
}
const events=()=>{const listeners=new Map();return {addEventListener:(type,fn)=>{if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},removeEventListener:(type,fn)=>listeners.set(type,(listeners.get(type)??[]).filter(f=>f!==fn)),dispatch:(type,detail)=>{for(const fn of listeners.get(type)??[])fn({detail});}};};

function harness(t){
 const root=new Element(),head=new Element('head'),body=new Element('body'),docEvents=events(),winEvents=events(),requests=[],timers=new Map();let timer=0,pickerOptions=null;
 const state={caps:[...capList],sessionId:'synthetic-session-1',actorEmail:'synthetic@example.test',tenantId:id(1),roleKey:'synthetic-role',attemptError:null,authFailure:null,bootstrapError:null,poll:null,boot:bootstrap(),detail:null,hold:null,postFailure:false,postError:null,receipt:null,missing:false,malformed:false,authCount:0,onAuth:null,onPost:null};
 const document={...docEvents,hidden:false,head,body,createElement:tag=>new Element(tag),querySelector:selector=>head.querySelector(selector)};
 const names=['document','window','fetch','Option','setTimeout','clearTimeout','setInterval','clearInterval','location','crypto'],before=new Map(names.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 Object.assign(globalThis,{document,window:winEvents,Option:class extends Element{constructor(text,value){super('option');this.textContent=text;this._value=value;}},setTimeout:fn=>{timers.set(++timer,fn);return timer;},clearTimeout:k=>timers.delete(k),setInterval:fn=>{state.poll=fn;timers.set(++timer,fn);return timer;},clearInterval:k=>timers.delete(k),location:{pathname:'/nomina',hash:'#encuadre',assign(){}}});
 globalThis.fetch=async(url,options={})=>{requests.push({url,method:options.method??'GET',body:options.body,headers:options.headers});let status=200,data;if(url==='/api/internal-auth'){state.authCount++;await state.onAuth?.(state.authCount);if(state.authFailure==='network')throw Error('Fallo de red de autenticación exclusivamente sintético');if(state.authFailure==='abort')throw Object.assign(Error('Lectura de autoridad sintética abortada'),{name:'AbortError'});if(state.authFailure==='json')return new Response('{',{status:200});if(state.authFailure==='envelope')return new Response(JSON.stringify({ok:true,authenticated:false}),{status:200});if(state.authFailure==='server')return new Response(JSON.stringify({ok:false,code:'SYNTHETIC_AUTH_UNAVAILABLE',error:'Autoridad sintética no disponible'}),{status:503});data={ok:true,authenticated:true,sessionVersion:2,user:{id:state.sessionId,email:state.actorEmail},access:{context:'tenant',tenant:{id:state.tenantId,roleKey:state.roleKey},tenantCapabilities:state.caps},expiresAt:'2099-01-01T00:00:00Z'};}else{assert.ok(url.startsWith('/api/internal-own-period-classification'));await state.hold?.(url,options);if(options.method==='POST'){const payload=JSON.parse(options.body).payload;if(state.postFailure)throw Error('Fallo de red exclusivamente sintético QA');if(state.postError){status=state.postError.status;data={ok:false,code:state.postError.code,error:'Rechazo de envío exclusivamente sintético QA'};}else{data={ok:true,data:await receipt(payload,options.headers['Idempotency-Key'])};await state.onPost?.(data.data);}}else{const u=new URL(url,'https://synthetic.example.test');switch(u.searchParams.get('resource')){case 'bootstrap':if(state.bootstrapError){status=state.bootstrapError.status;data={ok:false,code:state.bootstrapError.code,error:'Consulta de negocio sintética no disponible'};}else data={ok:true,data:structuredClone(state.boot)};break;case 'detail':data={ok:true,data:structuredClone(state.detail)};break;case 'attempt':if(state.attemptError){status=state.attemptError.status;data={ok:false,code:state.attemptError.code,error:'Consulta sintética rechazada'};}else if(state.missing){status=404;data={ok:false,code:'PERIOD_CLASSIFICATION_NOT_FOUND',error:'Intento sintético no encontrado'};}else data={ok:true,data:structuredClone(state.receipt)};break;default:assert.fail('Unknown resource');}}}return new Response(state.malformed?'not JSON':JSON.stringify(data),{status});};
 async function receipt(payload,key){return {version,eventId:payload.command==='propose'?id(21):id(20),proposalId:payload.proposalId??id(21),requestKey:key,requestSha256:await model.periodClassificationHash(payload),body:payload,status:payload.command==='approve'?'approved':payload.command==='reject'?'rejected':'pending',revision:payload.command==='approve'?1:0,configurationVersion:payload.command==='approve'?sha('8'):payload.baseVersion,replayed:false,payrollCalculated:false,payrollPosted:false};}
 const mounted=mountOwnPeriodClassification(root,{createPicker:options=>{pickerOptions=options;return {close(){},open(options){state.pickerUse=options.onUse;}};}});
 const q=key=>{const found=root.querySelector('[data-classification-'+key+']');assert.ok(found,'actual panel control '+key);return found;};
 const start=async()=>{docEvents.dispatch('taskchange',{id:'encuadre'});await settle();await q('picker').emit('click');state.pickerUse([structuredClone(selected)]);q('period').value='2026-09';await q('period').emit('change');await q('refresh').emit('click');};
 const edit=async(patch={})=>{for(const [key,value]of Object.entries({...definition(),...patch})){q(key).value=value??'';await q(key).emit('input');}q('reason').value=reason;await q('reason').emit('input');};
 const prepare=async(patch={})=>{await edit(patch);await q('prepare').emit('click');q('confirm').checked=true;await q('confirm').emit('change');};
 const proposal=async({canReview=true,patch={},current=true}={})=>{const p=state.boot.preparation,b=model.preparePeriodClassification(p,{...definition(),...patch},reason),s={id:id(21),requestSha256:await model.periodClassificationHash(b),baseVersion:b.baseVersion,sourceVersion:b.sourceVersion,classificationVersion:b.classificationVersion,reason:b.reason,createdAt:'2026-10-14T12:00:00Z',authorLabel:'Otra persona sintética QA',canReview,status:'pending',decision:null};state.boot.proposals=[s];state.detail={version,scopeVersion:p.scopeVersion,proposal:s,body:b,baseDefinition:null,source:p.source,classification:p.classification,current};};
 const hide=()=>{document.hidden=true;docEvents.dispatch('visibilitychange');},show=()=>{document.hidden=false;docEvents.dispatch('visibilitychange');};
 t.after(()=>{mounted.dispose();for(const [key,descriptor]of before)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
 return {root,q,state,requests,start,edit,prepare,proposal,hide,show,event:docEvents.dispatch,mounted,pickerOptions:()=>pickerOptions,receipt,poll:async()=>{assert.equal(typeof state.poll,'function');state.poll();const panel=root.children[0];for(let i=0;i<100&&panel.getAttribute('aria-busy')!=='false';i++)await settle();assert.equal(panel.getAttribute('aria-busy'),'false');}};
}

const renewedClassificationSession='dddddddd-0000-4000-8000-000000000002';
const classificationWrites=h=>h.requests.filter(r=>r.method==='POST');
const classificationLookups=h=>h.requests.filter(r=>r.url.includes('resource=attempt'));
async function uncertainClassification(t,command='propose'){
 const h=harness(t);if(command!=='propose')await h.proposal();await h.start();
 if(command==='propose')await h.prepare();else{h.q('proposal').value=id(21);await h.q('open').emit('click');h.q('decision').value=command;h.q('decision-reason').value='Decisión de encuadre exclusivamente sintética QA';await h.q('review').emit('click');h.q('confirm').checked=true;await h.q('confirm').emit('change');}
 h.state.onPost=value=>{h.state.receipt={...structuredClone(value),replayed:true};throw Error('Acuse sintético perdido después de conservar el resultado');};
 await h.q('send').emit('click');h.state.onPost=null;const original=structuredClone(classificationWrites(h)[0]);assert.ok(original);assert.equal(h.q('receipt').hidden,true);assert.equal(h.q('recover').hidden,false);return{h,original};
}
async function rejectedClassification(t){
 const h=harness(t);await h.start();await h.prepare();h.state.postError={status:422,code:'PERIOD_CLASSIFICATION_NO_CHANGES'};await h.q('send').emit('click');const original=structuredClone(classificationWrites(h)[0]);h.state.missing=true;await h.q('recover').emit('click');assert.equal(h.q('correct').hidden,false);return{h,original};
}

function assertClassificationAuthorityWithdrawn(h){
 assert.equal(h.q('content').hidden,true);assert.equal(h.q('comparison').hidden,true);assert.equal(h.q('provenance').textContent,'');assert.equal(h.q('subject').textContent,'No hay un legajo seleccionado.');assert.equal(h.q('startDate').value,'');assert.equal(h.q('reason').value,'');assert.equal(h.q('agreementCode').options.length,1);assert.equal(h.q('categoryCode').options.length,1);assert.equal(h.q('fields').disabled,true);assert.equal(h.q('target').disabled,true);assert.equal(h.q('send').hidden,true);assert.equal(h.q('receipt').hidden,true);assert.equal(h.q('receipt').textContent,'');assert.equal(h.q('previous').hidden,true);
}

for(const failure of ['network','abort','json','server','envelope'])test('unverified authority '+failure+': idle poll masks the view and preserves the same-context draft for a fresh read',async t=>{
 const h=harness(t);await h.start();await h.prepare();h.state.authFailure=failure;await h.poll();assertClassificationAuthorityWithdrawn(h);assert.equal(classificationWrites(h).length,0);
 h.state.authFailure=null;await h.q('access').emit('click');await h.q('refresh').emit('click');assert.equal(h.q('content').hidden,false,h.q('status').textContent);for(const[key,value]of Object.entries(definition()))assert.equal(h.q(key).value,value??'');assert.equal(h.q('reason').value,reason);assert.equal(h.q('confirm').checked,false);assert.equal(h.q('send').hidden,true);assert.equal(classificationWrites(h).length,0);
});

for(const failure of ['network','abort','json','server','envelope'])test('unverified authority '+failure+': final auth after GET masks the result while retaining the exact attempt',async t=>{
 const{h,original}=await uncertainClassification(t);h.state.hold=url=>{if(url.includes('resource=attempt'))h.state.authFailure=failure;};await h.q('recover').emit('click');assertClassificationAuthorityWithdrawn(h);assert.equal(classificationLookups(h).length,1);assert.deepEqual(classificationWrites(h),[original]);assert.equal(h.q('retry').hidden,true);
 h.state.authFailure=null;h.state.hold=null;await h.q('access').emit('click');await h.q('recover').emit('click');assert.equal(h.q('receipt').hidden,false,h.q('status').textContent);assert.equal(classificationLookups(h).length,2);assert.deepEqual(classificationWrites(h),[original]);
});

for(const failure of ['network','json'])test('unverified authority '+failure+': after POST hides all data and later GET recovers its conserved outcome',async t=>{
 const h=harness(t);await h.start();await h.prepare();h.state.onPost=value=>{h.state.receipt={...structuredClone(value),replayed:true};h.state.authFailure=failure;};await h.q('send').emit('click');assertClassificationAuthorityWithdrawn(h);const original=structuredClone(classificationWrites(h)[0]);assert.ok(original);
 h.state.onPost=null;h.state.authFailure=null;await h.q('access').emit('click');await h.q('recover').emit('click');assert.equal(h.q('receipt').hidden,false,h.q('status').textContent);assert.equal(classificationLookups(h).length,1);assert.deepEqual(classificationWrites(h),[original]);
});

test('unverified authority during original hash reauthorization keeps one unposted key for explicit404 and retry',async t=>{
 const h=harness(t);await h.start();await h.prepare();const real=globalThis.crypto;let first=true,allocations=0;Object.defineProperty(globalThis,'crypto',{configurable:true,value:{randomUUID:()=>{allocations++;return id(91);},subtle:{digest:async(...args)=>{const value=await real.subtle.digest(...args);if(first){first=false;h.state.authFailure='network';}return value;}}}});
 await h.q('send').emit('click');assertClassificationAuthorityWithdrawn(h);assert.equal(classificationWrites(h).length,0);assert.equal(allocations,1);h.state.authFailure=null;h.state.missing=true;await h.q('access').emit('click');await h.q('recover').emit('click');assert.equal(h.q('retry').disabled,false);await h.q('retry').emit('click');assert.equal(classificationWrites(h).length,1);assert.equal(classificationWrites(h)[0].headers['Idempotency-Key'],id(91));assert.equal(allocations,1);assert.deepEqual(JSON.parse(classificationWrites(h)[0].body).payload.definition,definition());
});

for(const failure of ['server','json'])test('unverified authority '+failure+': final correction auth cannot release the original or expose a new draft',async t=>{
 const{h,original}=await rejectedClassification(t),correctionStart=h.requests.length;h.state.onAuth=()=>{const current=h.requests.slice(correctionStart);if(current.some(r=>r.url.includes('resource=bootstrap'))&&current.some(r=>r.url.includes('resource=attempt')))h.state.authFailure=failure;};await h.q('correct').emit('click');assertClassificationAuthorityWithdrawn(h);assert.equal(h.q('correct').hidden,true);assert.deepEqual(classificationWrites(h),[original]);
 h.state.onAuth=null;h.state.authFailure=null;await h.q('access').emit('click');await h.q('recover').emit('click');assert.equal(h.q('correct').hidden,false);await h.q('correct').emit('click');assert.equal(h.q('fields').disabled,false,h.q('status').textContent);assert.equal(h.q('previous').hidden,false);assert.match(h.q('previous').textContent,new RegExp(original.headers['Idempotency-Key']));assert.equal(h.q('confirm').checked,false);assert.equal(h.q('send').hidden,true);assert.deepEqual(classificationWrites(h),[original]);
});

test('verified authority with a business bootstrap503 keeps documentary inputs and retires only its comparison',async t=>{
 const h=harness(t);await h.start();await h.prepare();h.state.bootstrapError={status:503,code:'PERIOD_CLASSIFICATION_UNAVAILABLE'};await h.q('refresh').emit('click');assert.equal(h.q('content').hidden,false);for(const[key,value]of Object.entries(definition()))assert.equal(h.q(key).value,value??'');assert.equal(h.q('reason').value,reason);assert.equal(h.q('comparison').hidden,true);assert.equal(h.q('fields').disabled,false);assert.equal(classificationWrites(h).length,0);
});

test('verified authority with a business POST503 keeps its original uncertain command distinct from auth withdrawal',async t=>{
 const h=harness(t);await h.start();await h.prepare();h.state.postError={status:503,code:'PERIOD_CLASSIFICATION_UNAVAILABLE'};await h.q('send').emit('click');assert.equal(h.q('content').hidden,false);assert.equal(h.q('documentReference').value,definition().documentReference);assert.equal(h.q('receipt').hidden,true);assert.equal(h.q('recover').hidden,false);assert.equal(h.q('correct').hidden,true);assert.equal(classificationWrites(h).length,1);
});

for(const command of ['propose','approve','reject'])test('renewed session: original '+command+' receipt preserves the complete body and provenance without another POST',async t=>{
 const{h,original}=await uncertainClassification(t,command);h.state.sessionId=renewedClassificationSession;await h.q('recover').emit('click');assert.equal(classificationLookups(h).length,1);assert.equal(new URL(classificationLookups(h)[0].url,'https://synthetic.test').searchParams.get('key'),original.headers['Idempotency-Key']);assert.equal(classificationWrites(h).length,1);assert.deepEqual(classificationWrites(h)[0],original);assert.equal(h.q('receipt').hidden,false,h.q('status').textContent);
 const body=JSON.parse(original.body).payload;assert.equal(body.command,command);assert.deepEqual(body.provenance,command==='propose'?provenance():null);assert.deepEqual(body.definition,command==='propose'?definition():null);assert.equal(body.reviewConfirmed,command!=='propose');
});

test('renewed session: a non-persisted attempt needs its own current404 before identical replay',async t=>{
 const h=harness(t);await h.start();await h.prepare();h.state.postFailure=true;await h.q('send').emit('click');const original=structuredClone(classificationWrites(h)[0]);h.state.missing=true;await h.q('recover').emit('click');h.state.sessionId=renewedClassificationSession;await h.q('retry').emit('click');assert.equal(classificationWrites(h).length,1);assert.equal(h.q('retry').hidden,true);
 await h.q('recover').emit('click');assert.equal(classificationLookups(h).length,2);assert.equal(h.q('retry').disabled,false);h.state.postFailure=false;await h.q('retry').emit('click');assert.deepEqual(classificationWrites(h)[1],original);assert.equal(h.q('receipt').hidden,false);
});

for(const [label,change]of [['email',s=>s.actorEmail='other@example.test'],['tenant',s=>s.tenantId=id(999)],['role',s=>s.roleKey='OTHER']])test('renewed session: another '+label+' cannot retrieve the original key; returning owner can',async t=>{
 const{h,original}=await uncertainClassification(t);change(h.state);await h.q('recover').emit('click');assert.equal(classificationLookups(h).length,0);assert.equal(h.q('receipt').hidden,true);
 h.state.actorEmail='synthetic@example.test';h.state.tenantId=id(1);h.state.roleKey='synthetic-role';h.state.sessionId=renewedClassificationSession;await h.q('access').emit('click');await h.q('recover').emit('click');assert.equal(classificationLookups(h).length,1);assert.equal(h.q('receipt').hidden,false,h.q('status').textContent);assert.deepEqual(classificationWrites(h),[original]);
});

test('renewed session: change during GET retires the result and a later403 cannot acknowledge it',async t=>{
 const{h}=await uncertainClassification(t);h.state.hold=url=>{if(url.includes('resource=attempt')){h.state.hold=null;h.state.sessionId=renewedClassificationSession;}};await h.q('recover').emit('click');assert.equal(h.q('receipt').hidden,true);assert.equal(h.q('new').hidden,true);
 h.state.attemptError={status:403,code:'PERIOD_CLASSIFICATION_FORBIDDEN'};await h.q('recover').emit('click');assert.equal(classificationLookups(h).length,2);assert.equal(h.q('receipt').hidden,true);h.state.attemptError=null;await h.q('access').emit('click');await h.q('recover').emit('click');assert.equal(h.q('receipt').hidden,false);assert.equal(classificationWrites(h).length,1);
});

test('renewed session: change during404 cannot enable replay until a fresh lookup',async t=>{
 const h=harness(t);await h.start();await h.prepare();h.state.postFailure=true;await h.q('send').emit('click');const original=structuredClone(classificationWrites(h)[0]);h.state.missing=true;h.state.hold=url=>{if(url.includes('resource=attempt')){h.state.hold=null;h.state.sessionId=renewedClassificationSession;}};
 await h.q('recover').emit('click');assert.equal(h.q('retry').hidden,true);await h.q('recover').emit('click');assert.equal(classificationLookups(h).length,2);assert.equal(h.q('retry').disabled,false);h.state.postFailure=false;await h.q('retry').emit('click');assert.deepEqual(classificationWrites(h)[1],original);
});

test('renewed session: change after POST keeps its original outcome uncertain until GET',async t=>{
 const h=harness(t);await h.start();await h.prepare();h.state.onPost=value=>{h.state.receipt={...structuredClone(value),replayed:true};h.state.sessionId=renewedClassificationSession;};await h.q('send').emit('click');h.state.onPost=null;assert.equal(h.q('receipt').hidden,true);await h.q('recover').emit('click');assert.equal(h.q('receipt').hidden,false,h.q('status').textContent);assert.equal(classificationWrites(h).length,1);
});

test('renewed session: change during initial attempt hash must be reauthorized before any POST',async t=>{
 const h=harness(t);await h.start();await h.prepare();const real=globalThis.crypto;let allocations=0,first=true;Object.defineProperty(globalThis,'crypto',{configurable:true,value:{randomUUID:()=>{allocations++;return id(90);},subtle:{digest:async(...args)=>{const value=await real.subtle.digest(...args);if(first){first=false;h.state.sessionId=renewedClassificationSession;}return value;}}}});
 await h.q('send').emit('click');assert.equal(classificationWrites(h).length,0);assert.equal(allocations,1);h.state.missing=true;await h.q('recover').emit('click');assert.equal(h.q('retry').disabled,false);await h.q('retry').emit('click');assert.equal(classificationWrites(h).length,1);assert.equal(classificationWrites(h)[0].headers['Idempotency-Key'],id(90));assert.equal(allocations,1);assert.deepEqual(JSON.parse(classificationWrites(h)[0].body).payload.provenance,provenance());
});

test('renewed session: change during receipt hash cannot expose the retired acknowledgement',async t=>{
 const h=harness(t);await h.start();await h.prepare();const real=globalThis.crypto;let digests=0;Object.defineProperty(globalThis,'crypto',{configurable:true,value:{randomUUID:()=>real.randomUUID(),subtle:{digest:async(...args)=>{const value=await real.subtle.digest(...args);if(++digests===4)h.state.sessionId=renewedClassificationSession;return value;}}}});h.state.onPost=value=>{h.state.receipt={...structuredClone(value),replayed:true};};
 await h.q('send').emit('click');h.state.onPost=null;assert.equal(digests,4);assert.equal(h.q('receipt').hidden,true);await h.q('recover').emit('click');assert.equal(h.q('receipt').hidden,false,h.q('status').textContent);assert.equal(classificationWrites(h).length,1);
});

test('renewed session: explicit correction keeps the old reference visible and requires a new review and consent',async t=>{
 const{h,original}=await rejectedClassification(t);h.state.sessionId=renewedClassificationSession;await h.q('correct').emit('click');assert.equal(h.q('fields').disabled,false,h.q('status').textContent);assert.equal(h.q('previous').hidden,false);assert.match(h.q('previous').textContent,new RegExp(original.headers['Idempotency-Key']));assert.equal(h.q('confirm').checked,false);assert.equal(h.q('send').hidden,true);assert.equal(h.q('categoryCode').value,'007');assert.deepEqual(classificationWrites(h),[original]);
 h.state.postError=null;await h.edit({documentReference:'Constancia corregida exclusivamente sintética QA'});await h.q('prepare').emit('click');assert.equal(h.q('send').disabled,true);h.q('confirm').checked=true;await h.q('confirm').emit('change');await h.q('send').emit('click');const next=classificationWrites(h)[1];assert.ok(next);assert.notEqual(next.headers['Idempotency-Key'],original.headers['Idempotency-Key']);assert.deepEqual(classificationWrites(h)[0],original);assert.deepEqual(JSON.parse(next.body).payload.provenance,provenance());
});

test('renewed session: changed provenance with the same identity cannot inherit the prior declaration on correction',async t=>{
 const{h,original}=await rejectedClassification(t);h.state.sessionId=renewedClassificationSession;h.state.boot.preparation.source.provenance.requestSha256=sha('b');h.state.boot.preparation.source.version=sha('c');await h.q('correct').emit('click');assert.equal(h.q('fields').disabled,false,h.q('status').textContent);assert.equal(h.q('previous').hidden,false);assert.match(h.q('previous').textContent,new RegExp(original.headers['Idempotency-Key']));for(const k of ['agreementCode','categoryCode','documentReference','reason'])assert.equal(h.q(k).value,'');assert.equal(h.q('confirm').checked,false);assert.equal(h.q('send').hidden,true);assert.deepEqual(JSON.parse(original.body).payload.provenance,provenance());assert.deepEqual(classificationWrites(h),[original]);
});

test('renewed session: a session change during correction cannot retire its original key or create a reference',async t=>{
 const{h,original}=await rejectedClassification(t);h.state.hold=url=>{if(url.includes('resource=bootstrap')){h.state.hold=null;h.state.sessionId=renewedClassificationSession;}};await h.q('correct').emit('click');assert.equal(h.q('previous').hidden,true);assert.equal(h.q('receipt').hidden,true);assert.equal(h.q('fields').disabled,true);assert.deepEqual(classificationWrites(h),[original]);await h.q('recover').emit('click');assert.equal(h.q('correct').hidden,false,h.q('status').textContent);
});

test('explicit own selection, original codes and null dates begin blank; provenance does not supply vigency',async t=>{
 const h=harness(t);await h.start();assert.equal(h.q('content').hidden,false);for(const key of Object.keys(definition()))assert.equal(h.q(key).value,'');assert.equal(h.q('period').value,'2026-09');assert.match(h.q('provenance').textContent,/Alta creada en MuniControl/);assert.match(h.q('approved').textContent,/Sin declaración aprobada/);assert.ok(h.pickerOptions().selectionIssue({...selected,recordOrigin:'GRH'}));assert.equal(h.pickerOptions().historicalAdoptionHelp,true);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
});

test('a null classification is prepared explicitly and never labelled ready to calculate',async t=>{
 const h=harness(t);await h.start();await h.prepare({agreementCode:null,categoryCode:null,organizationId:null,sectorCode:null,jurisdictionCode:null,startDate:null,effectiveFrom:null,effectiveUntil:null});assert.equal(h.q('comparison').hidden,false);assert.match(h.q('after').textContent,/Sin informar/);assert.match(h.q('operation').textContent,/requiere una decisión de otra persona/);assert.doesNotMatch(h.q('operation').textContent,/apto|listo para calcular/i);await h.q('send').emit('click');const write=h.requests.find(r=>r.method==='POST');assert.ok(write);const body=JSON.parse(write.body).payload;assert.equal(body.definition.startDate,null);assert.equal(body.definition.agreementCode,null);assert.equal(body.definition.documentDate,'2026-10-14');assert.equal(body.reviewConfirmed,false);assert.match(h.q('receipt').textContent,/No se calcularon/);
});

test('a failed write and missing recovery retry keep the original immutable key and complete body',async t=>{
 const h=harness(t);await h.start();await h.prepare();h.state.postFailure=true;await h.q('send').emit('click');const first=h.requests.find(r=>r.method==='POST');assert.ok(first);assert.equal(h.q('recover').hidden,false);assert.equal(h.q('fields').disabled,true);h.state.missing=true;await h.q('recover').emit('click');assert.equal(h.q('retry').hidden,false);h.q('startDate').value='1900-01-01';h.q('reason').value='Unexpected changed draft';h.state.postFailure=false;await h.q('retry').emit('click');const last=h.requests.filter(r=>r.method==='POST').at(-1);assert.equal(last.body,first.body);assert.equal(last.headers['Idempotency-Key'],first.headers['Idempotency-Key']);assert.equal(h.q('receipt').hidden,false);
});

for(const [code,status]of [['PERIOD_CLASSIFICATION_NO_CHANGES',422],['PERIOD_CLASSIFICATION_SOURCE_CHANGED',409]])test('a definitive '+code+' can start an explicit corrected preparation only after same-attempt404 and fresh source',async t=>{
 const h=harness(t);await h.start();await h.prepare();h.state.postError={code,status};await h.q('send').emit('click');const first=h.requests.find(r=>r.method==='POST'),original=JSON.parse(first.body).payload;
 assert.equal(h.q('fields').disabled,true);assert.equal(h.q('correct').hidden,true);await h.q('correct').emit('click');assert.equal(h.requests.filter(r=>r.method==='POST').length,1);
 h.state.missing=true;await h.q('recover').emit('click');assert.equal(h.q('correct').hidden,false);assert.equal(h.q('retry').hidden,false);
 h.state.boot.preparation.source.version=sha('7');const reads=h.requests.length;await h.q('correct').emit('click');const correctionReads=h.requests.slice(reads);
 assert.ok(correctionReads.some(r=>r.url.includes('resource=bootstrap')));assert.ok(correctionReads.some(r=>r.url.includes('resource=attempt')));assert.deepEqual(correctionReads.map(r=>r.url==='/api/internal-auth'?'auth':new URL(r.url,'https://synthetic.test').searchParams.get('resource')),['auth','auth','bootstrap','auth','attempt','auth']);
 assert.equal(h.q('fields').disabled,false);assert.equal(h.q('correct').hidden,true);assert.equal(h.q('retry').hidden,true);assert.equal(h.q('previous').hidden,false);assert.match(h.q('previous').textContent,new RegExp(first.headers['Idempotency-Key']));assert.match(h.q('previous').textContent,/Constancia retrospectiva/);
 for(const [key,value]of Object.entries(original.definition))assert.equal(h.q(key).value,value??'');assert.equal(h.q('reason').value,original.reason);assert.equal(h.requests.filter(r=>r.method==='POST').length,1);assert.equal(h.q('send').hidden,true);assert.equal(h.q('confirm').checked,false);
 h.q('documentReference').value='Constancia corregida exclusivamente sintética QA';await h.q('documentReference').emit('input');await h.q('prepare').emit('click');h.q('confirm').checked=true;await h.q('confirm').emit('change');h.state.postError=null;await h.q('send').emit('click');const next=h.requests.filter(r=>r.method==='POST').at(-1),body=JSON.parse(next.body).payload;
 assert.notEqual(next.headers['Idempotency-Key'],first.headers['Idempotency-Key']);assert.equal(body.sourceVersion,sha('7'));assert.notEqual(body.definition.documentReference,original.definition.documentReference);assert.equal(first.body,JSON.stringify({operation:'command',payload:original}));assert.equal(h.q('receipt').hidden,false);
});

for(const failure of ['network','server','busy'])test('attempt404 after '+failure+' remains recoverable and cannot create another attempt',async t=>{
 const h=harness(t);await h.start();await h.prepare();if(failure==='network')h.state.postFailure=true;else h.state.postError={status:failure==='server'?503:409,code:failure==='server'?'PERIOD_CLASSIFICATION_UNAVAILABLE':'PERIOD_CLASSIFICATION_BUSY'};await h.q('send').emit('click');const first=h.requests.find(r=>r.method==='POST');h.state.missing=true;await h.q('recover').emit('click');assert.equal(h.q('correct').hidden,true);await h.q('correct').emit('click');assert.equal(h.q('fields').disabled,true);assert.equal(h.q('previous').hidden,true);h.state.postFailure=false;h.state.postError=null;await h.q('retry').emit('click');const next=h.requests.filter(r=>r.method==='POST').at(-1);assert.equal(next.headers['Idempotency-Key'],first.headers['Idempotency-Key']);assert.equal(next.body,first.body);
});

test('correction refuses a changed account or binding and keeps the original attempt',async t=>{
 const h=harness(t);await h.start();await h.prepare();h.state.postError={status:422,code:'PERIOD_CLASSIFICATION_NO_CHANGES'};await h.q('send').emit('click');const first=h.requests.find(r=>r.method==='POST');h.state.missing=true;await h.q('recover').emit('click');h.state.actorEmail='other@example.test';await h.q('correct').emit('click');assert.equal(h.q('fields').disabled,true);assert.equal(h.q('previous').hidden,true);assert.match(h.q('status').textContent,/Cambió la cuenta/);assert.equal(h.requests.filter(r=>r.method==='POST').length,1);
 h.state.actorEmail='synthetic@example.test';await h.q('access').emit('click');await h.q('recover').emit('click');h.state.boot.preparation.scope.bindingId=id(998);h.state.boot.preparation.source.scope.bindingId=id(998);await h.q('correct').emit('click');assert.equal(h.q('fields').disabled,true);assert.equal(h.q('previous').hidden,true);assert.match(h.q('status').textContent,/otro contrato, período o ámbito/);h.state.postError=null;await h.q('retry').emit('click');const next=h.requests.filter(r=>r.method==='POST').at(-1);assert.equal(next.headers['Idempotency-Key'],first.headers['Idempotency-Key']);assert.equal(next.body,first.body);
});

test('correction recovers an existing original receipt instead of retiring the attempt',async t=>{
 const h=harness(t);await h.start();await h.prepare();h.state.postError={status:409,code:'PERIOD_CLASSIFICATION_SOURCE_CHANGED'};await h.q('send').emit('click');const first=h.requests.find(r=>r.method==='POST');h.state.missing=true;await h.q('recover').emit('click');h.state.missing=false;h.state.receipt=await h.receipt(JSON.parse(first.body).payload,first.headers['Idempotency-Key']);h.state.receipt.replayed=true;await h.q('correct').emit('click');assert.equal(h.q('receipt').hidden,false);assert.equal(h.q('previous').hidden,true);assert.equal(h.q('new').hidden,false);assert.match(h.q('status').textContent,/original recuperado/);assert.equal(h.requests.filter(r=>r.method==='POST').length,1);
});

test('correction withdraws a late source and retains the attempt when visibility changes',async t=>{
 const h=harness(t);await h.start();await h.prepare();h.state.postError={status:422,code:'PERIOD_CLASSIFICATION_NO_CHANGES'};await h.q('send').emit('click');h.state.missing=true;await h.q('recover').emit('click');let release,entered;const started=new Promise(resolve=>entered=resolve);h.state.hold=async url=>{if(url.includes('resource=bootstrap')){entered();await new Promise(resolve=>release=resolve);}};const correcting=h.q('correct').emit('click');await started;h.hide();release();await correcting;assert.equal(h.q('content').hidden,true);assert.equal(h.q('previous').hidden,true);assert.equal(h.q('correct').hidden,true);assert.equal(h.requests.filter(r=>r.method==='POST').length,1);h.state.hold=null;h.show();await h.q('access').emit('click');await h.q('recover').emit('click');assert.equal(h.q('correct').hidden,false);
});

test('correction retains the old declaration for comparison but does not apply it to a changed identity',async t=>{
 const h=harness(t);await h.start();await h.prepare();h.state.postError={status:409,code:'PERIOD_CLASSIFICATION_SOURCE_CHANGED'};await h.q('send').emit('click');const first=h.requests.find(r=>r.method==='POST');h.state.missing=true;await h.q('recover').emit('click');h.state.boot.preparation.source.subject.identityToken=sha('8');await h.q('correct').emit('click');assert.equal(h.q('fields').disabled,false);for(const key of Object.keys(definition()))assert.equal(h.q(key).value,'');assert.equal(h.q('previous').hidden,false);assert.match(h.q('previous').textContent,new RegExp(first.headers['Idempotency-Key']));assert.match(h.q('previous').textContent,/Constancia retrospectiva/);assert.equal(h.requests.filter(r=>r.method==='POST').length,1);
});

test('an uncertain retry cancels the old definitive-rejection correction proof',async t=>{
 const h=harness(t);await h.start();await h.prepare();h.state.postError={status:422,code:'PERIOD_CLASSIFICATION_NO_CHANGES'};await h.q('send').emit('click');const first=h.requests.find(r=>r.method==='POST');h.state.missing=true;await h.q('recover').emit('click');assert.equal(h.q('correct').hidden,false);h.state.postError=null;h.state.postFailure=true;await h.q('retry').emit('click');assert.equal(h.q('correct').hidden,true);await h.q('recover').emit('click');assert.equal(h.q('correct').hidden,true);await h.q('correct').emit('click');assert.equal(h.q('fields').disabled,true);assert.equal(h.q('previous').hidden,true);for(const request of h.requests.filter(r=>r.method==='POST')){assert.equal(request.body,first.body);assert.equal(request.headers['Idempotency-Key'],first.headers['Idempotency-Key']);}
});

test('correction rechecks permissions after its fresh source and attempt404 before releasing the original',async t=>{
 const h=harness(t);await h.start();await h.prepare();h.state.postError={status:409,code:'PERIOD_CLASSIFICATION_SOURCE_CHANGED'};await h.q('send').emit('click');h.state.missing=true;await h.q('recover').emit('click');const correctionStart=h.requests.length;h.state.onAuth=async()=>{const current=h.requests.slice(correctionStart);if(current.some(r=>r.url.includes('resource=bootstrap'))&&current.some(r=>r.url.includes('resource=attempt')))h.state.caps=h.state.caps.filter(c=>c!=='payroll.parameter.prepare');};await h.q('correct').emit('click');assert.equal(h.requests.slice(correctionStart).filter(r=>r.url.includes('resource=bootstrap')).length,1);assert.equal(h.requests.slice(correctionStart).filter(r=>r.url.includes('resource=attempt')).length,1);assert.equal(h.q('fields').disabled,true);assert.equal(h.q('content').hidden,true);assert.equal(h.q('previous').hidden,true);assert.equal(h.q('correct').hidden,true);assert.equal(h.requests.filter(r=>r.method==='POST').length,1);h.state.onAuth=null;h.state.caps=[...capList];await h.q('access').emit('click');await h.q('recover').emit('click');assert.equal(h.q('correct').hidden,false);
});

test('late bootstrap and late access responses cannot restore a hidden nominal view',async t=>{
 const h=harness(t);await h.start();let release,entered;const started=new Promise(resolve=>entered=resolve);h.state.hold=async()=>{entered();await new Promise(resolve=>release=resolve);};const pending=h.q('refresh').emit('click');await started;h.hide();release();await pending;assert.equal(h.q('content').hidden,true);assert.equal(h.q('subject').textContent,'No hay un legajo seleccionado.');assert.equal(h.q('provenance').textContent,'');h.show();assert.equal(h.q('access').hidden,false);
 let releaseAuth,authEntered;const authStarted=new Promise(resolve=>authEntered=resolve);h.state.onAuth=async()=>{authEntered();await new Promise(resolve=>releaseAuth=resolve);};const auth=h.q('access').emit('click');await authStarted;h.hide();releaseAuth();await auth;h.show();assert.equal(h.q('access').hidden,false);assert.equal(h.q('target').disabled,true);
});

test('capture is withdrawn on hiding and restored only after the same context is rechecked',async t=>{
 const h=harness(t);await h.start();await h.edit();h.hide();assert.equal(h.q('startDate').value,'');assert.equal(h.q('reason').value,'');h.show();await h.q('access').emit('click');assert.equal(h.q('period').value,'2026-09');await h.q('refresh').emit('click');assert.equal(h.q('categoryCode').value,'007');assert.equal(h.q('startDate').value,'2020-02-29');assert.equal(h.q('reason').value,reason);h.state.boot.preparation.source.version=sha('7');await h.q('refresh').emit('click');assert.equal(h.q('startDate').value,'');assert.equal(h.q('reason').value,'');
});

test('a late receipt after visibility withdrawal stays undisplayed and recovers the same attempt',async t=>{
 const h=harness(t);await h.start();await h.prepare();let release,entered;const posted=new Promise(resolve=>entered=resolve);h.state.onPost=async()=>{entered();await new Promise(resolve=>release=resolve);};const sending=h.q('send').emit('click');await posted;const post=h.requests.find(r=>r.method==='POST');h.hide();release();await sending;assert.equal(h.q('receipt').hidden,true);assert.equal(h.q('content').hidden,true);h.state.receipt=await h.receipt(JSON.parse(post.body).payload,post.headers['Idempotency-Key']);h.state.receipt.replayed=true;h.show();await h.q('access').emit('click');await h.q('recover').emit('click');assert.equal(h.q('receipt').hidden,false);assert.match(h.q('status').textContent,/original recuperado/);assert.equal(h.requests.filter(r=>r.method==='POST').length,1);
});

test('changed account and revoked capabilities retire fields and cannot replay an old send',async t=>{
 const h=harness(t);await h.start();await h.prepare();h.state.postFailure=true;await h.q('send').emit('click');h.hide();h.show();h.state.actorEmail='other@example.test';await h.q('access').emit('click');assert.equal(h.q('receipt').hidden,true);assert.equal(h.q('recover').disabled,true);assert.match(h.q('status').textContent,/Cambió la cuenta/);h.state.actorEmail='synthetic@example.test';h.state.caps=h.state.caps.filter(c=>c!=='payroll.parameter.prepare');await h.q('access').emit('click');assert.equal(h.q('target').disabled,true);assert.match(h.q('status').textContent,/no permite/);assert.equal(h.requests.filter(r=>r.method==='POST').length,1);
});

test('malformed and changed-target bootstrap do not expose unverified source or populated fields',async t=>{
 const h=harness(t);await h.start();h.state.boot.preparation.contractId=id(999);h.state.boot.preparation.source.subject.contractId=id(999);await h.q('refresh').emit('click');assert.match(h.q('status').textContent,/otro contrato/);h.state.malformed=true;await h.q('refresh').emit('click');assert.match(h.q('status').textContent,/No se verificó/);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
});

test('independent review preserves the complete original declaration and emits only its references',async t=>{
 const h=harness(t);await h.proposal();await h.start();h.q('proposal').value=id(21);await h.q('proposal').emit('change');await h.q('open').emit('click');assert.match(h.q('detail').textContent,/Otra persona sintética/);assert.match(h.q('after').textContent,/007/);h.q('decision').value='approve';h.q('decision-reason').value='Revisión municipal exclusivamente sintética QA';await h.q('review').emit('click');assert.equal(h.q('send').textContent,'Aprobar declaración');h.q('confirm').checked=true;await h.q('confirm').emit('change');await h.q('send').emit('click');const command=JSON.parse(h.requests.find(r=>r.method==='POST').body).payload;assert.equal(command.command,'approve');assert.equal(command.proposalSha256,h.state.detail.proposal.requestSha256);assert.equal(command.definition,null);assert.equal(command.provenance,null);assert.equal(command.reviewConfirmed,true);assert.match(h.q('receipt').textContent,/Aprobada/);
});

test('the preparer cannot review its own proposal and a partial month remains unapproved',async t=>{
 const h=harness(t);await h.proposal({canReview:false});await h.start();h.q('proposal').value=id(21);await h.q('open').emit('click');assert.equal(h.q('decision-fields').disabled,true);assert.match(h.q('detail').textContent,/otra persona autorizada/);h.q('decision').value='approve';h.q('decision-reason').value='No se autoriza una autorrevisión sintética';await h.q('review').emit('click');assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
 await h.proposal({patch:{effectiveFrom:'2026-09-02'}});await h.q('refresh').emit('click');h.q('proposal').value=id(21);await h.q('open').emit('click');h.q('decision').value='approve';h.q('decision-reason').value='Revisión municipal exclusivamente sintética QA';await h.q('review').emit('click');assert.match(h.q('status').textContent,/no cubre todo el mes/);assert.equal(h.q('send').hidden,true);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);h.q('decision').value='reject';await h.q('decision').emit('input');await h.q('review').emit('click');assert.equal(h.q('send').textContent,'Rechazar propuesta');
});

test('withdrawing during the attempt hash keeps one original key/body and never sends while hidden',async t=>{
 const h=harness(t);await h.start();await h.prepare();const realCrypto=globalThis.crypto;let release,entered,held=true;const started=new Promise(resolve=>entered=resolve);Object.defineProperty(globalThis,'crypto',{configurable:true,value:{randomUUID:()=>id(90),subtle:{digest:async(...args)=>{if(held){entered();await new Promise(resolve=>release=resolve);}return realCrypto.subtle.digest(...args);}}}});const sending=h.q('send').emit('click');await started;h.hide();held=false;release();await sending;assert.equal(h.requests.filter(r=>r.method==='POST').length,0);assert.equal(h.q('receipt').hidden,true);h.show();h.state.missing=true;await h.q('access').emit('click');await h.q('recover').emit('click');await h.q('retry').emit('click');const write=h.requests.find(r=>r.method==='POST');assert.equal(write.headers['Idempotency-Key'],id(90));assert.deepEqual(JSON.parse(write.body).payload.definition,definition());assert.equal(h.q('receipt').hidden,false);
});

test('capability withdrawal clears catalog options and a late decision detail cannot repopulate them',async t=>{
 const h=harness(t);await h.proposal();await h.start();h.q('proposal').value=id(21);let release,entered;const started=new Promise(resolve=>entered=resolve);h.state.hold=async url=>{if(url.includes('resource=detail')){entered();await new Promise(resolve=>release=resolve);}};const opening=h.q('open').emit('click');await started;h.state.caps=[];h.event('municontrol:capabilities-ready');release();await opening;await settle();assert.equal(h.q('content').hidden,true);assert.equal(h.q('detail').textContent,'');assert.equal(h.q('agreementCode').options.length,1);assert.equal(h.q('categoryCode').options.length,1);assert.equal(h.q('send').hidden,true);assert.equal(h.requests.filter(r=>r.method==='POST').length,0);
});

test('panel markup has full comparison and mobile stacking without private persistence',()=>{
 const js=fs.readFileSync(new URL('../assets/own-period-classification-panel.js',import.meta.url),'utf8'),css=fs.readFileSync(new URL('../assets/own-period-classification-panel.css',import.meta.url),'utf8');assert.doesNotMatch(js,/localStorage|sessionStorage|indexedDB/);assert.match(js,/data-classification-before/);assert.match(js,/data-classification-after/);assert.match(js,/aria-live="polite"/);assert.match(css,/@media\(max-width:620px\)/);assert.match(css,/min-height:46px/);assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
});
