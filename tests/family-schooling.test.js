import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { unzipSync, strFromU8 } from 'fflate';
import { schoolingData, schoolingFilter, schoolingRevision, schoolingDate, certificateState, certificateDates, certificateFile } from '../assets/family-schooling-model.js';
import { schoolingXlsx } from '../assets/family-schooling-export.js';
import { schoolingFixture, syntheticUuid } from './fixtures/family-schooling-synthetic.js';

test('active roster distinguishes contracts, children and recorded certificates', () => {
  const data = schoolingData(schoolingFixture()), view = schoolingFilter(data);
  assert.equal(view.counts.contracts, 38); assert.equal(view.counts.children, 75); assert.equal(view.counts.registered, 50);
  assert.equal(view.counts.unregistered, 25); assert.equal(data.scope.currentCensusCertified, false);
});
test('null names and long source legajos remain usable without invented identity', () => {
  const p = schoolingFixture(1); p.data.rows[0].employeeName = null; p.data.rows[0].familyName = null; p.data.rows[0].legajo = '0'.repeat(64);
  const data = schoolingData(p); assert.equal(schoolingFilter(data).rows.length, 1);
  assert.equal(schoolingFilter(data, { search: 'null' }).rows.length, 0);
});
test('unknown dates and missing registration never mean not presented', () => {
  const p = schoolingFixture(1); p.data.rows[0].birthDate = null;
  const data = schoolingData(p), row = data.rows[0];
  assert.equal(row.certificate, null); assert.equal(certificateState(row), 'Sin registro en MuniControl');
  assert.equal(schoolingFilter(data, { status: 'unregistered' }).rows.length, 1);
  assert.doesNotMatch(JSON.stringify(data), /not_presented|eligible|pending_certificate/);
});
test('date comparisons use explicit registered dates, with no expiry or ordering invented', () => {
  const data = schoolingData(schoolingFixture(3));
  assert.deepEqual(certificateDates('2026-04-04', '2025-12-31'), { presentedOn: '2026-04-04', expiresOn: '2025-12-31' });
  assert.deepEqual(certificateDates('2026-04-04', ''), { presentedOn: '2026-04-04', expiresOn: null });
  assert.equal(schoolingFilter(data, { status: 'expired', asOf: '2026-04-04' }).rows.length, 1);
  assert.equal(schoolingFilter(data, { status: 'no_expiry' }).rows.length, 1);
  assert.throws(() => certificateDates('2026-02-30', ''));
});
test('family read permits an inactive contract but report rejects it', () => {
  const p = schoolingFixture(2, { contractId: syntheticUuid(1) }); p.data.rows[0].administrativeActive = false;
  assert.equal(schoolingData(p, { resource: 'family', contractId: syntheticUuid(1) }).rows[0].administrativeActive, false);
  p.data.scope.cohort = 'administrative_active_with_children'; assert.throws(() => schoolingData(p));
});
for (const [label, modify] of [
  ['duplicate child', p => p.data.rows.push(p.data.rows[0])], ['wrong contract', p => p.data.rows[0].contractId = 'outside'],
  ['identity token missing', p => delete p.data.rows[0].identityToken], ['nonnumeric child identity', p => p.data.rows[0].familyId = 'QA-123'], ['invented census', p => p.data.scope.currentCensusCertified = true],
  ['registration count without certificate', p => p.data.rows[0].historyCount = 2], ['certificate with zero history', p => p.data.rows[1].historyCount = 0],
  ['invalid presentation', p => p.data.rows[1].certificate.presentedOn = '2026-02-30'], ['oversized PDF metadata', p => p.data.rows[1].certificate.byteLength = 2097153],
  ['invalid capture date', p => p.data.rows[0].sourceCutoff = 'not-a-date'], ['unknown canRegister', p => delete p.data.canRegister],
]) test('rejects report drift: ' + label, () => { const p = schoolingFixture(3); modify(p); assert.throws(() => schoolingData(p)); });
test('atomic dataset accepts 5000 and refuses overflow, never truncates', () => {
  assert.equal(schoolingData(schoolingFixture(5000)).rows.length, 5000);
  assert.throws(() => schoolingData(schoolingFixture(5001)));
});
test('search finds a child beyond the first local page', () => {
  const data = schoolingData(schoolingFixture()); assert.equal(schoolingFilter(data, { search: '0075' }).rows[0].familyId, '75');
});
test('PostgreSQL microseconds render and remain exact in revision and workbook', () => {
  const p = schoolingFixture(2), data = schoolingData(p), stamp = '2026-09-14T10:20:30.123456+00:00';
  assert.equal(data.rows[1].certificate.recordedAt, stamp); assert.equal(schoolingDate(stamp), '14/9/2026');
  const zip = unzipSync(schoolingXlsx(data, schoolingFilter(data), '2026-09-14T12:00:00Z'));
  assert.match(strFromU8(zip['xl/worksheets/sheet1.xml']), /10:20:30\.123456\+00:00/);
  const before = schoolingRevision(data); p.data.rows[0].sourceCutoff = '2026-08-06T18:15:22Z';
  assert.notEqual(schoolingRevision(schoolingData(p)), before);
  p.data.rows[0].sourceCutoff = data.rows[0].sourceCutoff; p.data.scope.sourceCutoffTo = '2026-08-06T19:15:21Z';
  assert.notEqual(schoolingRevision(schoolingData(p)), before);
  assert.match(strFromU8(zip['xl/worksheets/sheet2.xml']), /2026-08-06T18:15:21Z/);
});
test('Excel exports more than 2000 rows, preserves legajos, and contains no executable source formulas or private IDs', () => {
  const p = schoolingFixture(2501); p.data.rows[0].familyName = '=HYPERLINK("https://invalid.example")';
  p.data.rows[0].employeeName = '<img onerror="private">';
  const data = schoolingData(p), view = schoolingFilter(data), zip = unzipSync(schoolingXlsx(data, view, '2026-09-14T12:00:00Z'));
  const sheet = strFromU8(zip['xl/worksheets/sheet1.xml']), control = strFromU8(zip['xl/worksheets/sheet2.xml']);
  assert.equal((sheet.match(/<row /g) || []).length, 2502);
  assert.match(sheet, /t="inlineStr"[^]*000001/); assert.match(sheet, /=HYPERLINK\(&quot;/); assert.match(sheet, /&lt;img/);
  assert.doesNotMatch(sheet, /<f>|<hyperlink|70000000-|identityToken|dni|cuil/i);
  assert.match(control, /No aprueba escolaridad/); assert.match(control, /No permite afirmar que el certificado no se presentó/);
});
test('exports use the complete selected filter and reject foreign rows', () => {
  const data = schoolingData(schoolingFixture()), view = schoolingFilter(data, { status: 'unregistered' });
  const zip = unzipSync(schoolingXlsx(data, view, '2026-09-14T12:00:00Z'));
  assert.equal((strFromU8(zip['xl/worksheets/sheet1.xml']).match(/<row /g) || []).length, 26);
  assert.throws(() => schoolingXlsx(data, { ...view, rows: [{ ...view.rows[0] }] }, '2026-09-14T12:00:00Z'));
});
test('export revision follows rows and source while capacity and registration permission remain independent', () => {
  const p = schoolingFixture(), before = schoolingRevision(schoolingData(p)); p.data.canRegister = false;
  p.data.storage.remainingBytes = 0; p.data.storage.usedBytes = p.data.storage.capacityBytes;
  assert.equal(schoolingRevision(schoolingData(p)), before);
  p.data.rows[1].certificate.presentedOn = '2026-04-05';
  assert.notEqual(schoolingRevision(schoolingData(p)), before);
});
test('lowered or exhausted shared capacity preserves report rows and existing documents', () => {
  const p = schoolingFixture(2); p.data.canRegister = false;
  p.data.storage = { mode: 'database_pilot', capacityBytes: 0, usedBytes: 1000, remainingBytes: 0 };
  const data = schoolingData(p), view = schoolingFilter(data);
  assert.equal(data.storage.usedBytes, 1000); assert.equal(view.rows.length, 2); assert.ok(data.rows[1].certificate);
  assert.ok(schoolingXlsx(data, view, '2026-09-14T12:00:00Z').length > 0);
});
for (const [label, modify] of [
  ['missing capacity contract', p => delete p.data.storage], ['unrecognized storage mode', p => p.data.storage.mode = 'unlimited'],
  ['excess global ceiling', p => p.data.storage.capacityBytes = 8388609], ['negative capacity', p => p.data.storage.capacityBytes = -1],
  ['negative usage', p => p.data.storage.usedBytes = -1], ['fractional availability', p => p.data.storage.remainingBytes = 1.5],
  ['overstated availability', p => p.data.storage.remainingBytes = 8388608], ['registration enabled with no space', p => p.data.storage.remainingBytes = 0],
]) test('rejects storage contract drift: ' + label, () => { const p = schoolingFixture(2); modify(p); assert.throws(() => schoolingData(p)); });
test('file precheck is bounded and accepts PDFs only', () => {
  assert.equal(certificateFile({ name: 'certificado.pdf', type: 'application/pdf', size: 2097152 }).size, 2097152);
  for (const file of [{ name: 'file.xlsx', size: 2 }, { name: 'file.pdf', size: 0 }, { name: 'file.pdf', size: 2097153 }, { name: 'file.pdf', size: 2, type: 'text/html' }]) assert.throws(() => certificateFile(file));
});
test('report route and real family hook stay independent of external XLSX diagnosis', () => {
  const report = fs.readFileSync('assets/report-centre.js', 'utf8'), page = fs.readFileSync('internal-dashboard.html', 'utf8');
  assert.match(report, /mountSchoolingReport/); assert.match(report, /id:'certificados-escolares'/); assert.match(report, /escolaridades:'formatos'/);
  assert.match(page, /data-family-schooling-ficha/); assert.match(page, /employee\.record\.propose/); assert.match(page, /mc:family-schooling-close/);
  for (const match of page.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) if (!/src=|type="module"/.test(match[1])) new vm.Script(match[2]);
});
