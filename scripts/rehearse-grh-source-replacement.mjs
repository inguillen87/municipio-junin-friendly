import { readAndVerifySources, prepareCuratedImport } from './import-rrhh-neon.mjs';
import { replaceCuratedWithinTransaction, GRH_CURATED_REPLACEMENT_CHECKPOINTS } from './lib/grh-curated-replacement.mjs';
import { promoteCanonicalGrhWithinTransaction } from './promote-canonical-grh.mjs';
import { runLocalRollbackRehearsal, verifyLocalRehearsalTarget } from './lib/grh-local-rehearsal.mjs';
import { getGrhSourceProfile } from './lib/grh-source-profile.mjs';

export const GRH_REPLACEMENT_REHEARSAL_CHECKPOINTS = Object.freeze([
  ...GRH_CURATED_REPLACEMENT_CHECKPOINTS,
  'promotion:validated', 'promotion:staged', 'promotion:written', 'promotion:verified',
]);
const directory = value => value instanceof URL && value.protocol === 'file:'
  && !value.search && !value.hash && value.pathname.endsWith('/');

/** Existing loopback restore only; always rolls back. This is not a publication
 * orchestrator: core history and capacity remain explicit unresolved gates.
 */
export async function rehearseGrhSourceReplacement({ client, baseline, candidate, failAfter = null } = {}) {
  const progress = { scope:'curated-and-canonical-identities', checkpoints:[],
    curatedReplacementVerified:false, canonicalPromotionVerified:false,
    coreReplacementAttempted:false, publicationReady:false,
    failureInjectionRequested:failAfter !== null, failureInjectionReached:false };
  const blocked = code => ({ status:'blocked',code,committed:false,productionWrites:false,
    sourceRefreshAuthorized:false,rollbackConfirmed:false,...progress });
  if (!directory(baseline?.curatedDataDir) || !directory(candidate?.curatedDataDir)
      || !baseline.profileId || !candidate.profileId || typeof baseline.importRunId !== 'string'
      || typeof baseline.batchId !== 'string'
      || (failAfter !== null && !GRH_REPLACEMENT_REHEARSAL_CHECKPOINTS.includes(failAfter))) {
    return blocked('GRH_REPLACEMENT_REHEARSAL_INPUT_INVALID');
  }
  let previous, next;
  try {
    await verifyLocalRehearsalTarget(client);
    if (getGrhSourceProfile(baseline.profileId).id !== 'grh-junin-2026-08-06'
        || getGrhSourceProfile(candidate.profileId).id !== 'grh-junin-2026-09-10') {
      return blocked('GRH_REPLACEMENT_REHEARSAL_PROFILES_UNSUPPORTED');
    }
    previous=prepareCuratedImport(await readAndVerifySources(baseline.curatedDataDir,{profileId:baseline.profileId}));
    next=prepareCuratedImport(await readAndVerifySources(candidate.curatedDataDir,{profileId:candidate.profileId}));
  } catch { return blocked('GRH_REPLACEMENT_REHEARSAL_PREFLIGHT_FAILED'); }
  const checkpoint=async phase=>{
    if (!GRH_REPLACEMENT_REHEARSAL_CHECKPOINTS.includes(phase)) throw new Error('GRH_REPLACEMENT_REHEARSAL_UNKNOWN_CHECKPOINT');
    progress.checkpoints.push(phase);
    if (phase===failAfter) { progress.failureInjectionReached=true; throw new Error('GRH_REPLACEMENT_REHEARSAL_INJECTED_FAILURE'); }
  };
  const result=await runLocalRollbackRehearsal({client,
    // PostgreSQL nextval is not transactional. Only these two sequences may
    // advance, with bounded counts; all 118 table contents must still match.
    maximumSequenceAdvances:{data_import_runs_id_seq:1,data_quality_issue_id_seq:50},
    operation:async transaction=>{
      try {
        const replacement=await replaceCuratedWithinTransaction({client:transaction,
          current:{importRunId:baseline.importRunId,batchId:baseline.batchId,prepared:previous},candidate:next,checkpoint});
        progress.curatedReplacementVerified=true;
        await promoteCanonicalGrhWithinTransaction({client:transaction,importRunId:replacement.importRunId,
          expectedSource:next.expected,verifiedProjection:next.projectTables,checkpoint,
          expectedBaseline:{importRunId:baseline.importRunId,batchId:baseline.batchId,
            sourceSha256:previous.expected.sourceSha256,sourceDatabase:previous.expected.sourceDatabase,cutoff:previous.expected.cutoff}});
        progress.canonicalPromotionVerified=true;
        for (const [source,prepared] of [[baseline,previous],[candidate,next]]) {
          const checked=prepareCuratedImport(await readAndVerifySources(source.curatedDataDir,{profileId:source.profileId}));
          if (checked.manifestSha256!==prepared.manifestSha256) throw new Error('GRH_REPLACEMENT_REHEARSAL_SOURCE_CHANGED');
        }
      } catch (error) {
        progress.rejectionCode=/^[A-Z_]+$/.test(error?.code ?? '') ? error.code : 'GRH_REPLACEMENT_REHEARSAL_PHASE_REJECTED';
        throw error;
      }
    },
  });
  if (progress.failureInjectionReached && result.status==='blocked' && result.failureStage==='publication'
      && result.rollbackConfirmed && result.tablesUnchanged && result.sequenceAdvancesWithinPolicy) {
    result.status='injected-failure-rolled-back';
  }
  if (failAfter!==null && !progress.failureInjectionReached && result.status==='verified-rolled-back') {
    result.status='verification-failed'; result.code='GRH_REPLACEMENT_REHEARSAL_INJECTION_NOT_REACHED';
  }
  return {...result,...progress};
}
