import { readAndVerifySources, prepareCuratedImport } from './import-rrhh-neon.mjs';
import { inspectCuratedReplayWithinTransaction } from './lib/rrhh-import-replay.mjs';
import { acquireGrhPublicationLocks } from './lib/grh-publication-lock.mjs';
import { runLocalRollbackRehearsal, verifyLocalRehearsalTarget } from './lib/grh-local-rehearsal.mjs';
import { promoteCanonicalGrhWithinTransaction } from './promote-canonical-grh.mjs';
import { preflightGrhCore, importGrhCoreWithinTransaction } from './import-grh-core-canonical.mjs';

export const GRH_REHEARSAL_CHECKPOINTS = Object.freeze([
  'curated_verified', 'promotion:validated', 'promotion:staged', 'promotion:written', 'promotion:verified',
  'core_artifact_staging', 'core_payroll_runs', 'core_payroll_snapshot', 'core_movements',
  'core_payroll_monthly', 'core_reconciliation', 'core_quality_issues', 'core_verified',
]);

function directory(value) {
  return value instanceof URL && value.protocol === 'file:' && !value.search && !value.hash
    && value.pathname.endsWith('/');
}

/** Rehearse the existing August source; this does not enable a replacement import.
 * The caller supplies a dedicated connection to the already restored local copy.
 * No environment is read, no connection is opened, and no private row is returned.
 */
export async function rehearseGrhPublication({ client, curatedDataDir, coreDataDir, failAfter = null } = {}) {
  const progress = {
    curatedPhase: 'pending', checkpoints: [],
    failureInjectionRequested: failAfter !== null, failureInjectionReached: false,
    completed: false,
  };
  const blocked = (code) => ({
    version: 'grh-local-publication-rehearsal.v1', status: 'blocked', code,
    committed: false, productionWrites: false, sourceRefreshAuthorized: false,
    rollbackConfirmed: false, tablesUnchanged: null, sequencesUnchanged: null,
    ...progress,
  });
  if (!directory(curatedDataDir) || !directory(coreDataDir)
      || (failAfter !== null && !GRH_REHEARSAL_CHECKPOINTS.includes(failAfter))) {
    return blocked('GRH_REHEARSAL_INPUT_INVALID');
  }
  let curated;
  let core;
  let prepared;
  try {
    await verifyLocalRehearsalTarget(client);
  } catch {
    return blocked('GRH_REHEARSAL_LOCAL_CONNECTION_REJECTED');
  }
  try {
    curated = await readAndVerifySources(curatedDataDir);
    core = await preflightGrhCore({ dataDir: coreDataDir });
    prepared = prepareCuratedImport(curated);
  } catch {
    return blocked('GRH_REHEARSAL_SOURCE_VERIFICATION_FAILED');
  }
  if (prepared.expected.sourceSha256.toUpperCase() !== core.manifest.source.sha256.toUpperCase()) {
    return blocked('GRH_REHEARSAL_SOURCE_MISMATCH');
  }
  const checkpoint = async (phase) => {
    if (!GRH_REHEARSAL_CHECKPOINTS.includes(phase)) throw new Error('GRH_REHEARSAL_UNKNOWN_CHECKPOINT');
    progress.checkpoints.push(phase);
    if (phase === failAfter) {
      progress.failureInjectionReached = true;
      throw new Error('GRH_REHEARSAL_INJECTED_FAILURE');
    }
  };
  const report = await runLocalRollbackRehearsal({ client, operation: async (transactionClient) => {
    await acquireGrhPublicationLocks(transactionClient);
    const replay = await inspectCuratedReplayWithinTransaction(transactionClient, prepared.expected, prepared.projectTables);
    if (replay.action !== 'noop') throw new Error('GRH_REHEARSAL_EXISTING_SOURCE_REQUIRED');
    progress.curatedPhase = 'verified_existing_noop';
    await checkpoint('curated_verified');
    const promotion = await promoteCanonicalGrhWithinTransaction({
      client: transactionClient, importRunId: replay.importRunId,
      expectedSource: prepared.expected, verifiedProjection: prepared.projectTables, checkpoint,
    });
    await importGrhCoreWithinTransaction({
      client: transactionClient, source: core, batchId: promotion.batchId, importRunId: replay.importRunId, checkpoint,
    });
    // Curated evidence stays in memory during the transaction. Re-read the files
    // before completion so a changing source cannot be reported as verified.
    const finalCurated = prepareCuratedImport(await readAndVerifySources(curatedDataDir));
    if (finalCurated.manifestSha256 !== prepared.manifestSha256) {
      throw new Error('GRH_REHEARSAL_SOURCE_CHANGED');
    }
    progress.completed = true;
  } });
  if (progress.failureInjectionReached && report.status === 'blocked'
      && report.failureStage === 'publication' && report.code === 'GRH_REHEARSAL_PUBLICATION_REJECTED'
      && report.rollbackConfirmed
      && report.tablesUnchanged && report.sequencesUnchanged) {
    report.status = 'injected-failure-rolled-back';
  }
  if (failAfter !== null && !progress.failureInjectionReached && report.status === 'verified-rolled-back') {
    report.status = 'verification-failed';
    report.code = 'GRH_REHEARSAL_INJECTION_NOT_REACHED';
  }
  return { ...report, ...progress, completed: progress.completed && report.status === 'verified-rolled-back' };
}
