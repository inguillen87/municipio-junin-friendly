import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PAYROLL_REPROCESSING_BUSINESS_REASONS,
  PAYROLL_REPROCESSING_CONTRACT_VERSION,
  getPayrollReprocessingBootstrap,
  listPayrollReprocessingCases,
  normalizePayrollReprocessingDraft,
  normalizePayrollReprocessingIdempotencyKey,
  normalizePayrollReprocessingTransition,
  preparePayrollReprocessingCase,
  transitionPayrollReprocessingCase,
} from '../lib/internal-payroll-reprocessing.js';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MEMBERSHIP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SESSION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const RUN_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CASE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const IDEMPOTENCY = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const REFERENCE = 'ref:11111111-1111-4111-8111-111111111111';
const RELEASE_SHA = 'a'.repeat(40);

function principal() {
  return {
    user: { email: 'operator@junin.gob.ar' },
    tenant: { id: TENANT_ID, membershipId: MEMBERSHIP_ID, source: 'membership' },
  };
}

function session() {
  return {
    id: SESSION_ID,
    email: 'operator@junin.gob.ar',
    version: 3,
    releaseSha: RELEASE_SHA,
  };
}

function draft(overrides = {}) {
  return {
    payrollRunId: RUN_ID,
    requestKind: 'reliquidate',
    reasonCode: 'source_correction',
    reasonReference: REFERENCE,
    ...overrides,
  };
}

function safeResult(status = 'draft') {
  return {
    replayed: false,
    approvalEffect: 'external_execution_authorization_only',
    grhMutation: false,
    payrollVoided: false,
    payrollCalculated: false,
    payrollPosted: false,
    data: {
      id: CASE_ID,
      status,
      executionAuthorized: status === 'approved',
      grhMutation: false,
      payrollVoided: false,
      payrollCalculated: false,
      payrollPosted: false,
    },
  };
}

test('normaliza expediente sin fingir anulación, recálculo ni posteo', () => {
  const result = normalizePayrollReprocessingDraft(draft());
  assert.equal(result.contractVersion, PAYROLL_REPROCESSING_CONTRACT_VERSION);
  assert.equal(result.requestKind, 'reliquidate');
  assert.equal(result.approvalEffect, 'external_execution_authorization_only');
  assert.equal(result.grhMutation, false);
  assert.equal(result.payrollVoided, false);
  assert.equal(result.payrollCalculated, false);
  assert.equal(result.payrollPosted, false);
  assert.deepEqual(PAYROLL_REPROCESSING_BUSINESS_REASONS, [
    'duplicate_run', 'incorrect_personnel', 'incorrect_concept', 'incorrect_amount',
    'source_correction', 'legal_adjustment', 'other_controlled',
  ]);
});

test('borrador es cerrado y exige motivo y referencia opaca', () => {
  assert.throws(
    () => normalizePayrollReprocessingDraft({ ...draft(), amount: 100 }),
    (error) => error.code === 'PAYROLL_REPROCESSING_DRAFT_INVALID',
  );
  assert.throws(
    () => normalizePayrollReprocessingDraft(draft({ requestKind: 'recalculate' })),
    (error) => error.code === 'PAYROLL_REPROCESSING_KIND_INVALID',
  );
  assert.throws(
    () => normalizePayrollReprocessingDraft(draft({ reasonCode: 'free_text' })),
    (error) => error.code === 'PAYROLL_REPROCESSING_REASON_INVALID',
  );
  assert.throws(
    () => normalizePayrollReprocessingDraft(draft({ reasonReference: 'Expediente 42' })),
    (error) => error.code === 'PAYROLL_REPROCESSING_REASON_REFERENCE_REQUIRED',
  );
});

test('todas las transiciones exigen versión, razón allowlisted y referencia', () => {
  const valid = normalizePayrollReprocessingTransition('approve', {
    caseId: CASE_ID,
    expectedVersion: 2,
    reasonCode: 'approved_for_external_execution',
    reasonReference: REFERENCE,
  });
  assert.equal(valid.expectedVersion, 2);
  assert.equal(valid.reasonReference, REFERENCE);
  assert.throws(
    () => normalizePayrollReprocessingTransition('approve', {
      caseId: CASE_ID,
      expectedVersion: 2,
      reasonCode: 'approved',
      reasonReference: REFERENCE,
    }),
    (error) => error.code === 'PAYROLL_REPROCESSING_REASON_INVALID',
  );
  assert.throws(
    () => normalizePayrollReprocessingTransition('cancel', {
      caseId: CASE_ID,
      expectedVersion: 1,
      reasonCode: 'cancelled_by_preparer',
      reasonReference: null,
    }),
    (error) => error.code === 'PAYROLL_REPROCESSING_REASON_REFERENCE_REQUIRED',
  );
});

test('clave idempotente sólo admite UUID v4', () => {
  assert.equal(normalizePayrollReprocessingIdempotencyKey(IDEMPOTENCY), IDEMPOTENCY);
  assert.throws(
    () => normalizePayrollReprocessingIdempotencyKey('11111111-1111-1111-8111-111111111111'),
    (error) => error.code === 'PAYROLL_REPROCESSING_IDEMPOTENCY_KEY_INVALID',
  );
});

test('prepare envía contexto mínimo, campos canónicos y command hash', async () => {
  const calls = [];
  const sql = { async query(statement, values) {
    calls.push({ statement, values });
    return [{ result: safeResult() }];
  } };
  await preparePayrollReprocessingCase(
    sql, principal(), session(), draft(), IDEMPOTENCY,
  );
  assert.match(calls[0].statement, /payroll_reprocessing_prepare_v1/);
  assert.deepEqual(Object.keys(JSON.parse(calls[0].values[0])).sort(), [
    'actorEmail', 'actorSessionId', 'actorSessionVersion',
    'membershipId', 'releaseSha', 'tenantId',
  ].sort());
  assert.equal(calls[0].values[1], RUN_ID);
  assert.equal(calls[0].values[2], 'reliquidate');
  assert.equal(calls[0].values[3], 'source_correction');
  assert.equal(calls[0].values[4], REFERENCE);
  assert.match(calls[0].values[6], /^[a-f0-9]{64}$/);
  assert.doesNotMatch(calls[0].statement, /UPDATE\s+payroll_run|employment_movement/i);
});

test('transition transmite versión y no amplía efectos aprobados', async () => {
  const calls = [];
  const sql = { async query(statement, values) {
    calls.push({ statement, values });
    return [{ result: safeResult('approved') }];
  } };
  const result = await transitionPayrollReprocessingCase(
    sql,
    principal(),
    session(),
    'approve',
    {
      caseId: CASE_ID,
      expectedVersion: 2,
      reasonCode: 'approved_for_external_execution',
      reasonReference: REFERENCE,
    },
    IDEMPOTENCY,
  );
  assert.equal(result.data.executionAuthorized, true);
  assert.equal(result.data.payrollVoided, false);
  assert.match(calls[0].statement, /payroll_reprocessing_transition_v1/);
  assert.equal(calls[0].values[3], 2);
});

test('facades rechazan respuestas que afirman efectos no ejecutados', async () => {
  const unsafe = { async query() {
    return [{ result: { feature: {
      grhMutation: false,
      payrollVoided: true,
      payrollCalculated: false,
      payrollPosted: false,
    } } }];
  } };
  await assert.rejects(
    getPayrollReprocessingBootstrap(unsafe, principal(), session()),
    (error) => error.code === 'PAYROLL_REPROCESSING_CONTRACT_DRIFT',
  );
});

test('lista valida paginación y mapea conflictos sin filtrar SQL', async () => {
  await assert.rejects(
    listPayrollReprocessingCases({ query: async () => [] }, principal(), session(), {
      status: 'unknown', page: 1, limit: 20,
    }),
    (error) => error.code === 'PAYROLL_REPROCESSING_LIST_INVALID',
  );
  const duplicate = { async query() {
    throw new Error('PAYROLL_REPROCESSING_DUPLICATE_CASE details secret');
  } };
  await assert.rejects(
    preparePayrollReprocessingCase(duplicate, principal(), session(), draft(), IDEMPOTENCY),
    (error) => error.code === 'PAYROLL_REPROCESSING_DUPLICATE_CASE'
      && error.status === 409
      && error.message === 'Ya existe un expediente activo para esa corrida',
  );
});
