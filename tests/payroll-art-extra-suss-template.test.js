import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readSheet } from 'read-excel-file/node';

import { PAYROLL_ART_INPUT_CONTRACT_VERSION, buildPayrollArtReport } from '../assets/payroll-art-report.js';
import {
  PAYROLL_ART_EXTRA_SUSS_HEADERS,
  PAYROLL_ART_EXTRA_SUSS_TEMPLATE_VERSION,
  createPayrollArtExtraSussXlsxArtifact,
} from '../assets/payroll-art-report-exporter.js';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACTOR_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function cuil(dni, prefix = '20') {
  const body = `${prefix}${dni.padStart(8, '0')}`;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((total, weight, index) => total + Number(body[index]) * weight, 0);
  let check = 11 - (sum % 11); if (check === 11) check = 0; if (check === 10) check = 9;
  return `${body}${check}`;
}
const row = ({ prefix = '20', ...o } = {}) => ({ rowNumber: 1, liquidationId: 'mensual-2026-08-j42', jurisdiction: '42', legajo: '1001', dni: '12345678', cuil: cuil(o.dni || '12345678', prefix), sex: 'M', workedDays: '30', concept993Cents: '377772197', concept995Cents: '0', ...o });
const input = (rows) => ({
  contractVersion: PAYROLL_ART_INPUT_CONTRACT_VERSION, tenantId: TENANT_ID, actorId: ACTOR_ID, requestedAt: '2026-09-03T21:00:00.000Z', period: '2026-08', scope: 'all',
  source: { snapshotId: 'grh-payroll-2026-08-safe-fixture', sha256: `sha256:${'a'.repeat(64)}`, cutoffAt: '2026-09-03T20:30:00.000Z', rowCount: rows.length, includesPersonalRecords: true },
  rows,
});
const throwsCode = (fn, code) => assert.rejects(fn, error => error.code === code);

test('la plantilla extra-SUSS tiene las 8 columnas observadas y un agente por fila', async () => {
  const rows = [row(), row({ rowNumber: 2, legajo: '1002', dni: '23456789', prefix: '27', sex: 'F', workedDays: '25', concept993Cents: '411782000', concept995Cents: '3500000' })];
  const report = await buildPayrollArtReport(input(rows), { cryptoImpl: webcrypto });
  const names = { '12345678': 'Pérez, José', '23456789': 'GÓMEZ ÑUÑEZ, ANA MARÍA' };
  const artifact = await createPayrollArtExtraSussXlsxArtifact(report, { names, cryptoImpl: webcrypto });
  assert.equal(artifact.templateVersion, PAYROLL_ART_EXTRA_SUSS_TEMPLATE_VERSION);
  assert.equal(artifact.fileName, 'plantilla_presentacion_extra-suss_2026-08_todos.xlsx');
  assert.equal(artifact.rowCount, 2);
  assert.equal(artifact.salaryTotalCents, '793054197');
  assert.equal(artifact.officialSubmissionAllowed, false);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'extra-suss-'));
  const file = path.join(dir, artifact.fileName);
  fs.writeFileSync(file, artifact.bytes);
  const sheet = await readSheet(file, { sheet: 'Hoja1' });
  assert.deepEqual(sheet[0], [...PAYROLL_ART_EXTRA_SUSS_HEADERS]);
  assert.deepEqual(sheet[1], [12345678, null, Number(cuil('12345678')), 'PÉREZ, JOSÉ', 'M', 30, null, 3777721.97]);
  assert.deepEqual(sheet[2], [23456789, null, Number(cuil('23456789', '27')), 'GÓMEZ ÑUÑEZ, ANA MARÍA', 'F', 25, null, 4152820]);
  assert.equal(sheet.length, 3);
  const again = await createPayrollArtExtraSussXlsxArtifact(report, { names, cryptoImpl: webcrypto });
  assert.equal(again.sha256, artifact.sha256);
});

test('sin nombre para algún agente, la plantilla no se genera', async () => {
  const report = await buildPayrollArtReport(input([row()]), { cryptoImpl: webcrypto });
  await throwsCode(() => createPayrollArtExtraSussXlsxArtifact(report, { names: {}, cryptoImpl: webcrypto }), 'ART_EXTRA_SUSS_NAME_MISSING');
  await throwsCode(() => createPayrollArtExtraSussXlsxArtifact(report, { names: { '12345678': '  ' }, cryptoImpl: webcrypto }), 'ART_EXTRA_SUSS_NAME_MISSING');
});

test('un reporte con validaciones pendientes no exporta la plantilla', async () => {
  const report = await buildPayrollArtReport(input([row({ sex: 'Z' })]), { cryptoImpl: webcrypto });
  assert.equal(report.readyForReview, false);
  await throwsCode(() => createPayrollArtExtraSussXlsxArtifact(report, { names: { '12345678': 'X Y' }, cryptoImpl: webcrypto }), 'ART_EXTRA_SUSS_NOT_READY');
});
