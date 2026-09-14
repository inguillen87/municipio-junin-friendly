// Read-only replay inspection. No source row or database error is returned.
const TABLES = Object.freeze(['grh_employees', 'grh_absences', 'grh_leaves', 'grh_family', 'grh_catalog_rows']);
const MESSAGES = Object.freeze({
  RRHH_IMPORT_REPLAY_REVIEW_REQUIRED: 'El respaldo ya tiene un intento o una procedencia diferente. Se requiere una migración revisada antes de volver a importarlo.',
  RRHH_IMPORT_REPLAY_COHORT_MISMATCH: 'El respaldo ya fue importado, pero sus tablas o su lote canónico no conservan el mismo corte. Se requiere una migración revisada; no se modificaron datos.',
  RRHH_IMPORT_REPLAY_UNAVAILABLE: 'No se pudo comprobar la repetición del respaldo. No se inició la importación.',
});

function fail(code) { throw Object.assign(new Error(MESSAGES[code]), { code }); }
function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  return JSON.stringify(value);
}

export function safeRrhhImportError(error) {
  const code = Object.hasOwn(MESSAGES, error?.code) ? error.code : 'RRHH_IMPORT_FAILED';
  return { code, message: MESSAGES[code] ?? 'No se pudo completar la importación. Revisá la fuente y la configuración antes de reintentar.' };
}

export function planCuratedReplay(runs, expected, cohortRunIds) {
  if (!Array.isArray(runs)) fail('RRHH_IMPORT_REPLAY_UNAVAILABLE');
  if (!runs.length) return { action: 'import' };
  if (runs.length > 1024 || new Set(runs.map(run => String(run.id))).size !== runs.length) fail('RRHH_IMPORT_REPLAY_REVIEW_REQUIRED');
  // Legacy retries can coexist, but every attempt must have the same provenance.
  // The current table cohort, never max(id), chooses the completed replay target.
  for (const run of runs) {
    if (!['completed', 'failed'].includes(run.status) || !/^[1-9]\d*$/.test(String(run.id))
      || run.source_name !== expected.sourceName || run.source_sha256 !== expected.sourceSha256.toUpperCase()
      || run.cutoff_matches !== true || run.completed !== true
      || run.quality_flags?.manifestSha256 !== expected.qualityFlags.manifestSha256
      || run.quality_flags?.profile !== expected.qualityFlags.profile
      || (run.status === 'completed' && (stable(run.quality_flags) !== stable(expected.qualityFlags)
        || stable(run.table_counts) !== stable(expected.tableCounts)))) fail('RRHH_IMPORT_REPLAY_REVIEW_REQUIRED');
  }
  const completed = runs.filter(run => run.status === 'completed');
  if (!completed.length) fail('RRHH_IMPORT_REPLAY_REVIEW_REQUIRED');
  if (cohortRunIds === undefined) return { action: 'inspect_replay' };
  if (!Array.isArray(cohortRunIds) || cohortRunIds.length !== 1
    || !completed.some(run => String(run.id) === cohortRunIds[0])) fail('RRHH_IMPORT_REPLAY_COHORT_MISMATCH');
  return { action: 'verify_replay', importRunId: cohortRunIds[0] };
}

// Comparing typed records also checks projected dates, identifiers and labels,
// not just counts/import IDs. PostgreSQL performs the same casts as INSERT.
// EXCEPT ALL catches missing, additional and duplicate rows without emitting PII.
const COHORT_SQL = 'WITH ' + TABLES.map((table, index) => `${table}_expected AS MATERIALIZED (
  SELECT * FROM jsonb_populate_recordset(NULL::public.${table}, $${index + 1}::jsonb)
), ${table}_difference AS (
  (SELECT * FROM public.${table} EXCEPT ALL SELECT * FROM ${table}_expected)
  UNION ALL
  (SELECT * FROM ${table}_expected EXCEPT ALL SELECT * FROM public.${table})
)`).join(',\n') + '\nSELECT ' + TABLES.map(table => `NOT EXISTS (SELECT 1 FROM ${table}_difference) AS ${table}`).join(', ');

export async function inspectCuratedReplay(client, expected, projectTables) {
  let transaction = false;
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    transaction = true;
    const history = await client.query(`SELECT id::text, source_name, upper(source_sha256) AS source_sha256,
      source_cutoff IS NOT DISTINCT FROM $2::timestamp AS cutoff_matches,
      status, completed_at IS NOT NULL AS completed, quality_flags, table_counts
      FROM public.data_import_runs WHERE upper(source_sha256) = upper($1)
      ORDER BY id DESC LIMIT 1025`, [expected.sourceSha256, expected.cutoff]);
    let plan = planCuratedReplay(history.rows, expected);
    if (plan.action === 'import') return plan;
    const cohort = await client.query('SELECT import_run_id::text FROM ('
      + TABLES.map(table => `SELECT import_run_id FROM public.${table}`).join(' UNION ') + ') cohort');
    if (!Array.isArray(cohort.rows)) fail('RRHH_IMPORT_REPLAY_UNAVAILABLE');
    plan = planCuratedReplay(history.rows, expected, cohort.rows.map(row => row.import_run_id));
    const projected = projectTables(plan.importRunId);
    const parameters = TABLES.map(table => {
      if (!Array.isArray(projected[table])) fail('RRHH_IMPORT_REPLAY_UNAVAILABLE');
      return JSON.stringify(projected[table].map(row => ({ ...row, source_payload: JSON.parse(row.source_payload) })));
    });
    const result = await client.query(COHORT_SQL, parameters);
    if (result.rows?.length !== 1 || TABLES.some(table => result.rows[0][table] !== true)) fail('RRHH_IMPORT_REPLAY_COHORT_MISMATCH');
    const schema = await client.query("SELECT to_regclass('public.source_import_batch') IS NOT NULL AS present");
    if (schema.rows?.length !== 1 || typeof schema.rows[0].present !== 'boolean') fail('RRHH_IMPORT_REPLAY_UNAVAILABLE');
    if (schema.rows[0].present) {
      const canonical = await client.query(`SELECT legacy_import_run_id::text, source_database
        FROM public.source_import_batch WHERE source_system = 'GRH' AND upper(source_sha256) = upper($1)
        LIMIT 2`, [expected.sourceSha256]);
      if (!Array.isArray(canonical.rows) || canonical.rows.length > 1 || canonical.rows.some(row =>
        row.legacy_import_run_id !== plan.importRunId || row.source_database !== expected.sourceDatabase)) fail('RRHH_IMPORT_REPLAY_COHORT_MISMATCH');
    }
    return { action: 'noop', importRunId: plan.importRunId };
  } catch (error) {
    if (Object.hasOwn(MESSAGES, error?.code)) throw error;
    fail('RRHH_IMPORT_REPLAY_UNAVAILABLE');
  } finally {
    if (transaction) {
      // Do not proceed to writes or claim NOOP if the read-only transaction
      // cannot be closed. The owning connection is closed by the importer.
      try { await client.query('ROLLBACK'); } catch { fail('RRHH_IMPORT_REPLAY_UNAVAILABLE'); }
    }
  }
}
