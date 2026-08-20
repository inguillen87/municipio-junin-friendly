import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  classifyAssistantRequest,
  createInternalAssistantHandler,
  planAssistantRequest,
} from '../api/internal-assistant.js';

function responseRecorder() {
  return {
    headers: {}, statusCode: null, payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return value; },
  };
}

function metric({ from, to, days = 972, hires, exits, absences, affected, partial = false }) {
  return {
    range: { from, to }, elapsedDays: days, partial,
    hires, hirePersons: hires - 6, exits, exitPersons: exits - 4,
    balance: hires - exits, absenceEvents: absences,
    affectedContracts: affected, sourceDeclaredDays: absences * 11,
  };
}

function managementFixture({ smallCohort = false } = {}) {
  const previous = metric({
    from: '2019-12-10', to: '2022-08-07', hires: 217, exits: 173,
    absences: 3384, affected: 660,
  });
  const current = metric({
    from: '2023-12-09', to: '2026-08-06', hires: 281, exits: 232,
    absences: 5936, affected: 752, partial: true,
  });
  return {
    status: 200,
    payload: {
      ok: true,
      data: {
        periods: { previousComparable: previous, current },
        comparison: {
          basis: 'same_elapsed_days', elapsedDays: 972,
          changePercent: { hires: 29.5, exits: 34.1, balance: 11.4 },
        },
        managementYears: [{
          index: 1,
          previous: metric({ from: '2019-12-10', to: '2020-12-09', days: 366, hires: 58, exits: 43, absences: 932, affected: 522 }),
          current: metric({ from: '2023-12-09', to: '2024-12-08', days: 366, hires: 93, exits: 94, absences: 2157, affected: 613 }),
          currentStatus: 'complete', comparableToCurrent: true,
        }],
        calendarYears: [],
        payrollComparison: {
          basis: 'same_complete_closed_payroll_months',
          unit: 'events_per_100_closed_payroll_contract_months',
          previous: {
            range: { from: '2020-01-01', to: '2022-07-31' }, expectedMonths: 31,
            closedMonths: 31, contractMonths: 24117, averageLiquidated: 778,
            totalEvents: 3278, alignedEvents: 3244, excludedEvents: 34,
            affectedAlignedContracts: smallCohort ? 4 : 650, eventsPer100ContractMonths: 13.45,
          },
          current: {
            range: { from: '2024-01-01', to: '2026-07-31' }, expectedMonths: 31,
            closedMonths: 31, contractMonths: 24892, averageLiquidated: 803,
            totalEvents: 5759, alignedEvents: 5728, excludedEvents: 31,
            affectedAlignedContracts: 738, eventsPer100ContractMonths: 23.01,
          },
          alignedEventChangePercent: 76.6, rateChangePercent: 71.1,
        },
        sectors: {
          literal: [{ label: 'SECTOR PRIVADO NO EXTERNALIZAR', previousContractMonths: 2, currentContractMonths: 1 }],
        },
        budget: {
          available: false, status: 'source_not_loaded',
          reason: 'GRH no contiene crédito, modificaciones, compromiso, devengado ni pagado.',
        },
      },
      meta: {
        authority: 'GRH', grain: 'employment_contract (legajo por empresa)',
        sourceCutoff: '2026-08-06T18:15:21.000Z', currentPeriodPartial: true,
        monetaryComparisonAvailable: false,
        absenceMetricSemantics: 'Eventos administrativos por 100 contrato-mes cerrados; no es tasa de ausentismo.',
      },
    },
  };
}

function endpoint(overrides = {}) {
  return createInternalAssistantHandler({
    requireCompatibleInternalAccess: async () => ({
      mode: 'managed',
      session: { id: 'session-management', email: 'usuario@example.invalid' },
      principal: {
        user: { email: 'usuario@example.invalid' },
        tenant: {
          id: '00000000-0000-4000-8000-000000000301',
          effectiveCapabilities: ['assistant.use', 'management.analytics.read'],
        },
      },
    }),
    getInternalSql: async () => ({ query: async () => [] }),
    getTenantIdentitySql: async () => ({ query: async () => [] }),
    takeIdentityRateLimit: async () => ({ allowed: true, remaining: 5 }),
    managementAnalytics: overrides.managementAnalytics || (async () => managementFixture()),
    fetch: overrides.fetch || (async () => { throw new Error('fetch inesperado'); }),
    env: {
      AI_ASSISTANT_EXTERNAL_ENRICHMENT_ENABLED: 'true',
      AI_ASSISTANT_DURABLE_QUOTA_CERTIFIED: 'true',
      AI_ASSISTANT_QUOTA_PEPPER: 'management-assistant-test-pepper-32-bytes',
      ...(overrides.env || {}),
    },
    quotaStore: new Map(),
    now: () => Date.parse('2026-08-15T12:00:00Z'),
    logger: { info() {} },
    requestIdFactory: () => 'request-management-test',
  });
}

async function post(body, overrides = {}) {
  const res = responseRecorder();
  await endpoint(overrides)({
    method: 'POST', headers: { 'content-type': 'application/json' }, body,
  }, res);
  return res;
}

test('clasifica de forma robusta comparaciones de gestión y publica el recurso correcto', () => {
  for (const message of [
    'Comparar gestiones',
    'Compará la gestión actual vs la anterior',
    'Gestión actual contra gestión anterior',
    'Mostrame el año 1 de gestión',
    'Comparación año por año entre gestiones',
    '¿Qué pasó en el primer año de la gestión?',
  ]) {
    assert.equal(classifyAssistantRequest({ message }), 'management_comparison', message);
  }
  const plan = planAssistantRequest({ message: 'Gestión actual versus la anterior' });
  assert.equal(plan.intent, 'management_comparison');
  assert.equal(plan.domain, 'management');
  assert.equal(plan.resource, 'managementanalytics');
  assert.equal(plan.externalPolicy, 'aggregate_allowlisted');
});

test('despacha managementanalytics y responde con la ventana homogénea sin datos nominales', async () => {
  let calls = 0;
  const res = await post(
    { message: 'Compará esta gestión con la anterior' },
    { managementAnalytics: async () => { calls += 1; return managementFixture(); } },
  );

  assert.equal(res.statusCode, 200);
  assert.equal(calls, 1);
  assert.equal(res.payload.intent, 'management_comparison');
  assert.equal(res.payload.queryPlan.resource, 'managementanalytics');
  assert.equal(res.payload.targetPath, '/gestion-comparativa');
  assert.match(res.payload.answer, /972 días exactos/i);
  assert.match(res.payload.answer, /217 altas, 173 bajas y balance 44/i);
  assert.match(res.payload.answer, /281 altas, 232 bajas y balance 49/i);
  assert.match(res.payload.answer, /13,45 frente a 23,01 eventos administrativos por cada 100 contrato-mes/i);
  assert.match(res.payload.answer, /no es tasa de ausentismo/i);
  assert.equal(res.payload.asOf, '2026-08-06');
  assert.equal(res.payload.sources.length, 3);
  assert.ok(res.payload.sources.every((source) => source.system === 'GRH'));
  assert.equal(res.payload.data.budget.status, 'source_not_loaded');
  assert.equal(res.payload.provider.status, 'not_requested');
  const serialized = JSON.stringify(res.payload);
  assert.doesNotMatch(serialized, /SECTOR PRIVADO NO EXTERNALIZAR|Marcelo|\b\d{7,8}\b|@junin\.com/i);
});

test('OpenAI recibe sólo el fact-pack agregado allowlisted y nunca sectores pequeños ni mensaje crudo', async () => {
  let requestBody;
  const res = await post(
    { message: 'Compará gestiones para Marcelo Secreto legajo 99999999', enhance: true },
    {
      env: { OPENAI_API_KEY: 'openai_test' },
      fetch: async (_url, options) => {
        requestBody = JSON.parse(options.body);
        return { ok: true, async json() { return { output_text: 'La ventana homogénea permite comparar magnitudes, no causas.' }; } };
      },
    },
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.provider.provider, 'openai');
  assert.equal(res.payload.provider.status, 'used');
  assert.equal(res.payload.insight, 'La ventana homogénea permite comparar magnitudes, no causas.');
  assert.match(requestBody.input, /"elapsedDays":972/);
  assert.match(requestBody.input, /"eventsPer100ContractMonths":23\.01/);
  assert.match(requestBody.input, /"smallSectorBreakdownsShared":false/);
  assert.doesNotMatch(requestBody.input, /Marcelo|99999999|SECTOR PRIVADO|sector:|sourceSectorCodes|companyId|legajo|dni|cuil|contractId/i);
  assert.equal(res.payload.privacy.rawUserMessageSentExternally, false);
});

test('una cohorte menor a cinco fuerza fallback local antes de llamar proveedores', async () => {
  let fetchCalls = 0;
  const res = await post(
    { intent: 'management_comparison', enhance: true },
    {
      managementAnalytics: async () => managementFixture({ smallCohort: true }),
      env: { OPENAI_API_KEY: 'openai_test', HF_TOKEN: 'hf_test' },
      fetch: async () => { fetchCalls += 1; throw new Error('no debe externalizarse'); },
    },
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.provider.provider, 'local');
  assert.equal(res.payload.provider.status, 'suppressed_small_cohort');
  assert.equal(res.payload.provider.minimumAffectedContracts, 5);
  assert.equal(fetchCalls, 0);
  assert.match(res.payload.answer, /972 días exactos/i);
});

test('si la fuente comparable no está publicada falla cerrado con ruta y fuente visibles', async () => {
  const res = await post(
    { intent: 'management_comparison' },
    {
      managementAnalytics: async () => ({
        status: 503,
        payload: { ok: false, code: 'MANAGEMENT_SOURCE_NOT_LOADED', error: 'La fuente GRH comparable no está disponible.' },
      }),
    },
  );
  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.data.code, 'MANAGEMENT_SOURCE_NOT_LOADED');
  assert.equal(res.payload.targetPath, '/gestion-comparativa');
  assert.equal(res.payload.sources[0].system, 'GRH');
  assert.equal(res.payload.provider, undefined);
});

test('la interfaz reconoce la comparativa, muestra métricas honestas y ofrece continuidad', async () => {
  const html = await readFile(new URL('../asistente.html', import.meta.url), 'utf8');
  assert.match(html, /option value="management_comparison">Comparar gestiones/);
  assert.match(html, /management_comparison:\s*'management'/);
  assert.match(html, /managementanalytics:\s*'comparativa homogénea de gestiones'/);
  assert.match(html, /intent === 'management_comparison'/);
  assert.match(html, /Gestiones sobre una ventana equivalente/);
  assert.match(html, /eventos \/ 100 contrato-mes/);
  assert.match(html, /no son una tasa de ausentismo/i);
  assert.match(html, /Comparar año por año/);
  assert.match(html, /management_comparison:\s*'Comparación de gestiones'/);
});
