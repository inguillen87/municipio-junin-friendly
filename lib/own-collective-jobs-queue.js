import { QueueClient } from '@vercel/queue';
import { salaryExact, salaryUuid } from '../assets/native-salary-catalog-model.js';
import { ownCollectiveJobStep } from './own-collective-jobs.js';

export const COLLECTIVE_JOB_TOPIC = 'own-collective-jobs';
export const COLLECTIVE_JOB_RETENTION_SECONDS = 7 * 24 * 60 * 60;
export const collectiveJobQueue = new QueueClient();

// The queue carries no file, personal fields, session or command. The durable
// ledger owns both the authenticated actor and the immutable request keys.
export async function publishCollectiveJob(job, { queue = collectiveJobQueue } = {}) {
  if (!salaryUuid(job?.id) || !Number.isSafeInteger(job.dispatchGeneration) || job.dispatchGeneration < 1) throw Error('COLLECTIVE_JOB_DISPATCH_INVALID');
  return queue.send(COLLECTIVE_JOB_TOPIC, { jobId: job.id, generation: job.dispatchGeneration }, {
    idempotencyKey: `collective:${job.id}:${job.dispatchGeneration}`,
    retentionSeconds: COLLECTIVE_JOB_RETENTION_SECONDS,
  });
}

export class CollectiveJobPoisonMessage extends Error {
  constructor() { super('COLLECTIVE_JOB_MESSAGE_INVALID'); this.name = 'CollectiveJobPoisonMessage'; }
}

export async function processCollectiveJobMessage(message, metadata, { sql, step = ownCollectiveJobStep, publish = publishCollectiveJob } = {}) {
  if (!salaryExact(message, ['jobId', 'generation']) || !salaryUuid(message.jobId)
      || !Number.isSafeInteger(message.generation) || message.generation < 1
      || metadata?.topicName !== COLLECTIVE_JOB_TOPIC) throw new CollectiveJobPoisonMessage();
  try {
    const snapshot = await step(sql, message.jobId, message.generation, 8);
    // A stale delivery can return the current snapshot; publishing its current
    // generation is safe and recovers a commit followed by a network failure.
    if (snapshot && ['preparing', 'running'].includes(snapshot.phase)) await publish(snapshot);
    return snapshot;
  } catch {
    // Never include SQL exceptions or input data in the queue provider's logs.
    throw Error('COLLECTIVE_JOB_WORKER_RETRY');
  }
}

export function collectiveJobQueueRetry(error, metadata) {
  if (error instanceof CollectiveJobPoisonMessage) return { acknowledge: true };
  const deliveries = Number.isSafeInteger(metadata?.deliveryCount) ? metadata.deliveryCount : 1;
  return { afterSeconds: Math.min(300, 5 * 2 ** Math.min(6, Math.max(0, deliveries - 1))) };
}
