// Compiled or published frontend; every API call, including writes, is intercepted.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { unzipSync, strFromU8 } from 'fflate';
import { verifyPrepartePublication } from './verify-preparte-publication.mjs';
import { preparteSynthetic } from '../tests/fixtures/attendance-preparte-synthetic.js';
const published = process.argv.includes('--published');
const origin = published ? 'https://municipio-junin-friendly.vercel.app' : 'https://preparte.test';
const root = path.resolve('public'), out = 'verification/preparte-' + (published ? 'published' : 'local');
fs.mkdirSync(out, { recursive: true });
if (published) await verifyPrepartePublication(out);
const checks = [], errors = [], requests = [], posts = [];
let changed = false, newReceipt = false, denied = false, canPrepare = true, delay = 0, splitStream = false, reboundStream = false;
const bootstrap = () => ({ ok: true, principal: {
  email: 'qa@example.invalid', membershipId: '00000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-4000-8000-000000000002',
  certifiedBindingId: '00000000-0000-4000-8000-000000000004',
  capabilities: ['payroll.novelty.read', ...(canPrepare ? ['payroll.novelty.prepare'] : [])] },
  sourceFeatures: { attendancePreparte: canPrepare },
  feature: { contractVersion: 'payroll-novelty-batch.v2', approvalEffect: 'export_only' },
  limits: { contractVersion: 'payroll-novelty-batch.v2', sourceModes: ['individual','bulk'],
    native: { maxRows: 1, sourceModes: ['individual'], payrollTypes: ['monthly'] },
    approvalEffect: 'export_only', grhMutation: false,
    payrollCalculated: false, payrollPosted: false, maxRows: 500,
    payrollTypes: ['monthly','first_fortnight','sac','vacation','supplementary','final','other'] }, batches: [] });
const browser = await chromium.launch({ headless: true,
  ...(process.env.QA_CHROMIUM ? { executablePath: process.env.QA_CHROMIUM } : {}) });
let page;
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true, serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/internal-auth') return route.fulfill({ json: { ok: true, authenticated: true,
        user: { email: 'qa@example.invalid', name: 'Operador QA', role: 'ADMIN_INTERNO' },
        access: { tenantCapabilities: ['payroll.read','payroll.novelty.read', ...(canPrepare ? ['payroll.novelty.prepare'] : [])], platformCapabilities: [], platformRoles: [] } } });
      if (url.pathname === '/api/internal-payroll-novelties') {
        if (request.method() !== 'GET') {
          posts.push({ key: request.headers()['idempotency-key'], body: request.postDataJSON() });
          assert.equal(url.searchParams.has('version'), false, 'GRH preparte keeps the v1 prepare endpoint');
          const draft = posts.at(-1).body.payload;
          return route.fulfill({ json: { ok: true, data: { ...draft,
            id: '00000000-0000-4000-8000-000000000003', contractVersion: 'payroll-novelty-batch.v1',
            status: 'draft', version: 1, rowCount: draft.rows.length, rows: [], exportable: false,
            grhMutation: false, payrollCalculated: false, payrollPosted: false } } });
        }
        assert.equal(url.searchParams.get('version'), '2');
        return route.fulfill({ json: bootstrap() });
      }
      if (url.pathname === '/api/internal-attendance') {
        requests.push(Object.fromEntries(url.searchParams));
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        if (denied) return route.fulfill({ status: 403, json: { ok: false, error: 'Permiso QA revocado' } });
        try { return route.fulfill({ json: await preparteSynthetic({ changed, newReceipt, splitStream, reboundStream, evidence: url.searchParams.get('evidence') || undefined }) }); }
        catch (error) { return route.fulfill({ status: error.status || 503, json: { ok: false, error: error.message, code: error.code } }); }
      }
      return route.fulfill({ json: { ok: true, data: [] } });
    }
    if (request.method() !== 'GET') return route.abort();
    if (published) return route.continue();
    const pathname = url.pathname === '/novedades' ? '/novedades-nomina.html' : url.pathname;
    const file = path.resolve(root, '.' + decodeURIComponent(pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
    const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
    return route.fulfill({ contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  page = await context.newPage(); page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/novedades'); await page.locator('#preflightButton:enabled').waitFor();
  await page.locator('#periodMonth').fill('2026-09'); await page.locator('#payrollType').selectOption('monthly');
  const panel = page.locator('#attendancePreparte'), status = panel.locator('[data-ap-status]');
  const load = async () => { await panel.locator('[data-ap-load]').click(); await page.waitForFunction(() =>
    document.querySelector('[data-ap-status]')?.textContent.startsWith('Preparte generado.')); };
  const field = (index, column) => page.locator(`[data-sheet-index="${index}"][data-sheet-field="${column}"]`);
  await panel.locator('summary').click(); assert.equal(requests.length, 0); assert.equal(posts.length, 0);
  await load(); assert.equal(requests[0].period, '2026-09'); assert.equal(requests[0].resource, 'clock-preparte');
  assert.match(await panel.locator('[data-ap-metrics]').innerText(), /107/);
  assert.equal(await panel.locator('tbody tr[data-ap-key]').count(), 25);
  assert.equal(await panel.locator('input[data-blocked]:enabled').count(), 0);
  const reviewTable=panel.getByRole('region',{name:'Revisión por legajo del preparte',exact:true});
  assert.ok(await reviewTable.evaluate(n=>n.scrollHeight>n.clientHeight));
  await reviewTable.evaluate(n=>{n.scrollTop=300;});
  assert.ok(await reviewTable.evaluate(n=>Math.abs(n.querySelector('th').getBoundingClientRect().top-n.getBoundingClientRect().top)<5));
  await reviewTable.evaluate(n=>{n.scrollTop=0;});
  checks.push('long review stays in a keyboard-accessible table with fixed column headers and the complete data outside pagination');
  await panel.locator('[data-ap-filter]').selectOption('ready'); assert.equal(await panel.locator('tbody tr[data-ap-key]').count(), 2);
  const row = number => panel.locator('tr[data-ap-key]').filter({ has: page.locator(`input[aria-label="Incluir legajo ${number}"]`) });
  const first = row('9001'), second = row('9002');
  const review = async () => { await panel.locator('[data-ap-reference]').fill('Listado sintético QA de Personal, versión 1'); await panel.locator('[data-ap-reviewed]').check(); };
  const use = async () => { page.once('dialog', dialog => dialog.accept()); await panel.locator('[data-ap-use]').click(); };
  await first.locator('[type=checkbox]').check(); await first.locator('[data-ap-field=cap]').fill('2');
  await review(); await panel.locator('[data-ap-use]').click(); assert.match(await status.innerText(), /supera el tope/);
  assert.equal(posts.length, 0); assert.equal(await page.locator('[data-sheet-row]').count(), 0);
  await first.locator('[data-ap-field=cap]').fill('3');
  checks.push('one monthly source read, whole 107-person scope, blocked incidents and individual ceiling enforced before transfer');
  await page.locator('[name=sourceMode][value=sheet]').check(); await page.locator('#sheetAdd').click();
  await field(0,0).fill('9999'); await field(0,1).fill('1'); await field(0,4).fill('30');
  await review(); newReceipt = true; await use();
  await page.waitForFunction(() => document.querySelectorAll('[data-sheet-row]').length === 2);
  assert.equal(await field(0,0).inputValue(), '9999'); assert.equal(await field(1,0).inputValue(), '9001');
  assert.equal(await field(1,1).inputValue(), '44'); assert.equal(await field(1,4).inputValue(), '3');
  assert.equal(await page.locator('#periodMonth').isDisabled(), true); assert.equal(await page.locator('#payrollType').isDisabled(), true);
  assert.equal(posts.length, 0); assert.match(requests.at(-1).evidence, /^[a-f0-9]{64}$/);
  await first.locator('[type=checkbox]').check(); await review(); await use();
  await page.waitForFunction(() => document.querySelector('[data-ap-status]')?.textContent.includes('ya tiene mayor dedicación'));
  assert.equal(await page.locator('[data-sheet-row]').count(), 2); await first.locator('[type=checkbox]').uncheck();
  checks.push('source revalidated, unchanged receipt preserves review, atomic append keeps earlier work and blocks duplicate 44/95');
  const downloaded = page.waitForEvent('download'); await panel.locator('[data-ap-export]').click();
  const download = await downloaded; await download.saveAs(out + '/preparte-synthetic.xlsx');
  const archive = unzipSync(fs.readFileSync(out + '/preparte-synthetic.xlsx'));
  const sheet = strFromU8(archive['xl/worksheets/sheet1.xml']);
  assert.equal((sheet.match(/<row r=/g) || []).length, 108);
  assert.match(strFromU8(archive['xl/workbook.xml']), /Referencia/); assert.equal(posts.length, 0);
  checks.push('Excel exports all 107 rows, not the two filtered rows, with source provenance and reference sheet');
  await page.locator('#preflightButton').click(); await page.locator('#prepareButton:enabled').waitFor();
  assert.equal(await page.locator('[data-review-row]').count(), 2);
  await page.locator('#prepareButton').click(); await page.waitForFunction(() => document.querySelector('#messageHost')?.textContent.includes('Lote creado y auditado'));
  assert.equal(posts.length, 1); const rows = posts[0].body.payload.rows;
  assert.equal(rows.length, 2); assert.equal(rows[1].conceptSourceId, '44');
  assert.equal(rows[1].quantityDecimal, '3'); assert.equal(rows[1].amountCents, null); assert.equal(rows[1].forced, false);
  assert.match(rows[1].observation, /evidencia personal/);
  assert.equal(await page.locator('#periodMonth').isEnabled(), true);
  checks.push('explicit normal validation and batch creation persists percentage units, no manual amount or forced override');
  await first.locator('[type=checkbox]').check(); await review(); changed = true;
  await panel.locator('[data-ap-export]').click(); await page.waitForFunction(() => document.querySelector('[data-ap-status]')?.textContent.includes('cambiaron'));
  assert.equal(posts.length, 1); await load();
  assert.equal(await first.locator('[type=checkbox]').isChecked(), false);
  assert.equal(await first.locator('[data-ap-field=cap]').inputValue(), '3');
  assert.match(await status.innerText(), /desmarcadas/);
  checks.push('changed source blocks stale export/transfer and requires reselecting affected people while preserving declared ceilings');
  await panel.locator('[data-ap-filter]').selectOption('ready'); await first.locator('[type=checkbox]').check();
  await panel.screenshot({ path: out + '/desktop.png' });
  for (const width of [320,390]) {
    await page.setViewportSize({ width, height: 844 }); await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `page width ${width}`);
    assert.ok(await panel.evaluate(n => { const r=n.getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth+1; }));
    await panel.screenshot({ path: out + `/mobile-${width}.png` });
  }
  checks.push('desktop and 320/390px layouts keep review controls usable without horizontal page overflow');
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.locator('#periodMonth').fill('2026-10');
  assert.equal(await panel.locator('[data-ap-export]').isDisabled(), true);
  assert.equal(await panel.locator('[data-ap-use]').isDisabled(), true);
  await page.locator('#periodMonth').fill('2026-09');
  assert.equal(await first.locator('[type=checkbox]').isChecked(), true);
  checks.push('period changes block cross-month transfer/export without erasing previous decisions');
  // Igual persona y legajo, pero dos contratos/equipos: nunca una suma apta para novedades.
  let identityDownloads=0;page.on('download',()=>identityDownloads++);
  const batchCount=posts.length;splitStream=true;await panel.locator('[data-ap-export]').click();
  await page.waitForFunction(()=>document.querySelector('[data-ap-status]')?.textContent.includes('cambiaron'));
  assert.equal(identityDownloads,0);assert.equal(posts.length,batchCount);
  await panel.locator('[data-ap-filter]').selectOption('all');await load();
  assert.equal(await first.locator('[type=checkbox]').isEnabled(),false);
  assert.equal(await first.locator('[type=checkbox]').isChecked(),false);
  assert.equal(await first.locator('[data-ap-field=hours]').isEnabled(),false);
  assert.match(await first.innerText(),/Más de un vínculo o equipo/);
  assert.match(await first.innerText(),/No reconstruido/);
  assert.equal(await panel.locator('[data-ap-use]').isDisabled(),true);
  assert.equal(posts.length,batchCount);
  checks.push('same legajo across non-overlapping source streams is blocked, unselected and not represented as recognized overtime');
  const conflictDownload=page.waitForEvent('download');await panel.locator('[data-ap-export]').click();
  const conflictFile=await conflictDownload;await conflictFile.saveAs(out+'/preparte-conflict-synthetic.xlsx');
  const conflictZip=unzipSync(fs.readFileSync(out+'/preparte-conflict-synthetic.xlsx'));
  const conflictSheet=strFromU8(conflictZip['xl/worksheets/sheet1.xml']);
  const conflictRow=[...conflictSheet.matchAll(/<row[^>]*>[\s\S]*?<\/row>/g)].map(m=>m[0]).find(r=>/>9001<\/t>/.test(r));
  assert.ok(conflictRow);assert.match(conflictRow,/Más de un vínculo o equipo/);assert.match(conflictRow,/No reconstruido/);assert.doesNotMatch(conflictRow,/<f>D\d+\/86400<\/f>/);
  assert.equal(posts.length,batchCount);await panel.screenshot({path:out+'/identity-review.png'});
  checks.push('complete Excel retains the blocked row and its reason without a numeric extra-time formula or a new payroll batch');
  splitStream=false;await load();await first.locator('[type=checkbox]').check();reboundStream=true;await load();
  assert.equal(await first.locator('[type=checkbox]').isEnabled(),true);assert.equal(await first.locator('[type=checkbox]').isChecked(),false);
  assert.equal(await first.locator('[data-ap-field=cap]').inputValue(),'3');assert.match(await status.innerText(),/desmarcadas/);
  assert.equal(posts.length,batchCount);
  checks.push('changing only the binding with identical times clears the prior selection while preserving declared fields for a fresh review');

  denied=true; await panel.locator('[data-ap-load]').click();
  await panel.locator('[data-ap-result]').waitFor({state:'hidden'});
  assert.equal(await panel.locator('tbody tr').count(), 0); assert.equal(await panel.locator('[data-ap-reference]').inputValue(), '');
  denied=false; await load(); canPrepare=false; await page.locator('#refreshButton').click();
  await page.locator('#readOnlySection:visible').waitFor(); assert.equal(await panel.locator('tbody tr').count(), 0);
  checks.push('source access denial and payroll permission revocation clear private preparte data');
  assert.deepEqual(errors, []);
  const result = { ok:true, checksPassed:checks.length, checks, mode:published?'published-static':'compiled-local',
    apiResponsesSynthetic:true, realApiWrites:0, municipalSessionTested:false, interceptedBatchWrites:posts.length };
  fs.writeFileSync(out+'/browser.json',JSON.stringify(result,null,2)); console.log(JSON.stringify(result));
} catch(error) { fs.writeFileSync(out+'/error.txt',String(error.stack)); throw error; }
finally { await browser.close(); }
