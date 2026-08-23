import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  EXPECTED_RUNTIME_SECURITY_DEFINERS,
  buildSafeFailure,
  buildSafeSummary,
  loadGovernedOvertimeQaConfig,
  qaFixtureEmail,
  validateRuntimeBoundaryEvidence,
} from '../scripts/verify-governed-overtime-live.mjs';

const source = readFileSync(
  new URL('../scripts/verify-governed-overtime-live.mjs', import.meta.url),
  'utf8',
);

function safeEnv(overrides = {}) {
  return {
    ACTION_CENTER_QA_BRANCH_ID: 'br-qa-overtime-123',
    ACTION_CENTER_QA_PROJECT_ID: 'qa-project-123',
    ACTION_CENTER_QA_ENDPOINT_HOST: 'ep-qa-overtime.us-east-2.aws.neon.tech',
    CANONICAL_PRODUCTION_BRANCH_ID: 'br-production-999',
    CANONICAL_PRODUCTION_HOST: 'ep-production.us-east-2.aws.neon.tech',
    DATABASE_URL_UNPOOLED: 'postgresql://qa_owner:owner-secret@ep-qa-overtime.us-east-2.aws.neon.tech/neondb',
    ACTIONS_DATABASE_URL: 'postgresql://municontrol_actions_runtime_app:runtime-secret@ep-qa-overtime-pooler.us-east-2.aws.neon.tech/neondb',
    ...overrides,
  };
}

function safeEvidence() {
  return {
    identity: {
      currentUser: 'municontrol_actions_runtime_app',
      sessionUser: 'municontrol_actions_runtime_app',
    },
    role: {
      canLogin: true,
      inherit: false,
      superuser: false,
      bypassRls: false,
      createDb: false,
      createRole: false,
      replication: false,
    },
    schema: { usage: true, create: false },
    database: { connect: true, create: false },
    schemas: [{ name: 'public', usage: true, create: false }],
    memberships: [],
    ownedObjects: [],
    securityDefiners: EXPECTED_RUNTIME_SECURITY_DEFINERS.map((signature) => ({ signature })),
    relations: [],
    sequences: [],
  };
}

test('gate exige confirmación y corrobora branch, host, base y credenciales separadas', () => {
  const config = loadGovernedOvertimeQaConfig(safeEnv(), ['--confirm-isolated-branch']);
  assert.equal(config.branchId, 'br-qa-overtime-123');
  assert.equal(config.databaseName, 'neondb');
  assert.equal(config.ownerUser, 'qa_owner');
  assert.equal(config.runtimeUser, 'municontrol_actions_runtime_app');

  assert.throws(
    () => loadGovernedOvertimeQaConfig(safeEnv(), []),
    (error) => error.code === 'QA_CONFIRMATION_REQUIRED',
  );
  assert.throws(
    () => loadGovernedOvertimeQaConfig(safeEnv({
      ACTION_CENTER_QA_BRANCH_ID: 'br-production-999',
    }), ['--confirm-isolated-branch']),
    (error) => error.code === 'QA_PRODUCTION_TARGET_FORBIDDEN',
  );
  assert.throws(
    () => loadGovernedOvertimeQaConfig(safeEnv({
      DATABASE_URL_UNPOOLED: 'postgresql://qa_owner:owner-secret@ep-qa-overtime-pooler.us-east-2.aws.neon.tech/neondb',
    }), ['--confirm-isolated-branch']),
    (error) => error.code === 'QA_OWNER_MUST_BE_UNPOOLED',
  );
  assert.throws(
    () => loadGovernedOvertimeQaConfig(safeEnv({
      ACTIONS_DATABASE_URL: 'postgresql://qa_owner:runtime-secret@ep-qa-overtime.us-east-2.aws.neon.tech/neondb',
    }), ['--confirm-isolated-branch']),
    (error) => error.code === 'QA_CREDENTIAL_SEPARATION_REQUIRED',
  );
});

test('allowlist SECDEF es exacta y fail-closed ante faltantes, extras y ACL directa', () => {
  assert.equal(EXPECTED_RUNTIME_SECURITY_DEFINERS.length, 22);
  assert.equal(new Set(EXPECTED_RUNTIME_SECURITY_DEFINERS).size, 22);
  assert.ok(EXPECTED_RUNTIME_SECURITY_DEFINERS.every((signature) => signature.startsWith('public.')));
  assert.equal(
    EXPECTED_RUNTIME_SECURITY_DEFINERS.filter((signature) => signature.includes('overtime')).length,
    5,
  );
  assert.doesNotThrow(() => validateRuntimeBoundaryEvidence(safeEvidence()));

  const extra = safeEvidence();
  extra.securityDefiners.push({ signature: 'private.unrelated_privileged_helper()' });
  assert.throws(
    () => validateRuntimeBoundaryEvidence(extra),
    (error) => error.code === 'QA_SECDEF_OUTSIDE_ALLOWLIST',
  );
  const missing = safeEvidence();
  missing.securityDefiners.pop();
  assert.throws(
    () => validateRuntimeBoundaryEvidence(missing),
    (error) => error.code === 'QA_SECDEF_MISSING',
  );
  const relation = safeEvidence();
  relation.relations.push({ name: 'public.action_case' });
  assert.throws(
    () => validateRuntimeBoundaryEvidence(relation),
    (error) => error.code === 'QA_RUNTIME_RELATION_PRIVILEGE',
  );
  const escalated = safeEvidence();
  escalated.role.bypassRls = true;
  assert.throws(
    () => validateRuntimeBoundaryEvidence(escalated),
    (error) => error.code === 'QA_RUNTIME_ROLE_DRIFT',
  );
  const member = safeEvidence();
  member.memberships.push({ name: 'qa_owner' });
  assert.throws(
    () => validateRuntimeBoundaryEvidence(member),
    (error) => error.code === 'QA_RUNTIME_ROLE_MEMBERSHIP',
  );
  const schemaCreate = safeEvidence();
  schemaCreate.schemas.push({ name: 'private', usage: true, create: true });
  assert.throws(
    () => validateRuntimeBoundaryEvidence(schemaCreate),
    (error) => error.code === 'QA_RUNTIME_SCHEMA_DRIFT',
  );
  const owner = safeEvidence();
  owner.ownedObjects.push({ kind: 'function', name: 'public.unsafe' });
  assert.throws(
    () => validateRuntimeBoundaryEvidence(owner),
    (error) => error.code === 'QA_RUNTIME_OBJECT_OWNERSHIP',
  );
});

test('fixtures siempre son sintéticos y los reportes no exponen PII, URLs ni hashes', () => {
  assert.equal(
    qaFixtureEmail('alias-checker', 'abcdef123456'),
    'qa-overtime-alias-checker-abcdef123456@local.invalid',
  );
  assert.throws(() => qaFixtureEmail('alias@real.example', 'abcdef123456'));

  const summary = buildSafeSummary();
  const failure = buildSafeFailure({
    stage: 'runtime-acl',
    code: 'QA_SECDEF_OUTSIDE_ALLOWLIST',
    message: 'postgresql://real-user:secret@example.invalid/db',
  });
  for (const report of [summary, failure]) {
    const serialized = JSON.stringify(report);
    assert.doesNotMatch(serialized, /@|postgres(?:ql)?:|secret|[a-f0-9]{40,64}/i);
    assert.equal(report.piiPrinted, false);
  }
  assert.deepEqual(failure, {
    ok: false,
    stage: 'runtime-acl',
    code: 'QA_SECDEF_OUTSIDE_ALLOWLIST',
    piiPrinted: false,
  });
});

test('harness es dedicado, usa inventario global y nunca hereda SELECT directo legacy', () => {
  assert.doesNotMatch(source, /verify-action-center-live|createLeaveCase|listLeaveCases|readLeaveCase/);
  assert.doesNotMatch(source, /proname\s+LIKE|console\.(?:log|error)/);
  assert.match(source, /namespace\.nspname NOT IN \('pg_catalog', 'information_schema'\)/);
  assert.match(source, /function_row\.prosecdef IS TRUE/);
  assert.match(source, /has_schema_privilege\(\$1::name, namespace\.oid, 'USAGE'\)/);
  assert.match(source, /has_function_privilege\(\$1::name, function_row\.oid, 'EXECUTE'\)/);
  assert.match(source, /UPDATE public\.action_case SET updated_at = updated_at WHERE false/);
  assert.match(source, /QA_SECDEF_OUTSIDE_ALLOWLIST/);
  assert.match(source, /process\.stdout\.write\(`\$\{JSON\.stringify\(summary\)\}/);
  assert.match(source, /process\.stderr\.write\(`\$\{JSON\.stringify\(buildSafeFailure\(error\)\)\}/);
});

test('matriz live cubre autoridad, tenant, persona, replay, stale, duplicados, nómina y races', () => {
  for (const token of [
    'OVERTIME_EXCLUSIVE_REQUIRED',
    'ACTION_SESSION_INVALID',
    'ACTION_TENANT_AUTHORITY_REQUIRED',
    'ACTION_SEPARATION_OF_DUTIES',
    'ACTION_IDEMPOTENCY_KEY_REUSED',
    'ACTION_VERSION_CONFLICT',
    'OVERTIME_DUPLICATE_ACTIVE',
    'ACTION_SESSION_BUSY',
    'pending_time_rules',
    'source_import_batch',
    'person_identity',
    'employment_contract',
    'employment_status_snapshot',
    'employment_movement',
    'grh_employees',
    'grh_absences',
    'grh_catalog_rows',
    'payroll_run',
    'payroll_snapshot_assignment',
    'payroll_monthly_fact',
    'pg_locks',
  ]) {
    assert.ok(source.includes(token), `falta contrato live ${token}`);
  }
  assert.match(source, /metadata \?\| ARRAY\['amount','rate','payrollAmount','payrollRate','actorEmail','dni','cuil'\]/);
  assert.match(source, /event\.metadata - ARRAY\[/);
  assert.match(source, /action\.payload - ARRAY\['workDate','declaredMinutes','reasonCode'\]/);
  assert.match(source, /hashtextextended\(to_jsonb\(snapshot_row\)::text, 17\)/);
  assert.match(source, /hashtextextended\(to_jsonb\(snapshot_row\)::text, 71\)/);
});

test('package expone un comando live 008 separado del verifier legacy', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(
    packageJson.scripts['db:actions:overtime:verify-live'],
    'node --env-file=.env.local scripts/verify-governed-overtime-live.mjs --confirm-isolated-branch',
  );
  assert.equal(
    packageJson.scripts['db:actions:verify-live'],
    'node scripts/verify-action-center-live.mjs --confirm-isolated-branch',
  );
});
