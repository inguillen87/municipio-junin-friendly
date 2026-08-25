import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
  AttendanceInventoryImportError,
  JUNIN_ATTENDANCE_IMPORT_PLAN_VERSION,
  JUNIN_ATTENDANCE_WORKBOOK_MAPPING_VERSION,
  buildJuninAttendanceImportPlan,
  executeJuninAttendanceImportPlan,
  loadJuninAttendanceImportConfig,
  loadJuninAttendanceQaSession,
  validateJuninAttendanceInventory,
  verifyJuninAttendanceSourceArtifact,
  verifyJuninAttendanceWorkbookLineage,
} from '../scripts/import-junin-attendance-inventory.mjs';

const manifestBytes = readFileSync(
  new URL('../data/junin-attendance-inventory.v1.json', import.meta.url),
);
const inventory = JSON.parse(manifestBytes.toString('utf8'));
const manifestSha256 = createHash('sha256').update(manifestBytes).digest('hex');
const workbookRange = JSON.parse(readFileSync(
  new URL('./fixtures/junin-attendance-workbook-a4-k17.v1.json', import.meta.url),
  'utf8',
));
const fakeWorkbook = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x01, 0x02, 0x03]);
const municipalWorkbookPath = 'C:\\Users\\guill\\Downloads\\P3-PUNTOS DE MARCACION.xlsx';

function hasCode(code) {
  return (error) => error instanceof AttendanceInventoryImportError && error.code === code;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function workbookRows(range = workbookRange) {
  return [[], [], [], ...clone(range)];
}

function inventoryForFakeWorkbook() {
  const fixture = clone(inventory);
  fixture.source.sha256 = createHash('sha256').update(fakeWorkbook).digest('hex');
  return fixture;
}

function plan(options = {}) {
  return buildJuninAttendanceImportPlan(inventory, {
    tenantSlug: 'junin-mendoza',
    manifestFileSha256: manifestSha256,
    artifactVerified: options.artifactVerified ?? true,
  });
}

function qaSession() {
  return loadJuninAttendanceQaSession({
    ATTENDANCE_QA_ACTOR_EMAIL: 'qa.operator@example.invalid',
    ATTENDANCE_QA_SESSION_ID: '10000000-0000-4000-8000-000000000001',
    ATTENDANCE_QA_SESSION_VERSION: '3',
    ATTENDANCE_QA_RELEASE_SHA: 'a'.repeat(40),
    ATTENDANCE_QA_TENANT_ID: '20000000-0000-4000-8000-000000000002',
    ATTENDANCE_QA_MEMBERSHIP_ID: '30000000-0000-4000-8000-000000000003',
  }, 'junin-mendoza');
}

test('valida el contrato exacto, fuente XLSX y nueve campos físicos pendientes', () => {
  const result = validateJuninAttendanceInventory(inventory);
  assert.equal(result.contractVersion, 'junin-attendance-inventory.v1');
  assert.equal(result.tenantSlug, 'junin-mendoza');
  assert.equal(result.source.recordCount, 13);
  assert.equal(result.source.fileName, 'P3-PUNTOS DE MARCACION.xlsx');
  assert.match(result.source.sha256, /^[a-f0-9]{64}$/);
  assert.match(result.source.rangeSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.source.mappingVersion, JUNIN_ATTENDANCE_WORKBOOK_MAPPING_VERSION);
  assert.equal(result.sites.length, 13);
  assert.equal(result.unresolvedRequiredFields.length, 9);
  assert.equal(Object.isFrozen(result), true);
});

test('rechaza versión, SHA, formato, conteo, duplicados y material credencial', () => {
  const badVersion = clone(inventory);
  badVersion.contractVersion = 'junin-attendance-inventory.v2';
  assert.throws(() => validateJuninAttendanceInventory(badVersion),
    hasCode('ATTENDANCE_INVENTORY_VERSION_INVALID'));
  const badSha = clone(inventory);
  badSha.source.sha256 = 'no-es-sha';
  assert.throws(() => validateJuninAttendanceInventory(badSha),
    hasCode('ATTENDANCE_INVENTORY_SHA_INVALID'));
  const badRangeSha = clone(inventory);
  badRangeSha.source.rangeSha256 = 'no-es-sha';
  assert.throws(() => validateJuninAttendanceInventory(badRangeSha),
    hasCode('ATTENDANCE_INVENTORY_RANGE_SHA_INVALID'));
  const badMapping = clone(inventory);
  badMapping.source.mappingVersion = 'junin-attendance-workbook-a4-k17.v2';
  assert.throws(() => validateJuninAttendanceInventory(badMapping),
    hasCode('ATTENDANCE_INVENTORY_SOURCE_INVALID'));
  const badRange = clone(inventory);
  badRange.source.range = 'A4:K18';
  assert.throws(() => validateJuninAttendanceInventory(badRange),
    hasCode('ATTENDANCE_INVENTORY_SOURCE_INVALID'));
  const badFormat = clone(inventory);
  badFormat.source.fileName = 'puntos.csv';
  assert.throws(() => validateJuninAttendanceInventory(badFormat),
    hasCode('ATTENDANCE_INVENTORY_FORMAT_INVALID'));
  const badCount = clone(inventory);
  badCount.source.recordCount = 12;
  assert.throws(() => validateJuninAttendanceInventory(badCount),
    hasCode('ATTENDANCE_INVENTORY_COUNT_MISMATCH'));
  const duplicate = clone(inventory);
  duplicate.sites[1].code = duplicate.sites[0].code;
  assert.throws(() => validateJuninAttendanceInventory(duplicate),
    hasCode('ATTENDANCE_INVENTORY_SITE_INVALID'));
  const credential = clone(inventory);
  credential.defaults.token = 'plain';
  assert.throws(() => validateJuninAttendanceInventory(credential),
    hasCode('ATTENDANCE_INVENTORY_CREDENTIAL_MATERIAL'));
});

test('verificación binaria exige nombre, firma XLSX y SHA exactos', () => {
  const artifact = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x01, 0x02, 0x03]);
  const fixture = clone(inventory);
  fixture.source.sha256 = createHash('sha256').update(artifact).digest('hex');
  const verified = verifyJuninAttendanceSourceArtifact(
    fixture, artifact, 'P3-PUNTOS DE MARCACION.xlsx',
  );
  assert.deepEqual(verified, {
    verified: true,
    fileName: 'P3-PUNTOS DE MARCACION.xlsx',
    sha256: fixture.source.sha256,
    format: 'xlsx',
  });
  assert.throws(() => verifyJuninAttendanceSourceArtifact(
    fixture, Buffer.from('no-xlsx'), 'P3-PUNTOS DE MARCACION.xlsx',
  ), hasCode('ATTENDANCE_INVENTORY_FORMAT_INVALID'));
  assert.throws(() => verifyJuninAttendanceSourceArtifact(
    fixture, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x09]), 'P3-PUNTOS DE MARCACION.xlsx',
  ), hasCode('ATTENDANCE_INVENTORY_SHA_MISMATCH'));
});

test('verifica reproduciblemente A4:K17 y las 13 filas versionadas', async () => {
  const fixture = inventoryForFakeWorkbook();
  const receipt = await verifyJuninAttendanceWorkbookLineage(
    fixture,
    fakeWorkbook,
    'P3-PUNTOS DE MARCACION.xlsx',
    {
      readSheet: async (bytes, sheet) => {
        assert.deepEqual(bytes, fakeWorkbook);
        assert.equal(sheet, 'Hoja1');
        return workbookRows();
      },
    },
  );
  assert.deepEqual(receipt, {
    verified: true,
    lineageVerified: true,
    fileName: 'P3-PUNTOS DE MARCACION.xlsx',
    sha256: fixture.source.sha256,
    format: 'xlsx',
    sheet: 'Hoja1',
    range: 'A4:K17',
    rangeSha256: inventory.source.rangeSha256,
    mappingVersion: JUNIN_ATTENDANCE_WORKBOOK_MAPPING_VERSION,
    recordCount: 13,
  });
});

test('rechaza cabecera o contenido alterado dentro de A4:K17', async () => {
  const fixture = inventoryForFakeWorkbook();
  const badHeader = clone(workbookRange);
  badHeader[0][0] = 'Código alterado';
  await assert.rejects(verifyJuninAttendanceWorkbookLineage(
    fixture, fakeWorkbook, fixture.source.fileName,
    { readSheet: async () => workbookRows(badHeader) },
  ), hasCode('ATTENDANCE_INVENTORY_HEADER_MISMATCH'));

  const badCell = clone(workbookRange);
  badCell[1][7] = 'sin conectividad';
  await assert.rejects(verifyJuninAttendanceWorkbookLineage(
    fixture, fakeWorkbook, fixture.source.fileName,
    { readSheet: async () => workbookRows(badCell) },
  ), hasCode('ATTENDANCE_INVENTORY_RANGE_SHA_MISMATCH'));
});

test('rechaza JSON divergente y errores de lectura XLSX sin filtrar detalles', async () => {
  const divergent = inventoryForFakeWorkbook();
  divergent.sites[0].model = 'SF300';
  await assert.rejects(verifyJuninAttendanceWorkbookLineage(
    divergent, fakeWorkbook, divergent.source.fileName,
    { readSheet: async () => workbookRows() },
  ), hasCode('ATTENDANCE_INVENTORY_LINEAGE_MISMATCH'));

  await assert.rejects(verifyJuninAttendanceWorkbookLineage(
    inventoryForFakeWorkbook(), fakeWorkbook, inventory.source.fileName,
    { readSheet: async () => { throw new Error('detalle interno del parser'); } },
  ), (error) => hasCode('ATTENDANCE_INVENTORY_WORKBOOK_INVALID')(error)
    && !error.message.includes('detalle interno'));
});

test('el XLSX municipal real verifica hash, rango y linaje sin importar datos', {
  skip: !existsSync(municipalWorkbookPath),
}, async () => {
  const receipt = await verifyJuninAttendanceWorkbookLineage(
    inventory,
    readFileSync(municipalWorkbookPath),
    'P3-PUNTOS DE MARCACION.xlsx',
  );
  assert.equal(receipt.sha256, inventory.source.sha256);
  assert.equal(receipt.rangeSha256, inventory.source.rangeSha256);
  assert.equal(receipt.recordCount, 13);
  assert.equal(receipt.lineageVerified, true);
});

test('plan genera 13 sitios y 13 dispositivos deterministas sin conector ni geocerca inventada', () => {
  const first = plan();
  const replay = plan();
  assert.equal(first.contractVersion, JUNIN_ATTENDANCE_IMPORT_PLAN_VERSION);
  assert.equal(first.steps.length, 26);
  assert.equal(first.planId, replay.planId);
  assert.equal(first.source.rangeSha256, inventory.source.rangeSha256);
  assert.equal(first.source.mappingVersion, JUNIN_ATTENDANCE_WORKBOOK_MAPPING_VERSION);
  assert.equal(first.source.lineageVerified, true);
  assert.deepEqual(first.steps.map((step) => step.idempotencyKey),
    replay.steps.map((step) => step.idempotencyKey));
  assert.equal(new Set(first.steps.map((step) => step.idempotencyKey)).size, 26);
  for (let index = 0; index < first.steps.length; index += 2) {
    const site = first.steps[index];
    const device = first.steps[index + 1];
    assert.equal(site.resource, 'site');
    assert.equal(site.body.command, 'site.create');
    assert.equal(site.body.payload.addressText, inventory.sites[index / 2].address);
    assert.equal(site.body.payload.geofenceRadiusM, null);
    assert.equal(typeof site.body.payload.latitude, 'number');
    assert.equal(typeof site.body.payload.longitude, 'number');
    assert.equal(device.resource, 'device');
    assert.equal(device.siteExternalKeyRef, site.externalKey);
    assert.equal(device.payloadTemplate.driverKey, 'pending-homologation');
    assert.deepEqual(device.payloadTemplate.capabilities, {
      pull: false, push: false, biometric: false, card: false, pin: false,
    });
  }
  assert.equal(first.safety.connectorsCreated, false);
  assert.equal(first.safety.credentialsStored, false);
  assert.match(JSON.stringify(first), /Don Bosco y Sarmiento/);
  assert.doesNotMatch(JSON.stringify(first.sourceFieldsHeldOutsideGateway), /sites\[\]\.address/);
});

test('config CLI exige tenant y confirmación aislada, y rechaza Production', () => {
  assert.throws(() => loadJuninAttendanceImportConfig([
    '--tenant-slug=junin-mendoza',
  ]), hasCode('ATTENDANCE_IMPORT_QA_CONFIRMATION_REQUIRED'));
  assert.throws(() => loadJuninAttendanceImportConfig([
    '--confirm-isolated-branch',
  ]), hasCode('ATTENDANCE_IMPORT_ARGUMENT_INVALID'));
  assert.throws(() => loadJuninAttendanceImportConfig([
    '--confirm-isolated-branch', '--tenant-slug=junin-mendoza', '--execute',
  ], { VERCEL_ENV: 'production' }), hasCode('ATTENDANCE_IMPORT_PRODUCTION_FORBIDDEN'));
  assert.throws(() => loadJuninAttendanceImportConfig([
    '--confirm-production-branch=br-production', '--tenant-slug=junin-mendoza',
  ]), hasCode('ATTENDANCE_IMPORT_PRODUCTION_FORBIDDEN'));
  assert.deepEqual(loadJuninAttendanceImportConfig([
    '--confirm-isolated-branch', '--tenant-slug=junin-mendoza',
    '--source-artifact=C:\\evidencia\\P3-PUNTOS DE MARCACION.xlsx',
  ]), {
    confirmation: 'isolated-branch', execute: false, tenantSlug: 'junin-mendoza',
    sourceArtifactPath: 'C:\\evidencia\\P3-PUNTOS DE MARCACION.xlsx',
  });
});

test('sesión QA es all-or-none y no admite coordenadas incompletas', () => {
  assert.throws(() => loadJuninAttendanceQaSession({}, 'junin-mendoza'),
    hasCode('ATTENDANCE_IMPORT_SESSION_REQUIRED'));
  assert.throws(() => loadJuninAttendanceQaSession({
    ATTENDANCE_QA_ACTOR_EMAIL: 'qa@example.invalid',
  }, 'junin-mendoza'), hasCode('ATTENDANCE_IMPORT_SESSION_REQUIRED'));
  assert.equal(qaSession().identityPrincipal.tenant.source, 'membership');
});

function fakeClient(tenantId) {
  const calls = [];
  return {
    calls,
    async query(statement, values = []) {
      calls.push({ statement, values });
      if (/SELECT id::text AS id FROM platform_tenant/.test(statement)) {
        return { rowCount: 1, rows: [{ id: tenantId }] };
      }
      return { rowCount: 0, rows: [] };
    },
  };
}

test('ejecución usa gateway secuencialmente, resuelve siteId y no crea conectores', async () => {
  const session = qaSession();
  const client = fakeClient(session.identityPrincipal.tenant.id);
  const applied = [];
  let generated = 10;
  const dependencies = {
    getBootstrap: async () => ({
      capabilities: ['attendance.read', 'attendance.site.manage', 'attendance.device.manage'],
    }),
    listResources: async (_client, _principal, options) => ({
      resource: options.resource, data: [], pagination: { page: 1, pageSize: 100, total: 0, pages: 0 },
    }),
    applyCommand: async (_client, _principal, _session, body, idempotencyKey) => {
      applied.push({ body, idempotencyKey });
      generated += 1;
      return { data: { id: `40000000-0000-4000-8000-${String(generated).padStart(12, '0')}` } };
    },
  };
  const result = await executeJuninAttendanceImportPlan({
    client, plan: plan(), qaSession: session, dependencies,
  });
  assert.equal(result.ok, true);
  assert.equal(result.sitesCreated, 13);
  assert.equal(result.devicesCreated, 13);
  assert.equal(result.connectorsCreated, 0);
  assert.equal(applied.length, 26);
  for (let index = 0; index < applied.length; index += 2) {
    assert.equal(applied[index].body.command, 'site.create');
    assert.equal(applied[index + 1].body.command, 'device.create');
    assert.equal(applied[index + 1].body.payload.siteId, applied[index].body.command === 'site.create'
      ? `40000000-0000-4000-8000-${String(11 + (index / 2) * 2).padStart(12, '0')}`
      : null);
  }
  assert.equal(client.calls[0].statement, 'BEGIN');
  assert.equal(client.calls.at(-1).statement, 'COMMIT');
});

test('ejecución aborta y hace rollback ante drift existente', async () => {
  const session = qaSession();
  const client = fakeClient(session.identityPrincipal.tenant.id);
  const existingSite = {
    id: '50000000-0000-4000-8000-000000000005',
    externalKey: 'pm-01', label: 'Nombre incorrecto',
    timezone: 'America/Argentina/Mendoza', latitude: -33.1443994, longitude: -68.4861441,
    geofenceRadiusM: null, networkEnabled: true, removableMediaEnabled: false,
  };
  await assert.rejects(executeJuninAttendanceImportPlan({
    client,
    plan: plan(),
    qaSession: session,
    dependencies: {
      getBootstrap: async () => ({
        capabilities: ['attendance.site.manage', 'attendance.device.manage'],
      }),
      listResources: async (_client, _principal, options) => ({
        data: options.resource === 'site' ? [existingSite] : [],
        pagination: { page: 1, pageSize: 100, total: options.resource === 'site' ? 1 : 0, pages: 1 },
      }),
      applyCommand: async () => assert.fail('no debe mutar ante drift'),
    },
  }), hasCode('ATTENDANCE_IMPORT_EXISTING_SITE_DRIFT'));
  assert.equal(client.calls.at(-1).statement, 'ROLLBACK');
});
