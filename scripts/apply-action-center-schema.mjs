import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import { directCanonicalDatabaseUrl } from './lib/canonical-import.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';

const MIGRATION_VERSION = '003-action-center';
const MIGRATION_URL = new URL('./migrations/003-action-center.sql', import.meta.url);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';
const EXPECTED_TABLES = Object.freeze([
  'internal_user_employment_link',
  'internal_user_area_scope',
  'action_case',
  'action_case_event',
  'action_command_context',
]);
const EXPECTED_FUNCTIONS = Object.freeze([
  'action_center_reject_change',
  'action_center_reject_delete',
  'action_center_valid_leave_payload',
  'action_center_actor_authorized',
  'action_center_set_command_context',
  'action_center_require_case_context',
  'action_center_require_event_context',
  'action_center_log_case_event',
  'action_center_validate_case_update',
  'action_center_apply_command',
]);
const EXPECTED_TRIGGERS = Object.freeze([
  'action_case_no_delete',
  'action_case_require_context',
  'action_case_log_event',
  'action_case_event_append_only',
  'action_case_event_require_context',
  'action_case_validate_update',
]);
const EXPECTED_INDEXES = Object.freeze([
  'internal_users_email_lower_uk',
  'internal_user_area_scope_identity_uk',
  'action_case_leave_active_request_uk',
  'action_case_event_maker_person_idx',
]);
const RUNTIME_SELECT_COLUMNS = Object.freeze({
  internal_users: Object.freeze(['email', 'display_name', 'role', 'active']),
  internal_user_employment_link: Object.freeze([
    'user_email', 'employment_contract_id', 'active',
  ]),
  internal_user_area_scope: Object.freeze([
    'user_email', 'scope_level', 'company_id',
    'organization_unit_source_id', 'sector_source_id', 'active',
  ]),
  action_case: Object.freeze([
    'id', 'case_number', 'case_type', 'beneficiary_contract_id', 'source_batch_id',
    'company_id', 'organization_unit_source_id', 'sector_source_id',
    'status', 'confidentiality', 'policy_version_id', 'payload', 'evidence_status',
    'created_by_user_email', 'submitted_by_user_email', 'submitted_at',
    'decided_by_user_email', 'decided_at', 'decision_reason', 'manual_validation_confirmed',
    'cancelled_by_user_email', 'cancelled_at', 'cancellation_reason',
    'version', 'created_at', 'updated_at',
  ]),
  action_case_event: Object.freeze([
    'id', 'case_id', 'case_version', 'event_type', 'from_status', 'to_status',
    'actor_user_email', 'actor_role', 'metadata', 'occurred_at',
  ]),
  employment_contract: Object.freeze([
    'id', 'person_id', 'legacy_company_id', 'legacy_legajo',
    'organization_unit_source_id', 'sector_source_id', 'status',
  ]),
  person_identity: Object.freeze(['id', 'full_name']),
  grh_employees: Object.freeze(['company_id', 'legajo', 'nombre', 'sector']),
  grh_catalog_rows: Object.freeze(['catalog', 'source_key', 'label']),
  source_import_batch: Object.freeze([
    'id', 'source_system', 'source_cutoff', 'validation_state', 'recorded_at',
  ]),
});
const RUNTIME_RELATIONS = Object.freeze([
  ...Object.keys(RUNTIME_SELECT_COLUMNS),
  'action_command_context',
  'vw_action_leave_request',
]);
const RUNTIME_SEQUENCES = Object.freeze([
  'action_case_case_number_seq',
  'action_case_event_id_seq',
]);
const APPLY_COMMAND_SIGNATURE = 'public.action_center_apply_command(text,text,text,uuid,integer,uuid,text,jsonb,uuid,text,text,text,text,boolean)';
const RUNTIME_FUNCTION_SIGNATURES = Object.freeze([
  'public.action_center_reject_change()',
  'public.action_center_reject_delete()',
  'public.action_center_valid_leave_payload(jsonb)',
  'public.action_center_actor_authorized(text,text,text,uuid,bigint,text,text,text,text)',
  'public.action_center_set_command_context(text,text,uuid,uuid,text,uuid,text,jsonb)',
  'public.action_center_require_case_context()',
  'public.action_center_require_event_context()',
  'public.action_center_log_case_event()',
  'public.action_center_validate_case_update()',
  APPLY_COMMAND_SIGNATURE,
]);

const TRIGGER_CONTRACT = Object.freeze({
  action_case_no_delete: Object.freeze({
    tableName: 'action_case', functionName: 'action_center_reject_delete',
    definitionTokens: Object.freeze(['before delete', 'for each row']),
  }),
  action_case_require_context: Object.freeze({
    tableName: 'action_case', functionName: 'action_center_require_case_context',
    definitionTokens: Object.freeze(['before', 'insert', 'update', 'for each row']),
  }),
  action_case_log_event: Object.freeze({
    tableName: 'action_case', functionName: 'action_center_log_case_event',
    definitionTokens: Object.freeze(['after', 'insert', 'update', 'for each row']),
  }),
  action_case_event_append_only: Object.freeze({
    tableName: 'action_case_event', functionName: 'action_center_reject_change',
    definitionTokens: Object.freeze(['before', 'update', 'delete', 'for each row']),
  }),
  action_case_event_require_context: Object.freeze({
    tableName: 'action_case_event', functionName: 'action_center_require_event_context',
    definitionTokens: Object.freeze(['before insert', 'for each row']),
  }),
  action_case_validate_update: Object.freeze({
    tableName: 'action_case', functionName: 'action_center_validate_case_update',
    definitionTokens: Object.freeze(['before update', 'for each row']),
  }),
});

const INDEX_CONTRACT = Object.freeze({
  internal_users_email_lower_uk: Object.freeze({
    tableName: 'internal_users', unique: true, partial: false,
    definitionTokens: Object.freeze(['using btree', 'lower', 'email']),
    predicateTokens: Object.freeze([]),
  }),
  internal_user_area_scope_identity_uk: Object.freeze({
    tableName: 'internal_user_area_scope', unique: true, partial: false,
    definitionTokens: Object.freeze([
      'using btree', 'lower', 'user_email', 'scope_level', 'company_id',
      'organization_unit_source_id', 'sector_source_id', 'coalesce',
    ]),
    predicateTokens: Object.freeze([]),
  }),
  action_case_leave_active_request_uk: Object.freeze({
    tableName: 'action_case', unique: true, partial: true,
    definitionTokens: Object.freeze([
      'beneficiary_contract_id', 'reasoncode', 'startson', 'endson',
      'durationunit', 'startsatlocal', 'endsatlocal',
    ]),
    predicateTokens: Object.freeze([
      'case_type', 'leave_request', 'status', 'draft', 'submitted', 'approved',
    ]),
  }),
  action_case_event_maker_person_idx: Object.freeze({
    tableName: 'action_case_event', unique: false, partial: true,
    definitionTokens: Object.freeze(['case_id', 'actor_person_id']),
    predicateTokens: Object.freeze([
      'event_type', 'created', 'draft_updated', 'submitted',
    ]),
  }),
});

const CONSTRAINT_CONTRACT = Object.freeze({
  internal_user_area_scope_shape_ck: Object.freeze({
    tableName: 'internal_user_area_scope', type: 'c',
    definitionTokens: Object.freeze([
      'scope_level', 'company', 'organization', 'sector',
      'organization_unit_source_id', 'sector_source_id',
    ]),
  }),
  action_case_policy_version_ck: Object.freeze({
    tableName: 'action_case', type: 'c',
    definitionTokens: Object.freeze(['policy_version_id', 'mendoza-ley-5811-title-vi.v1']),
  }),
  action_case_leave_payload_ck: Object.freeze({
    tableName: 'action_case', type: 'c',
    definitionTokens: Object.freeze(['action_center_valid_leave_payload', 'payload', 'is true']),
  }),
  action_case_leave_confidentiality_ck: Object.freeze({
    tableName: 'action_case', type: 'c',
    definitionTokens: Object.freeze(['reasoncode', 'restricted', 'employeenote']),
  }),
  action_case_submission_ck: Object.freeze({
    tableName: 'action_case', type: 'c',
    definitionTokens: Object.freeze(['submitted_by_user_email', 'submitted_at']),
  }),
  action_case_decision_ck: Object.freeze({
    tableName: 'action_case', type: 'c',
    definitionTokens: Object.freeze(['decided_by_user_email', 'decided_at', 'decision_reason']),
  }),
  action_case_approval_human_ck: Object.freeze({
    tableName: 'action_case', type: 'c',
    definitionTokens: Object.freeze([
      'approved', 'manual_validation_confirmed', 'verified', 'not_required',
      'confidentiality', 'standard',
    ]),
  }),
  action_case_cancellation_ck: Object.freeze({
    tableName: 'action_case', type: 'c',
    definitionTokens: Object.freeze([
      'cancelled_by_user_email', 'cancelled_at', 'cancellation_reason',
    ]),
  }),
  action_case_event_actor_identity_ck: Object.freeze({
    tableName: 'action_case_event', type: 'c',
    definitionTokens: Object.freeze(['actor_employment_contract_id', 'actor_person_id', 'is null']),
  }),
  action_case_event_case_version_uk: Object.freeze({
    tableName: 'action_case_event', type: 'u',
    definitionTokens: Object.freeze(['unique', 'case_id', 'case_version']),
  }),
  action_case_event_actor_idempotency_uk: Object.freeze({
    tableName: 'action_case_event', type: 'u',
    definitionTokens: Object.freeze(['unique', 'actor_user_email', 'idempotency_key']),
  }),
  action_command_context_actor_identity_ck: Object.freeze({
    tableName: 'action_command_context', type: 'c',
    definitionTokens: Object.freeze(['actor_employment_contract_id', 'actor_person_id', 'is null']),
  }),
});

const SECURITY_DEFINER_FUNCTIONS = new Set([
  'public.action_center_actor_authorized(text,text,text,uuid,bigint,text,text,text,text)',
  'public.action_center_set_command_context(text,text,uuid,uuid,text,uuid,text,jsonb)',
  'public.action_center_require_event_context()',
  'public.action_center_log_case_event()',
  APPLY_COMMAND_SIGNATURE,
]);

const FUNCTION_CONTRACT = Object.freeze(Object.fromEntries(
  RUNTIME_FUNCTION_SIGNATURES.map((signature) => [signature, Object.freeze({
    securityDefiner: SECURITY_DEFINER_FUNCTIONS.has(signature),
    language: 'plpgsql',
  })]),
));

export const ACTION_CENTER_SEMANTIC_CONTRACT = Object.freeze({
  triggers: TRIGGER_CONTRACT,
  indexes: INDEX_CONTRACT,
  constraints: CONSTRAINT_CONTRACT,
  functions: FUNCTION_CONTRACT,
  view: Object.freeze({
    name: 'vw_action_leave_request',
    definitionTokens: Object.freeze(['action_case', 'leave_request', 'duration_value']),
  }),
});

function normalizedDefinition(value) {
  return String(value || '')
    .replaceAll('"', '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function requireTokens(resourceType, resourceName, value, tokens) {
  const definition = normalizedDefinition(value);
  for (const token of tokens) {
    if (!definition.includes(normalizedDefinition(token))) {
      throw new Error(
        `Semántica inválida: ${resourceType} ${resourceName} no contiene ${token}`,
      );
    }
  }
}

function exactlyOneByName(rows, name, resourceType) {
  const matches = rows.filter((row) => row.name === name);
  if (matches.length !== 1) {
    throw new Error(
      `Semántica inválida: ${resourceType} ${name} tiene ${matches.length} definiciones`,
    );
  }
  return matches[0];
}

export function validateSemanticSchemaEvidence(evidence) {
  const triggers = Array.isArray(evidence?.triggers) ? evidence.triggers : [];
  for (const [name, expected] of Object.entries(TRIGGER_CONTRACT)) {
    const row = exactlyOneByName(triggers, name, 'trigger');
    if (row.tableName !== expected.tableName
        || row.functionName !== expected.functionName
        || row.functionSchema !== 'public'
        || !['O', 'A'].includes(row.enabled)) {
      throw new Error(`Semántica inválida: trigger ${name} deshabilitado o mal vinculado`);
    }
    requireTokens('trigger', name, row.definition, expected.definitionTokens);
  }

  const indexes = Array.isArray(evidence?.indexes) ? evidence.indexes : [];
  for (const [name, expected] of Object.entries(INDEX_CONTRACT)) {
    const row = exactlyOneByName(indexes, name, 'índice');
    const predicate = normalizedDefinition(row.predicate);
    if (row.tableName !== expected.tableName
        || row.unique !== expected.unique
        || row.valid !== true
        || row.ready !== true
        || row.ownedByCurrentUser !== true
        || row.owner === RUNTIME_ROLE
        || (predicate.length > 0) !== expected.partial) {
      throw new Error(`Semántica inválida: índice ${name} homónimo, inválido o incompleto`);
    }
    requireTokens('índice', name, row.definition, expected.definitionTokens);
    requireTokens('predicado de índice', name, predicate, expected.predicateTokens);
  }

  const constraints = Array.isArray(evidence?.constraints) ? evidence.constraints : [];
  for (const [name, expected] of Object.entries(CONSTRAINT_CONTRACT)) {
    const row = exactlyOneByName(constraints, name, 'constraint');
    if (row.tableName !== expected.tableName
        || row.type !== expected.type
        || row.validated !== true) {
      throw new Error(`Semántica inválida: constraint ${name} ausente, homónimo o NOT VALID`);
    }
    requireTokens('constraint', name, row.definition, expected.definitionTokens);
  }

  const functions = Array.isArray(evidence?.functions) ? evidence.functions : [];
  for (const [signature, expected] of Object.entries(FUNCTION_CONTRACT)) {
    const row = exactlyOneByName(functions, signature, 'función');
    if (row.exists !== true
        || row.securityDefiner !== expected.securityDefiner
        || row.language !== expected.language
        || row.ownedByCurrentUser !== true
        || row.owner === RUNTIME_ROLE
        || (expected.securityDefiner && row.searchPathFixed !== true)) {
      throw new Error(`Semántica inválida: función ${signature} tiene seguridad, owner o search_path incorrectos`);
    }
  }

  const views = Array.isArray(evidence?.views) ? evidence.views : [];
  const view = exactlyOneByName(views, ACTION_CENTER_SEMANTIC_CONTRACT.view.name, 'vista');
  if (view.ownedByCurrentUser !== true || view.owner === RUNTIME_ROLE) {
    throw new Error(`Semántica inválida: owner de vista ${view.name}`);
  }
  requireTokens(
    'vista',
    view.name,
    view.definition,
    ACTION_CENTER_SEMANTIC_CONTRACT.view.definitionTokens,
  );
}

async function relationNames(client, names, type) {
  const result = await client.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = $1
        AND table_name = ANY($2::text[])
      ORDER BY table_name`,
    [type, names],
  );
  return result.rows.map((row) => row.table_name);
}

async function verifyPrerequisites(client) {
  const tables = await relationNames(
    client,
    [
      'internal_users', 'employment_contract', 'person_identity', 'source_import_batch',
      'grh_catalog_rows', 'grh_employees',
    ],
    'BASE TABLE',
  );
  if (tables.length !== 6) {
    throw new Error(
      'Faltan prerequisitos del centro de acciones: esquema interno, GRH o canónico incompleto.',
    );
  }
  const runtimeRole = await client.query(`
    SELECT role.rolcanlogin, role.rolsuper, role.rolcreaterole, role.rolcreatedb,
           role.rolreplication, role.rolbypassrls, role.rolinherit,
           EXISTS (
             SELECT 1 FROM pg_auth_members membership WHERE membership.member = role.oid
           ) AS inherits_role
    FROM pg_roles role
    WHERE role.rolname = $1
  `, [RUNTIME_ROLE]);
  const role = runtimeRole.rows[0];
  if (!role
      || !role.rolcanlogin
      || role.rolinherit
      || role.rolsuper
      || role.rolcreaterole
      || role.rolcreatedb
      || role.rolreplication
      || role.rolbypassrls
      || role.inherits_role) {
    throw new Error(
      `Falta ${RUNTIME_ROLE}: debe crearse por SQL con LOGIN NOINHERIT, atributos NO* y cero memberships; no usar Neon Console/CLI/API.`,
    );
  }
}

async function verifySchema(client) {
  const [tables, viewResult, functionResult, triggerResult, indexResult, constraintResult] = await Promise.all([
    relationNames(client, EXPECTED_TABLES, 'BASE TABLE'),
    client.query(`
      SELECT view_class.relname AS name,
             pg_get_viewdef(view_class.oid, true) AS definition,
             owner.rolname AS owner,
             owner.rolname = current_user AS "ownedByCurrentUser"
      FROM pg_class view_class
      JOIN pg_namespace namespace ON namespace.oid = view_class.relnamespace
      JOIN pg_roles owner ON owner.oid = view_class.relowner
      WHERE namespace.nspname = 'public'
        AND view_class.relkind = 'v'
        AND view_class.relname = 'vw_action_leave_request'
    `),
    client.query(`
      WITH requested(signature) AS (
        SELECT unnest($1::text[])
      )
      SELECT requested.signature AS name,
             proc.oid IS NOT NULL AS "exists",
             COALESCE(proc.prosecdef, false) AS "securityDefiner",
             COALESCE('search_path=public, pg_temp' = ANY(proc.proconfig), false)
               AS "searchPathFixed",
             language.lanname AS language,
             owner.rolname AS owner,
             owner.rolname = current_user AS "ownedByCurrentUser"
      FROM requested
      LEFT JOIN pg_proc proc ON proc.oid = to_regprocedure(requested.signature)
      LEFT JOIN pg_language language ON language.oid = proc.prolang
      LEFT JOIN pg_roles owner ON owner.oid = proc.proowner
      ORDER BY requested.signature
    `, [RUNTIME_FUNCTION_SIGNATURES]),
    client.query(`
      SELECT trg.tgname AS name,
             table_class.relname AS "tableName",
             trigger_function.proname AS "functionName",
             function_namespace.nspname AS "functionSchema",
             trg.tgenabled AS enabled,
             pg_get_triggerdef(trg.oid, true) AS definition
      FROM pg_trigger trg
      JOIN pg_class table_class ON table_class.oid = trg.tgrelid
      JOIN pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace
      JOIN pg_proc trigger_function ON trigger_function.oid = trg.tgfoid
      JOIN pg_namespace function_namespace ON function_namespace.oid = trigger_function.pronamespace
      WHERE table_namespace.nspname = 'public'
        AND trg.tgisinternal IS FALSE
        AND trg.tgname = ANY($1::text[])
      ORDER BY trg.tgname, table_class.relname
    `, [EXPECTED_TRIGGERS]),
    client.query(`
      SELECT index_class.relname AS name,
             table_class.relname AS "tableName",
             index_meta.indisunique AS "unique",
             index_meta.indisvalid AS valid,
             index_meta.indisready AS ready,
             pg_get_indexdef(index_class.oid) AS definition,
             COALESCE(pg_get_expr(index_meta.indpred, index_meta.indrelid, true), '') AS predicate,
             owner.rolname AS owner,
             owner.rolname = current_user AS "ownedByCurrentUser"
      FROM pg_index index_meta
      JOIN pg_class index_class ON index_class.oid = index_meta.indexrelid
      JOIN pg_class table_class ON table_class.oid = index_meta.indrelid
      JOIN pg_namespace namespace ON namespace.oid = index_class.relnamespace
      JOIN pg_roles owner ON owner.oid = index_class.relowner
      WHERE namespace.nspname = 'public'
        AND index_class.relname = ANY($1::text[])
      ORDER BY index_class.relname
    `, [EXPECTED_INDEXES]),
    client.query(`
      SELECT con.conname AS name,
             table_class.relname AS "tableName",
             con.contype::text AS type,
             con.convalidated AS validated,
             pg_get_constraintdef(con.oid, true) AS definition
      FROM pg_constraint con
      JOIN pg_class table_class ON table_class.oid = con.conrelid
      JOIN pg_namespace namespace ON namespace.oid = table_class.relnamespace
      WHERE namespace.nspname = 'public'
        AND con.conname = ANY($1::text[])
      ORDER BY con.conname, table_class.relname
    `, [Object.keys(CONSTRAINT_CONTRACT)]),
  ]);

  if (tables.length !== EXPECTED_TABLES.length) {
    throw new Error(`Centro de acciones incompleto: ${tables.length}/${EXPECTED_TABLES.length} tablas`);
  }
  validateSemanticSchemaEvidence({
    views: viewResult.rows,
    functions: functionResult.rows,
    triggers: triggerResult.rows,
    indexes: indexResult.rows,
    constraints: constraintResult.rows,
  });
}

function assertNoPrivilege(rows, privilegeFields, resourceType) {
  for (const row of rows) {
    const granted = privilegeFields.filter((field) => row[field] === true);
    if (granted.length) {
      throw new Error(
        `ACL insegura para ${RUNTIME_ROLE}: ${resourceType} ${row.resource} concede ${granted.join(', ')}`,
      );
    }
  }
}

async function verifyRuntimeAcl(client) {
  const schemaAcl = await client.query(`
    SELECT has_schema_privilege($1, 'public', 'USAGE') AS usage,
           has_schema_privilege($1, 'public', 'CREATE') AS create
  `, [RUNTIME_ROLE]);
  if (schemaAcl.rows[0]?.usage !== true || schemaAcl.rows[0]?.create === true) {
    throw new Error(`ACL insegura para ${RUNTIME_ROLE}: public debe conceder sólo USAGE`);
  }

  const relationAcl = await client.query(`
    SELECT relation_name AS resource,
           has_table_privilege($1, format('public.%I', relation_name), 'SELECT') AS table_select,
           has_table_privilege($1, format('public.%I', relation_name), 'INSERT') AS can_insert,
           has_table_privilege($1, format('public.%I', relation_name), 'UPDATE') AS can_update,
           has_table_privilege($1, format('public.%I', relation_name), 'DELETE') AS can_delete,
           has_table_privilege($1, format('public.%I', relation_name), 'TRUNCATE') AS can_truncate,
           has_table_privilege($1, format('public.%I', relation_name), 'REFERENCES') AS can_reference,
           has_table_privilege($1, format('public.%I', relation_name), 'TRIGGER') AS can_trigger
    FROM unnest($2::text[]) AS requested(relation_name)
  `, [RUNTIME_ROLE, RUNTIME_RELATIONS]);
  assertNoPrivilege(
    relationAcl.rows,
    ['table_select', 'can_insert', 'can_update', 'can_delete', 'can_truncate', 'can_reference', 'can_trigger'],
    'relación',
  );

  const columnAcl = await client.query(`
    SELECT columns.table_name AS resource, columns.column_name,
           has_column_privilege(
             $1,
             format('public.%I', columns.table_name),
             columns.column_name,
             'SELECT'
           ) AS can_select,
           has_column_privilege(
             $1,
             format('public.%I', columns.table_name),
             columns.column_name,
             'INSERT'
           ) AS can_insert,
           has_column_privilege(
             $1,
             format('public.%I', columns.table_name),
             columns.column_name,
             'UPDATE'
           ) AS can_update,
           has_column_privilege(
             $1,
             format('public.%I', columns.table_name),
             columns.column_name,
             'REFERENCES'
           ) AS can_reference
    FROM information_schema.columns columns
    WHERE columns.table_schema = 'public'
      AND columns.table_name = ANY($2::text[])
    ORDER BY columns.table_name, columns.ordinal_position
  `, [RUNTIME_ROLE, RUNTIME_RELATIONS]);
  const seenRelations = new Set(columnAcl.rows.map((row) => row.resource));
  for (const relation of RUNTIME_RELATIONS) {
    if (!seenRelations.has(relation)) {
      throw new Error(`ACL no verificable: falta la relación public.${relation}`);
    }
  }
  for (const row of columnAcl.rows) {
    const expected = RUNTIME_SELECT_COLUMNS[row.resource] || [];
    const shouldSelect = expected.includes(row.column_name);
    if (row.can_select !== shouldSelect
        || row.can_insert === true
        || row.can_update === true
        || row.can_reference === true) {
      throw new Error(
        `ACL insegura para ${RUNTIME_ROLE}: columna ${row.resource}.${row.column_name} excede SELECT=${shouldSelect}`,
      );
    }
  }

  const unexpectedReads = await client.query(`
    SELECT class.relname AS resource
    FROM pg_class class
    JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = 'public'
      AND class.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND class.relname <> ALL($2::text[])
      AND has_any_column_privilege($1, class.oid, 'SELECT')
    ORDER BY class.relname
  `, [RUNTIME_ROLE, Object.keys(RUNTIME_SELECT_COLUMNS)]);
  if (unexpectedReads.rowCount) {
    throw new Error(
      `ACL insegura para ${RUNTIME_ROLE}: SELECT no autorizado en ${unexpectedReads.rows.map((row) => row.resource).join(', ')}`,
    );
  }

  const unexpectedWrites = await client.query(`
    SELECT class.relname AS resource
    FROM pg_class class
    JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = 'public'
      AND class.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND (
        has_any_column_privilege($1, class.oid, 'INSERT')
        OR has_any_column_privilege($1, class.oid, 'UPDATE')
        OR has_any_column_privilege($1, class.oid, 'REFERENCES')
        OR has_table_privilege($1, class.oid, 'DELETE')
        OR has_table_privilege($1, class.oid, 'TRUNCATE')
        OR has_table_privilege($1, class.oid, 'TRIGGER')
      )
    ORDER BY class.relname
  `, [RUNTIME_ROLE]);
  if (unexpectedWrites.rowCount) {
    throw new Error(
      `ACL insegura para ${RUNTIME_ROLE}: DML no autorizado en ${unexpectedWrites.rows.map((row) => row.resource).join(', ')}`,
    );
  }

  const sequenceAcl = await client.query(`
    SELECT sequence_name AS resource,
           has_sequence_privilege($1, format('public.%I', sequence_name), 'USAGE') AS can_usage,
           has_sequence_privilege($1, format('public.%I', sequence_name), 'SELECT') AS can_select,
           has_sequence_privilege($1, format('public.%I', sequence_name), 'UPDATE') AS can_update
    FROM unnest($2::text[]) AS requested(sequence_name)
  `, [RUNTIME_ROLE, RUNTIME_SEQUENCES]);
  assertNoPrivilege(sequenceAcl.rows, ['can_usage', 'can_select', 'can_update'], 'secuencia');

  const unexpectedSequences = await client.query(`
    SELECT class.relname AS resource
    FROM pg_class class
    JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = 'public'
      AND class.relkind = 'S'
      AND (
        has_sequence_privilege($1, class.oid, 'USAGE')
        OR has_sequence_privilege($1, class.oid, 'SELECT')
        OR has_sequence_privilege($1, class.oid, 'UPDATE')
      )
    ORDER BY class.relname
  `, [RUNTIME_ROLE]);
  if (unexpectedSequences.rowCount) {
    throw new Error(
      `ACL insegura para ${RUNTIME_ROLE}: secuencias no autorizadas ${unexpectedSequences.rows.map((row) => row.resource).join(', ')}`,
    );
  }

  const functionAcl = await client.query(`
    SELECT signature AS resource,
           to_regprocedure(signature) IS NOT NULL AS function_exists,
           has_function_privilege($1, to_regprocedure(signature), 'EXECUTE') AS can_execute
    FROM unnest($2::text[]) AS requested(signature)
  `, [RUNTIME_ROLE, RUNTIME_FUNCTION_SIGNATURES]);
  for (const row of functionAcl.rows) {
    const expected = row.resource === APPLY_COMMAND_SIGNATURE;
    if (row.function_exists !== true || row.can_execute !== expected) {
      throw new Error(
        `ACL insegura para ${RUNTIME_ROLE}: EXECUTE ${row.resource} esperado=${expected}`,
      );
    }
  }

  const actionFunctionAcl = await client.query(`
    SELECT proc.oid::regprocedure::text AS resource,
           proc.oid = to_regprocedure($2) AS is_apply_command,
           has_function_privilege($1, proc.oid, 'EXECUTE') AS can_execute
    FROM pg_proc proc
    JOIN pg_namespace namespace ON namespace.oid = proc.pronamespace
    WHERE namespace.nspname = 'public'
      AND proc.proname LIKE 'action_center_%'
    ORDER BY proc.oid::regprocedure::text
  `, [RUNTIME_ROLE, APPLY_COMMAND_SIGNATURE]);
  for (const row of actionFunctionAcl.rows) {
    if (row.can_execute !== row.is_apply_command) {
      throw new Error(
        `ACL insegura para ${RUNTIME_ROLE}: función inesperada ${row.resource}`,
      );
    }
  }
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  const checksum = createHash('sha256').update(migration).digest('hex');
  const statements = splitPostgresStatements(migration);
  const client = new Client({ connectionString: directCanonicalDatabaseUrl() });

  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:action-center-schema'))`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version text PRIMARY KEY,
        checksum_sha256 char(64) NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await verifyPrerequisites(client);

    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [MIGRATION_VERSION],
    );
    if (existing.rowCount) {
      if (existing.rows[0].checksum_sha256.trim() !== checksum) {
        throw new Error(`Drift detectado: ${MIGRATION_VERSION} ya existe con otro SHA-256`);
      }
      await verifySchema(client);
      await verifyRuntimeAcl(client);
      await client.query('COMMIT');
      console.log(`${MIGRATION_VERSION}: ya aplicada y verificada`);
      return;
    }

    for (const statement of statements) await client.query(statement);
    await verifySchema(client);
    await verifyRuntimeAcl(client);
    await client.query(
      'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
      [MIGRATION_VERSION, checksum],
    );
    await client.query('COMMIT');
    console.log(`${MIGRATION_VERSION}: aplicada (${statements.length} sentencias, SHA-256 ${checksum})`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

const invokedAsScript = Boolean(
  process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url,
);
if (invokedAsScript) await main();
