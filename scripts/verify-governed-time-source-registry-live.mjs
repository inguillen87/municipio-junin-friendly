import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Client } from '@neondatabase/serverless';

import {
  TIME_SOURCE_MIGRATION_VERSION,
  TIME_SOURCE_RUNTIME_FUNCTION_ALLOWLIST,
  verifyTimeSourceFinalAcl,
} from './apply-governed-time-source-registry-schema.mjs';
import {
  TIME_SOURCE_CASE_TYPE,
  applyTimeSourceCommand,
  getTimeSourceBootstrap,
  listTimeSources,
  readTimeSource,
} from '../lib/internal-time-source-registry.js';

const execFile = promisify(execFileCallback);
const CONFIRMATION_FLAG = '--confirm-isolated-branch';
const DISPOSABLE_CONFIRMATION = 'DELETE_AFTER_010A_QA';
const MIGRATION_URL = new URL('./migrations/010-governed-time-source-registry.sql', import.meta.url);
const APPLIER_URL = new URL('./apply-governed-time-source-registry-schema.mjs', import.meta.url);
const LIBRARY_URL = new URL('../lib/internal-time-source-registry.js', import.meta.url);
const BACKEND_FREEZE_HASHES = Object.freeze([
  [MIGRATION_URL, '66ab3584315db1baba52f08ac7579eddbe04898fd5fa2c383f4e778a2f1a7034'],
  [APPLIER_URL, 'a791b1c5e0d1c46126bbea81b2a93633db97fe57376cb1dd0b2216d1c83ceea7'],
  [LIBRARY_URL, '0006f72874a287b8354231ca5434aabf374b445cd00f1381eed9e8042a234950'],
]);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA40 = /^[a-f0-9]{40}$/;
const SAFE_CODE = /^(?:[A-Z][A-Z0-9_]{1,63}|[0-9A-Z]{5})$/;
const QA_BRANCH_NAME = /^qa-time-source-010a-[a-z0-9](?:[a-z0-9-]{4,78}[a-z0-9])?$/;

export const EXPECTED_RUNTIME_SECURITY_DEFINERS = Object.freeze([
  ...TIME_SOURCE_RUNTIME_FUNCTION_ALLOWLIST,
]);
const EXPECTED_SECURITY_DEFINER_SET = new Set(EXPECTED_RUNTIME_SECURITY_DEFINERS);

const PROTECTED_DATA_RELATIONS = Object.freeze([
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
  'action_case',
  'action_case_event',
]);

const EXPECTED_ROLE_CAPABILITIES = Object.freeze([
  'JUNIN_TIEMPO_FUENTES_APROBADOR:time.source.approve',
  'JUNIN_TIEMPO_FUENTES_APROBADOR:time.source.audit.read',
  'JUNIN_TIEMPO_FUENTES_APROBADOR:time.source.read',
  'JUNIN_TIEMPO_FUENTES_PROPONENTE:time.source.propose',
  'JUNIN_TIEMPO_FUENTES_PROPONENTE:time.source.read',
]);
const EXPECTED_CAPABILITY_CONFLICTS = Object.freeze([
  'time.overtime.post:time.source.approve',
  'time.source.approve:time.source.propose',
]);

const DOMAIN_DEFINITIONS = Object.freeze({
  shift_assignment: ['employee_shift_day', 'employment_contract_id'],
  time_punch: ['employee_punch_event', 'employment_contract_id'],
  holiday_calendar: ['calendar_day', 'calendar_date'],
  municipal_rule_profile: ['municipal_rule_version', 'tenant_policy_key'],
  administrative_event: ['employee_administrative_event', 'employment_contract_id'],
  employment_master_reference: ['employment_contract_reference', 'employment_contract_id'],
});

class QaContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'QaContractError';
    this.code = code;
  }
}

class QaStageError extends Error {
  constructor(stage, cause) {
    super(`Fallo de QA en etapa ${stage}`, { cause });
    this.name = 'QaStageError';
    this.stage = stage;
    this.code = safeErrorCode(cause);
  }
}

function guard(condition, code, message) {
  if (!condition) throw new QaContractError(code, message);
}

function rows(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function safeErrorCode(error) {
  const value = String(error?.code || 'QA_ASSERTION_FAILED').toUpperCase();
  return SAFE_CODE.test(value) ? value : 'QA_ASSERTION_FAILED';
}

function postgresUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(String(value || ''));
  } catch {
    throw new QaContractError('QA_CONNECTION_INVALID', `${label} invalida`);
  }
  guard(['postgres:', 'postgresql:'].includes(parsed.protocol),
    'QA_CONNECTION_INVALID', `${label} no es PostgreSQL`);
  guard(parsed.username && parsed.hostname && parsed.pathname.length > 1,
    'QA_CONNECTION_INVALID', `${label} incompleta`);
  return parsed;
}

function canonicalEndpointHost(hostname) {
  return String(hostname || '').trim().toLowerCase().replace(/-pooler(?=\.)/, '');
}

function directEndpointHost(hostname) {
  return !/-pooler(?=\.)/.test(String(hostname || '').trim().toLowerCase());
}

function neonEndpointHost(hostname) {
  return /^ep-[a-z0-9-]+(?:-pooler)?\.[a-z0-9.-]+\.neon\.tech$/i.test(String(hostname || ''));
}

export function loadGovernedTimeSourceQaConfig(env = process.env, argv = process.argv.slice(2)) {
  guard(argv.includes(CONFIRMATION_FLAG), 'QA_CONFIRMATION_REQUIRED', `Falta ${CONFIRMATION_FLAG}`);
  guard(env.TIME_SOURCE_QA_DISPOSABLE_CONFIRMATION === DISPOSABLE_CONFIRMATION,
    'QA_DISPOSABLE_CONFIRMATION_REQUIRED', 'Confirmacion descartable invalida');
  guard(env.NODE_ENV !== 'production' && env.VERCEL_ENV !== 'production',
    'QA_PRODUCTION_ENVIRONMENT_FORBIDDEN', 'Entorno productivo no admite QA descartable');

  const branchId = String(env.TIME_SOURCE_QA_BRANCH_ID || '').trim();
  const branchName = String(env.TIME_SOURCE_QA_BRANCH_NAME || '').trim().toLowerCase();
  const projectId = String(env.TIME_SOURCE_QA_PROJECT_ID || '').trim();
  const qaEndpointHost = String(env.TIME_SOURCE_QA_ENDPOINT_HOST || '').trim().toLowerCase();
  const productionBranchId = String(env.CANONICAL_PRODUCTION_BRANCH_ID || '').trim();
  const productionEndpointHost = String(env.CANONICAL_PRODUCTION_HOST || '').trim().toLowerCase();
  const databaseName = String(env.TIME_SOURCE_QA_DATABASE_NAME || 'neondb').trim();

  guard(/^br-[a-z0-9-]+$/i.test(branchId), 'QA_BRANCH_INVALID', 'Branch QA invalida');
  guard(QA_BRANCH_NAME.test(branchName), 'QA_BRANCH_NOT_DISPOSABLE', 'Nombre de branch no descartable');
  guard(/^[a-z0-9-]+$/i.test(projectId), 'QA_PROJECT_INVALID', 'Project QA invalido');
  guard(neonEndpointHost(qaEndpointHost), 'QA_HOST_INVALID', 'Host QA invalido');
  guard(/^br-[a-z0-9-]+$/i.test(productionBranchId),
    'QA_PRODUCTION_GUARD_INVALID', 'Branch productiva ausente');
  guard(neonEndpointHost(productionEndpointHost),
    'QA_PRODUCTION_GUARD_INVALID', 'Host productivo ausente');
  guard(branchId !== productionBranchId,
    'QA_PRODUCTION_TARGET_FORBIDDEN', 'La branch QA coincide con Produccion');
  guard(canonicalEndpointHost(qaEndpointHost) !== canonicalEndpointHost(productionEndpointHost),
    'QA_PRODUCTION_TARGET_FORBIDDEN', 'El endpoint QA coincide con Produccion');

  const owner = postgresUrl(env.DATABASE_URL_UNPOOLED, 'DATABASE_URL_UNPOOLED');
  const runtime = postgresUrl(env.ACTIONS_DATABASE_URL, 'ACTIONS_DATABASE_URL');
  guard(directEndpointHost(owner.hostname),
    'QA_OWNER_MUST_BE_UNPOOLED', 'Owner debe usar endpoint directo');
  guard(canonicalEndpointHost(owner.hostname) === canonicalEndpointHost(qaEndpointHost),
    'QA_HOST_MISMATCH', 'Owner no apunta al endpoint QA');
  guard(canonicalEndpointHost(runtime.hostname) === canonicalEndpointHost(qaEndpointHost),
    'QA_HOST_MISMATCH', 'Runtime no apunta al endpoint QA');
  guard(canonicalEndpointHost(owner.hostname) !== canonicalEndpointHost(productionEndpointHost)
      && canonicalEndpointHost(runtime.hostname) !== canonicalEndpointHost(productionEndpointHost),
  'QA_PRODUCTION_TARGET_FORBIDDEN', 'Una conexion apunta a Produccion');
  guard(owner.href !== runtime.href,
    'QA_CREDENTIAL_SEPARATION_REQUIRED', 'Owner y runtime comparten URL');

  const ownerUser = decodeURIComponent(owner.username);
  const runtimeUser = decodeURIComponent(runtime.username);
  guard(ownerUser !== runtimeUser,
    'QA_CREDENTIAL_SEPARATION_REQUIRED', 'Owner y runtime comparten rol');
  guard(runtimeUser === RUNTIME_ROLE,
    'QA_RUNTIME_ROLE_INVALID', 'La URL runtime no usa el rol dedicado');
  guard(owner.pathname.slice(1) === databaseName && runtime.pathname.slice(1) === databaseName,
    'QA_DATABASE_MISMATCH', 'Las conexiones no apuntan a la base QA esperada');

  return Object.freeze({
    branchId,
    branchName,
    projectId,
    qaEndpointHost: canonicalEndpointHost(qaEndpointHost),
    productionBranchId,
    productionEndpointHost: canonicalEndpointHost(productionEndpointHost),
    databaseName,
    ownerUrl: owner.href,
    runtimeUrl: runtime.href,
    ownerUser,
    runtimeUser,
  });
}

export function qaFixtureEmail(kind, suffix) {
  const normalizedKind = String(kind || '').trim().toLowerCase();
  const normalizedSuffix = String(suffix || '').trim().toLowerCase();
  guard(/^[a-z][a-z0-9-]{1,31}$/.test(normalizedKind),
    'QA_FIXTURE_KIND_INVALID', 'Tipo de fixture invalido');
  guard(/^[a-f0-9]{12}$/.test(normalizedSuffix),
    'QA_FIXTURE_SUFFIX_INVALID', 'Sufijo de fixture invalido');
  return `qa-time-source-${normalizedKind}-${normalizedSuffix}@local.invalid`;
}

export function validateRuntimeBoundaryEvidence(evidence) {
  const identity = evidence?.identity;
  guard(identity?.currentUser === RUNTIME_ROLE && identity?.sessionUser === RUNTIME_ROLE,
    'QA_RUNTIME_IDENTITY_DRIFT', 'La conexion runtime no usa el rol dedicado');
  const role = evidence?.role;
  guard(role?.canLogin === true && role?.inherit === false && role?.superuser === false
      && role?.bypassRls === false && role?.createDb === false && role?.createRole === false
      && role?.replication === false,
  'QA_RUNTIME_ROLE_DRIFT', 'El rol runtime conserva atributos escalables');
  guard(evidence?.schema?.usage === true && evidence?.schema?.create === false,
    'QA_RUNTIME_SCHEMA_DRIFT', 'ACL de schema runtime incorrecta');
  guard(evidence?.database?.connect === true && evidence?.database?.create === false,
    'QA_RUNTIME_DATABASE_DRIFT', 'ACL de base runtime incorrecta');
  guard(Array.isArray(evidence?.schemas)
      && evidence.schemas.some((schema) => schema.name === 'public' && schema.usage === true)
      && evidence.schemas.every((schema) => schema.create === false),
  'QA_RUNTIME_SCHEMA_DRIFT', 'Runtime puede crear objetos en un schema accesible');
  guard(Array.isArray(evidence?.memberships) && evidence.memberships.length === 0,
    'QA_RUNTIME_ROLE_MEMBERSHIP', 'Runtime puede asumir otro rol');
  guard(Array.isArray(evidence?.ownedObjects) && evidence.ownedObjects.length === 0,
    'QA_RUNTIME_OBJECT_OWNERSHIP', 'Runtime es owner de objetos no sistemicos');

  const signatures = (evidence?.securityDefiners || []).map((item) => String(item.signature || ''));
  const actual = new Set(signatures);
  guard(actual.size === signatures.length,
    'QA_SECDEF_DUPLICATE', 'Inventario SECURITY DEFINER duplicado');
  guard(!EXPECTED_RUNTIME_SECURITY_DEFINERS.find((signature) => !actual.has(signature)),
    'QA_SECDEF_MISSING', 'Falta un SECURITY DEFINER permitido');
  guard(!signatures.find((signature) => !EXPECTED_SECURITY_DEFINER_SET.has(signature)),
    'QA_SECDEF_OUTSIDE_ALLOWLIST', 'Runtime ejecuta SECURITY DEFINER fuera de allowlist');
  guard(signatures.length === EXPECTED_RUNTIME_SECURITY_DEFINERS.length,
    'QA_SECDEF_INVENTORY_DRIFT', 'Inventario SECURITY DEFINER no es exacto');
  guard(Array.isArray(evidence?.relations) && evidence.relations.length === 0,
    'QA_RUNTIME_RELATION_PRIVILEGE', 'Runtime conserva privilegios directos sobre relaciones');
  guard(Array.isArray(evidence?.sequences) && evidence.sequences.length === 0,
    'QA_RUNTIME_SEQUENCE_PRIVILEGE', 'Runtime conserva privilegios directos sobre secuencias');
  return true;
}

export function validateRoleCatalogEvidence(evidence) {
  const mappings = (evidence?.roleCapabilities || [])
    .map((row) => `${row.roleKey}:${row.capabilityKey}`).sort();
  const conflicts = (evidence?.conflicts || [])
    .map((row) => `${row.capabilityKey}:${row.conflictsWithKey}`).sort();
  assert.deepEqual(mappings, [...EXPECTED_ROLE_CAPABILITIES]);
  assert.deepEqual(conflicts, [...EXPECTED_CAPABILITY_CONFLICTS]);
  guard((evidence?.platformOwnerCapabilities || []).length === 0,
    'QA_PLATFORM_OWNER_OPERATIONAL_INHERITANCE', 'PLATFORM_OWNER hereda capacidades temporales');
  guard((evidence?.overrides || []).length === 0,
    'QA_TIME_SOURCE_OVERRIDE_DRIFT', 'Existen overrides temporales fuera del modelo exacto');
  return true;
}

async function defaultMigrationExecutor(config) {
  const childEnv = {
    ...process.env,
    DATABASE_URL_UNPOOLED: config.ownerUrl,
    CANONICAL_PRODUCTION_BRANCH_ID: config.productionBranchId,
    CANONICAL_PRODUCTION_HOST: config.productionEndpointHost,
    NODE_ENV: 'test',
    VERCEL_ENV: 'preview',
  };
  await execFile(process.execPath, [
    fileURLToPath(APPLIER_URL),
    CONFIRMATION_FLAG,
  ], {
    env: childEnv,
    windowsHide: true,
    timeout: 180_000,
    maxBuffer: 1024 * 1024,
  });
}

export async function runTimeSourceMigrationTwice(config, executor = defaultMigrationExecutor) {
  guard(config && typeof executor === 'function',
    'QA_MIGRATION_RUNNER_INVALID', 'Runner de migracion invalido');
  await executor(config, 1);
  await executor(config, 2);
  return true;
}

export async function verifyTimeSourceBackendFreeze() {
  for (const [url, expected] of BACKEND_FREEZE_HASHES) {
    const actual = createHash('sha256').update(await readFile(url)).digest('hex');
    guard(actual === expected, 'QA_BACKEND_FREEZE_DRIFT', 'Backend 010A fuera del freeze autorizado');
  }
  return true;
}

async function executableSecurityDefiners(client) {
  const result = await client.query(`
    SELECT format('%s.%s(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
      AND namespace.nspname !~ '^pg_'
      AND function_row.prosecdef IS TRUE
      AND has_schema_privilege($1::name, namespace.oid, 'USAGE')
      AND has_function_privilege($1::name, function_row.oid, 'EXECUTE')
    ORDER BY signature
  `, [RUNTIME_ROLE]);
  return rows(result);
}

async function collectRuntimeBoundaryEvidence(owner, runtime) {
  const identityResult = await runtime.query(`
    SELECT current_user AS "currentUser", session_user AS "sessionUser"
  `);
  const roleResult = await owner.query(`
    SELECT rolcanlogin AS "canLogin", rolinherit AS inherit,
      rolsuper AS superuser, rolbypassrls AS "bypassRls",
      rolcreatedb AS "createDb", rolcreaterole AS "createRole", rolreplication AS replication
    FROM pg_roles WHERE rolname = $1
  `, [RUNTIME_ROLE]);
  const schemaResult = await owner.query(`
    SELECT has_schema_privilege($1::name, 'public', 'USAGE') AS usage,
      has_schema_privilege($1::name, 'public', 'CREATE') AS create
  `, [RUNTIME_ROLE]);
  const databaseResult = await owner.query(`
    SELECT has_database_privilege($1::name, current_database(), 'CONNECT') AS connect,
      has_database_privilege($1::name, current_database(), 'CREATE') AS create
  `, [RUNTIME_ROLE]);
  const schemasResult = await owner.query(`
    SELECT namespace.nspname AS name,
      has_schema_privilege($1::name, namespace.oid, 'USAGE') AS usage,
      has_schema_privilege($1::name, namespace.oid, 'CREATE') AS create
    FROM pg_namespace namespace
    WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
      AND namespace.nspname !~ '^pg_'
      AND (has_schema_privilege($1::name, namespace.oid, 'USAGE')
        OR has_schema_privilege($1::name, namespace.oid, 'CREATE'))
    ORDER BY name
  `, [RUNTIME_ROLE]);
  const membershipsResult = await owner.query(`
    SELECT candidate.rolname AS name FROM pg_roles candidate
    WHERE candidate.rolname <> $1
      AND pg_has_role($1::name, candidate.oid, 'MEMBER')
    ORDER BY name
  `, [RUNTIME_ROLE]);
  const ownedObjectsResult = await owner.query(`
    WITH runtime_role AS (SELECT oid FROM pg_roles WHERE rolname = $1)
    SELECT 'schema' AS kind, namespace.nspname AS name
    FROM pg_namespace namespace, runtime_role
    WHERE namespace.nspowner = runtime_role.oid
      AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
      AND namespace.nspname !~ '^pg_'
    UNION ALL
    SELECT 'relation', format('%I.%I', namespace.nspname, relation.relname)
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    CROSS JOIN runtime_role
    WHERE relation.relowner = runtime_role.oid
      AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
      AND namespace.nspname !~ '^pg_'
    UNION ALL
    SELECT 'function', format('%I.%I', namespace.nspname, function_row.proname)
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    CROSS JOIN runtime_role
    WHERE function_row.proowner = runtime_role.oid
      AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
      AND namespace.nspname !~ '^pg_'
  `, [RUNTIME_ROLE]);
  const relationsResult = await owner.query(`
    SELECT format('%I.%I', namespace.nspname, relation.relname) AS name
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
      AND namespace.nspname !~ '^pg_'
      AND relation.relkind IN ('r','p','v','m','f')
      AND has_schema_privilege($1::name, namespace.oid, 'USAGE')
      AND (has_any_column_privilege($1::name, relation.oid, 'SELECT')
        OR has_any_column_privilege($1::name, relation.oid, 'INSERT')
        OR has_any_column_privilege($1::name, relation.oid, 'UPDATE')
        OR has_any_column_privilege($1::name, relation.oid, 'REFERENCES')
        OR has_table_privilege($1::name, relation.oid, 'DELETE')
        OR has_table_privilege($1::name, relation.oid, 'TRUNCATE')
        OR has_table_privilege($1::name, relation.oid, 'TRIGGER'))
    ORDER BY name
  `, [RUNTIME_ROLE]);
  const sequencesResult = await owner.query(`
    SELECT format('%I.%I', namespace.nspname, relation.relname) AS name
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname NOT IN ('pg_catalog', 'information_schema')
      AND namespace.nspname !~ '^pg_'
      AND relation.relkind = 'S'
      AND has_schema_privilege($1::name, namespace.oid, 'USAGE')
      AND (has_sequence_privilege($1::name, relation.oid, 'USAGE')
        OR has_sequence_privilege($1::name, relation.oid, 'SELECT')
        OR has_sequence_privilege($1::name, relation.oid, 'UPDATE'))
    ORDER BY name
  `, [RUNTIME_ROLE]);
  return {
    identity: rows(identityResult)[0],
    role: rows(roleResult)[0],
    schema: rows(schemaResult)[0],
    database: rows(databaseResult)[0],
    schemas: rows(schemasResult),
    memberships: rows(membershipsResult),
    ownedObjects: rows(ownedObjectsResult),
    securityDefiners: await executableSecurityDefiners(owner),
    relations: rows(relationsResult),
    sequences: rows(sequencesResult),
  };
}

async function verifyConnectionIdentity(client, config) {
  const result = await client.query(`
    SELECT current_setting('neon.branch_id', true) AS "branchId",
      current_setting('neon.project_id', true) AS "projectId",
      current_database() AS "databaseName",
      current_user AS "currentUser", session_user AS "sessionUser"
  `);
  const identity = rows(result)[0];
  guard(identity?.branchId === config.branchId && identity?.projectId === config.projectId,
    'QA_CONTROL_PLANE_MISMATCH', 'Conexion no coincide con branch y project declarados');
  guard(identity?.branchId !== config.productionBranchId
      && identity?.databaseName === config.databaseName,
  'QA_PRODUCTION_TARGET_FORBIDDEN', 'Identidad de base no aislada');
  return identity;
}

async function preflightBranchIdentity(config, ClientClass) {
  const owner = new ClientClass({ connectionString: config.ownerUrl });
  const runtime = new ClientClass({ connectionString: config.runtimeUrl });
  try {
    await Promise.all([owner.connect(), runtime.connect()]);
    const [ownerIdentity, runtimeIdentity] = await Promise.all([
      verifyConnectionIdentity(owner, config),
      verifyConnectionIdentity(runtime, config),
    ]);
    guard(ownerIdentity.currentUser === config.ownerUser
        && ownerIdentity.sessionUser === config.ownerUser,
    'QA_OWNER_IDENTITY_DRIFT', 'Credencial owner inesperada');
    guard(runtimeIdentity.currentUser === RUNTIME_ROLE
        && runtimeIdentity.sessionUser === RUNTIME_ROLE,
    'QA_RUNTIME_IDENTITY_DRIFT', 'Credencial runtime inesperada');
    guard(ownerIdentity.currentUser !== runtimeIdentity.currentUser,
      'QA_CREDENTIAL_SEPARATION_REQUIRED', 'Owner y runtime resuelven al mismo rol');
  } finally {
    await Promise.all([owner.end().catch(() => {}), runtime.end().catch(() => {})]);
  }
}

async function verifyInstalledMigration(owner) {
  const migrationBytes = await readFile(MIGRATION_URL);
  const expectedChecksum = createHash('sha256').update(migrationBytes).digest('hex');
  const result = await owner.query(`
    SELECT checksum_sha256 FROM schema_migrations WHERE version = $1
  `, [TIME_SOURCE_MIGRATION_VERSION]);
  guard(result.rowCount === 1, 'QA_MIGRATION_MISSING', 'Migracion 010 ausente');
  guard(String(rows(result)[0]?.checksum_sha256 || '').trim() === expectedChecksum,
    'QA_MIGRATION_CHECKSUM_DRIFT', 'Checksum instalado no coincide con bytes locales');
  return true;
}

async function verifyDirectRuntimeDenials(runtime) {
  await assert.rejects(
    runtime.query('SELECT * FROM public.time_source_contract LIMIT 0'),
    (error) => error?.code === '42501',
  );
  await assert.rejects(
    runtime.query('UPDATE public.time_source_contract SET updated_at = updated_at WHERE false'),
    (error) => error?.code === '42501',
  );
  await assert.rejects(
    runtime.query("SELECT public.time_source_readiness_v1('{}'::jsonb)"),
    (error) => error?.code === '42501',
  );
}

async function verifyGlobalSecurityDefinerCanary(owner, suffix) {
  const functionName = `qa_time_source_secdef_${suffix}`;
  guard(/^[a-z][a-z0-9_]+$/.test(functionName),
    'QA_CANARY_INVALID', 'Nombre de canary invalido');
  await owner.query('BEGIN');
  try {
    await owner.query(`
      CREATE FUNCTION public.${functionName}()
      RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER
      SET search_path = public, pg_temp AS $$ SELECT 1 $$
    `);
    await owner.query(`GRANT EXECUTE ON FUNCTION public.${functionName}() TO ${RUNTIME_ROLE}`);
    const evidence = await collectRuntimeBoundaryEvidence(owner, owner);
    evidence.identity = { currentUser: RUNTIME_ROLE, sessionUser: RUNTIME_ROLE };
    assert.throws(() => validateRuntimeBoundaryEvidence(evidence),
      (error) => error?.code === 'QA_SECDEF_OUTSIDE_ALLOWLIST');
  } finally {
    await owner.query('ROLLBACK').catch(() => {});
  }
}

async function collectRoleCatalogEvidence(owner) {
  const roleCapabilities = await owner.query(`
    SELECT mapping.role_key AS "roleKey", mapping.capability_key AS "capabilityKey"
    FROM iam_role_capability mapping
    WHERE mapping.capability_key LIKE 'time.source.%'
    ORDER BY mapping.role_key, mapping.capability_key
  `);
  const conflicts = await owner.query(`
    SELECT conflict.capability_key AS "capabilityKey",
      conflict.conflicts_with_key AS "conflictsWithKey"
    FROM iam_capability_conflict conflict
    WHERE conflict.capability_key LIKE 'time.source.%'
       OR conflict.conflicts_with_key LIKE 'time.source.%'
    ORDER BY conflict.capability_key, conflict.conflicts_with_key
  `);
  const platformOwnerCapabilities = await owner.query(`
    SELECT mapping.capability_key AS "capabilityKey"
    FROM iam_role_capability mapping
    WHERE mapping.role_key = 'PLATFORM_OWNER'
      AND mapping.capability_key LIKE 'time.source.%'
  `);
  const overrides = await owner.query(`
    SELECT override_row.capability_key AS "capabilityKey"
    FROM tenant_membership_capability_override override_row
    WHERE override_row.capability_key LIKE 'time.source.%'
  `);
  return {
    roleCapabilities: rows(roleCapabilities),
    conflicts: rows(conflicts),
    platformOwnerCapabilities: rows(platformOwnerCapabilities),
    overrides: rows(overrides),
  };
}

async function protectedDataFingerprint(owner) {
  const fingerprint = {};
  for (const relation of PROTECTED_DATA_RELATIONS) {
    const result = await owner.query(`
      SELECT count(*)::text AS rows,
        COALESCE(sum(hashtextextended(to_jsonb(snapshot_row)::text, 17)::numeric), 0)::text AS hash_a,
        COALESCE(sum(hashtextextended(to_jsonb(snapshot_row)::text, 71)::numeric), 0)::text AS hash_b
      FROM public.${relation} snapshot_row
    `);
    const value = rows(result)[0];
    fingerprint[relation] = `${value.rows}:${value.hash_a}:${value.hash_b}`;
  }
  return Object.freeze(fingerprint);
}

async function verifyCleanRegistry(owner) {
  const result = await owner.query(`
    SELECT (SELECT count(*)::integer FROM time_source_contract) AS contracts,
      (SELECT count(*)::integer FROM time_source_governance_event) AS events
  `);
  const value = rows(result)[0];
  guard(Number(value?.contracts) === 0 && Number(value?.events) === 0,
    'QA_DISPOSABLE_BRANCH_NOT_CLEAN', 'El registro temporal ya contiene datos');
}

async function selectContractSet(owner, scope) {
  const result = await owner.query(`
    WITH eligible AS MATERIALIZED (
      SELECT contract.id, contract.person_id
      FROM employment_contract contract
      JOIN source_import_batch batch
        ON batch.id = contract.source_batch_id
       AND batch.source_system = 'GRH'
       AND batch.source_database = $2
       AND batch.validation_state = 'published'
       AND batch.legacy_import_run_id IS NOT NULL
      WHERE contract.status = 'active'
        AND contract.source_system = 'GRH'
        AND contract.legacy_company_id = $3::bigint
        AND contract.person_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM tenant_action_employment_link existing_link
          WHERE existing_link.tenant_id = $1::uuid
            AND existing_link.employment_contract_id = contract.id
        )
    ), same_pair AS MATERIALIZED (
      SELECT first_contract.id AS proposer_contract_id,
        second_contract.id AS alias_contract_id,
        first_contract.person_id
      FROM eligible first_contract
      JOIN eligible second_contract
        ON second_contract.person_id = first_contract.person_id
       AND second_contract.id::text > first_contract.id::text
      ORDER BY first_contract.person_id::text,
        first_contract.id::text, second_contract.id::text
      LIMIT 1
    ), other_people AS MATERIALIZED (
      SELECT DISTINCT ON (candidate.person_id) candidate.id, candidate.person_id
      FROM eligible candidate
      CROSS JOIN same_pair pair
      WHERE candidate.person_id <> pair.person_id
        AND candidate.id NOT IN (pair.proposer_contract_id, pair.alias_contract_id)
      ORDER BY candidate.person_id, candidate.id
    ), chosen AS MATERIALIZED (
      SELECT * FROM other_people ORDER BY person_id, id LIMIT 2
    )
    SELECT pair.proposer_contract_id::text AS "proposerContractId",
      pair.alias_contract_id::text AS "aliasContractId",
      chosen.id::text AS "otherContractId"
    FROM same_pair pair CROSS JOIN chosen
    ORDER BY chosen.person_id, chosen.id
  `, [scope.tenantId, scope.sourceDatabase, scope.sourceCompanyId]);
  if (result.rowCount !== 2) return null;
  const selected = rows(result);
  return Object.freeze({
    proposerContractId: selected[0].proposerContractId,
    aliasContractId: selected[0].aliasContractId,
    approverContractId: selected[0].otherContractId,
    platformOwnerContractId: selected[1].otherContractId,
  });
}

async function selectAlternateBindingScope(owner, scope) {
  const result = await owner.query(`
    WITH eligible AS MATERIALIZED (
      SELECT DISTINCT ON (batch.source_database, contract.legacy_company_id, contract.person_id)
        batch.source_database AS "sourceDatabase",
        contract.legacy_company_id::text AS "sourceCompanyId",
        contract.id::text AS "contractId",
        contract.person_id::text AS "personId"
      FROM employment_contract contract
      JOIN source_import_batch batch
        ON batch.id = contract.source_batch_id
       AND batch.source_system = 'GRH'
       AND batch.validation_state = 'published'
       AND batch.legacy_import_run_id IS NOT NULL
      WHERE contract.status = 'active'
        AND contract.source_system = 'GRH'
        AND contract.person_id IS NOT NULL
        AND (batch.source_database <> $2
          OR contract.legacy_company_id <> $3::bigint)
        AND NOT EXISTS (
          SELECT 1 FROM platform_tenant_source_binding existing_binding
          WHERE existing_binding.source_system = 'GRH'
            AND existing_binding.source_database = batch.source_database
            AND existing_binding.source_company_id = contract.legacy_company_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM tenant_action_employment_link existing_link
          WHERE existing_link.tenant_id = $1::uuid
            AND existing_link.employment_contract_id = contract.id
        )
      ORDER BY batch.source_database, contract.legacy_company_id,
        contract.person_id, contract.id
    )
    SELECT * FROM eligible ORDER BY "sourceDatabase", "sourceCompanyId", "contractId" LIMIT 1
  `, [scope.tenantId, scope.sourceDatabase, scope.sourceCompanyId]);
  return result.rowCount === 1 ? Object.freeze(rows(result)[0]) : null;
}

async function selectQaScope(owner) {
  const result = await owner.query(`
    SELECT tenant.id::text AS "tenantId",
      binding.id::text AS "sourceBindingId",
      binding.source_database AS "sourceDatabase",
      binding.source_company_id::text AS "sourceCompanyId",
      btrim(policy.certified_release_sha) AS "releaseSha"
    FROM platform_tenant tenant
    JOIN tenant_identity_policy policy
      ON policy.tenant_id = tenant.id
     AND policy.tenant_data_plane_ready IS TRUE
     AND policy.certified_source_binding_id IS NOT NULL
     AND policy.certified_release_sha IS NOT NULL
    JOIN platform_tenant_source_binding binding
      ON binding.id = policy.certified_source_binding_id
     AND binding.tenant_id = tenant.id
     AND binding.source_system = 'GRH'
     AND binding.verified IS TRUE
    WHERE tenant.status = 'active'
    ORDER BY tenant.id, binding.id
    LIMIT 20
  `);
  for (const candidate of rows(result)) {
    if (!UUID.test(candidate.tenantId) || !UUID.test(candidate.sourceBindingId)
        || !SHA40.test(String(candidate.releaseSha || ''))) continue;
    const contracts = await selectContractSet(owner, candidate);
    if (!contracts) continue;
    const alternate = await selectAlternateBindingScope(owner, candidate);
    if (!alternate) continue;
    return Object.freeze({ ...candidate, contracts, alternate });
  }
  throw new QaContractError(
    'QA_FIXTURE_SOURCE_UNAVAILABLE',
    'No hay alcance QA con alias por persona, revisores y binding alternativo',
  );
}

function fixtureActor(kind, suffix, scope, contractId, roleKey, sourceBindingId = scope.sourceBindingId) {
  const email = qaFixtureEmail(kind, suffix);
  const membershipId = randomUUID();
  const sessionId = randomUUID();
  return Object.freeze({
    kind,
    email,
    contractId,
    roleKey,
    tenantId: scope.tenantId,
    sourceBindingId,
    membershipId,
    sessionId,
    identity: Object.freeze({
      user: Object.freeze({ email }),
      tenant: Object.freeze({
        id: scope.tenantId,
        membershipId,
        source: 'membership',
      }),
    }),
    session: Object.freeze({
      id: sessionId,
      version: 1,
      email,
      releaseSha: scope.releaseSha,
    }),
  });
}

function platformActor(suffix) {
  const email = qaFixtureEmail('certifier', suffix);
  return Object.freeze({
    email,
    sessionId: randomUUID(),
    sessionVersion: 1,
  });
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function platformCommandRequest(command, expectedVersion, payload, releaseSha) {
  return Object.freeze({
    command,
    expectedVersion,
    payload: Object.freeze({ ...payload }),
    releaseSha,
    idempotencyKey: randomUUID(),
    hash: createHash('sha256').update(stableJson({
      command, expectedVersion, payload, releaseSha,
    })).digest('hex'),
  });
}

async function applyPlatformCommand(client, actor, request) {
  const result = await client.query(`
    SELECT tenant_identity_apply_platform_command_v2(
      $1, $2::uuid, $3, $4, $5, $6::uuid, $7, $8, $9::jsonb
    ) AS result
  `, [actor.email, actor.sessionId, actor.sessionVersion, request.releaseSha,
    request.command, request.idempotencyKey, request.hash,
    request.expectedVersion, JSON.stringify(request.payload)]);
  return rows(result)[0]?.result || {};
}

async function seedFixtures(owner, scope, suffix) {
  const alternateBindingId = randomUUID();
  const certifier = platformActor(suffix);
  const actors = Object.freeze({
    proposer: fixtureActor(
      'proposer', suffix, scope, scope.contracts.proposerContractId,
      'JUNIN_TIEMPO_FUENTES_PROPONENTE',
    ),
    alias: fixtureActor(
      'alias', suffix, scope, scope.contracts.aliasContractId, 'JUNIN_EMPLEADO',
    ),
    approver: fixtureActor(
      'approver', suffix, scope, scope.contracts.approverContractId,
      'JUNIN_TIEMPO_FUENTES_APROBADOR',
    ),
    platformOwner: fixtureActor(
      'platform-owner', suffix, scope, scope.contracts.platformOwnerContractId,
      'PLATFORM_OWNER',
    ),
    crossBindingApprover: fixtureActor(
      'cross-binding', suffix, scope, scope.alternate.contractId,
      'JUNIN_TIEMPO_FUENTES_APROBADOR', alternateBindingId,
    ),
  });
  const actorRows = Object.values(actors);
  const qaEmails = [...actorRows.map((actor) => actor.email), certifier.email];

  await owner.query('BEGIN');
  try {
    await owner.query(`
      INSERT INTO internal_users (
        email, display_name, role, password_hash, active, auth_mode, identity_version
      )
      SELECT fixture.email, 'QA sintetico aislado', 'EMPLEADO', NULL, true, 'managed', 1
      FROM unnest($1::text[]) fixture(email)
    `, [qaEmails]);
    await owner.query(`
      INSERT INTO platform_tenant_source_binding (
        id, tenant_id, source_system, source_database, source_company_id,
        verified, verified_by_user_email, verified_at
      ) VALUES ($1::uuid, $2::uuid, 'GRH', $3, $4::bigint, true, $5, now())
    `, [alternateBindingId, scope.tenantId, scope.alternate.sourceDatabase,
      scope.alternate.sourceCompanyId, actors.proposer.email]);
    await owner.query(`
      INSERT INTO platform_user_role (
        user_email, role_key, active, granted_by_user_email
      ) VALUES ($1, 'PLATFORM_OWNER', true, $1)
    `, [certifier.email]);
    await owner.query(`
      INSERT INTO tenant_identity_session (
        id, user_email, active_tenant_id, source, auth_level,
        session_version, identity_version, status, device_label,
        last_seen_at, expires_at
      ) VALUES (
        $1::uuid, $2, NULL, 'platform', 'mfa', 1, 1,
        'active', 'QA aislada', now(), now() + interval '2 hours'
      )
    `, [certifier.sessionId, certifier.email]);
    for (const actor of actorRows) {
      await owner.query(`
        INSERT INTO tenant_membership (
          id, tenant_id, user_email, role_key, status,
          invited_by_user_email, activated_at
        ) VALUES ($1::uuid, $2::uuid, $3, $4, 'active', $5, now())
      `, [actor.membershipId, actor.tenantId, actor.email,
        actor.roleKey, actors.proposer.email]);
      await owner.query(`
        INSERT INTO tenant_identity_session (
          id, user_email, active_tenant_id, source, auth_level,
          session_version, identity_version, status, device_label,
          last_seen_at, expires_at
        ) VALUES (
          $1::uuid, $2, $3::uuid, 'membership', 'mfa', 1, 1,
          'active', 'QA aislada', now(), now() + interval '2 hours'
        )
      `, [actor.sessionId, actor.email, actor.tenantId]);
    }
    for (const actor of [actors.proposer, actors.alias, actors.approver, actors.platformOwner]) {
      await owner.query(`
        INSERT INTO tenant_action_employment_link (
          membership_id, tenant_id, source_binding_id, employment_contract_id,
          active, linked_by_user_email
        ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, true, $5)
      `, [actor.membershipId, actor.tenantId, actor.sourceBindingId,
        actor.contractId, actors.proposer.email]);
    }
    await owner.query('COMMIT');
  } catch (error) {
    await owner.query('ROLLBACK').catch(() => {});
    throw error;
  }

  return Object.freeze({
    scope,
    actors,
    certifier,
    qaEmails: Object.freeze(qaEmails),
    alternateBindingId,
  });
}

async function verifyFixtureCapabilities(owner, fixtures) {
  async function capabilities(actor) {
    const result = await owner.query(`
      SELECT capability_key FROM tenant_iam_effective_capabilities($1::uuid)
      ORDER BY capability_key
    `, [actor.membershipId]);
    return new Set(rows(result).map((row) => row.capability_key));
  }
  const proposer = await capabilities(fixtures.actors.proposer);
  const approver = await capabilities(fixtures.actors.approver);
  const platformOwner = await capabilities(fixtures.actors.platformOwner);
  const alias = await capabilities(fixtures.actors.alias);
  assert.ok(proposer.has('time.source.read') && proposer.has('time.source.propose'));
  assert.equal(proposer.has('time.source.approve'), false);
  assert.ok(approver.has('time.source.read') && approver.has('time.source.approve')
    && approver.has('time.source.audit.read'));
  assert.equal(approver.has('time.source.propose'), false);
  assert.equal([...platformOwner].some((key) => key.startsWith('time.source.')), false);
  assert.equal([...alias].some((key) => key.startsWith('time.source.')), false);
}

async function registryFingerprint(owner, tenantId) {
  const result = await owner.query(`
    SELECT
      (SELECT count(*)::text FROM time_source_contract source
        WHERE source.tenant_id = $1::uuid) AS contract_rows,
      (SELECT COALESCE(sum(hashtextextended(to_jsonb(source)::text, 17)::numeric), 0)::text
        FROM time_source_contract source WHERE source.tenant_id = $1::uuid) AS contract_hash_a,
      (SELECT COALESCE(sum(hashtextextended(to_jsonb(source)::text, 71)::numeric), 0)::text
        FROM time_source_contract source WHERE source.tenant_id = $1::uuid) AS contract_hash_b,
      (SELECT count(*)::text FROM time_source_governance_event event
        WHERE event.tenant_id = $1::uuid) AS event_rows,
      (SELECT COALESCE(sum(hashtextextended(to_jsonb(event)::text, 17)::numeric), 0)::text
        FROM time_source_governance_event event WHERE event.tenant_id = $1::uuid) AS event_hash_a,
      (SELECT COALESCE(sum(hashtextextended(to_jsonb(event)::text, 71)::numeric), 0)::text
        FROM time_source_governance_event event WHERE event.tenant_id = $1::uuid) AS event_hash_b
  `, [tenantId]);
  return Object.freeze(rows(result)[0]);
}

async function expectCodeWithoutRegistryWrites(owner, fixtures, expectedCode, operation) {
  const before = await registryFingerprint(owner, fixtures.scope.tenantId);
  let caught;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught);
  assert.equal(caught.code, expectedCode);
  assert.deepEqual(await registryFingerprint(owner, fixtures.scope.tenantId), before);
}

async function serverClock(owner) {
  const result = await owner.query(`
    SELECT
      to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "nowCut",
      to_char((clock_timestamp() + interval '5 minutes') AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "boundaryCut",
      to_char((clock_timestamp() + interval '6 minutes') AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "futureCut",
      (clock_timestamp() AT TIME ZONE 'America/Argentina/Mendoza')::date::text AS "civilDate"
  `);
  const value = rows(result)[0];
  assert.match(value?.nowCut || '', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.match(value?.boundaryCut || '', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.match(value?.futureCut || '', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  assert.match(value?.civilDate || '', /^\d{4}-\d{2}-\d{2}$/);
  return Object.freeze(value);
}

function metadataFor(domain, suffix, ordinal, clock, cutAt = clock.nowCut) {
  const definition = DOMAIN_DEFINITIONS[domain];
  assert.ok(definition);
  const artifactSha256 = createHash('sha256')
    .update(`qa-time-source:${suffix}:${domain}:${ordinal}`)
    .digest('hex');
  return Object.freeze({
    domain,
    ownerAuthority: 'municipal_human_resources',
    format: 'jsonl',
    schemaVersion: `v${ordinal}`,
    artifactSha256,
    cutAt,
    coverageFrom: clock.civilDate,
    coverageTo: clock.civilDate,
    timezone: 'America/Argentina/Mendoza',
    grain: definition[0],
    identityKeyKind: definition[1],
    recordCount: ordinal,
  });
}

function requestFor(command, expectedVersion, {
  contractId = null,
  metadata = null,
  reasonCode,
  reason = 'Control sintetico de QA aislada',
} = {}) {
  const payload = metadata
    ? { ...metadata, reasonCode, reason }
    : { reasonCode, reason };
  return Object.freeze({
    caseType: TIME_SOURCE_CASE_TYPE,
    command,
    ...(contractId ? { contractId } : {}),
    expectedVersion,
    payload: Object.freeze(payload),
  });
}

function actorCall(runtime, actor, request, idempotencyKey = randomUUID()) {
  return applyTimeSourceCommand(
    runtime, actor.identity, actor.session, request, idempotencyKey,
  );
}

function assertEngineClosed(value) {
  const candidate = value?.data || value;
  for (const key of [
    'evaluationReady', 'attendanceReconciled', 'payrollCalculated',
    'payrollPosted', 'grhMutation',
  ]) assert.equal(candidate?.[key], false);
}

async function executeCommand(runtime, actor, request, idempotencyKey = randomUUID()) {
  const result = await actorCall(runtime, actor, request, idempotencyKey);
  assertEngineClosed(result);
  return Object.freeze({ request, idempotencyKey, result });
}

async function verifyPiiMetadataFuzz(owner, runtime, fixtures, clock, suffix) {
  const base = metadataFor('shift_assignment', suffix, 90, clock);
  const forbiddenFields = Object.freeze({
    ownerCode: 'persona.identificable',
    systemLocator: 'https://example.invalid/nomina',
    actorEmail: 'persona@example.invalid',
    dni: '00000000',
    cuil: '20-00000000-0',
    employeeName: 'Persona sintetica',
  });
  for (const [field, value] of Object.entries(forbiddenFields)) {
    await expectCodeWithoutRegistryWrites(
      owner,
      fixtures,
      'TIME_SOURCE_METADATA_INVALID',
      () => actorCall(runtime, fixtures.actors.proposer, requestFor('create_draft', 0, {
        metadata: { ...base, [field]: value },
        reasonCode: 'source_onboarding',
        reason: 'Fuzz PII sintetico que debe cerrarse',
      })),
    );
  }
  for (const schemaVersion of [
    'qa.1', 'v01', 'v1.2.3.4', 'v20301234567', `v${'9'.repeat(40)}`,
  ]) {
    await expectCodeWithoutRegistryWrites(
      owner,
      fixtures,
      'TIME_SOURCE_METADATA_INVALID',
      () => actorCall(runtime, fixtures.actors.proposer, requestFor('create_draft', 0, {
        metadata: { ...base, schemaVersion },
        reasonCode: 'source_onboarding',
        reason: 'Schema version sintetica fuera del contrato',
      })),
    );
  }
}

async function verifyCertifyDataPlaneRace(
  owner, runtime, runtimeRace, fixtures, clock, suffix,
) {
  const state = await owner.query(`
    SELECT version::integer AS version FROM tenant_identity_policy
    WHERE tenant_id = $1::uuid
      AND tenant_data_plane_ready IS TRUE
      AND certified_source_binding_id = $2::uuid
      AND certified_release_sha = $3
  `, [fixtures.scope.tenantId, fixtures.scope.sourceBindingId, fixtures.scope.releaseSha]);
  guard(state.rowCount === 1, 'QA_CERTIFICATION_STATE_INVALID',
    'Policy no certificada para la race');
  const expectedVersion = Number(rows(state)[0].version);
  const request = platformCommandRequest('certify_data_plane', expectedVersion, {
    tenantId: fixtures.scope.tenantId,
    sourceBindingId: fixtures.scope.sourceBindingId,
    releaseSha: fixtures.scope.releaseSha,
    reason: 'Recertificacion sintetica concurrente',
  }, fixtures.scope.releaseSha);

  await runtimeRace.query('BEGIN');
  try {
    const certified = await applyPlatformCommand(runtimeRace, fixtures.certifier, request);
    assert.equal(certified?.policy?.dataPlaneReady, true);
    assert.equal(Number(certified?.policy?.version), expectedVersion + 1);
    await expectCodeWithoutRegistryWrites(
      owner,
      fixtures,
      'TIME_SOURCE_SESSION_BUSY',
      () => getTimeSourceBootstrap(
        runtime, fixtures.actors.proposer.identity, fixtures.actors.proposer.session,
      ),
    );
    await expectCodeWithoutRegistryWrites(
      owner,
      fixtures,
      'TIME_SOURCE_SESSION_BUSY',
      () => actorCall(runtime, fixtures.actors.proposer, requestFor('create_draft', 0, {
        metadata: metadataFor('employment_master_reference', suffix, 91, clock),
        reasonCode: 'source_onboarding',
        reason: 'Apply concurrente con certify data plane',
      })),
    );
  } finally {
    await runtimeRace.query('ROLLBACK').catch(() => {});
  }
  const unchanged = await owner.query(`
    SELECT version::integer AS version FROM tenant_identity_policy
    WHERE tenant_id = $1::uuid
  `, [fixtures.scope.tenantId]);
  assert.equal(Number(rows(unchanged)[0]?.version), expectedVersion);
}

async function createSubmitApprove(runtime, actorProposer, actorApprover, metadata, ordinal) {
  const created = await executeCommand(runtime, actorProposer, requestFor('create_draft', 0, {
    metadata,
    reasonCode: 'source_onboarding',
    reason: `Alta sintetica controlada ${ordinal}`,
  }));
  assert.equal(created.result.data.status, 'draft');
  assert.equal(created.result.data.version, 1);
  const submitted = await executeCommand(runtime, actorProposer, requestFor('submit', 1, {
    contractId: created.result.data.id,
    reasonCode: 'ready_for_review',
    reason: `Revision sintetica controlada ${ordinal}`,
  }));
  assert.equal(submitted.result.data.status, 'submitted');
  const approved = await executeCommand(runtime, actorApprover, requestFor('approve', 2, {
    contractId: created.result.data.id,
    reasonCode: 'evidence_verified',
    reason: `Evidencia sintetica verificada ${ordinal}`,
  }));
  assert.equal(approved.result.data.status, 'approved');
  assert.equal(approved.result.data.version, 3);
  return Object.freeze({ created, submitted, approved });
}

async function createTimelineCapFixture(runtime, proposer, clock, suffix) {
  const created = await executeCommand(runtime, proposer, requestFor('create_draft', 0, {
    metadata: metadataFor('employment_master_reference', suffix, 100, clock),
    reasonCode: 'source_onboarding',
    reason: 'Alta sintetica para verificar el limite de timeline',
  }));
  let version = 1;
  for (let index = 1; index <= 100; index += 1) {
    const updated = await executeCommand(runtime, proposer, requestFor('update_draft', version, {
      contractId: created.result.data.id,
      metadata: metadataFor(
        'employment_master_reference', suffix, 100 + index, clock,
      ),
      reasonCode: 'metadata_correction',
      reason: `Correccion sintetica de timeline ${index}`,
    }));
    version = updated.result.data.version;
  }
  assert.equal(version, 101);
  return Object.freeze({ id: created.result.data.id, version });
}

async function verifyGrantRaceAndPersonAlias(
  owner, ownerRace, runtime, fixtures, submittedContract,
) {
  const alias = fixtures.actors.alias;
  const proposer = fixtures.actors.proposer;
  await ownerRace.query('BEGIN');
  try {
    await ownerRace.query(`
      UPDATE tenant_membership SET role_key = 'JUNIN_TIEMPO_FUENTES_APROBADOR',
        version = version + 1, updated_at = now()
      WHERE id = $1::uuid AND tenant_id = $2::uuid
    `, [alias.membershipId, alias.tenantId]);
    await expectCodeWithoutRegistryWrites(
      owner,
      fixtures,
      'TIME_SOURCE_SESSION_BUSY',
      () => getTimeSourceBootstrap(runtime, proposer.identity, proposer.session),
    );
  } finally {
    await ownerRace.query('ROLLBACK').catch(() => {});
  }

  await owner.query(`
    UPDATE tenant_membership SET role_key = 'JUNIN_TIEMPO_FUENTES_APROBADOR',
      version = version + 1, updated_at = now()
    WHERE id = $1::uuid AND tenant_id = $2::uuid
  `, [alias.membershipId, alias.tenantId]);
  try {
    await expectCodeWithoutRegistryWrites(
      owner,
      fixtures,
      'TIME_SOURCE_PERSON_SOD_CONFLICT',
      () => actorCall(runtime, alias, requestFor('approve', 3, {
        contractId: submittedContract.id,
        reasonCode: 'evidence_verified',
        reason: 'Alias sintetico no puede aprobar a la misma persona',
      })),
    );
  } finally {
    await owner.query(`
      UPDATE tenant_membership SET role_key = 'JUNIN_EMPLEADO',
        version = version + 1, updated_at = now()
      WHERE id = $1::uuid AND tenant_id = $2::uuid
    `, [alias.membershipId, alias.tenantId]);
  }
}

async function runLifecycleMatrix(owner, ownerRace, runtime, fixtures, clock, suffix) {
  const { proposer, approver, platformOwner } = fixtures.actors;

  await expectCodeWithoutRegistryWrites(
    owner,
    fixtures,
    'TIME_SOURCE_CAPABILITY_REQUIRED',
    () => getTimeSourceBootstrap(runtime, platformOwner.identity, platformOwner.session),
  );

  const shiftCreate = await executeCommand(runtime, proposer, requestFor('create_draft', 0, {
    metadata: metadataFor('shift_assignment', suffix, 1, clock),
    reasonCode: 'source_onboarding',
    reason: 'Alta sintetica de asignacion de turnos',
  }));
  const shiftId = shiftCreate.result.data.id;
  const shiftUpdate = await executeCommand(runtime, proposer, requestFor('update_draft', 1, {
    contractId: shiftId,
    metadata: metadataFor('shift_assignment', suffix, 2, clock),
    reasonCode: 'metadata_correction',
    reason: 'Correccion sintetica de metadatos de turnos',
  }));
  assert.equal(shiftUpdate.result.data.version, 2);

  await expectCodeWithoutRegistryWrites(
    owner,
    fixtures,
    'TIME_SOURCE_VERSION_CONFLICT',
    () => actorCall(runtime, proposer, requestFor('update_draft', 1, {
      contractId: shiftId,
      metadata: metadataFor('shift_assignment', suffix, 3, clock),
      reasonCode: 'metadata_correction',
      reason: 'Version sintetica obsoleta',
    })),
  );

  const shiftSubmitRequest = requestFor('submit', 2, {
    contractId: shiftId,
    reasonCode: 'ready_for_review',
    reason: 'Turnos sinteticos listos para revision',
  });
  const shiftSubmit = await executeCommand(runtime, proposer, shiftSubmitRequest);
  assert.equal(shiftSubmit.result.data.status, 'submitted');
  assert.equal(shiftSubmit.result.data.version, 3);

  await verifyGrantRaceAndPersonAlias(
    owner, ownerRace, runtime, fixtures, shiftSubmit.result.data,
  );

  const shiftApprove = await executeCommand(runtime, approver, requestFor('approve', 3, {
    contractId: shiftId,
    reasonCode: 'evidence_verified',
    reason: 'Evidencia sintetica de turnos verificada',
  }));
  assert.equal(shiftApprove.result.data.status, 'approved');
  assert.equal(shiftApprove.result.data.version, 4);

  const historical = await actorCall(
    runtime, proposer, shiftSubmit.request, shiftSubmit.idempotencyKey,
  );
  assert.equal(historical.replayed, true);
  assert.equal(historical.historical, true);
  assert.equal(historical.data.status, 'submitted');
  assert.equal(historical.data.version, 3);

  const hashMismatch = requestFor('submit', 2, {
    contractId: shiftId,
    reasonCode: 'ready_for_review',
    reason: 'Mismo idempotency con un hash de comando diferente',
  });
  await expectCodeWithoutRegistryWrites(
    owner,
    fixtures,
    'TIME_SOURCE_IDEMPOTENCY_REUSED',
    () => actorCall(runtime, proposer, hashMismatch, shiftSubmit.idempotencyKey),
  );

  const retired = await executeCommand(runtime, approver, requestFor('retire', 4, {
    contractId: shiftId,
    reasonCode: 'superseded',
    reason: 'Fuente sintetica reemplazada de forma gobernada',
  }));
  assert.equal(retired.result.data.status, 'retired');
  assert.equal(retired.result.data.version, 5);

  const shiftReplacement = await createSubmitApprove(
    runtime, proposer, approver,
    metadataFor('shift_assignment', suffix, 4, clock), 4,
  );
  const timePunch = await createSubmitApprove(
    runtime, proposer, approver,
    metadataFor('time_punch', suffix, 5, clock, clock.boundaryCut), 5,
  );

  const overlapCreate = await executeCommand(runtime, proposer, requestFor('create_draft', 0, {
    metadata: metadataFor('time_punch', suffix, 6, clock),
    reasonCode: 'source_onboarding',
    reason: 'Alta sintetica para probar superposicion',
  }));
  const overlapSubmit = await executeCommand(runtime, proposer, requestFor('submit', 1, {
    contractId: overlapCreate.result.data.id,
    reasonCode: 'ready_for_review',
    reason: 'Superposicion sintetica lista para revision',
  }));
  await expectCodeWithoutRegistryWrites(
    owner,
    fixtures,
    'TIME_SOURCE_APPROVED_OVERLAP',
    () => actorCall(runtime, approver, requestFor('approve', 2, {
      contractId: overlapCreate.result.data.id,
      reasonCode: 'evidence_verified',
      reason: 'La superposicion no debe aprobarse',
    })),
  );
  const overlapRejected = await executeCommand(runtime, approver, requestFor('reject', 2, {
    contractId: overlapCreate.result.data.id,
    reasonCode: 'metadata_invalid',
    reason: 'Cobertura sintetica superpuesta',
  }));
  assert.equal(overlapSubmit.result.data.version, 2);
  assert.equal(overlapRejected.result.data.status, 'rejected');

  const holiday = await createSubmitApprove(
    runtime, proposer, approver,
    metadataFor('holiday_calendar', suffix, 7, clock), 7,
  );

  const futureCreate = await executeCommand(runtime, proposer, requestFor('create_draft', 0, {
    metadata: metadataFor('municipal_rule_profile', suffix, 8, clock, clock.futureCut),
    reasonCode: 'source_onboarding',
    reason: 'Alta sintetica con corte futuro fuera del limite',
  }));
  await executeCommand(runtime, proposer, requestFor('submit', 1, {
    contractId: futureCreate.result.data.id,
    reasonCode: 'ready_for_review',
    reason: 'Corte futuro sintetico listo para control negativo',
  }));
  await expectCodeWithoutRegistryWrites(
    owner,
    fixtures,
    'TIME_SOURCE_CUT_AT_FUTURE',
    () => actorCall(runtime, approver, requestFor('approve', 2, {
      contractId: futureCreate.result.data.id,
      reasonCode: 'evidence_verified',
      reason: 'Corte futuro no admisible',
    })),
  );
  const futureRejected = await executeCommand(runtime, approver, requestFor('reject', 2, {
    contractId: futureCreate.result.data.id,
    reasonCode: 'metadata_invalid',
    reason: 'Corte futuro fuera del limite de cinco minutos',
  }));
  assert.equal(futureRejected.result.data.status, 'rejected');

  const ruleProfile = await createSubmitApprove(
    runtime, proposer, approver,
    metadataFor('municipal_rule_profile', suffix, 9, clock), 9,
  );
  const administrativeEvents = await createSubmitApprove(
    runtime, proposer, approver,
    metadataFor('administrative_event', suffix, 10, clock), 10,
  );

  const cancelCreate = await executeCommand(runtime, proposer, requestFor('create_draft', 0, {
    metadata: metadataFor('employment_master_reference', suffix, 11, clock),
    reasonCode: 'source_onboarding',
    reason: 'Alta sintetica que sera retirada por el proponente',
  }));
  const cancelled = await executeCommand(runtime, proposer, requestFor('cancel', 1, {
    contractId: cancelCreate.result.data.id,
    reasonCode: 'withdrawn',
    reason: 'Propuesta sintetica retirada',
  }));
  assert.equal(cancelled.result.data.status, 'cancelled');

  const crossCreate = await executeCommand(runtime, proposer, requestFor('create_draft', 0, {
    metadata: metadataFor('employment_master_reference', suffix, 12, clock),
    reasonCode: 'source_onboarding',
    reason: 'Alta sintetica para control de binding',
  }));
  const crossSubmit = await executeCommand(runtime, proposer, requestFor('submit', 1, {
    contractId: crossCreate.result.data.id,
    reasonCode: 'ready_for_review',
    reason: 'Contrato sintetico listo para control cross binding',
  }));
  const timelineCapContract = await createTimelineCapFixture(
    runtime, proposer, clock, suffix,
  );

  return Object.freeze({
    shiftReplacement,
    timePunch,
    holiday,
    ruleProfile,
    administrativeEvents,
    crossContract: Object.freeze({
      id: crossCreate.result.data.id,
      version: crossSubmit.result.data.version,
    }),
    timelineCapContract,
    durableReplay: Object.freeze({
      request: shiftSubmit.request,
      idempotencyKey: shiftSubmit.idempotencyKey,
    }),
  });
}

async function switchCertifiedBinding(owner, fixtures, bindingId) {
  await owner.query(`
    UPDATE tenant_identity_policy SET certified_source_binding_id = $2::uuid,
      version = version + 1, updated_at = now()
    WHERE tenant_id = $1::uuid
  `, [fixtures.scope.tenantId, bindingId]);
}

async function verifyCrossBindingAndIdor(owner, runtime, fixtures, matrix) {
  const crossActor = fixtures.actors.crossBindingApprover;
  const proposer = fixtures.actors.proposer;
  await switchCertifiedBinding(owner, fixtures, fixtures.alternateBindingId);
  try {
    await owner.query(`
      INSERT INTO tenant_action_employment_link (
        membership_id, tenant_id, source_binding_id, employment_contract_id,
        active, linked_by_user_email
      ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, true, $5)
    `, [crossActor.membershipId, crossActor.tenantId, crossActor.sourceBindingId,
      crossActor.contractId, proposer.email]);

    const staleDetail = await readTimeSource(
      runtime, crossActor.identity, matrix.crossContract.id, crossActor.session,
    );
    assert.equal(staleDetail.data.bindingState, 'stale');
    assert.equal(staleDetail.data.status, 'submitted');

    await expectCodeWithoutRegistryWrites(
      owner,
      fixtures,
      'TIME_SOURCE_BINDING_STALE',
      () => actorCall(runtime, crossActor, requestFor('approve', matrix.crossContract.version, {
        contractId: matrix.crossContract.id,
        reasonCode: 'evidence_verified',
        reason: 'Un binding distinto no puede aprobar el contrato historico',
      })),
    );

    const tamperedIdentity = Object.freeze({
      user: proposer.identity.user,
      tenant: Object.freeze({
        id: randomUUID(),
        membershipId: proposer.membershipId,
        source: 'membership',
      }),
    });
    await expectCodeWithoutRegistryWrites(
      owner,
      fixtures,
      'TIME_SOURCE_SESSION_INVALID',
      () => getTimeSourceBootstrap(runtime, tamperedIdentity, proposer.session),
    );
    await expectCodeWithoutRegistryWrites(
      owner,
      fixtures,
      'TIME_SOURCE_NOT_FOUND',
      () => readTimeSource(runtime, crossActor.identity, randomUUID(), crossActor.session),
    );
  } finally {
    await switchCertifiedBinding(owner, fixtures, fixtures.scope.sourceBindingId);
  }

  const cancelled = await executeCommand(runtime, proposer, requestFor('cancel', 2, {
    contractId: matrix.crossContract.id,
    reasonCode: 'withdrawn',
    reason: 'Control cross binding completado y retirado',
  }));
  assert.equal(cancelled.result.data.status, 'cancelled');
}

function readinessProjection(bootstrap) {
  return bootstrap.readiness.map((item) => ({
    key: item.key,
    domain: item.domain,
    governanceStatus: item.governanceStatus,
    readinessState: item.readinessState,
    approvedMetadata: item.approvedMetadata,
    coverageFrom: item.metadata?.coverageFrom,
    coverageTo: item.metadata?.coverageTo,
  }));
}

async function verifyTimezoneInvariance(runtime, runtimeRace, fixtures, matrix) {
  const approver = fixtures.actors.approver;
  await Promise.all([
    runtime.query("SET TIME ZONE 'UTC'"),
    runtimeRace.query("SET TIME ZONE 'Pacific/Kiritimati'"),
  ]);
  const [utcBootstrap, kiritimatiBootstrap] = await Promise.all([
    getTimeSourceBootstrap(runtime, approver.identity, approver.session),
    getTimeSourceBootstrap(runtimeRace, approver.identity, approver.session),
  ]);
  assert.equal(utcBootstrap.feature.catalogApproved, true);
  assert.equal(kiritimatiBootstrap.feature.catalogApproved, true);
  assert.deepEqual(readinessProjection(utcBootstrap), readinessProjection(kiritimatiBootstrap));
  assert.equal(utcBootstrap.readiness.length, 5);
  assert.deepEqual(
    utcBootstrap.readiness.map((item) => item.key),
    ['shiftAssignment', 'timePunches', 'holidayCalendar',
      'municipalRuleProfile', 'administrativeEvents'],
  );
  for (const item of utcBootstrap.readiness.slice(0, 4)) {
    assert.equal(item.readinessState, 'registered_metadata');
    assert.equal(item.approvedMetadata, true);
    assert.equal(item.governanceStatus, 'approved');
  }
  assert.equal(utcBootstrap.readiness[4].readinessState, 'partial_reference');
  assert.equal(utcBootstrap.readiness[4].approvedMetadata, true);
  assertEngineClosed(utcBootstrap.feature);
  assertEngineClosed(kiritimatiBootstrap.feature);

  const [utcList, kiritimatiList] = await Promise.all([
    listTimeSources(runtime, approver.identity, {
      domain: 'shift_assignment', status: 'approved', page: 1, limit: 50,
    }, approver.session),
    listTimeSources(runtimeRace, approver.identity, {
      domain: 'shift_assignment', status: 'approved', page: 1, limit: 50,
    }, approver.session),
  ]);
  const replacementId = matrix.shiftReplacement.approved.result.data.id;
  const utcRecord = utcList.data.find((item) => item.id === replacementId);
  const kiritimatiRecord = kiritimatiList.data.find((item) => item.id === replacementId);
  assert.ok(utcRecord && kiritimatiRecord);
  assert.equal(utcRecord.governanceStatus, 'approved');
  assert.equal(kiritimatiRecord.governanceStatus, 'approved');
  assert.equal(utcRecord.bindingState, 'current');
  assert.equal(kiritimatiRecord.bindingState, 'current');
}

async function verifyAuditAndPublicShape(owner, runtime, fixtures, matrix) {
  const { proposer, approver } = fixtures.actors;
  const contractId = matrix.shiftReplacement.approved.result.data.id;
  const audited = await readTimeSource(runtime, approver.identity, contractId, approver.session);
  assert.equal(audited.auditAvailable, true);
  assert.equal(audited.timelineTruncated, false);
  assert.equal(audited.timelineLimit, 100);
  assert.deepEqual(audited.timeline.map((event) => event.command),
    ['create_draft', 'submit', 'approve']);
  for (const event of audited.timeline) {
    assert.equal(Object.hasOwn(event, 'id'), false);
    assert.equal(Object.hasOwn(event, 'reasonHash'), false);
  }
  const proposerView = await readTimeSource(runtime, proposer.identity, contractId, proposer.session);
  assert.equal(proposerView.auditAvailable, false);
  assert.deepEqual(proposerView.timeline, []);

  const capped = await readTimeSource(
    runtime, approver.identity, matrix.timelineCapContract.id, approver.session,
  );
  assert.equal(capped.auditAvailable, true);
  assert.equal(capped.timeline.length, 100);
  assert.equal(capped.timelineTruncated, true);
  assert.equal(capped.timelineLimit, 100);
  assert.equal(capped.timeline.at(-1)?.resultingVersion, matrix.timelineCapContract.version);
  assert.ok(capped.timeline.every((event) => (
    !Object.hasOwn(event, 'id') && !Object.hasOwn(event, 'reasonHash')
  )));

  const rawDetail = await runtime.query(`
    SELECT time_source_registry_detail_v1(
      $1, $2::uuid, $3, $4, $5::uuid, $6::uuid, $7::uuid
    ) AS result
  `, [approver.email, approver.sessionId, approver.session.version,
    approver.session.releaseSha, approver.tenantId, approver.membershipId, contractId]);
  const rawTimeline = rows(rawDetail)[0]?.result?.timeline;
  assert.ok(Array.isArray(rawTimeline) && rawTimeline.length === 3);
  assert.ok(rawTimeline.every((event) => (
    !Object.hasOwn(event, 'id') && !Object.hasOwn(event, 'reasonHash')
  )));

  for (const value of [audited.data, proposerView.data, ...audited.timeline]) {
    const serialized = JSON.stringify(value);
    assert.doesNotMatch(serialized,
      /actorEmail|actorPersonId|membershipId|sessionId|tenantId|certifiedBindingId|releaseSha|reason(?!Code|Hash)/i);
    assert.doesNotMatch(serialized, /@local\.invalid/i);
  }

  const stored = await owner.query(`
    SELECT count(*)::integer AS events,
      count(*) FILTER (WHERE id IS NULL OR reason_hash !~ '^[a-f0-9]{64}$')::integer
        AS audit_identity_drift,
      count(*) FILTER (WHERE before_snapshot::text ~* '@|actor_email|dni|cuil|reason_text'
        OR after_snapshot::text ~* '@|actor_email|dni|cuil|reason_text'
        OR result::text ~* '@|actor_email|dni|cuil|reason_text')::integer AS unsafe
    FROM time_source_governance_event
    WHERE tenant_id = $1::uuid
  `, [fixtures.scope.tenantId]);
  assert.ok(Number(rows(stored)[0]?.events) > 0);
  assert.equal(Number(rows(stored)[0]?.audit_identity_drift), 0);
  assert.equal(Number(rows(stored)[0]?.unsafe), 0);
}

async function verifyRevokeRace(owner, ownerRace, runtime, fixtures, matrix) {
  const proposer = fixtures.actors.proposer;
  await ownerRace.query('BEGIN');
  try {
    await ownerRace.query(`
      UPDATE tenant_membership SET status = 'suspended', suspended_at = now(),
        version = version + 1, updated_at = now()
      WHERE id = $1::uuid AND tenant_id = $2::uuid
    `, [proposer.membershipId, proposer.tenantId]);
    await expectCodeWithoutRegistryWrites(
      owner,
      fixtures,
      'TIME_SOURCE_SESSION_BUSY',
      () => actorCall(runtime, proposer,
        matrix.durableReplay.request, matrix.durableReplay.idempotencyKey),
    );
  } finally {
    await ownerRace.query('ROLLBACK').catch(() => {});
  }

  await owner.query(`
    UPDATE tenant_membership SET status = 'suspended', suspended_at = now(),
      version = version + 1, updated_at = now()
    WHERE id = $1::uuid AND tenant_id = $2::uuid
  `, [proposer.membershipId, proposer.tenantId]);
  await expectCodeWithoutRegistryWrites(
    owner,
    fixtures,
    'TIME_SOURCE_SESSION_INVALID',
    () => actorCall(runtime, proposer,
      matrix.durableReplay.request, matrix.durableReplay.idempotencyKey),
  );
}

async function stage(name, operation) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof QaStageError) throw error;
    throw new QaStageError(name, error);
  }
}

async function safeRollback(client) {
  if (!client) return;
  await client.query('ROLLBACK').catch(() => {});
}

export function buildSafeSummary() {
  return Object.freeze({
    ok: true,
    backendFreezeVerified: true,
    isolatedBranchVerified: true,
    disposableBranchConfirmed: true,
    migrationAppliedAndReapplied: true,
    migrationBytesHashVerified: true,
    runtimeIdentityVerified: true,
    globalSecurityDefinerAllowlistVerified: true,
    directRuntimeRelationsAndSequencesDenied: true,
    exactTimeSourceRolesVerified: true,
    platformOwnerNoInheritanceVerified: true,
    metadataLifecycleVerified: true,
    piiMetadataFuzzRejected: true,
    durableHistoricalReplayVerified: true,
    idempotencyHashAndVersioningVerified: true,
    personAliasMakerCheckerVerified: true,
    approvedOverlapDenied: true,
    cutAtFiveMinuteBoundaryVerified: true,
    crossTenantIdorDenied: true,
    crossBindingStaleVerified: true,
    databaseTimezoneInvarianceVerified: true,
    timelineCapVerified: true,
    certifyDataPlaneRaceVerified: true,
    grantAndRevokeRacesVerified: true,
    protectedDataUnchanged: true,
    syntheticControlPlaneFixturesOnly: true,
    protectedSourceRowsReadOnly: true,
    usesExistingProtectedReferences: true,
    evaluationEngineStillClosed: true,
    piiPrinted: false,
  });
}

export function buildSafeFailure(error) {
  return Object.freeze({
    ok: false,
    stage: /^[a-z][a-z0-9-]{1,47}$/.test(String(error?.stage || ''))
      ? error.stage : 'startup',
    code: safeErrorCode(error),
    piiPrinted: false,
  });
}

export async function runGovernedTimeSourceRegistryLive({
  env = process.env,
  argv = process.argv.slice(2),
  ClientClass = Client,
  migrationExecutor = defaultMigrationExecutor,
} = {}) {
  const config = loadGovernedTimeSourceQaConfig(env, argv);
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  let owner;
  let ownerRace;
  let runtime;
  let runtimeRace;
  let protectedBaseline;

  await stage('local-freeze', () => verifyTimeSourceBackendFreeze());
  await stage('branch-preflight', () => preflightBranchIdentity(config, ClientClass));
  await stage('migration-apply-reapply', () => (
    runTimeSourceMigrationTwice(config, migrationExecutor)
  ));

  owner = new ClientClass({ connectionString: config.ownerUrl });
  ownerRace = new ClientClass({ connectionString: config.ownerUrl });
  runtime = new ClientClass({ connectionString: config.runtimeUrl });
  runtimeRace = new ClientClass({ connectionString: config.runtimeUrl });

  try {
    await stage('connect', async () => {
      await Promise.all([
        owner.connect(), ownerRace.connect(), runtime.connect(), runtimeRace.connect(),
      ]);
      await Promise.all([
        owner.query("SET statement_timeout = '30s'"),
        ownerRace.query("SET statement_timeout = '10s'"),
        runtime.query("SET statement_timeout = '10s'"),
        runtimeRace.query("SET statement_timeout = '10s'"),
      ]);
    });
    await stage('branch-identity', async () => {
      const identities = await Promise.all([
        verifyConnectionIdentity(owner, config),
        verifyConnectionIdentity(ownerRace, config),
        verifyConnectionIdentity(runtime, config),
        verifyConnectionIdentity(runtimeRace, config),
      ]);
      for (const identity of identities.slice(0, 2)) {
        guard(identity.currentUser === config.ownerUser && identity.sessionUser === config.ownerUser,
          'QA_OWNER_IDENTITY_DRIFT', 'Credencial owner inesperada');
      }
      for (const identity of identities.slice(2)) {
        guard(identity.currentUser === RUNTIME_ROLE && identity.sessionUser === RUNTIME_ROLE,
          'QA_RUNTIME_IDENTITY_DRIFT', 'Credencial runtime inesperada');
      }
    });
    await stage('migration-bytes-hash', () => verifyInstalledMigration(owner));
    await stage('schema-evidence', () => verifyTimeSourceFinalAcl(owner));
    await stage('runtime-acl', async () => {
      validateRuntimeBoundaryEvidence(await collectRuntimeBoundaryEvidence(owner, runtime));
      await verifyDirectRuntimeDenials(runtime);
      await verifyGlobalSecurityDefinerCanary(owner, suffix);
      validateRuntimeBoundaryEvidence(await collectRuntimeBoundaryEvidence(owner, runtime));
    });
    await stage('role-catalog', async () => {
      validateRoleCatalogEvidence(await collectRoleCatalogEvidence(owner));
    });
    await stage('clean-disposable-registry', () => verifyCleanRegistry(owner));
    protectedBaseline = await stage('protected-baseline', () => protectedDataFingerprint(owner));

    const scope = await stage('fixture-source', () => selectQaScope(owner));
    const fixtures = await stage('fixture-seed', () => seedFixtures(owner, scope, suffix));
    await stage('fixture-capabilities', () => verifyFixtureCapabilities(owner, fixtures));
    const clock = await stage('database-clock', () => serverClock(owner));
    await stage('pii-metadata-fuzz', () => (
      verifyPiiMetadataFuzz(owner, runtime, fixtures, clock, suffix)
    ));
    await stage('certify-data-plane-race', () => (
      verifyCertifyDataPlaneRace(owner, runtime, runtimeRace, fixtures, clock, suffix)
    ));
    const matrix = await stage('workflow-matrix', () => (
      runLifecycleMatrix(owner, ownerRace, runtime, fixtures, clock, suffix)
    ));
    await stage('cross-binding-idor', () => (
      verifyCrossBindingAndIdor(owner, runtime, fixtures, matrix)
    ));
    await stage('timezone-invariance', () => (
      verifyTimezoneInvariance(runtime, runtimeRace, fixtures, matrix)
    ));
    await stage('audit-minimization', () => (
      verifyAuditAndPublicShape(owner, runtime, fixtures, matrix)
    ));
    await stage('grant-revoke-races', () => (
      verifyRevokeRace(owner, ownerRace, runtime, fixtures, matrix)
    ));
    await stage('protected-final', async () => {
      assert.deepEqual(await protectedDataFingerprint(owner), protectedBaseline);
    });
    return buildSafeSummary();
  } finally {
    await Promise.all([
      safeRollback(runtime), safeRollback(runtimeRace),
      safeRollback(ownerRace), safeRollback(owner),
    ]);
    await Promise.all([
      runtimeRace?.end().catch(() => {}),
      runtime?.end().catch(() => {}),
      ownerRace?.end().catch(() => {}),
      owner?.end().catch(() => {}),
    ]);
  }
}

function isMainModule() {
  return Boolean(process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url);
}

if (isMainModule()) {
  try {
    const summary = await runGovernedTimeSourceRegistryLive();
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify(buildSafeFailure(error))}\n`);
    process.exitCode = 1;
  }
}
