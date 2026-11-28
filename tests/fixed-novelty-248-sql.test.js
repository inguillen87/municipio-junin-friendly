import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');

test('migration 248 adds native/adopted legajo resolution and 5000 cap with closed runtime grants', () => {
  const sql = read('scripts/migrations/248-fixed-novelty-native-lookup-and-capacity.sql');
  assert.match(sql, /^--\s*248:/);
  assert.match(sql, /\bBEGIN;/);
  assert.match(sql, /\bCOMMIT;/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.payroll_fixed_registry_employee_v2\(p_context jsonb, p_legajo text\)/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.payroll_fixed_registry_employees_by_contracts_v1\(p_context jsonb, p_contracts uuid\[\]\)/);
  assert.match(sql, /PAYROLL_FIXED_LEGAJO_AMBIGUOUS/);
  assert.match(sql, /PAYROLL_FIXED_LEGAJO_NOT_FOUND/);
  assert.match(sql, /native_employment_void_review/);
  assert.match(sql, /NOT BETWEEN 1 AND 250/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.payroll_fixed_registry_employee_v2\(jsonb, text\) FROM PUBLIC, municontrol_actions_runtime_app;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.payroll_fixed_registry_employee_v2\(jsonb, text\) TO municontrol_actions_runtime_app;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.payroll_fixed_registry_employees_by_contracts_v1\(jsonb, uuid\[\]\) TO municontrol_actions_runtime_app;/);
  assert.doesNotMatch(sql, /DROP\s+FUNCTION/i);
  assert.doesNotMatch(sql, /TRUNCATE/i);
});

test('migration 248 patches are delimiter-anchored, independent of 247, and included in build deployment package', () => {
  const sql = read('scripts/migrations/248-fixed-novelty-native-lookup-and-capacity.sql');
  assert.doesNotMatch(sql, /\bown[-_]close[-_]scalable/i);
  assert.doesNotMatch(sql, /\b247\b/);
  assert.match(sql, /''maxRecords'',500,''maxHistory''/);
  assert.match(sql, /''maxRecords'',5000,''maxHistory''/);
  assert.match(sql, /IF row_count>500 THEN RAISE EXCEPTION ''PAYROLL_FIXED_ROW_LIMIT''; END IF;/);
  assert.match(sql, /IF row_count>5000 THEN RAISE EXCEPTION ''PAYROLL_FIXED_ROW_LIMIT''; END IF;/);
  assert.match(sql, />=500 THEN RAISE EXCEPTION ''PAYROLL_FIXED_ROW_LIMIT'';/);
  assert.match(sql, />=5000 THEN RAISE EXCEPTION ''PAYROLL_FIXED_ROW_LIMIT'';/);
  assert.match(sql, /IF jsonb_array_length\(list_rows\)>500 THEN RAISE EXCEPTION ''OWN_RUN_LIMIT'';END IF;/);
  assert.match(sql, /IF jsonb_array_length\(list_rows\)>5000 THEN RAISE EXCEPTION ''OWN_RUN_LIMIT'';END IF;/);
  const rules = read('.vercelignore').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'));
  const included = file => {
    let keep = true;
    for (const rule of rules) {
      const neg = rule.startsWith('!');
      const p = neg ? rule.slice(1) : rule;
      if (p.endsWith('/') ? file.startsWith(p) : path.matchesGlob(file, p) || (!p.includes('/') && path.matchesGlob(path.basename(file), p))) keep = neg;
    }
    return keep;
  };
  assert.equal(included('scripts/migrations/248-fixed-novelty-native-lookup-and-capacity.sql'), true);
});
