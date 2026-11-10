// La propuesta de backend de hechos familiares es el backend certificado de condiciones salariales bajo un cambio
// de nombre. Lo único nuevo es el validador de la declaración. Estas pruebas fijan esa propiedad: si alguien edita
// a mano una función conservada, deja de ser una copia y la diferencia aparece acá.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {FAMILY_PAYROLL_FACT_QUANTITIES, familyPayrollFactsDefinition, familyEvidenceText} from '../assets/own-contract-family-payroll-facts-model.js';
import {syntheticFamilyDefinition} from './fixtures/own-contract-family-payroll-facts-synthetic.js';

const family = fs.readFileSync('scripts/migrations/226-own-contract-family-payroll-facts.sql', 'utf8');
const conditions = fs.readFileSync('scripts/migrations/171-own-contract-salary-conditions.sql', 'utf8');
const back = s => s.replaceAll('own_family_payroll_facts', 'own_salary_conditions').replaceAll('FAMILY_PAYROLL_FACTS_', 'SALARY_CONDITIONS_')
 .replaceAll('own-family-payroll-facts:', 'own-salary-conditions:').replaceAll('own-contract-family-payroll-facts.v1', 'own-contract-salary-conditions.v1');
const cut = (s, name) => { const a = s.indexOf('CREATE FUNCTION public.' + name + '_definition_v1('), b = s.indexOf('CREATE FUNCTION public.' + name + '_items_v1('); assert.ok(a > 0 && b > a); return [s.slice(0, a), s.slice(a, b), s.slice(b)]; };
const body = s => s.slice(s.indexOf('DO $prerequisite$'));
const [familyHead, definition, familyTail] = cut(family, 'own_family_payroll_facts');
const [conditionsHead, , conditionsTail] = cut(conditions, 'own_salary_conditions');

test('every conserved object is the certified conditions object under a rename', () => {
 const extra = "\n OR to_regprocedure('public.own_program_text_v1(jsonb,integer,integer)') IS NULL";
 assert.ok(familyHead.includes(extra));
 assert.equal(back(body(familyHead)).replace(extra, ''), body(conditionsHead));
 assert.equal(back(familyTail), conditionsTail);
 const objects = body(family);
 assert.ok(!objects.includes('own_salary_conditions') && !objects.includes('SALARY_CONDITIONS') && !objects.includes('salary-conditions'));
});

test('the declaration validator names exactly the facts of the screen model and never a tariff amount', () => {
 const quantities = /own_program_exact_v1\(q,ARRAY\[([^\]]+)\]\)/.exec(definition)[1].split(',').map(s => s.replaceAll("'", ''));
 assert.deepEqual(quantities, [...FAMILY_PAYROLL_FACT_QUANTITIES]);
 assert.ok(definition.includes("own_program_exact_v1(d,ARRAY['quantities','prenatalAdjustmentMonths','tariffSelection','asOfDate','documentReference'])"));
 assert.ok(definition.includes("own_program_exact_v1(t,ARRAY['region','semesterAverage'])"));
 assert.ok(definition.includes("q->>field!~'^(0|[1-9][0-9]?)$'"));
 assert.ok(definition.includes("d->>'prenatalAdjustmentMonths'!~'^(0|[1-9]|1[0-9]|2[0-4])$'"));
 assert.ok(definition.includes("t->>'region'!~'^[0-9]{1,9}$'"));
 assert.ok(definition.includes("t->>'semesterAverage'!~'^(0|[1-9][0-9]{0,14})(\\.[0-9]{1,2})?$'"));
 // Sin informar se conserva vacío: el validador devuelve la declaración tal cual, sin completar ni convertir.
 assert.match(definition, /RETURN d;\s*END \$\$;\s*$/);
 assert.ok(!/coalesce|::numeric|::integer|amount|tariffValue/i.test(definition));
 assert.equal(definition.split("RAISE EXCEPTION 'FAMILY_PAYROLL_FACTS_INPUT_INVALID'").length - 1, definition.split('RAISE EXCEPTION').length - 1);
});

test('the route and its SQL calls are the conditions ones under the same rename', () => {
 const rename = s => s.replaceAll('salaryConditions', 'familyPayrollFacts').replaceAll('SalaryConditions', 'FamilyPayrollFacts').replaceAll('SALARY_CONDITIONS', 'FAMILY_PAYROLL_FACTS')
  .replaceAll('own_salary_conditions_', 'own_family_payroll_facts_').replaceAll('own-contract-salary-conditions', 'own-contract-family-payroll-facts');
 const api = fs.readFileSync('api/internal-own-contract-family-payroll-facts.js', 'utf8'), lib = fs.readFileSync('lib/internal-own-contract-family-payroll-facts.js', 'utf8');
 assert.equal(api, rename(fs.readFileSync('api/internal-own-contract-salary-conditions.js', 'utf8')).replace('La membresía no permite consultar condiciones salariales nominales.', 'La membresía no permite consultar datos familiares de liquidación nominales.'));
 assert.equal(lib, rename(fs.readFileSync('lib/internal-own-contract-salary-conditions.js', 'utf8'))
  .replace('Revisá antigüedad parcial, título, porcentaje, insalubridad, período y constancia.', 'Revisá cantidades familiares, meses de ajuste prenatal, región, promedio semestral, período y constancia.')
  .replace('Tu cuenta no permite esta operación sobre condiciones salariales.', 'Tu cuenta no permite esta operación sobre datos familiares de liquidación.'));
 for (const name of ['bootstrap', 'detail', 'attempt', 'command']) assert.ok(lib.includes('public.own_family_payroll_facts_' + name + '_v1(') && family.includes('CREATE FUNCTION public.own_family_payroll_facts_' + name + '_v1('));
 assert.ok(fs.readFileSync('lib/own-period-read-recovery.js', 'utf8').includes("'FAMILY_PAYROLL_FACTS_BUSY'"));
});

test('the screen model refuses a date the stored validator refuses', () => {
 const at = asOfDate => { try { familyPayrollFactsDefinition({...syntheticFamilyDefinition(), asOfDate}, '2026-10'); return true; } catch { return false; } };
 assert.equal(at('1900-01-01'), true); assert.equal(at('2026-10-31'), true);
 assert.equal(at('1899-12-31'), false); assert.equal(at('2026-11-01'), false); assert.equal(at('2026-02-30'), false);
});

// Hallazgo de Root (10/11): el ayudante compartido y el modelo contaban y recortaban distinto fuera de ASCII.
// La constancia del contrato nuevo usa una sola regla explícita por puntos de código en los dos lados.
test('the evidence text follows one explicit code-point rule, the same in SQL and in the screen model', () => {
 assert.ok(!definition.includes('own_program_text_v1'), 'el validador nuevo no se apoya en el ayudante compartido');
 for (const part of ["char_length(reference_value) NOT BETWEEN 3 AND 180", "reference_value IS NOT NFC NORMALIZED",
  "reference_value ~ '[\\u0001-\\u001F\\u007F-\\u009F\\u2028\\u2029<>]'", "reference_value ~ '^[ \\u00A0\\u1680\\u2000-\\u200A\\u202F\\u205F\\u3000\\uFEFF]'", "reference_value ~ '[ \\u00A0\\u1680\\u2000-\\u200A\\u202F\\u205F\\u3000\\uFEFF]$'"]) assert.ok(definition.includes(part), part);
 const model = fs.readFileSync('assets/own-contract-family-payroll-facts-model.js', 'utf8');
 assert.ok(model.includes("const EVIDENCE_FORBIDDEN = /[\\u0000-\\u001F\\u007F-\\u009F\\u2028\\u2029<>]/u;") && model.includes("\\u00A0\\u1680\\u2000-\\u200A\\u202F\\u205F\\u3000\\uFEFF]$/u;"));
 const ok = v => familyEvidenceText(v, 3, 180);
 // Los tres casos de Root.
 assert.equal(ok('\u{1F600}a'), false, 'emoji+a son dos caracteres'); assert.equal(ok('\u{1F600}'.repeat(91)), true, '91 emoji son 91 caracteres'); assert.equal(ok('\u00a0abc'), false, 'espacio de no separación al inicio');
 assert.equal(ok('\u{1F600}'.repeat(180)), true); assert.equal(ok('\u{1F600}'.repeat(181)), false); assert.equal(ok('abc\u2003'), false); assert.equal(ok('\ufeffabc'), false); assert.equal(ok('a\u00a0bc'), true); assert.equal(ok('\u200babc'), true);
 for (const bad of ['ab\u0000cd', 'ab\u0085cd', 'ab\u009fcd', 'ab\u007fcd', 'ab\u2028cd', 'ab\u2029cd', 'ab\ncd', 'a<b>', 'A\u030axx', '\u212bxx', 'ab\ud83d', '\ude00ab', 'ab', '', null, 7]) assert.equal(ok(bad), false, JSON.stringify(bad));
 for (const good of ['abc', 'Constancia N\u00b0 12/2026', '\u00c5xx', '\uac00xx', 'x'.repeat(180)]) assert.equal(ok(good), true, good);
 // Los objetos conservados siguen siendo los de condiciones: el fundamento del comando no cambió.
 assert.ok(family.includes("public.own_program_text_v1(body->'reason',10,1000)"));
});
