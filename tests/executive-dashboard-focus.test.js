import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), 'utf8');

function parseInlineScripts(html) {
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(match[1])) new vm.Script(match[2], { filename: 'friendly-dashboard.html' });
  }
}

test('el foco ejecutivo deriva señales del snapshot real y conserva límites de lectura', () => {
  const html = read('friendly-dashboard.html');
  const source = JSON.parse(read('friendly-data.json'));
  parseInlineScripts(html);

  assert.match(html, /id="executiveFocusTitle">Tres señales para decidir qué gestionar/);
  assert.match(html, /id="executiveSectorCoverage"/);
  assert.match(html, /id="executiveAbsenceEvents"/);
  assert.match(html, /id="executiveManagementBalance"/);
  assert.match(html, /no es tasa de ausentismo, jornadas perdidas, costo ni evaluación de desempeño/);
  assert.match(html, /El balance registral tampoco acredita eficiencia o ahorro/);

  const match = html.match(/const executiveSignals=source=>\{([\s\S]*?)\n      \};/);
  assert.ok(match, 'falta el derivador explícito de señales ejecutivas');
  const derive = new Function('source', match[1]);
  const signal = derive(source);

  assert.deepEqual(signal, {
    sectorCoveragePct: 98.3,
    active: 882,
    activeWithoutSector: 15,
    absenceYear: 2025,
    absencePreviousYear: 2024,
    absenceEvents: 2048,
    absenceAffected: 614,
    absenceChangePct: -5.7,
    managementFrom: '2023-12-09',
    managementTo: '2026-08-06',
    hires: 281,
    exits: 232,
    balance: 49,
  });
});

test('el foco ejecutivo conecta análisis agregado con gestiones existentes', () => {
  const html = read('friendly-dashboard.html');
  const destinations = [
    'internal-dashboard.html',
    'centro-acciones.html',
    'licencias-control.html',
    'presupuesto-control.html',
    'ausentismo-control.html',
  ];

  for (const file of destinations) {
    assert.equal(fs.existsSync(new URL(file, root)), true, `falta el destino ${file}`);
    assert.match(html, new RegExp(`href="${file.replace('.', '\\.')}(?:#legajos)?"`), `el foco no enlaza ${file}`);
  }

  for (const section of ['personas', 'ausentismo', 'gestion']) {
    assert.match(html, new RegExp(`data-open="${section}"`), `falta acceso agregado a ${section}`);
  }
  assert.match(html, /aria-label="Acciones ejecutivas disponibles"/);
  assert.match(html, /@media\(max-width:480px\)\{[^}]*executive-quick-actions[^}]*grid-template-columns:1fr/);
});

test('la cabecera conserva Portal interno junto a un cierre de sesión inequívoco', () => {
  const html = read('friendly-dashboard.html');
  const topbar = html.match(/<header class="topbar">([\s\S]*?)<\/header>/);

  assert.ok(topbar, 'falta la cabecera principal');
  assert.match(topbar[1], /href="internal-dashboard\.html#inicio">Portal interno<\/a>/);
  assert.match(topbar[1], /<button class="logout" id="logout" type="button">Cerrar sesión<\/button>/);
  assert.ok(topbar[1].indexOf('Portal interno') < topbar[1].indexOf('Cerrar sesión'));
  assert.match(html, /\.internal-entry\{min-height:34px;white-space:nowrap\}/);
  assert.match(html, /\.top-actions \.internal-entry\{padding:7px 8px;font-size:9px\}/);
  assert.doesNotMatch(html, /\$\('logout'\)\.textContent='Portal interno'/);
});

test('Administración diferencia operación existente de futuros no homologados', () => {
  const html = read('friendly-dashboard.html');
  const card = html.match(/<article class="module-card available"><div class="module-card-head"><span class="module-code">AD<\/span>([\s\S]*?)<\/article>/);

  assert.ok(card, 'falta la tarjeta operativa de Administración');
  for (const capability of ['Legajos', 'Centro de acciones', 'licencias normativas', 'multi-tenant/IAM', 'presupuesto aprobado']) {
    assert.match(card[1], new RegExp(capability.replace('/', '\\/')), `falta capacidad existente: ${capability}`);
  }
  assert.match(card[1], /Flujos implementados/);
  assert.match(card[1], /Futuro no homologado:/);
  assert.match(card[1], /importación asistida, ejecución presupuestaria y fuentes vigentes de turnos y fichadas/);
  assert.doesNotMatch(card[1], /auditoría y configuración siguen en fase de integración/);

  const administration = html.match(/<section class="section" id="datos">([\s\S]*?)<\/section>/);
  assert.ok(administration, 'falta el relato ampliado de Administración');
  for (const destination of ['internal-dashboard.html#inicio', 'centro-acciones.html', 'licencias-control.html', 'administracion-plataforma.html', 'presupuesto-control.html']) {
    assert.match(administration[1], new RegExp(`href="${destination.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`), `falta acceso ${destination}`);
  }
  assert.match(administration[1], /Futuro no homologado/);
  assert.match(administration[1], /calendarios, turnos y fichadas vigentes permanecen separados/);
});
