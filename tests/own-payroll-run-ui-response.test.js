import assert from 'node:assert/strict';
import test from 'node:test';
import {observeOwnRunJsonResponse} from '../scripts/lib/own-payroll-run-response-qa.mjs';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};

function responseWindow({bodyFailure = null, synchronousBodyFailure = false, clickFailure = null} = {}) {
  const received = deferred(), events = [], calls = {waits: 0, actions: 0, reads: 0};
  const body = {ok: false, code: 'OWN_RUN_SOURCE_AMBIGUOUS'};
  const unavailable = new Error('Response body is unavailable after document navigation');
  const predicate = response => response === reply;
  let documentCurrent = true;
  const reply = {
    status: () => 422,
    json() {
      calls.reads++;
      events.push('body-start');
      if (!documentCurrent) throw unavailable;
      if (bodyFailure) {
        if (synchronousBodyFailure) throw bodyFailure;
        return Promise.reject(bodyFailure);
      }
      return Promise.resolve(body);
    },
  };
  const page = {
    waitForResponse(actualPredicate) {
      calls.waits++;
      events.push('wait-registered');
      assert.equal(actualPredicate, predicate);
      assert.equal(actualPredicate(reply), true);
      return received.promise;
    },
  };
  const click = async () => {
    calls.actions++;
    events.push('click-start');
    received.resolve(reply);
    // The response arrives before Playwright finishes the action. Its document
    // is then retired; late reads cannot retrieve that response's original body.
    await Promise.resolve();
    documentCurrent = false;
    events.push('click-complete');
    if (clickFailure) throw clickFailure;
  };
  return {page, predicate, click, body, reply, unavailable, events, calls};
}

test('the former click-then-read order deterministically loses the response body', async () => {
  const f = responseWindow();
  await assert.rejects(async () => {
    const responsePending = f.page.waitForResponse(f.predicate);
    await f.click();
    const response = await responsePending;
    return response.json();
  }, error => error === f.unavailable);
  assert.ok(f.events.indexOf('click-complete') < f.events.indexOf('body-start'));
  assert.deepEqual(f.calls, {waits: 1, actions: 1, reads: 1});
});

test('the original 422 body is read before the click completes without another action or read', async () => {
  const f = responseWindow();
  const result = await observeOwnRunJsonResponse(f.page, f.predicate, f.click);
  assert.deepEqual(result, {status: 422, body: {ok: false, code: 'OWN_RUN_SOURCE_AMBIGUOUS'}});
  assert.equal(result.body, f.body);
  assert.deepEqual(f.events, ['wait-registered', 'click-start', 'body-start', 'click-complete']);
  assert.deepEqual(f.calls, {waits: 1, actions: 1, reads: 1});
});

test('an available response never completes the observation before its action completes', async () => {
  const received = deferred(), bodyRead = deferred(), actionDone = deferred();
  const reply = {status: () => 422, json: () => { bodyRead.resolve(); return Promise.resolve({ok: false}); }};
  let completed = false;
  const result = observeOwnRunJsonResponse(
    {waitForResponse: () => received.promise},
    () => true,
    async () => { received.resolve(reply); await actionDone.promise; },
  );
  result.then(() => { completed = true; });
  await bodyRead.promise;
  await Promise.resolve();
  assert.equal(completed, false);
  actionDone.resolve();
  assert.deepEqual(await result, {status: 422, body: {ok: false}});
});

for (const synchronousBodyFailure of [false, true]) {
  test((synchronousBodyFailure ? 'thrown' : 'rejected') + ' original body failures propagate without a fallback or retry', async () => {
    const error = new Error('original response body failed');
    const f = responseWindow({bodyFailure: error, synchronousBodyFailure});
    await assert.rejects(observeOwnRunJsonResponse(f.page, f.predicate, f.click), failure => failure === error);
    assert.deepEqual(f.calls, {waits: 1, actions: 1, reads: 1});
  });
}

test('a failed click remains a failure even when its original response body was captured', async () => {
  const error = new Error('original click failed');
  const f = responseWindow({clickFailure: error});
  await assert.rejects(observeOwnRunJsonResponse(f.page, f.predicate, f.click), failure => failure === error);
  assert.deepEqual(f.calls, {waits: 1, actions: 1, reads: 1});
});

test('a synchronous action failure propagates after registering the response observer', async () => {
  const received = deferred(), error = new Error('synchronous click failed'), events = [];
  const result = observeOwnRunJsonResponse(
    {waitForResponse: () => { events.push('wait-registered'); return received.promise; }},
    () => true,
    () => { events.push('click-start'); throw error; },
  );
  await assert.rejects(result, failure => failure === error);
  assert.deepEqual(events, ['wait-registered', 'click-start']);
  // A later wait failure must stay observed by Promise.all after the action
  // already failed; it must neither trigger another action nor mask that error.
  received.reject(new Error('later response wait failed'));
  await Promise.resolve();
});
