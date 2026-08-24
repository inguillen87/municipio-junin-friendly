import { createHash } from 'node:crypto';

import {
  TITLE_VI_CATALOG_VERSION,
  getTitleViCatalog,
  reasonPolicyMapping,
} from '../assets/mendoza-title-vi.js';
import {
  ACTION_CAPABILITIES,
  authorizeAction,
  hasActionCapability,
  isSelfAction,
  tenantActionPrincipalFromFacade,
} from './internal-rbac.js';

const CASE_TYPE = 'leave_request';
const POSTGRES_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RELEASE_SHA_PATTERN = /^[a-f0-9]{40}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const ALLOWED_STATUSES = new Set(['draft', 'submitted', 'approved', 'rejected', 'cancelled']);
const CLOSED_STATUSES = Object.freeze(['rejected', 'cancelled']);
const ACTION_LIST_VIEW_IDS = new Set(['mine', 'area', 'authorized', 'closed']);
const ALLOWED_EVIDENCE = new Set(['pending', 'received', 'verified', 'not_required', 'rejected']);
const ALLOWED_CONFIDENTIALITY = new Set(['standard', 'restricted']);
const ALLOWED_DURATION_UNITS = new Set(['calendar_day', 'minute']);
const ALLOWED_LEAVE_INPUT_FIELDS = new Set([
  'beneficiaryContractId', 'reasonCode', 'policyVersionId', 'policyRuleId',
  'startsOn', 'endsOn', 'durationUnit', 'startsAtLocal', 'endsAtLocal',
  'confidentiality', 'employeeNote',
]);
const MUTATING_COMMANDS = new Set(['create', 'update_draft', 'submit', 'approve', 'reject', 'cancel']);
const C = ACTION_CAPABILITIES;

const ACTION_LIST_VIEW_DEFINITIONS = Object.freeze({
  mine: Object.freeze({ id: 'mine', label: 'Mis solicitudes', basis: 'beneficiary_contract' }),
  area: Object.freeze({ id: 'area', label: 'Mi área', basis: 'active_area_scopes' }),
  authorized: Object.freeze({ id: 'authorized', label: 'Alcance autorizado', basis: 'rbac_read_scope' }),
  closed: Object.freeze({ id: 'closed', label: 'Cerradas', basis: 'terminal_status_rejected_or_cancelled' }),
});

export const ACTION_LIST_CONTRACT = Object.freeze({
  defaultView: 'mine',
  pagination: Object.freeze({ mode: 'page', page: true, cursor: false, maxLimit: 50 }),
  filters: Object.freeze({
    view: Object.freeze({ supported: true }),
    caseType: Object.freeze({ supported: true, values: Object.freeze([CASE_TYPE]) }),
    status: Object.freeze({ supported: true }),
    due: Object.freeze({ supported: false, reason: 'no_authoritative_due_at' }),
    assignee: Object.freeze({ supported: false, reason: 'no_assignment_model' }),
  }),
  fields: Object.freeze({
    dueAt: Object.freeze({ supported: false, reason: 'no_authoritative_due_at' }),
    assignedTo: Object.freeze({ supported: false, reason: 'no_assignment_model' }),
  }),
});

const catalog = getTitleViCatalog();
const KNOWN_POLICY_RULE_IDS = new Set([
  ...catalog.provisions.map((item) => item.id),
  ...catalog.keyRules.map((item) => item.id),
]);
const RESTRICTED_PROVISION_IDS = new Set(['health', 'gender-violence', 'family-protection']);
const STANDARD_PROVISION_IDS = new Set(['annual-ordinary']);
const UNSUPPORTED_REASON_STATUSES = new Set([
  'unmapped', 'not_a_leave', 'not_title_vi_policy', 'separate_regime',
]);
const KEY_RULE_PROVISION = new Map([
  ['annual-window', 'annual-ordinary'],
  ['annual-carryover', 'annual-ordinary'],
  ['health-under-5-no-family', 'health'],
  ['health-under-5-family', 'health'],
  ['health-over-5-no-family', 'health'],
  ['health-over-5-family', 'health'],
  ['health-exactly-5', 'health'],
  ['work-accident-art44-repealed', 'health'],
  ['job-reservation', 'health'],
  ['marriage', 'special'],
  ['bereavement-direct', 'special'],
  ['bereavement-sibling', 'special'],
  ['exam', 'special'],
  ['blood-donation', 'special'],
  ['family-care', 'special'],
  ['training', 'special'],
  ['personal-paid', 'special'],
  ['organ-donation', 'special'],
  ['gender-violence-duration', 'gender-violence'],
  ['unpaid-personal-duration', 'unpaid-personal'],
  ['birth-gestating', 'family-protection'],
  ['birth-non-gestating', 'family-protection'],
  ['lactation', 'family-protection'],
  ['adoption', 'family-protection'],
  ['special-work', 'special'],
  ['tardiness', 'attendance'],
]);

export class ActionCenterError extends Error {
  constructor(code, status = 400, message = 'Solicitud de acción inválida', details = undefined) {
    super(message);
    this.name = 'ActionCenterError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function fail(code, status, message, details) {
  throw new ActionCenterError(code, status, message, details);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function commandHash(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function requiredUuid(value, field, { v4 = false } = {}) {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  const pattern = v4 ? UUID_V4_PATTERN : POSTGRES_UUID_PATTERN;
  if (!pattern.test(text)) fail(`${field.toUpperCase()}_INVALID`, 400, `${field} inválido`);
  return text;
}

export function normalizeIdempotencyKey(value) {
  return requiredUuid(value, 'idempotency_key', { v4: true });
}

function boundedText(value, field, { min = 0, max, nullable = false } = {}) {
  if (value == null && nullable) return null;
  if (typeof value !== 'string') fail(`${field.toUpperCase()}_INVALID`, 422, `${field} debe ser texto`);
  const text = value.trim();
  if (text.length < min || text.length > max) {
    fail(`${field.toUpperCase()}_INVALID`, 422, `${field} debe tener entre ${min} y ${max} caracteres`);
  }
  return text;
}

function boundedCanonicalInteger(value, field, { defaultValue, min, max }) {
  if (value == null || value === '') return defaultValue;
  const text = typeof value === 'number' ? String(value) : String(value).trim();
  if (!/^[1-9]\d*$/.test(text)) {
    fail('ACTION_PAGINATION_INVALID', 400, `${field} debe ser un entero canónico`);
  }
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    fail('ACTION_PAGINATION_INVALID', 400, `${field} fuera de rango`);
  }
  return parsed;
}

function isoDate(value, field) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    fail(`${field.toUpperCase()}_INVALID`, 422, `${field} debe usar YYYY-MM-DD`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    fail(`${field.toUpperCase()}_INVALID`, 422, `${field} no es una fecha válida`);
  }
  return value;
}

function dateDays(from, to) {
  return Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function localMinutes(value, field) {
  if (typeof value !== 'string' || !TIME_PATTERN.test(value)) {
    fail(`${field.toUpperCase()}_INVALID`, 422, `${field} debe usar HH:MM`);
  }
  const [hours, minutes] = value.split(':').map(Number);
  return { text: value, total: (hours * 60) + minutes };
}

function mappedLeaveReason(reasonCode) {
  const mapping = reasonPolicyMapping(reasonCode);
  if (!mapping.provisionId || UNSUPPORTED_REASON_STATUSES.has(mapping.status)) {
    fail('LEAVE_REASON_NOT_SUPPORTED', 422, 'El motivo no tiene un mapeo de licencia operativo verificable');
  }
  return mapping;
}

function policyRuleProvision(policyRuleId) {
  if (!policyRuleId) return null;
  if (catalog.provisions.some((item) => item.id === policyRuleId)) return policyRuleId;
  return KEY_RULE_PROVISION.get(policyRuleId) || null;
}

function restrictedByPolicy(reasonCode, policyRuleId) {
  const mapping = mappedLeaveReason(reasonCode);
  const ruleProvision = policyRuleProvision(policyRuleId);
  if (policyRuleId && ruleProvision !== mapping.provisionId) {
    fail(
      'LEAVE_POLICY_RULE_MISMATCH',
      422,
      'La regla normativa no corresponde al motivo GRH seleccionado',
    );
  }
  if (RESTRICTED_PROVISION_IDS.has(mapping.provisionId)) return true;
  return !(STANDARD_PROVISION_IDS.has(mapping.provisionId) && mapping.status === 'candidate');
}

export function normalizeLeavePayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('LEAVE_PAYLOAD_INVALID', 422, 'payload de licencia inválido');
  }
  const unknownField = Object.keys(input).find((field) => !ALLOWED_LEAVE_INPUT_FIELDS.has(field));
  if (unknownField) {
    fail('LEAVE_PAYLOAD_FIELD_UNKNOWN', 422, `Campo de licencia no permitido: ${unknownField}`);
  }

  const beneficiaryContractId = requiredUuid(input.beneficiaryContractId, 'beneficiary_contract_id');
  const reasonCode = boundedText(input.reasonCode, 'reason_code', { min: 1, max: 32 });
  if (!/^[\p{L}\p{N}._-]+$/u.test(reasonCode)) {
    fail('REASON_CODE_INVALID', 422, 'reasonCode contiene caracteres no permitidos');
  }
  const policyVersionId = boundedText(
    input.policyVersionId ?? TITLE_VI_CATALOG_VERSION,
    'policy_version_id',
    { min: 1, max: 128 },
  );
  if (policyVersionId !== TITLE_VI_CATALOG_VERSION) {
    fail('LEAVE_POLICY_VERSION_UNSUPPORTED', 422, 'La versión normativa no está soportada');
  }
  const policyRuleId = input.policyRuleId == null || input.policyRuleId === ''
    ? null
    : boundedText(input.policyRuleId, 'policy_rule_id', { min: 1, max: 128 });
  if (policyRuleId && !KNOWN_POLICY_RULE_IDS.has(policyRuleId)) {
    fail('LEAVE_POLICY_RULE_UNKNOWN', 422, 'La regla normativa no pertenece al catálogo versionado');
  }

  const startsOn = isoDate(input.startsOn, 'starts_on');
  const endsOn = isoDate(input.endsOn, 'ends_on');
  const span = dateDays(startsOn, endsOn);
  if (span < 0 || span > 366) {
    fail('LEAVE_DATE_RANGE_INVALID', 422, 'El rango debe ser positivo y no superar 367 días corridos');
  }
  const durationUnit = boundedText(input.durationUnit, 'duration_unit', { min: 1, max: 24 });
  if (!ALLOWED_DURATION_UNITS.has(durationUnit)) {
    fail('LEAVE_DURATION_UNIT_INVALID', 422, 'Sólo se admiten días corridos o minutos solicitados');
  }

  const casePayload = {
    reasonCode,
    ...(policyRuleId ? { policyRuleId } : {}),
    startsOn,
    endsOn,
    durationUnit,
  };
  if (durationUnit === 'minute') {
    if (reasonCode !== '13') {
      fail('LEAVE_MINUTE_REASON_INVALID', 422, 'Sólo el motivo habilitado de lactancia admite minutos');
    }
    if (startsOn !== endsOn) {
      fail('LEAVE_MINUTE_RANGE_INVALID', 422, 'Una solicitud por minutos debe comenzar y terminar el mismo día');
    }
    const start = localMinutes(input.startsAtLocal, 'starts_at_local');
    const end = localMinutes(input.endsAtLocal, 'ends_at_local');
    if (end.total <= start.total) {
      fail('LEAVE_MINUTE_RANGE_INVALID', 422, 'La hora final debe ser posterior a la inicial');
    }
    casePayload.startsAtLocal = start.text;
    casePayload.endsAtLocal = end.text;
  } else if (input.startsAtLocal != null || input.endsAtLocal != null) {
    fail('LEAVE_TIME_NOT_ALLOWED', 422, 'Las horas sólo corresponden a solicitudes medidas en minutos');
  }

  const confidentiality = String(input.confidentiality ?? 'standard').trim().toLowerCase();
  if (!ALLOWED_CONFIDENTIALITY.has(confidentiality)) {
    fail('LEAVE_CONFIDENTIALITY_INVALID', 422, 'Nivel de confidencialidad inválido');
  }
  const policyRequiresRestricted = restrictedByPolicy(reasonCode, policyRuleId);
  if (policyRequiresRestricted && confidentiality !== 'restricted') {
    fail('LEAVE_RESTRICTED_REQUIRED', 422, 'Este tipo de caso exige tratamiento restringido');
  }
  const employeeNote = input.employeeNote == null || input.employeeNote === ''
    ? null
    : boundedText(input.employeeNote, 'employee_note', { min: 1, max: 500 });
  if (employeeNote) casePayload.employeeNote = employeeNote;

  return Object.freeze({
    beneficiaryContractId,
    policyVersionId,
    confidentiality,
    casePayload: Object.freeze(casePayload),
  });
}

export function normalizeTransition(command, body = {}) {
  if (!['submit', 'approve', 'reject', 'cancel'].includes(command)) {
    fail('ACTION_COMMAND_INVALID', 400, 'Comando no permitido');
  }
  const expectedVersion = Number(body.expectedVersion);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    fail('ACTION_VERSION_REQUIRED', 428, 'expectedVersion es obligatorio');
  }
  if (command === 'submit') {
    return { expectedVersion, reason: null, evidenceStatus: null, manualValidationConfirmed: false };
  }
  const reason = boundedText(body.reason, `${command}_reason`, { min: 3, max: 1000 });
  let evidenceStatus = null;
  let manualValidationConfirmed = false;
  if (command === 'approve') {
    evidenceStatus = boundedText(body.evidenceStatus, 'evidence_status', { min: 1, max: 24 });
    if (!['verified', 'not_required'].includes(evidenceStatus)) {
      fail('ACTION_MANUAL_VALIDATION_REQUIRED', 422, 'La aprobación exige evidencia verificada o declarada no requerida');
    }
    if (body.manualValidationConfirmed !== true) {
      fail('ACTION_MANUAL_VALIDATION_REQUIRED', 422, 'La aprobación exige confirmación humana explícita');
    }
    manualValidationConfirmed = true;
  } else if (body.evidenceStatus != null) {
    evidenceStatus = boundedText(body.evidenceStatus, 'evidence_status', { min: 1, max: 24 });
    if (!ALLOWED_EVIDENCE.has(evidenceStatus)) {
      fail('EVIDENCE_STATUS_INVALID', 422, 'Estado de evidencia inválido');
    }
  }
  return { expectedVersion, reason, evidenceStatus, manualValidationConfirmed };
}

function rows(result) {
  return Array.isArray(result) ? result : (Array.isArray(result?.rows) ? result.rows : []);
}

async function query(sql, statement, values = []) {
  if (!sql || typeof sql.query !== 'function') throw new TypeError('conexion SQL requerida');
  return rows(await sql.query(statement, values));
}

function durationValue(payload) {
  if (payload.durationUnit === 'calendar_day') return dateDays(payload.startsOn, payload.endsOn) + 1;
  const start = localMinutes(payload.startsAtLocal, 'starts_at_local').total;
  const end = localMinutes(payload.endsAtLocal, 'ends_at_local').total;
  return end - start;
}

export function serializeActionCase(record, principal, accessMode = 'nominal') {
  const payload = record?.payload && typeof record.payload === 'object' ? record.payload : {};
  const limitedForPayroll = accessMode === 'payroll';
  const responsePayload = {
    reasonCode: payload.reasonCode || null,
    policyRuleId: payload.policyRuleId || null,
    startsOn: payload.startsOn || null,
    endsOn: payload.endsOn || null,
    startsAtLocal: payload.startsAtLocal || null,
    endsAtLocal: payload.endsAtLocal || null,
    durationUnit: payload.durationUnit || null,
    durationValue: payload.durationUnit ? durationValue(payload) : null,
    timeZone: 'America/Argentina/Mendoza',
    ...(!limitedForPayroll && payload.employeeNote ? { employeeNote: payload.employeeNote } : {}),
  };
  return {
    id: record.id,
    caseNumber: record.caseNumber,
    caseType: record.caseType,
    ...(!limitedForPayroll ? {
      beneficiaryContractId: record.beneficiaryContractId,
      subject: {
        contractId: record.beneficiaryContractId,
        displayName: record.subjectDisplayName,
        legajo: record.subjectLegajo,
        sector: record.subjectSector,
      },
    } : {}),
    status: record.status,
    confidentiality: record.confidentiality,
    policyVersionId: record.policyVersionId,
    payload: responsePayload,
    evidenceStatus: record.evidenceStatus,
    ...(!limitedForPayroll ? {
      actors: {
        createdBy: record.createdBy,
        submittedBy: record.submittedBy,
        decidedBy: record.decidedBy,
        cancelledBy: record.cancelledBy,
      },
    } : {}),
    timestamps: {
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      submittedAt: record.submittedAt,
      decidedAt: record.decidedAt,
      cancelledAt: record.cancelledAt,
    },
    ...(!limitedForPayroll ? {
      decision: {
        reason: record.decisionReason,
        manualValidationConfirmed: Boolean(record.manualValidationConfirmed),
      },
      cancellationReason: record.cancellationReason,
    } : {}),
    version: Number(record.version),
    payrollImpact: {
      status: record.status === 'approved' ? 'pending_payroll_rules' : 'not_applicable',
      amount: null,
      calculated: false,
    },
    projection: limitedForPayroll ? 'payroll' : 'nominal',
  };
}

export function serializeActionCaseSummary(record, principal, accessMode = null) {
  const payload = record?.payload && typeof record.payload === 'object' ? record.payload : {};
  const limitedForPayroll = accessMode === 'payroll' || record?.nominalProjection === false;
  return {
    id: record.id,
    caseNumber: record.caseNumber,
    caseType: record.caseType,
    ...(!limitedForPayroll ? {
      beneficiaryContractId: record.beneficiaryContractId,
      subject: {
        contractId: record.beneficiaryContractId,
        displayName: record.subjectDisplayName,
        legajo: record.subjectLegajo,
        sector: record.subjectSector,
      },
    } : {}),
    status: record.status,
    confidentiality: record.confidentiality,
    policyVersionId: record.policyVersionId,
    payload: {
      reasonCode: payload.reasonCode || null,
      policyRuleId: payload.policyRuleId || null,
      startsOn: payload.startsOn || null,
      endsOn: payload.endsOn || null,
      startsAtLocal: payload.startsAtLocal || null,
      endsAtLocal: payload.endsAtLocal || null,
      durationUnit: payload.durationUnit || null,
      durationValue: payload.durationUnit ? durationValue(payload) : null,
      timeZone: 'America/Argentina/Mendoza',
    },
    evidenceStatus: record.evidenceStatus,
    updatedAt: record.updatedAt,
    version: Number(record.version),
    payrollImpact: {
      status: record.status === 'approved' ? 'pending_payroll_rules' : 'not_applicable',
      amount: null,
      calculated: false,
    },
    projection: limitedForPayroll ? 'payroll' : 'nominal',
  };
}

function sqlError(error) {
  const text = String(error?.message || '');
  if (text.includes('action_case_leave_active_request_uk')) {
    return new ActionCenterError('ACTION_DUPLICATE_ACTIVE', 409, 'Ya existe una solicitud activa idéntica');
  }
  const definitions = [
    ['ACTION_IDEMPOTENCY_KEY_REUSED', 409, 'La clave de idempotencia ya fue usada con otro comando'],
    ['ACTION_CASE_NOT_FOUND', 404, 'Caso no encontrado'],
    ['ACTION_BENEFICIARY_NOT_ACTIVE', 422, 'El vínculo laboral no está activo'],
    ['ACTION_VERSION_REQUIRED', 428, 'expectedVersion es obligatorio'],
    ['ACTION_VERSION_CONFLICT', 409, 'El caso fue modificado por otra persona'],
    ['ACTION_INVALID_TRANSITION', 409, 'La transición solicitada no está permitida'],
    ['ACTION_CASE_PAYLOAD_LOCKED', 409, 'El contenido no puede modificarse después del envío'],
    ['ACTION_SEPARATION_OF_DUTIES', 409, 'La misma persona no puede solicitar y decidir el caso'],
    ['ACTION_DECISION_REASON_REQUIRED', 422, 'La decisión exige fundamento'],
    ['ACTION_CANCELLATION_REASON_REQUIRED', 422, 'La cancelación exige fundamento'],
    ['ACTION_MANUAL_VALIDATION_REQUIRED', 422, 'La aprobación exige validación humana'],
    ['ACTION_SESSION_BUSY', 409, 'El acceso se está actualizando; reintentá en un momento'],
    ['ACTION_SESSION_INVALID', 401, 'La sesión operativa ya no es válida'],
    ['ACTION_RELEASE_NOT_CERTIFIED', 503, 'La versión desplegada no está certificada para operar'],
    ['ACTION_SOURCE_BINDING_REQUIRED', 503, 'La fuente GRH certificada no está disponible'],
    ['ACTION_TENANT_AUTHORITY_REQUIRED', 403, 'La membresía no tiene autoridad operativa vigente'],
    ['ACTION_TENANT_MEMBERSHIP_REQUIRED', 403, 'La sesión no tiene una membresía municipal activa'],
    ['ACTION_SUBJECT_QUERY_INVALID', 400, 'La búsqueda requiere entre 2 y 50 caracteres'],
    ['ACTION_VIEW_FORBIDDEN', 403, 'Vista no autorizada para la sesión'],
    ['ACTION_VIEW_INVALID', 400, 'Vista inválida'],
    ['ACTION_STATUS_INVALID', 400, 'Estado inválido'],
    ['ACTION_PAGINATION_INVALID', 400, 'Paginación inválida'],
    ['ACTION_ACTOR_INACTIVE', 401, 'La cuenta ya no está activa'],
    ['ACTION_COMMAND_INVALID', 400, 'Comando inválido'],
  ];
  for (const [code, status, message] of definitions) {
    if (text.includes(code)) return new ActionCenterError(code, status, message);
  }
  return error;
}

function normalizeActionSession(session, principal) {
  const id = String(session?.id || '').trim().toLowerCase();
  const email = String(session?.email || '').trim().toLowerCase();
  const version = Number(session?.version);
  const releaseSha = String(session?.releaseSha || '').trim().toLowerCase();
  if (!POSTGRES_UUID_PATTERN.test(id)
      || email !== String(principal?.email || '').trim().toLowerCase()
      || !Number.isSafeInteger(version) || version < 1
      || !RELEASE_SHA_PATTERN.test(releaseSha)) {
    fail('ACTION_SESSION_INVALID', 401, 'La sesión operativa ya no es válida');
  }
  return Object.freeze({ id, email, version, releaseSha });
}

function actionIdentityCoordinates(identityPrincipal) {
  const email = String(identityPrincipal?.user?.email || '').trim().toLowerCase();
  const tenantId = String(identityPrincipal?.tenant?.id || '').trim().toLowerCase();
  const membershipId = String(identityPrincipal?.tenant?.membershipId || '').trim().toLowerCase();
  if (!email || identityPrincipal?.tenant?.source !== 'membership'
      || !POSTGRES_UUID_PATTERN.test(tenantId)
      || !POSTGRES_UUID_PATTERN.test(membershipId)) {
    fail('ACTION_TENANT_MEMBERSHIP_REQUIRED', 403, 'La sesión no tiene una membresía municipal activa');
  }
  return { email, tenantId, membershipId };
}

function identityPrincipalFromActionPrincipal(principal) {
  return {
    user: { email: principal?.email },
    tenant: {
      id: principal?.tenantId,
      membershipId: principal?.membershipId,
      source: 'membership',
    },
  };
}

function facadePrincipal(envelope, identityPrincipal) {
  const principal = tenantActionPrincipalFromFacade(envelope?.principal, identityPrincipal);
  if (!principal) {
    fail('ACTION_TENANT_AUTHORITY_REQUIRED', 403, 'La membresía no tiene autoridad operativa vigente');
  }
  return principal;
}

async function callReadFacade(sql, statement, values) {
  try {
    const result = await query(sql, statement, values);
    const envelope = result[0]?.result;
    if (!envelope || typeof envelope !== 'object') {
      fail('ACTION_CENTER_UNAVAILABLE', 503, 'Centro de acciones temporalmente no disponible');
    }
    return envelope;
  } catch (error) {
    throw sqlError(error);
  }
}

function readFacadeIdentityValues(identityPrincipal, actionSession) {
  const identity = actionIdentityCoordinates(identityPrincipal);
  const session = normalizeActionSession(actionSession, { email: identity.email });
  return { identity, session, values: [
    identity.email, session.id, session.version, session.releaseSha,
    identity.tenantId, identity.membershipId,
  ] };
}

export async function loadTenantActionContext(sql, identityPrincipal, actionSession) {
  const { values } = readFacadeIdentityValues(identityPrincipal, actionSession);
  const envelope = await callReadFacade(sql, `
    SELECT action_center_context_v2(
      $1, $2::uuid, $3, $4, $5::uuid, $6::uuid
    ) AS result
  `, values);
  return facadePrincipal(envelope, identityPrincipal);
}

async function getActionRoutingFacade(sql, principal, caseId, actionSession) {
  const id = requiredUuid(caseId, 'case_id');
  const identityPrincipal = identityPrincipalFromActionPrincipal(principal);
  const { values } = readFacadeIdentityValues(identityPrincipal, actionSession);
  const envelope = await callReadFacade(sql, `
    SELECT action_center_tenant_routing_v2(
      $1, $2::uuid, $3, $4, $5::uuid, $6::uuid, $7::uuid
    ) AS result
  `, [...values, id]);
  facadePrincipal(envelope, identityPrincipal);
  return envelope.routing || null;
}

async function applyCommand(sql, principal, input, actionSession) {
  if (!MUTATING_COMMANDS.has(input.command)) fail('ACTION_COMMAND_INVALID', 400, 'Comando inválido');
  const session = normalizeActionSession(actionSession, principal);
  const request = Object.hasOwn(input, 'hashBasis')
    ? input.hashBasis
    : {
      payload: input.payload || null,
      beneficiaryContractId: input.beneficiaryContractId || null,
      policyVersionId: input.policyVersionId || null,
      confidentiality: input.confidentiality || null,
      reason: input.reason || null,
      evidenceStatus: input.evidenceStatus || null,
      manualValidationConfirmed: Boolean(input.manualValidationConfirmed),
    };
  const hash = commandHash({
    tenantId: principal.tenantId,
    membershipId: principal.membershipId,
    sourceBindingId: principal.sourceBindingId,
    actorSessionId: session.id,
    actorSessionVersion: session.version,
    releaseSha: session.releaseSha,
    caseType: CASE_TYPE,
    command: input.command,
    caseId: input.caseId || null,
    expectedVersion: input.expectedVersion ?? null,
    request,
  });
  try {
    const result = await query(sql, `
      SELECT case_id::text AS "caseId", case_number::text AS "caseNumber",
             current_status AS status, current_version AS version, replayed
      FROM action_center_apply_tenant_command(
        $1, $2::uuid, $3, $4, $5::uuid, $6::uuid, $7, $8, $9::uuid, $10,
        $11::uuid, $12, $13::jsonb, $14::uuid, $15, $16, $17, $18, $19
      )
    `, [
      principal.email,
      session.id,
      session.version,
      session.releaseSha,
      principal.tenantId,
      principal.membershipId,
      CASE_TYPE,
      input.command,
      input.caseId || null,
      input.expectedVersion ?? null,
      input.idempotencyKey,
      hash,
      input.payload ? JSON.stringify(input.payload) : null,
      input.beneficiaryContractId || null,
      input.policyVersionId || null,
      input.confidentiality || null,
      input.reason || null,
      input.evidenceStatus || null,
      Boolean(input.manualValidationConfirmed),
    ]);
    return result[0];
  } catch (error) {
    throw sqlError(error);
  }
}

function notFound() {
  fail('ACTION_CASE_NOT_FOUND', 404, 'Caso no encontrado');
}

function commandReceipt(result) {
  return {
    id: result.caseId,
    caseNumber: result.caseNumber,
    caseType: CASE_TYPE,
    status: result.status,
    version: Number(result.version),
  };
}

export async function createLeaveCase(sql, principal, rawPayload, idempotencyKey, actionSession) {
  const normalized = normalizeLeavePayload(rawPayload);
  const result = await applyCommand(sql, principal, {
    command: 'create',
    hashBasis: { payload: rawPayload },
    idempotencyKey: normalizeIdempotencyKey(idempotencyKey),
    payload: normalized.casePayload,
    beneficiaryContractId: normalized.beneficiaryContractId,
    policyVersionId: normalized.policyVersionId,
    confidentiality: normalized.confidentiality,
  }, actionSession);
  return { data: commandReceipt(result), replayed: Boolean(result.replayed) };
}

export async function updateLeaveDraft(sql, principal, caseId, rawPayload, expectedVersion, idempotencyKey, actionSession) {
  const current = await getActionRoutingFacade(sql, principal, caseId, actionSession);
  if (!current) notFound();
  const normalized = normalizeLeavePayload({
    ...rawPayload,
    beneficiaryContractId: current.beneficiaryContractId,
    policyVersionId: rawPayload?.policyVersionId ?? current.policyVersionId,
    confidentiality: rawPayload?.confidentiality ?? current.confidentiality,
  });
  const version = Number(expectedVersion);
  if (!Number.isSafeInteger(version) || version < 1) {
    fail('ACTION_VERSION_REQUIRED', 428, 'expectedVersion es obligatorio');
  }
  const result = await applyCommand(sql, principal, {
    command: 'update_draft', caseId: current.id, expectedVersion: version,
    hashBasis: { payload: rawPayload },
    idempotencyKey: normalizeIdempotencyKey(idempotencyKey),
    payload: normalized.casePayload,
    policyVersionId: normalized.policyVersionId,
    confidentiality: normalized.confidentiality,
  }, actionSession);
  return { data: commandReceipt(result), replayed: Boolean(result.replayed) };
}

export async function transitionLeaveCase(sql, principal, command, caseId, body, idempotencyKey, actionSession) {
  requiredUuid(caseId, 'case_id');
  const transition = normalizeTransition(command, body);
  const result = await applyCommand(sql, principal, {
    command,
    caseId,
    expectedVersion: transition.expectedVersion,
    idempotencyKey: normalizeIdempotencyKey(idempotencyKey),
    reason: transition.reason,
    evidenceStatus: transition.evidenceStatus,
    manualValidationConfirmed: transition.manualValidationConfirmed,
  }, actionSession);
  return { data: commandReceipt(result), replayed: Boolean(result.replayed) };
}

function validAreaScopes(principal, capability = C.AREA_READ) {
  if (!hasActionCapability(principal, capability) || !Array.isArray(principal?.areaScopes)) return [];
  return principal.areaScopes.filter((scope) => (
    scope?.capabilityKey === capability
    && Number(scope.companyId) === Number(principal.sourceCompanyId)
    && (scope?.scopeLevel === 'company'
    || (scope?.scopeLevel === 'organization' && Boolean(scope.organizationUnitSourceId))
    || (scope?.scopeLevel === 'sector'
      && Boolean(scope.organizationUnitSourceId)
      && Boolean(scope.sectorSourceId)))
  ));
}

function canUseAuthorizedView(principal) {
  return hasActionCapability(principal, C.ALL_MANAGE)
    || hasActionCapability(principal, C.ALL_READ)
    || hasActionCapability(principal, C.PAYROLL_READ);
}

function canUseClosedView(principal) {
  return Boolean(principal?.employmentContractId && hasActionCapability(principal, C.SELF_READ))
    || validAreaScopes(principal).length > 0
    || hasActionCapability(principal, C.ALL_MANAGE)
    || hasActionCapability(principal, C.ALL_READ);
}

export function actionDefaultViewForPrincipal(principal) {
  if (principal?.employmentContractId && hasActionCapability(principal, C.SELF_READ)) return 'mine';
  if (canUseAuthorizedView(principal)) return 'authorized';
  if (validAreaScopes(principal).length > 0) return 'area';
  return 'mine';
}

export function actionListCapabilitiesForPrincipal(principal) {
  const views = [];
  if (principal?.employmentContractId && hasActionCapability(principal, C.SELF_READ)) {
    views.push(ACTION_LIST_VIEW_DEFINITIONS.mine);
  }
  if (validAreaScopes(principal).length > 0) views.push(ACTION_LIST_VIEW_DEFINITIONS.area);
  if (canUseAuthorizedView(principal)) views.push(ACTION_LIST_VIEW_DEFINITIONS.authorized);
  if (canUseClosedView(principal)) views.push(ACTION_LIST_VIEW_DEFINITIONS.closed);
  if (!views.length) views.push(ACTION_LIST_VIEW_DEFINITIONS.mine);
  const defaultView = actionDefaultViewForPrincipal(principal);
  return {
    ...ACTION_LIST_CONTRACT,
    defaultView: views.some((view) => view.id === defaultView) ? defaultView : views[0].id,
    views,
  };
}

function actionListFacets(principal, { view = 'mine', caseType = CASE_TYPE, status = null } = {}) {
  return {
    view: {
      selected: view,
      available: actionListCapabilitiesForPrincipal(principal).views,
    },
    caseType: { selected: caseType, available: [CASE_TYPE] },
    status: {
      selected: status,
      available: view === 'closed' ? [...CLOSED_STATUSES] : [...ALLOWED_STATUSES],
    },
    due: { supported: false, selected: null, available: [], reason: 'no_authoritative_due_at' },
    assignee: { supported: false, selected: null, available: [], reason: 'no_assignment_model' },
  };
}

export async function listLeaveCases(sql, identityPrincipal, options = {}, actionSession) {
  const page = boundedCanonicalInteger(options.page, 'page', { defaultValue: 1, min: 1, max: 200 });
  const limit = boundedCanonicalInteger(options.limit, 'limit', { defaultValue: 20, min: 1, max: 50 });
  const view = String(options.view ?? 'mine').trim().toLowerCase();
  const caseType = String(options.caseType ?? CASE_TYPE).trim().toLowerCase();
  const status = options.status == null || options.status === '' ? null : String(options.status).toLowerCase();
  const due = options.due == null ? '' : String(options.due).trim();
  const cursor = options.cursor == null ? '' : String(options.cursor).trim();
  if (!ACTION_LIST_VIEW_IDS.has(view)) fail('ACTION_VIEW_INVALID', 400, 'Vista inválida');
  if (caseType !== CASE_TYPE) fail('ACTION_CASE_TYPE_INVALID', 400, 'caseType no soportado');
  if (status && !ALLOWED_STATUSES.has(status)) fail('ACTION_STATUS_INVALID', 400, 'Estado inválido');
  if (due) fail('ACTION_DUE_FILTER_UNSUPPORTED', 400, 'No existe un vencimiento autoritativo para filtrar');
  if (cursor) fail('ACTION_CURSOR_UNSUPPORTED', 400, 'La paginación disponible usa page y limit');
  const { values } = readFacadeIdentityValues(identityPrincipal, actionSession);
  const envelope = await callReadFacade(sql, `
    SELECT action_center_tenant_list_v2(
      $1, $2::uuid, $3, $4, $5::uuid, $6::uuid,
      $7, $8, $9, $10, $11
    ) AS result
  `, [...values, caseType, view, status, page, limit]);
  const principal = facadePrincipal(envelope, identityPrincipal);
  const records = Array.isArray(envelope.records) ? envelope.records : [];
  const total = Number(envelope.total || 0);
  return {
    principal,
    data: records.map((record) => serializeActionCaseSummary(
      record,
      principal,
      record.projection === 'payroll' ? 'payroll' : 'nominal',
    )),
    pagination: { mode: 'page', page, limit, total, pages: Math.ceil(total / limit) },
    capabilities: actionListCapabilitiesForPrincipal(principal),
    facets: actionListFacets(principal, { view, caseType, status }),
  };
}

function violatesSeparationOfDuties(principal, record) {
  const actorEmail = String(principal?.email || '').toLowerCase();
  return isSelfAction(principal, record)
    || actorEmail === String(record?.createdBy || '').toLowerCase()
    || actorEmail === String(record?.submittedBy || '').toLowerCase();
}

export function allowedCommandsForCase(principal, record) {
  const candidates = ['update_draft', 'submit', 'approve', 'reject', 'cancel'];
  return candidates.filter((command) => {
    const requiresActorEmployment = ['approve', 'reject'].includes(command)
      || (command === 'cancel' && record?.status === 'approved');
    if (requiresActorEmployment && !principal?.employmentContractId) return false;
    if (['approve', 'reject'].includes(command) && violatesSeparationOfDuties(principal, record)) {
      return false;
    }
    return authorizeAction(principal, command, record);
  });
}

function serializeFacadeTimeline(events) {
  return (Array.isArray(events) ? events : []).map((event) => ({
    id: event.id,
    caseVersion: Number(event.caseVersion),
    eventType: event.eventType,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    actor: { email: event.actorEmail, role: event.actorRole },
    metadata: event.metadata && typeof event.metadata === 'object' ? event.metadata : {},
    occurredAt: event.occurredAt,
  }));
}

export async function readLeaveCase(sql, identityPrincipal, caseId, actionSession) {
  const id = requiredUuid(caseId, 'case_id');
  const { values } = readFacadeIdentityValues(identityPrincipal, actionSession);
  const envelope = await callReadFacade(sql, `
    SELECT action_center_tenant_detail_v2(
      $1, $2::uuid, $3, $4, $5::uuid, $6::uuid, $7::uuid
    ) AS result
  `, [...values, id]);
  const principal = facadePrincipal(envelope, identityPrincipal);
  const record = envelope.record;
  if (!record || typeof record !== 'object') notFound();
  const accessMode = record.projection === 'payroll' ? 'payroll' : 'nominal';
  if (accessMode === 'payroll') {
    return {
      principal,
      data: { ...serializeActionCase(record, principal, 'payroll'), projection: 'payroll' },
      timeline: [],
      allowedCommands: [],
    };
  }
  return {
    principal,
    data: { ...serializeActionCase(record, principal), projection: 'nominal' },
    timeline: serializeFacadeTimeline(envelope.timeline),
    allowedCommands: Array.isArray(envelope.allowedCommands)
      ? envelope.allowedCommands.filter((command) => MUTATING_COMMANDS.has(command) && command !== 'create')
      : [],
  };
}

function reasonOption(row) {
  const reasonCode = String(row.sourceKey || '').trim();
  let mapping;
  try {
    mapping = mappedLeaveReason(reasonCode);
  } catch (error) {
    if (error instanceof ActionCenterError && error.code === 'LEAVE_REASON_NOT_SUPPORTED') return null;
    throw error;
  }
  const confidentiality = restrictedByPolicy(reasonCode, mapping.provisionId)
    ? 'restricted'
    : 'standard';
  return {
    reasonCode,
    label: String(row.label || `Motivo ${reasonCode}`).trim(),
    policyVersionId: TITLE_VI_CATALOG_VERSION,
    policyRuleId: mapping.provisionId,
    supportsMinutes: reasonCode === '13',
    confidentiality,
    note: mapping.note,
  };
}

function actionBootstrapOptions(principal, {
  subjects = [], reasons = [], subjectsTruncated = false,
} = {}) {
  const listCapabilities = actionListCapabilitiesForPrincipal(principal);
  return {
    subjects,
    reasons,
    subjectsTruncated,
    views: listCapabilities.views,
    defaultView: listCapabilities.defaultView,
    caseTypes: [{ value: CASE_TYPE, label: 'Solicitud de licencia' }],
    statuses: [...ALLOWED_STATUSES],
    listCapabilities,
    facets: actionListFacets(principal, { view: listCapabilities.defaultView }),
  };
}

export async function getActionBootstrap(sql, identityPrincipal, actionSession, subjectQuery = '') {
  const normalizedQuery = String(subjectQuery || '').trim();
  if (normalizedQuery && (normalizedQuery.length < 2 || normalizedQuery.length > 50)) {
    fail('ACTION_SUBJECT_QUERY_INVALID', 400, 'La búsqueda requiere entre 2 y 50 caracteres');
  }
  const { values } = readFacadeIdentityValues(identityPrincipal, actionSession);
  const envelope = await callReadFacade(sql, `
    SELECT action_center_tenant_bootstrap_v2(
      $1, $2::uuid, $3, $4, $5::uuid, $6::uuid, $7
    ) AS result
  `, [...values, normalizedQuery || null]);
  const principal = facadePrincipal(envelope, identityPrincipal);
  const subjects = (Array.isArray(envelope.subjects) ? envelope.subjects : []).flatMap((subject) => {
    const allowedConfidentialities = Array.isArray(subject?.allowedConfidentialities)
      ? subject.allowedConfidentialities.filter((value) => ALLOWED_CONFIDENTIALITY.has(value))
      : [];
    if (!subject?.contractId || !allowedConfidentialities.length) return [];
    return [{
      contractId: subject.contractId,
      displayName: String(subject.displayName || 'Nombre no informado'),
      legajo: String(subject.legajo || ''),
      sector: String(subject.sector || 'Sector no informado'),
      allowedConfidentialities,
      accessBasis: subject.accessBasis === 'self' ? 'self' : 'authorized_scope',
    }];
  });
  const supportedConfidentialities = new Set(subjects.flatMap((subject) => subject.allowedConfidentialities));
  const reasons = (Array.isArray(envelope.reasonRows) ? envelope.reasonRows : [])
    .map(reasonOption)
    .filter((reason) => reason && supportedConfidentialities.has(reason.confidentiality));

  return {
    principal,
    contract: ACTION_CENTER_CONTRACT,
    source: envelope.source || { label: 'GRH canónica', cutoff: null, version: 'sin snapshot publicado' },
    options: actionBootstrapOptions(principal, {
      subjects,
      reasons,
      subjectsTruncated: Boolean(envelope.subjectsTruncated),
    }),
  };
}

export const ACTION_CENTER_CONTRACT = Object.freeze({
  caseTypes: Object.freeze([CASE_TYPE]),
  list: ACTION_LIST_CONTRACT,
  leavePolicyVersionId: TITLE_VI_CATALOG_VERSION,
  statuses: Object.freeze([...ALLOWED_STATUSES]),
  transitions: Object.freeze({
    draft: Object.freeze(['submitted', 'cancelled']),
    submitted: Object.freeze(['approved', 'rejected', 'cancelled']),
    approved: Object.freeze(['cancelled']),
    rejected: Object.freeze([]),
    cancelled: Object.freeze([]),
  }),
  automaticApproval: false,
  approvalEvidenceByConfidentiality: Object.freeze({
    standard: Object.freeze(['verified', 'not_required']),
    restricted: Object.freeze(['verified']),
  }),
  payrollCalculation: false,
  productionGates: Object.freeze({
    approvalRequiresActiveActorEmploymentLink: true,
    runtimeDatabaseRole: 'ACTIONS_DATABASE_URL_with_separate_non_owner_role_required',
    roleAndScopeGrantAudit: 'append_only_governance_required_before_non_admin_activation',
  }),
});
