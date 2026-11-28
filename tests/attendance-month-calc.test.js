import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { monthCalc, monthCalcCsv, staleClocks, weekdaysInMonth } from '../assets/attendance-month-calc-model.js';

const row = (o) => ({ legajo: '10', name: 'Persona A', daysObserved: 10, daysToReview: 0, ordinarySeconds: 10 * 8 * 3600, entries: ['03 07:05:00', '04 07:20:00', '05 06:58:00'], ...o });

test('días hábiles del mes', () => {
  assert.equal(weekdaysInMonth('2026-11'), 21);
  assert.equal(weekdaysInMonth('2027-02'), 20);
});

test('mayor dedicación: excedente sobre la jornada base, proyectado y al 5 % cada 6 h', () => {
  const c = monthCalc([{ site: { key: 'pm-14', label: 'Edificio Nuevo' }, rows: [row()] }], { period: '2026-11', baseHours: 6, workDays: 21 });
  const r = c.rows.at(0);
  assert.equal(r.closedDays, 10); assert.equal(r.hoursPerDay, 8);
  assert.equal(r.projectedExcessHours, 42); // 2 h × 21 días
  assert.equal(r.dedication, 35);            // 42 h → 7 pasos de 6 h → 35 %
  assert.equal(r.daysWithoutMark, 11);
});

test('sin días completos suficientes no propone dedicación', () => {
  const c = monthCalc([{ site: { key: 'pm-14' }, rows: [row({ daysObserved: 6, daysToReview: 3, ordinarySeconds: 3 * 9 * 3600 })] }], { period: '2026-11' });
  assert.equal(c.rows.at(0).dedication, null);
  assert.equal(c.rows.at(0).enough, false);
});

test('une un legajo que marca en dos relojes y separa identidades sin legajo', () => {
  const c = monthCalc([
    { site: { key: 'pm-14', label: 'A' }, rows: [row({ daysObserved: 5, ordinarySeconds: 5 * 7 * 3600 }), { ...row(), legajo: null }] },
    { site: { key: 'pm-10', label: 'B' }, rows: [row({ daysObserved: 5, ordinarySeconds: 5 * 7 * 3600, entries: ['10 07:00:00'] })] },
  ], { period: '2026-11', workDays: 20 });
  assert.equal(c.rows.length, 1); assert.equal(c.unlinked, 1);
  assert.deepEqual(c.rows.at(0).sites, ['A', 'B']); assert.equal(c.rows.at(0).daysObserved, 10);
});

test('planilla protegida contra fórmulas y relojes sin transmitir', () => {
  const c = monthCalc([{ site: { key: 'pm-14' }, rows: [row({ name: '=HYPERLINK("x")' })] }], { period: '2026-11' });
  assert.match(monthCalcCsv(c), /"'=HYPERLINK/);
  const now = Date.parse('2026-11-25T06:00:00Z');
  const s = staleClocks([{ siteKey: 'pm-14', lastCapturedAt: '2026-11-25T05:00:00Z' }, { siteKey: 'pm-10', lastCapturedAt: '2026-11-12T19:00:00Z' }], now);
  assert.equal(s.at(0).site, 'pm-10'); assert.equal(s.at(0).stale, true); assert.equal(s.at(1).stale, false);
});

test('la pantalla sólo lee: no escribe ni liquida', () => {
  const src = readFileSync('assets/attendance-month-calc.js', 'utf8');
  assert.doesNotMatch(src, /method:\s*'POST'|operation:\s*'command'/);
  assert.match(readFileSync('relojes-marcaciones.html', 'utf8'), /assets\/attendance-month-calc\.js/);
});
