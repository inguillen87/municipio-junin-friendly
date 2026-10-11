import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

// Finite, synthetic investigation. This does not replace a release
// gate or edit the published reader. There is no routing or interception.
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && /^--output=verification\/payroll-formula-transport\/[a-z0-9-]+$/.test(process.argv[2])), 'Unsupported synthetic observation option');
const out = process.argv[2]?.slice('--output='.length) || 'verification/payroll-formula-transport/reduced-matrix';
fs.mkdirSync('verification/payroll-formula-transport', { recursive: true });
fs.mkdirSync(out, { recursive: false });
const source = fs.readFileSync('assets/grh-source-preview.js');
assert.deepEqual(source, fs.readFileSync('public/assets/grh-source-preview.js'));
const expected = { ok: true, synthetic: true, count: 2, padding: 'x'.repeat(2048) };
const payload = Buffer.from(JSON.stringify(expected));
const serverEvents = [];
let framing;
const server = http.createServer((request, response) => {
  if (request.url === '/assets/grh-source-preview.js' && request.method === 'GET') {
    response.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' });
    return response.end(source);
  }
  if (request.url === '/' && request.method === 'GET') {
    response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' });
    return response.end('<!doctype html><title>Synthetic transport reduction</title>');
  }
  if (request.url !== '/api/internal-grh-source-preview' || request.method !== 'POST') {
    response.writeHead(404); return response.end();
  }
  request.resume();
  request.once('end', () => {
    response.once('finish', () => serverEvents.push({ finish: true, writableFinished: response.writableFinished }));
    response.once('close', () => serverEvents.push({ close: true, writableFinished: response.writableFinished }));
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
      ...(framing === 'length' ? { 'content-length': payload.byteLength } : {}) });
    response.end(payload);
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const version = await cdp.send('Browser.getVersion');
const cdpTerminals = [];
const cdpRequests = new Set();
cdp.on('Network.requestWillBeSent', event => {
  if (event.request.method === 'POST' && event.request.url === base + '/api/internal-grh-source-preview') cdpRequests.add(event.requestId);
});
cdp.on('Network.loadingFinished', event => {
  if (cdpRequests.has(event.requestId)) cdpTerminals.push({ requestId: event.requestId, state: 'finished', encodedBytes: event.encodedDataLength });
});
cdp.on('Network.loadingFailed', event => {
  if (cdpRequests.has(event.requestId)) cdpTerminals.push({ requestId: event.requestId, state: 'failed', canceled: !!event.canceled });
});
await cdp.send('Network.enable');
const cases = [];
try {
  await page.goto(base);
  await page.evaluate(async () => { window.__publishedReader = (await import('/assets/grh-source-preview.js')).readSourcePreviewReply; });
  for (let index = 0; index < 30; index++) {
    for (framing of ['chunked', 'length']) for (const mode of ['published', 'published-held', 'held-reader', 'array-buffer']) {
      let terminalResolve, requestId, response;
      const terminal = new Promise(resolve => { terminalResolve = resolve; });
      const isObserved = request => request.method() === 'POST' && request.url() === base + '/api/internal-grh-source-preview';
      const onRequest = request => { if (isObserved(request)) requestId = request; };
      const onResponse = value => { if (value.request() === requestId) response = value; };
      const onFinished = request => { if (request === requestId) terminalResolve('finished'); };
      const onFailed = request => { if (request === requestId) terminalResolve('failed'); };
      page.on('request', onRequest); page.on('response', onResponse);
      page.on('requestfinished', onFinished); page.on('requestfailed', onFailed);
      let timer;
      const started = Date.now();
      try {
        const result = await page.evaluate(async mode => {
          const controller = new AbortController();
          const response = await fetch('/api/internal-grh-source-preview', { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
            headers: { 'content-type': 'application/json' }, body: '{}', signal: controller.signal });
          // Compare response retention and lock retention independently. This
          // is diagnostic only; the normal verifier keeps its published code.
          if (mode === 'published-held') window.__responseHold = response;
          if (mode === 'published' || mode === 'published-held') return await window.__publishedReader(response, controller.signal);
          if (mode === 'array-buffer') return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await response.arrayBuffer()));
          const reader = response.body.getReader(); window.__readerHold = reader;
          const chunks = []; let length = 0;
          while (true) {
            const { done, value } = await reader.read(); if (done) break;
            chunks.push(value); length += value.byteLength;
          }
          const bytes = new Uint8Array(length); let offset = 0;
          for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
          return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        }, mode);
        assert.deepEqual(result, expected);
        const state = await Promise.race([terminal, new Promise(resolve => { timer = setTimeout(() => resolve('timeout'), 30000); })]);
        assert.equal(response?.status(), 200);
        const completed = state === 'finished' ? await response.finished() === null : false;
        cases.push({ index, mode, framing, state, completed, parsedExactly: true, elapsedMs: Date.now() - started });
      } finally {
        clearTimeout(timer);
        page.off('request', onRequest); page.off('response', onResponse);
        page.off('requestfinished', onFinished); page.off('requestfailed', onFailed);
        // Release retained locks only AFTER the independently observed network
        // terminal event. This is an experiment, never an application workaround.
        await page.evaluate(() => { window.__readerHold?.releaseLock(); window.__readerHold = null; window.__responseHold = null; });
        fs.writeFileSync(out + '/result.json', JSON.stringify({ syntheticOnly: true, releaseGate: false, sourceSha256: createHash('sha256').update(source).digest('hex'),
          browser: version, nodeVersion: process.version, platform: process.platform, payloadBytes: payload.byteLength, serverEvents, cdpTerminals, cases }, null, 2) + '\n');
      }
    }
  }
  for (const framing of ['chunked', 'length']) for (const mode of ['published', 'published-held', 'held-reader', 'array-buffer']) {
    const values = cases.filter(value => value.mode === mode && value.framing === framing);
    console.log(JSON.stringify({ framing, mode, cases: values.length, failures: values.filter(value => !value.completed).length }));
  }
  assert.equal(cases.length, 240);
  assert.deepEqual(cases.filter(value => !value.completed), [], 'Every synthetic transport must finish; retained failures are not acceptance');
} finally {
  await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve));
}
