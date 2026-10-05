import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOwnPayrollDurableQa } from '../scripts/lib/own-payroll-durable-qa.mjs';
import { createOwnPayrollPsqlQa } from '../scripts/lib/own-payroll-psql-qa.mjs';
import { buildNativeEmploymentCatalogQa } from '../scripts/verify-native-employment-catalog-sql.mjs';

test('la base durable es independiente; no convierte ninguna restauración de regresión enCOMMIT',()=>{
  for(const major of [17,18]){
    const legacy=buildNativeEmploymentCatalogQa({serverMajor:major}),durable=buildOwnPayrollDurableQa(major);
    assert.ok(legacy.sql.includes('RESTORE_CATALOG_FIXTURES'));assert.ok(legacy.sql.trimEnd().endsWith('ROLLBACK;'));
    assert.ok(durable.sql.trimEnd().endsWith('COMMIT;'));assert.equal(durable.inheritedRegressionChecks,legacy.report.checksPassed);
    assert.ok(durable.sql.includes("current_database()<>'own_payroll_run_qa'"));assert.ok(durable.sql.includes("current_setting('neon.project_id',true)"));assert.ok(durable.sql.includes("current_setting('neon.branch_id',true)"));
    assert.ok(!/INSERT\s+INTO\s+(?:public\.)?own_payroll_run_(?:capture|result)/i.test(durable.sql),'seed must not manufacture a capture or result');
    assert.ok(!durable.sql.includes('RESTORE_CATALOG_FIXTURES'),'seed is not a rewritten regression');
  }
});

test('el transporte QA rechaza destino no local o esquema fuera del conjunto sintético',()=>{
  const qa=buildOwnPayrollDurableQa(17),settings={executable:'psql',port:55417,major:17,schema:qa.schema,pins:qa.pins};
  for(const patch of [{port:5432},{major:19},{schema:'public'},{pins:qa.pins.replace('own_payroll_run_qa','neondb')},{pins:qa.pins.replace('neon.project_id','neon.unknown')}]) assert.throws(()=>createOwnPayrollPsqlQa({...settings,...patch}));
});

test('las consultas ajenas a las cuatro fachadas se rechazan antes de abrir conexión',async()=>{
  const qa=buildOwnPayrollDurableQa(17),db=createOwnPayrollPsqlQa({executable:'must-not-execute',port:55417,major:17,schema:qa.schema,pins:qa.pins});
  for(const statement of ['DELETE FROM public.own_payroll_run_result','SELECT public.own_run_owned_v1($1::jsonb) AS result','SELECT public.own_run_capture_v1($2::jsonb) AS result'])await assert.rejects(db.query(statement,['qa']));
  assert.deepEqual(db.connections,[]);
});
