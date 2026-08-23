import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { Client } from '@neondatabase/serverless';

import {
  OVERTIME_CASE_TYPE,
  OVERTIME_POLICY_VERSION,
  createOvertimeCase,
  transitionOvertimeCase,
  updateOvertimeDraft,
} from '../lib/internal-overtime-workflow.js';

const CONFIRMATION_FLAG = '--confirm-isolated-branch';
const MIGRATION_VERSION = '008-governed-overtime-actions';
const MIGRATION_URL = new URL('./migrations/008-governed-overtime-actions.sql', import.meta.url);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA40 = /^[a-f0-9]{40}$/;
const SAFE_CODE = /^(?:[A-Z][A-Z0-9_]{1,63}|[0-9A-Z]{5})$/;

export const EXPECTED_RUNTIME_SECURITY_DEFINERS = Object.freeze([
  'public.action_center_context_v2(text,uuid,integer,text,uuid,uuid)',
  'public.action_center_tenant_bootstrap_v2(text,uuid,integer,text,uuid,uuid,text)',
  'public.action_center_tenant_list_v2(text,uuid,integer,text,uuid,uuid,text,text,text,integer,integer)',
  'public.action_center_tenant_detail_v2(text,uuid,integer,text,uuid,uuid,uuid)',
  'public.action_center_tenant_routing_v2(text,uuid,integer,text,uuid,uuid,uuid)',
  'public.action_center_apply_tenant_command(text,uuid,integer,text,uuid,uuid,text,text,uuid,integer,uuid,text,jsonb,uuid,text,text,text,text,boolean)',
  'public.tenant_action_apply_provisioning_command(text,uuid,uuid,uuid,text,uuid,text,integer,jsonb)',
  'public.tenant_iam_admin_view_v2(text,uuid,integer,text,integer)',
  'public.tenant_iam_apply_command_v2(text,uuid,integer,text,uuid,text,integer,jsonb)',
  'public.tenant_identity_resolve_access(text,uuid,integer,integer,text[],text)',
  'public.tenant_identity_take_rate_limit(text,text,integer,integer,integer)',
  'public.tenant_identity_record_attempt(text,boolean,bigint)',
  'public.tenant_identity_lookup(text,text,text,text)',
  'public.tenant_identity_command_replay(text,uuid,text)',
  'public.tenant_identity_view(text,uuid,text,integer)',
  'public.tenant_identity_apply_command(text,text,uuid,text,integer,jsonb)',
  'public.tenant_identity_legacy_session_policy(text)',
  'public.action_center_apply_overtime_command_v1(text,uuid,integer,text,uuid,uuid,text,uuid,integer,uuid,text,jsonb,uuid,text,text,text,boolean)',
  'public.action_center_overtime_bootstrap_v1(text,uuid,integer,text,uuid,uuid,text)',
  'public.action_center_overtime_list_v1(text,uuid,integer,text,uuid,uuid,text,integer,integer)',
  'public.action_center_overtime_detail_v1(text,uuid,integer,text,uuid,uuid,uuid)',
  'public.action_center_overtime_routing_v1(text,uuid,integer,text,uuid,uuid,uuid)',
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
  guard(['postgres:', 'postgresql:'].includes(parsed.protocol), 'QA_CONNECTION_INVALID', `${label} no es PostgreSQL`);
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

export function loadGovernedOvertimeQaConfig(env = process.env, argv = process.argv.slice(2)) {
  guard(argv.includes(CONFIRMATION_FLAG), 'QA_CONFIRMATION_REQUIRED', `Falta ${CONFIRMATION_FLAG}`);

  const branchId = String(env.ACTION_CENTER_QA_BRANCH_ID || '').trim();
  const projectId = String(env.ACTION_CENTER_QA_PROJECT_ID || '').trim();
  const qaEndpointHost = String(env.ACTION_CENTER_QA_ENDPOINT_HOST || '').trim().toLowerCase();
  const productionBranchId = String(env.CANONICAL_PRODUCTION_BRANCH_ID || '').trim();
  const productionEndpointHost = String(env.CANONICAL_PRODUCTION_HOST || '').trim().toLowerCase();
  const databaseName = String(env.OVERTIME_QA_DATABASE_NAME || 'neondb').trim();

  guard(/^br-[a-z0-9-]+$/i.test(branchId), 'QA_BRANCH_INVALID', 'Branch QA inválida');
  guard(/^[a-z0-9-]+$/i.test(projectId), 'QA_PROJECT_INVALID', 'Project QA inválido');
  guard(neonEndpointHost(qaEndpointHost), 'QA_HOST_INVALID', 'Host QA inválido');
  guard(/^br-[a-z0-9-]+$/i.test(productionBranchId), 'QA_PRODUCTION_GUARD_INVALID', 'Branch productiva ausente');
  guard(neonEndpointHost(productionEndpointHost), 'QA_PRODUCTION_GUARD_INVALID', 'Host productivo ausente');
  guard(branchId !== productionBranchId, 'QA_PRODUCTION_TARGET_FORBIDDEN', 'La rama QA coincide con Producción');
  guard(canonicalEndpointHost(qaEndpointHost) !== canonicalEndpointHost(productionEndpointHost),
    'QA_PRODUCTION_TARGET_FORBIDDEN', 'El endpoint QA coincide con Producción');

  const owner = postgresUrl(env.DATABASE_URL_UNPOOLED, 'DATABASE_URL_UNPOOLED');
  const runtime = postgresUrl(env.ACTIONS_DATABASE_URL, 'ACTIONS_DATABASE_URL');
  guard(directEndpointHost(owner.hostname), 'QA_OWNER_MUST_BE_UNPOOLED', 'Owner debe usar endpoint directo');
  guard(canonicalEndpointHost(owner.hostname) === canonicalEndpointHost(qaEndpointHost),
    'QA_HOST_MISMATCH', 'Owner no apunta al endpoint QA');
  guard(canonicalEndpointHost(runtime.hostname) === canonicalEndpointHost(qaEndpointHost),
    'QA_HOST_MISMATCH', 'Runtime no apunta al endpoint QA');
  guard(canonicalEndpointHost(owner.hostname) !== canonicalEndpointHost(productionEndpointHost)
      && canonicalEndpointHost(runtime.hostname) !== canonicalEndpointHost(productionEndpointHost),
  'QA_PRODUCTION_TARGET_FORBIDDEN', 'Una conexión apunta a Producción');
  guard(owner.href !== runtime.href, 'QA_CREDENTIAL_SEPARATION_REQUIRED', 'Owner y runtime comparten URL');

  const ownerUser = decodeURIComponent(owner.username);
  const runtimeUser = decodeURIComponent(runtime.username);
  guard(ownerUser !== runtimeUser, 'QA_CREDENTIAL_SEPARATION_REQUIRED', 'Owner y runtime comparten rol');
  guard(runtimeUser === RUNTIME_ROLE, 'QA_RUNTIME_ROLE_INVALID', 'La URL runtime no usa el rol dedicado');
  guard(owner.pathname.slice(1) === databaseName && runtime.pathname.slice(1) === databaseName,
    'QA_DATABASE_MISMATCH', 'Las conexiones no apuntan a la base QA esperada');

  return Object.freeze({
    branchId,
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
  guard(/^[a-z][a-z0-9-]{1,31}$/.test(normalizedKind), 'QA_FIXTURE_KIND_INVALID', 'Tipo de fixture inválido');
  guard(/^[a-f0-9]{12}$/.test(normalizedSuffix), 'QA_FIXTURE_SUFFIX_INVALID', 'Sufijo de fixture inválido');
  return `qa-overtime-${normalizedKind}-${normalizedSuffix}@local.invalid`;
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
  guard(actual.size === signatures.length, 'QA_SECDEF_DUPLICATE', 'Inventario SECURITY DEFINER duplicado');
  const missing = EXPECTED_RUNTIME_SECURITY_DEFINERS.find((signature) => !actual.has(signature));
  const extra = signatures.find((signature) => !EXPECTED_SECURITY_DEFINER_SET.has(signature));
  guard(!missing, 'QA_SECDEF_MISSING', 'Falta un SECURITY DEFINER permitido');
  guard(!extra, 'QA_SECDEF_OUTSIDE_ALLOWLIST', 'Runtime ejecuta SECURITY DEFINER fuera de allowlist');
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
      AND (
        has_schema_privilege($1::name, namespace.oid, 'USAGE')
        OR has_schema_privilege($1::name, namespace.oid, 'CREATE')
      )
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
    WITH runtime_role AS (
      SELECT oid FROM pg_roles WHERE rolname = $1
    )
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
      AND (
        has_any_column_privilege($1::name, relation.oid, 'SELECT')
        OR has_any_column_privilege($1::name, relation.oid, 'INSERT')
        OR has_any_column_privilege($1::name, relation.oid, 'UPDATE')
        OR has_any_column_privilege($1::name, relation.oid, 'REFERENCES')
        OR has_table_privilege($1::name, relation.oid, 'DELETE')
        OR has_table_privilege($1::name, relation.oid, 'TRUNCATE')
        OR has_table_privilege($1::name, relation.oid, 'TRIGGER')
      )
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
      AND (
        has_sequence_privilege($1::name, relation.oid, 'USAGE')
        OR has_sequence_privilege($1::name, relation.oid, 'SELECT')
        OR has_sequence_privilege($1::name, relation.oid, 'UPDATE')
      )
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

async function verifyInstalledMigration(owner) {
  const migration = await readFile(MIGRATION_URL);
  const expectedChecksum = createHash('sha256').update(migration).digest('hex');
  const result = await owner.query(`
    SELECT checksum_sha256 FROM schema_migrations WHERE version = $1
  `, [MIGRATION_VERSION]);
  guard(result.rowCount === 1, 'QA_MIGRATION_MISSING', 'Migración 008 ausente');
  guard(String(rows(result)[0]?.checksum_sha256 || '').trim() === expectedChecksum,
    'QA_MIGRATION_CHECKSUM_DRIFT', 'Checksum instalado no coincide con el artefacto local');
  return true;
}

async function verifyDirectRuntimeDenials(runtime) {
  await assert.rejects(
    runtime.query('UPDATE public.action_case SET updated_at = updated_at WHERE false'),
    (error) => error?.code === '42501',
  );
  await assert.rejects(
    runtime.query("SELECT public.action_center_valid_overtime_payload('{}'::jsonb)"),
    (error) => error?.code === '42501',
  );
}

async function verifyGlobalSecurityDefinerCanary(owner, suffix) {
  const functionName = `qa_overtime_secdef_${suffix}`;
  guard(/^[a-z][a-z0-9_]+$/.test(functionName), 'QA_CANARY_INVALID', 'Nombre de canary inválido');
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
        AND (contract.start_date IS NULL OR contract.start_date <= current_date - 12)
        AND (contract.end_date IS NULL OR contract.end_date >= current_date)
        AND NOT EXISTS (
          SELECT 1 FROM tenant_action_employment_link existing_link
          WHERE existing_link.tenant_id = $1::uuid
            AND existing_link.employment_contract_id = contract.id
        )
    ), same_pair AS MATERIALIZED (
      SELECT first_contract.id AS holder_contract_id,
        second_contract.id AS alias_contract_id,
        first_contract.person_id
      FROM eligible first_contract
      JOIN eligible second_contract
        ON second_contract.person_id = first_contract.person_id
       AND second_contract.id::text > first_contract.id::text
      ORDER BY first_contract.person_id::text, first_contract.id::text, second_contract.id::text
      LIMIT 1
    ), other_people AS MATERIALIZED (
      SELECT DISTINCT ON (candidate.person_id) candidate.id, candidate.person_id
      FROM eligible candidate
      CROSS JOIN same_pair pair
      WHERE candidate.person_id <> pair.person_id
        AND candidate.id NOT IN (pair.holder_contract_id, pair.alias_contract_id)
      ORDER BY candidate.person_id, candidate.id
    ), chosen AS MATERIALIZED (
      SELECT * FROM other_people ORDER BY person_id, id LIMIT 4
    )
    SELECT pair.holder_contract_id::text AS "holderContractId",
      pair.alias_contract_id::text AS "aliasContractId",
      chosen.id::text AS "otherContractId"
    FROM same_pair pair CROSS JOIN chosen
    ORDER BY chosen.person_id, chosen.id
  `, [scope.tenantId, scope.sourceDatabase, scope.sourceCompanyId]);
  if (result.rowCount !== 4) return null;
  const selected = rows(result);
  return Object.freeze({
    holderContractId: selected[0].holderContractId,
    aliasContractId: selected[0].aliasContractId,
    checkerContractId: selected[0].otherContractId,
    nonholderContractId: selected[1].otherContractId,
    suspendedContractId: selected[2].otherContractId,
    beneficiaryContractId: selected[3].otherContractId,
  });
}

async function selectQaScope(owner) {
  const result = await owner.query(`
    SELECT tenant.id::text AS "tenantId", binding.id::text AS "sourceBindingId",
      binding.source_database AS "sourceDatabase",
      binding.source_company_id::text AS "sourceCompanyId",
      btrim(policy.certified_release_sha) AS "releaseSha",
      current_date::text AS "baseWorkDate"
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
      AND NOT EXISTS (
        SELECT 1 FROM tenant_exclusive_capability exclusive_assignment
        WHERE exclusive_assignment.tenant_id = tenant.id
          AND exclusive_assignment.capability_key = 'time.overtime.enter'
          AND exclusive_assignment.active IS TRUE
      )
    ORDER BY tenant.id, binding.id
    LIMIT 20
  `);
  for (const candidate of rows(result)) {
    if (!UUID.test(candidate.tenantId) || !UUID.test(candidate.sourceBindingId)
        || !SHA40.test(String(candidate.releaseSha || ''))) continue;
    const contracts = await selectContractSet(owner, candidate);
    if (contracts) return Object.freeze({ ...candidate, contracts });
  }
  throw new QaContractError('QA_FIXTURE_SOURCE_UNAVAILABLE', 'No hay alcance QA con contratos suficientes y titularidad vacante');
}

function fixtureActor(kind, suffix, tenantId, sourceBindingId, releaseSha, contractId, roleKey) {
  const email = qaFixtureEmail(kind, suffix);
  const membershipId = randomUUID();
  const sessionId = randomUUID();
  return {
    kind,
    email,
    contractId,
    roleKey,
    tenantId,
    sourceBindingId,
    membershipId,
    sessionId,
    principal: { email, tenantId, sourceBindingId, membershipId },
    session: { id: sessionId, version: 1, email, releaseSha },
  };
}

async function seedFixtures(owner, scope, suffix) {
  const tenantBId = randomUUID();
  const actors = {
    holder: fixtureActor('holder', suffix, scope.tenantId, scope.sourceBindingId,
      scope.releaseSha, scope.contracts.holderContractId, 'JUNIN_TESORERIA_CARGA'),
    aliasChecker: fixtureActor('alias-checker', suffix, scope.tenantId, scope.sourceBindingId,
      scope.releaseSha, scope.contracts.aliasContractId, 'JUNIN_CONTADURIA_APROBADOR'),
    checker: fixtureActor('checker', suffix, scope.tenantId, scope.sourceBindingId,
      scope.releaseSha, scope.contracts.checkerContractId, 'JUNIN_CONTADURIA_APROBADOR'),
    nonholder: fixtureActor('nonholder', suffix, scope.tenantId, scope.sourceBindingId,
      scope.releaseSha, scope.contracts.nonholderContractId, 'JUNIN_TESORERIA_CARGA'),
    suspended: fixtureActor('suspended', suffix, scope.tenantId, scope.sourceBindingId,
      scope.releaseSha, scope.contracts.suspendedContractId, 'JUNIN_TESORERIA_CARGA'),
    beneficiaryChecker: fixtureActor('beneficiary-checker', suffix, scope.tenantId, scope.sourceBindingId,
      scope.releaseSha, scope.contracts.beneficiaryContractId, 'JUNIN_CONTADURIA_APROBADOR'),
    crossTenant: fixtureActor('cross-tenant', suffix, tenantBId, scope.sourceBindingId,
      scope.releaseSha, null, 'JUNIN_TESORERIA_CARGA'),
  };
  const actorRows = Object.values(actors);
  const qaEmails = actorRows.map((actor) => actor.email);

  await owner.query('BEGIN');
  try {
    await owner.query(`
      INSERT INTO internal_users (
        email, display_name, role, password_hash, active, auth_mode, identity_version
      )
      SELECT fixture.email, 'QA sintético aislado', 'EMPLEADO', NULL, true, 'managed', 1
      FROM unnest($1::text[]) fixture(email)
    `, [qaEmails]);
    await owner.query(`
      INSERT INTO platform_tenant (
        id, slug, legal_name, short_name, tenant_kind, jurisdiction, status, created_by_user_email
      ) VALUES (
        $1::uuid, $2, 'QA mayor esfuerzo aislado', 'QA overtime', 'sandbox',
        'Rama descartable', 'active', $3
      )
    `, [tenantBId, `qa-overtime-${suffix}`, actors.holder.email]);
    await owner.query(`
      INSERT INTO tenant_identity_policy (tenant_id) VALUES ($1::uuid)
      ON CONFLICT (tenant_id) DO NOTHING
    `, [tenantBId]);

    for (const actor of actorRows) {
      await owner.query(`
        INSERT INTO tenant_membership (
          id, tenant_id, user_email, role_key, status,
          invited_by_user_email, activated_at
        ) VALUES ($1::uuid, $2::uuid, $3, $4, 'active', $5, now())
      `, [actor.membershipId, actor.tenantId, actor.email, actor.roleKey, actors.holder.email]);
    }
    for (const actor of actorRows.filter((item) => item.contractId)) {
      await owner.query(`
        INSERT INTO tenant_action_employment_link (
          membership_id, tenant_id, source_binding_id, employment_contract_id,
          active, linked_by_user_email
        ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, true, $5)
      `, [actor.membershipId, actor.tenantId, actor.sourceBindingId,
        actor.contractId, actors.holder.email]);
    }
    for (const actor of actorRows) {
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
    await owner.query('COMMIT');
  } catch (error) {
    await owner.query('ROLLBACK').catch(() => {});
    throw error;
  }

  for (const actor of [actors.holder, actors.nonholder, actors.suspended]) {
    const capabilityResult = await owner.query(`
      SELECT capability_key FROM tenant_iam_effective_capabilities($1::uuid)
    `, [actor.membershipId]);
    const capabilities = new Set(rows(capabilityResult).map((row) => row.capability_key));
    assert.ok(capabilities.has('actions.read') && capabilities.has('time.overtime.enter'));
  }
  for (const actor of [actors.aliasChecker, actors.checker, actors.beneficiaryChecker]) {
    const capabilityResult = await owner.query(`
      SELECT capability_key FROM tenant_iam_effective_capabilities($1::uuid)
    `, [actor.membershipId]);
    const capabilities = new Set(rows(capabilityResult).map((row) => row.capability_key));
    assert.ok(capabilities.has('actions.read') && capabilities.has('time.overtime.approve'));
  }
  const reasonsResult = await owner.query(`
    SELECT reason_code
    FROM action_overtime_reason_catalog
    WHERE policy_version_id = $1 AND governance_status = 'operational_provisional' AND active IS TRUE
    ORDER BY reason_code LIMIT 2
  `, [OVERTIME_POLICY_VERSION]);
  assert.ok(reasonsResult.rowCount >= 2);

  return Object.freeze({
    scope,
    actors,
    qaEmails,
    reasonCodes: rows(reasonsResult).map((row) => row.reason_code),
    exclusiveAssignmentId: randomUUID(),
  });
}

async function actionCounts(owner, qaEmails) {
  const result = await owner.query(`
    SELECT
      (SELECT count(*)::integer FROM action_case action
        WHERE action.case_type = 'overtime_entry'
          AND lower(action.created_by_user_email) = ANY($1::text[])) AS cases,
      (SELECT count(*)::integer FROM action_case_event event
        WHERE event.case_type = 'overtime_entry'
          AND lower(event.actor_user_email) = ANY($1::text[])) AS events
  `, [qaEmails]);
  const value = rows(result)[0];
  return { cases: Number(value.cases), events: Number(value.events) };
}

async function expectActionCodeWithoutWrites(owner, fixtures, expectedCode, operation) {
  const before = await actionCounts(owner, fixtures.qaEmails);
  let caught;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught);
  assert.equal(caught.code, expectedCode);
  assert.deepEqual(await actionCounts(owner, fixtures.qaEmails), before);
}

function workDate(baseDate, offset) {
  assert.ok(Number.isInteger(offset) && offset >= 0 && offset < 27);
  assert.match(String(baseDate || ''), /^\d{4}-\d{2}-\d{2}$/);
  const value = new Date(`${baseDate}T00:00:00.000Z`);
  assert.ok(Number.isFinite(value.getTime()));
  value.setUTCDate(value.getUTCDate() - offset);
  return value.toISOString().slice(0, 10);
}

function overtimePayload(contractId, date, reasonCode, declaredMinutes = 60) {
  return {
    beneficiaryContractId: contractId,
    workDate: date,
    declaredMinutes,
    reasonCode,
    policyVersionId: OVERTIME_POLICY_VERSION,
  };
}

function transitionBody(command, caseId, expectedVersion, extra = {}) {
  return { caseType: OVERTIME_CASE_TYPE, command, caseId, expectedVersion, ...extra };
}

function assertNoPayrollImpact(result) {
  assert.deepEqual(result?.data?.payrollImpact, {
    amount: null,
    rate: null,
    calculated: false,
    posted: false,
    attendanceReconciled: false,
  });
}

async function eventCount(owner, caseId) {
  const result = await owner.query(`
    SELECT count(*)::integer AS events FROM action_case_event WHERE case_id = $1::uuid
  `, [caseId]);
  return Number(rows(result)[0]?.events || 0);
}

async function activateExclusiveAssignment(owner, fixtures) {
  const { holder } = fixtures.actors;
  const result = await owner.query(`
    INSERT INTO tenant_exclusive_capability (
      id, tenant_id, capability_key, membership_id, active, assigned_by_user_email
    )
    SELECT $1::uuid, membership.tenant_id, 'time.overtime.enter', membership.id, true, $4
    FROM tenant_membership membership
    WHERE membership.id = $3::uuid
      AND membership.tenant_id = $2::uuid
      AND membership.status = 'active'
  `, [fixtures.exclusiveAssignmentId, fixtures.scope.tenantId, holder.membershipId, holder.email]);
  assert.equal(result.rowCount, 1);
}

async function setExclusiveActive(owner, fixtures, active) {
  const result = await owner.query(`
    UPDATE tenant_exclusive_capability
    SET active = $2, revoked_at = CASE WHEN $2 THEN NULL ELSE now() END
    WHERE id = $1::uuid
  `, [fixtures.exclusiveAssignmentId, active]);
  assert.equal(result.rowCount, 1);
}

async function verifyDuplicateBlocked(owner, runtime, fixtures, date, minutes) {
  const { holder } = fixtures.actors;
  await expectActionCodeWithoutWrites(owner, fixtures, 'OVERTIME_DUPLICATE_ACTIVE', () => (
    createOvertimeCase(runtime, holder.principal, overtimePayload(
      fixtures.scope.contracts.beneficiaryContractId,
      date,
      fixtures.reasonCodes[1],
      minutes,
    ), randomUUID(), holder.session)
  ));
}

async function runGovernedMatrix(owner, runtime, runtimeRace, fixtures) {
  const {
    holder, aliasChecker, checker, nonholder, suspended, beneficiaryChecker, crossTenant,
  } = fixtures.actors;
  const beneficiary = fixtures.scope.contracts.beneficiaryContractId;
  const reason = fixtures.reasonCodes[0];

  await expectActionCodeWithoutWrites(owner, fixtures, 'OVERTIME_EXCLUSIVE_REQUIRED', () => (
    createOvertimeCase(runtime, holder.principal,
      overtimePayload(beneficiary, workDate(fixtures.scope.baseWorkDate, 0), reason), randomUUID(), holder.session)
  ));
  await activateExclusiveAssignment(owner, fixtures);

  const mainKey = randomUUID();
  const mainPayload = overtimePayload(beneficiary, workDate(fixtures.scope.baseWorkDate, 1), reason, 73);
  const main = await createOvertimeCase(runtime, holder.principal, mainPayload, mainKey, holder.session);
  assert.equal(main.data.status, 'draft');
  assert.equal(main.data.version, 1);
  assert.equal(main.replayed, false);
  assertNoPayrollImpact(main);
  assert.equal(await eventCount(owner, main.data.id), 1);
  await verifyDuplicateBlocked(owner, runtime, fixtures, workDate(fixtures.scope.baseWorkDate, 1), 91);

  await expectActionCodeWithoutWrites(owner, fixtures, 'OVERTIME_EXCLUSIVE_REQUIRED', () => (
    createOvertimeCase(runtime, nonholder.principal,
      overtimePayload(beneficiary, workDate(fixtures.scope.baseWorkDate, 2), reason), randomUUID(), nonholder.session)
  ));

  const replay = await createOvertimeCase(runtime, holder.principal, mainPayload, mainKey, holder.session);
  assert.equal(replay.data.id, main.data.id);
  assert.equal(replay.data.version, 1);
  assert.equal(replay.replayed, true);
  assert.equal(await eventCount(owner, main.data.id), 1);
  await expectActionCodeWithoutWrites(owner, fixtures, 'ACTION_IDEMPOTENCY_KEY_REUSED', () => (
    createOvertimeCase(runtime, holder.principal,
      { ...mainPayload, declaredMinutes: 74 }, mainKey, holder.session)
  ));

  await setExclusiveActive(owner, fixtures, false);
  await expectActionCodeWithoutWrites(owner, fixtures, 'OVERTIME_EXCLUSIVE_REQUIRED', () => (
    createOvertimeCase(runtime, holder.principal,
      overtimePayload(beneficiary, workDate(fixtures.scope.baseWorkDate, 3), reason), randomUUID(), holder.session)
  ));
  await setExclusiveActive(owner, fixtures, true);

  await owner.query(`
    UPDATE tenant_membership
    SET status = 'suspended', suspended_at = now(), version = version + 1, updated_at = now()
    WHERE id = $1::uuid
  `, [suspended.membershipId]);
  await expectActionCodeWithoutWrites(owner, fixtures, 'ACTION_SESSION_INVALID', () => (
    createOvertimeCase(runtime, suspended.principal,
      overtimePayload(beneficiary, workDate(fixtures.scope.baseWorkDate, 4), reason), randomUUID(), suspended.session)
  ));

  const crossTenantPrincipal = {
    ...crossTenant.principal,
    tenantId: fixtures.scope.tenantId,
    sourceBindingId: fixtures.scope.sourceBindingId,
  };
  await expectActionCodeWithoutWrites(owner, fixtures, 'ACTION_SESSION_INVALID', () => (
    createOvertimeCase(runtime, crossTenantPrincipal,
      overtimePayload(beneficiary, workDate(fixtures.scope.baseWorkDate, 5), reason), randomUUID(), crossTenant.session)
  ));

  const submitted = await transitionOvertimeCase(runtime, holder.principal, 'submit', main.data.id,
    transitionBody('submit', main.data.id, 1), randomUUID(), holder.session);
  assert.equal(submitted.data.status, 'submitted');
  assert.equal(submitted.data.version, 2);
  assertNoPayrollImpact(submitted);
  await verifyDuplicateBlocked(owner, runtime, fixtures, workDate(fixtures.scope.baseWorkDate, 1), 92);

  const approval = {
    decisionReasonCode: 'validated_documentation',
    evidenceStatus: 'verified',
    manualValidationConfirmed: true,
  };
  await expectActionCodeWithoutWrites(owner, fixtures, 'ACTION_SEPARATION_OF_DUTIES', () => (
    transitionOvertimeCase(runtime, aliasChecker.principal, 'approve', main.data.id,
      transitionBody('approve', main.data.id, 2, approval), randomUUID(), aliasChecker.session)
  ));
  await expectActionCodeWithoutWrites(owner, fixtures, 'ACTION_SEPARATION_OF_DUTIES', () => (
    transitionOvertimeCase(runtime, beneficiaryChecker.principal, 'approve', main.data.id,
      transitionBody('approve', main.data.id, 2, approval), randomUUID(), beneficiaryChecker.session)
  ));
  const approved = await transitionOvertimeCase(runtime, checker.principal, 'approve', main.data.id,
    transitionBody('approve', main.data.id, 2, approval), randomUUID(), checker.session);
  assert.equal(approved.data.status, 'pending_time_rules');
  assert.equal(approved.data.version, 3);
  assertNoPayrollImpact(approved);
  assert.equal(await eventCount(owner, main.data.id), 3);
  await verifyDuplicateBlocked(owner, runtime, fixtures, workDate(fixtures.scope.baseWorkDate, 1), 93);

  const stalePayload = overtimePayload(beneficiary, workDate(fixtures.scope.baseWorkDate, 6), reason, 65);
  const staleCase = await createOvertimeCase(runtime, holder.principal,
    stalePayload, randomUUID(), holder.session);
  const edited = await updateOvertimeDraft(runtime, holder.principal, staleCase.data.id, {
    workDate: workDate(fixtures.scope.baseWorkDate, 6), declaredMinutes: 66, reasonCode: reason,
    policyVersionId: OVERTIME_POLICY_VERSION,
  }, 1, randomUUID(), holder.session);
  assert.equal(edited.data.version, 2);
  const staleEvents = await eventCount(owner, staleCase.data.id);
  await expectActionCodeWithoutWrites(owner, fixtures, 'ACTION_VERSION_CONFLICT', () => (
    transitionOvertimeCase(runtime, holder.principal, 'submit', staleCase.data.id,
      transitionBody('submit', staleCase.data.id, 1), randomUUID(), holder.session)
  ));
  assert.equal(await eventCount(owner, staleCase.data.id), staleEvents);

  const concurrentKey = randomUUID();
  const concurrentPayload = overtimePayload(beneficiary, workDate(fixtures.scope.baseWorkDate, 7), reason, 67);
  const concurrent = await Promise.all([
    createOvertimeCase(runtime, holder.principal, concurrentPayload, concurrentKey, holder.session),
    createOvertimeCase(runtimeRace, holder.principal, concurrentPayload, concurrentKey, holder.session),
  ]);
  assert.equal(concurrent[0].data.id, concurrent[1].data.id);
  assert.equal(concurrent.filter((item) => item.replayed).length, 1);
  assert.equal(await eventCount(owner, concurrent[0].data.id), 1);

  const cancelledPayload = overtimePayload(beneficiary, workDate(fixtures.scope.baseWorkDate, 8), reason, 68);
  const cancelledCase = await createOvertimeCase(runtime, holder.principal,
    cancelledPayload, randomUUID(), holder.session);
  const cancelled = await transitionOvertimeCase(runtime, holder.principal, 'cancel', cancelledCase.data.id,
    transitionBody('cancel', cancelledCase.data.id, 1, { decisionReasonCode: 'entered_in_error' }),
    randomUUID(), holder.session);
  assert.equal(cancelled.data.status, 'cancelled');
  const recreatedAfterCancel = await createOvertimeCase(runtime, holder.principal,
    { ...cancelledPayload, declaredMinutes: 69 }, randomUUID(), holder.session);
  assert.equal(recreatedAfterCancel.data.status, 'draft');

  const rejectedPayload = overtimePayload(beneficiary, workDate(fixtures.scope.baseWorkDate, 9), reason, 70);
  const rejectedCase = await createOvertimeCase(runtime, holder.principal,
    rejectedPayload, randomUUID(), holder.session);
  await transitionOvertimeCase(runtime, holder.principal, 'submit', rejectedCase.data.id,
    transitionBody('submit', rejectedCase.data.id, 1), randomUUID(), holder.session);
  const rejected = await transitionOvertimeCase(runtime, checker.principal, 'reject', rejectedCase.data.id,
    transitionBody('reject', rejectedCase.data.id, 2, { decisionReasonCode: 'duplicate' }),
    randomUUID(), checker.session);
  assert.equal(rejected.data.status, 'rejected');
  const recreatedAfterReject = await createOvertimeCase(runtime, holder.principal,
    { ...rejectedPayload, declaredMinutes: 71 }, randomUUID(), holder.session);
  assert.equal(recreatedAfterReject.data.status, 'draft');

  return { mainCaseId: main.data.id };
}

async function waitForBlockedBackend(observer, backendPid, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await observer.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_locks WHERE pid = $1::integer AND granted IS FALSE
      ) AS blocked
    `, [backendPid]);
    if (rows(result)[0]?.blocked === true) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new QaContractError('QA_LOCK_BARRIER_TIMEOUT', 'No se observó la barrera de lock esperada');
}

async function createFirstThenOffboard(owner, ownerRace, runtime, fixtures, ownerRacePid) {
  const { holder } = fixtures.actors;
  const payload = overtimePayload(fixtures.scope.contracts.beneficiaryContractId,
    workDate(fixtures.scope.baseWorkDate, 10), fixtures.reasonCodes[0], 72);
  const key = randomUUID();
  let pendingOffboard;
  let committed = false;
  await runtime.query('BEGIN');
  try {
    const created = await createOvertimeCase(runtime, holder.principal, payload, key, holder.session);
    assert.equal(created.replayed, false);
    pendingOffboard = ownerRace.query(`
      UPDATE tenant_action_employment_link
      SET active = false, revoked_at = now(), updated_at = now()
      WHERE membership_id = $1::uuid AND active IS TRUE
    `, [holder.membershipId]);
    void pendingOffboard.catch(() => {});
    await waitForBlockedBackend(owner, ownerRacePid);
    await runtime.query('COMMIT');
    committed = true;
    const offboarded = await pendingOffboard;
    assert.equal(offboarded.rowCount, 1);
    assert.equal(await eventCount(owner, created.data.id), 1);
    await expectActionCodeWithoutWrites(owner, fixtures, 'ACTION_TENANT_AUTHORITY_REQUIRED', () => (
      createOvertimeCase(runtime, holder.principal, payload, key, holder.session)
    ));
  } finally {
    if (!committed) await runtime.query('ROLLBACK').catch(() => {});
    if (pendingOffboard) await pendingOffboard.catch(() => {});
  }
  const restored = await owner.query(`
    UPDATE tenant_action_employment_link
    SET active = true, revoked_at = NULL, updated_at = now()
    WHERE membership_id = $1::uuid
  `, [holder.membershipId]);
  assert.equal(restored.rowCount, 1);
}

async function revokeFirstSessionRace(owner, ownerRace, runtime, fixtures) {
  const { holder } = fixtures.actors;
  const payload = overtimePayload(fixtures.scope.contracts.beneficiaryContractId,
    workDate(fixtures.scope.baseWorkDate, 11), fixtures.reasonCodes[0], 73);
  const key = randomUUID();
  await ownerRace.query('BEGIN');
  try {
    const locked = await ownerRace.query(`
      UPDATE tenant_identity_session
      SET status = 'revoked', revoked_at = now(), revoked_by_user_email = user_email,
        version = version + 1
      WHERE id = $1::uuid AND status = 'active'
    `, [holder.sessionId]);
    assert.equal(locked.rowCount, 1);
    await expectActionCodeWithoutWrites(owner, fixtures, 'ACTION_SESSION_BUSY', () => (
      createOvertimeCase(runtime, holder.principal, payload, key, holder.session)
    ));
    await ownerRace.query('COMMIT');
  } catch (error) {
    await ownerRace.query('ROLLBACK').catch(() => {});
    throw error;
  }
  await expectActionCodeWithoutWrites(owner, fixtures, 'ACTION_SESSION_INVALID', () => (
    createOvertimeCase(runtime, holder.principal, payload, key, holder.session)
  ));
}

async function offboardFirstLinkRace(owner, ownerRace, runtime, fixtures) {
  const { holder } = fixtures.actors;
  const payload = overtimePayload(fixtures.scope.contracts.beneficiaryContractId,
    workDate(fixtures.scope.baseWorkDate, 12), fixtures.reasonCodes[0], 74);
  const key = randomUUID();
  await ownerRace.query('BEGIN');
  try {
    const locked = await ownerRace.query(`
      UPDATE tenant_action_employment_link
      SET active = false, revoked_at = now(), updated_at = now()
      WHERE membership_id = $1::uuid AND active IS TRUE
    `, [holder.membershipId]);
    assert.equal(locked.rowCount, 1);
    await expectActionCodeWithoutWrites(owner, fixtures, 'ACTION_SESSION_BUSY', () => (
      createOvertimeCase(runtime, holder.principal, payload, key, holder.session)
    ));
    await ownerRace.query('COMMIT');
  } catch (error) {
    await ownerRace.query('ROLLBACK').catch(() => {});
    throw error;
  }
  await expectActionCodeWithoutWrites(owner, fixtures, 'ACTION_TENANT_AUTHORITY_REQUIRED', () => (
    createOvertimeCase(runtime, holder.principal, payload, key, holder.session)
  ));
}

async function runConcurrencyMatrix(owner, ownerRace, runtime, fixtures) {
  const pidResult = await ownerRace.query('SELECT pg_backend_pid()::integer AS pid');
  const ownerRacePid = Number(rows(pidResult)[0]?.pid);
  assert.ok(Number.isInteger(ownerRacePid) && ownerRacePid > 0);
  await createFirstThenOffboard(owner, ownerRace, runtime, fixtures, ownerRacePid);
  await offboardFirstLinkRace(owner, ownerRace, runtime, fixtures);
  await revokeFirstSessionRace(owner, ownerRace, runtime, fixtures);
}

async function verifyStoredNoPayrollContract(owner, fixtures) {
  const result = await owner.query(`
    SELECT
      count(*)::integer AS events,
      count(*) FILTER (WHERE
        event.metadata ?| ARRAY['amount','rate','payrollAmount','payrollRate','actorEmail','dni','cuil']
      )::integer AS "forbiddenMetadata",
      count(*) FILTER (WHERE
        event.metadata - ARRAY[
          'command','decisionReasonCode','reasonPresent','evidenceStatus',
          'manualValidationConfirmed','payrollCalculated','payrollPosted'
        ] <> '{}'::jsonb
      )::integer AS "unexpectedMetadata",
      count(*) FILTER (WHERE
        event.metadata->'payrollCalculated' IS DISTINCT FROM 'false'::jsonb
        OR event.metadata->'payrollPosted' IS DISTINCT FROM 'false'::jsonb
      )::integer AS "unsafePayrollFlags",
      (SELECT count(*)::integer FROM action_case action
        WHERE action.case_type = 'overtime_entry'
          AND lower(action.created_by_user_email) = ANY($1::text[])
          AND (action.payload - ARRAY['workDate','declaredMinutes','reasonCode']) <> '{}'::jsonb
      ) AS "unsafePayloads"
    FROM action_case_event event
    WHERE event.case_type = 'overtime_entry'
      AND lower(event.actor_user_email) = ANY($1::text[])
  `, [fixtures.qaEmails]);
  const value = rows(result)[0];
  assert.ok(Number(value.events) > 0);
  assert.equal(Number(value.forbiddenMetadata), 0);
  assert.equal(Number(value.unexpectedMetadata), 0);
  assert.equal(Number(value.unsafePayrollFlags), 0);
  assert.equal(Number(value.unsafePayloads), 0);
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
    runtimeIdentityVerified: true,
    globalSecurityDefinerAllowlistVerified: true,
    directRuntimeDmlDenied: true,
    syntheticFixturesOnly: true,
    exclusiveAuthorityMatrixVerified: true,
    tenantIsolationVerified: true,
    personIdMakerCheckerVerified: true,
    idempotencyAndVersioningVerified: true,
    dailyDuplicateLifecycleVerified: true,
    protectedDataUnchanged: true,
    revokeAndOffboardingRacesVerified: true,
    piiPrinted: false,
  });
}

export function buildSafeFailure(error) {
  return Object.freeze({
    ok: false,
    stage: /^[a-z][a-z0-9-]{1,47}$/.test(String(error?.stage || '')) ? error.stage : 'startup',
    code: safeErrorCode(error),
    piiPrinted: false,
  });
}

export async function runGovernedOvertimeLive({
  env = process.env,
  argv = process.argv.slice(2),
  ClientClass = Client,
} = {}) {
  const config = loadGovernedOvertimeQaConfig(env, argv);
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const owner = new ClientClass({ connectionString: config.ownerUrl });
  const ownerRace = new ClientClass({ connectionString: config.ownerUrl });
  const runtime = new ClientClass({ connectionString: config.runtimeUrl });
  const runtimeRace = new ClientClass({ connectionString: config.runtimeUrl });
  let baselineFingerprint;
  let fixtures;

  try {
    await stage('connect', async () => {
      await Promise.all([owner.connect(), ownerRace.connect(), runtime.connect(), runtimeRace.connect()]);
      await Promise.all([
        runtime.query("SET statement_timeout = '10s'"),
        runtimeRace.query("SET statement_timeout = '10s'"),
      ]);
    });
    await stage('branch-identity', async () => {
      const [ownerIdentity, runtimeIdentity] = await Promise.all([
        verifyConnectionIdentity(owner, config),
        verifyConnectionIdentity(runtime, config),
      ]);
      guard(ownerIdentity.currentUser === config.ownerUser && ownerIdentity.sessionUser === config.ownerUser,
        'QA_OWNER_IDENTITY_DRIFT', 'Credencial owner inesperada');
      guard(runtimeIdentity.currentUser === RUNTIME_ROLE && runtimeIdentity.sessionUser === RUNTIME_ROLE,
        'QA_RUNTIME_IDENTITY_DRIFT', 'Credencial runtime inesperada');
      guard(ownerIdentity.currentUser !== runtimeIdentity.currentUser,
        'QA_CREDENTIAL_SEPARATION_REQUIRED', 'Owner y runtime resuelven al mismo rol');
    });
    await stage('migration-hash', () => verifyInstalledMigration(owner));
    await stage('runtime-acl', async () => {
      validateRuntimeBoundaryEvidence(await collectRuntimeBoundaryEvidence(owner, runtime));
      await verifyDirectRuntimeDenials(runtime);
      await verifyGlobalSecurityDefinerCanary(owner, suffix);
      validateRuntimeBoundaryEvidence(await collectRuntimeBoundaryEvidence(owner, runtime));
    });
    baselineFingerprint = await stage('protected-baseline', () => protectedDataFingerprint(owner));
    const scope = await stage('fixture-source', () => selectQaScope(owner));
    fixtures = await stage('fixture-seed', () => seedFixtures(owner, scope, suffix));
    await stage('workflow-matrix', () => runGovernedMatrix(owner, runtime, runtimeRace, fixtures));
    await stage('concurrency-matrix', () => runConcurrencyMatrix(owner, ownerRace, runtime, fixtures));
    await stage('no-payroll-contract', () => verifyStoredNoPayrollContract(owner, fixtures));
    await stage('protected-final', async () => {
      assert.deepEqual(await protectedDataFingerprint(owner), baselineFingerprint);
    });
    return buildSafeSummary();
  } finally {
    await Promise.all([
      safeRollback(runtime), safeRollback(runtimeRace), safeRollback(ownerRace), safeRollback(owner),
    ]);
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
    const summary = await runGovernedOvertimeLive();
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify(buildSafeFailure(error))}\n`);
    process.exitCode = 1;
  }
}
