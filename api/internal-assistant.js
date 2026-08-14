import { getInternalSql } from '../lib/internal-neon.js';
import { requireInternalSession } from '../lib/internal-session.js';
import * as internalData from './internal-data.js';
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
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_OPENAI_MODEL = 'gpt-5-mini';
const DEFAULT_OPENAI_REASONING_EFFORT = 'minimal';
const DEFAULT_OPENAI_TIMEOUT_MS = 4_000;
const HF_ROUTER_URL = 'https://router.huggingface.co/v1/chat/completions';
const DEFAULT_HF_MODEL = 'openai/gpt-oss-120b:fastest';
const DEFAULT_HF_TIMEOUT_MS = 6_000;
const DEFAULT_AI_OUTPUT_TOKENS = 320;
const DEFAULT_HF_CALLS_PER_WINDOW = 3;
const DEFAULT_HF_WINDOW_MS = 60_000;
const DEFAULT_AI_TOTAL_TIMEOUT_MS = 7_000;

const INTENTS = new Set([
  'workforce_summary',
  'payroll_control',
  'integration_quality',
  'quality_analysis',
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
  'quality_analysis',
  'absence_analysis',
  'executive_analysis',
]);

const EXTERNAL_FORBIDDEN_FIELDS = /\b(?:dni|cuil|nombre|apellido|legajo|domicilio|direcci[oó]n|tel[eé]fono|email|contract[_-]?id|source[_-]?id|canonical[_-]?id|issue[_-]?id|observed[_-]?value|import[_-]?lineage)\b/i;
const quotaByRuntime = new Map();
const OPENAI_REASONING_EFFORTS = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);

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

function foldAssistantQuery(value) {
  return foldText(value)
    .replace(/\blicnecias?\b/g, 'licencias')
    .replace(/\blicensias?\b/g, 'licencias')
    .replace(/\bausensias?\b/g, 'ausencias')
    .replace(/\baucencias?\b/g, 'ausencias');
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
    .replace(/^(?:(?:a|al|la|el|una?|un)\s+)?(?:emplead[oa]|persona|legajo)\s+/i, '')
    .replace(/\b(?:por favor|en grh|en la base)\b.*$/i, '')
    .trim();
  return /^(?:empleados?|personas?|todos?|lista|directorio)$/i.test(candidate) ? '' : candidate;
}

function employeeRecordFocus(message) {
  const text = foldAssistantQuery(message);
  if (/\blicencias?\b/.test(text)) return 'licenses';
  if (/\b(?:ausencias?|ausentismo|faltas?)\b/.test(text)) return 'absences';
  return '';
}

function extractEmployeeRecordYear(message) {
  const text = foldAssistantQuery(message);
  const match = text.match(/\b(?:en|durante|para)\s+(?:(?:el|la)\s+)?(?:(?:ano|periodo)\s+)?((?:19|20)\d{2}|2100)\b/)
    || text.match(/\b(?:ano|periodo)\s+((?:19|20)\d{2}|2100)\b/);
  return match ? Number(match[1]) : null;
}

function cleanEmployeeRecordCandidate(value) {
  const candidate = normalizeText(value, MAX_SEARCH_LENGTH)
    .replace(/\b(?:por favor|en grh|en la base)\b.*$/i, '')
    .replace(/\s+(?:en|durante|para)\s+(?:(?:el|la)\s+)?(?:(?:a[nñ]o|periodo)\s+)?(?:19|20)\d{2}\b.*$/i, '')
    .replace(/[?.!,;:]+$/g, '')
    .trim();
  const folded = foldAssistantQuery(candidate);
  if (!candidate || /^(?:(?:el|la|los|las|este|esta|estos|estas|ultimo|ultima|ultimos|ultimas)\s+)*(?:ano|mes|periodo|sector|motivo|rango|fecha|todos?|general|actual|hoy|202\d)\b/i.test(folded)) return '';
  if (/^(?:el\s+)?(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+(?:de\s+)?(?:19|20)\d{2})?$/i.test(folded)) return '';
  if (!/[a-zA-Z\u00c0-\u024f]/.test(candidate)) return '';
  return candidate;
}

function extractEmployeeRecordSearch(message) {
  const text = normalizeText(message, MAX_SEARCH_LENGTH + 120);
  const direct = text.match(/\b(?:licencias?|licnecias?|licensias?|ausencias?|ausensias?|aucencias?|ausentismo|faltas?)\s+(?:(?:actuales?|hist[oó]ricas?|registrad[ao]s?)\s+)?(?:de|del)\s+(?:(?:la|el)\s+)?(?:(?:emplead[oa]|persona)\s+)?(.+)$/i);
  if (direct) return cleanEmployeeRecordCandidate(direct[1]);
  const possession = text.match(/\b(?:qu[eé]\s+)?(?:licencias?|licnecias?|licensias?|ausencias?|ausensias?|aucencias?|ausentismo|faltas?)\s+(?:que\s+)?(?:tiene|tuvo|registra)\s+(.+)$/i);
  return possession ? cleanEmployeeRecordCandidate(possession[1]) : '';
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

  const message = foldAssistantQuery(body.message);
  const recordFocus = employeeRecordFocus(message);
  if (recordFocus && extractLegajo(body.message)) return 'employee_detail';
  if (recordFocus && extractEmployeeRecordSearch(body.message)) return 'employee_search';
  if (/\b(?:que significa|que quiere decir|defini(?:r|cion)|glosario|termino)\b/.test(message)) return 'glossary';
  if (/\b(?:como (?:hago|puedo|se hace|busco|abro|reviso|controlo|audito|exploro|uso|interpreto|veo|buscar|abrir|revisar|controlar|auditar|explorar|usar|interpretar|ver)|paso a paso|guia para|quiero (?:buscar|abrir|revisar|controlar|auditar|explorar|usar))\b/.test(message)) return 'task_guidance';
  if (/\b(?:que hace|para que sirve|que muestra|que (?:puedo|se puede) hacer en|explica(?:me)? (?:la )?(?:seccion|pantalla|modulo))\b/.test(message)) return 'section_explanation';
  if (/\b(?:donde (?:esta|encuentro|veo|puedo)|como (?:llego|entro)|ir a|navegacion|navegar|menu|secciones|pantallas|onboarding|soy nuev[oa]|primer ingreso)\b/.test(message)) return 'help_navigation';
  if (/\b(?:ficha|detalle)\b/.test(message) && /\blegajo\b/.test(message)) return 'employee_detail';
  if (/\b(?:buscar|busca|encontrar|ficha)\b.*\b(?:emplead[oa]s?|personas?|legajos?)\b/.test(message)
      || /\b(?:emplead[oa]s?|personas?|legajos?)\b.*\b(?:buscar|busca|encontrar|ficha)\b/.test(message)) return 'employee_search';
  if (/\b(?:resumen|lectura|panorama|informe|analisis)\s+(?:general\s+)?ejecutiv[oa]\b/.test(message)) return 'executive_analysis';
  if (/\b(?:calidad(?: de datos| operativa)?|dq-?01|hallazgos?|severidad|controles? de calidad|controles? de personas)\b/.test(message)) return 'quality_analysis';
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

function qualityCount(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : fallback;
}

function qualityCountMap(value, allowedKeys) {
  const output = Object.fromEntries(allowedKeys.map((key) => [key, 0]));
  if (Array.isArray(value)) {
    value.forEach((row) => {
      const key = foldText(row?.severity || row?.resolutionStatus || row?.status || row?.key || row?.label)
        .replace(/\s+/g, '_');
      if (Object.hasOwn(output, key)) output[key] = qualityCount(row?.count ?? row?.issues ?? row?.total);
    });
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  allowedKeys.forEach((key) => {
    const raw = value[key];
    output[key] = qualityCount(raw && typeof raw === 'object' ? raw.count ?? raw.issues ?? raw.total : raw);
  });
  return output;
}

function qualityDomain(value) {
  if (value === null || value === undefined) {
    return { available: false, registeredIssues: 0, openIssues: 0, status: 'not_reported' };
  }
  if (typeof value !== 'object') {
    return { available: true, registeredIssues: qualityCount(value), openIssues: 0, status: 'reported' };
  }
  return {
    available: value.available !== false,
    registeredIssues: qualityCount(value.registeredIssues ?? value.total ?? value.issues ?? value.issueCount ?? value.count),
    openIssues: qualityCount(value.openIssues ?? value.open),
    status: normalizeText(value.status || value.trackingStatus, 80) || 'reported',
  };
}

function qualitySourceTracking(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 8).map((row) => ({
    source: ['GRH', 'PERSONAS'].includes(String(row?.source || '').toUpperCase())
      ? String(row.source).toUpperCase()
      : 'OTHER',
    registeredIssues: qualityCount(row?.registeredIssues),
    openIssues: qualityCount(row?.openIssues),
    trackingStatus: normalizeText(row?.trackingStatus, 80) || 'not_reported',
  }));
}

function qualityReconciliation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const allowedKeys = new Set([
    'severityTotal',
    'domainTotal',
    'resolutionTotal',
    'totalMatchesSeverity',
    'totalMatchesDomains',
    'totalMatchesResolution',
    'openEqualsTotal',
    'crosswalkMatchesTotal',
    'severityMatchesTotal',
    'resolutionMatchesTotal',
    'reconciled',
    'status',
  ]);
  return Object.fromEntries(Object.entries(value)
    .filter(([key, item]) => allowedKeys.has(key) && ['boolean', 'number', 'string'].includes(typeof item))
    .map(([key, item]) => [key, typeof item === 'string' ? normalizeText(item, 80) : item]));
}

function qualityAnalysisResult(result) {
  const payload = result?.payload || {};
  const data = payload.data || {};
  const issues = data.issues || {};
  const sourceTracking = qualitySourceTracking(data.breakdowns?.sources);
  const personasTracking = sourceTracking.find((source) => source.source === 'PERSONAS');
  const personasControlsAvailable = Boolean(personasTracking
    && !['controls_not_materialized', 'not_reported', 'unavailable'].includes(personasTracking.trackingStatus));
  const sources = sourceTracking.map((source) => ({
    system: source.source,
    relation: 'quality_overview',
    authority: source.trackingStatus,
    asOf: null,
  }));
  if (!sources.some((source) => source.system === 'GRH_PERSONAS')) {
    sources.push({ system: 'GRH_PERSONAS', relation: 'vw_crosswalk_persona', authority: 'identity_reconciliation', asOf: null });
  }

  if (result?.status !== 200 || payload.ok !== true) {
    return {
      status: result?.status || 503,
      answer: payload.error || 'No se pudo consultar el resumen agregado de calidad operativa.',
      data: { code: normalizeText(payload.code, 80) || 'QUALITY_OVERVIEW_UNAVAILABLE' },
      targetPath: '/calidad-operativa',
      relatedSections: relatedSections(['calidad', 'integracion']),
      asOf: null,
      sources: sources.length > 1 ? sources : [{ system: 'MUNICONTROL', relation: 'quality_overview', authority: 'aggregate_quality_contract', asOf: null }],
    };
  }

  const bySeverity = qualityCountMap(issues.bySeverity, ['critical', 'error', 'warning', 'info']);
  const byResolution = qualityCountMap(issues.byResolution, ['open', 'accepted', 'corrected', 'rejected']);
  const counts = {
    total: qualityCount(issues.total),
    open: qualityCount(issues.open ?? byResolution.open),
    distinctCodes: qualityCount(issues.distinctCodes),
    distinctEntities: qualityCount(issues.distinctEntities),
  };
  const domains = {
    payrollCoherence: qualityDomain(data.domains?.payrollCoherence),
    identityCuil: qualityDomain(data.domains?.identityCuil),
    dates: qualityDomain(data.domains?.dates),
  };
  const crosswalkRaw = data.crosswalk || {};
  const crosswalk = {
    total: qualityCount(crosswalkRaw.total),
    matched: qualityCount(crosswalkRaw.matched),
    ambiguous: qualityCount(crosswalkRaw.ambiguous),
    unmatched: qualityCount(crosswalkRaw.unmatched),
    rejected: qualityCount(crosswalkRaw.rejected),
    reconciled: typeof crosswalkRaw.reconciled === 'boolean'
      ? crosswalkRaw.reconciled
      : qualityCount(crosswalkRaw.reconciled),
  };
  const meta = {
    authority: {
      labor: normalizeText(payload.meta?.authority?.labor, 32) || 'GRH',
      identityAuxiliary: normalizeText(payload.meta?.authority?.identityAuxiliary, 32) || 'PERSONAS',
    },
    metric: normalizeText(payload.meta?.metric, 80) || 'registered_quality_issues',
    crosswalkMetric: normalizeText(payload.meta?.crosswalkMetric, 80) || 'crosswalk_decisions',
    containsPersonalData: payload.meta?.containsPersonalData === true,
    mutationAllowed: payload.meta?.mutationAllowed === true,
    zeroTrackedIssuesDoesNotMeanClean: payload.meta?.zeroTrackedIssuesDoesNotMeanClean !== false,
    sourceCutoff: null,
  };
  const severityText = ['critical', 'error', 'warning', 'info']
    .map((severity) => `${severity} ${formatNumber(bySeverity[severity])}`)
    .join(', ');
  const personasNotice = personasControlsAvailable
    ? 'PERSONAS informa controles materializados en este resumen.'
    : 'PERSONAS no tiene controles materializados en este resumen: queda como no evaluado y no puede interpretarse como calidad perfecta.';

  return {
    answer: `Calidad Operativa registra ${formatNumber(counts.total)} hallazgos agregados, ${formatNumber(counts.open)} abiertos. Por severidad: ${severityText}. El crosswalk informa ${formatNumber(crosswalk.matched)} coincidencias, ${formatNumber(crosswalk.ambiguous)} ambiguas y ${formatNumber(crosswalk.unmatched)} sin coincidencia. ${personasNotice} No se calcula un score sintético y el overview no informa una fecha de corte propia.`,
    data: {
      status: normalizeText(data.status || payload.status, 80) || 'available',
      issues: { ...counts, byResolution, bySeverity },
      domains,
      crosswalk,
      reconciliation: qualityReconciliation(data.reconciliation),
      sourceTracking,
      meta,
      limits: [
        'No se calcula un score sintético de calidad.',
        'Cero hallazgos registrados o controles no materializados no equivalen a calidad perfecta.',
        'El overview no informa una fecha de corte propia; no se inventa una.',
        'La respuesta es agregada y excluye filas, identificadores y valores observados.',
      ],
    },
    targetPath: '/calidad-operativa',
    relatedSections: relatedSections(['calidad', 'integracion', 'reportes']),
    asOf: null,
    sources,
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

function assistantDirectoryPayload(payload, focus, year) {
  const rows = (Array.isArray(payload?.data) ? payload.data : []).map((row) => ({
    companyId: row.companyId,
    legajo: row.legajo,
    nombre: row.nombre,
    fechaIngreso: row.fechaIngreso,
    fechaEgreso: row.fechaEgreso,
    administrativeStatus: row.administrativeStatus,
    payrollStatus: row.payrollStatus,
    controlState: row.controlState,
    organizacion: row.organizacion,
    sector: row.sector,
    cargo: row.cargo,
    convenio: row.convenio,
  }));
  return {
    ok: payload?.ok !== false,
    data: rows,
    pagination: payload?.pagination,
    scope: payload?.scope,
    queryFocus: focus || null,
    queryYear: year || null,
  };
}

function assistantEmployeePayload(payload, focus, year) {
  const row = payload?.data || {};
  const projected = {
    companyId: row.companyId,
    legajo: row.legajo,
    nombre: row.nombre,
    fechaIngreso: row.fechaIngreso,
    fechaEgreso: row.fechaEgreso,
    administrativeStatus: row.administrativeStatus,
    payrollStatus: row.payrollStatus,
    controlState: row.controlState,
    statusSnapshotDate: row.statusSnapshotDate,
    organizacion: row.organizacion,
    sector: row.sector,
    categoria: row.categoria,
    convenio: row.convenio,
    cargo: row.cargo,
  };
  if (focus === 'licenses') {
    projected.licencias = (Array.isArray(row.licencias) ? row.licencias : []).map((item) => ({
      periodo: item.periodo,
      tipo: item.tipo,
      fechaInicio: item.fechaInicio,
      fechaFin: item.fechaFin,
      dias: item.dias,
    }));
  }
  if (focus === 'absences') {
    projected.ausencias = (Array.isArray(row.ausencias) ? row.ausencias : []).map((item) => ({
      fecha: item.fecha,
      fechaHasta: item.fechaHasta,
      motivoCode: item.motivoCode,
      motivo: item.motivo,
      cantidad: item.cantidad,
      dias: item.dias,
    }));
  }
  const meta = payload?.meta || {};
  const recordMeta = ['licenses', 'absences'].includes(focus)
    ? {
        absenceTotal: Number(meta.absenceTotal || 0),
        leaveTotal: Number(meta.leaveTotal || 0),
        absenceRowsReturned: focus === 'absences' ? projected.ausencias.length : 0,
        leaveRowsReturned: focus === 'licenses' ? projected.licencias.length : 0,
        relationRowsCappedAt: Number(meta.relationRowsCappedAt || 0),
        relationRowsComplete: meta.relationRowsComplete === true,
        leaveSourceMaxDate: dateValue(meta.leaveSourceMaxDate),
      }
    : {};
  return {
    ok: payload?.ok !== false,
    data: projected,
    meta: recordMeta,
    queryFocus: focus || null,
    queryYear: year || null,
  };
}

function employeeSearchResult(result, scope, options = {}) {
  const total = Number(result.payload?.pagination?.total || 0);
  const shown = result.payload?.data?.length || 0;
  const focus = options.focus === 'licenses' || options.focus === 'absences' ? options.focus : '';
  const year = Number.isInteger(options.year) ? options.year : null;
  const focusLabel = focus === 'licenses' ? 'licencias' : focus === 'absences' ? 'ausencias' : 'la ficha';
  const noResults = focus
    ? 'No encontré una coincidencia suficiente en el directorio GRH. No reemplacé tu consulta nominal por estadísticas generales: probá con apellido, legajo o una parte adicional del nombre.'
    : 'No encontré legajos con esos criterios en el directorio canónico GRH.';
  return {
    status: result.status,
    answer: total
      ? `Encontré ${formatNumber(total)} legajos. Muestro ${formatNumber(shown)} resultados de la consulta interna; elegí el legajo correcto para ver ${focusLabel} sin mezclar vínculos laborales históricos.`
      : noResults,
    data: assistantDirectoryPayload(result.payload, focus, year),
    asOf: dateValue(scope.asOf),
    sources: [
      { system: 'GRH', relation: 'employment_contract', authority: 'labor_core' },
      { system: 'GRH', relation: 'person_identity', authority: 'canonical_identity' },
    ],
  };
}

function employeeDetailResult(result, scope, options = {}) {
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
  const meta = result.payload.meta || {};
  const focus = options.focus === 'licenses' || options.focus === 'absences' ? options.focus : '';
  const year = Number.isInteger(options.year) ? options.year : null;
  const absenceTotal = Number(meta.absenceTotal || 0);
  const leaveTotal = Number(meta.leaveTotal || 0);
  const absenceRowsReturned = Array.isArray(row.ausencias) ? row.ausencias.length : 0;
  const leaveRowsReturned = Array.isArray(row.licencias) ? row.licencias.length : 0;
  const yearLabel = year ? ` durante ${year}` : '';
  let answer = `Ficha interna de ${row.nombre || `legajo ${row.legajo}`}: estado administrativo ${row.administrativeStatus || 'sin clasificar'}, estado de nómina ${row.payrollStatus || 'sin clasificar'} y control ${row.controlState || 'sin clasificar'}.`;
  if (focus === 'licenses') {
    answer = `GRH registra ${formatNumber(leaveTotal)} licencias históricas${yearLabel} y ${formatNumber(absenceTotal)} eventos administrativos de ausencia para ${row.nombre || `el legajo ${row.legajo}`}. La consulta recuperó ${formatNumber(leaveRowsReturned)} de ${formatNumber(leaveTotal)} filas de licencia y la pantalla resume hasta 4. La tabla de licencias es un archivo legado finalizado en 2009 y no acredita una licencia vigente; revisá las fechas y el legajo antes de usar el dato.`;
  } else if (focus === 'absences') {
    answer = `GRH registra ${formatNumber(absenceTotal)} eventos administrativos de ausencia${yearLabel} y ${formatNumber(leaveTotal)} licencias históricas para ${row.nombre || `el legajo ${row.legajo}`}. La consulta recuperó ${formatNumber(absenceRowsReturned)} de ${formatNumber(absenceTotal)} eventos y la pantalla resume hasta 4. Son registros administrativos: no equivalen por sí solos a tasa de ausentismo, jornadas perdidas ni licencia vigente.`;
  }
  return {
    status: 200,
    answer,
    data: assistantEmployeePayload(result.payload, focus, year),
    asOf: dateValue(row.statusSnapshotDate || scope.asOf),
    sources: [
      { system: 'GRH', relation: 'employment_contract', authority: 'labor_core', asOf: dateValue(scope.asOf) },
      { system: 'GRH', relation: 'employment_status_snapshot', authority: 'status_evidence', asOf: dateValue(row.statusSnapshotDate) },
      ...(['licenses', 'absences'].includes(focus)
        ? [
            {
              system: 'GRH',
              relation: 'grh_leaves',
              authority: 'historical_legacy_record',
              asOf: dateValue(meta.leaveSourceMaxDate),
            },
            {
              system: 'GRH',
              relation: 'grh_absences',
              authority: 'administrative_event_record',
              asOf: dateValue(scope.asOf),
            },
          ]
        : []),
    ],
  };
}

function executiveResult(integration, payroll, scope, absence, quality) {
  const workforce = workforceResult(integration, scope);
  const payrollView = payrollResult(payroll);
  const integrationView = integrationResult(integration, scope);
  const absenceView = absenceAnalysisResult(absence);
  const qualityView = qualityAnalysisResult(quality);
  const absenceAvailable = !absenceView.status || absenceView.status === 200;
  const qualityAvailable = !qualityView.status || qualityView.status === 200;
  const unavailableDomains = [
    ...(!absenceAvailable ? ['ausentismo'] : []),
    ...(!qualityAvailable ? ['calidad operativa'] : []),
  ];
  const partialNotice = unavailableDomains.length
    ? ` La lectura ejecutiva es parcial: ${unavailableDomains.join(' y ')} no ${unavailableDomains.length === 1 ? 'está disponible' : 'están disponibles'} y no se infirieron valores para reemplazar ${unavailableDomains.length === 1 ? 'ese bloque' : 'esos bloques'}.`
    : '';
  const errors = [
    ...(!absenceAvailable
      ? [{ domain: 'absence', status: absenceView.status, code: absenceView.data?.code || 'ABSENCE_ANALYTICS_UNAVAILABLE' }]
      : []),
    ...(!qualityAvailable
      ? [{ domain: 'quality', status: qualityView.status, code: qualityView.data?.code || 'QUALITY_OVERVIEW_UNAVAILABLE' }]
      : []),
  ];
  return {
    answer: `${workforce.answer} ${payrollView.answer} ${integrationView.answer} ${absenceView.answer} ${qualityView.answer}${partialNotice}`,
    data: {
      workforce: workforce.data,
      payroll: payrollView.data,
      integration: integrationView.data,
      absence: absenceView.data,
      quality: qualityView.data,
      partial: unavailableDomains.length > 0,
      errors,
    },
    asOf: workforce.asOf || payrollView.asOf || integrationView.asOf || absenceView.asOf || qualityView.asOf,
    sources: [...workforce.sources, ...payrollView.sources, ...integrationView.sources, ...absenceView.sources, ...qualityView.sources],
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
    const controlStates = (Array.isArray(data.gapBreakdown) ? data.gapBreakdown : [])
      .slice(0, 20)
      .map((row) => ({
        state: normalizeText(row?.state, 80) || 'sin_clasificar',
        records: qualityCount(row?.records),
      }));
    return {
      historicalEmploymentRecords: data.totalContracts,
      canonicalPeople: data.totalPeople,
      administrativeActive: data.administrativeActive,
      includedInOperationalRun: data.liquidable,
      operationalGap: data.gap,
      controlStates,
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
  if (intent === 'quality_analysis') {
    if (!data?.issues || !data?.domains || !data?.crosswalk) return { available: false };
    const domainFacts = (domain) => ({
      available: domain?.available === true,
      registered: qualityCount(domain?.registeredIssues),
      open: qualityCount(domain?.openIssues),
      status: normalizeText(domain?.status, 80),
    });
    return {
      available: true,
      totals: {
        registered: qualityCount(data.issues.total),
        open: qualityCount(data.issues.open),
        distinctCodes: qualityCount(data.issues.distinctCodes),
        distinctEntities: qualityCount(data.issues.distinctEntities),
        bySeverity: qualityCountMap(data.issues.bySeverity, ['critical', 'error', 'warning', 'info']),
      },
      domains: {
        payrollCoherence: domainFacts(data.domains.payrollCoherence),
        identityCuil: domainFacts(data.domains.identityCuil),
        dates: domainFacts(data.domains.dates),
      },
      crosswalk: {
        total: qualityCount(data.crosswalk.total),
        matched: qualityCount(data.crosswalk.matched),
        ambiguous: qualityCount(data.crosswalk.ambiguous),
        unmatched: qualityCount(data.crosswalk.unmatched),
        rejected: qualityCount(data.crosswalk.rejected),
        reconciled: data.crosswalk.reconciled,
      },
      trackingStatuses: Object.fromEntries((Array.isArray(data.sourceTracking) ? data.sourceTracking : [])
        .filter((source) => ['GRH', 'PERSONAS'].includes(source?.source))
        .map((source) => [source.source, normalizeText(source.trackingStatus, 80)])),
      constraints: {
        compositeMetricAvailable: false,
        sourceCutoffAvailable: false,
        zeroTrackedDoesNotMeanClean: data.meta?.zeroTrackedIssuesDoesNotMeanClean !== false,
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
      quality: providerFacts('quality_analysis', data.quality),
    };
  }
  return null;
}

function consumeRuntimeQuota(key, env, now, quotaStore) {
  const limit = boundedInteger(env.AI_ASSISTANT_CALLS_PER_WINDOW ?? env.HF_ASSISTANT_CALLS_PER_WINDOW, DEFAULT_HF_CALLS_PER_WINDOW, 1, 10);
  const windowMs = boundedInteger(env.AI_ASSISTANT_WINDOW_MS ?? env.HF_ASSISTANT_WINDOW_MS, DEFAULT_HF_WINDOW_MS, 10_000, 3_600_000);
  const previous = quotaStore.get(key);
  if (!previous || now - previous.startedAt >= windowMs) {
    quotaStore.set(key, { startedAt: now, calls: 1 });
    return { allowed: true, limit, windowMs };
  }
  if (previous.calls >= limit) return { allowed: false, limit, windowMs };
  previous.calls += 1;
  return { allowed: true, limit, windowMs };
}

function providerStatus(provider, status, extra = {}) {
  const externalProviderAttempted = new Set([
    'used', 'upstream_rate_limited', 'unavailable', 'invalid_response', 'timeout', 'error',
    'incomplete', 'incomplete_max_output_tokens',
  ]).has(status) && provider !== 'local';
  return {
    provider,
    name: {
      openai: 'openai_responses',
      huggingface: 'huggingface_router',
      local: 'local',
    }[provider] || 'local',
    status,
    model: null,
    usage: null,
    externalProviderAttempted,
    externalProviderUsed: status === 'used',
    nominalDataSent: false,
    ...extra,
  };
}

function aggregateInsightTopic(intent) {
  return {
    workforce_summary: 'Explicá el control agregado de dotación y su brecha operativa.',
    payroll_control: 'Explicá el estado agregado de nómina, distinguiendo cerrado publicable de abierto no publicable.',
    integration_quality: 'Explicá la calidad de integración: GRH manda en lo laboral y PERSONAS sólo enriquece identidad y territorio.',
    quality_analysis: 'Explicá los hallazgos agregados de calidad por severidad, dominio, crosswalk y estado de seguimiento. No inventes un score ni una fecha de corte. Controles PERSONAS no materializados significa no evaluado, no calidad perfecta.',
    absence_analysis: 'Explicá los eventos administrativos de ausencia, su comparación homogénea y sus límites metodológicos. No los conviertas en tasa, presentismo, productividad ni jornadas perdidas.',
    executive_analysis: 'Redactá una lectura ejecutiva breve de dotación, nómina, integración, ausentismo y calidad operativa. Priorizá controles accionables, no inventes causas, score ni fecha de corte, y no conviertas eventos de ausencia en tasas, presentismo, productividad ni jornadas perdidas.',
  }[intent];
}

const AGGREGATE_SYSTEM_INSTRUCTION = 'Sos un asistente de control municipal. Recibís sólo indicadores agregados verificados. Respondé en español claro, en hasta 130 palabras. No inventes datos, personas, causas, permisos, scores, cortes ni conclusiones financieras. Diferenciá dato, control y limitación.';

function openAIOutputText(payload) {
  const direct = normalizeText(payload?.output_text, MAX_PROVIDER_OUTPUT_CHARS);
  if (direct) return direct;
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      const text = normalizeText(
        typeof content?.text === 'string' ? content.text : content?.text?.value,
        MAX_PROVIDER_OUTPUT_CHARS,
      );
      if (text) return text;
    }
  }
  return '';
}

function openAIUsage(payload) {
  if (!payload?.usage) return null;
  return {
    promptTokens: Number(payload.usage.input_tokens || 0),
    completionTokens: Number(payload.usage.output_tokens || 0),
    totalTokens: Number(payload.usage.total_tokens || 0),
    reasoningTokens: Number(payload.usage.output_tokens_details?.reasoning_tokens || 0),
  };
}

function openAIReasoningEffort(model, env) {
  const configured = normalizeText(env.OPENAI_REASONING_EFFORT, 16).toLowerCase();
  if (OPENAI_REASONING_EFFORTS.has(configured)) return configured;
  return /^gpt-5-mini(?:-|$)/i.test(model) ? DEFAULT_OPENAI_REASONING_EFFORT : null;
}

async function requestOpenAIInsight({
  token,
  model,
  reasoningEffort,
  topic,
  serializedFacts,
  maxTokens,
  timeoutMs,
  fetchImpl,
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        instructions: AGGREGATE_SYSTEM_INSTRUCTION,
        input: `${topic}\nIndicadores agregados verificados:\n${serializedFacts}`,
        store: false,
        max_output_tokens: maxTokens,
        ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const status = response.status === 429
        ? 'upstream_rate_limited'
        : response.status === 408
          ? 'timeout'
          : response.status >= 500
            ? 'unavailable'
            : 'error';
      return providerStatus('openai', status, { model, reasoningEffort });
    }
    const payload = await response.json();
    const usage = openAIUsage(payload);
    if (payload?.status === 'incomplete') {
      const incompleteReason = normalizeText(payload?.incomplete_details?.reason, 80) || 'unknown';
      return providerStatus(
        'openai',
        incompleteReason === 'max_output_tokens' ? 'incomplete_max_output_tokens' : 'incomplete',
        { model, reasoningEffort, usage, incompleteReason },
      );
    }
    const insight = openAIOutputText(payload);
    if (!insight) return providerStatus('openai', 'invalid_response', { model, reasoningEffort, usage });
    return providerStatus('openai', 'used', {
      model,
      reasoningEffort,
      insight,
      usage,
    });
  } catch (error) {
    return providerStatus(
      'openai',
      error?.name === 'AbortError' ? 'timeout' : 'unavailable',
      { model, reasoningEffort },
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function requestHuggingFaceInsight({ token, model, topic, serializedFacts, maxTokens, timeoutMs, fetchImpl }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
          { role: 'system', content: AGGREGATE_SYSTEM_INSTRUCTION },
          { role: 'user', content: `${topic}\nIndicadores agregados verificados:\n${serializedFacts}` },
        ],
        max_tokens: maxTokens,
        temperature: 0.2,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      return providerStatus('huggingface', response.status === 429 ? 'upstream_rate_limited' : 'unavailable', { model });
    }
    const payload = await response.json();
    const insight = normalizeText(payload?.choices?.[0]?.message?.content, MAX_PROVIDER_OUTPUT_CHARS);
    if (!insight) return providerStatus('huggingface', 'invalid_response', { model });
    return providerStatus('huggingface', 'used', {
      model,
      insight,
      usage: payload?.usage ? {
        promptTokens: Number(payload.usage.prompt_tokens || 0),
        completionTokens: Number(payload.usage.completion_tokens || 0),
        totalTokens: Number(payload.usage.total_tokens || 0),
      } : null,
    });
  } catch (error) {
    return providerStatus('huggingface', error?.name === 'AbortError' ? 'timeout' : 'unavailable', { model });
  } finally {
    clearTimeout(timeout);
  }
}

function providerAttempt(result) {
  return { provider: result.provider, status: result.status, model: result.model || null };
}

async function generateAggregateInsight({ intent, data, session, env, fetchImpl, now, quotaStore }) {
  if (GUIDANCE_INTENTS.has(intent)) return providerStatus('local', 'not_allowed_for_product_guidance');
  if (!EXTERNAL_ALLOWED_INTENTS.has(intent)) return providerStatus('local', 'not_allowed_for_nominal_or_unknown_intent');
  const absenceAffectedContracts = intent === 'absence_analysis'
    ? Number(data?.summary?.affectedContracts || 0)
    : intent === 'executive_analysis'
      ? Number(data?.absence?.summary?.affectedContracts || 0)
      : null;
  if (absenceAffectedContracts !== null && absenceAffectedContracts < 5) {
    return providerStatus('local', 'suppressed_small_cohort', { minimumAffectedContracts: 5 });
  }

  const facts = providerFacts(intent, data);
  const serializedFacts = JSON.stringify(facts);
  if (!facts || EXTERNAL_FORBIDDEN_FIELDS.test(serializedFacts)) {
    return providerStatus('local', 'blocked_by_privacy_guard');
  }

  const openAIToken = typeof env.OPENAI_API_KEY === 'string' ? env.OPENAI_API_KEY.trim() : '';
  const hfToken = typeof env.HF_TOKEN === 'string' ? env.HF_TOKEN.trim() : '';
  if (!openAIToken && !hfToken) return providerStatus('local', 'not_configured');

  const quota = consumeRuntimeQuota(String(session.id || session.email), env, now(), quotaStore);
  if (!quota.allowed) {
    return providerStatus('local', 'runtime_rate_limited', {
      limit: quota.limit,
      windowSeconds: Math.round(quota.windowMs / 1000),
    });
  }

  const topic = aggregateInsightTopic(intent);
  const openAIModel = normalizeText(env.OPENAI_MODEL, 160) || DEFAULT_OPENAI_MODEL;
  const reasoningEffort = openAIReasoningEffort(openAIModel, env);
  const hfModel = normalizeText(env.HF_MODEL, 160) || DEFAULT_HF_MODEL;
  const maxTokens = boundedInteger(
    env.AI_ASSISTANT_MAX_TOKENS ?? env.OPENAI_ASSISTANT_MAX_TOKENS ?? env.HF_ASSISTANT_MAX_TOKENS,
    DEFAULT_AI_OUTPUT_TOKENS,
    64,
    320,
  );
  const totalTimeoutMs = boundedInteger(env.AI_ASSISTANT_TIMEOUT_MS, DEFAULT_AI_TOTAL_TIMEOUT_MS, 2_000, 8_000);
  const openAIRequestedTimeout = boundedInteger(env.OPENAI_ASSISTANT_TIMEOUT_MS, DEFAULT_OPENAI_TIMEOUT_MS, 1_000, 8_000);
  const hfRequestedTimeout = boundedInteger(env.HF_ASSISTANT_TIMEOUT_MS, DEFAULT_HF_TIMEOUT_MS, 1_000, 8_000);
  const openAITimeoutMs = openAIToken && hfToken
    ? Math.min(openAIRequestedTimeout, Math.max(1_000, totalTimeoutMs - 1_000))
    : Math.min(openAIRequestedTimeout, totalTimeoutMs);
  const hfTimeoutMs = openAIToken && hfToken
    ? Math.min(hfRequestedTimeout, Math.max(1_000, totalTimeoutMs - openAITimeoutMs))
    : Math.min(hfRequestedTimeout, totalTimeoutMs);
  const maxCallsPerRequest = Number(Boolean(openAIToken)) + Number(Boolean(hfToken));
  const commonLimits = {
    maxCallsPerRequest,
    maxOutputTokens: maxTokens,
    totalTimeoutMs,
    runtimeCallsPerWindow: quota.limit,
    runtimeWindowSeconds: Math.round(quota.windowMs / 1000),
  };
  const attempts = [];
  let openAIResult = null;

  if (openAIToken) {
    openAIResult = await requestOpenAIInsight({
      token: openAIToken,
      model: openAIModel,
      reasoningEffort,
      topic,
      serializedFacts,
      maxTokens,
      timeoutMs: openAITimeoutMs,
      fetchImpl,
    });
    attempts.push(providerAttempt(openAIResult));
    if (openAIResult.status === 'used' || openAIResult.status.startsWith('incomplete')) {
      return {
        ...openAIResult,
        attempts,
        limits: { ...commonLimits, timeoutMs: openAITimeoutMs },
      };
    }
  }

  if (hfToken) {
    const hfResult = await requestHuggingFaceInsight({
      token: hfToken,
      model: hfModel,
      topic,
      serializedFacts,
      maxTokens,
      timeoutMs: hfTimeoutMs,
      fetchImpl,
    });
    attempts.push(providerAttempt(hfResult));
    return {
      ...hfResult,
      attempts,
      ...(openAIResult ? { fallbackFrom: { provider: 'openai', status: openAIResult.status } } : {}),
      limits: { ...commonLimits, timeoutMs: hfTimeoutMs },
    };
  }

  return {
    ...openAIResult,
    attempts,
    limits: { ...commonLimits, timeoutMs: openAITimeoutMs },
  };
}

function capabilitiesPayload() {
  return {
    ok: true,
    authenticated: true,
    capabilities: [
      { intent: 'workforce_summary', externalEnhancement: true },
      { intent: 'payroll_control', externalEnhancement: true },
      { intent: 'integration_quality', externalEnhancement: true },
      { intent: 'quality_analysis', externalEnhancement: true },
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
    providerPolicy: {
      primary: 'openai',
      fallback: 'huggingface',
      localDeterministicFallback: true,
      maximumExternalAttemptsPerRequest: 2,
    },
    privacy: {
      nominalQueries: 'local_database_only',
      externalProvider: 'aggregate_verified_facts_only_openai_then_huggingface',
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
  const loadQuality = dependencies.qualityOverview
    ?? dependencies.qualityoverview
    ?? internalData.qualityOverview
    ?? internalData.qualityoverview
    ?? (async () => ({
      status: 503,
      payload: { ok: false, code: 'QUALITY_OVERVIEW_UNAVAILABLE', error: 'Calidad Operativa todavía no está disponible.' },
    }));
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
        } else if (intent === 'quality_analysis') {
          result = qualityAnalysisResult(await loadQuality(sql));
        } else if (intent === 'absence_analysis') {
          result = absenceAnalysisResult(await loadAbsence(sql, absenceAnalyticsRequest(body)));
        } else if (intent === 'employee_search') {
          const focus = employeeRecordFocus(message);
          const year = extractEmployeeRecordYear(message);
          const search = normalizeText(body.search, MAX_SEARCH_LENGTH)
            || extractEmployeeRecordSearch(message)
            || extractEmployeeSearch(message);
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
          result = employeeSearchResult(directory, scope, { focus, year });
        } else if (intent === 'employee_detail') {
          const focus = employeeRecordFocus(message);
          const year = extractEmployeeRecordYear(message);
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
            loadEmployee(sql, { query: { contractId, legajo, companyId, recordYear: year ? String(year) : '' } }),
            loadScope(sql),
          ]);
          result = employeeDetailResult(detail, scope, { focus, year });
        } else if (intent === 'executive_analysis') {
          const [integration, payroll, scope, absence, quality] = await Promise.all([
            loadIntegration(sql),
            loadPayroll(sql),
            loadScope(sql),
            Promise.resolve()
              .then(() => loadAbsence(sql, absenceAnalyticsRequest(body)))
              .catch(() => ({
                status: 503,
                payload: { ok: false, code: 'ABSENCE_ANALYTICS_UNAVAILABLE', error: 'No se pudo consultar ausentismo.' },
              })),
            Promise.resolve()
              .then(() => loadQuality(sql))
              .catch(() => ({
                status: 503,
                payload: { ok: false, code: 'QUALITY_OVERVIEW_UNAVAILABLE', error: 'No se pudo consultar Calidad Operativa.' },
              })),
          ]);
          result = executiveResult(integration, payroll, scope, absence, quality);
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
        : providerStatus('local', 'not_requested');
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
        sources: result.sources.map((source) => ({
          ...source,
          asOf: Object.hasOwn(source, 'asOf') ? source.asOf : result.asOf,
        })),
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
