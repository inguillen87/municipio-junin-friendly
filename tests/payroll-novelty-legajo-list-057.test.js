import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { analyzeLegajoList, appendLegajoList, filterAgileRows } from '../assets/payroll-novelty-legajo-list.js';
const common = ['44', null, null, '2.50', '', 'standard', 'Acta QA', 'Fundamento sintético', 'NO'];
const parser = ([legajo, ...values], rowOrdinal, periodMonth) => ({ legajo, rowOrdinal, values, periodMonth });
const append = (raw, existingRows = [], extras = {}) => appendLegajoList({ raw, existingRows, commonValues: common, periodMonth: '2026-09-01', parseRow: parser, ...extras });

for (const separator of ['\n', '\r\n', '\r', ' ', '\t', ',', ';', '; \n']) {
  test('separador explícito conserva legajos: ' + JSON.stringify(separator), () => {
    const a = analyzeLegajoList(['1001', '1002', '9007199254740993'].join(separator));
    assert.equal(a.ready, true); assert.deepEqual(a.items, ['1001', '1002', '9007199254740993']);
  });
}
for (const raw of ['', ' \n\t ']) test('vacío no habilita incorporación ' + JSON.stringify(raw), () => {
  const a = analyzeLegajoList(raw); assert.equal(a.ready, false); assert.equal(a.count, 0); assert.deepEqual(a.issues, []);
});
for (const raw of ['0012', '-12', '+12', '1.000', '1001-1005', '1e3', '=1001', '1001\u0000', 'legajo', 'Persona QA', '123456789012345678901', '１２']) {
  test('no corrige ni interpreta entrada inválida ' + JSON.stringify(raw), () => {
    const a = analyzeLegajoList(raw); assert.equal(a.ready, false); assert.ok(a.issues.length); assert.throws(() => append(raw));
  });
}
test('duplicados propios y contra lote se explican juntos sin quitar ninguno', () => {
  const a = analyzeLegajoList('1001;1002;1002;xxx;1003', ['1001']);
  assert.equal(a.count, 5); assert.deepEqual(a.issues.map(i => i.position), [1, 3, 4]); assert.equal(a.ready, false);
  assert.match(a.issues[1].message, /posición 2/); assert.deepEqual(a.items, ['1001','1002','1002','xxx','1003']);
});
test('máximo exacto de 500; nunca acepta 501 ni recorta', () => {
  const rows = Array.from({length:500}, (_,i) => String(i + 1));
  assert.equal(analyzeLegajoList(rows.join('\n')).ready, true);
  assert.equal(analyzeLegajoList([...rows,'501'].join('\n')).ready, false);
  assert.equal(append(rows.join('\n')).length, 500);
});
test('respeta lugares restantes y límite menor informado por servidor', () => {
  assert.equal(analyzeLegajoList('2 3', ['1'], 3).ready, true);
  const a = analyzeLegajoList('2 3 4', ['1'], 3); assert.equal(a.ready, false);
  assert.equal(analyzeLegajoList('2 3', ['1','4'], 3).ready, false);
});
test('la lista no puede exceder el presupuesto de caracteres', () => {
  assert.equal(analyzeLegajoList(' '.repeat(12001)).ready, false);
  assert.ok(analyzeLegajoList('1'.repeat(12001)).issues.length);
});
for (const maximum of [0, 501, 2.5, '500', null]) test('rechaza límite inválido ' + maximum, () => assert.throws(() => analyzeLegajoList('1', [], maximum)));
test('conserva la plantilla y cada legajo sin Number, redondeos ni coerción', () => {
  const before = JSON.stringify(common), rows = append('9007199254740993\n12345678901234567890');
  assert.equal(rows[0].legajo, '9007199254740993'); assert.equal(rows[1].legajo, '12345678901234567890');
  assert.deepEqual(rows[0].values, common); assert.equal(JSON.stringify(common), before);
  assert.deepEqual(rows.map(r => r.rowOrdinal), [1,2]);
});
test('incorporación atómica aunque falle la última validación de fila', () => {
  const existing = [{legajo:'1',rowOrdinal:1}], before = JSON.stringify(existing);
  assert.throws(() => append('2;3', existing, { parseRow: (v, ordinal) => { if (ordinal === 3) throw Error('Rechazada'); return {legajo:v[0],rowOrdinal:ordinal}; }}));
  assert.equal(JSON.stringify(existing), before); assert.equal(existing.length, 1);
});
test('ningún parser se invoca cuando hay duplicados', () => {
  let count=0; assert.throws(() => append('1;1', [], {parseRow:()=>{count++;}})); assert.equal(count, 0);
});
test('adición devuelve nueva lista, renumera agregado, no modifica filas existentes', () => {
  const existing = [Object.freeze({legajo:'1', rowOrdinal:1})]; Object.freeze(existing);
  const result=append('2\n3',existing); assert.equal(result.length,3); assert.equal(existing.length,1);
  assert.deepEqual(result.map(r=>r.rowOrdinal),[1,2,3]);
});
test('filtrar conserva índices originales y no altera alcance de guardado', () => {
  const rows=append('1001 2002 3003'); const before=JSON.stringify(rows);
  const view=filterAgileRows(rows,'2002'); assert.deepEqual(view.map(r=>r.index),[1]);
  assert.equal(view[0].row.legajo,'2002'); assert.equal(filterAgileRows(rows,'sin-coincidencia').length,0);
  assert.equal(JSON.stringify(rows),before);
});
test('límite, fuente inválida y plantilla incompleta se rechazan', () => {
  assert.throws(()=>analyzeLegajoList(null)); assert.throws(()=>analyzeLegajoList('1',[12]));
  assert.throws(()=>append('1',[],{commonValues:[]})); assert.throws(()=>filterAgileRows([], 'x'.repeat(21)));
});
test('helpers no consultan redes, no guardan datos y no interpolan HTML', () => {
  const source=fs.readFileSync('assets/payroll-novelty-legajo-list.js','utf8');
  assert.doesNotMatch(source,/fetch\(|localStorage|sessionStorage|indexedDB|innerHTML|eval\(/);
});
test('integración mantiene contrato bulk, revisión, plantilla bloqueada y campos pendientes explícitos', () => {
  const s=fs.readFileSync('assets/payroll-novelty-workbench.js','utf8');
  const mapping = s.match(/const sourceMode = ([^\n]+);/);
  assert.ok(mapping);
  for (const [entryMode,expected] of [['agile','bulk'],['sheet','bulk'],['bulk','bulk'],['individual','individual']]) assert.equal(vm.runInNewContext(mapping[1],{entryMode}),expected);
  assert.match(s,/appendLegajoList/); assert.match(s,/legajos escritos que todavía no se agregaron/);
  assert.match(s,/busyEntryFields/); assert.match(s,/hasCapability\('payroll.novelty.prepare'\)/);
  assert.match(s,/duplicateCheck\(nextRows\)/); assert.match(s,/clearAgileInput\(\)/);
  assert.doesNotMatch(s,/localStorage|indexedDB|innerHTML/);
});
test('publicación y privacidad incluyen los nuevos recursos sin precache nominal', () => {
  const html=fs.readFileSync('novedades-nomina.html','utf8'), build=fs.readFileSync('scripts/build-friendly.mjs','utf8'), worker=fs.readFileSync('sw.js','utf8');
  assert.match(html,/id="agileLegajos"/); assert.match(html,/aria-describedby="agileLegajosHelp agileListStatus"/);
  assert.match(html,/data-review-only="true"/); assert.match(html,/No pegues DNI/);
  for(const path of ['assets/payroll-novelty-legajo-list.js','assets/payroll-novelty-legajo-list.css']) {assert.ok(build.includes(path));assert.ok(worker.includes('/'+path));}
  assert.doesNotMatch(build.match(/const publicCacheInputs = \[([\s\S]*?)\n\];/)[1], /novelty/);
});
