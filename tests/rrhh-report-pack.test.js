import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  createRrhhReportPack,
  createRrhhReportPdfArtifact,
  createRrhhReportSnapshot,
  createRrhhReportXlsxArtifact,
  downloadRrhhReportArtifact,
  RRHH_REPORT_PACK_CONTRACT_VERSION,
  RrhhReportPackError,
} from '../assets/rrhh-report-pack.js';

const GENERATED_AT = '2026-09-02T21:30:00.000Z';
const fixture = JSON.parse(fs.readFileSync(new URL('../friendly-data.json', import.meta.url), 'utf8'));

function copyFixture() {
  return structuredClone(fixture);
}

function errorCode(code) {
  return (error) => error instanceof RrhhReportPackError && error.code === code;
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
    assert.equal(method, 0, 'La prueba espera entradas ZIP almacenadas sin compresión');
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    entries.set(name, decoder.decode(bytes.subarray(dataStart, dataStart + compressedSize)));
    offset = dataStart + compressedSize;
  }
  return entries;
}

test('normaliza y congela exactamente el snapshot agregado real', () => {
  const snapshot = createRrhhReportSnapshot(copyFixture(), { generatedAt: GENERATED_AT });
  assert.equal(snapshot.contractVersion, RRHH_REPORT_PACK_CONTRACT_VERSION);
  assert.equal(snapshot.source.cutoffDate, '2026-08-06');
  assert.equal(snapshot.source.sha256, 'sha256:cb5c60a0e5dd2462ab7d5e89ba4fe9b7f57b9283aeeb0f89f7c8918730359e92');
  assert.equal(snapshot.snapshotId, 'rrhh:2026-08-06:cb5c60a0e5dd2462ab7d5e89ba4fe9b7f57b9283aeeb0f89f7c8918730359e92');
  assert.equal(snapshot.workforce.active + snapshot.workforce.inactive, snapshot.workforce.historicalRecords);
  assert.equal(snapshot.management.current.hires - snapshot.management.current.exits, snapshot.management.current.balance);
  assert.equal(snapshot.management.visibleTotals.hires, 580);
  assert.equal(snapshot.management.visibleTotals.exits, 500);
  assert.equal(snapshot.absence.visibleTotals.events, 12782);
  assert.equal(snapshot.absence.totalEvents, 31572);
  assert.equal(snapshot.privacy.containsPersonRows, false);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.source.limitations), true);
  assert.equal(Object.isFrozen(snapshot.workforce.activeSectors[0]), true);
});

test('crea un pack determinista con XLSX OOXML macro-free de cinco hojas y PDF A4 desde la misma instantánea', () => {
  const first = createRrhhReportPack(copyFixture(), { generatedAt: GENERATED_AT });
  const second = createRrhhReportPack(copyFixture(), { generatedAt: GENERATED_AT });
  assert.equal(first.xlsx.snapshotId, first.snapshot.snapshotId);
  assert.equal(first.pdf.snapshotId, first.snapshot.snapshotId);
  assert.equal(first.xlsx.sourceSha256, first.pdf.sourceSha256);
  assert.deepEqual(first.xlsx.bytes, second.xlsx.bytes);
  assert.deepEqual(first.pdf.bytes, second.pdf.bytes);
  assert.equal(first.xlsx.fileName, 'municontrol_informe-rrhh_2026-08-06_cb5c60a0e5dd.xlsx');
  assert.equal(first.pdf.fileName, 'municontrol_informe-rrhh_2026-08-06_cb5c60a0e5dd.pdf');
  assert.deepEqual([...first.xlsx.bytes.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);

  const entries = storedZipEntries(first.xlsx.bytes);
  assert.deepEqual([...entries.keys()].sort(), [
    '[Content_Types].xml', '_rels/.rels', 'docProps/app.xml', 'docProps/core.xml',
    'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml',
    'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml',
    'xl/worksheets/sheet4.xml', 'xl/worksheets/sheet5.xml',
  ]);
  const workbook = entries.get('xl/workbook.xml');
  for (const name of ['Resumen', 'Movimientos', 'Ausentismo', 'Sectores', 'Metodología']) {
    assert.match(workbook, new RegExp(`sheet name="${name}"`));
  }
  const packageText = [...entries.values()].join('\n');
  assert.doesNotMatch(packageText, /vbaProject|macroEnabled|externalLink|oleObject|activeX/i);
  assert.doesNotMatch(packageText, /<externalReferences|DDE|WEBSERVICE\s*\(/i);

  const pdf = Buffer.from(first.pdf.bytes).toString('latin1');
  assert.match(pdf, /^%PDF-1\.4/);
  assert.match(pdf, /\/MediaBox \[0 0 595 842\]/);
  assert.match(pdf, /INFORME EJECUTIVO DE RECURSOS HUMANOS/);
  assert.match(pdf, /datos agregados sin filas personales/i);
  assert.match(pdf, /Límites de interpretación/);
  assert.match(pdf, /Página 1 de 1 - A4/);
  assert.match(pdf, /startxref\n[0-9]+\n%%EOF/);
});

test('las hojas conservan totales exactos, fórmulas locales y límites visibles', () => {
  const snapshot = createRrhhReportSnapshot(copyFixture(), { generatedAt: GENERATED_AT });
  const artifact = createRrhhReportXlsxArtifact(snapshot);
  const entries = storedZipEntries(artifact.bytes);
  const summary = entries.get('xl/worksheets/sheet1.xml');
  const movements = entries.get('xl/worksheets/sheet2.xml');
  const absences = entries.get('xl/worksheets/sheet3.xml');
  const sectors = entries.get('xl/worksheets/sheet4.xml');
  const method = entries.get('xl/worksheets/sheet5.xml');

  assert.match(summary, /<f>SUM\(B7:B8\)<\/f><v>2450<\/v>/);
  assert.match(summary, /<f>B12-B13<\/f><v>49<\/v>/);
  assert.match(movements, /<f>SUM\(B9:B16\)<\/f><v>580<\/v>/);
  assert.match(movements, /<f>SUM\(C9:C16\)<\/f><v>500<\/v>/);
  assert.match(absences, /<f>SUM\(B7:B14\)<\/f><v>12782<\/v>/);
  assert.match(absences, /Contratos-año; no contratos únicos/);
  assert.match(sectors, /<f>SUM\(B5:B13\)<\/f><v>882<\/v>/);
  assert.match(method, /sha256:cb5c60a0e5dd2462ab7d5e89ba4fe9b7f57b9283aeeb0f89f7c8918730359e92/);
  assert.match(method, /La fuente no contiene importes salariales utilizables para publicar masa salarial/);
  assert.match(method, /Reloj del cliente no verificado por servidor/);
  assert.doesNotMatch([...entries.values()].join('\n'), /marcelo@|[0-9]{2}-?[0-9]{8}-?[0-9]/i);
});

test('rechaza forma desconocida, filas personales y PII profundamente anidada', () => {
  const missing = copyFixture();
  delete missing.management;
  assert.throws(
    () => createRrhhReportSnapshot(missing, { generatedAt: GENERATED_AT }),
    errorCode('RRHH_SHAPE_INVALID'),
  );

  const rows = copyFixture();
  rows.employees = [{ name: 'Persona privada', dni: '12345678' }];
  assert.throws(
    () => createRrhhReportSnapshot(rows, { generatedAt: GENERATED_AT }),
    errorCode('RRHH_PII_REJECTED'),
  );

  const email = copyFixture();
  email.source.method = 'Entregado por persona.privada@example.org';
  assert.throws(
    () => createRrhhReportSnapshot(email, { generatedAt: GENERATED_AT }),
    errorCode('RRHH_PII_REJECTED'),
  );

  const privacy = copyFixture();
  privacy.privacy.containsPersonRows = true;
  assert.throws(
    () => createRrhhReportSnapshot(privacy, { generatedAt: GENERATED_AT }),
    errorCode('RRHH_PRIVACY_INVALID'),
  );
});

test('rechaza SHA, corte, series, aritmética y grupos manipulados', () => {
  const invalidSha = copyFixture();
  invalidSha.source.sha256 = 'CB5C';
  assert.throws(
    () => createRrhhReportSnapshot(invalidSha, { generatedAt: GENERATED_AT }),
    errorCode('RRHH_SOURCE_INVALID'),
  );

  const cutoff = copyFixture();
  cutoff.absence.latestValidDate = '2026-08-05';
  assert.throws(
    () => createRrhhReportSnapshot(cutoff, { generatedAt: GENERATED_AT }),
    errorCode('RRHH_CUTOFF_INCONSISTENT'),
  );

  const series = copyFixture();
  series.absence.yearly[3].year = 2029;
  assert.throws(
    () => createRrhhReportSnapshot(series, { generatedAt: GENERATED_AT }),
    errorCode('RRHH_SERIES_INCONSISTENT'),
  );

  const arithmetic = copyFixture();
  arithmetic.management.current.balance = 50;
  assert.throws(
    () => createRrhhReportSnapshot(arithmetic, { generatedAt: GENERATED_AT }),
    errorCode('RRHH_SERIES_INCONSISTENT'),
  );

  const workforce = copyFixture();
  workforce.workforce.activeSectors[0].value += 1;
  assert.throws(
    () => createRrhhReportSnapshot(workforce, { generatedAt: GENERATED_AT }),
    errorCode('RRHH_WORKFORCE_INCONSISTENT'),
  );

  const smallGroup = copyFixture();
  smallGroup.privacy.minimumPublishedGroupSize = 16;
  assert.throws(
    () => createRrhhReportSnapshot(smallGroup, { generatedAt: GENERATED_AT }),
    errorCode('RRHH_PRIVACY_INVALID'),
  );
});

test('sólo exporta snapshots emitidos e inmutables y no acepta artefactos alterados', () => {
  const snapshot = createRrhhReportSnapshot(copyFixture(), { generatedAt: GENERATED_AT });
  const forged = structuredClone(snapshot);
  assert.throws(() => createRrhhReportPdfArtifact(forged), errorCode('RRHH_SNAPSHOT_INVALID'));

  const artifact = createRrhhReportPdfArtifact(snapshot);
  artifact.bytes[10] ^= 0xff;
  assert.throws(
    () => downloadRrhhReportArtifact(artifact, {}),
    errorCode('RRHH_ARTIFACT_INVALID'),
  );
});

test('la descarga usa nombre allowlisted y siempre revoca la URL temporal', () => {
  const pack = createRrhhReportPack(copyFixture(), { generatedAt: GENERATED_AT });
  const events = [];
  const anchor = {
    hidden: false, href: '', download: '',
    click() { events.push(['click', this.download]); },
    remove() { events.push(['remove']); },
  };
  class BlobFixture {
    constructor(parts, options) { this.parts = parts; this.type = options.type; }
  }
  const name = downloadRrhhReportArtifact(pack.xlsx, {
    documentImpl: {
      createElement: (tag) => { assert.equal(tag, 'a'); return anchor; },
      body: { appendChild: (value) => { assert.equal(value, anchor); events.push(['append']); } },
    },
    urlApi: {
      createObjectURL: (blob) => { assert.equal(blob.type, pack.xlsx.mimeType); events.push(['create']); return 'blob:rrhh'; },
      revokeObjectURL: (url) => { assert.equal(url, 'blob:rrhh'); events.push(['revoke']); },
    },
    BlobImpl: BlobFixture,
  });
  assert.equal(name, 'municontrol_informe-rrhh_2026-08-06_cb5c60a0e5dd.xlsx');
  assert.deepEqual(events, [
    ['create'], ['append'], ['click', name], ['remove'], ['revoke'],
  ]);
});

test('el módulo es local y no usa red, storage, HTML dinámico, logs ni evaluación', () => {
  const sourceCode = fs.readFileSync(new URL('../assets/rrhh-report-pack.js', import.meta.url), 'utf8');
  assert.doesNotMatch(sourceCode, /\bfetch\s*\(/);
  assert.doesNotMatch(sourceCode, /localStorage|sessionStorage|indexedDB|\.innerHTML|\beval\s*\(|new Function\s*\(|console\./);
  assert.doesNotMatch(sourceCode, /importe|salary|sueldo|remuneraci[oó]n/i);
});
