import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../fuentes-tiempo.html', import.meta.url), 'utf8');
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('la página temporal mantiene límites de verdad y cinco requisitos explícitos', () => {
  for (const label of [
    'Turnos asignados',
    'Fichadas',
    'Calendario y feriados',
    'Reglas municipales',
    'Eventos administrativos',
  ]) assert.match(html, new RegExp(label, 'i'));

  for (const flag of [
    'catalogApproved',
    'evaluationReady',
    'attendanceReconciled',
    'payrollCalculated',
    'payrollPosted',
    'grhMutation',
  ]) assert.match(html, new RegExp(`id="${flag}"`));

  assert.match(html, /Una fuente ausente se mantiene ausente/i);
  assert.match(html, /no calcula asistencia, horas extra ni nómina/i);
  assert.match(html, /pending|Pendiente de reglas horarias/i);
  assert.doesNotMatch(html, /presentismo calculado|horas aprobadas|importe estimado/i);
});

test('el cliente exige la capability tenant exacta y nunca deriva autoridad global', () => {
  assert.match(html, /time\.source\.read/);
  assert.match(html, /time\.source\.propose/);
  assert.match(html, /time\.source\.approve/);
  assert.match(html, /row\.allowedCommands\.filter\(commandCapabilityAllowed\)/);
  assert.match(html, /time_source_contract/);
  assert.match(html, /caseType:CASE_TYPE/);
  assert.doesNotMatch(html, /actions\.read|ADMIN_INTERNO|PLATFORM_OWNER/);
  assert.match(html, /login\.html\?next=fuentes-tiempo\.html/);
  assert.match(html, /credentials:'same-origin'/);
  assert.match(html, /cache:'no-store'/);
});

test('el alta registra metadatos exactos sin URL, rutas, archivos ni secretos', () => {
  for (const field of [
    'sourceDomain', 'ownerAuthority', 'sourceFormat',
    'schemaVersion', 'artifactSha256', 'cutAt', 'sourceTimezone', 'coverageFrom',
    'coverageTo', 'sourceGrain', 'identityKeyKind', 'recordCount',
    'sourceReasonCode', 'sourceReason',
  ]) assert.match(html, new RegExp(`id="${field}"`));

  assert.match(html, /No ingreses URL, rutas, credenciales, nombres, legajos ni observaciones personales/i);
  assert.match(html, /OWNER_AUTHORITY_LABELS/);
  assert.match(html, /municipal_human_resources/);
  assert.doesNotMatch(html, /<input[^>]+id="ownerAuthority"/);
  assert.doesNotMatch(html, /id="(?:ownerCode|systemLocator)"/);
  assert.doesNotMatch(html, /payload\.ownerCode|payload\.systemLocator/);
  assert.match(html, /maxlength="15"/);
  assert.match(html, /\^v\[1-9\]\[0-9\]\{0,3\}\(\?:\\\.\[0-9\]\{1,4\}\)\{0,2\}\$/);
  assert.doesNotMatch(html, /\^v\[1-9\]\[0-9\]\*/);
  assert.match(html, /id="cutAt" type="text"/);
  assert.match(html, /validUtcCut/);
  assert.doesNotMatch(html, /new Date\(el\.cutAt\.value\)/);
  assert.match(html, /function formatCivilDate/);
  assert.match(html, /function formatInstantMendoza/);
  assert.match(html, /timeZone:'America\/Argentina\/Mendoza'/);
  assert.doesNotMatch(html, /function formatDate\(/);
  assert.match(html, /var result=object\(root\.result\)/);
  assert.doesNotMatch(html, /object\(first\(root\.data,root\.result/);
  assert.match(html, /createButton\.addEventListener\('click',function\(\)\{openSourceDialog\(null\)\}\)/);
  assert.doesNotMatch(html, /createButton\.addEventListener\('click',openSourceDialog\)/);
  assert.match(html, /\^\[a-f0-9\]\{64\}\$/);
  assert.doesNotMatch(html, /type="file"|FormData|navigator\.geolocation|camera|biometric/i);
  assert.doesNotMatch(html, /localStorage|sessionStorage|document\.cookie|console\./);
});

test('el contrato HTTP mantiene filtros allowlisted e idempotencia UUID en body JSON', () => {
  assert.match(html, /resource:'bootstrap'|actionUrl\('bootstrap'/);
  assert.match(html, /actionUrl\('list'/);
  assert.match(html, /actionUrl\('detail'/);
  assert.match(html, /'Idempotency-Key':mutationKey\(\)/);
  assert.match(html, /'Content-Type':'application\/json'/);
  assert.match(html, /JSON\.stringify\(body\)/);
  assert.match(html, /command==='update_draft'/);
  assert.match(html, /editing\?'PATCH':'POST'/);
  assert.match(html, /body\.contractId=contractId/);
  assert.match(html, /page:state\.page,limit:50/);
  assert.match(html, /\['update_draft','submit','approve','reject','retire','cancel'\]/);
  assert.doesNotMatch(html, /URLSearchParams\([^)]*(?:reason|artifactSha256|systemLocator)/);
  assert.match(html, /id="detailTimeline"/);
  assert.match(html, /timelineTruncated/);
  assert.match(html, /array\(envelope\.timeline\)\.slice\(0,100\)/);
  assert.doesNotMatch(html, /event\.(?:actorEmail|actorPersonId|actorMembershipId|reasonHash)/);
});

test('los errores gobernados del backend conservan su mensaje operativo', () => {
  assert.match(html, /typeof payload\.error==='string'\?payload\.error/);
  assert.match(html, /first\(payload\.message,errorMessage\)/);
  assert.doesNotMatch(html, /payload\.error&&payload\.error\.message\),'La operación fue rechazada\.'/);
});

test('la UI es accesible y adaptable a desktop y móvil', () => {
  assert.match(html, /min-width:320px/);
  assert.match(html, /@media\(max-width:820px\)/);
  assert.match(html, /@media\(max-width:520px\)/);
  assert.match(html, /min-height:44px/);
  assert.match(html, /class="skip-link"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-label="Matriz de dependencias temporales"/);
  assert.match(html, /autocomplete="off"/);
  assert.match(html, /spellcheck="false"/);
  assert.match(html, /\.sr-only\{[^}]*left:0!important[^}]*clip-path:inset\(50%\)/);
});

test('todos los scripts inline de fuentes de tiempo tienen sintaxis válida', () => {
  let count = 0;
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/.test(match[1])) continue;
    count += 1;
    new vm.Script(match[2], { filename: 'fuentes-tiempo.html' });
  }
  assert.equal(count, 1);
});

test('build, login, service worker y Vercel publican la vista como privada no-store', () => {
  assert.match(read('scripts/build-friendly.mjs'), /'fuentes-tiempo\.html'/);
  assert.match(read('login.html'), /'fuentes-tiempo\.html'/);
  assert.match(read('sw.js'), /'\/fuentes-tiempo'/);
  assert.match(read('sw.js'), /'\/fuentes-tiempo\.html'/);
  assert.match(read('.vercelignore'), /^!fuentes-tiempo\.html$/m);

  const config = JSON.parse(read('vercel.json'));
  const rewrites = new Map(config.rewrites.map((entry) => [entry.source, entry.destination]));
  const headers = new Map(config.headers.map((entry) => [entry.source, new Map(entry.headers.map(({ key, value }) => [key, value]))]));
  assert.equal(rewrites.get('/fuentes-tiempo'), '/fuentes-tiempo.html');
  assert.match(headers.get('/fuentes-tiempo').get('Cache-Control'), /private, no-store/);
  assert.match(headers.get('/fuentes-tiempo.html').get('Cache-Control'), /private, no-store/);
});
