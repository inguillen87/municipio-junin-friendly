import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  ATTENDANCE_DEVICE_GATEWAY_CAPABILITIES,
  ATTENDANCE_DEVICE_GATEWAY_CONSTRAINT_DEFINITION_CONTRACTS,
  ATTENDANCE_DEVICE_GATEWAY_CONSTRAINTS,
  ATTENDANCE_DEVICE_GATEWAY_CONSTRAINT_TABLES,
  ATTENDANCE_DEVICE_GATEWAY_FUNCTION_SOURCE_HASHES,
  ATTENDANCE_DEVICE_GATEWAY_INDEX_DEFINITION_CONTRACTS,
  ATTENDANCE_DEVICE_GATEWAY_INDEXES,
  ATTENDANCE_DEVICE_GATEWAY_MIGRATION_VERSION,
  ATTENDANCE_DEVICE_GATEWAY_ROLE_MATRIX,
  ATTENDANCE_DEVICE_GATEWAY_RUNTIME_ALLOWLIST,
  ATTENDANCE_DEVICE_GATEWAY_RUNTIME_FUNCTIONS,
  ATTENDANCE_DEVICE_GATEWAY_SIGNATURES,
  ATTENDANCE_DEVICE_GATEWAY_TABLES,
  attendanceDeviceGatewayFingerprint,
  resolveAttendanceDeviceGatewayTarget,
  validateAttendanceDeviceGatewayEvidence,
  validateAttendanceDeviceGatewayMigrationSql,
} from '../scripts/apply-attendance-device-gateway-schema.mjs';
import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';

const migrationUrl = new URL(
  '../scripts/migrations/022-attendance-device-gateway.sql', import.meta.url,
);
const applierUrl = new URL(
  '../scripts/apply-attendance-device-gateway-schema.mjs', import.meta.url,
);
const [migration, applier] = await Promise.all([
  readFile(migrationUrl, 'utf8'),
  readFile(applierUrl, 'utf8'),
]);

function syntheticEvidence(overrides = {}) {
  const requiredColumns = [
    ['attendance_connector', 'token_sha256'],
    ['attendance_identity_map', 'identity_hmac_sha256'],
    ['attendance_raw_event', 'identity_hmac_sha256'],
    ['attendance_raw_event', 'event_sha256'],
    ['attendance_raw_event', 'verification_result'],
    ['attendance_gateway_audit_event', 'before_snapshot'],
    ['attendance_gateway_audit_event', 'after_snapshot'],
  ];
  return {
    tables: ATTENDANCE_DEVICE_GATEWAY_TABLES.map((tableName) => ({
      tableName,
      ownerIsRuntime: false,
      publicPrivileges: false,
      runtimePrivileges: false,
      hasTenantId: true,
      tenantIdNotNull: true,
    })),
    columns: requiredColumns.map(([tableName, columnName]) => ({ tableName, columnName })),
    functions: Object.values(ATTENDANCE_DEVICE_GATEWAY_SIGNATURES).map((signature) => ({
      signature,
      securityDefiner: true,
      ownerIsRuntime: false,
      publicExecuteRevoked: true,
      config: ['search_path=public, pg_temp'],
      sourceHash: ATTENDANCE_DEVICE_GATEWAY_FUNCTION_SOURCE_HASHES[signature],
    })),
    runtimeFunctions: [...ATTENDANCE_DEVICE_GATEWAY_RUNTIME_ALLOWLIST],
    constraints: ATTENDANCE_DEVICE_GATEWAY_CONSTRAINTS.map((name) => ({
      name,
      tableName: ATTENDANCE_DEVICE_GATEWAY_CONSTRAINT_TABLES[name],
      type: name.endsWith('_pkey') ? 'p' : name.endsWith('_fk') ? 'f'
        : name.endsWith('_uk') ? 'u' : 'c',
      validated: true,
      definition: (ATTENDANCE_DEVICE_GATEWAY_CONSTRAINT_DEFINITION_CONTRACTS[name] || [])
        .join(' '),
    })),
    indexes: ATTENDANCE_DEVICE_GATEWAY_INDEXES.map((name) => ({
      name,
      tableName: ATTENDANCE_DEVICE_GATEWAY_INDEX_DEFINITION_CONTRACTS[name].tokens[0],
      unique: ATTENDANCE_DEVICE_GATEWAY_INDEX_DEFINITION_CONTRACTS[name].unique,
      valid: true,
      ready: true,
      definition: ATTENDANCE_DEVICE_GATEWAY_INDEX_DEFINITION_CONTRACTS[name].tokens.join(' '),
    })),
    triggers: [
      {
        name: 'attendance_identity_map_guard_v1',
        tableName: 'attendance_identity_map',
        functionName: 'attendance_gateway_identity_guard_v1',
        enabled: 'O',
        rowLevel: true,
        beforeTiming: true,
        insertEvent: true,
        updateEvent: true,
        deleteEvent: false,
        unconditional: true,
      },
      {
        name: 'attendance_raw_event_append_only_v1',
        tableName: 'attendance_raw_event',
        functionName: 'attendance_gateway_reject_change_v1',
        enabled: 'O',
        rowLevel: true,
        beforeTiming: true,
        insertEvent: false,
        updateEvent: true,
        deleteEvent: true,
        unconditional: true,
      },
      {
        name: 'attendance_canonical_punch_guard_v1',
        tableName: 'attendance_canonical_punch',
        functionName: 'attendance_gateway_punch_guard_v1',
        enabled: 'O',
        rowLevel: true,
        beforeTiming: true,
        insertEvent: false,
        updateEvent: true,
        deleteEvent: true,
        unconditional: true,
      },
      {
        name: 'attendance_gateway_audit_append_only_v1',
        tableName: 'attendance_gateway_audit_event',
        functionName: 'attendance_gateway_reject_change_v1',
        enabled: 'O',
        rowLevel: true,
        beforeTiming: true,
        insertEvent: false,
        updateEvent: true,
        deleteEvent: true,
        unconditional: true,
      },
    ],
    nonOwnerAcl: [],
    roles: Object.entries(ATTENDANCE_DEVICE_GATEWAY_ROLE_MATRIX).map(
      ([roleKey, capabilities]) => ({ roleKey, capabilities: [...capabilities] }),
    ),
    conflicts: [],
    ...overrides,
  };
}

test('022 fija ocho tablas privadas, ocho capacidades y cuatro fachadas runtime', () => {
  assert.equal(ATTENDANCE_DEVICE_GATEWAY_MIGRATION_VERSION, '022-attendance-device-gateway');
  assert.equal(ATTENDANCE_DEVICE_GATEWAY_TABLES.length, 8);
  assert.equal(new Set(ATTENDANCE_DEVICE_GATEWAY_TABLES).size, 8);
  assert.equal(ATTENDANCE_DEVICE_GATEWAY_CAPABILITIES.length, 8);
  assert.equal(new Set(ATTENDANCE_DEVICE_GATEWAY_CAPABILITIES).size, 8);
  assert.deepEqual(ATTENDANCE_DEVICE_GATEWAY_RUNTIME_FUNCTIONS, [
    ATTENDANCE_DEVICE_GATEWAY_SIGNATURES.bootstrap,
    ATTENDANCE_DEVICE_GATEWAY_SIGNATURES.list,
    ATTENDANCE_DEVICE_GATEWAY_SIGNATURES.apply,
    ATTENDANCE_DEVICE_GATEWAY_SIGNATURES.ingest,
  ]);
  assert.match(attendanceDeviceGatewayFingerprint(migration), /^[a-f0-9]{64}$/);
  assert.equal(validateAttendanceDeviceGatewayMigrationSql(migration), true);
  assert.ok(splitPostgresStatements(migration).length >= 75);
});

test('contrato de ingesta compara el envelope completo antes de insertar', () => {
  const ingestAt = migration.indexOf('CREATE OR REPLACE FUNCTION attendance_gateway_ingest_v1');
  const insertsAt = migration.indexOf('INSERT INTO attendance_ingest_batch', ingestAt);
  assert.ok(ingestAt >= 0 && insertsAt > ingestAt);
  const preInsert = migration.slice(ingestAt, insertsAt);
  for (const field of [
    'tenantId','driverKey','transport','deviceExternalKey','siteExternalKey','timezone','events',
  ]) assert.match(preInsert, new RegExp(`'${field}'`));
  for (const comparison of [
    /p_events->>'tenantId'[\s\S]+connector_row\.tenant_id/,
    /p_events->>'driverKey'[\s\S]+connector_row\.driver_key/,
    /p_events->>'driverKey'[\s\S]+device_row\.driver_key/,
    /p_events->>'transport' NOT IN \('pull','push'\)/,
    /WHEN 'pull' THEN device_row\.transport IN \(\s*'network_pull','removable_media','hybrid'\s*\)/,
    /WHEN 'push' THEN device_row\.transport IN \(\s*'network_push','hybrid'\s*\)/,
    /p_events->>'deviceExternalKey'[\s\S]+device_row\.external_key/,
    /p_events->>'siteExternalKey'[\s\S]+site_row\.external_key/,
    /p_events->>'timezone'[\s\S]+site_row\.timezone/,
  ]) assert.match(preInsert, comparison);
  assert.match(preInsert, /jsonb_array_length\(p_events->'events'\) NOT BETWEEN 1 AND 5000/);
  assert.match(preInsert, /ATTENDANCE_CONNECTOR_CONTEXT_MISMATCH/);
  assert.match(preInsert, /device_row\.transport = 'simulator'/);
  assert.match(preInsert, /device_row\.driver_key = 'simulator'/);
  assert.match(preInsert, /connector_row\.driver_key = 'simulator'/);
  assert.match(preInsert, /ATTENDANCE_SIMULATOR_FORBIDDEN/);
  assert.match(preInsert, /ATTENDANCE_RELEASE_NOT_CERTIFIED/);
});

test('simulador no pertenece al contrato persistente de equipos ni conectores', () => {
  const deviceAt = migration.indexOf('CREATE TABLE IF NOT EXISTS attendance_device');
  const connectorAt = migration.indexOf('CREATE TABLE IF NOT EXISTS attendance_connector');
  const identityAt = migration.indexOf('CREATE TABLE IF NOT EXISTS attendance_identity_map');
  const deviceTable = migration.slice(deviceAt, connectorAt);
  const connectorTable = migration.slice(connectorAt, identityAt);
  const transportConstraint = deviceTable.slice(
    deviceTable.indexOf('CONSTRAINT attendance_device_transport_ck'),
    deviceTable.indexOf('CONSTRAINT attendance_device_driver_ck'),
  );
  assert.doesNotMatch(transportConstraint, /simulator/);
  assert.match(deviceTable, /driver_key <> 'simulator'/);
  assert.match(connectorTable, /driver_key <> 'simulator'/);
  const applyAt = migration.indexOf('CREATE OR REPLACE FUNCTION attendance_gateway_apply_command_v1');
  const ingestAt = migration.indexOf('CREATE OR REPLACE FUNCTION attendance_gateway_ingest_v1');
  const apply = migration.slice(applyAt, ingestAt);
  assert.ok((apply.match(/ATTENDANCE_SIMULATOR_FORBIDDEN/g) || []).length >= 3);
});

test('evento crudo es minimo, inmutable e idempotente sin plantilla biometrica', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS attendance_raw_event[\s\S]+event_sha256 char\(64\)/);
  assert.match(migration, /UNIQUE \(device_id, event_key\)/);
  assert.match(migration, /UNIQUE \(device_id, event_sha256\)/);
  assert.match(migration, /attendance_raw_event_append_only_v1/);
  assert.match(migration, /verification_result varchar\(16\) NOT NULL/);
  assert.match(migration, /verification_result IN \('accepted','rejected','unknown'\)/);
  assert.match(migration, /ATTENDANCE_EVENT_DUPLICATED_IN_BATCH/);
  assert.match(migration, /ATTENDANCE_EVENT_CONFLICT/);
  assert.doesNotMatch(migration, /biometric_template|fingerprint_template|face_template|raw_user_code/i);
  assert.doesNotMatch(migration, /calculated_minutes|worked_minutes|payroll_amount|gross_amount|net_amount/i);
});

test('resultado del reloj se conserva y nunca vuelve fichada una autenticacion rechazada', () => {
  assert.match(migration, /'verificationResult'/);
  assert.match(migration, /existing\.verification_result IS DISTINCT FROM event->>'verificationResult'/);
  assert.match(migration, /event_value->>'verificationResult' = 'accepted'[\s\S]+THEN 'recorded'[\s\S]+ELSE 'pending'/);
  assert.match(migration, /raw_event\.verification_result = 'rejected'[\s\S]+ATTENDANCE_SOURCE_VERIFICATION_REJECTED/);
  assert.match(migration, /event_value->>'verificationResult'\s*\n\s*\);/);
});

test('puntos admiten coordenadas verificadas sin inventar radio de geocerca', () => {
  const siteAt = migration.indexOf('CREATE TABLE IF NOT EXISTS attendance_marking_site');
  const deviceAt = migration.indexOf('CREATE TABLE IF NOT EXISTS attendance_device');
  const siteTable = migration.slice(siteAt, deviceAt);
  assert.match(siteTable, /latitude IS NULL AND longitude IS NULL AND geofence_radius_m IS NULL/);
  assert.match(siteTable, /latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180/);
  assert.match(siteTable, /geofence_radius_m IS NULL OR geofence_radius_m BETWEEN 10 AND 2000/);
  assert.doesNotMatch(siteTable, /geofence_radius_m integer NOT NULL/);
});

test('puntos conservan domicilio opcional sin geocodificar ni inferir', () => {
  const siteAt = migration.indexOf('CREATE TABLE IF NOT EXISTS attendance_marking_site');
  const deviceAt = migration.indexOf('CREATE TABLE IF NOT EXISTS attendance_device');
  const siteTable = migration.slice(siteAt, deviceAt);
  assert.match(siteTable, /address_text varchar\(300\)/);
  assert.match(siteTable, /address_text IS NULL OR length\(btrim\(address_text\)\) BETWEEN 3 AND 300/);
  assert.ok((migration.match(/'addressText', site\.address_text/g) || []).length >= 2);
  assert.match(migration, /'networkEnabled','removableMediaEnabled','addressText'/);
  assert.match(migration, /'networkEnabled','removableMediaEnabled','status','addressText'/);
  assert.doesNotMatch(migration, /geocod|reverse.?geocod|infer.*address|address.*infer/i);
});

test('timezone queda IANA multi-tenant y se verifica contra catalogo PostgreSQL', () => {
  const ianaShape = /^[A-Za-z][A-Za-z0-9._+-]*(\/[A-Za-z0-9][A-Za-z0-9._+-]*)+$/;
  assert.equal(ianaShape.test('America/Argentina/Mendoza'), true);
  assert.equal(ianaShape.test('America/Santiago'), true);
  assert.equal(ianaShape.test('Europe/Madrid'), true);
  assert.equal(ianaShape.test('Mendoza'), false);
  assert.equal(ianaShape.test('../America/Santiago'), false);
  assert.equal(ianaShape.test('America//Santiago'), false);
  assert.match(migration, /CREATE OR REPLACE FUNCTION attendance_gateway_timezone_valid_v1/);
  assert.match(migration, /FROM pg_catalog\.pg_timezone_names zone WHERE zone\.name = p_timezone/);
  assert.ok((migration.match(/attendance_gateway_timezone_valid_v1\(/g) || []).length >= 8);
  assert.doesNotMatch(migration, /timezone_ck CHECK \(timezone = 'America\/Argentina\/Mendoza'\)/);

  const applyAt = migration.indexOf('CREATE OR REPLACE FUNCTION attendance_gateway_apply_command_v1');
  const ingestAt = migration.indexOf('CREATE OR REPLACE FUNCTION attendance_gateway_ingest_v1');
  const applyFunction = migration.slice(applyAt, ingestAt);
  const linkIdentityAt = applyFunction.indexOf("IF p_command = 'punch.link_identity' THEN");
  const linkIdentity = applyFunction.slice(linkIdentityAt);
  assert.match(linkIdentity, /JOIN attendance_device device[\s\S]+device\.tenant_id = identity_map\.tenant_id/);
  assert.match(linkIdentity, /JOIN attendance_marking_site site[\s\S]+site\.tenant_id = device\.tenant_id/);
  assert.ok((linkIdentity.match(/punch_row\.occurred_at AT TIME ZONE site\.timezone/g) || []).length >= 2);
  assert.doesNotMatch(linkIdentity, /punch_row\.occurred_at AT TIME ZONE 'America\/Argentina\/Mendoza'/);
  const bootstrapAt = migration.indexOf('CREATE OR REPLACE FUNCTION attendance_gateway_bootstrap_v1');
  const listAt = migration.indexOf('CREATE OR REPLACE FUNCTION attendance_gateway_list_v1');
  const bootstrap = migration.slice(bootstrapAt, listAt);
  assert.match(bootstrap, /SELECT DISTINCT site\.timezone/);
  assert.match(bootstrap, /'timezones', site_timezones/);
});

test('commissioning de equipo exige relevamiento antes de status active', () => {
  const deviceAt = migration.indexOf('CREATE TABLE IF NOT EXISTS attendance_device');
  const connectorAt = migration.indexOf('CREATE TABLE IF NOT EXISTS attendance_connector');
  const deviceTable = migration.slice(deviceAt, connectorAt);
  for (const column of [
    'serial_number varchar(128)', 'firmware_version varchar(120)',
    'protocol_key varchar(64)', 'network_host inet', 'network_port integer',
  ]) assert.match(deviceTable, new RegExp(column.replace(/[()]/g, '\\$&')));
  assert.match(deviceTable, /status <> 'active' OR \(/);
  assert.match(deviceTable, /serial_number IS NOT NULL AND firmware_version IS NOT NULL AND protocol_key IS NOT NULL/);
  assert.match(deviceTable, /transport NOT IN \('network_pull','network_push','hybrid'\)/);
  assert.match(deviceTable, /network_host IS NOT NULL AND network_port IS NOT NULL/);
  assert.match(deviceTable, /masklen\(network_host\) IN \(32,128\)/);
  assert.match(deviceTable, /network_port BETWEEN 1 AND 65535/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS attendance_device_tenant_vendor_serial_uk/);
  assert.match(migration, /ON attendance_device \(tenant_id, vendor_key, lower\(serial_number\)\)/);
  assert.match(migration, /WHERE serial_number IS NOT NULL/);

  const listAt = migration.indexOf('CREATE OR REPLACE FUNCTION attendance_gateway_list_v1');
  const deviceListAt = migration.indexOf("ELSIF p_resource = 'device'", listAt);
  const connectorListAt = migration.indexOf("ELSIF p_resource = 'connector'", deviceListAt);
  const deviceList = migration.slice(deviceListAt, connectorListAt);
  assert.match(deviceList, /context_value->'capabilities' \? 'attendance\.device\.manage'/);
  for (const projection of [
    /'serialNumber', device\.serial_number/,
    /'firmwareVersion', device\.firmware_version/,
    /'protocolKey', device\.protocol_key/,
    /'networkHost', host\(device\.network_host\)/,
    /'networkPort', device\.network_port/,
  ]) assert.match(deviceList, projection);
  assert.match(deviceList, /ELSE '\{\}'::jsonb/);
  assert.match(migration, /'serialNumber','firmwareVersion','protocolKey','networkHost','networkPort'/);
});

test('reintentos con otro lote no cuentan duplicados como desvinculados o ambiguos', () => {
  const ingestAt = migration.indexOf('CREATE OR REPLACE FUNCTION attendance_gateway_ingest_v1');
  const batchInsertAt = migration.indexOf('INSERT INTO attendance_ingest_batch', ingestAt);
  const countLoop = migration.slice(ingestAt, batchInsertAt);
  const loopAt = countLoop.indexOf('FOR event_value IN');
  const identityCountAt = countLoop.indexOf('SELECT count(*)', loopAt);
  const duplicateGuard = countLoop.slice(loopAt, identityCountAt);
  assert.match(duplicateGuard, /attendance_raw_event existing/);
  assert.match(duplicateGuard, /existing\.device_id = device_row\.id/);
  assert.match(duplicateGuard, /existing\.event_key = event_value->>'eventKey'/);
  assert.match(duplicateGuard, /existing\.event_sha256 = lower\(event_value->>'eventSha256'\)/);
  assert.match(duplicateGuard, /CONTINUE/);
});

test('tokens e identidades permanecen hasheados y nunca aparecen en snapshots/listados', () => {
  assert.match(migration, /token_sha256 char\(64\) NOT NULL/);
  assert.match(migration, /identity_hmac_sha256 char\(64\) NOT NULL/);
  assert.match(migration, /attendance_connector_token_ck CHECK \(token_sha256 ~ '\^\[a-f0-9\]\{64\}\$'\)/);
  const snapshotAt = migration.indexOf('CREATE OR REPLACE FUNCTION attendance_gateway_snapshot_v1');
  const bootstrapAt = migration.indexOf('CREATE OR REPLACE FUNCTION attendance_gateway_bootstrap_v1');
  const snapshot = migration.slice(snapshotAt, bootstrapAt);
  assert.doesNotMatch(snapshot, /token_sha256|identity_hmac_sha256/);
  const listAt = migration.indexOf('CREATE OR REPLACE FUNCTION attendance_gateway_list_v1');
  const applyAt = migration.indexOf('CREATE OR REPLACE FUNCTION attendance_gateway_apply_command_v1');
  assert.doesNotMatch(migration.slice(listAt, applyAt), /token_sha256|identity_hmac_sha256/);
});

test('RBAC conserva consulta, owner-operador y revisor separados', () => {
  assert.deepEqual(ATTENDANCE_DEVICE_GATEWAY_ROLE_MATRIX.CONSULTA_INTEGRAL, ['attendance.read']);
  assert.ok(ATTENDANCE_DEVICE_GATEWAY_ROLE_MATRIX.HUGO_APROBADOR_INTEGRAL.includes('attendance.review'));
  assert.equal(
    ATTENDANCE_DEVICE_GATEWAY_ROLE_MATRIX.HUGO_APROBADOR_INTEGRAL.includes('attendance.ingest'),
    false,
  );
  assert.ok(
    ATTENDANCE_DEVICE_GATEWAY_ROLE_MATRIX.PLATFORM_OWNER_OPERATIVO_INTEGRAL
      .includes('attendance.ingest'),
  );
  assert.equal(
    ATTENDANCE_DEVICE_GATEWAY_ROLE_MATRIX.PLATFORM_OWNER_OPERATIVO_INTEGRAL
      .includes('attendance.review'),
    false,
  );
  assert.match(migration, /'attendance\.ingest', 'attendance\.review'/);
  assert.match(migration, /ATTENDANCE_SEPARATION_OF_DUTIES/);
});

test('identity map y reconciliacion permanecen dentro del binding GRH certificado', () => {
  const applyAt = migration.indexOf('CREATE OR REPLACE FUNCTION attendance_gateway_apply_command_v1');
  const ingestAt = migration.indexOf('CREATE OR REPLACE FUNCTION attendance_gateway_ingest_v1');
  const apply = migration.slice(applyAt, ingestAt);
  assert.ok((apply.match(/batch\.source_database = context_value->>'sourceDatabase'/g) || []).length >= 2);
  assert.ok((apply.match(/contract\.legacy_company_id = \(context_value->>'sourceCompanyId'\)::bigint/g) || []).length >= 2);
  assert.ok((apply.match(/batch\.validation_state = 'published'/g) || []).length >= 2);
  assert.ok((apply.match(/batch\.legacy_import_run_id IS NOT NULL/g) || []).length >= 2);
  assert.match(apply, /punch_row\.review_state <> 'pending'/);
  assert.match(apply, /ATTENDANCE_PUNCH_STATE_INVALID/);
  assert.match(migration, /ATTENDANCE_IDENTITY_IMMUTABLE/);

  const ingest = migration.slice(ingestAt);
  assert.ok((ingest.match(/contract\.legacy_company_id = binding_row\.source_company_id/g) || []).length >= 2);
  assert.ok((ingest.match(/batch\.source_database = binding_row\.source_database/g) || []).length >= 2);
  assert.ok((ingest.match(/batch\.validation_state = 'published'/g) || []).length >= 2);
  assert.ok((ingest.match(/batch\.legacy_import_run_id IS NOT NULL/g) || []).length >= 2);
});

test('bootstrap declara alcance real y no simula hardware ni calculos', () => {
  const bootstrapAt = migration.indexOf('CREATE OR REPLACE FUNCTION attendance_gateway_bootstrap_v1');
  const listAt = migration.indexOf('CREATE OR REPLACE FUNCTION attendance_gateway_list_v1');
  const bootstrap = migration.slice(bootstrapAt, listAt);
  for (const key of [
    'siteCount','deviceCount','connectorCount','activeConnectorCount','rawEventCount',
    'punchCount','unmatchedPunchCount','pendingReviewCount',
  ]) assert.match(bootstrap, new RegExp(`'${key}'`));
  assert.doesNotMatch(bootstrap, /simulator/);
  assert.match(bootstrap, /last_accepted_at >= now\(\) - interval '15 minutes'/);
  assert.match(bootstrap, /'hoursCalculated', false/);
  assert.match(bootstrap, /'payrollPosted', false/);
  assert.match(bootstrap, /'biometricTemplatesStored', false/);
});

test('listado cierra NULL, pagina y auditoria con capability dedicada', () => {
  const listAt = migration.indexOf('CREATE OR REPLACE FUNCTION attendance_gateway_list_v1');
  const applyAt = migration.indexOf('CREATE OR REPLACE FUNCTION attendance_gateway_apply_command_v1');
  const list = migration.slice(listAt, applyAt);
  assert.match(list, /p_resource IS NULL OR p_page IS NULL OR p_page_size IS NULL/);
  assert.match(list, /p_resource NOT IN \('site','device','connector','punch','batch','audit'\)/);
  assert.match(list, /WHEN p_resource = 'audit' THEN 'attendance\.audit\.read'/);
  const auditBranch = list.slice(
    list.indexOf('SELECT count(*) INTO total_value FROM attendance_gateway_audit_event'),
  );
  for (const pair of [
    ["'id'", 'audit.id'], ["'targetKind'", 'audit.target_kind'],
    ["'targetId'", 'audit.target_id'], ["'actorKind'", 'audit.actor_kind'],
    ["'actorRole'", 'membership.role_key'], ["'command'", 'audit.command'],
    ["'occurredAt'", 'audit.occurred_at'],
  ]) assert.match(auditBranch, new RegExp(`${pair[0]}[\\s\\S]+${pair[1].replace('.', '\\.')}`));
  assert.match(auditBranch, /LEFT JOIN tenant_membership membership/);
  assert.match(auditBranch, /WHERE audit\.tenant_id = p_tenant_id/);
  assert.doesNotMatch(auditBranch, /actorMembershipId|connectorId|releaseSha|before_snapshot|after_snapshot|audit\.result|actor_session_id/);
});

test('idempotencia deriva hashes autoritativos dentro de PostgreSQL', () => {
  const applyAt = migration.indexOf('CREATE OR REPLACE FUNCTION attendance_gateway_apply_command_v1');
  const ingestAt = migration.indexOf('CREATE OR REPLACE FUNCTION attendance_gateway_ingest_v1');
  const apply = migration.slice(applyAt, ingestAt);
  const ingest = migration.slice(ingestAt);
  assert.match(apply, /command_hash_value := encode\(digest\(convert_to\(jsonb_build_object\(/);
  assert.match(apply, /existing_event\.command_hash IS DISTINCT FROM command_hash_value/);
  assert.match(apply, /p_idempotency_key, command_hash_value, before_value/);
  assert.match(ingest, /payload_hash_value := encode\(digest\(/);
  assert.match(ingest, /existing_batch\.payload_sha256 <> payload_hash_value/);
  assert.match(ingest, /btrim\(p_batch_key\), payload_hash_value/);
});

test('fachadas traducen el gate temporal a errores estables del gateway', () => {
  const sessionAt = migration.indexOf('CREATE OR REPLACE FUNCTION attendance_gateway_assert_session_v1');
  const snapshotAt = migration.indexOf('CREATE OR REPLACE FUNCTION attendance_gateway_snapshot_v1');
  const session = migration.slice(sessionAt, snapshotAt);
  assert.match(session, /time_source_assert_tenant_session_v1/);
  for (const mapping of [
    ['TIME_SOURCE_SESSION_INVALID', 'ATTENDANCE_SESSION_INVALID'],
    ['TIME_SOURCE_RELEASE_NOT_CERTIFIED', 'ATTENDANCE_RELEASE_NOT_CERTIFIED'],
    ['TIME_SOURCE_BINDING_REQUIRED', 'ATTENDANCE_BINDING_REQUIRED'],
    ['TIME_SOURCE_SESSION_BUSY', 'ATTENDANCE_SESSION_BUSY'],
  ]) {
    assert.match(session, new RegExp(`${mapping[0]}'[\\s\\S]+${mapping[1]}`));
  }
  assert.ok((migration.match(/attendance_gateway_assert_session_v1\(/g) || []).length >= 6);
});

test('validador SQL rechaza expansión sensible, DML canonico y drift de rol', () => {
  assert.throws(
    () => validateAttendanceDeviceGatewayMigrationSql(`${migration}\n-- password secret`),
    /material sensible/,
  );
  assert.throws(
    () => validateAttendanceDeviceGatewayMigrationSql(`${migration}\nUPDATE employment_contract SET status='active';`),
    /intenta mutar/,
  );
  assert.throws(
    () => validateAttendanceDeviceGatewayMigrationSql(migration.replace(
      "  ('CONSULTA_INTEGRAL', 'attendance.read'),\n",
      '',
    )),
    /rol 022 CONSULTA_INTEGRAL fuera de contrato/,
  );
  assert.throws(
    () => validateAttendanceDeviceGatewayMigrationSql(migration.replace(
      "'network_pull','network_push','removable_media','hybrid'",
      "'network_pull','network_push','removable_media','hybrid','simulator'",
    )),
    /transport 022 permite simulador/,
  );
  assert.throws(
    () => validateAttendanceDeviceGatewayMigrationSql(migration.replaceAll(
      " AND driver_key <> 'simulator'",
      '',
    )),
    /persistencia 022 permite driver simulador/,
  );
});

test('evidencia final exige tablas tenant-bound, funciones definer, ACL y roles exactos', () => {
  assert.equal(validateAttendanceDeviceGatewayEvidence(syntheticEvidence()), true);
  const tableAcl = syntheticEvidence();
  tableAcl.tables[0].runtimePrivileges = true;
  assert.throws(() => validateAttendanceDeviceGatewayEvidence(tableAcl), /tabla insegura/);
  const publicFunction = syntheticEvidence();
  publicFunction.functions[0].publicExecuteRevoked = false;
  assert.throws(() => validateAttendanceDeviceGatewayEvidence(publicFunction), /funcion insegura/);
  const roleDrift = syntheticEvidence();
  roleDrift.roles.find((role) => role.roleKey === 'CONSULTA_INTEGRAL')
    .capabilities.push('attendance.review');
  assert.throws(() => validateAttendanceDeviceGatewayEvidence(roleDrift), /fuera de contrato/);
  const forbiddenColumn = syntheticEvidence();
  forbiddenColumn.columns.push({ tableName: 'attendance_device', columnName: 'fingerprint_template' });
  assert.throws(() => validateAttendanceDeviceGatewayEvidence(forbiddenColumn), /columnas sensibles/);
  const functionDrift = syntheticEvidence();
  functionDrift.functions[0].sourceHash = '0'.repeat(64);
  assert.throws(() => validateAttendanceDeviceGatewayEvidence(functionDrift), /fuente de funcion/);
  const constraintDrift = syntheticEvidence();
  constraintDrift.constraints.pop();
  assert.throws(() => validateAttendanceDeviceGatewayEvidence(constraintDrift), /constraints 022/);
  const indexDrift = syntheticEvidence();
  indexDrift.indexes[0].definition = 'CREATE INDEX roto';
  assert.throws(() => validateAttendanceDeviceGatewayEvidence(indexDrift), /indice 022/);
  const triggerDrift = syntheticEvidence();
  triggerDrift.triggers[0].insertEvent = false;
  assert.throws(() => validateAttendanceDeviceGatewayEvidence(triggerDrift), /trigger 022 invalido/);
});

test('aplicador usa ledger, target Neon acreditado, transacción y verificación final', () => {
  for (const pattern of [
    /010-governed-time-source-registry\.sql/,
    /011-versioned-time-catalog\.sql/,
    /019-institutional-access-profiles\.sql/,
    /021-platform-owner-operational-integral\.sql/,
    /resolveCanonicalDatabaseTarget\(args, values\)/,
    /resolvePlatformOwnerOperationalIntegralTarget\(args, values\)/,
    /resolveAttendanceDeviceGatewayTarget\(args, process\.env\)/,
    /new Client\(\{ connectionString: target\.databaseUrl \}\)/,
    /SELECT pg_advisory_xact_lock/,
    /await client\.query\('BEGIN'\)/,
    /await client\.query\('COMMIT'\)/,
    /await client\.query\('ROLLBACK'\)/,
    /verifyNoUnledgeredObjects\(client\)/,
    /verifyAttendanceDeviceGatewayFinalState\(client\)/,
    /INSERT INTO schema_migrations/,
    /reapply verificado/,
    /fresh apply/,
  ]) assert.match(applier, pattern);

  const qaBranchId = 'br-attendance-qa';
  const qaHost = 'ep-attendance-qa.sa-east-1.aws.neon.tech';
  const qaDatabaseUrl = `postgresql://operator:secret@${qaHost}/municipio_qa?sslmode=require`;
  assert.deepEqual(resolveAttendanceDeviceGatewayTarget(['--confirm-isolated-branch'], {
    DATABASE_URL_UNPOOLED: qaDatabaseUrl,
    CANONICAL_QA_BRANCH_ID: qaBranchId,
    CANONICAL_QA_HOST: qaHost,
    CANONICAL_QA_DATABASE: 'municipio_qa',
  }), {
    mode: 'isolated', databaseUrl: qaDatabaseUrl, branchId: qaBranchId,
  });

  const productionBranchId = 'br-attendance-production';
  const productionHost = 'ep-attendance-production.sa-east-1.aws.neon.tech';
  const productionDatabaseUrl = `postgresql://operator:secret@${productionHost}/municipio?sslmode=require`;
  const productionEnv = {
    DATABASE_URL_UNPOOLED: productionDatabaseUrl,
    CANONICAL_PRODUCTION_BRANCH_ID: productionBranchId,
    CANONICAL_PRODUCTION_HOST: productionHost,
    CANONICAL_PRODUCTION_DATABASE: 'municipio',
    VERCEL_ENV: 'production',
  };
  assert.deepEqual(resolveAttendanceDeviceGatewayTarget([
    `--confirm-production-branch=${productionBranchId}`,
  ], productionEnv), {
    mode: 'production', databaseUrl: productionDatabaseUrl, branchId: productionBranchId,
  });

  assert.throws(
    () => resolveAttendanceDeviceGatewayTarget([], productionEnv),
    /confirm-isolated-branch|confirm-production-branch/,
  );
  assert.throws(
    () => resolveAttendanceDeviceGatewayTarget([
      '--confirm-production-branch=br-attendance-incorrecta',
    ], productionEnv),
    /no coincide con CANONICAL_PRODUCTION_BRANCH_ID/,
  );
  assert.throws(
    () => resolveAttendanceDeviceGatewayTarget([
      `--confirm-production-branch=${productionBranchId}`,
    ], {
      ...productionEnv,
      DATABASE_URL_UNPOOLED: productionDatabaseUrl.replace('.neon.tech', '-pooler.neon.tech'),
    }),
    /pooled/,
  );
  assert.throws(
    () => resolveAttendanceDeviceGatewayTarget(['--confirm-isolated-branch'], {
      ...productionEnv,
      CANONICAL_QA_BRANCH_ID: qaBranchId,
      CANONICAL_QA_HOST: productionHost,
      CANONICAL_QA_DATABASE: 'municipio',
      VERCEL_ENV: 'preview',
    }),
    /coincide con CANONICAL_PRODUCTION_HOST/,
  );
});
