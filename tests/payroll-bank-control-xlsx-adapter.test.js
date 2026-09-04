import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  BANK_ACCREDITATION_SUMMARY_HEADER,
  BANK_ACCREDITATION_SUMMARY_VERSION,
  PayrollBankControlError,
  createBankAccreditationSummaryCsv,
  preparePayrollBankControlWorkbook,
} from '../assets/payroll-bank-control-xlsx-adapter.js';

const ACCOUNT_TYPES = Object.freeze({
  credicoop: 'cuenta_corriente',
  santander: 'caja_ahorro',
  nacion: 'cuenta_corriente',
});
const SOURCE_FILE_NAME = 'PLANILLA CONTROL GENERAL 08.2026.xlsx';
const SOURCE_SHA256 = 'a'.repeat(64);

function cuil(seed) {
  // Prefijo 00: checksum útil para probar el parser, pero imposible como CUIL real.
  const firstTen = `00${String(seed).padStart(8, '0')}`;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let index = 0; index < weights.length; index += 1) {
    sum += Number(firstTen[index]) * weights[index];
  }
  let verifier = 11 - (sum % 11);
  if (verifier === 11) verifier = 0;
  else if (verifier === 10) verifier = 9;
  return `${firstTen}${verifier}`;
}

function row(rowNumber, cells) {
  return { rowNumber, cells };
}

function bankSheet(name, seed, amount, repartition, {
  nacion = false,
  accountMarker = 'PRIVATE-ACCOUNT-MARKER',
} = {}) {
  return {
    name,
    dimension: nacion ? 'A1:E999999' : 'A1:F999999',
    rows: [
      row(1, { A: 'CONTROL MENSUAL' }),
      row(3, nacion
        ? { B: 'C.U.I.L.', C: 'APELLIDO Y NOMBRE', D: 'NETO A COBRAR', E: 'REPARTICION' }
        : { B: 'C.U.I.L.', C: 'APELLIDO Y NOMBRE', D: 'CTA BANCARIA', E: 'NETO A COBRAR', F: 'REPARTICION' }),
      row(4, nacion
        ? { B: cuil(seed), C: `PRIVATE-NAME-${seed}`, D: amount, E: `${repartition} - AREA` }
        : { B: cuil(seed), C: `PRIVATE-NAME-${seed}`, D: accountMarker, E: amount, F: `${repartition} - AREA` }),
    ],
  };
}

function transferSheet(name, seed, amount, repartition, { repeated = false } = {}) {
  const rows = [
    row(1, { B: 'CUIL', C: 'APELLIDO Y NOMBRE', D: 'NETO A PAGAR', E: 'REPARTICIÓN', F: 'C.B.U' }),
    row(2, { B: cuil(seed), C: `PRIVATE-NAME-${seed}`, D: amount, E: `${repartition} - AREA`, F: `PRIVATE-CBU-${seed}` }),
  ];
  if (repeated) {
    rows.push(
      row(1048500, { B: 'CUIL', C: 'APELLIDO Y NOMBRE', D: 'NETO A PAGAR', E: 'REPARTICIÓN', F: 'C.B.U' }),
      row(1048501, { B: cuil(seed + 100), C: `PRIVATE-NAME-${seed + 100}`, D: '10.00', E: `${repartition} - AREA`, F: `PRIVATE-CBU-${seed + 100}` }),
    );
  }
  return { name, dimension: 'A1:F1048576', rows };
}

function workbook() {
  return {
    period: '2026-08',
    byteLength: 95_338,
    fileName: SOURCE_FILE_NAME,
    sha256: SOURCE_SHA256,
    accountTypes: { ...ACCOUNT_TYPES },
    sheets: [
      bankSheet('BANCAR. 08.2026- CRED. JUR.42', 1, '100.00', '01'),
      bankSheet('BANCAR. 08.2026- CRED. JUR.55', 2, '200.00', '17'),
      bankSheet('BARCAR. 08.2026- SANT JUR.42', 3, '300.00', '01'),
      bankSheet('BANCAR. 08.2026- SANT JUR.55', 4, '400.00', '17'),
      transferSheet('TRANSF. FUNCIONARIOS 08.2026', 5, '500.00', '01'),
      transferSheet('TRANSF. VARIAS 08.2026', 6, '600.00', '17'),
      bankSheet('BANCAR. 08.2026- NAC JUR.42', 7, '700.00', '01', { nacion: true }),
      bankSheet('BANCAR. 08.2026- NAC JUR.55', 8, '800.00', '17', { nacion: true }),
    ],
  };
}

function expectCode(code, callback) {
  assert.throws(callback, (error) => (
    error instanceof PayrollBankControlError && error.code === code
  ));
}

test('recalcula las ocho hojas y genera dos resúmenes canónicos sin PII', () => {
  const input = workbook();
  input.sheets[5] = transferSheet(
    'TRANSF. VARIAS 08.2026', 6, '600.00', '17', { repeated: true },
  );
  const result = preparePayrollBankControlWorkbook(input);

  assert.equal(result.exportContractVersion, BANK_ACCREDITATION_SUMMARY_VERSION);
  assert.deepEqual(result.total, { operations: 9, netCents: '361000' });
  assert.deepEqual(result.jurisdictions, [
    { jurisdiction: '42', operations: 4, netCents: '160000' },
    { jurisdiction: '55', operations: 5, netCents: '201000' },
  ]);
  assert.equal(result.sheets.length, 8);
  assert.equal(result.sheets.find((entry) => entry.sheetKey === 'transferencias-varias').headerBlocks, 2);
  assert.equal(result.source.actualXmlRowsVisited, 24);
  assert.equal(result.source.worksheetDimensionTrusted, false);
  assert.equal(result.source.fileName, SOURCE_FILE_NAME);
  assert.equal(result.source.sha256, SOURCE_SHA256);
  assert.equal(result.source.byteLength, 95_338);
  assert.deepEqual(
    [...new Set(result.groups.map((entry) => entry.bankCode))].sort(),
    ['0', '11', '191', '72'],
  );
  assert.ok(result.groups.filter((entry) => entry.bankCode === '0')
    .every((entry) => entry.accountType === 'transferencia_especial'));

  const serialized = JSON.stringify(result);
  for (const marker of ['PRIVATE-NAME', 'PRIVATE-ACCOUNT', 'PRIVATE-CBU', cuil(1), cuil(106)]) {
    assert.doesNotMatch(serialized, new RegExp(marker));
  }
  const j42 = new TextDecoder().decode(createBankAccreditationSummaryCsv(result, '42'));
  const j55 = new TextDecoder().decode(createBankAccreditationSummaryCsv(result, '55'));
  assert.ok(j42.startsWith(`${BANK_ACCREDITATION_SUMMARY_HEADER}\r\n`));
  assert.ok(j55.startsWith(`${BANK_ACCREDITATION_SUMMARY_HEADER}\r\n`));
  assert.ok(j42.endsWith('\r\n'));
  assert.ok(j55.endsWith('\r\n'));
  assert.match(j42, /^2026-08;42;01;191;cuenta_corriente;1;10000$/m);
  assert.match(j55, /^2026-08;55;17;0;transferencia_especial;2;61000$/m);
  assert.doesNotMatch(`${j42}${j55}`, /PRIVATE|CUIL|CBU/);
});

test('el verificador del libro real no imprime importes municipales', () => {
  const source = fs.readFileSync(new URL(
    '../scripts/verify-payroll-bank-control-browser.mjs', import.meta.url,
  ), 'utf8');
  const output = source.match(/process\.stdout\.write\([\s\S]*?\);/)?.[0] ?? '';
  assert.match(output, /operations42/);
  assert.match(output, /operations55/);
  assert.doesNotMatch(output, /financialTotals|jurisdiction42|jurisdiction55|\btotal\b/);
});

test('falla cerrado sin tipo de cuenta explícito o sin las ocho hojas exactas', () => {
  const missingType = workbook();
  missingType.accountTypes.santander = '';
  expectCode('BANK_CONTROL_ACCOUNT_TYPE_REQUIRED', () => preparePayrollBankControlWorkbook(missingType));

  const missingSheet = workbook();
  missingSheet.sheets.pop();
  expectCode('BANK_CONTROL_WORKBOOK_INVALID', () => preparePayrollBankControlWorkbook(missingSheet));

  const duplicate = workbook();
  duplicate.sheets[7] = duplicate.sheets[6];
  expectCode('BANK_CONTROL_SHEET_DUPLICATED', () => preparePayrollBankControlWorkbook(duplicate));

  const badIdentity = workbook();
  badIdentity.fileName = '../control.xlsx';
  expectCode('BANK_CONTROL_SOURCE_IDENTITY_INVALID', () => preparePayrollBankControlWorkbook(badIdentity));

  const badHash = workbook();
  badHash.sha256 = 'not-a-sha256';
  expectCode('BANK_CONTROL_SOURCE_IDENTITY_INVALID', () => preparePayrollBankControlWorkbook(badHash));
});

test('limita BARCAR a Santander y verifica período, CUIL, cabecera y jurisdicción', () => {
  const typoOnWrongBank = workbook();
  typoOnWrongBank.sheets[0].name = 'BARCAR. 08.2026- CRED. JUR.42';
  expectCode('BANK_CONTROL_SHEET_INVALID', () => preparePayrollBankControlWorkbook(typoOnWrongBank));

  const wrongPeriod = workbook();
  wrongPeriod.period = '2026-09';
  expectCode('BANK_CONTROL_SHEET_INVALID', () => preparePayrollBankControlWorkbook(wrongPeriod));

  const badCuil = workbook();
  badCuil.sheets[0].rows[2].cells.B = '20123456780';
  expectCode('BANK_CONTROL_CUIL_INVALID', () => preparePayrollBankControlWorkbook(badCuil));

  const incomplete = workbook();
  delete incomplete.sheets[0].rows[2].cells.C;
  expectCode('BANK_CONTROL_NOMINAL_ROW_INVALID', () => preparePayrollBankControlWorkbook(incomplete));

  const wrongJurisdiction = workbook();
  wrongJurisdiction.sheets[0].rows[2].cells.F = '17 - AREA';
  expectCode('BANK_CONTROL_JURISDICTION_MISMATCH', () => preparePayrollBankControlWorkbook(wrongJurisdiction));

  const driftingHeaders = workbook();
  driftingHeaders.sheets[5].rows.push(
    row(20, { A: 'CUIL', B: 'APELLIDO Y NOMBRE', C: 'NETO A PAGAR', D: 'REPARTICIÓN' }),
  );
  expectCode('BANK_CONTROL_HEADER_DRIFT', () => preparePayrollBankControlWorkbook(driftingHeaders));
});

test('worker, pantalla y empaquetado preservan el límite local y agregado', () => {
  const worker = fs.readFileSync(new URL('../assets/payroll-bank-control-xlsx-worker.js', import.meta.url), 'utf8');
  const html = fs.readFileSync(new URL('../reportes-rrhh.html', import.meta.url), 'utf8');
  const build = fs.readFileSync(new URL('../scripts/build-friendly.mjs', import.meta.url), 'utf8');
  const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

  assert.match(worker, /vendor\/fflate\.min\.js/);
  assert.match(worker, /DOMParser/);
  assert.match(worker, /tagPattern\('row'\)/);
  assert.doesNotMatch(worker, /readXlsxFile|max_row|localStorage|sessionStorage|indexedDB|\bfetch\s*\(|console\./);
  assert.match(worker, /clearExtracted\(extracted\)/);
  assert.match(worker, /bytes\.fill\(0\)/);
  assert.match(worker, /crypto\.subtle\.digest\('SHA-256', bytes\)/);
  assert.match(worker, /self\.postMessage\(\{ ok: true, control \}\)/);
  assert.doesNotMatch(worker, /postMessage\([^)]*(?:sheets|sharedStrings|rows)/s);

  assert.match(html, /data-payroll-bank-control-xlsx/);
  assert.match(html, /data-bank-control-worksheets/);
  assert.match(html, /data-bank-control-repartitions="unique"/);
  assert.match(html, /data-bank-control-repartitions="bank"/);
  assert.match(html, /data-bank-control-source-sha256/);
  assert.match(html, /tipo declarado al procesar/i);
  assert.match(html, /no queda validado por el archivo ni por la entidad/i);
  assert.match(html, /no es un TXT bancario ni acredita pagos/i);
  assert.match(html, /No hay subida, API, almacenamiento ni escritura en Neon/i);
  assert.equal((html.match(/data-bank-control-account=/g) || []).length, 3);
  assert.equal((html.match(/data-bank-control-export-xlsx/g) || []).length, 1);
  assert.match(html, /data-bank-control-export-jurisdiction/);
  assert.match(html, /data-bank-control-export-bank/);
  assert.match(build, /assets\/payroll-bank-control-exporter\.js/);
  assert.match(build, /assets\/payroll-bank-control-xlsx-adapter\.js/);
  assert.match(build, /assets\/payroll-bank-control-xlsx-worker\.js/);
  assert.match(build, /publicCacheInputs[\s\S]*assets\/vendor\/fflate\.min\.js/);
  assert.match(sw, /assets\/payroll-bank-control-exporter\.js/);
  assert.match(sw, /assets\/payroll-bank-control-xlsx-adapter\.js/);
  assert.match(sw, /assets\/payroll-bank-control-xlsx-worker\.js/);
  assert.match(sw, /PRECACHE_URLS[\s\S]*assets\/vendor\/fflate\.min\.js/);
});
