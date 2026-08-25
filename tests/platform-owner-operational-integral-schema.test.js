import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  EMAIL_FIRST_FACTOR_LOGIN_MIGRATION_VERSION,
  emailFirstFactorLoginFingerprint,
} from '../scripts/apply-email-first-factor-login-schema.mjs';
import {
  CONSULTA_INTEGRAL_ROLE,
  INSTITUTIONAL_ACCESS_PROFILES_MIGRATION_VERSION,
  INSTITUTIONAL_READ_CAPABILITIES,
  institutionalAccessProfilesFingerprint,
} from '../scripts/apply-institutional-access-profiles-schema.mjs';
import {
  EXISTING_IDENTITY_MEMBERSHIP_MIGRATION_VERSION,
  TENANT_RRHH_ADMIN_OPERATIVO_CAPABILITIES,
  existingIdentityMembershipFingerprint,
  validateExistingIdentityMembershipRoleContractEvidence,
} from '../scripts/apply-existing-identity-membership-governance-schema.mjs';
import {
  PLATFORM_OWNER_OPERATIONAL_FORBIDDEN_CAPABILITIES,
  PLATFORM_OWNER_OPERATIONAL_INTEGRAL_CAPABILITIES,
  PLATFORM_OWNER_OPERATIONAL_INTEGRAL_MIGRATION_VERSION,
  PLATFORM_OWNER_OPERATIONAL_INTEGRAL_ROLE,
  platformOwnerOperationalIntegralFingerprint,
  resolvePlatformOwnerOperationalIntegralTarget,
  validatePlatformOwnerOperationalIntegralEvidence,
  validatePlatformOwnerOperationalIntegralMigrationSql,
} from '../scripts/apply-platform-owner-operational-integral-schema.mjs';
import {
  directCanonicalDatabaseUrl,
  resolveCanonicalDatabaseTarget,
} from '../scripts/lib/canonical-import.mjs';
import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';

const migrationUrl = new URL(
  '../scripts/migrations/021-platform-owner-operational-integral.sql', import.meta.url,
);
const applierUrl = new URL(
  '../scripts/apply-platform-owner-operational-integral-schema.mjs', import.meta.url,
);
const packageUrl = new URL('../package.json', import.meta.url);
const vercelIgnoreUrl = new URL('../.vercelignore', import.meta.url);
const prerequisiteUrls = {
  membership: new URL(
    '../scripts/migrations/013-existing-identity-membership-governance.sql', import.meta.url,
  ),
  profiles: new URL(
    '../scripts/migrations/019-institutional-access-profiles.sql', import.meta.url,
  ),
  emailFirst: new URL(
    '../scripts/migrations/020-email-first-factor-login.sql', import.meta.url,
  ),
};

const [
  migration,
  applier,
  packageSource,
  vercelIgnore,
  prerequisite013,
  prerequisite019,
  prerequisite020,
] =
  await Promise.all([
    readFile(migrationUrl, 'utf8'),
    readFile(applierUrl, 'utf8'),
    readFile(packageUrl, 'utf8'),
    readFile(vercelIgnoreUrl, 'utf8'),
    readFile(prerequisiteUrls.membership, 'utf8'),
    readFile(prerequisiteUrls.profiles, 'utf8'),
    readFile(prerequisiteUrls.emailFirst, 'utf8'),
  ]);

function sorted(values) {
  return [...values].sort();
}

function evidence(overrides = {}) {
  return {
    roles: [{
      roleKey: PLATFORM_OWNER_OPERATIONAL_INTEGRAL_ROLE,
      label: 'Owner operativo integral',
      description: 'Lectura y preparacion sin decision.',
      scopeKind: 'tenant',
      systemManaged: true,
      capabilities: [...PLATFORM_OWNER_OPERATIONAL_INTEGRAL_CAPABILITIES],
    }],
    sourceRoles: [
      {
        roleKey: CONSULTA_INTEGRAL_ROLE,
        capabilities: [...INSTITUTIONAL_READ_CAPABILITIES],
      },
      {
        roleKey: 'TENANT_RRHH_ADMIN_OPERATIVO',
        capabilities: [...TENANT_RRHH_ADMIN_OPERATIVO_CAPABILITIES],
      },
    ],
    catalog: PLATFORM_OWNER_OPERATIONAL_INTEGRAL_CAPABILITIES.map((capabilityKey) => ({
      capabilityKey,
      scopeKind: 'tenant',
    })),
    conflicts: [],
    ...overrides,
  };
}

test('021 define la union exacta 019 + 013 con cardinalidad 34', () => {
  assert.equal(
    PLATFORM_OWNER_OPERATIONAL_INTEGRAL_MIGRATION_VERSION,
    '021-platform-owner-operational-integral',
  );
  assert.equal(
    PLATFORM_OWNER_OPERATIONAL_INTEGRAL_ROLE,
    'PLATFORM_OWNER_OPERATIVO_INTEGRAL',
  );
  const expectedUnion = [
    ...new Set([
      ...INSTITUTIONAL_READ_CAPABILITIES,
      ...TENANT_RRHH_ADMIN_OPERATIVO_CAPABILITIES,
    ]),
  ];
  assert.deepEqual(
    sorted(PLATFORM_OWNER_OPERATIONAL_INTEGRAL_CAPABILITIES),
    sorted(expectedUnion),
  );
  assert.equal(PLATFORM_OWNER_OPERATIONAL_INTEGRAL_CAPABILITIES.length, 34);
  assert.equal(new Set(PLATFORM_OWNER_OPERATIONAL_INTEGRAL_CAPABILITIES).size, 34);
  assert.equal(validatePlatformOwnerOperationalIntegralMigrationSql(migration), true);
  assert.equal(splitPostgresStatements(migration).length, 5);
  assert.match(platformOwnerOperationalIntegralFingerprint(migration), /^[a-f0-9]{64}$/);
});

test('021 conserva maker-checker y excluye decision, cancel-approved, posting y platform', () => {
  const capabilities = PLATFORM_OWNER_OPERATIONAL_INTEGRAL_CAPABILITIES;
  for (const forbidden of PLATFORM_OWNER_OPERATIONAL_FORBIDDEN_CAPABILITIES) {
    assert.equal(capabilities.includes(forbidden), false, forbidden);
  }
  assert.equal(capabilities.some((capability) => capability.startsWith('platform.')), false);
  for (const requiredOperational of [
    'absence.enter',
    'employee.record.propose',
    'leave.enter',
    'leave.request.area.create',
    'leave.request.area.update',
    'leave.request.area.submit',
    'leave.request.area.cancel_pending',
    'time.source.propose',
    'time.catalog.propose',
  ]) assert.equal(capabilities.includes(requiredOperational), true, requiredOperational);
});

test('SQL sincroniza la allowlist y prueba union simetrica, catalogo tenant y cero SoD', () => {
  assert.match(migration, /ON CONFLICT \(role_key\) DO UPDATE SET[\s\S]+system_managed = EXCLUDED\.system_managed/);
  assert.equal((migration.match(/DELETE FROM public\.iam_role_capability/g) || []).length, 1);
  assert.equal((migration.match(/capability_key NOT IN/g) || []).length, 1);
  assert.match(migration, /role_count <> 34 OR union_count <> 34 OR union_drift_count <> 0/);
  assert.match(migration, /SELECT capability_key FROM source_union EXCEPT SELECT capability_key FROM target/);
  assert.match(migration, /SELECT capability_key FROM target EXCEPT SELECT capability_key FROM source_union/);
  assert.match(migration, /PLATFORM_OWNER_OPERATIONAL_CAPABILITY_CATALOG_DRIFT/);
  assert.match(migration, /PLATFORM_OWNER_OPERATIONAL_FORBIDDEN_CAPABILITY/);
  assert.match(migration, /PLATFORM_OWNER_OPERATIONAL_SOD_CONFLICT/);
  assert.match(migration, /FROM public\.iam_capability_conflict conflict/);
  assert.doesNotMatch(migration, /\b(?:internal_users|tenant_membership|platform_user_role)\b/i);
});

test('validador SQL adversarial rechaza grant extra, grant faltante y sync parcial', () => {
  assert.throws(
    () => validatePlatformOwnerOperationalIntegralMigrationSql(migration.replace(
      "  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'payroll.read'),\n",
      '',
    )),
    /grants PLATFORM_OWNER_OPERATIVO_INTEGRAL fuera de contrato/,
  );
  assert.throws(
    () => validatePlatformOwnerOperationalIntegralMigrationSql(migration.replace(
      "  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'time.catalog.propose')\nON CONFLICT",
      "  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'time.catalog.propose'),\n"
        + "  ('PLATFORM_OWNER_OPERATIVO_INTEGRAL', 'time.catalog.approve')\nON CONFLICT",
    )),
    /grants PLATFORM_OWNER_OPERATIVO_INTEGRAL fuera de contrato|capacidades prohibidas/,
  );
  assert.throws(
    () => validatePlatformOwnerOperationalIntegralMigrationSql(migration.replace(
      "    'payroll.read',\n",
      '',
    )),
    /sincronizacion PLATFORM_OWNER_OPERATIVO_INTEGRAL fuera de contrato/,
  );
});

test('evidencia final prueba rol, fuentes exactas, union, catalogo y SoD', () => {
  assert.equal(validatePlatformOwnerOperationalIntegralEvidence(evidence()), true);

  const extra = evidence();
  extra.roles[0].capabilities.push('time.source.approve');
  assert.throws(
    () => validatePlatformOwnerOperationalIntegralEvidence(extra),
    /capacidades PLATFORM_OWNER_OPERATIVO_INTEGRAL fuera de contrato/,
  );

  const sourceDrift = evidence();
  sourceDrift.sourceRoles[0].capabilities.pop();
  assert.throws(
    () => validatePlatformOwnerOperationalIntegralEvidence(sourceDrift),
    /fuente CONSULTA_INTEGRAL fuera de contrato/,
  );

  const nonTenant = evidence();
  nonTenant.catalog[0].scopeKind = 'platform';
  assert.throws(
    () => validatePlatformOwnerOperationalIntegralEvidence(nonTenant),
    /capacidad no tenant/,
  );

  const conflict = evidence({
    conflicts: [{ capabilityKey: 'time.source.propose', conflictsWithKey: 'x' }],
  });
  assert.throws(
    () => validatePlatformOwnerOperationalIntegralEvidence(conflict),
    /conflictos SoD/,
  );
});

test('verificador focal 013 conserva rol/catalogo/SoD sin congelar funciones posteriores', () => {
  const focal = {
    role: {
      roleKey: 'TENANT_RRHH_ADMIN_OPERATIVO',
      label: 'Administrador RRHH operativo',
      description: 'Prepara sin decidir.',
      scopeKind: 'tenant',
      systemManaged: true,
    },
    roleCapabilities: TENANT_RRHH_ADMIN_OPERATIVO_CAPABILITIES.map((capabilityKey) => ({
      capabilityKey,
    })),
    catalog: TENANT_RRHH_ADMIN_OPERATIVO_CAPABILITIES.map((capabilityKey) => ({
      capabilityKey,
      scopeKind: 'tenant',
    })),
    conflicts: [],
  };
  assert.equal(validateExistingIdentityMembershipRoleContractEvidence(focal), true);
  focal.roleCapabilities.push({ capabilityKey: 'time.source.approve' });
  assert.throws(
    () => validateExistingIdentityMembershipRoleContractEvidence(focal),
    /perfil operativo focal 013 fuera de contrato/,
  );
});

test('aplicador fija ledger 013/019/020, contratos finales, lock, transaccion y reapply', () => {
  assert.equal(
    EXISTING_IDENTITY_MEMBERSHIP_MIGRATION_VERSION,
    '013-existing-identity-membership-governance',
  );
  assert.equal(INSTITUTIONAL_ACCESS_PROFILES_MIGRATION_VERSION, '019-institutional-access-profiles');
  assert.equal(EMAIL_FIRST_FACTOR_LOGIN_MIGRATION_VERSION, '020-email-first-factor-login');
  assert.match(existingIdentityMembershipFingerprint(prerequisite013), /^[a-f0-9]{64}$/);
  assert.match(institutionalAccessProfilesFingerprint(prerequisite019), /^[a-f0-9]{64}$/);
  assert.match(emailFirstFactorLoginFingerprint(prerequisite020), /^[a-f0-9]{64}$/);
  for (const pattern of [
    /013-existing-identity-membership-governance\.sql/,
    /019-institutional-access-profiles\.sql/,
    /020-email-first-factor-login\.sql/,
    /verifyExistingIdentityMembershipRoleContract\(client\)/,
    /verifyInstitutionalAccessProfilesFinalState\(client\)/,
    /verifyEmailFirstFactorFinalState\(client\)/,
    /EMAIL_OTP_MFA_RUNTIME_FUNCTION_ALLOWLIST/,
    /allowlist runtime acumulada 021/,
    /SELECT checksum_sha256 FROM schema_migrations/,
    /verifyNoUnledgeredRole\(client\)/,
    /await client\.query\('BEGIN'\)/,
    /pg_advisory_xact_lock/,
    /await client\.query\('COMMIT'\)/,
    /await client\.query\('ROLLBACK'\)/,
    /reapply verificado/,
    /fresh apply/,
  ]) assert.match(applier, pattern);
});

test('aplicador exige pines QA explicitos y conserva el target productivo canonico', () => {
  assert.match(applier, /resolvePlatformOwnerOperationalIntegralTarget\(args, process\.env\)/);
  assert.match(applier, /directCanonicalDatabaseUrl\(args, process\.env\)/);
  assert.doesNotMatch(applier, /directIsolatedDatabaseUrl/);
  assert.match(
    packageSource,
    /db:iam:platform-owner-operational:schema[\s\S]+apply-platform-owner-operational-integral-schema\.mjs --confirm-isolated-branch/,
  );

  const branchId = 'br-owner-operational-qa';
  const host = 'ep-owner-operational.sa-east-1.aws.neon.tech';
  const databaseUrl = `postgresql://user:secret@${host}/municontrol`;
  const env = {
    DATABASE_URL_UNPOOLED: databaseUrl,
    CANONICAL_PRODUCTION_BRANCH_ID: branchId,
    CANONICAL_PRODUCTION_HOST: host,
    CANONICAL_PRODUCTION_DATABASE: 'municontrol',
    VERCEL_ENV: 'production',
  };
  assert.deepEqual(
    resolveCanonicalDatabaseTarget([`--confirm-production-branch=${branchId}`], env),
    { databaseUrl, mode: 'production', branchId },
  );
  assert.equal(
    directCanonicalDatabaseUrl([`--confirm-production-branch=${branchId}`], env),
    databaseUrl,
  );
  assert.deepEqual(
    resolvePlatformOwnerOperationalIntegralTarget(
      [`--confirm-production-branch=${branchId}`],
      env,
    ),
    { databaseUrl, mode: 'production', branchId },
  );
});

test('Vercel conserva migraciones y runbook requeridos por el build', () => {
  for (const requiredPath of [
    'scripts/migrations/019-institutional-access-profiles.sql',
    'scripts/migrations/020-email-first-factor-login.sql',
    'scripts/migrations/021-platform-owner-operational-integral.sql',
    'docs/INSTITUTIONAL_SHOWCASE_USERS_RUNBOOK.md',
  ]) {
    assert.match(
      vercelIgnore,
      new RegExp(`^!${requiredPath.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}$`, 'm'),
    );
  }
});

test('gate 021 acredita rama QA, endpoint directo y base antes de conectar', () => {
  const branchId = 'br-owner-operational-qa';
  const host = 'ep-owner-operational.sa-east-1.aws.neon.tech';
  const databaseUrl = `postgresql://qa_owner:secret@${host}/municontrol_qa`;
  const env = {
    DATABASE_URL_UNPOOLED: databaseUrl,
    CANONICAL_QA_BRANCH_ID: branchId,
    CANONICAL_QA_HOST: host,
    CANONICAL_QA_DATABASE: 'municontrol_qa',
    CANONICAL_PRODUCTION_BRANCH_ID: 'br-owner-production',
    CANONICAL_PRODUCTION_HOST: 'ep-owner-production.sa-east-1.aws.neon.tech',
  };
  assert.deepEqual(
    resolvePlatformOwnerOperationalIntegralTarget(['--confirm-isolated-branch'], env),
    { databaseUrl, mode: 'isolated', branchId },
  );

  for (const variableName of [
    'CANONICAL_QA_BRANCH_ID',
    'CANONICAL_QA_HOST',
    'CANONICAL_QA_DATABASE',
  ]) {
    assert.throws(
      () => resolvePlatformOwnerOperationalIntegralTarget(
        ['--confirm-isolated-branch'],
        { ...env, [variableName]: '' },
      ),
      new RegExp(`Falta ${variableName}`),
    );
  }
});

test('gate 021 rechaza drift host/base, pooler y pines QA productivos', () => {
  const qaHost = 'ep-owner-operational.sa-east-1.aws.neon.tech';
  const productionHost = 'ep-owner-production.sa-east-1.aws.neon.tech';
  const baseEnv = {
    DATABASE_URL_UNPOOLED:
      `postgresql://qa_owner:secret@${qaHost}/municontrol_qa`,
    CANONICAL_QA_BRANCH_ID: 'br-owner-operational-qa',
    CANONICAL_QA_HOST: qaHost,
    CANONICAL_QA_DATABASE: 'municontrol_qa',
    CANONICAL_PRODUCTION_BRANCH_ID: 'br-owner-production',
    CANONICAL_PRODUCTION_HOST: productionHost,
  };
  const isolated = ['--confirm-isolated-branch'];

  assert.throws(
    () => resolvePlatformOwnerOperationalIntegralTarget(isolated, {
      ...baseEnv,
      CANONICAL_QA_HOST: 'ep-other-qa.sa-east-1.aws.neon.tech',
    }),
    /no coincide con CANONICAL_QA_HOST/,
  );
  assert.throws(
    () => resolvePlatformOwnerOperationalIntegralTarget(isolated, {
      ...baseEnv,
      CANONICAL_QA_DATABASE: 'otra_base',
    }),
    /no coincide con CANONICAL_QA_DATABASE/,
  );
  assert.throws(
    () => resolvePlatformOwnerOperationalIntegralTarget(isolated, {
      ...baseEnv,
      DATABASE_URL_UNPOOLED:
        'postgresql://qa_owner:secret@ep-owner-operational-pooler.sa-east-1.aws.neon.tech/municontrol_qa',
      CANONICAL_QA_HOST:
        'ep-owner-operational-pooler.sa-east-1.aws.neon.tech',
    }),
    /endpoint pooled/,
  );
  assert.throws(
    () => resolvePlatformOwnerOperationalIntegralTarget(isolated, {
      ...baseEnv,
      CANONICAL_QA_BRANCH_ID: baseEnv.CANONICAL_PRODUCTION_BRANCH_ID,
    }),
    /coincide con CANONICAL_PRODUCTION_BRANCH_ID/,
  );
  assert.throws(
    () => resolvePlatformOwnerOperationalIntegralTarget(isolated, {
      ...baseEnv,
      DATABASE_URL_UNPOOLED:
        `postgresql://qa_owner:secret@${productionHost}/municontrol_qa`,
      CANONICAL_QA_HOST: productionHost,
    }),
    /coincide con CANONICAL_PRODUCTION_HOST/,
  );
});
