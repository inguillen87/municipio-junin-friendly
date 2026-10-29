// Actual bootstrap/navigation functions, recorded from before authentication.
// No API, SQL, browser session or native acceptance is simulated by this test.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../internal-dashboard.html',import.meta.url),'utf8');
const own='70000000-0000-4000-8000-000000000001',imported='a9b7149d-d62a-0e7f-444f-33c4129c417a';
const piece=(name,end)=>{const begin=source.indexOf('      '+name),finish=source.indexOf('      '+end,begin);assert.ok(begin>=0&&finish>begin,name);return source.slice(begin,finish);};
// These ends are present in both the unpatched parent and the proposed child.
const detailStart=source.indexOf('      function detailRequestFromLocation()'),authStart=source.indexOf('      async function authenticate()');
assert.ok(detailStart>0&&authStart>detailStart);
const boot=source.slice(detailStart,authStart)+piece('async function authenticate()','function viewFromLocation()')+piece('function viewFromLocation()','function showView(')+piece('function showView(','function normalizeSectorRows(')+piece('function showDialog()','function loadEmployeeFamilyPanel()')+piece('async function openEmployee(','function detailField(')+piece('function refreshCurrentView()','let searchTimer');
function harness(url,{allowed=true,hidden=false,denyAuth=false}={}){
 const requests=[],mounts=[],events=[],errors=[];class Node{constructor(){this.children=[];this.attrs={};this.open=false;this.hidden=false;this.dataset={};this.disabled=false;this.isConnected=true;}append(...values){this.children.push(...values);}appendChild(v){this.append(v);}replaceChildren(...v){this.children=v;}setAttribute(k,v){this.attrs[k]=v;}removeAttribute(k){delete this.attrs[k];if(k==='open')this.open=false;}showModal(){this.open=true;}close(){this.open=false;}focus(){}}
 const els=Object.fromEntries(['gateTitle','gateMessage','gateSpinner','retryAuth','workToday','userName','userRole','authGate','appShell','breadcrumbCurrent','topbarViewTitle','dialogTitle','dialogSubtitle','dialogBody','employeeDialog','refreshButton'].map(k=>[k,new Node()]));
 const state={tenantCapabilities:new Set(allowed?['workforce.employee.read','employee.record.propose']:[]),payrollSummaryControllers:new Set(),currentView:'inicio',employeesLoaded:false,employeesLoading:false,pagination:{page:1}};
 const location=new URL(url,'https://municontrol.test'),module={mountFamilyCertificates:(host,options)=>mounts.push({host,options})};
 const box={AbortController,URLSearchParams,Boolean,Set,Promise,Event:class{constructor(type){this.type=type;}},state,els,AUTH_URL:'/api/internal-auth',DATA_URL:'/api/internal-data',VALID_VIEWS:new Set(['inicio','legajos','ausentismo','calidad']),text:v=>v==null?'':String(v).trim(),window:{location,history:{pushState(){}},scrollTo(){}},document:{hidden,querySelectorAll:()=>[],querySelector:()=>null,dispatchEvent:e=>events.push(e.type),createTextNode:v=>({textContent:String(v)})},create:(_tag,_cls,value)=>Object.assign(new Node(),{textContent:value||''}),requestJSON:async url=>{requests.push(url);return denyAuth?{}:{ok:true,user:{name:'Actor sintético',role:'reader'},access:{}};},normalizeUser:p=>p.user??null,applyNavigationAccess(){},redirectToLogin:()=>events.push('login'),friendlyNetworkError:()=> 'SAFE',loadSummary:()=>{requests.push('/api/internal-data?resource=summary');return Promise.resolve({ok:true});},loadEmployees:()=>{if(state.employeesLoading)return Promise.resolve({pending:true});state.employeesLoading=true;requests.push('/api/internal-data?resource=employees');return Promise.resolve({ok:true});},loadEmployeeFamilyPanel:async()=>module,normalizeEmployeeDetail:()=>({employee:{recordOrigin:'MUNICONTROL',contractId:own}}),renderEmployeeDetail:()=>events.push('ordinary-detail'),renderDetailError:e=>errors.push(e),toast(){},UnauthorizedError:class extends Error{}};
 vm.runInNewContext(boot+'\nglobalThis.run=authenticate;globalThis.view=showView;globalThis.close=closeDialog;globalThis.refresh=refreshCurrentView;',box);
 return{...box,requests,mounts,events,errors};
}
const backgrounds=h=>h.requests.filter(url=>/[?&]resource=(?:employees|summary)\b/.test(url));
test('explicit UUID family entry does not start the whole directory or summary from before auth',async()=>{
 for(const id of [own,imported]){const h=harness('/personal?'+new URLSearchParams({contractId:id,legajo:'QA-001',section:'family'})+'#legajos');assert.deepEqual(h.requests,[]);await h.run();await Promise.resolve();assert.equal(h.requests[0],'/api/internal-auth');assert.deepEqual(backgrounds(h),[]);assert.equal(h.mounts.length,1);assert.equal(h.mounts[0].options.contractId,id);assert.equal(h.state.familyEntryBackgroundDeferred,true);assert.equal(h.errors.length,0);}
});
test('ordinary directory, ordinary detail and legajo-only family links retain normal source loading',async()=>{
 for(const url of ['/personal#legajos','/personal?contractId='+own+'#legajos','/personal?legajo=123&section=family#legajos']){const h=harness(url);await h.run();await Promise.resolve();assert.ok(backgrounds(h).some(v=>v.includes('resource=employees')));assert.ok(backgrounds(h).some(v=>v.includes('resource=summary')));assert.ok(!h.state.familyEntryBackgroundDeferred);}
});
test('voluntary close resumes the deferred list and summary once and retains every abort/withdrawal event',async()=>{
 const h=harness('/personal?contractId='+own+'&section=family#legajos');await h.run();await Promise.resolve();assert.equal(h.mounts.length,1);h.close(true);assert.equal(backgrounds(h).filter(v=>v.includes('resource=employees')).length,1);assert.equal(backgrounds(h).filter(v=>v.includes('resource=summary')).length,1);assert.equal(h.state.familyEntryBackgroundDeferred,false);assert.equal(h.state.detailController.signal.aborted,true);assert.ok(h.events.includes('mc:family-schooling-close')&&h.events.includes('mc:native-employment-change-close'));h.close(true);assert.equal(backgrounds(h).length,2);
});
test('programmatic withdrawal, hidden tab and revoked read authority do not start deferred background reads',async()=>{
 for(const mode of ['withdraw','hidden','revoked']){const h=harness('/personal?contractId='+own+'&section=family#legajos');await h.run();await Promise.resolve();if(mode==='hidden')h.document.hidden=true;if(mode==='revoked')h.state.tenantCapabilities.clear();h.close(mode!=='withdraw');assert.deepEqual(backgrounds(h),[]);assert.equal(h.state.detailController.signal.aborted,true);assert.equal(h.els.employeeDialog.open,false);}
});
test('explicit navigation and manual refresh load deferred background data through the existing readers',async()=>{
 const h=harness('/personal?contractId='+own+'&section=family#legajos');await h.run();await Promise.resolve();h.view('legajos',true,true);assert.equal(h.state.familyEntryBackgroundDeferred,false);assert.equal(backgrounds(h).filter(v=>v.includes('resource=employees')).length,1);assert.equal(backgrounds(h).filter(v=>v.includes('resource=summary')).length,1);
 const r=harness('/personal?contractId='+own+'&section=family#legajos');await r.run();await Promise.resolve();r.refresh();await Promise.resolve();assert.equal(r.state.familyEntryBackgroundDeferred,false);assert.equal(backgrounds(r).length,2);
});
test('authentication denial and malformed/duplicate family destinations cannot activate the direct deferred path',async()=>{
 const denied=harness('/personal?contractId='+own+'&section=family#legajos',{denyAuth:true});await denied.run();assert.deepEqual(denied.requests,['/api/internal-auth']);assert.equal(denied.mounts.length,0);
 for(const url of ['/personal?contractId=not-uuid&section=family#legajos','/personal?contractId='+own+'&contractId='+imported+'&section=family#legajos']){const h=harness(url);await h.run();assert.equal(h.mounts.length,0);assert.ok(!h.state.familyEntryBackgroundDeferred);assert.ok(backgrounds(h).length>0);}
});
