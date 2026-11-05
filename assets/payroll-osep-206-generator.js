// Generador y lector del TXT OSEP de 206 bytes (formato «osep AAAAMM - <población>.txt»
// que acompaña la Planilla de Control General OSEP). Layout derivado el
// 2026-11-05 cruzando los dos archivos de agosto 2026 (111 + 731 registros)
// contra la planilla de control: cada importe coincidió en todas las filas y la
// reconstrucción con este layout fue byte a byte idéntica a los originales.
// Encoding windows-1252, CRLF, sin BOM. El registro de cola de 25 bytes
// (24 tabulaciones + espacio) observado en uno de los archivos no tiene
// semántica conocida y no se genera.
import { PAYROLL_HEALTH_FIXED_WIDTH_PROFILES } from './payroll-health-fixed-width.js';

export const PAYROLL_OSEP_206_CONTRACT_VERSION = 'payroll-osep-206-generator.v1';
export const PAYROLL_OSEP_206_RECORD_BYTES = 206;
export const PAYROLL_OSEP_206_MAX_ROWS = 100000;
export const PAYROLL_OSEP_206_BASE_PROFILE = 'osep-206-crlf.v1';

export const PAYROLL_OSEP_206_FIELDS = Object.freeze([
  { fieldId: 'period', start: 1, end: 6, kind: 'period', meaning: 'Período AAAAMM' },
  { fieldId: 'employerCode', start: 7, end: 14, kind: 'constant', value: '00000003', meaning: 'Código fijo observado (00000003) en ambas poblaciones' },
  { fieldId: 'dni', start: 15, end: 22, kind: 'digits', meaning: 'Documento, 8 dígitos con ceros a la izquierda' },
  { fieldId: 'reserved1', start: 23, end: 30, kind: 'constant', value: '00000000', meaning: 'Ceros observados' },
  { fieldId: 'legajo', start: 31, end: 34, kind: 'digits', meaning: 'Legajo, 4 dígitos' },
  { fieldId: 'fullName', start: 35, end: 74, kind: 'text', meaning: 'Apellido y nombre, 40 posiciones, alineado a la izquierda con espacios' },
  { fieldId: 'employerContributionCents', start: 75, end: 84, kind: 'cents', meaning: 'Aporte patronal OSEP (planilla: AP. PATRONAL)' },
  { fieldId: 'subjectSalaryCents', start: 85, end: 94, kind: 'cents', meaning: 'Haberes sujetos a descuento' },
  { fieldId: 'netPayCents', start: 95, end: 104, kind: 'cents', meaning: 'Neto a pagar' },
  { fieldId: 'quotaCents', start: 105, end: 114, kind: 'cents', meaning: 'OSEP cuota (601, 5 %)' },
  { fieldId: 'reserved2', start: 115, end: 124, kind: 'constant', value: '0000000000', meaning: 'Ceros observados' },
  { fieldId: 'voluntaryPureCents', start: 125, end: 134, kind: 'cents', meaning: 'OSEP voluntario puro (602)' },
  { fieldId: 'voluntaryStudentCents', start: 135, end: 144, kind: 'cents', meaning: 'OSEP voluntario estudiante (603)' },
  { fieldId: 'catastrophicCents', start: 145, end: 154, kind: 'cents', meaning: 'OSEP fondo enfermedades catastróficas (604, 0,25 %)' },
  { fieldId: 'catastrophicIndirectCents', start: 155, end: 164, kind: 'cents', meaning: 'OSEP catastrófico indirectos (682)' },
  { fieldId: 'reserved3', start: 165, end: 174, kind: 'constant', value: '0000000000', meaning: 'Ceros observados' },
  { fieldId: 'reserved4', start: 175, end: 184, kind: 'constant', value: '0000000000', meaning: 'Ceros observados' },
  { fieldId: 'currentAccountCents', start: 185, end: 194, kind: 'cents', meaning: 'OSEP cuenta corriente (605)' },
  { fieldId: 'bankrupt', start: 195, end: 196, kind: 'flag', meaning: 'Concursado: NO o SI' },
  { fieldId: 'disabilityDirectCents', start: 197, end: 206, kind: 'cents', meaning: 'OSEP fondo discapacidad directo (685, 0,75 %)' },
]);

export const PAYROLL_OSEP_206_PROFILE = Object.freeze({
  contractVersion: PAYROLL_OSEP_206_CONTRACT_VERSION,
  baseProfile: PAYROLL_OSEP_206_BASE_PROFILE,
  organization: 'OSEP',
  encoding: 'windows-1252',
  lineEnding: 'CRLF',
  bom: 'forbidden',
  recordBytes: PAYROLL_OSEP_206_RECORD_BYTES,
  fieldManifest: PAYROLL_OSEP_206_FIELDS,
  fieldMappingComplete: true,
  semanticStatus: 'mapped_by_cross_check',
  evidence: Object.freeze([
    { sourceRef: 'osep-206-observation-01', crossCheck: 'control-spreadsheet-2026-08', rowsMatched: 111, rowsTotal: 111, byteIdenticalRebuild: true },
    { sourceRef: 'osep-206-observation-02', crossCheck: 'control-spreadsheet-2026-08', rowsMatched: 728, rowsTotal: 731, byteIdenticalRebuild: true },
  ]),
  generationAllowed: true,
  officialSubmissionAllowed: false,
  homologated: false,
  homologationRequirement: 'Comparar un período completo generado por MuniControl contra el TXT emitido por GRH antes de presentarlo a OSEP.',
});

export class PayrollOsep206Error extends Error {
  constructor(code, message) { super(message); this.name = 'PayrollOsep206Error'; this.code = code; }
}
const fail = (code, message) => { throw new PayrollOsep206Error(code, message); };

const CENTS = /^(?:0|[1-9][0-9]{0,9})$/;
const PERIOD = /^(?:19|20)[0-9]{2}(?:0[1-9]|1[0-2])$/;

function encodeWindows1252(text) {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) bytes[index] = code;
    else fail('OSEP_206_CHARACTER_UNSUPPORTED', `El carácter «${text[index]}» no existe en windows-1252 básico; corregí el nombre antes de generar.`);
  }
  return bytes;
}

function decodeWindows1252(bytes) {
  let text = '';
  for (const byte of bytes) {
    if (byte < 0x80 || byte >= 0xa0) text += String.fromCharCode(byte);
    else fail('OSEP_206_BYTE_UNSUPPORTED', 'El archivo contiene bytes fuera del rango observado.');
  }
  return text;
}

function normalizeRow(row, index) {
  if (!row || typeof row !== 'object') fail('OSEP_206_ROW_INVALID', `La fila ${index + 1} no es un registro.`);
  const out = {};
  for (const field of PAYROLL_OSEP_206_FIELDS) {
    const width = field.end - field.start + 1;
    let value;
    if (field.kind === 'constant') value = field.value;
    else if (field.kind === 'period') {
      value = String(row.period ?? '');
      if (!PERIOD.test(value)) fail('OSEP_206_PERIOD_INVALID', `La fila ${index + 1} necesita período AAAAMM.`);
    } else if (field.kind === 'digits') {
      value = String(row[field.fieldId] ?? '');
      if (!/^[0-9]{1,8}$/.test(value) || value.length > width) fail('OSEP_206_DIGITS_INVALID', `La fila ${index + 1}: ${field.fieldId} debe ser numérico de hasta ${width} dígitos.`);
      value = value.padStart(width, '0');
    } else if (field.kind === 'text') {
      value = String(row.fullName ?? '').replace(/[\t\r\n]/g, ' ').trim().toUpperCase(); // los espacios internos se conservan tal como vienen del padrón
      if (value.length === 0) fail('OSEP_206_NAME_REQUIRED', `La fila ${index + 1} necesita apellido y nombre.`);
      if (value.length > width) fail('OSEP_206_NAME_TOO_LONG', `La fila ${index + 1}: el nombre supera ${width} posiciones; no se trunca.`);
      value = value.padEnd(width, ' ');
    } else if (field.kind === 'cents') {
      value = row[field.fieldId] === undefined || row[field.fieldId] === null ? '0' : String(row[field.fieldId]);
      if (!CENTS.test(value)) fail('OSEP_206_CENTS_INVALID', `La fila ${index + 1}: ${field.fieldId} debe ser un entero de centavos no negativo.`);
      value = value.padStart(width, '0');
    } else if (field.kind === 'flag') {
      value = row.bankrupt === true ? 'SI' : row.bankrupt === false || row.bankrupt === undefined ? 'NO' : fail('OSEP_206_FLAG_INVALID', `La fila ${index + 1}: concursado debe ser verdadero o falso.`);
    }
    if (value.length !== width) fail('OSEP_206_WIDTH', `La fila ${index + 1}: ${field.fieldId} no ocupa ${width} posiciones.`);
    out[field.fieldId] = value;
  }
  return out;
}

// rows: [{ period, dni, legajo, fullName, employerContributionCents, subjectSalaryCents, netPayCents,
//   quotaCents, voluntaryPureCents, voluntaryStudentCents, catastrophicCents, catastrophicIndirectCents,
//   currentAccountCents, bankrupt, disabilityDirectCents }]
export function renderPayrollOsep206(rows) {
  if (!Array.isArray(rows) || rows.length === 0) fail('OSEP_206_ROWS_REQUIRED', 'Informá al menos un registro.');
  if (rows.length > PAYROLL_OSEP_206_MAX_ROWS) fail('OSEP_206_TOO_MANY_ROWS', 'La población supera el límite admitido.');
  const period = String(rows[0].period ?? '');
  const seen = new Set();
  const lines = rows.map((row, index) => {
    const normalized = normalizeRow(row, index);
    if (normalized.period !== period) fail('OSEP_206_PERIOD_MIXED', 'Todos los registros deben ser del mismo período.');
    const key = `${normalized.dni}:${normalized.legajo}`;
    if (seen.has(key)) fail('OSEP_206_DUPLICATE', `La fila ${index + 1} repite documento y legajo.`);
    seen.add(key);
    return PAYROLL_OSEP_206_FIELDS.map(f => normalized[f.fieldId]).join('');
  });
  const text = lines.join('\r\n') + '\r\n';
  const bytes = encodeWindows1252(text);
  const totals = {};
  for (const field of PAYROLL_OSEP_206_FIELDS) {
    if (field.kind !== 'cents') continue;
    totals[field.fieldId] = lines.reduce((sum, line) => sum + BigInt(line.slice(field.start - 1, field.end)), 0n).toString();
  }
  return Object.freeze({
    contractVersion: PAYROLL_OSEP_206_CONTRACT_VERSION,
    profileId: PAYROLL_OSEP_206_BASE_PROFILE,
    period,
    recordCount: lines.length,
    byteLength: bytes.byteLength,
    bytes,
    totalsCents: Object.freeze(totals),
    officialSubmissionAllowed: PAYROLL_OSEP_206_PROFILE.officialSubmissionAllowed,
  });
}

export function parsePayrollOsep206(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) fail('OSEP_206_SOURCE_INVALID', 'El TXT debe recibirse como bytes.');
  const text = decodeWindows1252(bytes);
  const parts = text.split('\r\n');
  const isTerminal = line => line.length === 25 && /^\t{24} $/.test(line);
  // Registro de cola observado: 24 tabulaciones y un espacio, sin CRLF final.
  const last = parts.at(-1);
  if (last !== '' && !isTerminal(last)) fail('OSEP_206_TRAILING_CRLF', 'Cada registro debe terminar en CRLF.');
  const rows = [];
  for (const line of (last === '' ? parts.slice(0, -1) : parts)) {
    if (isTerminal(line)) { rows.push({ terminalRecord: true }); continue; }
    if (line.length !== PAYROLL_OSEP_206_RECORD_BYTES) fail('OSEP_206_RECORD_WIDTH', `Registro de ${line.length} bytes; se esperaban ${PAYROLL_OSEP_206_RECORD_BYTES}.`);
    const row = {};
    for (const field of PAYROLL_OSEP_206_FIELDS) {
      const raw = line.slice(field.start - 1, field.end);
      if (field.kind === 'constant' && raw !== field.value) fail('OSEP_206_CONSTANT_MISMATCH', `El campo ${field.fieldId} difiere del valor observado.`);
      if (field.kind === 'cents' || field.kind === 'digits' || field.kind === 'period') {
        if (!/^[0-9]+$/.test(raw)) fail('OSEP_206_FIELD_NOT_NUMERIC', `El campo ${field.fieldId} no es numérico.`);
        row[field.fieldId] = field.kind === 'cents' ? String(BigInt(raw)) : (field.kind === 'digits' ? raw.replace(/^0+(?=\d)/, '') : raw);
      } else if (field.kind === 'text') row.fullName = raw.trimEnd();
      else if (field.kind === 'flag') {
        if (raw !== 'NO' && raw !== 'SI') fail('OSEP_206_FLAG_UNKNOWN', 'Concursado debe ser NO o SI.');
        row.bankrupt = raw === 'SI';
      }
    }
    rows.push(row);
  }
  return Object.freeze({ contractVersion: PAYROLL_OSEP_206_CONTRACT_VERSION, rows: Object.freeze(rows), baseProfileKnown: Object.hasOwn(PAYROLL_HEALTH_FIXED_WIDTH_PROFILES, PAYROLL_OSEP_206_BASE_PROFILE) });
}
