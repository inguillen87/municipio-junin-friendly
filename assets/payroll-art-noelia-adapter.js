export const PAYROLL_ART_NOELIA_ADAPTER_CONTRACT_VERSION = 'payroll-art-noelia-adapter.v1';
export const PAYROLL_ART_NOELIA_FORMULA_VERSION = 'art-province-salary-993-plus-995.v1';

export const PAYROLL_ART_NOELIA_ADAPTER_CONTRACT = Object.freeze({
  contractVersion: PAYROLL_ART_NOELIA_ADAPTER_CONTRACT_VERSION,
  joinKey: 'cuil',
  salaryFormula: 'concept993Cents + concept995Cents',
  retainedFields: Object.freeze([
    'dni', 'cuil', 'sex', 'workedDays', 'concept993Cents', 'concept995Cents',
    'nonTaxableCents', 'declaredSalaryCents', 'formulaSalaryCents',
    'differenceCents', 'galenoRowNumbers', 'sussRowNumbers', 'errorCodes',
    'warningCodes',
  ]),
  discardedSourceFields: Object.freeze([
    'Nombre', 'Ingreso', 'Nacimiento', 'Domicilio', 'Apellido y Nombre',
    'Fecha de Nacimiento',
  ]),
});

const MAX_INT64 = 9223372036854775807n;
const CUIL = /^(?:20|23|24|27)[0-9]{9}$/;
const DNI = /^(?!0+$)[0-9]{7,8}$/;

const GALENO_HEADERS = Object.freeze({
  name: 'nombre',
  cuil: 'cuil',
  dni: 'dni',
  hiredAt: 'ingreso',
  birthDate: 'nacimiento',
  address: 'domicilio',
  taxable: 'imponible',
  nonTaxable: 'no imponible',
  familyAllowance: 'asign fliares',
});

const SUSS_HEADERS = Object.freeze({
  dni: 'no doc',
  documentType: 'tipo de doc',
  cuil: 'cuil sin guiones',
  name: 'apellido y nombre',
  sex: Object.freeze([
    'sexo',
    'sexo m masculino f femenino x no binario',
  ]),
  workedDays: 'cantidad de dias trabajados',
  birthDate: 'fecha de nacimiento',
  declaredSalary: 'sueldo',
});

export const PAYROLL_ART_NOELIA_ERROR_CODES = Object.freeze({
  GALENO_CUIL_INVALID: 'GALENO_CUIL_INVALID',
  SUSS_CUIL_INVALID: 'SUSS_CUIL_INVALID',
  GALENO_CUIL_DUPLICATED: 'GALENO_CUIL_DUPLICATED',
  SUSS_CUIL_DUPLICATED: 'SUSS_CUIL_DUPLICATED',
  GALENO_ROW_MISSING: 'GALENO_ROW_MISSING',
  SUSS_ROW_MISSING: 'SUSS_ROW_MISSING',
  GALENO_DNI_INVALID: 'GALENO_DNI_INVALID',
  SUSS_DNI_INVALID: 'SUSS_DNI_INVALID',
  ART_DNI_MISMATCH: 'ART_DNI_MISMATCH',
  SUSS_SEX_INVALID: 'SUSS_SEX_INVALID',
  SUSS_WORKED_DAYS_INVALID: 'SUSS_WORKED_DAYS_INVALID',
  GALENO_CONCEPT_993_INVALID: 'GALENO_CONCEPT_993_INVALID',
  GALENO_NON_TAXABLE_INVALID: 'GALENO_NON_TAXABLE_INVALID',
  GALENO_CONCEPT_995_INVALID: 'GALENO_CONCEPT_995_INVALID',
  SUSS_DECLARED_SALARY_INVALID: 'SUSS_DECLARED_SALARY_INVALID',
  ART_SALARY_OUT_OF_RANGE: 'ART_SALARY_OUT_OF_RANGE',
});

export const PAYROLL_ART_NOELIA_WARNING_CODES = Object.freeze({
  ART_DECLARED_SALARY_DIFFERENCE: 'ART_DECLARED_SALARY_DIFFERENCE',
  ART_NON_TAXABLE_UNAVAILABLE: 'ART_NON_TAXABLE_UNAVAILABLE',
  ART_DECLARED_SALARY_UNAVAILABLE: 'ART_DECLARED_SALARY_UNAVAILABLE',
});

export class PayrollArtNoeliaAdapterError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PayrollArtNoeliaAdapterError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new PayrollArtNoeliaAdapterError(code, message);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function repairMojibake(value) {
  let text = String(value ?? '');
  for (let attempt = 0; attempt < 2 && /[ÃÂ]/.test(text); attempt += 1) {
    const codePoints = [...text].map((character) => character.codePointAt(0));
    if (codePoints.some((point) => point > 255)) break;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(codePoints));
    } catch {
      break;
    }
  }
  return text;
}

function headerKey(value) {
  return repairMojibake(value)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[º°]/g, 'o')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function isBlankRow(row) {
  return !Array.isArray(row) || row.every((value) => String(value ?? '').trim() === '');
}

function locateHeader(matrix, expected, source) {
  if (!Array.isArray(matrix) || matrix.length === 0 || matrix.some((row) => !Array.isArray(row))) {
    fail('ART_NOELIA_MATRIX_INVALID', `${source} no es una matriz de celdas válida`);
  }
  const expectedEntries = Object.entries(expected);
  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
    const normalized = matrix[rowIndex].map(headerKey);
    const indexes = {};
    let matches = true;
    for (const [field, label] of expectedEntries) {
      const acceptedLabels = Array.isArray(label) ? label : [label];
      const positions = [];
      normalized.forEach((value, index) => {
        if (acceptedLabels.includes(value)) positions.push(index);
      });
      if (positions.length !== 1) {
        matches = false;
        break;
      }
      indexes[field] = positions[0];
    }
    if (matches) return Object.freeze({ rowIndex, indexes: Object.freeze(indexes) });
  }
  fail(`ART_NOELIA_${source}_HEADER_MISSING`, `No se encontró el encabezado esperado de ${source}`);
}

function cell(row, index) {
  return index < row.length ? row[index] : null;
}

function digits(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  }
  if (typeof value === 'bigint') return value >= 0n ? value.toString() : null;
  const text = String(value ?? '').trim();
  if (!text || /[^0-9.\-\s]/.test(text)) return null;
  return text.replace(/[.\-\s]/g, '');
}

function cuilChecksumValid(value) {
  if (!CUIL.test(value)) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((total, weight, index) => total + Number(value[index]) * weight, 0);
  let check = 11 - (sum % 11);
  if (check === 11) check = 0;
  if (check === 10) check = 9;
  return check === Number(value[10]);
}

function normalizeCuil(value) {
  const normalized = digits(value);
  return normalized && cuilChecksumValid(normalized) ? normalized : null;
}

function normalizeDni(value) {
  const normalized = digits(value);
  return normalized && DNI.test(normalized) ? normalized : null;
}

function cuilMatchesDni(cuil, dni) {
  return cuil.slice(2, 10) === dni.padStart(8, '0');
}

function decimalText(value) {
  if (typeof value === 'bigint') return value >= 0n ? value.toString() : null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || Math.abs(value) > Number.MAX_SAFE_INTEGER) return null;
    return String(value);
  }
  let text = String(value ?? '').trim().replace(/[\s\u00a0]/g, '');
  if (!text || /^[=+@]/.test(text) || text.startsWith('-')) return null;
  text = text.replace(/^\$/, '');
  if (!/^[0-9.,]+$/.test(text)) return null;
  const separators = [...text].filter((character) => character === '.' || character === ',');
  if (separators.length === 0) return text;
  const lastDot = text.lastIndexOf('.');
  const lastComma = text.lastIndexOf(',');
  const decimalIndex = Math.max(lastDot, lastComma);
  const trailing = text.length - decimalIndex - 1;
  if (trailing === 1 || trailing === 2) {
    const whole = text.slice(0, decimalIndex).replace(/[.,]/g, '');
    const fraction = text.slice(decimalIndex + 1);
    return whole && fraction ? `${whole}.${fraction}` : null;
  }
  if (
    trailing === 3
    && separators.length > 1
    && /^[0-9]{1,3}(?:[.,][0-9]{3})+$/.test(text)
  ) {
    return text.replace(/[.,]/g, '');
  }
  if (separators.length === 1 && text[decimalIndex] === '.' && trailing > 2 && trailing <= 17) {
    return text;
  }
  return null;
}

function moneyToCents(value) {
  const decimal = decimalText(value);
  if (!decimal || !/^[0-9]+(?:\.[0-9]{1,17})?$/.test(decimal)) return null;
  const [whole, fraction = ''] = decimal.split('.');
  try {
    let cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2));
    if (fraction.length > 2 && fraction[2] >= '5') cents += 1n;
    return cents <= MAX_INT64 ? cents : null;
  } catch {
    return null;
  }
}

function normalizeSex(value) {
  const normalized = headerKey(value).replaceAll(' ', '');
  if (['m', 'masculino', 'h', 'hombre', 'varon'].includes(normalized)) return 'M';
  if (['f', 'femenino', 'mujer'].includes(normalized)) return 'F';
  if (['x', 'nobinario'].includes(normalized)) return 'X';
  return null;
}

function normalizeWorkedDays(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0 && value <= 31 ? String(value) : null;
  }
  const text = String(value ?? '').trim();
  return /^(?:0|[1-9]|[12][0-9]|3[01])$/.test(text) ? text : null;
}

function parsedMoney(value, invalidCode, errors, { blankAsZero = false } = {}) {
  if (blankAsZero && String(value ?? '').trim() === '') return 0n;
  const cents = moneyToCents(value);
  if (cents === null) errors.add(invalidCode);
  return cents;
}

function parsedOptionalMoney(value, unavailableCode, warnings, { blankAsZero = false } = {}) {
  if (blankAsZero && String(value ?? '').trim() === '') return 0n;
  const cents = moneyToCents(value);
  if (cents === null) warnings.add(unavailableCode);
  return cents;
}

function galenoRow(row, rowNumber, indexes) {
  if ([indexes.name, indexes.cuil, indexes.dni]
    .every((index) => String(cell(row, index) ?? '').trim() === '')) return null;
  const errors = new Set();
  const warnings = new Set();
  const cuil = normalizeCuil(cell(row, indexes.cuil));
  const dni = normalizeDni(cell(row, indexes.dni));
  if (!cuil) errors.add(PAYROLL_ART_NOELIA_ERROR_CODES.GALENO_CUIL_INVALID);
  if (!dni) errors.add(PAYROLL_ART_NOELIA_ERROR_CODES.GALENO_DNI_INVALID);
  if (cuil && dni && !cuilMatchesDni(cuil, dni)) {
    errors.add(PAYROLL_ART_NOELIA_ERROR_CODES.ART_DNI_MISMATCH);
  }
  const concept993 = parsedMoney(
    cell(row, indexes.taxable),
    PAYROLL_ART_NOELIA_ERROR_CODES.GALENO_CONCEPT_993_INVALID,
    errors,
  );
  const nonTaxable = parsedOptionalMoney(
    cell(row, indexes.nonTaxable),
    PAYROLL_ART_NOELIA_WARNING_CODES.ART_NON_TAXABLE_UNAVAILABLE,
    warnings,
    { blankAsZero: true },
  );
  const concept995 = parsedMoney(
    cell(row, indexes.familyAllowance),
    PAYROLL_ART_NOELIA_ERROR_CODES.GALENO_CONCEPT_995_INVALID,
    errors,
  );
  return {
    source: 'GALENO', rowNumber, cuil, dni, concept993, nonTaxable, concept995, errors, warnings,
  };
}

function sussRow(row, rowNumber, indexes) {
  const errors = new Set();
  const warnings = new Set();
  const cuil = normalizeCuil(cell(row, indexes.cuil));
  const dni = normalizeDni(cell(row, indexes.dni));
  const sex = normalizeSex(cell(row, indexes.sex));
  const workedDays = normalizeWorkedDays(cell(row, indexes.workedDays));
  if (!cuil) errors.add(PAYROLL_ART_NOELIA_ERROR_CODES.SUSS_CUIL_INVALID);
  if (!dni) errors.add(PAYROLL_ART_NOELIA_ERROR_CODES.SUSS_DNI_INVALID);
  if (cuil && dni && !cuilMatchesDni(cuil, dni)) {
    errors.add(PAYROLL_ART_NOELIA_ERROR_CODES.ART_DNI_MISMATCH);
  }
  if (!sex) errors.add(PAYROLL_ART_NOELIA_ERROR_CODES.SUSS_SEX_INVALID);
  if (workedDays === null) errors.add(PAYROLL_ART_NOELIA_ERROR_CODES.SUSS_WORKED_DAYS_INVALID);
  const declaredSalary = parsedOptionalMoney(
    cell(row, indexes.declaredSalary),
    PAYROLL_ART_NOELIA_WARNING_CODES.ART_DECLARED_SALARY_UNAVAILABLE,
    warnings,
  );
  return {
    source: 'SUSS', rowNumber, cuil, dni, sex, workedDays, declaredSalary, errors, warnings,
  };
}

function collectRows(matrix, header, source, parser) {
  const rows = [];
  for (let rowIndex = header.rowIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
    const row = matrix[rowIndex];
    if (isBlankRow(row)) continue;
    const parsed = parser(row, rowIndex + 1, header.indexes);
    if (parsed) rows.push(parsed);
  }
  if (rows.length === 0) fail(`ART_NOELIA_${source}_ROWS_MISSING`, `${source} no contiene filas de datos`);
  return rows;
}

function groupRows(rows, source) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.cuil || `\uffff${source}:${String(row.rowNumber).padStart(9, '0')}`;
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }
  return groups;
}

function addRowErrors(target, rows) {
  for (const row of rows) {
    for (const code of row.errors) target.add(code);
  }
}

function addRowWarnings(target, rows) {
  for (const row of rows) {
    for (const code of row.warnings || []) target.add(code);
  }
}

function exactString(value) {
  return value === null ? null : value.toString();
}

function sumGalenoField(rows, field, errors) {
  let total = 0n;
  for (const row of rows) {
    if (row[field] === null) return null;
    total += row[field];
    if (total > MAX_INT64) {
      errors.add(PAYROLL_ART_NOELIA_ERROR_CODES.ART_SALARY_OUT_OF_RANGE);
      return null;
    }
  }
  return total;
}

function aggregateGalenoRows(rows, errors) {
  if (rows.length === 0) return null;
  const dniValues = new Set(rows.map((row) => row.dni).filter(Boolean));
  if (dniValues.size > 1) errors.add(PAYROLL_ART_NOELIA_ERROR_CODES.ART_DNI_MISMATCH);
  return {
    dni: rows.find((row) => row.dni)?.dni || null,
    concept993: sumGalenoField(rows, 'concept993', errors),
    nonTaxable: sumGalenoField(rows, 'nonTaxable', errors),
    concept995: sumGalenoField(rows, 'concept995', errors),
  };
}

function buildRecord(key, galenoRows, sussRows) {
  const errors = new Set();
  const warnings = new Set();
  addRowErrors(errors, galenoRows);
  addRowErrors(errors, sussRows);
  addRowWarnings(warnings, galenoRows);
  addRowWarnings(warnings, sussRows);
  if (galenoRows.length === 0) errors.add(PAYROLL_ART_NOELIA_ERROR_CODES.GALENO_ROW_MISSING);
  if (sussRows.length === 0) errors.add(PAYROLL_ART_NOELIA_ERROR_CODES.SUSS_ROW_MISSING);
  if (sussRows.length > 1) errors.add(PAYROLL_ART_NOELIA_ERROR_CODES.SUSS_CUIL_DUPLICATED);

  const galeno = aggregateGalenoRows(galenoRows, errors);
  const suss = sussRows.length === 1 ? sussRows[0] : null;
  if (galeno?.dni && suss?.dni && galeno.dni !== suss.dni) {
    errors.add(PAYROLL_ART_NOELIA_ERROR_CODES.ART_DNI_MISMATCH);
  }

  let formulaSalary = null;
  if (galeno && galeno.concept993 !== null && galeno.concept995 !== null) {
    const candidate = galeno.concept993 + galeno.concept995;
    if (candidate > MAX_INT64) errors.add(PAYROLL_ART_NOELIA_ERROR_CODES.ART_SALARY_OUT_OF_RANGE);
    else formulaSalary = candidate;
  }
  let difference = null;
  if (formulaSalary !== null && suss && suss.declaredSalary !== null) {
    difference = suss.declaredSalary - formulaSalary;
    if (difference !== 0n) {
      warnings.add(PAYROLL_ART_NOELIA_WARNING_CODES.ART_DECLARED_SALARY_DIFFERENCE);
    }
  }

  const validCuil = key.startsWith('\uffff') ? null : key;
  return deepFreeze({
    dni: suss?.dni || galeno?.dni || null,
    cuil: validCuil,
    sex: suss?.sex || null,
    workedDays: suss?.workedDays ?? null,
    concept993Cents: exactString(galeno?.concept993 ?? null),
    concept995Cents: exactString(galeno?.concept995 ?? null),
    nonTaxableCents: exactString(galeno?.nonTaxable ?? null),
    declaredSalaryCents: exactString(suss?.declaredSalary ?? null),
    formulaSalaryCents: exactString(formulaSalary),
    differenceCents: exactString(difference),
    galenoRowNumbers: galenoRows.map((row) => row.rowNumber).sort((a, b) => a - b),
    sussRowNumbers: sussRows.map((row) => row.rowNumber).sort((a, b) => a - b),
    errorCodes: [...errors].sort(),
    warningCodes: [...warnings].sort(),
  });
}

function recordOrder(left, right) {
  if (left.cuil && right.cuil) return left.cuil.localeCompare(right.cuil);
  if (left.cuil) return -1;
  if (right.cuil) return 1;
  const leftRow = left.galenoRowNumbers[0] ?? left.sussRowNumbers[0] ?? 0;
  const rightRow = right.galenoRowNumbers[0] ?? right.sussRowNumbers[0] ?? 0;
  return leftRow - rightRow;
}

export function reconcileNoeliaArtWorkbookMatrices({ galenoRows, sussRows } = {}) {
  const galenoHeader = locateHeader(galenoRows, GALENO_HEADERS, 'GALENO');
  const sussHeader = locateHeader(sussRows, SUSS_HEADERS, 'SUSS');
  const parsedGalenoRows = collectRows(galenoRows, galenoHeader, 'GALENO', galenoRow);
  const parsedSussRows = collectRows(sussRows, sussHeader, 'SUSS', sussRow);
  const galenoGroups = groupRows(parsedGalenoRows, 'GALENO');
  const sussGroups = groupRows(parsedSussRows, 'SUSS');
  const keys = [...new Set([...galenoGroups.keys(), ...sussGroups.keys()])].sort();
  const rows = keys.map((key) => buildRecord(
    key,
    galenoGroups.get(key) || [],
    sussGroups.get(key) || [],
  )).sort(recordOrder);
  const summary = {
    galenoDataRows: parsedGalenoRows.length,
    sussDataRows: parsedSussRows.length,
    unionRecords: rows.length,
    matchedRecords: rows.filter((record) => (
      record.galenoRowNumbers.length >= 1 && record.sussRowNumbers.length === 1
    )).length,
    recordsWithErrors: rows.filter((record) => record.errorCodes.length > 0).length,
    recordsWithWarnings: rows.filter((record) => record.warningCodes.length > 0).length,
    galenoDuplicateGroups: [...galenoGroups.values()].filter((rows) => rows.length > 1).length,
    sussDuplicateGroups: [...sussGroups.values()].filter((rows) => rows.length > 1).length,
    unmatchedGalenoRecords: rows.filter((record) => record.sussRowNumbers.length === 0).length,
    unmatchedSussRecords: rows.filter((record) => record.galenoRowNumbers.length === 0).length,
    salaryDifferenceRecords: rows.filter((record) => (
      record.warningCodes.includes(PAYROLL_ART_NOELIA_WARNING_CODES.ART_DECLARED_SALARY_DIFFERENCE)
    )).length,
  };
  return deepFreeze({
    contractVersion: PAYROLL_ART_NOELIA_ADAPTER_CONTRACT_VERSION,
    rows,
    summary,
  });
}
