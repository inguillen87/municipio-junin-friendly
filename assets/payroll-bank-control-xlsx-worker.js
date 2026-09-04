import {
  PAYROLL_BANK_CONTROL_MAX_BYTES,
  PayrollBankControlError,
  preparePayrollBankControlWorkbook,
} from './payroll-bank-control-xlsx-adapter.js';

const MAX_ZIP_ENTRIES = 256;
const MAX_UNCOMPRESSED_BYTES = 32 * 1024 * 1024;
const MAX_WORKBOOK_XML_BYTES = 256 * 1024;
const MAX_RELATIONSHIPS_XML_BYTES = 256 * 1024;
const MAX_SHARED_STRINGS_XML_BYTES = 8 * 1024 * 1024;
const MAX_WORKSHEET_XML_BYTES = 4 * 1024 * 1024;
const MAX_SHARED_STRINGS = 80_000;
const MAX_ROWS_PER_SHEET = 20_000;
const MAX_TEXT_CELL_LENGTH = 300;
const WORKSHEET_RELATIONSHIP = /\/relationships\/worksheet$/;
const FORBIDDEN_OOXML_ENTRY = /^(?:customXml\/|xl\/(?:activeX|comments|ctrlProps|drawings|embeddings|media|persons|threadedComments)\/)|(?:^|\/)vbaProject\.bin$/i;

function fail(code, message) {
  throw new PayrollBankControlError(code, message);
}

async function loadZipReader() {
  if (typeof globalThis.fflate?.unzipSync !== 'function') {
    try {
      await import('./vendor/fflate.min.js');
    } catch {
      fail(
        'BANK_CONTROL_ZIP_READER_UNAVAILABLE',
        'No se pudo iniciar el lector local del Excel',
      );
    }
  }
  if (typeof globalThis.fflate?.unzipSync !== 'function') {
    fail(
      'BANK_CONTROL_ZIP_READER_UNAVAILABLE',
      'No se pudo iniciar el lector local del Excel',
    );
  }
  return globalThis.fflate.unzipSync;
}

function decodeXml(bytes, maximum, code) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength <= 0 || bytes.byteLength > maximum) {
    fail(code, 'El Excel contiene una parte XML ausente o fuera del tamaño admitido');
  }
  try {
    const xml = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
      fail(code, 'El Excel contiene una declaración XML no admitida');
    }
    return xml;
  } catch (error) {
    if (error instanceof PayrollBankControlError) throw error;
    fail(code, 'No se pudo leer una parte XML del Excel');
  }
}

function xmlText(value) {
  return String(value ?? '').replace(
    /&(?:amp|apos|gt|lt|quot|#\d+|#x[0-9a-f]+);/gi,
    (entity) => {
      const named = {
        '&amp;': '&', '&apos;': "'", '&gt;': '>', '&lt;': '<', '&quot;': '"',
      }[entity.toLowerCase()];
      if (named !== undefined) return named;
      const isHex = /^&#x/i.test(entity);
      const digits = entity.slice(isHex ? 3 : 2, -1);
      const codePoint = Number.parseInt(digits, isHex ? 16 : 10);
      if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff
          || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
        fail('BANK_CONTROL_XML_INVALID', 'El Excel contiene una entidad XML inválida');
      }
      return String.fromCodePoint(codePoint);
    },
  );
}

function attributes(raw) {
  const result = Object.create(null);
  const pattern = /(?:^|\s)([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of raw.matchAll(pattern)) {
    const key = match[1].includes(':') ? match[1].split(':').pop() : match[1];
    if (Object.hasOwn(result, key)) {
      fail('BANK_CONTROL_XML_INVALID', 'El Excel repite un atributo XML relevante');
    }
    result[key] = xmlText(match[2] ?? match[3] ?? '');
  }
  return result;
}

function tagPattern(localName, flags = 'g') {
  return new RegExp(
    `<(?:[A-Za-z_][\\w.-]*:)?${localName}\\b([^>]*?)(?:\\/>|>([\\s\\S]*?)<\\/(?:[A-Za-z_][\\w.-]*:)?${localName}\\s*>)`,
    flags,
  );
}

function bodyText(body) {
  if (typeof body !== 'string') return '';
  return xmlText(body.replace(/<[^>]*>/g, '')).trim();
}

function normalizePartPath(basePart, target) {
  if (typeof target !== 'string' || target.length <= 0 || target.length > 180
      || target.includes('\\') || target.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(target)) {
    fail('BANK_CONTROL_RELATIONSHIP_INVALID', 'El Excel contiene una relación interna no admitida');
  }
  const segments = `${basePart.slice(0, basePart.lastIndexOf('/') + 1)}${target}`.split('/');
  const normalized = [];
  for (const segment of segments) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (normalized.length <= 0) {
        fail('BANK_CONTROL_RELATIONSHIP_INVALID', 'El Excel contiene una ruta interna inválida');
      }
      normalized.pop();
      continue;
    }
    normalized.push(segment);
  }
  const path = normalized.join('/');
  if (!/^xl\/worksheets\/[^/]+\.xml$/i.test(path)) {
    fail('BANK_CONTROL_RELATIONSHIP_INVALID', 'Una hoja no apunta a una parte OOXML admitida');
  }
  return path;
}

function parseWorkbookParts(workbookXml, relationshipsXml) {
  // DOMParser is preferred when exposed by the worker runtime. Chromium does
  // not expose it in DedicatedWorkerGlobalScope, so the same bounded OOXML
  // elements are parsed by the narrow scanner below without materializing
  // sparse rows or sending worksheet XML to the main thread.
  if (typeof DOMParser === 'function') {
    const workbook = new DOMParser().parseFromString(workbookXml, 'application/xml');
    const relationships = new DOMParser().parseFromString(relationshipsXml, 'application/xml');
    if (workbook.getElementsByTagName('parsererror').length
        || relationships.getElementsByTagName('parsererror').length) {
      fail('BANK_CONTROL_XML_INVALID', 'El Excel contiene XML inválido');
    }
  }

  const paths = new Map();
  const relationshipPattern = tagPattern('Relationship');
  for (const match of relationshipsXml.matchAll(relationshipPattern)) {
    const entry = attributes(match[1]);
    if (entry.TargetMode === 'External' || !WORKSHEET_RELATIONSHIP.test(entry.Type ?? '')) continue;
    if (!entry.Id || paths.has(entry.Id)) {
      fail('BANK_CONTROL_RELATIONSHIP_INVALID', 'El Excel repite una relación de hoja');
    }
    paths.set(entry.Id, normalizePartPath('xl/workbook.xml', entry.Target));
  }

  const sheets = [];
  const names = new Set();
  const parts = new Set();
  const sheetPattern = tagPattern('sheet');
  for (const match of workbookXml.matchAll(sheetPattern)) {
    const entry = attributes(match[1]);
    const relationshipId = entry.id;
    const part = paths.get(relationshipId);
    if (!entry.name || entry.name.length > 80 || !part || names.has(entry.name) || parts.has(part)) {
      fail('BANK_CONTROL_WORKBOOK_INVALID', 'El libro no identifica ocho hojas únicas');
    }
    names.add(entry.name);
    parts.add(part);
    sheets.push(Object.freeze({ name: entry.name, part }));
  }
  if (sheets.length !== 8) {
    fail('BANK_CONTROL_WORKBOOK_INVALID', 'El libro debe contener exactamente ocho hojas');
  }
  return sheets;
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const values = [];
  const itemPattern = tagPattern('si');
  const textPattern = tagPattern('t');
  for (const item of xml.matchAll(itemPattern)) {
    let value = '';
    for (const text of String(item[2] ?? '').matchAll(textPattern)) value += bodyText(text[2]);
    if (value.length > MAX_TEXT_CELL_LENGTH) {
      fail('BANK_CONTROL_SHARED_STRINGS_INVALID', 'Un rótulo del Excel supera el largo admitido');
    }
    values.push(value);
    if (values.length > MAX_SHARED_STRINGS) {
      fail('BANK_CONTROL_SHARED_STRINGS_INVALID', 'El Excel supera la cantidad de rótulos admitida');
    }
  }
  return values;
}

function extractValue(body, type, sharedStrings) {
  const source = String(body ?? '');
  const formula = tagPattern('f', 'i').exec(source);
  const value = tagPattern('v', 'i').exec(source);
  if (formula && !value) {
    fail('BANK_CONTROL_FORMULA_CACHE_REQUIRED', 'Una fórmula no conserva su valor cacheado');
  }
  if (type === 'inlineStr') {
    const textPattern = tagPattern('t');
    let text = '';
    for (const match of source.matchAll(textPattern)) text += bodyText(match[2]);
    return text;
  }
  const raw = value ? bodyText(value[2]) : '';
  if (type === 's') {
    if (!/^(?:0|[1-9][0-9]*)$/.test(raw)) {
      fail('BANK_CONTROL_SHARED_STRING_REFERENCE_INVALID', 'Una celda referencia un rótulo inválido');
    }
    const resolved = sharedStrings[Number(raw)];
    if (typeof resolved !== 'string') {
      fail('BANK_CONTROL_SHARED_STRING_REFERENCE_INVALID', 'Una celda referencia un rótulo ausente');
    }
    return resolved;
  }
  return raw;
}

function parseWorksheet(xml, sharedStrings) {
  const dimension = tagPattern('dimension', 'i').exec(xml);
  const dimensionRef = dimension ? (attributes(dimension[1]).ref ?? '') : '';
  const sheetData = tagPattern('sheetData', 'i').exec(xml);
  if (!sheetData) fail('BANK_CONTROL_WORKSHEET_INVALID', 'Una hoja no contiene filas OOXML');

  const rows = [];
  const rowPattern = tagPattern('row');
  let previousRow = 0;
  for (const rowMatch of String(sheetData[2] ?? '').matchAll(rowPattern)) {
    const rowAttributes = attributes(rowMatch[1]);
    if (!/^(?:[1-9]|[1-9][0-9]{1,5}|10[0-3][0-9]{4}|104[0-7][0-9]{3}|1048[0-4][0-9]{2}|10485[0-6][0-9]|104857[0-6])$/.test(rowAttributes.r ?? '')) {
      fail('BANK_CONTROL_ROW_INVALID', 'Una hoja contiene una fila sin número válido');
    }
    const rowNumber = Number(rowAttributes.r);
    if (rowNumber <= previousRow) {
      fail('BANK_CONTROL_ROW_INVALID', 'Las filas OOXML están repetidas o fuera de orden');
    }
    previousRow = rowNumber;
    const cells = Object.create(null);
    const cellPattern = tagPattern('c');
    for (const cellMatch of String(rowMatch[2] ?? '').matchAll(cellPattern)) {
      const cellAttributes = attributes(cellMatch[1]);
      const reference = /^([A-Z]{1,3})([1-9][0-9]{0,6})$/.exec(cellAttributes.r ?? '');
      if (!reference || Number(reference[2]) !== rowNumber) {
        fail('BANK_CONTROL_CELL_INVALID', 'Una hoja contiene una referencia de celda inválida');
      }
      const column = reference[1];
      if (!/^[A-F]$/.test(column)) continue;
      if (Object.hasOwn(cells, column)) {
        fail('BANK_CONTROL_CELL_INVALID', 'Una fila repite una celda relevante');
      }
      const cellValue = extractValue(cellMatch[2], cellAttributes.t ?? '', sharedStrings);
      if (cellValue.length > MAX_TEXT_CELL_LENGTH) {
        fail('BANK_CONTROL_CELL_INVALID', 'Una celda relevante supera el largo admitido');
      }
      if (cellValue !== '') cells[column] = cellValue;
    }
    if (Object.keys(cells).length > 0) rows.push(Object.freeze({ rowNumber, cells }));
    if (rows.length > MAX_ROWS_PER_SHEET) {
      fail('BANK_CONTROL_ROW_LIMIT_EXCEEDED', 'Una hoja supera las filas XML admitidas');
    }
  }
  if (rows.length <= 0) fail('BANK_CONTROL_WORKSHEET_INVALID', 'Una hoja no contiene celdas relevantes');
  return Object.freeze({ dimension: dimensionRef, rows: Object.freeze(rows) });
}

function unzipWorkbook(bytes, unzipSync) {
  let entryCount = 0;
  let uncompressedBytes = 0;
  const extracted = unzipSync(bytes, {
    filter(entry) {
      entryCount += 1;
      if (entryCount > MAX_ZIP_ENTRIES || !Number.isSafeInteger(entry.originalSize)
          || entry.originalSize < 0 || entry.name.includes('\\') || entry.name.startsWith('/')
          || entry.name.split('/').includes('..') || FORBIDDEN_OOXML_ENTRY.test(entry.name)) {
        fail('BANK_CONTROL_ARCHIVE_INVALID', 'El Excel contiene una estructura interna no admitida');
      }
      uncompressedBytes += entry.originalSize;
      if (uncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
        fail('BANK_CONTROL_ARCHIVE_INVALID', 'El Excel supera el tamaño interno admitido');
      }
      if (entry.name === 'xl/workbook.xml') return entry.originalSize <= MAX_WORKBOOK_XML_BYTES;
      if (entry.name === 'xl/_rels/workbook.xml.rels') {
        return entry.originalSize <= MAX_RELATIONSHIPS_XML_BYTES;
      }
      if (entry.name === 'xl/sharedStrings.xml') {
        return entry.originalSize <= MAX_SHARED_STRINGS_XML_BYTES;
      }
      if (/^xl\/worksheets\/[^/]+\.xml$/i.test(entry.name)) {
        if (entry.originalSize > MAX_WORKSHEET_XML_BYTES) {
          fail('BANK_CONTROL_ARCHIVE_INVALID', 'Una hoja supera el tamaño XML admitido');
        }
        return true;
      }
      return false;
    },
  });
  return extracted;
}

function clearExtracted(extracted) {
  if (!extracted || typeof extracted !== 'object') return;
  for (const value of Object.values(extracted)) {
    if (value instanceof Uint8Array) value.fill(0);
  }
}

self.addEventListener('message', async (event) => {
  if (event.data?.type !== 'prepare' || !(event.data.arrayBuffer instanceof ArrayBuffer)
      || typeof event.data.period !== 'string' || !event.data.accountTypes
      || typeof event.data.accountTypes !== 'object') {
    self.postMessage({
      ok: false,
      code: 'BANK_CONTROL_WORKER_INPUT_INVALID',
      message: 'El procesador recibió un contexto incompleto',
    });
    self.close();
    return;
  }
  const bytes = new Uint8Array(event.data.arrayBuffer);
  let extracted = null;
  if (bytes.byteLength <= 0 || bytes.byteLength > PAYROLL_BANK_CONTROL_MAX_BYTES) {
    self.postMessage({
      ok: false,
      code: 'BANK_CONTROL_SIZE_INVALID',
      message: 'El Excel está vacío o supera el máximo local de 2 MiB',
    });
    bytes.fill(0);
    self.close();
    return;
  }
  try {
    const unzipSync = await loadZipReader();
    extracted = unzipWorkbook(bytes, unzipSync);
    const workbookXml = decodeXml(
      extracted['xl/workbook.xml'], MAX_WORKBOOK_XML_BYTES, 'BANK_CONTROL_WORKBOOK_INVALID',
    );
    const relationshipsXml = decodeXml(
      extracted['xl/_rels/workbook.xml.rels'],
      MAX_RELATIONSHIPS_XML_BYTES,
      'BANK_CONTROL_WORKBOOK_INVALID',
    );
    const sheetParts = parseWorkbookParts(workbookXml, relationshipsXml);
    const sharedStrings = extracted['xl/sharedStrings.xml']
      ? parseSharedStrings(decodeXml(
        extracted['xl/sharedStrings.xml'],
        MAX_SHARED_STRINGS_XML_BYTES,
        'BANK_CONTROL_SHARED_STRINGS_INVALID',
      ))
      : [];
    const sheets = sheetParts.map(({ name, part }) => {
      const parsed = parseWorksheet(
        decodeXml(extracted[part], MAX_WORKSHEET_XML_BYTES, 'BANK_CONTROL_WORKSHEET_INVALID'),
        sharedStrings,
      );
      return Object.freeze({ name, dimension: parsed.dimension, rows: parsed.rows });
    });
    const control = preparePayrollBankControlWorkbook({
      period: event.data.period,
      byteLength: bytes.byteLength,
      sheets,
      accountTypes: event.data.accountTypes,
    });
    // Only the aggregate control contract crosses the worker boundary. Sheet
    // rows, shared strings, CUIL, names, account numbers and CBU die here.
    self.postMessage({ ok: true, control });
  } catch (error) {
    self.postMessage({
      ok: false,
      code: error instanceof PayrollBankControlError
        ? error.code : 'BANK_CONTROL_XLSX_INVALID',
      message: error instanceof PayrollBankControlError
        ? error.message : 'El archivo no coincide con la planilla de control esperada',
    });
  } finally {
    clearExtracted(extracted);
    bytes.fill(0);
    self.close();
  }
}, { once: true });
