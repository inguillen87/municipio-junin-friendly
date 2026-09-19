import test from 'node:test';import assert from 'node:assert/strict';import {unzipSync,strFromU8} from 'fflate';
import {WORKDAY_REVIEW_CAUSES,normalizeReviewCause,workdayReviewCauses,summarizeReviewCauses,verifyReviewCauses} from '../assets/workday-review-causes.js';
import {verifyWorkdayResponse,sameWorkdayCut} from '../assets/workday-panel-model.js';
import {workdayCsv,workdayXlsx} from '../assets/workday-export.js';
import {reviewFixture,reviewQuery,reviewSource,reviewPrincipal,reviewSession,REVIEW_RELEASE,REVIEW_CUT,REVIEW_DAY} from './fixtures/workday-review-synthetic.js';
import {createInternalAttendanceHandler} from '../api/internal-attendance.js';
import {getAttendanceWorkdaysV2,normalizeContinuousWorkdayQuery} from '../lib/internal-attendance-workdays.js';
const makeRow=codes=>({status:codes.length?'review':'closed',issues:codes.map(code=>({code}))});
test('known reconstruction codes map to review actions without interpreting names or hours',()=>{
 const cases={boundaries:['missing_entry','missing_exit','repeated_entry','mixed_interval','wrong_exit'],pauses:['pause_without_entry','repeated_pause','return_without_pause','pause_not_closed'],identity:['identity_unlinked'],timing:['simultaneous_events','span_exceeded','overnight_review'],source:['unknown_code','source_observation','unplaced_source_observation']};
 for(const [key,codes]of Object.entries(cases))assert.deepEqual(workdayReviewCauses(makeRow(codes)),[key]);
 assert.deepEqual(workdayReviewCauses(makeRow(['new_future_issue'])),['other']);assert.deepEqual(workdayReviewCauses({status:'review',issues:[]}),['other']);assert.deepEqual(workdayReviewCauses(makeRow([])),[]);
});
test('one person-day may have overlapping causes but only one count per cause',()=>{
 const summary=summarizeReviewCauses([makeRow(['missing_entry','missing_exit','pause_not_closed','identity_unlinked']),makeRow([])]);
 assert.equal(summary.totalDays,2);assert.equal(summary.reviewDays,1);assert.equal(summary.counts.boundaries,1);assert.equal(summary.counts.pauses,1);assert.equal(summary.counts.identity,1);assert.equal(summary.overlap,true);assert.equal(summary.payrollEligible,false);
});
test('filters reject arbitrary properties, implicit types and unknown categories',()=>{
 for(const value of ['__proto__','constructor',{},null,1,'missing_entry'])assert.throws(()=>normalizeReviewCause(value));
 assert.throws(()=>normalizeContinuousWorkdayQuery({source:'continuous',cause:'unknown'}),/Causa/);
 assert.deepEqual(workdayReviewCauses(makeRow(['constructor'])),['other']);
});
test('v2 without an explicit cause keeps the prior response contract',async()=>{
 const d=await reviewFixture();assert.equal(Object.hasOwn(d,'reviewFacets'),false);assert.equal(Object.hasOwn(d.filters,'cause'),false);verifyWorkdayResponse(d,reviewQuery());
});
test('whole-scope cause counts precede pagination and do not treat incomplete marks as absences',async()=>{
 const q=reviewQuery({cause:'boundaries',page:'2'}),d=await reviewFixture(q);verifyWorkdayResponse(d,q);
 assert.equal(d.periodSummary.days,114);assert.equal(d.reviewFacets.totalDays,114);assert.equal(d.reviewFacets.reviewDays,111);assert.equal(d.reviewFacets.counts.boundaries,110);assert.equal(d.reviewFacets.counts.pauses,1);assert.equal(d.pagination.total,110);assert.equal(d.rows.length,25);
 assert.ok(d.rows.every(r=>r.payableSeconds===null&&r.amountArs===null&&r.payrollEligible===false));
});
test('counts respect applied search/status and survive a cause with no matching rows',async()=>{
 const q=reviewQuery({search:'Caso pausa',cause:'identity'}),d=await reviewFixture(q);verifyWorkdayResponse(d,q);assert.equal(d.pagination.total,0);assert.equal(d.reviewFacets.totalDays,1);assert.equal(d.reviewFacets.counts.pauses,1);
 const closed=await reviewFixture(reviewQuery({status:'closed',cause:'all'}));assert.equal(closed.reviewFacets.totalDays,3);assert.equal(closed.reviewFacets.reviewDays,0);
});
test('filters never discard context needed for an overnight interval',async()=>{
 const raw=reviewSource({specs:[{name:'Nocturno sintético',marks:[[4,'23:00:00'],[5,'01:00:00']]}]});raw.events[1].occurredAt='2026-09-11T01:00:00-03:00';raw.events[1].localTimestamp='2026-09-11 01:00:00';
 const q=reviewQuery({cause:'timing'}),d={ok:true,...await getAttendanceWorkdaysV2({query:async()=>[{result:raw}]},reviewPrincipal,Object.fromEntries(q),reviewSession)};
 verifyWorkdayResponse(d,q);assert.equal(d.rows.length,1);assert.equal(d.rows[0].extraSeconds,7200);assert.equal(d.rows[0].day,REVIEW_DAY);assert.equal(d.reviewFacets.counts.timing,1);
});
test('identity review survives pseudonymization without granting nominal search',async()=>{
 const raw=reviewSource({nominal:false,specs:[{name:'No mostrar',marks:[[4,'15:00:00']]}]});raw.events[0].identityState='unmapped';
 const q=reviewQuery({cause:'identity'}),d={ok:true,...await getAttendanceWorkdaysV2({query:async()=>[{result:raw}]},reviewPrincipal,Object.fromEntries(q),reviewSession)};
 verifyWorkdayResponse(d,q,{nominalReadAllowed:false});assert.equal(d.rows[0].legajo,null);assert.match(d.rows[0].personLabel,/^Persona /);assert.equal(d.reviewFacets.counts.identity,1);assert.equal(d.reviewFacets.counts.boundaries,1);
});
test('cause metadata, counts, row membership and extra properties are verified before display',async()=>{
 const q=reviewQuery({cause:'pauses'}),original=await reviewFixture(q);
 for(const mutate of [d=>delete d.reviewFacets,d=>d.filters.cause='all',d=>d.reviewFacets.payrollEligible=true,d=>d.reviewFacets.counts.pauses=2,d=>d.reviewFacets.counts.extra=1,d=>d.reviewFacets.reviewDays=0,d=>d.rows[0].issues=[{code:'missing_entry',label:'Otra',eventRefs:[]}]] ) {const d=structuredClone(original);mutate(d);assert.throws(()=>verifyWorkdayResponse(d,q));}
 const all=await reviewFixture(reviewQuery({search:'Caso pausa',cause:'all'}));all.reviewFacets.counts.boundaries=1;assert.throws(()=>verifyReviewCauses(all,'all'));
});
test('unknown future issue is visible and cannot disappear by being called complete',()=>{
 assert.deepEqual(workdayReviewCauses(makeRow(['unexpected_contract'])),['other']);assert.throws(()=>workdayReviewCauses({status:'closed',issues:[{code:'identity_unlinked'}]}));
 assert.throws(()=>workdayReviewCauses({status:'review',issues:[{code:42}]}));assert.throws(()=>summarizeReviewCauses(Array.from({length:25001},()=>makeRow([]))));
});
test('zero-row verified response has explicit zero causes, not a failed source substituted with zero',()=>{
 const f=summarizeReviewCauses([]);assert.equal(f.counts.all,0);assert.equal(f.reviewDays,0);assert.ok(Object.values(f.counts).every(v=>v===0));
});
test('all exported pages preserve cause, context and census without duplicate person-days',async()=>{
 const first=await reviewFixture(reviewQuery({cause:'boundaries',pageSize:'100',snapshot:REVIEW_CUT})),last=await reviewFixture(reviewQuery({cause:'boundaries',pageSize:'100',page:'2',snapshot:REVIEW_CUT}));
 assert.equal(sameWorkdayCut(first,last),true);const rows=[...first.rows,...last.rows];assert.equal(rows.length,110);assert.equal(new Set(rows.map(r=>r.key)).size,110);
 const csv=workdayCsv(rows,first);assert.equal(csv.trim().split(/\r?\n/).length,111);assert.match(csv,/Causa seleccionada/);assert.match(csv,/Entradas o salidas/);assert.match(csv,/no permite completar horas ni presumir una ausencia/);
 const zip=unzipSync(workdayXlsx(first,rows)),sheet=strFromU8(zip['xl/worksheets/sheet1.xml']),control=strFromU8(zip['xl/worksheets/sheet3.xml']);
 assert.equal((sheet.match(/<row r=/g)||[]).length,111);assert.match(sheet,/Próximo paso sugerido/);assert.match(sheet,/<c r="K111"/);assert.match(control,/Causa seleccionada/);assert.match(control,/categorías superpuestas/);
 const changed=structuredClone(last);changed.reviewFacets.counts.source=1;assert.equal(sameWorkdayCut(first,changed),false);
});
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.payload=v;return this;}});
test('HTTP adapter reuses tenant session and complete SQL window, not a client-selected authority',async()=>{
 const calls=[],res=response(),handler=createInternalAttendanceHandler({env:{NODE_ENV:'test',INTERNAL_CERTIFIED_DATA_CONTRACT_SHA:REVIEW_RELEASE},requireCompatibleInternalAccess:async()=>({mode:'managed',principal:reviewPrincipal,session:reviewSession}),getInternalSql:async()=>({query:async(sql,params)=>{calls.push({sql,params});return[{result:reviewSource()}];}})});
 await handler({method:'GET',query:Object.fromEntries(reviewQuery({cause:'pauses'})),headers:{}},res);assert.equal(res.statusCode,200);assert.equal(res.payload.pagination.total,1);assert.equal(calls.length,1);assert.equal(calls[0].params.length,10);assert.equal(calls[0].params.includes('pauses'),false);assert.match(res.headers['Cache-Control'],/private, no-store/);
 const invalid=response();await handler({method:'GET',query:{...Object.fromEntries(reviewQuery({cause:'all'})),tenantId:'other'},headers:{}},invalid);assert.equal(invalid.statusCode,400);assert.equal(calls.length,1);
});
test('adding cause metadata does not change reconstructed times, event provenance or input records',async()=>{
 const q=reviewQuery({pageSize:'100',search:'Caso'}),before=await reviewFixture(q),after=await reviewFixture(reviewQuery({pageSize:'100',search:'Caso',cause:'all'}));assert.deepEqual(after.rows,before.rows);assert.deepEqual(after.summary,before.summary);assert.deepEqual(after.periodSummary,before.periodSummary);
});
test('deployable clock HTML and reusable templates include every cause control exactly once',async()=>{
 const fs=await import('node:fs/promises');
 for(const file of ['relojes-marcaciones.html','assets/clock-dashboard-panel.html','assets/workday-panel.html']){
  const html=await fs.readFile(file,'utf8');for(const id of ['wdCause','wdCauseField','wdReview','wdReviewTitle','wdReviewCounts','wdReviewNotice'])assert.equal(html.split('id="'+id+'"').length-1,1,file+':'+id);
 }
 const page=await fs.readFile('relojes-marcaciones.html','utf8');assert.match(page,/data-workday-release="workdays-v2"/);assert.match(page,/Referencia no homologada/);
});
test('cause classification module is shipped with the panel, without adding personal browser storage',async()=>{
 const fs=await import('node:fs/promises');assert.match(await fs.readFile('scripts/build-friendly.mjs','utf8'),/'assets\/workday-review-causes.js'/);
 assert.doesNotMatch(await fs.readFile('assets/workday-review-causes.js','utf8'),/\bfetch\s*\(|localStorage|sessionStorage|indexedDB|innerHTML/);
});
test('deployment includes the two source-only workday templates without lifting the HTML exclusion',async()=>{
 const fs=await import('node:fs/promises');const rules=(await fs.readFile('.vercelignore','utf8')).split(/\r?\n/).map(s=>s.trim());
 assert.ok(rules.includes('*.html'));
 assert.ok(rules.includes('!assets/clock-dashboard-panel.html'));
 assert.ok(rules.includes('!assets/workday-panel.html'));
 assert.equal(rules.includes('!*.html'),false);
 assert.equal(rules.includes('!assets/*.html'),false);
});
