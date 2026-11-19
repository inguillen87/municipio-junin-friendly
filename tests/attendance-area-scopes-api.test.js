// Real facade and handler against stub access and SQL clients. Synthetic accounts and areas only; no database.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PassThrough} from 'node:stream';
import {createAttendanceAreaScopesHandler} from '../api/internal-attendance-area-scopes.js';
import {
  AREA_SCOPE_ADMIN_READ_SQL, AREA_SCOPE_ADMIN_COMMAND_SQL, areaScopeAdminContext, areaScopeAdminRead, areaScopeAdminWrite, areaScopeAdminSafeError,
} from '../lib/internal-attendance-area-scopes.js';
import {
  AREA_SCOPE_ADMIN_MAX_BYTES, AREA_SCOPE_ADMIN_READ_AUTHORITY, AREA_SCOPE_ADMIN_WRITE_AUTHORITY, AreaScopeAdminError,
  buildAreaScopeCommand, normalizeAreaScopeReference, validateAreaScopeCommand, validateAreaScopeQuery,
  validateAreaScopeReadResponse, validateAreaScopeCommandResponse,
} from '../assets/attendance-area-scopes-model.js';
import {id, TENANT, OTHER_TENANT, RELEASE, KEY, ADMIN_EMAIL, session, owner, member, scope, reading, command, receipt} from './fixtures/attendance-area-scopes-synthetic.js';

const ORIGIN = 'https://municipio.example';
const response = () => ({headers: {}, setHeader(k, v) {this.headers[k] = v;}, status(n) {this.statusCode = n; return this;}, json(v) {this.payload = v; return this;}});
const get = (q = {resource: 'scopes', tenantId: TENANT}) => ({method: 'GET', url: '/api/internal-attendance-area-scopes?' + new URLSearchParams(q), query: q, headers: {}});
const post = (payload = command(), changes = {}) => ({method: 'POST', url: '/api/internal-attendance-area-scopes', query: {},
  headers: {origin: ORIGIN, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', 'idempotency-key': KEY},
  body: JSON.stringify({operation: 'command', tenantId: TENANT, payload}), ...changes});
function setup(options = {}) {
  const stats = {connections: 0, gates: null};
  const sql = {calls: [], async query(text, values) {
    this.calls.push({text, values});
    if (options.error) throw options.error;
    return options.rows ?? [{result: JSON.stringify(options.result ?? (text === AREA_SCOPE_ADMIN_READ_SQL ? reading() : receipt()))}];
  }};
  const handler = createAttendanceAreaScopesHandler({
    env: options.env ?? {INTERNAL_APP_ORIGIN: ORIGIN, INTERNAL_CERTIFIED_DATA_CONTRACT_SHA: RELEASE},
    requireAccess: async (_req, res, gates) => {
      stats.gates = gates;
      if (options.anonymous) { res.status(401).json({ok: false, code: 'IDENTITY_SESSION_REQUIRED'}); return null; }
      return options.access ?? {mode: 'managed', principal: owner(), session};
    },
    getSql: async () => { stats.connections++; return sql; },
  });
  return {handler, sql, stats};
}
const run = async (options, req) => { const kit = setup(options), res = response(); await kit.handler(req, res); return {...kit, res}; };

test('la lectura exige la autoridad de administración de plataforma y llama a una sola función con el contexto exacto', async () => {
  const {res, sql, stats} = await run({}, get());
  assert.equal(res.statusCode, 200, JSON.stringify(res.payload));
  assert.deepEqual(stats.gates.requiredCapabilities, ['platform.users.manage']);
  assert.equal(stats.gates.capabilityMode, 'all'); assert.equal(stats.gates.allowLegacy, false);
  assert.equal(sql.calls.length, 1); assert.equal(sql.calls[0].text, AREA_SCOPE_ADMIN_READ_SQL);
  assert.match(sql.calls[0].text, /^SELECT public\.attendance_area_scope_admin_read_v1\(\$1::jsonb,\$2::jsonb\)::text AS result$/);
  assert.deepEqual(JSON.parse(sql.calls[0].values[0]), {actorEmail: ADMIN_EMAIL, actorSessionId: session.id, actorSessionVersion: 3, releaseSha: RELEASE, tenantId: TENANT});
  assert.deepEqual(JSON.parse(sql.calls[0].values[1]), {resource: 'scopes'});
  assert.deepEqual(res.payload.data, reading());
  assert.match(res.headers['Cache-Control'], /private, no-store/);
});

test('conceder o retirar exige además platform.roles.manage, clave de envío y deja una sola orden en SQL', async () => {
  const {res, sql, stats} = await run({}, post());
  assert.equal(res.statusCode, 200, JSON.stringify(res.payload));
  assert.deepEqual(stats.gates.requiredCapabilities, ['platform.users.manage', 'platform.roles.manage']);
  assert.equal(sql.calls.length, 1); assert.equal(sql.calls[0].text, AREA_SCOPE_ADMIN_COMMAND_SQL);
  assert.match(sql.calls[0].text, /^SELECT public\.attendance_area_scope_admin_command_v1\(\$1::jsonb,\$2::jsonb,\$3::uuid\)::text AS result$/);
  assert.deepEqual(Object.keys(JSON.parse(sql.calls[0].values[0])).sort(), ['actorEmail', 'actorSessionId', 'actorSessionVersion', 'releaseSha', 'tenantId']);
  assert.deepEqual(JSON.parse(sql.calls[0].values[1]), command()); assert.equal(sql.calls[0].values[2], KEY);
  assert.equal(res.payload.data.scope.active, true); assert.equal(res.headers['Idempotency-Replayed'], undefined);
  const withdraw = command({operation: 'withdraw', area: {organizationUnitSourceId: '701', sectorSourceId: '5'}});
  const replay = await run({result: receipt(withdraw, {changed: false, replayed: true})}, post(withdraw));
  assert.equal(replay.res.statusCode, 200); assert.equal(replay.res.headers['Idempotency-Replayed'], 'true');
  // Las mismas autoridades que hoy asignan capacidades y alcances en la administración existente.
  const admin = readFileSync(new URL('../api/internal-admin.js', import.meta.url), 'utf8');
  assert.ok(admin.includes("update_access: '" + AREA_SCOPE_ADMIN_READ_AUTHORITY[0] + "'") && admin.includes("replace_action_scopes: '" + AREA_SCOPE_ADMIN_WRITE_AUTHORITY[1] + "'"));
});

test('sin autoridad no se abre la base ni se lee el cuerpo: anónimo, ámbito municipal, sin capacidad, sin rol propietario, sesión ajena', async () => {
  const cases = [
    [{anonymous: true}, 401, post()],
    [{access: {mode: 'legacy', principal: owner(), session}}, 403, post()],
    [{access: {mode: 'managed', principal: owner({tenant: {id: TENANT, source: 'membership', membershipId: id(10)}}), session}}, 403, post()],
    [{access: {mode: 'managed', principal: owner({tenant: {id: TENANT, source: 'membership', membershipId: id(10)}}), session}}, 403, get()],
    [{access: {mode: 'managed', principal: owner({platform: {roles: ['PLATFORM_OWNER'], capabilities: ['platform.users.manage']}}), session}}, 403, post()],
    [{access: {mode: 'managed', principal: owner({platform: {roles: ['PLATFORM_OWNER'], capabilities: ['platform.roles.manage']}}), session}}, 403, get()],
    [{access: {mode: 'managed', principal: owner({platform: {roles: [], capabilities: ['platform.users.manage', 'platform.roles.manage']}}), session}}, 403, post()],
    [{access: {mode: 'managed', principal: owner({authorized: false}), session}}, 403, get()],
    [{access: {mode: 'managed', principal: owner(), session: {...session, email: 'otra.cuenta@example.invalid'}}}, 401, post()],
    [{access: {mode: 'managed', principal: owner(), session: {...session, version: 0}}}, 401, get()],
    [{access: {mode: 'managed', principal: owner(), session: {...session, id: 'sin-sesion'}}}, 401, get()],
  ];
  for (const [options, status, req] of cases) {
    Object.defineProperty(req, 'body', {get() { throw Error('el cuerpo privado no debe leerse'); }});
    const {res, stats, sql} = await run(options, req);
    assert.equal(res.statusCode, status, JSON.stringify([options, res.payload]));
    assert.equal(stats.connections, 0); assert.equal(sql.calls.length, 0); assert.equal(res.payload.ok, false);
  }
  // Leer no alcanza para cambiar: con sólo platform.users.manage la lectura pasa y el cambio no.
  const reader = {mode: 'managed', principal: owner({platform: {roles: ['PLATFORM_OWNER'], capabilities: ['platform.users.manage']}}), session};
  assert.equal((await run({access: reader}, get())).res.statusCode, 200);
  const denied = await run({access: reader}, post());
  assert.equal(denied.res.statusCode, 403); assert.equal(denied.res.payload.code, 'ATTENDANCE_AREA_SCOPE_FORBIDDEN'); assert.equal(denied.stats.connections, 0);
  const tenant = await run({access: {mode: 'managed', principal: owner({tenant: {id: TENANT}}), session}}, get());
  assert.equal(tenant.res.payload.code, 'ATTENDANCE_AREA_SCOPE_PLATFORM_CONTEXT_REQUIRED');
});

test('sin contrato de datos certificado o sin acceso aislado de administración responde 503 y no consulta', async () => {
  for (const env of [{INTERNAL_APP_ORIGIN: ORIGIN}, {INTERNAL_APP_ORIGIN: ORIGIN, INTERNAL_CERTIFIED_DATA_CONTRACT_SHA: 'no-es-un-sha'}]) {
    const {res, stats} = await run({env}, get());
    assert.equal(res.statusCode, 503); assert.equal(res.payload.code, 'ATTENDANCE_AREA_SCOPE_UNAVAILABLE'); assert.equal(stats.connections, 0);
  }
  const handler = createAttendanceAreaScopesHandler({env: {INTERNAL_APP_ORIGIN: ORIGIN, INTERNAL_CERTIFIED_DATA_CONTRACT_SHA: RELEASE},
    requireAccess: async () => ({mode: 'managed', principal: owner(), session}),
    getSql: async () => { throw Object.assign(Error('rol de base no permitido'), {code: 'INTERNAL_ADMIN_DATABASE_ROLE_REQUIRED'}); }});
  const res = response(); await handler(get(), res);
  assert.equal(res.statusCode, 503); assert.equal(res.payload.code, 'ATTENDANCE_AREA_SCOPE_UNAVAILABLE'); assert.doesNotMatch(res.payload.error, /rol de base/);
});

for (const [label, mutate] of [
  ['origen ajeno', r => r.headers.origin = 'https://otro.invalid'],
  ['sitio cruzado', r => r.headers['sec-fetch-site'] = 'cross-site'],
  ['tipo de contenido', r => r.headers['content-type'] = 'text/plain'],
  ['sin clave de envío', r => delete r.headers['idempotency-key']],
  ['clave que no es UUID v4', r => r.headers['idempotency-key'] = 'dddddddd-0000-1000-8000-000000000001'],
  ['nombre JSON repetido', r => r.body = '{"operation":"command","operati\\u006fn":"command","tenantId":"' + TENANT + '","payload":{}}'],
  ['actor enviado por el cliente', r => r.body = JSON.stringify({operation: 'command', tenantId: TENANT, payload: {...command(), actorEmail: ADMIN_EMAIL}})],
  ['fuente enviada por el cliente', r => r.body = JSON.stringify({operation: 'command', tenantId: TENANT, sourceBindingId: id(5), payload: command()})],
  ['municipio ausente', r => r.body = JSON.stringify({operation: 'command', payload: command()})],
  ['municipio inválido', r => r.body = JSON.stringify({operation: 'command', tenantId: 'todos', payload: command()})],
  ['operación desconocida', r => r.body = JSON.stringify({operation: 'replace', tenantId: TENANT, payload: command()})],
  ['UTF-8 inválido', r => r.body = Buffer.from([0xff])],
  ['cuerpo demasiado grande', r => r.body = ' '.repeat(AREA_SCOPE_ADMIN_MAX_BYTES + 1)],
  ['longitud declarada demasiado grande', r => r.headers['content-length'] = String(AREA_SCOPE_ADMIN_MAX_BYTES + 1)],
  ['envío con filtros en la URL', r => { r.query = {tenantId: TENANT}; r.url += '?tenantId=' + TENANT; }],
  ['consulta repetida', r => { r.method = 'GET'; r.query = {resource: 'scopes', tenantId: TENANT}; r.url += '?resource=scopes&tenantId=' + TENANT + '&tenantId=' + OTHER_TENANT; }],
  ['consulta con clave desconocida', r => { r.method = 'GET'; r.query = {resource: 'scopes', tenantId: TENANT, membershipId: id(10)}; r.url += '?' + new URLSearchParams(r.query); }],
  ['consulta sin municipio', r => { r.method = 'GET'; r.query = {resource: 'scopes'}; r.url += '?resource=scopes'; }],
  ['recurso desconocido', r => { r.method = 'GET'; r.query = {resource: 'users', tenantId: TENANT}; r.url += '?' + new URLSearchParams(r.query); }],
  ['método', r => r.method = 'DELETE'],
]) test('rechaza ' + label + ' antes de abrir la base', async () => {
  const req = post(); mutate(req);
  const {res, stats} = await run({}, req);
  assert.ok(res.statusCode >= 400 && res.statusCode < 500, JSON.stringify(res.payload)); assert.equal(stats.connections, 0); assert.equal(res.payload.ok, false);
});

test('un cuerpo cortado falla antes de SQL aunque declare una longitud válida', async () => {
  const {handler, stats} = setup(), original = post(), req = new PassThrough(), res = response();
  Object.assign(req, original); delete req.body;
  req.headers['content-length'] = String(Buffer.byteLength(original.body) + 1);
  const pending = handler(req, res); req.end(original.body); await pending;
  assert.equal(res.statusCode, 400); assert.equal(stats.connections, 0);
});

test('el pedido es exacto: un área, uno de los cuatro permisos y una referencia de 10 a 500 caracteres en forma canónica', () => {
  assert.deepEqual(validateAreaScopeCommand(command()), command());
  assert.deepEqual(validateAreaScopeQuery({resource: 'scopes', tenantId: TENANT}), {resource: 'scopes', tenantId: TENANT});
  for (const mutate of [
    b => b.operation = 'replace', b => b.capability = 'attendance.read', b => b.capability = 'leave.request.area.read', b => b.capability = 'attendance.area.*',
    b => b.membershipId = 'todas', b => delete b.area.sectorSourceId, b => b.area.sectorSourceId = '', b => b.area.sectorSourceId = '*', b => b.area.sectorSourceId = '05',
    b => b.area.organizationUnitSourceId = null, b => b.area.companyId = '1', b => b.area = null, b => b.scopeSetVersion = 'b'.repeat(63), b => delete b.scopeSetVersion,
    b => b.authorizationReference = 'corta', b => b.authorizationReference = 'x'.repeat(501), b => b.authorizationReference = ' Nota sintética 001',
    b => b.authorizationReference = 'Nota sintética\n001/2026', b => b.authorizationReference = 'Nota sintética​ 001', b => b.authorizationReference = 'Nota <b>sintética</b>',
    b => b.authorizationReference = 'Nota sintética 001', b => b.authorizationReference = 'Nota sintética 001\u0085', b => b.authorizationReference = 'Nota sintética 001\ud800',
    b => b.authorizationReference = 12345678901, b => b.tenantId = TENANT, b => b.active = true, b => b.version = 7, b => b.capabilities = ['attendance.area.read'],
  ]) {
    const b = command(); mutate(b);
    assert.throws(() => validateAreaScopeCommand(b), e => e instanceof AreaScopeAdminError && e.code === 'ATTENDANCE_AREA_SCOPE_INPUT_INVALID', JSON.stringify(b));
  }
  // Lo que escribe una persona se lleva a una sola línea canónica antes de armar el pedido.
  assert.equal(normalizeAreaScopeReference('  Nota   sintética\n001/2026 \t'), 'Nota sintética 001/2026');
  assert.equal(buildAreaScopeCommand({...command(), authorizationReference: '  Resolución   sintética QA\n12/2026 '}).authorizationReference, 'Resolución sintética QA 12/2026');
  assert.equal(validateAreaScopeCommand(command({authorizationReference: 'x'.repeat(10)})).authorizationReference.length, 10);
  assert.equal(validateAreaScopeCommand(command({authorizationReference: 'ñ'.repeat(500)})).authorizationReference.length, 500);
  for (const q of [{resource: 'scopes'}, {resource: 'scopes', tenantId: 'todos'}, {resource: 'audit', tenantId: TENANT}, {resource: 'scopes', tenantId: TENANT, limit: '10'}])
    assert.throws(() => validateAreaScopeQuery(q), e => e.code === 'ATTENDANCE_AREA_SCOPE_QUERY_INVALID' && e.status === 400);
});

test('la fachada comprueba la autoridad antes de SQL y nunca arma el contexto con datos del pedido', async () => {
  const forbidden = {async query() { throw Error('no debe consultarse'); }};
  const weak = owner({platform: {roles: ['PLATFORM_OWNER'], capabilities: ['platform.users.manage']}});
  await assert.rejects(areaScopeAdminWrite(forbidden, weak, session, TENANT, command(), KEY, {releaseSha: RELEASE}), e => e.status === 403 && e.code === 'ATTENDANCE_AREA_SCOPE_FORBIDDEN');
  await assert.rejects(areaScopeAdminRead(forbidden, owner({tenant: {id: TENANT}}), session, {resource: 'scopes', tenantId: TENANT}, {releaseSha: RELEASE}), e => e.status === 403);
  await assert.rejects(areaScopeAdminRead(forbidden, owner(), session, {resource: 'scopes', tenantId: TENANT}, {releaseSha: 'x'}), e => e.status === 503);
  await assert.rejects(areaScopeAdminWrite(forbidden, owner(), session, TENANT, command(), 'sin-clave', {releaseSha: RELEASE}), e => e.status === 428 && e.code === 'ATTENDANCE_AREA_SCOPE_KEY_REQUIRED');
  await assert.rejects(areaScopeAdminWrite(forbidden, owner(), session, 'todos', command(), KEY, {releaseSha: RELEASE}), e => e.status === 400);
  await assert.rejects(areaScopeAdminWrite(forbidden, owner(), session, TENANT, command({capability: 'attendance.read'}), KEY, {releaseSha: RELEASE}), e => e.status === 422);
  assert.deepEqual(areaScopeAdminContext(owner(), {...session, email: ' Administracion.QA@Example.invalid '}, TENANT, RELEASE, AREA_SCOPE_ADMIN_WRITE_AUTHORITY),
    {actorEmail: ADMIN_EMAIL, actorSessionId: session.id, actorSessionVersion: 3, releaseSha: RELEASE, tenantId: TENANT});
});

test('una lectura de otro municipio, con campos de más o incoherente consigo misma se rechaza entera', async () => {
  assert.deepEqual(validateAreaScopeReadResponse(reading(), {tenantId: TENANT}), reading());
  const suspended = reading({memberships: [...reading().memberships, member(13, {status: 'suspended', grantable: false, areaCapabilities: []})],
    scopes: [scope(20), scope(21, {membershipId: id(13), capabilityHeld: false, organizationUnitSourceId: '999', organizationUnitLabel: null, sectorSourceId: null, sectorLabel: null, areaInCatalog: false})]});
  assert.equal(validateAreaScopeReadResponse(suspended, {tenantId: TENANT}).scopes.length, 2, 'una cuenta no activa se lista sólo por las áreas que conserva, también fuera del catálogo');
  for (const mutate of [
    d => d.tenantId = OTHER_TENANT, d => d.version = 'attendance-area-scope-admin.v0', d => d.resource = 'command', d => d.scopeSetVersion = 'b', d => d.sourceDatabase = 'FORBIDDEN_SYNTHETIC',
    d => d.memberships[0].dni = 'FORBIDDEN_SYNTHETIC', d => d.memberships[0].capabilities = ['payroll.read'], d => d.memberships.push(structuredClone(d.memberships[0])),
    d => d.memberships[0].grantable = false, d => d.memberships[2].grantable = true, d => d.memberships[1].self = true, d => d.memberships[0].status = 'suspended',
    d => d.memberships[0].areaCapabilities = ['attendance.read'], d => d.memberships[0].roleKey = 'rol con espacios',
    d => d.memberships.push(member(14, {status: 'suspended', grantable: false, areaCapabilities: []})),
    d => d.scopes[0].membershipId = id(99), d => d.scopes[0].capabilityHeld = false, d => d.scopes[0].organizationUnitLabel = 'Otra etiqueta',
    d => d.scopes[0].sectorLabel = null, d => d.scopes[0].areaInCatalog = false, d => d.scopes[0].capability = 'attendance.read', d => d.scopes[0].version = 0,
    d => d.scopes[0].sectorSourceId = '', d => d.scopes[0].updatedAt = 'ayer', d => d.scopes[0].authorizationReference = 'corta', d => d.scopes[0].contractId = id(7),
    d => d.scopes.push(scope(21)), d => d.scopes.push(structuredClone(d.scopes[0])), d => d.organizationUnits.push({id: '701', label: 'Repetida'}),
    d => d.organizationUnits[0].label = 'Etiqueta <b>', d => d.sectors[0].id = '05', d => d.sectors[0].companyId = '1', d => d.scopes = null,
  ]) {
    const data = reading(); mutate(data);
    await assert.rejects(areaScopeAdminRead({query: async () => [{result: JSON.stringify(data)}]}, owner(), session, {resource: 'scopes', tenantId: TENANT}, {releaseSha: RELEASE}),
      e => e.status === 503 && e.code === 'ATTENDANCE_AREA_SCOPE_RESPONSE_INVALID' && !/FORBIDDEN_SYNTHETIC/.test(e.message), JSON.stringify(data).slice(0, 200));
  }
  for (const rows of [[], [{result: reading()}], [{result: '{'}], [{result: JSON.stringify(reading())}, {result: JSON.stringify(reading())}], [{result: '{"version":"a","version":"b"}'}]])
    await assert.rejects(areaScopeAdminRead({query: async () => rows}, owner(), session, {resource: 'scopes', tenantId: TENANT}, {releaseSha: RELEASE}), e => e.status === 503);
});

test('una confirmación sólo vale para el área exacta que se envió', async () => {
  assert.deepEqual(validateAreaScopeCommandResponse(receipt(), {tenantId: TENANT, command: command()}), receipt());
  const noop = receipt(command(), {changed: false}); noop.scope.authorizationReference = 'Nota sintética anterior 7/2026'; noop.scope.version = 4;
  assert.equal(validateAreaScopeCommandResponse(noop, {tenantId: TENANT, command: command()}).scope.version, 4, 'ya aplicado: fila actual, con su referencia anterior');
  const replayed = receipt(command(), {changed: false, replayed: true}); replayed.scope.active = false;
  assert.equal(validateAreaScopeCommandResponse(replayed, {tenantId: TENANT, command: command()}).replayed, true, 'misma clave: la fila como está hoy');
  for (const mutate of [
    d => d.tenantId = OTHER_TENANT, d => d.operation = 'withdraw', d => d.scope.membershipId = id(11), d => d.scope.capability = 'attendance.area.devices.approve',
    d => d.scope.organizationUnitSourceId = '701', d => d.scope.sectorSourceId = '5', d => d.scope.active = false, d => d.scope.authorizationReference = 'Otra referencia sintética',
    d => { d.changed = true; d.replayed = true; }, d => d.scope.version = 0, d => d.scope.dni = 'FORBIDDEN_SYNTHETIC', d => d.principal = {}, d => d.resource = 'scopes', d => d.scope = null,
  ]) {
    const data = receipt(); mutate(data);
    const {res} = await run({result: data}, post());
    assert.equal(res.statusCode, 503, JSON.stringify(data)); assert.equal(res.payload.code, 'ATTENDANCE_AREA_SCOPE_RESPONSE_INVALID');
    assert.doesNotMatch(JSON.stringify(res.payload), /FORBIDDEN_SYNTHETIC|SELECT/);
  }
});

test('cada código de PostgreSQL tiene una respuesta segura; lo desconocido o no instalado queda en 503 sin detalles', async () => {
  for (const [message, status, code] of [
    ['ATTENDANCE_AREA_SCOPE_SESSION_INVALID', 401, 'SESSION_INVALID'], ['TENANT_IAM_SESSION_INVALID', 401, 'SESSION_INVALID'],
    ['TENANT_LIFECYCLE_PLATFORM_CAPABILITY_REQUIRED', 403, 'FORBIDDEN'], ['ATTENDANCE_AREA_SCOPE_SELF_ASSIGNMENT', 403, 'SELF_ASSIGNMENT'],
    ['ATTENDANCE_AREA_SCOPE_TENANT_NOT_READY', 409, 'TENANT_NOT_READY'], ['ATTENDANCE_AREA_SCOPE_STALE', 409, 'STALE'],
    ['ATTENDANCE_AREA_SCOPE_IDEMPOTENCY_REUSED', 409, 'ATTEMPT_CONFLICT'], ['duplicate key value violates unique constraint "tenant_iam_event_actor_idempotency_uk"', 409, 'ATTEMPT_CONFLICT'],
    ['ATTENDANCE_AREA_SCOPE_MEMBERSHIP_NOT_FOUND', 404, 'MEMBERSHIP_NOT_FOUND'], ['ATTENDANCE_AREA_SCOPE_MEMBERSHIP_NOT_ACTIVE', 409, 'MEMBERSHIP_NOT_ACTIVE'],
    ['ATTENDANCE_AREA_SCOPE_AREA_NOT_IN_CATALOG', 409, 'AREA_NOT_IN_CATALOG'], ['ATTENDANCE_AREA_SCOPE_CATALOG_UNAVAILABLE', 409, 'CATALOG_UNAVAILABLE'],
    ['NATIVE_EMPLOYEE_CATALOG_UNAVAILABLE', 409, 'CATALOG_UNAVAILABLE'], ['ATTENDANCE_AREA_SCOPE_CAPABILITY_INVALID', 422, 'INPUT_INVALID'],
    ['ATTENDANCE_AREA_SCOPE_REFERENCE_INVALID', 422, 'INPUT_INVALID'], ['ATTENDANCE_AREA_SCOPE_COMMAND_INVALID', 422, 'INPUT_INVALID'],
    ['ATTENDANCE_AREA_SCOPE_QUERY_INVALID', 400, 'QUERY_INVALID'], ['ATTENDANCE_AREA_SCOPE_NOT_FOUND', 404, 'NOT_FOUND'],
    ['ATTENDANCE_AREA_SCOPE_VERSION_CONFLICT', 409, 'CONFLICT'], ['ATTENDANCE_AREA_SCOPE_LIMIT', 413, 'LIMIT'], ['ATTENDANCE_AREA_SCOPE_BUSY', 409, 'BUSY'],
    ['function public.attendance_area_scope_admin_command_v1(jsonb, jsonb, uuid) does not exist', 503, 'UNAVAILABLE'],
    ['permission denied for function attendance_area_scope_admin_context_v1', 503, 'UNAVAILABLE'], ['ATTENDANCE_AREA_SCOPE_IMMUTABLE', 503, 'UNAVAILABLE'],
  ]) {
    const {res} = await run({error: Object.assign(new Error(message + ' detalle privado de SQL'), {code: 'P0001'})}, post());
    assert.equal(res.statusCode, status, message); assert.equal(res.payload.code, 'ATTENDANCE_AREA_SCOPE_' + code, message);
    assert.doesNotMatch(res.payload.error, /SQL|does not exist|constraint|function|detalle privado/);
  }
  for (const state of ['55P03', '40P01', '40001']) assert.equal(areaScopeAdminSafeError(Object.assign(Error('canceling statement'), {code: state})).code, 'ATTENDANCE_AREA_SCOPE_BUSY');
  const own = new AreaScopeAdminError('STALE', 'x', 409); assert.equal(areaScopeAdminSafeError(own), own);
});

test('la ruta está publicada con duración acotada y la administración monta el panel con sus archivos en el armado', () => {
  const text = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  assert.deepEqual(JSON.parse(text('vercel.json')).functions['api/internal-attendance-area-scopes.js'], {maxDuration: 20});
  const build = text('scripts/build-friendly.mjs');
  for (const file of ['assets/attendance-area-scopes-model.js', 'assets/attendance-area-scopes-panel.js', 'assets/attendance-area-scopes-panel.css']) assert.ok(build.includes("'" + file + "',"), file);
  const html = text('administracion-plataforma.html');
  assert.match(html, /<script type="module" src="assets\/attendance-area-scopes-panel\.js"><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="assets\/attendance-area-scopes-panel\.css">/);
  assert.match(html, /<button class="nav-link" type="button" data-admin-view="attendanceAreas">[^\n]*Áreas de asistencia<\/button>/);
  assert.match(html, /<section class="view" id="attendanceAreasView" data-view-panel="attendanceAreas" aria-labelledby="attendanceAreasTitle" hidden>/);
  assert.match(html, /<h1 id="attendanceAreasTitle">Áreas de asistencia por cuenta<\/h1>/);
  assert.match(html, /<div id="attendanceAreaScopes" data-tenant-id="" data-tenant-label="" data-can-read="false" data-can-manage="false" data-visible="false">/);
  assert.match(html, /attendanceAreas: \['Áreas de asistencia','Áreas de asistencia por cuenta'\]/);
  // La página sólo le pasa al panel el municipio filtrado, lo que la sesión puede hacer y si la sección está a la vista.
  const publish = html.slice(html.indexOf('function publishAttendanceAreaContext()'), html.indexOf('function showView(view)'));
  assert.match(publish, /var canRead = platformCapabilityAllowed\(\['platform\.users\.manage'\]\);/);
  assert.match(publish, /canManage: canRead && platformCapabilityAllowed\(\['platform\.roles\.manage'\]\),/);
  assert.match(publish, /visible: state\.activeView === 'attendanceAreas' && !state\.loading/);
  assert.match(publish, /new window\.CustomEvent\('municontrol:area-scopes-context', \{ detail: detail \}\)/);
  assert.equal(html.split('publishAttendanceAreaContext();').length - 1, 3, 'al empezar y al terminar cada carga administrativa y al cambiar de sección');
  assert.doesNotMatch(publish, /fetch|innerHTML|localStorage|sessionStorage/);
});
