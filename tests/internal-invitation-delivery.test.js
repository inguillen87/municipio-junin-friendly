import assert from 'node:assert/strict';
import test from 'node:test';

import {
  InvitationDeliveryError,
  createResendInvitationDelivery,
} from '../lib/internal-invitation-delivery.js';

const ENV = Object.freeze({
  RESEND_API_KEY: `re_${'a'.repeat(32)}`,
  IDENTITY_INVITATION_FROM: 'Municipalidad de Junin <identidad@municipio.example>',
  IDENTITY_APP_ORIGIN: 'https://municipio.example',
});
const INPUT = Object.freeze({
  to: 'persona@example.test',
  code: 'AAAAA-BBBBB-CCCCC-DDDDD-EEEEEE',
  expiresAt: '2026-08-25T15:00:00.000Z',
  tenantName: 'Junin & <Administracion> "central"',
  activationUrl: 'https://municipio.example/activar-cuenta',
  deliveryAttempt: Object.freeze({
    invitationId: '22222222-2222-4222-8222-222222222222',
    id: '30000000-0000-4000-8000-000000000001',
  }),
});
const TEMPORARY_ROUTE_ENV = Object.freeze({
  IDENTITY_TEMPORARY_SHARED_INBOX_ENABLED: 'true',
  IDENTITY_TEMPORARY_SHARED_INBOX_CONFIG: JSON.stringify({
    recipient: 'shared@example.test',
    expiresAt: '2026-08-26T01:30:00.000Z',
    routes: [{
      identityEmail: 'hugo@example.test', context: '22222222-2222-4222-8222-222222222222',
      identityLabel: 'Hugo', roleLabel: 'Aprobador final de RRHH',
      tenantLabel: 'Municipalidad de Junin',
    }],
  }),
});

function deliveryError(reason, retryable = false) {
  return (error) => error instanceof InvitationDeliveryError
    && error.code === 'IDENTITY_DELIVERY_UNAVAILABLE'
    && error.reason === reason
    && error.retryable === retryable
    && !JSON.stringify(error).includes(INPUT.code);
}

test('preflight fail-closed exige configuracion server-side valida antes de usar fetch', async () => {
  let fetchCalls = 0;
  const fetch = async () => { fetchCalls += 1; return { ok: true }; };
  const invalidEnvironments = [
    {},
    { ...ENV, RESEND_API_KEY: '' },
    { ...ENV, RESEND_API_KEY: 'token-no-resend' },
    { ...ENV, IDENTITY_INVITATION_FROM: 'Municipio <invalido>' },
    { ...ENV, IDENTITY_INVITATION_FROM: 'Municipio\r\nBcc: atacante@example.test <identidad@municipio.example>' },
    { ...ENV, IDENTITY_APP_ORIGIN: 'http://municipio.example' },
  ];
  for (const env of invalidEnvironments) {
    const delivery = createResendInvitationDelivery({ env, fetch });
    assert.throws(() => delivery.assertConfigured(), InvitationDeliveryError);
    await assert.rejects(delivery(INPUT), InvitationDeliveryError);
  }
  assert.equal(fetchCalls, 0);
});

test('envia text+html escapado con idempotencia determinista y no lee el body del proveedor', async () => {
  const requests = [];
  let providerBodyReads = 0;
  const delivery = createResendInvitationDelivery({
    env: ENV,
    fetch: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        text() { providerBodyReads += 1; throw new Error('no debe leerse'); },
        json() { providerBodyReads += 1; throw new Error('no debe leerse'); },
      };
    },
  });
  assert.doesNotThrow(() => delivery.assertConfigured());
  assert.deepEqual(await delivery(INPUT), { accepted: true });
  assert.deepEqual(await delivery(INPUT), { accepted: true });
  assert.equal(requests.length, 2);
  assert.equal(providerBodyReads, 0);

  for (const request of requests) {
    assert.equal(request.url, 'https://api.resend.com/emails');
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.headers.Authorization, `Bearer ${ENV.RESEND_API_KEY}`);
    assert.equal(request.options.headers['Content-Type'], 'application/json');
    assert.equal(request.options.headers['Idempotency-Key'],
      `identity-invitation-${INPUT.deliveryAttempt.id}`);
    assert.equal(request.options.headers['User-Agent'], 'municipio-junin-friendly-identity/1.0');
    assert.equal(request.options.signal instanceof AbortSignal, true);
    const body = JSON.parse(request.options.body);
    assert.deepEqual(body.to, [INPUT.to]);
    assert.equal(body.from, ENV.IDENTITY_INVITATION_FROM);
    assert.match(body.text, /Codigo de activacion: AAAAA-BBBBB-CCCCC-DDDDD-EEEEEE/);
    assert.match(body.text, /https:\/\/municipio\.example\/activar-cuenta/);
    assert.match(body.html, /Junin &amp; &lt;Administracion&gt; &quot;central&quot;/);
    assert.doesNotMatch(body.html, /<Administracion>|<script/i);
    assert.match(body.html, /<a href="https:\/\/municipio\.example\/activar-cuenta">/);
  }
});

test('normaliza timestamps RFC3339 de PostgreSQL con offset y microsegundos', async () => {
  const bodies = [];
  const delivery = createResendInvitationDelivery({
    env: ENV,
    fetch: async (_url, options) => {
      bodies.push(JSON.parse(options.body));
      return { ok: true };
    },
  });
  await delivery({ ...INPUT, expiresAt: '2026-08-25T15:00:00.123456+00:00' });
  await delivery({ ...INPUT, expiresAt: '2026-08-25T15:00:00.654321-03:00' });
  assert.match(bodies[0].text, /2026-08-25T15:00:00\.123Z/);
  assert.match(bodies[0].html, /2026-08-25T15:00:00\.123Z/);
  assert.match(bodies[1].text, /2026-08-25T18:00:00\.654Z/);
  assert.match(bodies[1].html, /2026-08-25T18:00:00\.654Z/);
});

test('invitacion temporal llega al buzon compartido e identifica usuario, rol y municipio', async () => {
  const bodies = [];
  const delivery = createResendInvitationDelivery({
    env: { ...ENV, ...TEMPORARY_ROUTE_ENV },
    now: new Date('2026-08-24T01:30:00.000Z'),
    fetch: async (_url, options) => { bodies.push(JSON.parse(options.body)); return { ok: true }; },
  });
  const result = await delivery({
    ...INPUT,
    to: 'hugo@example.test',
    identityEmail: 'hugo@example.test',
    tenantId: '22222222-2222-4222-8222-222222222222',
  });
  assert.deepEqual(result, {
    accepted: true,
    maskedDestination: 's••••d@example.test',
    temporarySharedInbox: true,
    temporaryRouteExpiresAt: '2026-08-26T01:30:00.000Z',
    temporaryRouteExpiryMode: 'scheduled',
  });
  assert.deepEqual(bodies[0].to, ['shared@example.test']);
  assert.match(bodies[0].subject, /hugo@example\.test.*Aprobador final de RRHH.*Municipalidad de Junin/);
  assert.match(bodies[0].text, /Identidad de acceso: Hugo \(hugo@example\.test\)/);
  assert.match(bodies[0].text, /El codigo activa solamente la identidad indicada/);
  assert.match(bodies[0].html, /Entrega temporal autorizada para la muestra/);
});

test('invitacion compartida admite vigencia manual reversible sin fecha ficticia', async () => {
  const bodies = [];
  const manualEnv = {
    ...ENV,
    ...TEMPORARY_ROUTE_ENV,
    IDENTITY_TEMPORARY_SHARED_INBOX_CONFIG: JSON.stringify({
      ...JSON.parse(TEMPORARY_ROUTE_ENV.IDENTITY_TEMPORARY_SHARED_INBOX_CONFIG),
      expiresAt: null,
    }),
  };
  const delivery = createResendInvitationDelivery({
    env: manualEnv,
    now: new Date('2099-01-01T00:00:00.000Z'),
    fetch: async (_url, options) => { bodies.push(JSON.parse(options.body)); return { ok: true }; },
  });
  const result = await delivery({
    ...INPUT,
    to: 'hugo@example.test',
    identityEmail: 'hugo@example.test',
    tenantId: '22222222-2222-4222-8222-222222222222',
  });
  assert.deepEqual(result, {
    accepted: true,
    maskedDestination: 's••••d@example.test',
    temporarySharedInbox: true,
    temporaryRouteExpiresAt: null,
    temporaryRouteExpiryMode: 'manual',
  });
  assert.match(bodies[0].text, /Hasta desactivación manual del responsable de plataforma/);
  assert.doesNotMatch(bodies[0].text, /undefined|null/);
});

test('rechaza email, origen, codigo e identificadores ambiguos antes de contactar Resend', async () => {
  let fetchCalls = 0;
  const delivery = createResendInvitationDelivery({
    env: ENV,
    fetch: async () => { fetchCalls += 1; return { ok: true }; },
  });
  const invalidInputs = [
    { ...INPUT, to: 'persona@example.test\r\nBcc: atacante@example.test' },
    { ...INPUT, to: 'persona@localhost' },
    { ...INPUT, code: INPUT.code.toLowerCase() },
    { ...INPUT, code: 'AAAAA-BBBBB-CCCCC-DDDDD-EEEEE0' },
    { ...INPUT, activationUrl: 'http://municipio.example/activar-cuenta' },
    { ...INPUT, activationUrl: 'https://otro.example/activar-cuenta' },
    { ...INPUT, activationUrl: 'https://municipio.example/activar-cuenta?code=secreto' },
    { ...INPUT, activationUrl: 'https://usuario:clave@municipio.example/activar-cuenta' },
    { ...INPUT, expiresAt: '2026-02-30T15:00:00Z' },
    { ...INPUT, expiresAt: '2026-08-25T15:00:00.1234567Z' },
    { ...INPUT, expiresAt: '2026-08-25T15:00:00.000' },
    { ...INPUT, deliveryAttempt: { ...INPUT.deliveryAttempt, id: 'no-es-uuid' } },
    { ...INPUT, deliveryAttempt: { ...INPUT.deliveryAttempt, invitationId: 'no-es-uuid' } },
    { ...INPUT, deliveryAttempt: { ...INPUT.deliveryAttempt, extra: true } },
  ];
  for (const input of invalidInputs) {
    await assert.rejects(delivery(input), deliveryError('PAYLOAD_INVALID', false));
  }
  assert.equal(fetchCalls, 0);
});

test('fallo HTTP se encapsula sin leer ni registrar codigo, token o body del proveedor', async () => {
  let providerBodyReads = 0;
  const consoleCalls = [];
  const originalError = console.error;
  const originalLog = console.log;
  const originalWarn = console.warn;
  console.error = (...values) => consoleCalls.push(values);
  console.log = (...values) => consoleCalls.push(values);
  console.warn = (...values) => consoleCalls.push(values);
  try {
    const delivery = createResendInvitationDelivery({
      env: ENV,
      fetch: async () => ({
        ok: false,
        status: 422,
        text() { providerBodyReads += 1; return 'provider-body-con-token'; },
        json() { providerBodyReads += 1; return { code: INPUT.code }; },
      }),
    });
    await assert.rejects(delivery(INPUT), deliveryError('PROVIDER_REJECTED', false));
  } finally {
    console.error = originalError;
    console.log = originalLog;
    console.warn = originalWarn;
  }
  assert.equal(providerBodyReads, 0);
  assert.deepEqual(consoleCalls, []);
});

test('aborta por timeout y devuelve solamente un error sanitario', async () => {
  let aborted = false;
  const delivery = createResendInvitationDelivery({
    env: ENV,
    timeoutMs: 5,
    fetch: async (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        aborted = true;
        reject(new Error(`respuesta sensible ${INPUT.code}`));
      }, { once: true });
    }),
  });
  await assert.rejects(delivery(INPUT), deliveryError('PROVIDER_TIMEOUT', true));
  assert.equal(aborted, true);
});

test('clasifica HTTP transitorio/definitivo y red sin consumir el body', async () => {
  const cases = [
    [400, false], [401, false], [403, false], [404, false], [422, false],
    [408, true], [409, true], [425, true], [429, true],
    [500, true], [502, true], [503, true], [504, true], [302, true],
  ];
  let providerBodyReads = 0;
  for (const [status, retryable] of cases) {
    const delivery = createResendInvitationDelivery({
      env: ENV,
      fetch: async () => ({
        ok: false,
        status,
        text() { providerBodyReads += 1; return 'body privado'; },
        json() { providerBodyReads += 1; return { privado: true }; },
      }),
    });
    await assert.rejects(delivery(INPUT), deliveryError('PROVIDER_REJECTED', retryable));
  }
  const networkDelivery = createResendInvitationDelivery({
    env: ENV,
    fetch: async () => { throw new Error(`red privada ${INPUT.code}`); },
  });
  await assert.rejects(networkDelivery(INPUT), deliveryError('PROVIDER_UNAVAILABLE', true));
  assert.equal(providerBodyReads, 0);
});
