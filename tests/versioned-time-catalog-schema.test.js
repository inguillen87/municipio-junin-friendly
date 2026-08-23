import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  VERSIONED_TIME_CATALOG_MIGRATION_VERSION,
  VERSIONED_TIME_CATALOG_RUNTIME_FUNCTION_ALLOWLIST,
  VERSIONED_TIME_CATALOG_SIGNATURES,
  VERSIONED_TIME_CATALOG_TABLE_COLUMNS,
  VERSIONED_TIME_CATALOG_TABLES,
  validateVersionedTimeCatalogEvidence,
  validateVersionedTimeCatalogMigrationSql,
  validateVersionedTimeCatalogRuntimeAclEvidence,
  versionedTimeCatalogFingerprint,
} from '../scripts/apply-versioned-time-catalog-schema.mjs';
import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';

const migration = readFileSync(
  new URL('../scripts/migrations/011-versioned-time-catalog.sql', import.meta.url),
  'utf8',
);
const applier = readFileSync(
  new URL('../scripts/apply-versioned-time-catalog-schema.mjs', import.meta.url),
  'utf8',
);
const statements = splitPostgresStatements(migration);

function functionDefinition(signature) {
  const name = signature.match(/^public\.([^(]+)/)?.[1];
  return statements.find((statement) => new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+${name}\\s*\\(`, 'i',
  ).test(statement)) || '';
}

const WEEK_SECONDS = 7 * 24 * 60 * 60;

function clockSeconds(value) {
  const match = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.exec(value);
  assert.ok(match, `hora invalida: ${value}`);
  const [hours, minutes, seconds] = value.split(':').map(Number);
  return (hours * 60 * 60) + (minutes * 60) + seconds;
}

function normalizedWeekSegments({ day, start, end, crossesMidnight }) {
  assert.ok(Number.isInteger(day) && day >= 1 && day <= 7);
  assert.equal(typeof crossesMidnight, 'boolean');
  const startOfDay = clockSeconds(start);
  const endOfDay = clockSeconds(end);
  if (crossesMidnight) assert.ok(startOfDay > endOfDay);
  else assert.ok(startOfDay < endOfDay);
  const normalizedStart = ((day - 1) * 24 * 60 * 60) + startOfDay;
  const normalizedEnd = ((day - 1) * 24 * 60 * 60) + endOfDay
    + (crossesMidnight ? 24 * 60 * 60 : 0);
  const segments = [[normalizedStart, Math.min(normalizedEnd, WEEK_SECONDS)]];
  if (normalizedEnd > WEEK_SECONDS) segments.push([0, normalizedEnd - WEEK_SECONDS]);
  return segments;
}

function weeklyIntervalsOverlap(left, right) {
  return normalizedWeekSegments(left).some(([leftStart, leftEnd]) => (
    normalizedWeekSegments(right).some(([rightStart, rightEnd]) => (
      leftStart < rightEnd && rightStart < leftEnd
    ))
  ));
}

function functionRows() {
  return [...new Set(Object.values(VERSIONED_TIME_CATALOG_SIGNATURES))].map((signature) => ({
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
  const constraints = [...migration.matchAll(/CONSTRAINT\s+([a-z0-9_]+)/g)]
    .map((match) => ({ name: match[1], validated: true }));
  return {
    tableColumns: Object.entries(VERSIONED_TIME_CATALOG_TABLE_COLUMNS).flatMap(
      ([tableName, columns]) => columns.map((name) => ({ tableName, name })),
    ),
    constraints,
    triggers: [
      ['time_catalog_entry_transition_guard_v1','time_catalog_entry','time_catalog_guard_entry_v1'],
      ['time_catalog_entry_approved_overlap_guard_v1','time_catalog_entry','time_catalog_guard_approved_overlap_v1'],
      ['time_calendar_day_draft_guard_v1','time_calendar_day','time_catalog_guard_draft_child_v1'],
      ['time_shift_spec_draft_guard_v1','time_shift_spec','time_catalog_guard_draft_child_v1'],
      ['time_shift_interval_draft_guard_v1','time_shift_weekly_interval','time_catalog_guard_draft_child_v1'],
      ['time_shift_interval_overlap_guard_v1','time_shift_weekly_interval','time_catalog_guard_shift_interval_overlap_v1'],
      ['time_rule_parameter_draft_guard_v1','time_rule_parameter','time_catalog_guard_draft_child_v1'],
      ['time_assignment_spec_draft_guard_v1','time_assignment_spec','time_catalog_guard_draft_child_v1'],
      ['time_catalog_event_append_only_v1','time_catalog_governance_event','tenant_iam_reject_change'],
    ].map(([name, tableName, functionName]) => ({
      name, tableName, functionName, functionSchema: 'public', enabled: 'O',
    })),
    indexes: [
      ['time_catalog_entry_tenant_list_idx','time_catalog_entry'],
      ['time_catalog_entry_effective_idx','time_catalog_entry'],
      ['time_calendar_day_date_idx','time_calendar_day'],
      ['time_shift_interval_day_idx','time_shift_weekly_interval'],
      ['time_assignment_contract_idx','time_assignment_spec'],
      ['time_catalog_event_timeline_idx','time_catalog_governance_event'],
    ].map(([name, tableName]) => ({
      name, tableName, unique: false, valid: true, ready: true, predicate: null,
    })),
    functions: functionRows(),
    capabilities: [
      { key: 'time.catalog.read', scopeKind: 'tenant', sensitivity: 'standard' },
      { key: 'time.catalog.propose', scopeKind: 'tenant', sensitivity: 'privileged' },
      { key: 'time.catalog.approve', scopeKind: 'tenant', sensitivity: 'restricted' },
      { key: 'time.catalog.audit.read', scopeKind: 'tenant', sensitivity: 'restricted' },
    ],
    roles: [
      { key: 'JUNIN_TIEMPO_CATALOGO_PROPONENTE', scopeKind: 'tenant', systemManaged: true },
      { key: 'JUNIN_TIEMPO_CATALOGO_APROBADOR', scopeKind: 'tenant', systemManaged: true },
    ],
    roleCapabilities: [
      { roleKey: 'JUNIN_TIEMPO_CATALOGO_PROPONENTE', capabilityKey: 'time.catalog.read' },
      { roleKey: 'JUNIN_TIEMPO_CATALOGO_PROPONENTE', capabilityKey: 'time.catalog.propose' },
      { roleKey: 'JUNIN_TIEMPO_CATALOGO_APROBADOR', capabilityKey: 'time.catalog.read' },
      { roleKey: 'JUNIN_TIEMPO_CATALOGO_APROBADOR', capabilityKey: 'time.catalog.approve' },
      { roleKey: 'JUNIN_TIEMPO_CATALOGO_APROBADOR', capabilityKey: 'time.catalog.audit.read' },
    ],
    conflicts: [
      { left: 'time.catalog.approve', right: 'time.catalog.propose' },
      { left: 'time.catalog.approve', right: 'time.overtime.post' },
    ],
    crossTenantEntries: 0,
    crossTenantChildren: 0,
    crossTenantEvents: 0,
    makerCheckerViolations: 0,
    approvedOverlaps: 0,
    assignmentOverlaps: 0,
    approvedIncomplete: 0,
    personSodViolations: 0,
    tableAcl: VERSIONED_TIME_CATALOG_TABLES.map((name) => ({
      name,
      ownedByCurrentUser: true,
      ownerIsRuntime: false,
      publicPrivilegesRevoked: true,
      runtimePrivilegesRevoked: true,
      nonOwnerPrivilegeGrantees: [],
    })),
    sequenceAcl: [],
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
    runtimeFunctions: VERSIONED_TIME_CATALOG_RUNTIME_FUNCTION_ALLOWLIST
      .map((signature) => ({ signature })),
    unexpectedSecurityDefiners: [],
    relations: VERSIONED_TIME_CATALOG_TABLES.map((name) => ({
      name,
      canSelect: false,
      canInsert: false,
      canUpdate: false,
      canReferences: false,
      canDelete: false,
      canTruncate: false,
      canTrigger: false,
    })),
    sequences: [],
  };
}

test('011 es parseable, fingerprintable y mantiene alcance catalog-only', () => {
  assert.equal(VERSIONED_TIME_CATALOG_MIGRATION_VERSION, '011-versioned-time-catalog');
  assert.doesNotThrow(() => validateVersionedTimeCatalogMigrationSql(migration));
  assert.ok(statements.length > 80);
  assert.match(versionedTimeCatalogFingerprint(migration), /^[a-f0-9]{64}$/);
  assert.equal(versionedTimeCatalogFingerprint(migration), versionedTimeCatalogFingerprint(migration));
  assert.doesNotMatch(migration, /\b(?:CREATE|ALTER|DROP)\s+TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?(?:public\.)?(?:grh_|payroll_|action_case)/i);
  assert.doesNotMatch(migration, /\b(?:calculated_minutes|worked_minutes|payroll_amount)\b/i);
  assert.match(migration, /\('time\.catalog\.approve', 'time\.overtime\.post'/);
  assert.doesNotMatch(migration, /\('time\.overtime\.post', 'time\.catalog\.approve'/);
  for (const flag of [
    'catalogReady','attendanceEvaluationReady','punchesLoaded',
    'minutesCalculated','payrollPosted','grhMutation',
  ]) assert.match(migration, new RegExp(`'${flag}', false`, 'i'));
});

test('011 reconoce el dump real como MariaDB/MySQL y no lo disfraza de relación PostgreSQL', () => {
  const validator = functionDefinition(VERSIONED_TIME_CATALOG_SIGNATURES.sourceMetadataRow);
  assert.match(validator, /'mariadb_dump','mysql_dump'/);
  assert.match(validator, /'postgres_relation'/);
  assert.doesNotMatch(migration, /mariadb_dump[\s\S]{0,120}=\s*'postgres_relation'/i);
  assert.throws(() => validateVersionedTimeCatalogMigrationSql(migration.replace(
    "'mariadb_dump','mysql_dump'", "'postgres_relation','postgres_relation'",
  )), /mariadb_dump/);
});

test('calendario, turno, reglas y asignación están tipados y ligados al tenant', () => {
  for (const table of VERSIONED_TIME_CATALOG_TABLES) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(migration, /UNIQUE \(id, tenant_id, catalog_kind\)/);
  assert.match(migration, /FOREIGN KEY \(catalog_entry_id, tenant_id, catalog_kind\)[\s\S]*?REFERENCES time_catalog_entry\(id, tenant_id, catalog_kind\)/);
  assert.match(migration, /employment_contract_id uuid NOT NULL REFERENCES employment_contract\(id\)/);
  assert.match(migration, /entry_tolerance_seconds BETWEEN 0 AND 21600/);
  assert.match(migration, /weekday BETWEEN 1 AND 7/);
  assert.match(migration, /crosses_midnight boolean NOT NULL DEFAULT false/);
  assert.match(migration, /crosses_midnight IS FALSE AND starts_at < ends_at/);
  assert.match(migration, /crosses_midnight IS TRUE AND starts_at > ends_at/);
  assert.match(migration, /time_catalog_parameter_value_valid_v1/);
});

test('estados, vigencia, expectedVersion e idempotencia cierran por defecto', () => {
  assert.match(migration, /status IN \('draft','submitted','approved','rejected','retired'\)/);
  assert.match(migration, /effective_to >= effective_from/);
  assert.match(migration, /resulting_version = expected_version \+ 1/);
  assert.match(migration, /UNIQUE \(tenant_id, actor_membership_id, idempotency_key\)/);
  const apply = functionDefinition(VERSIONED_TIME_CATALOG_SIGNATURES.apply);
  const sessionAt = apply.indexOf('time_source_assert_tenant_session_v1');
  const authorityAt = apply.indexOf('time_catalog_assert_actor_authority_v1');
  const replayAt = apply.indexOf('SELECT * INTO existing_event');
  const versionLockAt = apply.indexOf('FOR UPDATE NOWAIT');
  assert.ok(sessionAt >= 0 && sessionAt < authorityAt && authorityAt < replayAt);
  assert.ok(replayAt < versionLockAt);
  assert.match(apply, /TIME_CATALOG_VERSION_CONFLICT/);
  assert.match(apply, /RETURN existing_event\.result \|\| jsonb_build_object\([\s\S]*?'replayed', true[\s\S]*?'historical'/);
});

test('maker-checker y SoD se evalúan por persona, grants efectivos y posting', () => {
  assert.match(migration, /approver_person_id <> proposer_person_id/);
  assert.match(migration, /approver_membership_id <> proposer_membership_id/);
  const sod = functionDefinition(VERSIONED_TIME_CATALOG_SIGNATURES.personSod);
  assert.match(sod, /contract\.person_id = p_actor_person_id/);
  assert.match(sod, /PERFORM tenant_iam_assert_no_sod_conflict\(related_membership_id\)/);
  assert.match(sod, /'time\.catalog\.propose','time\.catalog\.approve','time\.overtime\.post'/);
  assert.match(sod, /TIME_CATALOG_PERSON_SOD_CONFLICT/);
  const apply = functionDefinition(VERSIONED_TIME_CATALOG_SIGNATURES.apply);
  assert.match(apply, /p_command IN \('approve','reject','retire'\)[\s\S]*?TIME_CATALOG_SEPARATION_OF_DUTIES/);
});

test('guards excluyen solapamiento lógico, por contrato e intervalos semanales', () => {
  const approved = functionDefinition(VERSIONED_TIME_CATALOG_SIGNATURES.approvedOverlapGuard);
  assert.match(approved, /existing\.logical_key_hash = NEW\.logical_key_hash/);
  assert.match(approved, /TIME_CATALOG_APPROVED_OVERLAP/);
  assert.match(approved, /other\.employment_contract_id = assignment_row\.employment_contract_id/);
  assert.match(approved, /TIME_CATALOG_ASSIGNMENT_OVERLAP/);
  const intervals = functionDefinition(VERSIONED_TIME_CATALOG_SIGNATURES.intervalOverlapGuard);
  assert.match(intervals, /time_catalog_normalized_week_segments_v1\([\s\S]*?existing\.crosses_midnight/);
  assert.match(intervals, /time_catalog_normalized_week_segments_v1\([\s\S]*?NEW\.crosses_midnight/);
  assert.match(intervals, /existing_segment\.segment_start < new_segment\.segment_end/);
  assert.match(intervals, /new_segment\.segment_start < existing_segment\.segment_end/);
  assert.match(intervals, /TIME_CATALOG_SHIFT_INTERVAL_OVERLAP/);
});

test('turnos nocturnos usan crossesMidnight y solapamiento ciclico half-open', () => {
  const normalized = functionDefinition(VERSIONED_TIME_CATALOG_SIGNATURES.normalizedWeekSegments);
  assert.match(normalized, /RETURNS TABLE\(segment_start numeric, segment_end numeric\)/);
  assert.match(normalized, /604800::numeric/);
  assert.match(normalized, /UNION ALL/);
  assert.match(normalized, /p_crosses_midnight IS TRUE AND p_starts_at > p_ends_at/);

  const mondayNight = {
    day: 1, start: '22:00:00', end: '06:00:00', crossesMidnight: true,
  };
  assert.equal(weeklyIntervalsOverlap(mondayNight, {
    day: 2, start: '05:00:00', end: '07:00:00', crossesMidnight: false,
  }), true);
  assert.equal(weeklyIntervalsOverlap(mondayNight, {
    day: 2, start: '06:00:00', end: '14:00:00', crossesMidnight: false,
  }), false);
  assert.equal(weeklyIntervalsOverlap({
    day: 7, start: '22:00:00', end: '02:00:00', crossesMidnight: true,
  }, {
    day: 1, start: '01:00:00', end: '03:00:00', crossesMidnight: false,
  }), true);
  assert.equal(weeklyIntervalsOverlap({
    day: 7, start: '22:00:00', end: '02:00:00', crossesMidnight: true,
  }, {
    day: 1, start: '02:00:00', end: '06:00:00', crossesMidnight: false,
  }), false);
  assert.throws(() => normalizedWeekSegments({
    day: 1, start: '22:00:00', end: '06:00:00', crossesMidnight: false,
  }));
  assert.throws(() => normalizedWeekSegments({
    day: 1, start: '08:00:00', end: '08:00:00', crossesMidnight: true,
  }));

  const payload = functionDefinition(VERSIONED_TIME_CATALOG_SIGNATURES.payload);
  assert.match(payload, /'crossesMidnight'/);
  assert.match(payload, /left_segment\.segment_start < right_segment\.segment_end/);
  const snapshot = functionDefinition(VERSIONED_TIME_CATALOG_SIGNATURES.snapshot);
  assert.match(snapshot, /'crossesMidnight', interval\.crosses_midnight/);
  const apply = functionDefinition(VERSIONED_TIME_CATALOG_SIGNATURES.apply);
  assert.match(apply, /ends_at, crosses_midnight/);
  assert.match(apply, /item->>'crossesMidnight'/);
});

test('aprobación exige fuente homologada opcional y dependencias vigentes', () => {
  const approvable = functionDefinition(VERSIONED_TIME_CATALOG_SIGNATURES.approvable);
  assert.match(approvable, /source\.status = 'approved'/);
  assert.match(approvable, /WHEN 'calendar' THEN 'holiday_calendar'/);
  assert.match(approvable, /WHEN 'rule_profile' THEN 'municipal_rule_profile'/);
  assert.match(approvable, /ELSE 'shift_assignment'/);
  assert.match(approvable, /contract\.legacy_company_id = binding\.source_company_id/);
  assert.match(approvable, /batch\.source_database = binding\.source_database/);
  assert.match(approvable, /shift_entry\.status = 'approved'/);
  assert.match(approvable, /calendar_entry\.status = 'approved'/);
  assert.match(approvable, /rule_entry\.status = 'approved'/);
});

test('proyecciones no devuelven legajo, contrato, hashes ni localizadores de fuente', () => {
  const snapshot = functionDefinition(VERSIONED_TIME_CATALOG_SIGNATURES.snapshot);
  assert.match(snapshot, /'targetType', 'canonical_employment_contract'/);
  assert.match(snapshot, /'targetProjected', false/);
  for (const key of [
    'legajo','employmentContractId','logicalKeyHash','sourceContractId',
    'certifiedBindingId','proposerPersonId','approverPersonId','evidenceSha256',
  ]) assert.doesNotMatch(snapshot, new RegExp(`'${key}'`, 'i'));
  const principal = functionDefinition(VERSIONED_TIME_CATALOG_SIGNATURES.principal);
  for (const key of [
    'actorPersonId','sourceDatabase','sourceCompanyId','certifiedBindingId',
    'employmentContractId','membershipId','tenantId','sessionId',
  ]) assert.match(principal, new RegExp(`'${key}'`, 'i'));
});

test('evidencia instalada detecta drift estructural, SoD, overlap y ACL', () => {
  assert.doesNotThrow(() => validateVersionedTimeCatalogEvidence(installedEvidence()));
  const missingColumn = installedEvidence();
  missingColumn.tableColumns = missingColumn.tableColumns.filter(
    (row) => !(row.tableName === 'time_catalog_entry' && row.name === 'revision'),
  );
  assert.throws(() => validateVersionedTimeCatalogEvidence(missingColumn), /columnas/);
  const missingConstraint = installedEvidence();
  missingConstraint.constraints = missingConstraint.constraints.filter(
    (row) => row.name !== 'time_catalog_entry_source_contract_fk',
  );
  assert.throws(() => validateVersionedTimeCatalogEvidence(missingConstraint), /constraint/);
  for (const field of [
    'crossTenantEntries','crossTenantChildren','crossTenantEvents','makerCheckerViolations',
    'approvedOverlaps','assignmentOverlaps','approvedIncomplete','personSodViolations',
  ]) {
    const unsafe = installedEvidence();
    unsafe[field] = 1;
    assert.throws(() => validateVersionedTimeCatalogEvidence(unsafe), /invariantes/);
  }
  const publicFunction = installedEvidence();
  publicFunction.functions.find((row) => row.signature === VERSIONED_TIME_CATALOG_SIGNATURES.apply)
    .publicExecuteRevoked = false;
  assert.throws(() => validateVersionedTimeCatalogEvidence(publicFunction), /funcion insegura/);
  const brokenWeekWrap = installedEvidence();
  brokenWeekWrap.functions.find(
    (row) => row.signature === VERSIONED_TIME_CATALOG_SIGNATURES.normalizedWeekSegments,
  ).definition = functionDefinition(VERSIONED_TIME_CATALOG_SIGNATURES.normalizedWeekSegments)
    .replace('UNION ALL', '');
  assert.throws(() => validateVersionedTimeCatalogEvidence(brokenWeekWrap), /normalizacion semanal/);

  const namedRelationGrant = installedEvidence();
  namedRelationGrant.tableAcl[0].nonOwnerPrivilegeGrantees = ['legacy_auditor'];
  assert.throws(() => validateVersionedTimeCatalogEvidence(namedRelationGrant), /grantee no-owner/);

  const namedSequenceGrant = installedEvidence();
  namedSequenceGrant.sequenceAcl.push({
    name: 'time_catalog_entry_id_seq', ownedByCurrentUser: true,
    ownerIsRuntime: false, publicPrivilegesRevoked: true,
    runtimePrivilegesRevoked: true, nonOwnerPrivilegeGrantees: ['legacy_writer'],
  });
  assert.throws(() => validateVersionedTimeCatalogEvidence(namedSequenceGrant), /secuencias 011/);

});

test('runtime sólo ejecuta allowlist SECDEF y no toca relaciones o secuencias', () => {
  assert.doesNotThrow(() => validateVersionedTimeCatalogRuntimeAclEvidence(runtimeEvidence()));
  const helper = runtimeEvidence();
  helper.runtimeFunctions.push({
    signature: VERSIONED_TIME_CATALOG_SIGNATURES.normalizedWeekSegments,
  });
  assert.throws(() => validateVersionedTimeCatalogRuntimeAclEvidence(helper), /contrato/);
  const directTable = runtimeEvidence();
  directTable.relations[0].canSelect = true;
  assert.throws(() => validateVersionedTimeCatalogRuntimeAclEvidence(directTable), /privilegio directo/);
  const elevated = runtimeEvidence();
  elevated.runtimeRole.superuser = true;
  assert.throws(() => validateVersionedTimeCatalogRuntimeAclEvidence(elevated), /NOINHERIT/);
  const incomplete = runtimeEvidence();
  delete incomplete.sequences;
  assert.throws(() => validateVersionedTimeCatalogRuntimeAclEvidence(incomplete), /incompleto/);

  const neonAdminEdge = runtimeEvidence();
  neonAdminEdge.roleMemberships.push({
    direction: 'member_of_runtime', memberIsCurrentUser: true,
    adminOption: true, inheritOption: false, setOption: false,
    memberOwnsApprovedFunctions: true,
  });
  assert.doesNotThrow(() => validateVersionedTimeCatalogRuntimeAclEvidence(neonAdminEdge));

  const inheritedRuntimeEdge = runtimeEvidence();
  inheritedRuntimeEdge.roleMemberships.push({
    direction: 'granted_to_runtime', memberIsCurrentUser: false,
    adminOption: false, inheritOption: true, setOption: true,
    memberOwnsApprovedFunctions: false,
  });
  assert.throws(() => validateVersionedTimeCatalogRuntimeAclEvidence(inheritedRuntimeEdge), /arista Neon/);
});

test('aplicador exige rama aislada y hace fresh/reapply transaccional con preflight y fingerprint', () => {
  for (const version of [
    '003-action-center','004-tenant-iam-control-plane','005-tenant-identity-gateway',
    '006-tenant-action-authority','007-action-center-read-facades',
    '008-governed-overtime-actions','009-tenant-lifecycle-hardening',
    '010-governed-time-source-registry',
  ]) assert.match(applier, new RegExp(version));
  assert.match(applier, /directIsolatedDatabaseUrl\(\)/);
  assert.match(applier, /verifyTimeSourceFinalAcl\(client\)/);
  assert.match(applier, /SELECT checksum_sha256 FROM schema_migrations/);
  assert.match(applier, /versionedTimeCatalogFingerprint/);
  assert.match(applier, /await client\.query\('BEGIN'\)/);
  assert.match(applier, /pg_advisory_xact_lock/);
  assert.match(applier, /await verifyVersionedTimeCatalogFinalAcl\(client\)/);
  assert.match(migration, /time_catalog_acl_hardening[\s\S]+aclexplode/);
  assert.match(migration, /aclexplode\(attribute\.attacl\)/);
  assert.doesNotMatch(migration, /aclexplode\(COALESCE\(attribute\.attacl, '\{\}'::aclitem\[\]\)\)/);
  assert.match(applier, /aclexplode\(attribute\.attacl\)/);
  assert.doesNotMatch(applier, /aclexplode\(COALESCE\(attribute\.attacl, '\{\}'::aclitem\[\]\)\)/);
  assert.ok((applier.match(/to_json\(ARRAY\(SELECT DISTINCT COALESCE\(grantee_role\.rolname/g) || []).length >= 2);
  assert.match(applier, /await client\.query\('COMMIT'\)/);
  assert.match(applier, /await client\.query\('ROLLBACK'\)/);
  assert.match(applier, /reapply verificado/);
  assert.match(applier, /fresh apply/);
});

test('validator adversarial rechaza DML sensible, cálculo, SQL dinámico y roles heredados', () => {
  for (const unsafe of [
    'UPDATE grh_employee SET x = x;',
    'INSERT INTO payroll_run DEFAULT VALUES;',
    'DELETE FROM action_case WHERE false;',
    'UPDATE employment_contract SET status = status;',
    'DELETE FROM time_source_contract WHERE false;',
    'ALTER TABLE action_case ADD COLUMN catalog_ready boolean;',
    'ALTER ROLE municontrol_actions_runtime_app SUPERUSER;',
    "SELECT execute format('DROP TABLE %s', 'x');",
    'SELECT calculated_minutes FROM time_catalog_entry;',
  ]) assert.throws(() => validateVersionedTimeCatalogMigrationSql(`${migration}\n${unsafe}`));
  assert.throws(() => validateVersionedTimeCatalogMigrationSql(migration.replace(
    "('JUNIN_TIEMPO_CATALOGO_PROPONENTE', 'time.catalog.read')",
    "('TENANT_ADMIN', 'time.catalog.read')",
  )), /rol preexistente/);
  assert.throws(() => validateVersionedTimeCatalogMigrationSql(migration.replace(
    'crosses_midnight boolean NOT NULL DEFAULT false',
    'crosses_midnight text NOT NULL',
  )), /crosses_midnight/);
});
