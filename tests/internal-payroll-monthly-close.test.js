import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PAYROLL_MONTHLY_CLOSE_CONTRACT_VERSION,
  getPayrollMonthlyCloseBootstrap,
  listPayrollMonthlyCloseRuns,
  normalizePayrollMonthlyCloseDraft,
  normalizePayrollMonthlyCloseIdempotencyKey,
  normalizePayrollMonthlyCloseTransition,
  persistPayrollMonthlyCloseRun,
  readPayrollMonthlyCloseAttempt,
  readPayrollMonthlyCloseRun,
  transitionPayrollMonthlyCloseRun,
} from '../lib/internal-payroll-monthly-close.js';
import { MONTHLY_CLOSE_SOURCE_CONTRACTS } from '../lib/internal-monthly-close-contracts.js';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MEMBERSHIP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SESSION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BINDING_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const RUN_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const IDEMPOTENCY = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const REFERENCE = 'ref:11111111-1111-4111-8111-111111111111';
const RELEASE_SHA = 'a'.repeat(40);
const GOVERNMENT_METRICS = [
  ['cantidad_agentes', 'personas'],
  ['haberes_rem_no_docentes', 'centavos'],
  ['haberes_rem_docentes', 'centavos'],
  ['haberes_no_rem', 'centavos'],
  ['aportes_jubilatorios_no_docentes', 'centavos'],
  ['aportes_jubilatorios_docentes', 'centavos'],
  ['aportes_jubilatorios_docentes_2', 'centavos'],
  ['aportes_osep', 'centavos'],
  ['aportes_osep_no_rem', 'centavos'],
  ['seguro_mutual', 'centavos'],
  ['contribuciones_jubilatorias', 'centavos'],
  ['contribuciones_osep', 'centavos'],
  ['contribuciones_osep_no_rem', 'centavos'],
  ['art', 'centavos'],
];

function principal() {
  return {
    user: { email: 'operator@junin.gob.ar' },
    tenant: { id: TENANT_ID, membershipId: MEMBERSHIP_ID, source: 'membership' },
  };
}

function session() {
  return {
    id: SESSION_ID, email: 'operator@junin.gob.ar', version: 3, releaseSha: RELEASE_SHA,
  };
}

function csv(lines) {
  return Buffer.from(lines.join('\n'), 'utf8');
}

function sources({ governmentContributionDifference = 0 } = {}) {
  const governmentValues = {
    cantidad_agentes: '5',
    haberes_rem_no_docentes: '3000',
    haberes_rem_docentes: '0',
    haberes_no_rem: '100',
    aportes_jubilatorios_no_docentes: '1',
    aportes_jubilatorios_docentes: '2',
    aportes_jubilatorios_docentes_2: '3',
    aportes_osep: '4',
    aportes_osep_no_rem: '5',
    seguro_mutual: '6',
    contribuciones_jubilatorias: '700',
    contribuciones_osep: '25',
    contribuciones_osep_no_rem: '0',
    art: String(25 - governmentContributionDifference),
  };
  return [
    {
      definitionKey: 'grh-concept-statistics.v1',
      sourceKind: 'grh_observed',
      bytes: csv([
        MONTHLY_CLOSE_SOURCE_CONTRACTS['grh-concept-statistics.v1'].header,
        '2026-08;42;1;701;2;200;1000;0;0;0;250',
        '2026-08;42;2;703;3;300;2000;100;0;50;500',
      ]),
    },
    {
      definitionKey: 'bank-accreditation-summary.v1',
      sourceKind: 'bank_control',
      bytes: csv([
        MONTHLY_CLOSE_SOURCE_CONTRACTS['bank-accreditation-summary.v1'].header,
        '2026-08;42;1;191;cuenta_corriente;2;1000',
        '2026-08;42;2;191;caja_ahorro;3;2050',
      ]),
    },
    {
      definitionKey: 'government-payroll-summary.v1',
      sourceKind: 'government_control',
      bytes: csv([
        MONTHLY_CLOSE_SOURCE_CONTRACTS['government-payroll-summary.v1'].header,
        ...GOVERNMENT_METRICS.map(([metric, unit]) => (
          `2026-08;42;${metric};${unit};informado;${governmentValues[metric]}`
        )),
      ]),
    },
  ];
}

function context() {
  return {
    tenantId: TENANT_ID,
    sourceBindingId: BINDING_ID,
    releaseSha: RELEASE_SHA,
    fingerprintKey: Buffer.from('monthly-close-fingerprint-secret-32-bytes'),
  };
}

function draft(options = {}) {
  return normalizePayrollMonthlyCloseDraft({
    period: '2026-08', jurisdiction: '42', sources: sources(options),
  }, context());
}

function flags(closeApproved = false) {
  return {
    closeApproved,
    includesPersonalRecords: false,
    rawContentStored: false,
    grhMutation: false,
    payrollCalculated: false,
    payrollPosted: false,
    bankArtifactGenerated: false,
    governmentArtifactGenerated: false,
    fiscalArtifactGenerated: false,
  };
}

function run(status = 'prepared', { detailed = true, allowedCommands } = {}) {
  const prepared = draft();
  const reason = {
    prepared: ['sources_prepared', null],
    submitted: ['ready_for_review', REFERENCE],
    approved: ['approved_by_checker', REFERENCE],
    rejected: ['source_mismatch', REFERENCE],
    cancelled: ['cancelled_by_preparer', REFERENCE],
  }[status];
  const transitions = {
    submitted: ['submit', 'prepared', 'submitted', 'ready_for_review'],
    approved: ['approve', 'submitted', 'approved', 'approved_by_checker'],
    rejected: ['reject', 'submitted', 'rejected', 'source_mismatch'],
    cancelled: ['cancel', 'prepared', 'cancelled', 'cancelled_by_preparer'],
  };
  const timeline = detailed ? [{
    id: 1,
    command: 'prepare',
    fromStatus: null,
    toStatus: 'prepared',
    expectedVersion: 0,
    resultingVersion: 1,
    reasonCode: 'sources_prepared',
    reasonReference: null,
    actorRoleKey: 'PLATFORM_OWNER_OPERATIVO_INTEGRAL',
    eventSha256: 'a'.repeat(64),
    occurredAt: '2026-09-04T10:00:00.000Z',
  }] : [];
  if (detailed && status === 'submitted') {
    timeline.push({
      id: 2, command: 'submit', fromStatus: 'prepared', toStatus: 'submitted',
      expectedVersion: 1, resultingVersion: 2, reasonCode: 'ready_for_review',
      reasonReference: REFERENCE, actorRoleKey: 'PLATFORM_OWNER_OPERATIVO_INTEGRAL',
      eventSha256: 'b'.repeat(64), occurredAt: '2026-09-04T10:01:00.000Z',
    });
  } else if (detailed && ['approved', 'rejected'].includes(status)) {
    timeline.push({
      id: 2, command: 'submit', fromStatus: 'prepared', toStatus: 'submitted',
      expectedVersion: 1, resultingVersion: 2, reasonCode: 'ready_for_review',
      reasonReference: REFERENCE, actorRoleKey: 'PLATFORM_OWNER_OPERATIVO_INTEGRAL',
      eventSha256: 'b'.repeat(64), occurredAt: '2026-09-04T10:01:00.000Z',
    });
    const [command, fromStatus, toStatus, reasonCode] = transitions[status];
    timeline.push({
      id: 3, command, fromStatus, toStatus,
      expectedVersion: 2, resultingVersion: 3, reasonCode,
      reasonReference: REFERENCE, actorRoleKey: 'HUGO_APROBADOR_INTEGRAL',
      eventSha256: 'd'.repeat(64), occurredAt: '2026-09-04T10:02:00.000Z',
    });
  } else if (detailed && status === 'cancelled') {
    const [command, fromStatus, toStatus, reasonCode] = transitions[status];
    timeline.push({
      id: 2, command, fromStatus, toStatus,
      expectedVersion: 1, resultingVersion: 2, reasonCode,
      reasonReference: REFERENCE, actorRoleKey: 'PLATFORM_OWNER_OPERATIVO_INTEGRAL',
      eventSha256: 'd'.repeat(64), occurredAt: '2026-09-04T10:02:00.000Z',
    });
  }
  const version = timeline.length || 1;
  const value = {
    id: RUN_ID,
    contractVersion: PAYROLL_MONTHLY_CLOSE_CONTRACT_VERSION,
    period: '2026-08',
    jurisdiction: '42',
    status,
    version,
    sourceSetSha256: 'b'.repeat(64),
    sourceCount: 3,
    mismatchCount: 0,
    blockingIssueCount: 0,
    reasonCode: reason[0],
    reasonReference: reason[1],
    closeApproved: status === 'approved',
    totals: {
      reportedEarningsLessRetentionsCents: '3050',
      reportedBankNetCents: '3050',
      differenceCents: '0',
    },
    sources: detailed ? prepared.sources : [],
    reconciliation: detailed ? prepared.reconciliation : null,
    blockingIssues: [],
    createdAt: '2026-09-04T10:00:00.000Z',
    updatedAt: '2026-09-04T10:00:00.000Z',
    submittedAt: status === 'prepared' ? null : '2026-09-04T10:01:00.000Z',
    decidedAt: ['approved', 'rejected', 'cancelled'].includes(status)
      ? '2026-09-04T10:02:00.000Z' : null,
    timeline,
  };
  if (allowedCommands !== undefined) value.allowedCommands = allowedCommands;
  return value;
}

function envelope(status = 'prepared') {
  const valueRun = run(status);
  const receipt = valueRun.timeline.at(-1);
  return {
    replayed: false,
    eventId: receipt.id,
    eventSha256: receipt.eventSha256,
    run: valueRun,
    flags: flags(status === 'approved'),
  };
}

function bootstrapEnvelope() {
  return {
    principal: {
      tenantId: TENANT_ID,
      membershipId: MEMBERSHIP_ID,
      certifiedBindingId: BINDING_ID,
      roleKey: 'PLATFORM_OWNER_OPERATIVO_INTEGRAL',
      employmentLinked: true,
      capabilities: [
        'payroll.monthly_close.audit.read',
        'payroll.monthly_close.prepare',
        'payroll.monthly_close.read',
      ],
    },
    limits: {
      contractVersion: PAYROLL_MONTHLY_CLOSE_CONTRACT_VERSION,
      sourceContracts: Object.entries({
        'grh-concept-statistics.v1': 'grh_observed',
        'bank-accreditation-summary.v1': 'bank_control',
        'government-payroll-summary.v1': 'government_control',
      }).map(([definitionKey, sourceKind]) => ({ definitionKey, sourceKind })),
      maxSourceBytes: 262144,
      sourceCount: 3,
      jurisdictions: ['42', '55'],
      toleranceCents: '0',
    },
    runs: [run('prepared', { detailed: false })],
    recentEvents: [],
    flags: flags(),
  };
}

test('prepara tres fuentes y sólo conserva agregados, huellas y centavos', () => {
  const prepared = draft();
  assert.equal(prepared.contractVersion, 'payroll-monthly-close-run.v1');
  assert.equal(prepared.sourceCount, 3);
  assert.equal(prepared.readyForReview, true);
  assert.equal(prepared.reconciliation.governmentSummaryCompared, true);
  assert.equal(prepared.reconciliation.governmentComparisons.every((item) => item.matches), true);
  assert.match(prepared.sourceSetSha256, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(prepared), /contentBase64|filename|originalName|dni|cuil|cbu/i);
  assert.equal(prepared.rawContentStored, false);
  assert.equal(prepared.payrollPosted, false);
  assert.equal(prepared.closeApproved, false);
});

test('una diferencia gubernamental de un centavo queda bloqueada', () => {
  const prepared = draft({ governmentContributionDifference: 1 });
  assert.equal(prepared.readyForReview, false);
  assert.equal(prepared.reconciliation.governmentComparisons[1].differenceCents, '1');
  assert.equal(prepared.reconciliation.governmentComparisons[1].matches, false);
  assert.equal(prepared.blockingIssues.at(-1).code,
    'MONTHLY_CLOSE_GOVERNMENT_CONTRIBUTIONS_MISMATCH');
});

test('draft y transición son cerrados; toda decisión exige versión y referencia opaca', () => {
  assert.throws(() => normalizePayrollMonthlyCloseDraft({
    period: '2026-08', jurisdiction: '42', sources: sources(), employeeId: '571',
  }, context()), (error) => error.code === 'PAYROLL_MONTHLY_CLOSE_DRAFT_INVALID');
  const transition = normalizePayrollMonthlyCloseTransition('approve', {
    runId: RUN_ID, expectedVersion: 2,
    reasonCode: 'approved_by_checker', reasonReference: REFERENCE,
  });
  assert.equal(transition.expectedVersion, 2);
  assert.throws(() => normalizePayrollMonthlyCloseTransition('approve', {
    runId: RUN_ID, expectedVersion: 2,
    reasonCode: 'approved', reasonReference: REFERENCE,
  }), (error) => error.code === 'PAYROLL_MONTHLY_CLOSE_REASON_INVALID');
  assert.throws(() => normalizePayrollMonthlyCloseTransition('submit', {
    runId: RUN_ID, expectedVersion: 1,
    reasonCode: 'ready_for_review', reasonReference: '',
  }), (error) => error.code === 'PAYROLL_MONTHLY_CLOSE_REASON_REFERENCE_REQUIRED');
});

test('idempotencia sólo admite UUID v4', () => {
  assert.equal(normalizePayrollMonthlyCloseIdempotencyKey(IDEMPOTENCY), IDEMPOTENCY);
  assert.throws(
    () => normalizePayrollMonthlyCloseIdempotencyKey('11111111-1111-1111-8111-111111111111'),
    (error) => error.code === 'PAYROLL_MONTHLY_CLOSE_IDEMPOTENCY_KEY_INVALID',
  );
});

test('persistencia envía contexto, binding y agregados sin bytes ni nombres', async () => {
  const calls = [];
  const sql = { async query(statement, values) {
    calls.push({ statement, values });
    return [{ result: envelope() }];
  } };
  await persistPayrollMonthlyCloseRun(
    sql, principal(), session(), draft(), IDEMPOTENCY, BINDING_ID,
  );
  assert.match(calls[0].statement, /payroll_monthly_close_prepare_v1/);
  assert.equal(calls[0].values[1], BINDING_ID);
  assert.equal(calls[0].values[2], '2026-08-01');
  assert.equal(calls[0].values[3], '42');
  assert.match(calls[0].values[4], /^[a-f0-9]{64}$/);
  assert.doesNotMatch(calls[0].values.slice(5, 8).join(' '),
    /contentBase64|filename|originalName|dni|cuil|cbu/i);
  assert.match(calls[0].values[9], /^[a-f0-9]{64}$/);
});

test('persistencia rechaza un agregado o source-set alterado antes de tocar SQL', async () => {
  let calls = 0;
  const sql = { async query() { calls += 1; return []; } };
  const forgedRow = structuredClone(draft());
  forgedRow.sources[0].recordCount += 1;
  await assert.rejects(
    persistPayrollMonthlyCloseRun(
      sql, principal(), session(), forgedRow, IDEMPOTENCY, BINDING_ID,
    ),
    (error) => error.code === 'PAYROLL_MONTHLY_CLOSE_CONTRACT_DRIFT',
  );
  const forgedSet = structuredClone(draft());
  forgedSet.sourceSetSha256 = 'f'.repeat(64);
  await assert.rejects(
    persistPayrollMonthlyCloseRun(
      sql, principal(), session(), forgedSet, IDEMPOTENCY, BINDING_ID,
    ),
    (error) => error.code === 'PAYROLL_MONTHLY_CLOSE_CONTRACT_DRIFT',
  );
  assert.equal(calls, 0);
});

test('transition transmite versión, motivo e idempotencia sin ampliar efectos', async () => {
  const calls = [];
  const sql = { async query(statement, values) {
    calls.push({ statement, values });
    return [{ result: envelope('approved') }];
  } };
  const result = await transitionPayrollMonthlyCloseRun(
    sql, principal(), session(), 'approve', {
      runId: RUN_ID, expectedVersion: 2,
      reasonCode: 'approved_by_checker', reasonReference: REFERENCE,
    }, IDEMPOTENCY, BINDING_ID,
  );
  assert.equal(result.run.closeApproved, true);
  assert.equal(result.flags.payrollPosted, false);
  assert.match(calls[0].statement, /payroll_monthly_close_transition_v1/);
  assert.equal(calls[0].values[3], 2);
  assert.equal(calls[0].values[4], 'approved_by_checker');
});

test('lookup de intento exige actor, key y comando y acepta replay tardío coherente', async () => {
  const calls = [];
  const lateReplay = envelope('approved');
  lateReplay.replayed = true;
  lateReplay.eventId = 1;
  lateReplay.eventSha256 = 'a'.repeat(64);
  const sql = { async query(statement, values) {
    calls.push({ statement, values });
    return [{ result: lateReplay }];
  } };
  const result = await readPayrollMonthlyCloseAttempt(
    sql, principal(), session(), IDEMPOTENCY, 'prepare',
  );
  assert.equal(result.replayed, true);
  assert.equal(result.eventId, 1);
  assert.equal(result.run.status, 'approved');
  assert.equal(result.run.closeApproved, true);
  assert.equal(result.flags.closeApproved, true);
  assert.match(calls[0].statement, /payroll_monthly_close_attempt_v1/);
  assert.equal(calls[0].values[1], IDEMPOTENCY);
  assert.equal(calls[0].values[2], 'prepare');

  await assert.rejects(
    readPayrollMonthlyCloseAttempt(sql, principal(), session(), IDEMPOTENCY, 'other'),
    (error) => error.code === 'PAYROLL_MONTHLY_CLOSE_ATTEMPT_COMMAND_INVALID',
  );
  const notFound = { async query() {
    throw new Error('PAYROLL_MONTHLY_CLOSE_ATTEMPT_NOT_FOUND hidden row');
  } };
  await assert.rejects(
    readPayrollMonthlyCloseAttempt(notFound, principal(), session(), IDEMPOTENCY, 'submit'),
    (error) => error.code === 'PAYROLL_MONTHLY_CLOSE_ATTEMPT_NOT_FOUND'
      && error.status === 404 && !/hidden row/.test(error.message),
  );
  const stale = { async query() {
    throw new Error('PAYROLL_MONTHLY_CLOSE_ATTEMPT_CONTEXT_CHANGED internal actor');
  } };
  await assert.rejects(
    readPayrollMonthlyCloseAttempt(stale, principal(), session(), IDEMPOTENCY, 'approve'),
    (error) => error.code === 'PAYROLL_MONTHLY_CLOSE_ATTEMPT_CONTEXT_CHANGED'
      && error.status === 409 && !/internal actor/.test(error.message),
  );
});

test('fachadas rechazan flags o runs que inventan efectos', async () => {
  const unsafe = { async query() {
    return [{ result: { flags: { ...flags(), payrollPosted: true } } }];
  } };
  await assert.rejects(
    getPayrollMonthlyCloseBootstrap(unsafe, principal(), session()),
    (error) => error.code === 'PAYROLL_MONTHLY_CLOSE_CONTRACT_DRIFT',
  );
  const inconsistent = { async query() {
    return [{ result: {
      run: { ...run('approved'), closeApproved: false }, flags: flags(false),
    } }];
  } };
  await assert.rejects(
    transitionPayrollMonthlyCloseRun(inconsistent, principal(), session(), 'approve', {
      runId: RUN_ID, expectedVersion: 2,
      reasonCode: 'approved_by_checker', reasonReference: REFERENCE,
    }, IDEMPOTENCY, BINDING_ID),
    (error) => error.code === 'PAYROLL_MONTHLY_CLOSE_CONTRACT_DRIFT',
  );
});

test('fachadas exigen envelopes completos y rechazan run nulo o escalar', async () => {
  const validBootstrap = { async query() {
    return [{ result: bootstrapEnvelope() }];
  } };
  const result = await getPayrollMonthlyCloseBootstrap(
    validBootstrap, principal(), session(),
  );
  assert.equal(result.runs.length, 1);

  const validDetail = { async query() {
    return [{ result: {
      run: run('prepared', { allowedCommands: ['submit', 'cancel'] }),
      flags: flags(),
    } }];
  } };
  const detail = await readPayrollMonthlyCloseRun(
    validDetail, principal(), session(), RUN_ID,
  );
  assert.equal(detail.run.timeline[0].expectedVersion, 0);

  const invalidBootstrap = { async query() {
    return [{ result: { ...bootstrapEnvelope(), runs: ['bad'] } }];
  } };
  await assert.rejects(
    getPayrollMonthlyCloseBootstrap(invalidBootstrap, principal(), session()),
    (error) => error.code === 'PAYROLL_MONTHLY_CLOSE_CONTRACT_DRIFT',
  );

  const invalidList = { async query() {
    return [{ result: { runs: [false], total: 1, page: 1, limit: 20, flags: flags() } }];
  } };
  await assert.rejects(
    listPayrollMonthlyCloseRuns(invalidList, principal(), session()),
    (error) => error.code === 'PAYROLL_MONTHLY_CLOSE_CONTRACT_DRIFT',
  );

  const invalidDetail = { async query() {
    return [{ result: { run: null, flags: flags() } }];
  } };
  await assert.rejects(
    readPayrollMonthlyCloseRun(invalidDetail, principal(), session(), RUN_ID),
    (error) => error.code === 'PAYROLL_MONTHLY_CLOSE_CONTRACT_DRIFT',
  );

  const invalidTransitionVersion = run('submitted', { allowedCommands: ['cancel'] });
  invalidTransitionVersion.timeline[1] = {
    ...invalidTransitionVersion.timeline[1], expectedVersion: 0, resultingVersion: 1,
  };
  const invalidTimeline = { async query() {
    return [{ result: { run: invalidTransitionVersion, flags: flags() } }];
  } };
  await assert.rejects(
    readPayrollMonthlyCloseRun(invalidTimeline, principal(), session(), RUN_ID),
    (error) => error.code === 'PAYROLL_MONTHLY_CLOSE_CONTRACT_DRIFT',
  );
});

test('fachadas rechazan deriva profunda en filas, issues y comparaciones', async () => {
  async function expectDrift(mutate) {
    const value = structuredClone(envelope());
    mutate(value);
    const sql = { async query() { return [{ result: value }]; } };
    await assert.rejects(
      persistPayrollMonthlyCloseRun(
        sql, principal(), session(), draft(), IDEMPOTENCY, BINDING_ID,
      ),
      (error) => error.code === 'PAYROLL_MONTHLY_CLOSE_CONTRACT_DRIFT',
    );
  }
  await expectDrift((value) => {
    const source = value.run.sources.find(
      (item) => item.definitionKey === 'grh-concept-statistics.v1',
    );
    source.aggregates.rows[0].haberesRemunerativosCents = '9999999999999999999';
  });
  await expectDrift((value) => {
    const source = value.run.sources.find(
      (item) => item.definitionKey === 'government-payroll-summary.v1',
    );
    source.aggregates.readiness.blockingIssues.push({
      code: 'MONTHLY_CLOSE_METRIC_NOT_INFORMED', metric: 'art',
    });
  });
  await expectDrift((value) => {
    value.run.reconciliation.comparisons[0].matches = false;
  });
  await expectDrift((value) => {
    value.run.blockingIssues.push({
      definitionKey: 'monthly-close-net-reconciliation.v1',
      code: 'MONTHLY_CLOSE_REPARTITION_NET_MISMATCH', repartitionCode: '1',
    });
  });
  await expectDrift((value) => {
    value.eventSha256 = 'f'.repeat(64);
  });
  const wrongCommandReceipt = { async query() {
    return [{ result: envelope('submitted') }];
  } };
  await assert.rejects(
    persistPayrollMonthlyCloseRun(
      wrongCommandReceipt, principal(), session(), draft(), IDEMPOTENCY, BINDING_ID,
    ),
    (error) => error.code === 'PAYROLL_MONTHLY_CLOSE_CONTRACT_DRIFT',
  );
});

test('lista valida filtros y mapea conflictos sin filtrar detalle SQL', async () => {
  await assert.rejects(
    listPayrollMonthlyCloseRuns({ query: async () => [] }, principal(), session(), {
      status: 'unknown', page: 1, limit: 20,
    }),
    (error) => error.code === 'PAYROLL_MONTHLY_CLOSE_LIST_INVALID',
  );
  const oneCent = { async query() {
    throw new Error('PAYROLL_MONTHLY_CLOSE_DIFFERENCE_BLOCKS_APPROVAL internal payload');
  } };
  await assert.rejects(
    transitionPayrollMonthlyCloseRun(oneCent, principal(), session(), 'approve', {
      runId: RUN_ID, expectedVersion: 2,
      reasonCode: 'approved_by_checker', reasonReference: REFERENCE,
    }, IDEMPOTENCY, BINDING_ID),
    (error) => error.code === 'PAYROLL_MONTHLY_CLOSE_DIFFERENCE_BLOCKS_APPROVAL'
      && error.status === 409
      && !/internal payload/.test(error.message),
  );
});

test('hash de comando queda ligado al binding certificado actual', async () => {
  const hashes = [];
  const sql = { async query(_statement, values) {
    hashes.push(values.at(-1));
    return [{ result: envelope('submitted') }];
  } };
  const transition = {
    runId: RUN_ID, expectedVersion: 1,
    reasonCode: 'ready_for_review', reasonReference: REFERENCE,
  };
  await transitionPayrollMonthlyCloseRun(
    sql, principal(), session(), 'submit', transition, IDEMPOTENCY, BINDING_ID,
  );
  await transitionPayrollMonthlyCloseRun(
    sql, principal(), session(), 'submit', transition, IDEMPOTENCY,
    '99999999-9999-4999-8999-999999999999',
  );
  assert.match(hashes[0], /^[a-f0-9]{64}$/);
  assert.notEqual(hashes[0], hashes[1]);
});
