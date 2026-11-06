import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GRH_ENTITY_FORMATS, readEntityTxt, resolveEntityRows, entityConceptSuggestion, entityFormat } from '../assets/grh-entity-formats.js';

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
  assert.equal(entityConceptSuggestion('MAYORES44082026.TXT', entityFormat(4)), '');
  assert.equal(entityConceptSuggestion('999082026.txt', entityFormat(1)), '');
  assert.equal(GRH_ENTITY_FORMATS.length, 20);
  const panel = fs.readFileSync('assets/own-payroll-novelties-panel.js', 'utf8');
  assert.match(panel, /data-n-import-read/);
  assert.match(panel, /resolveEntityRows\(read,entityRoster,boot\?\.subjects\)/);
  assert.match(panel, /ownNoveltyCommand\(bodyValue\(\[\.\.\.rows,\.\.\.added\]\)\)/);
  assert.match(fs.readFileSync('scripts/build-friendly.mjs', 'utf8'), /'assets\/grh-entity-formats\.js'/);
});
