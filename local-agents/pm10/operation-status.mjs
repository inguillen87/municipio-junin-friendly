// SPDX-License-Identifier: GPL-2.0-only
// Observability only: process liveness is not proof that capture or delivery works.
import path from 'node:path';
import { loadConfig } from './config.mjs';
import { loadState } from './service.mjs';
import { loadDeliveryStatus } from './delivery-status.mjs';
export async function readOperationStatus(base, { now = () => new Date() } = {}) {
  const checkedAt = now().toISOString();
  let config;
  try { config = await loadConfig(path.join(base, 'config.json')); }
  catch { return { checkedAt, capture: { availability: 'unavailable' }, delivery: { availability: 'unavailable' } }; }
  let capture;
  try {
    const state = await loadState(config.stateDir);
    capture = {
      availability: 'available', state: state.status, blocked: state.blocked,
      lastError: state.lastError, lastAttemptAt: state.lastAttemptAt,
      lastCaptureAt: state.lastCaptureAt, nextPollAt: state.nextPollAt,
      // Expose dates, not a fabricated real-time healthy/unhealthy verdict.
      pollSeconds: config.pollSeconds,
    };
  } catch { capture = { availability: 'invalid' }; }
  const delivery = await loadDeliveryStatus(config.stateDir);
  return { checkedAt, capture, delivery };
}
