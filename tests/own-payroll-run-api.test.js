import test from 'node:test';
import assert from 'node:assert/strict';
import { createOwnRunHandler } from '../api/internal-own-payroll-run.js';
import { RUN_READ, RUN_CALCULATE } from '../lib/internal-own-payroll-run.js';
import { capture, saved, runCommand } from './fixtures/own-payroll-run-synthetic.js';
import { uid, hash } from './fixtures/own-payroll-program-synthetic.js';
const principal = { user: { email: 'qa@example.invalid' }, tenant: { source: 'membership', id: uid(1), membershipId: uid(2), effectiveCapabilities: RUN_CALCULATE } }, session = { email: 'qa@example.invalid', id: uid(3), version: 1, releaseSha: 'd'.repeat(40) };
const response = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, json(v) { this.value = v; return this; } });
const request = () => ({ method: 'POST', url: '/api/internal-own-payroll-run', query: {}, headers: { origin: 'https://municipio.example', 'content-type': 'application/json', 'idempotency-key': uid(9) }, body: JSON.stringify({ operation: 'calculate', payload: runCommand() }) });
function setup(overrides = {}) {
  const calls = [], stats = { connections: 0 }, c = capture();
  const handler = createOwnRunHandler({ env: { INTERNAL_APP_ORIGIN: 'https://municipio.example' }, requireAccess: async () => ({ mode: 'managed', principal }), sessionFor: () => session, algorithmHash: () => hash('c'), getSql: async () => { stats.connections++; return { query: async (q, v) => { calls.push({ q, v }); return [{ result: calls.length === 1 ? c : saved(c) }]; } }; }, ...overrides }); return { handler, calls, stats };
}
test('POST voluntario captura y calcula con identidad autenticada, sin datos fuente en cuerpo', async () => {
  const a = setup(), res = response(); await a.handler(request(), res); assert.equal(res.statusCode, 201); assert.equal(a.calls.length, 2); assert.equal(JSON.parse(a.calls[0].v[0]).actorSessionId, session.id); assert.deepEqual(JSON.parse(a.calls[0].v[1]), runCommand()); assert.equal(res.value.data.saved.result.paymentExecuted, false);
});
test('revocación de cada capacidad impide leer cuerpo y conectar', async () => {
  for (const cap of RUN_CALCULATE) { let reads = 0; const a = setup({ requireAccess: async () => ({ mode: 'managed', principal: { ...principal, tenant: { ...principal.tenant, effectiveCapabilities: RUN_CALCULATE.filter(c => c !== cap) } } }) }), req = request(), res = response(); Object.defineProperty(req, 'body', { get() { reads++; throw Error('no'); } }); await a.handler(req, res); assert.equal(res.statusCode, 403, cap); assert.equal(reads, 0); assert.equal(a.stats.connections, 0); }
});
for (const [label, change] of [['origen', r => r.headers.origin = 'https://otro.invalid'], ['importe cliente', r => r.body = JSON.stringify({ operation: 'calculate', payload: { ...runCommand(), input: { amount: '100' } } })], ['actor cliente', r => r.body = JSON.stringify({ operation: 'calculate', payload: { ...runCommand(), tenantId: uid(1) } })], ['medio', r => r.headers['content-type'] = 'text/plain'], ['JSON duplicado', r => r.body = '{"operation":"calculate","operati\\u006fn":"calculate"}'], ['clave', r => delete r.headers['idempotency-key']], ['consulta duplicada', r => { r.method = 'GET'; r.query = { resource: 'bootstrap' }; r.url += '?resource=bootstrap&resource=bootstrap'; }], ['UTF8', r => r.body = Buffer.from([255])], ['método', r => r.method = 'DELETE']]) test('rechaza ' + label + ' sin capturar fuentes', async () => { const a = setup(), req = request(), res = response(); change(req); await a.handler(req, res); assert.ok(res.statusCode >= 400); assert.equal(a.calls.length, 0); });
test('bootstrap sin permiso nominal no expone capturas; GET attempt exige nominal', async () => {
  const p = { ...principal, tenant: { ...principal.tenant, effectiveCapabilities: RUN_READ } }, data = { version: 'own-payroll-bootstrap.v1', scopeVersion: hash('a'), programVersion: hash('b'), canCalculate: false, runs: [], complete: true };
  const a = setup({ requireAccess: async () => ({ mode: 'managed', principal: p }), getSql: async () => ({ query: async () => [{ result: data }] }) });
  for (const resource of ['bootstrap', 'attempt']) { const req = request(), res = response(); req.method = 'GET'; req.query = resource === 'bootstrap' ? { resource } : { resource, key: uid(9) }; req.url += '?' + new URLSearchParams(req.query); await a.handler(req, res); assert.equal(res.statusCode, resource === 'bootstrap' ? 200 : 403); }
});
test('replay conservado devuelve 200 sin calcular con motor nuevo', async () => {
  const c = capture({ replayed: true }); c.saved = saved(c); const a = setup({ algorithmHash: () => hash('e'), getSql: async () => ({ query: async () => [{ result: c }] }) }), res = response(); await a.handler(request(), res); assert.equal(res.statusCode, 200); assert.equal(res.headers['Idempotency-Replayed'], 'true'); assert.equal(res.headers['Cache-Control'].includes('no-store'), true);
});
