import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { Client } from '@neondatabase/serverless';
import { readSheet as readXlsxSheet } from 'read-excel-file/node';

import {
  applyAttendanceCommand,
  getAttendanceBootstrap,
  listAttendanceResources,
  normalizeAttendanceCommand,
} from '../lib/internal-attendance-gateway.js';
import {
  resolvePlatformOwnerOperationalIntegralTarget,
} from './apply-platform-owner-operational-integral-schema.mjs';

export const JUNIN_ATTENDANCE_INVENTORY_VERSION = 'junin-attendance-inventory.v1';
export const JUNIN_ATTENDANCE_IMPORT_PLAN_VERSION = 'junin-attendance-import-plan.v1';
export const JUNIN_ATTENDANCE_WORKBOOK_MAPPING_VERSION = 'junin-attendance-workbook-a4-k17.v1';

const INVENTORY_URL = new URL('../data/junin-attendance-inventory.v1.json', import.meta.url);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA40 = /^[a-f0-9]{40}$/;
const SHA64 = /^[a-f0-9]{64}$/;
const TENANT_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_CODE = /^[A-Za-z0-9][A-Za-z0-9._-]{1,95}$/;
const CONFIRMATION_FLAG = '--confirm-isolated-branch';
const EXECUTE_FLAG = '--execute';
const TENANT_PREFIX = '--tenant-slug=';
const SOURCE_PREFIX = '--source-artifact=';
const DRIVER_KEY = 'pending-homologation';
const WORKBOOK_SHEET = 'Hoja1';
const WORKBOOK_RANGE = 'A4:K17';
const WORKBOOK_COLUMN_COUNT = 11;
const WORKBOOK_HEADERS = Object.freeze([
  'Código del punto\nOBLIGATORIO',
  'Nombre del punto\nOBLIGATORIO',
  'Dirección\nOBLIGATORIO',
  'Coordenadas (lat, long)',
  'Áreas que fichan aquí (códigos P1)\nOBLIGATORIO',
  'Cantidad de agentes\nOBLIGATORIO',
  'Método de registro actual\nOBLIGATORIO',
  'Conectividad disponible\nOBLIGATORIO',
  'Método de fichaje propuesto',
  'Responsable local (apellido y nombre)',
  'Observaciones',
]);
const UUID_V5_URL_NAMESPACE = '6ba7b8119dad11d180b400c04fd430c8';
const REQUIRED_UNRESOLVED_FIELDS = Object.freeze([
  'approved_geofence_radius_meters',
  'device_hardware_id',
  'device_serial_number',
  'device_user_identifier_semantics',
  'employee_count',
  'firmware_version',
  'ip_address_or_export_profile',
  'local_responsible',
  'network_port_and_protocol',
].sort());

const TOP_LEVEL_FIELDS = new Set([
  'contractVersion', 'tenantSlug', 'timezone', 'source', 'defaults', 'sites',
  'unresolvedRequiredFields',
]);
const SOURCE_FIELDS = new Set([
  'kind', 'fileName', 'sha256', 'sheet', 'range', 'rangeSha256', 'mappingVersion',
  'recordCount', 'verificationState',
]);
const DEFAULT_FIELDS = new Set([
  'vendor', 'deviceKind', 'inventoryState', 'networkCapabilities', 'biometricRetention',
]);
const SITE_FIELDS = new Set([
  'code', 'name', 'address', 'latitude', 'longitude', 'model', 'reportedExtraction',
]);

export class AttendanceInventoryImportError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AttendanceInventoryImportError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new AttendanceInventoryImportError(code, message);
}

function exactObject(value, allowed, code, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(code, `${label} debe ser un objeto exacto`);
  }
  const extra = Object.keys(value).find((key) => !allowed.has(key));
  if (extra) fail(code, `${label} contiene un campo no permitido: ${extra}`);
}

function boundedText(value, field, min = 1, max = 255) {
  if (typeof value !== 'string') fail('ATTENDANCE_INVENTORY_FIELD_INVALID', `${field} debe ser texto`);
  const text = value.trim();
  if (text.length < min || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) {
    fail('ATTENDANCE_INVENTORY_FIELD_INVALID', `${field} es inválido`);
  }
  return text;
}

function safeCode(value, field) {
  const code = boundedText(value, field, 2, 96);
  if (!SAFE_CODE.test(code)) fail('ATTENDANCE_INVENTORY_FIELD_INVALID', `${field} es inválido`);
  return code;
}

function finiteNumber(value, field, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    fail('ATTENDANCE_INVENTORY_FIELD_INVALID', `${field} está fuera de rango`);
  }
  return value;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalWorkbookCell(value, field) {
  if (value == null) return null;
  if (value instanceof Date) {
    const milliseconds = value.getTime();
    if (!Number.isFinite(milliseconds)) {
      fail('ATTENDANCE_INVENTORY_WORKBOOK_INVALID', `${field} contiene una fecha inválida`);
    }
    return value.toISOString();
  }
  if (typeof value === 'string') {
    return value.normalize('NFC').replace(/\r\n?/g, '\n').trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value;
  fail('ATTENDANCE_INVENTORY_WORKBOOK_INVALID', `${field} contiene un tipo no permitido`);
  return null;
}

function workbookRangeMatrix(rows) {
  if (!Array.isArray(rows)) {
    fail('ATTENDANCE_INVENTORY_WORKBOOK_INVALID', 'El libro no devolvió filas tabulares');
  }
  const startRow = 4;
  const endRow = 17;
  if (rows.length < endRow) {
    fail('ATTENDANCE_INVENTORY_WORKBOOK_INVALID', `El rango ${WORKBOOK_RANGE} está incompleto`);
  }
  return Object.freeze(Array.from({ length: endRow - startRow + 1 }, (_, rowOffset) => {
    const rowNumber = startRow + rowOffset;
    const row = rows[rowNumber - 1];
    if (!Array.isArray(row)) {
      fail('ATTENDANCE_INVENTORY_WORKBOOK_INVALID', `La fila ${rowNumber} no es tabular`);
    }
    return Object.freeze(Array.from({ length: WORKBOOK_COLUMN_COUNT }, (_, columnIndex) => (
      canonicalWorkbookCell(row[columnIndex] ?? null, `${WORKBOOK_SHEET}!${rowNumber}:${columnIndex + 1}`)
    )));
  }));
}

function comparableText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function addressEquivalent(workbookValue, versionedValue) {
  const normalizeAddress = (value) => comparableText(value).replace(/\bnuequen\b/g, 'neuquen');
  const workbook = normalizeAddress(workbookValue);
  const versioned = normalizeAddress(versionedValue);
  if (workbook === versioned) return true;
  const workbookTokens = workbook.split(' ');
  const versionedTokens = versioned.split(' ');
  if (workbookTokens.length <= versionedTokens.length
      || versionedTokens.some((token, index) => workbookTokens[index] !== token)) return false;
  const versionedSet = new Set(versionedTokens);
  return workbookTokens.slice(versionedTokens.length).every((token) => versionedSet.has(token));
}

function workbookCoordinates(value, index) {
  const text = typeof value === 'string' ? value.trim() : '';
  const match = /^(-?\d{1,2}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(text);
  if (!match) {
    fail('ATTENDANCE_INVENTORY_WORKBOOK_INVALID', `Fila ${index + 5}: coordenadas inválidas`);
  }
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
      || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    fail('ATTENDANCE_INVENTORY_WORKBOOK_INVALID', `Fila ${index + 5}: coordenadas fuera de rango`);
  }
  return Object.freeze({
    latitude: Number(latitude.toFixed(7)),
    longitude: Number(longitude.toFixed(7)),
  });
}

function workbookObservation(value, index) {
  const observation = typeof value === 'string' ? value.trim() : '';
  const modelMatches = [...observation.matchAll(/\bmodelo\s+(K20|SF300|MB360)\b/gi)];
  const network = /\bred\s+local\b/i.test(observation);
  const removable = /\b(?:pendrivel|pendrive|usb)\b/i.test(observation);
  if (modelMatches.length !== 1 || network === removable) {
    fail('ATTENDANCE_INVENTORY_WORKBOOK_INVALID', `Fila ${index + 5}: observación no interpretable`);
  }
  return Object.freeze({
    model: modelMatches[0][1].toUpperCase(),
    reportedExtraction: network ? 'network_pull' : 'removable_media',
  });
}

function workbookSiteProjection(matrix) {
  return Object.freeze(matrix.slice(1).map((row, index) => {
    const coordinates = workbookCoordinates(row[3], index);
    const observation = workbookObservation(row[10], index);
    return Object.freeze({
      code: String(row[0] || '').trim().toUpperCase(),
      name: typeof row[1] === 'string' ? row[1].trim() : '',
      address: typeof row[2] === 'string' ? row[2].trim() : '',
      ...coordinates,
      ...observation,
    });
  }));
}

function assertWorkbookProjectionMatchesInventory(workbookSites, inventorySites) {
  if (workbookSites.length !== inventorySites.length) {
    fail('ATTENDANCE_INVENTORY_COUNT_MISMATCH', 'El rango XLSX no contiene los 13 sitios versionados');
  }
  for (let index = 0; index < inventorySites.length; index += 1) {
    const workbook = workbookSites[index];
    const versioned = inventorySites[index];
    const checks = [
      ['code', workbook.code === versioned.code],
      ['name', comparableText(workbook.name) === comparableText(versioned.name)],
      ['address', addressEquivalent(workbook.address, versioned.address)],
      ['latitude', workbook.latitude === versioned.latitude],
      ['longitude', workbook.longitude === versioned.longitude],
      ['model', workbook.model === versioned.model],
      ['reportedExtraction', workbook.reportedExtraction === versioned.reportedExtraction],
    ];
    const mismatch = checks.find(([, matches]) => !matches);
    if (mismatch) {
      fail('ATTENDANCE_INVENTORY_LINEAGE_MISMATCH',
        `${versioned.code}: ${mismatch[0]} no coincide entre XLSX y JSON`);
    }
  }
}

function uuidV5(name) {
  const namespace = Buffer.from(UUID_V5_URL_NAMESPACE, 'hex');
  const digest = createHash('sha1').update(namespace).update(String(name), 'utf8').digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`
    + `-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function validTimezone(value) {
  const timezone = boundedText(value, 'timezone', 3, 100);
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(0);
  } catch {
    fail('ATTENDANCE_INVENTORY_TIMEZONE_INVALID', 'timezone no es IANA válida');
  }
  return timezone;
}

function assertNoCredentialMaterial(value) {
  const forbiddenKey = /(?:password|secret|token|api.?key|private.?key|credential)/i;
  const forbiddenValue = /(?:postgres(?:ql)?:\/\/|bearer\s+[a-z0-9._-]+|-----BEGIN [A-Z ]+PRIVATE KEY-----|password\s*=)/i;
  const visit = (node, path = 'inventory') => {
    if (typeof node === 'string') {
      if (forbiddenValue.test(node)) {
        fail('ATTENDANCE_INVENTORY_CREDENTIAL_MATERIAL', `Material sensible detectado en ${path}`);
      }
      return;
    }
    if (!node || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      if (forbiddenKey.test(key)) {
        fail('ATTENDANCE_INVENTORY_CREDENTIAL_MATERIAL', `Campo sensible detectado en ${path}`);
      }
      visit(child, `${path}.${key}`);
    }
  };
  visit(value);
}

function exactStringSet(value, expected, field) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    fail('ATTENDANCE_INVENTORY_FIELD_INVALID', `${field} debe ser un arreglo de texto`);
  }
  const actual = [...new Set(value.map((item) => item.trim()))].sort();
  if (actual.length !== value.length || stableJson(actual) !== stableJson(expected)) {
    fail('ATTENDANCE_INVENTORY_FIELD_INVALID', `${field} no coincide con el contrato`);
  }
  return Object.freeze(actual);
}

export function validateJuninAttendanceInventory(input) {
  exactObject(input, TOP_LEVEL_FIELDS, 'ATTENDANCE_INVENTORY_INVALID', 'inventario');
  assertNoCredentialMaterial(input);
  if (input.contractVersion !== JUNIN_ATTENDANCE_INVENTORY_VERSION) {
    fail('ATTENDANCE_INVENTORY_VERSION_INVALID', 'contractVersion no soportada');
  }
  const tenantSlug = boundedText(input.tenantSlug, 'tenantSlug', 3, 64).toLowerCase();
  if (!TENANT_SLUG.test(tenantSlug) || tenantSlug !== 'junin-mendoza') {
    fail('ATTENDANCE_INVENTORY_TENANT_INVALID', 'El inventario no pertenece al tenant Junín explícito');
  }
  const timezone = validTimezone(input.timezone);
  if (timezone !== 'America/Argentina/Mendoza') {
    fail('ATTENDANCE_INVENTORY_TIMEZONE_INVALID', 'Timezone municipal no corresponde a Junín');
  }

  exactObject(input.source, SOURCE_FIELDS, 'ATTENDANCE_INVENTORY_SOURCE_INVALID', 'source');
  if (input.source.kind !== 'municipal_workbook'
      || input.source.verificationState !== 'reported_inventory') {
    fail('ATTENDANCE_INVENTORY_SOURCE_INVALID', 'La fuente no es un inventario municipal reportado');
  }
  const fileName = boundedText(input.source.fileName, 'source.fileName', 5, 180);
  if (extname(fileName).toLowerCase() !== '.xlsx') {
    fail('ATTENDANCE_INVENTORY_FORMAT_INVALID', 'La fuente debe declarar formato XLSX');
  }
  const sourceSha256 = String(input.source.sha256 || '').trim().toLowerCase();
  if (!SHA64.test(sourceSha256)) {
    fail('ATTENDANCE_INVENTORY_SHA_INVALID', 'source.sha256 debe ser SHA-256 hexadecimal');
  }
  const rangeSha256 = String(input.source.rangeSha256 || '').trim().toLowerCase();
  if (!SHA64.test(rangeSha256)) {
    fail('ATTENDANCE_INVENTORY_RANGE_SHA_INVALID',
      'source.rangeSha256 debe ser SHA-256 hexadecimal');
  }
  if (input.source.mappingVersion !== JUNIN_ATTENDANCE_WORKBOOK_MAPPING_VERSION) {
    fail('ATTENDANCE_INVENTORY_SOURCE_INVALID', 'source.mappingVersion no está soportada');
  }
  const sheet = boundedText(input.source.sheet, 'source.sheet', 1, 80);
  const range = boundedText(input.source.range, 'source.range', 3, 40);
  if (!/^[A-Z]{1,3}[1-9]\d*:[A-Z]{1,3}[1-9]\d*$/.test(range)) {
    fail('ATTENDANCE_INVENTORY_SOURCE_INVALID', 'source.range no es un rango tabular explícito');
  }
  if (sheet !== WORKBOOK_SHEET || range !== WORKBOOK_RANGE) {
    fail('ATTENDANCE_INVENTORY_SOURCE_INVALID',
      `La versión ${JUNIN_ATTENDANCE_WORKBOOK_MAPPING_VERSION} exige ${WORKBOOK_SHEET}!${WORKBOOK_RANGE}`);
  }
  if (!Number.isSafeInteger(input.source.recordCount) || input.source.recordCount < 1
      || input.source.recordCount > 10_000) {
    fail('ATTENDANCE_INVENTORY_SOURCE_INVALID', 'source.recordCount es inválido');
  }

  exactObject(input.defaults, DEFAULT_FIELDS, 'ATTENDANCE_INVENTORY_DEFAULTS_INVALID', 'defaults');
  const vendor = boundedText(input.defaults.vendor, 'defaults.vendor', 2, 64);
  if (input.defaults.deviceKind !== 'fixed_biometric_clock'
      || input.defaults.inventoryState !== 'pending_physical_verification'
      || input.defaults.biometricRetention !== 'device_or_local_controller_only') {
    fail('ATTENDANCE_INVENTORY_DEFAULTS_INVALID', 'defaults excede la evidencia pendiente');
  }
  if (!Array.isArray(input.defaults.networkCapabilities)
      || new Set(input.defaults.networkCapabilities).size !== input.defaults.networkCapabilities.length
      || input.defaults.networkCapabilities.some((item) => !['ethernet', 'wifi_possible'].includes(item))) {
    fail('ATTENDANCE_INVENTORY_DEFAULTS_INVALID', 'networkCapabilities no corresponde al contrato');
  }

  if (!Array.isArray(input.sites) || input.sites.length !== input.source.recordCount) {
    fail('ATTENDANCE_INVENTORY_COUNT_MISMATCH', 'sites no coincide con source.recordCount');
  }
  const codes = new Set();
  const sites = input.sites.map((site, index) => {
    exactObject(site, SITE_FIELDS, 'ATTENDANCE_INVENTORY_SITE_INVALID', `sites[${index}]`);
    const code = safeCode(site.code, `sites[${index}].code`).toUpperCase();
    if (!/^PM-(?:0[1-9]|[1-9]\d)$/.test(code) || codes.has(code)) {
      fail('ATTENDANCE_INVENTORY_SITE_INVALID', `sites[${index}].code es inválido o duplicado`);
    }
    codes.add(code);
    const reportedExtraction = String(site.reportedExtraction || '').trim().toLowerCase();
    if (!['network_pull', 'removable_media'].includes(reportedExtraction)) {
      fail('ATTENDANCE_INVENTORY_SITE_INVALID', `sites[${index}].reportedExtraction no está permitido`);
    }
    return Object.freeze({
      code,
      name: boundedText(site.name, `sites[${index}].name`, 2, 160),
      address: boundedText(site.address, `sites[${index}].address`, 3, 255),
      latitude: finiteNumber(site.latitude, `sites[${index}].latitude`, -90, 90),
      longitude: finiteNumber(site.longitude, `sites[${index}].longitude`, -180, 180),
      model: boundedText(site.model, `sites[${index}].model`, 1, 120),
      reportedExtraction,
    });
  });
  exactStringSet(input.unresolvedRequiredFields, REQUIRED_UNRESOLVED_FIELDS,
    'unresolvedRequiredFields');

  return Object.freeze({
    contractVersion: JUNIN_ATTENDANCE_INVENTORY_VERSION,
    tenantSlug,
    timezone,
    source: Object.freeze({
      kind: input.source.kind,
      fileName,
      sha256: sourceSha256,
      sheet,
      range,
      rangeSha256,
      mappingVersion: input.source.mappingVersion,
      recordCount: input.source.recordCount,
      verificationState: input.source.verificationState,
    }),
    defaults: Object.freeze({
      vendor,
      deviceKind: input.defaults.deviceKind,
      inventoryState: input.defaults.inventoryState,
      networkCapabilities: Object.freeze([...input.defaults.networkCapabilities]),
      biometricRetention: input.defaults.biometricRetention,
    }),
    sites: Object.freeze(sites),
    unresolvedRequiredFields: Object.freeze([...REQUIRED_UNRESOLVED_FIELDS]),
  });
}

export function verifyJuninAttendanceSourceArtifact(inventory, artifact, artifactFileName) {
  const normalized = validateJuninAttendanceInventory(inventory);
  if (!Buffer.isBuffer(artifact) && !(artifact instanceof Uint8Array)) {
    fail('ATTENDANCE_INVENTORY_ARTIFACT_INVALID', 'El artefacto fuente debe ser binario');
  }
  const fileName = basename(boundedText(artifactFileName, 'artifactFileName', 5, 260));
  if (fileName !== normalized.source.fileName || extname(fileName).toLowerCase() !== '.xlsx') {
    fail('ATTENDANCE_INVENTORY_FORMAT_INVALID', 'El archivo no coincide con source.fileName XLSX');
  }
  const bytes = Buffer.from(artifact);
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b
      || ![[0x03, 0x04], [0x05, 0x06], [0x07, 0x08]].some(
        ([third, fourth]) => bytes[2] === third && bytes[3] === fourth,
      )) {
    fail('ATTENDANCE_INVENTORY_FORMAT_INVALID', 'El artefacto no tiene firma ZIP/XLSX');
  }
  const actualSha256 = sha256(bytes);
  if (actualSha256 !== normalized.source.sha256) {
    fail('ATTENDANCE_INVENTORY_SHA_MISMATCH', 'El artefacto XLSX no coincide con source.sha256');
  }
  return Object.freeze({ verified: true, fileName, sha256: actualSha256, format: 'xlsx' });
}

export async function verifyJuninAttendanceWorkbookLineage(
  inventory,
  artifact,
  artifactFileName,
  dependencies = {},
) {
  const normalized = validateJuninAttendanceInventory(inventory);
  const artifactReceipt = verifyJuninAttendanceSourceArtifact(
    normalized, artifact, artifactFileName,
  );
  const readSheet = dependencies.readSheet ?? readXlsxSheet;
  if (typeof readSheet !== 'function') {
    fail('ATTENDANCE_INVENTORY_WORKBOOK_INVALID', 'No hay un lector XLSX disponible');
  }

  let rows;
  try {
    rows = await readSheet(Buffer.from(artifact), normalized.source.sheet);
  } catch (error) {
    if (error instanceof AttendanceInventoryImportError) throw error;
    fail('ATTENDANCE_INVENTORY_WORKBOOK_INVALID',
      `No se pudo leer ${normalized.source.sheet} del artefacto XLSX`);
  }

  const matrix = workbookRangeMatrix(rows);
  if (stableJson(matrix[0]) !== stableJson(WORKBOOK_HEADERS)) {
    fail('ATTENDANCE_INVENTORY_HEADER_MISMATCH',
      `La cabecera ${normalized.source.sheet}!${normalized.source.range} no coincide`);
  }
  const rangeSha256 = sha256(stableJson(matrix));
  if (rangeSha256 !== normalized.source.rangeSha256) {
    fail('ATTENDANCE_INVENTORY_RANGE_SHA_MISMATCH',
      `El contenido de ${normalized.source.sheet}!${normalized.source.range} cambió`);
  }

  const workbookSites = workbookSiteProjection(matrix);
  assertWorkbookProjectionMatchesInventory(workbookSites, normalized.sites);
  return Object.freeze({
    verified: true,
    lineageVerified: true,
    fileName: artifactReceipt.fileName,
    sha256: artifactReceipt.sha256,
    format: artifactReceipt.format,
    sheet: normalized.source.sheet,
    range: normalized.source.range,
    rangeSha256,
    mappingVersion: normalized.source.mappingVersion,
    recordCount: workbookSites.length,
  });
}

function singleArgument(argv, prefix, required = false) {
  const matches = argv.filter((argument) => argument.startsWith(prefix));
  if (matches.length > 1) fail('ATTENDANCE_IMPORT_ARGUMENT_INVALID', `${prefix} está repetido`);
  const value = matches[0]?.slice(prefix.length).trim() || '';
  if (required && !value) fail('ATTENDANCE_IMPORT_ARGUMENT_INVALID', `Falta ${prefix}<valor>`);
  return value || null;
}

export function loadJuninAttendanceImportConfig(argv = [], env = {}) {
  if (argv.some((argument) => argument.startsWith('--confirm-production-branch='))
      || env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production') {
    fail('ATTENDANCE_IMPORT_PRODUCTION_FORBIDDEN', 'Este importador sólo admite una rama QA aislada');
  }
  const allowed = new Set([CONFIRMATION_FLAG, EXECUTE_FLAG]);
  const unknown = argv.find((argument) => (
    !allowed.has(argument)
    && !argument.startsWith(TENANT_PREFIX)
    && !argument.startsWith(SOURCE_PREFIX)
  ));
  if (unknown) fail('ATTENDANCE_IMPORT_ARGUMENT_INVALID', `Argumento no permitido: ${unknown}`);
  if (!argv.includes(CONFIRMATION_FLAG)) {
    fail('ATTENDANCE_IMPORT_QA_CONFIRMATION_REQUIRED', `Falta ${CONFIRMATION_FLAG}`);
  }
  const tenantSlug = singleArgument(argv, TENANT_PREFIX, true)?.toLowerCase();
  if (!TENANT_SLUG.test(tenantSlug)) {
    fail('ATTENDANCE_IMPORT_ARGUMENT_INVALID', 'tenantSlug explícito es inválido');
  }
  return Object.freeze({
    confirmation: 'isolated-branch',
    execute: argv.includes(EXECUTE_FLAG),
    tenantSlug,
    sourceArtifactPath: singleArgument(argv, SOURCE_PREFIX, false),
  });
}

function commandIdempotencyKey(planId, kind, externalKey) {
  return uuidV5(`https://municontrol.local/attendance-import/${planId}/${kind}/${externalKey}`);
}

function siteCommand(inventory, site) {
  return normalizeAttendanceCommand({
    command: 'site.create',
    payload: {
      externalKey: site.code.toLowerCase(),
      label: site.name,
      addressText: site.address,
      timezone: inventory.timezone,
      latitude: site.latitude,
      longitude: site.longitude,
      geofenceRadiusM: null,
      networkEnabled: site.reportedExtraction === 'network_pull',
      removableMediaEnabled: site.reportedExtraction === 'removable_media',
    },
  });
}

function devicePayloadTemplate(inventory, site) {
  return Object.freeze({
    externalKey: `reported-${site.code.toLowerCase()}`,
    vendorKey: inventory.defaults.vendor.toLowerCase(),
    model: site.model,
    transport: site.reportedExtraction,
    driverKey: DRIVER_KEY,
    timezone: inventory.timezone,
    capabilities: Object.freeze({
      pull: false, push: false, biometric: false, card: false, pin: false,
    }),
  });
}

export function buildJuninAttendanceImportPlan(inventoryInput, options = {}) {
  const inventory = validateJuninAttendanceInventory(inventoryInput);
  const tenantSlug = boundedText(options.tenantSlug, 'tenantSlug explícito', 3, 64).toLowerCase();
  if (tenantSlug !== inventory.tenantSlug) {
    fail('ATTENDANCE_IMPORT_TENANT_MISMATCH', 'El tenant explícito no coincide con el inventario');
  }
  const manifestCanonicalSha256 = sha256(stableJson(inventory));
  const manifestFileSha256 = String(options.manifestFileSha256 || '').trim().toLowerCase();
  if (!SHA64.test(manifestFileSha256)) {
    fail('ATTENDANCE_INVENTORY_SHA_INVALID', 'Falta SHA-256 del manifiesto JSON leído');
  }
  const artifactVerified = options.artifactVerified === true;
  const planId = sha256(stableJson({
    contractVersion: inventory.contractVersion,
    tenantSlug,
    sourceSha256: inventory.source.sha256,
    manifestCanonicalSha256,
    manifestFileSha256,
  }));
  const steps = [];
  for (const site of inventory.sites) {
    const siteBody = siteCommand(inventory, site);
    const devicePayload = devicePayloadTemplate(inventory, site);
    steps.push(Object.freeze({
      stepKey: `site:${site.code.toLowerCase()}`,
      resource: 'site',
      externalKey: siteBody.payload.externalKey,
      idempotencyKey: commandIdempotencyKey(planId, 'site', siteBody.payload.externalKey),
      body: siteBody,
    }));
    steps.push(Object.freeze({
      stepKey: `device:${devicePayload.externalKey}`,
      resource: 'device',
      externalKey: devicePayload.externalKey,
      siteExternalKeyRef: siteBody.payload.externalKey,
      idempotencyKey: commandIdempotencyKey(planId, 'device', devicePayload.externalKey),
      command: 'device.create',
      payloadTemplate: devicePayload,
    }));
  }
  return Object.freeze({
    contractVersion: JUNIN_ATTENDANCE_IMPORT_PLAN_VERSION,
    planId,
    tenantSlug,
    manifestCanonicalSha256,
    manifestFileSha256,
    source: Object.freeze({
      fileName: inventory.source.fileName,
      sha256: inventory.source.sha256,
      format: 'xlsx',
      sheet: inventory.source.sheet,
      range: inventory.source.range,
      rangeSha256: inventory.source.rangeSha256,
      mappingVersion: inventory.source.mappingVersion,
      recordCount: inventory.source.recordCount,
      artifactVerified,
      lineageVerified: artifactVerified,
    }),
    safety: Object.freeze({
      qaOnly: true,
      productionMutation: false,
      connectorsCreated: false,
      credentialsStored: false,
      biometricTemplatesStored: false,
      devicesRemainDraft: true,
      driverKey: DRIVER_KEY,
      geofenceRadiusStatus: 'pending_homologation',
    }),
    sourceFieldsHeldOutsideGateway: Object.freeze([
      'unresolvedRequiredFields', 'defaults.networkCapabilities',
    ]),
    steps: Object.freeze(steps),
  });
}

function sessionCoordinate(value, field, pattern) {
  const text = String(value || '').trim().toLowerCase();
  if (!pattern.test(text)) fail('ATTENDANCE_IMPORT_SESSION_INVALID', `${field} es inválido`);
  return text;
}

export function loadJuninAttendanceQaSession(env = {}, tenantSlug) {
  const keys = [
    'ATTENDANCE_QA_ACTOR_EMAIL', 'ATTENDANCE_QA_SESSION_ID',
    'ATTENDANCE_QA_SESSION_VERSION', 'ATTENDANCE_QA_RELEASE_SHA',
    'ATTENDANCE_QA_TENANT_ID', 'ATTENDANCE_QA_MEMBERSHIP_ID',
  ];
  const present = keys.filter((key) => String(env[key] || '').trim() !== '');
  if (present.length !== keys.length) {
    fail('ATTENDANCE_IMPORT_SESSION_REQUIRED',
      present.length ? 'La sesión QA está incompleta' : 'No hay sesión QA; use el plan preflight');
  }
  const email = String(env.ATTENDANCE_QA_ACTOR_EMAIL).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail('ATTENDANCE_IMPORT_SESSION_INVALID', 'ATTENDANCE_QA_ACTOR_EMAIL es inválido');
  }
  const sessionVersion = Number(env.ATTENDANCE_QA_SESSION_VERSION);
  if (!Number.isSafeInteger(sessionVersion) || sessionVersion < 1) {
    fail('ATTENDANCE_IMPORT_SESSION_INVALID', 'ATTENDANCE_QA_SESSION_VERSION es inválido');
  }
  const tenantId = sessionCoordinate(env.ATTENDANCE_QA_TENANT_ID, 'tenantId', UUID);
  const membershipId = sessionCoordinate(env.ATTENDANCE_QA_MEMBERSHIP_ID, 'membershipId', UUID);
  const sessionId = sessionCoordinate(env.ATTENDANCE_QA_SESSION_ID, 'sessionId', UUID);
  const releaseSha = sessionCoordinate(env.ATTENDANCE_QA_RELEASE_SHA, 'releaseSha', SHA40);
  return Object.freeze({
    tenantSlug,
    identityPrincipal: Object.freeze({
      user: Object.freeze({ email }),
      tenant: Object.freeze({ id: tenantId, membershipId, source: 'membership' }),
    }),
    session: Object.freeze({ id: sessionId, version: sessionVersion, releaseSha, email }),
  });
}

async function listAll(dependencies, client, principal, session, resource) {
  const items = [];
  let page = 1;
  let pages = 1;
  do {
    const response = await dependencies.listResources(
      client, principal, { resource, page, pageSize: 100 }, session,
    );
    items.push(...response.data);
    pages = Math.max(1, Number(response.pagination?.pages || 1));
    page += 1;
  } while (page <= pages);
  return items;
}

function sameNullableNumber(actual, expected) {
  if (actual == null || expected == null) return actual == null && expected == null;
  return Math.abs(Number(actual) - Number(expected)) < 0.000001;
}

function assertSiteCompatible(actual, expected) {
  const matches = actual.externalKey === expected.externalKey
    && actual.label === expected.label
    && actual.timezone === expected.timezone
    && sameNullableNumber(actual.latitude, expected.latitude)
    && sameNullableNumber(actual.longitude, expected.longitude)
    && sameNullableNumber(actual.geofenceRadiusM, expected.geofenceRadiusM)
    && actual.networkEnabled === expected.networkEnabled
    && actual.removableMediaEnabled === expected.removableMediaEnabled
    && actual.status !== 'retired';
  if (!matches) {
    fail('ATTENDANCE_IMPORT_EXISTING_SITE_DRIFT',
      `El sitio existente ${expected.externalKey} difiere del inventario`);
  }
}

function assertDeviceCompatible(actual, expected) {
  const matches = actual.externalKey === expected.externalKey
    && actual.siteId === expected.siteId
    && actual.vendorKey === expected.vendorKey
    && actual.model === expected.model
    && actual.transport === expected.transport
    && actual.driverKey === expected.driverKey
    && actual.timezone === expected.timezone
    && stableJson(actual.capabilities) === stableJson(expected.capabilities)
    && actual.status !== 'retired';
  if (!matches) {
    fail('ATTENDANCE_IMPORT_EXISTING_DEVICE_DRIFT',
      `El dispositivo existente ${expected.externalKey} difiere del inventario`);
  }
}

export async function executeJuninAttendanceImportPlan({
  client,
  plan,
  qaSession,
  dependencies = {},
}) {
  if (!client || typeof client.query !== 'function') {
    fail('ATTENDANCE_IMPORT_DATABASE_REQUIRED', 'Se requiere conexión QA');
  }
  if (plan?.contractVersion !== JUNIN_ATTENDANCE_IMPORT_PLAN_VERSION
      || plan?.safety?.qaOnly !== true || plan?.safety?.productionMutation !== false
      || plan?.source?.artifactVerified !== true) {
    fail('ATTENDANCE_IMPORT_PLAN_INVALID', 'El plan no está verificado para ejecución QA');
  }
  if (qaSession?.tenantSlug !== plan.tenantSlug) {
    fail('ATTENDANCE_IMPORT_TENANT_MISMATCH', 'La sesión no corresponde al tenant explícito');
  }
  const deps = {
    getBootstrap: dependencies.getBootstrap ?? getAttendanceBootstrap,
    listResources: dependencies.listResources ?? listAttendanceResources,
    applyCommand: dependencies.applyCommand ?? applyAttendanceCommand,
  };
  const principal = qaSession.identityPrincipal;
  const session = qaSession.session;
  const tenantId = principal?.tenant?.id;
  const summary = { sitesCreated: 0, sitesExisting: 0, devicesCreated: 0, devicesExisting: 0 };
  await client.query('BEGIN');
  try {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('municontrol:attendance-inventory-import'), hashtext($1))",
      [plan.tenantSlug],
    );
    const tenantResult = await client.query(
      'SELECT id::text AS id FROM platform_tenant WHERE lower(slug) = lower($1)',
      [plan.tenantSlug],
    );
    if (tenantResult.rowCount !== 1 || tenantResult.rows[0].id !== tenantId) {
      fail('ATTENDANCE_IMPORT_TENANT_MISMATCH', 'tenantSlug no coincide con la sesión QA');
    }
    const bootstrap = await deps.getBootstrap(client, principal, session);
    for (const capability of ['attendance.site.manage', 'attendance.device.manage']) {
      if (!bootstrap.capabilities.includes(capability)) {
        fail('ATTENDANCE_IMPORT_CAPABILITY_REQUIRED', `Falta ${capability}`);
      }
    }
    const existingSites = new Map(
      (await listAll(deps, client, principal, session, 'site'))
        .map((item) => [item.externalKey, item]),
    );
    const existingDevices = new Map(
      (await listAll(deps, client, principal, session, 'device'))
        .map((item) => [item.externalKey, item]),
    );

    for (let index = 0; index < plan.steps.length; index += 2) {
      const siteStep = plan.steps[index];
      const deviceStep = plan.steps[index + 1];
      if (siteStep?.resource !== 'site' || deviceStep?.resource !== 'device'
          || deviceStep.siteExternalKeyRef !== siteStep.externalKey) {
        fail('ATTENDANCE_IMPORT_PLAN_INVALID', 'La secuencia sitio-dispositivo es inválida');
      }
      let siteId;
      const existingSite = existingSites.get(siteStep.externalKey);
      if (existingSite) {
        assertSiteCompatible(existingSite, siteStep.body.payload);
        siteId = existingSite.id;
        summary.sitesExisting += 1;
      } else {
        const created = await deps.applyCommand(
          client, principal, session, siteStep.body, siteStep.idempotencyKey,
        );
        siteId = String(created?.data?.id || '').toLowerCase();
        if (!UUID.test(siteId)) fail('ATTENDANCE_IMPORT_GATEWAY_DRIFT', 'site.create no devolvió UUID');
        summary.sitesCreated += 1;
      }
      const deviceBody = normalizeAttendanceCommand({
        command: deviceStep.command,
        payload: { siteId, ...deviceStep.payloadTemplate },
      });
      const existingDevice = existingDevices.get(deviceStep.externalKey);
      if (existingDevice) {
        assertDeviceCompatible(existingDevice, deviceBody.payload);
        summary.devicesExisting += 1;
      } else {
        const created = await deps.applyCommand(
          client, principal, session, deviceBody, deviceStep.idempotencyKey,
        );
        if (!UUID.test(String(created?.data?.id || ''))) {
          fail('ATTENDANCE_IMPORT_GATEWAY_DRIFT', 'device.create no devolvió UUID');
        }
        summary.devicesCreated += 1;
      }
    }
    await client.query('COMMIT');
    return Object.freeze({
      ok: true,
      mode: 'qa-import',
      tenantSlug: plan.tenantSlug,
      planId: plan.planId,
      ...summary,
      connectorsCreated: 0,
      credentialsStored: false,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const config = loadJuninAttendanceImportConfig(argv, process.env);
  const manifestBytes = await readFile(INVENTORY_URL);
  const inventory = validateJuninAttendanceInventory(JSON.parse(manifestBytes.toString('utf8')));
  let artifactVerified = false;
  if (config.sourceArtifactPath) {
    const artifactPath = resolve(config.sourceArtifactPath);
    const artifact = await readFile(artifactPath);
    artifactVerified = (await verifyJuninAttendanceWorkbookLineage(
      inventory, artifact, basename(artifactPath),
    )).verified;
  }
  const plan = buildJuninAttendanceImportPlan(inventory, {
    tenantSlug: config.tenantSlug,
    manifestFileSha256: sha256(manifestBytes),
    artifactVerified,
  });
  if (!config.execute) {
    console.log(JSON.stringify({ mode: 'preflight', executable: artifactVerified, plan }, null, 2));
    return;
  }
  if (!artifactVerified) {
    fail('ATTENDANCE_INVENTORY_ARTIFACT_REQUIRED',
      `Para ejecutar se requiere ${SOURCE_PREFIX}<P3-PUNTOS DE MARCACION.xlsx>`);
  }
  const target = resolvePlatformOwnerOperationalIntegralTarget(argv, process.env);
  if (target.mode !== 'isolated') {
    fail('ATTENDANCE_IMPORT_PRODUCTION_FORBIDDEN', 'El target no es una rama QA aislada');
  }
  const qaSession = loadJuninAttendanceQaSession(process.env, config.tenantSlug);
  const client = new Client({ connectionString: target.databaseUrl });
  await client.connect();
  try {
    const result = await executeJuninAttendanceImportPlan({ client, plan, qaSession });
    console.log(JSON.stringify({ ...result, branchId: target.branchId }, null, 2));
  } finally {
    await client.end().catch(() => undefined);
  }
}

const invokedAsScript = Boolean(process.argv[1]
  && pathToFileURL(process.argv[1]).href === import.meta.url);
if (invokedAsScript) await main();
