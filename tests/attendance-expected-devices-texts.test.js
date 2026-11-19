// Presentation of the expected-devices panel: civil dates as dd/mm/aaaa, instants in the municipality's zone and
// correct singular/plural. Values sent to and received from the API stay ISO. Synthetic values only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aedDay, aedInstant, aedCount } from '../assets/attendance-expected-devices-panel.js';

test('a civil date reads dd/mm/aaaa and anything else is left untouched', () => {
  assert.equal(aedDay('2026-11-01'), '01/11/2026');
  assert.equal(aedDay('2026-12-31'), '31/12/2026');
  for (const value of [null, undefined, '', '2026-11', '01/11/2026', '2026-11-01T00:00:00Z']) assert.equal(aedDay(value), value);
});

test('an instant reads in America/Argentina/Mendoza, without depending on the browser zone', () => {
  assert.equal(aedInstant('2026-11-16T16:00:00Z'), '16/11/2026 13:00 h');
  assert.equal(aedInstant('2026-11-17T02:30:00Z'), '16/11/2026 23:30 h');
  assert.equal(aedInstant('2026-11-16T16:00:00.123456+00:00'), '16/11/2026 13:00 h');
  for (const value of [null, '', 'no es una fecha']) assert.equal(aedInstant(value), value);
});

test('counts agree in number', () => {
  assert.equal(aedCount(1, 'contrato autorizado', 'contratos autorizados'), '1 contrato autorizado');
  assert.equal(aedCount(0, 'contrato autorizado', 'contratos autorizados'), '0 contratos autorizados');
  assert.equal(aedCount(2, 'dispositivo disponible', 'dispositivos disponibles'), '2 dispositivos disponibles');
});

test('the panel no longer prints raw ISO values or fixed plurals in its texts', () => {
  const source = readFileSync(new URL('../assets/attendance-expected-devices-panel.js', import.meta.url), 'utf8');
  for (const raw of ["' contratos autorizados y '", "' dispositivos disponibles para '", "['Vigencia desde', record.validFrom]",
    "' · ' + event.occurredAt", "'Retirada desde ' + record.retiredEffectiveFrom", "' de ' + listing.total + ' declaraciones.'"]) assert.ok(!source.includes(raw), raw);
});
