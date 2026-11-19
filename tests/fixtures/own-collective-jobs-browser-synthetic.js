// Fictional server state lives outside the page. This tests the product UI and
// transport contract; real SQL durability is exercised by the separate PG QA.
import assert from 'node:assert/strict';
import { collectiveFixture, id } from './own-contract-working-time-collective-synthetic.js';
import { collectiveWorkingTimeFile } from '../../assets/own-contract-working-time-collective.js';
import { prepareWorkingTime, decideWorkingTime, workingTimeDetail, workingTimeHash } from '../../assets/own-contract-working-time-model.js';

export async function collectiveJobsBrowserFixture(count = 257) {
 const source = collectiveFixture(count), jobs = new Map(), requests = [], keys = new Map();
 const hooks = { denied: false, loseConfirmAck: false, changedComparisonHash: false };
 for (const [index, row] of source.file.records.entries()) {
  const body = prepareWorkingTime(await source.io.readBootstrap(row.contractId), row.definition, 'Preparación exclusivamente sintética anterior al lote.');
  await source.io.sendCommand({ key: id(300000 + index), body });
 }
 source.setActor('checker');
 const snapshot = job => structuredClone({
  version: 'own-collective-job.v1', id: job.id, family: job.family,
  period: job.file.period, command: job.command, phase: job.phase, total: job.file.total,
  prepared: job.items.length, confirmed: job.confirmed, unchanged: 0,
  completed: job.confirmed, reviewHash: job.reviewHash, pauseCode: job.pauseCode,
  createdAt: '2026-11-10T06:00:00Z', updatedAt: '2026-11-10T06:00:00Z',
  dispatchGeneration: job.dispatchGeneration, fileHash: job.fileHash,
  actorLabel: 'Revisor exclusivamente sintético', reason: job.reason
 });
 const fail = (status, code, message) => { throw Object.assign(Error(message), { status, code }); };
 async function advance(jobId, maximum = count) {
  const job = jobs.get(jobId); assert.ok(job);
  if (job.phase === 'preparing') {
   while (job.items.length < job.file.total && maximum-- > 0) {
    const row = job.file.records[job.items.length], bootstrap = await source.io.readBootstrap(row.contractId);
    const proposal = bootstrap.proposals.find(value => value.status === 'pending'); assert.ok(proposal);
    const detail = await workingTimeDetail(await source.io.readDetail(proposal.id));
    const body = decideWorkingTime(bootstrap, detail, job.command, job.reason);
    job.items.push({ key: id(400000 + jobs.size * count + job.items.length), body, contractId: row.contractId, legajo: row.legajo, before: detail.baseDefinition, after: detail.body.definition, action: job.command, confirmed: false });
   }
   if (job.items.length === job.file.total) {
    job.reviewHash = await workingTimeHash({ fileHash: job.fileHash, command: job.command, reason: job.reason, items: job.items });
    job.phase = 'prepared';
   }
  } else if (job.phase === 'running') {
   while (job.confirmed < job.file.total && maximum-- > 0) {
    const item = job.items[job.confirmed];
    await source.io.sendCommand({ key: item.key, body: item.body });
    item.confirmed = true; job.confirmed++;
   }
   if (job.confirmed === job.file.total) job.phase = 'complete';
  }
  return snapshot(job);
 }
 async function request(url, method, body, key) {
  const params = new URL(url).searchParams;
  requests.push({ method, resource: params.get('resource'), offset: params.get('offset'), operation: body?.operation ?? null, key: key ?? null, body: body ? structuredClone(body) : null });
  if (hooks.denied) fail(403, 'COLLECTIVE_JOB_FORBIDDEN', 'Acceso sintético revocado.');
  if (method === 'GET' && params.get('resource') === 'list') return { ok: true, data: { jobs: [...jobs.values()].map(snapshot), hasMore: false, nextCursor: null }, dispatch: null };
  if (method === 'POST' && body.operation === 'create') {
   const payload = body.payload, file = collectiveWorkingTimeFile(payload.file);
   assert.equal(payload.family, 'working-time'); assert.ok(['approve', 'reject'].includes(payload.command));
   assert.match(key, /^[a-f0-9-]{36}$/);
   if (keys.has(key)) {
    const prior = jobs.get(keys.get(key)); assert.deepEqual(prior.file, file);
    return { ok: true, data: snapshot(prior), dispatch: 'queued' };
   }
   const job = { ...payload, file, id: id(800000 + jobs.size), phase: 'preparing', confirmed: 0, items: [], reviewHash: null, pauseCode: null, dispatchGeneration: 1, fileHash: await workingTimeHash(file) };
   jobs.set(job.id, job); keys.set(key, job.id);
   return { ok: true, data: snapshot(job), dispatch: 'queued' };
  }
  const job = jobs.get(method === 'GET' ? params.get('id') : body.payload.id);
  if (!job) fail(404, 'COLLECTIVE_JOB_NOT_FOUND', 'No existe ese conjunto sintético.');
  if (method === 'GET') {
   const data = snapshot(job);
   if (params.get('resource') === 'detail') {
    const offset = Number(params.get('offset')), limit = Number(params.get('limit'));
    assert.ok(Number.isSafeInteger(offset) && offset >= 0); assert.ok(limit > 0 && limit <= 200);
    data.comparisons = job.items.slice(offset, offset + limit).map(({ contractId, legajo, before, after, action, confirmed }) => ({ contractId, legajo, before, after, action, confirmed }));
    data.comparisonTotal = job.file.total;
    data.nextOffset = offset + data.comparisons.length < job.file.total ? offset + data.comparisons.length : null;
    if (hooks.changedComparisonHash && offset > 0) data.reviewHash = 'f'.repeat(64);
   } else assert.equal(params.get('resource'), 'status');
   return { ok: true, data, dispatch: null };
  }
  if (body.operation === 'confirm') {
   assert.equal(body.payload.confirmed, true); assert.equal(body.payload.reviewHash, job.reviewHash);
   if (job.phase === 'prepared') { job.phase = 'running'; job.dispatchGeneration++; }
   else assert.ok(['running', 'complete'].includes(job.phase));
   if (hooks.loseConfirmAck) { hooks.loseConfirmAck = false; fail(503, 'COLLECTIVE_JOB_UNAVAILABLE', 'Respuesta sintética perdida después de aceptar el conjunto.'); }
  } else if (body.operation === 'resume') {
   assert.equal(job.phase, 'paused'); job.phase = job.pausedFrom; job.pauseCode = null; job.dispatchGeneration++;
  } else if (body.operation === 'cancel') job.phase = 'cancelled';
  else fail(422, 'COLLECTIVE_JOB_INPUT_INVALID', 'Operación ajena a esta prueba sintética.');
  return { ok: true, data: snapshot(job), dispatch: ['preparing', 'running'].includes(job.phase) ? 'queued' : null };
 }
 function pause(jobId, pauseCode = 'COLLECTIVE_JOB_SESSION_INVALID') {
  const job = jobs.get(jobId); job.pausedFrom = job.phase; job.phase = 'paused'; job.pauseCode = pauseCode;
 }
 return { source, file: source.file, jobs, requests, hooks, snapshot, request, advance, pause };
}
