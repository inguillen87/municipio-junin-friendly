import assert from 'node:assert/strict';
import test from 'node:test';
import { unzipSync, strFromU8 } from 'fflate';
import { monthlySummaryData, monthlySummaryRevision, monthlySummaryFilter, monthlyDecimal, sourceMonthlyPeriod } from '../assets/payroll-monthly-summary-model.js';
import { monthlySummaryXlsx, monthlySummaryPdf, monthlyExcelDecimal, monthlyPdfTextWidth, monthlyPdfLines } from '../assets/payroll-monthly-summary-export.js';
import { monthlyFixture, monthlyCatalog, monthlySource, monthlyUuid } from './fixtures/payroll-monthly-summary-synthetic.js';

const read = payload => monthlySummaryData(payload, { resource: 'summary', period: '2026-08', datasetIds: payload.data.sources.map(s => s.datasetId) });
const when = '2026-09-14T16:00:00Z';
test('explicit same-imputation sources preserve a corrida date outside that month', () => {
  const d = read(monthlyFixture()); assert.equal(sourceMonthlyPeriod(d.sources[0]), '2026-08'); assert.equal(d.sources[0].date, '2026-09-01');
  assert.equal(d.counts.statementParticipations, 4); assert.equal(d.counts.distinctLegajos, 2); assert.equal(d.rows[0].sourceRows, 4);
});
test('catalog is atomic including empty and 240; no automatic latest revision choice', () => {
  for (const n of [0, 240]) assert.equal(monthlySummaryData(monthlyCatalog(n), { resource: 'catalog' }).items.length, n);
  assert.throws(() => monthlySummaryData(monthlyCatalog(241), { resource: 'catalog' }));
  const p = monthlyCatalog(2); p.data.items[1].date = p.data.items[0].date; p.data.items[1].type = p.data.items[0].type;
  assert.equal(monthlySummaryData(p, { resource: 'catalog' }).items.length, 2);
});
test('selection accepts 24 and rejects 25 sources, mismatched IDs, repeats and periods', () => {
  assert.equal(read(monthlyFixture(3, Array.from({ length: 24 }, (_, i) => monthlySource(i + 1, 3)))).sources.length, 24);
  assert.throws(() => read(monthlyFixture(3, Array.from({ length: 25 }, (_, i) => monthlySource(i + 1, 3)))));
  const p = monthlyFixture(); assert.throws(() => monthlySummaryData(p, { resource: 'summary', period: '2026-08', datasetIds: [monthlyUuid(1)] }));
  assert.throws(() => monthlySummaryData(p, { resource: 'summary', period: '2026-08', datasetIds: [monthlyUuid(1), monthlyUuid(1)] }));
  assert.throws(() => monthlySummaryData(p, { resource: 'summary', period: '2026-09', datasetIds: p.data.sources.map(s => s.datasetId) }));
});
test('1000 concepts are retained, overflow is refused', () => { assert.equal(read(monthlyFixture(1000)).rows.length, 1000); assert.throws(() => read(monthlyFixture(1001))); });
for (const [label, modify] of [
  ['extra field', p => p.data.rows[0].personId = 'unexpected'], ['wrong version', p => p.data.version = 'v2'],
  ['invented month certification', p => p.data.scope.completeMonthCertified = true], ['mixed backup', p => p.data.sources[0].sourceSha256 = 'b'.repeat(64)],
  ['null amount without missing', p => p.data.rows[1].amount = null], ['partial amount substituted', p => p.data.rows[0].amount = '0.00'],
  ['quantity missing without null', p => p.data.rows[1].quantity = '0.00'], ['negative zero', p => p.data.rows[1].amount = '-0.00'],
  ['precision overflow', p => p.data.rows[1].amount = '99999999999999999999999.99'], ['float instead of exact string', p => p.data.rows[1].amount = 12.34],
  ['duplicate concept', p => p.data.rows[1].code = p.data.rows[0].code], ['wrong total lines', p => p.data.counts.lineCount++],
  ['wrong source lines', p => p.data.sources[0].lineCount++], ['invented unique people', p => p.data.rows[0].distinctLegajos = 5],
  ['too many missing lines', p => p.data.rows[0].missingAmounts = 99], ['empty source', p => p.data.sources[0].statementCount = 0],
  ['invalid civil day', p => p.data.sources[0].date = '2026-02-30'], ['year outside contract', p => p.data.sources[0].sourcePeriod = 2101],
]) test('contract drift rejected: ' + label, () => { const p = monthlyFixture(); modify(p); assert.throws(() => read(p)); });
test('timestamp microseconds and source closure changes invalidate export even with unchanged report hash', () => {
  const p = monthlyFixture(), initial = monthlySummaryRevision(read(p));
  p.data.sources[0].closureStatus = 'unknown'; assert.notEqual(monthlySummaryRevision(read(p)), initial);
  p.data.sources[0].closureStatus = 'closed'; p.data.sources[0].importedAt = '2026-09-14T12:34:56.123457Z'; assert.notEqual(monthlySummaryRevision(read(p)), initial);
  p.data.sources[0].importedAt = '2026-09-14T12:34:56.123456Z'; p.data.sources[0].payloadHash = 'b'.repeat(64); assert.notEqual(monthlySummaryRevision(read(p)), initial);
});
test('row and source order do not alter the normalized revision', () => { const p = monthlyFixture(), rev = monthlySummaryRevision(read(p)); p.data.rows.reverse(); p.data.sources.reverse(); assert.equal(monthlySummaryRevision(read(p)), rev); });
test('filters cover all concepts, preserve unknowns and do not create totals', () => {
  const d = read(monthlyFixture()); assert.equal(monthlySummaryFilter(d, { search: '0075' }).rows[0].code, '075');
  assert.equal(monthlySummaryFilter(d, { status: 'missing' }).rows.length, 2); assert.equal(monthlySummaryFilter(d, { status: 'informed' }).rows.length, 73);
  assert.equal(d.rows[0].amount, null); assert.equal(monthlyDecimal(null), 'No informado');
  assert.equal(monthlyDecimal('9999999999999999999999.99'), '9.999.999.999.999.999.999.999,99');
  assert.equal(monthlyDecimal('-9999999999999999999999.99'), '−9.999.999.999.999.999.999.999,99');
});
test('Excel numerical precision stops at 15 digits and retains larger decimals as exact text', () => {
  assert.deepEqual(monthlyExcelDecimal('9999999999999.99'), { numeric: '9999999999999.99' });
  assert.equal(monthlyExcelDecimal('99999999999999.99'), '99999999999999.99');
  assert.deepEqual(monthlyExcelDecimal('0.01'), { numeric: '0.01' });
});
test('Excel has complete concepts, exact sources and control with no formula interpretation or grand sum', () => {
  const p = monthlyFixture(1000); p.data.rows[4].description = '=HYPERLINK("https://invalid.example")'; p.data.sources[0].sourceLabel = '<img onerror="test">';
  const d = read(p), zip = unzipSync(monthlySummaryXlsx(d, monthlySummaryFilter(d), when));
  const concepts = strFromU8(zip['xl/worksheets/sheet1.xml']), sources = strFromU8(zip['xl/worksheets/sheet2.xml']), control = strFromU8(zip['xl/worksheets/sheet3.xml']);
  assert.equal((concepts.match(/<row /g) || []).length, 1001); assert.match(concepts, /t="inlineStr"><is><t xml:space="preserve">-9999999999999999999999\.99/);
  assert.match(concepts, /=HYPERLINK/); assert.doesNotMatch(concepts + sources + control, /<f>|<img/); assert.match(sources, /&lt;img/);
  for (const s of d.sources) for (const value of [s.datasetId, s.payloadHash, s.importedAt, s.sourceSha256]) assert.ok(sources.includes(value));
  assert.match(control, /No certifica que estén todas/); assert.match(control, /No se suman conceptos/); assert.match(control, /15 cifras/);
});
test('PDF contains exact decimals, all selected source identities and control in separate tables', () => {
  const d = read(monthlyFixture(5)), bytes = monthlySummaryPdf(d, monthlySummaryFilter(d), when), raw = new TextDecoder().decode(bytes);
  const rendered = [...raw.matchAll(/<([0-9a-f]+)> Tj/g)].map(m => Buffer.from(m[1], 'hex').toString('latin1')).join('');
  assert.match(raw, /^%PDF-1.4/); assert.match(raw, /\/Count [3-9]/); assert.ok(rendered.includes('Fuentes exactas'));
  for (const s of d.sources) assert.ok(rendered.includes(s.datasetId));
  assert.ok(rendered.includes('9.999.999.999.999.999.999.999,99')); assert.ok(rendered.includes(d.reportHash));
});
test('export refuses a filter from a different snapshot', () => {
  const a = read(monthlyFixture()), b = read(monthlyFixture()); assert.throws(() => monthlySummaryXlsx(a, monthlySummaryFilter(b), when));
});
test('PDF encodes euro correctly and refuses unsupported Unicode without silently replacing source text', () => {
  const p = monthlyFixture(5); p.data.rows[0].description = 'Concepto €'; let d = read(p);
  assert.match(new TextDecoder().decode(monthlySummaryPdf(d, monthlySummaryFilter(d), when)), /436f6e636570746f2080/);
  p.data.rows[0].description = 'Concepto 🧾'; d = read(p);
  assert.throws(() => monthlySummaryPdf(d, monthlySummaryFilter(d), when), e => e.exportOnly === true && /Excel/.test(e.message));
  assert.match(strFromU8(unzipSync(monthlySummaryXlsx(d, monthlySummaryFilter(d), when))['xl/worksheets/sheet1.xml']), /Concepto 🧾/);
});
test('PDF wraps wide uppercase descriptions and long hashes by Helvetica glyph widths, preserving every character', () => {
  assert.equal(monthlyPdfTextWidth('W', 8), 7.552); assert.equal(monthlyPdfTextWidth('i', 8), 1.776);
  for (const bold of [false, true]) for (const value of ['ASIGNACIÓN FAMILIAR REMUNERATIVA WWWWWW', 'W'.repeat(240), '0123456789abcdef'.repeat(4), 'ÁÉÍÓÚÜÑ € Œ']) {
    const lines = monthlyPdfLines(value, 95, 8, bold); assert.ok(lines.every(line => monthlyPdfTextWidth(line, 8, bold) <= 95));
    assert.equal(lines.join('').replace(/\s/g, ''), value.replace(/\s/g, ''));
  }
});
