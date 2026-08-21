import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  SourceMappingValidationError,
  validateSourceMappingManifest,
} from '../scripts/validate-grh-source-mapping.mjs';

const manifestPath = path.resolve('contracts/grh-junin-mariadb-to-canonical.v1.json');
const fixturePath = path.resolve('tests/fixtures/grh-junin-safe-schema-subset.v1.json');

async function loadEvidence() {
  const [manifestText, profileText] = await Promise.all([
    readFile(manifestPath, 'utf8'),
    readFile(fixturePath, 'utf8'),
  ]);
  return {
    manifest: JSON.parse(manifestText),
    profile: JSON.parse(profileText),
    manifestText,
    profileText,
  };
}

test('valida el manifiesto versionado contra el subconjunto estructural seguro del backup real', async () => {
  const { manifest, profile } = await loadEvidence();
  const result = validateSourceMappingManifest(manifest, profile);

  assert.deepEqual(result, {
    status: 'valid',
    manifestId: 'grh-junin-mariadb-to-municontrol.v1',
    manifestVersion: '1.0.0',
    sourceTablesValidated: 29,
    sourceColumnsValidated: 212,
    foreignKeysValidated: 57,
    relationshipsValidated: 48,
    quarantineRulesValidated: 15,
  });
  assert.equal(manifest.privacy.containsPersonalData, true);
  assert.equal(manifest.privacy.rowValuesEmbedded, false);
  assert.ok(manifest.entities.some((entity) => entity.id === 'identity.person'));
  assert.ok(manifest.entities.some((entity) => entity.id === 'time.punch'));
  assert.ok(manifest.entities.some((entity) => entity.id === 'payroll.fact'));
  assert.equal(manifest.minimumSchemaMigration, '011-versioned-time-catalog');
  assert.ok(manifest.entities.every((entity) => entity.keyStrategy.tenantScoped === true));
  assert.ok(manifest.entities.every((entity) => entity.accessPolicy.tenantBound === true));
  assert.ok(manifest.entities.every((entity) => entity.accessPolicy.capabilities.length > 0));
  assert.ok(manifest.quarantineRules.every((rule) => rule.autoPromote === false));
});

test('exige perfil versionado, dialecto MariaDB y coherencia entre resumen completo y subset', async () => {
  const { manifest, profile } = await loadEvidence();

  const missingSql = structuredClone(profile);
  delete missingSql.sql;
  assert.throws(() => validateSourceMappingManifest(manifest, missingSql), /profile\.sql es obligatorio/);

  const wrongTool = structuredClone(profile);
  wrongTool.toolVersion = 'fixture-local';
  assert.throws(() => validateSourceMappingManifest(manifest, wrongTool), /toolVersion debe ser 1\.0\.0/);

  const wrongDialect = structuredClone(profile);
  wrongDialect.sql.dialect = 'PostgreSQL';
  assert.throws(() => validateSourceMappingManifest(manifest, wrongDialect), /dialect debe ser MariaDB\/MySQL/);

  const inconsistentSubset = structuredClone(profile);
  inconsistentSubset.selection.columnCount -= 1;
  assert.throws(
    () => validateSourceMappingManifest(manifest, inconsistentSubset),
    /selection\.columnCount no coincide con profile\.tables/,
  );

  const impossibleFullTotal = structuredClone(profile);
  impossibleFullTotal.summary.foreignKeyCount = profile.selection.foreignKeyCount - 1;
  assert.throws(
    () => validateSourceMappingManifest(manifest, impossibleFullTotal),
    /summary\.foreignKeyCount no puede ser menor/,
  );
});

test('rechaza propiedades desconocidas y cargas de valores tanto en manifiesto como en perfil', async () => {
  const { manifest, profile } = await loadEvidence();

  const manifestRows = structuredClone(manifest);
  manifestRows.rowData = [{ arbitrary: 'valor-no-permitido' }];
  assert.throws(() => validateSourceMappingManifest(manifestRows, profile), /manifest\.rowData no esta permitido/);

  const nestedManifestRows = structuredClone(manifest);
  nestedManifestRows.entities[0].source.rowData = [{ arbitrary: 'valor-no-permitido' }];
  assert.throws(
    () => validateSourceMappingManifest(nestedManifestRows, profile),
    /tenant\.municipality\.source\.rowData no esta permitido/,
  );

  const profileRows = structuredClone(profile);
  profileRows.rowData = [{ arbitrary: 'valor-no-permitido' }];
  assert.throws(() => validateSourceMappingManifest(manifest, profileRows), /profile\.rowData no esta permitido/);

  const nestedProfileRows = structuredClone(profile);
  nestedProfileRows.tables[0].rowData = [{ arbitrary: 'valor-no-permitido' }];
  assert.throws(
    () => validateSourceMappingManifest(manifest, nestedProfileRows),
    /profile\.tables\[\]\.rowData no esta permitido/,
  );
});

test('exige sourceSystem GRH exacto y cobertura completa de mappings y entidades', async () => {
  const { manifest, profile } = await loadEvidence();

  const wrongSource = structuredClone(manifest);
  wrongSource.source.system = 'GRH_IMPORT';
  assert.throws(() => validateSourceMappingManifest(wrongSource, profile), /source\.system debe ser GRH/);

  const wrongKeySource = structuredClone(manifest);
  wrongKeySource.keyEncoding.sourceSystem = 'grh';
  assert.throws(() => validateSourceMappingManifest(wrongKeySource, profile), /keyEncoding\.sourceSystem debe ser GRH/);

  const omittedMapping = structuredClone(manifest);
  omittedMapping.entities.find((entity) => entity.id === 'time.shift').mappings.pop();
  assert.throws(
    () => validateSourceMappingManifest(omittedMapping, profile),
    /cada source\.columns debe tener exactamente un mapping/,
  );

  const omittedEntity = structuredClone(manifest);
  omittedEntity.entities = omittedEntity.entities.filter((entity) => entity.id !== 'payroll.movement');
  assert.throws(() => validateSourceMappingManifest(omittedEntity, profile), /entities\.id omite payroll\.movement/);
});

test('impone tenant binding y matriz de capabilities fail-closed', async () => {
  const { manifest, profile } = await loadEvidence();

  const unscoped = structuredClone(manifest);
  unscoped.entities.find((entity) => entity.id === 'identity.person').keyStrategy.tenantScoped = false;
  assert.throws(() => validateSourceMappingManifest(unscoped, profile), /tenantScoped debe ser true/);

  const emptyCapabilities = structuredClone(manifest);
  emptyCapabilities.entities.find((entity) => entity.id === 'payroll.fact').accessPolicy.capabilities = [];
  assert.throws(() => validateSourceMappingManifest(emptyCapabilities, profile), /arreglo no vacio/);

  const missingRequiredCapability = structuredClone(manifest);
  missingRequiredCapability.entities.find((entity) => entity.id === 'time.shift')
    .accessPolicy.capabilities = ['time.catalog.propose'];
  assert.throws(() => validateSourceMappingManifest(missingRequiredCapability, profile), /capabilities omite time\.catalog\.approve/);

  const inventedCapability = structuredClone(manifest);
  inventedCapability.entities.find((entity) => entity.id === 'payroll.fact')
    .accessPolicy.capabilities.push('payroll.superuser');
  assert.throws(() => validateSourceMappingManifest(inventedCapability, profile), /capability no reconocida/);
});

test('exige cuarentenas y gates canonicos completos sin reemplazos arbitrarios', async () => {
  const { manifest, profile } = await loadEvidence();

  const missingQuarantine = structuredClone(manifest);
  missingQuarantine.quarantineRules = missingQuarantine.quarantineRules
    .filter((rule) => rule.code !== 'NOMINAL_ACCESS_CONTROL_NOT_READY');
  assert.throws(
    () => validateSourceMappingManifest(missingQuarantine, profile),
    /quarantineRules omite NOMINAL_ACCESS_CONTROL_NOT_READY/,
  );

  const missingGate = structuredClone(manifest);
  missingGate.migrationGates = missingGate.migrationGates
    .filter((gate) => gate.id !== 'G10_DRY_RUN_IDEMPOTENCY');
  assert.throws(
    () => validateSourceMappingManifest(missingGate, profile),
    /migrationGates\.id omite G10_DRY_RUN_IDEMPOTENCY/,
  );

  const unknownGateField = structuredClone(manifest);
  unknownGateField.migrationGates[0].rowData = ['valor-no-permitido'];
  assert.throws(() => validateSourceMappingManifest(unknownGateField, profile), /rowData no esta permitido/);
});

test('falla cerrado si una tabla, columna, tipo, PK o huella divergen del perfil', async () => {
  const { manifest, profile } = await loadEvidence();

  const missingTable = structuredClone(manifest);
  missingTable.entities[0].source.table = 'tabla_inventada';
  assert.throws(
    () => validateSourceMappingManifest(missingTable, profile),
    (error) => error instanceof SourceMappingValidationError && /tabla fuente inexistente/.test(error.message),
  );

  const missingColumn = structuredClone(manifest);
  missingColumn.entities.find((entity) => entity.id === 'identity.person')
    .source.columns[0].name = 'COLUMNA_INVENTADA';
  assert.throws(
    () => validateSourceMappingManifest(missingColumn, profile),
    /columna persona\.COLUMNA_INVENTADA no existe/,
  );

  const wrongType = structuredClone(manifest);
  wrongType.entities.find((entity) => entity.id === 'time.punch')
    .source.columns.find((column) => column.name === 'FECH_159').type = 'datetime';
  assert.throws(() => validateSourceMappingManifest(wrongType, profile), /tipo fichadas\.FECH_159/);

  const wrongPrimaryKey = structuredClone(manifest);
  wrongPrimaryKey.entities.find((entity) => entity.id === 'employment.contract')
    .source.primaryKey = ['LEGA_12'];
  assert.throws(() => validateSourceMappingManifest(wrongPrimaryKey, profile), /primaryKey no coincide/);

  const wrongHash = structuredClone(manifest);
  wrongHash.source.snapshot.sha256 = '0'.repeat(64);
  assert.throws(() => validateSourceMappingManifest(wrongHash, profile), /sha256 no coincide/);
});

test('preserva MariaDB como formato fuente y gzip como contenedor', async () => {
  const { manifest, profile } = await loadEvidence();
  assert.equal(manifest.source.format, 'mariadb_dump');
  assert.equal(manifest.source.container, 'gzip');
  assert.doesNotThrow(() => validateSourceMappingManifest(manifest, profile));

  const disguised = structuredClone(manifest);
  disguised.source.format = 'postgres_relation';
  assert.throws(
    () => validateSourceMappingManifest(disguised, profile),
    /source\.format debe ser mariadb_dump/,
  );

  const wrongContainer = structuredClone(manifest);
  wrongContainer.source.container = 'plain-sql';
  assert.throws(
    () => validateSourceMappingManifest(wrongContainer, profile),
    /source\.container debe ser gzip/,
  );
});

test('declara y verifica la secuencia estatica 010A -> 011 para dumps MariaDB', async () => {
  const [manifestText, migration010, migration011] = await Promise.all([
    readFile(manifestPath, 'utf8'),
    readFile(path.resolve('scripts/migrations/010-governed-time-source-registry.sql'), 'utf8'),
    readFile(path.resolve('scripts/migrations/011-versioned-time-catalog.sql'), 'utf8'),
  ]);
  const manifest = JSON.parse(manifestText);

  assert.equal(manifest.minimumSchemaMigration, '011-versioned-time-catalog');
  assert.match(migration010, /CREATE OR REPLACE FUNCTION time_source_metadata_row_valid_v1\s*\(/);
  assert.doesNotMatch(migration010, /mariadb_dump|mysql_dump/);
  assert.match(migration011, /CREATE OR REPLACE FUNCTION time_source_metadata_row_valid_v1\s*\(/);
  assert.match(migration011, /'mariadb_dump','mysql_dump'/);
  assert.ok(
    migration011.indexOf('CREATE OR REPLACE FUNCTION time_source_metadata_row_valid_v1')
      < migration011.indexOf('CREATE TABLE IF NOT EXISTS time_catalog_entry'),
    '011 debe ampliar la fuente antes de crear el catalogo versionado',
  );
});

test('comprueba cada FK declarada y distingue enlaces logicos que requieren revision', async () => {
  const { manifest, profile } = await loadEvidence();

  const wrongForeignKey = structuredClone(manifest);
  const relationship = wrongForeignKey.relationships
    .find((entry) => entry.id === 'assignment_to_shift');
  relationship.columnPairs[0].source = ['CODI_157'];
  assert.throws(
    () => validateSourceMappingManifest(wrongForeignKey, profile),
    /FK no declarada en el dump/,
  );

  const unsafeLogicalLink = structuredClone(manifest);
  unsafeLogicalLink.relationships
    .find((entry) => entry.id === 'punch_expected_day_reconciliation')
    .reviewPolicy.autoLink = true;
  assert.throws(
    () => validateSourceMappingManifest(unsafeLogicalLink, profile),
    /enlace logico no puede auto-vincularse/,
  );
});

test('reconoce PII autorizada pero exige tenant binding, alcance y manifiesto sin valores', async () => {
  const { manifest, profile } = await loadEvidence();

  const deniesPii = structuredClone(manifest);
  deniesPii.privacy.containsPersonalData = false;
  assert.throws(() => validateSourceMappingManifest(deniesPii, profile), /debe reconocer la PII/);

  const unboundPii = structuredClone(manifest);
  unboundPii.entities.find((entity) => entity.id === 'payroll.fact')
    .accessPolicy.tenantBound = false;
  assert.throws(() => validateSourceMappingManifest(unboundPii, profile), /tenantBound debe ser true/);

  const embeddedValue = structuredClone(manifest);
  embeddedValue.entities[0].sampleValues = ['valor-no-permitido'];
  assert.throws(() => validateSourceMappingManifest(embeddedValue, profile), /sampleValues no esta permitido/);

  const unsafeProfile = structuredClone(profile);
  unsafeProfile.privacy.samplesEmitted = true;
  assert.throws(() => validateSourceMappingManifest(manifest, unsafeProfile), /perfil no acredita salida estructural/);
});

test('CLI emite solo resultado agregado y no modifica el backup ni conecta a Neon', async () => {
  const script = path.resolve('scripts/validate-grh-source-mapping.mjs');
  const result = spawnSync(process.execPath, [
    script,
    '--manifest', manifestPath,
    '--profile', fixturePath,
  ], { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, 'valid');
  assert.equal(output.sourceTablesValidated, 29);
  assert.deepEqual(Object.keys(output).sort(), [
    'foreignKeysValidated',
    'manifestId',
    'manifestVersion',
    'quarantineRulesValidated',
    'relationshipsValidated',
    'sourceColumnsValidated',
    'sourceTablesValidated',
    'status',
  ]);
});

test('el comando npm descubre un profile estructural seguro y ejecuta el validador completo', () => {
  const executable = process.platform === 'win32' ? process.env.ComSpec ?? 'cmd.exe' : 'npm';
  const args = process.platform === 'win32'
    ? ['/d', '/s', '/c', 'npm.cmd run data:validate:grh-mapping --silent']
    : ['run', 'data:validate:grh-mapping', '--silent'];
  const result = spawnSync(executable, args, { encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout.trim());
  assert.equal(output.status, 'valid');
  assert.equal(output.sourceTablesValidated, 29);
  assert.doesNotMatch(result.stdout, /rowData|password|secret/i);
});

test('fixture y manifiesto no incluyen valores de filas ni credenciales', async () => {
  const { manifestText, profileText } = await loadEvidence();
  for (const text of [manifestText, profileText]) {
    assert.doesNotMatch(text, /"sampleValues"\s*:/i);
    assert.doesNotMatch(text, /"rawValue"\s*:/i);
    assert.doesNotMatch(text, /"password"\s*:/i);
    assert.doesNotMatch(text, /"secret"\s*:/i);
  }
  assert.match(profileText, /"rawRowsRetained"\s*:\s*false/);
  assert.match(profileText, /"dataLiteralsEmitted"\s*:\s*false/);
  assert.match(profileText, /"samplesEmitted"\s*:\s*false/);
});
