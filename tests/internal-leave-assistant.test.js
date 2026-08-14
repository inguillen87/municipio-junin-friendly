import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyAssistantRequest, createInternalAssistantHandler } from '../api/internal-assistant.js';

function responseRecorder() {
  return {
    headers: {}, statusCode: null, payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return value; },
  };
}

function legalCatalog({ withoutArticle44 = false } = {}) {
  const keyRules = [
    { id: 'health-under-5-no-family', article: '40', label: 'Salud, menos de 5 anos, sin cargas', value: 3, status: 'conditional', unit: 'month', manualGate: 'control_medico' },
    { id: 'health-over-5-no-family', article: '40', label: 'Salud, mas de 5 anos, sin cargas', value: 6, status: 'conditional', unit: 'month', manualGate: 'control_medico' },
    { id: 'health-exactly-5', article: '40', label: 'Salud, antiguedad exactamente 5 anos', value: null, status: 'not_calculable', unit: null, manualGate: 'ambiguedad_textual_legal' },
    { id: 'work-accident-art44-repealed', article: '44', label: 'Accidente o enfermedad laboral', value: 'Articulo 44 derogado; aplicar el regimen ART vigente', status: 'not_calculable', unit: null, manualGate: 'art_rrhh_y_asesoria_letrada' },
    { id: 'marriage', article: '50.2', label: 'Matrimonio', value: 10, status: 'conditional', unit: 'calendar_day', manualGate: 'acreditacion' },
    { id: 'exam', article: '50.5', label: 'Examen', value: '3 por examen; maximo 21 por ano calendario', status: 'conditional', unit: 'calendar_day', manualGate: 'certificado' },
    { id: 'tardiness', article: '65', label: 'Impuntualidad', value: 'Bandas expresas con vacio normativo', status: 'not_calculable', unit: 'schedule_dependent', manualGate: 'fichada_horario_y_resolucion' },
  ].filter((rule) => !withoutArticle44 || rule.article !== '44');
  return {
    version: 'mendoza-ley-5811-title-vi.v1',
    verifiedAt: '2026-08-14',
    sources: [{
      id: 'ley-5811-consolidada', authority: 'Argentina.gob.ar',
      status: 'official_current_consolidation', url: 'https://www.argentina.gob.ar/normativa/provincial/ley-5811-test',
    }],
    provisions: [
      { id: 'annual-ordinary', article: '37 y 38', label: 'Licencia anual ordinaria', automation: 'conditional', unit: 'calendar_day', summary: 'Escala por antiguedad y regla proporcional para servicio corto.', requiredFacts: ['recognizedSeniority'] },
      { id: 'health', article: '40 a 49', label: 'Razones de salud', automation: 'human_validation_required', unit: 'calendar_day', summary: 'Depende de antiguedad, cargas, recurrencia y control medico.', requiredFacts: ['medicalEvidence'] },
      { id: 'special', article: '50', label: 'Licencias especiales', automation: 'mixed', unit: 'rule_specific', summary: 'Cada inciso exige evidencia propia.', requiredFacts: ['eventEvidence'] },
      { id: 'attendance', article: '65', label: 'Inasistencias y tardanzas', automation: 'not_calculable_with_current_grh', unit: 'schedule_dependent', summary: 'Requiere turnos, fichadas y calendario homologado.', requiredFacts: ['workScheduleAssignment'] },
    ],
    annualLeaveTiers: [
      { minExclusiveYears: 0.5, maxInclusiveYears: 5, days: 14, article: '37.a' },
      { minExclusiveYears: 5, maxInclusiveYears: 10, days: 21, article: '37.b' },
      { minExclusiveYears: 10, maxInclusiveYears: 20, days: 28, article: '37.c' },
      { minExclusiveYears: 20, maxInclusiveYears: null, days: 35, article: '37.d' },
    ],
    keyRules,
    applicability: { status: 'conditional_pending_complete_junin_profile' },
  };
}

async function askLeavePolicy(message, catalog, options = {}) {
  let externalCalls = 0;
  const handler = createInternalAssistantHandler({
    requireInternalSession: () => ({ id: 'user-1', email: 'usuario@example.test' }),
    getInternalSql: async () => ({ query: async () => [] }),
    leaveNormative: async () => ({
      status: 200,
      payload: {
        ok: true,
        data: {
          legal: catalog,
          readiness: {
            absences: { sourceRows: 31572 },
            reasonCatalog: { rows: 27 },
            workedHours: { status: 'not_calculable' },
            leaveBalance: { status: 'not_calculable' },
          },
          mappings: [],
        },
        meta: { source: { cutoff: '2026-08-06' } },
      },
    }),
    fetch: async () => { externalCalls += 1; throw new Error('no debe llamarse'); },
    env: { OPENAI_API_KEY: 'test', HF_TOKEN: 'test' },
    logger: { info() {} },
    requestIdFactory: () => 'request-leave-article-test',
  });
  const res = responseRecorder();
  await handler({
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: { message, enhance: true, ...options },
  }, res);
  return { res, externalCalls };
}

test('clasifica consultas legales sin romper consultas nominales ni agregadas', () => {
  assert.equal(classifyAssistantRequest({ message: 'Explicame la Ley 5811 Titulo VI' }), 'leave_policy');
  assert.equal(classifyAssistantRequest({ message: 'Cuantos dias de licencia anual corresponden por antiguedad' }), 'leave_policy');
  assert.equal(classifyAssistantRequest({ message: 'Que dice el articulo 50 sobre licencias' }), 'leave_policy');
  assert.equal(classifyAssistantRequest({ message: 'Que dice el art. 40' }), 'leave_policy');
  assert.equal(classifyAssistantRequest({ message: 'Interpretar articulos 37 a 65 de la Ley 5811' }), 'leave_policy');
  assert.equal(classifyAssistantRequest({ message: 'licencias de Persona de Prueba' }), 'employee_search');
  assert.equal(classifyAssistantRequest({ message: 'licencias por sector en 2026' }), 'absence_analysis');
});

test('politica de licencias responde local con fuentes oficiales y sin proveedor externo', async () => {
  let externalCalls = 0;
  const handler = createInternalAssistantHandler({
    requireInternalSession: () => ({ id: 'user-1', email: 'usuario@example.test' }),
    getInternalSql: async () => ({ query: async () => [] }),
    leaveNormative: async () => ({
      status: 200,
      payload: {
        ok: true,
        data: {
          legal: {
            version: 'mendoza-ley-5811-title-vi.v1',
            verifiedAt: '2026-08-14',
            sources: [{
              id: 'ley-5811-consolidada', authority: 'Argentina.gob.ar',
              status: 'official_current_consolidation', url: 'https://www.argentina.gob.ar/normativa/provincial/ley-5811-test',
            }],
            annualLeaveTiers: [{ minExclusiveYears: 0.5, maxInclusiveYears: 5, days: 14 }],
            keyRules: [{ id: 'health-exactly-5', status: 'not_calculable' }],
            applicability: { status: 'conditional_pending_complete_junin_profile' },
          },
          readiness: {
            absences: { sourceRows: 31572 },
            reasonCatalog: { rows: 27 },
            workedHours: { status: 'not_calculable' },
            leaveBalance: { status: 'not_calculable' },
          },
          mappings: [{ reasonCode: '10', label: 'Cuidado familiar', policy: { status: 'configuration_conflict', note: 'Validar' } }],
        },
        meta: { source: { cutoff: '2026-08-06' } },
      },
    }),
    fetch: async () => { externalCalls += 1; throw new Error('no debe llamarse'); },
    env: { OPENAI_API_KEY: 'test', HF_TOKEN: 'test' },
    logger: { info() {} },
    requestIdFactory: () => 'request-leave-test',
  });
  const res = responseRecorder();
  await handler({
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: { message: 'Explicame la Ley 5811 Titulo VI', enhance: true },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.intent, 'leave_policy');
  assert.equal(res.payload.queryPlan.externalPolicy, 'local_only');
  assert.equal(res.payload.provider.provider, 'local');
  assert.equal(externalCalls, 0);
  assert.match(res.payload.answer, /14, 21, 28 o 35 dias/i);
  assert.equal(res.payload.data.readiness.workedHours.status, 'not_calculable');
  assert.equal(res.payload.targetPath, '/licencias-control');
  assert.equal(res.payload.sources[0].authority, 'official_current_consolidation');
});

test('articulo 50 selecciona y resume solo las licencias especiales del catalogo real', async () => {
  const { res, externalCalls } = await askLeavePolicy('Que dice el articulo 50 sobre licencias especiales', legalCatalog());
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload.queryPlan.filters.articles, ['50']);
  assert.equal(res.payload.data.selection.scope, 'requested_articles');
  assert.deepEqual(res.payload.data.selection.matchedProvisionIds, ['special']);
  assert.deepEqual(res.payload.data.selection.matchedRuleIds, ['marriage', 'exam']);
  assert.deepEqual(res.payload.data.keyRules.map((rule) => rule.article), ['50.2', '50.5']);
  assert.match(res.payload.answer, /Licencias especiales \(art\. 50\)/i);
  assert.match(res.payload.answer, /Matrimonio.*10 dias corridos/i);
  assert.match(res.payload.answer, /Examen.*3 por examen/i);
  assert.doesNotMatch(res.payload.answer, /menos de 5 anos/i);
  assert.equal(res.payload.provider.provider, 'local');
  assert.equal(res.payload.queryPlan.externalPolicy, 'local_only');
  assert.equal(externalCalls, 0);
});

test('articulo 40 conserva los tramos de salud y falla cerrado en el borde exacto de 5 anos', async () => {
  const { res, externalCalls } = await askLeavePolicy(
    'Explicame el art. 40 para salud',
    legalCatalog(),
    { intent: 'leave_policy', article: 40 },
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload.queryPlan.filters.articles, ['40']);
  assert.deepEqual(res.payload.data.selection.matchedProvisionIds, ['health']);
  assert.deepEqual(res.payload.data.selection.matchedRuleIds, [
    'health-under-5-no-family',
    'health-over-5-no-family',
    'health-exactly-5',
  ]);
  const exact = res.payload.data.keyRules.find((rule) => rule.id === 'health-exactly-5');
  assert.equal(exact.value, null);
  assert.equal(exact.status, 'not_calculable');
  assert.equal(exact.manualGate, 'ambiguedad_textual_legal');
  assert.match(res.payload.answer, /exactamente igual a 5 años/i);
  assert.match(res.payload.answer, /no calculable/i);
  assert.match(res.payload.answer, /no elige un tramo/i);
  assert.equal(res.payload.provider.provider, 'local');
  assert.equal(externalCalls, 0);
});

test('articulo 44 usa la regla catalogada y si falta avisa sin inventar ni mutar el catalogo', async () => {
  const presentCatalog = legalCatalog();
  const present = await askLeavePolicy('Que dispone el articulo 44', presentCatalog);
  assert.equal(present.res.statusCode, 200);
  assert.deepEqual(present.res.payload.data.selection.matchedRuleIds, ['work-accident-art44-repealed']);
  assert.match(present.res.payload.answer, /aplicar el regimen ART vigente/i);
  assert.deepEqual(present.res.payload.data.selection.warnings, []);
  assert.equal(present.externalCalls, 0);

  const missingCatalog = legalCatalog({ withoutArticle44: true });
  const originalRuleIds = missingCatalog.keyRules.map((rule) => rule.id);
  const missing = await askLeavePolicy('Que dispone el articulo 44', missingCatalog);
  assert.equal(missing.res.statusCode, 200);
  assert.deepEqual(missing.res.payload.data.selection.matchedProvisionIds, ['health']);
  assert.deepEqual(missing.res.payload.data.selection.matchedRuleIds, []);
  assert.match(missing.res.payload.data.selection.warnings[0], /no contiene una regla especifica/i);
  assert.match(missing.res.payload.answer, /no se infiere su texto, vigencia ni efecto/i);
  assert.deepEqual(missingCatalog.keyRules.map((rule) => rule.id), originalRuleIds, 'el asistente no debe completar ni mutar el catalogo');
  assert.equal(missing.res.payload.provider.provider, 'local');
  assert.equal(missing.externalCalls, 0);
});

test('articulo 65 selecciona la provision y regla de asistencia sin convertirla en calculo', async () => {
  const { res } = await askLeavePolicy('Que dice el articulo 65 del Titulo VI', legalCatalog());
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload.data.selection.matchedProvisionIds, ['attendance']);
  assert.deepEqual(res.payload.data.selection.matchedRuleIds, ['tardiness']);
  assert.equal(res.payload.data.keyRules[0].status, 'not_calculable');
  assert.match(res.payload.answer, /requiere turnos, fichadas y calendario homologado/i);
  assert.equal(res.payload.privacy.localOnlyResource, true);
});
