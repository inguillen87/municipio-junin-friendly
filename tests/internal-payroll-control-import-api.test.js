import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  PAYROLL_CONTROL_IMPORT_API_MAX_BODY_BYTES,
  PAYROLL_CONTROL_IMPORT_REQUIRED_CAPABILITY,
  createInternalPayrollControlImportHandler,
} from '../api/internal-payroll-control-import.js';
import { PayrollControlImportError } from '../lib/internal-payroll-control-import.js';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MEMBERSHIP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SESSION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BINDING_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const BATCH_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const IDEMPOTENCY = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const REFERENCE = 'ref:11111111-1111-4111-8111-111111111111';
const RELEASE_SHA = 'a'.repeat(40);
const HMAC_SECRET = 'unit-test-payroll-control-import-secret-32-bytes';

test('Vercel publica la API gobernada con presupuesto acotado de ejecución', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.functions['api/internal-payroll-control-import.js']?.maxDuration, 20);
});

function response() {
  return {
    headers: {}, statusCode: 200, payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; },
  };
}

function access(overrides = {}) {
  return {
    mode: 'managed',
    session: { id: SESSION_ID, email: 'operator@junin.gob.ar', version: 3 },
    principal: {
      user: { email: 'operator@junin.gob.ar' },
      tenant: {
        id: TENANT_ID,
        membershipId: MEMBERSHIP_ID,
        source: 'membership',
        certifiedReleaseSha: RELEASE_SHA,
      },
    },
    ...overrides,
  };
}

function batch(overrides = {}) {
  return {
    id: BATCH_ID,
    sourceKind: 'grh_observed',
    provenanceState: 'operator_declared',
    period: '2026-07',
    jurisdiction: '42',
    definitionKey: 'payroll-post-close-701-703.v1',
    contractVersion: 'payroll-control-import.v1',
    hmacKeyVersion: 'hmac-v1',
    contentFingerprint: 'b'.repeat(64),
    byteLength: 128,
    rowCount: 2,
    releaseSha: RELEASE_SHA,
    status: 'quarantined',
    version: 1,
    reasonCode: 'source_uploaded',
    reasonReference: null,
    payrollPosted: false,
    fiscalArtifactGenerated: false,
    rows: [
      { concept: '701', amountCents: '100' },
      { concept: '703', amountCents: '200' },
    ],
    allowedCommands: ['submit', 'cancel'],
    ...overrides,
  };
}

function bootstrap(overrides = {}) {
  return {
    principal: {
      tenantId: TENANT_ID,
      membershipId: MEMBERSHIP_ID,
      certifiedBindingId: BINDING_ID,
      roleKey: 'PLATFORM_OWNER_OPERATIVO_INTEGRAL',
      employmentLinked: true,
      capabilities: [
        PAYROLL_CONTROL_IMPORT_REQUIRED_CAPABILITY,
        'payroll.control_import.prepare',
        'payroll.control_import.audit.read',
      ],
    },
    batches: [batch()],
    recentEvents: [{ id: 1, batchId: BATCH_ID, command: 'prepare' }],
    limits: {
      maxSourceBytes: 16384,
      contractVersion: 'payroll-control-import.v1',
      hmacKeyVersion: 'hmac-v1',
      definitionKey: 'payroll-post-close-701-703.v1',
      sourceKinds: ['grh_observed', 'operator_control'],
      concepts: ['701', '703'],
    },
    ...overrides,
  };
}

function sourceText() {
  return [
    'periodo;jurisdiccion;concepto;importe_ars',
    '2026-07;42;701;82882370,98',
    '2026-07;42;703;106546119,35',
  ].join('\n');
}

function prepareRequest(overrides = {}) {
  return {
    method: 'POST',
    query: {},
    headers: {
      origin: 'https://municipio.example',
      'sec-fetch-site': 'same-origin',
      'content-type': 'application/json',
      'idempotency-key': IDEMPOTENCY,
    },
    body: {
      command: 'prepare',
      payload: {
        sourceKind: 'grh_observed',
        period: '2026-07',
        jurisdiction: '42',
        definitionKey: 'payroll-post-close-701-703.v1',
        contentBase64: Buffer.from(sourceText()).toString('base64'),
      },
    },
    ...overrides,
  };
}

function transitionRequest(command = 'submit', payload = {}) {
  const reasons = {
    submit: ['ready_for_validation', null],
    approve: ['source_validated', null],
    reject: ['amounts_inconsistent', REFERENCE],
    cancel: ['cancelled_by_preparer', REFERENCE],
  };
  return {
    method: 'POST',
    query: {},
    headers: {
      origin: 'https://municipio.example',
      'sec-fetch-site': 'same-origin',
      'content-type': 'application/json',
      'idempotency-key': IDEMPOTENCY,
    },
    body: {
      command,
      payload: {
        batchId: BATCH_ID,
        expectedVersion: 1,
        reasonCode: reasons[command][0],
        reasonReference: reasons[command][1],
        ...payload,
      },
    },
  };
}

function dependencies(overrides = {}) {
  const defaults = {
    env: {
      NODE_ENV: 'test',
      INTERNAL_APP_ORIGIN: 'https://municipio.example',
      VERCEL_GIT_COMMIT_SHA: RELEASE_SHA,
      PAYROLL_CONTROL_IMPORT_HMAC_SECRET: HMAC_SECRET,
    },
    requireCompatibleInternalAccess: async () => access(),
    getInternalSql: async () => ({ runtime: true }),
    getPayrollControlImportBootstrap: async () => bootstrap(),
    listPayrollControlImports: (value) => ({ batches: value.batches, limits: value.limits }),
    readPayrollControlImport: (value, id) => ({
      ...value.batches.find((item) => item.id === id),
      events: value.recentEvents.filter((event) => event.batchId === id),
    }),
    preparePayrollControlImport: (value) => ({
      ...value,
      contractVersion: 'payroll-control-import.v1',
      hmacKeyVersion: 'hmac-v1',
      certifiedReleaseSha: RELEASE_SHA,
      contentHmacSha256: 'b'.repeat(64),
      periodMonth: `${value.period}-01`,
      byteLength: value.bytes.byteLength,
      rows: batch().rows,
      rawContentStored: false,
      includesPersonalRecords: false,
      payrollPosted: false,
      fiscalArtifactGenerated: false,
    }),
    persistPayrollControlImport: async () => ({
      replayed: false,
      data: batch(),
    }),
    transitionPayrollControlImport: async () => ({
      replayed: false,
      data: batch({ status: 'submitted', version: 2 }),
    }),
  };
  return {
    ...defaults,
    ...overrides,
    env: { ...defaults.env, ...(overrides.env || {}) },
  };
}

test('bootstrap exige membresía, binding certificado y capacidad explícita', async () => {
  const calls = [];
  const sql = { runtime: true };
  const handler = createInternalPayrollControlImportHandler(dependencies({
    requireCompatibleInternalAccess: async (_req, _res, options) => {
      calls.push(['access', options]);
      return access();
    },
    getInternalSql: async () => {
      calls.push(['sql']);
      return sql;
    },
    getPayrollControlImportBootstrap: async (...args) => {
      calls.push(['bootstrap', ...args]);
      return bootstrap();
    },
  }));
  const res = response();
  await handler({ method: 'GET', query: { resource: 'bootstrap' }, headers: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
  assert.equal(res.payload.data.principal.certifiedBindingId, BINDING_ID);
  assert.deepEqual(calls[0][1].requiredCapabilities, [PAYROLL_CONTROL_IMPORT_REQUIRED_CAPABILITY]);
  assert.equal(calls[0][1].requireDataPlaneReady, true);
  assert.equal(calls[0][1].requireCertifiedDataBinding, true);
  assert.equal(calls[0][1].allowLegacy, false);
  assert.equal(calls[2][1], sql);
  assert.equal(calls[2][2].tenant.id, TENANT_ID);
  assert.equal(calls[2][3].releaseSha, RELEASE_SHA);
  assert.equal(res.headers['Cache-Control'], 'private, no-store, max-age=0');
  assert.equal(res.headers.Vary, 'Cookie, Origin');
});

test('prepare autentica y revalida el binding antes de leer o decodificar la fuente', async () => {
  const order = [];
  let capturedBytes;
  let capturedContext;
  let persistArgs;
  const req = prepareRequest();
  const body = req.body;
  Object.defineProperty(req, 'body', {
    get() { order.push('body'); return body; },
  });
  const handler = createInternalPayrollControlImportHandler(dependencies({
    requireCompatibleInternalAccess: async () => {
      order.push('access');
      return access();
    },
    getInternalSql: async () => {
      order.push('sql');
      return { runtime: true };
    },
    getPayrollControlImportBootstrap: async () => {
      order.push('bootstrap');
      return bootstrap();
    },
    preparePayrollControlImport: (value) => {
      order.push('prepare');
      capturedBytes = value.bytes;
      capturedContext = {
        ...value.context,
        fingerprintKey: Buffer.from(value.context.fingerprintKey),
      };
      return dependencies().preparePayrollControlImport(value);
    },
    persistPayrollControlImport: async (...args) => {
      order.push('persist');
      persistArgs = args;
      return { replayed: true, data: batch() };
    },
  }));
  const res = response();
  await handler(req, res);

  assert.deepEqual(order, ['access', 'sql', 'bootstrap', 'body', 'prepare', 'persist']);
  assert.equal(res.statusCode, 201);
  assert.equal(res.payload.ok, true);
  assert.equal(res.payload.replayed, true);
  assert.equal(res.headers['Idempotency-Replayed'], 'true');
  assert.equal(capturedContext.tenantId, TENANT_ID);
  assert.equal(capturedContext.sourceBindingId, BINDING_ID);
  assert.equal(capturedContext.releaseSha, RELEASE_SHA);
  assert.equal(capturedContext.fingerprintKey.toString(), HMAC_SECRET);
  assert.equal(persistArgs[4], IDEMPOTENCY);
  assert.equal(persistArgs[5], BINDING_ID);
  assert.ok(capturedBytes.every((byte) => byte === 0), 'los bytes se borran al finalizar');
});

test('sesión ausente corta antes de SQL, bootstrap, body y parser', async () => {
  let sqlCalls = 0;
  let bootstrapCalls = 0;
  let parserCalls = 0;
  let bodyReads = 0;
  const req = prepareRequest();
  Object.defineProperty(req, 'body', {
    get() { bodyReads += 1; return prepareRequest().body; },
  });
  const handler = createInternalPayrollControlImportHandler(dependencies({
    requireCompatibleInternalAccess: async (_req, res) => {
      res.status(401).json({ ok: false, code: 'IDENTITY_SESSION_REQUIRED' });
      return null;
    },
    getInternalSql: async () => { sqlCalls += 1; return {}; },
    getPayrollControlImportBootstrap: async () => { bootstrapCalls += 1; return {}; },
    preparePayrollControlImport: () => { parserCalls += 1; return {}; },
  }));
  const res = response();
  await handler(req, res);

  assert.equal(res.statusCode, 401);
  assert.equal(sqlCalls, 0);
  assert.equal(bootstrapCalls, 0);
  assert.equal(bodyReads, 0);
  assert.equal(parserCalls, 0);
});

test('una membresía sin capacidad específica no decodifica ni persiste', async () => {
  let parserCalls = 0;
  let persistCalls = 0;
  const readonly = bootstrap();
  readonly.principal.capabilities = [PAYROLL_CONTROL_IMPORT_REQUIRED_CAPABILITY];
  const handler = createInternalPayrollControlImportHandler(dependencies({
    getPayrollControlImportBootstrap: async () => readonly,
    preparePayrollControlImport: () => { parserCalls += 1; return {}; },
    persistPayrollControlImport: async () => { persistCalls += 1; return {}; },
  }));
  const res = response();
  await handler(prepareRequest(), res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.code, 'PAYROLL_CONTROL_IMPORT_CAPABILITY_REQUIRED');
  assert.equal(parserCalls, 0);
  assert.equal(persistCalls, 0);
});

test('approve exige capacidad validate y conserva el comando público', async () => {
  const approver = bootstrap();
  approver.principal.capabilities = [
    PAYROLL_CONTROL_IMPORT_REQUIRED_CAPABILITY,
    'payroll.control_import.validate',
  ];
  const transitionCalls = [];
  const handler = createInternalPayrollControlImportHandler(dependencies({
    getPayrollControlImportBootstrap: async () => approver,
    transitionPayrollControlImport: async (...args) => {
      transitionCalls.push(args);
      return {
        replayed: false,
        data: batch({ status: 'validated', version: 2 }),
      };
    },
  }));
  const res = response();
  await handler(transitionRequest('approve'), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.data.status, 'validated');
  assert.equal(transitionCalls[0][3], 'approve');
  assert.deepEqual(transitionCalls[0][4], transitionRequest('approve').body.payload);
  assert.equal(transitionCalls[0][5], IDEMPOTENCY);
});

test('list y detail sólo proyectan corridas gobernadas del bootstrap', async () => {
  const handler = createInternalPayrollControlImportHandler(dependencies());
  const listed = response();
  await handler({ method: 'GET', query: { resource: 'list' }, headers: {} }, listed);
  assert.equal(listed.statusCode, 200);
  assert.deepEqual(Object.keys(listed.payload.data).sort(), ['batches', 'limits']);

  const detailed = response();
  await handler({
    method: 'GET', query: { resource: 'detail', id: BATCH_ID }, headers: {},
  }, detailed);
  assert.equal(detailed.statusCode, 200);
  assert.equal(detailed.payload.data.id, BATCH_ID);
  assert.equal(detailed.payload.data.events.length, 1);

  const extra = response();
  await handler({
    method: 'GET',
    query: { resource: 'detail', id: BATCH_ID, tenantId: TENANT_ID },
    headers: {},
  }, extra);
  assert.equal(extra.statusCode, 400);
  assert.equal(extra.payload.code, 'PAYROLL_CONTROL_IMPORT_QUERY_INVALID');
});

test('mutaciones rechazan origen cruzado, content-type e idempotencia ausente', async () => {
  const crossOrigin = prepareRequest();
  crossOrigin.headers.origin = 'https://attacker.example';
  crossOrigin.headers['sec-fetch-site'] = 'cross-site';
  const cross = response();
  await createInternalPayrollControlImportHandler(dependencies())(crossOrigin, cross);
  assert.equal(cross.statusCode, 403);
  assert.equal(cross.payload.code, 'PAYROLL_CONTROL_IMPORT_ORIGIN_INVALID');

  const plain = prepareRequest();
  plain.headers['content-type'] = 'text/plain';
  const plainResponse = response();
  await createInternalPayrollControlImportHandler(dependencies())(plain, plainResponse);
  assert.equal(plainResponse.statusCode, 415);

  const noKey = prepareRequest();
  delete noKey.headers['idempotency-key'];
  const noKeyResponse = response();
  await createInternalPayrollControlImportHandler(dependencies())(noKey, noKeyResponse);
  assert.equal(noKeyResponse.statusCode, 428);
  assert.equal(noKeyResponse.payload.code, 'PAYROLL_CONTROL_IMPORT_IDEMPOTENCY_KEY_REQUIRED');
});

test('rechaza cuerpo sobredimensionado y base64 no canónico', async () => {
  const tooLarge = prepareRequest();
  tooLarge.headers['content-length'] = String(PAYROLL_CONTROL_IMPORT_API_MAX_BODY_BYTES + 1);
  const tooLargeResponse = response();
  await createInternalPayrollControlImportHandler(dependencies())(tooLarge, tooLargeResponse);
  assert.equal(tooLargeResponse.statusCode, 413);
  assert.equal(tooLargeResponse.payload.code, 'PAYROLL_CONTROL_IMPORT_BODY_TOO_LARGE');

  const malformed = prepareRequest();
  malformed.body.payload.contentBase64 = 'bm8tY2Fub25pY2Fs=';
  const malformedResponse = response();
  await createInternalPayrollControlImportHandler(dependencies())(malformed, malformedResponse);
  assert.equal(malformedResponse.statusCode, 400);
  assert.equal(malformedResponse.payload.code, 'PAYROLL_CONTROL_IMPORT_CONTENT_INVALID');
});

test('falla cerrado sin secreto HMAC y no persiste', async () => {
  let persistCalls = 0;
  const handler = createInternalPayrollControlImportHandler(dependencies({
    env: { PAYROLL_CONTROL_IMPORT_HMAC_SECRET: '' },
    persistPayrollControlImport: async () => { persistCalls += 1; return {}; },
  }));
  const res = response();
  await handler(prepareRequest(), res);

  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.code, 'PAYROLL_CONTROL_IMPORT_HMAC_NOT_CONFIGURED');
  assert.equal(persistCalls, 0);
});

test('errores determinísticos nunca reflejan fuente ni mensajes SQL sensibles', async () => {
  const handler = createInternalPayrollControlImportHandler(dependencies({
    persistPayrollControlImport: async () => {
      throw new PayrollControlImportError(
        'PAYROLL_CONTROL_IMPORT_DUPLICATE_SOURCE',
        409,
        'La fuente ya fue registrada para este origen certificado',
      );
    },
  }));
  const res = response();
  await handler(prepareRequest(), res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.payload.code, 'PAYROLL_CONTROL_IMPORT_DUPLICATE_SOURCE');
  assert.doesNotMatch(JSON.stringify(res.payload), /82882370|106546119|operator@/);
});
