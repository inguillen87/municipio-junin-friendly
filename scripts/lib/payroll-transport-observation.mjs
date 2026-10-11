import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const observedPath = '/api/internal-grh-source-preview';

// Synthetic browser QA only. Never collect headers, query strings, bodies,
// filenames, identity values or arbitrary error messages in transport logs.
export function createPayrollTransportObservation(write) {
  const started = performance.now();
  const ids = new WeakMap();
  const responseIds = new WeakMap();
  let nextId = 0;
  let nextResponseId = 0;
  function responseValues(response) {
    if (!responseIds.has(response)) responseIds.set(response, ++nextResponseId);
    return { responseId: responseIds.get(response), status: response.status(), fromServiceWorker: response.fromServiceWorker() };
  }
  function requestValues(request) {
    if (!ids.has(request)) ids.set(request, ++nextId);
    return { requestId: ids.get(request), serviceWorkerOwned: !!request.serviceWorker() };
  }
  function emit(event, values = {}) {
    write({ event, elapsedMs: Math.round((performance.now() - started) * 1000) / 1000, ...values });
  }
  function observed(request) {
    return request.method() === 'POST' && new URL(request.url()).pathname === observedPath;
  }
  function attach(emitter, surface) {
    if (!['context', 'page'].includes(surface)) throw Error('Invalid observation surface');
    for (const event of ['request', 'requestfinished', 'requestfailed']) {
      emitter.on(event, request => {
        if (observed(request)) emit(surface + ':' + event, { ...requestValues(request), failed: !!request.failure() });
      });
    }
    emitter.on('response', response => {
      if (observed(response.request())) emit(surface + ':response', {
        ...requestValues(response.request()), ...responseValues(response),
      });
    });
  }
  function server(request, response) {
    if (request.method !== 'POST' || new URL(request.url, 'http://127.0.0.1').pathname !== observedPath) return;
    emit('server:request');
    request.once('end', () => emit('server:request-end'));
    request.once('aborted', () => emit('server:aborted'));
    response.once('finish', () => emit('server:finish', { writableFinished: response.writableFinished }));
    response.once('close', () => emit('server:close', { writableFinished: response.writableFinished }));
  }
  function selected(response) {
    if (!observed(response.request())) throw Error('Unexpected transport observation response');
    emit('selected-response', { ...requestValues(response.request()), ...responseValues(response) });
  }
  async function attachCdp(session) {
    const requests = new Set();
    session.on('Network.requestWillBeSent', event => {
      if (event.request.method === 'POST' && new URL(event.request.url).pathname === observedPath) {
        requests.add(event.requestId); emit('cdp:request', { cdpRequestId: event.requestId });
      }
    });
    session.on('Network.responseReceived', event => {
      if (requests.has(event.requestId)) emit('cdp:response', {
        cdpRequestId: event.requestId, status: event.response.status, fromServiceWorker: !!event.response.fromServiceWorker,
      });
    });
    session.on('Network.loadingFinished', event => {
      if (requests.has(event.requestId)) emit('cdp:finished', { cdpRequestId: event.requestId, encodedBytes: event.encodedDataLength });
    });
    session.on('Network.loadingFailed', event => {
      if (requests.has(event.requestId)) emit('cdp:failed', { cdpRequestId: event.requestId, canceled: !!event.canceled });
    });
    // Read protocol lifecycle events only; no interception, cache changes,
    // network emulation, additional application requests or target switches.
    await session.send('Network.enable');
  }
  return Object.freeze({ attach, server, selected, attachCdp });
}

export function payrollTransportObservationFile(root = process.cwd()) {
  const directory = path.resolve(root, 'verification', 'payroll-formula-transport');
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, 'events-' + process.pid + '.ndjson');
  fs.writeFileSync(file, '', { flag: 'wx' });
  return { file, observation: createPayrollTransportObservation(value => fs.appendFileSync(file, JSON.stringify(value) + '\n')) };
}
