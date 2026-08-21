import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import { directCanonicalDatabaseUrl } from './lib/canonical-import.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';

export const ACTION_READ_MIGRATION_VERSION = '007-action-center-read-facades';
const MIGRATION_URL = new URL('./migrations/007-action-center-read-facades.sql', import.meta.url);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';
const PREREQUISITE_MIGRATIONS = Object.freeze([
  ['003-action-center', new URL('./migrations/003-action-center.sql', import.meta.url)],
  ['004-tenant-iam-control-plane', new URL('./migrations/004-tenant-iam-control-plane.sql', import.meta.url)],
  ['005-tenant-identity-gateway', new URL('./migrations/005-tenant-identity-gateway.sql', import.meta.url)],
  ['006-tenant-action-authority', new URL('./migrations/006-tenant-action-authority.sql', import.meta.url)],
]);

export const ACTION_READ_SIGNATURES = Object.freeze({
  context: 'public.action_center_context_v2(text,uuid,integer,text,uuid,uuid)',
  bootstrap: 'public.action_center_tenant_bootstrap_v2(text,uuid,integer,text,uuid,uuid,text)',
  list: 'public.action_center_tenant_list_v2(text,uuid,integer,text,uuid,uuid,text,text,text,integer,integer)',
  detail: 'public.action_center_tenant_detail_v2(text,uuid,integer,text,uuid,uuid,uuid)',
  routing: 'public.action_center_tenant_routing_v2(text,uuid,integer,text,uuid,uuid,uuid)',
  sessionAssert: 'public.action_center_assert_tenant_read_session_v2(text,uuid,integer,text,uuid,uuid)',
  capability: 'public.action_center_context_has_capability(jsonb,text)',
  scope: 'public.action_center_context_has_area_scope(jsonb,text,bigint,text,text)',
  nominal: 'public.action_center_context_nominal_read(jsonb,uuid,bigint,text,text,text)',
});
const DEPENDENCY_SIGNATURES = Object.freeze([
  'public.tenant_iam_effective_capabilities(uuid)',
  'public.tenant_iam_assert_no_sod_conflict(uuid)',
  'public.action_center_tenant_actor_authorized(text,uuid,uuid,text,uuid,bigint,text,text,text,text)',
]);

const APPLY_SIGNATURE = 'public.action_center_apply_tenant_command(text,uuid,integer,text,uuid,uuid,text,text,uuid,integer,uuid,text,jsonb,uuid,text,text,text,text,boolean)';
const PROVISION_SIGNATURE = 'public.tenant_action_apply_provisioning_command(text,uuid,uuid,uuid,text,uuid,text,integer,jsonb)';
const IAM_RUNTIME_SIGNATURES = Object.freeze([
  'public.tenant_iam_admin_view_v2(text,uuid,integer,text,integer)',
  'public.tenant_iam_apply_command_v2(text,uuid,integer,text,uuid,text,integer,jsonb)',
]);
const IDENTITY_RUNTIME_SIGNATURES = Object.freeze([
  'public.tenant_identity_resolve_access(text,uuid,integer,integer,text[],text)',
  'public.tenant_identity_take_rate_limit(text,text,integer,integer,integer)',
  'public.tenant_identity_record_attempt(text,boolean,bigint)',
  'public.tenant_identity_lookup(text,text,text,text)',
  'public.tenant_identity_command_replay(text,uuid,text)',
  'public.tenant_identity_view(text,uuid,text,integer)',
  'public.tenant_identity_apply_command(text,text,uuid,text,integer,jsonb)',
  'public.tenant_identity_legacy_session_policy(text)',
]);
const EXPECTED_RUNTIME_FUNCTIONS = new Set([
  ACTION_READ_SIGNATURES.context,
  ACTION_READ_SIGNATURES.bootstrap,
  ACTION_READ_SIGNATURES.list,
  ACTION_READ_SIGNATURES.detail,
  ACTION_READ_SIGNATURES.routing,
  APPLY_SIGNATURE,
  PROVISION_SIGNATURE,
  ...IAM_RUNTIME_SIGNATURES,
  ...IDENTITY_RUNTIME_SIGNATURES,
]);
export const ACTION_READ_RUNTIME_FUNCTION_ALLOWLIST = Object.freeze([...EXPECTED_RUNTIME_FUNCTIONS]);
const SECURITY_EVIDENCE_SIGNATURES = Object.freeze([...new Set([
  ...Object.values(ACTION_READ_SIGNATURES),
  ...DEPENDENCY_SIGNATURES,
  ...EXPECTED_RUNTIME_FUNCTIONS,
])]);

function rows(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function normalized(value) {
  return String(value || '').replaceAll('"', '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function requireTokens(name, definition, tokens) {
  const body = normalized(definition);
  for (const token of tokens) {
    if (!body.includes(normalized(token))) throw new Error(`${name} no contiene contrato ${token}`);
  }
}

function requireOrder(name, definition, tokens) {
  const body = normalized(definition);
  let cursor = -1;
  for (const token of tokens) {
    const next = body.indexOf(normalized(token), cursor + 1);
    if (next < 0 || next <= cursor) throw new Error(`${name} no conserva orden ${tokens.join(' -> ')}`);
    cursor = next;
  }
}

function migrationFunctionBlock(sql, functionName) {
  const marker = `CREATE OR REPLACE FUNCTION ${functionName}(`;
  const start = String(sql || '').indexOf(marker);
  if (start < 0) throw new Error(`migracion 007 no contiene ${functionName}`);
  const end = String(sql).indexOf('\n$$;', start);
  if (end < 0) throw new Error(`migracion 007 no cierra ${functionName}`);
  return String(sql).slice(start, end + 4);
}

function requireSingleDeclare(name, definition) {
  const normalizedDefinition = String(definition || '');
  const bodyStart = normalizedDefinition.indexOf('AS $$');
  const begin = normalizedDefinition.indexOf('\nBEGIN', bodyStart + 5);
  if (bodyStart < 0 || begin < 0) throw new Error(`${name} no conserva bloque PL/pgSQL compilable`);
  const declarations = normalizedDefinition.slice(bodyStart + 5, begin).match(/\bDECLARE\b/gi) || [];
  if (declarations.length !== 1) throw new Error(`${name} debe contener un unico DECLARE`);
}

export function validateActionReadMigrationSql(sql) {
  requireTokens('migracion 007', sql, [
    'CREATE OR REPLACE FUNCTION action_center_assert_tenant_read_session_v2',
    'CREATE OR REPLACE FUNCTION action_center_tenant_bootstrap_v2',
    'CREATE OR REPLACE FUNCTION action_center_tenant_list_v2',
    'CREATE OR REPLACE FUNCTION action_center_tenant_detail_v2',
    'CREATE OR REPLACE FUNCTION action_center_tenant_routing_v2',
    'REVOKE ALL PRIVILEGES ON FUNCTION action_center_resolve_tenant_principal',
    'REVOKE SELECT (%s), INSERT (%s), UPDATE (%s), REFERENCES (%s)',
    'ACTION_RUNTIME_ROLE_ATTRIBUTES_FORBIDDEN',
    'runtime_role.rolcanlogin IS NOT TRUE',
    'runtime_role.rolinherit IS NOT FALSE',
    'ACTION_RUNTIME_ROLE_MEMBERSHIP_FORBIDDEN',
    'ACTION_RUNTIME_ROLE_ADMIN_EDGE_FORBIDDEN',
    'membership.member = runtime_role.oid',
    'membership.roleid = runtime_role.oid',
    'membership.member = approved_owner_oid',
    'membership.admin_option IS TRUE',
    'membership.inherit_option IS FALSE',
    'membership.set_option IS FALSE',
  ]);
  for (const forbidden of [
    'CREATE OR REPLACE FUNCTION action_center_resolve_tenant_principal',
    "action.payload - 'employeeNote'",
    'event.metadata AS',
    'LIMIT 5001',
    'ALTER ROLE municontrol_actions_runtime_app',
  ]) {
    if (normalized(sql).includes(normalized(forbidden))) {
      throw new Error(`migracion 007 reintroduce contrato inseguro: ${forbidden}`);
    }
  }
  requireSingleDeclare(
    'routing facade', migrationFunctionBlock(sql, 'action_center_tenant_routing_v2'),
  );
}

export function validateActionReadEvidence(evidence) {
  const functions = new Map((evidence?.functions || []).map((item) => [item.signature, item]));
  for (const signature of SECURITY_EVIDENCE_SIGNATURES) {
    const item = functions.get(signature);
    if (!item || item.securityDefiner !== true || item.publicExecuteRevoked !== true
        || item.ownedByCurrentUser !== true || item.owner === RUNTIME_ROLE
        || !String(item.config || '').includes('search_path=public, pg_temp')) {
      throw new Error(`fachada 007 ausente o insegura: ${signature}`);
    }
  }

  const effective = functions.get(DEPENDENCY_SIGNATURES[0])?.definition;
  requireTokens('effective capabilities dependency', effective, [
    "membership.status = 'active'", "tenant.status = 'active'", "role_row.scope_kind = 'tenant'",
    'override_row.allow_override IS TRUE', 'override_row.deny_override IS TRUE',
  ]);
  const sod = functions.get(DEPENDENCY_SIGNATURES[1])?.definition;
  requireTokens('SoD dependency', sod, [
    'FROM iam_capability_conflict conflict',
    'tenant_iam_effective_capabilities(p_membership_id)',
    "RAISE EXCEPTION 'TENANT_IAM_SOD_CONFLICT'",
  ]);
  const actorAuthorized = functions.get(DEPENDENCY_SIGNATURES[2])?.definition;
  requireTokens('actor authorization dependency', actorAuthorized, [
    'membership.id = p_membership_id', 'membership.tenant_id = p_tenant_id',
    "effective.capability_key = 'actions.read'", 'scope.capability_key = required_capability',
    "p_confidentiality = 'restricted'", "leave.request.payroll.read",
  ]);

  const session = functions.get(ACTION_READ_SIGNATURES.sessionAssert)?.definition;
  requireOrder('session facade', session, [
    'FROM internal_users users',
    'FROM tenant_membership membership',
    'FROM tenant_identity_session identity_session',
    'FROM platform_tenant tenant',
    'FROM tenant_identity_policy policy',
    'FROM platform_tenant_source_binding binding',
    'FROM tenant_action_authority authority',
    'FROM tenant_action_employment_link link',
  ]);
  requireTokens('session facade', session, [
    "identity_session.source = 'membership'",
    "identity_session.auth_level IN ('mfa', 'recovery')",
    'identity_session.session_version = p_actor_session_version',
    'identity_session.identity_version = user_row.identity_version',
    'policy.tenant_data_plane_ready IS TRUE',
    'lower(policy.certified_release_sha) = lower(p_release_sha)',
    "binding.source_system = 'GRH'", 'binding.verified IS TRUE',
    "batch.validation_state = 'published'", 'batch.legacy_import_run_id IS NOT NULL',
    "effective.capability_key = 'actions.read'", 'FOR SHARE NOWAIT',
    'WHEN lock_not_available', "RAISE EXCEPTION 'ACTION_SESSION_BUSY'",
  ]);
  const normalizedSession = normalized(session);
  const membershipLock = normalizedSession.slice(
    normalizedSession.indexOf('from tenant_membership membership'),
    normalizedSession.indexOf('from tenant_identity_session identity_session'),
  );
  const sessionLock = normalizedSession.slice(
    normalizedSession.indexOf('from tenant_identity_session identity_session'),
    normalizedSession.indexOf('from platform_tenant tenant'),
  );
  if (!membershipLock.includes('for share nowait') || !sessionLock.includes('for share nowait')) {
    throw new Error('session facade no elimina espera circular de membership/sesion con NOWAIT');
  }
  const lockHandler = normalizedSession.slice(normalizedSession.lastIndexOf('exception when lock_not_available'));
  if (!lockHandler.includes("when lock_not_available then raise exception 'action_session_busy'")
      || lockHandler.includes("when lock_not_available then raise exception 'action_session_invalid'")) {
    throw new Error('session facade confunde contencion transitoria con sesion invalida');
  }

  const bootstrap = functions.get(ACTION_READ_SIGNATURES.bootstrap)?.definition;
  requireTokens('bootstrap facade', bootstrap, [
    'char_length(normalized_query) < 2', 'char_length(normalized_query) > 50',
    'LIMIT 51', 'employee.import_run_id = batch.legacy_import_run_id',
    'batch.source_database = context_value->>\'sourceDatabase\'',
    "batch.validation_state = 'published'", 'action_center_tenant_actor_authorized',
    "'accessBasis'", "'authorized_scope'",
    "catalog.import_run_id = published.legacy_import_run_id",
  ]);

  const list = functions.get(ACTION_READ_SIGNATURES.list)?.definition;
  requireTokens('list facade', list, [
    'p_page > 200', 'p_limit > 50', 'WITH candidate AS MATERIALIZED',
    'action.tenant_id = (context_value->>\'tenantId\')::uuid',
    'action.source_binding_id = (context_value->>\'sourceBindingId\')::uuid',
    'action.company_id = (context_value->>\'sourceCompanyId\')::bigint',
    'contract.source_batch_id = action.source_batch_id',
    'employee.import_run_id = page.legacy_import_run_id',
    "'reasonCode', page.payload->>'reasonCode'",
    "CASE WHEN page.nominal_allowed THEN page.tenant_id END",
    "CASE WHEN access.nominal_allowed THEN 'nominal' ELSE 'payroll' END",
    '(SELECT count(*)::integer FROM candidate)',
  ]);
  for (const forbidden of ["page.payload - 'employeeNote'", 'to_jsonb(page.payload)', "page.payload->>'employeeNote'"]) {
    if (normalized(list).includes(normalized(forbidden))) throw new Error(`list facade filtra payload de forma insegura: ${forbidden}`);
  }

  const detail = functions.get(ACTION_READ_SIGNATURES.detail)?.definition;
  requireOrder('detail facade', detail, [
    'action_center_assert_tenant_read_session_v2',
    'FROM action_case action',
    'FROM employment_contract contract',
    'FROM source_import_batch batch',
    'action_center_context_nominal_read',
  ]);
  requireTokens('detail facade', detail, [
    'action.company_id = (context_value->>\'sourceCompanyId\')::bigint',
    "batch.validation_state = 'published'", 'batch.legacy_import_run_id IS NOT NULL',
    'employee.import_run_id = batch_row.legacy_import_run_id',
    "'employeeNote', CASE WHEN nominal_allowed THEN action_row.payload->>'employeeNote' END",
    "'command', event.metadata->>'command'",
    "'reasonPresent'", "'evidenceStatus'", "'manualValidationConfirmed'",
    "CASE WHEN nominal_allowed THEN timeline_value ELSE '[]'::jsonb END",
    "CASE WHEN nominal_allowed THEN commands_value ELSE '[]'::jsonb END",
  ]);
  for (const forbidden of ['to_jsonb(event.metadata)', "'metadata', event.metadata", "event.metadata - '"]) {
    if (normalized(detail).includes(normalized(forbidden))) throw new Error(`detail expone metadata cruda: ${forbidden}`);
  }

  const routing = functions.get(ACTION_READ_SIGNATURES.routing)?.definition;
  requireTokens('routing facade', routing, [
    'action_center_tenant_detail_v2', "record_value->>'projection' <> 'nominal'",
    "'routing', jsonb_build_object",
  ]);
}

export function validateActionReadRuntimeAclEvidence(evidence) {
  const runtimeRole = evidence?.runtimeRole;
  if (!runtimeRole || runtimeRole.canLogin !== true || runtimeRole.inherit !== false
      || runtimeRole.superuser || runtimeRole.bypassRls || runtimeRole.createDb
      || runtimeRole.createRole || runtimeRole.replication
      || Number(runtimeRole.membershipCount) !== 0
      || runtimeRole.schemaUsage !== true || runtimeRole.schemaCreate !== false) {
    throw new Error('rol runtime 007 no es LOGIN NOINHERIT aislado o conserva membresias/atributos elevados');
  }
  const roleMemberships = Array.isArray(evidence?.roleMemberships) ? evidence.roleMemberships : [];
  if (Number(runtimeRole.memberCount) !== roleMemberships.length || roleMemberships.length > 1) {
    throw new Error('rol runtime 007 conserva miembros no inventariados o mas de un owner administrativo');
  }
  for (const membership of roleMemberships) {
    if (membership.direction !== 'member_of_runtime'
        || membership.grantedRole !== RUNTIME_ROLE
        || membership.memberIsCurrentUser !== true
        || membership.memberOwnsApprovedFunctions !== true
        || membership.adminOption !== true
        || membership.inheritOption !== false
        || membership.setOption !== false) {
      throw new Error('rol runtime 007 conserva una arista de membresia no aprobada o escalable');
    }
  }
  for (const item of evidence?.runtimeFunctions || []) {
    const expected = EXPECTED_RUNTIME_FUNCTIONS.has(item.signature);
    if (item.execute !== expected) throw new Error(`ACL runtime de funcion incorrecta: ${item.signature}`);
  }
  for (const signature of EXPECTED_RUNTIME_FUNCTIONS) {
    if (!(evidence?.runtimeFunctions || []).some((item) => item.signature === signature)) {
      throw new Error(`ACL runtime sin evidencia de funcion: ${signature}`);
    }
  }
  for (const relation of evidence?.relations || []) {
    if (relation.canSelect || relation.canInsert || relation.canUpdate || relation.canReferences
        || relation.canDelete || relation.canTruncate || relation.canTrigger) {
      throw new Error(`runtime conserva privilegio directo: ${relation.name}`);
    }
  }
  for (const sequence of evidence?.sequences || []) {
    if (sequence.canUsage || sequence.canSelect || sequence.canUpdate) {
      throw new Error(`runtime conserva secuencia: ${sequence.name}`);
    }
  }
}

async function verifyPrerequisites(client) {
  const expected = new Map(await Promise.all(PREREQUISITE_MIGRATIONS.map(async ([version, url]) => {
    const contents = await readFile(url, 'utf8');
    return [version, createHash('sha256').update(contents).digest('hex')];
  })));
  const result = await client.query(`
    SELECT version, checksum_sha256 FROM schema_migrations
    WHERE version = ANY($1::text[])
  `, [[...expected.keys()]]);
  const applied = new Map(rows(result).map((item) => [item.version, String(item.checksum_sha256 || '').trim()]));
  for (const [version, checksum] of expected) {
    if (!applied.has(version)) throw new Error(`prerrequisito 007 ausente: ${version}`);
    if (applied.get(version) !== checksum) throw new Error(`drift de checksum en prerrequisito 007: ${version}`);
  }
}

async function collectEvidence(client) {
  const signatures = SECURITY_EVIDENCE_SIGNATURES;
  const functions = await client.query(`
    SELECT format('%s.%s(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature,
      function_row.prosecdef AS "securityDefiner",
      function_row.proowner = current_user::regrole::oid AS "ownedByCurrentUser",
      owner.rolname AS owner,
      NOT EXISTS (
        SELECT 1
        FROM aclexplode(COALESCE(function_row.proacl, acldefault('f', function_row.proowner))) acl
        WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
      ) AS "publicExecuteRevoked",
      array_to_string(function_row.proconfig, ',') AS config,
      pg_get_functiondef(function_row.oid) AS definition
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    JOIN pg_roles owner ON owner.oid = function_row.proowner
    WHERE namespace.nspname = 'public'
      AND format('%s.%s(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) = ANY($1::text[])
    ORDER BY signature
  `, [signatures]);
  return { functions: rows(functions) };
}

async function collectRuntimeAclEvidence(client) {
  const runtimeRole = await client.query(`
    SELECT role_row.rolcanlogin AS "canLogin", role_row.rolinherit AS inherit,
      role_row.rolsuper AS superuser, role_row.rolbypassrls AS "bypassRls",
      role_row.rolcreatedb AS "createDb", role_row.rolcreaterole AS "createRole",
      role_row.rolreplication AS replication,
      (SELECT count(*)::integer FROM pg_auth_members membership WHERE membership.member = role_row.oid) AS "membershipCount",
      (SELECT count(*)::integer FROM pg_auth_members membership WHERE membership.roleid = role_row.oid) AS "memberCount",
      has_schema_privilege(role_row.oid, 'public', 'USAGE') AS "schemaUsage",
      has_schema_privilege(role_row.oid, 'public', 'CREATE') AS "schemaCreate"
    FROM pg_roles role_row WHERE role_row.rolname = $1
  `, [RUNTIME_ROLE]);
  const roleMemberships = await client.query(`
    SELECT
      CASE WHEN membership.member = runtime_role.oid THEN 'granted_to_runtime'
        ELSE 'member_of_runtime' END AS direction,
      granted_role.rolname AS "grantedRole", member_role.rolname AS "memberRole",
      membership.admin_option AS "adminOption",
      membership.inherit_option AS "inheritOption",
      membership.set_option AS "setOption",
      membership.member = current_user::regrole::oid AS "memberIsCurrentUser",
      (
        SELECT count(*)::integer = cardinality($2::text[])
          AND COALESCE(bool_and(function_row.proowner = membership.member), false)
        FROM pg_proc function_row
        JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
        WHERE format('%s.%s(%s)', namespace.nspname, function_row.proname,
          replace(oidvectortypes(function_row.proargtypes), ', ', ',')) = ANY($2::text[])
      ) AS "memberOwnsApprovedFunctions"
    FROM pg_auth_members membership
    JOIN pg_roles runtime_role ON runtime_role.rolname = $1
    JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
    JOIN pg_roles member_role ON member_role.oid = membership.member
    WHERE membership.member = runtime_role.oid OR membership.roleid = runtime_role.oid
    ORDER BY direction, "grantedRole", "memberRole"
  `, [RUNTIME_ROLE, [...EXPECTED_RUNTIME_FUNCTIONS]]);
  const runtimeFunctions = await client.query(`
    SELECT format('%s.%s(%s)', namespace.nspname, function_row.proname,
        replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature,
      has_function_privilege($1, function_row.oid, 'EXECUTE') AS execute
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    WHERE namespace.nspname = 'public'
      AND (function_row.proname LIKE 'action_center%'
        OR function_row.proname LIKE 'tenant_action%'
        OR function_row.proname LIKE 'tenant_iam%'
        OR function_row.proname LIKE 'tenant_identity%')
    ORDER BY signature
  `, [RUNTIME_ROLE]);
  const relations = await client.query(`
    SELECT relation.relname AS name,
      has_any_column_privilege($1, relation.oid, 'SELECT') AS "canSelect",
      has_any_column_privilege($1, relation.oid, 'INSERT') AS "canInsert",
      has_any_column_privilege($1, relation.oid, 'UPDATE') AS "canUpdate",
      has_any_column_privilege($1, relation.oid, 'REFERENCES') AS "canReferences",
      has_table_privilege($1, relation.oid, 'DELETE') AS "canDelete",
      has_table_privilege($1, relation.oid, 'TRUNCATE') AS "canTruncate",
      has_table_privilege($1, relation.oid, 'TRIGGER') AS "canTrigger"
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relkind IN ('r', 'p', 'v', 'm', 'f')
    ORDER BY relation.relname
  `, [RUNTIME_ROLE]);
  const sequences = await client.query(`
    SELECT relation.relname AS name,
      has_sequence_privilege($1, relation.oid, 'USAGE') AS "canUsage",
      has_sequence_privilege($1, relation.oid, 'SELECT') AS "canSelect",
      has_sequence_privilege($1, relation.oid, 'UPDATE') AS "canUpdate"
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relkind = 'S'
    ORDER BY relation.relname
  `, [RUNTIME_ROLE]);
  return {
    runtimeRole: rows(runtimeRole)[0], runtimeFunctions: rows(runtimeFunctions),
    roleMemberships: rows(roleMemberships), relations: rows(relations), sequences: rows(sequences),
  };
}

export async function verifyActionReadFinalAcl(client) {
  validateActionReadEvidence(await collectEvidence(client));
  validateActionReadRuntimeAclEvidence(await collectRuntimeAclEvidence(client));
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  validateActionReadMigrationSql(migration);
  const checksum = createHash('sha256').update(migration).digest('hex');
  const statements = splitPostgresStatements(migration);
  const client = new Client({ connectionString: directCanonicalDatabaseUrl() });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:action-read-007'))`);
    await verifyPrerequisites(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1', [ACTION_READ_MIGRATION_VERSION],
    );
    if (existing.rowCount && existing.rows[0].checksum_sha256.trim() !== checksum) {
      throw new Error(`Drift detectado: ${ACTION_READ_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `migracion ${ACTION_READ_MIGRATION_VERSION} sentencia ${index + 1}/${statements.length}: ${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [ACTION_READ_MIGRATION_VERSION, checksum],
      );
    }
    await verifyActionReadFinalAcl(client);
    await client.query('COMMIT');
    console.log(existing.rowCount
      ? `${ACTION_READ_MIGRATION_VERSION}: ya aplicada y verificada (SHA-256 ${checksum})`
      : `${ACTION_READ_MIGRATION_VERSION}: aplicada (${statements.length} sentencias, SHA-256 ${checksum})`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

const invokedAsScript = Boolean(process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url);
if (invokedAsScript) await main();
