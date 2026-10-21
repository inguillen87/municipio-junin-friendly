// Pure helper contract only: no SQL constructor, parser, installer or QA import.
import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveMonthlyDayQaFoundation} from '../scripts/lib/own-monthly-day-qa-foundation.mjs';

const sourceCommit = 'a'.repeat(40);
const schema = 'mc_qa_fixed_092_' + '1'.repeat(32);
function fixture() {
 let reads = 0, normalizations = 0, factories = 0;
 const read = () => { reads++; throw Error('UNEXPECTED_SYNTHETIC_READ'); };
 const normalized = () => { normalizations++; throw Error('UNEXPECTED_SYNTHETIC_NORMALIZATION'); };
 const actor = {actorSessionId:'synthetic-actor-before-mfa', actorSessionVersion:1};
 const checker = {actorSessionId:'synthetic-checker-before-mfa', actorSessionVersion:1};
 const ids = {session:'synthetic-original-session-id'};
 const sourceHashes = Object.freeze({'synthetic/source-one.js':'1'.repeat(64), 'synthetic/source-two.js':'2'.repeat(64)});
 const foundation = {major:17, sourceCommit, operationalPairBaseline:'published107', schema,
  normalized, sourceHashes, actor, checker, ids, connects:false, executesSql:false};
 const options = {major:17, sourceCommit, read, schema, operationalPairBaseline:'published107', foundation};
 const factory = () => { factories++; throw Error('UNEXPECTED_SYNTHETIC_RECONSTRUCTION'); };
 return {options, foundation, factory, read, counts:() => ({reads, normalizations, factories})};
}

test('injected foundation keeps the same object and every live reference without reconstruction', () => {
 const f = fixture(), actual = resolveMonthlyDayQaFoundation(f.options, f.factory);
 assert.strictEqual(actual, f.foundation);
 for (const key of ['actor', 'checker', 'ids', 'sourceHashes', 'normalized']) assert.strictEqual(actual[key], f.foundation[key]);
 assert.deepEqual(f.counts(), {reads:0, normalizations:0, factories:0});
 assert.deepEqual(actual.sourceHashes, {'synthetic/source-one.js':'1'.repeat(64), 'synthetic/source-two.js':'2'.repeat(64)});
});

test('new MFA sessions remain live and never revert to the older ids.session fixture value', () => {
 const f = fixture(), first = resolveMonthlyDayQaFoundation(f.options, f.factory);
 f.foundation.actor.actorSessionId = 'synthetic-actor-after-mfa';
 f.foundation.actor.actorSessionVersion = 2;
 f.foundation.checker.actorSessionId = 'synthetic-checker-after-mfa';
 f.foundation.checker.actorSessionVersion = 2;
 const again = resolveMonthlyDayQaFoundation(f.options, f.factory);
 assert.strictEqual(again, first);
 assert.equal(first.actor.actorSessionId, 'synthetic-actor-after-mfa');
 assert.equal(first.actor.actorSessionVersion, 2);
 assert.equal(first.checker.actorSessionId, 'synthetic-checker-after-mfa');
 assert.equal(first.checker.actorSessionVersion, 2);
 assert.equal(first.ids.session, 'synthetic-original-session-id');
 assert.notEqual(first.actor.actorSessionId, first.ids.session);
 assert.deepEqual(f.counts(), {reads:0, normalizations:0, factories:0});
});

test('standalone mode calls the injected factory once with exactly the previous options', () => {
 for (const explicitSchema of [true, false]) {
  const f = fixture(), calls = [], result = {synthetic:'standalone-factory-return'};
  const options = {major:17, sourceCommit, read:f.read, operationalPairBaseline:'published107', ...(explicitSchema ? {schema} : {})};
  const actual = resolveMonthlyDayQaFoundation(options, value => { calls.push(value); return result; });
  assert.strictEqual(actual, result);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {major:17, sourceCommit, read:f.read, ...(explicitSchema ? {schema} : {}), operationalPairBaseline:'published107'});
  assert.strictEqual(calls[0].read, f.read);
  assert.equal(Object.hasOwn(calls[0], 'foundation'), false);
  assert.equal(Object.hasOwn(calls[0], 'schema'), explicitSchema);
  assert.deepEqual(f.counts(), {reads:0, normalizations:0, factories:0});
 }
});

test('standalone construction preserves the factory failure without a second call', () => {
 const f = fixture(), primary = Error('SYNTHETIC_FACTORY_PRIMARY'); let calls = 0;
 const {foundation, ...options} = f.options;
 assert.throws(() => resolveMonthlyDayQaFoundation(options, () => { calls++; throw primary; }), error => error === primary);
 assert.equal(calls, 1);
 assert.deepEqual(f.counts(), {reads:0, normalizations:0, factories:0});
});

test('mismatched foundations reject before a factory, reader or normalizer can run', () => {
 const mutations = [
  o => { o.foundation = null; },
  o => { o.foundation.major = 18; },
  o => { o.major = 16; },
  o => { o.foundation.sourceCommit = 'b'.repeat(40); },
  o => { o.sourceCommit = 'invalid'; },
  o => { o.foundation.operationalPairBaseline = 'pre107'; },
  o => { o.operationalPairBaseline = undefined; },
  o => { o.schema = 'mc_qa_fixed_092_' + '2'.repeat(32); },
  o => { o.foundation.schema = 'public'; },
  o => { o.foundation.normalized = null; },
  o => { o.read = null; },
  o => { o.foundation.sourceHashes = {}; },
  o => { o.foundation.sourceHashes = {'synthetic/source.js':'not-a-hash'}; },
  o => { o.foundation.sourceHashes = []; },
  o => { o.foundation.actor = []; },
  o => { o.foundation.checker = null; },
  o => { o.foundation.ids = null; },
  o => { o.foundation.connects = true; },
  o => { o.foundation.executesSql = true; }
 ];
 for (const mutate of mutations) {
  const f = fixture(); mutate(f.options);
  assert.throws(() => resolveMonthlyDayQaFoundation(f.options, f.factory));
  assert.deepEqual(f.counts(), {reads:0, normalizations:0, factories:0});
 }
});

test('an injected foundation may supply its own valid schema when the optional request omits it', () => {
 const f = fixture(), {schema:unused, ...options} = f.options;
 assert.strictEqual(resolveMonthlyDayQaFoundation(options, f.factory), f.foundation);
 assert.deepEqual(f.counts(), {reads:0, normalizations:0, factories:0});
});

test('reader identity is not invented and source-hash references stay unchanged', () => {
 const f = fixture(), hashes = f.foundation.sourceHashes;
 const anotherRead = () => { throw Error('UNEXPECTED_OTHER_READER'); };
 assert.strictEqual(resolveMonthlyDayQaFoundation({...f.options, read:anotherRead}, f.factory), f.foundation);
 assert.strictEqual(f.foundation.sourceHashes, hashes);
 assert.equal(Object.hasOwn(f.foundation, 'read'), false);
 assert.deepEqual(f.counts(), {reads:0, normalizations:0, factories:0});
});
