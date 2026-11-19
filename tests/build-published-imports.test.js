// El armado publica una lista explícita de archivos. Si un módulo publicado importa otro que no está en esa lista, ninguna
// prueba de Node lo nota (leen de `assets/`), pero en el navegador es un 404 y la pantalla entera no carga. Esta prueba recorre
// las importaciones de todo lo publicado y exige que cada módulo alcanzado esté nombrado en algún paso del armado.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const build = fs.readFileSync(path.join(root, 'scripts/build-friendly.mjs'), 'utf8');
const list = name => { const start = build.indexOf('const ' + name + ' = ['), end = build.indexOf('\n];', start); assert.ok(start >= 0 && end > start, name); return [...build.slice(start, end).matchAll(/'([^']+)'/g)].map(m => m[1]); };
const published = new Set([...list('shellFiles'), ...list('pwaFiles')]);
// Otros pasos del armado publican sus propios archivos (relojes, parámetros, islas): alcanza con que los nombren.
const steps = fs.readdirSync(path.join(root, 'scripts')).filter(f => /^build-.*\.mjs$/.test(f)).map(f => fs.readFileSync(path.join(root, 'scripts', f), 'utf8')).join('\n');
const pattern = /(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]|import\s*['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)|new URL\(\s*['"](\.[^'"]+\.(?:js|css))['"]\s*,\s*import\.meta\.url\s*\)/g;
const imports = file => [...fs.readFileSync(path.join(root, file), 'utf8').matchAll(pattern)].map(m => path.posix.normalize(path.posix.join(path.posix.dirname(file), (m[1] ?? m[2] ?? m[3] ?? m[4]).split('?')[0])));

function unpublished() {
  const missing = new Map(), reached = new Set(), queue = [...published].filter(f => /\.m?js$/.test(f) && fs.existsSync(path.join(root, f)));
  for (const f of queue) reached.add(f);
  while (queue.length) {
    const file = queue.shift();
    for (const target of imports(file)) {
      if (!fs.existsSync(path.join(root, target))) continue; // lo genera el armado (islas, gráficos)
      if (!published.has(target) && !steps.includes(path.posix.basename(target))) missing.set(target, [...(missing.get(target) ?? []), file]);
      if (!reached.has(target) && /\.m?js$/.test(target)) { reached.add(target); queue.push(target); }
    }
  }
  return { missing, reached };
}

test('cada módulo que importa un archivo publicado también se publica', () => {
  const { missing, reached } = unpublished();
  assert.deepEqual([...missing].map(([target, from]) => target + ' ← ' + from[0]).sort(), [], 'agregalo a shellFiles en scripts/build-friendly.mjs');
  assert.ok(reached.size > 400, 'el recorrido alcanza el producto entero');
});

test('el motor repartido y los lectores de total oficial llegan al navegador', () => {
  const { reached } = unpublished();
  for (const name of ['own-payroll-expression.js', 'own-payroll-special-methods.js', 'own-payroll-quantity.js', 'own-payroll-quantity-program.js', 'own-payroll-family-facts.js', 'own-payroll-family-tariffs.js', 'own-payroll-official-program.js', 'own-payroll-official-totals.js', 'own-payroll-row-emission.js', 'own-payroll-row-emission-program.js', 'own-payroll-run-reader.js', 'own-payroll-historical-result-model.js', 'own-payroll-official-snapshot-model.js', 'own-payroll-official-receipt-model.js', 'own-payroll-statement-evidence-model.js']) {
    assert.ok(published.has('assets/' + name), name + ' está en la lista del armado');
    assert.ok(reached.has('assets/' + name), name + ' se alcanza desde una pantalla publicada');
  }
});

test('la lista del armado no repite archivos ni nombra uno que no existe', () => {
  const files = list('shellFiles');
  assert.deepEqual(files.filter((f, i) => files.indexOf(f) !== i), []);
  assert.deepEqual(files.filter(f => !fs.existsSync(path.join(root, f))), []);
});
