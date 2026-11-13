// Campanita de pendientes en un navegador real, con datos exclusivamente sintéticos. No hay API municipal, sesión
// real ni datos de personas: la lectura la entrega esta misma página de prueba.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'verification', 'pending-bell'); fs.mkdirSync(output, {recursive: true});
const origin = 'https://pending-bell.invalid', checks = [], errors = [];
const check = (ok, name) => { assert.ok(ok, name); checks.push(name); };
const id = n => 'aaaaaaaa-aaaa-4aaa-8aaa-' + String(n).padStart(12, '0');
const html = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QA sintético · campanita</title>
<body style="margin:0;font:16px system-ui;background:#f4f7f6"><header style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px;background:#fff;border-bottom:1px solid #dbe6e4"><strong>MuniControl · QA sintético</strong><div id="bar"></div></header><main style="padding:20px;min-height:120vh"><button id="otro">Otro control</button></main>
<script type="module">
import {mountPendingBell} from '/assets/pending-bell.js';
const at = m => new Date(Date.now() - m * 60000).toISOString();
const review = (n, m) => ({proposalId: '${id(0)}'.slice(0, -2) + String(n).padStart(2, '0'), period: '2026-10', authorLabel: 'Preparadora sintética', createdAt: at(m), canReview: true});
const pending = (toReview, decided) => ({version: 'own-contract-salary-conditions.pending.v1', generatedAt: at(0), complete: true, decisionWindowDays: 30, toReview, decided, counts: {toReview: toReview.length, decided: decided.length}, payrollCalculated: false, payrollPosted: false});
window.qa = {reads: 0, fail: false, review, pending, sources: [
  {key: 'condiciones', title: 'Condiciones salariales', href: '/nomina#condiciones', pending: pending([review(1, 25)], [{eventId: '${id(103)}', proposalId: '${id(3)}', period: '2026-10', status: 'rejected', actorLabel: 'Revisora sintética', recordedAt: at(8)}])},
  {key: 'horas-convenio', title: 'Horas por convenio', href: '/nomina#horas-convenio', pending: pending([review(2, 190)], [])}]};
window.bell = mountPendingBell({host: document.getElementById('bar'), accountKey: 'qa', everyMs: 15000, inboxHref: '/nomina#resumen', read: async () => { window.qa.reads++; if (window.qa.fail) throw new Error('sintético'); return window.qa.circuits ? {sources: structuredClone(window.qa.sources), circuits: structuredClone(window.qa.circuits)} : structuredClone(window.qa.sources); }});
window.listo = true;
</script></body></html>`;

const browser = await chromium.launch({headless: true});
try {
  const context = await browser.newContext({viewport: {width: 1366, height: 800}, locale: 'es-AR', reducedMotion: 'reduce', serviceWorkers: 'block'});
  await context.route('**/*', route => {
    const req = route.request(), u = new URL(req.url());
    if (u.origin !== origin) return route.abort();
    if (u.pathname === '/') return route.fulfill({status: 200, contentType: 'text/html', body: html});
    const file = path.resolve(root, u.pathname.slice(1));
    if (req.method() !== 'GET' || !file.startsWith(path.join(root, 'assets') + path.sep) || !fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({status: 200, contentType: path.extname(file) === '.css' ? 'text/css' : 'text/javascript', body: fs.readFileSync(file)});
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });
  await page.goto(origin + '/'); await page.waitForFunction(() => window.listo === true && window.qa.reads >= 1);
  const button = page.locator('.mc-bell-button'), badge = page.locator('.mc-bell-badge'), panel = page.locator('.mc-bell-panel');
  await badge.waitFor({state: 'visible'});
  check((await badge.innerText()) === '3' && (await button.getAttribute('aria-label')) === 'Pendientes: 2 pendientes te esperan y 1 novedad de lo tuyo', 'el número rojo suma lo que espera tu decisión y las novedades sin ver, y el botón lo dice en palabras');
  check(await panel.isHidden() && (await button.getAttribute('aria-expanded')) === 'false', 'la lista está cerrada hasta que se pide');
  await page.screenshot({path: path.join(output, 'campanita-cerrada.png'), clip: {x: 866, y: 0, width: 500, height: 80}});
  await button.click();
  check(await panel.isVisible() && (await panel.locator('h3').allInnerTexts()).join('|').toUpperCase() === 'ESPERAN TU DECISIÓN|LO QUE DECIDIERON SOBRE LO TUYO', 'al tocarla se abren las dos listas');
  const items = panel.locator('.mc-bell-item');
  check(await items.count() === 3 && (await items.nth(0).locator('strong').innerText()) === 'Horas por convenio · octubre de 2026' && /lo pidió hace 3 h$/.test(await items.nth(0).locator('.mc-bell-who').innerText()), 'primero lo que espera hace más tiempo, con quién lo pidió y cuándo');
  check((await items.nth(0).locator('a').getAttribute('href')) === '/nomina#horas-convenio' && (await items.nth(0).locator('a').innerText()) === 'Revisar ahora', '«Revisar ahora» lleva directo a la tarea');
  check(/^Rechazado por Revisora sintética hace 8 min$/.test(await items.nth(2).locator('.mc-bell-who').innerText()) && (await items.nth(2).locator('strong').innerText()) === 'Condiciones salariales · octubre de 2026', 'lo rechazado llega con quién lo decidió y cuándo');
  check(!(await panel.innerText()).includes('Por ahora avisa de') && !(await panel.innerText()).includes('Propuesta exclusivamente') && (await panel.locator('a.mc-bell-all').getAttribute('href')) === '/nomina#resumen', 'no muestra fundamentos y ofrece la bandeja completa');
  check((await badge.innerText()) === '2', 'abrir la lista marca vistas las novedades; lo que espera decisión sigue contando');
  check(await page.evaluate(() => [...document.querySelectorAll('.mc-bell-go')].every(a => a.getBoundingClientRect().height >= 44)), 'los botones de la lista miden 44px o más');
  await page.screenshot({path: path.join(output, 'campanita-abierta.png'), clip: {x: 866, y: 0, width: 500, height: 620}});
  await page.keyboard.press('Escape');
  check(await panel.isHidden() && await button.evaluate(e => e === document.activeElement), 'Escape cierra y devuelve el foco a la campanita');
  await button.click(); await page.locator('#otro').click(); check(await panel.isHidden(), 'un clic afuera cierra la lista');

  await page.evaluate(() => { const p = window.qa.sources[1].pending; p.toReview.push(window.qa.review(4, 0)); p.counts.toReview = 2; document.dispatchEvent(new CustomEvent('mc:pending-refresh')); });
  await page.waitForFunction(() => document.querySelector('.mc-bell-badge').textContent === '3');
  check((await page.locator('.mc-bell-live').innerText()).startsWith('Nuevo pendiente: 3 pendientes te esperan'), 'cuando llega algo nuevo se actualiza sola y lo anuncia para lectores de pantalla');
  await page.reload(); await page.waitForFunction(() => window.listo === true && window.qa.reads >= 1); await badge.waitFor({state: 'visible'});
  check((await badge.innerText()) === '2', 'al volver a entrar, la decisión ya mostrada no se cuenta otra vez');
  await page.evaluate(() => { window.qa.sources[0] = {key: 'condiciones', title: 'Condiciones salariales', href: '/nomina#condiciones', error: true}; document.dispatchEvent(new CustomEvent('mc:pending-refresh')); }); await page.waitForFunction(() => document.querySelector('.mc-bell-badge').textContent === '1'); await button.click();
  check((await panel.innerText()).includes('Sin respuesta de: Condiciones salariales. No se cuentan como cero.'), 'un circuito sin respuesta se nombra y no se cuenta como cero'); await page.keyboard.press('Escape'); await page.reload(); await page.waitForFunction(() => window.listo === true && window.qa.reads >= 1); await badge.waitFor({state: 'visible'});

  await page.evaluate(() => { window.qa.fail = true; document.dispatchEvent(new CustomEvent('mc:pending-refresh')); }); await page.waitForFunction(() => window.qa.reads >= 2);
  await button.click(); check((await badge.innerText()) === '2' && (await panel.innerText()).includes('La última consulta falló; esto es lo anterior.'), 'si una consulta falla conserva lo anterior y lo dice, sin inventar un cero');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { window.qa.fail = false; for (const s of window.qa.sources) s.pending = window.qa.pending([], []); document.dispatchEvent(new CustomEvent('mc:pending-refresh')); });
  await page.waitForFunction(() => document.querySelector('.mc-bell-badge').hidden === true); await button.click();
  check((await button.getAttribute('aria-label')) === 'Pendientes: Sin pendientes' && (await panel.innerText()).includes('No hay nada esperándote.'), 'sin pendientes no hay número y la lista lo dice');
  await page.keyboard.press('Escape');

  // Los circuitos de la bandeja «Pendientes de aprobación» también avisan: cuántos esperan a esta persona y dónde.
  await page.evaluate(() => { window.qa.circuits = [
    {key: 'salary-master', title: 'Maestro salarial', href: '/nomina#parametros', count: 1, reviewable: 1},
    {key: 'monthly-batches', title: 'Lotes mensuales', href: '/novedades#lotes', count: 2, reviewable: 1},
    {key: 'leave', title: 'Licencias solicitadas', href: '/acciones', count: 2, reviewable: null},
    {key: 'program', title: 'Programa de cálculo', href: '/nomina#reglas', count: 0, reviewable: 0},
    {key: 'adoption', title: 'Altas al padrón propio', href: '/personal?adopcion=pendientes#legajos', error: true}];
    document.dispatchEvent(new CustomEvent('mc:pending-refresh')); });
  await page.waitForFunction(() => document.querySelector('.mc-bell-badge').textContent === '3'); await button.click();
  check((await button.getAttribute('aria-label')) === 'Pendientes: 3 avisos · 4 pendientes te esperan', 'el número rojo cuenta avisos: maestro, lotes y licencias son tres, aunque las licencias traigan dos pendientes');
  const waiting = panel.locator('.mc-bell-item');
  check(await waiting.count() === 3 && (await waiting.nth(0).locator('strong').innerText()) === 'Maestro salarial' && (await waiting.nth(0).locator('.mc-bell-who').innerText()) === '1 espera tu decisión.' && (await waiting.nth(0).locator('a').getAttribute('href')) === '/nomina#parametros', 'cada circuito con algo para vos aparece con su cantidad y lleva a su pantalla');
  check((await waiting.nth(2).locator('.mc-bell-who').innerText()) === '2 pendientes. Al abrirlos se ve cuáles decidís vos.', 'si el circuito no dice cuáles son tuyos, avisa todos y lo aclara');
  check((await panel.innerText()).includes('Hay 1 pendiente más que decide otra persona.') && (await panel.innerText()).includes('Sin respuesta de: Altas al padrón propio. No se cuentan como cero.') && !(await panel.innerText()).includes('Programa de cálculo'), 'lo que decide otra persona se menciona aparte, el circuito sin respuesta se nombra y el que no tiene nada no ocupa lugar');
  check(await page.evaluate(() => [...document.querySelectorAll('.mc-bell-go,.mc-bell-all')].every(a => a.getBoundingClientRect().height >= 44)), 'los enlaces de los circuitos y el de la bandeja miden 44px o más');
  await page.screenshot({path: path.join(output, 'campanita-circuitos.png'), clip: {x: 866, y: 0, width: 500, height: 700}});
  await page.keyboard.press('Escape');
  // Pedido del dueño (12/11): 50 novedades fijas esperando mostraban «50». Es un aviso; el 50 se lee adentro.
  await page.evaluate(() => { window.qa.kept = window.qa.circuits; window.qa.circuits = [{key: 'fixed', title: 'Novedades fijas', href: '/novedades#fijas', count: 50, reviewable: 50}]; document.dispatchEvent(new CustomEvent('mc:pending-refresh')); });
  await page.waitForFunction(() => document.querySelector('.mc-bell-badge').textContent === '1'); await button.click();
  check((await button.getAttribute('aria-label')) === 'Pendientes: 1 aviso · 50 pendientes te esperan' && await waiting.count() === 1 && (await waiting.nth(0).locator('strong').innerText()) === 'Novedades fijas' && (await waiting.nth(0).locator('.mc-bell-who').innerText()) === '50 esperan tu decisión.', 'cincuenta propuestas del mismo circuito son un aviso: el número dice 1 y el aviso dice 50');
  await page.screenshot({path: path.join(output, 'campanita-un-aviso-cincuenta.png'), clip: {x: 866, y: 0, width: 500, height: 420}});
  await page.keyboard.press('Escape');
  await page.evaluate(() => { window.qa.circuits = [{key: 'fixed', title: 'Novedades fijas', href: '/novedades#fijas', count: 51, reviewable: 51}]; document.dispatchEvent(new CustomEvent('mc:pending-refresh')); });
  await page.waitForFunction(() => document.querySelector('.mc-bell-live').textContent.startsWith('Nuevo pendiente: 1 aviso · 51 pendientes te esperan'));
  check((await badge.innerText()) === '1', 'una propuesta más en el mismo aviso se anuncia para lectores de pantalla y no cambia el número');
  await page.evaluate(() => { window.qa.circuits = window.qa.kept; document.dispatchEvent(new CustomEvent('mc:pending-refresh')); });
  await page.waitForFunction(() => document.querySelector('.mc-bell-badge').textContent === '3');
  await page.evaluate(() => { for (const s of window.qa.sources) { delete s.pending; s.error = true; } window.qa.circuits = window.qa.circuits.map(c => ({key: c.key, title: c.title, href: c.href, error: true})); document.dispatchEvent(new CustomEvent('mc:pending-refresh')); });
  await page.waitForFunction(() => document.querySelector('.mc-bell-badge').hidden === true); await button.click();
  check((await panel.innerText()).includes('No se pudo consultar ningún circuito. Se vuelve a intentar solo en un minuto.') && !(await panel.innerText()).includes('No hay nada esperándote'), 'si ningún circuito respondió no dice «no hay nada»: dice que no pudo consultar');
  await page.keyboard.press('Escape');

  for (const width of [390, 320]) { await page.setViewportSize({width, height: 760}); await page.reload(); await page.waitForFunction(() => window.listo === true && window.qa.reads >= 1); await button.click();
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1) && await panel.evaluate(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; }), 'en el teléfono (' + width + 'px) la lista entra completa, sin desborde');
    if (width === 390) await page.screenshot({path: path.join(output, 'campanita-telefono.png')}); }
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, 'resultado.json'), JSON.stringify({passed: true, checks: checks.length, names: checks, syntheticOnly: true, municipalApisCalled: 0}, null, 2)); console.log(JSON.stringify({passed: true, checks: checks.length}));
} finally { await browser.close(); }
