import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';

const read = (file) => readFile(new URL(`../scripts/migrations/${file}`, import.meta.url), 'utf8');
const [sql, leaveList, leaveDetail, overtime, leaveMutation] = await Promise.all([
  read('059-action-source-history.sql'), read('007-action-center-read-facades.sql'),
  read('018-action-center-operational-completion.sql'), read('008-governed-overtime-actions.sql'),
  read('017-tenant-action-unlinked-operator.sql'),
]);
const normalize = (value) => value.replaceAll('\r\n', '\n');
function definition(source, name) {
  const match = source.match(new RegExp(`CREATE OR REPLACE FUNCTION (?:public\\.)?${name}\\(`));
  assert.ok(match, `missing ${name}`);
  const end = source.indexOf('\n$$;', match.index);
  assert.ok(end > match.index);
  return normalize(source.slice(match.index, end + 4));
}
const body = (source, name) => definition(source, name).split('AS $$')[1];
const current = (name) => body(sql, name);
function between(source, start, end) {
  const a = source.indexOf(start); const b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `missing anchored block ${start}`);
  return source.slice(a, b);
}

test('059 only replaces eight functions and revokes private helper access', () => {
  const statements = splitPostgresStatements(sql);
  assert.equal(statements.length, 11);
  assert.equal((sql.match(/CREATE OR REPLACE FUNCTION /g) || []).length, 8);
  assert.doesNotMatch(sql, /\b(?:CREATE TABLE|ALTER TABLE|DROP TABLE|TRUNCATE|COPY)\b/i);
  assert.doesNotMatch(sql, /GRANT\s+(?:EXECUTE|SELECT|INSERT|UPDATE|DELETE)/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.action_center_case_source_context_v1\(uuid,uuid,uuid\) FROM PUBLIC/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.action_center_assert_case_source_current_v1\(uuid,uuid,uuid\) FROM PUBLIC/);
  assert.match(sql, /a\.grantee<>p\.proowner/);
  assert.match(sql, /REVOKE ALL ON FUNCTION %s FROM %I/);
});

for (const [name, baseline] of [
  ['action_center_tenant_list_v2', leaveList], ['action_center_tenant_detail_v2', leaveDetail],
  ['action_center_overtime_list_v1', overtime], ['action_center_overtime_detail_v1', overtime],
  ['action_center_apply_tenant_command', leaveMutation], ['action_center_apply_overtime_command_v1', overtime],
]) {
  test(`${name} retains its complete public signature and security mode`, () => {
    assert.equal(definition(sql, name).split('AS $$')[0], definition(baseline, name).split('AS $$')[0]);
  });
}

for (const [name, baseline] of [
  ['action_center_apply_tenant_command', leaveMutation],
  ['action_center_apply_overtime_command_v1', overtime],
]) {
  test(`${name}: only adds source guards; complete original command and SoD code remains exact`, () => {
    const changed = current(name);
    const guard = /    PERFORM action_center_assert_case_source_current_v1\(current_case\.id, p_tenant_id, binding(?:\.id|_id)\);\n/g;
    assert.equal((changed.match(guard) || []).length, 2);
    assert.equal(changed.replace(guard, ''), body(baseline, name));
    assert.match(changed, /assert_case_source_current_v1\([^\n]+\);\n    case_id := current_case\.id;/);
    assert.match(changed, /assert_case_source_current_v1\([^\n]+\);\n    IF current_case\.version <> p_expected_version/);
  });
}

test('mutation guard scopes before row locks and keeps the source stable through replay/commit', () => {
  const guard = current('action_center_assert_case_source_current_v1');
  assert.match(guard, /contract\.source_batch_id = action\.source_batch_id/);
  assert.match(guard, /action\.tenant_id = p_tenant_id/);
  assert.match(guard, /action\.source_binding_id = p_source_binding_id/);
  assert.match(guard, /binding\.source_company_id = action\.company_id/);
  assert.match(guard, /batch\.source_database = binding\.source_database/);
  assert.match(guard, /FOR SHARE OF contract, batch NOWAIT/);
  assert.match(guard, /IF NOT FOUND THEN\s+RAISE EXCEPTION 'ACTION_CASE_NOT_FOUND'/);
  assert.doesNotMatch(guard, /INSERT|UPDATE|DELETE|current_setting|set_config/);
});

test('historical helper needs two unique, unaltered staging rows and a forward source transition', () => {
  const helper = current('action_center_case_source_context_v1');
  assert.match(helper, /old_row\.row_count = 1 AND current_row\.row_count = 1/);
  assert.equal((helper.match(/source_key::text LIMIT 2/g) || []).length, 2);
  assert.equal((helper.match(/source_row_sha256 = encode\(digest\(candidate\.source_payload::text, 'sha256'\), 'hex'\)/g) || []).length, 2);
  assert.match(helper, /base\.old_cutoff < base\.current_cutoff/);
  assert.match(helper, /old_run\.status = 'completed'/);
  assert.match(helper, /current_run\.status = 'completed'/);
  assert.match(helper, /lower\(old_run\.source_sha256\) = lower\(base\.old_source_sha256\)/);
  assert.match(helper, /lower\(current_run\.source_sha256\) = lower\(base\.current_source_sha256\)/);
  assert.match(helper, /old_payload #>> '\{sourceKey,employeeNumber\}' = legacy_legajo/);
  assert.match(helper, /new_payload #>> '\{sourceKey,employeeNumber\}' = legacy_legajo/);
  assert.match(helper, /ltrim\(old_payload #>> '\{sourceKey,companyCode\}', '0'\)/);
  assert.match(helper, /ltrim\(new_payload #>> '\{sourceKey,companyCode\}', '0'\)/);
  assert.match(helper, /new_payload = current_payload/);
  assert.doesNotMatch(helper, /actor_person_id|actorPersonId|grh_employees|grh_family/);
});

test('source lock contention maps to the existing safe retry response', () => {
  const guard = current('action_center_assert_case_source_current_v1');
  assert.match(guard, /FOR SHARE OF contract, batch NOWAIT/);
  assert.match(guard, /EXCEPTION\s+WHEN lock_not_available THEN\s+RAISE EXCEPTION 'ACTION_SESSION_BUSY' USING ERRCODE = 'P0001';\s+END/);
  assert.doesNotMatch(guard, /WHEN OTHERS|SQLERRM|GET STACKED DIAGNOSTICS/);
});

test('historical identity needs raw linkage, canonical linkage, natural identity and original area', () => {
  const helper = current('action_center_case_source_context_v1');
  for (const field of ['fullName', 'documentNumber', 'cuil', 'birthDate', 'sexCode']) {
    assert.ok(helper.includes(`(old_payload #> '{identity,${field}}') IS NOT DISTINCT FROM (new_payload #> '{identity,${field}}')`));
  }
  assert.match(helper, /old_person_id IS NOT NULL AND old_person_id = new_person_id/);
  assert.match(helper, /md5\('person_identity\|GRH\|persona\|' \|\| old_person_id\)::uuid = person_id/);
  assert.match(helper, /md5\('employment_contract\|GRH\|legajo\|'/);
  assert.match(helper, /normalize_digits\(old_payload #>> '\{identity,documentNumber\}'\) ~ '\^\[0-9\]\{5,12\}\$'/);
  assert.match(helper, /pg_input_is_valid/);
  assert.match(helper, /old_payload #>> '\{employment,organizationId\}', ''\) IS NOT DISTINCT FROM organization_unit_source_id/);
  assert.match(helper, /old_payload #>> '\{employment,sectorCode\}', ''\) IS NOT DISTINCT FROM sector_source_id/);
  const currentPath = between(helper, 'SELECT base.*, NULL::jsonb AS snapshot', 'UNION ALL');
  assert.match(currentPath, /WHERE source_batch_id = current_batch_id/);
  assert.doesNotMatch(currentPath, /historical|staging|person_id/);
});

test('leave list retains the complete session, view, capability and scope rules', () => {
  const name = 'action_center_tenant_list_v2';
  const next = current(name); const old = body(leaveList, name);
  assert.equal(between(next, 'BEGIN', '  WITH candidate'), between(old, 'BEGIN', '  WITH candidate'));
  assert.equal(between(next, '    CROSS JOIN LATERAL (\n      SELECT\n', '  ), page_rows')
    .replace('      AND source_history.value IS NOT NULL\n', ''),
  between(old, '    CROSS JOIN LATERAL (\n      SELECT\n', '  ), page_rows'));
  assert.match(next, /page\.nominal_allowed\s+THEN CASE WHEN page\.source_history/);
  assert.match(next, /THEN page\.source_history->>'displayName'/);
  assert.match(next, /THEN page\.source_history->>'displaySector'/);
});

test('leave detail preserves nominal/payroll authority, event projection and command eligibility', () => {
  const name = 'action_center_tenant_detail_v2';
  const next = current(name); const old = body(leaveDetail, name);
  assert.equal(between(next, '  nominal_allowed :=', '  IF nominal_allowed THEN'),
    between(old, '  nominal_allowed :=', '  IF nominal_allowed THEN'));
  assert.equal(between(next, '    SELECT COALESCE(jsonb_agg(jsonb_build_object(', '  -- La autoridad'),
    between(old, '    SELECT COALESCE(jsonb_agg(jsonb_build_object(', '  -- La autoridad'));
  assert.match(next, /'allowedCommands', CASE WHEN nominal_allowed AND source_history #>> '\{sourceContext,status\}' = 'current'/);
});

test('overtime readers preserve entry/read/SoD capabilities and only expose current commands', () => {
  const name = 'action_center_overtime_list_v1';
  assert.equal(between(current(name), 'BEGIN', '  WITH candidate'), between(body(overtime, name), 'BEGIN', '  WITH candidate'));
  const detail = current('action_center_overtime_detail_v1');
  const old = body(overtime, 'action_center_overtime_detail_v1');
  assert.equal(between(detail, '  exclusive_entry :=', '  RETURN jsonb_build_object(\n'),
    between(old, '  exclusive_entry :=', '  RETURN jsonb_build_object(\n'));
  assert.match(detail, /'allowedCommands', CASE WHEN source_history #>> '\{sourceContext,status\}' = 'current'\s+THEN commands_value ELSE '\[\]'::jsonb END/);
});

test('sourceContext exposes only status and two cutoffs; no internal identity or source hashes', () => {
  const helper = current('action_center_case_source_context_v1');
  const projection = between(helper, "'sourceContext', jsonb_build_object(", "    'displayName'");
  assert.match(projection, /'status', source_status/);
  assert.match(projection, /'sourceCutoffAt'/);
  assert.match(projection, /'currentCutoffAt'/);
  assert.doesNotMatch(projection, /person_id|company_id|source_sha|source_key|contract_id|legacy_legajo/);
});
