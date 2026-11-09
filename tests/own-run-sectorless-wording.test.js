// Legajos without a repartición are never presented as «pendientes de baja»: a baja needs its own documented labour fact.
// Calcular tells the person that RR. HH. indicates the repartición with the month's documentation.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../assets/own-payroll-run-panel.js', import.meta.url), 'utf8');

test('Calcular never offers a baja for legajos without repartición and points to RR. HH.', () => {
  assert.doesNotMatch(source, /baja/i);
  assert.match(source, /\(RR\. HH\. tiene que indicar su repartición con la documentación del mes\)\. Revisá y marcá la confirmación para calcular\./);
  assert.match(source, /calculá por reparticiones; su repartición la indica RR\. HH\. con la documentación del mes\./);
});
