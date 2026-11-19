// Planner maintenance after a confirmed source import. No source rows are read
// or changed, and maintenance failure must never turn a confirmed save into a retry.
export const SOURCE_ANALYZE_PROFILES = Object.freeze({
  final_revision: Object.freeze(['grh_final_source_revision', 'grh_final_source_delta', 'grh_final_source_seal']),
  core_import: Object.freeze(['source_import_batch', 'source_staging_row', 'data_quality_issue',
    'payroll_run', 'payroll_snapshot_assignment', 'employment_movement', 'payroll_monthly_fact', 'employment_status_snapshot']),
  curated_import: Object.freeze(['data_import_runs', 'grh_employees', 'grh_absences', 'grh_leaves', 'grh_family', 'grh_catalog_rows']),
});
const failure = (profile, code, connectionReusable) => Object.freeze({
  version: 'source-planner-maintenance.v1', profile, status: 'failed',
  dataCommitted: true, retryImport: false, analyzedTables: [],
  code: /^[A-Z0-9_]{1,64}$/.test(code ?? '') ? code : 'SOURCE_ANALYZE_FAILED', connectionReusable,
});

export async function analyzeCommittedSource({client, profile, committed = false} = {}) {
  if (!Object.hasOwn(SOURCE_ANALYZE_PROFILES, profile) || typeof committed !== 'boolean'
    || typeof client?.query !== 'function') throw Object.assign(Error('SOURCE_ANALYZE_ARGUMENT'), {code: 'SOURCE_ANALYZE_ARGUMENT'});
  if (!committed) return Object.freeze({version: 'source-planner-maintenance.v1', profile,
    status: 'skipped_not_committed', dataCommitted: false, retryImport: false, analyzedTables: [], connectionReusable: true});
  const tables = SOURCE_ANALYZE_PROFILES[profile];
  let began = false;
  try {
    await client.query('BEGIN READ WRITE'); began = true;
    await client.query("SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='2s'; SET LOCAL idle_in_transaction_session_timeout='35s'");
    const guard = await client.query(`/* source-analyze:guard */
      SELECT c.relname AS name, c.relkind AS kind,
        pg_catalog.has_table_privilege(c.oid,'MAINTAIN') AS allowed
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname`, [tables]);
    if (guard.rows?.length !== tables.length || new Set(guard.rows.map(r => r.name)).size !== tables.length
      || guard.rows.some(r => !tables.includes(r.name) || !['r','p','m'].includes(r.kind) || r.allowed !== true)) {
      throw Object.assign(Error('SOURCE_ANALYZE_SCOPE_OR_PRIVILEGE'), {code: 'SOURCE_ANALYZE_SCOPE_OR_PRIVILEGE'});
    }
    // Identifiers come only from the fixed profile above, never from imported input.
    await client.query('ANALYZE ' + tables.map(name => 'public."' + name + '"').join(', '));
    await client.query('COMMIT'); began = false;
    return Object.freeze({version: 'source-planner-maintenance.v1', profile, status: 'completed',
      dataCommitted: true, retryImport: false, analyzedTables: [...tables], connectionReusable: true});
  } catch (error) {
    let reusable = true;
    if (began) { try { await client.query('ROLLBACK'); } catch { reusable = false; } }
    else reusable = false;
    const code = error?.code === 'SOURCE_ANALYZE_SCOPE_OR_PRIVILEGE' ? error.code
      : /^[0-9A-Z]{5}$/.test(error?.code ?? '') ? 'SOURCE_ANALYZE_SQLSTATE_' + error.code : 'SOURCE_ANALYZE_FAILED';
    return failure(profile, code, reusable);
  }
}
