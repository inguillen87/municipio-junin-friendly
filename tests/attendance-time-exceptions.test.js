// Excepciones horarias por legajo (221): validation, API dispatch, SQL facade and response contract.
// No database: a SQL double records the exact governed call. Migration text is checked statically.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { createInternalAttendanceHandler } from '../api/internal-attendance.js';
import {
  TIME_EXCEPTION_SQL, applyAttendanceTimeException, assertTimeExceptionItem, listAttendanceTimeExceptions,
  normalizeTimeExceptionRegister, normalizeTimeExceptionRevoke, parseTimeExceptionQuery,
} from '../lib/internal-attendance-time-exceptions.js';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MEMBERSHIP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SESSION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const RELEASE_SHA = 'a'.repeat(40);
const ITEM_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const REQUEST_KEY = 'a0000000-0000-4000-8000-000000000001';
const migration = readFileSync(new URL('../scripts/migrations/221-attendance-time-exception.sql', import.meta.url), 'utf8');

const principal = {
  user: { email: 'Hugo@Junin.gob.ar' },
  tenant: { id: TENANT_ID, membershipId: MEMBERSHIP_ID, source: 'membership' },
};
const session = { id: SESSION_ID, email: 'hugo@junin.gob.ar', version: 3, releaseSha: RELEASE_SHA };

const registerBody = (patch = {}) => ({
  action: 'time-exception.register', requestKey: REQUEST_KEY, legajo: '0123', kind: 'salida_transitoria',
  weekdays: [5, 1, 3, 3], from: '07:30', to: '08:30', validFrom: '2026-11-01', validTo: null,
  category: 'cuidado_familiar', note: '  Traslado al colegio ', documentReference: 'Nota Personal 45/2026', ...patch,
});

const item = (patch = {}) => ({
  id: ITEM_ID, legajo: '123', name: 'Persona Sintética', kind: 'salida_transitoria', weekdays: [1, 3, 5],
  from: '07:30', to: '08:30', validFrom: '2026-11-01', validTo: null, category: 'cuidado_familiar',
  note: 'Traslado al colegio', documentReference: 'Nota Personal 45/2026', registeredAt: '2026-11-05T23:00:00.000Z',
  registeredBy: 'hugo@junin.gob.ar', revokedAt: null, revokedBy: null, revokeReason: null, ...patch,
});

function sqlDouble(answer) {
  const calls = [];
  return {
    calls,
    async query(statement, values) {
      calls.push({ statement, values });
      if (answer instanceof Error) throw answer;
      return [{ result: typeof answer === 'function' ? answer(statement, values) : answer }];
    },
  };
}

function response() {
  return {
    headers: {}, statusCode: 200, payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; },
  };
}

function handlerWith(sql, accessCalls = []) {
  return createInternalAttendanceHandler({
    env: { NODE_ENV: 'test', INTERNAL_CERTIFIED_DATA_CONTRACT_SHA: RELEASE_SHA },
    requireCompatibleInternalAccess: async (_req, _res, options) => {
      accessCalls.push(options);
      return {
        mode: 'managed',
        session: { id: SESSION_ID, email: 'hugo@junin.gob.ar', version: 3 },
        principal: {
          user: { email: 'hugo@junin.gob.ar' }, authorized: true,
          session: { id: SESSION_ID, version: 3, authLevel: 'mfa', mfa: true, expiresAt: new Date(Date.now() + 3600000).toISOString() },
          tenant: { id: TENANT_ID, slug: 'junin-mendoza', membershipId: MEMBERSHIP_ID, source: 'membership', certifiedReleaseSha: RELEASE_SHA },
        },
      };
    },
    getInternalSql: async () => sql,
    applyAttendanceCommand: async () => { throw new Error('gateway command must not run for time exceptions'); },
  });
}

const post = (body) => ({ method: 'POST', query: {}, headers: { 'content-type': 'application/json' }, body });

test('register body is normalized exactly as SQL expects: legajo without zeros, sorted unique days, trimmed text', () => {
  assert.deepEqual({ ...normalizeTimeExceptionRegister(registerBody()) }, {
    requestKey: REQUEST_KEY, legajo: '123', kind: 'salida_transitoria', weekdays: [1, 3, 5], from: '07:30', to: '08:30',
    validFrom: '2026-11-01', validTo: null, category: 'cuidado_familiar', note: 'Traslado al colegio',
    documentReference: 'Nota Personal 45/2026',
  });
  assert.equal(normalizeTimeExceptionRegister(registerBody({ note: '   ' })).note, null);
  const exempt = normalizeTimeExceptionRegister(registerBody({ kind: 'exento', from: null, to: null, category: 'salud' }));
  assert.equal(exempt.from, null); assert.equal(exempt.to, null);
});

for (const [label, patch] of [
  ['extra key', { extra: true }], ['legajo 0', { legajo: '000' }], ['legajo letters', { legajo: '12a' }], ['legajo number', { legajo: 123 }],
  ['kind', { kind: 'franco' }], ['no days', { weekdays: [] }], ['day 8', { weekdays: [8] }], ['day 0', { weekdays: [0] }],
  ['day 1.5', { weekdays: [1.5] }], ['day string', { weekdays: ['1'] }], ['eight days', { weekdays: [1, 2, 3, 4, 5, 6, 7, 1] }],
  ['from >= to', { from: '08:30', to: '08:30' }], ['seconds', { from: '07:30:00' }], ['24h', { to: '24:00' }],
  ['exento with window', { kind: 'exento' }], ['window missing', { from: null }], ['bad date', { validFrom: '2026-02-30' }],
  ['old date', { validFrom: '1999-12-31' }], ['to < from', { validTo: '2026-10-31' }], ['category', { category: 'vacaciones' }],
  ['markup note', { note: '<b>hijo</b>' }], ['long note', { note: 'x'.repeat(301) }], ['control note', { note: 'a\nb' }],
  ['short document', { documentReference: 'ab' }], ['long document', { documentReference: 'x'.repeat(161) }],
  ['request key v1', { requestKey: 'a0000000-0000-1000-8000-000000000001' }], ['request key missing', { requestKey: '' }],
  ['wrong action', { action: 'time-exception.revoke' }],
]) test('register rejects ' + label, () => {
  assert.throws(() => normalizeTimeExceptionRegister(registerBody(patch)), { code: 'ATTENDANCE_TIME_EXCEPTION_INPUT_INVALID', status: 422 });
});

test('revoke body requires a v4 request key, the registration id and a 3–160 character reason', () => {
  assert.deepEqual({ ...normalizeTimeExceptionRevoke({ action: 'time-exception.revoke', requestKey: REQUEST_KEY.toUpperCase(), id: ITEM_ID, reason: ' Terminó el ciclo ' }) },
    { requestKey: REQUEST_KEY, id: ITEM_ID, reason: 'Terminó el ciclo' });
  for (const patch of [{ reason: 'no' }, { reason: 'x'.repeat(161) }, { id: 'nope' }, { requestKey: 'x' }, { extra: 1 }]) {
    assert.throws(() => normalizeTimeExceptionRevoke({ action: 'time-exception.revoke', requestKey: REQUEST_KEY, id: ITEM_ID, reason: 'Motivo', ...patch }),
      { code: 'ATTENDANCE_TIME_EXCEPTION_INPUT_INVALID' });
  }
});

test('query accepts an optional legajo and a closed range of at most 92 days', () => {
  assert.deepEqual({ ...parseTimeExceptionQuery({}) }, { legajo: null, from: null, to: null });
  assert.deepEqual({ ...parseTimeExceptionQuery({ legajo: '0045', from: '2026-11-01', to: '2027-02-01' }) },
    { legajo: '45', from: '2026-11-01', to: '2027-02-01' });
  for (const query of [{ legajo: '0' }, { legajo: 'x' }, { from: '2026-11-01' }, { from: '2026-11-02', to: '2026-11-01' },
    { from: '2026-01-01', to: '2026-04-04' }, { from: '2026-02-30', to: '2026-03-01' }]) {
    assert.throws(() => parseTimeExceptionQuery(query), { code: 'ATTENDANCE_TIME_EXCEPTION_QUERY_INVALID', status: 400 });
  }
});

test('list calls the governed SQL function with exact casts and coordinates, and returns the strict contract', async () => {
  const sql = sqlDouble({ version: 'attendance-time-exceptions.v1', canManage: true, items: [item()] });
  const result = await listAttendanceTimeExceptions(sql, principal, { legajo: '123', from: '2026-11-01', to: '2026-11-30' }, session);
  assert.deepEqual(result, { version: 'attendance-time-exceptions.v1', canManage: true, items: [item()] });
  assert.equal(sql.calls[0].statement,
    'SELECT public.attendance_time_exception_list_v1($1,$2::uuid,$3::integer,$4,$5::uuid,$6::uuid,$7,$8::date,$9::date) AS result');
  assert.deepEqual(sql.calls[0].values,
    ['hugo@junin.gob.ar', SESSION_ID, 3, RELEASE_SHA, TENANT_ID, MEMBERSHIP_ID, '123', '2026-11-01', '2026-11-30']);
});

test('list treats extra fields, private keys, wrong filters or broken revocation trios as contract drift', async () => {
  for (const answer of [
    { version: 'attendance-time-exceptions.v1', canManage: true, items: [item({ identity_hmac: 'x' })] },
    { version: 'attendance-time-exceptions.v1', canManage: true, items: [item({ legajo: '999' })] },
    { version: 'attendance-time-exceptions.v1', canManage: true, items: [item({ revokedAt: '2026-11-06T00:00:00.000Z' })] },
    { version: 'attendance-time-exceptions.v1', canManage: true, items: [item({ weekdays: [3, 1] })] },
    { version: 'attendance-time-exceptions.v1', canManage: true, items: [item(), item()] },
    { version: 'attendance-time-exceptions.v0', canManage: true, items: [] },
    { version: 'attendance-time-exceptions.v1', canManage: 'yes', items: [] },
  ]) {
    await assert.rejects(listAttendanceTimeExceptions(sqlDouble(answer), principal, { legajo: '123' }, session),
      { code: 'ATTENDANCE_CONTRACT_DRIFT', status: 503 });
  }
  assert.equal(assertTimeExceptionItem(item({ kind: 'exento', from: null, to: null })).kind, 'exento');
});

test('register and revoke send the normalized jsonb to their own SQL function', async () => {
  const sql = sqlDouble((statement) => ({
    item: statement.includes('revoke') ? item({ revokedAt: '2026-11-06T00:00:00.000Z', revokedBy: 'hugo@junin.gob.ar', revokeReason: 'Terminó el ciclo' }) : item(),
    replayed: false,
  }));
  const registered = await applyAttendanceTimeException(sql, principal, session, registerBody());
  assert.equal(registered.item.id, ITEM_ID);
  assert.equal(sql.calls[0].statement, TIME_EXCEPTION_SQL.register);
  assert.equal(sql.calls[0].statement, 'SELECT public.attendance_time_exception_register_v1($1,$2::uuid,$3::integer,$4,$5::uuid,$6::uuid,$7::jsonb) AS result');
  assert.deepEqual(JSON.parse(sql.calls[0].values[6]), { ...normalizeTimeExceptionRegister(registerBody()) });
  assert.equal(Object.hasOwn(JSON.parse(sql.calls[0].values[6]), 'action'), false);
  const revoked = await applyAttendanceTimeException(sql, principal, session,
    { action: 'time-exception.revoke', requestKey: REQUEST_KEY, id: ITEM_ID, reason: 'Terminó el ciclo' });
  assert.equal(sql.calls[1].statement, 'SELECT public.attendance_time_exception_revoke_v1($1,$2::uuid,$3::integer,$4,$5::uuid,$6::uuid,$7::jsonb) AS result');
  assert.equal(revoked.item.revokeReason, 'Terminó el ciclo');
  await assert.rejects(applyAttendanceTimeException(sqlDouble({ item: item(), replayed: false }), principal, session,
    { action: 'time-exception.revoke', requestKey: REQUEST_KEY, id: ITEM_ID, reason: 'Motivo' }), { code: 'ATTENDANCE_CONTRACT_DRIFT' });
});

test('SQL errors map to stable codes; a missing function means the migration is not installed', async () => {
  const cases = [
    ['ATTENDANCE_TIME_EXCEPTION_DUPLICATE', 409], ['ATTENDANCE_TIME_EXCEPTION_KEY_REUSED', 409],
    ['ATTENDANCE_TIME_EXCEPTION_LEGAJO_NOT_FOUND', 404], ['ATTENDANCE_TIME_EXCEPTION_LEGAJO_AMBIGUOUS', 409],
    ['ATTENDANCE_TIME_EXCEPTION_NOT_FOUND', 404], ['ATTENDANCE_TIME_EXCEPTION_ALREADY_REVOKED', 409],
    ['ATTENDANCE_TIME_EXCEPTION_BUSY', 409], ['ATTENDANCE_CAPABILITY_REQUIRED', 403], ['ATTENDANCE_SESSION_INVALID', 401],
  ];
  for (const [code, status] of cases) {
    await assert.rejects(applyAttendanceTimeException(sqlDouble(new Error(code)), principal, session, registerBody()), { code, status });
  }
  const missing = Object.assign(new Error('function public.attendance_time_exception_list_v1(text, uuid) does not exist'), { code: '42883' });
  await assert.rejects(listAttendanceTimeExceptions(sqlDouble(missing), principal, {}, session),
    { code: 'ATTENDANCE_TIME_EXCEPTIONS_NOT_INSTALLED', status: 503 });
  await assert.rejects(listAttendanceTimeExceptions(sqlDouble({}), principal, {}, { ...session, email: 'otra@junin.gob.ar' }),
    { code: 'ATTENDANCE_SESSION_INVALID' });
});

test('API GET time-exceptions requires attendance.read + workforce.employee.read and only legajo/from/to', async () => {
  const accessCalls = [], sql = sqlDouble({ version: 'attendance-time-exceptions.v1', canManage: false, items: [] });
  const handler = handlerWith(sql, accessCalls);
  const res = response();
  await handler({ method: 'GET', headers: {}, query: { resource: 'time-exceptions', legajo: '123', from: '2026-11-01', to: '2026-11-30' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, { ok: true, version: 'attendance-time-exceptions.v1', canManage: false, items: [] });
  assert.deepEqual(accessCalls[0].requiredCapabilities, ['attendance.read', 'workforce.employee.read']);
  assert.match(sql.calls[0].statement, /attendance_time_exception_list_v1/);
  const all = response();
  await handler({ method: 'GET', headers: {}, query: { resource: 'time-exceptions' } }, all);
  assert.equal(all.statusCode, 200);
  assert.deepEqual(sql.calls[1].values.slice(6), [null, null, null]);
  const extra = response();
  await handler({ method: 'GET', headers: {}, query: { resource: 'time-exceptions', tenant: TENANT_ID } }, extra);
  assert.equal(extra.statusCode, 400); assert.equal(extra.payload.code, 'ATTENDANCE_QUERY_INVALID');
  const badRange = response();
  await handler({ method: 'GET', headers: {}, query: { resource: 'time-exceptions', from: '2026-01-01', to: '2026-12-31' } }, badRange);
  assert.equal(badRange.statusCode, 400); assert.equal(badRange.payload.code, 'ATTENDANCE_TIME_EXCEPTION_QUERY_INVALID');
});

test('API POST register/revoke requires attendance.review, never touches the gateway command and returns {ok, item}', async () => {
  const accessCalls = [];
  const sql = sqlDouble((statement) => ({
    item: statement.includes('revoke') ? item({ revokedAt: '2026-11-06T00:00:00.000Z', revokedBy: 'hugo@junin.gob.ar', revokeReason: 'Terminó el ciclo' }) : item(),
    replayed: statement.includes('revoke'),
  }));
  const handler = handlerWith(sql, accessCalls);
  const res = response();
  await handler(post(registerBody()), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, { ok: true, item: item() });
  assert.deepEqual(accessCalls[0].requiredCapabilities, ['attendance.review', 'workforce.employee.read']);
  assert.equal(res.headers['Idempotency-Replayed'], undefined);
  const revoked = response();
  await handler(post({ action: 'time-exception.revoke', requestKey: REQUEST_KEY, id: ITEM_ID, reason: 'Terminó el ciclo' }), revoked);
  assert.equal(revoked.statusCode, 200);
  assert.equal(revoked.payload.item.revokedBy, 'hugo@junin.gob.ar');
  assert.equal(revoked.headers['Idempotency-Replayed'], 'true');
  const invalid = response();
  await handler(post(registerBody({ weekdays: [] })), invalid);
  assert.equal(invalid.statusCode, 422); assert.equal(invalid.payload.code, 'ATTENDANCE_TIME_EXCEPTION_INPUT_INVALID');
  const unknown = response();
  await handler(post({ action: 'time-exception.update', requestKey: REQUEST_KEY }), unknown);
  assert.equal(unknown.statusCode, 422);
  const busy = response();
  await handlerWith(sqlDouble(new Error('ATTENDANCE_TIME_EXCEPTION_BUSY')))(post(registerBody()), busy);
  assert.equal(busy.statusCode, 409); assert.equal(busy.headers['Retry-After'], '1');
  const wrongType = response();
  await handler({ ...post(registerBody()), headers: { 'content-type': 'text/plain' } }, wrongType);
  assert.equal(wrongType.statusCode, 415);
});

test('existing gateway commands keep their capability and Idempotency-Key path', async () => {
  const accessCalls = [];
  let applied = 0;
  const handler = createInternalAttendanceHandler({
    env: { NODE_ENV: 'test', INTERNAL_CERTIFIED_DATA_CONTRACT_SHA: RELEASE_SHA },
    requireCompatibleInternalAccess: async (_req, _res, options) => {
      accessCalls.push(options);
      return { mode: 'managed', session: { id: SESSION_ID, email: 'hugo@junin.gob.ar', version: 3 },
        principal: { user: { email: 'hugo@junin.gob.ar' }, authorized: true,
          session: { id: SESSION_ID, version: 3, authLevel: 'mfa', mfa: true, expiresAt: new Date(Date.now() + 3600000).toISOString() },
          tenant: { id: TENANT_ID, slug: 'junin-mendoza', membershipId: MEMBERSHIP_ID, source: 'membership', certifiedReleaseSha: RELEASE_SHA } } };
    },
    getInternalSql: async () => ({}),
    applyAttendanceCommand: async () => { applied++; return { data: { ok: 1 }, replayed: false }; },
  });
  const res = response();
  await handler({ ...post({ command: 'punch.accept', payload: {} }), headers: { 'content-type': 'application/json', 'idempotency-key': REQUEST_KEY } }, res);
  assert.equal(res.statusCode, 200); assert.equal(applied, 1);
  assert.deepEqual(accessCalls[0].requiredCapabilities, ['attendance.read']);
});

test('migration 221 is additive, append-only, RLS-protected and grants only the three entry points', () => {
  assert.match(migration, /^-- 221 · Excepciones horarias por legajo/);
  assert.match(migration, /ATTENDANCE_TIME_EXCEPTION_OBJECT_CONFLICT/);
  assert.match(migration, /ATTENDANCE_TIME_EXCEPTION_PREREQUISITE/);
  assert.match(migration, /CREATE TABLE public\.attendance_time_exception_event\(/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON public\.attendance_time_exception_event/);
  assert.match(migration, /BEFORE TRUNCATE ON public\.attendance_time_exception_event/);
  assert.match(migration, /ALTER TABLE public\.attendance_time_exception_event ENABLE ROW LEVEL SECURITY;/);
  assert.match(migration, /REVOKE ALL ON public\.attendance_time_exception_event FROM PUBLIC,municontrol_actions_runtime_app;/);
  assert.match(migration, /UNIQUE\(exception_id\)/);
  assert.match(migration, /UNIQUE\(tenant_id,actor_membership_id,request_key\)/);
  assert.match(migration, /kind IN\('entrada_diferida','salida_transitoria','salida_anticipada','exento'\)/);
  assert.match(migration, /category IN\('cuidado_familiar','salud','lactancia','estudio','gremial','traslado','otro'\)/);
  assert.match(migration, /attendance_time_exception_text_valid_v1\(note,1,300\)/);
  assert.match(migration, /attendance_time_exception_text_valid_v1\(document_reference,3,160\)/);
  for (const name of ['list', 'register', 'revoke']) {
    assert.match(migration, new RegExp(`CREATE FUNCTION public\\.attendance_time_exception_${name}_v1\\(p_email text,p_session uuid,p_version integer,p_release text,\\s*p_tenant uuid,p_membership uuid`));
  }
  assert.match(migration, /attendance_gateway_assert_session_v1\(p_email,p_session,p_version,p_release,p_tenant,p_membership\)[\s\S]*?attendance_gateway_assert_actor_v1\(ctx,p_capability\)/);
  assert.match(migration, /context_v1\(p_email,p_session,p_version,p_release,p_tenant,p_membership,'attendance\.read'\)/);
  assert.equal((migration.match(/context_v1\(p_email,p_session,p_version,p_release,p_tenant,p_membership,'attendance\.review'\)/g) || []).length, 2);
  assert.match(migration, /capability_key='workforce\.employee\.read'/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.attendance_time_exception_list_v1\(text,uuid,integer,text,uuid,uuid,text,date,date\),\s*public\.attendance_time_exception_register_v1\(text,uuid,integer,text,uuid,uuid,jsonb\),\s*public\.attendance_time_exception_revoke_v1\(text,uuid,integer,text,uuid,uuid,jsonb\) TO municontrol_actions_runtime_app;/);
  assert.equal((migration.match(/GRANT /g) || []).length, 1);
  assert.doesNotMatch(migration, /\b(?:UPDATE|DELETE FROM|ALTER TABLE)\s+public\.(?!attendance_time_exception_event ENABLE)/);
  assert.doesNotMatch(migration, /payroll|novelty|attendance_identity_map|attendance_canonical_punch/i);
});
