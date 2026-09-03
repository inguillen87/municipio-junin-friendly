import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import { readSheet } from 'read-excel-file/node';

import {
  PAYROLL_ART_INPUT_CONTRACT_VERSION,
  PAYROLL_ART_REPORT_CONTRACT_VERSION,
  PayrollArtReportError,
  buildPayrollArtReport,
} from '../assets/payroll-art-report.js';
import {
  PAYROLL_ART_OFFICE_EXPORT_CONTRACT_VERSION,
  createPayrollArtOfficePack,
  createPayrollArtPdfArtifact,
  createPayrollArtXlsxArtifact,
} from '../assets/payroll-art-report-exporter.js';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACTOR_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function cuil(dni, prefix = '20') {
  const body = `${prefix}${dni.padStart(8, '0')}`;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((total, weight, index) => total + Number(body[index]) * weight, 0);
  let check = 11 - (sum % 11);
  if (check === 11) check = 0;
  if (check === 10) check = 9;
  return `${body}${check}`;
}

function row({
  rowNumber = 1,
  liquidationId = 'mensual-2026-08-j42',
  jurisdiction = '42',
  legajo = '1001',
  dni = '12345678',
  cuilValue = cuil(dni),
  sex = 'M',
  workedDays = '31',
  concept993Cents = '10000000',
  concept995Cents = '250000',
} = {}) {
  return {
    rowNumber,
    liquidationId,
    jurisdiction,
    legajo,
    dni,
    cuil: cuilValue,
    sex,
    workedDays,
    concept993Cents,
    concept995Cents,
  };
}

function input(rows = [row()], overrides = {}) {
  return {
    contractVersion: PAYROLL_ART_INPUT_CONTRACT_VERSION,
    tenantId: TENANT_ID,
    actorId: ACTOR_ID,
    requestedAt: '2026-09-03T21:00:00.000Z',
    period: '2026-08',
    scope: 'all',
    source: {
      snapshotId: 'grh-payroll-2026-08-safe-fixture',
      sha256: `sha256:${'a'.repeat(64)}`,
      cutoffAt: '2026-09-03T20:30:00.000Z',
      rowCount: rows.length,
      includesPersonalRecords: true,
    },
    rows,
    ...overrides,
  };
}

function storedZipEntries(bytes) {
  const entries = new Map();
  const decoder = new TextDecoder();
  let offset = 0;
  while (offset + 4 <= bytes.byteLength) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
    if (view.getUint32(0, true) !== 0x04034b50) break;
    const method = view.getUint16(8, true);
    const compressedSize = view.getUint32(18, true);
    const nameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    assert.equal(method, 0);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    entries.set(name, decoder.decode(bytes.subarray(dataStart, dataStart + compressedSize)));
    offset = dataStart + compressedSize;
  }
  return entries;
}

test('genera XLSX y PDF reales, deterministas y trazables desde el mismo reporte confiable', async () => {
  const report = await buildPayrollArtReport(input(), { cryptoImpl: webcrypto });
  const first = await createPayrollArtOfficePack(report, { cryptoImpl: webcrypto });
  const second = await createPayrollArtOfficePack(report, { cryptoImpl: webcrypto });

  assert.equal(first.contractVersion, PAYROLL_ART_OFFICE_EXPORT_CONTRACT_VERSION);
  assert.equal(first.reportSha256, report.traceability.reportSha256);
  assert.equal(first.officialSubmissionAllowed, false);
  assert.equal(first.persistencePerformed, false);
  assert.equal(first.networkPerformed, false);
  assert.match(first.bundleSha256, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(first.files.map((file) => file.fileName), [
    `municontrol_art-provincia_2026-08_todos_${report.traceability.reportSha256.slice(7, 19)}.xlsx`,
    `municontrol_art-provincia_2026-08_todos_${report.traceability.reportSha256.slice(7, 19)}.pdf`,
  ]);
  assert.deepEqual(first.files[0].bytes, second.files[0].bytes);
  assert.deepEqual(first.files[1].bytes, second.files[1].bytes);
  assert.equal(first.files[0].sha256, second.files[0].sha256);
  assert.equal(first.files[1].sha256, second.files[1].sha256);
  assert.deepEqual([...first.files[0].bytes.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
  assert.equal(Buffer.from(first.files[1].bytes.subarray(0, 8)).toString('latin1'), '%PDF-1.4');
  for (const artifact of first.files) {
    assert.equal(artifact.classification, 'restricted_personal_payroll_data');
    assert.equal(artifact.containsPersonalRecords, true);
    assert.equal(artifact.byteLength, artifact.bytes.byteLength);
    assert.match(artifact.sha256, /^sha256:[a-f0-9]{64}$/);
  }
});

test('el XLSX macro-free abre con cuatro hojas y conserva detalle nominal, resumen y huellas', async () => {
  const report = await buildPayrollArtReport(input(), { cryptoImpl: webcrypto });
  const artifact = await createPayrollArtXlsxArtifact(report, { cryptoImpl: webcrypto });
  const entries = storedZipEntries(artifact.bytes);
  assert.deepEqual([...entries.keys()].sort(), [
    '[Content_Types].xml', '_rels/.rels', 'docProps/app.xml', 'docProps/core.xml',
    'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml',
    'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml',
    'xl/worksheets/sheet4.xml',
  ]);
  const packageText = [...entries.values()].join('\n');
  assert.match(entries.get('xl/workbook.xml'), /sheet name="Resumen".*sheet name="Detalle nominal".*sheet name="Rechazados".*sheet name="Trazabilidad"/s);
  assert.doesNotMatch(packageText, /vbaProject|macroEnabled|externalLink|oleObject|activeX|<externalReferences|DDE|WEBSERVICE\s*\(/i);
  assert.doesNotMatch(packageText, /<f>/);
  assert.match(entries.get('xl/worksheets/sheet4.xml'), new RegExp(report.traceability.reportSha256));
  assert.match(entries.get('xl/worksheets/sheet4.xml'), /Presentación oficial habilitada.*NO/s);

  const detail = await readSheet(Buffer.from(artifact.bytes), 'Detalle nominal');
  assert.deepEqual(detail[3].slice(0, 10), [
    'Período', 'Alcance', 'Fila fuente', 'Liquidación', 'Jurisdicción', 'Legajo',
    'DNI', 'CUIL', 'Sexo', 'Días trabajados',
  ]);
  assert.equal(detail[4][5], '1001');
  assert.equal(detail[4][6], '12345678');
  assert.equal(detail[4][7], cuil('12345678'));
  assert.equal(detail[4][10], '100000,00');
  assert.equal(detail[4][11], '2500,00');
  assert.equal(detail[4][12], '102500,00');
  assert.equal(detail[4][15], '10250000');

  const rejected = await readSheet(Buffer.from(artifact.bytes), 'Rechazados');
  assert.deepEqual(rejected[3], ['Fila fuente', 'Código de validación']);
  assert.deepEqual(rejected[4], ['Sin rechazos', '—']);
});

test('preserva importes int64 al centavo sin convertirlos a punto flotante', async () => {
  const exact = '9223372036854775807';
  const report = await buildPayrollArtReport(input([
    row({ concept993Cents: exact, concept995Cents: '0' }),
  ]), { cryptoImpl: webcrypto });
  const xlsx = await createPayrollArtXlsxArtifact(report, { cryptoImpl: webcrypto });
  const detail = await readSheet(Buffer.from(xlsx.bytes), 'Detalle nominal');
  assert.equal(detail[4][13], exact);
  assert.equal(detail[4][15], exact);
  assert.equal(detail[4][12], '92233720368547758,07');
  assert.match(storedZipEntries(xlsx.bytes).get('xl/worksheets/sheet1.xml'), /9223372036854775807/);

  const pdf = await createPayrollArtPdfArtifact(report, { cryptoImpl: webcrypto });
  assert.match(Buffer.from(pdf.bytes).toString('latin1'), /\$ 92\.233\.720\.368\.547\.758,07/);
});

test('el PDF A4 apaisado pagina detalle nominal y limita rechazos a fila y código', async () => {
  const acceptedRows = Array.from({ length: 23 }, (_, index) => {
    const dni = String(10000000 + index);
    return row({
      rowNumber: index + 1,
      liquidationId: `mensual-2026-08-${index + 1}`,
      jurisdiction: index % 2 ? '55' : '42',
      legajo: String(2000 + index),
      dni,
      cuilValue: cuil(dni),
      concept993Cents: String(100000 + index),
      concept995Cents: '50',
    });
  });
  const report = await buildPayrollArtReport(input(acceptedRows), { cryptoImpl: webcrypto });
  const artifact = await createPayrollArtPdfArtifact(report, { cryptoImpl: webcrypto });
  const text = Buffer.from(artifact.bytes).toString('latin1');
  assert.match(text, /\/MediaBox \[0 0 842 595\]/);
  assert.match(text, /\/Count 3/);
  assert.match(text, /REPORTE ART PROVINCIA · DETALLE NOMINAL/);
  assert.match(text, /10000000/);
  assert.match(text, /10000022/);
  assert.match(text, /Página 3 de 3/);
  assert.match(text, /No constituye presentación oficial ni envío a ART/);

  const marker = 'PERSONA-PRIVADA-778899';
  const blocked = await buildPayrollArtReport(input([
    { ...row(), liquidationId: `=${marker}` },
  ]), { cryptoImpl: webcrypto });
  const blockedPack = await createPayrollArtOfficePack(blocked, { cryptoImpl: webcrypto });
  const combined = blockedPack.files.map((file) => Buffer.from(file.bytes).toString('latin1')).join('\n');
  assert.match(combined, /ART_LIQUIDATION_ID_INVALID/);
  assert.doesNotMatch(combined, /PERSONA-PRIVADA|778899|12345678|20123456786/);
  assert.equal(blockedPack.files[0].containsPersonalRecords, false);
  assert.equal(blockedPack.files[1].containsPersonalRecords, false);
});

test('rechaza reportes fabricados aunque imiten el contrato público', async () => {
  const forged = {
    contractVersion: PAYROLL_ART_REPORT_CONTRACT_VERSION,
    traceability: { reportSha256: `sha256:${'a'.repeat(64)}` },
  };
  await assert.rejects(
    createPayrollArtXlsxArtifact(forged, { cryptoImpl: webcrypto }),
    (error) => error instanceof PayrollArtReportError && error.code === 'ART_REPORT_NOT_TRUSTED',
  );
  await assert.rejects(
    createPayrollArtPdfArtifact(structuredClone(forged), { cryptoImpl: webcrypto }),
    (error) => error instanceof PayrollArtReportError && error.code === 'ART_REPORT_NOT_TRUSTED',
  );
});

test('el exportador es local, sin red, storage, logs, DOM ni dependencias Node', () => {
  const source = fs.readFileSync(
    new URL('../assets/payroll-art-report-exporter.js', import.meta.url), 'utf8',
  );
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|CacheStorage/);
  assert.doesNotMatch(source, /console\.|innerHTML|outerHTML|\bdocument\.(?:body|createElement|querySelector)/);
  assert.doesNotMatch(source, /from ['"]node:/);
  assert.match(source, /BigInt\(/);
  assert.match(source, /subtle\.digest\('SHA-256'/);
});
