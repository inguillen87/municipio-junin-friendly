import { isDeliverableEmail } from './internal-email.js';

const ENABLED_ENV = 'IDENTITY_TEMPORARY_SHARED_INBOX_ENABLED';
const CONFIG_ENV = 'IDENTITY_TEMPORARY_SHARED_INBOX_CONFIG';
const MAX_CONFIG_BYTES = 12_000;
const MAX_ROUTES = 20;
const MAX_WINDOW_MS = 7 * 24 * 60 * 60_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RFC3339_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/;
const SAFE_LABEL = /^[^\u0000-\u001f\u007f]{2,80}$/;

export class TemporaryEmailRoutingError extends Error {
  constructor(reason = 'CONFIGURATION_INVALID') {
    super('La ruta temporal de correo no es valida');
    this.name = 'TemporaryEmailRoutingError';
    this.reason = reason;
  }
}

function invalid(reason = 'CONFIGURATION_INVALID') {
  throw new TemporaryEmailRoutingError(reason);
}

function exactObject(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) invalid();
  return value;
}

function normalizedEmail(value) {
  if (typeof value !== 'string' || value !== value.trim() || !isDeliverableEmail(value)) invalid();
  return value.toLowerCase();
}

function label(value) {
  if (typeof value !== 'string' || value !== value.trim() || !SAFE_LABEL.test(value)) invalid();
  return value;
}

function rfc3339Instant(value) {
  const match = typeof value === 'string' ? RFC3339_INSTANT.exec(value) : null;
  if (!match) invalid();
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const milliseconds = Number((match[7] || '').padEnd(3, '0').slice(0, 3));
  const offsetHours = Number(match[10] || 0);
  const offsetMinutesPart = Number(match[11] || 0);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > monthDays[month - 1]
      || hour > 23 || minute > 59 || second > 59
      || offsetHours > 23 || offsetMinutesPart > 59) invalid();
  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, second, milliseconds);
  const offsetSign = match[9] === '-' ? -1 : 1;
  const offsetMinutes = match[8] === 'Z' ? 0 : offsetSign * ((offsetHours * 60) + offsetMinutesPart);
  const instant = new Date(local.getTime() - (offsetMinutes * 60_000));
  if (Number.isNaN(instant.getTime())) invalid();
  return instant;
}

function nowDate(value) {
  const selected = typeof value === 'function' ? value() : (value ?? new Date());
  const date = selected instanceof Date ? new Date(selected.getTime()) : new Date(selected);
  if (Number.isNaN(date.getTime())) invalid();
  return date;
}

function normalizedContext(value) {
  if (value === 'platform') return 'platform';
  if (typeof value === 'string' && UUID.test(value)) return value.toLowerCase();
  invalid();
  return undefined;
}

function parseConfiguration(env, now) {
  const enabled = env?.[ENABLED_ENV];
  if (enabled == null || enabled === '' || enabled === 'false') return null;
  if (enabled !== 'true') invalid();
  const serialized = env?.[CONFIG_ENV];
  if (typeof serialized !== 'string' || serialized !== serialized.trim()
      || !serialized || Buffer.byteLength(serialized, 'utf8') > MAX_CONFIG_BYTES) invalid();
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    invalid();
  }
  exactObject(parsed, ['recipient', 'expiresAt', 'routes']);
  if (!Object.hasOwn(parsed, 'expiresAt')) invalid();
  const recipient = normalizedEmail(parsed.recipient);
  const expiresAt = parsed.expiresAt === null ? null : rfc3339Instant(parsed.expiresAt);
  if (expiresAt !== null) {
    const remaining = expiresAt.getTime() - now.getTime();
    if (remaining > MAX_WINDOW_MS) invalid('TEMPORARY_ROUTE_WINDOW_TOO_LONG');
  }
  if (!Array.isArray(parsed.routes) || parsed.routes.length < 1 || parsed.routes.length > MAX_ROUTES) invalid();
  const routeKeys = new Set();
  const routes = parsed.routes.map((candidate) => {
    exactObject(candidate, ['identityEmail', 'context', 'identityLabel', 'roleLabel', 'tenantLabel', 'recipient']);
    const identityEmail = normalizedEmail(candidate.identityEmail);
    const context = normalizedContext(candidate.context);
    const key = `${identityEmail}|${context}`;
    if (routeKeys.has(key)) invalid('TEMPORARY_ROUTE_DUPLICATED');
    routeKeys.add(key);
    return Object.freeze({
      identityEmail,
      context,
      recipient: Object.hasOwn(candidate, 'recipient')
        ? normalizedEmail(candidate.recipient)
        : recipient,
      identityLabel: label(candidate.identityLabel),
      roleLabel: label(candidate.roleLabel),
      tenantLabel: label(candidate.tenantLabel),
    });
  });
  return Object.freeze({
    recipient,
    expiresAt: expiresAt?.toISOString() ?? null,
    expiryMode: expiresAt === null ? 'manual' : 'scheduled',
    routes: Object.freeze(routes),
  });
}

function maskEmail(value) {
  const [localPart, domain] = String(value).split('@');
  if (!localPart || !domain) return '';
  if (localPart.length === 1) return `•@${domain}`;
  return `${localPart[0]}${'•'.repeat(Math.min(8, Math.max(2, localPart.length - 2)))}${localPart.at(-1)}@${domain}`;
}

export function assertTemporaryEmailRoutingConfiguration(options = {}) {
  parseConfiguration(options.env ?? process.env, nowDate(options.now));
  return true;
}

export function resolveTemporaryEmailRoute(options = {}) {
  const env = options.env ?? process.env;
  const now = nowDate(options.now);
  const configured = parseConfiguration(env, now);
  const logicalRecipient = normalizedEmail(options.logicalRecipient);
  const identityEmail = normalizedEmail(options.identityEmail ?? logicalRecipient);
  const context = options.tenantId == null || options.tenantId === ''
    ? 'platform'
    : normalizedContext(options.tenantId);
  if (!configured) {
    return Object.freeze({
      recipient: logicalRecipient,
      maskedRecipient: maskEmail(logicalRecipient),
      temporarySharedInbox: false,
      identityEmail,
      context,
    });
  }
  const route = configured.routes.find((candidate) => (
    candidate.identityEmail === identityEmail && candidate.context === context
  ));
  if (!route) {
    return Object.freeze({
      recipient: logicalRecipient,
      maskedRecipient: maskEmail(logicalRecipient),
      temporarySharedInbox: false,
      identityEmail,
      context,
    });
  }
  if (configured.expiryMode === 'scheduled'
      && Date.parse(configured.expiresAt) <= now.getTime()) {
    invalid('TEMPORARY_ROUTE_EXPIRED');
  }
  return Object.freeze({
    recipient: route.recipient,
    maskedRecipient: maskEmail(route.recipient),
    temporarySharedInbox: true,
    temporaryRouteExpiresAt: configured.expiresAt,
    temporaryRouteExpiryMode: configured.expiryMode,
    identityEmail,
    context,
    identityLabel: route.identityLabel,
    roleLabel: route.roleLabel,
    tenantLabel: route.tenantLabel,
  });
}
