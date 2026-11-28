// Panel wording for «Corregir alta histórica» and its wiring in the ficha. The full journey runs in
// scripts/verify-native-employment-void-browser.mjs with Root's synthetic fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {voidPendingText, voidDependencyLabel, VOID_DEFAULT_REASON} from '../assets/native-employment-void.js';

const op = (kind, n) => ({kind, id: '00000000-0000-4000-8000-' + String(n).padStart(12, '0'), version: 'a'.repeat(64)});

test('pending bajas and encuadre changes are explained in business words, singular and plural', () => {
  assert.equal(voidPendingText([op('lifecycle', 1)]), '1 baja pendiente de revisión: si se aprueba esta corrección ya no se podrá aprobar; queda en el historial y se puede rechazar.');
  assert.equal(voidPendingText([op('lifecycle', 1), op('lifecycle', 2)]), '2 bajas pendientes de revisión: si se aprueba esta corrección ya no se podrán aprobar; quedan en el historial y se pueden rechazar.');
  assert.equal(voidPendingText([op('change', 3)]), '1 cambio de encuadre pendiente: hay que resolverlo antes de corregir el alta.');
  assert.equal(voidPendingText([]), '');
});

test('dependencies have readable labels and unknown codes are never hidden', () => {
  assert.equal(voidDependencyLabel('own_payroll_run_capture'), 'está incluido en un cálculo propio');
  assert.match(voidDependencyLabel('something_new'), /something new/);
});

test('the agreed reason, no exit date and the ficha wiring', () => {
  assert.equal(VOID_DEFAULT_REASON, 'Legajo histórico sin relación laboral vigente, retirado del padrón activo por decisión del propietario.');
  const panel = fs.readFileSync(new URL('../assets/native-employment-void.js', import.meta.url), 'utf8');
  assert.doesNotMatch(panel, /endDate:\s*['"]\d/, 'the panel never sends or invents an exit date');
  assert.match(panel, /acknowledgement:VOID_ACKNOWLEDGEMENT/);
  const html = fs.readFileSync(new URL('../internal-dashboard.html', import.meta.url), 'utf8');
  assert.match(html, /import\('\.\/assets\/native-employment-void\.js'\)\.then\(function\(module\)\{if\(!voidHost\.isConnected\|\|!els\.employeeDialog\.open\)return;module\.mountNativeEmploymentVoid\(voidHost,/);
  const build = fs.readFileSync(new URL('../scripts/build-friendly.mjs', import.meta.url), 'utf8');
  assert.match(build, /'assets\/native-employment-void\.js',\n  'assets\/native-employment-void-model\.js',/);
});
