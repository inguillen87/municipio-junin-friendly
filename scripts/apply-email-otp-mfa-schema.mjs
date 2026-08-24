import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import { directIsolatedDatabaseUrl } from './lib/canonical-import.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';
import {
  GOVERNED_SOURCE_BINDING_MIGRATION_VERSION,
  GOVERNED_SOURCE_BINDING_RUNTIME_FUNCTION_ALLOWLIST,
  governedSourceBindingFingerprint,
  verifyGovernedSourceBindingFinalAcl,
} from './apply-governed-source-binding-provisioning-schema.mjs';

export const EMAIL_OTP_MFA_MIGRATION_VERSION = '015-email-otp-mfa';
const MIGRATION_URL = new URL('./migrations/015-email-otp-mfa.sql', import.meta.url);
const PREREQUISITE_URL = new URL(
  './migrations/014-governed-source-binding-provisioning.sql', import.meta.url,
);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';

export const EMAIL_OTP_MFA_SIGNATURES = Object.freeze({
  prepare: 'public.tenant_identity_prepare_email_mfa(text,uuid,text,timestamp with time zone,integer,uuid)',
  delivery: 'public.tenant_identity_mark_email_mfa_delivery(text,uuid,boolean)',
  complete: 'public.tenant_identity_complete_email_mfa(text,uuid,text,uuid,timestamp with time zone,text,text,integer,uuid,text)',
  provision: 'public.tenant_identity_provision_email_factor_v1(text,text,text,text,uuid)',
});

export const EMAIL_OTP_MFA_RUNTIME_FUNCTION_ALLOWLIST = Object.freeze([
  ...GOVERNED_SOURCE_BINDING_RUNTIME_FUNCTION_ALLOWLIST,
  EMAIL_OTP_MFA_SIGNATURES.prepare,
  EMAIL_OTP_MFA_SIGNATURES.delivery,
  EMAIL_OTP_MFA_SIGNATURES.complete,
]);

export const EMAIL_OTP_MFA_PROTECTED_RELATIONS = Object.freeze([
  'tenant_identity_email_factor',
  'tenant_identity_email_otp_challenge',
]);

function exactSet(actual, expected, label) {
  const got = [...new Set((actual || []).map(String))].sort();
  const wanted = [...new Set((expected || []).map(String))].sort();
  if (JSON.stringify(got) !== JSON.stringify(wanted)) {
    throw new Error(`${label} fuera de contrato: ${JSON.stringify(got)}`);
  }
}

function rows(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

export function emailOtpMfaFingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function validateEmailOtpMfaMigrationSql(sql) {
  const source = String(sql || '');
  const lower = source.toLowerCase();
  for (const token of [
    'create table if not exists tenant_identity_email_factor',
    'create table if not exists tenant_identity_email_otp_challenge',
    'create or replace function tenant_identity_prepare_email_mfa(',
    'create or replace function tenant_identity_mark_email_mfa_delivery(',
    'create or replace function tenant_identity_complete_email_mfa(',
    'security definer', 'set search_path = pg_catalog, public, pg_temp',
    'tenant_identity_create_session', "'recovery'", 'max_attempts', 'destination_ciphertext',
    'destination_hash', 'code_hash', 'pending_delivery', 'superseded',
  ]) {
    if (!lower.includes(token)) throw new Error(`migracion 015 incompleta: ${token}`);
  }
  if (/guillen\.marce|gmail\.com/i.test(source)) {
    throw new Error('migracion 015 no puede hardcodear destinatarios');
  }
  if (/grant\s+(?:select|insert|update|delete|truncate|references|trigger)[\s\S]{0,160}municontrol_actions_runtime_app/i.test(source)) {
    throw new Error('migracion 015 concede DML directo al runtime');
  }
  return true;
}

async function collectEvidence(client) {
  const signatures = Object.values(EMAIL_OTP_MFA_SIGNATURES);
  const functions = await client.query(`
    SELECT format('%s.%s(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature,
      function_row.prosecdef AS "securityDefiner",
      function_row.proowner = current_user::regrole::oid AS "ownerMatches",
      function_row.proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp']::text[] AS "safeSearchPath",
      owner.rolname AS owner,
      COALESCE((SELECT array_agg(COALESCE(grantee.rolname, 'PUBLIC') || ':' || acl.privilege_type
          ORDER BY COALESCE(grantee.rolname, 'PUBLIC'), acl.privilege_type)
        FROM aclexplode(COALESCE(function_row.proacl, acldefault('f', function_row.proowner))) acl
        LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee), ARRAY[]::text[]) AS grants
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    JOIN pg_roles owner ON owner.oid = function_row.proowner
    WHERE function_row.oid = ANY($1::regprocedure[])
    ORDER BY signature
  `, [signatures]);
  const runtimeFunctions = await client.query(`
    SELECT format('%s.%s(%s)', namespace.nspname, function_row.proname,
      replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    WHERE namespace.nspname = 'public' AND function_row.prosecdef IS TRUE
      AND has_function_privilege($1, function_row.oid, 'EXECUTE')
    ORDER BY signature
  `, [RUNTIME_ROLE]);
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
            AND acl.privilege_type IN ('SELECT','INSERT','UPDATE','REFERENCES')) AS "nonOwnerPrivilegeCount"
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relkind = 'r'
      AND relation.relname = ANY($2::text[])
    ORDER BY relation.relname
  `, [RUNTIME_ROLE, EMAIL_OTP_MFA_PROTECTED_RELATIONS]);
  return {
    functions: rows(functions),
    runtimeFunctions: rows(runtimeFunctions).map((row) => row.signature),
    relations: rows(relations),
  };
}

export function validateEmailOtpMfaEvidence(evidence) {
  const functions = new Map((evidence?.functions || []).map((row) => [row.signature, row]));
  exactSet(functions.keys(), Object.values(EMAIL_OTP_MFA_SIGNATURES), 'funciones 015');
  const owner = functions.get(EMAIL_OTP_MFA_SIGNATURES.prepare)?.owner;
  if (!owner) throw new Error('owner 015 ausente');
  for (const signature of Object.values(EMAIL_OTP_MFA_SIGNATURES)) {
    const entry = functions.get(signature);
    if (entry.securityDefiner !== true || entry.ownerMatches !== true || entry.safeSearchPath !== true) {
      throw new Error(`funcion 015 insegura: ${signature}`);
    }
    const expected = signature === EMAIL_OTP_MFA_SIGNATURES.provision
      ? [`${owner}:EXECUTE`] : [`${owner}:EXECUTE`, `${RUNTIME_ROLE}:EXECUTE`];
    exactSet(entry.grants, expected, `ACL ${signature}`);
  }
  exactSet(evidence?.runtimeFunctions, EMAIL_OTP_MFA_RUNTIME_FUNCTION_ALLOWLIST,
    'allowlist runtime 015');
  exactSet((evidence?.relations || []).map((row) => row.name),
    EMAIL_OTP_MFA_PROTECTED_RELATIONS, 'relaciones 015');
  for (const relation of evidence.relations) {
    if (relation.ownerMatches !== true || relation.runtimeSelect || relation.runtimeInsert
        || relation.runtimeUpdate || relation.runtimeDelete || relation.publicAccess
        || Number(relation.nonOwnerPrivilegeCount) !== 0) {
      throw new Error(`ACL de relacion 015 insegura: ${relation.name}`);
    }
  }
  return true;
}

export async function verifyEmailOtpMfaFinalAcl(client) {
  return validateEmailOtpMfaEvidence(await collectEvidence(client));
}

async function verifyPrerequisite(client) {
  const expected = governedSourceBindingFingerprint(await readFile(PREREQUISITE_URL, 'utf8'));
  const installed = await client.query(
    'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
    [GOVERNED_SOURCE_BINDING_MIGRATION_VERSION],
  );
  if (installed.rowCount !== 1
      || String(installed.rows[0].checksum_sha256 || '').trim() !== expected) {
    throw new Error(`prerequisito ausente o con drift ${GOVERNED_SOURCE_BINDING_MIGRATION_VERSION}`);
  }
}

async function verifyNoUnledgeredObjects(client) {
  const result = await client.query(`
    SELECT to_regclass('public.tenant_identity_email_factor') IS NOT NULL AS factor,
      to_regclass('public.tenant_identity_email_otp_challenge') IS NOT NULL AS challenge,
      to_regprocedure($1) IS NOT NULL AS prepare,
      to_regprocedure($2) IS NOT NULL AS delivery,
      to_regprocedure($3) IS NOT NULL AS complete,
      to_regprocedure($4) IS NOT NULL AS provision
  `, Object.values(EMAIL_OTP_MFA_SIGNATURES));
  const present = Object.entries(rows(result)[0] || {}).filter(([, value]) => value === true);
  if (present.length) throw new Error(`objetos 015 sin ledger: ${present.map(([key]) => key).join(',')}`);
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  validateEmailOtpMfaMigrationSql(migration);
  const fingerprint = emailOtpMfaFingerprint(migration);
  const statements = splitPostgresStatements(migration);
  const client = new Client({ connectionString: directIsolatedDatabaseUrl() });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:email-otp-mfa-015'))");
    await verifyPrerequisite(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [EMAIL_OTP_MFA_MIGRATION_VERSION],
    );
    if (existing.rowCount
        && String(existing.rows[0].checksum_sha256 || '').trim() !== fingerprint) {
      throw new Error(`Drift detectado: ${EMAIL_OTP_MFA_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      await verifyNoUnledgeredObjects(client);
      await verifyGovernedSourceBindingFinalAcl(client);
      for (const [index, statement] of statements.entries()) {
        try { await client.query(statement); } catch (error) {
          throw new Error(
            `migracion ${EMAIL_OTP_MFA_MIGRATION_VERSION} sentencia ${index + 1}/${statements.length}: ${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [EMAIL_OTP_MFA_MIGRATION_VERSION, fingerprint],
      );
    }
    await verifyEmailOtpMfaFinalAcl(client);
    await client.query('COMMIT');
    console.log(existing.rowCount
      ? `${EMAIL_OTP_MFA_MIGRATION_VERSION}: reapply verificado (SHA-256 ${fingerprint})`
      : `${EMAIL_OTP_MFA_MIGRATION_VERSION}: fresh apply (${statements.length} sentencias, SHA-256 ${fingerprint})`);
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
