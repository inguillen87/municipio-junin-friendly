import { createHash } from 'node:crypto';

export const INTERNAL_ADMIN_RESOURCES = Object.freeze([
  'bootstrap', 'tenants', 'users', 'roles', 'audit', 'platform_owners',
]);
export const INTERNAL_ADMIN_COMMANDS = Object.freeze([
  'create_tenant', 'invite_user', 'update_access',
  'suspend_membership', 'assign_exclusive_capability',
  'lookup_employment', 'link_employment', 'revoke_employment_link',
  'replace_action_scopes',
  'request_platform_owner_grant', 'request_platform_owner_revoke',
  'approve_platform_owner_change', 'reject_platform_owner_change',
]);

const COMMAND_PAYLOAD_KEYS = Object.freeze({
  create_tenant: Object.freeze(['slug', 'legalName', 'shortName', 'kind', 'jurisdiction']),
  invite_user: Object.freeze(['tenantId', 'email', 'displayName', 'roleKey']),
  update_access: Object.freeze([
    'membershipId', 'roleKey', 'allowCapabilities', 'denyCapabilities', 'reason',
  ]),
  suspend_membership: Object.freeze(['membershipId']),
  assign_exclusive_capability: Object.freeze(['membershipId', 'capabilityKey']),
  lookup_employment: Object.freeze(['tenantId', 'membershipId', 'query', 'limit']),
  link_employment: Object.freeze([
    'membershipId', 'employmentContractId', 'sourceBindingId', 'reasonCode', 'reason',
  ]),
  revoke_employment_link: Object.freeze(['membershipId', 'reasonCode', 'reason']),
  replace_action_scopes: Object.freeze(['membershipId', 'scopes', 'reasonCode', 'reason']),
  request_platform_owner_grant: Object.freeze(['targetEmail', 'reason']),
  request_platform_owner_revoke: Object.freeze(['targetEmail', 'reason']),
  approve_platform_owner_change: Object.freeze(['requestId', 'reason']),
  reject_platform_owner_change: Object.freeze(['requestId', 'reason']),
});

const VERSIONED_COMMANDS = new Set([
  'update_access', 'suspend_membership', 'assign_exclusive_capability',
  'link_employment', 'revoke_employment_link', 'replace_action_scopes',
  'request_platform_owner_grant', 'request_platform_owner_revoke',
  'approve_platform_owner_change', 'reject_platform_owner_change',
]);
const PLATFORM_OWNER_GOVERNANCE_COMMANDS = new Set([
  'request_platform_owner_grant', 'request_platform_owner_revoke',
  'approve_platform_owner_change', 'reject_platform_owner_change',
]);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORBIDDEN_SECRET_KEY = /(?:password|passwd|secret|token|credential|api[_-]?key|authorization)/i;

export class InternalAdminError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = 'InternalAdminError';
    this.code = code;
    this.status = status;
  }
}

function fail(code, status, message) {
  throw new InternalAdminError(code, status, message);
}

function resultRows(result) {
  return Array.isArray(result) ? result : (Array.isArray(result?.rows) ? result.rows : []);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function assertNoSecretKeys(value, path = 'payload') {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSecretKeys(entry, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_SECRET_KEY.test(key)) {
      fail('INTERNAL_ADMIN_SECRET_FORBIDDEN', 422, `Campo secreto no permitido en ${path}`);
    }
    assertNoSecretKeys(child, `${path}.${key}`);
  }
}

function exactObject(value, allowedKeys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('INTERNAL_ADMIN_PAYLOAD_INVALID', 400, `${label} debe ser un objeto`);
  }
  const allowed = new Set(allowedKeys);
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected) fail('INTERNAL_ADMIN_FIELD_UNSUPPORTED', 400, `Campo no soportado: ${unexpected}`);
}

function requiredString(value, name, maximum) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > maximum) {
    fail('INTERNAL_ADMIN_PAYLOAD_INVALID', 422, `${name} es obligatorio`);
  }
  return text;
}

function uuid(value, name) {
  const text = requiredString(value, name, 64).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(text)) {
    fail('INTERNAL_ADMIN_PAYLOAD_INVALID', 422, `${name} es inválido`);
  }
  return text;
}

function stringList(value, name) {
  if (!Array.isArray(value) || value.length > 100 || value.some((item) => typeof item !== 'string')) {
    fail('INTERNAL_ADMIN_PAYLOAD_INVALID', 422, `${name} debe ser una lista de capacidades`);
  }
  const normalized = value.map((item) => item.trim());
  if (normalized.some((item) => !/^[a-z][a-z0-9_.]{2,95}$/.test(item))) {
    fail('INTERNAL_ADMIN_PAYLOAD_INVALID', 422, `${name} contiene una capacidad inválida`);
  }
  return [...new Set(normalized)].sort();
}

function provisioningReason(payload) {
  payload.reasonCode = requiredString(payload.reasonCode, 'reasonCode', 32);
  if (!['onboarding', 'role_change', 'employment_change', 'scope_change', 'offboarding', 'correction']
    .includes(payload.reasonCode)) {
    fail('INTERNAL_ADMIN_REASON_INVALID', 422, 'reasonCode no pertenece al catalogo gobernado');
  }
  payload.reason = requiredString(payload.reason, 'reason', 500);
  if (payload.reason.length < 3) {
    fail('INTERNAL_ADMIN_REASON_INVALID', 422, 'reason debe tener al menos 3 caracteres');
  }
}

function normalizeActionScopes(value) {
  if (!Array.isArray(value) || value.length > 50) {
    fail('INTERNAL_ADMIN_SCOPE_INVALID', 422, 'scopes debe contener hasta 50 alcances');
  }
  const seen = new Set();
  return value.map((entry) => {
    exactObject(entry, [
      'capabilityKey', 'sourceBindingId', 'scopeLevel',
      'organizationUnitSourceId', 'sectorSourceId',
    ], 'scope');
    const capabilityKey = requiredString(entry.capabilityKey, 'capabilityKey', 96);
    if (!/^leave\.request\.area\.[a-z][a-z0-9_.]{1,63}$/.test(capabilityKey)) {
      fail('INTERNAL_ADMIN_SCOPE_INVALID', 422, 'capabilityKey no es operativa por area');
    }
    const sourceBindingId = uuid(entry.sourceBindingId, 'sourceBindingId');
    const scopeLevel = requiredString(entry.scopeLevel, 'scopeLevel', 16);
    const organizationUnitSourceId = entry.organizationUnitSourceId == null
      ? null : requiredString(entry.organizationUnitSourceId, 'organizationUnitSourceId', 128);
    const sectorSourceId = entry.sectorSourceId == null
      ? null : requiredString(entry.sectorSourceId, 'sectorSourceId', 128);
    if (!['company', 'organization', 'sector'].includes(scopeLevel)
      || (scopeLevel === 'company' && (organizationUnitSourceId || sectorSourceId))
      || (scopeLevel === 'organization' && (!organizationUnitSourceId || sectorSourceId))
      || (scopeLevel === 'sector' && (!organizationUnitSourceId || !sectorSourceId))) {
      fail('INTERNAL_ADMIN_SCOPE_INVALID', 422, 'Forma de alcance invalida');
    }
    const normalized = {
      capabilityKey, sourceBindingId, scopeLevel,
      ...(organizationUnitSourceId ? { organizationUnitSourceId } : {}),
      ...(sectorSourceId ? { sectorSourceId } : {}),
    };
    const identity = stableJson(normalized);
    if (seen.has(identity)) fail('INTERNAL_ADMIN_SCOPE_INVALID', 422, 'Alcance duplicado');
    seen.add(identity);
    return normalized;
  });
}

export function normalizeInternalAdminCommand(body, idempotencyKey) {
  exactObject(body, ['command', 'expectedVersion', 'payload'], 'solicitud');
  const command = requiredString(body.command, 'command', 64);
  if (!INTERNAL_ADMIN_COMMANDS.includes(command)) {
    fail('INTERNAL_ADMIN_COMMAND_INVALID', 400, 'Comando no permitido');
  }
  if (!UUID_V4.test(String(idempotencyKey || ''))) {
    fail('INTERNAL_ADMIN_IDEMPOTENCY_REQUIRED', 428, 'Idempotency-Key UUIDv4 es obligatorio');
  }
  exactObject(body.payload, COMMAND_PAYLOAD_KEYS[command], 'payload');
  assertNoSecretKeys(body.payload);
  const payload = { ...body.payload };

  if (command === 'create_tenant') {
    payload.slug = requiredString(payload.slug, 'slug', 80).toLowerCase();
    payload.legalName = requiredString(payload.legalName, 'legalName', 255);
    payload.shortName = requiredString(payload.shortName, 'shortName', 120);
    payload.kind = requiredString(payload.kind, 'kind', 24);
    payload.jurisdiction = requiredString(payload.jurisdiction, 'jurisdiction', 160);
  } else if (command === 'invite_user') {
    payload.tenantId = uuid(payload.tenantId, 'tenantId');
    payload.email = requiredString(payload.email, 'email', 254).toLowerCase();
    payload.displayName = requiredString(payload.displayName, 'displayName', 160);
    payload.roleKey = requiredString(payload.roleKey, 'roleKey', 64);
    if (!/^[^\s@]+@[^\s@]+$/.test(payload.email)) {
      fail('INTERNAL_ADMIN_PAYLOAD_INVALID', 422, 'email inválido');
    }
  } else if (command === 'lookup_employment') {
    payload.tenantId = uuid(payload.tenantId, 'tenantId');
    payload.membershipId = uuid(payload.membershipId, 'membershipId');
    payload.query = requiredString(payload.query, 'query', 80);
    if (payload.query.length < 3) fail('INTERNAL_ADMIN_LOOKUP_INVALID', 422, 'query requiere al menos 3 caracteres');
    payload.limit = Number(payload.limit);
    if (!Number.isSafeInteger(payload.limit) || payload.limit < 1 || payload.limit > 20) {
      fail('INTERNAL_ADMIN_LOOKUP_INVALID', 422, 'limit debe estar entre 1 y 20');
    }
  } else if (PLATFORM_OWNER_GOVERNANCE_COMMANDS.has(command)) {
    payload.reason = requiredString(payload.reason, 'reason', 500);
    if (payload.reason.length < 3) {
      fail('INTERNAL_ADMIN_REASON_INVALID', 422, 'reason debe tener al menos 3 caracteres');
    }
    if (command.startsWith('request_platform_owner_')) {
      payload.targetEmail = requiredString(payload.targetEmail, 'targetEmail', 254).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+$/.test(payload.targetEmail)) {
        fail('INTERNAL_ADMIN_PAYLOAD_INVALID', 422, 'targetEmail inválido');
      }
    } else {
      payload.requestId = uuid(payload.requestId, 'requestId');
    }
  } else {
    payload.membershipId = uuid(payload.membershipId, 'membershipId');
    if (command === 'update_access') {
      payload.roleKey = requiredString(payload.roleKey, 'roleKey', 64);
      payload.allowCapabilities = stringList(payload.allowCapabilities, 'allowCapabilities');
      payload.denyCapabilities = stringList(payload.denyCapabilities, 'denyCapabilities');
      payload.reason = requiredString(payload.reason, 'reason', 500);
      if (payload.allowCapabilities.some((key) => payload.denyCapabilities.includes(key))) {
        fail('INTERNAL_ADMIN_OVERRIDE_AMBIGUOUS', 422, 'Una capacidad no puede permitirse y denegarse a la vez');
      }
    } else if (command === 'assign_exclusive_capability') {
      payload.capabilityKey = requiredString(payload.capabilityKey, 'capabilityKey', 96);
      if (payload.capabilityKey !== 'time.overtime.enter') {
        fail('INTERNAL_ADMIN_CAPABILITY_INVALID', 422, 'La responsabilidad exclusiva disponible es time.overtime.enter');
      }
    } else if (command === 'link_employment') {
      payload.employmentContractId = uuid(payload.employmentContractId, 'employmentContractId');
      payload.sourceBindingId = uuid(payload.sourceBindingId, 'sourceBindingId');
      provisioningReason(payload);
    } else if (command === 'revoke_employment_link') {
      provisioningReason(payload);
    } else if (command === 'replace_action_scopes') {
      payload.scopes = normalizeActionScopes(payload.scopes);
      provisioningReason(payload);
    }
  }

  const expectedVersion = body.expectedVersion == null ? null : Number(body.expectedVersion);
  if (VERSIONED_COMMANDS.has(command)) {
    const minimumVersion = command === 'request_platform_owner_grant' ? 0 : 1;
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < minimumVersion) {
      fail('INTERNAL_ADMIN_VERSION_REQUIRED', 428, 'expectedVersion es obligatorio');
    }
  } else if (expectedVersion !== null) {
    fail('INTERNAL_ADMIN_VERSION_UNSUPPORTED', 400, 'expectedVersion no corresponde a este comando');
  }
  const commandHash = createHash('sha256')
    .update(stableJson({ command, expectedVersion, payload }))
    .digest('hex');
  return Object.freeze({
    command, expectedVersion, payload: Object.freeze(payload),
    idempotencyKey: String(idempotencyKey).toLowerCase(), commandHash,
  });
}

function managedPlatformSession(session) {
  const email = String(session?.email || '').trim().toLowerCase();
  const id = String(session?.id || '').trim().toLowerCase();
  const version = Number(session?.version);
  if (!email || !UUID.test(id) || !Number.isSafeInteger(version) || version < 1) {
    fail('INTERNAL_ADMIN_SESSION_INVALID', 401, 'La sesión de plataforma ya no es válida');
  }
  return Object.freeze({ email, id, version });
}

export async function getInternalAdminView(sql, session, resource = 'bootstrap', limit = 100, options = {}) {
  if (!sql || typeof sql.query !== 'function') throw new TypeError('conexion SQL requerida');
  const actor = managedPlatformSession(session);
  const normalizedResource = String(resource || 'bootstrap').trim().toLowerCase();
  if (!INTERNAL_ADMIN_RESOURCES.includes(normalizedResource)) {
    fail('INTERNAL_ADMIN_RESOURCE_INVALID', 400, 'Recurso no soportado');
  }
  const safeLimit = Number(limit);
  if (!Number.isSafeInteger(safeLimit) || safeLimit < 1 || safeLimit > 200) {
    fail('INTERNAL_ADMIN_LIMIT_INVALID', 400, 'limit debe estar entre 1 y 200');
  }
  const tenantId = options.tenantId ? uuid(options.tenantId, 'tenantId') : null;
  const releaseSha = requiredString(options.releaseSha, 'releaseSha', 40).toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(releaseSha)) {
    fail('INTERNAL_ADMIN_RELEASE_NOT_CERTIFIED', 503, 'La version activa no esta certificada');
  }
  if (normalizedResource === 'platform_owners') {
    const governance = await sql.query(`
      SELECT platform_owner_governance_view_v1(
        $1, $2::uuid, $3, $4, $5
      ) AS result
    `, [actor.email, actor.id, actor.version, releaseSha, safeLimit]);
    return resultRows(governance)[0]?.result || {};
  }
  const result = await sql.query(`
    SELECT tenant_iam_admin_view_v3($1, $2::uuid, $3, $4, $5, $6::uuid, $7) AS result
  `, [actor.email, actor.id, actor.version, releaseSha, normalizedResource, tenantId, safeLimit]);
  return resultRows(result)[0]?.result || {};
}

export async function applyInternalAdminCommand(sql, session, command, options = {}) {
  if (!sql || typeof sql.query !== 'function') throw new TypeError('conexion SQL requerida');
  const actor = managedPlatformSession(session);
  if (PLATFORM_OWNER_GOVERNANCE_COMMANDS.has(command.command)) {
    const releaseSha = requiredString(options.releaseSha, 'releaseSha', 40).toLowerCase();
    if (!/^[a-f0-9]{40}$/.test(releaseSha)) {
      fail('INTERNAL_ADMIN_RELEASE_NOT_CERTIFIED', 503, 'La version activa no esta certificada');
    }
    const releaseBoundHash = createHash('sha256').update(stableJson({
      command: command.command,
      expectedVersion: command.expectedVersion,
      payload: command.payload,
      actorSessionId: actor.id,
      actorSessionVersion: actor.version,
      releaseSha,
    })).digest('hex');
    const governance = await sql.query(`
      SELECT platform_owner_governance_apply_v1(
        $1, $2::uuid, $3, $4, $5, $6::uuid, $7, $8, $9::jsonb
      ) AS result
    `, [actor.email, actor.id, actor.version, releaseSha, command.command,
      command.idempotencyKey, releaseBoundHash, command.expectedVersion,
      JSON.stringify(command.payload)]);
    return resultRows(governance)[0]?.result || {};
  }
  if (['lookup_employment', 'link_employment', 'revoke_employment_link', 'replace_action_scopes']
    .includes(command.command)) {
    const releaseSha = requiredString(options.releaseSha, 'releaseSha', 40).toLowerCase();
    if (!/^[a-f0-9]{40}$/.test(releaseSha)) {
      fail('INTERNAL_ADMIN_RELEASE_NOT_CERTIFIED', 503, 'La version activa no esta certificada');
    }
    if (command.command === 'lookup_employment') {
      const lookup = await sql.query(`
        SELECT tenant_action_lookup_employment_v2(
          $1, $2::uuid, $3, $4, $5::uuid, $6, $7
        ) AS result
      `, [actor.email, actor.id, actor.version, releaseSha, command.payload.membershipId,
        command.payload.query, command.payload.limit]);
      const value = resultRows(lookup)[0]?.result || {};
      if (String(value.tenantId || '').toLowerCase() !== command.payload.tenantId) {
        fail('INTERNAL_ADMIN_NOT_FOUND', 404, 'Membresia no encontrada');
      }
      return value;
    }
    const releaseBoundHash = createHash('sha256').update(stableJson({
      command: command.command, expectedVersion: command.expectedVersion,
      payload: command.payload,
      actorSessionId: actor.id,
      actorSessionVersion: actor.version,
      releaseSha,
    })).digest('hex');
    const provisioningPayload = { ...command.payload };
    delete provisioningPayload.membershipId;
    const provisioning = await sql.query(`
      SELECT tenant_action_apply_provisioning_command_v2(
        $1, $2::uuid, $3, $4, $5::uuid, $6, $7::uuid, $8, $9, $10::jsonb
      ) AS result
    `, [actor.email, actor.id, actor.version, releaseSha, command.payload.membershipId,
      command.command, command.idempotencyKey, releaseBoundHash,
      command.expectedVersion, JSON.stringify(provisioningPayload)]);
    return resultRows(provisioning)[0]?.result || {};
  }
  const result = await sql.query(`
    SELECT tenant_iam_apply_command_v2(
      $1, $2::uuid, $3, $4, $5::uuid, $6, $7, $8::jsonb
    ) AS result
  `, [actor.email, actor.id, actor.version, command.command,
    command.idempotencyKey, command.commandHash, command.expectedVersion,
    JSON.stringify(command.payload)]);
  return resultRows(result)[0]?.result || {};
}

export function internalAdminDatabaseError(error) {
  const message = String(error?.message || '');
  const mappings = [
    ['TENANT_IAM_SESSION_INVALID', 401, 'INTERNAL_ADMIN_SESSION_INVALID', 'La sesión de plataforma ya no es válida'],
    ['TENANT_IAM_NOT_AUTHORIZED', 403, 'INTERNAL_ADMIN_FORBIDDEN', 'No autorizado para administrar la plataforma'],
    ['TENANT_IAM_VERSION_CONFLICT', 409, 'INTERNAL_ADMIN_VERSION_CONFLICT', 'El registro cambió; actualizá y reintentá'],
    ['TENANT_IAM_IDEMPOTENCY_KEY_REUSED', 409, 'INTERNAL_ADMIN_IDEMPOTENCY_REUSED', 'Idempotency-Key reutilizada'],
    ['TENANT_IAM_SOD_CONFLICT', 409, 'INTERNAL_ADMIN_SOD_CONFLICT', 'La combinación viola segregación de funciones'],
    ['TENANT_IAM_EXCLUSIVE_CONFLICT', 409, 'INTERNAL_ADMIN_EXCLUSIVE_CONFLICT', 'Ya existe otro responsable exclusivo'],
    ['tenant_exclusive_capability_active_uk', 409, 'INTERNAL_ADMIN_EXCLUSIVE_CONFLICT', 'Ya existe otro responsable exclusivo'],
    ['TENANT_IAM_USER_ALREADY_EXISTS', 409, 'INTERNAL_ADMIN_USER_EXISTS', 'La cuenta ya existe; la reactivación requiere otro flujo'],
    ['internal_users_email_lower_uk', 409, 'INTERNAL_ADMIN_USER_EXISTS', 'La cuenta ya existe; la reactivación requiere otro flujo'],
    ['platform_tenant_slug_lower_uk', 409, 'INTERNAL_ADMIN_TENANT_EXISTS', 'Ya existe un tenant con ese identificador'],
    ['TENANT_IAM_MEMBERSHIP_NOT_ACTIVE', 409, 'INTERNAL_ADMIN_MEMBERSHIP_INACTIVE', 'La membresía todavía no está activa'],
    ['TENANT_IAM_MEMBERSHIP_NOT_FOUND', 404, 'INTERNAL_ADMIN_NOT_FOUND', 'Membresía no encontrada'],
    ['TENANT_IAM_TENANT_NOT_FOUND', 404, 'INTERNAL_ADMIN_NOT_FOUND', 'Tenant no encontrado'],
    ['TENANT_ACTION_EMPLOYMENT_ALREADY_LINKED', 409, 'INTERNAL_ADMIN_EMPLOYMENT_CONFLICT', 'El legajo ya tiene un vinculo activo en este municipio'],
    ['tenant_action_employment_active_contract_uk', 409, 'INTERNAL_ADMIN_EMPLOYMENT_CONFLICT', 'El legajo ya tiene un vinculo activo en este municipio'],
    ['TENANT_ACTION_EMPLOYMENT_LINK_NOT_FOUND', 404, 'INTERNAL_ADMIN_EMPLOYMENT_NOT_FOUND', 'No existe un vinculo laboral activo'],
    ['TENANT_ACTION_MEMBERSHIP_NOT_ACTIVE', 409, 'INTERNAL_ADMIN_MEMBERSHIP_INACTIVE', 'La membresia debe estar activa para esta operacion'],
    ['TENANT_ACTION_VERSION_CONFLICT', 409, 'INTERNAL_ADMIN_VERSION_CONFLICT', 'La autoridad operativa cambio; actualiza y reintenta'],
    ['TENANT_ACTION_IDEMPOTENCY_KEY_REUSED', 409, 'INTERNAL_ADMIN_IDEMPOTENCY_REUSED', 'Idempotency-Key reutilizada'],
    ['TENANT_ACTION_SOURCE_BINDING_REQUIRED', 409, 'INTERNAL_ADMIN_SOURCE_NOT_READY', 'El binding GRH certificado no esta disponible'],
    ['TENANT_ACTION_EMPLOYMENT_INVALID', 422, 'INTERNAL_ADMIN_EMPLOYMENT_INVALID', 'El vinculo laboral solicitado no es valido'],
    ['TENANT_ACTION_REASON_REQUIRED', 422, 'INTERNAL_ADMIN_REASON_INVALID', 'El motivo gobernado no es valido'],
    ['TENANT_ACTION_PROVISIONING_INVALID', 422, 'INTERNAL_ADMIN_PAYLOAD_INVALID', 'La operacion de provisioning no es valida'],
    ['TENANT_ACTION_LOOKUP_INVALID', 422, 'INTERNAL_ADMIN_LOOKUP_INVALID', 'La busqueda laboral no es valida'],
    ['TENANT_ACTION_SCOPE_INVALID', 422, 'INTERNAL_ADMIN_SCOPE_INVALID', 'El alcance operativo no es valido'],
    ['TENANT_LIFECYCLE_PLATFORM_CAPABILITY_REQUIRED', 403, 'INTERNAL_ADMIN_FORBIDDEN', 'No autorizado para esta operacion'],
    ['PLATFORM_OWNER_LAST_ACTIVE', 409, 'INTERNAL_ADMIN_LAST_OWNER', 'No se puede revocar el último propietario activo'],
    ['PLATFORM_OWNER_MAKER_CHECKER_REQUIRED', 409, 'INTERNAL_ADMIN_MAKER_CHECKER_REQUIRED', 'Otra persona propietaria debe decidir la solicitud'],
    ['PLATFORM_OWNER_SELF_REVOKE_FORBIDDEN', 409, 'INTERNAL_ADMIN_SELF_REVOKE_FORBIDDEN', 'No podés aprobar la revocación de tu propio rol global'],
    ['PLATFORM_OWNER_TARGET_REQUEST_REQUIRED', 409, 'INTERNAL_ADMIN_TARGET_REQUEST_REQUIRED', 'Con dos propietarios, la persona objetivo debe solicitar su propia baja para que la otra la apruebe'],
    ['PLATFORM_OWNER_VERSION_CONFLICT', 409, 'INTERNAL_ADMIN_VERSION_CONFLICT', 'La asignación global cambió; actualizá y reintentá'],
    ['PLATFORM_OWNER_ALREADY_ACTIVE', 409, 'INTERNAL_ADMIN_OWNER_EXISTS', 'La persona ya es propietaria activa'],
    ['PLATFORM_OWNER_NOT_ACTIVE', 409, 'INTERNAL_ADMIN_OWNER_NOT_ACTIVE', 'La asignación global ya no está activa'],
    ['platform_role_change_request_pending_uk', 409, 'INTERNAL_ADMIN_OWNER_REQUEST_PENDING', 'Ya existe una solicitud pendiente para esta persona'],
    ['PLATFORM_OWNER_REQUEST_NOT_PENDING', 409, 'INTERNAL_ADMIN_OWNER_REQUEST_CLOSED', 'La solicitud ya fue decidida'],
    ['PLATFORM_OWNER_REQUEST_NOT_FOUND', 404, 'INTERNAL_ADMIN_NOT_FOUND', 'Solicitud global no encontrada'],
    ['PLATFORM_OWNER_TARGET_NOT_ACTIVE', 409, 'INTERNAL_ADMIN_OWNER_TARGET_INACTIVE', 'La cuenta objetivo debe estar activa'],
    ['PLATFORM_OWNER_TARGET_MFA_REQUIRED', 409, 'INTERNAL_ADMIN_OWNER_MFA_REQUIRED', 'La cuenta objetivo debe tener MFA activo'],
    ['PLATFORM_OWNER_COMMAND_INVALID', 422, 'INTERNAL_ADMIN_PAYLOAD_INVALID', 'La solicitud de gobierno global no es válida'],
    ['TENANT_IAM_RELEASE_REQUIRED', 503, 'INTERNAL_ADMIN_RELEASE_NOT_CERTIFIED', 'La version activa no esta certificada'],
  ];
  const match = mappings.find(([needle]) => message.includes(needle));
  return match ? new InternalAdminError(match[2], match[1], match[3]) : null;
}
