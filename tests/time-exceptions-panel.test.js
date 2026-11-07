import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateExceptionForm } from '../assets/time-exceptions-panel.js';

const base = { legajo: '1234', kind: 'salida_transitoria', weekdays: [1, 2, 3, 4, 5], from: '07:30', to: '08:30',
  validFrom: '2026-11-05', validTo: '', category: 'cuidado_familiar', note: 'Traslado escolar', documentReference: 'Nota 45/2026' };

test('a documented window passes; every missing piece is reported with its field', () => {
  assert.deepEqual(validateExceptionForm(base), []);
  assert.deepEqual(validateExceptionForm({ ...base, kind: 'exento', from: '', to: '' }), []);
  const issues = validateExceptionForm({ ...base, legajo: '0123', weekdays: [], from: '09:00', to: '08:00', validTo: '2026-01-01', category: 'x', documentReference: 'a', note: 'x'.repeat(301) });
  assert.deepEqual(issues.map(([field]) => field), ['legajo', 'weekdays', 'from', 'validTo', 'category', 'note', 'documentReference']);
});

test('panel retries with the same key, never uses blocking dialogs and warns against health details', () => {
  const source = fs.readFileSync('assets/time-exceptions-panel.js', 'utf8');
  assert.match(source, /pending\.signature !== signature/);
  assert.doesNotMatch(source, /window\.(prompt|alert|confirm)\(/);
  assert.match(source, /No escribas diagnósticos ni datos de salud/);
  assert.match(source, /mc:attendance-ready/);
  const page = fs.readFileSync('relojes-marcaciones.html', 'utf8');
  assert.match(page, /<section id="timeExceptions" class="tx" hidden aria-labelledby="txTitle"><\/section>/);
  assert.match(page, /src="assets\/time-exceptions-panel\.js"/);
  const build = fs.readFileSync('scripts/build-friendly.mjs', 'utf8');
  for (const file of ['assets/time-exceptions-panel.js', 'assets/time-exceptions.css', 'assets/attendance-tardiness-model.js']) assert.match(build, new RegExp(`'${file.replace(/[.]/g, '\\.')}'`));
});
