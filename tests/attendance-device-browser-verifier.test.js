import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  ATTENDANCE_DEVICE_BROWSER_VIEWPORTS,
  buildAttendanceDeviceAuditFixtures,
  buildAttendanceDeviceAuthFixture,
  buildAttendanceDeviceBootstrapFixture,
  buildAttendanceDeviceBrowserFailure,
  buildAttendanceDeviceBrowserSummary,
  buildAttendanceDeviceEquipmentFixtures,
  buildAttendanceDeviceSiteFixtures,
  buildAttendanceReportedInventoryFixture,
  validateAttendanceDeviceApiRequest,
  validateAttendanceDeviceAuthRequest,
  validateAttendanceDeviceMutationRequest,
} from '../scripts/verify-attendance-device-browser.mjs';

const source = readFileSync(
  new URL('../scripts/verify-attendance-device-browser.mjs', import.meta.url),
  'utf8',
);
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const requestHeaders = Object.freeze({
  accept: 'application/json',
  'cache-control': 'no-store',
});

test('la matriz Playwright fija exactamente desktop y móvil requeridos', () => {
  assert.deepEqual(ATTENDANCE_DEVICE_BROWSER_VIEWPORTS, [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ]);
});

test('auth local es tenant, MFA y usa identidad inválida fuera de QA', () => {
  const auth = buildAttendanceDeviceAuthFixture();
  assert.equal(auth.ok, true);
  assert.equal(auth.authenticated, true);
  assert.equal(auth.sessionVersion, 2);
  assert.equal(auth.access.context, 'tenant');
  assert.equal(auth.authentication.mfaVerified, true);
  assert.match(auth.user.email, /@local\.invalid$/);
  assert.doesNotMatch(JSON.stringify(auth), /marcelo@|guillen\.marce|password|contrase(?:ñ|n)a/i);
});

test('bootstrap conserva el límite de hardware y biometría sin inventar actividad', () => {
  const reader = buildAttendanceDeviceBootstrapFixture();
  const auditor = buildAttendanceDeviceBootstrapFixture({ audit: true });
  assert.deepEqual(reader.capabilities, ['attendance.read']);
  assert.deepEqual(auditor.capabilities, ['attendance.audit.read', 'attendance.read']);
  assert.deepEqual(
    buildAttendanceDeviceBootstrapFixture({ manage: true }).capabilities,
    ['attendance.device.manage', 'attendance.read'],
  );
  assert.equal(reader.summary.siteCount, 13);
  assert.equal(reader.summary.deviceCount, 13);
  for (const key of ['connectorCount', 'activeConnectorCount', 'rawEventCount', 'punchCount', 'unmatchedPunchCount', 'pendingReviewCount']) {
    assert.equal(reader.summary[key], 0, `${key} no debe simular operación`);
  }
  assert.deepEqual(reader.features, {
    hardwareConnected: false,
    hoursCalculated: false,
    payrollPosted: false,
    biometricTemplatesStored: false,
  });
});

test('fixtures de puntos y equipos corresponden al inventario real reportado de 13 filas', () => {
  const sites = buildAttendanceDeviceSiteFixtures();
  const devices = buildAttendanceDeviceEquipmentFixtures();
  assert.equal(sites.length, 13);
  assert.equal(devices.length, 13);
  assert.deepEqual(sites.map((item) => item.externalKey), Array.from({ length: 13 }, (_, index) => `pm-${String(index + 1).padStart(2, '0')}`));
  assert.equal(sites.filter((item) => item.networkEnabled).length, 7);
  assert.equal(sites.filter((item) => item.removableMediaEnabled).length, 6);
  assert.deepEqual(
    Object.fromEntries(devices.map((item) => [item.model, (devices.filter((candidate) => candidate.model === item.model)).length])),
    { K20: 11, SF300: 1, MB360: 1 },
  );
  assert.ok(sites.every((item) => item.status === 'draft' && item.geofenceRadiusM === null));
  assert.ok(devices.every((item) => item.status === 'draft' && item.driverKey === 'pending-homologation'));
});

test('fixture cartográfica replica los 13 puntos mínimos sin PII ni metadatos internos de la planilla', () => {
  const fixture = buildAttendanceReportedInventoryFixture();
  assert.equal(fixture.ok, true);
  assert.equal(fixture.resource, 'reported-inventory');
  assert.equal(fixture.contract.version, 'attendance-reported-inventory.v1');
  assert.equal(fixture.source.recordCount, 13);
  assert.equal(fixture.physicalConnectionConfirmed, false);
  assert.equal(fixture.heatMetric, 'reported_site_density');
  assert.equal(fixture.data.length, 13);
  assert.equal(fixture.data.filter((item) => item.channel === 'network_pull').length, 7);
  assert.equal(fixture.data.filter((item) => item.channel === 'removable_media').length, 6);
  assert.deepEqual(fixture.data[0], {
    code: 'PM-01',
    name: 'Desarrollo Social',
    address: 'Don Bosco y Sarmiento',
    latitude: -33.1443994,
    longitude: -68.4861441,
    model: 'K20',
    channel: 'network_pull',
  });
  assert.doesNotMatch(
    JSON.stringify(fixture),
    /email|document|dni|cuil|employee|agent|responsible|principal|serial|firmware|ip_address|sha256/i,
  );
});

test('fixture de auditoría es paginable y no contiene payloads ni identidad personal', () => {
  const rows = buildAttendanceDeviceAuditFixtures();
  assert.equal(rows.length, 26);
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), [
      'actorKind', 'actorRole', 'command', 'id', 'occurredAt', 'targetId', 'targetKind',
    ]);
    assert.doesNotMatch(JSON.stringify(row), /@|before|after|payload|snapshot|token|secret|email/i);
  }
});

test('validador acepta sólo GET exactos y paginación de 25', () => {
  assert.deepEqual(validateAttendanceDeviceApiRequest({
    method: 'GET',
    pathname: '/api/internal-attendance',
    search: '?resource=bootstrap',
    headers: requestHeaders,
  }), { resource: 'bootstrap', page: 1 });
  assert.deepEqual(validateAttendanceDeviceApiRequest({
    method: 'GET',
    pathname: '/api/internal-attendance',
    search: '?resource=site&page=2&pageSize=25',
    headers: requestHeaders,
  }), { resource: 'site', page: 2 });
  assert.deepEqual(validateAttendanceDeviceApiRequest({
    method: 'GET',
    pathname: '/api/internal-attendance',
    search: '?resource=reported-inventory',
    headers: requestHeaders,
  }), { resource: 'reported-inventory', page: 1 });
  assert.throws(() => validateAttendanceDeviceApiRequest({
    method: 'GET',
    pathname: '/api/internal-attendance',
    search: '?resource=site&page=1&pageSize=100',
    headers: requestHeaders,
  }));
  assert.throws(() => validateAttendanceDeviceApiRequest({
    method: 'GET',
    pathname: '/api/internal-attendance',
    search: '?resource=reported-inventory&page=1',
    headers: requestHeaders,
  }));
  assert.throws(() => validateAttendanceDeviceApiRequest({
    method: 'GET',
    pathname: '/api/internal-attendance',
    search: '?resource=site&page=1&pageSize=25&tenantId=leak',
    headers: requestHeaders,
  }));
  assert.equal(validateAttendanceDeviceAuthRequest({
    method: 'GET',
    pathname: '/api/internal-auth',
    search: '',
    headers: { accept: 'application/json' },
  }), true);
});

test('commissioning browser exige POST exacto, UUID v4 y payload físico sin activación', () => {
  const body = {
    command: 'device.update',
    payload: {
      id: '60000000-0000-4000-8000-000000000001',
      expectedVersion: 1,
      serialNumber: 'K20-QA-0001',
      firmwareVersion: 'Ver 6.60 QA',
      protocolKey: 'zkteco-k20-qa',
      networkHost: '10.20.30.40',
      networkPort: 4370,
    },
  };
  assert.equal(validateAttendanceDeviceMutationRequest({
    method: 'POST',
    pathname: '/api/internal-attendance',
    search: '',
    headers: {
      ...requestHeaders,
      'content-type': 'application/json',
      'idempotency-key': '10000000-0000-4000-8000-000000000001',
    },
  }, body), body.payload);
  assert.throws(() => validateAttendanceDeviceMutationRequest({
    method: 'POST',
    pathname: '/api/internal-attendance',
    search: '',
    headers: {
      ...requestHeaders,
      'content-type': 'application/json',
      'idempotency-key': '10000000-0000-4000-8000-000000000001',
    },
  }, { ...body, payload: { ...body.payload, status: 'active' } }));
});

test('verificador sirve public, intercepta toda API y no conoce Neon ni credenciales', () => {
  assert.match(source, /PUBLIC_ROOT/);
  assert.match(source, /page\.route\('\*\*\/api\/\*\*'/);
  assert.match(source, /assertNoHorizontalOverflow/);
  assert.match(source, /assertFocusVisibleAndUsable/);
  assert.match(source, /assertReportedCoordinatesNotEmbedded/);
  assert.match(source, /LEAFLET_JS_PATH/);
  assert.match(source, /mapFallbackVerified:\s*true/);
  assert.match(source, /consoleErrors:\s*0/);
  assert.match(source, /databaseMutations:\s*false/);
  assert.doesNotMatch(source, /DATABASE_URL|NEON_DATABASE|@neondatabase|postgresql:\/\/|new\s+(?:Client|Pool)\b|sql`/i);
  assert.equal(
    packageJson.scripts['test:browser:attendance-devices'],
    'node scripts/build-friendly.mjs && node scripts/verify-attendance-device-browser.mjs',
  );
  assert.equal(packageJson.devDependencies.leaflet, '^1.9.4');
});

test('resúmenes públicos informan evidencia y fallo sin detalles internos', () => {
  assert.deepEqual(buildAttendanceDeviceBrowserSummary(), {
    ok: true,
    viewportsVerified: 2,
    accessProfilesVerified: 3,
    scenariosVerified: 6,
    reportedPointsVerified: 13,
    networkPointsVerified: 7,
    removableMediaPointsVerified: 6,
    geographicMapVerified: true,
    densityLayerVerified: true,
    reframeVerified: true,
    mapFallbackVerified: true,
    coordinatesEmbeddedInHtml: false,
    apiFullyIntercepted: true,
    databaseMutations: false,
    hardwareConnected: false,
    auditCapabilityScoped: true,
    paginationVerified: true,
    emptyStatesVerified: true,
    consoleErrors: 0,
    horizontalOverflow: false,
    focusRestored: true,
    deviceCommissioningVerified: true,
    screenshotsCaptured: 2,
  });
  assert.deepEqual(buildAttendanceDeviceBrowserFailure(), {
    ok: false,
    code: 'ATTENDANCE_DEVICE_BROWSER_VERIFICATION_FAILED',
  });
});
