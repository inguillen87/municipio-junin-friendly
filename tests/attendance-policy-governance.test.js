import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('S006-C5a publica candidatos trazables sin confundirlos con reglas vigentes', () => {
  const html = read('control-horario-homologacion.html');
  const contract = JSON.parse(read('attendance-policy-candidates.v1.json'));

  assert.equal(contract.contractId, 'junin-attendance-policy-candidates-public.v1');
  assert.equal(contract.contractVersion, '0.2.0');
  assert.equal(contract.publishedAt, '2026-08-21');
  assert.equal(contract.revisedAt, '2026-09-02');
  assert.equal(contract.status, 'draft_not_homologated');
  assert.equal(contract.mode, 'public_safe_read_only_preview');
  assert.equal(contract.authoritative, false);
  assert.deepEqual(contract.commandsAllowedNow, []);
  assert.equal(contract.candidatePolicy.status, 'draft');
  assert.equal(contract.candidatePolicy.approved, false);
  assert.equal(contract.candidatePolicy.active, false);
  assert.deepEqual(contract.candidatePolicy.weeklyPattern.days, ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']);
  assert.equal(contract.candidatePolicy.weeklyPattern.start, '07:00');
  assert.equal(contract.candidatePolicy.weeklyPattern.end, '13:00');
  assert.equal(contract.candidatePolicy.arrivalToleranceMinutes, 5);
  assert.match(html, /Sprint S006-C5a · explicación antes del cálculo/);
  assert.match(html, /Borrador 0\.2 · no homologado/);
  assert.match(html, /Lun–Vie/);
  assert.match(html, /07:00–13:00/);
  assert.match(html, />5 min</);
  assert.match(html, /Activación actual: bloqueada/);
  assert.equal(contract.historicalDataModel.tables, 257);
  assert.equal(contract.historicalDataModel.columns, 2980);
  assert.equal(contract.historicalDataModel.declaredForeignKeys, 342);
  assert.equal(contract.historicalDataModel.integrityObservations.scheduleToleranceOrphans, 0);
  assert.equal(contract.historicalDataModel.integrityObservations.shiftScheduleOrphans, 0);
  assert.equal(contract.historicalDataModel.integrityObservations.punchExpectationHeuristic.authoritative, false);
  assert.equal(contract.historicalDataModel.qualitySignals.employeeRowsWithUnresolvedLegacyShiftCode, 541);
  assert.equal(contract.historicalDataModel.qualitySignals.distinctUnresolvedLegacyShiftCodes, 1);
  assert.match(html, /541 legajos afectados por un código legacy no resuelto/);
  const evidenceByKey = new Map(contract.sourceEvidence.map((source) => [source.sourceKey, source]));
  assert.equal(evidenceByKey.size, contract.sourceEvidence.length);
  for (const sourceKey of ['employee_area_roster', 'marking_points', 'organization_chart']) assert.ok(evidenceByKey.has(sourceKey));
  assert.ok(evidenceByKey.has('accounting_tolerance_reference_image_2026_09_02'));
  const transcriptLocators = evidenceByKey.get('workshop_transcript_2026_08_21').observations.map(({ locator }) => locator);
  assert.ok(transcriptLocators.includes('00:13:37-00:14:19'));
  assert.ok(transcriptLocators.includes('00:31:47-00:32:11'));
  assert.match(html, /Turno → Horario → Tolerancia/);
  assert.match(html, /descubierto ≠ homologado ≠ vigente/);
});

test('S006-C5a deja sin valor normativo toda definición incompleta', () => {
  const html = read('control-horario-homologacion.html');
  const contract = JSON.parse(read('attendance-policy-candidates.v1.json'));

  assert.equal(contract.expectationSnapshots.cutoffDay, null);
  assert.equal(contract.expectationSnapshots.meetingExampleDay25IsNormative, false);
  assert.equal(contract.expectationSnapshots.sourceOfEmploymentTruth, false);
  assert.equal(contract.expectationSnapshots.closedPeriodBehavior, 'requires_authorized_reopening_and_new_audit_event');
  assert.equal(contract.openDecisions.length, 12);
  assert.ok(contract.openDecisions.every(({ status }) => status === 'unresolved'));
  assert.ok(Object.values(contract.releaseLimits).every((enabled) => enabled === false));
  for (const phrase of [
    'El día 25 fue un ejemplo',
    'Horas extra',
    'Presentismo',
    'Nocturnos y fines de semana',
    'Cálculo todavía bloqueado',
    'reemplaza la fuente de verdad del legajo',
    'nunca se modifica en silencio',
  ]) assert.ok(html.includes(phrase), `falta el límite ${phrase}`);
  assert.equal((html.match(/class="state pending"/g) || []).length, 12);
  assert.equal((html.match(/class="state candidate"/g) || []).length, 3);
});

test('S006-C5a exige versiones inmutables, maker-checker y aislamiento por tenant', () => {
  const html = read('control-horario-homologacion.html');
  const contract = JSON.parse(read('attendance-policy-candidates.v1.json'));
  const governance = contract.versionGovernance;

  assert.deepEqual(governance.lifecycle, ['draft', 'submitted', 'approved', 'rejected', 'retired']);
  assert.equal(governance.enforcedNow, false);
  assert.equal(governance.tenantScoped, true);
  assert.equal(governance.immutableAfterApproval, true);
  assert.equal(governance.retroactiveChangesRequireNewVersion, true);
  assert.equal(governance.segregationOfDuties, true);
  assert.equal(governance.minimumDistinctActors, 2);
  assert.deepEqual(governance.workflowRoles, ['rrhh_policy_proposer', 'independent_policy_approver']);
  assert.equal(governance.auditHistoryRequired, true);
  assert.match(html, /Una regla cambia por versión, no en silencio/);
  assert.match(html, /Un actor distinto del proponente decide/);
  assert.match(html, /no convierte a una persona en superusuario de PostgreSQL/);
  assert.match(html, /Junín no comparte reglas/);
  assert.equal(contract.candidateCalendar.status, 'not_created_missing_authoritative_source');
  assert.equal(contract.governanceReadiness.structurallyComplete, false);
});

test('S006-C5a mantiene el contrato público sin PII, secretos ni ubicación exacta', () => {
  const html = read('control-horario-homologacion.html');
  const rawContract = read('attendance-policy-candidates.v1.json');
  const contract = JSON.parse(rawContract);

  assert.equal(contract.privacy.containsPersonalRows, false);
  assert.equal(contract.privacy.containsCredentials, false);
  assert.equal(contract.privacy.containsExactCoordinates, false);
  assert.equal(contract.privacy.containsDeviceConnectionDetails, false);
  assert.doesNotMatch(`${html}\n${rawContract}`, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  assert.doesNotMatch(`${html}\n${rawContract}`, /123456|password|contraseña|latitude|longitude|firmware|protocolo/i);
  assert.doesNotMatch(html, /localStorage|sessionStorage|fetch\(|XMLHttpRequest|method\s*:\s*['"](?:POST|PATCH|PUT|DELETE)/i);
  assert.match(html, /sin publicar filas personales/);
  assert.match(html, /href="\/attendance-policy-candidates\.v1\.json"/);
  assert.match(html, /Padrón · puntos · organigrama/);
  for (const source of contract.sourceEvidence) assert.match(source.sha256, /^[A-F0-9]{64}$/);

  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new vm.Script(scripts[0], { filename: 'control-horario-homologacion.inline.js' }));
});

test('S006-C5a queda navegable, publicable y disponible offline en ambas rutas', () => {
  const html = read('control-horario-homologacion.html');
  const modules = read('modulos.html');
  const readiness = read('control-horario-readiness.html');
  const build = read('scripts/build-friendly.mjs');
  const worker = read('sw.js');
  const ignore = read('.vercelignore');
  const vercel = JSON.parse(read('vercel.json'));

  assert.match(html, /lang="es-AR"/);
  assert.match(html, /href="#contenido">Saltar al contenido/);
  assert.match(html, /id="pending-toggle"[^>]+aria-pressed="false"/);
  assert.match(html, /serviceWorker\.register\('\/sw\.js', \{ scope: '\/' \}\)/);
  assert.match(modules, /href="control-horario-homologacion\.html">Abrir homologación/);
  assert.match(readiness, /href="control-horario-homologacion\.html">Abrir S006-B/);
  assert.match(build, /'control-horario-homologacion\.html'/);
  assert.match(build, /'attendance-policy-candidates\.v1\.json'/);
  assert.match(build, /'assets\/junin-tardiness-policy\.js'/);
  assert.match(worker, /'\/control-horario-homologacion\.html'/);
  assert.match(worker, /'\/attendance-policy-candidates\.v1\.json'/);
  assert.match(worker, /'\/assets\/junin-tardiness-policy\.js'/);
  assert.match(worker, /\['\/control-horario-homologacion', '\/control-horario-homologacion\.html'\]/);
  assert.match(ignore, /^!control-horario-homologacion\.html$/m);
  assert.match(ignore, /^!attendance-policy-candidates\.v1\.json$/m);
  assert.deepEqual(
    vercel.rewrites.find(({ source }) => source === '/control-horario-homologacion'),
    { source: '/control-horario-homologacion', destination: '/control-horario-homologacion.html' },
  );
  for (const route of ['/control-horario-homologacion', '/control-horario-homologacion.html', '/attendance-policy-candidates.v1.json']) {
    const header = vercel.headers.find(({ source }) => source === route);
    assert.match(header?.headers?.[0]?.value || '', /max-age=300/);
  }
});
