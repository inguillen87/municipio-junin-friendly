import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const adminHtmlUrl = new URL('../administracion-plataforma.html', import.meta.url);

function extractFunction(source, name) {
  const marker = `function ${name}`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `falta ${marker}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`el cuerpo de ${name} no cierra`);
}

test('decisiones de membresía usan fundamento por fila y confirmación contextual', async () => {
  const html = await readFile(adminHtmlUrl, 'utf8');
  assert.doesNotMatch(html, /id="membershipDecisionReason"/);
  assert.match(html, /reasonInput\.dataset\.membershipDecisionReason = request\.id/);
  assert.match(html, /button\.closest\('tr'\)/);
  assert.match(html, /Gobierno: ' \+ request\.tenantName/);
  assert.match(html, /Cuenta: ' \+ request\.targetEmail/);
  assert.match(html, /Rol: ' \+ request\.roleKey/);
  assert.match(html, /Fundamento: ' \+ reason/);
  assert.match(html, /window\.confirm\(confirmation\)/);
  assert.match(html, /approve\.disabled = !approveReady \|\| state\.loading \|\| !reasonReady/);
  assert.match(html, /reject\.disabled = !rejectReady \|\| state\.loading \|\| !reasonReady/);
  assert.doesNotMatch(html, /var approveReady =[^;]+&& !state\.loading/);
  assert.doesNotMatch(html, /var rejectReady =[^;]+&& !state\.loading/);
});

test('expiración y readiness se muestran sin fingir una decisión', async () => {
  const html = await readFile(adminHtmlUrl, 'utf8');
  assert.match(html, /expiresAt: row\.expiresAt/);
  assert.match(html, /if \(status === 'expired'\) return 'Vencida'/);
  assert.match(html, /Vencida sin decisión/);
  assert.match(html, /No modificó permisos ni creó una membresía/);
  assert.match(html, /governance\.actorGovernanceReady === true/);
  assert.match(html, /governance\.makerCheckerReady === true/);
  assert.match(html, /governance\.actionableRequestCount/);
});

test('asociación sólo ofrece tenants certificados e idempotencia sobrevive a respuestas inciertas', async () => {
  const html = await readFile(adminHtmlUrl, 'utf8');
  assert.match(html, /membershipGovernance\.eligibleTenantIds/);
  assert.match(html, /eligibleMembershipTenants/);
  assert.match(html, /eligibleTenantIds\.has\(tenant\.id\)/);
  assert.match(html, /pendingCommandKeys: new Map\(\)/);
  assert.match(html, /state\.pendingCommandKeys\.get\(commandFingerprint\) \|\| commandKey\(\)/);
  assert.match(html, /postCommand\(command, payload, expectedVersion, idempotencyKey\)/);
  assert.match(html, /error\.status === 408 \|\| error\.status === 409/);
  assert.match(html, /await loadAll\(state\.context\.tenantId \|\| ''\)/);
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(match[1])) new vm.Script(match[2], { filename: 'administracion-plataforma.html' });
  }
});

test('filtro administrativo no convierte el fallback Junín sin UUID en contexto operativo', async () => {
  const html = await readFile(adminHtmlUrl, 'utf8');
  assert.match(html, /<small>Filtro administrativo<\/small>/);
  assert.match(html, /<h2 id="tenantSwitcherTitle">Filtrar administración<\/h2>/);
  assert.match(html, /no inicia una sesión operativa ni cambia la membresía activa/);
  assert.match(html, /if \(tenant\.apiBacked === false\) \{[\s\S]+button\.disabled = true/);
  assert.match(html, /Referencia sin UUID · no seleccionable/);
  assert.match(html, /button\.dataset\.tenantOption = tenant\.id/);
  assert.match(html, /if \(tenantId && \(!requestedTenant \|\| requestedTenant\.apiBacked !== true\)\)/);
  assert.match(html, /La sesión operativa no cambió/);
});

test('directorio reconoce la membresía v2 sin inventar alcances no informados', async () => {
  const html = await readFile(adminHtmlUrl, 'utf8');
  const source = extractFunction(html, 'normalizeUser');
  const firstObject = (...values) => values.find((value) => value && typeof value === 'object' && !Array.isArray(value)) || {};
  const first = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');
  const text = (value, fallback = '') => String(value ?? fallback).trim();
  const normalizeUser = new Function(
    'firstObject', 'first', 'list', 'text', 'titleize', 'authorityVersion',
    'normalizeEmploymentLink', 'normalizeOperationalAccess',
    `${source}; return normalizeUser;`,
  )(
    firstObject,
    first,
    (value) => Array.isArray(value) ? value : [],
    text,
    (value) => text(value).replace(/[._-]+/g, ' '),
    (...values) => values.map(Number).find((value) => Number.isSafeInteger(value) && value >= 1) ?? null,
    () => ({ status: 'unlinked' }),
    (value) => ({ version: value?.version ?? null, scopes: Array.isArray(value?.scopes) ? value.scopes : [] }),
  );

  const globalProjection = normalizeUser({
    id: 'membership-a', tenantId: 'tenant-a', roleKey: 'CONSULTA_INTEGRAL',
    status: 'active', version: 4, capabilities: ['workforce.summary.read'],
  });
  assert.equal(globalProjection.operationalMembershipId, 'membership-a');
  assert.equal(globalProjection.operationalAccessReported, false);
  assert.deepEqual(globalProjection.operationalAccess.scopes, []);

  const tenantProjection = normalizeUser({
    id: 'membership-a', tenantId: 'tenant-a', roleKey: 'CONSULTA_INTEGRAL', status: 'active',
    membership: { id: 'membership-a', tenantId: 'tenant-a', roleKey: 'CONSULTA_INTEGRAL', status: 'active' },
    operationalAccess: { version: 7, scopes: [] },
  });
  assert.equal(tenantProjection.operationalMembershipId, 'membership-a');
  assert.equal(tenantProjection.operationalAccessReported, true);
  assert.equal(tenantProjection.operationalAccess.version, 7);

  assert.match(html, /Alcances: elegí el gobierno/);
  assert.match(html, /Alcances no informados en vista global/);
});

test('asociación calcula un checker distinto del actor y del objetivo antes de habilitarse', async () => {
  const html = await readFile(adminHtmlUrl, 'utf8');
  assert.match(html, /var eligibleCheckerCount = email \? state\.platformGovernance\.owners\.filter/);
  assert.match(html, /owner\.email !== actorEmail && owner\.email !== email/);
  assert.match(html, /eligibleCheckerCount > 0 && conflicts\.length === 0/);
  assert.match(html, /Con dos propietarios, cada owner debe solicitar su propia membresía para que el otro pueda decidir/);
});
