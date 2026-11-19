import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAttendanceAreaEffectivityHandler} from '../api/internal-attendance-area-effectivity.js';
import {areaEffectivityRead, areaEffectivityWrite, areaEffectivitySafeError} from '../lib/internal-attendance-area-effectivity.js';
import {id, session, principal, state, pending, propose, review, receipt} from './fixtures/attendance-area-effectivity-synthetic.js';

const ENDPOINT = '/api/internal-attendance-area-effectivity';
const response = () => ({headers: {}, setHeader(k, v) {this.headers[k] = v;}, status(n) {this.statusCode = n; return this;}, json(v) {this.payload = v; return this;}});
const post = (payload = propose(), patch = {}) => ({method: 'POST', url: ENDPOINT, query: {}, headers: {origin: 'https://municipio.example', 'sec-fetch-site': 'same-origin',
  'content-type': 'application/json', 'idempotency-key': id(10), ...patch.headers}, body: patch.body ?? JSON.stringify({operation: 'command', payload})});
const get = (query = {}) => ({method: 'GET', url: ENDPOINT + (Object.keys(query).length ? '?' + new URLSearchParams(query) : ''), query, headers: {}});
function setup(options = {}) {
  const stats = {connections: 0}, sql = {calls: [], async query(text, values) {this.calls.push({text, values}); if (options.error) throw options.error; return options.rows ?? [{result: JSON.stringify(options.result ?? state())}];}};
  const handler = createAttendanceAreaEffectivityHandler({env: {INTERNAL_APP_ORIGIN: 'https://municipio.example'}, sessionFor: () => options.session ?? session,
    requireAccess: async (_req, res, gates) => {stats.gates = gates; if (options.anonymous) {res.status(401).json({ok: false}); return null;} return options.access ?? {mode: 'managed', principal: principal(options.capabilities)};},
    getSql: async () => {stats.connections++; return sql;}});
  return {handler, sql, stats};
}

test('la lectura exige membresía municipal con una capacidad de legajo y llama a una sola fachada', async () => {
  const {handler, sql, stats} = setup({result: state({pending: pending()})}), res = response();
  await handler(get(), res);
  assert.equal(res.statusCode, 200); assert.equal(res.payload.data.pending.itemCount, 5);
  assert.deepEqual(stats.gates.requiredCapabilities, ['employee.record.propose', 'employee.record.approve']); assert.equal(stats.gates.capabilityMode, 'any');
  assert.equal(stats.gates.requireDataPlaneReady, true); assert.equal(stats.gates.requireCertifiedDataBinding, true); assert.equal(stats.gates.allowLegacy, false);
  assert.equal(sql.calls.length, 1); assert.match(sql.calls[0].text, /^SELECT public\.attendance_area_effectivity_read_v1\(\$1::jsonb,\$2::jsonb\)::text AS result$/);
  assert.deepEqual(Object.keys(JSON.parse(sql.calls[0].values[0])).sort(), ['actorEmail', 'actorSessionId', 'actorSessionVersion', 'membershipId', 'releaseSha', 'tenantId']);
  assert.equal(sql.calls[0].values[1], '{}'); assert.match(res.headers['Cache-Control'], /private, no-store/);
});
test('preparar envía el pedido validado con su clave; el comprobante debe corresponder', async () => {
  const {handler, sql} = setup({result: receipt()}), res = response();
  await handler(post(), res);
  assert.equal(res.statusCode, 201); assert.match(sql.calls[0].text, /attendance_area_effectivity_command_v1\(\$1::jsonb,\$2::jsonb,\$3::uuid\)/);
  assert.deepEqual(JSON.parse(sql.calls[0].values[1]), propose()); assert.equal(sql.calls[0].values[2], id(10));
  const replay = setup({result: receipt(propose(), {replayed: true})}), again = response();
  await replay.handler(post(), again); assert.equal(again.statusCode, 200); assert.equal(again.headers['Idempotency-Replayed'], 'true');
  const other = setup({result: receipt(propose({effectiveFrom: '2026-10-01'}))}), mismatch = response();
  await other.handler(post(), mismatch); assert.equal(mismatch.statusCode, 503);
});
test('sin la capacidad de la operación no se abre ninguna conexión', async () => {
  for (const [capabilities, payload, status] of [
    [['employee.record.approve'], propose(), 403], [['employee.record.propose'], review(), 403], [['workforce.employee.read'], review({decision: 'reject'}), 403],
    [['employee.record.propose'], review({decision: 'reject'}), 201], [['employee.record.approve'], review(), 201]]) {
    const {handler, stats} = setup({capabilities, result: receipt(payload)}), res = response();
    await handler(post(payload), res);
    assert.equal(res.statusCode, status, JSON.stringify([capabilities, payload.action, payload.decision])); assert.equal(stats.connections, status === 201 ? 1 : 0);
  }
  for (const access of [{mode: 'legacy', principal: principal()}, {mode: 'managed', principal: {...principal(), tenant: {...principal().tenant, source: 'platform'}}},
    {mode: 'managed', principal: {...principal(), tenant: null}}]) {
    const {handler, stats} = setup({access}), res = response();
    await handler(get(), res); assert.equal(res.statusCode, 403); assert.equal(stats.connections, 0);
  }
  const anonymous = setup({anonymous: true}), res = response();
  await anonymous.handler(get(), res); assert.equal(res.statusCode, 401); assert.equal(anonymous.stats.connections, 0);
  const stale = setup({session: {...session, releaseSha: 'b'.repeat(40)}}), late = response();
  await stale.handler(get(), late); assert.equal(late.statusCode, 401); assert.equal(stale.stats.connections, 0);
});
for (const [label, mutate, status] of [
  ['origen ajeno', r => { r.headers.origin = 'https://other.invalid'; }, 403], ['tipo de contenido', r => { r.headers['content-type'] = 'text/plain'; }, 415],
  ['sin clave', r => { delete r.headers['idempotency-key']; }, 428], ['clave que no es v4', r => { r.headers['idempotency-key'] = 'e0000000-0000-1000-8000-000000000010'; }, 428],
  ['operación desconocida', r => { r.body = JSON.stringify({operation: 'delete', payload: propose()}); }, 400],
  ['campo extra del cliente', r => { r.body = JSON.stringify({operation: 'command', payload: {...propose(), tenantId: id(20)}}); }, 422],
  ['nombre JSON duplicado', r => { r.body = '{"operation":"command","operati\\u006fn":"command","payload":{}}'; }, 400],
  ['filtro en el envío', r => { r.url += '?tenantId=' + id(1); r.query = {tenantId: id(1)}; }, 400],
]) test('un envío inválido no llega a la base · ' + label, async () => {
  const {handler, stats} = setup({result: receipt()}), req = post(), res = response();
  mutate(req); await handler(req, res);
  assert.equal(res.statusCode, status); assert.equal(res.payload.ok, false); assert.equal(stats.connections, 0);
});
test('la lectura no admite filtros ni otros métodos', async () => {
  const {handler, stats} = setup(), res = response();
  await handler(get({tenantId: id(1)}), res); assert.equal(res.statusCode, 400);
  const other = response(); await handler({method: 'DELETE', url: ENDPOINT, query: {}, headers: {}}, other);
  assert.equal(other.statusCode, 405); assert.equal(other.headers.Allow, 'GET, POST'); assert.equal(stats.connections, 0);
});
test('una respuesta de otro contexto, ambigua o con datos de más se descarta completa', async () => {
  const p = principal();
  for (const mutate of [s => { s.principal.membershipId = id(77); }, s => { s.principal.sessionVersion = 2; }, s => { s.preview.scopes.all.items = []; }, s => { s.pending = {contractId: id(7)}; }])
  { const value = state(); mutate(value); await assert.rejects(areaEffectivityRead({query: async () => [{result: JSON.stringify(value)}]}, p, session), e => e.status === 503); }
  for (const rows of [[], [{result: '{}'}, {result: '{}'}], [{result: 7}], [{result: '{"version":1,"version":2}'}]])
    await assert.rejects(areaEffectivityRead({query: async () => rows}, p, session), e => e.status === 503);
  await assert.rejects(areaEffectivityWrite({query: async () => [{result: JSON.stringify(receipt())}]}, p, session, propose(), 'no-es-clave'), e => e.status === 428);
});
test('los errores de la base se traducen a mensajes y estados estables, sin filtrar texto interno', () => {
  for (const [message, code, status] of [
    ['ATTENDANCE_SESSION_INVALID', 'SESSION_INVALID', 401], ['ATTENDANCE_AREA_EFFECTIVITY_SAME_ACTOR', 'INDEPENDENT_REQUIRED', 403],
    ['ATTENDANCE_AREA_EFFECTIVITY_REVIEW_INVALID', 'INDEPENDENT_REQUIRED', 403], ['ATTENDANCE_AREA_EFFECTIVITY_ACTOR_REQUIRED', 'ACTOR_REQUIRED', 403],
    ['TIME_CATALOG_EMPLOYMENT_REQUIRED', 'ACTOR_REQUIRED', 403], ['ATTENDANCE_AREA_EFFECTIVITY_CAPABILITY_REQUIRED', 'FORBIDDEN', 403],
    ['ATTENDANCE_RELEASE_NOT_CERTIFIED', 'SCOPE_CHANGED', 409], ['ATTENDANCE_AREA_EFFECTIVITY_IDEMPOTENCY_CONFLICT', 'ATTEMPT_CONFLICT', 409],
    ['ATTENDANCE_AREA_EFFECTIVITY_PENDING_EXISTS', 'PENDING_EXISTS', 409], ['ATTENDANCE_AREA_EFFECTIVITY_PREVIEW_CHANGED', 'PREVIEW_CHANGED', 409],
    ['ATTENDANCE_AREA_EFFECTIVITY_PROPOSAL_CHANGED', 'VERSION_CONFLICT', 409], ['ATTENDANCE_AREA_EFFECTIVITY_ALREADY_REVIEWED', 'VERSION_CONFLICT', 409],
    ['ATTENDANCE_AREA_EFFECTIVITY_STALE', 'STALE', 409], ['ATTENDANCE_AREA_EFFECTIVITY_DATE_INVALID', 'DATE_INVALID', 422],
    ['ATTENDANCE_AREA_EFFECTIVITY_NOTHING_TO_DECLARE', 'NOTHING_TO_DECLARE', 409], ['ATTENDANCE_AREA_EFFECTIVITY_NOT_FOUND', 'NOT_FOUND', 404],
    ['ATTENDANCE_AREA_EFFECTIVITY_LIMIT', 'LIMIT', 413], ['ATTENDANCE_AREA_EFFECTIVITY_INPUT_INVALID', 'INPUT_INVALID', 422],
    ['ATTENDANCE_AREA_EFFECTIVITY_BUSY', 'BUSY', 409], ['function public.attendance_area_effectivity_read_v1(jsonb, jsonb) does not exist', 'UNAVAILABLE', 503],
    ['connection terminated unexpectedly', 'UNAVAILABLE', 503]]) {
    const safe = areaEffectivitySafeError(new Error(message));
    assert.equal(safe.code, 'ATTENDANCE_AREA_EFFECTIVITY_' + code, message); assert.equal(safe.status, status, message);
    assert.doesNotMatch(safe.message, /attendance_area|public\.|TIME_CATALOG|SQL/i);
  }
});
test('la función queda declarada con su límite de tiempo y los archivos del panel entran en la publicación', () => {
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
  assert.deepEqual(vercel.functions['api/internal-attendance-area-effectivity.js'], {maxDuration: 30});
  const build = readFileSync('scripts/build-friendly.mjs', 'utf8');
  for (const file of ['assets/attendance-area-effectivity-model.js', 'assets/attendance-area-effectivity-ui.js', 'assets/attendance-area-effectivity.css']) assert.ok(build.includes("'" + file + "'"), file);
  const page = readFileSync('internal-dashboard.html', 'utf8');
  assert.match(page, /<details class="area-effectivity" data-area-effectivity data-requires-any-capability="employee\.record\.propose employee\.record\.approve"><\/details>/);
  assert.match(page, /<script type="module" src="assets\/attendance-area-effectivity-ui\.js"><\/script>/);
});
