import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyAssistantRequest,
  createInternalAssistantHandler,
  getAssistantGuidanceCatalog,
  planAssistantRequest,
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
const quality = {
  status: 200,
  payload: {
    ok: true,
    data: {
      issues: {
        total: 37,
        open: 30,
        byResolution: { open: 30, accepted: 2, corrected: 4, rejected: 1 },
        bySeverity: { critical: 1, error: 8, warning: 24, info: 4 },
        distinctCodes: 6,
        distinctEntities: 3,
      },
      domains: {
        payrollCoherence: { registeredIssues: 5, openIssues: 4, status: 'needs_review' },
        identityCuil: { registeredIssues: 21, openIssues: 19, status: 'needs_review' },
        dates: { registeredIssues: 11, openIssues: 7, status: 'needs_review' },
      },
      crosswalk: {
        total: 2349, matched: 1699, ambiguous: 157, unmatched: 493, rejected: 0, reconciled: true,
      },
      reconciliation: {
        severityTotal: 37,
        domainTotal: 37,
        totalMatchesSeverity: true,
        totalMatchesDomains: true,
        openEqualsTotal: false,
      },
      breakdowns: {
        sources: [
          { source: 'GRH', registeredIssues: 37, openIssues: 30, trackingStatus: 'materialized' },
          { source: 'PERSONAS', registeredIssues: 0, openIssues: 0, trackingStatus: 'controls_not_materialized' },
        ],
      },
    },
    meta: {
      authority: { labor: 'GRH', identityAuxiliary: 'PERSONAS' },
      metric: 'registered_quality_issues',
      crosswalkMetric: 'crosswalk_decisions',
      containsPersonalData: false,
      mutationAllowed: false,
      zeroTrackedIssuesDoesNotMeanClean: true,
    },
  },
};

const attendanceStatus = {
  status: 'ready',
  reportedInventory: {
    source: {
      kind: 'municipal_workbook',
      status: 'reported_inventory',
      recordCount: 13,
      mappingVersion: 'junin-attendance-workbook-a4-k17.v1',
    },
    physicalConnectionConfirmed: false,
    heatMetric: 'reported_site_density',
    data: Array.from({ length: 13 }, (_item, index) => ({
      code: `PM-${String(index + 1).padStart(2, '0')}`,
      name: `Punto ${index + 1}`,
      latitude: -33.14 - (index / 10_000),
      longitude: -68.48 - (index / 10_000),
      channel: index < 7 ? 'network_pull' : 'removable_media',
    })),
  },
  bootstrap: {
    summary: {
      siteCount: 2,
      deviceCount: 2,
      connectorCount: 2,
      activeConnectorCount: 1,
      rawEventCount: 24,
      punchCount: 20,
      unmatchedPunchCount: 3,
      pendingReviewCount: 2,
    },
    features: {
      hardwareConnected: false,
      hoursCalculated: false,
      payrollPosted: false,
      biometricTemplatesStored: false,
    },
  },
  gateway: { available: true, unavailableCode: null },
};

const TEST_IDENTITY_CAPABILITIES = Object.freeze([
  'assistant.use',
  'workforce.summary.read',
  'workforce.structure.read',
  'workforce.employee.read',
  'payroll.read',
  'absence.analytics.read',
  'absence.nominal.read',
  'leave.policy.read',
  'leave.preview.read',
  'management.analytics.read',
  'quality.read',
  'lineage.read',
  'budget.approved.read',
  'attendance.read',
]);

const TEST_EXTERNAL_ENV = Object.freeze({
  AI_ASSISTANT_EXTERNAL_ENRICHMENT_ENABLED: 'true',
  AI_ASSISTANT_DURABLE_QUOTA_CERTIFIED: 'true',
  AI_ASSISTANT_QUOTA_PEPPER: 'assistant-test-quota-pepper-32-bytes-minimum',
});

function managedAccess() {
  return {
    mode: 'managed',
    session: { id: 'session-test', email: 'usuario@example.invalid' },
    principal: {
      user: { email: 'usuario@example.invalid' },
      tenant: {
        id: '00000000-0000-4000-8000-000000000101',
        effectiveCapabilities: [...TEST_IDENTITY_CAPABILITIES],
      },
    },
  };
}

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
    requireCompatibleInternalAccess: overrides.requireCompatibleInternalAccess || (async () => managedAccess()),
    getInternalSql: overrides.getInternalSql || (async () => ({ query: async () => [] })),
    getTenantIdentitySql: overrides.getTenantIdentitySql || (async () => ({ query: async () => [] })),
    takeIdentityRateLimit: overrides.takeIdentityRateLimit || (async () => ({ allowed: true, remaining: 10 })),
    integrationQuality: overrides.integrationQuality || (async () => integration),
    payrollControl: async () => payroll,
    absenceAnalytics: overrides.absenceAnalytics || (async () => absence),
    leaveNormative: overrides.leaveNormative,
    qualityOverview: overrides.qualityOverview || overrides.qualityoverview || (async () => quality),
    summary: overrides.summary,
    structure: overrides.structure,
    absenceEvents: overrides.absenceEvents || overrides.absenceevents,
    qualityIssues: overrides.qualityIssues || overrides.qualityissues,
    importLineage: overrides.importLineage || overrides.importlineage,
    attendanceStatus: overrides.attendanceStatus || (async () => attendanceStatus),
    resolveAbsenceReason: overrides.resolveAbsenceReason,
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
    env: { ...TEST_EXTERNAL_ENV, ...(overrides.env || {}) },
    now: overrides.now || (() => Date.parse('2026-08-13T20:00:00Z')),
    quotaStore: overrides.quotaStore || new Map(),
    logger: overrides.logger || { info() {} },
    requestIdFactory: overrides.requestIdFactory || (() => 'request-test-id'),
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
  assert.equal(classifyAssistantRequest({ message: '¿Cuántas personas activas informa el corte GRH y cuál es la fecha de ese corte?' }), 'workforce_summary');
  assert.equal(classifyAssistantRequest({ message: '¿Cuántas personas activas tienen coincidencia confirmada en el crosswalk?' }), 'integration_quality');
  assert.equal(classifyAssistantRequest({ message: '¿La nómina de agosto está cerrada?' }), 'payroll_control');
  assert.equal(classifyAssistantRequest({ message: '¿Cómo viene el crosswalk con PERSONAS?' }), 'integration_quality');
  assert.equal(classifyAssistantRequest({ message: 'Analizá la calidad operativa por severidad' }), 'quality_analysis');
  assert.equal(classifyAssistantRequest({ intent: 'quality_analysis' }), 'quality_analysis');
  assert.equal(classifyAssistantRequest({ message: 'Analizá los eventos administrativos de ausencia del último período' }), 'absence_analysis');
  assert.equal(classifyAssistantRequest({ message: 'Buscar empleado con ausencias' }), 'employee_search');
  assert.equal(classifyAssistantRequest({ message: 'licnecias de nombre de prueba' }), 'employee_search');
  assert.equal(classifyAssistantRequest({ message: 'licencias de Nombre de Prueba' }), 'employee_search');
  assert.equal(classifyAssistantRequest({ message: 'Mostrame las licencias de Nombre de Prueba' }), 'employee_search');
  assert.equal(classifyAssistantRequest({ message: 'licencias actuales de Nombre de Prueba' }), 'employee_search');
  assert.equal(classifyAssistantRequest({ message: 'licencias que tiene Nombre de Prueba' }), 'employee_search');
  assert.equal(classifyAssistantRequest({ message: 'licencias de la persona Nombre de Prueba' }), 'employee_search');
  assert.equal(classifyAssistantRequest({ message: 'ausencias de Nombre de Prueba en 2026' }), 'employee_search');
  assert.equal(classifyAssistantRequest({ message: 'ausentismo de Nombre de Prueba' }), 'employee_search');
  assert.equal(classifyAssistantRequest({ message: 'licencias por sector en 2026' }), 'absence_analysis');
  assert.equal(classifyAssistantRequest({ message: 'licencias de agosto' }), 'absence_analysis');
  assert.equal(classifyAssistantRequest({ message: 'licencias de julio 2026' }), 'absence_analysis');
  assert.equal(classifyAssistantRequest({ message: 'licencias de Julio Ramírez' }), 'employee_search');
  assert.equal(classifyAssistantRequest({ message: 'licencias de Abril González' }), 'employee_search');
  assert.equal(classifyAssistantRequest({ message: 'Ver licencias del legajo 42, empresa 1.' }), 'employee_detail');
  assert.equal(classifyAssistantRequest({ message: 'Ver licencias del legajo 2009, empresa 1.' }), 'employee_detail');
  assert.equal(classifyAssistantRequest({ message: 'Prepará una lectura ejecutiva de dotación, nómina, integración, ausentismo y calidad' }), 'executive_analysis');
  assert.equal(classifyAssistantRequest({ message: '¿Qué relojes están conectados ahora?' }), 'attendance_status');
  assert.equal(classifyAssistantRequest({ message: '¿Cuántas marcaciones recibimos hoy?' }), 'attendance_status');
  assert.equal(classifyAssistantRequest({ message: '¿Dónde están los relojes que tenemos?' }), 'attendance_status');
  assert.equal(classifyAssistantRequest({ message: '¿Cuál es el clima de Junín mañana?' }), 'out_of_scope');
  assert.equal(classifyAssistantRequest({ intent: 'absence_analysis' }), 'absence_analysis');
  assert.equal(classifyAssistantRequest({ search: 'Pérez' }), 'employee_search');
  assert.equal(classifyAssistantRequest({ legajo: '42' }), 'employee_detail');
});

test('relojes y marcaciones usa sólo inventario reportado y bootstrap local con límites explícitos', async () => {
  let externalFetchCalled = false;
  const res = await post({
    message: '¿Cuál es el estado y la cobertura de los relojes y cuántas marcaciones hubo hoy?',
    enhance: true,
  }, {
    fetch: async () => {
      externalFetchCalled = true;
      throw new Error('no debe externalizar relojes o marcaciones');
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.intent, 'attendance_status');
  assert.equal(res.payload.queryPlan.externalPolicy, 'local_only');
  assert.equal(res.payload.privacy.localOnlyResource, true);
  assert.equal(res.payload.provider.externalProviderUsed, false);
  assert.equal(externalFetchCalled, false);
  assert.equal(res.payload.data.coverage.reportedSites, 13);
  assert.equal(res.payload.data.coverage.georeferencedSites, 13);
  assert.equal(res.payload.data.coverage.networkPullReported, 7);
  assert.equal(res.payload.data.coverage.removableMediaReported, 6);
  assert.equal(res.payload.data.coverage.physicalConnectionConfirmedByInventory, false);
  assert.equal(res.payload.data.operational.activeConnectors, 1);
  assert.equal(res.payload.data.operational.canonicalPunches, 20);
  assert.equal(res.payload.data.operational.hardwareConnectionConfirmed, false);
  assert.equal(res.payload.data.operational.temporalWindow, null);
  assert.match(res.payload.answer, /no prueba que los relojes estén conectados/i);
  assert.match(res.payload.answer, /no permiten afirmar cuántas marcaciones hubo hoy/i);
  assert.deepEqual(
    res.payload.sources.map((source) => source.relation),
    ['reported_attendance_inventory', 'attendance_gateway_bootstrap_v1'],
  );
});

test('estado de marcaciones exige assistant.use y attendance.read antes de consultar fuentes', async () => {
  let attendanceCalled = false;
  const access = managedAccess();
  access.principal.tenant.effectiveCapabilities = access.principal.tenant.effectiveCapabilities
    .filter((capability) => capability !== 'attendance.read');
  const res = await post({ message: '¿Qué relojes están conectados ahora?' }, {
    requireCompatibleInternalAccess: async () => access,
    attendanceStatus: async () => {
      attendanceCalled = true;
      return attendanceStatus;
    },
  });

  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.intent, 'attendance_status');
  assert.equal(res.payload.code, 'IDENTITY_CAPABILITY_REQUIRED');
  assert.equal(attendanceCalled, false);
});

test('preguntas fuera del alcance reciben respuesta explícita y nunca usan proveedor externo', async () => {
  let externalFetchCalled = false;
  const res = await post({ message: '¿Cuál es el clima de Junín mañana?', enhance: true }, {
    fetch: async () => {
      externalFetchCalled = true;
      throw new Error('no debe llamar un proveedor externo');
    },
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.intent, 'out_of_scope');
  assert.equal(res.payload.data.code, 'ASSISTANT_SCOPE_UNSUPPORTED');
  assert.equal(res.payload.queryPlan.externalPolicy, 'local_only');
  assert.equal(res.payload.provider.externalProviderUsed, false);
  assert.equal(externalFetchCalled, false);
  assert.match(res.payload.answer, /no es de propósito general/i);
  assert.equal(res.payload.data.rawQuestionExternalized, false);
});

test('plan municipal v1 clasifica los cinco recursos nuevos y extrae filtros aplicables', () => {
  const summaryPlan = planAssistantRequest({ message: 'Resumen operativo de GRH' });
  assert.equal(summaryPlan.version, 'municipal_query_plan.v1');
  assert.equal(summaryPlan.intent, 'operational_summary');
  assert.equal(summaryPlan.resource, 'summary');
  assert.deepEqual(summaryPlan.filters, {});
  assert.deepEqual(summaryPlan.rejectedFilters, []);

  const structurePlan = planAssistantRequest({ message: 'Estructura por organización Hacienda' });
  assert.equal(structurePlan.intent, 'structure_analysis');
  assert.equal(structurePlan.resource, 'structure');
  assert.equal(structurePlan.filters.organization, 'Hacienda');

  const roleSingular = planAssistantRequest({ message: 'Mostrame la función Médico Clínico' });
  assert.equal(roleSingular.intent, 'structure_analysis');
  assert.equal(roleSingular.filters.role, 'Médico Clínico');

  const rolePlural = planAssistantRequest({ message: 'Mostrame las funciones Médicas' });
  assert.equal(rolePlural.intent, 'structure_analysis');
  assert.equal(rolePlural.filters.role, 'Médicas');

  const roleCargo = planAssistantRequest({ message: 'Mostrame el cargo Inspector' });
  assert.equal(roleCargo.intent, 'structure_analysis');
  assert.equal(roleCargo.filters.role, 'Inspector');

  const eventPlan = planAssistantRequest({ message: 'Listá ausencias el 2026-07-10 del sector OBRERO motivo 07' });
  assert.equal(eventPlan.intent, 'absence_event_list');
  assert.equal(eventPlan.resource, 'absenceevents');
  assert.equal(eventPlan.filters.from, '2026-07-10');
  assert.equal(eventPlan.filters.to, '2026-07-10');
  assert.equal(eventPlan.filters.sector, 'OBRERO');
  assert.equal(eventPlan.filters.reasonCode, '07');
  assert.equal(eventPlan.externalPolicy, 'local_only');

  const qualityPlan = planAssistantRequest({ message: 'Listá errores abiertos de calidad código CUIL_INVALID' });
  assert.equal(qualityPlan.intent, 'quality_issue_list');
  assert.equal(qualityPlan.resource, 'qualityissues');
  assert.equal(qualityPlan.filters.severity, 'error');
  assert.equal(qualityPlan.filters.resolution, 'open');
  assert.equal(qualityPlan.filters.code, 'CUIL_INVALID');

  const lineagePlan = planAssistantRequest({ message: 'Último lote de importación GRH' });
  assert.equal(lineagePlan.intent, 'import_lineage');
  assert.equal(lineagePlan.resource, 'importlineage');
  assert.equal(lineagePlan.filters.source, 'GRH');
  assert.equal(lineagePlan.filters.batch, 'latest_published');

  const qualityFollowUp = planAssistantRequest({
    message: '¿Y los críticos?',
    history: [{ role: 'assistant', conversationContext: { intent: 'quality_issue_list', domain: 'quality', filters: { source: 'GRH' } } }],
  });
  assert.equal(qualityFollowUp.intent, 'quality_issue_list');
  assert.equal(qualityFollowUp.filters.source, 'GRH');
  assert.equal(qualityFollowUp.filters.severity, 'critical');
  assert.equal(qualityFollowUp.contextUsed.used, true);
});

test('plan de fechas distingue día exacto, desde, hasta y rango', () => {
  const exact = planAssistantRequest({ message: 'Listame eventos de ausencia el 2026-07-10' });
  assert.equal(exact.filters.from, '2026-07-10');
  assert.equal(exact.filters.to, '2026-07-10');

  const since = planAssistantRequest({ message: 'Listame eventos de ausencia desde 2026-07-10' });
  assert.equal(since.filters.from, '2026-07-10');
  assert.equal(since.filters.to, '2026-12-31');

  const until = planAssistantRequest({ message: 'Listame eventos de ausencia hasta 2026-07-10' });
  assert.equal(until.filters.from, '2026-01-01');
  assert.equal(until.filters.to, '2026-07-10');

  const range = planAssistantRequest({ message: 'Listame eventos de ausencia entre 2026-07-10 y 2026-07-15' });
  assert.equal(range.filters.from, '2026-07-10');
  assert.equal(range.filters.to, '2026-07-15');
});

test('follow-ups estructurados cambian de recurso y conservan sólo filtros compatibles', () => {
  const eventSummary = planAssistantRequest({
    message: 'Resumí estos eventos sin datos nominales.',
    history: [{
      role: 'assistant',
      conversationContext: {
        intent: 'absence_event_list',
        domain: 'absence',
        filters: {
          from: '2026-01-15', to: '2026-03-20', sector: 'OBRERO', reasonCode: '07',
        },
      },
    }],
  });
  assert.equal(eventSummary.intent, 'absence_analysis');
  assert.equal(eventSummary.resource, 'absenceanalytics');
  assert.deepEqual(eventSummary.filters, {
    from: '2026-01-15',
    to: '2026-03-20',
    sector: 'OBRERO',
    reasonCode: '07',
    bucket: 'month',
  });
  assert.deepEqual(eventSummary.rejectedFilters, []);
  assert.ok(eventSummary.decisions.includes('converted_nominal_event_list_to_aggregate_summary'));

  const previousPeriod = planAssistantRequest({
    message: '¿Y el mismo período del año anterior?',
    history: [{
      role: 'assistant',
      conversationContext: {
        intent: 'absence_analysis',
        domain: 'absence',
        filters: {
          from: '2024-02-29', to: '2024-03-31', year: 2024, sector: 'OBRERO', bucket: 'month',
        },
      },
    }],
  });
  assert.equal(previousPeriod.intent, 'absence_analysis');
  assert.equal(previousPeriod.filters.from, '2023-02-28');
  assert.equal(previousPeriod.filters.to, '2023-03-31');
  assert.equal(previousPeriod.filters.year, 2023);
  assert.equal(previousPeriod.filters.sector, 'OBRERO');
  assert.ok(previousPeriod.decisions.includes('shifted_context_period_to_previous_calendar_year'));

  const lineage = planAssistantRequest({
    message: 'Mostrame el linaje.',
    history: [{
      role: 'assistant',
      conversationContext: {
        intent: 'quality_issue_list',
        domain: 'quality',
        filters: {
          source: 'GRH', batch: 'latest_published', severity: 'error',
          code: 'DATE_OUT_OF_RANGE', resolution: 'open',
        },
      },
    }],
  });
  assert.equal(lineage.intent, 'import_lineage');
  assert.equal(lineage.resource, 'importlineage');
  assert.deepEqual(lineage.filters, { source: 'GRH', batch: 'latest_published' });
  assert.deepEqual(lineage.rejectedFilters, []);
  assert.ok(lineage.decisions.includes('switched_quality_queue_to_import_lineage'));
  assert.ok(lineage.decisions.includes('dropped_incompatible_context_filter:severity'));
  assert.ok(lineage.decisions.includes('dropped_incompatible_context_filter:code'));
  assert.ok(lineage.decisions.includes('dropped_incompatible_context_filter:resolution'));
  assert.deepEqual(lineage.contextUsed.fields.sort(), ['filters.batch', 'filters.source']);

  const writtenWithoutContext = planAssistantRequest({ message: 'Mostrame el linaje de estos snapshots.' });
  assert.equal(writtenWithoutContext.intent, 'import_lineage');
});

test('clasifica onboarding, explicación, recorridos y glosario antes que los dominios de datos', () => {
  assert.equal(classifyAssistantRequest({ message: '¿Dónde encuentro Calidad?' }), 'help_navigation');
  assert.equal(classifyAssistantRequest({ message: '¿Qué hace la sección Nómina?' }), 'section_explanation');
  assert.equal(classifyAssistantRequest({ message: '¿Cómo hago para buscar un empleado?' }), 'task_guidance');
  assert.equal(classifyAssistantRequest({ message: '¿Cómo reviso la nómina?' }), 'task_guidance');
  assert.equal(classifyAssistantRequest({ message: '¿Cómo descargo el recibo de sueldo?' }), 'task_guidance');
  assert.equal(classifyAssistantRequest({ message: '¿Cómo usar el asistente?' }), 'task_guidance');
  assert.equal(classifyAssistantRequest({ message: '¿Cómo revisar ausentismo?' }), 'task_guidance');
  assert.equal(classifyAssistantRequest({ message: '¿Qué significa activo liquidable?' }), 'glossary');
  assert.equal(classifyAssistantRequest({ section: 'Estructura' }), 'section_explanation');
  assert.equal(classifyAssistantRequest({ task: 'revisar crosswalk' }), 'task_guidance');
  assert.equal(classifyAssistantRequest({ term: 'GRH' }), 'glossary');
});

test('catálogo de ayuda expone las dieciocho secciones reales y rutas existentes', () => {
  const catalog = getAssistantGuidanceCatalog();
  assert.equal(catalog.asOf, '2026-09-04T00:00:00.000Z');
  assert.deepEqual(catalog.sections.map((section) => section.label), [
    'Inicio', 'Personas', 'Centro de acciones', 'Relojes y marcaciones', 'Administración de plataforma', 'Estructura', 'Integración', 'Nómina', 'Recibos y liquidaciones', 'Novedades de nómina', 'Comparar gestiones', 'Presupuesto', 'Asistente', 'Ausentismo', 'Licencias normativas', 'Calidad', 'Reportes', 'Ayuda',
  ]);
  assert.equal(catalog.sections.find((section) => section.id === 'inicio').targetPath, '/internal-dashboard#inicio');
  assert.equal(catalog.sections.find((section) => section.id === 'personas').targetPath, '/internal-dashboard#legajos');
  assert.equal(catalog.sections.find((section) => section.id === 'acciones').targetPath, '/centro-acciones');
  assert.equal(catalog.sections.find((section) => section.id === 'marcaciones').targetPath, '/relojes-marcaciones');
  assert.equal(catalog.sections.find((section) => section.id === 'administracion').targetPath, '/administracion-plataforma');
  assert.equal(catalog.sections.find((section) => section.id === 'estructura').targetPath, '/estructura');
  assert.equal(catalog.sections.find((section) => section.id === 'integracion').targetPath, '/integracion-datos');
  assert.equal(catalog.sections.find((section) => section.id === 'nomina').targetPath, '/nomina-control');
  assert.equal(catalog.sections.find((section) => section.id === 'recibos').targetPath, '/recibos-sueldo');
  assert.equal(catalog.sections.find((section) => section.id === 'novedades').targetPath, '/novedades-nomina');
  assert.equal(catalog.sections.find((section) => section.id === 'gestiones').targetPath, '/gestion-comparativa');
  assert.equal(catalog.sections.find((section) => section.id === 'presupuesto').targetPath, '/presupuesto-control');
  assert.equal(catalog.sections.find((section) => section.id === 'ausentismo').targetPath, '/ausentismo-control');
  assert.equal(catalog.sections.find((section) => section.id === 'licencias').targetPath, '/licencias-control');
  assert.equal(catalog.sections.find((section) => section.id === 'calidad').targetPath, '/calidad-operativa');
  assert.equal(catalog.sections.find((section) => section.id === 'calidad').relatedLinks[0].targetPath, '/calidad-datos');
  assert.equal(catalog.sections.find((section) => section.id === 'reportes').targetPath, '/reportes-rrhh');
  assert.equal(catalog.sections.find((section) => section.id === 'ayuda').targetPath, '/centro-ayuda');
  assert.equal(catalog.sections.every((section) => !('aliases' in section)), true);
  assert.equal(catalog.tasks.length, 15);
  assert.equal(catalog.glossary.length, 16);
});

test('ayuda de navegación funciona sin consultar Neon y devuelve contrato trazable', async () => {
  let fetchCalls = 0;
  const res = await post(
    { message: '¿Dónde encuentro Calidad?', enhance: true },
    {
      getInternalSql: async () => { throw new Error('la guía no debe depender de Neon'); },
      env: { OPENAI_API_KEY: 'openai_test', HF_TOKEN: 'hf_test' },
      fetch: async () => { fetchCalls += 1; throw new Error('la guía no debe salir a proveedores externos'); },
    },
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.intent, 'help_navigation');
  assert.equal(res.payload.targetPath, '/calidad-operativa');
  assert.equal(res.payload.data.section.label, 'Calidad');
  assert.ok(res.payload.steps.length >= 3);
  assert.equal(res.payload.sources[0].system, 'MUNICONTROL');
  assert.equal(res.payload.sources[0].relation, 'section_catalog');
  assert.equal(res.payload.sources[0].asOf, '2026-09-04T00:00:00.000Z');
  assert.equal(res.payload.asOf, '2026-09-04T00:00:00.000Z');
  assert.equal(res.payload.privacy.guidanceContent, 'verified_product_catalog_only');
  assert.equal(res.payload.privacy.nominalDataExternalized, false);
  assert.equal(res.payload.provider.status, 'not_allowed_for_product_guidance');
  assert.equal(res.payload.provider.provider, 'local');
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

  const receiptHelp = await post({ message: '¿Cómo descargo el recibo de sueldo?' });
  assert.equal(receiptHelp.payload.data.task.id, 'consultar_recibo');
  assert.equal(receiptHelp.payload.targetPath, '/recibos-sueldo');
  assert.match(receiptHelp.payload.steps.at(-1), /no lo presentes como recibo oficial/i);

  const absenceHelp = await post({ message: '¿Cómo revisar ausentismo?' });
  assert.equal(absenceHelp.payload.data.task.id, 'revisar_ausentismo');
  assert.equal(absenceHelp.payload.targetPath, '/ausentismo-control');
  assert.match(absenceHelp.payload.steps.at(-1), /No conviertas los valores en jornadas perdidas, productividad ni tasa/i);

  const qualityHelp = await post({ message: '¿Cómo revisar calidad?' });
  assert.equal(qualityHelp.payload.data.task.id, 'auditar_calidad');
  assert.equal(qualityHelp.payload.targetPath, '/calidad-operativa');
  assert.match(qualityHelp.payload.steps[2], /no se puede afirmar calidad perfecta/i);
  assert.match(qualityHelp.payload.steps[3], /no informa un corte propio/i);
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
  assert.equal(help.payload.data.sections.length, 18);
  assert.equal(help.payload.relatedSections.length, 18);
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
  assert.deepEqual(
    res.payload.capabilities.find((capability) => capability.intent === 'quality_analysis'),
    { intent: 'quality_analysis', externalEnhancement: true },
  );
  assert.deepEqual(
    res.payload.capabilities.find((capability) => capability.intent === 'attendance_status'),
    { intent: 'attendance_status', externalEnhancement: false, resource: 'attendancereportedinventory' },
  );
  assert.deepEqual(res.payload.providerPolicy, {
    primary: 'openai', fallback: 'huggingface', fallbackRequiresPrimaryAttempt: true,
    externalEnhancementRequiresManagedIdentity: true,
    durableQuotaRequired: true,
    durableQuotaBuckets: ['tenant_user', 'tenant'],
    durableQuotaCertificationRequired: true,
    localDeterministicFallback: true, maximumExternalAttemptsPerRequest: 2,
  });
  assert.equal(res.payload.guidance.sections.length, 18);
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
  assert.match(res.payload.answer, /Corte GRH: 06\/08\/2026\./);
  assert.equal(res.payload.asOf, scope.asOf);
  assert.equal(res.payload.sources[0].system, 'GRH');
  assert.equal(res.payload.provider.status, 'not_requested');
});

test('pregunta natural por personas activas y corte usa dotación y responde desde el bootstrap GRH', async () => {
  const res = await post({
    message: '¿Cuántas personas activas informa el corte GRH y cuál es la fecha de ese corte?',
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.intent, 'workforce_summary');
  assert.equal(res.payload.data.administrativeActive, 882);
  assert.equal(res.payload.asOf, scope.asOf);
  assert.match(res.payload.answer, /882 activos administrativos/i);
  assert.match(res.payload.answer, /Corte GRH: 06\/08\/2026\./);
  assert.doesNotMatch(res.payload.answer, /crosswalk|coincidencias confirmadas/i);
  assert.equal(res.payload.sources[0].system, 'GRH');
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

test('calidad operativa responde con conteos, severidad, dominios, crosswalk, fuentes y límites sin inventar score o corte', async () => {
  const res = await post({ intent: 'quality_analysis' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.intent, 'quality_analysis');
  assert.deepEqual(res.payload.data.issues, {
    total: 37,
    open: 30,
    distinctCodes: 6,
    distinctEntities: 3,
    byResolution: { open: 30, accepted: 2, corrected: 4, rejected: 1 },
    bySeverity: { critical: 1, error: 8, warning: 24, info: 4 },
  });
  assert.deepEqual(res.payload.data.domains.payrollCoherence, {
    available: true, registeredIssues: 5, openIssues: 4, status: 'needs_review',
  });
  assert.equal(res.payload.data.crosswalk.total, 2349);
  assert.equal(res.payload.data.crosswalk.matched, 1699);
  assert.equal(res.payload.data.crosswalk.reconciled, true);
  assert.deepEqual(res.payload.data.reconciliation, {
    severityTotal: 37,
    domainTotal: 37,
    totalMatchesSeverity: true,
    totalMatchesDomains: true,
    openEqualsTotal: false,
  });
  assert.equal(res.payload.data.sourceTracking[1].source, 'PERSONAS');
  assert.equal(res.payload.data.sourceTracking[1].trackingStatus, 'controls_not_materialized');
  assert.equal(res.payload.data.meta.containsPersonalData, false);
  assert.equal(res.payload.data.meta.mutationAllowed, false);
  assert.equal(res.payload.data.meta.sourceCutoff, null);
  assert.deepEqual(res.payload.data.meta.authority, { labor: 'GRH', identityAuxiliary: 'PERSONAS' });
  assert.equal(Object.hasOwn(res.payload.data, 'score'), false);
  assert.equal(res.payload.asOf, null, 'qualityoverview no informa cutoff propio');
  assert.equal(res.payload.targetPath, '/calidad-operativa');
  assert.equal(res.payload.sources.find((source) => source.system === 'PERSONAS').authority, 'controls_not_materialized');
  assert.equal(res.payload.sources.find((source) => source.system === 'PERSONAS').asOf, null);
  assert.match(res.payload.answer, /37 hallazgos agregados, 30 abiertos/i);
  assert.match(res.payload.answer, /no evaluado.*no puede interpretarse como calidad perfecta/i);
  assert.match(res.payload.answer, /no se calcula un score sintético/i);
  assert.match(res.payload.answer, /no informa una fecha de corte propia/i);
  assert.ok(res.payload.data.limits.some((limit) => /excluye filas, identificadores y valores observados/i.test(limit)));
  const serialized = JSON.stringify(res.payload.data);
  assert.doesNotMatch(serialized, /importLineage|observedValue|issueId|sourceId|"list"/i);
});

test('acepta el alias de dependencia qualityoverview sin consultar un recurso alternativo', async () => {
  let calls = 0;
  const endpoint = createInternalAssistantHandler({
    requireInternalSession: () => ({ id: 'user-quality' }),
    getInternalSql: async () => ({ query: async () => [] }),
    qualityoverview: async () => { calls += 1; return quality; },
    env: {},
    logger: { info() {} },
  });
  const res = responseRecorder();
  await endpoint({
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: { intent: 'quality_analysis' },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.data.issues.total, 37);
  assert.equal(calls, 1);
});

test('calidad externa recibe sólo totals, dominios, crosswalk y trackingStatus agregados', async () => {
  let request;
  const trapped = JSON.parse(JSON.stringify(quality));
  trapped.payload.data.breakdowns.importLineage = [{ sourceId: 'source-secret', fileName: 'backup-personas.zip' }];
  trapped.payload.data.breakdowns.list = [{ issueId: 91, observedValue: 'PERSONA LOCAL', canonicalId: 'canonical-secret' }];
  const res = await post(
    { intent: 'quality_analysis', message: 'Analizá el issue de PERSONA LOCAL', enhance: true },
    {
      qualityOverview: async () => trapped,
      env: { OPENAI_API_KEY: 'openai_test' },
      fetch: async (url, options) => {
        request = { url, options };
        return {
          ok: true,
          async json() {
            return { output_text: 'La cobertura de PERSONAS figura como no evaluada; no equivale a calidad perfecta.' };
          },
        };
      },
    },
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.provider.provider, 'openai');
  assert.equal(res.payload.provider.status, 'used');
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  const providerBody = JSON.parse(request.options.body);
  assert.equal(providerBody.store, false);
  assert.match(providerBody.input, /"totals"/);
  assert.match(providerBody.input, /"domains"/);
  assert.match(providerBody.input, /"crosswalk"/);
  assert.match(providerBody.input, /"trackingStatuses"/);
  assert.match(providerBody.input, /controls_not_materialized/);
  assert.doesNotMatch(providerBody.input, /PERSONA LOCAL|source-secret|backup-personas|canonical-secret/i);
  assert.doesNotMatch(providerBody.input, /importLineage|observedValue|issueId|sourceId|canonicalId|"list"|"issues"/i);
  assert.doesNotMatch(providerBody.input, /Analizá el issue/i, 'no debe enviar el mensaje crudo');
  assert.equal(res.payload.privacy.rawUserMessageSentExternally, false);
  assert.equal(Object.hasOwn(res.payload.data, 'score'), false);
  assert.equal(res.payload.asOf, null);
});

test('la proyección externa de dotación conserva sólo estado y conteo', async () => {
  let providerBody;
  const trapped = JSON.parse(JSON.stringify(integration));
  trapped.workforceControl.stateBreakdown.rows[0] = {
    ...trapped.workforceControl.stateBreakdown.rows[0],
    source_id: 'source-secret',
    observed_value: 'PERSONA LOCAL',
    canonicalId: 'canonical-secret',
  };

  const res = await post(
    { intent: 'workforce_summary', enhance: true },
    {
      integrationQuality: async () => trapped,
      env: { OPENAI_API_KEY: 'openai_test' },
      fetch: async (_url, options) => {
        providerBody = JSON.parse(options.body);
        return { ok: true, async json() { return { output_text: 'Lectura agregada.' }; } };
      },
    },
  );

  assert.equal(res.payload.provider.status, 'used');
  assert.deepEqual(JSON.parse(providerBody.input.split('Indicadores agregados verificados:\n')[1]).controlStates[0], {
    state: 'licencia_sin_goce',
    records: 16,
  });
  assert.doesNotMatch(JSON.stringify(providerBody), /source[_-]?id|observed[_-]?value|canonical[_-]?id|PERSONA LOCAL|secret|error_de_estado/i);
});

test('el guard de privacidad reconoce nombres sensibles en snake_case', async () => {
  let fetchCalls = 0;
  const trapped = JSON.parse(JSON.stringify(integration));
  trapped.workforceControl.status = 'source_id';

  const res = await post(
    { intent: 'workforce_summary', enhance: true },
    {
      integrationQuality: async () => trapped,
      env: { OPENAI_API_KEY: 'openai_test' },
      fetch: async () => { fetchCalls += 1; throw new Error('no debe externalizar'); },
    },
  );

  assert.equal(res.payload.provider.provider, 'local');
  assert.equal(res.payload.provider.status, 'blocked_by_privacy_guard');
  assert.equal(res.payload.provider.externalProviderAttempted, false);
  assert.equal(fetchCalls, 0);
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
      env: { OPENAI_API_KEY: 'openai_test', HF_TOKEN: 'hf_test' },
      fetch: async (url, options) => {
        if (url === 'https://api.openai.com/v1/responses') return { ok: false, status: 503 };
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
      env: { OPENAI_API_KEY: 'openai_test', HF_TOKEN: 'hf_test' },
      fetch: async (url, options) => {
        if (url === 'https://api.openai.com/v1/responses') return { ok: false, status: 503 };
        providerBody = JSON.parse(options.body);
        return { ok: true, async json() { return { choices: [{ message: { content: 'Lectura ejecutiva agregada.' } }] }; } };
      },
    },
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.intent, 'executive_analysis');
  assert.deepEqual(absenceQuery, { from: '', to: '', sector: '', reasonCode: '', bucket: 'month' });
  assert.deepEqual(res.payload.data.absence.summary, { events: 1559, affectedContracts: 590, sourceDeclaredDays: 17400 });
  assert.equal(res.payload.data.quality.meta.sourceCutoff, null);
  assert.equal(res.payload.sources.find((source) => source.relation === 'quality_overview').asOf, null);
  assert.equal('rows' in res.payload.data.absence, false);
  assert.match(res.payload.answer, /1\.559 eventos administrativos de ausencia/i);
  assert.match(res.payload.answer, /no constituyen una tasa de ausentismo, presentismo, productividad ni jornadas perdidas/i);
  const serialized = JSON.stringify(providerBody);
  assert.match(providerBody.messages[1].content, /"absence"/);
  assert.match(providerBody.messages[1].content, /"topReasons"/);
  assert.doesNotMatch(serialized, /error_de_estado/i, 'el ejecutivo hereda la supresión k>=5 de estados laborales');
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

test('el análisis ejecutivo conserva los demás dominios cuando Calidad Operativa falla', async () => {
  const res = await post(
    { intent: 'executive_analysis' },
    {
      qualityOverview: async () => { throw new Error('qualityoverview temporalmente no disponible'); },
    },
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
  assert.equal(res.payload.data.partial, true);
  assert.deepEqual(res.payload.data.errors, [{
    domain: 'quality',
    status: 503,
    code: 'QUALITY_OVERVIEW_UNAVAILABLE',
  }]);
  assert.deepEqual(res.payload.data.quality, { code: 'QUALITY_OVERVIEW_UNAVAILABLE' });
  assert.equal(res.payload.data.workforce.gap, 28);
  assert.equal(res.payload.data.absence.summary.events, 1559);
  assert.match(res.payload.answer, /calidad operativa no está disponible/i);
  assert.match(res.payload.answer, /no se infirieron valores/i);
  assert.equal(res.payload.provider.provider, 'local');
  assert.equal(res.payload.provider.status, 'not_requested');
});

test('búsqueda y ficha nominal quedan locales aunque se solicite enhance', async () => {
  let fetchCalls = 0;
  let searchQuery;
  const fetchMock = async () => { fetchCalls += 1; throw new Error('no debe salir'); };
  const list = await post(
    { intent: 'employee_search', search: 'PERSONA LOCAL', enhance: true },
    {
      fetch: fetchMock,
      env: { OPENAI_API_KEY: 'openai_test', HF_TOKEN: 'hf_test' },
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
  assert.equal(list.payload.provider.provider, 'local');
  assert.equal(list.payload.privacy.nominalQueries, 'local_database_only');

  const detail = await post(
    { intent: 'employee_detail', legajo: '42', enhance: true },
    { fetch: fetchMock, env: { OPENAI_API_KEY: 'openai_test', HF_TOKEN: 'hf_test' } },
  );
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.payload.data.data.nombre, 'PERSONA LOCAL');
  assert.equal(detail.payload.provider.status, 'not_allowed_for_nominal_or_unknown_intent');
  assert.equal(fetchCalls, 0);
});

test('consulta nominal de licencias tolera el typo, desambigua legajos y muestra el registro histórico local', async () => {
  let fetchCalls = 0;
  let searchQuery;
  const list = await post(
    { message: 'licnecias de nombre de prueba en 2009', enhance: true },
    {
      env: { OPENAI_API_KEY: 'openai_test', HF_TOKEN: 'hf_test' },
      fetch: async () => { fetchCalls += 1; throw new Error('los nombres no deben salir a proveedores'); },
      employees: async (_sql, req) => {
        searchQuery = req.query;
        return {
          status: 200,
          payload: {
            ok: true,
            data: [
              { contractId: 'contract-1', companyId: 1, nombre: 'NOMBRE DE PRUEBA', legajo: '42', dni: 'NO_PUBLICAR', rawFields: { private: true } },
              { contractId: 'contract-2', companyId: 2, nombre: 'NOMBRE DE PRUEBA', legajo: '84', cuil: 'NO_PUBLICAR', telefono: 'NO_PUBLICAR' },
            ],
            pagination: { page: 1, limit: 10, total: 2, pages: 1 },
          },
        };
      },
    },
  );
  assert.equal(list.statusCode, 200);
  assert.equal(list.payload.intent, 'employee_search');
  assert.equal(searchQuery.search, 'nombre de prueba');
  assert.equal(list.payload.data.queryFocus, 'licenses');
  assert.equal(list.payload.data.queryYear, 2009);
  assert.doesNotMatch(JSON.stringify(list.payload.data), /NO_PUBLICAR|"dni"|"cuil"|"rawFields"|"telefono"/i);
  assert.match(list.payload.answer, /elegí el legajo correcto/i);
  assert.equal(list.payload.provider.status, 'not_allowed_for_nominal_or_unknown_intent');
  assert.equal(fetchCalls, 0);

  let detailQuery;
  const detail = await post(
    { message: 'Ver licencias del legajo 42, empresa 1, en 2009.', enhance: true },
    {
      env: { OPENAI_API_KEY: 'openai_test', HF_TOKEN: 'hf_test' },
      fetch: async () => { fetchCalls += 1; throw new Error('la ficha no debe salir a proveedores'); },
      employee: async (_sql, req) => {
        detailQuery = req.query;
        return ({
        status: 200,
        payload: {
          ok: true,
          data: {
            nombre: 'NOMBRE DE PRUEBA', legajo: '42', administrativeStatus: 'inactive',
            payrollStatus: 'not_liquidated', controlState: 'inactivo_administrativo',
            statusSnapshotDate: '2026-08-01', personas: { available: false },
            licencias: [
              { fechaInicio: '2009-05-01', fechaFin: '2009-05-03', tipo: 'HISTÓRICA' },
              { fechaInicio: '2008-07-10', fechaFin: '2008-07-11', tipo: 'HISTÓRICA' },
              { fechaInicio: '2007-02-01', fechaFin: '2007-02-01', tipo: 'HISTÓRICA' },
            ],
            ausencias: [],
            dni: 'NO_PUBLICAR', cuil: 'NO_PUBLICAR', telefono: 'NO_PUBLICAR', domicilio: 'NO_PUBLICAR',
            familiares: [{ nombre: 'NO_PUBLICAR' }], rawFields: { private: true }, identityAssertions: [{ rawValue: 'NO_PUBLICAR' }],
          },
          meta: { leaveTotal: 3, absenceTotal: 41, relationRowsComplete: false, relationRowsCappedAt: 25, leaveSourceMaxDate: '2009-05-15' },
        },
      });
      },
    },
  );
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.payload.intent, 'employee_detail');
  assert.equal(detail.payload.data.queryFocus, 'licenses');
  assert.equal(detail.payload.data.queryYear, 2009);
  assert.equal(detailQuery.recordYear, '2009');
  assert.equal(detail.payload.data.meta.leaveTotal, 3);
  assert.equal('dni' in detail.payload.data.data, false);
  assert.equal('rawFields' in detail.payload.data.data, false);
  assert.equal('familiares' in detail.payload.data.data, false);
  assert.equal('contacto' in detail.payload.data.data, false);
  assert.match(detail.payload.answer, /3 licencias históricas/i);
  assert.match(detail.payload.answer, /archivo legado/i);
  assert.ok(detail.payload.sources.some((source) => source.relation === 'grh_leaves'));
  assert.ok(detail.payload.sources.some((source) => source.relation === 'grh_absences'));
  assert.equal(detail.payload.sources.find((source) => source.relation === 'grh_leaves').asOf, '2009-05-15T00:00:00.000Z');
  assert.equal(detail.payload.sources.find((source) => source.relation === 'grh_absences').asOf, '2026-08-06T15:15:21.000Z');
  assert.equal(detail.payload.sources.some((source) => source.system === 'PERSONAS'), false);
  assert.equal(detail.payload.provider.status, 'not_allowed_for_nominal_or_unknown_intent');
  assert.equal(fetchCalls, 0);

  let noYearQuery;
  const noYear = await post(
    { message: 'Ver licencias del legajo 2009, empresa 1.' },
    {
      employee: async (_sql, req) => {
        noYearQuery = req.query;
        return {
          status: 200,
          payload: {
            ok: true,
            data: { nombre: 'NOMBRE DE PRUEBA', legajo: '2009', personas: { available: false }, licencias: [], ausencias: [] },
            meta: { leaveTotal: 0, absenceTotal: 0, leaveSourceMaxDate: '2009-05-15' },
          },
        };
      },
    },
  );
  assert.equal(noYear.statusCode, 200);
  assert.equal(noYearQuery.recordYear, '');
  assert.equal(noYear.payload.data.queryYear, null);
});

test('summary y structure usan proyecciones agregadas allowlisted sin hashes, IDs ni filas pequeñas', async () => {
  const providerBodies = [];
  const fetchMock = async (_url, options) => {
    providerBodies.push(JSON.parse(options.body));
    return { ok: true, async json() { return { output_text: 'Lectura agregada verificada.' }; } };
  };
  const operational = await post(
    { message: 'Resumen operativo de GRH', enhance: true },
    {
      env: { OPENAI_API_KEY: 'openai_test' },
      fetch: fetchMock,
      summary: async () => ({
        ok: true,
        source: { cutoff: '2026-08-06', name: 'BACKUP_PRIVADO.zip', sha256: 'HASH_NO_PUBLICAR' },
        workforce: { historicalRecords: 2450, active: 882, inactive: 1568, sectors: [{ label: 'NO_PUBLICAR' }] },
        absence: { totalEvents: 31572, yearly: [{ year: 2026, name: 'NO_PUBLICAR' }] },
        related: { leaveRecords: 1200 },
        catalogs: { sectors: 81, categories: 22, unions: 4, agreements: 12 },
        quality: { activeWithoutSector: 5, absenceOrphans: 2, leaveOrphans: 1, flags: { private: true }, importedCounts: { private: 99 } },
      }),
    },
  );
  assert.equal(operational.statusCode, 200);
  assert.equal(operational.payload.queryPlan.resource, 'summary');
  assert.equal(operational.payload.data.grain, 'employment_record_by_company_and_legajo');
  assert.equal(operational.payload.asOf, null, 'los bloques con cortes distintos no comparten un asOf inventado');
  assert.equal(operational.payload.sources.find((item) => item.relation === 'grh_leaves').asOf, null);
  assert.doesNotMatch(JSON.stringify(providerBodies[0]), /BACKUP_PRIVADO|HASH_NO_PUBLICAR|NO_PUBLICAR|flags|importedCounts|yearly/i);

  const structure = await post(
    { message: 'Estructura del sector OBRERO', enhance: true },
    {
      env: { OPENAI_API_KEY: 'openai_test' },
      fetch: fetchMock,
      structure: async () => ({
        ok: true,
        source: { cutoff: '2026-08-06', sha256: 'HASH_ESTRUCTURA_NO_PUBLICAR' },
        coverage: {
          historicalRecords: 2450, activeRecords: 882, inactiveRecords: 1568,
          withOrganization: 2400, withSector: 2300, withRole: 2200,
          organizationsObserved: 15, sectorsObserved: 81, rolesObserved: 120,
        },
        hierarchy: { available: false, catalogRows: 15, roots: 0, parentLinks: 0, unresolvedParentLinks: 0 },
        organizations: [
          { label: 'Hacienda', active: 30, inactive: 10, historical: 40, organizationIds: ['NO_PUBLICAR'] },
          { label: 'SPLIT_PRIVADO', active: 1, inactive: 9, historical: 10 },
        ],
        sectors: [{ label: 'OBRERO', active: 25, historical: 30, sourceCode: 'NO_PUBLICAR' }, { label: 'MICRO', active: 2, historical: 2 }],
        roles: [{ label: 'Inspector', active: 8, historical: 10 }],
        catalogs: { raw: 'NO_PUBLICAR' },
      }),
    },
  );
  assert.equal(structure.statusCode, 200);
  assert.equal(structure.payload.queryPlan.resource, 'structure');
  assert.equal(structure.payload.data.matches.sectors.total, 1);
  assert.match(structure.payload.answer, /cubre globalmente/i);
  assert.match(structure.payload.answer, /coincide con 1/i);
  assert.doesNotMatch(JSON.stringify(providerBodies[1]), /HASH_ESTRUCTURA|organizationIds|sourceCode|NO_PUBLICAR|MICRO|SPLIT_PRIVADO|catalogs/i);
  assert.doesNotMatch(JSON.stringify(providerBodies[1]), /"activeRecords":1|"inactiveRecords":9/);
});

test('absenceevents, qualityissues e importlineage quedan locales y aplican sus filtros', async () => {
  let externalCalls = 0;
  let absenceQuery;
  let qualityQuery;
  const localOnly = {
    env: { OPENAI_API_KEY: 'openai_test', HF_TOKEN: 'hf_test' },
    fetch: async () => { externalCalls += 1; throw new Error('un recurso interno no debe externalizarse'); },
    absenceEvents: async (_sql, req) => {
      absenceQuery = req.query;
      return {
        status: 200,
        payload: {
          ok: true,
          data: [{ contractId: 'contract-private', companyId: 7, legajo: '991', name: 'PERSONA NOMINAL', sector: 'OBRERO', eventDate: '2026-07-10', reasonCode: '07', reason: 'Enfermedad', sourceDeclaredDays: 2 }],
          pagination: { page: 1, limit: 10, total: 1, pages: 1 },
          range: { effective: { from: '2026-07-10', to: '2026-07-10' } },
          quality: { sourceCutoff: '2026-08-06', sectorSemantics: 'Sector actual observado al corte.' },
          meta: { filters: { sector: 'OBRERO', reasonCode: '07' }, sectorSemantics: 'Sector actual observado al corte.', externalSharingAllowed: false },
        },
      };
    },
    qualityIssues: async (_sql, req) => {
      qualityQuery = req.query;
      return {
        status: 200,
        payload: { ok: true, data: [], pagination: { page: 1, limit: 10, total: 0, pages: 1 }, filters: { source: 'PERSONAS', severity: 'error', resolution: 'open' } },
      };
    },
    importLineage: async () => ({
      status: 200,
      payload: {
        ok: true,
        data: [
          { source: 'GRH', cutoff: '2026-08-06', loadedAt: '2026-08-07', validation: 'published', sourceRowCount: 100, sourceRowCountStatus: 'reported', sha256Prefix: 'abc123', trackedIssues: 2 },
          { source: 'GRH', cutoff: '2026-08-06', loadedAt: '2026-08-08', validation: 'published', sourceRowCount: 101, sourceRowCountStatus: 'reported', sha256Prefix: 'latest123', trackedIssues: 3 },
          { source: 'GRH', cutoff: '2026-07-01', loadedAt: '2026-07-02', validation: 'published', sourceRowCount: 90, sourceRowCountStatus: 'reported', sha256Prefix: 'def456', trackedIssues: 1 },
          { source: 'GRH', cutoff: null, loadedAt: '2026-09-01', validation: 'published', sourceRowCount: 102, sourceRowCountStatus: 'reported', sha256Prefix: 'nullcutoff', trackedIssues: 4 },
          { source: 'PERSONAS', cutoff: '2026-08-01', loadedAt: '2026-08-02', validation: 'published', sourceRowCount: null, sourceRowCountStatus: 'not_reported', sha256Prefix: 'ghi789', trackedIssues: 0 },
        ],
        summary: { publishedBatches: 3 },
      },
    }),
  };

  const events = await post({ message: 'Listá ausencias el 2026-07-10 del sector OBRERO motivo 07', enhance: true }, localOnly);
  assert.equal(events.payload.intent, 'absence_event_list');
  assert.deepEqual(absenceQuery, { from: '2026-07-10', to: '2026-07-10', sector: 'OBRERO', reasonCode: '07', page: '1', limit: '10' });
  assert.equal(events.payload.provider.status, 'not_allowed_for_nominal_or_unknown_intent');
  assert.equal(events.payload.privacy.nominalQueries, 'local_database_only');
  assert.match(events.payload.answer, /no equivale automáticamente a duración, jornadas perdidas, presentismo ni tasa/i);

  const issues = await post({ message: 'Listá errores abiertos de calidad de PERSONAS', enhance: true }, localOnly);
  assert.equal(issues.payload.intent, 'quality_issue_list');
  assert.equal(qualityQuery.source, 'PERSONAS');
  assert.equal(qualityQuery.severity, 'error');
  assert.equal(qualityQuery.resolution, 'open');
  assert.equal(issues.payload.provider.status, 'not_allowed_for_nominal_or_unknown_intent');
  assert.match(issues.payload.answer, /cero hallazgos registrados no demuestra una fuente limpia/i);
  assert.equal(issues.payload.asOf, null);

  const lineage = await post({ message: 'Último lote de importación GRH', enhance: true }, localOnly);
  assert.equal(lineage.payload.intent, 'import_lineage');
  assert.equal(lineage.payload.data.batches.length, 1);
  assert.equal(lineage.payload.data.batches[0].cutoff, '2026-08-06T00:00:00.000Z');
  assert.equal(lineage.payload.data.batches[0].loadedAt, '2026-08-08T00:00:00.000Z');
  assert.equal(lineage.payload.data.batches[0].sha256Prefix, 'latest123');
  assert.deepEqual(lineage.payload.data.summary, { publishedBatches: 1, reportedRowCounts: 1, notReportedRowCounts: 0, scope: 'filtered_rows' });
  assert.equal(lineage.payload.provider.status, 'not_allowed_for_nominal_or_unknown_intent');
  assert.equal(externalCalls, 0);
});

test('follow-up nominal usa sólo contexto estructurado y el log no contiene PII ni identificadores laborales', async () => {
  const logs = [];
  let detailQuery;
  let externalCalls = 0;
  const res = await post(
    {
      message: '¿Y sus ausencias?',
      history: [{
        role: 'assistant',
        content: 'PERSONA PRIVADA legajo 991 company 7 NO_DEBE_USARSE',
        conversationContext: {
          intent: 'employee_detail', domain: 'employee', queryFocus: 'licenses', queryYear: 2026,
          selectedEmployee: { companyId: '7', legajo: '991', name: 'IGNORAR' },
          filters: { year: 2026 },
        },
      }],
      enhance: true,
    },
    {
      env: { OPENAI_API_KEY: 'openai_test', HF_TOKEN: 'hf_test' },
      logger: { info(value) { logs.push(value); } },
      requestIdFactory: () => 'request-safe-id',
      fetch: async () => { externalCalls += 1; throw new Error('no externalizar nominales'); },
      employee: async (_sql, req) => {
        detailQuery = req.query;
        return {
          status: 200,
          payload: {
            ok: true,
            data: { companyId: 7, legajo: '991', nombre: 'PERSONA PRIVADA', ausencias: [], licencias: [] },
            meta: { absenceTotal: 0, leaveTotal: 0 },
          },
        };
      },
    },
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.intent, 'employee_detail');
  assert.deepEqual(detailQuery, { contractId: '', legajo: '991', companyId: '7', recordYear: '2026' });
  assert.equal(res.payload.data.queryFocus, 'absences');
  assert.equal(res.payload.queryPlan.contextUsed.reason, 'referential_nominal_follow_up');
  assert.deepEqual(res.payload.conversationContext.selectedEmployee, { companyId: '7', legajo: '991' });
  assert.equal(res.payload.provider.status, 'not_allowed_for_nominal_or_unknown_intent');
  assert.equal(externalCalls, 0);
  assert.equal(res.payload.requestId, 'request-safe-id');
  assert.equal(res.headers['X-Request-Id'], 'request-safe-id');
  assert.equal(logs.length, 1);
  const log = logs[0];
  assert.doesNotMatch(log, /PERSONA PRIVADA|NO_DEBE_USARSE|IGNORAR|991|companyId|legajo|history|facts/i);
  assert.match(log, /"intent":"employee_detail"/);
  assert.match(log, /"providerStatus":"not_allowed_for_nominal_or_unknown_intent"/);
  assert.match(log, /"name":"employee"/);

  const missing = await post({ message: '¿Y sus ausencias?', history: [{ role: 'assistant', content: 'PERSONA PRIVADA 991' }] });
  assert.equal(missing.statusCode, 409);
  assert.equal(missing.payload.code, 'CONVERSATION_CONTEXT_REQUIRED');
});

test('motivo natural se resuelve a código homologado o pide desambiguación sin ignorar el filtro', async () => {
  let absenceQuery;
  const resolved = await post(
    { message: 'Ausencias por motivo Enfermedad en 2026' },
    {
      resolveAbsenceReason: async () => ({ status: 'resolved', reasonCode: '07', candidates: [{ code: '07', label: 'Enfermedad' }] }),
      absenceAnalytics: async (_sql, req) => { absenceQuery = req.query; return absence; },
    },
  );
  assert.equal(resolved.statusCode, 200);
  assert.equal(absenceQuery.reasonCode, '07');
  assert.equal(resolved.payload.queryPlan.filters.reasonCode, '07');
  assert.equal(Object.hasOwn(resolved.payload.queryPlan.filters, 'reason'), false);

  let analyticsCalls = 0;
  const ambiguous = await post(
    { message: 'Ausencias por motivo Licencia en 2026' },
    {
      resolveAbsenceReason: async () => ({ status: 'ambiguous', candidates: [{ code: '01', label: 'Licencia anual' }, { code: '02', label: 'Licencia especial' }] }),
      absenceAnalytics: async () => { analyticsCalls += 1; return absence; },
    },
  );
  assert.equal(ambiguous.statusCode, 409);
  assert.equal(ambiguous.payload.code, 'ABSENCE_REASON_AMBIGUOUS');
  assert.equal(analyticsCalls, 0);
});

test('OpenAI Responses es primario y no intenta HF cuando responde correctamente', async () => {
  const requests = [];
  const res = await post(
    { intent: 'workforce_summary', message: 'Dame una lectura con PERSONA LOCAL', enhance: true },
    {
      env: {
        OPENAI_API_KEY: 'openai_secret_test',
        HF_TOKEN: 'hf_secret_test',
        AI_ASSISTANT_MAX_TOKENS: '999',
        AI_ASSISTANT_TIMEOUT_MS: '8000',
        OPENAI_ASSISTANT_TIMEOUT_MS: '4000',
      },
      fetch: async (url, options) => {
        requests.push({ url, options });
        return {
          ok: true,
          async json() {
            return {
              output_text: 'La brecha operativa está reconciliada y debe seguir controlándose por estado.',
              usage: { input_tokens: 90, output_tokens: 18, total_tokens: 108 },
            };
          },
        };
      },
    },
  );

  assert.equal(res.statusCode, 200);
  assert.equal(requests.length, 1, 'HF no debe ejecutarse después de un resultado válido de OpenAI');
  assert.equal(requests[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer openai_secret_test');
  const providerBody = JSON.parse(requests[0].options.body);
  assert.equal(providerBody.model, 'gpt-5.4-mini');
  assert.equal(providerBody.store, false);
  assert.equal(providerBody.max_output_tokens, 320, 'el tope debe limitar cualquier configuración mayor');
  assert.deepEqual(providerBody.reasoning, { effort: 'none' });
  assert.match(providerBody.input, /"operationalGap":28/);
  assert.doesNotMatch(providerBody.input, /Dame una lectura|PERSONA LOCAL/i);
  assert.equal(res.payload.provider.provider, 'openai');
  assert.equal(res.payload.provider.name, 'openai_responses');
  assert.equal(res.payload.provider.status, 'used');
  assert.equal(res.payload.provider.model, 'gpt-5.4-mini');
  assert.equal(res.payload.provider.reasoningEffort, 'none');
  assert.deepEqual(res.payload.provider.usage, {
    promptTokens: 90, completionTokens: 18, totalTokens: 108, reasoningTokens: 0,
  });
  assert.deepEqual(res.payload.provider.attempts, [{
    provider: 'openai', status: 'used', model: 'gpt-5.4-mini',
    httpStatus: 200, elapsedMs: 0, requestId: null, errorCode: null,
  }]);
  assert.equal(res.payload.provider.limits.maxCallsPerRequest, 2);
  assert.equal(res.payload.provider.limits.maxOutputTokens, 320);
  assert.equal(res.payload.provider.limits.timeoutMs, 4000);
  assert.equal(res.payload.provider.limits.totalTimeoutMs, 8000);
  assert.equal(res.payload.provider.limits.openAITimeoutMs, 4000);
  assert.equal(res.payload.provider.limits.huggingFaceTimeoutMs, 4000);
  assert.equal(res.payload.privacy.rawUserMessageSentExternally, false);
});

test('OpenAI clasifica errores HTTP y publica sólo telemetría segura del proveedor', async () => {
  const cases = [
    { httpStatus: 401, code: 'invalid_api_key', status: 'invalid_api_key' },
    { httpStatus: 403, code: 'project_access_denied', status: 'access_denied' },
    { httpStatus: 429, code: 'rate_limit_exceeded', status: 'upstream_rate_limited' },
    { httpStatus: 429, code: 'insufficient_quota', status: 'insufficient_quota' },
    { httpStatus: 503, code: 'server_error', status: 'unavailable' },
  ];

  for (const expected of cases) {
    const ticks = [0, 1, 100, 137, 200];
    const logs = [];
    const res = await post(
      { intent: 'workforce_summary', enhance: true },
      {
        env: { OPENAI_API_KEY: 'openai_secret_test' },
        now: () => ticks.shift() ?? 200,
        requestIdFactory: () => 'internal-safe-id',
        logger: { info(value) { logs.push(value); } },
        fetch: async () => ({
          ok: false,
          status: expected.httpStatus,
          headers: { get(name) { return name === 'x-request-id' ? 'upstream-safe-id' : null; } },
          async json() {
            return {
              error: {
                code: expected.code,
                message: 'NO_PUBLICAR openai_secret_test sk-private-key',
              },
            };
          },
        }),
      },
    );

    assert.equal(res.payload.provider.provider, 'openai');
    assert.equal(res.payload.provider.status, expected.status);
    assert.equal(res.payload.provider.httpStatus, expected.httpStatus);
    assert.equal(res.payload.provider.elapsedMs, 37);
    assert.equal(res.payload.provider.requestId, 'upstream-safe-id');
    assert.equal(res.payload.provider.errorCode, expected.code);
    assert.deepEqual(res.payload.provider.attempts[0], {
      provider: 'openai', status: expected.status, model: 'gpt-5.4-mini',
      httpStatus: expected.httpStatus, elapsedMs: 37, requestId: 'upstream-safe-id', errorCode: expected.code,
    });
    const serializedProvider = JSON.stringify(res.payload.provider);
    assert.doesNotMatch(serializedProvider, /NO_PUBLICAR|openai_secret_test|sk-private-key|message/i);
    assert.equal(logs.length, 1);
    const log = JSON.parse(logs[0]);
    assert.deepEqual(log.providerTelemetry, {
      httpStatus: expected.httpStatus,
      elapsedMs: 37,
      requestId: 'upstream-safe-id',
      errorCode: expected.code,
    });
    assert.deepEqual(log.providerAttempts, [{
      provider: 'openai',
      status: expected.status,
      httpStatus: expected.httpStatus,
      elapsedMs: 37,
      requestId: 'upstream-safe-id',
      errorCode: expected.code,
    }]);
    assert.doesNotMatch(logs[0], /NO_PUBLICAR|openai_secret_test|sk-private-key/i);
  }
});

test('el presupuesto predeterminado reserva 10 s para OpenAI y 4 s para el único fallback', async () => {
  const urls = [];
  const res = await post(
    { intent: 'workforce_summary', enhance: true },
    {
      env: { OPENAI_API_KEY: 'openai_test', HF_TOKEN: 'hf_test' },
      fetch: async (url) => {
        urls.push(url);
        if (url === 'https://api.openai.com/v1/responses') return { ok: false, status: 503 };
        return { ok: true, async json() { return { choices: [{ message: { content: 'Fallback agregado.' } }] }; } };
      },
    },
  );

  assert.deepEqual(urls, [
    'https://api.openai.com/v1/responses',
    'https://router.huggingface.co/v1/chat/completions',
  ]);
  assert.equal(res.payload.provider.provider, 'huggingface');
  assert.equal(res.payload.provider.limits.totalTimeoutMs, 14000);
  assert.equal(res.payload.provider.limits.openAITimeoutMs, 10000);
  assert.equal(res.payload.provider.limits.huggingFaceTimeoutMs, 4000);
  assert.equal(res.payload.provider.limits.timeoutMs, 4000);
});

test('OpenAI Responses conserva minimal para gpt-5-mini configurado y aplica 320 tokens', async () => {
  let providerBody;
  const res = await post(
    { intent: 'integration_quality', enhance: true },
    {
      env: { OPENAI_API_KEY: 'openai_test', OPENAI_MODEL: 'gpt-5-mini' },
      fetch: async (_url, options) => {
        providerBody = JSON.parse(options.body);
        return {
          ok: true,
          async json() {
            return { output: [{ content: [{ type: 'output_text', text: 'GRH conserva la autoridad laboral.' }] }] };
          },
        };
      },
    },
  );

  assert.equal(res.payload.provider.provider, 'openai');
  assert.equal(res.payload.provider.status, 'used');
  assert.equal(res.payload.insight, 'GRH conserva la autoridad laboral.');
  assert.equal(providerBody.model, 'gpt-5-mini');
  assert.equal(providerBody.max_output_tokens, 320);
  assert.deepEqual(providerBody.reasoning, { effort: 'minimal' });
  assert.equal(res.payload.provider.reasoningEffort, 'minimal');
  assert.equal(res.payload.provider.limits.maxCallsPerRequest, 1);
  assert.equal(res.payload.provider.usage, null);
});

test('OpenAI ignora minimal heredado cuando el modelo gpt-5.4-mini no lo admite', async () => {
  let providerBody;
  const res = await post(
    { intent: 'integration_quality', enhance: true },
    {
      env: { OPENAI_API_KEY: 'openai_test', OPENAI_REASONING_EFFORT: 'minimal' },
      fetch: async (_url, options) => {
        providerBody = JSON.parse(options.body);
        return {
          ok: true,
          async json() {
            return { output: [{ content: [{ type: 'output_text', text: 'Respuesta compatible.' }] }] };
          },
        };
      },
    },
  );

  assert.equal(providerBody.model, 'gpt-5.4-mini');
  assert.deepEqual(providerBody.reasoning, { effort: 'none' });
  assert.equal(res.payload.provider.reasoningEffort, 'none');
  assert.equal(res.payload.provider.status, 'used');
});

test('una respuesta OpenAI incompleta queda explícita y no dispara un segundo proveedor', async () => {
  const requests = [];
  const res = await post(
    { intent: 'quality_analysis', enhance: true },
    {
      env: { OPENAI_API_KEY: 'openai_test', HF_TOKEN: 'hf_test' },
      fetch: async (url) => {
        requests.push(url);
        return {
          ok: true,
          async json() {
            return {
              status: 'incomplete',
              incomplete_details: { reason: 'max_output_tokens' },
              output_text: 'Texto parcial que no debe mostrarse.',
              usage: {
                input_tokens: 100,
                output_tokens: 320,
                total_tokens: 420,
                output_tokens_details: { reasoning_tokens: 280 },
              },
            };
          },
        };
      },
    },
  );

  assert.deepEqual(requests, ['https://api.openai.com/v1/responses']);
  assert.equal(res.payload.provider.provider, 'openai');
  assert.equal(res.payload.provider.status, 'incomplete_max_output_tokens');
  assert.equal(res.payload.provider.incompleteReason, 'max_output_tokens');
  assert.equal(res.payload.provider.externalProviderAttempted, true);
  assert.equal(res.payload.provider.externalProviderUsed, false);
  assert.equal(res.payload.insight, null, 'no debe publicar una salida truncada');
  assert.equal(Object.hasOwn(res.payload.provider, 'fallbackFrom'), false);
  assert.deepEqual(res.payload.provider.attempts, [
    {
      provider: 'openai', status: 'incomplete_max_output_tokens', model: 'gpt-5.4-mini',
      httpStatus: 200, elapsedMs: 0, requestId: null, errorCode: 'max_output_tokens',
    },
  ]);
  assert.deepEqual(res.payload.provider.usage, {
    promptTokens: 100, completionTokens: 320, totalTokens: 420, reasoningTokens: 280,
  });
});

test('una falla de OpenAI habilita un único fallback agregado a Hugging Face', async () => {
  const requests = [];
  const logs = [];
  const res = await post(
    { intent: 'payroll_control', message: 'Analizá PERSONA LOCAL', enhance: true },
    {
      env: { OPENAI_API_KEY: 'openai_test', HF_TOKEN: 'hf_test' },
      logger: { info(value) { logs.push(value); } },
      fetch: async (url, options) => {
        requests.push({ url, options });
        if (url === 'https://api.openai.com/v1/responses') return { ok: false, status: 429 };
        return {
          ok: true,
          async json() {
            return { choices: [{ message: { content: 'La corrida abierta no es un KPI financiero publicable.' } }] };
          },
        };
      },
    },
  );

  assert.deepEqual(requests.map((request) => request.url), [
    'https://api.openai.com/v1/responses',
    'https://router.huggingface.co/v1/chat/completions',
  ]);
  assert.equal(res.payload.provider.provider, 'huggingface');
  assert.equal(res.payload.provider.status, 'used');
  assert.deepEqual(res.payload.provider.fallbackFrom, { provider: 'openai', status: 'upstream_rate_limited' });
  assert.deepEqual(res.payload.provider.attempts, [
    {
      provider: 'openai', status: 'upstream_rate_limited', model: 'gpt-5.4-mini',
      httpStatus: 429, elapsedMs: 0, requestId: null, errorCode: 'rate_limit_exceeded',
    },
    {
      provider: 'huggingface', status: 'used', model: 'openai/gpt-oss-120b:fastest',
      httpStatus: 200, elapsedMs: 0, requestId: null, errorCode: null,
    },
  ]);
  assert.equal(res.payload.provider.limits.maxCallsPerRequest, 2);
  assert.equal(res.payload.provider.limits.totalTimeoutMs, 14000);
  assert.equal(res.payload.provider.limits.openAITimeoutMs, 10000);
  assert.equal(res.payload.provider.limits.huggingFaceTimeoutMs, 4000);
  assert.equal(logs.length, 1);
  assert.deepEqual(JSON.parse(logs[0]).providerAttempts, [
    {
      provider: 'openai', status: 'upstream_rate_limited', httpStatus: 429,
      elapsedMs: 0, requestId: null, errorCode: 'rate_limit_exceeded',
    },
    {
      provider: 'huggingface', status: 'used', httpStatus: 200,
      elapsedMs: 0, requestId: null, errorCode: null,
    },
  ]);
  const serializedRequests = JSON.stringify(requests.map((request) => JSON.parse(request.options.body)));
  assert.doesNotMatch(serializedRequests, /PERSONA LOCAL|Analizá PERSONA/i);
});

test('HF Router recibe sólo hechos agregados, con timeout y tope de tokens', async () => {
  let request;
  const res = await post(
    { intent: 'workforce_summary', message: 'Dame una lectura ejecutiva', enhance: true },
    {
      env: {
        OPENAI_API_KEY: 'openai_test',
        HF_TOKEN: 'hf_secret_test',
        HF_MODEL: 'Qwen/test-model',
        HF_ASSISTANT_MAX_TOKENS: '180',
        HF_ASSISTANT_TIMEOUT_MS: '2500',
      },
      fetch: async (url, options) => {
        if (url === 'https://api.openai.com/v1/responses') return { ok: false, status: 503 };
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
  assert.equal(res.payload.provider.provider, 'huggingface');
  assert.equal(res.payload.provider.status, 'used');
  assert.equal(res.payload.insight, 'La brecha está reconciliada; corresponde mantener el control por estado.');
  assert.equal(request.url, 'https://router.huggingface.co/v1/chat/completions');
  assert.equal(request.options.headers.Authorization, 'Bearer hf_secret_test');
  const providerBody = JSON.parse(request.options.body);
  assert.equal(providerBody.model, 'Qwen/test-model');
  assert.equal(providerBody.max_tokens, 180);
  assert.equal(providerBody.temperature, 0.2);
  assert.equal(Object.hasOwn(providerBody, 'reasoning_effort'), false, 'HF Router no debe recibir el parámetro incompatible');
  const serialized = JSON.stringify(providerBody);
  assert.doesNotMatch(serialized, /PERSONA LOCAL|00000000|usuario@example\.test/i);
  assert.doesNotMatch(providerBody.messages[1].content, /Dame una lectura ejecutiva/i, 'no debe enviar el mensaje crudo');
  assert.equal(res.payload.privacy.rawUserMessageSentExternally, false);
  assert.equal(res.payload.provider.limits.maxCallsPerRequest, 2);
  assert.equal(res.payload.provider.limits.maxOutputTokens, 180);
  assert.equal(res.payload.provider.limits.timeoutMs, 2500);
});

test('HF tolera content por partes sin reasoning_effort e ignora todo reasoning_content', async () => {
  let hfBody;
  const res = await post(
    { intent: 'workforce_summary', enhance: true },
    {
      env: { OPENAI_API_KEY: 'openai_test', HF_TOKEN: 'hf_test' },
      fetch: async (url, options) => {
        if (url === 'https://api.openai.com/v1/responses') return { ok: false, status: 503 };
        hfBody = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          headers: { get(name) { return name === 'x-request-id' ? 'hf-safe-id' : null; } },
          async json() {
            return {
              choices: [{
                finish_reason: 'stop',
                message: {
                  reasoning_content: 'RAZONAMIENTO_PRIVADO_NO_PUBLICAR',
                  content: [
                    { type: 'reasoning', text: 'PARTE_RAZONAMIENTO_NO_PUBLICAR' },
                    { type: 'text', text: 'Primera conclusión verificada.' },
                    { type: 'output_text', text: { value: 'Segunda conclusión verificada.' } },
                  ],
                },
              }],
            };
          },
        };
      },
    },
  );

  assert.equal(hfBody.model, 'openai/gpt-oss-120b:fastest');
  assert.equal(Object.hasOwn(hfBody, 'reasoning_effort'), false);
  assert.equal(Object.hasOwn(res.payload.provider, 'reasoningEffort'), false);
  assert.equal(res.payload.insight, 'Primera conclusión verificada. Segunda conclusión verificada.');
  assert.equal(res.payload.provider.requestId, 'hf-safe-id');
  assert.doesNotMatch(JSON.stringify(res.payload.provider), /RAZONAMIENTO_PRIVADO|PARTE_RAZONAMIENTO|reasoning_content/i);
});

test('HF trata finish_reason length como salida incompleta y nunca publica texto parcial ni razonamiento', async () => {
  const res = await post(
    { intent: 'workforce_summary', enhance: true },
    {
      env: { OPENAI_API_KEY: 'openai_test', HF_TOKEN: 'hf_test' },
      fetch: async (url) => {
        if (url === 'https://api.openai.com/v1/responses') return { ok: false, status: 503 };
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              choices: [{
                finish_reason: 'length',
                message: {
                  content: 'TEXTO_PARCIAL_NO_PUBLICAR',
                  reasoning_content: 'RAZONAMIENTO_NO_PUBLICAR',
                },
              }],
            };
          },
        };
      },
    },
  );

  assert.equal(res.payload.provider.provider, 'huggingface');
  assert.equal(res.payload.provider.status, 'incomplete_max_output_tokens');
  assert.equal(res.payload.provider.incompleteReason, 'max_output_tokens');
  assert.equal(res.payload.provider.errorCode, 'max_output_tokens');
  assert.equal(res.payload.provider.externalProviderUsed, false);
  assert.equal(res.payload.insight, null);
  assert.doesNotMatch(JSON.stringify(res.payload.provider), /TEXTO_PARCIAL|RAZONAMIENTO_NO_PUBLICAR|reasoning_content/i);
});

test('HF clasifica fallas del fallback sin filtrar mensajes de error', async () => {
  const cases = [
    { httpStatus: 401, status: 'invalid_api_key', code: 'invalid_api_key' },
    { httpStatus: 403, status: 'access_denied', code: 'access_denied' },
    { httpStatus: 429, status: 'upstream_rate_limited', code: 'rate_limit_exceeded' },
    { httpStatus: 502, status: 'unavailable', code: 'upstream_error' },
  ];
  for (const expected of cases) {
    const res = await post(
      { intent: 'workforce_summary', enhance: true },
      {
        env: { OPENAI_API_KEY: 'openai_test', HF_TOKEN: 'hf_test' },
        fetch: async (url) => {
          if (url === 'https://api.openai.com/v1/responses') return { ok: false, status: 503 };
          return {
            ok: false,
            status: expected.httpStatus,
            async json() {
              return { error: { code: expected.code, message: 'HF_SECRET_MESSAGE_NO_PUBLICAR' } };
            },
          };
        },
      },
    );
    assert.equal(res.payload.provider.provider, 'huggingface');
    assert.equal(res.payload.provider.status, expected.status);
    assert.equal(res.payload.provider.httpStatus, expected.httpStatus);
    assert.equal(res.payload.provider.errorCode, expected.code);
    assert.doesNotMatch(JSON.stringify(res.payload.provider), /HF_SECRET_MESSAGE_NO_PUBLICAR|message/i);
  }
});

test('usa un modelo oficial de baja latencia cuando HF_MODEL no está configurado', async () => {
  let providerBody;
  const res = await post(
    { intent: 'workforce_summary', enhance: true },
    {
      env: { OPENAI_API_KEY: 'openai_test', HF_TOKEN: 'hf_test' },
      fetch: async (url, options) => {
        if (url === 'https://api.openai.com/v1/responses') return { ok: false, status: 503 };
        providerBody = JSON.parse(options.body);
        return { ok: true, async json() { return { choices: [{ message: { content: 'Lectura agregada.' } }] }; } };
      },
    },
  );
  assert.equal(res.payload.mode, 'hybrid');
  assert.equal(res.payload.provider.provider, 'huggingface');
  assert.equal(providerBody.model, 'openai/gpt-oss-120b:fastest');
  assert.equal(Object.hasOwn(providerBody, 'reasoning_effort'), false);
});

test('la falta del proveedor primario o una caída del fallback no rompe la respuesta local', async () => {
  let standaloneHfCalls = 0;
  const missing = await post(
    { intent: 'workforce_summary', enhance: true },
    {
      env: { HF_TOKEN: 'hf_without_primary' },
      fetch: async () => { standaloneHfCalls += 1; throw new Error('HF no debe funcionar como proveedor primario'); },
    },
  );
  assert.equal(missing.statusCode, 200);
  assert.equal(missing.payload.provider.provider, 'local');
  assert.equal(missing.payload.provider.status, 'primary_not_configured');
  assert.equal(missing.payload.provider.externalProviderAttempted, false);
  assert.equal(standaloneHfCalls, 0);
  assert.equal(missing.payload.data.gap, 28);

  const down = await post(
    { intent: 'workforce_summary', enhance: true },
    {
      env: { OPENAI_API_KEY: 'openai_test', HF_TOKEN: 'hf_test' },
      fetch: async () => ({ ok: false, status: 503 }),
    },
  );
  assert.equal(down.statusCode, 200);
  assert.equal(down.payload.provider.provider, 'huggingface');
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
    env: { OPENAI_API_KEY: 'openai_test', HF_ASSISTANT_CALLS_PER_WINDOW: '1' },
    quotaStore,
    fetch: async () => {
      fetchCalls += 1;
      return { ok: true, async json() { return { output_text: 'ok' }; } };
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
  assert.match(html, /Licencias históricas registradas/);
  assert.match(html, /Ver licencias del legajo/);
  assert.match(html, /Ficha y licencias históricas/);
  assert.match(html, /Asistida ·/);
  assert.match(html, /Lectura ejecutiva/);
  assert.match(html, /PLATFORM_OWNER_OPERATIVO_INTEGRAL:\s*'Propietario de plataforma · Operación integral'/);
  assert.match(html, /HUGO_APROBADOR_INTEGRAL:\s*'Aprobador municipal integral'/);
  assert.match(html, /CONSULTA_INTEGRAL:\s*'Consulta integral'/);
  assert.match(html, /role:\s*friendlyRoleLabel\(user\.role\)/);
  assert.doesNotMatch(html, /row\s*&&\s*row\.rawFields/);
});
