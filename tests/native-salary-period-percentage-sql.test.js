import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNativeSalaryQa} from '../scripts/verify-native-salary-sql.mjs';
test('no permite solicitar la regresión nueva omitiendo el recorrido porcentual existente',()=>assert.throws(()=>buildNativeSalaryQa({serverMajor:17,withClosedPeriod:true}),/complete existing percentage checks/));
for(const serverMajor of [17,18])test(`PG${serverMajor}: período cerrado añade nueve verificaciones y conserva todo el recorrido previo`,()=>{
 const previous=buildNativeSalaryQa({serverMajor,withPercentage:true}),next=buildNativeSalaryQa({serverMajor,withPercentage:true,withClosedPeriod:true});
 assert.equal(next.report.checksPassed,previous.report.checksPassed+9);assert.equal(next.report.nativeSalaryClosedPeriodChecksPassed,9);assert.equal(previous.report.nativeSalaryClosedPeriodChecksPassed,0);
 assert.equal(next.report.nativeSalaryCopyChecksPassed,previous.report.nativeSalaryCopyChecksPassed);assert.equal(next.report.migration112Sha256,previous.report.migration112Sha256);
 for(const label of ['every unrelated definition and all three exact prior percentage bases are retained','percentage replay and recovery preserve the complete original body and key','closed-period replay and recovery preserve every definition and original request key','closed-period proposal cannot be approved by another membership of its preparer','finite October proposal keeps all470 prior definitions unchanged and adds exactly2 scales','isolated copy test restores the complete earlier salary history','all canonical employee values preserved'])assert.ok(next.sql.includes(label),label);
});
