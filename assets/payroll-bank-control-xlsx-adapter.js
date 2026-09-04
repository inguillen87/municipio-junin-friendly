import {
  JURISDICTION_REPARTITION_ROSTER,
  JURISDICTION_REPARTITION_ROSTER_VERSION,
  formatJurisdictionControlCents,
  jurisdictionControlAmountToCents,
} from './monthly-close-jurisdiction-xlsx-adapter.js';

export const PAYROLL_BANK_CONTROL_VERSION = 'payroll-bank-control-xlsx.v1';
export const BANK_ACCREDITATION_SUMMARY_VERSION = 'bank-accreditation-summary.v1';
export const BANK_ACCREDITATION_SUMMARY_HEADER =
  'periodo;jurisdiccion;reparticion_codigo;banco_codigo;tipo_cuenta;operaciones;importe_neto_centavos';
export const PAYROLL_BANK_CONTROL_MAX_BYTES = 2 * 1024 * 1024;

const PERIOD = /^(?:19|20)[0-9]{2}-(?:0[1-9]|1[0-2])$/;
const CUIL_WEIGHTS = Object.freeze([5, 4, 3, 2, 7, 6, 5, 4, 3, 2]);
const ALLOWED_ACCOUNT_TYPES = new Set(['cuenta_corriente', 'caja_ahorro']);
const ACCOUNT_TYPE_KEYS = Object.freeze(['credicoop', 'santander', 'nacion']);
const EXPECTED_SHEET_KEYS = Object.freeze([
  'credicoop-42', 'credicoop-55',
  'santander-42', 'santander-55',
  'transferencias-funcionarios', 'transferencias-varias',
  'nacion-42', 'nacion-55',
]);
const BANKS = Object.freeze({
  credicoop: Object.freeze({ code: '191', label: 'Credicoop' }),
  santander: Object.freeze({ code: '72', label: 'Santander' }),
  nacion: Object.freeze({ code: '11', label: 'Nación' }),
  transferencias: Object.freeze({ code: '0', label: 'Transferencias especiales' }),
});
const WORKBOOK_KEYS = new Set(['period', 'byteLength', 'sheets', 'accountTypes']);
const SHEET_KEYS = new Set(['name', 'dimension', 'rows']);
const ROW_KEYS = new Set(['rowNumber', 'cells']);
const MAX_ROWS_PER_SHEET = 20_000;
const MAX_TOTAL_ROWS = 60_000;
const MAX_INT64 = 9223372036854775807n;

const JURISDICTION_BY_REPARTITION = new Map();
for (const jurisdiction of ['42', '55']) {
  for (const code of JURISDICTION_REPARTITION_ROSTER[jurisdiction]) {
    if (JURISDICTION_BY_REPARTITION.has(code)) {
      throw new Error(`La repartición ${code} figura en más de una jurisdicción`);
    }
    JURISDICTION_BY_REPARTITION.set(code, jurisdiction);
  }
}

export class PayrollBankControlError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PayrollBankControlError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new PayrollBankControlError(code, message);
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function compactText(value) {
  return normalizeText(value).replace(/[^A-Z0-9]/g, '');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function checkedAdd(left, right) {
  const value = left + right;
  if (value < 0n || value > MAX_INT64) {
    fail('BANK_CONTROL_TOTAL_OUT_OF_RANGE', 'El total bancario excede el rango exacto admitido');
  }
  return value;
}

function periodLabel(period) {
  if (typeof period !== 'string' || !PERIOD.test(period)) {
    fail('BANK_CONTROL_PERIOD_INVALID', 'El período debe usar YYYY-MM');
  }
  return `${period.slice(5, 7)}.${period.slice(0, 4)}`;
}

function identifySheet(rawName, period) {
  if (typeof rawName !== 'string' || rawName.length <= 0 || rawName.length > 80) {
    fail('BANK_CONTROL_SHEET_INVALID', 'El libro contiene una hoja sin nombre válido');
  }
  const name = normalizeText(rawName);
  const label = escapeRegExp(periodLabel(period));
  const bank = new RegExp(
    `^(BANCAR|BARCAR)\\.\\s*${label}\\s*-\\s*(CRED|SANT|NAC)\\.?\\s*JUR\\.?\\s*(42|55)$`,
  ).exec(name);
  if (bank) {
    const bankKey = Object.freeze({ CRED: 'credicoop', SANT: 'santander', NAC: 'nacion' })[bank[2]];
    if (bank[1] === 'BARCAR' && bankKey !== 'santander') {
      fail('BANK_CONTROL_SHEET_INVALID', 'El nombre BARCAR sólo se admite para Santander');
    }
    return Object.freeze({
      key: `${bankKey}-${bank[3]}`,
      bankKey,
      jurisdiction: bank[3],
      transfer: false,
    });
  }
  if (new RegExp(`^TRANSF\\.\\s*FUNCIONARIOS\\s+${label}$`).test(name)) {
    return Object.freeze({
      key: 'transferencias-funcionarios', bankKey: 'transferencias',
      jurisdiction: null, transfer: true,
    });
  }
  if (new RegExp(`^TRANSF\\.\\s*VARIAS\\s+${label}$`).test(name)) {
    return Object.freeze({
      key: 'transferencias-varias', bankKey: 'transferencias',
      jurisdiction: null, transfer: true,
    });
  }
  fail(
    'BANK_CONTROL_SHEET_INVALID',
    'Las hojas no coinciden con las ocho secciones mensuales esperadas',
  );
}

function validateAccountTypes(accountTypes) {
  if (!accountTypes || typeof accountTypes !== 'object' || Array.isArray(accountTypes)
      || Object.keys(accountTypes).length !== ACCOUNT_TYPE_KEYS.length
      || ACCOUNT_TYPE_KEYS.some((key) => !Object.hasOwn(accountTypes, key))) {
    fail(
      'BANK_CONTROL_ACCOUNT_TYPE_REQUIRED',
      'Elegí explícitamente el tipo de cuenta de Credicoop, Santander y Nación',
    );
  }
  for (const key of ACCOUNT_TYPE_KEYS) {
    if (!ALLOWED_ACCOUNT_TYPES.has(accountTypes[key])) {
      fail(
        'BANK_CONTROL_ACCOUNT_TYPE_REQUIRED',
        'Elegí explícitamente el tipo de cuenta de Credicoop, Santander y Nación',
      );
    }
  }
  return Object.freeze(Object.fromEntries(ACCOUNT_TYPE_KEYS.map((key) => [key, accountTypes[key]])));
}

function validateWorkbookInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).some((key) => !WORKBOOK_KEYS.has(key))
      || [...WORKBOOK_KEYS].some((key) => !Object.hasOwn(input, key))) {
    fail('BANK_CONTROL_INPUT_INVALID', 'El importador recibió un libro o contexto incompleto');
  }
  periodLabel(input.period);
  if (!Number.isInteger(input.byteLength) || input.byteLength <= 0
      || input.byteLength > PAYROLL_BANK_CONTROL_MAX_BYTES) {
    fail('BANK_CONTROL_SIZE_INVALID', 'El Excel está vacío o supera el máximo local de 2 MiB');
  }
  if (!Array.isArray(input.sheets) || input.sheets.length !== EXPECTED_SHEET_KEYS.length) {
    fail('BANK_CONTROL_WORKBOOK_INVALID', 'El libro debe contener exactamente las ocho hojas esperadas');
  }
  validateAccountTypes(input.accountTypes);
}

function validateCells(cells) {
  if (!cells || typeof cells !== 'object' || Array.isArray(cells)) {
    fail('BANK_CONTROL_ROW_INVALID', 'Una fila del Excel no tiene una estructura válida');
  }
  for (const [column, value] of Object.entries(cells)) {
    if (!/^[A-F]$/.test(column) || typeof value !== 'string' || value.length > 300) {
      fail('BANK_CONTROL_CELL_INVALID', 'Una celda relevante no cumple el contrato esperado');
    }
  }
}

function validateSheetInput(sheet) {
  if (!sheet || typeof sheet !== 'object' || Array.isArray(sheet)
      || Object.keys(sheet).some((key) => !SHEET_KEYS.has(key))
      || [...SHEET_KEYS].some((key) => !Object.hasOwn(sheet, key))
      || typeof sheet.dimension !== 'string' || sheet.dimension.length > 40
      || !Array.isArray(sheet.rows) || sheet.rows.length <= 0
      || sheet.rows.length > MAX_ROWS_PER_SHEET) {
    fail('BANK_CONTROL_SHEET_INVALID', 'Una hoja no cumple la estructura XML acotada');
  }
  let previous = 0;
  for (const row of sheet.rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)
        || Object.keys(row).some((key) => !ROW_KEYS.has(key))
        || [...ROW_KEYS].some((key) => !Object.hasOwn(row, key))
        || !Number.isInteger(row.rowNumber) || row.rowNumber <= previous
        || row.rowNumber < 1 || row.rowNumber > 1_048_576) {
      fail('BANK_CONTROL_ROW_INVALID', 'Las filas XML están ausentes, duplicadas o fuera de orden');
    }
    validateCells(row.cells);
    previous = row.rowNumber;
  }
}

function headerKind(value) {
  const compact = compactText(value);
  if (compact === 'CUIL') return 'cuil';
  if (['APELLIDOYNOMBRE', 'NOMBREYAPELLIDO', 'NOMBRE'].includes(compact)) return 'name';
  if (['NETOACOBRAR', 'NETOAPAGAR', 'NETO'].includes(compact)) return 'net';
  if (['REPARTICION', 'REPARTICIONCODIGO'].includes(compact)) return 'repartition';
  return null;
}

function detectHeader(cells) {
  const found = new Map();
  for (const [column, value] of Object.entries(cells)) {
    const kind = headerKind(value);
    if (!kind) continue;
    if (found.has(kind)) {
      fail('BANK_CONTROL_HEADER_INVALID', 'Una cabecera requerida está repetida en la misma fila');
    }
    found.set(kind, column);
  }
  if (found.size === 0) return null;
  const required = ['cuil', 'name', 'net', 'repartition'];
  if (required.some((key) => !found.has(key))) {
    fail('BANK_CONTROL_HEADER_INVALID', 'La cabecera debe identificar CUIL, nombre, neto y repartición');
  }
  return Object.freeze(Object.fromEntries(required.map((key) => [key, found.get(key)])));
}

function sameHeader(left, right) {
  return ['cuil', 'name', 'net', 'repartition'].every((key) => left[key] === right[key]);
}

function isSummaryRow(cells) {
  return Object.values(cells).some((value) => (
    /^(?:TOTAL|SUBTOTAL|BANCARIZADOS|TRANSFERENCIAS)(?:\s|$)/.test(normalizeText(value))
  ));
}

function normalizeCuil(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (!/^[0-9.\-\s]+$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 11) {
    fail('BANK_CONTROL_CUIL_INVALID', 'Una fila nominal contiene un CUIL inválido');
  }
  let sum = 0;
  for (let index = 0; index < CUIL_WEIGHTS.length; index += 1) {
    sum += Number(digits[index]) * CUIL_WEIGHTS[index];
  }
  let verifier = 11 - (sum % 11);
  if (verifier === 11) verifier = 0;
  else if (verifier === 10) verifier = 9;
  if (verifier !== Number(digits[10])) {
    fail('BANK_CONTROL_CUIL_INVALID', 'Una fila nominal contiene un CUIL inválido');
  }
  return digits;
}

function parseRepartition(value) {
  const match = /^\s*0*([0-9]{1,2})(?:\s*(?:[-–—.]|$))/.exec(String(value ?? ''));
  if (!match) {
    fail('BANK_CONTROL_REPARTITION_INVALID', 'Una fila nominal no identifica su repartición');
  }
  const code = match[1].padStart(2, '0');
  const jurisdiction = JURISDICTION_BY_REPARTITION.get(code);
  if (!jurisdiction) {
    fail('BANK_CONTROL_REPARTITION_INVALID', 'Una repartición no pertenece a la lista versionada de Junín');
  }
  return Object.freeze({ code, jurisdiction });
}

function parseNominalRow(row, header, sheetKind, accountTypes) {
  if (isSummaryRow(row.cells)) return null;
  const cuilRaw = row.cells[header.cuil] ?? '';
  const cuil = normalizeCuil(cuilRaw);
  const name = String(row.cells[header.name] ?? '').trim();
  const net = String(row.cells[header.net] ?? '').trim();
  const repartition = String(row.cells[header.repartition] ?? '').trim();
  if (!cuil) {
    if (name && net && repartition) {
      fail('BANK_CONTROL_CUIL_REQUIRED', 'Una fila nominal no informa un CUIL válido');
    }
    return null;
  }
  if (!name || name.length > 180 || !net || !repartition) {
    fail('BANK_CONTROL_NOMINAL_ROW_INVALID', 'Una fila nominal está incompleta');
  }
  const netCents = jurisdictionControlAmountToCents(net);
  if (netCents <= 0n) {
    fail('BANK_CONTROL_NET_INVALID', 'El neto de una fila nominal debe ser mayor que cero');
  }
  const repartitionRef = parseRepartition(repartition);
  if (sheetKind.jurisdiction && sheetKind.jurisdiction !== repartitionRef.jurisdiction) {
    fail(
      'BANK_CONTROL_JURISDICTION_MISMATCH',
      'Una fila no pertenece a la jurisdicción declarada por la hoja',
    );
  }
  return Object.freeze({
    jurisdiction: sheetKind.jurisdiction ?? repartitionRef.jurisdiction,
    repartitionCode: repartitionRef.code,
    bankKey: sheetKind.bankKey,
    bankCode: BANKS[sheetKind.bankKey].code,
    bankLabel: BANKS[sheetKind.bankKey].label,
    accountType: sheetKind.transfer
      ? 'transferencia_especial' : accountTypes[sheetKind.bankKey],
    netCents,
  });
}

function addGroup(groups, row) {
  const key = [
    row.jurisdiction, row.repartitionCode, row.bankCode, row.accountType,
  ].join('|');
  const current = groups.get(key) ?? {
    jurisdiction: row.jurisdiction,
    repartitionCode: row.repartitionCode,
    bankCode: row.bankCode,
    bankLabel: row.bankLabel,
    accountType: row.accountType,
    operations: 0,
    netCents: 0n,
  };
  current.operations += 1;
  current.netCents = checkedAdd(current.netCents, row.netCents);
  groups.set(key, current);
}

function sortGroups(left, right) {
  return Number(left.jurisdiction) - Number(right.jurisdiction)
    || Number(left.repartitionCode) - Number(right.repartitionCode)
    || Number(left.bankCode) - Number(right.bankCode)
    || left.accountType.localeCompare(right.accountType);
}

export function preparePayrollBankControlWorkbook(input) {
  validateWorkbookInput(input);
  const accountTypes = validateAccountTypes(input.accountTypes);
  const recognized = new Map();
  let totalRows = 0;
  for (const sheet of input.sheets) {
    validateSheetInput(sheet);
    totalRows += sheet.rows.length;
    if (totalRows > MAX_TOTAL_ROWS) {
      fail('BANK_CONTROL_ROW_LIMIT_EXCEEDED', 'El libro supera la cantidad de filas XML admitida');
    }
    const kind = identifySheet(sheet.name, input.period);
    if (recognized.has(kind.key)) {
      fail('BANK_CONTROL_SHEET_DUPLICATED', 'El libro repite una de las ocho hojas esperadas');
    }
    recognized.set(kind.key, { sheet, kind });
  }
  if (EXPECTED_SHEET_KEYS.some((key) => !recognized.has(key))) {
    fail('BANK_CONTROL_WORKBOOK_INVALID', 'El libro no contiene las ocho hojas esperadas');
  }

  const groups = new Map();
  const sheetSummaries = [];
  let operations = 0;
  let netCents = 0n;
  let headerBlockCount = 0;
  for (const expectedKey of EXPECTED_SHEET_KEYS) {
    const { sheet, kind } = recognized.get(expectedKey);
    let activeHeader = null;
    let canonicalHeader = null;
    let sheetOperations = 0;
    let sheetNetCents = 0n;
    let sheetHeaderBlocks = 0;
    for (const row of sheet.rows) {
      const header = detectHeader(row.cells);
      if (header) {
        if (canonicalHeader && !sameHeader(canonicalHeader, header)) {
          fail('BANK_CONTROL_HEADER_DRIFT', 'Las cabeceras repetidas cambian de posición dentro de una hoja');
        }
        canonicalHeader = canonicalHeader ?? header;
        activeHeader = header;
        sheetHeaderBlocks += 1;
        continue;
      }
      if (!activeHeader) continue;
      const nominal = parseNominalRow(row, activeHeader, kind, accountTypes);
      if (!nominal) continue;
      addGroup(groups, nominal);
      sheetOperations += 1;
      operations += 1;
      sheetNetCents = checkedAdd(sheetNetCents, nominal.netCents);
      netCents = checkedAdd(netCents, nominal.netCents);
    }
    if (!canonicalHeader || sheetHeaderBlocks <= 0) {
      fail('BANK_CONTROL_HEADER_REQUIRED', 'Una hoja no contiene la cabecera nominal esperada');
    }
    if (sheetOperations <= 0) {
      fail('BANK_CONTROL_ROWS_REQUIRED', 'Una hoja no contiene filas nominales válidas');
    }
    headerBlockCount += sheetHeaderBlocks;
    sheetSummaries.push(Object.freeze({
      sheetKey: expectedKey,
      jurisdiction: kind.jurisdiction,
      bankCode: BANKS[kind.bankKey].code,
      operations: sheetOperations,
      netCents: sheetNetCents.toString(),
      headerBlocks: sheetHeaderBlocks,
    }));
  }

  const normalizedGroups = [...groups.values()].sort(sortGroups).map((entry) => Object.freeze({
    jurisdiction: entry.jurisdiction,
    repartitionCode: entry.repartitionCode,
    bankCode: entry.bankCode,
    bankLabel: entry.bankLabel,
    accountType: entry.accountType,
    operations: entry.operations,
    netCents: entry.netCents.toString(),
  }));
  const summarize = (filter) => {
    let summaryOperations = 0;
    let summaryNetCents = 0n;
    for (const group of normalizedGroups.filter(filter)) {
      summaryOperations += group.operations;
      summaryNetCents = checkedAdd(summaryNetCents, BigInt(group.netCents));
    }
    return Object.freeze({ operations: summaryOperations, netCents: summaryNetCents.toString() });
  };
  const jurisdictions = ['42', '55'].map((jurisdiction) => Object.freeze({
    jurisdiction,
    ...summarize((group) => group.jurisdiction === jurisdiction),
  }));
  if (jurisdictions.some((entry) => entry.operations <= 0)) {
    fail('BANK_CONTROL_JURISDICTION_EMPTY', 'Una jurisdicción no contiene operaciones bancarias');
  }

  return Object.freeze({
    contractVersion: PAYROLL_BANK_CONTROL_VERSION,
    exportContractVersion: BANK_ACCREDITATION_SUMMARY_VERSION,
    repartitionRosterVersion: JURISDICTION_REPARTITION_ROSTER_VERSION,
    period: input.period,
    status: 'valid',
    readyToExport: true,
    total: Object.freeze({ operations, netCents: netCents.toString() }),
    jurisdictions: Object.freeze(jurisdictions),
    groups: Object.freeze(normalizedGroups),
    sheets: Object.freeze(sheetSummaries),
    source: Object.freeze({
      byteLength: input.byteLength,
      worksheetCount: input.sheets.length,
      actualXmlRowsVisited: totalRows,
      headerBlockCount,
      worksheetDimensionTrusted: false,
      cachedCellValuesUsed: true,
      formulasExecuted: false,
      externalLinksFollowed: false,
    }),
    processedLocally: true,
    persistencePerformed: false,
    rawRowsReturned: false,
    personalColumnsDiscardedBeforeResult: true,
    bankInstructionGenerated: false,
    bankAccreditationPerformed: false,
    payrollCalculated: false,
    closeApproved: false,
  });
}

function assertExportable(control, jurisdiction) {
  if (!control || control.contractVersion !== PAYROLL_BANK_CONTROL_VERSION
      || control.exportContractVersion !== BANK_ACCREDITATION_SUMMARY_VERSION
      || control.readyToExport !== true || !PERIOD.test(control.period)
      || !['42', '55'].includes(jurisdiction) || !Array.isArray(control.groups)) {
    fail('BANK_CONTROL_EXPORT_BLOCKED', 'El resumen no está listo para exportar');
  }
  const rows = control.groups.filter((group) => group.jurisdiction === jurisdiction);
  if (rows.length <= 0) {
    fail('BANK_CONTROL_EXPORT_BLOCKED', 'La jurisdicción no contiene filas agregadas');
  }
  const seen = new Set();
  for (const row of rows) {
    const key = [row.jurisdiction, row.repartitionCode, row.bankCode, row.accountType].join('|');
    if (seen.has(key) || !/^\d{2}$/.test(row.repartitionCode)
        || !['0', '11', '72', '191'].includes(row.bankCode)
        || !['cuenta_corriente', 'caja_ahorro', 'transferencia_especial'].includes(row.accountType)
        || !Number.isInteger(row.operations) || row.operations <= 0
        || !/^(?:0|[1-9][0-9]*)$/.test(row.netCents)) {
      fail('BANK_CONTROL_EXPORT_BLOCKED', 'El resumen contiene una fila agregada inválida');
    }
    seen.add(key);
  }
  return rows.slice().sort(sortGroups);
}

export function createBankAccreditationSummaryCsv(control, jurisdiction) {
  const rows = assertExportable(control, jurisdiction);
  const lines = [BANK_ACCREDITATION_SUMMARY_HEADER];
  for (const row of rows) {
    lines.push([
      control.period,
      jurisdiction,
      row.repartitionCode,
      row.bankCode,
      row.accountType,
      String(row.operations),
      row.netCents,
    ].join(';'));
  }
  return new TextEncoder().encode(`${lines.join('\r\n')}\r\n`);
}

export function runPayrollBankControlWorker(arrayBuffer, period, accountTypes, {
  WorkerImpl = globalThis.Worker,
  timeoutMs = 30_000,
} = {}) {
  if (!(arrayBuffer instanceof ArrayBuffer) || typeof WorkerImpl !== 'function') {
    return Promise.reject(new PayrollBankControlError(
      'BANK_CONTROL_WORKER_UNAVAILABLE',
      'El procesador local del Excel no está disponible',
    ));
  }
  return new Promise((resolve, reject) => {
    const worker = new WorkerImpl(
      new URL('./payroll-bank-control-xlsx-worker.js', import.meta.url),
      { type: 'module' },
    );
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      callback(value);
    };
    const timer = setTimeout(() => finish(
      reject,
      new PayrollBankControlError(
        'BANK_CONTROL_WORKER_TIMEOUT',
        'El análisis local excedió el tiempo permitido',
      ),
    ), timeoutMs);
    worker.addEventListener('message', (event) => {
      const payload = event.data;
      if (payload?.ok === true) finish(resolve, payload.control);
      else finish(reject, new PayrollBankControlError(
        typeof payload?.code === 'string' ? payload.code : 'BANK_CONTROL_XLSX_INVALID',
        typeof payload?.message === 'string'
          ? payload.message : 'El Excel no coincide con el formato mensual esperado',
      ));
    }, { once: true });
    worker.addEventListener('error', () => finish(
      reject,
      new PayrollBankControlError(
        'BANK_CONTROL_WORKER_FAILED',
        'No se pudo completar el análisis local del Excel',
      ),
    ), { once: true });
    worker.postMessage({ type: 'prepare', arrayBuffer, period, accountTypes }, [arrayBuffer]);
  });
}

function appendCell(row, value, label, className = '') {
  const cell = document.createElement('td');
  cell.textContent = value;
  cell.dataset.label = label;
  if (className) cell.className = className;
  row.appendChild(cell);
}

function downloadBytes(bytes, fileName) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function mountPayrollBankControlXlsx(host = document) {
  const root = host.querySelector('[data-payroll-bank-control-xlsx]');
  if (!root || root.dataset.mounted === 'true') return false;
  const form = root.querySelector('[data-bank-control-form]');
  const period = root.querySelector('[data-bank-control-period]');
  const fileInput = root.querySelector('[data-bank-control-file]');
  const submit = root.querySelector('[data-bank-control-submit]');
  const reset = root.querySelector('[data-bank-control-reset]');
  const status = root.querySelector('[data-bank-control-status]');
  const result = root.querySelector('[data-bank-control-result]');
  const operations = root.querySelector('[data-bank-control-operations]');
  const worksheets = root.querySelector('[data-bank-control-worksheets]');
  const total = root.querySelector('[data-bank-control-total="all"]');
  const total42 = root.querySelector('[data-bank-control-total="42"]');
  const total55 = root.querySelector('[data-bank-control-total="55"]');
  const rows = root.querySelector('[data-bank-control-rows]');
  const export42 = root.querySelector('[data-bank-control-export="42"]');
  const export55 = root.querySelector('[data-bank-control-export="55"]');
  const accountInputs = Object.fromEntries(ACCOUNT_TYPE_KEYS.map((key) => [
    key, root.querySelector(`[data-bank-control-account="${key}"]`),
  ]));
  if (!form || !period || !fileInput || !submit || !reset || !status || !result
      || !operations || !worksheets || !total || !total42 || !total55
      || !rows || !export42 || !export55
      || ACCOUNT_TYPE_KEYS.some((key) => !accountInputs[key])) return false;
  let latest = null;
  let sequence = 0;

  const setStatus = (state, message) => {
    status.dataset.state = state;
    status.textContent = message;
  };
  const clearResult = () => {
    latest = null;
    result.hidden = true;
    rows.replaceChildren();
    for (const node of [operations, worksheets, total, total42, total55]) node.textContent = '—';
    export42.disabled = true;
    export55.disabled = true;
  };
  const accountTypes = () => Object.fromEntries(
    ACCOUNT_TYPE_KEYS.map((key) => [key, accountInputs[key].value]),
  );
  const render = (control) => {
    rows.replaceChildren();
    for (const group of control.groups) {
      const row = document.createElement('tr');
      appendCell(row, `J${group.jurisdiction}`, 'Jurisdicción');
      appendCell(row, group.repartitionCode, 'Repartición');
      appendCell(row, group.bankLabel, 'Banco');
      appendCell(
        row,
        group.accountType === 'transferencia_especial'
          ? 'Transferencia especial'
          : group.accountType === 'caja_ahorro' ? 'Caja de ahorro' : 'Cuenta corriente',
        'Tipo de cuenta',
      );
      appendCell(row, String(group.operations), 'Operaciones', 'numeric');
      appendCell(row, formatJurisdictionControlCents(group.netCents), 'Neto', 'numeric');
      rows.appendChild(row);
    }
    const j42 = control.jurisdictions.find((entry) => entry.jurisdiction === '42');
    const j55 = control.jurisdictions.find((entry) => entry.jurisdiction === '55');
    operations.textContent = String(control.total.operations);
    worksheets.textContent = String(control.source.worksheetCount);
    total.textContent = formatJurisdictionControlCents(control.total.netCents);
    total42.textContent = formatJurisdictionControlCents(j42.netCents);
    total55.textContent = formatJurisdictionControlCents(j55.netCents);
    result.hidden = false;
    latest = control;
    export42.disabled = false;
    export55.disabled = false;
    setStatus(
      'ok',
      `${control.total.operations} operaciones recalculadas desde filas nominales válidas. Los datos personales ya fueron descartados.`,
    );
  };

  for (const input of [period, fileInput, ...Object.values(accountInputs)]) {
    input.addEventListener('change', () => {
      sequence += 1;
      input.setAttribute('aria-invalid', 'false');
      clearResult();
      setStatus('', 'Contexto modificado. Procesá nuevamente la planilla.');
    });
  }
  reset.addEventListener('click', () => {
    sequence += 1;
    form.reset();
    clearResult();
    setStatus('', 'Seleccioná período, tipos de cuenta y la planilla mensual.');
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const file = fileInput.files && fileInput.files[0];
    const types = accountTypes();
    const firstMissingAccount = ACCOUNT_TYPE_KEYS.find((key) => !types[key]);
    if (!period.value || !file || firstMissingAccount) {
      const target = !period.value ? period : !file ? fileInput : accountInputs[firstMissingAccount];
      target.setAttribute('aria-invalid', 'true');
      target.focus();
      setStatus('error', 'Completá el período, el Excel y los tres tipos de cuenta.');
      return;
    }
    if (file.size <= 0 || file.size > PAYROLL_BANK_CONTROL_MAX_BYTES) {
      fileInput.setAttribute('aria-invalid', 'true');
      fileInput.focus();
      setStatus('error', 'El Excel está vacío o supera el máximo local de 2 MiB.');
      return;
    }
    const current = ++sequence;
    submit.disabled = true;
    root.setAttribute('aria-busy', 'true');
    clearResult();
    setStatus('', 'Leyendo las ocho hojas y recalculando totales en este navegador…');
    try {
      const control = await runPayrollBankControlWorker(
        await file.arrayBuffer(), period.value, types,
      );
      if (current !== sequence) return;
      render(control);
      fileInput.value = '';
    } catch (error) {
      if (current !== sequence) return;
      clearResult();
      fileInput.setAttribute('aria-invalid', 'true');
      setStatus(
        'error',
        error instanceof PayrollBankControlError
          ? error.message : 'No se pudo procesar la planilla local.',
      );
    } finally {
      submit.disabled = false;
      root.setAttribute('aria-busy', 'false');
    }
  });
  for (const button of [export42, export55]) {
    button.addEventListener('click', () => {
      if (!latest) return;
      const jurisdiction = button.dataset.bankControlExport;
      downloadBytes(
        createBankAccreditationSummaryCsv(latest, jurisdiction),
        `municontrol_resumen-bancario_${latest.period}_jurisdiccion-${jurisdiction}.csv`,
      );
    });
  }
  root.dataset.mounted = 'true';
  return true;
}

if (typeof document !== 'undefined') mountPayrollBankControlXlsx(document);
