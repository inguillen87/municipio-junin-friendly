import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { INTERNAL_SESSION_COOKIE, issueInternalSessionToken } from '../lib/internal-session.js';

const baseUrl = (process.env.BASE_URL || 'http://127.0.0.1:3100').replace(/\/$/, '');
const baseOrigin = new URL(baseUrl).origin;
let internalEmail = (process.env.QA_INTERNAL_EMAIL || '').trim();
let internalPassword = process.env.QA_INTERNAL_PASSWORD || '';
const credentialFile = (process.env.QA_INTERNAL_CREDENTIAL_FILE || '').trim();
if ((!internalEmail || !internalPassword) && credentialFile) {
  const { readFileSync } = await import('node:fs');
  const credential = JSON.parse(readFileSync(credentialFile, 'utf8'));
  if (!internalEmail) internalEmail = String(credential.email || '').trim();
  if (!internalPassword) internalPassword = String(credential.password || '');
}
const navigationTimeout = Number(process.env.QA_NAVIGATION_TIMEOUT_MS || 20_000);
const canIssueSession = Boolean((process.env.INTERNAL_SESSION_SECRET || '').trim());
const hasCredentials = Boolean(internalEmail && internalPassword);

assert.equal(
  Boolean(internalEmail),
  Boolean(internalPassword),
  'QA_INTERNAL_EMAIL y QA_INTERNAL_PASSWORD deben informarse juntas.',
);
assert.ok(
  hasCredentials || canIssueSession,
  'La certificacion multipagina requiere credenciales QA o INTERNAL_SESSION_SECRET para una sesión efímera.',
);

const publicSections = [
  'inicio',
  'personas',
  'ausentismo',
  'hacienda',
  'servicios',
  'compras',
  'inteligencia',
  'gestion',
  'calidad',
  'datos',
  'hoja-ruta',
];

const productAreas = [
  'direccion',
  'personas',
  'hacienda',
  'servicios',
  'compras',
  'inteligencia',
  'administracion',
];

const browserIssues = [];
const browser = await chromium.launch({ headless: true });

function assertNoBrowserIssues(stage) {
  assert.deepEqual(browserIssues, [], `${stage}: errores propios de navegador:\n${browserIssues.join('\n')}`);
}

function isOwnUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value, baseUrl);
    return url.origin === baseOrigin;
  } catch {
    return true;
  }
}

function isInternalApi(value) {
  try {
    const pathname = new URL(value, baseUrl).pathname;
    return pathname === '/api/internal-auth' || pathname === '/api/internal-data' || pathname === '/api/internal-assistant';
  } catch {
    return false;
  }
}

async function newPage(viewport, options = {}) {
  const context = await browser.newContext({ viewport });
  if (options.authenticated === true && !hasCredentials) {
    const token = issueInternalSessionToken({
      id: 'qa-browser-session',
      email: 'qa-browser@local.invalid',
      displayName: 'QA navegador',
      role: 'qa',
    });
    await context.addCookies([{
      name: INTERNAL_SESSION_COOKIE,
      value: token,
      url: baseOrigin,
      httpOnly: true,
      sameSite: 'Lax',
      secure: baseOrigin.startsWith('https://'),
    }]);
  }
  const page = await context.newPage();
  const label = options.label || `${viewport.width}x${viewport.height}`;
  const allowUnauthorized = options.allowUnauthorized === true;

  page.setDefaultNavigationTimeout(navigationTimeout);
  page.setDefaultTimeout(navigationTimeout);

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const value = message.text();
    const sourceUrl = message.location().url;
    if (!isOwnUrl(sourceUrl)) return;
    if (allowUnauthorized && /401\s*\(Unauthorized\)|status of 401|HTTP 401/i.test(value)) return;
    browserIssues.push(`[${label}] console: ${value}`);
  });

  page.on('pageerror', (error) => {
    browserIssues.push(`[${label}] pageerror: ${error.message}`);
  });

  page.on('requestfailed', (request) => {
    if (!isOwnUrl(request.url())) return;
    const reason = request.failure()?.errorText || 'request failed';
    if (allowUnauthorized && isInternalApi(request.url()) && /abort/i.test(reason)) return;
    browserIssues.push(`[${label}] requestfailed ${request.url()}: ${reason}`);
  });

  page.on('response', (response) => {
    if (!isOwnUrl(response.url()) || response.status() < 400) return;
    if (allowUnauthorized && response.status() === 401 && isInternalApi(response.url())) return;
    browserIssues.push(`[${label}] HTTP ${response.status()} ${response.url()}`);
  });

  return { context, page };
}

async function assertPageHealthy(page, label) {
  const state = await page.evaluate(() => ({
    textLength: document.body?.innerText.trim().length || 0,
    hasOverlay: Boolean(document.querySelector('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay')),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.ok(state.textLength > 80, `${label}: la pagina no tiene contenido significativo`);
  assert.equal(state.hasOverlay, false, `${label}: se detecto un overlay de error`);
  assert.equal(
    state.overflow,
    false,
    `${label}: overflow horizontal (${state.scrollWidth}px sobre ${state.clientWidth}px)`,
  );
}

async function waitForPublicDashboard(page) {
  await page.waitForSelector('#dashboard:not([hidden])');
  await page.waitForFunction(() => {
    const value = document.querySelector('#kpiHistorical')?.textContent || '';
    return /2[.\s]?450/.test(value);
  });
}

async function assertLoadingCollapsed(page) {
  const loadingState = await page.locator('#loading').evaluate((loading) => {
    const dashboard = document.querySelector('#dashboard');
    const main = document.querySelector('#main');
    const loadingRect = loading.getBoundingClientRect();
    const dashboardRect = dashboard.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();
    const mainPaddingTop = Number.parseFloat(getComputedStyle(main).paddingTop) || 0;
    return {
      hidden: loading.hidden,
      display: getComputedStyle(loading).display,
      width: loadingRect.width,
      height: loadingRect.height,
      dashboardHidden: dashboard.hidden,
      reservedGap: Math.max(0, Math.round(dashboardRect.top - mainRect.top - mainPaddingTop)),
    };
  });

  assert.equal(loadingState.hidden, true, 'El indicador de carga debe conservar el atributo hidden');
  assert.equal(loadingState.display, 'none', 'El CSS no debe sobreescribir [hidden]');
  assert.equal(loadingState.width, 0, 'El indicador oculto no debe reservar ancho');
  assert.equal(loadingState.height, 0, 'El indicador oculto no debe reservar alto');
  assert.equal(loadingState.dashboardHidden, false, 'El tablero debe quedar visible al finalizar la carga');
  assert.ok(loadingState.reservedGap <= 4, `El estado de carga deja un hueco extra de ${loadingState.reservedGap}px`);
}

async function assertPublicSection(page, section) {
  await page.evaluate((target) => {
    window.location.hash = target;
  }, section);
  await page.waitForFunction((target) => {
    const active = document.querySelector('.section.active');
    return active?.id === target && getComputedStyle(active).display !== 'none';
  }, section);

  assert.equal(await page.locator('.section.active').count(), 1, `${section}: debe existir una sola seccion activa`);
  assert.equal(await page.locator('.section.active').getAttribute('id'), section);
  assert.equal(
    await page.locator(`[data-section="${section}"].active[aria-current="page"]`).count(),
    1,
    `${section}: la navegacion debe indicar la seccion activa`,
  );
  assert.equal(await page.locator(`#${section} h1:visible`).count(), 1, `${section}: falta su titulo visible`);
}

async function verifyPublicDesktop() {
  const { context, page } = await newPage({ width: 1440, height: 900 }, { label: 'publico desktop' });
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await waitForPublicDashboard(page);

    const current = new URL(page.url());
    assert.equal(/login(?:\.html)?$/.test(current.pathname), false, 'La raiz publica no debe exigir login');
    assert.match(await page.title(), /MuniControl/i);
    await assertLoadingCollapsed(page);

    for (const section of publicSections) await assertPublicSection(page, section);

    await page.evaluate(() => { window.location.hash = 'ruta-inexistente'; });
    await page.waitForFunction(() => document.querySelector('.section.active')?.id === 'inicio');
    assert.equal(await page.locator('.section.active').getAttribute('id'), 'inicio');
    await assertPageHealthy(page, 'Centro ejecutivo desktop');
  } finally {
    await context.close();
  }
}

async function verifyPublicPages(viewport, suffix) {
  const { context, page } = await newPage(viewport, { label: `multipagina ${suffix}` });
  try {
    await page.goto(`${baseUrl}/modulos`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.area-list .area');
    assert.equal(await page.locator('.area-list .area').count(), productAreas.length, 'El mapa debe conservar siete areas');
    for (const area of productAreas) {
      assert.equal(await page.locator(`#${area}.area`).count(), 1, `Falta el area ${area} en el mapa de producto`);
    }
    assert.ok(await page.locator('.state.live').count() > 0, 'El mapa debe distinguir capacidades operativas');
    assert.ok(await page.locator('.state.history').count() > 0, 'El mapa debe distinguir capacidades preservadas');
    await assertPageHealthy(page, `Mapa de producto ${suffix}`);

    await page.goto(`${baseUrl}/reportes-rrhh`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#reportContent:not([hidden])');
    await page.waitForFunction(() => /2[.\s]?450/.test(document.querySelector('#metricHistorical')?.textContent || ''));
    assert.match(await page.locator('#metricActive').innerText(), /882/);
    assert.match(await page.locator('#metricAbsences').innerText(), /31[.\s]?572/);
    assert.ok(await page.locator('#managementChart svg').count() > 0, 'El informe debe renderizar el grafico de movimientos');
    assert.ok(await page.locator('#absenceBars > *').count() > 0, 'El informe debe renderizar ausentismo');
    assert.ok(await page.locator('#sectorList > *').count() > 0, 'El informe debe renderizar sectores');
    await assertPageHealthy(page, `Informe RRHH ${suffix}`);

    await page.goto(`${baseUrl}/calidad-datos`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#content:not([hidden])');
    await page.waitForFunction(() => document.querySelectorAll('#auditRows tr').length >= 6);
    assert.equal(await page.locator('#duplicateKeys').innerText(), '0');
    assert.ok(await page.locator('#exceptionGrid > *').count() >= 6, 'Calidad debe enumerar excepciones');
    assert.ok(await page.locator('#availabilityGrid > *').count() >= 6, 'Calidad debe declarar disponibilidad por dominio');
    await assertPageHealthy(page, `Calidad de datos ${suffix}`);
  } finally {
    await context.close();
  }
}

async function verifyPublicMobile() {
  const { context, page } = await newPage({ width: 390, height: 844 }, { label: 'publico mobile' });
  try {
    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await waitForPublicDashboard(page);
    await assertLoadingCollapsed(page);
    for (const section of publicSections) {
      await assertPublicSection(page, section);
      await assertPageHealthy(page, `Centro ejecutivo #${section} mobile`);
    }
  } finally {
    await context.close();
  }
}

async function verifyAnonymousInternal() {
  const { context, page } = await newPage(
    { width: 1365, height: 850 },
    { label: 'interno anonimo', allowUnauthorized: true },
  );
  try {
    const authResponse = await context.request.get(`${baseUrl}/api/internal-auth`);
    assert.equal(authResponse.status(), 401, 'La API de sesion debe rechazar el acceso anonimo');

    const dataResponse = await context.request.get(`${baseUrl}/api/internal-data`);
    assert.equal(dataResponse.status(), 401, 'La API nominal debe rechazar el acceso anonimo');

    const assistantResponse = await context.request.post(`${baseUrl}/api/internal-assistant`, {
      data: { message: 'dotación' },
    });
    assert.equal(assistantResponse.status(), 401, 'El asistente debe rechazar el acceso anonimo');

    await page.goto(`${baseUrl}/internal`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL((url) => (
      /\/login(?:\.html)?$/.test(url.pathname)
      && url.searchParams.get('next') === 'internal-dashboard.html'
    ));
    await page.waitForSelector('#loginForm');
    await assertPageHealthy(page, 'Redireccion interna anonima');
    assertNoBrowserIssues('Redireccion interna anonima');

    await page.goto(`${baseUrl}/estructura`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL((url) => /\/login(?:\.html)?$/.test(url.pathname));
    await page.waitForSelector('#loginForm');
    assert.equal(await page.locator('#app').count(), 0, 'La estructura anonima no debe quedar renderizada');
    await assertPageHealthy(page, 'Redireccion de estructura anonima');

    await page.goto(`${baseUrl}/centro-ayuda`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL((url) => (
      /\/login(?:\.html)?$/.test(url.pathname)
      && url.searchParams.get('next') === 'centro-ayuda.html'
    ));
    await page.waitForSelector('#loginForm');
    await assertPageHealthy(page, 'Redireccion de ayuda anonima');

    await page.goto(`${baseUrl}/ausentismo-control`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL((url) => (
      /\/login(?:\.html)?$/.test(url.pathname)
      && url.searchParams.get('next') === 'ausentismo-control.html'
    ));
    await page.waitForSelector('#loginForm');
    await assertPageHealthy(page, 'Redireccion de ausentismo anonimo');
  } finally {
    await context.close();
  }
}

async function loginInternal(page) {
  if (!hasCredentials) {
    await page.goto(`${baseUrl}/internal`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#appShell:not([hidden])');
    await page.waitForFunction(() => /2[.\s]?450/.test(document.querySelector('#kpiHistorical [data-value]')?.textContent || ''));
    return;
  }
  await page.goto(`${baseUrl}/login?next=internal-dashboard.html`, { waitUntil: 'domcontentloaded' });
  await page.locator('#emailInput').fill(internalEmail);
  await page.locator('#passInput').fill(internalPassword);
  await page.locator('#loginForm').evaluate((form) => form.requestSubmit());
  await page.waitForURL((url) => /\/internal-dashboard(?:\.html)?$/.test(url.pathname));
  await page.waitForSelector('#appShell:not([hidden])');
  await page.waitForFunction(() => /2[.\s]?450/.test(document.querySelector('#kpiHistorical [data-value]')?.textContent || ''));
}

async function verifyAuthenticatedInternal() {
  const { context, page } = await newPage(
    { width: 1440, height: 900 },
    { label: 'interno autenticado', authenticated: true },
  );
  try {
    await loginInternal(page);
    assert.match(await page.locator('#kpiActive [data-value]').innerText(), /882/);
    assert.match(await page.locator('#kpiAbsence [data-value]').innerText(), /31[.\s]?572/);
    assert.notEqual((await page.locator('#userName').innerText()).trim(), 'Cargando…');
    await page.waitForSelector('[data-mc-open-guide]');
    assert.equal(await page.locator('a[href*="centro-ayuda"]').count() > 0, true, 'El portal debe enlazar el centro de ayuda');
    const guideTrigger = page.locator('[data-mc-open-guide]');
    await guideTrigger.click();
    await page.waitForSelector('.mc-guide-drawer[aria-modal="true"]');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.locator('.mc-guide-drawer').evaluate((drawer) => drawer.contains(document.activeElement)), true, 'La ayuda debe contener el foco');
    await page.keyboard.press('Escape');
    assert.equal(await guideTrigger.evaluate((button) => button === document.activeElement), true, 'La ayuda debe devolver el foco al disparador');
    await guideTrigger.click();
    await page.locator('[data-mc-start-tour]').click();
    await page.waitForSelector('.mc-tour-card[aria-modal="true"]');
    await page.keyboard.press('Escape');
    assert.equal(await guideTrigger.evaluate((button) => button === document.activeElement), true, 'El recorrido debe devolver el foco al disparador');
    await assertPageHealthy(page, 'Portal interno desktop');

    await page.locator('[data-view="legajos"]').click();
    await page.waitForSelector('#employeeRows [data-legajo]');
    const detail = page.locator('#employeeRows button', { hasText: 'Ver ficha' }).first();
    await detail.click();
    await page.waitForSelector('#employeeDialog[open]');
    await page.waitForFunction(() => document.querySelector('#dialogBody')?.getAttribute('aria-busy') === 'false');
    assert.match(await page.locator('#dialogBody').innerText(), /DNI|CUIL|Documento|Domicilio/i);
    await page.locator('#closeDialog').click();

    const structureResponse = await context.request.get(`${baseUrl}/api/internal-data?resource=structure`);
    assert.equal(structureResponse.status(), 200, 'La estructura debe exigir y aceptar la misma sesion interna');

    await page.goto(`${baseUrl}/estructura`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app:not([hidden])');
    await page.waitForFunction(() => /2[.\s]?450/.test(document.querySelector('#metricHistorical')?.textContent || ''));
    assert.ok(await page.locator('#organizationRows tr').count() > 0, 'Estructura debe listar organizaciones observadas');
    assert.ok(await page.locator('#sectorRows').count() === 1, 'Estructura debe incluir la vista de sectores');
    await assertPageHealthy(page, 'Estructura desktop');

    await page.setViewportSize({ width: 390, height: 844 });
    await assertPageHealthy(page, 'Estructura mobile');

    const absenceResponse = await context.request.get(`${baseUrl}/api/internal-data?resource=absenceanalytics&from=2026-01-01&to=2026-08-06&bucket=month`);
    assert.equal(absenceResponse.status(), 200, 'Ausentismo agregado debe aceptar la sesión interna');
    const absencePayload = await absenceResponse.json();
    assert.deepEqual(absencePayload.data.summary, {
      events: 1559,
      affectedContracts: 590,
      sourceDeclaredDays: 17400,
    });
    assert.equal(absencePayload.data.comparison.changePercent.events, 17.1);
    assert.equal(absencePayload.meta.ratesAvailable, false);

    await page.goto(`${baseUrl}/ausentismo-control?from=1980-01-01&to=2027-12-31`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#mainContent:not([hidden])');
    await page.waitForFunction(() => new URL(location.href).searchParams.get('from') === '1990-01-01'
      && new URL(location.href).searchParams.get('to') === '2026-08-06');
    assert.equal(await page.locator('#fromInput').inputValue(), '1990-01-01');
    assert.equal(await page.locator('#toInput').inputValue(), '2026-08-06');
    assert.match(await page.locator('#filterSummary').innerText(), /rango ajustado/i);
    await assertPageHealthy(page, 'Ausentismo con rango ajustado');

    await page.goto(`${baseUrl}/ausentismo-control?from=2026-01-01&to=2026-08-06`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#mainContent:not([hidden])');
    await page.waitForFunction(() => /1[.\s]?559/.test(document.querySelector('#eventsValue')?.textContent || ''));
    assert.match(await page.locator('#contractsValue').innerText(), /590/);
    assert.match(await page.locator('#daysValue').innerText(), /17[.\s]?400/);
    assert.match(await page.locator('#comparisonBadge').innerText(), /Mismo rango calendario/i);
    assert.match(await page.locator('#sourceLabel').innerText(), /GRH/i);
    assert.ok(await page.locator('#eventRows a[href*="contractId="]').count() > 0, 'Cada evento vinculado debe abrir su ficha canónica');
    await assertPageHealthy(page, 'Ausentismo mobile');

    const absenceUrl = new URL(page.url());
    await page.locator('#eventRows a[href*="contractId="]').first().click();
    await page.waitForSelector('#employeeDialog[open]');
    await page.waitForFunction(() => document.querySelector('#dialogBody')?.getAttribute('aria-busy') === 'false');
    assert.ok(new URL(page.url()).searchParams.get('contractId'), 'La ficha debe conservar un deep-link canónico');
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#mainContent:not([hidden])');
    assert.equal(new URL(page.url()).searchParams.get('from'), absenceUrl.searchParams.get('from'));
    assert.equal(new URL(page.url()).searchParams.get('to'), absenceUrl.searchParams.get('to'));
    await assertPageHealthy(page, 'Regreso a ausentismo con contexto');

    await page.goto(`${baseUrl}/asistente`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app:not([hidden])');
    await page.locator('#messageInput').fill('Cual es la brecha de dotacion?');
    await page.locator('#assistantForm').evaluate((form) => form.requestSubmit());
    await page.waitForSelector('.message.assistant .answer-text');
    const assistantText = await page.locator('.message.assistant .answer-text').last().innerText();
    assert.match(assistantText, /882/);
    assert.match(assistantText, /854/);
    assert.match(assistantText, /28/);
    assert.match(await page.locator('.message.assistant .sources').last().innerText(), /GRH/i, 'El asistente debe mostrar una fuente GRH real');

    await page.locator('#messageInput').fill('Analiza los eventos de ausencia del ultimo periodo disponible');
    await page.locator('#assistantForm').evaluate((form) => form.requestSubmit());
    await page.waitForFunction(() => document.querySelectorAll('.message.assistant .answer-text').length >= 2);
    const absenceAssistantText = await page.locator('.message.assistant .answer-text').last().innerText();
    assert.match(absenceAssistantText, /1[.\s]?559/);
    assert.match(absenceAssistantText, /no constituyen una tasa|no jornadas perdidas/i);
    assert.match(await page.locator('.message.assistant .sources').last().innerText(), /grh_absences|GRH/i);

    await page.locator('#messageInput').fill('Soy nuevo, por donde empiezo?');
    await page.locator('#assistantForm').evaluate((form) => form.requestSubmit());
    await page.waitForFunction(() => document.querySelectorAll('.message.assistant .answer-text').length >= 3);
    const guidanceText = await page.locator('.message.assistant .answer-text').last().innerText();
    assert.match(guidanceText, /Personas|Estructura|Ayuda/i, 'El asistente debe orientar la navegacion');
    assert.ok(await page.locator('.message.assistant .answer-links').last().count(), 'La orientación debe ofrecer un acceso navegable');
    await assertPageHealthy(page, 'Asistente mobile');

    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto(`${baseUrl}/centro-ayuda`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app:not([hidden])');
    assert.equal(await page.locator('#moduleGrid .module-card').count(), 11, 'El centro debe explicar las once áreas visibles');
    assert.equal(await page.locator('#routeList [data-route]').count(), 6, 'El centro debe ofrecer recorridos por función');
    await page.locator('[data-progress-id="home"]').check();
    assert.match(await page.locator('#progressText').innerText(), /1 de 5/);
    await page.locator('#helpSearch').fill('nomina');
    assert.match(await page.locator('#searchStatus').innerText(), /contenidos coinciden/i);
    assert.ok(await page.locator('#assistantHelpLink').count(), 'El centro debe enlazar ayuda IA');
    await assertPageHealthy(page, 'Centro de ayuda tablet');
    await page.setViewportSize({ width: 390, height: 844 });
    const activeHelpVisible = await page.locator('nav[aria-label="Navegación principal"] [aria-current="page"]').evaluate((link) => {
      const rect = link.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth;
    });
    assert.equal(activeHelpVisible, true, 'Ayuda debe permanecer visible en la navegación móvil');
    await assertPageHealthy(page, 'Centro de ayuda mobile');

    await page.goto(`${baseUrl}/internal`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#appShell:not([hidden])');
    await assertPageHealthy(page, 'Portal interno mobile');
  } finally {
    await context.close();
  }
}

try {
  await verifyPublicDesktop();
  await verifyPublicMobile();
  await verifyPublicPages({ width: 1440, height: 900 }, 'desktop');
  await verifyPublicPages({ width: 390, height: 844 }, 'mobile');
  assertNoBrowserIssues('QA publica multipagina');
  await verifyAnonymousInternal();
  assertNoBrowserIssues('QA de acceso anonimo');
  await verifyAuthenticatedInternal();

  assertNoBrowserIssues('QA interna autenticada');
  console.log('Friendly browser QA: OK (plataforma pública + portal nominal + ausentismo + ficha + IA + onboarding; desktop y 390 px)');
} finally {
  await browser.close();
}
