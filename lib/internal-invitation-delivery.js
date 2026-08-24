import { isDeliverableEmail } from './internal-email.js';

const RESEND_EMAILS_URL = 'https://api.resend.com/emails';
const DEFAULT_TIMEOUT_MS = 8_000;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INVITATION_CODE = /^[A-Z2-7]{5}(?:-[A-Z2-7]{5}){3}-[A-Z2-7]{6}$/;
const RFC3339_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/;

export class InvitationDeliveryError extends Error {
  constructor(reason = 'DELIVERY_UNAVAILABLE', retryable = false) {
    super('No se pudo entregar la invitacion');
    this.name = 'InvitationDeliveryError';
    this.code = 'IDENTITY_DELIVERY_UNAVAILABLE';
    this.reason = reason;
    this.retryable = retryable === true;
  }
}

function unavailable(reason, retryable = false) {
  throw new InvitationDeliveryError(reason, retryable);
}

function requiredConfiguration(env, key) {
  const value = env?.[key];
  if (typeof value !== 'string' || value !== value.trim() || !value) {
    unavailable('CONFIGURATION_MISSING');
  }
  return value;
}

function configuredSender(env) {
  const value = requiredConfiguration(env, 'IDENTITY_INVITATION_FROM');
  if (isDeliverableEmail(value)) return value;
  if (/[\r\n\u0000-\u001f\u007f]/.test(value) || value.length > 320) {
    unavailable('CONFIGURATION_INVALID');
  }
  const match = /^([^<>"]{1,80}) <([^<>]+)>$/.exec(value);
  if (!match || match[1] !== match[1].trim() || !isDeliverableEmail(match[2])) {
    unavailable('CONFIGURATION_INVALID');
  }
  return value;
}

function configuredOrigin(env) {
  const configured = String(env?.IDENTITY_APP_ORIGIN || env?.INTERNAL_APP_ORIGIN || '').trim();
  const candidate = configured || (env?.VERCEL_URL ? `https://${env.VERCEL_URL}` : '');
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    unavailable('CONFIGURATION_INVALID');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port
      || !parsed.hostname.includes('.')) {
    unavailable('CONFIGURATION_INVALID');
  }
  return parsed.origin;
}

function deliveryConfiguration(env, fetchImpl) {
  const apiKey = requiredConfiguration(env, 'RESEND_API_KEY');
  if (!/^re_[A-Za-z0-9_-]{16,253}$/.test(apiKey) || apiKey.length > 256) {
    unavailable('CONFIGURATION_INVALID');
  }
  if (typeof fetchImpl !== 'function') unavailable('CONFIGURATION_INVALID');
  return Object.freeze({ apiKey, from: configuredSender(env), origin: configuredOrigin(env) });
}

function recipient(value) {
  if (!isDeliverableEmail(value)) unavailable('PAYLOAD_INVALID');
  return value;
}

function activationLocation(value, expectedOrigin) {
  if (typeof value !== 'string' || value !== value.trim()) unavailable('PAYLOAD_INVALID');
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    unavailable('PAYLOAD_INVALID');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port
      || !parsed.hostname.includes('.') || parsed.pathname !== '/activar-cuenta'
      || parsed.search || parsed.hash || parsed.origin !== expectedOrigin) {
    unavailable('PAYLOAD_INVALID');
  }
  return parsed.href;
}

function invitationCode(value) {
  if (typeof value !== 'string' || !INVITATION_CODE.test(value)) unavailable('PAYLOAD_INVALID');
  return value;
}

function deliveryAttempt(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some((key) => !['id', 'invitationId'].includes(key))
      || !UUID_V4.test(String(value.id || ''))
      || !UUID_V4.test(String(value.invitationId || ''))) {
    unavailable('PAYLOAD_INVALID');
  }
  return Object.freeze({
    id: String(value.id).toLowerCase(),
    invitationId: String(value.invitationId).toLowerCase(),
  });
}

function expiration(value) {
  const match = typeof value === 'string' ? RFC3339_INSTANT.exec(value) : null;
  if (!match) unavailable('PAYLOAD_INVALID');
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
      || offsetHours > 23 || offsetMinutesPart > 59) {
    unavailable('PAYLOAD_INVALID');
  }
  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, second, milliseconds);
  const offsetSign = match[9] === '-' ? -1 : 1;
  const offsetMinutes = match[8] === 'Z' ? 0 : offsetSign * ((offsetHours * 60) + offsetMinutesPart);
  const instant = new Date(local.getTime() - (offsetMinutes * 60_000));
  if (Number.isNaN(instant.getTime())) unavailable('PAYLOAD_INVALID');
  return instant.toISOString();
}

function organizationName(value) {
  if (value == null || value === '') return 'tu organizacion';
  if (typeof value !== 'string' || value !== value.trim()
      || value.length > 160 || /[\u0000-\u001f\u007f]/.test(value)) {
    unavailable('PAYLOAD_INVALID');
  }
  return value;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function messageFor(input, expectedOrigin) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) unavailable('PAYLOAD_INVALID');
  const to = recipient(input.to);
  const code = invitationCode(input.code);
  const expiresAt = expiration(input.expiresAt);
  const tenantName = organizationName(input.tenantName);
  const activationUrl = activationLocation(input.activationUrl, expectedOrigin);
  const attempt = deliveryAttempt(input.deliveryAttempt);
  const subject = `Invitacion para acceder a ${tenantName}`;
  const text = [
    `Te invitaron a acceder a ${tenantName}.`,
    '',
    `Codigo de activacion: ${code}`,
    `Activa tu cuenta en: ${activationUrl}`,
    `La invitacion vence: ${expiresAt}`,
    '',
    'Si no esperabas esta invitacion, ignora este mensaje.',
  ].join('\n');
  const html = [
    '<!doctype html><html><body>',
    `<p>Te invitaron a acceder a <strong>${escapeHtml(tenantName)}</strong>.</p>`,
    `<p>Codigo de activacion: <strong>${escapeHtml(code)}</strong></p>`,
    `<p><a href="${escapeHtml(activationUrl)}">Activar cuenta</a></p>`,
    `<p>La invitacion vence: ${escapeHtml(expiresAt)}</p>`,
    '<p>Si no esperabas esta invitacion, ignora este mensaje.</p>',
    '</body></html>',
  ].join('');
  return Object.freeze({
    to, subject, text, html,
    idempotencyKey: `identity-invitation-${attempt.id}`,
  });
}

function deliveryTimeout(value) {
  const timeoutMs = value ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new TypeError('timeout de invitacion invalido');
  }
  return timeoutMs;
}

function retryableProviderStatus(status) {
  if ([408, 409, 425, 429].includes(status)) return true;
  if (status >= 400 && status < 500) return false;
  if (status >= 500 && status < 600) return true;
  return true;
}

export function createResendInvitationDelivery(options = {}) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const timeoutMs = deliveryTimeout(options.timeoutMs);

  function assertConfigured() {
    deliveryConfiguration(env, fetchImpl);
  }

  async function deliverInvitation(input) {
    const configuration = deliveryConfiguration(env, fetchImpl);
    const message = messageFor(input, configuration.origin);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(RESEND_EMAILS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${configuration.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': message.idempotencyKey,
          'User-Agent': 'municipio-junin-friendly-identity/1.0',
        },
        body: JSON.stringify({
          from: configuration.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
        signal: controller.signal,
      });
      if (!response || response.ok !== true) {
        unavailable('PROVIDER_REJECTED', retryableProviderStatus(Number(response?.status)));
      }
      return Object.freeze({ accepted: true });
    } catch (error) {
      if (error instanceof InvitationDeliveryError) throw error;
      unavailable(controller.signal.aborted ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE', true);
    } finally {
      clearTimeout(timeout);
    }
    return undefined;
  }

  Object.defineProperty(deliverInvitation, 'assertConfigured', {
    value: assertConfigured,
    enumerable: false,
    writable: false,
  });
  return deliverInvitation;
}
