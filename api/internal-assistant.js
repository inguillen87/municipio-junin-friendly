import { createHmac, randomUUID } from 'node:crypto';

import { getInternalSql } from '../lib/internal-neon.js';
import { requireInternalSession } from '../lib/internal-session.js';
import { requireCompatibleInternalAccess } from '../lib/internal-access-gateway.js';
import {
  getTenantIdentitySql,
  takeIdentityRateLimit,
} from '../lib/internal-identity-access.js';
import {
  TENANT_DATA_CAPABILITIES,
  capabilitiesForAssistantIntent,
  principalHasCapabilities,
} from '../lib/internal-resource-access.js';
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
import { getAttendanceBootstrap } from '../lib/internal-attendance-gateway.js';
import { getReportedAttendanceInventory } from '../lib/internal-attendance-reported-inventory.js';
import { actionMutationSession, getActionCenterSql } from './internal-actions.js';

const MAX_BODY_BYTES = 12 * 1024;
const MAX_MESSAGE_LENGTH = 1_200;
const MAX_SEARCH_LENGTH = 100;
const MAX_PROVIDER_OUTPUT_CHARS = 4_000;
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_OPENAI_MODEL = 'gpt-5.4-mini';
const DEFAULT_OPENAI_REASONING_EFFORT = 'none';
const DEFAULT_OPENAI_TIMEOUT_MS = 10_000;
const HF_ROUTER_URL = 'https://router.huggingface.co/v1/chat/completions';
const DEFAULT_HF_MODEL = 'openai/gpt-oss-120b:fastest';
const DEFAULT_HF_TIMEOUT_MS = 4_000;
const DEFAULT_AI_OUTPUT_TOKENS = 320;
const DEFAULT_HF_CALLS_PER_WINDOW = 3;
const DEFAULT_HF_WINDOW_MS = 60_000;
const DEFAULT_AI_TOTAL_TIMEOUT_MS = 14_000;
const DEFAULT_AI_USER_CALLS_PER_WINDOW = 3;
const DEFAULT_AI_TENANT_CALLS_PER_WINDOW = 50;
const DEFAULT_AI_DURABLE_WINDOW_SECONDS = 60;
const DEFAULT_AI_DURABLE_BLOCK_SECONDS = 60;
const MIN_AI_QUOTA_PEPPER_BYTES = 32;
const QUERY_PLAN_VERSION = 'municipal_query_plan.v1';
const MAX_HISTORY_ITEMS = 8;

const INTENTS = new Set([
  'workforce_summary',
  'payroll_control',
  'integration_quality',
  'quality_analysis',
  'absence_analysis',
  'leave_policy',
  'operational_summary',
  'structure_analysis',
  'absence_event_list',
  'quality_issue_list',
  'import_lineage',
  'employee_search',
  'employee_detail',
  'management_comparison',
  'budget_approved',
  'attendance_status',
  'executive_analysis',
  'help_navigation',
  'section_explanation',
  'task_guidance',
  'glossary',
  'help',
  'out_of_scope',
]);

const GUIDANCE_INTENTS = new Set([
  'help_navigation',
  'section_explanation',
  'task_guidance',
  'glossary',
  'help',
  'out_of_scope',
]);

const EXTERNAL_ALLOWED_INTENTS = new Set([
  'workforce_summary',
  'payroll_control',
  'integration_quality',
  'quality_analysis',
  'absence_analysis',
  'management_comparison',
  'operational_summary',
  'structure_analysis',
  'executive_analysis',
]);

const NOMINAL_OR_INTERNAL_ONLY_INTENTS = new Set([
  'employee_search',
  'employee_detail',
  'absence_event_list',
  'quality_issue_list',
  'import_lineage',
  'leave_policy',
  'budget_approved',
  'attendance_status',
  'out_of_scope',
]);

const INTENT_RESOURCES = Object.freeze({
  workforce_summary: ['integrationquality', 'canonicalscope'],
  payroll_control: ['payrollcontrol'],
  integration_quality: ['integrationquality', 'canonicalscope'],
  quality_analysis: ['qualityoverview'],
  absence_analysis: ['absenceanalytics'],
  leave_policy: ['leavenormative'],
  operational_summary: ['summary'],
  structure_analysis: ['structure'],
  absence_event_list: ['absenceevents'],
  quality_issue_list: ['qualityissues'],
  import_lineage: ['importlineage'],
  employee_search: ['employees', 'canonicalscope'],
  employee_detail: ['employee', 'canonicalscope'],
  management_comparison: ['managementanalytics'],
  budget_approved: ['budgetapproved'],
  attendance_status: ['attendancereportedinventory', 'attendancebootstrap'],
  executive_analysis: ['integrationquality', 'payrollcontrol', 'canonicalscope', 'absenceanalytics', 'qualityoverview'],
  help_navigation: ['productguidance'],
  section_explanation: ['productguidance'],
  task_guidance: ['productguidance'],
  glossary: ['productguidance'],
  help: ['productguidance'],
  out_of_scope: ['productguidance'],
});

const EXTERNAL_FORBIDDEN_FIELDS = /\b(?:dni|cuil|nombre|apellido|legajo|domicilio|direcci[oó]n|tel[eé]fono|email|contract[_-]?id|source[_-]?id|canonical[_-]?id|issue[_-]?id|observed[_-]?value|import[_-]?lineage)\b/i;
const quotaByRuntime = new Map();
const OPENAI_REASONING_EFFORTS_54 = new Set(['none', 'low', 'medium', 'high', 'xhigh']);
const OPENAI_REASONING_EFFORTS_5_MINI = new Set(['minimal', 'low', 'medium', 'high']);

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

const UNICODE_DECIMAL_ZEROES = Object.freeze([
  0x0030, 0x0660, 0x06f0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66,
  0x0be6, 0x0c66, 0x0ce6, 0x0d66, 0x0de6, 0x0e50, 0x0ed0, 0x0f20,
  0x1040, 0x1090, 0x17e0, 0x1810, 0x1946, 0x19d0, 0x1a80, 0x1a90,
  0x1b50, 0x1bb0, 0x1c40, 0x1c50, 0xa620, 0xa8d0, 0xa900, 0xa9d0,
  0xa9f0, 0xaa50, 0xabf0, 0xff10,
]);

function normalizeUnicodeDecimalDigits(value) {
  return value.replace(/\p{Nd}/gu, (digit) => {
    const point = digit.codePointAt(0);
    const zero = UNICODE_DECIMAL_ZEROES.find((candidate) => point >= candidate && point <= candidate + 9);
    return zero === undefined ? digit : String(point - zero);
  });
}

function foldText(value) {
  return normalizeUnicodeDecimalDigits(normalizeText(value).normalize('NFKC'))
    .replace(/\p{Cf}/gu, '')
    .replace(/[⁄∕／]/g, '/')
    .replace(/[‐‑‒–—―−]/g, '-')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[аɑ]/g, 'a')
    .replace(/[οо]/g, 'o');
}

function foldAssistantQuery(value) {
  return foldText(value)
    .replace(/\blicnecias?\b/g, 'licencias')
    .replace(/\blicensias?\b/g, 'licencias')
    .replace(/\bausensias?\b/g, 'ausencias')
    .replace(/\baucencias?\b/g, 'ausencias');
}

function isoDateOnly(value) {
  const text = normalizeText(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const parsed = new Date(`${text}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text ? text : '';
}

function safeIdentifier(value, maximum = 64) {
  const text = normalizeText(value, maximum);
  return text && /^[a-z0-9._:-]+$/i.test(text) ? text : '';
}

function monthRange(year, month) {
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const next = new Date(Date.UTC(year, month, 1));
  const to = new Date(next.getTime() - 86_400_000).toISOString().slice(0, 10);
  return { from, to, year };
}

const MONTHS_ES = Object.freeze({
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12,
});

function dateFilters(body, message, intent) {
  const output = {};
  const explicitFrom = isoDateOnly(body.from);
  const explicitTo = isoDateOnly(body.to);
  if (explicitFrom) output.from = explicitFrom;
  if (explicitTo) output.to = explicitTo;

  const text = foldAssistantQuery(message);
  const dates = [...text.matchAll(/\b((?:19|20)\d{2}-\d{2}-\d{2})\b/g)]
    .map((match) => isoDateOnly(match[1]))
    .filter(Boolean);
  if (!output.from && dates[0]) output.from = dates[0];
  if (!output.to && dates[1]) output.to = dates[1];
  if (dates.length === 1) {
    if (/\b(?:hasta|al)\s+(?:19|20)\d{2}-/.test(text) && !explicitFrom) {
      output.to = dates[0];
      delete output.from;
    } else if (/\bdesde\s+(?:19|20)\d{2}-/.test(text) && !explicitTo) {
      output.from = dates[0];
      delete output.to;
    } else if (!explicitFrom && !explicitTo) {
      output.from = dates[0];
      output.to = dates[0];
    }
  }

  const monthMatch = text.match(new RegExp(`\\b(${Object.keys(MONTHS_ES).join('|')})\\s+(?:de\\s+)?((?:19|20)\\d{2})\\b`));
  if (!explicitFrom && !explicitTo && monthMatch) {
    Object.assign(output, monthRange(Number(monthMatch[2]), MONTHS_ES[monthMatch[1]]));
  }

  const yearRange = text.match(/\b(?:entre|desde)\s+((?:19|20)\d{2})\s+(?:y|hasta|a)\s+((?:19|20)\d{2})\b/);
  if (!explicitFrom && !explicitTo && yearRange) {
    const first = Number(yearRange[1]);
    const second = Number(yearRange[2]);
    output.from = `${Math.min(first, second)}-01-01`;
    output.to = `${Math.max(first, second)}-12-31`;
    output.yearFrom = Math.min(first, second);
    output.yearTo = Math.max(first, second);
  } else if (!monthMatch) {
    const recordYear = ['employee_search', 'employee_detail'].includes(intent)
      ? extractEmployeeRecordYear(message)
      : Number(text.match(/\b((?:19|20)\d{2})\b/)?.[1] || 0);
    if (recordYear >= 1900 && recordYear <= 2099) {
      output.year = recordYear;
      if (!output.from) output.from = `${recordYear}-01-01`;
      if (!output.to) output.to = `${recordYear}-12-31`;
    }
  }
  return output;
}

function structuredIntegerField(body, key, minimum, maximum, pattern) {
  if (!Object.hasOwn(body, key)) return { provided: false, valid: false, value: null };
  const raw = body[key];
  const value = typeof raw === 'number'
    ? raw
    : typeof raw === 'string' && pattern.test(raw.trim())
      ? Number(raw.trim())
      : Number.NaN;
  const valid = Number.isInteger(value) && value >= minimum && value <= maximum;
  return { provided: true, valid, value: valid ? value : null };
}

function budgetFiscalYearAnalysis(message = '', analysis = municipalOrdinanceReferenceAnalysis(message)) {
  let text = analysis.text;
  for (const reference of [...analysis.references].sort((left, right) => right.start - left.start)) {
    text = `${text.slice(0, reference.start)}${' '.repeat(reference.end - reference.start)}${text.slice(reference.end)}`;
  }
  const years = [];
  let invalid = false;
  const add = (value) => {
    if (value === undefined || value === null || value === '') return;
    const year = Number(String(value).replace(/[.,\s]/g, ''));
    if (Number.isInteger(year)) years.push(year);
  };
  for (const match of text.matchAll(/(?<!\d)(\d{4}|\d\.\d{3})(?!\d)/g)) {
    const year = Number(match[1].replace('.', ''));
    if (year >= 1800 && year <= 2999) add(year);
  }
  const contextPattern = /\b(?:presupuestos?|ejercicio(?:\s+(?:fiscal|presupuestario))?|periodo(?:\s+(?:fiscal|presupuestario))?|vigencia|vigente)(?:\s+(?:municipal(?:es)?|aprobados?|para|el|del|de|en|correspondiente|a|al|durante|fiscal|presupuestario|entre|contra|versus|con|ejercicio|periodo|ano))*\s*[:=,-]?\s*(\d+(?:[., ]\d+)*)/g;
  for (const match of text.matchAll(contextPattern)) {
    const token = match[1];
    if (/^(?:\d{4}|\d[., ]\d{3})$/.test(token)) add(token);
    else invalid = true;
  }
  for (const match of text.matchAll(/\b(dos\s+mil(?:\s+[a-z]+)?)\b/g)) {
    if (match[1] === 'dos mil veinticinco') add(2025);
    else if (match[1] === 'dos mil veintiseis') add(2026);
    else invalid = true;
  }
  for (const match of text.matchAll(/\b(veinti[a-z]+)\b(?!\s+(?:millones?|mil|pesos?|ars|unidades?))/g)) {
    if (match[1] === 'veinticinco') add(2025);
    else if (match[1] === 'veintiseis') add(2026);
    else invalid = true;
  }
  return { years: [...new Set(years)], invalid };
}

function municipalOrdinanceReferenceAnalysis(message = '') {
  const text = foldAssistantQuery(message);
  const leadPattern = /(?:\bordenanzas?\b|\bords?(?:\.|\b))(?:\s+municipal(?:es)?)?\s*(?:(?:numeros?|n(?:ro|um)|n\.?[º°o]|n)\.?(?=\s|\d)\s*)?/g;
  const referenceEnd = String.raw`(?!\s*(?:[\/_-]\s*\w|\.\s*\d|\.[a-z]|(?:bis|ter|quater|v\d+|version\s*\d+|rev(?:ision)?\w*|anexos?|incisos?)\b))(?=$|[\s,;:?!]|\.(?=\s|$))`;
  const referencePattern = new RegExp(String.raw`^(\d{1,6}(?:\.\d{3})?)(?:(?:\s*(?:\/|-|de(?:l)?(?:\s+ano)?|ano)\s*((?:19|20)\d{2})${referenceEnd})|(?!\s*(?:\/|-|de(?:l)?(?:\s+ano)?|ano)))\b`);
  const continuationPattern = new RegExp(String.raw`^\s*(?:,|;|y(?:\s+tambien)?|e|o|ademas\s+de|tambien|junto\s+con|mas|asimismo)\s*(?:(?:la|las|el|los)\s+)?(?:(?:ordenanzas?\b|ords?(?:\.|\b))\s*)?(?:municipal(?:es)?\s*)?(?:(?:numeros?|n(?:ro|um)|n\.?[º°o]|n)\.?(?=\s|\d)\s*)?(\d{1,6}(?:\.\d{3})?)(?:(?:\s*(?:\/|-|de(?:l)?(?:\s+ano)?|ano)\s*((?:19|20)\d{2})${referenceEnd})|(?!\s*(?:\/|-|de(?:l)?(?:\s+ano)?|ano)))\b`);
  const references = [];
  let hasUnparsedReference = false;
  const addReference = (match, start, end) => {
    const instrumentNumber = Number(String(match[1] || '').replace(/\./g, ''));
    const instrumentYear = Number(match[2] || 0);
    const reference = {
      instrumentNumber: Number.isInteger(instrumentNumber) ? instrumentNumber : null,
      instrumentYear: instrumentYear >= 1900 && instrumentYear <= 2100 ? instrumentYear : null,
      start,
      end,
    };
    if (!references.some((row) => row.start === reference.start && row.end === reference.end)) {
      references.push(reference);
    }
  };

  for (const lead of text.matchAll(leadPattern)) {
    const firstStart = lead.index;
    let cursor = lead.index + lead[0].length;
    const first = text.slice(cursor).match(referencePattern);
    if (!first) {
      if (/^\d{1,6}(?:\.\d{3})?/.test(text.slice(cursor))) hasUnparsedReference = true;
      continue;
    }
    cursor += first[0].length;
    addReference(first, firstStart, cursor);

    while (cursor < text.length) {
      const continuation = text.slice(cursor).match(continuationPattern);
      if (!continuation) break;
      const continuationStart = cursor;
      cursor += continuation[0].length;
      addReference(continuation, continuationStart, cursor);
    }
  }

  if (references.some((reference) => reference.instrumentNumber === 1021 && !reference.instrumentYear)) {
    hasUnparsedReference = true;
  }
  const unsupportedReferenceQualifier = /^\s*(?:[,;:]?\s*|\(\s*)(?:bis|ter|quater|v\d+|version\s*\d+|rev(?:ision)?\w*|anexos?|incisos?)\b/;
  if (references.some((reference) => unsupportedReferenceQualifier.test(text.slice(reference.end)))) {
    hasUnparsedReference = true;
  }
  if (/(?:\bdecretos?\b|\bd(?:to|cto|ec|ecr)s?\.?(?=\s|$)|\bresolucion(?:es)?\b|\bres(?:ol)?s?\.?(?=\s|$)|\bdisposicion(?:es)?\b|\bdisps?\.?(?=\s|$)|\bcircular(?:es)?\b|\bacuerdos?\b(?=\s+\d)|\bactos?\b|\bedictos?\b|\binstrumentos?\b|\bexpedientes?\b|\breglamentos?\b|\bnormas?\b|\bley(?:es)?\b|\bordza\.?(?=\s|$)|\b0rdenanz|\bordenanz@)/.test(text)) {
    hasUnparsedReference = true;
  }

  let residual = text;
  for (const reference of [...references].sort((left, right) => right.start - left.start)) {
    residual = `${residual.slice(0, reference.start)}${' '.repeat(reference.end - reference.start)}${residual.slice(reference.end)}`;
  }
  const hasUnnormalizedDecimalDigit = [...residual.matchAll(/\p{Nd}/gu)]
    .some((match) => match[0].codePointAt(0) > 0x7f);
  const hasConfusableScript = /[\p{Script=Cyrillic}\p{Script=Greek}]/u.test(residual);
  const sourceCuePattern = /\b(?:segun|conforme\s+a|fuente|source|origen|documento|referencia|ref\.?|de\s+acuerdo\s+con|aprobado\s+por|en\s+virtud\s+de)\b/g;
  for (const cue of text.matchAll(sourceCuePattern)) {
    const cueEnd = cue.index + cue[0].length;
    const linkedReference = references.some((reference) => {
      if (reference.start < cueEnd || reference.start - cueEnd > 48) return false;
      const between = text.slice(cueEnd, reference.start);
      return /^\s*[:#-]?\s*(?:(?:oficial|municipal)\s+)?(?:es\s+)?(?:(?:la|las|el|los)\s+)?$/.test(between);
    });
    if (!linkedReference) {
      hasUnparsedReference = true;
      break;
    }
  }
  const apparentReferencePattern = /(?:\b(?:ordenanzas?|ords?(?:\.|\b))|\b(?:numeros?|n(?:ro|um)|n\.?[º°o]|n)\.?\s*\d{1,6}|(?<!\d)\d{1,6}(?:\.\d{3})?\s*(?:\/|-)\s*[^\s,;?!]+|\b(?:segun|conforme\s+a|fuente|source|origen|documento|referencia|ref\.?|de\s+acuerdo\s+con|aprobado\s+por|en\s+virtud\s+de)\s*[:#-]?\s*(?:(?:la|las|el|los)\s+)?\d{1,6}\b|\b(?:ademas\s+de|tambien|junto\s+(?:con|a)|mas|asimismo)\s+(?:(?:la|las|el|los)\s+)?\d{1,6}\b|\b(?:la|las)\s+\d{1,6}\b)/;
  if (hasUnnormalizedDecimalDigit || hasConfusableScript || apparentReferencePattern.test(residual)) {
    hasUnparsedReference = true;
  }

  return { text, references, hasUnparsedReference };
}

function municipalOrdinanceReferences(message = '') {
  return municipalOrdinanceReferenceAnalysis(message).references
    .map(({ instrumentNumber, instrumentYear }) => ({ instrumentNumber, instrumentYear }));
}

function hasCompetingBudgetDomain(message = '') {
  return /\b(?:familiar(?:es)?|personal(?:es)?|licitacion(?:es)?|prestamos?|proyectos?|obras?|cotizacion(?:es)?|contratacion(?:es)?|compras?|eventos?|capacitacion(?:es)?|expedientes?|proveedor(?:es)?|contratos?)\b/.test(foldAssistantQuery(message));
}

function isMunicipalBudgetQuery(message, ordinances = municipalOrdinanceReferences(message)) {
  const competingDomain = hasCompetingBudgetDomain(message);
  const budgetNoun = /\bpresupuestos?\b/.test(message);
  const explicitSourceContext = /\bordenanzas?\b|\b(?:segun|conforme\s+a|fuente|source|origen|documento|referencia|ref\.?|de\s+acuerdo\s+con|aprobado\s+por|en\s+virtud\s+de)\b/.test(message);
  const supportedOrdinance = ordinances.some((ordinance) => ordinance.instrumentNumber === 1021
    && (!ordinance.instrumentYear || ordinance.instrumentYear === 2025));
  if (competingDomain) return budgetNoun && explicitSourceContext && !supportedOrdinance;
  if (supportedOrdinance) return true;

  if (budgetNoun && explicitSourceContext) return true;
  const fiscalTokenScope = /\bpresupuestos?(?:\s+(?:municipal(?:es)?|aprobados?|para|el|del|de|en|correspondiente|a|al|durante|fiscal|presupuestario|entre|contra|versus|con|ejercicio|periodo|ano))*\s*[:=,-]?\s*(?:\d+(?:[., ]\d+)*|dos\s+mil\s+\w+|veinti[a-z]+)/.test(message);
  const yearOrFiscalScope = fiscalTokenScope
    || /(?:\bmunicipal(?:es)?\b|\baprobados?\b|\bejercicio\b|\bfiscal\b|\bperiodo\b|\bvigencia\b|\bvigente\b|\bcorrespondiente\b)/.test(message);
  const genericBudgetQuestion = /^(?:(?:cual|cuanto)\s+(?:es\s+)?|(?:mostra|mostrame|explica|explicame|ver|consultar)\s+)?(?:el\s+)?presupuesto\s*[?!.]*$/.test(message);
  if (budgetNoun && !competingDomain && (yearOrFiscalScope || genericBudgetQuestion)) return true;

  const annualFinancialTerm = /\b(?:credito\s+presupuestario|gastos?\s+aprobados?|recursos\s+estimados?|financiamiento\s+estimado|ejecucion\s+presupuestaria)\b/.test(message);
  const municipalAnnualContext = /\b(?:municipal(?:es)?|municipio|presupuestos?|ordenanzas?|ejercicio|fiscal)\b/.test(message)
    || /\b(?:18|19|20|21|22)\d{2}\b/.test(message);
  return annualFinancialTerm && municipalAnnualContext && !competingDomain;
}

function extractLabelFilter(bodyValue, message, label, maximum = 160) {
  const explicit = normalizeText(bodyValue, maximum);
  if (explicit) return explicit;
  const text = normalizeText(message, MAX_MESSAGE_LENGTH);
  const match = text.match(new RegExp(`\\b(?:${label})\\s*(?:(?:de|por)\\s+)?[:#-]?\\s*([^,;.?!]+?)(?=\\s+(?:entre|desde|hasta|en|durante|para|motivo|c[oó]digo|severidad|estado|resoluci[oó]n)\\b|$)`, 'i'));
  return normalizeText(match?.[1], maximum);
}

function normalizeLeaveArticleSelector(value) {
  const candidate = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  const match = foldText(candidate).match(/^\s*(\d{1,3})(?:\.\d+)?(?:\s*(bis))?\s*$/);
  if (!match) return '';
  const article = Number(match[1]);
  if (!Number.isInteger(article) || article < 1 || article > 999) return '';
  return `${article}${match[2] ? ' bis' : ''}`;
}

function leaveArticleSelectors(body = {}, message = '') {
  const selectors = [];
  const add = (value) => {
    const normalized = normalizeLeaveArticleSelector(value);
    if (normalized && !selectors.includes(normalized)) selectors.push(normalized);
  };
  const explicit = Array.isArray(body.articles)
    ? body.articles
    : normalizeText(body.articles, 240).split(/[,;]+/);
  explicit.forEach(add);
  add(body.article);

  const text = foldAssistantQuery(message);
  for (const range of text.matchAll(/\bart(?:iculo)?s?\.?\s*(\d{1,3})(?:\.\d+)?(?:\s*(bis))?\s*(?:a|al|hasta|-)\s*(\d{1,3})(?:\.\d+)?(?:\s*(bis))?/g)) {
    const first = Number(range[1]);
    const last = Number(range[3]);
    if (range[2] || range[4] || !Number.isInteger(first) || !Number.isInteger(last)) {
      add(`${range[1]}${range[2] ? ' bis' : ''}`);
      add(`${range[3]}${range[4] ? ' bis' : ''}`);
      continue;
    }
    const start = Math.min(first, last);
    const end = Math.max(first, last);
    if (end - start <= 64) {
      for (let article = start; article <= end; article += 1) add(String(article));
    }
  }
  for (const match of text.matchAll(/\bart(?:iculo)?s?\.?\s*(\d{1,3})(?:\.\d+)?(?:\s*(bis))?/g)) {
    add(`${match[1]}${match[2] ? ' bis' : ''}`);
  }
  return selectors.sort((left, right) => {
    const leftNumber = Number(left.match(/^\d+/)?.[0]);
    const rightNumber = Number(right.match(/^\d+/)?.[0]);
    return leftNumber - rightNumber || left.localeCompare(right, 'es');
  });
}

const QUALITY_CODES = new Set([
  'CUIL_INVALID', 'CUIL_MISSING', 'DATE_ORDER_INVALID', 'DATE_OUT_OF_RANGE',
  'SOURCE_MONTH_MISMATCH', 'SOURCE_PERIOD_MISMATCH',
]);
const QUALITY_SEVERITIES = new Set(['info', 'warning', 'error', 'critical']);
const QUALITY_RESOLUTIONS = new Set(['open', 'accepted', 'corrected', 'rejected']);
const QUALITY_ENTITIES = new Set(['persona', 'legajo', 'artifact:calculo', 'artifact:histocal', 'artifact:legamov', 'calculo_monthly']);

function naturalFilters(body, message, intent) {
  const text = foldAssistantQuery(message);
  if (['attendance_status', 'out_of_scope'].includes(intent)) return {};
  if (intent === 'budget_approved') {
    const ordinanceAnalysis = municipalOrdinanceReferenceAnalysis(message);
    const messageFiscalAnalysis = budgetFiscalYearAnalysis(message, ordinanceAnalysis);
    const explicitFiscalYear = structuredIntegerField(body, 'fiscalYear', 1900, 2100, /^\d{4}$/);
    const explicitYearAlias = structuredIntegerField(body, 'year', 1900, 2100, /^\d{4}$/);
    const fiscalYearInvalid = (explicitFiscalYear.provided && !explicitFiscalYear.valid)
      || (explicitYearAlias.provided && !explicitYearAlias.valid)
      || messageFiscalAnalysis.invalid;
    const explicitFiscalYears = [...new Set([
      ...(explicitFiscalYear.valid ? [explicitFiscalYear.value] : []),
      ...(explicitYearAlias.valid ? [explicitYearAlias.value] : []),
    ])];
    const messageFiscalYears = ordinanceAnalysis.hasUnparsedReference
      ? []
      : messageFiscalAnalysis.years;
    const allFiscalYears = [...new Set([...explicitFiscalYears, ...messageFiscalYears])];
    const fiscalYearConflict = explicitFiscalYears.length > 1
      || messageFiscalYears.length > 1
      || allFiscalYears.length > 1;
    const fiscalYear = explicitFiscalYears[0] ?? messageFiscalYears[0] ?? null;
    const ordinances = ordinanceAnalysis.references;
    const messageWrongNumber = ordinances.find((ordinance) => ordinance.instrumentNumber !== 1021);
    const messageWrongYear = ordinances.find((ordinance) => ordinance.instrumentNumber === 1021
      && ordinance.instrumentYear && ordinance.instrumentYear !== 2025);
    const explicitNumber = structuredIntegerField(body, 'instrumentNumber', 0, 999_999, /^\d{1,6}$/);
    const explicitYear = structuredIntegerField(body, 'instrumentYear', 1900, 2100, /^\d{4}$/);
    const explicitReferenceFlagInvalid = Object.hasOwn(body, 'instrumentReferenceUnparsed')
      && typeof body.instrumentReferenceUnparsed !== 'boolean';
    const instrumentTypeProvided = Object.hasOwn(body, 'instrumentType');
    const instrumentType = typeof body.instrumentType === 'string' ? foldText(body.instrumentType) : '';
    const instrumentTypeInvalid = instrumentTypeProvided
      && !['ordenanza', 'ordenanza municipal'].includes(instrumentType);
    const structuredReferenceIncomplete = explicitNumber.provided !== explicitYear.provided
      || (instrumentTypeProvided && (!explicitNumber.provided || !explicitYear.provided));
    const unsupportedStructuredLegalObject = Object.hasOwn(body, 'legalInstrument');
    const selectedNumber = messageWrongNumber?.instrumentNumber
      ?? (explicitNumber.valid ? explicitNumber.value : null);
    const selectedYear = messageWrongYear?.instrumentYear
      ?? (explicitYear.valid ? explicitYear.value : null);
    return {
      ...(hasCompetingBudgetDomain(message) ? { budgetScopeUnsupported: true } : {}),
      ...(fiscalYear !== null ? { fiscalYear } : {}),
      ...(fiscalYearInvalid ? { fiscalYearInvalid: true } : {}),
      ...(fiscalYearConflict ? { fiscalYearConflict: true } : {}),
      ...(ordinanceAnalysis.hasUnparsedReference
          || body.instrumentReferenceUnparsed === true
          || explicitReferenceFlagInvalid
          || instrumentTypeInvalid
          || structuredReferenceIncomplete
          || unsupportedStructuredLegalObject
          || (explicitNumber.provided && !explicitNumber.valid)
          || (explicitYear.provided && !explicitYear.valid)
        ? { instrumentReferenceUnparsed: true }
        : {}),
      ...(selectedNumber !== null
        ? { instrumentNumber: selectedNumber }
        : {}),
      ...(selectedYear !== null
        ? { instrumentYear: selectedYear }
        : {}),
    };
  }
  const dateSelection = dateFilters(body, message, intent);
  const filters = { ...dateSelection };
  const sector = extractLabelFilter(body.sector, message, 'sector');
  const organization = extractLabelFilter(body.organization, message, 'organizaci[oó]n|repartici[oó]n');
  const role = extractLabelFilter(body.role, message, 'cargo|funci[oó]n(?:es)?');
  if (sector) filters.sector = sector;
  if (organization) filters.organization = organization;
  if (role) filters.role = role;

  const explicitReasonCode = normalizeText(body.reasonCode, 64);
  const reasonMatch = normalizeText(message).match(/\bmotivo\s*(?:c[oó]digo)?\s*[:#-]?\s*([^,;.?!]+?)(?=\s+(?:entre|desde|hasta|en|durante|para|sector)\b|$)/i);
  if (explicitReasonCode) filters.reasonCode = explicitReasonCode;
  else if (reasonMatch) {
    const reason = normalizeText(reasonMatch[1], 120);
    if (/^[a-z]?\d{1,8}$/i.test(reason)) filters.reasonCode = reason;
    else filters.reason = reason;
  }

  const severity = normalizeText(body.severity, 16).toLowerCase()
    || [...QUALITY_SEVERITIES].find((value) => new RegExp(`\\b${value}\\b`).test(text))
    || ({ critica: 'critical', criticas: 'critical', critico: 'critical', criticos: 'critical', error: 'error', errores: 'error', advertencia: 'warning', advertencias: 'warning', informativa: 'info', informativas: 'info', informativo: 'info', informativos: 'info' }[
      text.match(/\b(criticas?|criticos?|errores?|advertencias?|informativas?|informativos?)\b/)?.[1]
    ] || '');
  if (QUALITY_SEVERITIES.has(severity)) filters.severity = severity;

  const explicitCode = normalizeText(body.code, 64).toUpperCase();
  const messageCode = normalizeText(message).toUpperCase().match(/\b(?:C[OÓ]DIGO|CODE)\s*[:#-]?\s*([A-Z][A-Z0-9_]{2,63})\b/)?.[1]
    || [...QUALITY_CODES].find((value) => normalizeText(message).toUpperCase().includes(value));
  if (QUALITY_CODES.has(explicitCode)) filters.code = explicitCode;
  else if (messageCode && QUALITY_CODES.has(messageCode)) filters.code = messageCode;

  const resolution = normalizeText(body.resolution, 24).toLowerCase()
    || ({ abierto: 'open', abiertos: 'open', aceptado: 'accepted', aceptados: 'accepted', corregido: 'corrected', corregidos: 'corrected', rechazado: 'rejected', rechazados: 'rejected' }[
      text.match(/\b(abiertos?|aceptados?|corregidos?|rechazados?)\b/)?.[1]
    ] || '');
  if (QUALITY_RESOLUTIONS.has(resolution)) filters.resolution = resolution;

  const entity = normalizeText(body.entity, 128).toLowerCase()
    || normalizeText(message).match(/\bentidad\s*[:#-]?\s*([a-z0-9:_-]+)\b/i)?.[1]?.toLowerCase()
    || '';
  if (QUALITY_ENTITIES.has(entity)) filters.entity = entity;

  if (['quality_issue_list', 'import_lineage'].includes(intent)) {
    const source = normalizeText(body.source, 16).toUpperCase()
      || (includesPhrase(text, 'personas') ? 'PERSONAS' : includesPhrase(text, 'grh') ? 'GRH' : '');
    if (['GRH', 'PERSONAS'].includes(source)) filters.source = source;
  }

  if (/\b(?:ultimo|ultima)\s+(?:lote|carga|importacion|snapshot)\b/.test(text)
      || normalizeText(body.batch, 32).toLowerCase() === 'latest_published') {
    filters.batch = 'latest_published';
  }
  if (['absence_event_list', 'quality_issue_list', 'employee_search'].includes(intent)) {
    filters.page = boundedInteger(body.page, 1, 1, 100_000);
    filters.limit = boundedInteger(body.limit, 10, 1, 25);
  }
  if (intent === 'absence_analysis') filters.bucket = normalizeText(body.bucket, 16) || 'month';
  if (intent === 'leave_policy') {
    const articles = leaveArticleSelectors(body, message);
    if (articles.length) filters.articles = articles;
  }
  return filters;
}

function sanitizeConversationFilters(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output = {};
  for (const key of ['from', 'to']) {
    const date = isoDateOnly(value[key]);
    if (date) output[key] = date;
  }
  for (const [key, maximum] of [['sector', 160], ['organization', 160], ['role', 160], ['reasonCode', 64], ['reason', 120], ['severity', 16], ['code', 64], ['entity', 128], ['resolution', 24], ['source', 16], ['batch', 32], ['bucket', 16]]) {
    const text = normalizeText(value[key], maximum);
    if (text) output[key] = text;
  }
  for (const key of ['year', 'yearFrom', 'yearTo']) {
    const year = Number(value[key]);
    if (Number.isInteger(year) && year >= 1900 && year <= 2100) output[key] = year;
  }
  if (Array.isArray(value.articles)) {
    const articles = value.articles
      .map(normalizeLeaveArticleSelector)
      .filter(Boolean)
      .slice(0, 65);
    if (articles.length) output.articles = [...new Set(articles)];
  }
  return output;
}

function sanitizeConversationContext(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const selected = value.selectedEmployee || value.employee || {};
  const companyId = safeIdentifier(selected.companyId, 32);
  const legajo = safeIdentifier(selected.legajo, 64);
  const contractId = safeIdentifier(selected.contractId, 64);
  const intent = normalizeText(value.intent, 40).toLowerCase();
  const queryFocus = ['licenses', 'absences'].includes(value.queryFocus) ? value.queryFocus : '';
  const queryYear = Number(value.queryYear);
  return {
    ...(INTENTS.has(intent) ? { intent } : {}),
    ...(normalizeText(value.domain, 40) ? { domain: normalizeText(value.domain, 40) } : {}),
    ...(queryFocus ? { queryFocus } : {}),
    ...(Number.isInteger(queryYear) && queryYear >= 1900 && queryYear <= 2100 ? { queryYear } : {}),
    ...((companyId && legajo) || contractId ? {
      selectedEmployee: {
        ...(companyId ? { companyId } : {}),
        ...(legajo ? { legajo } : {}),
        ...(contractId ? { contractId } : {}),
      },
    } : {}),
    filters: sanitizeConversationFilters(value.filters),
  };
}

function conversationContextFromBody(body = {}) {
  const direct = sanitizeConversationContext(body.conversationContext || body.context);
  if (direct) return { value: direct, source: 'request_context' };
  const history = Array.isArray(body.history) ? body.history.slice(-MAX_HISTORY_ITEMS).reverse() : [];
  for (const item of history) {
    const candidate = sanitizeConversationContext(item?.conversationContext || item?.context || item?.metadata?.conversationContext);
    if (candidate) return { value: candidate, source: 'structured_history' };
  }
  return { value: null, source: null };
}

function referentialNominalFollowUp(message) {
  const text = foldAssistantQuery(message);
  const referential = /\b(?:sus?|del mismo|de la misma|esa persona|ese empleado|esa empleada)\b/.test(text)
    || /^\s*(?:y|ahora)\s+(?:las?|sus?)?\s*(?:ausencias?|licencias?|ficha|detalle)\b/.test(text);
  if (!referential) return null;
  return {
    focus: employeeRecordFocus(text) || (/\b(?:ficha|detalle)\b/.test(text) ? '' : null),
  };
}

function isContextualContinuation(message) {
  return /^\s*(?:[¿?]\s*)?(?:y|ahora|tambien|ademas)\b/.test(foldAssistantQuery(message));
}

function contextualTransform(message, context) {
  const text = foldAssistantQuery(message);
  if (context?.intent === 'absence_event_list'
      && /\b(?:resumi|resume|resumen|sintetiza)\b.*\beventos?\b.*\bsin datos nominales\b/.test(text)) {
    return {
      intent: 'absence_analysis',
      reason: 'aggregate_summary_from_nominal_event_context',
      decision: 'converted_nominal_event_list_to_aggregate_summary',
    };
  }
  if (context?.intent === 'quality_issue_list'
      && /\b(?:linaje|trazabilidad)\b/.test(text)) {
    return {
      intent: 'import_lineage',
      reason: 'lineage_from_quality_context',
      decision: 'switched_quality_queue_to_import_lineage',
    };
  }
  if (context?.intent && INTENTS.has(context.intent)
      && /\b(?:mismo\s+)?periodo\b.*\bano anterior\b/.test(text)) {
    return {
      intent: context.intent,
      reason: 'previous_calendar_year_period',
      decision: 'shifted_context_period_to_previous_calendar_year',
      shiftPreviousYear: true,
    };
  }
  return null;
}

function previousCalendarYearDate(value) {
  const date = isoDateOnly(value);
  if (!date) return '';
  const [year, month, day] = date.split('-').map(Number);
  const targetYear = year - 1;
  const lastDay = new Date(Date.UTC(targetYear, month, 0)).getUTCDate();
  return `${targetYear}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

function previousCalendarYearFilters(filters = {}) {
  const output = { ...filters };
  if (filters.from) output.from = previousCalendarYearDate(filters.from);
  if (filters.to) output.to = previousCalendarYearDate(filters.to);
  for (const key of ['year', 'yearFrom', 'yearTo']) {
    if (Number.isInteger(Number(filters[key]))) output[key] = Number(filters[key]) - 1;
  }
  return output;
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
    licencias: 'revisar_licencias_normativas',
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
  const budgetOrdinances = municipalOrdinanceReferences(message);
  const recordFocus = employeeRecordFocus(message);
  if (recordFocus && extractLegajo(body.message)) return 'employee_detail';
  if (recordFocus && extractEmployeeRecordSearch(body.message)) return 'employee_search';
  if (/\b(?:que significa|que quiere decir|defini(?:r|cion)|glosario|termino)\b/.test(message)) return 'glossary';
  if (/\b(?:como (?:hago|puedo|se hace|busco|abro|reviso|controlo|audito|exploro|uso|interpreto|veo|buscar|abrir|revisar|controlar|auditar|explorar|usar|interpretar|ver)|paso a paso|guia para|quiero (?:buscar|abrir|revisar|controlar|auditar|explorar|usar))\b/.test(message)) return 'task_guidance';
  if (/\b(?:que hace|para que sirve|que muestra|que (?:puedo|se puede) hacer en|explica(?:me)? (?:la )?(?:seccion|pantalla|modulo))\b/.test(message)) return 'section_explanation';
  const attendanceTopic = /\b(?:relojes?|marcaciones?|fichadas?|fichajes?|puntos?\s+de\s+marcacion|control\s+horario|huellas?\s+digitales?|biometri(?:a|co|cos|ca|cas)|conectores?)\b/.test(message);
  const attendanceStateQuestion = /\b(?:estado|cobertura|inventario|mapa|calor|donde|tenemos|cuant[oa]s?|conectad[oa]s?|activ[oa]s?|recibid[oa]s?|registrad[oa]s?|hoy|ahora|tiempo\s+real|ubicacion|georreferenciad[oa]s?)\b/.test(message);
  if (attendanceTopic && attendanceStateQuestion) return 'attendance_status';
  if (/\b(?:donde (?:esta|encuentro|veo|puedo)|como (?:llego|entro)|ir a|navegacion|navegar|menu|secciones|pantallas|onboarding|soy nuev[oa]|primer ingreso)\b/.test(message)) return 'help_navigation';
  if (/\b(?:comparar|compara|compare|comparame|comparativa|comparacion)\b[^.?!]*\bgestiones?\b/.test(message)
      || /\b(?:comparar|compara|compare|comparame)\b[^.?!]*\bgestion\b[^.?!]*\banterior\b/.test(message)
      || /\bgestiones?\b[^.?!]*\b(?:actual|anterior|comparar|compara|comparativa|comparacion|versus|vs|contra)\b/.test(message)
      || /\bgestion\s+(?:actual|vigente)\s+(?:versus|vs|contra|y|con)\s+(?:la\s+)?(?:gestion\s+)?anterior\b/.test(message)
      || /\b(?:ano\s*)?[1-4]\s+(?:de\s+(?:la\s+)?)?gestion\b/.test(message)
      || /\b(?:primer|primero|segundo|tercer|tercero|cuarto)\s+ano\s+de\s+(?:la\s+)?gestion\b/.test(message)
      || /\bano\s+por\s+ano\b[^.?!]*\bgestiones?\b/.test(message)) return 'management_comparison';
  if (isMunicipalBudgetQuery(message, budgetOrdinances)) return 'budget_approved';
  if (/\b(?:ficha|detalle)\b/.test(message) && /\blegajo\b/.test(message)) return 'employee_detail';
  if (/\b(?:buscar|busca|encontrar|ficha)\b.*\b(?:emplead[oa]s?|personas?|legajos?)\b/.test(message)
      || /\b(?:emplead[oa]s?|personas?|legajos?)\b.*\b(?:buscar|busca|encontrar|ficha)\b/.test(message)) return 'employee_search';
  if (/\b(?:linaje|trazabilidad|lotes?|cargas?|importaciones?|snapshots?)\b/.test(message)
      && /\b(?:datos?|fuentes?|grh|personas|publicad[oa]s?|importacion|carga|lote|snapshots?)\b/.test(message)) return 'import_lineage';
  if (/\b(?:hallazgos?|incidencias?|casos?|cola|errores?)\b/.test(message)
      && /\b(?:calidad|severidad|codigo|critical|critico|critica|warning|error|cuil_invalid|date_)\b/.test(message)) return 'quality_issue_list';
  if (/\b(?:listar|lista|listame|mostra|mostrame|listado|detalle|registro|ultimos?|ultimas?)\b.*\b(?:eventos?\s+(?:administrativos?\s+)?de\s+ausencia|ausencias?|faltas?)\b/.test(message)
      || /\beventos?\s+(?:administrativos?\s+)?de\s+ausencia\b.*\b(?:sector|motivo|desde|entre|en\s+(?:19|20)\d{2})\b/.test(message)) return 'absence_event_list';
  if (/\b(?:estructura|organigrama|organizacion(?:es)?|reparticion(?:es)?|sector(?:es)?|cargos?|funcion(?:es)?)\b/.test(message)
      && !/\b(?:ausencias?|ausentismo|licencias?|faltas?)\b/.test(message)) return 'structure_analysis';
  if (/\b(?:resumen|estado|inventario|panorama)\s+(?:general\s+)?(?:operativo|de\s+grh|de\s+la\s+base|de\s+datos)\b/.test(message)) return 'operational_summary';
  if (/\b(?:resumen|lectura|panorama|informe|analisis)\s+(?:general\s+)?ejecutiv[oa]\b/.test(message)) return 'executive_analysis';
  if (/\b(?:calidad(?: de datos| operativa)?|dq-?01|hallazgos?|severidad|controles? de calidad|controles? de personas)\b/.test(message)) return 'quality_analysis';
  if (/\b(?:ley\s*5?811|titulo\s*(?:vi|6)|regimen\s+(?:legal\s+)?de\s+licencias|art(?:iculo)?s?\.?\s*(?:37|38|39|40|41|42|43|44|45|46|47|48|49|50|51|52|53|54|55|56|57|58|59|60|61|62|63|64|65)|cuantos?\s+dias?\s+(?:de\s+)?licencia\s+anual|licencia\s+anual\s+(?:por|segun)\s+antiguedad)\b/.test(message)) return 'leave_policy';
  if (/\b(?:ausencias?|ausentismo|licencias?|eventos? de ausencia|faltas?)\b/.test(message)) return 'absence_analysis';
  if (/\b(?:nomina|liquidacion|haberes|sueldo|salario|corrida|julio|agosto)\b/.test(message)) return 'payroll_control';
  if (/\b(?:personas|crosswalk|integracion|coincidencia|identidad|padron)\b/.test(message)) return 'integration_quality';
  if (/\b(?:dotacion|activos?|liquidables?|brecha|plantel|cuantos?|882|854)\b/.test(message)) return 'workforce_summary';
  if (/\b(?:buscar|busca|encontrar|empleados?|directorio|ficha)\b/.test(message)) return 'employee_search';
  if (/\b(?:analiza|analisis|explica|recomendacion|diagnostico|ejecutivo)\b/.test(message)) return 'executive_analysis';
  if (/\b(?:ayuda|guia|tutorial|aprender|orientacion)\b/.test(message)) return 'help_navigation';
  return 'out_of_scope';
}

function intentDomain(intent) {
  if (['employee_search', 'employee_detail'].includes(intent)) return 'employee';
  if (['absence_analysis', 'absence_event_list'].includes(intent)) return 'absence';
  if (intent === 'leave_policy') return 'leave_policy';
  if (intent === 'management_comparison') return 'management';
  if (intent === 'budget_approved') return 'budget';
  if (intent === 'attendance_status') return 'attendance';
  if (['quality_analysis', 'quality_issue_list'].includes(intent)) return 'quality';
  if (intent === 'structure_analysis') return 'structure';
  if (intent === 'import_lineage') return 'lineage';
  if (['workforce_summary', 'operational_summary'].includes(intent)) return 'workforce';
  if (intent === 'payroll_control') return 'payroll';
  if (intent === 'integration_quality') return 'integration';
  if (intent === 'executive_analysis') return 'executive';
  return 'guidance';
}

function resourceDescriptor(name) {
  return {
    name,
    mode: 'read_only',
    containsNominalData: ['absenceevents', 'employees', 'employee'].includes(name),
  };
}

async function resolveAbsenceReason(sql, value) {
  const reason = normalizeText(value, 120);
  if (!reason) return { status: 'not_requested', candidates: [] };
  const folded = foldText(reason);
  const likeValue = folded.replace(/[\\%_]/g, '\\$&');
  const rows = await sql.query(`
    /* assistant:resolve-absence-reason */
    SELECT source_payload #>> '{sourceKey,reasonCode}' AS code, label
      FROM grh_catalog_rows
     WHERE catalog = 'absence_reasons'
       AND translate(lower(label), 'áéíóúüñ', 'aeiouun') LIKE $1 ESCAPE '\\'
     GROUP BY source_payload #>> '{sourceKey,reasonCode}', label
     ORDER BY CASE
                WHEN translate(lower(label), 'áéíóúüñ', 'aeiouun') = $2 THEN 0
                ELSE 1
              END,
              label
     LIMIT 6
  `, [`%${likeValue}%`, folded]);
  const candidates = rows
    .map((row) => ({ code: safeIdentifier(row?.code, 64), label: normalizeText(row?.label, 160) }))
    .filter((row) => row.code && row.label);
  if (candidates.length === 1) return { status: 'resolved', reasonCode: candidates[0].code, candidates };
  return { status: candidates.length ? 'ambiguous' : 'not_found', candidates };
}

export function planAssistantRequest(body = {}) {
  const message = normalizeText(body.message);
  const explicitIntent = normalizeText(body.intent, 40).toLowerCase();
  const contextResult = conversationContextFromBody(body);
  const context = contextResult.value;
  const nominalFollowUp = !explicitIntent ? referentialNominalFollowUp(message) : null;
  const transform = !explicitIntent ? contextualTransform(message, context) : null;
  const decisions = [];
  let intent = classifyAssistantRequest(body);
  let contextUsed = false;
  let contextReason = null;
  let missingNominalContext = false;

  if (nominalFollowUp) {
    intent = 'employee_detail';
    const selected = context?.selectedEmployee;
    if (selected?.companyId && selected?.legajo) {
      contextUsed = true;
      contextReason = 'referential_nominal_follow_up';
      decisions.push('resolved_nominal_reference_from_structured_context');
    } else {
      missingNominalContext = true;
      decisions.push('nominal_reference_requires_selected_employee');
    }
  } else if (transform) {
    intent = transform.intent;
    contextUsed = true;
    contextReason = transform.reason;
    decisions.push(transform.decision);
  } else if (!explicitIntent && isContextualContinuation(message) && context?.intent
      && INTENTS.has(context.intent) && context.intent !== 'employee_search') {
    intent = context.intent;
    contextUsed = true;
    contextReason = 'aggregate_or_scoped_continuation';
    decisions.push('continued_from_structured_context');
  } else {
    decisions.push(explicitIntent ? 'explicit_intent' : 'deterministic_message_classification');
  }

  const currentFilters = naturalFilters(body, message, intent);
  const requestContextFilters = contextResult.source === 'request_context'
    ? sanitizeConversationFilters(context?.filters)
    : {};
  if (!contextUsed && Object.keys(requestContextFilters).length > 0) {
    contextUsed = true;
    contextReason = 'explicit_filter_context';
    decisions.push('applied_allowlisted_request_context_filters');
  }
  let inheritedFilters = contextUsed ? sanitizeConversationFilters(context?.filters) : {};
  if (transform?.shiftPreviousYear) {
    inheritedFilters = previousCalendarYearFilters(inheritedFilters);
  }
  const filters = { ...inheritedFilters, ...currentFilters };
  const selected = context?.selectedEmployee;
  const employeeIntent = ['employee_search', 'employee_detail'].includes(intent);
  const focus = employeeIntent ? (
    employeeRecordFocus(message)
      || (contextUsed ? context?.queryFocus : '')
      || normalizeText(body.queryFocus, 16)
  ) : '';
  const queryYear = employeeIntent ? (
    extractEmployeeRecordYear(message)
      || (contextUsed ? context?.queryYear : null)
      || filters.year
      || null
  ) : null;

  if (intent === 'employee_search') {
    filters.search = normalizeText(body.search, MAX_SEARCH_LENGTH)
      || extractEmployeeRecordSearch(message)
      || extractEmployeeSearch(message);
  }
  if (intent === 'employee_detail') {
    filters.contractId = safeIdentifier(body.contractId, 64) || (contextUsed ? selected?.contractId || '' : '');
    filters.legajo = safeIdentifier(body.legajo, 64) || extractLegajo(message) || (contextUsed ? selected?.legajo || '' : '');
    filters.companyId = safeIdentifier(body.companyId, 32) || extractCompanyId(message) || (contextUsed ? selected?.companyId || '' : '');
  }
  if (focus) filters.queryFocus = focus;
  if (queryYear) {
    filters.queryYear = queryYear;
    filters.from = filters.from || `${queryYear}-01-01`;
    filters.to = filters.to || `${queryYear}-12-31`;
  }

  const allowedFilters = {
    operational_summary: [],
    structure_analysis: ['organization', 'sector', 'role'],
    absence_analysis: ['from', 'to', 'year', 'yearFrom', 'yearTo', 'sector', 'reason', 'reasonCode', 'bucket'],
    leave_policy: ['articles'],
    absence_event_list: ['from', 'to', 'year', 'yearFrom', 'yearTo', 'sector', 'reason', 'reasonCode', 'page', 'limit'],
    quality_issue_list: ['source', 'severity', 'entity', 'code', 'resolution', 'page', 'limit'],
    import_lineage: ['source', 'batch'],
    management_comparison: [],
    budget_approved: [
      'fiscalYear', 'fiscalYearInvalid', 'fiscalYearConflict',
      'instrumentNumber', 'instrumentYear', 'instrumentReferenceUnparsed', 'budgetScopeUnsupported',
    ],
    employee_search: ['search', 'page', 'limit', 'queryFocus', 'queryYear', 'from', 'to', 'year'],
    employee_detail: ['contractId', 'legajo', 'companyId', 'queryFocus', 'queryYear', 'from', 'to', 'year'],
  }[intent];
  const rejectedFilters = [];
  if (allowedFilters) {
    for (const key of Object.keys(filters)) {
      if (!allowedFilters.includes(key)) {
        if (Object.hasOwn(currentFilters, key)) {
          rejectedFilters.push(key);
        } else {
          decisions.push(`dropped_incompatible_context_filter:${key}`);
        }
        delete filters[key];
      }
    }
  }

  const resources = (INTENT_RESOURCES[intent] || INTENT_RESOURCES.help).map(resourceDescriptor);
  const externalPolicy = EXTERNAL_ALLOWED_INTENTS.has(intent)
    ? 'aggregate_allowlisted'
    : 'local_only';
  return {
    version: QUERY_PLAN_VERSION,
    intent,
    domain: intentDomain(intent),
    resource: resources[0]?.name || 'productguidance',
    resources,
    filters,
    contextUsed: {
      used: contextUsed,
      source: contextUsed ? contextResult.source : null,
      fields: contextUsed
        ? [
          ...(intent === 'employee_detail' && selected?.companyId ? ['selectedEmployee.companyId'] : []),
          ...(intent === 'employee_detail' && selected?.legajo ? ['selectedEmployee.legajo'] : []),
          ...(intent === 'employee_detail' && selected?.contractId ? ['selectedEmployee.contractId'] : []),
          ...(context?.queryFocus ? ['queryFocus'] : []),
          ...(context?.queryYear ? ['queryYear'] : []),
          ...Object.keys(inheritedFilters)
            .filter((key) => Object.hasOwn(filters, key))
            .map((key) => `filters.${key}`),
        ]
        : [],
      reason: contextReason,
    },
    externalPolicy,
    decisions,
    rejectedFilters,
    privacy: {
      rawHistoryContentIgnored: true,
      structuredHistoryAccepted: true,
      rawUserMessageSentExternally: false,
      nominalDataExternalized: false,
    },
    missingNominalContext,
  };
}

function publicQueryPlan(plan) {
  const { missingNominalContext: _missingNominalContext, ...visible } = plan;
  return visible;
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

async function loadGovernedAttendanceStatus(access, env) {
  const reportedInventory = getReportedAttendanceInventory(access?.principal);
  try {
    const tenantSession = actionMutationSession(access, env);
    const sql = await getActionCenterSql(env);
    const bootstrap = await getAttendanceBootstrap(sql, access.principal, tenantSession);
    return {
      status: 'ready',
      reportedInventory,
      bootstrap,
      gateway: { available: true, unavailableCode: null },
    };
  } catch (error) {
    return {
      status: reportedInventory ? 'reported_only' : 'unavailable',
      reportedInventory,
      bootstrap: null,
      gateway: {
        available: false,
        unavailableCode: safeIdentifier(error?.code, 80) || 'ATTENDANCE_GATEWAY_UNAVAILABLE',
      },
    };
  }
}

function attendanceStatusResult(payload = {}) {
  const reported = payload.reportedInventory && typeof payload.reportedInventory === 'object'
    ? payload.reportedInventory
    : null;
  const sites = Array.isArray(reported?.data) ? reported.data : [];
  const reportedSiteCount = reported
    ? qualityCount(reported?.source?.recordCount ?? sites.length)
    : null;
  const georeferencedSiteCount = reported
    ? sites.filter((site) => Number.isFinite(Number(site?.latitude))
      && Number.isFinite(Number(site?.longitude))).length
    : null;
  const networkPullReported = reported
    ? sites.filter((site) => site?.channel === 'network_pull').length
    : null;
  const removableMediaReported = reported
    ? sites.filter((site) => site?.channel === 'removable_media').length
    : null;
  const bootstrap = payload.bootstrap && typeof payload.bootstrap === 'object'
    ? payload.bootstrap
    : null;
  const gatewayAvailable = payload.gateway?.available === true && Boolean(bootstrap);
  const summary = gatewayAvailable ? bootstrap.summary || {} : {};
  const hardwareConnectionConfirmed = gatewayAvailable
    ? bootstrap.features?.hardwareConnected === true
    : false;
  const coverage = {
    reportedSites: reportedSiteCount,
    georeferencedSites: georeferencedSiteCount,
    networkPullReported,
    removableMediaReported,
    physicalConnectionConfirmedByInventory: reported?.physicalConnectionConfirmed === true,
    heatMetric: reported?.heatMetric || null,
    mappingVersion: reported?.source?.mappingVersion || null,
  };
  const operational = {
    apiAvailable: gatewayAvailable,
    registeredSites: gatewayAvailable ? qualityCount(summary.siteCount) : null,
    registeredDevices: gatewayAvailable ? qualityCount(summary.deviceCount) : null,
    registeredConnectors: gatewayAvailable ? qualityCount(summary.connectorCount) : null,
    activeConnectors: gatewayAvailable ? qualityCount(summary.activeConnectorCount) : null,
    rawEvents: gatewayAvailable ? qualityCount(summary.rawEventCount) : null,
    canonicalPunches: gatewayAvailable ? qualityCount(summary.punchCount) : null,
    unmatchedPunches: gatewayAvailable ? qualityCount(summary.unmatchedPunchCount) : null,
    pendingReview: gatewayAvailable ? qualityCount(summary.pendingReviewCount) : null,
    hardwareConnectionConfirmed,
    temporalWindow: null,
    unavailableCode: gatewayAvailable ? null : payload.gateway?.unavailableCode || 'ATTENDANCE_GATEWAY_UNAVAILABLE',
  };
  if (!reported && !gatewayAvailable) {
    return {
      status: 503,
      answer: 'No hay un inventario municipal reportado ni un estado operativo verificable del gateway de marcaciones para esta sesión. No corresponde inferir puntos, equipos, conectividad ni fichadas.',
      data: { coverage, operational },
      targetPath: '/relojes-marcaciones',
      relatedSections: relatedSections(['marcaciones', 'ayuda']),
      asOf: null,
      sources: [],
    };
  }

  const reportedAnswer = reported
    ? `El relevamiento municipal reporta ${formatNumber(reportedSiteCount)} puntos y ${formatNumber(georeferencedSiteCount)} ubicaciones con coordenadas: ${formatNumber(networkPullReported)} con extracción por red informada y ${formatNumber(removableMediaReported)} por medio removible.`
    : 'Este municipio no tiene un inventario de puntos reportado en la fuente disponible.';
  const gatewayAnswer = gatewayAvailable
    ? `El gateway registra ${formatNumber(operational.registeredSites)} puntos dados de alta, ${formatNumber(operational.registeredDevices)} equipos, ${formatNumber(operational.activeConnectors)} conectores activos sobre ${formatNumber(operational.registeredConnectors)} y ${formatNumber(operational.canonicalPunches)} marcaciones canónicas. ${hardwareConnectionConfirmed ? 'La API informa conexión física habilitada para esta sesión.' : 'La API no confirma conexión física activa para esta sesión.'}`
    : 'El estado operativo del gateway no pudo verificarse en esta consulta, por lo que no se afirma conectividad ni recepción de fichadas.';
  const facts = [
    ...(reported ? [
      { label: 'Puntos reportados', value: reportedSiteCount },
      { label: 'Puntos georreferenciados', value: georeferencedSiteCount },
      { label: 'Extracción por red informada', value: networkPullReported },
      { label: 'Extracción por medio removible', value: removableMediaReported },
    ] : []),
    ...(gatewayAvailable ? [
      { label: 'Equipos registrados en el gateway', value: operational.registeredDevices },
      { label: 'Conectores activos', value: `${operational.activeConnectors} de ${operational.registeredConnectors}` },
      { label: 'Marcaciones canónicas acumuladas', value: operational.canonicalPunches },
      { label: 'Pendientes de revisión', value: operational.pendingReview },
    ] : [{ label: 'Estado operativo del gateway', value: 'No verificable en esta consulta' }]),
  ];
  return {
    answer: `${reportedAnswer} Ese inventario describe puntos informados y no prueba que los relojes estén conectados. ${gatewayAnswer} El bootstrap no informa una ventana temporal: estos conteos no permiten afirmar cuántas marcaciones hubo hoy ni ubicación en tiempo real.`,
    data: {
      coverage,
      operational,
      facts,
      limitations: [
        'reported_inventory_is_not_live_connectivity',
        'bootstrap_has_no_temporal_window',
        'punch_is_not_hours_worked_or_payroll_impact',
        'biometric_templates_are_not_exposed_or_stored_by_this_assistant',
      ],
    },
    targetPath: '/relojes-marcaciones',
    relatedSections: relatedSections(['marcaciones', 'ausentismo', 'calidad']),
    asOf: null,
    sources: [
      ...(reported ? [{
        system: 'MUNICIPIO_DE_JUNIN',
        relation: 'reported_attendance_inventory',
        authority: reported.source?.kind || 'municipal_workbook',
        asOf: null,
      }] : []),
      ...(gatewayAvailable ? [{
        system: 'ATTENDANCE_GATEWAY',
        relation: 'attendance_gateway_bootstrap_v1',
        authority: 'tenant_attendance_control',
        asOf: null,
      }] : []),
    ],
  };
}

function operationalSummaryResult(payload = {}) {
  const workforce = {
    historicalRecords: qualityCount(payload.workforce?.historicalRecords),
    activeRecords: qualityCount(payload.workforce?.active ?? payload.workforce?.activeRecords),
    inactiveRecords: qualityCount(payload.workforce?.inactive ?? payload.workforce?.inactiveRecords),
  };
  const data = {
    grain: 'employment_record_by_company_and_legajo',
    workforce,
    absenceEvents: qualityCount(payload.absence?.totalEvents),
    leaveRecords: qualityCount(payload.related?.leaveRecords),
    catalogs: {
      sectors: qualityCount(payload.catalogs?.sectors),
      categories: qualityCount(payload.catalogs?.categories),
      unions: qualityCount(payload.catalogs?.unions),
      agreements: qualityCount(payload.catalogs?.agreements),
    },
    quality: {
      activeWithoutSector: qualityCount(payload.quality?.activeWithoutSector),
      absenceOrphans: qualityCount(payload.quality?.absenceOrphans),
      leaveOrphans: qualityCount(payload.quality?.leaveOrphans),
    },
    definitions: { active: 'proxy_source_without_exit_date', peopleMetricAvailable: false },
  };
  return {
    answer: `El resumen operativo de GRH registra ${formatNumber(workforce.historicalRecords)} legajos por empresa, ${formatNumber(workforce.activeRecords)} activos según el proxy de fecha de egreso vacía y ${formatNumber(workforce.inactiveRecords)} inactivos. También contiene ${formatNumber(data.absenceEvents)} eventos en el registro de ausencias y ${formatNumber(data.leaveRecords)} registros de la fuente histórica legado de licencias. Estos conteos son registros laborales, no personas únicas; los tres bloques no comparten necesariamente una misma fecha de corte.`,
    data,
    targetPath: '/internal-dashboard#inicio',
    relatedSections: relatedSections(['personas', 'estructura', 'ausentismo', 'calidad']),
    asOf: null,
    sources: [
      { system: 'GRH', relation: 'grh_employees', authority: 'labor_source_snapshot', asOf: dateValue(payload.source?.cutoff) },
      { system: 'GRH', relation: 'grh_absences', authority: 'raw_absence_event_register', asOf: null },
      { system: 'GRH', relation: 'grh_leaves', authority: 'historical_legacy_leave_register', asOf: null },
    ],
  };
}

function structureRows(rows, filter, limit = 12) {
  const needle = foldText(filter);
  const matches = (Array.isArray(rows) ? rows : [])
    .filter((row) => !needle || foldText(row?.label).includes(needle));
  return {
    rows: matches.slice(0, limit).map((row) => ({
      label: normalizeText(row?.label, 160) || 'Sin clasificar',
      historical: qualityCount(row?.historical ?? row?.value),
      active: qualityCount(row?.active),
      inactive: qualityCount(row?.inactive),
    })),
    totalMatches: matches.length,
    shown: Math.min(matches.length, limit),
  };
}

function structureAnalysisResult(payload = {}, filters = {}) {
  const coverage = {
    historicalRecords: qualityCount(payload.coverage?.historicalRecords),
    activeRecords: qualityCount(payload.coverage?.activeRecords),
    inactiveRecords: qualityCount(payload.coverage?.inactiveRecords),
    withOrganization: qualityCount(payload.coverage?.withOrganization),
    withSector: qualityCount(payload.coverage?.withSector),
    withRole: qualityCount(payload.coverage?.withRole),
    organizationsObserved: qualityCount(payload.coverage?.organizationsObserved),
    sectorsObserved: qualityCount(payload.coverage?.sectorsObserved),
    rolesObserved: qualityCount(payload.coverage?.rolesObserved),
  };
  const hierarchyAvailable = payload.hierarchy?.available === true;
  const organizations = structureRows(payload.organizations, filters.organization);
  const sectors = structureRows(payload.sectors, filters.sector);
  const roles = structureRows(payload.roles, filters.role);
  const data = {
    grain: 'employment_record_by_company_and_legajo',
    coverage,
    hierarchy: {
      available: hierarchyAvailable,
      catalogRows: qualityCount(payload.hierarchy?.catalogRows),
      roots: hierarchyAvailable ? qualityCount(payload.hierarchy?.roots) : 0,
      parentLinks: hierarchyAvailable ? qualityCount(payload.hierarchy?.parentLinks) : 0,
      unresolvedParentLinks: hierarchyAvailable ? qualityCount(payload.hierarchy?.unresolvedParentLinks) : 0,
      inferred: false,
    },
    organizations: organizations.rows,
    sectors: sectors.rows,
    roles: roles.rows,
    matches: { organizations: { total: organizations.totalMatches, shown: organizations.shown }, sectors: { total: sectors.totalMatches, shown: sectors.shown }, roles: { total: roles.totalMatches, shown: roles.shown } },
    definitions: {
      organization: 'literal_grh_assignment',
      sector: 'current_observed_assignment_at_cutoff',
      role: 'literal_grh_assignment',
      catalogIsNotObservedAssignment: true,
    },
  };
  const selectedFilter = filters.sector || filters.organization || filters.role;
  const selectedMatches = filters.sector ? sectors : filters.organization ? organizations : filters.role ? roles : null;
  return {
    answer: `La estructura GRH cubre globalmente ${formatNumber(coverage.historicalRecords)} legajos por empresa: ${formatNumber(coverage.withOrganization)} con organización literal, ${formatNumber(coverage.withSector)} con sector y ${formatNumber(coverage.withRole)} con cargo.${selectedFilter ? ` El filtro “${selectedFilter}” coincide con ${formatNumber(selectedMatches?.totalMatches)} filas agregadas y se muestran ${formatNumber(selectedMatches?.shown)}.` : ''} ${hierarchyAvailable ? 'La fuente publica vínculos jerárquicos y se muestran sin completar relaciones faltantes.' : 'La fuente no publica vínculos jerárquicos suficientes; no se infiere un organigrama.'}`,
    data,
    targetPath: '/estructura',
    relatedSections: relatedSections(['estructura', 'personas', 'calidad']),
    asOf: dateValue(payload.source?.cutoff),
    sources: [
      { system: 'GRH', relation: 'grh_employees', authority: 'literal_organizational_assignment' },
      { system: 'GRH', relation: 'grh_catalog_rows', authority: 'organizational_catalog' },
    ],
  };
}

function absenceEventListResult(result) {
  const payload = result?.payload || {};
  const cutoff = payload.quality?.sourceCutoff || null;
  const sources = [
    { system: 'GRH', relation: 'grh_absences', authority: 'absence_event_register' },
    { system: 'GRH', relation: 'grh_catalog_rows', authority: 'absence_reason_catalog' },
  ];
  if (result?.status !== 200 || payload.ok !== true) {
    return {
      status: result?.status || 503,
      answer: payload.error || 'No se pudo consultar el registro interno de eventos de ausencia.',
      data: { code: normalizeText(payload.code, 80) || 'ABSENCE_EVENTS_UNAVAILABLE' },
      asOf: dateValue(cutoff),
      sources,
    };
  }
  const rows = (Array.isArray(payload.data) ? payload.data : []).slice(0, 25).map((row) => ({
    contractId: row.contractId ?? null,
    companyId: row.companyId ?? null,
    legajo: row.legajo ?? null,
    name: normalizeText(row.name, 160) || null,
    sector: normalizeText(row.sector, 160) || 'Sin sector informado',
    eventDate: row.eventDate || null,
    untilDate: row.untilDate || null,
    reasonCode: row.reasonCode ?? null,
    reason: normalizeText(row.reason, 160) || 'Sin motivo homologado',
    sourceDeclaredDays: row.sourceDeclaredDays ?? null,
    rangeIntegrity: normalizeText(row.rangeIntegrity, 64),
  }));
  return {
    answer: `El registro interno recuperó ${formatNumber(payload.pagination?.total)} eventos administrativos de ausencia y muestra ${formatNumber(rows.length)} en esta página. La asignación sectorial es la observada al corte actual; DIAS_24 no equivale automáticamente a duración, jornadas perdidas, presentismo ni tasa.`,
    data: {
      rows,
      pagination: payload.pagination,
      range: payload.range,
      filters: payload.meta?.filters || {},
      methodology: {
        grain: 'absence_event',
        containsPersonalIdentifiers: true,
        externalSharingAllowed: false,
        sectorSemantics: normalizeText(payload.meta?.sectorSemantics || payload.quality?.sectorSemantics, 320),
        sourceDeclaredDaysAreDuration: false,
        ratesAvailable: false,
      },
    },
    targetPath: '/ausentismo-control',
    relatedSections: relatedSections(['ausentismo', 'personas', 'calidad']),
    asOf: dateValue(cutoff),
    sources,
  };
}

function qualityIssueListResult(result) {
  const payload = result?.payload || {};
  const sources = [
    { system: 'MUNICONTROL', relation: 'data_quality_issue', authority: 'published_snapshot_quality_register', asOf: null },
  ];
  if (result?.status !== 200 || payload.ok !== true) {
    return {
      status: result?.status || 503,
      answer: payload.error || 'No se pudo consultar la cola interna de calidad.',
      data: { code: normalizeText(payload.code, 80) || 'QUALITY_ISSUES_UNAVAILABLE' },
      asOf: null,
      sources,
    };
  }
  const rows = (Array.isArray(payload.data) ? payload.data : []).slice(0, 25).map((row) => ({
    issueId: safeIdentifier(row.issueId, 80) || null,
    source: normalizeText(row.source, 32),
    entity: normalizeText(row.entity, 128),
    code: normalizeText(row.code, 64),
    severity: normalizeText(row.severity, 16),
    field: normalizeText(row.field, 80) || null,
    resolution: normalizeText(row.resolution, 24),
    detectedAt: dateValue(row.detectedAt),
    resolvedAt: dateValue(row.resolvedAt),
  }));
  return {
    answer: `La cola contiene ${formatNumber(payload.pagination?.total)} hallazgos registrados en snapshots publicados y muestra ${formatNumber(rows.length)} en esta página. Cero hallazgos registrados no demuestra una fuente limpia: puede significar controles no materializados o no evaluados. “Detectado” es una marca operativa del hallazgo, no la fecha de corte de la fuente ni una garantía de vigencia actual.`,
    data: {
      rows,
      pagination: payload.pagination,
      filters: payload.filters || {},
      methodology: {
        grain: 'data_quality_issue_across_published_snapshots',
        externalSharingAllowed: false,
        detectedAtIsSourceCutoff: false,
        currentStateGuaranteed: false,
      },
    },
    targetPath: '/calidad-operativa',
    relatedSections: relatedSections(['calidad', 'integracion']),
    asOf: null,
    sources,
  };
}

function latestPublishedBatches(rows) {
  const selected = new Map();
  for (const row of rows) {
    const source = normalizeText(row?.source, 32) || 'UNKNOWN';
    const current = selected.get(source);
    const rowCutoff = Date.parse(row?.cutoff || '') || 0;
    const currentCutoff = Date.parse(current?.cutoff || '') || 0;
    const rowLoadedAt = Date.parse(row?.loadedAt || '') || 0;
    const currentLoadedAt = Date.parse(current?.loadedAt || '') || 0;
    if (!current || rowCutoff > currentCutoff
        || (rowCutoff === currentCutoff && rowLoadedAt > currentLoadedAt)) {
      selected.set(source, row);
    }
  }
  return [...selected.values()];
}

function importLineageResult(result, filters = {}) {
  const payload = result?.payload || {};
  const sources = [
    { system: 'MUNICONTROL', relation: 'source_import_batch', authority: 'published_snapshot_lineage', asOf: null },
  ];
  if (result?.status !== 200 || payload.ok !== true) {
    return {
      status: result?.status || 503,
      answer: payload.error || 'No se pudo consultar la trazabilidad de importaciones.',
      data: { code: normalizeText(payload.code, 80) || 'IMPORT_LINEAGE_UNAVAILABLE' },
      asOf: null,
      sources,
    };
  }
  let rows = Array.isArray(payload.data) ? payload.data : [];
  if (filters.source) rows = rows.filter((row) => normalizeText(row?.source, 32).toUpperCase() === filters.source);
  if (filters.batch === 'latest_published') rows = latestPublishedBatches(rows);
  const batches = rows.slice(0, 25).map((row) => ({
    source: normalizeText(row.source, 32),
    cutoff: dateValue(row.cutoff),
    loadedAt: dateValue(row.loadedAt),
    validation: normalizeText(row.validation, 32),
    sourceRowCount: row.sourceRowCount === null ? null : qualityCount(row.sourceRowCount),
    sourceRowCountStatus: normalizeText(row.sourceRowCountStatus, 32),
    sha256Prefix: normalizeText(row.sha256Prefix, 12) || null,
    trackedIssues: qualityCount(row.trackedIssues),
    trackedIssuesStatus: normalizeText(row.trackedIssuesStatus, 48),
  }));
  return {
    answer: `La trazabilidad muestra ${formatNumber(batches.length)} snapshots publicados${filters.source ? ` de ${filters.source}` : ''}. Cada lote conserva su propio corte y momento de carga; no se presenta una sincronización en vivo ni se interpreta cero hallazgos como calidad perfecta.`,
    data: {
      batches,
      summary: {
        publishedBatches: batches.length,
        reportedRowCounts: batches.filter((row) => row.sourceRowCountStatus === 'reported').length,
        notReportedRowCounts: batches.filter((row) => row.sourceRowCountStatus === 'not_reported').length,
        scope: 'filtered_rows',
      },
      filters: { source: filters.source || null, batch: filters.batch || null },
      methodology: { grain: 'source_import_batch', liveSynchronization: false, externalSharingAllowed: false },
    },
    targetPath: '/calidad-operativa',
    relatedSections: relatedSections(['calidad', 'integracion', 'reportes']),
    asOf: null,
    sources,
  };
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

function leaveArticleDescriptor(selector) {
  const normalized = normalizeLeaveArticleSelector(selector);
  const number = Number(normalized.match(/^\d+/)?.[0]);
  return normalized ? { selector: normalized, number, bis: /\bbis$/.test(normalized) } : null;
}

function articleExpressionMatches(expression, selector) {
  const requested = leaveArticleDescriptor(selector);
  const text = foldText(expression);
  if (!requested || !text) return false;
  const tokens = [...text.matchAll(/\b(\d{1,3})(?:\.\d+)?(?:\s*(bis))?\b/g)]
    .map((match) => ({ number: Number(match[1]), bis: Boolean(match[2]) }));
  if (requested.bis) {
    return tokens.some((token) => token.number === requested.number && token.bis);
  }
  if (tokens.some((token) => token.number === requested.number && !token.bis)) return true;
  const range = text.match(/\b(\d{1,3})\s+a\s+(\d{1,3})\b/);
  if (range) {
    const first = Number(range[1]);
    const last = Number(range[2]);
    if (requested.number >= Math.min(first, last) && requested.number <= Math.max(first, last)) return true;
  }
  const following = text.match(/\b(\d{1,3})\s+y\s+siguientes\b/);
  return Boolean(following)
    && requested.number >= Number(following[1])
    && requested.number < 65;
}

function leaveProvisionView(value = {}) {
  return {
    id: normalizeText(value.id, 80) || null,
    article: normalizeText(value.article, 80) || null,
    label: normalizeText(value.label, 180) || 'Provision sin etiqueta',
    automation: normalizeText(value.automation, 80) || null,
    unit: normalizeText(value.unit, 80) || null,
    summary: normalizeText(value.summary, 600) || null,
    requiredFacts: (Array.isArray(value.requiredFacts) ? value.requiredFacts : [])
      .map((fact) => normalizeText(fact, 100))
      .filter(Boolean),
  };
}

function leaveRuleView(value = {}) {
  const ruleValue = typeof value.value === 'number'
    ? value.value
    : normalizeText(value.value, 400) || null;
  return {
    id: normalizeText(value.id, 100) || null,
    article: normalizeText(value.article, 80) || null,
    label: normalizeText(value.label, 220) || 'Regla sin etiqueta',
    value: ruleValue,
    status: normalizeText(value.status, 80) || 'not_calculable',
    unit: normalizeText(value.unit, 80) || null,
    manualGate: normalizeText(value.manualGate, 160) || null,
  };
}

function annualTierView(value = {}) {
  return {
    minExclusiveYears: Number.isFinite(Number(value.minExclusiveYears)) ? Number(value.minExclusiveYears) : null,
    maxInclusiveYears: value.maxInclusiveYears === null
      ? null
      : Number.isFinite(Number(value.maxInclusiveYears)) ? Number(value.maxInclusiveYears) : null,
    days: Number.isFinite(Number(value.days)) ? Number(value.days) : null,
    article: normalizeText(value.article, 40) || null,
  };
}

function leaveRuleValueText(rule) {
  if (rule.value === null) return 'sin valor automatico';
  if (typeof rule.value === 'string') return rule.value;
  const units = {
    month: 'meses',
    year: 'año',
    calendar_day: 'dias corridos',
    day_per_year: 'dias por año',
    day_unspecified: 'dias con unidad pendiente de definicion',
    calendar_period: 'periodo calendario',
    minute_per_workday: 'minutos por jornada',
    schedule_dependent: 'unidad dependiente del horario',
  };
  return `${Number(rule.value).toLocaleString('es-AR')} ${units[rule.unit] || rule.unit || 'unidades'}`;
}

function leaveRuleSentence(rule) {
  const gate = rule.manualGate ? `; control manual ${rule.manualGate.replaceAll('_', ' ')}` : '';
  return `${rule.label} (art. ${rule.article || 'sin referencia'}): ${leaveRuleValueText(rule)}; estado ${rule.status}${gate}`;
}

function leaveCatalogSelection(legal, requestedArticles) {
  const provisions = (Array.isArray(legal.provisions) ? legal.provisions : []).map(leaveProvisionView);
  const keyRules = (Array.isArray(legal.keyRules) ? legal.keyRules : []).map(leaveRuleView);
  const annualLeaveTiers = (Array.isArray(legal.annualLeaveTiers) ? legal.annualLeaveTiers : []).map(annualTierView);
  const overview = requestedArticles.length === 0;
  const selectedProvisions = overview
    ? provisions
    : provisions.filter((provision) => requestedArticles.some((article) => articleExpressionMatches(provision.article, article)));
  const selectedRules = overview
    ? keyRules
    : keyRules.filter((rule) => requestedArticles.some((article) => articleExpressionMatches(rule.article, article)));
  const selectedAnnualTiers = overview || requestedArticles.includes('37') ? annualLeaveTiers : [];
  const warnings = [];

  for (const selector of requestedArticles) {
    const requested = leaveArticleDescriptor(selector);
    if (!requested || requested.number < 37 || requested.number > 65) {
      warnings.push(`El articulo ${selector} esta fuera del alcance 37 a 65 interpretado por este contrato.`);
      continue;
    }
    const hasProvision = selectedProvisions.some((provision) => articleExpressionMatches(provision.article, selector));
    const hasRule = selectedRules.some((rule) => articleExpressionMatches(rule.article, selector));
    const hasAnnualTier = selector === '37' && selectedAnnualTiers.length > 0;
    if (selector === '44' && !hasRule) {
      warnings.push('El articulo 44 fue solicitado, pero el catalogo recibido no contiene una regla especifica para ese articulo; no se infiere su texto, vigencia ni efecto.');
    } else if (!hasProvision && !hasRule && !hasAnnualTier) {
      warnings.push(`El catalogo recibido no contiene una provision ni una regla especifica para el articulo ${selector}; no se completa el vacio por inferencia.`);
    } else if (!hasRule && !hasAnnualTier) {
      warnings.push(`El articulo ${selector} solo esta cubierto por una provision general del catalogo; requiere validacion humana y no se calcula automaticamente.`);
    }
  }

  return {
    overview,
    requestedArticles,
    provisions: selectedProvisions,
    keyRules: selectedRules,
    annualLeaveTiers: selectedAnnualTiers,
    warnings: [...new Set(warnings)],
  };
}

function leavePolicyAnswer(selection, legal, readiness, conflictCount) {
  if (selection.overview) {
    const catalogScope = selection.provisions.length || selection.keyRules.length
      ? ` El catalogo recibido expone ${formatNumber(selection.provisions.length)} provisiones y ${formatNumber(selection.keyRules.length)} reglas detalladas${selection.provisions.length ? `, incluyendo ${selection.provisions.map((provision) => provision.label).join(', ')}` : ''}.`
      : '';
    return `El Titulo VI de la Ley 5811 es el regimen base de licencias, pero en Junin debe aplicarse junto con la Ley 5892, la ordenanza vigente, los convenios colectivos y la categoria de revista.${catalogScope} La escala anual de referencia es 14, 21, 28 o 35 dias corridos segun antiguedad al 31 de diciembre; con menos de seis meses exige dias efectivamente trabajados. GRH contiene ${formatNumber(readiness.absences?.sourceRows)} eventos administrativos y ${formatNumber(readiness.reasonCatalog?.rows)} motivos, con ${formatNumber(conflictCount)} mapeos que requieren resolver vigencia, conflicto o norma local. No hay hoy un ledger confiable de saldos ni una fuente actual de fichadas, turnos y feriados: por eso el sistema no calcula horas trabajadas, presentismo ni una licencia aprobada.`;
  }

  const articleLabel = selection.requestedArticles.join(', ');
  const provisionText = selection.provisions.length
    ? ` Provisiones seleccionadas: ${selection.provisions.map((provision) => `${provision.label} (art. ${provision.article}): ${provision.summary || 'sin resumen en el catalogo'}`).join(' ')}`
    : '';
  const ruleText = selection.keyRules.length
    ? ` Reglas seleccionadas: ${selection.keyRules.map(leaveRuleSentence).join('. ')}.`
    : '';
  const tierText = selection.annualLeaveTiers.length
    ? ` Escala del articulo 37: ${selection.annualLeaveTiers.map((tier) => `${tier.days ?? 'sin valor'} dias (${tier.article || 'sin referencia'})`).join(', ')}.`
    : '';
  const exactFive = selection.keyRules.some((rule) => rule.id === 'health-exactly-5')
    ? ' Para una antiguedad exactamente igual a 5 años, el catalogo marca el caso como no calculable por ambiguedad textual: el asistente no elige un tramo.'
    : '';
  const warningText = selection.warnings.length
    ? ` Advertencias: ${selection.warnings.join(' ')}`
    : '';
  const version = normalizeText(legal.version, 100) || 'sin version identificada';
  return `Consulta local del catalogo ${version} para el articulo ${articleLabel}.${provisionText}${ruleText}${tierText}${exactFive}${warningText} La referencia no concede una licencia ni reemplaza la validacion de RRHH y Asesoria Letrada.`;
}

function leavePolicyResult(result, filters = {}) {
  const payload = result?.payload || {};
  const sourceCutoff = payload.meta?.source?.cutoff || null;
  if (result?.status !== 200 || payload.ok !== true) {
    return {
      status: result?.status || 503,
      answer: payload.error || 'No se pudo consultar el catalogo normativo de licencias.',
      data: { code: normalizeText(payload.code, 80) || 'LEAVE_POLICY_UNAVAILABLE' },
      targetPath: '/licencias-control',
      relatedSections: relatedSections(['ausentismo', 'calidad', 'ayuda']),
      asOf: dateValue(sourceCutoff),
      sources: [{ system: 'MUNICONTROL', relation: 'mendoza_title_vi_catalog', authority: 'versioned_legal_catalog' }],
    };
  }
  const legal = payload.data?.legal || {};
  const readiness = payload.data?.readiness || {};
  const mappings = Array.isArray(payload.data?.mappings) ? payload.data.mappings : [];
  const conflicts = mappings.filter((row) => ['configuration_conflict', 'requires_version_check', 'requires_local_rule', 'unmapped'].includes(row?.policy?.status));
  const requestedArticles = (Array.isArray(filters.articles) ? filters.articles : [])
    .map(normalizeLeaveArticleSelector)
    .filter(Boolean)
    .slice(0, 65);
  const selection = leaveCatalogSelection(legal, [...new Set(requestedArticles)]);
  const sources = (Array.isArray(legal.sources) ? legal.sources : []).slice(0, 10).map((source) => ({
    system: normalizeText(source.authority, 120) || 'MENDOZA',
    relation: normalizeText(source.id, 100) || 'legal_instrument',
    authority: normalizeText(source.status, 100) || 'official_source',
    url: normalizeText(source.url, 500) || null,
    asOf: legal.verifiedAt || null,
  }));
  sources.push({ system: 'GRH', relation: 'grh_absences_and_reason_catalog', authority: 'administrative_evidence_only', asOf: sourceCutoff });
  return {
    answer: leavePolicyAnswer(selection, legal, readiness, conflicts.length),
    data: {
      catalogVersion: legal.version || null,
      verifiedAt: legal.verifiedAt || null,
      applicability: legal.applicability || {},
      selection: {
        scope: selection.overview ? 'title_vi_overview' : 'requested_articles',
        requestedArticles: selection.requestedArticles,
        matchedProvisionIds: selection.provisions.map((provision) => provision.id).filter(Boolean),
        matchedRuleIds: selection.keyRules.map((rule) => rule.id).filter(Boolean),
        warnings: selection.warnings,
      },
      provisions: selection.provisions,
      annualLeaveTiers: selection.annualLeaveTiers,
      keyRules: selection.keyRules,
      readiness: {
        employment: readiness.employment || {},
        absences: readiness.absences || {},
        legacyLeaves: readiness.legacyLeaves || {},
        workedHours: readiness.workedHours || { status: 'not_calculable' },
        leaveBalance: readiness.leaveBalance || { status: 'not_calculable' },
        reasonCatalog: readiness.reasonCatalog || {},
      },
      mappingConflicts: conflicts.slice(0, 12).map((row) => ({
        reasonCode: row.reasonCode,
        label: normalizeText(row.label, 160),
        status: normalizeText(row.policy?.status, 80),
        note: normalizeText(row.policy?.note, 260),
      })),
      limits: [
        'La referencia no constituye saldo, concesion, diagnostico ni acto administrativo.',
        'Enfermedad, violencia, ART, incapacidad, tareas riesgosas y conflictos normativos requieren intervencion humana.',
        'La configuracion motause de GRH es evidencia historica y no reemplaza la norma vigente.',
        'El Decreto 727/1993 requiere acreditar adopcion municipal antes de tratarlo como procedimiento obligatorio en Junin.',
      ],
    },
    targetPath: '/licencias-control',
    relatedSections: relatedSections(['ausentismo', 'calidad', 'ayuda']),
    asOf: dateValue(sourceCutoff),
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

function managementNumeric(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function managementDate(value) {
  const text = normalizeText(value, 32);
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function managementMetricView(value = {}) {
  return {
    range: {
      from: managementDate(value?.range?.from),
      to: managementDate(value?.range?.to),
    },
    elapsedDays: qualityCount(value.elapsedDays),
    partial: value.partial === true,
    future: value.future === true,
    hires: qualityCount(value.hires),
    hirePersons: qualityCount(value.hirePersons),
    exits: qualityCount(value.exits),
    exitPersons: qualityCount(value.exitPersons),
    balance: managementNumeric(value.balance, 0),
    absenceEvents: qualityCount(value.absenceEvents),
    affectedContracts: qualityCount(value.affectedContracts),
    sourceDeclaredDays: managementNumeric(value.sourceDeclaredDays, 0),
  };
}

function managementPayrollView(value = {}) {
  return {
    range: {
      from: managementDate(value?.range?.from),
      to: managementDate(value?.range?.to),
    },
    expectedMonths: qualityCount(value.expectedMonths),
    closedMonths: qualityCount(value.closedMonths),
    contractMonths: qualityCount(value.contractMonths),
    averageLiquidated: managementNumeric(value.averageLiquidated, 0),
    totalEvents: qualityCount(value.totalEvents),
    alignedEvents: qualityCount(value.alignedEvents),
    excludedEvents: qualityCount(value.excludedEvents),
    affectedAlignedContracts: qualityCount(value.affectedAlignedContracts),
    eventsPer100ContractMonths: managementNumeric(value.eventsPer100ContractMonths, 0),
  };
}

function assistantBudgetMoney(value) {
  const text = normalizeText(value, 40);
  return /^(?:0|[1-9][0-9]*)\.[0-9]{2}$/.test(text) ? text : null;
}

function budgetApprovedResult(result) {
  const payload = result?.payload || {};
  const cutoff = managementDate(payload.data?.source?.cutoff || payload.meta?.sourceCutoff);
  const sources = [{
    system: 'HCD Junín',
    relation: 'Ordenanza 1021/2025',
    authority: 'approved_municipal_budget',
    asOf: cutoff,
  }];
  if (result?.status !== 200 || payload.ok !== true) {
    return {
      status: result?.status || 503,
      answer: payload.error || 'No se pudo validar la fuente oficial del presupuesto aprobado.',
      data: { code: normalizeText(payload.code, 80) || 'BUDGET_APPROVED_UNAVAILABLE' },
      targetPath: '/presupuesto-control',
      relatedSections: relatedSections(['presupuesto', 'gestiones']),
      asOf: cutoff,
      sources,
    };
  }

  const data = payload.data || {};
  const approved = data.approved || {};
  const expenditures = assistantBudgetMoney(approved.expenditures);
  const resources = assistantBudgetMoney(approved.resources);
  const financing = assistantBudgetMoney(approved.financing);
  const jurisdictions = (Array.isArray(approved.breakdowns?.expenditures) ? approved.breakdowns.expenditures : [])
    .slice(0, 10)
    .map((row) => ({
      code: normalizeText(row?.code, 20),
      label: normalizeText(row?.label, 160),
      amount: assistantBudgetMoney(row?.amount),
    }))
    .filter((row) => row.label && row.amount);
  if (!expenditures || !resources || !financing) {
    return {
      status: 503,
      answer: 'La fuente oficial no entregó importes con el contrato decimal esperado.',
      data: { code: 'BUDGET_APPROVED_INVALID' },
      targetPath: '/presupuesto-control',
      relatedSections: relatedSections(['presupuesto', 'gestiones']),
      asOf: cutoff,
      sources,
    };
  }

  return {
    answer: `La Ordenanza 1021/2025 fija para 2026 un gasto aprobado de ${formatMoney(expenditures)}, con recursos estimados por ${formatMoney(resources)} y financiamiento estimado por ${formatMoney(financing)}. Recursos más financiamiento reconcilian exactamente con el gasto, al igual que las dos jurisdicciones publicadas. Son pesos nominales aprobados: la fuente no contiene modificaciones, compromiso, devengado ni pagado, por lo que no corresponde calcular ejecución, porcentajes ni desvíos.`,
    data: {
      fiscalYear: qualityCount(data.fiscalYear),
      currency: { code: 'ARS', basis: 'nominal' },
      approved: { expenditures, resources, financing, jurisdictions },
      explicitAppropriations: data.approved?.explicitAppropriations || null,
      staffingEstablishment: approved.staffingEstablishment || null,
      execution: {
        available: data.execution?.available === true,
        status: normalizeText(data.execution?.status, 80) || 'source_not_loaded',
      },
      reconciliations: {
        funding: payload.quality?.reconciliations?.resourcesPlusFinancingEqualsExpenditures === true,
        jurisdictions: payload.quality?.reconciliations?.expenseJurisdictionsEqualExpenditures === true,
      },
      source: {
        instrument: normalizeText(data.source?.legalInstrument?.number, 40),
        title: normalizeText(data.source?.title, 240),
        url: /^https:\/\//i.test(String(data.source?.url || '')) ? String(data.source.url) : null,
        pageCount: qualityCount(data.source?.pageCount),
      },
      methodology: {
        grain: normalizeText(payload.meta?.grain, 80),
        executionLoaded: false,
        annexBreakdownAvailable: false,
      },
    },
    targetPath: '/presupuesto-control',
    relatedSections: relatedSections(['presupuesto', 'gestiones']),
    asOf: cutoff,
    sources,
  };
}

function managementComparisonResult(result) {
  const payload = result?.payload || {};
  const sourceCutoff = managementDate(payload.meta?.sourceCutoff);
  const sources = [
    { system: 'GRH', relation: 'employment_contract', authority: 'labor_movement_dates', asOf: sourceCutoff },
    { system: 'GRH', relation: 'payroll_monthly_fact', authority: 'closed_contract_month_denominator', asOf: sourceCutoff },
    { system: 'GRH', relation: 'grh_absences', authority: 'administrative_absence_events', asOf: sourceCutoff },
  ];
  if (result?.status !== 200 || payload.ok !== true) {
    return {
      status: result?.status || 503,
      answer: payload.error || 'No se pudo construir una comparación homogénea entre gestiones.',
      data: { code: normalizeText(payload.code, 80) || 'MANAGEMENT_COMPARISON_UNAVAILABLE' },
      targetPath: '/gestion-comparativa',
      relatedSections: relatedSections(['gestiones', 'reportes']),
      asOf: sourceCutoff,
      sources,
    };
  }

  const previous = managementMetricView(payload.data?.periods?.previousComparable);
  const current = managementMetricView(payload.data?.periods?.current);
  const previousPayroll = managementPayrollView(payload.data?.payrollComparison?.previous);
  const currentPayroll = managementPayrollView(payload.data?.payrollComparison?.current);
  const elapsedDays = qualityCount(payload.data?.comparison?.elapsedDays || current.elapsedDays);
  const managementYears = (Array.isArray(payload.data?.managementYears) ? payload.data.managementYears : [])
    .slice(0, 4)
    .map((row) => ({
      index: qualityCount(row?.index),
      previous: managementMetricView(row?.previous),
      current: row?.current ? managementMetricView(row.current) : null,
      currentStatus: normalizeText(row?.currentStatus, 24) || 'unknown',
      comparableToCurrent: row?.comparableToCurrent === true,
    }));
  const calendarYears = (Array.isArray(payload.data?.calendarYears) ? payload.data.calendarYears : [])
    .slice(0, 12)
    .map((row) => ({ year: qualityCount(row?.year), transition: row?.transition === true, ...managementMetricView(row) }));
  const budget = payload.data?.budget || {};
  const answer = `La comparación homogénea usa ${formatNumber(elapsedDays)} días exactos para cada gestión. En ese tramo, la gestión anterior registra ${formatNumber(previous.hires)} altas, ${formatNumber(previous.exits)} bajas y balance ${formatNumber(previous.balance)}; la gestión actual registra ${formatNumber(current.hires)} altas, ${formatNumber(current.exits)} bajas y balance ${formatNumber(current.balance)}. En meses completos con liquidación cerrada, hay ${formatNumber(previousPayroll.eventsPer100ContractMonths)} frente a ${formatNumber(currentPayroll.eventsPer100ContractMonths)} eventos administrativos por cada 100 contrato-mes. Esta medida no es tasa de ausentismo, presentismo ni jornadas perdidas.${current.partial ? ' La gestión actual permanece parcial al corte.' : ''}`;
  return {
    answer,
    data: {
      periods: { previousComparable: previous, current },
      comparison: {
        basis: 'same_elapsed_days',
        elapsedDays,
        changePercent: {
          hires: managementNumeric(payload.data?.comparison?.changePercent?.hires),
          exits: managementNumeric(payload.data?.comparison?.changePercent?.exits),
          balance: managementNumeric(payload.data?.comparison?.changePercent?.balance),
        },
      },
      managementYears,
      calendarYears,
      payrollComparison: {
        basis: 'same_complete_closed_payroll_months',
        unit: 'events_per_100_closed_payroll_contract_months',
        previous: previousPayroll,
        current: currentPayroll,
        alignedEventChangePercent: managementNumeric(payload.data?.payrollComparison?.alignedEventChangePercent),
        eventsPer100ChangePercent: managementNumeric(payload.data?.payrollComparison?.rateChangePercent),
      },
      budget: {
        available: budget.available === true,
        status: normalizeText(budget.status, 64) || 'source_not_loaded',
        reason: normalizeText(budget.reason, 240) || null,
      },
      methodology: {
        authority: normalizeText(payload.meta?.authority, 32) || 'GRH',
        grain: normalizeText(payload.meta?.grain, 160) || 'employment_contract',
        currentPeriodPartial: payload.meta?.currentPeriodPartial === true,
        absenceMetricSemantics: normalizeText(payload.meta?.absenceMetricSemantics, 320),
        monetaryComparisonAvailable: payload.meta?.monetaryComparisonAvailable === true,
      },
    },
    targetPath: '/gestion-comparativa',
    relatedSections: relatedSections(['gestiones', 'reportes', 'nomina', 'ausentismo']),
    asOf: sourceCutoff,
    sources,
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

function outOfScopeResult() {
  const supportedDomains = [
    'dotación y estructura',
    'personas y legajos autorizados',
    'nómina y presupuesto aprobado',
    'ausentismo y normativa de licencias',
    'calidad, integración y linaje de datos',
    'relojes y marcaciones reportadas',
    'comparación de gestiones',
    'uso y navegación de MuniControl',
  ];
  return {
    answer: 'No puedo responder esa consulta con las fuentes municipales verificadas disponibles. Este asistente no es de propósito general y no completa la respuesta con información de Internet ni con supuestos. Puedo ayudarte con dotación, legajos autorizados, nómina, presupuesto aprobado, ausentismo, licencias, calidad, integración, relojes y marcaciones reportadas, comparaciones de gestión y uso de MuniControl.',
    data: {
      code: 'ASSISTANT_SCOPE_UNSUPPORTED',
      supportedDomains,
      rawQuestionExternalized: false,
    },
    steps: ['Reformulá la consulta dentro de uno de los dominios disponibles.', 'Revisá siempre la fuente, el corte y los límites incluidos en la respuesta.'],
    targetPath: '/centro-ayuda',
    relatedSections: relatedSections(['ayuda', 'asistente']),
    asOf: GUIDANCE_AS_OF,
    sources: guidanceSource('supported_assistant_scope'),
  };
}

function productGuidanceResult(intent, body) {
  if (intent === 'out_of_scope') return outOfScopeResult();
  if (intent === 'section_explanation') return sectionExplanationResult(body);
  if (intent === 'task_guidance') return taskGuidanceResult(body);
  if (intent === 'glossary') return glossaryResult(body);
  return helpNavigationResult(body);
}

function providerFacts(intent, data) {
  if (intent === 'operational_summary') {
    return {
      grain: 'employment_record_by_company_and_legajo',
      workforce: {
        historicalRecords: qualityCount(data?.workforce?.historicalRecords),
        activeRecords: qualityCount(data?.workforce?.activeRecords),
        inactiveRecords: qualityCount(data?.workforce?.inactiveRecords),
      },
      absenceEvents: qualityCount(data?.absenceEvents),
      leaveRecords: qualityCount(data?.leaveRecords),
      catalogCounts: {
        sectors: qualityCount(data?.catalogs?.sectors),
        categories: qualityCount(data?.catalogs?.categories),
        unions: qualityCount(data?.catalogs?.unions),
        agreements: qualityCount(data?.catalogs?.agreements),
      },
      qualityCounts: {
        activeWithoutSector: qualityCount(data?.quality?.activeWithoutSector),
        absenceOrphans: qualityCount(data?.quality?.absenceOrphans),
        leaveOrphans: qualityCount(data?.quality?.leaveOrphans),
      },
      activeDefinition: 'source_proxy_without_exit_date',
      countsAreUniquePeople: false,
      sharedCutoffAvailable: false,
      absenceRegisterRangeValidated: false,
      leaveRegisterIsHistoricalLegacy: true,
    };
  }
  if (intent === 'structure_analysis') {
    const safeRows = (rows) => (Array.isArray(rows) ? rows : [])
      .filter((row) => {
        const historical = qualityCount(row?.historical);
        const active = qualityCount(row?.active);
        const inactive = qualityCount(row?.inactive);
        return historical >= 5
          && [active, inactive].every((value) => value === 0 || value >= 5);
      })
      .slice(0, 5)
      .map((row) => ({
        label: normalizeText(row?.label, 160),
        historicalRecords: qualityCount(row?.historical),
        activeRecords: qualityCount(row?.active),
        inactiveRecords: qualityCount(row?.inactive),
      }));
    return {
      grain: 'employment_record_by_company_and_legajo',
      globalCoverage: {
        historicalRecords: qualityCount(data?.coverage?.historicalRecords),
        activeRecords: qualityCount(data?.coverage?.activeRecords),
        inactiveRecords: qualityCount(data?.coverage?.inactiveRecords),
        withOrganization: qualityCount(data?.coverage?.withOrganization),
        withSector: qualityCount(data?.coverage?.withSector),
        withRole: qualityCount(data?.coverage?.withRole),
        organizationsObserved: qualityCount(data?.coverage?.organizationsObserved),
        sectorsObserved: qualityCount(data?.coverage?.sectorsObserved),
        rolesObserved: qualityCount(data?.coverage?.rolesObserved),
      },
      topOrganizations: safeRows(data?.organizations),
      topSectors: safeRows(data?.sectors),
      topRoles: safeRows(data?.roles),
      hierarchy: data?.hierarchy?.available === true ? {
        available: true,
        roots: qualityCount(data.hierarchy.roots),
        parentLinks: qualityCount(data.hierarchy.parentLinks),
        unresolvedParentLinks: qualityCount(data.hierarchy.unresolvedParentLinks),
        inferred: false,
      } : { available: false, inferred: false },
      definitions: { assignmentsAreLiteral: true, catalogIsNotObservedAssignment: true },
    };
  }
  if (intent === 'workforce_summary') {
    const controlStates = (Array.isArray(data.gapBreakdown) ? data.gapBreakdown : [])
      .filter((row) => qualityCount(row?.records) >= 5)
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
  if (intent === 'management_comparison') {
    const previous = data?.periods?.previousComparable;
    const current = data?.periods?.current;
    const previousPayroll = data?.payrollComparison?.previous;
    const currentPayroll = data?.payrollComparison?.current;
    if (!previous || !current || !previousPayroll || !currentPayroll) return null;
    return {
      grain: 'aggregate_management_window',
      comparisonBasis: 'same_elapsed_days',
      elapsedDays: qualityCount(data?.comparison?.elapsedDays),
      previousManagement: {
        range: aggregateRange(previous.range),
        hires: qualityCount(previous.hires),
        exits: qualityCount(previous.exits),
        balance: managementNumeric(previous.balance, 0),
        absenceEvents: qualityCount(previous.absenceEvents),
        affectedContracts: qualityCount(previous.affectedContracts),
      },
      currentManagement: {
        range: aggregateRange(current.range),
        partial: current.partial === true,
        hires: qualityCount(current.hires),
        exits: qualityCount(current.exits),
        balance: managementNumeric(current.balance, 0),
        absenceEvents: qualityCount(current.absenceEvents),
        affectedContracts: qualityCount(current.affectedContracts),
      },
      closedPayrollExposure: {
        basis: 'same_complete_closed_payroll_months',
        unit: 'administrative_events_per_100_closed_payroll_contract_months',
        previous: {
          closedMonths: qualityCount(previousPayroll.closedMonths),
          contractMonths: qualityCount(previousPayroll.contractMonths),
          alignedEvents: qualityCount(previousPayroll.alignedEvents),
          affectedContracts: qualityCount(previousPayroll.affectedAlignedContracts),
          eventsPer100ContractMonths: managementNumeric(previousPayroll.eventsPer100ContractMonths, 0),
        },
        current: {
          closedMonths: qualityCount(currentPayroll.closedMonths),
          contractMonths: qualityCount(currentPayroll.contractMonths),
          alignedEvents: qualityCount(currentPayroll.alignedEvents),
          affectedContracts: qualityCount(currentPayroll.affectedAlignedContracts),
          eventsPer100ContractMonths: managementNumeric(currentPayroll.eventsPer100ContractMonths, 0),
        },
      },
      constraints: {
        absenceRateAvailable: false,
        presentismAvailable: false,
        workedHoursAvailable: false,
        monetaryComparisonAvailable: data?.methodology?.monetaryComparisonAvailable === true,
        smallSectorBreakdownsShared: false,
      },
    };
  }
  if (intent === 'budget_approved') {
    if (!data?.approved || !data?.reconciliations) return null;
    return {
      fiscalYear: qualityCount(data.fiscalYear),
      currency: 'ARS_nominal',
      approved: {
        expenditures: assistantBudgetMoney(data.approved.expenditures),
        estimatedResources: assistantBudgetMoney(data.approved.resources),
        estimatedFinancing: assistantBudgetMoney(data.approved.financing),
        jurisdictions: (Array.isArray(data.approved.jurisdictions) ? data.approved.jurisdictions : [])
          .slice(0, 5)
          .map((row) => ({ label: normalizeText(row?.label, 160), amount: assistantBudgetMoney(row?.amount) }))
          .filter((row) => row.label && row.amount),
      },
      reconciliations: {
        resourcesPlusFinancingEqualsExpenditures: data.reconciliations.funding === true,
        jurisdictionsEqualExpenditures: data.reconciliations.jurisdictions === true,
      },
      execution: {
        available: data.execution?.available === true,
        status: normalizeText(data.execution?.status, 80) || 'source_not_loaded',
      },
      constraints: {
        executionRateAvailable: false,
        varianceAvailable: false,
        annexBreakdownAvailable: false,
        inflationAdjusted: false,
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

function enabledFlag(value) {
  return String(value ?? '').trim().toLowerCase() === 'true';
}

function durableExternalQuotaConfig(env) {
  return Object.freeze({
    userLimit: boundedInteger(
      env.AI_ASSISTANT_USER_CALLS_PER_WINDOW,
      DEFAULT_AI_USER_CALLS_PER_WINDOW,
      1,
      20,
    ),
    tenantLimit: boundedInteger(
      env.AI_ASSISTANT_TENANT_CALLS_PER_WINDOW,
      DEFAULT_AI_TENANT_CALLS_PER_WINDOW,
      1,
      100,
    ),
    windowSeconds: boundedInteger(
      env.AI_ASSISTANT_QUOTA_WINDOW_SECONDS,
      DEFAULT_AI_DURABLE_WINDOW_SECONDS,
      10,
      3_600,
    ),
    blockSeconds: boundedInteger(
      env.AI_ASSISTANT_QUOTA_BLOCK_SECONDS,
      DEFAULT_AI_DURABLE_BLOCK_SECONDS,
      10,
      3_600,
    ),
  });
}

function durableQuotaBucket(pepper, kind, tenantId, userEmail = '') {
  return createHmac('sha256', pepper)
    .update('municontrol.assistant.external-quota.v1\0', 'utf8')
    .update(kind, 'utf8')
    .update('\0', 'utf8')
    .update(tenantId, 'utf8')
    .update('\0', 'utf8')
    .update(userEmail, 'utf8')
    .digest('hex');
}

function safeQuotaRetryAfter(result) {
  const value = Number(result?.retryAfterSeconds);
  return Number.isFinite(value) ? Math.min(86_400, Math.max(1, Math.ceil(value))) : null;
}

async function consumeDurableExternalQuota({
  access,
  env,
  getIdentitySql,
  takeRateLimit,
}) {
  if (!enabledFlag(env.AI_ASSISTANT_EXTERNAL_ENRICHMENT_ENABLED)) {
    return { allowed: false, status: 'external_enrichment_disabled' };
  }
  if (!enabledFlag(env.AI_ASSISTANT_DURABLE_QUOTA_CERTIFIED)) {
    return { allowed: false, status: 'durable_quota_not_certified' };
  }
  if (access?.mode !== 'managed') {
    return { allowed: false, status: 'managed_identity_required' };
  }

  const tenantId = String(access?.principal?.tenant?.id || '').trim().toLowerCase();
  const userEmail = String(access?.principal?.user?.email || '').trim().toLowerCase();
  const pepper = typeof env.AI_ASSISTANT_QUOTA_PEPPER === 'string'
    ? env.AI_ASSISTANT_QUOTA_PEPPER.trim()
    : '';
  if (!tenantId || !userEmail || Buffer.byteLength(pepper, 'utf8') < MIN_AI_QUOTA_PEPPER_BYTES) {
    return { allowed: false, status: 'durable_quota_not_configured' };
  }

  const config = durableExternalQuotaConfig(env);
  const optionsFor = (limit) => ({
    limit,
    windowSeconds: config.windowSeconds,
    blockSeconds: config.blockSeconds,
  });
  const userBucket = durableQuotaBucket(pepper, 'tenant-user', tenantId, userEmail);
  const tenantBucket = durableQuotaBucket(pepper, 'tenant', tenantId);

  try {
    const sql = await getIdentitySql(env);
    if (!sql || typeof sql.query !== 'function') {
      return { allowed: false, status: 'durable_quota_unavailable' };
    }
    const userResult = await takeRateLimit(
      sql,
      'assistant_external_user',
      userBucket,
      optionsFor(config.userLimit),
    );
    if (userResult?.allowed !== true) {
      return {
        allowed: false,
        status: userResult?.allowed === false
          ? 'durable_user_rate_limited'
          : 'durable_quota_unavailable',
        retryAfterSeconds: safeQuotaRetryAfter(userResult),
        config,
      };
    }

    const tenantResult = await takeRateLimit(
      sql,
      'assistant_external_tenant',
      tenantBucket,
      optionsFor(config.tenantLimit),
    );
    if (tenantResult?.allowed !== true) {
      return {
        allowed: false,
        status: tenantResult?.allowed === false
          ? 'durable_tenant_rate_limited'
          : 'durable_quota_unavailable',
        retryAfterSeconds: safeQuotaRetryAfter(tenantResult),
        config,
      };
    }
    return { allowed: true, config, runtimeBucket: userBucket };
  } catch {
    return { allowed: false, status: 'durable_quota_unavailable', config };
  }
}

function providerStatus(provider, status, extra = {}) {
  const externalProviderAttempted = new Set([
    'used', 'upstream_rate_limited', 'unavailable', 'invalid_response', 'timeout', 'error',
    'invalid_api_key', 'access_denied', 'insufficient_quota', 'incomplete',
    'incomplete_max_output_tokens',
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
    httpStatus: null,
    elapsedMs: null,
    requestId: null,
    errorCode: null,
    externalProviderAttempted,
    externalProviderUsed: status === 'used',
    nominalDataSent: false,
    ...extra,
  };
}

function aggregateInsightTopic(intent) {
  return {
    operational_summary: 'Explicá el resumen operativo agregado de GRH. Los conteos son legajos por empresa, no personas únicas; activo es el proxy de egreso vacío. Los bloques no comparten un corte y ausencias es un total de registro no validado por rango; licencias es una fuente histórica legado.',
    structure_analysis: 'Explicá la cobertura estructural agregada de GRH. Organización, sector y cargo son asignaciones literales; no infieras jerarquías ni organigramas.',
    workforce_summary: 'Explicá el control agregado de dotación y su brecha operativa.',
    payroll_control: 'Explicá el estado agregado de nómina, distinguiendo cerrado publicable de abierto no publicable.',
    integration_quality: 'Explicá la calidad de integración: GRH manda en lo laboral y PERSONAS sólo enriquece identidad y territorio.',
    quality_analysis: 'Explicá los hallazgos agregados de calidad por severidad, dominio, crosswalk y estado de seguimiento. No inventes un score ni una fecha de corte. Controles PERSONAS no materializados significa no evaluado, no calidad perfecta.',
    absence_analysis: 'Explicá los eventos administrativos de ausencia, su comparación homogénea y sus límites metodológicos. No los conviertas en tasa, presentismo, productividad ni jornadas perdidas.',
    management_comparison: 'Explicá la comparación agregada entre gestiones sobre exactamente la misma cantidad de días. Diferenciá altas, bajas, balance y eventos administrativos por 100 contrato-mes con liquidación cerrada. Nunca llames tasa a esa medida, no infieras causas y no extrapoles el período parcial.',
    budget_approved: 'Explicá el presupuesto municipal 2026 aprobado por ordenanza. Diferenciá gasto, recursos y financiamiento; señalá las reconciliaciones exactas. No lo llames ejecución y no calcules porcentajes, desvíos, compromiso, devengado ni pagado porque esas fuentes no están cargadas.',
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
  if (/^gpt-5\.4-mini(?:-|$)/i.test(model)) {
    return OPENAI_REASONING_EFFORTS_54.has(configured)
      ? configured
      : DEFAULT_OPENAI_REASONING_EFFORT;
  }
  if (/^gpt-5-mini(?:-|$)/i.test(model)) {
    return OPENAI_REASONING_EFFORTS_5_MINI.has(configured) ? configured : 'minimal';
  }
  return null;
}

function providerElapsedMs(startedAt, clock) {
  const endedAt = Number(clock());
  return Number.isFinite(startedAt) && Number.isFinite(endedAt)
    ? Math.max(0, Math.round(endedAt - startedAt))
    : 0;
}

function responseHeader(response, name) {
  if (typeof response?.headers?.get === 'function') return response.headers.get(name) || '';
  const headers = response?.headers;
  if (!headers || typeof headers !== 'object') return '';
  const match = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
  return match ? headers[match] : '';
}

function providerRequestId(response) {
  return safeIdentifier(
    responseHeader(response, 'x-request-id')
      || responseHeader(response, 'request-id')
      || responseHeader(response, 'x-amzn-requestid'),
    120,
  ) || null;
}

async function providerErrorCode(response, fallback) {
  try {
    const payload = await response.json();
    const code = safeIdentifier(
      payload?.error?.code
        || payload?.error?.type
        || payload?.code
        || payload?.type,
      80,
    );
    return code || fallback;
  } catch {
    return fallback;
  }
}

function classifyProviderHttpStatus(httpStatus, errorCode) {
  if (httpStatus === 401) return 'invalid_api_key';
  if (httpStatus === 403) return 'access_denied';
  if (httpStatus === 429) {
    return errorCode === 'insufficient_quota' ? 'insufficient_quota' : 'upstream_rate_limited';
  }
  if (httpStatus === 408) return 'timeout';
  if (httpStatus >= 500) return 'unavailable';
  return 'error';
}

function providerHttpErrorFallback(httpStatus) {
  if (httpStatus === 401) return 'invalid_api_key';
  if (httpStatus === 403) return 'access_denied';
  if (httpStatus === 429) return 'rate_limit_exceeded';
  if (httpStatus === 408) return 'request_timeout';
  if (httpStatus >= 500) return 'upstream_unavailable';
  return `http_${httpStatus}`;
}

function providerTransportErrorCode(error) {
  return safeIdentifier(error?.code, 80) || (error?.name === 'AbortError' ? 'request_timeout' : 'transport_error');
}

function huggingFaceOutputText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return normalizeText(content, MAX_PROVIDER_OUTPUT_CHARS);
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const part of content) {
    if (typeof part === 'string') {
      const text = normalizeText(part, MAX_PROVIDER_OUTPUT_CHARS);
      if (text) parts.push(text);
      continue;
    }
    if (!part || typeof part !== 'object') continue;
    const type = normalizeText(part.type, 40).toLowerCase();
    if (type && type !== 'text' && type !== 'output_text') continue;
    const text = normalizeText(
      typeof part.text === 'string' ? part.text : part.text?.value,
      MAX_PROVIDER_OUTPUT_CHARS,
    );
    if (text) parts.push(text);
  }
  return normalizeText(parts.join('\n'), MAX_PROVIDER_OUTPUT_CHARS);
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
  clock,
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Number(clock());
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
    const httpStatus = Number(response.status) || (response.ok ? 200 : null);
    const requestId = providerRequestId(response);
    if (!response.ok) {
      const errorCode = await providerErrorCode(response, providerHttpErrorFallback(httpStatus));
      return providerStatus('openai', classifyProviderHttpStatus(httpStatus, errorCode), {
        model,
        reasoningEffort,
        httpStatus,
        elapsedMs: providerElapsedMs(startedAt, clock),
        requestId,
        errorCode,
      });
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      return providerStatus('openai', 'invalid_response', {
        model,
        reasoningEffort,
        httpStatus,
        elapsedMs: providerElapsedMs(startedAt, clock),
        requestId,
        errorCode: 'invalid_json',
      });
    }
    const usage = openAIUsage(payload);
    if (payload?.status === 'incomplete') {
      const incompleteReason = normalizeText(payload?.incomplete_details?.reason, 80) || 'unknown';
      return providerStatus(
        'openai',
        incompleteReason === 'max_output_tokens' ? 'incomplete_max_output_tokens' : 'incomplete',
        {
          model,
          reasoningEffort,
          usage,
          incompleteReason,
          httpStatus,
          elapsedMs: providerElapsedMs(startedAt, clock),
          requestId,
          errorCode: safeIdentifier(incompleteReason, 80) || 'incomplete',
        },
      );
    }
    const insight = openAIOutputText(payload);
    if (!insight) {
      return providerStatus('openai', 'invalid_response', {
        model,
        reasoningEffort,
        usage,
        httpStatus,
        elapsedMs: providerElapsedMs(startedAt, clock),
        requestId,
        errorCode: 'missing_output_text',
      });
    }
    return providerStatus('openai', 'used', {
      model,
      reasoningEffort,
      insight,
      usage,
      httpStatus,
      elapsedMs: providerElapsedMs(startedAt, clock),
      requestId,
    });
  } catch (error) {
    return providerStatus(
      'openai',
      error?.name === 'AbortError' ? 'timeout' : 'unavailable',
      {
        model,
        reasoningEffort,
        elapsedMs: providerElapsedMs(startedAt, clock),
        errorCode: providerTransportErrorCode(error),
      },
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function requestHuggingFaceInsight({ token, model, topic, serializedFacts, maxTokens, timeoutMs, fetchImpl, clock }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Number(clock());
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
    const httpStatus = Number(response.status) || (response.ok ? 200 : null);
    const requestId = providerRequestId(response);
    if (!response.ok) {
      const errorCode = await providerErrorCode(response, providerHttpErrorFallback(httpStatus));
      return providerStatus('huggingface', classifyProviderHttpStatus(httpStatus, errorCode), {
        model,
        httpStatus,
        elapsedMs: providerElapsedMs(startedAt, clock),
        requestId,
        errorCode,
      });
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      return providerStatus('huggingface', 'invalid_response', {
        model,
        httpStatus,
        elapsedMs: providerElapsedMs(startedAt, clock),
        requestId,
        errorCode: 'invalid_json',
      });
    }
    const finishReason = normalizeText(payload?.choices?.[0]?.finish_reason, 80).toLowerCase();
    if (finishReason === 'length') {
      return providerStatus('huggingface', 'incomplete_max_output_tokens', {
        model,
        httpStatus,
        elapsedMs: providerElapsedMs(startedAt, clock),
        requestId,
        errorCode: 'max_output_tokens',
        incompleteReason: 'max_output_tokens',
      });
    }
    const insight = huggingFaceOutputText(payload);
    if (!insight) {
      return providerStatus('huggingface', 'invalid_response', {
        model,
        httpStatus,
        elapsedMs: providerElapsedMs(startedAt, clock),
        requestId,
        errorCode: 'missing_content',
      });
    }
    return providerStatus('huggingface', 'used', {
      model,
      insight,
      httpStatus,
      elapsedMs: providerElapsedMs(startedAt, clock),
      requestId,
      usage: payload?.usage ? {
        promptTokens: Number(payload.usage.prompt_tokens || 0),
        completionTokens: Number(payload.usage.completion_tokens || 0),
        totalTokens: Number(payload.usage.total_tokens || 0),
      } : null,
    });
  } catch (error) {
    return providerStatus('huggingface', error?.name === 'AbortError' ? 'timeout' : 'unavailable', {
      model,
      elapsedMs: providerElapsedMs(startedAt, clock),
      errorCode: providerTransportErrorCode(error),
    });
  } finally {
    clearTimeout(timeout);
  }
}

function providerAttempt(result) {
  return {
    provider: result.provider,
    status: result.status,
    model: result.model || null,
    httpStatus: result.httpStatus ?? null,
    elapsedMs: result.elapsedMs ?? null,
    requestId: result.requestId || null,
    errorCode: result.errorCode || null,
  };
}

async function generateAggregateInsight({
  intent,
  data,
  access,
  env,
  fetchImpl,
  now,
  quotaStore,
  getIdentitySql,
  takeRateLimit,
}) {
  if (GUIDANCE_INTENTS.has(intent)) return providerStatus('local', 'not_allowed_for_product_guidance');
  if (!EXTERNAL_ALLOWED_INTENTS.has(intent)) return providerStatus('local', 'not_allowed_for_nominal_or_unknown_intent');
  if (intent === 'management_comparison') {
    const cohorts = [
      data?.periods?.previousComparable?.affectedContracts,
      data?.periods?.current?.affectedContracts,
      data?.payrollComparison?.previous?.affectedAlignedContracts,
      data?.payrollComparison?.current?.affectedAlignedContracts,
    ].map(Number);
    if (cohorts.some((value) => !Number.isFinite(value) || value < 5)) {
      return providerStatus('local', 'suppressed_small_cohort', { minimumAffectedContracts: 5 });
    }
  }
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
  if (!openAIToken) return providerStatus('local', 'primary_not_configured');

  const durableQuota = await consumeDurableExternalQuota({
    access,
    env,
    getIdentitySql,
    takeRateLimit,
  });
  if (!durableQuota.allowed) {
    return providerStatus('local', durableQuota.status, {
      durableQuotaRequired: true,
      ...(durableQuota.retryAfterSeconds
        ? { retryAfterSeconds: durableQuota.retryAfterSeconds }
        : {}),
      ...(durableQuota.config ? {
        limits: {
          durableUserCallsPerWindow: durableQuota.config.userLimit,
          durableTenantCallsPerWindow: durableQuota.config.tenantLimit,
          durableWindowSeconds: durableQuota.config.windowSeconds,
          durableBlockSeconds: durableQuota.config.blockSeconds,
        },
      } : {}),
    });
  }

  const quota = consumeRuntimeQuota(durableQuota.runtimeBucket, env, now(), quotaStore);
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
  const totalTimeoutMs = boundedInteger(env.AI_ASSISTANT_TIMEOUT_MS, DEFAULT_AI_TOTAL_TIMEOUT_MS, 2_000, 14_000);
  const openAIRequestedTimeout = boundedInteger(env.OPENAI_ASSISTANT_TIMEOUT_MS, DEFAULT_OPENAI_TIMEOUT_MS, 1_000, 10_000);
  const hfRequestedTimeout = boundedInteger(env.HF_ASSISTANT_TIMEOUT_MS, DEFAULT_HF_TIMEOUT_MS, 1_000, 4_000);
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
    openAITimeoutMs,
    huggingFaceTimeoutMs: hfToken ? hfTimeoutMs : null,
    runtimeCallsPerWindow: quota.limit,
    runtimeWindowSeconds: Math.round(quota.windowMs / 1000),
    durableUserCallsPerWindow: durableQuota.config.userLimit,
    durableTenantCallsPerWindow: durableQuota.config.tenantLimit,
    durableWindowSeconds: durableQuota.config.windowSeconds,
    durableBlockSeconds: durableQuota.config.blockSeconds,
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
      clock: now,
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
      clock: now,
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
      { intent: 'leave_policy', externalEnhancement: false, resource: 'leavenormative' },
      { intent: 'operational_summary', externalEnhancement: true, resource: 'summary' },
      { intent: 'structure_analysis', externalEnhancement: true, resource: 'structure' },
      { intent: 'absence_event_list', externalEnhancement: false, resource: 'absenceevents' },
      { intent: 'quality_issue_list', externalEnhancement: false, resource: 'qualityissues' },
      { intent: 'import_lineage', externalEnhancement: false, resource: 'importlineage' },
      { intent: 'management_comparison', externalEnhancement: true, resource: 'managementanalytics' },
      { intent: 'budget_approved', externalEnhancement: false, resource: 'budgetapproved' },
      { intent: 'attendance_status', externalEnhancement: false, resource: 'attendancereportedinventory' },
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
      fallbackRequiresPrimaryAttempt: true,
      externalEnhancementRequiresManagedIdentity: true,
      durableQuotaRequired: true,
      durableQuotaBuckets: ['tenant_user', 'tenant'],
      durableQuotaCertificationRequired: true,
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
  const requireAccess = dependencies.requireCompatibleInternalAccess
    ?? (dependencies.requireInternalSession
      ? async (req, res) => {
        const session = requireSession(req, res);
        return session ? { mode: 'legacy', session, principal: null } : null;
      }
      : requireCompatibleInternalAccess);
  const loadIntegration = dependencies.integrationQuality ?? integrationQuality;
  const loadPayroll = dependencies.payrollControl ?? payrollControl;
  const loadAbsence = dependencies.absenceAnalytics ?? absenceAnalytics;
  const loadLeaveNormative = dependencies.leaveNormative ?? dependencies.leavenormative ?? internalData.leaveNormative;
  const loadSummary = dependencies.summary ?? internalData.summary;
  const loadStructure = dependencies.structure ?? internalData.structure;
  const loadAbsenceEvents = dependencies.absenceEvents ?? dependencies.absenceevents ?? internalData.absenceEvents;
  const loadQualityIssues = dependencies.qualityIssues ?? dependencies.qualityissues ?? internalData.qualityIssues;
  const loadImportLineage = dependencies.importLineage ?? dependencies.importlineage ?? internalData.importLineage;
  const loadManagement = dependencies.managementAnalytics ?? dependencies.managementanalytics ?? internalData.managementAnalytics;
  const loadBudget = dependencies.budgetApproved ?? dependencies.budgetapproved ?? internalData.budgetApproved;
  const loadAttendanceStatus = dependencies.attendanceStatus
    ?? ((access) => loadGovernedAttendanceStatus(access, env));
  const resolveReason = dependencies.resolveAbsenceReason ?? resolveAbsenceReason;
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
  const getIdentitySqlForQuota = dependencies.getTenantIdentitySql ?? getTenantIdentitySql;
  const takeRateLimitForQuota = dependencies.takeIdentityRateLimit ?? takeIdentityRateLimit;
  const logger = dependencies.logger ?? console;
  const requestIdFactory = dependencies.requestIdFactory ?? randomUUID;

  return async function handler(req, res) {
    const requestId = safeIdentifier(requestIdFactory(), 80) || randomUUID();
    const startedAt = Number(now());
    const resourceStatuses = [];
    let logged = false;
    let observedIntent = 'unclassified';
    res.setHeader('X-Request-Id', requestId);
    const tracked = async (name, task) => {
      try {
        const value = await task();
        const status = Number.isFinite(Number(value?.status))
          ? `http_${Number(value.status)}`
          : normalizeText(value?.status, 40) || (value?.ok === false || value?.payload?.ok === false ? 'error' : 'ok');
        resourceStatuses.push({ name, status });
        return value;
      } catch (error) {
        resourceStatuses.push({ name, status: 'error' });
        throw error;
      }
    };
    const respond = (status, payload, provider = null) => {
      observedIntent = normalizeText(payload?.intent, 40) || observedIntent;
      if (!logged) {
        logged = true;
        const endedAt = Number(now());
        const durationMs = Number.isFinite(startedAt) && Number.isFinite(endedAt)
          ? Math.max(0, endedAt - startedAt)
          : 0;
        try {
          logger.info?.(JSON.stringify({
            event: 'internal_assistant_request', requestId, intent: observedIntent,
            provider: normalizeText(provider?.provider, 32) || 'local',
            providerStatus: normalizeText(provider?.status, 64) || (status >= 400 ? 'request_error' : 'not_started'),
            httpStatus: status,
            durationMs,
            providerTelemetry: {
              httpStatus: Number.isFinite(Number(provider?.httpStatus)) ? Number(provider.httpStatus) : null,
              elapsedMs: Number.isFinite(Number(provider?.elapsedMs)) ? Math.max(0, Math.round(Number(provider.elapsedMs))) : null,
              requestId: safeIdentifier(provider?.requestId, 120) || null,
              errorCode: safeIdentifier(provider?.errorCode, 80) || null,
            },
            providerAttempts: (Array.isArray(provider?.attempts) ? provider.attempts.slice(0, 2) : []).map((attempt) => ({
              provider: normalizeText(attempt?.provider, 32) || 'unknown',
              status: normalizeText(attempt?.status, 64) || 'unknown',
              httpStatus: Number.isFinite(Number(attempt?.httpStatus)) ? Number(attempt.httpStatus) : null,
              elapsedMs: Number.isFinite(Number(attempt?.elapsedMs)) ? Math.max(0, Math.round(Number(attempt.elapsedMs))) : null,
              requestId: safeIdentifier(attempt?.requestId, 120) || null,
              errorCode: safeIdentifier(attempt?.errorCode, 80) || null,
            })),
            resources: resourceStatuses,
          }));
        } catch {
          // Observability must never alter the user response.
        }
      }
      return send(res, status, { ...payload, requestId });
    };
    const method = String(req.method || 'GET').toUpperCase();
    if (!['GET', 'POST'].includes(method)) {
      res.setHeader('Allow', 'GET, POST');
      return respond(405, { ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Método no permitido' });
    }

    const access = await requireAccess(req, res, {
      env,
      requiredCapabilities: [TENANT_DATA_CAPABILITIES.ASSISTANT_USE],
      requireDataPlaneReady: true,
      requireCertifiedDataBinding: true,
      allowLegacy: false,
    });
    if (!access) return;
    if (method === 'GET') return respond(200, capabilitiesPayload(), providerStatus('local', 'capabilities'));

    if (!requestContentType(req).toLowerCase().includes('application/json')) {
      return respond(415, { ok: false, code: 'JSON_REQUIRED', error: 'Se requiere application/json' });
    }

    try {
      const body = await readJsonBody(req);
      if (Object.hasOwn(body, 'message') && typeof body.message !== 'string') {
        return respond(422, { ok: false, code: 'ASSISTANT_MESSAGE_INVALID', error: 'El mensaje debe ser texto.' });
      }
      if (typeof body.message === 'string' && body.message.length > MAX_MESSAGE_LENGTH) {
        return respond(413, {
          ok: false,
          code: 'ASSISTANT_MESSAGE_TOO_LONG',
          error: `El mensaje supera el máximo de ${MAX_MESSAGE_LENGTH} caracteres.`,
        });
      }
      const message = normalizeText(body.message);
      if (!message && !body.intent && !body.search && !body.contractId && !body.legajo && !body.section && !body.task && !body.term) {
        return respond(400, { ok: false, code: 'ASSISTANT_QUERY_REQUIRED', error: 'Escribí una consulta para el asistente' });
      }
      const plan = planAssistantRequest(body);
      const intent = plan.intent;
      observedIntent = intent;
      const intentCapabilities = capabilitiesForAssistantIntent(intent);
      if (!intentCapabilities
          || (access.mode === 'managed'
            && !principalHasCapabilities(access.principal, intentCapabilities))) {
        return respond(403, {
          ok: false,
          intent,
          code: 'IDENTITY_CAPABILITY_REQUIRED',
          error: 'No tenés permisos para consultar ese dominio.',
          privacy: { nominalDataExternalized: false, rawHistoryContentIgnored: true },
        });
      }
      let result;

      if (plan.missingNominalContext) {
        return respond(409, {
          ok: false,
          intent,
          code: 'CONVERSATION_CONTEXT_REQUIRED',
          error: 'Elegí primero un legajo para poder continuar con una consulta nominal.',
          queryPlan: publicQueryPlan(plan),
          privacy: { nominalDataExternalized: false, rawHistoryContentIgnored: true },
        });
      }
      if (plan.rejectedFilters.length > 0) {
        return respond(422, {
          ok: false,
          intent,
          code: 'ASSISTANT_FILTER_UNSUPPORTED',
          error: `La consulta incluye filtros que ${intent} no puede aplicar: ${plan.rejectedFilters.join(', ')}.`,
          queryPlan: publicQueryPlan(plan),
          privacy: { nominalDataExternalized: false, rawHistoryContentIgnored: true },
        });
      }

      if (GUIDANCE_INTENTS.has(intent)) {
        result = productGuidanceResult(intent, body);
        resourceStatuses.push({ name: 'productguidance', status: 'ok' });
      } else if (intent === 'attendance_status') {
        result = attendanceStatusResult(await tracked(
          'attendance_status',
          () => loadAttendanceStatus(access),
        ));
      } else if (intent === 'budget_approved') {
        const fiscalYear = Number(plan.filters.fiscalYear ?? 2026);
        const instrumentNumber = Number(plan.filters.instrumentNumber ?? 1021);
        const instrumentYear = Number(plan.filters.instrumentYear ?? 2025);
        result = plan.filters.fiscalYearInvalid
          ? {
            status: 422,
            answer: 'El ejercicio presupuestario debe indicarse como un año de cuatro dígitos.',
            data: { code: 'BUDGET_FISCAL_YEAR_INVALID', availableFiscalYears: [2026] },
            targetPath: '/presupuesto-control',
            relatedSections: relatedSections(['presupuesto', 'gestiones']),
            asOf: null,
            sources: [],
          }
          : plan.filters.fiscalYearConflict
          ? {
            status: 422,
            answer: 'La consulta contiene dos ejercicios presupuestarios distintos. Indicá uno solo antes de consultar importes.',
            data: { code: 'BUDGET_FISCAL_YEAR_CONFLICT', availableFiscalYears: [2026] },
            targetPath: '/presupuesto-control',
            relatedSections: relatedSections(['presupuesto', 'gestiones']),
            asOf: null,
            sources: [],
          }
          : plan.filters.instrumentReferenceUnparsed
          ? {
            status: 422,
            answer: 'La referencia de ordenanza no se pudo validar con certeza. Indicá el número y el año completos antes de consultar importes.',
            data: { code: 'BUDGET_INSTRUMENT_REFERENCE_UNRECOGNIZED', availableInstrumentReferences: ['1021/2025'] },
            targetPath: '/presupuesto-control',
            relatedSections: relatedSections(['presupuesto', 'gestiones']),
            asOf: null,
            sources: [],
          }
          : plan.filters.budgetScopeUnsupported
          ? {
            status: 422,
            answer: 'La fuente cargada corresponde al presupuesto anual municipal, no a presupuestos de obras, compras, proyectos, contratos, eventos ni ámbitos personales.',
            data: { code: 'BUDGET_SCOPE_UNAVAILABLE', availableScope: 'annual_municipal_approved_budget' },
            targetPath: '/presupuesto-control',
            relatedSections: relatedSections(['presupuesto', 'gestiones']),
            asOf: null,
            sources: [],
          }
          : instrumentNumber !== 1021
          ? {
            status: 422,
            answer: `La fuente cargada es la Ordenanza 1021/2025; la Ordenanza ${instrumentNumber} no corresponde a este presupuesto.`,
            data: { code: 'BUDGET_INSTRUMENT_NUMBER_MISMATCH', requestedInstrumentNumber: instrumentNumber, availableInstrumentNumbers: [1021] },
            targetPath: '/presupuesto-control',
            relatedSections: relatedSections(['presupuesto', 'gestiones']),
            asOf: null,
            sources: [],
          }
          : instrumentYear !== 2025
          ? {
            status: 422,
            answer: `La fuente cargada es la Ordenanza 1021/2025; la referencia 1021/${instrumentYear} no corresponde a este presupuesto.`,
            data: { code: 'BUDGET_INSTRUMENT_YEAR_MISMATCH', requestedInstrumentYear: instrumentYear, availableInstrumentYears: [2025] },
            targetPath: '/presupuesto-control',
            relatedSections: relatedSections(['presupuesto', 'gestiones']),
            asOf: null,
            sources: [],
          }
          : fiscalYear === 2026
          ? budgetApprovedResult(await tracked('budgetapproved', () => loadBudget()))
          : {
            status: 422,
            answer: `La fuente presupuestaria oficial cargada corresponde al ejercicio 2026, no a ${fiscalYear}.`,
            data: { code: 'BUDGET_FISCAL_YEAR_UNAVAILABLE', requestedFiscalYear: fiscalYear, availableFiscalYears: [2026] },
            targetPath: '/presupuesto-control',
            relatedSections: relatedSections(['presupuesto', 'gestiones']),
            asOf: null,
            sources: [],
          };
      } else {
        const sql = await getSql();
        if (plan.filters.reason && !plan.filters.reasonCode
            && ['absence_analysis', 'absence_event_list'].includes(intent)) {
          const resolution = await tracked('absence_reason_catalog', () => resolveReason(sql, plan.filters.reason));
          if (resolution.status !== 'resolved') {
            return respond(409, {
              ok: false,
              intent,
              code: resolution.status === 'ambiguous' ? 'ABSENCE_REASON_AMBIGUOUS' : 'ABSENCE_REASON_NOT_FOUND',
              error: resolution.status === 'ambiguous'
                ? 'El motivo coincide con más de un código. Elegí uno de los códigos disponibles.'
                : 'No se encontró un código homologado para ese motivo.',
              data: { candidates: resolution.candidates || [] },
              queryPlan: publicQueryPlan(plan),
              privacy: { nominalDataExternalized: false, rawHistoryContentIgnored: true },
            });
          }
          plan.filters.reasonCode = resolution.reasonCode;
          delete plan.filters.reason;
          plan.decisions.push('resolved_reason_text_to_homologated_code');
        }
        if (intent === 'workforce_summary') {
          const [integration, scope] = await Promise.all([
            tracked('integrationquality', () => loadIntegration(sql)),
            tracked('canonicalscope', () => loadScope(sql)),
          ]);
          result = workforceResult(integration, scope);
        } else if (intent === 'payroll_control') {
          result = payrollResult(await tracked('payrollcontrol', () => loadPayroll(sql)));
        } else if (intent === 'integration_quality') {
          const [integration, scope] = await Promise.all([
            tracked('integrationquality', () => loadIntegration(sql)),
            tracked('canonicalscope', () => loadScope(sql)),
          ]);
          result = integrationResult(integration, scope);
        } else if (intent === 'quality_analysis') {
          result = qualityAnalysisResult(await tracked('qualityoverview', () => loadQuality(sql)));
        } else if (intent === 'absence_analysis') {
          result = absenceAnalysisResult(await tracked('absenceanalytics', () => loadAbsence(sql, absenceAnalyticsRequest(plan.filters))));
        } else if (intent === 'leave_policy') {
          result = leavePolicyResult(
            await tracked('leavenormative', () => loadLeaveNormative(sql)),
            plan.filters,
          );
        } else if (intent === 'operational_summary') {
          result = operationalSummaryResult(await tracked('summary', () => loadSummary(sql)));
        } else if (intent === 'structure_analysis') {
          result = structureAnalysisResult(await tracked('structure', () => loadStructure(sql)), plan.filters);
        } else if (intent === 'absence_event_list') {
          result = absenceEventListResult(await tracked('absenceevents', () => loadAbsenceEvents(sql, {
            query: {
              from: plan.filters.from || '', to: plan.filters.to || '',
              sector: plan.filters.sector || '', reasonCode: plan.filters.reasonCode || '',
              page: String(plan.filters.page), limit: String(plan.filters.limit),
            },
          })));
        } else if (intent === 'quality_issue_list') {
          result = qualityIssueListResult(await tracked('qualityissues', () => loadQualityIssues(sql, {
            query: {
              source: plan.filters.source || 'all', severity: plan.filters.severity || 'all',
              entity: plan.filters.entity || 'all', code: plan.filters.code || 'all',
              resolution: plan.filters.resolution || 'all', page: String(plan.filters.page),
              limit: String(plan.filters.limit),
            },
          })));
        } else if (intent === 'import_lineage') {
          result = importLineageResult(await tracked('importlineage', () => loadImportLineage(sql)), plan.filters);
        } else if (intent === 'management_comparison') {
          result = managementComparisonResult(await tracked('managementanalytics', () => loadManagement(sql)));
        } else if (intent === 'employee_search') {
          const focus = plan.filters.queryFocus || '';
          const year = plan.filters.queryYear || null;
          const request = {
            query: {
              search: plan.filters.search || '',
              page: String(plan.filters.page),
              limit: String(Math.min(plan.filters.limit, 10)),
              status: normalizeText(body.status, 32) || 'all',
              crosswalk: normalizeText(body.crosswalk, 32) || 'all',
              includeFacets: '0',
            },
          };
          const [directory, scope] = await Promise.all([
            tracked('employees', () => searchEmployees(sql, request)),
            tracked('canonicalscope', () => loadScope(sql)),
          ]);
          result = employeeSearchResult(directory, scope, { focus, year });
        } else if (intent === 'employee_detail') {
          const focus = plan.filters.queryFocus || '';
          const year = plan.filters.queryYear || null;
          const contractId = plan.filters.contractId || '';
          const legajo = plan.filters.legajo || '';
          const companyId = plan.filters.companyId || '';
          if (!contractId && !legajo) {
            return respond(400, {
              ok: false,
              intent,
              code: 'EMPLOYEE_IDENTIFIER_REQUIRED',
              error: 'Indicá contractId o legajo para abrir una ficha; para nombres usá employee_search.',
              queryPlan: publicQueryPlan(plan),
            });
          }
          const [detail, scope] = await Promise.all([
            tracked('employee', () => loadEmployee(sql, { query: { contractId, legajo, companyId, recordYear: year ? String(year) : '' } })),
            tracked('canonicalscope', () => loadScope(sql)),
          ]);
          result = employeeDetailResult(detail, scope, { focus, year });
        } else if (intent === 'executive_analysis') {
          const [integration, payroll, scope, absence, quality] = await Promise.all([
            tracked('integrationquality', () => loadIntegration(sql)),
            tracked('payrollcontrol', () => loadPayroll(sql)),
            tracked('canonicalscope', () => loadScope(sql)),
            Promise.resolve()
              .then(() => tracked('absenceanalytics', () => loadAbsence(sql, absenceAnalyticsRequest(plan.filters))))
              .catch(() => ({
                status: 503,
                payload: { ok: false, code: 'ABSENCE_ANALYTICS_UNAVAILABLE', error: 'No se pudo consultar ausentismo.' },
              })),
            Promise.resolve()
              .then(() => tracked('qualityoverview', () => loadQuality(sql)))
              .catch(() => ({
                status: 503,
                payload: { ok: false, code: 'QUALITY_OVERVIEW_UNAVAILABLE', error: 'No se pudo consultar Calidad Operativa.' },
              })),
          ]);
          result = executiveResult(integration, payroll, scope, absence, quality);
        } else {
          result = productGuidanceResult('out_of_scope', body);
        }
      }

      if (result.status && result.status !== 200) {
        return respond(result.status, {
          ok: false,
          intent,
          answer: result.answer,
          data: result.data,
          steps: result.steps || [],
          targetPath: result.targetPath || null,
          relatedSections: result.relatedSections || [],
          sources: result.sources,
          asOf: result.asOf,
          queryPlan: publicQueryPlan(plan),
          privacy: { nominalDataExternalized: false },
        });
      }

      const provider = body.enhance === true
        ? await generateAggregateInsight({
          intent,
          data: result.data,
          access,
          env,
          fetchImpl,
          now,
          quotaStore,
          getIdentitySql: getIdentitySqlForQuota,
          takeRateLimit: takeRateLimitForQuota,
        })
        : providerStatus('local', 'not_requested');
      const employeeRow = intent === 'employee_detail' ? result.data?.data || {} : {};
      const selectedCompanyId = safeIdentifier(employeeRow.companyId, 32) || plan.filters.companyId || '';
      const selectedLegajo = safeIdentifier(employeeRow.legajo, 64) || plan.filters.legajo || '';
      const selectedContractId = plan.filters.contractId || '';
      const conversationContext = {
        intent,
        domain: plan.domain,
        ...(plan.filters.queryFocus ? { queryFocus: plan.filters.queryFocus } : {}),
        ...(plan.filters.queryYear ? { queryYear: plan.filters.queryYear } : {}),
        ...(intent === 'employee_detail' && selectedCompanyId && selectedLegajo ? {
          selectedEmployee: {
            companyId: selectedCompanyId,
            legajo: selectedLegajo,
            ...(selectedContractId ? { contractId: selectedContractId } : {}),
          },
        } : {}),
        filters: sanitizeConversationFilters(plan.filters),
      };
      return respond(200, {
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
        queryPlan: publicQueryPlan(plan),
        conversationContext,
        privacy: {
          internalSessionRequired: true,
          nominalDataExternalized: false,
          rawUserMessageSentExternally: false,
          nominalQueries: ['employee_search', 'employee_detail', 'absence_event_list'].includes(intent) ? 'local_database_only' : null,
          localOnlyResource: NOMINAL_OR_INTERNAL_ONLY_INTENTS.has(intent),
          guidanceContent: GUIDANCE_INTENTS.has(intent) ? 'verified_product_catalog_only' : null,
        },
        provider,
      }, provider);
    } catch (error) {
      if (error instanceof SyntaxError) {
        return respond(400, { ok: false, code: 'INVALID_JSON', error: 'JSON inválido' });
      }
      if (error instanceof RangeError && error.message === 'request_body_too_large') {
        return respond(413, { ok: false, code: 'BODY_TOO_LARGE', error: 'Solicitud demasiado grande' });
      }
      if (error instanceof TypeError && error.message === 'request_body_invalid') {
        return respond(400, { ok: false, code: 'INVALID_BODY', error: 'El cuerpo debe ser un objeto JSON' });
      }
      return respond(503, {
        ok: false,
        intent: observedIntent,
        code: 'INTERNAL_ASSISTANT_DATA_UNAVAILABLE',
        error: 'No se pudieron consultar los datos internos en este momento.',
      });
    }
  };
}

export default createInternalAssistantHandler();
