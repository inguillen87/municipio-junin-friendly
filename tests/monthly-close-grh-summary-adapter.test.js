import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  PAYROLL_MONTHLY_GRH_SUMMARY_CONCEPT_HEADER,
  PAYROLL_MONTHLY_GRH_SUMMARY_MAX_FILE_BYTES,
  PAYROLL_MONTHLY_GRH_SUMMARY_PARSER_VERSION,
  PAYROLL_MONTHLY_GRH_SUMMARY_VERSION,
  PayrollMonthlyGrhSummaryError,
  createMonthlyGrhConceptCsv,
  formatGrhSummaryCents,
  mountMonthlyGrhSummaryImport,
  pdfMetadataCollectionHasEntries,
  prepareMonthlyGrhSummary,
} from '../assets/monthly-close-grh-summary-adapter.js';
import {
  MONTHLY_CLOSE_LOCAL_HEADERS,
  prepareMonthlyCloseLocalPrecheck,
} from '../assets/monthly-close-local-precheck.js';

const COMPONENTS = [
  'occurrences',
  'quantityHundredths',
  'remunerativeCents',
  'nonRemunerativeCents',
  'familyAllowancesCents',
  'retentionsCents',
  'contributionsCents',
];

function grouped(value) {
  return String(value).replace(/\B(?=([0-9]{3})+(?![0-9]))/g, '.');
}

function localeInteger(value) {
  return grouped(value);
}

function localeHundredths(value) {
  const raw = BigInt(value);
  const integer = raw / 100n;
  const decimals = (raw % 100n).toString().padStart(2, '0');
  return `${grouped(integer)}${`,`}${decimals}`;
}

function localeMoney(value) {
  const raw = BigInt(value);
  const negative = raw < 0n;
  const absolute = negative ? -raw : raw;
  const integer = absolute / 100n;
  const decimals = (absolute % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${grouped(integer)},${decimals}`;
}

function row(conceptCode, overrides = {}) {
  return {
    conceptCode,
    occurrences: 1n,
    quantityHundredths: 0n,
    remunerativeCents: 0n,
    nonRemunerativeCents: 0n,
    familyAllowancesCents: 0n,
    retentionsCents: 0n,
    contributionsCents: 0n,
    ...overrides,
  };
}

function addRows(left, right) {
  const byCode = new Map();
  for (const source of [left, right]) {
    for (const entry of source) {
      if (!byCode.has(entry.conceptCode)) {
        byCode.set(entry.conceptCode, row(entry.conceptCode, { occurrences: 0n }));
      }
      const target = byCode.get(entry.conceptCode);
      for (const key of COMPONENTS) target[key] += entry[key];
    }
  }
  return [...byCode.values()];
}

function sumRows(rows) {
  const totals = Object.fromEntries(COMPONENTS.map((key) => [key, 0n]));
  for (const entry of rows) {
    for (const key of COMPONENTS) totals[key] += entry[key];
  }
  totals.netCents = totals.remunerativeCents + totals.nonRemunerativeCents
    + totals.familyAllowancesCents - totals.retentionsCents;
  totals.earningsPlusContributionsCents = totals.remunerativeCents
    + totals.nonRemunerativeCents + totals.familyAllowancesCents + totals.contributionsCents;
  return totals;
}

function pushLine(items, y, entries) {
  for (const [text, x] of entries) items.push({ text, x, y });
}

function report(expectedKind, rows, options = {}) {
  const year = options.year || '2026';
  const month = options.month || '8';
  const liquidationType = options.liquidationType || 'Mes';
  const jurisdiction = expectedKind === '42'
    ? '1 - 042' : expectedKind === '55' ? '2 - 055' : 'TODAS';
  const items = [];
  pushLine(items, 700, [['Estadistica De Conceptos Liquidados', 42]]);
  pushLine(items, 680, [[`Período: ${year}`, 58]]);
  pushLine(items, 670, [[`Mes: ${month}`, 58]]);
  pushLine(items, 660, [[`Tipo de Liquidación: ${liquidationType}`, 58]]);
  pushLine(items, 650, [['Convenio: TODOS', 58]]);
  pushLine(items, 640, [['Repartición: TODAS', 58]]);
  pushLine(items, 630, [[`Jurisdicción: ${jurisdiction}`, 58]]);
  pushLine(items, 620, [['Agrupar por: Concepto', 58]]);
  let y = 580;
  for (const entry of rows) {
    const values = [
      ['TODOS', 46.8],
      [entry.conceptCode, 91.8],
      ['CONCEPTO AGREGADO', 129.7],
      [localeInteger(entry.occurrences), 244],
    ];
    if (entry.quantityHundredths !== 0n) {
      values.push([localeHundredths(entry.quantityHundredths), 270]);
    }
    const amountColumns = [
      ['remunerativeCents', 310],
      ['nonRemunerativeCents', 360],
      ['familyAllowancesCents', 410],
      ['retentionsCents', 460],
      ['contributionsCents', 510],
    ];
    for (const [key, x] of amountColumns) {
      if (entry[key] !== 0n) values.push([localeMoney(entry[key]), x]);
    }
    pushLine(items, y, values);
    y -= 18;
  }
  const totals = sumRows(rows);
  pushLine(items, 170, [
    ['TOTALES:', 91.8],
    [localeInteger(totals.occurrences), 235],
    ...(totals.remunerativeCents === 0n ? [] : [[localeMoney(totals.remunerativeCents), 310]]),
    ...(totals.nonRemunerativeCents === 0n ? [] : [[localeMoney(totals.nonRemunerativeCents), 360]]),
    ...(totals.familyAllowancesCents === 0n ? [] : [[localeMoney(totals.familyAllowancesCents), 410]]),
    ...(totals.retentionsCents === 0n ? [] : [[localeMoney(totals.retentionsCents), 460]]),
    ...(totals.contributionsCents === 0n ? [] : [[localeMoney(totals.contributionsCents), 510]]),
  ]);
  pushLine(items, 150, [
    ['Haberes - Retenciones:', 129],
    [localeMoney(totals.netCents), 210],
  ]);
  pushLine(items, 130, [
    ['Haberes +', 129],
    [localeMoney(totals.earningsPlusContributionsCents), 204],
  ]);
  return {
    expectedKind,
    byteLength: 1000 + rows.length,
    sha256: `sha256:${expectedKind === '42' ? 'a' : expectedKind === '55' ? 'b' : 'c'}`.padEnd(71, expectedKind === 'general' ? 'c' : expectedKind === '42' ? 'a' : 'b'),
    pages: [{ pageNumber: 1, width: 594.96, height: 841.92, items }],
  };
}

function fixture(overrides = {}) {
  const j42Rows = overrides.j42Rows || [
    row('1', { occurrences: 2n, quantityHundredths: 125n, remunerativeCents: 10000n }),
    row('600', { retentionsCents: 2000n }),
  ];
  const j55Rows = overrides.j55Rows || [
    row('1', { occurrences: 3n, quantityHundredths: 275n, remunerativeCents: 5000n }),
    row('301', { familyAllowancesCents: 700n }),
  ];
  const generalRows = overrides.generalRows || addRows(j42Rows, j55Rows);
  return {
    period: overrides.period || '2026-08',
    reports: overrides.reports || [
      report('42', j42Rows, overrides.j42Options),
      report('55', j55Rows, overrides.j55Options),
      report('general', generalRows, overrides.generalOptions),
    ],
  };
}

test('valida los tres PDF y exige J42 + J55 = General por concepto y componente', () => {
  const result = prepareMonthlyGrhSummary(fixture());
  assert.equal(result.contractVersion, PAYROLL_MONTHLY_GRH_SUMMARY_VERSION);
  assert.equal(result.parserVersion, PAYROLL_MONTHLY_GRH_SUMMARY_PARSER_VERSION);
  assert.equal(result.period, '2026-08');
  assert.equal(result.status, 'matched');
  assert.equal(result.readyForReview, true);
  assert.deepEqual(result.reports.map((entry) => [entry.kind, entry.conceptCount]), [
    ['42', 2], ['55', 2], ['general', 3],
  ]);
  assert.deepEqual(result.crossReport, {
    equation: 'jurisdiction_42 + jurisdiction_55 = general',
    toleranceCents: '0',
    conceptCount: 3,
    componentComparisons: 21,
    netDifferenceCents: '0',
    matches: true,
  });
  assert.equal(result.normalizedOutputIncludesPersonalRecords, false);
  assert.equal(result.acceptedRowsAggregateOnlyVerified, true);
  assert.equal(result.provenanceVerified, false);
  assert.equal(result.persistencePerformed, false);
  assert.equal(result.payrollCalculated, false);
  assert.equal(result.closeApproved, false);
  assert.equal(result.bankAccreditationProven, false);
});

test('exporta CSV agregado compatible con el conciliador sin PII', async () => {
  const result = prepareMonthlyGrhSummary(fixture());
  const conceptBytes = createMonthlyGrhConceptCsv(result, '42');
  const csv = new TextDecoder().decode(conceptBytes);
  assert.equal(PAYROLL_MONTHLY_GRH_SUMMARY_CONCEPT_HEADER, MONTHLY_CLOSE_LOCAL_HEADERS.conceptStatistics);
  assert.equal(csv, [
    PAYROLL_MONTHLY_GRH_SUMMARY_CONCEPT_HEADER,
    '2026-08;42;0;1;2;125;10000;0;0;0;0',
    '2026-08;42;0;600;1;0;0;0;0;2000;0',
    '',
  ].join('\r\n'));
  assert.doesNotMatch(csv, /(?:nombre|apellido|dni|cuil|cbu|cuenta|legajo|email)/i);
  assert.throws(
    () => createMonthlyGrhConceptCsv(result, 'general'),
    (error) => error.code === 'GRH_SUMMARY_EXPORT_JURISDICTION_INVALID',
  );

  const bankBytes = new TextEncoder().encode([
    MONTHLY_CLOSE_LOCAL_HEADERS.bankSummary,
    `2026-08;42;0;1;cuenta_corriente;1;${result.reports[0].totals.netCents}`,
    '',
  ].join('\r\n'));
  const precheck = await prepareMonthlyCloseLocalPrecheck({
    period: '2026-08',
    jurisdiction: '42',
    conceptBytes,
    bankBytes,
  });
  assert.equal(precheck.status, 'matched');
  assert.equal(precheck.comparisons.length, 1);
  assert.equal(precheck.comparisons[0].repartitionCode, '0');
});

test('usa BigInt para centavos superiores a Number.MAX_SAFE_INTEGER', () => {
  const amount = 9007199254740993n;
  const j42Rows = [row('1', { remunerativeCents: amount })];
  const j55Rows = [row('1', { remunerativeCents: 1n })];
  const result = prepareMonthlyGrhSummary(fixture({ j42Rows, j55Rows }));
  assert.equal(result.reports[0].totals.remunerativeCents, amount.toString());
  assert.equal(result.reports[2].totals.remunerativeCents, (amount + 1n).toString());
  assert.equal(formatGrhSummaryCents(amount), '$ 90.071.992.547.409,93');
});

test('rechaza TODAS LIQUIDACIONES y cualquier período discordante', () => {
  assert.throws(
    () => prepareMonthlyGrhSummary(fixture({ j42Options: { liquidationType: 'TODAS' } })),
    (error) => error.code === 'GRH_SUMMARY_LIQUIDATION_TYPE_INVALID',
  );
  assert.throws(
    () => prepareMonthlyGrhSummary(fixture({ j55Options: { month: '7' } })),
    (error) => error.code === 'GRH_SUMMARY_PERIOD_MISMATCH',
  );
  assert.throws(
    () => prepareMonthlyGrhSummary(fixture({ period: '2026-13' })),
    (error) => error.code === 'GRH_SUMMARY_PERIOD_INVALID',
  );
});

test('rechaza faltantes, duplicados, slot incorrecto y filas ambiguas', () => {
  const source = fixture();
  const cases = [
    [{ ...source, reports: source.reports.slice(0, 2) }, 'GRH_SUMMARY_REPORT_COUNT_INVALID'],
    [{ ...source, reports: [source.reports[0], source.reports[0], source.reports[2]] }, 'GRH_SUMMARY_REPORT_SET_INVALID'],
    [{ ...source, reports: [
      { ...source.reports[0], expectedKind: '55' }, source.reports[1], source.reports[2],
    ] }, 'GRH_SUMMARY_REPORT_SET_INVALID'],
  ];
  for (const [input, code] of cases) {
    assert.throws(() => prepareMonthlyGrhSummary(input), (error) => error.code === code, code);
  }

  const ambiguous = fixture();
  const bodyLine = ambiguous.reports[0].pages[0].items.find((item) => (
    item.x === 310 && item.y === 580
  ));
  ambiguous.reports[0].pages[0].items.push({ text: '1,00', x: bodyLine.x + 1, y: bodyLine.y });
  assert.throws(
    () => prepareMonthlyGrhSummary(ambiguous),
    (error) => error.code === 'GRH_SUMMARY_ROW_AMBIGUOUS',
  );
});

test('rechaza metadatos contradictorios y exige un pie completo por página', () => {
  const contradictoryMetadata = [
    ['Repartición: 618', 'GRH_SUMMARY_REPARTITION_AMBIGUOUS'],
    ['Convenio: 243', 'GRH_SUMMARY_CONVENTION_AMBIGUOUS'],
    ['Agrupar por: Empleado', 'GRH_SUMMARY_GROUPING_AMBIGUOUS'],
  ];
  for (const [text, expectedCode] of contradictoryMetadata) {
    const source = fixture();
    source.reports[0].pages[0].items.push({ text, x: 58, y: 610 });
    assert.throws(
      () => prepareMonthlyGrhSummary(source),
      (error) => error.code === expectedCode,
      expectedCode,
    );
  }

  const misplacedFooter = fixture();
  const report42 = misplacedFooter.reports[0];
  const firstPage = report42.pages[0];
  const repeatedFooter = firstPage.items
    .filter((item) => [170, 150, 130].includes(item.y))
    .map((item) => ({ ...item, y: item.y - 80 }));
  firstPage.items.push(...repeatedFooter);
  report42.pages.push({
    pageNumber: 2,
    width: firstPage.width,
    height: firstPage.height,
    items: [{ text: 'Continuación', x: 42, y: 700 }],
  });
  assert.throws(
    () => prepareMonthlyGrhSummary(misplacedFooter),
    (error) => error.code === 'GRH_SUMMARY_FOOTER_AMBIGUOUS',
  );
});

test('bloquea una diferencia de un centavo y un pie que no suma', () => {
  const mismatch = fixture();
  const generalMoney = mismatch.reports[2].pages[0].items.find((item) => (
    item.x === 310 && item.y === 580
  ));
  generalMoney.text = localeMoney(BigInt(generalMoney.text.replaceAll('.', '').replace(',', '')) + 1n);
  assert.throws(
    () => prepareMonthlyGrhSummary(mismatch),
    (error) => error.code === 'GRH_SUMMARY_FOOTER_MISMATCH',
  );

  const equationMismatchRows = [
    row('1', { occurrences: 5n, quantityHundredths: 400n, remunerativeCents: 15001n }),
    row('301', { familyAllowancesCents: 700n }),
    row('600', { retentionsCents: 2000n }),
  ];
  assert.throws(
    () => prepareMonthlyGrhSummary(fixture({ generalRows: equationMismatchRows })),
    (error) => error.code === 'GRH_SUMMARY_CROSS_REPORT_MISMATCH',
  );
});

test('aplica límites de tamaño, formato y rango entero', () => {
  const oversized = fixture();
  oversized.reports[0].byteLength = PAYROLL_MONTHLY_GRH_SUMMARY_MAX_FILE_BYTES + 1;
  assert.throws(
    () => prepareMonthlyGrhSummary(oversized),
    (error) => error.code === 'GRH_SUMMARY_SIZE_INVALID',
  );
  const invalidHash = fixture();
  invalidHash.reports[0].sha256 = 'preview';
  assert.throws(
    () => prepareMonthlyGrhSummary(invalidHash),
    (error) => error.code === 'GRH_SUMMARY_HASH_INVALID',
  );
  const overflow = fixture({
    j42Rows: [row('1', { remunerativeCents: 9223372036854775807n })],
    j55Rows: [row('1', { remunerativeCents: 1n })],
  });
  assert.throws(
    () => prepareMonthlyGrhSummary(overflow),
    (error) => error.code === 'GRH_SUMMARY_INTEGER_OUT_OF_RANGE',
  );
  const occurrencesOutsideConsumerRange = fixture({
    j42Rows: [row('1', { occurrences: 2147483648n, remunerativeCents: 1n })],
    j55Rows: [row('1', { remunerativeCents: 1n })],
  });
  assert.throws(
    () => prepareMonthlyGrhSummary(occurrencesOutsideConsumerRange),
    (error) => error.code === 'GRH_SUMMARY_COUNT_INVALID',
  );
});

test('detecta colecciones de adjuntos o acciones devueltas como Map por PDF.js', () => {
  assert.equal(pdfMetadataCollectionHasEntries(null), false);
  assert.equal(pdfMetadataCollectionHasEntries(new Map()), false);
  assert.equal(pdfMetadataCollectionHasEntries(new Map([['archivo', {}]])), true);
  assert.equal(pdfMetadataCollectionHasEntries({}), false);
  assert.equal(pdfMetadataCollectionHasEntries({ OpenAction: ['app.alert()'] }), true);
  assert.equal(pdfMetadataCollectionHasEntries([]), true);
});

test('publica el contrato, el adaptador y el worker sin red ni almacenamiento', () => {
  const html = fs.readFileSync(new URL('../nomina-control.html', import.meta.url), 'utf8');
  const adapter = fs.readFileSync(
    new URL('../assets/monthly-close-grh-summary-adapter.js', import.meta.url),
    'utf8',
  );
  const worker = fs.readFileSync(
    new URL('../assets/monthly-close-grh-summary-worker.js', import.meta.url),
    'utf8',
  );
  const build = fs.readFileSync(new URL('../scripts/build-friendly.mjs', import.meta.url), 'utf8');
  const contract = JSON.parse(fs.readFileSync(
    new URL('../contracts/payroll-monthly-grh-summary.v1.json', import.meta.url),
    'utf8',
  ));
  assert.equal(contract.properties.contractVersion.const, PAYROLL_MONTHLY_GRH_SUMMARY_VERSION);
  assert.equal(contract.properties.reports.prefixItems.length, 3);
  assert.equal(contract.properties.reports.items, false);
  assert.equal(
    contract.properties.reports.prefixItems[2].allOf[1].properties.jurisdiction.const,
    null,
  );
  assert.match(html, /Preparar los tres resúmenes GRH del mes/);
  assert.match(html, /TODAS LIQUIDACIONES.*bloqueado/);
  assert.match(html, /data-grh-summary-file="42"/);
  assert.match(html, /data-grh-summary-file="55"/);
  assert.match(html, /data-grh-summary-file="general"/);
  assert.match(html, /código de repartición 0 significa/);
  assert.equal((html.match(/assets\/monthly-close-grh-summary-adapter\.js/g) || []).length, 1);
  assert.match(build, /'assets\/monthly-close-grh-summary-adapter\.js'/);
  assert.match(build, /'assets\/monthly-close-grh-summary-worker\.js'/);
  assert.match(build, /pdf\.worker\.min\.mjs/);
  assert.match(adapter, /BigInt\(/);
  assert.match(adapter, /acceptedRowsAggregateOnlyVerified: true/);
  assert.match(worker, /getAttachments\(\)/);
  assert.match(adapter, /instanceof Map/);
  assert.match(worker, /getJSActions/);
  assert.match(worker, /getAnnotations/);
  assert.match(worker, /AnnotationType\.FILEATTACHMENT/);
  assert.match(worker, /subtype === 'FileAttachment'/);
  assert.doesNotMatch(worker, /getJavaScript/);
  assert.match(adapter, /\.textContent\s*=/);
  assert.doesNotMatch(adapter, /fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/);
  assert.doesNotMatch(worker, /fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/);
  assert.doesNotMatch(`${adapter}\n${worker}`, /localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(`${adapter}\n${worker}`, /file\.name|filename/i);
  assert.equal(mountMonthlyGrhSummaryImport({ querySelector: () => null }), false);
});
