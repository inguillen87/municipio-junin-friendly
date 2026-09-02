import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { webcrypto } from 'node:crypto';

import {
  createPayrollPostClosePdfArtifact,
  createPayrollPostCloseXlsxArtifact,
  downloadPayrollPostCloseArtifact,
  PayrollPostCloseExportError,
} from '../assets/payroll-post-close-exporter.js';
import { reconcilePostClose701703 } from '../assets/payroll-post-close-reconciler.js';

const encoder = new TextEncoder();
const GENERATED_AT = '2026-09-02T18:30:00.000Z';

function source({ row701 = '82882370,98', row703 = '106546119,35', ending = '\n' } = {}) {
  return encoder.encode([
    'periodo;jurisdiccion;concepto;importe_ars',
    `2026-07;42;701;${row701}`,
    `2026-07;42;703;${row703}`,
  ].join(ending));
}

async function reconciliation({ control701, control703, observation = '' } = {}) {
  return reconcilePostClose701703({
    period: '2026-07',
    jurisdiction: '42',
    observedBytes: source(),
    controlBytes: source({
      row701: control701 ?? '82882370,98',
      row703: control703 ?? '106546119,35',
      ending: '\r\n',
    }),
    observation,
  }, { cryptoImpl: webcrypto });
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
    assert.equal(method, 0, 'La prueba espera entradas ZIP sin compresión');
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    entries.set(name, decoder.decode(bytes.subarray(dataStart, dataStart + compressedSize)));
    offset = dataStart + compressedSize;
  }
  return entries;
}

function errorCode(code) {
  return (error) => error instanceof PayrollPostCloseExportError && error.code === code;
}

test('genera un XLSX real, determinista y auditable con fórmulas y centavos', async () => {
  const result = await reconciliation();
  const first = createPayrollPostCloseXlsxArtifact(result, { generatedAt: GENERATED_AT });
  const second = createPayrollPostCloseXlsxArtifact(result, { generatedAt: GENERATED_AT });
  assert.equal(first.fileName, 'municontrol_control-poscierre_2026-07_jurisdiccion-42.xlsx');
  assert.equal(first.mimeType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.deepEqual(first.bytes, second.bytes);
  assert.deepEqual([...first.bytes.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);

  const entries = storedZipEntries(first.bytes);
  assert.deepEqual([...entries.keys()].sort(), [
    '[Content_Types].xml', '_rels/.rels', 'docProps/app.xml', 'docProps/core.xml',
    'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml',
    'xl/worksheets/sheet1.xml',
  ]);
  const sheet = entries.get('xl/worksheets/sheet1.xml');
  assert.match(sheet, /MuniControl - Control poscierre de aportes/);
  assert.match(sheet, /Control declarado/);
  assert.match(sheet, /procedencia e independencia de los archivos no están verificadas por el servidor/);
  assert.match(sheet, /Borrador local de control - No oficial/);
  assert.match(sheet, /<f>C8-D8<\/f><v>0\.00<\/v>/);
  assert.match(sheet, /<f>SUM\(C8:C9\)<\/f><v>189428490\.33<\/v>/);
  assert.match(sheet, /82882370\.98/);
  assert.match(sheet, /106546119\.35/);
  assert.match(sheet, /COINCIDENCIA ARITMÉTICA LOCAL - AL CENTAVO/);
  assert.match(sheet, /Reloj del navegador sin verificar/);
  assert.match(sheet, /sha256:[a-f0-9]{64}/);
  assert.match(entries.get('xl/styles.xml'), /formatCode="&quot;\$&quot;#,##0\.00/);
  assert.doesNotMatch([...entries.values()].join('\n'), /reporte-grh-nominal|planilla-control-contable|persona privada/);
});

test('genera un PDF descargable desde el mismo resultado y explicita sus límites', async () => {
  const result = await reconciliation({ control701: '82882370,97', observation: 'dato privado' });
  const artifact = createPayrollPostClosePdfArtifact(result, { generatedAt: GENERATED_AT });
  const text = Buffer.from(artifact.bytes).toString('latin1');
  assert.equal(artifact.fileName, 'municontrol_control-poscierre_2026-07_jurisdiccion-42.pdf');
  assert.equal(artifact.mimeType, 'application/pdf');
  assert.match(text, /^%PDF-1\.4/);
  assert.match(text, /DIFERENCIA ABIERTA - OBSERVACIÓN RECIBIDA SÓLO EN ESTA SESIÓN/);
  assert.match(text, /Autoridad temporal: reloj del navegador sin verificar/);
  assert.match(text, /\$ 82\.882\.370,98/);
  assert.match(text, /\$ 0,01/);
  assert.match(text, /No genera F\.931/);
  assert.match(text, /startxref\n[0-9]+\n%%EOF/);
  assert.doesNotMatch(text, /dato privado|reporte-grh-nominal|planilla-control-contable/);
});

test('las diferencias compensadas siguen abiertas aunque el total sea cero', async () => {
  const result = await reconciliation({
    control701: '82882370,97',
    control703: '106546119,36',
    observation: 'revisión local',
  });
  assert.equal(result.jurisdictionTotal.differenceCents, '0');
  assert.equal(result.status, 'difference_acknowledged');
  const artifact = createPayrollPostCloseXlsxArtifact(result, { generatedAt: GENERATED_AT });
  const sheet = storedZipEntries(artifact.bytes).get('xl/worksheets/sheet1.xml');
  assert.match(sheet, /DIFERENCIA ABIERTA - OBSERVACIÓN RECIBIDA SÓLO EN ESTA SESIÓN/);
  assert.match(sheet, /<c r="F10" s="12" t="inlineStr">.*Diferencia abierta/s);
});

test('bloquea exportación pendiente, fuentes idénticas, manipulación y pérdida de precisión', async () => {
  const pending = await reconciliation({ control701: '82882370,97' });
  assert.throws(
    () => createPayrollPostCloseXlsxArtifact(pending, { generatedAt: GENERATED_AT }),
    errorCode('EXPORT_RESULT_NOT_READY'),
  );

  const identical = await reconcilePostClose701703({
    period: '2026-07', jurisdiction: '42', observedBytes: source(), controlBytes: source(),
  }, { cryptoImpl: webcrypto });
  assert.throws(
    () => createPayrollPostClosePdfArtifact(identical, { generatedAt: GENERATED_AT }),
    errorCode('EXPORT_SOURCE_BYTES_IDENTICAL'),
  );

  const valid = await reconciliation();
  assert.throws(
    () => createPayrollPostCloseXlsxArtifact({
      ...valid,
      comparisons: valid.comparisons.map((row) => row.concept === '701'
        ? { ...row, differenceCents: '1' } : row),
    }, { generatedAt: GENERATED_AT }),
    errorCode('EXPORT_ARITHMETIC_INVALID'),
  );

  const huge = structuredClone(valid);
  huge.comparisons[0].observedCents = '1000000000000000';
  huge.comparisons[0].controlCents = '1000000000000000';
  assert.throws(
    () => createPayrollPostCloseXlsxArtifact(huge, { generatedAt: GENERATED_AT }),
    errorCode('EXPORT_AMOUNT_TOO_LARGE'),
  );
});

test('la descarga usa un nombre allowlisted y revoca la URL temporal', async () => {
  const artifact = createPayrollPostClosePdfArtifact(await reconciliation(), { generatedAt: GENERATED_AT });
  const events = [];
  const anchor = {
    hidden: false, href: '', download: '',
    click() { events.push(['click', this.download]); },
    remove() { events.push(['remove']); },
  };
  class BlobFixture {
    constructor(parts, options) { this.parts = parts; this.type = options.type; }
  }
  const name = downloadPayrollPostCloseArtifact(artifact, {
    documentImpl: {
      createElement: (tag) => { assert.equal(tag, 'a'); return anchor; },
      body: { appendChild: (value) => { assert.equal(value, anchor); events.push(['append']); } },
    },
    urlApi: {
      createObjectURL: (blob) => { assert.equal(blob.type, 'application/pdf'); events.push(['create']); return 'blob:test'; },
      revokeObjectURL: (url) => { assert.equal(url, 'blob:test'); events.push(['revoke']); },
    },
    BlobImpl: BlobFixture,
  });
  assert.equal(name, artifact.fileName);
  assert.deepEqual(events, [
    ['create'], ['append'], ['click', artifact.fileName], ['remove'], ['revoke'],
  ]);
});

test('el exportador no usa red, storage, HTML dinámico ni registra datos', () => {
  const sourceCode = fs.readFileSync(new URL('../assets/payroll-post-close-exporter.js', import.meta.url), 'utf8');
  assert.doesNotMatch(sourceCode, /\bfetch\s*\(/);
  assert.doesNotMatch(sourceCode, /localStorage|sessionStorage|indexedDB|\.innerHTML|\beval\s*\(|console\./);
  assert.doesNotMatch(sourceCode, /fileName.*source|observation\s*:/);
});
