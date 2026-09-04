import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  PAYROLL_ART_NOELIA_ADAPTER_CONTRACT,
  PAYROLL_ART_NOELIA_ADAPTER_CONTRACT_VERSION,
  PayrollArtNoeliaAdapterError,
  reconcileNoeliaArtWorkbookMatrices,
} from '../assets/payroll-art-noelia-adapter.js';

function cuil(dni, prefix = '20') {
  const body = `${prefix}${dni.padStart(8, '0')}`;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((total, weight, index) => total + Number(body[index]) * weight, 0);
  let check = 11 - (sum % 11);
  if (check === 11) check = 0;
  if (check === 10) check = 9;
  return `${body}${check}`;
}

const GALENO_HEADER = [
  'Nombre', 'CUIL', 'DNI', 'Ingreso', 'Nacimiento', 'Domicilio',
  'Imponible', 'No Imponible', 'Asign Fliares',
];
const SUSS_HEADER = [
  'Nº Doc.', 'Tipo de Doc.', 'CUIL sin guiones', 'Apellido y Nombre',
  'Sexo', 'Cantidad de Días Trabajados', 'Fecha de Nacimiento', 'Sueldo',
];

function galeno({
  name = 'Persona descartada', cuilValue, dni = '12345678',
  taxable = '100.000,10', nonTaxable = '2.000,50', family = '1.250,40',
  address = 'Domicilio descartado',
} = {}) {
  return [name, cuilValue || cuil(dni), dni, '2020-01-01', '1990-01-01', address,
    taxable, nonTaxable, family];
}

function suss({
  name = 'Nombre descartado', cuilValue, dni = '12345678', sex = 'M',
  days = '31', salary = '101250,50',
} = {}) {
  return [dni, 'DNI', cuilValue || cuil(dni), name, sex, days, '1990-01-01', salary];
}

test('cruza por CUIL, conserva centavos exactos y descarta nombres, domicilios y fechas', () => {
  const marker = 'MARCADOR-PRIVADO-778899';
  const result = reconcileNoeliaArtWorkbookMatrices({
    galenoRows: [['Reporte ART'], GALENO_HEADER, [
      marker, cuil('12345678'), '12345678', marker, marker, marker,
      '100.000,10', '2.000,50', '1.250,40',
    ]],
    sussRows: [SUSS_HEADER, suss({ name: marker })],
  });

  assert.deepEqual(Object.keys(result), ['contractVersion', 'rows', 'summary']);
  assert.equal(result.contractVersion, PAYROLL_ART_NOELIA_ADAPTER_CONTRACT_VERSION);
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0], {
    dni: '12345678',
    cuil: cuil('12345678'),
    sex: 'M',
    workedDays: '31',
    concept993Cents: '10000010',
    concept995Cents: '125040',
    nonTaxableCents: '200050',
    declaredSalaryCents: '10125050',
    formulaSalaryCents: '10125050',
    differenceCents: '0',
    galenoRowNumbers: [3],
    sussRowNumbers: [2],
    errorCodes: [],
    warningCodes: [],
  });
  assert.doesNotMatch(JSON.stringify(result), /MARCADOR-PRIVADO|Domicilio|Ingreso|Nacimiento/);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.rows), true);
  assert.equal(Object.isFrozen(result.rows[0]), true);
  assert.equal(Object.isFrozen(result.rows[0].errorCodes), true);
});

test('tolera encabezados SUSS con mojibake y variantes de acento', () => {
  const result = reconcileNoeliaArtWorkbookMatrices({
    galenoRows: [GALENO_HEADER, galeno()],
    sussRows: [[
      'NÂº Doc.', 'Tipo de Doc.', 'CUIL sin guiones', 'Apellido y Nombre',
      'Sexo', 'Cantidad de DÃ­as Trabajados', 'Fecha de Nacimiento', 'Sueldo',
    ], suss()],
  });

  assert.equal(result.summary.matchedRecords, 1);
  assert.deepEqual(result.rows[0].errorCodes, []);
});

test('hace unión total y no inventa jurisdicción ni legajo', () => {
  const onlyGaleno = cuil('11111111');
  const onlySuss = cuil('22222222', '27');
  const result = reconcileNoeliaArtWorkbookMatrices({
    galenoRows: [GALENO_HEADER, galeno(), galeno({ dni: '11111111', cuilValue: onlyGaleno })],
    sussRows: [SUSS_HEADER, suss(), suss({ dni: '22222222', cuilValue: onlySuss, sex: 'F' })],
  });

  assert.equal(result.summary.unionRecords, 3);
  assert.equal(result.summary.unmatchedGalenoRecords, 1);
  assert.equal(result.summary.unmatchedSussRecords, 1);
  assert.deepEqual(
    result.rows.find((record) => record.cuil === onlyGaleno).errorCodes,
    ['SUSS_ROW_MISSING'],
  );
  assert.deepEqual(
    result.rows.find((record) => record.cuil === onlySuss).errorCodes,
    ['GALENO_ROW_MISSING'],
  );
  assert.doesNotMatch(JSON.stringify(result), /jurisdiction|jurisdicci|legajo/i);
});

test('agrega filas GALENO del mismo CUIL y bloquea duplicados SUSS o datos inválidos', () => {
  const duplicateCuil = cuil('12345678');
  const result = reconcileNoeliaArtWorkbookMatrices({
    galenoRows: [
      GALENO_HEADER,
      galeno({ cuilValue: duplicateCuil }),
      galeno({ cuilValue: duplicateCuil, taxable: '999,99' }),
      galeno({ dni: '87654321' }),
    ],
    sussRows: [
      SUSS_HEADER,
      suss({ cuilValue: duplicateCuil }),
      suss({ cuilValue: duplicateCuil, salary: '1,00' }),
      suss({ cuilValue: cuil('87654321'), dni: '87654320', sex: 'desconocido', days: '32' }),
    ],
  });

  const duplicate = result.rows.find((record) => record.cuil === duplicateCuil);
  assert.deepEqual(duplicate.galenoRowNumbers, [2, 3]);
  assert.deepEqual(duplicate.sussRowNumbers, [2, 3]);
  assert.equal(duplicate.concept993Cents, '10100009');
  assert.equal(duplicate.concept995Cents, '250080');
  assert.equal(duplicate.declaredSalaryCents, null);
  assert.deepEqual(duplicate.errorCodes, ['SUSS_CUIL_DUPLICATED']);

  const invalid = result.rows.find((record) => record.cuil === cuil('87654321'));
  assert.deepEqual(invalid.errorCodes, [
    'ART_DNI_MISMATCH', 'SUSS_SEX_INVALID', 'SUSS_WORKED_DAYS_INVALID',
  ]);
  assert.equal(result.summary.galenoDuplicateGroups, 1);
  assert.equal(result.summary.sussDuplicateGroups, 1);
});

test('redondea artefactos decimales internos de Excel a centavos', () => {
  const result = reconcileNoeliaArtWorkbookMatrices({
    galenoRows: [GALENO_HEADER, galeno({
      taxable: '270675.20000000001', nonTaxable: '551048.34000000008', family: '0',
    })],
    sussRows: [SUSS_HEADER, suss({ salary: '270675.20000000001' })],
  });

  assert.deepEqual(result.rows[0].errorCodes, []);
  assert.equal(result.rows[0].concept993Cents, '27067520');
  assert.equal(result.rows[0].nonTaxableCents, '55104834');
  assert.equal(result.rows[0].declaredSalaryCents, '27067520');
  assert.equal(result.rows[0].differenceCents, '0');
});

test('trata la diferencia contra 993 + 995 como advertencia separada', () => {
  const result = reconcileNoeliaArtWorkbookMatrices({
    galenoRows: [GALENO_HEADER, galeno({ taxable: '1000.10', family: '20.20' })],
    sussRows: [SUSS_HEADER, suss({ salary: 1020.31 })],
  });

  assert.deepEqual(result.rows[0].errorCodes, []);
  assert.deepEqual(result.rows[0].warningCodes, ['ART_DECLARED_SALARY_DIFFERENCE']);
  assert.equal(result.rows[0].formulaSalaryCents, '102030');
  assert.equal(result.rows[0].declaredSalaryCents, '102031');
  assert.equal(result.rows[0].differenceCents, '1');
  assert.equal(result.summary.recordsWithWarnings, 1);
  assert.equal(result.summary.salaryDifferenceRecords, 1);
});

test('rechaza importes determinantes y CUIL inválidos, pero deja auxiliares como advertencias', () => {
  const result = reconcileNoeliaArtWorkbookMatrices({
    galenoRows: [GALENO_HEADER, galeno({
      cuilValue: '20-00000000-0', taxable: '10,001', nonTaxable: '-1', family: '=1+1',
    })],
    sussRows: [SUSS_HEADER, suss({
      cuilValue: '20-00000000-0', salary: '1e3',
    })],
  });

  assert.equal(result.rows.length, 2);
  assert.ok(result.rows.some((record) => record.errorCodes.includes('GALENO_CUIL_INVALID')));
  assert.ok(result.rows.some((record) => record.errorCodes.includes('SUSS_CUIL_INVALID')));
  assert.ok(result.rows.some((record) => record.errorCodes.includes('GALENO_CONCEPT_993_INVALID')));
  assert.ok(result.rows.some((record) => record.errorCodes.includes('GALENO_CONCEPT_995_INVALID')));
  assert.equal(result.rows.some((record) => (
    record.errorCodes.includes('GALENO_NON_TAXABLE_INVALID')
    || record.errorCodes.includes('SUSS_DECLARED_SALARY_INVALID')
  )), false);
  assert.ok(result.rows.some((record) => (
    record.warningCodes.includes('ART_NON_TAXABLE_UNAVAILABLE')
  )));
  assert.ok(result.rows.some((record) => (
    record.warningCodes.includes('ART_DECLARED_SALARY_UNAVAILABLE')
  )));
});

test('falla de forma tipada cuando falta un encabezado requerido', () => {
  assert.throws(
    () => reconcileNoeliaArtWorkbookMatrices({
      galenoRows: [GALENO_HEADER, galeno()],
      sussRows: [['CUIL sin guiones', 'Sueldo'], [cuil('12345678'), '1,00']],
    }),
    (error) => error instanceof PayrollArtNoeliaAdapterError
      && error.code === 'ART_NOELIA_SUSS_HEADER_MISSING',
  );
});

test('el contrato queda congelado y el adaptador es puro', () => {
  assert.equal(Object.isFrozen(PAYROLL_ART_NOELIA_ADAPTER_CONTRACT), true);
  assert.equal(Object.isFrozen(PAYROLL_ART_NOELIA_ADAPTER_CONTRACT.retainedFields), true);
  const source = fs.readFileSync(new URL('../assets/payroll-art-noelia-adapter.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|CacheStorage/);
  assert.doesNotMatch(source, /console\.|innerHTML|outerHTML|document\./);
  assert.doesNotMatch(source, /from ['"]node:/);
  assert.match(source, /BigInt\(/);
});
