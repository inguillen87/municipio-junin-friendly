import { getInternalSql } from '../lib/internal-neon.js';
import { requireInternalSession } from '../lib/internal-session.js';
import {
  absenceAnalytics,
  employee,
  employees,
  integrationQuality,
  payrollControl,
} from './internal-data.js';
import {
  GLOSSARY,
  GUIDANCE_AS_OF,
  SECTION_CATALOG,
  TASK_CATALOG,
  getProductGuidanceCatalog,
} from '../assets/product-guidance.js';

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
  'absence_analysis',
  'employee_search',
  'employee_detail',
  'executive_analysis',
  'help_navigation',
  'section_explanation',
  'task_guidance',
  'glossary',
  'help',
]);

const GUIDANCE_INTENTS = new Set([
  'help_navigation',
  'section_explanation',
  'task_guidance',
  'glossary',
  'help',
]);

const EXTERNAL_ALLOWED_INTENTS = new Set([
  'workforce_summary',
  'payroll_control',
  'integration_quality',
  'absence_analysis',
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function includesPhrase(text, phrase) {
  const normalized = foldText(phrase);
  if (!normalized) return false;
  return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(normalized)}(?:$|[^a-z0-9])`, 'i').test(text);
}

function findCatalogEntry(catalog, value) {
  const text = foldText(value);
  if (!text) return null;
  return catalog
    .flatMap((entry) => entry.aliases.map((alias) => ({ entry, alias: foldText(alias) })))
    .filter(({ alias }) => includesPhrase(text, alias))
    .sort((left, right) => right.alias.length - left.alias.length)[0]?.entry || null;
}

function findTaskEntry(value) {
  const exact = findCatalogEntry(TASK_CATALOG, value);
  if (exact) return exact;
  const text = foldText(value);
  const section = findCatalogEntry(SECTION_CATALOG, text);
  if (!section) return null;
  if (section.id === 'personas' && includesPhrase(text, 'ficha')) {
    return TASK_CATALOG.find((task) => task.id === 'revisar_ficha') || null;
  }
  const defaultTaskBySection = {
    personas: 'buscar_empleado',
    estructura: 'explorar_estructura',
    integracion: 'revisar_integracion',
    nomina: 'controlar_nomina',
    asistente: 'consultar_asistente',
    ausentismo: 'revisar_ausentismo',
    calidad: 'auditar_calidad',
    reportes: 'leer_reporte',
  };
  return TASK_CATALOG.find((task) => task.id === defaultTaskBySection[section.id]) || null;
}

function publicSection(section) {
  if (!section) return null;
  const { aliases: _aliases, ...visible } = section;
  return { ...visible, actions: [...visible.actions], limits: [...visible.limits] };
}

function relatedSections(ids = []) {
  return ids
    .map((id) => SECTION_CATALOG.find((section) => section.id === id))
    .filter(Boolean)
    .map((section) => ({ id: section.id, label: section.label, targetPath: section.targetPath }));
}

export function getAssistantGuidanceCatalog() {
  return getProductGuidanceCatalog();
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

function absenceAnalyticsRequest(body = {}) {
  return {
    query: {
      from: normalizeText(body.from, 10),
      to: normalizeText(body.to, 10),
      sector: normalizeText(body.sector, 160),
      reasonCode: normalizeText(body.reasonCode, 64),
      bucket: normalizeText(body.bucket, 16) || 'month',
    },
  };
}

export function classifyAssistantRequest(body = {}) {
  const explicit = normalizeText(body.intent, 40).toLowerCase();
  if (explicit && INTENTS.has(explicit)) return explicit;
  if (body.contractId || body.legajo) return 'employee_detail';
  if (normalizeText(body.search, MAX_SEARCH_LENGTH)) return 'employee_search';
  if (normalizeText(body.term, 100)) return 'glossary';
  if (normalizeText(body.task, 100)) return 'task_guidance';
  if (normalizeText(body.section, 100)) return 'section_explanation';

  const message = foldText(body.message);
  if (/\b(?:que significa|que quiere decir|defini(?:r|cion)|glosario|termino)\b/.test(message)) return 'glossary';
  if (/\b(?:como (?:hago|puedo|se hace|busco|abro|reviso|controlo|audito|exploro|uso|interpreto|veo|buscar|abrir|revisar|controlar|auditar|explorar|usar|interpretar|ver)|paso a paso|guia para|quiero (?:buscar|abrir|revisar|controlar|auditar|explorar|usar))\b/.test(message)) return 'task_guidance';
  if (/\b(?:que hace|para que sirve|que muestra|que (?:puedo|se puede) hacer en|explica(?:me)? (?:la )?(?:seccion|pantalla|modulo))\b/.test(message)) return 'section_explanation';
  if (/\b(?:donde (?:esta|encuentro|veo|puedo)|como (?:llego|entro)|ir a|navegacion|navegar|menu|secciones|pantallas|onboarding|soy nuev[oa]|primer ingreso)\b/.test(message)) return 'help_navigation';
  if (/\b(?:ficha|detalle)\b/.test(message) && /\blegajo\b/.test(message)) return 'employee_detail';
  if (/\b(?:buscar|busca|encontrar|ficha)\b.*\b(?:emplead[oa]s?|personas?|legajos?)\b/.test(message)
      || /\b(?:emplead[oa]s?|personas?|legajos?)\b.*\b(?:buscar|busca|encontrar|ficha)\b/.test(message)) return 'employee_search';
  if (/\b(?:ausencias?|ausentismo|licencias?|eventos? de ausencia|faltas?)\b/.test(message)) return 'absence_analysis';
  if (/\b(?:nomina|liquidacion|haberes|sueldo|salario|corrida|julio|agosto)\b/.test(message)) return 'payroll_control';
  if (/\b(?:personas|crosswalk|integracion|coincidencia|identidad|padron)\b/.test(message)) return 'integration_quality';
  if (/\b(?:dotacion|activos?|liquidables?|brecha|plantel|cuantos?|882|854)\b/.test(message)) return 'workforce_summary';
  if (/\b(?:buscar|busca|encontrar|empleados?|directorio|ficha)\b/.test(message)) return 'employee_search';
  if (/\b(?:analiza|analisis|explica|recomendacion|diagnostico|ejecutivo)\b/.test(message)) return 'executive_analysis';
  if (/\b(?:ayuda|guia|tutorial|aprender|orientacion)\b/.test(message)) return 'help_navigation';
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

function aggregateMetric(row = {}) {
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  return {
    events: number(row.events),
    affectedContracts: number(row.affectedContracts),
    sourceDeclaredDays: number(row.sourceDeclaredDays),
  };
}

function aggregateRange(range = {}) {
  const date = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : null;
  return {
    from: date(range.from),
    to: date(range.to),
  };
}

function aggregateRanking(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 8).map((row) => ({
    label: normalizeText(row?.label, 160) || 'Sin clasificar',
    ...aggregateMetric(row),
  }));
}

function aggregateComparison(comparison = {}) {
  if (comparison.available !== true) {
    return {
      available: false,
      basis: 'previous_year_same_calendar_window',
      reason: normalizeText(comparison.reason, 240) || 'No hay una ventana interanual comparable para el rango efectivo.',
    };
  }
  const change = comparison.changePercent || {};
  const percent = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  return {
    available: true,
    basis: 'previous_year_same_calendar_window',
    current: {
      range: aggregateRange(comparison.current?.range),
      ...aggregateMetric(comparison.current),
    },
    previous: {
      range: aggregateRange(comparison.previous?.range),
      ...aggregateMetric(comparison.previous),
    },
    changePercent: {
      events: percent(change.events),
      affectedContracts: percent(change.affectedContracts),
      sourceDeclaredDays: percent(change.sourceDeclaredDays),
    },
  };
}

function absenceAnalysisResult(result) {
  const payload = result?.payload || {};
  const cutoff = payload.quality?.sourceCutoff || payload.meta?.source?.cutoff || null;
  const sources = [
    { system: 'GRH', relation: 'grh_absences', authority: 'absence_event_register' },
    { system: 'GRH', relation: 'grh_catalog_rows', authority: 'absence_reason_catalog' },
  ];
  if (result?.status !== 200 || payload.ok !== true) {
    return {
      status: result?.status || 503,
      answer: payload.error || 'No se pudo consultar la analítica agregada de ausentismo.',
      data: { code: normalizeText(payload.code, 80) || 'ABSENCE_ANALYTICS_UNAVAILABLE' },
      asOf: dateValue(cutoff),
      sources,
    };
  }

  const summary = aggregateMetric(payload.data?.summary);
  const range = {
    requested: aggregateRange(payload.range?.requested),
    effective: aggregateRange(payload.range?.effective),
    clamped: {
      from: payload.range?.clamped?.from === true,
      to: payload.range?.clamped?.to === true,
    },
  };
  const comparison = aggregateComparison(payload.data?.comparison);
  const topReasons = aggregateRanking(payload.data?.reasons);
  const topSectors = aggregateRanking(payload.data?.sectors);
  const leadingReason = topReasons[0];
  const comparisonText = comparison.available && comparison.changePercent.events !== null
    ? ` Frente al mismo tramo calendario del año anterior, la cantidad de eventos varió ${Number(comparison.changePercent.events).toLocaleString('es-AR', { maximumFractionDigits: 1, signDisplay: 'always' })}%.`
    : ' El rango elegido no habilita una comparación interanual homogénea.';
  const leadingReasonText = leadingReason
    ? ` El motivo con más registros es ${leadingReason.label}, con ${formatNumber(leadingReason.events)} eventos.`
    : '';

  return {
    answer: `Entre ${range.effective.from || 'el inicio disponible'} y ${range.effective.to || 'el corte disponible'}, GRH registra ${formatNumber(summary.events)} eventos administrativos de ausencia sobre ${formatNumber(summary.affectedContracts)} contratos laborales vinculados y ${formatNumber(summary.sourceDeclaredDays)} días declarados en origen.${leadingReasonText}${comparisonText} Estos datos no constituyen una tasa de ausentismo, presentismo, productividad ni jornadas perdidas.`,
    data: {
      summary,
      range,
      comparison,
      topReasons,
      topSectors,
      quality: {
        sourceCutoff: cutoff,
        unitSemantics: normalizeText(payload.quality?.unitSemantics, 320),
        sectorSemantics: normalizeText(payload.quality?.sectorSemantics || payload.meta?.sectorSemantics, 320),
      },
      methodology: {
        authority: 'GRH',
        grain: 'absence_event',
        ratesAvailable: false,
        comparisonPolicy: 'same_calendar_window_previous_year_only',
        sectorSemantics: normalizeText(payload.meta?.sectorSemantics || payload.quality?.sectorSemantics, 320),
      },
    },
    targetPath: '/ausentismo-control',
    relatedSections: relatedSections(['ausentismo', 'calidad']),
    asOf: dateValue(cutoff),
    sources,
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

function executiveResult(integration, payroll, scope, absence) {
  const workforce = workforceResult(integration, scope);
  const payrollView = payrollResult(payroll);
  const integrationView = integrationResult(integration, scope);
  const absenceView = absenceAnalysisResult(absence);
  const absenceAvailable = !absenceView.status || absenceView.status === 200;
  const partialNotice = absenceAvailable
    ? ''
    : ' La lectura ejecutiva es parcial: el bloque de ausentismo no está disponible y no se infirieron valores para reemplazarlo.';
  return {
    answer: `${workforce.answer} ${payrollView.answer} ${integrationView.answer} ${absenceView.answer}${partialNotice}`,
    data: {
      workforce: workforce.data,
      payroll: payrollView.data,
      integration: integrationView.data,
      absence: absenceView.data,
      partial: !absenceAvailable,
      errors: absenceAvailable
        ? []
        : [{ domain: 'absence', status: absenceView.status, code: absenceView.data?.code || 'ABSENCE_ANALYTICS_UNAVAILABLE' }],
    },
    asOf: workforce.asOf || payrollView.asOf || integrationView.asOf || absenceView.asOf,
    sources: [...workforce.sources, ...payrollView.sources, ...integrationView.sources, ...absenceView.sources],
  };
}

function guidanceSource(relation) {
  return [{ system: 'MUNICONTROL', relation, authority: 'verified_product_contract' }];
}

function guidanceQuery(body = {}) {
  return [body.message, body.section, body.task, body.term]
    .map((value) => normalizeText(value, MAX_MESSAGE_LENGTH))
    .filter(Boolean)
    .join(' ');
}

function helpNavigationResult(body = {}) {
  const matchedSection = findCatalogEntry(SECTION_CATALOG, guidanceQuery(body));
  const section = matchedSection?.id === 'ayuda' ? null : matchedSection;
  if (section) {
    const visible = publicSection(section);
    return {
      answer: `${section.label} está en el menú principal. ${section.purpose}`,
      data: { section: visible },
      steps: [`Abrí ${section.label} desde el menú principal.`, `Usá esta ruta directa: ${section.targetPath}.`, 'Antes de actuar, revisá los límites visibles de la sección.'],
      targetPath: section.targetPath,
      relatedSections: relatedSections([section.id, 'ayuda'].filter((id, index, ids) => ids.indexOf(id) === index)),
      asOf: GUIDANCE_AS_OF,
      sources: guidanceSource('section_catalog'),
    };
  }
  const sections = SECTION_CATALOG.map(publicSection);
  return {
    answer: 'El recorrido principal está organizado en Inicio, Personas, Estructura, Integración, Nómina, Asistente, Ausentismo, Calidad, Reportes y Ayuda. Decime qué tarea necesitás realizar y te indico la ruta exacta sin asumir permisos ni funciones inexistentes.',
    data: { sections },
    steps: ['Elegí la tarea que querés resolver.', 'Abrí la sección sugerida desde el menú.', 'Revisá fuente, fecha de corte y límites antes de usar el resultado.'],
    targetPath: '/centro-ayuda',
    relatedSections: relatedSections(SECTION_CATALOG.map((item) => item.id)),
    asOf: GUIDANCE_AS_OF,
    sources: guidanceSource('section_catalog'),
  };
}

function sectionExplanationResult(body = {}) {
  const section = findCatalogEntry(SECTION_CATALOG, guidanceQuery(body));
  if (!section) {
    return {
      answer: 'Puedo explicar Inicio, Personas, Estructura, Integración, Nómina, Asistente, Ausentismo, Calidad, Reportes o Ayuda. Indicá el nombre de la sección para describir sólo funciones verificadas.',
      data: { sections: SECTION_CATALOG.map(({ id, label, targetPath }) => ({ id, label, targetPath })) },
      steps: [],
      targetPath: '/centro-ayuda#modulos',
      relatedSections: relatedSections(SECTION_CATALOG.map((item) => item.id)),
      asOf: GUIDANCE_AS_OF,
      sources: guidanceSource('section_catalog'),
    };
  }
  return {
    answer: `${section.label}: ${section.purpose} Acciones disponibles: ${section.actions.join('; ')}. Límites: ${section.limits.join('; ')}.`,
    data: { section: publicSection(section) },
    steps: [`Abrí ${section.label}.`, 'Elegí una de las acciones disponibles.', 'Leé los límites de la vista antes de interpretar o comunicar el resultado.'],
    targetPath: section.targetPath,
    relatedSections: relatedSections([section.id, 'ayuda'].filter((id, index, ids) => ids.indexOf(id) === index)),
    asOf: GUIDANCE_AS_OF,
    sources: guidanceSource('section_catalog'),
  };
}

function taskGuidanceResult(body = {}) {
  const task = findTaskEntry(guidanceQuery(body));
  if (!task) {
    return {
      answer: 'Puedo guiarte para buscar un empleado, revisar una ficha, explorar la estructura, controlar nómina, revisar la integración, revisar ausentismo, auditar calidad, interpretar reportes o usar el asistente. Indicá una de esas tareas para recibir pasos concretos.',
      data: {
        tasks: TASK_CATALOG.map(({ id, label, sectionId, steps }) => ({ id, label, sectionId, steps })),
      },
      steps: ['Describí la tarea con un verbo y un objeto; por ejemplo: “cómo buscar un empleado”.', 'Seguí el recorrido devuelto y verificá los límites de la sección de destino.'],
      targetPath: '/centro-ayuda#tareas',
      relatedSections: relatedSections(SECTION_CATALOG.map((item) => item.id)),
      asOf: GUIDANCE_AS_OF,
      sources: guidanceSource('task_catalog'),
    };
  }
  const section = SECTION_CATALOG.find((item) => item.id === task.sectionId);
  return {
    answer: `${task.label}: seguí estos ${task.steps.length} pasos. El recorrido describe la interfaz disponible y no ejecuta cambios administrativos.`,
    data: {
      task: { id: task.id, label: task.label, sectionId: task.sectionId },
      section: publicSection(section),
    },
    steps: [...task.steps],
    targetPath: section?.targetPath || '/asistente',
    relatedSections: relatedSections([task.sectionId, 'ayuda']),
    asOf: GUIDANCE_AS_OF,
    sources: guidanceSource('task_catalog'),
  };
}

function glossaryResult(body = {}) {
  const term = findCatalogEntry(GLOSSARY, guidanceQuery(body));
  if (!term) {
    return {
      answer: 'El glosario disponible incluye GRH, PERSONAS, crosswalk, legajo, activo administrativo, activo liquidable, corrida cerrada, corrida abierta y dato nominal. Indicá un término para ver su definición y las secciones relacionadas.',
      data: { terms: GLOSSARY.map(({ id, label }) => ({ id, label })) },
      steps: [],
      targetPath: '/centro-ayuda#glosario',
      relatedSections: relatedSections(['ayuda', 'calidad']),
      asOf: GUIDANCE_AS_OF,
      sources: guidanceSource('municipal_glossary'),
    };
  }
  const sections = relatedSections(term.relatedSectionIds);
  return {
    answer: `${term.label}: ${term.definition}`,
    data: { term: { id: term.id, label: term.label, definition: term.definition } },
    steps: [],
    targetPath: sections[0]?.targetPath || '/asistente',
    relatedSections: sections,
    asOf: GUIDANCE_AS_OF,
    sources: guidanceSource('municipal_glossary'),
  };
}

function productGuidanceResult(intent, body) {
  if (intent === 'section_explanation') return sectionExplanationResult(body);
  if (intent === 'task_guidance') return taskGuidanceResult(body);
  if (intent === 'glossary') return glossaryResult(body);
  return helpNavigationResult(body);
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
  if (intent === 'absence_analysis') {
    if (!data?.summary || !data?.range) return null;
    const ranking = (rows) => (Array.isArray(rows) ? rows : [])
      .filter((row) => Number(row?.events || 0) >= 5 && Number(row?.affectedContracts || 0) >= 5)
      .slice(0, 5)
      .map((row) => ({
        label: normalizeText(row?.label, 160),
        ...aggregateMetric(row),
      }));
    const comparison = aggregateComparison(data.comparison);
    const safeComparison = comparison.available
      && comparison.current.affectedContracts >= 5
      && comparison.previous.affectedContracts >= 5
      ? comparison
      : {
        available: false,
        basis: 'previous_year_same_calendar_window',
        reason: comparison.available ? 'suppressed_small_cohort' : comparison.reason,
      };
    return {
      summary: aggregateMetric(data.summary),
      range: {
        effective: aggregateRange(data.range?.effective),
      },
      comparison: safeComparison,
      topReasons: ranking(data.topReasons),
      topSectors: ranking(data.topSectors),
      methodology: {
        ratesAvailable: false,
        sectorSemantics: normalizeText(data.methodology?.sectorSemantics, 320),
      },
    };
  }
  if (intent === 'executive_analysis') {
    return {
      workforce: providerFacts('workforce_summary', data.workforce),
      payroll: providerFacts('payroll_control', data.payroll),
      integration: providerFacts('integration_quality', data.integration),
      absence: providerFacts('absence_analysis', data.absence),
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
  if (GUIDANCE_INTENTS.has(intent)) return providerStatus('not_allowed_for_product_guidance');
  if (!EXTERNAL_ALLOWED_INTENTS.has(intent)) return providerStatus('not_allowed_for_nominal_or_unknown_intent');
  const absenceAffectedContracts = intent === 'absence_analysis'
    ? Number(data?.summary?.affectedContracts || 0)
    : intent === 'executive_analysis'
      ? Number(data?.absence?.summary?.affectedContracts || 0)
      : null;
  if (absenceAffectedContracts !== null && absenceAffectedContracts < 5) {
    return providerStatus('suppressed_small_cohort', { minimumAffectedContracts: 5 });
  }
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
    absence_analysis: 'Explicá los eventos administrativos de ausencia, su comparación homogénea y sus límites metodológicos. No los conviertas en tasa, presentismo, productividad ni jornadas perdidas.',
    executive_analysis: 'Redactá una lectura ejecutiva breve de dotación, nómina, integración y ausentismo. Priorizá controles accionables, no inventes causas y no conviertas eventos de ausencia en tasas, presentismo, productividad ni jornadas perdidas.',
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
      { intent: 'absence_analysis', externalEnhancement: true },
      { intent: 'employee_search', externalEnhancement: false },
      { intent: 'employee_detail', externalEnhancement: false },
      { intent: 'executive_analysis', externalEnhancement: true },
      { intent: 'help_navigation', externalEnhancement: false },
      { intent: 'section_explanation', externalEnhancement: false },
      { intent: 'task_guidance', externalEnhancement: false },
      { intent: 'glossary', externalEnhancement: false },
    ],
    guidance: {
      asOf: GUIDANCE_AS_OF,
      sections: SECTION_CATALOG.map(({ id, label, targetPath }) => ({ id, label, targetPath })),
      policy: 'verified_product_catalog_only',
    },
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
  const loadAbsence = dependencies.absenceAnalytics ?? absenceAnalytics;
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
      if (!message && !body.intent && !body.search && !body.contractId && !body.legajo && !body.section && !body.task && !body.term) {
        return send(res, 400, { ok: false, code: 'ASSISTANT_QUERY_REQUIRED', error: 'Escribí una consulta para el asistente' });
      }
      const intent = classifyAssistantRequest(body);
      let result;

      if (GUIDANCE_INTENTS.has(intent)) {
        result = productGuidanceResult(intent, body);
      } else {
        const sql = await getSql();
        if (intent === 'workforce_summary') {
          const [integration, scope] = await Promise.all([loadIntegration(sql), loadScope(sql)]);
          result = workforceResult(integration, scope);
        } else if (intent === 'payroll_control') {
          result = payrollResult(await loadPayroll(sql));
        } else if (intent === 'integration_quality') {
          const [integration, scope] = await Promise.all([loadIntegration(sql), loadScope(sql)]);
          result = integrationResult(integration, scope);
        } else if (intent === 'absence_analysis') {
          result = absenceAnalysisResult(await loadAbsence(sql, absenceAnalyticsRequest(body)));
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
          const [integration, payroll, scope, absence] = await Promise.all([
            loadIntegration(sql),
            loadPayroll(sql),
            loadScope(sql),
            loadAbsence(sql, absenceAnalyticsRequest(body)),
          ]);
          result = executiveResult(integration, payroll, scope, absence);
        } else {
          result = productGuidanceResult('help', body);
        }
      }

      if (result.status && result.status !== 200) {
        return send(res, result.status, {
          ok: false,
          intent,
          answer: result.answer,
          data: result.data,
          steps: result.steps || [],
          targetPath: result.targetPath || null,
          relatedSections: result.relatedSections || [],
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
        steps: result.steps || [],
        targetPath: result.targetPath || null,
        relatedSections: result.relatedSections || [],
        sources: result.sources.map((source) => ({ ...source, asOf: result.asOf })),
        asOf: result.asOf,
        privacy: {
          internalSessionRequired: true,
          nominalDataExternalized: false,
          rawUserMessageSentExternally: false,
          nominalQueries: ['employee_search', 'employee_detail'].includes(intent) ? 'local_database_only' : null,
          guidanceContent: GUIDANCE_INTENTS.has(intent) ? 'verified_product_catalog_only' : null,
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
