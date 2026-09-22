/** Source-bound, read-only directory cohorts. No fixed headcounts or payroll writes. */
export const DEFAULT_WORKFORCE_STATUS = 'administrative_active';
export const WORKFORCE_STATUSES = Object.freeze(['all','active','administrative_active','liquidable','gap','inactive','state_error','unknown','multiple_active','last_closed']);

export function directorySourceBinding(env) {
  const database = String(env?.FRIENDLY_GRH_SOURCE_DATABASE || '').trim();
  const companyId = Number(env?.FRIENDLY_GRH_COMPANY_ID);
  if (!database && !env?.FRIENDLY_GRH_COMPANY_ID) return null;
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(database) || !Number.isSafeInteger(companyId) || companyId < 1) throw new Error('DIRECTORY_BINDING_INVALID');
  return Object.freeze({ database, companyId });
}

/** A response assembled by separate HTTP SQL calls must not cross publication.
 * The application has one certified GRH data plane. Multiple current batches are
 * ambiguous and fail closed instead of choosing the latest import globally. */
export async function effectiveSourceSnapshot(sql, binding) {
  if (!binding || !/^[0-9a-f-]{36}$/i.test(binding.tenantId || '')
    || !/^[a-zA-Z0-9_-]{1,120}$/.test(binding.database || '')
    || !Number.isSafeInteger(binding.companyId) || binding.companyId < 1) {
    throw Object.assign(new Error('GRH_SOURCE_SCOPE_INVALID'), { code: 'GRH_SOURCE_SCOPE_INVALID' });
  }
  const rows = await sql.query(`
    /* effective-source:snapshot */
    SELECT encode(digest(jsonb_build_object(
      'tenantId', binding.tenant_id, 'bindingId', binding.id,
      'database', binding.source_database, 'companyId', binding.source_company_id,
      'batchId', batch.id, 'importRunId', batch.legacy_import_run_id,
      'sourceSha256', batch.source_sha256, 'cutoff', batch.source_cutoff,
      'versionId', selected.source_version_id, 'publicationSha256', selected.publication_sha256
    )::text, 'sha256'), 'hex') AS token
    FROM platform_tenant_source_binding binding
    JOIN grh_effective_source_batch_v1 batch ON batch.source_database=binding.source_database
      AND batch.source_system=binding.source_system
    LEFT JOIN grh_effective_source_binding selected ON selected.source_binding_id=binding.id
      AND selected.tenant_id=binding.tenant_id
    WHERE binding.tenant_id=$1::uuid AND binding.source_database=$2
      AND binding.source_company_id=$3::bigint AND binding.source_system='GRH'
      AND binding.verified IS TRUE
      AND (SELECT count(*) FROM grh_effective_source_batch_v1)=1
      AND EXISTS (SELECT 1 FROM employment_contract contract
        WHERE contract.source_system='GRH' AND contract.legacy_company_id=binding.source_company_id
          AND contract.source_batch_id=batch.id)
      AND (selected.source_batch_id IS NULL OR selected.source_batch_id=batch.id)
  `, [binding.tenantId, binding.database, binding.companyId]);
  if (rows.length !== 1 || !/^[a-f0-9]{64}$/.test(rows[0]?.token || '')) {
    throw Object.assign(new Error('GRH_SOURCE_SCOPE_INVALID'), { code: 'GRH_SOURCE_SCOPE_INVALID' });
  }
  return rows[0].token;
}

export async function assertEffectiveSourceSnapshot(sql, binding, expected) {
  if (await effectiveSourceSnapshot(sql, binding) !== expected) {
    throw Object.assign(new Error('GRH_SOURCE_CHANGED'), { code: 'GRH_SOURCE_CHANGED' });
  }
}

export function operationalDirectorySql(baseSql) {
  return `${baseSql}, closed_month AS (
    SELECT max(date_trunc('month', r.payroll_date)::date) AS month
    FROM grh_effective_payroll_run_v1 r
    WHERE r.closure_status = 'closed'
      AND EXISTS (SELECT 1 FROM directory d WHERE d."companyId"::text = r.company_source_id
        AND d."sourceSystem" = r.source_system AND d."sourceBatchId" = r.source_batch_id)
  ), closed_contracts AS (
    SELECT DISTINCT f.employment_contract_id
    FROM grh_effective_payroll_monthly_fact_v1 f JOIN grh_effective_payroll_run_v1 r ON r.id=f.payroll_run_id
      AND r.source_batch_id=f.source_batch_id AND r.source_system=f.source_system
    JOIN directory d ON d."contractId"=f.employment_contract_id
      AND d."companyId"::text=r.company_source_id AND d."sourceBatchId"=f.source_batch_id
      AND d."sourceSystem"=f.source_system
    WHERE r.closure_status='closed'
      AND r.payroll_date >= (SELECT month FROM closed_month)
      AND r.payroll_date < (SELECT month FROM closed_month) + interval '1 month'
  ), multiple_active_people AS (
    SELECT "canonicalPersonId" FROM directory WHERE activo IS TRUE
    GROUP BY "canonicalPersonId" HAVING count(DISTINCT "contractId") > 1
  )`;
}

export function operationalScopeSelectSql(baseSql) {
  return `${baseSql} SELECT
    count(DISTINCT "contractId")::int AS "totalContracts",
    count(DISTINCT "canonicalPersonId")::int AS "totalPeople",
    count(DISTINCT "canonicalPersonId") FILTER (WHERE "crosswalkStatus"='matched')::int AS matched,
    count(DISTINCT "canonicalPersonId") FILTER (WHERE "crosswalkStatus"='ambiguous')::int AS ambiguous,
    count(DISTINCT "canonicalPersonId") FILTER (WHERE "crosswalkStatus"='unmatched')::int AS unmatched,
    count(DISTINCT "contractId") FILTER (WHERE activo)::int AS "activeContracts",
    count(DISTINCT "canonicalPersonId") FILTER (WHERE activo)::int AS "activePeople",
    count(DISTINCT "contractId") FILTER (WHERE liquidable)::int AS "payrollIncluded",
    count(DISTINCT "contractId") FILTER (WHERE activo AND NOT liquidable)::int AS "activeOutsidePayroll",
    count(DISTINCT "contractId") FILTER (WHERE "administrativeStatus"='inactive')::int AS "inactiveContracts",
    count(DISTINCT "contractId") FILTER (WHERE "administrativeStatus"='state_error')::int AS "stateErrorContracts",
    count(DISTINCT "contractId") FILTER (WHERE "administrativeStatus" IS NULL OR "administrativeStatus"='unknown')::int AS "unknownContracts",
    count(DISTINCT "contractId") FILTER (WHERE activo AND "canonicalPersonId" IN (SELECT * FROM multiple_active_people))::int AS "multipleActiveContracts",
    (SELECT count(*)::int FROM multiple_active_people) AS "multipleActivePeople",
    (SELECT count(*)::int FROM closed_contracts) AS "lastClosedContracts",
    (SELECT month FROM closed_month)::text AS "lastClosedMonth",
    min("sourceCutoff") AS "sourceCutoffFrom", max("sourceCutoff") AS "sourceCutoffTo",
    min("statusSnapshotDate")::text AS "snapshotFrom", max("statusSnapshotDate")::text AS "snapshotTo"
    FROM directory`;
}

function count(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value); return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
function date(value) {
  if (!value) return null;
  const v = value instanceof Date ? value.toISOString() : String(value);
  return /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(v) ? v : null;
}
export function operationalScopeFromRow(row = {}, status = DEFAULT_WORKFORCE_STATUS) {
  const result = {version:'workforce-operational.v1',selectedStatus:status,defaultStatus:DEFAULT_WORKFORCE_STATUS,countsScope:'certified_source_directory',currentCensusCertified:false,payrollEligibilityCertified:false};
  for (const key of ['activeContracts','activePeople','payrollIncluded','activeOutsidePayroll','inactiveContracts','stateErrorContracts','unknownContracts','multipleActiveContracts','multipleActivePeople','lastClosedContracts']) result[key] = count(row[key]);
  for (const key of ['sourceCutoffFrom','sourceCutoffTo','snapshotFrom','snapshotTo','lastClosedMonth']) result[key] = date(row[key]);
  return result;
}
