import {
  JURISDICTION_NET_CONTROL_MAX_BYTES,
  JurisdictionNetControlError,
  prepareJurisdictionNetControlWorkbook,
  validateJurisdictionNetControlFormulaXml,
} from './monthly-close-jurisdiction-xlsx-adapter.js';

const MAX_ZIP_ENTRIES = 128;
const MAX_UNCOMPRESSED_BYTES = 8 * 1024 * 1024;
const MAX_WORKSHEET_XML_BYTES = 256 * 1024;
const MAX_SHARED_STRINGS_XML_BYTES = 128 * 1024;
const FORBIDDEN_OOXML_ENTRY = /^(?:customXml\/|xl\/(?:activeX|comments|ctrlProps|drawings|embeddings|externalLinks|media|persons|threadedComments)\/)|(?:^|\/)vbaProject\.bin$/i;

async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

async function loadWorkbookReader() {
  if (typeof globalThis.readXlsxFile !== 'function') {
    try {
      await import('./vendor/read-excel-file.min.js');
    } catch {
      throw new JurisdictionNetControlError(
        'JURISDICTION_CONTROL_READER_UNAVAILABLE',
        'El lector local de Excel no está disponible',
      );
    }
  }
  if (typeof globalThis.readXlsxFile !== 'function') {
    throw new JurisdictionNetControlError(
      'JURISDICTION_CONTROL_READER_UNAVAILABLE',
      'El lector local de Excel no está disponible',
    );
  }
  return globalThis.readXlsxFile;
}

async function loadZipReader() {
  if (typeof globalThis.fflate?.unzipSync !== 'function') {
    try {
      await import('./vendor/fflate.min.js');
    } catch {
      throw new JurisdictionNetControlError(
        'JURISDICTION_CONTROL_ZIP_READER_UNAVAILABLE',
        'No se pudo verificar la estructura interna del Excel',
      );
    }
  }
  if (typeof globalThis.fflate?.unzipSync !== 'function') {
    throw new JurisdictionNetControlError(
      'JURISDICTION_CONTROL_ZIP_READER_UNAVAILABLE',
      'No se pudo verificar la estructura interna del Excel',
    );
  }
  return globalThis.fflate.unzipSync;
}

function workbookControlXml(bytes, unzipSync) {
  let entryCount = 0;
  let uncompressedBytes = 0;
  const extracted = unzipSync(bytes, {
    filter(entry) {
      entryCount += 1;
      if (entryCount > MAX_ZIP_ENTRIES || !Number.isSafeInteger(entry.originalSize)
          || entry.originalSize < 0) {
        throw new JurisdictionNetControlError(
          'JURISDICTION_CONTROL_ARCHIVE_INVALID',
          'El Excel contiene una estructura interna no admitida',
        );
      }
      uncompressedBytes += entry.originalSize;
      if (uncompressedBytes > MAX_UNCOMPRESSED_BYTES
          || entry.name.includes('\\') || entry.name.startsWith('/')
          || entry.name.split('/').includes('..') || FORBIDDEN_OOXML_ENTRY.test(entry.name)) {
        throw new JurisdictionNetControlError(
          'JURISDICTION_CONTROL_ARCHIVE_INVALID',
          'El Excel contiene objetos, vínculos o contenido adicional no admitido',
        );
      }
      const isWorksheet = /^xl\/worksheets\/[^/]+\.xml$/i.test(entry.name);
      const isSharedStrings = entry.name === 'xl/sharedStrings.xml';
      if (isWorksheet && entry.originalSize > MAX_WORKSHEET_XML_BYTES) {
        throw new JurisdictionNetControlError(
          'JURISDICTION_CONTROL_ARCHIVE_INVALID',
          'La hoja CONTROL supera el tamaño interno admitido',
        );
      }
      if (isSharedStrings && entry.originalSize > MAX_SHARED_STRINGS_XML_BYTES) {
        throw new JurisdictionNetControlError(
          'JURISDICTION_CONTROL_ARCHIVE_INVALID',
          'La tabla interna de rótulos supera el tamaño admitido',
        );
      }
      return isWorksheet || isSharedStrings;
    },
  });
  const worksheetNames = Object.keys(extracted).filter((name) => (
    /^xl\/worksheets\/[^/]+\.xml$/i.test(name)
  ));
  const sharedStringsBytes = extracted['xl/sharedStrings.xml'];
  if (worksheetNames.length !== 1 || !sharedStringsBytes) {
    throw new JurisdictionNetControlError(
      'JURISDICTION_CONTROL_WORKBOOK_INVALID',
      'El archivo debe contener únicamente la hoja agregada CONTROL',
    );
  }
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    return Object.freeze({
      worksheetXml: decoder.decode(extracted[worksheetNames[0]]),
      sharedStringsXml: decoder.decode(sharedStringsBytes),
    });
  } catch {
    throw new JurisdictionNetControlError(
      'JURISDICTION_CONTROL_FORMULA_XML_INVALID',
      'No se pudo leer la estructura de fórmulas de la hoja CONTROL',
    );
  }
}

self.addEventListener('message', async (event) => {
  if (event.data?.type !== 'prepare' || !(event.data.arrayBuffer instanceof ArrayBuffer)
      || typeof event.data.period !== 'string') {
    self.postMessage({
      ok: false,
      code: 'JURISDICTION_CONTROL_WORKER_INPUT_INVALID',
      message: 'El procesador recibió un contexto incompleto',
    });
    return;
  }
  const bytes = new Uint8Array(event.data.arrayBuffer);
  if (bytes.byteLength <= 0 || bytes.byteLength > JURISDICTION_NET_CONTROL_MAX_BYTES) {
    self.postMessage({
      ok: false,
      code: 'JURISDICTION_CONTROL_SIZE_INVALID',
      message: 'El Excel está vacío o supera el máximo local de 512 KiB',
    });
    return;
  }
  try {
    const [contentSha256, reader, unzipSync] = await Promise.all([
      sha256(bytes), loadWorkbookReader(), loadZipReader(),
    ]);
    const { worksheetXml, sharedStringsXml } = workbookControlXml(bytes, unzipSync);
    validateJurisdictionNetControlFormulaXml(worksheetXml, sharedStringsXml);
    const sheets = await reader(event.data.arrayBuffer, {
      parseNumber: (rawValue) => rawValue,
    });
    const control = prepareJurisdictionNetControlWorkbook({
      period: event.data.period,
      byteLength: bytes.byteLength,
      sha256: contentSha256,
      sheets,
      formulaContractVerified: true,
    });
    self.postMessage({ ok: true, control });
  } catch (error) {
    self.postMessage({
      ok: false,
      code: error instanceof JurisdictionNetControlError
        ? error.code : 'JURISDICTION_CONTROL_XLSX_INVALID',
      message: error instanceof JurisdictionNetControlError
        ? error.message : 'El archivo no coincide con el Excel agregado esperado',
    });
  } finally {
    bytes.fill(0);
  }
}, { once: true });
