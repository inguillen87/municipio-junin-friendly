import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { coreReviewData, coreReviewBytes, coreReviewTotals, coreReviewCutoff, CORE_REVIEW_DOMAINS, MAX_CORE_REVIEW_BYTES } from '../assets/grh-core-review-model.js';
import { localGrhReviewBytes, backupReviewMessage } from '../assets/grh-backup-review.js';
import { coreReviewFixture } from './fixtures/grh-core-review-synthetic.js';
import { backupReviewFixture } from './fixtures/grh-backup-review-synthetic.js';
import { compareCoreRows } from '../scripts/compare-grh-core-artifacts.mjs';

const encoded = value => new TextEncoder().encode(JSON.stringify(value));

test('five-domain core report validates exact aggregates and preserves source timestamps without inferring a timezone', () => {
  const data = coreReviewData(coreReviewFixture()), totals = coreReviewTotals(data);
  assert.deepEqual(Object.keys(data.artifacts), CORE_REVIEW_DOMAINS);
  assert.deepEqual([totals.added, totals.removed, totals.changed], [10n, 5n, 15n]);
  assert.equal(data.artifacts.payrollMonthly.changed, 4);
  assert.equal(data.semantics.monthlyHistoryKeyOverlap, 24);
  assert.equal(coreReviewCutoff(data.candidate.cutoff), '10/09/2026 15:45:00 · zona horaria no informada');
  assert.equal(data.baseline.sourceSha256, 'a'.repeat(64));
  assert.equal(data.publicationAuthorized, false);
  assert.equal(data.semantics.payrollSnapshotIsPaymentEvidence, false);
});

test('comparison generator row metrics pass browser validation without exposing any source payload', async () => {
  const row = (id, text) => ({ sourceKey: { id }, text });
  const metrics = await compareCoreRows([row('private-1', 'A'), row('private-2', 'B'), row('private-3', 'C')],
    [row('private-1', 'A'), row('private-2', 'B corrected'), row('private-4', 'D')]);
  const report = coreReviewFixture();
  report.artifacts = Object.fromEntries(CORE_REVIEW_DOMAINS.map(name => [name, { ...metrics }]));
  report.semantics.monthlyHistoryKeyOverlap = metrics.unchanged + metrics.changed;
  const parsed = coreReviewData(report);
  assert.equal(coreReviewTotals(parsed).changed, 5n);
  assert.doesNotMatch(JSON.stringify(parsed), /private-|corrected|"sourceKey"\s*:/);
});

test('zero changes retains all scope restrictions and immutable output', () => {
  const input = coreReviewFixture({ unchanged: true }), data = coreReviewData(input);
  assert.equal(coreReviewTotals(data).changed, 0n);
  assert.equal(data.publicationAuthorized, false);
  assert.equal(data.databaseWrites, false);
  input.artifacts.payrollMonthly.unchanged = 0;
  assert.equal(data.artifacts.payrollMonthly.unchanged, 20);
  assert.ok(Object.isFrozen(data.artifacts.payrollMonthly));
  assert.ok(Object.isFrozen(data.semantics));
});

test('same local parser accepts the existing seven-table contract and the new five-domain contract', () => {
  assert.equal(localGrhReviewBytes(encoded(backupReviewFixture())).domains.length, 7);
  assert.equal(Object.keys(localGrhReviewBytes(encoded(coreReviewFixture())).artifacts).length, 5);
});

for (const [name, mutate] of [
  ['unknown version', p => { p.version = 'grh-core-artifact-comparison.v2'; }],
  ['unexpected root field', p => { p.people = [{ name: 'PRIVATE_MARKER' }]; }],
  ['unknown artifact', p => { p.artifacts.personas = {}; }],
  ['missing domain', p => { delete p.artifacts.movements; }],
  ['artifact array', p => { p.artifacts = Object.values(p.artifacts); }],
  ['nominal row field', p => { p.artifacts.payrollMonthly.employeeName = 'PRIVATE_MARKER'; }],
  ['nominal source key', p => { p.artifacts.payrollSnapshot.sourceKey = 'PRIVATE_MARKER'; }],
  ['private source path', p => { p.candidate.path = 'C:/PRIVATE_MARKER.sql'; }],
  ['private manifest path', p => { p.baseline.manifestSha256 = 'C:/PRIVATE_MARKER.json'; }],
  ['source payload', p => { p.artifacts.movements.source_payload = { name: 'PRIVATE_MARKER' }; }],
  ['invented verification status', p => { p.status = 'approved'; }],
  ['invented publication approval', p => { p.publicationAuthorized = true; }],
  ['invented database write', p => { p.databaseWrites = true; }],
  ['missing restriction', p => { delete p.publicationAuthorized; }],
  ['boolean array', p => { p.databaseWrites = [false]; }],
  ['malformed hash', p => { p.candidate.sourceSha256 = 'b'.repeat(63); }],
  ['hash array', p => { p.candidate.sourceSha256 = ['b'.repeat(64)]; }],
  ['identical source hash with different case', p => { p.candidate.sourceSha256 = p.baseline.sourceSha256.toLowerCase(); }],
  ['identical manifest hash', p => { p.candidate.manifestSha256 = p.baseline.manifestSha256; }],
  ['unknown profile text', p => { p.candidate.profileId = 'PRIVATE_MARKER'; }],
  ['profile mismatch with cutoff', p => { p.candidate.profileId = p.baseline.profileId; }],
  ['inferred timezone', p => { p.candidate.cutoff += 'Z'; }],
  ['impossible source date', p => { p.candidate.cutoff = '2026-02-30T15:00:00'; p.candidate.profileId = 'grh-junin-2026-02-30'; }],
  ['date outside range', p => { p.candidate.cutoff = '2200-01-01T15:00:00'; p.candidate.profileId = 'grh-junin-2200-01-01'; }],
  ['impossible source time', p => { p.candidate.cutoff = '2026-09-10T25:00:00'; }],
  ['equal cutoff', p => { p.candidate.cutoff = p.baseline.cutoff; p.candidate.profileId = p.baseline.profileId; }],
  ['older candidate', p => { p.candidate.cutoff = '2026-07-10T15:00:00'; p.candidate.profileId = 'grh-junin-2026-07-10'; }],
  ['candidate row mismatch', p => { p.artifacts.movements.candidateRows++; }],
  ['baseline row mismatch', p => { p.artifacts.movements.baselineRows++; }],
  ['fractional count', p => { p.artifacts.movements.added = 0.5; }],
  ['negative count', p => { p.artifacts.movements.removed = -1; }],
  ['string count', p => { p.artifacts.movements.changed = '3'; }],
  ['unsafe integer count', p => { p.artifacts.movements.baselineRows = Number.MAX_SAFE_INTEGER + 1; }],
  ['row range overflow', p => { p.artifacts.payrollSnapshot.baselineRows = 100001; }],
  ['negative bytes', p => { p.artifacts.movements.baselineLogicalPayloadBytes = -1; }],
  ['fractional bytes', p => { p.artifacts.movements.addedLogicalPayloadBytes = 0.5; }],
  ['byte range overflow', p => { p.artifacts.movements.candidateLogicalPayloadBytes = 2147483649; }],
  ['bytes below row count', p => { p.artifacts.movements.baselineLogicalPayloadBytes = 1; }],
  ['zero changed bytes', p => { p.artifacts.movements.changedPreviousLogicalPayloadBytes = 0; }],
  ['changed bytes exceeding baseline', p => { p.artifacts.movements.changedPreviousLogicalPayloadBytes = p.artifacts.movements.baselineLogicalPayloadBytes + 1; }],
  ['added bytes exceeding candidate', p => { p.artifacts.movements.addedLogicalPayloadBytes = p.artifacts.movements.candidateLogicalPayloadBytes + 1; }],
  ['overlap recount mismatch', p => { p.semantics.monthlyHistoryKeyOverlap++; }],
  ['overlap string', p => { p.semantics.monthlyHistoryKeyOverlap = '24'; }],
  ['untrusted semantics text', p => { p.semantics.keys = 'PRIVATE_MARKER'; }],
  ['unknown semantics field', p => { p.semantics.message = 'PRIVATE_MARKER'; }],
  ['invented employee terminations', p => { p.semantics.removedRowsAreEmployeeTerminations = true; }],
  ['invented payment proof', p => { p.semantics.payrollSnapshotIsPaymentEvidence = true; }],
  ['invented database size', p => { p.semantics.bytesAreDatabaseStorageMeasurement = true; }],
  ['invented compatible monthly schema', p => { p.semantics.currentSchemaSupportsOverlappingMonthlyVersions = true; }],
]) test(`rejects ${name} without reflecting the source value`, () => {
  const report = coreReviewFixture(); mutate(report);
  assert.throws(() => coreReviewData(report), error => /contrato de revisión local/.test(backupReviewMessage(error)) && !error.message.includes('PRIVATE_MARKER'));
});

test('empty artifacts are valid only with all counts and bytes zero', () => {
  const report = coreReviewFixture();
  report.artifacts = Object.fromEntries(CORE_REVIEW_DOMAINS.map(name => [name, Object.fromEntries(Object.keys(report.artifacts[name]).map(key => [key, 0]))]));
  report.semantics.monthlyHistoryKeyOverlap = 0;
  assert.equal(coreReviewTotals(coreReviewData(report)).baselineRows, 0n);
  report.artifacts.movements.baselineLogicalPayloadBytes = 1;
  assert.throws(() => coreReviewData(report));
});

test('unchanged byte totals must remain equal when all rows are unchanged', () => {
  const report = coreReviewFixture({ unchanged: true });
  report.artifacts.movements.candidateLogicalPayloadBytes++;
  assert.throws(() => coreReviewData(report));
});

test('local byte parser bounds size and rejects invalid UTF-8, SQL and malformed JSON safely', () => {
  const bytes = encoded(coreReviewFixture()), limit = new Uint8Array(MAX_CORE_REVIEW_BYTES); limit.fill(32); limit.set(bytes);
  assert.deepEqual(coreReviewBytes(limit), coreReviewData(coreReviewFixture()));
  for (const input of [new Uint8Array(), new Uint8Array(MAX_CORE_REVIEW_BYTES + 1), new Uint8Array([255]), encoded('CREATE TABLE PRIVATE_MARKER'), new TextEncoder().encode('{PRIVATE_MARKER')]) {
    assert.throws(() => coreReviewBytes(input), error => !error.message.includes('PRIVATE_MARKER'));
    assert.throws(() => localGrhReviewBytes(input), error => !error.message.includes('PRIVATE_MARKER'));
  }
});

test('UI preserves local-only scope and obtains correction totals from the validated report', () => {
  const ui = readFileSync(new URL('../assets/grh-backup-review.js', import.meta.url), 'utf8');
  assert.match(ui, /shown\(data\.artifacts\.payrollMonthly\.changed\)/);
  assert.match(ui, /conservan su clave y tienen contenido distinto/);
  assert.match(ui, /no autoriza cargar o reemplazar datos, pagar ni dar de baja/);
  assert.doesNotMatch(ui, /\b811\b|file\.name|localStorage|sessionStorage|indexedDB|sendBeacon|method:\s*['"]POST/);
  const build = readFileSync(new URL('../scripts/build-friendly.mjs', import.meta.url), 'utf8');
  assert.match(build, /'assets\/grh-core-review-model\.js'/);
});
