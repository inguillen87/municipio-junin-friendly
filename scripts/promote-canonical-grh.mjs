import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { Client } from '@neondatabase/serverless';
import { directCanonicalDatabaseUrl } from './lib/canonical-import.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';
import { inspectCuratedReplayWithinTransaction } from './lib/rrhh-import-replay.mjs';
import { acquireGrhPublicationLocks } from './lib/grh-publication-lock.mjs';

const PROMOTION_URL = new URL('./canonical-promote-current-grh.sql', import.meta.url);
const TABLES = ['grh_employees', 'grh_absences', 'grh_leaves', 'grh_family', 'grh_catalog_rows'];
const SAVEPOINT = 'municontrol_canonical_grh_promotion';
const MESSAGES = Object.freeze({
  GRH_PROMOTION_INPUT_INVALID: 'La promoción requiere una corrida y una fuente verificadas explícitamente.',
  GRH_PROMOTION_TRANSACTION_REQUIRED: 'La promoción requiere una transacción controlada por quien la invoca.',
  GRH_PROMOTION_SOURCE_MISMATCH: 'La corrida o su procedencia no coincide con la fuente verificada.',
  GRH_PROMOTION_COHORT_MISMATCH: 'Las cinco tablas curadas no conservan íntegramente la corrida seleccionada.',
  GRH_PROMOTION_IDENTITY_CONFLICT: 'La identidad existente requiere revisión; no se reasigna ni sobrescribe.',
  GRH_PROMOTION_CONTRACT_CONFLICT: 'El contrato existente no conserva la misma persona y procedencia.',
  GRH_PROMOTION_CUTOFF_CONFLICT: 'El corte seleccionado colisiona con evidencia canónica ya conservada.',
  GRH_PROMOTION_STAGING_CONFLICT: 'La evidencia inmutable del lote no coincide con la corrida seleccionada.',
  GRH_PROMOTION_RESULT_MISMATCH: 'La promoción no produjo el conjunto canónico esperado.',
  GRH_PROMOTION_BUSY: 'Otra operación retiene los datos necesarios; reintentá la transacción completa.',
  GRH_PROMOTION_UNAVAILABLE: 'No se pudo verificar la promoción; quien controla la transacción debe revertirla.',
});
function fail(code) { throw Object.assign(new Error(MESSAGES[code]), { code }); }
export function safeCanonicalPromotionError(error) {
  const code = Object.hasOwn(MESSAGES, error?.code) ? error.code : 'GRH_PROMOTION_UNAVAILABLE';
  return { code, message: MESSAGES[code] };
}
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function one(result, fields = []) {
  if (!Array.isArray(result?.rows) || result.rows.length !== 1 || !result.rows[0]
    || fields.some(field => typeof result.rows[0][field] !== 'boolean')) fail('GRH_PROMOTION_UNAVAILABLE');
  return result.rows[0];
}
function count(value) { return Number.isSafeInteger(value) && value >= 0; }
function validateInput(importRunId, expected, verifiedProjection, checkpoint) {
  if (typeof importRunId !== 'string' || !/^[1-9][0-9]{0,18}$/.test(importRunId)
    || BigInt(importRunId) > 9223372036854775807n
    || expected?.sourceName !== 'grh_junin_curated' || expected?.sourceDatabase !== 'grh_junin'
    || typeof expected.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(expected.sourceSha256)
    || typeof expected.cutoff !== 'string' || !/^2026-08-06[ T](?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(expected.cutoff)
    || expected.qualityFlags?.profile !== 'grh-junin-2026-08-06'
    || expected.qualityFlags?.strictSnapshot !== true || expected.qualityFlags?.allOutputHashesVerified !== true
    || !/^[a-f0-9]{64}$/i.test(expected.qualityFlags?.manifestSha256 ?? '')
    || !expected.tableCounts || typeof expected.tableCounts !== 'object' || Array.isArray(expected.tableCounts)
    || typeof verifiedProjection !== 'function' || typeof checkpoint !== 'function') fail('GRH_PROMOTION_INPUT_INVALID');
}

const RUN_SQL = `/* grh-promotion:run */ SELECT id::text, source_name, upper(source_sha256) AS source_sha256,
  source_cutoff IS NOT DISTINCT FROM $2::timestamp AS cutoff_matches,
  status, completed_at IS NOT NULL AS completed, quality_flags, table_counts,
  md5('source_import_batch|GRH|' || upper(source_sha256))::uuid::text AS batch_id
  FROM public.data_import_runs WHERE id=$1::bigint FOR SHARE NOWAIT`;

const EXPECTED_PEOPLE = `WITH selected_source AS (
  SELECT source_cutoff AT TIME ZONE 'America/Argentina/Buenos_Aires' AS cutoff
  FROM public.data_import_runs WHERE id=$1::bigint
), people AS (
  SELECT DISTINCT ON (e.person_id) e.* FROM public.grh_employees e
  WHERE e.import_run_id=$1::bigint AND e.person_id IS NOT NULL
  ORDER BY e.person_id,e.activo DESC,e.fecha_egreso DESC NULLS FIRST,e.company_id,e.legajo
), expected_people AS (
  SELECT md5('person_identity|GRH|persona|' || p.person_id::text)::uuid AS id,
    CASE WHEN is_valid_cuil(p.cuil) THEN normalize_digits(p.cuil) END AS cuil,
    NULLIF(normalize_digits(p.dni),'') AS dni,NULLIF(btrim(p.nombre),'') AS full_name,
    CASE WHEN p.fecha_nacimiento BETWEEN DATE '1900-01-01' AND s.cutoff::date THEN p.fecha_nacimiento END AS birth_date,
    NULLIF(btrim(p.sexo),'') AS sex_code,
    CASE WHEN length(ltrim(normalize_digits(p.dni),'0')) BETWEEN 6 AND 8
      THEN ltrim(normalize_digits(p.dni),'0') END AS identity_master_dni,
    NULLIF(btrim(p.source_payload #>> '{identity,sexCode}'),'') AS identity_master_sex_code
  FROM people p CROSS JOIN selected_source s
)`;
const SOURCE_GUARDS_SQL = `/* grh-promotion:source-guards */ ${EXPECTED_PEOPLE}
SELECT
  NOT EXISTS (SELECT 1 FROM expected_people e JOIN public.person_identity p ON p.id=e.id
    -- Accept either complete established GRH projection, never a field-wise mixture.
    -- The identity master profile is defined by extract-personas-crosswalk.py;
    -- sexCode comes from the verified source payload, without label translation.
    WHERE (p.cuil,p.dni,p.full_name,p.birth_date,p.sex_code)
      IS DISTINCT FROM (e.cuil,e.dni,e.full_name,e.birth_date,e.sex_code)
      AND (p.cuil,p.dni,p.full_name,p.birth_date,p.sex_code)
      IS DISTINCT FROM (e.cuil,e.identity_master_dni,e.full_name,e.birth_date,e.identity_master_sex_code)) AS identity_matches,
  NOT EXISTS (SELECT 1 FROM public.grh_employees e JOIN public.employment_contract c
    ON c.id=md5('employment_contract|GRH|legajo|' || e.company_id::text || '|' || e.legajo)::uuid
      OR (c.legacy_company_id=e.company_id AND c.legacy_legajo=e.legajo)
    LEFT JOIN public.source_import_batch b ON b.id=c.source_batch_id
    WHERE e.import_run_id=$1::bigint AND (e.person_id IS NULL
      OR c.id IS DISTINCT FROM md5('employment_contract|GRH|legajo|' || e.company_id::text || '|' || e.legajo)::uuid
      OR c.person_id IS DISTINCT FROM md5('person_identity|GRH|persona|' || e.person_id::text)::uuid
      OR c.source_system<>'GRH' OR b.source_system IS DISTINCT FROM 'GRH'
      OR b.source_database IS DISTINCT FROM 'grh_junin' OR b.validation_state IS DISTINCT FROM 'published')) AS contracts_match,
  NOT EXISTS (SELECT 1 FROM public.grh_employees e JOIN public.employment_contract c
    ON c.legacy_company_id=e.company_id AND c.legacy_legajo=e.legajo
    JOIN public.source_import_batch b ON b.id=c.source_batch_id CROSS JOIN selected_source s
    WHERE e.import_run_id=$1::bigint AND c.source_batch_id<>$2::uuid AND b.source_cutoff>=s.cutoff) AS cutoffs_match,
  NOT EXISTS (SELECT 1 FROM public.employment_status_snapshot snapshot
    JOIN public.grh_employees e ON snapshot.employment_contract_id=
      md5('employment_contract|GRH|legajo|' || e.company_id::text || '|' || e.legajo)::uuid
    CROSS JOIN selected_source s WHERE e.import_run_id=$1::bigint
      AND snapshot.snapshot_date=s.cutoff::date AND snapshot.source_batch_id<>$2::uuid) AS status_day_matches,
  NOT EXISTS (SELECT 1 FROM public.person_identity_assertion a JOIN expected_people e ON e.id=a.person_id
    CROSS JOIN selected_source s WHERE a.source_system='GRH' AND a.source_entity='persona'
      AND a.valid_to IS NULL AND a.source_batch_id<>$2::uuid AND a.valid_from>=s.cutoff) AS assertion_cutoffs_match`;

const stageSources = [
  ["'legajo'", "jsonb_build_object('companyCode',company_id,'employeeNumber',legajo)::text", 'company_id,legajo', 'grh_employees'],
  ["'ausencia'", "jsonb_build_object('companyCode',company_id,'employeeNumber',legajo,'absenceDate',fecha)::text", 'company_id,legajo,fecha', 'grh_absences'],
  ["'licencia'", "jsonb_build_object('companyCode',company_id,'employeeNumber',legajo,'period',periodo,'startDate',fecha_inicio)::text", 'company_id,periodo,legajo,fecha_inicio', 'grh_leaves'],
  ["'familia'", 'family_id::text', 'family_id', 'grh_family'],
  ["'catalog:' || catalog", 'source_key', 'catalog,source_key', 'grh_catalog_rows'],
];
const STAGING_SQL = `/* grh-promotion:staging */ WITH expected AS MATERIALIZED (
  ${stageSources.map(([entity, key, order, table]) => `SELECT 'grh_junin'::text AS source_schema,(${entity})::text AS source_entity,
    ${key} AS source_id,row_number() OVER (ORDER BY ${order}) AS source_row_number,
    encode(digest(source_payload::text,'sha256'),'hex') AS source_row_sha256,source_payload
    FROM public.${table} WHERE import_run_id=$1::bigint`).join('\nUNION ALL\n')}
), actual AS MATERIALIZED (
  SELECT source_schema::text,source_entity::text,source_id::text,source_row_number,source_row_sha256::text,source_payload
  FROM public.source_staging_row WHERE batch_id=$2::uuid
    AND (source_entity IN ('legajo','ausencia','licencia','familia') OR source_entity LIKE 'catalog:%')
), difference AS (
  (SELECT * FROM actual EXCEPT ALL SELECT * FROM expected)
  UNION ALL (SELECT * FROM expected EXCEPT ALL SELECT * FROM actual)
)
SELECT (SELECT count(*)::int FROM actual) AS actual_count,
  (SELECT count(*)::int FROM expected) AS expected_count,NOT EXISTS (SELECT 1 FROM difference) AS exact`;
const BATCH_SQL = `/* grh-promotion:batch */ SELECT id::text,source_system,source_database,source_file_name,
  upper(source_sha256) AS source_sha256,legacy_import_run_id::text,
  source_cutoff IS NOT DISTINCT FROM ($3::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires') AS cutoff_matches,
  validation_state FROM public.source_import_batch
  WHERE id=$2::uuid OR (source_system='GRH' AND (source_sha256=$4 OR legacy_import_run_id=$1::bigint))
  ORDER BY id FOR SHARE NOWAIT`;
async function verifyBatch(client, importRunId, batchId, expected, required) {
  const result=await client.query(BATCH_SQL,[importRunId,batchId,expected.cutoff,expected.sourceSha256.toUpperCase()]);
  if (!Array.isArray(result?.rows) || result.rows.length>1 || (required && result.rows.length!==1)) fail('GRH_PROMOTION_SOURCE_MISMATCH');
  if (result.rows.some(row=>!row || row.id!==batchId || row.source_system!=='GRH'
    || row.source_database!==expected.sourceDatabase || row.source_file_name!==expected.sourceName
    || row.source_sha256!==expected.sourceSha256.toUpperCase() || row.legacy_import_run_id!==importRunId
    || row.cutoff_matches!==true || row.validation_state!=='published')) fail('GRH_PROMOTION_SOURCE_MISMATCH');
}
async function verifySources(client, importRunId, batchId) {
  const value=one(await client.query(SOURCE_GUARDS_SQL,[importRunId,batchId]),
    ['identity_matches','contracts_match','cutoffs_match','status_day_matches','assertion_cutoffs_match']);
  if (!value.identity_matches) fail('GRH_PROMOTION_IDENTITY_CONFLICT');
  if (!value.contracts_match) fail('GRH_PROMOTION_CONTRACT_CONFLICT');
  if (!value.cutoffs_match || !value.status_day_matches || !value.assertion_cutoffs_match) fail('GRH_PROMOTION_CUTOFF_CONFLICT');
}
async function verifyStaging(client, importRunId, batchId, allowEmpty) {
  const value=one(await client.query(STAGING_SQL,[importRunId,batchId]),['exact']);
  if (!count(value.actual_count) || !count(value.expected_count) || value.expected_count<1) fail('GRH_PROMOTION_UNAVAILABLE');
  if (!value.exact && !(allowEmpty && value.actual_count===0)) fail('GRH_PROMOTION_STAGING_CONFLICT');
  return value.expected_count;
}
const RESULT_SQL = `/* grh-promotion:result */ ${EXPECTED_PEOPLE}
SELECT (SELECT count(*)::int FROM expected_people) AS expected_people,
  (SELECT count(*)::int FROM expected_people e JOIN public.person_identity p ON p.id=e.id) AS canonical_people,
  (SELECT count(*)::int FROM public.grh_employees WHERE import_run_id=$1::bigint AND person_id IS NOT NULL) AS expected_contracts,
  (SELECT count(*)::int FROM public.grh_employees e JOIN public.employment_contract c
    ON c.id=md5('employment_contract|GRH|legajo|' || e.company_id::text || '|' || e.legajo)::uuid
      AND c.person_id=md5('person_identity|GRH|persona|' || e.person_id::text)::uuid
      AND c.source_system='GRH' AND c.source_batch_id=$2::uuid AND c.source_payload=e.source_payload
    WHERE e.import_run_id=$1::bigint AND e.person_id IS NOT NULL) AS canonical_contracts,
  NOT EXISTS (SELECT 1 FROM public.grh_employees e JOIN public.employment_contract c
    ON c.id=md5('employment_contract|GRH|legajo|' || e.company_id::text || '|' || e.legajo)::uuid
    CROSS JOIN selected_source s WHERE e.import_run_id=$1::bigint AND e.person_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.employment_status_snapshot snapshot
        WHERE snapshot.employment_contract_id=c.id AND snapshot.snapshot_date=s.cutoff::date
          AND snapshot.source_batch_id=$2::uuid AND snapshot.source_system='GRH'
          AND snapshot.administrative_status=CASE WHEN c.status IN ('active','inactive','state_error') THEN c.status ELSE 'unknown' END)) AS statuses_complete`;

/** Caller owns the transaction and must roll it back on any rejection, including checkpoint failures. */
export async function promoteCanonicalGrhWithinTransaction({client,importRunId,expectedSource,verifiedProjection,checkpoint=async()=>{}}) {
  validateInput(importRunId,expectedSource,verifiedProjection,checkpoint);
  if (!client || typeof client.query!=='function') fail('GRH_PROMOTION_INPUT_INVALID');
  try {
    try { await client.query(`SAVEPOINT ${SAVEPOINT}`); }
    catch (error) { if (error?.code==='25P01') fail('GRH_PROMOTION_TRANSACTION_REQUIRED'); throw error; }
    await acquireGrhPublicationLocks(client);
    await client.query(`LOCK TABLE ${TABLES.map(table=>`public.${table}`).join(', ')} IN SHARE MODE NOWAIT`);
    const run=one(await client.query(RUN_SQL,[importRunId,expectedSource.cutoff]),['cutoff_matches','completed']);
    const batchHash=createHash('md5').update('source_import_batch|GRH|'+expectedSource.sourceSha256.toUpperCase()).digest('hex');
    const expectedBatchId=[batchHash.slice(0,8),batchHash.slice(8,12),batchHash.slice(12,16),batchHash.slice(16,20),batchHash.slice(20)].join('-');
    if (run.id!==importRunId || run.source_name!==expectedSource.sourceName
      || run.source_sha256!==expectedSource.sourceSha256.toUpperCase() || !run.cutoff_matches || !run.completed || run.status!=='completed'
      || stable(run.quality_flags)!==stable(expectedSource.qualityFlags) || stable(run.table_counts)!==stable(expectedSource.tableCounts)
      || run.batch_id!==expectedBatchId) fail('GRH_PROMOTION_SOURCE_MISMATCH');
    const replay=await inspectCuratedReplayWithinTransaction(client,expectedSource,verifiedProjection);
    if (replay.action!=='noop' || replay.importRunId!==importRunId) fail('GRH_PROMOTION_COHORT_MISMATCH');
    const batchId=run.batch_id;
    await verifyBatch(client,importRunId,batchId,expectedSource,false);
    await client.query(`/* grh-promotion:lock-people */ SELECT 1 FROM public.person_identity p
      JOIN (SELECT DISTINCT md5('person_identity|GRH|persona|' || person_id::text)::uuid AS id
        FROM public.grh_employees WHERE import_run_id=$1::bigint AND person_id IS NOT NULL) selected ON selected.id=p.id
      ORDER BY p.id FOR UPDATE OF p NOWAIT`,[importRunId]);
    await client.query(`/* grh-promotion:lock-contracts */ SELECT 1 FROM public.employment_contract c
      JOIN public.grh_employees e ON c.legacy_company_id=e.company_id AND c.legacy_legajo=e.legajo
        OR c.id=md5('employment_contract|GRH|legajo|' || e.company_id::text || '|' || e.legajo)::uuid
      WHERE e.import_run_id=$1::bigint ORDER BY c.id FOR UPDATE OF c NOWAIT`,[importRunId]);
    await client.query(`/* grh-promotion:lock-statuses */ SELECT 1 FROM public.employment_status_snapshot s
      JOIN public.grh_employees e ON s.employment_contract_id=md5('employment_contract|GRH|legajo|' || e.company_id::text || '|' || e.legajo)::uuid
      WHERE e.import_run_id=$1::bigint ORDER BY s.employment_contract_id,s.snapshot_date FOR UPDATE OF s NOWAIT`,[importRunId]);
    await client.query(`/* grh-promotion:lock-assertions */ SELECT 1 FROM public.person_identity_assertion a
      JOIN (SELECT DISTINCT md5('person_identity|GRH|persona|' || person_id::text)::uuid AS id
        FROM public.grh_employees WHERE import_run_id=$1::bigint AND person_id IS NOT NULL) selected ON selected.id=a.person_id
      WHERE a.source_system='GRH' AND a.source_entity='persona' AND a.valid_to IS NULL
      ORDER BY a.id FOR UPDATE OF a NOWAIT`,[importRunId]);
    await client.query(`/* grh-promotion:lock-prior-batches */ SELECT 1 FROM public.source_import_batch b
      WHERE b.id IN (SELECT c.source_batch_id FROM public.employment_contract c
        JOIN public.grh_employees e ON c.legacy_company_id=e.company_id AND c.legacy_legajo=e.legajo
        WHERE e.import_run_id=$1::bigint)
      ORDER BY b.id FOR SHARE OF b NOWAIT`,[importRunId]);
    await verifySources(client,importRunId,batchId);
    await verifyStaging(client,importRunId,batchId,true);
    const statements=splitPostgresStatements(await readFile(PROMOTION_URL,'utf8'));
    if (statements.length!==16) fail('GRH_PROMOTION_UNAVAILABLE');
    await checkpoint('promotion:validated');
    for (let index=0;index<statements.length;index++) {
      await client.query("SELECT set_config('municontrol.promotion_import_run_id',$1,true)",[importRunId]);
      await client.query(statements[index]);
      if (index===5) {
        await verifyBatch(client,importRunId,batchId,expectedSource,true);
        await verifyStaging(client,importRunId,batchId,false);
        await checkpoint('promotion:staged');
      }
    }
    await checkpoint('promotion:written');
    await verifySources(client,importRunId,batchId);
    const stagedRows=await verifyStaging(client,importRunId,batchId,false);
    const result=one(await client.query(RESULT_SQL,[importRunId,batchId]),['statuses_complete']);
    if (!['expected_people','canonical_people','expected_contracts','canonical_contracts'].every(key=>count(result[key]))
      || result.expected_people<1 || result.expected_contracts<1 || result.expected_people!==result.canonical_people
      || result.expected_contracts!==result.canonical_contracts || !result.statuses_complete) fail('GRH_PROMOTION_RESULT_MISMATCH');
    await checkpoint('promotion:verified');
    await client.query(`RELEASE SAVEPOINT ${SAVEPOINT}`);
    return { status:'promoted_in_transaction',importRunId,batchId,sourceSha256:expectedSource.sourceSha256.toUpperCase(),
      stagedRows,people:result.canonical_people,contracts:result.canonical_contracts,committed:false,callerOwnedTransaction:true };
  } catch (error) {
    if (Object.hasOwn(MESSAGES,error?.code)) throw error;
    if (['55P03','40P01','GRH_PUBLICATION_BUSY'].includes(error?.code)) fail('GRH_PROMOTION_BUSY');
    if (/^RRHH_IMPORT_REPLAY_/.test(error?.code ?? '')) fail('GRH_PROMOTION_COHORT_MISMATCH');
    fail('GRH_PROMOTION_UNAVAILABLE');
  }
}
export function parsePromotionArgs(argv) {
  const args={},databaseArgs=[];
  for (const value of argv) {
    if (value==='--confirm-isolated-branch' || value.startsWith('--confirm-production-branch=')) {
      if (databaseArgs.length || value==='--confirm-production-branch=') fail('GRH_PROMOTION_INPUT_INVALID');
      databaseArgs.push(value);continue;
    }
    const match=value==='--apply' ? [value,'apply','true'] : /^--(import-run-id|sources-dir|apply)=(.+)$/.exec(value);
    if (!match || Object.hasOwn(args,match[1])) fail('GRH_PROMOTION_INPUT_INVALID');
    args[match[1]]=match[2];
  }
  if (!/^[1-9][0-9]{0,18}$/.test(args['import-run-id'] ?? '')
    || !path.isAbsolute(args['sources-dir'] ?? '') || ![undefined,'true','false'].includes(args.apply)) fail('GRH_PROMOTION_INPUT_INVALID');
  return { importRunId:args['import-run-id'],sourcesDir:args['sources-dir'],apply:args.apply==='true',databaseArgs };
}
async function main() {
  let client; let inTransaction=false; let commitAttempted=false; let committed=false;
  try {
    const args=parsePromotionArgs(process.argv.slice(2));
    const {readAndVerifySources,prepareCuratedImport}=await import('./import-rrhh-neon.mjs');
    const source=await readAndVerifySources(pathToFileURL(args.sourcesDir+path.sep));
    const prepared=prepareCuratedImport(source);
    client=new Client({connectionString:directCanonicalDatabaseUrl(args.databaseArgs)});
    await client.connect(); await client.query('BEGIN'); inTransaction=true;
    await client.query("SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='90s'");
    const evidence=await promoteCanonicalGrhWithinTransaction({client,importRunId:args.importRunId,
      expectedSource:prepared.expected,verifiedProjection:prepared.projectTables});
    if (args.apply) { commitAttempted=true; await client.query('COMMIT'); committed=true; }
    else await client.query('ROLLBACK');
    inTransaction=false;
    console.log(JSON.stringify({...evidence,committed,mode:args.apply?'apply':'rollback'},null,2));
  } catch (error) {
    if (inTransaction && !commitAttempted) await client.query('ROLLBACK').catch(()=>{});
    console.error(JSON.stringify({ok:false,...safeCanonicalPromotionError(error),
      committed:commitAttempted&&!committed?null:committed,requiresLedgerReconciliation:commitAttempted&&!committed}));
    process.exitCode=1;
  } finally { if (client) await client.end().catch(()=>{}); }
}
if (process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) await main();
