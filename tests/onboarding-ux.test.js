import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { GLOSSARY, SECTION_CATALOG, TASK_CATALOG } from '../assets/product-guidance.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('el centro de aprendizaje es interno, accesible y no confunde perfiles con permisos', () => {
  const html = read('centro-ayuda.html');
  assert.match(html, /\/api\/internal-auth/);
  assert.match(html, /login\.html\?next=centro-ayuda\.html/);
  assert.match(html, /No modifica permisos|no roles de seguridad/i);
  assert.match(html, /no presume un organigrama normativo/i);
  assert.equal((html.match(/class="module-card"/g) || []).length, 15);
  assert.equal((html.match(/class="route-card"/g) || []).length, 6);
  assert.equal((html.match(/data-progress-id=/g) || []).length, 5);
  assert.match(html, /id="assistantHelpLink"/);
  assert.match(html, /sessionStorage/);
  assert.doesNotMatch(html, /localStorage/);
  for (const section of SECTION_CATALOG) assert.match(html, new RegExp(section.label, 'i'), `falta explicar ${section.label}`);
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(match[1])) new vm.Script(match[2], { filename: 'centro-ayuda.html' });
  }
});

test('el contrato de aprendizaje cubre la navegación, las tareas y el glosario vigentes', () => {
  assert.equal(SECTION_CATALOG.length, 15);
  assert.equal(TASK_CATALOG.length, 13);
  assert.equal(GLOSSARY.length, 15);
  assert.equal(new Set(SECTION_CATALOG.map((section) => section.id)).size, SECTION_CATALOG.length);
  assert.equal(new Set(TASK_CATALOG.map((task) => task.id)).size, TASK_CATALOG.length);
  for (const task of TASK_CATALOG) assert.ok(SECTION_CATALOG.some((section) => section.id === task.sectionId), `tarea huérfana ${task.id}`);
});

test('la guía contextual aísla progreso por sesión y cumple el contrato modal', () => {
  const guide = read('assets/internal-guide.js');
  new vm.Script(guide, { filename: 'assets/internal-guide.js' });
  assert.match(guide, /sessionScope\(\)/);
  assert.match(guide, /import\('\.\/product-guidance\.js'\)/, 'la UI debe consumir el catálogo canónico');
  assert.match(guide, /sessionStorage/);
  assert.doesNotMatch(guide, /localStorage/);
  assert.match(guide, /function trapFocus/);
  assert.match(guide, /aria-modal/);
  assert.match(guide, /\.inert = true/);
  assert.match(guide, /data-mc-open-guide/);
  assert.match(guide, /target\.querySelector\('\.mc-explain-button'\)/);
  assert.match(guide, /budget:\s*\{[\s\S]*?sectionId:\s*'presupuesto'/);
  assert.match(guide, /actions:\s*\{[\s\S]*?sectionId:\s*'acciones'/);
  assert.match(guide, /presupuesto-control'[\s\S]*?return 'budget'/);
  assert.match(guide, /\['\.execution-panel', 'Ejecución pendiente'/);
  assert.doesNotMatch(guide, /documento|cuil|domicilio|salario/i, 'la persistencia de ayuda no debe modelar PII');
});

test('todas las vistas internas principales cargan una sola guía compartida', () => {
  for (const file of ['internal-dashboard.html', 'administracion-plataforma.html', 'centro-acciones.html', 'estructura.html', 'integracion-datos.html', 'nomina-control.html', 'gestion-comparativa.html', 'presupuesto-control.html', 'asistente.html', 'ausentismo-control.html', 'licencias-control.html', 'calidad-operativa.html']) {
    const html = read(file);
    assert.equal((html.match(/assets\/internal-guide\.js/g) || []).length, 1, `${file} debe cargar una sola guía`);
    assert.match(html, /data-mc-page=/, `${file} debe declarar su contexto de ayuda`);
  }
});

test('la administración global conserva el encabezado visible al cambiar de sección', () => {
  const html = read('administracion-plataforma.html');
  assert.match(html, /window\.scrollTo\(\{ top: 0, left: 0, behavior: 'auto' \}\)/);
  assert.match(html, /mainContent\.focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(html, /mainContent\.focus\(\);/);
});

test('el Centro de acciones es descubrible y conserva límites transaccionales explícitos', () => {
  for (const file of ['internal-dashboard.html', 'estructura.html', 'integracion-datos.html', 'nomina-control.html', 'gestion-comparativa.html', 'presupuesto-control.html', 'asistente.html', 'ausentismo-control.html', 'licencias-control.html', 'calidad-operativa.html', 'centro-ayuda.html']) {
    assert.match(read(file), /href="centro-acciones\.html"[^>]*>[\s\S]*?Centro de acciones[\s\S]*?<\/a>/, `${file} debe enlazar Centro de acciones`);
  }

  const actions = read('centro-acciones.html');
  assert.match(actions, /data-mc-page="actions"/);
  assert.match(actions, /href="centro-acciones\.html"\s+aria-current="page"/);
  assert.match(actions, /login\.html\?next=centro-acciones\.html/);
  assert.match(actions, /no calcula|no calculable|sin supuestos/i);
  assert.match(actions, /assets\/internal-guide\.js/);
  assert.match(actions, /leave\.request\.self\.create/);
  assert.match(actions, /leave\.request\.area\.decide/);
  assert.match(actions, /leave\.request\.all\.manage/);
  assert.doesNotMatch(actions, /['"]action\.(?:self|area|all|aggregate|audit|restricted|payroll)\./);
  assert.doesNotMatch(actions, /actions:(?:create|read|review|approve|apply|audit)/);
  for (const match of actions.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(match[1])) new vm.Script(match[2], { filename: 'centro-acciones.html' });
  }
});

test('el presupuesto aprobado es descubrible desde las herramientas internas', () => {
  for (const file of ['internal-dashboard.html', 'estructura.html', 'integracion-datos.html', 'nomina-control.html', 'gestion-comparativa.html', 'asistente.html', 'ausentismo-control.html', 'licencias-control.html', 'calidad-operativa.html', 'centro-ayuda.html']) {
    assert.match(read(file), /href="presupuesto-control\.html"[^>]*>[\s\S]*?Presupuesto[\s\S]*?<\/a>/, `${file} debe enlazar Presupuesto`);
  }

  const budget = read('presupuesto-control.html');
  assert.match(budget, /href="presupuesto-control\.html"\s+aria-current="page"/);
  assert.match(budget, /login\.html\?next=presupuesto-control\.html/);
  assert.match(budget, /id="mobileLogoutButton"[^>]*>Cerrar sesión<\/button>/);
  assert.match(budget, /byId\('mobileLogoutButton'\)\.addEventListener\('click', logout\)/);
  assert.match(budget, /@media \(max-width: 820px\)[\s\S]*?\.sidebar-logout \{ display: block; \}/);
});

test('la comparación de gestiones es descubrible desde las herramientas internas', () => {
  for (const file of ['internal-dashboard.html', 'estructura.html', 'integracion-datos.html', 'nomina-control.html', 'asistente.html', 'ausentismo-control.html', 'licencias-control.html', 'calidad-operativa.html', 'centro-ayuda.html']) {
    const html = read(file);
    assert.match(html, /href="gestion-comparativa\.html"[^>]*>[\s\S]*?Gestiones[\s\S]*?<\/a>/, `${file} debe enlazar Gestiones`);
  }

  const management = read('gestion-comparativa.html');
  assert.match(management, /href="gestion-comparativa\.html"\s+aria-current="page"/);
  assert.match(management, /login\.html\?next=gestion-comparativa\.html/);
});

test('el asistente presenta onboarding, pasos y navegación interna segura', () => {
  const html = read('asistente.html');
  assert.match(html, /Primer ingreso/);
  assert.match(html, /Guía de secciones/);
  assert.match(html, /payload\.steps/);
  assert.match(html, /payload\.targetPath/);
  assert.match(html, /payload\.relatedSections/);
  assert.match(html, /function safeInternalPath/);
  assert.match(html, /createElement\('a', 'answer-link'/);
});
