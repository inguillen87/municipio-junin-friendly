// «Condiciones salariales» y «Horas mensuales por convenio» con datos cargados, en un navegador real: los renglones
// plegados, la comparación en lugar del listado y el largo de la pantalla. Usa los paneles reales y las consultas
// sintéticas de sus pruebas; no hay API municipal, SQL, sesión real ni datos de personas, y no se envía nada.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {syntheticConditionsBootstrap, syntheticConditionsDetail} from '../tests/fixtures/own-contract-salary-conditions-synthetic.js';
import {syntheticAgreementTimeBootstrap, syntheticAgreementTimeDetail} from '../tests/fixtures/own-agreement-working-time-synthetic.js';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'verification', 'folded-fact-panels'); fs.mkdirSync(output, {recursive: true});
const origin = 'https://fact-panels.invalid', period = '2026-10', checks = [], errors = [];
const check = (ok, name) => { assert.ok(ok, name); checks.push(name); };
const conditions = syntheticConditionsBootstrap(60); conditions.source.subjects.forEach((s, i) => { s.employeeName = 'Agente exclusivamente sintético ' + (i + 1); });
const agreements = syntheticAgreementTimeBootstrap(14);
// Lo aprobado el mes anterior, para «Traer lo aprobado»: en condiciones faltan dos contratos y uno cambió de identidad.
const approved = (boot, items) => ({...structuredClone(boot), period: '2026-09', configuration: {version: '9'.repeat(64), revision: 1, items, proposalId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', approvalId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}});
const evidence = {asOfDate: '2026-09-01', documentReference: 'Constancia exclusivamente sintética de septiembre'};
const previousConditions = approved(conditions, conditions.source.subjects.slice(0, 58).map((s, i) => ({contractId: s.contractId, identityToken: i === 1 ? 'f'.repeat(64) : s.identityToken, definition: {partialSeniorityYears: '5', title: {status: 'none', code: null, percentage: null}, unhealthyWork: true, ...evidence}})));
const previousAgreements = approved(agreements, agreements.source.agreements.map(a => ({agreementCode: a.agreementCode, agreementToken: a.agreementToken, definition: {monthlyHours: '180', ...evidence}})));
const CASES = [
  {id: 'condiciones', name: 'Condiciones salariales', module: 'own-contract-salary-conditions-panel.js', mount: 'mountOwnContractSalaryConditions', host: '.own-salary-conditions', prefix: 'conditions', endpoint: '/api/internal-own-contract-salary-conditions', boot: conditions, previous: previousConditions, carried: 'Se trajeron 57 de 60 filas de lo aprobado en septiembre de 2026, con su fecha y su constancia. 3 quedan como estaban porque no figuran en ese mes o cambió su identidad. Revisá, corregí lo que cambió y compará. Todavía no se registró nada.', detail: () => syntheticConditionsDetail(60), approve: /^Aprobar /, total: 60, shown: 25, noun: 'contratos',
    closed: 'Antigüedad parcial: sin informar · Título: sin informar · Insalubridad: sin informar', edit: {label: 'Antigüedad parcial en años (vacío: sin informar)', value: '3'}, edited: 'Antigüedad parcial: 3 · Título: sin informar · Insalubridad: sin informar', changed: 'Antigüedad parcial|Fecha|Constancia', unchanged: 'Fecha|Constancia', perPage: 6, budget: 3.1},
  {id: 'horas-convenio', name: 'Horas mensuales por convenio', module: 'own-agreement-working-time-panel.js', mount: 'mountOwnAgreementWorkingTime', host: '.own-agreement-time', prefix: 'agreement-time', endpoint: '/api/internal-own-agreement-working-time', boot: agreements, previous: previousAgreements, carried: 'Se trajeron 14 de 14 filas de lo aprobado en septiembre de 2026, con su fecha y su constancia. Revisá, corregí lo que cambió y compará. Todavía no se registró nada.', detail: () => syntheticAgreementTimeDetail(agreements), approve: /^Aprobar /, total: 14, shown: 14, noun: 'convenios',
    closed: 'Horas mensuales: sin informar', edit: {label: 'Horas mensuales del convenio (vacío: sin informar)', value: '180'}, edited: '180 horas mensuales', changed: 'Horas mensuales del convenio|Fecha|Constancia', unchanged: 'Fecha|Constancia', perPage: 6, budget: 2.25}, // 2,2 antes de «Traer lo aprobado»: el botón junto al estado suma unos 10 px
];
const page0 = c => `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QA sintético · ${c.name}</title>
<body style="margin:0;font:16px system-ui;background:#f4f7f6"><main style="max-width:1180px;margin:0 auto;padding:16px"><div id="host"></div></main>
<script type="module">import {${c.mount}} from '/assets/${c.module}';${c.mount}(document.getElementById('host'));document.dispatchEvent(new CustomEvent('taskchange',{detail:{id:'${c.id}'}}));window.listo=true;</script></body></html>`;

const browser = await chromium.launch({headless: true});
try {
  const context = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'es-AR', reducedMotion: 'reduce', serviceWorkers: 'block'});
  let writes = 0, reviewing = null;
  await context.route('**/*', route => {
    const req = route.request(), u = new URL(req.url());
    if (u.origin !== origin) return route.abort();
    const page = CASES.find(c => u.pathname === '/' + c.id); if (page) return route.fulfill({status: 200, contentType: 'text/html', body: page0(page)});
    if (u.pathname === '/api/internal-auth') return route.fulfill({json: {ok: true, authenticated: true, sessionVersion: 2, user: {id: 'qa', email: 'qa@example.invalid'}, access: {context: 'tenant', tenant: {id: '50000000-0000-4000-8000-000000000001', roleKey: 'QA'}, tenantCapabilities: ['workforce.employee.read', 'payroll.parameter.read', 'payroll.calculation.nominal.read', 'payroll.parameter.prepare', 'payroll.parameter.approve'], platformCapabilities: [], platformRoles: []}, expiresAt: new Date(Date.now() + 3600000).toISOString()}});
    const api = CASES.find(c => u.pathname === c.endpoint);
    if (api) { if (req.method() !== 'GET') { writes++; return route.fulfill({status: 405, json: {ok: false, error: 'Esta verificación no envía nada.'}}); } return route.fulfill({json: {ok: true, data: u.searchParams.get('period') === '2026-09' ? api.previous : reviewing ? (u.searchParams.get('resource') === 'detail' ? reviewing.detail : reviewing.boot) : api.boot}}); }
    if (u.pathname.startsWith('/api/')) return route.fulfill({status: 403, json: {ok: false, error: 'API ajena a esta prueba sintética.'}});
    const file = path.resolve(root, u.pathname.slice(1));
    if (req.method() !== 'GET' || !file.startsWith(path.join(root, 'assets') + path.sep) || !fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({status: 200, contentType: path.extname(file) === '.css' ? 'text/css' : 'text/javascript', body: fs.readFileSync(file)});
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const screens = () => page.evaluate(() => +(document.documentElement.scrollHeight / innerHeight).toFixed(2));

  for (const c of CASES) {
    const s = key => page.locator(`[data-${c.prefix}-${key}]`), panel = page.locator(c.host), tag = '«' + c.name + '»: ';
    const idle = () => page.waitForFunction(host => document.querySelector(host)?.getAttribute('aria-busy') === 'false', c.host);
    await page.setViewportSize({width: 1366, height: 900}); await page.goto(origin + '/' + c.id);
    await page.waitForFunction(prefix => window.listo === true && document.querySelector(`[data-${prefix}-target]`)?.disabled === false, c.prefix); await idle();
    await s('period').fill(period); await s('refresh').click(); await idle(); await s('content').waitFor({state: 'visible'});
    const rows = s('rows').locator('article');
    check(await rows.count() === c.shown && (await s('count').innerText()).includes(c.total + ' ' + c.noun), tag + 'la consulta trae el conjunto completo con ' + c.shown + ' renglones');
    check(await s('rows').locator('details[open]').count() === 0 && await s('rows').locator('input:visible, select:visible').count() === 0, tag + 'los renglones llegan plegados');
    check((await rows.first().locator('summary span').innerText()) === c.closed, tag + 'cada renglón dice lo declarado sin abrirlo');
    const length = await screens(); check(length <= c.budget, tag + 'con datos la pantalla mide ' + length + ' pantallas (tope ' + c.budget + ')');
    await panel.screenshot({path: path.join(output, c.id + '-consulta.png')});

    await rows.first().locator('summary').click(); const field = rows.first().getByLabel(c.edit.label, {exact: true});
    check(await field.isVisible(), tag + 'al abrir un renglón aparecen sus campos');
    await field.fill(c.edit.value);
    check((await rows.first().locator('summary span').innerText()) === c.edited, tag + 'el renglón refleja lo cargado al instante');
    await panel.getByText(/^Usar una constancia común/).click(); await s('common-date').fill(period + '-01'); await s('common-reference').fill('Constancia común exclusivamente sintética QA'); await s('evidence').click();
    check(await rows.first().locator('details').evaluate(d => d.open) && await rows.first().getByLabel(c.edit.label, {exact: true}).inputValue() === c.edit.value, tag + 'el renglón abierto sigue abierto y con su valor después de aplicar la constancia común');

    await s('reason').fill('Carga exclusivamente sintética para medir la pantalla'); await s('prepare').click(); await idle(); await s('comparison').waitFor({state: 'visible'});
    check(await s('rows').isHidden() && await s('search').isHidden() && await s('prev').isHidden() && await rows.count() === c.shown, tag + 'mientras se compara, el listado se retira de la vista sin perderse');
    check(await page.evaluate(prefix => { const top = document.querySelector(`[data-${prefix}-comparison]`).getBoundingClientRect().top; return top >= -1 && top < innerHeight / 2; }, c.prefix), tag + 'la comparación queda a la vista sin tener que buscarla');
    const cards = s('diff').locator('article');
    check(await cards.count() === Math.min(c.perPage, c.total) && (await s('diff-count').innerText()).startsWith(c.total + ' filas con diferencias'), tag + 'la comparación abarca todo el conjunto, de a ' + c.perPage);
    check((await cards.first().locator('dt').allInnerTexts()).join('|') === c.changed && (await cards.nth(1).locator('dt').allInnerTexts()).join('|') === c.unchanged, tag + 'cada tarjeta lista lo que cambia');
    const comparing = await screens(); check(comparing <= c.budget + 0.8, tag + 'comparando mide ' + comparing + ' pantallas');
    const inView = key => page.evaluate(([prefix, k]) => { const r = document.querySelector(`[data-${prefix}-${k}]`).getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight; }, [c.prefix, key]);
    check(await inView('confirm') && await inView('send'), tag + 'al comparar, el tilde «Revisé…» y el botón quedan a la vista sin bajar');
    await page.mouse.wheel(0, 700); await page.waitForTimeout(150); check(await inView('confirm') && await inView('send'), tag + 'y siguen a la vista mientras se recorre la comparación');
    check(await s('send').isDisabled() && writes === 0, tag + 'no se registra nada sin confirmar');
    await panel.screenshot({path: path.join(output, c.id + '-comparacion.png')});
    await s('back').click();
    check(await s('comparison').isHidden() && await s('rows').isVisible() && await rows.first().locator('details').evaluate(d => d.open), tag + '«Cerrar la comparación y volver» devuelve el listado como estaba');

    for (const width of [390, 320]) { await page.setViewportSize({width, height: 844}); check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), tag + 'sin desborde horizontal a ' + width + 'px');
      check(await page.evaluate(host => [...document.querySelectorAll(host + ' button,' + host + ' summary')].filter(e => e.getBoundingClientRect().height > 0).every(e => e.getBoundingClientRect().height >= 44), c.host), tag + 'botones y renglones de 44px o más a ' + width + 'px'); }
    await rows.first().locator('summary').click(); const phone = await screens(); check(phone <= (c.id === 'condiciones' ? 7.5 : 4.5), tag + 'en el teléfono, plegada, mide ' + phone + ' pantallas');
    await panel.screenshot({path: path.join(output, c.id + '-telefono.png')});

    // Quien revisa: la decisión se compara y se confirma sin tener que buscar el tilde ni el motivo de un aviso.
    const detail = await c.detail(), reviewBoot = structuredClone(c.boot); reviewBoot.proposals = [detail.proposal]; reviewBoot.permissions = {canPropose: false, canReview: true}; reviewing = {boot: reviewBoot, detail};
    await page.setViewportSize({width: 1366, height: 900}); await page.goto(origin + '/' + c.id);
    await page.waitForFunction(prefix => window.listo === true && document.querySelector(`[data-${prefix}-target]`)?.disabled === false, c.prefix); await idle();
    await s('period').fill(period); await s('refresh').click(); await idle(); await s('content').waitFor({state: 'visible'});
    check(await s('pending').isVisible() && (await s('pending-text').innerText()).startsWith('Hay una propuesta esperando tu revisión: '), tag + 'al consultar, quien revisa ve arriba que hay una propuesta esperándolo');
    await s('pending').screenshot({path: path.join(output, c.id + '-pendiente.png')});
    await s('pending-open').click(); await idle();
    check(await s('proposal').inputValue() === detail.proposal.id && await s('comparison').isVisible() && await page.evaluate(prefix => { const r = document.querySelector(`[data-${prefix}-decision-fields]`).getBoundingClientRect(); return r.top >= -1 && r.top < innerHeight / 2; }, c.prefix) && !(await s('decision-fields').evaluate(e => e.disabled)), tag + '«Revisar ahora» abre la propuesta y deja a la vista dónde se decide');
    const note = s('review-note');
    check((await note.innerText()).startsWith('Al comparar se abre la revisión completa') && await s('confirm').isHidden(), tag + 'antes de comparar, la pantalla dice qué va a pasar y no muestra un tilde suelto');
    await s('example').click(); check((await note.innerText()) === 'Elegí primero la decisión.' && await s('decision-reason').inputValue() === '', tag + 'sin decisión no hay ejemplo que cargar, y se avisa');
    await s('review').click(); check((await note.innerText()) === 'Elegí primero la decisión.' && await note.evaluate(e => e.getBoundingClientRect().top < innerHeight), tag + 'sin decisión, el aviso aparece al lado del botón');
    await s('decision').selectOption('approve'); check(await s('comparison').isVisible() && await s('confirm').isHidden(), tag + 'al elegir la decisión, el contenido de la propuesta sigue a la vista');
    await s('review').click(); check((await note.innerText()).startsWith('Escribí el fundamento de la decisión'), tag + 'sin fundamento, el aviso dice qué falta');
    await s('example').click(); const sample = await s('decision-reason').inputValue();
    check(/^Aprobado por revisión independiente de .+ de octubre de 2026$/.test(sample) && (await s('decision-reason').getAttribute('placeholder')) === 'Ejemplo: ' + sample, tag + '«Usar el ejemplo» carga un fundamento válido, el mismo que se lee en gris');
    await s('review').click(); await idle(); check(await s('comparison').isVisible() && await inView('confirm'), tag + 'con el ejemplo, «Comparar decisión» abre la revisión al primer intento');
    await s('decision-reason').fill('a <b> c exclusivamente sintético'); await s('review').click(); check((await note.innerText()) === 'El fundamento no admite los signos < ni >.', tag + 'un signo que el registro no admite se avisa al lado del botón');
    await s('decision-reason').fill('  Revisión independiente\nexclusivamente sintética QA \n'); await s('review').click(); await idle(); await s('comparison').waitFor({state: 'visible'});
    check(await s('decision-reason').inputValue() === 'Revisión independiente exclusivamente sintética QA', tag + 'un Enter o un espacio de más en el fundamento se limpian solos y la revisión se abre');
    check(await inView('confirm') && await inView('send') && c.approve.test(await s('send').innerText()), tag + 'al comparar la decisión, el tilde y «Aprobar…» quedan a la vista');
    await page.mouse.wheel(0, 700); await page.waitForTimeout(150); check(await inView('confirm') && await inView('send'), tag + 'el tilde y «Aprobar…» acompañan la revisión hasta el final');
    check(await s('send').isDisabled(), tag + 'no se puede aprobar sin tildar');
    await s('confirm').check(); check(await s('send').isEnabled() && writes === 0, tag + 'con el tilde se habilita aprobar, y nada se envió todavía');
    await panel.screenshot({path: path.join(output, c.id + '-revision.png')});
    await s('decision-reason').fill('Otro fundamento exclusivamente sintético QA');
    check(await s('comparison').isVisible() && await s('confirm').isHidden() && await s('send').isHidden() && (await note.innerText()).startsWith('Cambiaste la decisión o el fundamento'), tag + 'si cambia el fundamento, se retira la confirmación y la pantalla dice que hay que volver a comparar');
    reviewing = null;

    // Cada mes se parte de lo aprobado el mes anterior, en vez de cargar todo de nuevo.
    await page.goto(origin + '/' + c.id); await page.waitForFunction(prefix => window.listo === true && document.querySelector(`[data-${prefix}-target]`)?.disabled === false, c.prefix); await idle();
    await s('period').fill(period); await s('refresh').click(); await idle(); await s('content').waitFor({state: 'visible'});
    check((await s('carry').innerText()) === 'Traer lo aprobado en septiembre de 2026' && await s('pending').isHidden(), tag + 'quien prepara ve de qué mes puede traer lo aprobado');
    await s('carry').click(); await idle();
    check((await s('status').innerText()) === c.carried, tag + 'al traerlo, la pantalla dice cuántas filas vinieron y cuáles quedaron como estaban');
    check((await rows.first().locator('summary span').innerText()) !== c.closed && await s('comparison').isHidden() && writes === 0, tag + 'lo traído queda en el borrador, a la vista, y nada se registró');
  }
  assert.equal(writes, 0); assert.deepEqual(errors, []);
  const report = {passed: true, checks: checks.length, names: checks, syntheticOnly: true, municipalApisCalled: 0, writes: 0};
  fs.writeFileSync(path.join(output, 'resultado.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({passed: true, checks: checks.length}));
} finally { await browser.close(); }
