import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { backupReviewData, backupReviewBytes, backupReviewTotals, backupReviewCutoff, MAX_BACKUP_REVIEW_BYTES } from '../assets/grh-backup-review-model.js';
import { backupReviewFixture } from './fixtures/grh-backup-review-synthetic.js';
import { backupReviewMessage } from '../assets/grh-backup-review.js';

test('seven-table comparison preserves all overlapping change classes without claiming operational comparison', () => {
  const d = backupReviewData(backupReviewFixture()), totals = backupReviewTotals(d);
  assert.equal(d.domains.length, 7); assert.equal(d.issues.length, 42); assert.equal(totals.changed, 28n); assert.equal(totals.added, 14n); assert.equal(totals.removed, 7n);
  assert.equal(d.domains[0].changed, 1); assert.equal(d.domains[0].identityChanged + d.domains[0].statusChanged + d.domains[0].dateChanged, 3);
  assert.equal(d.scope.readyForPromotion, false); assert.equal(d.scope.canonicalCompared, false);
});
test('dump cutoff stays a declared civil timestamp with no inferred timezone', () => {
  const d = backupReviewData(backupReviewFixture()); assert.equal(d.candidate.cutoffAt, '2026-09-10 01:20:30');
  assert.equal(backupReviewCutoff(d.candidate.cutoffAt), '10/09/2026 01:20:30 · zona horaria no informada');
  assert.equal(d.generatedAt, '2026-09-14T08:42:00.123456Z');
});
test('zero changes is valid only with no issues and all comparison limits retained', () => {
  const d = backupReviewData(backupReviewFixture({ unchanged: true })); assert.equal(d.issues.length, 0); assert.equal(backupReviewTotals(d).changed, 0n); assert.equal(d.scope.readyForPromotion, false);
});
test('domain and issue ordering is normalized without altering the contract', () => {
  const p = backupReviewFixture(), a = backupReviewData(p); p.domains.reverse(); p.issues.reverse(); assert.deepEqual(backupReviewData(p), a);
});
for (const [name, mutate] of [
  ['nominal top-level content', p => p.personas = [{ nombre: 'PRIVATE_MARKER' }]], ['extra source path', p => p.candidate.path = 'PRIVATE_MARKER'],
  ['array hash', p => p.candidate.sha256 = ['b'.repeat(64)]], ['array issue code', p => p.issues[0].code = ['IDENTITY_CHANGED']],
  ['unknown issue with source text', p => p.issues[0].code = 'PRIVATE_MARKER'], ['source message', p => p.issues[0].message = 'PRIVATE_MARKER'],
  ['unknown table', p => p.domains[0].table = 'payroll_detail_statement'], ['missing domain', p => p.domains.pop()],
  ['duplicate domain', p => p.domains[1] = p.domains[0]], ['wrong database', p => p.candidate.database = 'PRIVATE_MARKER'],
  ['wrong version', p => p.version = 'grh-backup-review.v2'], ['wrong mapping', p => p.mappingVersion = 'grh-key-review.v2'],
  ['unknown tool', p => p.toolVersion = '1.1.0'], ['missing scope flag', p => delete p.scope.databaseWrites],
  ['invented promotion readiness', p => p.scope.readyForPromotion = true], ['invented canonical comparison', p => p.scope.canonicalCompared = true],
  ['identical backup hash', p => p.candidate.sha256 = p.baseline.sha256], ['same cutoff', p => p.candidate.cutoffAt = p.baseline.cutoffAt],
  ['older candidate', p => p.candidate.cutoffAt = '2026-07-01 10:00:00'], ['unknown cutoff', p => p.candidate.cutoffAt = ''],
  ['invented timezone', p => p.candidate.cutoffAt += 'Z'], ['impossible cutoff', p => p.candidate.cutoffAt = '2026-02-30 01:00:00'],
  ['non-UTC report time', p => p.generatedAt = '2026-09-14T08:42:00-03:00'], ['impossible report time', p => p.generatedAt = '2026-02-30T08:42:00Z'],
  ['zero bytes', p => p.candidate.bytes = 0], ['oversized backup', p => p.candidate.bytes = 2147483649],
  ['candidate count mismatch', p => p.domains[0].candidateRows++], ['baseline count mismatch', p => p.domains[0].baselineRows++],
  ['changed subset overflow', p => p.domains[0].identityChanged = 2], ['fractional count', p => p.domains[0].added = 2.5],
  ['negative count', p => p.domains[0].removed = -1], ['row limit', p => { p.domains[0].candidateRows = 100001; p.domains[0].added = 99980; }],
  ['missing issue', p => p.issues.pop()], ['duplicate issue', p => p.issues[1] = p.issues[0]],
  ['all-table aggregate', p => p.issues[0].table = 'all'], ['wrong issue count', p => p.issues[0].count++],
  ['zero issue', p => p.issues[0].count = 0],
]) test('rejects ' + name + ' without exposing source content', () => {
  const p = backupReviewFixture(); mutate(p); assert.throws(() => backupReviewData(p), e => /contrato de revisión local/.test(e.message) && !e.message.includes('PRIVATE_MARKER'));
});
test('local JSON has a strict 256KiB byte limit and UTF-8 validation', () => {
  const json = JSON.stringify(backupReviewFixture()), base = new TextEncoder().encode(json);
  assert.deepEqual(backupReviewBytes(base), backupReviewData(backupReviewFixture()));
  const exact = new Uint8Array(MAX_BACKUP_REVIEW_BYTES); exact.fill(32); exact.set(base); assert.ok(backupReviewBytes(exact));
  assert.throws(() => backupReviewBytes(new Uint8Array(MAX_BACKUP_REVIEW_BYTES + 1)));
  assert.throws(() => backupReviewBytes(new Uint8Array())); assert.throws(() => backupReviewBytes(new Uint8Array([255])));
  assert.throws(() => backupReviewBytes(new TextEncoder().encode('CREATE TABLE PRIVATE_MARKER')));
});
test('panel is independent from integrationquality content and guarded by existing lineage capability', () => {
  const html = fs.readFileSync(new URL('../integracion-datos.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('id="revisar-respaldo"') < html.indexOf('<main id="content" hidden>'));
  assert.match(html, /data-grh-backup-review data-requires-any-capability="lineage\.read" hidden/);
  const ui = fs.readFileSync(new URL('../assets/grh-backup-review.js', import.meta.url), 'utf8');
  assert.match(ui, /MuniControlCapabilityGate\?\.ready/); assert.match(ui, /tenantCapabilities\.includes\('lineage\.read'\)/);
  assert.doesNotMatch(ui, /file\.name|localStorage|sessionStorage|indexedDB|sendBeacon|method:\s*['"]POST|contentBase64/);
  assert.doesNotMatch(ui, /Comparación offline|datos canónicos|hechos de nómina|promover datos/);
  assert.match(ui, /Comparación en este equipo/); assert.match(ui, /registros incorporados en MuniControl/);
  assert.match(ui, /detalle de las liquidaciones/); assert.match(ui, /fichadas, documentos y acciones propias/);
});
test('unexpected session and local-file errors never display server fragments or personal filenames', () => {
  for (const error of [new SyntaxError('PRIVATE_PERSON in server JSON'), new Error('Could not read C:/PRIVATE_PERSON.pdf'), new TypeError('PRIVATE_PERSON'), { message: 'PRIVATE_PERSON' }, null]) {
    assert.equal(backupReviewMessage(error), 'No se pudo abrir el informe. Conservamos la selección para reintentar.');
  }
  try { backupReviewData({ nominal: 'PRIVATE_PERSON' }); } catch (error) { assert.match(backupReviewMessage(error), /contrato de revisión local/); assert.doesNotMatch(backupReviewMessage(error), /PRIVATE_PERSON/); }
});
