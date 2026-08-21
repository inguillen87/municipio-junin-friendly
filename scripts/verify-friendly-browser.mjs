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
const nominalLicenseQuery = (process.env.QA_NOMINAL_LICENSE_QUERY || '').trim().slice(0, 120);
const actionsEmail = (process.env.QA_ACTIONS_EMAIL || '').trim().slice(0, 254);
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
    return pathname === '/api/internal-auth'
      || pathname === '/api/internal-data'
      || pathname === '/api/internal-actions'
      || pathname === '/api/internal-assistant';
  } catch {
    return false;
  }
}

async function newPage(viewport, options = {}) {
  const context = await browser.newContext({ viewport });
  if (options.authenticated === true && !hasCredentials) {
    const token = issueInternalSessionToken({
      id: 'qa-browser-session',
      email: actionsEmail || 'qa-browser@local.invalid',
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

    const actionsResponse = await context.request.get(`${baseUrl}/api/internal-actions?resource=bootstrap`);
    assert.equal(actionsResponse.status(), 401, 'La API de acciones debe rechazar el acceso anonimo');

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

    await page.goto(`${baseUrl}/centro-acciones`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL((url) => (
      /\/login(?:\.html)?$/.test(url.pathname)
      && url.searchParams.get('next') === 'centro-acciones.html'
    ));
    await page.waitForSelector('#loginForm');
    await assertPageHealthy(page, 'Redireccion de acciones anonima');

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

    await page.goto(`${baseUrl}/gestion-comparativa`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL((url) => (
      /\/login(?:\.html)?$/.test(url.pathname)
      && url.searchParams.get('next') === 'gestion-comparativa.html'
    ));
    await page.waitForSelector('#loginForm');
    await assertPageHealthy(page, 'Redireccion de gestiones anonima');

    await page.goto(`${baseUrl}/presupuesto-control`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL((url) => (
      /\/login(?:\.html)?$/.test(url.pathname)
      && url.searchParams.get('next') === 'presupuesto-control.html'
    ));
    await page.waitForSelector('#loginForm');
    await assertPageHealthy(page, 'Redireccion de presupuesto anonima');

    await page.goto(`${baseUrl}/ausentismo-control`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL((url) => (
      /\/login(?:\.html)?$/.test(url.pathname)
      && url.searchParams.get('next') === 'ausentismo-control.html'
    ));
    await page.waitForSelector('#loginForm');
    await assertPageHealthy(page, 'Redireccion de ausentismo anonimo');

    await page.goto(`${baseUrl}/licencias-control`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL((url) => (
      /\/login(?:\.html)?$/.test(url.pathname)
      && url.searchParams.get('next') === 'licencias-control.html'
    ));
    await page.waitForSelector('#loginForm');
    await assertPageHealthy(page, 'Redireccion de licencias anonima');

    await page.goto(`${baseUrl}/calidad-operativa`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL((url) => (
      /\/login(?:\.html)?$/.test(url.pathname)
      && url.searchParams.get('next') === 'calidad-operativa.html'
    ));
    await page.waitForSelector('#loginForm');
    await assertPageHealthy(page, 'Redireccion de calidad anonima');
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

    if (actionsEmail || hasCredentials) {
      const actionsBootstrapResponse = await context.request.get(`${baseUrl}/api/internal-actions?resource=bootstrap&caseType=leave_request`);
      assert.equal(actionsBootstrapResponse.status(), 200, 'Centro de acciones debe aceptar una identidad DB-authoritative');
      const actionsBootstrap = await actionsBootstrapResponse.json();
      const actionCapabilities = new Set(actionsBootstrap.principal?.capabilities || []);
      const actionSubjects = actionsBootstrap.options?.subjects || [];
      const actionReasons = actionsBootstrap.options?.reasons || [];
      const canReadOvertime = actionCapabilities.has('time.overtime.read');
      let overtimeBootstrap = null;
      if (canReadOvertime) {
        const overtimeBootstrapResponse = await context.request.get(`${baseUrl}/api/internal-actions?resource=bootstrap&caseType=overtime_entry`);
        assert.equal(overtimeBootstrapResponse.status(), 200, 'Mayor esfuerzo debe aceptar la identidad autorizada');
        overtimeBootstrap = await overtimeBootstrapResponse.json();
        assert.equal(overtimeBootstrap.caseType, 'overtime_entry');
        assert.equal(overtimeBootstrap.contract?.policyVersionId, 'junin-mayor-esfuerzo-intake.v1');
        assert.equal(overtimeBootstrap.contract?.confidentiality, 'restricted');
        assert.equal(overtimeBootstrap.contract?.calculated, false);
        assert.equal(overtimeBootstrap.contract?.posted, false);
        assert.equal(overtimeBootstrap.contract?.payrollMutation, false);
        assert.deepEqual(overtimeBootstrap.contract?.declaredMinutes, { min: 1, max: 1440 });
        assert.equal(overtimeBootstrap.feature?.calculated, false);
        assert.equal(overtimeBootstrap.feature?.posted, false);
        for (const capability of overtimeBootstrap.principal?.capabilities || []) actionCapabilities.add(capability);
      }

      await page.goto(`${baseUrl}/centro-acciones`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#appShell:not([hidden])');
      await page.waitForFunction(() => document.querySelector('#actionLoading')?.hidden === true);
      assert.equal(await page.locator('#actionError').isHidden(), true, 'La bandeja de acciones no debe degradar a error');
      const canCreateAction = [
        'leave.request.self.create', 'leave.request.area.create', 'leave.request.all.manage',
      ].some((capability) => actionCapabilities.has(capability));
      const canSearchActionSubjects = [
        'leave.request.area.create', 'leave.request.all.manage',
      ].some((capability) => actionCapabilities.has(capability));
      const hasActionSubjectRoute = actionSubjects.length > 0 || canSearchActionSubjects;
      const hasActionReasonRoute = actionReasons.length > 0 || canSearchActionSubjects;
      if (canCreateAction && hasActionSubjectRoute && hasActionReasonRoute) {
        assert.equal(await page.locator('#createActionButton').isEnabled(), true, 'El alta debe habilitarse con una ruta explícita hacia sujetos y motivos autorizados');
        await page.locator('#createActionButton').click();
        await page.waitForSelector('#actionWizard[open]');
        if (actionReasons.length) assert.equal(await page.locator('#actionLeaveType option').count() > 1, true, 'El catálogo GRH propio debe alimentar el selector de licencias');
        else assert.equal(await page.locator('#actionLeaveType').isDisabled(), true, 'Sin legajo propio, los motivos deben esperar la búsqueda gobernada');
        if (canSearchActionSubjects) {
          const subjectRequestPromise = page.waitForRequest((request) => (
            request.method() === 'POST'
            && new URL(request.url()).pathname === '/api/internal-actions'
            && /"command"\s*:\s*"search_subjects"/.test(request.postData() || '')
          ));
          const subjectResponsePromise = page.waitForResponse((response) => (
            response.request().method() === 'POST'
            && new URL(response.url()).pathname === '/api/internal-actions'
            && /"command"\s*:\s*"search_subjects"/.test(response.request().postData() || '')
          ));
          await page.locator('#actionEmployeeSearch').fill('ad');
          await page.locator('#actionEmployeeSearchButton').click();
          const subjectRequest = await subjectRequestPromise;
          const subjectResponse = await subjectResponsePromise;
          const subjectUrl = new URL(subjectRequest.url());
          assert.equal(subjectUrl.search, '', 'La búsqueda nominal no debe incluir datos en query string');
          assert.deepEqual(subjectRequest.postDataJSON(), {
            caseType: 'leave_request', command: 'search_subjects', payload: { query: 'ad' },
          });
          assert.equal(subjectRequest.headers()['idempotency-key'], undefined, 'Una búsqueda read-only no debe consumir claves de idempotencia');
          assert.equal(subjectResponse.status(), 200, 'La búsqueda efímera debe responder con el contrato gobernado');
          const searchedBootstrap = await subjectResponse.json();
          await page.waitForFunction(() => document.querySelector('#actionEmployeeSearchStatus')?.getAttribute('aria-busy') !== 'true');
          const searchedReasons = searchedBootstrap.options?.reasons || [];
          if (searchedReasons.length) assert.equal(await page.locator('#actionLeaveType option').count(), searchedReasons.length + 1, 'La búsqueda debe reemplazar el catálogo con motivos reautorizados');
        }
        await page.locator('#closeWizard').click();
      }
      const firstAction = page.locator('#actionRows [data-open-action]').first();
      if (await firstAction.count()) {
        const listProjection = await firstAction.locator('xpath=ancestor::tr[1]').getAttribute('data-projection');
        await firstAction.click();
        await page.waitForSelector('#actionDialog[open]');
        await page.waitForFunction(() => document.querySelector('#actionDialogBody')?.getAttribute('aria-busy') === 'false');
        const projection = await page.locator('#actionDialogBody').getAttribute('data-projection');
        assert.ok(['nominal', 'payroll'].includes(projection), 'El detalle debe declarar la proyección autorizada');
        if (listProjection === 'payroll') assert.equal(projection, 'payroll', 'Un detalle nunca debe elevar una fila limitada a nómina hacia identidad nominal');
        if (projection === 'payroll') {
          assert.equal(await page.locator('#actionDialogBody .projection-note').count(), 1, 'Nómina debe explicar su proyección mínima');
          assert.equal(await page.locator('#actionDialogBody .timeline').count(), 0, 'Nómina nunca debe renderizar historial nominal');
          assert.equal(await page.locator('#actionDialogBody .command-panel').count(), 0, 'Nómina nunca debe renderizar comandos administrativos');
          const payrollLabels = await page.locator('#actionDialogBody dt').allTextContents();
          assert.equal(payrollLabels.some((label) => /^(?:Persona|Legajo|Sector)$/i.test(label.trim())), false, 'Nómina no debe construir campos de identidad');
        } else {
          const timelineAdapted = await page.locator('#actionDialogBody .timeline').evaluate((timeline) => (
            timeline.querySelectorAll('li').length > 0
            && !/Actividad registrada\s*Actor registrado/i.test(timeline.innerText)
          ));
          assert.equal(timelineAdapted, true, 'La UI debe adaptar eventType y actor del contrato real');
        }
        await page.locator('#closeActionDialog').click();
      }
      if (canReadOvertime) {
        const overtimeOption = page.locator('#actionTypeFilter option[value="overtime_entry"]');
        assert.equal(await overtimeOption.count(), 1, 'Mayor esfuerzo debe ser descubrible como operación separada');
        assert.equal(await page.locator('#createOvertimeButton').isHidden(), false, 'La lectura explícita debe descubrir la operación');
        const hasGovernedOvertimeReason = (overtimeBootstrap.options?.reasons || []).some((reason) => (
          reason?.governanceStatus === 'operational_provisional'
        ));
        const canEnterOvertime = overtimeBootstrap.feature?.canEnter === true
          && actionCapabilities.has('time.overtime.enter')
          && hasGovernedOvertimeReason;
        assert.equal(await page.locator('#createOvertimeButton').isEnabled(), canEnterOvertime, 'La carga debe exigir capacidad y responsabilidad exclusiva');
        if (canEnterOvertime) {
          await page.locator('#createOvertimeButton').click();
          await page.waitForSelector('#overtimeWizard[open]');
          assert.equal(await page.locator('#overtimeDeclaredMinutes').getAttribute('min'), '1');
          assert.equal(await page.locator('#overtimeDeclaredMinutes').getAttribute('max'), '1440');
          assert.equal(await page.locator('#overtimePolicyVersion').inputValue(), 'junin-mayor-esfuerzo-intake.v1');
          assert.equal(await page.locator('#overtimeConfidentiality').inputValue(), 'Restringida');
          assert.equal(await page.locator('#overtimeWizard [data-calculated="false"]').count(), 1);
          assert.equal(await page.locator('#overtimeWizard [data-amount="null"]').count(), 1);
          assert.equal(await page.locator('#overtimeWizard [data-attendance-reconciled="false"]').count(), 1);
          const overtimeSearchRequestPromise = page.waitForRequest((request) => (
            request.method() === 'POST'
            && new URL(request.url()).pathname === '/api/internal-actions'
            && /"caseType"\s*:\s*"overtime_entry"/.test(request.postData() || '')
            && /"command"\s*:\s*"search_subjects"/.test(request.postData() || '')
          ));
          const overtimeSearchResponsePromise = page.waitForResponse((response) => (
            response.request().method() === 'POST'
            && new URL(response.url()).pathname === '/api/internal-actions'
            && /"caseType"\s*:\s*"overtime_entry"/.test(response.request().postData() || '')
            && /"command"\s*:\s*"search_subjects"/.test(response.request().postData() || '')
          ));
          await page.locator('#overtimeEmployeeSearch').fill('ad');
          await page.locator('#overtimeEmployeeSearchButton').click();
          const overtimeSearchRequest = await overtimeSearchRequestPromise;
          const overtimeSearchResponse = await overtimeSearchResponsePromise;
          assert.equal(new URL(overtimeSearchRequest.url()).search, '', 'La búsqueda de mayor esfuerzo no debe filtrar PII en la URL');
          assert.deepEqual(overtimeSearchRequest.postDataJSON(), {
            caseType: 'overtime_entry', command: 'search_subjects', payload: { query: 'ad' },
          });
          assert.equal(overtimeSearchRequest.headers()['idempotency-key'], undefined, 'La búsqueda read-only no debe usar idempotencia');
          assert.equal(overtimeSearchResponse.status(), 200);
          await page.locator('#closeOvertimeWizard').click();
        }

        const overtimeListResponsePromise = page.waitForResponse((response) => {
          const url = new URL(response.url());
          return response.request().method() === 'GET'
            && url.pathname === '/api/internal-actions'
            && url.searchParams.get('resource') === 'list'
            && url.searchParams.get('caseType') === 'overtime_entry';
        });
        await page.locator('#actionTypeFilter').selectOption('overtime_entry');
        const overtimeListResponse = await overtimeListResponsePromise;
        assert.equal(overtimeListResponse.status(), 200, 'La bandeja de mayor esfuerzo debe cargar sin vistas heredadas');
        const overtimeListUrl = new URL(overtimeListResponse.url());
        assert.equal(overtimeListUrl.searchParams.has('view'), false, 'Mayor esfuerzo no debe enviar view de licencias');
        await page.waitForFunction(() => document.querySelector('#actionLoading')?.hidden === true);
        assert.equal(await page.locator('#actionViews').isHidden(), true, 'Las vistas de licencia no se reutilizan para mayor esfuerzo');

        const firstOvertime = page.locator('#actionRows [data-open-action]').first();
        if (await firstOvertime.count()) {
          await firstOvertime.click();
          await page.waitForSelector('#actionDialog[open]');
          await page.waitForFunction(() => document.querySelector('#actionDialogBody')?.getAttribute('aria-busy') === 'false');
          assert.equal(await page.locator('#actionDialogBody').getAttribute('data-projection'), 'restricted_nominal');
          assert.match(await page.locator('#actionDialogBody').innerText(), /No realizado[\s\S]*No disponible[\s\S]*Asistencia conciliada[\s\S]*No/);
          assert.equal((await page.locator('#actionDialogBody .timeline').innerText()).includes('@'), false, 'El historial de mayor esfuerzo no debe renderizar emails derivados');
          await page.locator('#closeActionDialog').click();
        }
      }
      await assertPageHealthy(page, 'Centro de acciones desktop');
      await page.setViewportSize({ width: 390, height: 844 });
      await assertPageHealthy(page, 'Centro de acciones mobile');
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${baseUrl}/internal`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#appShell:not([hidden])');
    }

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

    const managementResponse = await context.request.get(`${baseUrl}/api/internal-data?resource=managementanalytics`);
    assert.equal(managementResponse.status(), 200, 'La comparativa de gestiones debe aceptar la sesion interna');
    const managementPayload = await managementResponse.json();
    assert.deepEqual(managementPayload.data.periods.previousComparable.range, { from: '2019-12-10', to: '2022-08-07' });
    assert.deepEqual(managementPayload.data.periods.current.range, { from: '2023-12-09', to: '2026-08-06' });
    assert.equal(managementPayload.data.periods.previousComparable.elapsedDays, 972);
    assert.equal(managementPayload.data.periods.current.elapsedDays, 972);
    assert.deepEqual(
      {
        previous: [managementPayload.data.periods.previousComparable.hires, managementPayload.data.periods.previousComparable.exits],
        current: [managementPayload.data.periods.current.hires, managementPayload.data.periods.current.exits],
      },
      { previous: [217, 173], current: [281, 232] },
    );
    assert.equal(managementPayload.data.calendarYears.find((row) => row.year === 2019).hires, 4);
    assert.equal(managementPayload.data.calendarYears.find((row) => row.year === 2019).exits, 4);
    assert.equal(managementPayload.data.payrollComparison.previous.contractMonths, 24117);
    assert.equal(managementPayload.data.payrollComparison.current.contractMonths, 24892);
    assert.equal(managementPayload.data.payrollComparison.previous.alignedEvents, 3244);
    assert.equal(managementPayload.data.payrollComparison.current.alignedEvents, 5728);
    assert.equal(managementPayload.data.payrollComparison.previous.eventsPer100ContractMonths, 13.45);
    assert.equal(managementPayload.data.payrollComparison.current.eventsPer100ContractMonths, 23.01);
    assert.equal(managementPayload.data.sectors.mapping.id, 'garden_sector_family_v1');
    assert.equal(managementPayload.data.sectors.mapping.reversible, true);
    assert.equal(managementPayload.data.budget.available, true);
    assert.equal(managementPayload.data.budget.status, 'approved_budget_loaded');
    assert.equal(managementPayload.data.budget.approvedExpenditures, '31854092000.00');
    assert.equal(managementPayload.data.budget.execution.available, false);
    assert.equal(managementPayload.quality.reconciliations.equalElapsedDays, true);
    assert.equal(managementPayload.meta.containsPersonalData, false);

    await page.goto(`${baseUrl}/gestion-comparativa`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#mainView:not([hidden])');
    await page.waitForFunction(() => /972/.test(document.querySelector('#periodRail')?.textContent || ''));
    assert.match(await page.locator('#movementLedger').innerText(), /217/);
    assert.match(await page.locator('#movementLedger').innerText(), /281/);
    assert.match(await page.locator('#absencePairs').innerText(), /13[,.]45/);
    assert.match(await page.locator('#absencePairs').innerText(), /23[,.]01/);
    assert.match(await page.locator('#mappingNote').innerText(), /jardines|agrupaci[oó]n|homolog/i);
    assert.match(await page.locator('#budgetCard').innerText(), /31[.\s]?854[.\s]?092[.\s]?000|Aprobado disponible/i);
    assert.match(await page.locator('#budgetCard').innerText(), /ejecución.*pendiente|fuente pendiente/is);
    assert.match(await page.locator('#qualityList').innerText(), /concili|cobertura|ambig|sin tipo/i);
    await assertPageHealthy(page, 'Comparativa de gestiones mobile');

    await page.setViewportSize({ width: 1440, height: 900 });
    await assertPageHealthy(page, 'Comparativa de gestiones desktop');

    const budgetResponse = await context.request.get(`${baseUrl}/api/internal-data?resource=budgetapproved`);
    assert.equal(budgetResponse.status(), 200, 'Presupuesto aprobado debe aceptar la sesión interna');
    const budgetPayload = await budgetResponse.json();
    assert.equal(budgetPayload.data.fiscalYear, 2026);
    assert.equal(budgetPayload.data.approved.expenditures, '31854092000.00');
    assert.equal(budgetPayload.data.approved.resources, '27700964239.13');
    assert.equal(budgetPayload.data.approved.financing, '4153127760.87');
    assert.equal(budgetPayload.quality.reconciliations.resourcesPlusFinancingEqualsExpenditures, true);
    assert.equal(budgetPayload.quality.reconciliations.expenseJurisdictionsEqualExpenditures, true);
    assert.equal(budgetPayload.data.execution.available, false);
    assert.equal(budgetPayload.data.execution.status, 'source_not_loaded');

    await page.goto(`${baseUrl}/presupuesto-control`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#mainView:not([hidden])');
    await page.waitForFunction(() => /31[.\s]?854[.\s]?092[.\s]?000/.test(document.querySelector('#expendituresValue')?.textContent || ''));
    assert.match(await page.locator('#resourcesValue').innerText(), /27[.\s]?700[.\s]?964[.\s]?239/);
    assert.match(await page.locator('#financingValue').innerText(), /4[.\s]?153[.\s]?127[.\s]?760/);
    assert.match(await page.locator('#executionHeading').innerText(), /fuente.*pendiente/i);
    assert.match(await page.locator('#executionBadge').innerText(), /Fuente no cargada|No cargado/i);
    await page.waitForSelector('[data-mc-open-guide]');
    await page.locator('[data-mc-open-guide]').click();
    await page.waitForSelector('.mc-guide-drawer');
    assert.match(await page.locator('.mc-guide-drawer').innerText(), /Presupuesto aprobado|Ejecución pendiente/i);
    await page.locator('.mc-guide-close').click();
    await assertPageHealthy(page, 'Presupuesto aprobado desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#menuButton').click();
    assert.equal(await page.locator('#mobileLogoutButton').isVisible(), true, 'Presupuesto móvil debe ofrecer cierre de sesión');
    const mobileLogoutBox = await page.locator('#mobileLogoutButton').boundingBox();
    assert.ok(mobileLogoutBox && mobileLogoutBox.height >= 44, 'Cerrar sesión móvil debe tener un target de al menos 44 px');
    await page.locator('#menuClose').click();
    await assertPageHealthy(page, 'Presupuesto aprobado mobile');
    await page.setViewportSize({ width: 1440, height: 900 });

    const leaveResponse = await context.request.get(`${baseUrl}/api/internal-data?resource=leavenormative`);
    assert.equal(leaveResponse.status(), 200, 'Licencias normativas debe aceptar la sesion interna');
    const leavePayload = await leaveResponse.json();
    assert.equal(leavePayload.data.legal.version, 'mendoza-ley-5811-title-vi.v1');
    assert.equal(leavePayload.data.legal.sources.length, 7);
    assert.deepEqual(leavePayload.data.legal.applicability.supportedEvaluationYears, [2026]);
    assert.equal(leavePayload.data.readiness.employment.records, 2450);
    assert.equal(leavePayload.data.readiness.absences.sourceRows, 31572);
    assert.equal(leavePayload.data.readiness.legacyLeaves.status, 'historical_not_current_ledger');
    assert.equal(leavePayload.data.readiness.workedHours.status, 'not_calculable');
    assert.equal(leavePayload.data.readiness.leaveBalance.status, 'not_calculable');

    await page.goto(`${baseUrl}/licencias-control`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#mainView:not([hidden])');
    await page.waitForFunction(() => /7/.test(document.querySelector('#sourceCount')?.textContent || ''));
    assert.equal(await page.locator('#asOfInput').inputValue(), '2026');
    assert.match(await page.locator('#overallDetail').innerText(), /no deben aplicarse autom[aá]ticamente|perfil municipal|condicional|valid/i);
    assert.match(await page.locator('#limitationsList').innerText(), /horas|saldo|aprob/i);
    await assertPageHealthy(page, 'Licencias normativas mobile');

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

    const qualityResponse = await context.request.get(`${baseUrl}/api/internal-data?resource=qualityoverview`);
    assert.equal(qualityResponse.status(), 200, 'Calidad agregada debe aceptar la sesión interna');
    const qualityPayload = await qualityResponse.json();
    assert.deepEqual(qualityPayload.data.issues.bySeverity, {
      info: 0, warning: 581, error: 8, critical: 0,
    });
    assert.equal(qualityPayload.data.issues.total, 589);
    assert.equal(qualityPayload.data.issues.open, 589);
    assert.deepEqual(
      Object.fromEntries(Object.entries(qualityPayload.data.domains).map(([key, value]) => [key, value.registeredIssues])),
      { payrollCoherence: 556, identityCuil: 25, dates: 8 },
    );
    assert.deepEqual(qualityPayload.data.crosswalk, {
      total: 2349, matched: 1699, ambiguous: 157, unmatched: 493, rejected: 0, reconciled: true,
    });

    const qualityIssuesResponse = await context.request.get(`${baseUrl}/api/internal-data?resource=qualityissues&severity=error&limit=50`);
    assert.equal(qualityIssuesResponse.status(), 200);
    const qualityIssuesPayload = await qualityIssuesResponse.json();
    assert.equal(qualityIssuesPayload.pagination.total, 8);
    assert.equal(qualityIssuesPayload.data.length, 8);
    assert.equal(qualityIssuesPayload.data.every((row) => row.severity === 'error'), true);
    assert.doesNotMatch(JSON.stringify(qualityIssuesPayload.data), /"(?:observedValue|sourceId|canonicalId|details|resolutionNote|dni|cuil|name|nombre)"\s*:/i);

    const lineageResponse = await context.request.get(`${baseUrl}/api/internal-data?resource=importlineage`);
    assert.equal(lineageResponse.status(), 200);
    const lineagePayload = await lineageResponse.json();
    assert.equal(lineagePayload.summary.publishedBatches, 2);
    const grhLineage = lineagePayload.data.find((row) => row.source === 'GRH');
    const personasLineage = lineagePayload.data.find((row) => row.source === 'PERSONAS');
    assert.equal(grhLineage.sourceRowCount, null);
    assert.equal(grhLineage.sourceRowCountStatus, 'not_reported');
    assert.equal(personasLineage.sourceRowCount, 96777);
    assert.equal(personasLineage.trackedIssuesStatus, 'controls_not_materialized');

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseUrl}/calidad-operativa`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#mainContent:not([hidden])');
    await page.waitForFunction(() => /589/.test(document.querySelector('#registeredValue')?.textContent || ''));
    assert.match(await page.locator('#warningValue').innerText(), /581/);
    assert.match(await page.locator('#errorValue').innerText(), /8/);
    assert.match(await page.locator('#sourceChip').innerText(), /GRH.*PERSONAS|PERSONAS.*GRH/i);
    assert.match(await page.locator('#lineageRows').innerText(), /No informado/i, 'GRH nulo no debe mostrarse como cero');
    assert.match(await page.locator('#domainGrid').innerText(), /no evaluado|no están materializados|no equivale a calidad perfecta/i);
    await page.locator('#severitySelect').selectOption('error');
    await page.locator('#filterForm').evaluate((form) => form.requestSubmit());
    await page.waitForFunction(() => /^8\s/.test(document.querySelector('#resultCount')?.textContent || ''));
    assert.equal(await page.locator('#issueRows tr').count(), 8);
    await assertPageHealthy(page, 'Calidad operativa desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    await assertPageHealthy(page, 'Calidad operativa mobile');

    const askAssistant = async (message, enhance = false) => {
      const response = await context.request.post(`${baseUrl}/api/internal-assistant`, {
        data: { message, enhance },
      });
      assert.equal(response.status(), 200, `El asistente debe resolver: ${message}`);
      return response.json();
    };

    const operationalAssistant = await askAssistant('Dame un resumen operativo de GRH');
    assert.equal(operationalAssistant.intent, 'operational_summary');
    assert.equal(operationalAssistant.queryPlan.version, 'municipal_query_plan.v1');
    assert.equal(operationalAssistant.queryPlan.resource, 'summary');
    assert.equal(operationalAssistant.data.grain, 'employment_record_by_company_and_legajo');
    assert.equal(operationalAssistant.data.workforce.historicalRecords, 2450);
    assert.equal(operationalAssistant.data.workforce.activeRecords, 882);

    const structureAssistant = await askAssistant('Mostrame la estructura del sector OBRERO');
    assert.equal(structureAssistant.intent, 'structure_analysis');
    assert.equal(structureAssistant.queryPlan.resource, 'structure');
    assert.equal(structureAssistant.queryPlan.filters.sector, 'OBRERO');
    assert.equal(structureAssistant.data.grain, 'employment_record_by_company_and_legajo');
    assert.ok(structureAssistant.data.coverage.historicalRecords > 0);

    const managementAssistant = await askAssistant('Compará la gestión actual con la anterior usando el mismo tiempo transcurrido');
    assert.equal(managementAssistant.intent, 'management_comparison');
    assert.equal(managementAssistant.queryPlan.resource, 'managementanalytics');
    assert.equal(managementAssistant.data.comparison.elapsedDays, 972);
    assert.equal(managementAssistant.data.periods.previousComparable.hires, 217);
    assert.equal(managementAssistant.data.periods.current.hires, 281);
    assert.equal(managementAssistant.data.payrollComparison.previous.eventsPer100ContractMonths, 13.45);
    assert.equal(managementAssistant.data.payrollComparison.current.eventsPer100ContractMonths, 23.01);
    assert.match(managementAssistant.answer, /no es tasa de ausentismo/i);
    assert.equal(managementAssistant.targetPath, '/gestion-comparativa');
    assert.equal(managementAssistant.privacy.nominalDataExternalized, false);

    const budgetAssistant = await askAssistant('¿Cuál es el presupuesto municipal aprobado para 2026 y qué falta para medir ejecución?');
    assert.equal(budgetAssistant.intent, 'budget_approved');
    assert.equal(budgetAssistant.queryPlan.resource, 'budgetapproved');
    assert.equal(budgetAssistant.data.approved.expenditures, '31854092000.00');
    assert.equal(budgetAssistant.data.approved.resources, '27700964239.13');
    assert.equal(budgetAssistant.data.approved.financing, '4153127760.87');
    assert.equal(budgetAssistant.data.execution.available, false);
    assert.match(budgetAssistant.answer, /no corresponde calcular ejecución, porcentajes ni desvíos/i);
    assert.equal(budgetAssistant.targetPath, '/presupuesto-control');
    assert.equal(budgetAssistant.privacy.nominalDataExternalized, false);

    const eventListAssistant = await askAssistant('Lista los eventos administrativos de ausencia de julio 2026', true);
    assert.equal(eventListAssistant.intent, 'absence_event_list');
    assert.equal(eventListAssistant.queryPlan.resource, 'absenceevents');
    assert.deepEqual(
      { from: eventListAssistant.queryPlan.filters.from, to: eventListAssistant.queryPlan.filters.to },
      { from: '2026-07-01', to: '2026-07-31' },
    );
    assert.ok(eventListAssistant.data.rows.length > 0);
    assert.equal(eventListAssistant.provider.externalProviderAttempted, false);
    assert.equal(eventListAssistant.privacy.nominalDataExternalized, false);

    const qualityListAssistant = await askAssistant('Lista los errores abiertos de calidad de GRH', true);
    assert.equal(qualityListAssistant.intent, 'quality_issue_list');
    assert.equal(qualityListAssistant.queryPlan.resource, 'qualityissues');
    assert.equal(qualityListAssistant.queryPlan.filters.source, 'GRH');
    assert.equal(qualityListAssistant.queryPlan.filters.severity, 'error');
    assert.equal(qualityListAssistant.queryPlan.filters.resolution, 'open');
    assert.equal(qualityListAssistant.data.rows.every((row) => row.source === 'GRH' && row.severity === 'error' && row.resolution === 'open'), true);
    assert.equal(qualityListAssistant.provider.externalProviderAttempted, false);
    assert.match(qualityListAssistant.answer, /snapshots publicados/i);

    const lineageAssistant = await askAssistant('Mostrame el ultimo lote de importacion GRH', true);
    assert.equal(lineageAssistant.intent, 'import_lineage');
    assert.equal(lineageAssistant.queryPlan.resource, 'importlineage');
    assert.equal(lineageAssistant.queryPlan.filters.source, 'GRH');
    assert.equal(lineageAssistant.queryPlan.filters.batch, 'latest_published');
    assert.equal(lineageAssistant.data.batches.length, 1);
    assert.equal(lineageAssistant.data.methodology.liveSynchronization, false);
    assert.equal(lineageAssistant.provider.externalProviderAttempted, false);

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

    await page.locator('#messageInput').fill('Analiza la calidad operativa por severidad y dominio');
    await page.locator('#assistantForm').evaluate((form) => form.requestSubmit());
    await page.waitForFunction(() => document.querySelectorAll('.message.assistant .answer-text').length >= 3);
    const qualityAssistantText = await page.locator('.message.assistant .answer-text').last().innerText();
    assert.match(qualityAssistantText, /589/);
    assert.match(qualityAssistantText, /581/);
    assert.match(qualityAssistantText, /no evaluado.*no puede interpretarse como calidad perfecta/i);
    assert.match(await page.locator('.message.assistant .sources').last().innerText(), /GRH|PERSONAS/i);

    await page.locator('#messageInput').fill('Soy nuevo, por donde empiezo?');
    await page.locator('#assistantForm').evaluate((form) => form.requestSubmit());
    await page.waitForFunction(() => document.querySelectorAll('.message.assistant .answer-text').length >= 4);
    const guidanceText = await page.locator('.message.assistant .answer-text').last().innerText();
    assert.match(guidanceText, /Personas|Estructura|Ayuda/i, 'El asistente debe orientar la navegacion');
    assert.ok(await page.locator('.message.assistant .answer-links').last().count(), 'La orientación debe ofrecer un acceso navegable');

    if (nominalLicenseQuery) {
      const nominalResponse = await context.request.post(`${baseUrl}/api/internal-assistant`, {
        data: { message: nominalLicenseQuery, enhance: true },
      });
      assert.equal(nominalResponse.status(), 200, 'La consulta nominal debe resolverse dentro del portal');
      const nominalPayload = await nominalResponse.json();
      assert.equal(nominalPayload.intent, 'employee_search');
      assert.equal(nominalPayload.data.queryFocus, 'licenses');
      assert.equal(nominalPayload.provider.externalProviderAttempted, false, 'Una consulta nominal no debe salir a OpenAI ni Hugging Face');
      assert.equal(nominalPayload.privacy.nominalDataExternalized, false);
      assert.ok(nominalPayload.data.pagination.total >= 2, 'La consulta debe conservar la desambiguación de legajos históricos');

      await page.locator('#messageInput').fill(nominalLicenseQuery);
      await page.locator('#assistantForm').evaluate((form) => form.requestSubmit());
      await page.waitForFunction(() => document.querySelectorAll('.message.assistant .answer-text').length >= 5);
      assert.match(await page.locator('.message.assistant .topic-label').last().innerText(), /Licencias por empleado/i);
      assert.match(await page.locator('.message.assistant .mode-badge').last().innerText(), /Consulta nominal.*local/i);
      const licenseChoices = page.locator('.message.assistant .suggestion-button', { hasText: 'Ver licencias del legajo' });
      assert.ok(await licenseChoices.count() >= 2, 'La UI debe pedir elegir un legajo cuando una persona tiene más de uno');
      await licenseChoices.first().click();
      await page.waitForFunction(() => document.querySelectorAll('.message.assistant .answer-text').length >= 6);
      assert.match(await page.locator('.message.assistant .topic-label').last().innerText(), /Ficha y licencias históricas/i);
      assert.match(await page.locator('.message.assistant .answer-text').last().innerText(), /licencias históricas.*archivo legado/is);
      assert.match(await page.locator('.message.assistant .facts').last().innerText(), /Licencias históricas registradas/i);

      const messagesBeforeFollowUp = await page.locator('.message.assistant .answer-text').count();
      await page.locator('#messageInput').fill('Y sus ausencias?');
      await page.locator('#assistantForm').evaluate((form) => form.requestSubmit());
      await page.waitForFunction((count) => document.querySelectorAll('.message.assistant .answer-text').length > count, messagesBeforeFollowUp);
      assert.match(await page.locator('.message.assistant .topic-label').last().innerText(), /Ficha y ausencias/i);
      assert.match(await page.locator('.message.assistant .mode-badge').last().innerText(), /Consulta nominal.*local/i);
      assert.match(await page.locator('#activeContextSummary').innerText(), /legajo/i);
      assert.match(await page.locator('[data-query-plan]').last().textContent(), /Contexto reutilizado/i);
    }

    const messagesBeforeEventFlow = await page.locator('.message.assistant .answer-text').count();
    await page.locator('#messageInput').fill('Lista los eventos administrativos de ausencia de julio 2026');
    await page.locator('#assistantForm').evaluate((form) => form.requestSubmit());
    await page.waitForFunction((count) => document.querySelectorAll('.message.assistant .answer-text').length > count, messagesBeforeEventFlow);
    assert.match(await page.locator('.message.assistant .topic-label').last().innerText(), /Eventos administrativos de ausencia/i);
    assert.match(await page.locator('[data-query-plan]').last().textContent(), /01\/07\/2026|2026-07-01/);

    const messagesBeforeAggregateClick = await page.locator('.message.assistant .answer-text').count();
    await page.locator('.message.assistant .suggestion-button', { hasText: 'Resumir estos eventos sin datos nominales' }).last().click();
    await page.waitForFunction((count) => document.querySelectorAll('.message.assistant .answer-text').length > count, messagesBeforeAggregateClick);
    assert.match(await page.locator('.message.assistant .topic-label').last().innerText(), /Ausentismo agregado/i);
    assert.match(await page.locator('[data-query-plan]').last().textContent(), /01\/07\/2026|2026-07-01/);

    const messagesBeforePreviousYear = await page.locator('.message.assistant .answer-text').count();
    await page.locator('.message.assistant .suggestion-button', { hasText: 'Ver el mismo período del año anterior' }).last().click();
    await page.waitForFunction((count) => document.querySelectorAll('.message.assistant .answer-text').length > count, messagesBeforePreviousYear);
    assert.match(await page.locator('.message.assistant .topic-label').last().innerText(), /Ausentismo agregado/i);
    assert.match(await page.locator('[data-query-plan]').last().textContent(), /01\/07\/2025|2025-07-01/);

    const messagesBeforeStructure = await page.locator('.message.assistant .answer-text').count();
    await page.locator('#messageInput').fill('Mostrame la estructura del sector OBRERO');
    await page.locator('#assistantForm').evaluate((form) => form.requestSubmit());
    await page.waitForFunction((count) => document.querySelectorAll('.message.assistant .answer-text').length > count, messagesBeforeStructure);
    assert.match(await page.locator('.message.assistant .topic-label').last().innerText(), /Estructura observada/i);
    assert.match(await page.locator('[data-query-plan]').last().textContent(), /Estructura|sector.*OBRERO/i);
    assert.match(await page.locator('#activeContextChips').innerText(), /Estructura|OBRERO/i);

    const assistantMobileLayout = await page.evaluate(() => {
      const sidebar = document.querySelector('.sidebar')?.getBoundingClientRect();
      const composer = document.querySelector('.composer')?.getBoundingClientRect();
      const messageList = document.querySelector('.messages');
      const contextBar = document.querySelector('[data-conversation-context]')?.getBoundingClientRect();
      return {
        sidebarHeight: sidebar?.height || 0,
        composerVisible: Boolean(composer && composer.top >= 0 && composer.bottom <= innerHeight + 1),
        messageListHeight: messageList?.getBoundingClientRect().height || 0,
        contextWithinViewport: Boolean(contextBar && contextBar.left >= 0 && contextBar.right <= innerWidth + 1),
        viewportHeight: innerHeight,
      };
    });
    assert.ok(assistantMobileLayout.sidebarHeight < 250, `La navegación móvil ocupa ${assistantMobileLayout.sidebarHeight}px`);
    assert.equal(assistantMobileLayout.composerVisible, true, 'El compositor debe permanecer visible durante la conversación móvil');
    assert.ok(assistantMobileLayout.messageListHeight <= assistantMobileLayout.viewportHeight * 0.65, 'La conversación móvil debe usar scroll interno acotado');
    assert.equal(assistantMobileLayout.contextWithinViewport, true, 'El contexto activo debe caber completo en 390 px');
    await assertPageHealthy(page, 'Asistente mobile');

    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto(`${baseUrl}/centro-ayuda`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app:not([hidden])');
    assert.equal(await page.locator('#moduleGrid .module-card').count(), 15, 'El centro debe explicar las quince áreas visibles');
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
  console.log('Friendly browser QA: OK (plataforma pública + portal nominal + acciones + gestiones + ausentismo + licencias + calidad + ficha + IA + onboarding; desktop y 390 px)');
} finally {
  await browser.close();
}
