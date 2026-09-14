import { civilDate } from './civil-date.js';

export const CORE_REVIEW_VERSION = 'grh-core-artifact-comparison.v1';
export const MAX_CORE_REVIEW_BYTES = 256 * 1024;
export class CoreReviewError extends Error {}
export const CORE_REVIEW_DOMAINS = Object.freeze(['payrollRuns', 'payrollSnapshot', 'movements', 'payrollMonthly', 'employmentReconciliation']);
export const CORE_REVIEW_LABELS = Object.freeze({ payrollRuns: 'Liquidaciones registradas', payrollSnapshot: 'Legajos de la liquidación actual',
  movements: 'Movimientos de conceptos', payrollMonthly: 'Historial mensual por legajo', employmentReconciliation: 'Control de legajos y liquidaciones' });
const rowLimits = Object.freeze({ payrollRuns: 100000, payrollSnapshot: 100000, movements: 10000000, payrollMonthly: 10000000, employmentReconciliation: 100000 });
const rows = ['baselineRows', 'candidateRows', 'unchanged', 'changed', 'added', 'removed'];
const sizes = ['baselineLogicalPayloadBytes', 'candidateLogicalPayloadBytes', 'changedPreviousLogicalPayloadBytes', 'addedLogicalPayloadBytes'];
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const count = value => Number.isSafeInteger(value) && value >= 0;
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
const fail = () => { throw new CoreReviewError('El informe no cumple el contrato de revisión local. Generá nuevamente la comparación agregada del núcleo GRH.'); };
function cutoff(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value)) fail();
  try { civilDate(value.slice(0, 10)); } catch { fail(); }
  return value;
}
function source(value) {
  if (!exact(value, ['profileId', 'sourceSha256', 'manifestSha256', 'cutoff']) || !hash(value.sourceSha256) || !hash(value.manifestSha256)
    || typeof value.profileId !== 'string' || !/^grh-junin-\d{4}-\d{2}-\d{2}$/.test(value.profileId)
    || value.profileId !== `grh-junin-${cutoff(value.cutoff).slice(0, 10)}`) fail();
  return Object.freeze({ profileId: value.profileId, sourceSha256: value.sourceSha256.toLowerCase(),
    manifestSha256: value.manifestSha256.toLowerCase(), cutoff: value.cutoff });
}
function artifact(value, name) {
  if (!exact(value, [...rows, ...sizes]) || !rows.every(key => count(value[key])) || !sizes.every(key => count(value[key]) && value[key] <= 2147483648)
    || value.baselineRows > rowLimits[name] || value.candidateRows > rowLimits[name]
    || BigInt(value.unchanged) + BigInt(value.changed) + BigInt(value.added) !== BigInt(value.candidateRows)
    || BigInt(value.unchanged) + BigInt(value.changed) + BigInt(value.removed) !== BigInt(value.baselineRows)) fail();
  const pairs = [['baselineRows', 'baselineLogicalPayloadBytes'], ['candidateRows', 'candidateLogicalPayloadBytes'],
    ['changed', 'changedPreviousLogicalPayloadBytes'], ['added', 'addedLogicalPayloadBytes']];
  if (pairs.some(([records, bytes]) => (value[records] === 0) !== (value[bytes] === 0) || value[bytes] < value[records])
    || value.changedPreviousLogicalPayloadBytes + value.unchanged + value.removed > value.baselineLogicalPayloadBytes
    || value.addedLogicalPayloadBytes + value.unchanged + value.changed > value.candidateLogicalPayloadBytes
    || (value.baselineRows === value.changed && value.baselineLogicalPayloadBytes !== value.changedPreviousLogicalPayloadBytes)
    || (value.candidateRows === value.added && value.candidateLogicalPayloadBytes !== value.addedLogicalPayloadBytes)) fail();
  if (value.removed === 0) {
    const unchangedBytes = value.baselineLogicalPayloadBytes - value.changedPreviousLogicalPayloadBytes;
    if ((value.unchanged === 0) !== (unchangedBytes === 0)
      || unchangedBytes + value.addedLogicalPayloadBytes + value.changed > value.candidateLogicalPayloadBytes
      || (value.changed === 0 && unchangedBytes + value.addedLogicalPayloadBytes !== value.candidateLogicalPayloadBytes)) fail();
  }
  return Object.freeze(Object.fromEntries([...rows, ...sizes].map(key => [key, value[key]])));
}
export function coreReviewData(value) {
  if (!exact(value, ['version', 'status', 'databaseWrites', 'publicationAuthorized', 'artifacts', 'baseline', 'candidate', 'semantics'])
    || value.version !== CORE_REVIEW_VERSION || value.status !== 'verified' || value.databaseWrites !== false || value.publicationAuthorized !== false
    || !exact(value.artifacts, CORE_REVIEW_DOMAINS)) fail();
  const baseline = source(value.baseline), candidate = source(value.candidate);
  if (baseline.sourceSha256 === candidate.sourceSha256 || baseline.manifestSha256 === candidate.manifestSha256 || baseline.cutoff >= candidate.cutoff) fail();
  const artifacts = Object.freeze(Object.fromEntries(CORE_REVIEW_DOMAINS.map(name => [name, artifact(value.artifacts[name], name)])));
  const semantics = value.semantics;
  if (!exact(semantics, ['keys', 'removedRowsAreEmployeeTerminations', 'bytesAreDatabaseStorageMeasurement', 'payrollSnapshotIsPaymentEvidence',
    'monthlyHistoryKeyOverlap', 'currentSchemaSupportsOverlappingMonthlyVersions'])
    || semantics.keys !== 'Literal sourceKey from deterministic artifacts; snapshot IDs may be replaced between months.'
    || semantics.removedRowsAreEmployeeTerminations !== false || semantics.bytesAreDatabaseStorageMeasurement !== false
    || semantics.payrollSnapshotIsPaymentEvidence !== false || semantics.currentSchemaSupportsOverlappingMonthlyVersions !== false
    || !count(semantics.monthlyHistoryKeyOverlap)
    || BigInt(semantics.monthlyHistoryKeyOverlap) !== BigInt(artifacts.payrollMonthly.unchanged) + BigInt(artifacts.payrollMonthly.changed)) fail();
  return Object.freeze({ version: CORE_REVIEW_VERSION, status: 'verified', databaseWrites: false, publicationAuthorized: false,
    baseline, candidate, artifacts, semantics: Object.freeze({ ...semantics }) });
}
export function coreReviewBytes(bytes) {
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > MAX_CORE_REVIEW_BYTES) throw new CoreReviewError('Elegí un informe JSON de hasta 256 KiB. El respaldo SQL no se abre desde esta pantalla.');
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { fail(); }
  return coreReviewData(value);
}
export function coreReviewTotals(data) {
  return Object.fromEntries([...rows, ...sizes].map(key => [key, CORE_REVIEW_DOMAINS.reduce((sum, name) => sum + BigInt(data.artifacts[name][key]), 0n)]));
}
export function coreReviewCutoff(value) {
  cutoff(value); return `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)} ${value.slice(11)} · zona horaria no informada`;
}
