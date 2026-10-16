import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeEmployeePickerReader} from '../assets/employee-picker.js';
import {nativePayrollPickerView,nativePayrollPickerSelection} from '../assets/employee-picker-model.js';
import {ownRunWorkspaceAccess} from '../assets/own-payroll-run-workspace-model.js';
import {OWN_PAYROLL_READINESS_ROSTER_URL} from '../assets/own-payroll-readiness-model.js';
import {roster,id} from './fixtures/native-roster-synthetic.js';
const READ=['workforce.employee.read','payroll.parameter.read'];
const data=()=>{const r=roster(851);r.version='native-roster.v2';r.counts.unknown=0;r.rows=r.rows.map(row=>({...row,recordKind:'hire'}));Object.assign(r.rows[0],{recordKind:'adopted',legajo:'1339',sexCode:'Femenino'});return r;};
const auth=(r,caps=READ)=>({ok:true,authenticated:true,sessionVersion:2,user:{id:'synthetic-current-session',email:'synthetic@example.invalid'},access:{context:'tenant',tenant:{id:r.scope.tenantId,roleKey:'SYNTHETIC_OPERATOR'},tenantCapabilities:[...caps]},expiresAt:'2099-01-01T00:00:00Z'});
function harness(t,{required=READ}={}){
 const state={roster:data(),caps:[...required],live:true,authCount:0,rosterCount:0,invalidated:[],onRequest:null,mutateAuth:null,rosterResponse:null},requests=[];
 state.auth=auth(state.roster,required);state.access=ownRunWorkspaceAccess(state.auth);
 t.mock.method(globalThis,'fetch',async(url,options={})=>{
  requests.push({url,method:options.method??'GET',credentials:options.credentials,cache:options.cache,signal:options.signal});
  await state.onRequest?.(url,options);let payload;
  if(url==='/api/internal-auth'){state.authCount++;payload=structuredClone(state.auth);payload.access.tenantCapabilities=[...state.caps];state.mutateAuth?.(payload,state.authCount);}
  else {assert.equal(url,OWN_PAYROLL_READINESS_ROSTER_URL);state.rosterCount++;if(state.rosterResponse)return state.rosterResponse();payload={ok:true,data:structuredClone(state.roster)};}
  return new Response(JSON.stringify(payload),{headers:{'content-type':'application/json'}});
 });
 const read=createNativeEmployeePickerReader({getAccess:()=>state.access,canUse:()=>state.live&&required.every(c=>state.access.caps.has(c)),required,onInvalidated:message=>state.invalidated.push(message)});
 return {state,requests,read};
}
test('current synthetic operator reads and reapplies all851 without calculation prepare or generic lookup',async t=>{
 const h=harness(t),controller=new AbortController(),first=await h.read({signal:controller.signal}),view=nativePayrollPickerView(first,'1339');
 assert.equal(view.scope.total,851);assert.equal(view.rows.length,1);assert.equal(view.rows[0].recordOrigin,'MUNICONTROL');
 assert.equal(nativePayrollPickerView(first,'5851').rows.length,1);
 const fresh=await h.read({signal:controller.signal}),chosen=nativePayrollPickerSelection(fresh,view.rows,{maximum:1});
 assert.equal(chosen[0].contractId,h.state.roster.rows[0].contractId);assert.equal(h.state.authCount,4);assert.equal(h.state.rosterCount,2);
 assert.ok(h.requests.every(r=>r.method==='GET'&&r.credentials==='same-origin'&&r.cache==='no-store'&&r.signal instanceof AbortSignal));
 assert.equal(h.requests.some(r=>/resource=employees|employee-lookup/.test(r.url)),false);assert.deepEqual(h.state.invalidated,[]);
});
test('fiscal reader requires its own nominal read capability without acquiring calculation prepare',async t=>{
 const required=[...READ,'payroll.calculation.nominal.read'],h=harness(t,{required});await h.read();h.state.caps=READ;
 await assert.rejects(h.read(),e=>e.status===403);assert.equal(h.state.rosterCount,1);assert.equal(h.state.invalidated.length,1);
});
for(const [label,mutate] of [
 ['membership',r=>r.scope.membershipId=id(999)],
 ['binding',r=>r.scope.bindingId=id(998)],
 ['snapshot',r=>r.snapshot='b'.repeat(64)],
 ['total',r=>{r.rows.pop();r.total--;r.people--;r.counts.active--;}],
 ['today',r=>r.today='2026-10-02'],
])test('fresh apply rejects changed full roster '+label,async t=>{
 const h=harness(t);await h.read();mutate(h.state.roster);await assert.rejects(h.read(),e=>e.code==='NATIVE_PICKER_CHANGED');assert.equal(h.state.invalidated.length,1);
});
for(const [label,mutate] of [
 ['last row omitted',r=>r.rows.pop()],['partial response',r=>r.complete=false],
 ['filtered source',r=>r.filters.search='1339'],['old schema',r=>r.version='native-roster.v1'],
 ['foreign tenant',r=>r.scope.tenantId=id(997)]
])test('complete source rejects '+label+' without a partial selectable result',async t=>{
 const h=harness(t);mutate(h.state.roster);await assert.rejects(h.read());assert.equal(h.state.rosterCount,1);
});
test('revocation at the first auth bookend prevents roster access',async t=>{
 const h=harness(t);h.state.caps=[];await assert.rejects(h.read(),e=>e.status===403);assert.equal(h.state.rosterCount,0);assert.equal(h.state.invalidated.length,1);
});
test('revocation or a different account at the second auth bookend discards all851',async t=>{
 const h=harness(t);h.state.mutateAuth=(p,n)=>{if(n===2)p.access.tenantCapabilities=[];};
 await assert.rejects(h.read(),e=>e.status===403);assert.equal(h.state.rosterCount,1);assert.equal(h.state.authCount,2);assert.equal(h.state.invalidated.length,1);
});
test('late full response after the panel closes never becomes selectable',async t=>{
 const h=harness(t);h.state.onRequest=async url=>{if(url===OWN_PAYROLL_READINESS_ROSTER_URL)h.state.live=false;};
 await assert.rejects(h.read(),e=>e.name==='AbortError');assert.equal(h.state.authCount,1);assert.deepEqual(h.state.invalidated,[]);
});
test('late full response after caller abort is rejected even if fetch ignores cancellation',async t=>{
 const h=harness(t),controller=new AbortController();h.state.onRequest=async url=>{if(url===OWN_PAYROLL_READINESS_ROSTER_URL)controller.abort();};
 await assert.rejects(h.read({signal:controller.signal}),e=>e.name==='AbortError');assert.equal(h.state.authCount,1);
});
test('changed panel access key during the full read discards its late response',async t=>{
 const h=harness(t);h.state.onRequest=async url=>{if(url===OWN_PAYROLL_READINESS_ROSTER_URL)h.state.access={...h.state.access,key:'another-synthetic-session'};};
 await assert.rejects(h.read(),e=>e.status===403);assert.equal(h.state.invalidated.length,1);assert.equal(h.state.authCount,1);
});
test('truncated JSON and announced byte mismatch cannot become a roster',async t=>{
 const h=harness(t);h.state.rosterResponse=()=>new Response('{"ok":true,"data":');await assert.rejects(h.read());
 h.state.rosterResponse=()=>new Response(JSON.stringify({ok:true,data:h.state.roster}),{headers:{'x-municontrol-json-bytes':'1'}});await assert.rejects(h.read());
 assert.equal(h.state.authCount,2);assert.equal(h.state.invalidated.length,0);
});
test('explicit new opening resets source pins but stores no row cache or authority',async t=>{
 const h=harness(t);await h.read();h.state.roster.snapshot='c'.repeat(64);h.read.reset();await h.read();
 assert.equal(h.state.rosterCount,2);assert.equal(h.state.authCount,4);assert.deepEqual(h.state.invalidated,[]);
});
test('HTTP authority failure stops the read without historical fallback',async t=>{
 const h=harness(t);h.state.rosterResponse=()=>new Response(JSON.stringify({ok:false}),{status:403});
 await assert.rejects(h.read(),e=>e.status===403);assert.equal(h.state.invalidated.length,1);assert.equal(h.requests.length,2);
});
