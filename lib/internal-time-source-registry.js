import { createHash } from 'node:crypto';

import {
  ActionCenterError,
  commandHash,
  normalizeIdempotencyKey,
} from './internal-leave-workflow.js';

export const TIME_SOURCE_CASE_TYPE = 'time_source_contract';
export const TIME_SOURCE_CONTRACT_VERSION = 'time-source-registry.v1';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA40 = /^[a-f0-9]{40}$/;
const SHA64 = /^[a-f0-9]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UTC_CUT = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\dZ$/;
const SCHEMA_VERSION = /^v[1-9]\d{0,3}(?:\.\d{1,4}){0,2}$/;

export const TIME_SOURCE_OWNER_AUTHORITIES = Object.freeze({
  municipal_human_resources: 'Recursos Humanos municipal',
  municipal_it: 'Tecnología municipal',
  municipal_payroll: 'Liquidación de haberes municipal',
  provincial_authority: 'Autoridad provincial',
  national_authority: 'Autoridad nacional',
  certified_external_provider: 'Proveedor externo certificado',
});

export const TIME_SOURCE_DOMAINS = Object.freeze({
  shift_assignment: Object.freeze({
    label: 'Asignación de turnos', grain: 'employee_shift_day',
    identityKeyKinds: Object.freeze(['employment_contract_id', 'legacy_legajo', 'source_employee_key']),
    readinessKey: 'shiftAssignment', requiredForCatalog: true,
  }),
  time_punch: Object.freeze({
    label: 'Fichadas', grain: 'employee_punch_event',
    identityKeyKinds: Object.freeze(['employment_contract_id', 'legacy_legajo', 'source_employee_key']),
    readinessKey: 'timePunches', requiredForCatalog: true,
  }),
  holiday_calendar: Object.freeze({
    label: 'Calendario de feriados', grain: 'calendar_day',
    identityKeyKinds: Object.freeze(['calendar_date', 'none']),
    readinessKey: 'holidayCalendar', requiredForCatalog: true,
  }),
  municipal_rule_profile: Object.freeze({
    label: 'Perfil normativo municipal', grain: 'municipal_rule_version',
    identityKeyKinds: Object.freeze(['tenant_policy_key', 'none']),
    readinessKey: 'municipalRuleProfile', requiredForCatalog: true,
  }),
  administrative_event: Object.freeze({
    label: 'Novedades administrativas', grain: 'employee_administrative_event',
    identityKeyKinds: Object.freeze(['employment_contract_id', 'legacy_legajo', 'source_employee_key']),
    readinessKey: 'administrativeEvents', requiredForCatalog: false,
  }),
  employment_master_reference: Object.freeze({
    label: 'Referencia maestra de vínculos', grain: 'employment_contract_reference',
    identityKeyKinds: Object.freeze(['employment_contract_id', 'legacy_legajo', 'source_employee_key']),
    readinessKey: null, requiredForCatalog: false,
  }),
});

const FORMATS = Object.freeze(['csv', 'json', 'jsonl', 'parquet', 'postgres_relation', 'fixed_width']);
const STATUSES = Object.freeze(['draft', 'submitted', 'approved', 'rejected', 'retired', 'cancelled']);
const GOVERNANCE_STATUSES = new Set([...STATUSES, 'missing', 'stale']);
const REQUIRED_READINESS = Object.freeze([
  'shiftAssignment', 'timePunches', 'holidayCalendar', 'municipalRuleProfile', 'administrativeEvents',
]);
const PROPOSE_COMMANDS = new Set(['create_draft', 'update_draft', 'submit', 'cancel']);
const APPROVE_COMMANDS = new Set(['approve', 'reject', 'retire']);
const COMMANDS = new Set([...PROPOSE_COMMANDS, ...APPROVE_COMMANDS]);
const REASONS = Object.freeze({
  create_draft: Object.freeze(['source_onboarding']),
  update_draft: Object.freeze(['metadata_correction']),
  submit: Object.freeze(['ready_for_review']),
  approve: Object.freeze(['evidence_verified']),
  reject: Object.freeze(['insufficient_evidence', 'metadata_invalid', 'source_not_authoritative']),
  retire: Object.freeze(['superseded', 'source_retired', 'binding_changed']),
  cancel: Object.freeze(['entered_in_error', 'withdrawn']),
});
const REASON_LABELS = Object.freeze({
  source_onboarding: 'Alta de fuente',
  metadata_correction: 'Corrección de metadatos',
  ready_for_review: 'Lista para revisión',
  evidence_verified: 'Evidencia verificada',
  insufficient_evidence: 'Evidencia insuficiente',
  metadata_invalid: 'Metadatos inválidos',
  source_not_authoritative: 'Fuente no autoritativa',
  superseded: 'Reemplazada por otra fuente',
  source_retired: 'Fuente retirada',
  binding_changed: 'Cambio de binding certificado',
  entered_in_error: 'Carga realizada por error',
  withdrawn: 'Propuesta retirada',
});

export const TIME_SOURCE_REGISTRY_CONTRACT = Object.freeze({
  version: TIME_SOURCE_CONTRACT_VERSION,
  caseType: TIME_SOURCE_CASE_TYPE,
  status: 'metadata_intake',
  timezone: 'America/Argentina/Mendoza',
  domains: Object.freeze(Object.entries(TIME_SOURCE_DOMAINS).map(([key, value]) => Object.freeze({
    key, label: value.label, grain: value.grain,
    identityKeyKinds: value.identityKeyKinds,
    readinessKey: value.readinessKey,
    requiredForCatalog: value.requiredForCatalog,
  }))),
  formats: FORMATS,
  ownerAuthorities: Object.freeze(Object.entries(TIME_SOURCE_OWNER_AUTHORITIES).map(
    ([key, label]) => Object.freeze({ key, label }),
  )),
  statuses: STATUSES,
  transitions: Object.freeze({
    draft: Object.freeze(['submitted', 'cancelled']),
    submitted: Object.freeze(['approved', 'rejected', 'cancelled']),
    approved: Object.freeze(['retired']),
    rejected: Object.freeze([]), retired: Object.freeze([]), cancelled: Object.freeze([]),
  }),
  evaluationReady: false,
  attendanceReconciled: false,
  payrollCalculated: false,
  payrollPosted: false,
  grhMutation: false,
});

function fail(code, status, message) {
  throw new ActionCenterError(code, status, message);
}

function exactObject(value, allowed, code = 'TIME_SOURCE_COMMAND_INVALID') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(code, 400, 'El comando debe ser un objeto JSON exacto');
  }
  const extra = Object.keys(value).find((key) => !allowed.has(key));
  if (extra) fail(code, 400, `Campo no permitido: ${extra}`);
}

function requiredUuid(value, field) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!UUID.test(normalized)) fail('TIME_SOURCE_IDENTIFIER_INVALID', 400, `${field} inválido`);
  return normalized;
}

function exactVersion(value, { create = false } = {}) {
  if (!Number.isSafeInteger(value) || (create ? value !== 0 : value < 1)) {
    fail('TIME_SOURCE_VERSION_REQUIRED', 428, create
      ? 'expectedVersion debe ser 0 al crear' : 'expectedVersion es obligatorio');
  }
  return value;
}

function canonicalPage(value, field, fallback, max) {
  if (value == null || value === '') return fallback;
  const text = typeof value === 'number' ? String(value) : String(value).trim();
  if (!/^[1-9]\d*$/.test(text)) fail('TIME_SOURCE_PAGINATION_INVALID', 400, 'Paginación inválida');
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed > max) {
    fail('TIME_SOURCE_PAGINATION_INVALID', 400, `${field} fuera de rango`);
  }
  return parsed;
}

function isDate(value) {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function boundedText(value, field, min, max) {
  if (typeof value !== 'string') fail('TIME_SOURCE_METADATA_INVALID', 422, `${field} debe ser texto`);
  const text = value.trim();
  if (text.length < min || text.length > max) {
    fail('TIME_SOURCE_METADATA_INVALID', 422, `${field} fuera de rango`);
  }
  return text;
}

function safeOwnerAuthority(value) {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!Object.hasOwn(TIME_SOURCE_OWNER_AUTHORITIES, key)) {
    fail('TIME_SOURCE_METADATA_INVALID', 422, 'ownerAuthority no pertenece a la taxonomía institucional');
  }
  return key;
}

function normalizeMetadata(input) {
  const fields = new Set([
    'domain', 'ownerAuthority', 'format', 'schemaVersion',
    'artifactSha256', 'cutAt', 'coverageFrom', 'coverageTo', 'timezone', 'grain',
    'identityKeyKind', 'recordCount', 'reasonCode', 'reason',
  ]);
  exactObject(input, fields, 'TIME_SOURCE_METADATA_INVALID');
  const required = [...fields].filter((field) => field !== 'recordCount');
  if (required.some((field) => !Object.prototype.hasOwnProperty.call(input, field))) {
    fail('TIME_SOURCE_METADATA_INVALID', 422, 'Faltan metadatos obligatorios');
  }
  const domain = String(input.domain || '').trim().toLowerCase();
  const definition = TIME_SOURCE_DOMAINS[domain];
  if (!definition) fail('TIME_SOURCE_METADATA_INVALID', 422, 'Dominio temporal no permitido');
  const format = String(input.format || '').trim().toLowerCase();
  if (!FORMATS.includes(format)) fail('TIME_SOURCE_METADATA_INVALID', 422, 'Formato no permitido');
  const schemaVersion = typeof input.schemaVersion === 'string' ? input.schemaVersion : '';
  if (!SCHEMA_VERSION.test(schemaVersion)) fail('TIME_SOURCE_METADATA_INVALID', 422, 'schemaVersion inválida');
  const artifactSha256 = String(input.artifactSha256 || '').trim().toLowerCase();
  if (!SHA64.test(artifactSha256)) fail('TIME_SOURCE_METADATA_INVALID', 422, 'artifactSha256 inválido');
  const cutAt = String(input.cutAt || '').trim();
  const parsedCutAt = new Date(cutAt);
  if (!UTC_CUT.test(cutAt) || Number.isNaN(parsedCutAt.getTime())
      || parsedCutAt.toISOString() !== cutAt.replace(/Z$/, '.000Z')) {
    fail('TIME_SOURCE_METADATA_INVALID', 422, 'cutAt debe ser UTC canónico');
  }
  if (!isDate(input.coverageFrom) || !isDate(input.coverageTo)
      || input.coverageFrom > input.coverageTo) {
    fail('TIME_SOURCE_METADATA_INVALID', 422, 'Cobertura temporal inválida');
  }
  if (input.timezone !== 'America/Argentina/Mendoza') {
    fail('TIME_SOURCE_METADATA_INVALID', 422, 'Timezone no permitido');
  }
  if (input.grain !== definition.grain
      || !definition.identityKeyKinds.includes(input.identityKeyKind)) {
    fail('TIME_SOURCE_METADATA_INVALID', 422, 'Grano o clave de identidad incompatibles');
  }
  let recordCount = null;
  if (Object.prototype.hasOwnProperty.call(input, 'recordCount')) {
    if (!Number.isSafeInteger(input.recordCount) || input.recordCount < 0) {
      fail('TIME_SOURCE_METADATA_INVALID', 422, 'recordCount debe ser un entero no negativo');
    }
    recordCount = input.recordCount;
  }
  return Object.freeze({
    metadata: Object.freeze({
      domain,
      ownerAuthority: safeOwnerAuthority(input.ownerAuthority),
      format,
      schemaVersion,
      artifactSha256,
      cutAt,
      coverageFrom: input.coverageFrom,
      coverageTo: input.coverageTo,
      timezone: input.timezone,
      grain: input.grain,
      identityKeyKind: input.identityKeyKind,
      ...(recordCount === null ? {} : { recordCount }),
    }),
    reasonCode: input.reasonCode,
    reason: input.reason,
  });
}

function normalizeReason(command, payload) {
  exactObject(payload, new Set(['reasonCode', 'reason']), 'TIME_SOURCE_REASON_INVALID');
  const reasonCode = typeof payload.reasonCode === 'string' ? payload.reasonCode.trim() : '';
  if (!REASONS[command]?.includes(reasonCode)) {
    fail('TIME_SOURCE_REASON_INVALID', 422, 'reasonCode no corresponde al comando');
  }
  const reason = boundedText(payload.reason, 'reason', 3, 500);
  return Object.freeze({
    reasonCode,
    reasonHash: createHash('sha256').update(reason).digest('hex'),
  });
}

export function normalizeTimeSourceCommand(body) {
  const command = typeof body?.command === 'string' ? body.command.trim() : '';
  if (!COMMANDS.has(command)) fail('TIME_SOURCE_COMMAND_INVALID', 400, 'Comando no permitido');
  const create = command === 'create_draft';
  exactObject(body, new Set([
    'caseType', 'command', 'expectedVersion', 'payload', ...(create ? [] : ['contractId']),
  ]));
  if (body.caseType !== TIME_SOURCE_CASE_TYPE) fail('ACTION_CASE_TYPE_INVALID', 400, 'caseType no soportado');
  const expectedVersion = exactVersion(body.expectedVersion, { create });
  const contractId = create ? null : requiredUuid(body.contractId, 'contractId');
  let metadata = null;
  let reasonInput;
  if (command === 'create_draft' || command === 'update_draft') {
    const normalized = normalizeMetadata(body.payload);
    metadata = normalized.metadata;
    reasonInput = { reasonCode: normalized.reasonCode, reason: normalized.reason };
  } else {
    reasonInput = body.payload;
  }
  const reason = normalizeReason(command, reasonInput);
  return Object.freeze({ command, contractId, expectedVersion, metadata, ...reason });
}

function rows(result) {
  return Array.isArray(result) ? result : (Array.isArray(result?.rows) ? result.rows : []);
}

async function query(sql, statement, values) {
  if (!sql || typeof sql.query !== 'function') throw new TypeError('conexion SQL requerida');
  return rows(await sql.query(statement, values));
}

function mappedSqlError(error) {
  const text = String(error?.message || '');
  const definitions = [
    ['TIME_SOURCE_IDEMPOTENCY_REUSED', 409, 'La clave de idempotencia ya fue usada'],
    ['TIME_SOURCE_VERSION_CONFLICT', 409, 'El registro fue modificado por otra persona'],
    ['TIME_SOURCE_APPROVED_OVERLAP', 409, 'Existe una fuente aprobada con cobertura superpuesta'],
    ['TIME_SOURCE_SEPARATION_OF_DUTIES', 409, 'La persona proponente no puede decidir'],
    ['TIME_SOURCE_PERSON_SOD_CONFLICT', 409, 'La persona acumula responsabilidades incompatibles'],
    ['TIME_SOURCE_CUT_AT_FUTURE', 409, 'La evidencia no puede aprobarse con un corte futuro'],
    ['TENANT_IAM_SOD_CONFLICT', 409, 'La membresía combina responsabilidades incompatibles'],
    ['TIME_SOURCE_TRANSITION_INVALID', 409, 'La transición no está permitida'],
    ['TIME_SOURCE_TRANSITION_SHAPE_INVALID', 409, 'La transición no conserva el contrato gobernado'],
    ['TIME_SOURCE_BINDING_STALE', 409, 'El registro pertenece a un binding certificado anterior'],
    ['TIME_SOURCE_AUDIT_DRIFT', 503, 'La auditoría temporal no conserva su binding certificado'],
    ['TIME_SOURCE_PROPOSER_REQUIRED', 403, 'Sólo la persona proponente puede completar esta acción'],
    ['TIME_SOURCE_PROPOSER_INVALID', 403, 'La persona proponente ya no posee un vínculo válido'],
    ['TIME_SOURCE_APPROVER_INVALID', 403, 'La persona revisora ya no posee un vínculo válido'],
    ['TIME_SOURCE_CAPABILITY_REQUIRED', 403, 'No posee la capacidad requerida'],
    ['TIME_SOURCE_AUTHORITY_REQUIRED', 403, 'La membresía no tiene autoridad operativa'],
    ['TIME_SOURCE_EMPLOYMENT_REQUIRED', 403, 'La membresía no tiene un vínculo laboral vigente'],
    ['TIME_SOURCE_NOT_FOUND', 404, 'Registro temporal no encontrado'],
    ['TIME_SOURCE_COMMAND_INVALID', 400, 'Comando inválido'],
    ['TIME_SOURCE_COMMAND_SHAPE_INVALID', 400, 'Forma de comando inválida'],
    ['TIME_SOURCE_FILTER_INVALID', 400, 'Filtros inválidos'],
    ['TIME_SOURCE_SESSION_BUSY', 409, 'El acceso se está actualizando; reintentá en un momento'],
    ['TIME_SOURCE_SESSION_INVALID', 401, 'La sesión operativa ya no es válida'],
    ['TIME_SOURCE_RELEASE_NOT_CERTIFIED', 503, 'La versión desplegada no está certificada'],
    ['TIME_SOURCE_BINDING_REQUIRED', 503, 'El binding GRH certificado no está disponible'],
  ];
  for (const [code, status, message] of definitions) {
    if (text.includes(code)) return new ActionCenterError(code, status, message);
  }
  return error;
}

function identityCoordinates(identityPrincipal, session) {
  const email = String(identityPrincipal?.user?.email || '').trim().toLowerCase();
  const tenantId = String(identityPrincipal?.tenant?.id || '').trim().toLowerCase();
  const membershipId = String(identityPrincipal?.tenant?.membershipId || '').trim().toLowerCase();
  const sessionId = String(session?.id || '').trim().toLowerCase();
  const sessionVersion = Number(session?.version);
  const releaseSha = String(session?.releaseSha || '').trim().toLowerCase();
  if (!email || identityPrincipal?.tenant?.source !== 'membership'
      || !UUID.test(tenantId) || !UUID.test(membershipId) || !UUID.test(sessionId)
      || !Number.isSafeInteger(sessionVersion) || sessionVersion < 1 || !SHA40.test(releaseSha)
      || String(session?.email || '').trim().toLowerCase() !== email) {
    fail('TIME_SOURCE_SESSION_INVALID', 401, 'La sesión operativa ya no es válida');
  }
  return Object.freeze({ email, tenantId, membershipId, sessionId, sessionVersion, releaseSha });
}

function internalPrincipal(resolved, identityPrincipal) {
  const email = String(identityPrincipal?.user?.email || '').trim().toLowerCase();
  const tenantId = String(identityPrincipal?.tenant?.id || '').trim().toLowerCase();
  const membershipId = String(identityPrincipal?.tenant?.membershipId || '').trim().toLowerCase();
  const certifiedBindingId = String(resolved?.certifiedBindingId || '').trim().toLowerCase();
  const actorPersonId = String(resolved?.actorPersonId || '').trim().toLowerCase();
  if (!resolved || typeof resolved !== 'object'
      || String(resolved.email || '').trim().toLowerCase() !== email
      || String(resolved.tenantId || '').trim().toLowerCase() !== tenantId
      || String(resolved.membershipId || '').trim().toLowerCase() !== membershipId
      || !UUID.test(certifiedBindingId) || !UUID.test(actorPersonId)
      || !Array.isArray(resolved.capabilities)) {
    fail('TIME_SOURCE_AUTHORITY_REQUIRED', 403, 'La autoridad temporal no está disponible');
  }
  const capabilities = new Set(resolved.capabilities.map(String));
  if (!capabilities.has('time.source.read')) {
    fail('TIME_SOURCE_CAPABILITY_REQUIRED', 403, 'No posee autorización de lectura temporal');
  }
  return Object.freeze({ email, tenantId, membershipId, certifiedBindingId, actorPersonId, capabilities });
}

async function facade(sql, functionName, values, casts) {
  try {
    const placeholders = casts.map((cast, index) => `$${index + 1}${cast ? `::${cast}` : ''}`).join(', ');
    const result = await query(sql, `SELECT ${functionName}(${placeholders}) AS result`, values);
    const envelope = result[0]?.result;
    if (!envelope || typeof envelope !== 'object') {
      fail('TIME_SOURCE_UNAVAILABLE', 503, 'Registro temporal no disponible');
    }
    return envelope;
  } catch (error) {
    throw mappedSqlError(error);
  }
}

function publicRecord(record) {
  if (!record || typeof record !== 'object' || !UUID.test(String(record.id || ''))) return null;
  const ownerAuthority = String(record.ownerAuthority || '');
  if (!Object.hasOwn(TIME_SOURCE_OWNER_AUTHORITIES, ownerAuthority)
      || !Object.hasOwn(TIME_SOURCE_DOMAINS, String(record.domain || ''))
      || !FORMATS.includes(String(record.format || ''))
      || !SCHEMA_VERSION.test(String(record.schemaVersion || ''))
      || !SHA64.test(String(record.artifactSha256 || ''))) {
    fail('TIME_SOURCE_CONTRACT_DRIFT', 503, 'Metadatos temporales fuera del contrato');
  }
  const timestamps = record.timestamps && typeof record.timestamps === 'object' ? record.timestamps : {};
  return {
    id: record.id,
    domain: record.domain,
    ownerAuthority,
    format: record.format,
    schemaVersion: record.schemaVersion,
    artifactSha256: record.artifactSha256,
    cutAt: record.cutAt,
    coverageFrom: record.coverageFrom,
    coverageTo: record.coverageTo,
    timezone: record.timezone,
    grain: record.grain,
    identityKeyKind: record.identityKeyKind,
    ...(record.recordCount != null && Number.isSafeInteger(Number(record.recordCount))
      && Number(record.recordCount) >= 0
      ? { recordCount: Number(record.recordCount) } : {}),
    status: record.status,
    governanceStatus: GOVERNANCE_STATUSES.has(record.governanceStatus)
      ? record.governanceStatus : record.status,
    bindingState: record.bindingState === 'current' ? 'current' : 'stale',
    version: Number(record.version),
    reasonCode: record.reasonCode,
    timestamps: {
      createdAt: timestamps.createdAt,
      updatedAt: timestamps.updatedAt,
      submittedAt: timestamps.submittedAt,
      decidedAt: timestamps.decidedAt,
      retiredAt: timestamps.retiredAt,
      cancelledAt: timestamps.cancelledAt,
    },
    evaluationReady: false,
    attendanceReconciled: false,
    payrollCalculated: false,
    payrollPosted: false,
    grhMutation: false,
  };
}

function publicTimeline(timeline) {
  const events = Array.isArray(timeline) ? timeline : [];
  if (events.length > 100) {
    fail('TIME_SOURCE_CONTRACT_DRIFT', 503, 'Timeline temporal fuera del límite');
  }
  return events.map((event) => ({
    command: event?.command,
    expectedVersion: Number(event?.expectedVersion),
    resultingVersion: Number(event?.resultingVersion),
    reasonCode: event?.reasonCode,
    occurredAt: event?.occurredAt,
  }));
}

function normalizeReadiness(value) {
  const requirements = new Map((Array.isArray(value?.requirements) ? value.requirements : [])
    .map((item) => [item?.key, item]));
  const normalized = REQUIRED_READINESS.map((key) => {
    const item = requirements.get(key) || {};
    const administrative = key === 'administrativeEvents';
    const readinessState = administrative
      ? (item.readinessState === 'partial_reference' ? 'partial_reference' : 'missing')
      : (item.readinessState === 'registered_metadata' ? 'registered_metadata' : 'missing');
    const approvedMetadata = item.approvedMetadata === true && readinessState !== 'missing';
    if (approvedMetadata && (!item.metadata || typeof item.metadata !== 'object'
        || !Object.hasOwn(TIME_SOURCE_OWNER_AUTHORITIES, String(item.metadata.ownerAuthority || ''))
        || !FORMATS.includes(String(item.metadata.format || ''))
        || !SCHEMA_VERSION.test(String(item.metadata.schemaVersion || '')))) {
      fail('TIME_SOURCE_CONTRACT_DRIFT', 503, 'Readiness temporal fuera del contrato');
    }
    const metadata = approvedMetadata && item.metadata && typeof item.metadata === 'object'
      ? {
        ownerAuthority: item.metadata.ownerAuthority,
        format: item.metadata.format,
        schemaVersion: item.metadata.schemaVersion,
        cutAt: item.metadata.cutAt,
        coverageFrom: item.metadata.coverageFrom,
        coverageTo: item.metadata.coverageTo,
        timezone: item.metadata.timezone,
        grain: item.metadata.grain,
        ...(item.metadata.recordCount != null && Number.isSafeInteger(Number(item.metadata.recordCount))
          ? { recordCount: Number(item.metadata.recordCount) } : {}),
      } : undefined;
    return {
      key,
      domain: item.domain || Object.entries(TIME_SOURCE_DOMAINS)
        .find(([, definition]) => definition.readinessKey === key)?.[0],
      label: item.label || Object.values(TIME_SOURCE_DOMAINS)
        .find((definition) => definition.readinessKey === key)?.label,
      requiredForCatalog: key !== 'administrativeEvents',
      governanceStatus: GOVERNANCE_STATUSES.has(item.governanceStatus)
        ? item.governanceStatus : 'missing',
      readinessState,
      approvedMetadata,
      ...(metadata ? { metadata } : {}),
    };
  });
  const requiredApproved = normalized.slice(0, 4).every((item) => (
    item.approvedMetadata && item.readinessState === 'registered_metadata'
  ));
  if ([value?.evaluationReady, value?.attendanceReconciled, value?.payrollCalculated,
    value?.payrollPosted, value?.grhMutation].some((flag) => flag === true)) {
    fail('TIME_SOURCE_CONTRACT_DRIFT', 503, 'El motor temporal permanece cerrado');
  }
  return Object.freeze({
    catalogApproved: value?.catalogApproved === true && requiredApproved,
    evaluationReady: false,
    attendanceReconciled: false,
    payrollCalculated: false,
    payrollPosted: false,
    grhMutation: false,
    requirements: Object.freeze(normalized.map(Object.freeze)),
  });
}

function catalogOptions() {
  return {
    domains: TIME_SOURCE_REGISTRY_CONTRACT.domains,
    formats: FORMATS,
    ownerAuthorities: TIME_SOURCE_REGISTRY_CONTRACT.ownerAuthorities,
    timezones: Object.freeze(['America/Argentina/Mendoza']),
    statuses: STATUSES,
    reasonCodes: Object.freeze(Object.entries(REASONS).flatMap(([command, values]) => (
      values.map((key) => Object.freeze({ key, label: REASON_LABELS[key], command }))
    ))),
  };
}

export async function getTimeSourceBootstrap(sql, identityPrincipal, session) {
  const coordinates = identityCoordinates(identityPrincipal, session);
  const envelope = await facade(sql, 'time_source_registry_bootstrap_v1', [
    coordinates.email, coordinates.sessionId, coordinates.sessionVersion,
    coordinates.releaseSha, coordinates.tenantId, coordinates.membershipId,
  ], ['', 'uuid', 'integer', '', 'uuid', 'uuid']);
  const principal = internalPrincipal(envelope.principal, identityPrincipal);
  const readiness = normalizeReadiness(envelope.readiness || {});
  const allowed = Array.isArray(envelope.allowedCommands) ? envelope.allowedCommands : [];
  return {
    principal,
    contract: TIME_SOURCE_REGISTRY_CONTRACT,
    feature: {
      governanceStatus: 'metadata_intake',
      canPropose: principal.capabilities.has('time.source.propose'),
      canApprove: principal.capabilities.has('time.source.approve'),
      canAudit: principal.capabilities.has('time.source.audit.read'),
      catalogApproved: readiness.catalogApproved,
      evaluationReady: false,
      attendanceReconciled: false,
      payrollCalculated: false,
      payrollPosted: false,
      grhMutation: false,
    },
    readiness: readiness.requirements,
    options: catalogOptions(),
    allowedCommands: allowed.filter((command) => command === 'create_draft'),
  };
}

export async function listTimeSources(sql, identityPrincipal, options, session) {
  const page = canonicalPage(options?.page, 'page', 1, 200);
  const limit = canonicalPage(options?.limit, 'limit', 20, 50);
  const domain = options?.domain == null || options.domain === '' ? null
    : String(options.domain).trim().toLowerCase();
  const status = options?.status == null || options.status === '' ? null
    : String(options.status).trim().toLowerCase();
  if ((domain && !TIME_SOURCE_DOMAINS[domain]) || (status && !STATUSES.includes(status))) {
    fail('TIME_SOURCE_FILTER_INVALID', 400, 'Filtro no permitido');
  }
  const coordinates = identityCoordinates(identityPrincipal, session);
  const envelope = await facade(sql, 'time_source_registry_list_v1', [
    coordinates.email, coordinates.sessionId, coordinates.sessionVersion,
    coordinates.releaseSha, coordinates.tenantId, coordinates.membershipId,
    domain, status, page, limit,
  ], ['', 'uuid', 'integer', '', 'uuid', 'uuid', '', '', 'integer', 'integer']);
  const principal = internalPrincipal(envelope.principal, identityPrincipal);
  const data = (Array.isArray(envelope.records) ? envelope.records : [])
    .map(publicRecord).filter(Boolean);
  const total = Number(envelope.total || 0);
  return { principal, data, pagination: {
    mode: 'page', page, limit, total, pages: Math.ceil(total / limit),
  } };
}

export async function readTimeSource(sql, identityPrincipal, contractId, session) {
  const id = requiredUuid(contractId, 'contractId');
  const coordinates = identityCoordinates(identityPrincipal, session);
  const envelope = await facade(sql, 'time_source_registry_detail_v1', [
    coordinates.email, coordinates.sessionId, coordinates.sessionVersion,
    coordinates.releaseSha, coordinates.tenantId, coordinates.membershipId, id,
  ], ['', 'uuid', 'integer', '', 'uuid', 'uuid', 'uuid']);
  const principal = internalPrincipal(envelope.principal, identityPrincipal);
  const data = publicRecord(envelope.record);
  if (!data) fail('TIME_SOURCE_NOT_FOUND', 404, 'Registro temporal no encontrado');
  const commandAllowlist = new Set(['update_draft', 'submit', 'approve', 'reject', 'retire', 'cancel']);
  return {
    principal,
    data,
    timeline: publicTimeline(envelope.timeline),
    timelineTruncated: envelope.timelineTruncated === true,
    timelineLimit: 100,
    auditAvailable: envelope.auditAvailable === true,
    allowedCommands: (Array.isArray(envelope.allowedCommands) ? envelope.allowedCommands : [])
      .filter((command) => commandAllowlist.has(command)),
  };
}

export async function applyTimeSourceCommand(
  sql, identityPrincipal, session, body, idempotencyKey,
) {
  const normalized = normalizeTimeSourceCommand(body);
  const bootstrap = await getTimeSourceBootstrap(sql, identityPrincipal, session);
  const principal = bootstrap.principal;
  const required = PROPOSE_COMMANDS.has(normalized.command)
    ? 'time.source.propose' : 'time.source.approve';
  if (!principal.capabilities.has(required)) {
    fail('TIME_SOURCE_CAPABILITY_REQUIRED', 403, 'No posee la capacidad requerida');
  }
  const coordinates = identityCoordinates(identityPrincipal, session);
  const key = normalizeIdempotencyKey(idempotencyKey);
  const hash = commandHash({
    tenantId: principal.tenantId,
    membershipId: principal.membershipId,
    certifiedBindingId: principal.certifiedBindingId,
    actorPersonId: principal.actorPersonId,
    actorSessionId: coordinates.sessionId,
    actorSessionVersion: coordinates.sessionVersion,
    releaseSha: coordinates.releaseSha,
    caseType: TIME_SOURCE_CASE_TYPE,
    command: normalized.command,
    contractId: normalized.contractId,
    expectedVersion: normalized.expectedVersion,
    metadata: normalized.metadata,
    reasonCode: normalized.reasonCode,
    reasonHash: normalized.reasonHash,
  });
  try {
    const result = await query(sql, `
      SELECT time_source_registry_apply_command_v1(
        $1, $2::uuid, $3, $4, $5::uuid, $6::uuid, $7, $8::uuid,
        $9, $10::uuid, $11, $12::jsonb, $13, $14
      ) AS result
    `, [
      coordinates.email, coordinates.sessionId, coordinates.sessionVersion,
      coordinates.releaseSha, coordinates.tenantId, coordinates.membershipId,
      normalized.command, normalized.contractId, normalized.expectedVersion,
      key, hash, normalized.metadata ? JSON.stringify(normalized.metadata) : null,
      normalized.reasonCode, normalized.reasonHash,
    ]);
    const envelope = result[0]?.result;
    if (!envelope || typeof envelope !== 'object') {
      fail('TIME_SOURCE_UNAVAILABLE', 503, 'Registro temporal no disponible');
    }
    const data = publicRecord(envelope.data);
    if (!data) fail('TIME_SOURCE_UNAVAILABLE', 503, 'Recibo temporal inválido');
    return {
      data,
      replayed: envelope.replayed === true,
      historical: envelope.historical === true,
    };
  } catch (error) {
    throw mappedSqlError(error);
  }
}
