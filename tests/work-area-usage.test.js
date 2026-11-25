// «Lo que más usás»: contadores por acceso y por usuario, sin datos de personas ni de liquidaciones.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readWorkUsage, countWorkUse} from '../assets/work-area-usage.js';

test('cuenta usos por usuario y acceso, y tolera un navegador sin almacenamiento', () => {
  const data = new Map();
  globalThis.localStorage = {getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v)};
  countWorkUse('u1', 'novedades-nomina.html'); countWorkUse('u1', 'novedades-nomina.html'); countWorkUse('u2', 'nomina.html#calculo');
  assert.deepEqual(readWorkUsage('u1'), {'novedades-nomina.html': 2});
  assert.deepEqual(readWorkUsage('u2'), {'nomina.html#calculo': 1});
  countWorkUse('u1', ''); countWorkUse('u1', 'x'.repeat(201));
  assert.deepEqual(Object.keys(readWorkUsage('u1')), ['novedades-nomina.html']);
  delete globalThis.localStorage;
  assert.deepEqual(readWorkUsage('u1'), {});
  assert.doesNotThrow(() => countWorkUse('u1', 'a'));
});
