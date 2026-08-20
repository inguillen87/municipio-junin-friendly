import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  classifyAssistantRequest,
  createInternalAssistantHandler,
  planAssistantRequest,
} from '../api/internal-assistant.js';
import { budgetApproved } from '../api/internal-data.js';

function responseRecorder() {
  return {
    headers: {}, statusCode: null, payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return value; },
  };
}

function endpoint(overrides = {}) {
  return createInternalAssistantHandler({
    requireInternalSession: () => ({
      id: 'budget-assistant-user',
      email: 'budget-assistant@example.test',
      role: 'ADMIN_INTERNO',
    }),
    getInternalSql: overrides.getInternalSql || (async () => {
      throw new Error('budget_approved no debe abrir Neon');
    }),
    budgetApproved: overrides.budgetApproved || (() => budgetApproved()),
    fetch: overrides.fetch || (async () => { throw new Error('fetch inesperado'); }),
    env: overrides.env || {},
    quotaStore: new Map(),
    now: () => Date.parse('2026-08-20T12:00:00Z'),
    logger: { info() {} },
    requestIdFactory: () => 'request-budget-assistant-test',
  });
}

async function post(body, overrides = {}) {
  const res = responseRecorder();
  await endpoint(overrides)({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  }, res);
  return res;
}

function ars(value) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(Number(value));
}

test('clasifica presupuesto, Ordenanza 1021, gasto, recursos, financiamiento y ejecución', () => {
  for (const message of [
    '¿Cuál es el presupuesto municipal aprobado para 2026?',
    'Explicame la Ordenanza 1021/2025',
    '¿Cuál es el gasto aprobado?',
    '¿Cuáles son los recursos estimados?',
    '¿Cuál es el financiamiento estimado?',
    '¿Tenemos ejecución presupuestaria?',
  ]) {
    assert.equal(classifyAssistantRequest({ message }), 'budget_approved', message);
  }
  for (const message of [
    'Explicame la Ordenanza 21/2025',
    'Explicame la Ordenanza 121',
    'Explicame la Ordenanza 021',
    'Explicame la Ordenanza 1021/2024',
    'Explicame la Ordenanza 1.021/2024',
  ]) {
    assert.notEqual(classifyAssistantRequest({ message }), 'budget_approved', message);
  }
  assert.equal(classifyAssistantRequest({ message: 'Explicame la Ordenanza 1.021/2025' }), 'budget_approved');

  const plan = planAssistantRequest({ message: 'Explicá el presupuesto municipal aprobado' });
  assert.equal(plan.intent, 'budget_approved');
  assert.equal(plan.domain, 'budget');
  assert.equal(plan.resource, 'budgetapproved');
  assert.deepEqual(plan.resources, [{
    name: 'budgetapproved', mode: 'read_only', containsNominalData: false,
  }]);
  assert.equal(plan.externalPolicy, 'local_only');
  assert.equal(plan.privacy.rawUserMessageSentExternally, false);
});

test('la consulta natural del presupuesto 2026 llega al recurso estático sin abrir Neon', async () => {
  let budgetCalls = 0;
  let sqlCalls = 0;
  const res = await post(
    { message: '¿Cuál es el presupuesto municipal aprobado para 2026?' },
    {
      budgetApproved: async () => {
        budgetCalls += 1;
        return budgetApproved();
      },
      getInternalSql: async () => {
        sqlCalls += 1;
        throw new Error('no debe abrir Neon');
      },
    },
  );

  assert.equal(res.statusCode, 200);
  assert.equal(budgetCalls, 1);
  assert.equal(sqlCalls, 0);
  assert.equal(res.payload.intent, 'budget_approved');
  assert.equal(res.payload.queryPlan.resource, 'budgetapproved');
  assert.equal(res.payload.targetPath, '/presupuesto-control');
  assert.match(res.headers['Cache-Control'], /private, no-store/);
});

test('distingue el año de la Ordenanza 1021/2025 del ejercicio presupuestario 2026', async () => {
  let budgetCalls = 0;
  const res = await post(
    { message: 'Explicame la Ordenanza 1021/2025' },
    { budgetApproved: async () => { budgetCalls += 1; return budgetApproved(); } },
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.intent, 'budget_approved');
  assert.equal(res.payload.data.fiscalYear, 2026);
  assert.deepEqual(res.payload.queryPlan.filters, {});
  assert.equal(budgetCalls, 1);
});

test('rechaza una referencia a 1021/2024 aunque la consulta también mencione el presupuesto 2026', async () => {
  let budgetCalls = 0;
  const res = await post(
    { message: 'Explicame la Ordenanza 1021/2024 y el presupuesto municipal 2026' },
    { budgetApproved: async () => { budgetCalls += 1; return budgetApproved(); } },
  );

  assert.equal(res.statusCode, 422);
  assert.equal(res.payload.intent, 'budget_approved');
  assert.equal(res.payload.data.code, 'BUDGET_INSTRUMENT_YEAR_MISMATCH');
  assert.equal(res.payload.data.requestedInstrumentYear, 2024);
  assert.deepEqual(res.payload.data.availableInstrumentYears, [2025]);
  assert.match(res.payload.answer, /1021\/2025.*1021\/2024/i);
  assert.equal(budgetCalls, 0);
});

test('no sustituye silenciosamente otro ejercicio por el presupuesto 2026', async () => {
  let budgetCalls = 0;
  const res = await post(
    { message: '¿Cuál fue el presupuesto municipal aprobado para 2025?' },
    { budgetApproved: async () => { budgetCalls += 1; return budgetApproved(); } },
  );

  assert.equal(res.statusCode, 422);
  assert.equal(res.payload.intent, 'budget_approved');
  assert.equal(res.payload.data.code, 'BUDGET_FISCAL_YEAR_UNAVAILABLE');
  assert.equal(res.payload.data.requestedFiscalYear, 2025);
  assert.deepEqual(res.payload.data.availableFiscalYears, [2026]);
  assert.match(res.payload.answer, /corresponde al ejercicio 2026, no a 2025/i);
  assert.equal(budgetCalls, 0);
});

test('responde con los importes oficiales exactos y bloquea toda lectura de ejecución o desvíos', async () => {
  const res = await post({ intent: 'budget_approved' });
  const expectedAnswer = `La Ordenanza 1021/2025 fija para 2026 un gasto aprobado de ${ars('31854092000.00')}, con recursos estimados por ${ars('27700964239.13')} y financiamiento estimado por ${ars('4153127760.87')}. Recursos más financiamiento reconcilian exactamente con el gasto, al igual que las dos jurisdicciones publicadas. Son pesos nominales aprobados: la fuente no contiene modificaciones, compromiso, devengado ni pagado, por lo que no corresponde calcular ejecución, porcentajes ni desvíos.`;

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.mode, 'deterministic');
  assert.equal(res.payload.answer, expectedAnswer);
  assert.equal(res.payload.asOf, '2025-12-26');
  assert.equal(res.payload.data.fiscalYear, 2026);
  assert.deepEqual(res.payload.data.currency, { code: 'ARS', basis: 'nominal' });
  assert.deepEqual(res.payload.data.approved, {
    expenditures: '31854092000.00',
    resources: '27700964239.13',
    financing: '4153127760.87',
    jurisdictions: [
      { code: '01', label: 'Departamento Ejecutivo', amount: '30879342000.00' },
      { code: '02', label: 'Honorable Concejo Deliberante', amount: '974750000.00' },
    ],
  });
  assert.deepEqual(res.payload.data.reconciliations, { funding: true, jurisdictions: true });
  assert.deepEqual(res.payload.data.execution, { available: false, status: 'source_not_loaded' });
  assert.deepEqual(res.payload.data.methodology, {
    grain: 'approved_initial_budget',
    executionLoaded: false,
    annexBreakdownAvailable: false,
  });
  assert.equal(res.payload.sources[0].system, 'HCD Junín');
  assert.equal(res.payload.sources[0].relation, 'Ordenanza 1021/2025');
  assert.equal(res.payload.sources[0].authority, 'approved_municipal_budget');
  assert.equal(res.payload.provider.status, 'not_requested');
  assert.equal(Object.hasOwn(res.payload.data.execution, 'executionRate'), false);
  assert.equal(Object.hasOwn(res.payload.data.execution, 'variance'), false);
});

test('el presupuesto es determinístico y nunca externaliza cifras a OpenAI ni Hugging Face', async () => {
  let externalCalls = 0;
  const rawMessage = 'Presupuesto para Marcelo Secreto, DNI 33123456, legajo 7788';
  const res = await post(
    { intent: 'budget_approved', message: rawMessage, enhance: true },
    {
      env: { OPENAI_API_KEY: 'openai_budget_test', HF_TOKEN: 'hf_budget_test' },
      fetch: async () => { externalCalls += 1; throw new Error('no debe externalizar presupuesto'); },
    },
  );

  assert.equal(res.statusCode, 200);
  assert.equal(externalCalls, 0);
  assert.equal(res.payload.provider.provider, 'local');
  assert.equal(res.payload.provider.status, 'not_allowed_for_nominal_or_unknown_intent');
  assert.equal(res.payload.provider.externalProviderAttempted, false);
  assert.equal(res.payload.provider.externalProviderUsed, false);
  assert.equal(res.payload.insight, null);
  assert.equal(res.payload.queryPlan.externalPolicy, 'local_only');
  assert.equal(res.payload.privacy.localOnlyResource, true);
  assert.equal(res.payload.privacy.rawUserMessageSentExternally, false);
  assert.equal(res.payload.data.execution.available, false);
  assert.equal(Object.hasOwn(res.payload.data.execution, 'executionRate'), false);
  assert.equal(Object.hasOwn(res.payload.data.execution, 'variance'), false);
});

test('falla cerrado cuando la fuente oficial o el contrato decimal no superan validación', async () => {
  let sqlCalls = 0;
  const sourceFailure = await post(
    { intent: 'budget_approved' },
    {
      budgetApproved: async () => ({
        status: 503,
        payload: {
          ok: false,
          code: 'BUDGET_SOURCE_INVALID',
          error: 'La fuente oficial del presupuesto aprobado no superó la validación de integridad.',
        },
      }),
      getInternalSql: async () => { sqlCalls += 1; throw new Error('no debe abrir Neon'); },
    },
  );
  assert.equal(sourceFailure.statusCode, 503);
  assert.equal(sourceFailure.payload.data.code, 'BUDGET_SOURCE_INVALID');
  assert.equal(sourceFailure.payload.targetPath, '/presupuesto-control');
  assert.equal(sourceFailure.payload.sources[0].system, 'HCD Junín');

  const contractFailure = await post(
    { intent: 'budget_approved' },
    {
      budgetApproved: async () => ({
        status: 200,
        payload: {
          ok: true,
          data: {
            fiscalYear: 2026,
            approved: { expenditures: 31854092000, resources: '27700964239.13', financing: '4153127760.87' },
            source: { cutoff: '2025-12-26' },
          },
        },
      }),
    },
  );
  assert.equal(contractFailure.statusCode, 503);
  assert.equal(contractFailure.payload.data.code, 'BUDGET_APPROVED_INVALID');
  assert.equal(sqlCalls, 0);
});

test('GET publica budget_approved como recurso determinístico local', async () => {
  let sqlCalls = 0;
  const res = responseRecorder();
  await endpoint({
    getInternalSql: async () => { sqlCalls += 1; throw new Error('no debe abrir Neon'); },
  })({ method: 'GET', headers: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(sqlCalls, 0);
  const capability = res.payload.capabilities.find((item) => item.intent === 'budget_approved');
  assert.deepEqual(capability, {
    intent: 'budget_approved', externalEnhancement: false, resource: 'budgetapproved',
  });
  assert.equal(res.payload.privacy.rawUserMessageSentExternally, false);
});

test('la interfaz incorpora presupuesto en acceso rápido, contexto, resultados, sugerencias y tema', async () => {
  const html = await readFile(new URL('../asistente.html', import.meta.url), 'utf8');

  assert.match(html, /data-prompt="[^"]*presupuesto municipal aprobado[^"]*"[^>]*>[\s\S]*?<span>Presupuesto 2026<\/span>/i);
  assert.match(html, /option value="budget_approved">Presupuesto aprobado<\/option>/);
  assert.match(html, /budget_approved:\s*'budget'/);
  assert.match(html, /presupuesto:\s*'budget_approved'/);
  assert.match(html, /budget:\s*'presupuesto(?: aprobado)?'/);
  assert.match(html, /budgetapproved:\s*'presupuesto aprobado 2026'/);
  assert.ok((html.match(/intent === 'budget_approved'/g) || []).length >= 3);
  assert.match(html, /Presupuesto aprobado 2026/);
  assert.match(html, /Gasto aprobado/);
  assert.match(html, /Recursos estimados/);
  assert.match(html, /Financiamiento estimado/);
  assert.match(html, /Explicar la (?:re)?conciliación/);
  assert.match(html, /Qué falta para medir ejecución/i);
  assert.match(html, /Abrir comparaci(?:ó|o)n de gestiones/);
  assert.match(html, /budget_approved:\s*'Presupuesto aprobado 2026'/);
});
