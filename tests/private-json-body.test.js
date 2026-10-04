import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {parseScopedPrivateJson, readRawPrivateJson} from '../lib/private-json-body.js';
import {schoolCertificateHttp} from '../api/internal-family-certificates.js';
const fail = kind => {throw Object.assign(Error('Safe private body failure'), {kind});};
const options = {maxBytes: 4096, timeoutMs: 30, fail};

test('identical field names in parent, child and sibling objects retain every exact value', () => {
  const value = {command: 'outer', payload: {command: 'inner', items: [{values: {id: 'first', text: '{"fake":1} \\ " :'}}, {values: {id: 'second', text: 'áéíóú'}}]}};
  assert.deepEqual(parseScopedPrivateJson(JSON.stringify(value)), value);
  assert.deepEqual(parseScopedPrivateJson('{"x":{"k":0},"y":{"\\u006b":null}}'), {x: {k: 0}, y: {k: null}});
});
test('duplicate keys are rejected in each nested object, including escaped equivalences and special names', () => {
  for (const source of ['{"a":1,"\\u0061":2}', '{"rows":[{"id":1,"id":2}]}', '{"x":{"__proto__":0,"__proto__":1}}', '{"x":{"constructor":0,"constructor":1}}', '{"x":{"k":0,"\\u006b":null}}', '{"a":' + '['.repeat(9) + '0' + ']'.repeat(9) + '}']) assert.throws(() => parseScopedPrivateJson(source));
});
test('original restored bytes override decoded body getter and preserve multibyte UTF-8 chunks', async () => {
  const bytes = Buffer.from('{"rows":[{"id":"á"},{"id":"ó"}]}'), stream = new PassThrough(); let reads = 0;
  const req = {headers: {}, on: (event, fn) => stream.on(event, fn), read: () => null, complete: true};
  Object.defineProperty(req, 'body', {get() {reads++; throw Error('must not decode');}});
  const done = readRawPrivateJson(req, {...options, declaredLength: String(bytes.length)}), cut = bytes.indexOf(Buffer.from('á')) + 1;
  stream.write(bytes.subarray(0, cut)); stream.end(bytes.subarray(cut));
  assert.deepEqual(await done, {rows: [{id: 'á'}, {id: 'ó'}]}); assert.equal(reads, 0);
});
test('duplicate names hidden by a decoded getter remain rejected from the restored stream', async () => {
  const stream = new PassThrough(), req = {on: (...args) => stream.on(...args), read: () => null, complete: true}; let reads = 0;
  Object.defineProperty(req, 'body', {get() {reads++; return {rows: [{id: 2}]};}});
  const done = readRawPrivateJson(req, options); stream.end(Buffer.from('{"rows":[{"id":1,"\\u0069d":2}]}'));
  await assert.rejects(done, {kind: 'invalid'}); assert.equal(reads, 0);
});
test('size, incomplete content-length, invalid UTF-8 and decoded stream chunks never parse', async () => {
  for (const [req, extra, kind] of [
    [{body: Buffer.alloc(4097)}, {}, 'large'], [{body: '{"a":0}'}, {declaredLength: '1'}, 'invalid'],
    [{body: Buffer.from([0xff])}, {}, 'invalid'], [{body: {a: 1}}, {}, 'invalid'],
    [{async *[Symbol.asyncIterator]() {yield '{"a":0}';}}, {}, 'invalid'],
    [{async *[Symbol.asyncIterator]() {yield Buffer.alloc(4096); yield Buffer.from(' ');}}, {}, 'large'],
  ]) await assert.rejects(readRawPrivateJson(req, {...options, ...extra}), {kind});
});
test('aborted, incomplete and stalled streams are bounded and remove listeners', async () => {
  for (const event of ['aborted', 'error', 'close', 'timeout']) {
    const stream = new PassThrough(); stream.complete = false;
    const done = readRawPrivateJson(stream, {...options, timeoutMs: 5});
    if (event !== 'timeout') stream.emit(event, event === 'error' ? Error('private failure') : undefined);
    await assert.rejects(done, {kind: 'unavailable'});
    for (const name of ['data', 'end', 'error', 'aborted', 'close']) assert.equal(stream.listenerCount(name), 0);
    stream.destroy();
  }
});
test('certificate reader keeps its existing safe body error codes', async () => {
  for (const [body, code] of [['{"id":0,"id":1}', 'BODY_INVALID'], [Buffer.from([0xff]), 'BODY_INVALID'], [Buffer.alloc(33), 'BODY_TOO_LARGE']])
    await assert.rejects(schoolCertificateHttp.readBody({headers: {}, body}, 32), {code: 'SCHOOL_CERTIFICATE_' + code});
});
