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
const auth = caps => ({ok: true, authenticated: true, sessionVersion: 2, user: {id: 'qa-user', email: 'qa@example.invalid'}, expiresAt: at(-60), access: {context: 'tenant', tenant: {id: id(900), roleKey: 'payroll_reviewer'}, tenantCapabilities: caps}});
const pending = (toReview, decided) => ({version: 'own-contract-salary-conditions.pending.v1', generatedAt: at(0), complete: true, decisionWindowDays: 30, toReview, decided, counts: {toReview: toReview.length, decided: decided.length}, payrollCalculated: false, payrollPosted: false});
const html = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QA sintético · campanita conectada</title>
<body style="margin:0;font:16px system-ui;background:#f4f7f6"><header class="topbar" style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px;background:#fff;border-bottom:1px solid #dbe6e4"><div class="top-title">Liquidaciones de sueldos · QA sintético</div><div class="top-actions" style="display:flex;gap:12px;align-items:center"><span class="source-chip">Fuente sintética</span><button class="button" id="logoutButton" type="button">Cerrar sesión</button></div></header><main style="padding:20px;min-height:60vh"></main>
<script type="module" src="/assets/pending-bell-mount.js"></script></body></html>`;

const browser = await chromium.launch({headless: true});
try {
  async function open(scenario) {
    const context = await browser.newContext({viewport: {width: 1366, height: 800}, locale: 'es-AR', reducedMotion: 'reduce', serviceWorkers: 'block'}), asked = [];
    await context.route('**/*', route => {
      const req = route.request(), u = new URL(req.url());
      if (u.origin !== origin) return route.abort();
      if (u.pathname === '/') return route.fulfill({status: 200, contentType: 'text/html', body: html});
      if (u.pathname.startsWith('/api/')) {
        asked.push(req.method() + ' ' + u.pathname + u.search);
        if (u.pathname === '/api/internal-auth') return route.fulfill({status: scenario.session ? 200 : 401, contentType: 'application/json', body: JSON.stringify(scenario.session ? auth(scenario.caps) : {ok: false})});
        if (u.pathname === '/api/internal-own-contract-salary-conditions' && u.search === '?resource=pending') return route.fulfill({status: scenario.status ?? 200, contentType: 'application/json', body: JSON.stringify(scenario.body)});
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
  let s = await open({session: true, caps: CAPS, body: {ok: true, data: pending([{proposalId: id(1), period: '2026-10', authorLabel: 'Preparadora sintética', createdAt: at(25), canReview: true}], [{eventId: id(103), proposalId: id(3), period: '2026-10', status: 'approved', actorLabel: 'Revisora sintética', recordedAt: at(8)}])}});
  const button = s.page.locator('.mc-bell-button'), badge = s.page.locator('.mc-bell-badge');
  await button.waitFor(); await s.page.waitForFunction(() => document.querySelector('.mc-bell-badge')?.textContent === '2');
  check(await s.page.locator('.top-actions > [data-pending-bell-host]').count() === 1 && await s.page.evaluate(() => document.querySelector('.top-actions').firstElementChild.hasAttribute('data-pending-bell-host')), 'la campanita queda en la barra superior, antes del resto de las acciones');
  check((await badge.innerText()) === '2', 'el número rojo cuenta la revisión pendiente y la decisión todavía no vista');
  check(s.asked.join(' | ') === 'GET /api/internal-auth | GET /api/internal-own-contract-salary-conditions?resource=pending', 'sólo consulta la sesión y la lectura liviana de pendientes, las dos por GET');
  await button.click(); const panel = s.page.locator('.mc-bell-panel'); await panel.waitFor();
  const text = await panel.innerText();
  check(text.includes('Condiciones salariales') && text.includes('Preparadora sintética') && text.includes('Revisora sintética'), 'la lista nombra el circuito y quién preparó o decidió, sin fundamentos');
  check(await panel.locator('a[href="/nomina#condiciones"]').count() >= 1, 'cada aviso lleva a Condiciones salariales en Liquidaciones');
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

  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, 'resultado.json'), JSON.stringify({passed: true, checks: checks.length, names: checks, syntheticOnly: true, municipalApisCalled: 0}, null, 2));
  console.log(JSON.stringify({passed: true, checks: checks.length}));
} finally { await browser.close(); }
