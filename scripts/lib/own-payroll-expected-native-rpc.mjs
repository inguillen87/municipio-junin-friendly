// Pure QA expectations. This module owns no SQL, connection, retry or latch.
import assert from 'node:assert/strict';

const plain = value => value && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

export function createOwn190NativeErrorExpectations() {
  let active = null;
  const used = new Set();

  function descriptor(channel, spec) {
    assert.ok(plain(spec), 'OWN190_EXPECTED_RPC_SPEC');
    const keys = channel === 'query'
      ? ['caseId', 'nativeCode', 'text', 'values']
      : ['caseId', 'nativeCode', 'runtime', 'statement'];
    assert.deepEqual(Reflect.ownKeys(spec).sort(), keys.sort(), 'OWN190_EXPECTED_RPC_FIELDS');
    assert.match(spec.caseId, /^[a-z0-9][a-z0-9._:-]{2,119}$/, 'OWN190_EXPECTED_RPC_CASE');
    assert.match(spec.nativeCode, /^[A-Z][A-Z0-9_]{2,79}$/, 'OWN190_EXPECTED_RPC_CODE');
    if (channel === 'query') {
      assert.equal(typeof spec.text, 'string');
      assert.ok(/^SELECT public\.[a-z0-9_]+\(/.test(spec.text) && spec.text.endsWith(' AS result'), 'OWN190_EXPECTED_RPC_TEXT');
      assert.ok(Array.isArray(spec.values) && spec.values.length > 0, 'OWN190_EXPECTED_RPC_VALUES');
      assert.equal(Reflect.ownKeys(spec.values).length, spec.values.length + 1, 'OWN190_EXPECTED_RPC_DENSE');
      for (let n = 0; n < spec.values.length; n++) {
        assert.ok(Object.hasOwn(spec.values, n), 'OWN190_EXPECTED_RPC_DENSE');
        assert.equal(typeof spec.values[n], 'string', 'OWN190_EXPECTED_RPC_STRING');
      }
    } else {
      assert.equal(typeof spec.statement, 'string');
      assert.ok(spec.statement.startsWith('SELECT ') && !spec.statement.includes('\0'), 'OWN190_EXPECTED_RUN_SELECT');
      assert.equal(spec.runtime, true, 'OWN190_EXPECTED_RUN_RUNTIME');
    }
    const copied = { ...spec, ...(channel === 'query' ? { values: Object.freeze([...spec.values]) } : {}) };
    return Object.freeze({ ...copied, version: 'own190-expected-native-rpc.v1', scope: 'canonical190', channel, end: 'ROLLBACK' });
  }

  async function within(channel, spec, work) {
    if (active !== null) {
      active.violations++;
      assert.fail('OWN190_EXPECTED_RPC_REENTRANT');
    }
    const value = descriptor(channel, spec);
    assert.equal(used.has(value.caseId), false, 'OWN190_EXPECTED_RPC_CASE_REUSED');
    assert.equal(typeof work, 'function');
    used.add(value.caseId);
    const context = { descriptor: value, consumed: 0, validated: 0, violations: 0 };
    active = context;
    try {
      const result = await work();
      assert.strictEqual(active, context, 'OWN190_EXPECTED_RPC_SCOPE_CHANGED');
      assert.equal(context.consumed, 1, 'OWN190_EXPECTED_RPC_NOT_OBSERVED');
      assert.equal(context.validated, 1, 'OWN190_EXPECTED_RPC_NOT_VALIDATED');
      assert.equal(context.violations, 0, 'OWN190_EXPECTED_RPC_EXTRA_INVOCATION');
      return result;
    } finally {
      assert.strictEqual(active, context, 'OWN190_EXPECTED_RPC_SCOPE_CHANGED');
      active = null;
    }
  }

  function consume(matches) {
    if (!matches) return null;
    if (active.consumed !== 0) {
      active.violations++;
      assert.fail('OWN190_EXPECTED_RPC_ALREADY_CONSUMED');
    }
    active.consumed = 1;
    return active.descriptor;
  }

  return Object.freeze({
    expectQueryError: (spec, work) => within('query', spec, work),
    expectRunError: (spec, work) => within('run', spec, work),
    consumeQuery({ text, values }) {
      const d = active?.descriptor;
      return consume(d?.channel === 'query' && text === d.text && Array.isArray(values)
        && Reflect.ownKeys(values).length === values.length + 1 && values.length === d.values.length
        && d.values.every((value, n) => Object.hasOwn(values, n) && values[n] === value));
    },
    consumeRun({ statement, runtime }) {
      const d = active?.descriptor;
      return consume(d?.channel === 'run' && statement === d.statement && runtime === d.runtime);
    },
    completeExpectedError(expected, result) {
      if (!active || active.descriptor !== expected || active.consumed !== 1 || active.validated !== 0) {
        if (active) active.violations++;
        assert.fail('OWN190_EXPECTED_RPC_RESULT_SCOPE');
      }
      // The transport must have returned a validated, persisted expected-error
      // result. A thrown capture failure translated by a service cannot do this.
      let error;
      try { error = own190ExpectedNativeRpcError(result, expected); }
      catch (failure) { active.violations++;throw failure; }
      active.validated = 1;
      return error;
    },
    assertIdle() { assert.equal(active, null, 'OWN190_EXPECTED_RPC_STILL_ACTIVE'); }
  });
}

// Only call with the value already validated/persisted by h.expectRollback.
// Never call from a catch of transport, frame, timeout or persistence failures.
export function own190ExpectedNativeRpcError(result, expected) {
  assert.equal(result?.status, 3, 'OWN190_EXPECTED_RPC_RESULT');
  assert.equal(typeof result.stderr, 'string', 'OWN190_EXPECTED_RPC_STDERR');
  assert.match(expected?.nativeCode, /^[A-Z][A-Z0-9_]{2,79}$/);
  assert.match(result.stderr, new RegExp('\\bERROR:[^\\r\\n]*\\b' + expected.nativeCode + '\\b'), 'OWN190_EXPECTED_RPC_DIAGNOSTIC');
  return new Error(result.stderr);
}
