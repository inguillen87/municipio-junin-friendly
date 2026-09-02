import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('S006-C5a presenta un simulador accesible, explicable y sin datos personales', () => {
  const html = read('control-horario-homologacion.html');

  assert.match(html, /id="tardiness-title">Impuntualidad acumulada en el mes/);
  assert.match(html, /id="tardiness-simulator-form"[^>]+novalidate/);
  assert.match(html, /label for="tardiness-month">Mes a evaluar/);
  assert.match(html, /id="tardiness-month"[^>]+type="month"[^>]+required/);
  assert.match(html, /label for="tardiness-entries">Tardanzas diarias/);
  assert.match(html, /id="tardiness-entries"[^>]+aria-describedby="tardiness-entries-help"/);
  assert.match(html, /id="tardiness-error"[^>]+role="alert"[^>]+tabindex="-1"[^>]+hidden/);
  assert.match(html, /id="tardiness-result"[^>]+role="status"[^>]+aria-live="polite"[^>]+tabindex="-1"[^>]+hidden/);
  assert.match(html, /type="module" src="\/assets\/junin-tardiness-policy\.js"/);
  assert.match(html, /No ingreses nombres, legajos ni documentos/);
  assert.match(html, /Efecto operativo: ninguno/);
  assert.match(html, /Nómina no calculada · nómina no enviada · GRH sin cambios/);
  assert.match(html, /Una simulación no es una decisión administrativa/);
});

test('S006-C5a distingue la tolerancia inferida de las cuatro bandas documentadas', () => {
  const html = read('control-horario-homologacion.html');
  const contract = JSON.parse(read('attendance-policy-candidates.v1.json'));
  const keys = [...html.matchAll(/class="candidate-band[^"]*" data-band="([^"]+)"/g)]
    .map((match) => match[1]);
  const candidate = contract.candidateTardinessPolicy;

  assert.deepEqual(
    keys,
    [candidate.candidateTolerance, ...candidate.documentedDiscountBands]
      .map(({ bandKey }) => bandKey),
  );
  assert.equal((html.match(/class="candidate-band inferred-band"/g) || []).length, 1);
  assert.equal((html.match(/class="candidate-band documented-band"/g) || []).length, 4);
  assert.match(html, /Inferencia técnica, no documentada en la captura/);
  assert.match(html, /Cuatro bandas documentadas en la captura/);
  assert.match(html, /La captura informa únicamente las cuatro consecuencias superiores/);
  assert.doesNotMatch(html, /Bandas informadas en la referencia/);
  assert.match(html, /publicada 21\/08\/2026 · revisada 02\/09\/2026/);
  for (const percent of [0, 25, 50, 75, 100]) {
    assert.match(html, new RegExp(`>${percent} % candidato<`));
  }
  assert.equal((html.match(/class="state candidate"/g) || []).length, 3);
  assert.equal((html.match(/class="state pending"/g) || []).length, 12);
});

test('S006-C5a no incorpora red, almacenamiento ni mutaciones operativas', () => {
  const html = read('control-horario-homologacion.html');
  const module = read('assets/junin-tardiness-policy.js');
  const combined = `${html}\n${module}`;

  assert.doesNotMatch(combined, /fetch\(|XMLHttpRequest|WebSocket|EventSource/i);
  assert.doesNotMatch(combined, /localStorage|sessionStorage|indexedDB/i);
  assert.doesNotMatch(combined, /method\s*:\s*['"](?:POST|PATCH|PUT|DELETE)/i);
  assert.doesNotMatch(module, /payrollImpact:\s*Object\.freeze\(\{[^}]*calculated:\s*true/s);
  assert.doesNotMatch(module, /payrollImpact:\s*Object\.freeze\(\{[^}]*posted:\s*true/s);

  const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.equal(inlineScripts.length, 1);
  assert.doesNotThrow(() => new vm.Script(inlineScripts[0], { filename: 'control-horario-homologacion.inline.js' }));
});

test('S006-C5a se incluye en el build y en el caché público versionado', () => {
  const build = read('scripts/build-friendly.mjs');
  const worker = read('sw.js');

  assert.equal((build.match(/'assets\/junin-tardiness-policy\.js'/g) || []).length, 2);
  assert.equal((worker.match(/'\/assets\/junin-tardiness-policy\.js'/g) || []).length, 1);
  assert.match(worker, /const PRECACHE_URLS = Object\.freeze/);
  assert.match(build, /const publicCacheInputs = \[/);
});
