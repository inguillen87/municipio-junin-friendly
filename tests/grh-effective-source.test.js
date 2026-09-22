import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGrhEffectiveSourceQa } from '../scripts/verify-grh-effective-source-postgres.mjs';

test('effective source SQL QA is local, synthetic, transactional and supports both deployed majors', () => {
  for (const expectedMajor of [17, 18]) {
    const sql = buildGrhEffectiveSourceQa({ expectedMajor });
    assert.ok(sql.startsWith('BEGIN;'));
    assert.match(sql, /current_database\(\)<>'effective_source_qa'/);
    assert.match(sql, /inet_server_addr\(\) NOT IN\('127\.0\.0\.1'::inet,'::1'::inet\)/);
    assert.ok(sql.includes("current_setting('server_version_num')::integer/10000<>" + expectedMajor));
    assert.match(sql, /ROLLBACK;\nSELECT to_regnamespace\('grh_effective_qa'\) IS NULL AS rollback_schema_absent;\n$/);
    assert.doesNotMatch(sql, /\bCOMMIT\s*;/i);
  }
});

test('QA rejects arbitrary schema interpolation and unsupported PostgreSQL versions', () => {
  for (const schema of ['public', 'anything', 'grh_effective_qa; DROP SCHEMA public CASCADE', 'grh_effective_qa"']) {
    assert.throws(() => buildGrhEffectiveSourceQa({ schema }), /Invalid QA target/);
  }
  for (const expectedMajor of [16, 19, '17', null]) {
    assert.throws(() => buildGrhEffectiveSourceQa({ expectedMajor }), /Invalid QA target/);
  }
});

test('QA relocates actual migrations and all physical typed view references without granting runtime access', () => {
  const sql = buildGrhEffectiveSourceQa({ schema: 'grh_effective_qa_unit' });
  for (const name of ['payroll_run', 'payroll_monthly_fact', 'employment_movement']) {
    assert.ok(sql.includes('CREATE VIEW grh_effective_qa_unit.grh_effective_' + name + '_v1'));
  }
  assert.doesNotMatch(sql, /CREATE (?:TABLE|VIEW|FUNCTION) public\./);
  assert.doesNotMatch(sql, /GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE|EXECUTE)/);
  assert.match(sql, /unready certified plane rejected/);
  assert.match(sql, /verified but uncertified source rejected/);
});
