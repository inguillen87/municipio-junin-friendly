import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('calidad operativa es interna, trazable y consume exclusivamente DQ-01', () => {
  const html = read('calidad-operativa.html');
  assert.match(html, /login\.html\?next=calidad-operativa\.html/);
  assert.match(html, /\/api\/internal-auth/);
  for (const resource of ['qualityoverview', 'qualityissues', 'importlineage']) {
    assert.match(html, new RegExp(`buildParams\\('${resource}'\\)`), `falta consumir ${resource}`);
  }
  assert.match(html, /cache:\s*'no-store'/);
  assert.match(html, /data-mc-page="quality"/);
  assert.equal((html.match(/assets\/internal-guide\.js/g) || []).length, 1);
  assert.match(html, /0 controles materializados no equivale a calidad perfecta/i);
  assert.match(html, /No informado/);
  assert.match(html, /sin nombres, DNI, CUIL, identificadores personales ni valores observados/i);
  assert.doesNotMatch(html, /qualityScore|healthScore|puntaje de salud\s*[:=]/i);
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(match[1])) new vm.Script(match[2], { filename: 'calidad-operativa.html' });
  }
});

test('calidad operativa no incrusta los conteos del snapshot real', () => {
  const html = read('calidad-operativa.html');
  for (const snapshotValue of ['589', '581', '556', '1699', '157', '493', '96777']) {
    assert.doesNotMatch(html, new RegExp(`>\\s*${snapshotValue}\\s*<`), `el valor ${snapshotValue} debe llegar desde la API`);
  }
  assert.match(html, /Inconsistencias entre la fecha, el mes o el período declarado/);
  assert.match(html, /CUIL inválidos o faltantes según los controles materializados/);
});

test('la nueva sección está publicada, protegida y enlazada por el portal interno', () => {
  const build = read('scripts/build-friendly.mjs');
  const login = read('login.html');
  const worker = read('sw.js');
  const guide = read('assets/internal-guide.js');
  const vercel = JSON.parse(read('vercel.json'));
  const rewrites = new Map(vercel.rewrites.map(({ source, destination }) => [source, destination]));
  const headers = new Map(vercel.headers.map(({ source, headers: values }) => [source, new Map(values.map(({ key, value }) => [key, value]))]));

  assert.match(build, /calidad-operativa\.html/);
  assert.match(login, /calidad-operativa\.html/);
  assert.match(worker, /'\/calidad-operativa'/);
  assert.match(guide, /quality:\s*\{/);
  assert.equal(vercel.cleanUrls, true);
  assert.equal(rewrites.has('/calidad-operativa'), false);
  assert.match(headers.get('/calidad-operativa').get('Cache-Control'), /private, no-store/);
  assert.match(headers.get('/calidad-operativa.html').get('Cache-Control'), /private, no-store/);

  for (const file of [
    'internal-dashboard.html', 'estructura.html', 'integracion-datos.html',
    'nomina-control.html', 'ausentismo-control.html', 'asistente.html', 'centro-ayuda.html',
  ]) {
    assert.match(read(file), /href="calidad-operativa\.html"/, `${file} debe enlazar DQ-01`);
  }
});
