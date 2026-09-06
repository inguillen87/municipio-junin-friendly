export const PAYROLL_BANK_NOMINAL_EXPORT_VERSION = 'payroll-bank-nominal-export.v1';

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_XLSX_CENTS = 999999999999999n;
const MAX_ROWS = 60_000;
const EXPECTED_SHEETS = Object.freeze({
  'credicoop-42': '42',
  'credicoop-55': '55',
  'santander-42': '42',
  'santander-55': '55',
  'transferencias-funcionarios': null,
  'transferencias-varias': null,
  'nacion-42': '42',
  'nacion-55': '55',
});
const INPUT_KEYS = ['period', 'source', 'total', 'sheets'];
const SOURCE_KEYS = ['fileName', 'sha256'];
const TOTAL_KEYS = ['operations', 'netCents'];
const SHEET_KEYS = ['sheetKey', 'title', 'rows', 'operations', 'netCents'];
const ROW_KEYS = [
  'cuil', 'name', 'netCents', 'repartitionCode', 'repartitionLabel',
  'jurisdiction', 'account', 'cbu',
];

export class PayrollBankNominalExportError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PayrollBankNominalExportError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new PayrollBankNominalExportError(`BANK_NOMINAL_EXPORT_${code}`, message);
}

function exactObject(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
      || Object.keys(value).length !== keys.length
      || keys.some((key) => !Object.hasOwn(value, key))) {
    fail('SOURCE_INVALID', `${label} no cumple el formato esperado.`);
  }
}

function checkedText(value, label, maxLength = 160) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength
      || [...value].some((character) => {
        const point = character.codePointAt(0);
        return point < 32 || (point >= 0xd800 && point <= 0xdfff)
          || point === 0xfffe || point === 0xffff;
      })) {
    fail('SOURCE_INVALID', `${label} no contiene un texto válido.`);
  }
  return value;
}

function checkedCents(value, label) {
  if (typeof value !== 'string' || value.length > 15 || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    // The length bound also avoids constructing unbounded BigInts from input.
    if (typeof value === 'string' && value.length <= 32 && /^[0-9]{16,}$/.test(value)) {
      fail('PRECISION_UNSAFE', `${label} excede la precisión admitida para Excel.`);
    }
    fail('SOURCE_INVALID', `${label} debe expresarse en centavos enteros exactos.`);
  }
  const amount = BigInt(value);
  if (amount > MAX_XLSX_CENTS) fail('PRECISION_UNSAFE', `${label} excede la precisión de Excel.`);
  return amount;
}

function checkedCount(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > MAX_ROWS) {
    fail('SOURCE_INVALID', `${label} no contiene una cantidad válida.`);
  }
  return value;
}

function checkedAdd(left, right) {
  const value = left + right;
  if (value > MAX_XLSX_CENTS) fail('PRECISION_UNSAFE', 'La suma excede la precisión admitida para Excel.');
  return value;
}

function validateInput(input) {
  exactObject(input, INPUT_KEYS, 'La planilla');
  if (typeof input.period !== 'string' || !/^(?:19|20)[0-9]{2}-(?:0[1-9]|1[0-2])$/.test(input.period)) {
    fail('CONTEXT_INVALID', 'Elegí un período válido antes de descargar la planilla.');
  }
  exactObject(input.source, SOURCE_KEYS, 'La fuente');
  checkedText(input.source.fileName, 'El nombre del archivo fuente', 255);
  if (/[\\/]/.test(input.source.fileName)
      || typeof input.source.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.source.sha256)) {
    fail('CONTEXT_INVALID', 'La fuente debe identificar el archivo y su huella SHA-256.');
  }
  exactObject(input.total, TOTAL_KEYS, 'El total general');
  const expectedOperations = checkedCount(input.total.operations, 'El total de operaciones');
  const expectedNet = checkedCents(input.total.netCents, 'El total general');
  if (!Array.isArray(input.sheets) || input.sheets.length !== 8) {
    fail('CONTEXT_INVALID', 'La planilla debe incluir las ocho hojas completas.');
  }

  const keys = new Set();
  const titles = new Set();
  let totalOperations = 0;
  let totalNet = 0n;
  const sheets = input.sheets.map((sheet) => {
    exactObject(sheet, SHEET_KEYS, 'Una hoja');
    if (!Object.hasOwn(EXPECTED_SHEETS, sheet.sheetKey) || keys.has(sheet.sheetKey)) {
      fail('CONTEXT_INVALID', 'Las ocho hojas deben corresponder a bancos y transferencias, sin duplicados.');
    }
    keys.add(sheet.sheetKey);
    const title = checkedText(sheet.title, 'El nombre de la hoja', 31);
    if (/[\[\]:*?\\/]/.test(title) || /^'|'$/.test(title) || titles.has(title.toLowerCase())) {
      fail('CONTEXT_INVALID', 'Los nombres de hoja deben ser únicos y compatibles con Excel.');
    }
    titles.add(title.toLowerCase());
    const operations = checkedCount(sheet.operations, `Las operaciones de ${title}`);
    const expectedSheetNet = checkedCents(sheet.netCents, `El total de ${title}`);
    if (!Array.isArray(sheet.rows) || sheet.rows.length !== operations
        || sheet.rows.length + totalOperations > MAX_ROWS) {
      fail('TOTAL_MISMATCH', `La cantidad de filas de ${title} no coincide con sus operaciones.`);
    }
    let sheetNet = 0n;
    const groups = new Map();
    let hasAccount = false;
    let hasCbu = false;
    for (const row of sheet.rows) {
      exactObject(row, ROW_KEYS, 'Una persona');
      if (typeof row.cuil !== 'string' || !/^[0-9]{11}$/.test(row.cuil)
          || !['42', '55'].includes(row.jurisdiction)
          || (EXPECTED_SHEETS[sheet.sheetKey] !== null
            && EXPECTED_SHEETS[sheet.sheetKey] !== row.jurisdiction)) {
        fail('SOURCE_INVALID', `Revisá el CUIL y la jurisdicción de las filas de ${title}.`);
      }
      checkedText(row.name, 'El apellido y nombre', 240);
      checkedText(row.repartitionCode, 'El código de repartición', 20);
      checkedText(row.repartitionLabel, 'La repartición', 240);
      if (row.account !== null) checkedText(row.account, 'La cuenta', 100);
      if (row.cbu !== null) checkedText(row.cbu, 'El CBU', 100);
      hasAccount ||= row.account !== null;
      hasCbu ||= row.cbu !== null;
      const cents = checkedCents(row.netCents, 'El neto a pagar');
      sheetNet = checkedAdd(sheetNet, cents);
      const groupKey = JSON.stringify([row.repartitionCode, row.jurisdiction]);
      if (!groups.has(groupKey)) groups.set(groupKey, { rows: [], cents: 0n });
      const group = groups.get(groupKey);
      group.rows.push({ ...row, cents });
      group.cents = checkedAdd(group.cents, cents);
    }
    if (sheetNet !== expectedSheetNet) fail('TOTAL_MISMATCH', `El total de ${title} no coincide con sus personas.`);
    totalOperations += operations;
    totalNet = checkedAdd(totalNet, sheetNet);
    return { title, groups: [...groups.values()], operations, cents: sheetNet, hasAccount, hasCbu };
  });
  if (totalOperations !== expectedOperations || totalNet !== expectedNet) {
    fail('TOTAL_MISMATCH', 'La suma de las ocho hojas no coincide con el total general.');
  }
  return { period: input.period, source: { ...input.source }, sheets, operations: totalOperations, cents: totalNet };
}

function xml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function inlineCell(ref, value, style = 0) {
  // Excel escape tokens in source text must remain literal as well as leading '='.
  const literal = String(value).replace(/_x[0-9a-f]{4}_/gi, (token) => `_x005F_${token.slice(1)}`);
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(literal)}</t></is></c>`;
}

function numericCell(ref, value, style = 4) {
  return `<c r="${ref}" s="${style}" t="n"><v>${value}</v></c>`;
}

function formulaCell(ref, formula, cachedValue, style) {
  return `<c r="${ref}" s="${style}"><f>${xml(formula)}</f><v>${cachedValue}</v></c>`;
}

function decimal(cents) {
  const digits = String(cents).padStart(3, '0');
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

const XML_START = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const SPREADSHEET_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

function repartitionText(person) {
  const { repartitionCode: code, repartitionLabel: label } = person;
  const includesCode = label.startsWith(code)
    && /^(?:[\s.:;|/\\_\-–—·]|$)/u.test(label.slice(code.length));
  const numericPrefix = /^(\d+)(?=[\s.:;|/\\_\-–—·]|$)/u.exec(label)?.[1];
  const sameNumericCode = /^\d+$/.test(code) && numericPrefix
    && BigInt(code) === BigInt(numericPrefix);
  return includesCode || sameNumericCode ? label : `${code} · ${label}`;
}

function worksheet(sheet, context) {
  const headings = ['Nº', 'CUIL', 'Apellido y nombre', 'Neto a pagar', 'Repartición', 'Jurisdicción'];
  const widths = [7, 17, 37, 20, 36, 15];
  if (sheet.hasAccount) { headings.push('Cuenta'); widths.push(24); }
  if (sheet.hasCbu) { headings.push('CBU'); widths.push(28); }
  const lastColumn = String.fromCharCode(64 + headings.length);
  const rows = [
    `<row r="1" ht="30" customHeight="1">${inlineCell('A1', `Planilla bancaria · ${sheet.title}`, 1)}</row>`,
    `<row r="2" ht="22" customHeight="1">${inlineCell('A2', `Período ${context.period} · ${sheet.operations} operaciones`, 2)}</row>`,
    `<row r="4" ht="28" customHeight="1">${headings.map((heading, index) => inlineCell(`${String.fromCharCode(65 + index)}4`, heading, 3)).join('')}</row>`,
  ];
  let rowNumber = 5;
  let number = 0;
  for (const group of sheet.groups) {
    const first = rowNumber;
    for (const person of group.rows) {
      number += 1;
      const values = [
        numericCell(`A${rowNumber}`, number, 9),
        inlineCell(`B${rowNumber}`, person.cuil),
        inlineCell(`C${rowNumber}`, person.name, 10),
        numericCell(`D${rowNumber}`, decimal(person.cents)),
        inlineCell(`E${rowNumber}`, repartitionText(person), 10),
        inlineCell(`F${rowNumber}`, person.jurisdiction),
      ];
      let optionalColumn = 71;
      if (sheet.hasAccount) values.push(inlineCell(`${String.fromCharCode(optionalColumn++)}${rowNumber}`, person.account ?? ''));
      if (sheet.hasCbu) values.push(inlineCell(`${String.fromCharCode(optionalColumn)}${rowNumber}`, person.cbu ?? ''));
      rows.push(`<row r="${rowNumber}" ht="32" customHeight="1">${values.join('')}</row>`);
      rowNumber += 1;
    }
    const person = group.rows[0];
    const values = headings.map((_, index) => {
      const ref = `${String.fromCharCode(65 + index)}${rowNumber}`;
      if (index === 1) return inlineCell(ref, 'Subtotal', 5);
      if (index === 2) return inlineCell(ref, `Rep. ${person.repartitionCode} · ${group.rows.length} operaciones`, 5);
      if (index === 3) return formulaCell(ref, `SUM(D${first}:D${rowNumber - 1})`, decimal(group.cents), 6);
      if (index === 5) return inlineCell(ref, person.jurisdiction, 5);
      return inlineCell(ref, '', 5);
    });
    rows.push(`<row r="${rowNumber}" ht="25" customHeight="1">${values.join('')}</row>`);
    rowNumber += 1;
  }
  const lastSubtotal = rowNumber - 1;
  const totalRow = rowNumber;
  // Only the explicit subtotal markers contribute: no double count, including after grouping.
  // SUMIF also avoids Excel's 255-argument limit for sheets with many repartitions.
  const totalFormula = sheet.groups.length ? `SUMIF(B5:B${lastSubtotal},"Subtotal",D5:D${lastSubtotal})` : 'SUM(0)';
  rows.push(`<row r="${totalRow}" ht="30" customHeight="1">${headings.map((_, index) => {
    const ref = `${String.fromCharCode(65 + index)}${totalRow}`;
    if (index === 2) return inlineCell(ref, `Total · ${sheet.operations} operaciones`, 7);
    if (index === 3) return formulaCell(ref, totalFormula, decimal(sheet.cents), 8);
    return inlineCell(ref, '', 7);
  }).join('')}</row>`);
  const fileRow = totalRow + 2;
  const hashRow = totalRow + 3;
  const noteRow = totalRow + 4;
  rows.push(`<row r="${fileRow}" ht="24" customHeight="1">${inlineCell(`A${fileRow}`, `Fuente: ${context.source.fileName}`, 2)}</row>`);
  rows.push(`<row r="${hashRow}" ht="24" customHeight="1">${inlineCell(`A${hashRow}`, `SHA-256: ${context.source.sha256}`, 2)}</row>`);
  rows.push(`<row r="${noteRow}" ht="24" customHeight="1">${inlineCell(`A${noteRow}`, 'Planilla nominal de control. No genera instrucciones bancarias ni acredita haberes.', 2)}</row>`);
  const mergeRows = [1, 2, fileRow, hashRow, noteRow];
  return {
    lastRow: noteRow,
    lastColumn,
    xml: `${XML_START}<worksheet xmlns="${SPREADSHEET_NS}">`
      + '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>'
      + `<dimension ref="A1:${lastColumn}${noteRow}"/>`
      + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A5" sqref="A5"/></sheetView></sheetViews>'
      + '<sheetFormatPr defaultRowHeight="18"/>'
      + `<cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join('')}</cols>`
      + `<sheetData>${rows.join('')}</sheetData>`
      + `<autoFilter ref="A4:${lastColumn}${Math.max(4, lastSubtotal)}"/>`
      + `<mergeCells count="${mergeRows.length}">${mergeRows.map((row) => `<mergeCell ref="A${row}:${lastColumn}${row}"/>`).join('')}</mergeCells>`
      + '<printOptions horizontalCentered="1"/>'
      + '<pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.15" footer="0.15"/>'
      + '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>'
      + '<headerFooter><oddFooter>&amp;LMuniControl&amp;R Página &amp;P de &amp;N</oddFooter></headerFooter>'
      + '</worksheet>',
  };
}

function stylesXml() {
  const xf = (font, fill, number = 0, alignment = '') => `<xf numFmtId="${number}" fontId="${font}" fillId="${fill}" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center" ${alignment}/></xf>`;
  return `${XML_START}<styleSheet xmlns="${SPREADSHEET_NS}">`
    + '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>'
    + '<fonts count="5"><font><sz val="11"/><color rgb="FF172C38"/><name val="Arial"/></font>'
    + '<font><b/><sz val="17"/><color rgb="FF102C3C"/><name val="Arial"/></font>'
    + '<font><sz val="9"/><color rgb="FF526672"/><name val="Arial"/></font>'
    + '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>'
    + '<font><b/><sz val="11"/><color rgb="FF102C3C"/><name val="Arial"/></font></fonts>'
    + '<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FF102C3C"/><bgColor indexed="64"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFF0F5F6"/><bgColor indexed="64"/></patternFill></fill>'
    + '<fill><patternFill patternType="solid"><fgColor rgb="FFDFECEB"/><bgColor indexed="64"/></patternFill></fill></fills>'
    + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + `<cellXfs count="11">${[
      xf(0, 0, 49), xf(1, 0), xf(2, 0, 0, 'wrapText="1"'), xf(3, 2, 0, 'wrapText="1"'),
      xf(0, 0, 164, 'horizontal="right"'), xf(4, 3, 49), xf(4, 3, 164, 'horizontal="right"'),
      xf(4, 4, 49), xf(4, 4, 164, 'horizontal="right"'), xf(0, 0, 0, 'horizontal="center"'),
      xf(0, 0, 49, 'wrapText="1"'),
    ].join('')}</cellXfs>`
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
}

function workbookEntries(context) {
  const worksheets = context.sheets.map((sheet) => worksheet(sheet, context));
  const relNs = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const officeNs = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const quoted = (title) => xml(`'${title.replaceAll("'", "''")}'`);
  return [
    ['[Content_Types].xml', `${XML_START}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${worksheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `${XML_START}<Relationships xmlns="${relNs}"><Relationship Id="rId1" Type="${officeNs}/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${officeNs}/extended-properties" Target="docProps/app.xml"/></Relationships>`],
    ['docProps/core.xml', `${XML_START}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Planilla bancaria ${context.period}</dc:title><dc:creator>MuniControl</dc:creator><dc:description>Listado nominal de control de la fuente. No genera acreditación bancaria.</dc:description></cp:coreProperties>`],
    ['docProps/app.xml', `${XML_START}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>MuniControl</Application><TitlesOfParts><vt:vector size="8" baseType="lpstr">${context.sheets.map((sheet) => `<vt:lpstr>${xml(sheet.title)}</vt:lpstr>`).join('')}</vt:vector></TitlesOfParts></Properties>`],
    ['xl/workbook.xml', `${XML_START}<workbook xmlns="${SPREADSHEET_NS}" xmlns:r="${officeNs}"><sheets>${context.sheets.map((sheet, index) => `<sheet name="${xml(sheet.title)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets><definedNames>${context.sheets.map((sheet, index) => `<definedName name="_xlnm.Print_Titles" localSheetId="${index}">${quoted(sheet.title)}!$1:$4</definedName><definedName name="_xlnm.Print_Area" localSheetId="${index}">${quoted(sheet.title)}!$A$1:$${worksheets[index].lastColumn}$${worksheets[index].lastRow}</definedName>`).join('')}</definedNames><calcPr calcMode="auto" fullCalcOnLoad="1" forceFullCalcOnLoad="1"/></workbook>`],
    ['xl/_rels/workbook.xml.rels', `${XML_START}<Relationships xmlns="${relNs}">${worksheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="${officeNs}/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId9" Type="${officeNs}/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', stylesXml()],
    ...worksheets.map((sheet, index) => [`xl/worksheets/sheet${index + 1}.xml`, sheet.xml]),
  ];
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function joinBytes(parts) {
  const bytes = new Uint8Array(parts.reduce((length, part) => length + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  return bytes;
}

function storedZip(entries) {
  const encoder = new TextEncoder();
  const local = [];
  const central = [];
  let offset = 0;
  const set16 = (view, position, value) => view.setUint16(position, value, true);
  const set32 = (view, position, value) => view.setUint32(position, value >>> 0, true);
  for (const [name, contents] of entries) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(contents);
    const checksum = crc32(data);
    const header = new Uint8Array(30);
    const view = new DataView(header.buffer);
    set32(view, 0, 0x04034b50); set16(view, 4, 20); set16(view, 6, 0x0800);
    set16(view, 12, 0x0021); set32(view, 14, checksum);
    set32(view, 18, data.byteLength); set32(view, 22, data.byteLength); set16(view, 26, nameBytes.byteLength);
    local.push(header, nameBytes, data);
    const directory = new Uint8Array(46);
    const directoryView = new DataView(directory.buffer);
    set32(directoryView, 0, 0x02014b50); set16(directoryView, 4, 20); set16(directoryView, 6, 20);
    set16(directoryView, 8, 0x0800); set16(directoryView, 14, 0x0021); set32(directoryView, 16, checksum);
    set32(directoryView, 20, data.byteLength); set32(directoryView, 24, data.byteLength);
    set16(directoryView, 28, nameBytes.byteLength); set32(directoryView, 42, offset);
    central.push(directory, nameBytes);
    offset += header.byteLength + nameBytes.byteLength + data.byteLength;
  }
  const directoryBytes = joinBytes(central);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  set32(endView, 0, 0x06054b50); set16(endView, 8, entries.length); set16(endView, 10, entries.length);
  set32(endView, 12, directoryBytes.byteLength); set32(endView, 16, offset);
  return joinBytes([...local, directoryBytes, end]);
}

export function createPayrollBankNominalXlsxArtifact(input) {
  const context = validateInput(input);
  const bytes = storedZip(workbookEntries(context));
  return Object.freeze({
    fileName: `municontrol_planilla-bancaria_${context.period}.xlsx`,
    mimeType: MIME_XLSX,
    bytes,
    byteLength: bytes.byteLength,
    containsPersonalRecords: true,
    bankInstructionGenerated: false,
    bankAccreditationPerformed: false,
    sheetNames: Object.freeze(context.sheets.map((sheet) => sheet.title)),
    operations: context.operations,
    netCents: String(context.cents),
  });
}
