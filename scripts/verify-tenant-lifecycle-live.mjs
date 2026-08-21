import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { Client } from '@neondatabase/serverless';

import { splitPostgresStatements } from './lib/sql-statements.mjs';

const CONFIRMATION_FLAG = '--confirm-isolated-branch';
const MIGRATION_VERSION = '009-tenant-lifecycle-hardening';
const MIGRATION_URL = new URL('./migrations/009-tenant-lifecycle-hardening.sql', import.meta.url);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';
const RUN_LOCK_KEY = 'municipio-junin-friendly:lifecycle-009-live-qa-run';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA40 = /^[a-f0-9]{40}$/;
const SAFE_CODE = /^(?:[A-Z][A-Z0-9_]{1,63}|[0-9A-Z]{5}|ERR_ASSERTION)$/;

export const EXPECTED_RUNTIME_SECURITY_DEFINERS = Object.freeze([
  'public.action_center_context_v2(text,uuid,integer,text,uuid,uuid)',
  'public.action_center_tenant_bootstrap_v2(text,uuid,integer,text,uuid,uuid,text)',
  'public.action_center_tenant_list_v2(text,uuid,integer,text,uuid,uuid,text,text,text,integer,integer)',
  'public.action_center_tenant_detail_v2(text,uuid,integer,text,uuid,uuid,uuid)',
  'public.action_center_tenant_routing_v2(text,uuid,integer,text,uuid,uuid,uuid)',
  'public.action_center_apply_tenant_command(text,uuid,integer,text,uuid,uuid,text,text,uuid,integer,uuid,text,jsonb,uuid,text,text,text,text,boolean)',
  'public.tenant_iam_apply_command_v2(text,uuid,integer,text,uuid,text,integer,jsonb)',
  'public.tenant_identity_resolve_access(text,uuid,integer,integer,text[],text)',
  'public.tenant_identity_take_rate_limit(text,text,integer,integer,integer)',
  'public.tenant_identity_record_attempt(text,boolean,bigint)',
  'public.tenant_identity_lookup(text,text,text,text)',
  'public.tenant_identity_view(text,uuid,text,integer)',
  'public.tenant_identity_apply_command(text,text,uuid,text,integer,jsonb)',
  'public.tenant_identity_legacy_session_policy(text)',
  'public.action_center_apply_overtime_command_v1(text,uuid,integer,text,uuid,uuid,text,uuid,integer,uuid,text,jsonb,uuid,text,text,text,boolean)',
  'public.action_center_overtime_bootstrap_v1(text,uuid,integer,text,uuid,uuid,text)',
  'public.action_center_overtime_list_v1(text,uuid,integer,text,uuid,uuid,text,integer,integer)',
  'public.action_center_overtime_detail_v1(text,uuid,integer,text,uuid,uuid,uuid)',
  'public.action_center_overtime_routing_v1(text,uuid,integer,text,uuid,uuid,uuid)',
  'public.tenant_identity_apply_platform_command_v2(text,uuid,integer,text,text,uuid,text,integer,jsonb)',
  'public.tenant_identity_platform_invitation_delivery_v2(text,uuid,integer,text,uuid)',
  'public.tenant_identity_platform_command_replay_v2(text,uuid,integer,text,uuid,text,integer,uuid)',
  'public.tenant_identity_platform_invitations_view_v2(text,uuid,integer,text,integer)',
  'public.tenant_action_apply_provisioning_command_v2(text,uuid,integer,text,uuid,text,uuid,text,integer,jsonb)',
  'public.tenant_action_lookup_employment_v2(text,uuid,integer,text,uuid,text,integer)',
  'public.tenant_iam_admin_view_v3(text,uuid,integer,text,text,uuid,integer)',
]);

const EXPECTED_SECURITY_DEFINER_SET = new Set(EXPECTED_RUNTIME_SECURITY_DEFINERS);
export const PROTECTED_DATA_RELATIONS = Object.freeze([
  'source_import_batch',
  'source_staging_row',
  'source_xref',
  'person_identity',
  'person_identity_assertion',
  'crosswalk_persona',
  'employment_contract',
  'employment_status_snapshot',
  'employment_movement',
  'data_quality_issue',
  'grh_employees',
  'grh_absences',
  'grh_catalog_rows',
  'payroll_run',
  'payroll_snapshot_assignment',
  'payroll_monthly_fact',
]);

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
    throw new QaContractError('QA_CONNECTION_INVALID', `${label} inválida`);
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

export function loadTenantLifecycleQaConfig(env = process.env, argv = process.argv.slice(2)) {
  guard(argv.includes(CONFIRMATION_FLAG), 'QA_CONFIRMATION_REQUIRED', `Falta ${CONFIRMATION_FLAG}`);

  const branchId = String(env.ACTION_CENTER_QA_BRANCH_ID || '').trim();
  const projectId = String(env.ACTION_CENTER_QA_PROJECT_ID || '').trim();
  const qaEndpointHost = String(env.ACTION_CENTER_QA_ENDPOINT_HOST || '').trim().toLowerCase();
  const productionBranchId = String(env.CANONICAL_PRODUCTION_BRANCH_ID || '').trim();
  const productionEndpointHost = String(env.CANONICAL_PRODUCTION_HOST || '').trim().toLowerCase();
  const databaseName = String(env.TENANT_LIFECYCLE_QA_DATABASE_NAME || 'neondb').trim();
  const releaseSha = String(env.TENANT_LIFECYCLE_QA_RELEASE_SHA || '').trim().toLowerCase();

  guard(/^br-[a-z0-9-]+$/i.test(branchId), 'QA_BRANCH_INVALID', 'Branch QA inválida');
  guard(/^[a-z0-9-]+$/i.test(projectId), 'QA_PROJECT_INVALID', 'Project QA inválido');
  guard(neonEndpointHost(qaEndpointHost), 'QA_HOST_INVALID', 'Host QA inválido');
  guard(/^br-[a-z0-9-]+$/i.test(productionBranchId),
    'QA_PRODUCTION_GUARD_INVALID', 'Branch productiva ausente');
  guard(neonEndpointHost(productionEndpointHost),
    'QA_PRODUCTION_GUARD_INVALID', 'Host productivo ausente');
  guard(SHA40.test(releaseSha), 'QA_RELEASE_INVALID', 'Release QA inválido');
  guard(branchId !== productionBranchId, 'QA_PRODUCTION_TARGET_FORBIDDEN',
    'La rama QA coincide con Producción');
  guard(canonicalEndpointHost(qaEndpointHost) !== canonicalEndpointHost(productionEndpointHost),
    'QA_PRODUCTION_TARGET_FORBIDDEN', 'El endpoint QA coincide con Producción');

  const owner = postgresUrl(env.DATABASE_URL_UNPOOLED, 'DATABASE_URL_UNPOOLED');
  const runtime = postgresUrl(env.ACTIONS_DATABASE_URL, 'ACTIONS_DATABASE_URL');
  guard(directEndpointHost(owner.hostname), 'QA_OWNER_MUST_BE_UNPOOLED',
    'Owner debe usar endpoint directo');
  guard(canonicalEndpointHost(owner.hostname) === canonicalEndpointHost(qaEndpointHost),
    'QA_HOST_MISMATCH', 'Owner no apunta al endpoint QA');
  guard(canonicalEndpointHost(runtime.hostname) === canonicalEndpointHost(qaEndpointHost),
    'QA_HOST_MISMATCH', 'Runtime no apunta al endpoint QA');
  guard(canonicalEndpointHost(owner.hostname) !== canonicalEndpointHost(productionEndpointHost)
      && canonicalEndpointHost(runtime.hostname) !== canonicalEndpointHost(productionEndpointHost),
  'QA_PRODUCTION_TARGET_FORBIDDEN', 'Una conexión apunta a Producción');
  guard(owner.href !== runtime.href, 'QA_CREDENTIAL_SEPARATION_REQUIRED',
    'Owner y runtime comparten URL');

  const ownerUser = decodeURIComponent(owner.username);
  const runtimeUser = decodeURIComponent(runtime.username);
  guard(ownerUser !== runtimeUser, 'QA_CREDENTIAL_SEPARATION_REQUIRED',
    'Owner y runtime comparten rol');
  guard(runtimeUser === RUNTIME_ROLE, 'QA_RUNTIME_ROLE_INVALID',
    'La URL runtime no usa el rol dedicado');
  guard(owner.pathname.slice(1) === databaseName && runtime.pathname.slice(1) === databaseName,
    'QA_DATABASE_MISMATCH', 'Las conexiones no apuntan a la base QA esperada');

  return Object.freeze({
    branchId,
    projectId,
    qaEndpointHost: canonicalEndpointHost(qaEndpointHost),
    productionBranchId,
    productionEndpointHost: canonicalEndpointHost(productionEndpointHost),
    databaseName,
    releaseSha,
    ownerUrl: owner.href,
    runtimeUrl: runtime.href,
    ownerUser,
    runtimeUser,
  });
}

export function lifecycleFixtureEmail(kind, suffix) {
  const normalizedKind = String(kind || '').trim().toLowerCase();
  const normalizedSuffix = String(suffix || '').trim().toLowerCase();
  guard(/^[a-z][a-z0-9-]{1,31}$/.test(normalizedKind),
    'QA_FIXTURE_KIND_INVALID', 'Tipo de fixture inválido');
  guard(/^[a-f0-9]{12}$/.test(normalizedSuffix),
    'QA_FIXTURE_SUFFIX_INVALID', 'Sufijo de fixture inválido');
  return `qa-lifecycle-${normalizedKind}-${normalizedSuffix}@local.invalid`;
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

function commandHash(command, expectedVersion, payload, releaseSha = null) {
  return createHash('sha256').update(stableJson({
    command, expectedVersion, payload, ...(releaseSha ? { releaseSha } : {}),
  })).digest('hex');
}

function derivedReleaseSha(releaseSha, phase) {
  return createHash('sha256').update(`${releaseSha}:qa-lifecycle:${phase}`).digest('hex').slice(0, 40);
}

export async function localTenantLifecycleMigrationChecksum() {
  return createHash('sha256').update(await readFile(MIGRATION_URL)).digest('hex');
}

export function validateRuntimeBoundaryEvidence(evidence) {
  const identity = evidence?.identity;
  guard(identity?.currentUser === RUNTIME_ROLE && identity?.sessionUser === RUNTIME_ROLE,
    'QA_RUNTIME_IDENTITY_DRIFT', 'La conexión runtime no usa el rol dedicado');

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
    'QA_RUNTIME_OBJECT_OWNERSHIP', 'Runtime es owner de objetos no sistémicos');

  const signatures = (evidence?.securityDefiners || []).map((item) => String(item.signature || ''));
  const actual = new Set(signatures);
  guard(actual.size === signatures.length, 'QA_SECDEF_DUPLICATE',
    'Inventario SECURITY DEFINER duplicado');
  const missing = EXPECTED_RUNTIME_SECURITY_DEFINERS.find((signature) => !actual.has(signature));
  const extra = signatures.find((signature) => !EXPECTED_SECURITY_DEFINER_SET.has(signature));
  guard(!missing, 'QA_SECDEF_MISSING', 'Falta un SECURITY DEFINER permitido');
  guard(!extra, 'QA_SECDEF_OUTSIDE_ALLOWLIST',
    'Runtime ejecuta SECURITY DEFINER fuera de allowlist');
  guard(signatures.length === EXPECTED_RUNTIME_SECURITY_DEFINERS.length,
    'QA_SECDEF_INVENTORY_DRIFT', 'Inventario SECURITY DEFINER no es exacto');
  guard(Array.isArray(evidence?.relations) && evidence.relations.length === 0,
    'QA_RUNTIME_RELATION_PRIVILEGE', 'Runtime conserva privilegios directos sobre relaciones');
  guard(Array.isArray(evidence?.sequences) && evidence.sequences.length === 0,
    'QA_RUNTIME_SEQUENCE_PRIVILEGE', 'Runtime conserva privilegios directos sobre secuencias');
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
    SELECT candidate.rolname AS name
    FROM pg_roles candidate
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
    'QA_CONTROL_PLANE_MISMATCH', 'La conexión no coincide con branch/project corroborados');
  guard(identity?.branchId !== config.productionBranchId && identity?.databaseName === config.databaseName,
    'QA_PRODUCTION_TARGET_FORBIDDEN', 'Identidad de base no aislada');
  return identity;
}

async function acquireRunLock(owner) {
  const result = await owner.query(`
    SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked
  `, [RUN_LOCK_KEY]);
  guard(rows(result)[0]?.locked === true, 'QA_CONCURRENT_RUN_FORBIDDEN',
    'Ya existe un harness lifecycle activo en esta base');
}

async function releaseRunLock(owner) {
  const result = await owner.query(`
    SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS unlocked
  `, [RUN_LOCK_KEY]);
  guard(rows(result)[0]?.unlocked === true, 'QA_RUN_LOCK_RELEASE_FAILED',
    'No se pudo liberar el lock del harness');
}

async function verifyInstalledMigration(owner) {
  const expectedChecksum = await localTenantLifecycleMigrationChecksum();
  const result = await owner.query(`
    SELECT checksum_sha256 FROM schema_migrations WHERE version = $1
  `, [MIGRATION_VERSION]);
  guard(result.rowCount === 1, 'QA_MIGRATION_MISSING', 'Migración 009 ausente');
  guard(String(rows(result)[0]?.checksum_sha256 || '').trim() === expectedChecksum,
    'QA_MIGRATION_CHECKSUM_DRIFT', 'Checksum instalado no coincide con el artefacto local');
  return expectedChecksum;
}

async function expectPgCode(expectedCode, operation) {
  let caught;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `se esperaba rechazo ${expectedCode}`);
  assert.equal(caught.code, expectedCode);
}

async function expectDatabaseContract(expectedCode, operation) {
  let caught;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `se esperaba contrato ${expectedCode}`);
  assert.equal(caught.code, 'P0001');
  assert.ok(String(caught.message || '').includes(expectedCode));
}

async function verifyDirectRuntimeDenials(runtime) {
  await expectPgCode('42501', () => runtime.query(
    'UPDATE public.tenant_identity_policy SET updated_at = updated_at WHERE false',
  ));
  await expectPgCode('42501', () => runtime.query(
    'SELECT public.tenant_action_authority_snapshot(NULL::uuid)',
  ));
  await expectPgCode('42501', () => runtime.query(`
    SELECT public.tenant_identity_apply_command_core_009(
      '', '', NULL::uuid, '', NULL::integer, '{}'::jsonb
    )
  `));
  await expectPgCode('42501', () => runtime.query(`
    SELECT public.tenant_action_apply_provisioning_command(
      '', NULL::uuid, NULL::uuid, NULL::uuid, '', NULL::uuid, '', NULL::integer, '{}'::jsonb
    )
  `));
  await expectPgCode('42501', () => runtime.query(
    "SELECT public.tenant_iam_admin_view_v2('', NULL::uuid, NULL::integer, 'bootstrap', 1)",
  ));
  await expectPgCode('42501', () => runtime.query(
    "SELECT public.tenant_identity_command_replay('', NULL::uuid, '')",
  ));
}

async function verifyGlobalSecurityDefinerCanary(owner, suffix) {
  const functionName = `qa_lifecycle_secdef_${suffix}`;
  guard(/^[a-z][a-z0-9_]+$/.test(functionName), 'QA_CANARY_INVALID',
    'Nombre de canary inválido');
  await owner.query('BEGIN');
  try {
    await owner.query(`
      CREATE FUNCTION public.${functionName}()
      RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER
      SET search_path = public, pg_temp AS $$ SELECT 1 $$
    `);
    await owner.query(`GRANT EXECUTE ON FUNCTION public.${functionName}() TO ${RUNTIME_ROLE}`);
    const securityDefiners = await executableSecurityDefiners(owner);
    assert.throws(() => validateRuntimeBoundaryEvidence({
      identity: { currentUser: RUNTIME_ROLE, sessionUser: RUNTIME_ROLE },
      role: {
        canLogin: true, inherit: false, superuser: false, bypassRls: false,
        createDb: false, createRole: false, replication: false,
      },
      schema: { usage: true, create: false },
      database: { connect: true, create: false },
      schemas: [{ name: 'public', usage: true, create: false }],
      memberships: [],
      ownedObjects: [],
      securityDefiners,
      relations: [],
      sequences: [],
    }), (error) => error?.code === 'QA_SECDEF_OUTSIDE_ALLOWLIST');
  } finally {
    await owner.query('ROLLBACK').catch(() => {});
  }
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

async function verifyMigrationReapply(owner, expectedChecksum) {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  const statements = splitPostgresStatements(migration);
  guard(statements.length > 100, 'QA_MIGRATION_SPLIT_INVALID',
    'La migración 009 no produjo el inventario esperado');
  await owner.query('BEGIN');
  try {
    await owner.query("SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:lifecycle-009-live-qa'))");
    for (const statement of statements) await owner.query(statement);
    const installed = await owner.query(`
      SELECT checksum_sha256 FROM schema_migrations WHERE version = $1
    `, [MIGRATION_VERSION]);
    guard(installed.rowCount === 1
        && String(rows(installed)[0]?.checksum_sha256 || '').trim() === expectedChecksum,
    'QA_MIGRATION_CHECKSUM_DRIFT', 'Reapply alteró el registro de migración');
    await owner.query('ROLLBACK');
  } catch (error) {
    await owner.query('ROLLBACK').catch(() => {});
    throw new QaContractError('QA_MIGRATION_REAPPLY_FAILED',
      `La migración 009 no recompila de forma idempotente: ${safeErrorCode(error)}`);
  }
}

export async function selectQaSource(owner) {
  const result = await owner.query(`
    WITH eligible_bindings AS MATERIALIZED (
      SELECT binding.id, binding.tenant_id,
        binding.source_database, binding.source_company_id,
        tenant.status
      FROM platform_tenant_source_binding binding
      JOIN platform_tenant tenant ON tenant.id = binding.tenant_id
        AND tenant.status IN ('onboarding', 'active')
        AND tenant.slug NOT LIKE 'qa-lifecycle-%'
      JOIN tenant_identity_policy policy ON policy.tenant_id = tenant.id
      WHERE binding.source_system = 'GRH' AND binding.verified IS TRUE
    ),
    candidates AS (
      SELECT binding.id, binding.tenant_id, binding.status,
        binding.source_database, binding.source_company_id,
        batch.id AS batch_id, batch.source_cutoff,
        (array_agg(contract.id::text ORDER BY contract.id))[1:4] AS contract_ids
      FROM eligible_bindings binding
      JOIN employment_contract contract
        ON contract.legacy_company_id = binding.source_company_id
      JOIN source_import_batch batch ON batch.id = contract.source_batch_id
        AND batch.source_system = 'GRH'
        AND batch.source_database = binding.source_database
        AND batch.validation_state = 'published'
        AND batch.legacy_import_run_id IS NOT NULL
      WHERE contract.status = 'active' AND contract.source_system = 'GRH'
        AND NOT EXISTS (
          SELECT 1 FROM tenant_action_employment_link existing_link
          WHERE existing_link.employment_contract_id = contract.id
        )
      GROUP BY binding.id, binding.tenant_id, binding.status,
        binding.source_database, binding.source_company_id,
        batch.id, batch.source_cutoff
      HAVING count(*) >= 4
    ),
    ranked_candidates AS (
      SELECT candidate.*,
        row_number() OVER (
          PARTITION BY candidate.id
          ORDER BY candidate.source_cutoff DESC, candidate.batch_id
        ) AS batch_rank
      FROM candidates candidate
    )
    SELECT candidate.tenant_id::text AS "operationalTenantId",
      candidate.id::text AS "operationalBindingId",
      candidate.batch_id::text AS "sourceBatchId",
      candidate.source_database AS "sourceDatabase",
      candidate.source_company_id::text AS "sourceCompanyId",
      candidate.contract_ids AS "contractIds"
    FROM ranked_candidates candidate
    WHERE candidate.batch_rank = 1
    ORDER BY (candidate.status = 'active') DESC, candidate.id
    LIMIT 2
  `);
  guard(result.rowCount > 0, 'QA_OPERATIONAL_BINDING_REQUIRED',
    'No hay binding GRH verificado elegible');
  guard(result.rowCount === 1, 'QA_OPERATIONAL_BINDING_AMBIGUOUS',
    'Hay más de un binding GRH verificado elegible');
  const value = rows(result)[0];
  guard(UUID.test(String(value.operationalTenantId || ''))
      && UUID.test(String(value.operationalBindingId || ''))
      && UUID.test(String(value.sourceBatchId || ''))
      && typeof value.sourceDatabase === 'string' && value.sourceDatabase.length > 0
      && /^[0-9]+$/.test(String(value.sourceCompanyId || ''))
      && Array.isArray(value.contractIds) && value.contractIds.length === 4
      && value.contractIds.every((id) => UUID.test(String(id || ''))),
  'QA_FIXTURE_SOURCE_INVALID', 'Selección de contratos inválida');
  return Object.freeze({
    operationalTenantId: String(value.operationalTenantId),
    operationalBindingId: String(value.operationalBindingId),
    sourceBatchId: String(value.sourceBatchId),
    sourceDatabase: value.sourceDatabase,
    sourceCompanyId: String(value.sourceCompanyId),
    contractIds: Object.freeze(value.contractIds.map(String)),
  });
}

function platformActorFixture(suffix) {
  const email = lifecycleFixtureEmail('platform-owner', suffix);
  return Object.freeze({
    email,
    sessionId: randomUUID(),
    sessionVersion: 1,
  });
}

async function seedPlatformActor(owner, actor) {
  await owner.query('BEGIN');
  try {
    await owner.query(`
      INSERT INTO internal_users (
        email, display_name, role, password_hash, active, auth_mode, identity_version
      ) VALUES ($1, 'QA sintético aislado', 'EMPLEADO', NULL, true, 'managed', 1)
    `, [actor.email]);
    await owner.query(`
      INSERT INTO platform_user_role (
        user_email, role_key, active, granted_by_user_email
      ) VALUES ($1, 'PLATFORM_OWNER', true, $1)
    `, [actor.email]);
    await owner.query(`
      INSERT INTO tenant_identity_session (
        id, user_email, active_tenant_id, source, auth_level,
        session_version, identity_version, status, device_label,
        last_seen_at, expires_at
      ) VALUES (
        $1::uuid, $2, NULL, 'platform', 'mfa', 1, 1,
        'active', 'QA aislada', now(), now() + interval '2 hours'
      )
    `, [actor.sessionId, actor.email]);
    await owner.query('COMMIT');
  } catch (error) {
    await owner.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

function iamRequest(command, expectedVersion, payload, idempotencyKey = randomUUID()) {
  return Object.freeze({
    command,
    expectedVersion,
    payload: Object.freeze({ ...payload }),
    idempotencyKey,
    hash: commandHash(command, expectedVersion, payload),
  });
}

function platformRequest(command, expectedVersion, payload, releaseSha,
  idempotencyKey = randomUUID()) {
  return Object.freeze({
    command,
    expectedVersion,
    payload: Object.freeze({ ...payload }),
    releaseSha,
    idempotencyKey,
    hash: commandHash(command, expectedVersion, payload, releaseSha),
  });
}

function provisioningRequest(command, expectedVersion, payload, releaseSha,
  idempotencyKey = randomUUID()) {
  return platformRequest(command, expectedVersion, payload, releaseSha, idempotencyKey);
}

async function applyIamCommand(client, actor, request) {
  const result = await client.query(`
    SELECT tenant_iam_apply_command_v2(
      $1, $2::uuid, $3, $4, $5::uuid, $6, $7, $8::jsonb
    ) AS result
  `, [actor.email, actor.sessionId, actor.sessionVersion,
    request.command, request.idempotencyKey, request.hash,
    request.expectedVersion, JSON.stringify(request.payload)]);
  return rows(result)[0]?.result || {};
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

async function applyProvisioningCommand(client, actor, membershipId, request) {
  const result = await client.query(`
    SELECT tenant_action_apply_provisioning_command_v2(
      $1, $2::uuid, $3, $4, $5::uuid, $6, $7::uuid, $8, $9, $10::jsonb
    ) AS result
  `, [actor.email, actor.sessionId, actor.sessionVersion, request.releaseSha,
    membershipId, request.command, request.idempotencyKey, request.hash,
    request.expectedVersion, JSON.stringify(request.payload)]);
  return rows(result)[0]?.result || {};
}

async function createSyntheticTenant(runtime, actor, suffix, label) {
  const payload = {
    slug: `qa-lifecycle-${label}-${suffix}`,
    legalName: `QA ciclo de vida ${label}`,
    shortName: `QA lifecycle ${label}`,
    kind: 'sandbox',
    jurisdiction: 'Rama descartable',
  };
  const request = iamRequest('create_tenant', null, payload);
  const result = await applyIamCommand(runtime, actor, request);
  guard(UUID.test(String(result?.tenant?.id || '')), 'QA_TENANT_CREATE_INVALID',
    'create_tenant no devolvió tenant');
  assert.deepEqual(result.identityPolicy, {
    version: 1,
    dataPlaneReady: false,
    invitationDeliveryReady: false,
  });
  assert.equal(result.replayed, false);
  return Object.freeze({ id: String(result.tenant.id), request });
}

async function certifyTenant(runtime, actor, tenantId, sourceBindingId, releaseSha,
  expectedVersion) {
  const payload = {
    tenantId,
    sourceBindingId,
    releaseSha,
    reason: 'Certificación QA sintética aislada',
  };
  const request = platformRequest('certify_data_plane', expectedVersion, payload, releaseSha);
  const result = await applyPlatformCommand(runtime, actor, request);
  assert.equal(result?.policy?.dataPlaneReady, true);
  assert.equal(Number(result?.policy?.version), expectedVersion + 1);
  return Object.freeze({ request, result });
}

async function prepareOperationalControlPlane(owner, runtime, actor, source, releaseSha) {
  const bindingId = source.operationalBindingId;
  const state = await owner.query(`
    SELECT policy.version, tenant.status,
      policy.invitation_delivery_ready AS "deliveryReady"
    FROM platform_tenant tenant
    JOIN tenant_identity_policy policy ON policy.tenant_id = tenant.id
    JOIN platform_tenant_source_binding binding
      ON binding.id = $2::uuid AND binding.tenant_id = tenant.id
     AND binding.source_system = 'GRH' AND binding.verified IS TRUE
     AND binding.source_database = $3
     AND binding.source_company_id = $4::bigint
    WHERE tenant.id = $1::uuid
  `, [source.operationalTenantId, bindingId,
    source.sourceDatabase, source.sourceCompanyId]);
  guard(state.rowCount === 1, 'QA_OPERATIONAL_TENANT_INVALID',
    'Tenant operativo sin policy');
  const current = rows(state)[0];
  guard(['onboarding', 'active'].includes(current.status)
      && Number.isInteger(Number(current.version)) && Number(current.version) > 0,
  'QA_OPERATIONAL_TENANT_INVALID', 'Tenant operativo no certificable');
  let policyVersion = Number(current.version);
  if (current.deliveryReady === true) {
    const killSwitch = platformRequest('set_delivery_ready', policyVersion, {
      tenantId: source.operationalTenantId,
      ready: false,
      reason: 'Cierre preventivo QA antes de recertificar',
    }, releaseSha);
    const closed = await applyPlatformCommand(runtime, actor, killSwitch);
    assert.equal(closed?.policy?.deliveryReady, false);
    assert.equal(Number(closed?.policy?.version), policyVersion + 1);
    policyVersion = Number(closed.policy.version);
  }
  const certification = await certifyTenant(runtime, actor,
    source.operationalTenantId, bindingId, releaseSha, policyVersion);
  return Object.freeze({
    operationalTenantId: source.operationalTenantId,
    operationalBindingId: bindingId,
    operationalPolicyVersion: Number(certification.result.policy.version),
  });
}

async function verifyInitialPolicySnapshot(owner, actor, tenant) {
  const result = await owner.query(`
    SELECT
      (SELECT count(*)::integer FROM platform_tenant WHERE id = $1::uuid) AS tenants,
      (SELECT count(*)::integer FROM platform_crm_account WHERE tenant_id = $1::uuid) AS crm,
      (SELECT count(*)::integer FROM tenant_identity_policy WHERE tenant_id = $1::uuid) AS policies,
      policy.version AS "policyVersion",
      policy.tenant_data_plane_ready AS "dataPlaneReady",
      policy.invitation_delivery_ready AS "deliveryReady",
      policy.certified_source_binding_id AS "sourceBindingId",
      policy.certified_release_sha AS "releaseSha",
      event.result AS "eventResult",
      (SELECT count(*)::integer FROM tenant_iam_event event_count
        WHERE lower(event_count.actor_user_email) = lower($2)
          AND event_count.idempotency_key = $3::uuid) AS events
    FROM tenant_identity_policy policy
    JOIN tenant_iam_event event ON event.tenant_id = policy.tenant_id
      AND lower(event.actor_user_email) = lower($2)
      AND event.idempotency_key = $3::uuid
      AND event.command = 'create_tenant'
    WHERE policy.tenant_id = $1::uuid
  `, [tenant.id, actor.email, tenant.request.idempotencyKey]);
  assert.equal(result.rowCount, 1);
  const value = rows(result)[0];
  assert.equal(Number(value.tenants), 1);
  assert.equal(Number(value.crm), 1);
  assert.equal(Number(value.policies), 1);
  assert.equal(Number(value.events), 1);
  assert.equal(Number(value.policyVersion), 1);
  assert.equal(value.dataPlaneReady, false);
  assert.equal(value.deliveryReady, false);
  assert.equal(value.sourceBindingId, null);
  assert.equal(value.releaseSha, null);
  assert.deepEqual(value.eventResult?.identityPolicy, {
    version: 1,
    dataPlaneReady: false,
    invitationDeliveryReady: false,
  });
}

async function createControlPlaneFixtures(owner, runtime, actor, suffix, releases) {
  const tenantA = await createSyntheticTenant(runtime, actor, suffix, 'a');
  const tenantB = await createSyntheticTenant(runtime, actor, suffix, 'b');
  await verifyInitialPolicySnapshot(owner, actor, tenantA);
  await verifyInitialPolicySnapshot(owner, actor, tenantB);

  const sourceDatabaseA = `qa-lifecycle-${suffix}-a`;
  const sourceDatabaseB = `qa-lifecycle-${suffix}-b`;

  const bindings = await owner.query(`
    INSERT INTO platform_tenant_source_binding (
      tenant_id, source_system, source_database, source_company_id,
      verified, verified_by_user_email, verified_at
    ) VALUES
      ($1::uuid, 'GRH', $3, -1, true, $5, now()),
      ($2::uuid, 'GRH', $4, -2, false, NULL, NULL)
    RETURNING id::text AS id, tenant_id::text AS "tenantId",
      source_database AS "sourceDatabase", source_company_id::text AS "sourceCompanyId",
      verified
  `, [tenantA.id, tenantB.id, sourceDatabaseA, sourceDatabaseB, actor.email]);
  const bindingA = rows(bindings).find((row) => row.tenantId === tenantA.id && row.verified === true);
  const bindingB = rows(bindings).find((row) => row.tenantId === tenantB.id && row.verified === false);
  guard(UUID.test(String(bindingA?.id || '')) && UUID.test(String(bindingB?.id || '')),
    'QA_BINDING_FIXTURE_INVALID', 'Bindings sintéticos inválidos');
  guard(bindingA.sourceDatabase === sourceDatabaseA && bindingA.sourceCompanyId === '-1'
      && bindingB.sourceDatabase === sourceDatabaseB && bindingB.sourceCompanyId === '-2'
      && bindingA.sourceDatabase !== bindingB.sourceDatabase,
  'QA_BINDING_FIXTURE_INVALID', 'Coordenadas sintéticas no son únicas');

  const invalidCertification = platformRequest('certify_data_plane', 1, {
    tenantId: tenantB.id,
    sourceBindingId: bindingB.id,
    releaseSha: releases[0],
    reason: 'Canary QA de binding no verificado',
  }, releases[0]);
  await expectDatabaseContract('IDENTITY_COMMAND_INVALID', () => (
    applyPlatformCommand(runtime, actor, invalidCertification)
  ));
  const policies = await owner.query(`
    SELECT count(*)::integer AS count,
      bool_and(policy.version = 1
        AND policy.tenant_data_plane_ready IS FALSE
        AND policy.invitation_delivery_ready IS FALSE
        AND policy.certified_source_binding_id IS NULL
        AND policy.certified_release_sha IS NULL) AS closed
    FROM tenant_identity_policy policy
    WHERE policy.tenant_id = ANY($1::uuid[])
  `, [[tenantA.id, tenantB.id]]);
  assert.equal(Number(rows(policies)[0]?.count), 2);
  assert.equal(rows(policies)[0]?.closed, true);

  return Object.freeze({
    tenantA,
    tenantB,
    syntheticBindingAId: bindingA.id,
    syntheticBindingBId: bindingB.id,
  });
}

function memberFixture(kind, suffix, tenantId, withSession = false) {
  return Object.freeze({
    kind,
    email: lifecycleFixtureEmail(kind, suffix),
    membershipId: randomUUID(),
    tenantId,
    sessionId: withSession ? randomUUID() : null,
  });
}

async function seedMemberFixtures(owner, actor, controlPlane, suffix) {
  const members = Object.freeze({
    linker: memberFixture('linker', suffix, controlPlane.operationalTenantId),
    scoper: memberFixture('scoper', suffix, controlPlane.operationalTenantId),
    transferA: memberFixture('transfer-a', suffix, controlPlane.operationalTenantId, true),
    transferB: memberFixture('transfer-b', suffix, controlPlane.operationalTenantId),
    terminal: memberFixture('session-terminal', suffix, controlPlane.operationalTenantId, true),
    race: memberFixture('race', suffix, controlPlane.operationalTenantId, true),
    crossTenant: memberFixture('cross-tenant', suffix, controlPlane.tenantB.id),
  });
  const memberRows = Object.values(members);

  await owner.query('BEGIN');
  try {
    await owner.query(`
      INSERT INTO internal_users (
        email, display_name, role, password_hash, active, auth_mode, identity_version
      )
      SELECT fixture.email, 'QA sintético aislado', 'EMPLEADO', NULL, true, 'managed', 1
      FROM unnest($1::text[]) fixture(email)
    `, [memberRows.map((member) => member.email)]);
    for (const member of memberRows) {
      await owner.query(`
        INSERT INTO tenant_membership (
          id, tenant_id, user_email, role_key, status,
          invited_by_user_email, activated_at
        ) VALUES (
          $1::uuid, $2::uuid, $3, 'JUNIN_RRHH_OPERADOR', 'active', $4, now()
        )
      `, [member.membershipId, member.tenantId, member.email, actor.email]);
      if (member.sessionId) {
        await owner.query(`
          INSERT INTO tenant_identity_session (
            id, user_email, active_tenant_id, source, auth_level,
            session_version, identity_version, status, device_label,
            last_seen_at, expires_at
          ) VALUES (
            $1::uuid, $2, $3::uuid, 'membership', 'mfa', 1, 1,
            'active', 'QA aislada', now(), now() + interval '2 hours'
          )
        `, [member.sessionId, member.email, member.tenantId]);
      }
    }
    await owner.query('COMMIT');
  } catch (error) {
    await owner.query('ROLLBACK').catch(() => {});
    throw error;
  }

  const authorities = await owner.query(`
    SELECT count(*)::integer AS count
    FROM tenant_action_authority
    WHERE membership_id = ANY($1::uuid[])
  `, [memberRows.map((member) => member.membershipId)]);
  assert.equal(Number(rows(authorities)[0]?.count), memberRows.length);
  return members;
}

async function verifyClosedPlatformCommands(runtime, actor, controlPlane, releaseSha) {
  const legacyPayload = {
    tenantId: controlPlane.tenantA.id,
    sourceSystem: 'GRH',
    sourceDatabase: 'qa-closed',
    sourceCompanyId: 1,
  };
  await expectDatabaseContract('IDENTITY_COMMAND_INVALID', () => runtime.query(`
    SELECT tenant_identity_apply_command(
      'bind_source', $1, $2::uuid, $3, NULL::integer, $4::jsonb
    )
  `, [actor.email, randomUUID(), commandHash('bind_source', null, legacyPayload),
    JSON.stringify(legacyPayload)]));

  const bindSource = platformRequest('bind_source', 1, legacyPayload, releaseSha);
  await expectDatabaseContract('IDENTITY_PLATFORM_COMMAND_CLOSED', () => (
    applyPlatformCommand(runtime, actor, bindSource)
  ));
  const deliveryTrue = platformRequest('set_delivery_ready', 2, {
    tenantId: controlPlane.tenantA.id,
    ready: true,
    reason: 'Canary QA cerrado',
  }, releaseSha);
  await expectDatabaseContract('IDENTITY_PLATFORM_COMMAND_CLOSED', () => (
    applyPlatformCommand(runtime, actor, deliveryTrue)
  ));
}

async function sessionIdentitySnapshot(owner, sessionId) {
  const result = await owner.query(`
    SELECT id::text AS id, lower(user_email) AS user_email,
      active_tenant_id::text AS active_tenant_id, source, session_version,
      status, version, revoked_at, lower(revoked_by_user_email) AS revoked_by_user_email,
      count(*) OVER ()::integer AS count
    FROM tenant_identity_session
    WHERE id = $1::uuid
  `, [sessionId]);
  assert.equal(result.rowCount, 1);
  const snapshot = rows(result)[0];
  assert.equal(Number(snapshot.count), 1);
  return snapshot;
}

async function expectRejectedSessionRevocation(owner, sessionId, expectedCode,
  operation, originalSnapshot) {
  await owner.query('BEGIN');
  try {
    await expectDatabaseContract(expectedCode, operation);
  } finally {
    await owner.query('ROLLBACK');
  }
  assert.deepEqual(await sessionIdentitySnapshot(owner, sessionId), originalSnapshot);
}

async function verifyCrossTenantAndSessionMatrix(owner, actor, controlPlane, members) {
  await expectPgCode('23503', () => owner.query(`
    INSERT INTO tenant_exclusive_capability (
      tenant_id, capability_key, membership_id, active, assigned_by_user_email
    ) VALUES ($1::uuid, 'time.overtime.enter', $2::uuid, true, $3)
  `, [controlPlane.operationalTenantId, members.crossTenant.membershipId, actor.email]));
  const assignments = await owner.query(`
    SELECT count(*)::integer AS count FROM tenant_exclusive_capability
    WHERE tenant_id = $1::uuid AND membership_id = $2::uuid
  `, [controlPlane.operationalTenantId, members.crossTenant.membershipId]);
  assert.equal(Number(rows(assignments)[0]?.count), 0);

  const originalSession = await sessionIdentitySnapshot(owner, members.terminal.sessionId);
  assert.equal(originalSession.status, 'active');
  assert.equal(originalSession.user_email, members.terminal.email.toLowerCase());
  assert.equal(originalSession.active_tenant_id, members.terminal.tenantId);
  assert.equal(originalSession.source, 'membership');
  assert.equal(Number(originalSession.session_version), 1);
  assert.equal(originalSession.revoked_at, null);
  assert.equal(originalSession.revoked_by_user_email, null);

  const replacementSessionId = randomUUID();
  await expectRejectedSessionRevocation(owner, members.terminal.sessionId,
    'IDENTITY_SESSION_ID_IMMUTABLE', () => owner.query(`
      UPDATE tenant_identity_session
      SET id = $3::uuid, status = 'revoked', revoked_at = now(),
        revoked_by_user_email = $2, version = version + 1
      WHERE id = $1::uuid AND status = 'active'
    `, [members.terminal.sessionId, actor.email, replacementSessionId]), originalSession);
  await expectRejectedSessionRevocation(owner, members.terminal.sessionId,
    'IDENTITY_SESSION_REVOKE_TRANSITION_INVALID', () => owner.query(`
      UPDATE tenant_identity_session
      SET user_email = $3, status = 'revoked', revoked_at = now(),
        revoked_by_user_email = $2, version = version + 1
      WHERE id = $1::uuid AND status = 'active'
    `, [members.terminal.sessionId, actor.email, actor.email]), originalSession);
  await expectRejectedSessionRevocation(owner, members.terminal.sessionId,
    'IDENTITY_SESSION_REVOKE_TRANSITION_INVALID', () => owner.query(`
      UPDATE tenant_identity_session
      SET source = 'platform', status = 'revoked', revoked_at = now(),
        revoked_by_user_email = $2, version = version + 1
      WHERE id = $1::uuid AND status = 'active'
    `, [members.terminal.sessionId, actor.email]), originalSession);
  await expectRejectedSessionRevocation(owner, members.terminal.sessionId,
    'IDENTITY_SESSION_REVOKE_TRANSITION_INVALID', () => owner.query(`
      UPDATE tenant_identity_session
      SET active_tenant_id = $3::uuid, status = 'revoked', revoked_at = now(),
        revoked_by_user_email = $2, version = version + 1
      WHERE id = $1::uuid AND status = 'active'
    `, [members.terminal.sessionId, actor.email, controlPlane.tenantB.id]), originalSession);
  await expectRejectedSessionRevocation(owner, members.terminal.sessionId,
    'IDENTITY_SESSION_REVOKE_TRANSITION_INVALID', () => owner.query(`
      UPDATE tenant_identity_session
      SET session_version = session_version + 1, status = 'revoked', revoked_at = now(),
        revoked_by_user_email = $2, version = version + 1
      WHERE id = $1::uuid AND status = 'active'
    `, [members.terminal.sessionId, actor.email]), originalSession);

  const revoked = await owner.query(`
    UPDATE tenant_identity_session
    SET status = 'revoked', revoked_at = now(), revoked_by_user_email = $2,
      version = version + 1
    WHERE id = $1::uuid AND status = 'active'
  `, [members.terminal.sessionId, actor.email]);
  assert.equal(revoked.rowCount, 1);
  await expectDatabaseContract('IDENTITY_SESSION_REVOKED_TERMINAL', () => owner.query(`
    UPDATE tenant_identity_session SET device_label = 'QA cambio prohibido'
    WHERE id = $1::uuid
  `, [members.terminal.sessionId]));
  await expectDatabaseContract('IDENTITY_SESSION_DELETE_FORBIDDEN', () => owner.query(`
    DELETE FROM tenant_identity_session WHERE id = $1::uuid
  `, [members.terminal.sessionId]));
  await expectPgCode('23505', () => owner.query(`
    INSERT INTO tenant_identity_session
    SELECT * FROM tenant_identity_session WHERE id = $1::uuid
  `, [members.terminal.sessionId]));
  const terminal = await owner.query(`
    SELECT status, count(*) OVER ()::integer AS count
    FROM tenant_identity_session WHERE id = $1::uuid
  `, [members.terminal.sessionId]);
  assert.equal(terminal.rowCount, 1);
  assert.equal(rows(terminal)[0]?.status, 'revoked');
  assert.equal(Number(rows(terminal)[0]?.count), 1);
}

async function degradePolicy(owner, tenantId) {
  const result = await owner.query(`
    UPDATE tenant_identity_policy
    SET tenant_data_plane_ready = false, invitation_delivery_ready = false,
      version = version + 1, updated_at = now()
    WHERE tenant_id = $1::uuid
    RETURNING version
  `, [tenantId]);
  assert.equal(result.rowCount, 1);
  return Number(rows(result)[0]?.version);
}

async function provisioningState(owner, actor, member, idempotencyKey) {
  const result = await owner.query(`
    SELECT authority.version,
      (SELECT count(*)::integer FROM tenant_action_authority_event event
        WHERE lower(event.actor_user_email) = lower($2)
          AND event.idempotency_key = $3::uuid) AS events,
      (SELECT count(*)::integer FROM tenant_action_employment_link link
        WHERE link.membership_id = authority.membership_id AND link.active IS TRUE) AS links,
      (SELECT count(*)::integer FROM tenant_action_area_scope scope
        WHERE scope.membership_id = authority.membership_id AND scope.active IS TRUE) AS scopes
    FROM tenant_action_authority authority
    WHERE authority.membership_id = $1::uuid
  `, [member.membershipId, actor.email, idempotencyKey]);
  assert.equal(result.rowCount, 1);
  const value = rows(result)[0];
  return Object.freeze({
    version: Number(value.version),
    events: Number(value.events),
    links: Number(value.links),
    scopes: Number(value.scopes),
  });
}

async function verifyProvisioningReplayMatrix(owner, runtime, actor, controlPlane,
  members, source, releases, initialPolicyVersion) {
  const linkRequest = provisioningRequest('link_employment', 1, {
    sourceBindingId: controlPlane.operationalBindingId,
    employmentContractId: source.contractIds[0],
    reasonCode: 'onboarding',
    reason: 'Vinculación QA sintética',
  }, releases[0]);
  const linked = await applyProvisioningCommand(runtime, actor,
    members.linker.membershipId, linkRequest);
  assert.equal(Number(linked.version), 2);
  assert.equal(linked.replayed, false);
  const linkReplay = await applyProvisioningCommand(runtime, actor,
    members.linker.membershipId, linkRequest);
  assert.equal(linkReplay.replayed, true);
  assert.deepEqual(await provisioningState(owner, actor, members.linker,
    linkRequest.idempotencyKey), { version: 2, events: 1, links: 1, scopes: 0 });

  const degradedVersion = await degradePolicy(owner, controlPlane.operationalTenantId);
  assert.equal(degradedVersion, initialPolicyVersion + 1);
  await expectDatabaseContract('TENANT_ACTION_SOURCE_BINDING_REQUIRED', () => (
    applyProvisioningCommand(runtime, actor, members.linker.membershipId, linkRequest)
  ));
  assert.deepEqual(await provisioningState(owner, actor, members.linker,
    linkRequest.idempotencyKey), { version: 2, events: 1, links: 1, scopes: 0 });

  await certifyTenant(runtime, actor, controlPlane.operationalTenantId,
    controlPlane.operationalBindingId, releases[1], degradedVersion);
  const scopeRequest = provisioningRequest('replace_action_scopes', 1, {
    scopes: [{
      capabilityKey: 'leave.request.area.create',
      sourceBindingId: controlPlane.operationalBindingId,
      scopeLevel: 'company',
    }],
    reasonCode: 'scope_change',
    reason: 'Alcance QA sintético',
  }, releases[1]);
  const scoped = await applyProvisioningCommand(runtime, actor,
    members.scoper.membershipId, scopeRequest);
  assert.equal(Number(scoped.version), 2);
  assert.equal(scoped.replayed, false);
  const scopeReplay = await applyProvisioningCommand(runtime, actor,
    members.scoper.membershipId, scopeRequest);
  assert.equal(scopeReplay.replayed, true);
  assert.deepEqual(await provisioningState(owner, actor, members.scoper,
    scopeRequest.idempotencyKey), { version: 2, events: 1, links: 0, scopes: 1 });

  const releaseChanged = await certifyTenant(runtime, actor,
    controlPlane.operationalTenantId, controlPlane.operationalBindingId,
    releases[2], degradedVersion + 1);
  await expectDatabaseContract('TENANT_ACTION_SOURCE_BINDING_REQUIRED', () => (
    applyProvisioningCommand(runtime, actor, members.scoper.membershipId, scopeRequest)
  ));
  assert.deepEqual(await provisioningState(owner, actor, members.scoper,
    scopeRequest.idempotencyKey), { version: 2, events: 1, links: 0, scopes: 1 });
  return Number(releaseChanged.result.policy.version);
}

async function verifyEmploymentHistory(owner, actor, member, expectedActiveContract) {
  const result = await owner.query(`
    SELECT count(*)::integer AS history,
      count(*) FILTER (WHERE active IS TRUE)::integer AS active,
      count(*) FILTER (WHERE active IS FALSE AND revoked_at IS NOT NULL)::integer AS revoked,
      count(DISTINCT id)::integer AS ids,
      max(employment_contract_id::text) FILTER (WHERE active IS TRUE) AS "activeContract"
    FROM tenant_action_employment_link
    WHERE membership_id = $1::uuid AND tenant_id = $2::uuid
  `, [member.membershipId, member.tenantId]);
  const value = rows(result)[0];
  assert.equal(Number(value.history), 2);
  assert.equal(Number(value.active), expectedActiveContract ? 1 : 0);
  assert.equal(Number(value.revoked), expectedActiveContract ? 1 : 2);
  assert.equal(Number(value.ids), 2);
  assert.equal(value.activeContract || null, expectedActiveContract || null);
}

async function verifyHistoryAndSuspendedRevoke(owner, runtime, actor, controlPlane,
  members, source, releases, policyVersion) {
  const firstLink = provisioningRequest('link_employment', 1, {
    sourceBindingId: controlPlane.operationalBindingId,
    employmentContractId: source.contractIds[1],
    reasonCode: 'onboarding',
    reason: 'Alta QA sintética',
  }, releases[2]);
  const first = await applyProvisioningCommand(runtime, actor,
    members.transferA.membershipId, firstLink);
  assert.equal(Number(first.version), 2);

  const replacement = provisioningRequest('link_employment', 2, {
    sourceBindingId: controlPlane.operationalBindingId,
    employmentContractId: source.contractIds[2],
    reasonCode: 'employment_change',
    reason: 'Cambio QA sintético',
  }, releases[2]);
  const replaced = await applyProvisioningCommand(runtime, actor,
    members.transferA.membershipId, replacement);
  assert.equal(Number(replaced.version), 3);
  await verifyEmploymentHistory(owner, actor, members.transferA, source.contractIds[2]);

  await expectDatabaseContract('TENANT_ACTION_EMPLOYMENT_HISTORY_IMMUTABLE', () => owner.query(`
    UPDATE tenant_action_employment_link SET updated_at = now()
    WHERE id = (
      SELECT id FROM tenant_action_employment_link
      WHERE membership_id = $1::uuid AND active IS FALSE LIMIT 1
    )
  `, [members.transferA.membershipId]));
  await expectPgCode('23505', () => owner.query(`
    INSERT INTO tenant_action_employment_link (
      membership_id, tenant_id, source_binding_id, employment_contract_id,
      active, linked_by_user_email
    ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, true, $5)
  `, [members.transferA.membershipId, controlPlane.operationalTenantId,
    controlPlane.operationalBindingId, source.contractIds[3], actor.email]));
  await expectPgCode('23505', () => owner.query(`
    INSERT INTO tenant_action_employment_link (
      membership_id, tenant_id, source_binding_id, employment_contract_id,
      active, linked_by_user_email
    ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, true, $5)
  `, [members.transferB.membershipId, controlPlane.operationalTenantId,
    controlPlane.operationalBindingId, source.contractIds[2], actor.email]));

  const suspendRequest = iamRequest('suspend_membership', 1, {
    membershipId: members.transferA.membershipId,
  });
  const suspended = await applyIamCommand(runtime, actor, suspendRequest);
  assert.equal(suspended?.membership?.status, 'suspended');
  assert.equal(Number(suspended?.membership?.version), 2);
  const suspendedState = await owner.query(`
    SELECT membership.status,
      (SELECT count(*)::integer FROM tenant_action_employment_link link
        WHERE link.membership_id = membership.id AND link.active IS TRUE) AS links,
      (SELECT count(*)::integer FROM tenant_identity_session session
        WHERE session.id = $2::uuid AND session.status = 'revoked') AS "revokedSessions",
      (SELECT count(*)::integer FROM tenant_iam_effective_capabilities(membership.id)) AS capabilities
    FROM tenant_membership membership WHERE membership.id = $1::uuid
  `, [members.transferA.membershipId, members.transferA.sessionId]);
  const suspendedRow = rows(suspendedState)[0];
  assert.equal(suspendedRow.status, 'suspended');
  assert.equal(Number(suspendedRow.links), 1);
  assert.equal(Number(suspendedRow.revokedSessions), 1);
  assert.equal(Number(suspendedRow.capabilities), 0);

  const degradedVersion = await degradePolicy(owner, controlPlane.operationalTenantId);
  assert.equal(degradedVersion, policyVersion + 1);
  const revokeRequest = provisioningRequest('revoke_employment_link', 3, {
    reasonCode: 'offboarding',
    reason: 'Baja QA sintética',
  }, releases[2]);
  const revoked = await applyProvisioningCommand(runtime, actor,
    members.transferA.membershipId, revokeRequest);
  assert.equal(Number(revoked.version), 4);
  assert.equal(revoked.replayed, false);
  const revokeReplay = await applyProvisioningCommand(runtime, actor,
    members.transferA.membershipId, revokeRequest);
  assert.equal(revokeReplay.replayed, true);
  await verifyEmploymentHistory(owner, actor, members.transferA, null);

  await certifyTenant(runtime, actor, controlPlane.operationalTenantId,
    controlPlane.operationalBindingId, releases[3], degradedVersion);
  const takeoverRequest = provisioningRequest('link_employment', 1, {
    sourceBindingId: controlPlane.operationalBindingId,
    employmentContractId: source.contractIds[2],
    reasonCode: 'onboarding',
    reason: 'Reingreso QA sintético',
  }, releases[3]);
  const takeover = await applyProvisioningCommand(runtime, actor,
    members.transferB.membershipId, takeoverRequest);
  assert.equal(Number(takeover.version), 2);
  const transferState = await owner.query(`
    SELECT
      (SELECT count(*)::integer FROM tenant_action_employment_link
        WHERE membership_id = $1::uuid AND active IS FALSE) AS history,
      (SELECT count(*)::integer FROM tenant_action_employment_link
        WHERE membership_id = $2::uuid AND active IS TRUE
          AND employment_contract_id = $3::uuid) AS takeover,
      (SELECT count(*)::integer FROM tenant_iam_effective_capabilities($1::uuid)) AS "oldCapabilities"
  `, [members.transferA.membershipId, members.transferB.membershipId, source.contractIds[2]]);
  const transferRow = rows(transferState)[0];
  assert.equal(Number(transferRow.history), 2);
  assert.equal(Number(transferRow.takeover), 1);
  assert.equal(Number(transferRow.oldCapabilities), 0);
  return degradedVersion + 1;
}

async function waitForBlockedBackend(observer, backendPid, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await observer.query(`
      SELECT EXISTS (
        SELECT 1
        FROM pg_stat_activity activity
        JOIN pg_locks waiting ON waiting.pid = activity.pid AND waiting.granted IS FALSE
        WHERE activity.pid = $1::integer AND activity.wait_event_type = 'Lock'
          AND cardinality(pg_blocking_pids(activity.pid)) > 0
      ) AS blocked
    `, [backendPid]);
    if (rows(result)[0]?.blocked === true) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new QaContractError('QA_CONCURRENCY_NOT_BLOCKED',
    'La carrera no alcanzó el lock determinista');
}

async function verifySuspendVsLinkRace(owner, ownerRace, runtimeRace, actor,
  controlPlane, members, source, releaseSha) {
  const pidResult = await runtimeRace.query('SELECT pg_backend_pid()::integer AS pid');
  const runtimeRacePid = Number(rows(pidResult)[0]?.pid);
  assert.ok(Number.isInteger(runtimeRacePid) && runtimeRacePid > 0);
  const suspendRequest = iamRequest('suspend_membership', 1, {
    membershipId: members.race.membershipId,
  });
  const linkRequest = provisioningRequest('link_employment', 1, {
    sourceBindingId: controlPlane.operationalBindingId,
    employmentContractId: source.contractIds[3],
    reasonCode: 'onboarding',
    reason: 'Carrera QA sintética',
  }, releaseSha);

  let pendingLink;
  let committed = false;
  await ownerRace.query('BEGIN');
  try {
    const suspended = await applyIamCommand(ownerRace, actor, suspendRequest);
    assert.equal(suspended?.membership?.status, 'suspended');
    pendingLink = applyProvisioningCommand(runtimeRace, actor,
      members.race.membershipId, linkRequest);
    void pendingLink.catch(() => {});
    await waitForBlockedBackend(owner, runtimeRacePid);
    await ownerRace.query('COMMIT');
    committed = true;
    await expectDatabaseContract('TENANT_ACTION_MEMBERSHIP_NOT_ACTIVE', () => pendingLink);
  } finally {
    if (!committed) await ownerRace.query('ROLLBACK').catch(() => {});
    if (pendingLink) await pendingLink.catch(() => {});
  }

  const state = await owner.query(`
    SELECT membership.status, authority.version,
      (SELECT count(*)::integer FROM tenant_action_employment_link link
        WHERE link.membership_id = membership.id) AS links,
      (SELECT count(*)::integer FROM tenant_action_authority_event event
        WHERE lower(event.actor_user_email) = lower($2)
          AND event.idempotency_key = $3::uuid) AS events,
      (SELECT count(*)::integer FROM tenant_identity_session session
        WHERE session.id = $4::uuid AND session.status = 'revoked') AS "revokedSessions"
    FROM tenant_membership membership
    JOIN tenant_action_authority authority ON authority.membership_id = membership.id
    WHERE membership.id = $1::uuid
  `, [members.race.membershipId, actor.email, linkRequest.idempotencyKey,
    members.race.sessionId]);
  const value = rows(state)[0];
  assert.equal(value.status, 'suspended');
  assert.equal(Number(value.version), 1);
  assert.equal(Number(value.links), 0);
  assert.equal(Number(value.events), 0);
  assert.equal(Number(value.revokedSessions), 1);
}

async function verifyLateCreateReplay(owner, runtime, actor, tenant) {
  const replayed = await applyIamCommand(runtime, actor, tenant.request);
  assert.equal(replayed.replayed, true);
  assert.deepEqual(replayed.identityPolicy, {
    version: 1,
    dataPlaneReady: false,
    invitationDeliveryReady: false,
  });
  const changedRequest = iamRequest('create_tenant', null, {
    ...tenant.request.payload,
    shortName: 'QA replay alterado',
  }, tenant.request.idempotencyKey);
  await expectDatabaseContract('TENANT_IAM_IDEMPOTENCY_KEY_REUSED', () => (
    applyIamCommand(runtime, actor, changedRequest)
  ));
  const counts = await owner.query(`
    SELECT
      (SELECT count(*)::integer FROM platform_tenant WHERE id = $1::uuid) AS tenants,
      (SELECT count(*)::integer FROM platform_crm_account WHERE tenant_id = $1::uuid) AS crm,
      (SELECT count(*)::integer FROM tenant_identity_policy WHERE tenant_id = $1::uuid) AS policies,
      (SELECT count(*)::integer FROM tenant_iam_event event
        WHERE lower(event.actor_user_email) = lower($2)
          AND event.idempotency_key = $3::uuid) AS events
  `, [tenant.id, actor.email, tenant.request.idempotencyKey]);
  assert.deepEqual(Object.fromEntries(Object.entries(rows(counts)[0] || {})
    .map(([key, value]) => [key, Number(value)])), {
    tenants: 1,
    crm: 1,
    policies: 1,
    events: 1,
  });
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
    isolatedBranchVerified: true,
    migrationChecksumVerified: true,
    migrationReapplyVerified: true,
    runtimeIdentityVerified: true,
    globalSecurityDefinerAllowlistVerified: true,
    legacyAndCoreRuntimeDenied: true,
    syntheticControlPlaneFixtures: true,
    protectedSourceDataReadOnly: true,
    closedPolicyReplayVerified: true,
    crossTenantForeignKeyVerified: true,
    revokedSessionTerminalVerified: true,
    employmentHistoryVerified: true,
    suspendedRevokeVerified: true,
    staleReplayRejected: true,
    durableRevokeReplayVerified: true,
    partialUniqueIndexesVerified: true,
    protectedDataUnchanged: true,
    concurrencySerialized: true,
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

export async function runTenantLifecycleLive({
  env = process.env,
  argv = process.argv.slice(2),
  ClientClass = Client,
} = {}) {
  const config = loadTenantLifecycleQaConfig(env, argv);
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const releases = Object.freeze([
    config.releaseSha,
    derivedReleaseSha(config.releaseSha, 'recertified'),
    derivedReleaseSha(config.releaseSha, 'scope-stale'),
    derivedReleaseSha(config.releaseSha, 'takeover'),
  ]);
  const owner = new ClientClass({ connectionString: config.ownerUrl });
  const ownerRace = new ClientClass({ connectionString: config.ownerUrl });
  const runtime = new ClientClass({ connectionString: config.runtimeUrl });
  const runtimeRace = new ClientClass({ connectionString: config.runtimeUrl });
  let baselineFingerprint;
  let runLockAcquired = false;

  try {
    await stage('connect', async () => {
      await Promise.all([owner.connect(), ownerRace.connect(), runtime.connect(), runtimeRace.connect()]);
      await Promise.all([
        owner.query("SET statement_timeout = '45s'"),
        ownerRace.query("SET statement_timeout = '10s'"),
        runtime.query("SET statement_timeout = '10s'"),
        runtimeRace.query("SET statement_timeout = '10s'"),
      ]);
    });
    await stage('branch-identity', async () => {
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
    });
    await stage('run-lock', async () => {
      await acquireRunLock(owner);
      runLockAcquired = true;
    });
    const checksum = await stage('migration-hash', () => verifyInstalledMigration(owner));
    await stage('runtime-acl', async () => {
      validateRuntimeBoundaryEvidence(await collectRuntimeBoundaryEvidence(owner, runtime));
      await verifyDirectRuntimeDenials(runtime);
      await verifyGlobalSecurityDefinerCanary(owner, suffix);
      validateRuntimeBoundaryEvidence(await collectRuntimeBoundaryEvidence(owner, runtime));
    });
    baselineFingerprint = await stage('protected-baseline', () => protectedDataFingerprint(owner));
    await stage('migration-reapply', () => verifyMigrationReapply(owner, checksum));
    await stage('reapply-boundary', async () => {
      assert.deepEqual(await protectedDataFingerprint(owner), baselineFingerprint);
      validateRuntimeBoundaryEvidence(await collectRuntimeBoundaryEvidence(owner, runtime));
    });
    const source = await stage('fixture-source', () => selectQaSource(owner));
    const actor = platformActorFixture(suffix);
    await stage('platform-actor', () => seedPlatformActor(owner, actor));
    const operationalControlPlane = await stage('operational-control-plane', () => (
      prepareOperationalControlPlane(owner, runtime, actor, source, releases[0])
    ));
    const syntheticControlPlane = await stage('policy-create', () => (
      createControlPlaneFixtures(owner, runtime, actor, suffix, releases)
    ));
    const controlPlane = Object.freeze({
      ...operationalControlPlane,
      ...syntheticControlPlane,
    });
    await stage('closed-platform-commands', () => (
      verifyClosedPlatformCommands(runtime, actor, controlPlane, releases[0])
    ));
    const members = await stage('member-fixtures', () => (
      seedMemberFixtures(owner, actor, controlPlane, suffix)
    ));
    guard([actor.email, ...Object.values(members).map((member) => member.email)]
      .every((email) => email.endsWith('@local.invalid')),
    'QA_FIXTURE_EMAIL_INVALID', 'Una identidad QA no es sintética');
    await stage('fk-session-matrix', () => (
      verifyCrossTenantAndSessionMatrix(owner, actor, controlPlane, members)
    ));
    const policyVersion = await stage('provisioning-replay', () => (
      verifyProvisioningReplayMatrix(owner, runtime, actor, controlPlane,
        members, source, releases, controlPlane.operationalPolicyVersion)
    ));
    await stage('history-suspended-revoke', () => (
      verifyHistoryAndSuspendedRevoke(owner, runtime, actor, controlPlane,
        members, source, releases, policyVersion)
    ));
    await stage('concurrency-matrix', () => (
      verifySuspendVsLinkRace(owner, ownerRace, runtimeRace, actor,
        controlPlane, members, source, releases[3])
    ));
    await stage('late-create-replay', () => (
      verifyLateCreateReplay(owner, runtime, actor, controlPlane.tenantA)
    ));
    await stage('protected-final', async () => {
      assert.deepEqual(await protectedDataFingerprint(owner), baselineFingerprint);
    });
    return buildSafeSummary();
  } finally {
    await Promise.all([
      safeRollback(runtime), safeRollback(runtimeRace), safeRollback(ownerRace), safeRollback(owner),
    ]);
    if (runLockAcquired) await releaseRunLock(owner).catch(() => {});
    await Promise.all([
      runtimeRace.end().catch(() => {}),
      runtime.end().catch(() => {}),
      ownerRace.end().catch(() => {}),
      owner.end().catch(() => {}),
    ]);
  }
}

function isMainModule() {
  return Boolean(process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url);
}

if (isMainModule()) {
  try {
    const summary = await runTenantLifecycleLive();
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify(buildSafeFailure(error))}\n`);
    process.exitCode = 1;
  }
}
