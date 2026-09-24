import test from 'node:test';import assert from 'node:assert/strict';
import {createInternalClockSourceHandler} from '../api/internal-clock-source.js';
import {assertClockWorkspace,workspaceRows,workspaceSummary,workspaceCsv} from '../assets/clock-fleet-workspace-model.js';
import {workspaceFixture,workspaceDeps,workspaceAccess,workspaceCore,workspaceSource,workspaceDevices,id} from './fixtures/clock-workspace-synthetic.js';
const request=()=>({method:'GET',url:'/api/internal-clock-source?view=workspace',query:{view:'workspace'},headers:{}});
async function run(deps={},req=request()) {const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(v){this.statusCode=v;return this;},json(v){this.body=v;return this;}};await createInternalClockSourceHandler(workspaceDeps(deps))(req,res);return res;}
test('unified read reuses one archive read and the two authority/inventory checks',async()=>{
 let auth=0,reads=0,core=0;const r=await run({authorize:async()=>{auth++;return workspaceAccess();},readFleet:async()=>{reads++;return workspaceSource();},getFleet:async()=>{core++;return workspaceCore();}});
 assert.equal(r.statusCode,200);assert.equal(auth,2);assert.equal(reads,1);assert.equal(core,2);const {ok,...v}=r.body;assert.equal(ok,true);assert.equal(assertClockWorkspace(v).reception.devices.length,6);assert.equal(r.headers['Cache-Control'],'private, no-store, max-age=0');
 assert.equal(v.payrollModified,false);assert.equal(v.liveConnectionVerified,false);assert.doesNotMatch(JSON.stringify(v),/workspace@example|synthetic-workspace|tenantId|password|recordsBase64/);
});
test('source-only view remains backward compatible',async()=>{const r=await run({}, {method:'GET',url:'/api/internal-clock-source',headers:{}});assert.equal(r.statusCode,200);assert.equal(r.body.version,'clock-source-dashboard.v1');assert.equal(r.body.reception,undefined);});
test('only the exact read view is accepted; tenant and device scope cannot come from callers',async()=>{
 for(const change of [{url:'/api/internal-clock-source?view=other'},{url:'/api/internal-clock-source?view=workspace&view=workspace'},{query:{view:['workspace']}},{query:{view:'workspace',tenantId:id(100)}},{query:{}},{url:'/api/internal-clock-source?view=workspace&deviceId='+id(2)},{url:'https://evil.invalid/api/internal-clock-source?view=workspace'},{method:'POST'},{headers:{origin:'https://evil.invalid'}},{body:{}},{headers:{'content-length':'1'}}]){
  let calls=0;const r=await run({authorize:async()=>{calls++;return workspaceAccess();}},{...request(),...change});assert.notEqual(r.statusCode,200,JSON.stringify(change));assert.equal(calls,0);
 }
});
test('archive connectivity failure yields explicit partial data only after revalidation',async()=>{
 let auth=0;const r=await run({authorize:async()=>{auth++;return workspaceAccess();},getSourceSql:async()=>{throw Error('postgresql://private:secret@invalid');}});assert.equal(r.statusCode,200);assert.equal(auth,2);assert.equal(r.body.archive,null);assert.equal(r.body.archiveAvailability,'unavailable');assert.equal(r.body.reception.devices.length,6);assert.doesNotMatch(JSON.stringify(r.body),/secret|postgresql/);
 const {ok,...v}=r.body;assert.equal(workspaceSummary(v).archiveReceived,null);assert.equal(workspaceRows(v).find(r=>r.device.siteKey==='pm-02').state,'unavailable');
});
test('archive forbidden, binding conflict and malformed response do not become partial success',async()=>{
 for(const code of ['CLOCK_SOURCE_FORBIDDEN','CLOCK_SOURCE_AUTH_DENIED','CLOCK_SOURCE_BINDING_CHANGED','CLOCK_SOURCE_RESPONSE_INVALID']){const r=await run({readFleet:async()=>{throw Error(code);}});assert.notEqual(r.statusCode,200);assert.equal(r.body.reception,undefined);}
 const r=await run({readFleet:async()=>({...workspaceSource(),devices:[]})});assert.equal(r.statusCode,502);assert.equal(r.body.reception,undefined);
});
test('permission/session changes during read prevent disclosure, including partial archive failure',async()=>{
 for(const offline of [false,true]){let n=0;const r=await run({authorize:async()=>{const a=workspaceAccess();if(++n===2)a.session.version++;return a;},...(offline?{getSourceSql:async()=>{throw Error('offline');}}:{})});assert.equal(r.statusCode,409);assert.equal(r.body.archive,undefined);assert.equal(r.body.reception,undefined);}
 let n=0;const r=await run({authorize:async(_req,res)=>{if(++n===2){res.status(403).json({ok:false});return null;}return workspaceAccess();}});assert.equal(r.statusCode,403);assert.equal(r.body.reception,undefined);
});
test('inventory version or site changes during read are rejected',async()=>{
 let n=0;const r=await run({readDevices:async()=>{const d=workspaceDevices();if(++n===2)d.data[0].version++;return d;}});assert.equal(r.statusCode,409);assert.equal(r.body.reception,undefined);
 const mismatch=await run({readFleet:async()=>{const f=workspaceSource();f.devices[0].siteId=id(999);return f;}});assert.equal(mismatch.statusCode,409);
});
test('each point has one card; PM10 does not need an archive receipt to retain its canonical history',()=>{
 const v=workspaceFixture(),r=workspaceRows(v);assert.equal(r.length,6);assert.equal(new Set(r.map(x=>x.device.deviceId)).size,6);
 assert.equal(r.find(x=>x.device.siteKey==='pm-10').state,'consultable');assert.equal(r.find(x=>x.device.siteKey==='pm-02').state,'source_pending');assert.equal(r.find(x=>x.device.siteKey==='pm-03').state,'incomplete');assert.equal(r.find(x=>x.device.siteKey==='pm-14').state,'restricted');
 const s=workspaceSummary(v);assert.equal(s.devices,6);assert.equal(s.archiveReceived,3);assert.equal(s.consultable,1);assert.equal(Object.values(s.states).reduce((a,b)=>a+b,0),6);
});
test('joined evidence rejects different scope, labels, cuts, duplicate casefolded IDs and unexpected fields',()=>{
 for(const mutate of [v=>v.archive.devices[0].deviceId=id(888),v=>v.archive.devices[0].siteKey='pm-99',v=>v.archive.devices[0].label='Other',v=>v.archive.coreCheckedAt='2026-09-25T10:00:00Z',v=>v.archive.devices[0].sourcePayload={},v=>v.reception.devices[0].password='no',v=>v.archiveAvailability='unavailable',v=>v.payrollModified=true]){const v=workspaceFixture();mutate(v);assert.throws(()=>assertClockWorkspace(v));}
});
test('search and stages filter the complete park without mutating its totals',()=>{
 const v=workspaceFixture();assert.equal(workspaceRows(v,{search:'GALPON'}).length,1);assert.equal(workspaceRows(v,{state:'source_pending'}).length,1);assert.equal(workspaceRows(v,{search:'NO MATCH'}).length,0);assert.equal(workspaceSummary(v).devices,6);
 assert.throws(()=>workspaceRows(v,{search:'x'.repeat(121)}));assert.throws(()=>workspaceRows(v,{state:'hacked'}));
});
test('CSV preserves both cuts, distinguishes unknown from zero, escapes formulas and never invents balances',()=>{
 const v=workspaceFixture(),csv=workspaceCsv(v,{state:'source_pending'});assert.equal(csv.trim().split('\r\n').length,2);assert.match(csv,/Consulta operativa UTC/);assert.match(csv,/Consulta archivo UTC/);assert.match(csv,/802/);assert.doesNotMatch(csv,/Horas pagables|Pendientes de vincular/);
 assert.match(workspaceCsv(workspaceFixture({unavailable:true})),/No verificado/);v.reception.devices[0].label=v.archive.devices[0].label='=2+3';assert.ok(workspaceCsv(v).includes("'=2+3"));
});
