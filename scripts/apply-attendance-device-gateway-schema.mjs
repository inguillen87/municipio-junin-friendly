import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { Client } from '@neondatabase/serverless';

import {
  resolveCanonicalDatabaseTarget,
} from './lib/canonical-import.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';
import {
  EMAIL_OTP_MFA_RUNTIME_FUNCTION_ALLOWLIST,
} from './apply-email-otp-mfa-schema.mjs';
import {
  resolvePlatformOwnerOperationalIntegralTarget,
} from './apply-platform-owner-operational-integral-schema.mjs';

export const ATTENDANCE_DEVICE_GATEWAY_MIGRATION_VERSION =
  '022-attendance-device-gateway';
export const ATTENDANCE_DEVICE_GATEWAY_CAPABILITIES = Object.freeze([
  'attendance.read',
  'attendance.audit.read',
  'attendance.site.manage',
  'attendance.device.manage',
  'attendance.connector.manage',
  'attendance.identity.manage',
  'attendance.ingest',
  'attendance.review',
]);
export const ATTENDANCE_DEVICE_GATEWAY_TABLES = Object.freeze([
  'attendance_marking_site',
  'attendance_device',
  'attendance_connector',
  'attendance_identity_map',
  'attendance_ingest_batch',
  'attendance_raw_event',
  'attendance_canonical_punch',
  'attendance_gateway_audit_event',
]);
export const ATTENDANCE_DEVICE_GATEWAY_SIGNATURES = Object.freeze({
  exactKeys: 'public.attendance_gateway_json_keys_exact_v1(jsonb,text[])',
  allowedKeys: 'public.attendance_gateway_json_keys_allowed_v1(jsonb,text[],text[])',
  eventValid: 'public.attendance_gateway_event_valid_v1(jsonb)',
  deviceCapabilities: 'public.attendance_gateway_device_capabilities_valid_v1(jsonb)',
  timezoneValid: 'public.attendance_gateway_timezone_valid_v1(text)',
  rejectChange: 'public.attendance_gateway_reject_change_v1()',
  identityGuard: 'public.attendance_gateway_identity_guard_v1()',
  punchGuard: 'public.attendance_gateway_punch_guard_v1()',
  actor: 'public.attendance_gateway_assert_actor_v1(jsonb,text)',
  session: 'public.attendance_gateway_assert_session_v1(text,uuid,integer,text,uuid,uuid)',
  snapshot: 'public.attendance_gateway_snapshot_v1(text,uuid,uuid)',
  bootstrap: 'public.attendance_gateway_bootstrap_v1(text,uuid,integer,text,uuid,uuid)',
  list: 'public.attendance_gateway_list_v1(text,uuid,integer,text,uuid,uuid,text,integer,integer)',
  apply: 'public.attendance_gateway_apply_command_v1(text,uuid,integer,text,uuid,uuid,text,uuid,text,jsonb)',
  ingest: 'public.attendance_gateway_ingest_v1(text,text,text,text,jsonb,text)',
});
export const ATTENDANCE_DEVICE_GATEWAY_RUNTIME_FUNCTIONS = Object.freeze([
  ATTENDANCE_DEVICE_GATEWAY_SIGNATURES.bootstrap,
  ATTENDANCE_DEVICE_GATEWAY_SIGNATURES.list,
  ATTENDANCE_DEVICE_GATEWAY_SIGNATURES.apply,
  ATTENDANCE_DEVICE_GATEWAY_SIGNATURES.ingest,
]);
export const ATTENDANCE_DEVICE_GATEWAY_RUNTIME_ALLOWLIST = Object.freeze([
  ...EMAIL_OTP_MFA_RUNTIME_FUNCTION_ALLOWLIST,
  ...ATTENDANCE_DEVICE_GATEWAY_RUNTIME_FUNCTIONS,
]);

export const ATTENDANCE_DEVICE_GATEWAY_ROLE_MATRIX = Object.freeze({
  CONSULTA_INTEGRAL: ['attendance.read'],
  HUGO_APROBADOR_INTEGRAL: [
    'attendance.read', 'attendance.audit.read', 'attendance.review',
  ],
  PLATFORM_OWNER_OPERATIVO_INTEGRAL: [
    'attendance.read', 'attendance.audit.read', 'attendance.site.manage',
    'attendance.device.manage', 'attendance.connector.manage',
    'attendance.identity.manage', 'attendance.ingest',
  ],
  JUNIN_ASISTENCIA_OPERADOR: [
    'attendance.read', 'attendance.audit.read', 'attendance.site.manage',
    'attendance.device.manage', 'attendance.connector.manage',
    'attendance.identity.manage', 'attendance.ingest',
  ],
  JUNIN_ASISTENCIA_REVISOR: [
    'attendance.read', 'attendance.audit.read', 'attendance.review',
  ],
});

const MIGRATION_URL = new URL(
  './migrations/022-attendance-device-gateway.sql', import.meta.url,
);
const migrationContractSource = await readFile(MIGRATION_URL, 'utf8');

function functionSourceFromMigration(sql, functionName) {
  const start = String(sql).indexOf(`CREATE OR REPLACE FUNCTION ${functionName}(`);
  if (start < 0) throw new Error(`fuente SQL 022 ausente para ${functionName}`);
  const bodyStartMarker = String(sql).indexOf('AS $$', start);
  if (bodyStartMarker < 0) throw new Error(`cuerpo SQL 022 ausente para ${functionName}`);
  const bodyStart = bodyStartMarker + 'AS $$'.length;
  const bodyEnd = String(sql).indexOf('$$;', bodyStart);
  if (bodyEnd < 0) throw new Error(`cierre SQL 022 ausente para ${functionName}`);
  return String(sql).slice(bodyStart, bodyEnd);
}

export function attendanceDeviceGatewayFunctionSourceFingerprint(source) {
  const canonical = String(source || '').replace(/\r\n?/g, '\n').trim();
  return createHash('sha256').update(canonical).digest('hex');
}

export const ATTENDANCE_DEVICE_GATEWAY_FUNCTION_SOURCE_HASHES = Object.freeze(
  Object.fromEntries(Object.values(ATTENDANCE_DEVICE_GATEWAY_SIGNATURES).map((signature) => {
    const functionName = signature.match(/^public\.([a-z0-9_]+)\(/)?.[1];
    return [signature, attendanceDeviceGatewayFunctionSourceFingerprint(
      functionSourceFromMigration(migrationContractSource, functionName),
    )];
  })),
);

function tableDefinitionFromMigration(sql, table) {
  const start = String(sql).indexOf(`CREATE TABLE IF NOT EXISTS ${table} (`);
  const end = String(sql).indexOf('\n);', start);
  if (start < 0 || end < 0) throw new Error(`tabla 022 no parseable ${table}`);
  return String(sql).slice(start, end);
}

function inlineForeignKeyName(tableName, columnName) {
  const name = `${tableName}_${columnName}_fkey`;
  if (Buffer.byteLength(name, 'utf8') > 63) {
    throw new Error(`FK inline 022 requiere CONSTRAINT explícita ${tableName}.${columnName}`);
  }
  return name;
}

function inlineForeignKeysFromMigration(sql) {
  const result = [];
  const names = new Set();
  for (const tableName of ATTENDANCE_DEVICE_GATEWAY_TABLES) {
    const definition = tableDefinitionFromMigration(sql, tableName);
    for (const match of definition.matchAll(
      /^\s*(?!CONSTRAINT\b)([a-z0-9_]+)\s+[^,\n]*?\bREFERENCES\s+([a-z0-9_]+)\s*\(([^)]+)\)\s+ON\s+DELETE\s+RESTRICT\s*,?\s*$/gim,
    )) {
      const columnName = match[1].toLowerCase();
      const name = inlineForeignKeyName(tableName, columnName);
      if (names.has(name)) throw new Error(`FK inline 022 duplicada ${name}`);
      names.add(name);
      result.push(Object.freeze({
        name,
        tableName,
        columnName,
        referencedTable: match[2].toLowerCase(),
        referencedColumns: match[3].replace(/\s+/g, ' ').trim().toLowerCase(),
      }));
    }
  }
  return Object.freeze(result);
}

const ATTENDANCE_DEVICE_GATEWAY_INLINE_FOREIGN_KEYS =
  inlineForeignKeysFromMigration(migrationContractSource);

export const ATTENDANCE_DEVICE_GATEWAY_CONSTRAINTS = Object.freeze([
  ...new Set([
    ...ATTENDANCE_DEVICE_GATEWAY_TABLES.map((table) => `${table}_pkey`),
    ...ATTENDANCE_DEVICE_GATEWAY_INLINE_FOREIGN_KEYS.map(({ name }) => name),
    ...[...migrationContractSource.matchAll(/\bCONSTRAINT\s+(?!IF\b)([a-z0-9_]+)/gi)]
      .map((match) => match[1].toLowerCase()),
  ]),
].sort());

function constraintTablesFromMigration(sql) {
  const result = {};
  for (const table of ATTENDANCE_DEVICE_GATEWAY_TABLES) {
    const definition = tableDefinitionFromMigration(sql, table);
    result[`${table}_pkey`] = table;
    for (const match of definition.matchAll(
      /\bCONSTRAINT\s+([a-z0-9_]+)/gi,
    )) result[match[1].toLowerCase()] = table;
  }
  for (const foreignKey of inlineForeignKeysFromMigration(sql)) {
    result[foreignKey.name] = foreignKey.tableName;
  }
  for (const match of String(sql).matchAll(
    /ALTER\s+TABLE\s+([a-z0-9_]+)\s+ADD\s+CONSTRAINT\s+([a-z0-9_]+)/gi,
  )) result[match[2].toLowerCase()] = match[1].toLowerCase();
  return result;
}

export const ATTENDANCE_DEVICE_GATEWAY_CONSTRAINT_TABLES = Object.freeze(
  constraintTablesFromMigration(migrationContractSource),
);

export const ATTENDANCE_DEVICE_GATEWAY_INDEXES = Object.freeze(
  [...migrationContractSource.matchAll(
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s+([a-z0-9_]+)/gi,
  )].map((match) => match[1].toLowerCase()).sort(),
);

const DERIVED_CONSTRAINT_DEFINITION_CONTRACTS = {};
for (const table of ATTENDANCE_DEVICE_GATEWAY_TABLES) {
  DERIVED_CONSTRAINT_DEFINITION_CONTRACTS[`${table}_pkey`] = ['primary key (id)'];
}
for (const match of migrationContractSource.matchAll(
  /CONSTRAINT\s+([a-z0-9_]+)\s+UNIQUE\s*\(([^)]+)\)/gi,
)) {
  DERIVED_CONSTRAINT_DEFINITION_CONTRACTS[match[1].toLowerCase()] = [
    `unique (${match[2].replace(/\s+/g, ' ').trim()})`,
  ];
}
for (const match of migrationContractSource.matchAll(
  /CONSTRAINT\s+([a-z0-9_]+)\s+FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+([a-z0-9_]+)\s*\(([^)]+)\)\s+ON\s+DELETE\s+RESTRICT/gi,
)) {
  DERIVED_CONSTRAINT_DEFINITION_CONTRACTS[match[1].toLowerCase()] = [
    `foreign key (${match[2].replace(/\s+/g, ' ').trim()})`,
    `references ${match[3]}(${match[4].replace(/\s+/g, ' ').trim()})`,
    'on delete restrict',
  ];
}
for (const foreignKey of ATTENDANCE_DEVICE_GATEWAY_INLINE_FOREIGN_KEYS) {
  DERIVED_CONSTRAINT_DEFINITION_CONTRACTS[foreignKey.name] = [
    `foreign key (${foreignKey.columnName})`,
    `references ${foreignKey.referencedTable}(${foreignKey.referencedColumns})`,
    'on delete restrict',
  ];
}

export const ATTENDANCE_DEVICE_GATEWAY_CONSTRAINT_DEFINITION_CONTRACTS = Object.freeze({
  ...DERIVED_CONSTRAINT_DEFINITION_CONTRACTS,
  attendance_marking_site_coordinates_ck: [
    'latitude is null', 'longitude is null', 'geofence_radius_m is null',
    'latitude >=', 'latitude <=', 'longitude >=', 'longitude <=',
    'geofence_radius_m >=', 'geofence_radius_m <=',
  ],
  attendance_connector_token_ck: ['token_sha256', '^[a-f0-9]{64}$'],
  attendance_identity_map_hmac_ck: ['identity_hmac_sha256', '^[a-f0-9]{64}$'],
  attendance_ingest_batch_counts_ck: [
    'event_count', '5000', 'accepted_count', 'duplicate_count',
    'unmapped_count', 'ambiguous_count',
  ],
  attendance_canonical_punch_mapping_ck: [
    'reconciliation_state', 'mapped', 'identity_map_id', 'employment_contract_id',
  ],
  attendance_canonical_punch_review_ck: [
    'review_state', 'recorded', 'pending', 'accepted', 'rejected',
    'review_reason_code', 'reviewed_by_membership_id', 'reviewed_at',
  ],
  attendance_gateway_audit_actor_ck: [
    'actor_kind', 'membership', 'connector', 'actor_membership_id',
    'actor_session_id', 'connector_id',
  ],
  attendance_canonical_punch_accept_mapped_ck: [
    'review_state', 'accepted', 'reconciliation_state', 'mapped',
  ],
  attendance_canonical_punch_fact_ck: [
    'method', 'fingerprint', 'card', 'pin', 'face', 'mobile', 'manual', 'unknown',
    'direction', 'in', 'out',
  ],
  attendance_canonical_punch_reconciliation_ck: [
    'reconciliation_state', 'mapped', 'unmapped', 'ambiguous',
  ],
  attendance_canonical_punch_version_ck: ['version', '0'],
  attendance_connector_driver_ck: [
    'driver_key', '^[a-z0-9][a-z0-9._-]{2,95}$', '<>', 'simulator',
  ],
  attendance_connector_external_ck: ['external_key', '^[a-z0-9][a-z0-9._-]{7,127}$'],
  attendance_connector_status_ck: ['status', 'active', 'suspended', 'retired'],
  attendance_connector_version_ck: ['version', 'token_version', '0'],
  attendance_device_capabilities_ck: [
    'attendance_gateway_device_capabilities_valid_v1(capabilities)',
  ],
  attendance_device_activation_ck: [
    'status', 'active', 'serial_number', 'firmware_version', 'protocol_key',
    'network_pull', 'network_push', 'hybrid', 'network_host', 'network_port',
  ],
  attendance_device_driver_ck: [
    'driver_key', '^[a-z0-9][a-z0-9._-]{2,95}$', '<>', 'simulator',
  ],
  attendance_device_external_ck: ['external_key', '^[a-z0-9][a-z0-9._-]{1,95}$'],
  attendance_device_firmware_ck: ['firmware_version', 'length(btrim(firmware_version))', '1', '120'],
  attendance_device_model_ck: ['length(btrim(model))', '1', '120'],
  attendance_device_network_host_ck: ['network_host', 'masklen(network_host)', '32', '128'],
  attendance_device_network_port_ck: ['network_port', '1', '65535'],
  attendance_device_protocol_ck: ['protocol_key', '^[a-z0-9][a-z0-9._-]{1,63}$'],
  attendance_device_serial_ck: ['serial_number', 'length(btrim(serial_number))', '1', '128'],
  attendance_device_status_ck: ['status', 'draft', 'active', 'offline', 'suspended', 'retired'],
  attendance_device_timezone_ck: ['timezone', '^[A-Za-z]', '/[A-Za-z0-9]'],
  attendance_device_transport_ck: [
    'transport', 'network_pull', 'network_push', 'removable_media', 'hybrid',
  ],
  attendance_device_vendor_ck: ['vendor_key', '^[a-z0-9][a-z0-9._-]{1,63}$'],
  attendance_device_version_ck: ['version', '0'],
  attendance_gateway_audit_hash_ck: [
    'release_sha', '^[a-f0-9]{40}$', 'command_hash', '^[a-f0-9]{64}$',
  ],
  attendance_gateway_audit_json_ck: [
    'jsonb_typeof(before_snapshot)', 'jsonb_typeof(after_snapshot)',
    'jsonb_typeof(result)', 'object',
  ],
  attendance_gateway_audit_target_ck: [
    'target_kind', 'site', 'device', 'connector', 'identity', 'punch', 'batch',
  ],
  attendance_identity_map_dates_ck: ['valid_to', 'valid_from'],
  attendance_identity_map_state_ck: ['status', 'active', 'revoked', 'revoked_at'],
  attendance_identity_map_status_ck: ['status', 'active', 'revoked'],
  attendance_identity_map_version_ck: ['version', '0'],
  attendance_ingest_batch_hash_ck: [
    'payload_sha256', '^[a-f0-9]{64}$', 'release_sha', '^[a-f0-9]{40}$',
  ],
  attendance_ingest_batch_key_ck: ['length(btrim(batch_key))', '1', '160'],
  attendance_ingest_batch_status_ck: ['status', 'accepted'],
  attendance_marking_site_external_ck: ['external_key', '^[a-z0-9][a-z0-9._-]{1,95}$'],
  attendance_marking_site_address_ck: ['address_text', 'length(btrim(address_text))', '3', '300'],
  attendance_marking_site_label_ck: ['length(btrim(label))', '2', '180'],
  attendance_marking_site_status_ck: ['status', 'draft', 'active', 'suspended', 'retired'],
  attendance_marking_site_timezone_ck: ['timezone', '^[A-Za-z]', '/[A-Za-z0-9]'],
  attendance_marking_site_transport_ck: ['network_enabled', 'removable_media_enabled'],
  attendance_marking_site_version_ck: ['version', '0'],
  attendance_raw_event_direction_ck: ['direction', 'in', 'out', 'unknown'],
  attendance_raw_event_hashes_ck: [
    'event_sha256', '^[a-f0-9]{64}$', 'identity_hmac_sha256',
  ],
  attendance_raw_event_key_ck: ['length(btrim(event_key))', '1', '160'],
  attendance_raw_event_method_ck: [
    'method', 'fingerprint', 'card', 'pin', 'face', 'mobile', 'manual', 'unknown',
  ],
  attendance_raw_event_verification_ck: [
    'verification_result', 'accepted', 'rejected', 'unknown',
  ],
});

export const ATTENDANCE_DEVICE_GATEWAY_INDEX_DEFINITION_CONTRACTS = Object.freeze({
  attendance_site_tenant_status_idx: {
    unique: false, tokens: ['attendance_marking_site', 'tenant_id', 'status', 'label', 'id'],
  },
  attendance_device_tenant_site_idx: {
    unique: false, tokens: ['attendance_device', 'tenant_id', 'site_id', 'status', 'id'],
  },
  attendance_device_tenant_vendor_serial_uk: {
    unique: true, tokens: [
      'attendance_device', 'tenant_id', 'vendor_key', 'lower', 'serial_number',
      'where', 'serial_number', 'is not null',
    ],
  },
  attendance_identity_lookup_idx: {
    unique: false, tokens: [
      'attendance_identity_map', 'tenant_id', 'device_id', 'identity_hmac_sha256',
      'valid_from', 'valid_to', 'where', 'status', 'active',
    ],
  },
  attendance_batch_tenant_received_idx: {
    unique: false, tokens: ['attendance_ingest_batch', 'tenant_id', 'received_at', 'id'],
  },
  attendance_raw_tenant_time_idx: {
    unique: false, tokens: ['attendance_raw_event', 'tenant_id', 'occurred_at', 'id'],
  },
  attendance_punch_tenant_time_idx: {
    unique: false, tokens: ['attendance_canonical_punch', 'tenant_id', 'occurred_at', 'id'],
  },
  attendance_punch_review_idx: {
    unique: false, tokens: [
      'attendance_canonical_punch', 'tenant_id', 'review_state', 'occurred_at', 'id',
    ],
  },
  attendance_audit_tenant_timeline_idx: {
    unique: false, tokens: ['attendance_gateway_audit_event', 'tenant_id', 'occurred_at', 'id'],
  },
  attendance_audit_membership_idempotency_uk: {
    unique: true, tokens: [
      'attendance_gateway_audit_event', 'tenant_id', 'actor_membership_id',
      'idempotency_key', 'where', 'actor_kind', 'membership',
    ],
  },
  attendance_audit_connector_idempotency_uk: {
    unique: true, tokens: [
      'attendance_gateway_audit_event', 'tenant_id', 'connector_id',
      'idempotency_key', 'where', 'actor_kind', 'connector',
    ],
  },
});
const PREREQUISITES = Object.freeze([
  ['010-governed-time-source-registry', new URL(
    './migrations/010-governed-time-source-registry.sql', import.meta.url,
  )],
  ['011-versioned-time-catalog', new URL(
    './migrations/011-versioned-time-catalog.sql', import.meta.url,
  )],
  ['019-institutional-access-profiles', new URL(
    './migrations/019-institutional-access-profiles.sql', import.meta.url,
  )],
  ['021-platform-owner-operational-integral', new URL(
    './migrations/021-platform-owner-operational-integral.sql', import.meta.url,
  )],
]);
const RUNTIME_ROLE = 'municontrol_actions_runtime_app';
const EXPECTED_TRIGGERS = Object.freeze({
  attendance_identity_map_guard_v1: {
    tableName: 'attendance_identity_map', functionName: 'attendance_gateway_identity_guard_v1',
    insertEvent: true, updateEvent: true, deleteEvent: false,
  },
  attendance_raw_event_append_only_v1: {
    tableName: 'attendance_raw_event', functionName: 'attendance_gateway_reject_change_v1',
    insertEvent: false, updateEvent: true, deleteEvent: true,
  },
  attendance_canonical_punch_guard_v1: {
    tableName: 'attendance_canonical_punch', functionName: 'attendance_gateway_punch_guard_v1',
    insertEvent: false, updateEvent: true, deleteEvent: true,
  },
  attendance_gateway_audit_append_only_v1: {
    tableName: 'attendance_gateway_audit_event', functionName: 'attendance_gateway_reject_change_v1',
    insertEvent: false, updateEvent: true, deleteEvent: true,
  },
});

function rows(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function normalized(value) {
  return String(value || '').replaceAll('"', '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function exactSet(actual, expected, label) {
  const got = [...new Set(actual || [])].map(String).sort();
  const wanted = [...new Set(expected || [])].map(String).sort();
  if (got.length !== (actual || []).length
      || JSON.stringify(got) !== JSON.stringify(wanted)) {
    throw new Error(`${label} fuera de contrato: ${JSON.stringify(got)}`);
  }
}

function requireTokens(label, value, required) {
  const body = normalized(value);
  for (const token of required) {
    if (!body.includes(normalized(token))) throw new Error(`${label} no contiene ${token}`);
  }
}

function parsedRoleMatrix(sql) {
  const matrix = Object.fromEntries(
    Object.keys(ATTENDANCE_DEVICE_GATEWAY_ROLE_MATRIX).map((role) => [role, []]),
  );
  const grantBlock = String(sql || '').match(
    /INSERT\s+INTO\s+public\.iam_role_capability\s*\(\s*role_key\s*,\s*capability_key\s*\)\s*VALUES([\s\S]*?)ON\s+CONFLICT\s*\(\s*role_key\s*,\s*capability_key\s*\)\s*DO\s+NOTHING\s*;/i,
  )?.[1] ?? '';
  for (const match of grantBlock.matchAll(
    /\(\s*'([A-Z][A-Z0-9_]+)'\s*,\s*'(attendance\.[a-z0-9_.]+)'\s*\)/g,
  )) {
    if (matrix[match[1]]) matrix[match[1]].push(match[2]);
  }
  return matrix;
}

export function attendanceDeviceGatewayFingerprint(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function validateAttendanceDeviceGatewayMigrationSql(sql) {
  const source = String(sql || '');
  const compact = normalized(source);
  requireTokens('migracion 022', source, [
    ...ATTENDANCE_DEVICE_GATEWAY_TABLES.map((table) => `create table if not exists ${table}`),
    "'attendance.read'", "'attendance.audit.read'", "'attendance.site.manage'",
    "'attendance.device.manage'", "'attendance.connector.manage'",
    "'attendance.identity.manage'", "'attendance.ingest'", "'attendance.review'",
    "'attendance.ingest', 'attendance.review'",
    "'junin_asistencia_operador'", "'junin_asistencia_revisor'",
    'token_sha256 char(64)', 'identity_hmac_sha256 char(64)',
    'verification_result varchar(16)',
    'address_text varchar(300)', 'serial_number varchar(128)',
    'firmware_version varchar(120)', 'protocol_key varchar(64)',
    'network_host inet', 'network_port integer',
    'attendance_device_activation_ck', "status <> 'active'",
    'attendance_device_tenant_vendor_serial_uk', 'lower(serial_number)',
    'attendance_raw_event_append_only_v1', 'attendance_gateway_audit_append_only_v1',
    'attendance_identity_immutable', 'attendance_punch_state_invalid',
    'time_source_assert_tenant_session_v1', 'attendance_gateway_assert_session_v1',
    'attendance_gateway_timezone_valid_v1', 'pg_catalog.pg_timezone_names',
    'tenant_iam_effective_capabilities',
    'for update nowait', 'pg_advisory_xact_lock',
    'attendance_idempotency_reused', 'attendance_event_conflict',
    'attendance_connector_context_mismatch', 'attendance_simulator_forbidden',
    'attendance_source_verification_rejected', "'verificationresult'",
    "'tenantid','driverkey','transport','deviceexternalkey'",
    "'siteexternalkey','timezone','events'",
    "p_events->>'tenantid'", "p_events->>'driverkey'",
    "p_events->>'deviceexternalkey'", "p_events->>'siteexternalkey'",
    "p_events->>'transport'", "p_events->>'timezone'",
    "p_events->>'transport' not in ('pull','push')",
    "not attendance_gateway_timezone_valid_v1(p_events->>'timezone')",
    "when 'pull' then device_row.transport in",
    "when 'push' then device_row.transport in",
    "'hardwareconnected'", "'hourscalculated', false",
    "'payrollposted', false", "'biometrictemplatesstored', false",
    "interval '15 minutes'",
    "p_resource is null or p_page is null or p_page_size is null",
    "'site','device','connector','punch','batch','audit'",
    "when p_resource = 'audit' then 'attendance.audit.read'",
    'from attendance_gateway_audit_event audit',
    'command_hash_value := encode(digest(convert_to(jsonb_build_object(',
    'existing_event.command_hash is distinct from command_hash_value',
    'payload_hash_value := encode(digest(',
    'existing_batch.payload_sha256 <> payload_hash_value',
    'revoke all privileges on table attendance_marking_site',
  ]);
  const transportConstraint = compact.match(
    /constraint attendance_device_transport_ck check \(([^)]*)\)/,
  )?.[1];
  if (!transportConstraint || transportConstraint.includes('simulator')) {
    throw new Error('transport 022 permite simulador');
  }
  if ((compact.match(/driver_key <> 'simulator'/g) || []).length < 4) {
    throw new Error('persistencia 022 permite driver simulador');
  }
  for (const command of [
    'site.create','site.update','device.create','device.update',
    'connector.create','connector.rotate_token','connector.update',
    'identity.create','identity.revoke','punch.link_identity','punch.accept','punch.reject',
  ]) {
    if (!compact.includes(`'${command}'`)) throw new Error(`falta comando 022 ${command}`);
  }
  for (const [role, expected] of Object.entries(ATTENDANCE_DEVICE_GATEWAY_ROLE_MATRIX)) {
    exactSet(parsedRoleMatrix(source)[role], expected, `rol 022 ${role}`);
  }
  exactSet(
    [...source.matchAll(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+(attendance_gateway_[a-z0-9_]+)\s*\(/gi)]
      .map((match) => match[1].toLowerCase()),
    ATTENDANCE_DEVICE_GATEWAY_RUNTIME_FUNCTIONS.map(
      (signature) => signature.match(/public\.([a-z0-9_]+)\(/)?.[1],
    ),
    'grants runtime 022',
  );
  if (/\b(?:password|secret|biometric_template|fingerprint_template|face_template|raw_user_code)\b/i.test(source)
      || /\b(?:calculated_minutes|worked_minutes|payroll_amount|gross_amount|net_amount)\b/i.test(source)
      || /guillen|gmail\.com|marcelo@|hugo@|admin@/i.test(source)) {
    throw new Error('022 contiene material sensible, biometria, calculo o identidad concreta');
  }
  if (/\b(?:insert\s+into|update|delete\s+from|truncate(?:\s+table)?)\s+(?:public\.)?(?:grh_[a-z0-9_]*|payroll_[a-z0-9_]*|action_case(?:_event|_context)?|employment_contract|source_import_batch|time_catalog_|time_source_)/i.test(source)) {
    throw new Error('022 intenta mutar GRH, nomina, action center o fuentes gobernadas');
  }
  const ingestStart = compact.indexOf('create or replace function attendance_gateway_ingest_v1');
  const roleContractStart = compact.indexOf('do $attendance_gateway_role_contract$', ingestStart);
  if (!(ingestStart >= 0 && roleContractStart > ingestStart)) {
    throw new Error('ingest 022 ausente o fuera de orden');
  }
  requireTokens('ingest 022', compact.slice(ingestStart, roleContractStart), [
    "connector_row.token_sha256 <> lower(p_token_sha256)",
    "device_row.transport = 'simulator'",
    "device_row.driver_key = 'simulator'",
    "connector_row.driver_key = 'simulator'",
    "policy.tenant_data_plane_ready is true",
    "lower(policy.certified_release_sha) = lower(p_release_sha)",
    "jsonb_array_length(p_events->'events') not between 1 and 5000",
    'attendance_gateway_event_valid_v1',
    'attendance_identity_map identity_map',
    'contract.legacy_company_id = binding_row.source_company_id',
    'batch.source_database = binding_row.source_database',
    "batch.validation_state = 'published'",
    'batch.legacy_import_run_id is not null',
    'insert into attendance_raw_event', 'insert into attendance_canonical_punch',
    'insert into attendance_ingest_batch', 'insert into attendance_gateway_audit_event',
  ]);
  return true;
}

export function validateAttendanceDeviceGatewayEvidence(evidence) {
  exactSet(
    (evidence?.tables || []).map((table) => table.tableName),
    ATTENDANCE_DEVICE_GATEWAY_TABLES,
    'tablas 022',
  );
  for (const table of evidence?.tables || []) {
    if (table.ownerIsRuntime === true || table.publicPrivileges === true
        || table.runtimePrivileges === true || table.hasTenantId !== true
        || table.tenantIdNotNull !== true) {
      throw new Error(`tabla insegura 022 ${table.tableName}`);
    }
  }
  const forbiddenColumns = (evidence?.columns || []).filter((column) => (
    /(?:password|secret|template|raw_identity|raw_user|plain_token)/i.test(column.columnName)
  ));
  if (forbiddenColumns.length) throw new Error('columnas sensibles prohibidas en 022');
  const requiredColumns = new Set(
    (evidence?.columns || []).map((column) => `${column.tableName}.${column.columnName}`),
  );
  for (const required of [
    'attendance_connector.token_sha256',
    'attendance_identity_map.identity_hmac_sha256',
    'attendance_raw_event.identity_hmac_sha256',
    'attendance_raw_event.event_sha256',
    'attendance_raw_event.verification_result',
    'attendance_gateway_audit_event.before_snapshot',
    'attendance_gateway_audit_event.after_snapshot',
  ]) {
    if (!requiredColumns.has(required)) throw new Error(`columna requerida ausente ${required}`);
  }

  exactSet(
    (evidence?.functions || []).map((fn) => fn.signature),
    Object.values(ATTENDANCE_DEVICE_GATEWAY_SIGNATURES),
    'funciones 022',
  );
  for (const fn of evidence?.functions || []) {
    if (fn.securityDefiner !== true || fn.ownerIsRuntime === true
        || fn.publicExecuteRevoked !== true
        || !(fn.config || []).map(normalized).includes('search_path=public, pg_temp')) {
      throw new Error(`funcion insegura 022 ${fn.signature}`);
    }
    if (fn.sourceHash !== ATTENDANCE_DEVICE_GATEWAY_FUNCTION_SOURCE_HASHES[fn.signature]) {
      throw new Error(`fuente de funcion 022 con drift ${fn.signature}`);
    }
  }
  exactSet(evidence?.runtimeFunctions, ATTENDANCE_DEVICE_GATEWAY_RUNTIME_ALLOWLIST,
    'allowlist runtime acumulada 022');

  exactSet((evidence?.constraints || []).map((row) => row.name),
    ATTENDANCE_DEVICE_GATEWAY_CONSTRAINTS, 'constraints 022');
  for (const constraint of evidence?.constraints || []) {
    const expectedType = constraint.name.endsWith('_pkey') ? 'p'
      : constraint.name.endsWith('_fk') || constraint.name.endsWith('_fkey') ? 'f'
        : constraint.name.endsWith('_uk') ? 'u'
          : constraint.name.endsWith('_ck') ? 'c' : null;
    if (!expectedType || constraint.type !== expectedType || constraint.validated !== true
        || constraint.tableName
          !== ATTENDANCE_DEVICE_GATEWAY_CONSTRAINT_TABLES[constraint.name]) {
      throw new Error(`constraint 022 invalida ${constraint.name}`);
    }
    requireTokens(`constraint 022 ${constraint.name}`, constraint.definition,
      ATTENDANCE_DEVICE_GATEWAY_CONSTRAINT_DEFINITION_CONTRACTS[constraint.name] || []);
    if (constraint.name === 'attendance_device_transport_ck'
        && normalized(constraint.definition).includes('simulator')) {
      throw new Error('constraint 022 permite transport simulador');
    }
  }

  exactSet((evidence?.indexes || []).map((row) => row.name),
    ATTENDANCE_DEVICE_GATEWAY_INDEXES, 'indices 022');
  for (const index of evidence?.indexes || []) {
    const contract = ATTENDANCE_DEVICE_GATEWAY_INDEX_DEFINITION_CONTRACTS[index.name];
    if (!contract || index.unique !== contract.unique
        || index.valid !== true || index.ready !== true
        || index.tableName !== contract.tokens[0]) {
      throw new Error(`indice 022 invalido ${index.name}`);
    }
    requireTokens(`indice 022 ${index.name}`, index.definition, contract.tokens);
  }

  exactSet((evidence?.triggers || []).map((trigger) => trigger.name),
    Object.keys(EXPECTED_TRIGGERS), 'triggers 022');
  for (const trigger of evidence?.triggers || []) {
    const expected = EXPECTED_TRIGGERS[trigger.name];
    if (!expected || trigger.tableName !== expected.tableName
        || trigger.functionName !== expected.functionName
        || trigger.enabled !== 'O' || trigger.rowLevel !== true
        || trigger.beforeTiming !== true || trigger.unconditional !== true
        || trigger.insertEvent !== expected.insertEvent
        || trigger.updateEvent !== expected.updateEvent
        || trigger.deleteEvent !== expected.deleteEvent) {
      throw new Error(`trigger 022 invalido ${trigger.name}`);
    }
  }
  if ((evidence?.nonOwnerAcl || []).length) {
    throw new Error('ACL directa detectada en tablas 022');
  }

  const roleMap = Object.fromEntries(
    (evidence?.roles || []).map((role) => [role.roleKey, role.capabilities]),
  );
  exactSet(Object.keys(roleMap), Object.keys(ATTENDANCE_DEVICE_GATEWAY_ROLE_MATRIX), 'roles 022');
  for (const [role, expected] of Object.entries(ATTENDANCE_DEVICE_GATEWAY_ROLE_MATRIX)) {
    exactSet(roleMap[role], expected, `capacidades attendance ${role}`);
  }
  if ((evidence?.conflicts || []).length) throw new Error('SoD 022 incumplida');
  return true;
}

async function collectEvidence(client) {
  const tablesResult = await client.query(`
    SELECT relation.relname AS "tableName",
      relation.relowner = (SELECT oid FROM pg_roles WHERE rolname = $2) AS "ownerIsRuntime",
      EXISTS (
        SELECT 1 FROM aclexplode(COALESCE(
          relation.relacl, acldefault('r', relation.relowner)
        )) grants WHERE grants.grantee = 0
      ) AS "publicPrivileges",
      has_table_privilege($2, relation.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        AS "runtimePrivileges",
      EXISTS (SELECT 1 FROM pg_attribute attribute
        WHERE attribute.attrelid = relation.oid AND attribute.attname = 'tenant_id'
          AND attribute.attnum > 0 AND attribute.attisdropped IS FALSE) AS "hasTenantId",
      COALESCE((SELECT attribute.attnotnull FROM pg_attribute attribute
        WHERE attribute.attrelid = relation.oid AND attribute.attname = 'tenant_id'
          AND attribute.attnum > 0 AND attribute.attisdropped IS FALSE), false) AS "tenantIdNotNull"
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relkind = 'r'
      AND relation.relname = ANY($1::text[])
    ORDER BY relation.relname
  `, [ATTENDANCE_DEVICE_GATEWAY_TABLES, RUNTIME_ROLE]);
  const columnsResult = await client.query(`
    SELECT table_name AS "tableName", column_name AS "columnName"
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ANY($1::text[])
    ORDER BY table_name, ordinal_position
  `, [ATTENDANCE_DEVICE_GATEWAY_TABLES]);
  const functionsResult = await client.query(`
    SELECT format('%s.%s(%s)', namespace.nspname, function_row.proname,
      replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature,
      function_row.prosecdef AS "securityDefiner",
      function_row.proowner = (SELECT oid FROM pg_roles WHERE rolname = $1) AS "ownerIsRuntime",
      NOT EXISTS (
        SELECT 1 FROM aclexplode(COALESCE(
          function_row.proacl, acldefault('f', function_row.proowner)
        )) grants
        WHERE grants.grantee = 0 AND grants.privilege_type = 'EXECUTE'
      ) AS "publicExecuteRevoked",
      COALESCE(function_row.proconfig, ARRAY[]::text[]) AS config,
      function_row.prosrc AS "sourceBody"
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    WHERE namespace.nspname = 'public'
      AND function_row.proname LIKE 'attendance_gateway_%_v1'
    ORDER BY signature
  `, [RUNTIME_ROLE]);
  const runtimeFunctionsResult = await client.query(`
    SELECT format('%s.%s(%s)', namespace.nspname, function_row.proname,
      replace(oidvectortypes(function_row.proargtypes), ', ', ',')) AS signature
    FROM pg_proc function_row
    JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
    WHERE namespace.nspname = 'public' AND function_row.prosecdef IS TRUE
      AND has_function_privilege($1, function_row.oid, 'EXECUTE')
    ORDER BY signature
  `, [RUNTIME_ROLE]);
  const constraintsResult = await client.query(`
    SELECT relation.relname AS "tableName", constraint_row.conname AS name,
      constraint_row.contype::text AS type,
      constraint_row.convalidated AS validated,
      pg_get_constraintdef(constraint_row.oid, true) AS definition
    FROM pg_constraint constraint_row
    JOIN pg_class relation ON relation.oid = constraint_row.conrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relname = ANY($1::text[])
    ORDER BY relation.relname, constraint_row.conname
  `, [ATTENDANCE_DEVICE_GATEWAY_TABLES]);
  const indexesResult = await client.query(`
    SELECT relation.relname AS "tableName", index_relation.relname AS name,
      index_row.indisunique AS "unique", index_row.indisvalid AS valid,
      index_row.indisready AS ready,
      pg_get_indexdef(index_row.indexrelid) AS definition
    FROM pg_index index_row
    JOIN pg_class relation ON relation.oid = index_row.indrelid
    JOIN pg_class index_relation ON index_relation.oid = index_row.indexrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relname = ANY($1::text[])
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint constraint_row
        WHERE constraint_row.conindid = index_row.indexrelid
      )
    ORDER BY relation.relname, index_relation.relname
  `, [ATTENDANCE_DEVICE_GATEWAY_TABLES]);
  const triggersResult = await client.query(`
    SELECT trigger.tgname AS name, relation.relname AS "tableName",
      function_row.proname AS "functionName", trigger.tgenabled AS enabled,
      (trigger.tgtype::integer & 1) <> 0 AS "rowLevel",
      (trigger.tgtype::integer & 2) <> 0 AS "beforeTiming",
      (trigger.tgtype::integer & 4) <> 0 AS "insertEvent",
      (trigger.tgtype::integer & 8) <> 0 AS "deleteEvent",
      (trigger.tgtype::integer & 16) <> 0 AS "updateEvent",
      trigger.tgqual IS NULL AS unconditional,
      pg_get_triggerdef(trigger.oid, true) AS definition
    FROM pg_trigger trigger
    JOIN pg_class relation ON relation.oid = trigger.tgrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_proc function_row ON function_row.oid = trigger.tgfoid
    WHERE namespace.nspname = 'public' AND NOT trigger.tgisinternal
      AND relation.relname = ANY($1::text[])
    ORDER BY trigger.tgname
  `, [ATTENDANCE_DEVICE_GATEWAY_TABLES]);
  const nonOwnerAclResult = await client.query(`
    SELECT relation.relname AS "tableName", acl.grantee
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(
      relation.relacl, acldefault('r', relation.relowner)
    )) acl
    WHERE namespace.nspname = 'public'
      AND relation.relname = ANY($1::text[])
      AND acl.grantee <> relation.relowner
  `, [ATTENDANCE_DEVICE_GATEWAY_TABLES]);
  const rolesResult = await client.query(`
    SELECT role.role_key AS "roleKey",
      COALESCE(array_agg(mapping.capability_key ORDER BY mapping.capability_key)
        FILTER (WHERE mapping.capability_key LIKE 'attendance.%'), ARRAY[]::varchar[])
        AS capabilities
    FROM iam_role role
    LEFT JOIN iam_role_capability mapping ON mapping.role_key = role.role_key
    WHERE role.role_key = ANY($1::varchar[])
    GROUP BY role.role_key ORDER BY role.role_key
  `, [Object.keys(ATTENDANCE_DEVICE_GATEWAY_ROLE_MATRIX)]);
  const conflictsResult = await client.query(`
    SELECT left_grant.role_key AS "roleKey",
      conflict.capability_key AS "capabilityKey",
      conflict.conflicts_with_key AS "conflictsWithKey"
    FROM iam_capability_conflict conflict
    JOIN iam_role_capability left_grant ON left_grant.capability_key = conflict.capability_key
    JOIN iam_role_capability right_grant
      ON right_grant.role_key = left_grant.role_key
     AND right_grant.capability_key = conflict.conflicts_with_key
    WHERE left_grant.role_key = ANY($1::varchar[])
  `, [Object.keys(ATTENDANCE_DEVICE_GATEWAY_ROLE_MATRIX)]);
  return {
    tables: rows(tablesResult),
    columns: rows(columnsResult),
    functions: rows(functionsResult).map(({ sourceBody, ...fn }) => ({
      ...fn,
      sourceHash: attendanceDeviceGatewayFunctionSourceFingerprint(sourceBody),
    })),
    runtimeFunctions: rows(runtimeFunctionsResult).map((row) => row.signature),
    constraints: rows(constraintsResult),
    indexes: rows(indexesResult),
    triggers: rows(triggersResult),
    nonOwnerAcl: rows(nonOwnerAclResult),
    roles: rows(rolesResult),
    conflicts: rows(conflictsResult),
  };
}

export async function verifyAttendanceDeviceGatewayFinalState(client) {
  return validateAttendanceDeviceGatewayEvidence(await collectEvidence(client));
}

async function verifyPrerequisiteLedger(client) {
  for (const [version, url] of PREREQUISITES) {
    const checksum = attendanceDeviceGatewayFingerprint(await readFile(url, 'utf8'));
    const installed = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1', [version],
    );
    if (installed.rowCount !== 1 || installed.rows[0].checksum_sha256 !== checksum) {
      throw new Error(`prerequisito ausente o con drift ${version}`);
    }
  }
}

async function verifyNoUnledgeredObjects(client) {
  const result = await client.query(`
    SELECT EXISTS (
      SELECT 1 FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public' AND relation.relname = ANY($1::text[])
    ) OR EXISTS (
      SELECT 1 FROM pg_proc function_row
      JOIN pg_namespace namespace ON namespace.oid = function_row.pronamespace
      WHERE namespace.nspname = 'public'
        AND function_row.proname LIKE 'attendance_gateway_%_v1'
    ) AS present
  `, [ATTENDANCE_DEVICE_GATEWAY_TABLES]);
  if (rows(result)[0]?.present === true) throw new Error('objetos 022 presentes sin ledger');
}

export function resolveAttendanceDeviceGatewayTarget(
  argv = process.argv,
  env = process.env,
) {
  const args = [...argv];
  const values = { ...env };
  const canonicalTarget = resolveCanonicalDatabaseTarget(args, values);
  if (canonicalTarget.mode === 'production') return canonicalTarget;
  if (canonicalTarget.mode !== 'isolated') {
    throw new Error('el esquema 022 sólo admite un target aislado o Producción canónica');
  }

  const isolatedTarget = resolvePlatformOwnerOperationalIntegralTarget(args, values);
  if (isolatedTarget.mode !== 'isolated'
      || isolatedTarget.databaseUrl !== canonicalTarget.databaseUrl
      || !isolatedTarget.branchId) {
    throw new Error('el target QA cambió durante el preflight canónico');
  }
  return isolatedTarget;
}

async function main() {
  const migration = await readFile(MIGRATION_URL, 'utf8');
  validateAttendanceDeviceGatewayMigrationSql(migration);
  const fingerprint = attendanceDeviceGatewayFingerprint(migration);
  const statements = splitPostgresStatements(migration);
  const args = process.argv.slice(2);
  const target = resolveAttendanceDeviceGatewayTarget(args, process.env);
  const client = new Client({ connectionString: target.databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('municipio-junin-friendly:attendance-device-gateway-022'))",
    );
    await verifyPrerequisiteLedger(client);
    const existing = await client.query(
      'SELECT checksum_sha256 FROM schema_migrations WHERE version = $1',
      [ATTENDANCE_DEVICE_GATEWAY_MIGRATION_VERSION],
    );
    if (existing.rowCount && existing.rows[0].checksum_sha256 !== fingerprint) {
      throw new Error(`Drift detectado: ${ATTENDANCE_DEVICE_GATEWAY_MIGRATION_VERSION}`);
    }
    if (!existing.rowCount) {
      await verifyNoUnledgeredObjects(client);
      for (const [index, statement] of statements.entries()) {
        try {
          await client.query(statement);
        } catch (error) {
          throw new Error(
            `migracion ${ATTENDANCE_DEVICE_GATEWAY_MIGRATION_VERSION} `
              + `sentencia ${index + 1}/${statements.length}: ${error?.message || 'SQL invalido'}`,
            { cause: error },
          );
        }
      }
      await client.query(
        'INSERT INTO schema_migrations (version, checksum_sha256) VALUES ($1, $2)',
        [ATTENDANCE_DEVICE_GATEWAY_MIGRATION_VERSION, fingerprint],
      );
    }
    await verifyAttendanceDeviceGatewayFinalState(client);
    await client.query('COMMIT');
    const targetLabel = `${target.mode}:${target.branchId}`;
    console.log(existing.rowCount
      ? `${ATTENDANCE_DEVICE_GATEWAY_MIGRATION_VERSION}: reapply verificado (${targetLabel}, SHA-256 ${fingerprint})`
      : `${ATTENDANCE_DEVICE_GATEWAY_MIGRATION_VERSION}: fresh apply (${targetLabel}, ${statements.length} sentencias, SHA-256 ${fingerprint})`);
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
