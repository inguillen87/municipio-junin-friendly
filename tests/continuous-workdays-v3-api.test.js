import test from 'node:test';
import assert from 'node:assert/strict';
import {createInternalAttendanceHandler} from '../api/internal-attendance.js';
import {getAttendanceWorkdaysV3,normalizeContinuousWorkdayQueryV3} from '../lib/internal-attendance-workdays.js';
import {V3_DAY,V3_CONTRACT,V3_OTHER_CONTRACT,V3_REVISION,V3_RELEASE,V3_PRINCIPAL,V3_SESSION,V3_OPTIONS,v3Source,v3Events} from './fixtures/continuous-workdays-v3-api-synthetic.js';

const SOURCE_SQL='SELECT public.attendance_clock_workday_source_v3($1::text,$2::uuid,$3::integer,$4::text,$5::uuid,$6::uuid,$7::text,$8::date,$9::uuid) AS result';
function response() {
  return {statusCode:200,headers:{},body:null,setHeader(name,value){this.headers[name]=value;},
    status(value){this.statusCode=value;return this;},json(value){this.body=value;return this;}};
}
function access() {
  return {mode:'managed',session:structuredClone(V3_SESSION),principal:structuredClone(V3_PRINCIPAL)};
}
function harness({source=v3Source(),queryError=null,authorize=null}={}) {
  const calls={authorize:[],clients:0,queries:[]};
  const client={query:async(statement,values)=>{
    calls.queries.push({statement,values});
    if (queryError) throw queryError;
    return [{result:structuredClone(source)}];
  }};
  const handler=createInternalAttendanceHandler({
    env:{NODE_ENV:'test',INTERNAL_CERTIFIED_DATA_CONTRACT_SHA:V3_RELEASE},
    requireCompatibleInternalAccess:async(req,res,options)=>{
      calls.authorize.push(options);
      return authorize?authorize(req,res,options):access();
    },
    getInternalSql:async()=>{calls.clients++;return client;},
  });
  return {calls,client,handler};
}
async function api(h,overrides={},body=undefined) {
  const res=response();
  await h.handler({method:'GET',query:{resource:'clock-workdays-v3',...V3_OPTIONS,...overrides},headers:{},body},res);
  return res;
}
async function direct(source=v3Source(),options={},session=V3_SESSION) {
  const queries=[];
  const data=await getAttendanceWorkdaysV3({query:async(statement,values)=>{queries.push({statement,values});return [{result:source}];}},
    V3_PRINCIPAL,{...V3_OPTIONS,...options},session);
  return {data,queries};
}

test('v3 requires one explicit civil day, site and continuous source without accepting legacy date ranges',()=>{
  const normalized=normalizeContinuousWorkdayQueryV3(V3_OPTIONS);
  assert.equal(normalized.from,V3_DAY);assert.equal(normalized.to,V3_DAY);assert.equal(normalized.day,V3_DAY);
  for (const override of [{source:''},{source:'historical'},{site:''},{site:undefined},{day:''},{day:undefined},
    {day:'2026-02-30'},{day:'2026-11-14T00:00:00Z'},{day:['2026-11-14']},{page:1},{from:V3_DAY},{to:V3_DAY},
    {context:'person'},{personRef:'a'.repeat(64)},{contractId:V3_CONTRACT}]) {
    assert.throws(()=>normalizeContinuousWorkdayQueryV3({...V3_OPTIONS,...override}));
  }
});

test('v3 calls only the new facade with the same session and one selected day',async()=>{
  const {data,queries}=await direct();
  assert.deepEqual(queries,[{statement:SOURCE_SQL,values:[V3_PRINCIPAL.user.email,V3_SESSION.id,1,V3_RELEASE,
    V3_PRINCIPAL.tenant.id,V3_PRINCIPAL.tenant.membershipId,'qa-site',V3_DAY,null]}]);
  assert.equal(data.version,'clock-workdays.v3');assert.equal(data.snapshotId,V3_REVISION);
  assert.equal(data.rows.length,1);assert.equal(data.rows[0].contractId,V3_CONTRACT);
  assert.equal(data.rows[0].ordinarySeconds,21600);assert.equal(data.rows[0].payableSeconds,null);
  assert.equal(data.rules.version,'declared-intervals.v2');assert.equal(data.rules.dayAllocation,'interval_start_date');
  assert.equal(data.coverageCertified,false);assert.equal(data.approvalStatus,'not_approved');assert.equal(data.payrollEligible,false);
  assert.equal(data.collection.periodCoverageCertified,false);assert.equal(data.collection.automaticCollectorVerified,false);
  assert.equal(Object.hasOwn(data.rows[0],'personKey'),false);assert.equal(Object.hasOwn(data.rows[0],'streamKey'),false);
});

test('same legajo in different mapped streams retains exact contracts and whole-cut totals before pagination',async()=>{
  const source=v3Source({events:[...v3Events(),...v3Events({stream:'different-contract',contractId:V3_OTHER_CONTRACT,ordinal:3})]});
  const {data}=await direct(source,{pageSize:'1',cause:'all'});
  const {data:next}=await direct(source,{pageSize:'1',page:'2',snapshot:V3_REVISION,cause:'all'});
  assert.equal(data.rows.length,1);assert.equal(next.rows.length,1);assert.equal(data.pagination.total,2);
  assert.equal(data.summary.ordinarySeconds,43200);assert.equal(data.reviewFacets.totalDays,2);
  assert.deepEqual(new Set([data.rows[0].contractId,next.rows[0].contractId]),new Set([V3_CONTRACT,V3_OTHER_CONTRACT]));
  assert.equal(data.rows[0].legajo,next.rows[0].legajo);assert.notEqual(data.rows[0].key,next.rows[0].key);
});

test('pseudonymous and ambiguous reads retain null contract IDs and never gain nominal authority',async()=>{
  const {data}=await direct(v3Source({nominal:false}));
  assert.equal(data.nominalReadAllowed,false);assert.equal(data.rows[0].contractId,null);assert.equal(data.rows[0].legajo,null);
  assert.match(data.rows[0].personLabel,/^Persona [A-F0-9]{8}$/);
  for (const identityState of ['ambiguous','unmapped']) {
    const {data:unmapped}=await direct(v3Source({events:v3Events({identityState,legajo:null})}));
    assert.ok(unmapped.rows.every(row=>row.contractId===null&&row.status==='review'));
  }
  await assert.rejects(direct(v3Source({nominal:false}),{search:'Persona'}),error=>error.code==='ATTENDANCE_CAPABILITY_REQUIRED');
});

test('identity leaks, conflicting streams and extra source fields fail closed rather than being stripped',async()=>{
  const cases=[];
  let source=v3Source({nominal:false});source.events[0].contractId=V3_CONTRACT;cases.push(source);
  source=v3Source({events:v3Events({identityState:'ambiguous',legajo:null})});source.events[0].contractId=V3_CONTRACT;cases.push(source);
  source=v3Source();source.events[1].contractId=V3_OTHER_CONTRACT;cases.push(source);
  source=v3Source();delete source.events[0].contractId;cases.push(source);
  source=v3Source();source.events[0].contractId='AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';cases.push(source);
  source=v3Source();source.events[0].unexpected='not allowed';cases.push(source);
  source=v3Source();source.unexpected='not allowed';cases.push(source);
  for (const invalid of cases) await assert.rejects(direct(invalid),error=>error.code==='ATTENDANCE_CONTRACT_DRIFT'&&error.status===503);
});

test('source cut, version, privacy, integrity and coverage assertions remain mandatory',async()=>{
  const mutations=[
    source=>{source.version='clock-workday-source.v2';},
    source=>{source.rulesVersion='new-rule';},
    source=>{source.site.key='other-site';},
    source=>{source.filters.from='2026-11-13';},
    source=>{source.filters.anchoredToLatest=true;},
    source=>{source.context.eventCount++;},
    source=>{source.collection.sourceComplete=false;},
    source=>{source.collection.periodCoverageCertified=true;},
    source=>{source.collection.automaticCollectorVerified=true;},
  ];
  for (const mutate of mutations) { const source=v3Source();mutate(source);await assert.rejects(direct(source),error=>error.code==='ATTENDANCE_CONTRACT_DRIFT'); }
});

test('source function missing, source conflict and a changed pinned cut never fall back to v2',async()=>{
  for (const [queryError,status,code] of [
    [Object.assign(Error('undefined function'),{code:'42883'}),503,'ATTENDANCE_WORKDAYS_V3_NOT_READY'],
    [Error('ATTENDANCE_WORKDAY_SOURCE_INCOMPLETE'),409,'ATTENDANCE_WORKDAY_SOURCE_INCOMPLETE'],
    [Error('ATTENDANCE_WORKDAY_SOURCE_CONFLICT'),409,'ATTENDANCE_WORKDAY_SOURCE_CONFLICT'],
    [Error('ATTENDANCE_CAPTURE_CHANGED'),409,'ATTENDANCE_CAPTURE_CHANGED'],
  ]) {
    const h=harness({queryError}),res=await api(h,{snapshot:V3_REVISION});
    assert.equal(res.statusCode,status);assert.equal(res.body.code,code);
    assert.equal(h.calls.queries.length,1);assert.equal(h.calls.queries[0].statement,SOURCE_SQL);
    assert.equal(h.calls.queries[0].values.at(-1),V3_REVISION);
  }
});

test('an empty observed cut stays unapproved and does not invent absences or zero normative counts',async()=>{
  const {data}=await direct(v3Source({events:[]}));
  assert.equal(data.rows.length,0);assert.equal(data.summary.days,0);assert.equal(data.coverageCertified,false);
  assert.equal(data.approvalStatus,'not_approved');assert.equal(data.payrollEligible,false);
  assert.equal(Object.hasOwn(data,'absenceCount'),false);assert.equal(Object.hasOwn(data,'tardinessCount'),false);
  assert.equal(Object.hasOwn(data,'approvedOvertimeSeconds'),false);
});

test('reader rejects invalid session and multiple SQL rows without querying another source',async()=>{
  let calls=0;
  const client={query:async()=>{calls++;return [{result:v3Source()},{result:v3Source()}];}};
  await assert.rejects(getAttendanceWorkdaysV3(client,V3_PRINCIPAL,V3_OPTIONS,{...V3_SESSION,version:0}),error=>error.code==='ATTENDANCE_SESSION_INVALID');
  assert.equal(calls,0);
  await assert.rejects(getAttendanceWorkdaysV3(client,V3_PRINCIPAL,V3_OPTIONS,V3_SESSION),error=>error.code==='ATTENDANCE_CONTRACT_DRIFT');
  assert.equal(calls,1);
});

test('API uses live attendance authorization, private no-store output and the v3 response envelope',async()=>{
  const h=harness(),res=await api(h);
  assert.equal(res.statusCode,200);assert.equal(res.body.ok,true);assert.equal(res.body.version,'clock-workdays.v3');
  assert.equal(Object.hasOwn(res.body,'principal'),false);assert.equal(Object.hasOwn(res.body,'data'),false);
  assert.match(res.headers['Cache-Control'],/private, no-store/);
  assert.deepEqual(h.calls.authorize[0].requiredCapabilities,['attendance.read']);
  assert.equal(h.calls.authorize[0].capabilityMode,'all');assert.equal(h.calls.authorize[0].allowLegacy,false);
  assert.equal(h.calls.authorize[0].requireDataPlaneReady,true);assert.equal(h.calls.authorize[0].requireCertifiedDataBinding,true);
  assert.equal(h.calls.clients,1);assert.equal(h.calls.queries.length,1);
});

test('API rejects missing, ambiguous or broadened day inputs before constructing a SQL client',async()=>{
  for (const query of [{day:''},{site:''},{source:''},{day:'2026-02-30'},{day:['2026-11-14']},
    {from:V3_DAY},{to:V3_DAY},{tenantId:V3_PRINCIPAL.tenant.id},{contractId:V3_CONTRACT},{nominalReadAllowed:'true'},{context:'person'}]) {
    const h=harness(),res=await api(h,query);
    assert.equal(res.statusCode,400,JSON.stringify(query));assert.equal(h.calls.clients,0);assert.equal(h.calls.queries.length,0);
  }
});

test('API does not transport authority from another request or accept scope overrides in a GET body',async()=>{
  let allowed=true;
  const h=harness({authorize:(_req,res)=>{
    if (allowed) return access();
    res.status(403).json({ok:false,code:'ATTENDANCE_CAPABILITY_REQUIRED'});return null;
  }});
  const first=await api(h,{}, {tenantId:'88888888-8888-4888-8888-888888888888',contractId:V3_OTHER_CONTRACT,nominalReadAllowed:true});
  assert.equal(first.statusCode,200);assert.equal(h.calls.queries[0].values[4],V3_PRINCIPAL.tenant.id);
  assert.equal(first.body.rows[0].contractId,V3_CONTRACT);
  allowed=false;const denied=await api(h);
  assert.equal(denied.statusCode,403);assert.equal(h.calls.authorize.length,2);assert.equal(h.calls.clients,1);assert.equal(h.calls.queries.length,1);
});
