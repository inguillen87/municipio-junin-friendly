import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ownRunDepartmentsForAll, ownRunUnsectoredText } from '../assets/own-run-departments.js';

const catalog = [
  { kind: 'sectors', code: '1', label: 'ADMINISTRATIVO' }, { kind: 'sectors', code: '13', label: 'HS. CATEDRAS CULTURA' },
  { kind: 'sectors', code: '4', label: 'TEMPORARIOS' }, { kind: 'sectors', code: '9', label: 'SIN PERSONAL' }, { kind: 'agreements', code: '1', label: 'ADMINISTRATIVO' },
];
const row = (legajo, sector, status = 'active') => ({ legajo, sector, status });
const contract = (n, sector, status = 'active') => ({...row(String(n), sector, status), contractId:'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),name:'Persona sintética '+n});

test('a real missing repartición stays outside the exact selectable contracts without inventing a sector', () => {
  const rows=[contract(10,'ADMINISTRATIVO'),contract(11,'TEMPORARIOS'),contract(12,null),contract(13,'ADMINISTRATIVO','inactive')],before=structuredClone(rows);
  const plan=ownRunDepartmentsForAll(rows,catalog);
  assert.deepEqual(plan.codes,['1','4']);assert.equal(plan.covered,2);assert.equal(plan.usable,true);
  assert.deepEqual(plan.contracts,rows.slice(0,2).map(({contractId,legajo,name})=>({contractId,legajo,name})));
  assert.deepEqual(plan.unsectored,['12']);assert.deepEqual(plan.unmatched,[]);assert.deepEqual(rows,before);
  const empty=ownRunDepartmentsForAll([rows[2]],catalog);
  assert.equal(empty.usable,false);assert.equal(empty.covered,0);assert.deepEqual(empty.contracts,[]);assert.deepEqual(empty.codes,[]);assert.deepEqual(empty.unsectored,['12']);
});

test('picks only the reparticiones with active people and lists the legajos left out', () => {
  const plan = ownRunDepartmentsForAll([row('10', 'ADMINISTRATIVO'), row('11', ' administrativo '), row('12', 'TEMPORARIOS'), row('13', 'HS. CATEDRAS CULTURA', 'inactive'), row('869', null), row('792', ''), row('793', '  ')], catalog);
  assert.deepEqual(plan.codes, ['1', '4']);
  assert.equal(plan.covered, 3);
  assert.deepEqual(plan.unsectored, ['792', '793', '869']);
  assert.match(ownRunUnsectoredText(plan), /^Los legajos 792, 793, 869 están activos pero no tienen repartición: con «Todos los legajos propios» el motor rechaza la corrida entera\. Calculá las 2 reparticiones con personal activo \(3 legajos\) y, en paralelo, cargá su repartición .*registrá su baja/);
});

test('names outside the catalog are reported; nothing to say when every active legajo has a repartición', () => {
  const unknown = ownRunDepartmentsForAll([row('10', 'ADMINISTRATIVO'), row('11', 'OBRAS NUEVAS'), row('869', null)], catalog);
  assert.deepEqual(unknown.unmatched, ['OBRAS NUEVAS']);
  assert.match(ownRunUnsectoredText(unknown), /^El legajo 869 está activo pero no tiene repartición: con «Todos los legajos propios» el motor rechaza la corrida entera\. Cargá su repartición/);
  assert.equal(ownRunUnsectoredText(ownRunDepartmentsForAll([row('10', 'ADMINISTRATIVO')], catalog)), '');
});

test('Calcular releases a rejected attempt only after the same key is verified as not registered', () => {
  const panel = fs.readFileSync('assets/own-payroll-run-panel.js', 'utf8');
  assert.match(panel, /if\(error\.status!==422\|\|!valid\(\)\|\|!can\(OWN_RUN_NOMINAL\)\)throw error;/);
  assert.match(panel, /resource=attempt&key='\+encodeURIComponent\(rejected\.key\)/);
  assert.match(panel, /if\(registered\)\{[^\n]*showCapture\(registered\);[^\n]*return;\}\s*if\(!missing\|\|attempt!==rejected\)throw error;\s*attempt=null;/);
  assert.match(panel, /data-own-unsectored-all/);
  assert.match(panel, /\$\('kind'\)\.value='departments';renderKind\(\);/);
  assert.match(fs.readFileSync('scripts/build-friendly.mjs', 'utf8'), /'assets\/own-run-departments\.js'/);
});
