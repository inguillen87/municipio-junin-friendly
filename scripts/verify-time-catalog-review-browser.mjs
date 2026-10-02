// Local operator UI + real HTTP handler. SQL is a synthetic stand-in; this
// script never contacts municipal databases, GRH, collectors or Vercel.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createTimeCatalogHandler} from '../api/internal-time-catalog.js';
import {principal as initialPrincipal, session, record, command, payload, sqlText, flags} from '../tests/fixtures/time-catalog-synthetic.js';
import {parseTimeCatalogSqlJson,normalizeTimeCatalogSqlJson} from '../lib/time-catalog-json.js';
const checks = [], saved = new Map(), writes = [], records = new Map(), payloads = new Map(), errors = [];
const id = n => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;
for (let n = 1; n <= 33; n++) {
  const kind = n === 31 ? 'calendar' : n === 32 ? 'shift' : n === 33 ? 'assignment' : 'rule_profile';
  const p = payload(kind);
  if (kind === 'shift') p.spec.intervals = [
    {day: 7, sequence: 1, kind: 'work', start: '22:00:00', end: '23:00:00', crossesMidnight: false},
    {day: 7, sequence: 2, kind: 'break', start: '23:00:00', end: '23:15:00', crossesMidnight: false},
    {day: 7, sequence: 3, kind: 'work', start: '23:15:00', end: '02:00:00', crossesMidnight: true},
  ];
  const r = record(command({kind, payload: p})); r.id = id(n); records.set(r.id, r); payloads.set(r.id,p);
}
const caps = role => ['time.catalog.read', ...(role === 'proposer' ? ['time.catalog.propose'] : role === 'approver' ? ['time.catalog.approve', 'time.catalog.audit.read'] : []),...(nominalAllowed?['workforce.employee.read']:[])];
let role = 'proposer', allowed = true, dropNext = false, invalidList = false, scope = 'b'.repeat(64), paused = null, nominalAllowed = false;
const principal = () => ({...initialPrincipal, tenant: {...initialPrincipal.tenant, effectiveCapabilities: caps(role)}});
const sqlPrincipal = () => ({roleKey: 'QA_' + role.toUpperCase(), authorityVersion: 1, capabilities: caps(role).filter(c=>c.startsWith('time.catalog.')), areaScopes: [], scopeVersion: scope,assignmentReadAllowed:nominalAllowed});
const sql = {async query(query, values) {
  if (query.includes('apply_command')) {
    writes.push({values: [...values]}); if (values[15] !== scope) return [];
    const previous = saved.get(values[10]);
    if (previous) { assert.equal(previous.requestSha256, values[11]); return [{result: sqlText({...previous, replayed: true, historical: false})}]; }
    const before = records.get(values[8]), isDraft=['create_draft','update_draft'].includes(values[6]);
    if(values[6]!=='create_draft')assert.equal(before.version, values[9]);
    const p=isDraft?normalizeTimeCatalogSqlJson(parseTimeCatalogSqlJson(values[12])):null;
    const next = isDraft?record(command({command:values[6],kind:values[7],payload:p,id:values[8],expectedVersion:values[9],reasonCode:values[13]}))
      : {...structuredClone(before), version: before.version + 1, reasonCode: values[13],status: ({submit: 'submitted', approve: 'approved', reject: 'rejected', retire: 'retired'})[values[6]]};
    if(values[6]==='create_draft')next.id=id(100+saved.size);
    if(isDraft)payloads.set(next.id,p);
    records.set(next.id, next);
    const ack = {data: next, replayed: false, requestSha256: values[11], attemptKey: values[10], ...flags}; saved.set(values[10], ack);
    return [{result: sqlText(ack)}];
  }
  if (query.includes('time_catalog_list')) {
    const rows = [...records.values()].filter(r => (!values[6] || r.kind === values[6]) && (!values[7] || r.status === values[7]));
    const selected = rows.slice(values[9], values[9] + values[8]); if (invalidList) selected.pop();
    return [{result: sqlText({principal: sqlPrincipal(), records: selected, page: {limit: values[8], offset: values[9], total: rows.length, hasMore: values[9] + values[8] < rows.length}})}];
  }
  if (query.includes('time_catalog_detail')) {
    const r=records.get(values[6]), own=r.status==='draft'&&role==='proposer'&&(r.kind!=='assignment'||nominalAllowed),p=payloads.get(r.id);
    const assignment=r.kind==='assignment'&&nominalAllowed?{target:{contractId:p.spec.employmentContractId,legajo:'900021',name:'Contrato sintético 21'},shift:records.get(p.spec.shiftEntryId),calendar:records.get(p.spec.calendarEntryId),ruleProfile:records.get(p.spec.ruleProfileEntryId)}:null;
    return [{result: sqlText({principal: sqlPrincipal(), record:r,editPayload:own?p:null,assignment,allowedCommands:r.kind==='assignment'&&!nominalAllowed?[]:own?['update_draft','submit']:r.status==='submitted'&&role==='approver'?['approve','reject']:r.status==='approved'&&role==='approver'?['retire']:[],timeline: [], auditAvailable: role === 'approver', timelineLimit: 100})}];
  }
  const all = [...records.values()], count = kind => all.filter(r => r.kind === kind&&r.status==='approved').length;
  return [{result: sqlText({principal: sqlPrincipal(), summary: {calendar: count('calendar'), shift: count('shift'), ruleProfile: count('rule_profile'), assignment: count('assignment'), submitted: all.filter(r => r.status === 'submitted').length}, ...flags})}];
}};
let origin, handler;
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin);
    if (url.pathname === '/api/internal-auth') {
      res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ok: true, authenticated: true, access: {tenantCapabilities: allowed ? caps(role) : [], platformCapabilities: [], platformRoles: []}}));
    }
    if(url.pathname==='/api/internal-data'){
      res.setHeader('Content-Type','application/json');
      if(!allowed||!nominalAllowed){res.statusCode=403;return res.end(JSON.stringify({ok:false,code:'TIME_CATALOG_FORBIDDEN',error:'Acceso retirado.'}));}
      const page=Number(url.searchParams.get('page'));const rows=Array.from({length:21},(_,i)=>({contractId:id(300+i+1),legajo:String(900001+i),nombre:'Contrato sintético '+(i+1),sector:null,convenio:null,activo:true,statusSnapshotDate:'2026-10-02'}));
      return res.end(JSON.stringify({ok:true,version:'employee-picker.v1',data:rows.slice((page-1)*20,page*20),pagination:{page,limit:20,total:21,pages:2},scope:{status:'administrative_active',payrollEligibilityCertified:false,sourceCutoffFrom:null,sourceCutoffTo:null}}));
    }
    if (url.pathname === '/api/internal-time-catalog') {
      req.query = Object.fromEntries(url.searchParams);
      res.status = n => { res.statusCode = n; return res; };
      res.json = value => {
        if (req.method === 'POST' && dropNext) {
          // The synthetic write already happened. Lose its receipt behind a
          // 503 response, without depending on Chrome's socket-level retries.
          dropNext = false; res.statusCode = 503; res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ok: false, code: 'TIME_CATALOG_UNAVAILABLE', error: 'No se recibió el acuse sintético.'})); return res;
        }
        res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); return res;
      };
      if (paused && url.searchParams.get('resource') === 'detail') await paused;
      return await handler(req, res);
    }
    const target = path.resolve('public', '.' + decodeURIComponent(url.pathname));
    assert.ok(target.startsWith(path.resolve('public') + path.sep));
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) { res.statusCode = 404; return res.end(); }
    res.setHeader('Content-Type', target.endsWith('.js') ? 'text/javascript' : target.endsWith('.css') ? 'text/css' : target.endsWith('.svg') ? 'image/svg+xml' : 'text/html');
    res.end(fs.readFileSync(target));
  } catch (e) { errors.push(e.message); if (!res.headersSent) res.statusCode = 500; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${server.address().port}`;
handler = createTimeCatalogHandler({env: {INTERNAL_APP_ORIGIN: origin}, sessionFor: () => session, getSql: async () => sql,
  requireAccess: async (_req, res) => { if (!allowed) { res.status(403).json({ok: false, code: 'TIME_CATALOG_FORBIDDEN', error: 'Acceso retirado.'}); return null; } return {mode: 'managed', principal: principal()}; }});
const reportDir = path.resolve('verification'); fs.mkdirSync(reportDir, {recursive: true});
const browser = await chromium.launch({headless: true, ...(process.env.TIME_CATALOG_QA_HEADLESS_EXECUTABLE ? {executablePath: process.env.TIME_CATALOG_QA_HEADLESS_EXECUTABLE} : {})});
try {
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, locale: 'es-AR', timezoneId: 'UTC'}), page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const external = [], sends = []; context.on('request', r => {
    if (new URL(r.url()).origin !== origin) external.push(r.url());
    if (r.method() === 'POST') sends.push({body: r.postData(), key: r.headers()['idempotency-key']});
  });
  const load = async () => { await page.goto(origin + '/catalogo-tiempo.html'); await page.locator('#workspace').waitFor({state: 'visible'}); };
  const filter = async kind => { await page.locator('#kind').selectOption(kind); await page.locator('#filters button').click(); await page.waitForFunction(kind => document.querySelector('#records .record strong')?.textContent === ({shift:'Turno', calendar:'Calendario', rule_profile:'Reglas', assignment:'Asignación'})[kind], kind); };
  await load(); assert.match(await page.locator('#pageCount').innerText(), /1–25 de 33/);
  await page.getByRole('button', {name: 'Siguiente', exact: true}).click(); await page.waitForFunction(() => document.querySelector('#pageCount').textContent.includes('26–33'));
  assert.equal(await page.locator('#records .record').count(), 8); checks.push('complete multi-page global counts, no dropped records');
  const withdrawn = [...records.values()].slice(24); withdrawn.forEach(r => records.delete(r.id));
  await page.locator('#refresh').click(); await page.waitForFunction(() => document.querySelector('#pageCount').textContent.includes('0 en esta página'));
  assert.match(await page.locator('#pageCount').innerText(), /24 configuraciones en el filtro/); assert.equal(await page.locator('#next').isDisabled(), true);
  await page.getByRole('button', {name: 'Anterior', exact: true}).click(); await page.waitForFunction(() => document.querySelector('#pageCount').textContent.includes('1–24'));
  withdrawn.forEach(r => records.set(r.id, r)); checks.push('a concurrently emptied later page preserves its real total and back navigation');
  await filter('rule_profile'); await page.locator('#records button').first().click(); await page.locator('#detail').waitFor({state: 'visible'});
  assert.match(await page.locator('#configuration').innerText(), /99999999999999\.123456/); assert.match(await page.locator('#configuration').innerText(), /999999999999999999/); assert.match(await page.locator('#configuration').innerText(), /No · Unidad/);
  assert.match(await page.locator('#facts').innerText(), /01\/10\/2026/); assert.doesNotMatch(await page.locator('#detail').innerText(), /qa@example|aaaaaaaa-|11111111-|employmentContractId/);
  checks.push('exact parameters, explicit false and civil dates in UTC browser'); await page.locator('#closeDetail').click();
  await filter('calendar'); await page.locator('#records button').click(); await page.locator('#detail').waitFor({state: 'visible'});
  assert.match(await page.locator('#configuration').innerText(), /12\/10\/2026 · Feriado/); assert.match(await page.locator('#configuration').innerText(), /días ausentes/); checks.push('full calendar and absent days are not inferred'); await page.locator('#closeDetail').click();
  await filter('shift'); await page.locator('#records button').click(); await page.locator('#detail').waitFor({state: 'visible'});
  assert.match(await page.locator('#configuration').innerText(), /Entrada: 0 segundos/); assert.match(await page.locator('#configuration').innerText(), /23:15:00 → 02:00:00 del día siguiente/);
  assert.match(await page.locator('#configuration').innerText(), /Domingo · Tramo 2 · Pausa[\s\S]*23:00:00 → 23:15:00/);
  await page.screenshot({path: path.join(reportDir, 'native-time-ui-desktop.png'), fullPage: true}); checks.push('night shift, explicit zero tolerance and desktop screenshot');
  dropNext = true; await page.locator('#reason').fill('Preparación completa de turno sintético.'); await page.locator('#send').click(); await page.locator('#recovery').waitFor({state: 'visible'});
  assert.equal(saved.size, 1); const first = writes[0]; assert.equal(await page.locator('#reason').isDisabled(), true);
  await page.locator('#consultAttempt').click(); await page.waitForFunction(() => document.querySelector('#recoveryCopy').textContent.includes('versión registrada es 2'));
  assert.equal(saved.size, 1); assert.equal(writes.length, 1); assert.equal(await page.locator('#recovery').isVisible(), true);
  checks.push('uncertain write stays frozen after current-state consultation');
  await page.locator('#retry').click(); await page.waitForFunction(() => document.querySelector('#detailMessage').textContent.startsWith('Operación registrada'));
  assert.equal(saved.size, 1); assert.deepEqual(writes[1], first); assert.deepEqual(sends[1], sends[0]); assert.equal(await page.locator('#decision').isVisible(), false);
  checks.push('real-handler identical body/key replay, one synthetic decision');
  role = 'approver'; await load(); await filter('shift'); await page.locator('#records button').click(); await page.locator('#detail').waitFor({state: 'visible'});
  await page.locator('#reason').fill('Verificación completa de turno sintético.'); const beforeApproval = writes.length;
  await page.locator('#send').click(); assert.equal(writes.length, beforeApproval); assert.equal(await page.locator('#approval').isVisible(), true);
  await page.locator('#approval').check(); await page.locator('#send').click(); await page.waitForFunction(() => document.querySelector('#detailMessage').textContent.startsWith('Operación registrada'));
  assert.equal(records.get(id(32)).status, 'approved'); assert.equal(saved.size, 2); checks.push('separate reviewer and explicit manual approval');
  await page.locator('#closeDetail').click(); await filter('assignment'); await page.locator('#records button').click(); await page.locator('#detail').waitFor({state: 'visible'});
  assert.equal(await page.locator('#decision').isVisible(), false); assert.match(await page.locator('#configuration').innerText(), /contrato destinatario verificado/); checks.push('assignment consultation cannot approve a hidden target');
  allowed = false; await page.locator('#closeDetail').click(); await page.locator('#refresh').click(); await page.locator('#workspace').waitFor({state: 'hidden'});
  assert.equal(await page.locator('#records').innerText(), ''); assert.equal(await page.locator('#configuration').innerText(), ''); checks.push('revocation withdraws rendered data and decisions');
  allowed = true; role = 'proposer'; await load(); await filter('calendar'); await page.locator('#records button').click(); await page.locator('#detail').waitFor({state: 'visible'});
  dropNext = true; await page.locator('#reason').fill('Calendario sintético completo para revisión.'); await page.locator('#send').click(); await page.locator('#recovery').waitFor({state: 'visible'});
  const beforeScopeChange = writes.length; scope = 'c'.repeat(64); await page.locator('#retry').click(); await page.locator('#workspace').waitFor({state: 'hidden'});
  assert.equal(writes.length, beforeScopeChange); assert.equal(await page.locator('#reason').inputValue(), ''); assert.equal(await page.locator('#recovery').isVisible(), false);
  checks.push('scope change withdraws frozen attempt before another POST');
  role = 'readonly'; await load(); await filter('rule_profile'); await page.locator('#records button').first().click(); await page.locator('#detail').waitFor({state: 'visible'});
  assert.equal(await page.locator('#decision').isVisible(), false); checks.push('read-only access cannot prepare a decision');
  const another = await context.newPage(); await another.goto(origin + '/catalogo-tiempo.html'); await another.bringToFront();
  // Headless background visibility is driven through CDP, not a forged event.
  const cdp = await context.newCDPSession(page); await cdp.send('Page.setWebLifecycleState', {state: 'frozen'}); await cdp.send('Page.setWebLifecycleState', {state: 'active'});
  if (await page.locator('#workspace').isVisible()) {
    // Lifecycle pagehide exercises the actual registered clearing handler. It
    // is component evidence; physical tab-switch acceptance remains separate.
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  }
  assert.equal(await page.locator('#workspace').isVisible(), false); assert.equal(await page.locator('#configuration').innerText(), ''); checks.push('pagehide withdraws all in-memory rendered detail');
  await another.close(); await page.bringToFront(); await page.locator('#refresh').click(); await page.locator('#workspace').waitFor({state: 'visible'});
  await filter('rule_profile'); await page.locator('#records button').first().click(); await page.locator('#detail').waitFor({state: 'visible'});
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', {configurable: true, get: () => true}); document.dispatchEvent(new Event('visibilitychange')); });
  assert.equal(await page.locator('#workspace').isVisible(), false); assert.equal(await page.locator('#configuration').innerText(), '');
  await page.evaluate(() => { delete document.hidden; }); checks.push('simulated visibilitychange clears detail and controls; physical acceptance separate');
  await page.locator('#refresh').click(); await page.locator('#workspace').waitFor({state: 'visible'});
  invalidList = true; await page.locator('#refresh').click(); await page.locator('#workspace').waitFor({state: 'hidden'}); assert.equal(await page.locator('#records').innerText(), ''); invalidList = false;
  checks.push('incomplete backend page fails closed instead of cropping');
  let release; paused = new Promise(resolve => { release = resolve; }); await load(); await filter('calendar'); await page.locator('#records button').click({noWaitAfter: true});
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide'))); release(); paused = null; await page.waitForTimeout(150);
  assert.equal(await page.locator('#workspace').isVisible(), false); assert.equal(await page.locator('#detail').isVisible(), false); assert.equal(await page.locator('#configuration').innerText(), '');
  checks.push('late detail response cannot repopulate withdrawn data');
  const mobileContext = await browser.newContext({viewport: {width: 390, height: 844}, locale: 'es-AR', timezoneId: 'Asia/Tokyo'}), mobile = await mobileContext.newPage();
  mobile.on('pageerror', e => errors.push(e.message)); await mobile.goto(origin + '/catalogo-tiempo.html'); await mobile.locator('#workspace').waitFor({state: 'visible'});
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await mobile.locator('#kind').selectOption('shift'); await mobile.locator('#filters button').click(); await mobile.waitForFunction(() => document.querySelector('#records .record strong')?.textContent === 'Turno');
  await mobile.locator('#records button').click(); await mobile.locator('#detail').waitFor({state: 'visible'});
  assert.match(await mobile.locator('#facts').innerText(), /01\/10\/2026/);
  assert.equal(await mobile.evaluate(() => { const d = document.querySelector('dialog'); return d.getBoundingClientRect().width <= innerWidth && d.scrollWidth <= d.clientWidth; }), true);
  const controls = await mobile.locator('#detail button').evaluateAll(all => all.filter(n => n.getClientRects().length).map(n => n.getBoundingClientRect().height)); assert.ok(controls.every(h => h >= 44));
  await mobile.screenshot({path: path.join(reportDir, 'native-time-ui-mobile.png')});
  await mobile.keyboard.press('Escape'); assert.equal(await mobile.locator('#detail').isVisible(), false);
  checks.push('390px mobile: no overflow, 44px targets, Escape and civil dates across timezone');
  role='proposer';await load();await filter('rule_profile');await page.locator('#records button').first().click();await page.locator('#detail').waitFor({state:'visible'});
  await page.locator('#editDraft').click();await page.locator('#editorDialog').waitFor({state:'visible'});
  const editorDialog=page.locator('#editorDialog');
  assert.equal(await editorDialog.getByLabel('Valor declarado',{exact:true}).first().inputValue(),'99999999999999.123456');
  assert.equal(await editorDialog.getByLabel('Código estable',{exact:true}).getAttribute('readonly'),'');
  await editorDialog.getByLabel('Nombre de la configuración',{exact:true}).fill('Reglas sintéticas corregidas');await page.locator('#editorReason').fill('Corrección sintética sin cambiar los valores.');
  dropNext=true;await page.locator('#saveDraft').click();await page.locator('#recovery').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('#detailMessage').textContent.includes('No se recibió el acuse sintético'));
  const corrected=sends.at(-1);assert.match(corrected.body, /99999999999999\.123456/);assert.match(corrected.body,/999999999999999999/);
  await page.locator('#retry').click();await page.waitForFunction(()=>document.querySelector('#detailMessage').textContent.startsWith('Operación registrada'));
  assert.deepEqual(sends.at(-1),corrected);assert.equal(records.get(id(1)).reference.title,'Reglas sintéticas corregidas');
  checks.push('real editor preserves legacy identity and exact values, with identical uncertain correction replay');
  await page.locator('#closeDetail').click();
  const startDraft=async kind=>{await page.locator('#newKind').selectOption(kind);await page.locator('#newDraft').click();await page.locator('#editorDialog').waitFor({state:'visible'});};
  const common=async(title,code)=>{await editorDialog.getByLabel('Nombre de la configuración',{exact:true}).fill(title);await editorDialog.getByLabel('Código estable',{exact:true}).fill(code);await editorDialog.getByLabel('Vigente desde',{exact:true}).fill('2026-10-01');await editorDialog.getByLabel('Vigente hasta (opcional)',{exact:true}).fill('2026-10-31');await page.locator('#editorReason').fill('Configuración sintética documentada para QA.');};
  await startDraft('calendar');await common('Calendario sintético nuevo','qa-browser-calendar');
  await editorDialog.getByLabel('Fecha',{exact:true}).fill('2026-10-12');await editorDialog.getByLabel('Tipo de día',{exact:true}).selectOption('holiday');await editorDialog.getByLabel('Código del día',{exact:true}).fill('qa_holiday');
  dropNext=true;await page.locator('#saveDraft').click();await page.locator('#recovery').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('#detailMessage').textContent.includes('No se recibió el acuse sintético'));
  const created=sends.at(-1);assert.equal(await page.locator('#consultAttempt').isDisabled(),true);const beforeReplay=saved.size;
  await page.locator('#retry').click();await page.waitForFunction(()=>document.querySelector('#detailMessage').textContent.startsWith('Operación registrada'));
  assert.equal(saved.size,beforeReplay);assert.deepEqual(sends.at(-1),created);assert.match(await page.locator('#detailTitle').innerText(),/Calendario sintético nuevo/);
  const newCalendar=[...records.values()].find(r=>r.reference?.code==='qa-browser-calendar');assert.equal(newCalendar.status,'draft');
  checks.push('new calendar draft is voluntary, durable-named and safe to retry without a fabricated creation receipt');await page.locator('#closeDetail').click();
  await startDraft('shift');await common('Turno sintético nocturno','qa-browser-shift');
  await editorDialog.getByLabel('Tolerancia de entrada (segundos)',{exact:true}).fill('0');await editorDialog.getByLabel('Tolerancia de salida (segundos)',{exact:true}).fill('0');
  await editorDialog.getByLabel('Día de la semana',{exact:true}).selectOption('7');await editorDialog.getByLabel('Secuencia en el día',{exact:true}).fill('1');await editorDialog.getByLabel('Tipo de tramo',{exact:true}).selectOption('work');
  await editorDialog.getByLabel('Inicio',{exact:true}).fill('22:00:00');await editorDialog.getByLabel('Fin',{exact:true}).fill('02:00:00');await editorDialog.getByLabel('Termina al día siguiente',{exact:true}).check();
  await page.locator('#saveDraft').click();await page.waitForFunction(()=>document.querySelector('#detailMessage').textContent.startsWith('Operación registrada'));
  assert.equal([...records.values()].find(r=>r.reference?.code==='qa-browser-shift').configuration.intervals[0].crossesMidnight,true);checks.push('typed night-shift preparation retains explicit zero tolerance and next-day declaration');await page.locator('#closeDetail').click();
  await startDraft('rule_profile');await common('Parámetros sintéticos nuevos','qa-browser-rules');
  await editorDialog.getByLabel('Clave del parámetro',{exact:true}).fill('qa_exact_decimal');await editorDialog.getByLabel('Tipo de valor',{exact:true}).selectOption('decimal');await editorDialog.getByLabel('Unidad documentada',{exact:true}).fill('qa_units');await editorDialog.getByLabel('Valor declarado',{exact:true}).fill('99999999999999.123456');
  await editorDialog.getByRole('button',{name:'Agregar parámetro',exact:true}).click();
  await editorDialog.getByLabel('Clave del parámetro',{exact:true}).last().fill('qa_false');await editorDialog.getByLabel('Tipo de valor',{exact:true}).last().selectOption('boolean');await editorDialog.getByLabel('Unidad documentada',{exact:true}).last().fill('qa_flag');await editorDialog.getByLabel('Valor declarado',{exact:true}).last().selectOption('false');
  await page.screenshot({path:path.join(reportDir,'native-time-editor-desktop.png')});
  await page.locator('#saveDraft').click();await page.waitForFunction(()=>document.querySelector('#detailMessage').textContent.startsWith('Operación registrada'));
  const newRules=[...records.values()].find(r=>r.reference?.code==='qa-browser-rules');assert.equal(newRules.configuration.parameters[0].decimalValue,'99999999999999.123456');assert.equal(newRules.configuration.parameters[1].booleanValue,false);
  checks.push('new documented typed parameters preserve an exact decimal and explicit false through the real handler');await page.locator('#closeDetail').click();
  nominalAllowed=true;scope='d'.repeat(64);await load();
  for(const [n,kind] of [[40,'calendar'],[41,'rule_profile']]){const p=payload(kind),r=record(command({kind,payload:p}));r.id=id(n);r.status='approved';r.version=3;records.set(r.id,r);payloads.set(r.id,p);}
  await startDraft('assignment');await common('Asignación sintética propia','qa-browser-assignment');
  await editorDialog.getByLabel('Nombre o número de legajo',{exact:true}).fill('Contrato');await editorDialog.getByRole('button',{name:'Buscar contrato',exact:true}).click();
  await editorDialog.getByRole('button',{name:'Elegir 900001 · Contrato sintético 1',exact:true}).waitFor({state:'visible'});
  await editorDialog.getByRole('button',{name:'Siguiente',exact:true}).click();await editorDialog.getByRole('button',{name:'Elegir 900021 · Contrato sintético 21',exact:true}).click();
  for(const kind of ['turno','calendario','reglas']){await editorDialog.getByRole('button',{name:'Consultar '+kind+' aprobados',exact:true}).click();await editorDialog.getByRole('button',{name:new RegExp('Elegir '+({turno:'Turno',calendario:'Calendario',reglas:'Reglas'})[kind]+' sin nombre visible')}).first().click();}
  await page.locator('#saveDraft').click();await page.waitForFunction(()=>document.querySelector('#detailMessage').textContent.startsWith('Operación registrada'));await page.locator('#readCurrent').click();await page.locator('#editDraft').waitFor({state:'visible'});
  assert.match(await page.locator('#configuration').innerText(),/Legajo 900021 · Contrato sintético 21/);assert.match(await page.locator('#configuration').innerText(),/Estado de la revisión vinculada[\s\S]*Aprobado/);
  assert.doesNotMatch(await page.locator('#detail').innerText(),/aaaaaaaa-|identityToken|CUIL|DNI/);
  checks.push('paginated native directory selection and approved dependency selection produce an identifiable minimal assignment');
  await page.locator('#reason').fill('Asignación sintética completa para revisión.');await page.locator('#send').click();await page.waitForFunction(()=>document.querySelector('#detailMessage').textContent.startsWith('Operación registrada'));
  role='approver';await load();await filter('assignment');await page.locator('#records button').last().click();await page.locator('#detail').waitFor({state:'visible'});
  await page.locator('#reason').fill('Contrato y revisiones sintéticas contrastados.');await page.locator('#approval').check();await page.locator('#send').click();await page.waitForFunction(()=>document.querySelector('#detailMessage').textContent.startsWith('Operación registrada'));
  assert.equal([...records.values()].find(r=>r.reference?.code==='qa-browser-assignment').status,'approved');assert.equal(await page.locator('#countAssignments').innerText(),'1');
  checks.push('separate reviewer can approve the visible verified target, refreshing approved global counts');
  await page.locator('#readCurrent').click();await page.locator('#configuration').getByText(/Legajo 900021/).waitFor({state:'visible'});
  nominalAllowed=false;scope='e'.repeat(64);await page.locator('#readCurrent').click();await page.locator('#workspace').waitFor({state:'hidden'});assert.equal(await page.locator('#configuration').innerText(),'');
  checks.push('nominal permission revocation removes assignment identity, editor and decisions');
  role='proposer';await load();await startDraft('calendar');await common('Datos volátiles de prueba','qa-volatile');
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));assert.equal(await page.locator('#editorDialog').isVisible(),false);assert.equal(await page.locator('#editorFields').innerText(),'');assert.equal(await page.locator('#editorReason').inputValue(),'');
  checks.push('pagehide clears unfinished preparation and its fields without persisting private input');
  await mobile.goto(origin+'/catalogo-tiempo.html');await mobile.locator('#workspace').waitFor({state:'visible'});await mobile.locator('#newDraft').click();await mobile.locator('#editorDialog').waitFor({state:'visible'});
  assert.equal(await mobile.evaluate(()=>{const d=document.querySelector('#editorDialog');return d.scrollWidth<=d.clientWidth&&d.getBoundingClientRect().width<=innerWidth;}),true);
  await mobile.locator('#saveDraft').scrollIntoViewIfNeeded();assert.equal(await mobile.locator('#closeEditor').evaluate(n=>{const r=n.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.height>=44;}),true);
  await mobile.screenshot({path:path.join(reportDir,'native-time-editor-mobile.png')});await mobile.keyboard.press('Escape');assert.equal(await mobile.locator('#editorDialog').isVisible(),false);
  checks.push('390px typed editor has no overflow and closes with keyboard Escape');
  assert.deepEqual(external, []); assert.deepEqual(errors, []);
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  checks.push('no external requests, client persistence or browser exceptions');
  const result = {synthetic: true, localOperatorUi: true, realHttpHandler: true, municipalPersistenceVerified: false, physicalAcceptance: false, checks};
  fs.writeFileSync(path.join(reportDir, 'time-catalog-review-browser-result.json'), JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
