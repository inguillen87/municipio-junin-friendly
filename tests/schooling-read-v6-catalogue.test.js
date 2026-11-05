import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { SCHOOLING_READ_V6_PREFLIGHT_PINS } from '../lib/schooling-read-v6-admission.js';

const pins = JSON.parse(SCHOOLING_READ_V6_PREFLIGHT_PINS);
const observed = JSON.parse(fs.readFileSync(new URL('./fixtures/schooling-read-v6-observed-catalogue.json', import.meta.url), 'utf8'));
const observedR3 = JSON.parse(fs.readFileSync(new URL('./fixtures/schooling-read-v6-observed-catalogue-r3.json', import.meta.url), 'utf8'));
const observedProduction = JSON.parse(fs.readFileSync(new URL('./fixtures/schooling-read-v6-observed-catalogue-pg17-production.json', import.meta.url), 'utf8'));
// 191 was rebased on the live production catalogue, where 107/110 replaced these two 102 bodies.
const REBASED = new Set(['school_certificate_context_v1', 'school_certificate_native_family_v5']);
const contract = JSON.parse(fs.readFileSync(new URL('../contracts/schooling-read-v6-implementation.v1.json', import.meta.url), 'utf8'));
// Core PostgreSQL type OIDs used by the captured typed signatures. No custom
// schema type is approximated. This offline check does not infer inherited ACL.
const typeOid = { boolean: 16, integer: 23, text: 25, date: 1082, timestamptz: 1184, uuid: 2950, jsonb: 3802 };
function differences(pin, actual, catalogue = observed) {
  if (!actual) return ['missing'];
  const owner = catalogue.functions['public.school_certificate_read_v5(text,uuid,integer,text,uuid,uuid,uuid)'].owner;
  const checks = {
    sha256: [pin.sha256, actual.bodySha256], language: [pin.language, actual.language],
    owner: [owner, actual.owner], kind: ['f', actual.kind], strict: [false, actual.strict],
    leakproof: [false, actual.leakproof], parallel: ['u', actual.parallel],
    securityDefiner: [pin.securityDefiner, actual.securityDefiner], returnsSet: [pin.returnsSet, actual.returnsSet],
    volatility: [pin.volatility, actual.volatile], returnType: [pin.returnType, actual.returnType],
    defaults: [pin.defaults, actual.defaults], argNames: [pin.argNames, actual.argNames ?? []],
    argModes: [pin.argModes, actual.argModes ?? actual.argTypes.trim().split(/\s+/).filter(Boolean).map(() => 'i')],
    argTypes: [pin.argTypes.map(type => { assert.ok(Object.hasOwn(typeOid, type), type); return typeOid[type]; }),
      actual.allArgTypes === null ? actual.argTypes.trim().split(/\s+/).filter(Boolean).map(Number)
        : actual.allArgTypes.slice(1, -1).split(',').map(Number)],
  };
  const failed = Object.entries(checks).filter(([, [expected, value]]) => {
    try { assert.deepEqual(value, expected); return false; } catch { return true; }
  }).map(([key]) => key);
  if (!pin.searchPaths.some(path => JSON.stringify(path) === JSON.stringify(actual.searchPath))) failed.push('searchPaths');
  const expectedAcl = [`${owner}=X/${owner}`, ...(pin.runtimeAllowed ? [`municontrol_actions_runtime_app=X/${owner}`] : [])].sort();
  const actualAcl = actual.acl.slice(1, -1).split(',').sort();
  try { assert.deepEqual(actualAcl, expectedAcl); } catch { failed.push('directAcl'); }
  return failed;
}

test('the observed R2 catalogue rejects the new helper body; its other14 descriptors remain exact', () => {
  assert.equal(pins.length, 15); assert.equal(observed.functionCount, 15);
  assert.equal(observed.runtimeRole.superuser, false); assert.equal(observed.runtimeRole.bypassRls, false);
  const helper = pins.find(pin => pin.name === 'school_certificate_read_source_v6');
  const oldHelper = observed.functions[helper.signature];
  // This is the real R2 observation, not an invented observation of R3.
  assert.equal(oldHelper.bodySha256, '7f7f4274c4cda8ce64d95c9f5733173d21ed575b98bfb2cce4c14bc5766da43a');
  assert.notEqual(helper.sha256, oldHelper.bodySha256);
  for (const pin of pins) assert.deepEqual(differences(pin, observed.functions[pin.signature]),
    pin.name === helper.name || REBASED.has(pin.name) ? ['sha256'] : [], pin.signature);
});

test('the R3 PostgreSQL18 focal catalogue (102 bodies) differs from the rebased pins only in the two 107/110 bodies', () => {
  assert.equal(observedR3.functionCount, 15);
  assert.equal(observedR3.candidateSqlSha256, '5f9d4f5962061bbf24dfccf42cc4327ff398e124cff4014d5728666fe37f141d');
  assert.notEqual(observedR3.candidateSqlSha256, contract.migrationSha256);
  assert.notEqual(observedR3.sourceMetadataSha256, observed.sourceMetadataSha256);
  assert.equal(observedR3.runtimeRole.superuser, false); assert.equal(observedR3.runtimeRole.bypassRls, false);
  for (const pin of pins) assert.deepEqual(differences(pin, observedR3.functions[pin.signature], observedR3),
    REBASED.has(pin.name) ? ['sha256'] : [], pin.signature);
});

test('all15 descriptors match the production PostgreSQL17 catalogue observed after installing the rebased 191', () => {
  assert.equal(observedProduction.functionCount, 15);
  assert.equal(observedProduction.candidateSqlSha256, contract.migrationSha256);
  assert.equal(observedProduction.runtimeRole.superuser, false); assert.equal(observedProduction.runtimeRole.bypassRls, false);
  for (const pin of pins) assert.deepEqual(differences(pin, observedProduction.functions[pin.signature], observedProduction), [], pin.signature);
  for (const [name, file] of [['school_certificate_context_v1', '107-operational-profile-catalog.sql'], ['school_certificate_native_family_v5', '110-native-employment-lifecycle.sql']]) {
    const source = fs.readFileSync(new URL('../scripts/migrations/' + file, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
    const start = source.indexOf('CREATE OR REPLACE FUNCTION public.' + name), tag = /AS (\$[a-zA-Z_]*\$)/.exec(source.slice(start))[1];
    const open = source.indexOf(tag, start) + tag.length, body = source.slice(open, source.indexOf(tag, open));
    assert.equal(crypto.createHash('sha256').update(body).digest('hex'), pins.find(pin => pin.name === name).sha256, name);
  }
});

test('current-family v1/v2 language pins are grounded in their original SQL declarations', () => {
  for (const [name, file] of [['school_certificate_current_family_v1', '057-family-schooling-certificates.sql'],
    ['school_certificate_current_family_v2', '064-employee-family-members.sql']]) {
    const source = fs.readFileSync(new URL('../scripts/migrations/' + file, import.meta.url), 'utf8');
    const start = source.indexOf('CREATE OR REPLACE FUNCTION ' + name + '(');
    assert.ok(start >= 0, name);
    const end = source.indexOf('AS $$', start); assert.ok(end > start, name);
    assert.match(source.slice(start, end), /\bLANGUAGE sql STABLE\b/);
    assert.equal(pins.find(pin => pin.name === name).language, 'sql');
  }
});

test('restoring either original plpgsql descriptor reproduces only the observed language mismatch', () => {
  for (const name of ['school_certificate_current_family_v1', 'school_certificate_current_family_v2']) {
    const pin = pins.find(value => value.name === name);
    assert.deepEqual(differences({ ...pin, language: 'plpgsql' }, observed.functions[pin.signature]), ['language']);
    assert.deepEqual(differences(pin, observed.functions[pin.signature]), []);
  }
});
