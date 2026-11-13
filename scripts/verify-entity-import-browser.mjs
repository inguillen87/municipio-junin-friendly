// «Importar archivo TXT de una entidad» en un navegador real, con datos exclusivamente sintéticos y sin base de datos.
// Comprueba en pantalla las reglas contrastadas el 13/11/2026 con los archivos reales de agosto y con la historia de GRH:
// el formato se propone leyendo el archivo, los decimales y el concepto se proponen solos, la coma decimal y el renglón
// corto se leen y los archivos originales de AMARU, Sancor y SMSV entran sin pasarlos a mano. Omitir los renglones en
// cero es una opción expresa, desmarcada en cada archivo nuevo. Quien tiene más de un legajo activo va a uno solo, y esa
// fila no entra hasta que se elige el legajo de una lista; el de número menor es una propuesta de un paso. Una planilla
// de Excel se pega tal cual y las columnas se eligen de listas. El lote sin enviar vuelve al mostrar la página sólo
// con la misma cuenta, autoridad e identidades vigentes; la fuente y sus filtros se retiran. No se envía ningún lote.
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
const POSTS = { 1203: ['Obras', 'Taller'], 874: ['Gobierno', null] };
const roster = PEOPLE.map(p => ({ contractId: uid(p.n), legajo: p.legajo, dni: p.dni, status: 'active', name: p.name, organization: POSTS[p.legajo]?.[0] ?? null, sector: POSTS[p.legajo]?.[1] ?? null }));
const junin = (dni, name, amount, width = 44, code = '665') => pad(code + '20' + dni + '0' + name, width) + amount;
const amaru = (code, dni, cents) => code + '20' + dni + '0' + pad('SOCIO SINTETICO', 30) + String(cents).padStart(10, '0');
const cofarm = (dni, digits) => pad('000' + dni + '000', 40) + '0000' + digits + pad('', 28);
const FILES = {
  // OSEP: todos los afiliados en todas las columnas; para el concepto 602 sólo dos traen valor.
  'osep2610.txt': ['20111222|1|0000520000', '40111222|0|0000000000', '50111222|2|0001040000', '60111222|0|0000000000'].map(x => { const [d, q, a] = x.split('|'); return '0000000' + d + pad('AFILIADO SINTETICO', 47) + '00450' + '0'.repeat(15) + q + a + '0'.repeat(92); }).join('\r\n') + '\r\n',
  // Farmacéutico / SOEM / Tres Provincias: renglones de 80, importe con decimales implícitos.
  'Junin2610.txt': [20111222, 40111222, 50111222].map(d => pad('000' + d + '000', 40) + '0000' + '01234567' + pad('', 28)).join('\r\n') + '\r\n',
  // Tal como llega de la entidad: coma decimal, un renglón un carácter más corto y una persona con dos legajos.
  'AMAS2610.txt': [junin('20111222', 'UNO, SINTETICA', '   18518,50'), junin('30111222', 'DOS SINTETICA', '    2000,00', 43), junin('40111222', 'CUATRO SINTETICA', '00000000,00'), junin('99111222', 'SIN LEGAJO', '     100,00')].join('\r\n') + '\r\n',
  // Originales de la entidad (hasta hoy se pasaban a mano a «Formato Junín»).
  // AMARU: cuota social y servicios en un mismo archivo; el código que escribe AMARU no distingue (casi todo dice 638).
  'MUN421026.txt': [amaru('638', '20111222', 250000), amaru('638', '20111222', 7500000), amaru('638', '40111222', 250000), amaru('639', '50111222', 250000)].join('\r\n') + '\r\n',
  // Sancor: DNI en la posición 3, importe con coma y centavos.
  'SOPORTE JUNIN OCTUBRE 2026.txt': [['20111222', '0012345,67'], ['40111222', '0000999,99']].map(([d, a]) => '42' + d + pad('ASEGURADO SINTETICO', 42) + a).join('\r\n') + '\r\n',
  // SMSV: 49 posiciones, importe de 8 dígitos con dos decimales implícitos.
  'C3000000.txt': [['20111222', '00123456'], ['50111222', '00000000']].map(([d, a]) => '452' + d + pad('SOCIO SINTETICO', 30) + a).join('\r\n') + '\r\n',
  // AMSA: 650 y 651 en el mismo archivo, cada renglón con su código.
  'AMSA_10_2026.TXT': [junin('20111222', 'UNO SINTETICA', '00004040.00', 44, '650'), junin('20111222', 'UNO SINTETICA', '00002304.33', 44, '651'), junin('40111222', 'CUATRO SINTETICA', '00004040.00', 44, '650')].join('\r\n') + '\r\n',
  // Una persona con dos renglones (se suman) y el mismo archivo pegado dos veces (no se ofrece sumar).
  'CN616.txt': [cofarm('20111222', '00010000'), cofarm('40111222', '00020000'), cofarm('40111222', '00005000'), cofarm('50111222', '00030000')].join('\r\n') + '\r\n',
};
FILES['CN616 copia.txt'] = FILES['CN616.txt'] + FILES['CN616.txt'];
const json = (res, status, value) => res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(value));

export async function runEntityImportVerification() {
  const output = path.join(root, 'verification', 'entity-import'); fs.mkdirSync(output, { recursive: true });
  const unexpected = [], errors = [], checks = []; let lastText = '', holdRoster = null; const check = (ok, name) => { assert.ok(ok, name + (ok ? '' : ' · leído: ' + lastText)); checks.push(name); fs.writeFileSync(path.join(output, 'progress.json'), JSON.stringify({ checks: checks.length, lastCheck: name }) + '\n'); };
  const makerCaps = [...OWN_NOVELTY_READ, OWN_NOVELTY_CAPS.prepare]; let authUser = 'sintetico', authCaps = makerCaps, canPrepare = true, currentSubjects = subjects;
  const bounded = async (promise, label, ms = 10000) => { let timer; try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Tiempo agotado: ' + label)), ms); })]); } finally { clearTimeout(timer); } };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://local.invalid');
    if (url.pathname === '/api/internal-auth') return json(res, 200, { ok: true, authenticated: true, sessionVersion: 2, user: { id: authUser, email: 'preparadora-qa@local.invalid' }, expiresAt: new Date(Date.now() + 3600000).toISOString(), access: { context: 'tenant', tenant: { id: uid(900), roleKey: 'maker' }, tenantCapabilities: authCaps } });
    if (url.pathname === '/api/internal-own-payroll-novelties' && req.method === 'GET' && url.searchParams.get('resource') === 'bootstrap') return json(res, 200, { ok: true, data: { version: 'own-payroll-novelty-bootstrap.v1', complete: true, subjects: currentSubjects, batches: [], permissions: { canPrepare, canApprove: false } } });
    if (url.pathname === '/api/internal-data' && url.searchParams.get('resource') === 'nativeroster') { if (holdRoster) return holdRoster(res); return json(res, 200, { ok: true, data: { rows: roster } }); }
    if (url.pathname.startsWith('/api/')) { unexpected.push(req.method + ' ' + url.pathname); return json(res, 418, { ok: false, error: 'Pedido inesperado en el ensayo sintético' }); }
    if (url.pathname === '/qa.html') return res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Importar archivo de entidad · QA sintético</title><style>body{margin:12px;font-family:system-ui}main{max-width:1100px;margin:auto;min-width:0}</style><main id="qa"></main><script type="module">import {mountOwnPayrollNovelties} from "/assets/own-payroll-novelties-panel.js";window.qaPanel=mountOwnPayrollNovelties(document.getElementById("qa"),()=>{});</script></html>');
    const file = path.resolve(root, '.' + url.pathname);
    if (!file.startsWith(path.join(root, 'assets') + path.sep) || !fs.existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': file.endsWith('.css') ? 'text/css' : 'application/javascript' }); fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
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
    await $('import-format').selectOption('16');
    check(await $('import-concept').inputValue() === '602' && await $('import-scale').inputValue() === '2', 'al elegir la columna de voluntarios puros se proponen el concepto 602 y los dos decimales');
    let text = await read();
    check(!(await $('import-zero').isChecked()) && /4 renglones → 4 filas por DNI/.test(text) && !/en cero no se/.test(text), 'por defecto se conservan los ceros explícitos del archivo');
    await $('import-zero').check(); check((await result.innerText()).trim() === '', 'cambiar la opción de ceros invalida la lectura anterior');
    text = await read(); check(/4 renglones → 2 filas por DNI/.test(text) && /2 renglones en cero no se cargan, según la opción marcada\./.test(text) && /Con legajo encontrado: 2 · importe \$ 15\.600,00/.test(text), 'la omisión de ceros es expresa y muestra cuántas filas quedaron afuera');

    // 2 · El largo del renglón elige el formato: un archivo de 80 con «Formato Junín» puesto pasa solo al de 80.
    await $('import-format').selectOption('1'); await choose('Junin2610.txt'); await page.waitForFunction(() => /se eligió/.test(document.querySelector('[data-n-import-hint]').textContent));
    check(await $('import-format').inputValue() === '17' && /Renglones de 80 posiciones: se eligió «Colegio Farmacéutico \/ IPV \/ SOEM \/ Tres Provincias \(80\)»\. Cambialo si no corresponde\./.test(await hint.innerText()) && await $('import-scale').inputValue() === '2', 'un archivo de 80 posiciones pasa solo al formato de 80, con sus decimales, y la pantalla lo avisa');
    check(await page.locator('[data-n-import-format] option', { hasText: 'IPV' }).first().getAttribute('value') === '17', 'IPV se importa con el formato «Colegio Farmacéutico»');
    await $('import-concept').fill('618'); text = await read();
    check(/3 renglones → 3 filas por DNI/.test(text) && /importe \$ 37\.037,01/.test(text) && !/Atención/.test(text), 'con el formato propuesto el total es el del archivo');
    // Si igual se fuerza un formato de otro largo, lo lee «sin error»: el aviso es lo que lo delata.
    await $('import-format').selectOption('2'); text = await read();
    check(/Atención: los renglones tienen 80 posiciones/.test(text) === false && !/37\.037,01/.test(text), 'un formato sin largo conocido lee otro total y no puede avisar: por eso se propone el formato antes');

    // Con un formato de largo conocido, el aviso lo delata antes de agregar nada.
    await $('import-format').selectOption('18'); await $('import-concept').fill('618'); text = await read();
    check(/Atención: los renglones tienen 80 posiciones y este formato suele tener 52\. Con ese largo suele usarse «Colegio Farmacéutico \/ IPV \/ SOEM \/ Tres Provincias \(80\)»; revisá el total antes de agregar\./.test(text) && !/37\.037,01/.test(text), 'forzar un formato de otro largo da otro total y muestra una advertencia con el formato habitual');

    // 3 · El archivo tal como llega: coma decimal, renglón corto, importe en cero, DNI sin legajo y persona con dos legajos.
    await choose('AMAS2610.txt'); await page.waitForFunction(() => /55 posiciones/.test(document.querySelector('[data-n-import-hint]').textContent));
    check(await $('import-format').inputValue() === '1' && /se eligió «Formato Junín · DNI e importe \(55\)»\. Cambialo si no corresponde\. Cada renglón dice concepto 665\./.test(await hint.innerText()) && await $('import-concept').inputValue() === '665', 'el concepto sale del propio archivo: cada renglón empieza con 665');
    check(await page.locator('input[data-n-import-lowest]').count() === 0 && await $('import-cents-box').isHidden() && !(await $('import-zero').isChecked()), 'no hay casilla de «número menor», la de centavos sólo aparece donde corresponde y un archivo nuevo vuelve a conservar ceros');
    await $('import-zero').check(); text = await read();
    check(/4 renglones → 3 filas por DNI/.test(text) && /1 renglón en cero no se carga, según la opción marcada\./.test(text) && /1 renglón más corto: el importe se tomó del final del renglón\./.test(text), 'la coma decimal y el renglón un carácter más corto se leen sin convertir el archivo');
    const pick = page.locator('[data-n-import-legajo]'), reread = async () => { lastText = (await result.innerText()).replace(/\s+/g, ' '); return lastText; };
    check(/Con legajo encontrado: 1 · importe \$ 18\.518,50/.test(text) && /Sin legajo activo para ese DNI \(1\)/.test(text) && /Con más de un legajo activo: va a uno solo, elegí cuál \(1\)/.test(text) && /Falta elegir 1: esa fila no entra al lote hasta que elijas el legajo\./.test(text) && /Agregar 1 fila al lote/.test(text), 'quien tiene dos legajos activos queda sin asignar: la fila no entra hasta elegir');
    check(await pick.count() === 1 && await pick.inputValue() === '' && (await pick.locator('option').allInnerTexts()).join('|') === 'Elegí el legajo|874 · Gobierno|1203 · Obras · Taller', 'la lista no trae nada elegido y dice de qué cargo es cada legajo');
    await page.screenshot({ path: path.join(output, 'importar-archivo-de-entidad.png'), fullPage: true });
    // La propuesta del número menor es un paso expreso: un botón, con la advertencia de que hay que revisar.
    check(/Proponer el legajo de número menor para la que falta/.test(await page.locator('[data-n-import-lowest]').innerText()) && /Es una propuesta/.test(text), 'el legajo de número menor se ofrece como propuesta, no se aplica solo');
    await page.locator('[data-n-import-lowest]').click(); await page.waitForFunction(() => document.querySelector('[data-n-import-legajo]')?.value !== ''); text = await reread();
    check(await pick.locator('option:checked').innerText() === '874 · Gobierno' && /Con legajo encontrado: 2 · importe \$ 20\.518,50/.test(text) && /Ya está elegido el legajo de cada persona/.test(text) && await page.locator('[data-n-import-lowest]').count() === 0, 'al pedir la propuesta queda elegido el de número menor y la fila entra');
    // Liquidaciones elige el otro legajo: la novedad cambia de legajo, no se duplica, y el total sigue igual.
    await pick.selectOption({ label: '1203 · Obras · Taller' }); await page.waitForFunction(() => document.querySelector('[data-n-import-legajo] option:checked')?.textContent.startsWith('1203')); text = await reread();
    check(/Con legajo encontrado: 2 · importe \$ 20\.518,50/.test(text) && await page.evaluate(() => document.activeElement?.matches('[data-n-import-legajo]')), 'al elegir otro legajo la lectura se actualiza sola y el foco queda en la lista');
    await pick.selectOption(''); await page.waitForFunction(() => document.querySelector('[data-n-import-legajo]')?.value === ''); text = await reread();
    check(/Con legajo encontrado: 1 · importe \$ 18\.518,50/.test(text) && /Falta elegir 1/.test(text), 'si se quita la elección, la fila vuelve a quedar afuera');
    await pick.selectOption({ label: '1203 · Obras · Taller' }); await page.waitForFunction(() => document.querySelector('[data-n-import-legajo] option:checked')?.textContent.startsWith('1203'));
    await page.evaluate(() => { window.qaConsumedSelect = document.querySelector('[data-n-import-legajo]'); window.qaConsumedAdd = document.querySelector('[data-n-import-add]'); });
    await page.locator('[data-n-import-add]').click(); await $('draft').waitFor({ state: 'visible' });
    const legajos = async () => (await page.locator('[data-n-rows] tbody tr td:nth-child(2) b').allInnerTexts()).join('|');
    check(await legajos() === 'Legajo 12|Legajo 1203' && (await $('count').innerText()).startsWith('2 filas'), 'al lote entran el legajo único y el elegido de la lista, nunca los dos');
    await page.evaluate(id => { window.qaConsumedSelect.value = id; window.qaConsumedSelect.dispatchEvent(new Event('change', { bubbles: true })); window.qaConsumedAdd.click(); }, uid(3));
    check(await legajos() === 'Legajo 12|Legajo 1203' && await pick.count() === 0 && await page.locator('[data-n-import-add]').count() === 0 && /Lectura agregada al lote: 2 filas/.test(await result.innerText()), 'agregar consume la lectura: cambiar el selector anterior no duplica el importe en el segundo cargo');
    const drafted = async () => (await page.locator('[data-n-rows] tbody tr').allInnerTexts()).map(t => t.replace(/\s+/g, ' '));

    // 4 · AMARU original: un archivo, dos conceptos. La cuota es el importe que tienen todos; lo demás va al 639.
    await choose('MUN421026.txt'); await page.waitForFunction(() => /54 posiciones/.test(document.querySelector('[data-n-import-hint]').textContent));
    check(await $('import-format').inputValue() === '103' && await $('import-concept').isDisabled() && await $('import-scale-box').isHidden() && /638 \(cuota\) y 639/.test(await $('import-concept').getAttribute('placeholder')), 'el archivo original de AMARU se reconoce solo y no pide concepto ni decimales');
    text = await read();
    check(/4 renglones → 4 filas por DNI/.test(text) && /Cuota social reconocida en el archivo: \$ 2\.500,00 → concepto 638 \(3 renglones\)\. Los demás importes → concepto 639 \(1 renglón\)\./.test(text) && /importe \$ 82\.500,00/.test(text), 'la cuota se reconoce en el archivo (no está fija) y se reparte en 638 y 639');
    check(/Agregar 4 filas al lote \(conceptos 638 y 639\)/.test(await page.locator('[data-n-import-add]').innerText()), 'el botón dice que entran los dos conceptos');
    await page.locator('[data-n-import-add]').click(); await page.waitForFunction(() => document.querySelectorAll('[data-n-rows] tbody tr').length >= 6 || /6 filas/.test(document.querySelector('[data-n-count]').textContent));
    check((await $('count').innerText()).startsWith('6 filas'), 'las cuatro filas de AMARU entran al mismo lote, cada una con su concepto');

    // 5 · Sancor original: se conservan centavos; truncar a pesos enteros requiere una elección expresa.
    await choose('SOPORTE JUNIN OCTUBRE 2026.txt'); await page.waitForFunction(() => /62 posiciones/.test(document.querySelector('[data-n-import-hint]').textContent));
    check(await $('import-format').inputValue() === '102' && await $('import-concept').inputValue() === '641' && await $('import-cents-box').isVisible() && await $('import-cents').isChecked(), 'el archivo original de Sancor se reconoce, propone el 641 y conserva centavos por defecto');
    text = await read();
    check(/importe \$ 13\.345,66/.test(text) && !/pesos enteros/.test(text), 'Sancor conserva por defecto el importe exacto facturado');
    await $('import-cents').uncheck(); check((await result.innerText()).trim() === '', 'cambiar la opción de centavos descarta la lectura anterior');
    text = await read(); check(/importe \$ 13\.344,00/.test(text) && /Se cargan pesos enteros, como viene saliendo en GRH: el archivo trae centavos y quedan sin descontar \$ 1,66 en total\./.test(text), 'la compatibilidad elegida muestra exactamente cuánto queda sin descontar');

    // 6 · SMSV original: 49 posiciones, sin punto decimal.
    await choose('C3000000.txt'); await page.waitForFunction(() => /49 posiciones/.test(document.querySelector('[data-n-import-hint]').textContent));
    check(await $('import-format').inputValue() === '101' && await $('import-concept').inputValue() === '675' && await $('import-scale-box').isHidden() && await $('import-cents-box').isHidden(), 'el archivo original de SMSV se reconoce y propone el 675 sin pedir decimales');
    text = await read(); check(/2 renglones → 2 filas por DNI/.test(text) && /importe \$ 1\.234,56/.test(text) && !/en cero no se carga/.test(text), 'SMSV se lee con sus dos decimales implícitos y conserva el cero explícito');

    // 7 · AMSA: 650 y 651 en un mismo «Formato Junín»; cada renglón entra con el concepto que trae.
    await choose('AMSA_10_2026.TXT'); await page.waitForFunction(() => /juntos los conceptos/.test(document.querySelector('[data-n-import-hint]').textContent));
    check(await $('import-format').inputValue() === '1' && await $('import-concept').isDisabled() && /El archivo trae juntos los conceptos 650 y 651: cada renglón se carga con el suyo\./.test(await hint.innerText()), 'un archivo con 650 y 651 juntos se avisa antes de leerlo y no pide concepto');
    text = await read();
    check(/3 renglones → 3 filas por DNI/.test(text) && /El archivo trae más de un concepto, según el código con que empieza cada renglón: concepto 650 \(2 renglones\) y concepto 651 \(1 renglón\)\./.test(text) && /Agregar 3 filas al lote \(conceptos 650 y 651\)/.test(text), 'la misma persona con 650 y 651 no es un repetido: cada renglón va a su concepto');

    // 8 · Repetidos: dos renglones de una persona se suman con un botón; un archivo pegado dos veces no se ofrece sumar.
    await choose('CN616.txt'); await page.waitForFunction(() => /80 posiciones/.test(document.querySelector('[data-n-import-hint]').textContent)); await $('import-concept').fill('616'); text = await read();
    check(/1 de 4 renglones no se pueden leer/.test(text) && /DNI repetido/.test(text) && await page.locator('[data-n-import-sum-now]').count() === 1, 'un DNI repetido se informa y se ofrece sumarlo ahí mismo');
    await page.locator('[data-n-import-sum-now]').click(); await page.waitForFunction(() => /Con legajo encontrado/.test(document.querySelector('[data-n-import-result]').textContent)); lastText = text = (await result.innerText()).replace(/\s+/g, ' ');
    check(await $('import-sum').isChecked() && /4 renglones → 3 filas por DNI/.test(text) && /1 renglón repetido se sumó al de la misma persona\./.test(text) && /importe \$ 650,00/.test(text), 'el botón marca «Sumar repetidos», vuelve a leer y dice qué sumó');
    await choose('CN616 copia.txt'); check(!(await $('import-sum').isChecked()), 'un archivo nuevo no hereda la autorización de sumar repetidos'); await page.waitForFunction(() => /80 posiciones/.test(document.querySelector('[data-n-import-hint]').textContent)); await $('import-concept').fill('616'); text = await read();
    check(/El archivo parece estar copiado dos veces: 5 de sus 8 renglones repiten un DNI que ya estaba, 4 con el mismo valor\./.test(text) && await page.locator('[data-n-import-sum-now]').count() === 0 && await page.locator('[data-n-import-add]').count() === 0, 'un archivo pegado dos veces se dice con todas las letras y no se ofrece sumarlo');

    // 9 · Planilla de Excel pegada (Club, tasas, embargos): sin armar un TXT. Las columnas se proponen por los títulos.
    const SHEET = ['LEGAJO\tAPELLIDO\tNOMBRE\tD.N.I Nº\tCONCEPTO\tIMPORTE\tOBS.', '46\tCINCO\tSINTETICA\t50.111.222\tCUOTA\t13.690,00\t', '47\tSEIS\tSINTETICA\t60111222\tCUOTA\t$ 2.500\t', '9999\tNADIE\tSINTETICO\t99111222\tCUOTA\t100\t', '\t\t\t\tTOTAL\t16.290,00\t'].join('\r\n');
    await page.locator('[data-n-paste-box] > summary').click(); check(await $('paste-columns').isHidden(), 'las listas de columnas aparecen recién cuando hay algo pegado');
    await $('paste').fill(SHEET); await page.waitForFunction(() => !document.querySelector('[data-n-paste-columns]').hidden);
    check(await $('paste-identity').inputValue() === '0' && await $('paste-kind').inputValue() === 'legajo' && await $('paste-amount').inputValue() === '5' && await $('paste-quantity').inputValue() === '' && (await $('paste-identity').locator('option').allInnerTexts()).slice(0, 2).join('|') === 'Elegí la columna|A · LEGAJO', 'al pegar se proponen la columna del legajo y la del importe por sus títulos');
    check(/4 filas pegadas, con títulos en la primera\. Revisá que las columnas propuestas sean las correctas\./.test(await $('paste-hint').innerText()), 'la pantalla dice cuántas filas llegaron y que hay títulos');
    await $('paste-read').click(); await page.waitForFunction(() => /Indicá el concepto/.test(document.querySelector('[data-n-import-result]').textContent));
    await $('paste-concept').fill('678'); await $('paste-read').click(); await page.waitForFunction(() => /Con legajo encontrado/.test(document.querySelector('[data-n-import-result]').textContent)); lastText = text = (await result.innerText()).replace(/\s+/g, ' ');
    check(/Planilla pegada: 4 renglones → 3 filas por legajo\. Con legajo encontrado: 2 · importe \$ 16\.190,00/.test(text) && /1 fila sin legajo ni DNI no se carga \(por ejemplo, un total\)\./.test(text) && /Sin legajo activo para ese legajo \(1\)/.test(text) && /Agregar 2 filas al lote \(concepto 678\)/.test(text), 'la planilla pegada se lee por legajo: el total queda afuera y el legajo que no existe se informa');
    await $('paste-kind').selectOption('dni'); check((await result.innerText()).trim() === '', 'cambiar una columna descarta la lectura anterior');
    await $('paste-identity').selectOption('3'); await $('paste-read').click(); await page.waitForFunction(() => /Con legajo encontrado/.test(document.querySelector('[data-n-import-result]').textContent)); lastText = text = (await result.innerText()).replace(/\s+/g, ' ');
    check(/→ 3 filas por DNI\. Con legajo encontrado: 2 · importe \$ 16\.190,00/.test(text), 'la misma planilla se puede leer por la columna del DNI');
    const before = Number((await $('count').innerText()).match(/^(\d+)/)[1]);
    await page.locator('[data-n-import-add]').click(); await page.waitForFunction(n => Number(document.querySelector('[data-n-count]').textContent.match(/^(\d+)/)?.[1]) === n + 2, before);
    check(/de la planilla pegada/.test(await $('status').innerText()), 'las filas de la planilla entran al mismo lote y el aviso dice de dónde vinieron');
    // La planilla real trae el nombre de la entidad arriba de los títulos y una columna con «jubilado», «cobrar a domicilio»…
    const REAL = ['CLUB SINTETICO - DESCUENTOS\t\t\t\t\t\t', SHEET.split('\r\n')[0], '46\tCINCO\tSINTETICA\t50.111.222\tCUOTA MES\t13.690,00\tBIEN', '47\tSEIS\tSINTETICA\t60111222\tJUBILADO\t13.690,00\t', '12\tUNO\tSINTETICA\t20111222\tCUOTA MES\t\tSIN FICHA'].join('\r\n');
    await $('paste').fill(REAL); await page.waitForFunction(() => /títulos en la fila 2/.test(document.querySelector('[data-n-paste-hint]').textContent));
    check(/3 filas pegadas, con los títulos en la fila 2\./.test(await $('paste-hint').innerText()) && await $('paste-values').isHidden() && await $('paste-filter').inputValue() === '', 'los títulos se encuentran aunque haya un encabezado arriba, y no se filtra nada sin pedirlo');
    await $('paste-filter').selectOption({ label: 'E · CONCEPTO' }); await $('paste-values').waitFor({ state: 'visible' });
    const ticks = page.locator('[data-n-paste-value]');
    check(await ticks.count() === 2 && (await $('paste-value-list').innerText()).replace(/\s+/g, ' ').trim() === 'CUOTA MES · 2 filas JUBILADO · 1 fila' && await ticks.evaluateAll(xs => xs.every(x => x.checked)), 'al elegir la columna aparecen sus valores con la cantidad de filas, todos tildados');
    await page.locator('[data-n-paste-value="JUBILADO"]').uncheck(); await $('paste-read').click(); await page.waitForFunction(() => /Con legajo encontrado/.test(document.querySelector('[data-n-import-result]').textContent)); lastText = text = (await result.innerText()).replace(/\s+/g, ' ');
    check(/3 renglones → 1 fila por legajo\. Con legajo encontrado: 1 · importe \$ 13\.690,00/.test(text) && /1 fila quedó afuera por los valores destildados\./.test(text) && /1 fila sin importe ni cantidad no se carga: la 5\. Revisá que no falte un valor\./.test(text), 'lo destildado queda afuera y quien no trae importe se informa con su fila');
    await $('paste-filter').selectOption({ label: 'B · APELLIDO' }); check(await $('paste-values').isVisible() && await ticks.count() === 3, 'se puede cambiar la columna del filtro');
    await $('paste-filter').selectOption('');
    await $('paste').fill('una sola columna\n12\n13'); await page.waitForFunction(() => /al menos dos columnas/.test(document.querySelector('[data-n-paste-hint]').textContent));
    check(await $('paste-columns').isHidden(), 'si lo pegado no es una planilla se dice y no se ofrecen columnas');
    await $('paste').fill(SHEET); await page.waitForFunction(() => !document.querySelector('[data-n-paste-columns]').hidden);
    await page.screenshot({ path: path.join(output, 'pegar-planilla-de-excel.png'), fullPage: true });

    // La planilla comparte las guardas de una lectura única, pero conserva sus propias decisiones por contenido.
    await $('import-sum').check(); await $('import-zero').check();
    await $('paste').fill('DNI\tIMPORTE\n30111222\t100,01\n50111222\t0');
    check(!(await $('import-sum').isChecked()) && !(await $('import-zero').isChecked()), 'otra planilla no hereda sumar repetidos ni omitir ceros');
    await $('paste-concept').fill('640'); await $('paste-read').click(); await page.waitForFunction(() => /Con legajo encontrado/.test(document.querySelector('[data-n-import-result]').textContent));
    check(await page.locator('[data-n-import-legajo="30111222"]').inputValue() === '' && /2 renglones → 2 filas por DNI/.test(await result.innerText()), 'la planilla conserva el cero y exige elegir el contrato del DNI con dos cargos');
    await page.locator('[data-n-import-legajo="30111222"]').selectOption(uid(2));
    const beforeSheetChoice = Number((await $('count').innerText()).match(/^(\d+)/)[1]);
    await page.evaluate(() => { window.qaSheetSelect = document.querySelector('[data-n-import-legajo]'); window.qaSheetAdd = document.querySelector('[data-n-import-add]'); });
    await page.locator('[data-n-import-add]').click();
    await page.evaluate(id => { window.qaSheetSelect.value = id; window.qaSheetSelect.dispatchEvent(new Event('change', { bubbles: true })); window.qaSheetAdd.click(); }, uid(3));
    check(Number((await $('count').innerText()).match(/^(\d+)/)[1]) === beforeSheetChoice + 2 && await page.locator('[data-n-import-legajo]').count() === 0 && await page.locator('[data-n-import-add]').count() === 0, 'la lectura de planilla también se consume y sus controles viejos no duplican el descuento en otro cargo');
    await $('paste').fill('LEGAJO\tIMPORTE\tGRUPO\n46\t100,00\tCARGAR\n47\t200,00\tEXCLUIR');
    await $('paste-read').click(); await page.waitForFunction(() => /Con legajo encontrado/.test(document.querySelector('[data-n-import-result]').textContent));
    await page.evaluate(() => { window.qaOldSheetAdd = document.querySelector('[data-n-import-add]'); }); await $('paste-concept').fill('641'); await page.evaluate(() => window.qaOldSheetAdd.click());
    check((await result.innerText()).trim() === '' && Number((await $('count').innerText()).match(/^(\d+)/)[1]) === beforeSheetChoice + 2, 'cambiar el concepto de la planilla retira la lectura y desactiva su botón anterior');
    await $('paste-filter').selectOption('2'); await page.locator('[data-n-paste-value="EXCLUIR"]').uncheck();
    await $('paste-read').click(); await page.waitForFunction(() => /Con legajo encontrado/.test(document.querySelector('[data-n-import-result]').textContent)); await page.locator('[data-n-paste-value="EXCLUIR"]').check();
    check((await result.innerText()).trim() === '' && await page.locator('[data-n-import-add]').count() === 0, 'cambiar una casilla del filtro obliga a releer la planilla antes de agregar');

    // 10 · Respuestas demoradas: ni bytes ni padrón de A pueden reaparecer después de elegir B.
    const delayNextFileRead = async () => page.evaluate(() => { const original = File.prototype.arrayBuffer; let next = true; File.prototype.arrayBuffer = function () { if (!next) return original.call(this); next = false; const file = this; return new Promise(resolve => { window.qaReleaseFile = async () => { resolve(await original.call(file)); await new Promise(done => setTimeout(done, 0)); File.prototype.arrayBuffer = original; }; }); }; });
    await choose('SOPORTE JUNIN OCTUBRE 2026.txt'); await page.waitForFunction(() => /62 posiciones/.test(document.querySelector('[data-n-import-hint]').textContent));
    await delayNextFileRead(); await $('import-read').click(); await page.waitForFunction(() => typeof window.qaReleaseFile === 'function');
    await choose('C3000000.txt'); await page.waitForFunction(() => /49 posiciones/.test(document.querySelector('[data-n-import-hint]').textContent));
    await page.evaluate(async () => { await window.qaReleaseFile(); delete window.qaReleaseFile; });
    check((await result.innerText()).trim() === '' && await $('import-format').inputValue() === '101' && await $('import-concept').inputValue() === '675', 'los bytes demorados del archivo anterior no restauran su lectura ni cambian el concepto nuevo');
    text = await read(); check(/C3000000\.txt: 2 renglones/.test(text) && /importe \$ 1\.234,56/.test(text), 'el archivo nuevo sigue pudiendo leerse después de descartar los bytes viejos');
    await delayNextFileRead(); await $('import-read').click(); await page.waitForFunction(() => typeof window.qaReleaseFile === 'function'); await $('import-zero').check();
    await page.evaluate(async () => { await window.qaReleaseFile(); delete window.qaReleaseFile; });
    check((await result.innerText()).trim() === '', 'cambiar una opción durante la lectura invalida la respuesta pendiente');
    text = await read(); check(/2 renglones → 1 fila por DNI/.test(text) && /1 renglón en cero no se carga/.test(text), 'una nueva lectura aplica solamente las opciones revisadas');
    await delayNextFileRead(); await choose('SOPORTE JUNIN OCTUBRE 2026.txt'); await page.waitForFunction(() => typeof window.qaReleaseFile === 'function'); await $('import-format').selectOption('17');
    await page.evaluate(async () => { await window.qaReleaseFile(); delete window.qaReleaseFile; });
    check(await $('import-format').inputValue() === '17' && (await hint.innerText()).trim() === '', 'la detección demorada del formato respeta una selección manual posterior');

    await page.reload(); await $('refresh').click(); await page.waitForFunction(() => document.querySelector('[data-n-content]')?.hidden === false); await $('period').fill('2026-10'); await page.locator('[data-n-import-box] > summary').click();
    await choose('SOPORTE JUNIN OCTUBRE 2026.txt'); await page.waitForFunction(() => /62 posiciones/.test(document.querySelector('[data-n-import-hint]').textContent));
    // Consumir una copia permite observar el fin de la respuesta aunque el panel descarte sus cabeceras por obsoletas.
    await page.evaluate(() => { const original = window.fetch.bind(window); window.fetch = async (...args) => { const response = await original(...args); if (String(args[0]).includes('resource=nativeroster')) await response.clone().arrayBuffer(); return response; }; });
    const pendingRoster = new Promise(resolve => { holdRoster = resolve; }); await $('import-read').click(); const oldRosterResponse = await bounded(pendingRoster, 'esperar padrón retenido').catch(async error => { throw Error(error.message + ' · panel: ' + await result.innerText() + ' · estado: ' + await $('status').innerText() + ' · errores: ' + errors.join(', ')); }); holdRoster = null;
    await choose('C3000000.txt'); await page.waitForFunction(() => /49 posiciones/.test(document.querySelector('[data-n-import-hint]').textContent));
    const networkResponse = page.waitForResponse(response => response.url().includes('resource=nativeroster')); json(oldRosterResponse, 200, { ok: true, data: { rows: roster } }); await bounded((await networkResponse).finished(), 'terminar respuesta del padrón');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    check((await result.innerText()).trim() === '' && await page.locator('[data-n-import-add]').count() === 0 && await $('import-concept').inputValue() === '675', 'el padrón demorado de la lectura anterior no repone filas ni permite agregarlas con otro archivo visible');
    text = await read(); check(/C3000000\.txt: 2 renglones/.test(text) && /importe \$ 1\.234,56/.test(text), 'después de descartar el padrón viejo el archivo actual se resuelve correctamente');

    // El padrón de una planilla pendiente tampoco puede reemplazar contenido pegado más recientemente.
    await page.reload(); await $('refresh').click(); await page.waitForFunction(() => document.querySelector('[data-n-content]')?.hidden === false); await $('period').fill('2026-10'); await page.locator('[data-n-import-box] > summary').click(); await page.locator('[data-n-paste-box] > summary').click();
    await $('paste').fill('LEGAJO\tIMPORTE\n46\t100,00'); await $('paste-concept').fill('678');
    await page.evaluate(() => { const original = window.fetch.bind(window); window.fetch = async (...args) => { const response = await original(...args); if (String(args[0]).includes('resource=nativeroster')) await response.clone().arrayBuffer(); return response; }; });
    const pendingSheetRoster = new Promise(resolve => { holdRoster = resolve; }); await $('paste-read').click(); const oldSheetRosterResponse = await bounded(pendingSheetRoster, 'esperar padrón de planilla retenido'); holdRoster = null;
    await $('paste').fill('LEGAJO\tIMPORTE\n46\t999,01'); await $('paste-concept').fill('640');
    const sheetNetworkResponse = page.waitForResponse(response => response.url().includes('resource=nativeroster')); json(oldSheetRosterResponse, 200, { ok: true, data: { rows: roster } }); await bounded((await sheetNetworkResponse).finished(), 'terminar respuesta del padrón de planilla');
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    check((await result.innerText()).trim() === '' && await page.locator('[data-n-import-add]').count() === 0 && await $('paste-concept').inputValue() === '640', 'el padrón demorado no restaura la planilla anterior ni su concepto');
    await $('paste-read').click(); await page.waitForFunction(() => /Con legajo encontrado/.test(document.querySelector('[data-n-import-result]').textContent));
    check(/importe \$ 999,01/.test(await result.innerText()) && /concepto 640/.test(await result.innerText()), 'la planilla actual sigue pudiendo leerse tras descartar la respuesta anterior');
    await page.screenshot({ path: path.join(output, 'importar-archivos-originales.png'), fullPage: true });

    // Títulos de dos renglones y una columna HORAS intermedia: la cantidad requiere una decisión expresa.
    await $('paste').fill('LEGAJO\tHORAS\t"IMPORTE\nFINAL"\n46\t30\t97.200,00');
    await $('paste-read').click(); await page.waitForFunction(() => /Con legajo encontrado/.test(document.querySelector('[data-n-import-result]').textContent));
    check(await $('paste-quantity').inputValue() === '' && await $('paste-amount').inputValue() === '2' && /importe \$ 97\.200,00/.test(await result.innerText()), 'los títulos multilínea conservan el importe y HORAS no se propone como cantidad cuando hay importe');
    await $('paste').fill('LEGAJO\tIMPORTE\tNOTA\n46\t100,00\t"nota sin cerrar\n47\t200,00\totra'); await $('paste-read').click();
    check(/celda entre comillas inválida/.test(await result.innerText()) && await page.locator('[data-n-import-add]').count() === 0, 'una comilla sin cerrar rechaza toda la selección sin perder silenciosamente la persona siguiente');

    // Ocultar retira la fuente y el DOM; sólo queda el borrador en memoria, con su cuenta, autoridad e identidades.
    const idle = () => page.waitForFunction(() => document.querySelector('#qa').getAttribute('aria-busy') === 'false');
    const hide = () => page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    const show = async () => { await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); }); await $('refresh').click(); await idle(); await $('content').waitFor({ state: 'visible' }); };
    const clearDraft = async () => { await page.evaluate(() => window.qaPanel.deny()); await show(); };
    const loadDraft = async (text = 'LEGAJO\tIMPORTE\tNOMBRE\n46\t100,01\tFUENTE SINTETICA CINCO\n47\t0\tFUENTE SINTETICA SEIS') => {
      await $('period').fill('2026-10'); await $('type').selectOption('supplementary');
      await page.locator('[data-n-import-box], [data-n-paste-box]').evaluateAll(elements => elements.forEach(el => { el.open = true; }));
      await $('paste').fill(text); await $('paste-concept').fill('678'); await $('paste-read').click();
      await page.waitForFunction(() => /Con legajo encontrado/.test(document.querySelector('[data-n-import-result]').textContent)); await page.locator('[data-n-import-add]').click();
    };
    await loadDraft(); await $('paste-filter').selectOption('2');
    await $('review').click(); await idle(); await $('confirm').check();
    await hide();
    check(/Tu lote sin guardar \(2 filas\) se conserva/.test(await $('status').innerText()) && await $('content').isHidden() && await page.locator('[data-n-rows] tbody tr').count() === 0 && await $('paste').inputValue() === '', 'al ocultar se retiran las filas y la fuente, y se conserva sólo el lote sin enviar');
    check(await $('paste-value-list').textContent() === '' && await page.locator('[data-n-paste-identity] option, [data-n-paste-amount] option, [data-n-paste-quantity] option, [data-n-paste-filter] option').count() === 0 && await $('paste-columns').isHidden() && await $('paste-values').isHidden() && await $('paste-hint').textContent() === '', 'al retirar la vista también desaparecen las etiquetas de fuente, columnas y filtros del DOM');
    await show();
    check(/Recuperé tu lote sin guardar: 2 filas/.test(await $('restored').innerText()) && /^2 filas/.test(await $('count').innerText()) && await $('period').inputValue() === '2026-10' && await $('type').inputValue() === 'supplementary', 'la misma cuenta recupera todas las filas, período y tipo con identidades recién verificadas');
    check(await $('confirm-box').isHidden() && !(await $('confirm').isChecked()) && await $('send').isHidden() && await page.locator('[data-n-import-add]').count() === 0, 'restaurar filas exige revisar otra vez y no restaura la confirmación ni una lectura consumida');
    const amountFirst = page.getByRole('textbox', { name: 'Importe fila 1', exact: true });
    check(await amountFirst.isEnabled() && await page.getByRole('button', { name: 'Retirar fila 2', exact: true }).isEnabled(), 'al terminar la consulta el lote restaurado permite editar valores y retirar filas');
    await amountFirst.fill('101,01'); await amountFirst.press('Tab'); await page.getByRole('button', { name: 'Retirar fila 2', exact: true }).click();
    check(/^1 fila/.test(await $('count').innerText()) && await page.getByRole('textbox', { name: 'Importe fila 1', exact: true }).inputValue() === '101,01', 'editar y retirar actúan sobre el lote restaurado sin depender de otra paginación');
    await loadDraft('LEGAJO\tIMPORTE\n47\t0'); await hide(); currentSubjects = subjects.map(s => s.contractId === uid(5) ? { ...s, identityToken: 'f'.repeat(64) } : s); await show();
    check(/^1 fila/.test(await $('count').innerText()) && /1 fila no volvió porque ese legajo cambió/.test(await $('restored').innerText()) && /Legajo 47/.test(await $('rows').innerText()) && !/Legajo 46/.test(await $('rows').innerText()), 'una identidad cambiada no vuelve al borrador y las filas aún vigentes se conservan con aviso');
    currentSubjects = subjects; await clearDraft(); await loadDraft(); await hide();
    await page.evaluate(() => { window.qaRealDateNow = Date.now; Date.now = () => window.qaRealDateNow() + 31 * 60 * 1000; });
    try { await show(); check(/pasó más de media hora/.test(await $('restored').innerText()) && await $('draft').isHidden(), 'el borrador vence después de media hora y no se recupera'); }
    finally { await page.evaluate(() => { Date.now = window.qaRealDateNow; delete window.qaRealDateNow; }); }
    await loadDraft(); await hide(); await page.evaluate(caps => document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready', { detail: { tenantCapabilities: caps } })), OWN_NOVELTY_READ); await show();
    check(await $('draft').isHidden() && await $('restored').isHidden(), 'una revocación de preparar recibida mientras la vista está oculta descarta el borrador aunque luego vuelvan los permisos');
    await loadDraft(); await hide(); authCaps = [...OWN_NOVELTY_READ]; await show();
    // Playwright isDisabled() recognizes form controls, not FIELDSET itself. Verify its native property and its actual children.
    const revokedState = { draftHidden: await $('draft').isHidden(), fieldsetDisabled: await $('fields').evaluate(e => e.disabled), rowCount: await page.locator('[data-n-rows] tbody tr').count(), sendHidden: await $('send').isHidden(), restored: await $('restored').innerText(), controls: Object.fromEntries(await Promise.all(['search', 'paste', 'period', 'add', 'paste-read'].map(async key => [key, await $(key).isDisabled()]))) };
    fs.writeFileSync(path.join(output, 'revoked-state.json'), JSON.stringify(revokedState, null, 2) + '\n');
    check(revokedState.draftHidden && revokedState.fieldsetDisabled === true && revokedState.rowCount === 0 && revokedState.sendHidden && Object.values(revokedState.controls).every(v => v === true) && /cambió la autorización/.test(revokedState.restored), 'la autorización recién consultada también impide restaurar al perder preparar sin recibir un evento');
    authCaps = makerCaps; await $('refresh').click(); await idle(); await loadDraft(); await hide(); canPrepare = false; await show();
    check(await $('draft').isHidden() && /cambió la autorización/.test(await $('restored').innerText()), 'el permiso canPrepare del bootstrap vigente es obligatorio para restaurar');
    canPrepare = true; await $('refresh').click(); await idle(); await loadDraft(); await $('paste-filter').selectOption('2'); await hide(); authUser = 'otra-cuenta-sintetica'; await show();
    check(await $('draft').isHidden() && /cambió la cuenta o el ámbito/.test(await $('restored').innerText()) && await $('paste-value-list').textContent() === '' && await page.locator('[data-n-paste-identity] option, [data-n-paste-filter] option').count() === 0 && !(await $('content').innerText()).includes('FUENTE SINTETICA'), 'otra cuenta no recupera el borrador ni las etiquetas nominales de la fuente anterior');
    await loadDraft(); await page.evaluate(() => window.dispatchEvent(new Event('pagehide'))); await show();
    check(await $('draft').isHidden() && await $('restored').isHidden(), 'salir de la página descarta un lote real sin enviar y no lo restaura al consultar');
    for (const width of [1280, 390]) { await page.setViewportSize({ width, height: 900 }); check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'sin desborde horizontal a ' + width + ' px'); }
    assert.deepEqual(unexpected, [], 'pedidos inesperados'); assert.deepEqual(errors, [], 'errores de página');
    return { passed: true, checks: checks.length };
  } catch (error) { fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ error: error.stack ?? String(error), checks, lastText }, null, 2) + '\n'); throw error; }
  finally { try { if(browser)await bounded(browser.close(), 'cerrar navegador', 15000); } finally { server.closeAllConnections(); await bounded(new Promise(resolve => server.close(resolve)), 'cerrar servidor'); } }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(JSON.stringify(await runEntityImportVerification()) + '\n'); }
  catch (error) { process.stderr.write(String(error?.stack || error) + '\n'); process.exitCode = 1; }
}
