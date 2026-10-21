import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareOwnerProgramQaContinuation} from '../scripts/lib/owner-program-qa-continuation-preparation.mjs';

const fixture = () => {
  const qa = {actor: {actorSessionId: 'original-session'}, checker: {id: 'independent-checker'}};
  const context = {qa, major: 17, sourceCommit: 'a'.repeat(40), read: () => {throw new Error('NO_SOURCE_READ_IN_PREPARATION_HELPER');}};
  const preparedContext = {actor: qa.actor, checker: qa.checker};
  return {qa, context, preparedContext, result: {foundation: qa, context: preparedContext, sourceEntries: ['scripts/migrations/192-own-monthly-day-full-month-policy.sql']}};
};

test('standalone host without preparation keeps a null context and empty extra source list', () => {
  const f = fixture();
  assert.deepEqual(prepareOwnerProgramQaContinuation(null, f.context), {context: null, sourceEntries: []});
  assert.equal(f.qa.actor.actorSessionId, 'original-session');
});

test('one preparation keeps the shared live foundation and the later MFA session', () => {
  const f = fixture(); let calls = 0;
  const prepared = prepareOwnerProgramQaContinuation(value => {calls++; assert.strictEqual(value, f.context); return f.result;}, f.context);
  assert.equal(calls, 1); assert.strictEqual(prepared.context, f.preparedContext);
  f.qa.actor.actorSessionId = 'rotated-session';
  assert.strictEqual(prepared.context.actor, f.qa.actor);
  assert.strictEqual(prepared.context.checker, f.qa.checker);
  assert.equal(prepared.context.actor.actorSessionId, 'rotated-session');
  f.result.sourceEntries.push('scripts/migrations/193-own-monthly-day-declaration.sql');
  assert.equal(prepared.sourceEntries.length, 1, 'the already admitted source list cannot grow through the factory array');
});

test('a separately reconstructed foundation is rejected even with matching identity values', () => {
  const f = fixture(); f.result.foundation = structuredClone(f.qa);
  assert.throws(() => prepareOwnerProgramQaContinuation(() => f.result, f.context), /PREPARATION_FOUNDATION_CHANGED/);
});

test('a custom thenable is rejected without calling its method', () => {
  const f = fixture();
  let thenCalls = 0;
  assert.throws(() => prepareOwnerProgramQaContinuation(() => ({then() {thenCalls++;}}), f.context), /PREPARATION_SYNC_REQUIRED/);
  assert.equal(thenCalls, 0);
});

test('an async factory is rejected before its body or an asynchronous rejection can run', () => {
  const f = fixture(); let calls = 0;
  const prepare = async () => {calls++; throw new Error('UNEXPECTED_ASYNC_FACTORY_BODY');};
  assert.throws(() => prepareOwnerProgramQaContinuation(prepare, f.context), /PREPARATION_SYNC_REQUIRED/);
  assert.equal(calls, 0);
});

test('a native rejected Promise from an ordinary factory is observed before synchronous refusal', async () => {
  const f = fixture(); const cause = new Error('SYNTHETIC_REJECTED_PREPARATION'); let calls = 0;
  assert.throws(() => prepareOwnerProgramQaContinuation(() => {calls++; return Promise.reject(cause);}, f.context), /PREPARATION_SYNC_REQUIRED/);
  assert.equal(calls, 1);
  // The Node test runner reports an unhandled rejection if the helper did not
  // attach its observer; this check never constructs or executes a SQL source.
  await new Promise(resolve => setImmediate(resolve));
});

test('private, absolute, traversed, duplicate and empty source entries are rejected', () => {
  for (const entries of [[], ['.handoff/private.sql'], ['C:/private.sql'], ['scripts/../private.sql'], ['scripts//private.sql'], ['scripts/'], ['scripts/a.sql', 'scripts/a.sql']]) {
    const f = fixture(); f.result.sourceEntries = entries;
    assert.throws(() => prepareOwnerProgramQaContinuation(() => f.result, f.context), /PREPARATION_(?:SOURCE|DUPLICATE)/);
  }
});

test('invalid factories, missing context and unexpected result fields fail before a host can continue', () => {
  const f = fixture();
  assert.throws(() => prepareOwnerProgramQaContinuation(undefined, f.context), /PREPARATION_INVALID/);
  assert.throws(() => prepareOwnerProgramQaContinuation(() => ({...f.result, context: null}), f.context), /PREPARATION_CONTEXT_REQUIRED/);
  assert.throws(() => prepareOwnerProgramQaContinuation(() => ({...f.result, sql: 'not accepted'}), f.context));
});
