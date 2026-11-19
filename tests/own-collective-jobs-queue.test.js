import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COLLECTIVE_JOB_TOPIC, publishCollectiveJob, processCollectiveJobMessage, collectiveJobQueueRetry, CollectiveJobPoisonMessage } from '../lib/own-collective-jobs-queue.js';
import { createOwnCollectiveDispatchHandler } from '../api/internal-own-collective-dispatch.js';
import { createOwnCollectiveWorkerHandler } from '../api/internal-own-collective-worker.js';

const id = n => `cccccccc-0000-4000-8000-${String(n).padStart(12, '0')}`;
const metadata = { topicName: COLLECTIVE_JOB_TOPIC, deliveryCount: 1 };
const response = () => ({ headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(value) { this.statusCode = value; return this; }, json(value) { this.value = value; return this; } });
const cronSecret = 'only-synthetic-cron-secret-not-a-real-credential-123';
const cronRequest = () => ({ method: 'GET', query: {}, url: '/api/internal-own-collective-dispatch', headers: { authorization: `Bearer ${cronSecret}` } });

test('queue payload is only an opaque ID and generation and retries reuse a stable publication key', async () => {
  const sent = [], queue = { send: async (...args) => { sent.push(args); return { messageId: 'synthetic' }; } };
  const job = { id: id(1), dispatchGeneration: 3, actorContext: { private: true }, file: { personal: true } };
  await publishCollectiveJob(job, { queue }); await publishCollectiveJob(job, { queue });
  assert.equal(sent[0][0], COLLECTIVE_JOB_TOPIC);
  assert.deepEqual(sent[0][1], { jobId: id(1), generation: 3 });
  assert.equal(sent[0][2].idempotencyKey, sent[1][2].idempotencyKey);
  assert.equal(sent[0][2].retentionSeconds, 604800);
});

test('commit then publish failure is recovered by stale delivery without repeating the committed chunk', async () => {
  let generation = 1, committedChunks = 0, failures = 1;
  const sent = [], step = async (_sql, jobId, expected, limit) => {
    assert.equal(jobId, id(1)); assert.equal(limit, 8);
    if (generation === expected) { generation++; committedChunks++; }
    return { id: jobId, dispatchGeneration: generation, phase: generation < 3 ? 'preparing' : 'prepared' };
  };
  const publish = async job => { if (failures-- > 0) throw Error('transport secret'); sent.push({ ...job }); };
  await assert.rejects(() => processCollectiveJobMessage({ jobId: id(1), generation: 1 }, metadata, { step, publish }), /COLLECTIVE_JOB_WORKER_RETRY/);
  assert.equal(committedChunks, 1);
  await processCollectiveJobMessage({ jobId: id(1), generation: 1 }, metadata, { step, publish });
  assert.equal(committedChunks, 1); assert.equal(sent[0].dispatchGeneration, 2);
  await processCollectiveJobMessage({ jobId: id(1), generation: 2 }, metadata, { step, publish });
  assert.equal(committedChunks, 2); assert.equal(sent.length, 1);
});

for (const phase of ['prepared', 'paused', 'complete', 'cancelled']) test(`worker does not dispatch further work when ${phase}`, async () => {
  let sent = 0;
  await processCollectiveJobMessage({ jobId: id(1), generation: 1 }, metadata, { step: async () => ({ id: id(1), dispatchGeneration: 2, phase }), publish: async () => { sent++; } });
  assert.equal(sent, 0);
});

test('forged fields, invalid generation and wrong topic are poison messages and never reach SQL', async () => {
  let calls = 0; const step = async () => { calls++; };
  for (const [message, meta] of [[{ jobId: id(1), generation: 1, actor: 'forged' }, metadata], [{ jobId: id(1), generation: -1 }, metadata], [{ jobId: id(1), generation: 1 }, { topicName: 'other-topic' }]]) {
    await assert.rejects(() => processCollectiveJobMessage(message, meta, { step }), CollectiveJobPoisonMessage);
  }
  assert.equal(calls, 0);
  assert.deepEqual(collectiveJobQueueRetry(new CollectiveJobPoisonMessage(), metadata), { acknowledge: true });
  assert.deepEqual(collectiveJobQueueRetry(Error('retry'), { deliveryCount: 100 }), { afterSeconds: 300 });
});

test('scheduled outbox dispatch works without an operator browser and isolates a failed publication', async () => {
  const jobs = [{ id: id(1), dispatchGeneration: 1 }, { id: id(2), dispatchGeneration: 2 }], sent = [];
  const handler = createOwnCollectiveDispatchHandler({ env: { CRON_SECRET: cronSecret }, getSql: async () => ({}), pending: async (_sql, limit) => { assert.equal(limit, 20); return jobs; }, publish: async job => { sent.push(job); if (job.id === id(2)) throw Error('secret transport'); } });
  const res = response(); await handler(cronRequest(), res);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.value, { ok: false, inspected: 2, queued: 1, pending: 1 });
  assert.equal(sent.length, 2);
  assert.match(res.headers['Cache-Control'], /no-store/);
});

test('dispatcher fails closed without the cron secret and for unauthenticated requests before SQL', async () => {
  for (const [env, mutate] of [[{}, () => {}], [{ CRON_SECRET: cronSecret }, req => delete req.headers.authorization], [{ CRON_SECRET: cronSecret }, req => req.headers.authorization += 'wrong'], [{ CRON_SECRET: cronSecret }, req => req.headers.Authorization = req.headers.authorization]]) {
    let calls = 0;
    const handler = createOwnCollectiveDispatchHandler({ env, getSql: async () => { calls++; return {}; } }), req = cronRequest(), res = response(); mutate(req);
    await handler(req, res); assert.equal(res.statusCode, 401); assert.equal(calls, 0);
  }
});

test('worker uses the SDK callback lifecycle and sanitizes database initialization failures', async () => {
  let callback, options;
  const queue = { handleNodeCallback: (fn, opts) => { callback = fn; options = opts; return async () => {}; } };
  createOwnCollectiveWorkerHandler({ queue, env: {}, getSql: async () => { throw Error('database password secret'); } });
  assert.equal(options.visibilityTimeoutSeconds, 120);
  await assert.rejects(() => callback({ jobId: id(1), generation: 1 }, metadata), error => error.message === 'COLLECTIVE_JOB_WORKER_RETRY');
});

test('deployment keeps the worker private behind a queue trigger and schedules independent outbox recovery', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const worker = config.functions?.['api/internal-own-collective-worker.js'];
  assert.ok(worker, 'The worker must be declared in the deployment configuration.');
  assert.equal(worker.experimentalTriggers?.length, 1, 'A worker without its queue trigger becomes a public HTTP route.');
  assert.equal(worker.experimentalTriggers[0].type, 'queue/v2beta');
  assert.equal(worker.experimentalTriggers[0].topic, COLLECTIVE_JOB_TOPIC);
  assert.ok(config.crons?.some(cron => cron.path === '/api/internal-own-collective-dispatch'), 'The durable outbox must recover without an open browser.');
});
