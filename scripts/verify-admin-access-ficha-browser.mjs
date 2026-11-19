// Ficha «Ver acceso» de Administración de plataforma, en un navegador real y con datos exclusivamente sintéticos.
// Cubre dos fallas que impidieron cambiar un permiso desde la pantalla el 12/11:
//  1. Con el filtro «Plataforma completa», la ficha marcaba como conflicto nuevo los pares que el rol ya trae, porque la
//     constancia de pares revisados sólo viaja en la consulta del municipio de la membresía.
//  2. Una capacidad publicada en el catálogo que ningún rol municipal trae de fábrica no aparecía para otorgarla.
// No hay API municipal, sesión real ni datos de personas: las respuestas las entrega este mismo archivo.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import {
  startAdminMembershipBrowserServer, buildAdminMembershipAuthFixture, buildAdminMembershipIdentityFixture,
  buildAdminMembershipBootstrapFixture, buildAdminMembershipPlatformOwnersFixture,
} from './verify-admin-membership-governance-browser.mjs';

const TENANT = '20000000-0000-4000-8000-000000000002';
const ROLE = 'OPERACION_INTEGRAL_QA';
const PREPARE = 'payroll.novelty.prepare', APPROVE = 'payroll.novelty.approve';
const PARAMETER_PREPARE = 'payroll.parameter.prepare', PARAMETER_APPROVE = 'payroll.parameter.approve', CLOSE = 'payroll.calculation.close';
const ROLE_CAPABILITIES = ['hr.employee.read', PREPARE, APPROVE, PARAMETER_PREPARE];
const REASON = 'Reparto acordado: otra persona prepara parámetros y esta cuenta revisa y cierra.';
const member = (n, name) => ({
  id: `40000000-0000-4000-8000-00000000000${n}`, tenantId: TENANT, tenantName: 'Municipalidad de Junín QA', roleKey: ROLE, roleLabel: 'Operación integral QA',
  status: 'active', version: 4, email: `${name}-qa@local.invalid`, displayName: `Cuenta ${name} QA`, capabilities: ROLE_CAPABILITIES.slice(),
});
const MEMBERS = [member(1, 'vigente'), member(2, 'desactualizada'), member(3, 'sin-respuesta')];
const baseline = (row, version = row.version) => ({ schema: 'iam.current-pairs.v1', tenantId: TENANT, membershipId: row.id, membershipVersion: version, roleKey: ROLE, pairs: [[APPROVE, PREPARE]] });

function bootstrap() {
  const base = buildAdminMembershipBootstrapFixture(true);
  return {
    ...base,
    roles: [
      { key: ROLE, label: 'Operación integral QA', description: 'Rol municipal sintético con un par ya revisado.', scopeKind: 'tenant', capabilities: ROLE_CAPABILITIES },
      { key: 'PLATFORM_OWNER', label: 'Propietario de plataforma', description: 'Rol de plataforma sintético.', scopeKind: 'platform', capabilities: ['platform.users.manage', 'platform.roles.manage'] },
    ],
    capabilityCatalog: [
      { key: CLOSE, label: 'Cerrar la liquidación propia', description: 'Capacidad publicada que ningún rol trae de fábrica.' },
      { key: PARAMETER_APPROVE, label: 'Aprobar parámetros', description: 'Revisión independiente de parámetros.', conflictsWith: [PARAMETER_PREPARE] },
      { key: 'platform.crm.manage', label: 'Administrar CRM de plataforma', description: 'Exclusiva de plataforma.' },
      { key: 'platform.tenant.fixture', label: 'Capacidad municipal QA', scopeKind: 'tenant' },
      { key: 'payroll.platform.fixture', label: 'Capacidad de plataforma QA', scopeKind: 'platform' },
    ],
    sodRules: [{ left: APPROVE, right: PREPARE, reason: 'Novedades: preparar y aprobar' }],
    allowedCommands: [...base.allowedCommands, 'update_access'],
  };
}

const json = (payload, status = 200) => ({ status, contentType: 'application/json; charset=utf-8', headers: { 'cache-control': 'no-store' }, body: JSON.stringify(payload) });

export async function runAdminAccessFichaVerification() {
  const root = path.resolve(import.meta.dirname, '..'), output = path.join(root, 'verification', 'admin-access-ficha');
  fs.mkdirSync(output, { recursive: true });
  const server = await startAdminMembershipBrowserServer(), browser = await chromium.launch({ headless: true });
  const checks = [], errors = [], evidence = { platformWide: 0, tenantScoped: 0, posts: [], failTenant: false, staleTenant: false, unexpected: [] };
  const check = (ok, name) => { assert.ok(ok, name); checks.push(name); };
  try {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'es-AR', reducedMotion: 'reduce', serviceWorkers: 'block' });
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', d => { errors.push('diálogo inesperado: ' + d.type()); d.dismiss(); });
    await context.route('**/favicon.ico', route => route.fulfill({ status: 204, body: '' }));
    await context.route('**/api/**', route => {
      const request = route.request(), url = new URL(request.url()), resource = url.searchParams.get('resource'), keys = [...url.searchParams.keys()].sort().join(',');
      if (url.pathname === '/api/internal-auth' && request.method() === 'GET') return route.fulfill(json(buildAdminMembershipAuthFixture()));
      if (url.pathname === '/api/internal-identity' && request.method() === 'GET') return route.fulfill(json(resource === 'bootstrap' ? buildAdminMembershipIdentityFixture() : { ok: true, allowedCommands: [], invitations: [] }));
      if (url.pathname === '/api/internal-admin' && request.method() === 'GET') {
        if (resource === 'bootstrap' && keys === 'resource') return route.fulfill(json(bootstrap()));
        if (resource === 'audit') return route.fulfill(json({ ok: true, events: [] }));
        if (resource === 'platform_owners') return route.fulfill(json(buildAdminMembershipPlatformOwnersFixture()));
        if (resource === 'users' && keys === 'resource') { evidence.platformWide += 1; return route.fulfill(json({ ok: true, users: MEMBERS, source: { cutoff: '2099-01-01T00:00:00.000Z' } })); }
        if (resource === 'users' && keys === 'resource,tenantId' && url.searchParams.get('tenantId') === TENANT) {
          evidence.tenantScoped += 1;
          if (evidence.failTenant) return route.fulfill(json({ ok: false, code: 'QA_SIN_RESPUESTA', error: 'Sintético' }, 503));
          return route.fulfill(json({ ok: true, users: MEMBERS.map(row => ({ ...row, version: evidence.staleTenant ? row.version + 1 : row.version, sodEditBaseline: baseline(row, evidence.staleTenant ? row.version + 1 : row.version) })), source: { cutoff: '2099-01-01T00:00:00.000Z' } }));
        }
      }
      if (url.pathname === '/api/internal-admin' && request.method() === 'POST' && url.search === '') {
        const body = request.postDataJSON();
        if (body?.command === 'update_access') { evidence.posts.push({ body, key: request.headers()['idempotency-key'] || '' }); return route.fulfill(json({ ok: true, replayed: false, membership: { id: body.payload.membershipId, status: 'active', roleKey: body.payload.roleKey, version: 5 } })); }
      }
      evidence.unexpected.push(request.method() + ' ' + url.pathname + (resource ? ' · ' + resource + ' · ' + keys : ''));
      return route.fulfill(json({ ok: false, code: 'QA_PEDIDO_INESPERADO' }, 418));
    });

    await page.goto(server.baseUrl + '/administracion-plataforma.html', { waitUntil: 'domcontentloaded' });
    await page.locator('#platformAdminShell').waitFor({ state: 'visible' });
    await page.locator('[data-admin-view="access"]').click(); await page.locator('#accessView').waitFor({ state: 'visible' });
    const openFicha = async row => { await page.locator(`[data-open-user="${row.id}"]`).click(); await page.locator('#userDetailDialog[open]').waitFor(); };
    const closeFicha = async () => { await page.keyboard.press('Escape'); await page.locator('#userDetailDialog[open]').waitFor({ state: 'detached' }).catch(() => page.locator('#userDetailDialog').evaluate(d => d.close())); };
    const box = page.locator('#userConflictBox'), button = page.locator('#updateAccessButton'), reason = page.locator('#userAccessReason');
    const capability = key => page.locator(`#userAccessCapabilities input[data-capability-key="${key}"]`);
    await page.locator(`[data-open-user="${MEMBERS[0].id}"]`).waitFor({ state: 'visible' });
    check(evidence.platformWide >= 1 && evidence.tenantScoped === 0, 'con «Plataforma completa» el directorio se pide sin municipio y llega sin la constancia de pares revisados');

    // 1 · La constancia se pide para la membresía que se abre, y el par que el rol ya trae deja de verse como conflicto nuevo.
    await openFicha(MEMBERS[0]);
    await page.waitForFunction(() => /Se verificó la configuración vigente de esta membresía/.test(document.querySelector('#userConflictBox').textContent));
    check(evidence.tenantScoped === 1 && /Sin conflictos informados/.test(await box.innerText()) && !/Conflictos de segregación/.test(await box.innerText()), 'al abrir la ficha se consulta el municipio de la membresía y el par que el rol ya trae no se marca como conflicto');
    check(await button.isDisabled(), 'sin motivo, «Actualizar acceso» sigue apagado');

    // 2 · El catálogo ofrece lo publicado para un municipio, también lo que ningún rol trae; lo de plataforma no aparece.
    check(await capability(CLOSE).count() === 1 && !(await capability(CLOSE).isChecked()) && await capability(PARAMETER_APPROVE).count() === 1, 'una capacidad publicada que ningún rol municipal trae de fábrica se puede elegir en la ficha');
    check(await capability('platform.crm.manage').count() === 0 && await capability('platform.users.manage').count() === 0, 'las capacidades exclusivas de plataforma no se ofrecen a una membresía municipal');
    check(await capability('platform.tenant.fixture').count() === 1 && await capability('payroll.platform.fixture').count() === 0, 'el alcance explícito publicado tiene prioridad sobre el prefijo del código');

    // 3 · Un conflicto realmente nuevo sigue bloqueando.
    await reason.fill(REASON); await capability(CLOSE).check(); await capability(PARAMETER_APPROVE).check();
    check(await button.isDisabled() && /Conflictos de segregación/.test(await box.innerText()) && (await box.innerText()).includes(PARAMETER_APPROVE), 'preparar y aprobar parámetros a la vez es un conflicto nuevo: se nombra y bloquea');
    await capability(PARAMETER_PREPARE).uncheck();
    check(await button.isEnabled() && /Sin conflictos informados/.test(await box.innerText()), 'al sustituir preparar por aprobar, el cambio queda habilitado');
    await page.screenshot({ path: path.join(output, 'ficha-plataforma-completa.png') });

    // 4 · Se envía un solo pedido, con la versión leída, lo agregado, lo quitado y su clave de idempotencia.
    await button.click(); await page.waitForFunction(() => !document.querySelector('#userDetailDialog').open);
    const sent = evidence.posts[0];
    check(evidence.posts.length === 1 && /^[0-9a-f-]{36}$/.test(sent.key) && sent.body.expectedVersion === 4, 'guardar envía un único pedido con la versión leída y una clave de idempotencia');
    assert.deepEqual({ ...sent.body.payload, allowCapabilities: sent.body.payload.allowCapabilities.slice().sort() }, { membershipId: MEMBERS[0].id, roleKey: ROLE, allowCapabilities: [CLOSE, PARAMETER_APPROVE].sort(), denyCapabilities: [PARAMETER_PREPARE], reason: REASON });
    checks.push('el pedido lleva el rol, lo que se agrega, lo que se quita y el motivo, sin otros campos');

    // 5 · Una constancia de otra versión no sirve: la ficha conserva el bloqueo.
    evidence.staleTenant = true; await page.locator(`[data-open-user="${MEMBERS[1].id}"]`).waitFor({ state: 'visible' }); const before = evidence.tenantScoped;
    await openFicha(MEMBERS[1]); await page.waitForTimeout(600);
    check(evidence.tenantScoped === before + 1 && /Conflictos de segregación/.test(await box.innerText()) && !/Se verificó la configuración vigente/.test(await box.innerText()), 'si la consulta del municipio trae otra versión de la membresía, la constancia no se usa');
    await reason.fill(REASON); check(await button.isDisabled(), 'con la constancia desactualizada no se puede guardar');
    await closeFicha(); evidence.staleTenant = false;

    // 6 · Sin respuesta, tampoco: nunca se inventa una constancia.
    evidence.failTenant = true; const beforeFail = evidence.tenantScoped;
    await openFicha(MEMBERS[2]); await page.waitForTimeout(600);
    check(evidence.tenantScoped === beforeFail + 1 && /Conflictos de segregación/.test(await box.innerText()), 'si la consulta del municipio falla, la ficha conserva el bloqueo');
    await reason.fill(REASON); check(await button.isDisabled() && evidence.posts.length === 1, 'sin constancia no se envía nada');
    await closeFicha();

    assert.deepEqual(evidence.unexpected, [], 'pedidos inesperados'); assert.deepEqual(errors, [], 'errores de página');
    return { passed: true, checks: checks.length };
  } finally { await browser.close(); await server.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(JSON.stringify(await runAdminAccessFichaVerification()) + '\n'); }
  catch (error) { process.stderr.write(String(error?.stack || error) + '\n'); process.exitCode = 1; }
}
