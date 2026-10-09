import test from 'node:test';
import assert from 'node:assert/strict';
import { createOwnBankAccountsHandler } from '../api/internal-own-bank-accounts.js';
import { bankAccountsFingerprint } from '../lib/internal-own-bank-accounts.js';
import { syntheticBankAccountsCommand as command, syntheticBankAccountsBootstrap as bootstrap, syntheticBankAccountsDetail as detail, bankAccountsIds as ids } from './fixtures/own-bank-accounts-synthetic.js';
const uid = n => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, '0')}`;
const caps = ['workforce.employee.read', 'payroll.parameter.read', 'payroll.parameter.prepare', 'payroll.parameter.approve'];
const principal = { user: { email: 'qa@example.invalid' }, tenant: { source: 'membership', id: uid(1), membershipId: uid(2), effectiveCapabilities: caps } };
const session = { email: 'qa@example.invalid', id: uid(3), version: 1, releaseSha: 'd'.repeat(40) };
const response = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.statusCode = n; return this; }, json(v) { this.value = v; return this; } });
const request = () => ({ method: 'POST', url: '/api/internal-own-bank-accounts', query: {}, headers: { origin: 'https://municipio.example', 'content-type': 'application/json', 'idempotency-key': ids.key }, body: JSON.stringify({ operation: 'command', payload: command() }) });
function receipt(patch = {}) { const body = command(); return { version: 'own-bank-accounts.v1', eventId: ids.proposal, proposalId: ids.proposal, requestKey: ids.key, requestSha256: bankAccountsFingerprint(body), body, status: 'pending', revision: 0, configurationVersion: body.baseVersion, replayed: false, transferGenerated: false, paymentExecuted: false, ...patch }; }
function setup(overrides = {}) {
 const calls = [], stats = { connections: 0 };
 const handler = createOwnBankAccountsHandler({ env: { INTERNAL_APP_ORIGIN: 'https://municipio.example' }, requireAccess: async () => ({ mode: 'managed', principal }), sessionFor: () => session, getSql: async () => { stats.connections++; return { query: async (q, v) => { calls.push({ q, v }); return [{ result: receipt() }]; } }; }, ...overrides }); return { handler, calls, stats };
}
test('preparación voluntaria conserva fuentes/referencias/clave con identidad autenticada', async () => { const a = setup(), res = response(); await a.handler(request(), res); assert.equal(res.statusCode, 201); assert.equal(a.calls.length, 1); const ctx = JSON.parse(a.calls[0].v[0]); assert.equal(ctx.actorSessionId, session.id); assert.equal(a.calls[0].v[2], ids.key); assert.deepEqual(res.value.data.body, command()); assert.equal(res.value.data.transferGenerated, false); assert.equal(res.value.data.paymentExecuted, false); assert.match(res.headers['Cache-Control'], /no-store/); });
test('clave no canónica se rechaza antes de guardar o recuperar y no se normaliza', async () => {
 const a = setup(), req = request(), res = response(); req.headers['idempotency-key'] = ids.key.toUpperCase();
 await a.handler(req, res); assert.equal(res.statusCode, 428); assert.equal(a.calls.length, 0);
 const get = request(); get.method = 'GET'; get.url += '?resource=attempt&key=' + ids.key.toUpperCase(); get.query = { resource: 'attempt', key: ids.key.toUpperCase() }; const recovered = response();
 await a.handler(get, recovered); assert.equal(recovered.statusCode, 428); assert.equal(a.calls.length, 0);
});
test('revocación/sesión inválida rechazan antes de leer bytes o conectar SQL', async () => {
 for (const override of [{ requireAccess: async () => ({ mode: 'managed', principal: { ...principal, tenant: { ...principal.tenant, effectiveCapabilities: [] } } }) }, { sessionFor: () => ({ ...session, id: null }) }]) {
  let reads = 0; const a = setup(override), req = request(), res = response(); Object.defineProperty(req, 'body', { get() { reads++; throw Error('prohibido'); } }); await a.handler(req, res); assert.ok([401, 403].includes(res.statusCode)); assert.equal(reads, 0); assert.equal(a.stats.connections, 0);
 }
});
for (const [label, change] of [
 ['origen ajeno', r => r.headers.origin = 'https://otro.invalid'],
 ['IAM declarado', r => r.body = JSON.stringify({ operation: 'command', payload: { ...command(), actorEmail: 'forged@example.invalid' } })],
 ['tipo de contenido', r => r.headers['content-type'] = 'text/plain'],
 ['campo JSON duplicado', r => r.body = '{"operation":"command","operati\\u006fn":"command"}'],
 ['clave ausente', r => delete r.headers['idempotency-key']],
 ['query duplicada', r => { r.method = 'GET'; r.query = { resource: 'bootstrap' }; r.url += '?resource=bootstrap&resource=bootstrap'; }],
 ['UTF8 inválido', r => r.body = Buffer.from([0xff])],
 ['DELETE', r => r.method = 'DELETE'],
 ['query en guardado', r => { r.query = { resource: 'command' }; r.url += '?resource=command'; }],
 ['número de cuenta numérico', r => { const p = command(); p.definition.accounts[0].accountNumber = 0; r.body = JSON.stringify({ operation: 'command', payload: p }); }],
 ['DNI libre', r => { const p = command(); p.definition.accounts[0].dni = 'synthetic'; r.body = JSON.stringify({ operation: 'command', payload: p }); }],
 ]) test('rechaza ' + label + ' sin guardar', async () => { const a = setup(), req = request(), res = response(); change(req); await a.handler(req, res); assert.ok(res.statusCode >= 400); assert.equal(a.calls.length, 0); });
test('lectura consulta conjunto completo pero no habilita preparación', async () => {
 const p = { ...principal, tenant: { ...principal.tenant, effectiveCapabilities: caps.slice(0, 2) } }, a = setup({ requireAccess: async () => ({ mode: 'managed', principal: p }) }), res = response(); await a.handler(request(), res); assert.equal(res.statusCode, 403); assert.equal(a.calls.length, 0);
 const b = setup({ getSql: async () => ({ query: async () => [{ result: bootstrap() }] }) }), req = request(), out = response(); req.method = 'GET'; req.query = { resource: 'bootstrap' }; req.url += '?resource=bootstrap'; await b.handler(req, out); assert.equal(out.statusCode, 200); assert.equal(out.value.data.complete, true);
});
test('revisión obtiene cuerpo/fuentes capturados y verifica hash e identidad de propuesta', async () => {
 const value = await detail();
 for (const change of [null, d => d.proposal.id = uid(8), d => d.body.definition.accounts[0].documentReference = 'CHANGED', d => d.sources.version = 'f'.repeat(64)]) {
  const d = structuredClone(value); if (change) change(d); const a = setup({ getSql: async () => ({ query: async () => [{ result: d }] }) }), req = request(), res = response(); req.method = 'GET'; req.query = { resource: 'detail', id: ids.proposal }; req.url += '?resource=detail&id=' + ids.proposal; await a.handler(req, res); assert.equal(res.statusCode, change ? 503 : 200);
 }
});
test('comprobante alterado nunca se informa guardado y errores SQL no exponen información', async () => {
 for (const result of [receipt({ requestSha256: 'f'.repeat(64) }), receipt({ transferGenerated: true }), receipt({ requestKey: uid(9) })]) { const a = setup({ getSql: async () => ({ query: async () => [{ result }] }) }), res = response(); await a.handler(request(), res); assert.equal(res.statusCode, 503); }
 const a = setup({ getSql: async () => ({ query: async () => { throw Error('internal database secret'); } }) }), res = response(); await a.handler(request(), res); assert.equal(res.statusCode, 503); assert.ok(!JSON.stringify(res.value).includes('secret'));
});
test('recuperar conserva cuerpo original sin reemplazarlo con catálogo nuevo', async () => {
 const a = setup({ getSql: async () => ({ query: async () => [{ result: receipt({ replayed: true }) }] }) }), req = request(), res = response(); req.method = 'GET'; req.query = { resource: 'attempt', key: ids.key }; req.url += '?resource=attempt&key=' + ids.key; await a.handler(req, res); assert.equal(res.statusCode, 200); assert.equal(res.headers['Idempotency-Replayed'], 'true'); assert.deepEqual(res.value.data.body, command());
});
test('errores del contrato SQL preservan código/acción y no se convierten en éxito', async () => {
 for (const [code, status] of [['SOURCE_REQUIRED',422],['HISTORY_REQUIRED',422],['BASE_CHANGED',409],['INDEPENDENT_REQUIRED',403],['NOT_FOUND',404],['BUSY',409]]) { const a = setup({ getSql: async () => ({ query: async () => { throw Error('BANK_ACCOUNTS_' + code); } }) }), res = response(); await a.handler(request(), res); assert.equal(res.statusCode, status); assert.equal(res.value.code, 'BANK_ACCOUNTS_' + code); }
});
