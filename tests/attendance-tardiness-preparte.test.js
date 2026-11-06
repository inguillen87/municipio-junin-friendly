import test from 'node:test';
import assert from 'node:assert/strict';
import { clockSeconds, referenceStart, activeExceptions, dayLateMinutes, monthlyTardiness, reviewTardinessSelections,
  reviewPreparteAll, TARDINESS_DEFAULT, fractionLabel } from '../assets/attendance-tardiness-model.js';
import { appendPreparteRows, emptySheetRow } from '../assets/payroll-novelty-sheet-model.js';
import { preparteSynthetic } from './fixtures/attendance-preparte-synthetic.js';
import { preparteEntryProfile } from '../lib/attendance-preparte.js';
import { preparteXlsx } from '../assets/attendance-preparte-export.js';
import { unzipSync, strFromU8 } from 'fflate';

const graciela = { id: 'e1', legajo: '9001', kind: 'salida_transitoria', weekdays: [1, 2, 3, 4, 5], from: '07:30', to: '08:30',
  validFrom: '2026-03-01', validTo: null, revokedAt: null };
const reviewed = { documentReference: 'Listado QA de Personal versión 1', confirmed: true };

test('default rule keeps the law thresholds and Junín monthly bands', () => {
  assert.equal(TARDINESS_DEFAULT.concept, '101');
  assert.deepEqual(TARDINESS_DEFAULT.bands.map(b => [b.minExclusive, b.maxInclusive, b.candidateJornadaDiscountPercent]),
    [[null, 5, 0], [5, 15, 25], [15, 60, 50], [60, 150, 75], [150, null, 100]]);
  assert.equal(fractionLabel(25), '¼ de jornada'); assert.equal(fractionLabel(100), 'Jornada completa');
});

test('clock parsing, reference start and arrival profile per clock', () => {
  assert.equal(clockSeconds('07:05'), 25500); assert.equal(clockSeconds('07:05:30'), 25530);
  for (const bad of ['7:05', '24:00', '07:60', '', null]) assert.equal(clockSeconds(bad), null);
  assert.equal(referenceStart(['01 06:52:00', '02 06:58:10', '03 07:20:00']), '07:00');
  assert.equal(referenceStart(['01 07:40:00', '02 07:44:00', '03 07:50:00']), '07:00');
  assert.equal(referenceStart(['01 07:46:00', '02 07:50:00', '03 07:55:00']), '08:00');
  assert.equal(referenceStart(['01 06:10:00', '02 06:20:00', '03 06:40:00']), '06:00');
  assert.equal(referenceStart([]), '');
  assert.equal(preparteEntryProfile('pm-14'), 'order'); assert.equal(preparteEntryProfile('pm-05'), 'order');
  assert.equal(preparteEntryProfile('pm-10'), 'codes');
});

test('authorized windows cover lateness; exempt days never count; seconds floor to whole minutes', () => {
  assert.deepEqual(dayLateMinutes({ arrival: '07:05:59', start: '07:00' }), { lateMinutes: 5, excused: false });
  assert.deepEqual(dayLateMinutes({ arrival: '06:59:00', start: '07:00' }), { lateMinutes: 0, excused: false });
  // Arrives 08:30 with the 07:30–08:30 window: only 07:00–07:30 is late.
  assert.deepEqual(dayLateMinutes({ arrival: '08:30:00', start: '07:00', exceptions: [graciela] }), { lateMinutes: 30, excused: true });
  assert.deepEqual(dayLateMinutes({ arrival: '08:00:00', start: '07:00', exceptions: [{ kind: 'entrada_diferida', from: '07:00', to: '08:00' }] }), { lateMinutes: 0, excused: true });
  assert.deepEqual(dayLateMinutes({ arrival: '10:00:00', start: '07:00', exceptions: [{ kind: 'exento', from: null, to: null }] }), { lateMinutes: 0, excused: true });
});

test('exceptions apply only on their weekdays, validity and before revocation', () => {
  assert.equal(activeExceptions([graciela], '9001', '2026-09-07').length, 1); // lunes
  assert.equal(activeExceptions([graciela], '9001', '2026-09-06').length, 0); // domingo
  assert.equal(activeExceptions([graciela], '9002', '2026-09-07').length, 0);
  assert.equal(activeExceptions([{ ...graciela, validTo: '2026-09-04' }], '9001', '2026-09-07').length, 0);
  assert.equal(activeExceptions([{ ...graciela, revokedAt: '2026-09-07T12:00:00Z' }], '9001', '2026-09-07').length, 0);
  assert.equal(activeExceptions([{ ...graciela, revokedAt: '2026-09-08T12:00:00Z' }], '9001', '2026-09-07').length, 1);
});

test('monthly accumulation: bands 0, ¼, ½, ¾ and 1 day; window days excused', () => {
  const month = (entries, exceptions = []) => monthlyTardiness({ period: '2026-09', entries, start: '07:00', legajo: '9001', exceptions });
  assert.equal(month(['01 07:05:00']).units, null);
  assert.equal(month(['01 07:06:00']).units, '0.25');
  assert.equal(month(['01 07:10:00', '02 07:06:00']).units, '0.5');
  assert.equal(month(['01 08:01:00']).units, '0.75');
  assert.equal(month(['01 09:00:00', '02 07:31:00']).units, '1');
  const excused = month(['07 08:30:00', '08 08:30:00'], [graciela]);
  assert.equal(excused.totalLateMinutes, 60); assert.equal(excused.excusedDays, 2); assert.equal(excused.units, '0.5');
  assert.throws(() => month(['01 07:10:00']).units && monthlyTardiness({ period: '2026-09', entries: [], start: '7:00', legajo: '9001' }), /HH:MM/);
});

test('review produces concept 101 rows in day fractions and the sheet adapter accepts them once per legajo', async () => {
  const data = await preparteSynthetic(), row = data.rows.find(r => r.legajo === '9001');
  row.entries = ['01 07:20:00', '02 07:10:00'];
  const decisions = new Map([[row.key, { selected: true, start: '07:00' }]]);
  const review = reviewTardinessSelections(data, decisions, { documentReference: reviewed.documentReference, exceptions: [] });
  assert.equal(review.issues.length, 0); assert.equal(review.rows.length, 1);
  const [sheet] = review.rows; assert.equal(sheet[1], '101'); assert.equal(sheet[4], '0.5'); assert.equal(sheet[9], 'NO');
  assert.ok(sheet[8].length >= 20 && sheet[8].length <= 500); assert.match(sheet[8], /Ley 5\.811/);
  const combined = appendPreparteRows([emptySheetRow('999', '1', '30')], review.rows);
  assert.equal(combined.length, 2);
  assert.throws(() => appendPreparteRows(combined, review.rows), /ya tiene el concepto 101/);
  assert.throws(() => appendPreparteRows([], [[...sheet.slice(0, 4), '0.3', ...sheet.slice(5)]]), /fila inválida/);
});

test('no exceptions read, an unlinked row or no discount block the proposal instead of guessing', async () => {
  const data = await preparteSynthetic(), row = data.rows.find(r => r.legajo === '9001');
  row.entries = ['01 07:20:00'];
  const decisions = new Map([[row.key, { selected: true, start: '07:00' }]]);
  assert.match(reviewTardinessSelections(data, decisions, { exceptions: null }).issues[0].message, /excepciones horarias/);
  row.entries = ['01 07:03:00'];
  assert.match(reviewTardinessSelections(data, decisions, { exceptions: [] }).issues[0].message, /no corresponde descuento/);
  row.entryReady = false;
  assert.match(reviewTardinessSelections(data, decisions, { exceptions: [] }).issues[0].message, /vínculo/);
});

test('combined review: tardiness alone still needs document and acknowledgment; both kinds go in one transfer', async () => {
  const data = await preparteSynthetic(), row = data.rows.find(r => r.legajo === '9001');
  row.entries = ['01 07:20:00']; row.extraSeconds = 3 * 3600;
  const td = new Map([[row.key, { selected: true, start: '07:00' }]]);
  const missing = reviewPreparteAll(data, new Map(), td, { documentReference: '', confirmed: false, exceptions: [] });
  assert.deepEqual(missing.issues.map(i => i.field), ['reference', 'reviewed']); assert.equal(missing.rows.length, 0);
  const md = new Map([[row.key, { selected: true, hours: '03:00', cap: '5', percent: '5' }]]);
  const both = reviewPreparteAll(data, md, td, { ...reviewed, exceptions: [] });
  assert.equal(both.valid, true); assert.deepEqual(both.rows.map(r => r[1]), ['44', '101']);
  assert.equal(appendPreparteRows([], both.rows).length, 2);
});

test('Excel export adds a Tardanzas sheet only when tardiness rows are given', async () => {
  const data = await preparteSynthetic();
  const without = unzipSync(preparteXlsx(data, new Map(), 'Listado QA'));
  assert.equal(without['xl/worksheets/sheet4.xml'], undefined);
  const files = unzipSync(preparteXlsx(data, new Map(), 'Listado QA', [['9001', 'Persona QA', '07:00', 2, 2, 30, 0, '½ jornada', '0.5', 'Sí']]));
  assert.match(strFromU8(files['xl/workbook.xml']), /name="Tardanzas"/);
  assert.match(strFromU8(files['[Content_Types].xml']), /sheet4\.xml/);
  assert.match(strFromU8(files['xl/worksheets/sheet4.xml']), /½ jornada/);
});
