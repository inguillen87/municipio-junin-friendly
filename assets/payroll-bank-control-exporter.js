export const PAYROLL_BANK_CONTROL_EXPORT_VERSION = 'payroll-bank-control-export.v1';

const SOURCE_VERSION = 'payroll-bank-control-xlsx.v1';
const SOURCE_EXPORT_VERSION = 'bank-accreditation-summary.v1';
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PERIOD = /^(?:19|20)[0-9]{2}-(?:0[1-9]|1[0-2])$/;
const NON_NEGATIVE_INTEGER = /^(?:0|[1-9][0-9]*)$/;
const MAX_INT64 = 9223372036854775807n;
const MAX_XLSX_CENTS = 999999999999999n;
const SHEET_NAMES = Object.freeze(['Resumen', 'Por repartición']);
const BANK_SCOPES = Object.freeze({
  all: Object.freeze({ code: null, label: 'Todos los bancos y transferencias', slug: 'todos' }),
  credicoop: Object.freeze({ code: '191', label: 'Credicoop', slug: 'credicoop' }),
  santander: Object.freeze({ code: '72', label: 'Santander', slug: 'santander' }),
  nacion: Object.freeze({ code: '11', label: 'Nación', slug: 'nacion' }),
  transferencias: Object.freeze({ code: '0', label: 'Transferencias especiales', slug: 'transferencias' }),
});
const BANK_BY_CODE = Object.freeze({
  0: Object.freeze({ key: 'transferencias', label: 'Transferencias especiales' }),
  11: Object.freeze({ key: 'nacion', label: 'Nación' }),
  72: Object.freeze({ key: 'santander', label: 'Santander' }),
  191: Object.freeze({ key: 'credicoop', label: 'Credicoop' }),
});
const EXPECTED_SHEETS = Object.freeze({
  'credicoop-42': Object.freeze({ jurisdiction: '42', bankCode: '191' }),
  'credicoop-55': Object.freeze({ jurisdiction: '55', bankCode: '191' }),
  'santander-42': Object.freeze({ jurisdiction: '42', bankCode: '72' }),
  'santander-55': Object.freeze({ jurisdiction: '55', bankCode: '72' }),
  'transferencias-funcionarios': Object.freeze({ jurisdiction: null, bankCode: '0' }),
  'transferencias-varias': Object.freeze({ jurisdiction: null, bankCode: '0' }),
  'nacion-42': Object.freeze({ jurisdiction: '42', bankCode: '11' }),
  'nacion-55': Object.freeze({ jurisdiction: '55', bankCode: '11' }),
});
const ACCOUNT_LABELS = Object.freeze({
  cuenta_corriente: 'Cuenta corriente',
  caja_ahorro: 'Caja de ahorro',
  transferencia_especial: 'Transferencia especial',
});
const CONTROL_KEYS = new Set([
  'contractVersion', 'exportContractVersion', 'repartitionRosterVersion', 'period',
  'status', 'readyToExport', 'total', 'jurisdictions', 'groups', 'sheets', 'source',
  'processedLocally', 'persistencePerformed', 'rawRowsReturned',
  'personalColumnsDiscardedBeforeResult', 'bankInstructionGenerated',
  'bankAccreditationPerformed', 'payrollCalculated', 'closeApproved',
]);
const TOTAL_KEYS = new Set(['operations', 'netCents']);
const JURISDICTION_KEYS = new Set(['jurisdiction', 'operations', 'netCents']);
const GROUP_KEYS = new Set([
  'jurisdiction', 'repartitionCode', 'bankCode', 'bankLabel', 'accountType',
  'operations', 'netCents',
]);
const SHEET_KEYS = new Set([
  'sheetKey', 'jurisdiction', 'bankCode', 'operations', 'netCents', 'headerBlocks',
]);
const SOURCE_KEYS = new Set([
  'byteLength', 'worksheetCount', 'actualXmlRowsVisited', 'headerBlockCount',
  'worksheetDimensionTrusted', 'cachedCellValuesUsed', 'formulasExecuted',
  'externalLinksFollowed',
]);
const ARTIFACT_KEYS = new Set([
  'contractVersion', 'sourceContractVersion', 'period', 'jurisdiction', 'bankScope',
  'generatedAt', 'fileName', 'mimeType', 'byteLength', 'sheetNames',
  'containsPersonalRecords', 'controlOnly', 'bankScopeProven',
  'bankInstructionGenerated', 'bankAccreditationPerformed', 'bytes',
]);
const ARTIFACT_CONTEXTS = new WeakMap();

export class PayrollBankControlExportError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PayrollBankControlExportError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new PayrollBankControlExportError(code, message);
}

function exactObject(value, allowed, code, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype) fail(code, message);
  const keys = Object.keys(value);
  if (keys.length !== allowed.size || keys.some((key) => !allowed.has(key))) fail(code, message);
}

function checkedNonNegativeInt(value, label, { positive = false } = {}) {
  const text = String(value);
  if (!NON_NEGATIVE_INTEGER.test(text)) {
    fail('BANK_CONTROL_EXPORT_SOURCE_INVALID', `${label} no contiene un entero exacto`);
  }
  const parsed = BigInt(text);
  if (parsed > MAX_INT64 || (positive && parsed <= 0n)) {
    fail('BANK_CONTROL_EXPORT_SOURCE_INVALID', `${label} queda fuera del rango admitido`);
  }
  return parsed;
}

function checkedAdd(left, right) {
  const value = left + right;
  if (value < 0n || value > MAX_INT64) {
    fail('BANK_CONTROL_EXPORT_SOURCE_INVALID', 'Los totales exceden el rango entero admitido');
  }
  return value;
}

function checkedCount(value, label) {
  if (!Number.isInteger(value) || value <= 0 || value > 60_000) {
    fail('BANK_CONTROL_EXPORT_SOURCE_INVALID', `${label} no contiene un conteo válido`);
  }
  return value;
}

function validateTotal(value, label, allowedKeys = TOTAL_KEYS) {
  exactObject(value, allowedKeys, 'BANK_CONTROL_EXPORT_SOURCE_INVALID', `${label} no cumple el contrato`);
  return Object.freeze({
    operations: checkedCount(value.operations, `${label}.operations`),
    netCents: checkedNonNegativeInt(value.netCents, `${label}.netCents`, { positive: true }),
  });
}

function validateControl(control) {
  exactObject(
    control, CONTROL_KEYS, 'BANK_CONTROL_EXPORT_SOURCE_INVALID',
    'El control bancario no cumple el contrato cerrado',
  );
  if (control.contractVersion !== SOURCE_VERSION
      || control.exportContractVersion !== SOURCE_EXPORT_VERSION
      || typeof control.repartitionRosterVersion !== 'string'
      || control.repartitionRosterVersion.length < 1 || control.repartitionRosterVersion.length > 120
      || !PERIOD.test(control.period) || control.status !== 'valid'
      || control.readyToExport !== true || control.processedLocally !== true
      || control.persistencePerformed !== false || control.rawRowsReturned !== false
      || control.personalColumnsDiscardedBeforeResult !== true
      || control.bankInstructionGenerated !== false
      || control.bankAccreditationPerformed !== false || control.payrollCalculated !== false
      || control.closeApproved !== false) {
    fail('BANK_CONTROL_EXPORT_SOURCE_INVALID', 'El control no está habilitado para un Excel local');
  }

  const suppliedTotal = validateTotal(control.total, 'Total');
  if (!Array.isArray(control.jurisdictions) || control.jurisdictions.length !== 2
      || !Array.isArray(control.groups) || control.groups.length < 1 || control.groups.length > 5_000
      || !Array.isArray(control.sheets) || control.sheets.length !== 8) {
    fail('BANK_CONTROL_EXPORT_SOURCE_INVALID', 'El control no contiene las jurisdicciones y hojas esperadas');
  }

  const jurisdictionTotals = new Map();
  for (const entry of control.jurisdictions) {
    exactObject(
      entry, JURISDICTION_KEYS, 'BANK_CONTROL_EXPORT_SOURCE_INVALID',
      'Una jurisdicción no cumple el contrato',
    );
    if (!['42', '55'].includes(entry.jurisdiction) || jurisdictionTotals.has(entry.jurisdiction)) {
      fail('BANK_CONTROL_EXPORT_SOURCE_INVALID', 'Las jurisdicciones deben ser J42 y J55 sin duplicados');
    }
    jurisdictionTotals.set(
      entry.jurisdiction,
      validateTotal(entry, `J${entry.jurisdiction}`, JURISDICTION_KEYS),
    );
  }
  if (!jurisdictionTotals.has('42') || !jurisdictionTotals.has('55')) {
    fail('BANK_CONTROL_EXPORT_SOURCE_INVALID', 'Falta una de las dos jurisdicciones');
  }

  const groups = [];
  const seen = new Set();
  const calculatedByJurisdiction = new Map([
    ['42', { operations: 0, netCents: 0n }],
    ['55', { operations: 0, netCents: 0n }],
  ]);
  for (const group of control.groups) {
    exactObject(
      group, GROUP_KEYS, 'BANK_CONTROL_EXPORT_SOURCE_INVALID',
      'Una fila agregada no cumple el contrato',
    );
    const bank = BANK_BY_CODE[group.bankCode];
    const key = [group.jurisdiction, group.repartitionCode, group.bankCode, group.accountType].join('|');
    const accountTypeValid = Object.hasOwn(ACCOUNT_LABELS, group.accountType)
      && (group.bankCode === '0') === (group.accountType === 'transferencia_especial');
    if (!['42', '55'].includes(group.jurisdiction)
        || !/^\d{2}$/.test(group.repartitionCode) || !bank
        || group.bankLabel !== bank.label || !accountTypeValid || seen.has(key)) {
      fail('BANK_CONTROL_EXPORT_SOURCE_INVALID', 'Una fila agregada contiene una clasificación inválida');
    }
    seen.add(key);
    const operations = checkedCount(group.operations, 'Operaciones por repartición');
    const netCents = checkedNonNegativeInt(group.netCents, 'Neto por repartición', { positive: true });
    if (netCents > MAX_XLSX_CENTS) {
      fail(
        'BANK_CONTROL_EXPORT_XLSX_PRECISION_UNSAFE',
        'Un importe supera la precisión exacta admitida por Excel',
      );
    }
    const current = calculatedByJurisdiction.get(group.jurisdiction);
    current.operations += operations;
    current.netCents = checkedAdd(current.netCents, netCents);
    groups.push(Object.freeze({
      jurisdiction: group.jurisdiction,
      repartitionCode: group.repartitionCode,
      bankCode: group.bankCode,
      bankKey: bank.key,
      bankLabel: bank.label,
      accountType: group.accountType,
      operations,
      netCents,
    }));
  }

  let calculatedOperations = 0;
  let calculatedNetCents = 0n;
  for (const jurisdiction of ['42', '55']) {
    const calculated = calculatedByJurisdiction.get(jurisdiction);
    const supplied = jurisdictionTotals.get(jurisdiction);
    if (calculated.operations !== supplied.operations || calculated.netCents !== supplied.netCents) {
      fail('BANK_CONTROL_EXPORT_SOURCE_INVALID', 'Los totales jurisdiccionales no coinciden con las filas');
    }
    calculatedOperations += calculated.operations;
    calculatedNetCents = checkedAdd(calculatedNetCents, calculated.netCents);
  }
  if (calculatedOperations !== suppliedTotal.operations || calculatedNetCents !== suppliedTotal.netCents) {
    fail('BANK_CONTROL_EXPORT_SOURCE_INVALID', 'El total general no coincide con las filas');
  }

  const sheets = new Map();
  for (const sheet of control.sheets) {
    exactObject(
      sheet, SHEET_KEYS, 'BANK_CONTROL_EXPORT_SOURCE_INVALID',
      'Una hoja resumida no cumple el contrato',
    );
    const expected = EXPECTED_SHEETS[sheet.sheetKey];
    if (!expected || sheets.has(sheet.sheetKey)
        || sheet.jurisdiction !== expected.jurisdiction || sheet.bankCode !== expected.bankCode
        || !Number.isInteger(sheet.headerBlocks) || sheet.headerBlocks < 1
        || sheet.headerBlocks > 100) {
      fail('BANK_CONTROL_EXPORT_SOURCE_INVALID', 'Una hoja resumida contiene datos inválidos');
    }
    sheets.set(sheet.sheetKey, Object.freeze({
      ...expected,
      operations: checkedCount(sheet.operations, 'Operaciones de hoja'),
      netCents: checkedNonNegativeInt(sheet.netCents, 'Neto de hoja', { positive: true }),
    }));
  }
  if (sheets.size !== Object.keys(EXPECTED_SHEETS).length) {
    fail('BANK_CONTROL_EXPORT_SOURCE_INVALID', 'Falta una de las ocho hojas bancarias esperadas');
  }
  const summarizeGroups = (predicate) => {
    let operations = 0;
    let netCents = 0n;
    for (const group of groups.filter(predicate)) {
      operations += group.operations;
      netCents = checkedAdd(netCents, group.netCents);
    }
    return { operations, netCents };
  };
  for (const [sheetKey, sheet] of sheets) {
    if (sheet.bankCode === '0') continue;
    const calculated = summarizeGroups((group) => (
      group.bankCode === sheet.bankCode && group.jurisdiction === sheet.jurisdiction
    ));
    if (calculated.operations !== sheet.operations || calculated.netCents !== sheet.netCents) {
      fail(
        'BANK_CONTROL_EXPORT_SOURCE_INVALID',
        `La clasificación agregada no coincide con la hoja ${sheetKey}`,
      );
    }
  }
  const transferSheets = ['transferencias-funcionarios', 'transferencias-varias']
    .map((sheetKey) => sheets.get(sheetKey));
  const transferCalculated = summarizeGroups((group) => group.bankCode === '0');
  const transferOperations = transferSheets.reduce((sum, sheet) => sum + sheet.operations, 0);
  const transferNetCents = transferSheets.reduce(
    (sum, sheet) => checkedAdd(sum, sheet.netCents), 0n,
  );
  if (transferCalculated.operations !== transferOperations
      || transferCalculated.netCents !== transferNetCents) {
    fail(
      'BANK_CONTROL_EXPORT_SOURCE_INVALID',
      'Las transferencias agregadas no coinciden con las dos hojas de origen',
    );
  }
  exactObject(
    control.source, SOURCE_KEYS, 'BANK_CONTROL_EXPORT_SOURCE_INVALID',
    'La fuente local no cumple el contrato',
  );
  if (!Number.isInteger(control.source.byteLength) || control.source.byteLength < 1
      || control.source.byteLength > 2 * 1024 * 1024
      || control.source.worksheetCount !== 8
      || !Number.isInteger(control.source.actualXmlRowsVisited)
      || control.source.actualXmlRowsVisited < 1 || control.source.actualXmlRowsVisited > 60_000
      || !Number.isInteger(control.source.headerBlockCount)
      || control.source.headerBlockCount < 8 || control.source.headerBlockCount > 800
      || control.source.worksheetDimensionTrusted !== false
      || control.source.cachedCellValuesUsed !== true
      || control.source.formulasExecuted !== false
      || control.source.externalLinksFollowed !== false) {
    fail('BANK_CONTROL_EXPORT_SOURCE_INVALID', 'La fuente local no conserva los límites esperados');
  }

  return Object.freeze({
    period: control.period,
    repartitionRosterVersion: control.repartitionRosterVersion,
    source: Object.freeze({ ...control.source }),
    groups: Object.freeze(groups),
  });
}

function generatedInstant(value) {
  const text = String(value || '');
  const parsed = new Date(text);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(text)
      || Number.isNaN(parsed.getTime()) || parsed.toISOString() !== text) {
    fail('BANK_CONTROL_EXPORT_GENERATED_AT_INVALID', 'La fecha de generación debe ser un instante UTC exacto');
  }
  return text;
}

function validateScope(options) {
  const jurisdiction = String(options.jurisdiction ?? '');
  const bankScope = String(options.bankScope ?? 'all');
  if (!['42', '55'].includes(jurisdiction) || !Object.hasOwn(BANK_SCOPES, bankScope)) {
    fail('BANK_CONTROL_EXPORT_SCOPE_INVALID', 'Elegí una jurisdicción y un alcance bancario válidos');
  }
  return Object.freeze({ jurisdiction, bankScope, bank: BANK_SCOPES[bankScope] });
}

function buildContext(control, options) {
  const source = validateControl(control);
  const scope = validateScope(options);
  const rows = source.groups.filter((row) => (
    row.jurisdiction === scope.jurisdiction
      && (scope.bank.code === null || row.bankCode === scope.bank.code)
  ));
  if (rows.length < 1) {
    fail('BANK_CONTROL_EXPORT_SCOPE_EMPTY', 'La planilla no contiene filas para el alcance elegido');
  }
  let operations = 0;
  let netCents = 0n;
  const summary = new Map();
  for (const row of rows) {
    operations += row.operations;
    netCents = checkedAdd(netCents, row.netCents);
    const key = `${row.bankCode}|${row.accountType}`;
    const current = summary.get(key) ?? {
      bankCode: row.bankCode,
      bankLabel: row.bankLabel,
      accountType: row.accountType,
      repartitions: new Set(),
      operations: 0,
      netCents: 0n,
    };
    current.repartitions.add(row.repartitionCode);
    current.operations += row.operations;
    current.netCents = checkedAdd(current.netCents, row.netCents);
    summary.set(key, current);
  }
  const bankSummary = [...summary.values()].sort((left, right) => (
    Number(left.bankCode) - Number(right.bankCode)
      || left.accountType.localeCompare(right.accountType)
  )).map((row) => Object.freeze({
    bankCode: row.bankCode,
    bankLabel: row.bankLabel,
    accountType: row.accountType,
    repartitionCount: row.repartitions.size,
    operations: row.operations,
    netCents: row.netCents,
  }));
  return Object.freeze({
    ...source,
    ...scope,
    rows: Object.freeze(rows),
    bankSummary: Object.freeze(bankSummary),
    repartitionCount: new Set(rows.map((row) => row.repartitionCode)).size,
    operations,
    netCents,
  });
}

function xml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function centsDecimal(cents) {
  if (cents < 0n || cents > MAX_XLSX_CENTS) {
    fail('BANK_CONTROL_EXPORT_XLSX_PRECISION_UNSAFE', 'Un importe no puede representarse con exactitud en Excel');
  }
  const digits = String(cents).padStart(3, '0');
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

function inlineCell(ref, value, style = 0) {
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

function numericCell(ref, value, style = 6) {
  return `<c r="${ref}" s="${style}" t="n"><v>${value}</v></c>`;
}

function moneyCell(ref, cents, style = 7) {
  return numericCell(ref, centsDecimal(cents), style);
}

function formulaCell(ref, formula, cachedValue, style = 7) {
  return `<c r="${ref}" s="${style}"><f>${xml(formula)}</f><v>${cachedValue}</v></c>`;
}

function summarySheetXml(context) {
  const firstDataRow = 8;
  const lastDataRow = firstDataRow + context.bankSummary.length - 1;
  const totalRow = lastDataRow + 1;
  const noteRow = totalRow + 3;
  const rows = context.bankSummary.map((row, index) => {
    const number = firstDataRow + index;
    return `<row r="${number}">${[
      inlineCell(`A${number}`, row.bankLabel, 5),
      inlineCell(`B${number}`, ACCOUNT_LABELS[row.accountType], 5),
      numericCell(`C${number}`, String(row.repartitionCount)),
      numericCell(`D${number}`, String(row.operations)),
      moneyCell(`E${number}`, row.netCents),
      inlineCell(`F${number}`, 'Recalculado desde planilla', 10),
    ].join('')}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:F${noteRow + 4}"/>
  <sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="7" topLeftCell="A8" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols><col min="1" max="2" width="26" customWidth="1"/><col min="3" max="4" width="16" customWidth="1"/><col min="5" max="5" width="21" customWidth="1"/><col min="6" max="6" width="29" customWidth="1"/></cols>
  <sheetData>
    <row r="1" ht="30" customHeight="1">${inlineCell('A1', 'Control bancario mensual', 1)}</row>
    <row r="2" ht="26" customHeight="1">${inlineCell('A2', 'Resumen agregado de control. No acredita haberes ni genera instrucciones bancarias.', 2)}</row>
    <row r="4">${inlineCell('A4', 'Período', 3)}${inlineCell('B4', context.period, 5)}${inlineCell('D4', 'Jurisdicción', 3)}${inlineCell('E4', `J${context.jurisdiction}`, 5)}</row>
    <row r="5">${inlineCell('A5', 'Alcance', 3)}${inlineCell('B5', context.bank.label, 5)}${inlineCell('D5', 'Operaciones', 3)}${numericCell('E5', String(context.operations))}</row>
    <row r="6">${inlineCell('A6', 'Neto de control', 3)}${moneyCell('B6', context.netCents, 8)}${inlineCell('D6', 'Estado', 3)}${inlineCell('E6', 'Recalculado', 10)}</row>
    <row r="7" ht="34" customHeight="1">${[
      'Banco', 'Tipo de cuenta declarado', 'Reparticiones por banco', 'Operaciones', 'Neto de control', 'Estado',
    ].map((value, index) => inlineCell(`${String.fromCharCode(65 + index)}7`, value, 4)).join('')}</row>
    ${rows}
    <row r="${totalRow}" ht="24" customHeight="1">${[
      inlineCell(`A${totalRow}`, 'TOTAL', 9), inlineCell(`B${totalRow}`, 'Únicas en alcance', 14),
      numericCell(`C${totalRow}`, String(context.repartitionCount), 9),
      formulaCell(`D${totalRow}`, `SUM(D${firstDataRow}:D${lastDataRow})`, String(context.operations), 9),
      formulaCell(`E${totalRow}`, `SUM(E${firstDataRow}:E${lastDataRow})`, centsDecimal(context.netCents), 11),
      inlineCell(`F${totalRow}`, 'Control local', 14),
    ].join('')}</row>
    <row r="${noteRow}">${inlineCell(`A${noteRow}`, 'Alcance', 3)}${inlineCell(`B${noteRow}`, 'Los bancos se identifican por las ocho hojas mensuales validadas. El tipo de cuenta lo declara quien procesa.', 12)}</row>
    <row r="${noteRow + 1}">${inlineCell(`A${noteRow + 1}`, 'Privacidad', 3)}${inlineCell(`B${noteRow + 1}`, 'Sin nombres, legajos, DNI, CUIL, CBU ni números de cuenta.', 12)}</row>
    <row r="${noteRow + 2}">${inlineCell(`A${noteRow + 2}`, 'Límite', 3)}${inlineCell(`B${noteRow + 2}`, 'Este libro sirve para control contable. No es un archivo de acreditación ni reemplaza la revisión humana.', 12)}</row>
    <row r="${noteRow + 3}">${inlineCell(`A${noteRow + 3}`, 'Procesamiento', 3)}${inlineCell(`B${noteRow + 3}`, 'Realizado localmente en el navegador; no se guardaron filas nominales.', 12)}</row>
    <row r="${noteRow + 4}">${inlineCell(`A${noteRow + 4}`, 'Clasificación', 3)}${inlineCell(`B${noteRow + 4}`, `Reparticiones según ${context.repartitionRosterVersion}.`, 12)}</row>
  </sheetData>
  <mergeCells count="7"><mergeCell ref="A1:F1"/><mergeCell ref="A2:F2"/><mergeCell ref="B${noteRow}:F${noteRow}"/><mergeCell ref="B${noteRow + 1}:F${noteRow + 1}"/><mergeCell ref="B${noteRow + 2}:F${noteRow + 2}"/><mergeCell ref="B${noteRow + 3}:F${noteRow + 3}"/><mergeCell ref="B${noteRow + 4}:F${noteRow + 4}"/></mergeCells>
  <autoFilter ref="A7:F${lastDataRow}"/>
  <pageMargins left="0.35" right="0.35" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
  <pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

function detailSheetXml(context) {
  const firstDataRow = 7;
  const lastDataRow = firstDataRow + context.rows.length - 1;
  const totalRow = lastDataRow + 1;
  const dataRows = context.rows.map((row, index) => {
    const number = firstDataRow + index;
    return `<row r="${number}">${[
      inlineCell(`A${number}`, `J${row.jurisdiction}`, 5),
      inlineCell(`B${number}`, row.repartitionCode, 5),
      inlineCell(`C${number}`, row.bankLabel, 5),
      inlineCell(`D${number}`, ACCOUNT_LABELS[row.accountType], 5),
      numericCell(`E${number}`, String(row.operations)),
      moneyCell(`F${number}`, row.netCents),
      inlineCell(`G${number}`, 'Recalculado', 10),
    ].join('')}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:G${totalRow}"/>
  <sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="6" topLeftCell="A7" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols><col min="1" max="2" width="16" customWidth="1"/><col min="3" max="4" width="25" customWidth="1"/><col min="5" max="6" width="18" customWidth="1"/><col min="7" max="7" width="19" customWidth="1"/></cols>
  <sheetData>
    <row r="1" ht="30" customHeight="1">${inlineCell('A1', `Detalle de control J${context.jurisdiction}`, 1)}</row>
    <row r="2" ht="26" customHeight="1">${inlineCell('A2', `${context.bank.label}. Importes agregados por repartición; sin datos personales ni bancarios nominales.`, 2)}</row>
    <row r="4">${inlineCell('A4', 'Período', 3)}${inlineCell('B4', context.period, 5)}${inlineCell('D4', 'Filas agregadas', 3)}${numericCell('E4', String(context.rows.length))}</row>
    <row r="5">${inlineCell('A5', 'Uso', 3)}${inlineCell('B5', 'Control contable', 5)}${inlineCell('D5', 'Acreditación', 3)}${inlineCell('E5', 'No generada', 13)}</row>
    <row r="6" ht="34" customHeight="1">${[
      'Jurisdicción', 'Repartición', 'Banco', 'Tipo declarado', 'Operaciones', 'Neto de control', 'Estado',
    ].map((value, index) => inlineCell(`${String.fromCharCode(65 + index)}6`, value, 4)).join('')}</row>
    ${dataRows}
    <row r="${totalRow}" ht="24" customHeight="1">${[
      inlineCell(`A${totalRow}`, 'TOTAL', 9), inlineCell(`B${totalRow}`, '', 9),
      inlineCell(`C${totalRow}`, '', 9), inlineCell(`D${totalRow}`, '', 9),
      formulaCell(`E${totalRow}`, `SUM(E${firstDataRow}:E${lastDataRow})`, String(context.operations), 9),
      formulaCell(`F${totalRow}`, `SUM(F${firstDataRow}:F${lastDataRow})`, centsDecimal(context.netCents), 11),
      inlineCell(`G${totalRow}`, 'Control local', 14),
    ].join('')}</row>
  </sheetData>
  <mergeCells count="2"><mergeCell ref="A1:G1"/><mergeCell ref="A2:G2"/></mergeCells>
  <autoFilter ref="A6:G${lastDataRow}"/>
  <pageMargins left="0.35" right="0.35" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
  <pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>
  <fonts count="5">
    <font><sz val="10"/><name val="Arial"/><color rgb="FF17354A"/></font>
    <font><b/><sz val="18"/><name val="Arial"/><color rgb="FF0C344C"/></font>
    <font><sz val="10"/><name val="Arial"/><color rgb="FF536B78"/></font>
    <font><b/><sz val="10"/><name val="Arial"/><color rgb="FFFFFFFF"/></font>
    <font><b/><sz val="10"/><name val="Arial"/><color rgb="FF17354A"/></font>
  </fonts>
  <fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0C344C"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF4F2"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF4DF"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFD7E0E1"/></bottom><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="15">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment horizontal="left"/></xf>
    <xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="164" fontId="1" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
    <xf numFmtId="164" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
    <xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function workbookEntries(context) {
  const sheets = [
    ['Resumen', summarySheetXml(context)],
    ['Por repartición', detailSheetXml(context)],
  ];
  const overrides = sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  const sheetTags = sheets.map(([name], index) => `<sheet name="${xml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('');
  const relationships = sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('');
  return [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>'],
    ['docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>MuniControl</Application><Company>Municipalidad de Junín</Company><AppVersion>1.0</AppVersion><TitlesOfParts><vt:vector size="${sheets.length}" baseType="lpstr">${sheets.map(([name]) => `<vt:lpstr>${xml(name)}</vt:lpstr>`).join('')}</vt:vector></TitlesOfParts></Properties>`],
    ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Control bancario ${xml(context.period)} J${xml(context.jurisdiction)}</dc:title><dc:creator>MuniControl</dc:creator><dc:description>Control agregado local; no genera acreditación bancaria</dc:description></cp:coreProperties>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><fileVersion appName="xl"/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews><sheets>${sheetTags}</sheets><calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalcOnLoad="1"/></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', stylesXml()],
    ...sheets.map(([, content], index) => [`xl/worksheets/sheet${index + 1}.xml`, content]),
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
  const size = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
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

export function createPayrollBankControlXlsxArtifact(control, options = {}) {
  const context = buildContext(control, options);
  const generatedAt = generatedInstant(options.generatedAt ?? new Date().toISOString());
  const bytes = storedZip(workbookEntries(context));
  const artifact = Object.freeze({
    contractVersion: PAYROLL_BANK_CONTROL_EXPORT_VERSION,
    sourceContractVersion: SOURCE_VERSION,
    period: context.period,
    jurisdiction: context.jurisdiction,
    bankScope: context.bankScope,
    generatedAt,
    fileName: `municontrol_control-bancario_${context.period}_j${context.jurisdiction}_${context.bank.slug}.xlsx`,
    mimeType: MIME_XLSX,
    byteLength: bytes.byteLength,
    sheetNames: SHEET_NAMES,
    containsPersonalRecords: false,
    controlOnly: true,
    bankScopeProven: true,
    bankInstructionGenerated: false,
    bankAccreditationPerformed: false,
    bytes,
  });
  ARTIFACT_CONTEXTS.set(artifact, Object.freeze({ crc32: crc32(bytes) }));
  return artifact;
}

export function downloadPayrollBankControlXlsxArtifact(artifact, options = {}) {
  exactObject(
    artifact, ARTIFACT_KEYS, 'BANK_CONTROL_EXPORT_ARTIFACT_INVALID',
    'El Excel de control no cumple el contrato de descarga',
  );
  const context = ARTIFACT_CONTEXTS.get(artifact);
  if (!context || !Object.isFrozen(artifact)
      || artifact.contractVersion !== PAYROLL_BANK_CONTROL_EXPORT_VERSION
      || artifact.sourceContractVersion !== SOURCE_VERSION || !PERIOD.test(artifact.period)
      || !['42', '55'].includes(artifact.jurisdiction)
      || !Object.hasOwn(BANK_SCOPES, artifact.bankScope)
      || artifact.fileName !== `municontrol_control-bancario_${artifact.period}_j${artifact.jurisdiction}_${BANK_SCOPES[artifact.bankScope].slug}.xlsx`
      || artifact.mimeType !== MIME_XLSX || artifact.sheetNames !== SHEET_NAMES
      || !(artifact.bytes instanceof Uint8Array)
      || artifact.byteLength !== artifact.bytes.byteLength || artifact.bytes.byteLength < 4
      || artifact.bytes[0] !== 0x50 || artifact.bytes[1] !== 0x4b
      || artifact.containsPersonalRecords !== false || artifact.controlOnly !== true
      || artifact.bankScopeProven !== true || artifact.bankInstructionGenerated !== false
      || artifact.bankAccreditationPerformed !== false || context.crc32 !== crc32(artifact.bytes)) {
    fail('BANK_CONTROL_EXPORT_ARTIFACT_INVALID', 'El Excel de control no cumple el contrato de descarga');
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
