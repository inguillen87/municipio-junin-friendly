// Pantalla propuesta de «Asignaciones familiares del período» en un navegador real, contra un servidor sintético en
// memoria que respeta el contrato del modelo (consulta completa, propuesta, mismo intento, detalle y decisión de otra
// persona). Sin API municipal, sin SQL, sin sesión real y sin datos de personas: todo es ficticio.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID, createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {FAMILY_PAYROLL_FACTS_VERSION, familyPayrollFactsCommand, familyPayrollFactsHash, familyPayrollFactsBootstrap} from '../assets/own-contract-family-payroll-facts-model.js';
import {familyFactsDraft, familyFactsCsv, familyFactsFile} from '../assets/own-contract-family-payroll-facts-workspace.js';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'verification', 'own-contract-family-payroll-facts'); fs.mkdirSync(output, {recursive: true});
const origin = 'https://family-facts.invalid', endpoint = '/api/internal-own-contract-family-payroll-facts', period = '2026-10', count = 37;
const checks = [], errors = [], writes = [];
const check = (ok, name) => { assert.ok(ok, name); checks.push(name); };
const uuid = (prefix, n) => prefix + '000000-0000-4000-8000-' + n.toString(16).padStart(12, '0');
const sha = text => createHash('sha256').update(text).digest('hex');
const READ = ['workforce.employee.read', 'payroll.parameter.read', 'payroll.calculation.nominal.read'];
const actors = {maker: {id: 'qa-maker', email: 'preparador@example.invalid', caps: [...READ, 'payroll.parameter.prepare']}, checker: {id: 'qa-checker', email: 'revisora@example.invalid', caps: [...READ, 'payroll.parameter.approve']}};
const tenant = uuid('50', 1), scopeVersion = sha('scope'), sourceVersion = sha('source');
const subjects = Array.from({length: count}, (_, i) => ({contractId: uuid('30', i + 1), registrationId: uuid('40', i + 1), legajo: 'QA-' + (i + 1), employeeName: 'Agente exclusivamente sintético ' + (i + 1), identityToken: sha('identidad'), sourceCutoff: null, origin: 'MUNICONTROL', registeredAt: '2026-09-01T12:00:00Z'}));
const server = {actor: actors.maker, configuration: {version: sha('base-0'), revision: 0, items: [], proposalId: null, approvalId: null}, proposals: [], attempts: new Map(), drop: false};
const summary = (p, actor) => ({id: p.id, requestSha256: p.requestSha256, baseVersion: p.body.baseVersion, sourceVersion: p.body.sourceVersion, itemCount: p.body.items.length, reason: p.body.reason, createdAt: p.createdAt, authorLabel: 'Preparador exclusivamente sintético', canReview: p.status === 'pending' && actor !== p.author, status: p.status, decision: p.decision});
const bootstrap = () => ({version: FAMILY_PAYROLL_FACTS_VERSION, period, scopeVersion, source: {version: sourceVersion, subjects}, configuration: server.configuration, proposals: server.proposals.map(p => summary(p, server.actor)), permissions: {canPropose: server.actor.caps.includes('payroll.parameter.prepare'), canReview: server.actor.caps.includes('payroll.parameter.approve')}, complete: true, payrollCalculated: false, payrollPosted: false});
async function command(key, body) {
  if (server.attempts.has(key)) return {...server.attempts.get(key), replayed: true};
  familyPayrollFactsCommand(body); const requestSha256 = await familyPayrollFactsHash(body); let receipt;
  if (body.command === 'propose') {
    assert.ok(server.actor.caps.includes('payroll.parameter.prepare')); const id = randomUUID();
    server.proposals.push({id, body, requestSha256, author: server.actor, status: 'pending', decision: null, createdAt: new Date().toISOString(), baseItems: structuredClone(server.configuration.items)});
    receipt = {version: FAMILY_PAYROLL_FACTS_VERSION, eventId: id, proposalId: id, requestKey: key, requestSha256, body, status: 'pending', revision: server.configuration.revision, configurationVersion: server.configuration.version, replayed: false, payrollCalculated: false, payrollPosted: false};
  } else {
    const p = server.proposals.find(x => x.id === body.proposalId); assert.ok(p && p.status === 'pending' && p.author !== server.actor && server.actor.caps.includes('payroll.parameter.approve'), 'la decisión es de otra persona');
    const approved = body.command === 'approve'; if (approved) server.configuration = {version: sha('base-' + (server.configuration.revision + 1)), revision: server.configuration.revision + 1, items: structuredClone(p.body.items), proposalId: p.id, approvalId: randomUUID()};
    p.status = approved ? 'approved' : 'rejected'; p.decision = {command: body.command, reason: body.reason, actorLabel: 'Revisora exclusivamente sintética', recordedAt: new Date().toISOString(), revision: server.configuration.revision};
    receipt = {version: FAMILY_PAYROLL_FACTS_VERSION, eventId: randomUUID(), proposalId: p.id, requestKey: key, requestSha256, body, status: p.status, revision: server.configuration.revision, configurationVersion: server.configuration.version, replayed: false, payrollCalculated: false, payrollPosted: false};
  }
  server.attempts.set(key, receipt); return receipt;
}
const html = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QA sintético · asignaciones familiares</title>
<body style="margin:0;font:16px system-ui;background:#f4f7f6"><main style="max-width:1180px;margin:0 auto;padding:16px"><div id="host"></div></main>
<script type="module">import {mountOwnContractFamilyPayrollFacts} from '/assets/own-contract-family-payroll-facts-panel.js';
mountOwnContractFamilyPayrollFacts(document.getElementById('host'));document.dispatchEvent(new CustomEvent('taskchange',{detail:{id:'familia'}}));window.listo=true;</script></body></html>`;

const browser = await chromium.launch({headless: true});
try {
  const context = await browser.newContext({viewport: {width: 1366, height: 900}, locale: 'es-AR', reducedMotion: 'reduce', serviceWorkers: 'block', acceptDownloads: true});
  await context.route('**/*', async route => {
    const req = route.request(), u = new URL(req.url());
    if (u.origin !== origin) return route.abort();
    if (u.pathname === '/') return route.fulfill({status: 200, contentType: 'text/html', body: html});
    if (u.pathname === '/api/internal-auth') return route.fulfill({json: {ok: true, authenticated: true, sessionVersion: 2, user: {id: server.actor.id, email: server.actor.email}, access: {context: 'tenant', tenant: {id: tenant, roleKey: 'QA'}, tenantCapabilities: server.actor.caps, platformCapabilities: [], platformRoles: []}, expiresAt: new Date(Date.now() + 3600000).toISOString()}});
    if (u.pathname === endpoint) {
      if (req.method() === 'POST') {
        const key = req.headers()['idempotency-key'], body = JSON.parse(req.postData()).payload, receipt = await command(key, body); writes.push({key, command: body.command});
        if (server.drop) { server.drop = false; return route.fulfill({status: 503, json: {ok: false, error: 'Respuesta sintética interrumpida después de conservar la operación.'}}); }
        return route.fulfill({json: {ok: true, data: receipt}});
      }
      const resource = u.searchParams.get('resource');
      if (resource === 'bootstrap' && u.searchParams.get('period') === period) return route.fulfill({json: {ok: true, data: bootstrap()}});
      if (resource === 'attempt') { const receipt = server.attempts.get(u.searchParams.get('key')); return receipt ? route.fulfill({json: {ok: true, data: {...receipt, replayed: true}}}) : route.fulfill({status: 404, json: {ok: false, code: 'FAMILY_PAYROLL_FACTS_NOT_FOUND', error: 'El intento no está registrado.'}}); }
      if (resource === 'detail') { const p = server.proposals.find(x => x.id === u.searchParams.get('id')); if (!p) return route.fulfill({status: 404, json: {ok: false, error: 'Propuesta inexistente.'}}); return route.fulfill({json: {ok: true, data: {version: FAMILY_PAYROLL_FACTS_VERSION, period, scopeVersion, proposal: summary(p, server.actor), body: p.body, baseItems: p.baseItems, source: {version: sourceVersion, subjects}, current: p.body.baseVersion === server.configuration.version}}}); }
      return route.fulfill({status: 400, json: {ok: false, error: 'Consulta sintética no admitida.'}});
    }
    if (u.pathname.startsWith('/api/')) return route.fulfill({status: 403, json: {ok: false, error: 'API ajena a esta prueba sintética.'}});
    const file = path.resolve(root, u.pathname.slice(1));
    if (req.method() !== 'GET' || !file.startsWith(path.join(root, 'assets') + path.sep) || !fs.existsSync(file)) return route.fulfill({status: 404, body: ''});
    return route.fulfill({status: 200, contentType: path.extname(file) === '.css' ? 'text/css' : 'text/javascript', body: fs.readFileSync(file)});
  });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/503|404/.test(m.text())) errors.push(m.text()); });
  const s = key => page.locator('[data-family-facts-' + key + ']'), panel = page.locator('.own-family-facts');
  const idle = () => page.waitForFunction(() => document.querySelector('.own-family-facts')?.getAttribute('aria-busy') === 'false');
  const open = async actor => { server.actor = actor; await page.goto('about:blank'); await page.goto(origin + '/'); await page.waitForFunction(() => window.listo === true && document.querySelector('[data-family-facts-target]')?.disabled === false); await idle(); };
  const consult = async () => { await s('period').fill(period); await s('refresh').click(); await idle(); await s('content').waitFor({state: 'visible'}); };
  const screens = () => page.evaluate(() => +(document.documentElement.scrollHeight / innerHeight).toFixed(2));

  // 1. Consulta completa y forma de la pantalla
  await open(actors.maker); await consult();
  check((await s('count').innerText()).includes(count + ' contratos') && await s('rows').locator('details').count() === 10, 'la consulta trae el conjunto completo y muestra diez personas plegadas por página');
  check((await s('current').innerText()) === 'Sin revisión aprobada para este período.', 'sin aprobación previa lo dice con todas las letras');
  check(await s('totals').locator('article').count() === 12 && (await s('totals').locator('article').first().innerText()).includes(count + ' sin informar'), 'el resumen arranca con las doce asignaciones enteras sin informar');
  check(await screens() <= 2.3, 'con las personas plegadas y de a diez, la pantalla completa no pasa de dos pantallas y un cuarto');
  check(writes.length === 0, 'consultar no registra nada');
  await panel.screenshot({path: path.join(output, 'consulta.png')});

  // 2. Cargar a una persona: sin informar, cero y cantidad son tres cosas
  const first = s('rows').locator('details').first(); await first.locator('summary').click();
  const input = label => first.getByLabel(label, {exact: true});
  check((await first.locator('summary span').innerText()) === '0 con cantidad · 0 en cero · 12 sin informar' && await first.locator('input').count() === 17, 'cada persona tiene sus doce cantidades, ajuste, región, promedio, fecha y constancia');
  await input('Hijos').fill('2'); await input('Cónyuge').fill('0'); await input('Escolaridad primaria').fill('1');
  check((await first.locator('summary span').innerText()) === '2 con cantidad · 1 en cero · 9 sin informar', 'el renglón de la persona cuenta por separado cantidad, cero y sin informar');
  const hijos = s('totals').locator('[data-family-facts-total="children"]');
  check((await hijos.innerText()).includes('1 con cantidad (2 en total) · 0 en cero · ' + (count - 1) + ' sin informar') && (await s('totals').locator('[data-family-facts-total="spouse"]').innerText()).includes('1 en cero'), 'el resumen del conjunto se actualiza al cargar');
  await first.screenshot({path: path.join(output, 'persona.png')});

  // 3. Constancia común y búsqueda (la búsqueda no recorta el conjunto)
  await panel.getByText('Usar una constancia común para todas las filas', {exact: true}).click();
  await s('common-date').fill(period + '-01'); await s('common-reference').fill('Constancia común exclusivamente sintética QA'); await s('evidence').click();
  check((await s('status').innerText()).includes('Constancia aplicada a ' + count + ' filas'), 'la constancia común se aplica al conjunto completo sin tocar cantidades');
  await s('search').fill('QA-37'); check(await s('rows').locator('details').count() === 1 && (await s('count').innerText()).startsWith('1 visibles'), 'la búsqueda encuentra a una persona de la última página');
  await s('search').fill('no existe'); check(await s('rows').locator('details').count() === 0, 'una búsqueda sin resultados no borra nada');

  // 4. Planilla completa: se descarga entera aunque la búsqueda no muestre a nadie, y vuelve igual
  await panel.getByText('Trabajar con una planilla completa', {exact: true}).click();
  const downloading = page.waitForEvent('download'); await s('download').click(); const file = await downloading, csvPath = path.join(output, 'planilla-sintetica.csv'); await file.saveAs(csvPath); await idle();
  const csv = fs.readFileSync(csvPath, 'utf8'), expected = familyFactsDraft(familyPayrollFactsBootstrap(bootstrap()));
  for (const row of expected) { row.definition.asOfDate = period + '-01'; row.definition.documentReference = 'Constancia común exclusivamente sintética QA'; }
  Object.assign(expected[0].definition.quantities, {children: '2', spouse: '0', primary: '1'});
  check(file.suggestedFilename() === 'asignaciones-familiares-' + period + '.csv' && JSON.stringify(familyFactsFile(bootstrap(), csv)) === JSON.stringify(expected), 'la planilla descargada contiene las ' + count + ' filas con lo cargado y vuelve a leerse idéntica');
  const edited = structuredClone(expected); Object.assign(edited.at(-1).definition, {prenatalAdjustmentMonths: '2', tariffSelection: {region: '4', semesterAverage: '850000.50'}}); edited.at(-1).definition.quantities.prenatal = '1'; edited[5].definition.quantities.dependants = '3';
  const editedPath = path.join(output, 'planilla-corregida.csv'); fs.writeFileSync(editedPath, familyFactsCsv(bootstrap(), edited));
  await s('file').setInputFiles(editedPath); await s('import').click(); await idle();
  check((await s('status').innerText()).startsWith('CSV completo verificado · ' + count + ' contratos') && (await s('totals').locator('[data-family-facts-total="dependants"]').innerText()).includes('1 con cantidad (3 en total)'), 'la planilla corregida reemplaza el borrador completo y actualiza el resumen');
  const broken = path.join(output, 'planilla-incompleta.csv'); fs.writeFileSync(broken, familyFactsCsv(bootstrap(), edited).split('\r\n').slice(0, -2).join('\r\n') + '\r\n');
  await s('file').setInputFiles(broken); await s('import').click(); await idle();
  check((await s('status').innerText()).includes('no contiene el conjunto completo') && (await s('totals').locator('[data-family-facts-total="dependants"]').innerText()).includes('1 con cantidad (3 en total)'), 'una planilla incompleta se rechaza entera y el borrador queda como estaba');

  await s('search').fill('');
  // 5. Comparar y proponer: se ve sólo lo que cambia, y la respuesta perdida se recupera con el mismo intento
  await s('reason').fill('Carga exclusivamente sintética de asignaciones familiares'); await s('prepare').click(); await idle(); await s('comparison').waitFor({state: 'visible'});
  check((await s('diff-count').innerText()).startsWith(count + ' filas con diferencias') && await s('diff').locator('article').count() === 6, 'la comparación abarca todo el conjunto, de a seis');
  const firstDiff = s('diff').locator('article').first();
  check((await firstDiff.innerText()).includes('Sin declaración en este conjunto.') && (await firstDiff.locator('dt').allInnerTexts()).join('|') === 'Cónyuge|Hijos|Escolaridad primaria|Fecha|Constancia', 'cada persona muestra sólo los datos declarados, no las doce casillas');
  check(await s('send').isDisabled(), 'no se puede registrar sin confirmar la revisión');
  check(await s('fields').isHidden() && await s('totals').isHidden() && await page.evaluate(() => document.querySelector('[data-family-facts-comparison]').getBoundingClientRect().top < innerHeight) && await screens() <= 2.3, 'mientras se revisa la comparación, la preparación se retira y la pantalla sigue corta');
  await s('back').click(); check(await s('comparison').isHidden() && await s('fields').isVisible() && await s('rows').locator('details').count() === 10, 'cerrar la comparación devuelve la preparación tal como estaba');
  await s('prepare').click(); await idle(); await s('comparison').waitFor({state: 'visible'});
  await panel.screenshot({path: path.join(output, 'comparacion.png')});
  await s('confirm').check(); server.drop = true; await s('send').click(); await idle();
  check(writes.length === 1 && server.proposals.length === 1 && await s('recover').isVisible() && await s('fields').evaluate(e => e.disabled), 'si se pierde la respuesta, el intento queda retenido y el formulario bloqueado');
  await s('recover').click(); await idle();
  check(writes.length === 1 && (await s('receipt').innerText()).startsWith('Pendiente de revisión · período ' + period), 'consultar el mismo intento recupera el comprobante sin enviar de nuevo');
  check(JSON.stringify(server.proposals[0].body.items) === JSON.stringify(edited) && server.configuration.revision === 0, 'la propuesta conserva las ' + count + ' filas exactas y todavía no aprueba nada');

  // 6. Quien preparó no decide; otra persona revisa y aprueba
  await s('new').click(); await consult(); await panel.getByText('Propuestas y decisiones anteriores', {exact: true}).click();
  await s('proposal').selectOption(server.proposals[0].id); await s('open').click(); await idle();
  check(await s('decision-fields').evaluate(e => e.disabled), 'quien preparó la propuesta no puede decidirla');
  await open(actors.checker); await consult();
  check(await s('fields').evaluate(e => e.disabled), 'la revisora no prepara: sólo revisa');
  await panel.getByText('Propuestas y decisiones anteriores', {exact: true}).click(); await s('proposal').selectOption(server.proposals[0].id); await s('open').click(); await idle();
  check((await s('detail').innerText()).includes('Fuente y revisión vigentes.') && (await s('diff-count').innerText()).startsWith(count + ' diferencias'), 'la revisora abre la propuesta completa con su comparación');
  while (await s('diff-next').isEnabled()) await s('diff-next').click();
  const lastDiff = s('diff').locator('article').last();
  check((await s('diff-page').innerText()) === 'Cambios · página 7 de 7' && (await lastDiff.locator('dt').allInnerTexts()).join('|') === 'Prenatal|Meses de ajuste prenatal|Región|Promedio semestral|Fecha|Constancia' && (await lastDiff.innerText()).includes('850000.50'), 'la última página muestra el ajuste prenatal, la región y el promedio exacto de la última persona');
  await s('decision').selectOption('approve'); await s('decision-reason').fill('Revisión independiente exclusivamente sintética'); await s('review').click(); await idle();
  await s('confirm').check(); await s('send').click(); await idle();
  check(writes.length === 2 && (await s('receipt').innerText()).startsWith('Aprobada · período ' + period) && server.configuration.revision === 1 && JSON.stringify(server.configuration.items) === JSON.stringify(edited), 'la aprobación de otra persona deja la revisión 1 con el contenido exacto');
  await s('new').click(); await consult();
  check((await s('current').innerText()) === 'Revisión aprobada 1 · ' + count + ' contratos declarados.' && (await s('totals').locator('[data-family-facts-total="children"]').innerText()).includes('1 con cantidad (2 en total)'), 'una consulta nueva muestra la revisión aprobada y su resumen');

  // 7. Teléfono
  for (const width of [390, 320]) {
    await page.setViewportSize({width, height: 844});
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'sin desborde horizontal a ' + width + 'px');
    check(await page.evaluate(() => [...document.querySelectorAll('.own-family-facts button, .own-family-facts summary')].filter(e => e.getBoundingClientRect().height > 0).every(e => e.getBoundingClientRect().height >= 44)), 'botones y renglones de 44px o más a ' + width + 'px');
  }
  await s('rows').locator('details').first().locator('summary').click(); await panel.screenshot({path: path.join(output, 'telefono.png')});
  assert.deepEqual(errors, []);
  const report = {passed: true, checks: checks.length, names: checks, syntheticOnly: true, municipalApisCalled: 0, sqlUsed: false, rows: count};
  fs.writeFileSync(path.join(output, 'resultado.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({passed: true, checks: checks.length}));
} finally { await browser.close(); }
