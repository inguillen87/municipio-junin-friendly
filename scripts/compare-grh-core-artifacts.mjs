import { preflightGrhCore } from './import-grh-core-canonical.mjs';
import { stableJson, sha256Text, streamDeterministicJsonArray } from './lib/canonical-import.mjs';
import { getGrhSourceProfile } from './lib/grh-source-profile.mjs';

function reject(code) { throw Object.assign(new Error(code), { code }); }

function key(record) {
  if (!record || typeof record.sourceKey !== 'object' || record.sourceKey === null
      || Array.isArray(record.sourceKey) || !Object.keys(record.sourceKey).length) {
    reject('GRH_CORE_COMPARISON_SOURCE_KEY_REQUIRED');
  }
  return stableJson(record.sourceKey);
}

/** Aggregate only: never return source keys, names, amounts or record payloads. */
export async function compareCoreRows(baseline, candidate) {
  const index = new Map();
  const result = { baselineRows: 0, candidateRows: 0, unchanged: 0, changed: 0, added: 0, removed: 0,
    baselineLogicalPayloadBytes: 0, candidateLogicalPayloadBytes: 0,
    changedPreviousLogicalPayloadBytes: 0, addedLogicalPayloadBytes: 0 };
  for await (const record of baseline) {
    const id = key(record), payload = stableJson(record), bytes = Buffer.byteLength(payload);
    if (index.has(id)) reject('GRH_CORE_COMPARISON_DUPLICATE_BASELINE_KEY');
    index.set(id, { digest: sha256Text(payload), bytes });
    result.baselineRows++;
    result.baselineLogicalPayloadBytes += bytes;
  }
  const seen = new Set();
  for await (const record of candidate) {
    const id = key(record), payload = stableJson(record), bytes = Buffer.byteLength(payload);
    if (seen.has(id)) reject('GRH_CORE_COMPARISON_DUPLICATE_CANDIDATE_KEY');
    seen.add(id);
    result.candidateRows++;
    result.candidateLogicalPayloadBytes += bytes;
    const previous = index.get(id);
    if (!previous) { result.added++; result.addedLogicalPayloadBytes += bytes; }
    else if (previous.digest === sha256Text(payload)) result.unchanged++;
    else { result.changed++; result.changedPreviousLogicalPayloadBytes += previous.bytes; }
  }
  result.removed = result.baselineRows - result.unchanged - result.changed;
  return result;
}

/** Verify both bundles before and after reading. This operation has no database access. */
export async function compareGrhCoreArtifacts({ baseline, candidate } = {}) {
  try {
    if (!baseline?.profileId || !candidate?.profileId) reject('GRH_CORE_COMPARISON_EXPLICIT_PROFILES_REQUIRED');
    const previousProfile = getGrhSourceProfile(baseline.profileId);
    const nextProfile = getGrhSourceProfile(candidate.profileId);
    if (previousProfile.source.database !== nextProfile.source.database
        || previousProfile.source.cutoff >= nextProfile.source.cutoff) {
      reject('GRH_CORE_COMPARISON_FORWARD_SAME_SOURCE_REQUIRED');
    }
    const before = await preflightGrhCore(baseline);
    const after = await preflightGrhCore(candidate);
    const artifacts = {};
    for (const name of Object.keys(before.artifacts)) {
      artifacts[name] = await compareCoreRows(
        streamDeterministicJsonArray(before.artifacts[name].path, before.artifacts[name].descriptor),
        streamDeterministicJsonArray(after.artifacts[name].path, after.artifacts[name].descriptor),
      );
    }
    const finalBefore = await preflightGrhCore(baseline);
    const finalAfter = await preflightGrhCore(candidate);
    if (before.manifestSha256 !== finalBefore.manifestSha256 || after.manifestSha256 !== finalAfter.manifestSha256) {
      reject('GRH_CORE_COMPARISON_SOURCE_CHANGED');
    }
    return {
      version: 'grh-core-artifact-comparison.v1', status: 'verified', databaseWrites: false,
      publicationAuthorized: false, artifacts,
      baseline: { profileId: before.profileId, sourceSha256: before.manifest.source.sha256,
        manifestSha256: before.manifestSha256, cutoff: previousProfile.source.cutoff },
      candidate: { profileId: after.profileId, sourceSha256: after.manifest.source.sha256,
        manifestSha256: after.manifestSha256, cutoff: nextProfile.source.cutoff },
      semantics: {
        keys: 'Literal sourceKey from deterministic artifacts; snapshot IDs may be replaced between months.',
        removedRowsAreEmployeeTerminations: false,
        bytesAreDatabaseStorageMeasurement: false,
        payrollSnapshotIsPaymentEvidence: false,
        monthlyHistoryKeyOverlap: artifacts.payrollMonthly.unchanged + artifacts.payrollMonthly.changed,
        currentSchemaSupportsOverlappingMonthlyVersions: false,
      },
    };
  } catch (error) {
    const code = /^GRH_CORE_COMPARISON_[A-Z_]+$/.test(error?.code ?? '')
      ? error.code : 'GRH_CORE_COMPARISON_VERIFICATION_FAILED';
    reject(code);
  }
}
