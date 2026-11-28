import test from 'node:test';
import assert from 'node:assert/strict';
import {
  salaryConditionsPending,
  SALARY_CONDITIONS_PENDING_VERSION,
  SALARY_CONDITIONS_PENDING_MAX_ROWS,
  SALARY_CONDITIONS_PENDING_DECISION_WINDOW_DAYS,
} from '../assets/own-contract-salary-conditions-pending.js';

const uuid = index => '00000000-0000-4000-8000-' + String(index).padStart(12, '0');
const invalid = value => assert.throws(() => salaryConditionsPending(value), {
  name: 'SalaryInputError', code: 'SALARY_CONDITIONS_PENDING_CONTRACT_INVALID',
});

function pendingFixture() {
  return {
    version: SALARY_CONDITIONS_PENDING_VERSION,
    generatedAt: '2026-11-10T16:00:00.000Z',
    complete: true,
    decisionWindowDays: 30,
    toReview: [{
      proposalId: uuid(1), period: '2026-10', authorLabel: 'Preparación municipal',
      createdAt: '2026-11-01T10:00:00+00:00', canReview: true,
    }],
    decided: [{
      eventId: uuid(3), proposalId: uuid(2), period: '2026-10', status: 'approved',
      actorLabel: 'Revisión municipal', recordedAt: '2026-11-09T12:00:00.123456+00:00',
    }],
    counts: { toReview: 1, decided: 1 },
    payrollCalculated: false,
    payrollPosted: false,
  };
}

function emptyFixture() {
  return { ...pendingFixture(), toReview: [], decided: [], counts: { toReview: 0, decided: 0 } };
}

test('preserves the exact metadata response without mutation or new fields', () => {
  const value = pendingFixture();
  const before = JSON.stringify(value);
  assert.equal(salaryConditionsPending(value), value);
  assert.equal(JSON.stringify(value), before);
  assert.equal(SALARY_CONDITIONS_PENDING_MAX_ROWS, 1000);
  assert.equal(SALARY_CONDITIONS_PENDING_DECISION_WINDOW_DAYS, 30);
});

test('accepts a complete empty response and both decision statuses', () => {
  assert.equal(salaryConditionsPending(emptyFixture()).counts.toReview, 0);
  const value = pendingFixture();
  value.decided[0].status = 'rejected';
  assert.equal(salaryConditionsPending(value), value);
});

const envelopeMutations = {
  version: value => { value.version = 'own-contract-salary-conditions.v1'; },
  incomplete: value => { value.complete = false; },
  partial: value => { value.partial = true; },
  wrongWindow: value => { value.decisionWindowDays = 29; },
  stringWindow: value => { value.decisionWindowDays = '30'; },
  calculated: value => { value.payrollCalculated = true; },
  posted: value => { value.payrollPosted = true; },
  numericCalculated: value => { value.payrollCalculated = 0; },
  source: value => { value.source = { subjects: [] }; },
  reason: value => { value.reason = 'No se transmite texto libre'; },
  href: value => { value.href = '/liquidaciones'; },
  email: value => { value.email = 'synthetic@example.invalid'; },
  countMismatch: value => { value.counts.toReview = 2; },
  numericStringCount: value => { value.counts.decided = '1'; },
  extraCount: value => { value.counts.total = 2; },
  nullList: value => { value.toReview = null; },
  objectList: value => { value.decided = {}; },
};
for (const [name, mutate] of Object.entries(envelopeMutations)) {
  test('rejects incompatible envelope ' + name, () => {
    const value = pendingFixture();
    mutate(value);
    invalid(value);
  });
}

test('rejects missing fields at every object level', () => {
  for (const fields of [Object.keys(pendingFixture()), Object.keys(pendingFixture().toReview[0]),
    Object.keys(pendingFixture().decided[0]), Object.keys(pendingFixture().counts)]) {
    for (const field of fields) {
      const value = pendingFixture();
      const target = fields.includes('version') ? value : fields.includes('canReview')
        ? value.toReview[0] : fields.includes('eventId') ? value.decided[0] : value.counts;
      delete target[field];
      invalid(value);
    }
  }
});

test('rejects nominal, free text and navigation fields inside either list', () => {
  for (const field of ['items', 'body', 'subjects', 'personId', 'email', 'reason', 'href']) {
    for (const name of ['toReview', 'decided']) {
      const value = pendingFixture();
      value[name][0][field] = 'synthetic';
      invalid(value);
    }
  }
});

test('accepts exactly one thousand records in each complete list', () => {
  const value = pendingFixture();
  const proposal = value.toReview[0];
  const decision = value.decided[0];
  value.toReview = Array.from({ length: 1000 }, (_, index) => ({ ...proposal, proposalId: uuid(index + 1) }));
  value.decided = Array.from({ length: 1000 }, (_, index) => ({
    ...decision, proposalId: uuid(index + 1001), eventId: uuid(index + 2001),
  }));
  value.counts = { toReview: 1000, decided: 1000 };
  assert.equal(salaryConditionsPending(value), value);
  for (const name of ['toReview', 'decided']) {
    const overflow = structuredClone(value);
    const extra = { ...overflow[name][0], proposalId: uuid(4001) };
    if (name === 'decided') extra.eventId = uuid(4002);
    overflow[name].push(extra);
    overflow.counts[name] = 1001;
    invalid(overflow);
  }
});

test('rejects duplicate proposal and event identities across both lists', () => {
  const mutations = [
    value => { value.toReview.push({ ...value.toReview[0] }); value.counts.toReview++; },
    value => { value.decided.push({ ...value.decided[0], eventId: uuid(4) }); value.counts.decided++; },
    value => { value.decided.push({ ...value.decided[0], proposalId: uuid(4) }); value.counts.decided++; },
    value => { value.decided[0].proposalId = value.toReview[0].proposalId; },
    value => { value.decided[0].eventId = value.toReview[0].proposalId; },
    value => { value.decided[0].eventId = value.decided[0].proposalId; },
  ];
  for (const mutate of mutations) {
    const value = pendingFixture();
    mutate(value);
    invalid(value);
  }
});

test('requires canonical UUIDs, valid periods and an actual review permission', () => {
  for (const id of ['invalid', uuid(1).toUpperCase().replace('4000', '4ABC'), null, 12]) {
    const value = pendingFixture();
    value.toReview[0].proposalId = id;
    invalid(value);
  }
  for (const period of ['2026-00', '2026-13', '26-10', '2100-01', '2026-1']) {
    for (const name of ['toReview', 'decided']) {
      const value = pendingFixture();
      value[name][0].period = period;
      invalid(value);
    }
  }
  for (const canReview of [false, 1, 'true', null]) {
    const value = pendingFixture();
    value.toReview[0].canReview = canReview;
    invalid(value);
  }
  for (const status of ['pending', 'approve', 'cancelled', null]) {
    const value = pendingFixture();
    value.decided[0].status = status;
    invalid(value);
  }
});

test('validates zoned ISO timestamps and their real calendar date', () => {
  for (const timestamp of ['2026-11-10', '2026-11-10T12:00:00', '2026-02-30T12:00:00Z',
    '2026-13-01T12:00:00Z', '2026-11-10T24:00:00Z', '2026-11-10T12:60:00Z',
    '2026-11-10T12:00:60Z', '2026-11-10T12:00:00+24:00', '2026-11-10T12:00:00+00:60',
    '2026-11-10T12:00:00Z ignored', 123, null]) {
    for (const field of ['generatedAt', 'createdAt', 'recordedAt']) {
      const value = pendingFixture();
      const target = field === 'createdAt' ? value.toReview[0] : field === 'recordedAt' ? value.decided[0] : value;
      target[field] = timestamp;
      invalid(value);
    }
  }
  const value = pendingFixture();
  value.toReview[0].createdAt = '2024-02-29T12:00:00+03:00';
  assert.equal(salaryConditionsPending(value), value);
});

test('accepts the inclusive thirty-day decision window and rejects either outside edge', () => {
  const value = pendingFixture();
  value.decided[0].recordedAt = '2026-10-11T16:00:00.000Z';
  assert.equal(salaryConditionsPending(value), value);
  value.decided[0].recordedAt = value.generatedAt;
  assert.equal(salaryConditionsPending(value), value);
  for (const timestamp of ['2026-10-11T15:59:59.999Z', '2026-11-10T16:00:00.001Z']) {
    value.decided[0].recordedAt = timestamp;
    invalid(value);
  }
});

test('preserves historical Unicode labels within PostgreSQL character limits', () => {
  const value = pendingFixture();
  value.toReview[0].authorLabel = 'Gestio\u0301n municipal';
  value.decided[0].actorLabel = '🏛'.repeat(160);
  assert.equal(salaryConditionsPending(value), value);
  for (const label of ['', 'x'.repeat(161), '🏛'.repeat(161), null, 123]) {
    for (const name of ['toReview', 'decided']) {
      const changed = pendingFixture();
      changed[name][0][name === 'toReview' ? 'authorLabel' : 'actorLabel'] = label;
      invalid(changed);
    }
  }
});

test('rejects sparse arrays, accessor slots and hidden metadata without invoking getters', () => {
  const sparse = pendingFixture();
  sparse.toReview = new Array(1);
  invalid(sparse);
  let calls = 0;
  const accessor = pendingFixture();
  Object.defineProperty(accessor.toReview, '0', { enumerable: true, get() { calls++; return {}; } });
  invalid(accessor);
  const rootAccessor = pendingFixture();
  Object.defineProperty(rootAccessor, 'generatedAt', { enumerable: true, get() { calls++; return ''; } });
  invalid(rootAccessor);
  assert.equal(calls, 0);
  for (const decorate of [
    value => { value.toReview.extra = true; },
    value => { value[Symbol('hidden')] = true; },
    value => { Object.defineProperty(value.counts, 'hidden', { value: true }); },
    value => { Object.setPrototypeOf(value.toReview[0], null); },
  ]) {
    const value = pendingFixture();
    decorate(value);
    invalid(value);
  }
});

test('compares PostgreSQL microseconds exactly at both decision-window boundaries', () => {
  const value = pendingFixture();
  value.generatedAt = '2026-11-10T16:00:00.123456+00:00';
  for (const timestamp of ['2026-10-11T16:00:00.123456Z', '2026-11-10T13:00:00.123456-03:00']) {
    value.decided[0].recordedAt = timestamp;
    assert.equal(salaryConditionsPending(value), value);
  }
  for (const timestamp of ['2026-10-11T16:00:00.123455Z', '2026-11-10T16:00:00.123457+00:00']) {
    value.decided[0].recordedAt = timestamp;
    invalid(value);
  }
});

test('rejects a proposal one microsecond after the snapshot and preserves older pending work', () => {
  const value = pendingFixture();
  value.generatedAt = '2026-11-10T16:00:00.123456+00:00';
  value.toReview[0].createdAt = '2026-11-10T13:00:00.123456-03:00';
  assert.equal(salaryConditionsPending(value), value);
  value.toReview[0].createdAt = '2026-11-10T16:00:00.123457Z';
  invalid(value);
  value.toReview[0].createdAt = '1900-01-01T00:00:00Z';
  value.toReview[0].period = '1900-01';
  assert.equal(salaryConditionsPending(value), value);
});
