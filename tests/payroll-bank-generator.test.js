import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { bankReportData, bankReportFilter, bankReportRevision, bankMoney, bankAccountLabel, bankObservations } from '../assets/payroll-bank-generator-model.js';
import { bankReportXlsx, bankReportPdf } from '../assets/payroll-bank-generator-export.js';
import { bankGeneratorFixture, bankGeneratorCatalog, bankFixtureId, bankFixtureCbu } from './fixtures/payroll-bank-generator-synthetic.js';
const read = payload => bankReportData(payload, { resource: 'report', datasetId: bankFixtureId });
const when = '2026-09-14T18:00:00Z';
test('frontend consumes the backend contract preserving source day, codes, CBU and unknown account type', () => {
  const data = read(bankGeneratorFixture());
  assert.equal(data.rows.length, 75); assert.equal(data.dataset.statementCount, 75); assert.equal(data.bankSource.cutoff, '2026-08-19T15:17:09');
  assert.equal(data.rows[0].accountNumber, '0000012345'); assert.equal(data.rows[0].cbu, bankFixtureCbu); assert.equal(data.rows[0].accountType, null);
  assert.match(bankAccountLabel(data.rows[0]), /Tipo sin verificar · código 4/); assert.equal(bankReportData(bankGeneratorCatalog(), { resource: 'catalog' }).items.length, 1);
});
test('full source completeness and scope are required, no hidden row truncation or assumed bank semantics', () => {
  for (const mutate of [p => p.data.rows.pop(), p => p.data.rows[1].legajo = p.data.rows[0].legajo, p => p.data.scope.bankTransferGenerated = true,
    p => p.data.bankSource.sourceSha256 = 'b'.repeat(64), p => p.data.rows[0].netAmount = 1.23, p => p.data.dataset.datasetId = '22222222-2222-4222-8222-222222222222']) {
    const payload = bankGeneratorFixture(); mutate(payload); assert.throws(() => read(payload));
  }
  const payload = bankGeneratorFixture(5000); assert.equal(read(payload).rows.length, 5000);
  payload.data.rows.push({ ...payload.data.rows[0], legajo: '5001' }); payload.data.dataset.statementCount++; assert.throws(() => read(payload));
});
test('bank, jurisdiction and search filters include complete rows while unknown account types remain explicit', () => {
  const data = read(bankGeneratorFixture(75));
  assert.equal(bankReportFilter(data, { bank: 'credicoop' }).rows.length, 25);
  assert.equal(bankReportFilter(data, { jurisdiction: '55' }).rows.length, 37);
  assert.equal(bankReportFilter(data, { search: 'SINTETICA 75' }).rows.length, 1);
  assert.equal(bankReportFilter(data, { account: 'unknown' }).rows.length, 75);
  assert.equal(bankReportFilter(data, { account: 'caja_ahorro' }).rows.length, 0);
  assert.throws(() => bankReportFilter(data, { bank: 'santander', account: 'cuenta_corriente' }));
});
test('totals retain exact decimals and missing amounts are not treated as zero', () => {
  const data = read(bankGeneratorFixture(3, raw => { raw.rows[0].netAmount = '9999999999999999999999.99'; raw.rows[1].netAmount = '-1.00'; raw.rows[2].netAmount = null; }));
  const filtered = bankReportFilter(data);
  assert.equal(filtered.total, null); assert.equal(filtered.knownTotal, '9999999999999999999998.99'); assert.equal(filtered.missingAmounts, 1);
  assert.equal(bankMoney(filtered.knownTotal), '$ 9.999.999.999.999.999.999.998,99');
  const nominal = strFromU8(unzipSync(bankReportXlsx(data, filtered, when))['xl/worksheets/sheet1.xml']);
  assert.match(nominal, /No informado/); assert.match(nominal, /9999999999999999999999\.99/);
});
test('invalid account and CBU retain their specific observation without being described as missing', () => {
  const data = read(bankGeneratorFixture(1, raw => { raw.rows[0].accountNumber = 'bad\naccount'; raw.rows[0].cbuCurrent = '1'.repeat(22); }));
  const note = bankObservations(data.rows[0]); assert.match(note, /Cuenta con formato inválido/); assert.match(note, /CBU inválido/); assert.doesNotMatch(note, /Cuenta no informada|CBU no informado/);
});
test('Excel exports more than 2000 complete rows, textual bank identifiers, exact net, summaries and source hashes', () => {
  const data = read(bankGeneratorFixture(2101, raw => { raw.rows[0].name = '=HYPERLINK("https://invalid.test")'; raw.rows[0].netAmount = '9999999999999999999999.99'; }));
  const files = unzipSync(bankReportXlsx(data, bankReportFilter(data), when));
  const nominal = strFromU8(files['xl/worksheets/sheet1.xml']), control = strFromU8(files['xl/worksheets/sheet3.xml']);
  assert.equal((nominal.match(/<row /g) || []).length, 2102); assert.match(nominal, /t="inlineStr"[^>]*><is><t xml:space="preserve">0000012345/);
  assert.ok(nominal.includes(bankFixtureCbu)); assert.ok(nominal.includes('9999999999999999999999.99')); assert.match(nominal, /=HYPERLINK/); assert.doesNotMatch(nominal, /<f>/);
  for (const value of [data.dataset.datasetId, data.dataset.payloadHash, data.bankSource.payloadSha256, data.reportHash, '2026-08-19T15:17:09']) assert.ok(control.includes(value));
  assert.match(control, /No ordena transferencias|No es un archivo bancario/); assert.match(control, /no sólo la página visible/);
});
test('PDF retains every filtered person, source hashes and observed type instead of a payment claim', () => {
  const data = read(bankGeneratorFixture(75)); const raw = new TextDecoder().decode(bankReportPdf(data, bankReportFilter(data), when));
  const content = [...raw.matchAll(/<([0-9a-f]+)> Tj/g)].map(match => Buffer.from(match[1], 'hex').toString('latin1')).join(' ');
  assert.match(raw, /^%PDF-1.4/); assert.match(content, /Persona sintética 75/); assert.ok(content.includes(data.reportHash)); assert.ok(content.includes(bankFixtureCbu));
  assert.match(content, /Tipo sin verificar/); assert.match(content, /No ordena transferencias/);
  assert.match(content, /Leyenda completa/); assert.match(raw, /\/F1 8\.5 Tf/);
  for (const row of data.rows) {
    for (const value of [row.name, row.cuil, row.accountNumber, row.cbu, row.bankLabel, row.repartitionLabel].filter(Boolean)) assert.ok(content.includes(value), 'PDF preserves nominal fields or their exact legend');
  }
});
test('export fails for a foreign filter and revision changes when either source changes', () => {
  const a = read(bankGeneratorFixture()), b = read(bankGeneratorFixture()); assert.throws(() => bankReportXlsx(a, bankReportFilter(b), when));
  const initial = bankReportRevision(a), changed = bankGeneratorFixture(); changed.data.bankSource.payloadSha256 = 'e'.repeat(64); assert.notEqual(bankReportRevision(read(changed)), initial);
});
test('new primary task mounts a real generator with no upload fields and ships its dependencies', () => {
  const centre = fs.readFileSync('assets/report-centre.js', 'utf8'), ui = fs.readFileSync('assets/payroll-bank-generator.js', 'utf8'), build = fs.readFileSync('scripts/build-friendly.mjs', 'utf8');
  assert.match(centre, /label:'Planilla bancaria',nodes:\[banking\]/); assert.match(centre, /mountPayrollBankGenerator\(banking\)/);
  assert.match(ui, /internal-payroll-bank-report/); assert.doesNotMatch(ui, /type="file"|localStorage|sessionStorage|document\.cookie/);
  for (const file of ['payroll-bank-generator.js', 'payroll-bank-generator-model.js', 'payroll-bank-generator-export.js', 'payroll-bank-generator.css']) assert.ok(build.includes(file));
});
