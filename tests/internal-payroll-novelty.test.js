import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PAYROLL_NOVELTY_CONTRACT_VERSION,
  PAYROLL_NOVELTY_MAX_ROWS,
  PAYROLL_NOVELTY_PAYROLL_TYPES,
  exportPayrollNovelty,
  getPayrollNoveltyBootstrap,
  normalizePayrollNoveltyDraft,
  normalizePayrollNoveltyIdempotencyKey,
  normalizePayrollNoveltyTransition,
  preparePayrollNovelty,
} from '../lib/internal-payroll-novelty.js';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MEMBERSHIP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SESSION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const RELEASE_SHA = 'd'.repeat(40);

function row(overrides = {}) {
  return {
    rowOrdinal: 1,
    legajo: '571',
    conceptSourceId: '120',
    costCenterSourceId: null,
    adjustmentMonth: null,
    quantityDecimal: '1.5',
    amountCents: null,
    movementType: 'standard',
    legalInstrument: null,
    observation: 'Novedad informada por el área solicitante.',
    forced: false,
    ...overrides,
  };
}

function draft(overrides = {}) {
  return {
    sourceMode: 'individual',
    periodMonth: '2026-08-01',
    payrollType: 'monthly',
    rows: [row()],
    ...overrides,
  };
}

function principal() {
  return {
    user: { email: 'operator@junin.gob.ar' },
    tenant: { id: TENANT_ID, membershipId: MEMBERSHIP_ID, source: 'membership' },
  };
}

function session() {
  return { id: SESSION_ID, email: 'operator@junin.gob.ar', version: 3, releaseSha: RELEASE_SHA };
}

test('normaliza una novedad individual sin inferir cálculo ni posteo', () => {
  const result = normalizePayrollNoveltyDraft(draft());
  assert.equal(result.contractVersion, PAYROLL_NOVELTY_CONTRACT_VERSION);
  assert.equal(result.sourceMode, 'individual');
  assert.equal(result.summary.rowCount, 1);
  assert.equal(result.summary.totalAmountCents, '0');
  assert.equal(result.validation.valid, true);
  assert.equal(result.grhMutation, false);
  assert.equal(result.payrollCalculated, false);
  assert.equal(result.payrollPosted, false);
  assert.equal(result.persistencePerformed, false);
  assert.deepEqual(result.rows[0], row());
});

test('admite primera quincena como tipo canónico sin confundir complementaria u otra', () => {
  assert.deepEqual(PAYROLL_NOVELTY_PAYROLL_TYPES, [
    'monthly', 'first_fortnight', 'sac', 'vacation', 'supplementary', 'final', 'other',
  ]);
  assert.equal(normalizePayrollNoveltyDraft(draft({
    payrollType: 'first_fortnight',
  })).payrollType, 'first_fortnight');
  for (const nonCanonical of ['first-fortnight', 'primera_quincena', 'complementary']) {
    assert.throws(
      () => normalizePayrollNoveltyDraft(draft({ payrollType: nonCanonical })),
      (error) => error.code === 'PAYROLL_NOVELTY_PAYROLL_TYPE_INVALID',
    );
  }
});

test('valida lote masivo con centavos int64 y suma exacta BigInt', () => {
  const result = normalizePayrollNoveltyDraft(draft({
    sourceMode: 'bulk',
    payrollType: 'supplementary',
    rows: [
      row({ rowOrdinal: 1, amountCents: '9007199254740993', quantityDecimal: null }),
      row({ rowOrdinal: 2, legajo: '572', amountCents: '-125', quantityDecimal: null }),
    ],
  }));
  assert.equal(result.summary.rowCount, 2);
  assert.equal(result.summary.totalAmountCents, '9007199254740868');
  assert.equal(result.rows[0].amountCents, '9007199254740993');
});

test('rechaza floats JS, filas duplicadas y meses de ajuste futuros', () => {
  assert.throws(
    () => normalizePayrollNoveltyDraft(draft({ rows: [row({ quantityDecimal: 1.5 })] })),
    (error) => error.code === 'PAYROLL_NOVELTY_ROW_INVALID'
      && error.details.rowOrdinal === 1,
  );
  assert.throws(
    () => normalizePayrollNoveltyDraft(draft({
      sourceMode: 'bulk',
      rows: [row(), row({ rowOrdinal: 2 })],
    })),
    (error) => error.code === 'PAYROLL_NOVELTY_DUPLICATE_ROW'
      && error.details.rowOrdinal === 2 && error.details.duplicateOf === 1,
  );
  assert.throws(
    () => normalizePayrollNoveltyDraft(draft({
      rows: [row({ adjustmentMonth: '2026-09-01' })],
    })),
    (error) => error.code === 'PAYROLL_NOVELTY_ADJUSTMENT_MONTH_INVALID'
      && error.details.rowOrdinal === 1,
  );
});

test('modo forzado exige importe y justificación explícita', () => {
  assert.throws(
    () => normalizePayrollNoveltyDraft(draft({
      rows: [row({ forced: true, observation: 'Urgente' })],
    })),
    (error) => error.code === 'PAYROLL_NOVELTY_FORCED_JUSTIFICATION_REQUIRED',
  );
  const valid = normalizePayrollNoveltyDraft(draft({
    rows: [row({
      forced: true,
      amountCents: '12500',
      quantityDecimal: null,
      observation: 'Excepción documentada para revisión manual.',
    })],
  }));
  assert.equal(valid.summary.forcedCount, 1);
  assert.throws(
    () => normalizePayrollNoveltyDraft(draft({
      rows: [row({ amountCents: '-0', quantityDecimal: null })],
    })),
    (error) => error.code === 'PAYROLL_NOVELTY_ROW_INVALID',
  );
});

test('contrato es cerrado, acotado y no acepta filas ambiguas', () => {
  assert.throws(
    () => normalizePayrollNoveltyDraft({ ...draft(), tenantId: TENANT_ID }),
    (error) => error.code === 'PAYROLL_NOVELTY_DRAFT_INVALID',
  );
  assert.throws(
    () => normalizePayrollNoveltyDraft(draft({ rows: [row({ rowOrdinal: 2 })] })),
    (error) => error.code === 'PAYROLL_NOVELTY_ROW_ORDINAL_INVALID',
  );
  assert.throws(
    () => normalizePayrollNoveltyDraft(draft({
      sourceMode: 'individual', rows: [row(), row({ rowOrdinal: 2, legajo: '572' })],
    })),
    (error) => error.code === 'PAYROLL_NOVELTY_INDIVIDUAL_ROW_COUNT_INVALID',
  );
  const rows = Array.from({ length: PAYROLL_NOVELTY_MAX_ROWS + 1 }, (_, index) => (
    row({ rowOrdinal: index + 1, legajo: String(index + 1) })
  ));
  assert.throws(
    () => normalizePayrollNoveltyDraft(draft({ sourceMode: 'bulk', rows })),
    (error) => error.code === 'PAYROLL_NOVELTY_ROW_COUNT_INVALID',
  );
});

test('transiciones y claves idempotentes usan allowlists exactas', () => {
  const key = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  assert.equal(normalizePayrollNoveltyIdempotencyKey(key), key);
  assert.deepEqual(normalizePayrollNoveltyTransition('approve', {
    batchId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    expectedVersion: 2,
    reasonCode: 'validated_for_export',
    reasonReference: null,
  }), {
    batchId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    expectedVersion: 2,
    reasonCode: 'validated_for_export',
    reasonReference: null,
  });
  assert.throws(
    () => normalizePayrollNoveltyTransition('reject', {
      batchId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      expectedVersion: 2,
      reasonCode: 'invalid_rows',
      reasonReference: null,
    }),
    (error) => error.code === 'PAYROLL_NOVELTY_REASON_REFERENCE_REQUIRED',
  );
  assert.throws(
    () => normalizePayrollNoveltyIdempotencyKey('no-es-uuid-v4'),
    (error) => error.code === 'PAYROLL_NOVELTY_IDEMPOTENCY_KEY_INVALID',
  );
});

test('facades transmiten sólo contexto de sesión, contrato canónico y hash', async () => {
  const calls = [];
  const sql = {
    async query(statement, values) {
      calls.push({ statement, values });
      return [{ result: {
        replayed: false,
        data: {
          id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          status: 'draft',
          grhMutation: false,
          payrollCalculated: false,
          payrollPosted: false,
        },
      } }];
    },
  };
  await preparePayrollNovelty(
    sql, principal(), session(), draft(), 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  );
  assert.match(calls[0].statement, /payroll_novelty_prepare_v1/);
  const context = JSON.parse(calls[0].values[0]);
  assert.deepEqual(Object.keys(context).sort(), [
    'actorEmail', 'actorSessionId', 'actorSessionVersion',
    'membershipId', 'releaseSha', 'tenantId',
  ].sort());
  assert.equal(context.tenantId, TENANT_ID);
  assert.equal(calls[0].values[1], 'individual');
  assert.equal(calls[0].values[2], '2026-08-01');
  assert.equal(calls[0].values[3], 'monthly');
  assert.match(calls[0].values[6], /^[a-f0-9]{64}$/);
  assert.doesNotMatch(calls[0].statement, /employment_movement|calculo|GRH/i);
});

test('un lote activo equivalente se informa como conflicto seguro y reintentable', async () => {
  const duplicate = {
    async query() {
      throw new Error('PAYROLL_NOVELTY_DUPLICATE_BATCH');
    },
  };
  await assert.rejects(
    preparePayrollNovelty(
      duplicate, principal(), session(), draft(),
      'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    ),
    (error) => error.code === 'PAYROLL_NOVELTY_DUPLICATE_BATCH'
      && error.status === 409
      && error.message === 'Ya existe un lote equivalente',
  );
});

test('bootstrap y exportación fallan cerrados ante flags ampliados', async () => {
  const unsafe = {
    async query() {
      return [{ result: { feature: {
        grhMutation: false, payrollCalculated: true, payrollPosted: false,
      } } }];
    },
  };
  await assert.rejects(
    getPayrollNoveltyBootstrap(unsafe, principal(), session()),
    (error) => error.code === 'PAYROLL_NOVELTY_CONTRACT_DRIFT',
  );

  const safeExport = {
    async query() {
      return [{ result: {
        contractVersion: 'payroll-novelty-export.v1',
        approvalEffect: 'export_only',
        data: {
          id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          contractVersion: PAYROLL_NOVELTY_CONTRACT_VERSION,
          status: 'approved',
          exportable: true,
          rows: [row()],
          grhMutation: false,
          payrollCalculated: false,
          payrollPosted: false,
        },
      } }];
    },
  };
  const result = await exportPayrollNovelty(
    safeExport, principal(), session(), 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  );
  assert.equal(result.data.exportable, true);
  assert.equal(result.data.status, 'approved');
});
