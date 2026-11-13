// «Importar archivo TXT de una entidad» en un navegador real, con datos exclusivamente sintéticos y sin base de datos.
// Comprueba en pantalla las reglas contrastadas el 13/11/2026 con los archivos reales de agosto: el formato se propone por
// el largo del renglón, la coma decimal y el renglón corto se leen. Omitir ceros y elegir el legajo menor requieren
// opciones expresas que se reinician al cambiar de archivo. No se envía ningún lote.
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { OWN_NOVELTY_READ, OWN_NOVELTY_CAPS } from '../assets/own-payroll-novelties-model.js';

const root = path.resolve(import.meta.dirname, '..');
const uid = n => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
const pad = (text, width) => text.padEnd(width, ' ');
const person = (n, legajo, dni, name) => ({ n, legajo: String(legajo), dni: String(dni), name });
// Seis contratos sintéticos; la persona del DNI 30111222 tiene dos legajos activos (1203 y 874).
const PEOPLE = [person(1, 12, 20111222, 'Sintética Uno'), person(2, 1203, 30111222, 'Sintética Dos'), person(3, 874, 30111222, 'Sintética Dos'), person(4, 45, 40111222, 'Sintética Cuatro'), person(5, 46, 50111222, 'Sintética Cinco'), person(6, 47, 60111222, 'Sintética Seis')];
const subjects = PEOPLE.map(p => ({ legajo: p.legajo, origin: 'MUNICONTROL', contractId: uid(p.n), employeeName: p.name, registeredAt: '2026-10-01T12:00:00.000Z', sourceCutoff: null, identityToken: String(p.n).repeat(64), registrationId: uid(100 + p.n) }));
const roster = PEOPLE.map(p => ({ contractId: uid(p.n), legajo: p.legajo, dni: p.dni, status: 'active', name: p.name }));
const junin = (dni, name, amount, width = 44) => pad('00000' + dni + '0' + name, width) + amount;
const FILES = {
  // OSEP: todos los afiliados en todas las columnas; para el concepto 602 sólo dos traen valor.
  'osep2610.txt': ['20111222|1|0000520000', '40111222|0|0000000000', '50111222|2|0001040000', '60111222|0|0000000000'].map(x => { const [d, q, a] = x.split('|'); return pad('0000000' + d, 82) + q + a + pad('', 92); }).join('\r\n') + '\r\n',
  // Farmacéutico / SOEM / Tres Provincias: renglones de 80, importe con decimales implícitos.
  'Junin2610.txt': [20111222, 40111222, 50111222].map(d => pad('000' + d + '000', 40) + '0000' + '01234567' + pad('', 28)).join('\r\n') + '\r\n',
  // Tal como llega de la entidad: coma decimal, un renglón un carácter más corto y una persona con dos legajos.
  'AMAS2610.txt': [junin('20111222', 'UNO, SINTETICA', '   18518,50'), junin('30111222', 'DOS SINTETICA', '    2000,00', 43), junin('40111222', 'CUATRO SINTETICA', '00000000,00'), junin('99111222', 'SIN LEGAJO', '     100,00')].join('\r\n') + '\r\n',
};
const json = (res, status, value) => res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(value));

export async function runEntityImportVerification() {
  const output = path.join(root, 'verification', 'entity-import'); fs.mkdirSync(output, { recursive: true });
  const unexpected = [], errors = [], checks = []; let lastText = ''; const check = (ok, name) => { assert.ok(ok, name + (ok ? '' : ' · leído: ' + lastText)); checks.push(name); };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://local.invalid');
    if (url.pathname === '/api/internal-auth') return json(res, 200, { ok: true, authenticated: true, sessionVersion: 2, user: { id: 'sintetico', email: 'preparadora-qa@local.invalid' }, expiresAt: new Date(Date.now() + 3600000).toISOString(), access: { context: 'tenant', tenant: { id: uid(900), roleKey: 'maker' }, tenantCapabilities: [...OWN_NOVELTY_READ, OWN_NOVELTY_CAPS.prepare] } });
    if (url.pathname === '/api/internal-own-payroll-novelties' && req.method === 'GET' && url.searchParams.get('resource') === 'bootstrap') return json(res, 200, { ok: true, data: { version: 'own-payroll-novelty-bootstrap.v1', complete: true, subjects, batches: [], permissions: { canPrepare: true, canApprove: false } } });
    if (url.pathname === '/api/internal-data' && url.searchParams.get('resource') === 'nativeroster') return json(res, 200, { ok: true, data: { rows: roster } });
    if (url.pathname.startsWith('/api/')) { unexpected.push(req.method + ' ' + url.pathname); return json(res, 418, { ok: false, error: 'Pedido inesperado en el ensayo sintético' }); }
    if (url.pathname === '/qa.html') return res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Importar archivo de entidad · QA sintético</title><style>body{margin:12px;font-family:system-ui}main{max-width:1100px;margin:auto;min-width:0}</style><main id="qa"></main><script type="module">import {mountOwnPayrollNovelties} from "/assets/own-payroll-novelties-panel.js";window.qaPanel=mountOwnPayrollNovelties(document.getElementById("qa"),()=>{});</script></html>');
    const file = path.resolve(root, '.' + url.pathname);
    if (!file.startsWith(path.join(root, 'assets') + path.sep) || !fs.existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': file.endsWith('.css') ? 'text/css' : 'application/javascript' }); fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'es-AR' })).newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:' + server.address().port + '/qa.html');
    const $ = key => page.locator('[data-n-' + key + ']'), result = $('import-result'), hint = $('import-hint');
    await $('refresh').click();
    await page.waitForFunction(() => document.querySelector('[data-n-content]')?.hidden === false).catch(async () => { throw new Error('El panel no cargó: ' + await page.locator('[data-n-status]').innerText().catch(() => '(sin estado)') + ' · ' + unexpected.join(', ') + ' · ' + errors.join(', ')); });
    await $('period').fill('2026-10'); await page.locator('[data-n-import-box] > summary').click();
    const choose = async name => { await $('import-file').setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(FILES[name], 'latin1') }); };
    const read = async () => { await $('import-read').click(); await page.waitForFunction(() => { const t = document.querySelector('[data-n-import-result]').textContent.trim(); return t !== '' && !t.startsWith('Leyendo'); }); lastText = (await result.innerText()).replace(/\s+/g, ' '); return lastText; };

    // 1 · OSEP: el mismo archivo alimenta cada concepto sólo con quienes traen valor.
    await choose('osep2610.txt'); await page.waitForFunction(() => /185 posiciones/.test(document.querySelector('[data-n-import-hint]').textContent));
    check(await $('import-format').inputValue() === '7' && /Renglones de 185 posiciones: coincide con el formato elegido/.test(await hint.innerText()), 'un archivo de OSEP propone un formato de OSEP y el largo del renglón lo confirma');
    await $('import-format').selectOption('16'); await $('import-scale').selectOption('2');
    check(await $('import-concept').inputValue() === '602', 'al elegir la columna de voluntarios puros se propone el concepto 602');
    let text = await read();
    check(!await $('import-zero').isChecked() && /4 renglones → 4 filas por DNI/.test(text), 'los ceros del archivo se conservan sin una opción expresa');
    await $('import-zero').check(); check((await result.innerText()).trim() === '', 'cambiar la opción de ceros invalida la lectura anterior');
    text = await read();
    check(/4 renglones → 2 filas por DNI/.test(text) && /2 renglones en cero no se cargan, según la opción marcada\./.test(text) && /Con legajo encontrado: 2 · importe \$ 15\.600,00/.test(text), 'la omisión solicitada informa cuántos renglones cero quedaron fuera');

    // 2 · El largo del renglón elige el formato: un archivo de 80 con «Formato Junín» puesto pasa solo al de 80.
    await $('import-format').selectOption('1'); await choose('Junin2610.txt'); await page.waitForFunction(() => /se eligió/.test(document.querySelector('[data-n-import-hint]').textContent));
    check(await $('import-format').inputValue() === '17' && /Renglones de 80 posiciones: se eligió «Colegio Farmacéutico \/ SOEM \/ Tres Provincias \(80\)»\. Cambialo si no corresponde\./.test(await hint.innerText()), 'un archivo de 80 posiciones pasa solo al formato de 80 y la pantalla lo avisa');
    await $('import-concept').fill('620'); await $('import-scale').selectOption('2'); text = await read();
    check(/3 renglones → 3 filas por DNI/.test(text) && /importe \$ 37\.037,01/.test(text) && !/Atención/.test(text), 'con el formato propuesto el total es el del archivo');
    // Si igual se fuerza un formato de otro largo, lo lee «sin error»: el aviso es lo que lo delata.
    await $('import-format').selectOption('2'); text = await read();
    check(/Atención: los renglones tienen 80 posiciones/.test(text) === false && !/37\.037,01/.test(text), 'un formato sin largo conocido lee otro total y no puede avisar: por eso se propone el formato antes');

    // 3 · El archivo tal como llega: coma decimal, renglón corto, importe en cero, DNI sin legajo y persona con dos legajos.
    await choose('AMAS2610.txt'); await page.waitForFunction(() => /55 posiciones/.test(document.querySelector('[data-n-import-hint]').textContent));
    check(await $('import-format').inputValue() === '1' && !await $('import-lowest').isChecked() && !await $('import-zero').isChecked(), 'un archivo nuevo no hereda omisión de ceros ni elección de legajo');
    await $('import-zero').check();
    await $('import-concept').fill('665'); text = await read();
    check(/4 renglones → 3 filas por DNI/.test(text) && /1 renglón en cero no se carga, según la opción marcada\./.test(text) && /1 renglón más corto: el importe se tomó del final del renglón\./.test(text), 'la coma decimal y el renglón un carácter más corto se leen sin convertir el archivo');
    check(/Con legajo encontrado: 1 · importe \$ 18\.518,50/.test(text) && /Con más de un legajo activo: cargalos a mano eligiendo el legajo \(1\)/.test(text), 'la identidad ambigua queda sin asignar por defecto');
    await $('import-lowest').check(); check((await result.innerText()).trim() === '', 'elegir el legajo menor requiere una lectura nueva');
    text = await read();
    check(/Con legajo encontrado: 2 · importe \$ 20\.518,50/.test(text) && /Sin legajo activo para ese DNI \(1\)/.test(text) && /Con más de un legajo activo: se cargan al de número menor \(1\)/.test(text) && !/cargalos a mano/.test(text), 'quien tiene dos legajos activos va al de número menor y queda listado');
    await page.screenshot({ path: path.join(output, 'importar-archivo-de-entidad.png'), fullPage: true });
    // Si igual se fuerza un formato de otro largo que lo lee «sin error», el aviso lo delata antes de agregar nada.
    await $('import-format').selectOption('10'); text = await read();
    check(/Atención: los renglones tienen 55 posiciones y este formato suele tener 52\. Con ese largo suele usarse «Formato Junín · DNI e importe \(55\)»; revisá el total antes de agregar\./.test(text) && !/20\.518,50/.test(text), 'forzar un formato de otro largo da otro total y muestra una advertencia con el formato habitual');
    await $('import-format').selectOption('1'); text = await read();
    await page.locator('[data-n-import-add]').click(); await $('draft').waitFor({ state: 'visible' });
    const legajos = await page.locator('[data-n-rows] tbody tr td:nth-child(2) b').allInnerTexts();
    check(legajos.join('|') === 'Legajo 12|Legajo 874' && (await $('count').innerText()).startsWith('2 filas'), 'al lote entran el legajo único y el de número menor, nunca los dos');
    await page.locator('[data-n-rows] tbody tr button').first().click().catch(() => {});
    // Sin la casilla, la persona con dos legajos vuelve a quedar para carga manual, como antes.
    await $('import-lowest').uncheck(); check((await result.innerText()).trim() === '', 'cambiar la casilla descarta la lectura anterior');
    text = await read();
    check(/Con legajo encontrado: 1 · importe \$ 18\.518,50/.test(text) && /Con más de un legajo activo: cargalos a mano eligiendo el legajo \(1\)/.test(text) && !/número menor \(/.test(text), 'sin la casilla, quien tiene dos legajos queda para elegir a mano');
    for (const width of [1280, 390]) { await page.setViewportSize({ width, height: 900 }); check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'sin desborde horizontal a ' + width + ' px'); }
    assert.deepEqual(unexpected, [], 'pedidos inesperados'); assert.deepEqual(errors, [], 'errores de página');
    return { passed: true, checks: checks.length };
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(JSON.stringify(await runEntityImportVerification()) + '\n'); }
  catch (error) { process.stderr.write(String(error?.stack || error) + '\n'); process.exitCode = 1; }
}
