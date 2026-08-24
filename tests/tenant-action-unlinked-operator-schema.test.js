import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  TENANT_ACTION_APPLY_SIGNATURE,
  TENANT_ACTION_UNLINKED_OPERATOR_MIGRATION_VERSION,
  tenantActionFunctionSourceFingerprint,
  tenantActionUnlinkedOperatorFingerprint,
  validateTenantActionUnlinkedOperatorDefinition,
  validateTenantActionUnlinkedOperatorEvidence,
  validateTenantActionUnlinkedOperatorMigrationSql,
} from '../scripts/apply-tenant-action-unlinked-operator-schema.mjs';
import {
  directCanonicalDatabaseUrl,
  resolveCanonicalDatabaseTarget,
} from '../scripts/lib/canonical-import.mjs';
import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';

const migrationUrl = new URL(
  '../scripts/migrations/017-tenant-action-unlinked-operator.sql', import.meta.url,
);
const baselineUrl = new URL(
  '../scripts/migrations/006-tenant-action-authority.sql', import.meta.url,
);
const applierUrl = new URL(
  '../scripts/apply-tenant-action-unlinked-operator-schema.mjs', import.meta.url,
);
const [migration, baseline, applier] = await Promise.all([
  readFile(migrationUrl, 'utf8'),
  readFile(baselineUrl, 'utf8'),
  readFile(applierUrl, 'utf8'),
]);

function normalized(value) {
  return String(value || '').replaceAll('"', '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function functionBody(sql, functionName) {
  const source = String(sql || '');
  const markers = [
    `CREATE OR REPLACE FUNCTION public.${functionName}(`,
    `CREATE OR REPLACE FUNCTION ${functionName}(`,
  ];
  const start = markers.map((marker) => source.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  assert.equal(Number.isInteger(start), true, `funcion ausente: ${functionName}`);
  const bodyStart = source.indexOf('AS $$', start) + 'AS $$'.length;
  const bodyEnd = source.indexOf('$$;', bodyStart);
  assert.ok(bodyStart >= 'AS $$'.length && bodyEnd > bodyStart);
  return source.slice(bodyStart, bodyEnd);
}

function installedEvidence(definition = migration) {
  return {
    apply: {
      signature: TENANT_ACTION_APPLY_SIGNATURE,
      definition,
      source: functionBody(definition, 'action_center_apply_tenant_command'),
      securityDefiner: true,
      ownerMatches: true,
      exactSearchPath: true,
      language: 'plpgsql',
      kind: 'f',
      volatility: 'v',
      strict: false,
      parallel: 'u',
      returnType: 'TABLE(case_id uuid, case_number bigint, '
        + 'current_status character varying, current_version integer, replayed boolean)',
      owner: 'neondb_owner',
      grants: ['municontrol_actions_runtime_app:EXECUTE', 'neondb_owner:EXECUTE'],
    },
  };
}

test('017 es aditiva, parseable y deja 006 intacta', () => {
  assert.equal(
    TENANT_ACTION_UNLINKED_OPERATOR_MIGRATION_VERSION,
    '017-tenant-action-unlinked-operator',
  );
  assert.equal(validateTenantActionUnlinkedOperatorMigrationSql(migration), true);
  assert.equal(splitPostgresStatements(migration).length, 5);
  assert.match(tenantActionUnlinkedOperatorFingerprint(migration), /^[a-f0-9]{64}$/);
  assert.match(
    baseline,
    /IF actor_person_snapshot_id IS NULL THEN[\s\S]+ACTION_CASE_NOT_FOUND/,
  );
  assert.doesNotMatch(
    migration,
    /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|ROLE|SCHEMA|DATABASE)\b/i,
  );
});

test('017 reemplaza dentro de apply solo el gate global y la SoD nullable', () => {
  const baselineBody = normalized(
    functionBody(baseline, 'action_center_apply_tenant_command'),
  );
  const installedBody = normalized(
    functionBody(migration, 'action_center_apply_tenant_command'),
  );
  const expectedBody = baselineBody
    .replace(
      "if actor_person_snapshot_id is null then raise exception 'action_case_not_found' "
        + "using errcode = 'p0001'; end if; ",
      '',
    )
    .replaceAll(
      'preparation_event.actor_person_id is null '
        + 'or preparation_event.actor_person_id = actor_person_snapshot_id',
      'preparation_event.actor_membership_id = membership.id '
        + 'or (preparation_event.actor_person_id is not null '
        + 'and preparation_event.actor_person_id = actor_person_snapshot_id)',
    );
  assert.equal(installedBody, expectedBody);
  assert.notEqual(
    tenantActionFunctionSourceFingerprint(
      functionBody(migration, 'action_center_apply_tenant_command'),
    ),
    tenantActionFunctionSourceFingerprint(
      functionBody(baseline, 'action_center_apply_tenant_command'),
    ),
  );
});

test('operador area-scoped puede preparar sin vinculo, pero no salta autoridad', () => {
  assert.equal(validateTenantActionUnlinkedOperatorDefinition(migration), true);
  const body = normalized(migration);
  const employmentLinkAt = body.indexOf('from tenant_action_employment_link link');
  const capabilitySodAt = body.indexOf(
    'perform tenant_iam_assert_no_sod_conflict(membership.id)',
  );
  assert.ok(employmentLinkAt >= 0 && capabilitySodAt > employmentLinkAt);
  assert.doesNotMatch(
    body.slice(employmentLinkAt, capabilitySodAt),
    /if actor_person_snapshot_id is null/,
  );
  for (const token of [
    "if p_command = 'create' then",
    "if p_command = 'update_draft' then",
    "elsif p_command = 'submit' then",
    "elsif p_command = 'cancel' then",
    'action_center_tenant_actor_authorized(',
    'action_center_set_tenant_command_context(',
    'actor_contract_snapshot_id, actor_person_snapshot_id',
  ]) assert.match(body, new RegExp(token.replace(/[.*+?^$()|[\]\\]/g, '\\$&')));
});

test('approve, reject y cancel-approved conservan vinculo y maker-checker', () => {
  const body = normalized(migration);
  assert.equal((body.match(/actor_person_snapshot_id is null/g) || []).length, 3);
  assert.equal(
    (body.match(/preparation_event\.actor_membership_id = membership\.id/g) || []).length,
    3,
  );
  assert.equal(
    (body.match(/preparation_event\.actor_person_id is not null/g) || []).length,
    3,
  );
  assert.doesNotMatch(
    body,
    /preparation_event\.actor_person_id is null or preparation_event\.actor_person_id/,
  );
  assert.match(
    body,
    /elsif p_command in \('approve', 'reject'\) then[\s\S]+if actor_person_snapshot_id is null/,
  );
  assert.match(
    body,
    /if current_case\.status = 'approved' and \( actor_person_snapshot_id is null/,
  );
  assert.match(body, /action_separation_of_duties/);
  assert.match(body, /beneficiary_contract\.person_id = actor_person_snapshot_id/);
});

test('validador adversarial rechaza volver al gate global o debilitar SoD', () => {
  assert.throws(
    () => validateTenantActionUnlinkedOperatorDefinition(migration.replace(
      '  PERFORM tenant_iam_assert_no_sod_conflict(membership.id);',
      "  IF actor_person_snapshot_id IS NULL THEN\n"
        + "    RAISE EXCEPTION 'ACTION_CASE_NOT_FOUND' USING ERRCODE = 'P0001';\n"
        + "  END IF;\n"
        + '  PERFORM tenant_iam_assert_no_sod_conflict(membership.id);',
    )),
    /vinculo obligatorio global/,
  );
  assert.throws(
    () => validateTenantActionUnlinkedOperatorDefinition(migration.replace(
      'preparation_event.actor_membership_id = membership.id',
      'preparation_event.actor_person_id IS NULL',
    )),
    /replay, decision y cancel-approved/,
  );
  assert.throws(
    () => validateTenantActionUnlinkedOperatorDefinition(migration.replace(
      "      IF actor_person_snapshot_id IS NULL\n",
      '',
    )),
    /replay, decision y cancel-approved|decisiones sin actor/,
  );
});

test('ACL y envelope 017 son exactos y fallan con grants o search_path extra', () => {
  assert.equal(validateTenantActionUnlinkedOperatorEvidence(installedEvidence()), true);
  const reconstructed = installedEvidence(migration
    .replace('LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp',
      "LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'public', 'pg_temp'"));
  assert.equal(validateTenantActionUnlinkedOperatorEvidence(reconstructed), true);
  assert.match(migration, /SECURITY DEFINER SET search_path = public, pg_temp/);
  assert.match(migration, /FROM PUBLIC CASCADE/);
  assert.match(migration, /aclexplode\(COALESCE\(/);
  assert.match(migration, /acl\.grantee <> function_row\.proowner/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.action_center_apply_tenant_command/);

  const extraGrant = installedEvidence();
  extraGrant.apply.grants.push('legacy_role:EXECUTE');
  assert.throws(
    () => validateTenantActionUnlinkedOperatorEvidence(extraGrant),
    /ACL funcion 017 fuera de contrato/,
  );
  const extraSearchPath = installedEvidence();
  extraSearchPath.apply.exactSearchPath = false;
  assert.throws(
    () => validateTenantActionUnlinkedOperatorEvidence(extraSearchPath),
    /instalada fuera de contrato/,
  );
});

test('aplicador exige 006 sin drift, ledger, transaccion y reapply verificable', () => {
  for (const pattern of [
    /006-tenant-action-authority\.sql/,
    /PREREQUISITE_MIGRATION_VERSION/,
    /tenantActionUnlinkedOperatorFingerprint\(prerequisite\)/,
    /verifyBaselineFunction\(client\)/,
    /tenantActionFunctionSourceFingerprint/,
    /SELECT checksum_sha256 FROM schema_migrations/,
    /await client\.query\('BEGIN'\)/,
    /pg_advisory_xact_lock/,
    /verifyTenantActionUnlinkedOperatorFinalState\(client\)/,
    /await client\.query\('COMMIT'\)/,
    /await client\.query\('ROLLBACK'\)/,
    /reapply verificado/,
    /fresh apply/,
  ]) assert.match(applier, pattern);
});

test('aplicador acepta el contrato canonico dual, incluida rama productiva confirmada', () => {
  assert.match(applier, /resolveCanonicalDatabaseTarget\(args, process\.env\)/);
  assert.match(applier, /directCanonicalDatabaseUrl\(args, process\.env\)/);
  assert.doesNotMatch(applier, /directIsolatedDatabaseUrl/);

  const branchId = 'br-plain-dust-acpjgebb';
  const host = 'ep-canonical-contract.sa-east-1.aws.neon.tech';
  const databaseUrl = `postgresql://user:secret@${host}/municontrol`;
  const env = {
    DATABASE_URL_UNPOOLED: databaseUrl,
    CANONICAL_PRODUCTION_BRANCH_ID: branchId,
    CANONICAL_PRODUCTION_HOST: host,
    CANONICAL_PRODUCTION_DATABASE: 'municontrol',
    VERCEL_ENV: 'production',
  };
  const args = [`--confirm-production-branch=${branchId}`];
  assert.deepEqual(resolveCanonicalDatabaseTarget(args, env), {
    databaseUrl, mode: 'production', branchId,
  });
  assert.equal(directCanonicalDatabaseUrl(args, env), databaseUrl);
});
