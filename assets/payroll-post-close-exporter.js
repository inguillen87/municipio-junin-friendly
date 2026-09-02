export const PAYROLL_POST_CLOSE_EXPORT_CONTRACT_VERSION = 'payroll-post-close-export.v1';

const RECONCILIATION_CONTRACT_VERSION = 'payroll-post-close-701-703.v1';
const EXPORTABLE_STATUSES = new Set(['matched', 'difference_acknowledged']);
const PERIOD = /^(?:19|20)[0-9]{2}-(?:0[1-9]|1[0-2])$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const CENTS = /^-?(?:0|[1-9][0-9]*)$/;
const JURISDICTIONS = new Set(['42', '55']);
const MAX_EXCEL_CENTS = 999999999999999n;
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MIME_PDF = 'application/pdf';

export class PayrollPostCloseExportError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PayrollPostCloseExportError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new PayrollPostCloseExportError(code, message);
}

function exactCents(value, label) {
  const text = String(value);
  if (!CENTS.test(text)) fail('EXPORT_CENTS_INVALID', `${label} no contiene centavos exactos`);
  const cents = BigInt(text);
  if (cents > MAX_EXCEL_CENTS || cents < -MAX_EXCEL_CENTS) {
    fail('EXPORT_AMOUNT_TOO_LARGE', `${label} supera la precisión admitida por la planilla`);
  }
  return cents;
}

function exactDate(value) {
  const candidate = value === undefined ? new Date() : new Date(value);
  if (Number.isNaN(candidate.getTime())) {
    fail('EXPORT_DATE_INVALID', 'La fecha de generación no es válida');
  }
  return candidate.toISOString();
}

function statusLabel(status) {
  return status === 'matched'
    ? 'COINCIDENCIA ARITMÉTICA LOCAL - AL CENTAVO'
    : 'DIFERENCIA ABIERTA - OBSERVACIÓN RECIBIDA SÓLO EN ESTA SESIÓN';
}

function comparisonMap(result) {
  if (!Array.isArray(result.comparisons) || result.comparisons.length !== 2) {
    fail('EXPORT_COMPARISONS_INVALID', 'La conciliación debe contener los conceptos 701 y 703');
  }
  const rows = new Map();
  for (const row of result.comparisons) {
    if (!row || typeof row !== 'object' || !['701', '703'].includes(row.concept)
        || rows.has(row.concept)) {
      fail('EXPORT_COMPARISONS_INVALID', 'Los conceptos de la conciliación no son exportables');
    }
    const observed = exactCents(row.observedCents, `Reporte GRH ${row.concept}`);
    const control = exactCents(row.controlCents, `Control ${row.concept}`);
    const difference = exactCents(row.differenceCents, `Diferencia ${row.concept}`);
    if (difference !== observed - control || Boolean(row.matches) !== (difference === 0n)) {
      fail('EXPORT_ARITHMETIC_INVALID', `El concepto ${row.concept} no reconcilia`);
    }
    rows.set(row.concept, Object.freeze({
      concept: row.concept,
      observed,
      control,
      difference,
      matches: difference === 0n,
    }));
  }
  if (!rows.has('701') || !rows.has('703')) {
    fail('EXPORT_COMPARISONS_INVALID', 'Falta un concepto obligatorio');
  }
  return rows;
}

function exportContext(result, options = {}) {
  if (!result || typeof result !== 'object' || Array.isArray(result)
      || result.contractVersion !== RECONCILIATION_CONTRACT_VERSION
      || !PERIOD.test(String(result.period || ''))
      || !JURISDICTIONS.has(String(result.jurisdiction || ''))
      || !EXPORTABLE_STATUSES.has(result.status)
      || result.inputRequirementsSatisfied !== true
      || result.includesPersonalRecords !== false
      || result.persistencePerformed !== false
      || result.networkPerformed !== false) {
    fail('EXPORT_RESULT_NOT_READY', 'Ejecutá una conciliación local válida antes de exportar');
  }
  const rows = comparisonMap(result);
  const observedTotal = [...rows.values()].reduce((sum, row) => sum + row.observed, 0n);
  const controlTotal = [...rows.values()].reduce((sum, row) => sum + row.control, 0n);
  const differenceTotal = observedTotal - controlTotal;
  const allConceptsMatch = [...rows.values()].every((row) => row.matches);
  const total = result.jurisdictionTotal;
  if (!total || exactCents(total.observedCents, 'Total GRH') !== observedTotal
      || exactCents(total.controlCents, 'Total de control') !== controlTotal
      || exactCents(total.differenceCents, 'Diferencia total') !== differenceTotal
      || Boolean(total.matches) !== (differenceTotal === 0n)
      || (result.status === 'matched') !== allConceptsMatch) {
    fail('EXPORT_TOTAL_INVALID', 'El total de la conciliación no es consistente');
  }
  if (!Array.isArray(result.warnings)
      || result.warnings.some((warning) => warning !== 'SOURCE_BYTES_IDENTICAL')) {
    fail('EXPORT_WARNINGS_INVALID', 'La conciliación contiene advertencias no reconocidas');
  }
  if (result.warnings.includes('SOURCE_BYTES_IDENTICAL')) {
    fail('EXPORT_SOURCE_BYTES_IDENTICAL', 'Los dos archivos tienen bytes idénticos; el segundo no aporta contenido diferente');
  }
  const observedSource = result.sources?.observed;
  const controlSource = result.sources?.control;
  if (!observedSource || !controlSource
      || !HASH.test(String(observedSource.sha256 || ''))
      || !HASH.test(String(controlSource.sha256 || ''))
      || !Number.isSafeInteger(observedSource.byteLength) || observedSource.byteLength <= 0
      || !Number.isSafeInteger(controlSource.byteLength) || controlSource.byteLength <= 0) {
    fail('EXPORT_SOURCE_INVALID', 'Las fuentes no tienen huellas locales válidas');
  }
  return Object.freeze({
    contractVersion: PAYROLL_POST_CLOSE_EXPORT_CONTRACT_VERSION,
    period: result.period,
    jurisdiction: result.jurisdiction,
    status: result.status,
    statusLabel: statusLabel(result.status),
    generatedAt: exactDate(options.generatedAt),
    rows: Object.freeze(['701', '703'].map((concept) => rows.get(concept))),
    totals: Object.freeze({ observed: observedTotal, control: controlTotal, difference: differenceTotal }),
    sources: Object.freeze({
      observed: Object.freeze({ sha256: observedSource.sha256, byteLength: observedSource.byteLength }),
      control: Object.freeze({ sha256: controlSource.sha256, byteLength: controlSource.byteLength }),
    }),
  });
}

function xml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function centsDecimal(cents) {
  const negative = cents < 0n;
  const digits = String(negative ? -cents : cents).padStart(3, '0');
  return `${negative ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

function formatArs(cents) {
  const negative = cents < 0n;
  const digits = String(negative ? -cents : cents).padStart(3, '0');
  const integer = digits.slice(0, -2).replace(/\B(?=([0-9]{3})+(?![0-9]))/g, '.');
  return `${negative ? '-' : ''}$ ${integer},${digits.slice(-2)}`;
}

function inlineCell(ref, value, style = 0) {
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

function numberCell(ref, cents, style = 6) {
  return `<c r="${ref}" s="${style}" t="n"><v>${centsDecimal(cents)}</v></c>`;
}

function formulaCell(ref, formula, cachedCents, style = 6) {
  return `<c r="${ref}" s="${style}"><f>${xml(formula)}</f><v>${centsDecimal(cachedCents)}</v></c>`;
}

function worksheetXml(context) {
  const [row701, row703] = context.rows;
  const rowXml = (rowNumber, row) => [
    inlineCell(`A${rowNumber}`, context.jurisdiction, 4),
    inlineCell(`B${rowNumber}`, row.concept, 4),
    numberCell(`C${rowNumber}`, row.observed),
    numberCell(`D${rowNumber}`, row.control),
    formulaCell(`E${rowNumber}`, `C${rowNumber}-D${rowNumber}`, row.difference, row.matches ? 6 : 7),
    inlineCell(`F${rowNumber}`, row.matches ? 'Coincide' : 'Diferencia abierta', row.matches ? 11 : 12),
  ].join('');
  const statusStyle = context.status === 'matched' ? 11 : 12;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:F22"/>
  <sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="7" topLeftCell="A8" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="16"/>
  <cols><col min="1" max="1" width="16" customWidth="1"/><col min="2" max="2" width="18" customWidth="1"/><col min="3" max="5" width="22" customWidth="1"/><col min="6" max="6" width="25" customWidth="1"/></cols>
  <sheetData>
    <row r="1" ht="28" customHeight="1">${inlineCell('A1', 'MuniControl - Control poscierre de aportes', 1)}</row>
    <row r="2" ht="22" customHeight="1">${inlineCell('A2', 'Borrador local de control - No oficial - No constituye cierre ni presentación fiscal', 2)}</row>
    <row r="4">${inlineCell('A4', 'Período', 3)}${inlineCell('B4', context.period, 4)}${inlineCell('D4', 'Jurisdicción', 3)}${inlineCell('E4', context.jurisdiction, 4)}</row>
    <row r="5" ht="24" customHeight="1">${inlineCell('A5', 'Resultado', 3)}${inlineCell('B5', context.statusLabel, statusStyle)}</row>
    <row r="7" ht="24" customHeight="1">${['Jurisdicción', 'Concepto', 'Reporte GRH', 'Control declarado', 'Diferencia', 'Estado'].map((value, index) => inlineCell(`${String.fromCharCode(65 + index)}7`, value, 5)).join('')}</row>
    <row r="8">${rowXml(8, row701)}</row>
    <row r="9">${rowXml(9, row703)}</row>
    <row r="10" ht="22" customHeight="1">${inlineCell('A10', 'Total jurisdicción', 8)}${inlineCell('B10', '701 + 703', 8)}${formulaCell('C10', 'SUM(C8:C9)', context.totals.observed, 9)}${formulaCell('D10', 'SUM(D8:D9)', context.totals.control, 9)}${formulaCell('E10', 'C10-D10', context.totals.difference, context.status === 'matched' ? 9 : 10)}${inlineCell('F10', context.status === 'matched' ? 'Coincidencia exacta' : 'Diferencia abierta', context.status === 'matched' ? 11 : 12)}</row>
    <row r="12">${inlineCell('A12', 'Fuente GRH', 3)}${inlineCell('B12', context.sources.observed.sha256, 13)}${inlineCell('F12', `${context.sources.observed.byteLength} bytes`, 4)}</row>
    <row r="13">${inlineCell('A13', 'Control declarado', 3)}${inlineCell('B13', context.sources.control.sha256, 13)}${inlineCell('F13', `${context.sources.control.byteLength} bytes`, 4)}</row>
    <row r="15" ht="22" customHeight="1">${inlineCell('A15', 'Alcance y limitaciones', 5)}</row>
    <row r="16" ht="26" customHeight="1">${inlineCell('A16', 'La coincidencia es aritmética y local. No aprueba aportes ni cierra la liquidación.', 14)}</row>
    <row r="17" ht="26" customHeight="1">${inlineCell('A17', 'Una diferencia permanece abierta aunque se haya satisfecho el requisito local de observación.', 14)}</row>
    <row r="18" ht="26" customHeight="1">${inlineCell('A18', 'Las huellas identifican los bytes usados en esta ejecución; no son firma ni evidencia durable.', 14)}</row>
    <row r="19" ht="26" customHeight="1">${inlineCell('A19', 'El archivo no contiene filas nominales, observaciones ni nombres de los archivos fuente.', 14)}</row>
    <row r="20" ht="26" customHeight="1">${inlineCell('A20', 'La procedencia e independencia de los archivos no están verificadas por el servidor.', 14)}</row>
    <row r="21">${inlineCell('A21', 'Generado', 3)}${inlineCell('B21', context.generatedAt, 4)}${inlineCell('D21', 'Contrato', 3)}${inlineCell('E21', context.contractVersion, 4)}</row>
    <row r="22">${inlineCell('A22', 'Autoridad temporal', 3)}${inlineCell('B22', 'Reloj del navegador sin verificar', 4)}</row>
  </sheetData>
  <mergeCells count="14"><mergeCell ref="A1:F1"/><mergeCell ref="A2:F2"/><mergeCell ref="B5:F5"/><mergeCell ref="B12:E12"/><mergeCell ref="B13:E13"/><mergeCell ref="A15:F15"/><mergeCell ref="A16:F16"/><mergeCell ref="A17:F17"/><mergeCell ref="A18:F18"/><mergeCell ref="A19:F19"/><mergeCell ref="A20:F20"/><mergeCell ref="B21:C21"/><mergeCell ref="E21:F21"/><mergeCell ref="B22:F22"/></mergeCells>
  <autoFilter ref="A7:F9"/>
  <pageMargins left="0.35" right="0.35" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
  <pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="1"/>
</worksheet>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00;[Red]-&quot;$&quot;#,##0.00"/></numFmts>
  <fonts count="4"><font><sz val="11"/><name val="Aptos"/><family val="2"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="18"/><name val="Aptos Display"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FF123247"/><sz val="11"/><name val="Aptos"/></font></fonts>
  <fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF123247"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF176F64"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF5F1"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFBF3DF"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD7DFDC"/></left><right style="thin"><color rgb="FFD7DFDC"/></right><top style="thin"><color rgb="FFD7DFDC"/></top><bottom style="thin"><color rgb="FFD7DFDC"/></bottom><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="15">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="164" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="164" fontId="3" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="164" fontId="3" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function xlsxEntries(context) {
  return [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`],
    ['docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>MuniControl</Application><Company>Municipalidad de Junín</Company><AppVersion>1.0</AppVersion></Properties>`],
    ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Control poscierre ${xml(context.period)} - Jurisdicción ${xml(context.jurisdiction)}</dc:title><dc:creator>MuniControl</dc:creator><dc:description>Borrador local de control, no oficial</dc:description><dcterms:created xsi:type="dcterms:W3CDTF">${xml(context.generatedAt)}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${xml(context.generatedAt)}</dcterms:modified></cp:coreProperties>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><fileVersion appName="xl"/><workbookPr/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews><sheets><sheet name="Conciliación" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', stylesXml()],
    ['xl/worksheets/sheet1.xml', worksheetXml(context)],
  ];
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function set16(view, offset, value) { view.setUint16(offset, value, true); }
function set32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }

function joinBytes(parts) {
  const size = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.byteLength; }
  return output;
}

function storedZip(entries) {
  const encoder = new TextEncoder();
  const local = [];
  const central = [];
  let localOffset = 0;
  for (const [name, text] of entries) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(text);
    const crc = crc32(data);
    const localHeader = new Uint8Array(30);
    const localView = new DataView(localHeader.buffer);
    set32(localView, 0, 0x04034b50); set16(localView, 4, 20); set16(localView, 6, 0x0800);
    set16(localView, 8, 0); set16(localView, 10, 0); set16(localView, 12, 0x0021);
    set32(localView, 14, crc); set32(localView, 18, data.byteLength); set32(localView, 22, data.byteLength);
    set16(localView, 26, nameBytes.byteLength); set16(localView, 28, 0);
    local.push(localHeader, nameBytes, data);

    const centralHeader = new Uint8Array(46);
    const centralView = new DataView(centralHeader.buffer);
    set32(centralView, 0, 0x02014b50); set16(centralView, 4, 20); set16(centralView, 6, 20);
    set16(centralView, 8, 0x0800); set16(centralView, 10, 0); set16(centralView, 12, 0); set16(centralView, 14, 0x0021);
    set32(centralView, 16, crc); set32(centralView, 20, data.byteLength); set32(centralView, 24, data.byteLength);
    set16(centralView, 28, nameBytes.byteLength); set16(centralView, 30, 0); set16(centralView, 32, 0);
    set16(centralView, 34, 0); set16(centralView, 36, 0); set32(centralView, 38, 0); set32(centralView, 42, localOffset);
    central.push(centralHeader, nameBytes);
    localOffset += localHeader.byteLength + nameBytes.byteLength + data.byteLength;
  }
  const centralBytes = joinBytes(central);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  set32(endView, 0, 0x06054b50); set16(endView, 4, 0); set16(endView, 6, 0);
  set16(endView, 8, entries.length); set16(endView, 10, entries.length);
  set32(endView, 12, centralBytes.byteLength); set32(endView, 16, localOffset); set16(endView, 20, 0);
  return joinBytes([...local, centralBytes, end]);
}

function pdfLatinBytes(value) {
  const normalized = String(value)
    .replaceAll('–', '-').replaceAll('—', '-').replaceAll('“', '"').replaceAll('”', '"')
    .replaceAll('’', "'").replaceAll('…', '...');
  const output = new Uint8Array(normalized.length);
  for (let index = 0; index < normalized.length; index += 1) {
    const code = normalized.charCodeAt(index);
    output[index] = code <= 255 ? code : 63;
  }
  return output;
}

function pdfLiteral(value) {
  return String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)')
    .replace(/[\r\n]+/g, ' ');
}

function pdfDocument(context) {
  const commands = [];
  const color = {
    navy: '0.071 0.196 0.278', green: '0.090 0.435 0.392', ink: '0.094 0.145 0.176',
    muted: '0.380 0.443 0.478', line: '0.843 0.875 0.863', soft: '0.969 0.976 0.973',
    amber: '0.984 0.953 0.875', white: '1 1 1', red: '0.584 0.275 0.239',
  };
  const rect = (x, y, width, height, fill, stroke = null) => {
    commands.push('q');
    if (fill) commands.push(`${fill} rg`);
    if (stroke) commands.push(`${stroke} RG 0.7 w`);
    commands.push(`${x} ${y} ${width} ${height} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'} Q`);
  };
  const text = (x, y, value, size = 10, font = 'F1', fill = color.ink) => {
    commands.push(`BT /${font} ${size} Tf ${fill} rg 1 0 0 1 ${x} ${y} Tm (${pdfLiteral(value)}) Tj ET`);
  };
  const rightText = (right, y, value, size = 9, font = 'F1', fill = color.ink) => {
    const estimated = String(value).length * size * 0.49;
    text(Math.max(20, right - estimated), y, value, size, font, fill);
  };

  rect(0, 750, 595, 92, color.navy);
  text(38, 806, 'MuniControl', 22, 'F2', color.white);
  text(38, 784, 'CONTROL POSCIERRE DE APORTES', 11, 'F2', color.white);
  text(38, 766, 'Borrador local de control - No oficial', 9, 'F1', color.white);

  rect(38, 698, 519, 34, context.status === 'matched' ? '0.918 0.961 0.945' : color.amber, context.status === 'matched' ? color.green : color.red);
  text(51, 711, context.statusLabel, 10, 'F2', context.status === 'matched' ? color.green : color.red);

  rect(38, 649, 250, 34, color.soft, color.line);
  text(50, 669, 'PERIODO', 7, 'F2', color.muted); text(50, 655, context.period, 11, 'F2', color.navy);
  rect(307, 649, 250, 34, color.soft, color.line);
  text(319, 669, 'JURISDICCION', 7, 'F2', color.muted); text(319, 655, context.jurisdiction, 11, 'F2', color.navy);

  text(38, 618, 'Comparación al centavo', 14, 'F2', color.navy);
  rect(38, 580, 519, 24, color.green);
  text(48, 588, 'Concepto', 8, 'F2', color.white);
  rightText(287, 588, 'Reporte GRH', 8, 'F2', color.white);
  rightText(415, 588, 'Control declarado', 8, 'F2', color.white);
  rightText(542, 588, 'Diferencia', 8, 'F2', color.white);
  const drawRow = (y, row, shaded = false) => {
    rect(38, y, 519, 32, shaded ? color.soft : color.white, color.line);
    text(48, y + 11, row.concept, 10, 'F2', color.navy);
    rightText(287, y + 11, formatArs(row.observed), 9);
    rightText(415, y + 11, formatArs(row.control), 9);
    rightText(542, y + 11, formatArs(row.difference), 9, row.matches ? 'F1' : 'F2', row.matches ? color.ink : color.red);
  };
  drawRow(548, context.rows[0]);
  drawRow(516, context.rows[1], true);
  rect(38, 478, 519, 32, '0.918 0.961 0.945', color.green);
  text(48, 489, 'TOTAL 701 + 703', 10, 'F2', color.navy);
  rightText(287, 489, formatArs(context.totals.observed), 9, 'F2', color.navy);
  rightText(415, 489, formatArs(context.totals.control), 9, 'F2', color.navy);
  rightText(542, 489, formatArs(context.totals.difference), 9, 'F2', context.status === 'matched' ? color.green : color.red);

  text(38, 445, 'Trazabilidad de fuentes', 13, 'F2', color.navy);
  text(38, 423, 'Reporte GRH', 8, 'F2', color.muted);
  text(125, 423, context.sources.observed.sha256.slice(0, 39), 7, 'F1', color.ink);
  text(125, 411, context.sources.observed.sha256.slice(39), 7, 'F1', color.ink);
  rightText(557, 417, `${context.sources.observed.byteLength} bytes`, 7, 'F1', color.muted);
  text(38, 387, 'Control declarado', 8, 'F2', color.muted);
  text(125, 387, context.sources.control.sha256.slice(0, 39), 7, 'F1', color.ink);
  text(125, 375, context.sources.control.sha256.slice(39), 7, 'F1', color.ink);
  rightText(557, 381, `${context.sources.control.byteLength} bytes`, 7, 'F1', color.muted);

  rect(38, 213, 519, 132, color.soft, color.line);
  text(51, 325, 'ALCANCE DEL INFORME', 8, 'F2', color.green);
  text(51, 302, 'La coincidencia es aritmética y local. No aprueba aportes ni cierra la liquidación.', 8);
  text(51, 285, 'Una diferencia permanece abierta aunque se haya cumplido el requisito local de observación.', 8);
  text(51, 268, 'Las huellas identifican los bytes de esta ejecución; no son firma ni evidencia durable.', 8);
  text(51, 251, 'La procedencia e independencia de los archivos no están verificadas por el servidor.', 8);
  text(51, 234, 'No contiene filas nominales, observaciones ni nombres de archivos fuente.', 8);
  text(51, 217, 'No genera F.931, no presenta información fiscal y no escribe en GRH o PostgreSQL.', 8);

  text(38, 175, `Generado por MuniControl: ${context.generatedAt}`, 8, 'F1', color.muted);
  text(38, 159, 'Autoridad temporal: reloj del navegador sin verificar', 8, 'F1', color.muted);
  text(38, 143, `Contrato: ${context.contractVersion}`, 8, 'F1', color.muted);
  text(38, 80, 'Municipalidad de Junín - Uso interno de gestión', 8, 'F2', color.navy);
  rightText(557, 80, 'Página 1 de 1', 8, 'F1', color.muted);

  const content = `${commands.join('\n')}\n`;
  const contentBytes = pdfLatinBytes(content);
  const pdfTitle = pdfLiteral(`Control poscierre ${context.period} - Jurisdicción ${context.jurisdiction}`);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    joinBytes([pdfLatinBytes(`<< /Length ${contentBytes.byteLength} >>\nstream\n`), contentBytes, pdfLatinBytes('endstream')]),
    `<< /Title (${pdfTitle}) /Author (MuniControl) /Subject (Borrador local de control, no oficial) /Creator (MuniControl) /Producer (MuniControl) >>`,
  ];
  const header = pdfLatinBytes('%PDF-1.4\n%âãÏÓ\n');
  const parts = [header];
  const offsets = [0];
  let offset = header.byteLength;
  objects.forEach((object, index) => {
    offsets.push(offset);
    const body = object instanceof Uint8Array ? object : pdfLatinBytes(object);
    const wrapped = joinBytes([pdfLatinBytes(`${index + 1} 0 obj\n`), body, pdfLatinBytes('\nendobj\n')]);
    parts.push(wrapped);
    offset += wrapped.byteLength;
  });
  const xrefOffset = offset;
  const xref = [`xref\n0 ${objects.length + 1}\n`, '0000000000 65535 f \n'];
  for (const objectOffset of offsets.slice(1)) xref.push(`${String(objectOffset).padStart(10, '0')} 00000 n \n`);
  xref.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  parts.push(pdfLatinBytes(xref.join('')));
  return joinBytes(parts);
}

function fileStem(context) {
  return `municontrol_control-poscierre_${context.period}_jurisdiccion-${context.jurisdiction}`;
}

export function createPayrollPostCloseXlsxArtifact(result, options = {}) {
  const context = exportContext(result, options);
  return Object.freeze({
    contractVersion: context.contractVersion,
    fileName: `${fileStem(context)}.xlsx`,
    mimeType: MIME_XLSX,
    bytes: storedZip(xlsxEntries(context)),
  });
}

export function createPayrollPostClosePdfArtifact(result, options = {}) {
  const context = exportContext(result, options);
  return Object.freeze({
    contractVersion: context.contractVersion,
    fileName: `${fileStem(context)}.pdf`,
    mimeType: MIME_PDF,
    bytes: pdfDocument(context),
  });
}

export function downloadPayrollPostCloseArtifact(artifact, dependencies = {}) {
  if (!artifact || typeof artifact !== 'object' || !(artifact.bytes instanceof Uint8Array)
      || artifact.bytes.byteLength === 0 || typeof artifact.fileName !== 'string'
      || !/^municontrol_control-poscierre_[0-9]{4}-[0-9]{2}_jurisdiccion-(?:42|55)\.(?:xlsx|pdf)$/.test(artifact.fileName)
      || ![MIME_XLSX, MIME_PDF].includes(artifact.mimeType)) {
    fail('EXPORT_ARTIFACT_INVALID', 'El archivo generado no cumple el contrato de descarga');
  }
  const documentImpl = dependencies.documentImpl ?? globalThis.document;
  const urlApi = dependencies.urlApi ?? globalThis.URL;
  const BlobImpl = dependencies.BlobImpl ?? globalThis.Blob;
  if (!documentImpl?.createElement || !urlApi?.createObjectURL || !urlApi?.revokeObjectURL || !BlobImpl) {
    fail('EXPORT_DOWNLOAD_UNAVAILABLE', 'La descarga no está disponible en este navegador');
  }
  const blob = new BlobImpl([artifact.bytes], { type: artifact.mimeType });
  const href = urlApi.createObjectURL(blob);
  const anchor = documentImpl.createElement('a');
  anchor.href = href;
  anchor.download = artifact.fileName;
  anchor.hidden = true;
  documentImpl.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    urlApi.revokeObjectURL(href);
  }
  return artifact.fileName;
}
