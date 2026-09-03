export const JURISDICTION_NET_CONTROL_VERSION = 'jurisdiction-net-control-xlsx.v1';
export const JURISDICTION_NET_CONTROL_MAX_BYTES = 512 * 1024;
export const JURISDICTION_NET_CONTROL_HEADER =
  'periodo;jurisdiccion;reparticion_codigo;importe_neto_control_centavos';
export const JURISDICTION_NET_CONTROL_TECHNICAL_DRIFT_MILLICENTS = 1n;
export const JURISDICTION_NET_CONTROL_FORMULA_VERSION =
  'jurisdiction-net-control-formulas.v1';

const PERIOD = /^(?:19|20)[0-9]{2}-(?:0[1-9]|1[0-2])$/;
const JURISDICTION_LABEL = /^JURISDICCI(?:O|Ó)N (42|55)$/;
const REPARTITION_LABEL = /^REP\.(\d{2})$/;
const RAW_DECIMAL = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/;
const MAX_INT64 = 9223372036854775807n;
const MIN_INT64 = -9223372036854775808n;
const EXPECTED_JURISDICTIONS = Object.freeze(['42', '55']);
const EXPECTED_REPARTITIONS = Object.freeze({
  42: Object.freeze(['01', '02', '03', '04', '06', '07', '13', '14', '15', '16', '40']),
  55: Object.freeze([
    '17', '18', '19', '20', '21', '22', '23', '24', '25',
    '26', '27', '33', '35', '36', '37', '38', '39',
  ]),
});
const INPUT_KEYS = new Set([
  'period', 'byteLength', 'sha256', 'sheets', 'formulaContractVerified',
]);
const EXPECTED_FORMULAS = Object.freeze({
  B13: Object.freeze({ attributes: '', formula: 'SUM(B2:B12)' }),
  D13: Object.freeze({ attributes: '', formula: '+B13-C13' }),
  B33: Object.freeze({ attributes: '', formula: 'SUM(B16:B32)' }),
  D33: Object.freeze({ attributes: '', formula: '+B33-C33' }),
  B35: Object.freeze({ attributes: '', formula: '+B33+B13' }),
  D35: Object.freeze({
    attributes: ' t="shared" ref="D35" si="0"',
    formula: '+B35-C35',
  }),
});
const EXPECTED_LABELS = Object.freeze({
  A1: 'JURISDICCION 42',
  ...Object.fromEntries(EXPECTED_REPARTITIONS[42].map((code, index) => [
    `A${index + 2}`, `REP.${code}`,
  ])),
  A13: 'TOTAL',
  A15: 'JURISDICCION 55',
  ...Object.fromEntries(EXPECTED_REPARTITIONS[55].map((code, index) => [
    `A${index + 16}`, `REP.${code}`,
  ])),
  A33: 'TOTAL',
  A35: 'TOTAL GENERAL',
});
const EXPECTED_LITERAL_AMOUNTS = Object.freeze([
  ...Array.from({ length: 11 }, (_, index) => `B${index + 2}`),
  ...Array.from({ length: 17 }, (_, index) => `B${index + 16}`),
  'C13', 'C33', 'C35',
]);
const EXPECTED_EMPTY_CELLS = new Set(['B1', 'B15']);
const EXPECTED_CELLS = new Set([
  ...Object.keys(EXPECTED_LABELS),
  ...EXPECTED_LITERAL_AMOUNTS,
  ...Object.keys(EXPECTED_FORMULAS),
  ...EXPECTED_EMPTY_CELLS,
]);

export class JurisdictionNetControlError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'JurisdictionNetControlError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new JurisdictionNetControlError(code, message);
}

function checkedInt64(value) {
  if (value < MIN_INT64 || value > MAX_INT64) {
    fail(
      'JURISDICTION_CONTROL_INTEGER_OUT_OF_RANGE',
      'Un importe excede el rango exacto admitido por el control',
    );
  }
  return value;
}

function checkedAdd(left, right) {
  return checkedInt64(left + right);
}

function powerOfTen(exponent) {
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > 40) {
    fail(
      'JURISDICTION_CONTROL_AMOUNT_INVALID',
      'Un importe no usa una escala decimal admitida',
    );
  }
  return 10n ** BigInt(exponent);
}

/**
 * Excel stores cached formula results as binary-float decimal strings. This
 * function only removes a residue smaller than or equal to 0.001 cent. It
 * does not create a business tolerance: every comparison still uses cents
 * exactly and requires a difference of zero.
 */
export function jurisdictionControlAmountToCents(value, { allowNegative = false } = {}) {
  if (typeof value !== 'string') {
    fail(
      'JURISDICTION_CONTROL_AMOUNT_NOT_RAW',
      'Los importes deben leerse desde Excel como texto decimal sin pasar por Number',
    );
  }
  const match = RAW_DECIMAL.exec(value);
  if (!match) {
    fail('JURISDICTION_CONTROL_AMOUNT_INVALID', 'Un importe de la planilla no es decimal');
  }
  const negative = match[1] === '-';
  const integer = match[2];
  const fraction = match[3] || '';
  const exponent = Number(match[4] || '0');
  if (!Number.isSafeInteger(exponent) || exponent < -20 || exponent > 20) {
    fail('JURISDICTION_CONTROL_AMOUNT_INVALID', 'Un importe usa un exponente no admitido');
  }
  const digits = BigInt(`${integer}${fraction}`);
  const scale = fraction.length - exponent;
  let absoluteCents;
  if (scale <= 2) {
    absoluteCents = checkedInt64(digits * powerOfTen(2 - scale));
  } else {
    const denominator = powerOfTen(scale - 2);
    const quotient = digits / denominator;
    const remainder = digits % denominator;
    const roundsUp = remainder * 2n >= denominator;
    absoluteCents = checkedInt64(quotient + (roundsUp ? 1n : 0n));
    const distance = roundsUp ? denominator - remainder : remainder;
    if (distance * 1000n > denominator * JURISDICTION_NET_CONTROL_TECHNICAL_DRIFT_MILLICENTS) {
      fail(
        'JURISDICTION_CONTROL_SUBCENT_INVALID',
        'Un importe contiene una fracción de centavo que no parece residuo técnico de Excel',
      );
    }
  }
  if (negative && digits === 0n) {
    fail('JURISDICTION_CONTROL_AMOUNT_INVALID', 'El cero negativo no es un importe válido');
  }
  if (negative && !allowNegative) {
    fail('JURISDICTION_CONTROL_AMOUNT_NEGATIVE', 'Los netos por repartición no pueden ser negativos');
  }
  return checkedInt64(negative ? -absoluteCents : absoluteCents);
}

function exactInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).some((key) => !INPUT_KEYS.has(key))
      || [...INPUT_KEYS].some((key) => !Object.hasOwn(input, key))) {
    fail('JURISDICTION_CONTROL_INPUT_INVALID', 'El control exige un libro y contexto exactos');
  }
  if (typeof input.period !== 'string' || !PERIOD.test(input.period)) {
    fail('JURISDICTION_CONTROL_PERIOD_INVALID', 'El período debe usar YYYY-MM');
  }
  if (!Number.isInteger(input.byteLength) || input.byteLength <= 0
      || input.byteLength > JURISDICTION_NET_CONTROL_MAX_BYTES) {
    fail(
      'JURISDICTION_CONTROL_SIZE_INVALID',
      'El Excel está vacío o supera el máximo local de 512 KiB',
    );
  }
  if (typeof input.sha256 !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(input.sha256)) {
    fail('JURISDICTION_CONTROL_HASH_INVALID', 'La huella local del Excel no es válida');
  }
  if (input.formulaContractVerified !== true) {
    fail(
      'JURISDICTION_CONTROL_FORMULA_UNVERIFIED',
      'No se verificó la estructura de fórmulas del Excel',
    );
  }
  if (!Array.isArray(input.sheets) || input.sheets.length !== 1) {
    fail(
      'JURISDICTION_CONTROL_WORKBOOK_INVALID',
      'El archivo debe contener únicamente la hoja agregada CONTROL',
    );
  }
}

function parseStrictXmlAttributes(raw, allowed) {
  const attributes = new Map();
  const pattern = /\s+([A-Za-z_][\w.-]*)="([^"]*)"/g;
  let offset = 0;
  for (const match of raw.matchAll(pattern)) {
    if (match.index !== offset || attributes.has(match[1]) || !allowed.has(match[1])) {
      fail(
        'JURISDICTION_CONTROL_FORMULA_INVALID',
        'La hoja CONTROL contiene atributos XML no admitidos',
      );
    }
    attributes.set(match[1], match[2]);
    offset = match.index + match[0].length;
  }
  if (raw.slice(offset).trim() !== '') {
    fail(
      'JURISDICTION_CONTROL_FORMULA_INVALID',
      'La hoja CONTROL contiene atributos XML no admitidos',
    );
  }
  return attributes;
}

function strictSharedStrings(xml) {
  if (typeof xml !== 'string' || xml.length <= 0 || xml.length > 128 * 1024
      || /<\/?[A-Za-z_][\w.-]*:/.test(xml)) {
    fail(
      'JURISDICTION_CONTROL_FORMULA_XML_INVALID',
      'El libro no conserva la tabla de rótulos del formato verificado',
    );
  }
  const values = [];
  const itemPattern = /<si>([\s\S]*?)<\/si>/g;
  for (const match of xml.matchAll(itemPattern)) {
    const text = /^\s*<t>([^<]*)<\/t>\s*$/.exec(match[1]);
    if (!text) {
      fail(
        'JURISDICTION_CONTROL_FORMULA_INVALID',
        'El libro contiene un rótulo con una estructura no admitida',
      );
    }
    values.push(text[1]);
  }
  if (values.length === 0 || values.length !== (xml.match(/<si\b/g) || []).length) {
    fail(
      'JURISDICTION_CONTROL_FORMULA_INVALID',
      'El libro no conserva todos los rótulos del formato verificado',
    );
  }
  return values;
}

function numericValue(body) {
  const match = /^\s*<v>(-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)<\/v>\s*$/.exec(body);
  if (!match || !RAW_DECIMAL.test(match[1])) {
    fail(
      'JURISDICTION_CONTROL_FORMULA_INVALID',
      'La hoja CONTROL contiene un valor numérico fuera del formato verificado',
    );
  }
  return match[1];
}

export function validateJurisdictionNetControlFormulaXml(xml, sharedStringsXml) {
  if (typeof xml !== 'string' || xml.length <= 0 || xml.length > 256 * 1024) {
    fail(
      'JURISDICTION_CONTROL_FORMULA_XML_INVALID',
      'La hoja CONTROL no tiene un XML de tamaño admitido',
    );
  }
  // Deliberately narrow and versioned. Namespace-prefixed elements would be
  // accepted by a spreadsheet parser but could bypass the exact matcher.
  if (/<\/?[A-Za-z_][\w.-]*:/.test(xml)) {
    fail(
      'JURISDICTION_CONTROL_FORMULA_INVALID',
      'La hoja CONTROL usa una estructura XML distinta del formato verificado',
    );
  }
  const sharedStrings = strictSharedStrings(sharedStringsXml);
  const seen = new Map();
  const formulaSeen = new Map();
  const seenRows = new Set();
  const rowPattern = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  let rowCount = 0;
  for (const rowMatch of xml.matchAll(rowPattern)) {
    rowCount += 1;
    const rowAttributes = parseStrictXmlAttributes(
      rowMatch[1], new Set(['r', 'spans', 'ht', 'thickBot']),
    );
    const rowNumber = rowAttributes.get('r');
    if (!/^[1-9][0-9]*$/.test(rowNumber || '') || seenRows.has(rowNumber)) {
      fail('JURISDICTION_CONTROL_FORMULA_INVALID', 'Una fila no tiene posición válida');
    }
    seenRows.add(rowNumber);
    const body = rowMatch[2] || '';
    const cellPattern = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    const matchedCells = [...body.matchAll(cellPattern)];
    for (const cellMatch of matchedCells) {
      const cellAttributes = parseStrictXmlAttributes(
        cellMatch[1], new Set(['r', 's', 't']),
      );
      const reference = cellAttributes.get('r');
      const referenceMatch = /^([A-Z]{1,3})([1-9][0-9]*)$/.exec(reference || '');
      if (!referenceMatch || referenceMatch[2] !== rowNumber
          || seen.has(reference) || !EXPECTED_CELLS.has(reference)) {
        fail(
          'JURISDICTION_CONTROL_FORMULA_INVALID',
          'La hoja CONTROL contiene una celda fuera del mapa verificado',
        );
      }
      const cellBody = cellMatch[2];
      const expectedLabel = EXPECTED_LABELS[reference];
      const expectedFormula = EXPECTED_FORMULAS[reference];
      if (EXPECTED_EMPTY_CELLS.has(reference)) {
        if (cellBody !== undefined || cellAttributes.has('t')) {
          fail(
            'JURISDICTION_CONTROL_FORMULA_INVALID',
            'Una celda vacía del formato contiene información inesperada',
          );
        }
      } else if (expectedLabel !== undefined) {
        const sharedIndex = numericValue(cellBody);
        if (cellAttributes.get('t') !== 's' || !/^(?:0|[1-9][0-9]*)$/.test(sharedIndex)
            || sharedStrings[Number(sharedIndex)] !== expectedLabel) {
          fail(
            'JURISDICTION_CONTROL_FORMULA_INVALID',
            'La hoja CONTROL movió o alteró un rótulo del formato verificado',
          );
        }
      } else if (expectedFormula) {
        if (cellAttributes.has('t')) {
          fail('JURISDICTION_CONTROL_FORMULA_INVALID', 'Una fórmula cambió de tipo de celda');
        }
        const formula = /^\s*<f([^>]*)>([^<]*)<\/f>\s*<v>(-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)<\/v>\s*$/.exec(cellBody);
        if (!formula || formula[1] !== expectedFormula.attributes
            || formula[2] !== expectedFormula.formula || !RAW_DECIMAL.test(formula[3])) {
          fail(
            'JURISDICTION_CONTROL_FORMULA_INVALID',
            'La hoja CONTROL contiene una fórmula distinta del formato verificado',
          );
        }
        formulaSeen.set(reference, Object.freeze({
          attributes: formula[1], formula: formula[2], cachedValue: formula[3],
        }));
      } else {
        if (cellAttributes.has('t') || !EXPECTED_LITERAL_AMOUNTS.includes(reference)) {
          fail(
            'JURISDICTION_CONTROL_FORMULA_INVALID',
            'La hoja CONTROL contiene una celda literal fuera del formato verificado',
          );
        }
        numericValue(cellBody);
      }
      seen.set(reference, true);
    }
    if ((body.match(/<c\b/g) || []).length !== matchedCells.length) {
      fail(
        'JURISDICTION_CONTROL_FORMULA_INVALID',
        'La hoja CONTROL contiene una celda con estructura no admitida',
      );
    }
  }
  if (rowCount === 0 || rowCount !== (xml.match(/<row\b/g) || []).length
      || seen.size !== EXPECTED_CELLS.size
      || [...EXPECTED_CELLS].some((reference) => !seen.has(reference))
      || formulaSeen.size !== Object.keys(EXPECTED_FORMULAS).length) {
    fail(
      'JURISDICTION_CONTROL_FORMULA_INVALID',
      'La hoja CONTROL no conserva todas las filas y fórmulas verificadas',
    );
  }
  return Object.freeze({
    version: JURISDICTION_NET_CONTROL_FORMULA_VERSION,
    cellCount: seen.size,
    formulaCount: formulaSeen.size,
    verified: true,
  });
}

function controlSheet(sheets) {
  const matches = sheets.filter((sheet) => (
    sheet && typeof sheet === 'object' && !Array.isArray(sheet)
      && typeof sheet.sheet === 'string' && sheet.sheet.toUpperCase() === 'CONTROL'
  ));
  if (matches.length !== 1 || !Array.isArray(matches[0].data)) {
    fail(
      'JURISDICTION_CONTROL_SHEET_INVALID',
      'El libro debe contener una única hoja llamada CONTROL',
    );
  }
  return matches[0].data;
}

function normalizedRow(row) {
  if (!Array.isArray(row) || row.length > 4) {
    fail('JURISDICTION_CONTROL_ROW_INVALID', 'Una fila excede las cuatro columnas esperadas');
  }
  const values = [0, 1, 2, 3].map((index) => row[index] ?? null);
  for (const value of values) {
    if (value !== null && typeof value !== 'string') {
      fail(
        'JURISDICTION_CONTROL_CELL_INVALID',
        'La hoja contiene una celda que no pertenece al contrato agregado',
      );
    }
    if (typeof value === 'string' && value.trim() !== value) {
      fail('JURISDICTION_CONTROL_CELL_INVALID', 'La hoja contiene espacios ambiguos');
    }
  }
  return values;
}

function onlyExpectedCells(values, populatedIndexes) {
  return values.every((value, index) => populatedIndexes.includes(index)
    ? value !== null && value !== '' : value === null || value === '');
}

function issue(code, jurisdiction = null) {
  return Object.freeze({ code, jurisdiction });
}

function freezeSection(section) {
  return Object.freeze({
    jurisdiction: section.jurisdiction,
    repartitionCount: section.repartitions.length,
    repartitions: Object.freeze(section.repartitions.map((row) => Object.freeze({ ...row }))),
    rowsTotalCents: section.rowsTotalCents.toString(),
    reportedTotalCents: section.reportedTotalCents.toString(),
    referenceTotalCents: section.referenceTotalCents.toString(),
    differenceCents: section.differenceCents.toString(),
    rowsReportedDifferenceCents: section.rowsReportedDifferenceCents.toString(),
    recalculatedDifferenceCents: section.recalculatedDifferenceCents.toString(),
    rowsMatchReportedTotal: section.rowsMatchReportedTotal,
    reportedMatchesReference: section.reportedMatchesReference,
    differenceCellMatches: section.differenceCellMatches,
    matches: section.matches,
  });
}

export function parseJurisdictionNetControlRows(rows) {
  if (!Array.isArray(rows) || rows.length < 9 || rows.length > 100) {
    fail('JURISDICTION_CONTROL_ROWS_INVALID', 'La hoja CONTROL no tiene la estructura esperada');
  }
  const sections = [];
  const issues = [];
  let current = null;
  let general = null;

  for (const originalRow of rows) {
    const values = normalizedRow(originalRow);
    if (values.every((value) => value === null || value === '')) continue;
    const label = values[0];
    if (typeof label !== 'string' || label === '') {
      fail('JURISDICTION_CONTROL_LABEL_INVALID', 'Una fila no tiene rótulo en la columna A');
    }

    const jurisdictionMatch = JURISDICTION_LABEL.exec(label);
    if (jurisdictionMatch) {
      if (!onlyExpectedCells(values, [0]) || current || general) {
        fail('JURISDICTION_CONTROL_SECTION_INVALID', 'Una jurisdicción está fuera de orden');
      }
      const jurisdiction = jurisdictionMatch[1];
      if (jurisdiction !== EXPECTED_JURISDICTIONS[sections.length]) {
        fail('JURISDICTION_CONTROL_SECTION_INVALID', 'Se esperaban J42 y J55 en ese orden');
      }
      current = { jurisdiction, repartitions: [], codes: new Set(), rowsTotalCents: 0n };
      continue;
    }

    const repartitionMatch = REPARTITION_LABEL.exec(label);
    if (repartitionMatch) {
      if (!current || !onlyExpectedCells(values, [0, 1])) {
        fail('JURISDICTION_CONTROL_REPARTITION_INVALID', 'Una repartición está fuera de sección');
      }
      const repartitionCode = repartitionMatch[1];
      if (current.codes.has(repartitionCode)) {
        fail('JURISDICTION_CONTROL_REPARTITION_DUPLICATED', 'La planilla repite una repartición');
      }
      const netControlCents = jurisdictionControlAmountToCents(values[1]);
      current.codes.add(repartitionCode);
      current.rowsTotalCents = checkedAdd(current.rowsTotalCents, netControlCents);
      current.repartitions.push({
        repartitionCode,
        netControlCents: netControlCents.toString(),
      });
      continue;
    }

    if (label === 'TOTAL') {
      if (!current || current.repartitions.length === 0 || !onlyExpectedCells(values, [0, 1, 2, 3])) {
        fail('JURISDICTION_CONTROL_TOTAL_INVALID', 'Un total jurisdiccional está fuera de lugar');
      }
      const expectedCodes = EXPECTED_REPARTITIONS[current.jurisdiction];
      if (current.repartitions.length !== expectedCodes.length
          || current.repartitions.some((row, index) => row.repartitionCode !== expectedCodes[index])) {
        fail(
          'JURISDICTION_CONTROL_REPARTITION_ROSTER_INVALID',
          `J${current.jurisdiction} no conserva la lista verificada de reparticiones`,
        );
      }
      current.reportedTotalCents = jurisdictionControlAmountToCents(values[1]);
      current.referenceTotalCents = jurisdictionControlAmountToCents(values[2]);
      current.differenceCents = checkedInt64(
        current.reportedTotalCents - current.referenceTotalCents,
      );
      current.rowsReportedDifferenceCents = checkedInt64(
        current.rowsTotalCents - current.reportedTotalCents,
      );
      current.recalculatedDifferenceCents = checkedInt64(
        current.rowsTotalCents - current.referenceTotalCents,
      );
      const declaredDifference = jurisdictionControlAmountToCents(
        values[3], { allowNegative: true },
      );
      current.rowsMatchReportedTotal = current.rowsTotalCents === current.reportedTotalCents;
      current.reportedMatchesReference = current.differenceCents === 0n;
      current.differenceCellMatches = declaredDifference === current.differenceCents;
      current.matches = current.rowsMatchReportedTotal
        && current.reportedMatchesReference && current.differenceCellMatches;
      if (!current.rowsMatchReportedTotal) {
        issues.push(issue('ROWS_TOTAL_MISMATCH', current.jurisdiction));
      }
      if (!current.reportedMatchesReference) {
        issues.push(issue('REFERENCE_TOTAL_MISMATCH', current.jurisdiction));
      }
      if (!current.differenceCellMatches) {
        issues.push(issue('DECLARED_DIFFERENCE_MISMATCH', current.jurisdiction));
      }
      sections.push(freezeSection(current));
      current = null;
      continue;
    }

    if (label === 'TOTAL GENERAL') {
      if (current || sections.length !== 2 || general || !onlyExpectedCells(values, [0, 1, 2, 3])) {
        fail('JURISDICTION_CONTROL_GENERAL_INVALID', 'El total general está fuera de lugar');
      }
      const rowsTotalCents = sections.reduce(
        (total, section) => checkedAdd(total, BigInt(section.rowsTotalCents)), 0n,
      );
      const reportedTotalCents = jurisdictionControlAmountToCents(values[1]);
      const referenceTotalCents = jurisdictionControlAmountToCents(values[2]);
      const differenceCents = checkedInt64(reportedTotalCents - referenceTotalCents);
      const declaredDifference = jurisdictionControlAmountToCents(
        values[3], { allowNegative: true },
      );
      const sectionReportedTotal = sections.reduce(
        (total, section) => checkedAdd(total, BigInt(section.reportedTotalCents)), 0n,
      );
      const sectionReferenceTotal = sections.reduce(
        (total, section) => checkedAdd(total, BigInt(section.referenceTotalCents)), 0n,
      );
      general = {
        repartitionCount: sections.reduce((total, section) => total + section.repartitionCount, 0),
        rowsTotalCents,
        reportedTotalCents,
        referenceTotalCents,
        differenceCents,
        rowsReportedDifferenceCents: checkedInt64(rowsTotalCents - reportedTotalCents),
        recalculatedDifferenceCents: checkedInt64(rowsTotalCents - referenceTotalCents),
        rowsMatchReportedTotal: rowsTotalCents === reportedTotalCents
          && sectionReportedTotal === reportedTotalCents,
        referencesMatch: sectionReferenceTotal === referenceTotalCents,
        reportedMatchesReference: differenceCents === 0n,
        differenceCellMatches: declaredDifference === differenceCents,
      };
      general.matches = general.rowsMatchReportedTotal && general.referencesMatch
        && general.reportedMatchesReference && general.differenceCellMatches;
      if (!general.rowsMatchReportedTotal) issues.push(issue('GENERAL_ROWS_TOTAL_MISMATCH'));
      if (!general.referencesMatch) issues.push(issue('GENERAL_REFERENCE_TOTAL_MISMATCH'));
      if (!general.reportedMatchesReference) issues.push(issue('GENERAL_NET_MISMATCH'));
      if (!general.differenceCellMatches) issues.push(issue('GENERAL_DIFFERENCE_MISMATCH'));
      continue;
    }

    fail('JURISDICTION_CONTROL_LABEL_INVALID', 'La hoja contiene un rótulo no reconocido');
  }

  if (current || sections.length !== 2 || !general) {
    fail('JURISDICTION_CONTROL_STRUCTURE_INCOMPLETE', 'Faltan J42, J55 o el total general');
  }
  const matches = sections.every((section) => section.matches) && general.matches;
  return Object.freeze({
    status: matches ? 'matched' : 'blocked',
    readyForReview: matches,
    sections: Object.freeze(sections),
    general: Object.freeze({
      repartitionCount: general.repartitionCount,
      rowsTotalCents: general.rowsTotalCents.toString(),
      reportedTotalCents: general.reportedTotalCents.toString(),
      referenceTotalCents: general.referenceTotalCents.toString(),
      differenceCents: general.differenceCents.toString(),
      rowsReportedDifferenceCents: general.rowsReportedDifferenceCents.toString(),
      recalculatedDifferenceCents: general.recalculatedDifferenceCents.toString(),
      rowsMatchReportedTotal: general.rowsMatchReportedTotal,
      referencesMatch: general.referencesMatch,
      reportedMatchesReference: general.reportedMatchesReference,
      differenceCellMatches: general.differenceCellMatches,
      matches: general.matches,
    }),
    issues: Object.freeze(issues),
  });
}

export function prepareJurisdictionNetControlWorkbook(input) {
  exactInput(input);
  const parsed = parseJurisdictionNetControlRows(controlSheet(input.sheets));
  return Object.freeze({
    contractVersion: JURISDICTION_NET_CONTROL_VERSION,
    period: input.period,
    status: parsed.status,
    readyForReview: parsed.readyForReview,
    sections: parsed.sections,
    general: parsed.general,
    issues: parsed.issues,
    source: Object.freeze({
      sha256: input.sha256,
      byteLength: input.byteLength,
      sheet: 'CONTROL',
      provenanceState: 'operator_declared',
      cachedFormulaValuesUsed: true,
      formulaContractVersion: JURISDICTION_NET_CONTROL_FORMULA_VERSION,
      formulaContractVerified: true,
      totalsRecalculatedFromRows: true,
    }),
    normalizedOutputIncludesPersonalRecords: false,
    sourceCellsAggregatedContractVerified: true,
    sourceWorkbookMayIncludeAuthorMetadata: true,
    additionalDataSheetsAllowed: false,
    rawRowsReturned: false,
    persistencePerformed: false,
    sourceCertified: false,
    payrollCalculated: false,
    payrollPosted: false,
    closeApproved: false,
    bankInstructionGenerated: false,
    bankAccreditationProven: false,
    tribunalArtifactGenerated: false,
    fiscalArtifactGenerated: false,
  });
}

export function createJurisdictionNetControlCsv(control, jurisdiction) {
  if (!control || control.contractVersion !== JURISDICTION_NET_CONTROL_VERSION
      || !control.readyForReview || !PERIOD.test(control.period)
      || !EXPECTED_JURISDICTIONS.includes(jurisdiction)) {
    fail('JURISDICTION_CONTROL_EXPORT_BLOCKED', 'El control no está listo para exportar');
  }
  const section = control.sections.find((entry) => entry.jurisdiction === jurisdiction);
  if (!section || !section.matches) {
    fail('JURISDICTION_CONTROL_EXPORT_BLOCKED', 'La jurisdicción no está conciliada');
  }
  const lines = [JURISDICTION_NET_CONTROL_HEADER];
  for (const row of section.repartitions) {
    lines.push([
      control.period,
      jurisdiction,
      row.repartitionCode,
      row.netControlCents,
    ].join(';'));
  }
  return new TextEncoder().encode(`${lines.join('\r\n')}\r\n`);
}

export function formatJurisdictionControlCents(value) {
  const stringValue = String(value);
  if (!/^-?(?:0|[1-9][0-9]{0,18})$/.test(stringValue)) {
    fail('JURISDICTION_CONTROL_CENTS_INVALID', 'El resultado no contiene centavos válidos');
  }
  const parsed = BigInt(stringValue);
  checkedInt64(parsed);
  const negative = parsed < 0n;
  const digits = (negative ? stringValue.slice(1) : stringValue).padStart(3, '0');
  const integer = digits.slice(0, -2).replace(/\B(?=([0-9]{3})+(?![0-9]))/g, '.');
  return `${negative ? '-' : ''}$ ${integer},${digits.slice(-2)}`;
}

function appendCell(row, value, className = '', label = '') {
  const cell = document.createElement('td');
  cell.textContent = value;
  if (className) cell.className = className;
  if (label) cell.dataset.label = label;
  row.appendChild(cell);
}

function describeJurisdictionControlIssues(control) {
  const labels = {
    ROWS_TOTAL_MISMATCH: 'la suma por filas no coincide con el TOTAL guardado',
    REFERENCE_TOTAL_MISMATCH: 'el TOTAL guardado no coincide con la referencia',
    DECLARED_DIFFERENCE_MISMATCH: 'la diferencia guardada no coincide con TOTAL menos referencia',
    GENERAL_ROWS_TOTAL_MISMATCH: 'el total general no coincide con las sumas recalculadas',
    GENERAL_REFERENCE_TOTAL_MISMATCH: 'la referencia general no coincide con J42 más J55',
    GENERAL_NET_MISMATCH: 'el total general guardado no coincide con la referencia general',
    GENERAL_DIFFERENCE_MISMATCH: 'la diferencia general guardada es inconsistente',
  };
  return control.issues.map((entry) => {
    const scope = entry.jurisdiction ? `J${entry.jurisdiction}: ` : '';
    return `${scope}${labels[entry.code] || 'inconsistencia no reconocida'}`;
  }).join('; ');
}

function downloadBytes(bytes, suggestedName) {
  const blob = new Blob([bytes], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = suggestedName;
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function runLocalWorker(arrayBuffer, period, options = {}) {
  const WorkerImpl = options.WorkerImpl ?? globalThis.Worker;
  if (typeof WorkerImpl !== 'function') {
    return Promise.reject(new JurisdictionNetControlError(
      'JURISDICTION_CONTROL_WORKER_UNAVAILABLE',
      'El navegador no puede abrir el procesador local de Excel',
    ));
  }
  return new Promise((resolve, reject) => {
    const worker = new WorkerImpl(
      new URL('./monthly-close-jurisdiction-xlsx-worker.js', import.meta.url),
      { type: 'module', name: 'municontrol-jurisdiction-control' },
    );
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      worker.terminate();
      callback(value);
    };
    const timeoutId = setTimeout(() => finish(
      reject,
      new JurisdictionNetControlError(
        'JURISDICTION_CONTROL_TIMEOUT',
        'El Excel no pudo validarse dentro del tiempo esperado',
      ),
    ), 15000);
    worker.addEventListener('message', (event) => {
      if (event.data?.ok === true) finish(resolve, event.data.control);
      else finish(reject, new JurisdictionNetControlError(
        event.data?.code || 'JURISDICTION_CONTROL_WORKER_FAILED',
        event.data?.message || 'No se pudo validar el Excel local',
      ));
    }, { once: true });
    worker.addEventListener('error', () => finish(
      reject,
      new JurisdictionNetControlError(
        'JURISDICTION_CONTROL_WORKER_FAILED',
        'No se pudo iniciar el procesador local de Excel',
      ),
    ), { once: true });
    worker.postMessage({ type: 'prepare', period, arrayBuffer }, [arrayBuffer]);
  });
}

export function mountJurisdictionNetControlXlsx(root = document) {
  const host = root.querySelector('[data-monthly-close-precheck]');
  const form = host?.querySelector('[data-jurisdiction-xlsx-form]');
  if (!host || !form || form.dataset.mounted === 'true') return false;
  const period = form.querySelector('[data-jurisdiction-xlsx-period]');
  const fileInput = form.querySelector('[data-jurisdiction-xlsx-file]');
  const fileState = form.querySelector('[data-jurisdiction-xlsx-file-state]');
  const submit = form.querySelector('[data-jurisdiction-xlsx-submit]');
  const reset = form.querySelector('[data-jurisdiction-xlsx-reset]');
  const status = host.querySelector('[data-jurisdiction-xlsx-status]');
  const result = host.querySelector('[data-jurisdiction-xlsx-result]');
  const rows = host.querySelector('[data-jurisdiction-xlsx-rows]');
  const totalRows = host.querySelector('[data-jurisdiction-xlsx-total-rows]');
  const totalRecalculated = host.querySelector('[data-jurisdiction-xlsx-total-recalculated]');
  const totalSaved = host.querySelector('[data-jurisdiction-xlsx-total-saved]');
  const totalReference = host.querySelector('[data-jurisdiction-xlsx-total-reference]');
  const totalDifference = host.querySelector('[data-jurisdiction-xlsx-total-difference]');
  const evidence = host.querySelector('[data-jurisdiction-xlsx-evidence]');
  const details = host.querySelector('[data-jurisdiction-xlsx-details]');
  const export42 = host.querySelector('[data-jurisdiction-xlsx-export="42"]');
  const export55 = host.querySelector('[data-jurisdiction-xlsx-export="55"]');
  if (!period || !fileInput || !fileState || !submit || !reset || !status || !result
      || !rows || !totalRows || !totalRecalculated || !totalSaved || !totalReference || !totalDifference
      || !evidence || !details || !export42 || !export55) return false;
  let sequence = 0;
  let latestControl = null;

  function setStatus(state, message) {
    status.dataset.state = state;
    status.textContent = message;
  }

  function clearResult() {
    latestControl = null;
    result.hidden = true;
    rows.replaceChildren();
    details.replaceChildren();
    for (const output of [
      totalRows, totalRecalculated, totalSaved, totalReference, totalDifference,
    ]) {
      output.textContent = '—';
    }
    evidence.textContent = 'Sin huella calculada.';
    export42.disabled = true;
    export55.disabled = true;
  }

  function updateFileState() {
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
      fileState.dataset.state = '';
      fileState.textContent = 'No hay un archivo seleccionado.';
      fileInput.setAttribute('aria-invalid', 'false');
      return;
    }
    const oversized = file.size > JURISDICTION_NET_CONTROL_MAX_BYTES;
    fileState.dataset.state = oversized ? 'error' : 'ready';
    fileState.textContent = oversized
      ? `Archivo seleccionado · ${file.size} bytes · supera 512 KiB.`
      : `Archivo seleccionado · ${file.size} bytes.`;
    fileInput.setAttribute('aria-invalid', String(oversized));
  }

  function render(control) {
    rows.replaceChildren();
    details.replaceChildren();
    for (const section of control.sections) {
      const row = document.createElement('tr');
      appendCell(row, `J${section.jurisdiction}`, '', 'Jurisdicción');
      appendCell(row, String(section.repartitionCount), 'numeric', 'Reparticiones');
      appendCell(row, formatJurisdictionControlCents(section.rowsTotalCents), 'numeric', 'Suma recalculada');
      appendCell(row, formatJurisdictionControlCents(section.reportedTotalCents), 'numeric', 'Total guardado');
      appendCell(row, formatJurisdictionControlCents(section.referenceTotalCents), 'numeric', 'Referencia del archivo');
      appendCell(row, formatJurisdictionControlCents(section.recalculatedDifferenceCents), 'numeric', 'Diferencia recalculada');
      appendCell(row, section.matches ? 'Coincide' : 'Revisar', '', 'Estado');
      rows.appendChild(row);
      for (const repartition of section.repartitions) {
        const detailRow = document.createElement('tr');
        appendCell(detailRow, `J${section.jurisdiction}`, '', 'Jurisdicción');
        appendCell(detailRow, repartition.repartitionCode, '', 'Repartición');
        appendCell(
          detailRow,
          formatJurisdictionControlCents(repartition.netControlCents),
          'numeric',
          'Neto informado',
        );
        details.appendChild(detailRow);
      }
    }
    totalRows.textContent = String(control.general.repartitionCount);
    totalRecalculated.textContent = formatJurisdictionControlCents(control.general.rowsTotalCents);
    totalSaved.textContent = formatJurisdictionControlCents(control.general.reportedTotalCents);
    totalReference.textContent = formatJurisdictionControlCents(control.general.referenceTotalCents);
    totalDifference.textContent = formatJurisdictionControlCents(
      control.general.recalculatedDifferenceCents,
    );
    evidence.textContent = `${control.general.repartitionCount} reparticiones agregadas · ${control.source.byteLength} bytes · ${control.source.sha256}`;
    setStatus(
      control.readyForReview ? '' : 'error',
      control.readyForReview
        ? 'J42, J55 y el total general coinciden exactamente. Control local listo para revisión.'
        : `Control bloqueado: ${describeJurisdictionControlIssues(control)}.`,
    );
    result.hidden = false;
    latestControl = control;
    export42.disabled = !control.readyForReview;
    export55.disabled = !control.readyForReview;
  }

  for (const input of [period, fileInput]) {
    input.addEventListener('change', () => {
      sequence += 1;
      input.setAttribute('aria-invalid', 'false');
      if (input === fileInput) updateFileState();
      clearResult();
      setStatus('', 'Contexto modificado. Validá nuevamente la planilla.');
    });
  }

  reset.addEventListener('click', () => {
    sequence += 1;
    form.reset();
    updateFileState();
    clearResult();
    setStatus('', 'Esperando período y Excel agregado.');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const file = fileInput.files && fileInput.files[0];
    period.setAttribute('aria-invalid', String(!period.value));
    fileInput.setAttribute('aria-invalid', String(!file));
    if (!period.value || !file) {
      setStatus('error', 'Seleccioná el período y el Excel CONTROL DE JURISDICCION.');
      (!period.value ? period : fileInput).focus();
      return;
    }
    if (file.size <= 0 || file.size > JURISDICTION_NET_CONTROL_MAX_BYTES) {
      fileInput.setAttribute('aria-invalid', 'true');
      setStatus('error', 'El Excel está vacío o supera el máximo local de 512 KiB.');
      fileInput.focus();
      return;
    }
    const current = ++sequence;
    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');
    clearResult();
    setStatus('', 'Leyendo la hoja CONTROL y recalculando J42, J55 y total general…');
    try {
      const arrayBuffer = await file.arrayBuffer();
      const control = await runLocalWorker(arrayBuffer, period.value);
      if (current !== sequence) return;
      if (control.period !== period.value) {
        throw new JurisdictionNetControlError(
          'JURISDICTION_CONTROL_PERIOD_CHANGED',
          'El período cambió durante la validación',
        );
      }
      render(control);
      fileInput.value = '';
      updateFileState();
    } catch (error) {
      if (current !== sequence) return;
      clearResult();
      fileInput.setAttribute('aria-invalid', 'true');
      setStatus(
        'error',
        error instanceof JurisdictionNetControlError
          ? error.message : 'No se pudo validar la planilla local.',
      );
    } finally {
      submit.disabled = false;
      submit.removeAttribute('aria-busy');
    }
  });

  for (const button of [export42, export55]) {
    button.addEventListener('click', () => {
      if (!latestControl) return;
      const jurisdiction = button.dataset.jurisdictionXlsxExport;
      const bytes = createJurisdictionNetControlCsv(latestControl, jurisdiction);
      downloadBytes(
        bytes,
        `municontrol_control-neto_${latestControl.period}_jurisdiccion-${jurisdiction}.csv`,
      );
    });
  }

  form.dataset.mounted = 'true';
  return true;
}

if (typeof document !== 'undefined') mountJurisdictionNetControlXlsx(document);
