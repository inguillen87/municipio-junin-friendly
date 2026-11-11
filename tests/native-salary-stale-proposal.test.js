// A pending master proposal prepared on an older catalog version is labelled in the history and cannot be sent to
// approval from the screen (the server rejects it too); rejecting it stays available.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../src/islands/NativeSalaryCatalog.jsx', import.meta.url), 'utf8');

test('stale base is a pending proposal whose baseVersion differs from the catalog in force', () => {
  const body = src.match(/const staleBase=(p=>[^;]+);/)?.[1];
  assert.ok(body, 'staleBase helper is defined');
  const staleBase = new Function('boot', 'return ' + body);
  const boot = { catalog: { version: 'v-now', revision: 5 } };
  assert.equal(staleBase(boot)({ status: 'pending', baseVersion: 'v-old' }), true);
  assert.equal(staleBase(boot)({ status: 'pending', baseVersion: 'v-now' }), false);
  assert.equal(staleBase(boot)({ status: 'approved', baseVersion: 'v-old' }), false);
  assert.equal(staleBase(null)({ status: 'pending', baseVersion: 'v-old' }), false);
  assert.equal(staleBase(boot)(null), false);
});

test('history label, explanation, hidden approval and a guard in ask()', () => {
  assert.match(src, /\{staleBase\(p\)\?' · sobre una versión anterior':''\}/);
  assert.match(src, /<p data-salary-stale-base>Se preparó sobre una versión anterior del maestro; la vigente es la revisión \{boot\.catalog\.revision\}\. No se puede aprobar: rechazala con un motivo o prepará una nueva sobre la versión vigente\.<\/p>/);
  assert.match(src, /\{!staleBase\(selected\)&&<button disabled=\{disabled\} className="sc-primary" onClick=\{\(\)=>ask\('approve',selected\)\}>Revisar aprobación<\/button>\}<button disabled=\{disabled\} onClick=\{\(\)=>ask\('reject',selected\)\}>Revisar rechazo<\/button>/);
  assert.match(src, /if\(command==='approve'&&staleBase\(proposal\)\)throw Error\(/);
});
