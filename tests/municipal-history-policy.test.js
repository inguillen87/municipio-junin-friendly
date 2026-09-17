import test from 'node:test';
import assert from 'node:assert/strict';
import {operationalHistoryCutoff,comparableTermWindows,planHistoryRetention} from '../scripts/lib/municipal-history-policy.mjs';
// Synthetic boundaries, not declarations of municipal terms of office.
const terms=[{start:'2024-01-01',endExclusive:'2028-01-01'},{start:'2020-01-01',endExclusive:'2024-01-01'},{start:'2016-01-01',endExclusive:'2020-01-01'}];
const measurements=[{table:'employment_movement',totalRows:100,eligibleRows:30,periodAnomalies:0},{table:'payroll_monthly_fact',totalRows:100,eligibleRows:20,periodAnomalies:2}];
test('ten-year retention keeps the complete boundary month and valid leap dates',()=>{
 assert.equal(operationalHistoryCutoff('2026-09-17'),'2016-09-01');
 assert.equal(operationalHistoryCutoff('2024-02-29'),'2014-02-01');
 for(const bad of ['2026-02-29','2026-09-31','2026-09-17T00:00:00Z',null])assert.throws(()=>operationalHistoryCutoff(bad));
});
test('three terms use equal elapsed days, never full past terms against an unfinished current one',()=>{
 const value=comparableTermWindows({terms,asOf:'2026-09-17'});
 assert.equal(value.windows.length,3);assert.equal(new Set(value.windows.map(w=>w.days)).size,1);
 assert.equal(value.windows[0].endExclusive,'2026-09-18');assert.ok(value.windows.every(w=>!w.completeTerm));
 assert.equal(value.uniquePeopleCannotBeSummed,true);assert.equal(value.nominalMoneyIsNotRealPurchasingPower,true);
});
test('reviewed unequal boundaries work; inferred dates, gaps and impossible windows are refused',()=>{
 const unequal=[{start:'2023-12-09',endExclusive:'2027-12-09'},{start:'2019-12-10',endExclusive:'2023-12-09'}];
 const value=comparableTermWindows({terms:unequal,asOf:'2026-08-06'});assert.equal(value.windows[0].days,972);assert.equal(value.windows[1].endExclusive,'2022-08-08');
 for(const t of [[],[{start:'2024-01-01',endExclusive:'2028-01-01'}],[terms[0],{...terms[1],endExclusive:'2023-12-31'}],[{...terms[0],endExclusive:'2030-01-01'},terms[1]]])assert.throws(()=>comparableTermWindows({terms:t,asOf:'2026-09-17'}));
 for(const asOf of ['2023-12-31','2028-01-01'])assert.throws(()=>comparableTermWindows({terms,asOf}));
});
test('retention remains planning only and preserves identities, native operations, legal and audit records',()=>{
 const before=JSON.stringify(measurements),plan=planHistoryRetention({asOf:'2026-09-17',terms,measurements});
 assert.equal(plan.deletionEnabled,false);assert.equal(plan.estimatedFreedBytes,null);assert.equal(plan.aggregatesMustStartNoLaterThan,'2016-01-01');
 for(const key of ['archiveRequiredBeforeRemoval','restoreRequiredBeforeRemoval','preserveNativeRecords','preserveEmploymentIdentity','preserveLegalAndAuditHistory','sourceReadersMigrationRequired'])assert.equal(plan[key],true);
 assert.equal(JSON.stringify(measurements),before);assert.throws(()=>planHistoryRetention({asOf:'2026-09-17',terms,measurements:[measurements[0],measurements[0]]}));
});
