import { getInternalSql } from '../lib/internal-neon.js';
import { requireInternalSession } from '../lib/internal-session.js';
import {
  employee,
  employees,
  integrationQuality,
  payrollControl,
} from './internal-data.js';

const MAX_BODY_BYTES = 12 * 1024;
const MAX_MESSAGE_LENGTH = 1_200;
const MAX_SEARCH_LENGTH = 100;
const MAX_PROVIDER_OUTPUT_CHARS = 4_000;
const HF_ROUTER_URL = 'https://router.huggingface.co/v1/chat/completions';
const DEFAULT_HF_MODEL = 'openai/gpt-oss-120b:fastest';
const DEFAULT_HF_TIMEOUT_MS = 6_000;
const DEFAULT_HF_OUTPUT_TOKENS = 220;
const DEFAULT_HF_CALLS_PER_WINDOW = 3;
const DEFAULT_HF_WINDOW_MS = 60_000;

const INTENTS = new Set([
  'workforce_summary',
  'payroll_control',
  'integration_quality',
  'employee_search',
  'employee_detail',
  'executive_analysis',
  'help',
]);

const EXTERNAL_ALLOWED_INTENTS = new Set([
  'workforce_summary',
  'payroll_control',
  'integration_quality',
  'executive_analysis',
]);

const EXTERNAL_FORBIDDEN_FIELDS = /\b(?:dni|cuil|nombre|apellido|legajo|domicilio|direccion|tel[eé]fono|email|contractid|sourceid)\b/i;
const quotaByRuntime = new Map();

function send(res, status, payload) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Cookie');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(payload);
}

function requestContentType(req) {
  if (typeof req?.headers?.get === 'function') return req.headers.get('content-type') || '';
  return req?.headers?.['content-type'] || req?.headers?.['Content-Type'] || '';
}

async function readJsonBody(req) {
  if (req.body != null) {
    if (Buffer.isBuffer(req.body)) {
      if (req.body.length > MAX_BODY_BYTES) throw new RangeError('request_body_too_large');
      return JSON.parse(req.body.toString('utf8'));
    }
    if (typeof req.body === 'string') {
      if (Buffer.byteLength(req.body, 'utf8') > MAX_BODY_BYTES) {
        throw new RangeError('request_body_too_large');
      }
      return JSON.parse(req.body);
    }
    if (typeof req.body === 'object' && !Array.isArray(req.body)) return req.body;
    throw new TypeError('request_body_invalid');
  }

  if (typeof req?.[Symbol.asyncIterator] !== 'function') return {};
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) throw new RangeError('request_body_too_large');
    chunks.push(buffer);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

function normalizeText(value, maximum = MAX_MESSAGE_LENGTH) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, maximum) : '';
}

function foldText(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function extractLegajo(message) {
  return normalizeText(message).match(/\blegajo\s*(?:n[°ºo.]?\s*)?[:#-]?\s*(\d{1,20})\b/i)?.[1] || '';
}

function extractCompanyId(message) {
  return normalizeText(message).match(/\b(?:empresa|company)\s*(?:id)?\s*[:#-]?\s*(-?\d{1,10})\b/i)?.[1] || '';
}

function extractEmployeeSearch(message) {
  const text = normalizeText(message, MAX_SEARCH_LENGTH + 80);
  const match = text.match(/(?:buscar|busc[aá]|encontrar|ficha\s+de|emplead[oa]\s+)(?:a\s+)?(.+)$/i);
  if (!match) return '';
  const candidate = normalizeText(match[1], MAX_SEARCH_LENGTH)
    .replace(/\b(?:por favor|en grh|en la base)\b.*$/i, '')
    .trim();
  return /^(?:empleados?|personas?|todos?|lista|directorio)$/i.test(candidate) ? '' : candidate;
}

export function classifyAssistantRequest(body = {}) {
  const explicit = normalizeText(body.intent, 40).toLowerCase();
  if (explicit && INTENTS.has(explicit)) return explicit;
  if (body.contractId || body.legajo) return 'employee_detail';
  if (normalizeText(body.search, MAX_SEARCH_LENGTH)) return 'employee_search';

  const message = foldText(body.message);
  if (/\b(?:ficha|detalle)\b/.test(message) && /\blegajo\b/.test(message)) return 'employee_detail';
  if (/\b(?:nomina|liquidacion|haberes|sueldo|salario|corrida|julio|agosto)\b/.test(message)) return 'payroll_control';
  if (/\b(?:personas|crosswalk|integracion|coincidencia|identidad|padron)\b/.test(message)) return 'integration_quality';
  if (/\b(?:dotacion|activos?|liquidables?|brecha|plantel|cuantos?|882|854)\b/.test(message)) return 'workforce_summary';
  if (/\b(?:buscar|busca|encontrar|empleados?|directorio|ficha)\b/.test(message)) return 'employee_search';
  if (/\b(?:analiza|analisis|explica|recomendacion|diagnostico|ejecutivo)\b/.test(message)) return 'executive_analysis';
  return 'help';
}

async function canonicalScope(sql) {
  const [row = {}] = await sql.query(`
    SELECT (SELECT count(*)::int FROM employment_contract) AS "totalContracts",
           (SELECT count(*)::int FROM person_identity) AS "totalPeople",
           (SELECT source_cutoff
              FROM source_import_batch
             WHERE source_system = 'GRH'
             ORDER BY source_cutoff DESC, recorded_at DESC
             LIMIT 1) AS "asOf"
  `);
  return {
    totalContracts: Number(row.totalContracts || 0),
    totalPeople: Number(row.totalPeople || 0),
    asOf: row.asOf ?? null,
  };
}

function dateValue(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString('es-AR');
}

function formatMoney(value) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function workforceResult(integration, scope) {
  const administrative = integration.workforceControl?.administrative?.value;
  const liquidable = integration.workforceControl?.liquidable?.value;
  const gap = integration.workforceControl?.difference?.value;
  const reconciled = integration.workforceControl?.status === 'reconciled';
  const answer = administrative === null || liquidable === null || gap === null
    ? `GRH contiene ${formatNumber(scope.totalContracts)} legajos históricos y ${formatNumber(scope.totalPeople)} personas canónicas. El control administrativo/liquidable todavía no está listo para publicarse.`
    : `GRH contiene ${formatNumber(scope.totalContracts)} legajos históricos y ${formatNumber(scope.totalPeople)} personas canónicas. Hay ${formatNumber(administrative)} activos administrativos, ${formatNumber(liquidable)} incluidos en la corrida operativa y una brecha de ${formatNumber(gap)} legajos${reconciled ? ' completamente explicada por estados de control' : ' pendiente de revisión'}.`;
  return {
    answer,
    data: {
      totalContracts: scope.totalContracts,
      totalPeople: scope.totalPeople,
      administrativeActive: administrative,
      administrativePeople: integration.workforceControl?.administrativePeople ?? null,
      liquidable,
      gap,
      gapBreakdown: integration.workforceControl?.stateBreakdown?.rows || [],
      status: integration.workforceControl?.status || integration.status,
    },
    asOf: dateValue(integration.source?.cutoff || scope.asOf),
    sources: [
      { system: 'GRH', relation: 'employment_contract', authority: 'labor_core' },
      { system: 'GRH', relation: 'vw_empleado_actual', authority: 'workforce_control' },
    ],
  };
}

function payrollResult(payroll) {
  const closed = payroll.latestClosed;
  const open = payroll.currentOpen;
  const answer = closed
    ? `La última nómina cerrada publicable corresponde a ${String(closed.month).slice(0, 10)}, con ${formatNumber(closed.contracts)} contratos y neto nominal de ${formatMoney(closed.netPayable)}. ${open ? `La corrida ${String(open.month).slice(0, 10)} sigue abierta con ${formatNumber(open.contracts)} contratos y no se publica como KPI financiero.` : 'No hay una corrida abierta disponible para control.'}`
    : 'El modelo de nómina todavía no dispone de una corrida cerrada, reconciliada y publicable.';
  return {
    answer,
    data: {
      status: payroll.status,
      latestClosed: closed,
      currentOpen: open,
      quality: payroll.quality,
      monetaryBasis: payroll.sourcePolicy?.monetaryBasis || 'ARS nominal',
    },
    asOf: dateValue(payroll.source?.cutoff || closed?.month || open?.month),
    sources: [
      { system: 'GRH', relation: 'payroll_run', authority: 'payroll_closure' },
      { system: 'GRH', relation: 'vw_liquidacion_mensual', authority: 'aggregate_payroll_control' },
    ],
  };
}

function integrationResult(integration, scope) {
  const crosswalk = integration.identityEnrichment?.crosswalk || {};
  const answer = crosswalk.status === 'available'
    ? `GRH sigue siendo la autoridad laboral. PERSONAS sólo enriquece identidad y territorio: ${formatNumber(crosswalk.matched)} coincidencias confirmadas (${Number(crosswalk.coveragePct || 0).toLocaleString('es-AR')}%), ${formatNumber(crosswalk.ambiguous)} ambiguas y ${formatNumber(crosswalk.unmatched)} sin coincidencia sobre ${formatNumber(crosswalk.total)} personas GRH.`
    : `GRH sigue siendo la autoridad laboral sobre ${formatNumber(scope.totalContracts)} legajos. El crosswalk con PERSONAS todavía no está disponible y no se infiere ningún vínculo.`;
  return {
    answer,
    data: {
      status: integration.status,
      authority: 'GRH',
      auxiliaryRegistry: 'PERSONAS',
      totalContracts: scope.totalContracts,
      totalPeople: scope.totalPeople,
      crosswalk,
      rules: integration.identityEnrichment?.rules || [],
    },
    asOf: dateValue(integration.source?.cutoff || scope.asOf),
    sources: [
      { system: 'GRH', relation: 'person_identity', authority: 'canonical_identity' },
      { system: 'GRH_PERSONAS', relation: 'vw_crosswalk_persona', authority: 'identity_enrichment_only' },
    ],
  };
}

function employeeSearchResult(result, scope) {
  const total = Number(result.payload?.pagination?.total || 0);
  const shown = result.payload?.data?.length || 0;
  return {
    status: result.status,
    answer: total
      ? `Encontré ${formatNumber(total)} legajos. Muestro ${formatNumber(shown)} resultados de la consulta interna; abrí una ficha para ver su trazabilidad completa.`
      : 'No encontré legajos con esos criterios en el directorio canónico GRH.',
    data: result.payload,
    asOf: dateValue(scope.asOf),
    sources: [
      { system: 'GRH', relation: 'employment_contract', authority: 'labor_core' },
      { system: 'GRH', relation: 'person_identity', authority: 'canonical_identity' },
    ],
  };
}

function employeeDetailResult(result, scope) {
  if (result.status !== 200) {
    return {
      status: result.status,
      answer: result.payload?.error || 'No se pudo abrir la ficha solicitada.',
      data: result.payload,
      asOf: dateValue(scope.asOf),
      sources: [{ system: 'GRH', relation: 'employment_contract', authority: 'labor_core' }],
    };
  }
  const row = result.payload.data;
  return {
    status: 200,
    answer: `Ficha interna de ${row.nombre || `legajo ${row.legajo}`}: estado administrativo ${row.administrativeStatus || 'sin clasificar'}, estado de nómina ${row.payrollStatus || 'sin clasificar'} y control ${row.controlState || 'sin clasificar'}.`,
    data: result.payload,
    asOf: dateValue(row.statusSnapshotDate || scope.asOf),
    sources: [
      { system: 'GRH', relation: 'employment_contract', authority: 'labor_core' },
      { system: 'GRH', relation: 'employment_status_snapshot', authority: 'status_evidence' },
      ...(row.personas?.available
        ? [{ system: 'PERSONAS', relation: 'person_identity_assertion', authority: 'auxiliary_enrichment' }]
        : []),
    ],
  };
}

function executiveResult(integration, payroll, scope) {
  const workforce = workforceResult(integration, scope);
  const payrollView = payrollResult(payroll);
  const integrationView = integrationResult(integration, scope);
  return {
    answer: `${workforce.answer} ${payrollView.answer} ${integrationView.answer}`,
    data: {
      workforce: workforce.data,
      payroll: payrollView.data,
      integration: integrationView.data,
    },
    asOf: workforce.asOf || payrollView.asOf || integrationView.asOf,
    sources: [...workforce.sources, ...payrollView.sources, ...integrationView.sources],
  };
}

function providerFacts(intent, data) {
  if (intent === 'workforce_summary') {
    return {
      historicalEmploymentRecords: data.totalContracts,
      canonicalPeople: data.totalPeople,
      administrativeActive: data.administrativeActive,
      includedInOperationalRun: data.liquidable,
      operationalGap: data.gap,
      controlStates: data.gapBreakdown,
      reconciliationStatus: data.status,
    };
  }
  if (intent === 'payroll_control') {
    return {
      status: data.status,
      latestClosed: data.latestClosed && {
        month: data.latestClosed.month,
        contracts: data.latestClosed.contracts,
        netPayableArsNominal: data.latestClosed.netPayable,
        employerCostProxyArsNominal: data.latestClosed.employerCostProxy,
        publishable: data.latestClosed.executivePublishable,
      },
      currentOpen: data.currentOpen && {
        month: data.currentOpen.month,
        contracts: data.currentOpen.contracts,
        publishable: data.currentOpen.executivePublishable,
      },
      monetaryBasis: data.monetaryBasis,
    };
  }
  if (intent === 'integration_quality') {
    return {
      status: data.status,
      laborAuthority: data.authority,
      auxiliaryRegistry: data.auxiliaryRegistry,
      historicalEmploymentRecords: data.totalContracts,
      canonicalPeople: data.totalPeople,
      crosswalk: data.crosswalk && {
        status: data.crosswalk.status,
        matched: data.crosswalk.matched,
        ambiguous: data.crosswalk.ambiguous,
        unmatched: data.crosswalk.unmatched,
        total: data.crosswalk.total,
        coveragePct: data.crosswalk.coveragePct,
      },
    };
  }
  if (intent === 'executive_analysis') {
    return {
      workforce: providerFacts('workforce_summary', data.workforce),
      payroll: providerFacts('payroll_control', data.payroll),
      integration: providerFacts('integration_quality', data.integration),
    };
  }
  return null;
}

function consumeRuntimeQuota(key, env, now, quotaStore) {
  const limit = boundedInteger(env.HF_ASSISTANT_CALLS_PER_WINDOW, DEFAULT_HF_CALLS_PER_WINDOW, 1, 10);
  const windowMs = boundedInteger(env.HF_ASSISTANT_WINDOW_MS, DEFAULT_HF_WINDOW_MS, 10_000, 3_600_000);
  const previous = quotaStore.get(key);
  if (!previous || now - previous.startedAt >= windowMs) {
    quotaStore.set(key, { startedAt: now, calls: 1 });
    return { allowed: true, limit, windowMs };
  }
  if (previous.calls >= limit) return { allowed: false, limit, windowMs };
  previous.calls += 1;
  return { allowed: true, limit, windowMs };
}

function providerStatus(status, extra = {}) {
  const externalProviderAttempted = new Set([
    'used', 'upstream_rate_limited', 'unavailable', 'invalid_response', 'timeout',
  ]).has(status);
  return {
    name: 'huggingface_router',
    status,
    externalProviderAttempted,
    externalProviderUsed: status === 'used',
    nominalDataSent: false,
    ...extra,
  };
}

async function generateAggregateInsight({ intent, data, session, env, fetchImpl, now, quotaStore }) {
  if (!EXTERNAL_ALLOWED_INTENTS.has(intent)) return providerStatus('not_allowed_for_nominal_or_unknown_intent');
  const token = typeof env.HF_TOKEN === 'string' ? env.HF_TOKEN.trim() : '';
  if (!token) return providerStatus('not_configured');

  const facts = providerFacts(intent, data);
  const serializedFacts = JSON.stringify(facts);
  if (!facts || EXTERNAL_FORBIDDEN_FIELDS.test(serializedFacts)) {
    return providerStatus('blocked_by_privacy_guard');
  }

  const quota = consumeRuntimeQuota(String(session.id || session.email), env, now(), quotaStore);
  if (!quota.allowed) {
    return providerStatus('runtime_rate_limited', {
      limit: quota.limit,
      windowSeconds: Math.round(quota.windowMs / 1000),
    });
  }

  const model = normalizeText(env.HF_MODEL, 160) || DEFAULT_HF_MODEL;
  const timeoutMs = boundedInteger(env.HF_ASSISTANT_TIMEOUT_MS, DEFAULT_HF_TIMEOUT_MS, 1_000, 8_000);
  const maxTokens = boundedInteger(env.HF_ASSISTANT_MAX_TOKENS, DEFAULT_HF_OUTPUT_TOKENS, 64, 320);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const topic = {
    workforce_summary: 'Explicá el control agregado de dotación y su brecha operativa.',
    payroll_control: 'Explicá el estado agregado de nómina, distinguiendo cerrado publicable de abierto no publicable.',
    integration_quality: 'Explicá la calidad de integración: GRH manda en lo laboral y PERSONAS sólo enriquece identidad y territorio.',
    executive_analysis: 'Redactá una lectura ejecutiva breve, priorizando controles accionables y sin inventar causas.',
  }[intent];

  try {
    const response = await fetchImpl(HF_ROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'Sos un asistente de control municipal. Recibís sólo indicadores agregados. Respondé en español claro, en hasta 130 palabras. No inventes datos, personas, causas ni conclusiones financieras. Diferenciá dato, control y limitación.',
          },
          {
            role: 'user',
            content: `${topic}\nIndicadores agregados verificados:\n${serializedFacts}`,
          },
        ],
        max_tokens: maxTokens,
        temperature: 0.2,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      return providerStatus(response.status === 429 ? 'upstream_rate_limited' : 'unavailable', { model });
    }
    const payload = await response.json();
    const insight = normalizeText(payload?.choices?.[0]?.message?.content, MAX_PROVIDER_OUTPUT_CHARS);
    if (!insight) return providerStatus('invalid_response', { model });
    return providerStatus('used', {
      model,
      insight,
      usage: payload?.usage ? {
        promptTokens: Number(payload.usage.prompt_tokens || 0),
        completionTokens: Number(payload.usage.completion_tokens || 0),
        totalTokens: Number(payload.usage.total_tokens || 0),
      } : null,
      limits: {
        maxCallsPerRequest: 1,
        maxOutputTokens: maxTokens,
        timeoutMs,
        runtimeCallsPerWindow: quota.limit,
        runtimeWindowSeconds: Math.round(quota.windowMs / 1000),
      },
    });
  } catch (error) {
    return providerStatus(error?.name === 'AbortError' ? 'timeout' : 'unavailable', { model });
  } finally {
    clearTimeout(timeout);
  }
}

function capabilitiesPayload() {
  return {
    ok: true,
    authenticated: true,
    capabilities: [
      { intent: 'workforce_summary', externalEnhancement: true },
      { intent: 'payroll_control', externalEnhancement: true },
      { intent: 'integration_quality', externalEnhancement: true },
      { intent: 'employee_search', externalEnhancement: false },
      { intent: 'employee_detail', externalEnhancement: false },
      { intent: 'executive_analysis', externalEnhancement: true },
    ],
    privacy: {
      nominalQueries: 'local_database_only',
      externalProvider: 'aggregate_verified_facts_only',
      rawUserMessageSentExternally: false,
    },
  };
}

export function createInternalAssistantHandler(dependencies = {}) {
  const getSql = dependencies.getInternalSql ?? getInternalSql;
  const requireSession = dependencies.requireInternalSession ?? requireInternalSession;
  const loadIntegration = dependencies.integrationQuality ?? integrationQuality;
  const loadPayroll = dependencies.payrollControl ?? payrollControl;
  const searchEmployees = dependencies.employees ?? employees;
  const loadEmployee = dependencies.employee ?? employee;
  const loadScope = dependencies.canonicalScope ?? canonicalScope;
  const fetchImpl = dependencies.fetch ?? globalThis.fetch;
  const env = dependencies.env ?? process.env;
  const now = dependencies.now ?? Date.now;
  const quotaStore = dependencies.quotaStore ?? quotaByRuntime;

  return async function handler(req, res) {
    const method = String(req.method || 'GET').toUpperCase();
    if (!['GET', 'POST'].includes(method)) {
      res.setHeader('Allow', 'GET, POST');
      return send(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Método no permitido' });
    }

    const session = requireSession(req, res);
    if (!session) return;
    if (method === 'GET') return send(res, 200, capabilitiesPayload());

    if (!requestContentType(req).toLowerCase().includes('application/json')) {
      return send(res, 415, { ok: false, code: 'JSON_REQUIRED', error: 'Se requiere application/json' });
    }

    try {
      const body = await readJsonBody(req);
      const message = normalizeText(body.message);
      if (!message && !body.intent && !body.search && !body.contractId && !body.legajo) {
        return send(res, 400, { ok: false, code: 'ASSISTANT_QUERY_REQUIRED', error: 'Escribí una consulta para el asistente' });
      }
      const intent = classifyAssistantRequest(body);
      const sql = await getSql();
      let result;

      if (intent === 'workforce_summary') {
        const [integration, scope] = await Promise.all([loadIntegration(sql), loadScope(sql)]);
        result = workforceResult(integration, scope);
      } else if (intent === 'payroll_control') {
        result = payrollResult(await loadPayroll(sql));
      } else if (intent === 'integration_quality') {
        const [integration, scope] = await Promise.all([loadIntegration(sql), loadScope(sql)]);
        result = integrationResult(integration, scope);
      } else if (intent === 'employee_search') {
        const search = normalizeText(body.search, MAX_SEARCH_LENGTH) || extractEmployeeSearch(message);
        const request = {
          query: {
            search,
            page: String(boundedInteger(body.page, 1, 1, 100_000)),
            limit: String(boundedInteger(body.limit, 10, 1, 10)),
            status: normalizeText(body.status, 32) || 'all',
            crosswalk: normalizeText(body.crosswalk, 32) || 'all',
            includeFacets: '0',
          },
        };
        const [directory, scope] = await Promise.all([searchEmployees(sql, request), loadScope(sql)]);
        result = employeeSearchResult(directory, scope);
      } else if (intent === 'employee_detail') {
        const contractId = normalizeText(body.contractId, 64);
        const legajo = normalizeText(body.legajo, 64) || extractLegajo(message);
        const companyId = normalizeText(body.companyId, 32) || extractCompanyId(message);
        if (!contractId && !legajo) {
          return send(res, 400, {
            ok: false,
            code: 'EMPLOYEE_IDENTIFIER_REQUIRED',
            error: 'Indicá contractId o legajo para abrir una ficha; para nombres usá employee_search.',
          });
        }
        const [detail, scope] = await Promise.all([
          loadEmployee(sql, { query: { contractId, legajo, companyId } }),
          loadScope(sql),
        ]);
        result = employeeDetailResult(detail, scope);
      } else if (intent === 'executive_analysis') {
        const [integration, payroll, scope] = await Promise.all([
          loadIntegration(sql),
          loadPayroll(sql),
          loadScope(sql),
        ]);
        result = executiveResult(integration, payroll, scope);
      } else {
        result = {
          answer: 'Puedo consultar dotación, brecha 882/854, nómina cerrada y abierta, integración GRH–PERSONAS, buscar empleados y abrir fichas internas. Para una ficha por nombre usá “buscar” y para una ficha exacta indicá el legajo.',
          data: { capabilities: capabilitiesPayload().capabilities },
          asOf: null,
          sources: [{ system: 'MUNICONTROL', relation: 'assistant_capabilities', authority: 'product_contract' }],
        };
      }

      if (result.status && result.status !== 200) {
        return send(res, result.status, {
          ok: false,
          intent,
          answer: result.answer,
          data: result.data,
          sources: result.sources,
          asOf: result.asOf,
          privacy: { nominalDataExternalized: false },
        });
      }

      const provider = body.enhance === true
        ? await generateAggregateInsight({ intent, data: result.data, session, env, fetchImpl, now, quotaStore })
        : providerStatus('not_requested');
      return send(res, 200, {
        ok: true,
        intent,
        mode: provider.externalProviderUsed ? 'hybrid' : 'deterministic',
        topic: intent,
        answer: result.answer,
        insight: provider.insight || null,
        data: result.data,
        sources: result.sources.map((source) => ({ ...source, asOf: result.asOf })),
        asOf: result.asOf,
        privacy: {
          internalSessionRequired: true,
          nominalDataExternalized: false,
          rawUserMessageSentExternally: false,
          nominalQueries: ['employee_search', 'employee_detail'].includes(intent) ? 'local_database_only' : null,
        },
        provider,
      });
    } catch (error) {
      if (error instanceof SyntaxError) {
        return send(res, 400, { ok: false, code: 'INVALID_JSON', error: 'JSON inválido' });
      }
      if (error instanceof RangeError && error.message === 'request_body_too_large') {
        return send(res, 413, { ok: false, code: 'BODY_TOO_LARGE', error: 'Solicitud demasiado grande' });
      }
      if (error instanceof TypeError && error.message === 'request_body_invalid') {
        return send(res, 400, { ok: false, code: 'INVALID_BODY', error: 'El cuerpo debe ser un objeto JSON' });
      }
      console.error('[internal-assistant]', error instanceof Error ? error.message : 'error desconocido');
      return send(res, 503, {
        ok: false,
        code: 'INTERNAL_ASSISTANT_DATA_UNAVAILABLE',
        error: 'No se pudieron consultar los datos internos en este momento.',
      });
    }
  };
}

export default createInternalAssistantHandler();
