import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const inventory = JSON.parse(readFileSync(
  new URL('../data/junin-attendance-inventory.v1.json', import.meta.url),
  'utf8',
));

test('inventario de marcación conserva la evidencia municipal sin afirmar conectividad', () => {
  assert.equal(inventory.contractVersion, 'junin-attendance-inventory.v1');
  assert.equal(inventory.tenantSlug, 'junin-mendoza');
  assert.equal(inventory.timezone, 'America/Argentina/Mendoza');
  assert.match(inventory.source.sha256, /^[a-f0-9]{64}$/);
  assert.match(inventory.source.rangeSha256, /^[a-f0-9]{64}$/);
  assert.equal(inventory.source.mappingVersion, 'junin-attendance-workbook-a4-k17.v1');
  assert.equal(inventory.source.sheet, 'Hoja1');
  assert.equal(inventory.source.range, 'A4:K17');
  assert.equal(inventory.source.recordCount, 13);
  assert.equal(inventory.source.verificationState, 'reported_inventory');
  assert.equal(inventory.defaults.inventoryState, 'pending_physical_verification');
  assert.equal(inventory.defaults.biometricRetention, 'device_or_local_controller_only');
});

test('los 13 puntos tienen código, coordenadas y un equipo reportado únicos', () => {
  assert.equal(inventory.sites.length, 13);
  assert.deepEqual(inventory.sites.map((site) => site.code),
    Array.from({ length: 13 }, (_, index) => `PM-${String(index + 1).padStart(2, '0')}`));
  assert.equal(new Set(inventory.sites.map((site) => site.name)).size, 13);
  assert.equal(new Set(inventory.sites.map((site) => `${site.latitude},${site.longitude}`)).size, 13);
  for (const site of inventory.sites) {
    assert.match(site.code, /^PM-(?:0[1-9]|1[0-3])$/);
    assert.equal(typeof site.address, 'string');
    assert.ok(site.address.length >= 3);
    assert.ok(site.latitude >= -33.3 && site.latitude <= -33.0);
    assert.ok(site.longitude >= -68.8 && site.longitude <= -68.2);
    assert.ok(['K20', 'SF300', 'MB360'].includes(site.model));
    assert.ok(['network_pull', 'removable_media'].includes(site.reportedExtraction));
  }
});

test('distribución de modelos y extracción coincide con el libro auditado', () => {
  const count = (field, value) => inventory.sites.filter((site) => site[field] === value).length;
  assert.equal(count('model', 'K20'), 11);
  assert.equal(count('model', 'SF300'), 1);
  assert.equal(count('model', 'MB360'), 1);
  assert.equal(count('reportedExtraction', 'network_pull'), 7);
  assert.equal(count('reportedExtraction', 'removable_media'), 6);
});

test('el contrato explicita los datos que todavía deben verificarse físicamente', () => {
  const unresolved = new Set(inventory.unresolvedRequiredFields);
  for (const required of [
    'device_serial_number',
    'firmware_version',
    'ip_address_or_export_profile',
    'device_user_identifier_semantics',
    'approved_geofence_radius_meters',
  ]) assert.equal(unresolved.has(required), true);

  const serialized = JSON.stringify(inventory);
  assert.doesNotMatch(serialized, /"(?:ip|mac|serial|firmware|credential|password|token)"\s*:/i);
  assert.doesNotMatch(serialized, /connected|online|verified_device/i);
});
