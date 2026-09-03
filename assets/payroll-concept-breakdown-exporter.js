export const PAYROLL_CONCEPT_BREAKDOWN_EXPORT_VERSION = 'payroll-concept-breakdown-export.v1';

const SOURCE_VERSION = 'payroll-monthly-grh-summary.v1';
const PARSER_VERSION = 'grh-concept-statistics-pdf-layout.v1';
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOWNLOAD_NAME = /^municontrol_desglose-conceptos_(?:19|20)[0-9]{2}-(?:0[1-9]|1[0-2])_[a-f0-9]{12}\.xlsx$/;
const PERIOD = /^(?:19|20)[0-9]{2}-(?:0[1-9]|1[0-2])$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const INT64 = /^-?(?:0|[1-9][0-9]{0,18})$/;
const NON_NEGATIVE_INT64 = /^(?:0|[1-9][0-9]{0,18})$/;
const POSITIVE_INT32 = /^(?:[1-9][0-9]{0,9})$/;
const MAX_INT64 = 9223372036854775807n;
const MIN_INT64 = -9223372036854775808n;
const MAX_INT32 = 2147483647n;
// Excel conserva 15 digitos significativos. Bloquear montos mayores evita crear
// un libro que aparente exactitud y sea redondeado al abrirlo.
const MAX_XLSX_CENTS = 999999999999999n;
const ROOT_KEYS = new Set([
  'contractVersion', 'parserVersion', 'period', 'status', 'readyForReview',
  'reports', 'crossReport', 'normalizedRepartitionCode',
  'normalizedRepartitionMeaning', 'normalizedOutputIncludesPersonalRecords',
  'acceptedRowsAggregateOnlyVerified', 'rulesInferred', 'provenanceVerified',
  'persistencePerformed', 'payrollCalculated', 'payrollPosted', 'closeApproved',
  'bankAccreditationProven', 'bankArtifactGenerated', 'tribunalArtifactGenerated',
  'fiscalArtifactGenerated',
]);
const REPORT_KEYS = new Set(['kind', 'jurisdiction', 'conceptCount', 'concepts', 'totals', 'source']);
const CONCEPT_KEYS = new Set([
  'conceptCode', 'occurrences', 'quantityHundredths', 'remunerativeCents',
  'nonRemunerativeCents', 'familyAllowancesCents', 'retentionsCents',
  'contributionsCents',
]);
const TOTAL_KEYS = new Set([
  'occurrences', 'quantityHundredths', 'remunerativeCents',
  'nonRemunerativeCents', 'familyAllowancesCents', 'retentionsCents',
  'contributionsCents', 'netCents', 'earningsPlusContributionsCents',
]);
const SOURCE_KEYS = new Set(['sha256', 'byteLength', 'pageCount', 'sourceLayout']);
const CROSS_KEYS = new Set([
  'equation', 'toleranceCents', 'conceptCount', 'componentComparisons',
  'netDifferenceCents', 'matches',
]);
const ARTIFACT_KEYS = new Set([
  'contractVersion', 'sourceContractVersion', 'period', 'generatedAt',
  'fileName', 'mimeType', 'byteLength', 'sheetNames',
  'containsPersonalRecords', 'payrollCalculated', 'payrollPosted',
  'closeApproved', 'bankArtifactGenerated', 'fiscalArtifactGenerated', 'bytes',
]);
const COMPONENTS = Object.freeze([
  'occurrences', 'quantityHundredths', 'remunerativeCents',
  'nonRemunerativeCents', 'familyAllowancesCents', 'retentionsCents',
  'contributionsCents',
]);
const MONEY_COMPONENTS = new Set([
  'remunerativeCents', 'nonRemunerativeCents', 'familyAllowancesCents',
  'retentionsCents', 'contributionsCents',
]);
const SHEET_NAMES = Object.freeze(['Resumen', 'J42', 'J55', 'General', 'Trazabilidad']);
const ARTIFACT_CONTEXTS = new WeakMap();

export class PayrollConceptBreakdownExportError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PayrollConceptBreakdownExportError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new PayrollConceptBreakdownExportError(code, message);
}

function exactObject(value, allowed, code, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) fail(code, message);
  const keys = Object.keys(value);
  if (keys.length !== allowed.size || keys.some((key) => !allowed.has(key))) fail(code, message);
}

function checkedInt64(value, code = 'BREAKDOWN_SOURCE_ARITHMETIC_INVALID') {
  if (value < MIN_INT64 || value > MAX_INT64) fail(code, 'El resumen excede el rango entero admitido');
  return value;
}

function checkedAdd(left, right) {
  return checkedInt64(left + right);
}

function checkedSubtract(left, right) {
  return checkedInt64(left - right);
}

function int64String(value, label, nonNegative = false) {
  const text = String(value);
  if (!(nonNegative ? NON_NEGATIVE_INT64 : INT64).test(text)) {
    fail('BREAKDOWN_SOURCE_CONTRACT_INVALID', `${label} no contiene un entero exacto`);
  }
  const parsed = checkedInt64(BigInt(text));
  if (nonNegative && parsed < 0n) fail('BREAKDOWN_SOURCE_CONTRACT_INVALID', `${label} no admite negativos`);
  return parsed;
}

function positiveInt32String(value, label) {
  const text = String(value);
  if (!POSITIVE_INT32.test(text)) fail('BREAKDOWN_SOURCE_CONTRACT_INVALID', `${label} no contiene un conteo válido`);
  const parsed = BigInt(text);
  if (parsed > MAX_INT32) fail('BREAKDOWN_SOURCE_CONTRACT_INVALID', `${label} excede el máximo permitido`);
  return parsed;
}

function assertExcelMoney(value) {
  if (value < -MAX_XLSX_CENTS || value > MAX_XLSX_CENTS) {
    fail('BREAKDOWN_XLSX_PRECISION_UNSAFE', 'Un importe supera la precisión exacta admitida por Excel');
  }
}

function validateConcept(value, seen) {
  exactObject(value, CONCEPT_KEYS, 'BREAKDOWN_SOURCE_CONTRACT_INVALID', 'Una fila de concepto no cumple el contrato');
  if (!/^[0-9]{1,8}$/.test(value.conceptCode) || seen.has(value.conceptCode)) {
    fail('BREAKDOWN_SOURCE_CONTRACT_INVALID', 'Los conceptos deben ser códigos numéricos únicos');
  }
  seen.add(value.conceptCode);
  const row = { conceptCode: value.conceptCode };
  for (const key of COMPONENTS) {
    row[key] = key === 'occurrences'
      ? positiveInt32String(value[key], `Concepto ${value.conceptCode}`)
      : int64String(value[key], `Concepto ${value.conceptCode}`, key === 'quantityHundredths');
    if (MONEY_COMPONENTS.has(key)) assertExcelMoney(row[key]);
  }
  row.netCents = checkedSubtract(checkedAdd(checkedAdd(
    row.remunerativeCents,
    row.nonRemunerativeCents,
  ), row.familyAllowancesCents), row.retentionsCents);
  row.earningsPlusContributionsCents = checkedAdd(checkedAdd(checkedAdd(
    row.remunerativeCents,
    row.nonRemunerativeCents,
  ), row.familyAllowancesCents), row.contributionsCents);
  assertExcelMoney(row.netCents);
  assertExcelMoney(row.earningsPlusContributionsCents);
  return Object.freeze(row);
}

function validateReport(value, expectedKind, expectedJurisdiction) {
  exactObject(value, REPORT_KEYS, 'BREAKDOWN_SOURCE_CONTRACT_INVALID', 'Un reporte no cumple el contrato');
  if (value.kind !== expectedKind || value.jurisdiction !== expectedJurisdiction
      || !Number.isInteger(value.conceptCount) || value.conceptCount < 1
      || value.conceptCount > 500 || !Array.isArray(value.concepts)
      || value.concepts.length !== value.conceptCount) {
    fail('BREAKDOWN_SOURCE_CONTRACT_INVALID', 'El conjunto de conceptos no coincide con la jurisdicción esperada');
  }
  const seen = new Set();
  const concepts = Object.freeze(value.concepts.map((row) => validateConcept(row, seen)));
  exactObject(value.totals, TOTAL_KEYS, 'BREAKDOWN_SOURCE_CONTRACT_INVALID', 'Los totales no cumplen el contrato');
  const calculated = Object.fromEntries(COMPONENTS.map((key) => [key, 0n]));
  for (const row of concepts) {
    for (const key of COMPONENTS) calculated[key] = checkedAdd(calculated[key], row[key]);
  }
  calculated.netCents = checkedSubtract(checkedAdd(checkedAdd(
    calculated.remunerativeCents,
    calculated.nonRemunerativeCents,
  ), calculated.familyAllowancesCents), calculated.retentionsCents);
  calculated.earningsPlusContributionsCents = checkedAdd(checkedAdd(checkedAdd(
    calculated.remunerativeCents,
    calculated.nonRemunerativeCents,
  ), calculated.familyAllowancesCents), calculated.contributionsCents);
  for (const key of TOTAL_KEYS) {
    const supplied = int64String(value.totals[key], `Total ${key}`, key === 'occurrences' || key === 'quantityHundredths');
    if (supplied !== calculated[key]) fail('BREAKDOWN_SOURCE_ARITHMETIC_INVALID', 'Los totales no coinciden con las filas de conceptos');
    if (key !== 'occurrences' && key !== 'quantityHundredths') assertExcelMoney(supplied);
  }
  exactObject(value.source, SOURCE_KEYS, 'BREAKDOWN_SOURCE_CONTRACT_INVALID', 'La fuente no cumple el contrato');
  if (!SHA256.test(value.source.sha256)
      || !Number.isInteger(value.source.byteLength) || value.source.byteLength < 1 || value.source.byteLength > 524288
      || !Number.isInteger(value.source.pageCount) || value.source.pageCount < 1 || value.source.pageCount > 10
      || value.source.sourceLayout !== 'grh-concept-statistics-aggregate-by-concept') {
    fail('BREAKDOWN_SOURCE_CONTRACT_INVALID', 'La evidencia de fuente no cumple el contrato');
  }
  return Object.freeze({
    kind: value.kind,
    jurisdiction: value.jurisdiction,
    conceptCount: value.conceptCount,
    concepts,
    totals: Object.freeze(calculated),
    source: Object.freeze({ ...value.source }),
  });
}

function validateCrossReport(value, reports) {
  exactObject(value, CROSS_KEYS, 'BREAKDOWN_SOURCE_CONTRACT_INVALID', 'El control cruzado no cumple el contrato');
  const [j42, j55, general] = reports;
  const maps = reports.map((report) => new Map(report.concepts.map((row) => [row.conceptCode, row])));
  const allCodes = [...new Set([...maps[0].keys(), ...maps[1].keys(), ...maps[2].keys()])];
  for (const code of allCodes) {
    const generalRow = maps[2].get(code);
    if (!generalRow) fail('BREAKDOWN_SOURCE_ARITHMETIC_INVALID', 'El reporte General omite un concepto jurisdiccional');
    for (const key of COMPONENTS) {
      const expected = checkedAdd(maps[0].get(code)?.[key] ?? 0n, maps[1].get(code)?.[key] ?? 0n);
      if (generalRow[key] !== expected) fail('BREAKDOWN_SOURCE_ARITHMETIC_INVALID', 'J42 + J55 no coincide con General');
    }
  }
  if (value.equation !== 'jurisdiction_42 + jurisdiction_55 = general'
      || value.toleranceCents !== '0' || value.netDifferenceCents !== '0'
      || value.matches !== true || value.conceptCount !== general.conceptCount
      || value.componentComparisons !== general.conceptCount * COMPONENTS.length
      || checkedAdd(j42.totals.netCents, j55.totals.netCents) !== general.totals.netCents) {
    fail('BREAKDOWN_SOURCE_ARITHMETIC_INVALID', 'La ecuación mensual no conserva una coincidencia exacta');
  }
}

function validateSummary(summary) {
  exactObject(summary, ROOT_KEYS, 'BREAKDOWN_SOURCE_CONTRACT_INVALID', 'El resumen mensual no cumple el contrato cerrado');
  if (summary.contractVersion !== SOURCE_VERSION || summary.parserVersion !== PARSER_VERSION
      || !PERIOD.test(summary.period) || summary.status !== 'matched' || summary.readyForReview !== true
      || summary.normalizedRepartitionCode !== '0'
      || summary.normalizedRepartitionMeaning !== 'todas_las_reparticiones_del_pdf'
      || summary.normalizedOutputIncludesPersonalRecords !== false
      || summary.acceptedRowsAggregateOnlyVerified !== true || summary.rulesInferred !== false
      || summary.provenanceVerified !== false || summary.persistencePerformed !== false
      || summary.payrollCalculated !== false || summary.payrollPosted !== false
      || summary.closeApproved !== false || summary.bankAccreditationProven !== false
      || summary.bankArtifactGenerated !== false || summary.tribunalArtifactGenerated !== false
      || summary.fiscalArtifactGenerated !== false
      || !Array.isArray(summary.reports) || summary.reports.length !== 3) {
    fail('BREAKDOWN_SOURCE_CONTRACT_INVALID', 'El resumen mensual no está habilitado para exportación');
  }
  const reports = Object.freeze([
    validateReport(summary.reports[0], '42', '42'),
    validateReport(summary.reports[1], '55', '55'),
    validateReport(summary.reports[2], 'general', null),
  ]);
  validateCrossReport(summary.crossReport, reports);
  return Object.freeze({
    period: summary.period,
    parserVersion: summary.parserVersion,
    reports,
  });
}

function generatedInstant(value) {
  const text = String(value || '');
  const parsed = new Date(text);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(text)
      || Number.isNaN(parsed.getTime()) || parsed.toISOString() !== text) {
    fail('BREAKDOWN_GENERATED_AT_INVALID', 'La fecha de generación debe ser un instante UTC exacto');
  }
  return text;
}

function xml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function centsDecimal(cents) {
  assertExcelMoney(cents);
  const negative = cents < 0n;
  const digits = String(negative ? -cents : cents).padStart(3, '0');
  return `${negative ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

function hundredthsDecimal(value) {
  const digits = String(value).padStart(3, '0');
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

function inlineCell(ref, value, style = 0) {
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

function numericCell(ref, value, style = 6) {
  return `<c r="${ref}" s="${style}" t="n"><v>${value}</v></c>`;
}

function moneyCell(ref, cents, style = 8) {
  return numericCell(ref, centsDecimal(cents), style);
}

function formulaCell(ref, formula, cachedValue, style = 8) {
  return `<c r="${ref}" s="${style}"><f>${xml(formula)}</f><v>${cachedValue}</v></c>`;
}

function reportLabel(report) {
  return report.kind === 'general' ? 'General' : `J${report.kind}`;
}

function reportSheetXml(context, report) {
  const firstDataRow = 7;
  const lastDataRow = firstDataRow + report.concepts.length - 1;
  const totalRow = lastDataRow + 1;
  const noteRow = totalRow + 3;
  const dataRows = report.concepts.map((row, index) => {
    const number = firstDataRow + index;
    return `<row r="${number}">${[
      inlineCell(`A${number}`, row.conceptCode, 5),
      numericCell(`B${number}`, row.occurrences.toString(), 6),
      numericCell(`C${number}`, hundredthsDecimal(row.quantityHundredths), 7),
      moneyCell(`D${number}`, row.remunerativeCents),
      moneyCell(`E${number}`, row.nonRemunerativeCents),
      moneyCell(`F${number}`, row.familyAllowancesCents),
      moneyCell(`G${number}`, row.retentionsCents),
      moneyCell(`H${number}`, row.contributionsCents),
      formulaCell(`I${number}`, `D${number}+E${number}+F${number}-G${number}`, centsDecimal(row.netCents)),
      formulaCell(`J${number}`, `D${number}+E${number}+F${number}+H${number}`, centsDecimal(row.earningsPlusContributionsCents)),
    ].join('')}</row>`;
  }).join('');
  const totals = report.totals;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:J${noteRow + 4}"/>
  <sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="6" topLeftCell="A7" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="17"/>
  <cols><col min="1" max="1" width="14" customWidth="1"/><col min="2" max="3" width="15" customWidth="1"/><col min="4" max="10" width="22" customWidth="1"/></cols>
  <sheetData>
    <row r="1" ht="30" customHeight="1">${inlineCell('A1', `MuniControl · Desglose mensual ${reportLabel(report)}`, 1)}</row>
    <row r="2" ht="24" customHeight="1">${inlineCell('A2', 'Control agregado local · no constituye cierre, acreditación bancaria ni presentación fiscal', 2)}</row>
    <row r="4">${inlineCell('A4', 'Período', 3)}${inlineCell('B4', context.period, 5)}${inlineCell('D4', 'Jurisdicción', 3)}${inlineCell('E4', reportLabel(report), 5)}</row>
    <row r="6" ht="36" customHeight="1">${[
      'Concepto', 'Ocurrencias', 'Cantidad', 'Haberes remunerativos',
      'Haberes no remunerativos', 'Asignaciones familiares', 'Retenciones',
      'Contribuciones', 'Neto técnico', 'Haberes + contribuciones',
    ].map((value, index) => inlineCell(`${String.fromCharCode(65 + index)}6`, value, 4)).join('')}</row>
    ${dataRows}
    <row r="${totalRow}" ht="24" customHeight="1">${[
      inlineCell(`A${totalRow}`, 'TOTAL', 9),
      formulaCell(`B${totalRow}`, `SUM(B${firstDataRow}:B${lastDataRow})`, totals.occurrences.toString(), 9),
      formulaCell(`C${totalRow}`, `SUM(C${firstDataRow}:C${lastDataRow})`, hundredthsDecimal(totals.quantityHundredths), 11),
      formulaCell(`D${totalRow}`, `SUM(D${firstDataRow}:D${lastDataRow})`, centsDecimal(totals.remunerativeCents), 10),
      formulaCell(`E${totalRow}`, `SUM(E${firstDataRow}:E${lastDataRow})`, centsDecimal(totals.nonRemunerativeCents), 10),
      formulaCell(`F${totalRow}`, `SUM(F${firstDataRow}:F${lastDataRow})`, centsDecimal(totals.familyAllowancesCents), 10),
      formulaCell(`G${totalRow}`, `SUM(G${firstDataRow}:G${lastDataRow})`, centsDecimal(totals.retentionsCents), 10),
      formulaCell(`H${totalRow}`, `SUM(H${firstDataRow}:H${lastDataRow})`, centsDecimal(totals.contributionsCents), 10),
      formulaCell(`I${totalRow}`, `D${totalRow}+E${totalRow}+F${totalRow}-G${totalRow}`, centsDecimal(totals.netCents), 10),
      formulaCell(`J${totalRow}`, `D${totalRow}+E${totalRow}+F${totalRow}+H${totalRow}`, centsDecimal(totals.earningsPlusContributionsCents), 10),
    ].join('')}</row>
    <row r="${noteRow}">${inlineCell(`A${noteRow}`, 'Alcance', 3)}${inlineCell(`B${noteRow}`, 'Importes informados por los PDF GRH del mes y controles aritméticos explícitos.', 12)}</row>
    <row r="${noteRow + 1}">${inlineCell(`A${noteRow + 1}`, 'Repartición', 3)}${inlineCell(`B${noteRow + 1}`, 'Todas las reparticiones del PDF; el código técnico 0 no es una repartición real.', 12)}</row>
    <row r="${noteRow + 2}">${inlineCell(`A${noteRow + 2}`, 'Privacidad', 3)}${inlineCell(`B${noteRow + 2}`, 'Sin nombres, legajos, DNI, CUIL, CBU ni cuentas bancarias.', 12)}</row>
    <row r="${noteRow + 3}">${inlineCell(`A${noteRow + 3}`, 'Fuente', 3)}${inlineCell(`B${noteRow + 3}`, report.source.sha256, 12)}</row>
    <row r="${noteRow + 4}">${inlineCell(`A${noteRow + 4}`, 'Límite', 3)}${inlineCell(`B${noteRow + 4}`, 'La huella identifica bytes locales; no certifica procedencia ni aprobación.', 12)}</row>
  </sheetData>
  <mergeCells count="7"><mergeCell ref="A1:J1"/><mergeCell ref="A2:J2"/><mergeCell ref="B${noteRow}:J${noteRow}"/><mergeCell ref="B${noteRow + 1}:J${noteRow + 1}"/><mergeCell ref="B${noteRow + 2}:J${noteRow + 2}"/><mergeCell ref="B${noteRow + 3}:J${noteRow + 3}"/><mergeCell ref="B${noteRow + 4}:J${noteRow + 4}"/></mergeCells>
  <autoFilter ref="A6:J${lastDataRow}"/>
  <pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
  <pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

function summarySheetXml(context) {
  const rows = context.reports.map((report, index) => {
    const number = 7 + index;
    return `<row r="${number}">${[
      inlineCell(`A${number}`, reportLabel(report), 5),
      numericCell(`B${number}`, String(report.conceptCount), 6),
      numericCell(`C${number}`, report.totals.occurrences.toString(), 6),
      numericCell(`D${number}`, hundredthsDecimal(report.totals.quantityHundredths), 7),
      moneyCell(`E${number}`, report.totals.remunerativeCents),
      moneyCell(`F${number}`, report.totals.nonRemunerativeCents),
      moneyCell(`G${number}`, report.totals.familyAllowancesCents),
      moneyCell(`H${number}`, report.totals.retentionsCents),
      moneyCell(`I${number}`, report.totals.contributionsCents),
      moneyCell(`J${number}`, report.totals.netCents),
      moneyCell(`K${number}`, report.totals.earningsPlusContributionsCents),
    ].join('')}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:K19"/>
  <sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="6" topLeftCell="A7" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="17"/>
  <cols><col min="1" max="1" width="17" customWidth="1"/><col min="2" max="4" width="14" customWidth="1"/><col min="5" max="11" width="22" customWidth="1"/></cols>
  <sheetData>
    <row r="1" ht="32" customHeight="1">${inlineCell('A1', 'MuniControl · Libro mensual de conceptos', 1)}</row>
    <row r="2" ht="24" customHeight="1">${inlineCell('A2', 'Desglose agregado reconciliado entre Jurisdicción 42, Jurisdicción 55 y General', 2)}</row>
    <row r="4">${inlineCell('A4', 'Período', 3)}${inlineCell('B4', context.period, 5)}${inlineCell('D4', 'Estado', 3)}${inlineCell('E4', 'Coincidencia exacta · listo para revisión humana', 13)}</row>
    <row r="6" ht="36" customHeight="1">${[
      'Reporte', 'Conceptos', 'Ocurrencias', 'Cantidad', 'Haberes remunerativos',
      'Haberes no remunerativos', 'Asignaciones familiares', 'Retenciones',
      'Contribuciones', 'Neto técnico', 'Haberes + contribuciones',
    ].map((value, index) => inlineCell(`${String.fromCharCode(65 + index)}6`, value, 4)).join('')}</row>
    ${rows}
    <row r="12">${inlineCell('A12', 'Control cruzado', 3)}${inlineCell('B12', 'J42 + J55 = General por concepto y por siete componentes; tolerancia 0 centavos.', 12)}</row>
    <row r="14">${inlineCell('A14', 'Uso', 3)}${inlineCell('B14', 'Control y desglose mensual agregado.', 12)}</row>
    <row r="15">${inlineCell('A15', 'No acredita', 3)}${inlineCell('B15', 'Cierre de nómina, transferencia bancaria, presentación fiscal ni envío a terceros.', 12)}</row>
    <row r="16">${inlineCell('A16', 'Privacidad', 3)}${inlineCell('B16', 'No contiene filas personales ni datos bancarios.', 12)}</row>
    <row r="18">${inlineCell('A18', 'Contrato fuente', 3)}${inlineCell('B18', SOURCE_VERSION, 5)}</row>
    <row r="19">${inlineCell('A19', 'Parser', 3)}${inlineCell('B19', context.parserVersion, 5)}</row>
  </sheetData>
  <mergeCells count="7"><mergeCell ref="A1:K1"/><mergeCell ref="A2:K2"/><mergeCell ref="E4:K4"/><mergeCell ref="B12:K12"/><mergeCell ref="B14:K14"/><mergeCell ref="B15:K15"/><mergeCell ref="B16:K16"/></mergeCells>
  <autoFilter ref="A6:K9"/>
  <pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
  <pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="1"/>
</worksheet>`;
}

function traceSheetXml(context) {
  const sourceRows = context.reports.map((report, index) => {
    const number = 6 + index;
    return `<row r="${number}">${inlineCell(`A${number}`, reportLabel(report), 5)}${inlineCell(`B${number}`, report.source.sha256, 12)}${numericCell(`C${number}`, String(report.source.byteLength), 6)}${numericCell(`D${number}`, String(report.source.pageCount), 6)}${inlineCell(`E${number}`, report.source.sourceLayout, 12)}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:E20"/>
  <sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="17"/>
  <cols><col min="1" max="1" width="18" customWidth="1"/><col min="2" max="2" width="78" customWidth="1"/><col min="3" max="4" width="16" customWidth="1"/><col min="5" max="5" width="52" customWidth="1"/></cols>
  <sheetData>
    <row r="1" ht="30" customHeight="1">${inlineCell('A1', 'MuniControl · Trazabilidad del desglose', 1)}</row>
    <row r="3">${inlineCell('A3', 'Período de las fuentes', 3)}${inlineCell('B3', context.period, 5)}</row>
    <row r="4">${inlineCell('A4', 'Contrato de salida', 3)}${inlineCell('B4', PAYROLL_CONCEPT_BREAKDOWN_EXPORT_VERSION, 5)}${inlineCell('D4', 'Contrato fuente', 3)}${inlineCell('E4', SOURCE_VERSION, 5)}</row>
    <row r="5" ht="28" customHeight="1">${['Reporte', 'SHA-256 de fuente', 'Bytes', 'Páginas', 'Diseño reconocido'].map((value, index) => inlineCell(`${String.fromCharCode(65 + index)}5`, value, 4)).join('')}</row>
    ${sourceRows}
    <row r="11">${inlineCell('A11', 'Procedencia', 3)}${inlineCell('B11', 'Declarada por el operador; no verificada por el servidor.', 12)}</row>
    <row r="12">${inlineCell('A12', 'Persistencia', 3)}${inlineCell('B12', 'No se guardaron PDF, filas ni resultados en navegador, GRH o PostgreSQL.', 12)}</row>
    <row r="13">${inlineCell('A13', 'Cálculo', 3)}${inlineCell('B13', 'Sólo sumas y controles técnicos visibles; no calcula remuneraciones.', 12)}</row>
    <row r="14">${inlineCell('A14', 'Privacidad', 3)}${inlineCell('B14', 'Salida agregada, sin nombres, documentos, legajos ni cuentas.', 12)}</row>
    <row r="16">${inlineCell('A16', 'Advertencia', 11)}${inlineCell('B16', 'Documento de trabajo. Requiere revisión humana antes de cualquier decisión.', 11)}</row>
  </sheetData>
  <mergeCells count="6"><mergeCell ref="A1:E1"/><mergeCell ref="B3:E3"/><mergeCell ref="B11:E11"/><mergeCell ref="B12:E12"/><mergeCell ref="B13:E13"/><mergeCell ref="B14:E14"/></mergeCells>
  <pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
  <pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="1"/>
</worksheet>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00;[Red]-&quot;$&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="#,##0.00"/></numFmts>
  <fonts count="4"><font><sz val="11"/><name val="Aptos"/><family val="2"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="18"/><name val="Aptos Display"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FF123247"/><sz val="11"/><name val="Aptos"/></font></fonts>
  <fills count="7"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF123247"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF137C72"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF5F1"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF2D8"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F5F4"/></patternFill></fill></fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD7DFDC"/></left><right style="thin"><color rgb="FFD7DFDC"/></right><top style="thin"><color rgb="FFD7DFDC"/></top><bottom style="thin"><color rgb="FFD7DFDC"/></bottom><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="14">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="164" fontId="3" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="165" fontId="3" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" wrapText="1"/></xf>
  </cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function workbookEntries(context) {
  const sheets = [
    ['Resumen', summarySheetXml(context)],
    ['J42', reportSheetXml(context, context.reports[0])],
    ['J55', reportSheetXml(context, context.reports[1])],
    ['General', reportSheetXml(context, context.reports[2])],
    ['Trazabilidad', traceSheetXml(context)],
  ];
  const overrides = sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  const sheetTags = sheets.map(([name], index) => `<sheet name="${xml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('');
  const rels = sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('');
  return [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>'],
    ['docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>MuniControl</Application><Company>Municipalidad de Junín</Company><AppVersion>1.0</AppVersion><TitlesOfParts><vt:vector size="${sheets.length}" baseType="lpstr">${sheets.map(([name]) => `<vt:lpstr>${xml(name)}</vt:lpstr>`).join('')}</vt:vector></TitlesOfParts></Properties>`],
    ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Desglose mensual de conceptos ${xml(context.period)}</dc:title><dc:creator>MuniControl</dc:creator><dc:description>Control agregado local, no oficial</dc:description></cp:coreProperties>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><fileVersion appName="xl"/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews><sheets>${sheetTags}</sheets><calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', stylesXml()],
    ...sheets.map(([, content], index) => [`xl/worksheets/sheet${index + 1}.xml`, content]),
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
    const checksum = crc32(data);
    const localHeader = new Uint8Array(30);
    const localView = new DataView(localHeader.buffer);
    set32(localView, 0, 0x04034b50); set16(localView, 4, 20); set16(localView, 6, 0x0800);
    set16(localView, 8, 0); set16(localView, 10, 0); set16(localView, 12, 0x0021);
    set32(localView, 14, checksum); set32(localView, 18, data.byteLength); set32(localView, 22, data.byteLength);
    set16(localView, 26, nameBytes.byteLength); set16(localView, 28, 0);
    local.push(localHeader, nameBytes, data);

    const centralHeader = new Uint8Array(46);
    const centralView = new DataView(centralHeader.buffer);
    set32(centralView, 0, 0x02014b50); set16(centralView, 4, 20); set16(centralView, 6, 20);
    set16(centralView, 8, 0x0800); set16(centralView, 10, 0); set16(centralView, 12, 0); set16(centralView, 14, 0x0021);
    set32(centralView, 16, checksum); set32(centralView, 20, data.byteLength); set32(centralView, 24, data.byteLength);
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

export function createPayrollConceptBreakdownXlsx(summary, options = {}) {
  const source = validateSummary(summary);
  const generatedAt = generatedInstant(options.generatedAt ?? new Date().toISOString());
  const bytes = storedZip(workbookEntries(source));
  const fingerprint = source.reports[2].source.sha256.slice(7, 19);
  const artifact = Object.freeze({
    contractVersion: PAYROLL_CONCEPT_BREAKDOWN_EXPORT_VERSION,
    sourceContractVersion: SOURCE_VERSION,
    period: source.period,
    generatedAt,
    fileName: `municontrol_desglose-conceptos_${source.period}_${fingerprint}.xlsx`,
    mimeType: MIME_XLSX,
    byteLength: bytes.byteLength,
    sheetNames: SHEET_NAMES,
    containsPersonalRecords: false,
    payrollCalculated: false,
    payrollPosted: false,
    closeApproved: false,
    bankArtifactGenerated: false,
    fiscalArtifactGenerated: false,
    bytes,
  });
  ARTIFACT_CONTEXTS.set(artifact, Object.freeze({ crc32: crc32(bytes) }));
  return artifact;
}

export function downloadPayrollConceptBreakdownArtifact(artifact, options = {}) {
  exactObject(artifact, ARTIFACT_KEYS, 'BREAKDOWN_ARTIFACT_INVALID', 'El archivo generado no cumple el contrato de descarga');
  const context = ARTIFACT_CONTEXTS.get(artifact);
  if (!context || !Object.isFrozen(artifact)
      || artifact.contractVersion !== PAYROLL_CONCEPT_BREAKDOWN_EXPORT_VERSION
      || artifact.sourceContractVersion !== SOURCE_VERSION || !PERIOD.test(artifact.period)
      || !DOWNLOAD_NAME.test(artifact.fileName) || artifact.mimeType !== MIME_XLSX
      || !(artifact.bytes instanceof Uint8Array) || artifact.byteLength !== artifact.bytes.byteLength
      || artifact.bytes.byteLength < 4 || artifact.bytes[0] !== 0x50 || artifact.bytes[1] !== 0x4b
      || artifact.containsPersonalRecords !== false || artifact.payrollCalculated !== false
      || artifact.payrollPosted !== false || artifact.closeApproved !== false
      || artifact.bankArtifactGenerated !== false || artifact.fiscalArtifactGenerated !== false
      || artifact.sheetNames !== SHEET_NAMES || context.crc32 !== crc32(artifact.bytes)) {
    fail('BREAKDOWN_ARTIFACT_INVALID', 'El archivo generado no cumple el contrato de descarga');
  }
  const documentImpl = options.documentImpl ?? document;
  const urlApi = options.urlApi ?? URL;
  const BlobImpl = options.BlobImpl ?? Blob;
  const blob = new BlobImpl([artifact.bytes], { type: artifact.mimeType });
  const url = urlApi.createObjectURL(blob);
  const link = documentImpl.createElement('a');
  link.hidden = true;
  link.href = url;
  link.download = artifact.fileName;
  try {
    documentImpl.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    urlApi.revokeObjectURL(url);
  }
  return artifact.fileName;
}
