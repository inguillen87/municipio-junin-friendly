import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { isValidCuil, normalizeDigits } from '../scripts/lib/identity-rules.mjs';
import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';

const migrationUrl = new URL('../scripts/migrations/002-canonical-integration.sql', import.meta.url);
const promotionUrl = new URL('../scripts/canonical-promote-current-grh.sql', import.meta.url);

function withCheckDigit(firstTenDigits) {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((total, weight, index) => total + Number(firstTenDigits[index]) * weight, 0);
  const remainder = 11 - (sum % 11);
  const digit = remainder === 11 ? 0 : remainder === 10 ? 9 : remainder;
  return `${firstTenDigits}${digit}`;
}

test('normalización y dígito verificador de CUIL coinciden con la regla canónica', () => {
  const synthetic = withCheckDigit('2098765432');
  assert.equal(normalizeDigits(`20-${synthetic.slice(2, 10)}-${synthetic.slice(10)}`), synthetic);
  assert.equal(isValidCuil(synthetic), true);
  assert.equal(isValidCuil(`${synthetic.slice(0, 10)}${(Number(synthetic[10]) + 1) % 10}`), false);
  assert.equal(isValidCuil('00000000000'), false);
  assert.equal(isValidCuil(null), false);
});

test('la función SQL de CUIL valida la forma antes de convertir cada dígito', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const functionBody = sql.match(/CREATE OR REPLACE FUNCTION is_valid_cuil\(input text\)[\s\S]*?\n\$\$;/i)?.[0];

  assert.ok(functionBody, 'falta is_valid_cuil en la migración');
  assert.match(functionBody, /value !~ '\^\[0-9\]\{11\}\$'/i);
  assert.match(functionBody, /IF[\s\S]*?RETURN false;[\s\S]*?END IF;[\s\S]*?substring\(value, 1, 1\)::integer/i);
});

test('migración crea el modelo canónico, provenance y staging append-only', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const statements = splitPostgresStatements(sql);

  assert.ok(statements.length >= 45, `se esperaban al menos 45 sentencias y hay ${statements.length}`);
  for (const relation of [
    'source_import_batch', 'source_staging_row', 'person_identity', 'source_xref',
    'person_identity_assertion', 'crosswalk_persona', 'employment_contract',
    'employment_status_snapshot', 'payroll_snapshot_assignment', 'payroll_monthly_fact',
    'payroll_run', 'employment_movement', 'data_quality_issue',
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${relation}\\b`, 'i'));
  }
  assert.match(sql, /source_import_batch_append_only/i);
  assert.match(sql, /source_staging_row_append_only/i);
  assert.doesNotMatch(sql, /\bstaged_row_count\b/i);
  assert.match(sql, /CHECK \(source_system = 'GRH'\)/i);
  assert.match(sql, /source_system <> 'PERSONAS' OR canonical_entity = 'person_identity'/i);
  assert.match(sql, /cuil IS NULL OR \(cuil = normalize_digits\(cuil\) AND is_valid_cuil\(cuil\)\)/i);
  assert.match(sql, /monetary_basis = 'nominal'/i);
  assert.match(sql, /administrative_status/i);
  assert.match(sql, /payroll_status/i);
  assert.match(sql, /discrepancy_reason_code/i);
  assert.match(sql, /payroll_monthly_fact_grh_authority_ck/i);
  assert.match(sql, /payroll_snapshot_assignment_grh_authority_ck/i);
  assert.match(sql, /cost_center_source_id/i);
  assert.doesNotMatch(sql, /liquidation_source_id/i);
  assert.match(sql, /AS activo_administrativo/i);
  assert.match(sql, /AS activo_liquidable/i);
  assert.match(sql, /AS estado_control/i);
});

test('migración publica todas las vistas posibles del blueprint y el control explícito de estado', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  for (const view of [
    'vw_empleado_actual', 'vw_dotacion_mensual', 'vw_ausentismo_mensual',
    'vw_liquidacion_mensual', 'vw_movimientos_legajo', 'vw_estructura_actual',
    'vw_crosswalk_persona', 'vw_calidad_datos', 'vw_employment_status_control',
    'vw_payroll_snapshot_actual', 'vw_nomina_totales', 'vw_dotacion_cierre_mensual',
  ]) {
    assert.match(sql, new RegExp(`CREATE OR REPLACE VIEW ${view}\\b`, 'i'));
  }
  assert.match(sql, /unexplained_difference/i);
  assert.match(sql, /pending_payroll_source/i);
  assert.match(sql, /inflation_adjusted/i);
  assert.match(sql, /source_closed_flag/i);
  assert.match(sql, /closure_status IN \('closed', 'open', 'unknown'\)/i);
  assert.match(sql, /executive_publishable/i);
  assert.match(sql, /gross_payable/i);
  assert.match(sql, /employer_cost_proxy/i);
  assert.match(sql, /arithmetic_reconciled/i);
  assert.doesNotMatch(sql, /sum\(fact\.total_subject_earnings\s*\+/i);
  assert.match(sql, /FILTER \(WHERE fact\.net_payable IS NOT NULL\)/i);
  assert.match(sql, /contracts_with_net_payable = contracts/i);
  assert.match(sql, /liquidated_contracts = contracts_with_any_fact/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION validate_payroll_run_link/i);
  assert.match(sql, /payroll status % conflicts with run closure/i);
  assert.match(sql, /monthly payroll grain does not match payroll run/i);
});

test('liquidación separa la suma técnica de los totales financieros explícitos de GRH', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const sourceTotals = {
    employer_contributions: '990',
    social_security_taxable_base: '991',
    health_taxable_base: '992',
    total_subject_earnings: '993',
    total_non_subject_earnings: '994',
    family_allowance: '995',
    employee_withholdings: '996',
    employer_taxable_base: '997',
    net: '998',
    net_payable: '999',
  };

  assert.match(sql, /technical_source_amount_sum numeric\(20,2\)/i);
  assert.match(sql, /technical_source_amount_is_financial_kpi/i);
  assert.doesNotMatch(sql, /\bnominal_amount_sum\b/i);
  assert.doesNotMatch(sql, /sum\(technical_source_amount_sum\)[\s\S]{0,80}AS (?:nominal_amount|payroll_mass|masa_salarial)/i);
  for (const [column, code] of Object.entries(sourceTotals)) {
    assert.match(sql, new RegExp(`${column} numeric\\(20,2\\)`, 'i'));
    assert.match(sql, new RegExp(`sum\\((?:fact\\.)?${column}\\)::numeric AS ${column}`, 'i'));
    assert.match(sql, new RegExp(`payroll_monthly_fact\\.${column}[\\s\\S]{0,180}CODI_27 = ${code}`, 'i'));
  }
});

test('crosswalk no admite igualdad de IDPERSONA como método de matching', async () => {
  const [migration, promotion] = await Promise.all([
    readFile(migrationUrl, 'utf8'),
    readFile(promotionUrl, 'utf8'),
  ]);
  assert.doesNotMatch(promotion, /JOIN[\s\S]{0,240}IDPERSONA\s*=|IDPERSONA\s*=[\s\S]{0,240}JOIN/i);
  assert.doesNotMatch(migration, /'idpersona'|'raw_id'|'source_id_equal'/i);
  assert.match(migration, /'cuil_unique'/i);
  assert.match(migration, /'cuil_duplicate_resolved'/i);
  assert.match(migration, /'dni_unique'/i);
  assert.match(migration, /'dni_duplicate_resolved'/i);
  assert.match(migration, /'dni_with_name_birth'/i);
  assert.match(promotion, /crossSourceIdMatchUsed', false/i);
});

test('promoción GRH es idempotente y aísla CUIL/fechas no promovibles', async () => {
  const sql = await readFile(promotionUrl, 'utf8');
  const statements = splitPostgresStatements(sql);
  assert.ok(statements.length >= 15);
  assert.match(sql, /ON CONFLICT DO NOTHING/gi);
  assert.match(sql, /source_staging_row/i);
  for (const source of ['grh_employees', 'grh_absences', 'grh_leaves', 'grh_family', 'grh_catalog_rows']) {
    assert.match(sql, new RegExp(`FROM ${source}\\b`, 'i'));
  }
  assert.match(sql, /NOT COALESCE\(is_valid_cuil/i);
  assert.match(sql, /'CUIL_INVALID'/i);
  assert.match(sql, /'DATE_OUT_OF_RANGE'/i);
  assert.match(sql, /'payroll_source_pending'/i);
  assert.match(sql, /'GRH'/i);
  assert.doesNotMatch(sql, /TRUNCATE|DELETE\s+FROM|UPDATE\s+source_(?:import_batch|staging_row)/i);
});

test('splitter conserva cuerpos dollar-quoted, comentarios y punto y coma literal', () => {
  const sql = `
    -- first ; comment
    CREATE FUNCTION example() RETURNS void LANGUAGE plpgsql AS $$
    BEGIN
      PERFORM 'a;b';
    END
    $$;
    /* nested /* ; */ comment */
    SELECT "semi;colon", 'value;still';
  `;
  const statements = splitPostgresStatements(sql);
  assert.equal(statements.length, 2);
  assert.match(statements[0], /PERFORM 'a;b';/);
  assert.match(statements[1], /SELECT "semi;colon", 'value;still'/);
});
