import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (file, encoding = 'utf8') => fs.readFileSync(new URL(`../${file}`, import.meta.url), encoding);
const brandFiles = new Map([
  ['assets/brand/municontrol-mark.svg', [0, 0, 256, 256]],
  ['assets/brand/logo-horizontal.svg', [0, 0, 860, 180]],
  ['assets/brand/logo-horizontal-inverse.svg', [0, 0, 860, 180]],
  ['assets/brand/avatar.svg', [0, 0, 512, 512]],
]);

function attribute(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return source.match(new RegExp(`(?:^|\\s)${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'))?.[2];
}

function assertStandaloneSvg(file, expectedViewBox) {
  const svg = read(file).replace(/<!--[\s\S]*?-->/g, '');
  const root = svg.match(/<svg\b([^>]*)>/i)?.[1];
  assert.ok(root, `${file}: debe contener un elemento svg`);
  assert.equal(attribute(root, 'xmlns'), 'http://www.w3.org/2000/svg');
  const viewBox = (attribute(root, 'viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (expectedViewBox) assert.deepEqual(viewBox, expectedViewBox, `${file}: viewBox del formato`);
  else {
    assert.equal(viewBox.length, 4);
    assert.ok(viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0);
  }
  assert.ok(/<title\b[^>]*>\s*[^<\s][^<]*<\/title>/i.test(svg), `${file}: título legible`);
  assert.notEqual(attribute(root, 'aria-hidden'), 'true', `${file}: el SVG independiente no debe ocultarse`);
  const labelledBy = attribute(root, 'aria-labelledby');
  if (labelledBy) {
    const ids = new Set(Array.from(svg.matchAll(/\bid\s*=\s*(["'])(.*?)\1/g), (match) => match[2]));
    assert.ok(labelledBy.trim().split(/\s+/).every((id) => ids.has(id)), `${file}: referencias accesibles existentes`);
  }
  assert.doesNotMatch(svg, /<\s*(?:[\w-]+:)?(?:script|foreignObject|image)\b/i, `${file}: sólo vectores, sin contenido activo ni raster`);
  assert.doesNotMatch(svg, /\s+on[a-z]+\s*=/i, `${file}: sin manejadores de eventos`);
  assert.doesNotMatch(svg, /<!\s*(?:DOCTYPE|ENTITY)\b|<\?xml-stylesheet\b|@import\b/i, `${file}: sin dependencias externas`);
  for (const match of svg.matchAll(/(?:\b(?:xlink:)?href|\bsrc)\s*=\s*(["'])(.*?)\1/gi)) {
    assert.match(match[2], /^#[A-Za-z_][\w.:-]*$/, `${file}: referencias sólo dentro del mismo SVG`);
  }
  for (const match of svg.matchAll(/\burl\(\s*(["']?)(.*?)\1\s*\)/gi)) {
    assert.match(match[2].trim(), /^#[A-Za-z_][\w.:-]*$/, `${file}: recursos CSS sólo internos`);
  }
  assert.match(svg, /<(?:path|rect|circle|ellipse|polygon|polyline|line|use)\b/i, `${file}: debe incluir geometría vectorial`);
}

for (const [file, viewBox] of brandFiles) {
  test(`identidad: ${file} es vectorial, autónomo y accesible`, () => {
    assertStandaloneSvg(file, viewBox);
  });
}

test('identidad: favicon SVG conserva un formato vectorial accesible', () => {
  assertStandaloneSvg('assets/pwa/icon.svg');
});

test('identidad: iconos instalables y de iOS conservan dimensiones reales', () => {
  for (const [file, size] of [
    ['assets/pwa/icon-180.png', 180],
    ['assets/pwa/icon-192.png', 192],
    ['assets/pwa/icon-512.png', 512],
    ['assets/pwa/icon-maskable-512.png', 512],
  ]) {
    const bytes = read(file, null);
    assert.ok(bytes.length > 24, `${file}: PNG no vacío`);
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(bytes.subarray(12, 16).toString('ascii'), 'IHDR');
    assert.equal(bytes.readUInt32BE(16), size, `${file}: ancho`);
    assert.equal(bytes.readUInt32BE(20), size, `${file}: alto`);
  }
  const manifest = JSON.parse(read('manifest.webmanifest'));
  for (const icon of manifest.icons) {
    assert.ok(icon.src.startsWith('/assets/pwa/'), 'manifest usa los iconos propios publicados');
    assert.ok(fs.existsSync(new URL(`..${icon.src}`, import.meta.url)), `${icon.src}: archivo existente`);
  }
  assert.ok(manifest.icons.some((icon) => icon.type === 'image/svg+xml'));
  assert.ok(manifest.icons.some((icon) => (icon.purpose || '').split(/\s+/).includes('maskable')));
});

test('identidad: el build incluye las cuatro variantes SVG del paquete', () => {
  const build = read('scripts/build-friendly.mjs');
  const shellDeclaration = build.match(/\bconst\s+shellFiles\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(shellDeclaration, 'lista explícita de archivos del shell');
  const shellFiles = new Set(Array.from(shellDeclaration[1].matchAll(/(["'])([^"']+)\1/g), (match) => match[2]));
  for (const file of brandFiles.keys()) assert.ok(shellFiles.has(file), `el build debe copiar ${file}`);
});

test('identidad: CSS compartido usa logos horizontales sin perder movimiento reducido', () => {
  const css = read('assets/municontrol-enterprise.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const urls = Array.from(css.matchAll(/\burl\(\s*(["']?)(.*?)\1\s*\)/g), (match) => match[2]);
  assert.ok(urls.some((url) => /(?:^|\/)logo-horizontal\.svg(?:[?#]|$)/.test(url)), 'variante sobre fondo claro');
  assert.ok(urls.some((url) => /(?:^|\/)logo-horizontal-inverse\.svg(?:[?#]|$)/.test(url)), 'variante sobre fondo oscuro');
  const brandRules = Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g));
  for (const target of [/\.brand-name\b/, /\.brand\s+strong\b/]) {
    assert.ok(brandRules.some((rule) => target.test(rule[1]) && /\bbackground(?:-image)?\s*:/i.test(rule[2])), `la marca textual tiene reemplazo visual: ${target}`);
  }
  assert.match(css, /@media\s*\([^)]*prefers-reduced-motion\s*:\s*reduce[^)]*\)/i);
  const reduced = css.slice(css.search(/@media\s*\([^)]*prefers-reduced-motion\s*:\s*reduce/i));
  assert.match(reduced, /\b(?:animation(?:-duration)?|transition(?:-duration)?)\s*:/i, 'se conserva la reducción de movimiento');
});

test('identidad: URLs estables de iconos revalidan después de una hora', () => {
  const config = JSON.parse(read('vercel.json'));
  const rules = config.headers.filter((rule) => rule.source.includes('/assets/pwa/'));
  assert.ok(rules.length, 'regla de caché explícita para iconos PWA');
  const cacheHeaders = rules.flatMap((rule) => rule.headers).filter((header) => header.key.toLowerCase() === 'cache-control');
  assert.ok(cacheHeaders.length);
  for (const header of cacheHeaders) {
    const directives = new Set(header.value.toLowerCase().split(',').map((value) => value.trim()));
    assert.ok(directives.has('public'));
    assert.ok(directives.has('max-age=3600'));
    assert.ok(directives.has('must-revalidate'));
    assert.ok(!directives.has('immutable'), 'los nombres estables no deben conservar una marca obsoleta un año');
  }
});
