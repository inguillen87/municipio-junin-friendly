import sourceInventory from '../data/junin-attendance-inventory.v1.json' with { type: 'json' };

export const REPORTED_ATTENDANCE_INVENTORY_CONTRACT_VERSION =
  'attendance-reported-inventory.v1';

const EXPECTED_SOURCE_CONTRACT = 'junin-attendance-inventory.v1';
const EXPECTED_TENANT_SLUG = 'junin-mendoza';
const EXPECTED_STATUS = 'reported_inventory';
const EXPECTED_SITE_COUNT = 13;
const ALLOWED_CHANNELS = new Set(['network_pull', 'removable_media']);

function requireText(value, field) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(`Inventario reportado inválido: ${field}`);
  return normalized;
}

function requireCoordinate(value, field, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new Error(`Inventario reportado inválido: ${field}`);
  }
  return number;
}

function buildPayload(inventory) {
  if (inventory?.contractVersion !== EXPECTED_SOURCE_CONTRACT
      || inventory?.tenantSlug !== EXPECTED_TENANT_SLUG
      || inventory?.source?.verificationState !== EXPECTED_STATUS
      || inventory?.source?.recordCount !== EXPECTED_SITE_COUNT
      || !Array.isArray(inventory?.sites)
      || inventory.sites.length !== EXPECTED_SITE_COUNT) {
    throw new Error('Inventario reportado inválido: contrato o fuente');
  }

  const codes = new Set();
  const sites = inventory.sites.map((site) => {
    const code = requireText(site?.code, 'code');
    if (codes.has(code)) throw new Error('Inventario reportado inválido: código duplicado');
    codes.add(code);
    const channel = requireText(site?.reportedExtraction, 'reportedExtraction');
    if (!ALLOWED_CHANNELS.has(channel)) {
      throw new Error('Inventario reportado inválido: canal');
    }
    return Object.freeze({
      code,
      name: requireText(site?.name, 'name'),
      address: requireText(site?.address, 'address'),
      latitude: requireCoordinate(site?.latitude, 'latitude', -90, 90),
      longitude: requireCoordinate(site?.longitude, 'longitude', -180, 180),
      model: requireText(site?.model, 'model'),
      channel,
    });
  });

  return Object.freeze({
    resource: 'reported-inventory',
    contract: Object.freeze({ version: REPORTED_ATTENDANCE_INVENTORY_CONTRACT_VERSION }),
    tenantSlug: EXPECTED_TENANT_SLUG,
    timezone: requireText(inventory?.timezone, 'timezone'),
    source: Object.freeze({
      kind: requireText(inventory?.source?.kind, 'source.kind'),
      status: EXPECTED_STATUS,
      recordCount: EXPECTED_SITE_COUNT,
      mappingVersion: requireText(inventory?.source?.mappingVersion, 'source.mappingVersion'),
    }),
    physicalConnectionConfirmed: false,
    heatMetric: 'reported_site_density',
    data: Object.freeze(sites),
  });
}

const JUNIN_REPORTED_ATTENDANCE_INVENTORY = buildPayload(sourceInventory);

export function getReportedAttendanceInventory(principal) {
  const tenantSlug = String(principal?.tenant?.slug || '').trim().toLowerCase();
  return tenantSlug === EXPECTED_TENANT_SLUG
    ? JUNIN_REPORTED_ATTENDANCE_INVENTORY
    : null;
}
