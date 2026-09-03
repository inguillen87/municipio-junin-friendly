import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  PAYROLL_ART_CANONICAL_CSV_HEADER,
  parsePayrollArtCanonicalCsv,
} from '../assets/payroll-art-report-workbench.js';
import { PayrollArtReportError } from '../assets/payroll-art-report.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function cuil(dni, prefix = '20') {
  const body = `${prefix}${dni.padStart(8, '0')}`;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((total, weight, index) => total + Number(body[index]) * weight, 0);
  let check = 11 - (sum % 11);
  if (check === 11) check = 0;
  if (check === 10) check = 9;
  return `${body}${check}`;
}

function csv(row = `mensual-2026-08-j42;42;1001;12345678;${cuil('12345678')};M;31;100000,00;2500,00`) {
  return new TextEncoder().encode(`${PAYROLL_ART_CANONICAL_CSV_HEADER.join(';')}\r\n${row}\r\n`);
}

test('adapta el CSV canónico a centavos exactos para el motor ART', () => {
  const rows = parsePayrollArtCanonicalCsv(csv());
  assert.deepEqual(rows, [{
    rowNumber: 2,
    liquidationId: 'mensual-2026-08-j42',
    jurisdiction: '42',
    legajo: '1001',
    dni: '12345678',
    cuil: cuil('12345678'),
    sex: 'M',
    workedDays: '31',
    concept993Cents: '10000000',
    concept995Cents: '250000',
  }]);
});

test('rechaza cabecera, importes ambiguos y espacios silenciosos', () => {
  assert.throws(
    () => parsePayrollArtCanonicalCsv(new TextEncoder().encode('otra;cabecera\n1;2\n')),
    (error) => error instanceof PayrollArtReportError && error.code === 'ART_CSV_HEADER_INVALID',
  );
  assert.throws(
    () => parsePayrollArtCanonicalCsv(csv(`mensual-2026-08-j42;42;1001;12345678;${cuil('12345678')};M;31;100.000,00;0,00`)),
    (error) => error instanceof PayrollArtReportError && error.code === 'ART_CSV_AMOUNT_INVALID',
  );
  assert.throws(
    () => parsePayrollArtCanonicalCsv(csv(`mensual-2026-08-j42;42;1001 ;12345678;${cuil('12345678')};M;31;1,00;0,00`)),
    (error) => error instanceof PayrollArtReportError && error.code === 'ART_CSV_ROW_INVALID',
  );
});

test('la interfaz ART queda sujeta a capacidad, fuente real y límites explícitos', () => {
  const html = read('nomina-control.html');
  const source = read('assets/payroll-art-report-workbench.js');
  const build = read('scripts/build-friendly.mjs');

  assert.match(html, /data-payroll-art-report-workbench/);
  assert.match(html, /data-art-snapshot/);
  assert.match(html, /La herramienta no envía el archivo, no modifica nómina/);
  assert.match(html, /Uso autorizado · salida no oficial/);
  assert.match(html, /un Excel de cuatro hojas y un PDF institucional interno/);
  assert.match(source, /payroll\.art_report\.generate/);
  assert.match(source, /principal\.capabilities\.includes\(PAYROLL_ART_REQUIRED_CAPABILITY\)/);
  assert.match(source, /createPayrollArtOfficePack/);
  assert.match(source, /Descargar Excel/);
  assert.match(source, /Descargar PDF/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|console\./);
  assert.equal((html.match(/assets\/payroll-art-report-workbench\.js/g) || []).length, 1);
  assert.match(build, /'assets\/payroll-art-report\.js'/);
  assert.match(build, /'assets\/payroll-art-report-exporter\.js'/);
  assert.match(build, /'assets\/payroll-art-report-workbench\.js'/);
});
