import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { Client } from '@neondatabase/serverless';
import { directCanonicalDatabaseUrl } from './lib/canonical-import.mjs';
import { splitPostgresStatements } from './lib/sql-statements.mjs';
import { inspectCuratedReplayWithinTransaction } from './lib/rrhh-import-replay.mjs';
import { acquireGrhPublicationLocks } from './lib/grh-publication-lock.mjs';
import { getGrhSourceProfile } from './lib/grh-source-profile.mjs';

const PROMOTION_URL = new URL('./canonical-promote-current-grh.sql', import.meta.url);
const TABLES = ['grh_employees', 'grh_absences', 'grh_leaves', 'grh_family', 'grh_catalog_rows'];
const SAVEPOINT = 'municontrol_canonical_grh_promotion';
const MESSAGES = Object.freeze({
  GRH_PROMOTION_INPUT_INVALID: 'La promoción requiere una corrida y una fuente verificadas explícitamente.',
  GRH_PROMOTION_TRANSACTION_REQUIRED: 'La promoción requiere una transacción controlada por quien la invoca.',
  GRH_PROMOTION_SOURCE_MISMATCH: 'La corrida o su procedencia no coincide con la fuente verificada.',
  GRH_PROMOTION_COHORT_MISMATCH: 'Las cinco tablas curadas no conservan íntegramente la corrida seleccionada.',
  GRH_PROMOTION_REVISION_MISMATCH: 'La revisión sellada no conserva la fuente, la base o la vinculación certificadas.',
  GRH_PROMOTION_PARTIAL_TARGET: 'El lote candidato conserva una promoción parcial; requiere revisión y no se reanuda automáticamente.',
  GRH_PROMOTION_IDENTITY_CONFLICT: 'La identidad existente requiere revisión; no se reasigna ni sobrescribe.',
  GRH_PROMOTION_CONTRACT_CONFLICT: 'El contrato existente no conserva la misma persona y procedencia.',
  GRH_PROMOTION_CUTOFF_CONFLICT: 'El corte seleccionado colisiona con evidencia canónica ya conservada.',
  GRH_PROMOTION_BASELINE_REQUIRED: 'La actualización requiere identificar explícitamente el respaldo canónico actual.',
  GRH_PROMOTION_BASELINE_MISMATCH: 'El respaldo canónico actual no coincide con la base esperada.',
  GRH_PROMOTION_DISAPPEARED_CONTRACT: 'Un legajo de la base no está en el candidato; requiere revisión antes de actualizar.',
  GRH_PROMOTION_REFERENCE_CONFLICT: 'Una referencia de origen no conserva su identidad, procedencia o período.',
  GRH_PROMOTION_ASSERTION_CONFLICT: 'La evidencia de identidad no conserva el perfil o la procedencia esperados.',
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
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
function batchUuid(sha) {
  const hash=createHash('md5').update('source_import_batch|GRH|'+sha.toUpperCase()).digest('hex');
  return [hash.slice(0,8),hash.slice(8,12),hash.slice(12,16),hash.slice(16,20),hash.slice(20)].join('-');
}
function profileCounts(profile) {
  const output=profile.curated.expectedOutputCounts;
  const names={sectors:'sectors',categories:'categories',unions:'unions',agreements:'agreements',
    absenceReasons:'absence_reasons',familyRelationships:'family_relationships',jobRoles:'job_roles',
    organizations:'organizations',exitReasons:'exit_reasons',employmentStatuses:'employment_statuses'};
  const catalogs=Object.fromEntries(Object.entries(names).map(([key,name])=>[name,output[key]]));
  const critical=Object.fromEntries(['employees','absences','leaves','familyMembers','sectors','categories','unions','agreements']
    .map(key=>[key,output[key]]));
  return {employees:output.employees,absences:output.absences,leaves:output.leaves,family:output.familyMembers,
    catalog_rows:Object.values(catalogs).reduce((sum,value)=>sum+value,0),catalogs,critical,source:output};
}
function validateInput(importRunId, expected, verifiedProjection, checkpoint) {
  if (typeof importRunId !== 'string' || !/^[1-9][0-9]{0,18}$/.test(importRunId)
    || BigInt(importRunId) > 9223372036854775807n
    || expected?.sourceName !== 'grh_junin_curated' || expected?.sourceDatabase !== 'grh_junin'
    || typeof expected.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(expected.sourceSha256)
    || typeof expected.cutoff !== 'string' || !/^20[0-9]{2}-[0-9]{2}-[0-9]{2}[ T](?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(expected.cutoff)
    || expected.qualityFlags?.strictSnapshot !== true || expected.qualityFlags?.allOutputHashesVerified !== true
    || !/^[a-f0-9]{64}$/i.test(expected.qualityFlags?.manifestSha256 ?? '')
    || !expected.tableCounts || typeof expected.tableCounts !== 'object' || Array.isArray(expected.tableCounts)
    || typeof verifiedProjection !== 'function' || typeof checkpoint !== 'function') fail('GRH_PROMOTION_INPUT_INVALID');
  let profile;
  try { profile=getGrhSourceProfile(expected.qualityFlags?.profile); }
  catch { fail('GRH_PROMOTION_INPUT_INVALID'); }
  if (expected.qualityFlags.profile!==profile.curated.profileId
    || expected.sourceSha256.toUpperCase()!==profile.source.sha256 || expected.sourceDatabase!==profile.source.database
    || expected.cutoff.replace(' ','T')!==profile.source.cutoff
    || stable(expected.tableCounts)!==stable(profileCounts(profile))) fail('GRH_PROMOTION_INPUT_INVALID');
}
function validateBaseline(value) {
  if(value===undefined || value===null) return null;
  if(!value || typeof value!=='object' || Array.isArray(value)
    || Object.keys(value).sort().join(',')!=='batchId,cutoff,importRunId,sourceDatabase,sourceSha256'
    || typeof value.importRunId!=='string' || !/^[1-9][0-9]{0,18}$/.test(value.importRunId)
    || BigInt(value.importRunId)>9223372036854775807n || !UUID.test(value.batchId??'')
    || typeof value.sourceSha256!=='string' || !/^[a-f0-9]{64}$/i.test(value.sourceSha256)
    || value.batchId!==batchUuid(value.sourceSha256) || value.sourceDatabase!=='grh_junin'
    || typeof value.cutoff!=='string' || !/^20[0-9]{2}-[0-9]{2}-[0-9]{2}[ T](?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/.test(value.cutoff)) fail('GRH_PROMOTION_INPUT_INVALID');
  return value;
}

const REVISION_RELATIONS=Object.freeze({
  grh_employees:'grh_source_employees_v1',grh_absences:'grh_source_absences_v1',
  grh_leaves:'grh_source_leaves_v1',grh_family:'grh_source_family_v1',
  grh_catalog_rows:'grh_source_catalog_rows_v1',source_staging_row:'grh_effective_source_staging_v1',
});
// This compiles only the six allowlisted FROM/JOIN relations in our own SQL. The SQL client remains
// untouched, and no skipped INSERT is represented as a successful database call.
function promotionSourceSql(sql,sourceRevision) {
  if(!sourceRevision) return sql;
  return sql.replace(/\b(FROM|JOIN) public\.(grh_employees|grh_absences|grh_leaves|grh_family|grh_catalog_rows|source_staging_row)\b/g,
    (_match,operation,table)=>`${operation} public.${REVISION_RELATIONS[table]}`);
}
function captureRevision(value,baseline,expected,verifiedProjection,importRunId) {
  if(value===undefined) return null;
  if(!value || typeof value!=='object' || Array.isArray(value)
    || Object.keys(value).sort().join(',')!=='curatedVersionId,expectedPayloadSha256'
    || !UUID.test(value.curatedVersionId??'') || !/^[a-f0-9]{64}$/.test(value.expectedPayloadSha256??'')
    || !baseline || baseline.importRunId===importRunId) fail('GRH_PROMOTION_INPUT_INVALID');
  let parameters;
  try {
    const projected=verifiedProjection(importRunId);
    const counts=[expected.tableCounts.employees,expected.tableCounts.absences,expected.tableCounts.leaves,
      expected.tableCounts.family,expected.tableCounts.catalog_rows];
    parameters=TABLES.map((table,index)=>{
      if(!Array.isArray(projected?.[table]) || projected[table].length!==counts[index]) fail('GRH_PROMOTION_COHORT_MISMATCH');
      return JSON.stringify(projected[table].map(row=>({...row,source_payload:JSON.parse(row.source_payload)})));
    });
  } catch(error) {
    if(Object.hasOwn(MESSAGES,error?.code)) throw error;
    fail('GRH_PROMOTION_INPUT_INVALID');
  }
  return {sourceRevision:Object.freeze({...value}),parameters};
}
const REVISION_SQL=`/* grh-promotion:revision */ SELECT v.id::text
  FROM public.grh_curated_source_version v
  JOIN public.grh_curated_source_version_seal seal ON seal.version_id=v.id
  JOIN public.grh_core_source_version core ON core.id=v.core_version_id
  JOIN public.source_import_batch batch ON batch.id=v.source_batch_id
  JOIN public.platform_tenant_source_binding binding ON binding.id=v.source_binding_id AND binding.tenant_id=v.tenant_id
  JOIN public.tenant_identity_policy policy ON policy.tenant_id=v.tenant_id AND policy.certified_source_binding_id=binding.id
  WHERE v.id=$1::uuid AND v.payload_sha256=$2 AND v.import_run_id=$3::bigint AND v.source_batch_id=$4::uuid
    AND v.baseline_batch_id=$5::uuid AND v.baseline_import_run_id=$6::bigint
    AND v.candidate_expected=$7::jsonb AND v.source_sha256=lower($8)
    AND v.source_cutoff=$9::timestamp AND v.source_database=$10
    AND v.baseline_source_sha256=lower($11) AND v.baseline_cutoff=$12::timestamp
    AND v.manifest_sha256=lower($13) AND binding.verified AND policy.tenant_data_plane_ready
    AND batch.source_row_count IS NULL AND batch.manifest=jsonb_build_object(
      'legacyTableCounts',v.candidate_expected->'tableCounts','legacyQualityFlags',v.candidate_expected->'qualityFlags',
      'promotionProfile','explicit-curated-grh-v2')
    AND binding.source_system='GRH' AND binding.source_database=v.source_database AND binding.source_company_id=v.source_company_id
    AND core.tenant_id=v.tenant_id AND core.source_binding_id=v.source_binding_id
    AND core.baseline_batch_id=v.baseline_batch_id AND core.baseline_import_run_id=v.baseline_import_run_id
    AND core.source_sha256=v.source_sha256 AND core.baseline_source_sha256=v.baseline_source_sha256
    AND core.source_cutoff=v.source_cutoff AND core.baseline_cutoff=v.baseline_cutoff
  FOR SHARE OF v,seal,core,batch,binding,policy NOWAIT`;
const REVISION_COHORT_SQL='/* grh-promotion:revision-cohort */ WITH '+TABLES.map((table,index)=>`${table}_expected AS MATERIALIZED (
  SELECT * FROM jsonb_populate_recordset(NULL::public.${table},$${index+1}::jsonb)
), ${table}_actual AS MATERIALIZED (
  SELECT * FROM public.${REVISION_RELATIONS[table]} WHERE import_run_id=$6::bigint
), ${table}_difference AS (
  (SELECT * FROM ${table}_actual EXCEPT ALL SELECT * FROM ${table}_expected)
  UNION ALL (SELECT * FROM ${table}_expected EXCEPT ALL SELECT * FROM ${table}_actual)
)`).join(',\n')+'\nSELECT '+TABLES.map(table=>`NOT EXISTS(SELECT 1 FROM ${table}_difference) AS ${table}`).join(',');
async function verifyRevision(client,revision,parameters,importRunId,batchId,baseline,expected) {
  const result=await client.query(REVISION_SQL,[revision.curatedVersionId,revision.expectedPayloadSha256,importRunId,batchId,
    baseline.batchId,baseline.importRunId,JSON.stringify(expected),expected.sourceSha256,expected.cutoff,expected.sourceDatabase,
    baseline.sourceSha256,baseline.cutoff,expected.qualityFlags.manifestSha256]);
  if(result.rows?.length!==1 || result.rows[0].id!==revision.curatedVersionId) fail('GRH_PROMOTION_REVISION_MISMATCH');
  for(const entity of TABLES) await client.query('SELECT public.grh_curated_source_version_assert_v1($1::uuid,$2::text)',[revision.curatedVersionId,entity]);
  const exact=one(await client.query(REVISION_COHORT_SQL,[...parameters,importRunId]),TABLES);
  if(TABLES.some(table=>!exact[table])) fail('GRH_PROMOTION_COHORT_MISMATCH');
}
async function inspectRevisionTarget(client,importRunId,batchId) {
  const value=one(await client.query(`/* grh-promotion:revision-target */ WITH expected AS (
    SELECT md5('employment_contract|GRH|legajo|'||company_id::text||'|'||legajo)::uuid AS id
    FROM public.grh_source_employees_v1 WHERE import_run_id=$1::bigint AND person_id IS NOT NULL
  ) SELECT (SELECT count(*)::int FROM expected) AS expected_count,
    (SELECT count(*)::int FROM public.employment_contract WHERE source_batch_id=$2::uuid) AS target_count,
    (SELECT count(*)::int FROM expected e JOIN public.employment_contract c ON c.id=e.id AND c.source_batch_id=$2::uuid) AS matched_count,
    (EXISTS(SELECT 1 FROM public.source_xref WHERE source_batch_id=$2::uuid)
      OR EXISTS(SELECT 1 FROM public.person_identity_assertion WHERE source_batch_id=$2::uuid)
      OR EXISTS(SELECT 1 FROM public.employment_status_snapshot WHERE source_batch_id=$2::uuid)
      OR EXISTS(SELECT 1 FROM public.data_quality_issue WHERE source_batch_id=$2::uuid)) AS has_canonical_evidence`,
  [importRunId,batchId]),['has_canonical_evidence']);
  if(!['expected_count','target_count','matched_count'].every(key=>count(value[key])) || value.expected_count<1) fail('GRH_PROMOTION_UNAVAILABLE');
  if(value.target_count===0) {
    if(value.has_canonical_evidence) fail('GRH_PROMOTION_PARTIAL_TARGET');
    return false;
  }
  if(value.target_count!==value.expected_count || value.matched_count!==value.expected_count) fail('GRH_PROMOTION_PARTIAL_TARGET');
  return true;
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
    p.person_id::text AS source_id,p.cuil AS raw_cuil,p.dni AS raw_dni,p.nombre AS raw_full_name,
    p.fecha_nacimiento::text AS raw_birth_date,
    COALESCE(p.source_payload #>> '{identity,sexCode}',p.sexo) AS raw_sex_code,
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
  validation_state,manifest->>'promotionProfile' AS promotion_profile FROM public.source_import_batch
  WHERE id=$2::uuid OR (source_system='GRH' AND (source_sha256=$4 OR legacy_import_run_id=$1::bigint))
  ORDER BY id FOR SHARE NOWAIT`;
async function verifyBatch(client, importRunId, batchId, expected, required) {
  const result=await client.query(BATCH_SQL,[importRunId,batchId,expected.cutoff,expected.sourceSha256.toUpperCase()]);
  if (!Array.isArray(result?.rows) || result.rows.length>1 || (required && result.rows.length!==1)) fail('GRH_PROMOTION_SOURCE_MISMATCH');
  if (result.rows.some(row=>!row || row.id!==batchId || row.source_system!=='GRH'
    || row.source_database!==expected.sourceDatabase || row.source_file_name!==expected.sourceName
    || row.source_sha256!==expected.sourceSha256.toUpperCase() || row.legacy_import_run_id!==importRunId
    || row.cutoff_matches!==true || row.validation_state!=='published')) fail('GRH_PROMOTION_SOURCE_MISMATCH');
  return {exists:result.rows.length===1,promotionProfile:result.rows[0]?.promotion_profile??null};
}
const SELECTED_REFERENCES=`WITH selected_refs AS (
  SELECT DISTINCT 'persona'::text AS source_entity,person_id::text AS source_id,
    'person_identity'::text AS canonical_entity,md5('person_identity|GRH|persona|'||person_id::text)::uuid AS canonical_id
  FROM public.grh_employees WHERE import_run_id=$1::bigint AND person_id IS NOT NULL
  UNION ALL SELECT 'legajo',jsonb_build_object('companyCode',company_id,'employeeNumber',legajo)::text,
    'employment_contract',md5('employment_contract|GRH|legajo|'||company_id::text||'|'||legajo)::uuid
  FROM public.grh_employees WHERE import_run_id=$1::bigint AND person_id IS NOT NULL
)`;
async function verifyBaseline(client,baseline,expected,batchId,targetExists) {
  if(!baseline) { if(!targetExists) fail('GRH_PROMOTION_BASELINE_REQUIRED'); return; }
  const value=one(await client.query(`/* grh-promotion:baseline */ SELECT
    b.source_system='GRH' AND b.source_database=$3 AND upper(b.source_sha256)=upper($4)
    AND b.validation_state='published' AND b.legacy_import_run_id=$2::bigint
    AND r.source_name='grh_junin_curated' AND r.status='completed' AND r.completed_at IS NOT NULL
    AND upper(r.source_sha256)=upper($4) AND r.source_cutoff=$5::timestamp
    AND b.source_cutoff=($5::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires') AS exact,
    r.quality_flags->>'profile' AS profile
    FROM public.source_import_batch b JOIN public.data_import_runs r ON r.id=b.legacy_import_run_id
    WHERE b.id=$1::uuid FOR SHARE OF b,r NOWAIT`,
  [baseline.batchId,baseline.importRunId,baseline.sourceDatabase,baseline.sourceSha256,baseline.cutoff]),['exact']);
  let profile; try {profile=getGrhSourceProfile(value.profile);} catch {fail('GRH_PROMOTION_BASELINE_MISMATCH');}
  if(!value.exact || profile.source.sha256!==baseline.sourceSha256.toUpperCase()
    || profile.source.cutoff!==baseline.cutoff.replace(' ','T') || profile.source.database!==baseline.sourceDatabase
    || (baseline.batchId!==batchId && baseline.cutoff.replace(' ','T')>=expected.cutoff.replace(' ','T'))
    || (baseline.batchId===batchId && !targetExists)) fail('GRH_PROMOTION_BASELINE_MISMATCH');
}
async function verifyTransition(client,importRunId,batchId,baseline,targetExists,sourceRevision) {
  const value=one(await client.query(promotionSourceSql(`/* grh-promotion:transition */ WITH selected_employee_keys AS MATERIALIZED (
    SELECT company_id,legajo FROM public.grh_employees WHERE import_run_id=$1::bigint
  ), baseline_snapshots AS MATERIALIZED (
    SELECT s.source_id,count(*) AS rows,
      bool_and(s.source_schema='grh_junin' AND s.source_row_sha256=encode(digest(s.source_payload::text,'sha256'),'hex')) AS metadata_exact,
      jsonb_agg(s.source_payload)->0 AS source_payload
    FROM public.source_staging_row s WHERE s.batch_id=$3::uuid AND s.source_entity='legajo'
    GROUP BY s.source_id
  ) SELECT
    NOT EXISTS (SELECT 1 FROM public.employment_contract c JOIN selected_employee_keys e
      ON e.company_id=c.legacy_company_id AND e.legajo=c.legacy_legajo
      WHERE c.source_batch_id<>$2::uuid
        AND ($4::boolean OR $3::uuid IS NULL OR c.source_batch_id<>$3::uuid)) AS cohort_matches,
    NOT EXISTS (SELECT 1 FROM public.employment_contract c WHERE c.source_system='GRH'
      AND c.source_batch_id=$3::uuid AND NOT EXISTS (SELECT 1 FROM selected_employee_keys e
        WHERE e.company_id=c.legacy_company_id AND e.legajo=c.legacy_legajo)) AS no_disappeared_contracts,
    NOT EXISTS (SELECT 1 FROM public.employment_contract c LEFT JOIN baseline_snapshots s
      ON s.source_id=jsonb_build_object('companyCode',c.legacy_company_id,'employeeNumber',c.legacy_legajo)::text
      WHERE c.source_system='GRH' AND c.source_batch_id=$3::uuid AND (s.rows IS DISTINCT FROM 1::bigint
        OR s.metadata_exact IS DISTINCT FROM true OR s.source_payload IS DISTINCT FROM c.source_payload)) AS baseline_snapshots_match`,sourceRevision),
  [importRunId,batchId,baseline?.batchId??null,targetExists]),['cohort_matches','no_disappeared_contracts','baseline_snapshots_match']);
  if(!value.cohort_matches) fail('GRH_PROMOTION_BASELINE_MISMATCH');
  if(!value.no_disappeared_contracts) fail('GRH_PROMOTION_DISAPPEARED_CONTRACT');
  if(!value.baseline_snapshots_match) fail('GRH_PROMOTION_STAGING_CONFLICT');
}
async function verifyReferences(client,importRunId,batchId,baseline,required=false,sourceRevision) {
  const value=one(await client.query(promotionSourceSql(`/* grh-promotion:references */ ${SELECTED_REFERENCES}
  SELECT NOT EXISTS (SELECT 1 FROM selected_refs e JOIN public.source_xref x
    ON x.source_system='GRH' AND x.source_entity=e.source_entity AND x.source_id=e.source_id AND x.valid_to IS NULL
    LEFT JOIN public.source_import_batch b ON b.id=x.source_batch_id
    WHERE x.canonical_entity<>e.canonical_entity OR x.canonical_id<>e.canonical_id
      OR b.source_system IS DISTINCT FROM 'GRH' OR b.source_database IS DISTINCT FROM 'grh_junin'
      OR b.validation_state IS DISTINCT FROM 'published' OR x.valid_from IS DISTINCT FROM b.source_cutoff
      OR (x.source_batch_id<>$2::uuid AND ($4::boolean OR $3::uuid IS NULL OR x.source_batch_id<>$3::uuid))) AS exact,
    NOT EXISTS (SELECT 1 FROM selected_refs e WHERE NOT EXISTS (SELECT 1 FROM public.source_xref x
      WHERE x.source_system='GRH' AND x.source_entity=e.source_entity AND x.source_id=e.source_id
        AND x.canonical_entity=e.canonical_entity AND x.canonical_id=e.canonical_id
        AND x.valid_to IS NULL AND x.source_batch_id=$2::uuid)) AS complete`,sourceRevision),
  [importRunId,batchId,baseline?.batchId??null,required]),['exact','complete']);
  if(!value.exact || (required && !value.complete)) fail('GRH_PROMOTION_REFERENCE_CONFLICT');
}
async function verifyAssertions(client,importRunId,batchId,baseline,exactNewProfile=false,after=false,sourceRevision) {
  const value=one(await client.query(promotionSourceSql(`/* grh-promotion:assertions */ ${EXPECTED_PEOPLE}, expected_natural AS (
    SELECT e.id,e.source_id,a.attribute_name,to_jsonb(a.raw_value) AS raw_value,
      a.normalized_value,a.normalized_value IS NOT NULL AS eligible
    FROM expected_people e JOIN public.person_identity p ON p.id=e.id
    CROSS JOIN LATERAL (VALUES ('cuil',e.raw_cuil,p.cuil::text),('dni',e.raw_dni,p.dni::text),
      ('full_name',e.raw_full_name,p.full_name::text),('birth_date',e.raw_birth_date,p.birth_date::text),
      ('sex_code',e.raw_sex_code,p.sex_code::text)) a(attribute_name,raw_value,normalized_value)
    WHERE a.raw_value IS NOT NULL
  ), actual_natural AS (
    SELECT a.person_id AS id,a.source_id::text,a.attribute_name::text,a.raw_value,a.normalized_value,
      a.eligible_for_promotion AS eligible
    FROM public.person_identity_assertion a JOIN expected_people e ON e.id=a.person_id
    WHERE a.source_system='GRH' AND a.source_entity='persona' AND a.source_batch_id=$2::uuid
      AND a.valid_to IS NULL AND a.attribute_name IN ('cuil','dni','full_name','birth_date','sex_code')
  ), difference AS (
    (SELECT * FROM expected_natural EXCEPT ALL SELECT * FROM actual_natural)
    UNION ALL (SELECT * FROM actual_natural EXCEPT ALL SELECT * FROM expected_natural)
  ) SELECT NOT EXISTS (SELECT 1 FROM public.person_identity_assertion a JOIN expected_people e ON e.id=a.person_id
    LEFT JOIN public.source_import_batch b ON b.id=a.source_batch_id
    WHERE a.source_system='GRH' AND a.source_entity='persona' AND a.valid_to IS NULL AND (
      a.source_id<>e.source_id OR b.source_system IS DISTINCT FROM 'GRH'
      OR b.source_database IS DISTINCT FROM 'grh_junin' OR b.validation_state IS DISTINCT FROM 'published'
      OR a.valid_from IS DISTINCT FROM b.source_cutoff
      OR (a.source_batch_id<>$2::uuid AND ($4::boolean OR $3::uuid IS NULL OR a.source_batch_id<>$3::uuid)))) AS lineage_matches,
    NOT EXISTS (SELECT 1 FROM difference) AND NOT EXISTS (
      SELECT 1 FROM public.person_identity_assertion a JOIN expected_people e ON e.id=a.person_id
      WHERE a.source_system='GRH' AND a.source_entity='persona' AND a.source_batch_id=$2::uuid
        AND a.valid_to IS NULL AND a.attribute_name IN ('cuil','dni','full_name','birth_date','sex_code')
        AND a.preferred IS DISTINCT FROM a.eligible_for_promotion) AS profile_matches`,sourceRevision),
  [importRunId,batchId,baseline?.batchId??null,after]),['lineage_matches','profile_matches']);
  if(!value.lineage_matches || (exactNewProfile && !value.profile_matches)) fail('GRH_PROMOTION_ASSERTION_CONFLICT');
}
async function verifySources(client, importRunId, batchId,sourceRevision) {
  const value=one(await client.query(promotionSourceSql(SOURCE_GUARDS_SQL,sourceRevision),[importRunId,batchId]),
    ['identity_matches','contracts_match','cutoffs_match','status_day_matches','assertion_cutoffs_match']);
  if (!value.identity_matches) fail('GRH_PROMOTION_IDENTITY_CONFLICT');
  if (!value.contracts_match) fail('GRH_PROMOTION_CONTRACT_CONFLICT');
  if (!value.cutoffs_match || !value.status_day_matches || !value.assertion_cutoffs_match) fail('GRH_PROMOTION_CUTOFF_CONFLICT');
}
async function verifyStaging(client, importRunId, batchId, allowEmpty,sourceRevision) {
  const value=one(await client.query(promotionSourceSql(STAGING_SQL,sourceRevision),[importRunId,batchId]),['exact']);
  if (!count(value.actual_count) || !count(value.expected_count) || value.expected_count<1) fail('GRH_PROMOTION_UNAVAILABLE');
  if (!value.exact && !(allowEmpty && value.actual_count===0)) fail('GRH_PROMOTION_STAGING_CONFLICT');
  return value.expected_count;
}
/** Read-only verification; the caller owns transaction, source locks and rollback. */
export async function verifyCanonicalGrhStagingWithinTransaction(client, importRunId, batchId) {
  if (!client || typeof client.query!=='function' || typeof importRunId!=='string'
    || !/^[1-9][0-9]{0,18}$/.test(importRunId) || BigInt(importRunId)>9223372036854775807n
    || typeof batchId!=='string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(batchId)) fail('GRH_PROMOTION_INPUT_INVALID');
  try {
    await client.query('SAVEPOINT grh_canonical_staging_verification');
    const expectedCount=await verifyStaging(client,importRunId,batchId,false);
    await client.query('RELEASE SAVEPOINT grh_canonical_staging_verification');
    return expectedCount;
  } catch(error) {
    if(Object.hasOwn(MESSAGES,error?.code)) throw error;
    if(error?.code==='25P01') fail('GRH_PROMOTION_TRANSACTION_REQUIRED');
    fail('GRH_PROMOTION_UNAVAILABLE');
  }
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
export async function promoteCanonicalGrhWithinTransaction({client,importRunId,expectedSource,expectedBaseline,verifiedProjection,sourceRevision,checkpoint=async()=>{}}) {
  validateInput(importRunId,expectedSource,verifiedProjection,checkpoint);
  expectedSource=structuredClone(expectedSource);
  const baseline=structuredClone(validateBaseline(expectedBaseline));
  const capturedRevision=captureRevision(sourceRevision,baseline,expectedSource,verifiedProjection,importRunId);
  sourceRevision=capturedRevision?.sourceRevision;
  if (!client || typeof client.query!=='function') fail('GRH_PROMOTION_INPUT_INVALID');
  try {
    try { await client.query(`SAVEPOINT ${SAVEPOINT}`); }
    catch (error) { if (error?.code==='25P01') fail('GRH_PROMOTION_TRANSACTION_REQUIRED'); throw error; }
    await acquireGrhPublicationLocks(client);
    await client.query(`LOCK TABLE ${TABLES.map(table=>`public.${table}`).join(', ')} IN SHARE MODE NOWAIT`);
    const run=one(await client.query(RUN_SQL,[importRunId,expectedSource.cutoff]),['cutoff_matches','completed']);
    const expectedBatchId=batchUuid(expectedSource.sourceSha256);
    if (run.id!==importRunId || run.source_name!==expectedSource.sourceName
      || run.source_sha256!==expectedSource.sourceSha256.toUpperCase() || !run.cutoff_matches || !run.completed || run.status!=='completed'
      || stable(run.quality_flags)!==stable(expectedSource.qualityFlags) || stable(run.table_counts)!==stable(expectedSource.tableCounts)
      || run.batch_id!==expectedBatchId) fail('GRH_PROMOTION_SOURCE_MISMATCH');
    const batchId=run.batch_id;
    if(sourceRevision) {
      await verifyRevision(client,sourceRevision,capturedRevision.parameters,importRunId,batchId,baseline,expectedSource);
    } else {
      const replay=await inspectCuratedReplayWithinTransaction(client,expectedSource,verifiedProjection);
      if(replay.action!=='noop' || replay.importRunId!==importRunId) fail('GRH_PROMOTION_COHORT_MISMATCH');
    }
    const target=await verifyBatch(client,importRunId,batchId,expectedSource,Boolean(sourceRevision));
    if(sourceRevision && target.promotionProfile!=='explicit-curated-grh-v2') fail('GRH_PROMOTION_REVISION_MISMATCH');
    // A sealed revision prepares real metadata before promotion. Only a complete
    // canonical cohort, never metadata alone, can be treated as a promoted replay.
    let targetExists=sourceRevision?false:target.exists;
    if(!sourceRevision) await verifyBaseline(client,baseline,expectedSource,batchId,targetExists);
    await client.query(promotionSourceSql(`/* grh-promotion:lock-people */ SELECT 1 FROM public.person_identity p
      JOIN (SELECT DISTINCT md5('person_identity|GRH|persona|' || person_id::text)::uuid AS id
        FROM public.grh_employees WHERE import_run_id=$1::bigint AND person_id IS NOT NULL) selected ON selected.id=p.id
      ORDER BY p.id FOR UPDATE OF p NOWAIT`,sourceRevision),[importRunId]);
    await client.query(promotionSourceSql(`/* grh-promotion:lock-contracts */ SELECT 1 FROM public.employment_contract c
      WHERE c.source_batch_id=$2::uuid OR EXISTS (SELECT 1 FROM public.grh_employees e
        WHERE e.import_run_id=$1::bigint AND ((c.legacy_company_id=e.company_id AND c.legacy_legajo=e.legajo)
          OR c.id=md5('employment_contract|GRH|legajo|' || e.company_id::text || '|' || e.legajo)::uuid))
      ORDER BY c.id FOR UPDATE OF c NOWAIT`,sourceRevision),[importRunId,baseline?.batchId??null]);
    await client.query(promotionSourceSql(`/* grh-promotion:lock-references */ ${SELECTED_REFERENCES}
      SELECT 1 FROM public.source_xref x JOIN selected_refs e ON x.source_system='GRH'
        AND x.source_entity=e.source_entity AND x.source_id=e.source_id
      WHERE x.valid_to IS NULL ORDER BY x.source_entity,x.source_id,x.valid_from FOR UPDATE OF x NOWAIT`,sourceRevision),[importRunId]);
    await client.query(promotionSourceSql(`/* grh-promotion:lock-statuses */ SELECT 1 FROM public.employment_status_snapshot s
      JOIN public.grh_employees e ON s.employment_contract_id=md5('employment_contract|GRH|legajo|' || e.company_id::text || '|' || e.legajo)::uuid
      WHERE e.import_run_id=$1::bigint ORDER BY s.employment_contract_id,s.snapshot_date FOR UPDATE OF s NOWAIT`,sourceRevision),[importRunId]);
    await client.query(promotionSourceSql(`/* grh-promotion:lock-assertions */ SELECT 1 FROM public.person_identity_assertion a
      JOIN (SELECT DISTINCT md5('person_identity|GRH|persona|' || person_id::text)::uuid AS id
        FROM public.grh_employees WHERE import_run_id=$1::bigint AND person_id IS NOT NULL) selected ON selected.id=a.person_id
      WHERE a.source_system='GRH' AND a.source_entity='persona' AND a.valid_to IS NULL
      ORDER BY a.id FOR UPDATE OF a NOWAIT`,sourceRevision),[importRunId]);
    await client.query(promotionSourceSql(`/* grh-promotion:lock-prior-batches */ SELECT 1 FROM public.source_import_batch b
      WHERE b.id IN (SELECT c.source_batch_id FROM public.employment_contract c
        JOIN public.grh_employees e ON c.legacy_company_id=e.company_id AND c.legacy_legajo=e.legajo
        WHERE e.import_run_id=$1::bigint)
      ORDER BY b.id FOR SHARE OF b NOWAIT`,sourceRevision),[importRunId]);
    if(sourceRevision) {
      targetExists=await inspectRevisionTarget(client,importRunId,batchId);
      await verifyBaseline(client,baseline,expectedSource,batchId,targetExists);
    }
    await verifyTransition(client,importRunId,batchId,baseline,targetExists,sourceRevision);
    await verifySources(client,importRunId,batchId,sourceRevision);
    await verifyReferences(client,importRunId,batchId,baseline,Boolean(sourceRevision && targetExists),sourceRevision);
    await verifyAssertions(client,importRunId,batchId,baseline,Boolean(sourceRevision && targetExists),Boolean(sourceRevision && targetExists),sourceRevision);
    await verifyStaging(client,importRunId,batchId,!sourceRevision,sourceRevision);
    if(sourceRevision && targetExists) {
      const before=one(await client.query(promotionSourceSql(RESULT_SQL,sourceRevision),[importRunId,batchId]),['statuses_complete']);
      if(!['expected_people','canonical_people','expected_contracts','canonical_contracts'].every(key=>count(before[key]))
        || before.expected_people<1 || before.expected_contracts<1 || before.expected_people!==before.canonical_people
        || before.expected_contracts!==before.canonical_contracts || !before.statuses_complete) fail('GRH_PROMOTION_PARTIAL_TARGET');
    }
    const statements=splitPostgresStatements(await readFile(PROMOTION_URL,'utf8'));
    if (statements.length!==17 || statements.filter(statement=>statement.includes('/* promotion-materialize-staging */')).length!==5
      || statements.slice(1,6).some(statement=>!statement.includes('/* promotion-materialize-staging */'))) fail('GRH_PROMOTION_UNAVAILABLE');
    await checkpoint('promotion:validated');
    for (let index=0;index<statements.length;index++) {
      // Virtual staging is already sealed and compared in both directions above.
      // Execute no physical staging INSERT at all for this explicit revision.
      if(!(sourceRevision && statements[index].includes('/* promotion-materialize-staging */'))) {
        await client.query("SELECT set_config('municontrol.promotion_import_run_id',$1,true)",[importRunId]);
        await client.query(promotionSourceSql(statements[index],sourceRevision));
      }
      if (index===5) {
        await verifyBatch(client,importRunId,batchId,expectedSource,true);
        await verifyStaging(client,importRunId,batchId,false,sourceRevision);
        await checkpoint('promotion:staged');
      }
    }
    await checkpoint('promotion:written');
    await verifySources(client,importRunId,batchId,sourceRevision);
    await verifyReferences(client,importRunId,batchId,baseline,true,sourceRevision);
    await verifyAssertions(client,importRunId,batchId,baseline,!targetExists || target.promotionProfile==='explicit-curated-grh-v2',true,sourceRevision);
    const stagedRows=await verifyStaging(client,importRunId,batchId,false,sourceRevision);
    const result=one(await client.query(promotionSourceSql(RESULT_SQL,sourceRevision),[importRunId,batchId]),['statuses_complete']);
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
