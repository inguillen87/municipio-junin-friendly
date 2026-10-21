import test from 'node:test';
import assert from 'node:assert/strict';
import {assertOwnMonthlyDaySharedPrerequisites} from '../scripts/lib/own-monthly-day-shared-prerequisites.mjs';

const requiredNames = Array.from({length: 8}, (_, index) => 'synthetic_prerequisite_' + index);
function vector() {
  return requiredNames.map((name, index) => ({
    name, signature: 'public.' + name + '(jsonb,text)', sha256: String(index).repeat(64),
    argNames: ['actor', 'period'], defaults: 'NULL::text', resultType: 'jsonb',
    language: 'plpgsql', returnsSet: false, strict: false, definer: true,
    volatility: 'v', config: ['search_path=pg_catalog, public, pg_temp', 'TimeZone=UTC'],
    runtime: index % 2 === 0
  }));
}
function input() {
  const pins = vector();
  return {canonicalHost: pins, documentary: structuredClone(pins), expected: structuredClone(pins), requiredNames: [...requiredNames]};
}

test('shared prerequisites compare all complete pins despite vector order and preserve inputs', () => {
  const value = input(); value.documentary.reverse(); value.expected.push(value.expected.shift());
  const before = structuredClone(value);
  const report = assertOwnMonthlyDaySharedPrerequisites(value);
  assert.equal(report.passed, true); assert.equal(report.prerequisiteFunctions, 8);
  assert.equal(report.sourceMetadataOnly, true); assert.equal(report.nativeExecutionProven, false);
  assert.equal(report.comparedProperties.length, 13);
  assert.deepEqual(report.signatures, vector().map(pin => pin.signature).sort());
  assert.deepEqual(value, before);
});

test('shared prerequisites reject a changed runtime ACL in either source or expected metadata', () => {
  for (const source of ['canonicalHost', 'documentary', 'expected']) {
    const value = input(); value[source][0].runtime = !value[source][0].runtime;
    assert.throws(() => assertOwnMonthlyDaySharedPrerequisites(value), /MONTHLY_SHARED_(?:DOCUMENTARY|EXPECTED)_METADATA_CHANGED/);
  }
});

test('shared prerequisites reject each changed body or function-shape property', () => {
  const changes = {
    sha256: 'f'.repeat(64), argNames: ['identity', 'period'], defaults: '',
    resultType: 'text', language: 'sql', returnsSet: true, strict: true,
    definer: false, volatility: 's', config: ['search_path=pg_catalog, public, pg_temp']
  };
  for (const [key, replacement] of Object.entries(changes)) {
    const value = input(); value.documentary[0][key] = replacement;
    assert.throws(() => assertOwnMonthlyDaySharedPrerequisites(value), /MONTHLY_SHARED_DOCUMENTARY_METADATA_CHANGED/, key);
  }
  const value = input(); value.documentary[0].signature = value.documentary[0].signature.replace('text)', 'uuid)');
  assert.throws(() => assertOwnMonthlyDaySharedPrerequisites(value), /MONTHLY_SHARED_DOCUMENTARY_METADATA_CHANGED/);
});

test('shared prerequisites reject missing, extra, duplicate or substituted required names', () => {
  for (const source of ['canonicalHost', 'documentary', 'expected']) {
    const missing = input(); missing[source].pop();
    assert.throws(() => assertOwnMonthlyDaySharedPrerequisites(missing), /EIGHT_PINS_REQUIRED/);
    const extra = input(); extra[source].push(structuredClone(extra[source][0]));
    assert.throws(() => assertOwnMonthlyDaySharedPrerequisites(extra), /EIGHT_PINS_REQUIRED/);
    const duplicated = input(); duplicated[source][7] = structuredClone(duplicated[source][0]);
    assert.throws(() => assertOwnMonthlyDaySharedPrerequisites(duplicated), /DUPLICATE_(?:NAME|SIGNATURE)/);
    const replaced = input(); replaced[source][7].name = 'unrelated'; replaced[source][7].signature = 'public.unrelated(jsonb,text)';
    assert.throws(() => assertOwnMonthlyDaySharedPrerequisites(replaced), /REQUIRED_NAMES_CHANGED/);
  }
  const wrongNames = input(); wrongNames.requiredNames[7] = wrongNames.requiredNames[0];
  assert.throws(() => assertOwnMonthlyDaySharedPrerequisites(wrongNames), /REQUIRED_NAMES_DUPLICATED/);
});

test('shared prerequisites require all original fields without silently dropping added metadata', () => {
  for (const source of ['canonicalHost', 'documentary', 'expected']) {
    const missing = input(); delete missing[source][0].runtime;
    assert.throws(() => assertOwnMonthlyDaySharedPrerequisites(missing), /PIN_KEYS_CHANGED/);
    const extra = input(); extra[source][0].publicExecute = true;
    assert.throws(() => assertOwnMonthlyDaySharedPrerequisites(extra), /PIN_KEYS_CHANGED/);
    const symbolic = input(); symbolic[source][0][Symbol('unreviewed')] = true;
    assert.throws(() => assertOwnMonthlyDaySharedPrerequisites(symbolic), /SYMBOL_PROPERTY/);
  }
});

test('shared prerequisites reject malformed pin types, hashes, names and argument arity', () => {
  const invalid = [
    ['sha256', 'not-a-body-hash'], ['argNames', ['actor']], ['argNames', ['actor', 'actor']],
    ['defaults', null], ['resultType', null], ['language', null], ['returnsSet', 0],
    ['strict', 'false'], ['definer', null], ['volatility', 'stable'], ['config', [null]], ['runtime', undefined],
    ['signature', 'public.different_name(jsonb,text)']
  ];
  for (const [key, replacement] of invalid) {
    const value = input(); value.canonicalHost[0][key] = replacement;
    assert.throws(() => assertOwnMonthlyDaySharedPrerequisites(value), /MONTHLY_SHARED_CANONICAL:/, key);
  }
});

test('shared prerequisites compare ordered configuration values without normalizing source differences', () => {
  const value = input(); value.expected[0].config.reverse();
  assert.throws(() => assertOwnMonthlyDaySharedPrerequisites(value), /MONTHLY_SHARED_EXPECTED_METADATA_CHANGED/);
});

test('shared prerequisites reject inherited, hidden or accessor metadata without invoking an accessor', () => {
  const inherited = input(); Object.setPrototypeOf(inherited.documentary[0], {unreviewed: true});
  assert.throws(() => assertOwnMonthlyDaySharedPrerequisites(inherited), /PLAIN_PIN_REQUIRED/);
  const hidden = input(); Object.defineProperty(hidden.documentary[0], 'unreviewed', {value: true});
  assert.throws(() => assertOwnMonthlyDaySharedPrerequisites(hidden), /PIN_KEYS_CHANGED/);
  const accessor = input(); let calls = 0;
  Object.defineProperty(accessor.documentary[0], 'runtime', {enumerable: true, get() {calls++; return true;}});
  assert.throws(() => assertOwnMonthlyDaySharedPrerequisites(accessor), /DATA_PROPERTY_REQUIRED:runtime/);
  assert.equal(calls, 0);
});
