import process from 'node:process';
import { neon } from '@neondatabase/serverless';

import { directCanonicalDatabaseUrl } from './lib/canonical-import.mjs';

const fullBlueprint = process.argv.includes('--full-blueprint');
const databaseUrl = directCanonicalDatabaseUrl();
const sql = neon(databaseUrl);

const [foundation] = await sql.query(`
  SELECT
    (SELECT count(*)::int FROM person_identity
      WHERE cuil IS NOT NULL AND NOT is_valid_cuil(cuil)) AS invalid_promoted_cuils,
    (SELECT count(*)::int FROM employment_contract
      WHERE source_system <> 'GRH') AS employment_not_governed_by_grh,
    (SELECT count(*)::int FROM employment_status_snapshot
      WHERE source_system <> 'GRH') AS status_not_governed_by_grh,
    (SELECT count(*)::int FROM payroll_snapshot_assignment
      WHERE source_system <> 'GRH') AS snapshot_not_governed_by_grh,
    (SELECT count(*)::int FROM payroll_monthly_fact
      WHERE source_system <> 'GRH') AS payroll_not_governed_by_grh,
    (SELECT count(*)::int FROM payroll_run
      WHERE source_system <> 'GRH') AS payroll_runs_not_governed_by_grh,
    (SELECT count(*)::int FROM vw_nomina_totales
      WHERE closure_status <> 'closed' AND executive_publishable) AS open_runs_published,
    (SELECT count(*)::int FROM employment_movement
      WHERE source_system <> 'GRH') AS movements_not_governed_by_grh,
    (SELECT count(*)::int FROM source_xref
      WHERE source_system = 'PERSONAS'
        AND canonical_entity <> 'person_identity') AS personas_outside_identity_scope,
    (SELECT count(*)::int FROM crosswalk_persona
      WHERE match_method NOT IN (
        'cuil_unique', 'cuil_with_evidence', 'cuil_duplicate_resolved',
        'dni_unique', 'dni_duplicate_resolved', 'dni_with_name_birth',
        'manual_review', 'ambiguous', 'unmatched'
      )) AS forbidden_crosswalk_methods,
    (SELECT count(*)::int FROM person_identity
      WHERE birth_date IS NOT NULL
        AND birth_date NOT BETWEEN DATE '1900-01-01' AND DATE '2100-12-31') AS invalid_canonical_birth_dates,
    (SELECT count(*)::int FROM employment_contract
      WHERE (start_date IS NOT NULL AND start_date NOT BETWEEN DATE '1900-01-01' AND DATE '2100-12-31')
         OR (end_date IS NOT NULL AND end_date NOT BETWEEN DATE '1900-01-01' AND DATE '2100-12-31')
         OR (start_date IS NOT NULL AND end_date IS NOT NULL AND end_date < start_date)) AS invalid_contract_dates,
    (SELECT count(*)::int FROM employment_contract contract
      WHERE contract.status = 'state_error'
        AND NOT EXISTS (
          SELECT 1 FROM data_quality_issue issue
          WHERE issue.canonical_entity = 'employment_contract'
            AND issue.canonical_id = contract.id
            AND issue.issue_code IN ('DATE_OUT_OF_RANGE', 'DATE_ORDER_INVALID')
        )) AS state_errors_without_quality_issue,
    (SELECT count(*)::int FROM source_staging_row) AS staged_rows,
    (SELECT count(*)::int FROM source_import_batch) AS immutable_batches
`);

const foundationGates = {
  invalidPromotedCuils: foundation.invalid_promoted_cuils === 0,
  grhGovernsEmployment: foundation.employment_not_governed_by_grh === 0,
  grhGovernsStatus: foundation.status_not_governed_by_grh === 0,
  grhGovernsPayrollSnapshot: foundation.snapshot_not_governed_by_grh === 0,
  grhGovernsMonthlyPayroll: foundation.payroll_not_governed_by_grh === 0,
  grhGovernsPayrollRuns: foundation.payroll_runs_not_governed_by_grh === 0,
  openPayrollRunsAreBlocked: foundation.open_runs_published === 0,
  grhGovernsMovements: foundation.movements_not_governed_by_grh === 0,
  personasOnlyEnrichesIdentity: foundation.personas_outside_identity_scope === 0,
  noRawIdCrosswalkMethod: foundation.forbidden_crosswalk_methods === 0,
  canonicalDatesAreInRange:
    foundation.invalid_canonical_birth_dates === 0 && foundation.invalid_contract_dates === 0,
  anomalousEmploymentDatesAreIsolated: foundation.state_errors_without_quality_issue === 0,
  immutableStagingExists:
    foundation.immutable_batches > 0
    && foundation.staged_rows > 0,
};

let blueprint = null;
let blueprintGates = null;
if (fullBlueprint) {
  const [statusControl = {}] = await sql.query(`
    SELECT * FROM vw_employment_status_control ORDER BY snapshot_date DESC LIMIT 1
  `);
  const [crosswalk] = await sql.query(`
    SELECT
      count(*) FILTER (WHERE match_status = 'matched')::int AS matched,
      count(*) FILTER (WHERE match_status = 'ambiguous')::int AS ambiguous,
      count(*) FILTER (WHERE match_status = 'unmatched')::int AS unmatched
    FROM crosswalk_persona
    WHERE valid_to IS NULL
  `);
  const [grhCore] = await sql.query(`
    SELECT
      (SELECT count(*)::int FROM vw_payroll_snapshot_actual) AS current_payroll_snapshot,
      (SELECT count(*)::int FROM payroll_monthly_fact) AS payroll_monthly_facts,
      (SELECT count(*)::int FROM employment_movement) AS valid_movements,
      (SELECT closed_payroll_contracts::int FROM vw_dotacion_cierre_mensual
        WHERE month = DATE '2026-07-01') AS july_closed_contracts,
      (SELECT closure_status FROM payroll_run
        WHERE payroll_date = DATE '2026-08-31'
        ORDER BY payroll_type LIMIT 1) AS august_closure_status,
      (SELECT executive_publishable FROM vw_liquidacion_mensual
        WHERE month = DATE '2026-07-01' AND closure_status = 'closed') AS july_publishable,
      (SELECT executive_publishable FROM vw_liquidacion_mensual
        WHERE month = DATE '2026-08-01' AND closure_status = 'open') AS august_publishable,
      (SELECT net_payable FROM vw_liquidacion_mensual
        WHERE month = DATE '2026-07-01' AND closure_status = 'closed') AS july_net_payable,
      (SELECT employer_cost_proxy FROM vw_liquidacion_mensual
        WHERE month = DATE '2026-07-01' AND closure_status = 'closed') AS july_employer_cost_proxy,
      (SELECT count(*)::int FROM employment_status_snapshot
        WHERE snapshot_date = DATE '2026-08-31'
          AND discrepancy_reason_code = 'active_not_liquidated_never_observed') AS gap_never_liquidated,
      (SELECT count(*)::int FROM employment_status_snapshot
        WHERE snapshot_date = DATE '2026-08-31'
          AND discrepancy_reason_code = 'active_not_liquidated_historical') AS gap_historical,
      (SELECT count(*)::int FROM employment_status_snapshot
        WHERE snapshot_date = DATE '2026-08-31'
          AND discrepancy_reason_code = 'active_not_liquidated_previous_cycle') AS gap_previous_cycle
  `);
  blueprint = { statusControl, crosswalk, grhCore };
  blueprintGates = {
    administrativeActive882: Number(statusControl.administrative_active ?? -1) === 882,
    payrollInOpenAugust854: Number(statusControl.payroll_in_current_run ?? -1) === 854,
    payrollPreliquidatedOpen854: Number(statusControl.payroll_preliquidated_open ?? -1) === 854,
    noClosedLiquidationInAugustSnapshot:
      Number(statusControl.payroll_liquidated_closed ?? -1) === 0,
    augustSnapshotIsOpen: statusControl.current_payroll_closure_status === 'open',
    difference28: Number(statusControl.difference ?? -1) === 28,
    noPendingPayrollSource: Number(statusControl.pending_payroll_source ?? -1) === 0,
    noUnexplainedDifference: Number(statusControl.unexplained_difference ?? -1) === 0,
    monetaryValuesAreNominal: statusControl.monetary_values_are_nominal === true,
    payrollSnapshot854: Number(grhCore.current_payroll_snapshot) === 854,
    julyClosedPayroll856: Number(grhCore.july_closed_contracts) === 856,
    julyFinancialsPublishable: grhCore.july_publishable === true,
    augustFinancialsBlocked: grhCore.august_publishable === false,
    julyNetPayable95138057279:
      Math.abs(Number(grhCore.july_net_payable) - 951380572.79) < 0.01,
    julyEmployerCostProxy139766976229:
      Math.abs(Number(grhCore.july_employer_cost_proxy) - 1397669762.29) < 0.01,
    payrollMonthly214164: Number(grhCore.payroll_monthly_facts) === 214164,
    validMovements489459: Number(grhCore.valid_movements) === 489459,
    gapNeverLiquidated16: Number(grhCore.gap_never_liquidated) === 16,
    gapHistorical11: Number(grhCore.gap_historical) === 11,
    gapPreviousCycle1: Number(grhCore.gap_previous_cycle) === 1,
    matched1699: Number(crosswalk.matched) === 1699,
    ambiguous157: Number(crosswalk.ambiguous) === 157,
    unmatched493: Number(crosswalk.unmatched) === 493,
  };
}

const failed = [
  ...Object.entries(foundationGates),
  ...Object.entries(blueprintGates ?? {}),
].filter(([, passed]) => !passed).map(([name]) => name);

console.log(JSON.stringify({
  ok: failed.length === 0,
  mode: fullBlueprint ? 'full-blueprint' : 'foundation',
  foundation,
  foundationGates,
  blueprint,
  blueprintGates,
  failed,
}, null, 2));

if (failed.length) process.exitCode = 1;
