import { createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import {
  hashInternalPassword,
  verifyInternalPassword,
} from '../lib/internal-password.js';
import {
  ACTION_CENTER_OPERATIONAL_COMPLETION_MIGRATION_VERSION,
} from './apply-action-center-operational-completion-schema.mjs';
import {
  EMAIL_OTP_MFA_MIGRATION_VERSION,
  verifyEmailOtpMfaFinalAcl,
} from './apply-email-otp-mfa-schema.mjs';
import {
  EMAIL_MFA_RETRY_IDEMPOTENCY_MIGRATION_VERSION,
} from './apply-email-mfa-retry-idempotency-schema.mjs';
import {
  EMAIL_FIRST_FACTOR_LOGIN_MIGRATION_VERSION,
  verifyEmailFirstFactorFinalState,
} from './apply-email-first-factor-login-schema.mjs';
import {
  EXISTING_IDENTITY_MEMBERSHIP_MIGRATION_VERSION,
} from './apply-existing-identity-membership-governance-schema.mjs';
import {
  CONSULTA_INTEGRAL_ROLE,
  HUGO_APROBADOR_INTEGRAL_CAPABILITIES,
  HUGO_APROBADOR_INTEGRAL_ROLE,
  INSTITUTIONAL_ACCESS_PROFILES_MIGRATION_VERSION,
  INSTITUTIONAL_READ_CAPABILITIES,
  verifyInstitutionalAccessProfilesFinalState,
} from './apply-institutional-access-profiles-schema.mjs';
import {
  PLATFORM_OWNER_OPERATIONAL_INTEGRAL_CAPABILITIES,
  PLATFORM_OWNER_OPERATIONAL_INTEGRAL_MIGRATION_VERSION,
  PLATFORM_OWNER_OPERATIONAL_INTEGRAL_ROLE,
  resolvePlatformOwnerOperationalIntegralTarget,
  verifyPlatformOwnerOperationalIntegralFinalState,
} from './apply-platform-owner-operational-integral-schema.mjs';
import {
  emailMfaFactorProvisionMaterial,
} from './provision-email-mfa-factor.mjs';
import {
  directCanonicalDatabaseUrl,
  stableJson,
} from './lib/canonical-import.mjs';

export const SHOWCASE_PROVISION_CONFIRMATION =
  'PROVISION_INSTITUTIONAL_SHOWCASE_IDENTITIES';
export const SHOWCASE_PROVISION_COMMAND = 'provision_institutional_showcase';
export const SHOWCASE_OWNER_TENANT_ROLE = PLATFORM_OWNER_OPERATIONAL_INTEGRAL_ROLE;

const EMAIL = /^[^\s@]+@[^\s@]+$/;
const TENANT_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// PostgreSQL's uuid type accepts the canonical 8-4-4-4-12 representation
// independently of RFC version/variant bits. Canonical GRH ids can therefore
// be UUIDv7 (and historical imports can carry a non-RFC variant nibble).
const POSTGRES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PLATFORM_OWNER_CAPABILITIES = Object.freeze([
  'platform.tenants.read', 'platform.tenants.manage',
  'platform.crm.read', 'platform.crm.manage',
  'platform.users.read', 'platform.users.invite', 'platform.users.manage',
  'platform.roles.read', 'platform.roles.manage', 'platform.audit.read',
]);

const OWNER_AREA_CAPABILITIES = Object.freeze([
  'leave.request.area.create',
  'leave.request.area.read',
  'leave.request.area.update',
  'leave.request.area.submit',
  'leave.request.area.cancel_pending',
]);

const APPROVER_AREA_CAPABILITIES = Object.freeze([
  'leave.request.area.read',
  'leave.request.area.decide',
  'leave.request.area.cancel_approved',
]);

const MIGRATION_FILES = Object.freeze([
  ['002-canonical-integration', new URL('./migrations/002-canonical-integration.sql', import.meta.url)],
  ['003-action-center', new URL('./migrations/003-action-center.sql', import.meta.url)],
  ['004-tenant-iam-control-plane', new URL('./migrations/004-tenant-iam-control-plane.sql', import.meta.url)],
  ['005-tenant-identity-gateway', new URL('./migrations/005-tenant-identity-gateway.sql', import.meta.url)],
  ['006-tenant-action-authority', new URL('./migrations/006-tenant-action-authority.sql', import.meta.url)],
  ['009-tenant-lifecycle-hardening', new URL('./migrations/009-tenant-lifecycle-hardening.sql', import.meta.url)],
  ['012-platform-owner-governance', new URL('./migrations/012-platform-owner-governance.sql', import.meta.url)],
  [EXISTING_IDENTITY_MEMBERSHIP_MIGRATION_VERSION,
    new URL('./migrations/013-existing-identity-membership-governance.sql', import.meta.url)],
  ['014-governed-source-binding-provisioning',
    new URL('./migrations/014-governed-source-binding-provisioning.sql', import.meta.url)],
  [EMAIL_OTP_MFA_MIGRATION_VERSION,
    new URL('./migrations/015-email-otp-mfa.sql', import.meta.url)],
  [EMAIL_MFA_RETRY_IDEMPOTENCY_MIGRATION_VERSION,
    new URL('./migrations/016-email-mfa-retry-idempotency.sql', import.meta.url)],
  [ACTION_CENTER_OPERATIONAL_COMPLETION_MIGRATION_VERSION,
    new URL('./migrations/018-action-center-operational-completion.sql', import.meta.url)],
  [INSTITUTIONAL_ACCESS_PROFILES_MIGRATION_VERSION,
    new URL('./migrations/019-institutional-access-profiles.sql', import.meta.url)],
  [EMAIL_FIRST_FACTOR_LOGIN_MIGRATION_VERSION,
    new URL('./migrations/020-email-first-factor-login.sql', import.meta.url)],
  [PLATFORM_OWNER_OPERATIONAL_INTEGRAL_MIGRATION_VERSION,
    new URL('./migrations/021-platform-owner-operational-integral.sql', import.meta.url)],
]);

const ROLE_CONTRACTS = Object.freeze({
  PLATFORM_OWNER: Object.freeze({
    scopeKind: 'platform',
    capabilities: PLATFORM_OWNER_CAPABILITIES,
  }),
  [SHOWCASE_OWNER_TENANT_ROLE]: Object.freeze({
    scopeKind: 'tenant',
    capabilities: PLATFORM_OWNER_OPERATIONAL_INTEGRAL_CAPABILITIES,
  }),
  [HUGO_APROBADOR_INTEGRAL_ROLE]: Object.freeze({
    scopeKind: 'tenant',
    capabilities: HUGO_APROBADOR_INTEGRAL_CAPABILITIES,
  }),
  [CONSULTA_INTEGRAL_ROLE]: Object.freeze({
    scopeKind: 'tenant',
    capabilities: INSTITUTIONAL_READ_CAPABILITIES,
  }),
});

function required(value, name) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`Falta ${name}`);
  return text;
}

function normalizeEmail(value, name) {
  const email = required(value, name).toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) throw new Error(`${name} invalido`);
  return email;
}

function displayName(value, name) {
  const text = required(value, name);
  if (text.length < 2 || text.length > 160) throw new Error(`${name} debe tener entre 2 y 160 caracteres`);
  return text;
}

function password(value, name) {
  const text = required(value, name);
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes < 8 || bytes > 4096) throw new Error(`${name} debe tener entre 8 y 4096 bytes`);
  return text;
}

function positiveInteger(value, name) {
  const text = required(value, name);
  if (!/^\d+$/.test(text)) throw new Error(`${name} debe ser entero positivo`);
  const parsed = Number.parseInt(text, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} debe ser entero positivo`);
  }
  return parsed;
}

function emailFactorSecrets(env) {
  const emailMfaPepper = required(
    env.IDENTITY_EMAIL_MFA_PEPPER,
    'IDENTITY_EMAIL_MFA_PEPPER',
  );
  if (Buffer.byteLength(emailMfaPepper, 'utf8') < 32) {
    throw new Error('IDENTITY_EMAIL_MFA_PEPPER debe tener al menos 32 bytes');
  }
  const encodedKey = required(
    env.IDENTITY_EMAIL_MFA_ENCRYPTION_KEY,
    'IDENTITY_EMAIL_MFA_ENCRYPTION_KEY',
  );
  let emailMfaEncryptionKey;
  try {
    emailMfaEncryptionKey = Buffer.from(encodedKey, 'base64url');
  } catch {
    emailMfaEncryptionKey = Buffer.alloc(0);
  }
  if (emailMfaEncryptionKey.length !== 32) {
    throw new Error('IDENTITY_EMAIL_MFA_ENCRYPTION_KEY debe ser base64url de 32 bytes');
  }
  return Object.freeze({ emailMfaPepper, emailMfaEncryptionKey });
}

function showcaseCommandPepper(env) {
  const value = required(
    env.SHOWCASE_PROVISION_COMMAND_PEPPER,
    'SHOWCASE_PROVISION_COMMAND_PEPPER',
  );
  if (Buffer.byteLength(value, 'utf8') < 32) {
    throw new Error('SHOWCASE_PROVISION_COMMAND_PEPPER debe tener al menos 32 bytes');
  }
  return value;
}

function employmentSelector(env) {
  const contractId = String(env.SHOWCASE_APPROVER_EMPLOYMENT_CONTRACT_ID ?? '')
    .trim().toLowerCase();
  const legajo = String(env.SHOWCASE_APPROVER_LEGAJO ?? '').trim();
  const companyValue = String(env.SHOWCASE_APPROVER_COMPANY_ID ?? '').trim();
  const hasPair = Boolean(legajo || companyValue);
  if (contractId && hasPair) {
    throw new Error(
      'Use SHOWCASE_APPROVER_EMPLOYMENT_CONTRACT_ID o el par '
        + 'SHOWCASE_APPROVER_COMPANY_ID/SHOWCASE_APPROVER_LEGAJO, no ambos',
    );
  }
  if (contractId) {
    if (!POSTGRES_UUID.test(contractId)) {
      throw new Error('SHOWCASE_APPROVER_EMPLOYMENT_CONTRACT_ID invalido');
    }
    return Object.freeze({ kind: 'contract_id', contractId });
  }
  if (!legajo || !companyValue) {
    throw new Error(
      'Falta un vinculo inequivoco: SHOWCASE_APPROVER_EMPLOYMENT_CONTRACT_ID '
        + 'o SHOWCASE_APPROVER_COMPANY_ID junto con SHOWCASE_APPROVER_LEGAJO',
    );
  }
  if (legajo.length > 64) throw new Error('SHOWCASE_APPROVER_LEGAJO excede 64 caracteres');
  return Object.freeze({
    kind: 'legacy_key',
    companyId: positiveInteger(companyValue, 'SHOWCASE_APPROVER_COMPANY_ID'),
    legajo,
  });
}

export function institutionalShowcaseConfiguration(env = process.env) {
  const confirmation = required(env.SHOWCASE_PROVISION_CONFIRM, 'SHOWCASE_PROVISION_CONFIRM');
  if (confirmation !== SHOWCASE_PROVISION_CONFIRMATION) {
    throw new Error(`SHOWCASE_PROVISION_CONFIRM debe ser ${SHOWCASE_PROVISION_CONFIRMATION}`);
  }
  const operationId = required(
    env.SHOWCASE_PROVISION_OPERATION_ID,
    'SHOWCASE_PROVISION_OPERATION_ID',
  ).toLowerCase();
  if (!UUID_V4.test(operationId)) {
    throw new Error('SHOWCASE_PROVISION_OPERATION_ID debe ser un UUID v4 nuevo por rotacion');
  }
  const tenantSlug = required(env.SHOWCASE_TENANT_SLUG, 'SHOWCASE_TENANT_SLUG').toLowerCase();
  if (!TENANT_SLUG.test(tenantSlug)) throw new Error('SHOWCASE_TENANT_SLUG invalido');
  const reason = required(env.SHOWCASE_PROVISION_REASON, 'SHOWCASE_PROVISION_REASON');
  if (reason.length < 3 || reason.length > 380) {
    throw new Error('SHOWCASE_PROVISION_REASON debe tener entre 3 y 380 caracteres');
  }

  const profiles = Object.freeze([
    Object.freeze({
      key: 'owner',
      email: normalizeEmail(env.SHOWCASE_OWNER_EMAIL, 'SHOWCASE_OWNER_EMAIL'),
      displayName: displayName(env.SHOWCASE_OWNER_DISPLAY_NAME, 'SHOWCASE_OWNER_DISPLAY_NAME'),
      password: password(env.SHOWCASE_OWNER_PASSWORD, 'SHOWCASE_OWNER_PASSWORD'),
      legacyRole: 'ADMIN_INTERNO',
      tenantRole: SHOWCASE_OWNER_TENANT_ROLE,
      areaCapabilities: OWNER_AREA_CAPABILITIES,
    }),
    Object.freeze({
      key: 'approver',
      email: normalizeEmail(env.SHOWCASE_APPROVER_EMAIL, 'SHOWCASE_APPROVER_EMAIL'),
      displayName: displayName(
        env.SHOWCASE_APPROVER_DISPLAY_NAME,
        'SHOWCASE_APPROVER_DISPLAY_NAME',
      ),
      password: password(env.SHOWCASE_APPROVER_PASSWORD, 'SHOWCASE_APPROVER_PASSWORD'),
      legacyRole: 'RRHH_APROBADOR',
      tenantRole: HUGO_APROBADOR_INTEGRAL_ROLE,
      areaCapabilities: APPROVER_AREA_CAPABILITIES,
    }),
    Object.freeze({
      key: 'reader',
      email: normalizeEmail(env.SHOWCASE_READER_EMAIL, 'SHOWCASE_READER_EMAIL'),
      displayName: displayName(
        env.SHOWCASE_READER_DISPLAY_NAME,
        'SHOWCASE_READER_DISPLAY_NAME',
      ),
      password: password(env.SHOWCASE_READER_PASSWORD, 'SHOWCASE_READER_PASSWORD'),
      legacyRole: 'AUDITOR',
      tenantRole: CONSULTA_INTEGRAL_ROLE,
      areaCapabilities: Object.freeze([]),
    }),
  ]);
  if (new Set(profiles.map((profile) => profile.email)).size !== profiles.length) {
    throw new Error('Las tres identidades de acceso deben usar emails distintos');
  }
  if (new Set(profiles.map((profile) => profile.password)).size !== profiles.length) {
    throw new Error('Las tres identidades de acceso deben usar contrasenas distintas');
  }

  return Object.freeze({
    operationId,
    tenantSlug,
    reason,
    sharedMfaDestination: normalizeEmail(
      env.SHOWCASE_SHARED_MFA_DESTINATION_EMAIL,
      'SHOWCASE_SHARED_MFA_DESTINATION_EMAIL',
    ),
    employment: employmentSelector(env),
    profiles,
  });
}

export async function expectedShowcaseMigrationLedger(read = readFile) {
  const entries = [];
  for (const [version, url] of MIGRATION_FILES) {
    const sql = await read(url, 'utf8');
    entries.push(Object.freeze({
      version,
      checksum: createHash('sha256').update(String(sql)).digest('hex'),
    }));
  }
  return Object.freeze(entries);
}

function exactSet(actual, expected, label) {
  const left = [...new Set((actual || []).map(String))].sort();
  const right = [...new Set((expected || []).map(String))].sort();
  if (left.length !== (actual || []).length
      || left.length !== right.length
      || left.some((value, index) => value !== right[index])) {
    throw new Error(`${label} fuera del contrato exacto`);
  }
}

export function validateShowcaseRoleContracts(rows, conflicts = []) {
  const roles = Array.isArray(rows) ? rows : [];
  exactSet(roles.map((row) => row.roleKey), Object.keys(ROLE_CONTRACTS), 'roles requeridos');
  for (const row of roles) {
    const contract = ROLE_CONTRACTS[row.roleKey];
    if (!contract || row.scopeKind !== contract.scopeKind || row.systemManaged !== true) {
      throw new Error(`rol ${row.roleKey || 'desconocido'} fuera de contrato`);
    }
    exactSet(row.capabilities, contract.capabilities, `capacidades ${row.roleKey}`);
  }
  if ((conflicts || []).length) throw new Error('Los perfiles de muestra contienen conflicto SoD');
  return true;
}

async function verifyMigrationLedger(client, expected) {
  const installed = await client.query(`
    /* showcase:migration-ledger */
    SELECT version, checksum_sha256 AS checksum
    FROM schema_migrations
    WHERE version = ANY($1::text[])
    ORDER BY version
  `, [expected.map((entry) => entry.version)]);
  const byVersion = new Map((installed.rows || []).map((entry) => [
    String(entry.version), String(entry.checksum || '').trim().toLowerCase(),
  ]));
  for (const entry of expected) {
    if (byVersion.get(entry.version) !== entry.checksum) {
      throw new Error(`Migracion ausente o con drift: ${entry.version}`);
    }
  }
  if (byVersion.size !== expected.length) {
    throw new Error('El ledger de migraciones requerido contiene duplicados o faltantes');
  }
}

async function verifyRoles(client) {
  const roleKeys = Object.keys(ROLE_CONTRACTS);
  const roles = await client.query(`
    /* showcase:role-contracts */
    SELECT role.role_key AS "roleKey", role.scope_kind AS "scopeKind",
      role.system_managed AS "systemManaged",
      COALESCE(array_agg(mapping.capability_key ORDER BY mapping.capability_key)
        FILTER (WHERE mapping.capability_key IS NOT NULL), ARRAY[]::varchar[]) AS capabilities
    FROM iam_role role
    LEFT JOIN iam_role_capability mapping ON mapping.role_key = role.role_key
    WHERE role.role_key = ANY($1::varchar[])
    GROUP BY role.role_key, role.scope_kind, role.system_managed
    ORDER BY role.role_key
  `, [roleKeys]);
  const conflicts = await client.query(`
    /* showcase:role-conflicts */
    SELECT left_grant.role_key AS "roleKey",
      conflict.capability_key AS "capabilityKey",
      conflict.conflicts_with_key AS "conflictsWithKey"
    FROM iam_capability_conflict conflict
    JOIN iam_role_capability left_grant
      ON left_grant.capability_key = conflict.capability_key
    JOIN iam_role_capability right_grant
      ON right_grant.role_key = left_grant.role_key
     AND right_grant.capability_key = conflict.conflicts_with_key
    WHERE left_grant.role_key = ANY($1::varchar[])
  `, [roleKeys]);
  validateShowcaseRoleContracts(roles.rows, conflicts.rows);
}

function safeCommandMaterial(config, commandPepper) {
  if (typeof commandPepper !== 'string' || Buffer.byteLength(commandPepper, 'utf8') < 32) {
    throw new Error('No hay pepper valido para ligar el comando de provisionamiento');
  }
  const opaqueReference = (label, value) => createHmac('sha256', commandPepper)
    .update(`institutional-showcase-reference|${label}|${String(value)}`)
    .digest('hex');
  const employmentReference = config.employment.kind === 'contract_id'
    ? config.employment.contractId
    : `${config.employment.companyId}|${config.employment.legajo}`;
  return {
    contract: 'institutional-showcase-provision-v1',
    operationId: config.operationId,
    tenantSlug: config.tenantSlug,
    reasonRef: opaqueReference('reason', config.reason),
    profiles: config.profiles.map((profile) => ({
      key: profile.key,
      identityRef: opaqueReference(`${profile.key}:email`, profile.email),
      displayNameRef: opaqueReference(`${profile.key}:display-name`, profile.displayName),
      credentialRef: opaqueReference(`${profile.key}:password`, profile.password),
      tenantRole: profile.tenantRole,
      areaCapabilities: [...profile.areaCapabilities],
    })),
    approverEmploymentSelector: config.employment.kind,
    approverEmploymentRef: opaqueReference('approver:employment', employmentReference),
    passwordRotationRequested: true,
    sharedMfaFactorRequested: true,
    sharedMfaDestinationRef: opaqueReference('shared-mfa-destination', config.sharedMfaDestination),
  };
}

function showcaseEmailFactor(config, profile, secrets, factorMaterial) {
  return factorMaterial({
    userEmail: profile.email,
    destinationEmail: config.sharedMfaDestination,
    reason: `${config.reason} [operacion ${config.operationId}]`,
    suppliedIdempotencyKey: '',
  }, secrets);
}

export async function prepareShowcaseProvisionMaterials(config, env = process.env, options = {}) {
  const hashPassword = options.hashPassword ?? hashInternalPassword;
  const factorMaterial = options.factorMaterial ?? emailMfaFactorProvisionMaterial;
  const secrets = options.secrets ?? emailFactorSecrets(env);
  const prepared = [];
  for (const profile of config.profiles) {
    const passwordHash = await hashPassword(profile.password);
    if (!String(passwordHash).startsWith('scrypt$')) {
      throw new Error('El hasher de credenciales no devolvio el contrato scrypt');
    }
    const emailFactor = showcaseEmailFactor(config, profile, secrets, factorMaterial);
    prepared.push(Object.freeze({
      key: profile.key,
      email: profile.email,
      displayName: profile.displayName,
      legacyRole: profile.legacyRole,
      tenantRole: profile.tenantRole,
      areaCapabilities: profile.areaCapabilities,
      passwordHash,
      emailFactor,
    }));
  }
  return Object.freeze(prepared);
}

async function resolveTenant(client, tenantSlug) {
  const result = await client.query(`
    /* showcase:tenant-scope */
    SELECT tenant.id AS "tenantId", tenant.slug AS "tenantSlug",
      binding.id AS "sourceBindingId", binding.source_database AS "sourceDatabase",
      binding.source_company_id AS "sourceCompanyId",
      policy.certified_release_sha AS "certifiedReleaseSha"
    FROM platform_tenant tenant
    JOIN tenant_identity_policy policy
      ON policy.tenant_id = tenant.id
     AND policy.tenant_data_plane_ready IS TRUE
     AND policy.certified_release_sha IS NOT NULL
    JOIN platform_tenant_source_binding binding
      ON binding.id = policy.certified_source_binding_id
     AND binding.tenant_id = tenant.id
     AND binding.source_system = 'GRH'
     AND binding.verified IS TRUE
    WHERE lower(tenant.slug) = lower($1) AND tenant.status = 'active'
    FOR SHARE OF tenant, policy, binding
  `, [tenantSlug]);
  if (result.rowCount !== 1) {
    throw new Error('El tenant debe resolver exactamente un binding GRH certificado y activo');
  }
  const row = result.rows[0];
  if (!POSTGRES_UUID.test(String(row.tenantId || ''))
      || !POSTGRES_UUID.test(String(row.sourceBindingId || ''))
      || !Number.isSafeInteger(Number(row.sourceCompanyId))
      || Number(row.sourceCompanyId) < 1
      || !/^[a-f0-9]{40}$/.test(String(row.certifiedReleaseSha || ''))) {
    throw new Error('El binding certificado del tenant es invalido');
  }
  return Object.freeze({ ...row, sourceCompanyId: Number(row.sourceCompanyId) });
}

async function replayResult(client, config, commandHash) {
  const result = await client.query(`
    /* showcase:operation-replay */
    SELECT command, command_hash AS "commandHash", result
    FROM tenant_iam_event
    WHERE lower(actor_user_email) = lower($1) AND idempotency_key = $2::uuid
    FOR SHARE
  `, [config.profiles[0].email, config.operationId]);
  if (!result.rowCount) return null;
  if (result.rowCount !== 1
      || result.rows[0].command !== SHOWCASE_PROVISION_COMMAND
      || String(result.rows[0].commandHash || '').trim() !== commandHash) {
    throw new Error('SHOWCASE_PROVISION_OPERATION_ID fue reutilizado con otro contenido');
  }
  const safe = result.rows[0].result;
  if (!safe || Number(safe.profileCount) !== 3 || Number(safe.membershipCount) !== 3
      || safe.credentialsManaged !== true || safe.approverEmploymentLinked !== true
      || safe.emailFirstFactorReady !== true || safe.replayed !== false) {
    throw new Error('La evidencia de replay del provisionamiento es invalida');
  }
  return Object.freeze({ ...safe });
}

async function resolveEmployment(client, selector, tenant) {
  if (selector.kind === 'legacy_key' && selector.companyId !== tenant.sourceCompanyId) {
    throw new Error('SHOWCASE_APPROVER_COMPANY_ID no coincide con el binding GRH certificado');
  }
  const parameters = selector.kind === 'contract_id'
    ? [selector.contractId, tenant.sourceCompanyId, tenant.sourceDatabase]
    : [selector.legajo, selector.companyId, tenant.sourceDatabase];
  const predicate = selector.kind === 'contract_id'
    ? 'contract.id = $1::uuid AND contract.legacy_company_id = $2'
    : 'contract.legacy_legajo = $1 AND contract.legacy_company_id = $2';
  const result = await client.query(`
    /* showcase:approver-employment */
    SELECT contract.id AS "employmentContractId",
      contract.legacy_company_id AS "sourceCompanyId"
    FROM employment_contract contract
    JOIN source_import_batch batch
      ON batch.id = contract.source_batch_id
     AND batch.source_system = 'GRH'
     AND batch.source_database = $3
     AND batch.validation_state = 'published'
    WHERE ${predicate}
      AND contract.source_system = 'GRH'
      AND contract.status = 'active'
    FOR SHARE OF contract, batch
  `, parameters);
  if (result.rowCount !== 1
      || !POSTGRES_UUID.test(String(result.rows[0]?.employmentContractId || ''))) {
    throw new Error('El vinculo laboral del aprobador no es unico, activo o pertenece al GRH certificado');
  }
  return Object.freeze({
    employmentContractId: String(result.rows[0].employmentContractId).toLowerCase(),
    sourceCompanyId: Number(result.rows[0].sourceCompanyId),
  });
}

async function upsertManagedUser(client, profile, ownerEmail) {
  const existing = await client.query(`
    /* showcase:user-lock */
    SELECT email FROM internal_users WHERE lower(email) = lower($1) FOR UPDATE
  `, [profile.email]);
  if (existing.rowCount > 1) throw new Error('La identidad interna no es unica');
  let user;
  if (!existing.rowCount) {
    user = await client.query(`
      /* showcase:user-insert */
      INSERT INTO internal_users (
        email, display_name, role, password_hash, active, auth_mode, identity_version,
        updated_at
      ) VALUES ($1, $2, $3, NULL, true, 'managed', 1, clock_timestamp())
      RETURNING email, identity_version AS "identityVersion"
    `, [profile.email, profile.displayName, profile.legacyRole]);
  } else {
    user = await client.query(`
      /* showcase:user-update */
      UPDATE internal_users SET
        display_name = $2, role = $3, password_hash = NULL,
        active = true, auth_mode = 'managed', identity_version = identity_version + 1,
        updated_at = clock_timestamp()
      WHERE email = $1
      RETURNING email, identity_version AS "identityVersion"
    `, [existing.rows[0].email, profile.displayName, profile.legacyRole]);
  }
  if (user.rowCount !== 1) throw new Error('No se pudo persistir una identidad managed');
  const canonicalEmail = user.rows[0].email;
  const credential = await client.query(`
    /* showcase:credential-upsert */
    INSERT INTO tenant_identity_password_credential (
      user_email, password_hash, version, changed_at
    ) VALUES ($1, $2, 1, clock_timestamp())
    ON CONFLICT (user_email) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      version = tenant_identity_password_credential.version + 1,
      changed_at = clock_timestamp()
    RETURNING version
  `, [canonicalEmail, profile.passwordHash]);
  if (credential.rowCount !== 1 || Number(credential.rows[0]?.version) < 1) {
    throw new Error('No se pudo persistir la credencial managed');
  }
  await client.query(`
    /* showcase:session-revoke */
    UPDATE tenant_identity_session SET
      status = 'revoked', revoked_at = clock_timestamp(),
      revoked_by_user_email = $2, version = version + 1
    WHERE lower(user_email) = lower($1) AND status = 'active'
  `, [canonicalEmail, ownerEmail || canonicalEmail]);
  return Object.freeze({
    ...profile,
    email: canonicalEmail,
    identityVersion: Number(user.rows[0].identityVersion),
    credentialVersion: Number(credential.rows[0].version),
  });
}

async function ensureOwnerPlatformRole(client, ownerEmail) {
  const current = await client.query(`
    /* showcase:owner-role-lock */
    SELECT active, version FROM platform_user_role
    WHERE lower(user_email) = lower($1) AND role_key = 'PLATFORM_OWNER'
    FOR UPDATE
  `, [ownerEmail]);
  if (current.rowCount > 1) throw new Error('La asignacion PLATFORM_OWNER no es unica');
  if (!current.rowCount) {
    await client.query(`
      /* showcase:owner-role-insert */
      INSERT INTO platform_user_role (
        user_email, role_key, active, granted_by_user_email, version
      ) VALUES ($1, 'PLATFORM_OWNER', true, $1, 1)
    `, [ownerEmail]);
  } else if (current.rows[0].active !== true) {
    await client.query(`
      /* showcase:owner-role-reactivate */
      UPDATE platform_user_role SET
        active = true, granted_by_user_email = $1, granted_at = clock_timestamp(),
        revoked_at = NULL, revoked_by_user_email = NULL, version = version + 1
      WHERE lower(user_email) = lower($1) AND role_key = 'PLATFORM_OWNER'
    `, [ownerEmail]);
  }
}

async function removeExtraOwnerPlatformAuthority(client, ownerEmail) {
  await client.query(`
    /* showcase:owner-extra-platform-revoke */
    UPDATE platform_user_role SET
      active = false, revoked_at = clock_timestamp(), revoked_by_user_email = $1,
      version = version + 1
    WHERE lower(user_email) = lower($1)
      AND role_key <> 'PLATFORM_OWNER' AND active IS TRUE
  `, [ownerEmail]);
}

async function removePlatformAuthority(client, profileEmail, ownerEmail) {
  await client.query(`
    /* showcase:non-owner-platform-revoke */
    UPDATE platform_user_role SET
      active = false, revoked_at = clock_timestamp(), revoked_by_user_email = $2,
      version = version + 1
    WHERE lower(user_email) = lower($1) AND active IS TRUE
  `, [profileEmail, ownerEmail]);
}

async function upsertMembership(client, tenant, profile, ownerEmail) {
  const current = await client.query(`
    /* showcase:membership-lock */
    SELECT id, status, role_key AS "roleKey", version
    FROM tenant_membership
    WHERE tenant_id = $1::uuid AND lower(user_email) = lower($2)
    FOR UPDATE
  `, [tenant.tenantId, profile.email]);
  if (current.rowCount > 1) throw new Error('La membresia tenant no es unica');
  let result;
  if (!current.rowCount) {
    result = await client.query(`
      /* showcase:membership-insert */
      INSERT INTO tenant_membership (
        tenant_id, user_email, role_key, status, invited_by_user_email,
        activated_at, suspended_at, updated_at
      ) VALUES ($1::uuid, $2, $3, 'active', $4, clock_timestamp(), NULL, clock_timestamp())
      RETURNING id, version
    `, [tenant.tenantId, profile.email, profile.tenantRole, ownerEmail]);
  } else {
    result = await client.query(`
      /* showcase:membership-update */
      UPDATE tenant_membership SET
        role_key = $2, status = 'active',
        activated_at = COALESCE(activated_at, clock_timestamp()),
        suspended_at = NULL, version = version + 1, updated_at = clock_timestamp()
      WHERE id = $1::uuid
      RETURNING id, version
    `, [current.rows[0].id, profile.tenantRole]);
  }
  if (result.rowCount !== 1 || !POSTGRES_UUID.test(String(result.rows[0]?.id || ''))) {
    throw new Error('No se pudo persistir la membresia tenant');
  }
  await client.query(`
    /* showcase:authority-upsert */
    INSERT INTO tenant_action_authority (membership_id, tenant_id)
    VALUES ($1::uuid, $2::uuid)
    ON CONFLICT (membership_id) DO NOTHING
  `, [result.rows[0].id, tenant.tenantId]);
  await client.query(`
    /* showcase:override-clear */
    DELETE FROM tenant_membership_capability_override WHERE membership_id = $1::uuid
  `, [result.rows[0].id]);
  return Object.freeze({
    ...profile,
    membershipId: String(result.rows[0].id).toLowerCase(),
    membershipVersion: Number(result.rows[0].version),
  });
}

async function linkApproverEmployment(client, tenant, profile, employment, ownerEmail) {
  const active = await client.query(`
    /* showcase:employment-link-lock */
    SELECT id, source_binding_id AS "sourceBindingId",
      employment_contract_id AS "employmentContractId"
    FROM tenant_action_employment_link
    WHERE membership_id = $1::uuid AND tenant_id = $2::uuid AND active IS TRUE
    FOR UPDATE
  `, [profile.membershipId, tenant.tenantId]);
  if (active.rowCount > 1) throw new Error('El aprobador tiene mas de un vinculo laboral activo');
  const exact = active.rowCount === 1
    && String(active.rows[0].sourceBindingId).toLowerCase() === tenant.sourceBindingId.toLowerCase()
    && String(active.rows[0].employmentContractId).toLowerCase()
      === employment.employmentContractId;
  if (!exact && active.rowCount === 1) {
    await client.query(`
      /* showcase:employment-link-revoke */
      UPDATE tenant_action_employment_link SET
        active = false, revoked_at = clock_timestamp(), updated_at = clock_timestamp()
      WHERE id = $1::uuid
    `, [active.rows[0].id]);
  }
  if (!exact) {
    await client.query(`
      /* showcase:employment-link-insert */
      INSERT INTO tenant_action_employment_link (
        membership_id, tenant_id, source_binding_id, employment_contract_id,
        active, linked_by_user_email
      ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, true, $5)
    `, [
      profile.membershipId,
      tenant.tenantId,
      tenant.sourceBindingId,
      employment.employmentContractId,
      ownerEmail,
    ]);
  }
}

async function syncAreaScopes(client, tenant, profile, ownerEmail) {
  await client.query(`
    /* showcase:scope-revoke */
    UPDATE tenant_action_area_scope SET
      active = false, revoked_at = clock_timestamp(), updated_at = clock_timestamp()
    WHERE membership_id = $1::uuid AND active IS TRUE
  `, [profile.membershipId]);
  for (const capability of profile.areaCapabilities) {
    const existing = await client.query(`
      /* showcase:scope-lock */
      SELECT id FROM tenant_action_area_scope
      WHERE membership_id = $1::uuid
        AND capability_key = $2
        AND source_binding_id = $3::uuid
        AND scope_level = 'company'
        AND organization_unit_source_id IS NULL
        AND sector_source_id IS NULL
      FOR UPDATE
    `, [profile.membershipId, capability, tenant.sourceBindingId]);
    if (existing.rowCount > 1) throw new Error('El scope institucional no es unico');
    if (existing.rowCount) {
      await client.query(`
        /* showcase:scope-reactivate */
        UPDATE tenant_action_area_scope SET
          tenant_id = $2::uuid, company_id = $3, active = true,
          granted_by_user_email = $4, granted_at = clock_timestamp(),
          revoked_at = NULL, updated_at = clock_timestamp()
        WHERE id = $1::uuid
      `, [existing.rows[0].id, tenant.tenantId, tenant.sourceCompanyId, ownerEmail]);
    } else {
      await client.query(`
        /* showcase:scope-insert */
        INSERT INTO tenant_action_area_scope (
          membership_id, tenant_id, source_binding_id, capability_key,
          scope_level, company_id, organization_unit_source_id, sector_source_id,
          active, granted_by_user_email
        ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'company', $5, NULL, NULL, true, $6)
      `, [
        profile.membershipId,
        tenant.tenantId,
        tenant.sourceBindingId,
        capability,
        tenant.sourceCompanyId,
        ownerEmail,
      ]);
    }
  }
}

function validateEmailFactorResult(value) {
  const result = value && typeof value === 'object' ? value : null;
  if (!result || !POSTGRES_UUID.test(String(result.id || ''))
      || !['pending', 'verified'].includes(result.status)
      || !Number.isSafeInteger(Number(result.version))
      || Number(result.version) < 1
      || typeof result.replayed !== 'boolean') {
    throw new Error('La funcion owner-only no devolvio un factor email verificable');
  }
  return Object.freeze({
    status: result.status,
    version: Number(result.version),
    replayed: result.replayed,
  });
}

async function provisionEmailFactor(client, profile) {
  const factor = profile.emailFactor;
  const result = await client.query(`
    /* showcase:email-factor-provision */
    SELECT tenant_identity_provision_email_factor_v1(
      $1, $2, $3, $4, $5::uuid
    ) AS result
  `, [
    profile.email,
    factor.destinationCiphertext,
    factor.destinationHash,
    factor.reasonHash,
    factor.idempotencyKey,
  ]);
  if (result.rowCount !== 1) throw new Error('No se pudo preparar el factor email');
  return validateEmailFactorResult(result.rows[0]?.result);
}

function rows(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

async function collectFinalEvidence(client, tenant, profiles, employment) {
  const emails = profiles.map((profile) => profile.email);
  const users = await client.query(`
    /* showcase:final-users */
    SELECT lower(users.email) AS email, users.display_name AS "displayName",
      users.role AS "legacyRole", users.active, users.auth_mode AS "authMode",
      users.password_hash AS "legacyPasswordHash", users.identity_version AS "identityVersion",
      credential.password_hash AS "managedPasswordHash",
      credential.version AS "credentialVersion"
    FROM internal_users users
    JOIN tenant_identity_password_credential credential
      ON lower(credential.user_email) = lower(users.email)
    WHERE lower(users.email) = ANY($1::text[])
    ORDER BY lower(users.email)
  `, [emails]);
  const platformRoles = await client.query(`
    /* showcase:final-platform-roles */
    SELECT lower(user_email) AS email, role_key AS "roleKey"
    FROM platform_user_role
    WHERE lower(user_email) = ANY($1::text[]) AND active IS TRUE
    ORDER BY lower(user_email), role_key
  `, [emails]);
  const memberships = await client.query(`
    /* showcase:final-memberships */
    SELECT lower(user_email) AS email, id AS "membershipId",
      role_key AS "roleKey", status
    FROM tenant_membership
    WHERE tenant_id = $1::uuid AND lower(user_email) = ANY($2::text[])
    ORDER BY lower(user_email)
  `, [tenant.tenantId, emails]);
  const overrides = await client.query(`
    /* showcase:final-overrides */
    SELECT count(*)::integer AS count
    FROM tenant_membership_capability_override override_row
    JOIN tenant_membership membership ON membership.id = override_row.membership_id
    WHERE membership.tenant_id = $1::uuid
      AND lower(membership.user_email) = ANY($2::text[])
  `, [tenant.tenantId, emails]);
  const links = await client.query(`
    /* showcase:final-employment */
    SELECT lower(membership.user_email) AS email,
      link.employment_contract_id AS "employmentContractId"
    FROM tenant_action_employment_link link
    JOIN tenant_membership membership ON membership.id = link.membership_id
    WHERE link.tenant_id = $1::uuid AND link.active IS TRUE
      AND lower(membership.user_email) = ANY($2::text[])
  `, [tenant.tenantId, emails]);
  const scopes = await client.query(`
    /* showcase:final-scopes */
    SELECT lower(membership.user_email) AS email,
      scope.capability_key AS "capabilityKey", scope.scope_level AS "scopeLevel",
      scope.source_binding_id AS "sourceBindingId", scope.company_id AS "companyId"
    FROM tenant_action_area_scope scope
    JOIN tenant_membership membership ON membership.id = scope.membership_id
    WHERE scope.tenant_id = $1::uuid AND scope.active IS TRUE
      AND lower(membership.user_email) = ANY($2::text[])
    ORDER BY lower(membership.user_email), scope.capability_key
  `, [tenant.tenantId, emails]);
  const factors = await client.query(`
    /* showcase:final-email-factors */
    SELECT lower(user_email) AS email, destination_hash AS "destinationHash", status
    FROM tenant_identity_email_factor
    WHERE lower(user_email) = ANY($1::text[]) AND status IN ('pending', 'verified')
    ORDER BY lower(user_email)
  `, [emails]);
  const activeSessions = await client.query(`
    /* showcase:final-active-sessions */
    SELECT count(*)::integer AS count
    FROM tenant_identity_session
    WHERE lower(user_email) = ANY($1::text[]) AND status = 'active'
  `, [emails]);
  return {
    users: rows(users),
    platformRoles: rows(platformRoles),
    memberships: rows(memberships),
    overrides: Number(rows(overrides)[0]?.count),
    links: rows(links),
    scopes: rows(scopes),
    factors: rows(factors),
    activeSessions: Number(rows(activeSessions)[0]?.count),
    employment,
  };
}

export function validateShowcaseFinalEvidence(evidence, tenant, profiles) {
  const emails = profiles.map((profile) => profile.email.toLowerCase());
  exactSet((evidence.users || []).map((row) => row.email), emails, 'identidades managed');
  for (const row of evidence.users || []) {
    const profile = profiles.find((candidate) => candidate.email.toLowerCase() === row.email);
    if (row.active !== true || row.authMode !== 'managed' || row.legacyPasswordHash !== null
        || !profile || row.displayName !== profile.displayName || row.legacyRole !== profile.legacyRole
        || row.managedPasswordHash !== profile.passwordHash
        || !String(row.managedPasswordHash || '').startsWith('scrypt$')
        || Number(row.identityVersion) < 1 || Number(row.credentialVersion) < 1) {
      throw new Error('Una identidad no quedo activa con credencial managed');
    }
  }
  if (evidence.activeSessions !== 0) {
    throw new Error('Persistieron sesiones activas previas a la rotacion');
  }
  const owner = profiles.find((profile) => profile.key === 'owner');
  const approver = profiles.find((profile) => profile.key === 'approver');
  const reader = profiles.find((profile) => profile.key === 'reader');
  const ownerPlatformRoles = (evidence.platformRoles || []).filter(
    (row) => row.email === owner.email.toLowerCase(),
  );
  exactSet(
    ownerPlatformRoles.map((row) => row.roleKey),
    ['PLATFORM_OWNER'],
    'autoridad global del owner',
  );
  if ((evidence.platformRoles || []).some(
    (row) => [approver.email.toLowerCase(), reader.email.toLowerCase()].includes(row.email),
  )) {
    throw new Error('El aprobador o la consulta conservan autoridad global');
  }
  exactSet(
    (evidence.memberships || []).map((row) => `${row.email}|${row.roleKey}|${row.status}`),
    profiles.map((profile) => `${profile.email.toLowerCase()}|${profile.tenantRole}|active`),
    'membresias tenant',
  );
  if (evidence.overrides !== 0) throw new Error('Persistieron overrides fuera de los perfiles');
  const approverLinks = (evidence.links || []).filter(
    (row) => row.email === approver.email.toLowerCase(),
  );
  if (approverLinks.length !== 1
      || String(approverLinks[0].employmentContractId).toLowerCase()
        !== evidence.employment.employmentContractId) {
    throw new Error('El vinculo laboral del aprobador no quedo exacto');
  }
  for (const [profile, expected] of [
    [owner, OWNER_AREA_CAPABILITIES],
    [approver, APPROVER_AREA_CAPABILITIES],
    [reader, []],
  ]) {
    const matching = (evidence.scopes || []).filter(
      (scope) => scope.email === profile.email.toLowerCase(),
    );
    exactSet(matching.map((scope) => scope.capabilityKey), expected, `scopes ${profile.key}`);
    if (matching.some((scope) => scope.scopeLevel !== 'company'
        || String(scope.sourceBindingId).toLowerCase() !== tenant.sourceBindingId.toLowerCase()
        || Number(scope.companyId) !== tenant.sourceCompanyId)) {
      throw new Error(`scope ${profile.key} fuera del binding certificado`);
    }
  }
  exactSet((evidence.factors || []).map((row) => row.email), emails, 'factores email');
  const destinationHashes = new Set((evidence.factors || []).map((row) => row.destinationHash));
  const expectedDestinationHash = profiles[0]?.emailFactor?.destinationHash;
  if (!expectedDestinationHash || destinationHashes.size !== 1
      || !destinationHashes.has(expectedDestinationHash)
      || (evidence.factors || []).some((row) => !['pending', 'verified'].includes(row.status))) {
    throw new Error('Los factores email no comparten un unico destino cifrado verificable');
  }
  return Object.freeze({
    profileCount: 3,
    membershipCount: 3,
    credentialsManaged: true,
    platformOwnerReady: true,
    approverEmploymentLinked: true,
    approverScopeCount: APPROVER_AREA_CAPABILITIES.length,
    ownerOperationalScopeCount: OWNER_AREA_CAPABILITIES.length,
    readerReadOnly: true,
    emailFactorsPrepared: 3,
    emailFirstFactorReady: true,
    replayed: false,
  });
}

async function validateShowcaseReplayState(
  client,
  config,
  tenant,
  employment,
  storedResult,
  secrets,
  options,
) {
  const factorMaterial = options.factorMaterial ?? emailMfaFactorProvisionMaterial;
  const verifyPassword = options.verifyPassword ?? verifyInternalPassword;
  const replayProfiles = config.profiles.map((profile) => ({
    ...profile,
    emailFactor: showcaseEmailFactor(config, profile, secrets, factorMaterial),
  }));
  const evidence = await collectFinalEvidence(client, tenant, replayProfiles, employment);
  const usersByEmail = new Map(
    evidence.users.map((row) => [String(row.email || '').toLowerCase(), row]),
  );
  const validatedProfiles = [];
  for (const profile of replayProfiles) {
    const user = usersByEmail.get(profile.email.toLowerCase());
    let passwordMatches = false;
    try {
      passwordMatches = Boolean(
        user && await verifyPassword(profile.password, user.managedPasswordHash),
      );
    } catch {
      passwordMatches = false;
    }
    if (!passwordMatches) {
      throw new Error('La credencial actual no coincide con el replay solicitado');
    }
    validatedProfiles.push(Object.freeze({
      ...profile,
      passwordHash: user.managedPasswordHash,
    }));
  }
  const currentResult = validateShowcaseFinalEvidence(
    evidence,
    tenant,
    validatedProfiles,
  );
  if (stableJson(currentResult) !== stableJson(storedResult)) {
    throw new Error('El estado actual difiere de la evidencia historica del replay');
  }
  return Object.freeze({ ...currentResult, replayed: true });
}

async function appendAuditEvent(client, config, tenant, owner, safeResult, commandHash) {
  const result = await client.query(`
    /* showcase:audit-event */
    INSERT INTO tenant_iam_event (
      actor_user_email, tenant_id, membership_id, command, target_type, target_id,
      idempotency_key, command_hash, result
    ) VALUES (
      $1, $2::uuid, $3::uuid, $4, 'institutional_showcase', $5,
      $6::uuid, $7, $8::jsonb
    )
    RETURNING id
  `, [
    owner.email,
    tenant.tenantId,
    owner.membershipId,
    SHOWCASE_PROVISION_COMMAND,
    config.operationId,
    config.operationId,
    commandHash,
    JSON.stringify(safeResult),
  ]);
  if (result.rowCount !== 1 || Number(result.rows[0]?.id) < 1) {
    throw new Error('No se pudo registrar la evidencia append-only del provisionamiento');
  }
}

export async function provisionInstitutionalShowcaseUsers(options = {}) {
  const argv = options.argv ?? process.argv;
  const env = options.env ?? process.env;
  const config = institutionalShowcaseConfiguration(env);
  const commandPepper = showcaseCommandPepper(env);
  const secrets = options.secrets ?? emailFactorSecrets(env);
  const target = resolvePlatformOwnerOperationalIntegralTarget(argv, env);
  const databaseUrl = directCanonicalDatabaseUrl(argv, env);
  if (databaseUrl !== target.databaseUrl) {
    throw new Error('El target canonico cambio durante el preflight');
  }
  const expectedMigrations = await expectedShowcaseMigrationLedger(options.readFile ?? readFile);
  const client = options.clientFactory
    ? options.clientFactory(databaseUrl)
    : new Client({ connectionString: databaseUrl });
  const verifyProfiles = options.verifyProfiles
    ?? verifyInstitutionalAccessProfilesFinalState;
  const verifyMfaAcl = options.verifyMfaAcl ?? verifyEmailOtpMfaFinalAcl;
  const verifyEmailFirstFactor = options.verifyEmailFirstFactor
    ?? verifyEmailFirstFactorFinalState;
  const verifyOwnerOperationalIntegral = options.verifyOwnerOperationalIntegral
    ?? verifyPlatformOwnerOperationalIntegralFinalState;
  const commandHash = createHash('sha256')
    .update(stableJson(safeCommandMaterial(config, commandPepper)))
    .digest('hex');

  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      SELECT pg_advisory_xact_lock(
        hashtext('municipio-junin-friendly:institutional-showcase-provision')
      )
    `);
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('PLATFORM_OWNER:GOVERNANCE', 12012))",
    );
    await verifyMigrationLedger(client, expectedMigrations);
    await verifyProfiles(client);
    await verifyMfaAcl(client);
    await verifyEmailFirstFactor(client);
    await verifyOwnerOperationalIntegral(client);
    await verifyRoles(client);
    const tenant = await resolveTenant(client, config.tenantSlug);
    const employment = await resolveEmployment(client, config.employment, tenant);
    const replay = await replayResult(client, config, commandHash);
    if (replay) {
      const replayValidated = await validateShowcaseReplayState(
        client, config, tenant, employment, replay, secrets, options,
      );
      await client.query('COMMIT');
      return Object.freeze({ ...replayValidated, targetMode: target.mode });
    }

    const prepared = await prepareShowcaseProvisionMaterials(
      config, env, { ...options, secrets },
    );
    const profiles = [];
    let ownerEmail = prepared[0].email;
    for (const profile of prepared) {
      const provisioned = await upsertManagedUser(
        client, profile, profile.key === 'owner' ? null : ownerEmail,
      );
      profiles.push(provisioned);
      if (profile.key === 'owner') ownerEmail = provisioned.email;
    }
    const owner = profiles.find((profile) => profile.key === 'owner');
    const approver = profiles.find((profile) => profile.key === 'approver');
    const reader = profiles.find((profile) => profile.key === 'reader');
    await ensureOwnerPlatformRole(client, owner.email);
    await removeExtraOwnerPlatformAuthority(client, owner.email);
    await removePlatformAuthority(client, approver.email, owner.email);
    await removePlatformAuthority(client, reader.email, owner.email);

    const memberships = [];
    for (const profile of profiles) {
      memberships.push(await upsertMembership(client, tenant, profile, owner.email));
    }
    const ownerMembership = memberships.find((profile) => profile.key === 'owner');
    const approverMembership = memberships.find((profile) => profile.key === 'approver');
    const readerMembership = memberships.find((profile) => profile.key === 'reader');
    await linkApproverEmployment(
      client, tenant, approverMembership, employment, owner.email,
    );
    await syncAreaScopes(client, tenant, ownerMembership, owner.email);
    await syncAreaScopes(client, tenant, approverMembership, owner.email);
    await syncAreaScopes(client, tenant, readerMembership, owner.email);

    for (const profile of memberships) {
      await provisionEmailFactor(client, profile);
    }
    await verifyProfiles(client);
    await verifyMfaAcl(client);
    await verifyEmailFirstFactor(client);
    await verifyOwnerOperationalIntegral(client);
    await verifyRoles(client);
    const evidence = await collectFinalEvidence(client, tenant, memberships, employment);
    const safeResult = validateShowcaseFinalEvidence(
      evidence, tenant, memberships,
    );
    await appendAuditEvent(
      client, config, tenant, ownerMembership, safeResult, commandHash,
    );
    await client.query('COMMIT');
    return Object.freeze({ ...safeResult, targetMode: target.mode });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main() {
  try {
    const result = await provisionInstitutionalShowcaseUsers();
    console.log(
      `perfiles institucionales: OK (${result.profileCount} identidades managed, `
        + `${result.membershipCount} membresias, ${result.emailFactorsPrepared} factores email; `
        + `replay ${result.replayed}; sin credenciales ni destinos emitidos)`,
    );
  } catch (error) {
    const safeCode = /^[A-Z0-9_:-]{3,100}$/.test(String(error?.message || ''))
      ? error.message : 'PREFLIGHT_OR_PROVISION_FAILED';
    console.error(`perfiles institucionales: ERROR (${safeCode}; sin secretos emitidos)`);
    process.exitCode = 1;
  }
}

const invokedAsScript = Boolean(
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url,
);
if (invokedAsScript) await main();
