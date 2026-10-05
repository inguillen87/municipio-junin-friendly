import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { buildOwnRunQa } from '../scripts/verify-own-payroll-run-sql.mjs';
test('SQL123 conserva las648 verificaciones previas y añade persistencia en base aislada', () => {
  for (const serverMajor of [17, 18]) {
    const qa = buildOwnRunQa({ serverMajor }); assert.equal(qa.report.checksPassed, 682); assert.equal(qa.report.ownRunChecksPassed, 34);
    assert.ok(qa.sql.includes("current_database()<>'own_payroll_run_qa'")); assert.ok(qa.sql.includes("current_setting('neon.project_id',true)")); assert.ok(qa.sql.trimEnd().endsWith('ROLLBACK;'));
    assert.ok(qa.sql.includes('OWN_RUN_SYNTHETIC_CONTRACT:')); assert.ok(qa.sql.includes('OWN_RUN_RESULT_CONFLICT')); assert.ok(qa.sql.includes('OWN_RUN_FORBIDDEN'));
    const migration = fs.readFileSync(new URL('../scripts/migrations/123-own-payroll-runs.sql', import.meta.url), 'utf8').replaceAll('\r\n', '\n'); assert.equal(qa.report.migration123Sha256, createHash('sha256').update(migration).digest('hex'));
    assert.ok(qa.report.limitations.some(x => x.includes('typed empty fixtures')));
  }
});

test('la composición mensual instala101 completo antes104/110 y conserva todas las regresiones originales', () => {
  for (const serverMajor of [17, 18]) {
    const qa = buildOwnRunQa({ serverMajor, withMonthlySource: true });
    assert.equal(qa.report.checksPassed, 684); assert.equal(qa.report.ownRunChecksPassed, 36);
    assert.equal(qa.report.fullMonthlyWriter, true);
    assert.ok(qa.sql.includes("'concept_not_observed'"));
    assert.ok(qa.sql.includes('payroll_novelty_prepare_v2(maker')); assert.ok(qa.sql.includes('payroll_novelty_transition_v2(checker'));
    assert.ok(qa.sql.includes('two full101 prepare-submit-approve cycles'));
    assert.ok(qa.sql.includes("current_database()<>'own_payroll_run_qa'")); assert.ok(qa.sql.includes("current_setting('neon.project_id',true)"));
    assert.ok(qa.sql.trimEnd().endsWith('ROLLBACK;')); assert.ok(qa.report.limitations.some(x => x.includes('committed durability')));
  }
});
