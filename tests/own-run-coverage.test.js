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
  // September's rules are not October's inventory: nothing is counted as «missing» from them.
  assert.deepEqual(r.master.missingDefinitions, []);
  assert.equal(ownRunReadinessTitle(r), 'Octubre 2026 todavía no se puede calcular');
  const [master, program, approval, calc] = ownRunReadinessSteps(r);
  assert.equal(master.state, 'todo');
  assert.equal(master.text, 'Tiene valores vigentes para 1 de 2 convenios del alcance.');
  assert.equal(master.href, '/nomina#parametros');
  assert.equal(program.text, 'Ningún convenio del alcance tiene reglas vigentes. El programa aprobado (revisión 1) tiene reglas de convenio 1 para septiembre 2026.');
  assert.equal(approval.state, 'todo');
  assert.match(approval.text, /^Todavía no hay una versión propuesta para octubre 2026\. La prepara una persona con permiso de preparar y la aprueba otra distinta\.$/);
  assert.equal(calc.state, 'todo');
  // A pending proposal with October rules moves approval to «wait», and its rules are the ones checked against the master.
  const pending = { ...data, proposals: [{ status: 'pending', definition: { namespaceVersion: 'own-payroll-namespaces.v2', rules: [
    { code: '1', agreementCode: '1', nature: 'remuneration', validFrom: '2026-10', validUntil: null, liquidationTypes: ['monthly'] },
    { code: '980', agreementCode: '1', nature: 'auxiliary', validFrom: '2026-10', validUntil: null, liquidationTypes: ['monthly'] },
    { code: '5', agreementCode: '9', nature: 'remuneration', validFrom: '2026-10', validUntil: null, liquidationTypes: ['monthly'] },
  ] } }] };
  const pr = ownRunPeriodReadiness(pending, { period: '2026-10', liquidationType: 'monthly', agreements });
  assert.deepEqual(pr.master.missingDefinitions.map(d => d.kind + ':' + d.agreementCode + ':' + d.code), ['concept:1:1', 'auxiliary:1:980']);
  const [pm, , w] = ownRunReadinessSteps(pr);
  assert.equal(pm.text, 'Tiene valores vigentes para 1 de 2 convenios del alcance. Además, las reglas de octubre 2026 usan definiciones sin versión de ese mes: al convenio 1 le faltan 1 concepto y 1 auxiliar.');
  assert.equal(w.state, 'wait'); assert.equal(w.text, '1 versión espera aprobación. La revisa otra persona con permiso de aprobar.');
  // Every convenio has values but October has no rules yet: the master is not called complete nor «missing N».
  const valued = { ...data, salaryCatalog: { items: [...data.salaryCatalog.items, { kind: 'scale', agreementCode: '4', code: '1', categoryCode: '1', validFrom: '2026-10', validUntil: null, active: true }] } };
  const [vm] = ownRunReadinessSteps(ownRunPeriodReadiness(valued, { period: '2026-10', liquidationType: 'monthly', agreements }));
  assert.equal(vm.state, 'info');
  assert.equal(vm.text, 'Tiene valores vigentes para 2 convenios del alcance. Qué conceptos y auxiliares necesita octubre 2026 lo define su programa de cálculo, todavía pendiente: se controla cuando ese programa se proponga.');
  assert.doesNotMatch(vm.text, /faltan/);
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

test('a month before the legajos were registered: the checklist says it before calculating and names the first month that works', async () => {
  const { ownRunRegistrationHistory, ownRunPeriodReadiness, ownRunReadinessSteps, ownRunReadinessTitle, ownRunScopeAgreements: scope } = await import('../assets/own-run-coverage.js');
  // Registered on 16/10/2026 (Argentina). 03:30 UTC on the 17th is still the 16th in Mendoza.
  const reg = [
    { contractId: 'a', status: 'active', agreement: 'PLANTA PERMANENTE', sector: 'ADMINISTRATIVO', registeredAt: '2026-10-16T15:38:00Z' },
    { contractId: 'b', status: 'active', agreement: 'PLANTA PERMANENTE', sector: 'ADMINISTRATIVO', registeredAt: '2026-10-17T02:30:00Z' },
    { contractId: 'c', status: 'active', agreement: 'PERSONAL TEMPORARIO', sector: 'TEMPORARIOS', registeredAt: '2026-08-20T12:00:00Z' },
    { contractId: 'd', status: 'inactive', agreement: 'PLANTA PERMANENTE', sector: 'ADMINISTRATIVO', registeredAt: '2026-10-16T15:38:00Z' },
  ];
  const sepAll = ownRunRegistrationHistory(reg, catalog, { kind: 'all', values: [], period: '2026-09' });
  assert.deepEqual({ ...sepAll }, { period: '2026-09', inScope: 3, after: 2, first: '2026-10-16', last: '2026-10-16', firstPeriod: '2026-10' });
  assert.equal(ownRunRegistrationHistory(reg, catalog, { kind: 'all', period: '2026-10' }).after, 0);
  assert.equal(ownRunRegistrationHistory(reg, catalog, { kind: 'agreements', values: ['4'], period: '2026-09' }).after, 0);
  assert.equal(ownRunRegistrationHistory(reg, catalog, { kind: 'contracts', values: ['b'], period: '2026-09' }).after, 1);
  assert.equal(ownRunRegistrationHistory(reg, catalog, { kind: 'all', period: 'septiembre' }).after, 0);
  // The scope helper keeps its old answer.
  assert.deepEqual(scope(reg, catalog, { kind: 'all' }).agreements.map(a => a.code + ':' + a.people), ['1:2', '4:1']);

  const data = {
    program: { revision: 1, definition: { rules: [{ code: '1', agreementCode: '1', nature: 'remuneration', validFrom: '2026-09', validUntil: '2026-09', liquidationTypes: ['monthly'] }] } },
    salaryCatalog: { items: [{ kind: 'concept', agreementCode: '1', code: '1', validFrom: '2026-09', validUntil: '2026-09', active: true }] },
    proposals: [], permissions: {},
  };
  const agreements = [{ code: '1', label: 'PLANTA PERMANENTE', people: 2 }];
  const history = ownRunRegistrationHistory(reg, catalog, { kind: 'agreements', values: ['1'], period: '2026-09' });
  const r = ownRunPeriodReadiness(data, { period: '2026-09', liquidationType: 'monthly', agreements, history });
  assert.equal(r.rulesReady, true); assert.equal(r.ready, false);
  assert.equal(ownRunReadinessTitle(r), 'Septiembre 2026 todavía no se puede calcular');
  const steps = ownRunReadinessSteps(r);
  assert.deepEqual(steps.map(s => s.key + ':' + s.state), ['master:done', 'program:done', 'approval:done', 'history:todo', 'calculate:todo']);
  assert.equal(steps[3].text, 'Los 2 legajos del alcance se registraron en MuniControl el 16/10/2026, después de septiembre 2026. Para un mes anterior al alta, el sistema no usa el encuadre actual: cada legajo necesita su encuadre de septiembre 2026 aprobado por otra persona. Con el encuadre actual se calcula desde octubre 2026.');
  assert.equal(steps[3].href, '/nomina#encuadre');
  assert.equal(steps[4].text, 'El cálculo de septiembre 2026 se detendría hasta que ese encuadre esté aprobado. Para calcular ya, elegí octubre 2026 o un mes posterior.');
  // A history for another month, or nobody registered later, changes nothing.
  assert.equal(ownRunPeriodReadiness(data, { period: '2026-09', liquidationType: 'monthly', agreements, history: { ...history, period: '2026-08' } }).ready, true);
  assert.equal(ownRunReadinessSteps(ownRunPeriodReadiness(data, { period: '2026-09', liquidationType: 'monthly', agreements })).length, 4);
  // Partial: one of three.
  const part = ownRunReadinessSteps(ownRunPeriodReadiness(data, { period: '2026-09', liquidationType: 'monthly', agreements, history: { period: '2026-09', inScope: 3, after: 1, first: '2026-10-16', last: '2026-10-16', firstPeriod: '2026-10' } }));
  assert.match(part[3].text, /^1 legajo de 3 se registró en MuniControl el 16\/10\/2026/);
});

test('Calcular shows the encuadre step before calculating and offers the first month that works', () => {
  const src = fs.readFileSync(new URL('../assets/own-payroll-run-panel.js', import.meta.url), 'utf8');
  assert.match(src, /ownRunRegistrationHistory\(rosterRows,catalog\.catalog\.items,\{kind,values,period\}\)/);
  assert.match(src, /data-own-coverage-month hidden/);
  assert.match(src, /show=!!c&&\(c\.missing\.length>0\|\|before\)/);
  assert.match(src, /const offer=!attempt&&canSelect\(\)&&!!mode&&!before;/);
  assert.match(src, /OWN_RUN_HISTORY_REQUIRED:'Para este mes no vale el encuadre actual de algún legajo/);
});

test('bajas: a proposal waiting for review is shown and a second one is not offered', () => {
  const src = fs.readFileSync(new URL('../assets/native-employment-lifecycle.js', import.meta.url), 'utf8');
  assert.match(src, /data-nlc-waiting hidden/);
  assert.match(src, /\$\('\[data-nlc-create\]'\)\.hidden=!bootstrap\?\.permissions\.canPropose\|\|!!draft\|\|!!pending\|\|waiting\.length>0;/);
  assert.match(src, /Si alguna está repetida, se aprueba una y las demás se rechazan con el motivo «Duplicada»/);
  assert.match(src, /no hace falta volver a enviarla/);
});

test('ficha: reads wait briefly when another operation holds the legajo and the message says so', () => {
  for (const file of ['../assets/native-employment-change.js', '../assets/native-employment-lifecycle.js']) {
    const src = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(src, /if\(read&&r\.status===409&&\/BUSY\$\/\.test\(String\(d\?\.code\?\?''\)\)&&attempt<3\)/);
    assert.match(src, /Hay otra operación en curso sobre este legajo/);
    assert.match(src, /serverMessage:typeof d\?\.error==='string'\?d\.error:''/);
  }
});

test('readiness names the per-person facts the programme reads, as guidance (not a fake «pending»)', async () => {
  const { ownRunPeriodReadiness, ownRunReadinessSteps } = await import('../assets/own-run-coverage.js');
  const data = { program: { revision: 1, definition: { workingTimeVersion: 'own-contract-working-time.v1', employmentFactsVersion: 'own-salary-seniority.v1', salaryConditionsVersion: 'x', agreementWorkingTimeVersion: 'y', rules: [] } }, salaryCatalog: { items: [] }, proposals: [], permissions: {} };
  const r = ownRunPeriodReadiness(data, { period: '2026-10', liquidationType: 'monthly', agreements: [{ code: '1', label: 'PLANTA', people: 82 }] });
  const facts = ownRunReadinessSteps(r).find(s => s.key === 'facts');
  assert.equal(facts.state, 'info');
  assert.match(facts.text, /^El programa también usa jornada de cada legajo, antigüedad de cada legajo, condiciones salariales y horas mensuales por convenio, aprobados para octubre 2026\./);
  assert.equal(ownRunReadinessSteps(ownRunPeriodReadiness({ ...data, program: { revision: 1, definition: { rules: [] } } }, { period: '2026-10', liquidationType: 'monthly', agreements: [] })).some(s => s.key === 'facts'), false);
});
