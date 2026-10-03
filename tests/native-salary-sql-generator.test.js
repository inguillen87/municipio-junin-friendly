import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNativeSalaryQa} from '../scripts/verify-native-salary-sql.mjs';
import {buildNativeEmploymentLifecycleQa} from '../scripts/verify-native-employment-lifecycle-sql.mjs';
for(const major of[17,18])test('SQL112 conserva regresión previa y sólo genera prueba descartable PG'+major,()=>{const qa=buildNativeSalaryQa({serverMajor:major,requireConcurrency:true}),previous=buildNativeEmploymentLifecycleQa({serverMajor:major,requireConcurrency:true});assert.equal(qa.report.checksPassed,previous.report.checksPassed+qa.report.nativeSalaryChecksPassed);assert.equal(qa.report.lifecycleChecksPassed,previous.report.lifecycleChecksPassed);assert.ok(qa.report.nativeSalaryChecksPassed>=39);assert.ok(qa.sql.includes('RESTORE_SALARY_FIXTURES'));assert.ok(qa.sql.includes('ROLLBACK;'));assert.ok(!/INSERT\s+INTO\s+public\./i.test(qa.sql));assert.ok(!/UPDATE\s+public\./i.test(qa.sql));assert.ok(qa.sql.includes('NATIVE_SALARY_HISTORY_REQUIRED'));assert.ok(qa.sql.includes('NATIVE_SALARY_INDEPENDENT_REQUIRED'));assert.ok(qa.sql.includes('native_salary_immutable'));assert.ok(qa.lockSql.includes('FIXED_NOVELTIES_QA_LOCK_READY'));assert.ok(qa.sql.includes(qa.report.migration112Sha256));assert.ok(qa.sql.includes('NATIVE_SALARY_CLASSIFICATION_INVALID'));assert.ok(!qa.sql.includes("'undefined'"));});
test('generador rechaza motores no revisados',()=>{for(const major of[null,16,19,'17;DROP TABLE x'])assert.throws(()=>buildNativeSalaryQa({serverMajor:major}));});
test('preparación multiconvenio ensaya aprobación y recuperación completas en SQL112 existente',()=>{const qa=buildNativeSalaryQa({serverMajor:17});assert.equal(qa.report.nativeSalaryCopyChecksPassed,12);for(const evidence of ['RESTORE_SALARY_COPY_FIXTURES','all461 definitions once','actual approved target classes','another membership of its preparer','exact original key','every prior definition exactly','999999999999999999.12345678','concept:4::200088:2026-10','concept:6::200088:2026-10'])assert.ok(qa.sql.includes(evidence),evidence);});
test('metadatos del protocolo en JSON siguen el esquema aislado de las funciones ensayadas',()=>{
 const qa=buildNativeSalaryQa({serverMajor:17});
 const blocks=[qa.sql,...[...qa.sql.matchAll(/\bEXECUTE '((?:''|[^'])*)'/g)].map(m=>m[1].replaceAll("''","'"))];
 const pinGroups=blocks.flatMap(block=>[...block.matchAll(/jsonb_array_elements\('((?:''|[^'])*)'::jsonb\)/g)]).flatMap(m=>{try{return JSON.parse(m[1].replaceAll("''","'"));}catch{return [];}});
 const pins=pinGroups.filter(p=>p&&typeof p==='object'&&p.signature?.startsWith(qa.schema+'.')&&p.config);
 for(const name of ['native_employment_change_context_v1','native_employee_catalog_v1','native_salary_bootstrap_v1']){
  const found=pins.filter(p=>p.name===name);assert.ok(found.length>0,name);
  for(const p of found)assert.equal(p.config[0],'search_path=pg_catalog, '+qa.schema+', public, pg_temp',name);
 }
});
