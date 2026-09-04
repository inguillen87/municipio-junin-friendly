import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { readSheet } from 'read-excel-file/node';

import {
  preparePayrollBankControlWorkbook,
} from '../assets/payroll-bank-control-xlsx-adapter.js';
import {
  PAYROLL_BANK_CONTROL_EXPORT_VERSION,
  PayrollBankControlExportError,
  createPayrollBankControlXlsxArtifact,
  downloadPayrollBankControlXlsxArtifact,
} from '../assets/payroll-bank-control-exporter.js';

const GENERATED_AT_A = '2026-09-04T12:00:00.000Z';
const GENERATED_AT_B = '2026-09-04T18:00:00.000Z';
const ACCOUNT_TYPES = Object.freeze({
  credicoop: 'cuenta_corriente',
  santander: 'caja_ahorro',
  nacion: 'cuenta_corriente',
});

function cuil(seed) {
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

function bankSheet(name, seed, amount, repartition, { nacion = false } = {}) {
  return {
    name,
    dimension: 'A1:F999999',
    rows: [
      row(1, { A: 'CONTROL MENSUAL' }),
      row(3, nacion
        ? { B: 'C.U.I.L.', C: 'APELLIDO Y NOMBRE', D: 'NETO A COBRAR', E: 'REPARTICION' }
        : { B: 'C.U.I.L.', C: 'APELLIDO Y NOMBRE', D: 'CTA BANCARIA', E: 'NETO A COBRAR', F: 'REPARTICION' }),
      row(4, nacion
        ? { B: cuil(seed), C: `PRIVATE-NAME-${seed}`, D: amount, E: `${repartition} - AREA` }
        : { B: cuil(seed), C: `PRIVATE-NAME-${seed}`, D: `PRIVATE-ACCOUNT-${seed}`, E: amount, F: `${repartition} - AREA` }),
    ],
  };
}

function transferSheet(name, seed, amount, repartition) {
  return {
    name,
    dimension: 'A1:F999999',
    rows: [
      row(1, { B: 'CUIL', C: 'APELLIDO Y NOMBRE', D: 'NETO A PAGAR', E: 'REPARTICIÓN', F: 'C.B.U' }),
      row(2, { B: cuil(seed), C: `PRIVATE-NAME-${seed}`, D: amount, E: `${repartition} - AREA`, F: `PRIVATE-CBU-${seed}` }),
    ],
  };
}

function control() {
  return preparePayrollBankControlWorkbook({
    period: '2026-08',
    byteLength: 95_338,
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
  });
}

function storedZipEntries(bytes) {
  const entries = new Map();
  const decoder = new TextDecoder();
  let offset = 0;
  while (offset + 4 <= bytes.byteLength) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
    if (view.getUint32(0, true) !== 0x04034b50) break;
    assert.equal(view.getUint16(8, true), 0);
    const size = view.getUint32(18, true);
    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    entries.set(name, decoder.decode(bytes.subarray(dataStart, dataStart + size)));
    offset = dataStart + size;
  }
  return entries;
}

function errorCode(code) {
  return (error) => error instanceof PayrollBankControlExportError && error.code === code;
}

test('genera un XLSX de control J42 con resumen y detalle agregado por repartición', async () => {
  const artifact = createPayrollBankControlXlsxArtifact(control(), {
    jurisdiction: '42', bankScope: 'all', generatedAt: GENERATED_AT_A,
  });

  assert.equal(artifact.contractVersion, PAYROLL_BANK_CONTROL_EXPORT_VERSION);
  assert.equal(artifact.fileName, 'municontrol_control-bancario_2026-08_j42_todos.xlsx');
  assert.equal(artifact.mimeType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.deepEqual(artifact.sheetNames, ['Resumen', 'Por repartición']);
  assert.equal(artifact.containsPersonalRecords, false);
  assert.equal(artifact.controlOnly, true);
  assert.equal(artifact.bankScopeProven, true);
  assert.equal(artifact.bankInstructionGenerated, false);
  assert.equal(artifact.bankAccreditationPerformed, false);
  assert.deepEqual([...artifact.bytes.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);

  const entries = storedZipEntries(artifact.bytes);
  assert.equal(entries.size, 9);
  assert.match(entries.get('xl/workbook.xml'), /sheet name="Resumen".*sheet name="Por repartición"/s);
  assert.match(entries.get('xl/worksheets/sheet1.xml'), /Todos los bancos y transferencias/);
  assert.match(entries.get('xl/worksheets/sheet1.xml'), /No acredita haberes ni genera instrucciones bancarias/);
  assert.match(entries.get('xl/worksheets/sheet1.xml'), /<c r="C12" s="9" t="n"><v>1<\/v><\/c>/);
  assert.doesNotMatch(entries.get('xl/worksheets/sheet1.xml'), /<f>SUM\(C8:C11\)<\/f>/);
  assert.match(entries.get('xl/worksheets/sheet2.xml'), /<f>SUM\(E7:E10\)<\/f><v>4<\/v>/);
  assert.match(entries.get('xl/worksheets/sheet2.xml'), /<f>SUM\(F7:F10\)<\/f><v>1600\.00<\/v>/);

  const detail = await readSheet(Buffer.from(artifact.bytes), 'Por repartición');
  assert.deepEqual(detail[5], [
    'Jurisdicción', 'Repartición', 'Banco', 'Tipo declarado',
    'Operaciones', 'Neto de control', 'Estado',
  ]);
  assert.equal(detail[6][0], 'J42');
  assert.equal(detail[6][1], '01');
  assert.equal(detail.at(-1)[4], 4);
  assert.equal(detail.at(-1)[5], 1600);

  const payload = [...entries.values()].join('\n');
  for (const marker of ['PRIVATE-NAME', 'PRIVATE-ACCOUNT', 'PRIVATE-CBU', cuil(1)]) {
    assert.doesNotMatch(payload, new RegExp(marker));
  }
  assert.doesNotMatch(payload, /<externalReferences|externalLink|vbaProject|macroEnabled|oleObject|activeX/i);
});

test('permite elegir un banco probado por la hoja sin convertirlo en acreditación', async () => {
  const artifact = createPayrollBankControlXlsxArtifact(control(), {
    jurisdiction: '55', bankScope: 'credicoop', generatedAt: GENERATED_AT_A,
  });
  assert.equal(artifact.fileName, 'municontrol_control-bancario_2026-08_j55_credicoop.xlsx');

  const summary = await readSheet(Buffer.from(artifact.bytes), 'Resumen');
  assert.equal(summary[4][1], 'Credicoop');
  assert.equal(summary[4][4], 1);
  assert.equal(summary[5][1], 200);
  const detail = await readSheet(Buffer.from(artifact.bytes), 'Por repartición');
  assert.equal(detail.length, 8);
  assert.equal(detail[6][2], 'Credicoop');
  assert.equal(detail[6][5], 200);
  assert.equal(detail[6][6], 'Recalculado');
  assert.equal(detail[7][5], 200);
  assert.equal(artifact.bankInstructionGenerated, false);
  assert.equal(artifact.bankAccreditationPerformed, false);
});

test('los bytes son deterministas y el alcance vacío o manipulado falla cerrado', () => {
  const source = control();
  const first = createPayrollBankControlXlsxArtifact(source, {
    jurisdiction: '42', bankScope: 'nacion', generatedAt: GENERATED_AT_A,
  });
  const second = createPayrollBankControlXlsxArtifact(source, {
    jurisdiction: '42', bankScope: 'nacion', generatedAt: GENERATED_AT_B,
  });
  assert.notEqual(first.generatedAt, second.generatedAt);
  assert.deepEqual(first.bytes, second.bytes);

  assert.throws(
    () => createPayrollBankControlXlsxArtifact(source, { jurisdiction: '99', bankScope: 'all' }),
    errorCode('BANK_CONTROL_EXPORT_SCOPE_INVALID'),
  );
  assert.throws(
    () => createPayrollBankControlXlsxArtifact(source, { jurisdiction: '42', bankScope: 'desconocido' }),
    errorCode('BANK_CONTROL_EXPORT_SCOPE_INVALID'),
  );

  const altered = structuredClone(source);
  altered.groups[0].netCents = '10100';
  assert.throws(
    () => createPayrollBankControlXlsxArtifact(altered, { jurisdiction: '42', bankScope: 'all' }),
    errorCode('BANK_CONTROL_EXPORT_SOURCE_INVALID'),
  );

  const pii = structuredClone(source);
  pii.groups[0].cuil = '20123456786';
  assert.throws(
    () => createPayrollBankControlXlsxArtifact(pii, { jurisdiction: '42', bankScope: 'all' }),
    errorCode('BANK_CONTROL_EXPORT_SOURCE_INVALID'),
  );

  const bankSwap = structuredClone(source);
  const credicoop = bankSwap.groups.find((group) => (
    group.jurisdiction === '42' && group.bankCode === '191'
  ));
  const santander = bankSwap.groups.find((group) => (
    group.jurisdiction === '42' && group.bankCode === '72'
  ));
  [credicoop.bankCode, santander.bankCode] = [santander.bankCode, credicoop.bankCode];
  [credicoop.bankLabel, santander.bankLabel] = [santander.bankLabel, credicoop.bankLabel];
  [credicoop.accountType, santander.accountType] = [santander.accountType, credicoop.accountType];
  assert.throws(
    () => createPayrollBankControlXlsxArtifact(bankSwap, { jurisdiction: '42', bankScope: 'all' }),
    errorCode('BANK_CONTROL_EXPORT_SOURCE_INVALID'),
  );
});

test('descarga sólo el artefacto emitido e íntegro y revoca su URL', () => {
  const artifact = createPayrollBankControlXlsxArtifact(control(), {
    jurisdiction: '42', bankScope: 'all', generatedAt: GENERATED_AT_A,
  });
  const events = [];
  const anchor = {
    hidden: false, href: '', download: '',
    click() { events.push(['click', this.download]); },
    remove() { events.push(['remove']); },
  };
  class BlobFixture {
    constructor(parts, options) { this.parts = parts; this.type = options.type; }
  }
  const name = downloadPayrollBankControlXlsxArtifact(artifact, {
    documentImpl: {
      createElement: (tag) => { assert.equal(tag, 'a'); return anchor; },
      body: { appendChild: (value) => { assert.equal(value, anchor); events.push(['append']); } },
    },
    urlApi: {
      createObjectURL: (blob) => { assert.equal(blob.type, artifact.mimeType); events.push(['create']); return 'blob:test'; },
      revokeObjectURL: (url) => { assert.equal(url, 'blob:test'); events.push(['revoke']); },
    },
    BlobImpl: BlobFixture,
  });
  assert.equal(name, artifact.fileName);
  assert.deepEqual(events, [['create'], ['append'], ['click', artifact.fileName], ['remove'], ['revoke']]);

  artifact.bytes[0] = 0;
  assert.throws(
    () => downloadPayrollBankControlXlsxArtifact(artifact, {}),
    errorCode('BANK_CONTROL_EXPORT_ARTIFACT_INVALID'),
  );
});

test('exportador y pantalla conservan procesamiento local, una acción principal y alcance honesto', () => {
  const source = fs.readFileSync(new URL('../assets/payroll-bank-control-exporter.js', import.meta.url), 'utf8');
  const adapter = fs.readFileSync(new URL('../assets/payroll-bank-control-xlsx-adapter.js', import.meta.url), 'utf8');
  const html = fs.readFileSync(new URL('../reportes-rrhh.html', import.meta.url), 'utf8');
  const build = fs.readFileSync(new URL('../scripts/build-friendly.mjs', import.meta.url), 'utf8');
  const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /\bfetch\s*\(|localStorage|sessionStorage|indexedDB|\.innerHTML|\beval\s*\(|console\./);
  assert.match(adapter, /createPayrollBankControlXlsxArtifact/);
  assert.match(adapter, /downloadPayrollBankControlXlsxArtifact/);
  assert.match(html, /data-bank-control-export-jurisdiction/);
  assert.match(html, /data-bank-control-export-bank/);
  assert.equal((html.match(/data-bank-control-export-xlsx/g) || []).length, 1);
  assert.match(html, /Descargar Excel de control/);
  assert.match(html, /no es un TXT bancario ni acredita pagos/i);
  assert.match(html, /No contiene nombres, CUIL, CBU ni cuentas/i);
  assert.match(build, /assets\/payroll-bank-control-exporter\.js/);
  assert.match(sw, /assets\/payroll-bank-control-exporter\.js/);
});
