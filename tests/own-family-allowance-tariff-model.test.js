// Tarifa propia de asignaciones familiares: todos los importes, regiones y topes de estas pruebas son ficticios.
import test from 'node:test';
import assert from 'node:assert/strict';
import {FAMILY_ALLOWANCE_TARIFF_TYPES, FAMILY_ALLOWANCE_UNRESOLVED, FAMILY_ALLOWANCE_TARIFF_MAX_ROWS, familyAllowanceTariffDefinition as definition, familyAllowanceTariffAmount as amount, familyAllowanceTariffSummary as summary} from '../assets/own-family-allowance-tariff-model.js';
import {FAMILY_PAYROLL_FACT_QUANTITIES} from '../assets/own-contract-family-payroll-facts-model.js';

const period = '2026-10';
const tariff = (patch = {}) => ({rows: [
 {region: '1', type: 'spouse', upTo: null, amount: '11.00'},
 {region: '1', type: 'children', upTo: null, amount: '22.50'},
 {region: '2', type: 'children', upTo: '100.01', amount: '30.00'},
 {region: '2', type: 'children', upTo: '500.00', amount: '20.00'},
 {region: '2', type: 'children', upTo: '900.00', amount: '10.00'},
 {region: '2', type: 'prenatal', upTo: '100.00', amount: '7.00'},
 {region: '2', type: 'prenatal', upTo: null, amount: '3.00'},
 {region: '2', type: 'dependants', upTo: null, amount: null},
], bracketRule: 'upToInclusive', aboveLastBracket: 'notPayable', asOfDate: '2026-10-01', documentReference: 'Constancia ficticia 1/2026', ...patch});
const ask = (t, region, type, semesterAverage = null) => amount(t, period, {region, type, semesterAverage});
const refuses = (fn, code = 'FAMILY_ALLOWANCE_TARIFF_INPUT_INVALID') => assert.throws(fn, e => e.code === code, code);

test('the tariff types are exactly the twelve family facts declared per contract', () => {
 assert.equal(FAMILY_ALLOWANCE_TARIFF_TYPES, FAMILY_PAYROLL_FACT_QUANTITIES); assert.equal(FAMILY_ALLOWANCE_TARIFF_TYPES.length, 12);
});

test('a complete declaration is returned as an immutable copy, unchanged', () => {
 const input = tariff(), before = structuredClone(input), out = definition(input, period);
 assert.deepEqual(out, before); assert.deepEqual(input, before); assert.notEqual(out, input); assert.notEqual(out.rows[0], input.rows[0]);
 assert.ok(Object.isFrozen(out) && Object.isFrozen(out.rows) && Object.isFrozen(out.rows[0])); assert.throws(() => { out.rows[0].amount = '0'; });
});

test('a flat row pays its amount whatever the average, including an unknown one', () => {
 assert.deepEqual(ask(tariff(), '1', 'spouse'), {status: 'resolved', amount: '11.00', upTo: null, region: '1', type: 'spouse'});
 assert.equal(ask(tariff(), '1', 'children', '999999999.99').amount, '22.50');
});

test('brackets follow the declared reading of the ceiling, compared in exact cents', () => {
 const inclusive = tariff(), exclusive = tariff({bracketRule: 'upToExclusive'});
 assert.equal(ask(inclusive, '2', 'children', '0').amount, '30.00');
 assert.equal(ask(inclusive, '2', 'children', '100.01').amount, '30.00'); assert.equal(ask(exclusive, '2', 'children', '100.01').amount, '20.00');
 assert.equal(ask(inclusive, '2', 'children', '100.02').amount, '20.00'); assert.equal(ask(inclusive, '2', 'children', '100.1').amount, '20.00');
 assert.equal(ask(inclusive, '2', 'children', '500').amount, '20.00'); assert.equal(ask(exclusive, '2', 'children', '500.00').amount, '10.00');
 assert.equal(ask(inclusive, '2', 'children', '900.00').upTo, '900.00');
 // Un promedio que un número de punto flotante no distingue se compara igual en centavos exactos.
 const wide = tariff(); wide.rows[2].upTo = '900719925474099.29'; wide.rows[3].upTo = '900719925474099.30'; wide.rows[4].upTo = '900719925474099.31';
 assert.equal(ask(wide, '2', 'children', '900719925474099.30').amount, '20.00'); assert.equal(ask(wide, '2', 'children', '900719925474099.31').amount, '10.00');
});

test('above the last ceiling nothing is assumed: not payable only when the tariff says so', () => {
 assert.deepEqual(ask(tariff(), '2', 'children', '900.01'), {status: 'not_payable', region: '2', type: 'children'});
 assert.deepEqual(ask(tariff({aboveLastBracket: null}), '2', 'children', '900.01'), {status: 'unresolved', reason: 'ABOVE_LAST_BRACKET_NOT_DECLARED'});
 // Una fila sin tope al final cierra el tramo: no hay «por encima».
 assert.equal(ask(tariff({aboveLastBracket: null}), '2', 'prenatal', '100.01').amount, '3.00'); assert.equal(ask(tariff(), '2', 'prenatal', '100.00').amount, '7.00');
});

test('whatever was not declared stays unresolved and is never turned into zero', () => {
 assert.equal(ask(tariff(), null, 'spouse').reason, 'REGION_NOT_DECLARED');
 assert.equal(ask(tariff(), '3', 'spouse').reason, 'TYPE_NOT_IN_TARIFF'); assert.equal(ask(tariff(), '1', 'prenatal').reason, 'TYPE_NOT_IN_TARIFF');
 assert.equal(ask(tariff(), '2', 'dependants').reason, 'AMOUNT_NOT_DECLARED');
 assert.equal(ask(tariff(), '2', 'children').reason, 'AVERAGE_NOT_DECLARED');
 assert.equal(ask(tariff({bracketRule: null}), '2', 'children', '50.00').reason, 'BRACKET_RULE_NOT_DECLARED');
 // Una sola fila con tope también es un tramo: necesita el promedio y la lectura del tope.
 const single = tariff(); single.rows = [{region: '1', type: 'spouse', upTo: '50.00', amount: '9.00'}];
 assert.equal(ask(single, '1', 'spouse').reason, 'AVERAGE_NOT_DECLARED'); assert.equal(ask(single, '1', 'spouse', '50.00').amount, '9.00');
 for (const [region, type, average] of [[null, 'spouse', null], ['3', 'spouse', null], ['2', 'dependants', null], ['2', 'children', null], ['2', 'children', '900.01']]) {
  const out = ask(tariff({aboveLastBracket: null}), region, type, average);
  assert.equal(out.status, 'unresolved'); assert.ok(FAMILY_ALLOWANCE_UNRESOLVED.includes(out.reason)); assert.equal(Object.hasOwn(out, 'amount'), false); assert.ok(Object.isFrozen(out));
 }
 // Un importe declarado en cero es un dato, distinto de sin informar.
 const zero = tariff(); zero.rows[7].amount = '0'; assert.deepEqual(ask(zero, '2', 'dependants'), {status: 'resolved', amount: '0', upTo: null, region: '2', type: 'dependants'});
});

test('the declaration is refused when a row is malformed, repeated or out of order', () => {
 const bad = edit => { const t = tariff(); edit(t); return () => definition(t, period); };
 for (const edit of [t => { t.rows[0].amount = 11; }, t => { t.rows[0].amount = '11.005'; }, t => { t.rows[0].amount = '011.00'; }, t => { t.rows[0].amount = '-1'; }, t => { t.rows[0].amount = ''; },
  t => { t.rows[0].region = 1; }, t => { t.rows[0].region = '01'; }, t => { t.rows[0].region = ''; }, t => { t.rows[0].type = 'grandchildren'; }, t => { t.rows[0].type = 'toString'; },
  t => { t.rows[2].upTo = '0'; }, t => { t.rows[2].upTo = '0.00'; }, t => { t.rows[2].upTo = 100; }, t => { t.rows[0].extra = '1'; }, t => { delete t.rows[0].upTo; },
  t => { t.bracketRule = 'inclusive'; }, t => { t.aboveLastBracket = 'zero'; }, t => { t.aboveLastBracket = false; }, t => { delete t.bracketRule; }, t => { t.tariffAmount = '1'; }]) refuses(bad(edit));
 for (const edit of [t => { t.rows = []; }, t => { t.rows = {0: t.rows[0], length: 1}; }, t => { t.rows.length = 20; }, t => { t.rows.note = 'x'; },
  t => { t.rows.push(structuredClone(t.rows[7])); }, t => { [t.rows[2], t.rows[3]] = [t.rows[3], t.rows[2]]; }, t => { t.rows[3].upTo = '100.01'; },
  t => { [t.rows[5], t.rows[6]] = [t.rows[6], t.rows[5]]; }, t => { [t.rows[0], t.rows[1]] = [t.rows[1], t.rows[0]]; }, t => { t.rows.reverse(); },
  t => { t.rows = Array.from({length: FAMILY_ALLOWANCE_TARIFF_MAX_ROWS + 1}, (_, i) => ({region: String(i + 1), type: 'spouse', upTo: null, amount: '1'})); }]) refuses(bad(edit), 'FAMILY_ALLOWANCE_TARIFF_CONTRACT_INVALID');
 // «100» y «100.00» son el mismo tope: repetido aunque el texto difiera.
 const same = tariff(); same.rows[2].upTo = '100'; same.rows[3].upTo = '100.00'; refuses(() => definition(same, period), 'FAMILY_ALLOWANCE_TARIFF_CONTRACT_INVALID');
 // Las regiones se ordenan como números, no como texto.
 const numeric = tariff(); numeric.rows = [{region: '2', type: 'spouse', upTo: null, amount: '1'}, {region: '10', type: 'spouse', upTo: null, amount: '1'}]; assert.equal(definition(numeric, period).rows.length, 2);
 numeric.rows.reverse(); refuses(() => definition(numeric, period), 'FAMILY_ALLOWANCE_TARIFF_CONTRACT_INVALID');
});

test('date, period and evidence follow the family contract rules', () => {
 const at = (asOfDate, p = period) => { try { definition(tariff({asOfDate}), p); return true; } catch { return false; } };
 assert.equal(at('2026-10-31'), true); assert.equal(at('1900-01-01'), true); assert.equal(at('2026-11-01'), false); assert.equal(at('1899-12-31'), false); assert.equal(at('2026-02-30'), false);
 assert.equal(at('2026-10-01', '2026-13'), false); assert.equal(at('2026-10-01', '1899-12'), false); assert.equal(at('2026-10-01', null), false);
 const ok = documentReference => { try { definition(tariff({documentReference}), period); return true; } catch { return false; } };
 for (const good of ['abc', 'Ordenanza ficticia N\u00B0 12/2026', '\u{1F600}'.repeat(180), 'a\u00A0bc']) assert.equal(ok(good), true, good);
 for (const bad of ['ab', '\u{1F600}a', '\u{1F600}'.repeat(181), '\u00A0abc', 'abc ', 'ab\ncd', 'a<b>', 'A\u030Axx', 'ab\ud83d', 'ab\u0085cd', null, 7]) assert.equal(ok(bad), false, JSON.stringify(bad));
});

test('the query is strict and a malformed tariff never answers', () => {
 for (const q of [{region: '1', type: 'spouse'}, {region: 1, type: 'spouse', semesterAverage: null}, {region: '01', type: 'spouse', semesterAverage: null}, {region: '1', type: 'other', semesterAverage: null},
  {region: '1', type: 'spouse', semesterAverage: 10}, {region: '1', type: 'spouse', semesterAverage: '10.001'}, {region: '1', type: 'spouse', semesterAverage: null, legajo: '1'}]) refuses(() => amount(tariff(), period, q));
 const broken = tariff(); broken.rows[0].amount = 0; refuses(() => amount(broken, period, {region: '1', type: 'spouse', semesterAverage: null}));
});

test('the summary says what was declared and what is still missing, without amounts', () => {
 const out = summary(tariff(), period);
 assert.deepEqual(out, {rows: 8, regions: ['1', '2'], types: ['spouse', 'children', 'prenatal', 'dependants'],
  missingTypes: ['childrenWithDisability', 'largeFamily', 'preschool', 'preschoolWithDisability', 'primary', 'primaryWithDisability', 'secondary', 'secondaryWithDisability'],
  amountsNotDeclared: 1, bracketedGroups: 2, openEndedGroups: 1, bracketRuleDeclared: true, aboveLastBracketDeclared: true});
 assert.equal(summary(tariff({bracketRule: null, aboveLastBracket: null}), period).bracketRuleDeclared, false); assert.ok(Object.isFrozen(out));
});
