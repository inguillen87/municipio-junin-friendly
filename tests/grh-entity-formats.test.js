import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GRH_ENTITY_FORMATS, readEntityTxt, resolveEntityRows, entityConceptSuggestion, entityFormat, entityFormatsForLength, entityRecordLength } from '../assets/grh-entity-formats.js';

const enc = text => new TextEncoder().encode(text);
const pad = (text, width) => text.padEnd(width, ' ');

test('positions copy GRH formatoitem: Junín 55, RETRO by legajo, MAYOR/FULL implied decimals, COFARM 80', () => {
  assert.deepEqual(entityFormat(1).items, [['dni', 5, 8, 0], ['amount', 44, 11, 3]]);
  assert.deepEqual(entityFormat(9).items, [['legajo', 0, 8, 0], ['amount', 8, 10, 3]]);
  const junin = readEntityTxt(enc(pad('00000' + '20111222', 44) + '00012345.67\r\n' + pad('00000' + '30111222', 44) + '00000100.00\r\n'), { formatId: 1 });
  assert.deepEqual(junin.rows.map(r => [r.key, r.amountCents]), [['20111222', '1234567'], ['30111222', '10000']]);
  assert.equal(junin.totalCents, '1244567');
  const retro = readEntityTxt(enc('000012340001234.56\n'), { formatId: 9 });
  assert.deepEqual([retro.identity, retro.rows[0].key, retro.rows[0].amountCents], ['legajo', '1234', '123456']);
  assert.throws(() => readEntityTxt(enc('2011122205000\n'), { formatId: 4 }), /decimales/);
  assert.equal(readEntityTxt(enc('2011122205000\n'), { formatId: 4, scale: 2 }).rows[0].quantityDecimal, '50');
  const cofarm = readEntityTxt(enc(pad('000' + '20111222' + '000', 40) + '000012345678' + pad('', 27) + '1\n'), { formatId: 17, scale: 2 });
  assert.deepEqual([cofarm.rows[0].amountCents, cofarm.longerLines], ['12345678', 1]);
});

test('the whole file or nothing: short lines, bad numbers and repeated DNIs are reported with their line', () => {
  const error = (() => { try { readEntityTxt(enc(pad('0000020111222', 44) + '00000100.00\n' + pad('0000020111222', 44) + '0000100,00\nshort\n'), { formatId: 1 }); } catch (e) { return e; } })();
  assert.match(error.message, /^2 de 3 renglones/);
  assert.deepEqual(error.issues.map(i => i.line), [2, 3]);
  const repeated = enc(pad('0000020111222', 44) + '00000100.00\n' + pad('0000020111222', 44) + '00000050.00\n');
  assert.throws(() => readEntityTxt(repeated, { formatId: 1 }), e => /repetido/.test(e.issues[0].message));
  const summed = readEntityTxt(repeated, { formatId: 1, sumRepeated: true });
  assert.deepEqual([summed.rows.length, summed.rows[0].amountCents, summed.rows[0].sourceLines], [1, '15000', [1, 2]]);
});

test('DNIs link to exactly one active own contract; none or several are left out and listed', () => {
  const subjects = [{ contractId: 'a1', legajo: '10', identityToken: 't1' }, { contractId: 'b2', legajo: '11', identityToken: 't2' }, { contractId: 'c3', legajo: '12', identityToken: 't3' }];
  const roster = [{ contractId: 'a1', legajo: '10', dni: '20111222', status: 'active' }, { contractId: 'b2', legajo: '11', dni: '30111222', status: 'active' }, { contractId: 'c3', legajo: '12', dni: '30111222', status: 'active' }, { contractId: 'zz', legajo: '13', dni: '40111222', status: 'active' }];
  const read = readEntityTxt(enc([20111222, 30111222, 40111222].map(d => pad('00000' + d, 44) + '00000100.00').join('\n')), { formatId: 1 });
  const linked = resolveEntityRows(read, roster, subjects);
  assert.deepEqual(linked.resolved.map(r => [r.key, r.legajo, r.contractId, r.identityToken]), [['20111222', '10', 'a1', 't1']]);
  assert.deepEqual(linked.ambiguous.map(r => [r.key, r.candidates]), [['30111222', ['11', '12']]]);
  assert.deepEqual(linked.missing.map(r => r.key), ['40111222']);
});

test('concept suggestions follow the file name only when the format admits it; the panel wires the import', () => {
  assert.equal(entityConceptSuggestion('DESCUENTOS/A.M.A.R.U/638082026.txt', entityFormat(1)), '638');
  assert.equal(entityConceptSuggestion('678 082026.txt', entityFormat(9)), '678');
  // Módulo 3.4 de Noelia: 614, 638, 639, 641, 650, 651, 665 y 675 usan Formato Junín.
  assert.deepEqual(entityFormat(1).concepts, ['614', '638', '639', '641', '650', '651', '665', '675']);
  assert.equal(entityConceptSuggestion('641102026.txt', entityFormat(1)), '641');
  assert.equal(entityConceptSuggestion('MAYORES44082026.TXT', entityFormat(4)), '');
  assert.equal(entityConceptSuggestion('999082026.txt', entityFormat(1)), '');
  assert.equal(GRH_ENTITY_FORMATS.length, 20);
  const panel = fs.readFileSync('assets/own-payroll-novelties-panel.js', 'utf8');
  assert.match(panel, /data-n-import-read/);
  assert.match(panel, /resolveEntityRows\(read,entityRoster,boot\?\.subjects,\{preferLowestLegajo:\$\('import-lowest'\)\.checked\}\)/);
  assert.match(panel, /ownNoveltyCommand\(bodyValue\(\[\.\.\.rows,\.\.\.added\]\)\)/);
  assert.match(fs.readFileSync('scripts/build-friendly.mjs', 'utf8'), /'assets\/grh-entity-formats\.js'/);
});

// 13/11/2026 · Contrastado con los veinte archivos reales de agosto de 2026 y con lo que GRH guardó ese mes. Estas cuatro
// reglas son lo que antes se arreglaba a mano en el archivo, o lo que GRH hace sin decirlo. Datos de prueba inventados.
test('an entity file is read as it arrives: decimal comma (AMAS, Sancor) and a row one position short (AMSA, Caja de Ahorro)', () => {
  const comma = readEntityTxt(enc(pad('00000' + '20111222' + '0PEREZ, ANA', 44) + '00012345,67\n' + pad('00000' + '30111222' + '0GOMEZ LUIS', 44) + '   50000,00\n'), { formatId: 1 });
  assert.deepEqual(comma.rows.map(r => [r.key, r.amountCents]), [['20111222', '1234567'], ['30111222', '5000000']]);
  assert.throws(() => readEntityTxt(enc(pad('0000020111222', 44) + '  1.234,56 \n'), { formatId: 1 }), e => /punto o coma decimal/.test(e.issues[0].message), 'un separador de miles no se adivina');
  // Same layout, name field one character shorter: the amount ends at position 54 instead of 55.
  const short = readEntityTxt(enc(pad('00000' + '20111222' + '0PEREZ ANA', 43) + '   18518.50\n' + pad('00000' + '30111222' + '0GOMEZ LUIS', 44) + '    2000.00\n'), { formatId: 1 });
  assert.deepEqual([short.rows.map(r => r.amountCents), short.shortLines, short.recordLength], [['1851850', '200000'], 1, 55]);
  for (const bad of [pad('0000020111222', 40) + '18518.50', pad('0000020111222', 43) + '00018518.5', pad('0000020111222', 43) + '0001851850 ', '0000020111 18518.50'])
    assert.throws(() => readEntityTxt(enc(bad + '\n'), { formatId: 1 }), e => /posiciones y el formato lee hasta/.test(e.issues[0].message), bad);
  // An amount glued to the identity, or with implied decimals, is never taken from the end of the line.
  assert.throws(() => readEntityTxt(enc('0000123401234.56\n'), { formatId: 9 }), /renglones no se pueden leer/);
  assert.throws(() => readEntityTxt(enc(pad('000' + '20111222', 44) + ' 123.45\n'), { formatId: 17, scale: 2 }), /renglones no se pueden leer/);
});

test('zero placeholders are omitted only when requested, while explicit zero quantities remain valid by default', () => {
  const osep = (dni, quantity, amount) => pad('0000000' + dni, 82) + quantity + amount + pad('', 92);
  const osepBytes = enc([osep('20111222', '1', '0000520000'), osep('30111222', '0', '0000000000'), osep('40111222', '2', '0001040000'), osep('50111222', '0', '0000000000')].join('\r\n'));
  const preserved = readEntityTxt(osepBytes, { formatId: 16, scale: 2 });
  assert.equal(preserved.rows.length, 4); assert.equal(preserved.zeroLines, 0);
  const read = readEntityTxt(osepBytes, { formatId: 16, scale: 2, skipZeroRows: true });
  assert.deepEqual([read.lines, read.zeroLines, read.rows.map(r => [r.key, r.amountCents]), read.totalCents], [4, 2, [['20111222', '520000'], ['40111222', '1040000']], '1560000']);
  // A zero row never collides with the real row of the same person, and a file with nothing to load says so with no rows.
  const repeated = readEntityTxt(enc(pad('0000020111222', 44) + '00000000.00\n' + pad('0000020111222', 44) + '00000050.00\n'), { formatId: 1, skipZeroRows: true });
  assert.deepEqual([repeated.rows.length, repeated.rows[0].amountCents, repeated.rows[0].sourceLines, repeated.zeroLines], [1, '5000', [2], 1]);
  const quantities = readEntityTxt(enc('2011122200000\n3011122200000\n'), { formatId: 4, scale: 2 });
  assert.deepEqual(quantities.rows.map(r => [r.quantityDecimal, r.amountCents]), [['0', null], ['0', null]]);
  const nothing = readEntityTxt(enc('2011122200000\n3011122200000\n'), { formatId: 4, scale: 2, skipZeroRows: true });
  assert.deepEqual([nothing.rows.length, nothing.zeroLines, nothing.totalCents], [0, 2, '0']);
  const zeroQuantityWithAmount = readEntityTxt(enc('00001234' + '000.00' + '00000100.00'), { formatId: 22, skipZeroRows: true });
  assert.deepEqual([zeroQuantityWithAmount.rows[0].quantityDecimal, zeroQuantityWithAmount.rows[0].amountCents], ['0', '10000']);
});

test('the record length suggests the format; several formats read a foreign file without error, so the length is the check', () => {
  assert.deepEqual(GRH_ENTITY_FORMATS.filter(x => x.length !== null).map(x => [x.id, x.length]), [[1, 55], [4, 13], [7, 185], [16, 185], [14, 185], [15, 185], [20, 185], [8, 185], [21, 185], [10, 52], [17, 80], [9, 18]]);
  for (const format of GRH_ENTITY_FORMATS) if (format.length !== null) assert.ok(format.label.includes('(' + format.length + ')') && format.length >= Math.max(...format.items.map(([, p, l]) => p + l)), format.label);
  assert.deepEqual(entityFormatsForLength(80).map(x => x.id), [17]);
  assert.deepEqual(entityFormatsForLength(185, '603').map(x => x.id).slice(0, 2), [14, 7], 'el formato del concepto nombrado va primero');
  assert.deepEqual(entityFormatsForLength(62), []);
  const cofarm = enc([1, 2, 3].map(n => pad('000' + (20111222 + n) + '000', 40) + '0000' + '01234567' + pad('', 28)).join('\r\n') + '\r\n' + 'pie\r\n');
  assert.equal(entityRecordLength(cofarm), 80);
  assert.equal(entityRecordLength(new Uint8Array()), 0);
  const right = readEntityTxt(cofarm.slice(0, 3 * 82), { formatId: 17, scale: 2 }), wrong = readEntityTxt(cofarm.slice(0, 3 * 82), { formatId: 2 });
  assert.deepEqual([right.recordLength, right.totalCents, wrong.recordLength, wrong.totalCents === right.totalCents], [80, '3703701', 80, false], 'otro formato lo lee sin error y da otro total');
});

test('a person with several active legajos goes to the lowest-numbered one only when asked, and says among which', () => {
  const subjects = [{ contractId: 'a1', legajo: '1203', identityToken: 't1' }, { contractId: 'b2', legajo: '874', identityToken: 't2' }, { contractId: 'c3', legajo: '12', identityToken: 't3' }];
  const roster = [{ contractId: 'a1', legajo: '1203', dni: '30111222', status: 'active' }, { contractId: 'b2', legajo: '874', dni: '30111222', status: 'active' }, { contractId: 'c3', legajo: '12', dni: '20111222', status: 'active' }, { contractId: 'zz', legajo: '5', dni: '30111222', status: 'inactive' }];
  const read = readEntityTxt(enc([20111222, 30111222].map(d => pad('00000' + d, 44) + '00000100.00').join('\n')), { formatId: 1 });
  const strict = resolveEntityRows(read, roster, subjects);
  assert.deepEqual([strict.resolved.map(r => r.legajo), strict.ambiguous.map(r => r.candidates)], [['12'], [['1203', '874']]]);
  const lowest = resolveEntityRows(read, roster, subjects, { preferLowestLegajo: true });
  assert.deepEqual(lowest.resolved.map(r => [r.key, r.legajo, r.contractId, r.identityToken, r.chosenAmong ?? null]), [['20111222', '12', 'c3', 't3', null], ['30111222', '874', 'b2', 't2', ['1203', '874']]]);
  assert.deepEqual([lowest.ambiguous, lowest.missing], [[], []]);
  const odd = resolveEntityRows(read, roster.map(r => (r.contractId === 'b2' ? { ...r, legajo: '874-B' } : r)), subjects.map(s => (s.contractId === 'b2' ? { ...s, legajo: '874-B' } : s)), { preferLowestLegajo: true });
  assert.equal(odd.ambiguous.length, 1, 'sin números comparables no se elige');
  const panel = fs.readFileSync('assets/own-payroll-novelties-panel.js', 'utf8');
  assert.doesNotMatch(panel, /data-n-import-(?:lowest|zero) checked/); assert.match(panel, /entityRecordLength\(new Uint8Array\(await file\.arrayBuffer\(\)\)\)/);
  assert.match(panel, /en cero no se \$\{read\.zeroLines===1\?'carga':'cargan'\}, según la opción marcada/); assert.match(panel, /el importe se tomó del final del renglón/);
});

test('an explicit lowest-legajo choice never resolves tied numeric legajos to an arbitrary contract', () => {
  const read = readEntityTxt(enc(pad('0000030111222', 44) + '00000100.00'), { formatId: 1 });
  for (const legajos of [['874', '874'], ['000874', '874']]) {
    const subjects = legajos.map((legajo, i) => ({ contractId: 'c' + i, legajo, identityToken: 't' + i }));
    const roster = subjects.map(s => ({ ...s, dni: '30111222', status: 'active' }));
    for (const ordered of [roster, roster.slice().reverse()]) {
      const result = resolveEntityRows(read, ordered, subjects, { preferLowestLegajo: true });
      assert.deepEqual(result.resolved, []);
      assert.equal(result.ambiguous.length, 1);
      assert.deepEqual(result.ambiguous[0].candidates.slice().sort(), legajos.slice().sort());
    }
  }
});
