import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GRH_ENTITY_FORMATS, readEntityTxt, resolveEntityRows, entityConceptSuggestion, entityFormat, entityFormatNeedsScale, entityFormatsForLength, entityFormatsForFile, entityRecordLength, lowestLegajoChoices, pastedSheetCells, pastedSheetSuggestion, pastedSheetValues, readPastedSheet } from '../assets/grh-entity-formats.js';

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
  assert.deepEqual(linked.ambiguous.map(r => [r.key, r.candidates.map(c => c.legajo)]), [['30111222', ['11', '12']]]);
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
  assert.equal(GRH_ENTITY_FORMATS.length, 23);
  assert.equal(new Set(GRH_ENTITY_FORMATS.map(x => x.id)).size, 23);
  const panel = fs.readFileSync('assets/own-payroll-novelties-panel.js', 'utf8');
  assert.match(panel, /data-n-import-read/);
  assert.match(panel, /resolveEntityRows\(read,entityRoster,boot\?\.subjects,\{choices:entityChoices\}\)/);
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

// GRH's import routine never loads a zero row (1.032.718 log entries across every format). Here it is the caller's
// explicit option; the screen offers it ticked on every new file and says how many rows were left out.
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
  const panel = fs.readFileSync('assets/own-payroll-novelties-panel.js', 'utf8');
  assert.doesNotMatch(panel, /data-n-import-zero checked/, 'la opción no queda fija en el marcado');
  assert.match(panel, /skipZeroRows:\$\('import-zero'\)\.checked/); assert.match(panel, /\$\('import-zero'\)\.checked=false;/, 'cada archivo nuevo conserva ceros hasta elegir omitirlos');
  assert.match(panel, /en cero no se \$\{read\.zeroLines===1\?'carga':'cargan'\}, según la opción marcada/);
});

test('the record length suggests the format; several formats read a foreign file without error, so the length is the check', () => {
  assert.deepEqual(GRH_ENTITY_FORMATS.filter(x => x.length !== null).map(x => [x.id, x.length]), [[1, 55], [4, 13], [7, 185], [16, 185], [14, 185], [15, 185], [20, 185], [8, 185], [21, 185], [17, 80], [18, 52], [101, 49], [102, 62], [103, 54], [9, 18]]);
  for (const format of GRH_ENTITY_FORMATS) if (format.length !== null) assert.ok(format.label.includes('(' + format.length + ')') && format.length >= Math.max(...format.items.map(([, p, l]) => p + l)), format.label);
  assert.deepEqual(entityFormatsForLength(80).map(x => x.id), [17]);
  assert.deepEqual(entityFormatsForLength(185, '603').map(x => x.id).slice(0, 2), [14, 7], 'el formato del concepto nombrado va primero');
  assert.deepEqual([entityFormatsForLength(62).map(x => x.id), entityFormatsForLength(58)], [[102], []]);
  const cofarm = enc([1, 2, 3].map(n => pad('000' + (20111222 + n) + '000', 40) + '0000' + '01234567' + pad('', 28)).join('\r\n') + '\r\n' + 'pie\r\n');
  assert.equal(entityRecordLength(cofarm), 80);
  assert.equal(entityRecordLength(new Uint8Array()), 0);
  const right = readEntityTxt(cofarm.slice(0, 3 * 82), { formatId: 17, scale: 2 }), wrong = readEntityTxt(cofarm.slice(0, 3 * 82), { formatId: 2 });
  assert.deepEqual([right.recordLength, right.totalCents, wrong.recordLength, wrong.totalCents === right.totalCents], [80, '3703701', 80, false], 'otro formato lo lee sin error y da otro total');
});

// 13/11/2026 · Liquidaciones: «la novedad va a un solo legajo, independientemente del número». Nada se da por sabido:
// la fila queda sin asignar hasta que quien importa elige el contrato. El número menor (GRH, 23 meses: 1.848 de 1.917
// casos) es una propuesta de un paso, no una regla, y un empate entre contratos nunca se resuelve solo.
test('a person with several active legajos gets the novelty on one only, and only the one the person importing chooses', () => {
  const subjects = [{ contractId: 'a1', legajo: '1203', identityToken: 't1' }, { contractId: 'b2', legajo: '874', identityToken: 't2' }, { contractId: 'c3', legajo: '12', identityToken: 't3' }];
  const roster = [{ contractId: 'a1', legajo: '1203', dni: '30111222', status: 'active', name: 'Sintética Dos', organization: 'Obras', sector: 'Taller', category: 'Clase 5' }, { contractId: 'b2', legajo: '874', dni: '30111222', status: 'active', name: 'Sintética Dos', organization: 'Gobierno' }, { contractId: 'c3', legajo: '12', dni: '20111222', status: 'active' }, { contractId: 'zz', legajo: '5', dni: '30111222', status: 'inactive' }];
  const read = readEntityTxt(enc([20111222, 30111222].map(d => pad('00000' + d, 44) + '00000100.00').join('\n')), { formatId: 1 });
  const strict = resolveEntityRows(read, roster, subjects);
  assert.deepEqual([strict.resolved.map(r => r.legajo), strict.ambiguous.map(r => [r.name, r.candidates])], [['12'], [['Sintética Dos', [{ contractId: 'b2', legajo: '874', detail: 'Gobierno' }, { contractId: 'a1', legajo: '1203', detail: 'Obras · Taller · Clase 5' }]]]], 'sin elección no entra, y la lista dice qué cargo es cada legajo');
  for (const choices of [new Map([['30111222', 'a1']]), { 30111222: 'A1' }]) {
    const chosen = resolveEntityRows(read, roster, subjects, { choices });
    assert.deepEqual(chosen.resolved.map(r => [r.legajo, r.contractId, r.identityToken, r.chosenAmong ?? null, r.chosenByPerson ?? null]), [['12', 'c3', 't3', null, null], ['1203', 'a1', 't1', ['874', '1203'], true]]);
    assert.deepEqual([chosen.ambiguous, chosen.missing], [[], []]);
  }
  // A choice that is not one of that person's active contracts (the inactive one, somebody else's, a legajo number) is ignored.
  for (const wrong of ['zz', 'c3', '874', 'nadie']) assert.deepEqual(resolveEntityRows(read, roster, subjects, { choices: { 30111222: wrong } }).resolved.map(r => r.legajo), ['12']);
  // The proposal is explicit and separate: it names the contract of the lowest number, and the bulk option does the same.
  assert.deepEqual([...lowestLegajoChoices(strict.ambiguous)], [['30111222', 'b2']]);
  const lowest = resolveEntityRows(read, roster, subjects, { preferLowestLegajo: true });
  assert.deepEqual(lowest.resolved.map(r => [r.legajo, r.contractId, r.chosenByPerson ?? null]), [['12', 'c3', null], ['874', 'b2', false]]);
  assert.equal(resolveEntityRows(read, roster, subjects, { preferLowestLegajo: true, choices: { 30111222: 'a1' } }).resolved[1].legajo, '1203', 'la elección de la persona manda sobre la propuesta');
  const odd = resolveEntityRows(read, roster.map(r => (r.contractId === 'b2' ? { ...r, legajo: '874-B' } : r)), subjects.map(s => (s.contractId === 'b2' ? { ...s, legajo: '874-B' } : s)), { preferLowestLegajo: true });
  assert.deepEqual([odd.ambiguous.length, lowestLegajoChoices(odd.ambiguous).size], [1, 0], 'sin números comparables no se propone');
  assert.equal(resolveEntityRows(read, roster.map(r => (r.contractId === 'b2' ? { ...r, legajo: '874-B' } : r)), subjects.map(s => (s.contractId === 'b2' ? { ...s, legajo: '874-B' } : s)), { choices: { 30111222: 'b2' } }).resolved[1].legajo, '874-B', 'pero se puede elegir de la lista');
  const panel = fs.readFileSync('assets/own-payroll-novelties-panel.js', 'utf8');
  assert.doesNotMatch(panel, /data-n-import-lowest[ >]/, 'no hay casilla de «número menor»'); assert.match(panel, /data-n-import-legajo/); assert.match(panel, /entityChoices\.set\(r\.key,select\.value\)/); assert.match(panel, /lowestLegajoChoices\(pending\)/);
  assert.match(panel, /entityFormatsForFile\(new Uint8Array\(await file\.arrayBuffer\(\)\),named\)/); assert.match(panel, /el importe se tomó del final del renglón/);
});

test('a lowest-legajo proposal never resolves tied numeric legajos to an arbitrary contract', () => {
  const read = readEntityTxt(enc(pad('0000030111222', 44) + '00000100.00'), { formatId: 1 });
  for (const legajos of [['874', '874'], ['000874', '874']]) {
    const subjects = legajos.map((legajo, i) => ({ contractId: 'c' + i, legajo, identityToken: 't' + i }));
    const roster = subjects.map(s => ({ ...s, dni: '30111222', status: 'active' }));
    for (const ordered of [roster, roster.slice().reverse()]) {
      const result = resolveEntityRows(read, ordered, subjects, { preferLowestLegajo: true });
      assert.deepEqual(result.resolved, []);
      assert.equal(result.ambiguous.length, 1);
      assert.deepEqual(result.ambiguous[0].candidates.map(c => c.legajo).sort(), legajos.slice().sort());
      assert.equal(lowestLegajoChoices(result.ambiguous).size, 0, 'tampoco se propone');
      assert.deepEqual(resolveEntityRows(read, ordered, subjects, { choices: { 30111222: 'c1' } }).resolved.map(r => r.contractId), ['c1'], 'la persona sí puede elegir el contrato');
    }
  }
});

// 13/11/2026 · Liquidaciones: «que lea obligatoriamente el txt que ellos nos envían». Los tres que hasta hoy se pasaban a
// mano a Formato Junín, contrastados con agosto de 2026 (SMSV 18 de 18, Sancor 34 de 34, AMARU 9 de 9 y 8 de 8 iguales a
// GRH). Datos de prueba inventados.
test('the original files of SMSV, Sancor and AMARU are read as the entity sends them', () => {
  const smsv = readEntityTxt(enc(['452' + '20111222' + pad('PEREZ ANA', 30) + '00123456', '452' + '30111222' + pad('GOMEZ LUIS', 30) + '00000000'].join('\r\n')), { formatId: 101, skipZeroRows: true });
  assert.deepEqual([entityFormatNeedsScale(entityFormat(101)), smsv.rows.map(r => [r.key, r.amountCents]), smsv.zeroLines], [false, [['20111222', '123456']], 1], 'dos decimales implícitos, sin preguntarlos');
  // Sancor bills with cents; GRH has been loading whole pesos. Exact by default; whole pesos require an explicit option.
  const sancorFile = enc(['42' + '20111222' + pad('PEREZ ANA', 42) + '0012345,67', '42' + '30111222' + pad('GOMEZ LUIS', 42) + '0000999,99', '42' + '40111222' + pad('DIAZ EVA', 42) + '0000100,00'].join('\n'));
  const whole = readEntityTxt(sancorFile, { formatId: 102, wholePesos: true }), exact = readEntityTxt(sancorFile, { formatId: 102 });
  assert.deepEqual([whole.wholePesos, whole.rows.map(r => r.amountCents), whole.totalCents, whole.droppedCents], [true, ['1234500', '99900', '10000'], '1344400', '166']);
  assert.deepEqual([exact.wholePesos, exact.rows.map(r => r.amountCents), exact.totalCents, exact.droppedCents], [false, ['1234567', '99999', '10000'], '1344566', '0']);
  assert.equal(readEntityTxt(enc(pad('0000020111222', 44) + '00000100.99\n'), { formatId: 1, wholePesos: true }).totalCents, '10099', 'sólo donde GRH lo viene haciendo');
  // AMARU: one file, fee and services. The fee is whatever amount every member has that month.
  const amaru = (code, dni, cents) => code + '20' + dni + '0' + pad('SOCIO', 30) + String(cents).padStart(10, '0');
  for (const fee of [45000, 250000, 310000]) {
    const read = readEntityTxt(enc([amaru('638', '20111222', fee), amaru('638', '20111222', 7500000), amaru('638', '30111222', fee), amaru('639', '40111222', fee), amaru('638', '40111222', 1234567)].join('\n')), { formatId: 103 });
    assert.deepEqual(read.rows.map(r => [r.key, r.concept, r.amountCents]), [['20111222', '638', String(fee)], ['20111222', '639', '7500000'], ['30111222', '638', String(fee)], ['40111222', '638', String(fee)], ['40111222', '639', '1234567']], 'el código que escribe AMARU no decide: decide la cuota');
    assert.deepEqual(read.split, { kind: 'quota', concepts: ['638', '639'], sharedAmountCents: String(fee), rows: { 638: 3, 639: 2 } });
  }
  for (const unclear of [[amaru('638', '20111222', 250000)], [amaru('638', '20111222', 250000), amaru('638', '30111222', 260000)], [amaru('638', '20111222', 250000), amaru('638', '30111222', 250000), amaru('638', '40111222', 99900), amaru('638', '50111222', 99900)]])
    assert.throws(() => readEntityTxt(enc(unclear.join('\n')), { formatId: 103 }), /No se reconoce una cuota social única/, 'sin una cuota clara no se reparte');
  const linked = resolveEntityRows(readEntityTxt(enc([amaru('638', '20111222', 250000), amaru('638', '20111222', 7500000), amaru('638', '30111222', 250000)].join('\n')), { formatId: 103 }), [{ contractId: 'a1', legajo: '10', dni: '20111222', status: 'active' }], [{ contractId: 'a1', legajo: '10', identityToken: 't1' }]);
  assert.deepEqual([linked.resolved.map(r => [r.legajo, r.concept, r.amountCents]), linked.missing.map(r => r.concept)], [[['10', '638', '250000'], ['10', '639', '7500000']], ['638']]);
  const panel = fs.readFileSync('assets/own-payroll-novelties-panel.js', 'utf8');
  assert.match(panel, /conceptSourceId:r\.concept\?\?concept/); assert.match(panel, /wholePesos:f\?\.wholePesos\?!\$\('import-cents'\)\.checked:null/); assert.match(panel, /Cuota social reconocida en el archivo/);
});

test('IPV uses «Colegio Farmacéutico»; a «Formato Junín» file says its own concept, and AMSA 650 and 651 come together', () => {
  assert.ok(entityFormat(17).concepts.includes('618') && entityFormat(18).concepts.includes('618') && !entityFormat(10).concepts.length);
  assert.deepEqual([4, 7, 16, 14, 17].map(id => entityFormat(id).defaultScale), [2, 2, 2, 2, 2], 'la escala que usan los archivos reales se propone sola');
  const row = (code, dni, amount) => pad(code + '20' + dni + '0SOCIO', 44) + amount;
  const one = readEntityTxt(enc([row('665', '20111222', '00000100.00'), row('665', '30111222', '00000200,50')].join('\n')), { formatId: 1 });
  assert.deepEqual([one.codeConcept, one.split, one.mixedCodes, one.rows.map(r => r.concept ?? null)], ['665', null, null, [null, null]]);
  const amsa = readEntityTxt(enc([row('650', '20111222', '00004040.00'), row('651', '20111222', '00002304.33'), row('650', '30111222', '00004040.00')].join('\n')), { formatId: 1 });
  assert.deepEqual([amsa.codeConcept, amsa.split, amsa.rows.map(r => [r.key, r.concept, r.amountCents])], [null, { kind: 'code', concepts: ['650', '651'], rows: { 650: 2, 651: 1 } }, [['20111222', '650', '404000'], ['20111222', '651', '230433'], ['30111222', '650', '404000']]], 'la misma persona en los dos conceptos no es un repetido');
  // Codes that are not concepts of the format (Caja de Ahorro writes 410, SMSV 452) decide nothing; a mix is reported.
  const caja = readEntityTxt(enc(row('410', '20111222', '00000100.00') + '\n'), { formatId: 1 });
  assert.deepEqual([caja.codeConcept, caja.split, caja.mixedCodes], [null, null, null]);
  const mixed = readEntityTxt(enc([row('650', '20111222', '00000100.00'), row('410', '30111222', '00000100.00')].join('\n')), { formatId: 1 });
  assert.deepEqual([mixed.codeConcept, mixed.split, mixed.mixedCodes, mixed.rows.map(r => r.concept ?? null)], [null, null, ['410', '650'], [null, null]]);
  assert.ok(!('code' in one.rows[0]));
});

test('the format is proposed by reading the file, not by its length alone', () => {
  const junin = (name, amount) => pad('410' + '20' + '20111222' + '0' + name, 44) + amount;
  // Caja de Ahorro: «Formato Junín» one position short. AMARU's original has the same 54 positions.
  const caja = enc([junin('PEREZ ANA', '   18518.50').slice(1), junin('GOMEZ LUIS', '    2000.00').slice(1)].map(l => l.slice(0, 13) + l.slice(13)).join('\n'));
  const shortCaja = enc([pad('41020' + '20111222' + '0PEREZ ANA', 43) + '   18518.50', pad('41020' + '30111222' + '0GOMEZ LUIS', 43) + '    2000.00'].join('\n'));
  assert.deepEqual([entityRecordLength(shortCaja), entityFormatsForFile(shortCaja)], [54, { length: 54, formats: [1], concept: null, split: null }]);
  assert.ok(caja.length > 0);
  const amaru = (dni, cents) => '63820' + dni + '0' + pad('SOCIO', 30) + String(cents).padStart(10, '0');
  const original = enc([amaru('20111222', 250000), amaru('20111222', 7500000), amaru('30111222', 250000)].join('\n'));
  assert.deepEqual([entityRecordLength(original), entityFormatsForFile(original)], [54, { length: 54, formats: [103], concept: null, split: ['638', '639'] }]);
  const amas = enc([pad('66520' + '20111222' + '0SOCIO', 44) + '00000100,00', pad('66520' + '30111222' + '0SOCIO', 44) + '00000200,00'].join('\n'));
  assert.deepEqual(entityFormatsForFile(amas), { length: 55, formats: [1], concept: '665', split: null });
  const amsa = enc([pad('65020' + '20111222' + '0SOCIO', 44) + '00000100.00', pad('65120' + '30111222' + '0SOCIO', 44) + '00000200.00'].join('\n'));
  assert.deepEqual(entityFormatsForFile(amsa), { length: 55, formats: [1], concept: null, split: ['650', '651'] });
  const ipv80 = enc(pad('423' + '20111222', 44) + '00012345' + pad('', 28) + '\n'), ipv52 = enc('420' + '20111222' + pad('TITULAR', 30) + '00000123.45\n');
  assert.deepEqual([entityFormatsForFile(ipv80, '618').formats, entityFormatsForFile(ipv52, '618').formats, entityFormatsForFile(enc('452' + '20111222' + pad('SOCIO', 30) + '00012345\n')).formats], [[17], [18], [101]]);
  assert.deepEqual(entityFormatsForFile(enc('nada que ver\n')), { length: 12, formats: [], concept: null, split: null });
  assert.deepEqual(entityFormatsForFile(new Uint8Array()), { length: 0, formats: [], concept: null, split: null });
});

test('a file pasted twice into itself is said as such instead of offering to sum it', () => {
  const row = (dni, amount) => pad('000' + dni, 44) + amount + pad('', 28);
  const once = [row('20111222', '00010000'), row('30111222', '00020000'), row('30111222', '00005000'), row('40111222', '00030000')];
  const legit = (() => { try { readEntityTxt(enc(once.join('\n')), { formatId: 17, scale: 2 }); } catch (e) { return e; } })();
  assert.deepEqual([legit.duplicatedFile ?? false, legit.issues.map(i => [i.line, i.repeated])], [false, [[3, true]]]);
  const summed = readEntityTxt(enc(once.join('\n')), { formatId: 17, scale: 2, sumRepeated: true });
  assert.deepEqual([summed.rows.map(r => r.amountCents), summed.repeatedRows, summed.duplicatedFile], [['10000', '25000', '30000'], 1, false]);
  const twice = enc([...once, ...once].join('\n'));
  const error = (() => { try { readEntityTxt(twice, { formatId: 17, scale: 2 }); } catch (e) { return e; } })();
  assert.equal(error.duplicatedFile, true); assert.match(error.message, /copiado dos veces: 5 de sus 8 renglones repiten un DNI que ya estaba, 4 con el mismo valor/);
  const forced = readEntityTxt(twice, { formatId: 17, scale: 2, sumRepeated: true });
  assert.deepEqual([forced.duplicatedFile, forced.repeatedRows, forced.totalCents], [true, 5, '130000'], 'si igual se suma, queda dicho');
  const panel = fs.readFileSync('assets/own-payroll-novelties-panel.js', 'utf8');
  assert.match(panel, /e\.issues\.every\(i=>i\.repeated\)&&!e\.duplicatedFile/); assert.match(panel, /dataset\.nImportSumNow/);
});


test('AMARU requires one unique common fee per person, without majority inference', () => {
  const line = (dni, amount) => pad('63800' + dni, 44) + String(amount).padStart(10, '0');
  const read = rows => readEntityTxt(enc(rows.join('\n')), {formatId:103});
  assert.throws(() => read([line('20111222',250000),line('30111222',250000),line('40111222',700000)]), /cuota social única/);
  assert.throws(() => read([line('20111222',250000),line('20111222',700000),line('30111222',250000),line('30111222',700000)]), /cuota social única/);
  assert.throws(() => read([line('20111222',250000),line('20111222',250000),line('30111222',250000)]), /cuota social única/);
});

// Club Junín, tasas municipales y embargos llegan como planilla de Excel; hasta hoy se armaba a mano un TXT por legajo.
// Excel copia las celdas separadas por tabulaciones: se pegan y se elige qué columna es cada cosa. Datos inventados.
test('rows pasted from a spreadsheet are read with the columns the person chooses, proposed from the titles', () => {
  const club = ['LEGAJO\tAPELLIDO\tNOMBRE\tD.N.I Nº\tCONCEPTO\tIMPORTE\tOBS.', '12\tUNO\tSINTETICA\t20.111.222\tCUOTA\t13.690,00\t', '874\tDOS\tSINTETICA\t30111222\tCUOTA\t$ 2.500\t', '\t\t\t\t\t\t', '\t\t\t\tTOTAL\t16.190,00\t'].join('\r\n');
  const sheet = pastedSheetCells(club), guess = pastedSheetSuggestion(sheet);
  assert.deepEqual([sheet.columns, sheet.header[0], sheet.rows.length, sheet.rows[0].line], [7, 'LEGAJO', 3, 2]);
  assert.deepEqual([guess.identityColumn, guess.identity, guess.amountColumn, guess.quantityColumn, guess.labels[3], guess.labels[5]], [0, 'legajo', 5, null, 'D · D.N.I Nº', 'F · IMPORTE'], 'con legajo y DNI en la planilla se propone el legajo: no hay nada que elegir después');
  const read = readPastedSheet(club, { identityColumn: 0, identity: 'legajo', amountColumn: 5 });
  assert.deepEqual([read.identity, read.rows.map(r => [r.key, r.amountCents, r.sourceLines]), read.totalCents, read.blankIdentity, read.lines], ['legajo', [['12', '1369000', [2]], ['874', '250000', [3]]], '1619000', 1, 3], 'la fila del total no tiene legajo: se cuenta y queda afuera');
  const byDni = readPastedSheet(club, { identityColumn: 3, identity: 'dni', amountColumn: 5 });
  assert.deepEqual(byDni.rows.map(r => r.key), ['20111222', '30111222']);
  // The read has the shape of a TXT read: the same resolution to one active own contract applies.
  const linked = resolveEntityRows(read, [{ contractId: 'a1', legajo: '12', dni: '20111222', status: 'active' }, { contractId: 'b2', legajo: '874', dni: '30111222', status: 'active' }, { contractId: 'c3', legajo: '1203', dni: '30111222', status: 'active' }], [{ contractId: 'a1', legajo: '12', identityToken: 't1' }, { contractId: 'b2', legajo: '874', identityToken: 't2' }, { contractId: 'c3', legajo: '1203', identityToken: 't3' }]);
  assert.deepEqual([linked.resolved.map(r => [r.legajo, r.contractId, r.amountCents]), linked.ambiguous, linked.missing], [[['12', 'a1', '1369000'], ['874', 'b2', '250000']], [], []], 'por legajo, quien tiene dos cargos ya viene resuelto');
  // Without titles the columns are proposed from what the cells look like; numbers as Excel shows them.
  const bare = '867\t13690\n1199\t1234.5\n12\t1.234\n45\t0,5';
  assert.deepEqual([pastedSheetCells(bare).header, pastedSheetSuggestion(pastedSheetCells(bare)).identity, pastedSheetSuggestion(pastedSheetCells(bare)).amountColumn], [null, 'legajo', 1]);
  assert.deepEqual(readPastedSheet(bare, { identityColumn: 0, identity: 'legajo', amountColumn: 1 }).rows.map(r => r.amountCents), ['1369000', '123450', '123400', '50']);
  const hours = readPastedSheet('DNI;Horas\n20111222;12,5\n30111222;0', { identityColumn: 0, identity: 'dni', quantityColumn: 1, skipZeroRows: true });
  assert.deepEqual([hours.rows.map(r => [r.key, r.quantityDecimal, r.amountCents]), hours.zeroLines, pastedSheetSuggestion(pastedSheetCells('DNI;Horas\n20111222;12,5')).quantityColumn], [[['20111222', '12.5', null]], 1, 1]);
});

test('a pasted sheet is the whole selection or nothing, and what it cannot be is said', () => {
  for (const [text, message] of [['', /Pegá las filas/], ['una sola columna\n12\n13', /al menos dos columnas/], ['12\t' + 'x\t'.repeat(45), /entre 2 y 40 columnas/]]) assert.throws(() => pastedSheetCells(text), message);
  const options = { identityColumn: 0, identity: 'legajo', amountColumn: 1 };
  const bad = (() => { try { readPastedSheet('LEGAJO\tIMPORTE\n12\t100,00\nPEREZ\t50,00\n13\t-20,00\n14\t1.2.3\n15\t10,123', options); } catch (e) { return e; } })();
  assert.match(bad.message, /^4 de 5 filas no se pueden leer/);
  assert.deepEqual(bad.issues.map(i => [i.line, i.message]), [[3, 'legajo inválido'], [4, 'no se admiten valores negativos'], [5, 'no se entiende el número «1.2.3»'], [6, 'el importe tendría más de dos decimales']]);
  for (const wrong of [{ identityColumn: null, identity: 'legajo', amountColumn: 1 }, { identityColumn: 0, identity: 'otro', amountColumn: 1 }, { identityColumn: 0, identity: 'legajo' }, { identityColumn: 0, identity: 'legajo', amountColumn: 0 }, { identityColumn: 0, identity: 'legajo', amountColumn: 1, quantityColumn: 1 }, { identityColumn: 0, identity: 'legajo', amountColumn: 9 }])
    assert.throws(() => readPastedSheet('12\t100,00', wrong), /Elegí la columna|columna distinta/);
  assert.throws(() => readPastedSheet('DNI\tIMPORTE\n123\t10', { identityColumn: 0, identity: 'dni', amountColumn: 1 }), e => e.issues[0].message === 'DNI inválido');
  // Repeats behave like in a TXT: reported, summed on request, and a selection pasted twice is said as such.
  const once = ['12\t100', '13\t200', '13\t50', '14\t300'];
  assert.throws(() => readPastedSheet(once.join('\n'), options), e => e.issues.length === 1 && e.issues[0].repeated && /también en la fila 2/.test(e.issues[0].message));
  assert.deepEqual(readPastedSheet(once.join('\n'), { ...options, sumRepeated: true }).rows.map(r => r.amountCents), ['10000', '25000', '30000']);
  assert.throws(() => readPastedSheet([...once, ...once].join('\n'), options), e => e.duplicatedFile === true && /pegadas dos veces/.test(e.message));
  const panel = fs.readFileSync('assets/own-payroll-novelties-panel.js', 'utf8');
  assert.match(panel, /data-n-paste-read/); assert.match(panel, /readPastedSheet\(\$\('paste'\)\.value,/); assert.match(panel, /entityPresent\(\{read,concept,f:null,title:'Planilla pegada'/);
});

// Contrastado con la planilla real del Club de agosto de 2026: trae el nombre del club arriba de los títulos, personas
// anotadas sin importe y una columna donde el club escribe «jubilado» o «cobrar a domicilio». Datos inventados.
test('a real sheet is pasted as it is: titles below a heading, people with no amount, and rows left out by a column value', () => {
  const sheetText = ['CLUB SINTETICO - DESCUENTOS\t\t\t\t', 'LEGAJO\tAPELLIDO\tCONCEPTO\tIMPORTE\tOBS.', '12\tUNO\tCUOTA MES\t13.690\tBIEN', '874\tDOS\tcuota  mes\t13.690\tBIEN', '45\tCUATRO\tJUBILADO\t13.690\t', '46\tCINCO\tCOBRAR A DOMICILIO\t9.000\tBIEN', '47\tSEIS\tCUOTA MES\t\tSIN FICHA', '\t\t\t50.070\t'].join('\n');
  const sheet = pastedSheetCells(sheetText), guess = pastedSheetSuggestion(sheet);
  assert.deepEqual([sheet.leading, sheet.header[0], sheet.rows.length, sheet.rows[0].line, guess.identityColumn, guess.amountColumn], [1, 'LEGAJO', 6, 3, 0, 3], 'los títulos están en la segunda fila; lo de arriba no es dato');
  assert.deepEqual(pastedSheetValues(sheet, 2), [{ value: 'CUOTA MES', rows: 3 }, { value: '', rows: 1 }, { value: 'COBRAR A DOMICILIO', rows: 1 }, { value: 'JUBILADO', rows: 1 }], 'mayúsculas y espacios no separan un mismo valor');
  assert.equal(pastedSheetValues(sheet, 9), null);
  const many = pastedSheetCells(['LEGAJO\tAPELLIDO', ...Array.from({ length: 61 }, (_, i) => `${i + 1}\tAPELLIDO ${i}`)].join('\n'));
  assert.equal(pastedSheetValues(many, 1), null, 'una columna de apellidos no es un filtro');
  const options = { identityColumn: 0, identity: 'legajo', amountColumn: 3 };
  const all = readPastedSheet(sheetText, options);
  assert.deepEqual([all.rows.map(r => r.key), all.noValueLines, all.blankIdentity, all.filteredOut, all.leadingLines], [['12', '874', '45', '46'], [7], 1, 0, 1], 'quien no trae importe se cuenta y queda afuera, con su fila');
  const kept = readPastedSheet(sheetText, { ...options, filterColumn: 2, filterValues: new Set(['CUOTA MES']) });
  assert.deepEqual([kept.rows.map(r => [r.key, r.amountCents]), kept.filteredOut, kept.noValueLines, kept.totalCents], [[['12', '1369000'], ['874', '1369000']], 2, [7], '2738000']);
  assert.throws(() => readPastedSheet(sheetText, { ...options, filterColumn: 2 }), /columna del filtro/);
  const panel = fs.readFileSync('assets/own-payroll-novelties-panel.js', 'utf8');
  assert.match(panel, /data-n-paste-filter/); assert.match(panel, /filterValues:column\('paste-filter'\)===null\?null:new Set\(/);
});

test('pasted amounts remain exact beyond Number precision and preserve explicit zero separately from a missing value', () => {
  const text = 'LEGAJO\tIMPORTE\tCANTIDAD\n12\t900719925474099,91\t\n45\t0,00\t\n46\t\t0\n47\t\t';
  const options = { identityColumn: 0, identity: 'legajo', amountColumn: 1, quantityColumn: 2 };
  const read = readPastedSheet(text, options);
  assert.deepEqual(read.rows.map(r => [r.key, r.amountCents, r.quantityDecimal]), [['12', '90071992547409991', null], ['45', '0', null], ['46', null, '0']]);
  assert.equal(read.totalCents, '90071992547409991');
  assert.deepEqual(read.noValueLines, [5]);
  const omitted = readPastedSheet(text, { ...options, skipZeroRows: true });
  assert.deepEqual([omitted.rows.map(r => r.key), omitted.zeroLines, omitted.noValueLines], [['12'], 2, [5]]);
});

test('a dot after a zero group remains a decimal point and never multiplies a pasted quantity or identity', () => {
  const quantity = readPastedSheet('LEGAJO\tCANTIDAD\n12\t0.125\n45\t0.001\n46\t0.010', { identityColumn: 0, identity: 'legajo', quantityColumn: 1 });
  assert.deepEqual(quantity.rows.map(r => r.quantityDecimal), ['0.125', '0.001', '0.01']);
  const amountOptions = { identityColumn: 0, identity: 'legajo', amountColumn: 1 };
  assert.throws(() => readPastedSheet('LEGAJO\tIMPORTE\n12\t0.005', amountOptions), e => e.issues.length === 1 && /más de dos decimales/.test(e.issues[0].message));
  assert.equal(readPastedSheet('LEGAJO\tIMPORTE\n12\t0.010', amountOptions).rows[0].amountCents, '1');
  assert.throws(() => readPastedSheet('LEGAJO\tIMPORTE\n0.123\t100', amountOptions), e => e.issues.length === 1 && e.issues[0].message === 'legajo inválido');
});

test('ambiguous quantity separators require an explicit decimal comma or ungrouped thousands', () => {
  const options = { identityColumn: 0, identity: 'legajo', quantityColumn: 1 };
  for (const value of ['1.234', '12.345', '123.456']) assert.throws(() => readPastedSheet('LEGAJO\tCANTIDAD\n12\t' + value, options), e => e.issues.length === 1 && /cantidad ambigua/.test(e.issues[0].message));
  const read = readPastedSheet('LEGAJO\tCANTIDAD\n12\t1,234\n45\t1234\n46\t1.234,5\n47\t1.234.567\n48\t1234.125', options);
  assert.deepEqual(read.rows.map(r => r.quantityDecimal), ['1.234', '1234', '1234.5', '1234567', '1234.125']);
});

test('header detection never drops earlier data or an arbitrary malformed first row, and limits data rows exactly', () => {
  const options = { identityColumn: 0, identity: 'legajo', amountColumn: 1 };
  assert.throws(() => readPastedSheet('12\t100,00\nLEGAJO\tIMPORTE\n13\t200,00', options), e => /antes de los títulos/.test(e.message) && e.issues[0].line === 1);
  assert.throws(() => readPastedSheet('PEREZ\t100,00\nLEGAJO\tIMPORTE\n13\t200,00', options), e => /antes de los títulos/.test(e.message) && e.issues[0].line === 1);
  assert.throws(() => readPastedSheet('PEREZ\terror\n13\t200,00', options), e => e.issues[0].line === 1 && e.issues[0].message === 'legajo inválido');
  const rows = Array.from({ length: 10000 }, (_, i) => `${i + 1}\t100`);
  assert.equal(pastedSheetCells('CLUB SINTETICO\t\nLEGAJO\tIMPORTE\n' + rows.join('\n')).rows.length, 10000);
  assert.throws(() => pastedSheetCells([...rows, '10001\t100'].join('\n')), /10.000 filas de datos/);
});

test('quoted multiline spreadsheet cells retain physical source lines and hours stay explicit when an amount exists', () => {
  const text = ['\tLegajo\tApellido y Nombre\tHORAS\t993- BRUTO\t"BRUTO SUJETO \nA GARANTIA"\t"MIN. GARAN \nPROV"\tDIFERENCIA\t', '1\t12\tUNO SINTETICA\t30\t500.000,00\t480.000,00\t600.000,00\t120.000,00\t97.200,00', '2\t874\t"DOS, ""LA"" SINTETICA"\t15\t250.000,00\t240.000,00\t300.000,00\t60.000,00\t48.600,50', '\t\t\t\t\t\t\t\t145.800,50'].join('\r\n');
  const sheet = pastedSheetCells(text), guess = pastedSheetSuggestion(sheet);
  assert.deepEqual([sheet.columns, sheet.header[5], sheet.header[6], sheet.rows.map(r => r.line), sheet.rows[1].cells[2]], [9, 'BRUTO SUJETO A GARANTIA', 'MIN. GARAN PROV', [4, 5, 6], 'DOS, "LA" SINTETICA']);
  assert.deepEqual([guess.identityColumn, guess.identity, guess.amountColumn, guess.quantityColumn], [1, 'legajo', 8, null]);
  const options = { identityColumn: 1, identity: 'legajo', amountColumn: 8 };
  const read = readPastedSheet(text, options);
  assert.deepEqual([read.rows.map(r => [r.key, r.amountCents, r.sourceLines]), read.blankIdentity, read.totalCents], [[['12', '9720000', [4]], ['874', '4860050', [5]]], 1, '14580050']);
  assert.deepEqual(readPastedSheet(text, { ...options, quantityColumn: 3 }).rows.map(r => r.quantityDecimal), ['30', '15'], 'the user can still choose a quantity explicitly');
  const onlyHours = pastedSheetSuggestion(pastedSheetCells('DNI\tAPELLIDO\tHORAS\n20111222\tUNO\t12,5'));
  assert.deepEqual([onlyHours.quantityColumn, onlyHours.amountColumn], [2, null]);
});

test('malformed spreadsheet quoting rejects the entire selection instead of absorbing another person or concatenating digits', () => {
  const options = { identityColumn: 0, identity: 'legajo', amountColumn: 1 };
  for (const text of ['LEGAJO\tIMPORTE\tNOTA\n12\t100,00\t"nota sin cerrar\n13\t200,00\totra', 'LEGAJO\tIMPORTE\n12\t"10"0,00\n13\t200,00', 'LEGAJO\tIMPORTE\tNOTA\n12\t100,00\ttexto"sin delimitar']) {
    assert.throws(() => readPastedSheet(text, options), e => /celda entre comillas inválida/.test(e.message) && e.issues.length === 1 && e.issues[0].line === 2);
  }
  assert.throws(() => pastedSheetCells('LEGAJO\tIMPORTE\tNOTA\n12\t100\t"nota\ncon varios renglones'), e => /comilla sin cerrar/.test(e.issues[0].message) && e.issues[0].line === 2);
});

test('valid quoted cells preserve escaped quotes and embedded delimiters without changing the spreadsheet format', () => {
  const text = 'LEGAJO;IMPORTE;NOTA\n12;"100,01"  ;"dato\tcon; separador y ""comillas"""\n13;200,00;"segundo\nrenglón"';
  const sheet = pastedSheetCells(text);
  assert.deepEqual([sheet.columns, sheet.rows.map(r => r.cells[2]), sheet.rows.map(r => r.line)], [3, ['dato con; separador y "comillas"', 'segundo renglón'], [2, 3]]);
  assert.deepEqual(readPastedSheet(text, { identityColumn: 0, identity: 'legajo', amountColumn: 1 }).rows.map(r => r.amountCents), ['10001', '20000']);
});

test('embedded line breaks or tabs remain valid text but can never join digits in an identity, amount or quantity', () => {
  const options = { identityColumn: 0, identity: 'legajo', amountColumn: 1, quantityColumn: 2 };
  for (const row of ['"1\n2"\t100,00\t1', '12\t"10\n0,00"\t1', '12\t100,00\t"1\n2"', '12\t"10\t0,00"\t1']) {
    assert.throws(() => readPastedSheet('LEGAJO\tIMPORTE\tCANTIDAD\n' + row + '\n13\t200,00\t2', options), e => e.issues.length === 1 && e.issues[0].line === 2 && /dentro de una celda/.test(e.issues[0].message));
  }
});
