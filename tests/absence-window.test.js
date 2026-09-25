import test from 'node:test';import assert from 'node:assert/strict';
import {absenceMatchesWindow,absenceWindowMode,absenceWindowRelation,absenceWindowDateIntegrity} from '../assets/absence-window-model.js';
import {absenceWindowSql} from '../lib/absence-window-sql.js';
import {absenceRangeIntegrity} from '../lib/absence-event-context.js';
import {parseAbsencePersonQuery,verifyAbsencePersonResponse,sameAbsencePersonRead} from '../assets/absence-person-model.js';
import {internalAbsencePerson} from '../lib/internal-absence-person.js';
import {absenceEvents} from '../api/internal-data.js';
import {windowFixture,windowQuery,PERSON_CONTRACT,PERSON_TENANT,PERSON_SNAPSHOT} from './fixtures/absence-window-synthetic.js';
const from='2026-09-01',to='2026-09-10',event=(date,untilDate)=>({date,untilDate});
for(const [name,date,end,starts,overlap]of [
 ['crossing','2026-08-28','2026-09-03',false,true],['starts-first','2026-09-01','2026-09-02',true,true],
 ['starts-last','2026-09-10','2026-09-15',true,true],['ends-first','2026-08-30','2026-09-01',false,true],
 ['expired','2026-08-29','2026-08-31',false,false],['future','2026-09-11','2026-09-15',false,false],
 ['unknown-end-before','2026-08-30',null,false,false],['unknown-end-inside','2026-09-02',null,true,true],
 ['inverted-before','2026-08-31','2026-08-30',false,false],['inverted-inside','2026-09-03','2026-08-30',true,true],
 ['extended-source','2026-08-08','2033-08-08',false,true]])test('inclusive date predicate: '+name,()=>{
 const e=event(date,end),before=structuredClone(e);assert.equal(absenceMatchesWindow(e,from,to,'starts'),starts);assert.equal(absenceMatchesWindow(e,from,to,'overlaps'),overlap);assert.deepEqual(e,before);
 if(overlap)assert.equal(absenceWindowRelation(e,from,to),date<from?'began_before':'starts_inside');
});
test('leap day is validated rather than silently normalized',()=>{
 assert.equal(absenceMatchesWindow(event('2024-02-28','2024-03-01'),'2024-02-29','2024-02-29','overlaps'),true);
 assert.throws(()=>absenceMatchesWindow(event('2026-02-29','2026-03-01'),from,to,'overlaps'));
});
for(const mode of [null,'',[],['overlaps'],'OVERLAPS','ongoing'])test('invalid range mode is rejected: '+JSON.stringify(mode),()=>assert.throws(()=>absenceWindowMode(mode)));
test('SQL predicate allows only known aliases and parameter positions',()=>{
 assert.equal(absenceWindowSql('absence'),'absence.fecha >= $1::date AND absence.fecha <= $2::date');
 assert.match(absenceWindowSql('a','overlaps','$3','$4'),/a.fecha_hasta >= a.fecha AND a.fecha_hasta >= \$3::date/);
 for(const args of [['employee'],['a','other'],['a','starts','$1','$4'],['other','overlaps']])assert.throws(()=>absenceWindowSql(...args));
});
test('client quality labels preserve the existing server date interpretation',()=>{
 for(const [a,b]of [['2026-08-01','2033-08-08'],['2026-09-05','2026-09-04'],['2026-09-05',null],['2026-09-01','2026-09-10']])assert.equal(absenceWindowDateIntegrity(a,b),absenceRangeIntegrity(a,b));
});
test('v1 remains start-based; explicit v2 describes all intersecting events before pagination',()=>{
 const old=windowFixture(),q=windowQuery({rangeMode:'overlaps'}),data=windowFixture(q);
 assert.equal(verifyAbsencePersonResponse(old,windowQuery()).version,'absence-person.v1');assert.equal(old.summary.events,10);
 assert.equal(verifyAbsencePersonResponse(data,q).summary.events,40);assert.equal(data.events.length,25);
 assert.equal(data.summary.beganBeforePeriod,30);assert.equal(data.summary.endNotReportedEvents,1);assert.equal(data.summary.reportedDaysSum,1059);
 const next=windowFixture({...q,page:2});assert.equal(next.events.length,15);assert.equal(sameAbsencePersonRead(data,next),true);
 assert.equal(sameAbsencePersonRead(old,data),false);
});
test('source cutoff limits query dates, not original end dates or declared quantities',()=>{
 const q=windowQuery({rangeMode:'overlaps',to:'2026-09-30'}),data=verifyAbsencePersonResponse(windowFixture(q),q);
 assert.equal(data.range.effective.to,'2026-09-10');assert.equal(data.range.clamped.to,true);
 const long=data.events.find(e=>e.untilDate==='2033-08-08');assert.equal(long.declaredDays,35);assert.equal(long.rangeIntegrity,'extended_source_range');
 assert.equal(data.sourceComplete,false);assert.equal(data.semantics,'administrative_events_not_workdays_or_payroll');
});
const queryStrings=q=>Object.fromEntries(Object.entries(q).filter(([,v])=>v!==null).map(([k,v])=>[k,String(v)]));
const binding={tenantId:PERSON_TENANT,companyId:101,database:'GRH_QA'};
function database(q){
 const calls=[];return {calls,query:async(text,values=[])=>{
  calls.push({text,values});const d=windowFixture(q);
  if(text.includes('absence-person:contract'))return[{contractId:PERSON_CONTRACT,number:'QA1001',name:d.person.name,sector:d.person.sector}];
  if(text.includes('absence:source'))return[{importId:6,sourceCutoff:'2026-09-10',status:'completed'}];
  if(text.includes('absence:events-summary'))return[{events:d.summary.events,affectedContracts:d.summary.events?1:0,sourceDeclaredDays:d.summary.reportedDaysSum}];
  if(text.includes('absence-person:summary'))return[{...d.summary,beganBeforePeriod:d.summary.beganBeforePeriod??0,endNotReportedEvents:1}];
  if(text.includes('absence:events'))return d.events.map(e=>({contractId:PERSON_CONTRACT,companyId:101,legajo:'QA1001',name:d.person.name,sector:d.person.sector,eventDate:e.date,untilDate:e.untilDate,reasonCode:e.reasonCode,reason:e.reason,sourceDeclaredDays:e.declaredDays,sourceQuantity:e.quantity}));
  throw Error('UNEXPECTED_QUERY');
 }};
}
for(const rangeMode of [undefined,'starts','overlaps'])test('event service and summary share the '+String(rangeMode)+' predicate',async()=>{
 const q=windowQuery(rangeMode?{rangeMode}:{}),sql=database(q);
 const r=await internalAbsencePerson(sql,{query:queryStrings(q)},binding,PERSON_SNAPSHOT,{readEvents:absenceEvents});
 assert.equal(r.status,200);assert.equal(r.payload.data.summary.events,rangeMode==='overlaps'?40:10);
 for(const c of sql.calls.filter(c=>c.text.includes('absence:events'))){assert.ok(c.values.includes(PERSON_CONTRACT));assert.equal(c.values[0],from);assert.equal(c.values[1],to);assert.match(c.text,/contract.id = \$3::uuid/);assert.ok(c.text.includes(absenceWindowSql('absence',rangeMode)));}
 const sum=sql.calls.find(c=>c.text.includes('absence-person:summary'));assert.deepEqual(sum.values,[101,'QA1001',from,to]);assert.ok(sum.text.includes(absenceWindowSql('a',rangeMode,'$3','$4')));
 assert.doesNotMatch(JSON.stringify(r.payload),/source_payload|comentario|dni|cuil/);
});
for(const rangeMode of [null,[],['overlaps'],'other'])test('invalid mode stops before private data queries',async()=>{
 const sql=database(windowQuery()),q={...queryStrings(windowQuery()),rangeMode};const r=await internalAbsencePerson(sql,{query:q},binding,PERSON_SNAPSHOT,{readEvents:absenceEvents});assert.equal(r.status,400);assert.equal(sql.calls.length,0);
});
const malformed={mode:d=>d.rangeMode='starts',version:d=>d.version='absence-person.v1',unbounded:d=>d.events[12].untilDate=null,changed:d=>d.snapshot='b'.repeat(64),relation:d=>d.summary.beganBeforePeriod=0,missing:d=>delete d.summary.endNotReportedEvents,falseReview:d=>d.events.find(e=>e.untilDate==='2033-08-08').rangeIntegrity='valid_source_range',extra:d=>d.person.comment='PRIVATE_TEXT'};
for(const [name,change]of Object.entries(malformed))test('overlap response rejects '+name,()=>{
 const q=windowQuery({rangeMode:'overlaps'}),d=windowFixture(q);change(d);assert.throws(()=>verifyAbsencePersonResponse(d,q));
});
test('single-page counters cannot claim additional previous starts or missing end dates',()=>{
 const q=windowQuery({rangeMode:'overlaps',limit:50});for(const change of [d=>d.summary.beganBeforePeriod++,d=>d.summary.endNotReportedEvents++]){const d=windowFixture(q);change(d);assert.throws(()=>verifyAbsencePersonResponse(d,q));}
});
test('paginated overlap preserves full-source totals and exact context',async()=>{
 const q=windowQuery({rangeMode:'overlaps',page:2}),sql=database(q);const r=await internalAbsencePerson(sql,{query:queryStrings(q)},binding,PERSON_SNAPSHOT,{readEvents:absenceEvents});
 assert.equal(r.status,200);assert.equal(r.payload.data.events.length,15);assert.equal(r.payload.data.summary.events,40);assert.equal(r.payload.data.summary.beganBeforePeriod,30);assert.equal(r.payload.data.summary.reportedDaysSum,1059);
 const rowRead=sql.calls.find(c=>c.text.includes('/* absence:events */'));assert.deepEqual(rowRead.values.slice(-2),[25,25]);
});
test('wrong snapshot is rejected before reading a differently scoped source',async()=>{
 const q=windowQuery({rangeMode:'overlaps',snapshot:'b'.repeat(64)}),sql=database(q);const r=await internalAbsencePerson(sql,{query:queryStrings(q)},binding,PERSON_SNAPSHOT,{readEvents:absenceEvents});assert.equal(r.status,409);assert.equal(sql.calls.length,0);
});
test('an older source start can cross the earliest supported request window without changing its date',()=>{
 const q=windowQuery({from:'1990-01-01',to:'1990-01-03',rangeMode:'overlaps'}),d=windowFixture(q);
 d.events=[{date:'1989-12-30',untilDate:'1990-01-02',reasonCode:'11',reason:'Fuente de prueba',declaredDays:4,quantity:4,rangeIntegrity:'valid_source_range'}];
 d.summary={events:1,reportedDaysEvents:1,reportedDaysSum:4,reasonCount:1,dateReviewEvents:0,beganBeforePeriod:1,endNotReportedEvents:0};d.pagination={page:1,limit:25,total:1,pages:1};
 assert.equal(verifyAbsencePersonResponse(d,q).events[0].date,'1989-12-30');
 assert.throws(()=>parseAbsencePersonQuery(queryStrings({...q,from:'1989-12-30'})));
});
test('an inverted old end inside the selected start window is a review case, never a corrected date',()=>{
 const q=windowQuery({rangeMode:'overlaps',limit:50}),d=windowFixture(q);d.events[1].untilDate='1989-01-01';d.events[1].rangeIntegrity='inverted_source_range';d.summary.dateReviewEvents++;
 assert.equal(verifyAbsencePersonResponse(d,q).events[1].untilDate,'1989-01-01');
});
