import test from 'node:test';
import assert from 'node:assert/strict';
import {periodClassificationBrowserRoute} from '../scripts/lib/own-period-classification-browser.mjs';
import {createNativeEmployeePickerReader} from '../assets/employee-picker.js';
import {nativePayrollPickerView,nativePayrollPickerSelection} from '../assets/employee-picker-model.js';
import {ownRunWorkspaceAccess} from '../assets/own-payroll-run-workspace-model.js';
import {OWN_PAYROLL_READINESS_ROSTER_URL} from '../assets/own-payroll-readiness-model.js';
import {createInternalDataHandler} from '../api/internal-data.js';
import {NATIVE_ROSTER_V2_SQL} from '../lib/internal-native-roster.js';
import {roster} from './fixtures/native-roster-synthetic.js';
import {currentRoster,currentSnapshot} from './fixtures/native-current-directory-synthetic.js';
import {principal,session} from './fixtures/employment-adoption-history-synthetic.js';
const REQUIRED=['workforce.employee.read','payroll.parameter.read'];
const fallback={ok:true,status:'ready',sourcePolicy:{label:'QA SINTÉTICA'},latestClosed:{},currentOpen:{},runs:[],quality:{},limitations:[]};
const oldRoute=raw=>{const u=new URL(raw,'http://fixture.invalid');return u.pathname==='/api/internal-own-period-classification'?'classification':u.pathname==='/api/internal-data'&&u.searchParams.get('resource')==='employees'?'directory':null;};
const dataset=()=>{const data=roster(851);return{...data,version:'native-roster.v2',scope:currentRoster().scope,counts:{...data.counts,unknown:0},rows:data.rows.map(row=>({...row,recordKind:'hire'}))};};
const raw=data=>{const{origin,complete,filters,snapshot,...value}=data;return value;};
function harness(t,{route=periodClassificationBrowserRoute,mutate=()=>{},changedToken=false}={}){
 const data=dataset();mutate(data);let directoryCalls=0,snapshots=0,live=true;
 const statements=[],requests=[],auth={ok:true,authenticated:true,sessionVersion:2,user:{id:session.id,email:session.email},access:{context:'tenant',tenant:{id:principal.tenant.id,roleKey:'SYNTHETIC_OPERATOR'},tenantCapabilities:[...REQUIRED]},expiresAt:'2099-01-01T00:00:00Z'},access=ownRunWorkspaceAccess(auth);
 const sql={query:async(statement,parameters)=>{statements.push({statement,parameters});if(statement===NATIVE_ROSTER_V2_SQL)return[{result:structuredClone(raw(data))}];assert.equal(statement,'SELECT public.native_employee_directory_snapshot_v1($1::jsonb) AS result');snapshots++;return[{result:currentSnapshot(data.total,changedToken&&snapshots===2?{token:'b'.repeat(64)}:{})}];}};
 const handler=createInternalDataHandler({env:{},requireCompatibleInternalAccess:async()=>({mode:'managed',principal}),actionMutationSession:()=>session,getInternalSql:async()=>sql,reportReadFailure:()=>{}});
 t.mock.method(globalThis,'fetch',async(url,options={})=>{requests.push({url,method:options.method??'GET'});if(url==='/api/internal-auth')return new Response(JSON.stringify(auth),{headers:{'content-type':'application/json'}});assert.equal(url,OWN_PAYROLL_READINESS_ROSTER_URL);if(route(url)!=='directory')return new Response(JSON.stringify(fallback),{headers:{'content-type':'application/json'}});directoryCalls++;let status=200,payload;const u=new URL(url,'http://fixture.invalid');await handler({method:'GET',url,query:Object.fromEntries(u.searchParams),headers:options.headers},{setHeader(){},status(code){status=code;return this;},json(value){payload=value;return this;}});return new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json'}});});
 const read=createNativeEmployeePickerReader({getAccess:()=>access,canUse:()=>live,required:REQUIRED});
 return{read,data,statements,requests,counts:()=>({directoryCalls,snapshots}),retire:()=>{live=false;}};
}

test('route forwards the exact complete native v2 request while preserving legacy/classification routes and exclusions',()=>{
 assert.equal(periodClassificationBrowserRoute(OWN_PAYROLL_READINESS_ROSTER_URL),'directory');assert.equal(periodClassificationBrowserRoute('/api/internal-data?resource=employees&view=novelty-selector'),'directory');assert.equal(periodClassificationBrowserRoute('/api/internal-own-period-classification?resource=bootstrap'),'classification');
 for(const url of ['/api/internal-data?resource=nativeroster','/api/internal-data?resource=nativeroster&schema=1','/api/internal-data?resource=unknown','/api/foreign?resource=nativeroster&schema=2'])assert.equal(periodClassificationBrowserRoute(url),null);
});
test('RED cause: original route sends summary fallback and the actual native picker reader rejects it before any directory query',async t=>{
 const h=harness(t,{route:oldRoute});assert.equal(oldRoute(OWN_PAYROLL_READINESS_ROSTER_URL),null);await assert.rejects(h.read(),error=>error.code==='NATIVE_ROSTER_INVALID'&&error.message==='El padrón completo no pudo verificarse. Consultalo nuevamente.');assert.deepEqual(h.counts(),{directoryCalls:0,snapshots:0});assert.deepEqual(h.statements,[]);
});
test('GREEN cause: actual directory handler and picker retain all851 and select the original last contract after a complete reread',async t=>{
 const h=harness(t),first=await h.read(),last=h.data.rows.at(-1),view=nativePayrollPickerView(first,last.legajo);assert.equal(first.data.total,851);assert.equal(first.data.rows.length,851);assert.equal(view.scope.total,851);assert.equal(view.rows.length,1);assert.equal(view.rows[0].contractId,last.contractId);assert.equal(view.rows[0].recordOrigin,'MUNICONTROL');
 const second=await h.read(),selected=nativePayrollPickerSelection(second,view.rows,{maximum:1});assert.equal(selected[0].contractId,last.contractId);assert.equal(second.data.rows.at(-1).contractId,last.contractId);assert.deepEqual(h.counts(),{directoryCalls:2,snapshots:4});assert.equal(h.statements.filter(s=>s.statement===NATIVE_ROSTER_V2_SQL).length,2);assert.ok(h.requests.every(r=>r.method==='GET'));assert.ok(h.statements.every(s=>s.statement.startsWith('SELECT ')||s.statement.trimStart().startsWith('WITH ')));
});
test('malformed final row or omitted row still rejects the complete real-handler result; route fix never supplies selectable fallback rows',async t=>{
 for(const mutate of [data=>data.rows.pop(),data=>data.rows.at(-1).sexCode='INVALID',data=>data.rows.at(-1).contractId=data.rows[0].contractId]){const h=harness(t,{mutate});await assert.rejects(h.read());assert.equal(h.counts().directoryCalls,1);t.mock.restoreAll();}
});
test('the same cohort-token guard and caller cancellation still refuse stale complete responses',async t=>{
 const h=harness(t,{changedToken:true});await assert.rejects(h.read());assert.deepEqual(h.counts(),{directoryCalls:1,snapshots:2});t.mock.restoreAll();const retired=harness(t);retired.retire();await assert.rejects(retired.read(),error=>error.name==='AbortError');assert.equal(retired.counts().directoryCalls,0);
});
