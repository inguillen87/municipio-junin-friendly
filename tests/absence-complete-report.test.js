import test from 'node:test';import assert from 'node:assert/strict';
import {collectAbsenceReport,recheckAbsenceReport,absenceReportCsv,absenceReportFilename} from '../assets/absence-person-report.js';
import {personFixture,personQuery} from './fixtures/absence-person-synthetic.js';
import {windowFixture,windowQuery} from './fixtures/absence-window-synthetic.js';
const signal=()=>new AbortController().signal;
const fixture=personFixture(personQuery({page:3}));
const options=(extra={})=>({signal:signal(),read:async q=>personFixture(q),now:()=>new Date('2026-09-25T10:00:00Z'),...extra});
test('collects all 61 events from a displayed last page and confirms source access again',async()=>{
 const calls=[],progress=[];const r=await collectAbsenceReport(fixture,options({read:async q=>{calls.push(q);return personFixture(q);},onProgress:p=>progress.push(p)}));
 assert.equal(fixture.events.length,11);assert.equal(r.events.length,61);assert.deepEqual(calls.map(q=>[q.page,q.limit]),[[1,50],[2,50],[1,50]]);
 assert.deepEqual(progress.map(p=>p.received),[50,61]);assert.ok(calls.every(q=>q.snapshot===fixture.snapshot&&q.contractId===fixture.person.contractId));
 assert.equal(r.checkedAt,'2026-09-25T10:00:00.000Z');assert.ok(Object.isFrozen(r.events));assert.ok(Object.isFrozen(r.events[0]));
 assert.equal(fixture.pagination.page,3);assert.equal(await recheckAbsenceReport(r,options()),true);
});
test('CSV includes all events with original dates, missing values and exact context',async()=>{
 const r=await collectAbsenceReport(fixture,options()),csv=absenceReportCsv(r);assert.equal(csv.charCodeAt(0),0xfeff);assert.equal(csv.trimEnd().split('\r\n').length,62);
 assert.match(csv,/2033-08-08/);assert.match(csv,/No informado/);assert.match(csv,/Sin firma digital/);assert.match(csv,/Contrato/);assert.match(csv,new RegExp(fixture.snapshot));
 assert.equal(absenceReportFilename(r),'ausencias_2026-07-01_2026-09-10.csv');assert.doesNotMatch(absenceReportFilename(r),/1001|Agente/);
});
test('overlap export preserves 40 complete events, 30 earlier starts and original 1059 declared days',async()=>{
 const q=windowQuery({rangeMode:'overlaps',page:2}),d=windowFixture(q),r=await collectAbsenceReport(d,options({read:async q=>windowFixture(q)}));
 assert.equal(r.events.length,40);assert.equal(r.events.filter(e=>e.date<q.from).length,30);assert.equal(r.anchor.summary.reportedDaysSum,1059);assert.match(absenceReportCsv(r),/Cruzan el período/);
});
for(const [name,mutate]of [['contract',d=>d.person.contractId='33333333-3333-4333-8333-333333333333'],['tenant',d=>d.tenantId='44444444-4444-4444-8444-444444444444'],['summary',d=>d.summary.reportedDaysSum++],['snapshot',d=>d.snapshot='b'.repeat(64)],['identity',d=>d.person.name='Other person']])test('rejects '+name+' drift before releasing an incomplete file',async()=>{
 let calls=0;await assert.rejects(collectAbsenceReport(fixture,options({read:async q=>{const d=personFixture(q);if(++calls===2)mutate(d);return d;}})));assert.equal(calls,2);
});
for(const status of [401,403,409,503])test('a final '+status+' response prevents export after collecting all rows',async()=>{
 let calls=0;await assert.rejects(collectAbsenceReport(fixture,options({read:async q=>{if(++calls===3)throw Object.assign(Error('denied'),{status});return personFixture(q);}})),{status});assert.equal(calls,3);
});
test('changed first-page content at final verification invalidates the report',async()=>{
 let calls=0;await assert.rejects(collectAbsenceReport(fixture,options({read:async q=>{const d=personFixture(q);if(++calls===3)d.events[0].reason='Changed source';return d;}})),{code:'ABSENCE_PERSON_SOURCE_CHANGED'});
});
test('repeated dates across page boundaries are not silently deduplicated',async()=>{
 await assert.rejects(collectAbsenceReport(fixture,options({read:async q=>{const d=personFixture(q);if(q.page===2)d.events[0].date=personFixture({...q,page:1}).events.at(-1).date;return d;}})),{code:'ABSENCE_REPORT_PAGE_ORDER'});
});
test('cancellation after first page prevents the next request',async()=>{
 const c=new AbortController();let calls=0;await assert.rejects(collectAbsenceReport(fixture,options({signal:c.signal,read:async q=>{calls++;return personFixture(q);},onProgress:()=>c.abort()})),{name:'AbortError'});assert.equal(calls,1);
});
test('expired operation cannot release a response that arrived after cancellation',async()=>{
 const c=new AbortController();await assert.rejects(collectAbsenceReport(fixture,options({signal:c.signal,read:async q=>{c.abort();return personFixture(q);}})),{name:'AbortError'});
});
test('files and print authorization require a report actually issued by the collector',async()=>{
 assert.throws(()=>absenceReportCsv({...fixture,version:'absence-complete-report.v1'}),{code:'ABSENCE_REPORT_UNVERIFIED'});
 const r=await collectAbsenceReport(fixture,options());assert.throws(()=>absenceReportCsv(structuredClone(r)),{code:'ABSENCE_REPORT_UNVERIFIED'});
 await assert.rejects(recheckAbsenceReport(r,options({read:async()=>{throw Object.assign(Error('revoked'),{status:403});}})),{status:403});
});
