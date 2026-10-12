import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNativeSalaryQa} from '../scripts/verify-native-salary-sql.mjs';

for(const serverMajor of [17,18])test(`PG${serverMajor}: el recorrido porcentual agrega nueve controles SQL y conserva toda la composición anterior`,()=>{
 const original=buildNativeSalaryQa({serverMajor}),extended=buildNativeSalaryQa({serverMajor,withPercentage:true});
 assert.equal(extended.report.checksPassed,original.report.checksPassed+9);
 assert.equal(extended.report.nativeSalaryPercentageChecksPassed,9);
 assert.equal(original.report.nativeSalaryPercentageChecksPassed,0);
 assert.equal(extended.report.nativeSalaryChecksPassed,original.report.nativeSalaryChecksPassed+9);
 assert.equal(extended.report.nativeSalaryCopyChecksPassed,original.report.nativeSalaryCopyChecksPassed);
 assert.equal(extended.report.migration112Sha256,original.report.migration112Sha256);
 for(const label of ['immutable history UPDATE','all canonical employee values preserved','percentage replay and recovery preserve the complete original body and key','percentage cannot be approved through another membership of its preparer','every unrelated definition and all three exact prior percentage bases are retained'])assert.ok(extended.sql.includes(label),label);
 assert.ok(extended.sql.includes('RESTORE_SALARY_COPY_FIXTURES'));assert.ok(extended.sql.includes('RESTORE_SALARY_FIXTURES'));
});
