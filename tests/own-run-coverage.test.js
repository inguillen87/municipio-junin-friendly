import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ownRunScopeAgreements, ownRunProgramCoverage, ownRunCoverageText, ownRunUnsectoredInAgreements, ownRunCoveredContracts } from '../assets/own-run-coverage.js';

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

test('«Calcular sólo los convenios cubiertos» is offered only when no legajo without repartición falls inside them', () => {
  const withGap = [...rows, { contractId: 'e', legajo: '869', status: 'active', agreement: 'PERSONAL TEMPORARIO', sector: '' }, { contractId: 'f', legajo: '792', status: 'inactive', agreement: 'PLANTA PERMANENTE', sector: null }];
  assert.deepEqual(ownRunUnsectoredInAgreements(withGap, catalog, ['1', '6']), []);
  assert.deepEqual(ownRunUnsectoredInAgreements(withGap, catalog, ['4']), ['869']);
  assert.deepEqual(ownRunUnsectoredInAgreements(withGap, catalog, [4]), ['869']);
  const panel = fs.readFileSync('assets/own-payroll-run-panel.js', 'utf8');
  assert.match(panel, /data-own-coverage-covered hidden>Calcular sólo los convenios cubiertos</);
  assert.match(panel, /\$\('kind'\)\.value='agreements';renderKind\(\);/);
  assert.match(panel, /mode=!c\.covered\.length\?null:!inside\.length\?'agreements':exact\.length>0&&exact\.length<=500\?'contracts':null/);
  assert.match(panel, /\$\('kind'\)\.value='contracts';renderKind\(\);chosen=plan\.contracts\.map/);
  assert.match(panel, /data-own-coverage-note hidden/);
});

test('when a legajo without repartición is inside the covered convenios, the exact legajos with repartición are chosen instead', () => {
  const id = n => n.repeat(8) + '-' + n.repeat(4) + '-' + n.repeat(4) + '-' + n.repeat(4) + '-' + n.repeat(12);
  const roster = [
    { contractId: id('a'), legajo: '12', name: 'Uno', status: 'active', agreement: 'PLANTA PERMANENTE', sector: 'ADMINISTRATIVO' },
    { contractId: id('b'), legajo: '3', name: 'Dos', status: 'active', agreement: 'PLANTA PERMANENTE', sector: 'TEMPORARIOS' },
    { contractId: id('c'), legajo: '792', status: 'active', agreement: 'PLANTA PERMANENTE', sector: '' },
    { contractId: id('d'), legajo: '7', status: 'active', agreement: 'PERSONAL TEMPORARIO', sector: 'TEMPORARIOS' },
    { contractId: id('e'), legajo: '8', status: 'inactive', agreement: 'PLANTA PERMANENTE', sector: 'ADMINISTRATIVO' },
    { contractId: 'not-a-uuid', legajo: '9', status: 'active', agreement: 'PLANTA PERMANENTE', sector: 'ADMINISTRATIVO' },
  ];
  assert.deepEqual(ownRunUnsectoredInAgreements(roster, catalog, ['1']), ['792']);
  assert.deepEqual(ownRunCoveredContracts(roster, catalog, ['1']).map(e => [e.legajo, e.nombre, e.recordOrigin]), [['3', 'Dos', 'MUNICONTROL'], ['12', 'Uno', 'MUNICONTROL']]);
  assert.deepEqual(ownRunCoveredContracts(roster, catalog, ['4']).map(e => e.legajo), ['7']);
});

test('readiness checklist: master in force, rules in force and approval, in plain language', async () => {
  const { ownRunPeriodReadiness, ownRunReadinessSteps, ownRunReadinessTitle } = await import('../assets/own-run-coverage.js');
  const agreements = [{ code: '1', label: 'PLANTA PERMANENTE', people: 81 }, { code: '4', label: 'PERSONAL TEMPORARIO', people: 158 }];
  const data = {
    program: { revision: 1, definition: { namespaceVersion: 'own-payroll-namespaces.v2', rules: [
      { code: '1', agreementCode: '1', nature: 'remuneration', validFrom: '2026-09', validUntil: '2026-09', liquidationTypes: ['monthly'] },
      { code: '700', agreementCode: '1', nature: 'deduction', validFrom: '2026-09', validUntil: '2026-09', liquidationTypes: ['monthly'] },
      { code: '980', agreementCode: '1', nature: 'auxiliary', validFrom: '2026-09', validUntil: '2026-09', liquidationTypes: ['monthly'] },
    ] } },
    salaryCatalog: { items: [
      { kind: 'concept', agreementCode: '1', code: '1', validFrom: '2026-09', validUntil: '2026-09', active: true },
      { kind: 'concept', agreementCode: '1', code: '700', validFrom: '2026-09', validUntil: '2026-09', active: true },
      { kind: 'auxiliary', agreementCode: '1', code: '980', validFrom: '2026-09', validUntil: '2026-09', active: true },
      { kind: 'scale', agreementCode: '1', code: '1', categoryCode: '12', validFrom: '2026-10', validUntil: '2026-10', active: true },
    ] },
    proposals: [], permissions: { canPropose: true, canReview: false },
  };
  const r = ownRunPeriodReadiness(data, { period: '2026-10', liquidationType: 'monthly', agreements });
  assert.equal(r.ready, false);
  assert.deepEqual(r.master.withoutMaster, ['4']);
  assert.deepEqual(r.master.missingDefinitions.map(d => d.kind + ':' + d.code), ['concept:1', 'concept:700', 'auxiliary:980']);
  assert.equal(ownRunReadinessTitle(r), 'Octubre 2026 todavía no se puede calcular');
  const [master, program, approval, calc] = ownRunReadinessSteps(r);
  assert.equal(master.state, 'todo');
  assert.equal(master.text, 'Tiene valores vigentes para 1 de 2 convenios del alcance. Además, al convenio 1 le faltan 2 conceptos y 1 auxiliar con versión de octubre 2026.');
  assert.equal(master.href, '/nomina#parametros');
  assert.equal(program.text, 'Ningún convenio del alcance tiene reglas vigentes. El programa aprobado (revisión 1) tiene reglas de convenio 1 para septiembre 2026.');
  assert.equal(approval.state, 'todo');
  assert.match(approval.text, /^Todavía no hay una versión propuesta para octubre 2026\. La prepara una persona con permiso de preparar y la aprueba otra distinta\.$/);
  assert.equal(calc.state, 'todo');
  // A pending proposal with October rules moves approval to «wait».
  const pending = { ...data, proposals: [{ status: 'pending', definition: { rules: [{ code: '1', agreementCode: '1', nature: 'remuneration', validFrom: '2026-10', validUntil: null, liquidationTypes: ['monthly'] }] } }] };
  const w = ownRunReadinessSteps(ownRunPeriodReadiness(pending, { period: '2026-10', liquidationType: 'monthly', agreements }))[2];
  assert.equal(w.state, 'wait'); assert.equal(w.text, '1 versión espera aprobación. La revisa otra persona con permiso de aprobar.');
  // September, convenio 1 only: everything in force.
  const sep = ownRunPeriodReadiness(data, { period: '2026-09', liquidationType: 'monthly', agreements: agreements.slice(0, 1) });
  assert.equal(sep.ready, true); assert.equal(ownRunReadinessTitle(sep), 'Septiembre 2026: listo para calcular');
  assert.ok(ownRunReadinessSteps(sep).every(s => s.state === 'done'));
  assert.deepEqual(ownRunPeriodReadiness(null, { period: '2026-10', liquidationType: 'monthly', agreements }).master.withoutMaster, ['1', '4']);
});

test('Calcular shows the checklist and keeps the per-convenio bars folded', () => {
  const src = fs.readFileSync(new URL('../assets/own-payroll-run-panel.js', import.meta.url), 'utf8');
  assert.match(src, /data-own-coverage-steps/);
  assert.match(src, /<details class="own-run-coverage-detail"><summary>Ver convenios del alcance<\/summary><ul class="own-run-coverage-list" data-own-coverage-list><\/ul><\/details>/);
  assert.match(src, /programData=program\.data\?\?null/);
  assert.match(src, /ownRunReadinessSteps\(r\)/);
});
