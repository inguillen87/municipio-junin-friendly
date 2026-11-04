import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const apiPath = '/api/internal-native-family-requests';
const ledgerKeys = ['requests', 'events', 'children', 'certificates', 'blobs'];

export function nativeFamilyDurableBrowserExpectedLedger(before) {
  assert.deepEqual(Object.keys(before).sort(), ledgerKeys.slice().sort());
  for (const key of ledgerKeys) assert.ok(Number.isSafeInteger(before[key]) && before[key] >= 0);
  return { requests: before.requests + 2, events: before.events + 8,
    children: before.children + 1, certificates: before.certificates + 1, blobs: before.blobs + 1 };
}

export function nativeFamilyDurableBrowserHtml(view) {
  assert.ok(['self', 'review'].includes(view), 'FAMILY195_BROWSER_VIEW_INVALID');
  return `<!doctype html><html lang="es-AR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Familia y escolaridad · integración sintética</title><link rel="stylesheet" href="/assets/native-family-request.css"><style>body{margin:0;padding:16px;background:#f3f7f7;font:16px/1.5 Arial,sans-serif}main{max-width:1100px;margin:auto;min-width:0}</style><main><section id="panel"></section></main><script type="module">import{mountNativeFamilyRequests}from'/assets/native-family-request-panel.js';const auth=await(await fetch('/api/internal-auth')).json();window.familyControl=await mountNativeFamilyRequests(document.querySelector('#panel'),{auth,view:'${view}'});window.familyMounted=true;</script></html>`;
}

// Invoked only by the guarded, CI-only PostgreSQL runner, inside its live HTTP
// server. No page.route, substituted RPC envelopes, extra SQL transport or
// credentials are used here. Actor changes are server-only synthetic fixtures;
// real113/195 session, link and capability checks remain inside every RPC.
export async function verifyNativeFamilyDurableBrowser({ origin, qa, output, setActor, ledger, loseNextAck, sourceRoot, pdfBytes }) {
  const base = new URL(origin);
  assert.equal(base.protocol, 'http:');
  assert.equal(base.hostname, '127.0.0.1');
  assert.ok(base.port && base.pathname === '/' && !base.username && !base.password);
  assert.ok(qa?.actors?.reader && qa?.actors?.checker);
  assert.ok(Buffer.isBuffer(pdfBytes) && pdfBytes.subarray(0, 5).toString() === '%PDF-');
  assert.ok(pdfBytes.includes(Buffer.from('QA SYNTHETIC SCHOOL CERTIFICATE')), 'FAMILY195_BROWSER_PDF_FIXTURE_DRIFT');
  const secondPdf = Buffer.from(pdfBytes.toString('latin1').replace('QA SYNTHETIC SCHOOL CERTIFICATE', 'QB SYNTHETIC SCHOOL CERTIFICATE'), 'latin1');
  assert.notEqual(digest(secondPdf), digest(pdfBytes));
  assert.equal(secondPdf.length, pdfBytes.length);
  const before = ledger(), expectedAfter = nativeFamilyDurableBrowserExpectedLedger(before);
  const assets = ['native-family-request-model.js', 'native-family-request-client.js', 'native-family-request-panel.js', 'native-family-request.css', 'native-salary-catalog-model.js'];
  const sources = assets.map(file => {
    const relative = 'assets/' + file, source = fs.readFileSync(path.join(sourceRoot, relative));
    assert.deepEqual(fs.readFileSync(path.join(sourceRoot, 'public', relative)), source, 'FAMILY195_BROWSER_BUILT_BYTES_DRIFT:' + relative);
    return { path: relative, sha256: digest(source) };
  });
  assert.equal(fs.existsSync(output), false, 'FAMILY195_BROWSER_OUTPUT_EXISTS');
  fs.mkdirSync(output);
  const checks = [], errors = [], failures = [], writes = [], externalRequests = [], downloads = [];
  const check = (value, label) => { assert.ok(value, label); checks.push(label); };
  const browser = await chromium.launch({ headless: true });
  let page, report;
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 1000 }, locale: 'es-AR', serviceWorkers: 'block', acceptDownloads: true });
    page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => failures.push({ url: request.url(), error: request.failure()?.errorText }));
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.origin !== base.origin) externalRequests.push(request.url());
      if (url.pathname === apiPath && request.method() === 'POST') writes.push({ view: url.searchParams.get('view'), key: request.headers()['idempotency-key'], body: request.postData() });
    });
    const action = key => page.locator('[data-family-action="' + key + '"]');
    const field = key => page.locator('[data-family-field="' + key + '"]');
    const apiReply = async (view, resource, click) => {
      const waiting = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.origin === base.origin && url.pathname === apiPath && url.searchParams.get('view') === view &&
          (resource === 'POST' ? response.request().method() === 'POST' : response.request().method() === 'GET' && url.searchParams.get('resource') === resource);
      });
      await click();
      const response = await waiting, data = await response.json();
      return { status: response.status(), data: data.data ?? data };
    };
    const fresh = async (actor, view) => {
      setActor(actor);
      await page.goto(base.origin + '/' + view);
      await page.waitForFunction(() => window.familyMounted === true);
    };
    const submit = async view => {
      const result = await apiReply(view, 'POST', () => action('submit').click());
      assert.ok([200, 201].includes(result.status), JSON.stringify(result.data));
      await page.getByText('La presentación quedó registrada para revisión de Personal.', { exact: true }).waitFor();
      return result.data;
    };
    const decision = async (command, reason) => {
      await field('decisionReason').fill(reason);
      await field('decisionConfirmed').check();
      const result = await apiReply('review', 'POST', () => action(command).click());
      assert.ok([200, 201].includes(result.status), JSON.stringify(result.data));
      await page.getByText('La decisión administrativa quedó registrada. No modifica haberes ni otorga una prestación.', { exact: true }).waitFor();
      return result.data;
    };
    const document = async (requestId, version, expected) => {
      const pending = page.waitForEvent('download');
      await action('document-' + version).click();
      const download = await pending, bytes = fs.readFileSync(await download.path());
      assert.deepEqual(bytes, expected);
      assert.equal(download.suggestedFilename(), 'solicitud-familiar-' + requestId + '-v' + version + '.pdf');
      downloads.push({ requestId, version, sha256: digest(bytes), bytes: bytes.length });
    };

    await fresh('reader', 'self');
    check(await page.evaluate(() => isSecureContext && !!crypto.subtle), 'Loopback real conserva contexto seguro y WebCrypto sin TLS desactivado');
    check(writes.length === 0, 'Abrir el autoservicio y consultar no envía comandos');
    check((await page.locator('#panel').innerText()).includes('19541'), 'El legajo propio nace del vínculo113 resuelto por el servidor');
    await action('new').click();
    await field('familyName').fill('Hija del circuito durable exclusivamente sintética');
    await field('birthDate').fill('2018-06-09');
    await field('reason').fill('Presentación sintética por navegador con persistencia real');
    await field('confirmed').check();
    loseNextAck();
    const lost = await apiReply('self', 'POST', () => action('submit').click());
    assert.equal(lost.status, 503);
    await action('recover').waitFor();
    const initial = structuredClone(writes.at(-1)), commandsBeforeRecovery = writes.length;
    const initialBody = JSON.parse(initial.body);
    check(initialBody.payload.definition.dni === null && !Object.hasOwn(initialBody, 'contractId') && !Object.hasOwn(initialBody, 'personId'), 'El comando no inventa DNI ni acepta un contrato o persona elegidos por el cliente');
    assert.deepEqual(ledger(), { ...before, requests: before.requests + 1, events: before.events + 1 });
    const recovered = await apiReply('self', 'attempt', () => action('recover').click());
    assert.equal(recovered.status, 200);
    await page.getByText('Se recuperó el comprobante del envío original.', { exact: true }).waitFor();
    const childId = recovered.data.requestId;
    assert.match(childId, /^[a-f0-9-]{36}$/);
    check(writes.length === commandsBeforeRecovery, 'Un acuse perdido después del COMMIT se recupera por GET sin repetir el POST');

    await fresh('checker', 'review');
    await action('open-' + childId).click();
    const corrected = await decision('request-correction', 'Corrección administrativa sintética independiente');
    assert.equal(corrected.requestVersion, 2);
    await fresh('reader', 'self');
    await action('open-' + childId).click();
    await action('resubmit').click();
    await field('familyName').fill('Hija corregida en navegador durable exclusivamente sintética');
    await field('reason').fill('Respuesta sintética a la corrección independiente');
    await field('confirmed').check();
    assert.equal((await submit('self')).requestVersion, 3);
    await fresh('checker', 'review');
    await action('open-' + childId).click();
    const acceptedChild = await decision('accept', 'Aceptación independiente sintética del hijo corregido');
    assert.equal(acceptedChild.requestVersion, 4);
    assert.equal(acceptedChild.state, 'accepted');
    assert.equal(acceptedChild.administrativeRecord.kind, 'child');
    check(ledger().children === before.children + 1, 'La aceptación del navegador crea exactamente un hijo mediante102 después del COMMIT');

    await fresh('reader', 'self');
    await action('new').click();
    await field('kind').selectOption('schooling');
    await field('familyId').selectOption(acceptedChild.administrativeRecord.familyRef.id);
    await field('institution').fill('Escuela sintética del circuito durable');
    await field('educationLevel').fill('Primario');
    await field('schoolYear').fill('2026');
    await field('presentedOn').fill('2026-10-17');
    await field('document').setInputFiles({ name: '学校.pdf', mimeType: 'application/pdf', buffer: pdfBytes });
    await page.getByText('Archivo elegido: 学校.pdf', { exact: true }).waitFor();
    await field('reason').fill('Certificado sintético presentado con archivo PDF real');
    await field('confirmed').check();
    const school = await submit('self'), schoolId = school.requestId;
    assert.equal(ledger().blobs, before.blobs, 'FAMILY195_BROWSER_EXISTING_PDF_NOT_DEDUPLICATED');
    await fresh('checker', 'review');
    await action('open-' + schoolId).click();
    assert.equal((await decision('request-correction', 'Corrección documental independiente exclusivamente sintética')).requestVersion, 2);
    await fresh('reader', 'self');
    await action('open-' + schoolId).click();
    await action('resubmit').click();
    check(await field('reuseDocument').isChecked(), 'Corregir ofrece conservar explícitamente el PDF original');
    await field('document').setInputFiles({ name: '学校-corregido.pdf', mimeType: 'application/pdf', buffer: secondPdf });
    await page.getByText('Archivo elegido: 学校-corregido.pdf', { exact: true }).waitFor();
    check(!await field('reuseDocument').isChecked(), 'El PDF nuevo sustituye sólo la presentación actual y conserva el documento histórico');
    await field('reason').fill('Reenvío sintético de certificado con documento corregido');
    await field('confirmed').check();
    assert.equal((await submit('self')).requestVersion, 3);
    await action('open-' + schoolId).click();
    await document(schoolId, 1, pdfBytes);
    await document(schoolId, 3, secondPdf);
    check(true, 'Las versiones1 y3 descargan sus bytes exactos desde nuevas conexiones PostgreSQL');

    for (const width of [1366, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Detalle documental sin desborde horizontal a ' + width + 'px');
      await page.screenshot({ path: path.join(output, 'self-history-' + width + '.png'), fullPage: true });
    }
    await fresh('checker', 'review');
    await action('open-' + schoolId).click();
    const acceptedSchool = await decision('accept', 'Aceptación documental independiente exclusivamente sintética');
    assert.equal(acceptedSchool.requestVersion, 4);
    assert.equal(acceptedSchool.state, 'accepted');
    assert.equal(acceptedSchool.administrativeRecord.kind, 'schooling');
    await fresh('reader', 'self');
    await action('open-' + schoolId).click();
    await document(schoolId, 1, pdfBytes);
    await document(schoolId, 3, secondPdf);
    check((await page.locator('#panel').innerText()).includes('Versión 4'), 'La lectura posterior a la aceptación conserva las cuatro versiones');
    const after = ledger();
    assert.deepEqual(after, expectedAfter);
    assert.equal(writes.length, 8);
    assert.equal(writes.filter(w => w.view === 'self').length, 4);
    assert.equal(writes.filter(w => w.view === 'review').length, 4);
    assert.equal(new Set(writes.map(w => w.key)).size, 8);
    check(true, 'Los ocho comandos humanos conservan exactamente2 solicitudes,8eventos,1hijo,1certificado y1PDF nuevo');
    assert.deepEqual(errors, []);
    assert.deepEqual(failures, []);
    assert.deepEqual(externalRequests, []);
    check(true, 'Ningún error de página, fallo de red ni solicitud a servicios externos');
    report = { version: 'native-family-durable-browser.v1', passed: true, browserExecuted: true, productUiVerified: true,
      actualHttpHandler: true, actualPostgresTransport: true, synthetic: true, authenticationGatewayFixture: true,
      pageRouteFulfillUsed: false, sourceRoot, sources, before, after, checks, checksPassed: checks.length,
      writes, downloads, requestIds: { child: childId, schooling: schoolId }, lostCommitAcknowledgements: 1,
      pageErrors: errors, requestFailures: failures, externalRequests, productionBusinessWrites: 0, municipalAcceptance: false };
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    return report;
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {});
    fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ message: error.message, stack: error.stack, checks, writes, errors, failures, downloads }, null, 2) + '\n', { flag: 'wx' });
    throw error;
  } finally {
    setActor('reader');
    await browser.close();
  }
}
