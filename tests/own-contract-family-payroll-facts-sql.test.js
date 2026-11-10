// La propuesta de backend de hechos familiares es el backend certificado de condiciones salariales bajo un cambio
// de nombre. Lo único nuevo es el validador de la declaración. Estas pruebas fijan esa propiedad: si alguien edita
// a mano una función conservada, deja de ser una copia y la diferencia aparece acá.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {FAMILY_PAYROLL_FACT_QUANTITIES, familyPayrollFactsDefinition} from '../assets/own-contract-family-payroll-facts-model.js';
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
