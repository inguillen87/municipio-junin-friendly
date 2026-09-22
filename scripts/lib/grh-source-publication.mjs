import { createHash } from 'node:crypto';
import { stableJson } from './canonical-import.mjs';
import { acquireGrhPublicationLocks } from './grh-publication-lock.mjs';
import { readSourceCapacity } from './grh-source-capacity.mjs';
import { GRH_VERSION_STORAGE_BUDGET, importGrhSourceVersionWithinTransaction } from './grh-core-source-version.mjs';
import { importGrhCuratedSourceVersionWithinTransaction, inspectGrhSourceVersionPairWithinTransaction } from './grh-curated-source-version.mjs';
import { promoteCanonicalGrhWithinTransaction } from '../promote-canonical-grh.mjs';
import { importGrhOperationalSnapshotWithinTransaction } from '../import-grh-core-canonical.mjs';
import { validateSchoolingRecoveryPayload, importSchoolingSourceWithinTransaction } from '../import-schooling-source.mjs';

const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{64}$/;
const fail = code => { throw Object.assign(new Error(code), { code }); };
const hash = value => createHash('sha256').update(stableJson(value)).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));
const TABLES = Object.freeze(['native_employee_registration','employee_family_member','employee_family_member_event',
  'payroll_fixed_assignment','payroll_fixed_change','payroll_fixed_event','payroll_fixed_novelty','payroll_fixed_novelty_event',
  'payroll_novelty_batch','payroll_novelty_row','payroll_novelty_issue','payroll_novelty_event',
  'school_certificate','school_certificate_blob','school_certificate_event','school_certificate_record','school_certificate_record_event',
  'action_case','action_case_event']);

function preparedSnapshot(value) {
  if (typeof value?.projectTables !== 'function') fail('GRH_PUBLICATION_INPUT_INVALID');
  const expected = copy(value.expected), tables = copy(value.projectTables('1'));
  return {expected, projectTables: id => Object.fromEntries(Object.entries(tables)
    .map(([table, rows]) => [table, rows.map(row => ({...row,import_run_id:id}))]))};
}

/** Identity of the reviewed package is independent of target-generated UUIDs,
 * sequence values and timestamps, so both databases use the same publication. */
export function grhPublicationIdentity({tenantId,sourceBindingId,baselineBatchId,baselineImportRunId,baseline,candidate,version,curatedVersion,schoolingPayload}) {
  if (![tenantId,sourceBindingId,baselineBatchId].every(v => typeof v === 'string' && UUID.test(v))
    || typeof baselineImportRunId !== 'string' || !/^[1-9][0-9]*$/.test(baselineImportRunId)
    || !SHA.test(version?.payloadSha256 ?? '') || !SHA.test(curatedVersion?.payloadSha256 ?? '')) fail('GRH_PUBLICATION_INPUT_INVALID');
  validateSchoolingRecoveryPayload(schoolingPayload);
  for (const [name,prepared,profile] of [['baseline',baseline,'grh-junin-2026-08-06'],['candidate',candidate,'grh-junin-2026-09-10']]) {
    const v = version[name], e = prepared?.expected;
    if (!v || !e || e.qualityFlags?.profile !== profile || v.profileId !== profile
      || e.sourceSha256?.toLowerCase() !== v.sourceSha256 || e.cutoff?.replace(' ','T') !== v.cutoff
      || e.sourceDatabase !== v.sourceDatabase || !SHA.test(e.qualityFlags?.manifestSha256?.toLowerCase() ?? '')) fail('GRH_PUBLICATION_SOURCE_MISMATCH');
  }
  if (schoolingPayload.sourceSha256 !== version.candidate.sourceSha256
    || schoolingPayload.sourceDeclaredCutoff !== version.candidate.cutoff
    || schoolingPayload.sourceDatabase !== version.candidate.sourceDatabase) fail('GRH_PUBLICATION_SCHOOLING_MISMATCH');
  if (stableJson(curatedVersion.baseline) !== stableJson(baseline.expected)
    || stableJson(curatedVersion.candidate) !== stableJson(candidate.expected)) fail('GRH_PUBLICATION_CURATED_MISMATCH');
  return hash({version:'grh-coordinated-publication.v1',tenantId,sourceBindingId,baselineBatchId,baselineImportRunId,
    baseline:baseline.expected,candidate:candidate.expected,corePayloadSha256:version.payloadSha256,
    curatedPayloadSha256:curatedVersion.payloadSha256,schoolingSha256:hash(schoolingPayload)});
}

async function createCandidateMetadata(client, expected) {
  // Never reinterpret a partial attempt as a replay. The outer transaction
  // either commits the final immutable pointer or rolls back this metadata.
  const prior=await client.query(`SELECT id FROM public.data_import_runs WHERE source_name=$1 AND upper(source_sha256)=upper($2)
    UNION ALL SELECT legacy_import_run_id FROM public.source_import_batch WHERE source_system='GRH' AND upper(source_sha256)=upper($2)`,
  [expected.sourceName,expected.sourceSha256]);
  if (prior.rows.length) fail('GRH_PUBLICATION_PARTIAL_SOURCE_CONFLICT');
  const run=(await client.query(`INSERT INTO public.data_import_runs(source_name,source_sha256,source_cutoff,status,completed_at,table_counts,quality_flags)
    VALUES($1,upper($2),$3::timestamp,'completed',now(),$4::jsonb,$5::jsonb) RETURNING id::text`,
  [expected.sourceName,expected.sourceSha256,expected.cutoff,JSON.stringify(expected.tableCounts),JSON.stringify(expected.qualityFlags)])).rows[0];
  const batch=(await client.query(`INSERT INTO public.source_import_batch(id,source_system,source_database,source_file_name,source_sha256,
    source_cutoff,source_row_count,legacy_import_run_id,validation_state,manifest)
    VALUES(md5('source_import_batch|GRH|'||upper($2))::uuid,'GRH',$6,$1,upper($2),
      $3::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires',NULL,$7::bigint,'published',
      jsonb_build_object('legacyTableCounts',$4::jsonb,'legacyQualityFlags',$5::jsonb,'promotionProfile','explicit-curated-grh-v2')) RETURNING id::text`,
  [expected.sourceName,expected.sourceSha256,expected.cutoff,JSON.stringify(expected.tableCounts),JSON.stringify(expected.qualityFlags),expected.sourceDatabase,run.id])).rows[0];
  return {importRunId:run.id,batchId:batch.id};
}

async function preservedEvidence(client, baselineBatchId) {
  const result = {};
  for (const table of TABLES) {
    // Fixed identifiers only. The lock prevents an unrelated legitimate write
    // from being mistaken for publication corruption during this transaction.
    await client.query(`LOCK TABLE public.${table} IN SHARE MODE NOWAIT`);
    result[table] = (await client.query(`SELECT count(*)::text AS rows,
      md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' ORDER BY md5(to_jsonb(r)::text)),'')) AS digest FROM public.${table} r`)).rows[0];
  }
  for (const table of ['employment_contract','person_identity']) {
    const condition=table==='employment_contract' ? "r.source_system<>'GRH'"
      : 'r.id IN (SELECT person_id FROM public.native_employee_registration)';
    await client.query(`SELECT r.id FROM public.${table} r WHERE ${condition} ORDER BY r.id FOR UPDATE OF r NOWAIT`);
    result['native_'+table]=(await client.query(`SELECT count(*)::text AS rows,
      md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' ORDER BY md5(to_jsonb(r)::text)),'')) AS digest
      FROM public.${table} r WHERE ${condition}`)).rows[0];
  }
  for (const table of ['school_certificate_source_date','school_certificate_source_recovery']) {
    result[table] = (await client.query(`SELECT count(*)::text AS rows,
      md5(coalesce(string_agg(md5(to_jsonb(r)::text),'' ORDER BY md5(to_jsonb(r)::text)),'')) AS digest
      FROM public.${table} r WHERE ${table === 'school_certificate_source_date'
        ? 'recovery_id IN (SELECT id FROM public.school_certificate_source_recovery WHERE source_batch_id=$1::uuid)'
        : 'source_batch_id=$1::uuid'}`,[baselineBatchId])).rows[0];
  }
  return result;
}

async function bindingLock(client,tenantId,sourceBindingId,sourceDatabase) {
  const rows = (await client.query(`SELECT b.source_company_id::text company FROM public.platform_tenant_source_binding b
    JOIN public.tenant_identity_policy p ON p.tenant_id=b.tenant_id AND p.certified_source_binding_id=b.id
    WHERE b.id=$2::uuid AND b.tenant_id=$1::uuid AND b.verified AND p.tenant_data_plane_ready
      AND b.source_system='GRH' AND b.source_database=$3 FOR SHARE OF b,p NOWAIT`,[tenantId,sourceBindingId,sourceDatabase])).rows;
  if (rows.length !== 1) fail('GRH_PUBLICATION_BINDING_MISMATCH');
}

async function inspectPublished(client,context) {
  const {tenantId,sourceBindingId,baselineBatchId,publicationSha256,version,curatedVersion,schoolingPayload} = context;
  const rows = (await client.query(`SELECT p.source_version_id::text version_id,p.source_batch_id::text batch_id,
    p.import_run_id::text import_run_id,p.baseline_batch_id::text baseline_batch_id,p.publication_sha256,
    v.payload_sha256 FROM public.grh_effective_source_binding p JOIN public.grh_core_source_version v ON v.id=p.source_version_id
    WHERE p.tenant_id=$1::uuid AND p.source_binding_id=$2::uuid FOR SHARE OF p`,[tenantId,sourceBindingId])).rows;
  if (!rows.length) return null;
  const r = rows[0];
  if (rows.length !== 1 || r.publication_sha256 !== publicationSha256 || r.baseline_batch_id !== baselineBatchId
    || r.payload_sha256 !== version.payloadSha256) fail('GRH_PUBLICATION_REPLAY_CONFLICT');
  const curated=(await client.query(`SELECT id::text FROM public.grh_curated_source_version WHERE core_version_id=$1::uuid
    AND tenant_id=$2::uuid AND source_binding_id=$3::uuid AND payload_sha256=$4
    AND source_batch_id=$5::uuid AND import_run_id=$6::bigint`,
  [r.version_id,tenantId,sourceBindingId,curatedVersion.payloadSha256,r.batch_id,r.import_run_id])).rows;
  if (curated.length !== 1) fail('GRH_PUBLICATION_REPLAY_DRIFT');
  await inspectGrhSourceVersionPairWithinTransaction({client,tenantId,sourceBindingId,
    coreVersionId:r.version_id,curatedVersionId:curated[0].id,
    expectedCorePayloadSha256:version.payloadSha256,expectedCuratedPayloadSha256:curatedVersion.payloadSha256});
  // Seals prove the reconstruction. A published replay also verifies the small
  // physical operational projection, without inserting or refreshing its rows.
  for (const entity of ['payrollRuns','payrollSnapshot','employmentReconciliation']) {
    const fingerprints=(await client.query('SELECT public.grh_core_source_base_fingerprint_v1($1::uuid,$2::text) AS observed, entity_fingerprints->$2::text AS expected FROM public.grh_core_source_version_seal WHERE version_id=$3::uuid',
      [r.batch_id,entity,r.version_id])).rows;
    if (fingerprints.length!==1 || !fingerprints[0].observed || !fingerprints[0].expected
      || stableJson(fingerprints[0].observed)!==stableJson(fingerprints[0].expected)) fail('GRH_PUBLICATION_REPLAY_DRIFT');
  }
  const schooling = await importSchoolingSourceWithinTransaction(client,{tenantId,bindingId:sourceBindingId,batchId:r.batch_id,
    payload:schoolingPayload,operator:'MuniControl coordinated source verification',apply:false});
  if (schooling.replayed!==true) fail('GRH_PUBLICATION_REPLAY_DRIFT');
  return {version:'grh-coordinated-publication.v1',replayed:true,publicationSha256,sourceVersionId:r.version_id,
    curatedVersionId:curated[0].id,batchId:r.batch_id,importRunId:r.import_run_id,schooling,committed:false,callerOwnedTransaction:true};
}

/** Internal primitive only. Caller supplies an independently verified package,
 * owns READ COMMITTED BEGIN/COMMIT/ROLLBACK, and must rollback on ANY exception.
 * A receipt here is never a durable publication acknowledgement. */
export async function publishGrhSourceWithinTransaction({client,tenantId,sourceBindingId,baselineBatchId,baselineImportRunId,
  baseline,candidate,version,curatedVersion,source,schoolingPayload,expectedPublicationSha256,checkpoint=async()=>{}} = {}) {
  // Capture values before any await; callbacks cannot substitute source data.
  baseline=preparedSnapshot(baseline); candidate=preparedSnapshot(candidate);
  version=copy(version); curatedVersion=copy(curatedVersion); schoolingPayload=copy(schoolingPayload);
  const publicationSha256=grhPublicationIdentity({tenantId,sourceBindingId,baselineBatchId,baselineImportRunId,baseline,candidate,version,curatedVersion,schoolingPayload});
  if (typeof client?.query !== 'function' || typeof checkpoint !== 'function'
    || !SHA.test(expectedPublicationSha256 ?? '') || expectedPublicationSha256 !== publicationSha256) fail('GRH_PUBLICATION_IDENTITY_MISMATCH');
  await client.query('SAVEPOINT grh_coordinated_publication');
  if ((await client.query('SHOW transaction_isolation')).rows[0]?.transaction_isolation !== 'read committed') fail('GRH_PUBLICATION_ISOLATION_REQUIRED');
  await acquireGrhPublicationLocks(client);
  await bindingLock(client,tenantId,sourceBindingId,version.candidate.sourceDatabase);
  const context={tenantId,sourceBindingId,baselineBatchId,publicationSha256,version,curatedVersion,candidate,schoolingPayload};
  const replay=await inspectPublished(client,context);
  if (replay) { await client.query('RELEASE SAVEPOINT grh_coordinated_publication'); return replay; }
  const coreAlreadyPresent=(await client.query(`SELECT id FROM public.grh_core_source_version
    WHERE tenant_id=$1::uuid AND source_binding_id=$2::uuid AND payload_sha256=$3`,
  [tenantId,sourceBindingId,version.payloadSha256])).rows.length===1;
  // Peak includes compact curated evidence, canonical identities, current
  // operational snapshots and index/MVCC growth. Existing 061 evidence is reused.
  const requiredGrowthBytes=(coreAlreadyPresent ? 30 : 48)*1024*1024;
  const capacityBefore=await readSourceCapacity(client,GRH_VERSION_STORAGE_BUDGET,requiredGrowthBytes);
  if (!capacityBefore.fits) fail('GRH_PUBLICATION_CAPACITY_REQUIRED');
  const preservation=await preservedEvidence(client,baselineBatchId);
  await checkpoint('publication:validated');
  // 061 must precede contract rotation, including its existing-version path.
  const imported=await importGrhSourceVersionWithinTransaction({client,prepared:version,expectedPayloadSha256:version.payloadSha256,
    baselineBatchId,baselineImportRunId,tenantId,sourceBindingId});
  await checkpoint('publication:version');
  const metadata=await createCandidateMetadata(client,candidate.expected);
  await checkpoint('publication:metadata');
  const curated=await importGrhCuratedSourceVersionWithinTransaction({client,prepared:curatedVersion,expectedPayloadSha256:curatedVersion.payloadSha256,
    coreVersionId:imported.versionId,tenantId,sourceBindingId,baselineBatchId,baselineImportRunId,
    candidateBatchId:metadata.batchId,candidateImportRunId:metadata.importRunId});
  await checkpoint('publication:curated');
  const promotion=await promoteCanonicalGrhWithinTransaction({client,importRunId:metadata.importRunId,expectedSource:candidate.expected,
    expectedBaseline:{importRunId:baselineImportRunId,batchId:baselineBatchId,sourceSha256:baseline.expected.sourceSha256,
      sourceDatabase:baseline.expected.sourceDatabase,cutoff:baseline.expected.cutoff},verifiedProjection:candidate.projectTables,checkpoint,
    sourceRevision:{curatedVersionId:curated.versionId,expectedPayloadSha256:curatedVersion.payloadSha256}});
  const snapshot=await importGrhOperationalSnapshotWithinTransaction({client,source,batchId:promotion.batchId,importRunId:metadata.importRunId,
    sourceVersionId:imported.versionId,expectedPayloadSha256:version.payloadSha256,tenantId,sourceBindingId,checkpoint});
  const schooling=await importSchoolingSourceWithinTransaction(client,{tenantId,bindingId:sourceBindingId,batchId:promotion.batchId,
    payload:schoolingPayload,operator:'MuniControl coordinated source publication',apply:true});
  await checkpoint('publication:schooling');
  if (stableJson(preservation) !== stableJson(await preservedEvidence(client,baselineBatchId))) fail('GRH_PUBLICATION_PRESERVATION_FAILED');
  const capacityAfter=await readSourceCapacity(client,GRH_VERSION_STORAGE_BUDGET,0);
  if (!capacityAfter.fits) fail('GRH_PUBLICATION_CAPACITY_EXCEEDED');
  await checkpoint('publication:verified');
  // Final write. The guard verifies the sealed source, real run identities,
  // complete contract mapping and absence of duplicated monthly/movement rows.
  await client.query(`INSERT INTO public.grh_effective_source_binding
    (tenant_id,source_binding_id,source_version_id,baseline_batch_id,source_batch_id,import_run_id,publication_sha256)
    VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::bigint,$7)`,
  [tenantId,sourceBindingId,imported.versionId,baselineBatchId,promotion.batchId,metadata.importRunId,publicationSha256]);
  await checkpoint('publication:activated');
  await client.query('RELEASE SAVEPOINT grh_coordinated_publication');
  return {version:'grh-coordinated-publication.v1',replayed:false,publicationSha256,sourceVersionId:imported.versionId,
    curatedVersionId:curated.versionId,batchId:promotion.batchId,importRunId:metadata.importRunId,sourceDeclaredCutoff:version.candidate.cutoff,
    payrollDate:version.candidate.currentPayrollDate,promotion,snapshot,schooling,capacityBefore,capacityAfter,
    committed:false,callerOwnedTransaction:true};
}
