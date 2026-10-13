import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildSalaryDayUnitsInstallation,assertSalaryDayUnitsDurability} from '../scripts/lib/salary-day-units-installation.mjs';
import {DAY_UNIT_PRIOR_PINS,DAY_UNIT_FINAL_HASHES} from '../scripts/lib/salary-day-units-pins.mjs';
const options={sourceCommit:'a'.repeat(40),read:p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8')};
test('el lote agrega solamente días a cuatro validadores existentes y no cambia firmas ni permisos',()=>{
 const batch=buildSalaryDayUnitsInstallation(options);assert.equal(batch.connects,false);assert.equal(batch.executesSql,false);assert.equal(batch.mutations.length,1);
 for(const p of batch.beforePins)assert.deepEqual(batch.afterPins.find(x=>x.name===p.name),{...p,sha256:DAY_UNIT_FINAL_HASHES[p.name]});
 assert.ok(batch.after.includes("to_regprocedure")||batch.after.includes('::regprocedure'));
 assert.ok(!batch.after.includes('native_leave_'));assert.equal(batch.verification[0],'SET TRANSACTION READ ONLY');
 assert.ok(!/\b(?:INSERT INTO|UPDATE public\.|DELETE FROM|GRANT|REVOKE|CREATE TABLE)\b/.test(batch.mutations.join('')));
 assert.match(batch.choose,/DAY_UNITS_BEFORE_METADATA/);assert.match(batch.choose,/DAY_UNITS_AFTER_METADATA/);
 assert.match(batch.state,/DAY_UNITS_PARTIAL_STATE/);assert.match(batch.conservation,/DAY_UNITS_PRIOR_STATE_CHANGED/);
 assert.ok(![...batch.statements,...batch.verification].join('\n').includes('${'));
 assert.equal(DAY_UNIT_PRIOR_PINS.length,4);
});
test('rechaza una migración modificada y una huella de origen inválida antes de preparar SQL',()=>{
 assert.throws(()=>buildSalaryDayUnitsInstallation({...options,read:p=>options.read(p)+(p.endsWith('166-own-payroll-day-units.sql')?'\n-- Sin revisión':'')}),/DAY_UNITS_SOURCE_CHANGED/);
 assert.throws(()=>buildSalaryDayUnitsInstallation({...options,sourceCommit:'rama'}));
});
test('durabilidad exige conservación exacta, ausencia de escrituras y la misma fuente',()=>{
 const batch=buildSalaryDayUnitsInstallation(options),proof={version:'own-payroll-day-units-installation.v1',sourceCommit:options.sourceCommit,sourceHashes:batch.sourceHashes,mode:'install',adaptedFunctions:4,newTables:0,newFunctions:0,businessWrites:0,existingAclChanges:0,roleAssignmentsAdded:0,nominalRowsReturned:0,preservationSha256:'b'.repeat(64)},durable={...proof,mode:'verify'};
 assertSalaryDayUnitsDurability({installed:proof,durable,batch});
 for(const change of [{businessWrites:1},{existingAclChanges:1},{sourceCommit:'c'.repeat(40)},{preservationSha256:'d'.repeat(64)}])assert.throws(()=>assertSalaryDayUnitsDurability({installed:proof,durable:{...durable,...change},batch}));
});
