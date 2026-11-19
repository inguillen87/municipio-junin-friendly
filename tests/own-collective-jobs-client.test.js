import test from 'node:test';
import assert from 'node:assert/strict';
import { collectiveJobSnapshot, readCompleteCollectiveComparison, collectiveJobStatusText } from '../assets/own-collective-jobs-client.js';

const uuid = n => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;
const reason = 'Revisión completa de declaraciones exclusivamente sintéticas.';
const definition = { dailyHours: null, monthlyHours: '0', asOfDate: '2026-10-01', documentReference: 'Documento sintético' };
const snapshot = total => ({ version: 'own-collective-job.v1', id: uuid(9000), family: 'working-time', period: '2026-10', command: 'approve', phase: 'prepared', total, prepared: total, confirmed: 0, unchanged: 0, completed: 0, reviewHash: 'a'.repeat(64), dispatchGeneration: 2, pauseCode: null });
function fixture(total = 257) {
 const pin = snapshot(total), rows = Array.from({ length: total }, (_, i) => ({ contractId: uuid(i + 1), legajo: `QA-${i + 1}`, before: null, after: structuredClone(definition), action: 'approve', confirmed: false }));
 const read = async (offset, limit) => ({ ...pin, reason, comparisons: rows.slice(offset, offset + limit), comparisonTotal: total, nextOffset: offset + limit < total ? offset + limit : null });
 return { pin, rows, read };
}

test('full review loads every page and preserves unknown values separately from zero', async () => {
 const f = fixture(); let calls = 0;
 const result = await readCompleteCollectiveComparison(async (...args) => { calls++; return f.read(...args); }, f.pin, 'working-time');
 assert.equal(calls, 2); assert.equal(result.rows.length, 257); assert.equal(result.reason, reason);
 assert.equal(result.rows[0].after.dailyHours, null); assert.equal(result.rows[0].after.monthlyHours, '0');
 assert.equal(result.reviewHash, f.pin.reviewHash);
});

test('review cannot confirm a truncated page or an invented continuation offset', async () => {
 for (const mutate of [p => ({ ...p, comparisons: p.comparisons.slice(0, 10) }), p => ({ ...p, nextOffset: 201 }), p => ({ ...p, comparisonTotal: 200 }), p => ({ ...p, comparisons: [] })]) {
  const f = fixture(); await assert.rejects(() => readCompleteCollectiveComparison(async (...args) => mutate(await f.read(...args)), f.pin, 'working-time'));
 }
});

test('different review, identity, period or reason on a later page invalidates the whole review', async () => {
 for (const patch of [{ reviewHash: 'b'.repeat(64) }, { id: uuid(9001) }, { period: '2026-11' }, { reason: 'Un fundamento distinto para el segundo grupo.' }]) {
  const f = fixture(); await assert.rejects(() => readCompleteCollectiveComparison(async (offset, limit) => ({ ...await f.read(offset, limit), ...(offset ? patch : {}) }), f.pin, 'working-time'));
 }
});

test('the comparison rejects a duplicated contract across page boundaries', async () => {
 const f = fixture(); f.rows[200].contractId = f.rows[0].contractId;
 await assert.rejects(() => readCompleteCollectiveComparison(f.read, f.pin, 'working-time'));
});

test('job status rejects contradictory completion and wrong job family', () => {
 assert.throws(() => collectiveJobSnapshot({ ...snapshot(3), phase: 'complete', completed: 2 }, 'working-time'));
 assert.throws(() => collectiveJobSnapshot({ ...snapshot(3), confirmed: 2, completed: 1 }, 'working-time'));
 assert.throws(() => collectiveJobSnapshot(snapshot(3), 'seniority'));
 assert.throws(() => collectiveJobSnapshot({ ...snapshot(3), prepared: 2 }, 'working-time'));
 assert.throws(() => collectiveJobSnapshot({ ...snapshot(3), dispatchGeneration: null }, 'working-time'));
});

test('running and paused messages describe durable progress without requiring an open tab', () => {
 assert.match(collectiveJobStatusText({ ...snapshot(3), phase: 'running', completed: 1, confirmed: 1 }), /Podés cerrar/);
 assert.match(collectiveJobStatusText({ ...snapshot(3), phase: 'paused', pauseCode: 'ACTION_SESSION_INVALID', confirmed: 1 }), /misma cuenta/);
});
