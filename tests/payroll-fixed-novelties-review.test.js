import test from 'node:test';
import assert from 'node:assert/strict';
import {fixedComparison,fixedDetailEqual,fixedSubjectEqual} from '../assets/payroll-fixed-novelties-model.js';
import {fixedApprovedRecord,fixedValues,fixedNativeSubject,fixedFixture,fixedUuid} from './fixtures/payroll-fixed-novelties-synthetic.js';

test('complete comparison preserves all ten fields with no artificial changes',()=>{
 const row=fixedApprovedRecord(1),review=fixedComparison(row,'set',row.approved.values);
 assert.equal(review.fields.length,10);assert.equal(new Set(review.fields.map(f=>f.key)).size,10);assert.equal(review.fields.filter(f=>f.changed).length,0);
 assert.equal(review.fields.find(f=>f.key==='amountCents').before,'Sin importe informado');assert.equal(Object.isFrozen(review.fields[0]),true);
});

for(const [key,value] of Object.entries(fixedValues({conceptSourceId:'638',costCenterSourceId:'0',payrollType:'sac',quantityDecimal:'1.000001',amountCents:'0',forced:true,forcedReason:'Fundamento respaldado QA',legalInstrument:'Otro acto sintético QA',validFrom:'2026-10-01',validTo:null})))test('comparison exposes the declared change in '+key,()=>{
 const row=fixedApprovedRecord(1),next={...row.approved.values,[key]:value};if(key==='forced'||key==='forcedReason'){next.forced=true;next.amountCents='0';next.forcedReason='Fundamento respaldado QA';}
 const field=fixedComparison(row,'set',next).fields.find(f=>f.key===key);assert.equal(field.changed,true);assert.notEqual(field.before,field.after);assert.equal(row.approved.values[key],fixedValues()[key]);
});

test('annulment explicitly retires all approved values while preserving the source and history',()=>{
 const row=fixedApprovedRecord(2,{amountCents:'0'}),original=structuredClone(row),review=fixedComparison(row,'annul',null);
 assert.equal(review.beforePresent,true);assert.equal(review.afterPresent,false);assert.equal(review.fields.filter(f=>f.changed).length,10);assert.equal(review.fields.find(f=>f.key==='amountCents').before,'$ 0,00');assert.equal(review.fields.every(f=>f.after==='Sin versión aprobada'),true);assert.deepEqual(row,original);
});

test('an initial proposal distinguishes absence of an approved version from a declared null field',()=>{
 const review=fixedComparison(null,'set',fixedValues());assert.equal(review.beforePresent,false);assert.equal(review.afterPresent,true);assert.equal(review.fields.find(f=>f.key==='amountCents').before,'Sin versión aprobada');assert.equal(review.fields.find(f=>f.key==='amountCents').after,'Sin importe informado');
 assert.equal(review.fields.find(f=>f.key==='validTo').after,'2026-12-31');assert.equal(fixedComparison(null,'set',fixedValues({validTo:null})).fields.find(f=>f.key==='validTo').after,'Sin vencimiento informado');
});

test('comparison keeps exact declared decimals and large cents without converting to floating point',()=>{
 const review=fixedComparison(fixedApprovedRecord(1),'set',fixedValues({quantityDecimal:'1.000000',amountCents:'999999999999999999'}));
 assert.equal(review.fields.find(f=>f.key==='quantityDecimal').after,'1.000000');assert.equal(review.fields.find(f=>f.key==='quantityDecimal').changed,true);assert.equal(review.fields.find(f=>f.key==='amountCents').after,'$ 9.999.999.999.999.999,99');
});

test('invalid operation and invalid values cannot produce a review',()=>{
 assert.throws(()=>fixedComparison(null,'calculate',fixedValues()));assert.throws(()=>fixedComparison(null,'annul',fixedValues()));assert.throws(()=>fixedComparison(null,'set',{...fixedValues(),extra:1}));
});

test('full detail equality accepts equivalent property order and rejects a same-version amount change',()=>{
 const f=fixedFixture(),row=fixedApprovedRecord(1);f.state.records.push(row);const original=f.detail(row.id),ordered=JSON.parse(JSON.stringify(original,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).reverse()):v));
 assert.equal(fixedDetailEqual(original,ordered),true);const changed=structuredClone(original);for(const p of [changed.record.approved,changed.record.latest,...changed.history])p.values.amountCents='0';assert.equal(changed.record.version,original.record.version);assert.equal(fixedDetailEqual(original,changed),false);
});

test('fresh comparison covers an older historical proposal even with an unchanged current record',()=>{
 const f=fixedFixture(),subject=fixedNativeSubject();f.state.subjects.set(subject.contractId,subject);
 const body={recordId:null,expectedVersion:0,contractId:subject.contractId,legajo:subject.legajo,identityToken:subject.identityToken,operation:'set',values:fixedValues(),reason:'Propuesta sintética inicial'};
 let receipt=f.mutate('propose',body,fixedUuid(1)).data;
 for(let i=0;i<3;i++){
  f.state.role='reviewer';f.mutate('review',{recordId:receipt.recordId,proposalId:receipt.proposalId,expectedVersion:receipt.recordVersion,decision:i===2?'reject':'approve',reason:'Decisión sintética independiente'},fixedUuid(10+i));
  if(i<2){f.state.role='preparer';receipt=f.mutate('propose',{...body,recordId:receipt.recordId,expectedVersion:receipt.recordVersion+1,values:fixedValues({quantityDecimal:String(i+2)})},fixedUuid(20+i)).data;}
 }
 const original=f.detail(receipt.recordId),changed=structuredClone(original);changed.history.at(-1).reason='Otra evidencia histórica sintética';assert.deepEqual(changed.record,original.record);assert.equal(fixedDetailEqual(original,changed),false);
});

test('native identity equality checks source metadata without relying on JSON property order',()=>{
 const original=fixedNativeSubject(),ordered=Object.fromEntries(Object.entries(original).reverse());assert.equal(fixedSubjectEqual(original,ordered),true);
 for(const change of [{identityToken:'f'.repeat(64)},{registrationId:fixedUuid(600)},{employeeName:'OTRO AGENTE SINTÉTICO'}])assert.equal(fixedSubjectEqual(original,{...original,...change}),false);
 assert.throws(()=>fixedSubjectEqual(original,{...original,sourceCutoff:'2026-09-01T12:00:00Z'}));
});


// Causal identity continuity: real editor/lookup/control functions, minimal DOM.
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {fixedSubject} from './fixtures/payroll-fixed-novelties-synthetic.js';
import {fixedEmployee,fixedPrincipalKey,fixedCapability,fixedOriginLabel,fixedMoneyInput,FIXED_TYPES} from '../assets/payroll-fixed-novelties-model.js';
class FixedIdentityElement {
 constructor(tag='div'){this.tagName=tag.toLowerCase();this.children=[];this.parentElement=null;this.attributes={};this.dataset={};this.listeners=new Map();this.hidden=false;this.disabled=false;this.readOnly=false;this.checked=false;this.value='';this._text='';this.inputMode='';this.isConnected=true;}
 append(...nodes){for(const child of nodes){child.parentElement=this;this.children.push(child);}}
 prepend(...nodes){for(const child of nodes)child.parentElement=this;this.children.unshift(...nodes);}
 replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes);}
 remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(child=>child!==this);this.isConnected=false;}
 set textContent(value){this._text=String(value);this.children=[];}
 get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
 setAttribute(name,value){this.attributes[name]=String(value);if(name==='hidden')this.hidden=true;if(name==='disabled')this.disabled=true;}
 getAttribute(name){if(name.startsWith('data-')){const key=name.slice(5).replace(/-([a-z])/g,(_m,c)=>c.toUpperCase());if(Object.hasOwn(this.dataset,key))return this.dataset[key];}return this.attributes[name]??null;}
 toggleAttribute(name,force){if(force)this.setAttribute(name,'');else{delete this.attributes[name];if(name==='disabled')this.disabled=false;if(name==='hidden')this.hidden=false;}}
 matches(selector){if(selector.includes(','))return selector.split(',').some(part=>this.matches(part));const match=/^(?:([\w-]+))?\[([\w-]+)(?:="([^"]*)")?\]$/.exec(selector);if(match)return(!match[1]||this.tagName===match[1])&&this.getAttribute(match[2])!==null&&(match[3]===undefined||this.getAttribute(match[2])===match[3]);return this.tagName===selector;}
 querySelectorAll(selector){const result=[];const walk=node=>{for(const child of node.children){if(child.matches(selector))result.push(child);walk(child);}};walk(this);return result;}
 querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
 closest(selector){for(let node=this;node;node=node.parentElement)if(node.matches(selector))return node;return null;}
 addEventListener(type,listener){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(listener);}
 async emit(type){if(type==='click'&&this.disabled)return;for(let node=this;node;node=node.parentElement)for(const listener of node.listeners.get(type)??[])await listener({target:this,preventDefault(){}});}
 focus(){} scrollIntoView(){} reset(){}
}
function fixedIdentityFunction(source,name){
 const match=new RegExp('(^|\\n)([ ]*)(?:async )?function '+name+'\\(').exec(source);assert.ok(match,'Real function '+name);
 const start=match.index+match[1].length,next=new RegExp('\\n'+match[2]+'(?:async )?function [A-Za-z]+\\(').exec(source.slice(start+1));assert.ok(next,'Next real function boundary '+name);
 return source.slice(start,start+1+next.index);
}
function fixedIdentityHarness(){
 const source=readFileSync(process.env.MC_FIXED_NATIVE_SOURCE||new URL('../assets/payroll-fixed-novelties.js',import.meta.url),'utf8');
 const host=new FixedIdentityElement(),shell=new FixedIdentityElement('details');shell.open=true;shell.append(host);
 for(const name of ['new','csv','xlsx','junin638','txt638-availability','refresh','previous','next','period','search','filter','editor','list','detail','count','pagination','txt638-review','status']){const element=new FixedIdentityElement(['period','search'].includes(name)?'input':name==='filter'?'select':'div');element.setAttribute('data-fn-'+name,'');host.append(element);}
 const fixture=fixedFixture(),requests=[],pickerCalls=[],subjects=new Map(),response={failure:null},locks=[];
 const context=vm.createContext({document:{hidden:false,createElement:tag=>new FixedIdentityElement(tag)},Set,Map,Intl,Date,AbortController,structuredClone,fixedEmployee:(payload,expected)=>fixedEmployee(payload,typeof expected==='string'?expected:structuredClone(expected)),fixedPrincipalKey,fixedCapability,fixedOriginLabel,fixedMoneyInput,FIXED_TYPES,host,shell,initialBootstrap:fixture.bootstrap(),requests,pickerCalls,subjects,response,locks,
  request:async query=>{requests.push(structuredClone(query));if(response.failure)throw response.failure;const subject=query.contractId?subjects.get(query.contractId):fixedSubject(query.legajo);assert.ok(subject,'Synthetic subject lookup exists');return{ok:true,data:{version:'payroll-fixed-employee.v1',subject:structuredClone(subject)}};},
  createEmployeePicker:configuration=>({close(){},open:options=>pickerCalls.push({configuration,options})}),
  previewProposal(){throw Error('Preview outside identity-only tests');},prepareSend(){throw Error('Business send outside identity-only tests');},sendAttempt(){throw Error('Business retry outside identity-only tests');}
 });
 const declarations=['node','button','dayLabel','isGroupKind'].map(name=>{const match=new RegExp('^const '+name+'=.*$','m').exec(source);assert.ok(match,'Real declaration '+name);return match[0];}).join('\n');
 const functions=['status','clearTxtReview','clearConsulted','controls','operation','makeField','editorShell','openEditor','showSubject','lookupContract','lookupEmployee','errorMessage'].map(name=>fixedIdentityFunction(source,name)).join('\n');
 vm.runInContext(declarations+String.raw`
 let mounted=true,externalBusy=false,busy=false,stopped=false,seq=0,controller=null,reportedLock=false,bootstrap=initialBootstrap,data=null,detail=null,editor=null,attempt=null,picker=null,directoryAllowed=true,page=1;
 const access=new Set(['payroll.novelty.read','payroll.novelty.nominal.read']),groupIds=new Set(),reviewGroupIds=new Set();
 const $=selector=>host.querySelector(selector),available=()=>!stopped&&shell.isConnected&&shell.open&&!document.hidden;
 const can=capability=>fixedCapability(bootstrap,access,capability),allowedPrepare=()=>can('payroll.fixed.prepare')&&bootstrap.principal.employmentLinked,allowedReview=()=>can('payroll.fixed.approve')&&bootstrap.principal.employmentLinked;
 const onLock=value=>locks.push(value),groupAllowedPrepare=()=>false,groupAllowedReview=()=>false,groupAuthority=()=>false;
 const txtAvailability=()=>({ready:false,message:''}),selected=()=>({rows:[]});
 function deny(){clearConsulted();}
 `+functions+String.raw`
 globalThis.identityApi={
 open:subject=>openEditor(null,'set',subject),lookupEmployee,lookupContract,controls,clearConsulted,
 get editor(){return editor;},get busy(){return busy;},
 setBusy:value=>{busy=value;controls();},setExternalBusy:value=>{externalBusy=value;controls();},setAttempt:value=>{attempt=value;controls();},setDirectory:value=>{directoryAllowed=value;controls();},setRow:value=>{editor.row=value;controls();},setBootstrap:value=>{bootstrap=value;controls();},get bootstrap(){return bootstrap;},find:name=>editor.form.querySelector('[data-fn-'+name+']')
 };
 `,context,{filename:'real-payroll-fixed-identity-functions.js'});
 return{api:context.identityApi,fixture,requests,pickerCalls,subjects,response,host,settle:()=>new Promise(resolve=>setImmediate(resolve))};
}
const ownFixedIdentity=(legajo='9001',n=1)=>({...fixedNativeSubject(),contractId:fixedUuid(91000+n),registrationId:fixedUuid(92000+n),legajo,employeeName:'PERSONA PROPIA SINTETICA '+n});
const plain=value=>JSON.parse(JSON.stringify(value));

test('identidad fija propia numerica no consulta homonimo GRH ni borra UUID',async()=>{
 const h=fixedIdentityHarness(),own=ownFixedIdentity();h.subjects.set(own.contractId,own);h.api.open(own);const feedback=h.api.editor.feedback.textContent,before=plain(h.api.editor.subject);
 await h.api.lookupEmployee();assert.equal(h.requests.length,0);assert.deepEqual(plain(h.api.editor.subject),before);assert.equal(h.api.editor.lookupContractId,own.contractId);assert.equal(h.api.editor.fields.legajo.value,'9001');assert.equal(h.api.editor.feedback.textContent,feedback);
});
test('identidad fija propia alfanumerica preserva valor exacto sin error historico',async()=>{
 const h=fixedIdentityHarness(),own=ownFixedIdentity(' A/009010 ');h.api.open(own);const before=h.api.editor.feedback.textContent;
 await h.api.lookupEmployee();assert.equal(h.requests.length,0);assert.equal(h.api.editor.subject.contractId,own.contractId);assert.equal(h.api.editor.lookupContractId,own.contractId);assert.equal(h.api.editor.fields.legajo.value,own.legajo);assert.equal(h.api.editor.feedback.textContent,before);
});
test('identidad fija propia UUID pendiente tras fallo no cae a lookup numerico',async()=>{
 const h=fixedIdentityHarness(),own=ownFixedIdentity();h.api.open();h.api.editor.fields.legajo.value=own.legajo;h.response.failure=Object.assign(Error('Fallo sintetico de consulta'),{status:503});
 const pending=h.api.lookupContract(own.contractId);assert.equal(h.api.editor.lookupContractId,own.contractId);await pending;
 assert.equal(h.api.editor.subject,null);assert.equal(h.api.editor.lookupContractId,own.contractId);assert.deepEqual(plain(h.requests),[{resource:'employee',contractId:own.contractId}]);
 h.response.failure=null;await h.api.lookupEmployee();assert.equal(h.requests.length,1);assert.equal(h.api.editor.lookupContractId,own.contractId);assert.equal(h.api.find('lookup').hidden,true);assert.equal(h.api.find('lookup').disabled,true);assert.equal(h.api.editor.fields.legajo.inputMode,'text');assert.equal(h.api.editor.fields.legajo.readOnly,true);
});
test('identidad fija propia picker cambia persona explicitamente y revalida UUID exacto',async()=>{
 const h=fixedIdentityHarness(),first=ownFixedIdentity(),second=ownFixedIdentity(' B/001 ',2);h.subjects.set(first.contractId,first);h.subjects.set(second.contractId,second);h.api.open(first);
 assert.equal(h.api.find('choose').textContent,'Cambiar persona');await h.api.find('choose').emit('click');assert.equal(h.pickerCalls.length,1);assert.equal(h.pickerCalls[0].configuration.canUse(),true);
 const use=h.pickerCalls[0].options.onUse;use([]);use([{contractId:first.contractId},{contractId:second.contractId}]);assert.equal(h.requests.length,0);assert.equal(h.api.editor.subject.contractId,first.contractId);
 use([{contractId:second.contractId}]);await h.settle();assert.deepEqual(plain(h.requests),[{resource:'employee',contractId:second.contractId}]);assert.equal(h.api.editor.subject.contractId,second.contractId);assert.equal(h.api.editor.lookupContractId,second.contractId);assert.equal(h.api.editor.fields.legajo.value,second.legajo);assert.equal(h.api.editor.fields.legajo.readOnly,true);
});
test('identidad fija propia mantiene lookup numerico historico sin UUID',async()=>{
 const h=fixedIdentityHarness();h.api.open();assert.equal(h.api.find('choose').textContent,'Buscar y elegir persona');assert.equal(h.api.find('lookup').hidden,false);assert.equal(h.api.find('lookup').disabled,false);assert.equal(h.api.editor.fields.legajo.inputMode,'numeric');
 h.api.editor.fields.legajo.value=' 9001 ';await h.api.lookupEmployee();assert.deepEqual(plain(h.requests),[{resource:'employee',legajo:'9001'}]);assert.equal(h.api.editor.lookupContractId,null);assert.equal(h.api.editor.subject.contractId,fixedSubject('9001').contractId);assert.equal(h.api.editor.fields.legajo.readOnly,false);assert.equal(h.api.find('lookup').hidden,false);assert.equal(h.api.find('choose').textContent,'Cambiar persona');
});
test('identidad fija propia controls distingue propia UUID e historica no seleccionada',()=>{
 const h=fixedIdentityHarness(),own=ownFixedIdentity();h.api.open(own);
 assert.equal(h.api.find('lookup').hidden,true);assert.equal(h.api.find('lookup').disabled,true);assert.equal(h.api.find('legacy-lookup-note').hidden,true);assert.equal(h.api.editor.fields.legajo.inputMode,'text');assert.equal(h.api.editor.fields.legajo.readOnly,true);
 h.api.editor.subject=null;h.api.controls();assert.equal(h.api.find('lookup').hidden,true);assert.equal(h.api.find('choose').textContent,'Cambiar persona');
 h.api.editor.lookupContractId=null;h.api.editor.fields.legajo.readOnly=false;h.api.controls();assert.equal(h.api.find('lookup').hidden,false);assert.equal(h.api.find('legacy-lookup-note').hidden,false);assert.equal(h.api.editor.fields.legajo.inputMode,'numeric');assert.equal(h.api.find('choose').textContent,'Buscar y elegir persona');
 h.api.editor.subject=own;h.api.controls();assert.equal(h.api.find('lookup').hidden,true);assert.equal(h.api.find('lookup').disabled,true);
});
test('identidad fija propia chooser conserva gates busy attempt row directorio y permiso',async()=>{
 const h=fixedIdentityHarness();h.api.open(ownFixedIdentity());
 for(const [set,value,reset]of [[h.api.setBusy,true,false],[h.api.setExternalBusy,true,false],[h.api.setAttempt,{command:'propose'},null],[h.api.setDirectory,false,true],[h.api.setRow,{id:fixedUuid(6)},null]]){
  set(value);assert.equal(h.api.find('choose').disabled,true);await h.api.find('choose').emit('click');assert.equal(h.pickerCalls.length,0);set(reset);assert.equal(h.api.find('choose').disabled,false);
 }
 const bootstrap=structuredClone(h.fixture.bootstrap());bootstrap.principal.capabilities=bootstrap.principal.capabilities.filter(cap=>cap!=='payroll.fixed.prepare');h.api.setBootstrap(bootstrap);assert.equal(h.api.find('choose').disabled,true);await h.api.find('choose').emit('click');assert.equal(h.pickerCalls.length,0);
 bootstrap.principal.capabilities.push('payroll.fixed.prepare');bootstrap.principal.employmentLinked=false;h.api.setBootstrap(bootstrap);assert.equal(h.api.find('choose').disabled,true);
 h.api.setBootstrap(h.fixture.bootstrap());h.api.setDirectory(false);assert.equal(h.api.find('choose').hidden,true);h.api.setDirectory(true);assert.equal(h.api.find('choose').hidden,false);assert.equal(h.requests.length,0);
});
test('identidad fija propia evento input tardio no borra pin ni subject propio',async()=>{
 const h=fixedIdentityHarness(),own=ownFixedIdentity(' A/009010 ');h.api.open(own);h.api.editor.fields.legajo.value='otro texto programatico';await h.api.editor.fields.legajo.emit('input');
 assert.equal(h.api.editor.lookupContractId,own.contractId);assert.equal(h.api.editor.subject.contractId,own.contractId);assert.equal(h.requests.length,0);
 h.api.editor.subject=null;await h.api.editor.fields.legajo.emit('input');assert.equal(h.api.editor.lookupContractId,own.contractId);
});
test('identidad fija propia invalidacion y reconsulta fallida conservan pin original',async()=>{
 const h=fixedIdentityHarness(),own=ownFixedIdentity();h.subjects.set(own.contractId,own);h.api.open(own);h.api.clearConsulted();
 assert.equal(h.api.editor.lookupContractId,own.contractId);h.api.controls();assert.equal(h.api.find('lookup').hidden,true);
 h.api.setBootstrap(h.fixture.bootstrap());h.response.failure=Object.assign(Error('Sesion sintetica denegada'),{status:403});await h.api.lookupContract(own.contractId);
 assert.equal(h.api.editor.lookupContractId,own.contractId);await h.api.lookupEmployee();assert.deepEqual(plain(h.requests),[{resource:'employee',contractId:own.contractId}]);
 h.api.setBootstrap(h.fixture.bootstrap());h.response.failure=null;await h.api.lookupContract(own.contractId);
 assert.deepEqual(plain(h.requests),[{resource:'employee',contractId:own.contractId},{resource:'employee',contractId:own.contractId}]);assert.equal(h.api.editor.subject.origin,'MUNICONTROL');assert.equal(h.api.editor.fields.legajo.value,own.legajo);
});
