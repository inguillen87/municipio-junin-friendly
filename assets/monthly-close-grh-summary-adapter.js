export const PAYROLL_MONTHLY_GRH_SUMMARY_VERSION = 'payroll-monthly-grh-summary.v1';
export const PAYROLL_MONTHLY_GRH_SUMMARY_PARSER_VERSION =
  'grh-concept-statistics-pdf-layout.v1';
export const PAYROLL_MONTHLY_GRH_SUMMARY_MAX_FILE_BYTES = 512 * 1024;
export const PAYROLL_MONTHLY_GRH_SUMMARY_MAX_PAGES = 10;
export const PAYROLL_MONTHLY_GRH_SUMMARY_CONCEPT_HEADER =
  'periodo;jurisdiccion;reparticion_codigo;concepto_codigo;ocurrencias;cantidad_centesimas;haberes_rem_centavos;haberes_no_rem_centavos;asignaciones_familiares_centavos;retenciones_centavos;contribuciones_centavos';

const PERIOD = /^(?:19|20)[0-9]{2}-(?:0[1-9]|1[0-2])$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const PDF_KINDS = Object.freeze(['42', '55', 'general']);
const EXPECTED_REPORT_KEYS = new Set([
  'expectedKind', 'byteLength', 'sha256', 'pages',
]);
const EXPECTED_PAGE_KEYS = new Set(['pageNumber', 'width', 'height', 'items']);
const EXPECTED_ITEM_KEYS = new Set(['text', 'x', 'y']);
const COMPONENTS = Object.freeze([
  'occurrences',
  'quantityHundredths',
  'remunerativeCents',
  'nonRemunerativeCents',
  'familyAllowancesCents',
  'retentionsCents',
  'contributionsCents',
]);
const MONEY_COMPONENTS = Object.freeze([
  'remunerativeCents',
  'nonRemunerativeCents',
  'familyAllowancesCents',
  'retentionsCents',
  'contributionsCents',
]);
const MAX_INT64 = 9223372036854775807n;
const MIN_INT64 = -9223372036854775808n;
const MAX_INT32 = 2147483647n;
const MAX_TEXT_ITEMS = 12000;
const MAX_CONCEPT_ROWS = 500;
const LINE_TOLERANCE = 0.9;
const BODY_COLUMNS = Object.freeze({
  occurrences: Object.freeze([230, 260]),
  quantityHundredths: Object.freeze([260, 298]),
  remunerativeCents: Object.freeze([298, 348]),
  nonRemunerativeCents: Object.freeze([348, 400]),
  familyAllowancesCents: Object.freeze([400, 448]),
  retentionsCents: Object.freeze([448, 502]),
  contributionsCents: Object.freeze([502, 560]),
});

export class PayrollMonthlyGrhSummaryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PayrollMonthlyGrhSummaryError';
    this.code = code;
  }
}

export function pdfMetadataCollectionHasEntries(value) {
  if (value === null || value === undefined) return false;
  if (value instanceof Map || value instanceof Set) return value.size > 0;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return Object.keys(value).length > 0;
  }
  return true;
}

function fail(code, message) {
  throw new PayrollMonthlyGrhSummaryError(code, message);
}

function exactKeys(value, keys, code, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== keys.size
      || Object.keys(value).some((key) => !keys.has(key))
      || [...keys].some((key) => !Object.hasOwn(value, key))) {
    fail(code, message);
  }
}

function checkedInt64(value) {
  if (value < MIN_INT64 || value > MAX_INT64) {
    fail(
      'GRH_SUMMARY_INTEGER_OUT_OF_RANGE',
      'Un importe o acumulado excede el rango entero exacto admitido',
    );
  }
  return value;
}

function checkedAdd(left, right) {
  return checkedInt64(left + right);
}

function checkedSubtract(left, right) {
  return checkedInt64(left - right);
}

function canonicalText(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function localeInteger(value, { positive = false } = {}) {
  const pattern = positive
    ? /^(?:[1-9][0-9]{0,2}(?:\.[0-9]{3})*)$/
    : /^(?:0|[1-9][0-9]{0,2}(?:\.[0-9]{3})*)$/;
  if (typeof value !== 'string' || !pattern.test(value)) {
    fail('GRH_SUMMARY_INTEGER_INVALID', 'Una cantidad no usa el formato impreso por GRH');
  }
  return checkedInt64(BigInt(value.replaceAll('.', '')));
}

function localePositiveInt32(value) {
  const parsed = localeInteger(value, { positive: true });
  if (parsed > MAX_INT32) {
    fail('GRH_SUMMARY_COUNT_INVALID', 'Una ocurrencia excede el rango admitido por el conciliador');
  }
  return parsed;
}

function localeHundredths(value) {
  if (typeof value !== 'string'
      || !/^(?:0|[1-9][0-9]{0,2}(?:\.[0-9]{3})*),[0-9]{2}$/.test(value)) {
    fail('GRH_SUMMARY_QUANTITY_INVALID', 'Una cantidad no conserva dos decimales');
  }
  return checkedInt64(BigInt(value.replaceAll('.', '').replace(',', '')));
}

function localeMoney(value) {
  if (typeof value !== 'string'
      || !/^-?(?:0|[1-9][0-9]{0,2}(?:\.[0-9]{3})*),[0-9]{2}$/.test(value)
      || value === '-0,00') {
    fail('GRH_SUMMARY_MONEY_INVALID', 'Un importe no usa pesos con dos centavos exactos');
  }
  return checkedInt64(BigInt(value.replaceAll('.', '').replace(',', '')));
}

function canonicalItem(item, page) {
  exactKeys(
    item,
    EXPECTED_ITEM_KEYS,
    'GRH_SUMMARY_TEXT_ITEM_INVALID',
    'El PDF contiene un fragmento de texto fuera del contrato del parser',
  );
  if (typeof item.text !== 'string' || item.text.length === 0 || item.text.length > 256
      || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(item.text)
      || !Number.isFinite(item.x) || !Number.isFinite(item.y)
      || item.x < -1 || item.x > page.width + 1 || item.y < -1 || item.y > page.height + 1) {
    fail(
      'GRH_SUMMARY_TEXT_ITEM_INVALID',
      'El PDF contiene un fragmento de texto o coordenada fuera del formato admitido',
    );
  }
  return Object.freeze({ text: item.text, x: item.x, y: item.y });
}

function canonicalPages(report) {
  if (!Array.isArray(report.pages) || report.pages.length < 1
      || report.pages.length > PAYROLL_MONTHLY_GRH_SUMMARY_MAX_PAGES) {
    fail('GRH_SUMMARY_PAGE_COUNT_INVALID', 'El PDF no tiene una cantidad de páginas admitida');
  }
  let itemCount = 0;
  return Object.freeze(report.pages.map((page, index) => {
    exactKeys(
      page,
      EXPECTED_PAGE_KEYS,
      'GRH_SUMMARY_PAGE_INVALID',
      'Una página no coincide con el contrato del parser',
    );
    if (page.pageNumber !== index + 1
        || !Number.isFinite(page.width) || page.width < 560 || page.width > 630
        || !Number.isFinite(page.height) || page.height < 800 || page.height > 880
        || !Array.isArray(page.items) || page.items.length === 0) {
      fail('GRH_SUMMARY_PAGE_INVALID', 'El PDF no conserva el formato A4 esperado de GRH');
    }
    itemCount += page.items.length;
    if (itemCount > MAX_TEXT_ITEMS) {
      fail('GRH_SUMMARY_TEXT_LIMIT_EXCEEDED', 'El PDF supera el límite de texto local');
    }
    const shell = { width: page.width, height: page.height };
    return Object.freeze({
      pageNumber: page.pageNumber,
      width: page.width,
      height: page.height,
      items: Object.freeze(page.items.map((item) => canonicalItem(item, shell))),
    });
  }));
}

function canonicalReport(report) {
  exactKeys(
    report,
    EXPECTED_REPORT_KEYS,
    'GRH_SUMMARY_REPORT_INVALID',
    'Cada fuente debe contener únicamente su tipo esperado, huella, tamaño y páginas',
  );
  if (!PDF_KINDS.includes(report.expectedKind)) {
    fail('GRH_SUMMARY_KIND_INVALID', 'El tipo esperado debe ser J42, J55 o General');
  }
  if (!Number.isInteger(report.byteLength) || report.byteLength <= 0
      || report.byteLength > PAYROLL_MONTHLY_GRH_SUMMARY_MAX_FILE_BYTES) {
    fail('GRH_SUMMARY_SIZE_INVALID', 'Un PDF está vacío o supera el máximo local de 512 KiB');
  }
  if (typeof report.sha256 !== 'string' || !SHA256.test(report.sha256)) {
    fail('GRH_SUMMARY_HASH_INVALID', 'La huella SHA-256 de un PDF no es válida');
  }
  return Object.freeze({
    expectedKind: report.expectedKind,
    byteLength: report.byteLength,
    sha256: report.sha256,
    pages: canonicalPages(report),
  });
}

function groupedLines(page) {
  const groups = [];
  const ordered = [...page.items].sort((left, right) => (
    right.y - left.y || left.x - right.x
  ));
  for (const item of ordered) {
    let group = groups.find((candidate) => Math.abs(candidate.y - item.y) <= LINE_TOLERANCE);
    if (!group) {
      group = { y: item.y, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return Object.freeze(groups
    .sort((left, right) => right.y - left.y)
    .map((group) => {
      const items = Object.freeze([...group.items].sort((left, right) => left.x - right.x));
      return Object.freeze({
        pageNumber: page.pageNumber,
        y: group.y,
        items,
        text: items.map((item) => item.text).join(' ').replace(/\s+/g, ' ').trim(),
      });
    }));
}

function singleMetadataField(lines, prefix, pattern, code, message) {
  const candidates = lines
    .map((line) => canonicalText(line.text))
    .filter((line) => line.startsWith(prefix));
  if (candidates.length !== 1) fail(code, message);
  const match = candidates[0].match(pattern);
  if (!match) fail(code, message);
  return match[1];
}

function reportMetadata(report, lines) {
  const firstPageLines = lines.filter((line) => line.pageNumber === 1);
  const titleCount = firstPageLines.filter((line) => (
    canonicalText(line.text) === 'ESTADISTICA DE CONCEPTOS LIQUIDADOS'
  )).length;
  if (titleCount !== 1) {
    fail(
      'GRH_SUMMARY_LAYOUT_INVALID',
      'El PDF no es la estadística agregada por concepto esperada',
    );
  }
  const year = singleMetadataField(
    firstPageLines,
    'PERIODO:',
    /^PERIODO:\s*((?:19|20)[0-9]{2})(?:\s*\*)?\s*$/,
    'GRH_SUMMARY_PERIOD_AMBIGUOUS',
    'No se pudo identificar un único año dentro del PDF',
  );
  const monthRaw = singleMetadataField(
    firstPageLines,
    'MES:',
    /^MES:\s*([0-9]{1,2})(?:\s*\*)?\s*$/,
    'GRH_SUMMARY_PERIOD_AMBIGUOUS',
    'No se pudo identificar un único mes dentro del PDF',
  );
  const month = Number(monthRaw);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    fail('GRH_SUMMARY_PERIOD_INVALID', 'El mes informado por GRH no es válido');
  }
  const liquidationType = singleMetadataField(
    firstPageLines,
    'TIPO DE LIQUIDACION:',
    /^TIPO DE LIQUIDACION:\s*([^*]+?)\s*$/,
    'GRH_SUMMARY_LIQUIDATION_TYPE_AMBIGUOUS',
    'No se pudo identificar un único tipo de liquidación',
  );
  if (liquidationType !== 'MES') {
    fail(
      'GRH_SUMMARY_LIQUIDATION_TYPE_INVALID',
      'Sólo se admite Tipo de Liquidación: Mes; TODAS LIQUIDACIONES queda bloqueado',
    );
  }
  const convenio = singleMetadataField(
    firstPageLines,
    'CONVENIO:',
    /^CONVENIO:\s*(.+?)\s*$/,
    'GRH_SUMMARY_CONVENTION_AMBIGUOUS',
    'No se pudo identificar un único convenio',
  );
  const repartition = singleMetadataField(
    firstPageLines,
    'REPARTICION:',
    /^REPARTICION:\s*(.+?)\s*$/,
    'GRH_SUMMARY_REPARTITION_AMBIGUOUS',
    'No se pudo identificar una única repartición',
  );
  const grouping = singleMetadataField(
    firstPageLines,
    'AGRUPAR POR:',
    /^AGRUPAR POR:\s*(.+?)\s*$/,
    'GRH_SUMMARY_GROUPING_AMBIGUOUS',
    'No se pudo identificar una única agrupación',
  );
  if (convenio !== 'TODOS' || repartition !== 'TODAS' || grouping !== 'CONCEPTO') {
    fail(
      'GRH_SUMMARY_LAYOUT_INVALID',
      'El PDF debe informar convenio TODOS, repartición TODAS y agrupación por concepto',
    );
  }
  const jurisdiction = singleMetadataField(
    firstPageLines,
    'JURISDICCION:',
    /^JURISDICCION:\s*(.+?)\s*$/,
    'GRH_SUMMARY_JURISDICTION_AMBIGUOUS',
    'No se pudo identificar una única jurisdicción',
  );
  let detectedKind;
  if (/^1\s*-\s*042$/.test(jurisdiction)) detectedKind = '42';
  else if (/^2\s*-\s*055$/.test(jurisdiction)) detectedKind = '55';
  else if (jurisdiction === 'TODAS') detectedKind = 'general';
  else fail('GRH_SUMMARY_JURISDICTION_INVALID', 'La jurisdicción del PDF no es 42, 55 ni TODAS');
  if (detectedKind !== report.expectedKind) {
    fail(
      'GRH_SUMMARY_SLOT_MISMATCH',
      'Un PDF fue colocado en una jurisdicción distinta de la que informa su contenido',
    );
  }
  return Object.freeze({
    period: `${year}-${String(month).padStart(2, '0')}`,
    detectedKind,
  });
}

function columnItems(line, component) {
  const [minimum, maximum] = BODY_COLUMNS[component];
  return line.items.filter((item) => item.x >= minimum && item.x < maximum);
}

function optionalColumnValue(line, component, parser) {
  const values = columnItems(line, component);
  if (values.length > 1) {
    fail(
      'GRH_SUMMARY_ROW_AMBIGUOUS',
      `Una fila contiene más de un valor en la columna ${component}`,
    );
  }
  return values.length === 0 ? 0n : parser(values[0].text);
}

function parseConceptRows(lines) {
  const concepts = new Map();
  for (const line of lines) {
    const prefixes = line.items.filter((item) => (
      item.x >= 40 && item.x < 80 && canonicalText(item.text) === 'TODOS'
    ));
    if (prefixes.length === 0) continue;
    if (prefixes.length !== 1) {
      fail('GRH_SUMMARY_ROW_AMBIGUOUS', 'Una fila agregada contiene un prefijo ambiguo');
    }
    const codes = line.items.filter((item) => (
      item.x >= 88 && item.x < 125 && /^[0-9]{1,8}$/.test(item.text)
    ));
    if (codes.length !== 1) {
      fail('GRH_SUMMARY_ROW_AMBIGUOUS', 'Una fila agregada no contiene un único concepto');
    }
    const conceptCode = codes[0].text;
    if (concepts.has(conceptCode)) {
      fail('GRH_SUMMARY_CONCEPT_DUPLICATED', 'El PDF repite un concepto en más de una fila');
    }
    const row = Object.freeze({
      conceptCode,
      occurrences: optionalColumnValue(line, 'occurrences', localePositiveInt32),
      quantityHundredths: optionalColumnValue(line, 'quantityHundredths', localeHundredths),
      remunerativeCents: optionalColumnValue(line, 'remunerativeCents', localeMoney),
      nonRemunerativeCents: optionalColumnValue(line, 'nonRemunerativeCents', localeMoney),
      familyAllowancesCents: optionalColumnValue(line, 'familyAllowancesCents', localeMoney),
      retentionsCents: optionalColumnValue(line, 'retentionsCents', localeMoney),
      contributionsCents: optionalColumnValue(line, 'contributionsCents', localeMoney),
    });
    if (row.occurrences <= 0n || MONEY_COMPONENTS.every((key) => row[key] === 0n)) {
      fail('GRH_SUMMARY_ROW_EMPTY', 'Una fila agregada no informa ocurrencias e importes');
    }
    concepts.set(conceptCode, row);
    if (concepts.size > MAX_CONCEPT_ROWS) {
      fail('GRH_SUMMARY_ROW_LIMIT_EXCEEDED', 'El PDF supera el máximo de conceptos admitido');
    }
  }
  if (concepts.size === 0) {
    fail('GRH_SUMMARY_ROWS_MISSING', 'El PDF no contiene filas agregadas de conceptos');
  }
  return concepts;
}

function emptyTotals() {
  return {
    occurrences: 0n,
    quantityHundredths: 0n,
    remunerativeCents: 0n,
    nonRemunerativeCents: 0n,
    familyAllowancesCents: 0n,
    retentionsCents: 0n,
    contributionsCents: 0n,
  };
}

function sumConcepts(concepts) {
  const totals = emptyTotals();
  for (const row of concepts.values()) {
    for (const key of COMPONENTS) totals[key] = checkedAdd(totals[key], row[key]);
  }
  return totals;
}

function moneyNet(totals) {
  return checkedSubtract(
    checkedAdd(
      checkedAdd(totals.remunerativeCents, totals.nonRemunerativeCents),
      totals.familyAllowancesCents,
    ),
    totals.retentionsCents,
  );
}

function earningsPlusContributions(totals) {
  return checkedAdd(
    checkedAdd(
      checkedAdd(totals.remunerativeCents, totals.nonRemunerativeCents),
      totals.familyAllowancesCents,
    ),
    totals.contributionsCents,
  );
}

function footerTotals(line) {
  return {
    occurrences: optionalColumnValue(line, 'occurrences', (value) => (
      localeInteger(value, { positive: true })
    )),
    remunerativeCents: optionalColumnValue(line, 'remunerativeCents', localeMoney),
    nonRemunerativeCents: optionalColumnValue(line, 'nonRemunerativeCents', localeMoney),
    familyAllowancesCents: optionalColumnValue(line, 'familyAllowancesCents', localeMoney),
    retentionsCents: optionalColumnValue(line, 'retentionsCents', localeMoney),
    contributionsCents: optionalColumnValue(line, 'contributionsCents', localeMoney),
  };
}

function singleMoneyFromLine(line, code, message) {
  const values = line.items
    .map((item) => item.text)
    .filter((value) => /^-?(?:0|[1-9][0-9]{0,2}(?:\.[0-9]{3})*),[0-9]{2}$/.test(value));
  if (values.length !== 1) fail(code, message);
  return localeMoney(values[0]);
}

function assertFooter(lines, pages, totals) {
  const totalLines = lines.filter((line) => line.items.some((item) => (
    item.x >= 85 && item.x < 210 && canonicalText(item.text) === 'TOTALES:'
  )));
  const netLines = lines.filter((line) => canonicalText(line.text).startsWith(
    'HABERES - RETENCIONES:',
  ));
  const plusLines = lines.filter((line) => canonicalText(line.text).startsWith('HABERES +'));
  const expectedNet = moneyNet(totals);
  const expectedPlus = earningsPlusContributions(totals);
  let expectedFooter = null;
  for (const page of pages) {
    const pageTotals = totalLines.filter((line) => line.pageNumber === page.pageNumber);
    const pageNets = netLines.filter((line) => line.pageNumber === page.pageNumber);
    const pagePluses = plusLines.filter((line) => line.pageNumber === page.pageNumber);
    if (pageTotals.length !== 1 || pageNets.length !== 1 || pagePluses.length !== 1) {
      fail(
        'GRH_SUMMARY_FOOTER_AMBIGUOUS',
        'Cada página debe conservar un único bloque de totales del reporte',
      );
    }
    const candidate = footerTotals(pageTotals[0]);
    for (const key of ['occurrences', ...MONEY_COMPONENTS]) {
      if (candidate[key] !== totals[key]) {
        fail('GRH_SUMMARY_FOOTER_MISMATCH', 'Los totales impresos no coinciden con las filas');
      }
      if (expectedFooter && candidate[key] !== expectedFooter[key]) {
        fail('GRH_SUMMARY_FOOTER_MISMATCH', 'Los totales repetidos entre páginas difieren');
      }
    }
    expectedFooter = candidate;
    if (singleMoneyFromLine(
      pageNets[0],
      'GRH_SUMMARY_NET_AMBIGUOUS',
      'No se pudo leer un único total Haberes menos Retenciones',
    ) !== expectedNet) {
      fail('GRH_SUMMARY_NET_MISMATCH', 'Haberes menos Retenciones no coincide con las filas');
    }
    if (singleMoneyFromLine(
      pagePluses[0],
      'GRH_SUMMARY_COST_AMBIGUOUS',
      'No se pudo leer un único total Haberes más Contribuciones',
    ) !== expectedPlus) {
      fail('GRH_SUMMARY_COST_MISMATCH', 'Haberes más Contribuciones no coincide con las filas');
    }
  }
  return Object.freeze({
    reportedNetCents: expectedNet,
    reportedEarningsPlusContributionsCents: expectedPlus,
  });
}

function stringifyRow(row) {
  return Object.freeze(Object.fromEntries([
    ['conceptCode', row.conceptCode],
    ...COMPONENTS.map((key) => [key, row[key].toString()]),
  ]));
}

function parseReport(report, requestedPeriod) {
  const lines = Object.freeze(report.pages.flatMap(groupedLines));
  const metadata = reportMetadata(report, lines);
  if (metadata.period !== requestedPeriod) {
    fail('GRH_SUMMARY_PERIOD_MISMATCH', 'Un PDF no pertenece al período seleccionado');
  }
  const concepts = parseConceptRows(lines);
  const totals = sumConcepts(concepts);
  const footer = assertFooter(lines, report.pages, totals);
  const orderedConcepts = Object.freeze([...concepts.values()]
    .sort((left, right) => left.conceptCode.localeCompare(
      right.conceptCode,
      'en',
      { numeric: true },
    ))
    .map(stringifyRow));
  return Object.freeze({
    kind: metadata.detectedKind,
    jurisdiction: metadata.detectedKind === 'general' ? null : metadata.detectedKind,
    conceptCount: orderedConcepts.length,
    concepts: orderedConcepts,
    totals: Object.freeze(Object.fromEntries([
      ...COMPONENTS.map((key) => [key, totals[key].toString()]),
      ['netCents', footer.reportedNetCents.toString()],
      ['earningsPlusContributionsCents',
        footer.reportedEarningsPlusContributionsCents.toString()],
    ])),
    source: Object.freeze({
      sha256: report.sha256,
      byteLength: report.byteLength,
      pageCount: report.pages.length,
      sourceLayout: 'grh-concept-statistics-aggregate-by-concept',
    }),
  });
}

function conceptMap(report) {
  return new Map(report.concepts.map((row) => [row.conceptCode, row]));
}

function compareReports(j42, j55, general) {
  const maps = [conceptMap(j42), conceptMap(j55), conceptMap(general)];
  const codes = [...new Set(maps.flatMap((map) => [...map.keys()]))]
    .sort((left, right) => left.localeCompare(right, 'en', { numeric: true }));
  let comparisonCount = 0;
  for (const code of codes) {
    for (const component of COMPONENTS) {
      const left = BigInt(maps[0].get(code)?.[component] ?? '0');
      const right = BigInt(maps[1].get(code)?.[component] ?? '0');
      const reported = BigInt(maps[2].get(code)?.[component] ?? '0');
      if (checkedAdd(left, right) !== reported) {
        fail(
          'GRH_SUMMARY_CROSS_REPORT_MISMATCH',
          `J42 + J55 no coincide con General en el concepto ${code} (${component})`,
        );
      }
      comparisonCount += 1;
    }
  }
  for (const component of [...COMPONENTS, 'netCents', 'earningsPlusContributionsCents']) {
    if (checkedAdd(BigInt(j42.totals[component]), BigInt(j55.totals[component]))
        !== BigInt(general.totals[component])) {
      fail(
        'GRH_SUMMARY_CROSS_REPORT_MISMATCH',
        `J42 + J55 no coincide con General en el total ${component}`,
      );
    }
  }
  return Object.freeze({
    equation: 'jurisdiction_42 + jurisdiction_55 = general',
    toleranceCents: '0',
    conceptCount: codes.length,
    componentComparisons: comparisonCount,
    netDifferenceCents: checkedSubtract(
      checkedAdd(BigInt(j42.totals.netCents), BigInt(j55.totals.netCents)),
      BigInt(general.totals.netCents),
    ).toString(),
    matches: true,
  });
}

/**
 * Validación local de tres estadísticas GRH agregadas. No calcula nómina,
 * no certifica procedencia y no aprueba ni persiste un cierre.
 */
export function prepareMonthlyGrhSummary(input) {
  exactKeys(
    input,
    new Set(['period', 'reports']),
    'GRH_SUMMARY_INPUT_INVALID',
    'El importador exige un período y exactamente tres reportes',
  );
  if (typeof input.period !== 'string' || !PERIOD.test(input.period)) {
    fail('GRH_SUMMARY_PERIOD_INVALID', 'El período debe usar YYYY-MM');
  }
  if (!Array.isArray(input.reports) || input.reports.length !== 3) {
    fail('GRH_SUMMARY_REPORT_COUNT_INVALID', 'Se requieren exactamente tres PDF');
  }
  const reports = input.reports.map(canonicalReport);
  const suppliedKinds = reports.map((report) => report.expectedKind).sort();
  if (suppliedKinds.join(',') !== [...PDF_KINDS].sort().join(',')) {
    fail('GRH_SUMMARY_REPORT_SET_INVALID', 'Se requiere un PDF J42, uno J55 y uno General');
  }
  const parsed = reports.map((report) => parseReport(report, input.period));
  const j42 = parsed.find((report) => report.kind === '42');
  const j55 = parsed.find((report) => report.kind === '55');
  const general = parsed.find((report) => report.kind === 'general');
  const crossReport = compareReports(j42, j55, general);
  return Object.freeze({
    contractVersion: PAYROLL_MONTHLY_GRH_SUMMARY_VERSION,
    parserVersion: PAYROLL_MONTHLY_GRH_SUMMARY_PARSER_VERSION,
    period: input.period,
    status: 'matched',
    readyForReview: true,
    reports: Object.freeze([j42, j55, general]),
    crossReport,
    normalizedRepartitionCode: '0',
    normalizedRepartitionMeaning: 'todas_las_reparticiones_del_pdf',
    normalizedOutputIncludesPersonalRecords: false,
    acceptedRowsAggregateOnlyVerified: true,
    rulesInferred: false,
    provenanceVerified: false,
    persistencePerformed: false,
    payrollCalculated: false,
    payrollPosted: false,
    closeApproved: false,
    bankAccreditationProven: false,
    bankArtifactGenerated: false,
    tribunalArtifactGenerated: false,
    fiscalArtifactGenerated: false,
  });
}

export function createMonthlyGrhConceptCsv(summary, jurisdiction) {
  if (!summary || summary.contractVersion !== PAYROLL_MONTHLY_GRH_SUMMARY_VERSION
      || summary.status !== 'matched' || summary.readyForReview !== true) {
    fail('GRH_SUMMARY_EXPORT_BLOCKED', 'La exportación exige tres PDF conciliados');
  }
  if (!['42', '55'].includes(jurisdiction)) {
    fail('GRH_SUMMARY_EXPORT_JURISDICTION_INVALID', 'La exportación admite J42 o J55');
  }
  const report = summary.reports.find((candidate) => candidate.kind === jurisdiction);
  if (!report) fail('GRH_SUMMARY_EXPORT_BLOCKED', 'Falta la jurisdicción solicitada');
  const lines = [
    PAYROLL_MONTHLY_GRH_SUMMARY_CONCEPT_HEADER,
    ...report.concepts.map((row) => [
      summary.period,
      jurisdiction,
      '0',
      row.conceptCode,
      row.occurrences,
      row.quantityHundredths,
      row.remunerativeCents,
      row.nonRemunerativeCents,
      row.familyAllowancesCents,
      row.retentionsCents,
      row.contributionsCents,
    ].join(';')),
    '',
  ];
  return new TextEncoder().encode(lines.join('\r\n'));
}

export function formatGrhSummaryCents(value) {
  const raw = String(value);
  if (!/^-?(?:0|[1-9][0-9]{0,18})$/.test(raw)) {
    fail('GRH_SUMMARY_FORMAT_INVALID', 'El resultado no contiene centavos válidos');
  }
  const parsed = checkedInt64(BigInt(raw));
  const negative = parsed < 0n;
  const digits = (negative ? -parsed : parsed).toString().padStart(3, '0');
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

function downloadCsv(summary, jurisdiction) {
  const bytes = createMonthlyGrhConceptCsv(summary, jurisdiction);
  const blob = new Blob([bytes], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `conceptos-grh-${summary.period}-j${jurisdiction}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function processInWorker(period, sources) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('./monthly-close-grh-summary-worker.js', import.meta.url),
      { type: 'module', name: 'grh-monthly-summary' },
    );
    const timeout = setTimeout(() => {
      worker.terminate();
      reject(new PayrollMonthlyGrhSummaryError(
        'GRH_SUMMARY_WORKER_TIMEOUT',
        'El análisis local superó el tiempo máximo',
      ));
    }, 30000);
    const handleMessage = (event) => {
      if (!event.data || typeof event.data !== 'object'
          || typeof event.data.ok !== 'boolean') return;
      clearTimeout(timeout);
      worker.removeEventListener('message', handleMessage);
      worker.terminate();
      if (event.data?.ok === true) resolve(event.data.summary);
      else reject(new PayrollMonthlyGrhSummaryError(
        event.data?.code || 'GRH_SUMMARY_WORKER_FAILED',
        event.data?.message || 'No se pudieron validar los tres PDF',
      ));
    };
    worker.addEventListener('message', handleMessage);
    worker.addEventListener('error', () => {
      clearTimeout(timeout);
      worker.terminate();
      reject(new PayrollMonthlyGrhSummaryError(
        'GRH_SUMMARY_WORKER_FAILED',
        'El lector local de PDF no está disponible',
      ));
    }, { once: true });
    worker.postMessage({ type: 'prepare', period, reports: sources }, sources.map(
      (source) => source.arrayBuffer,
    ));
  });
}

export function mountMonthlyGrhSummaryImport(root = document) {
  const host = root.querySelector('[data-grh-summary-import]');
  if (!host || host.dataset.mounted === 'true') return false;
  const form = host.querySelector('[data-grh-summary-form]');
  const period = host.querySelector('[data-grh-summary-period]');
  const inputs = new Map([...host.querySelectorAll('[data-grh-summary-file]')]
    .map((input) => [input.dataset.grhSummaryFile, input]));
  const submit = host.querySelector('[data-grh-summary-submit]');
  const reset = host.querySelector('[data-grh-summary-reset]');
  const status = host.querySelector('[data-grh-summary-status]');
  const result = host.querySelector('[data-grh-summary-result]');
  const rows = host.querySelector('[data-grh-summary-rows]');
  const equation = host.querySelector('[data-grh-summary-equation]');
  const evidence = host.querySelector('[data-grh-summary-evidence]');
  const exportButtons = [...host.querySelectorAll('[data-grh-summary-export]')];
  let currentSummary = null;
  let operationSequence = 0;
  if (!form || !period || inputs.size !== 3 || !submit || !reset || !status
      || !result || !rows || !equation || !evidence || exportButtons.length !== 2) {
    return false;
  }

  function setStatus(state, message) {
    status.dataset.state = state;
    status.textContent = message;
  }

  function clearResult() {
    currentSummary = null;
    rows.replaceChildren();
    equation.textContent = 'Sin ecuación validada.';
    evidence.textContent = 'Sin huellas calculadas.';
    result.hidden = true;
    for (const button of exportButtons) button.disabled = true;
  }

  function updateFileState(input) {
    const output = host.querySelector(`[data-grh-summary-file-state="${input.dataset.grhSummaryFile}"]`);
    if (!output) return;
    const file = input.files && input.files[0];
    if (!file) {
      output.dataset.state = '';
      output.textContent = 'No seleccionado.';
      input.setAttribute('aria-invalid', 'false');
      return;
    }
    const tooLarge = file.size > PAYROLL_MONTHLY_GRH_SUMMARY_MAX_FILE_BYTES;
    output.dataset.state = tooLarge ? 'error' : 'ready';
    output.textContent = tooLarge
      ? `${file.size} bytes · supera 512 KiB.`
      : `${file.size} bytes · listo para validar localmente.`;
    input.setAttribute('aria-invalid', String(tooLarge));
  }

  function render(summary) {
    rows.replaceChildren();
    for (const report of summary.reports) {
      const row = document.createElement('tr');
      appendCell(row, report.kind === 'general' ? 'General' : `J${report.kind}`, '', 'Reporte');
      appendCell(row, String(report.conceptCount), 'numeric', 'Conceptos');
      appendCell(row, report.totals.occurrences, 'numeric', 'Ocurrencias');
      appendCell(row, formatGrhSummaryCents(report.totals.netCents), 'numeric', 'Haberes menos retenciones');
      appendCell(row, formatGrhSummaryCents(
        report.totals.earningsPlusContributionsCents,
      ), 'numeric', 'Haberes más contribuciones');
      rows.appendChild(row);
    }
    const j42 = summary.reports.find((report) => report.kind === '42');
    const j55 = summary.reports.find((report) => report.kind === '55');
    const general = summary.reports.find((report) => report.kind === 'general');
    equation.textContent = `J42 ${formatGrhSummaryCents(j42.totals.netCents)} + J55 ${formatGrhSummaryCents(j55.totals.netCents)} = General ${formatGrhSummaryCents(general.totals.netCents)} · diferencia ${formatGrhSummaryCents(summary.crossReport.netDifferenceCents)}.`;
    evidence.textContent = `${summary.parserVersion} · ${summary.crossReport.componentComparisons} comparaciones exactas · ${summary.reports.map((report) => `${report.kind}: ${report.source.sha256}`).join(' · ')}`;
    for (const button of exportButtons) button.disabled = false;
    result.hidden = false;
    setStatus(
      '',
      'Los tres PDF tipo Mes coinciden por concepto y componente. Resultado local listo para revisión humana.',
    );
  }

  for (const input of inputs.values()) {
    input.addEventListener('change', () => {
      operationSequence += 1;
      updateFileState(input);
      clearResult();
      setStatus('', 'Fuentes modificadas. Validá nuevamente los tres PDF.');
    });
  }
  period.addEventListener('change', () => {
    operationSequence += 1;
    period.setAttribute('aria-invalid', 'false');
    clearResult();
    setStatus('', 'Período modificado. Validá nuevamente los tres PDF.');
  });
  reset.addEventListener('click', () => {
    operationSequence += 1;
    form.reset();
    period.setAttribute('aria-invalid', 'false');
    for (const input of inputs.values()) updateFileState(input);
    clearResult();
    setStatus('', 'Esperando período y tres PDF agregados tipo Mes.');
  });
  for (const button of exportButtons) {
    button.addEventListener('click', () => {
      if (currentSummary) downloadCsv(currentSummary, button.dataset.grhSummaryExport);
    });
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    period.setAttribute('aria-invalid', String(!period.value));
    const missing = [...inputs.values()].filter((input) => !(input.files && input.files[0]));
    for (const input of inputs.values()) input.setAttribute('aria-invalid', String(missing.includes(input)));
    if (!period.value || missing.length > 0) {
      setStatus('error', 'Seleccioná el período y exactamente un PDF para J42, J55 y General.');
      (!period.value ? period : missing[0]).focus();
      return;
    }
    const oversized = [...inputs.values()].filter((input) => (
      input.files[0].size > PAYROLL_MONTHLY_GRH_SUMMARY_MAX_FILE_BYTES
    ));
    if (oversized.length > 0) {
      oversized.forEach((input) => input.setAttribute('aria-invalid', 'true'));
      setStatus('error', 'Un PDF supera el máximo local de 512 KiB.');
      oversized[0].focus();
      return;
    }
    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');
    clearResult();
    setStatus('', 'Leyendo los tres PDF y comparando cada concepto con centavos exactos…');
    const currentOperation = ++operationSequence;
    try {
      const sources = await Promise.all(PDF_KINDS.map(async (expectedKind) => ({
        expectedKind,
        arrayBuffer: await inputs.get(expectedKind).files[0].arrayBuffer(),
      })));
      if (currentOperation !== operationSequence) return;
      const summary = await processInWorker(period.value, sources);
      if (currentOperation !== operationSequence) return;
      currentSummary = summary;
      render(summary);
    } catch (error) {
      if (currentOperation !== operationSequence) return;
      clearResult();
      setStatus(
        'error',
        error instanceof PayrollMonthlyGrhSummaryError
          ? error.message : 'No se pudieron validar los tres PDF.',
      );
    } finally {
      submit.disabled = false;
      submit.removeAttribute('aria-busy');
    }
  });
  host.dataset.mounted = 'true';
  return true;
}

if (typeof document !== 'undefined') mountMonthlyGrhSummaryImport(document);
