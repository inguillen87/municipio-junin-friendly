import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {absenceRangeIntegrity,normalizeAbsenceDetailScope,absenceSearchPattern} from '../lib/absence-event-context.js';
import {absenceAnalytics,absenceEvents} from '../api/internal-data.js';
import {compareWorkdayReference,referenceDuration,clockCodeSummary} from '../assets/workday-quick-analysis.js';
import {continuousWorkdayFixture,workdayQuery} from './fixtures/continuous-workdays-synthetic.js';
import {clockDashboardFixture} from './fixtures/clock-dashboard-v3-synthetic.js';
const source={importId:6,sourceCutoff:'2026-09-10T15:17:30',status:'completed'};
function db(){const calls=[];return {calls,query:async(text,values=[])=>{calls.push({text,values});const marker=/absence:([^* ]+)/.exec(text)?.[1];if(marker==='source')return[source];if(marker==='events')return[{eventDate:'2026-09-08',untilDate:'2033-08-08',sourceDeclaredDays:'1',sourceQuantity:'1'}];if(marker==='facet-reasons')return[];if(marker==='facet-sectors')return[];if(['events-summary','analytics-summary','comparison'].includes(marker))return[{events:0,affectedContracts:0,sourceDeclaredDays:0}];if(marker==='quality')return[{}];return[];}};}
test('absence date review preserves dates while flagging an extended range, not its legality',()=>{
 assert.equal(absenceRangeIntegrity('2026-09-08','2033-08-08'),'extended_source_range');assert.equal(absenceRangeIntegrity('2026-09-08','2026-09-13'),'valid_source_range');
 assert.equal(absenceRangeIntegrity('2026-09-08','2026-09-07'),'inverted_source_range');assert.equal(absenceRangeIntegrity('2026-09-08',null),'until_date_not_reported');
 assert.equal(absenceRangeIntegrity('2026-02-30','2026-03-02'),'invalid_source_date');
});
test('nominal event searches are parameterized, bounded and applied to count and rows together',async()=>{
 const sql=db(),q="QA%' OR 1=1 --_",r=await absenceEvents(sql,{query:{from:'2026-08-01',to:'2026-09-10',search:q}});
 assert.equal(r.status,200);for(const c of sql.calls.filter(c=>c.text.includes('absence:events'))){assert.ok(c.values.includes(absenceSearchPattern(q)));assert.ok(c.text.includes('identity.full_name'));assert.equal(c.text.includes(q),false);}
 assert.equal(r.payload.data[0].untilDate,'2033-08-08');assert.equal(r.payload.data[0].sourceDeclaredDays,1);assert.equal(r.payload.data[0].rangeIntegrity,'extended_source_range');
});
test('invalid search and contract identifiers fail before touching the data source',async()=>{
 for(const query of [{search:'x'.repeat(121)},{search:'a\nb'},{contractId:'invalid'}]){const sql=db();assert.equal((await absenceEvents(sql,{query})).status,400);assert.equal(sql.calls.length,0);}
});
test('zero baseline yields unknown variation, not a mathematical zero',async()=>{
 const sql=db(),r=await absenceAnalytics(sql,{query:{from:'2026-08-01',to:'2026-09-10',reasonCode:'20'}});assert.deepEqual(r.payload.data.comparison.changePercent,{events:null,affectedContracts:null,sourceDeclaredDays:null});
 const facets=sql.calls.filter(c=>/absence:facet-/.test(c.text));assert.equal(facets.length,2);assert.ok(facets.every(c=>c.text.includes('MATERIALIZED')));
 const quality=sql.calls.find(c=>c.text.includes('absence:quality'));assert.doesNotMatch(quality.text,/grh_effective_catalog_rows|grh_effective_employees/);
});
test('duration reference means HH:MM, never decimal hours',()=>{
 assert.equal(referenceDuration('01:30'),5400);assert.equal(referenceDuration('24:00'),86400);for(const v of ['1.30','1,30','25:00','24:01','02:60','-1:00',''])assert.equal(referenceDuration(v),null);
});
test('quick comparison reuses actual net intervals and does not create payable time',async()=>{
 const data=await continuousWorkdayFixture(workdayQuery()),row=data.rows[0],copy=structuredClone(row);
 assert.deepEqual(compareWorkdayReference(row,'08:00'),{status:'reference_only',expectedSeconds:28800,ordinarySeconds:20700,declaredExtraSeconds:7200,pauseSeconds:900,observedSeconds:27900,differenceSeconds:-900,payableSeconds:null});
 assert.equal(compareWorkdayReference(row,'06:00').differenceSeconds,6300);assert.equal(compareWorkdayReference(row,'07:45').differenceSeconds,0);assert.deepEqual(row,copy);
});
test('incomplete, unlinked or inconsistent workdays cannot produce a reference variance',async()=>{
 const data=await continuousWorkdayFixture(workdayQuery());
 for(const change of [r=>r.status='review',r=>r.identityState='unmapped',r=>r.issues.push({code:'entry_missing'}),r=>r.intervals[0].netSeconds++,r=>r.intervals=[]]){const row=structuredClone(data.rows[0]);change(row);assert.equal(compareWorkdayReference(row,'08:00').status,'needs_review');}
 assert.equal(compareWorkdayReference(data.rows[0],'00:00').status,'invalid_reference');
});
test('clock graphs reconcile code counts and do not interpret a different device profile',()=>{
 const d=clockDashboardFixture(new URLSearchParams({source:'continuous'}));assert.deepEqual(clockCodeSummary(d),{entries:102,exits:51,pauses:0,extra:0,unknown:0,profileSupported:true,total:153});
 d.dashboard.device.model='SF300/ID';assert.equal(clockCodeSummary(d).unknown,153);assert.equal(clockCodeSummary(d).entries,0);assert.equal(clockCodeSummary(d).profileSupported,false);
 d.dashboard.codes[0].marks++;assert.equal(clockCodeSummary(d),null);
});
test('absence inline script remains valid and paginated detail does not reload the analytics',()=>{
 const html=fs.readFileSync(new URL('../ausentismo-control.html',import.meta.url),'utf8'),scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
 assert.equal(scripts.length,1);assert.doesNotThrow(()=>new vm.Script(scripts[0][1]));assert.match(html,/eventsOnly: true|eventsOnly:true/);assert.match(html,/Promise\.allSettled/);assert.match(html,/readController\.abort/);
 assert.match(html,/Ver caso/);assert.match(html,/Abrir legajo completo/);assert.match(html,/value === null.*return null/);
 assert.doesNotMatch(html,/searchParams\.set\(['"]search/);
});
