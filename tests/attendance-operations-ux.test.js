import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const html = read('relojes-marcaciones.html');

function renderedReceptionSummary(hardwareConnected, punchCount = 3) {
  const output = new Map();
  const classes = new Map();
  const classList = id => ({ toggle(name, enabled) { classes.set(id + ':' + name, enabled); } });
  const context = {
    state: { summary: { punchCount }, features: { hardwareConnected } },
    object: value => value || {}, number: value => Number(value) || 0,
    formatCount: value => String(value ?? 0), setText: (id, value) => output.set(id, value),
    el: { hardwareState: { classList: classList('state') }, hardwareFeature: { classList: classList('feature') } },
  };
  const start = html.indexOf('function renderSummary()');
  const end = html.indexOf('function normalizeBootstrap(', start);
  assert.ok(start >= 0 && end > start);
  vm.runInNewContext(html.slice(start, end) + '\nrenderSummary();', context);
  return { output, classes };
}

test('un acuse reciente también puede ser una captura antigua de la cola', () => {
  // The bootstrap provides no capture timestamp or queue depth with this flag.
  const { output, classes } = renderedReceptionSummary(true);
  assert.equal(output.get('truthTitle'), 'Recepción reciente confirmada');
  assert.match(output.get('truthCopy'), /captura anterior pendiente de envío/);
  assert.match(output.get('truthCopy'), /no verifica conexión física, captura automática ni que la cola esté vacía/);
  assert.match(output.get('truthCopy'), /En la última consulta/);
  assert.match(output.get('hardwareState'), /Acuse confirmado/);
  assert.equal(output.get('hardwareFeature'), 'Confirmada');
  assert.equal(classes.get('state:connected'), true);
  assert.equal(output.get('punchCount'), '3');
});

test('la falta de acuse reciente no declara el reloj desconectado ni la automatización pendiente', () => {
  for (const count of [0, 3]) {
    const { output, classes } = renderedReceptionSummary(false, count);
    assert.match(output.get('truthTitle'), /sin recepción reciente confirmada/i);
    assert.match(output.get('truthCopy'), /no permite saber si el reloj está conectado o si el colector está funcionando/);
    assert.equal(output.get('hardwareFeature'), 'No confirmada');
    assert.equal(classes.get('state:connected'), false);
    assert.doesNotMatch([...output.values()].join(' '), /Equipos todavía no conectados|automatización pendiente/);
  }
});

test('un flag ausente o textual no se convierte en un acuse confirmado', () => {
  for (const flag of [undefined, null, 'true', 1]) {
    assert.equal(renderedReceptionSummary(flag).output.get('hardwareState'), 'Sin acuse reciente confirmado');
  }
});

test('la vista separa el inventario reportado del estado operativo del backend', () => {
  for (const fact of [
    '>13</strong><span>Puntos de marcación',
    '>11</strong><span>Equipos K20',
    '>1</strong><span>Equipo SF300',
    '>1</strong><span>Equipo MB360',
    '>7</strong><span>Extracción por red',
    '>6</strong><span>Extracción por medio removible',
  ]) assert.ok(html.includes(fact), `falta evidencia: ${fact}`);

  assert.match(html, /Evidencia recibida · no conexión/);
  assert.match(html, /no acredita que esos aparatos ya envíen eventos/i);
  assert.match(html, /hardwareConnected===true/);
  assert.match(html, /Sin acuse reciente confirmado/);
  assert.match(html, /Recepción reciente confirmada/);
  assert.doesNotMatch(html, /Conexión confirmada por backend|Hardware conectado|automatización pendiente|Equipos todavía no conectados/);
  for (const point of ['PM-01', 'PM-07', 'PM-13', 'Desarrollo Social', 'Delegación Medrano']) {
    assert.match(html, new RegExp(point));
  }
  assert.match(html, /radio de geocerca todavía requieren verificación técnica/i);
  assert.doesNotMatch(html, /hardwareConnected\s*:\s*true/);
});

test('los indicadores operativos se completan sólo con el bootstrap privado', () => {
  for (const id of [
    'siteCount', 'deviceCount', 'activeConnectorCount', 'connectorCountCopy',
    'punchCount', 'rawEventCountCopy', 'unmatchedPunchCount', 'pendingReviewCount',
  ]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /\/api\/internal-attendance/);
  assert.match(html, /apiUrl\('bootstrap'\)/);
  assert.match(html, /credentials:'same-origin'/);
  assert.match(html, /cache:'no-store'/);
  assert.match(html, /attendance\.read/);
  assert.match(html, /capabilities\.includes\('attendance\.read'\)/);
  assert.doesNotMatch(html, /friendly-data\.json|attendance-readiness-evidence\.v1\.json/);
});

test('los cinco listados operativos tienen tabs, paginación y estados completos', () => {
  for (const resource of ['site', 'device', 'connector', 'punch', 'batch']) {
    assert.match(html, new RegExp(`data-resource="${resource}"`));
    assert.match(html, new RegExp(`${resource}:\\{title:`));
  }
  for (const id of [
    'loadingState', 'emptyState', 'listError', 'retryList', 'retryData',
    'previousPage', 'nextPage', 'refreshButton', 'liveStatus',
  ]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /role="tablist"/);
  assert.match(html, /role="tabpanel"/);
  assert.match(html, /ArrowRight/);
  assert.match(html, /ArrowLeft/);
  assert.match(html, /async function selectResource\(resource\).*?await loadList\(\)/s);
  assert.match(html, /async function handleTabKeys\(event\).*?await selectResource\(resources\[current\]\).*?\.focus\(\)/s);
  assert.match(html, /pageSize',String\(PAGE_SIZE\)/);
  assert.match(html, /replaceChildren\(\)/);
  assert.doesNotMatch(html, /\.innerHTML\s*=/);
});

test('Auditoría aparece sólo con capability dedicada y proyecta un resumen no sensible', () => {
  assert.match(html, /id="tab-audit"[^>]+data-resource="audit"[^>]+hidden/);
  assert.match(html, /attendance\.audit\.read/);
  assert.match(html, /auditTab\.hidden=!state\.capabilities\.has\('attendance\.audit\.read'\)/);
  assert.match(html, /availableResources\(\)/);
  assert.match(html, /audit:\{title:'Auditoría de control horario'/);
  assert.match(html, /auditAction\(item\.command\)/);
  assert.match(html, /auditTarget\(item\.targetKind\)/);
  assert.match(html, /shortAuditId\(item\.targetId\)/);
  assert.match(html, /item\.actorKind/);
  assert.match(html, /item\.actorRole\|\|item\.roleKey/);
  assert.match(html, /formatInstant\(item\.occurredAt\)/);
  for (const sensitive of [
    'item.before', 'item.after', 'item.result', 'item.releaseSha',
    'item.actorMembershipId', 'item.connectorId',
  ]) assert.equal(html.includes(sensitive), false, `la UI no debe leer ${sensitive}`);
});

test('el commissioning físico exige capability dedicada y conserva el estado del equipo', () => {
  assert.match(html, /attendance\.device\.manage/);
  assert.match(html, /if\(canManageDevices\(\)\)row\.append\(commissioningCell\(item\)\)/);
  assert.match(html, />Registrar datos físicos</);
  assert.match(html, /id="deviceDialog"[^>]+aria-labelledby="deviceDialogTitle"/);

  for (const field of [
    'deviceSerialNumber', 'deviceFirmwareVersion', 'deviceProtocolKey',
    'deviceNetworkHost', 'deviceNetworkPort',
  ]) assert.match(html, new RegExp(`id="${field}"`));

  const dialog = html.match(/<dialog class="device-dialog"[\s\S]*?<\/dialog>/)?.[0] || '';
  assert.ok(dialog);
  assert.doesNotMatch(dialog, /type="(?:password|file)"|name="(?:credential|biometric|status)"/i);
  assert.match(dialog, /Esta acción no activa el reloj/);
  assert.match(html, /Pendiente de homologación/);
  assert.match(html, /isNetworkTransport\(item\.transport\)/);
  assert.match(html, /deviceNetworkFields\.hidden=!network/);
  assert.match(html, /Para medio removible no se envían IP ni puerto/);

  const payloadBuilder = html.match(/function deviceUpdatePayload\([\s\S]*?return payload\}/)?.[0] || '';
  assert.match(payloadBuilder, /id:item\.id,expectedVersion:Number\(item\.version\)/);
  for (const field of ['serialNumber', 'firmwareVersion', 'protocolKey', 'networkHost']) {
    assert.match(payloadBuilder, new RegExp(`'${field}'`));
  }
  assert.match(payloadBuilder, /payload\.networkPort=port/);
  assert.doesNotMatch(payloadBuilder, /status|active|credential|biometric/i);
});

test('el guardado físico usa POST JSON same-origin, UUID v4 e idempotencia', () => {
  assert.match(html, /postCommand\('device\.update',payload\)/);
  assert.match(html, /method:'POST'/);
  assert.match(html, /credentials:'same-origin'/);
  assert.match(html, /'Content-Type':'application\/json'/);
  assert.match(html, /'Idempotency-Key':idempotencyUuid\(\)/);
  assert.match(html, /crypto/);
  assert.match(html, /randomUUID/);
  assert.match(html, /bytes\[6\]=\(bytes\[6\]&15\)\|64/);
  assert.match(html, /JSON\.stringify\(\{command:command,payload:payload\}\)/);
  assert.match(html, /error&&error\.status===409/);
  assert.match(html, /error&&error\.status===422/);
  assert.match(html, /reloadAfterDeviceMutation\(\)/);
  assert.match(html, /la conexión física sigue pendiente de verificación/i);
});

test('la UX no simula fichadas ni expone biometría o seguimiento continuo', () => {
  assert.match(html, /no almacena plantillas de huella/i);
  assert.match(html, /No se almacenan/);
  assert.match(html, /no crea fichadas de muestra/i);
  assert.match(html, /OpenStreetMap aporta sólo el mapa base/i);
  assert.match(html, /Concentración de puntos \(no personas ni fichadas\)/);
  assert.match(html, /heatMetric&&payload\.heatMetric!==['"]reported_site_density['"]/);
  assert.doesNotMatch(html, /navigator\.geolocation|google\.maps|mapbox|type="file"|getUserMedia/i);
  assert.doesNotMatch(html, /localStorage|sessionStorage|document\.cookie|console\./);
  assert.doesNotMatch(html, /Crear marcación|Simular fichada|Conectar ahora/);
});

test('la página mantiene accesibilidad y sintaxis de script válida', () => {
  assert.match(html, /lang="es-AR"/);
  assert.match(html, /min-width:320px/);
  assert.match(html, /min-height:44px/);
  assert.match(html, /class="skip-link"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /@media\(max-width:820px\)/);
  assert.match(html, /@media\(max-width:520px\)/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(html, /data-mc-page="attendance"/);
  assert.equal((html.match(/assets\/internal-guide\.js/g) || []).length, 1);

  let count = 0;
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/.test(match[1])) continue;
    count += 1;
    new vm.Script(match[2], { filename: 'relojes-marcaciones.html' });
  }
  assert.equal(count, 1);
});

test('build, login, navegación y Vercel publican la ruta privada', () => {
  assert.match(read('scripts/build-friendly.mjs'), /'relojes-marcaciones\.html'/);
  assert.match(read('.vercelignore'), /^!relojes-marcaciones\.html$/m);
  assert.match(read('.vercelignore'), /^!scripts\/migrations\/022-attendance-device-gateway\.sql$/m);
  assert.match(read('login.html'), /'relojes-marcaciones\.html'/);
  assert.match(read('internal-dashboard.html'), /data-any-capability="attendance\.read" href="relojes-marcaciones\.html"/);
  assert.match(read('centro-acciones.html'), /href="relojes-marcaciones\.html"/);
  assert.match(read('fuentes-tiempo.html'), /href="relojes-marcaciones\.html"/);
  assert.match(read('centro-ayuda.html'), /Abrir Relojes y marcaciones/);

  const config = JSON.parse(read('vercel.json'));
  const rewrites = new Map(config.rewrites.map((entry) => [entry.source, entry.destination]));
  const headers = new Map(config.headers.map((entry) => [entry.source, new Map(entry.headers.map(({ key, value }) => [key, value]))]));
  assert.equal(rewrites.get('/relojes-marcaciones'), '/relojes-marcaciones.html');
  assert.match(headers.get('/relojes-marcaciones').get('Cache-Control'), /private, no-store/);
  assert.match(headers.get('/relojes-marcaciones.html').get('Cache-Control'), /private, no-store/);
  assert.equal(config.functions['api/internal-attendance.js'].maxDuration, 20);
  assert.equal(config.functions['api/attendance-ingest.js'].maxDuration, 20);
});
