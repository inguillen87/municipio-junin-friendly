import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { unzipSync } from 'fflate';
import { createPayrollMonthlyCloseApprovedPdf } from '../assets/payroll-monthly-close-approved-report.js';
import {
  createPayrollMonthlyCloseFolder,
  downloadPayrollMonthlyCloseFolder,
  PAYROLL_MONTHLY_CLOSE_FOLDER_VERSION,
} from '../assets/payroll-monthly-close-folder.js';
import { approvedMonthlyCloseRun } from './fixtures/monthly-close-approved-run.js';

const decode = (bytes) => new TextDecoder().decode(bytes);

test('ZIP determinista con cuatro archivos y PDF idéntico al generador existente', () => {
  const run = approvedMonthlyCloseRun();
  const first = createPayrollMonthlyCloseFolder(run);
  const second = createPayrollMonthlyCloseFolder(structuredClone(run));
  const files = unzipSync(first.bytes);
  assert.deepEqual(first.bytes, second.bytes);
  assert.deepEqual(Object.keys(files), ['copia-local-cierre.pdf', 'conciliacion.csv', 'fuentes.csv', 'LEEME.txt']);
  assert.deepEqual(files['copia-local-cierre.pdf'], createPayrollMonthlyCloseApprovedPdf(run).bytes);
  assert.equal(first.contractVersion, PAYROLL_MONTHLY_CLOSE_FOLDER_VERSION);
  assert.equal(first.runId, run.id);
  assert.equal(first.runVersion, run.version);
  assert.equal(first.containsPersonalRecords, false);
  assert.equal(first.verificationStatus, 'local_unsigned_copy');
  assert.equal(first.mimeType, 'application/zip');
  assert.equal(first.fileName, `municontrol_respaldo-cierre_2026-08_j42_${run.id}_v3.zip`);
  const view = new DataView(first.bytes.buffer);
  assert.equal(view.getUint16(10, true), 0);
  assert.equal(view.getUint16(12, true), 0x0021);
  assert.deepEqual([...files['conciliacion.csv'].subarray(0, 3)], [0xef, 0xbb, 0xbf]);
});

test('cada fila conserva la referencia única, importes exactos y fuentes agregadas', () => {
  const run = approvedMonthlyCloseRun();
  run.reconciliation.comparisons[0].reportedEarningsLessRetentionsCents = '9007199254740993';
  run.reconciliation.comparisons[0].reportedBankNetCents = '9007199254740993';
  run.totals.reportedEarningsLessRetentionsCents = '9007199254743043';
  run.totals.reportedBankNetCents = '9007199254743043';
  run.reconciliation.totals = { ...run.totals };
  const files = unzipSync(createPayrollMonthlyCloseFolder(run).bytes);
  for (const name of ['conciliacion.csv', 'fuentes.csv']) {
    const lines = decode(files[name]).trim().split('\r\n');
    for (const line of lines.slice(1)) {
      assert.ok(line.startsWith(`"${run.id}";"3";"2026-08";"42";`));
    }
  }
  const reconciliation = decode(files['conciliacion.csv']);
  assert.match(reconciliation, /"9007199254740993";"9007199254740993";"0"/);
  assert.match(reconciliation, /"9007199254743043";"9007199254743043";"0"/);
  assert.match(reconciliation, /"Gobierno";"Haberes informados";"3100";"3100";"0"/);
  assert.match(reconciliation, /"Gobierno";"Contribuciones patronales";"750";"750";"0"/);
  const sources = decode(files['fuentes.csv']);
  assert.equal(sources.trim().split('\r\n').length, 4);
  assert.match(sources, /"1";"100";"1111111111111111/);
  assert.doesNotMatch(sources, /actor|tenant|membership|manifest|ref:/i);
});

test('orden de fuentes y comparaciones no cambia el respaldo', () => {
  const run = approvedMonthlyCloseRun();
  const unordered = structuredClone(run);
  unordered.sources.reverse();
  unordered.reconciliation.comparisons.reverse();
  unordered.reconciliation.governmentComparisons.reverse();
  assert.deepEqual(createPayrollMonthlyCloseFolder(run).bytes, createPayrollMonthlyCloseFolder(unordered).bytes);
});

test('explica límites de entrega, originales y huellas sin publicar datos nominales', () => {
  const run = approvedMonthlyCloseRun();
  const files = unzipSync(createPayrollMonthlyCloseFolder(run).bytes);
  const readme = decode(files['LEEME.txt']);
  assert.match(readme, /No es la carpeta mensual completa ni una constancia de entrega, recepción o presentación/);
  assert.match(readme, /no contiene los archivos originales/);
  assert.match(readme, /no son hashes de los archivos de esta carpeta ni firmas digitales/);
  assert.match(readme, /Importes expresados en centavos enteros, sin redondeo/);
  assert.match(readme, /sin firma digital ni autenticidad verificable/);
  assert.match(readme, new RegExp(run.id));
  assert.match(readme, /2026-09-04T10:02:00.000Z/);
  const content = Object.values(files).map(decode).join('\n');
  assert.doesNotMatch(content, /employeeId|actorRoleKey|tenantId|membershipId|PLATFORM_OWNER|TENANT_RRHH|cuil|cbu|legajo/i);
});

test('reutiliza bloqueo estricto del PDF para estado, diferencias, evidencia y PII', () => {
  const mutations = [
    (run) => { run.status = 'submitted'; run.closeApproved = false; },
    (run) => { run.totals.differenceCents = '1'; },
    (run) => { run.blockingIssueCount = 1; },
    (run) => { run.timeline = []; },
    (run) => { run.sources.pop(); },
    (run) => { run.reconciliation.governmentComparisons[0].matches = false; },
    (run) => { run.employeeId = 'not-exportable'; },
    (run) => { run.sources[0].originalName = 'not-exportable.csv'; },
  ];
  for (const mutate of mutations) {
    const run = approvedMonthlyCloseRun();
    mutate(run);
    assert.throws(() => createPayrollMonthlyCloseFolder(run));
  }
});

function downloadDependencies({ failAt = '' } = {}) {
  const calls = [];
  const anchor = {
    click() { calls.push('click'); if (failAt === 'click') throw new Error('click failed'); },
    remove() { calls.push('remove'); if (failAt === 'remove') throw new Error('remove failed'); },
  };
  return {
    calls,
    anchor,
    dependencies: {
      BlobImpl: Blob,
      documentImpl: {
        createElement(tag) {
          assert.equal(tag, 'a');
          if (failAt === 'create') throw new Error('create failed');
          return anchor;
        },
        body: { appendChild() { calls.push('append'); if (failAt === 'append') throw new Error('append failed'); } },
      },
      urlApi: {
        createObjectURL(blob) { assert.equal(blob.type, 'application/zip'); return 'blob:folder'; },
        revokeObjectURL(url) { assert.equal(url, 'blob:folder'); calls.push('revoke'); },
      },
    },
  };
}

test('descarga sólo artefacto propio íntegro con nombre controlado y libera recursos', () => {
  const artifact = createPayrollMonthlyCloseFolder(approvedMonthlyCloseRun());
  const { dependencies, calls, anchor } = downloadDependencies();
  assert.equal(downloadPayrollMonthlyCloseFolder(artifact, dependencies), artifact.fileName);
  assert.equal(anchor.download, artifact.fileName);
  assert.deepEqual(calls, ['append', 'click', 'remove', 'revoke']);
  assert.throws(() => downloadPayrollMonthlyCloseFolder(Object.freeze({ ...artifact }), dependencies), { code: 'MONTHLY_CLOSE_FOLDER_INTEGRITY_INVALID' });
  artifact.bytes[50] ^= 1;
  assert.throws(() => downloadPayrollMonthlyCloseFolder(artifact, dependencies), { code: 'MONTHLY_CLOSE_FOLDER_INTEGRITY_INVALID' });
});

test('libera la URL temporal ante falla de enlace, inserción, clic o cleanup', () => {
  const artifact = createPayrollMonthlyCloseFolder(approvedMonthlyCloseRun());
  for (const failAt of ['create', 'append', 'click', 'remove']) {
    const { dependencies, calls } = downloadDependencies({ failAt });
    assert.throws(() => downloadPayrollMonthlyCloseFolder(artifact, dependencies), new RegExp(`${failAt} failed`));
    assert.equal(calls.at(-1), 'revoke');
  }
  assert.throws(() => downloadPayrollMonthlyCloseFolder(artifact, { documentImpl: {} }), { code: 'MONTHLY_CLOSE_FOLDER_DOWNLOAD_UNAVAILABLE' });
});

test('la función no consulta red ni storage y la UI mantiene una acción principal acotada', () => {
  const module = fs.readFileSync(new URL('../assets/payroll-monthly-close-folder.js', import.meta.url), 'utf8');
  assert.doesNotMatch(module, /\bfetch\s*\(|localStorage|sessionStorage|indexedDB|console\.|Date\.now|new Date/);
  const html = fs.readFileSync(new URL('../nomina-control.html', import.meta.url), 'utf8');
  assert.match(html, /\.monthly-close-workspace > \[data-monthly-workflow-prepare-panel\]\[hidden\] \+ \.panel \{ grid-column: 1 \/ -1; \}/);
  const block = html.split('<div class="post-close-export" data-monthly-workflow-approved-proof hidden>')[1].split('</details>')[0];
  assert.equal((block.match(/class="button primary"/g) || []).length, 1);
  assert.match(block, /Descargar carpeta de respaldo/);
  assert.match(block, /<details><summary>Alcance y copia PDF<\/summary>/);
  assert.match(block, /No es la carpeta mensual completa/);
  assert.match(block, /role="status" aria-live="polite"/);
});
