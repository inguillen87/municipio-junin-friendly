import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { canonicalAggregate, sourcePreviewFailure, readSourcePreviewReply, SOURCE_PREVIEW_REPLY_BYTES, SOURCE_PREVIEW_TIMEOUT_MS } from '../assets/grh-source-preview.js';
const make = overrides => ({ ok: true, includesRecordValues: false, persistencePerformed: false, data: {
  contractVersion: 'grh-source-preview.v1', definitionKey: 'junin-638-amaru-fixed55.v1', status: 'valid', format: 'fixed_width', encoding: 'ascii',
  contentFingerprint: 'hmac-sha256:' + 'a'.repeat(64), schemaSha256: 'b'.repeat(64), byteLength: 55, recordCount: 1, acceptedCount: 1, rejectedRecordCount: 0,
  issueCount: 0, structuralErrorCount: 0, schemaValid: true, rejectionSummary: {}, rejectionsTruncated: false, includesRecordValues: false, persistencePerformed: false, ...overrides,
}});
const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store' };
const reply = (body = JSON.stringify(make()), extraHeaders = {}) => new Response(body, { headers: { ...headers, ...extraHeaders } });
const signal = () => new AbortController().signal;
test('result must belong to the exact requested format and file size', () => {
  assert.ok(canonicalAggregate(make(), { definitionKey: 'junin-638-amaru-fixed55.v1', byteLength: 55 }));
  assert.equal(canonicalAggregate(make(), { definitionKey: 'grh-calculo-pipe-utf8.v1', byteLength: 55 }), null);
  assert.equal(canonicalAggregate(make(), { definitionKey: 'junin-638-amaru-fixed55.v1', byteLength: 56 }), null);
});
for (const patch of [{ includesRecordValues: true }, { persistencePerformed: true }, { raw: 'personal data' }]) test('result never accepts extra record data: ' + JSON.stringify(patch), () => assert.equal(canonicalAggregate(make(patch)), null));
for (const patch of [{ byteLength: 0 }, { byteLength: 2097153 }, { acceptedCount: 2 }, { issueCount: 1 }, { status: 'accepted_by_amaru' }]) test('count and scope contract rejects ' + JSON.stringify(patch), () => assert.equal(canonicalAggregate(make(patch)), null));
test('valid aggregate reply is read without adding fields', async () => assert.deepEqual(await readSourcePreviewReply(reply(), signal()), make()));
for (const [name, altered] of [
  ['HTML', { 'content-type': 'text/html' }], ['wrong media type', { 'content-type': 'application/jsonx' }],
  ['missing no-store', { 'cache-control': 'private' }], ['misleading cache', { 'cache-control': 'public, x-no-store' }],
  ['set-cookie', { 'set-cookie': 'private-content=synthetic' }], ['too long', { 'content-length': String(SOURCE_PREVIEW_REPLY_BYTES + 1) }],
  ['invalid size', { 'content-length': '-1' }],
]) test('rejects unsafe reply headers: ' + name, async () => assert.rejects(readSourcePreviewReply(reply(undefined, altered), signal()), /SOURCE_RESPONSE_INVALID/));
test('body stream is bounded even when Content-Length lies', async () => {
  const source = reply(' '.repeat(SOURCE_PREVIEW_REPLY_BYTES + 1), { 'content-length': '1' });
  await assert.rejects(readSourcePreviewReply(source, signal()), /SOURCE_RESPONSE_INVALID/);
});
for (const body of ['<html>private error</html>', '{', new Uint8Array([0xff])]) test('rejects non-JSON or malformed UTF-8 bytes', async () => assert.rejects(readSourcePreviewReply(reply(body), signal())));
test('cancelled stream is released and cannot return a stale reply', async () => {
  let cancelled = false;
  const controller = new AbortController();
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  const pending = readSourcePreviewReply(new Response(stream, { headers }), controller.signal);
  controller.abort(); await assert.rejects(pending); assert.equal(cancelled, true);
});
test('already aborted reader does not consume a result', async () => {
  const c = new AbortController(); c.abort(); await assert.rejects(readSourcePreviewReply(reply(), c.signal));
});
for (const status of [400, 401, 403, 413, 415, 422, 429, 500, 503, undefined]) test('operator error is fixed copy without raw API messages: ' + status, () => {
  const text = sourcePreviewFailure(status); assert.equal(typeof text, 'string');
  assert.doesNotMatch(text, /postgres|SELECT|token|@|http/i);
  if ([401, 403].includes(status)) assert.match(text, /sesión/);
  if ([429, 503, 500, undefined].includes(status)) assert.match(text, /reintentar/);
});
test('source checks remain bounded and manual', () => {
  assert.equal(SOURCE_PREVIEW_TIMEOUT_MS, 25000); assert.equal(SOURCE_PREVIEW_REPLY_BYTES, 65536);
  const source = fs.readFileSync(new URL('../assets/grh-source-preview.js', import.meta.url), 'utf8');
  assert.match(source, /redirect: 'error'/); assert.match(source, /cache: 'no-store'/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|file\.name|innerHTML/);
});
