// Parámetros stays short: the 88/90 helper is folded unless an attempt or a selected change needs it, and the master
// history shows the versions waiting for review first with the rest one click away.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const params = fs.readFileSync(new URL('../src/islands/PayrollParameters.jsx', import.meta.url), 'utf8');
const master = fs.readFileSync(new URL('../src/islands/NativeSalaryCatalog.jsx', import.meta.url), 'utf8');

test('the 88/90 helper is folded and reopens itself for a pending attempt or a selected change', () => {
  assert.match(params, /<details className="pp-fold" open=\{foldOpen \|\| !!pending \|\| !!selected\} onToggle=\{e => setFoldOpen\(e\.currentTarget\.open\)\}><summary>Actualizar auxiliares 88 y 90 desde la escala aprobada<\/summary>/);
  const fold = params.indexOf('className="pp-fold"'), hero = params.indexOf('<header className="pp-hero">'), end = params.indexOf('</details>\n    <PayrollCatalog');
  assert.ok(fold > 0 && fold < hero && hero < end, 'hero, status, attempt and grid live inside the fold');
});

test('master history: waiting versions first, the rest folded, every entry still a button', () => {
  assert.match(master, /const waiting=boot\.proposals\.filter\(p=>p\.status==='pending'&&!staleBase\(p\)\),rest=boot\.proposals\.filter\(p=>!waiting\.includes\(p\)\)/);
  assert.match(master, /<details className="sc-history"><summary>Ver historia completa \(\{rest\.length\}\)<\/summary>/);
  assert.match(master, /<p>No hay versiones esperando revisión\.<\/p>/);
  assert.equal((master.match(/data-salary-proposal-id=\{p\.id\}/g) || []).length, 1, 'one item renderer for both lists');
});

test('the bulk tool loads with the draft, outside the initial budget', () => {
  assert.doesNotMatch(master, /import NativeSalaryBulk from/);
  assert.match(master, /await import\('\.\/NativeSalaryBulk\.jsx'\)/);
});
