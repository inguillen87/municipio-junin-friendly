import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ATTENDANCE_AGENT_CONTRACT_VERSION,
  attendanceAgentBatchRequest,
  inspectAttendanceAgentBatch,
  sendAttendanceAgentBatch,
  validateAttendanceAgentConfig,
} from '../scripts/attendance-gateway-agent.mjs';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function config(overrides = {}) {
  return {
    contractVersion: ATTENDANCE_AGENT_CONTRACT_VERSION,
    endpoint: 'https://municipio.example/api/attendance-ingest',
    tenantId: TENANT_ID,
    connectorKey: 'connector-pm10',
    driverKey: 'legacy-rel000-fixed-width',
    transport: 'pull',
    deviceExternalKey: 'device-pm10-01',
    siteExternalKey: 'PM-10',
    timezone: 'America/Argentina/Mendoza',
    utcOffsetMinutes: -180,
    ...overrides,
  };
}

function rel000Line() {
  const row = Array(35).fill(' ');
  const put = (start, value) => [...value].forEach((character, offset) => { row[start + offset] = character; });
  put(0, '000000571'); put(9, '2012'); put(14, '01'); put(17, '03');
  put(20, '07'); put(23, '01'); put(29, '1');
  return row.join('');
}

test('config exige HTTPS, UUID tenant y no contiene secretos', () => {
  const value = validateAttendanceAgentConfig(config());
  assert.equal(value.endpoint, 'https://municipio.example/api/attendance-ingest');
  assert.equal(value.siteExternalKey, 'pm-10');
  assert.equal(Object.hasOwn(value, 'token'), false);
  assert.throws(() => validateAttendanceAgentConfig(config({ endpoint: 'http://municipio.example/api' })));
  assert.throws(() => validateAttendanceAgentConfig({ ...config(), password: 'never' }));
  assert.throws(() => validateAttendanceAgentConfig(config({ connectorKey: 'short' })));
  assert.throws(() => validateAttendanceAgentConfig(config({ deviceExternalKey: 'device/pm10' })));
});

test('lote de archivo usa hash estable y no borra ni reescribe la fuente', () => {
  const first = attendanceAgentBatchRequest(config(), `${rel000Line()}\n`);
  const replay = attendanceAgentBatchRequest(config(), `${rel000Line()}\n`);
  assert.match(first.inputSha256, /^[a-f0-9]{64}$/);
  assert.equal(first.request.batchKey, replay.request.batchKey);
  assert.equal(first.request.payload.text, `${rel000Line()}\n`);
  assert.equal(Object.hasOwn(first.request, 'token'), false);
  const longKey = `b${'x'.repeat(159)}`;
  assert.equal(attendanceAgentBatchRequest(
    config(), `${rel000Line()}\n`, { batchKey: longKey },
  ).request.batchKey.length, 160);
});

test('dry-run valida el parser y no realiza fetch', async () => {
  const result = await inspectAttendanceAgentBatch(config(), `${rel000Line()}\n`);
  assert.equal(result.receivedCount, 1);
  assert.equal(result.acceptedForSendCount, 1);
  assert.equal(result.duplicateInFileCount, 0);
});

test('envío usa bearer sin incluirlo en recibo ni body', async () => {
  let captured;
  const token = 'connector-token-that-is-long-enough-2026';
  const result = await sendAttendanceAgentBatch(config(), `${rel000Line()}\n`, {
    token,
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return {
        ok: true,
        status: 202,
        async json() {
          return {
            ok: true,
            batchId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            status: 'accepted',
            acceptedCount: 1,
            duplicateCount: 0,
            unmappedCount: 1,
            ambiguousCount: 0,
            replayed: false,
          };
        },
      };
    },
  });
  assert.equal(captured.options.headers.Authorization, `Bearer ${token}`);
  assert.equal(captured.options.body.includes(token), false);
  assert.equal(JSON.stringify(result).includes(token), false);
  assert.equal(result.acceptedCount, 1);
});

test('envío rechaza recibos exitosos con shape, tipos o contadores inconsistentes', async () => {
  const token = 'connector-token-that-is-long-enough-2026';
  const valid = {
    ok: true,
    batchId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    status: 'accepted',
    acceptedCount: 1,
    duplicateCount: 0,
    unmappedCount: 1,
    ambiguousCount: 0,
    replayed: false,
  };
  for (const payload of [
    { ...valid, acceptedCount: '1' },
    { ...valid, ambiguousCount: 1 },
    { ...valid, tokenSha256: 'never' },
    { ...valid, batchId: 'not-a-uuid' },
  ]) {
    await assert.rejects(
      sendAttendanceAgentBatch(config(), `${rel000Line()}\n`, {
        token,
        fetchImpl: async () => ({ ok: true, status: 202, async json() { return payload; } }),
      }),
      (error) => error.code === 'ATTENDANCE_AGENT_RESPONSE_INVALID',
    );
  }
});

test('estado HTTP del backend debe coincidir con replay del recibo', async () => {
  const token = 'connector-token-that-is-long-enough-2026';
  await assert.rejects(
    sendAttendanceAgentBatch(config(), `${rel000Line()}\n`, {
      token,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() {
          return {
            ok: true,
            batchId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            status: 'accepted',
            acceptedCount: 1,
            duplicateCount: 0,
            unmappedCount: 1,
            ambiguousCount: 0,
            replayed: false,
          };
        },
      }),
    }),
    (error) => error.code === 'ATTENDANCE_AGENT_RESPONSE_INVALID',
  );
});
