import { isDeliverableEmail } from './internal-email.js';

const RESEND_EMAILS_URL = 'https://api.resend.com/emails';
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_EXPIRATION_WINDOW_MS = 30 * 60_000;
const MFA_CODE = /^\d{6}$/;
const RFC3339_INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/;
// Resend admite hasta 256 caracteres; el namespace agrega 19.
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,236}$/;

export class MfaEmailDeliveryError extends Error {
  constructor(reason = 'DELIVERY_UNAVAILABLE', retryable = false) {
    super('No se pudo entregar el código de verificación');
    this.name = 'MfaEmailDeliveryError';
    this.code = 'IDENTITY_MFA_EMAIL_DELIVERY_UNAVAILABLE';
    this.reason = reason;
    this.retryable = retryable === true;
  }
}

function unavailable(reason, retryable = false) {
  throw new MfaEmailDeliveryError(reason, retryable);
}

function requiredConfiguration(env, key) {
  const value = env?.[key];
  if (typeof value !== 'string' || value !== value.trim() || !value) {
    unavailable('CONFIGURATION_MISSING');
  }
  return value;
}

function configuredSender(env) {
  const selected = env?.IDENTITY_MFA_FROM ?? env?.IDENTITY_INVITATION_FROM;
  if (typeof selected !== 'string' || selected !== selected.trim() || !selected) {
    unavailable('CONFIGURATION_MISSING');
  }
  if (isDeliverableEmail(selected)) return selected;
  if (/[\r\n\u0000-\u001f\u007f]/.test(selected) || selected.length > 320) {
    unavailable('CONFIGURATION_INVALID');
  }
  const match = /^([^<>"]{1,80}) <([^<>]+)>$/.exec(selected);
  if (!match || match[1] !== match[1].trim() || !isDeliverableEmail(match[2])) {
    unavailable('CONFIGURATION_INVALID');
  }
  return selected;
}

function deliveryConfiguration(env, fetchImpl) {
  const apiKey = requiredConfiguration(env, 'RESEND_API_KEY');
  if (!/^re_[A-Za-z0-9_-]{16,253}$/.test(apiKey) || apiKey.length > 256
      || typeof fetchImpl !== 'function') {
    unavailable('CONFIGURATION_INVALID');
  }
  return Object.freeze({ apiKey, from: configuredSender(env) });
}

function recipient(value) {
  if (!isDeliverableEmail(value)) unavailable('PAYLOAD_INVALID');
  return value;
}

function verificationCode(value) {
  if (typeof value !== 'string' || !MFA_CODE.test(value)) unavailable('PAYLOAD_INVALID');
  return value;
}

function context(value) {
  if (typeof value !== 'string' || value !== value.trim() || !value
      || value.length > 160 || /[\u0000-\u001f\u007f]/.test(value)) {
    unavailable('PAYLOAD_INVALID');
  }
  return value;
}

function requestIdempotencyKey(value) {
  if (typeof value !== 'string' || value !== value.trim()
      || !SAFE_IDEMPOTENCY_KEY.test(value)) {
    unavailable('PAYLOAD_INVALID');
  }
  return `identity-mfa-email-${value}`;
}

function nowDate(now) {
  const value = typeof now === 'function' ? now() : (now ?? new Date());
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) unavailable('CONFIGURATION_INVALID');
  return date;
}

function expiration(value, now) {
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
  const remaining = instant.getTime() - now.getTime();
  if (Number.isNaN(instant.getTime()) || remaining <= 0 || remaining > MAX_EXPIRATION_WINDOW_MS) {
    unavailable('PAYLOAD_INVALID');
  }
  return instant;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function localExpirationLabel(value) {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Mendoza',
    dateStyle: 'long',
    timeStyle: 'short',
    hourCycle: 'h23',
  }).format(value);
}

function messageFor(input, currentTime) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).some((key) => !['to', 'code', 'expiresAt', 'contextLabel', 'idempotencyKey'].includes(key))) {
    unavailable('PAYLOAD_INVALID');
  }
  const to = recipient(input.to);
  const code = verificationCode(input.code);
  const contextLabel = context(input.contextLabel);
  const expiresAt = expiration(input.expiresAt, currentTime);
  const expiresLabel = `${localExpirationLabel(expiresAt)} (hora de Mendoza)`;
  const idempotencyKey = requestIdempotencyKey(input.idempotencyKey);
  const subject = 'Tu código de acceso seguro | MuniControl Junín';
  const text = [
    'MuniControl | Entorno de demostración para Junín',
    '',
    'Código de verificación:',
    code,
    '',
    `Contexto: ${contextLabel}`,
    `Vence: ${expiresLabel}`,
    '',
    'No compartas este código. El personal municipal nunca te lo pedirá por teléfono, WhatsApp o correo.',
    'Si no iniciaste este acceso, ignorá el mensaje y avisá al responsable de seguridad de tu organización.',
  ].join('\n');
  const safeCode = escapeHtml(code);
  const safeContext = escapeHtml(contextLabel);
  const safeExpiration = escapeHtml(expiresLabel);
  const html = [
    '<!doctype html>',
    '<html lang="es">',
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Código de acceso seguro de MuniControl</title></head>',
    '<body style="margin:0;padding:0;background:#edf2f4;color:#092533;font-family:Arial,Helvetica,sans-serif;">',
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Tu código de acceso seguro de MuniControl vence pronto.</div>',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#edf2f4;">',
    '<tr><td align="center" style="padding:32px 16px;">',
    '<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #c7d3d9;border-radius:12px;overflow:hidden;">',
    '<tr><td style="padding:24px 28px;background:#062735;border-bottom:4px solid #a9d84a;color:#ffffff;">',
    '<p style="margin:0 0 5px;font-size:22px;line-height:1.2;font-weight:700;">MuniControl</p>',
    '<p style="margin:0;font-size:12px;line-height:1.5;letter-spacing:1px;text-transform:uppercase;color:#dce8ec;">Entorno de demostración · Junín, Mendoza</p>',
    '</td></tr>',
    '<tr><td role="article" aria-label="Código de verificación de acceso" style="padding:30px 28px;">',
    '<h1 style="margin:0 0 14px;font-size:25px;line-height:1.25;color:#092533;">Verificá tu acceso</h1>',
    '<p style="margin:0 0 22px;font-size:16px;line-height:1.6;color:#36505c;">Usá este código para completar la verificación solicitada.</p>',
    `<div style="margin:0 0 22px;padding:18px;text-align:center;background:#f3f8fa;border:2px solid #0b6685;border-radius:8px;"><span aria-label="Código ${safeCode}" style="font-family:Consolas,Monaco,monospace;font-size:34px;line-height:1.2;font-weight:700;letter-spacing:8px;color:#062735;">${safeCode}</span></div>`,
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0 0 22px;">',
    `<tr><td style="padding:8px 0;font-size:14px;line-height:1.5;color:#36505c;"><strong style="color:#092533;">Contexto:</strong> ${safeContext}</td></tr>`,
    `<tr><td style="padding:8px 0;font-size:14px;line-height:1.5;color:#36505c;"><strong style="color:#092533;">Vencimiento:</strong> ${safeExpiration}</td></tr>`,
    '</table>',
    '<div style="padding:16px;background:#fff8e7;border-left:4px solid #d39400;color:#5b4500;font-size:14px;line-height:1.55;">',
    '<strong>No compartas este código.</strong> El personal municipal nunca te lo pedirá por teléfono, WhatsApp o correo.',
    '</div>',
    '<p style="margin:22px 0 0;font-size:13px;line-height:1.55;color:#526a74;">Si no iniciaste este acceso, ignorá el mensaje y avisá al responsable de seguridad de tu organización.</p>',
    '</td></tr>',
    '<tr><td style="padding:18px 28px;background:#f6f8f9;border-top:1px solid #d8e1e5;font-size:12px;line-height:1.5;color:#607780;">Mensaje transaccional de seguridad · Entorno de demostración MuniControl</td></tr>',
    '</table>',
    '</td></tr></table>',
    '</body></html>',
  ].join('');
  return Object.freeze({ to, subject, text, html, idempotencyKey });
}

function deliveryTimeout(value) {
  const timeoutMs = value ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new TypeError('timeout de email MFA invalido');
  }
  return timeoutMs;
}

function retryableProviderStatus(status) {
  if ([408, 409, 425, 429].includes(status)) return true;
  if (status >= 400 && status < 500) return false;
  if (status >= 500 && status < 600) return true;
  return true;
}

export function createResendMfaEmailDelivery(options = {}) {
  const env = options.env ?? process.env;
  const fetchImpl = Object.hasOwn(options, 'fetchImpl') ? options.fetchImpl : globalThis.fetch;
  const timeoutMs = deliveryTimeout(options.timeoutMs);

  function isConfigured() {
    try {
      deliveryConfiguration(env, fetchImpl);
      return true;
    } catch {
      return false;
    }
  }

  async function deliver(input) {
    const configuration = deliveryConfiguration(env, fetchImpl);
    const message = messageFor(input, nowDate(options.now));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(RESEND_EMAILS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${configuration.apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': message.idempotencyKey,
          'User-Agent': 'municipio-junin-friendly-mfa-email/1.0',
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
      return Object.freeze({ providerAccepted: true });
    } catch (error) {
      if (error instanceof MfaEmailDeliveryError) throw error;
      unavailable(controller.signal.aborted ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE', true);
    } finally {
      clearTimeout(timeout);
    }
    return undefined;
  }

  return Object.freeze({ isConfigured, deliver });
}
