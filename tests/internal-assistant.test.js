import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyAssistantRequest,
  createInternalAssistantHandler,
} from '../api/internal-assistant.js';

const scope = { totalContracts: 2450, totalPeople: 2349, asOf: '2026-08-06T15:15:21.000Z' };
const integration = {
  status: 'ready',
  source: { cutoff: scope.asOf },
  workforceControl: {
    status: 'reconciled',
    administrative: { value: 882 },
    administrativePeople: 814,
    liquidable: { value: 854 },
    difference: { value: 28 },
    stateBreakdown: {
      rows: [
        { state: 'licencia_sin_goce', records: 16 },
        { state: 'suspendido', records: 11 },
        { state: 'error_de_estado', records: 1 },
      ],
    },
  },
  identityEnrichment: {
    rules: ['CUIL válido', 'DNI como respaldo', 'No modifica estado laboral'],
    crosswalk: {
      status: 'available', matched: 1699, ambiguous: 157, unmatched: 493,
      total: 2349, coveragePct: 72.3,
    },
  },
};
const payroll = {
  status: 'ready',
  source: { cutoff: scope.asOf },
  sourcePolicy: { monetaryBasis: 'ARS nominal; sin IPC ni ajuste paritario.' },
  latestClosed: {
    month: '2026-07-01', contracts: 856, netPayable: 951380572.79,
    employerCostProxy: 1397669762.29, executivePublishable: true,
  },
  currentOpen: {
    month: '2026-08-01', contracts: 854, netPayable: 549944912.78,
    employerCostProxy: 841278667.66, executivePublishable: false,
  },
  quality: { ready: true, openRunsPublished: 0 },
};

function responseRecorder() {
  return {
    headers: {}, statusCode: null, payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return value; },
  };
}

function handler(overrides = {}) {
  return createInternalAssistantHandler({
    requireInternalSession: overrides.requireInternalSession || (() => ({ id: 'user-1', email: 'usuario@example.test' })),
    getInternalSql: async () => ({ query: async () => [] }),
    integrationQuality: async () => integration,
    payrollControl: async () => payroll,
    canonicalScope: async () => scope,
    employees: overrides.employees || (async () => ({
      status: 200,
      payload: {
        ok: true,
        data: [{ contractId: 'contract-1', nombre: 'PERSONA LOCAL', legajo: '42' }],
        pagination: { page: 1, limit: 10, total: 1, pages: 1 },
      },
    })),
    employee: overrides.employee || (async () => ({
      status: 200,
      payload: {
        ok: true,
        data: {
          nombre: 'PERSONA LOCAL', legajo: '42', administrativeStatus: 'active',
          payrollStatus: 'preliquidated', controlState: 'incluido_en_corrida_abierta',
          statusSnapshotDate: '2026-08-01', personas: { available: false },
        },
      },
    })),
    fetch: overrides.fetch || (async () => { throw new Error('fetch inesperado'); }),
    env: overrides.env || {},
    now: overrides.now || (() => Date.parse('2026-08-13T20:00:00Z')),
    quotaStore: overrides.quotaStore || new Map(),
  });
}

async function post(body, overrides = {}, requestOverrides = {}) {
  const res = responseRecorder();
  await handler(overrides)({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    ...requestOverrides,
  }, res);
  return res;
}

test('clasifica intenciones principales sin depender del proveedor', () => {
  assert.equal(classifyAssistantRequest({ message: '¿Cuál es la brecha de dotación?' }), 'workforce_summary');
  assert.equal(classifyAssistantRequest({ message: '¿La nómina de agosto está cerrada?' }), 'payroll_control');
  assert.equal(classifyAssistantRequest({ message: '¿Cómo viene el crosswalk con PERSONAS?' }), 'integration_quality');
  assert.equal(classifyAssistantRequest({ search: 'Pérez' }), 'employee_search');
  assert.equal(classifyAssistantRequest({ legajo: '42' }), 'employee_detail');
});

test('exige sesión interna antes de leer cuerpo o consultar datos', async () => {
  let sqlCalled = false;
  const res = responseRecorder();
  const endpoint = createInternalAssistantHandler({
    requireInternalSession(_req, response) {
      response.status(401).json({ ok: false, code: 'INTERNAL_SESSION_REQUIRED' });
      return null;
    },
    getInternalSql: async () => { sqlCalled = true; return {}; },
  });
  await endpoint({ method: 'POST', headers: { 'content-type': 'application/json' }, body: { message: 'dotación' } }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(sqlCalled, false);
});

test('resumen determinístico reconcilia 2450/882/854/28 con fuente y asOf', async () => {
  const res = await post({ intent: 'workforce_summary' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.data.totalContracts, 2450);
  assert.equal(res.payload.data.administrativeActive, 882);
  assert.equal(res.payload.data.liquidable, 854);
  assert.equal(res.payload.data.gap, 28);
  assert.match(res.payload.answer, /2\.450/);
  assert.match(res.payload.answer, /882/);
  assert.match(res.payload.answer, /854/);
  assert.equal(res.payload.asOf, scope.asOf);
  assert.equal(res.payload.sources[0].system, 'GRH');
  assert.equal(res.payload.provider.status, 'not_requested');
});

test('nómina distingue julio cerrado publicable de agosto abierto', async () => {
  const res = await post({ message: 'estado de la nómina' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.intent, 'payroll_control');
  assert.equal(res.payload.data.latestClosed.executivePublishable, true);
  assert.equal(res.payload.data.currentOpen.executivePublishable, false);
  assert.match(res.payload.answer, /última nómina cerrada publicable/i);
  assert.match(res.payload.answer, /sigue abierta/i);
});

test('integración mantiene GRH como autoridad y PERSONAS como auxiliar', async () => {
  const res = await post({ intent: 'integration_quality' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.data.authority, 'GRH');
  assert.equal(res.payload.data.auxiliaryRegistry, 'PERSONAS');
  assert.equal(res.payload.data.crosswalk.matched, 1699);
  assert.equal(res.payload.data.crosswalk.ambiguous, 157);
  assert.equal(res.payload.data.crosswalk.unmatched, 493);
  assert.match(res.payload.answer, /72,3%/);
});

test('búsqueda y ficha nominal quedan locales aunque se solicite enhance', async () => {
  let fetchCalls = 0;
  let searchQuery;
  const fetchMock = async () => { fetchCalls += 1; throw new Error('no debe salir'); };
  const list = await post(
    { intent: 'employee_search', search: 'PERSONA LOCAL', enhance: true },
    {
      fetch: fetchMock,
      env: { HF_TOKEN: 'hf_test' },
      employees: async (_sql, req) => {
        searchQuery = req.query;
        return {
          status: 200,
          payload: { ok: true, data: [{ nombre: 'PERSONA LOCAL', dni: '00000000' }], pagination: { total: 1 } },
        };
      },
    },
  );
  assert.equal(list.statusCode, 200);
  assert.equal(searchQuery.search, 'PERSONA LOCAL');
  assert.equal(searchQuery.limit, '10');
  assert.equal(list.payload.provider.status, 'not_allowed_for_nominal_or_unknown_intent');
  assert.equal(list.payload.privacy.nominalQueries, 'local_database_only');

  const detail = await post(
    { intent: 'employee_detail', legajo: '42', enhance: true },
    { fetch: fetchMock, env: { HF_TOKEN: 'hf_test' } },
  );
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.payload.data.data.nombre, 'PERSONA LOCAL');
  assert.equal(detail.payload.provider.status, 'not_allowed_for_nominal_or_unknown_intent');
  assert.equal(fetchCalls, 0);
});

test('HF Router recibe sólo hechos agregados, con timeout y tope de tokens', async () => {
  let request;
  const res = await post(
    { intent: 'workforce_summary', message: 'Dame una lectura ejecutiva', enhance: true },
    {
      env: {
        HF_TOKEN: 'hf_secret_test',
        HF_MODEL: 'Qwen/test-model',
        HF_ASSISTANT_MAX_TOKENS: '180',
        HF_ASSISTANT_TIMEOUT_MS: '2500',
      },
      fetch: async (url, options) => {
        request = { url, options };
        return {
          ok: true,
          async json() {
            return {
              choices: [{ message: { content: 'La brecha está reconciliada; corresponde mantener el control por estado.' } }],
              usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
            };
          },
        };
      },
    },
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.provider.status, 'used');
  assert.equal(res.payload.insight, 'La brecha está reconciliada; corresponde mantener el control por estado.');
  assert.equal(request.url, 'https://router.huggingface.co/v1/chat/completions');
  assert.equal(request.options.headers.Authorization, 'Bearer hf_secret_test');
  const providerBody = JSON.parse(request.options.body);
  assert.equal(providerBody.model, 'Qwen/test-model');
  assert.equal(providerBody.max_tokens, 180);
  assert.equal(providerBody.temperature, 0.2);
  const serialized = JSON.stringify(providerBody);
  assert.doesNotMatch(serialized, /PERSONA LOCAL|00000000|usuario@example\.test/i);
  assert.doesNotMatch(providerBody.messages[1].content, /Dame una lectura ejecutiva/i, 'no debe enviar el mensaje crudo');
  assert.equal(res.payload.privacy.rawUserMessageSentExternally, false);
  assert.equal(res.payload.provider.limits.maxCallsPerRequest, 1);
  assert.equal(res.payload.provider.limits.maxOutputTokens, 180);
  assert.equal(res.payload.provider.limits.timeoutMs, 2500);
});

test('usa un modelo oficial de baja latencia cuando HF_MODEL no está configurado', async () => {
  let providerBody;
  const res = await post(
    { intent: 'workforce_summary', enhance: true },
    {
      env: { HF_TOKEN: 'hf_test' },
      fetch: async (_url, options) => {
        providerBody = JSON.parse(options.body);
        return { ok: true, async json() { return { choices: [{ message: { content: 'Lectura agregada.' } }] }; } };
      },
    },
  );
  assert.equal(res.payload.mode, 'hybrid');
  assert.equal(providerBody.model, 'openai/gpt-oss-120b:fastest');
});

test('una caída o falta de configuración de HF no rompe la respuesta local', async () => {
  const missing = await post({ intent: 'workforce_summary', enhance: true });
  assert.equal(missing.statusCode, 200);
  assert.equal(missing.payload.provider.status, 'not_configured');
  assert.equal(missing.payload.data.gap, 28);

  const down = await post(
    { intent: 'workforce_summary', enhance: true },
    {
      env: { HF_TOKEN: 'hf_test' },
      fetch: async () => ({ ok: false, status: 503 }),
    },
  );
  assert.equal(down.statusCode, 200);
  assert.equal(down.payload.provider.status, 'unavailable');
  assert.equal(down.payload.provider.externalProviderAttempted, true);
  assert.equal(down.payload.provider.nominalDataSent, false);
  assert.match(down.payload.answer, /2\.450/);
  assert.equal(down.payload.insight, null);
});

test('el cupo por runtime bloquea llamadas repetidas sin afectar datos', async () => {
  let fetchCalls = 0;
  const quotaStore = new Map();
  const overrides = {
    env: { HF_TOKEN: 'hf_test', HF_ASSISTANT_CALLS_PER_WINDOW: '1' },
    quotaStore,
    fetch: async () => {
      fetchCalls += 1;
      return { ok: true, async json() { return { choices: [{ message: { content: 'ok' } }] }; } };
    },
  };
  const first = await post({ intent: 'workforce_summary', enhance: true }, overrides);
  const second = await post({ intent: 'workforce_summary', enhance: true }, overrides);
  assert.equal(first.payload.provider.status, 'used');
  assert.equal(second.payload.provider.status, 'runtime_rate_limited');
  assert.equal(second.payload.data.gap, 28);
  assert.equal(fetchCalls, 1);
});

test('valida método, content-type, cuerpo e identificador de ficha', async () => {
  const endpoint = handler();
  const method = responseRecorder();
  await endpoint({ method: 'DELETE', headers: {} }, method);
  assert.equal(method.statusCode, 405);

  const contentType = responseRecorder();
  await endpoint({ method: 'POST', headers: {}, body: { message: 'dotación' } }, contentType);
  assert.equal(contentType.statusCode, 415);

  const empty = await post({});
  assert.equal(empty.statusCode, 400);

  const detail = await post({ intent: 'employee_detail', message: 'abrir ficha' });
  assert.equal(detail.statusCode, 400);
  assert.equal(detail.payload.code, 'EMPLOYEE_IDENTIFIER_REQUIRED');
});

test('la interfaz activa enriquecimiento y adapta insight y fuentes del contrato', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../asistente.html', import.meta.url), 'utf8');
  assert.match(html, /enhance:\s*true/);
  assert.match(html, /payload\.insight/);
  assert.match(html, /item\.system/);
  assert.match(html, /item\.relation/);
  assert.match(html, /payload\.provider/);
});
