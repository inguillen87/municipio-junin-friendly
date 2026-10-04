import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {createServer} from 'node:http';
import {createInternalPayrollFixedGroupsHandler} from '../api/internal-payroll-fixed-groups.js';
import {fixedApprovedRecord, fixedUuid as uuid, fixedEffects} from './fixtures/payroll-fixed-novelties-synthetic.js';
import {FIXED_GROUP_MAX_BODY, FIXED_CORRECTION_GROUP_MAX_BODY} from '../lib/internal-payroll-fixed-groups.js';

const origin = 'https://municipio.example', key = uuid(777);
const envelope = (command, count = 45) => ({command, payload: {
  items: Array.from({length: count}, (_, i) => {
    const row = fixedApprovedRecord(i);
    return command === 'review' ? {recordId: row.id, expectedVersion: 3, proposalId: uuid(i + 10000)} : {
      recordId: row.id, expectedVersion: 2, contractId: row.subject.contractId,
      legajo: row.subject.legajo, identityToken: row.subject.identityToken,
      ...(command === 'correct' ? {values: {...row.approved.values, conceptSourceId: '614', quantityDecimal: i === 0 ? '0' : '1', amountCents: i === 1 ? '0' : null}} : {}),
    };
  }), ...(command === 'review' ? {decision: 'approve'} : {}), reason: 'Rectificación conjunta sintética — revisión completa',
}});
const response = () => ({headers: {}, setHeader(k, v) {this.headers[k] = v;}, status(n) {this.statusCode = n; return this;}, json(v) {this.body = v; return this;}});
const receipt = (body, replay = false) => ({
  version: 'payroll-fixed-' + (body.command === 'annul' ? 'annul' : body.command === 'correct' ? 'correction' : 'review') + '-group.v1',
  groupId: uuid(990), key, requestSha256: 'a'.repeat(64), total: body.payload.items.length,
  duplicate: replay, effects: {...fixedEffects}, ...(body.command === 'review' ? {decision: body.payload.decision} : {}),
  rows: body.payload.items.map((item, i) => ({version: 'payroll-fixed-receipt.v1', command: body.command === 'review' ? 'review' : 'propose',
    recordId: item.recordId, proposalId: item.proposalId ?? uuid(i + 10000), recordVersion: item.expectedVersion + 1, duplicate: false})),
});
function setup(body, {caps, replay = false, anonymous = false} = {}) {
  const calls = [], session = {id: uuid(900), email: 'operator@example.invalid', version: 1, releaseSha: 'a'.repeat(40)};
  const handler = createInternalPayrollFixedGroupsHandler({env: {INTERNAL_APP_ORIGIN: origin},
    requireCompatibleInternalAccess: async (_req, res) => {
      if (anonymous) {res.status(401).json({ok: false}); return null;}
      return {mode: 'managed', principal: {user: {email: session.email}, tenant: {source: 'membership', id: uuid(1), membershipId: uuid(2), certifiedReleaseSha: session.releaseSha,
        effectiveCapabilities: caps ?? ['payroll.novelty.read', 'payroll.novelty.nominal.read', body.command === 'review' ? 'payroll.fixed.approve' : 'payroll.fixed.prepare']}}};
    }, actionMutationSession: () => session,
    getInternalSql: async () => ({query: async (sql, args) => {calls.push({sql, args}); return [{result: receipt(body, replay)}];}}),
  }, body.command);
  return {handler, calls};
}
function request(body, representation = 'buffer') {
  const bytes = Buffer.from(JSON.stringify(body));
  const req = {method: 'POST', query: {}, headers: {origin, 'content-type': 'application/json', 'idempotency-key': key, 'content-length': String(bytes.length)}};
  if (representation === 'string') req.body = bytes.toString('utf8');
  else if (representation === 'buffer') req.body = bytes;
  else {
    // Split inside a UTF-8 character as well as between repeated row fields.
    const cut = bytes.indexOf(Buffer.from('ó')) + 1;
    req[Symbol.asyncIterator] = async function* () {yield bytes.subarray(0, cut); yield bytes.subarray(cut, cut + 11); yield bytes.subarray(cut + 11);};
  }
  return req;
}
for (const command of ['annul', 'correct', 'review']) {
  for (const format of ['string', 'buffer', 'stream']) test(command + ' accepts 45 real-wire rows as ' + format + ' with identical SQL body and key', async () => {
    const body = envelope(command), {handler, calls} = setup(body), res = response();
    await handler(request(body, format), res);
    assert.equal(res.statusCode, 201, JSON.stringify(res.body)); assert.equal(calls.length, 1);
    assert.deepEqual(JSON.parse(calls[0].args[1]), body.payload); assert.equal(calls[0].args[2], key);
    assert.equal(res.body.data.total, 45); assert.deepEqual(res.body.data.effects, fixedEffects);
    if (command === 'correct') {assert.equal(JSON.parse(calls[0].args[1]).items[0].values.quantityDecimal, '0'); assert.equal(JSON.parse(calls[0].args[1]).items[0].values.amountCents, null); assert.equal(JSON.parse(calls[0].args[1]).items[1].values.amountCents, '0');}
  });
  test(command + ' keeps all 500 rows and replays the same raw body/key', async () => {
    const body = envelope(command, 500), {handler, calls} = setup(body, {replay: true}), res = response();
    await handler(request(body), res); assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.headers['Idempotency-Replayed'], 'true'); assert.equal(res.body.data.total, 500);
    assert.deepEqual(JSON.parse(calls[0].args[1]), body.payload); assert.equal(calls[0].args[2], key);
  });
  for (const [label, edit] of [
    ['root duplicate', s => s.replace('"command":', '"command":"' + command + '","command":')],
    ['escaped root duplicate', s => s.replace('"command":', '"comm\\u0061nd":"' + command + '","command":')],
    ['nested duplicate', s => s.replace('"items":', '"items":[],"items":')],
    ['row duplicate', s => s.replace('"expectedVersion":', '"expectedVersion":1,"expectedVersion":')],
    ['escaped row duplicate', s => s.replace('"expectedVersion":', '"expected\\u0056ersion":1,"expectedVersion":')],
    ['malformed JSON', s => s.slice(0, -1)],
  ]) test(command + ' rejects ' + label + ' before SQL', async () => {
    const body = envelope(command), req = request(body); req.body = Buffer.from(edit(JSON.stringify(body))); req.headers['content-length'] = String(req.body.length);
    const {handler, calls} = setup(body), res = response(); await handler(req, res);
    assert.equal(res.statusCode, 400); assert.equal(calls.length, 0);
  });
  test(command + ' enforces origin, grant, length and size on original bytes', async () => {
    const body = envelope(command);
    for (const variant of ['origin', 'grant', 'length', 'declared-size', 'actual-size', 'utf8']) {
      const {handler, calls} = setup(body, variant === 'grant' ? {caps: ['payroll.novelty.read', 'payroll.novelty.nominal.read']} : {}), req = request(body), res = response();
      const max = command === 'correct' ? FIXED_CORRECTION_GROUP_MAX_BODY : FIXED_GROUP_MAX_BODY;
      if (variant === 'origin') req.headers.origin = 'https://foreign.example';
      if (variant === 'length') req.headers['content-length'] = String(req.body.length + 1);
      if (variant === 'declared-size') req.headers['content-length'] = String(max + 1);
      if (variant === 'actual-size') {delete req.headers['content-length']; req.body = Buffer.alloc(max + 1, 32);}
      if (variant === 'utf8') {delete req.headers['content-length']; req.body = Buffer.concat([req.body.subarray(0, req.body.length - 2), Buffer.from([0xff]), req.body.subarray(req.body.length - 2)]);}
      await handler(req, res); assert.ok(res.statusCode >= 400, variant); assert.equal(calls.length, 0, variant);
    }
  });
  test(command + ' uses restored Vercel stream without reading lazy decoded body', async () => {
    const body = envelope(command), req = request(body), stream = new PassThrough(); let reads = 0;
    delete req.body; Object.defineProperty(req, 'body', {get() {reads++; return body;}});
    req.on = (event, fn) => stream.on(event, fn); req.read = () => null; req.complete = true;
    const {handler, calls} = setup(body), res = response(), done = handler(req, res); stream.end(Buffer.from(JSON.stringify(body))); await done;
    assert.equal(res.statusCode, 201, JSON.stringify(res.body)); assert.equal(reads, 0); assert.deepEqual(JSON.parse(calls[0].args[1]), body.payload);
  });
  test(command + ' never reads raw body or SQL for anonymous access', async () => {
    const body = envelope(command), req = request(body), {handler, calls} = setup(body, {anonymous: true}), res = response();
    delete req.body; Object.defineProperty(req, 'body', {get() {throw Error('must not read private body');}});
    await handler(req, res); assert.equal(res.statusCode, 401); assert.equal(calls.length, 0);
  });
  test(command + ' traverses a real local HTTP request stream for 500 rows, replay and duplicate rejection', async () => {
    const body = envelope(command, 500), fixture = setup(body, {replay: true});
    const server = createServer((req, res) => {
      req.query = {}; res.status = n => {res.statusCode = n; return res;};
      res.json = value => {res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value));};
      fixture.handler(req, res).catch(() => {res.statusCode = 500; res.end();});
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const url = 'http://127.0.0.1:' + server.address().port + '/', headers = request(body).headers;
      const good = await fetch(url, {method: 'POST', headers, body: Buffer.from(JSON.stringify(body)), signal: AbortSignal.timeout(5000)});
      assert.equal(good.status, 200); assert.equal(good.headers.get('Idempotency-Replayed'), 'true');
      const receipt = await good.json(); assert.equal(receipt.data.total, 500);
      assert.deepEqual(JSON.parse(fixture.calls[0].args[1]), body.payload); assert.equal(fixture.calls[0].args[2], key);
      const duplicate = JSON.stringify(body).replace('"expectedVersion":', '"expectedVersion":1,"expectedVersion":'), invalidHeaders = {...headers}; delete invalidHeaders['content-length'];
      const invalid = await fetch(url, {method: 'POST', headers: invalidHeaders, body: Buffer.from(duplicate), signal: AbortSignal.timeout(5000)});
      assert.equal(invalid.status, 400); assert.equal(fixture.calls.length, 1);
    } finally {server.closeAllConnections(); await new Promise(resolve => server.close(resolve));}
  });
}
