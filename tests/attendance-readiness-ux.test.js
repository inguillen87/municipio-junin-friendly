import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('S006-A publica evidencia agregada real con límites explícitos', () => {
  const html = read('control-horario-readiness.html');
  const evidence = JSON.parse(read('attendance-readiness-evidence.v1.json'));
  const sources = new Map(evidence.sources.map((source) => [source.sourceKey, source]));
  const grh = sources.get('grh_mariadb_backup');
  const points = sources.get('marking_points');
  const organization = sources.get('organization_chart');

  assert.match(html, /Sprint S006-A · evidencia municipal real/);
  assert.match(html, /Descubierto · no homologado/);
  assert.match(html, /19–21\/08\/2026/);
  assert.ok(html.includes(`>${grh.facts.shifts}</strong><p>Registros históricos`));
  assert.ok(html.includes(`>${grh.facts.schedules}</strong><p>Con ${grh.facts.tolerances} tolerancias`));
  assert.ok(html.includes(`>${points.facts.points}</strong><p>Inventario físico`));
  assert.ok(html.includes(`>${organization.facts.uniqueAreas}</strong><p>Agrupadas en ${organization.facts.secretariatLabels} secretarías`));
  assert.match(html, /cobertura principalmente 2000–2012/);
  assert.ok(html.includes(`>${grh.facts.shiftAssignments}</strong><span>Asignaciones turno–legajo`));
  assert.ok(html.includes(`>${grh.facts.expectedWorkdays.toLocaleString('es-AR')}</strong><span>Jornadas esperadas`));
  assert.ok(html.includes(`>${grh.facts.punches}</strong><span>Fichadas`));
  assert.ok(html.includes(`>${grh.facts.holidays} + ${grh.facts.preEvents}</strong><span>Feriados + prenovedades`));
  assert.equal(evidence.contractId, 'junin-attendance-readiness-public.v1');
  assert.equal(evidence.evidenceStatus, 'discovered_not_homologated');
  assert.equal(evidence.sources.length, 4);
  assert.equal((html.match(/<article class="source">/g) || []).length, evidence.sources.length);
  for (const source of evidence.sources) {
    assert.match(source.sha256, /^[A-F0-9]{64}$/);
    assert.ok(html.includes(source.sha256), `falta fingerprint ${source.sourceKey}`);
  }
  assert.equal(points.facts.deviceFamilyBreakdownPublic, false);
  assert.equal(points.facts.extractionModeBreakdownPublic, false);
  assert.match(html, /La huella acredita los bytes revisados; no acredita por sí sola vigencia funcional/);
});

test('S006-A no confunde inventario con operación vigente', () => {
  const html = read('control-horario-readiness.html');

  for (const statement of [
    'no una simulación',
    'presenta como vigentes los turnos históricos',
    'Turnos y reglas vigentes 2026',
    'Conectores de relojes',
    'Cálculo de minutos y excepciones',
    'Impacto en haberes',
    'No es todavía un reloj virtual',
    'WhatsApp será un canal de desafío, nunca la identidad laboral',
  ]) {
    assert.ok(html.includes(statement), `falta el límite: ${statement}`);
  }
  assert.equal((html.match(/>Bloqueado</g) || []).length, 4);
  assert.equal((html.match(/>Verificado</g) || []).length, 2);
});

test('S006-A mantiene privacidad, accesibilidad y navegación pública', () => {
  const html = read('control-horario-readiness.html');
  const modules = read('modulos.html');
  const vercel = JSON.parse(read('vercel.json'));
  const evidence = JSON.parse(read('attendance-readiness-evidence.v1.json'));

  assert.match(html, /lang="es-AR"/);
  assert.match(html, /href="#contenido">Saltar al contenido/);
  assert.match(html, /class="brand"[^>]+aria-label="MuniControl Friendly/);
  assert.match(html, /aria-label="Indicadores principales"/);
  assert.match(html, /href="\/attendance-readiness-evidence\.v1\.json"/);
  assert.match(html, /No publica nombres, documentos, coordenadas ni fichadas individuales/);
  assert.doesNotMatch(html, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  assert.doesNotMatch(html, /https?:\/\//i);
  assert.doesNotMatch(html, /K20|SF300|MB360|7 con extracción|6 por medio removible/);
  assert.equal(evidence.privacy.containsPersonalDataInSources, true);
  assert.equal(evidence.privacy.publicManifestContainsRowValues, false);
  assert.ok(Object.values(evidence.releaseLimits).every((enabled) => enabled === false));
  assert.match(modules, /href="control-horario-readiness\.html">Abrir preparación/);

  assert.equal(vercel.cleanUrls, true);
  const rewrite = vercel.rewrites.find((entry) => entry.source === '/control-horario-readiness');
  assert.equal(rewrite, undefined, 'cleanUrls debe resolver la pantalla sin un rewrite redundante');
  for (const route of ['/control-horario-readiness', '/control-horario-readiness.html']) {
    const header = vercel.headers.find((entry) => entry.source === route);
    assert.match(header?.headers?.[0]?.value || '', /max-age=300/);
  }
});

test('build y PWA incluyen el mismo corte público S006-A', () => {
  const build = read('scripts/build-friendly.mjs');
  const worker = read('sw.js');
  const ignore = read('.vercelignore');

  assert.match(build, /'control-horario-readiness\.html'/);
  assert.match(build, /'attendance-readiness-evidence\.v1\.json'/);
  assert.match(worker, /'\/control-horario-readiness\.html'/);
  assert.match(worker, /'\/attendance-readiness-evidence\.v1\.json'/);
  assert.match(worker, /\['\/control-horario-readiness', '\/control-horario-readiness\.html'\]/);
  assert.match(ignore, /^!control-horario-readiness\.html$/m);
  assert.match(ignore, /^!attendance-readiness-evidence\.v1\.json$/m);
});
