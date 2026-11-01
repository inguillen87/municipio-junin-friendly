import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOwnCloseQa} from '../scripts/lib/own-payroll-close-qa.mjs';
import {currentOwnReportHireSeed} from '../scripts/lib/own-payroll-report-current-hires-qa.mjs';
const source=buildOwnCloseQa(18,{employees:6}).sql;
test('current report seed changes exactly six original writer arguments and has a complete byte inverse',()=>{
 const planned=currentOwnReportHireSeed(source);assert.equal(planned.rewrittenHires,6);assert.equal(planned.inverseVerified,true);
 assert.deepEqual(planned.derivations.map(v=>v.legajo),['19041','19043','19102','19103','19104','19105']);
 assert.match(planned.calendarExpression,/statement_timestamp\(\) AT TIME ZONE 'America\/Argentina\/Mendoza'/);assert.match(planned.calendarExpression,/date_trunc\('month'/);
 let restored=planned.sql;
 for(const change of planned.derivations){assert.equal(restored.split(change.after).length,2);assert.ok(change.after.startsWith('hire:=native_employee_create_v1(maker,jsonb_set('));restored=restored.replace(change.after,()=>change.before);}
 assert.equal(restored,source,'all definitions, grants, guards, values and other seed bytes remain original');
});
test('an incomplete or expanded native cohort cannot use the current-report adapter',()=>{
 for(const employees of [5,7])assert.throws(()=>currentOwnReportHireSeed(buildOwnCloseQa(18,{employees}).sql),/REPORT_CURRENT_HIRES_EXACT_SIX_REQUIRED/);
});
test('changed dates, duplicate or foreign identity and a second adaptation are rejected',()=>{
 const p=currentOwnReportHireSeed(source),last=p.derivations.at(-1);
 for(const [oldValue,newValue]of [['"startDate":"2026-10-01"','"startDate":"2026-09-01"'],['"legajo":"19105"','"legajo":"19104"'],['"legajo":"19105"','"legajo":"FOREIGN"']]){
  const changed=source.replace(last.before,()=>last.before.replace(oldValue,newValue));assert.notEqual(changed,source);assert.throws(()=>currentOwnReportHireSeed(changed),/REPORT_CURRENT_HIRES_(?:PREIMAGE_CHANGED|EXACT_IDENTITIES_REQUIRED)/);
 }
 assert.throws(()=>currentOwnReportHireSeed(p.sql),/REPORT_CURRENT_HIRES_EXACT_SIX_REQUIRED/);
});
test('ordinary SQL and an opaque JSON date outside the six hire arguments are never replaced',()=>{
 const tail="\nSELECT '{\"startDate\":\"2026-10-01\",\"label\":\"public.$1 opaque\"}'::jsonb;",p=currentOwnReportHireSeed(source+tail);
 assert.ok(p.sql.endsWith(tail));let restored=p.sql;for(const c of p.derivations)restored=restored.replace(c.after,()=>c.before);assert.equal(restored,source+tail);
});
