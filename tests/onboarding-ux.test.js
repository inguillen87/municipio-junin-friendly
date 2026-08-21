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

test('el Centro de acciones busca sujetos por body efímero y trata nómina como proyección mínima', () => {
  const actions = read('centro-acciones.html');
  assert.match(actions, /id="actionEmployeeSearch"[^>]*minlength="2"[^>]*maxlength="50"[^>]*autocomplete="off"[^>]*spellcheck="false"/);

  const searchStart = actions.indexOf('function actionSubjectSearch');
  const searchEnd = actions.indexOf('\n      function stableMutationValue', searchStart);
  assert.ok(searchStart > 0 && searchEnd > searchStart, 'debe existir un cliente aislado para búsqueda de sujetos');
  const searchContract = actions.slice(searchStart, searchEnd);
  assert.match(searchContract, /requestJson\(ACTIONS_URL/);
  assert.match(searchContract, /method:\s*'POST'/);
  assert.match(searchContract, /'Content-Type':\s*'application\/json'/);
  assert.match(searchContract, /command:\s*'search_subjects'/);
  assert.match(searchContract, /payload:\s*\{\s*query:\s*query\s*\}/);
  assert.doesNotMatch(searchContract, /Idempotency-Key|searchParams|URLSearchParams|localStorage|sessionStorage|console\./);
  const searchRuntimeStart = actions.indexOf('async function searchAuthorizedSubjects');
  const searchRuntimeEnd = actions.indexOf('\n      function renderCatalogs', searchRuntimeStart);
  assert.ok(searchRuntimeStart > 0 && searchRuntimeEnd > searchRuntimeStart, 'debe existir el ciclo de vida efímero de búsqueda');
  const searchRuntime = actions.slice(searchRuntimeStart, searchRuntimeEnd);
  assert.match(searchRuntime, /state\.bootstrap\.subjects = actionBusy \? previousSubjects : state\.initialSubjects\.slice\(\)/);
  assert.match(searchRuntime, /state\.bootstrap\.reasons = actionBusy \? previousReasons : state\.initialReasons\.slice\(\)/);
  assert.match(searchRuntime, /var accessDenied = error\.unauthorized \|\| Number\(error\.status\) === 403/);
  assert.match(searchRuntime, /el\.actionEmployeeSearch\.value = accessDenied \? '' : query/);
  assert.doesNotMatch(searchRuntime, /localStorage|sessionStorage|console\./);

  assert.match(actions, /var projection = lower\(row\.projection\) === 'nominal' && projectionCeiling !== 'payroll' \? 'nominal' : 'payroll'/);
  assert.match(actions, /var subject = projection === 'nominal' \? firstObject\(row\.subject, row\.beneficiary, row\.employee\) : \{\}/);
  assert.match(actions, /normalizeDetail\(await actionGet\('detail',\{ id: id \}\), projectionCeiling\)/);
  const detailStart = actions.indexOf('function normalizeDetail');
  const detailEnd = actions.indexOf('\n      function cacheElements', detailStart);
  assert.ok(detailStart > 0 && detailEnd > detailStart, 'debe normalizar el detalle según su proyección');
  const detailNormalizer = actions.slice(detailStart, detailEnd);
  assert.match(detailNormalizer, /var nominal = base\.projection === 'nominal'/);
  assert.match(detailNormalizer, /description:\s*nominal\s*\?/);
  assert.match(detailNormalizer, /evidence:\s*nominal\s*\?/);
  assert.match(detailNormalizer, /timeline:\s*nominal\s*\?/);
  assert.match(detailNormalizer, /var allowed = nominal \?/);
  assert.match(detailNormalizer, /var gates = nominal \?/);
  assert.match(actions, /state\.bootstrap\.subjects = normalized\.subjects\.slice\(0, 50\)[\s\S]*state\.bootstrap\.reasons = normalized\.reasons\.slice\(\)/);
  assert.match(actions, /var hasReasonRoute = state\.bootstrap\.reasons\.length > 0 \|\| canSearchSubjects\(\)/);
  assert.match(actions, /function redirectToLogin\(\)[\s\S]*state\.subjectSearchController\.abort\(\)[\s\S]*el\.actionEmployeeSearch\.value = ''/);
  const payrollStart = actions.indexOf('function renderPayrollDetail');
  const payrollEnd = actions.indexOf('\n      function renderActionDetail', payrollStart);
  assert.ok(payrollStart > 0 && payrollEnd > payrollStart, 'debe existir un renderer exclusivo de nómina');
  const payrollRenderer = actions.slice(payrollStart, payrollEnd);
  assert.match(payrollRenderer, /Proyección mínima autorizada para nómina/);
  assert.match(payrollRenderer, /no contiene identidad, legajo, sector, notas, actores, historial ni comandos/);
  assert.doesNotMatch(payrollRenderer, /subjectName|timeline|renderCommandPanel|allowedCommands|auditActorLabel/);
});

test('el Centro de acciones reintenta contención una vez sin redirigir ni perder el formulario', () => {
  const actions = read('centro-acciones.html');
  assert.match(actions, /var MAX_ACTION_BUSY_RETRIES = 1/);
  assert.match(actions, /var ACTION_BUSY_COPY = 'Estamos terminando un cambio de acceso\. Conservamos lo que ingresaste;/);
  const requestStart = actions.indexOf('async function requestJson');
  const requestEnd = actions.indexOf('\n      function actionGet', requestStart);
  const requestContract = actions.slice(requestStart, requestEnd);
  assert.match(requestContract, /response\.status === 401[\s\S]*redirectToLogin\(\)/);
  assert.match(requestContract, /response\.status === 409 && payload && payload\.code === 'ACTION_SESSION_BUSY'/);
  assert.match(requestContract, /actionBusyAttempt < MAX_ACTION_BUSY_RETRIES/);
  assert.match(requestContract, /responseHeader\(response, 'Retry-After'\)/);
  assert.match(requestContract, /actionBusyAttempt: actionBusyAttempt \+ 1/);
  assert.equal((requestContract.match(/redirectToLogin\(\)/g) || []).length, 1, 'busy no debe redirigir');

  const commandStart = actions.indexOf('async function actionCommand');
  const commandEnd = actions.indexOf('\n      function normalizeCapabilities', commandStart);
  const commandContract = actions.slice(commandStart, commandEnd);
  assert.match(commandContract, /var transient = isActionBusy\(error\)/, 'busy conserva Idempotency-Key');
  assert.match(actions, /var previousSubjects = state\.bootstrap\.subjects\.slice\(\)/);
  assert.match(actions, /state\.bootstrap\.subjects = actionBusy \? previousSubjects/);
  assert.match(actions, /toast\(isActionBusy\(error\)\?ACTION_BUSY_COPY:/);
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
