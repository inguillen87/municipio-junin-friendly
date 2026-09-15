import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {createInternalAttendanceHandler} from '../api/internal-attendance.js';
import {normalizeWorkdayQuery,normalizeContinuousWorkdayQuery} from '../lib/internal-attendance-workdays.js';
import {reconstructContinuousWorkdays,filterWorkdays,filterContinuousWorkdays} from '../lib/attendance-workdays.js';
import {verifyWorkdayResponse,sameWorkdayCut,workdayTime,workdaySummaryTime,sequenceRows} from '../assets/workday-panel-model.js';
import {workdayCsv,workdayXlsx} from '../assets/workday-export.js';
import {historicalWorkdayFixture,workdayQuery} from './fixtures/continuous-workdays-synthetic.js';
import {reviewFixture,reviewQuery,reviewSource,reviewPrincipal,reviewSession,REVIEW_RELEASE,REVIEW_CUT,REVIEW_DAY} from './fixtures/workday-review-synthetic.js';

test('extra_open is v2-only; the v1 query and filter contract remain unchanged',()=>{
 assert.equal(normalizeContinuousWorkdayQuery({source:'continuous',status:'extra_open'}).status,'extra_open');
 assert.throws(()=>normalizeWorkdayQuery({status:'extra_open'}));
 assert.throws(()=>filterWorkdays([],{status:'extra_open'}));
 assert.equal(normalizeWorkdayQuery({status:'extra'}).status,'extra');
});
test('extra marks are filtered over the complete source before search, summary and pagination',async()=>{
 const q=reviewQuery({status:'extra_open',page:'2',pageSize:'25'}),d=await reviewFixture(q);
 assert.equal(d.periodSummary.days,114);assert.equal(d.summary.days,110);assert.equal(d.pagination.pages,5);
 assert.equal(d.rows.length,25);assert.equal(d.rows[0].personLabel,'Agente abierto 026');
 assert.equal(d.summary.extraIntervalCount,1);assert.equal(d.summary.extraSeconds,7200);
 assert.ok(d.rows.every(r=>workdayTime(r,'extra').pending.length));verifyWorkdayResponse(d,q);
 const searched=await reviewFixture(reviewQuery({status:'extra_open',search:'Caso mixto'}));
 assert.equal(searched.pagination.total,1);assert.equal(searched.rows[0].extraSeconds,7200);
 assert.equal(workdayTime(searched.rows[0],'extra').pending.length,1);
});
for(const [name,search,pending] of [['entry alone','Agente abierto 001',1],['exit alone','Caso salida aislada',1],['unclosed pause','Caso pausa incompleta',2]])
 test(name+' retains its events but has no reconstructed extra duration',async()=>{
  const d=await reviewFixture(reviewQuery({status:'extra_open',search})),r=d.rows[0];
  assert.equal(d.pagination.total,1);assert.equal(r.extraSeconds,0);assert.equal(r.intervals.length,0);
  assert.deepEqual(workdayTime(r,'extra').seconds,null);assert.equal(workdayTime(r,'extra').pending.length,pending);
  assert.deepEqual(workdaySummaryTime(d.summary,'extra'),{seconds:null,known:true});
  assert.equal(r.payableSeconds,null);assert.equal(d.homologationStatus,'unverified');
 });
test('a genuine zero pause stays zero; absent extra reconstruction is distinct',async()=>{
 const d=await reviewFixture(reviewQuery({search:'Caso sin pausa'})),r=d.rows[0];
 assert.equal(workdayTime(r,'pause').seconds,0);assert.equal(workdayTime(r,'ordinary').seconds,21600);
 assert.equal(workdayTime(r,'extra').seconds,null);
});
test('an explicit zero net interval in an accepted DTO is not replaced by missing data',async()=>{
 const q=reviewQuery({search:'Caso extra completo'}),d=await reviewFixture(q),r=d.rows[0];
 // Boundary contract: counts and interval presence matter, even for net zero.
 r.intervals[0].pauseSeconds=r.intervals[0].elapsedSeconds;r.intervals[0].netSeconds=0;
 r.pauseSeconds=7200;r.extraSeconds=0;r.reconstructedSeconds=0;
 for(const s of [d.summary,d.periodSummary]){s.extraSeconds-=7200;s.pauseSeconds+=7200}
 verifyWorkdayResponse(d,q);assert.equal(workdayTime(r,'extra').seconds,0);
 assert.deepEqual(workdaySummaryTime(d.summary,'extra'),{seconds:0,known:true});
 assert.match(workdayCsv([r],d),/"00:00:00"/);
});
test('complete sequence exposes pause start and end in source order with stable refs',async()=>{
 const d=await reviewFixture(reviewQuery({search:'Caso secuencia completa'})),r=d.rows[0],events=sequenceRows(r);
 assert.deepEqual(events.map(e=>e.code),[0,2,3,1,4,5]);assert.ok(events.every(e=>e.calculated));
 assert.equal(events[1].eventRef,r.intervals[0].pauseEventRefs[0]);
 assert.equal(events[2].eventRef,r.intervals[0].pauseEventRefs[1]);
 assert.equal(events[1].source.ordinal,2);assert.equal(r.pauseSeconds,900);
});
test('simultaneous marks and another device profile remain unreconstructed',async()=>{
 for(const spec of [{name:'Simultáneas',marks:[[4,'15:00:00'],[5,'15:00:00']]},{name:'Otro equipo',model:'OTHER',marks:[[4,'15:00:00'],[5,'17:00:00']]}]){
  const d=await reviewFixture(reviewQuery({status:'extra_open'}),{specs:[spec]});
  assert.equal(d.rows.length,1);assert.equal(workdayTime(d.rows[0],'extra').seconds,null);
  assert.ok(sequenceRows(d.rows[0]).every(e=>!e.calculated));
 }
});
test('overnight completed extra uses context and is excluded from the open filter',()=>{
 const raw=reviewSource({specs:[{name:'Noche',marks:[[4,'23:00:00'],[5,'01:00:00']]}]});
 raw.events[1].occurredAt='2026-09-11T01:00:00-03:00';raw.events[1].localTimestamp='2026-09-11 01:00:00';
 const result=reconstructContinuousWorkdays({...raw,from:REVIEW_DAY,to:REVIEW_DAY});
 assert.equal(result.rows[0].extraSeconds,7200);assert.equal(workdayTime(result.rows[0],'extra').pending.length,0);
 assert.equal(result.rows[0].day,REVIEW_DAY);
});
test('a type-change marker used by the next context day is not falsely open on the preceding day',()=>{
 const raw=reviewSource({specs:[{name:'Cruce',marks:[[0,'23:00:00'],[4,'01:00:00'],[5,'03:00:00']]}]});
 for(const event of raw.events.slice(1)){event.occurredAt=event.occurredAt.replace(REVIEW_DAY,'2026-09-11');event.localTimestamp=event.localTimestamp.replace(REVIEW_DAY,'2026-09-11')}
 const result=reconstructContinuousWorkdays({...raw,from:REVIEW_DAY,to:REVIEW_DAY}),row=result.rows[0];
 assert.equal(result.rows.length,1);assert.equal(row.day,REVIEW_DAY);assert.equal(row.events.length,2);
 assert.equal(filterContinuousWorkdays(result.rows,{status:'extra_open'}).length,0);
 assert.equal(workdayTime(row,'extra').pending.length,0);assert.equal(row.intervals.length,0);
 assert.deepEqual(row.reconstructedEvents,[{eventRef:raw.events[1].eventRef,kind:'extra',day:'2026-09-11'}]);
 assert.equal(sequenceRows(row)[1].calculationDay,'2026-09-11');
 assert.ok(row.reconstructedEvents.every(e=>row.events.some(own=>own.eventRef===e.eventRef)));
});
test('context projection never includes another person or marks a code4 as ordinary',async()=>{
 const q=reviewQuery({search:'Caso secuencia completa'}),d=await reviewFixture(q),r=d.rows[0];
 assert.equal(r.reconstructedEvents.length,r.events.length);
 const bad=structuredClone(d);bad.rows[0].reconstructedEvents.push({eventRef:'f'.repeat(64),kind:'extra',day:REVIEW_DAY});
 assert.throws(()=>verifyWorkdayResponse(bad,q));
 const wrongKind=structuredClone(d),entry=wrongKind.rows[0].events.find(e=>e.code===4);
 wrongKind.rows[0].reconstructedEvents.find(e=>e.eventRef===entry.eventRef).kind='ordinary';
 assert.throws(()=>verifyWorkdayResponse(wrongKind,q));
 const wrongDay=structuredClone(d);wrongDay.rows[0].reconstructedEvents[0].day='2026-09-12';
 assert.throws(()=>verifyWorkdayResponse(wrongDay,q));
});
test('all export pages retain the filter and cut; mixed rows preserve calculated time plus pending marks',async()=>{
 const q=reviewQuery({status:'extra_open',pageSize:'100',snapshot:REVIEW_CUT}),first=await reviewFixture(q),rows=[...first.rows];
 const q2=reviewQuery({status:'extra_open',pageSize:'100',page:'2',snapshot:REVIEW_CUT}),last=await reviewFixture(q2);
 verifyWorkdayResponse(first,q);verifyWorkdayResponse(last,q2);assert.equal(sameWorkdayCut(first,last),true);
 rows.push(...last.rows);assert.equal(rows.length,110);assert.equal(new Set(rows.map(r=>r.key)).size,110);
 const csv=workdayCsv(rows,first);assert.equal(csv.trim().split(/\r?\n/).length,111);
 assert.match(csv,/No reconstruido/);assert.match(csv,/Caso mixto.*02:00:00.*Marcas extra sin tramo completo/);
 assert.match(csv,/sin aprobación salarial/);assert.ok(rows.every(r=>csv.includes(r.events[0].eventRef)));
 const files=unzipSync(workdayXlsx(first,rows)),sheet=strFromU8(files['xl/worksheets/sheet1.xml']);
 assert.equal((sheet.match(/<row r=/g)||[]).length,111);assert.match(sheet,/No reconstruido/);
 assert.match(strFromU8(files['xl/worksheets/sheet3.xml']),/Marcas extra sin tramo completo/);
 const changed=structuredClone(last);changed.summary.extraIntervalCount++;assert.equal(sameWorkdayCut(first,changed),false);
});
test('summary counts are validated and old v2 responses retain an explicit unknown state',async()=>{
 const q=reviewQuery({search:'Caso extra completo'}),d=await reviewFixture(q);
 const bad=structuredClone(d);bad.summary.extraIntervalCount=0;assert.throws(()=>verifyWorkdayResponse(bad,q));
 for(const s of [d.summary,d.periodSummary]){delete s.ordinaryIntervalCount;delete s.extraIntervalCount}
 for(const r of d.rows)delete r.reconstructedEvents;
 verifyWorkdayResponse(d,q);assert.deepEqual(workdaySummaryTime(d.summary,'extra'),{seconds:7200,known:false});
});
test('v1 exports preserve their zero and origin-ordinal contract',()=>{
 const q=workdayQuery({resource:'clock-workdays'}),d=historicalWorkdayFixture(q),row=d.rows[1];
 assert.equal(row.extraSeconds,0);assert.match(workdayCsv([row],d),/00:00:00/);
 assert.doesNotMatch(workdayCsv([row],d),/No reconstruido/);assert.ok('startOrdinal' in row.intervals[0]);
});
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(v){this.payload=v;return this}});
test('unchanged HTTP route applies extra_open privately without filtering the SQL event context',async()=>{
 const calls=[],res=response();
 const handler=createInternalAttendanceHandler({env:{NODE_ENV:'test',INTERNAL_CERTIFIED_DATA_CONTRACT_SHA:REVIEW_RELEASE},requireCompatibleInternalAccess:async()=>({mode:'managed',principal:reviewPrincipal,session:reviewSession}),getInternalSql:async()=>({query:async(sql,params)=>{calls.push({sql,params});return [{result:reviewSource()}]}})});
 await handler({method:'GET',query:Object.fromEntries(reviewQuery({status:'extra_open',page:'2'})),headers:{}},res);
 assert.equal(res.statusCode,200);assert.equal(res.payload.pagination.total,110);assert.equal(calls.length,1);
 assert.match(calls[0].sql,/attendance_clock_workday_source_v2/);assert.equal(calls[0].params.length,10);
 assert.ok(!calls[0].params.includes('extra_open'));assert.match(res.headers['Cache-Control'],/private, no-store/);
});
