// OSEP 206: definición histórica de GRH, tabla reporte + columnas visibles,
// contrastada con los dos TXT y la planilla de agosto de 2026. No homologa
// la presentación institucional. Los importes llegan explícitos en centavos;
// este módulo no calcula sueldos ni convierte datos faltantes en cero.
import {
  PAYROLL_HEALTH_FIXED_WIDTH_PROFILES,
  PAYROLL_HEALTH_FIXED_WIDTH_MAX_BYTES,
  PAYROLL_HEALTH_FIXED_WIDTH_MAX_RECORDS,
} from './payroll-health-fixed-width.js';

export const PAYROLL_OSEP_206_CONTRACT_VERSION = 'payroll-osep-206-generator.v1';
export const PAYROLL_OSEP_206_RECORD_BYTES = 206;
export const PAYROLL_OSEP_206_MAX_ROWS = PAYROLL_HEALTH_FIXED_WIDTH_MAX_RECORDS;
export const PAYROLL_OSEP_206_MAX_BYTES = PAYROLL_HEALTH_FIXED_WIDTH_MAX_BYTES;
export const PAYROLL_OSEP_206_BASE_PROFILE = 'osep-206-crlf.v1';
export const PAYROLL_OSEP_206_TERMINAL_PROFILE = 'osep-206-tab-footer25.v1';
const TERMINAL = '\t'.repeat(24) + ' ';
const CENTS = /^(?:0|[1-9][0-9]{0,9})$/;
const PERIOD = /^(?:19|20)[0-9]{2}(?:0[1-9]|1[0-2])$/;
const GRH_DOCUMENT_TYPES = Object.freeze({ 1: '3', 2: '1', 3: '2', 4: '5', 5: '4', 6: '6' });
const UNDEFINED_1252 = new Set([0x81, 0x8d, 0x8f, 0x90, 0x9d]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export const PAYROLL_OSEP_206_FIELDS = deepFreeze([
  { fieldId: 'period', start: 1, end: 6, kind: 'period', sourceAlias: 'Peri', meaning: 'Período AAAAMM' },
  { fieldId: 'reservedPrefix', start: 7, end: 13, kind: 'constant', value: '0000000', sourceAlias: 'C3', meaning: 'Constante de siete ceros de la definición GRH' },
  { fieldId: 'documentTypeCode', start: 14, end: 14, kind: 'documentType', sourceAlias: 'TipoDoc', meaning: 'Tipo de documento OSEP, según mapeo explícito GRH' },
  { fieldId: 'dni', start: 15, end: 22, kind: 'digits', sourceAlias: 'Documento', meaning: 'Número de documento según TipoDoc; se conserva el nombre lógico dni de esta API' },
  { fieldId: 'legajo', start: 23, end: 34, kind: 'digits', sourceAlias: 'Legajo', meaning: 'Legajo, doce dígitos con ceros a la izquierda' },
  { fieldId: 'fullName', start: 35, end: 74, kind: 'text', sourceAlias: 'Nombre', meaning: 'Apellido y nombre, cuarenta bytes; sin cambio de identidad ni truncamiento' },
  { fieldId: 'employerContributionCents', start: 75, end: 84, kind: 'cents', sourceAlias: 'c701', sourceConceptCodes: ['701'], meaning: 'Aporte patronal OSEP' },
  { fieldId: 'subjectSalaryCents', start: 85, end: 94, kind: 'cents', sourceAlias: 'c993', sourceConceptCodes: ['993', '994'], aggregation: 'sum', meaning: 'Base exportada GRH: suma de conceptos 993 y 994' },
  { fieldId: 'netPayCents', start: 95, end: 104, kind: 'cents', sourceAlias: 'c998', sourceConceptCodes: ['998'], meaning: 'Neto a pagar' },
  { fieldId: 'quotaCents', start: 105, end: 114, kind: 'cents', sourceAlias: 'c601', sourceConceptCodes: ['601'], meaning: 'Cuota OSEP calculada en la fuente' },
  { fieldId: 'reserved2', start: 115, end: 124, kind: 'constant', value: '0000000000', sourceAlias: 'Indi', meaning: 'Constante de diez ceros de la definición GRH' },
  { fieldId: 'voluntaryPureCents', start: 125, end: 134, kind: 'cents', sourceAlias: 'c602', sourceConceptCodes: ['602', '608'], aggregation: 'sum', meaning: 'Voluntario puro: suma de conceptos 602 y 608' },
  { fieldId: 'voluntaryStudentCents', start: 135, end: 144, kind: 'cents', sourceAlias: 'c603', sourceConceptCodes: ['603'], meaning: 'OSEP voluntario estudiante' },
  { fieldId: 'catastrophicCents', start: 145, end: 154, kind: 'cents', sourceAlias: 'c604', sourceConceptCodes: ['604'], meaning: 'Fondo de enfermedades catastróficas' },
  { fieldId: 'catastrophicIndirectCents', start: 155, end: 164, kind: 'cents', sourceAlias: 'c682', sourceConceptCodes: ['682'], meaning: 'Fondo catastrófico indirectos' },
  { fieldId: 'catastrophicVoluntaryCents', start: 165, end: 174, kind: 'cents', sourceAlias: 'c683', sourceConceptCodes: ['683'], meaning: 'Fondo catastrófico voluntarios' },
  { fieldId: 'catastrophicStudentCents', start: 175, end: 184, kind: 'cents', sourceAlias: 'c684', sourceConceptCodes: ['684'], meaning: 'Fondo catastrófico voluntarios estudiantes' },
  { fieldId: 'currentAccountCents', start: 185, end: 194, kind: 'cents', sourceAlias: 'c605', sourceConceptCodes: ['605'], meaning: 'Cuenta corriente OSEP' },
  { fieldId: 'bankrupt', start: 195, end: 196, kind: 'flag', sourceAlias: 'Concu', meaning: 'Concursado: NO o SI, declaración explícita' },
  { fieldId: 'disabilityDirectCents', start: 197, end: 206, kind: 'cents', sourceAlias: 'c685', sourceConceptCodes: ['685'], meaning: 'Fondo de discapacidad directo' },
]);

export const PAYROLL_OSEP_206_PROFILE = deepFreeze({
  contractVersion: PAYROLL_OSEP_206_CONTRACT_VERSION,
  activation: 'PREPARATION_ONLY',
  baseProfile: PAYROLL_OSEP_206_BASE_PROFILE,
  supportedProfiles: [PAYROLL_OSEP_206_BASE_PROFILE, PAYROLL_OSEP_206_TERMINAL_PROFILE],
  organization: 'OSEP', encoding: 'windows-1252', lineEnding: 'CRLF', bom: 'forbidden',
  recordBytes: PAYROLL_OSEP_206_RECORD_BYTES,
  maxBytes: PAYROLL_OSEP_206_MAX_BYTES, maxRows: PAYROLL_OSEP_206_MAX_ROWS,
  fieldManifest: PAYROLL_OSEP_206_FIELDS,
  fieldMappingComplete: true, semanticStatus: 'historical_grh_query_columns_and_samples',
  amountInputPolicy: 'All twelve amounts are explicit canonical nonnegative cent strings; no missing-to-zero conversion.',
  sourceDefinitions: {
    reportId: '2ce4e19b3a79d367013a99b2a81f0001',
    querySha256: '1b4a0a02607dcdd2d768dc553c7ad75ca463e6e5a65c3dc21187ad26df4ab214',
    columnInsertSha256: 'c004cfc14a82a292f04a2c4fd5e2b7580ac7effdd040cdb9c7e865e73133f7d4',
  },
  evidence: [
    { sourceRef: 'osep-206-august-2026-gardens-68f5c002', sha256: '68f5c002e25a06f11c5b71bcccb93c01eb030fb3d11766e0c4a743ab0ebdb1ea', rowsTotal: 111, amountComparisons: 1110, profileId: PAYROLL_OSEP_206_BASE_PROFILE },
    { sourceRef: 'osep-206-august-2026-municipal-4663293e', sha256: '4663293ee89ee6ff745615c0936304a4d7773782f1cd1e0f9cf88150a7c9d5c8', rowsTotal: 731, amountComparisons: 7310, profileId: PAYROLL_OSEP_206_TERMINAL_PROFILE },
  ],
  terminalPolicy: 'Optional opaque record only in the explicitly chosen observed profile; its institutional meaning is not inferred.',
  generationAllowed: true, officialSubmissionAllowed: false, homologated: false,
  homologationRequirement: 'Conciliar el período completo generado desde el cierre de MuniControl contra la salida GRH y sus controles antes de presentación institucional.',
});

export class PayrollOsep206Error extends Error {
  constructor(code, message) { super(message); this.name = 'PayrollOsep206Error'; this.code = code; }
}
const fail = (code, message) => { throw new PayrollOsep206Error(code, message); };
const inputFields = new Set(PAYROLL_OSEP_206_FIELDS.filter(f => f.kind !== 'constant').map(f => f.fieldId));
const decoder = new TextDecoder('windows-1252', { fatal: true });
const encodingMap = new Map();
for (let byte = 0x20; byte <= 0xff; byte += 1) {
  if (byte !== 0x7f && !UNDEFINED_1252.has(byte)) encodingMap.set(decoder.decode(Uint8Array.of(byte)), byte);
}

export function payrollOsepDocumentTypeFromGrh(value) {
  if (typeof value !== 'string' || !Object.hasOwn(GRH_DOCUMENT_TYPES, value)) fail('OSEP_206_DOCUMENT_TYPE_INVALID', 'El tipo de documento GRH no tiene un mapeo explícito.');
  return GRH_DOCUMENT_TYPES[value];
}

function profileOption(options, fallback) {
  if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(k => k !== 'profileId')) fail('OSEP_206_OPTIONS_INVALID', 'Opciones de formato no reconocidas.');
  const id = options.profileId ?? fallback;
  if (![PAYROLL_OSEP_206_BASE_PROFILE, PAYROLL_OSEP_206_TERMINAL_PROFILE].includes(id) || !Object.hasOwn(PAYROLL_HEALTH_FIXED_WIDTH_PROFILES, id)) fail('OSEP_206_PROFILE_UNKNOWN', 'El perfil no corresponde a una variante OSEP 206 conocida.');
  return id;
}

function nameValue(value, index) {
  if (typeof value !== 'string' || !value.trim()) fail('OSEP_206_NAME_REQUIRED', `La fila ${index + 1} necesita apellido y nombre.`);
  const text = value.replace(/ +$/, '');
  for (const char of text) if (!encodingMap.has(char)) fail('OSEP_206_CHARACTER_UNSUPPORTED', `La fila ${index + 1} contiene un carácter incompatible con el formato; revisá la fuente y su codificación.`);
  if (text.length > 40) fail('OSEP_206_NAME_TOO_LONG', `La fila ${index + 1} supera los cuarenta bytes de nombre; el exportador no lo trunca.`);
  return text.padEnd(40, ' ');
}

function normalizeRow(row, index) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) fail('OSEP_206_ROW_INVALID', `La fila ${index + 1} no es un registro.`);
  if (Object.keys(row).some(k => !inputFields.has(k))) fail('OSEP_206_FIELD_UNKNOWN', `La fila ${index + 1} tiene campos no reconocidos.`);
  const out = {};
  for (const field of PAYROLL_OSEP_206_FIELDS) {
    const width = field.end - field.start + 1;
    const value = Object.hasOwn(row, field.fieldId) ? row[field.fieldId] : undefined;
    if (field.kind === 'constant') out[field.fieldId] = field.value;
    else if (field.kind === 'period') {
      if (typeof value !== 'string' || !PERIOD.test(value)) fail('OSEP_206_PERIOD_INVALID', `La fila ${index + 1} necesita período AAAAMM válido.`);
      out[field.fieldId] = value;
    } else if (field.kind === 'documentType') {
      if (typeof value !== 'string' || !/^[1-6]$/.test(value)) fail('OSEP_206_DOCUMENT_TYPE_INVALID', `La fila ${index + 1} necesita un tipo de documento OSEP explícito.`);
      out[field.fieldId] = value;
    } else if (field.kind === 'digits') {
      if (typeof value !== 'string' || !/^[0-9]+$/.test(value) || value.length > width) fail('OSEP_206_DIGITS_INVALID', `La fila ${index + 1}: ${field.fieldId} debe tener de uno a ${width} dígitos.`);
      out[field.fieldId] = value.padStart(width, '0');
    } else if (field.kind === 'text') out[field.fieldId] = nameValue(value, index);
    else if (field.kind === 'cents') {
      if (typeof value !== 'string' || !CENTS.test(value)) fail('OSEP_206_CENTS_INVALID', `La fila ${index + 1}: ${field.fieldId} requiere centavos explícitos, enteros y no negativos.`);
      out[field.fieldId] = value.padStart(width, '0');
    } else if (field.kind === 'flag') {
      if (typeof value !== 'boolean') fail('OSEP_206_FLAG_INVALID', `La fila ${index + 1} necesita la condición de concursado explícita.`);
      out[field.fieldId] = value ? 'SI' : 'NO';
    }
  }
  return out;
}

function validateRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) fail('OSEP_206_ROWS_REQUIRED', 'Informá al menos un registro de detalle.');
  if (rows.length > PAYROLL_OSEP_206_MAX_ROWS) fail('OSEP_206_TOO_MANY_ROWS', 'La población supera el límite admitido.');
  const result = [], seen = new Set();
  let period;
  for (let index = 0; index < rows.length; index += 1) {
    const row = normalizeRow(rows[index], index);
    period ??= row.period;
    if (row.period !== period) fail('OSEP_206_PERIOD_MIXED', 'Todos los registros deben ser del mismo período.');
    // La definición GRH entrega un registro por legajo dentro del lote/período.
    if (seen.has(row.legajo)) fail('OSEP_206_DUPLICATE', `La fila ${index + 1} repite un legajo del lote.`);
    seen.add(row.legajo); result.push(row);
  }
  return result;
}

function byteBudget(count, terminal) {
  const size = count * (PAYROLL_OSEP_206_RECORD_BYTES + 2) + (terminal ? 25 : 0);
  if (size > PAYROLL_OSEP_206_MAX_BYTES) fail('OSEP_206_SOURCE_TOO_LARGE', 'La salida supera el límite físico del validador.');
  return size;
}

function encode(text) {
  return Uint8Array.from(text, char => {
    if (char === '\r') return 13;
    if (char === '\n') return 10;
    if (char === '\t') return 9;
    const byte = encodingMap.get(char);
    if (byte === undefined) fail('OSEP_206_CHARACTER_UNSUPPORTED', 'Carácter incompatible con el formato.');
    return byte;
  });
}

export function renderPayrollOsep206(rows, options = {}) {
  const profileId = profileOption(options, PAYROLL_OSEP_206_BASE_PROFILE);
  const terminal = profileId === PAYROLL_OSEP_206_TERMINAL_PROFILE;
  if (!Array.isArray(rows) || rows.length === 0) fail('OSEP_206_ROWS_REQUIRED', 'Informá al menos un registro de detalle.');
  if (rows.length > PAYROLL_OSEP_206_MAX_ROWS) fail('OSEP_206_TOO_MANY_ROWS', 'La población supera el límite admitido.');
  const byteLength = byteBudget(rows.length, terminal);
  const normalized = validateRows(rows);
  const totals = Object.fromEntries(PAYROLL_OSEP_206_FIELDS.filter(f => f.kind === 'cents').map(f => [f.fieldId, 0n]));
  const lines = normalized.map(row => {
    for (const key of Object.keys(totals)) totals[key] += BigInt(row[key]);
    return PAYROLL_OSEP_206_FIELDS.map(f => row[f.fieldId]).join('');
  });
  const bytes = encode(lines.join('\r\n') + '\r\n' + (terminal ? TERMINAL : ''));
  if (bytes.length !== byteLength) fail('OSEP_206_WIDTH', 'La salida no conserva el ancho físico esperado.');
  return Object.freeze({ contractVersion: PAYROLL_OSEP_206_CONTRACT_VERSION, profileId, period: normalized[0].period,
    recordCount: normalized.length, terminalRecordCount: terminal ? 1 : 0, byteLength, bytes,
    totalsCents: Object.freeze(Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v.toString()]))),
    activation: 'PREPARATION_ONLY', officialSubmissionAllowed: false });
}

export function parsePayrollOsep206(bytes, options = {}) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) fail('OSEP_206_SOURCE_INVALID', 'El TXT debe recibirse como bytes no vacíos.');
  if (bytes.length > PAYROLL_OSEP_206_MAX_BYTES) fail('OSEP_206_SOURCE_TOO_LARGE', 'El TXT supera el límite físico del validador.');
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) fail('OSEP_206_BOM_FORBIDDEN', 'El formato no admite BOM.');
  for (const byte of bytes) {
    if (UNDEFINED_1252.has(byte) || byte === 0x7f || (byte < 0x20 && ![9, 10, 13].includes(byte))) fail('OSEP_206_BYTE_UNSUPPORTED', 'El TXT contiene bytes de control o sin definición en windows-1252.');
  }
  const text = decoder.decode(bytes);
  const terminal = text.endsWith(TERMINAL);
  const profileId = profileOption(options, terminal ? PAYROLL_OSEP_206_TERMINAL_PROFILE : PAYROLL_OSEP_206_BASE_PROFILE);
  if (terminal !== (profileId === PAYROLL_OSEP_206_TERMINAL_PROFILE)) fail('OSEP_206_PROFILE_MISMATCH', 'El registro terminal no coincide con el perfil elegido.');
  const detail = terminal ? text.slice(0, -25) : text;
  if (!detail) fail('OSEP_206_ROWS_REQUIRED', 'El TXT no contiene registros de detalle.');
  if (!detail.endsWith('\r\n')) fail('OSEP_206_TRAILING_CRLF', 'Cada registro de detalle debe terminar en CRLF.');
  const lines = detail.slice(0, -2).split('\r\n');
  if (lines.length > PAYROLL_OSEP_206_MAX_ROWS) fail('OSEP_206_TOO_MANY_ROWS', 'La población supera el límite admitido.');
  const rows = lines.map(line => {
    if (line.length !== PAYROLL_OSEP_206_RECORD_BYTES) fail('OSEP_206_RECORD_WIDTH', 'El registro no ocupa 206 bytes.');
    const row = {};
    for (const field of PAYROLL_OSEP_206_FIELDS) {
      const raw = line.slice(field.start - 1, field.end);
      if (field.kind === 'constant') {
        if (raw !== field.value) fail('OSEP_206_CONSTANT_MISMATCH', `La constante ${field.sourceAlias} no coincide.`);
      } else if (['cents', 'digits', 'period', 'documentType'].includes(field.kind)) {
        if (!/^[0-9]+$/.test(raw)) fail('OSEP_206_FIELD_NOT_NUMERIC', `El campo ${field.sourceAlias} no es numérico.`);
        row[field.fieldId] = ['cents', 'digits'].includes(field.kind) ? BigInt(raw).toString() : raw;
      } else if (field.kind === 'text') row.fullName = raw.replace(/ +$/, '');
      else if (field.kind === 'flag') {
        if (raw !== 'NO' && raw !== 'SI') fail('OSEP_206_FLAG_UNKNOWN', 'Concursado debe ser NO o SI.');
        row.bankrupt = raw === 'SI';
      }
    }
    return row;
  });
  validateRows(rows);
  return deepFreeze({ contractVersion: PAYROLL_OSEP_206_CONTRACT_VERSION, profileId, rows,
    recordCount: rows.length, terminalRecordCount: terminal ? 1 : 0, baseProfileKnown: true,
    activation: 'PREPARATION_ONLY', officialSubmissionAllowed: false });
}
