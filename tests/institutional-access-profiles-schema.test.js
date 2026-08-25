import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  ACTION_CENTER_OPERATIONAL_COMPLETION_MIGRATION_VERSION,
  actionCenterOperationalCompletionFingerprint,
} from '../scripts/apply-action-center-operational-completion-schema.mjs';
import {
  CONSULTA_INTEGRAL_ROLE,
  HUGO_APROBADOR_INTEGRAL_CAPABILITIES,
  HUGO_APROBADOR_INTEGRAL_ROLE,
  INSTITUTIONAL_ACCESS_PROFILES_MIGRATION_VERSION,
  INSTITUTIONAL_DECISION_CAPABILITIES,
  INSTITUTIONAL_READ_CAPABILITIES,
  institutionalAccessProfilesFingerprint,
  validateInstitutionalAccessProfilesEvidence,
  validateInstitutionalAccessProfilesMigrationSql,
} from '../scripts/apply-institutional-access-profiles-schema.mjs';
import {
  directCanonicalDatabaseUrl,
  resolveCanonicalDatabaseTarget,
} from '../scripts/lib/canonical-import.mjs';
import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';

const migrationUrl = new URL(
  '../scripts/migrations/019-institutional-access-profiles.sql', import.meta.url,
);
const prerequisiteUrl = new URL(
  '../scripts/migrations/018-action-center-operational-completion.sql', import.meta.url,
);
const applierUrl = new URL(
  '../scripts/apply-institutional-access-profiles-schema.mjs', import.meta.url,
);
const packageUrl = new URL('../package.json', import.meta.url);
const [migration, prerequisite, applier, packageSource] = await Promise.all([
  readFile(migrationUrl, 'utf8'),
  readFile(prerequisiteUrl, 'utf8'),
  readFile(applierUrl, 'utf8'),
  readFile(packageUrl, 'utf8'),
]);

const expectedRead = [
  'workforce.summary.read',
  'workforce.structure.read',
  'workforce.employee.read',
  'payroll.read',
  'absence.analytics.read',
  'absence.nominal.read',
  'leave.policy.read',
  'leave.preview.read',
  'management.analytics.read',
  'quality.read',
  'lineage.read',
  'budget.approved.read',
  'assistant.use',
  'actions.read',
  'leave.request.aggregate.read',
  'leave.request.all.read',
  'leave.request.audit.read',
  'leave.request.restricted.read',
  'leave.request.payroll.read',
  'time.overtime.read',
  'time.source.read',
  'time.source.audit.read',
  'time.catalog.read',
  'time.catalog.audit.read',
];

const expectedDecisions = [
  'absence.validate',
  'employee.record.approve',
  'leave.approve',
  'leave.request.area.read',
  'leave.request.area.decide',
  'leave.request.area.cancel_approved',
  'leave.request.restricted.decide',
  'time.overtime.approve',
  'time.source.approve',
  'time.catalog.approve',
];

function sorted(values) {
  return [...values].sort();
}

function installedEvidence(overrides = {}) {
  const expectedCatalog = [...new Set([...expectedRead, ...expectedDecisions])];
  return {
    roles: [
      {
        roleKey: CONSULTA_INTEGRAL_ROLE,
        label: 'Consulta institucional integral',
        description: 'Lectura transversal exacta.',
        scopeKind: 'tenant',
        systemManaged: true,
        capabilities: [...expectedRead],
      },
      {
        roleKey: HUGO_APROBADOR_INTEGRAL_ROLE,
        label: 'Aprobador institucional integral',
        description: 'Lectura y decisiones exactas.',
        scopeKind: 'tenant',
        systemManaged: true,
        capabilities: [...expectedRead, ...expectedDecisions],
      },
    ],
    catalog: expectedCatalog.map((capabilityKey) => ({
      capabilityKey,
      scopeKind: 'tenant',
    })),
    conflicts: [],
    ...overrides,
  };
}

test('019 fija dos perfiles system-managed con cardinalidad 24 y 34', () => {
  assert.equal(
    INSTITUTIONAL_ACCESS_PROFILES_MIGRATION_VERSION,
    '019-institutional-access-profiles',
  );
  assert.deepEqual(sorted(INSTITUTIONAL_READ_CAPABILITIES), sorted(expectedRead));
  assert.deepEqual(sorted(INSTITUTIONAL_DECISION_CAPABILITIES), sorted(expectedDecisions));
  assert.equal(INSTITUTIONAL_READ_CAPABILITIES.length, 24);
  assert.equal(INSTITUTIONAL_DECISION_CAPABILITIES.length, 10);
  assert.equal(HUGO_APROBADOR_INTEGRAL_CAPABILITIES.length, 34);
  assert.equal(new Set(HUGO_APROBADOR_INTEGRAL_CAPABILITIES).size, 34);
  assert.equal(validateInstitutionalAccessProfilesMigrationSql(migration), true);
  assert.equal(splitPostgresStatements(migration).length, 7);
  assert.match(institutionalAccessProfilesFingerprint(migration), /^[a-f0-9]{64}$/);
});

test('CONSULTA_INTEGRAL es una allowlist exacta y no una heuristica por sufijo', () => {
  assert.deepEqual(sorted(INSTITUTIONAL_READ_CAPABILITIES), sorted(expectedRead));
  for (const forbidden of [
    'leave.request.all.manage',
    'absence.enter',
    'employee.record.propose',
    'leave.enter',
    'time.overtime.enter',
    'time.overtime.post',
    'time.source.propose',
    'time.catalog.propose',
  ]) assert.equal(INSTITUTIONAL_READ_CAPABILITIES.includes(forbidden), false);
  assert.equal(
    INSTITUTIONAL_READ_CAPABILITIES.some((capability) => capability.startsWith('platform.')),
    false,
  );
});

test('HUGO agrega solo diez decisiones y excluye autoridad total/preparacion/posting', () => {
  assert.deepEqual(sorted(INSTITUTIONAL_DECISION_CAPABILITIES), sorted(expectedDecisions));
  assert.deepEqual(
    sorted(HUGO_APROBADOR_INTEGRAL_CAPABILITIES),
    sorted([...expectedRead, ...expectedDecisions]),
  );
  for (const forbidden of [
    'leave.request.all.manage',
    'leave.request.area.create',
    'leave.request.area.update',
    'leave.request.area.submit',
    'time.overtime.enter',
    'time.overtime.post',
    'time.source.propose',
    'time.catalog.propose',
    'platform.users.manage',
  ]) assert.equal(HUGO_APROBADOR_INTEGRAL_CAPABILITIES.includes(forbidden), false);
});

test('SQL sincroniza el set exacto, verifica catalogo, cardinalidad y cero SoD', () => {
  assert.match(migration, /ON CONFLICT \(role_key\) DO UPDATE SET[\s\S]+system_managed = EXCLUDED\.system_managed/);
  assert.equal(
    (migration.match(/DELETE FROM public\.iam_role_capability/g) || []).length,
    2,
  );
  assert.equal(
    (migration.match(/capability_key NOT IN/g) || []).length,
    2,
  );
  assert.match(migration, /consulta_count <> 24 OR aprobador_count <> 34/);
  assert.match(migration, /INSTITUTIONAL_PROFILE_CAPABILITY_CATALOG_DRIFT/);
  assert.match(migration, /INSTITUTIONAL_PROFILE_FORBIDDEN_CAPABILITY/);
  assert.match(migration, /INSTITUTIONAL_PROFILE_SOD_CONFLICT/);
  assert.match(migration, /FROM public\.iam_capability_conflict conflict/);
  assert.doesNotMatch(migration, /\b(?:internal_users|tenant_membership|platform_user_role)\b/i);
});

test('validador adversarial rechaza faltantes, grants extra y sincronizacion parcial', () => {
  assert.throws(
    () => validateInstitutionalAccessProfilesMigrationSql(migration.replace(
      "  ('CONSULTA_INTEGRAL', 'workforce.summary.read'),\n",
      '',
    )),
    /grants CONSULTA_INTEGRAL fuera de contrato/,
  );
  assert.throws(
    () => validateInstitutionalAccessProfilesMigrationSql(migration.replace(
      "  ('HUGO_APROBADOR_INTEGRAL', 'time.catalog.approve')\nON CONFLICT",
      "  ('HUGO_APROBADOR_INTEGRAL', 'time.catalog.approve'),\n"
        + "  ('HUGO_APROBADOR_INTEGRAL', 'leave.request.all.manage')\nON CONFLICT",
    )),
    /grants HUGO_APROBADOR_INTEGRAL fuera de contrato|capacidades prohibidas/,
  );
  assert.throws(
    () => validateInstitutionalAccessProfilesMigrationSql(migration.replace(
      "role_capability.role_key = 'CONSULTA_INTEGRAL'\n  AND",
      "role_capability.role_key = 'HUGO_APROBADOR_INTEGRAL'\n  AND",
    )),
    /sincronizacion CONSULTA_INTEGRAL fuera de contrato/,
  );
  assert.throws(
    () => validateInstitutionalAccessProfilesMigrationSql(migration.replace(
      'FROM public.iam_capability_conflict conflict',
      'FROM public.iam_capability conflict',
    )),
    /migracion 019 incompleta/,
  );
});

test('evidencia final prueba roles, catalogo tenant, allowlists y SoD', () => {
  assert.equal(validateInstitutionalAccessProfilesEvidence(installedEvidence()), true);

  const residual = installedEvidence();
  residual.roles[0].capabilities.push('leave.request.all.manage');
  assert.throws(
    () => validateInstitutionalAccessProfilesEvidence(residual),
    /capacidades CONSULTA_INTEGRAL fuera de contrato/,
  );

  const nonTenant = installedEvidence();
  nonTenant.catalog[0].scopeKind = 'platform';
  assert.throws(
    () => validateInstitutionalAccessProfilesEvidence(nonTenant),
    /capacidad no tenant/,
  );

  const conflict = installedEvidence({
    conflicts: [{
      roleKey: HUGO_APROBADOR_INTEGRAL_ROLE,
      capabilityKey: 'time.source.propose',
      conflictsWithKey: 'time.source.approve',
    }],
  });
  assert.throws(
    () => validateInstitutionalAccessProfilesEvidence(conflict),
    /conflictos SoD/,
  );
});

test('aplicador exige checksum/evidencia 018, ledger, lock, transaccion y reapply', () => {
  assert.equal(
    ACTION_CENTER_OPERATIONAL_COMPLETION_MIGRATION_VERSION,
    '018-action-center-operational-completion',
  );
  assert.match(actionCenterOperationalCompletionFingerprint(prerequisite), /^[a-f0-9]{64}$/);
  for (const pattern of [
    /018-action-center-operational-completion\.sql/,
    /actionCenterOperationalCompletionFingerprint\(prerequisite\)/,
    /verifyActionCenterOperationalCompletionFinalState\(client, prerequisite\)/,
    /SELECT checksum_sha256 FROM schema_migrations/,
    /await client\.query\('BEGIN'\)/,
    /pg_advisory_xact_lock/,
    /verifyInstitutionalAccessProfilesFinalState\(client\)/,
    /await client\.query\('COMMIT'\)/,
    /await client\.query\('ROLLBACK'\)/,
    /reapply verificado/,
    /fresh apply/,
  ]) assert.match(applier, pattern);
  assert.match(
    packageSource,
    /db:iam:institutional-profiles:schema[\s\S]+--confirm-isolated-branch/,
  );
});

test('aplicador usa target canonico dual y exige pin explicito', () => {
  assert.match(applier, /resolveCanonicalDatabaseTarget\(args, process\.env\)/);
  assert.match(applier, /directCanonicalDatabaseUrl\(args, process\.env\)/);
  assert.doesNotMatch(applier, /directIsolatedDatabaseUrl/);

  const branchId = 'br-institutional-profile-qa';
  const host = 'ep-institutional-profile.sa-east-1.aws.neon.tech';
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
    databaseUrl,
    mode: 'production',
    branchId,
  });
  assert.equal(directCanonicalDatabaseUrl(args, env), databaseUrl);
  assert.throws(
    () => resolveCanonicalDatabaseTarget([], { DATABASE_URL_UNPOOLED: databaseUrl }),
    /confirm-isolated-branch|confirm-production-branch/,
  );
});
