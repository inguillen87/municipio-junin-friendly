import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GRH_SOURCE_PREVIEW_API_MAX_BASE64_CHARS,
  GRH_SOURCE_PREVIEW_API_MAX_BODY_BYTES,
  GRH_SOURCE_PREVIEW_REQUIRED_CAPABILITIES,
  createInternalGrhSourcePreviewHandler,
} from '../api/internal-grh-source-preview.js';
import { previewGrhSource } from '../lib/internal-grh-source-preview.js';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MEMBERSHIP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SESSION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SOURCE_BINDING_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OTHER_TENANT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const OTHER_BINDING_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const RELEASE_SHA = 'a'.repeat(40);
const HMAC_SECRET = 'unit-test-grh-source-preview-secret-32-bytes-minimum';
const DEFINITION_KEY = 'grh-calculo-pipe-utf8.v1';

function response() {
  return {
    headers: {}, statusCode: 200, payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.payload = value; return this; },
  };
}

function managedAccess(overrides = {}) {
  const tenant = {
    id: TENANT_ID,
    slug: 'junin-mendoza',
    membershipId: MEMBERSHIP_ID,
    source: 'membership',
    certifiedReleaseSha: RELEASE_SHA,
    ...overrides.tenant,
  };
  return {
    mode: 'managed',
    session: {
      id: SESSION_ID,
      email: 'operator@junin.gob.ar',
      version: 3,
      ...overrides.session,
    },
    principal: {
      user: { email: 'operator@junin.gob.ar' },
      tenant,
      ...overrides.principal,
    },
    ...overrides.access,
  };
}

function timeSourceBootstrap(overrides = {}) {
  return {
    principal: {
      email: 'operator@junin.gob.ar',
      tenantId: TENANT_ID,
      membershipId: MEMBERSHIP_ID,
      certifiedBindingId: SOURCE_BINDING_ID,
      capabilities: new Set(['payroll.read', 'lineage.read', 'time.source.read']),
      ...overrides,
    },
  };
}

function dependencies(overrides = {}) {
  const defaults = {
    env: {
      NODE_ENV: 'test',
      INTERNAL_CERTIFIED_DATA_CONTRACT_SHA: RELEASE_SHA,
      GRH_SOURCE_PREVIEW_HMAC_SECRET: HMAC_SECRET,
    },
    requireCompatibleInternalAccess: async () => managedAccess(),
    getInternalSql: async () => ({ kind: 'isolated-runtime' }),
    getTimeSourceBootstrap: async () => timeSourceBootstrap(),
    previewGrhSource,
  };
  return {
    ...defaults,
    ...overrides,
    env: { ...defaults.env, ...(overrides.env || {}) },
  };
}

function sourceText(marker = '123456') {
  return [
    'codi_01|peri_31|mes_31|feca_31|tipo_31|lega_12|codi_27|cant_31|impo_31|codi_02|codi_06|codi_07',
    `101|2026|8|2026-08-31|M|${marker}|45|1,5|1200,25|2|6|7`,
  ].join('\n');
}

function request(body = {}) {
  return {
    method: 'POST',
    query: {},
    headers: { 'content-type': 'application/json' },
    body: {
      definitionKey: DEFINITION_KEY,
      contentBase64: Buffer.from(sourceText()).toString('base64'),
      ...body,
    },
  };
}

test('POST privado resuelve capability, tenant y binding antes de decodificar', async () => {
  const accessCalls = [];
  const sql = { kind: 'isolated-runtime' };
  const bootstrapCalls = [];
  const previewCalls = [];
  const handler = createInternalGrhSourcePreviewHandler(dependencies({
    requireCompatibleInternalAccess: async (_req, _res, options) => {
      accessCalls.push(options);
      return managedAccess();
    },
    getInternalSql: async () => sql,
    getTimeSourceBootstrap: async (...args) => {
      bootstrapCalls.push(args);
      return timeSourceBootstrap();
    },
    previewGrhSource: (bytes, definition, context) => {
      previewCalls.push({
        bytes,
        definition,
        context: {
          ...context,
          fingerprintKey: Buffer.from(context.fingerprintKey),
        },
      });
      return previewGrhSource(bytes, definition, context);
    },
  }));
  const res = response();
  await handler(request(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
  assert.equal(res.payload.includesRecordValues, false);
  assert.equal(res.payload.persistencePerformed, false);
  assert.equal(res.payload.data.includesRecordValues, false);
  assert.equal(res.payload.data.persistencePerformed, false);
  assert.equal(res.payload.data.recordCount, 1);
  assert.equal(res.payload.data.acceptedCount, 1);
  assert.deepEqual(accessCalls[0].requiredCapabilities, GRH_SOURCE_PREVIEW_REQUIRED_CAPABILITIES);
  assert.deepEqual(GRH_SOURCE_PREVIEW_REQUIRED_CAPABILITIES, [
    'payroll.read', 'lineage.read', 'time.source.read',
  ]);
  assert.equal(GRH_SOURCE_PREVIEW_REQUIRED_CAPABILITIES.includes('time.source.propose'), false);
  assert.equal(accessCalls[0].requireDataPlaneReady, true);
  assert.equal(accessCalls[0].requireCertifiedDataBinding, true);
  assert.equal(accessCalls[0].allowLegacy, false);
  assert.equal(bootstrapCalls[0][0], sql);
  assert.equal(bootstrapCalls[0][1].tenant.id, TENANT_ID);
  assert.equal(previewCalls[0].context.tenantId, TENANT_ID);
  assert.equal(previewCalls[0].context.sourceBindingId, SOURCE_BINDING_ID);
  assert.equal(previewCalls[0].context.fingerprintKey.toString(), HMAC_SECRET);
  assert.ok(previewCalls[0].bytes.every((byte) => byte === 0), 'los bytes se borran al finalizar');
  assert.equal(res.headers['Cache-Control'], 'private, no-store, max-age=0');
  assert.equal(res.headers.Vary, 'Cookie, Origin');
});

test('la respuesta es una proyección agregada y nunca refleja filas, nombres o principal', async () => {
  const sensitive = 'LEGAJO-SECRETO-778899';
  const handler = createInternalGrhSourcePreviewHandler(dependencies({
    previewGrhSource: (bytes, definition, context) => ({
      ...previewGrhSource(bytes, definition, context),
      rawRow: sensitive,
      fileName: 'sueldos-agosto-personal.csv',
      tenantId: TENANT_ID,
      sourceBindingId: SOURCE_BINDING_ID,
      rejections: [{ line: 2, code: 'BAD', value: sensitive }],
      structuralErrors: [{ line: 1, code: 'BAD', value: sensitive }],
    }),
  }));
  const res = response();
  await handler(request({
    contentBase64: Buffer.from(sourceText('778899')).toString('base64'),
  }), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(Object.keys(res.payload.data).sort(), [
    'acceptedCount', 'byteLength', 'contentFingerprint', 'contractVersion', 'definitionKey',
    'encoding', 'format', 'includesRecordValues', 'issueCount', 'persistencePerformed',
    'recordCount', 'rejectedRecordCount', 'rejectionSummary', 'rejectionsTruncated',
    'schemaSha256', 'schemaValid', 'status', 'structuralErrorCount',
  ].sort());
  const serialized = JSON.stringify(res.payload);
  assert.doesNotMatch(serialized, /778899|LEGAJO-SECRETO|sueldos-agosto|operator@/i);
  assert.doesNotMatch(serialized, new RegExp(`${TENANT_ID}|${SOURCE_BINDING_ID}`, 'i'));
  assert.doesNotMatch(serialized, /rawRow|fileName|"rejections":|"structuralErrors":/);
});

test('falla cerrado sin sesión y no lee SQL, body ni parser', async () => {
  let sqlCalls = 0;
  let previewCalls = 0;
  const handler = createInternalGrhSourcePreviewHandler(dependencies({
    requireCompatibleInternalAccess: async (_req, res) => {
      res.status(401).json({ ok: false, code: 'IDENTITY_SESSION_REQUIRED' });
      return null;
    },
    getInternalSql: async () => { sqlCalls += 1; return {}; },
    previewGrhSource: () => { previewCalls += 1; return {}; },
  }));
  const req = request({ contentBase64: 'dato-personal-no-base64' });
  let bodyReads = 0;
  Object.defineProperty(req, 'body', { get() { bodyReads += 1; return {}; } });
  const res = response();
  await handler(req, res);

  assert.equal(res.statusCode, 401);
  assert.equal(sqlCalls, 0);
  assert.equal(previewCalls, 0);
  assert.equal(bodyReads, 0);
});

test('exige membresía y capacidades de lectura vigentes en el contexto DB', async () => {
  const noMembershipAccess = managedAccess({ tenant: { membershipId: null } });
  let sqlCalls = 0;
  const noMembership = createInternalGrhSourcePreviewHandler(dependencies({
    requireCompatibleInternalAccess: async () => noMembershipAccess,
    getInternalSql: async () => { sqlCalls += 1; return {}; },
  }));
  const noMembershipResponse = response();
  await noMembership(request(), noMembershipResponse);
  assert.equal(noMembershipResponse.statusCode, 403);
  assert.equal(noMembershipResponse.payload.code, 'GRH_SOURCE_PREVIEW_TENANT_MEMBERSHIP_REQUIRED');
  assert.equal(sqlCalls, 0);

  for (const principal of [
    { capabilities: new Set(['lineage.read', 'time.source.read']) },
    { capabilities: new Set(['payroll.read', 'time.source.read']) },
    { capabilities: new Set(['payroll.read', 'lineage.read']) },
    { tenantId: OTHER_TENANT_ID },
    { certifiedBindingId: 'no-es-uuid' },
  ]) {
    const handler = createInternalGrhSourcePreviewHandler(dependencies({
      getTimeSourceBootstrap: async () => timeSourceBootstrap(principal),
    }));
    const res = response();
    await handler(request(), res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.payload.code, 'GRH_SOURCE_PREVIEW_AUTHORITY_REQUIRED');
  }
});

test('perfiles de consulta o aprobación pueden previsualizar sin capability de propuesta', async () => {
  for (const roleKey of ['CONSULTA_INTEGRAL', 'HUGO_APROBADOR_INTEGRAL']) {
    const handler = createInternalGrhSourcePreviewHandler(dependencies({
      requireCompatibleInternalAccess: async (_req, _res, options) => {
        assert.deepEqual(options.requiredCapabilities, [
          'payroll.read', 'lineage.read', 'time.source.read',
        ]);
        assert.equal(options.requiredCapabilities.includes('time.source.propose'), false);
        return managedAccess({ principal: { roleKey } });
      },
      getTimeSourceBootstrap: async () => timeSourceBootstrap({
        capabilities: new Set(['payroll.read', 'lineage.read', 'time.source.read']),
      }),
    }));
    const res = response();
    await handler(request(), res);
    assert.equal(res.statusCode, 200, roleKey);
    assert.equal(res.payload.ok, true, roleKey);
  }
});

test('falla cerrado si el helper devuelve agregados incoherentes o claims ampliados', async () => {
  const baseline = previewGrhSource(
    Buffer.from(sourceText()),
    {
      format: 'pipe', encoding: 'utf-8', delimiter: '|', header: true,
      fields: [
        { name: 'codi_01', type: 'integer', required: true },
        { name: 'peri_31', type: 'integer', required: true },
        { name: 'mes_31', type: 'integer', required: true },
        { name: 'feca_31', type: 'date', required: true },
        { name: 'tipo_31', type: 'text', required: true },
        { name: 'lega_12', type: 'integer', required: true },
        { name: 'codi_27', type: 'integer', required: true },
        { name: 'cant_31', type: 'decimal', required: false },
        { name: 'impo_31', type: 'decimal', required: false },
        { name: 'codi_02', type: 'integer', required: false },
        { name: 'codi_06', type: 'integer', required: false },
        { name: 'codi_07', type: 'integer', required: false },
      ],
    },
    { tenantId: TENANT_ID, sourceBindingId: SOURCE_BINDING_ID, fingerprintKey: HMAC_SECRET },
  );
  for (const mutation of [
    { acceptedCount: 2 },
    { contentFingerprint: `sha256:${'a'.repeat(64)}` },
    { includesRecordValues: true },
    { persistencePerformed: true },
    { rejectionSummary: { SECRET_PERSON_VALUE: 1 } },
  ]) {
    const handler = createInternalGrhSourcePreviewHandler(dependencies({
      previewGrhSource: () => ({ ...baseline, ...mutation }),
    }));
    const res = response();
    await handler(request(), res);
    assert.equal(res.statusCode, 503, JSON.stringify(mutation));
    assert.equal(res.payload.code, 'GRH_SOURCE_PREVIEW_CONTRACT_DRIFT');
    assert.doesNotMatch(JSON.stringify(res.payload), /SECRET_PERSON_VALUE|sha256:a/i);
  }
});

test('rechaza contexto, esquema y metadatos client-authoritative', async () => {
  const forbiddenBodies = [
    { tenantId: OTHER_TENANT_ID },
    { sourceBindingId: OTHER_BINDING_ID },
    { fingerprintKey: 'attacker-controlled-secret-that-is-long-enough' },
    { fileName: 'agosto.csv' },
    { name: 'agosto.csv' },
    { definition: { format: 'pipe', fields: [] } },
  ];
  for (const extra of forbiddenBodies) {
    let previewCalls = 0;
    const handler = createInternalGrhSourcePreviewHandler(dependencies({
      previewGrhSource: () => { previewCalls += 1; return {}; },
    }));
    const res = response();
    await handler(request(extra), res);
    assert.equal(res.statusCode, 400, JSON.stringify(extra));
    assert.equal(res.payload.code, 'GRH_SOURCE_PREVIEW_BODY_INVALID');
    assert.equal(previewCalls, 0);
    assert.doesNotMatch(JSON.stringify(res.payload), /attacker|agosto|eeeeeeee|ffffffff/i);
  }

  const unknownDefinition = response();
  await createInternalGrhSourcePreviewHandler(dependencies())(
    request({ definitionKey: 'client-schema.v99' }), unknownDefinition,
  );
  assert.equal(unknownDefinition.statusCode, 400);
  assert.equal(unknownDefinition.payload.code, 'GRH_SOURCE_PREVIEW_DEFINITION_INVALID');
});

test('valida base64 canónico y límites declarados/reales antes del parser', async () => {
  const handler = createInternalGrhSourcePreviewHandler(dependencies());
  for (const contentBase64 of ['YWJjZA', 'YW JjZA==', 'data:text/plain;base64,YQ==', '!!!!']) {
    const res = response();
    await handler(request({ contentBase64 }), res);
    assert.equal(res.statusCode, 400, contentBase64);
    assert.equal(res.payload.code, 'GRH_SOURCE_PREVIEW_CONTENT_INVALID');
  }

  let previewCalls = 0;
  const bounded = createInternalGrhSourcePreviewHandler(dependencies({
    previewGrhSource: () => { previewCalls += 1; return {}; },
  }));
  const declared = response();
  await bounded({
    ...request(),
    headers: {
      'content-type': 'application/json',
      'content-length': String(GRH_SOURCE_PREVIEW_API_MAX_BODY_BYTES + 1),
    },
  }, declared);
  assert.equal(declared.statusCode, 413);
  assert.equal(declared.payload.code, 'GRH_SOURCE_PREVIEW_BODY_TOO_LARGE');

  const encoded = response();
  await bounded(request({
    contentBase64: 'A'.repeat(GRH_SOURCE_PREVIEW_API_MAX_BASE64_CHARS + 4),
  }), encoded);
  assert.equal(encoded.statusCode, 413);
  assert.equal(encoded.payload.code, 'GRH_SOURCE_PREVIEW_CONTENT_TOO_LARGE');
  assert.equal(previewCalls, 0);
});

test('HMAC queda ligado al tenant/binding resuelto y nunca los publica', async () => {
  async function execute({ tenantId = TENANT_ID, bindingId = SOURCE_BINDING_ID } = {}) {
    const handler = createInternalGrhSourcePreviewHandler(dependencies({
      requireCompatibleInternalAccess: async () => managedAccess({ tenant: { id: tenantId } }),
      getTimeSourceBootstrap: async () => timeSourceBootstrap({
        tenantId,
        certifiedBindingId: bindingId,
      }),
    }));
    const res = response();
    await handler(request(), res);
    assert.equal(res.statusCode, 200);
    return res.payload.data.contentFingerprint;
  }

  const first = await execute();
  assert.equal(first, await execute());
  assert.notEqual(first, await execute({ tenantId: OTHER_TENANT_ID }));
  assert.notEqual(first, await execute({ bindingId: OTHER_BINDING_ID }));
  assert.match(first, /^hmac-sha256:[a-f0-9]{64}$/);
});

test('secreto HMAC ausente/corto y errores inesperados no filtran datos ni se registran', async (t) => {
  const short = createInternalGrhSourcePreviewHandler(dependencies({
    env: { GRH_SOURCE_PREVIEW_HMAC_SECRET: 'short' },
  }));
  const shortResponse = response();
  await short(request(), shortResponse);
  assert.equal(shortResponse.statusCode, 503);
  assert.equal(shortResponse.payload.code, 'GRH_SOURCE_PREVIEW_HMAC_NOT_CONFIGURED');

  let logs = 0;
  const originalError = console.error;
  t.after(() => { console.error = originalError; });
  console.error = () => { logs += 1; };
  const unexpected = createInternalGrhSourcePreviewHandler(dependencies({
    previewGrhSource: () => { throw new Error('LEGAJO-SECRETO-991122'); },
  }));
  const unexpectedResponse = response();
  await unexpected(request(), unexpectedResponse);
  assert.equal(unexpectedResponse.statusCode, 500);
  assert.equal(unexpectedResponse.payload.code, 'GRH_SOURCE_PREVIEW_INTERNAL_ERROR');
  assert.doesNotMatch(JSON.stringify(unexpectedResponse.payload), /991122|LEGAJO-SECRETO/);
  assert.equal(logs, 0);
});

test('sólo POST JSON same-origin puede alcanzar autenticación', async () => {
  let authCalls = 0;
  const handler = createInternalGrhSourcePreviewHandler(dependencies({
    env: {
      VERCEL_ENV: 'production',
      IDENTITY_APP_ORIGIN: 'https://municipio.example',
    },
    requireCompatibleInternalAccess: async () => { authCalls += 1; return managedAccess(); },
  }));

  const get = response();
  await handler({ method: 'GET', headers: {} }, get);
  assert.equal(get.statusCode, 405);
  assert.equal(get.headers.Allow, 'POST');

  const crossOrigin = response();
  await handler({
    ...request(),
    headers: {
      origin: 'https://evil.example',
      'sec-fetch-site': 'cross-site',
      'content-type': 'application/json',
    },
  }, crossOrigin);
  assert.equal(crossOrigin.statusCode, 403);

  const wrongType = response();
  await handler({
    ...request(),
    headers: { origin: 'https://municipio.example', 'content-type': 'multipart/form-data' },
  }, wrongType);
  assert.equal(wrongType.statusCode, 415);

  const noOrigin = response();
  await handler({ ...request(), headers: { 'content-type': 'application/json' } }, noOrigin);
  assert.equal(noOrigin.statusCode, 403);
  assert.equal(authCalls, 0);
});
