import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  OVERTIME_RUNTIME_FUNCTION_ALLOWLIST,
  OVERTIME_SECURITY_FUNCTION_SIGNATURES,
  OVERTIME_SIGNATURES,
  validateOvertimeEvidence,
  validateOvertimeMigrationSql,
  validateOvertimeRuntimeAclEvidence,
  validateOvertimeStatusUpgradeSourceEvidence,
} from '../scripts/apply-governed-overtime-actions-schema.mjs';
import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';

const migration = readFileSync(
  new URL('../scripts/migrations/008-governed-overtime-actions.sql', import.meta.url), 'utf8',
);
const actionReadMigration = readFileSync(
  new URL('../scripts/migrations/007-action-center-read-facades.sql', import.meta.url), 'utf8',
);

function installedFunctionFixture(sql, name) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  const end = start < 0 ? -1 : sql.indexOf('\n$$;', start);
  assert.ok(start >= 0 && end > start, `fixture SQL ausente para ${name}`);
  return sql.slice(start, end + 4);
}

const contextNominalReadFixture = installedFunctionFixture(
  actionReadMigration,
  'action_center_context_nominal_read',
);
const deparsedLeaveViewFixture = "SELECT action.id, action.payload AS duration_value, action.payload AS reason_code, action.payload AS policy_rule_id, 'America/Argentina/Mendoza'::text FROM action_case action WHERE case_type::text = 'leave_request'::text;";

const statusConstraint = `CHECK (
  (case_type = 'leave_request' AND status IN ('draft','submitted','approved','rejected','cancelled'))
  OR (case_type = 'overtime_entry' AND status IN ('draft','submitted','pending_time_rules','rejected','cancelled'))
)`;
const eventTypeConstraint = `CHECK (
  (case_type = 'leave_request' AND event_type IN ('created','draft_updated','submitted','approved','rejected','cancelled'))
  OR (case_type = 'overtime_entry' AND event_type IN ('created','draft_updated','submitted','pending_time_rules','rejected','cancelled'))
)`;
const eventStatusConstraint = `CHECK (
  (case_type = 'leave_request' AND from_status IN ('draft','submitted','approved','rejected','cancelled')
    AND to_status IN ('draft','submitted','approved','rejected','cancelled'))
  OR (case_type = 'overtime_entry' AND from_status IN ('draft','submitted','pending_time_rules','rejected','cancelled')
    AND to_status IN ('draft','submitted','pending_time_rules','rejected','cancelled'))
)`;
const leaveViewColumns = [
  ['id', 'uuid'], ['case_number', 'bigint'], ['beneficiary_contract_id', 'uuid'],
  ['source_batch_id', 'uuid'], ['company_id', 'bigint'],
  ['organization_unit_source_id', 'character varying(128)'],
  ['sector_source_id', 'character varying(128)'], ['status', 'character varying(24)'],
  ['confidentiality', 'character varying(16)'],
  ['policy_version_id', 'character varying(128)'], ['reason_code', 'text'],
  ['policy_rule_id', 'text'], ['starts_on', 'date'], ['ends_on', 'date'],
  ['starts_at_local', 'time without time zone'], ['ends_at_local', 'time without time zone'],
  ['duration_unit', 'text'], ['duration_value', 'integer'], ['time_zone', 'text'],
  ['evidence_status', 'character varying(16)'], ['created_by_user_email', 'text'],
  ['submitted_by_user_email', 'text'], ['submitted_at', 'timestamp with time zone'],
  ['decided_by_user_email', 'text'], ['decided_at', 'timestamp with time zone'],
  ['cancelled_by_user_email', 'text'], ['cancelled_at', 'timestamp with time zone'],
  ['version', 'integer'], ['created_at', 'timestamp with time zone'],
  ['updated_at', 'timestamp with time zone'],
].map(([name, type]) => ({ name, type }));

function sourceStatusColumns(type) {
  return [
    { tableName: 'action_case', columnName: 'status', type },
    { tableName: 'action_case_event', columnName: 'from_status', type },
    { tableName: 'action_case_event', columnName: 'to_status', type },
  ];
}

function functionDefinition(signature) {
  if (signature === 'public.tenant_iam_effective_capabilities(uuid)') {
    return "membership.status = 'active' tenant.status = 'active' role_row.scope_kind = 'tenant'";
  }
  if (signature === 'public.tenant_iam_assert_no_sod_conflict(uuid)') {
    return 'iam_capability_conflict tenant_iam_effective_capabilities TENANT_IAM_SOD_CONFLICT';
  }
  if (signature.startsWith('public.action_center_assert_tenant_read_session_v2')) {
    return "identity_session.auth_level IN ('mfa', 'recovery') certified_release_sha certified_source_binding_id ACTION_SESSION_BUSY";
  }
  if (signature === 'public.action_center_context_has_capability(jsonb,text)') {
    return "COALESCE(p_context->'capabilities', '[]') ? p_capability";
  }
  if (signature === 'public.action_center_context_has_area_scope(jsonb,text,bigint,text,text)') {
    return "tenant_iam_effective_capabilities scope.capability_key = p_capability scope.tenant_id = (p_context->>'tenantId')::uuid scope.source_binding_id = (p_context->>'sourceBindingId')::uuid";
  }
  if (signature === 'public.action_center_context_nominal_read(jsonb,uuid,bigint,text,text,text)') {
    return contextNominalReadFixture;
  }
  if (signature.startsWith('public.action_center_tenant_actor_authorized')) {
    return "membership.id = p_membership_id membership.tenant_id = p_tenant_id effective.capability_key = 'actions.read' scope.capability_key = required_capability";
  }
  if (signature.startsWith('public.action_center_set_tenant_command_context')) {
    return 'actor_membership_id tenant_id source_binding_id idempotency_key command_hash metadata ON CONFLICT (backend_pid, transaction_id) DO UPDATE';
  }
  if (signature === OVERTIME_SIGNATURES.apply) {
    return "tenant_exclusive_capability pending_time_rules evidence_status = CASE WHEN p_command = 'approve' THEN 'verified'";
  }
  return 'governed security definer facade';
}

function evidence() {
  const constraintNames = [
    'action_case_type_ck', 'action_case_status_ck', 'action_case_policy_version_ck',
    'action_case_submission_ck', 'action_case_decision_ck', 'action_case_approval_human_ck',
    'action_case_overtime_payload_ck', 'action_case_overtime_confidentiality_ck',
    'action_case_event_type_ck', 'action_case_event_status_ck',
  ];
  return {
    functions: OVERTIME_SECURITY_FUNCTION_SIGNATURES.map((signature) => ({
      signature, securityDefiner: true, publicExecuteRevoked: true,
      ownedByCurrentUser: true, owner: 'neondb_owner', config: 'search_path=public, pg_temp',
      definition: functionDefinition(signature),
    })),
    constraints: constraintNames.map((name) => ({
      name, type: 'c', validated: true,
      definition: name === 'action_case_status_ck' ? statusConstraint
        : name === 'action_case_event_type_ck' ? eventTypeConstraint
          : name === 'action_case_event_status_ck' ? eventStatusConstraint : 'CHECK (true)',
    })),
    index: {
      tableName: 'action_case', unique: true, valid: true, ready: true,
      definition: "CREATE UNIQUE INDEX action_case_overtime_active_entry_uk ON action_case (tenant_id, source_binding_id, beneficiary_contract_id, ((payload ->> 'workDate'))) WHERE case_type = 'overtime_entry'",
      predicate: "((case_type)::text = 'overtime_entry'::text) AND ((status)::text = ANY ((ARRAY['draft'::character varying, 'submitted'::character varying, 'pending_time_rules'::character varying])::text[]))",
    },
    roleCapabilities: [
      { roleKey: 'JUNIN_TESORERIA_CARGA', capabilityKey: 'actions.read' },
      { roleKey: 'JUNIN_TESORERIA_CARGA', capabilityKey: 'time.overtime.read' },
      { roleKey: 'JUNIN_TESORERIA_CARGA', capabilityKey: 'time.overtime.enter' },
      { roleKey: 'JUNIN_CONTADURIA_APROBADOR', capabilityKey: 'actions.read' },
      { roleKey: 'JUNIN_CONTADURIA_APROBADOR', capabilityKey: 'time.overtime.read' },
      { roleKey: 'JUNIN_CONTADURIA_APROBADOR', capabilityKey: 'time.overtime.approve' },
    ],
    reasonCount: 5,
    decisionReasonCount: 4,
    statusColumns: [
      { tableName: 'action_case', columnName: 'status', type: 'character varying(24)' },
      { tableName: 'action_case_event', columnName: 'from_status', type: 'character varying(24)' },
      { tableName: 'action_case_event', columnName: 'to_status', type: 'character varying(24)' },
    ],
    leaveView: {
      name: 'vw_action_leave_request', kind: 'v', owner: 'neondb_owner',
      ownedByCurrentUser: true, publicPrivilegesRevoked: true, runtimePrivilegesRevoked: true,
      definition: deparsedLeaveViewFixture,
    },
    leaveViewColumns,
    transitionTrigger: {
      name: 'action_case_validate_update', tableName: 'action_case', enabled: 'O',
      functionSignature: 'public.action_center_validate_case_update()',
      ownedByCurrentUser: true, publicExecuteRevoked: true,
      triggerDefinition: 'CREATE TRIGGER action_case_validate_update BEFORE UPDATE ON action_case FOR EACH ROW EXECUTE FUNCTION action_center_validate_case_update()',
      functionDefinition: "OLD.case_type = 'leave_request' OLD.case_type = 'overtime_entry' pending_time_rules ACTION_VERSION_INCREMENT_REQUIRED",
    },
  };
}

function runtimeEvidence() {
  return {
    runtimeRole: {
      canLogin: true, inherit: false, superuser: false, bypassRls: false,
      createDb: false, createRole: false, replication: false,
      membershipCount: 0, memberCount: 0, schemaUsage: true, schemaCreate: false,
    },
    roleMemberships: [],
    runtimeFunctions: [
      ...OVERTIME_RUNTIME_FUNCTION_ALLOWLIST.map((signature) => ({ signature, execute: true })),
      { signature: OVERTIME_SIGNATURES.mutationContext, execute: false },
      { signature: OVERTIME_SIGNATURES.payload, execute: false },
    ],
    unexpectedSecurityDefiners: [],
    relations: [{ name: 'action_case', canSelect: false, canInsert: false, canUpdate: false,
      canReferences: false, canDelete: false, canTruncate: false, canTrigger: false }],
    sequences: [{ name: 'action_case_case_number_seq', canUsage: false, canSelect: false, canUpdate: false }],
  };
}

test('008 es una migración nueva, parseable e inmutable respecto de 003-007', () => {
  assert.equal(splitPostgresStatements(migration).length, 81);
  assert.doesNotThrow(() => validateOvertimeMigrationSql(migration));
  assert.doesNotMatch(migration, /ALTER ROLE municontrol_actions_runtime_app/i);
});

test('DDL 008 completa dos ciclos semánticos sin colisionar constraints, vista o índice', () => {
  const statements = splitPostgresStatements(migration).map((statement) => statement
    .replace(/--[^\r\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replaceAll('"', '').replace(/\s+/g, ' ').trim().toLowerCase());
  const state = {
    constraints: new Set([
      'action_case_type_ck', 'action_case_status_ck', 'action_case_policy_version_ck',
      'action_case_submission_ck', 'action_case_decision_ck', 'action_case_approval_human_ck',
      'action_case_event_type_ck', 'action_case_event_status_ck',
    ]),
    leaveView: true,
    overtimeIndex: false,
  };
  const runCycle = () => {
    for (const statement of statements) {
      const dropConstraint = statement.match(/alter table [a-z0-9_.]+ drop constraint if exists ([a-z0-9_]+)/);
      if (dropConstraint) state.constraints.delete(dropConstraint[1]);
      const addConstraint = statement.match(/alter table [a-z0-9_.]+ add constraint ([a-z0-9_]+)/);
      if (addConstraint) {
        assert.equal(state.constraints.has(addConstraint[1]), false, `constraint duplicada ${addConstraint[1]}`);
        state.constraints.add(addConstraint[1]);
      }
      if (statement === 'drop view public.vw_action_leave_request') {
        assert.equal(state.leaveView, true, 'DROP VIEW sin vista previa');
        state.leaveView = false;
      }
      if (statement.startsWith('create view public.vw_action_leave_request as')) {
        assert.equal(state.leaveView, false, 'CREATE VIEW duplicada');
        state.leaveView = true;
      }
      if (statement.startsWith('create unique index if not exists action_case_overtime_active_entry_uk')) {
        state.overtimeIndex = true;
      }
    }
  };
  runCycle();
  const afterFirst = {
    constraints: [...state.constraints].sort(), leaveView: state.leaveView, overtimeIndex: state.overtimeIndex,
  };
  runCycle();
  assert.deepEqual({
    constraints: [...state.constraints].sort(), leaveView: state.leaveView, overtimeIndex: state.overtimeIndex,
  }, afterFirst);
  assert.equal(state.constraints.has('action_case_overtime_payload_ck'), true);
  assert.equal(state.constraints.has('action_case_overtime_confidentiality_ck'), true);
});

test('gate DDL rechaza cualquier ADD/CREATE/TRIGGER no reapply-safe', () => {
  for (const missingDrop of [
    'ALTER TABLE action_case DROP CONSTRAINT IF EXISTS action_case_overtime_payload_ck;\n',
    'ALTER TABLE action_case DROP CONSTRAINT IF EXISTS action_case_overtime_confidentiality_ck;\n',
  ]) {
    assert.throws(() => validateOvertimeMigrationSql(migration.replace(missingDrop, '')), /constraint .* sin DROP previo/);
  }
  assert.throws(() => validateOvertimeMigrationSql(migration.replace(
    'CREATE UNIQUE INDEX IF NOT EXISTS action_case_overtime_active_entry_uk',
    'CREATE UNIQUE INDEX action_case_overtime_active_entry_uk',
  )), /CREATE no gobernado para reapply/);
  assert.throws(() => validateOvertimeMigrationSql(migration.replace(
    'CREATE OR REPLACE FUNCTION action_center_valid_overtime_payload',
    'CREATE FUNCTION action_center_valid_overtime_payload',
  )), /CREATE no gobernado para reapply/);
  assert.throws(() => validateOvertimeMigrationSql(`${migration}\nCREATE TRIGGER unsafe_reapply BEFORE UPDATE ON action_case EXECUTE FUNCTION action_center_validate_case_update();`), /trigger .* sin DROP previo/);
});

test('upgrade status elimina sólo la vista conocida, amplía tipos y la recrea antes de constraints', () => {
  const statements = splitPostgresStatements(migration).map((statement) => statement.replace(/\s+/g, ' '));
  const drop = statements.findIndex((statement) => /DROP VIEW public\.vw_action_leave_request/i.test(statement));
  const alterCase = statements.findIndex((statement) => /action_case ALTER COLUMN status TYPE varchar\(24\)/i.test(statement));
  const alterFrom = statements.findIndex((statement) => /action_case_event ALTER COLUMN from_status TYPE varchar\(24\)/i.test(statement));
  const alterTo = statements.findIndex((statement) => /action_case_event ALTER COLUMN to_status TYPE varchar\(24\)/i.test(statement));
  const create = statements.findIndex((statement) => /CREATE VIEW public\.vw_action_leave_request AS/i.test(statement));
  const constraint = statements.findIndex((statement) => /ADD CONSTRAINT action_case_type_ck/i.test(statement));
  assert.ok(drop >= 0 && drop < alterCase && alterCase < alterFrom && alterFrom < alterTo
    && alterTo < create && create < constraint);
  assert.doesNotMatch(statements[drop], /DROP VIEW public\.vw_action_leave_request\s+CASCADE/i);
  assert.throws(() => validateOvertimeMigrationSql(
    migration.replace('DROP VIEW public.vw_action_leave_request;', ''),
  ), /(?:preflight|upgrade) de status|vista .* sin DROP previo/);
  assert.throws(() => validateOvertimeMigrationSql(
    migration.replace(
      'DROP VIEW public.vw_action_leave_request;',
      'DROP VIEW public.vw_action_leave_request CASCADE;',
    ),
  ), /sin CASCADE/);
  assert.throws(() => validateOvertimeMigrationSql(
    migration.replace("WHERE action.case_type = 'leave_request';", "WHERE action.case_type IN ('leave_request', 'overtime_entry');"),
  ), /vista leave reconstruida/);
  assert.throws(() => validateOvertimeMigrationSql(
    migration.replace('FROM pg_depend dependency', 'FROM pg_depend_removed dependency'),
  ), /preflight de status/);
  assert.match(migration, /ACTION_STATUS_SOURCE_TYPE_DRIFT/);
  assert.match(migration, /ACTION_STATUS_SOURCE_VIEW_DRIFT/);
  assert.match(migration, /ACTION_STATUS_DEPENDENCY_DRIFT/);
  assert.throws(() => validateOvertimeMigrationSql(migration.replace(
    'source_status_v16_count = 0 AND source_status_v24_count = 3',
    'source_status_v16_count = 0 AND source_status_v24_count = 2',
  )), /preflight de status/);
});

test('preflight de status acepta primera aplicación y reapply, pero nunca mezcla anchos', () => {
  assert.equal(
    validateOvertimeStatusUpgradeSourceEvidence(sourceStatusColumns('character varying(16)')),
    'upgrade',
  );
  assert.equal(
    validateOvertimeStatusUpgradeSourceEvidence(sourceStatusColumns('character varying(24)')),
    'reapply',
  );
  const mixed = sourceStatusColumns('character varying(24)');
  mixed[0].type = 'character varying(16)';
  assert.throws(() => validateOvertimeStatusUpgradeSourceEvidence(mixed), /mezcla anchos/);
  assert.throws(() => validateOvertimeStatusUpgradeSourceEvidence(
    sourceStatusColumns('text'),
  ), /tipo no homologado/);
  assert.throws(() => validateOvertimeStatusUpgradeSourceEvidence(
    sourceStatusColumns('character varying(24)').slice(0, 2),
  ), /tres columnas exactas/);
  const duplicate = sourceStatusColumns('character varying(24)');
  duplicate[2] = { ...duplicate[1] };
  assert.throws(() => validateOvertimeStatusUpgradeSourceEvidence(duplicate), /faltantes o duplicadas/);
});

test('evidencia instalada exige tipos ampliados y vista leave exacta con ACL cerrada', () => {
  assert.doesNotThrow(() => validateOvertimeEvidence(evidence()));
  const narrow = structuredClone(evidence());
  narrow.statusColumns[0].type = 'character varying(16)';
  assert.throws(() => validateOvertimeEvidence(narrow), /no ampliada exactamente/);
  const extraColumn = structuredClone(evidence());
  extraColumn.leaveViewColumns.push({ name: 'overtime_amount', type: 'numeric' });
  assert.throws(() => validateOvertimeEvidence(extraColumn), /proyeccion y tipos exactos/);
  const wrongType = structuredClone(evidence());
  wrongType.leaveViewColumns.find((column) => column.name === 'status').type = 'text';
  assert.throws(() => validateOvertimeEvidence(wrongType), /proyeccion y tipos exactos/);
  for (const drift of [
    { kind: 'm' }, { owner: 'municontrol_actions_runtime_app' },
    { publicPrivilegesRevoked: false }, { runtimePrivilegesRevoked: false },
  ]) {
    const unsafe = structuredClone(evidence());
    Object.assign(unsafe.leaveView, drift);
    assert.throws(() => validateOvertimeEvidence(unsafe), /vista leave 008 ausente o insegura/);
  }
  const aliasedFilter = structuredClone(evidence());
  aliasedFilter.leaveView.definition = deparsedLeaveViewFixture.replace(
    "case_type::text = 'leave_request'::text",
    "action.case_type::text = 'leave_request'::text",
  );
  assert.doesNotThrow(() => validateOvertimeEvidence(aliasedFilter));

  for (const unsafeWhere of [
    "case_type::text = 'leave_request'::text OR true",
    "case_type::text IN ('leave_request'::text)",
    "case_type::text = 'leave_request'::text AND true",
    "case_type::text = 'overtime_entry'::text",
    "case_type::text = 'leave_request'::text OR case_type::text = 'overtime_entry'::text",
  ]) {
    const widenedFilter = structuredClone(evidence());
    widenedFilter.leaveView.definition = deparsedLeaveViewFixture.replace(
      "case_type::text = 'leave_request'::text",
      unsafeWhere,
    );
    assert.throws(
      () => validateOvertimeEvidence(widenedFilter),
      /vista leave 008/,
    );
  }
});

test('lectura nominal heredada valida el contrato real 007 de fuente, confidencialidad y alcance', () => {
  assert.doesNotMatch(contextNominalReadFixture, /action_center_tenant_actor_authorized/);
  assert.doesNotThrow(() => validateOvertimeEvidence(evidence()));

  for (const [source, replacement] of [
    ["p_context->>'sourceCompanyId'", "p_context->>'companyId'"],
    ["p_confidentiality = 'standard'", "p_confidentiality <> 'restricted'"],
    ["OR self_case\n    OR action_center_context_has_capability(p_context, 'leave.request.restricted.read')",
      "OR action_center_context_has_capability(p_context, 'leave.request.restricted.read')"],
    ["'leave.request.restricted.read'", "'leave.request.all.read'"],
    ["'leave.request.self.read'", "'leave.request.all.read'"],
    ["'leave.request.area.read', p_company_id", "'leave.request.all.read', p_company_id"],
    ['p_organization_unit_source_id, p_sector_source_id', 'NULL, NULL'],
  ]) {
    const drifted = structuredClone(evidence());
    const nominal = drifted.functions.find((row) => (
      row.signature === 'public.action_center_context_nominal_read(jsonb,uuid,bigint,text,text,text)'
    ));
    nominal.definition = nominal.definition.replace(source, replacement);
    assert.notEqual(nominal.definition, contextNominalReadFixture, `mutación no aplicada: ${source}`);
    assert.throws(() => validateOvertimeEvidence(drifted), /context nominal read/);
  }

  const parallelAuthority = structuredClone(evidence());
  parallelAuthority.functions.find((row) => (
    row.signature === 'public.action_center_context_nominal_read(jsonb,uuid,bigint,text,text,text)'
  )).definition += '\nPERFORM action_center_tenant_actor_authorized();';
  assert.throws(() => validateOvertimeEvidence(parallelAuthority), /autorización mutante ajena/);
});

test('CHECK de payload es estructural IMMUTABLE y catálogo se bloquea en facade', () => {
  const payload = migration.slice(
    migration.indexOf('CREATE OR REPLACE FUNCTION action_center_valid_overtime_payload'),
    migration.indexOf('\n$$;', migration.indexOf('CREATE OR REPLACE FUNCTION action_center_valid_overtime_payload')),
  );
  assert.match(payload, /IMMUTABLE SECURITY DEFINER/);
  assert.doesNotMatch(payload, /action_overtime_reason_catalog/);
  assert.match(migration, /FROM action_overtime_reason_catalog reason[\s\S]*?FOR SHARE/);
});

test('create mantiene locks de contrato beneficiario y batch hasta insertar el caso', () => {
  assert.match(migration, /FROM employment_contract contract_row[\s\S]*?FOR SHARE OF contract_row, batch/);
  assert.throws(() => validateOvertimeMigrationSql(
    migration.replace('FOR SHARE OF contract_row, batch;', ';'),
  ), /FOR SHARE OF contract_row, batch/);
});

test('contexto mutante falla rápido si revocación retiene authority o vínculo laboral', () => {
  assert.match(migration, /FROM tenant_action_authority authority[\s\S]*?FOR SHARE NOWAIT;/);
  assert.match(migration, /FROM tenant_action_employment_link link[\s\S]*?FOR SHARE OF link, contract, batch NOWAIT;/);
  assert.throws(() => validateOvertimeMigrationSql(
    migration.replace(
      'AND authority.tenant_id = membership_row.tenant_id\n  FOR SHARE NOWAIT;',
      'AND authority.tenant_id = membership_row.tenant_id\n  FOR SHARE;',
    ),
  ), /lock authority overtime/);
  assert.throws(() => validateOvertimeMigrationSql(
    migration.replace('FOR SHARE OF link, contract, batch NOWAIT;', 'FOR SHARE OF link, contract, batch;'),
  ), /lock link overtime/);
});

test('validator rechaza lookup mutable en CHECK, ALTER ROLE y payroll/posting', () => {
  assert.throws(() => validateOvertimeMigrationSql(migration.replace(
    'RETURN true;', 'PERFORM 1 FROM action_overtime_reason_catalog; RETURN true;',
  )), /catálogo mutable/);
  assert.throws(() => validateOvertimeMigrationSql(`${migration}\nALTER ROLE municontrol_actions_runtime_app SUPERUSER;`), /ALTER ROLE/);
  assert.throws(() => validateOvertimeMigrationSql(`${migration}\nUPDATE grh_employees SET sector='x';`), /UPDATE grh_/);
  assert.throws(() => validateOvertimeMigrationSql(`${migration}\n-- time.overtime.post`), /time.overtime.post/);
});

test('validator bloquea toda mutación de relaciones salariales sensibles', () => {
  for (const unsafe of [
    'INSERT INTO public.payroll_run DEFAULT VALUES;',
    'INSERT/**/INTO public.payroll_snapshot_assignment DEFAULT VALUES;',
    'UPDATE public.payroll_snapshot_assignment SET payroll_run_id = payroll_run_id;',
    'DELETE FROM "public"."payroll_monthly_fact";',
    'TRUNCATE TABLE action_overtime_reason_catalog, public.payroll_run;',
    'MERGE INTO public.payroll_monthly_fact target USING source ON false WHEN NOT MATCHED THEN DO NOTHING;',
  ]) {
    assert.throws(() => validateOvertimeMigrationSql(`${migration}\n${unsafe}`), /intenta mutar nómina/);
  }
});

test('estado y eventos quedan ligados por case_type y no usan unión global', () => {
  assert.doesNotThrow(() => validateOvertimeEvidence(evidence()));
  for (const [name, corrupt] of [
    ['action_case_status_ck', statusConstraint.replace("'approved'", "'approved','pending_time_rules'")],
    ['action_case_event_type_ck', eventTypeConstraint.replace("'approved'", "'approved','pending_time_rules'")],
    ['action_case_event_status_ck', eventStatusConstraint.replace("'approved'", "'approved','pending_time_rules'")],
  ]) {
    const unsafe = structuredClone(evidence());
    unsafe.constraints.find((item) => item.name === name).definition = corrupt;
    assert.throws(() => validateOvertimeEvidence(unsafe), /permite pending_time_rules en leave/);
  }
  const overtimeApproved = structuredClone(evidence());
  overtimeApproved.constraints.find((item) => item.name === 'action_case_status_ck').definition =
    statusConstraint.replace("'pending_time_rules'", "'pending_time_rules','approved'");
  assert.throws(() => validateOvertimeEvidence(overtimeApproved), /permite approved en overtime/);
});

test('índice diario no puede ampliarse con minutos o motivo', () => {
  const unsafe = evidence();
  unsafe.index.definition = unsafe.index.definition.replace(
    "((payload ->> 'workDate'))", "((payload ->> 'workDate')), ((payload ->> 'declaredMinutes'))",
  );
  assert.throws(() => validateOvertimeEvidence(unsafe), /clave ampliable/);
  assert.throws(() => validateOvertimeMigrationSql(migration.replace(
    "(payload->>'workDate')\n  )", "(payload->>'workDate'), (payload->>'reasonCode')\n  )",
  )), /índice diario/);
  for (const missingStatus of ['draft', 'submitted', 'pending_time_rules']) {
    const incomplete = structuredClone(evidence());
    const remaining = ['draft', 'submitted', 'pending_time_rules']
      .filter((status) => status !== missingStatus)
      .map((status) => `'${status}'::character varying`).join(', ');
    incomplete.index.predicate = `((case_type)::text = 'overtime_entry'::text)
      AND ((status)::text = ANY ((ARRAY[${remaining}])::text[]))`;
    assert.throws(() => validateOvertimeEvidence(incomplete), /predicado activo exacto/);
  }
});

test('grants exactos preservan maker-checker y nunca conceden post', () => {
  assert.doesNotThrow(() => validateOvertimeEvidence(evidence()));
  const unsafe = evidence();
  unsafe.roleCapabilities.push({ roleKey: 'JUNIN_TESORERIA_CARGA', capabilityKey: 'time.overtime.approve' });
  assert.throws(() => validateOvertimeEvidence(unsafe), /SoD\/grant/);
  const missing = evidence();
  missing.roleCapabilities = missing.roleCapabilities.filter((row) => row.capabilityKey !== 'actions.read'
    || row.roleKey !== 'JUNIN_TESORERIA_CARGA');
  assert.throws(() => validateOvertimeEvidence(missing), /capability overtime ausente/);
});

test('toda fachada heredada y nueva conserva owner, SECDEF, search_path y PUBLIC revocado', () => {
  assert.doesNotThrow(() => validateOvertimeEvidence(evidence()));
  for (const mutation of [
    { publicExecuteRevoked: false }, { securityDefiner: false },
    { owner: 'municontrol_actions_runtime_app' }, { ownedByCurrentUser: false },
    { config: 'search_path=public' },
  ]) {
    const unsafe = evidence();
    Object.assign(unsafe.functions.find((row) => row.signature === OVERTIME_SIGNATURES.apply), mutation);
    assert.throws(() => validateOvertimeEvidence(unsafe), /ausente o insegura/);
  }
});

test('trigger de transición debe seguir habilitado, ligado a action_case y a su función exacta', () => {
  assert.doesNotThrow(() => validateOvertimeEvidence(evidence()));
  for (const drift of [
    { enabled: 'D' }, { tableName: 'shadow_action_case' },
    { functionSignature: 'public.shadow_validate()' }, { publicExecuteRevoked: false },
  ]) {
    const unsafe = evidence();
    Object.assign(unsafe.transitionTrigger, drift);
    assert.throws(() => validateOvertimeEvidence(unsafe), /trigger de transición/);
  }
  for (const [source, replacement] of [
    ['BEFORE UPDATE', 'AFTER UPDATE'],
    ['ON action_case', 'ON shadow_action_case'],
    ['FOR EACH ROW', 'FOR EACH STATEMENT'],
    ['action_center_validate_case_update()', 'shadow_validate_case_update()'],
    ['TRIGGER action_case_validate_update', 'TRIGGER shadow_validate_update'],
  ]) {
    const unsafe = structuredClone(evidence());
    unsafe.transitionTrigger.triggerDefinition = unsafe.transitionTrigger.triggerDefinition.replace(source, replacement);
    assert.throws(() => validateOvertimeEvidence(unsafe), /trigger binding overtime/);
  }
  for (const qualified of [
    'CREATE TRIGGER action_case_validate_update BEFORE UPDATE ON public.action_case FOR EACH ROW EXECUTE FUNCTION action_center_validate_case_update()',
    'CREATE TRIGGER action_case_validate_update BEFORE UPDATE ON action_case FOR EACH ROW EXECUTE FUNCTION public.action_center_validate_case_update()',
    'CREATE TRIGGER action_case_validate_update BEFORE UPDATE ON public.action_case FOR EACH ROW EXECUTE FUNCTION public.action_center_validate_case_update()',
  ]) {
    const safe = structuredClone(evidence());
    safe.transitionTrigger.triggerDefinition = qualified;
    assert.doesNotThrow(() => validateOvertimeEvidence(safe));
  }
});

test('runtime sólo ejecuta allowlist y nunca tablas, secuencias ni helper interno', () => {
  assert.doesNotThrow(() => validateOvertimeRuntimeAclEvidence(runtimeEvidence()));
  const helper = runtimeEvidence();
  helper.runtimeFunctions.find((row) => row.signature === OVERTIME_SIGNATURES.mutationContext).execute = true;
  assert.throws(() => validateOvertimeRuntimeAclEvidence(helper), /ACL runtime incorrecta/);
  const table = runtimeEvidence();
  table.relations[0].canSelect = true;
  assert.throws(() => validateOvertimeRuntimeAclEvidence(table), /relación directa/);
  const foreignSecurityDefiner = runtimeEvidence();
  foreignSecurityDefiner.unexpectedSecurityDefiners.push({
    signature: 'public.unrelated_privileged_helper(text)',
  });
  assert.throws(() => validateOvertimeRuntimeAclEvidence(foreignSecurityDefiner), /fuera de allowlist/);
  const missingGlobalInventory = runtimeEvidence();
  delete missingGlobalInventory.unexpectedSecurityDefiners;
  assert.throws(() => validateOvertimeRuntimeAclEvidence(missingGlobalInventory), /sin inventario global/);
});

test('modelo de rol admite sólo arista administrativa Neon owner -> runtime no heredable', () => {
  const canonical = runtimeEvidence();
  canonical.runtimeRole.memberCount = 1;
  canonical.roleMemberships = [{
    direction: 'member_of_runtime', grantedRole: 'municontrol_actions_runtime_app',
    memberRole: 'neondb_owner', memberIsCurrentUser: true, memberOwnsApprovedFunctions: true,
    adminOption: true, inheritOption: false, setOption: false,
  }];
  assert.doesNotThrow(() => validateOvertimeRuntimeAclEvidence(canonical));
  for (const drift of [
    { direction: 'granted_to_runtime' }, { memberIsCurrentUser: false },
    { inheritOption: true }, { setOption: true }, { adminOption: false },
  ]) {
    const unsafe = structuredClone(canonical);
    Object.assign(unsafe.roleMemberships[0], drift);
    assert.throws(() => validateOvertimeRuntimeAclEvidence(unsafe), /arista escalable/);
  }
});

test('routing tiene un único DECLARE y el validator detecta duplicación no compilable', () => {
  const corrupt = migration.replace(
    'DECLARE\n  detail_value jsonb;\n  record_value jsonb;',
    'DECLARE\n  detail_value jsonb;\nDECLARE\n  record_value jsonb;',
  );
  assert.throws(() => validateOvertimeMigrationSql(corrupt), /unico DECLARE/);
});

test('apply overtime conserva cierres distintos y compilables para ambos metadatos', () => {
  const statements = splitPostgresStatements(migration);
  const applyIndex = statements.findIndex((statement) => (
    /CREATE OR REPLACE FUNCTION action_center_apply_overtime_command_v1/i.test(statement)
  ));
  assert.equal(applyIndex + 1, 43);
  const apply = statements[applyIndex];
  assert.match(apply, /event_metadata := jsonb_strip_nulls\(jsonb_build_object\([\s\S]*?'payrollPosted', false\s*\)\);/);
  assert.match(apply, /event_metadata := jsonb_build_object\([\s\S]*?'payrollPosted', false\s*\);[\s\S]*?IF p_command = 'update_draft' THEN/);
  const missingCreateClose = migration.replace(
    "'payrollPosted', false\n    ));\n    PERFORM action_center_set_tenant_command_context(",
    "'payrollPosted', false\n    );\n    PERFORM action_center_set_tenant_command_context(",
  );
  assert.throws(() => validateOvertimeMigrationSql(missingCreateClose), /cierre doble compilable/);
  const extraTransitionClose = migration.replace(
    "'payrollPosted', false\n    );\n\n    IF p_command = 'update_draft' THEN",
    "'payrollPosted', false\n    ));\n\n    IF p_command = 'update_draft' THEN",
  );
  assert.throws(() => validateOvertimeMigrationSql(extraTransitionClose), /cierre compilable/);
});

test('facade apply califica source_database y no declara una variable homónima', () => {
  const statements = splitPostgresStatements(migration);
  const apply = statements.find((statement) => (
    /CREATE OR REPLACE FUNCTION action_center_apply_overtime_command_v1/i.test(statement)
  ));
  assert.match(apply, /binding_source_database text;/);
  assert.match(apply, /batch\.source_database = binding_source_database/);
  assert.doesNotMatch(apply, /\bsource_database text;/);
  assert.doesNotMatch(apply, /batch\.source_database = source_database\b/);
  const ambiguous = migration
    .replace('binding_source_database text;', 'source_database text;')
    .replace("binding_source_database := context_value->>'sourceDatabase';", "source_database := context_value->>'sourceDatabase';")
    .replace('batch.source_database = binding_source_database', 'batch.source_database = source_database');
  assert.throws(() => validateOvertimeMigrationSql(ambiguous), /source_database ambigua/);
});

test('aplicador 007 delega al gate final 008 sin reabrir la allowlist', () => {
  const applier007 = readFileSync(
    new URL('../scripts/apply-action-center-read-facades-schema.mjs', import.meta.url), 'utf8',
  );
  assert.match(applier007, /008-governed-overtime-actions/);
  assert.match(applier007, /verifyOvertimeFinalAcl/);
  const applier008 = readFileSync(
    new URL('../scripts/apply-governed-overtime-actions-schema.mjs', import.meta.url), 'utf8',
  );
  assert.doesNotMatch(applier008, /from ['"]\.\/apply-action-center-read-facades-schema\.mjs['"]/);
  const applier003 = readFileSync(
    new URL('../scripts/apply-action-center-schema.mjs', import.meta.url), 'utf8',
  );
  assert.match(applier003, /007-action-center-read-facades/);
  assert.match(applier003, /verifyActionReadFinalAcl/);
});

test('collector PUBLIC usa ACL grantee cero y no intenta resolver un rol public inexistente', () => {
  const applier = readFileSync(
    new URL('../scripts/apply-governed-overtime-actions-schema.mjs', import.meta.url), 'utf8',
  );
  assert.match(applier, /aclexplode\(COALESCE/);
  assert.match(applier, /acl\.grantee = 0/);
  assert.doesNotMatch(applier, /has_function_privilege\('public'/);
  assert.match(applier, /function_row\.prosecdef IS TRUE/);
  assert.match(applier, /unexpectedSecurityDefiners/);
});
