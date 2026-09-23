import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmployeeSourceSeniorityModel as model, sourceSeniorityComponentLabel as label, sourceSeniorityCutoffLabel } from '../assets/employee-source-seniority-model.js';

const CONTRACT = '10000000-0000-4000-8000-000000000001';
const BATCH = '20000000-0000-4000-8000-000000000002';
const OTHER = '30000000-0000-4000-8000-000000000003';
const employee = (employment = {}) => ({ recordOrigin: 'GRH', contractId: CONTRACT, contractSourceBatchId: BATCH, fechaIngreso: '1999-01-02', rawFields: { employment } });
const reference = (override = {}) => ({ sourceSystem: 'GRH', sourceEntity: 'legajo', canonicalEntity: 'employment_contract', canonicalId: CONTRACT, sourceBatchId: BATCH, validFrom: '2026-09-10T18:17:30.000Z', ...override });

test('reports original years and months with the exact contract/batch cutoff, without elapsed-time calculations', () => {
  const input = employee({ seniorityYears: 8, seniorityMonths: 7 });
  const snapshot = JSON.stringify(input);
  const result = model(input, [reference()]);
  assert.deepEqual(result, { origin: 'GRH', years: { value: 8, status: 'reported' }, months: { value: 7, status: 'reported' }, hireDate: '1999-01-02', sourceCutoff: '2026-09-10T18:17:30.000Z', scope: 'source_snapshot' });
  assert.equal(JSON.stringify(input), snapshot);
  assert.match(sourceSeniorityCutoffLabel(result.sourceCutoff), /10\/09\/2026.*15:17.*hora argentina/);
});

test('zero is reported while null, absent and empty remain missing; one absent component does not erase the other', () => {
  for (const zero of [0, '0']) {
    const result = model(employee({ seniorityYears: zero, seniorityMonths: zero }));
    assert.equal(label(result.years), '0'); assert.equal(label(result.months), '0');
  }
  for (const missing of [null, undefined, '']) {
    const result = model(employee({ seniorityYears: 9, seniorityMonths: missing }));
    assert.equal(label(result.years), '9'); assert.equal(label(result.months), 'No informado');
    assert.equal(result.months.value, null);
  }
});

test('invalid months are neither normalized into years nor silently accepted', () => {
  for (const value of [12, 14, -1]) {
    const result = model(employee({ seniorityYears: 2, seniorityMonths: value }));
    assert.equal(result.months.status, 'invalid'); assert.equal(result.months.value, value);
    assert.equal(result.years.value, 2); assert.match(label(result.months), /Requiere revisión/);
  }
  for (const value of [true, ' 0 ', '1.5', 1.5, [], {}, NaN, Infinity, '2 meses']) {
    assert.deepEqual(model(employee({ seniorityMonths: value })).months, { value: null, status: 'invalid' });
  }
  assert.equal(model(employee({ seniorityMonths: 11 })).months.status, 'reported');
  assert.equal(model(employee({ seniorityYears: -1 })).years.status, 'invalid');
});

test('cutoff cannot come from another person, batch, entity or source and ambiguous matches stay unavailable', () => {
  for (const override of [{ canonicalId: OTHER }, { sourceBatchId: OTHER }, { sourceSystem: 'PERSONAS' }, { sourceEntity: 'personas' }, { canonicalEntity: 'person_identity' }]) {
    assert.equal(model(employee(), [reference(override)]).sourceCutoff, null);
  }
  assert.equal(model(employee(), [reference(), reference()]).sourceCutoff, null);
  assert.equal(model(employee(), [reference(), reference({ canonicalId: OTHER })]).sourceCutoff, reference().validFrom);
  assert.equal(model({ ...employee(), contractSourceBatchId: undefined }, [reference()]).sourceCutoff, null);
});

test('unavailable or invalid dates never borrow payroll/global dates or a different payload', () => {
  const input = { ...employee(), fechaIngreso: '2026-02-30', sourceCutoff: '2026-09-10T18:17:30Z', statusSnapshotDate: '2026-09-30', legacyRawFields: { employment: { seniorityYears: 40, seniorityMonths: 10 } } };
  for (const value of ['2026-02-30T18:00:00Z', '2026-09-10', 'garbage', null]) {
    const result = model(input, [reference({ validFrom: value })]);
    assert.equal(result.sourceCutoff, null); assert.equal(result.hireDate, null); assert.equal(result.years.status, 'missing');
  }
  assert.equal(sourceSeniorityCutoffLabel(null), 'No disponible');
});

test('native or unidentified origins never acquire a GRH seniority from attached data', () => {
  for (const recordOrigin of ['MUNICONTROL', undefined, null, 'OTHER']) {
    assert.equal(model({ ...employee({ seniorityYears: 10 }), recordOrigin }, [reference()]), null);
  }
});
