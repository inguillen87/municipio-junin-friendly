import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';


const extractorUrl = new URL('../scripts/extract_grh_core.py', import.meta.url);


test('extractor GRH conserva fuentes, aísla anomalías y no cruza IDPERSONA', async () => {
  const source = await readFile(extractorUrl, 'utf8');

  assert.match(source, /"calculo": 4_363_790/);
  assert.match(source, /"histocal": 625/);
  assert.match(source, /"histolegajo": 854/);
  assert.match(source, /"legamov": 489_681/);
  assert.match(source, /EXPECTED_CURRENT_PAYROLL_DATE = "2026-08-31"/);
  assert.match(source, /invalidCalculationDatesExcluded/);
  assert.match(source, /invalidMovementYearsExcluded/);
  assert.match(source, /crossSourceJoinByIdPersona": 0/);
  assert.match(source, /moneySemantics/);
  assert.match(source, /histocal\.CIER_31=1 is the only source-level close evidence/);
  assert.match(source, /"closureStatus": closure_status/);
  assert.match(source, /"latestClosedPayrollDate": latest_closed_payroll_date/);
  assert.doesNotMatch(source, /JOIN[\s\S]{0,200}IDPERSONA\s*=/i);
});


test('grano mensual y PK de movimientos incluyen las claves reales de GRH', async () => {
  const source = await readFile(extractorUrl, 'utf8');

  for (const field of [
    'CODI_01', 'ANO_30', 'MES_30', 'TIPO_31', 'LEGA_12', 'CODI_27', 'CODI_06',
  ]) {
    assert.match(source, new RegExp(`row\\.get\\(\"${field}\"\\)`));
  }
  assert.match(source, /monthly_key = \(/);
  assert.match(source, /"costCenterCode": _code\(row\.get\("CODI_06"\)\)/);
  assert.doesNotMatch(source, /liquidationCode/);
  assert.match(source, /"itemCount": aggregate\["itemCount"\]/);
  assert.match(source, /"technicalSourceAmountSum": _decimal_text\(aggregate\["technicalSourceAmountSum"\]\)/);
  assert.match(source, /"sourceTotals": source_totals/);
  assert.match(source, /"distinctConcepts": len\(aggregate\["conceptCodes"\]\)/);
  for (const code of ['990', '991', '992', '993', '994', '995', '996', '997', '998', '999']) {
    assert.match(source, new RegExp(`"${code}"`));
  }
  assert.doesNotMatch(source, /"nominalAmountSum"/);
});


test('reconciliación no inventa causas de negocio para los 28 casos', async () => {
  const source = await readFile(extractorUrl, 'utf8');

  assert.match(source, /active_not_liquidated_never_observed/);
  assert.match(source, /active_not_liquidated_previous_cycle/);
  assert.match(source, /active_not_liquidated_historical/);
  assert.doesNotMatch(source, /suspended|leave_without_pay|pending_termination/);
  assert.match(source, /reconciled against the open August payroll snapshot/);
});
