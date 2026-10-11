import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createPayrollTransportObservation } from '../scripts/lib/payroll-transport-observation.mjs';

function request(url = 'http://127.0.0.1/api/internal-grh-source-preview?secret=NEVER_LOG') {
  return { url: () => url, method: () => 'POST', serviceWorker: () => null,
    failure: () => null, headers: () => ({ authorization: 'NEVER_LOG' }), postData: () => 'NEVER_LOG' };
}
function response(value) {
  return { request: () => value, status: () => 200, fromServiceWorker: () => false,
    body: () => 'NEVER_LOG', headers: () => ({ 'set-cookie': 'NEVER_LOG' }) };
}

test('transport logs match request identity without collecting confidential values', () => {
  const events = [], observe = createPayrollTransportObservation(value => events.push(value));
  const context = new EventEmitter(), page = new EventEmitter(), req = request(), res = response(req);
  observe.attach(context, 'context'); observe.attach(page, 'page');
  context.emit('request', req); page.emit('request', req); page.emit('response', res);
  context.emit('requestfinished', req); observe.selected(res);
  assert.equal(events.length, 5);
  assert.ok(events.every(value => value.requestId === 1));
  assert.doesNotMatch(JSON.stringify(events), /NEVER_LOG|secret|authorization|set-cookie|postData|127\.0\.0\.1/);
  assert.deepEqual(events.map(value => value.event), ['context:request', 'page:request', 'page:response', 'context:requestfinished', 'selected-response']);
});

test('other endpoints and GETs are not logged; distinct requests stay distinct', () => {
  const events = [], observe = createPayrollTransportObservation(value => events.push(value)), page = new EventEmitter();
  observe.attach(page, 'page');
  page.emit('request', request('http://127.0.0.1/api/internal-auth?mail=NEVER_LOG'));
  page.emit('request', { ...request(), method: () => 'GET' });
  page.emit('request', request()); page.emit('request', request());
  assert.deepEqual(events.map(value => value.requestId), [1, 2]);
});

test('failure records only a flag, never the arbitrary browser error text', () => {
  const events = [], observe = createPayrollTransportObservation(value => events.push(value)), page = new EventEmitter();
  observe.attach(page, 'page');
  page.emit('requestfailed', { ...request(), failure: () => ({ errorText: 'NEVER_LOG' }) });
  assert.equal(events[0].failed, true); assert.doesNotMatch(JSON.stringify(events), /NEVER_LOG/);
});

test('server completion and premature abortion are observed independently', () => {
  const events = [], observe = createPayrollTransportObservation(value => events.push(value));
  const req = Object.assign(new EventEmitter(), { url: '/api/internal-grh-source-preview?secret=NEVER_LOG', method: 'POST' });
  const res = Object.assign(new EventEmitter(), { writableFinished: false });
  observe.server(req, res); req.emit('aborted'); res.emit('close');
  assert.deepEqual(events.map(value => value.event), ['server:request', 'server:aborted', 'server:close']);
  assert.equal(events.at(-1).writableFinished, false); assert.doesNotMatch(JSON.stringify(events), /NEVER_LOG/);
});

test('CDP observations retain lifecycle without routes or confidential payloads', async () => {
  const events = [], commands = [], observe = createPayrollTransportObservation(value => events.push(value));
  const session = Object.assign(new EventEmitter(), { send: async command => { commands.push(command); } });
  await observe.attachCdp(session);
  session.emit('Network.requestWillBeSent', { requestId: '12.4', request: { method: 'POST', url: 'http://127.0.0.1/api/internal-grh-source-preview?secret=NEVER_LOG', postData: 'NEVER_LOG', headers: { authorization: 'NEVER_LOG' } } });
  session.emit('Network.responseReceived', { requestId: '12.4', response: { status: 200, fromServiceWorker: false, headers: { 'set-cookie': 'NEVER_LOG' } } });
  session.emit('Network.loadingFinished', { requestId: '12.4', encodedDataLength: 200 });
  session.emit('Network.loadingFailed', { requestId: 'unrelated', errorText: 'NEVER_LOG' });
  assert.deepEqual(commands, ['Network.enable']);
  assert.deepEqual(events.map(value => value.event), ['cdp:request', 'cdp:response', 'cdp:finished']);
  assert.doesNotMatch(JSON.stringify(events), /NEVER_LOG|secret|authorization|set-cookie|postData|127\.0\.0\.1/);
});

test('native call observations accept only known operations and source line numbers', async () => {
  const events = [], observe = createPayrollTransportObservation(value => events.push(value));
  let binding, init;
  const page = { exposeBinding: async (_name, callback) => { binding = callback; }, addInitScript: async callback => { init = callback; } };
  await observe.observeCancellationCalls(page);
  assert.equal(typeof init, 'function');
  binding({}, { event: 'controller:abort', line: 171, headers: 'NEVER_LOG', bytes: 'NEVER_LOG', error: 'NEVER_LOG' });
  assert.equal(events[0].event, 'controller:abort'); assert.equal(events[0].line, 171);
  assert.doesNotMatch(JSON.stringify(events), /NEVER_LOG|headers|bytes|error/);
  assert.throws(() => binding({}, { event: 'NEVER_LOG', line: 171 }));
  assert.throws(() => binding({}, { event: 'reader:cancel', line: 'NEVER_LOG' }));
});
