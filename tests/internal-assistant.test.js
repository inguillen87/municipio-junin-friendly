import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyAssistantRequest,
  createInternalAssistantHandler,
  getAssistantGuidanceCatalog,
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
const absence = {
  status: 200,
  payload: {
    ok: true,
    data: {
      summary: { events: 1559, affectedContracts: 590, sourceDeclaredDays: 17400 },
      reasons: [
        { code: '01', label: 'Licencia anual ordinaria', events: 583, affectedContracts: 411, sourceDeclaredDays: 8930 },
        { code: '07', label: 'Enfermedad', events: 314, affectedContracts: 205, sourceDeclaredDays: 2110 },
      ],
      sectors: [
        { label: 'Servicios públicos', events: 298, affectedContracts: 133, sourceDeclaredDays: 2400 },
        { label: 'Administración', events: 265, affectedContracts: 121, sourceDeclaredDays: 1980 },
      ],
      comparison: {
        available: true,
        basis: 'previous_year_same_calendar_window',
        current: { range: { from: '2026-01-01', to: '2026-08-06' }, events: 1559, affectedContracts: 590, sourceDeclaredDays: 17400 },
        previous: { range: { from: '2025-01-01', to: '2025-08-06' }, events: 1331, affectedContracts: 567, sourceDeclaredDays: 16567 },
        changePercent: { events: 17.1, affectedContracts: 4.1, sourceDeclaredDays: 5 },
      },
    },
    range: {
      requested: { from: '2026-01-01', to: '2026-08-06' },
      effective: { from: '2026-01-01', to: '2026-08-06' },
      clamped: { from: false, to: false },
    },
    quality: {
      sourceCutoff: '2026-08-06',
      unitSemantics: 'Días declarados por GRH (DIAS_24); no equivalen a jornadas perdidas, duración ni tasa de ausentismo.',
      sectorSemantics: 'Sector actual observado al corte; no reconstruye la asignación histórica del evento.',
    },
    meta: {
      authority: 'GRH',
      grain: 'absence_event',
      ratesAvailable: false,
      sectorSemantics: 'Sector actual observado al corte; no reconstruye la asignación histórica del evento.',
    },
  },
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
    getInternalSql: overrides.getInternalSql || (async () => ({ query: async () => [] })),
    integrationQuality: async () => integration,
    payrollControl: async () => payroll,
    absenceAnalytics: overrides.absenceAnalytics || (async () => absence),
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
  assert.equal(classifyAssistantRequest({ message: 'Analizá los eventos administrativos de ausencia del último período' }), 'absence_analysis');
  assert.equal(classifyAssistantRequest({ message: 'Buscar empleado con ausencias' }), 'employee_search');
  assert.equal(classifyAssistantRequest({ intent: 'absence_analysis' }), 'absence_analysis');
  assert.equal(classifyAssistantRequest({ search: 'Pérez' }), 'employee_search');
  assert.equal(classifyAssistantRequest({ legajo: '42' }), 'employee_detail');
});

test('clasifica onboarding, explicación, recorridos y glosario antes que los dominios de datos', () => {
  assert.equal(classifyAssistantRequest({ message: '¿Dónde encuentro Calidad?' }), 'help_navigation');
  assert.equal(classifyAssistantRequest({ message: '¿Qué hace la sección Nómina?' }), 'section_explanation');
  assert.equal(classifyAssistantRequest({ message: '¿Cómo hago para buscar un empleado?' }), 'task_guidance');
  assert.equal(classifyAssistantRequest({ message: '¿Cómo reviso la nómina?' }), 'task_guidance');
  assert.equal(classifyAssistantRequest({ message: '¿Cómo usar el asistente?' }), 'task_guidance');
  assert.equal(classifyAssistantRequest({ message: '¿Cómo revisar ausentismo?' }), 'task_guidance');
  assert.equal(classifyAssistantRequest({ message: '¿Qué significa activo liquidable?' }), 'glossary');
  assert.equal(classifyAssistantRequest({ section: 'Estructura' }), 'section_explanation');
  assert.equal(classifyAssistantRequest({ task: 'revisar crosswalk' }), 'task_guidance');
  assert.equal(classifyAssistantRequest({ term: 'GRH' }), 'glossary');
});

test('catálogo de ayuda expone las diez secciones reales y rutas existentes', () => {
  const catalog = getAssistantGuidanceCatalog();
  assert.equal(catalog.asOf, '2026-08-13T00:00:00.000Z');
  assert.deepEqual(catalog.sections.map((section) => section.label), [
    'Inicio', 'Personas', 'Estructura', 'Integración', 'Nómina', 'Asistente', 'Ausentismo', 'Calidad', 'Reportes', 'Ayuda',
  ]);
  assert.equal(catalog.sections.find((section) => section.id === 'inicio').targetPath, '/internal-dashboard#inicio');
  assert.equal(catalog.sections.find((section) => section.id === 'personas').targetPath, '/internal-dashboard#legajos');
  assert.equal(catalog.sections.find((section) => section.id === 'estructura').targetPath, '/estructura');
  assert.equal(catalog.sections.find((section) => section.id === 'integracion').targetPath, '/integracion-datos');
  assert.equal(catalog.sections.find((section) => section.id === 'nomina').targetPath, '/nomina-control');
  assert.equal(catalog.sections.find((section) => section.id === 'ausentismo').targetPath, '/ausentismo-control');
  assert.equal(catalog.sections.find((section) => section.id === 'calidad').targetPath, '/calidad-datos');
  assert.equal(catalog.sections.find((section) => section.id === 'reportes').targetPath, '/reportes-rrhh');
  assert.equal(catalog.sections.find((section) => section.id === 'ayuda').targetPath, '/centro-ayuda');
  assert.equal(catalog.sections.every((section) => !('aliases' in section)), true);
  assert.equal(catalog.tasks.length, 9);
  assert.ok(catalog.glossary.length >= 9);
});

test('ayuda de navegación funciona sin consultar Neon y devuelve contrato trazable', async () => {
  let fetchCalls = 0;
  const res = await post(
    { message: '¿Dónde encuentro Calidad?', enhance: true },
    {
      getInternalSql: async () => { throw new Error('la guía no debe depender de Neon'); },
      env: { HF_TOKEN: 'hf_test' },
      fetch: async () => { fetchCalls += 1; throw new Error('la guía no debe salir a HF'); },
    },
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.intent, 'help_navigation');
  assert.equal(res.payload.targetPath, '/calidad-datos');
  assert.equal(res.payload.data.section.label, 'Calidad');
  assert.ok(res.payload.steps.length >= 3);
  assert.equal(res.payload.sources[0].system, 'MUNICONTROL');
  assert.equal(res.payload.sources[0].relation, 'section_catalog');
  assert.equal(res.payload.sources[0].asOf, '2026-08-13T00:00:00.000Z');
  assert.equal(res.payload.asOf, '2026-08-13T00:00:00.000Z');
  assert.equal(res.payload.privacy.guidanceContent, 'verified_product_catalog_only');
  assert.equal(res.payload.privacy.nominalDataExternalized, false);
  assert.equal(res.payload.provider.status, 'not_allowed_for_product_guidance');
  assert.equal(fetchCalls, 0);

  const absence = await post(
    { message: '¿Dónde encuentro Ausentismo?' },
    { getInternalSql: async () => { throw new Error('la navegación no debe consultar Neon'); } },
  );
  assert.equal(absence.payload.intent, 'help_navigation');
  assert.equal(absence.payload.targetPath, '/ausentismo-control');
  assert.equal(absence.payload.data.section.label, 'Ausentismo');
});

test('explica cada sección sin prometer edición, autorización o permisos', async () => {
  const res = await post({ message: '¿Qué hace la sección Nómina?' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.intent, 'section_explanation');
  assert.equal(res.payload.targetPath, '/nomina-control');
  assert.equal(res.payload.data.section.label, 'Nómina');
  assert.match(res.payload.answer, /corridas cerradas y abiertas/i);
  assert.match(res.payload.answer, /no publica como KPI financiero una corrida abierta/i);
  assert.doesNotMatch(res.payload.answer, /podés (?:aprobar|editar|autorizar|liquidar)/i);
  assert.deepEqual(res.payload.relatedSections.map((section) => section.id), ['nomina', 'ayuda']);
});

test('guía tareas con pasos y destino sin ejecutar cambios administrativos', async () => {
  const search = await post({ message: '¿Cómo hago para buscar un empleado?' });
  assert.equal(search.statusCode, 200);
  assert.equal(search.payload.intent, 'task_guidance');
  assert.equal(search.payload.data.task.id, 'buscar_empleado');
  assert.equal(search.payload.targetPath, '/internal-dashboard#legajos');
  assert.equal(search.payload.steps.length, 4);
  assert.match(search.payload.steps[1], /apellido, número de legajo o documento/i);
  assert.match(search.payload.answer, /no ejecuta cambios administrativos/i);

  const integrationHelp = await post({ intent: 'task_guidance', task: 'revisar crosswalk' });
  assert.equal(integrationHelp.payload.data.task.id, 'revisar_integracion');
  assert.equal(integrationHelp.payload.targetPath, '/integracion-datos');
  assert.match(integrationHelp.payload.steps.at(-1), /GRH conserva la autoridad laboral/i);

  const payrollHelp = await post({ message: '¿Cómo reviso la nómina?' });
  assert.equal(payrollHelp.payload.data.task.id, 'controlar_nomina');
  assert.equal(payrollHelp.payload.targetPath, '/nomina-control');

  const absenceHelp = await post({ message: '¿Cómo revisar ausentismo?' });
  assert.equal(absenceHelp.payload.data.task.id, 'revisar_ausentismo');
  assert.equal(absenceHelp.payload.targetPath, '/ausentismo-control');
  assert.match(absenceHelp.payload.steps.at(-1), /No conviertas los valores en jornadas perdidas, productividad ni tasa/i);
});

test('glosario define términos sensibles con límites y secciones relacionadas', async () => {
  const liquidable = await post({ message: '¿Qué significa activo liquidable?' });
  assert.equal(liquidable.statusCode, 200);
  assert.equal(liquidable.payload.intent, 'glossary');
  assert.equal(liquidable.payload.data.term.id, 'activo_liquidable');
  assert.match(liquidable.payload.answer, /no es sinónimo automático de activo administrativo/i);
  assert.equal(liquidable.payload.targetPath, '/nomina-control');
  assert.deepEqual(liquidable.payload.relatedSections.map((section) => section.id), ['nomina', 'integracion']);

  const personas = await post({ intent: 'glossary', term: 'PERSONAS' });
  assert.equal(personas.payload.data.term.id, 'personas_auxiliar');
  assert.match(personas.payload.answer, /No reemplaza GRH/i);
});

test('ayuda general ofrece onboarding completo y GET anuncia las capacidades nuevas', async () => {
  const help = await post({ message: 'Soy nuevo, necesito ayuda para empezar' });
  assert.equal(help.statusCode, 200);
  assert.equal(help.payload.intent, 'help_navigation');
  assert.equal(help.payload.data.sections.length, 10);
  assert.equal(help.payload.relatedSections.length, 10);
  assert.equal(help.payload.targetPath, '/centro-ayuda');

  const res = responseRecorder();
  await handler()({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 200);
  for (const intent of ['help_navigation', 'section_explanation', 'task_guidance', 'glossary']) {
    assert.ok(res.payload.capabilities.some((capability) => capability.intent === intent));
  }
  assert.deepEqual(
    res.payload.capabilities.find((capability) => capability.intent === 'absence_analysis'),
    { intent: 'absence_analysis', externalEnhancement: true },
  );
  assert.equal(res.payload.guidance.sections.length, 10);
  assert.equal(res.payload.guidance.policy, 'verified_product_catalog_only');
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

test('ausentismo responde sólo con agregados GRH, rango comparable y límites metodológicos', async () => {
  let query;
  const res = await post(
    {
      intent: 'absence_analysis',
      from: '2026-01-01',
      to: '2026-08-06',
      sector: 'Servicios públicos',
      reasonCode: '01',
      bucket: 'month',
    },
    {
      absenceAnalytics: async (_sql, req) => {
        query = req.query;
        return absence;
      },
    },
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.intent, 'absence_analysis');
  assert.deepEqual(query, {
    from: '2026-01-01',
    to: '2026-08-06',
    sector: 'Servicios públicos',
    reasonCode: '01',
    bucket: 'month',
  });
  assert.deepEqual(res.payload.data.summary, { events: 1559, affectedContracts: 590, sourceDeclaredDays: 17400 });
  assert.equal(res.payload.data.comparison.changePercent.events, 17.1);
  assert.equal(res.payload.data.topReasons[0].label, 'Licencia anual ordinaria');
  assert.equal(res.payload.data.topSectors[0].label, 'Servicios públicos');
  assert.equal(res.payload.data.methodology.ratesAvailable, false);
  assert.match(res.payload.data.methodology.sectorSemantics, /sector actual.*histórica/i);
  assert.equal('rows' in res.payload.data, false);
  assert.equal(res.payload.targetPath, '/ausentismo-control');
  assert.match(res.payload.answer, /1\.559 eventos administrativos/i);
  assert.match(res.payload.answer, /no constituyen una tasa de ausentismo, presentismo, productividad ni jornadas perdidas/i);
  assert.equal(res.payload.sources[0].relation, 'grh_absences');
  assert.equal(res.payload.provider.status, 'not_requested');
});

test('ausentismo delega el período predeterminado al corte autoritativo de su propia fuente', async () => {
  let query;
  const res = await post(
    { message: '¿Cómo viene el ausentismo?' },
    { absenceAnalytics: async (_sql, req) => { query = req.query; return absence; } },
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.intent, 'absence_analysis');
  assert.equal(query.from, '');
  assert.equal(query.to, '');
});

test('el proveedor externo de ausentismo recibe rankings agregados y nunca filas nominales', async () => {
  let providerBody;
  const payloadWithNominalTrap = JSON.parse(JSON.stringify(absence));
  payloadWithNominalTrap.payload.data.rows = [{ nombre: 'PERSONA LOCAL', legajo: '42', dni: '00000000', contractId: 'contract-1' }];
  payloadWithNominalTrap.payload.data.reasons.push({
    label: 'Motivo recurrente de cohorte unitaria',
    events: 10,
    affectedContracts: 1,
    sourceDeclaredDays: 10,
  });
  payloadWithNominalTrap.payload.data.comparison.previous.affectedContracts = 1;
  const res = await post(
    { intent: 'absence_analysis', enhance: true },
    {
      absenceAnalytics: async () => payloadWithNominalTrap,
      env: { HF_TOKEN: 'hf_test' },
      fetch: async (_url, options) => {
        providerBody = JSON.parse(options.body);
        return { ok: true, async json() { return { choices: [{ message: { content: 'Lectura agregada de ausentismo.' } }] }; } };
      },
    },
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.provider.status, 'used');
  assert.equal(res.payload.provider.nominalDataSent, false);
  assert.equal('rows' in res.payload.data, false);
  const serialized = JSON.stringify(providerBody);
  assert.match(serialized, /topReasons/);
  assert.match(serialized, /topSectors/);
  assert.match(serialized, /Sector actual observado al corte/);
  assert.doesNotMatch(serialized, /PERSONA LOCAL|00000000|legajo|contractId|sourceId/i);
  assert.doesNotMatch(serialized, /Motivo recurrente de cohorte unitaria/i);
  assert.match(providerBody.messages[1].content, /"comparison":\{"available":false/);
  assert.doesNotMatch(providerBody.messages[1].content, /absence_analysis/i, 'no debe enviar la intención cruda como sustituto de hechos');
  assert.equal(res.payload.privacy.rawUserMessageSentExternally, false);
});

test('ausentismo no externaliza cohortes menores a cinco contratos', async () => {
  let fetchCalls = 0;
  const smallCohort = JSON.parse(JSON.stringify(absence));
  smallCohort.payload.data.summary = { events: 1, affectedContracts: 1, sourceDeclaredDays: 1 };
  smallCohort.payload.data.reasons = [{ label: 'Motivo sensible', events: 1, affectedContracts: 1, sourceDeclaredDays: 1 }];
  smallCohort.payload.data.sectors = [{ label: 'Sector pequeño', events: 1, affectedContracts: 1, sourceDeclaredDays: 1 }];

  const res = await post(
    { intent: 'absence_analysis', enhance: true, sector: 'Sector pequeño' },
    {
      absenceAnalytics: async () => smallCohort,
      env: { HF_TOKEN: 'hf_test' },
      fetch: async () => { fetchCalls += 1; throw new Error('no debe llamar al proveedor'); },
    },
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.data.summary.affectedContracts, 1, 'la respuesta interna conserva el hecho autorizado');
  assert.equal(res.payload.provider.status, 'suppressed_small_cohort');
  assert.equal(res.payload.provider.minimumAffectedContracts, 5);
  assert.equal(res.payload.provider.externalProviderAttempted, false);
  assert.equal(fetchCalls, 0);
});

test('el análisis ejecutivo incluye ausentismo agregado y excluye cualquier fila nominal del proveedor', async () => {
  let providerBody;
  let absenceQuery;
  const payloadWithNominalTrap = JSON.parse(JSON.stringify(absence));
  payloadWithNominalTrap.payload.data.rows = [{ nombre: 'PERSONA EJECUTIVA', legajo: '999', cuil: '20000000001', contractId: 'contract-secret' }];
  const res = await post(
    { intent: 'executive_analysis', enhance: true },
    {
      absenceAnalytics: async (_sql, req) => {
        absenceQuery = req.query;
        return payloadWithNominalTrap;
      },
      env: { HF_TOKEN: 'hf_test' },
      fetch: async (_url, options) => {
        providerBody = JSON.parse(options.body);
        return { ok: true, async json() { return { choices: [{ message: { content: 'Lectura ejecutiva agregada.' } }] }; } };
      },
    },
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.intent, 'executive_analysis');
  assert.deepEqual(absenceQuery, { from: '', to: '', sector: '', reasonCode: '', bucket: 'month' });
  assert.deepEqual(res.payload.data.absence.summary, { events: 1559, affectedContracts: 590, sourceDeclaredDays: 17400 });
  assert.equal('rows' in res.payload.data.absence, false);
  assert.match(res.payload.answer, /1\.559 eventos administrativos de ausencia/i);
  assert.match(res.payload.answer, /no constituyen una tasa de ausentismo, presentismo, productividad ni jornadas perdidas/i);
  const serialized = JSON.stringify(providerBody);
  assert.match(providerBody.messages[1].content, /"absence"/);
  assert.match(providerBody.messages[1].content, /"topReasons"/);
  assert.doesNotMatch(serialized, /PERSONA EJECUTIVA|20000000001|legajo|contractId|contract-secret/i);
  assert.equal(res.payload.provider.nominalDataSent, false);
});

test('el análisis ejecutivo tampoco externaliza un filtro de ausentismo con cohorte pequeña', async () => {
  let fetchCalls = 0;
  const smallCohort = JSON.parse(JSON.stringify(absence));
  smallCohort.payload.data.summary = { events: 2, affectedContracts: 1, sourceDeclaredDays: 2 };
  smallCohort.payload.data.reasons = [{ label: 'Motivo sensible', events: 2, affectedContracts: 1, sourceDeclaredDays: 2 }];
  smallCohort.payload.data.sectors = [{ label: 'Sector pequeño', events: 2, affectedContracts: 1, sourceDeclaredDays: 2 }];

  const res = await post(
    { intent: 'executive_analysis', enhance: true, sector: 'Sector pequeño' },
    {
      absenceAnalytics: async () => smallCohort,
      env: { HF_TOKEN: 'hf_test' },
      fetch: async () => { fetchCalls += 1; throw new Error('no debe llamar al proveedor'); },
    },
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.data.absence.summary.affectedContracts, 1);
  assert.equal(res.payload.provider.status, 'suppressed_small_cohort');
  assert.equal(res.payload.provider.externalProviderAttempted, false);
  assert.equal(fetchCalls, 0);
});

test('el análisis ejecutivo declara resultado parcial cuando ausentismo no está disponible', async () => {
  let fetchCalls = 0;
  const res = await post(
    { intent: 'executive_analysis', enhance: true },
    {
      absenceAnalytics: async () => ({
        status: 503,
        payload: {
          ok: false,
          code: 'ABSENCE_SOURCE_UNAVAILABLE',
          error: 'No se pudo consultar ausentismo.',
        },
      }),
      env: { HF_TOKEN: 'hf_test' },
      fetch: async () => { fetchCalls += 1; throw new Error('no debe externalizar un bloque incompleto'); },
    },
  );

  assert.equal(res.statusCode, 200, 'los demás dominios ejecutivos siguen disponibles');
  assert.equal(res.payload.ok, true);
  assert.equal(res.payload.data.partial, true);
  assert.deepEqual(res.payload.data.errors, [{
    domain: 'absence',
    status: 503,
    code: 'ABSENCE_SOURCE_UNAVAILABLE',
  }]);
  assert.deepEqual(res.payload.data.absence, { code: 'ABSENCE_SOURCE_UNAVAILABLE' });
  assert.match(res.payload.answer, /lectura ejecutiva es parcial/i);
  assert.equal(res.payload.provider.status, 'suppressed_small_cohort');
  assert.equal(res.payload.provider.externalProviderAttempted, false);
  assert.equal(fetchCalls, 0);
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
  assert.match(html, /intent === 'absence_analysis'/);
  assert.match(html, /intent === 'executive_analysis'/);
  assert.match(html, /data\.absence/);
  assert.match(html, /Días declarados en GRH \(no jornadas perdidas\)/);
});
