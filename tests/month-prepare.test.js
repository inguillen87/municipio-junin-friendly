import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {previousMonth,nextMonth} from '../assets/month-prepare.js';

test('meses vecinos cruzan el año', () => {
  assert.equal(previousMonth('2027-01'), '2026-12');
  assert.equal(nextMonth('2026-12'), '2027-01');
  assert.equal(previousMonth('2026-11'), '2026-10');
});

test('preparar el mes sólo propone: nunca aprueba ni decide', () => {
  const src = readFileSync('assets/month-prepare.js', 'utf8');
  assert.doesNotMatch(src, /'approve'|decide[A-Z]/);
  assert.match(src, /idempotency-key/);
  for (const url of ['own-contract-salary-conditions', 'own-contract-salary-conditions-native', 'own-contract-family-payroll-facts-selection', 'own-agreement-working-time', 'own-salary-seniority', 'own-contract-working-time'])
    assert.match(src, new RegExp("/api/internal-" + url + "['?]"));
});

test('el botón se monta en el resumen de liquidaciones junto a Aprobar todo', () => {
  const nav = readFileSync('assets/payroll-navigation.js', 'utf8');
  assert.match(nav, /mountMonthPrepare\(prep\)/);
  assert.match(readFileSync('scripts/build-friendly.mjs', 'utf8'), /'assets\/month-prepare\.js'/);
});

test('el tablero del mes sólo lee y se muestra antes de Aprobar todo', () => {
  const src = readFileSync('assets/month-prepare.js', 'utf8');
  const board = src.slice(src.indexOf('export async function monthStatus'));
  assert.doesNotMatch(board.slice(0, board.indexOf('export function mountMonthStatus')), /propose\(|method:'POST'/);
  assert.match(readFileSync('assets/payroll-navigation.js', 'utf8'), /quick\.before\(stat\);mountMonthStatus\(stat\)/);
});
