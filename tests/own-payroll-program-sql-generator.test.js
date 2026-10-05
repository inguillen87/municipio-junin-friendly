import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { buildOwnProgramQa } from '../scripts/verify-own-payroll-program-sql.mjs';
test('SQL122 extends every original605 check in one synthetic rollback and pins its own database', () => {
  for (const serverMajor of [17, 18]) {
    const qa = buildOwnProgramQa({ serverMajor });
    assert.equal(qa.report.checksPassed, 648); assert.equal(qa.report.ownProgramChecksPassed, 43);
    assert.ok(qa.sql.includes("current_database()<>'own_payroll_program_qa'")); assert.ok(qa.sql.includes("current_setting('neon.project_id',true)"));
    assert.ok(qa.sql.trimEnd().endsWith('ROLLBACK;')); assert.ok(!qa.sql.includes('BEGIN ISOLATION LEVEL SERIALIZABLE'));
    assert.ok(qa.sql.includes('OWN_PROGRAM_SYNTHETIC_CONTRACT:')); assert.ok(qa.sql.includes('OWN_PROGRAM_IDEMPOTENCY_REUSE')); assert.ok(qa.sql.includes('OWN_PROGRAM_INDEPENDENT_REQUIRED'));
    assert.ok(qa.sql.includes('partial existing helpers stop before creating the new table'));
    const migration = fs.readFileSync(new URL('../scripts/migrations/122-own-payroll-programs.sql', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
    assert.equal(qa.report.migration122Sha256, createHash('sha256').update(migration).digest('hex'));
  }
});
