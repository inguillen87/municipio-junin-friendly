import {
  ActionCenterError,
  commandHash,
  normalizeIdempotencyKey,
} from './internal-leave-workflow.js';
import { tenantActionPrincipalFromFacade } from './internal-rbac.js';

export const OVERTIME_CASE_TYPE = 'overtime_entry';
export const OVERTIME_POLICY_VERSION = 'junin-mayor-esfuerzo-intake.v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[a-f0-9]{40}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CODE = /^[a-z][a-z0-9_]{2,63}$/;
const STATUSES = new Set(['draft', 'submitted', 'pending_time_rules', 'rejected', 'cancelled']);
const DECISION_CODES = Object.freeze({
  approve: new Set(['validated_documentation']),
  reject: new Set(['insufficient_evidence', 'entered_in_error', 'duplicate']),
  cancel: new Set(['entered_in_error', 'duplicate']),
});

export const OVERTIME_ACTION_CONTRACT = Object.freeze({
  caseType: OVERTIME_CASE_TYPE,
  policyVersionId: OVERTIME_POLICY_VERSION,
  confidentiality: 'restricted',
  statuses: Object.freeze([...STATUSES]),
  transitions: Object.freeze({
    draft: Object.freeze(['submitted', 'cancelled']),
    submitted: Object.freeze(['pending_time_rules', 'rejected', 'cancelled']),
    pending_time_rules: Object.freeze([]),
    rejected: Object.freeze([]),
    cancelled: Object.freeze([]),
  }),
  declaredMinutes: Object.freeze({ min: 1, max: 1440 }),
  calculated: false,
  posted: false,
  payrollMutation: false,
});

function fail(code, status, message) {
  throw new ActionCenterError(code, status, message);
}

function exactObject(value, allowed, code = 'ACTION_COMMAND_INVALID') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(code, 400, 'El comando debe ser un objeto JSON exacto');
  }
  const extra = Object.keys(value).find((key) => !allowed.has(key));
  if (extra) fail(code, 400, `Campo no permitido: ${extra}`);
}

function requiredUuid(value, field) {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!UUID.test(text)) fail(`${field.toUpperCase()}_INVALID`, 400, `${field} inválido`);
  return text;
}

function validDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function exactVersion(value) {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1) {
    fail('ACTION_VERSION_REQUIRED', 428, 'expectedVersion es obligatorio');
  }
  return version;
}

function canonicalPage(value, field, fallback, max) {
  if (value == null || value === '') return fallback;
  const text = typeof value === 'number' ? String(value) : String(value).trim();
  if (!/^[1-9]\d*$/.test(text)) fail('ACTION_PAGINATION_INVALID', 400, 'Paginación inválida');
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed > max) {
    fail('ACTION_PAGINATION_INVALID', 400, `${field} fuera de rango`);
  }
  return parsed;
}

export function normalizeOvertimePayload(input, { create = false } = {}) {
  const allowed = new Set([
    'workDate', 'declaredMinutes', 'reasonCode', 'policyVersionId',
    ...(create ? ['beneficiaryContractId'] : []),
  ]);
  exactObject(input, allowed, 'OVERTIME_PAYLOAD_INVALID');
  const beneficiaryContractId = create
    ? requiredUuid(input.beneficiaryContractId, 'beneficiary_contract_id')
    : null;
  if (!validDate(input.workDate)) {
    fail('OVERTIME_WORK_DATE_INVALID', 422, 'workDate debe ser una fecha YYYY-MM-DD válida');
  }
  if (!Number.isSafeInteger(input.declaredMinutes)
      || input.declaredMinutes < 1 || input.declaredMinutes > 1440) {
    fail('OVERTIME_MINUTES_INVALID', 422, 'declaredMinutes debe ser un entero entre 1 y 1440');
  }
  const reasonCode = typeof input.reasonCode === 'string' ? input.reasonCode.trim() : '';
  if (!CODE.test(reasonCode)) fail('OVERTIME_REASON_INVALID', 422, 'reasonCode inválido');
  const policyVersionId = input.policyVersionId ?? OVERTIME_POLICY_VERSION;
  if (policyVersionId !== OVERTIME_POLICY_VERSION) {
    fail('OVERTIME_POLICY_VERSION_UNSUPPORTED', 422, 'La política de ingreso no está soportada');
  }
  return Object.freeze({
    beneficiaryContractId,
    policyVersionId,
    casePayload: Object.freeze({
      workDate: input.workDate,
      declaredMinutes: input.declaredMinutes,
      reasonCode,
    }),
  });
}

export function normalizeOvertimeTransition(command, body) {
  const base = new Set(['caseType', 'command', 'caseId', 'expectedVersion']);
  if (command === 'submit') exactObject(body, base);
  else if (command === 'approve') {
    exactObject(body, new Set([...base, 'decisionReasonCode', 'evidenceStatus', 'manualValidationConfirmed']));
  } else if (command === 'reject' || command === 'cancel') {
    exactObject(body, new Set([...base, 'decisionReasonCode']));
  } else fail('ACTION_COMMAND_INVALID', 400, 'Comando no permitido');

  const expectedVersion = exactVersion(body.expectedVersion);
  if (command === 'submit') {
    return { expectedVersion, decisionReasonCode: null, evidenceStatus: null, manualValidationConfirmed: false };
  }
  const decisionReasonCode = typeof body.decisionReasonCode === 'string'
    ? body.decisionReasonCode.trim() : '';
  if (!DECISION_CODES[command].has(decisionReasonCode)) {
    fail('ACTION_DECISION_REASON_REQUIRED', 422, 'Código de decisión no permitido');
  }
  if (command === 'approve'
      && (body.evidenceStatus !== 'verified' || body.manualValidationConfirmed !== true)) {
    fail('ACTION_MANUAL_VALIDATION_REQUIRED', 422, 'La validación exige evidencia verificada y confirmación humana');
  }
  return {
    expectedVersion,
    decisionReasonCode,
    evidenceStatus: command === 'approve' ? 'verified' : null,
    manualValidationConfirmed: command === 'approve',
  };
}

function rows(result) {
  return Array.isArray(result) ? result : (Array.isArray(result?.rows) ? result.rows : []);
}

async function query(sql, statement, values) {
  if (!sql || typeof sql.query !== 'function') throw new TypeError('conexion SQL requerida');
  return rows(await sql.query(statement, values));
}

function sqlError(error) {
  const text = String(error?.message || '');
  if (text.includes('action_case_overtime_active_entry_uk')) {
    return new ActionCenterError('OVERTIME_DUPLICATE_ACTIVE', 409, 'Ya existe una declaración activa para ese legajo y día');
  }
  const definitions = [
    ['ACTION_IDEMPOTENCY_KEY_REUSED', 409, 'La clave de idempotencia ya fue usada'],
    ['ACTION_CASE_NOT_FOUND', 404, 'Caso no encontrado'],
    ['ACTION_VERSION_REQUIRED', 428, 'expectedVersion es obligatorio'],
    ['ACTION_VERSION_CONFLICT', 409, 'El caso fue modificado por otra persona'],
    ['ACTION_INVALID_TRANSITION', 409, 'La transición no está permitida'],
    ['ACTION_SEPARATION_OF_DUTIES', 409, 'La persona que preparó la carga no puede decidirla'],
    ['ACTION_DECISION_REASON_REQUIRED', 422, 'Código de decisión requerido'],
    ['ACTION_CANCELLATION_REASON_REQUIRED', 422, 'Código de cancelación requerido'],
    ['ACTION_MANUAL_VALIDATION_REQUIRED', 422, 'La validación humana es obligatoria'],
    ['OVERTIME_REASON_NOT_AVAILABLE', 422, 'El motivo operativo no está disponible'],
    ['OVERTIME_EXCLUSIVE_REQUIRED', 403, 'La carga exige la titularidad exclusiva vigente'],
    ['OVERTIME_APPROVAL_REQUIRED', 403, 'La decisión exige autorización de Contaduría'],
    ['OVERTIME_READ_REQUIRED', 403, 'No posee autorización para consultar mayor esfuerzo'],
    ['OVERTIME_FEATURE_NOT_CONFIGURED', 503, 'Mayor esfuerzo todavía no está habilitado para este municipio'],
    ['ACTION_SESSION_BUSY', 409, 'El acceso se está actualizando; reintentá en un momento'],
    ['ACTION_SESSION_INVALID', 401, 'La sesión operativa ya no es válida'],
    ['ACTION_RELEASE_NOT_CERTIFIED', 503, 'El contrato de datos activo no está certificado para operar'],
    ['ACTION_SOURCE_BINDING_REQUIRED', 503, 'La fuente GRH certificada no está disponible'],
    ['ACTION_TENANT_AUTHORITY_REQUIRED', 403, 'La membresía no tiene autoridad operativa vigente'],
    ['ACTION_SUBJECT_QUERY_INVALID', 400, 'La búsqueda requiere entre 2 y 50 caracteres'],
    ['ACTION_STATUS_INVALID', 400, 'Estado inválido'],
    ['ACTION_PAGINATION_INVALID', 400, 'Paginación inválida'],
    ['ACTION_COMMAND_INVALID', 400, 'Comando inválido'],
  ];
  for (const [code, status, message] of definitions) {
    if (text.includes(code)) return new ActionCenterError(code, status, message);
  }
  return error;
}

function identityCoordinates(identityPrincipal) {
  const email = String(identityPrincipal?.user?.email || '').trim().toLowerCase();
  const tenantId = String(identityPrincipal?.tenant?.id || '').trim().toLowerCase();
  const membershipId = String(identityPrincipal?.tenant?.membershipId || '').trim().toLowerCase();
  if (!email || identityPrincipal?.tenant?.source !== 'membership'
      || !UUID.test(tenantId) || !UUID.test(membershipId)) {
    fail('ACTION_TENANT_MEMBERSHIP_REQUIRED', 403, 'La sesión no tiene una membresía municipal activa');
  }
  return { email, tenantId, membershipId };
}

function normalizedSession(session, email) {
  const id = String(session?.id || '').trim().toLowerCase();
  const version = Number(session?.version);
  const releaseSha = String(session?.releaseSha || '').trim().toLowerCase();
  if (!UUID.test(id) || String(session?.email || '').trim().toLowerCase() !== email
      || !Number.isSafeInteger(version) || version < 1 || !SHA.test(releaseSha)) {
    fail('ACTION_SESSION_INVALID', 401, 'La sesión operativa ya no es válida');
  }
  return { id, version, releaseSha };
}

function readValues(identityPrincipal, session) {
  const identity = identityCoordinates(identityPrincipal);
  const normalized = normalizedSession(session, identity.email);
  return { identity, session: normalized, values: [
    identity.email, normalized.id, normalized.version, normalized.releaseSha,
    identity.tenantId, identity.membershipId,
  ] };
}

async function readFacade(sql, functionName, values, casts) {
  try {
    const placeholders = casts.map((cast, index) => `$${index + 1}${cast ? `::${cast}` : ''}`).join(', ');
    const result = await query(sql, `SELECT ${functionName}(${placeholders}) AS result`, values);
    const envelope = result[0]?.result;
    if (!envelope || typeof envelope !== 'object') {
      fail('ACTION_CENTER_UNAVAILABLE', 503, 'Centro de acciones temporalmente no disponible');
    }
    return envelope;
  } catch (error) {
    throw sqlError(error);
  }
}

function governedPrincipal(envelope, identityPrincipal) {
  const principal = tenantActionPrincipalFromFacade(envelope?.principal, identityPrincipal);
  if (!principal) fail('ACTION_TENANT_AUTHORITY_REQUIRED', 403, 'La membresía no tiene autoridad operativa vigente');
  return principal;
}

function publicRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const subject = record.subject && typeof record.subject === 'object' ? record.subject : {};
  const payload = record.payload && typeof record.payload === 'object' ? record.payload : {};
  return {
    id: record.id,
    caseNumber: record.caseNumber,
    caseType: OVERTIME_CASE_TYPE,
    beneficiaryContractId: record.beneficiaryContractId,
    subject: {
      contractId: subject.contractId,
      displayName: subject.displayName,
      legajo: subject.legajo,
      sector: subject.sector,
    },
    status: record.status,
    confidentiality: 'restricted',
    policyVersionId: record.policyVersionId,
    payload: {
      workDate: payload.workDate,
      declaredMinutes: Number(payload.declaredMinutes),
      reasonCode: payload.reasonCode,
      ...(payload.reasonLabel ? { reasonLabel: payload.reasonLabel } : {}),
    },
    evidenceStatus: record.evidenceStatus,
    ...(record.decision && typeof record.decision === 'object' ? { decision: {
      decisionReasonCode: record.decision.decisionReasonCode,
      label: record.decision.label,
      manualValidationConfirmed: Boolean(record.decision.manualValidationConfirmed),
    } } : {}),
    ...(record.cancellation && typeof record.cancellation === 'object' ? { cancellation: {
      decisionReasonCode: record.cancellation.decisionReasonCode,
      label: record.cancellation.label,
    } } : {}),
    ...(record.timestamps && typeof record.timestamps === 'object' ? { timestamps: {
      createdAt: record.timestamps.createdAt,
      updatedAt: record.timestamps.updatedAt,
      submittedAt: record.timestamps.submittedAt,
      decidedAt: record.timestamps.decidedAt,
      cancelledAt: record.timestamps.cancelledAt,
    } } : {}),
    ...(record.updatedAt ? { updatedAt: record.updatedAt } : {}),
    version: Number(record.version),
    payrollImpact: { amount: null, rate: null, calculated: false, posted: false, attendanceReconciled: false },
    projection: 'restricted_nominal',
  };
}

function publicTimeline(events) {
  return (Array.isArray(events) ? events : []).map((event) => {
    const metadata = event?.metadata && typeof event.metadata === 'object' ? event.metadata : {};
    return {
      id: event?.id,
      caseVersion: Number(event?.caseVersion),
      eventType: event?.eventType,
      fromStatus: event?.fromStatus ?? null,
      toStatus: event?.toStatus,
      actorRole: event?.actorRole,
      metadata: {
        command: metadata.command,
        ...(metadata.decisionReasonCode ? { decisionReasonCode: metadata.decisionReasonCode } : {}),
        ...(typeof metadata.reasonPresent === 'boolean' ? { reasonPresent: metadata.reasonPresent } : {}),
        ...(metadata.evidenceStatus ? { evidenceStatus: metadata.evidenceStatus } : {}),
        ...(typeof metadata.manualValidationConfirmed === 'boolean'
          ? { manualValidationConfirmed: metadata.manualValidationConfirmed } : {}),
        payrollCalculated: false,
        payrollPosted: false,
      },
      occurredAt: event?.occurredAt,
    };
  });
}

export async function getOvertimeBootstrap(sql, identityPrincipal, session, subjectQuery = '') {
  const queryText = String(subjectQuery || '').trim();
  if (queryText && (queryText.length < 2 || queryText.length > 50)) {
    fail('ACTION_SUBJECT_QUERY_INVALID', 400, 'La búsqueda requiere entre 2 y 50 caracteres');
  }
  const { values } = readValues(identityPrincipal, session);
  const envelope = await readFacade(sql, 'action_center_overtime_bootstrap_v1',
    [...values, queryText || null], ['', 'uuid', 'integer', '', 'uuid', 'uuid', '']);
  const principal = governedPrincipal(envelope, identityPrincipal);
  const source = envelope.source && typeof envelope.source === 'object' ? envelope.source : {};
  const feature = envelope.feature && typeof envelope.feature === 'object' ? envelope.feature : {};
  const subjects = (Array.isArray(envelope.subjects) ? envelope.subjects : []).map((subject) => ({
    contractId: subject?.contractId,
    displayName: String(subject?.displayName || 'Nombre no informado'),
    legajo: String(subject?.legajo || ''),
    sector: String(subject?.sector || 'Sector no informado'),
    accessBasis: 'exclusive_entry',
  })).filter((subject) => UUID.test(String(subject.contractId || '')));
  const reasons = (Array.isArray(envelope.reasonRows) ? envelope.reasonRows : []).map((reason) => ({
    reasonCode: reason?.reasonCode,
    label: reason?.label,
    governanceStatus: reason?.governanceStatus,
  })).filter((reason) => CODE.test(String(reason.reasonCode || '')));
  const decisionReasons = (Array.isArray(envelope.decisionReasonRows)
    ? envelope.decisionReasonRows : []).map((reason) => ({
    decisionReasonCode: reason?.decisionReasonCode,
    label: reason?.label,
    allowedCommands: (Array.isArray(reason?.allowedCommands) ? reason.allowedCommands : [])
      .filter((command) => ['approve', 'reject', 'cancel'].includes(command)),
  })).filter((reason) => CODE.test(String(reason.decisionReasonCode || '')));
  return {
    principal,
    contract: OVERTIME_ACTION_CONTRACT,
    source: { label: source.label, cutoff: source.cutoff ?? null, version: source.version },
    feature: {
      caseType: OVERTIME_CASE_TYPE,
      policyVersionId: OVERTIME_POLICY_VERSION,
      governanceStatus: feature.governanceStatus,
      canEnter: Boolean(feature.canEnter),
      canDecide: Boolean(feature.canDecide),
      calculated: false,
      posted: false,
    },
    options: {
      subjects,
      subjectsTruncated: Boolean(envelope.subjectsTruncated),
      reasons,
      decisionReasons,
      statuses: [...STATUSES],
    },
  };
}

export async function listOvertimeCases(sql, identityPrincipal, options, session) {
  const page = canonicalPage(options?.page, 'page', 1, 200);
  const limit = canonicalPage(options?.limit, 'limit', 20, 50);
  const status = options?.status == null || options.status === '' ? null : String(options.status).trim().toLowerCase();
  if (status && !STATUSES.has(status)) fail('ACTION_STATUS_INVALID', 400, 'Estado inválido');
  const { values } = readValues(identityPrincipal, session);
  const envelope = await readFacade(sql, 'action_center_overtime_list_v1',
    [...values, status, page, limit], ['', 'uuid', 'integer', '', 'uuid', 'uuid', '', 'integer', 'integer']);
  const principal = governedPrincipal(envelope, identityPrincipal);
  const data = (Array.isArray(envelope.records) ? envelope.records : []).map(publicRecord).filter(Boolean);
  const total = Number(envelope.total || 0);
  return { principal, data, pagination: { mode: 'page', page, limit, total, pages: Math.ceil(total / limit) } };
}

export async function readOvertimeCase(sql, identityPrincipal, caseId, session) {
  const id = requiredUuid(caseId, 'case_id');
  const { values } = readValues(identityPrincipal, session);
  const envelope = await readFacade(sql, 'action_center_overtime_detail_v1',
    [...values, id], ['', 'uuid', 'integer', '', 'uuid', 'uuid', 'uuid']);
  const principal = governedPrincipal(envelope, identityPrincipal);
  const data = publicRecord(envelope.record);
  if (!data) fail('ACTION_CASE_NOT_FOUND', 404, 'Caso no encontrado');
  const allowed = new Set(['update_draft', 'submit', 'approve', 'reject', 'cancel']);
  return {
    principal,
    data,
    timeline: publicTimeline(envelope.timeline),
    allowedCommands: (Array.isArray(envelope.allowedCommands) ? envelope.allowedCommands : [])
      .filter((command) => allowed.has(command)),
  };
}

function principalCoordinates(principal, session) {
  const email = String(principal?.email || '').trim().toLowerCase();
  const tenantId = requiredUuid(principal?.tenantId, 'tenant_id');
  const membershipId = requiredUuid(principal?.membershipId, 'membership_id');
  const sourceBindingId = requiredUuid(principal?.sourceBindingId, 'source_binding_id');
  const normalized = normalizedSession(session, email);
  return { email, tenantId, membershipId, sourceBindingId, session: normalized };
}

async function apply(sql, principal, input, session) {
  const coordinates = principalCoordinates(principal, session);
  const hash = commandHash({
    tenantId: coordinates.tenantId,
    membershipId: coordinates.membershipId,
    sourceBindingId: coordinates.sourceBindingId,
    actorSessionId: coordinates.session.id,
    actorSessionVersion: coordinates.session.version,
    releaseSha: coordinates.session.releaseSha,
    caseType: OVERTIME_CASE_TYPE,
    command: input.command,
    caseId: input.caseId || null,
    expectedVersion: input.expectedVersion ?? null,
    request: input.hashBasis,
  });
  try {
    const result = await query(sql, `
      SELECT case_id::text AS "caseId", case_number::text AS "caseNumber",
             current_status AS status, current_version AS version, replayed
      FROM action_center_apply_overtime_command_v1(
        $1, $2::uuid, $3, $4, $5::uuid, $6::uuid, $7, $8::uuid, $9,
        $10::uuid, $11, $12::jsonb, $13::uuid, $14, $15, $16, $17
      )
    `, [
      coordinates.email, coordinates.session.id, coordinates.session.version,
      coordinates.session.releaseSha, coordinates.tenantId, coordinates.membershipId,
      input.command, input.caseId || null, input.expectedVersion ?? null,
      input.idempotencyKey, hash, input.payload ? JSON.stringify(input.payload) : null,
      input.beneficiaryContractId || null, input.policyVersionId || null,
      input.decisionReasonCode || null, input.evidenceStatus || null,
      Boolean(input.manualValidationConfirmed),
    ]);
    return result[0];
  } catch (error) {
    throw sqlError(error);
  }
}

function receipt(result) {
  return {
    id: result.caseId,
    caseNumber: result.caseNumber,
    caseType: OVERTIME_CASE_TYPE,
    status: result.status,
    version: Number(result.version),
    payrollImpact: { amount: null, rate: null, calculated: false, posted: false, attendanceReconciled: false },
  };
}

export async function createOvertimeCase(sql, principal, rawPayload, idempotencyKey, session) {
  const normalized = normalizeOvertimePayload(rawPayload, { create: true });
  const result = await apply(sql, principal, {
    command: 'create', idempotencyKey: normalizeIdempotencyKey(idempotencyKey),
    hashBasis: { payload: rawPayload }, payload: normalized.casePayload,
    beneficiaryContractId: normalized.beneficiaryContractId,
    policyVersionId: normalized.policyVersionId, manualValidationConfirmed: false,
  }, session);
  return { data: receipt(result), replayed: Boolean(result.replayed) };
}

export async function updateOvertimeDraft(sql, principal, caseId, rawPayload, expectedVersion, idempotencyKey, session) {
  const id = requiredUuid(caseId, 'case_id');
  const normalized = normalizeOvertimePayload(rawPayload);
  const version = exactVersion(expectedVersion);
  const result = await apply(sql, principal, {
    command: 'update_draft', caseId: id, expectedVersion: version,
    idempotencyKey: normalizeIdempotencyKey(idempotencyKey), hashBasis: { payload: rawPayload },
    payload: normalized.casePayload, policyVersionId: normalized.policyVersionId,
    manualValidationConfirmed: false,
  }, session);
  return { data: receipt(result), replayed: Boolean(result.replayed) };
}

export async function transitionOvertimeCase(sql, principal, command, caseId, body, idempotencyKey, session) {
  const id = requiredUuid(caseId, 'case_id');
  const normalized = normalizeOvertimeTransition(command, body);
  const result = await apply(sql, principal, {
    command, caseId: id, expectedVersion: normalized.expectedVersion,
    idempotencyKey: normalizeIdempotencyKey(idempotencyKey), hashBasis: {
      decisionReasonCode: normalized.decisionReasonCode,
      evidenceStatus: normalized.evidenceStatus,
      manualValidationConfirmed: normalized.manualValidationConfirmed,
    }, ...normalized,
  }, session);
  return { data: receipt(result), replayed: Boolean(result.replayed) };
}
