import {
  payrollArtValidationLabel,
  requireTrustedPayrollArtReport,
} from './payroll-art-report.js';

export const PAYROLL_ART_OFFICE_EXPORT_CONTRACT_VERSION = 'payroll-art-office-export.v1';

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MIME_PDF = 'application/pdf';
const ARTIFACT_KINDS = new Set(['xlsx', 'pdf']);

export class PayrollArtOfficeExportError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PayrollArtOfficeExportError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new PayrollArtOfficeExportError(code, message);
}

function xml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function joinBytes(parts) {
  const byteLength = parts.reduce((total, part) => total + part.byteLength, 0);
  const output = new Uint8Array(byteLength);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

async function sha256Bytes(bytes, cryptoImpl) {
  if (!cryptoImpl?.subtle || typeof cryptoImpl.subtle.digest !== 'function') {
    fail('ART_EXPORT_CRYPTO_UNAVAILABLE', 'No hay un motor criptográfico disponible para identificar el archivo');
  }
  let digest;
  try {
    digest = await cryptoImpl.subtle.digest('SHA-256', bytes);
  } catch {
    fail('ART_EXPORT_CRYPTO_FAILED', 'No se pudo identificar de forma segura el archivo');
  }
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function exactArs(value, { symbol = true, grouped = true } = {}) {
  if (value === null || value === undefined || value === '') return 'No informado';
  const cents = BigInt(value);
  const negative = cents < 0n;
  const digits = String(negative ? -cents : cents).padStart(3, '0');
  const integer = grouped
    ? digits.slice(0, -2).replace(/\B(?=([0-9]{3})+(?![0-9]))/g, '.')
    : digits.slice(0, -2);
  return `${negative ? '-' : ''}${symbol ? '$ ' : ''}${integer},${digits.slice(-2)}`;
}

function reviewLabel(row) {
  if (row.warningCodes.includes('ART_DECLARED_SALARY_DIFFERENCE')) return 'Revisar diferencia';
  if (row.warningCodes.includes('ART_DECLARED_SALARY_UNAVAILABLE')) return 'Sin comparación SUSS';
  if (row.warningCodes.includes('ART_NON_TAXABLE_UNAVAILABLE')) return 'No imponible no informado';
  return 'Coincide';
}

function scopeLabel(scope) {
  if (scope === 'all') return 'Todos (J42 + J55)';
  if (scope === 'municipal') return 'Municipio completo · sin desagregar J42/J55';
  return `Jurisdicción ${scope}`;
}

function fileScope(scope) {
  if (scope === 'all') return 'todos';
  if (scope === 'municipal') return 'municipio';
  return `j${scope}`;
}

function fileStem(report) {
  return `municontrol_art-provincia_${report.period}_${fileScope(report.scope)}_${report.traceability.reportSha256.slice(7, 19)}`;
}

function statusLabel(report) {
  if (report.status === 'generated_with_exceptions') return 'REPORTE GENERADO CON EXCEPCIONES';
  if (report.status === 'ready_with_observations') return 'LISTO CON DIFERENCIAS INFORMATIVAS';
  if (report.status === 'ready_for_authorized_review') return 'LISTO PARA REVISIÓN AUTORIZADA';
  return 'BLOQUEADO POR VALIDACIONES';
}

function statusStyle(report) {
  return report.status === 'ready_for_authorized_review' ? 9 : 7;
}

function statusIsClear(report) {
  return report.status === 'ready_for_authorized_review';
}

function inlineCell(ref, value, style = 4) {
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

function integerCell(ref, value, style = 4) {
  if (!Number.isSafeInteger(value)) fail('ART_EXPORT_INTEGER_INVALID', 'Una métrica del reporte no es un entero exacto');
  return `<c r="${ref}" s="${style}" t="n"><v>${value}</v></c>`;
}

function columnName(index) {
  let current = index + 1;
  let result = '';
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

function worksheet(rows, {
  widths,
  merges = [],
  freezeAt = 0,
  filter = null,
  orientation = 'landscape',
} = {}) {
  const maxColumns = Math.max(...rows.map((row) => row.cells.length), 1);
  const sheetRows = rows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const cells = row.cells.map((cell, columnIndex) => {
      if (cell === null || cell === undefined) return '';
      const ref = `${columnName(columnIndex)}${rowNumber}`;
      if (cell.type === 'number') return integerCell(ref, cell.value, cell.style);
      return inlineCell(ref, cell.value, cell.style);
    }).join('');
    const height = row.height ? ` ht="${row.height}" customHeight="1"` : '';
    return `<row r="${rowNumber}"${height}>${cells}</row>`;
  }).join('');
  const columns = (widths || Array(maxColumns).fill(18))
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join('');
  const pane = freezeAt > 0
    ? `<pane ySplit="${freezeAt}" topLeftCell="A${freezeAt + 1}" activePane="bottomLeft" state="frozen"/>`
    : '';
  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`
    : '';
  const filterXml = filter ? `<autoFilter ref="${filter}"/>` : '';
  const lastRef = `${columnName(maxColumns - 1)}${rows.length}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastRef}"/>
  <sheetViews><sheetView showGridLines="0" workbookViewId="0">${pane}</sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="17"/><cols>${columns}</cols>
  <sheetData>${sheetRows}</sheetData>${filterXml}${mergeXml}
  <pageMargins left="0.25" right="0.25" top="0.45" bottom="0.45" header="0.2" footer="0.2"/>
  <pageSetup orientation="${orientation}" paperSize="9" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

const t = (value, style = 4) => ({ type: 'text', value, style });
const n = (value, style = 4) => ({ type: 'number', value, style });

function titleRows(report, title, columns) {
  return [
    { height: 30, cells: [t(`MuniControl · ${title}`, 1), ...Array(columns - 1).fill(null)] },
    { height: 24, cells: [t('Documento interno restringido · Revisión operativa · No constituye presentación oficial ART', 2), ...Array(columns - 1).fill(null)] },
  ];
}

function summarySheet(report) {
  const rows = [
    ...titleRows(report, 'Reporte ART Provincia', 4),
    { height: 8, cells: [null, null, null, null] },
    { cells: [t('Período', 3), t(report.period), t('Alcance', 3), t(scopeLabel(report.scope))] },
    { cells: [t('Corte de fuente', 3), t(report.source.cutoffAt), t('Identificador de fuente', 3), t(report.source.snapshotId, 8)] },
    { cells: [t('Estado', 3), t(statusLabel(report), statusStyle(report)), t('Fórmula aplicada', 3), t(report.traceability.formula)] },
    { height: 8, cells: [null, null, null, null] },
    { cells: [t('Métrica', 5), t('Valor', 5), t('Métrica', 5), t('Valor', 5)] },
    { cells: [t('Filas de fuente', 4), n(report.summary.sourceRows), t('Filas del alcance', 4), n(report.summary.scopedRows)] },
    { cells: [t('Filas aceptadas', 4), n(report.summary.acceptedRows), t('Filas rechazadas', 4), n(report.summary.rejectedRows)] },
    { cells: [t('Excluidas por alcance', 4), n(report.summary.excludedByScope), t('Grupos duplicados', 4), n(report.summary.duplicateGroups)] },
    { height: 8, cells: [null, null, null, null] },
    { cells: [t('Total exacto', 5), t('Importe ARS', 5), t('Centavos exactos', 5), t('Regla', 5)] },
    { cells: [t('Concepto 993', 4), t(exactArs(report.summary.concept993TotalCents), 6), t(report.summary.concept993TotalCents, 6), t('Suma de filas aceptadas')] },
    { cells: [t('Concepto 995', 4), t(exactArs(report.summary.concept995TotalCents), 6), t(report.summary.concept995TotalCents, 6), t('Suma de filas aceptadas')] },
    { cells: [t('Masa salarial ART', 3), t(exactArs(report.summary.salaryTotalCents), 6), t(report.summary.salaryTotalCents, 6), t('Concepto 993 + concepto 995', 3)] },
    { height: 8, cells: [null, null, null, null] },
    { cells: [t('SHA-256 de fuente', 3), t(report.source.sha256, 8), null, null] },
    { cells: [t('SHA-256 del reporte', 3), t(report.traceability.reportSha256, 8), null, null] },
    { cells: [t('Perfil de exportación', 3), t(report.exportProfileVersion, 8), t('Versión de fórmula', 3), t(report.formulaVersion, 8)] },
    { cells: [t('Control de alcance', 7), t('No presenta ni envía información a ART; no modifica nómina, GRH ni PostgreSQL.', 7), null, null] },
    { cells: [t('Precisión monetaria', 7), t('Los importes se exportan como texto exacto y centavos enteros para evitar redondeos binarios de Excel.', 7), null, null] },
  ];
  if (report.scope === 'municipal') {
    rows.push(
      { height: 8, cells: [null, null, null, null] },
      { cells: [t('Cruce GALENO / SUSS', 5), t('Resultado', 5), t('Importe comparado', 5), t('Valor', 5)] },
      { cells: [t('Coincidencias exactas · aceptadas', 4), n(report.summary.comparisonMatches), t('Sueldo SUSS · aceptadas comparadas', 4), t(exactArs(report.summary.declaredSalaryTotalCents), 6)] },
      { cells: [t('Diferencias · aceptadas comparadas', 7), n(report.summary.comparisonMismatches, 7), t('SUSS menos fórmula · aceptadas', 7), t(exactArs(report.summary.differenceTotalCents), 7)] },
      { cells: [t('Mapeo de origen', 7), t('Imponible → 993; Asign. Fliares → 995. Confirmación operativa pendiente.', 7), null, null] },
      { cells: [t('Universo único del control', 7), t('Comparaciones y totales se calculan únicamente sobre filas aceptadas. Los datos informativos opcionales sólo suman cuando están disponibles.', 7), null, null] },
    );
  }
  return worksheet(rows, {
    widths: [30, 64, 28, 52],
    merges: [
      'A1:D1', 'A2:D2', 'B18:D18', 'B19:D19', 'B21:D21', 'B22:D22',
      ...(report.scope === 'municipal' ? ['B27:D27', 'B28:D28'] : []),
    ],
    freezeAt: 7,
  });
}

function detailSheet(report) {
  const paired = report.scope === 'municipal';
  const headers = [
    'Período', 'Alcance', 'Fila fuente', 'Liquidación', 'Jurisdicción', 'Legajo',
    'DNI', 'CUIL', 'Sexo', 'Días trabajados', 'Concepto 993 ARS', 'Concepto 995 ARS',
    'Sueldo ART ARS', '993 centavos exactos', '995 centavos exactos',
    'Sueldo centavos exactos', 'Versión de fórmula',
    ...(paired ? [
      'Fila GALENO', 'Fila SUSS', 'No imponible informativo ARS',
      'Sueldo declarado SUSS ARS', 'Diferencia SUSS menos fórmula ARS', 'Revisión',
    ] : []),
  ];
  const rows = [
    ...titleRows(report, 'Detalle nominal ART', headers.length),
    { height: 8, cells: Array(headers.length).fill(null) },
    { cells: headers.map((value) => t(value, 5)) },
    ...report.acceptedRows.map((row) => ({ cells: [
      t(report.period), t(scopeLabel(report.scope)), n(row.rowNumber), t(row.liquidationId),
      t(row.jurisdiction), t(row.legajo), t(row.dni), t(row.cuil), t(row.sex),
      t(row.workedDays), t(exactArs(row.concept993Cents, { symbol: false, grouped: false }), 6),
      t(exactArs(row.concept995Cents, { symbol: false, grouped: false }), 6),
      t(exactArs(row.salaryCents, { symbol: false, grouped: false }), 6),
      t(row.concept993Cents, 6), t(row.concept995Cents, 6), t(row.salaryCents, 6),
      t(report.formulaVersion, 8),
      ...(paired ? [
        t(row.galenoRowNumbers.join('|'), 6), t(row.sussRowNumbers.join('|'), 6),
        t(exactArs(row.nonTaxableCents, { symbol: false, grouped: false }), 6),
        t(exactArs(row.declaredSalaryCents, { symbol: false, grouped: false }), 6),
        t(exactArs(row.differenceCents, { symbol: false, grouped: false }), 6),
        t(reviewLabel(row), row.warningCodes.length ? 7 : 9),
      ] : []),
    ] })),
  ];
  if (report.acceptedRows.length === 0) {
    rows.push({ cells: [t('Sin filas aceptadas para el alcance seleccionado.', 7), ...Array(headers.length - 1).fill(null)] });
  }
  const lastData = Math.max(4, rows.length);
  const lastColumn = columnName(headers.length - 1);
  return worksheet(rows, {
    widths: [
      12, 24, 12, 29, 14, 25, 16, 19, 9, 17, 20, 20, 20, 23, 23, 25, 38,
      ...(paired ? [14, 14, 28, 26, 31, 22] : []),
    ],
    merges: [
      `A1:${lastColumn}1`, `A2:${lastColumn}2`,
      ...(report.acceptedRows.length === 0 ? [`A5:${lastColumn}5`] : []),
    ],
    freezeAt: 4,
    filter: `A4:${lastColumn}${lastData}`,
    orientation: 'landscape',
  });
}

function rejectedSheet(report) {
  const rejected = report.rejectedRows.flatMap((row) => row.errorCodes.map((code) => ({
    rowNumber: row.rowNumber,
    galenoRowNumbers: row.galenoRowNumbers || [],
    sussRowNumbers: row.sussRowNumbers || [],
    code,
    reason: payrollArtValidationLabel(code),
  })));
  if (report.scope === 'municipal') {
    const rows = [
      ...titleRows(report, 'Filas a corregir', 5),
      { height: 8, cells: [null, null, null, null, null] },
      { cells: [
        t('Fila del cruce', 5), t('Filas GALENO', 5), t('Filas SUSS', 5),
        t('Motivo para corregir', 5), t('Código técnico', 5),
      ] },
      ...rejected.map((row) => ({ cells: [
        n(row.rowNumber), t(row.galenoRowNumbers.join('|') || '—'),
        t(row.sussRowNumbers.join('|') || '—'), t(row.reason), t(row.code),
      ] })),
    ];
    if (rejected.length === 0) {
      rows.push({ cells: [t('Sin filas a corregir'), t('—'), t('—'), t('—'), t('—')] });
    }
    return worksheet(rows, {
      widths: [18, 20, 20, 78, 42],
      merges: ['A1:E1', 'A2:E2'],
      freezeAt: 4,
      filter: `A4:E${rows.length}`,
    });
  }
  const rows = [
    ...titleRows(report, 'Filas rechazadas', 2),
    { height: 8, cells: [null, null] },
    { cells: [t('Fila fuente', 5), t('Código de validación', 5)] },
    ...rejected.map((row) => ({ cells: [n(row.rowNumber), t(row.code)] })),
  ];
  if (rejected.length === 0) rows.push({ cells: [t('Sin rechazos'), t('—')] });
  return worksheet(rows, {
    widths: [18, 66],
    merges: ['A1:B1', 'A2:B2'],
    freezeAt: 4,
    filter: `A4:B${rows.length}`,
  });
}

function traceabilitySheet(report) {
  const entries = [
    ['Contrato del reporte', report.contractVersion],
    ['Contrato de exportación', PAYROLL_ART_OFFICE_EXPORT_CONTRACT_VERSION],
    ['Contrato de fuente', report.sourceContractVersion],
    ['Perfil de exportación', report.exportProfileVersion],
    ['Versión de fórmula', report.formulaVersion],
    ['Fórmula', report.traceability.formula],
    ['Tenant', report.tenantId],
    ['Actor', report.actorId],
    ['Solicitado', report.requestedAt],
    ['Período', report.period],
    ['Alcance', report.scope],
    ['Snapshot de fuente', report.source.snapshotId],
    ['Corte de fuente', report.source.cutoffAt],
    ['SHA-256 de fuente', report.source.sha256],
    ['Filas de fuente', String(report.source.rowCount)],
    ['SHA-256 del reporte', report.traceability.reportSha256],
    ['Reglas inferidas', report.traceability.rulesInferred ? 'SÍ' : 'NO'],
    ['Persistencia realizada', 'NO'],
    ['Red utilizada', 'NO'],
    ['Nómina modificada', 'NO'],
    ['Presentación oficial habilitada', 'NO'],
    ['Precisión monetaria', 'Texto ARS + centavos enteros exactos; sin conversión a punto flotante'],
    ['Confidencialidad', 'Restringido: contiene detalle nominal si existen filas aceptadas'],
  ];
  if (Array.isArray(report.source.sourceFiles)) {
    for (const sourceFile of report.source.sourceFiles) {
      entries.push([`SHA-256 fuente ${sourceFile.kind}`, sourceFile.sha256]);
      entries.push([`Filas fuente ${sourceFile.kind}`, String(sourceFile.rowCount)]);
    }
    entries.push(['Estado del mapeo', report.traceability.mappingState]);
  }
  const rows = [
    ...titleRows(report, 'Trazabilidad del reporte ART', 2),
    { height: 8, cells: [null, null] },
    { cells: [t('Campo', 5), t('Valor', 5)] },
    ...entries.map(([key, value]) => ({ cells: [t(key, 3), t(value, 8)] })),
  ];
  return worksheet(rows, {
    widths: [38, 100],
    merges: ['A1:B1', 'A2:B2'],
    freezeAt: 4,
  });
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4"><font><sz val="10"/><name val="Aptos"/><family val="2"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="18"/><name val="Aptos Display"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Aptos"/></font><font><b/><color rgb="FF123247"/><sz val="10"/><name val="Aptos"/></font></fonts>
  <fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF123247"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF137C72"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF5F1"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF2D8"/></patternFill></fill></fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD7DFDC"/></left><right style="thin"><color rgb="FFD7DFDC"/></right><top style="thin"><color rgb="FFD7DFDC"/></top><bottom style="thin"><color rgb="FFD7DFDC"/></bottom><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="10">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="0" fontId="3" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
  </cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function workbookEntries(report) {
  const sheets = [
    ['Resumen', summarySheet(report)],
    ['Detalle nominal', detailSheet(report)],
    ['Rechazados', rejectedSheet(report)],
    ['Trazabilidad', traceabilitySheet(report)],
  ];
  const overrides = sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  const sheetTags = sheets.map(([name], index) => `<sheet name="${xml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('');
  const sheetRels = sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('');
  return [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>'],
    ['docProps/app.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>MuniControl</Application><Company>Municipalidad de Junín</Company><AppVersion>1.0</AppVersion></Properties>'],
    ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Reporte ART Provincia ${xml(report.period)} · ${xml(scopeLabel(report.scope))}</dc:title><dc:creator>MuniControl</dc:creator><dc:description>Documento interno restringido; no constituye presentación oficial ART</dc:description><dcterms:created xsi:type="dcterms:W3CDTF">${xml(report.requestedAt)}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${xml(report.requestedAt)}</dcterms:modified></cp:coreProperties>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><fileVersion appName="xl"/><workbookPr/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews><sheets>${sheetTags}</sheets><calcPr calcId="191029" calcMode="manual" fullCalcOnLoad="0" forceFullCalc="0"/></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRels}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', stylesXml()],
    ...sheets.map(([, contents], index) => [`xl/worksheets/sheet${index + 1}.xml`, contents]),
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

function storedZip(entries) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;
  for (const [name, contents] of entries) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(contents);
    const checksum = crc32(data);
    const localHeader = new Uint8Array(30);
    const localView = new DataView(localHeader.buffer);
    set32(localView, 0, 0x04034b50); set16(localView, 4, 20); set16(localView, 6, 0x0800);
    set16(localView, 8, 0); set16(localView, 10, 0); set16(localView, 12, 0x0021);
    set32(localView, 14, checksum); set32(localView, 18, data.byteLength); set32(localView, 22, data.byteLength);
    set16(localView, 26, nameBytes.byteLength); set16(localView, 28, 0);
    localParts.push(localHeader, nameBytes, data);

    const centralHeader = new Uint8Array(46);
    const centralView = new DataView(centralHeader.buffer);
    set32(centralView, 0, 0x02014b50); set16(centralView, 4, 20); set16(centralView, 6, 20);
    set16(centralView, 8, 0x0800); set16(centralView, 10, 0); set16(centralView, 12, 0); set16(centralView, 14, 0x0021);
    set32(centralView, 16, checksum); set32(centralView, 20, data.byteLength); set32(centralView, 24, data.byteLength);
    set16(centralView, 28, nameBytes.byteLength); set16(centralView, 30, 0); set16(centralView, 32, 0);
    set16(centralView, 34, 0); set16(centralView, 36, 0); set32(centralView, 38, 0); set32(centralView, 42, localOffset);
    centralParts.push(centralHeader, nameBytes);
    localOffset += localHeader.byteLength + nameBytes.byteLength + data.byteLength;
  }
  const centralBytes = joinBytes(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  set32(endView, 0, 0x06054b50); set16(endView, 4, 0); set16(endView, 6, 0);
  set16(endView, 8, entries.length); set16(endView, 10, entries.length);
  set32(endView, 12, centralBytes.byteLength); set32(endView, 16, localOffset); set16(endView, 20, 0);
  return joinBytes([...localParts, centralBytes, end]);
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

function pdfPainter() {
  const commands = [];
  const color = {
    navy: '0.071 0.196 0.278', green: '0.075 0.486 0.447', ink: '0.094 0.145 0.176',
    muted: '0.380 0.443 0.478', line: '0.843 0.875 0.863', soft: '0.969 0.976 0.973',
    amber: '0.984 0.953 0.875', white: '1 1 1', red: '0.584 0.275 0.239',
  };
  const rect = (x, y, width, height, fill, stroke = null) => {
    commands.push('q');
    if (fill) commands.push(`${fill} rg`);
    if (stroke) commands.push(`${stroke} RG 0.6 w`);
    commands.push(`${x} ${y} ${width} ${height} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'} Q`);
  };
  const text = (x, y, value, size = 8, font = 'F1', fill = color.ink) => {
    commands.push(`BT /${font} ${size} Tf ${fill} rg 1 0 0 1 ${x} ${y} Tm (${pdfLiteral(value)}) Tj ET`);
  };
  const rightText = (right, y, value, size = 8, font = 'F1', fill = color.ink) => {
    text(Math.max(18, right - String(value).length * size * 0.48), y, value, size, font, fill);
  };
  return { commands, color, rect, text, rightText };
}

function clipped(value, characters) {
  const text = String(value);
  return text.length <= characters ? text : `${text.slice(0, Math.max(1, characters - 3))}...`;
}

function pageChrome(report, painter, section, pageNumber, totalPages) {
  const { color, rect, text, rightText } = painter;
  rect(0, 530, 842, 65, color.navy);
  text(27, 566, 'MuniControl', 18, 'F2', color.white);
  text(27, 546, `REPORTE ART PROVINCIA · ${section}`, 9, 'F2', color.white);
  rightText(815, 566, `${report.period} · ${scopeLabel(report.scope)}`, 9, 'F2', color.white);
  rightText(815, 546, `Corte ${report.source.cutoffAt}`, 7, 'F1', color.white);
  text(27, 25, 'Documento interno restringido · No constituye presentación oficial ni envío a ART', 6.5, 'F1', color.muted);
  rightText(815, 25, `Página ${pageNumber} de ${totalPages}`, 6.5, 'F1', color.muted);
}

function summaryPdfCommands(report, pageNumber, totalPages) {
  const painter = pdfPainter();
  const { color, rect, text, rightText } = painter;
  pageChrome(report, painter, 'RESUMEN Y TRAZABILIDAD', pageNumber, totalPages);
  const clear = statusIsClear(report);
  const blocked = report.status === 'blocked_by_validation';
  rect(27, 475, 788, 38, clear ? '0.918 0.961 0.945' : color.amber, clear ? color.green : blocked ? color.red : color.amber);
  text(40, 489, statusLabel(report), 11, 'F2', clear ? color.green : blocked ? color.red : color.navy);
  rightText(802, 489, `${report.summary.acceptedRows} aceptadas · ${report.summary.rejectedRows} rechazadas`, 8, 'F2', color.navy);

  const metrics = [
    ['FILAS FUENTE', report.summary.sourceRows],
    ['FILAS ALCANCE', report.summary.scopedRows],
    ['ACEPTADAS', report.summary.acceptedRows],
    ['RECHAZADAS', report.summary.rejectedRows],
  ];
  metrics.forEach(([label, value], index) => {
    const x = 27 + index * 197;
    rect(x, 420, 184, 42, color.soft, color.line);
    text(x + 10, 446, label, 6.5, 'F2', color.muted);
    text(x + 10, 428, String(value), 14, 'F2', color.navy);
  });

  text(27, 393, 'Totales monetarios exactos', 12, 'F2', color.navy);
  const totals = [
    ['CONCEPTO 993', report.summary.concept993TotalCents],
    ['CONCEPTO 995', report.summary.concept995TotalCents],
    ['MASA SALARIAL ART (993 + 995)', report.summary.salaryTotalCents],
  ];
  totals.forEach(([label, value], index) => {
    const y = 349 - index * 37;
    rect(27, y, 788, 31, index === 2 ? '0.918 0.961 0.945' : color.soft, color.line);
    text(39, y + 12, label, 7.5, 'F2', color.navy);
    rightText(803, y + 12, exactArs(value), 9, 'F2', color.navy);
  });

  text(27, 238, 'Fuente y trazabilidad', 12, 'F2', color.navy);
  text(27, 218, 'Fuente', 7, 'F2', color.muted);
  text(102, 218, clipped(report.source.snapshotId, 85), 7, 'F1', color.ink);
  text(27, 200, 'SHA fuente', 7, 'F2', color.muted);
  text(102, 200, report.source.sha256.slice(0, 55), 6.5, 'F1', color.ink);
  text(102, 188, report.source.sha256.slice(55), 6.5, 'F1', color.ink);
  text(27, 168, 'SHA reporte', 7, 'F2', color.muted);
  text(102, 168, report.traceability.reportSha256.slice(0, 55), 6.5, 'F1', color.ink);
  text(102, 156, report.traceability.reportSha256.slice(55), 6.5, 'F1', color.ink);
  text(27, 134, 'Fórmula', 7, 'F2', color.muted);
  text(102, 134, `${report.traceability.formula} · ${report.formulaVersion}`, 7, 'F1', color.ink);
  if (report.scope === 'municipal') {
    text(27, 118, 'Cruce', 7, 'F2', color.muted);
    text(102, 118, `${report.summary.comparisonRows} filas aceptadas comparadas · ${report.summary.comparisonMatches} coincidencias · ${report.summary.comparisonMismatches} diferencias`, 7, 'F1', color.ink);
  }
  rect(27, 62, 788, 52, color.amber, color.line);
  text(39, 96, 'ALCANCE DEL DOCUMENTO', 7, 'F2', color.red);
  text(39, 80, 'No presenta ni envía información a ART. No modifica nómina, GRH ni PostgreSQL.', 7, 'F1', color.ink);
  text(39, 67, 'Las huellas identifican esta ejecución; no son firma digital ni evidencia durable.', 7, 'F1', color.ink);
  return `${painter.commands.join('\n')}\n`;
}

const DETAIL_COLUMNS = [
  ['Fila', 25], ['Liquidación', 88], ['J', 20], ['Legajo', 52], ['DNI', 55],
  ['CUIL', 75], ['S', 18], ['Días', 30], ['993', 86], ['995', 86], ['Sueldo ART', 90],
];

const MUNICIPAL_DETAIL_COLUMNS = [
  ['Cruce', 36], ['GALENO', 54], ['SUSS', 45], ['DNI', 55], ['CUIL', 85],
  ['S', 18], ['Días', 30], ['993', 80], ['995', 70], ['ART 993+995', 100],
  ['SUSS declarado', 110], ['Dif.', 105],
];

function detailPdfCommands(report, rows, pageNumber, totalPages) {
  const painter = pdfPainter();
  const { color, rect, text, rightText } = painter;
  pageChrome(report, painter, 'DETALLE NOMINAL', pageNumber, totalPages);
  text(27, 507, 'Uso interno restringido · Importes en ARS exactos · Fórmula 993 + 995', 7, 'F2', color.navy);
  const paired = report.scope === 'municipal';
  const columns = paired ? MUNICIPAL_DETAIL_COLUMNS : DETAIL_COLUMNS;
  let x = 27;
  for (const [label, width] of columns) {
    rect(x, 477, width, 22, color.green, color.line);
    text(x + 4, 485, label, 5.8, 'F2', color.white);
    x += width;
  }
  rows.forEach((row, index) => {
    const y = 459 - index * 18;
    const shaded = index % 2 === 1;
    x = 27;
    const values = paired ? [
      String(row.rowNumber), row.galenoRowNumbers.join('|'), row.sussRowNumbers.join('|'),
      row.dni, row.cuil, row.sex, row.workedDays, exactArs(row.concept993Cents),
      exactArs(row.concept995Cents), exactArs(row.salaryCents),
      exactArs(row.declaredSalaryCents), exactArs(row.differenceCents),
    ] : [
      String(row.rowNumber), row.liquidationId, row.jurisdiction, row.legajo, row.dni,
      row.cuil, row.sex, row.workedDays, exactArs(row.concept993Cents),
      exactArs(row.concept995Cents), exactArs(row.salaryCents),
    ];
    columns.forEach(([, width], columnIndex) => {
      rect(x, y, width, 18, shaded ? color.soft : color.white, color.line);
      const value = clipped(values[columnIndex], Math.floor(width / (paired ? 3 : 3.4)));
      const moneyStart = paired ? 7 : 8;
      if (columnIndex >= moneyStart) rightText(x + width - 3, y + 6, value, paired ? 4.7 : 5.4);
      else text(x + 3, y + 6, value, paired ? 5 : 5.4);
      x += width;
    });
  });
  text(27, 43, `SHA-256 reporte: ${report.traceability.reportSha256}`, 5.8, 'F1', color.muted);
  return `${painter.commands.join('\n')}\n`;
}

function rejectedPdfCommands(report, rows, pageNumber, totalPages) {
  const painter = pdfPainter();
  const { color, rect, text } = painter;
  pageChrome(report, painter, 'VALIDACIONES RECHAZADAS', pageNumber, totalPages);
  if (report.scope === 'municipal') {
    text(27, 507, 'Usá las filas GALENO/SUSS para corregir el Excel original. No se replica el dato personal rechazado.', 7, 'F2', color.navy);
    const columns = [['Cruce', 50], ['GALENO', 90], ['SUSS', 80], ['Motivo', 568]];
    let x = 27;
    columns.forEach(([label, width]) => {
      rect(x, 477, width, 22, color.green, color.line);
      text(x + 7, 485, label, 6, 'F2', color.white);
      x += width;
    });
    rows.forEach((row, index) => {
      const y = 459 - index * 18;
      const fill = index % 2 ? color.soft : color.white;
      const values = [
        String(row.rowNumber), row.galenoRowNumbers.join('|') || '—',
        row.sussRowNumbers.join('|') || '—', `${row.reason} (${row.code})`,
      ];
      x = 27;
      columns.forEach(([, width], columnIndex) => {
        rect(x, y, width, 18, fill, color.line);
        text(x + 7, y + 6, clipped(values[columnIndex], Math.floor(width / 3.2)), 5.6);
        x += width;
      });
    });
    return `${painter.commands.join('\n')}\n`;
  }
  text(27, 507, 'Sólo se informa fila de fuente y código de validación; no se replica el dato personal rechazado.', 7, 'F2', color.navy);
  rect(27, 477, 90, 22, color.green, color.line);
  rect(117, 477, 698, 22, color.green, color.line);
  text(35, 485, 'Fila fuente', 6, 'F2', color.white);
  text(125, 485, 'Código de validación', 6, 'F2', color.white);
  rows.forEach((row, index) => {
    const y = 459 - index * 18;
    const fill = index % 2 ? color.soft : color.white;
    rect(27, y, 90, 18, fill, color.line);
    rect(117, y, 698, 18, fill, color.line);
    text(35, y + 6, String(row.rowNumber), 6);
    text(125, y + 6, row.code, 6);
  });
  return `${painter.commands.join('\n')}\n`;
}

function pdfDocument(report) {
  const pageDescriptors = [{ type: 'summary' }];
  const detailPageSize = 22;
  for (let index = 0; index < report.acceptedRows.length; index += detailPageSize) {
    pageDescriptors.push({ type: 'detail', rows: report.acceptedRows.slice(index, index + detailPageSize) });
  }
  const rejected = report.rejectedRows.flatMap((row) => row.errorCodes.map((code) => ({
    rowNumber: row.rowNumber,
    galenoRowNumbers: row.galenoRowNumbers || [],
    sussRowNumbers: row.sussRowNumbers || [],
    code,
    reason: payrollArtValidationLabel(code),
  })));
  const rejectedPageSize = 22;
  for (let index = 0; index < rejected.length; index += rejectedPageSize) {
    pageDescriptors.push({ type: 'rejected', rows: rejected.slice(index, index + rejectedPageSize) });
  }
  const totalPages = pageDescriptors.length;
  const streams = pageDescriptors.map((descriptor, index) => {
    if (descriptor.type === 'detail') {
      return detailPdfCommands(report, descriptor.rows, index + 1, totalPages);
    }
    if (descriptor.type === 'rejected') {
      return rejectedPdfCommands(report, descriptor.rows, index + 1, totalPages);
    }
    return summaryPdfCommands(report, index + 1, totalPages);
  });

  const pageReferences = pageDescriptors.map((_, index) => 5 + index * 2);
  const infoReference = 5 + totalPages * 2;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageReferences.map((ref) => `${ref} 0 R`).join(' ')}] /Count ${totalPages} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];
  streams.forEach((stream, index) => {
    const pageRef = 5 + index * 2;
    const contentRef = pageRef + 1;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentRef} 0 R >>`);
    const contentBytes = pdfLatinBytes(stream);
    objects.push(joinBytes([
      pdfLatinBytes(`<< /Length ${contentBytes.byteLength} >>\nstream\n`),
      contentBytes,
      pdfLatinBytes('endstream'),
    ]));
  });
  objects.push(`<< /Title (${pdfLiteral(`Reporte ART Provincia ${report.period} - ${scopeLabel(report.scope)}`)}) /Author (MuniControl) /Subject (Documento interno restringido; no constituye presentación oficial ART) /Creator (MuniControl) /Producer (MuniControl) >>`);

  const header = pdfLatinBytes('%PDF-1.4\n%âãÏÓ\n');
  const parts = [header];
  const offsets = [0];
  let offset = header.byteLength;
  objects.forEach((object, index) => {
    offsets.push(offset);
    const body = object instanceof Uint8Array ? object : pdfLatinBytes(object);
    const wrapped = joinBytes([
      pdfLatinBytes(`${index + 1} 0 obj\n`), body, pdfLatinBytes('\nendobj\n'),
    ]);
    parts.push(wrapped);
    offset += wrapped.byteLength;
  });
  const xrefOffset = offset;
  const xref = [`xref\n0 ${objects.length + 1}\n`, '0000000000 65535 f \n'];
  for (const objectOffset of offsets.slice(1)) {
    xref.push(`${String(objectOffset).padStart(10, '0')} 00000 n \n`);
  }
  xref.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${infoReference} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  parts.push(pdfLatinBytes(xref.join('')));
  return joinBytes(parts);
}

async function artifact(report, kind, bytes, cryptoImpl) {
  if (!ARTIFACT_KINDS.has(kind)) fail('ART_EXPORT_KIND_INVALID', 'El formato de exportación no está permitido');
  const extension = kind;
  return Object.freeze({
    contractVersion: PAYROLL_ART_OFFICE_EXPORT_CONTRACT_VERSION,
    reportContractVersion: report.contractVersion,
    reportSha256: report.traceability.reportSha256,
    sourceSha256: report.source.sha256,
    period: report.period,
    scope: report.scope,
    status: report.status,
    readyForReview: report.readyForReview,
    officialSubmissionAllowed: false,
    persistencePerformed: false,
    networkPerformed: false,
    containsPersonalRecords: report.acceptedRows.length > 0,
    classification: 'restricted_personal_payroll_data',
    fileName: `${fileStem(report)}.${extension}`,
    mimeType: kind === 'xlsx' ? MIME_XLSX : MIME_PDF,
    byteLength: bytes.byteLength,
    sha256: await sha256Bytes(bytes, cryptoImpl),
    bytes,
  });
}

export async function createPayrollArtXlsxArtifact(
  report,
  { cryptoImpl = globalThis.crypto } = {},
) {
  const trusted = requireTrustedPayrollArtReport(report);
  return artifact(trusted, 'xlsx', storedZip(workbookEntries(trusted)), cryptoImpl);
}

export async function createPayrollArtPdfArtifact(
  report,
  { cryptoImpl = globalThis.crypto } = {},
) {
  const trusted = requireTrustedPayrollArtReport(report);
  return artifact(trusted, 'pdf', pdfDocument(trusted), cryptoImpl);
}

export async function createPayrollArtOfficePack(
  report,
  { cryptoImpl = globalThis.crypto } = {},
) {
  const trusted = requireTrustedPayrollArtReport(report);
  const [xlsx, pdf] = await Promise.all([
    createPayrollArtXlsxArtifact(trusted, { cryptoImpl }),
    createPayrollArtPdfArtifact(trusted, { cryptoImpl }),
  ]);
  const manifest = new TextEncoder().encode([
    PAYROLL_ART_OFFICE_EXPORT_CONTRACT_VERSION,
    trusted.traceability.reportSha256,
    xlsx.sha256,
    pdf.sha256,
  ].join('\n'));
  return Object.freeze({
    contractVersion: PAYROLL_ART_OFFICE_EXPORT_CONTRACT_VERSION,
    reportSha256: trusted.traceability.reportSha256,
    bundleSha256: await sha256Bytes(manifest, cryptoImpl),
    period: trusted.period,
    scope: trusted.scope,
    status: trusted.status,
    readyForReview: trusted.readyForReview,
    officialSubmissionAllowed: false,
    persistencePerformed: false,
    networkPerformed: false,
    files: Object.freeze([xlsx, pdf]),
  });
}
