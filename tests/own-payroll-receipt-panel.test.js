// Actual receipt panel/models over the small DOM/event substrate already used
// by own-period-classification-panel.test.js. All HTTP values are synthetic
// fixtures; no database, browser session, document delivery or municipal write.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {OWN_RUN_TYPES} from '../assets/own-payroll-run-workspace-model.js';
import {mountOwnPayrollReceipts} from '../assets/own-payroll-receipt-panel.js';
import {OWN_RECEIPT_READ,OWN_RECEIPT_PREPARE,OWN_RECEIPT_APPROVE,ownReceiptParams,ownReceiptCommand} from '../assets/own-payroll-receipt-model.js';
import {receiptPreview,receiptBatch} from './fixtures/own-payroll-receipt-synthetic.js';
import {uid,hash} from './fixtures/own-payroll-program-synthetic.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';
import {receiptError} from '../lib/internal-own-payroll-receipts.js';
import {municipalDocumentIssuerProfile} from '../lib/municipal-document-issuer.js';

class Element{
 constructor(tag='div'){this.tagName=tag.toLowerCase();this.children=[];this.parentElement=null;this.attributes={};this.dataset={};this.listeners=new Map();this.hidden=false;this.disabled=false;this.checked=false;this.selected=false;this.open=false;this._value=undefined;this._text='';this.isConnected=true;}
 append(...items){for(const item of items){item.parentElement=this;this.children.push(item);}}
 replaceChildren(...items){this.children=[];this._text='';this.append(...items);}
 setAttribute(name,value){this.attributes[name.toLowerCase()]=String(value);if(name==='hidden')this.hidden=true;if(name==='disabled')this.disabled=true;}
 getAttribute(name){return this.attributes[name.toLowerCase()]??null;}
 get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
 set textContent(value){this._text=String(value);this.children=[];}
 get options(){return this.tagName==='select'?this.children:[];}
 get selectedOptions(){return this.options.filter(o=>o.selected);}
 get value(){return this._value??(this.tagName==='select'?this.children[0]?.value??'':'');}
 set value(value){const s=String(value);this._value=this.tagName==='select'&&!this.children.some(o=>o.value===s)?'':s;}
 focus(){}
 set innerHTML(html){this.replaceChildren();const stack=[this];for(const token of html.match(/<[^>]*>|[^<]+/g)??[]){if(token.startsWith('</')){stack.pop();continue;}if(token.startsWith('<')){const m=token.match(/^<([a-z][\w-]*)\b([^>]*)>/i);if(!m)continue;const element=new Element(m[1]);for(const a of m[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))element.setAttribute(a[1],a[2]??'');if(element.tagName==='input')element.type=element.getAttribute('type');if(element.tagName==='option')element._value=element.getAttribute('value')??'';stack.at(-1).append(element);if(!['input','link','br','hr','meta'].includes(element.tagName)&&!token.endsWith('/>'))stack.push(element);}else{const text=new Element('#text');text._text=token;stack.at(-1).append(text);}}}
 querySelector(selector){const attr=selector.match(/^(?:([\w-]+))?\[([\w-]+)(?:="([^"]*)")?\]$/),match=n=>attr?(!attr[1]||n.tagName===attr[1])&&Object.hasOwn(n.attributes,attr[2].toLowerCase())&&(attr[3]===undefined||n.attributes[attr[2].toLowerCase()]===attr[3]):n.tagName===selector;const walk=n=>{for(const child of n.children){if(match(child))return child;const nested=walk(child);if(nested)return nested;}return null;};return walk(this);}
 addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(fn);}
 removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)??[]).filter(f=>f!==fn));}
 async emit(type){for(let n=this;n;n=n.parentElement)if(n.disabled)return;await Promise.all((this.listeners.get(type)??[]).map(fn=>fn({target:this,preventDefault(){}})));}
}
const events=()=>{const listeners=new Map();return{addEventListener:(type,fn)=>{if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},removeEventListener:(type,fn)=>listeners.set(type,(listeners.get(type)??[]).filter(f=>f!==fn)),dispatch:(type,detail)=>{for(const fn of listeners.get(type)??[])fn({detail});}};};
const capabilities=[...new Set([...OWN_RECEIPT_PREPARE,...OWN_RECEIPT_APPROVE])];

function harness(t){
 const host=new Element(),docEvents=events(),winEvents=events(),requests=[],timers=new Map(),saved=new Map(),batches=new Map();let timer=0,sequence=0;
 const names=['document','window','fetch','setTimeout','clearTimeout','setInterval','clearInterval'],originalGlobals=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 const document={...docEvents,hidden:false,head:new Element('head'),createElement:tag=>new Element(tag),querySelectorAll:()=>[],getElementById:()=>null};
 Object.assign(globalThis,{document,window:winEvents,setTimeout:fn=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id),setInterval:fn=>{timers.set(++timer,fn);return timer;},clearInterval:id=>timers.delete(id)});
 const state={caps:[...capabilities],operator:'receipt-synthetic-operator',tenantId:uid(700),role:'synthetic-role',scopeVersion:hash('a'),sourceVersion:hash('b'),count:1,zero:false,postError:null,network:false,commitBeforeNetwork:false,recoveryMalformed:false,hold:null,onAuth:null,authCount:0,lastPreview:null};
 const issuer=()=>municipalDocumentIssuerProfile({tenantId:state.tenantId},new Map([[state.tenantId,{id:'synthetic-recovery-municipality',revision:1,issuer:{name:'Municipio de ensayo sintético',taxId:'30990000001',address:'Domicilio inventado 123'},source:{kind:'municipal_official_backup',label:'Respaldo ficticio para prueba local',cutoff:'2026-10-01T15:00:00',validityDeclared:false}}]]));
 const fail=code=>{const error=receiptError(Error(code));return new Response(JSON.stringify({ok:false,code:error.code,error:error.message}),{status:error.status});};
 const commit=(body,key)=>{
  ownReceiptCommand(body);const original=structuredClone(state.lastPreview),batch=receiptBatch(state.count),batchId=uid(1000+(++sequence));Object.assign(batch,{id:batchId,snapshot:original.snapshot,snapshotSha256:original.snapshotSha256,permissions:{...batch.permissions,canApprove:false}});
  const event={version:'own-receipt-event.v1',id:batchId,key,body:structuredClone(body),bodySha256:ownRunHash(body),batchId,recordedAt:'2026-10-14T15:00:00Z',replayed:false};saved.set(key,event);batches.set(batchId,batch);return event;
 };
 globalThis.fetch=async(url,options={})=>{
  const body=options.body?JSON.parse(options.body):null,key=options.headers?.['Idempotency-Key'];requests.push({url,method:options.method??'GET',body,key});await state.hold?.(url,body);
  if(url==='/api/internal-auth'){state.authCount++;await state.onAuth?.(state.authCount);return new Response(JSON.stringify({ok:true,authenticated:true,sessionVersion:2,user:{id:state.operator,email:'synthetic@example.test'},access:{context:'tenant',tenant:{id:state.tenantId,roleKey:state.role},tenantCapabilities:state.caps},expiresAt:'2099-01-01T00:00:00Z'}));}
  const q=new URL(url,'https://synthetic.example.test').searchParams;
  if(q.get('resource')==='issuer')return new Response(JSON.stringify({ok:true,data:issuer()}));
  if(body?.operation==='preview'){const preview=receiptPreview(state.count);preview.scopeVersion=state.scopeVersion;preview.snapshot.sourceVersion=state.sourceVersion;preview.snapshot.params=ownReceiptParams(body.params);if(preview.snapshot.params.contracts){preview.snapshot.version='own-receipt-snapshot.v2';preview.snapshot.identityBasis='owned_registration_verified_at_capture';}if(state.zero)Object.assign(preview.snapshot,{records:[],sources:[],recordCount:0,conceptCount:0});preview.snapshotSha256=ownRunHash(preview.snapshot);state.lastPreview=structuredClone(preview);return new Response(JSON.stringify({ok:true,data:preview}));}
  if(body?.operation==='command'){
   ownReceiptCommand(body.payload);
   if(state.network){if(state.commitBeforeNetwork)commit(body.payload,key);throw Error('Fallo de red exclusivamente sintético');}
   if(state.postError)return fail(state.postError);
   const event=saved.has(key)?{...saved.get(key),replayed:true}:commit(body.payload,key);return new Response(JSON.stringify({ok:true,data:event}));
  }
  if(q.get('resource')==='attempt'){if(state.recoveryMalformed)return new Response(JSON.stringify({ok:true}));const event=saved.get(q.get('key'));return event?new Response(JSON.stringify({ok:true,data:{...event,replayed:true}})):fail('OWN_RECEIPT_NOT_FOUND');}
  if(q.get('resource')==='batch'){const batch=batches.get(q.get('id'));return batch?new Response(JSON.stringify({ok:true,data:batch})):fail('OWN_RECEIPT_NOT_FOUND');}
  if(q.get('resource')==='list')return new Response(JSON.stringify({ok:true,data:{version:'own-receipt-list.v1',scopeVersion:state.scopeVersion,period:q.get('period'),items:[...batches.values()].filter(b=>b.snapshot.params.period===q.get('period')).map(b=>({id:b.id,preparedAt:b.preparedAt,preparedBy:b.preparedBy,recordCount:b.snapshot.recordCount,types:b.snapshot.params.types}))}}));
  assert.fail('Unexpected API operation '+url);
 };
 t.after(()=>{winEvents.dispatch('pagehide');for(const [name,descriptor]of originalGlobals)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];});
 const q=key=>{const element=host.querySelector('[data-receipt-'+key+']');assert.ok(element,'Actual receipt control '+key);return element;};
 const settled=async()=>{const deadline=Date.now()+5000;while(host.getAttribute('aria-busy')==='true'&&Date.now()<deadline)await delay(1);assert.notEqual(host.getAttribute('aria-busy'),'true','Panel operation must finish');};
 const act=async(key,type='click')=>{await q(key).emit(type);await settled();};
 const chooseTypes=types=>{for(const type of Object.keys(OWN_RUN_TYPES))q('type-'+type).checked=types.includes(type);};
 const start=async()=>{docEvents.dispatch('taskchange',{id:'recibos'});await settled();q('period').value=receiptPreview(1).snapshot.params.period;chooseTypes(['monthly']);q('scope').value='all';await act('scope','change');await act('query','submit');assert.equal(q('prepare').disabled,false);q('reason').value='Conservación de recibo exclusivamente sintético QA';};
 const missingAfterRejection=async(code='OWN_RECEIPT_STATE_CHANGED')=>{state.postError=code;await act('prepare');assert.equal(q('correct').hidden,true);await act('recover');assert.equal(q('correct').hidden,false);};
 const posts=()=>requests.filter(r=>r.body?.operation==='command');
 mountOwnPayrollReceipts(host);
 return{host,q,state,requests,saved,batches,start,act,chooseTypes,settled,missingAfterRejection,posts,commit,hide:()=>{document.hidden=true;docEvents.dispatch('visibilitychange');},show:()=>{document.hidden=false;docEvents.dispatch('visibilitychange');},event:docEvents.dispatch};
}

for(const code of ['OWN_RECEIPT_STATE_CHANGED','OWN_RECEIPT_IDENTITY_REQUIRED'])test('definitive '+code+' and same-key404 offer explicit correction with fresh full preview',async t=>{
 const h=harness(t);await h.start();h.q('date').value='2026-09-30';h.q('legend').value='Leyenda de ensayo conservada';await h.act('query','submit');h.q('reason').value='Conservación de recibo exclusivamente sintético QA';await h.missingAfterRejection(code);const original=structuredClone(h.posts()[0]);assert.equal(h.q('fields').disabled,true);h.state.sourceVersion=hash('c');h.state.count=2;const before=h.requests.length;await h.act('correct');const reads=h.requests.slice(before);
 assert.ok(reads.some(r=>r.url.includes('resource=issuer')));assert.ok(reads.some(r=>r.body?.operation==='preview'));assert.ok(reads.some(r=>r.url.includes('resource=attempt')));assert.equal(reads.filter(r=>r.url==='/api/internal-auth').length,2);assert.equal(h.posts().length,1,'Correction does not record an operation');assert.equal(h.q('fields').disabled,false);assert.equal(h.q('correct').hidden,true);assert.equal(h.q('recover').hidden,true);assert.equal(h.q('retry').hidden,true);assert.equal(h.q('previous').hidden,false);assert.match(h.q('previous').textContent,new RegExp(original.key));assert.match(h.q('previous').textContent,/1 recibos/);assert.match(h.q('summary').textContent,/2 recibos/);assert.equal(h.q('reason').value,original.body.payload.reason);assert.equal(h.q('date').value,original.body.payload.params.paymentDate);assert.equal(h.q('legend').value,original.body.payload.params.legend);assert.equal(h.q('scope').value,'all');assert.equal(h.q('confirm').checked,false);
 h.state.postError=null;await h.act('prepare');assert.equal(h.posts().length,2);const next=h.posts()[1];assert.notEqual(next.key,original.key);assert.equal(next.body.payload.sourceVersion,hash('c'));assert.deepEqual(h.posts()[0],original);assert.match(h.q('state').textContent,/pendiente de revisión/);assert.equal(h.q('approve').disabled,true,'Preparation never approves availability');
});

for(const failure of ['network','server','busy','forbidden'])test('same-key404 after '+failure+' never releases an uncertain original attempt',async t=>{
 const h=harness(t);await h.start();if(failure==='network')h.state.network=true;else h.state.postError=failure==='server'?'OWN_RECEIPT_UNAVAILABLE':failure==='busy'?'OWN_RECEIPT_BUSY':'OWN_RECEIPT_FORBIDDEN';await h.act('prepare');const original=structuredClone(h.posts()[0]);await h.act('recover');assert.equal(h.q('correct').hidden,true);assert.equal(h.q('fields').disabled,true);assert.equal(h.q('previous').hidden,true);await h.act('correct');assert.equal(h.posts().length,1);h.state.network=false;h.state.postError=null;await h.act('retry');assert.equal(h.posts().length,2);assert.deepEqual(h.posts()[1],original);
});

test('an uncertain retry invalidates a previous definitive rejection and absence proof',async t=>{
 const h=harness(t);await h.start();await h.missingAfterRejection();const original=structuredClone(h.posts()[0]);h.state.postError=null;h.state.network=true;await h.act('retry');await h.act('recover');assert.equal(h.q('correct').hidden,true);assert.equal(h.q('fields').disabled,true);assert.equal(h.q('previous').hidden,true);assert.deepEqual(h.posts()[1],original);
});

for(const changed of ['operator','tenant','binding'])test('correction cannot transfer the original receipt attempt to another '+changed,async t=>{
 const h=harness(t);await h.start();await h.missingAfterRejection();if(changed==='operator')h.state.operator='another-synthetic-operator';else if(changed==='tenant')h.state.tenantId=uid(701);else h.state.scopeVersion=hash('d');await h.act('correct');assert.equal(h.q('fields').disabled,true);assert.equal(h.q('previous').hidden,true);assert.equal(h.q('result').hidden,true);assert.equal(h.posts().length,1);assert.match(h.q('status').textContent,changed==='binding'?/Cambió el ámbito/:/Cambió la cuenta/);
});

test('write permission withdrawal after fresh source and attempt404 keeps the original pending',async t=>{
 const h=harness(t);await h.start();await h.missingAfterRejection();const before=h.state.authCount;h.state.onAuth=async count=>{if(count===before+2)h.state.caps=[...OWN_RECEIPT_READ];};await h.act('correct');assert.equal(h.q('fields').disabled,true);assert.equal(h.q('result').hidden,true);assert.equal(h.q('previous').hidden,true);assert.equal(h.posts().length,1);h.state.onAuth=null;h.state.caps=[...capabilities];await h.act('recover');assert.equal(h.q('correct').hidden,false,'The same original remains available after authority is restored');
});

test('a receipt that appears after the first404 is recovered instead of starting another preparation',async t=>{
 const h=harness(t);await h.start();await h.missingAfterRejection();const original=h.posts()[0],event=h.commit(original.body.payload,original.key);await h.act('correct');assert.equal(h.posts().length,1);assert.equal(h.q('recover').hidden,true);assert.equal(h.q('correct').hidden,true);assert.equal(h.q('previous').hidden,true);assert.equal(h.q('result').hidden,false);assert.match(h.q('state').textContent,/pendiente de revisión/);assert.equal(h.q('approve').disabled,true);assert.ok(h.batches.has(event.batchId));
});

test('a malformed successful recovery is not mistaken for404 or allowed to retire a key',async t=>{
 const h=harness(t);await h.start();await h.missingAfterRejection();h.state.recoveryMalformed=true;await h.act('correct');assert.equal(h.q('fields').disabled,true);assert.equal(h.q('previous').hidden,true);assert.equal(h.q('correct').hidden,true);assert.equal(h.q('recover').hidden,false);assert.equal(h.posts().length,1);
});

test('hiding during correction withdraws a late source and preserves the original context',async t=>{
 const h=harness(t);await h.start();await h.missingAfterRejection();let release,entered;const started=new Promise(resolve=>entered=resolve);h.state.hold=async(_url,body)=>{if(body?.operation==='preview'){entered();await new Promise(resolve=>release=resolve);}};const correcting=h.act('correct');await started;h.hide();release();await correcting;assert.equal(h.q('result').hidden,true);assert.equal(h.q('previous').hidden,true);assert.equal(h.q('correct').hidden,true);assert.equal(h.posts().length,1);h.state.hold=null;h.show();await h.act('recover');assert.equal(h.q('correct').hidden,false);
});

test('commit followed by a network loss recovers the original receipt without another POST',async t=>{
 const h=harness(t);await h.start();h.state.network=true;h.state.commitBeforeNetwork=true;await h.act('prepare');const original=h.posts()[0];await h.act('recover');assert.equal(h.posts().length,1);assert.ok(h.saved.has(original.key));assert.equal(h.q('recover').hidden,true);assert.equal(h.q('correct').hidden,true);assert.equal(h.q('result').hidden,false);assert.match(h.q('state').textContent,/pendiente de revisión/);
});

test('correction preserves a single employee range and exact contract selection without broadening it',async t=>{
 const h=harness(t);await h.start();const employee=receiptPreview(1).snapshot.records[0].employeeNumber;h.q('scope').value='employee';await h.act('scope','change');h.q('employeeFrom').value=employee;h.q('employeeTo').value='';await h.act('query','submit');h.q('contracts').options[0].selected=true;await h.act('contracts','change');await h.act('selected');h.q('reason').value='Selección exacta exclusivamente sintética QA';await h.missingAfterRejection();const original=structuredClone(h.posts()[0]);h.state.sourceVersion=hash('c');await h.act('correct');assert.equal(h.q('scope').value,'employee');assert.equal(h.q('employeeFrom').value,employee);assert.equal(h.q('employeeTo').value,employee);assert.equal(h.q('contracts').selectedOptions.length,1);h.state.postError=null;await h.act('prepare');assert.deepEqual(h.posts()[1].body.payload.params.filters,original.body.payload.params.filters);assert.deepEqual(h.posts()[1].body.payload.params.contracts,original.body.payload.params.contracts);assert.equal(h.posts()[1].body.payload.sourceVersion,hash('c'));assert.notEqual(h.posts()[1].key,original.key);
});

test('a fresh zero-receipt source unlocks correction without inventing a result or allowing persistence',async t=>{
 const h=harness(t);await h.start();await h.missingAfterRejection();h.state.zero=true;h.state.sourceVersion=hash('c');await h.act('correct');assert.equal(h.q('fields').disabled,false);assert.equal(h.q('consult').disabled,false);assert.equal(h.q('prepare').disabled,true);assert.equal(h.q('pdf').disabled,true);assert.match(h.q('status').textContent,/no tiene recibos propios cerrados/);assert.match(h.q('summary').textContent,/0 recibos/);assert.match(h.q('previous').textContent,/1 recibos/);assert.equal(h.posts().length,1);
});

test('correcting a historical batch restores its department scope instead of the unrelated query dropdown',async t=>{
 const h=harness(t);await h.start();const department=receiptPreview(1).snapshot.records[0].departmentCode;h.q('scope').value='department';await h.act('scope','change');h.q('departmentFrom').value=department;await h.act('query','submit');const p=h.state.lastPreview,originalBody={command:'prepare',scopeVersion:p.scopeVersion,sourceVersion:p.snapshot.sourceVersion,params:p.snapshot.params,batchId:null,batchSha256:null,reason:'Preparación anterior por otra persona sintética QA',reviewConfirmed:false},event=h.commit(originalBody,uid(900));h.batches.get(event.batchId).permissions.canApprove=true;
 h.q('scope').value='all';await h.act('scope','change');await h.act('history');const button=h.q('list').querySelector('button');assert.ok(button);await button.emit('click');await h.settled();assert.equal(h.q('scope').value,'all');h.q('confirm').checked=true;h.q('reason').value='Revisión independiente exclusivamente sintética QA';h.state.postError='OWN_RECEIPT_STATE_CHANGED';await h.act('approve');assert.equal(h.posts()[0].body.payload.command,'approve');await h.act('recover');await h.act('correct');assert.equal(h.q('scope').value,'department');assert.equal(h.q('departmentFrom').value,department);assert.equal(h.q('departmentTo').value,department);assert.equal(h.q('approve').hidden,true);assert.equal(h.q('confirm').checked,false);assert.equal(h.posts().length,1,'A failed review is not automatically repeated or approved');
});

test('a late recovered batch after actor withdrawal stays hidden and keeps its original attempt',async t=>{
 const h=harness(t);await h.start();h.state.network=true;h.state.commitBeforeNetwork=true;await h.act('prepare');let release,entered;const started=new Promise(resolve=>entered=resolve);h.state.hold=async url=>{if(url.includes('resource=batch')){entered();await new Promise(resolve=>release=resolve);}};const recovering=h.act('recover');await started;h.state.operator='another-synthetic-operator';release();await recovering;assert.equal(h.q('result').hidden,true);assert.equal(h.q('previous').hidden,true);assert.equal(h.q('recover').hidden,false);assert.match(h.q('status').textContent,/Cambió la cuenta/);assert.equal(h.posts().length,1);
});

test('recovery history remains private to the current view and does not persist browser data',()=>{
 const js=fs.readFileSync(new URL('../assets/own-payroll-receipt-panel.js',import.meta.url),'utf8');assert.doesNotMatch(js,/localStorage|sessionStorage|indexedDB/);assert.match(js,/data-receipt-correct/);assert.match(js,/data-receipt-previous/);
});

test('unconsulted receipt scope does not claim zero documents or a signature failure',async t=>{
 const h=harness(t);assert.equal(h.q('empty').hidden,true);assert.equal(h.q('signature').hidden,true);h.event('taskchange',{id:'recibos'});await h.settled();assert.equal(h.q('empty').hidden,true);assert.equal(h.q('signature').hidden,true);assert.equal(h.q('pdf').disabled,true);assert.equal(h.posts().length,0);
});

test('verified empty scope explains the missing own closure and retains exact filters and offers preparation before closure',async t=>{
 const h=harness(t);await h.start();h.state.zero=true;await h.act('query','submit');assert.equal(h.q('empty').hidden,false);assert.match(h.q('emptyScope').textContent,/0 liquidaciones propias cerradas/);assert.match(h.q('empty').textContent,/cálculo propio confirmado y cerrado/);assert.match(h.q('empty').textContent,/no son recibos propios/);assert.equal(h.q('empty').querySelector('a').getAttribute('href'),'/nomina#calculo');assert.equal(h.q('empty').querySelector('a[href="/reportes#seleccion-documental"]').textContent,'Consultar documentos del respaldo');assert.equal(h.q('result').hidden,true);assert.equal(h.q('signature').hidden,true);assert.equal(h.q('pdf').disabled,true);assert.equal(h.q('prepare').disabled,true);assert.equal(h.posts().length,0);
 h.q('scope').value='employee';await h.act('scope','change');assert.equal(h.q('empty').hidden,true,'The empty state belongs only to its verified selection');assert.equal(h.q('emptyScope').textContent,'');
});

test('an unsigned nonempty preview keeps its review PDF available and explains its copy status',async t=>{
 const h=harness(t);await h.start();assert.equal(h.q('signature').hidden,false);assert.match(h.q('signature').textContent,/no requiere firma digital/);assert.match(h.q('signature').textContent,/COPIA PARA REVISIÓN/);assert.match(h.q('signature').textContent,/no acredita una firma ni un pago/);assert.equal(h.q('empty').hidden,true);assert.ok(!h.q('pdf').disabled);assert.equal(h.posts().length,0);
 h.hide();assert.equal(h.q('signature').hidden,true);assert.equal(h.q('result').hidden,true);assert.equal(h.q('pdf').disabled,true);
});

test('signature guidance never enables a review PDF whose closed source is no longer current',async t=>{
 const h=harness(t);await h.start();h.state.postError=null;await h.act('prepare');const b=[...h.batches.values()][0];b.sourceCurrent=false;b.permissions.canDownload=false;await h.act('history');await h.q('list').querySelector('button').emit('click');await h.settled();assert.equal(h.q('signature').hidden,false);assert.match(h.q('state').textContent,/fuentes cambiadas; descarga retirada/);assert.equal(h.q('pdf').disabled,true);assert.equal(h.q('empty').hidden,true);assert.equal(h.posts().length,1,'A source change is neither a new preparation nor a review decision');
});


test('receipt types start explicit and unchecked, with monthly visible and six secondary native choices',async t=>{
 const h=harness(t);assert.equal(h.q('types').tagName,'fieldset');assert.equal(h.q('types').querySelector('legend').textContent,'Tipos de liquidación');assert.equal(h.q('typeDetails').tagName,'details');assert.equal(h.q('typeDetails').open,false);
 for(const [type,label]of Object.entries(OWN_RUN_TYPES)){assert.equal(h.q('type-'+type).tagName,'input');assert.equal(h.q('type-'+type).type,'checkbox');assert.equal(h.q('type-'+type).checked,false);assert.equal(h.q('type-'+type).parentElement.getAttribute('for'),'ownReceiptType-'+type);assert.match(h.q('type-'+type).parentElement.textContent,new RegExp(label));}
 assert.equal(h.q('type-monthly').parentElement.parentElement,h.q('types'));assert.equal(h.q('typeCount').textContent,'0 tipos seleccionados');assert.match(h.q('all').textContent,/Seleccionar los 7 tipos/);assert.equal(h.q('all').parentElement,h.q('typeDetails'));assert.equal(h.posts().length,0);
});
test('choosing a new type removes prior PDF and ACK while preserving period, ranges and emission draft',async t=>{
 const h=harness(t);await h.start();h.q('date').value='2026-09-30';h.q('legend').value='Leyenda sintética conservada';h.q('confirm').checked=true;assert.ok(!h.q('pdf').disabled);
 const period=h.q('period').value,scope=h.q('scope').value;h.q('type-vacation').checked=true;await h.act('type-vacation','change');assert.equal(h.q('pdf').disabled,true);assert.equal(h.q('prepare').disabled,true);assert.equal(h.q('confirm').checked,false);assert.equal(h.q('result').hidden,true);assert.equal(h.q('period').value,period);assert.equal(h.q('scope').value,scope);assert.equal(h.q('date').value,'2026-09-30');assert.equal(h.q('legend').value,'Leyenda sintética conservada');assert.equal(h.q('typeCount').textContent,'2 tipos seleccionados');assert.equal(h.q('status').dataset.state,'neutral');assert.match(h.q('status').textContent,/Tipos actualizados/);assert.equal(h.posts().length,0);
 await h.act('query','submit');assert.deepEqual(h.requests.filter(r=>r.body?.operation==='preview').at(-1).body.params.types,ownReceiptParams({...h.state.lastPreview.snapshot.params,types:['monthly','vacation']}).types);assert.ok(!h.q('pdf').disabled);
});
test('select all remains a secondary explicit action and cannot retain an old review',async t=>{
 const h=harness(t);await h.start();h.q('confirm').checked=true;await h.act('all');assert.ok(Object.keys(OWN_RUN_TYPES).every(type=>h.q('type-'+type).checked));assert.equal(h.q('typeCount').textContent,'7 tipos seleccionados');assert.equal(h.q('pdf').disabled,true);assert.equal(h.q('confirm').checked,false);assert.equal(h.q('status').dataset.state,'neutral');assert.ok(!h.q('status').textContent.includes('Elegiste todos'));assert.equal(h.posts().length,0);await h.act('query','submit');assert.deepEqual(h.requests.filter(r=>r.body?.operation==='preview').at(-1).body.params.types,Object.keys(OWN_RUN_TYPES).sort());
});
test('no selected type cannot issue a preview, prepare a body or silently restore monthly/all',async t=>{
 const h=harness(t);await h.start();h.q('type-monthly').checked=false;await h.act('type-monthly','change');const before=h.requests.filter(r=>r.body?.operation==='preview').length;await h.act('query','submit');assert.equal(h.requests.filter(r=>r.body?.operation==='preview').length,before);assert.match(h.q('status').textContent,/Elegí al menos un tipo/);assert.equal(h.q('typeCount').textContent,'0 tipos seleccionados');assert.ok(Object.keys(OWN_RUN_TYPES).every(type=>!h.q('type-'+type).checked));assert.equal(h.posts().length,0);
});
test('multi-type uncertain command retains its original body/key and is not altered by the chooser',async t=>{
 const h=harness(t);await h.start();h.q('type-vacation').checked=true;await h.act('type-vacation','change');await h.act('query','submit');h.q('reason').value='Preparación múltiple exclusivamente sintética';h.state.network=true;await h.act('prepare');const original=structuredClone(h.posts()[0]);assert.equal(h.q('fields').disabled,true);await h.act('all');assert.equal(h.q('typeCount').textContent,'2 tipos seleccionados');assert.equal(h.posts().length,1);h.state.network=false;await h.act('retry');assert.deepEqual(h.posts()[1],original);assert.equal(h.q('recover').hidden,true);assert.deepEqual(h.posts()[1].body.payload.params.types,['monthly','vacation']);
});
test('zero closed receipts retains the exact department filter and points to preparation rather than only closing',async t=>{
 const h=harness(t);await h.start();h.state.zero=true;h.q('scope').value='department';await h.act('scope','change');h.q('departmentFrom').value='35';h.q('departmentTo').value='35';await h.act('query','submit');assert.equal(h.q('empty').hidden,false);assert.match(h.q('emptyScope').textContent,/Repartición 35/);assert.match(h.q('emptyScope').textContent,/Mensual/);assert.match(h.q('empty').textContent,/preparación y el cálculo/);assert.equal(h.q('empty').querySelector('a').getAttribute('href'),'/nomina#calculo');assert.equal(h.q('scope').value,'department');assert.equal(h.q('departmentFrom').value,'35');assert.equal(h.q('departmentTo').value,'35');assert.equal(h.q('type-monthly').checked,true);assert.equal(h.q('pdf').disabled,true);assert.equal(h.q('prepare').disabled,true);assert.equal(h.q('confirm').checked,false);assert.equal(h.posts().length,0);
});

test('closed secondary types retain their exact visible and atomic selection without changing the query',async t=>{
 const h=harness(t);await h.start();h.q('date').value='2026-10-30';h.q('legend').value='Leyenda sintética conservada';h.q('type-monthly').checked=false;h.q('type-sac').checked=true;h.q('type-vacation').checked=true;await h.act('type-sac','change');h.q('typeDetails').open=false;
 assert.equal(h.q('typeCount').textContent,'2 tipos seleccionados');assert.equal(h.q('typeSelection').textContent,' · Aguinaldo, Vacaciones');assert.equal(h.q('typeSelection').parentElement,h.q('typeCount').parentElement);assert.equal(h.q('typeCount').parentElement.getAttribute('role'),'status');assert.equal(h.q('typeCount').parentElement.getAttribute('aria-live'),'polite');assert.equal(h.q('typeCount').parentElement.getAttribute('aria-atomic'),'true');assert.equal(h.q('types').getAttribute('aria-describedby'),'ownReceiptTypeHelp ownReceiptTypeSelection');assert.equal(h.q('typeSelection').parentElement.parentElement,h.q('types'));
 assert.equal(h.q('date').value,'2026-10-30');assert.equal(h.q('legend').value,'Leyenda sintética conservada');assert.equal(h.q('result').hidden,true);assert.equal(h.q('pdf').disabled,true);assert.equal(h.posts().length,0);
 await h.act('query','submit');assert.deepEqual(h.state.lastPreview.snapshot.params.types,['sac','vacation']);assert.equal(h.state.lastPreview.snapshot.params.paymentDate,'2026-10-30');assert.equal(h.state.lastPreview.snapshot.params.legend,'Leyenda sintética conservada');
});
