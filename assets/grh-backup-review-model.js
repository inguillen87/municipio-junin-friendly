import { civilDate } from './civil-date.js';

export const BACKUP_REVIEW_VERSION = 'grh-backup-review.v1';
export const MAX_BACKUP_REVIEW_BYTES = 256 * 1024;
export class BackupReviewError extends Error {}
export const BACKUP_REVIEW_TABLES = Object.freeze(['persona', 'legajo', 'familia', 'vinculo', 'histocal', 'histolegajo', 'organiza']);
export const BACKUP_REVIEW_LABELS = Object.freeze({ persona: 'Personas', legajo: 'Legajos', familia: 'Familiares', vinculo: 'Vínculos', histocal: 'Historial de cálculo', histolegajo: 'Historial de legajos', organiza: 'Organización' });
export const BACKUP_REVIEW_ISSUES = Object.freeze({ IDENTITY_CHANGED: 'Cambios de identidad', REMOVED_ROWS: 'Registros ausentes en el candidato', STATUS_CHANGED: 'Cambios de estado', DATE_CHANGED: 'Cambios de fecha', ADDED_ROWS: 'Registros nuevos', CHANGED_ROWS: 'Registros modificados' });
const issueCounters = Object.freeze({ IDENTITY_CHANGED: 'identityChanged', REMOVED_ROWS: 'removed', STATUS_CHANGED: 'statusChanged', DATE_CHANGED: 'dateChanged', ADDED_ROWS: 'added', CHANGED_ROWS: 'changed' });
const counters = ['baselineRows', 'candidateRows', 'unchanged', 'added', 'removed', 'changed', 'identityChanged', 'statusChanged', 'dateChanged'];
const hash = /^[a-f0-9]{64}$/;
const exact = (v, fields) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join(',') === [...fields].sort().join(',');
const count = n => Number.isSafeInteger(n) && n >= 0;
const fail = () => { throw new BackupReviewError('El informe no cumple el contrato de revisión local. Generá nuevamente el informe agregado con la herramienta correspondiente.'); };
function cutoff(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} (?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value)) fail();
  try { civilDate(value.slice(0, 10)); } catch { fail(); } return value;
}
function source(value) {
  if (!exact(value, ['sha256', 'bytes', 'cutoffAt', 'database']) || typeof value.sha256 !== 'string' || !hash.test(value.sha256) || !count(value.bytes) || !value.bytes || value.bytes > 2147483648 || value.database !== 'grh_junin') fail();
  return Object.freeze({ sha256: value.sha256, bytes: value.bytes, cutoffAt: cutoff(value.cutoffAt), database: value.database });
}
export function backupReviewData(value) {
  if (!exact(value, ['version', 'toolVersion', 'mappingVersion', 'generatedAt', 'baseline', 'candidate', 'domains', 'issues', 'scope'])
    || value.version !== BACKUP_REVIEW_VERSION || value.toolVersion !== '1.0.0' || value.mappingVersion !== 'grh-key-review.v1'
    || typeof value.generatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?Z$/.test(value.generatedAt)
    || !Number.isFinite(Date.parse(value.generatedAt))) fail();
  try { civilDate(value.generatedAt.slice(0, 10)); } catch { fail(); }
  const scope = value.scope;
  if (!exact(scope, ['comparisonOnly', 'readyForPromotion', 'databaseWrites', 'canonicalCompared', 'payrollFactsCompared', 'operationalEvidenceCompared'])
    || scope.comparisonOnly !== true || scope.readyForPromotion !== false || scope.databaseWrites !== false
    || scope.canonicalCompared !== false || scope.payrollFactsCompared !== false || scope.operationalEvidenceCompared !== false) fail();
  const baseline = source(value.baseline), candidate = source(value.candidate);
  if (baseline.sha256 === candidate.sha256 || baseline.cutoffAt >= candidate.cutoffAt || !Array.isArray(value.domains) || value.domains.length !== 7) fail();
  const seen = new Set();
  const domains = value.domains.map(d => {
    if (!exact(d, ['table', ...counters]) || !BACKUP_REVIEW_TABLES.includes(d.table) || seen.has(d.table) || !counters.every(k => count(d[k])) || d.baselineRows > 100000 || d.candidateRows > 100000
      || BigInt(d.added) + BigInt(d.unchanged) + BigInt(d.changed) !== BigInt(d.candidateRows)
      || BigInt(d.removed) + BigInt(d.unchanged) + BigInt(d.changed) !== BigInt(d.baselineRows)
      || ['identityChanged', 'statusChanged', 'dateChanged'].some(k => d[k] > d.changed)) fail();
    seen.add(d.table); return Object.freeze(Object.fromEntries(['table', ...counters].map(k => [k, d[k]])));
  }).sort((a, b) => BACKUP_REVIEW_TABLES.indexOf(a.table) - BACKUP_REVIEW_TABLES.indexOf(b.table));
  if (!Array.isArray(value.issues) || value.issues.length > 42) fail();
  const pairs = new Set();
  const issues = value.issues.map(i => {
    if (!exact(i, ['code', 'table', 'count']) || typeof i.code !== 'string' || !Object.hasOwn(BACKUP_REVIEW_ISSUES, i.code) || !BACKUP_REVIEW_TABLES.includes(i.table)
      || !count(i.count) || !i.count || pairs.has(i.code + ':' + i.table) || domains.find(d => d.table === i.table)[issueCounters[i.code]] !== i.count) fail();
    pairs.add(i.code + ':' + i.table); return Object.freeze({ code: i.code, table: i.table, count: i.count });
  }).sort((a, b) => a.table.localeCompare(b.table) || a.code.localeCompare(b.code));
  if (domains.some(d => Object.entries(issueCounters).some(([code, field]) => d[field] > 0 && !pairs.has(code + ':' + d.table)))) fail();
  return Object.freeze({ version: value.version, toolVersion: value.toolVersion, mappingVersion: value.mappingVersion, generatedAt: value.generatedAt,
    baseline, candidate, domains: Object.freeze(domains), issues: Object.freeze(issues), scope: Object.freeze({ ...scope }) });
}
export function backupReviewBytes(bytes) {
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > MAX_BACKUP_REVIEW_BYTES) throw new BackupReviewError('Elegí un informe JSON de hasta 256 KiB. El respaldo SQL no se abre desde esta pantalla.');
  let value; try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { fail(); }
  return backupReviewData(value);
}
export function backupReviewTotals(data) {
  return Object.fromEntries(counters.map(k => [k, data.domains.reduce((sum, d) => sum + BigInt(d[k]), 0n)]));
}
export function backupReviewCutoff(value) {
  cutoff(value); return value.slice(8, 10) + '/' + value.slice(5, 7) + '/' + value.slice(0, 4) + ' ' + value.slice(11) + ' · zona horaria no informada';
}
