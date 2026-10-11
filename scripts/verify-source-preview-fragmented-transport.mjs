import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

// A finite synthetic regression. The second fragment is released only after
// the browser consumed the first, never by sleeping or weakening an assertion.
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && /^--output=verification\/payroll-formula-transport\/[a-z0-9-]+$/.test(process.argv[2])));
const output = process.argv[2]?.slice('--output='.length) || 'verification/payroll-formula-transport/fragmented-regression';
fs.mkdirSync('verification/payroll-formula-transport', { recursive: true }); fs.mkdirSync(output);
const source = fs.readFileSync('assets/grh-source-preview.js');
assert.deepEqual(source, fs.readFileSync('public/assets/grh-source-preview.js'));
const items = new Map(), cases = [];
const definitions = [...['chunked', 'length'].flatMap(framing => Array.from({ length: 3 }, () => ({ kind: 'complete', framing }))),
  { kind: 'truncated', framing: 'length' }, { kind: 'oversize', framing: 'chunked' }, { kind: 'abort', framing: 'chunked' }];
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (request.method === 'GET' && url.pathname === '/') return response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }).end('<!doctype html><title>Synthetic fragmented transport</title>');
  if (request.method === 'GET' && url.pathname === '/assets/grh-source-preview.js') return response.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }).end(source);
  const index = Number(url.searchParams.get('case')), item = items.get(index);
  if (!item || !/^\d+$/.test(url.searchParams.get('case') || '') || request.method !== 'POST') return response.writeHead(404).end();
  request.resume();
  if (url.pathname === '/__qa-eof') {
    item.eofReleases++; assert.equal(item.eofReleases, 1); assert.ok(item.released && item.response && !item.response.destroyed);
    if (item.kind === 'truncated') item.response.socket?.end();
    else item.response.end();
    return response.writeHead(204, { 'cache-control': 'no-store' }).end();
  }
  if (url.pathname === '/__qa-release') {
    item.releases++; assert.equal(item.releases, 1); assert.ok(item.response && !item.response.destroyed);
    item.released = true;
    item.response.write(item.kind === 'oversize' ? 'x'.repeat(65536) : 'true}');
    return response.writeHead(204, { 'cache-control': 'no-store' }).end();
  }
  if (url.pathname !== '/api/internal-grh-source-preview') return response.writeHead(404).end();
  item.requests++; assert.equal(item.requests, 1); item.response = response;
  response.once('finish', () => { item.serverFinished = response.writableFinished; });
  response.once('close', () => { item.serverClosed = true; });
  response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    ...(item.framing === 'length' ? { 'content-length': item.kind === 'truncated' ? 12 : 11 } : {}) });
  response.write(item.kind === 'oversize' ? '{' : '{"ok":');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext(), page = await context.newPage();
const cdp = await context.newCDPSession(page), browserVersion = await cdp.send('Browser.getVersion');
try {
  await page.goto(origin);
  await page.evaluate(async () => { window.__reader = (await import('/assets/grh-source-preview.js')).readSourcePreviewReply; });
  for (let index = 0; index < definitions.length; index++) {
    const definition = definitions[index], item = { ...definition, requests: 0, releases: 0, eofReleases: 0, serverFinished: false, serverClosed: false, released: false };
    items.set(index, item); const target = origin + '/api/internal-grh-source-preview?case=' + index;
    let requestObject, responseObject, settle, timer;
    const terminal = new Promise(resolve => { settle = resolve; });
    const onRequest = request => { if (request.url() === target && request.method() === 'POST') requestObject = request; };
    const onResponse = response => { if (response.request() === requestObject) responseObject = response; };
    const onFinished = request => { if (request === requestObject) settle('finished'); };
    const onFailed = request => { if (request === requestObject) settle('failed'); };
    page.on('request', onRequest); page.on('response', onResponse); page.on('requestfinished', onFinished); page.on('requestfailed', onFailed);
    try {
      const result = await page.evaluate(async ({ index, kind }) => {
        const controller = new AbortController();
        const response = await fetch('/api/internal-grh-source-preview?case=' + index, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' },
          signal: controller.signal, cache: 'no-store', credentials: 'same-origin', redirect: 'error' });
        const native = response.body.getReader(); let first = true, firstBytes = 0, consumedBytes = 0, cancelCalls = 0, releaseCalls = 0;
        // Delegate native calls with their original receiver. The rendezvous
        // controls delivery only; the complete published reader stays intact.
        const reader = { async read() {
          const chunk = await native.read();
          if (!chunk.done) consumedBytes += chunk.value.byteLength;
          if (first && !chunk.done) {
            first = false; firstBytes = chunk.value.byteLength;
            if (kind === 'abort') controller.abort();
            else { const release = await fetch('/__qa-release?case=' + index, { method: 'POST', cache: 'no-store' }); await release.arrayBuffer(); }
          } else if (!chunk.done && consumedBytes === (kind === 'oversize' ? 65537 : 11)) {
            // EOF is delivered only after the final bytes were independently
            // consumed, exposing the native terminal-state ordering regression.
            const eof = await fetch('/__qa-eof?case=' + index, { method: 'POST', cache: 'no-store' }); await eof.arrayBuffer();
          }
          return chunk;
        }, cancel(...args) { cancelCalls++; return native.cancel(...args); }, releaseLock() { releaseCalls++; return native.releaseLock(); } };
        let parsed = false, rejected = false, rejectionCode = null;
        try { const value = await window.__reader({ headers: response.headers, body: { getReader: () => reader } }, controller.signal); parsed = JSON.stringify(value) === '{"ok":true}'; }
        catch (error) { rejected = true; rejectionCode = error.message === 'SOURCE_RESPONSE_INVALID' ? 'SOURCE_RESPONSE_INVALID' : error.name === 'AbortError' ? 'AbortError' : 'ReadError'; }
        return { parsed, rejected, rejectionCode, firstBytes, consumedBytes, cancelCalls, releaseCalls };
      }, { index, kind: definition.kind });
      const state = await Promise.race([terminal, new Promise(resolve => { timer = setTimeout(() => resolve('timeout'), 30000); })]);
      const completed = state === 'finished' ? await responseObject.finished() === null : false;
      const expected = definition.kind === 'complete' ? result.parsed && !result.rejected && completed && result.cancelCalls === 0
        : result.rejected && !result.parsed && state !== 'timeout' && result.cancelCalls >= 1
          && (definition.kind !== 'oversize' || result.rejectionCode === 'SOURCE_RESPONSE_INVALID')
          && (definition.kind !== 'abort' || result.rejectionCode === 'AbortError')
          && (definition.kind !== 'truncated' || state === 'failed');
      cases.push({ index, ...definition, ...result, state, completed, expected: !!expected, requests: item.requests, releases: item.releases,
        serverFinished: item.serverFinished, serverClosed: item.serverClosed, secondFragmentReleased: item.released, eofReleases: item.eofReleases });
      assert.equal(responseObject.status(), 200);
    } finally {
      clearTimeout(timer); page.off('request', onRequest); page.off('response', onResponse); page.off('requestfinished', onFinished); page.off('requestfailed', onFailed);
      fs.writeFileSync(output + '/result.json', JSON.stringify({ syntheticOnly: true, productionWrites: 0, sourceSha256: createHash('sha256').update(source).digest('hex'),
        browser: browserVersion, cases }, null, 2) + '\n');
    }
  }
  console.log(JSON.stringify({ cases: cases.length, completedPositive: cases.filter(value => value.kind === 'complete' && value.expected).length,
    rejectedNegative: cases.filter(value => value.kind !== 'complete' && value.expected).length, failed: cases.filter(value => !value.expected).length }));
  assert.equal(cases.length, 9); assert.deepEqual(cases.filter(value => !value.expected || value.requests !== 1 || value.releaseCalls !== 1), [], 'Completed bodies must finish; truncated, oversized and cancelled bodies remain rejected');
} finally { await context.close(); await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
