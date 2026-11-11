// Campanita conectada a la barra superior, en un navegador real y con datos exclusivamente sintéticos. Las dos
// consultas (sesión y pendientes) las responde esta misma prueba: no hay API municipal ni datos de personas.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'verification', 'pending-bell-mount'); fs.mkdirSync(output, {recursive: true});
const origin = 'https://pending-bell-mount.invalid', checks = [], errors = [];
const check = (ok, name) => { assert.ok(ok, name); checks.push(name); };
const id = n => 'aaaaaaaa-aaaa-4aaa-8aaa-' + String(n).padStart(12, '0'), at = m => new Date(Date.now() - m * 60000).toISOString();
const CAPS = ['workforce.employee.read', 'payroll.parameter.read', 'payroll.calculation.nominal.read'];
const CIRCUITS = ['/api/internal-own-payroll-program', '/api/internal-native-salary', '/api/internal-payroll-parameters', '/api/internal-own-agreement-working-time', '/api/internal-own-bank-accounts', '/api/internal-own-payroll-accounting'];
const masterWaiting = {body: {ok: true, data: {catalog: {version: 'v8'}, proposals: [{status: 'pending', baseVersion: 'v8', canReview: true, authorLabel: 'Preparadora sintética', createdAt: at(12), reason: 'Propuesta exclusivamente sintética', items: [{}, {}]}]}}};
const auth = caps => ({ok: true, authenticated: true, sessionVersion: 2, user: {id: 'qa-user', email: 'qa@example.invalid'}, expiresAt: at(-60), access: {context: 'tenant', tenant: {id: id(900), roleKey: 'payroll_reviewer'}, tenantCapabilities: caps}});
const pending = (toReview, decided) => ({version: 'own-contract-salary-conditions.pending.v1', generatedAt: at(0), complete: true, decisionWindowDays: 30, toReview, decided, counts: {toReview: toReview.length, decided: decided.length}, payrollCalculated: false, payrollPosted: false});
const html = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QA sintético · campanita conectada</title>
<body style="margin:0;font:16px system-ui;background:#f4f7f6"><header class="topbar" style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px;background:#fff;border-bottom:1px solid #dbe6e4"><div class="top-title">Liquidaciones de sueldos · QA sintético</div><div class="__ACTIONS__" style="display:flex;gap:12px;align-items:center"><span class="source-chip">Fuente sintética</span><button class="button" id="logoutButton" type="button">Cerrar sesión</button></div></header><main style="padding:20px;min-height:60vh"></main>
<script type="module" src="/assets/pending-bell-mount.js"></script></body></html>`;

const browser = await chromium.launch({headless: true});
try {
  async function open(scenario) {
    const context = await browser.newContext({viewport: {width: 1366, height: 800}, locale: 'es-AR', reducedMotion: 'reduce', serviceWorkers: 'block'}), asked = [];
    await context.route('**/*', route => {
      const req = route.request(), u = new URL(req.url());
      if (u.origin !== origin) return route.abort();
      if (u.pathname === '/') return route.fulfill({status: 200, contentType: 'text/html', body: html.replace('__ACTIONS__', scenario.actionsClass ?? 'top-actions')});
      if (u.pathname.startsWith('/api/')) {
        asked.push(req.method() + ' ' + u.pathname + u.search);
        if (u.pathname === '/api/internal-auth') return route.fulfill({status: scenario.session ? 200 : 401, contentType: 'application/json', body: JSON.stringify(scenario.session ? auth(scenario.caps) : {ok: false})});
        if (u.pathname === '/api/internal-own-contract-salary-conditions' && u.search === '?resource=pending') return route.fulfill({status: scenario.status ?? 200, contentType: 'application/json', body: JSON.stringify(scenario.body)});
        // Los circuitos de la bandeja que esta cuenta sintética puede ver: sin pendientes, salvo que el escenario diga otra cosa.
        if (CIRCUITS.includes(u.pathname)) { const custom = scenario.circuits?.[u.pathname];
          return route.fulfill({status: custom?.status ?? 200, contentType: 'application/json', body: JSON.stringify(custom?.body ?? (u.pathname === '/api/internal-payroll-parameters' ? {ok: true, proposals: [], total: 0} : {ok: true, data: {proposals: []}}))}); }
        return route.fulfill({status: 404, body: ''});
      }
      const file = path.resolve(root, u.pathname.slice(1));
      if (req.method() !== 'GET' || !file.startsWith(path.join(root, 'assets') + path.sep) || !fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
      return route.fulfill({status: 200, contentType: path.extname(file) === '.css' ? 'text/css' : 'text/javascript', body: fs.readFileSync(file)});
    });
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/40[134]|503/.test(m.text())) errors.push(m.text()); });
    await page.goto(origin + '/'); await page.waitForFunction(() => document.readyState === 'complete'); await page.waitForTimeout(600);
    return {context, page, asked};
  }

  // 1. Con sesión, permisos y una revisión pendiente más una decisión reciente
  let s = await open({session: true, caps: CAPS, circuits: {'/api/internal-native-salary': masterWaiting}, body: {ok: true, data: pending([{proposalId: id(1), period: '2026-10', authorLabel: 'Preparadora sintética', createdAt: at(25), canReview: true}], [{eventId: id(103), proposalId: id(3), period: '2026-10', status: 'approved', actorLabel: 'Revisora sintética', recordedAt: at(8)}])}});
  const button = s.page.locator('.mc-bell-button'), badge = s.page.locator('.mc-bell-badge');
  await button.waitFor(); await s.page.waitForFunction(() => document.querySelector('.mc-bell-badge')?.textContent === '3');
  check(await s.page.locator('.top-actions > [data-pending-bell-host]').count() === 1 && await s.page.evaluate(() => document.querySelector('.top-actions').firstElementChild.hasAttribute('data-pending-bell-host')), 'la campanita queda en la barra superior, antes del resto de las acciones');
  check((await badge.innerText()) === '3', 'el número rojo cuenta la revisión pendiente, la propuesta del maestro que espera a esta cuenta y la decisión todavía no vista');
  check(s.asked[0] === 'GET /api/internal-auth' && s.asked.every(a => a.startsWith('GET ')) && s.asked.length === 8 && s.asked.includes('GET /api/internal-own-contract-salary-conditions?resource=pending') && CIRCUITS.every(c => s.asked.filter(a => a.startsWith('GET ' + c + '?')).length === 1), 'consulta la sesión, la lectura liviana y una vez cada circuito de la bandeja que la cuenta puede ver, todo por GET');
  await button.click(); const panel = s.page.locator('.mc-bell-panel'); await panel.waitFor();
  const text = await panel.innerText();
  check(text.includes('Condiciones salariales') && text.includes('Preparadora sintética') && text.includes('Revisora sintética'), 'la lista nombra el circuito y quién preparó o decidió, sin fundamentos');
  check(await panel.locator('a[href="/nomina#condiciones"]').count() >= 1, 'cada aviso lleva a Condiciones salariales en Liquidaciones');
  check(text.includes('Maestro salarial') && text.includes('1 espera tu decisión.') && await panel.locator('a[href="/nomina#parametros"]').count() === 1 && !text.includes('Propuesta exclusivamente'), 'la propuesta del maestro salarial que espera a esta cuenta aparece con el enlace a Parámetros y sin su fundamento');
  check((await panel.locator('a.mc-bell-all').getAttribute('href')) === '/nomina#resumen', 'ofrece la bandeja completa');
  const stored = await s.page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('mc.pendientes.visto.')));
  check(stored.length === 1 && /^mc\.pendientes\.visto\.[a-f0-9]{32}$/.test(stored[0]) && !stored[0].includes('example'), 'lo ya visto se recuerda por cuenta sin guardar el correo');
  await s.page.screenshot({path: path.join(output, 'campanita-conectada.png')});
  await s.context.close();

  // 2. Sin permisos de condiciones: no se muestra ni se consulta nada más
  s = await open({session: true, caps: ['payroll.read'], body: {ok: true, data: pending([], [])}});
  check(await s.page.locator('.mc-bell').count() === 0 && s.asked.join(' | ') === 'GET /api/internal-auth', 'una cuenta sin esos permisos no ve campanita ni dispara la lectura');
  await s.context.close();

  // 3. Sin sesión: nada
  s = await open({session: false, caps: [], body: {ok: false}});
  check(await s.page.locator('.mc-bell').count() === 0 && s.asked.join(' | ') === 'GET /api/internal-auth', 'sin sesión vigente no se monta');
  await s.context.close();

  // 4. La lectura falla: se dice, no se muestra cero
  s = await open({session: true, caps: CAPS, status: 503, body: {ok: false, code: 'UNAVAILABLE'}});
  await s.page.locator('.mc-bell-button').waitFor(); await s.page.locator('.mc-bell-button').click(); await s.page.locator('.mc-bell-panel').waitFor();
  check((await s.page.locator('.mc-bell-panel').innerText()).includes('No se cuentan como cero'), 'si la lectura no responde, la campanita lo dice en lugar de mostrar cero');
  await s.context.close();

  // 5. En Inicio la barra superior usa otra clase: la campanita se monta igual
  s = await open({session: true, caps: CAPS, actionsClass: 'topbar-actions', circuits: {'/api/internal-native-salary': masterWaiting}, body: {ok: true, data: pending([], [])}});
  await s.page.locator('.mc-bell-button').waitFor(); await s.page.waitForFunction(() => document.querySelector('.mc-bell-badge')?.textContent === '1');
  check(await s.page.locator('.topbar-actions > [data-pending-bell-host]').count() === 1, 'en Inicio la campanita queda en la barra superior y avisa lo que espera a la cuenta');
  await s.page.screenshot({path: path.join(output, 'campanita-inicio.png')});
  await s.context.close();

  // 6. No responde nada: no dice «no hay nada»
  s = await open({session: true, caps: CAPS, status: 503, body: {ok: false, code: 'UNAVAILABLE'}, circuits: Object.fromEntries(CIRCUITS.map(c => [c, {status: 503, body: {ok: false, code: 'UNAVAILABLE'}}]))});
  await s.page.locator('.mc-bell-button').waitFor(); await s.page.waitForFunction(() => document.querySelector('.mc-bell-button').getAttribute('aria-label') !== 'Pendientes: consultando'); await s.page.locator('.mc-bell-button').click(); await s.page.locator('.mc-bell-panel').waitFor();
  const nothing = await s.page.locator('.mc-bell-panel').innerText();
  check(nothing.includes('No se pudo consultar ningún circuito. Se vuelve a intentar solo en un minuto.') && !nothing.includes('No hay nada esperándote'), 'si no respondió ningún circuito, la campanita dice que no pudo consultar y no «no hay nada»');
  await s.context.close();

  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, 'resultado.json'), JSON.stringify({passed: true, checks: checks.length, names: checks, syntheticOnly: true, municipalApisCalled: 0}, null, 2));
  console.log(JSON.stringify({passed: true, checks: checks.length}));
} finally { await browser.close(); }
