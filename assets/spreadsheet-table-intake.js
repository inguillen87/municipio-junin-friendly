import { storedZip } from './clock-dashboard-zip.js';

export const SPREADSHEET_MAX_ROWS = 5000;
const EXCEL_BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

function decodeXmlEntities(text) {
  return String(text ?? '').replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi, (full, entity) => {
    const low = entity.toLowerCase();
    if (low === 'amp') return '&';
    if (low === 'lt') return '<';
    if (low === 'gt') return '>';
    if (low === 'quot') return '"';
    if (low === 'apos') return "'";
    if (low.startsWith('#x')) {
      const code = Number.parseInt(low.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    if (low.startsWith('#')) {
      const code = Number.parseInt(low.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    return full;
  });
}

function xmlAttributes(tagText) {
  const attrs = Object.create(null);
  for (const match of String(tagText || '').matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g)) {
    attrs[match[1]] = decodeXmlEntities(match[2]);
  }
  return attrs;
}

function columnLettersToIndex(ref) {
  const match = /^([A-Z]+)[0-9]*$/i.exec(String(ref || '').trim());
  if (!match) return -1;
  let col = 0;
  for (const ch of match[1].toUpperCase()) {
    col = col * 26 + (ch.charCodeAt(0) - 64);
  }
  return col - 1;
}

function columnIndexToLetters(index) {
  let col = index + 1;
  let letters = '';
  while (col > 0) {
    letters = String.fromCharCode(65 + ((col - 1) % 26)) + letters;
    col = Math.floor((col - 1) / 26);
  }
  return letters;
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function isCustomDateFormat(code) {
  if (!code) return false;
  const cleaned = String(code)
    .replace(/"[^"]*"/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\\./g, '')
    .toLowerCase();
  if (/^[\shms.:\/+-]+$/.test(cleaned)) return false;
  return /\b(?:yy|yyyy|dd|d)\b/.test(cleaned) || (cleaned.includes('y') && (cleaned.includes('d') || cleaned.includes('m')));
}

function excelSerialToIsoDate(serialText, date1904) {
  const num = Number(serialText);
  if (!Number.isFinite(num) || num < 0 || num > 2958465) return null;
  const whole = Math.floor(num);
  let utcMs;
  if (date1904) {
    utcMs = Date.UTC(1904, 0, 1) + whole * 86400000;
  } else {
    const adjusted = whole >= 60 ? whole : whole + 1;
    utcMs = Date.UTC(1899, 11, 30) + adjusted * 86400000;
  }
  const d = new Date(utcMs);
  if (!Number.isFinite(d.getTime())) return null;
  const y = d.getUTCFullYear();
  if (y < 1900 || y > 2100) return null;
  return d.toISOString().slice(0, 10);
}

function decodeUtf8OrLatin1(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (view.length >= 2 && ((view[0] === 0xff && view[1] === 0xfe) || (view[0] === 0xfe && view[1] === 0xff))) {
    try {
      return new TextDecoder(view[0] === 0xff ? 'utf-16le' : 'utf-16be').decode(view).replace(/^\ufeff/, '');
    } catch { /* fallback abajo */ }
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(view).replace(/^\ufeff/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(view).replace(/^\ufeff/, '');
  }
}

function hasMagic(bytes, signature) {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, idx) => bytes[idx] === byte);
}

async function resolveUnzip(unzipImpl) {
  if (typeof unzipImpl === 'function') return unzipImpl;
  if (typeof globalThis.fflate?.unzipSync === 'function') return globalThis.fflate.unzipSync;
  for (const path of ['./vendor/fflate.min.js', './vendor/fflate-0.8.3.min.js']) {
    try { await import(path); } catch { /* probar siguiente ruta vendored */ }
    if (typeof globalThis.fflate?.unzipSync === 'function') return globalThis.fflate.unzipSync;
  }
  const spec = 'fflate';
  try {
    const mod = await import(spec);
    if (typeof mod?.unzipSync === 'function') return mod.unzipSync;
  } catch { /* fuera de Node */ }
  return null;
}

async function resolveReadXlsxFile(readXlsxFileImpl) {
  if (typeof readXlsxFileImpl === 'function') return readXlsxFileImpl;
  if (typeof globalThis.readXlsxFile === 'function') return globalThis.readXlsxFile;
  try {
    await import('./vendor/read-excel-file.min.js');
    if (typeof globalThis.readXlsxFile === 'function') return globalThis.readXlsxFile;
  } catch { /* fallback con fflate */ }
  return null;
}

function parseSharedStrings(xmlText) {
  if (!xmlText) return [];
  const items = [];
  for (const siMatch of xmlText.matchAll(/<(?:\w+:)?si(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?si>/gi)) {
    const parts = [];
    for (const tMatch of siMatch[1].matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/gi)) {
      parts.push(decodeXmlEntities(tMatch[1]));
    }
    items.push(parts.join(''));
  }
  return items;
}

function parseDateStyleSet(stylesXml) {
  const dateStyleIndexes = new Set();
  if (!stylesXml) return dateStyleIndexes;
  const customFormats = new Map();
  const numFmtsMatch = /<(?:\w+:)?numFmts(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?numFmts>/i.exec(stylesXml);
  if (numFmtsMatch) {
    for (const nfMatch of numFmtsMatch[1].matchAll(/<(?:\w+:)?numFmt\s+([^>]*?)\/>/gi)) {
      const attrs = xmlAttributes(nfMatch[1]);
      if (attrs.numFmtId !== undefined && attrs.formatCode !== undefined) {
        customFormats.set(Number(attrs.numFmtId), attrs.formatCode);
      }
    }
  }
  const cellXfsMatch = /<(?:\w+:)?cellXfs(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?cellXfs>/i.exec(stylesXml);
  if (cellXfsMatch) {
    let idx = 0;
    for (const xfMatch of cellXfsMatch[1].matchAll(/<(?:\w+:)?xf\b([^>]*?)(?:\/>|>[\s\S]*?<\/(?:\w+:)?xf>)/gi)) {
      const attrs = xmlAttributes(xfMatch[1]);
      const fmtId = Number(attrs.numFmtId);
      if (EXCEL_BUILTIN_DATE_FORMATS.has(fmtId) || isCustomDateFormat(customFormats.get(fmtId))) {
        dateStyleIndexes.add(idx);
      }
      idx++;
    }
  }
  return dateStyleIndexes;
}

function findEntryCaseInsensitive(archive, targetPath) {
  if (archive[targetPath]) return archive[targetPath];
  const lower = targetPath.toLowerCase();
  const key = Object.keys(archive).find((k) => k.toLowerCase() === lower);
  return key ? archive[key] : null;
}

function resolveFirstWorksheetPath(workbookXml, relsXml) {
  const firstSheetMatch = /<(?:\w+:)?sheet\b([^>]*?)\/?>(?:<\/(?:\w+:)?sheet>)?/i.exec(workbookXml || '');
  const attrs = firstSheetMatch ? xmlAttributes(firstSheetMatch[1]) : {};
  const sheetName = attrs.name || 'Hoja 1';
  const relId = attrs['r:id'] || attrs.id || '';
  let target = 'xl/worksheets/sheet1.xml';
  if (relsXml && relId) {
    for (const relMatch of relsXml.matchAll(/<(?:\w+:)?Relationship\b([^>]*?)\/?>/gi)) {
      const relAttrs = xmlAttributes(relMatch[1]);
      if (relAttrs.Id === relId && relAttrs.Target) {
        const clean = relAttrs.Target.replace(/^\/+/, '');
        target = clean.startsWith('xl/') ? clean : 'xl/' + clean.replace(/^\.\//, '');
        break;
      }
    }
  }
  return { sheetName, target };
}

function parseWorksheetXml(sheetXml, { sharedStrings, dateStyles, date1904, maxRows }) {
  const rows = [];
  const lineNumbers = [];
  let maxCols = 0;

  for (const rowMatch of sheetXml.matchAll(/<(?:\w+:)?row\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?row>/gi)) {
    const rowAttrs = xmlAttributes(rowMatch[1]);
    const rowNumber = rowAttrs.r ? Number(rowAttrs.r) : rows.length + 1;
    const cells = [];
    let nextCol = 0;

    for (const cellMatch of rowMatch[2].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/gi)) {
      const cellAttrs = xmlAttributes(cellMatch[1]);
      const colIdx = cellAttrs.r ? columnLettersToIndex(cellAttrs.r) : nextCol;
      if (colIdx < 0) continue;
      nextCol = colIdx + 1;

      const body = cellMatch[2] || '';
      const type = cellAttrs.t || '';
      const styleIdx = cellAttrs.s !== undefined ? Number(cellAttrs.s) : -1;
      let text = '';

      if (type === 'inlineStr') {
        const parts = [];
        for (const tMatch of body.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/gi)) {
          parts.push(decodeXmlEntities(tMatch[1]));
        }
        text = parts.join('');
      } else {
        const vMatch = /<(?:\w+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?v>/i.exec(body);
        const rawValue = vMatch ? decodeXmlEntities(vMatch[1]) : '';
        if (type === 's') {
          const idx = Number(rawValue);
          text = Number.isInteger(idx) && sharedStrings[idx] !== undefined ? sharedStrings[idx] : '';
        } else if (type === 'b') {
          text = rawValue === '1' || rawValue.toLowerCase() === 'true' ? 'Sí' : 'No';
        } else if (type === 'e') {
          text = '#ERROR';
        } else if (type === 'str') {
          text = rawValue;
        } else if (rawValue !== '') {
          const iso = dateStyles.has(styleIdx) ? excelSerialToIsoDate(rawValue, date1904) : null;
          text = iso || rawValue;
        }
      }

      while (cells.length <= colIdx) cells.push('');
      cells[colIdx] = String(text ?? '').trim();
    }

    while (cells.length && cells[cells.length - 1] === '') cells.pop();
    if (!cells.some((c) => c !== '')) continue;
    rows.push(cells);
    lineNumbers.push(Number.isFinite(rowNumber) && rowNumber > 0 ? rowNumber : rows.length);
    if (cells.length > maxCols) maxCols = cells.length;
    if (rows.length > maxRows + 1) {
      throw Error(`La planilla supera el máximo admitido (${maxRows} filas). Dividila antes de verificar.`);
    }
  }

  const normalized = rows.map((cells) => {
    const padded = [...cells];
    while (padded.length < maxCols) padded.push('');
    return padded;
  });
  return { rows: normalized, lineNumbers };
}

function normalizeCellObject(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return '';
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  return String(value).trim();
}

export function splitDelimitedCells(line, delimiter) {
  const result = [];
  let value = '';
  let quoted = false;
  let closed = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        value += ch;
      }
    } else if (ch === delimiter) {
      result.push(value.trim());
      value = '';
      closed = false;
    } else if (ch === '"' && !value.trim() && !closed) {
      value = '';
      quoted = true;
    } else if (ch === '"' || (closed && ch.trim())) {
      throw Error('Revisá las comillas y los separadores de la planilla.');
    } else {
      value += ch;
    }
  }
  if (quoted) throw Error('Cerrá las comillas en la misma fila.');
  result.push(value.trim());
  return result;
}

export function detectDelimiter(sampleLine, { minColumns = 2 } = {}) {
  let quoted = false;
  const seen = new Set();
  for (let i = 0; i < sampleLine.length; i++) {
    if (sampleLine[i] === '"') {
      if (quoted && sampleLine[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted) {
      seen.add(sampleLine[i]);
    }
  }
  for (const minWidth of [minColumns, 2]) {
    for (const delimiter of ['\t', ';', ',']) {
      if (!seen.has(delimiter)) continue;
      try {
        const width = splitDelimitedCells(sampleLine, delimiter).length;
        if (width >= minWidth) return delimiter;
      } catch { /* probar siguiente separador */ }
    }
  }
  return seen.has('\t') ? '\t' : seen.has(';') ? ';' : ',';
}

export function parseDelimitedText(text, { maxRows = SPREADSHEET_MAX_ROWS, minColumns = 2 } = {}) {
  if (typeof text !== 'string') throw Error('Seleccioná o pegá las filas de la planilla.');
  const lines = text.replace(/^\ufeff/, '').split(/\r\n|\n|\r/)
    .map((line, index) => ({ line, number: index + 1 }))
    .filter((entry) => entry.line.trim());
  if (!lines.length) throw Error('La planilla debe tener al menos una fila.');
  if (lines.length > maxRows + 1) {
    throw Error(`La planilla supera el máximo admitido (${maxRows} filas). Dividila antes de verificar.`);
  }
  const delimiter = detectDelimiter(lines[0].line, { minColumns });
  return {
    format: delimiter === '\t' ? 'txt' : 'csv',
    sheetName: null,
    delimiter,
    lines,
  };
}

export async function readSpreadsheetInput(input, { unzip = null, readXlsxFileImpl = null, maxRows = SPREADSHEET_MAX_ROWS } = {}) {
  if (!input) throw Error('Elegí un archivo Excel (.xlsx), CSV (.csv) o TXT (.txt).');

  let name = '';
  let rawBytes = null;
  let text = typeof input === 'string' ? input : null;

  if (text === null && typeof input === 'object') {
    name = String(input.name || input.file?.name || '').trim();
    if (typeof input.text === 'string') {
      text = input.text;
    } else if (input.bytes !== undefined && typeof input.bytes !== 'function') {
      rawBytes = input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes);
    } else if (typeof input.arrayBuffer === 'function') {
      rawBytes = new Uint8Array(await input.arrayBuffer());
    } else if (input.file && typeof input.file.arrayBuffer === 'function') {
      rawBytes = new Uint8Array(await input.file.arrayBuffer());
    }
  }

  const lowerName = name.toLowerCase();
  if (/\.xlsb?$/.test(lowerName) && !lowerName.endsWith('.xlsx') || /\.ods$/.test(lowerName)) {
    throw Error('El formato anterior (.xls, .xlsb u .ods) no se admite. Guardá el archivo como Excel moderno (.xlsx), CSV o TXT.');
  }
  if (rawBytes && hasMagic(rawBytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    throw Error('El archivo tiene formato binario Excel 97-2003 (.xls). Guardalo como Excel moderno (.xlsx), CSV o TXT.');
  }

  const looksZip = rawBytes && hasMagic(rawBytes, [0x50, 0x4b, 0x03, 0x04]);
  const isXlsx = lowerName.endsWith('.xlsx') || looksZip;

  if (isXlsx) {
    if (!rawBytes) throw Error('No se pudieron leer los bytes del archivo Excel (.xlsx).');
    if (rawBytes.byteLength > 25 * 1024 * 1024) {
      throw Error('El archivo Excel supera los 25 MB permitidos.');
    }
    const unzipFn = await resolveUnzip(unzip);
    if (unzipFn) {
      let archive;
      try {
        archive = unzipFn(rawBytes);
      } catch {
        throw Error('No se pudo abrir el archivo Excel (.xlsx). Verificá que no esté dañado ni protegido con contraseña.');
      }
      const decoder = new TextDecoder('utf-8');
      const workbookBytes = findEntryCaseInsensitive(archive, 'xl/workbook.xml');
      if (!workbookBytes) throw Error('El archivo .xlsx no contiene un libro de cálculo válido.');
      const workbookXml = decoder.decode(workbookBytes);
      const date1904 = /<(?:\w+:)?workbookPr\b[^>]*date1904="(?:1|true)"/i.test(workbookXml);
      const relsBytes = findEntryCaseInsensitive(archive, 'xl/_rels/workbook.xml.rels');
      const relsXml = relsBytes ? decoder.decode(relsBytes) : '';
      const { sheetName, target } = resolveFirstWorksheetPath(workbookXml, relsXml);
      const sheetBytes = findEntryCaseInsensitive(archive, target) || findEntryCaseInsensitive(archive, 'xl/worksheets/sheet1.xml');
      if (!sheetBytes) throw Error('El archivo .xlsx no contiene hojas visibles para importar.');
      const sharedBytes = findEntryCaseInsensitive(archive, 'xl/sharedStrings.xml');
      const stylesBytes = findEntryCaseInsensitive(archive, 'xl/styles.xml');
      const parsed = parseWorksheetXml(decoder.decode(sheetBytes), {
        sharedStrings: sharedBytes ? parseSharedStrings(decoder.decode(sharedBytes)) : [],
        dateStyles: stylesBytes ? parseDateStyleSet(decoder.decode(stylesBytes)) : new Set(),
        date1904,
        maxRows,
      });
      if (!parsed.rows.length) throw Error('La primera hoja del archivo Excel está vacía.');
      return { format: 'xlsx', sheetName, rows: parsed.rows, lineNumbers: parsed.lineNumbers };
    }

    const readXlsx = await resolveReadXlsxFile(readXlsxFileImpl);
    if (readXlsx && typeof Blob !== 'undefined') {
      const sheetRows = await readXlsx(new Blob([rawBytes]));
      const nonEmpty = [];
      const lineNumbers = [];
      let maxCols = 0;
      for (let i = 0; i < sheetRows.length; i++) {
        const normalized = sheetRows[i].map(normalizeCellObject);
        while (normalized.length && normalized[normalized.length - 1] === '') normalized.pop();
        if (!normalized.some((c) => c !== '')) continue;
        nonEmpty.push(normalized);
        lineNumbers.push(i + 1);
        if (normalized.length > maxCols) maxCols = normalized.length;
      }
      if (!nonEmpty.length) throw Error('La primera hoja del archivo Excel está vacía.');
      if (nonEmpty.length > maxRows + 1) {
        throw Error(`La planilla supera el máximo admitido (${maxRows} filas). Dividila antes de verificar.`);
      }
      return {
        format: 'xlsx',
        sheetName: 'Hoja 1',
        rows: nonEmpty.map((r) => [...r, ...Array(Math.max(0, maxCols - r.length)).fill('')]),
        lineNumbers,
      };
    }
    throw Error('No se pudo inicializar el lector Excel (.xlsx) en este navegador.');
  }

  const decodedText = text !== null ? text : decodeUtf8OrLatin1(rawBytes || new Uint8Array());
  const parsedText = parseDelimitedText(decodedText, { maxRows });
  return {
    format: lowerName.endsWith('.txt') ? 'txt' : lowerName.endsWith('.csv') ? 'csv' : parsedText.format,
    sheetName: null,
    delimiter: parsedText.delimiter,
    text: decodedText,
    lines: parsedText.lines,
    rows: parsedText.lines.map((entry) => splitDelimitedCells(entry.line, parsedText.delimiter)),
    lineNumbers: parsedText.lines.map((entry) => entry.number),
  };
}

export function buildXlsxWorkbook(sheets, { zip = storedZip } = {}) {
  if (!Array.isArray(sheets) || !sheets.length) throw Error('Se requiere al menos una hoja para generar Excel.');
  const safeSheets = sheets.map((sheet, index) => {
    const cleanName = String(sheet.name || `Hoja ${index + 1}`)
      .replace(/[\\/?*\[\]:]/g, ' ')
      .trim()
      .slice(0, 31) || `Hoja ${index + 1}`;
    const rows = Array.isArray(sheet.rows) && sheet.rows.length ? sheet.rows : [['']];
    const colCount = Math.max(1, ...rows.map((r) => r.length));
    const widths = Array.isArray(sheet.widths) ? sheet.widths : [];
    const colsXml = `<cols>${Array.from({ length: colCount }, (_, colIdx) => {
      const w = Number(widths[colIdx]) || 22;
      return `<col min="${colIdx + 1}" max="${colIdx + 1}" width="${w}" customWidth="1"/>`;
    }).join('')}</cols>`;
    const dataXml = rows.map((row, rowIdx) => {
      const cellsXml = row.map((val, colIdx) => `<c r="${columnIndexToLetters(colIdx)}${rowIdx + 1}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(val)}</t></is></c>`).join('');
      return `<row r="${rowIdx + 1}">${cellsXml}</row>`;
    }).join('');
    const freezeXml = sheet.freezeHeader !== false ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
    const filterXml = sheet.autoFilter && rows.length > 1 ? `<autoFilter ref="A1:${columnIndexToLetters(colCount - 1)}${rows.length}"/>` : '';
    const xml = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${freezeXml}${colsXml}<sheetData>${dataXml}</sheetData>${filterXml}<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
    return { name: cleanName, xml };
  });

  return zip([
    ['[Content_Types].xml', `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${safeSheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="workbook" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${safeSheets.map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="sheet${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${safeSheets.map((_, i) => `<Relationship Id="sheet${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`],
    ...safeSheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, s.xml]),
  ]);
}
