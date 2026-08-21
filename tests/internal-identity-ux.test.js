import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

function parseInlineScripts(file) {
  const html = read(file);
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(match[1])) new vm.Script(match[2], { filename: file });
  }
  return html;
}

test('activación usa código manual y mantiene secretos fuera de URL y almacenamiento', () => {
  const html = parseInlineScripts('activar-cuenta.html');
  assert.match(html, /\/api\/internal-identity/);
  assert.match(html, /begin_activation/);
  assert.match(html, /complete_activation/);
  assert.match(html, /autocomplete="one-time-code"/);
  assert.match(html, /Idempotency-Key/);
  assert.match(html, /expectedVersion/);
  assert.match(html, /pagehide/);
  assert.match(html, /error\.expectedVersion/);
  assert.match(html, /error\.remainingAttempts/);
  assert.match(html, /activationFlow\.version = error\.expectedVersion/);
  assert.match(html, /IDENTITY_FLOW_LOCKED/);
  assert.doesNotMatch(html, /URLSearchParams|location\.(?:search|hash)|localStorage|sessionStorage|console\./);
  assert.doesNotMatch(html, /innerHTML|insertAdjacentHTML|document\.write/);
  assert.doesNotMatch(html, /otpauthUri/);
  assert.match(html, /Códigos de recuperación: única visualización/);
});

test('centro de seguridad expone acceso efectivo, MFA y revocación versionada', () => {
  const html = parseInlineScripts('seguridad-cuenta.html');
  for (const contract of [
    "resource=bootstrap", "resource=sessions", "begin_mfa_enrollment", "complete_mfa_enrollment",
    "revoke_session", "logout", "expectedVersion", "Idempotency-Key", "recoveryCodesRemaining",
    "platformRoles", "tenant.capabilities", "sessionRegistryReady",
  ]) assert.match(html, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `falta contrato ${contract}`);
  assert.match(html, /Ubicación aproximada/);
  assert.match(html, /Los códigos ya emitidos no pueden volver a visualizarse/);
  assert.match(html, /mfaFlow\.version = error\.expectedVersion/);
  assert.match(html, /mfaCompleteIdempotencyKey = commandKey\(\)/);
  assert.match(html, /IDENTITY_FLOW_LOCKED/);
  assert.match(html, /response\.status === 401 && text\(data\.code\) === 'IDENTITY_SESSION_REQUIRED'/);
  assert.match(html, /login\.html\?next=seguridad-cuenta\.html/);
  assert.doesNotMatch(html, /location\.(?:search|hash)|localStorage|console\./);
  assert.doesNotMatch(html, /innerHTML|insertAdjacentHTML|document\.write/);
  assert.doesNotMatch(html, /otpauthUri/);
  assert.doesNotMatch(html, /navigator\.userAgent|document\.cookie/);
});

test('login exige contexto explícito antes de MFA y no autoelige un tenant único', () => {
  const html = parseInlineScripts('login.html');
  assert.match(html, /var IDENTITY_URL = '\/api\/internal-identity'/);
  assert.match(html, /CONTEXT_REQUIRED/);
  assert.match(html, /select_context/);
  assert.match(html, /context:\s*selectedPayload/);
  assert.match(html, /\{ kind: 'platform' \}/);
  assert.match(html, /\{ kind: 'tenant', tenantId: context\.tenantId \}/);
  assert.match(html, /expectedVersion:\s*contextFlow\.version/);
  assert.match(html, /Idempotency-Key/);
  assert.match(html, /ninguno se elige automáticamente/);
  assert.match(html, /type = 'radio'/);
  assert.doesNotMatch(html, /input\.checked\s*=\s*true/);
  assert.match(html, /MFA_REQUIRED/);
  assert.match(html, /MFA_ENROLLMENT_REQUIRED/);
  assert.match(html, /complete_login_mfa_enrollment/);
  assert.match(html, /loginManualMfaKey/);
  assert.match(html, /Códigos de recuperación/);
  assert.match(html, /expectedVersion:\s*loginEnrollmentFlow\.version/);
  assert.match(html, /loginEnrollmentFlow\.version = error\.expectedVersion/);
  assert.match(html, /loginEnrollmentFlow\.idempotencyKey = commandKey\(\)/);
  assert.match(html, /verify_mfa/);
  assert.match(html, /recover_mfa/);
  assert.match(html, /expectedVersion:\s*loginFlow\.version/);
  assert.match(html, /idempotencyKey:\s*loginFlow\.idempotencyKey/);
  assert.match(html, /loginFlow\.version = error\.expectedVersion/);
  assert.match(html, /loginFlow\.idempotencyKey = commandKey\(\)/);
  assert.match(html, /IDENTITY_FLOW_LOCKED/);
  assert.match(html, /activar-cuenta\.html/);
  assert.match(html, /'seguridad-cuenta\.html'/);
  assert.match(html, /contextFlow = null/);
  assert.match(html, /loginFlow = null/);
  assert.doesNotMatch(html, /sessionStorage\.setItem\([^\n]+flowToken/);
  assert.doesNotMatch(html, /localStorage/);
  assert.doesNotMatch(html, /otpauthUri/);
});

test('administración diferencia preparación, emisión y aceptación', () => {
  const html = parseInlineScripts('administracion-plataforma.html');
  assert.match(html, /Preparar invitación/);
  assert.match(html, /issue_invitation/);
  assert.match(html, /IDENTITY_URL \+ '\?resource=invitations'/);
  assert.match(html, /postIdentityCommand\('issue_invitation'/);
  assert.match(html, /Emitir invitación/);
  assert.match(html, /Preparada/);
  assert.match(html, /Emitida/);
  assert.match(html, /Aceptada/);
  assert.match(html, /deliveryStatus/);
  assert.match(html, /invitation\.version/);
  assert.match(html, /seguridad-cuenta\.html/);
  assert.doesNotMatch(html, /token de invitación[^\n]+(?:localStorage|sessionStorage)/i);
});

test('administración laboral queda tenant-bound, versionada y cerrada sin contrato backend', () => {
  const html = parseInlineScripts('administracion-plataforma.html');

  const statusNormalizer = html.match(/function normalizeUserStatus\(value\) \{([\s\S]*?)\n    \}/);
  assert.ok(statusNormalizer, 'falta normalizador de estado de membresía');
  const normalizeMembershipStatus = new Function(
    'normalizeSearch', 'value',
    `${statusNormalizer[0]}\nreturn normalizeUserStatus(value);`,
  );
  const normalizeSearchValue = (value) => String(value || '').trim().toLowerCase();
  assert.equal(normalizeMembershipStatus(normalizeSearchValue, 'suspended'), 'suspended');
  assert.equal(normalizeMembershipStatus(normalizeSearchValue, 'pending'), 'pending');

  for (const contract of [
    'operationalCatalog', 'sourceBindings', 'databaseLabel', 'companyId',
    'employmentLink', 'operationalAccess', 'operationalMembershipId',
    'lookup_employment', 'link_employment', 'revoke_employment_link',
    'replace_action_scopes', 'capabilityKey', 'sourceBindingId', 'scopeLevel',
    'organizationUnitSourceId', 'sectorSourceId', 'reasonCode',
  ]) assert.match(html, new RegExp(contract), `falta contrato laboral ${contract}`);

  const revokeContext = html.match(/function employmentRevokeContextReady\(user\) \{([\s\S]*?)\n    \}/);
  assert.ok(revokeContext, 'falta compuerta tenant-bound para el cierre laboral');
  assert.match(revokeContext[1], /state\.context\.tenantId === user\.tenantId/);
  assert.match(revokeContext[1], /\['active', 'suspended'\]\.includes\(membershipStatus\)/);
  assert.match(revokeContext[1], /\['linked', 'stale'\]\.includes\(linkStatus\)/);
  assert.doesNotMatch(revokeContext[1], /tenantDataPlaneReady|sourceBindings|administrativeOnlyRole|releaseSha/);
  const evaluateRevokeContext = new Function(
    'state', 'normalizeUserStatus', 'user',
    `${revokeContext[0]}\nreturn employmentRevokeContextReady(user);`,
  );
  const cleanupState = {
    context: { mode: 'tenant', tenantId: 'tenant-a' },
    controls: { tenantDataPlaneReady: false },
    operationalCatalog: { sourceBindings: [], reasonCodes: [] },
  };
  const cleanupUser = {
    operationalMembershipId: 'membership-a', tenantId: 'tenant-a',
    status: 'active', roleKey: 'PLATFORM_OWNER', employmentLink: { status: 'linked' },
  };
  const normalizeStatus = (value) => String(value || '').trim().toLowerCase();
  assert.equal(evaluateRevokeContext(cleanupState, normalizeStatus, cleanupUser), true);
  assert.equal(evaluateRevokeContext(cleanupState, normalizeStatus,
    { ...cleanupUser, status: 'suspended', employmentLink: { status: 'stale' } }), true);
  assert.equal(evaluateRevokeContext(cleanupState, normalizeStatus,
    { ...cleanupUser, employmentLink: { status: 'unlinked' } }), false);
  assert.equal(evaluateRevokeContext(cleanupState, normalizeStatus,
    { ...cleanupUser, status: 'invited' }), false);
  assert.equal(evaluateRevokeContext(cleanupState, normalizeStatus,
    { ...cleanupUser, tenantId: 'tenant-b' }), false);

  assert.match(html, /var canLookup = baseReady && canCommand\('lookup_employment'\)/);
  assert.match(html, /var canLink = baseReady && serverReasonCatalogReady && canCommand\('link_employment'\)/);
  assert.match(html, /var scopeReady = baseReady && canCommand\('replace_action_scopes'\)/);
  assert.match(html, /var revokeReady = employmentRevokeContextReady\(user\) && governanceReady\(true\) && !state\.loading/);
  assert.match(html, /var canRevoke = revokeReady && canCommand\('revoke_employment_link'\)/);
  assert.doesNotMatch(html, /var canRevoke = baseReady/);
  assert.match(html, /var employmentControlsReady = \(baseReady && serverReasonCatalogReady\) \|\| revokeReady/);
  assert.match(html, /EMPLOYMENT_REVOCATION_REASON_FALLBACK/);
  for (const reason of ['offboarding', 'employment_change', 'correction']) assert.match(html, new RegExp(reason));
  assert.doesNotMatch(html, /employmentReasonCode\.disabled = [^;]*reasonCodes\.length/);
  assert.match(html, /esta acción no reactiva accesos/);
  assert.match(html, /if \(linked && bindingVerified\)/);
  assert.match(html, /stale \? 'El vínculo informado no es utilizable'/);
  assert.match(html, /user && user\.operationalMembershipId/);
  assert.match(html, /authorityVersion\(user\.operationalAccess\.version\)/);
  assert.doesNotMatch(html, /authorityVersion\(user\.operationalAccess\.version,[^)]*(?:employmentLink|user\.version)/);
  assert.match(html, /binding\.companyId && binding\.verified/);
  assert.match(html, /scopeCatalogIssue/);
  assert.match(html, /administrativeOnlyRole/);
  for (const role of ['PLATFORM_OWNER', 'TENANT_ADMIN', 'ADMIN_INTERNO']) assert.match(html, new RegExp(role));

  assert.match(html, /type="search"[^>]+autocomplete="off"/);
  assert.match(html, /method:\s*'POST'[\s\S]+command:\s*'lookup_employment'[\s\S]+query:\s*query,\s*limit:\s*20/);
  assert.match(html, /el\.employmentLookupQuery\.value = ''/);
  assert.doesNotMatch(html, /params\.set\(['"](?:query|legajo|name|email|employmentContractId)['"]/i);
  assert.doesNotMatch(html, /(?:localStorage|sessionStorage)\.(?:setItem|getItem)/);
  assert.match(html, /@media \(max-width: 390px\)/);
  assert.match(html, /#userDetailDialog \{ width: 100vw; max-width: none; \}/);
  assert.match(html, /#userDetailDialog \.dialog-actions \{ grid-template-columns: 1fr 1fr; \}/);
});

test('shell de identidad conserva controles táctiles y layout móvil institucional', () => {
  const css = read('assets/identity-security.css');
  assert.match(css, /\.button\s*\{[\s\S]*?min-height:\s*46px/);
  assert.match(css, /\.input\s*\{[\s\S]*?min-height:\s*48px/);
  assert.match(css, /@media \(max-width:\s*560px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(css, /@import|https?:\/\//);
});
