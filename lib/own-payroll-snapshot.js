import { createHash } from 'node:crypto';
import { calculateOwnPayroll, normalizeOwnPayrollInput } from '../assets/own-payroll-engine.js';
import { payrollRequire } from '../assets/own-payroll-exact.js';

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const fingerprint = value => createHash('sha256').update(canonical(value), 'utf8').digest('hex');
export function createOwnPayrollSnapshot(input) {
  const snapshot = normalizeOwnPayrollInput(input);
  payrollRequire(Buffer.byteLength(canonical(snapshot), 'utf8') <= 8 * 1024 * 1024, 'SNAPSHOT_LIMIT', 'El conjunto completo supera la capacidad; no se parte ni se recorta.');
  const result = calculateOwnPayroll(snapshot);
  payrollRequire(Buffer.byteLength(canonical(result), 'utf8') <= 32 * 1024 * 1024, 'RESULT_LIMIT', 'El resultado completo supera la capacidad; no se entrega parcialmente.');
  return freeze({ version: 'own-payroll-snapshot.v1', inputSha256: fingerprint(snapshot), resultSha256: fingerprint(result), input: snapshot, result });
}
