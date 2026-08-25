import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import {
  directCanonicalDatabaseUrl,
  resolveCanonicalDatabaseTarget,
} from './lib/canonical-import.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';
import {
  EMAIL_MFA_RETRY_IDEMPOTENCY_MIGRATION_VERSION,
  emailMfaRetryIdempotencyFingerprint,
  validateEmailMfaRetryIdempotencyEvidence,
} from './apply-email-mfa-retry-idempotency-schema.mjs';
import {
  EMAIL_OTP_MFA_PROTECTED_RELATIONS,
  EMAIL_OTP_MFA_RUNTIME_FUNCTION_ALLOWLIST,
  EMAIL_OTP_MFA_SIGNATURES,
  validateEmailOtpMfaEvidence,
} from './apply-email-otp-mfa-schema.mjs';
import {
  INSTITUTIONAL_ACCESS_PROFILES_MIGRATION_VERSION,
  institutionalAccessProfilesFingerprint,
  verifyInstitutionalAccessProfilesFinalState,
} from './apply-institutional-access-profiles-schema.mjs';

export const EMAIL_FIRST_FACTOR_LOGIN_MIGRATION_VERSION =
  '020-email-first-factor-login';
export const EMAIL_FIRST_FACTOR_SIGNATURES = Object.freeze({
  selector:
    'public.tenant_identity_select_login_context_email_v1(text,uuid,text,integer,jsonb)',
  facade:
    'public.tenant_identity_apply_command(text,text,uuid,text,integer,jsonb)',
});

const MIGRATION_URL = new URL(
  './migrations/020-email-first-factor-login.sql', import.meta.url,
);
const RETRY_PREREQUISITE_URL = new URL(
  './migrations/016-email-mfa-retry-idempotency.sql', import.meta.url,
);
const PROFILE_PREREQUISITE_URL = new URL(
  './migrations/019-institutional-access-profiles.sql', import.meta.url,
);
const GATEWAY_BASELINE_URL = new URL(
  './migrations/009-tenant-lifecycle-hardening.sql', import.meta.url,
);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';

function normalized(value) {
  return String(value || '').replaceAll('"', '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function exactSet(actual, expected, label) {
  const got = [...new Set(actual || [])].map(String).sort();
  const wanted = [...new Set(expected || [])].map(String).sort();
  if (JSON.stringify(got) !== JSON.stringify(wanted)) {
    throw new Error(`${label} fuera de contrato: ${JSON.stringify(got)}`);
  }
}

function functionBodyFromMigration(sql, functionName) {
  const source = String(sql || '');
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION ${functionName}(`);
  if (start < 0) throw new Error(`fuente SQL ausente para ${functionName}`);
  const bodyMarker = source.indexOf('AS $$', start);
  const bodyStart = bodyMarker < 0 ? -1 : bodyMarker + 'AS $$'.length;
  const bodyEnd = bodyStart < 0 ? -1 : source.indexOf('$$;', bodyStart);
  if (bodyStart < 0 || bodyEnd < bodyStart) {
    throw new Error(`cuerpo SQL incompleto para ${functionName}`);
  }
  return source.slice(bodyStart, bodyEnd);
}

export function emailFirstFactorLoginFingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function emailFirstFactorFunctionSourceFingerprint(value) {
  const canonical = String(value || '').replace(/\r\n?/g, '\n').trim();
  return createHash('sha256').update(canonical).digest('hex');
}

export function emailFirstFactorPolicyDecision(options = {}) {
  if (options.totpActive === true || options.emailLive === true) return 'login_mfa';
  if (options.privilegedContext === true) return 'login_enrollment';
  return 'password_session';
}

// pg_get_functiondef representa las opciones SET con `TO` y puede entrecomillar
// cada identificador, aunque pg_proc.proconfig conserve exactamente el mismo
// search_path. El validador historico 016 recibe su forma fuente con `=`.
// Canonicalizamos solo esta clausula ya corroborada tambien por safeSearchPath;
// cuerpo, SECURITY DEFINER y ACL siguen validandose sin cambios.
export function canonicalizeHistoricalPrepareDefinition(definition) {
  return String(definition || '').replace(
    /\bSET\s+search_path\s+(?:=|TO)\s+['"]?pg_catalog['"]?\s*,\s*['"]?public['"]?\s*,\s*['"]?pg_temp['"]?/gi,
    'SET search_path = pg_catalog, public, pg_temp',
  );
}

export function validateEmailFirstFactorSelectorDefinition(definition) {
  const body = normalized(definition);
  for (const token of [
    'tenant_identity_select_login_context_email_v1(',
    'security definer',
    'set search_path = pg_catalog, public, pg_temp',
    "challenge.status <> 'pending'",
    "challenge.expires_at <= now()",
    'challenge.version is distinct from p_expected_version',
    'lower(challenge.user_email) <> actor_email',
    'tenant_identity_access_payload(challenge.user_email, tenant_id_value)',
    "access_context#>>'{tenant,dataplaneready}'",
    "factor.status = 'active'",
    "factor.status in ('pending', 'verified')",
    "capability.sensitivity in ('privileged', 'restricted')",
    'if totp_factor_active or email_factor_live then',
    "set purpose = 'login_mfa'",
    "'emailmfaavailable', email_factor_live",
    'elsif privileged_context then',
    "set purpose = 'login_enrollment'",
    "raise exception 'identity_mfa_required'",
    'tenant_identity_create_session(',
    "'password'",
    "'select_login_context'",
    'insert into tenant_iam_event',
    "replay.command is distinct from 'select_login_context'",
    "replay.command_hash is distinct from p_command_hash",
  ]) {
    if (!body.includes(normalized(token))) {
      throw new Error(`selector 020 incompleto: ${token}`);
    }
  }

  const factorBranchAt = body.indexOf('if totp_factor_active or email_factor_live then');
  const enrollmentBranchAt = body.indexOf('elsif privileged_context then');
  const passwordSessionAt = body.indexOf("'password'", enrollmentBranchAt);
  if (!(factorBranchAt >= 0 && enrollmentBranchAt > factorBranchAt
      && passwordSessionAt > enrollmentBranchAt)) {
    throw new Error('selector 020 altera el orden factor -> privilegio -> password');
  }
  if (/\b(?:insert\s+into|update|delete\s+from)\s+tenant_identity_(?:email_factor|mfa_factor)\b/i.test(definition)) {
    throw new Error('selector 020 modifica factores durante la seleccion');
  }
  return true;
}

export function validateEmailFirstFactorFacadeDefinition(definition) {
  const body = normalized(definition);
  for (const token of [
    'tenant_identity_apply_command(',
    'security definer',
    'set search_path = pg_catalog, public, pg_temp',
    "p_command = 'select_login_context'",
    'tenant_identity_select_login_context_email_v1(',
    'tenant_identity_apply_command_core_009(',
    "raise exception 'identity_idempotency_reused'",
    "raise exception 'identity_platform_command_requires_v2'",
  ]) {
    if (!body.includes(normalized(token))) {
      throw new Error(`facade 020 incompleta: ${token}`);
    }
  }
  if (body.indexOf("p_command = 'select_login_context'")
      > body.indexOf('tenant_identity_apply_command_core_009(')) {
    throw new Error('facade 020 delega select_context al core anterior');
  }
  return true;
}

export function validateEmailFirstFactorMigrationSql(sql) {
  const source = String(sql || '');
  if ((source.match(/CREATE OR REPLACE FUNCTION/gi) || []).length !== 2) {
    throw new Error('migracion 020 debe definir exactamente selector y facade');
  }
  validateEmailFirstFactorSelectorDefinition(source);
  validateEmailFirstFactorFacadeDefinition(source);
  for (const token of [
    'COMMENT ON FUNCTION tenant_identity_select_login_context_email_v1',
    'COMMENT ON FUNCTION tenant_identity_apply_command',
    'FROM PUBLIC CASCADE',
    'aclexplode(COALESCE(',
    'acl.grantee <> function_row.proowner',
    'REVOKE ALL PRIVILEGES ON FUNCTION %I.%I(%s) FROM %s CASCADE',
    'GRANT EXECUTE ON FUNCTION tenant_identity_apply_command',
    'TO municontrol_actions_runtime_app',
  ]) {
    if (!normalized(source).includes(normalized(token))) {
      throw new Error(`migracion 020 incompleta: ${token}`);
    }
  }
  if (/\b(?:create|alter|drop)\s+(?:table|role|schema|database)\b/i.test(source)
      || /\bgrant\s+(?!execute\b)/i.test(source)
      || /guillen|gmail\.com|marcelo@|hugo@|admin@|\b(?:raw_code|plain_code|otp_code|password_hash)\b/i.test(source)
      || /\b(?:insert\s+into|update|delete\s+from)\s+tenant_identity_(?:email_factor|mfa_factor)\b/i.test(source)) {
    throw new Error('migracion 020 amplia esquema, ACL o material sensible');
  }
  return true;
}

export function validateEmailFirstFactorEvidence(evidence) {
  const selector = evidence?.selector;
  const facade = evidence?.facade;
  if (!selector || selector.signature !== EMAIL_FIRST_FACTOR_SIGNATURES.selector
      || selector.securityDefiner !== true || selector.ownerMatches !== true
      || selector.safeSearchPath !== true || selector.language !== 'plpgsql'
      || selector.volatility !== 'v' || selector.returnType !== 'jsonb') {
    throw new Error('selector 020 instalado fuera de contrato');
  }
  if (!facade || facade.signature !== EMAIL_FIRST_FACTOR_SIGNATURES.facade
      || facade.securityDefiner !== true || facade.ownerMatches !== true
      || facade.safeSearchPath !== true || facade.language !== 'plpgsql'
      || facade.volatility !== 'v' || facade.returnType !== 'jsonb') {
    throw new Error('facade 020 instalada fuera de contrato');
  }
  validateEmailFirstFactorSelectorDefinition(
    canonicalizeHistoricalPrepareDefinition(selector.definition),
  );
  validateEmailFirstFactorFacadeDefinition(
    canonicalizeHistoricalPrepareDefinition(facade.definition),
  );
  exactSet(selector.grants, [`${selector.owner}:EXECUTE`], 'ACL selector 020');
  exactSet(facade.grants, [
    `${facade.owner}:EXECUTE`, `${RUNTIME_ROLE}:EXECUTE`,
  ], 'ACL facade 020');
  return true;
}

async function collectEvidence(client) {
  const result = await client.query(`
    SELECT format('%s.%s(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature,
      pg_get_functiondef(function_row.oid) AS definition,
      function_row.prosecdef AS "securityDefiner",
      function_row.proowner = current_user::regrole::oid AS "ownerMatches",
      function_row.proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp']::text[]
        AS "safeSearchPath",
      language.lanname AS language,
      function_row.provolatile AS volatility,
      pg_get_function_result(function_row.oid) AS "returnType",
      owner.rolname AS owner,
      COALESCE((SELECT array_agg(COALESCE(grantee.rolname, 'PUBLIC') || ':' || acl.privilege_type
          ORDER BY COALESCE(grantee.rolname, 'PUBLIC'), acl.privilege_type)
        FROM aclexplode(COALESCE(function_row.proacl, acldefault('f', function_row.proowner))) acl
        LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee), ARRAY[]::text[]) AS grants
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    JOIN pg_language language ON language.oid = function_row.prolang
    JOIN pg_roles owner ON owner.oid = function_row.proowner
    WHERE function_row.oid IN ($1::regprocedure, $2::regprocedure)
  `, [EMAIL_FIRST_FACTOR_SIGNATURES.selector, EMAIL_FIRST_FACTOR_SIGNATURES.facade]);
  const bySignature = new Map((result.rows || []).map((entry) => [entry.signature, entry]));
  return {
    selector: bySignature.get(EMAIL_FIRST_FACTOR_SIGNATURES.selector) || null,
    facade: bySignature.get(EMAIL_FIRST_FACTOR_SIGNATURES.facade) || null,
  };
}

async function collectScopedEmailMfaEvidence(client) {
  const signatures = Object.values(EMAIL_OTP_MFA_SIGNATURES);
  const functions = await client.query(`
    SELECT format('%s.%s(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature,
      pg_get_functiondef(function_row.oid) AS definition,
      function_row.prosecdef AS "securityDefiner",
      function_row.proowner = current_user::regrole::oid AS "ownerMatches",
      function_row.proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp']::text[]
        AS "safeSearchPath",
      language.lanname AS language,
      function_row.provolatile AS volatility,
      pg_get_function_result(function_row.oid) AS "returnType",
      owner.rolname AS owner,
      COALESCE((SELECT array_agg(COALESCE(grantee.rolname, 'PUBLIC') || ':' || acl.privilege_type
          ORDER BY COALESCE(grantee.rolname, 'PUBLIC'), acl.privilege_type)
        FROM aclexplode(COALESCE(function_row.proacl, acldefault('f', function_row.proowner))) acl
        LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee), ARRAY[]::text[]) AS grants
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    JOIN pg_language language ON language.oid = function_row.prolang
    JOIN pg_roles owner ON owner.oid = function_row.proowner
    WHERE function_row.oid = ANY($1::regprocedure[])
    ORDER BY signature
  `, [signatures]);
  const relations = await client.query(`
    SELECT relation.relname AS name,
      relation.relowner = current_user::regrole::oid AS "ownerMatches",
      has_any_column_privilege($1, relation.oid, 'SELECT') AS "runtimeSelect",
      has_any_column_privilege($1, relation.oid, 'INSERT') AS "runtimeInsert",
      has_any_column_privilege($1, relation.oid, 'UPDATE') AS "runtimeUpdate",
      has_table_privilege($1, relation.oid, 'DELETE') AS "runtimeDelete",
      EXISTS (SELECT 1 FROM aclexplode(COALESCE(
          relation.relacl, acldefault('r', relation.relowner))) acl
        WHERE acl.grantee = 0) OR EXISTS (
          SELECT 1 FROM pg_attribute attribute
          CROSS JOIN LATERAL aclexplode(attribute.attacl) acl
          WHERE attribute.attrelid = relation.oid AND attribute.attnum > 0
            AND attribute.attisdropped IS FALSE AND acl.grantee = 0
        ) AS "publicAccess",
      (SELECT count(*)::integer FROM aclexplode(COALESCE(
          relation.relacl, acldefault('r', relation.relowner))) acl
        WHERE acl.grantee <> relation.relowner
          AND acl.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'))
        + (SELECT count(*)::integer FROM pg_attribute attribute
          CROSS JOIN LATERAL aclexplode(attribute.attacl) acl
          WHERE attribute.attrelid = relation.oid AND attribute.attnum > 0
            AND attribute.attisdropped IS FALSE AND acl.grantee <> relation.relowner
            AND acl.privilege_type IN ('SELECT','INSERT','UPDATE','REFERENCES'))
        AS "nonOwnerPrivilegeCount"
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relkind = 'r'
      AND relation.relname = ANY($2::text[])
    ORDER BY relation.relname
  `, [RUNTIME_ROLE, EMAIL_OTP_MFA_PROTECTED_RELATIONS]);
  const functionRows = functions.rows || [];
  return {
    functions: functionRows,
    // 015 contiene una allowlist global correspondiente a su momento historico.
    // Aqui se validan sus cuatro ACL exactas y sus dos tablas de forma focal;
    // el estado acumulado actual queda a cargo del verificador 019.
    runtimeFunctions: EMAIL_OTP_MFA_RUNTIME_FUNCTION_ALLOWLIST,
    relations: relations.rows || [],
    prepare: functionRows.find(
      (entry) => entry.signature === EMAIL_OTP_MFA_SIGNATURES.prepare,
    ) || null,
  };
}

async function verifyScopedEmailMfaPrerequisite(client) {
  const evidence = await collectScopedEmailMfaEvidence(client);
  validateEmailOtpMfaEvidence(evidence);
  validateEmailMfaRetryIdempotencyEvidence({
    prepare: evidence.prepare && {
      ...evidence.prepare,
      definition: canonicalizeHistoricalPrepareDefinition(
        evidence.prepare.definition,
      ),
    },
  });
  return true;
}

export async function verifyEmailFirstFactorFinalState(client) {
  validateEmailFirstFactorEvidence(await collectEvidence(client));
  await verifyScopedEmailMfaPrerequisite(client);
  await verifyInstitutionalAccessProfilesFinalState(client);
  return true;
}

async function verifyPrerequisiteLedger(client) {
  const prerequisites = [
    {
      version: EMAIL_MFA_RETRY_IDEMPOTENCY_MIGRATION_VERSION,
      expected: emailMfaRetryIdempotencyFingerprint(
        await readFile(RETRY_PREREQUISITE_URL, 'utf8'),
      ),
    },
    {
      version: INSTITUTIONAL_ACCESS_PROFILES_MIGRATION_VERSION,
      expected: institutionalAccessProfilesFingerprint(
        await readFile(PROFILE_PREREQUISITE_URL, 'utf8'),
      ),
    },
  ];
  for (const prerequisite of prerequisites) {
    const installed = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [prerequisite.version],
    );
    if (installed.rowCount !== 1
        || String(installed.rows[0].checksum_sha256 || '').trim() !== prerequisite.expected) {
      throw new Error(`prerequisito ausente o con drift ${prerequisite.version}`);
    }
  }
}

async function verifyBaselineFacade(client) {
  const baselineMigration = await readFile(GATEWAY_BASELINE_URL, 'utf8');
  const expectedSource = functionBodyFromMigration(
    baselineMigration, 'tenant_identity_apply_command',
  );
  const installed = await client.query(
    'SELECT prosrc FROM pg_proc WHERE oid = $1::regprocedure',
    [EMAIL_FIRST_FACTOR_SIGNATURES.facade],
  );
  if (installed.rowCount !== 1
      || emailFirstFactorFunctionSourceFingerprint(installed.rows[0].prosrc)
        !== emailFirstFactorFunctionSourceFingerprint(expectedSource)) {
    throw new Error('drift previo no ledgerado en tenant_identity_apply_command');
  }
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  validateEmailFirstFactorMigrationSql(migration);
  const fingerprint = emailFirstFactorLoginFingerprint(migration);
  const statements = splitPostgresStatements(migration);
  const args = process.argv.slice(2);
  const target = resolveCanonicalDatabaseTarget(args, process.env);
  const databaseUrl = directCanonicalDatabaseUrl(args, process.env);
  if (databaseUrl !== target.databaseUrl) {
    throw new Error('el target canonico cambio durante el preflight');
  }
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:email-first-factor-020'))",
    );
    await verifyPrerequisiteLedger(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [EMAIL_FIRST_FACTOR_LOGIN_MIGRATION_VERSION],
    );
    if (existing.rowCount
        && String(existing.rows[0].checksum_sha256 || '').trim() !== fingerprint) {
      throw new Error(`Drift detectado: ${EMAIL_FIRST_FACTOR_LOGIN_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      await verifyScopedEmailMfaPrerequisite(client);
      await verifyInstitutionalAccessProfilesFinalState(client);
      await verifyBaselineFacade(client);
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `migracion ${EMAIL_FIRST_FACTOR_LOGIN_MIGRATION_VERSION} `
              + `sentencia ${index + 1}/${statements.length}: ${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [EMAIL_FIRST_FACTOR_LOGIN_MIGRATION_VERSION, fingerprint],
      );
    }
    await verifyEmailFirstFactorFinalState(client);
    await client.query('COMMIT');
    const targetLabel = target.mode === 'production'
      ? `production:${target.branchId}` : 'isolated';
    console.log(existing.rowCount
      ? `${EMAIL_FIRST_FACTOR_LOGIN_MIGRATION_VERSION}: reapply verificado `
        + `(${targetLabel}, SHA-256 ${fingerprint})`
      : `${EMAIL_FIRST_FACTOR_LOGIN_MIGRATION_VERSION}: fresh apply `
        + `(${targetLabel}, ${statements.length} sentencias, SHA-256 ${fingerprint})`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

const invokedAsScript = Boolean(process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url);
if (invokedAsScript) await main();
