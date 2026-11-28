// Pasos de «Preparar el programa completo» en un navegador real, sobre la plantilla real del panel de reglas.
// Sin API, sin sesión y sin datos municipales: sólo el formulario, el módulo de pasos y la hoja de estilos.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'verification', 'own-program-steps'); fs.mkdirSync(output, {recursive: true});
const origin = 'https://program-steps.invalid', checks = [], errors = [];
const panel = fs.readFileSync(path.join(root, 'assets/own-payroll-program-panel.js'), 'utf8');
const form = /<form data-program-form>[\s\S]*?<\/form>/.exec(panel)?.[0]?.replace(/\$\{Array\.from[\s\S]*?\.join\(''\)\}/g, '<option value="2">2</option>');
assert.ok(form && !form.includes('${'), 'la plantilla del formulario se lee completa del panel');
const html = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/own-payroll-program-panel.css">
<body style="margin:0;font:16px system-ui"><main style="max-width:1100px;margin:0 auto;padding:16px"><section class="own-program">${form}</section></main>
<script type="module">import {mountProgramSteps} from '/assets/own-program-steps.js';
const fields = document.querySelector('[data-program-fields]');
for (const [key, n] of [['rule-select', 6], ['binding-select', 1]]) for (let i = 0; i < n; i++) fields.querySelector('[data-program-' + key + ']').append(new Option('Sintética ' + (i + 1), String(i)));
fields.querySelector('[data-program-add-binding]').addEventListener('click', () => fields.querySelector('[data-program-binding-select]').append(new Option('Sintética nueva', 'n')));
window.steps = mountProgramSteps(fields); window.listo = true;</script></body></html>`;
const browser = await chromium.launch({headless: true});
try {
  const context = await browser.newContext({viewport: {width: 1280, height: 900}, reducedMotion: 'reduce', serviceWorkers: 'block'});
  await context.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.origin !== origin || u.pathname.startsWith('/api/')) return route.abort();
    if (u.pathname === '/') return route.fulfill({status: 200, contentType: 'text/html', body: html});
    const file = path.resolve(root, u.pathname.slice(1));
    if (!file.startsWith(path.join(root, 'assets') + path.sep) || !fs.existsSync(file)) return route.abort();
    return route.fulfill({status: 200, contentType: path.extname(file) === '.css' ? 'text/css' : 'text/javascript', body: fs.readFileSync(file)});
  });
  const page = await context.newPage(); page.setDefaultTimeout(8000);
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const check = (ok, name) => { assert.ok(ok, name); checks.push(name); };
  const open = async () => { await page.goto(origin + '/'); await page.waitForFunction(() => window.listo === true); };
  const state = () => page.evaluate(() => {
    const shown = el => el.getBoundingClientRect().height > 0, blocks = [...document.querySelectorAll('[data-program-fields] > [data-program-step]')];
    return {current: window.steps.current(), marked: document.querySelector('[data-program-steps] [aria-current="step"]')?.dataset.programStepGo ?? null,
      visible: [...new Set(blocks.filter(shown).map(el => el.dataset.programStep))], blocks: blocks.length, unassigned: [...document.querySelectorAll('[data-program-fields] > :not([data-program-step])')].map(el => el.tagName),
      hiddenAttr: blocks.filter(el => el.hidden).length, height: Math.round(document.querySelector('[data-program-form]').getBoundingClientRect().height), stored: localStorage.getItem('mc.nomina.reglas.paso'),
      prev: document.querySelector('[data-program-step-prev]').hidden ? null : document.querySelector('[data-program-step-prev]').textContent, next: document.querySelector('[data-program-step-next]').hidden ? null : document.querySelector('[data-program-step-next]').textContent};
  });

  await open(); let s = await state();
  check(s.current === 'archivo' && s.marked === 'archivo' && s.visible.join() === 'archivo' && s.stored === null, 'la primera visita abre el primer paso sin guardar nada');
  check(s.unassigned.join() === 'LEGEND,P' && s.hiddenAttr === 0, 'sólo el título y la introducción quedan fuera de los pasos, y ningún bloque se oculta con hidden');
  check(s.prev === null && s.next === 'Seguir: Datos que usa ›', 'el primer paso sólo ofrece seguir');
  const whole = await page.evaluate(() => { window.steps.show('todo'); const h = Math.round(document.querySelector('[data-program-form]').getBoundingClientRect().height); window.steps.show('archivo'); return h; });
  const heights = {};
  for (const [id, must] of [['fuentes', '[data-program-namespaces]'], ['reglas', '[data-program-rule-select]'], ['entradas', '[data-program-binding-select]'], ['enviar', '[data-program-reason]']]) {
    await page.click(`[data-program-step-go="${id}"]`); s = await state(); heights[id] = s.height;
    check(s.current === id && s.marked === id && s.visible.join() === id && s.stored === id, `«${id}» muestra sólo sus bloques y queda recordado`);
    check(await page.locator(must).isVisible(), `«${id}» tiene su control principal a la vista`);
  }
  check(Object.values(heights).every(h => h < whole * 0.6), 'cada paso es bastante más corto que el formulario completo');
  check(s.prev === '‹ Entradas' && s.next === null, 'el último paso sólo ofrece volver');
  await page.click('[data-program-step-prev]'); s = await state(); check(s.current === 'entradas', 'el botón de volver retrocede un paso');
  check(await page.locator('[data-program-add-binding]').isVisible() && !(await page.locator('[data-program-add-rule]').isVisible()), '«Agregar entrada» va con las entradas y «Agregar regla» con las reglas');
  check((await page.locator('[data-program-step-go="entradas"] small').textContent()) === '1 entrada en el borrador' && (await page.locator('[data-program-step-go="reglas"] small').textContent()) === '6 reglas en el borrador', 'las pestañas cuentan reglas y entradas del borrador');
  await page.click('[data-program-add-binding]'); await page.waitForFunction(() => document.querySelector('[data-program-step-go="entradas"] small').textContent === '2 entradas en el borrador'); check(true, 'el botón movido conserva su acción y el conteo se actualiza');
  await page.click('[data-program-step-next]'); s = await state(); check(s.current === 'enviar', 'el botón de seguir avanza un paso');

  await page.click('[data-program-step-go="todo"]'); s = await state();
  check(s.current === 'todo' && s.marked === null && s.visible.length === 5 && s.prev === null && s.next === null && s.stored === 'todo', '«Ver todo junto» muestra los cinco pasos seguidos');
  check((await page.locator('[data-program-step-go="todo"]').textContent()) === 'Ver por pasos' && (await page.locator('[data-program-step-go="todo"]').getAttribute('aria-pressed')) === 'true', 'el mismo botón ofrece volver a los pasos');
  await page.click('[data-program-step-go="todo"]'); s = await state(); check(s.current === 'enviar' && s.visible.join() === 'enviar', 'al volver a los pasos se retoma el último');
  await page.click('[data-program-step-go="reglas"]'); await open(); s = await state(); check(s.current === 'reglas' && s.visible.join() === 'reglas', 'al recargar se abre el paso recordado');

  await page.evaluate(() => { document.querySelector('[data-program-fields]').disabled = true; });
  await page.click('[data-program-step-go="fuentes"]'); s = await state(); check(s.current === 'fuentes' && await page.locator('[data-program-namespaces]').isDisabled(), 'con el formulario en sólo lectura los pasos siguen funcionando');
  await page.evaluate(() => { localStorage.setItem('mc.nomina.reglas.paso', 'inexistente'); }); await open(); s = await state(); check(s.current === 'archivo', 'un valor recordado desconocido vuelve al primer paso');

  await page.emulateMedia({media: 'print'}); check((await page.evaluate(() => [...document.querySelectorAll('[data-program-fields] > [data-program-step]')].every(el => getComputedStyle(el).display !== 'none') && getComputedStyle(document.querySelector('[data-program-steps]')).display === 'none')), 'al imprimir sale el formulario completo y sin la barra de pasos');
  await page.emulateMedia({media: 'screen'});
  await page.screenshot({path: path.join(output, 'pasos-escritorio.png')});
  for (const width of [820, 390, 320]) {
    await page.setViewportSize({width, height: 844});
    for (const id of ['archivo', 'fuentes', 'reglas', 'entradas', 'enviar']) { await page.click(`[data-program-step-go="${id}"]`); check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `sin desborde horizontal a ${width}px en «${id}»`); }
    check(await page.evaluate(() => [...document.querySelectorAll('[data-program-steps] button,[data-program-step-prev],[data-program-step-next]')].filter(b => b.getBoundingClientRect().height > 0).every(b => b.getBoundingClientRect().height >= 44)), `botones de paso de 44px o más a ${width}px`);
  }
  await page.screenshot({path: path.join(output, 'pasos-telefono.png')});
  assert.deepEqual(errors, []);
  const report = {passed: true, checks: checks.length, names: checks, syntheticOnly: true, municipalApisCalled: 0};
  fs.writeFileSync(path.join(output, 'resultado.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({passed: true, checks: checks.length}));
} finally { await browser.close(); }
