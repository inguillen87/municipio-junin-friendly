import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  PAYROLL_REPROCESSING_API,
  PAYROLL_REPROCESSING_CONTRACT,
  buildPayrollReprocessingMutation,
  validatePayrollReprocessingBootstrap,
  validatePayrollReprocessingCase,
  validatePayrollReprocessingDetail,
  validatePayrollReprocessingList,
} from '../assets/payroll-reprocessing-workflow.js';

const HTML_URL = new URL('../nomina-control.html', import.meta.url);
const SOURCE_URL = new URL('../assets/payroll-reprocessing-workflow.js', import.meta.url);
const DATA_API_URL = new URL('../api/internal-data.js', import.meta.url);
const BUILD_URL = new URL('../scripts/build-friendly.mjs', import.meta.url);
const SERVICE_WORKER_URL = new URL('../sw.js', import.meta.url);
const CASE_ID = '10000000-0000-4000-8000-000000000001';
const RUN_ID = '20000000-0000-4000-8000-000000000002';
const REFERENCE = 'ref:30000000-0000-4000-8000-000000000003';

function safeFlags() {
  return {
    approvalEffect: 'external_execution_authorization_only',
    grhMutation: false,
    payrollVoided: false,
    payrollCalculated: false,
    payrollPosted: false,
  };
}

function caseFixture(overrides = {}) {
  return {
    id: CASE_ID,
    contractVersion: PAYROLL_REPROCESSING_CONTRACT,
    requestKind: 'reliquidate',
    status: 'draft',
    version: 1,
    businessReasonCode: 'source_correction',
    businessReasonReference: REFERENCE,
    decisionReasonCode: null,
    decisionReasonReference: null,
    executionAuthorized: false,
    ...safeFlags(),
    createdAt: '2026-09-03T20:00:00.000Z',
    updatedAt: '2026-09-03T20:00:00.000Z',
    target: {
      payrollRunId: RUN_ID,
      runSha256: 'a'.repeat(64),
      payrollDate: '2026-07-31',
      sourcePeriod: '202607',
      sourceMonth: '07',
      payrollType: 'M',
      closureStatus: 'closed',
      sourceSystem: 'GRH',
    },
    timeline: [],
    ...overrides,
  };
}

test('nómina expone y publica un circuito privado con el límite operativo explícito', async () => {
  const [html, source, dataApi, build, serviceWorker] = await Promise.all([
    readFile(HTML_URL, 'utf8'), readFile(SOURCE_URL, 'utf8'), readFile(DATA_API_URL, 'utf8'),
    readFile(BUILD_URL, 'utf8'), readFile(SERVICE_WORKER_URL, 'utf8'),
  ]);

  assert.match(html, /data-payroll-reprocessing-workflow/);
  assert.match(html, /Gestionar correcciones de corridas con doble control/);
  assert.match(html, /data-reprocessing-prepare-form/);
  assert.match(html, /data-reprocessing-cases/);
  assert.match(html, /data-reprocessing-timeline/);
  assert.match(html, /data-reprocessing-idempotency/);
  assert.match(html, /Identificador de correlación/);
  assert.match(html, /data-reprocessing-copy-prepare-reference/);
  assert.match(html, /data-reprocessing-copy-action-reference/);
  assert.match(html, /No demuestra que exista evidencia ni crea un vínculo automático/);
  assert.match(html, /data-reprocessing-confirm-summary/);
  assert.match(html, /data-reprocessing-confirm-cancel/);
  assert.match(html, /data-reprocessing-confirm-action/);
  assert.match(html, /Autorizar.*ejecución externa/si);
  assert.match(html, /No anula una corrida, no recalcula haberes, no liquida, no contabiliza, no publica y no modifica GRH/);
  assert.match(html, /assets\/payroll-reprocessing-workflow\.js/);
  assert.match(build, /'assets\/payroll-reprocessing-workflow\.js'/);
  assert.doesNotMatch(serviceWorker, /payroll-reprocessing-workflow/);
  assert.match(dataApi, /payroll_run_id AS "payrollRunId"/);
  assert.match(source, new RegExp(PAYROLL_REPROCESSING_API.replaceAll('/', '\\/')));
  assert.match(source, /credentials: 'same-origin'/);
  assert.match(source, /'Idempotency-Key': idempotencyKey/);
  assert.match(source, /state\.attempts\.get\(signature\)/);
  assert.match(source, /validatePayrollReprocessingCase\(result\.data\)/);
  assert.match(source, /const allowed = detail\.allowedCommands/);
  assert.match(source, /allowed\.forEach\(\(command\)/);
  assert.match(source, /nodes\.actions\.replaceChildren\(\)/);
  assert.match(source, /function clearDetail\(selectedId = null\)/);
  assert.match(source, /clearDetail\(\);\s*setStatus\(error instanceof Error/s);
  assert.match(source, /function shortRunId\(value\)/);
  assert.match(source, /corrida \$\{shortRunId\(item\.target\.payrollRunId\)\} · huella/);
  assert.match(source, /clipboardImpl\.writeText\(value\)/);
  assert.match(source, /button\.addEventListener\('click', \(\) => requestTransition\(command\)\)/);
  assert.match(source, /pending\.payload\.expectedVersion !== detail\.version/);
  assert.match(source, /el servidor impide decidir expedientes propios/i);
  assert.match(source, /resultado idempotente recuperado sin duplicar la operación/);
});

test('bootstrap admite owner integral y mantiene maker-checker por allowedCommands del expediente', () => {
  const bootstrap = {
    ok: true,
    contractVersion: PAYROLL_REPROCESSING_CONTRACT,
    approvalEffect: 'external_execution_authorization_only',
    feature: {
      canPrepare: true,
      canApprove: false,
      grhMutation: false,
      payrollVoided: false,
      payrollCalculated: false,
      payrollPosted: false,
    },
    counts: { draft: 1, submitted: 2, approved: 3, rejected: 4, cancelled: 5 },
    requestKinds: ['void', 'reliquidate'],
    businessReasonCodes: [
      'duplicate_run', 'incorrect_personnel', 'incorrect_concept', 'incorrect_amount',
      'source_correction', 'legal_adjustment', 'other_controlled',
    ],
  };

  assert.equal(validatePayrollReprocessingBootstrap(bootstrap), true);
  assert.equal(validatePayrollReprocessingBootstrap({
    ...bootstrap, feature: { ...bootstrap.feature, canApprove: true },
  }), true);
  assert.equal(validatePayrollReprocessingBootstrap({
    ...bootstrap, feature: { ...bootstrap.feature, grhMutation: true },
  }), false);
});

test('lista y detalle aceptan sólo corridas GRH cerradas, versiones y comandos permitidos', () => {
  const item = caseFixture();
  const list = {
    ok: true,
    ...safeFlags(),
    data: { items: [item], total: 1, page: 1, limit: 10 },
  };
  const detail = {
    ok: true,
    ...safeFlags(),
    data: {
      ...item,
      allowedCommands: ['submit', 'cancel'],
      timeline: [{
        command: 'prepare', fromStatus: null, toStatus: 'draft', resultingVersion: 1,
        eventSha256: 'b'.repeat(64), occurredAt: '2026-09-03T20:00:00.000Z',
      }],
    },
  };

  assert.equal(validatePayrollReprocessingCase(item), true);
  assert.equal(validatePayrollReprocessingList(list), true);
  assert.equal(validatePayrollReprocessingDetail(detail), true);
  assert.equal(validatePayrollReprocessingCase({
    ...item, target: { ...item.target, closureStatus: 'open' },
  }), false);
  assert.equal(validatePayrollReprocessingDetail({
    ...detail, data: { ...detail.data, allowedCommands: ['post_to_grh'] },
  }), false);
});

test('mutaciones construyen cuerpo exacto con referencia opaca y control optimista', () => {
  assert.deepEqual(buildPayrollReprocessingMutation('prepare', {
    payrollRunId: RUN_ID,
    requestKind: 'reliquidate',
    reasonCode: 'source_correction',
    reasonReference: REFERENCE,
  }), {
    command: 'prepare',
    payload: {
      payrollRunId: RUN_ID,
      requestKind: 'reliquidate',
      reasonCode: 'source_correction',
      reasonReference: REFERENCE,
    },
  });

  assert.equal(buildPayrollReprocessingMutation('approve', {
    caseId: CASE_ID,
    expectedVersion: 2,
    reasonCode: 'approved_for_external_execution',
    reasonReference: REFERENCE,
  })?.payload.expectedVersion, 2);
  assert.equal(buildPayrollReprocessingMutation('approve', {
    caseId: CASE_ID,
    expectedVersion: 2,
    reasonCode: 'approved_for_external_execution',
    reasonReference: 'expediente-con-datos-libres',
  }), null);
  assert.equal(buildPayrollReprocessingMutation('approve', {
    caseId: CASE_ID,
    expectedVersion: 2,
    reasonCode: 'request_not_authorized',
    reasonReference: REFERENCE,
  }), null);
  assert.equal(buildPayrollReprocessingMutation('prepare', {
    payrollRunId: RUN_ID,
    requestKind: 'reliquidate',
    reasonCode: 'source_correction',
    reasonReference: REFERENCE,
    ignoredByClient: true,
  }), null);
});
