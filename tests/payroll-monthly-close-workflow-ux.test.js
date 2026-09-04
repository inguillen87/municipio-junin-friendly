import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  PAYROLL_MONTHLY_CLOSE_API,
  PAYROLL_MONTHLY_CLOSE_CONTRACT,
  PAYROLL_MONTHLY_CLOSE_MAX_BYTES,
  buildPayrollMonthlyCloseMutation,
  buildPayrollMonthlyClosePrepareMutation,
  buildPayrollMonthlyCloseTransitionAttempt,
  createPayrollMonthlyCloseAttemptManager,
  describePayrollMonthlyCloseReconciliation,
  formatPayrollMonthlyCloseAmount,
  readMonthlyCloseAggregateFile,
  resolvePayrollMonthlyCloseAttemptLookup,
  validatePayrollMonthlyCloseBootstrap,
  validatePayrollMonthlyCloseDetail,
  validatePayrollMonthlyCloseList,
  validatePayrollMonthlyCloseMutationEnvelope,
} from '../assets/payroll-monthly-close-workflow.js';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const RUN_ID = '10000000-0000-4000-8000-000000000001';

function flags(closeApproved = false) {
  return {
    includesPersonalRecords: false,
    rawContentStored: false,
    grhMutation: false,
    payrollCalculated: false,
    payrollPosted: false,
    bankArtifactGenerated: false,
    governmentArtifactGenerated: false,
    fiscalArtifactGenerated: false,
    closeApproved,
  };
}

function sources() {
  return [
    ['grh-concept-statistics.v1', 'grh_observed'],
    ['bank-accreditation-summary.v1', 'bank_control'],
    ['government-payroll-summary.v1', 'government_control'],
  ].map(([definitionKey, sourceKind], index) => ({
    definitionKey,
    sourceKind,
    recordCount: index + 1,
    byteLength: 100 + index,
    contentHmacSha256: String(index + 1).repeat(64),
  }));
}

function run(overrides = {}) {
  return {
    id: RUN_ID,
    status: 'submitted',
    version: 2,
    period: '2026-08',
    jurisdiction: '42',
    sourceSetSha256: 'a'.repeat(64),
    totals: {
      reportedEarningsLessRetentionsCents: '10000',
      reportedBankNetCents: '10000',
      differenceCents: '0',
    },
    sourceCount: 3,
    mismatchCount: 0,
    blockingIssueCount: 0,
    closeApproved: false,
    ...overrides,
  };
}

function detailedRun(overrides = {}) {
  return run({
    sources: sources(),
    reconciliation: {
      comparisons: [{
        repartitionCode: '1',
        reportedEarningsLessRetentionsCents: '10000',
        reportedBankNetCents: '10000',
        differenceCents: '0',
        matches: true,
        issueCodes: [],
      }],
      governmentComparisons: [
        {
          comparisonKey: 'earnings',
          reportedGrhCents: '12500',
          reportedGovernmentCents: '12500',
          differenceCents: '0',
          matches: true,
          issueCode: null,
        },
        {
          comparisonKey: 'employer_contributions',
          reportedGrhCents: '3500',
          reportedGovernmentCents: '3500',
          differenceCents: '0',
          matches: true,
          issueCode: null,
        },
      ],
    },
    allowedCommands: ['approve', 'reject'],
    timeline: [],
    ...overrides,
  });
}

function bootstrap(overrides = {}) {
  return {
    ok: true,
    data: {
      principal: {
        tenantId: '20000000-0000-4000-8000-000000000002',
        membershipId: '30000000-0000-4000-8000-000000000003',
        certifiedBindingId: '40000000-0000-4000-8000-000000000004',
        roleKey: 'HUGO_APROBADOR_INTEGRAL',
        employmentLinked: true,
        capabilities: ['payroll.monthly_close.read', 'payroll.monthly_close.approve'],
      },
      limits: {
        contractVersion: PAYROLL_MONTHLY_CLOSE_CONTRACT,
        maxSourceBytes: PAYROLL_MONTHLY_CLOSE_MAX_BYTES,
        sourceContracts: Object.keys(Object.fromEntries(sources().map((source) => [source.definitionKey, {}]))),
        jurisdictions: ['42', '55'],
      },
      runs: [run()],
      recentEvents: [],
      flags: flags(),
      ...overrides,
    },
  };
}

test('valida bootstrap, lista y detalle con flags cerrados y comandos del servidor', () => {
  assert.equal(validatePayrollMonthlyCloseBootstrap(bootstrap()), true);
  assert.equal(validatePayrollMonthlyCloseList({
    ok: true,
    data: { runs: [run()], page: 1, limit: 20, total: 1, flags: flags() },
  }), true);
  assert.equal(validatePayrollMonthlyCloseDetail({
    ok: true,
    data: { run: detailedRun(), flags: flags() },
  }), true);

  assert.equal(validatePayrollMonthlyCloseBootstrap(bootstrap({
    principal: { ...bootstrap().data.principal, capabilities: ['payroll.monthly_close.read', 'payroll.monthly_close.post'] },
  })), false);
  assert.equal(validatePayrollMonthlyCloseDetail({
    ok: true,
    data: { run: detailedRun({ allowedCommands: ['post_to_grh'] }), flags: flags() },
  }), false);
  assert.equal(validatePayrollMonthlyCloseDetail({
    ok: true,
    data: { run: detailedRun(), flags: { ...flags(), payrollCalculated: true } },
  }), false);
  assert.equal(validatePayrollMonthlyCloseDetail({
    ok: true,
    data: { run: detailedRun({ status: 'approved', closeApproved: true }), flags: flags(false) },
  }), false);
});

test('construye preparación con tres contratos agregados y transiciones con versión', () => {
  const aggregateSources = sources().map(({ definitionKey, sourceKind }, index) => ({
    definitionKey, sourceKind, contentBase64: `Y29udGVuaWRv${index}`,
  }));
  assert.deepEqual(buildPayrollMonthlyClosePrepareMutation({
    period: '2026-08', jurisdiction: '42', sources: aggregateSources,
  }), {
    command: 'prepare',
    payload: { period: '2026-08', jurisdiction: '42', sources: aggregateSources },
  });
  assert.equal(buildPayrollMonthlyClosePrepareMutation({
    period: '2026-08', jurisdiction: '42', sources: aggregateSources.slice(0, 2),
  }), null);
  assert.deepEqual(buildPayrollMonthlyCloseMutation('approve', {
    runId: RUN_ID,
    expectedVersion: 2,
    reasonCode: 'approved_by_checker',
    reasonReference: 'ref:50000000-0000-4000-8000-000000000005',
  }), {
    command: 'approve',
    payload: {
      runId: RUN_ID,
      expectedVersion: 2,
      reasonCode: 'approved_by_checker',
      reasonReference: 'ref:50000000-0000-4000-8000-000000000005',
    },
  });
  assert.equal(buildPayrollMonthlyCloseMutation('approve', {
    runId: RUN_ID,
    expectedVersion: 2,
    reasonCode: 'approved_by_checker',
    reasonReference: null,
  }), null);
});

test('FileReader convierte sólo el contenido agregado y no necesita nombre de archivo', async () => {
  class Reader {
    readAsArrayBuffer(file) {
      this.result = file.bytes.buffer;
      this.onload();
    }
  }
  const encoded = await readMonthlyCloseAggregateFile({
    size: 3,
    bytes: Uint8Array.from([65, 66, 67]),
  }, Reader);
  assert.equal(encoded, 'QUJD');
  await assert.rejects(
    readMonthlyCloseAggregateFile({ size: PAYROLL_MONTHLY_CLOSE_MAX_BYTES + 1 }, Reader),
    /256 KiB/,
  );
});

test('preparación conserva payload y clave tras commit con corte de red y reintento', async () => {
  const idempotencyKey = '60000000-0000-4000-8000-000000000006';
  let generatedKeys = 0;
  const attempts = createPayrollMonthlyCloseAttemptManager({
    cryptoImpl: { randomUUID: () => { generatedKeys += 1; return idempotencyKey; } },
  });
  const aggregateSources = sources().map(({ definitionKey, sourceKind }, index) => ({
    definitionKey, sourceKind, contentBase64: `Y29udGVuaWRv${index}`,
  }));
  const mutation = buildPayrollMonthlyClosePrepareMutation({
    period: '2026-08', jurisdiction: '42', sources: aggregateSources,
  });
  const metadata = {
    kind: 'prepare', period: '2026-08', jurisdiction: '42', baselineRunIds: [],
  };
  const sent = [];
  let committed = false;
  const send = async (stableMutation, stableKey) => {
    sent.push({ mutation: stableMutation, key: stableKey });
    if (!committed) {
      committed = true;
      throw new TypeError('socket closed after commit');
    }
    return {
      ok: true,
      replayed: true,
      data: { run: detailedRun({ status: 'prepared', version: 1 }), flags: flags() },
    };
  };

  await assert.rejects(
    attempts.execute({
      mutation,
      metadata,
      send,
      reconcile: async (pending) => resolvePayrollMonthlyCloseAttemptLookup({
        attempt: pending,
        errorCode: 'PAYROLL_MONTHLY_CLOSE_ATTEMPT_NOT_FOUND',
      }),
    }),
    /misma operación y la misma clave/,
  );
  assert.equal(attempts.getPending().phase, 'retry');
  assert.equal(attempts.getPending().idempotencyKey, idempotencyKey);
  await assert.rejects(
    attempts.execute({
      mutation: { ...mutation, payload: { ...mutation.payload, period: '2026-09' } },
      metadata: { ...metadata, period: '2026-09' },
      send,
      reconcile: async () => ({ outcome: 'unchanged' }),
    }),
    /operación anterior sin confirmación definitiva/,
  );
  assert.equal(sent.length, 1);

  const result = await attempts.execute({
    mutation: structuredClone(mutation),
    metadata: structuredClone(metadata),
    send,
    reconcile: async () => assert.fail('el replay definitivo no requiere otra conciliación'),
  });
  assert.equal(result.result.replayed, true);
  assert.equal(attempts.getPending(), null);
  assert.equal(generatedKeys, 1);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0].mutation, sent[1].mutation);
  assert.equal(sent[0].key, sent[1].key);
});

test('transición conserva reasonReference, payload y clave tras commit con corte de red', async () => {
  const generated = [
    '70000000-0000-4000-8000-000000000007',
    '80000000-0000-4000-8000-000000000008',
  ];
  let generatedKeys = 0;
  const cryptoImpl = {
    randomUUID: () => {
      const value = generated[generatedKeys];
      generatedKeys += 1;
      return value;
    },
  };
  const attempts = createPayrollMonthlyCloseAttemptManager({ cryptoImpl });
  const submitted = detailedRun({ status: 'submitted', version: 2, allowedCommands: ['approve', 'reject'] });
  const firstAttempt = buildPayrollMonthlyCloseTransitionAttempt({
    command: 'approve',
    run: submitted,
    reasonCode: 'approved_by_checker',
    attemptManager: attempts,
    cryptoImpl,
  });
  const sent = [];
  let committed = false;
  const send = async (stableMutation, stableKey) => {
    sent.push({ mutation: stableMutation, key: stableKey });
    if (!committed) {
      committed = true;
      throw new TypeError('socket closed after commit');
    }
    return {
      ok: true,
      replayed: true,
      data: {
        run: detailedRun({ status: 'approved', version: 3, closeApproved: true, allowedCommands: [] }),
        flags: flags(true),
      },
    };
  };

  await assert.rejects(
    attempts.execute({
      ...firstAttempt,
      send,
      reconcile: async (pending) => resolvePayrollMonthlyCloseAttemptLookup({
        attempt: pending,
        errorCode: 'PAYROLL_MONTHLY_CLOSE_ATTEMPT_NOT_FOUND',
      }),
    }),
    /misma operación y la misma clave/,
  );
  const retryAttempt = buildPayrollMonthlyCloseTransitionAttempt({
    command: 'approve',
    run: submitted,
    reasonCode: 'approved_by_checker',
    attemptManager: attempts,
    cryptoImpl,
  });
  assert.equal(
    retryAttempt.mutation.payload.reasonReference,
    firstAttempt.mutation.payload.reasonReference,
  );
  const result = await attempts.execute({
    ...retryAttempt,
    send,
    reconcile: async () => assert.fail('el replay definitivo no requiere otra conciliación'),
  });
  assert.equal(result.result.replayed, true);
  assert.equal(generatedKeys, 2);
  assert.deepEqual(sent[0].mutation, sent[1].mutation);
  assert.equal(sent[0].key, sent[1].key);
});

test('lookup idempotente confirma sólo el evento propio exacto y nunca una corrida concurrente', () => {
  const aggregateSources = sources().map(({ definitionKey, sourceKind }, index) => ({
    definitionKey, sourceKind, contentBase64: `Y29udGVuaWRv${index}`,
  }));
  const mutation = buildPayrollMonthlyClosePrepareMutation({
    period: '2026-08', jurisdiction: '42', sources: aggregateSources,
  });
  const attempt = {
    mutation,
    metadata: { kind: 'prepare', period: '2026-08', jurisdiction: '42' },
    idempotencyKey: '90000000-0000-4000-8000-000000000009',
  };
  const eventSha256 = 'b'.repeat(64);
  const ownLookup = {
    ok: true,
    replayed: true,
    data: {
      replayed: true,
      eventId: 91,
      eventSha256,
      run: detailedRun({
        status: 'prepared',
        version: 1,
        allowedCommands: undefined,
        timeline: [{
          id: 91,
          command: 'prepare',
          fromStatus: null,
          toStatus: 'prepared',
          expectedVersion: 0,
          resultingVersion: 1,
          reasonCode: 'sources_prepared',
          reasonReference: null,
          actorRoleKey: 'PLATFORM_OWNER_OPERATIVO_INTEGRAL',
          eventSha256,
          occurredAt: '2026-09-04T12:00:00.000Z',
        }],
      }),
      flags: flags(),
    },
  };
  assert.equal(validatePayrollMonthlyCloseMutationEnvelope(ownLookup, true), true);
  assert.equal(resolvePayrollMonthlyCloseAttemptLookup({
    attempt, payload: ownLookup,
  }).outcome, 'committed');

  const competingRunSamePeriod = run({ id: '91000000-0000-4000-8000-000000000091' });
  assert.deepEqual(resolvePayrollMonthlyCloseAttemptLookup({
    attempt,
    payload: null,
    errorCode: 'PAYROLL_MONTHLY_CLOSE_ATTEMPT_NOT_FOUND',
    refreshedRuns: [competingRunSamePeriod],
  }), { outcome: 'unchanged' });
});

test('lookup de transición rechaza estado objetivo si no coincide el evento/version del intento', () => {
  const attempts = createPayrollMonthlyCloseAttemptManager({
    cryptoImpl: { randomUUID: () => 'a0000000-0000-4000-8000-00000000000a' },
  });
  const transition = buildPayrollMonthlyCloseTransitionAttempt({
    command: 'approve',
    run: detailedRun({ status: 'submitted', version: 2 }),
    reasonCode: 'approved_by_checker',
    attemptManager: attempts,
    cryptoImpl: { randomUUID: () => 'b0000000-0000-4000-8000-00000000000b' },
  });
  const eventSha256 = 'c'.repeat(64);
  const otherDecision = {
    ok: true,
    replayed: true,
    data: {
      replayed: true,
      eventId: 92,
      eventSha256,
      run: detailedRun({
        status: 'approved',
        version: 3,
        closeApproved: true,
        allowedCommands: undefined,
        timeline: [{
          id: 92,
          command: 'approve',
          fromStatus: 'submitted',
          toStatus: 'approved',
          expectedVersion: 1,
          resultingVersion: 2,
          reasonCode: 'approved_by_checker',
          reasonReference: transition.mutation.payload.reasonReference,
          actorRoleKey: 'HUGO_APROBADOR_INTEGRAL',
          eventSha256,
          occurredAt: '2026-09-04T12:00:00.000Z',
        }],
      }),
      flags: flags(true),
    },
  };
  assert.equal(resolvePayrollMonthlyCloseAttemptLookup({
    attempt: { ...transition, idempotencyKey: 'c0000000-0000-4000-8000-00000000000c' },
    payload: otherDecision,
  }).outcome, 'unresolved');
});

test('la verdad visual exige montos, métricas y evidencia sin bloqueos', () => {
  assert.deepEqual(describePayrollMonthlyCloseReconciliation(run({
    mismatchCount: 0, blockingIssueCount: 0,
  })), { label: 'Coincidencia exacta', state: 'matched' });
  assert.deepEqual(describePayrollMonthlyCloseReconciliation(run({
    mismatchCount: 0, blockingIssueCount: 1,
  })), { label: 'Montos coinciden; evidencia incompleta', state: 'blocked' });
  assert.deepEqual(describePayrollMonthlyCloseReconciliation(run({
    totals: { ...run().totals, differenceCents: '1' }, mismatchCount: 1, blockingIssueCount: 1,
  })), { label: 'Bloqueado por diferencias', state: 'blocked' });
});

test('presenta circuito maker-checker, conciliación exacta y límites operativos explícitos', () => {
  const html = read('nomina-control.html');
  const source = read('assets/payroll-monthly-close-workflow.js');
  const build = read('scripts/build-friendly.mjs');

  assert.match(html, /data-payroll-monthly-close-workflow/);
  assert.match(html, /Marcelo u otro preparador autorizado carga tres contratos agregados/);
  assert.match(html, /Hugo u otra identidad aprobadora puede aprobar o rechazar/);
  assert.match(html, /Admin puede revisar/);
  assert.match(html, /No liquidó sueldos/);
  assert.match(html, /No realizó pagos/);
  assert.match(html, /No generó presentación fiscal/);
  assert.match(html, /No transmitió a GRH, banco ni organismo/);
  assert.match(html, /data-monthly-workflow-reconciliation/);
  assert.match(html, /data-monthly-workflow-government-reconciliation/);
  assert.match(html, /Un centavo de diferencia bloquea la aprobación/);
  assert.match(html, /data-monthly-workflow-actions/);
  assert.match(html, /data-monthly-workflow-approved-proof/);
  assert.match(html, /data-monthly-workflow-approved-proof-download/);
  assert.match(html, /Descargar copia local/);
  assert.match(html, /no posee firma digital y no es un comprobante verificable/);
  assert.match(html, /No es recibo de sueldo, orden de pago, archivo bancario, F\.931\/LSD ni constancia fiscal/);
  assert.equal((html.match(/assets\/payroll-monthly-close-workflow\.js/g) || []).length, 1);
  assert.equal((html.match(/assets\/payroll-monthly-close-approved-report\.js/g) || []).length, 0);
  assert.match(build, /'assets\/payroll-monthly-close-approved-report\.js'/);
  assert.match(build, /'assets\/payroll-monthly-close-workflow\.js'/);
  assert.match(source, new RegExp(PAYROLL_MONTHLY_CLOSE_API.replaceAll('/', '\\/')));
  assert.match(source, /run\.allowedCommands\.forEach/);
  assert.match(source, /createPayrollMonthlyCloseAttemptManager/);
  assert.match(source, /reconcileAttemptByKey/);
  assert.match(source, /resource=attempt/);
  assert.match(source, /'X-MuniControl-Command'/);
  assert.match(source, /isPayrollMonthlyCloseApprovedProofReady/);
  assert.match(source, /createPayrollMonthlyCloseApprovedPdf/);
  assert.match(source, /downloadPayrollMonthlyCloseApprovedProof/);
  assert.doesNotMatch(source, /baselineRunIds/);
  assert.doesNotMatch(source, /'Idempotency-Key': cryptoImpl\.randomUUID/);
  assert.match(source, /new FileReaderImpl\(\)/);
  assert.match(source, /reader\.readAsArrayBuffer\(file\)/);
  assert.doesNotMatch(source, /file\.name|localStorage|sessionStorage|console\./);
  assert.equal(formatPayrollMonthlyCloseAmount('10000'), '$ 100,00');
});
