import { acquireGrhPublicationLocks } from './grh-publication-lock.mjs';
import { inspectCuratedReplayWithinTransaction } from './rrhh-import-replay.mjs';
import { verifyCanonicalGrhStagingWithinTransaction } from '../promote-canonical-grh.mjs';
import { getGrhSourceProfile } from './grh-source-profile.mjs';

// Internal publication primitive. Source/profile authorization and the final
// publication outcome belong to the orchestrator; no CLI calls this module.
const TABLES = Object.freeze({
  grh_employees: { count: 'employees', keys: ['company_id', 'legajo'], columns: [
    'company_id', 'legajo', 'person_id', 'nombre', 'sexo', 'fecha_nacimiento', 'dni', 'cuil',
    'telefono', 'email', 'domicilio', 'localidad', 'fecha_ingreso', 'fecha_egreso', 'activo',
    'sector_code', 'sector', 'categoria_code', 'categoria', 'convenio_code', 'convenio',
    'cargo_code', 'cargo', 'gremio', 'lugar_trabajo', 'profesion', 'source_payload', 'import_run_id',
  ] },
  grh_absences: { count: 'absences', keys: ['company_id', 'legajo', 'fecha'], columns: [
    'company_id', 'legajo', 'fecha', 'motivo_code', 'cantidad', 'dias', 'fecha_hasta',
    'comentario', 'source_payload', 'import_run_id',
  ] },
  grh_leaves: { count: 'leaves', keys: ['company_id', 'periodo', 'legajo', 'fecha_inicio'], columns: [
    'company_id', 'legajo', 'periodo', 'tipo', 'fecha_inicio', 'fecha_fin', 'dias',
    'observaciones', 'source_payload', 'import_run_id',
  ] },
  grh_family: { count: 'family', keys: ['family_id'], columns: [
    'family_id', 'company_id', 'legajo', 'nombre', 'sexo', 'fecha_nacimiento', 'dni', 'cuil',
    'vinculo_code', 'fecha_baja', 'source_payload', 'import_run_id',
  ] },
  grh_catalog_rows: { count: 'catalog_rows', keys: ['catalog', 'source_key'], columns: [
    'catalog', 'source_key', 'label', 'source_payload', 'import_run_id',
  ] },
});
const NAMES = Object.keys(TABLES);
const DELETE_ORDER = [...NAMES.slice(1), NAMES[0]];
const SAVEPOINT = 'grh_curated_replacement';
const PROJECTION_RUN = '1';
const MESSAGES = Object.freeze({
  GRH_CURATED_REPLACEMENT_INPUT_INVALID: 'El reemplazo requiere una base y una fuente candidata verificadas explícitamente.',
  GRH_CURATED_REPLACEMENT_TRANSACTION_REQUIRED: 'El reemplazo requiere una transacción controlada por quien lo invoca.',
  GRH_CURATED_REPLACEMENT_BASELINE_MISMATCH: 'La base publicada o sus tablas no coinciden con el corte seleccionado.',
  GRH_CURATED_REPLACEMENT_STAGING_MISMATCH: 'La evidencia histórica no conserva íntegramente el corte anterior.',
  GRH_CURATED_REPLACEMENT_CANDIDATE_CONFLICT: 'La fuente candidata requiere un corte posterior y no debe tener intentos ni lotes previos.',
  GRH_CURATED_REPLACEMENT_PROJECTION_INVALID: 'La proyección candidata no conserva las cantidades, claves o tipos esperados.',
  GRH_CURATED_REPLACEMENT_RESULT_MISMATCH: 'El reemplazo no produjo exactamente la proyección candidata.',
  GRH_CURATED_REPLACEMENT_BUSY: 'Otra operación retiene los datos necesarios; reintentá la transacción completa.',
  GRH_CURATED_REPLACEMENT_CHECKPOINT_FAILED: 'El ensayo se interrumpió en un punto de control; quien controla la transacción debe revertirla.',
  GRH_CURATED_REPLACEMENT_UNAVAILABLE: 'No se pudo completar el reemplazo; quien controla la transacción debe revertirla.',
});
export const GRH_CURATED_REPLACEMENT_CHECKPOINTS = Object.freeze([
  'curated:validated', 'curated:run-created',
  ...DELETE_ORDER.map(table => `curated:deleted:${table}`),
  ...NAMES.map(table => `curated:inserted:${table}`), 'curated:verified',
]);
function fail(code) { throw Object.assign(new Error(MESSAGES[code]), { code }); }
export function safeGrhCuratedReplacementError(error) {
  const code = Object.hasOwn(MESSAGES, error?.code) ? error.code : 'GRH_CURATED_REPLACEMENT_UNAVAILABLE';
  return { code, message: MESSAGES[code] };
}
function runId(value) {
  return typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
}
function count(value) { return Number.isSafeInteger(value) && value >= 0; }
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function one(result) {
  if (!Array.isArray(result?.rows) || result.rows.length !== 1 || !result.rows[0]) fail('GRH_CURATED_REPLACEMENT_UNAVAILABLE');
  return result.rows[0];
}
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}[ T](?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value)) return false;
  const normalized = value.replace(' ', 'T') + '.000Z';
  const date = new Date(normalized);
  return !Number.isNaN(date.getTime()) && date.toISOString() === normalized;
}
function profileTableCounts(profile) {
  const outputs = profile.curated.expectedOutputCounts;
  const catalogs = Object.fromEntries(Object.entries({ sectors: 'sectors', categories: 'categories', unions: 'unions',
    agreements: 'agreements', absenceReasons: 'absence_reasons', familyRelationships: 'family_relationships',
    jobRoles: 'job_roles', organizations: 'organizations', exitReasons: 'exit_reasons', employmentStatuses: 'employment_statuses',
  }).map(([output, catalog]) => [catalog, outputs[output]]));
  return { employees: outputs.employees, absences: outputs.absences, leaves: outputs.leaves, family: outputs.familyMembers,
    catalog_rows: Object.values(catalogs).reduce((sum, value) => sum + value, 0), catalogs,
    critical: Object.fromEntries(['employees', 'absences', 'leaves', 'familyMembers', 'sectors', 'categories', 'unions', 'agreements']
      .map(output => [output, outputs[output]])), source: outputs };
}
function snapshotPrepared(prepared, id) {
  // Capture independent JSON values before the first await. A checkpoint cannot
  // change the caller's prepared object between validation and insertion.
  const expected = JSON.parse(JSON.stringify(prepared?.expected));
  if (expected?.sourceName !== 'grh_junin_curated' || expected.sourceDatabase !== 'grh_junin'
    || typeof expected.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(expected.sourceSha256)
    || !timestamp(expected.cutoff) || expected.qualityFlags?.profile !== `grh-junin-${expected.cutoff.slice(0, 10)}`
    || expected.qualityFlags.strictSnapshot !== true || expected.qualityFlags.allOutputHashesVerified !== true
    || !/^[a-f0-9]{64}$/i.test(expected.qualityFlags.manifestSha256 ?? '')
    || !expected.tableCounts || NAMES.some(table => !count(expected.tableCounts[TABLES[table].count]))
    || expected.tableCounts.employees < 1 || typeof prepared.projectTables !== 'function') fail('GRH_CURATED_REPLACEMENT_INPUT_INVALID');
  const profile = getGrhSourceProfile(expected.qualityFlags.profile);
  if (expected.qualityFlags.profile !== profile.curated.profileId || expected.sourceSha256.toUpperCase() !== profile.source.sha256
    || expected.sourceDatabase !== profile.source.database || expected.cutoff.replace(' ', 'T') !== profile.source.cutoff
    || stable(expected.tableCounts) !== stable(profileTableCounts(profile))) fail('GRH_CURATED_REPLACEMENT_INPUT_INVALID');
  const projected = prepared.projectTables(id);
  const tables = Object.fromEntries(NAMES.map(table => {
    const rows = projected?.[table];
    if (!Array.isArray(rows) || rows.length !== expected.tableCounts[TABLES[table].count]) fail('GRH_CURATED_REPLACEMENT_PROJECTION_INVALID');
    const snapshot = JSON.parse(JSON.stringify(rows));
    for (const row of snapshot) {
      if (!row || Array.isArray(row) || String(row.import_run_id) !== id || typeof row.source_payload !== 'string'
        || Object.keys(row).some(column => !TABLES[table].columns.includes(column))) fail('GRH_CURATED_REPLACEMENT_PROJECTION_INVALID');
      const payload = JSON.parse(row.source_payload);
      if (!payload || Array.isArray(payload) || typeof payload !== 'object') fail('GRH_CURATED_REPLACEMENT_PROJECTION_INVALID');
    }
    return [table, snapshot];
  }));
  const catalogs = Object.create(null);
  for (const row of tables.grh_catalog_rows) catalogs[row.catalog] = (catalogs[row.catalog] ?? 0) + 1;
  if (!expected.tableCounts.catalogs || typeof expected.tableCounts.catalogs !== 'object' || Array.isArray(expected.tableCounts.catalogs)
    || Object.values(expected.tableCounts.catalogs).some(value => !count(value))
    || Object.entries(expected.tableCounts.catalogs).some(([key, value]) => (catalogs[key] ?? 0) !== value)
    || Object.keys(catalogs).some(key => !Object.hasOwn(expected.tableCounts.catalogs, key))) fail('GRH_CURATED_REPLACEMENT_PROJECTION_INVALID');
  return {
    expected, tables,
    projectTables: targetId => Object.fromEntries(NAMES.map(table => [table, tables[table].map(row => ({ ...row, import_run_id: targetId }))])),
  };
}
function records(rows) { return JSON.stringify(rows.map(row => ({ ...row, source_payload: JSON.parse(row.source_payload) }))); }

const RUN_SQL = `/* grh-curated-replacement:baseline-run */ SELECT id::text, source_name,
  upper(source_sha256) AS source_sha256, source_cutoff IS NOT DISTINCT FROM $2::timestamp AS cutoff_matches,
  status, completed_at IS NOT NULL AS completed, quality_flags, table_counts
  FROM public.data_import_runs WHERE id=$1::bigint FOR SHARE NOWAIT`;
const BATCH_SQL = `/* grh-curated-replacement:baseline-batch */ SELECT id::text, source_system, source_database,
  source_file_name, upper(source_sha256) AS source_sha256, legacy_import_run_id::text,
  source_cutoff IS NOT DISTINCT FROM ($3::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires') AS cutoff_matches,
  validation_state, id=md5('source_import_batch|GRH|' || upper(source_sha256))::uuid AS deterministic_id
  FROM public.source_import_batch WHERE id=$2::uuid OR (source_system='GRH'
    AND (legacy_import_run_id=$1::bigint OR upper(source_sha256)=upper($4))) ORDER BY id FOR SHARE NOWAIT`;
const CONTRACT_LOCK_SQL = `/* grh-curated-replacement:lock-contracts */ WITH candidate AS MATERIALIZED (
  SELECT * FROM jsonb_populate_recordset(NULL::public.grh_employees,$2::jsonb)
), selected AS (
  SELECT company_id,legajo FROM public.grh_employees WHERE import_run_id=$1::bigint
  UNION SELECT company_id,legajo FROM candidate
)
SELECT 1 FROM public.employment_contract c WHERE EXISTS (SELECT 1 FROM selected e
  WHERE (c.legacy_company_id=e.company_id AND c.legacy_legajo=e.legajo)
    OR c.id=md5('employment_contract|GRH|legajo|' || e.company_id::text || '|' || e.legajo)::uuid)
ORDER BY c.id FOR UPDATE OF c NOWAIT`;
const BASE_CONTRACTS_SQL = `/* grh-curated-replacement:baseline-contracts */ SELECT NOT EXISTS (
  SELECT 1 FROM public.grh_employees e LEFT JOIN public.employment_contract c
    ON c.id=md5('employment_contract|GRH|legajo|' || e.company_id::text || '|' || e.legajo)::uuid
  WHERE e.import_run_id=$1::bigint AND (e.person_id IS NULL OR c.id IS NULL
    OR c.source_system IS DISTINCT FROM 'GRH' OR c.source_batch_id IS DISTINCT FROM $2::uuid
    OR c.legacy_company_id IS DISTINCT FROM e.company_id OR c.legacy_legajo IS DISTINCT FROM e.legajo
    OR c.person_id IS DISTINCT FROM md5('person_identity|GRH|persona|' || e.person_id::text)::uuid
    OR c.source_payload IS DISTINCT FROM e.source_payload)
) AS complete`;
const CANDIDATE_SQL = `/* grh-curated-replacement:candidate-history */ SELECT
  $2::timestamp > $3::timestamp AS later_cutoff,
  NOT EXISTS (SELECT 1 FROM public.data_import_runs WHERE upper(source_sha256)=upper($1))
    AND NOT EXISTS (SELECT 1 FROM public.source_import_batch WHERE source_system='GRH' AND upper(source_sha256)=upper($1)) AS unseen`;
function projectionSql(table) {
  const keys = TABLES[table].keys;
  const required = [...new Set([...keys, 'source_payload', 'import_run_id', ...(table === 'grh_employees' ? ['activo'] : []),
    ...(table === 'grh_family' ? ['company_id', 'legajo'] : [])])];
  return `/* grh-curated-replacement:projection:${table} */ WITH projected AS MATERIALIZED (
    SELECT * FROM jsonb_populate_recordset(NULL::public.${table},$1::jsonb)
  ) SELECT count(*)::int AS records,count(DISTINCT ROW(${keys.join(',')}))::int AS unique_keys,
    NOT EXISTS (SELECT 1 FROM projected WHERE ${required.map(key => `${key} IS NULL`).join(' OR ')}
      OR import_run_id<>$2::bigint OR jsonb_typeof(source_payload)<>'object') AS valid FROM projected`;
}
async function verifyBaseline(client, current, baseline) {
  const expected = baseline.expected;
  const run = one(await client.query(RUN_SQL, [current.importRunId, expected.cutoff]));
  if (run.id !== current.importRunId || run.source_name !== expected.sourceName || run.source_sha256 !== expected.sourceSha256.toUpperCase()
    || run.cutoff_matches !== true || run.status !== 'completed' || run.completed !== true
    || stable(run.quality_flags) !== stable(expected.qualityFlags) || stable(run.table_counts) !== stable(expected.tableCounts)) fail('GRH_CURATED_REPLACEMENT_BASELINE_MISMATCH');
  const result = await client.query(BATCH_SQL, [current.importRunId, current.batchId, expected.cutoff, expected.sourceSha256]);
  if (!Array.isArray(result?.rows) || result.rows.length !== 1) fail('GRH_CURATED_REPLACEMENT_BASELINE_MISMATCH');
  const batch = result.rows[0];
  if (batch.id !== current.batchId || batch.source_system !== 'GRH' || batch.source_database !== expected.sourceDatabase
    || batch.source_file_name !== expected.sourceName || batch.source_sha256 !== expected.sourceSha256.toUpperCase()
    || batch.legacy_import_run_id !== current.importRunId || batch.cutoff_matches !== true
    || batch.validation_state !== 'published' || batch.deterministic_id !== true) fail('GRH_CURATED_REPLACEMENT_BASELINE_MISMATCH');
}

export async function replaceCuratedWithinTransaction({ client, current, candidate, checkpoint = async () => {} } = {}) {
  let baseline, next, identity;
  try {
    if (!client || typeof client.query !== 'function' || !runId(current?.importRunId)
      || typeof current.batchId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(current.batchId)
      || typeof checkpoint !== 'function') fail('GRH_CURATED_REPLACEMENT_INPUT_INVALID');
    identity = { importRunId: current.importRunId, batchId: current.batchId };
    baseline = snapshotPrepared(current.prepared, identity.importRunId);
    next = snapshotPrepared(candidate, PROJECTION_RUN);
    if (baseline.expected.sourceSha256.toUpperCase() === next.expected.sourceSha256.toUpperCase()) fail('GRH_CURATED_REPLACEMENT_CANDIDATE_CONFLICT');
  } catch (error) {
    if (Object.hasOwn(MESSAGES, error?.code)) throw error;
    fail('GRH_CURATED_REPLACEMENT_INPUT_INVALID');
  }
  const check = async phase => {
    try { await checkpoint(phase); } catch { fail('GRH_CURATED_REPLACEMENT_CHECKPOINT_FAILED'); }
  };
  try {
    try { await client.query(`SAVEPOINT ${SAVEPOINT}`); }
    catch (error) { if (error?.code === '25P01') fail('GRH_CURATED_REPLACEMENT_TRANSACTION_REQUIRED'); throw error; }
    await acquireGrhPublicationLocks(client);
    await verifyBaseline(client, identity, baseline);
    // Certificate writers lock contracts before their family/catalog rows.
    // Acquire these locks before the curated write locks in the same order.
    await client.query(CONTRACT_LOCK_SQL, [identity.importRunId, records(next.tables.grh_employees)]);
    await client.query(`LOCK TABLE ${NAMES.map(table => `public.${table}`).join(', ')} IN SHARE ROW EXCLUSIVE MODE NOWAIT`);
    let replay;
    try { replay = await inspectCuratedReplayWithinTransaction(client, baseline.expected, baseline.projectTables); }
    catch { fail('GRH_CURATED_REPLACEMENT_BASELINE_MISMATCH'); }
    if (replay.action !== 'noop' || replay.importRunId !== identity.importRunId
      || one(await client.query(BASE_CONTRACTS_SQL, [identity.importRunId, identity.batchId])).complete !== true) fail('GRH_CURATED_REPLACEMENT_BASELINE_MISMATCH');
    try { await verifyCanonicalGrhStagingWithinTransaction(client, identity.importRunId, identity.batchId); }
    catch { fail('GRH_CURATED_REPLACEMENT_STAGING_MISMATCH'); }
    const history = one(await client.query(CANDIDATE_SQL, [next.expected.sourceSha256, next.expected.cutoff, baseline.expected.cutoff]));
    if (history.later_cutoff !== true || history.unseen !== true) fail('GRH_CURATED_REPLACEMENT_CANDIDATE_CONFLICT');
    for (const table of NAMES) {
      const projected = one(await client.query(projectionSql(table), [records(next.tables[table]), PROJECTION_RUN]));
      if (projected.records !== next.tables[table].length || projected.unique_keys !== projected.records || projected.valid !== true) fail('GRH_CURATED_REPLACEMENT_PROJECTION_INVALID');
    }
    await check('curated:validated');
    const expected = next.expected;
    const created = one(await client.query(`/* grh-curated-replacement:create-run */ INSERT INTO public.data_import_runs
      (source_name,source_sha256,source_cutoff,status,table_counts,quality_flags)
      VALUES ($1,$2,$3::timestamp,'running',$4::jsonb,$5::jsonb) RETURNING id::text`,
    [expected.sourceName, expected.sourceSha256.toUpperCase(), expected.cutoff, JSON.stringify(expected.tableCounts), JSON.stringify(expected.qualityFlags)]));
    if (!runId(created.id) || created.id === identity.importRunId) fail('GRH_CURATED_REPLACEMENT_RESULT_MISMATCH');
    const importRunId = created.id;
    await check('curated:run-created');
    for (const table of DELETE_ORDER) {
      const removed = await client.query(`/* grh-curated-replacement:delete:${table} */ DELETE FROM public.${table} WHERE import_run_id=$1::bigint`, [identity.importRunId]);
      if (removed.rowCount !== baseline.tables[table].length) fail('GRH_CURATED_REPLACEMENT_RESULT_MISMATCH');
      await check(`curated:deleted:${table}`);
    }
    const projection = next.projectTables(importRunId);
    for (const table of NAMES) {
      const columns = TABLES[table].columns.join(',');
      for (let start = 0; start < projection[table].length; start += 500) {
        const rows = projection[table].slice(start, start + 500);
        const inserted = await client.query(`/* grh-curated-replacement:insert:${table} */ INSERT INTO public.${table} (${columns})
          SELECT ${columns} FROM jsonb_populate_recordset(NULL::public.${table},$1::jsonb)`, [records(rows)]);
        if (inserted.rowCount !== rows.length) fail('GRH_CURATED_REPLACEMENT_RESULT_MISMATCH');
      }
      await check(`curated:inserted:${table}`);
    }
    const completed = await client.query(`/* grh-curated-replacement:complete-run */ UPDATE public.data_import_runs
      SET status='completed',completed_at=now(),table_counts=$2::jsonb,quality_flags=$3::jsonb
      WHERE id=$1::bigint AND status='running' AND completed_at IS NULL`,
    [importRunId, JSON.stringify(expected.tableCounts), JSON.stringify(expected.qualityFlags)]);
    if (completed.rowCount !== 1) fail('GRH_CURATED_REPLACEMENT_RESULT_MISMATCH');
    try { replay = await inspectCuratedReplayWithinTransaction(client, expected, next.projectTables); }
    catch { fail('GRH_CURATED_REPLACEMENT_RESULT_MISMATCH'); }
    if (replay.action !== 'noop' || replay.importRunId !== importRunId) fail('GRH_CURATED_REPLACEMENT_RESULT_MISMATCH');
    // Old import/batch metadata must still be intact after the replacement.
    await verifyBaseline(client, identity, baseline);
    await check('curated:verified');
    await client.query(`RELEASE SAVEPOINT ${SAVEPOINT}`);
    return { status: 'replaced_in_transaction', importRunId, previousImportRunId: identity.importRunId,
      previousBatchId: identity.batchId, rows: Object.fromEntries(NAMES.map(table => [table, projection[table].length])),
      committed: false, callerOwnedTransaction: true };
  } catch (error) {
    if (Object.hasOwn(MESSAGES, error?.code)) throw error;
    if (['55P03', '40P01', 'GRH_PUBLICATION_BUSY'].includes(error?.code)) fail('GRH_CURATED_REPLACEMENT_BUSY');
    fail('GRH_CURATED_REPLACEMENT_UNAVAILABLE');
  }
}
