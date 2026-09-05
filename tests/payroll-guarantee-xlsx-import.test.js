import test from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, unzipSync, strToU8 } from 'fflate';
import { parseGuaranteeXlsx, GUARANTEE_XLSX_MAX_BYTES } from '../assets/payroll-guarantee-xlsx-import.js';

const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const rel = 'http://schemas.openxmlformats.org/package/2006/relationships';
const r = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const inline = (ref, value) => `<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>`;
const numeric = (ref, value, f = '') => `<c r="${ref}">${f}${value === null ? '' : `<v>${value}</v>`}</c>`;
function workbook({ records = [['42', '1.005'], ['43', '2.004']], header = 'COEF. 81%', sheet = '195 08.2026', body, extras = {}, hidden = '' } = {}) {
  const data = `<row r="1">${inline('B1', 'Legajo')}${inline('K1', header)}</row>`
    + (body ?? records.map(([id, amount], i) => `<row r="${i + 2}" ${hidden}>${numeric(`B${i + 2}`, id)}${numeric(`K${i + 2}`, amount, '<f>1+1</f>')}</row>`).join(''))
    + `<row r="${records.length + 2}">${numeric(`K${records.length + 2}`, '3.009', `<f>SUM(K2:K${records.length + 1})</f>`)}</row>`;
  const files = {
    'xl/workbook.xml': `<workbook xmlns="${ns}" xmlns:r="${r}"><sheets><sheet name="${sheet}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships xmlns="${rel}"><Relationship Id="rId1" Type="${r}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    'xl/worksheets/sheet1.xml': `<worksheet xmlns="${ns}"><sheetData>${data}</sheetData></worksheet>`,
    ...extras,
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([p, v]) => [p, strToU8(v)])), { level: 0 });
}
const read = (bytes, options = {}) => parseGuaranteeXlsx(bytes, { period: '2026-08', conceptCode: '195', unzipImpl: unzipSync, ...options });

test('Excel garantía usa importes guardados exactos por persona, excluye total y no altera el archivo', async () => {
  const input = workbook(); const original = input.slice();
  const report = await read(input);
  assert.equal(report.ok, true, JSON.stringify(report.issues));
  assert.deepEqual(report.rows, [
    { legajo: '42', conceptCode: '195', amountDecimal: '1.01', quantityDecimal: '0.0000' },
    { legajo: '43', conceptCode: '195', amountDecimal: '2.00', quantityDecimal: '0.0000' },
  ]);
  assert.equal(report.summary.totalAmountCents, '301');
  assert.equal(report.summary.roundingCount, 2);
  assert.deepEqual(input, original);
  assert.equal(report.source.formulaPolicy, 'cached_values_half_up');
});

for (const [raw, expected] of [['0', '0.00'], ['0.0049', '0.00'], ['0.005', '0.01'], ['1.015', '1.02'], ['9999999.99', '9999999.99']]) {
  test(`redondeo decimal determinista ${raw}`, async () => {
    const result = await read(workbook({ records: [['00000042', raw]] }));
    assert.equal(result.ok, true, JSON.stringify(result.issues));
    assert.equal(result.rows[0].amountDecimal, expected);
    assert.equal(result.rows[0].legajo, '42');
  });
}

for (const [name, options] of [
  ['período diferente', { sheet: '195 09.2026' }],
  ['plantilla diferente', { header: 'SUELDO' }],
  ['duplicado', { records: [['42', '1'], ['00000042', '2']] }],
  ['importe negativo', { records: [['42', '-1']] }],
  ['importe con coma', { records: [['42', '1,50']] }],
  ['importe exponencial no homologado', { records: [['42', '1e3']] }],
  ['desborde al redondear', { records: [['42', '9999999.995']] }],
  ['caché ausente', { records: [['42', null]] }],
  ['filas ocultas', { hidden: 'hidden="1"' }],
  ['macro', { extras: { 'xl/vbaProject.bin': 'abc' } }],
  ['vínculo externo', { extras: { '_rels/.rels': `<Relationships xmlns="${rel}"><Relationship Id="external" TargetMode="External" Target="https://example.invalid"/></Relationships>` } }],
  ['falta de legajo fuera del total', { records: [['', '1']] }],
  ['más de 500 legajos', { records: Array.from({ length: 501 }, (_, i) => [String(i + 1), '1']) }],
]) {
  test(`bloquea todo el lote: ${name}`, async () => {
    const result = await read(workbook(options));
    assert.equal(result.ok, false);
    assert.deepEqual(result.rows, []);
    assert.equal(result.summary.totalAmountCents, null);
    assert.ok(result.issues.length);
  });
}

test('concepto explícito, límites de archivo y XML incompleto no se aceptan', async () => {
  assert.equal((await read(workbook(), { conceptCode: '95' })).ok, false);
  assert.equal((await read(new Uint8Array(GUARANTEE_XLSX_MAX_BYTES + 1))).ok, false);
  assert.equal((await read(workbook({ extras: { 'xl/workbook.xml': `<workbook xmlns="${ns}"><sheets></workbook>` } }))).ok, false);
});

test('500 filas no se recortan ni confunden con rango compartido de fórmula', async () => {
  const result = await read(workbook({ records: Array.from({ length: 500 }, (_, i) => [String(i + 1), '0.01']) }));
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.equal(result.rows.length, 500);
  assert.equal(result.summary.totalAmountCents, '500');
});
