import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MfaEmailDeliveryError,
  createResendMfaEmailDelivery,
} from '../lib/internal-mfa-email-delivery.js';

const NOW = new Date('2026-08-24T01:30:00.000Z');
const ENV = Object.freeze({
  RESEND_API_KEY: `re_${'a'.repeat(32)}`,
  IDENTITY_MFA_FROM: 'Municipalidad de Junin <seguridad@municipio.example>',
});
const INPUT = Object.freeze({
  to: 'persona@example.test',
  code: '482731',
  expiresAt: '2026-08-24T01:40:00.000Z',
  contextLabel: 'Administracion de plataforma & RRHH',
  idempotencyKey: 'challenge-30000000-0000-4000-8000-000000000001',
});
const TEMPORARY_ROUTE_ENV = Object.freeze({
  IDENTITY_TEMPORARY_SHARED_INBOX_ENABLED: 'true',
  IDENTITY_TEMPORARY_SHARED_INBOX_CONFIG: JSON.stringify({
    recipient: 'shared@example.test',
    expiresAt: '2026-08-26T01:30:00.000Z',
    routes: [{
      identityEmail: 'owner@example.test', context: 'platform',
      identityLabel: 'Marcelo', roleLabel: 'Administrador de plataforma',
      tenantLabel: 'Administracion global',
    }],
  }),
});

function deliveryError(reason, retryable = false) {
  return (error) => error instanceof MfaEmailDeliveryError
    && error.code === 'IDENTITY_MFA_EMAIL_DELIVERY_UNAVAILABLE'
    && error.reason === reason
    && error.retryable === retryable
    && !JSON.stringify(error).includes(INPUT.code)
    && !JSON.stringify(error).includes(INPUT.to)
    && !String(error.message).includes(INPUT.contextLabel);
}

test('isConfigured valida transporte y remitente sin contactar al proveedor', () => {
  let fetchCalls = 0;
  const fetchImpl = async () => { fetchCalls += 1; return { ok: true }; };
  assert.equal(createResendMfaEmailDelivery({ env: ENV, fetchImpl, now: NOW }).isConfigured(), true);
  assert.equal(createResendMfaEmailDelivery({ env: {}, fetchImpl, now: NOW }).isConfigured(), false);
  assert.equal(createResendMfaEmailDelivery({
    env: { ...ENV, RESEND_API_KEY: 'token-invalido' }, fetchImpl, now: NOW,
  }).isConfigured(), false);
  assert.equal(createResendMfaEmailDelivery({
    env: { ...ENV, IDENTITY_MFA_FROM: 'Municipio\r\nBcc: atacante@example.test <seguridad@municipio.example>' },
    fetchImpl, now: NOW,
  }).isConfigured(), false);
  assert.equal(createResendMfaEmailDelivery({ env: ENV, fetchImpl: null, now: NOW }).isConfigured(), false);
  assert.equal(fetchCalls, 0);
});

test('falla cerrado por configuracion antes de procesar o enviar el OTP', async () => {
  let fetchCalls = 0;
  const delivery = createResendMfaEmailDelivery({
    env: { IDENTITY_MFA_FROM: ENV.IDENTITY_MFA_FROM },
    fetchImpl: async () => { fetchCalls += 1; return { ok: true }; },
    now: NOW,
  });
  await assert.rejects(delivery.deliver(INPUT), deliveryError('CONFIGURATION_MISSING', false));
  assert.equal(fetchCalls, 0);
});

test('envia texto y HTML municipal accesible y reporta solo aceptacion del proveedor', async () => {
  const requests = [];
  let providerBodyReads = 0;
  const delivery = createResendMfaEmailDelivery({
    env: ENV,
    now: NOW,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        json() { providerBodyReads += 1; throw new Error('no debe leerse'); },
        text() { providerBodyReads += 1; throw new Error('no debe leerse'); },
      };
    },
  });
  assert.deepEqual(await delivery.deliver(INPUT), { providerAccepted: true });
  assert.equal(providerBodyReads, 0);
  assert.equal(requests.length, 1);
  const request = requests[0];
  assert.equal(request.url, 'https://api.resend.com/emails');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers.Authorization, `Bearer ${ENV.RESEND_API_KEY}`);
  assert.equal(request.options.headers['Content-Type'], 'application/json');
  assert.equal(request.options.headers['Idempotency-Key'], `identity-mfa-email-${INPUT.idempotencyKey}`);
  assert.equal(request.options.headers['User-Agent'], 'municipio-junin-friendly-mfa-email/1.0');
  assert.equal(request.options.signal instanceof AbortSignal, true);
  const body = JSON.parse(request.options.body);
  assert.equal(body.from, ENV.IDENTITY_MFA_FROM);
  assert.deepEqual(body.to, [INPUT.to]);
  assert.match(body.subject, /código de acceso seguro/i);
  assert.match(body.text, /482731/);
  assert.match(body.text, /23 de agosto de 2026.*22:40.*hora de Mendoza/i);
  assert.match(body.text, /nunca te lo pedirá por teléfono, WhatsApp o correo/i);
  assert.match(body.html, /<html lang="es">/);
  assert.match(body.html, /role="presentation"/);
  assert.match(body.html, /role="article"/);
  assert.match(body.html, /Plataforma de gestión municipal · Junín, Mendoza/);
  assert.doesNotMatch(body.html, /Entorno de demostración/i);
  assert.match(body.html, /Administracion de plataforma &amp; RRHH/);
  assert.match(body.html, /482731/);
  assert.doesNotMatch(body.html, /providerAccepted|delivered/i);
});

test('permite reutilizar el remitente de invitaciones cuando no hay uno especifico para MFA', async () => {
  const bodies = [];
  const invitationFrom = 'MuniControl <identidad@municipio.example>';
  const delivery = createResendMfaEmailDelivery({
    env: { RESEND_API_KEY: ENV.RESEND_API_KEY, IDENTITY_INVITATION_FROM: invitationFrom },
    now: NOW,
    fetchImpl: async (_url, options) => { bodies.push(JSON.parse(options.body)); return { ok: true }; },
  });
  assert.equal(delivery.isConfigured(), true);
  await delivery.deliver(INPUT);
  assert.equal(bodies[0].from, invitationFrom);
});

test('buzon compartido temporal conserva actor, rol y tenant visibles sin cambiar la identidad', async () => {
  const bodies = [];
  const delivery = createResendMfaEmailDelivery({
    env: { ...ENV, ...TEMPORARY_ROUTE_ENV }, now: NOW,
    fetchImpl: async (_url, options) => { bodies.push(JSON.parse(options.body)); return { ok: true }; },
  });
  const result = await delivery.deliver({
    ...INPUT,
    identityEmail: 'owner@example.test',
    tenantId: null,
  });
  assert.deepEqual(result, {
    providerAccepted: true,
    maskedDestination: 's••••d@example.test',
    temporarySharedInbox: true,
    temporaryRouteExpiresAt: '2026-08-26T01:30:00.000Z',
  });
  assert.deepEqual(bodies[0].to, ['shared@example.test']);
  assert.match(bodies[0].subject, /owner@example\.test.*Administrador de plataforma.*Administracion global/);
  assert.match(bodies[0].text, /Identidad de acceso: Marcelo \(owner@example\.test\)/);
  assert.match(bodies[0].text, /El codigo inicia solamente la identidad indicada/);
  assert.match(bodies[0].html, /Entrega temporal autorizada para la muestra/);
  assert.doesNotMatch(bodies[0].subject, /persona@example\.test/);
});

test('rechaza payload ambiguo, codigo no numerico, expiracion e inyecciones antes de fetch', async () => {
  let fetchCalls = 0;
  const delivery = createResendMfaEmailDelivery({
    env: ENV, now: NOW,
    fetchImpl: async () => { fetchCalls += 1; return { ok: true }; },
  });
  const invalidInputs = [
    null,
    { ...INPUT, to: 'persona@example.test\r\nBcc: atacante@example.test' },
    { ...INPUT, to: 'persona@localhost' },
    { ...INPUT, code: '12345' },
    { ...INPUT, code: '1234567' },
    { ...INPUT, code: '12A456' },
    { ...INPUT, code: 123456 },
    { ...INPUT, expiresAt: '2026-08-24T01:29:59.000Z' },
    { ...INPUT, expiresAt: '2026-08-24T02:00:00.001Z' },
    { ...INPUT, expiresAt: '2026-02-30T01:40:00Z' },
    { ...INPUT, contextLabel: '<script>alert(1)</script>\n' },
    { ...INPUT, idempotencyKey: 'clave\r\nX-Header: valor' },
    { ...INPUT, idempotencyKey: `a${'b'.repeat(237)}` },
    { ...INPUT, extra: true },
  ];
  for (const input of invalidInputs) {
    await assert.rejects(delivery.deliver(input), deliveryError('PAYLOAD_INVALID', false));
  }
  assert.equal(fetchCalls, 0);
});

test('escapa el contexto en HTML sin alterar el texto plano', async () => {
  const bodies = [];
  const delivery = createResendMfaEmailDelivery({
    env: ENV, now: NOW,
    fetchImpl: async (_url, options) => { bodies.push(JSON.parse(options.body)); return { ok: true }; },
  });
  await delivery.deliver({ ...INPUT, contextLabel: 'RRHH <central> "nominal"' });
  assert.match(bodies[0].text, /RRHH <central> "nominal"/);
  assert.match(bodies[0].html, /RRHH &lt;central&gt; &quot;nominal&quot;/);
  assert.doesNotMatch(bodies[0].html, /<central>/);
});

test('clasifica rechazos del proveedor sin leer cuerpo ni afirmar entrega', async () => {
  const cases = [
    [400, false], [401, false], [403, false], [422, false],
    [408, true], [409, true], [425, true], [429, true],
    [500, true], [502, true], [503, true], [302, true],
  ];
  let providerBodyReads = 0;
  for (const [status, retryable] of cases) {
    const delivery = createResendMfaEmailDelivery({
      env: ENV, now: NOW,
      fetchImpl: async () => ({
        ok: false,
        status,
        text() { providerBodyReads += 1; return `privado ${INPUT.code}`; },
        json() { providerBodyReads += 1; return { recipient: INPUT.to }; },
      }),
    });
    await assert.rejects(delivery.deliver(INPUT), deliveryError('PROVIDER_REJECTED', retryable));
  }
  assert.equal(providerBodyReads, 0);
});

test('sanea fallos de red y timeout sin filtrar OTP, destinatario ni respuesta', async () => {
  const networkDelivery = createResendMfaEmailDelivery({
    env: ENV, now: NOW,
    fetchImpl: async () => { throw new Error(`red ${INPUT.code} ${INPUT.to}`); },
  });
  await assert.rejects(networkDelivery.deliver(INPUT), deliveryError('PROVIDER_UNAVAILABLE', true));

  let aborted = false;
  const timeoutDelivery = createResendMfaEmailDelivery({
    env: ENV, now: NOW, timeoutMs: 5,
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        aborted = true;
        reject(new Error(`timeout ${INPUT.code} ${INPUT.contextLabel}`));
      }, { once: true });
    }),
  });
  await assert.rejects(timeoutDelivery.deliver(INPUT), deliveryError('PROVIDER_TIMEOUT', true));
  assert.equal(aborted, true);
});
