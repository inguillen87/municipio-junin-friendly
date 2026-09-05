import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parsePayrollNoveltyRetro, RETRO_MAX_BYTES, RETRO_MAX_ROWS } from '../assets/payroll-novelty-retro-import.js';

// Invented values only. Never copy municipal source rows into fixtures.
const options = { conceptSourceId: '777' };
const record = (legajo = '42', amount = '0000123.45') => `${legajo.padStart(8, '0')}${amount}`;

test('RETRO convierte legajo e importe exactos al contrato existente, sin dato inferido', () => {
  const result = parsePayrollNoveltyRetro(record(), options);
  assert.equal(result.ok, true);
  assert.deepEqual(result.rows, [{
    rowOrdinal: 1, legajo: '42', conceptSourceId: '777', costCenterSourceId: null,
    adjustmentMonth: null, quantityDecimal: null, amountCents: '12345',
    movementType: null, legalInstrument: null, observation: null, forced: false,
  }]);
  assert.deepEqual([result.totalRows, result.acceptedCount, result.rejectedCount], [1, 1, 0]);
});

test('RETRO admite BOM UTF-8 inicial opcional y CRLF/LF con un salto final', () => {
  for (const prefix of ['', '\uFEFF']) {
    for (const delimiter of ['\n', '\r\n']) {
      for (const suffix of ['', delimiter]) {
        const result = parsePayrollNoveltyRetro(`${prefix}${record('1')}${delimiter}${record('2')}${suffix}`, options);
        assert.equal(result.ok, true);
        assert.deepEqual(result.rows.map((row) => row.legajo), ['1', '2']);
      }
    }
  }
});

test('RETRO usa centavos exactos y normaliza ceros sin Number ni parseFloat', () => {
  const pairs = [
    ['0000000.00', '0'], ['0000000.01', '1'], ['0000000.10', '10'],
    ['0000000.29', '29'], ['1234567.89', '123456789'], ['9999999.99', '999999999'],
  ];
  for (const [amount, expected] of pairs) {
    const result = parsePayrollNoveltyRetro(record('0', amount), { conceptSourceId: '99999999999999999999' });
    assert.equal(result.rows[0].legajo, '0');
    assert.equal(result.rows[0].amountCents, expected);
    assert.equal(result.rows[0].conceptSourceId, '99999999999999999999');
  }
  const source = readFileSync(new URL('../assets/payroll-novelty-retro-import.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /parseFloat|Number\(|toFixed|fetch\(|localStorage|sessionStorage/);
});

test('RETRO exige concepto explícito canónico y no infiere 195 del archivo', () => {
  for (const conceptSourceId of [undefined, '', ' ', '00195', '-1', '1.0', '1e2', '9'.repeat(21)]) {
    assert.throws(() => parsePayrollNoveltyRetro(record(), { conceptSourceId }), /Indicá el concepto GRH/);
  }
});

test('RETRO rechaza signos, coma, centavos implícitos y tokens desconocidos', () => {
  for (const amount of ['-000123.45', '+000123.45', '0000123,45', '0000012345', '000123.450', '0001e02.45', '0000123.4 ', ' 000123.45']) {
    const result = parsePayrollNoveltyRetro(record('42', amount), options);
    assert.equal(result.ok, false, amount);
    assert.equal(result.errors[0].code, 'invalid_amount', amount);
    assert.deepEqual(result.rows, []);
  }
});

test('RETRO no recorta espacios, blancos, columnas ni encabezados de otro TXT/CSV', () => {
  const cases = [
    [` ${record()}`, 'invalid_width'], [`${record()} `, 'invalid_width'],
    [record().slice(1), 'invalid_width'], ['legajo;importe', 'invalid_width'],
    [`${record()}\n\n`, 'invalid_width'], [`\n${record()}`, 'invalid_width'],
    [`${record()}\r${record('2')}`, 'invalid_line_ending'],
    [`x${record().slice(1)}`, 'invalid_legajo'],
    [`\uFEFF\uFEFF${record()}`, 'invalid_width'],
  ];
  for (const [text, code] of cases) {
    const result = parsePayrollNoveltyRetro(text, options);
    assert.equal(result.ok, false);
    assert.equal(result.errors[0].code, code);
    assert.deepEqual(result.rows, []);
  }
});

test('RETRO informa todos los rechazos y no entrega un subconjunto preparable', () => {
  const source = [record('1'), 'invalid', record('2', '0000000,01'), record('3')].join('\n');
  const result = parsePayrollNoveltyRetro(source, options);
  assert.deepEqual([result.totalRows, result.acceptedCount, result.rejectedCount], [4, 2, 2]);
  assert.deepEqual(result.errors.map((error) => error.rowOrdinal), [2, 3]);
  assert.deepEqual(result.rows, []);
});

test('RETRO detecta clave de negocio duplicada tras normalizar legajo', () => {
  const result = parsePayrollNoveltyRetro([record('42'), record('00000042', '0000000.01')].join('\n'), options);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'duplicate_business_key');
  assert.equal(result.errors[0].rowOrdinal, 2);
  assert.match(result.errors[0].message, /fila 1/);
  assert.deepEqual(result.rows, []);
});

test('RETRO limita a 500 filas y 256 KiB sin truncar', () => {
  assert.equal(RETRO_MAX_ROWS, 500);
  assert.equal(RETRO_MAX_BYTES, 262144);
  const records = Array.from({ length: 500 }, (_, index) => record(String(index + 1)));
  assert.equal(parsePayrollNoveltyRetro(records.join('\r\n'), options).rows.length, 500);
  assert.throws(() => parsePayrollNoveltyRetro([...records, record('501')].join('\n'), options), /entre 1 y 500 filas/);
  assert.throws(() => parsePayrollNoveltyRetro('x'.repeat(RETRO_MAX_BYTES + 1), options), /supera 256 KiB/);
  assert.throws(() => parsePayrollNoveltyRetro('é'.repeat(RETRO_MAX_BYTES / 2 + 1), options), /supera 256 KiB/);
  assert.throws(() => parsePayrollNoveltyRetro('', options), /Pegá o cargá/);
  assert.throws(() => parsePayrollNoveltyRetro('\uFEFF', options), /Pegá o cargá/);
  assert.throws(() => parsePayrollNoveltyRetro(null, options), /texto UTF-8/);
});
