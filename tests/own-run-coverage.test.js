import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ownRunScopeAgreements, ownRunProgramCoverage, ownRunCoverageText } from '../assets/own-run-coverage.js';

const catalog = [
  { kind: 'agreements', code: '1', label: 'PLANTA PERMANENTE' }, { kind: 'agreements', code: '6', label: 'PERSONAL INTERINO' }, { kind: 'agreements', code: '4', label: 'PERSONAL TEMPORARIO' },
  { kind: 'sectors', code: '1', label: 'ADMINISTRATIVO' }, { kind: 'sectors', code: '4', label: 'TEMPORARIOS' },
];
const rows = [
  { contractId: 'a', status: 'active', agreement: 'PLANTA PERMANENTE', sector: 'ADMINISTRATIVO' },
  { contractId: 'b', status: 'active', agreement: 'Personal interino', sector: 'ADMINISTRATIVO' },
  { contractId: 'c', status: 'active', agreement: 'PERSONAL TEMPORARIO', sector: 'TEMPORARIOS' },
  { contractId: 'd', status: 'inactive', agreement: 'PERSONAL TEMPORARIO', sector: 'TEMPORARIOS' },
];
const program = { rules: [
  { code: '1', agreementCode: '1', nature: 'remuneration', validFrom: '2026-09', validUntil: '2026-09', liquidationTypes: ['monthly'] },
  { code: '700', agreementCode: '1', nature: 'deduction', validFrom: '2026-09', validUntil: null, liquidationTypes: ['monthly'] },
  { code: '1', agreementCode: '6', nature: 'remuneration', validFrom: '2026-01', validUntil: null, liquidationTypes: ['monthly', 'sac'] },
] };

test('people per convenio follow the scope on screen', () => {
  assert.deepEqual(ownRunScopeAgreements(rows, catalog).agreements.map(a => [a.code, a.people]), [['1', 1], ['4', 1], ['6', 1]]);
  assert.deepEqual(ownRunScopeAgreements(rows, catalog, { kind: 'departments', values: ['1'] }).agreements.map(a => a.code), ['1', '6']);
  assert.deepEqual(ownRunScopeAgreements(rows, catalog, { kind: 'agreements', values: ['4'] }).agreements.map(a => a.code), ['4']);
  assert.deepEqual(ownRunScopeAgreements(rows, catalog, { kind: 'contracts', values: ['c'] }).agreements.map(a => a.code), ['4']);
});

test('only remuneration rules in force for the period and type count; the text names month, convenios and today\'s cover', () => {
  const agreements = ownRunScopeAgreements(rows, catalog).agreements;
  const oct = ownRunProgramCoverage(program, { period: '2026-10', liquidationType: 'monthly', agreements });
  assert.deepEqual(oct.covered.map(a => a.code), ['6']);
  assert.deepEqual(oct.missing.map(a => [a.code, a.validity]), [['1', ['2026-09']], ['4', []]]);
  assert.equal(oct.complete, false); assert.equal(oct.missingPeople, 2);
  assert.match(ownRunCoverageText(oct), /^El programa de liquidación no tiene reglas de haberes para octubre 2026 en 2 convenios del alcance \(2 personas\)\. Hoy el programa aprobado tiene reglas de haberes para convenio 1 \(2026-09\), convenio 6 \(2026-01…sin fin\)\./);
  const sep = ownRunProgramCoverage(program, { period: '2026-09', liquidationType: 'monthly', agreements: agreements.filter(a => a.code !== '4') });
  assert.equal(sep.complete, true); assert.equal(ownRunCoverageText(sep), '');
  assert.equal(ownRunProgramCoverage(program, { period: '2026-10', liquidationType: 'sac', agreements: agreements.filter(a => a.code === '6') }).complete, true);
});

test('Calcular blocks a calculation the programme cannot complete and stops offering a futile retry', () => {
  const panel = fs.readFileSync('assets/own-payroll-run-panel.js', 'utf8');
  assert.match(panel, /data-own-coverage hidden/);
  assert.match(panel, /if\(!attempt&&coverageBlocks\(\)\|\|attempt&&computeBlocked&&!current\?\.saved\)\$\('send'\)\.disabled=true;/);
  assert.match(panel, /OWN_RUN_PAY_RULE_MISSING:'El programa de liquidación no tiene reglas de haberes vigentes/);
  assert.match(panel, /Captura sin resultado: el programa no cubre todo su alcance/);
  assert.match(fs.readFileSync('scripts/build-friendly.mjs', 'utf8'), /'assets\/own-run-coverage\.js'/);
});
