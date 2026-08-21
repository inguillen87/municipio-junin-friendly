#!/usr/bin/env node

/**
 * Fail-closed validator for the versioned GRH MariaDB -> MuniControl mapping.
 *
 * Inputs are privacy-safe: the manifest contains field names and governance
 * rules, while the profiler output contains schema metadata and row counts.
 * No source row value is needed or accepted by this validator.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REQUIRED_DOMAINS = new Set([
  'tenant',
  'identity',
  'employment',
  'organization',
  'time_catalog',
  'time_assignment',
  'time_expectation',
  'time_punch',
  'administrative_event',
  'payroll',
]);

const SUPPORTED_PROFILE_SCHEMA_VERSION = 1;
const SUPPORTED_PROFILE_TOOL_VERSION = '1.0.0';
const SOURCE_SYSTEM = 'GRH';
const SOURCE_DATABASE = 'grh_junin';
const SOURCE_ENGINE = 'MariaDB 10.3 / MySQL logical SQL';
const SOURCE_FORMAT = 'mariadb_dump';
const SOURCE_CONTAINER = 'gzip';
const MINIMUM_SCHEMA_MIGRATION = '011-versioned-time-catalog';

const REQUIRED_GATE_IDS = new Set([
  'G01_SNAPSHOT_FINGERPRINT',
  'G02_CERTIFIED_TENANT_BINDING',
  'G03_SCHEMA_MAPPING_VALID',
  'G04_IDENTITY_CROSSWALK',
  'G05_NOMINAL_AUTHORIZATION',
  'G06_TIME_HOMOLOGATION',
  'G07_CLOCK_SOURCE',
  'G08_PAYROLL_SEGREGATION',
  'G09_QUARANTINE_RECONCILED',
  'G10_DRY_RUN_IDEMPOTENCY',
]);

const REQUIRED_QUARANTINE_CODES = new Set([
  'TENANT_BINDING_UNRESOLVED',
  'REQUIRED_SOURCE_KEY_NULL_OR_DUPLICATE',
  'INVALID_OR_SENTINEL_DATE',
  'TEXT_ENCODING_OR_LOSS',
  'PERSON_IDENTITY_INVALID_OR_AMBIGUOUS',
  'ORGANIZATION_REFERENCE_OR_CYCLE',
  'TIME_CATALOG_REFERENCE_OR_FORMAT_INVALID',
  'STALE_TIME_SOURCE_USED_AS_CURRENT',
  'TIME_ASSIGNMENT_CONFLICT',
  'PUNCH_EXPECTATION_LINK_UNRESOLVED',
  'ADMINISTRATIVE_EVENT_ORPHAN_OR_INVERTED',
  'PRENOVELTY_CAUSE_OR_CONCEPT_UNPROVEN',
  'PAYROLL_REFERENCE_OR_PERIOD_INVALID',
  'CLOCK_PAYROLL_BRIDGE_NOT_OPERATIONAL',
  'NOMINAL_ACCESS_CONTROL_NOT_READY',
]);

const KNOWN_CAPABILITIES = new Set([
  'platform.tenants.read',
  'time.source.read',
  'time.source.propose',
  'time.source.approve',
  'employee.record.propose',
  'employee.record.approve',
  'time.catalog.propose',
  'time.catalog.approve',
  'absence.enter',
  'absence.validate',
  'leave.enter',
  'leave.approve',
  'payroll.read',
]);

const REQUIRED_CAPABILITIES_BY_ENTITY = new Map([
  ['tenant.municipality', ['platform.tenants.read', 'time.source.read']],
  ['identity.person', ['employee.record.propose', 'employee.record.approve']],
  ['employment.contract', ['employee.record.propose', 'employee.record.approve']],
  ['organization.unit', ['employee.record.propose', 'employee.record.approve']],
  ['organization.position', ['employee.record.propose', 'employee.record.approve']],
  ['organization.sector', ['employee.record.propose', 'employee.record.approve']],
  ['organization.cost_center', ['employee.record.propose', 'employee.record.approve', 'payroll.read']],
  ['employment.agreement', ['employee.record.propose', 'employee.record.approve']],
  ['employment.category', ['employee.record.propose', 'employee.record.approve']],
  ['time.shift', ['time.catalog.propose', 'time.catalog.approve']],
  ['time.interval', ['time.catalog.propose', 'time.catalog.approve']],
  ['time.tolerance', ['time.catalog.propose', 'time.catalog.approve']],
  ['time.assignment', ['time.catalog.propose', 'time.catalog.approve']],
  ['time.expected_day', ['time.source.propose', 'time.source.approve']],
  ['time.punch', ['time.source.propose', 'time.source.approve']],
  ['time.location', ['time.catalog.propose', 'time.catalog.approve']],
  ['time.holiday', ['time.catalog.propose', 'time.catalog.approve']],
  ['time.authorization_reason', ['time.catalog.propose', 'time.catalog.approve']],
  ['time.pre_novelty', ['time.source.propose', 'time.source.approve']],
  ['event.absence', ['absence.enter', 'absence.validate']],
  ['event.leave', ['leave.enter', 'leave.approve']],
  ['event.absence_rule', ['absence.enter', 'absence.validate', 'leave.enter', 'leave.approve']],
  ['payroll.clock_concept', ['payroll.read', 'time.source.propose', 'time.source.approve']],
  ['payroll.concept', ['payroll.read', 'time.source.propose', 'time.source.approve']],
  ['payroll.run', ['payroll.read', 'time.source.propose', 'time.source.approve']],
  ['payroll.fact', ['payroll.read', 'time.source.propose', 'time.source.approve']],
  ['payroll.movement', ['payroll.read', 'time.source.propose', 'time.source.approve']],
  ['payroll.clock_rule_bridge', ['payroll.read', 'time.source.propose', 'time.source.approve']],
  ['payroll.automatic_novelty', ['payroll.read', 'time.source.propose', 'time.source.approve']],
]);

const PERSONAL_ENTITY_IDS = new Set([
  'identity.person',
  'employment.contract',
  'time.assignment',
  'time.expected_day',
  'time.punch',
  'time.pre_novelty',
  'event.absence',
  'event.leave',
  'payroll.fact',
  'payroll.movement',
  'payroll.automatic_novelty',
]);

export class SourceMappingValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SourceMappingValidationError';
  }
}

function fail(message) {
  throw new SourceMappingValidationError(message);
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} debe ser un objeto`);
  }
  return value;
}

function requireArray(value, label, { nonEmpty = true } = {}) {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0)) {
    fail(`${label} debe ser un arreglo${nonEmpty ? ' no vacio' : ''}`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${label} debe ser texto no vacio`);
  }
  return value;
}

function requireBoolean(value, label) {
  if (typeof value !== 'boolean') fail(`${label} debe ser booleano`);
  return value;
}

function requireNonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(`${label} debe ser un entero no negativo`);
  }
  return value;
}

function assertUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) fail(`${label} duplicado: ${value}`);
    seen.add(value);
  }
}

function requireNumber(value, label, { minimum = 0 } = {}) {
  if (!Number.isFinite(value) || value < minimum) {
    fail(`${label} debe ser numerico y mayor o igual a ${minimum}`);
  }
  return value;
}

function requireExactKeys(value, label, allowedKeys, { optional = [] } = {}) {
  const object = requireObject(value, label);
  const allowed = new Set(allowedKeys);
  const optionalKeys = new Set(optional);
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) {
      fail(`${label}.${key} no esta permitido por el contrato estructural`);
    }
  }
  for (const key of allowed) {
    if (!optionalKeys.has(key) && !Object.hasOwn(object, key)) {
      fail(`${label}.${key} es obligatorio`);
    }
  }
  return object;
}

function requireStringArray(value, label, { nonEmpty = true } = {}) {
  const values = requireArray(value, label, { nonEmpty });
  values.forEach((entry, index) => requireString(entry, `${label}[${index}]`));
  assertUnique(values, label);
  return values;
}

function requireExactSet(actualValues, expectedValues, label) {
  const actual = new Set(actualValues);
  for (const expected of expectedValues) {
    if (!actual.has(expected)) fail(`${label} omite ${expected}`);
  }
  for (const value of actual) {
    if (!expectedValues.has(value)) fail(`${label} contiene valor no permitido: ${value}`);
  }
}

function requireSha256(value, label) {
  const digest = requireString(value, label);
  if (!/^[a-f0-9]{64}$/i.test(digest)) fail(`${label} invalido`);
  return digest.toLowerCase();
}

function sumSafe(values, label) {
  return values.reduce((sum, value) => {
    if (sum > Number.MAX_SAFE_INTEGER - value) fail(`${label} excede el limite entero seguro`);
    return sum + value;
  }, 0);
}

function normalizeType(type) {
  return String(type).trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizedForeignKey(foreignKey) {
  return [
    foreignKey.columns.join('\u001f'),
    foreignKey.referencedTable,
    foreignKey.referencedColumns.join('\u001f'),
  ].join('\u001e');
}

function validateProfileTable(table, profileKind) {
  const fullProfile = profileKind === 'full';
  requireExactKeys(
    table,
    'profile.tables[]',
    fullProfile
      ? ['name', 'rowCount', 'columns', 'primaryKey', 'indexes', 'foreignKeys', 'functionalDomains', 'candidateTypes']
      : ['name', 'rowCount', 'columns', 'primaryKey', 'indexes', 'foreignKeys'],
  );
  const tableName = requireString(table.name, 'profile.tables[].name');
  requireNonNegativeInteger(table.rowCount, `profile.tables.${tableName}.rowCount`);

  const columns = requireArray(table.columns, `profile.tables.${tableName}.columns`);
  columns.forEach((column) => {
    requireExactKeys(
      column,
      `profile.tables.${tableName}.columns[]`,
      ['name', 'type', 'nullable', 'hasDefault', 'autoIncrement'],
    );
    requireString(column.name, `profile.tables.${tableName}.columns[].name`);
    requireString(column.type, `profile.tables.${tableName}.${column.name}.type`);
    requireBoolean(column.nullable, `profile.tables.${tableName}.${column.name}.nullable`);
    requireBoolean(column.hasDefault, `profile.tables.${tableName}.${column.name}.hasDefault`);
    requireBoolean(column.autoIncrement, `profile.tables.${tableName}.${column.name}.autoIncrement`);
  });
  assertUnique(columns.map((column) => column.name), `profile.tables.${tableName}.columns`);
  const columnNames = new Set(columns.map((column) => column.name));

  const primaryKey = requireStringArray(
    table.primaryKey,
    `profile.tables.${tableName}.primaryKey`,
    { nonEmpty: false },
  );
  primaryKey.forEach((column) => {
    if (!columnNames.has(column)) fail(`profile.tables.${tableName}.primaryKey usa columna inexistente ${column}`);
  });

  const indexes = requireArray(table.indexes, `profile.tables.${tableName}.indexes`, { nonEmpty: false });
  indexes.forEach((index) => {
    requireExactKeys(index, `profile.tables.${tableName}.indexes[]`, ['name', 'unique', 'kind', 'columns']);
    requireString(index.name, `profile.tables.${tableName}.indexes[].name`);
    requireBoolean(index.unique, `profile.tables.${tableName}.indexes.${index.name}.unique`);
    requireString(index.kind, `profile.tables.${tableName}.indexes.${index.name}.kind`);
    requireStringArray(index.columns, `profile.tables.${tableName}.indexes.${index.name}.columns`)
      .forEach((column) => {
        if (!columnNames.has(column)) fail(`profile.tables.${tableName}.indexes.${index.name} usa columna inexistente ${column}`);
      });
  });
  assertUnique(indexes.map((index) => index.name), `profile.tables.${tableName}.indexes.name`);

  const foreignKeys = requireArray(table.foreignKeys, `profile.tables.${tableName}.foreignKeys`, { nonEmpty: false });
  foreignKeys.forEach((foreignKey) => {
    requireExactKeys(
      foreignKey,
      `profile.tables.${tableName}.foreignKeys[]`,
      ['name', 'columns', 'referencedTable', 'referencedColumns'],
    );
    requireString(foreignKey.name, `profile.tables.${tableName}.foreignKeys[].name`);
    const sourceColumns = requireStringArray(
      foreignKey.columns,
      `profile.tables.${tableName}.foreignKeys.${foreignKey.name}.columns`,
    );
    requireString(
      foreignKey.referencedTable,
      `profile.tables.${tableName}.foreignKeys.${foreignKey.name}.referencedTable`,
    );
    const referencedColumns = requireStringArray(
      foreignKey.referencedColumns,
      `profile.tables.${tableName}.foreignKeys.${foreignKey.name}.referencedColumns`,
    );
    if (sourceColumns.length !== referencedColumns.length) {
      fail(`profile.tables.${tableName}.foreignKeys.${foreignKey.name} tiene cardinalidad desigual`);
    }
    sourceColumns.forEach((column) => {
      if (!columnNames.has(column)) {
        fail(`profile.tables.${tableName}.foreignKeys.${foreignKey.name} usa columna inexistente ${column}`);
      }
    });
  });
  assertUnique(foreignKeys.map((foreignKey) => foreignKey.name), `profile.tables.${tableName}.foreignKeys.name`);

  if (fullProfile) {
    requireStringArray(
      table.functionalDomains,
      `profile.tables.${tableName}.functionalDomains`,
      { nonEmpty: false },
    );
    requireStringArray(
      table.candidateTypes,
      `profile.tables.${tableName}.candidateTypes`,
      { nonEmpty: false },
    );
  }
}

function validateProfile(profile, manifestSnapshot) {
  requireExactKeys(
    profile,
    'profile',
    ['schemaVersion', 'toolVersion', 'profileKind', 'privacy', 'source', 'sql', 'summary', 'selection', 'candidates', 'tables'],
    { optional: ['profileKind', 'selection', 'candidates'] },
  );
  if (profile.schemaVersion !== SUPPORTED_PROFILE_SCHEMA_VERSION) {
    fail(`profile.schemaVersion debe ser ${SUPPORTED_PROFILE_SCHEMA_VERSION}`);
  }
  if (profile.toolVersion !== SUPPORTED_PROFILE_TOOL_VERSION) {
    fail(`profile.toolVersion debe ser ${SUPPORTED_PROFILE_TOOL_VERSION}`);
  }
  const profileKind = profile.profileKind === undefined ? 'full' : profile.profileKind;
  if (!['full', 'safe_mapping_subset'].includes(profileKind)) fail('profile.profileKind invalido');
  if (profileKind === 'full' && profile.selection !== undefined) {
    fail('profile.selection solo se admite para safe_mapping_subset');
  }
  if (profileKind === 'safe_mapping_subset' && profile.selection === undefined) {
    fail('profile.selection es obligatorio para safe_mapping_subset');
  }

  const privacy = requireExactKeys(
    profile.privacy,
    'profile.privacy',
    ['rawRowsRetained', 'dataLiteralsEmitted', 'samplesEmitted', 'outputScope'],
  );
  requireBoolean(privacy.rawRowsRetained, 'profile.privacy.rawRowsRetained');
  requireBoolean(privacy.dataLiteralsEmitted, 'profile.privacy.dataLiteralsEmitted');
  requireBoolean(privacy.samplesEmitted, 'profile.privacy.samplesEmitted');
  if (privacy.rawRowsRetained !== false
      || privacy.dataLiteralsEmitted !== false
      || privacy.samplesEmitted !== false
      || privacy.outputScope !== 'schema_metadata_and_aggregate_counts_only') {
    fail('el perfil no acredita salida estructural sin valores');
  }

  const source = requireExactKeys(
    profile.source,
    'profile.source',
    ['fileName', 'container', 'bytes', 'logicalBytes', 'sha256'],
  );
  requireString(source.fileName, 'profile.source.fileName');
  requireString(source.container, 'profile.source.container');
  requireNonNegativeInteger(source.bytes, 'profile.source.bytes');
  requireNonNegativeInteger(source.logicalBytes, 'profile.source.logicalBytes');
  if (source.bytes === 0 || source.logicalBytes === 0) fail('profile.source debe acreditar bytes no vacios');
  requireSha256(source.sha256, 'profile.source.sha256');

  const sql = requireExactKeys(
    profile.sql,
    'profile.sql',
    ['dialect', 'statementCount', 'createTableStatements', 'alterTableStatements', 'insertStatements'],
  );
  if (sql.dialect !== 'MariaDB/MySQL') fail('profile.sql.dialect debe ser MariaDB/MySQL');
  for (const key of ['statementCount', 'createTableStatements', 'alterTableStatements', 'insertStatements']) {
    requireNonNegativeInteger(sql[key], `profile.sql.${key}`);
  }
  if (sql.statementCount < sql.createTableStatements + sql.alterTableStatements + sql.insertStatements) {
    fail('profile.sql.statementCount es menor que sus sentencias clasificadas');
  }

  const summary = requireExactKeys(
    profile.summary,
    'profile.summary',
    ['tableCount', 'columnCount', 'rowCount', 'indexCount', 'foreignKeyCount', 'candidateCounts'],
  );
  for (const key of ['tableCount', 'columnCount', 'rowCount', 'indexCount', 'foreignKeyCount']) {
    requireNonNegativeInteger(summary[key], `profile.summary.${key}`);
  }
  const candidateCounts = requireExactKeys(
    summary.candidateCounts,
    'profile.summary.candidateCounts',
    ['turnos', 'fichadas', 'calendarios', 'reglas'],
  );
  for (const key of ['turnos', 'fichadas', 'calendarios', 'reglas']) {
    requireNonNegativeInteger(candidateCounts[key], `profile.summary.candidateCounts.${key}`);
  }
  if (sql.createTableStatements !== summary.tableCount) {
    fail('profile.sql.createTableStatements no coincide con profile.summary.tableCount');
  }

  const tables = requireArray(profile.tables, 'profile.tables');
  tables.forEach((table) => validateProfileTable(table, profileKind));
  assertUnique(tables.map((table) => table.name), 'profile.tables.name');
  const tableByName = new Map(tables.map((table) => [table.name, table]));
  for (const table of tables) {
    for (const foreignKey of table.foreignKeys) {
      const referenced = tableByName.get(foreignKey.referencedTable);
      if (!referenced) {
        fail(`profile.tables.${table.name}: FK referencia tabla fuera del perfil ${foreignKey.referencedTable}`);
      }
      const referencedColumns = new Set(referenced.columns.map((column) => column.name));
      foreignKey.referencedColumns.forEach((column) => {
        if (!referencedColumns.has(column)) {
          fail(`profile.tables.${table.name}: FK referencia columna inexistente ${foreignKey.referencedTable}.${column}`);
        }
      });
    }
  }

  const materializedSummary = {
    tableCount: tables.length,
    columnCount: sumSafe(tables.map((table) => table.columns.length), 'profile columnCount'),
    rowCount: sumSafe(tables.map((table) => table.rowCount), 'profile rowCount'),
    indexCount: sumSafe(tables.map((table) => table.indexes.length), 'profile indexCount'),
    foreignKeyCount: sumSafe(tables.map((table) => table.foreignKeys.length), 'profile foreignKeyCount'),
  };

  if (profileKind === 'full') {
    if (profile.candidates === undefined) fail('profile.candidates es obligatorio para un perfil completo');
    if (profile.profileKind !== undefined && profile.profileKind !== 'full') fail('profile.profileKind invalido');
    for (const [key, value] of Object.entries(materializedSummary)) {
      if (summary[key] !== value) fail(`profile.summary.${key} no coincide con profile.tables`);
    }
    const candidates = requireExactKeys(
      profile.candidates,
      'profile.candidates',
      ['turnos', 'fichadas', 'calendarios', 'reglas'],
    );
    for (const candidateType of ['turnos', 'fichadas', 'calendarios', 'reglas']) {
      const entries = requireArray(candidates[candidateType], `profile.candidates.${candidateType}`, { nonEmpty: false });
      assertUnique(entries.map((entry) => entry.table), `profile.candidates.${candidateType}.table`);
      if (entries.length !== candidateCounts[candidateType]) {
        fail(`profile.summary.candidateCounts.${candidateType} no coincide con profile.candidates`);
      }
      entries.forEach((entry) => {
        requireExactKeys(
          entry,
          `profile.candidates.${candidateType}[]`,
          ['table', 'score', 'confidence', 'matchedTableKeywords', 'matchedColumns'],
        );
        const table = tableByName.get(requireString(entry.table, `profile.candidates.${candidateType}[].table`));
        if (!table) fail(`profile.candidates.${candidateType} referencia tabla inexistente ${entry.table}`);
        requireNumber(entry.score, `profile.candidates.${candidateType}.${entry.table}.score`);
        if (!['exploratory', 'medium', 'high'].includes(entry.confidence)) {
          fail(`profile.candidates.${candidateType}.${entry.table}.confidence invalido`);
        }
        requireStringArray(
          entry.matchedTableKeywords,
          `profile.candidates.${candidateType}.${entry.table}.matchedTableKeywords`,
          { nonEmpty: false },
        );
        const columnNames = new Set(table.columns.map((column) => column.name));
        requireStringArray(
          entry.matchedColumns,
          `profile.candidates.${candidateType}.${entry.table}.matchedColumns`,
          { nonEmpty: false },
        ).forEach((column) => {
          if (!columnNames.has(column)) {
            fail(`profile.candidates.${candidateType}.${entry.table} usa columna inexistente ${column}`);
          }
        });
      });
    }
  } else {
    if (profile.candidates !== undefined) fail('safe_mapping_subset no debe copiar candidatos parciales');
    const selection = requireExactKeys(
      profile.selection,
      'profile.selection',
      ['kind', 'fullProfileSha256', 'tableCount', 'columnCount', 'rowCount', 'indexCount', 'foreignKeyCount'],
    );
    if (selection.kind !== 'mapped_schema_subset') fail('profile.selection.kind invalido');
    const fullProfileSha256 = requireSha256(selection.fullProfileSha256, 'profile.selection.fullProfileSha256');
    if (fullProfileSha256 !== requireSha256(manifestSnapshot.fullProfileSha256, 'source.snapshot.fullProfileSha256')) {
      fail('source.snapshot.fullProfileSha256 no coincide con el perfil subset');
    }
    for (const key of ['tableCount', 'columnCount', 'rowCount', 'indexCount', 'foreignKeyCount']) {
      requireNonNegativeInteger(selection[key], `profile.selection.${key}`);
      if (selection[key] !== materializedSummary[key]) {
        fail(`profile.selection.${key} no coincide con profile.tables`);
      }
      if (summary[key] < selection[key]) {
        fail(`profile.summary.${key} no puede ser menor que profile.selection.${key}`);
      }
    }
  }

  return { profileKind, source, summary, tables, tableByName, materializedSummary };
}

function validateSourceEnvelope(manifest, profile) {
  requireExactKeys(
    manifest,
    'manifest',
    [
      'manifestVersion', 'manifestId', 'status', 'minimumSchemaMigration', 'source', 'privacy',
      'requiredDomains', 'keyEncoding', 'entities', 'relationships', 'quarantineRules', 'migrationGates',
    ],
  );
  requireString(manifest.manifestVersion, 'manifestVersion');
  if (!/^1\.\d+\.\d+$/.test(manifest.manifestVersion)) {
    fail('manifestVersion debe ser semver de la linea 1.x');
  }
  requireString(manifest.manifestId, 'manifestId');
  if (!/^[a-z0-9][a-z0-9.-]+\.v1$/.test(manifest.manifestId)) {
    fail('manifestId debe ser estable, minusculo y terminar en .v1');
  }
  if (!['discovered', 'reviewed', 'approved', 'retired'].includes(manifest.status)) {
    fail('status invalido');
  }
  if (manifest.minimumSchemaMigration !== MINIMUM_SCHEMA_MIGRATION) {
    fail(`minimumSchemaMigration debe ser ${MINIMUM_SCHEMA_MIGRATION}`);
  }

  const source = requireExactKeys(
    manifest.source,
    'source',
    ['system', 'database', 'engine', 'format', 'container', 'snapshot', 'authority', 'tenantBinding'],
  );
  if (source.system !== SOURCE_SYSTEM) fail(`source.system debe ser ${SOURCE_SYSTEM}`);
  if (source.database !== SOURCE_DATABASE) fail(`source.database debe ser ${SOURCE_DATABASE}`);
  if (source.engine !== SOURCE_ENGINE) fail(`source.engine debe ser ${SOURCE_ENGINE}`);
  if (source.format !== SOURCE_FORMAT) fail(`source.format debe ser ${SOURCE_FORMAT}`);
  if (source.container !== SOURCE_CONTAINER) fail(`source.container debe ser ${SOURCE_CONTAINER}`);
  requireString(source.authority, 'source.authority');

  const snapshot = requireExactKeys(
    source.snapshot,
    'source.snapshot',
    ['fileName', 'sha256', 'fullProfileSha256', 'logicalRowCount', 'dumpCompletedLocal', 'timezoneEvidence'],
  );
  requireString(snapshot.fileName, 'source.snapshot.fileName');
  requireSha256(snapshot.sha256, 'source.snapshot.sha256');
  requireSha256(snapshot.fullProfileSha256, 'source.snapshot.fullProfileSha256');
  requireNonNegativeInteger(snapshot.logicalRowCount, 'source.snapshot.logicalRowCount');
  requireString(snapshot.dumpCompletedLocal, 'source.snapshot.dumpCompletedLocal');
  requireString(snapshot.timezoneEvidence, 'source.snapshot.timezoneEvidence');

  const tenantBinding = requireExactKeys(
    source.tenantBinding,
    'source.tenantBinding',
    ['sourceTable', 'sourceColumns', 'targetEntity', 'resolution', 'autoProvisionTenant'],
  );
  requireString(tenantBinding.sourceTable, 'source.tenantBinding.sourceTable');
  requireStringArray(tenantBinding.sourceColumns, 'source.tenantBinding.sourceColumns');
  requireString(tenantBinding.targetEntity, 'source.tenantBinding.targetEntity');
  requireString(tenantBinding.resolution, 'source.tenantBinding.resolution');
  requireBoolean(tenantBinding.autoProvisionTenant, 'source.tenantBinding.autoProvisionTenant');
  if (tenantBinding.autoProvisionTenant !== false) fail('source.tenantBinding.autoProvisionTenant debe ser false');

  const profileEvidence = validateProfile(profile, snapshot);
  const profileSource = profileEvidence.source;
  const profileSummary = profileEvidence.summary;
  if (source.container !== requireString(profileSource.container, 'profile.source.container')) {
    fail('source.container no coincide con el perfil');
  }
  if (snapshot.fileName !== profileSource.fileName) {
    fail(`snapshot fileName ${snapshot.fileName} no coincide con el perfil ${profileSource.fileName}`);
  }
  if (snapshot.sha256.toLowerCase() !== requireString(profileSource.sha256, 'profile.source.sha256').toLowerCase()) {
    fail('snapshot sha256 no coincide con el perfil');
  }
  if (snapshot.logicalRowCount !== profileSummary.rowCount) {
    fail('snapshot logicalRowCount no coincide con el perfil');
  }

  const privacy = requireExactKeys(
    manifest.privacy,
    'privacy',
    [
      'containsPersonalData', 'rowValuesEmbedded', 'processingPurposes', 'authorizationBoundary',
      'outputPolicy', 'minimization', 'credentialPolicy',
    ],
  );
  requireBoolean(privacy.containsPersonalData, 'privacy.containsPersonalData');
  if (privacy.containsPersonalData !== true) fail('privacy.containsPersonalData debe reconocer la PII');
  requireBoolean(privacy.rowValuesEmbedded, 'privacy.rowValuesEmbedded');
  if (privacy.rowValuesEmbedded !== false) fail('privacy.rowValuesEmbedded debe ser false');
  requireStringArray(privacy.processingPurposes, 'privacy.processingPurposes');
  requireString(privacy.authorizationBoundary, 'privacy.authorizationBoundary');
  requireString(privacy.outputPolicy, 'privacy.outputPolicy');
  requireString(privacy.minimization, 'privacy.minimization');
  requireString(privacy.credentialPolicy, 'privacy.credentialPolicy');

  const declaredDomains = requireStringArray(manifest.requiredDomains, 'requiredDomains');
  requireExactSet(declaredDomains, REQUIRED_DOMAINS, 'requiredDomains');

  const keyEncoding = requireExactKeys(
    manifest.keyEncoding,
    'keyEncoding',
    [
      'sourceSystem', 'delimiter', 'escape', 'tenantKey', 'employmentKey', 'personKey',
      'nullPolicy', 'mutationPolicy',
    ],
  );
  if (keyEncoding.sourceSystem !== SOURCE_SYSTEM) fail(`keyEncoding.sourceSystem debe ser ${SOURCE_SYSTEM}`);
  for (const key of ['delimiter', 'escape', 'tenantKey', 'employmentKey', 'personKey', 'nullPolicy', 'mutationPolicy']) {
    requireString(keyEncoding[key], `keyEncoding.${key}`);
  }

  return profileEvidence;
}

function validateEntity(entity, tableByName, domains, counters) {
  requireExactKeys(
    entity,
    'entities[]',
    [
      'id', 'domain', 'purpose', 'source', 'keyStrategy', 'target', 'dataClassification',
      'accessPolicy', 'freshness', 'mappings',
    ],
  );
  requireString(entity.id, 'entity.id');
  requireString(entity.domain, `${entity.id}.domain`);
  if (!domains.has(entity.domain)) fail(`${entity.id}.domain no esta declarado`);
  requireString(entity.purpose, `${entity.id}.purpose`);

  const source = requireExactKeys(
    entity.source,
    `${entity.id}.source`,
    ['table', 'expectedRowCount', 'primaryKey', 'columns'],
  );
  const tableName = requireString(source.table, `${entity.id}.source.table`);
  const table = tableByName.get(tableName);
  if (!table) fail(`${entity.id}: tabla fuente inexistente: ${tableName}`);
  requireNonNegativeInteger(source.expectedRowCount, `${entity.id}.source.expectedRowCount`);
  if (source.expectedRowCount !== table.rowCount) {
    fail(`${entity.id}: filas esperadas ${source.expectedRowCount} != perfil ${table.rowCount}`);
  }

  const primaryKey = requireStringArray(source.primaryKey, `${entity.id}.source.primaryKey`);
  if (JSON.stringify(primaryKey) !== JSON.stringify(table.primaryKey)) {
    fail(`${entity.id}: primaryKey no coincide con ${tableName}`);
  }

  const actualColumns = new Map(table.columns.map((column) => [column.name, column]));
  const columns = requireArray(source.columns, `${entity.id}.source.columns`);
  for (const column of columns) {
    requireExactKeys(column, `${entity.id}.source.columns[]`, ['name', 'type', 'role']);
    requireString(column.name, `${entity.id}.source.columns[].name`);
  }
  assertUnique(columns.map((column) => column.name), `${entity.id}.source.columns`);
  for (const column of columns) {
    const actual = actualColumns.get(column.name);
    if (!actual) fail(`${entity.id}: columna ${tableName}.${column.name} no existe`);
    const expectedType = requireString(column.type, `${entity.id}.${column.name}.type`);
    if (normalizeType(expectedType) !== normalizeType(actual.type)) {
      fail(`${entity.id}: tipo ${tableName}.${column.name} ${expectedType} != ${actual.type}`);
    }
    requireString(column.role, `${entity.id}.${column.name}.role`);
    counters.columns += 1;
  }

  const keyStrategy = requireExactKeys(
    entity.keyStrategy,
    `${entity.id}.keyStrategy`,
    ['sourceColumns', 'canonicalKey', 'tenantScoped', 'collisionPolicy'],
  );
  const keyColumns = requireStringArray(keyStrategy.sourceColumns, `${entity.id}.keyStrategy.sourceColumns`);
  keyColumns.forEach((column) => {
    if (!actualColumns.has(column)) fail(`${entity.id}: keyStrategy usa columna inexistente ${column}`);
  });
  primaryKey.forEach((column) => {
    if (!keyColumns.includes(column)) {
      fail(`${entity.id}: keyStrategy omite componente de primaryKey ${column}`);
    }
  });
  requireString(keyStrategy.canonicalKey, `${entity.id}.keyStrategy.canonicalKey`);
  requireBoolean(keyStrategy.tenantScoped, `${entity.id}.keyStrategy.tenantScoped`);
  if (keyStrategy.tenantScoped !== true) fail(`${entity.id}: keyStrategy.tenantScoped debe ser true`);
  requireString(keyStrategy.collisionPolicy, `${entity.id}.keyStrategy.collisionPolicy`);

  const target = requireExactKeys(
    entity.target,
    `${entity.id}.target`,
    ['entity', 'materialization', 'writeMode'],
  );
  requireString(target.entity, `${entity.id}.target.entity`);
  if (!['existing', 'versioned_contract', 'staging_only', 'planned'].includes(target.materialization)) {
    fail(`${entity.id}.target.materialization invalido`);
  }
  requireString(target.writeMode, `${entity.id}.target.writeMode`);

  const classification = requireExactKeys(
    entity.dataClassification,
    `${entity.id}.dataClassification`,
    ['personalData', 'level', 'categories'],
  );
  requireBoolean(classification.personalData, `${entity.id}.dataClassification.personalData`);
  if (classification.personalData !== PERSONAL_ENTITY_IDS.has(entity.id)) {
    fail(`${entity.id}.dataClassification.personalData no coincide con la clasificacion canonica`);
  }
  requireString(classification.level, `${entity.id}.dataClassification.level`);
  requireStringArray(classification.categories, `${entity.id}.dataClassification.categories`);

  const accessPolicy = requireExactKeys(
    entity.accessPolicy,
    `${entity.id}.accessPolicy`,
    ['tenantBound', 'rowScope', 'capabilities', 'enforcementGate'],
  );
  requireBoolean(accessPolicy.tenantBound, `${entity.id}.accessPolicy.tenantBound`);
  if (accessPolicy.tenantBound !== true) fail(`${entity.id}: accessPolicy.tenantBound debe ser true`);
  requireString(accessPolicy.rowScope, `${entity.id}.accessPolicy.rowScope`);
  requireString(accessPolicy.enforcementGate, `${entity.id}.accessPolicy.enforcementGate`);
  const capabilities = requireStringArray(accessPolicy.capabilities, `${entity.id}.accessPolicy.capabilities`);
  capabilities.forEach((capability) => {
    if (!KNOWN_CAPABILITIES.has(capability)) fail(`${entity.id}: capability no reconocida ${capability}`);
  });
  const requiredCapabilities = REQUIRED_CAPABILITIES_BY_ENTITY.get(entity.id);
  if (!requiredCapabilities) fail(`${entity.id}: entidad no contemplada por la matriz de capabilities`);
  requiredCapabilities.forEach((capability) => {
    if (!capabilities.includes(capability)) fail(`${entity.id}: capabilities omite ${capability}`);
  });

  const freshness = requireExactKeys(
    entity.freshness,
    `${entity.id}.freshness`,
    ['classification', 'operationalUse', 'notes'],
  );
  requireString(freshness.classification, `${entity.id}.freshness.classification`);
  requireString(freshness.operationalUse, `${entity.id}.freshness.operationalUse`);
  requireString(freshness.notes, `${entity.id}.freshness.notes`);

  const declaredColumns = new Set(columns.map((column) => column.name));
  const mappings = requireArray(entity.mappings, `${entity.id}.mappings`);
  for (const mapping of mappings) {
    requireExactKeys(
      mapping,
      `${entity.id}.mappings[]`,
      ['sourceColumn', 'targetField', 'transform', 'classification'],
    );
    const sourceColumn = requireString(mapping.sourceColumn, `${entity.id}.mappings[].sourceColumn`);
    if (!declaredColumns.has(sourceColumn)) {
      fail(`${entity.id}: mapping usa columna no declarada ${sourceColumn}`);
    }
    requireString(mapping.targetField, `${entity.id}.${sourceColumn}.targetField`);
    requireString(mapping.transform, `${entity.id}.${sourceColumn}.transform`);
    requireString(mapping.classification, `${entity.id}.${sourceColumn}.classification`);
  }
  const mappedSourceColumns = mappings.map((mapping) => mapping.sourceColumn);
  const mappedTargetFields = mappings.map((mapping) => mapping.targetField);
  assertUnique(mappedSourceColumns, `${entity.id}.mappings.sourceColumn`);
  assertUnique(mappedTargetFields, `${entity.id}.mappings.targetField`);
  if (mappedSourceColumns.length !== columns.length
      || columns.some((column) => !mappedSourceColumns.includes(column.name))) {
    fail(`${entity.id}: cada source.columns debe tener exactamente un mapping`);
  }
  counters.tables.add(tableName);
}

function validateRelationship(relationship, tableByName, counters) {
  requireExactKeys(
    relationship,
    'relationships[]',
    ['id', 'kind', 'sourceTable', 'targetTable', 'purpose', 'columnPairs', 'reviewPolicy'],
    { optional: ['reviewPolicy'] },
  );
  requireString(relationship.id, 'relationship.id');
  if (!['foreign_key', 'logical_review_only'].includes(relationship.kind)) {
    fail(`${relationship.id}: kind invalido`);
  }
  const sourceTable = tableByName.get(requireString(relationship.sourceTable, `${relationship.id}.sourceTable`));
  const targetTable = tableByName.get(requireString(relationship.targetTable, `${relationship.id}.targetTable`));
  if (!sourceTable) fail(`${relationship.id}: sourceTable inexistente`);
  if (!targetTable) fail(`${relationship.id}: targetTable inexistente`);
  requireString(relationship.purpose, `${relationship.id}.purpose`);

  const sourceColumns = new Set(sourceTable.columns.map((column) => column.name));
  const targetColumns = new Set(targetTable.columns.map((column) => column.name));
  const pairs = requireArray(relationship.columnPairs, `${relationship.id}.columnPairs`);
  const actualForeignKeys = new Set(sourceTable.foreignKeys.map(normalizedForeignKey));

  for (const pair of pairs) {
    requireExactKeys(pair, `${relationship.id}.columnPairs[]`, ['source', 'target']);
    const source = requireStringArray(pair.source, `${relationship.id}.columnPairs[].source`);
    const target = requireStringArray(pair.target, `${relationship.id}.columnPairs[].target`);
    if (source.length !== target.length) fail(`${relationship.id}: cardinalidad de columnas desigual`);
    source.forEach((column) => {
      if (!sourceColumns.has(column)) fail(`${relationship.id}: columna fuente inexistente ${column}`);
    });
    target.forEach((column) => {
      if (!targetColumns.has(column)) fail(`${relationship.id}: columna destino inexistente ${column}`);
    });
    if (relationship.kind === 'foreign_key') {
      const key = normalizedForeignKey({
        columns: source,
        referencedTable: targetTable.name,
        referencedColumns: target,
      });
      if (!actualForeignKeys.has(key)) {
        fail(`${relationship.id}: FK no declarada en el dump (${sourceTable.name} -> ${targetTable.name})`);
      }
      const qualifiedKey = `${sourceTable.name}\u001d${key}`;
      if (counters.foreignKeys.has(qualifiedKey)) {
        fail(`${relationship.id}: FK declarada mas de una vez`);
      }
      counters.foreignKeys.add(qualifiedKey);
    }
  }

  if (relationship.kind === 'logical_review_only') {
    const review = requireExactKeys(
      relationship.reviewPolicy,
      `${relationship.id}.reviewPolicy`,
      ['autoLink', 'requiredDecision'],
    );
    requireBoolean(review.autoLink, `${relationship.id}.reviewPolicy.autoLink`);
    if (review.autoLink !== false) fail(`${relationship.id}: un enlace logico no puede auto-vincularse`);
    requireString(review.requiredDecision, `${relationship.id}.reviewPolicy.requiredDecision`);
  } else if (relationship.reviewPolicy !== undefined) {
    fail(`${relationship.id}: reviewPolicy solo corresponde a logical_review_only`);
  }
}

function validateQuarantineRule(rule, tableByName) {
  requireExactKeys(
    rule,
    'quarantineRules[]',
    ['code', 'tables', 'condition', 'reason', 'severity', 'action', 'autoPromote', 'releaseGate'],
  );
  requireString(rule.code, 'quarantineRules[].code');
  if (!/^[A-Z][A-Z0-9_]+$/.test(rule.code)) fail(`codigo de cuarentena invalido: ${rule.code}`);
  const tables = requireStringArray(rule.tables, `${rule.code}.tables`);
  tables.forEach((table) => {
    if (!tableByName.has(table)) fail(`${rule.code}: tabla inexistente ${table}`);
  });
  requireString(rule.condition, `${rule.code}.condition`);
  requireString(rule.reason, `${rule.code}.reason`);
  requireString(rule.severity, `${rule.code}.severity`);
  if (!['critical', 'high', 'medium', 'low'].includes(rule.severity)) {
    fail(`${rule.code}.severity invalida`);
  }
  if (rule.action !== 'quarantine') fail(`${rule.code}: action debe ser quarantine`);
  requireBoolean(rule.autoPromote, `${rule.code}.autoPromote`);
  if (rule.autoPromote !== false) fail(`${rule.code}: autoPromote debe ser false`);
  requireString(rule.releaseGate, `${rule.code}.releaseGate`);
}

export function validateSourceMappingManifest(manifest, profile) {
  requireObject(manifest, 'manifest');
  requireObject(profile, 'profile');
  const profileEvidence = validateSourceEnvelope(manifest, profile);
  const { profileKind, tables, tableByName, materializedSummary } = profileEvidence;

  const tenantBindingTable = tableByName.get(manifest.source.tenantBinding.sourceTable);
  if (!tenantBindingTable) fail('source.tenantBinding.sourceTable no existe en el perfil');
  const tenantBindingColumns = new Set(tenantBindingTable.columns.map((column) => column.name));
  manifest.source.tenantBinding.sourceColumns.forEach((column) => {
    if (!tenantBindingColumns.has(column)) {
      fail(`source.tenantBinding.sourceColumns usa columna inexistente ${column}`);
    }
  });

  const domains = new Set(manifest.requiredDomains);
  const counters = { tables: new Set(), columns: 0, foreignKeys: new Set() };
  const entities = requireArray(manifest.entities, 'entities');
  assertUnique(entities.map((entity) => entity.id), 'entity.id');
  requireExactSet(
    entities.map((entity) => entity.id),
    new Set(REQUIRED_CAPABILITIES_BY_ENTITY.keys()),
    'entities.id',
  );
  assertUnique(entities.map((entity) => entity.source?.table), 'entities.source.table');
  entities.forEach((entity) => validateEntity(entity, tableByName, domains, counters));

  const entityDomains = new Set(entities.map((entity) => entity.domain));
  for (const domain of REQUIRED_DOMAINS) {
    if (!entityDomains.has(domain)) fail(`no hay entidad para el dominio requerido ${domain}`);
  }

  const relationships = requireArray(manifest.relationships, 'relationships');
  assertUnique(relationships.map((relationship) => relationship.id), 'relationship.id');
  relationships.forEach((relationship) => validateRelationship(relationship, tableByName, counters));

  if (profileKind === 'safe_mapping_subset') {
    requireExactSet([...counters.tables], new Set(tableByName.keys()), 'entities.source.table');
    if (counters.columns !== materializedSummary.columnCount) {
      fail('entities.source.columns no cubre todas las columnas del subset seguro');
    }
    if (counters.foreignKeys.size !== materializedSummary.foreignKeyCount) {
      fail('relationships no cubre todas las FK del subset seguro');
    }
  }

  const rules = requireArray(manifest.quarantineRules, 'quarantineRules');
  assertUnique(rules.map((rule) => rule.code), 'quarantineRules.code');
  rules.forEach((rule) => validateQuarantineRule(rule, tableByName));
  const ruleCodes = rules.map((rule) => rule.code);
  for (const code of REQUIRED_QUARANTINE_CODES) {
    if (!ruleCodes.includes(code)) fail(`quarantineRules omite ${code}`);
  }
  const quarantinedTables = new Set(rules.flatMap((rule) => rule.tables));
  for (const table of counters.tables) {
    if (!quarantinedTables.has(table)) fail(`quarantineRules no cubre la tabla mapeada ${table}`);
  }

  const gates = requireArray(manifest.migrationGates, 'migrationGates');
  assertUnique(gates.map((gate) => requireString(gate.id, 'migrationGates[].id')), 'migrationGates.id');
  gates.forEach((gate) => {
    requireExactKeys(gate, 'migrationGates[]', ['id', 'condition', 'failureMode']);
    requireString(gate.condition, `${gate.id}.condition`);
    requireString(gate.failureMode, `${gate.id}.failureMode`);
    if (gate.failureMode !== 'abort') fail(`${gate.id}.failureMode debe ser abort`);
  });
  requireExactSet(gates.map((gate) => gate.id), REQUIRED_GATE_IDS, 'migrationGates.id');

  return {
    status: 'valid',
    manifestId: manifest.manifestId,
    manifestVersion: manifest.manifestVersion,
    sourceTablesValidated: counters.tables.size,
    sourceColumnsValidated: counters.columns,
    foreignKeysValidated: counters.foreignKeys.size,
    relationshipsValidated: relationships.length,
    quarantineRulesValidated: rules.length,
  };
}

function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (!['--manifest', '--profile'].includes(option)) fail(`opcion desconocida: ${option}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`falta valor para ${option}`);
    result[option.slice(2)] = value;
    index += 1;
  }
  if (!result.manifest || !result.profile) {
    fail('uso: node scripts/validate-grh-source-mapping.mjs --manifest <manifest.json> --profile <safe-profile.json>');
  }
  return result;
}

async function main() {
  const argumentsByName = parseArguments(process.argv.slice(2));
  const [manifestText, profileText] = await Promise.all([
    readFile(path.resolve(argumentsByName.manifest), 'utf8'),
    readFile(path.resolve(argumentsByName.profile), 'utf8'),
  ]);
  const result = validateSourceMappingManifest(JSON.parse(manifestText), JSON.parse(profileText));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const isMain = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error.name}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
