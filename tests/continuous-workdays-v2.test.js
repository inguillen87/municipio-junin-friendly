import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {reconstructWorkdays,reconstructContinuousWorkdays} from '../lib/attendance-workdays.js';
import {getAttendanceWorkdaysV2,normalizeContinuousWorkdayQuery} from '../lib/internal-attendance-workdays.js';
import {createInternalAttendanceHandler} from '../api/internal-attendance.js';

// Synthetic fixtures only; no SQL connection or municipal source data.
const hash=value=>createHash('sha256').update(String(value)).digest('hex');
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',member='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const sessionId='cccccccc-cccc-4ccc-8ccc-cccccccccccc',cut='dddddddd-dddd-5ddd-8ddd-dddddddddddd';
const history='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',receipt='ffffffff-ffff-4fff-8fff-ffffffffffff';
const release='a'.repeat(40),day='2026-09-09',timezone='America/Argentina/Mendoza';
const principal={user:{email:'qa@example.test'},tenant:{source:'membership',id,membershipId:member,certifiedReleaseSha:release}};
const session={id:sessionId,email:'qa@example.test',version:1,releaseSha:release};
const options={source:'continuous',from:day,to:day};
function event(seed,code,time,patch={}) {
 return {eventRef:hash(seed),deviceKey:hash('device'),source:{kind:'historical',id:history,ordinal:1},
  model:'K20/ID',personKey:hash('person'),streamKey:hash('stream'),personLabel:'Agente sintético',legajo:'9001',
  identityState:'mapped',code,issues:[],occurredAt:`${day}T${time}-03:00`,localTimestamp:`${day} ${time}`,...patch};
}
const pair=()=>[event('entry',0,'07:00:00'),event('exit',1,'13:00:00',{source:{kind:'receipt',id:receipt,ordinal:1}})];
const run=(events=pair(),patch={})=>reconstructContinuousWorkdays({events,observations:[],from:day,to:day,timezone,...patch});
function observation(seed='unplaced',patch={}) {
 return {eventRef:hash(seed),deviceKey:hash('device'),source:{kind:'receipt',id:receipt,ordinal:2},
  occurredAt:null,localTimestamp:null,issues:['timestamp_unusable'],...patch};
}
function fixture(events=pair(),observations=[]) {
 return {version:'clock-workday-source.v2',generatedAt:'2026-09-15T10:00:00Z',sourceMode:'continuous',
  revision:cut,rulesVersion:'declared-intervals.v2',site:{key:'pm-10',label:'Sitio sintético'},timezone,nominalReadAllowed:true,
  filters:{from:day,to:day,anchoredToLatest:false},context:{from:'2026-09-08',to:'2026-09-10',
   recordCount:events.length+observations.length,eventCount:events.length,observationCount:observations.length},
  collection:{status:'continuous_receipts',sourceComplete:true,captureCount:1,receiptCount:1,batchCount:1,
   lastReceiptAt:'2026-09-15T09:59:00Z',periodCoverageCertified:false,automaticCollectorVerified:false},events,observations};
}
const get=(raw=fixture(),query=options,p=principal,s=session)=>getAttendanceWorkdaysV2({query:async()=>[{result:raw}]},p,query,s);

test('v2 pairs a historical entry and continuous exit with repeated source ordinal',()=>{
 const row=run().rows[0];assert.equal(row.ordinarySeconds,21600);
 assert.equal(row.intervals[0].startEventRef,hash('entry'));assert.equal(row.intervals[0].endEventRef,hash('exit'));
 assert.deepEqual(row.events.map(e=>e.source.ordinal),[1,1]);
 assert.ok(!('startOrdinal' in row.intervals[0]));assert.ok(!('ordinal' in row.events[0]));
 assert.equal(row.payableSeconds,null);assert.equal(row.amountArs,null);assert.equal(row.payrollEligible,false);
});
test('a pause split across sources is subtracted exactly once, and extra remains a reference',()=>{
 const rows=run([...pair(),event('pause',2,'10:00:00'),event('return',3,'10:15:00',{source:{kind:'receipt',id:receipt,ordinal:3}}),
  event('extra-start',4,'15:00:00'),event('extra-end',5,'17:00:00')]).rows;
 assert.equal(rows[0].ordinarySeconds,20700);assert.equal(rows[0].pauseSeconds,900);assert.equal(rows[0].extraSeconds,7200);
 assert.deepEqual(rows[0].intervals[0].pauseEventRefs,[hash('pause'),hash('return')]);
 assert.equal(rows[0].payrollEligible,false);assert.equal(rows[0].payableSeconds,null);
});
test('event references survive source order changes and earlier unrelated arrivals',()=>{
 const a=run().rows[0],b=run([...pair().reverse(),event('prior',0,'06:00:00',{
  occurredAt:'2026-09-08T06:00:00-03:00',localTimestamp:'2026-09-08 06:00:00',streamKey:hash('other-stream')})]).rows[0];
 assert.deepEqual(a,b);
});
test('exact event duplicates are rejected by the engine if the SQL dedup contract drifts',()=>assert.throws(()=>run([pair()[0],pair()[0]])));
test('same-time different records remain ambiguous instead of being ordered by ordinal',()=>{
 const result=run([pair()[0],event('same-time',1,'07:00:00')]);
 assert.equal(result.summary.intervalCount,0);assert.ok(result.rows[0].issues.some(i=>i.code==='simultaneous_events'));
});
test('different contracts and devices never supply the other stream exit',()=>{
 for (const patch of [{streamKey:hash('contract-2')},{streamKey:hash('device-2-stream'),deviceKey:hash('device-2')}]) {
  const result=run([pair()[0],{...pair()[1],...patch}]);assert.equal(result.summary.intervalCount,0);
 }
 assert.throws(()=>run([pair()[0],{...pair()[1],deviceKey:hash('device-2')}]),'one stream may not span devices');
});
test('a second unsupported device cannot inherit the first K20 profile',()=>{
 const result=run([...pair(),...pair().map(e=>({...e,eventRef:hash(e.eventRef+'other'),deviceKey:hash('other'),streamKey:hash('other-stream'),model:'OTHER'}))]);
 assert.equal(result.summary.ordinarySeconds,21600);assert.equal(result.rules.profileSupported,false);
 assert.equal(result.rules.deviceProfiles.filter(p=>p.profileSupported).length,1);
});
test('inconsistent device metadata is rejected',()=>assert.throws(()=>run([pair()[0],{...pair()[1],model:'OTHER'}])));
test('placed source observations break pairing and keep their original issue code',()=>{
 const result=run([pair()[0],event('observed',2,'10:00:00',{issues:['future_timestamp']}),pair()[1]]);
 assert.equal(result.summary.intervalCount,0);assert.ok(result.rows[0].events.some(e=>e.issues.includes('future_timestamp')));
});
test('an unplaceable record blocks only its device instead of silently hiding a possible pause',()=>{
 const other=pair().map(e=>({...e,eventRef:hash(e.eventRef+'other'),deviceKey:hash('other'),streamKey:hash('other-stream')}));
 const result=run([...pair(),...other],{observations:[observation()]});
 assert.equal(result.summary.ordinarySeconds,21600);
 const blocked=result.rows.find(r=>r.deviceKey===hash('device'));
 assert.equal(blocked.intervals.length,0);assert.equal(blocked.status,'review');
 assert.ok(blocked.issues.some(i=>i.code==='unplaced_source_observation' && i.eventRefs.includes(hash('unplaced'))));
});
test('overnight intervals use the following context day and remain assigned to entry',()=>{
 const events=[event('night',0,'22:00:00'),event('morning',1,'06:00:00',{
  occurredAt:'2026-09-10T06:00:00-03:00',localTimestamp:'2026-09-10 06:00:00',source:{kind:'receipt',id:receipt,ordinal:1}})];
 assert.equal(run(events).rows[0].ordinarySeconds,28800);
 assert.equal(run(events,{from:'2026-09-10',to:'2026-09-10'}).rows.length,0);
 assert.ok(run(events).rows[0].issues.some(i=>i.code==='overnight_review'));
});
test('v1 still enforces its original global ordinal contract',()=>{
 const events=pair().map(e=>({...e,ordinal:e.source.ordinal}));
 assert.throws(()=>reconstructWorkdays({events,from:day,to:day,timezone,model:'K20/ID'}));
});
test('the 25000-record context limit includes unplaceable observations',()=>{
 const events=Array.from({length:25000},(_,i)=>event('limit-'+i,0,'07:00:00'));
 assert.equal(run(events).rows[0].eventCount,25000);
 assert.throws(()=>run(events,{observations:[observation()]}));
});

test('v2 uses one parameterized SQL call with the bound session and its own revision',async()=>{
 let call;const output=await getAttendanceWorkdaysV2({query:async(sql,params)=>{call={sql,params};return [{result:fixture()}]}},principal,{...options,snapshot:cut.toUpperCase()},session);
 assert.match(call.sql,/attendance_clock_workday_source_v2\(\$1/);
 assert.deepEqual(call.params,[session.email,sessionId,1,release,id,member,'pm-10',day,day,cut]);
 assert.equal(output.version,'clock-workdays.v2');assert.equal(output.snapshotId,cut);
 assert.equal(output.homologationStatus,'unverified');assert.equal(output.approvalStatus,'not_approved');
 assert.equal(output.coverageCertified,false);assert.equal(output.payrollEligible,false);
 assert.ok(!JSON.stringify(output).includes('personKey'));assert.ok(!JSON.stringify(output).includes('streamKey'));
});
for (const patch of [{source:undefined},{source:'historical'},{source:'raw'},{snapshot:'not-a-cut'},{from:'2026-02-30'},{pageSize:101}])
 test('rejects invalid v2 query '+JSON.stringify(patch),()=>assert.throws(()=>normalizeContinuousWorkdayQuery({...options,...patch}),e=>e.status===400));
test('bad session never opens SQL',async()=>{
 await assert.rejects(()=>getAttendanceWorkdaysV2({query(){throw Error('SQL must not run')}},principal,options,{...session,email:'other@example.test'}),e=>e.status===401);
});
test('search and status are applied after complete context pairing, before pagination',async()=>{
 const events=[...pair(),...pair().map(e=>({...e,eventRef:hash(e.eventRef+'2'),personKey:hash('person-2'),streamKey:hash('stream-2'),personLabel:'Otra persona',legajo:'9002'}))];
 const output=await get(fixture(events),{...options,search:'sintetico',status:'closed',pageSize:1});
 assert.equal(output.periodSummary.days,2);assert.equal(output.summary.days,1);assert.equal(output.rows[0].ordinarySeconds,21600);
});
test('non-nominal source remains anonymous and search is forbidden',async()=>{
 const raw=fixture(pair().map(e=>({...e,personLabel:'Persona AABBCCDD',legajo:null})));raw.nominalReadAllowed=false;
 assert.equal((await get(raw)).rows[0].legajo,null);
 await assert.rejects(()=>get(raw,{...options,search:'9001'}),e=>e.status===403);
});
for (const [name,change] of [
 ['historical fallback',r=>r.version='clock-workday-source.v1'],['wrong source',r=>r.sourceMode='historical'],
 ['incomplete source',r=>r.collection.sourceComplete=false],['coverage claim',r=>r.collection.periodCoverageCertified=true],
 ['nominal leak',r=>r.nominalReadAllowed=false],['raw leak',r=>r.events[0].rawPayload='private'],
 ['source leak',r=>r.events[0].source.secret='private'],['duplicate event',r=>r.events[1].eventRef=r.events[0].eventRef],
 ['wrong context count',r=>r.context.recordCount++],['missing adjacent day',r=>r.context.from=day],
 ['wrong rule version',r=>r.rulesVersion='authorized-hours.v1'],['wrong site',r=>r.site.key='another-site'],
 ['wrong timezone',r=>r.timezone='Invalid/Zone'],['mismatched local time',r=>r.events[0].localTimestamp=day+' 08:00:00'],
 ['out-of-context event',r=>{r.events[0].occurredAt='2026-08-01T07:00:00-03:00';r.events[0].localTimestamp='2026-08-01 07:00:00'}],
]) test('fails closed on '+name,async()=>{const raw=fixture();change(raw);await assert.rejects(()=>get(raw),e=>e.status===503)});
test('wrong revision is rejected even when the driver ignores the requested cut',async()=>{
 await assert.rejects(()=>get(fixture(),{...options,snapshot:id}),e=>e.status===503);
});
for (const [code,status] of [
 ['ATTENDANCE_CAPTURE_CHANGED',409],['ATTENDANCE_WORKDAY_SOURCE_INCOMPLETE',409],['ATTENDANCE_WORKDAY_SOURCE_CONFLICT',409],
 ['ATTENDANCE_WORKDAY_WINDOW_TOO_LARGE',413],['ATTENDANCE_SESSION_INVALID',401],['ATTENDANCE_CAPABILITY_REQUIRED',403],
 ['ATTENDANCE_BINDING_REQUIRED',503],['ATTENDANCE_WORKDAY_SITE_NOT_FOUND',404],['ATTENDANCE_WORKDAY_DEVICE_CONTEXT_INVALID',503],
]) test('source error is translated safely: '+code,async()=>{
 await assert.rejects(()=>getAttendanceWorkdaysV2({query:async()=>{throw Error(code+' private-driver-detail')}},principal,options,session),e=>e.status===status && !e.message.includes('private-driver-detail'));
});
test('missing SQL function never falls back to historical data',async()=>{
 let calls=0;await assert.rejects(()=>getAttendanceWorkdaysV2({query:async()=>{calls++;throw Object.assign(Error('missing'),{code:'42883'})}},principal,options,session),e=>e.code==='ATTENDANCE_WORKDAYS_NOT_READY' && e.status===503);
 assert.equal(calls,1);
});
test('observations retain total count when response sample is capped',async()=>{
 const observations=Array.from({length:101},(_,i)=>observation('observation-'+i));
 const output=await get(fixture(pair(),observations));
 assert.equal(output.observationSummary.unplaced,101);assert.equal(output.observationSummary.returned,100);
 assert.equal(output.observationSummary.hasMore,true);assert.equal(output.observations.length,100);
 assert.equal(output.summary.intervalCount,0);
});

const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(p){this.payload=p;return this}});
const deps={env:{NODE_ENV:'test',INTERNAL_CERTIFIED_DATA_CONTRACT_SHA:release},requireCompatibleInternalAccess:async()=>({mode:'managed',principal,session}),getInternalSql:async()=>({query:async()=>[{result:fixture()}]})};
test('HTTP v2 remains private and preserves the existing attendance capability gate',async()=>{
 let required;const res=response();await createInternalAttendanceHandler({...deps,requireCompatibleInternalAccess:async(_req,_res,o)=>{required=o;return {mode:'managed',principal,session}}})({method:'GET',query:{resource:'clock-workdays-v2',...options},headers:{}},res);
 assert.equal(res.statusCode,200);assert.equal(res.payload.version,'clock-workdays.v2');assert.match(res.headers['Cache-Control'],/private, no-store/);
 assert.deepEqual(required.requiredCapabilities,['attendance.read']);assert.equal(required.requireCertifiedDataBinding,true);
});
for (const extra of [{tenantId:id},{identity:'all'},{hour:'7'},{source:['continuous','historical']}])
 test('HTTP cannot widen scope '+JSON.stringify(extra),async()=>{const res=response();await createInternalAttendanceHandler(deps)({method:'GET',query:{resource:'clock-workdays-v2',...options,...extra},headers:{}},res);assert.equal(res.statusCode,400)});
test('HTTP expired access does not open SQL',async()=>{
 const res=response();await createInternalAttendanceHandler({...deps,requireCompatibleInternalAccess:async(_req,r)=>{r.status(401).json({ok:false});return null},getInternalSql(){throw Error('must not open')}})({method:'GET',query:{resource:'clock-workdays-v2',...options},headers:{}},res);assert.equal(res.statusCode,401);
});
test('the existing HTTP workdays route still dispatches only to v1',async()=>{
 let legacy=0;const res=response();await createInternalAttendanceHandler({...deps,getAttendanceWorkdays:async()=>{legacy++;return {version:'clock-workdays.v1'}},getAttendanceWorkdaysV2(){throw Error('v2 must not run')}})({method:'GET',query:{resource:'clock-workdays'},headers:{}},res);
 assert.equal(res.statusCode,200);assert.equal(res.payload.version,'clock-workdays.v1');assert.equal(legacy,1);
});

test('unapplied migration is additive, read-only, session-scoped and runtime-execute only',()=>{
 const sql=readFileSync('scripts/migrations/065-clock-workday-source-continuous.sql','utf8').replace(/--[^\n]*/g,'');
 assert.equal((sql.match(/CREATE OR REPLACE FUNCTION/g)||[]).length,1);
 assert.doesNotMatch(sql,/\b(?:INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE)\b/i);
 assert.match(sql,/SECURITY DEFINER SET search_path=public,pg_temp/);
 assert.match(sql,/attendance_gateway_assert_session_v1\(p_email,p_session,p_version,p_release,p_tenant,p_membership\)/);
 assert.match(sql,/attendance_gateway_assert_actor_v1\(ctx,'attendance.read'\)/);
 assert.match(sql,/capability_key='workforce.employee.read'/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public.attendance_clock_workday_source_v2\([^;]+FROM PUBLIC/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public.attendance_clock_workday_source_v2\([^;]+TO municontrol_actions_runtime_app/);
 assert.doesNotMatch(sql,/GRANT\s+(?:SELECT|ALL)/i);
});
test('SQL guards batch integrity independently of collection.importComplete and projects one read cut',()=>{
 const sql=readFileSync('scripts/migrations/065-clock-workday-source-continuous.sql','utf8');
 assert.doesNotMatch(sql,/attendance_clock_dashboard_v[23]\(/);
 assert.match(sql,/count\(DISTINCT manifest_sha256\)=1/);assert.match(sql,/sum\(record_count\)=min\(total_records\)/);
 assert.match(sql,/string_agg\(records_payload,decode\('','hex'\) ORDER BY part_start\)/);
 assert.match(sql,/o.ordinal<=o.previous_ordinal/);assert.match(sql,/ATTENDANCE_WORKDAY_SOURCE_INCOMPLETE/);
 assert.match(sql,/substring\(q.records_payload FROM 1\+position\*40 FOR 40\)/);
 assert.match(sql,/generate_series\(0,q.record_count-1\)/);
 assert.match(sql,/WHERE NOT EXISTS\(SELECT 1 FROM source_rows r WHERE r.device_id=c.device_id AND r.raw_hash=c.raw_hash\)/);
 assert.match(sql,/NOT EXISTS\(SELECT 1 FROM projection_missing\) ok/);
 assert.match(sql,/SELECT DISTINCT ON\(device_id,raw_hash\)/);assert.match(sql,/context_count AS MATERIALIZED/);
 assert.match(sql,/window_count>25000/);assert.match(sql,/b.from_day-1/);assert.match(sql,/b.to_day\+2/);
 assert.match(sql,/im.status='active'/);assert.match(sql,/ec.source_system=b.source_system/);
 assert.match(sql,/ib.validation_state='published'/);assert.match(sql,/identity_state,'sha256'/);
 assert.match(sql,/'declared-intervals.v2',p_tenant,p_site,a.nominal/);
 assert.match(sql,/INTO answer,binding_ok,site_ok,complete_ok,device_ok,conflict_found,window_count/);
 assert.match(sql,/p_snapshot::text IS DISTINCT FROM answer->>'revision'/);
});
