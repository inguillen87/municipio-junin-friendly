import test from 'node:test';
import assert from 'node:assert/strict';
import {createInternalClockSourceHandler} from '../api/internal-clock-source.js';
import {getReportedClockPark} from '../lib/internal-clock-reported-park.js';
import {assertClockWorkspace,assertReportedClockPark,workspaceRows,workspaceSummary,workspaceCsv} from '../assets/clock-fleet-workspace-model.js';
import {workspaceFixture,workspaceDeps,workspaceAccess,reportedParkFixture,id} from './fixtures/clock-workspace-synthetic.js';
const req=()=>({method:'GET',url:'/api/internal-clock-source?view=workspace',query:{view:'workspace'},headers:{}});
async function read(deps={},request=req()){
 const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(v){this.statusCode=v;return this;},json(v){this.body=v;return this;}};
 await createInternalClockSourceHandler(workspaceDeps({reportedParkFor:()=>reportedParkFixture(),...deps}))(request,res);return res;
}
test('all fourteen points include six real device identities and eight inventory-only rows',()=>{
 const v=workspaceFixture({reported:true}),rows=workspaceRows(v),s=workspaceSummary(v);
 assert.equal(v.version,'clock-fleet-workspace.v2');assert.equal(rows.length,14);assert.equal(s.points,14);assert.equal(s.devices,6);assert.equal(s.unregistered,8);
 assert.equal(new Set(rows.map(r=>r.point.siteKey)).size,14);assert.equal(rows.filter(r=>r.device).length,6);assert.equal(s.states.registration,8);
 assert.equal(Object.values(s.states).reduce((n,v)=>n+v,0),14);
 for(const r of rows.filter(r=>!r.device)){assert.equal(r.archive,null);assert.equal(r.receptionStatus,null);assert.equal(r.state,'registration');assert.doesNotMatch(r.guidance,/apagado|no marca|cero|liquidado/i);}
 assert.equal(rows.find(r=>r.point.siteKey==='pm-10').state,'consultable');assert.equal(rows.find(r=>r.point.siteKey==='pm-02').state,'source_pending');
 assert.equal(workspaceRows(v,{search:'PM-01'}).length,1);assert.equal(workspaceRows(v,{state:'registration'}).length,8);assert.equal(workspaceSummary(v).points,14);
});
test('full CSV includes unknowns without made-up zeros, device UUIDs, nominal data or physical claims',()=>{
 const v=workspaceFixture({reported:true}),csv=workspaceCsv(v),onlyPending=workspaceCsv(v,{state:'registration'});
 assert.equal(csv.trim().split('\r\n').length,15);assert.equal(onlyPending.trim().split('\r\n').length,9);assert.match(onlyPending,/No verificado/);assert.match(onlyPending,/Sin verificar/);
 assert.doesNotMatch(onlyPending,/;0;/);assert.doesNotMatch(csv,/0000000[1-9]-|workspace@example|tenantId|recordsBase64|Horas pagables/);
 v.reportedPark.points[0].label='=HYPERLINK("bad")';assert.match(workspaceCsv(v),/'=HYPERLINK/);
});
test('source failure retains the whole park and eight registration gaps without treating them as archive failures',()=>{
 const v=workspaceFixture({reported:true,unavailable:true}),rows=workspaceRows(v),s=workspaceSummary(v);
 assert.equal(rows.length,14);assert.equal(s.archiveReceived,null);assert.equal(s.states.registration,8);assert.equal(s.states.unavailable,4);assert.equal(s.consultable,1);
});
test('multiple devices at one point are preserved, with no duplicate inventory placeholder',()=>{
 const v=workspaceFixture({reported:true});const d={...v.reception.devices[0],deviceId:id(500)};v.reception.devices.push(d);v.archive.devices.push({...v.archive.devices[0],deviceId:id(500)});
 const rows=workspaceRows(v);assert.equal(rows.length,15);assert.equal(workspaceSummary(v).points,14);assert.equal(workspaceSummary(v).devices,7);assert.equal(workspaceSummary(v).unregistered,8);
 assert.equal(rows.filter(r=>r.point.siteKey==='pm-02').length,2);assert.equal(new Set(rows.filter(r=>r.device).map(r=>r.device.deviceId)).size,7);
});
test('registered points outside the reported inventory remain visible',()=>{
 const v=workspaceFixture({reported:true});v.reception.devices[0].siteKey=v.archive.devices[0].siteKey='extra-01';
 assert.equal(workspaceRows(v).length,15);assert.equal(workspaceSummary(v).points,15);assert.ok(workspaceRows(v).some(r=>r.point.siteKey==='extra-01'&&r.device));
});
test('strict reported inventory rejects duplicates, empty labels, extra network/nominal fields and false claims',()=>{
 for(const mutate of [p=>p.points[0].siteKey='PM-01',p=>p.points[0].siteKey=p.points[1].siteKey,p=>p.points[0].label='',p=>p.points[0].label='x\n',p=>p.points[0].ip='private',p=>p.points[0].dni='no',p=>p.physicalConnectionVerified=true,p=>p.pointCount=13,p=>p.points=[],p=>p.version='other']){
  const p=reportedParkFixture();mutate(p);assert.throws(()=>assertReportedClockPark(p));
 }
 const v=workspaceFixture({reported:true});delete v.reportedPark;assert.throws(()=>assertClockWorkspace(v));
 const legacy=workspaceFixture();legacy.reportedPark=reportedParkFixture();assert.throws(()=>assertClockWorkspace(legacy));
});
test('server adds the tenant-scoped park after two authority/inventory checks, with no extra source read',async()=>{
 let auth=0,sources=0;const r=await read({authorize:async()=>{auth++;return workspaceAccess();},getSourceSql:async()=>{sources++;return {};}});
 assert.equal(r.statusCode,200);assert.equal(auth,2);assert.equal(sources,1);assert.equal(r.body.version,'clock-fleet-workspace.v2');assert.equal(r.body.reportedPark.pointCount,14);
 assert.equal(r.headers['Cache-Control'],'private, no-store, max-age=0');assert.doesNotMatch(JSON.stringify(r.body.reportedPark),/tenant|latitude|longitude|address|password|deviceId/);
 const source=await read({}, {method:'GET',url:'/api/internal-clock-source',headers:{}});assert.equal(source.body.version,'clock-source-dashboard.v1');assert.equal(source.body.reportedPark,undefined);
});
test('a park change during either a full or partial read prevents any disclosure',async()=>{
 for(const offline of [false,true]){let reads=0;const r=await read({reportedParkFor:()=>{const p=reportedParkFixture();if(++reads===2)p.points[0].label='Changed';return p;},...(offline?{getSourceSql:async()=>{throw Error('offline');}}:{})});assert.equal(r.statusCode,409);assert.equal(r.body.reportedPark,undefined);assert.equal(r.body.reception,undefined);}
});
test('revocation or a tenant switch cannot disclose the reported park',async()=>{
 let n=0;const revoked=await read({authorize:async(_req,res)=>{if(++n===2){res.status(403).json({ok:false});return null;}return workspaceAccess();}});assert.equal(revoked.statusCode,403);assert.equal(revoked.body.reportedPark,undefined);
 n=0;const switched=await read({authorize:async()=>{const a=workspaceAccess();if(++n===2)a.principal.tenant.id=id(999);return a;}});assert.equal(switched.statusCode,409);assert.equal(switched.body.reportedPark,undefined);
});
test('actual published inventory is scoped to Junin and excludes addresses and credentials',()=>{
 assert.equal(getReportedClockPark({tenant:{slug:'other'}}),null);assert.equal(getReportedClockPark({}),null);
 const park=getReportedClockPark({tenant:{slug:'junin-mendoza'}});assert.equal(park.pointCount,14);assert.equal(new Set(park.points.map(p=>p.siteKey)).size,14);
 assert.doesNotMatch(JSON.stringify(park),/latitude|longitude|address|serial|password|tenantId/);
});
test('real handler selects Junin inventory and changes scope safely without caller-controlled tenant selection',async()=>{
 const r=await read({reportedParkFor:getReportedClockPark,authorize:async()=>{const a=workspaceAccess();a.principal.tenant.slug='junin-mendoza';return a;}});assert.equal(r.statusCode,200);assert.equal(r.body.reportedPark.pointCount,14);
 const other=await read({reportedParkFor:getReportedClockPark});assert.equal(other.statusCode,200);assert.equal(other.body.version,'clock-fleet-workspace.v1');assert.equal(other.body.reportedPark,undefined);
 let n=0;const switched=await read({reportedParkFor:getReportedClockPark,authorize:async()=>{const a=workspaceAccess();a.principal.tenant.slug=++n===1?'junin-mendoza':'other';return a;}});assert.equal(switched.statusCode,409);
});
