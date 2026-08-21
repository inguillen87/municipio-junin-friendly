import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  TIME_SOURCE_MIGRATION_VERSION,
  TIME_SOURCE_RUNTIME_FUNCTION_ALLOWLIST,
  TIME_SOURCE_SIGNATURES,
  validateTimeSourceEvidence,
  validateTimeSourceMigrationSql,
  validateTimeSourceRuntimeAclEvidence,
} from '../scripts/apply-governed-time-source-registry-schema.mjs';
import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';

const migration = readFileSync(
  new URL('../scripts/migrations/010-governed-time-source-registry.sql', import.meta.url),
  'utf8',
);
const statements = splitPostgresStatements(migration);

const contractColumns = [
  ['id', 'uuid', true],
  ['tenant_id', 'uuid', true],
  ['certified_binding_id', 'uuid', true],
  ['domain', 'character varying(40)', true],
  ['owner_authority', 'character varying(40)', true],
  ['owner_code', 'character varying(64)', true],
  ['system_locator', 'character varying(96)', true],
  ['source_format', 'character varying(32)', true],
  ['schema_version', 'character varying(32)', true],
  ['artifact_sha256', 'character(64)', true],
  ['cut_at', 'timestamp with time zone', true],
  ['coverage_from', 'date', true],
  ['coverage_to', 'date', true],
  ['timezone', 'character varying(64)', true],
  ['grain', 'character varying(48)', true],
  ['identity_key_kind', 'character varying(40)', true],
  ['record_count', 'bigint', false],
  ['status', 'character varying(16)', true],
  ['version', 'integer', true],
  ['proposer_person_id', 'uuid', true],
  ['proposer_membership_id', 'uuid', true],
  ['approver_person_id', 'uuid', false],
  ['approver_membership_id', 'uuid', false],
  ['reason_code', 'character varying(64)', true],
  ['reason_hash', 'character(64)', true],
  ['created_at', 'timestamp with time zone', true],
  ['updated_at', 'timestamp with time zone', true],
  ['submitted_at', 'timestamp with time zone', false],
  ['decided_at', 'timestamp with time zone', false],
  ['retired_at', 'timestamp with time zone', false],
  ['cancelled_at', 'timestamp with time zone', false],
];

const eventColumns = [
  ['id', 'uuid', true],
  ['tenant_id', 'uuid', true],
  ['contract_id', 'uuid', true],
  ['contract_certified_binding_id', 'uuid', true],
  ['actor_certified_binding_id', 'uuid', true],
  ['actor_membership_id', 'uuid', true],
  ['actor_person_id', 'uuid', true],
  ['actor_session_id', 'uuid', true],
  ['actor_session_version', 'integer', true],
  ['release_sha', 'character(40)', true],
  ['command', 'character varying(32)', true],
  ['idempotency_key', 'uuid', true],
  ['command_hash', 'character(64)', true],
  ['expected_version', 'integer', true],
  ['resulting_version', 'integer', true],
  ['reason_code', 'character varying(64)', true],
  ['reason_hash', 'character(64)', true],
  ['before_snapshot', 'jsonb', true],
  ['after_snapshot', 'jsonb', true],
  ['result', 'jsonb', true],
  ['occurred_at', 'timestamp with time zone', true],
];

function columnRows(columns) {
  return columns.map(([name, type, notNull]) => ({ name, type, notNull }));
}

function constraint(name, type, definition) {
  return { name, type, definition, validated: true };
}

function contractConstraints() {
  return [
    constraint('time_source_contract_pkey', 'p', 'PRIMARY KEY (id)'),
    constraint('time_source_contract_tenant_id_fkey', 'f',
      'FOREIGN KEY (tenant_id) REFERENCES platform_tenant(id) ON DELETE RESTRICT'),
    constraint('time_source_contract_proposer_person_id_fkey', 'f',
      'FOREIGN KEY (proposer_person_id) REFERENCES person_identity(id) ON DELETE RESTRICT'),
    constraint('time_source_contract_approver_person_id_fkey', 'f',
      'FOREIGN KEY (approver_person_id) REFERENCES person_identity(id) ON DELETE RESTRICT'),
    constraint('time_source_contract_id_tenant_uk', 'u', 'UNIQUE (id, tenant_id)'),
    constraint('time_source_contract_id_tenant_binding_uk', 'u',
      'UNIQUE (id, tenant_id, certified_binding_id)'),
    constraint('time_source_contract_binding_fk', 'f',
      'FOREIGN KEY (tenant_id, certified_binding_id) REFERENCES platform_tenant_source_binding(tenant_id, id) ON DELETE RESTRICT'),
    constraint('time_source_contract_proposer_membership_fk', 'f',
      'FOREIGN KEY (proposer_membership_id, tenant_id) REFERENCES tenant_membership(id, tenant_id) ON DELETE RESTRICT'),
    constraint('time_source_contract_approver_membership_fk', 'f',
      'FOREIGN KEY (approver_membership_id, tenant_id) REFERENCES tenant_membership(id, tenant_id) ON DELETE RESTRICT'),
    constraint('time_source_contract_metadata_ck', 'c',
      'CHECK (time_source_metadata_row_valid_v1(domain, owner_authority, owner_code, system_locator, source_format, schema_version, artifact_sha256, cut_at, coverage_from, coverage_to, timezone, grain, identity_key_kind, record_count))'),
    constraint('time_source_contract_status_ck', 'c',
      "CHECK (status IN ('draft','submitted','approved','rejected','retired','cancelled'))"),
    constraint('time_source_contract_version_ck', 'c', 'CHECK (version > 0)'),
    constraint('time_source_contract_reason_ck', 'c',
      "CHECK (reason_hash ~ '^[a-f0-9]{64}$')"),
    constraint('time_source_contract_approver_pair_ck', 'c',
      'CHECK ((approver_person_id IS NULL) = (approver_membership_id IS NULL))'),
    constraint('time_source_contract_maker_checker_ck', 'c',
      'CHECK (approver_person_id <> proposer_person_id AND approver_membership_id <> proposer_membership_id)'),
    constraint('time_source_contract_state_ck', 'c',
      "CHECK ((status = 'draft') OR (status = 'submitted') OR (status = 'approved') OR (status = 'rejected') OR (status = 'retired') OR (status = 'cancelled'))"),
  ];
}

function eventConstraints() {
  return [
    constraint('time_source_governance_event_pkey', 'p', 'PRIMARY KEY (id)'),
    constraint('time_source_governance_event_tenant_id_fkey', 'f',
      'FOREIGN KEY (tenant_id) REFERENCES platform_tenant(id) ON DELETE RESTRICT'),
    constraint('time_source_governance_event_actor_person_id_fkey', 'f',
      'FOREIGN KEY (actor_person_id) REFERENCES person_identity(id) ON DELETE RESTRICT'),
    constraint('time_source_governance_event_actor_session_id_fkey', 'f',
      'FOREIGN KEY (actor_session_id) REFERENCES tenant_identity_session(id) ON DELETE RESTRICT'),
    constraint('time_source_governance_event_contract_fk', 'f',
      'FOREIGN KEY (contract_id, tenant_id, contract_certified_binding_id) REFERENCES time_source_contract(id, tenant_id, certified_binding_id) ON DELETE RESTRICT'),
    constraint('time_source_governance_event_contract_binding_fk', 'f',
      'FOREIGN KEY (tenant_id, contract_certified_binding_id) REFERENCES platform_tenant_source_binding(tenant_id, id) ON DELETE RESTRICT'),
    constraint('time_source_governance_event_actor_binding_fk', 'f',
      'FOREIGN KEY (tenant_id, actor_certified_binding_id) REFERENCES platform_tenant_source_binding(tenant_id, id) ON DELETE RESTRICT'),
    constraint('time_source_governance_event_membership_fk', 'f',
      'FOREIGN KEY (actor_membership_id, tenant_id) REFERENCES tenant_membership(id, tenant_id) ON DELETE RESTRICT'),
    constraint('time_source_governance_event_idempotency_uk', 'u',
      'UNIQUE (tenant_id, actor_membership_id, idempotency_key)'),
    constraint('time_source_governance_event_command_ck', 'c',
      "CHECK (command IN ('create_draft','update_draft','submit','approve','reject','retire','cancel'))"),
    constraint('time_source_governance_event_context_ck', 'c',
      "CHECK (actor_session_version > 0 AND release_sha ~ '^[a-f0-9]{40}$' AND command_hash ~ '^[a-f0-9]{64}$' AND resulting_version = expected_version + 1 AND time_source_reason_allowed_v1(command, reason_code))"),
    constraint('time_source_governance_event_json_ck', 'c',
      "CHECK (jsonb_typeof(before_snapshot) = 'object' AND jsonb_typeof(after_snapshot) = 'object' AND jsonb_typeof(result) = 'object')"),
  ];
}

function functionDefinition(signature) {
  const name = signature.match(/^public\.([^(]+)/)?.[1];
  const found = statements.find((statement) => new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+${name}\\s*\\(`, 'i',
  ).test(statement));
  return found || `CREATE FUNCTION ${name}() RETURNS void LANGUAGE plpgsql AS $$ BEGIN NULL; END $$`;
}

function functionRows() {
  const signatures = [...new Set([
    ...TIME_SOURCE_RUNTIME_FUNCTION_ALLOWLIST,
    ...Object.values(TIME_SOURCE_SIGNATURES),
  ])];
  return signatures.map((signature) => ({
    signature,
    securityDefiner: true,
    ownedByCurrentUser: true,
    ownerIsRuntime: false,
    publicExecuteRevoked: true,
    config: ['search_path=public, pg_temp'],
    definition: functionDefinition(signature),
  }));
}

function installedEvidence() {
  return {
    contractColumns: columnRows(contractColumns),
    eventColumns: columnRows(eventColumns),
    contractConstraints: contractConstraints(),
    eventConstraints: eventConstraints(),
    indexes: [
      {
        name: 'time_source_contract_tenant_list_idx', tableName: 'time_source_contract',
        columns: ['tenant_id','status','domain','updated_at','id'],
        unique: false, valid: true, ready: true, predicate: null,
        definition: 'CREATE INDEX ON time_source_contract (tenant_id, status, domain, updated_at DESC, id)',
      },
      {
        name: 'time_source_contract_readiness_idx', tableName: 'time_source_contract',
        columns: ['tenant_id','domain','status','coverage_from','coverage_to','updated_at'],
        unique: false, valid: true, ready: true, predicate: null,
        definition: 'CREATE INDEX ON time_source_contract (tenant_id, domain, status, coverage_from, coverage_to, updated_at DESC)',
      },
      {
        name: 'time_source_governance_event_timeline_idx', tableName: 'time_source_governance_event',
        columns: ['tenant_id','contract_id','occurred_at','id'],
        unique: false, valid: true, ready: true, predicate: null,
        definition: 'CREATE INDEX ON time_source_governance_event (tenant_id, contract_id, occurred_at, id)',
      },
    ],
    triggers: [
      {
        name: 'time_source_contract_transition_guard_v1', enabled: 'O',
        tableName: 'time_source_contract', functionSchema: 'public',
        functionName: 'time_source_guard_contract_v1', noArguments: true,
        notConstraint: true, rowLevel: true, timing: 'before',
        events: ['insert','delete','update'],
      },
      {
        name: 'time_source_contract_approved_overlap_guard_v1', enabled: 'O',
        tableName: 'time_source_contract', functionSchema: 'public',
        functionName: 'time_source_guard_approved_overlap_v1', noArguments: true,
        notConstraint: true, rowLevel: true, timing: 'before', events: ['insert','update'],
      },
      {
        name: 'time_source_governance_event_append_only_v1', enabled: 'O',
        tableName: 'time_source_governance_event', functionSchema: 'public',
        functionName: 'tenant_iam_reject_change', noArguments: true,
        notConstraint: true, rowLevel: true, timing: 'before', events: ['delete','update'],
      },
    ],
    functions: functionRows(),
    roleCapabilities: [
      { roleKey: 'JUNIN_TIEMPO_FUENTES_PROPONENTE', capabilityKey: 'time.source.read' },
      { roleKey: 'JUNIN_TIEMPO_FUENTES_PROPONENTE', capabilityKey: 'time.source.propose' },
      { roleKey: 'JUNIN_TIEMPO_FUENTES_APROBADOR', capabilityKey: 'time.source.read' },
      { roleKey: 'JUNIN_TIEMPO_FUENTES_APROBADOR', capabilityKey: 'time.source.approve' },
      { roleKey: 'JUNIN_TIEMPO_FUENTES_APROBADOR', capabilityKey: 'time.source.audit.read' },
    ],
    conflicts: [
      { left: 'time.source.approve', right: 'time.source.propose' },
      { left: 'time.overtime.post', right: 'time.source.approve' },
    ],
    capabilities: [
      { key: 'time.source.read', scopeKind: 'tenant', sensitivity: 'standard' },
      { key: 'time.source.propose', scopeKind: 'tenant', sensitivity: 'privileged' },
      { key: 'time.source.approve', scopeKind: 'tenant', sensitivity: 'restricted' },
      { key: 'time.source.audit.read', scopeKind: 'tenant', sensitivity: 'restricted' },
    ],
    roles: [
      { key: 'JUNIN_TIEMPO_FUENTES_PROPONENTE', scopeKind: 'tenant', systemManaged: true },
      { key: 'JUNIN_TIEMPO_FUENTES_APROBADOR', scopeKind: 'tenant', systemManaged: true },
    ],
    crossTenantContracts: 0,
    crossTenantEvents: 0,
    makerCheckerViolations: 0,
    personSodViolations: 0,
    approvedOverlaps: 0,
    tableAcl: [
      {
        name: 'time_source_contract', ownedByCurrentUser: true, ownerIsRuntime: false,
        publicPrivilegesRevoked: true, runtimePrivilegesRevoked: true,
      },
      {
        name: 'time_source_governance_event', ownedByCurrentUser: true, ownerIsRuntime: false,
        publicPrivilegesRevoked: true, runtimePrivilegesRevoked: true,
      },
    ],
  };
}

function runtimeEvidence() {
  return {
    runtimeRole: {
      canLogin: true,
      inherit: false,
      superuser: false,
      bypassRls: false,
      createDb: false,
      createRole: false,
      replication: false,
      membershipCount: 0,
      schemaUsage: true,
      schemaCreate: false,
    },
    roleMemberships: [],
    runtimeFunctions: TIME_SOURCE_RUNTIME_FUNCTION_ALLOWLIST.map((signature) => ({ signature })),
    unexpectedSecurityDefiners: [],
    relations: [{
      name: 'time_source_contract', canSelect: false, canInsert: false, canUpdate: false,
      canReferences: false, canDelete: false, canTruncate: false, canTrigger: false,
    }, {
      name: 'time_source_governance_event', canSelect: false, canInsert: false, canUpdate: false,
      canReferences: false, canDelete: false, canTruncate: false, canTrigger: false,
    }],
    sequences: [],
  };
}

test('migración 010 es autocontenida, parseable y mantiene el alcance metadata-only', () => {
  assert.equal(TIME_SOURCE_MIGRATION_VERSION, '010-governed-time-source-registry');
  assert.doesNotThrow(() => validateTimeSourceMigrationSql(migration));
  assert.ok(statements.length > 30);
  assert.equal(statements.some((statement) => /^\s*INSERT\s+INTO\s+(?:public\.)?time_source_contract/i.test(statement)), false);
  assert.equal(statements.some((statement) => /^\s*INSERT\s+INTO\s+(?:public\.)?time_source_governance_event/i.test(statement)), false);
  assert.doesNotMatch(migration, /\b(?:CREATE|ALTER|DROP)\s+TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?(?:public\.)?(?:grh_|payroll_|action_case)/i);
  assert.match(migration, /'evaluationReady', false/);
  assert.match(migration, /'attendanceReconciled', false/);
  assert.match(migration, /'payrollCalculated', false/);
  assert.match(migration, /'payrollPosted', false/);
  assert.match(migration, /'grhMutation', false/);
});

test('validator estático rechaza DML sensible, cálculo, SQL dinámico y ampliación de roles existentes', () => {
  for (const unsafe of [
    'UPDATE grh_employees SET sector = sector;',
    'INSERT INTO payroll_run DEFAULT VALUES;',
    'DELETE FROM action_case WHERE false;',
    'TRUNCATE TABLE source_import_batch;',
    'ALTER TABLE action_case ADD COLUMN source_ready boolean;',
    'ALTER ROLE municontrol_actions_runtime_app SUPERUSER;',
    'SELECT execute format(\'DROP TABLE %s\', \'x\');',
    'SELECT payroll_amount FROM time_source_contract;',
  ]) assert.throws(() => validateTimeSourceMigrationSql(`${migration}\n${unsafe}`));

  assert.throws(() => validateTimeSourceMigrationSql(migration.replace(
    "('JUNIN_TIEMPO_FUENTES_PROPONENTE', 'time.source.read')",
    "('TENANT_ADMIN', 'time.source.read')",
  )), /rol existente/);
});

test('metadatos SQL derivan identificadores internos, limitan schemaVersion y fijan corte UTC', () => {
  assert.match(migration, /p_owner_authority IN \([\s\S]*?'municipal_human_resources'[\s\S]*?'certified_external_provider'[\s\S]*?\)/);
  assert.match(migration, /p_owner_code = p_owner_authority/);
  assert.match(migration, /p_system_locator ~ '\^registry\\\.\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-4/);
  assert.match(migration, /p_schema_version ~ '\^v\[1-9\]\[0-9\]\{0,3\}\(\?:\\\.\[0-9\]\{1,4\}\)\{0,2\}\$'/);
  assert.match(migration, /'registry\.' \|\| target_id::text/);
  assert.match(migration, /owner_code = p_payload->>'ownerAuthority'/);
  assert.doesNotMatch(migration, /system_locator\s*=\s*p_payload/);
  assert.doesNotMatch(migration, /p_payload->>'(?:ownerCode|systemLocator)'/);
  assert.doesNotMatch(migration, /'ownerCode'\s*,\s*source\.owner_code|'systemLocator'\s*,\s*source\.system_locator/);
  assert.match(migration, /p_payload->>'cutAt' !~ '\^\[0-9\]\{4\}-\[0-9\]\{2\}-\[0-9\]\{2\}T/);
  assert.match(migration, /\[0-5\]\[0-9\]:\[0-5\]\[0-9\]Z\$'/);
  assert.match(migration, /transition_command = 'approve'[\s\S]*?NEW\.cut_at > CURRENT_TIMESTAMP \+ interval '5 minutes'[\s\S]*?TIME_SOURCE_CUT_AT_FUTURE/);
  assert.match(migration, /p_command = 'approve'[\s\S]*?source_row\.cut_at > CURRENT_TIMESTAMP \+ interval '5 minutes'/);
  assert.throws(() => validateTimeSourceMigrationSql(migration.replace(
    "'provincial_authority', 'national_authority', 'certified_external_provider'",
    "'provincial_authority', 'national_authority', 'Juan Perez'",
  )), /contrato/);
  assert.throws(() => validateTimeSourceMigrationSql(migration.replace(
    'AND p_owner_code = p_owner_authority',
    'AND p_owner_code IS NOT NULL',
  )), /identificadores internos derivados/);
  assert.throws(() => validateTimeSourceMigrationSql(migration.replace(
    "AND p_schema_version ~ '^v[1-9][0-9]{0,3}(?:\\.[0-9]{1,4}){0,2}$'",
    "AND p_schema_version ~ '^[a-z0-9._-]+$'",
  )), /identificadores internos derivados/);
});

test('tenant, binding y auditoría quedan ligados por claves compuestas', () => {
  assert.match(migration, /CONSTRAINT time_source_contract_id_tenant_binding_uk[\s\S]*?UNIQUE \(id, tenant_id, certified_binding_id\)/);
  assert.match(migration, /CONSTRAINT time_source_governance_event_contract_fk[\s\S]*?FOREIGN KEY \(contract_id, tenant_id, contract_certified_binding_id\)[\s\S]*?REFERENCES time_source_contract\s*\(id, tenant_id, certified_binding_id\)/);
  assert.match(migration, /WHERE source\.id = p_contract_id\s+AND source\.tenant_id = \(context_value->>'tenantId'\)::uuid/);
  assert.match(migration, /event\.tenant_id = source_row\.tenant_id AND event\.contract_id = source_row\.id/);
  assert.doesNotThrow(() => validateTimeSourceEvidence(installedEvidence()));

  const unsafe = installedEvidence();
  unsafe.eventConstraints.find((row) => row.name === 'time_source_governance_event_contract_fk').definition =
    'FOREIGN KEY (contract_id, tenant_id) REFERENCES time_source_contract(id, tenant_id) ON DELETE RESTRICT';
  assert.throws(() => validateTimeSourceEvidence(unsafe), /constraint invalida/);
});

test('SoD aplica por grants, membresía efectiva, persona y maker-checker persistente', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION time_source_assert_person_sod_v1/);
  assert.match(migration, /contract\.person_id = p_actor_person_id/);
  assert.match(migration, /PERFORM tenant_iam_assert_no_sod_conflict\(related_membership_id\)/);
  assert.match(migration, /TIME_SOURCE_PERSON_SOD_CONFLICT/);
  assert.match(migration, /approver_person_id <> proposer_person_id/);
  assert.match(migration, /'time\.overtime\.post', 'time\.source\.approve'/);
  assert.match(migration, /'time\.source\.approve', 'time\.source\.propose'/);

  for (const field of ['makerCheckerViolations', 'personSodViolations']) {
    const unsafe = installedEvidence();
    unsafe[field] = 1;
    assert.throws(() => validateTimeSourceEvidence(unsafe), /invariantes/);
  }
  const weakened = installedEvidence();
  weakened.functions.find((row) => row.signature === TIME_SOURCE_SIGNATURES.personSod).definition =
    weakened.functions.find((row) => row.signature === TIME_SOURCE_SIGNATURES.personSod).definition
      .replaceAll('contract.person_id = p_actor_person_id', 'contract.person_id IS NOT NULL');
  assert.throws(() => validateTimeSourceEvidence(weakened), /SoD por persona/);
});

test('sesión temporal respeta orden global y falla rápido ante recertificación concurrente', () => {
  const session = functionDefinition(TIME_SOURCE_SIGNATURES.session);
  const order = [
    'FROM internal_users users', 'FROM tenant_membership membership',
    'FROM tenant_identity_session identity_session', 'FROM platform_tenant tenant',
    'FROM tenant_identity_policy policy', 'FROM platform_tenant_source_binding binding',
  ].map((token) => session.indexOf(token));
  assert.ok(order.every((index) => index >= 0));
  assert.deepEqual(order, [...order].sort((left, right) => left - right));
  assert.ok((session.match(/FOR SHARE NOWAIT/g) || []).length >= 5);
  assert.match(session, /EXCEPTION WHEN lock_not_available[\s\S]*?TIME_SOURCE_SESSION_BUSY/);
});

test('replay revalida actor actual y devuelve el recibo histórico antes del lock de versión', () => {
  const apply = functionDefinition(TIME_SOURCE_SIGNATURES.apply);
  const sessionAt = apply.indexOf('time_source_assert_tenant_session_v1');
  const authorityAt = apply.indexOf('time_source_assert_actor_authority_v1');
  const replayLookupAt = apply.indexOf('SELECT * INTO existing_event');
  const targetLockAt = apply.indexOf('FOR UPDATE NOWAIT');
  assert.ok(sessionAt >= 0 && sessionAt < authorityAt && authorityAt < replayLookupAt);
  assert.ok(replayLookupAt < targetLockAt);
  assert.match(apply, /existing_event\.actor_session_version IS DISTINCT FROM p_actor_session_version/);
  assert.match(apply, /existing_event\.release_sha IS DISTINCT FROM lower\(p_release_sha\)/);
  assert.match(apply, /existing_event\.actor_certified_binding_id IS DISTINCT FROM \(context_value->>'certifiedBindingId'\)::uuid/);
  assert.match(apply, /RETURN existing_event\.result \|\| jsonb_build_object\([\s\S]*?'replayed', true,[\s\S]*?'historical'/);
  assert.match(apply, /source_row\.certified_binding_id IS DISTINCT FROM existing_event\.contract_certified_binding_id/);
});

test('binding del contrato puede quedar histórico sólo para cancel/retire; actor siempre es actual', () => {
  const apply = functionDefinition(TIME_SOURCE_SIGNATURES.apply);
  assert.match(apply, /p_command NOT IN \('cancel','retire'\)[\s\S]*?source_row\.certified_binding_id IS DISTINCT FROM \(context_value->>'certifiedBindingId'\)::uuid/);
  assert.match(apply, /CASE WHEN p_command = 'create_draft'[\s\S]*?ELSE source_row\.certified_binding_id END,[\s\S]*?\(context_value->>'certifiedBindingId'\)::uuid,[\s\S]*?\(context_value->>'membershipId'\)::uuid/);
  assert.match(apply, /contract_certified_binding_id, actor_certified_binding_id/);
});

test('readiness separa gobierno de preparación y jamás infiere evaluación o nómina', () => {
  const readiness = functionDefinition(TIME_SOURCE_SIGNATURES.readiness);
  for (const key of [
    'shiftAssignment', 'timePunches', 'holidayCalendar', 'municipalRuleProfile',
    'administrativeEvents', 'governanceStatus', 'readinessState', 'catalogApproved',
  ]) assert.match(readiness, new RegExp(key, 'i'));
  assert.match(readiness, /'partial_reference'/);
  assert.match(readiness, /count\(\*\) FILTER \([\s\S]*?required_for_catalog IS TRUE AND approved_metadata IS TRUE[\s\S]*?\) = 4/);
  for (const flag of [
    'evaluationReady', 'attendanceReconciled', 'payrollCalculated', 'payrollPosted', 'grhMutation',
  ]) assert.match(readiness, new RegExp(`'${flag}', false`, 'i'));
  assert.doesNotMatch(migration, /\bcurrent_date\b/i);
  assert.ok((migration.match(/now\(\) AT TIME ZONE 'America\/Argentina\/Mendoza'/g) || []).length >= 4);
});

test('timeline HTTP conserva sólo transición gobernada y deja ID/hash en auditoría DB', () => {
  const detail = functionDefinition(TIME_SOURCE_SIGNATURES.detail);
  assert.match(detail, /'command', event\.command/);
  assert.match(detail, /'reasonCode', event\.reason_code/);
  assert.match(detail, /'occurredAt', event\.occurred_at/);
  assert.doesNotMatch(detail, /'id', event\.id/);
  assert.doesNotMatch(detail, /'reasonHash', event\.reason_hash/);
  assert.match(migration, /time_source_governance_event[\s\S]*?reason_hash char\(64\) NOT NULL/);
});

test('evidencia instalada exige columnas, constraints, funciones, ACL y runtime exactos', () => {
  assert.doesNotThrow(() => validateTimeSourceEvidence(installedEvidence()));
  const wrongColumn = installedEvidence();
  wrongColumn.contractColumns.find((row) => row.name === 'owner_authority').type = 'character varying(120)';
  assert.throws(() => validateTimeSourceEvidence(wrongColumn), /columnas/);

  const publicFunction = installedEvidence();
  publicFunction.functions.find((row) => row.signature === TIME_SOURCE_SIGNATURES.apply)
    .publicExecuteRevoked = false;
  assert.throws(() => validateTimeSourceEvidence(publicFunction), /funcion insegura/);

  const runtimeOwner = installedEvidence();
  runtimeOwner.functions.find((row) => row.signature === TIME_SOURCE_SIGNATURES.bootstrap)
    .ownerIsRuntime = true;
  assert.throws(() => validateTimeSourceEvidence(runtimeOwner), /funcion insegura/);

  const missingAclInventory = installedEvidence();
  missingAclInventory.tableAcl = [];
  assert.throws(() => validateTimeSourceEvidence(missingAclInventory), /ACL tablas 010/);

  const weakenedCapability = installedEvidence();
  weakenedCapability.capabilities.find((row) => row.key === 'time.source.approve').sensitivity = 'standard';
  assert.throws(() => validateTimeSourceEvidence(weakenedCapability), /metadata capacidades/);

  const unmanagedRole = installedEvidence();
  unmanagedRole.roles[0].systemManaged = false;
  assert.throws(() => validateTimeSourceEvidence(unmanagedRole), /metadata roles/);
});

test('runtime sólo ejecuta allowlist SECDEF y no toca relaciones ni secuencias', () => {
  assert.doesNotThrow(() => validateTimeSourceRuntimeAclEvidence(runtimeEvidence()));
  const helper = runtimeEvidence();
  helper.runtimeFunctions.push({ signature: TIME_SOURCE_SIGNATURES.personSod });
  assert.throws(() => validateTimeSourceRuntimeAclEvidence(helper), /allowlist/);

  const directTable = runtimeEvidence();
  directTable.relations[0].canSelect = true;
  assert.throws(() => validateTimeSourceRuntimeAclEvidence(directTable), /privilegio directo/);

  const elevated = runtimeEvidence();
  elevated.runtimeRole.inherit = true;
  assert.throws(() => validateTimeSourceRuntimeAclEvidence(elevated), /LOGIN NOINHERIT/);

  for (const field of ['unexpectedSecurityDefiners', 'relations', 'sequences']) {
    const incomplete = runtimeEvidence();
    delete incomplete[field];
    assert.throws(() => validateTimeSourceRuntimeAclEvidence(incomplete), /inventario (?:ACL )?runtime 010/);
  }
});

test('aplicador verifica prerequisitos, checksums y delegación final 009→010 sin ciclo', () => {
  const applier = readFileSync(
    new URL('../scripts/apply-governed-time-source-registry-schema.mjs', import.meta.url), 'utf8',
  );
  for (const version of [
    '003-action-center', '004-tenant-iam-control-plane', '005-tenant-identity-gateway',
    '006-tenant-action-authority', '007-action-center-read-facades',
    '008-governed-overtime-actions', '009-tenant-lifecycle-hardening',
  ]) assert.match(applier, new RegExp(version));
  assert.match(applier, /checksum_sha256/);
  assert.match(applier, /pg_advisory_xact_lock/);
  assert.match(applier, /verifyTimeSourceFinalAcl/);
  const finalVerifier = applier.slice(
    applier.indexOf('export async function verifyTimeSourceFinalAcl'),
    applier.indexOf('\nasync function main()', applier.indexOf('export async function verifyTimeSourceFinalAcl')),
  );
  assert.match(finalVerifier, /verifyTenantLifecycleBaseEvidence/);
  assert.doesNotMatch(finalVerifier, /verifyTenantLifecycleFinalAcl/);

  const prior = readFileSync(
    new URL('../scripts/apply-tenant-lifecycle-hardening-schema.mjs', import.meta.url), 'utf8',
  );
  assert.match(prior, /010-governed-time-source-registry/);
  assert.match(prior, /verifyTimeSourceFinalAcl/);
});

test('collector usa ACL grantee cero, inventario global SECDEF y no otorga tablas al runtime', () => {
  const applier = readFileSync(
    new URL('../scripts/apply-governed-time-source-registry-schema.mjs', import.meta.url), 'utf8',
  );
  assert.match(applier, /aclexplode\(COALESCE/);
  assert.match(applier, /acl\.grantee = 0/);
  assert.doesNotMatch(applier, /has_function_privilege\('public'/);
  assert.match(applier, /unexpectedSecurityDefiners/);
  assert.match(applier, /has_any_column_privilege\(\$1, relation\.oid, 'SELECT,INSERT,UPDATE,REFERENCES'\)/);
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE time_source_contract, time_source_governance_event[\s\S]*?FROM municontrol_actions_runtime_app/);
  for (const signature of [
    TIME_SOURCE_SIGNATURES.bootstrap,
    TIME_SOURCE_SIGNATURES.list,
    TIME_SOURCE_SIGNATURES.detail,
    TIME_SOURCE_SIGNATURES.apply,
  ]) assert.ok(TIME_SOURCE_RUNTIME_FUNCTION_ALLOWLIST.includes(signature));
  assert.equal(TIME_SOURCE_RUNTIME_FUNCTION_ALLOWLIST.includes(TIME_SOURCE_SIGNATURES.personSod), false);
});
