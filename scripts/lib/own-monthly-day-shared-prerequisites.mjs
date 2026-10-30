// Compare prepared source metadata only. No parser, constructor, SQL or transport.
import assert from 'node:assert/strict';

const pinKeys = Object.freeze([
  'name', 'signature', 'sha256', 'argNames', 'defaults', 'resultType', 'language',
  'returnsSet', 'strict', 'definer', 'volatility', 'config', 'runtime'
].sort());
const identifier = /^[a-z_][a-z0-9_]*$/;
const typeName = /^[A-Za-z_][A-Za-z0-9_.]*(?:\[\])?$/;

function pinVector(pins, requiredNames, label) {
  assert.ok(Array.isArray(pins), label + ':VECTOR_REQUIRED');
  assert.equal(pins.length, 8, label + ':EIGHT_PINS_REQUIRED');
  const names = new Set(), signatures = new Set();
  for (const pin of pins) {
    assert.ok(pin && typeof pin === 'object' && !Array.isArray(pin), label + ':PIN_REQUIRED');
    assert.strictEqual(Object.getPrototypeOf(pin), Object.prototype, label + ':PLAIN_PIN_REQUIRED');
    assert.equal(Object.getOwnPropertySymbols(pin).length, 0, label + ':SYMBOL_PROPERTY');
    assert.deepEqual(Object.getOwnPropertyNames(pin).sort(), pinKeys, label + ':PIN_KEYS_CHANGED');
    for (const key of pinKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(pin, key);
      assert.ok(Object.hasOwn(descriptor, 'value') && descriptor.enumerable, label + ':DATA_PROPERTY_REQUIRED:' + key);
    }
    assert.equal(typeof pin.name, 'string', label + ':NAME_REQUIRED');
    assert.match(pin.name, identifier, label + ':NAME_INVALID');
    assert.equal(typeof pin.signature, 'string', label + ':SIGNATURE_REQUIRED');
    const start = 'public.' + pin.name + '(';
    assert.ok(pin.signature.startsWith(start) && pin.signature.endsWith(')'), label + ':SIGNATURE_NAME_CHANGED');
    const parameterText = pin.signature.slice(start.length, -1);
    const parameterTypes = parameterText === '' ? [] : parameterText.split(',');
    assert.ok(parameterTypes.every(type => typeName.test(type)), label + ':SIGNATURE_TYPES_INVALID');
    assert.equal(typeof pin.sha256, 'string', label + ':BODY_HASH_REQUIRED');
    assert.match(pin.sha256, /^[a-f0-9]{64}$/, label + ':BODY_HASH_INVALID');
    assert.ok(Array.isArray(pin.argNames), label + ':ARG_NAMES_REQUIRED');
    assert.equal(pin.argNames.length, parameterTypes.length, label + ':ARG_NAMES_ARITY_CHANGED');
    assert.ok(pin.argNames.every(name => typeof name === 'string' && identifier.test(name)), label + ':ARG_NAMES_INVALID');
    assert.equal(new Set(pin.argNames).size, pin.argNames.length, label + ':ARG_NAMES_DUPLICATED');
    assert.equal(typeof pin.defaults, 'string', label + ':DEFAULTS_REQUIRED');
    assert.equal(typeof pin.resultType, 'string', label + ':RESULT_TYPE_REQUIRED');
    assert.match(pin.resultType, typeName, label + ':RESULT_TYPE_INVALID');
    assert.equal(typeof pin.language, 'string', label + ':LANGUAGE_REQUIRED');
    assert.match(pin.language, identifier, label + ':LANGUAGE_INVALID');
    for (const key of ['returnsSet', 'strict', 'definer', 'runtime']) {
      assert.equal(typeof pin[key], 'boolean', label + ':BOOLEAN_REQUIRED:' + key);
    }
    assert.ok(['i', 's', 'v'].includes(pin.volatility), label + ':VOLATILITY_INVALID');
    assert.ok(Array.isArray(pin.config) && pin.config.every(value => typeof value === 'string' && value.length > 0), label + ':CONFIG_REQUIRED');
    assert.ok(!names.has(pin.name), label + ':DUPLICATE_NAME');
    assert.ok(!signatures.has(pin.signature), label + ':DUPLICATE_SIGNATURE');
    names.add(pin.name); signatures.add(pin.signature);
  }
  assert.deepEqual([...names].sort(), requiredNames, label + ':REQUIRED_NAMES_CHANGED');
  return [...pins].sort((left, right) => left.signature < right.signature ? -1 : left.signature > right.signature ? 1 : 0);
}

export function assertOwnMonthlyDaySharedPrerequisites({canonicalHost, documentary, expected, requiredNames}) {
  assert.ok(Array.isArray(requiredNames), 'MONTHLY_SHARED_REQUIRED_NAMES_REQUIRED');
  assert.equal(requiredNames.length, 8, 'MONTHLY_SHARED_EIGHT_NAMES_REQUIRED');
  assert.ok(requiredNames.every(name => typeof name === 'string' && identifier.test(name)), 'MONTHLY_SHARED_REQUIRED_NAME_INVALID');
  assert.equal(new Set(requiredNames).size, 8, 'MONTHLY_SHARED_REQUIRED_NAMES_DUPLICATED');
  const names = [...requiredNames].sort();
  const canonicalPins = pinVector(canonicalHost, names, 'MONTHLY_SHARED_CANONICAL');
  const documentaryPins = pinVector(documentary, names, 'MONTHLY_SHARED_DOCUMENTARY');
  const expectedPins = pinVector(expected, names, 'MONTHLY_SHARED_EXPECTED');
  assert.deepEqual(canonicalPins, documentaryPins, 'MONTHLY_SHARED_DOCUMENTARY_METADATA_CHANGED');
  assert.deepEqual(canonicalPins, expectedPins, 'MONTHLY_SHARED_EXPECTED_METADATA_CHANGED');
  return {
    version: 'own-monthly-day-shared-prerequisites.v1', passed: true,
    prerequisiteFunctions: 8, comparedProperties: [...pinKeys],
    signatures: canonicalPins.map(pin => pin.signature),
    sourceMetadataOnly: true, nativeExecutionProven: false
  };
}
