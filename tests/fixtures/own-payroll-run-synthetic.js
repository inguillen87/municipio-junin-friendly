import { approvedSources } from './own-payroll-approved-synthetic.js';
import { uid, hash } from './own-payroll-program-synthetic.js';
import { ownRunHash } from '../../lib/internal-own-payroll-run.js';
import { prepareOwnPayrollInput } from '../../lib/own-payroll-approved-input.js';
import { createOwnPayrollSnapshot } from '../../lib/own-payroll-snapshot.js';
export function runCommand(patch = {}) { return { period: '2026-10', liquidationType: 'monthly', selection: { kind: 'all', values: [] }, scopeVersion: hash('a'), programVersion: hash('b'), populationDomain: 'native_registered', ...patch }; }
export function capture(patch = {}) {
  const body = runCommand(), payload = { ...approvedSources(), sourceInventory: { populationDomain: 'native_registered' } };
  return { version: 'own-payroll-run.v1', id: uid(90), key: uid(9), body, bodySha256: ownRunHash(body), algorithmSha256: hash('c'), payload, payloadSha256: ownRunHash(payload), createdAt: '2026-10-05T10:00:00Z', replayed: false, saved: null, ...patch };
}
export function saved(c = capture()) {
  const { sourceInventory: _inventory, ...sources } = c.payload, snapshot = createOwnPayrollSnapshot(prepareOwnPayrollInput(sources));
  return structuredClone({ version: 'own-payroll-saved.v1', id: c.id, algorithmSha256: c.algorithmSha256, inputSha256: snapshot.inputSha256, resultSha256: snapshot.resultSha256, input: snapshot.input, result: snapshot.result, recordedAt: '2026-10-05T10:01:00Z' });
}
