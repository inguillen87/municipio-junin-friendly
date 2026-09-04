import { createHash } from 'node:crypto';

export const PAYROLL_REPROCESSING_CONTRACT_VERSION = 'payroll-reprocessing-case.v1';
export const PAYROLL_REPROCESSING_MAX_BODY_BYTES = 16 * 1024;
export const PAYROLL_REPROCESSING_KINDS = Object.freeze(['void', 'reliquidate']);
export const PAYROLL_REPROCESSING_BUSINESS_REASONS = Object.freeze([
  'duplicate_run',
  'incorrect_personnel',
  'incorrect_concept',
  'incorrect_amount',
  'source_correction',
  'legal_adjustment',
  'other_controlled',
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA40 = /^[a-f0-9]{40}$/;
const REFERENCE = /^ref:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PREPARE_KEYS = new Set([
  'payrollRunId', 'requestKind', 'reasonCode', 'reasonReference',
]);
const TRANSITION_KEYS = new Set([
  'caseId', 'expectedVersion', 'reasonCode', 'reasonReference',
]);
const KINDS = new Set(PAYROLL_REPROCESSING_KINDS);
const BUSINESS_REASONS = new Set(PAYROLL_REPROCESSING_BUSINESS_REASONS);
const REASONS = Object.freeze({
  submit: new Set(['ready_for_review']),
  approve: new Set(['approved_for_external_execution']),
  reject: new Set(['insufficient_evidence', 'run_not_eligible', 'request_not_authorized']),
  cancel: new Set(['cancelled_by_preparer']),
});

export class PayrollReprocessingError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = 'PayrollReprocessingError';
    this.code = code;
    this.status = status;
  }
}

function fail(code, status, message) {
  throw new PayrollReprocessingError(code, status, message);
}

function exactObject(value, keys, code, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== keys.size
      || Object.keys(value).some((key) => !keys.has(key))) {
    fail(code, 400, message);
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function canonicalUuid(value, code, message) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!UUID.test(normalized)) fail(code, 422, message);
  return normalized;
}

function canonicalReference(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!REFERENCE.test(normalized)) {
    fail(
      'PAYROLL_REPROCESSING_REASON_REFERENCE_REQUIRED',
      422,
      'La operación exige una referencia opaca de expediente o respaldo',
    );
  }
  return normalized;
}

export function normalizePayrollReprocessingDraft(input) {
  exactObject(
    input,
    PREPARE_KEYS,
    'PAYROLL_REPROCESSING_DRAFT_INVALID',
    'El borrador no coincide con el contrato de anulación/reliquidación',
  );
  const payrollRunId = canonicalUuid(
    input.payrollRunId,
    'PAYROLL_REPROCESSING_RUN_ID_INVALID',
    'La corrida objetivo no es válida',
  );
  if (typeof input.requestKind !== 'string' || !KINDS.has(input.requestKind)) {
    fail(
      'PAYROLL_REPROCESSING_KIND_INVALID',
      422,
      'La solicitud debe ser de anulación o reliquidación',
    );
  }
  if (typeof input.reasonCode !== 'string' || !BUSINESS_REASONS.has(input.reasonCode)) {
    fail(
      'PAYROLL_REPROCESSING_REASON_INVALID',
      422,
      'El motivo de negocio no está permitido',
    );
  }
  return Object.freeze({
    payrollRunId,
    requestKind: input.requestKind,
    reasonCode: input.reasonCode,
    reasonReference: canonicalReference(input.reasonReference),
    contractVersion: PAYROLL_REPROCESSING_CONTRACT_VERSION,
    approvalEffect: 'external_execution_authorization_only',
    grhMutation: false,
    payrollVoided: false,
    payrollCalculated: false,
    payrollPosted: false,
  });
}

export function normalizePayrollReprocessingTransition(command, input) {
  if (!Object.hasOwn(REASONS, command)) {
    fail('PAYROLL_REPROCESSING_COMMAND_INVALID', 400, 'Comando no permitido');
  }
  exactObject(
    input,
    TRANSITION_KEYS,
    'PAYROLL_REPROCESSING_TRANSITION_INVALID',
    'La transición no coincide con el contrato',
  );
  const caseId = canonicalUuid(
    input.caseId,
    'PAYROLL_REPROCESSING_CASE_ID_INVALID',
    'El expediente no es válido',
  );
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
    fail(
      'PAYROLL_REPROCESSING_VERSION_REQUIRED',
      428,
      'expectedVersion es obligatorio',
    );
  }
  if (typeof input.reasonCode !== 'string' || !REASONS[command].has(input.reasonCode)) {
    fail(
      'PAYROLL_REPROCESSING_REASON_INVALID',
      422,
      'El motivo no corresponde al comando',
    );
  }
  return Object.freeze({
    caseId,
    expectedVersion: input.expectedVersion,
    reasonCode: input.reasonCode,
    reasonReference: canonicalReference(input.reasonReference),
  });
}

export function normalizePayrollReprocessingIdempotencyKey(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!UUID_V4.test(normalized)) {
    fail(
      'PAYROLL_REPROCESSING_IDEMPOTENCY_KEY_INVALID',
      428,
      'Idempotency-Key debe ser un UUID v4',
    );
  }
  return normalized;
}

function identityContext(identityPrincipal, session) {
  const actorEmail = String(identityPrincipal?.user?.email || '').trim().toLowerCase();
  const tenantId = String(identityPrincipal?.tenant?.id || '').trim().toLowerCase();
  const membershipId = String(identityPrincipal?.tenant?.membershipId || '').trim().toLowerCase();
  const actorSessionId = String(session?.id || '').trim().toLowerCase();
  const actorSessionVersion = Number(session?.version);
  const releaseSha = String(session?.releaseSha || '').trim().toLowerCase();
  if (!actorEmail || identityPrincipal?.tenant?.source !== 'membership'
      || !UUID.test(tenantId) || !UUID.test(membershipId) || !UUID.test(actorSessionId)
      || !Number.isSafeInteger(actorSessionVersion) || actorSessionVersion < 1
      || !SHA40.test(releaseSha)
      || String(session?.email || '').trim().toLowerCase() !== actorEmail) {
    fail(
      'PAYROLL_REPROCESSING_SESSION_INVALID',
      401,
      'La sesión operativa ya no es válida',
    );
  }
  return Object.freeze({
    actorEmail,
    actorSessionId,
    actorSessionVersion,
    membershipId,
    releaseSha,
    tenantId,
  });
}

function sqlRows(result) {
  return Array.isArray(result) ? result : (Array.isArray(result?.rows) ? result.rows : []);
}

function mappedSqlError(error) {
  const message = String(error?.message || '');
  const definitions = [
    ['PAYROLL_REPROCESSING_IDEMPOTENCY_REUSE', 409, 'La clave de idempotencia ya fue usada'],
    ['PAYROLL_REPROCESSING_DUPLICATE_CASE', 409, 'Ya existe un expediente activo para esa corrida'],
    ['PAYROLL_REPROCESSING_VERSION_CONFLICT', 409, 'El expediente fue modificado por otra persona'],
    ['PAYROLL_REPROCESSING_MAKER_CHECKER_REQUIRED', 409, 'La persona que preparó el expediente no puede decidirlo'],
    ['PAYROLL_REPROCESSING_RUN_NOT_ELIGIBLE', 422, 'La corrida GRH no está cerrada o no pertenece al origen certificado'],
    ['PAYROLL_REPROCESSING_PREPARE_INVALID', 422, 'El expediente no cumple el contrato vigente'],
    ['PAYROLL_REPROCESSING_LIST_INVALID', 422, 'Filtros de expedientes inválidos'],
    ['PAYROLL_REPROCESSING_DETAIL_INVALID', 422, 'El expediente no es válido'],
    ['PAYROLL_REPROCESSING_TRANSITION_INVALID', 409, 'La transición no está permitida'],
    ['PAYROLL_REPROCESSING_PREPARER_REQUIRED', 403, 'Sólo quien preparó el expediente puede enviarlo o cancelarlo'],
    ['PAYROLL_REPROCESSING_CAPABILITY_REQUIRED', 403, 'No posee la capacidad requerida'],
    ['PAYROLL_REPROCESSING_EMPLOYMENT_REQUIRED', 403, 'La decisión exige un vínculo laboral vigente'],
    ['PAYROLL_REPROCESSING_NOT_FOUND', 404, 'Expediente no encontrado'],
    ['PAYROLL_REPROCESSING_SESSION_BUSY', 409, 'El acceso se está actualizando; reintentá en un momento'],
    ['PAYROLL_REPROCESSING_SESSION_INVALID', 401, 'La sesión operativa ya no es válida'],
    ['PAYROLL_REPROCESSING_RELEASE_NOT_CERTIFIED', 503, 'La versión desplegada no está certificada'],
    ['PAYROLL_REPROCESSING_BINDING_REQUIRED', 503, 'El binding GRH certificado no está disponible'],
    ['ACTION_SOURCE_BINDING_REQUIRED', 503, 'El binding GRH certificado no está disponible'],
    ['ACTION_TENANT_AUTHORITY_REQUIRED', 403, 'La membresía no tiene autoridad operativa'],
    ['ACTION_SESSION_BUSY', 409, 'El acceso se está actualizando; reintentá en un momento'],
    ['ACTION_SESSION_INVALID', 401, 'La sesión operativa ya no es válida'],
    ['ACTION_RELEASE_NOT_CERTIFIED', 503, 'La versión desplegada no está certificada'],
    ['TENANT_IAM_SOD_CONFLICT', 403, 'La membresía combina capacidades incompatibles'],
  ];
  for (const [code, status, safeMessage] of definitions) {
    if (message.includes(code)) return new PayrollReprocessingError(code, status, safeMessage);
  }
  return error;
}

async function facade(sql, functionName, values, casts) {
  if (!sql || typeof sql.query !== 'function') throw new TypeError('conexion SQL requerida');
  try {
    const placeholders = casts.map((cast, index) => (
      `$${index + 1}${cast ? `::${cast}` : ''}`
    )).join(', ');
    const result = await sql.query(
      `SELECT ${functionName}(${placeholders}) AS result`,
      values,
    );
    const envelope = sqlRows(result)[0]?.result;
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
      fail(
        'PAYROLL_REPROCESSING_UNAVAILABLE',
        503,
        'Anulación y reliquidación no disponibles',
      );
    }
    return envelope;
  } catch (error) {
    throw mappedSqlError(error);
  }
}

function commandHash(context, command, payload) {
  return createHash('sha256').update(stableJson({
    contractVersion: PAYROLL_REPROCESSING_CONTRACT_VERSION,
    tenantId: context.tenantId,
    membershipId: context.membershipId,
    actorSessionId: context.actorSessionId,
    actorSessionVersion: context.actorSessionVersion,
    releaseSha: context.releaseSha,
    command,
    payload,
  })).digest('hex');
}

function assertEnvelope(envelope) {
  const sources = [envelope, envelope?.data, envelope?.feature].filter(Boolean);
  for (const source of sources) {
    for (const [key, expected] of [
      ['grhMutation', false],
      ['payrollVoided', false],
      ['payrollCalculated', false],
      ['payrollPosted', false],
    ]) {
      if (Object.hasOwn(source, key) && source[key] !== expected) {
        fail(
          'PAYROLL_REPROCESSING_CONTRACT_DRIFT',
          503,
          'El contrato de anulación/reliquidación no es seguro',
        );
      }
    }
  }
  if (envelope?.approvalEffect
      && envelope.approvalEffect !== 'external_execution_authorization_only') {
    fail(
      'PAYROLL_REPROCESSING_CONTRACT_DRIFT',
      503,
      'El contrato de anulación/reliquidación no es seguro',
    );
  }
  return envelope;
}

export async function getPayrollReprocessingBootstrap(sql, principal, session) {
  const context = identityContext(principal, session);
  return assertEnvelope(await facade(
    sql,
    'payroll_reprocessing_bootstrap_v1',
    [JSON.stringify(context)],
    ['jsonb'],
  ));
}

export async function listPayrollReprocessingCases(sql, principal, session, options = {}) {
  const context = identityContext(principal, session);
  const status = String(options.status || 'all').trim().toLowerCase();
  const page = Number(options.page || 1);
  const limit = Number(options.limit || 20);
  if (!['all', 'draft', 'submitted', 'approved', 'rejected', 'cancelled'].includes(status)
      || !Number.isSafeInteger(page) || page < 1 || page > 10000
      || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    fail('PAYROLL_REPROCESSING_LIST_INVALID', 422, 'Filtros de expedientes inválidos');
  }
  return assertEnvelope(await facade(
    sql,
    'payroll_reprocessing_list_v1',
    [JSON.stringify(context), status, page, limit],
    ['jsonb', '', 'integer', 'integer'],
  ));
}

export async function readPayrollReprocessingCase(sql, principal, session, caseId) {
  const context = identityContext(principal, session);
  const id = canonicalUuid(
    caseId,
    'PAYROLL_REPROCESSING_CASE_ID_INVALID',
    'El expediente no es válido',
  );
  return assertEnvelope(await facade(
    sql,
    'payroll_reprocessing_detail_v1',
    [JSON.stringify(context), id],
    ['jsonb', 'uuid'],
  ));
}

export async function preparePayrollReprocessingCase(
  sql, principal, session, rawDraft, idempotencyKey,
) {
  const context = identityContext(principal, session);
  const draft = normalizePayrollReprocessingDraft(rawDraft);
  const key = normalizePayrollReprocessingIdempotencyKey(idempotencyKey);
  return assertEnvelope(await facade(
    sql,
    'payroll_reprocessing_prepare_v1',
    [
      JSON.stringify(context), draft.payrollRunId, draft.requestKind,
      draft.reasonCode, draft.reasonReference, key,
      commandHash(context, 'prepare', draft),
    ],
    ['jsonb', 'uuid', '', '', '', 'uuid', ''],
  ));
}

export async function transitionPayrollReprocessingCase(
  sql, principal, session, command, rawTransition, idempotencyKey,
) {
  const context = identityContext(principal, session);
  const transition = normalizePayrollReprocessingTransition(command, rawTransition);
  const key = normalizePayrollReprocessingIdempotencyKey(idempotencyKey);
  return assertEnvelope(await facade(
    sql,
    'payroll_reprocessing_transition_v1',
    [
      JSON.stringify(context), transition.caseId, command,
      transition.expectedVersion, transition.reasonCode,
      transition.reasonReference, key, commandHash(context, command, transition),
    ],
    ['jsonb', 'uuid', '', 'integer', '', '', 'uuid', ''],
  ));
}
