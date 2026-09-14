import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeClockDashboardQuery,getAttendanceClockDashboard} from '../lib/internal-attendance-clock-dashboard.js';
import {createInternalAttendanceHandler} from '../api/internal-attendance.js';
import {recordCsv,verifyExport} from '../assets/clock-dashboard-model.js';
import {createClockXlsx} from '../assets/clock-dashboard-export.js';
import {clockDashboardFixture,CONTINUOUS_CUT,HISTORICAL_CUT} from './fixtures/clock-dashboard-v3-synthetic.js';

const tenant='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',membership='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',sessionId='cccccccc-cccc-4ccc-8ccc-cccccccccccc',release='a'.repeat(40);
const principal={user:{email:'qa@example.test'},tenant:{source:'membership',id:tenant,membershipId:membership,certifiedReleaseSha:release}};
const session={id:sessionId,email:'qa@example.test',version:1,releaseSha:release};
function fixture(options={}){const {ok,...result}=clockDashboardFixture(new URLSearchParams({source:'continuous'}),options);return result}
function get(result=fixture(),options={source:'continuous'}){return getAttendanceClockDashboard({query:async()=>[{result}]},principal,options,session)}

test('source parameter is bounded; legacy callers remain v2',()=>{
 assert.equal(normalizeClockDashboardQuery().sourceMode,null);
 assert.equal(normalizeClockDashboardQuery({source:'continuous'}).sourceMode,'continuous');
 assert.throws(()=>normalizeClockDashboardQuery({source:'raw'}),error=>error.status===400);
});
test('continuous read carries source and immutable cut in parameterized SQL',async()=>{
 let call;await getAttendanceClockDashboard({query:async(sql,params)=>{call={sql,params};return [{result:fixture()}]}},principal,{source:'continuous',snapshot:CONTINUOUS_CUT},session);
 assert.match(call.sql,/attendance_clock_dashboard_v3/);assert.equal(call.params.at(-1),'continuous');assert.equal(call.params.at(-2),CONTINUOUS_CUT);
});
for(const [name,change]of [
 ['wrong source',d=>d.dashboard.sourceMode='historical'],['wrong cut',d=>d.dashboard.snapshotId=HISTORICAL_CUT],
 ['invented heartbeat',d=>d.dashboard.telemetry.lastAttemptAt=d.generatedAt],['invented backlog',d=>d.dashboard.telemetry.backlog=0],
 ['negative delay',d=>d.dashboard.telemetry.deliveryLatencySeconds=-1],['invalid query time',d=>d.generatedAt='yesterday'],
 ['daily disagreement',d=>d.daily[0].marks--],['hourly disagreement',d=>d.hourly[0].marks--],
 ['duplicate row identifier',d=>d.records[1].rowKey=d.records[0].rowKey],['missing row identifier',d=>delete d.records[0].rowKey],
 ['nominal leak',d=>d.records[0].personLabel='Unapproved label'],['raw leak',d=>d.records[0].rawAttendance='forbidden']
])test('v3 rejects '+name,async()=>{const d=fixture();change(d);await assert.rejects(()=>get(d,{source:'continuous',snapshot:CONTINUOUS_CUT}),e=>e.status===503)});
test('historical response requires historical source and its own revision',async()=>{
 const {ok,...d}=clockDashboardFixture(new URLSearchParams({source:'historical'}));
 const out=await get(d,{source:'historical',snapshot:HISTORICAL_CUT});assert.equal(out.summary.marks,150);
});
test('new receipt during paging returns actionable 409',async()=>{
 await assert.rejects(()=>getAttendanceClockDashboard({query:async()=>{throw Error('ATTENDANCE_CAPTURE_CHANGED')}},principal,{source:'continuous',snapshot:CONTINUOUS_CUT},session),e=>e.status===409&&/Actualizá/.test(e.message));
});
test('CSV and XLSX contain the selected source and read cut',()=>{
 const d=clockDashboardFixture(new URLSearchParams({source:'continuous',pageSize:'100'}),{nominal:true});
 const next=clockDashboardFixture(new URLSearchParams({source:'continuous',page:'2',pageSize:'100'}),{nominal:true});
 const rows=[...d.records,...next.records];const csv=recordCsv(d,rows,'Filtro completo');
 assert.match(csv,/Histórico y recepciones confirmadas/);assert.ok(csv.includes(CONTINUOUS_CUT));
 const xlsx=new TextDecoder().decode(createClockXlsx(d,rows));assert.ok(xlsx.includes(CONTINUOUS_CUT));assert.match(xlsx,/Corte de consulta/);
});
test('same source ordinal across receipts does not duplicate an export row',()=>{
 const first=clockDashboardFixture(new URLSearchParams({source:'continuous',pageSize:'100'}));
 const next=clockDashboardFixture(new URLSearchParams({source:'continuous',page:'2',pageSize:'100'}));
 const seen=new Set();verifyExport(first,first,1,seen);verifyExport(first,next,2,seen);assert.equal(seen.size,153);
 next.records[0].rowKey=first.records[0].rowKey;assert.throws(()=>verifyExport(first,next,2,new Set([first.records[0].rowKey])));
});
test('export rejects a source switch even if an erroneous server repeats the same cut',()=>{
 const a=clockDashboardFixture(),b=structuredClone(a);b.dashboard.sourceMode='historical';assert.throws(()=>verifyExport(a,b,1,new Set()));
});
test('HTTP resource admits only source, not a caller-selected tenant',async()=>{
 const deps={env:{NODE_ENV:'test',INTERNAL_CERTIFIED_DATA_CONTRACT_SHA:release},requireCompatibleInternalAccess:async()=>({mode:'managed',principal,session}),getInternalSql:async()=>({query:async()=>[{result:fixture()}]})};
 const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(p){this.payload=p;return this}});
 const good=response();await createInternalAttendanceHandler(deps)({method:'GET',query:{resource:'clock-dashboard',source:'continuous'},headers:{}},good);assert.equal(good.statusCode,200);assert.match(good.headers['Cache-Control'],/no-store/);
 const bad=response();await createInternalAttendanceHandler(deps)({method:'GET',query:{resource:'clock-dashboard',source:'continuous',tenantId:tenant},headers:{}},bad);assert.equal(bad.statusCode,400);
});
