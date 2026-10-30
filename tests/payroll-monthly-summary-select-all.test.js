// Pure selection contracts. No backend, actor, calculation or month certification.
import test from 'node:test';
import assert from 'node:assert/strict';
import {monthlySummaryData,monthlySummaryPeriodSelection,MONTHLY_SUMMARY_LIMITS} from '../assets/payroll-monthly-summary-model.js';
import {monthlyCatalog,monthlySource,monthlyUuid} from './fixtures/payroll-monthly-summary-synthetic.js';
const read=payload=>monthlySummaryData(payload,{resource:'catalog',period:payload.data.period});
const uniqueCatalog=count=>{const payload=monthlyCatalog(count);payload.data.items.forEach((source,index)=>source.date='2026-08-'+String(index+1).padStart(2,'0'));return payload;};
const rejects=(catalog,period,suffix)=>assert.throws(()=>monthlySummaryPeriodSelection(catalog,period),error=>error.code==='MONTHLY_SELECTION_'+suffix&&/selección previa no se modificó/.test(error.message));

test('all sources of the chosen imputation period include a corrida dated outside that month',()=>{
 const catalog=read(monthlyCatalog()),ids=monthlySummaryPeriodSelection(catalog,'2026-08');
 assert.deepEqual(ids,catalog.items.map(source=>source.datasetId).sort());assert.equal(ids.length,3);assert.equal(catalog.items[0].date,'2026-09-01');
 assert.deepEqual(catalog.items.map(source=>source.closureStatus),['closed','open','unknown'],'closure is retained, not an invented eligibility filter');
 assert.equal(catalog.scope.completeMonthCertified,false);
});

test('result is frozen, independent of source order and never mutates the catalog',()=>{
 const payload=monthlyCatalog(),raw=JSON.stringify(payload);const first=monthlySummaryPeriodSelection(read(payload),'2026-08');assert.equal(JSON.stringify(payload),raw);assert.ok(Object.isFrozen(first));
 payload.data.items.reverse();assert.deepEqual(monthlySummaryPeriodSelection(read(payload),'2026-08'),first);assert.throws(()=>first.push(monthlyUuid(99)));
});

test('24 are accepted whole;25 reject without a prefix or mutation',()=>{
 assert.equal(MONTHLY_SUMMARY_LIMITS.sources,24);assert.equal(monthlySummaryPeriodSelection(read(uniqueCatalog(24)),'2026-08').length,24);
 const catalog=read(uniqueCatalog(25)),before=JSON.stringify(catalog);rejects(catalog,'2026-08','TOO_MANY');assert.equal(JSON.stringify(catalog),before);
});

test('ambiguous same-date same-type revisions reject instead of choosing latest or first',()=>{
 const payload=monthlyCatalog(2);payload.data.items[1].date=payload.data.items[0].date;payload.data.items[1].type=payload.data.items[0].type;payload.data.items[1].importedAt='2026-09-15T12:34:56Z';
 rejects(read(payload),'2026-08','AMBIGUOUS_REVISION');payload.data.items.reverse();rejects(read(payload),'2026-08','AMBIGUOUS_REVISION');
});

test('different types on the same date remain distinct liquidations',()=>{
 const payload=monthlyCatalog(2);payload.data.items[1].date=payload.data.items[0].date;assert.notEqual(payload.data.items[0].type,payload.data.items[1].type);
 assert.equal(monthlySummaryPeriodSelection(read(payload),'2026-08').length,2);
});

test('different backup SHA values reject whole even when one source was previously selected',()=>{
 const payload=monthlyCatalog(2);payload.data.items[1].sourceSha256='b'.repeat(64);const catalog=read(payload),before=JSON.stringify(catalog);
 rejects(catalog,'2026-08','SOURCE_MISMATCH');assert.equal(JSON.stringify(catalog),before);
});

test('different payloads of the same backup are preserved, not confused with mixed source SHA',()=>{
 const catalog=read(monthlyCatalog(2));assert.notEqual(catalog.items[0].payloadHash,catalog.items[1].payloadHash);assert.equal(monthlySummaryPeriodSelection(catalog,'2026-08').length,2);
});

test('other periods do not join this selection or impose their own revision/backup conflicts',()=>{
 const payload=monthlyCatalog(4);for(const source of payload.data.items.slice(2)){source.sourceMonth=9;source.sourceSha256='b'.repeat(64);source.date='2026-09-10';source.type='M';}
 assert.deepEqual(monthlySummaryPeriodSelection(read(payload),'2026-08'),[monthlyUuid(1),monthlyUuid(2)]);
 rejects(read(payload),'2026-09','AMBIGUOUS_REVISION');
});

test('empty and invalid periods fail with an actionable selection error',()=>{
 rejects(read(monthlyCatalog()),'','PERIOD_REQUIRED');rejects(read(monthlyCatalog()),'2026-13','PERIOD_REQUIRED');rejects(read(monthlyCatalog(0)),'2026-08','EMPTY_PERIOD');rejects(read(monthlyCatalog()),'2026-09','EMPTY_PERIOD');
});

test('a scoped catalog cannot silently supply another imputation month',()=>{
 const payload=monthlyCatalog(2);payload.data.period='2026-08';const catalog=read(payload);rejects(catalog,'2026-09','EMPTY_PERIOD');assert.equal(monthlySummaryPeriodSelection(catalog,'2026-08').length,2);
});

test('the complete catalog is revalidated, including count drift and duplicate IDs',()=>{
 const payload=monthlyCatalog(2);payload.data.total++;rejects(payload.data,'2026-08','CATALOG_INVALID');
 const duplicate=monthlyCatalog(2);duplicate.data.items[1].datasetId=duplicate.data.items[0].datasetId;rejects(duplicate.data,'2026-08','CATALOG_INVALID');
});

test('a240-source catalog can select24 of its current period without selecting the216 others',()=>{
 const payload=uniqueCatalog(24);for(let index=25;index<=240;index++)payload.data.items.push(monthlySource(index,75,'2026-09'));payload.data.total=240;
 const ids=monthlySummaryPeriodSelection(read(payload),'2026-08');assert.equal(ids.length,24);assert.deepEqual(ids,Array.from({length:24},(_,index)=>monthlyUuid(index+1)));
});

test('no invocation can promote source scope to a complete-month or official claim',()=>{
 const payload=monthlyCatalog(2);payload.data.scope.completeMonthCertified=true;rejects(payload.data,'2026-08','CATALOG_INVALID');
 const normal=read(monthlyCatalog(2));monthlySummaryPeriodSelection(normal,'2026-08');assert.equal(normal.scope.official,false);assert.equal(normal.scope.payrollCalculated,false);assert.equal(normal.scope.payrollPosted,false);
});
