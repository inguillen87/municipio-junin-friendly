import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), 'utf8');

function extractAsyncFunction(source, name) {
  const marker = `async function ${name}()`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `falta ${marker}`);
  const open = source.indexOf('{', start + marker.length);
  assert.notEqual(open, -1, `falta el cuerpo de ${name}`);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`el cuerpo de ${name} no cierra`);
}

function instantiate(functionSource, name, bindings) {
  const names = Object.keys(bindings);
  const values = names.map((key) => bindings[key]);
  return new Function(...names, `'use strict'; ${functionSource}; return ${name};`)(...values);
}

function storageRecorder() {
  const removed = [];
  return {
    removed,
    storage: { removeItem(key) { removed.push(key); } },
  };
}

test('Cerrar sesión en la vista agregada intenta revocar y siempre termina en login', async () => {
  const html = read('friendly-dashboard.html');
  const source = extractAsyncFunction(html, 'logout');

  for (const rejected of [false, true]) {
    const calls = [];
    const destinations = [];
    const { storage, removed } = storageRecorder();
    const logout = instantiate(source, 'logout', {
      authenticatedSession: true,
      fetch: async (url, options) => {
        calls.push({ url, options });
        if (rejected) throw new TypeError('network unavailable');
        return { ok: true };
      },
      sessionStorage: storage,
      window: { location: { replace(value) { destinations.push(value); } } },
    });

    await logout();
    assert.deepEqual(calls, [{
      url: '/api/internal-auth',
      options: {
        method: 'DELETE', credentials: 'same-origin', cache: 'no-store',
        headers: { Accept: 'application/json', 'Cache-Control': 'no-store' },
      },
    }]);
    assert.deepEqual(removed, ['mjunin_user']);
    assert.deepEqual(destinations, ['login.html']);
  }

  assert.doesNotMatch(html, /location\.href\s*=\s*['"]friendly-dashboard\.html['"]/);
});

test('la vista agregada anónima abre login sin intentar una revocación', async () => {
  const html = read('friendly-dashboard.html');
  const source = extractAsyncFunction(html, 'logout');
  const assigned = [];
  const logout = instantiate(source, 'logout', {
    authenticatedSession: false,
    fetch: async () => assert.fail('no debe revocar una sesión que no existe'),
    sessionStorage: { removeItem() { assert.fail('no debe limpiar una sesión inexistente'); } },
    window: { location: { assign(value) { assigned.push(value); } } },
  });

  await logout();
  assert.deepEqual(assigned, ['login.html?next=internal-dashboard.html%23inicio']);
});

test('Salir de Portal Interno intenta revocar y siempre vuelve al login', async () => {
  const html = read('internal-dashboard.html');
  const source = extractAsyncFunction(html, 'logout');

  for (const rejected of [false, true]) {
    const calls = [];
    const redirects = [];
    const { storage, removed } = storageRecorder();
    const attributes = [];
    const logoutButton = {
      disabled: false,
      setAttribute(name, value) { attributes.push([name, value]); },
      removeAttribute() { assert.fail('el cierre no debe reactivar el botón'); },
    };
    const logout = instantiate(source, 'logout', {
      AUTH_URL: '/api/internal-auth',
      els: { logoutButton },
      fetch: async (url, options) => {
        calls.push({ url, options });
        if (rejected) throw new TypeError('network unavailable');
        return { ok: true };
      },
      sessionStorage: storage,
      redirectToLogin() { redirects.push('login'); },
    });

    await logout();
    assert.equal(logoutButton.disabled, true);
    assert.deepEqual(attributes, [['aria-busy', 'true']]);
    assert.deepEqual(calls, [{
      url: '/api/internal-auth',
      options: {
        method: 'DELETE', credentials: 'same-origin', cache: 'no-store',
        headers: { Accept: 'application/json', 'Cache-Control': 'no-store' },
      },
    }]);
    assert.deepEqual(removed, ['mjunin_user']);
    assert.deepEqual(redirects, ['login']);
  }

  assert.doesNotMatch(source, /requestJSON\(AUTH_URL/);
});
