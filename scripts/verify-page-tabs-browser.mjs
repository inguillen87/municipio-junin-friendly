// Pestañas declarativas y paginador reales sobre una pantalla sintética: sin API, sin datos municipales.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'verification', 'page-tabs'); fs.mkdirSync(output, {recursive: true});
const origin = 'https://page-tabs.invalid', checks = [], errors = [];
const rows = Array.from({length: 27}, (_, i) => `<tr><td>${i + 1}</td><td>${i === 20 ? 'Licencia por antigüedad' : 'Motivo ' + (i + 1)}</td></tr>`).join('');
const html = `<!doctype html><html lang="es"><meta charset="utf-8"><link rel="stylesheet" href="/assets/section-tabs.css"><script type="module" src="/assets/page-tabs.js"></script>
<style>body{font:16px system-ui;margin:0}main{max-width:1000px;margin:0 auto;padding:20px}section{min-height:300px;border:1px solid #ccd;margin:12px 0;padding:12px}[hidden]{display:none!important}</style>
<body><main id="pantalla" hidden><h1>Pantalla sintética</h1><nav class="indice"><a href="#b">Ir a B</a></nav><input id="buscador" type="search" aria-label="Buscar">
<div data-mc-tabs='[{"id":"uno","label":"Primera","hint":"Resumen","sel":"#a,#a2"},{"id":"dos","label":"Segunda","hint":"Tabla","sel":"#b","hash":"atajo"},{"id":"tres","label":"Tercera","sel":"#c,main > .tardio","on":"qa:mapa"},{"id":"vacia","label":"Sin bloques","sel":"#noexiste"},{"id":"modulo","label":"Módulo aparte","sel":"#modulo"}]' data-mc-tabs-key="mc.sintetica.tab" data-mc-tabs-label="Secciones de prueba" data-mc-tabs-all-when="#buscador" data-mc-tabs-hide="nav.indice"></div>
<section id="a"><span class="section-index">01</span><h2>A</h2><a id="enlace" href="#c">Ver C</a></section><section id="a2"><h2>A2</h2></section>
<section id="b"><h2>B</h2><form id="formulario"><input id="campo" aria-label="Campo"></form><div class="table-wrap"><table><tbody id="filas" data-mc-pager="8" data-mc-pager-noun="motivos">${rows}</tbody></table></div></section>
<div id="modulo"></div><section id="c"><h2>C</h2><div id="tarjetas" data-mc-pager="4" data-mc-pager-search="off"></div></section><p id="pie">Pie siempre visible</p></main></body></html>`;
const browser = await chromium.launch({headless: true});
try {
  const context = await browser.newContext({viewport: {width: 1200, height: 800}, reducedMotion: 'reduce', serviceWorkers: 'block'});
  await context.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.origin !== origin || u.pathname.startsWith('/api/')) return route.abort();
    if (u.pathname === '/') return route.fulfill({status: 200, contentType: 'text/html', body: html});
    if (u.pathname === '/demora') return route.fulfill({status: 200, contentType: 'text/html', body: html.replace('<section id="a">', '<section id="a" hidden>').replace('<section id="a2">', '<section id="a2" hidden>')});
    const file = path.resolve(root, u.pathname.slice(1));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.abort();
    return route.fulfill({status: 200, contentType: path.extname(file) === '.css' ? 'text/css' : 'text/javascript', body: fs.readFileSync(file)});
  });
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  // La impresión real no se abre en la prueba: se registra con qué estado de pestañas la pide la pantalla.
  await page.addInitScript(() => { window.print = () => { window.__printedAll = document.documentElement.classList.contains('mc-tabs-all') && [...document.querySelectorAll('main > section')].every(node => node.getClientRects().length); }; });
  page.on('pageerror', error => errors.push(error.message));
  const visible = () => page.locator('main > section').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length).map(node => node.id || node.className));
  const selected = () => page.locator('[role=tab][aria-selected=true]').getAttribute('data-tab');
  const tab = name => page.getByRole('tab', {name}).click();
  const memory = () => page.evaluate(() => localStorage.getItem('mc.sintetica.tab'));

  await page.goto(origin + '/');
  await page.locator('.mc-section-tabs').waitFor({state: 'attached'});
  await page.evaluate(() => { document.getElementById('pantalla').hidden = false; }); // la pantalla termina de cargar después de montar la barra
  await page.waitForFunction(() => { const ink = document.querySelector('.mc-section-tabs-ink'); return ink.getBoundingClientRect().width > 40; });
  assert.deepEqual(await page.getByRole('tab').evaluateAll(nodes => nodes.filter(node => !node.hidden).map(node => node.dataset.tab)), ['uno', 'dos', 'tres']);
  assert.deepEqual(await visible(), ['a', 'a2']);
  assert.equal(await page.locator('#pie').isVisible(), true);
  assert.equal(await page.locator('nav.indice').isVisible(), false);
  assert.equal(await page.locator('#a .section-index').isVisible(), false);
  assert.equal(await page.getByRole('tablist').count(), 1);
  checks.push('la barra se monta con la pantalla oculta y marca la pestaña al mostrarse; pestaña sin bloques no aparece; índice propio reemplazado');

  await tab(/Segunda/); assert.deepEqual(await visible(), ['b']); assert.equal(await memory(), 'dos');
  await page.keyboard.press('ArrowRight'); assert.equal(await selected(), 'tres'); await page.keyboard.press('Home'); assert.equal(await selected(), 'uno');
  await page.locator('#enlace').click(); assert.deepEqual(await visible(), ['c']);
  await page.evaluate(() => { location.hash = '#atajo'; }); await page.waitForFunction(() => document.querySelector('[role=tab][aria-selected=true]').dataset.tab === 'dos');
  await tab(/Primera/);
  // Un módulo que consulta por su cuenta al cargar (envío programático en otra pestaña) no mueve a la persona.
  await page.evaluate(() => { const form = document.getElementById('formulario'); form.addEventListener('submit', event => event.preventDefault()); form.requestSubmit(); });
  assert.equal(await selected(), 'uno'); assert.equal(await memory(), 'uno');
  checks.push('clic, teclado, enlace interno y ancla con alias traen su pestaña; un envío programático en otra pestaña no la cambia');

  await tab(/Primera/);
  await page.evaluate(() => { const late = document.createElement('section'); late.className = 'tardio'; late.id = 'tardio'; late.textContent = 'Gráfico que llega después'; document.getElementById('c').after(late); });
  await page.waitForFunction(() => document.querySelector('.tardio').dataset.mcTab === 'tres' && !document.querySelector('.tardio').getClientRects().length);
  await tab(/Tercera/); assert.deepEqual(await visible(), ['c', 'tardio']);
  await page.evaluate(() => { document.getElementById('c').hidden = true; document.querySelector('.tardio').hidden = true; });
  await page.waitForFunction(() => document.querySelector('[role=tab][data-tab=tres]').hidden);
  assert.notEqual(await selected(), 'tres');
  await page.evaluate(() => { document.getElementById('c').hidden = false; document.querySelector('.tardio').hidden = false; });
  await page.waitForFunction(() => !document.querySelector('[role=tab][data-tab=tres]').hidden);
  // Un contenedor que otro módulo todavía no llenó (sin permiso o sin datos) no ofrece pestaña; aparece cuando se llena.
  assert.equal(await page.locator('[role=tab][data-tab=modulo]').isHidden(), true);
  await page.evaluate(() => { const card = document.createElement('article'); card.textContent = 'Contenido del módulo'; document.getElementById('modulo').append(card); });
  await page.waitForFunction(() => !document.querySelector('[role=tab][data-tab=modulo]').hidden);
  await tab(/Módulo aparte/); assert.equal(await page.locator('#modulo').isVisible(), true);
  await page.evaluate(() => document.getElementById('modulo').replaceChildren());
  await page.waitForFunction(() => document.querySelector('[role=tab][data-tab=modulo]').hidden && document.querySelector('.mc-section-tabs [role=tab][aria-selected=true]').dataset.tab !== 'modulo');
  await tab(/Tercera/);
  checks.push('un bloque que llega después queda en su pestaña; al ocultarse por permisos la pestaña se retira y vuelve; un contenedor vacío no ofrece pestaña');

  await tab(/Segunda/);
  const shown = () => page.locator('#filas tr').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length).length);
  assert.equal(await shown(), 8);
  assert.match(await page.locator('#b .mc-pager-status').innerText(), /Mostrando 1 a 8 de 27 motivos\./);
  await page.getByRole('button', {name: 'Siguiente ›'}).click(); await page.getByRole('button', {name: 'Siguiente ›'}).click(); await page.getByRole('button', {name: 'Siguiente ›'}).click();
  assert.equal(await shown(), 3); assert.equal(await page.getByRole('button', {name: 'Siguiente ›'}).isDisabled(), true);
  assert.match(await page.locator('#b .mc-pager-where').innerText(), /Página 4 de 4/);
  await page.getByRole('searchbox', {name: 'Buscar en esta lista'}).fill('ANTIGUEDAD');
  assert.equal(await shown(), 1); assert.match(await page.locator('#b .mc-pager-status').innerText(), /Mostrando 1 a 1 de 1 motivos encontradas \(27 en total\)\./);
  await page.getByRole('searchbox', {name: 'Buscar en esta lista'}).fill('zzz');
  assert.equal(await shown(), 0); assert.match(await page.locator('#b .mc-pager-status').innerText(), /Ninguna de las 27 motivos coincide/);
  await page.getByRole('searchbox', {name: 'Buscar en esta lista'}).fill('');
  await page.evaluate(() => { document.getElementById('filas').innerHTML = '<tr><td>1</td><td>Única</td></tr>'; });
  await page.waitForFunction(() => document.querySelector('#b .mc-pager-top').hidden && document.querySelector('#b .mc-pager-bottom').hidden);
  await tab(/Tercera/);
  await page.evaluate(() => { const box = document.getElementById('tarjetas'); for (let i = 0; i < 9; i++) { const card = document.createElement('article'); card.textContent = 'Tarjeta ' + i; box.append(card); } });
  await page.waitForFunction(() => [...document.querySelectorAll('#tarjetas article')].filter(node => node.getClientRects().length).length === 4);
  assert.equal(await page.locator('#c .mc-pager-search').isVisible(), false);
  await page.evaluate(() => { document.getElementById('tarjetas').hidden = true; });
  await page.waitForFunction(() => document.querySelector('#c .mc-pager-top').hidden);
  checks.push('paginador: 8 por página, búsqueda sin acentos, cero honesto, listas cortas sin controles, tarjetas tardías y lista oculta');

  await page.locator('#buscador').fill('algo');
  assert.deepEqual(await visible(), ['a', 'a2', 'b', 'c', 'tardio']); assert.equal(await page.locator('.mc-section-tabs').isVisible(), false);
  await page.locator('#buscador').fill('');
  assert.deepEqual(await visible(), ['c', 'tardio']);
  await page.emulateMedia({media: 'print'});
  assert.deepEqual(await visible(), ['a', 'a2', 'b', 'c', 'tardio']); assert.equal(await page.locator('.mc-section-tabs').isVisible(), false); assert.equal(await page.locator('nav.indice').isVisible(), true);
  await page.emulateMedia({media: 'screen'});
  await page.setViewportSize({width: 390, height: 800});
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'sin desborde a 390 px');
  await page.screenshot({path: path.join(output, 'page-tabs-390.png')});
  await page.evaluate(() => window.print());
  await page.waitForFunction(() => window.__printedAll !== undefined);
  assert.equal(await page.evaluate(() => window.__printedAll), true, 'la impresión se abre con todas las secciones ya mostradas');
  await page.waitForFunction(() => !document.documentElement.classList.contains('mc-tabs-all'));
  assert.deepEqual(await visible(), ['c', 'tardio']);
  checks.push('el buscador de la pantalla muestra todas las pestañas; al imprimir sale todo, también cuando la pantalla llama a imprimir; 390 px sin desborde');

  // Sin elección recordada, la primera pestaña es el inicio aunque sus bloques aparezcan después de cargar permisos o datos.
  await page.evaluate(() => localStorage.removeItem('mc.sintetica.tab'));
  await page.setViewportSize({width: 1200, height: 800});
  await page.goto(origin + '/demora'); await page.evaluate(() => { document.getElementById('pantalla').hidden = false; });
  assert.equal(await selected(), 'dos'); assert.equal(await page.locator('[role=tab][data-tab=uno]').isHidden(), true);
  await page.evaluate(() => { document.getElementById('a').hidden = false; });
  await page.waitForFunction(() => document.querySelector('[role=tab][aria-selected=true]').dataset.tab === 'uno');
  assert.equal(await memory(), null);
  let resized = page.evaluate(() => new Promise(resolve => addEventListener('resize', () => resolve(true), {once: true})));
  await page.evaluate(() => document.dispatchEvent(new CustomEvent('qa:mapa')));
  assert.equal(await selected(), 'tres'); assert.equal(await resized, true); assert.equal(await memory(), 'tres');
  checks.push('la primera pestaña vuelve a ser el inicio cuando aparece; un evento de otra pestaña trae la suya y avisa el cambio de tamaño');

  await page.evaluate(() => localStorage.setItem('mc.sintetica.tab', 'dos'));
  await page.goto(origin + '/#atajo'); await page.evaluate(() => { document.getElementById('pantalla').hidden = false; });
  await page.reload(); await page.evaluate(() => { document.getElementById('pantalla').hidden = false; });
  assert.equal(await selected(), 'dos'); assert.equal(await memory(), 'dos');
  assert.deepEqual(errors, []);
  const result = {ok: true, checks, apiRequests: 0, municipalData: false};
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
  await context.close();
} finally { await browser.close(); }
