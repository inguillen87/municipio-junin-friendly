import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ownRunDepartmentsForAll, ownRunUnsectoredText } from '../assets/own-run-departments.js';

const catalog = [
  { kind: 'sectors', code: '1', label: 'ADMINISTRATIVO' }, { kind: 'sectors', code: '13', label: 'HS. CATEDRAS CULTURA' },
  { kind: 'sectors', code: '4', label: 'TEMPORARIOS' }, { kind: 'sectors', code: '9', label: 'SIN PERSONAL' }, { kind: 'agreements', code: '1', label: 'ADMINISTRATIVO' },
];
const row = (legajo, sector, status = 'active') => ({ legajo, sector, status });

test('picks only the reparticiones with active people and lists the legajos left out', () => {
  const plan = ownRunDepartmentsForAll([row('10', 'ADMINISTRATIVO'), row('11', ' administrativo '), row('12', 'TEMPORARIOS'), row('13', 'HS. CATEDRAS CULTURA', 'inactive'), row('869', null), row('792', ''), row('793', '  ')], catalog);
  assert.deepEqual(plan.codes, ['1', '4']);
  assert.equal(plan.covered, 3);
  assert.deepEqual(plan.unsectored, ['792', '793', '869']);
  assert.equal(plan.usable, true);
  assert.match(ownRunUnsectoredText(plan), /^Los legajos 792, 793, 869 no tienen repartición cargada: .*las 2 reparticiones con personal activo: incluye a los 3 legajos restantes y deja fuera sólo esos 3/);
});

test('a repartición name outside the catalog (or ambiguous) blocks the shortcut instead of dropping people', () => {
  const unknown = ownRunDepartmentsForAll([row('10', 'ADMINISTRATIVO'), row('11', 'OBRAS NUEVAS'), row('869', null)], catalog);
  assert.equal(unknown.usable, false); assert.deepEqual(unknown.unmatched, ['OBRAS NUEVAS']);
  assert.match(ownRunUnsectoredText(unknown), /Corregí su ficha en Personas antes de calcular a todos\.$/);
  const twice = ownRunDepartmentsForAll([row('10', 'ADMINISTRATIVO')], [...catalog, { kind: 'sectors', code: '21', label: 'Administrativo' }]);
  assert.equal(twice.usable, false);
  assert.equal(ownRunUnsectoredText(ownRunDepartmentsForAll([row('10', 'ADMINISTRATIVO')], catalog)), '');
});

test('Calcular releases a rejected attempt only after the same key is verified as not registered', () => {
  const panel = fs.readFileSync('assets/own-payroll-run-panel.js', 'utf8');
  assert.match(panel, /if\(error\.status!==422\|\|!valid\(\)\|\|!can\(OWN_RUN_NOMINAL\)\)throw error;/);
  assert.match(panel, /resource=attempt&key='\+encodeURIComponent\(rejected\.key\)/);
  assert.match(panel, /if\(registered\)\{showCapture\(registered\);return;\}\s*if\(!missing\|\|attempt!==rejected\)throw error;\s*attempt=null;/);
  assert.match(panel, /data-own-unsectored-all/);
  assert.match(fs.readFileSync('scripts/build-friendly.mjs', 'utf8'), /'assets\/own-run-departments\.js'/);
});
