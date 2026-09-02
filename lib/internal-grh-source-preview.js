import { createHash, createHmac } from 'node:crypto';

export const GRH_SOURCE_PREVIEW_CONTRACT_VERSION = 'grh-source-preview.v1';
export const GRH_SOURCE_PREVIEW_MAX_BYTES = 25 * 1024 * 1024;
export const GRH_SOURCE_PREVIEW_MAX_RECORDS = 100_000;
export const GRH_SOURCE_PREVIEW_MAX_BATCH_BYTES = 250 * 1024 * 1024;
export const GRH_SOURCE_PREVIEW_MAX_BATCH_SOURCES = 100;

const FORMAT_SET = new Set(['fixed_width', 'pipe']);
const TYPE_SET = new Set(['text', 'integer', 'decimal', 'date']);
const FIELD_NAME = /^[a-z][a-z0-9_]{0,63}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_DECIMAL = /^-?\d+(?:[.,]\d+)?$/;
const PIPE_DELIMITER_SET = new Set(['|', ';', '\t']);
const SOURCE_ENCODING_SET = new Set(['utf-8', 'windows-1252']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

export class GrhSourcePreviewError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GrhSourcePreviewError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new GrhSourcePreviewError(code, message);
}

function exactObject(value, allowed, code, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(code, `${label} debe ser un objeto exacto`);
  }
  const extra = Object.keys(value).find((key) => !allowed.has(key));
  if (extra) fail(code, `${label} contiene un campo no permitido: ${extra}`);
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

function normalizedUuid(value, label) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!UUID.test(normalized) || normalized === NIL_UUID) {
    fail('GRH_SOURCE_FINGERPRINT_CONTEXT_INVALID', `${label} debe ser un UUID válido`);
  }
  return normalized;
}

function normalizeFingerprintContext({ fingerprintKey, tenantId, sourceBindingId } = {}) {
  const key = Buffer.isBuffer(fingerprintKey)
    ? fingerprintKey
    : typeof fingerprintKey === 'string' ? Buffer.from(fingerprintKey, 'utf8') : null;
  if (!key || key.byteLength < 32) {
    fail('GRH_SOURCE_FINGERPRINT_KEY_INVALID', 'fingerprintKey debe tener al menos 32 bytes');
  }
  return Object.freeze({
    key,
    tenantId: normalizedUuid(tenantId, 'tenantId'),
    sourceBindingId: normalizedUuid(sourceBindingId, 'sourceBindingId'),
  });
}

function contentFingerprint(bytes, context) {
  const digest = createHmac('sha256', context.key)
    .update(GRH_SOURCE_PREVIEW_CONTRACT_VERSION, 'utf8')
    .update('\0', 'utf8')
    .update(context.tenantId, 'utf8')
    .update('\0', 'utf8')
    .update(context.sourceBindingId, 'utf8')
    .update('\0', 'utf8')
    .update(bytes)
    .digest('hex');
  return `hmac-sha256:${digest}`;
}

function normalizeBytes(value) {
  let bytes;
  if (Buffer.isBuffer(value)) bytes = value;
  else if (value instanceof Uint8Array) bytes = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  else fail('GRH_SOURCE_BYTES_INVALID', 'La fuente debe recibirse como Buffer o Uint8Array');
  if (bytes.byteLength === 0) fail('GRH_SOURCE_EMPTY', 'La fuente está vacía');
  if (bytes.byteLength > GRH_SOURCE_PREVIEW_MAX_BYTES) {
    fail('GRH_SOURCE_TOO_LARGE', 'La fuente supera el límite seguro de previsualización');
  }
  return bytes;
}

function normalizedName(value, label = 'field.name') {
  const name = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!FIELD_NAME.test(name)) fail('GRH_SOURCE_SCHEMA_INVALID', `${label} es inválido`);
  return name;
}

function normalizedType(value) {
  const type = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!TYPE_SET.has(type)) fail('GRH_SOURCE_SCHEMA_INVALID', 'field.type no pertenece al contrato');
  return type;
}

function normalizedEncoding(value) {
  const encoding = value == null ? 'utf-8' : String(value).trim().toLowerCase();
  if (!SOURCE_ENCODING_SET.has(encoding)) {
    fail('GRH_SOURCE_SCHEMA_INVALID', 'encoding debe ser utf-8 o windows-1252');
  }
  return encoding;
}

function normalizedCommonField(value) {
  exactObject(value, new Set(['name', 'type', 'required', 'start', 'length']),
    'GRH_SOURCE_SCHEMA_INVALID', 'field');
  if (typeof value.required !== 'boolean') {
    fail('GRH_SOURCE_SCHEMA_INVALID', 'field.required debe ser booleano');
  }
  return {
    name: normalizedName(value.name),
    type: normalizedType(value.type),
    required: value.required,
  };
}

function normalizeFixedWidthDefinition(input) {
  exactObject(input, new Set(['format', 'widthUnit', 'recordLength', 'fields']),
    'GRH_SOURCE_SCHEMA_INVALID', 'definition');
  if (input.widthUnit !== 'ascii_bytes') {
    fail('GRH_SOURCE_SCHEMA_INVALID', 'fixed_width exige widthUnit ascii_bytes');
  }
  if (!Number.isSafeInteger(input.recordLength) || input.recordLength < 1 || input.recordLength > 4096) {
    fail('GRH_SOURCE_SCHEMA_INVALID', 'recordLength debe ser un entero entre 1 y 4096');
  }
  if (!Array.isArray(input.fields) || input.fields.length === 0 || input.fields.length > 256) {
    fail('GRH_SOURCE_SCHEMA_INVALID', 'fields debe contener entre 1 y 256 campos');
  }
  const fields = input.fields.map((value) => {
    const field = normalizedCommonField(value);
    if (!Number.isSafeInteger(value.start) || value.start < 0
        || !Number.isSafeInteger(value.length) || value.length < 1
        || value.start + value.length > input.recordLength) {
      fail('GRH_SOURCE_SCHEMA_INVALID', `El rango de ${field.name} excede el registro`);
    }
    return { ...field, start: value.start, length: value.length };
  });
  const names = fields.map(({ name }) => name);
  if (new Set(names).size !== names.length) {
    fail('GRH_SOURCE_SCHEMA_INVALID', 'Los nombres de campo deben ser únicos');
  }
  const occupied = new Set();
  for (const field of fields) {
    for (let index = field.start; index < field.start + field.length; index += 1) {
      if (occupied.has(index)) fail('GRH_SOURCE_SCHEMA_INVALID', 'Los rangos de campos no pueden superponerse');
      occupied.add(index);
    }
  }
  return Object.freeze({
    format: 'fixed_width', widthUnit: 'ascii_bytes', recordLength: input.recordLength, fields,
  });
}

function normalizePipeDefinition(input) {
  exactObject(input, new Set(['format', 'encoding', 'delimiter', 'header', 'fields']),
    'GRH_SOURCE_SCHEMA_INVALID', 'definition');
  const delimiter = input.delimiter ?? '|';
  if (!PIPE_DELIMITER_SET.has(delimiter)) {
    fail('GRH_SOURCE_SCHEMA_INVALID', 'delimiter debe ser |, ; o tabulación');
  }
  if (typeof input.header !== 'boolean') fail('GRH_SOURCE_SCHEMA_INVALID', 'header debe ser booleano');
  if (!Array.isArray(input.fields) || input.fields.length === 0 || input.fields.length > 256) {
    fail('GRH_SOURCE_SCHEMA_INVALID', 'fields debe contener entre 1 y 256 campos');
  }
  const fields = input.fields.map((value) => {
    const field = normalizedCommonField(value);
    if (value.start != null || value.length != null) {
      fail('GRH_SOURCE_SCHEMA_INVALID', 'Los campos pipe no admiten start ni length');
    }
    return field;
  });
  const names = fields.map(({ name }) => name);
  if (new Set(names).size !== names.length) {
    fail('GRH_SOURCE_SCHEMA_INVALID', 'Los nombres de campo deben ser únicos');
  }
  return Object.freeze({
    format: 'pipe', encoding: normalizedEncoding(input.encoding),
    delimiter, header: input.header, fields,
  });
}

export function normalizeGrhSourceDefinition(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('GRH_SOURCE_SCHEMA_INVALID', 'definition debe ser un objeto');
  }
  const format = typeof input.format === 'string' ? input.format.trim().toLowerCase() : '';
  if (!FORMAT_SET.has(format)) fail('GRH_SOURCE_SCHEMA_INVALID', 'format no pertenece al contrato');
  return format === 'fixed_width'
    ? normalizeFixedWidthDefinition({ ...input, format })
    : normalizePipeDefinition({ ...input, format });
}

function decodeSource(bytes, encoding) {
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  } catch {
    fail('GRH_SOURCE_ENCODING_INVALID', `La fuente no es ${encoding} válido`);
  }
}

function splitPhysicalLines(text, maximumPhysicalLines) {
  const lines = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character !== '\n' && character !== '\r') continue;
    lines.push(text.slice(start, index));
    if (lines.length > maximumPhysicalLines) {
      fail('GRH_SOURCE_TOO_MANY_RECORDS', 'La fuente supera el límite seguro de registros');
    }
    if (character === '\r' && text[index + 1] === '\n') index += 1;
    start = index + 1;
  }
  if (start < text.length) {
    lines.push(text.slice(start));
    if (lines.length > maximumPhysicalLines) {
      fail('GRH_SOURCE_TOO_MANY_RECORDS', 'La fuente supera el límite seguro de registros');
    }
  }
  while (lines.length && lines.at(-1) === '') lines.pop();
  if (lines.length === 0) fail('GRH_SOURCE_EMPTY', 'La fuente no contiene registros');
  return lines;
}

function parseDelimitedLine(line, delimiter) {
  const values = [];
  let value = '';
  let quoted = false;
  let quoteClosed = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"' && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
        quoteClosed = true;
      } else value += character;
    } else if (character === '"') {
      if (value.length > 0 || quoteClosed) return { error: 'QUOTE_INVALID' };
      quoted = true;
    } else if (character === delimiter) {
      values.push(value);
      value = '';
      quoteClosed = false;
    } else if (quoteClosed) return { error: 'QUOTE_INVALID' };
    else value += character;
  }
  if (quoted) return { error: 'QUOTE_UNCLOSED' };
  values.push(value);
  return { values };
}

function validCivilDate(value) {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validateScalar(rawValue, field) {
  const value = rawValue.trim();
  if (!value) return field.required ? 'REQUIRED' : null;
  if (/\p{Cc}/u.test(value)) return 'CONTROL_CHARACTER';
  if (field.type === 'integer' && !/^-?\d+$/.test(value)) return 'INTEGER_INVALID';
  if (field.type === 'decimal' && !SAFE_DECIMAL.test(value)) return 'DECIMAL_INVALID';
  if (field.type === 'date' && !validCivilDate(value)) return 'DATE_INVALID';
  return null;
}

function rejection(code, line) {
  return Object.freeze({ line, code });
}

function inspectFixedWidth(lines, definition) {
  const recordRejections = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/^[\x20-\x7E]*$/.test(line)) {
      recordRejections.push(rejection('NON_ASCII_FIXED_WIDTH', index + 1));
      continue;
    }
    if (line.length !== definition.recordLength) {
      recordRejections.push(rejection('RECORD_LENGTH_MISMATCH', index + 1));
      continue;
    }
    for (const field of definition.fields) {
      const code = validateScalar(line.slice(field.start, field.start + field.length), field);
      if (code) {
        recordRejections.push(rejection(`${field.name.toUpperCase()}_${code}`, index + 1));
        break;
      }
    }
  }
  return {
    firstDataLine: 1, recordCount: lines.length, recordRejections, structuralErrors: [],
  };
}

function inspectPipe(lines, definition) {
  const recordRejections = [];
  const structuralErrors = [];
  let firstDataLine = 1;
  if (definition.header) {
    const parsed = parseDelimitedLine(lines[0], definition.delimiter);
    const expected = definition.fields.map(({ name }) => name);
    const actual = parsed.values?.map((value) => value.trim().toLowerCase());
    if (parsed.error || !actual || stableJson(actual) !== stableJson(expected)) {
      structuralErrors.push(rejection('HEADER_MISMATCH', 1));
    }
    firstDataLine = 2;
  }
  const recordCount = Math.max(0, lines.length - firstDataLine + 1);
  if (structuralErrors.length) {
    return { firstDataLine, recordCount, recordRejections, structuralErrors };
  }
  for (let index = firstDataLine - 1; index < lines.length; index += 1) {
    const parsed = parseDelimitedLine(lines[index], definition.delimiter);
    if (parsed.error) {
      recordRejections.push(rejection(parsed.error, index + 1));
      continue;
    }
    if (parsed.values.length !== definition.fields.length) {
      recordRejections.push(rejection('COLUMN_COUNT_MISMATCH', index + 1));
      continue;
    }
    for (let fieldIndex = 0; fieldIndex < definition.fields.length; fieldIndex += 1) {
      const field = definition.fields[fieldIndex];
      const code = validateScalar(parsed.values[fieldIndex], field);
      if (code) {
        recordRejections.push(rejection(`${field.name.toUpperCase()}_${code}`, index + 1));
        break;
      }
    }
  }
  return { firstDataLine, recordCount, recordRejections, structuralErrors };
}

function rejectionSummary(rejections) {
  const summary = {};
  for (const { code } of rejections) summary[code] = (summary[code] ?? 0) + 1;
  return Object.freeze(Object.fromEntries(Object.entries(summary).sort(([left], [right]) => left.localeCompare(right))));
}

export function previewGrhSource(bytesInput, definitionInput, options = {}) {
  const fingerprintContext = normalizeFingerprintContext(options);
  const bytes = normalizeBytes(bytesInput);
  const definition = normalizeGrhSourceDefinition(definitionInput);
  const maximumPhysicalLines = GRH_SOURCE_PREVIEW_MAX_RECORDS
    + (definition.format === 'pipe' && definition.header ? 1 : 0);
  const encoding = definition.format === 'fixed_width' ? 'utf-8' : definition.encoding;
  const lines = splitPhysicalLines(decodeSource(bytes, encoding), maximumPhysicalLines);
  const inspection = definition.format === 'fixed_width'
    ? inspectFixedWidth(lines, definition)
    : inspectPipe(lines, definition);
  const rejectedLines = new Set(inspection.recordRejections.map(({ line }) => line));
  const rejectedRecordCount = inspection.structuralErrors.length
    ? inspection.recordCount
    : [...rejectedLines].filter((line) => line >= inspection.firstDataLine).length;
  const acceptedCount = Math.max(0, inspection.recordCount - rejectedRecordCount);
  const issueCount = inspection.recordRejections.length + inspection.structuralErrors.length;
  return Object.freeze({
    contractVersion: GRH_SOURCE_PREVIEW_CONTRACT_VERSION,
    format: definition.format,
    encoding: definition.format === 'fixed_width' ? 'ascii' : definition.encoding,
    contentFingerprint: contentFingerprint(bytes, fingerprintContext),
    schemaSha256: sha256(stableJson(definition)),
    byteLength: bytes.byteLength,
    recordCount: inspection.recordCount,
    acceptedCount,
    rejectedRecordCount,
    structuralErrorCount: inspection.structuralErrors.length,
    issueCount,
    schemaValid: inspection.structuralErrors.length === 0,
    status: inspection.structuralErrors.length
      ? 'invalid_structure' : inspection.recordRejections.length ? 'has_rejections' : 'valid',
    rejectionSummary: rejectionSummary([
      ...inspection.structuralErrors, ...inspection.recordRejections,
    ]),
    structuralErrors: Object.freeze(inspection.structuralErrors),
    rejections: Object.freeze(inspection.recordRejections.slice(0, 1_000)),
    rejectionsTruncated: inspection.recordRejections.length > 1_000,
    includesRecordValues: false,
    persistencePerformed: false,
  });
}

export function previewGrhSourceBatch(sources, definitionInput, options = {}) {
  normalizeFingerprintContext(options);
  if (!Array.isArray(sources) || sources.length === 0
      || sources.length > GRH_SOURCE_PREVIEW_MAX_BATCH_SOURCES) {
    fail('GRH_SOURCE_BATCH_INVALID',
      `sources debe contener entre 1 y ${GRH_SOURCE_PREVIEW_MAX_BATCH_SOURCES} fuentes`);
  }
  const definition = normalizeGrhSourceDefinition(definitionInput);
  let batchBytes = 0;
  for (const source of sources) {
    exactObject(source, new Set(['bytes']), 'GRH_SOURCE_BATCH_INVALID', 'source');
    const bytes = normalizeBytes(source.bytes);
    batchBytes += bytes.byteLength;
    if (batchBytes > GRH_SOURCE_PREVIEW_MAX_BATCH_BYTES) {
      fail('GRH_SOURCE_BATCH_TOO_LARGE', 'El lote supera el límite seguro agregado');
    }
  }
  const previews = [];
  const fingerprints = new Map();
  for (let index = 0; index < sources.length; index += 1) {
    const sourceRef = `source-${String(index + 1).padStart(4, '0')}`;
    const preview = previewGrhSource(sources[index].bytes, definition, options);
    previews.push(Object.freeze({ sourceRef, ...preview }));
    const refs = fingerprints.get(preview.contentFingerprint) ?? [];
    refs.push(sourceRef);
    fingerprints.set(preview.contentFingerprint, refs);
  }
  const duplicateGroups = [...fingerprints.entries()]
    .filter(([, sourceRefs]) => sourceRefs.length > 1)
    .map(([fingerprint, sourceRefs]) => Object.freeze({
      fingerprint, sourceRefs: Object.freeze(sourceRefs),
    }));
  return Object.freeze({
    contractVersion: GRH_SOURCE_PREVIEW_CONTRACT_VERSION,
    sourceCount: previews.length,
    byteLength: batchBytes,
    uniqueContentCount: fingerprints.size,
    duplicateGroupCount: duplicateGroups.length,
    previews: Object.freeze(previews),
    duplicateGroups: Object.freeze(duplicateGroups),
    persistencePerformed: false,
  });
}
