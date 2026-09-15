import assert from 'node:assert/strict';
import test from 'node:test';
import { unzipSync, strFromU8 } from 'fflate';
import { monthlySummaryData, monthlySummaryFilter, mutualRetentionCandidates, mutualRetentionsView, checkMutualRetentions, mutualDecimal, MUTUAL_RETENTIONS_PRESET } from '../../assets/payroll-monthly-summary-model.js';
import { mutualRetentionsXlsx, mutualRetentionsPdf } from '../../assets/payroll-monthly-summary-export.js';
import { mutualFixture } from './fixture.mjs';

const read = payload => monthlySummaryData(payload, { resource: 'summary', period: payload.data.period, datasetIds: payload.data.sources.map(source => source.datasetId) });
const when = '2026-09-14T16:00:00Z';
const sheets = (data, report) => Object.fromEntries(Object.entries(unzipSync(mutualRetentionsXlsx(data, report, when))).map(([key, bytes]) => [key, strFromU8(bytes)]));
const pdfText = bytes => [...new TextDecoder().decode(bytes).matchAll(/<([0-9a-f]+)> Tj/g)].map(match => Buffer.from(match[1], 'hex').toString('latin1')).join('');

test('August preset is an explicit editable reference, normalizes unique identity and preserves literal source codes', () => {
  const data = read(mutualFixture()), report = mutualRetentionsView(data, [...MUTUAL_RETENTIONS_PRESET.codes]);
  assert.equal(report.rows[0].code, '0614'); assert.equal(report.rows[0].state, 'informed'); assert.equal(report.codes[0], '0614');
  assert.equal(report.presetUnchanged, true); assert.equal(report.total, '1.90'); assert.equal(report.informedCount, 10);
  assert.equal(mutualRetentionsView(data, ['0614', '606']).presetUnchanged, false);
  assert.equal(mutualRetentionsView(data, ['0614', '606']).total, '0.30');
  assert.ok(mutualRetentionCandidates(data).some(row => row.code === '606'));
});

test('ambiguous source aliases are refused even if the selection uses an exact spelling', () => {
  const data = read(mutualFixture(['0614', '614']));
  assert.throws(() => mutualRetentionCandidates(data), /inequívocos/);
  assert.throws(() => mutualRetentionsView(data, ['0614']), /inequívocos/);
  assert.equal(monthlySummaryFilter(data).rows.length, 2, 'general summary remains available without merging identities');
});

test('selection rejects aliases, malformed codes, oversized lists and unverified snapshots', () => {
  const data = read(mutualFixture());
  for (const selection of [['614', '0614'], ['614', '614'], [614], [' 614'], ['-614'], ['614.0'], ['1234567'], null, Array(1001).fill('614')]) {
    assert.throws(() => mutualRetentionsView(data, selection));
  }
  assert.throws(() => mutualRetentionsView(structuredClone(data), ['614']));
});

test('absence, missing amount and unverified component each keep the total undetermined; reported zero remains zero', () => {
  const payload = mutualFixture(['614', '620', '623', '641']);
  Object.assign(payload.data.rows[0], { amount: '0.00' });
  Object.assign(payload.data.rows[1], { amount: null, missingAmounts: 1 });
  Object.assign(payload.data.rows[2], { totalGroup: '993', amount: '99.99' });
  const data = read(payload), report = mutualRetentionsView(data, ['614', '620', '623', '641', '649']);
  assert.deepEqual(report.rows.map(row => row.state), ['informed', 'missing', 'unverified', 'informed', 'absent']);
  assert.deepEqual(report.rows.map(row => row.amount), ['0.00', null, null, '0.20', null]);
  assert.equal(report.subtotal, '0.20'); assert.equal(report.total, null);
  assert.equal(report.absentCount, 1); assert.equal(report.missingCount, 1); assert.equal(report.unverifiedCount, 1);
  assert.equal(mutualRetentionsView(data, ['614']).total, '0.00');
  assert.equal(mutualRetentionsView(data, ['620', '623', '649']).subtotal, null);
  assert.match(report.rows[4].observation, /No equivale a cero/);
});

test('missing quantity alone does not invalidate an explicitly informed retention amount', () => {
  const payload = mutualFixture(['614']); Object.assign(payload.data.rows[0], { missingQuantities: 1, quantity: null });
  assert.equal(mutualRetentionsView(read(payload), ['614']).total, '0.10');
});

test('reserved and referenced totalizers never enter the sum, including padded grouping codes', () => {
  const payload = mutualFixture(['750', '751', '752', '0996', '999']);
  payload.data.rows[1].totalGroup = '0750';
  const data = read(payload), report = mutualRetentionsView(data, ['750', '751', '752', '996', '999']);
  assert.deepEqual(mutualRetentionCandidates(data).map(row => row.code), ['752']);
  assert.equal(report.informedCount, 1); assert.equal(report.unverifiedCount, 4); assert.equal(report.total, null); assert.equal(report.subtotal, '0.20');
});

test('signed exact decimal addition preserves cents and zero without floating point', () => {
  const payload = mutualFixture(['614', '620', '623']);
  ['9999999999999999999999.99', '-9999999999999999999999.98', '-0.01'].forEach((amount, index) => payload.data.rows[index].amount = amount);
  const data = read(payload), report = mutualRetentionsView(data, ['614', '620', '623']);
  assert.equal(report.total, '0.00'); assert.equal(mutualDecimal(report.total), '0,00');
  assert.equal(mutualRetentionsView(data, ['623']).total, '-0.01');
});

test('1000 maximum-precision components sum exactly beyond the per-component decimal limit', () => {
  const codes = Array.from({ length: 1000 }, (_, index) => String(index + 10000));
  const payload = mutualFixture(codes); payload.data.rows.forEach(row => row.amount = '9999999999999999999999.99');
  const data = read(payload), report = mutualRetentionsView(data, codes);
  assert.equal(report.total, '9999999999999999999999990.00');
  assert.equal(mutualDecimal(report.total), '9.999.999.999.999.999.999.999.990,00');
  assert.match(sheets(data, report)['xl/worksheets/sheet1.xml'], /9999999999999999999999990\.00<\/t>/);
});

test('report snapshots and rows are immutable, non-forgeable and bound to their summary', () => {
  const a = read(mutualFixture()), b = read(mutualFixture()), report = mutualRetentionsView(a, ['614']);
  for (const mutation of [() => { report.total = '100.00'; }, () => { report.rows[0].amount = '100.00'; }, () => { report.codes.push('620'); }]) assert.throws(mutation);
  assert.throws(() => checkMutualRetentions(b, report)); assert.throws(() => checkMutualRetentions(a, structuredClone(report)));
  assert.throws(() => mutualRetentionsXlsx(b, report, when)); assert.throws(() => mutualRetentionsPdf(a, report, 'invalid'));
  const empty = mutualRetentionsView(a, []); assert.equal(empty.total, null); assert.throws(() => mutualRetentionsXlsx(a, empty, when));
});

test('Excel includes exact source codes, formulas as text, independently selected concepts and full provenance', () => {
  const payload = mutualFixture(); payload.data.rows[0].description = '=HYPERLINK("https://invalid.example")';
  const data = read(payload), report = mutualRetentionsView(data, [...MUTUAL_RETENTIONS_PRESET.codes, '650']);
  const zip = sheets(data, report), detail = zip['xl/worksheets/sheet1.xml'], sources = zip['xl/worksheets/sheet2.xml'], control = zip['xl/worksheets/sheet3.xml'];
  assert.match(zip['xl/workbook.xml'], /name="Retenciones"/); assert.match(detail, />0614<\/t>/); assert.match(detail, /=HYPERLINK/); assert.doesNotMatch(detail, /<f>/);
  assert.equal((detail.match(/<row /g) || []).length, 14); assert.match(detail, /No determinable/); assert.match(detail, /No equivale a cero/);
  assert.doesNotMatch(detail, /Descuento sintético 606/); assert.match(control, /Selección editada/); assert.match(control, /Sin firma aplicada/);
  for (const source of data.sources) for (const key of ['datasetId', 'sourceLabel', 'sourceSha256', 'payloadHash', 'importedAt']) assert.ok(sources.includes(source[key]));
  for (const value of [data.period, data.reportHash, when, MUTUAL_RETENTIONS_PRESET.id, MUTUAL_RETENTIONS_PRESET.source]) assert.ok(control.includes(value));
});

test('Excel keeps only safe precision as numeric cells and increases row height for long source text', () => {
  const payload = mutualFixture(['614', '620']); payload.data.rows[0].amount = '9999999999999.99'; payload.data.rows[1].amount = '99999999999999.99';
  payload.data.rows[0].description = 'Descripción extensa de origen '.repeat(8); payload.data.sources[0].sourceLabel = 'Fuente con nombre extenso '.repeat(9);
  const data = read(payload), zip = sheets(data, mutualRetentionsView(data, ['614', '620']));
  assert.match(zip['xl/worksheets/sheet1.xml'], /<c r="C2" s="2"><v>9999999999999\.99<\/v>/);
  assert.match(zip['xl/worksheets/sheet1.xml'], /<c r="C3" s="0" t="inlineStr"><is><t xml:space="preserve">99999999999999\.99/);
  assert.ok(Number(zip['xl/worksheets/sheet1.xml'].match(/<row r="2" ht="(\d+)"/)[1]) > 36);
  assert.ok(Number(zip['xl/worksheets/sheet2.xml'].match(/<row r="2" ht="(\d+)"/)[1]) > 36);
});

test('PDF preserves exact decimals and provenance, labels incomplete totals and does not present a signed note', () => {
  const data = read(mutualFixture()), report = mutualRetentionsView(data, [...MUTUAL_RETENTIONS_PRESET.codes, '650']);
  const bytes = mutualRetentionsPdf(data, report, when), rendered = pdfText(bytes);
  assert.match(new TextDecoder().decode(bytes), /^%PDF-1.4/);
  for (const value of ['0614', '0,10', '1,90', 'No determinable', 'No equivale a cero', data.reportHash, when, 'Sin firma aplicada']) assert.ok(rendered.includes(value), value);
  for (const source of data.sources) for (const key of ['datasetId', 'sourceSha256', 'payloadHash', 'importedAt']) assert.ok(rendered.includes(source[key]), key);
});

test('unsupported PDF characters stop only PDF and remain exact in Excel', () => {
  const payload = mutualFixture(['614']); payload.data.rows[0].description = 'Descuento sintético 🧾';
  const data = read(payload), report = mutualRetentionsView(data, ['614']);
  assert.throws(() => mutualRetentionsPdf(data, report, when), error => error.exportOnly === true && /Excel/.test(error.message));
  assert.match(sheets(data, report)['xl/worksheets/sheet1.xml'], /🧾/);
});
