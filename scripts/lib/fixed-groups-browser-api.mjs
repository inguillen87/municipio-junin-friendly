// Browser requests reach the real HTTP handler with their original bytes. Only
// SQL business responses use an isolated synthetic fixture; no database opens.
import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {createInternalPayrollFixedGroupsHandler} from '../../api/internal-payroll-fixed-groups.js';
import {fixedUuid} from '../../tests/fixtures/payroll-fixed-novelties-synthetic.js';
import fs from 'node:fs';
import path from 'node:path';

export async function serveFixedGroupsBrowserFile(route, {base, origin, live, served}) {
  const url = new URL(route.request().url()), file = path.resolve(base, globalThis.MuniControlRoutes.resolve(url.href, origin)?.file || url.pathname.slice(1));
  if (!file.startsWith(base + path.sep) || !fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
  const expected = fs.readFileSync(file);
  if (live) {
    const response = await route.fetch(), bytes = await response.body();
    assert.equal(response.status(), 200);
    assert.deepEqual(bytes, expected, 'Published bytes must match compilation: ' + path.relative(base, file));
    served.add(path.relative(base, file).replaceAll(path.sep, '/'));
    return route.fulfill({response, body: bytes});
  }
  return route.fulfill({status: 200, contentType: /\.m?js$/.test(file) ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream', body: expected});
}

export function fixedGroupsBrowserApi({command, origin, fixtureFor, groupsFor, posts, denied, takeConflict, takeDropAck, takeBadAck}) {
  const stats = {rawPosts: 0, sqlCalls: 0};
  const handler = createInternalPayrollFixedGroupsHandler({env: {INTERNAL_APP_ORIGIN: origin},
    requireCompatibleInternalAccess: async () => {
      const f = fixtureFor(), p = f.principal();
      return {mode: 'managed', principal: {user: {email: f.state.role + '@example.invalid'}, tenant: {source: 'membership',
        id: p.tenantId, membershipId: p.membershipId, certifiedReleaseSha: 'a'.repeat(40), effectiveCapabilities: denied() ? [] : f.cap()}}};
    }, actionMutationSession: access => ({id: fixedUuid(900), email: access.principal.user.email, version: 1, releaseSha: 'a'.repeat(40)}),
    getInternalSql: async () => ({query: async (sql, args) => {
      stats.sqlCalls++; const f = fixtureFor(), state = f.state, groups = groupsFor(), context = JSON.parse(args[0]);
      assert.equal(context.membershipId, f.principal().membershipId);
      const attempt = args.length === 2, key = attempt ? args[1] : args[2], scopeKey = state.role + ':' + key;
      const expected = command === 'annul' ? 'payroll_fixed_group_' : command === 'correct' ? 'payroll_fixed_correction_group_' : 'payroll_fixed_review_group_';
      assert.ok(sql.startsWith('SELECT public.' + expected)); assert.match(sql, attempt ? /attempt_v1\(\$1::jsonb,\$2::uuid\)/ : /\(\$1::jsonb,\$2::jsonb,\$3::uuid\)/);
      const previous = groups.get(scopeKey);
      if (attempt) {if (!previous) throw Error('PAYROLL_FIXED_NOT_FOUND'); return [{result: {...previous.receipt, duplicate: true}}];}
      const payload = JSON.parse(args[1]), hash = createHash('sha256').update(args[1]).digest('hex');
      if (previous) {if (previous.hash !== hash) throw Error('PAYROLL_FIXED_IDEMPOTENCY_REUSE'); return [{result: {...previous.receipt, duplicate: true}}];}
      const rowPayload = (item, reason) => ({...item, ...(command === 'review' ? {decision: payload.decision} : {operation: command === 'annul' ? 'annul' : 'set', values: command === 'annul' ? null : item.values}), reason});
      if (takeConflict()) assert.ok(f.mutate(command === 'review' ? 'review' : 'propose', rowPayload(payload.items.at(-1), 'Cambio concurrente de ensayo'), randomUUID()).data);
      const snapshot = structuredClone(state), rows = [];
      for (const item of payload.items) {
        const result = f.mutate(command === 'review' ? 'review' : 'propose', rowPayload(item, payload.reason), randomUUID());
        if (!result.data) {Object.assign(state, snapshot); throw Error(result.code);}
        rows.push(result.data);
      }
      const receipt = {version: 'payroll-fixed-' + (command === 'annul' ? 'annul' : command === 'correct' ? 'correction' : 'review') + '-group.v1',
        ...(command === 'review' ? {decision: payload.decision} : {}), groupId: randomUUID(), key, requestSha256: hash, total: rows.length, rows, duplicate: false, effects: f.bootstrap().effects};
      groups.set(scopeKey, {hash, receipt}); return [{result: receipt}];
    }}),
  }, command);
  return {stats, async route(route) {
    const wire = route.request(), url = new URL(wire.url()), headers = wire.headers(), bytes = wire.postDataBuffer();
    if (wire.method() === 'POST') {assert.ok(Buffer.isBuffer(bytes)); stats.rawPosts++; posts.push({body: JSON.parse(bytes.toString('utf8')), key: headers['idempotency-key']});}
    const req = {method: wire.method(), url: url.pathname + url.search, query: Object.fromEntries(url.searchParams), headers,
      ...(bytes ? {body: bytes} : {})};
    const res = {headers: {}, setHeader(k, v) {this.headers[k] = v;}, status(n) {this.statusCode = n; return this;}, json(body) {this.body = body; return this;}};
    await handler(req, res);
    if (wire.method() === 'POST' && res.body?.ok) {
      if (takeDropAck()) return route.abort('timedout');
      if (takeBadAck()) {res.body = structuredClone(res.body); res.body.data.rows[0].recordVersion++;}
    }
    return route.fulfill({status: res.statusCode, headers: res.headers, json: res.body});
  }};
}
