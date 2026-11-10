import { getActionCenterSql } from './internal-actions.js';
import { collectiveJobQueue, collectiveJobQueueRetry, processCollectiveJobMessage, CollectiveJobPoisonMessage } from '../lib/own-collective-jobs-queue.js';

// handleNodeCallback expects the provider's parsed body for the queue/v2beta
// delivery. These payloads contain only opaque job IDs and generations.

export function createOwnCollectiveWorkerHandler(deps = {}) {
  const queue = deps.queue ?? collectiveJobQueue, env = deps.env ?? process.env;
  const getSql = deps.getSql ?? getActionCenterSql, handleMessage = deps.process ?? processCollectiveJobMessage;
  // The queue/v2beta trigger makes this function inaccessible from the public
  // internet. SQL independently revalidates the stored authenticated job actor.
  return queue.handleNodeCallback(async (message, metadata) => {
    try {
      const sql = await getSql(env);
      await handleMessage(message, metadata, { sql, ...(deps.publish ? { publish: deps.publish } : {}) });
    } catch (error) {
      if (error instanceof CollectiveJobPoisonMessage) throw error;
      throw Error('COLLECTIVE_JOB_WORKER_RETRY');
    }
  }, { visibilityTimeoutSeconds: 120, retry: collectiveJobQueueRetry });
}

export default createOwnCollectiveWorkerHandler();
