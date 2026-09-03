import {
  createPayrollNoveltyCsv,
  payrollNoveltyCsvFileName,
} from './payroll-novelty-exporter.js';

export const PAYROLL_NOVELTY_XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function xml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function validatedReviewContext(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    // Reuse the canonical exporter so XLSX and CSV reject with the same code.
    createPayrollNoveltyCsv(snapshot);
  }
  const candidate = {
    ...snapshot,
    rows: Array.isArray(snapshot?.rows)
      ? snapshot.rows.map((row) => ({ ...row }))
      : snapshot?.rows,
  };
  createPayrollNoveltyCsv(candidate);
  return Object.freeze({
    period: candidate.periodMonth.slice(0, 7),
    periodMonth: candidate.periodMonth,
    payrollType: candidate.payrollType,
    batchId: candidate.id.toLowerCase(),
    rows: candidate.rows.map((row) => Object.freeze({
      order: String(row.rowOrdinal),
      legajo: String(row.legajo ?? row.legajoSnapshot),
      concepto: String(row.conceptSourceId),
      centroCosto: row.costCenterSourceId === null
        || row.costCenterSourceId === undefined ? '' : String(row.costCenterSourceId),
      adjustmentMonth: row.adjustmentMonth ?? '',
      quantity: row.quantityDecimal ?? '',
      importeCentavos: row.amountCents === null
        || row.amountCents === undefined ? '' : String(row.amountCents),
      movementType: row.movementType ?? '',
      legalInstrument: row.legalInstrument ?? '',
      observation: row.observation ?? '',
      forced: row.forced ? 'SI' : 'NO',
    })),
  });
}

function inlineStringCell(reference, value, style = 0) {
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

function worksheetXml(context) {
  const headers = [
    'periodo', 'tipo_liquidacion', 'orden', 'legajo', 'concepto', 'centro_costo',
    'mes_ajuste', 'unidades', 'importe_centavos', 'movimiento', 'instrumento_legal',
    'observacion', 'forzado', 'lote_municontrol',
  ];
  const columns = headers.map((_, index) => String.fromCharCode(65 + index));
  const headerCells = headers.map((value, index) =>
    inlineStringCell(`${columns[index]}1`, value, 1)).join('');
  const body = context.rows.map((row, index) => {
    const rowNumber = index + 2;
    const values = [
      context.periodMonth, context.payrollType, row.order, row.legajo, row.concepto,
      row.centroCosto, row.adjustmentMonth, row.quantity, row.importeCentavos,
      row.movementType, row.legalInstrument, row.observation, row.forced,
      context.batchId,
    ];
    return `<row r="${rowNumber}">${values.map((value, columnIndex) =>
      inlineStringCell(`${columns[columnIndex]}${rowNumber}`, value)).join('')}</row>`;
  }).join('');
  const lastRow = context.rows.length + 1;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:N${lastRow}"/>
  <sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols><col min="1" max="2" width="20" customWidth="1"/><col min="3" max="10" width="18" customWidth="1"/><col min="11" max="11" width="28" customWidth="1"/><col min="12" max="12" width="48" customWidth="1"/><col min="13" max="13" width="12" customWidth="1"/><col min="14" max="14" width="38" customWidth="1"/></cols>
  <sheetData><row r="1" ht="24" customHeight="1">${headerCells}</row>${body}</sheetData>
  <autoFilter ref="A1:N${lastRow}"/>
  <pageMargins left="0.35" right="0.35" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
  <pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="11"/><name val="Aptos"/><family val="2"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/><family val="2"/></font></fonts>
  <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF123247"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD7DFDC"/></left><right style="thin"><color rgb="FFD7DFDC"/></right><top style="thin"><color rgb="FFD7DFDC"/></top><bottom style="thin"><color rgb="FFD7DFDC"/></bottom><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2"><xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="49" fontId="1" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function workbookEntries(context) {
  return [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>'],
    ['docProps/app.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>MuniControl</Application><Company>Municipalidad de Junín</Company><AppVersion>1.0</AppVersion></Properties>'],
    ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Revisión de novedades de nómina ${xml(context.period)}</dc:title><dc:creator>MuniControl</dc:creator><dc:subject>Lote aprobado ${xml(context.batchId)}</dc:subject></cp:coreProperties>`],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><fileVersion appName="xl"/><workbookPr/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews><sheets><sheet name="Novedades aprobadas" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" calcMode="manual" fullCalcOnLoad="0" forceFullCalc="0"/></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml', stylesXml()],
    ['xl/worksheets/sheet1.xml', worksheetXml(context)],
  ];
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
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
  const output = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function storedZip(entries) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const [name, text] of entries) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(text);
    const checksum = crc32(data);
    const localHeader = new Uint8Array(30);
    const localView = new DataView(localHeader.buffer);
    set32(localView, 0, 0x04034b50);
    set16(localView, 4, 20);
    set16(localView, 6, 0x0800);
    set16(localView, 8, 0);
    set16(localView, 10, 0);
    set16(localView, 12, 0x0021);
    set32(localView, 14, checksum);
    set32(localView, 18, data.byteLength);
    set32(localView, 22, data.byteLength);
    set16(localView, 26, nameBytes.byteLength);
    set16(localView, 28, 0);
    localParts.push(localHeader, nameBytes, data);

    const centralHeader = new Uint8Array(46);
    const centralView = new DataView(centralHeader.buffer);
    set32(centralView, 0, 0x02014b50);
    set16(centralView, 4, 20);
    set16(centralView, 6, 20);
    set16(centralView, 8, 0x0800);
    set16(centralView, 10, 0);
    set16(centralView, 12, 0);
    set16(centralView, 14, 0x0021);
    set32(centralView, 16, checksum);
    set32(centralView, 20, data.byteLength);
    set32(centralView, 24, data.byteLength);
    set16(centralView, 28, nameBytes.byteLength);
    set16(centralView, 30, 0);
    set16(centralView, 32, 0);
    set16(centralView, 34, 0);
    set16(centralView, 36, 0);
    set32(centralView, 38, 0);
    set32(centralView, 42, localOffset);
    centralParts.push(centralHeader, nameBytes);
    localOffset += localHeader.byteLength + nameBytes.byteLength + data.byteLength;
  }
  const centralBytes = joinBytes(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  set32(endView, 0, 0x06054b50);
  set16(endView, 4, 0);
  set16(endView, 6, 0);
  set16(endView, 8, entries.length);
  set16(endView, 10, entries.length);
  set32(endView, 12, centralBytes.byteLength);
  set32(endView, 16, localOffset);
  set16(endView, 20, 0);
  return joinBytes([...localParts, centralBytes, end]);
}

export function payrollNoveltyXlsxFileName(snapshot) {
  const csvName = payrollNoveltyCsvFileName(snapshot);
  const match = csvName.match(/^novedades-aprobadas-(\d{4}-\d{2})-([a-f0-9]{8})\.csv$/);
  return `municontrol_revision-novedades-nomina_${match[1]}_${match[2]}.xlsx`;
}

export function createPayrollNoveltyXlsxArtifact(snapshot) {
  const context = validatedReviewContext(snapshot);
  return Object.freeze({
    fileName: payrollNoveltyXlsxFileName(snapshot),
    mimeType: PAYROLL_NOVELTY_XLSX_MIME,
    bytes: storedZip(workbookEntries(context)),
  });
}

export function createPayrollNoveltyXlsx(snapshot) {
  return createPayrollNoveltyXlsxArtifact(snapshot).bytes;
}

export function downloadPayrollNoveltyXlsx(
  snapshot,
  documentRef = document,
  urlRef = URL,
) {
  const artifact = createPayrollNoveltyXlsxArtifact(snapshot);
  const blob = new Blob([artifact.bytes], { type: artifact.mimeType });
  const url = urlRef.createObjectURL(blob);
  const anchor = documentRef.createElement('a');
  anchor.href = url;
  anchor.download = artifact.fileName;
  anchor.rel = 'noopener';
  anchor.click();
  setTimeout(() => urlRef.revokeObjectURL(url), 0);
  return artifact.fileName;
}
