import { createHash } from 'node:crypto';

export const INTERNAL_ADMIN_RESOURCES = Object.freeze(['bootstrap', 'tenants', 'users', 'roles', 'audit']);
export const INTERNAL_ADMIN_COMMANDS = Object.freeze([
  'create_tenant', 'invite_user', 'update_access',
  'suspend_membership', 'assign_exclusive_capability',
]);

const COMMAND_PAYLOAD_KEYS = Object.freeze({
  create_tenant: Object.freeze(['slug', 'legalName', 'shortName', 'kind', 'jurisdiction']),
  invite_user: Object.freeze(['tenantId', 'email', 'displayName', 'roleKey']),
  update_access: Object.freeze([
    'membershipId', 'roleKey', 'allowCapabilities', 'denyCapabilities', 'reason',
  ]),
  suspend_membership: Object.freeze(['membershipId']),
  assign_exclusive_capability: Object.freeze(['membershipId', 'capabilityKey']),
});

const VERSIONED_COMMANDS = new Set([
  'update_access', 'suspend_membership', 'assign_exclusive_capability',
]);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
    }
  }

  const expectedVersion = body.expectedVersion == null ? null : Number(body.expectedVersion);
  if (VERSIONED_COMMANDS.has(command)) {
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
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

export async function getInternalAdminView(sql, actorEmail, resource = 'bootstrap', limit = 100) {
  if (!sql || typeof sql.query !== 'function') throw new TypeError('conexion SQL requerida');
  const normalizedResource = String(resource || 'bootstrap').trim().toLowerCase();
  if (!INTERNAL_ADMIN_RESOURCES.includes(normalizedResource)) {
    fail('INTERNAL_ADMIN_RESOURCE_INVALID', 400, 'Recurso no soportado');
  }
  const safeLimit = Number(limit);
  if (!Number.isSafeInteger(safeLimit) || safeLimit < 1 || safeLimit > 200) {
    fail('INTERNAL_ADMIN_LIMIT_INVALID', 400, 'limit debe estar entre 1 y 200');
  }
  const result = await sql.query(
    'SELECT tenant_iam_admin_view($1, $2, $3) AS result',
    [String(actorEmail || '').trim().toLowerCase(), normalizedResource, safeLimit],
  );
  return resultRows(result)[0]?.result || {};
}

export async function applyInternalAdminCommand(sql, actorEmail, command) {
  if (!sql || typeof sql.query !== 'function') throw new TypeError('conexion SQL requerida');
  const result = await sql.query(`
    SELECT tenant_iam_apply_command($1, $2, $3::uuid, $4, $5, $6::jsonb) AS result
  `, [
    String(actorEmail || '').trim().toLowerCase(), command.command,
    command.idempotencyKey, command.commandHash, command.expectedVersion,
    JSON.stringify(command.payload),
  ]);
  return resultRows(result)[0]?.result || {};
}

export function internalAdminDatabaseError(error) {
  const message = String(error?.message || '');
  const mappings = [
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
  ];
  const match = mappings.find(([needle]) => message.includes(needle));
  return match ? new InternalAdminError(match[2], match[1], match[3]) : null;
}
