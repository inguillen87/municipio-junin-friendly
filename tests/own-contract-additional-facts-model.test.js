// Adicionales del contrato: todos los valores de estas pruebas son ficticios.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CONTRACT_ADDITIONAL_FIELDS, CONTRACT_ADDITIONAL_FIELD_UNITS, CONTRACT_ADDITIONAL_SOURCE_REFERENCES, contractAdditionalFactsDefinition as definition, contractAdditionalFactsMissing as missing} from '../assets/own-contract-additional-facts-model.js';
import {evidenceText} from '../assets/evidence-text.js';

const period = '2026-10';
const facts = (patch = {}) => ({teachingPay: true, teachingHourlyAmount: '237.00', guaranteeSupplement: false, fullDedication: null, spouseLifeInsuranceUnits: '1', childLifeInsuranceUnits: '0', asOfDate: '2026-10-01', documentReference: 'Constancia ficticia 7/2026', ...patch});
const ok = patch => { try { definition(facts(patch), period); return true; } catch (e) { assert.equal(e.code, 'CONTRACT_ADDITIONAL_FACTS_INPUT_INVALID'); return false; } };

test('a complete declaration is returned as an immutable copy, unchanged', () => {
 const input = facts(), before = structuredClone(input), out = definition(input, period);
 assert.deepEqual(out, before); assert.deepEqual(input, before); assert.notEqual(out, input); assert.ok(Object.isFrozen(out)); assert.throws(() => { out.teachingPay = false; });
});

test('every fact has a declared unit and a reference, and nothing else is accepted', () => {
 assert.deepEqual(CONTRACT_ADDITIONAL_FIELDS, ['teachingPay', 'teachingHourlyAmount', 'guaranteeSupplement', 'fullDedication', 'spouseLifeInsuranceUnits', 'childLifeInsuranceUnits']);
 assert.deepEqual(Object.keys(CONTRACT_ADDITIONAL_SOURCE_REFERENCES), CONTRACT_ADDITIONAL_FIELDS);
 for (const field of CONTRACT_ADDITIONAL_FIELDS) { assert.ok(['boolean', 'money', 'units'].includes(CONTRACT_ADDITIONAL_FIELD_UNITS[field])); assert.match(CONTRACT_ADDITIONAL_SOURCE_REFERENCES[field], /^L\[[0-9]{1,3}\]$/); }
 assert.equal(ok({legajo: '1'}), false); assert.equal(ok({subrogationAmount: '1.00'}), false);
 const short = facts(); delete short.fullDedication; assert.throws(() => definition(short, period), e => e.code === 'CONTRACT_ADDITIONAL_FACTS_INPUT_INVALID');
});

test('not declared stays empty and is different from no and from zero', () => {
 const empty = Object.fromEntries(CONTRACT_ADDITIONAL_FIELDS.map(k => [k, null]));
 assert.equal(ok(empty), true); assert.deepEqual(missing(facts(empty), period), CONTRACT_ADDITIONAL_FIELDS); assert.deepEqual(missing(facts(), period), ['fullDedication']);
 const out = definition(facts({teachingPay: false, teachingHourlyAmount: '0', childLifeInsuranceUnits: '0'}), period);
 assert.equal(out.teachingPay, false); assert.equal(out.teachingHourlyAmount, '0'); assert.equal(out.childLifeInsuranceUnits, '0'); assert.equal(out.fullDedication, null);
});

test('each kind refuses the values that would hide a guess', () => {
 for (const field of ['teachingPay', 'guaranteeSupplement', 'fullDedication']) for (const bad of [0, 1, '1', 'true', 'si', '', undefined]) assert.equal(ok({[field]: bad}), false, field + ' ' + JSON.stringify(bad));
 for (const bad of [237, '237.005', '0237', '-1', '', '1e3', ' 1', true]) assert.equal(ok({teachingHourlyAmount: bad}), false, JSON.stringify(bad));
 for (const good of ['0', '237', '550.5', '999999999999999.99']) assert.equal(ok({teachingHourlyAmount: good}), true, good);
 for (const field of ['spouseLifeInsuranceUnits', 'childLifeInsuranceUnits']) { for (const bad of [1, '01', '100', '-1', '1.0', '', true]) assert.equal(ok({[field]: bad}), false); for (const good of ['0', '1', '99']) assert.equal(ok({[field]: good}), true); }
});

test('date, period and evidence follow the same rules as the family contract', () => {
 assert.equal(ok({asOfDate: '2026-10-31'}), true); assert.equal(ok({asOfDate: '1900-01-01'}), true);
 for (const bad of ['2026-11-01', '1899-12-31', '2026-02-30', '2026-10', null]) assert.equal(ok({asOfDate: bad}), false, String(bad));
 for (const p of ['2026-13', '1899-12', null]) assert.throws(() => definition(facts(), p), e => e.code === 'CONTRACT_ADDITIONAL_FACTS_INPUT_INVALID');
 assert.equal(ok({documentReference: 'ab'}), false); assert.equal(ok({documentReference: 'abc '}), false); assert.equal(ok({documentReference: 'a<b>'}), false); assert.equal(ok({documentReference: null}), false);
});

test('the shared evidence rule counts code points and refuses edges, controls and loose surrogates', () => {
 const e = v => evidenceText(v, 3, 180);
 for (const good of ['abc', 'Constancia N° 12/2026', '\u{1F600}'.repeat(180), 'a\u00A0bc', '\u200Babc', '\u00C5xx']) assert.equal(e(good), true, good);
 for (const bad of ['ab', '\u{1F600}a', '\u{1F600}'.repeat(181), '\u00A0abc', 'abc\u2003', '\uFEFFabc', 'ab\ncd', 'ab\u0085cd', 'ab\u2028cd', 'a<b>', 'A\u030Axx', 'ab\ud83d', '\ude00ab', '', null, 7]) assert.equal(e(bad), false, JSON.stringify(bad));
 const source = fs.readFileSync('assets/evidence-text.js', 'utf8');
 assert.ok(source.includes('\\u0000-\\u001F\\u007F-\\u009F\\u2028\\u2029<>') && source.includes('\\u00A0\\u1680\\u2000-\\u200A\\u202F\\u205F\\u3000\\uFEFF]$/u'), 'los escapes quedan escritos, no como caracteres sueltos');
 assert.ok(fs.readFileSync('assets/own-family-allowance-tariff-model.js', 'utf8').includes("import {evidenceText} from './evidence-text.js';"));
});
