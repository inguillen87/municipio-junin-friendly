// When a month's close cannot be verified (503 CONTRACT_INVALID on the close detail), Reportes says so in plain words,
// naming the month and pointing to Cerrar liquidación, instead of the generic «No se verificó el resultado histórico…».
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../assets/own-payroll-report-panel.js', import.meta.url), 'utf8');

test('the month label used in the message is the Spanish month and year', async () => {
  const body = source.match(/function reportMonthLabel\(period\)\{[\s\S]*?\}(?=async function request\()/)?.[0];
  assert.ok(body, 'reportMonthLabel is a module-level helper next to request()');
  const { reportMonthLabel } = await import('data:text/javascript;base64,' + Buffer.from('export ' + body).toString('base64'));
  assert.equal(reportMonthLabel('2026-10'), 'Octubre de 2026');
  assert.equal(reportMonthLabel('nope'), 'nope');
});

test('the close detail keeps status and code, and only 503 CONTRACT_INVALID becomes the blocked-close message', () => {
  // La lectura pasa por el lector compartido de cierres; el estado y el código del rechazo se conservan igual.
  assert.match(source, /throw Object\.assign\(Error\(read\.payload\?\.error\?\?'No se obtuvo el histórico completo\.'\),\{status:read\.status,code:read\.payload\?\.code\}\)/);
  const mapping = source.match(/catch\(e\)\{if\(e\.status===503&&\/CONTRACT_INVALID\/\.test\(e\.code\?\?''\)\)throw Object\.assign\(Error\(`([^`]*)`\),\{status:e\.status,code:e\.code\}\);throw e;\}const d=await verifiedOwnCloseDetail\(raw\);/);
  assert.ok(mapping, 'every other failure is rethrown unchanged');
  assert.match(mapping[1], /^No se pudo verificar el padrón o las fuentes del cierre de \$\{reportMonthLabel\(period\)\}\./);
  assert.match(mapping[1], /revisá Cerrar liquidación\.$/);
});
