import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createInternalIdentityHandler } from '../api/internal-identity.js';

const html = fs.readFileSync(new URL('../login.html', import.meta.url), 'utf8');
const EMAIL = 'access-feedback@local.invalid';
const PASSWORD = 'synthetic-access-feedback-only';

function functionSource(name) {
  const marker = `function ${name}(`;
  const found = html.indexOf(marker);
  assert.ok(found >= 0);
  const start = html.slice(found - 6, found) === 'async ' ? found - 6 : found;
  const open = html.indexOf('{', found);
  let depth = 0;
  for (let i = open; i < html.length; i++) {
    if (html[i] === '{') depth++;
    if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  assert.fail(`Unclosed function: ${name}`);
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => typeof body === 'string' ? body : JSON.stringify(body),
  };
}

function runtime(fetchResponse) {
  const requests = [];
  const state = { message: '', status: '', loading: false, contexts: [], sessions: [], timersCleared: 0 };
  const elements = {
    emailInput: { value: EMAIL, validity: { valid: true }, focus() {} },
    passInput: { value: PASSWORD, focus() {} },
    buttonLabel: { textContent: 'Ingresar al portal interno' },
  };
  const scope = vm.createContext({
    AbortController,
    IDENTITY_URL: '/api/internal-identity',
    REQUEST_TIMEOUT_MS: 16000,
    identityLoading: false,
    loginEnrollmentFlow: null,
    contextFlow: null,
    loginFlow: null,
    selectedLoginContextKind: '',
    window: { setTimeout: () => 1, clearTimeout: () => state.timersCleared++ },
    document: {
      getElementById: id => {
        assert.ok(elements[id], `Unexpected DOM element: ${id}`);
        return elements[id];
      },
      querySelector: selector => selector === '#btnLogin .button-label' ? elements.buttonLabel : elements.selected,
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return typeof fetchResponse === 'function' ? fetchResponse(url, options) : fetchResponse;
    },
    hideError: () => { state.message = ''; },
    showError: message => { state.message = message; },
    setLoading: (loading, status) => { state.loading = loading; state.status = status; scope.identityLoading = loading; },
    openContextStep: (context, email) => { state.contexts.push({ context, email }); },
    completeLogin: (session, email) => { state.sessions.push({ session, email }); },
  });
  vm.runInContext(['identityError', 'identityRequest', 'doLogin'].map(functionSource).join('\n'), scope);
  return { scope, requests, state, elements, login: () => scope.doLogin({ preventDefault() {} }) };
}

for (const body of [
  { ok: false, code: 'IDENTITY_GATEWAY_NOT_CONFIGURED', error: 'private server diagnostic' },
  '<html>503 Service Unavailable</html>',
  '',
]) {
  test(`503 login reports service failure even without JSON (${typeof body === 'object' ? 'JSON' : body ? 'HTML' : 'empty'})`, async () => {
    const qa = runtime(response(503, body));
    await qa.login();
    assert.match(qa.state.message, /servicio de acceso no está disponible/);
    assert.doesNotMatch(qa.state.message, /Revisá los datos|private server|<html>/);
    assert.equal(qa.state.status, qa.state.message);
    assert.equal(qa.state.loading, false);
    assert.equal(qa.elements.emailInput.value, EMAIL);
    assert.equal(qa.elements.passInput.value, '', 'password is still cleared after submission');
    assert.equal(qa.requests.length, 1, 'no automatic login retries');
    assert.equal(qa.state.contexts.length, 0);
    assert.equal(qa.state.sessions.length, 0);
    assert.equal(qa.state.timersCleared, 1);
    assert.equal(qa.requests[0].options.credentials, 'same-origin');
  });
}

test('actual unconfigured identity handler fails before SQL, and login renders its service failure', async () => {
  let openedDatabase = 0;
  const origin = 'https://access-feedback.example.test';
  const handler = createInternalIdentityHandler({
    env: { IDENTITY_APP_ORIGIN: origin },
    getTenantIdentitySql: async () => { openedDatabase++; throw new Error('database must not be opened'); },
  });
  const qa = runtime(async (_url, options) => {
    const res = {
      headers: {}, statusCode: 200,
      setHeader(key, value) { this.headers[key] = value; },
      status(code) { this.statusCode = code; return this; },
      json(value) { this.payload = value; return this; },
    };
    await handler({ method: 'POST', headers: { origin, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json' }, body: options.body }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.payload.code, 'IDENTITY_GATEWAY_NOT_CONFIGURED');
    assert.match(res.headers['Cache-Control'], /no-store/);
    assert.equal(res.headers['Set-Cookie'], undefined);
    return response(res.statusCode, res.payload);
  });
  await qa.login();
  assert.equal(openedDatabase, 0);
  assert.match(qa.state.message, /servicio de acceso no está disponible/);
  assert.equal(qa.state.sessions.length, 0);
});

test('incorrect password and unknown identity still share a generic message without enumeration', async () => {
  const messages = [];
  for (const error of ['incorrect password for synthetic user', 'unknown synthetic identity']) {
    const qa = runtime(response(401, { ok: false, code: 'IDENTITY_AUTH_FAILED', error }));
    await qa.login();
    messages.push(qa.state.message);
    assert.match(qa.state.message, /Revisá los datos/);
    assert.doesNotMatch(qa.state.message, /synthetic|unknown|password/);
    assert.equal(qa.state.sessions.length, 0);
  }
  assert.equal(messages[0], messages[1]);
});

test('timeout and broken connection do not blame credentials or retry automatically', async () => {
  for (const [name, expected] of [['AbortError', /tardó demasiado/], ['TypeError', /No se pudo conectar/]]) {
    const qa = runtime(() => { const error = new Error('private network detail'); error.name = name; throw error; });
    await qa.login();
    assert.match(qa.state.message, expected);
    assert.doesNotMatch(qa.state.message, /Revisá los datos|private network/);
    assert.equal(qa.state.status, qa.state.message);
    assert.equal(qa.requests.length, 1);
    assert.equal(qa.state.timersCleared, 1);
  }
});

test('503 selecting a context preserves the chosen scope, version and retry key without granting access', async () => {
  const qa = runtime(response(503, { ok: false, code: 'IDENTITY_GATEWAY_UNAVAILABLE' }));
  const flow = { token: 'synthetic-flow', email: EMAIL, version: 4, idempotencyKey: 'synthetic-retry-key', contexts: [{ key: 'platform', kind: 'platform' }] };
  qa.scope.contextFlow = flow;
  qa.elements.selected = { value: 'platform' };
  await qa.login();
  assert.equal(qa.scope.contextFlow, flow);
  assert.equal(qa.elements.selected.value, 'platform');
  assert.equal(flow.version, 4);
  assert.equal(flow.idempotencyKey, 'synthetic-retry-key');
  const body = JSON.parse(qa.requests[0].options.body);
  assert.equal(body.command, 'select_context');
  assert.equal(body.expectedVersion, 4);
  assert.equal(qa.requests[0].options.headers['Idempotency-Key'], flow.idempotencyKey);
  assert.match(qa.state.message, /servicio de acceso no está disponible/);
  assert.equal(qa.state.sessions.length, 0);
});

test('valid login still opens explicit context selection and never chooses a scope automatically', async () => {
  const contexts = [{ key: 'platform', kind: 'platform' }, { key: 'municipal', kind: 'tenant' }];
  const qa = runtime(response(202, { code: 'CONTEXT_REQUIRED', contexts }));
  await qa.login();
  assert.equal(qa.state.contexts.length, 1);
  assert.equal(qa.state.contexts[0].context.contexts.length, 2);
  assert.equal(qa.state.sessions.length, 0);
  assert.equal(qa.requests.length, 1);
  assert.equal(qa.state.message, '');
});

test('specific email MFA delivery errors keep their recovery advice despite status 503', () => {
  const qa = runtime();
  for (const code of ['IDENTITY_DELIVERY_UNAVAILABLE', 'IDENTITY_EMAIL_MFA_UNAVAILABLE', 'IDENTITY_MFA_EMAIL_DELIVERY_UNAVAILABLE']) {
    const message = qa.scope.identityError({ code, status: 503 });
    assert.match(message, /aplicación autenticadora o un código de recuperación/);
    assert.doesNotMatch(message, /Revisá los datos|servicio de acceso no está disponible/);
  }
  assert.match(qa.scope.identityError({ code: 'IDENTITY_ORIGIN_FORBIDDEN', status: 403 }), /enlace institucional/);
});
