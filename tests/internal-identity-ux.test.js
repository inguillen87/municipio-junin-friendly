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

test('login conserva deep links internos y rechaza destinos externos', () => {
  const html = parseInlineScripts('login.html');
  const source = extractFunction(html, 'allowedDestination');
  const allowedDestination = (search, contextKind = 'tenant') => new Function(
    'window', 'URLSearchParams', 'contextKind', `${source}; return allowedDestination(contextKind);`,
  )({ location: { search } }, URLSearchParams, contextKind);

  assert.equal(allowedDestination('?next=internal-dashboard.html%23legajos'), 'internal-dashboard.html#legajos');
  assert.equal(allowedDestination('?next=%2Finternal-dashboard.html%23ausentismo'), 'internal-dashboard.html#ausentismo');
  assert.equal(allowedDestination('?next=https%3A%2F%2Fevil.example%2F'), 'internal-dashboard.html');
  assert.equal(allowedDestination('?next=internal-dashboard.html%23%2Fevil'), 'internal-dashboard.html');
  assert.equal(allowedDestination('?next=internal-dashboard.html%23legajos', 'platform'), 'administracion-plataforma.html');
  assert.equal(allowedDestination('?next=administracion-plataforma.html', 'platform'), 'administracion-plataforma.html');
  assert.equal(allowedDestination('?next=seguridad-cuenta.html%23sesiones', 'platform'), 'seguridad-cuenta.html#sesiones');
  assert.equal(allowedDestination('?next=administracion-plataforma.html', 'tenant'), 'internal-dashboard.html');

  const contextSource = extractFunction(html, 'sessionContextKind');
  const sessionContextKind = new Function(`${contextSource}; return sessionContextKind;`)();
  assert.equal(sessionContextKind({ tenantId: null }), 'platform');
  assert.equal(sessionContextKind({ tenantId: 'tenant-junin' }), 'tenant');
  assert.equal(sessionContextKind({ activeTenantId: null }), 'platform');
  assert.match(html, /var contextKind = sessionContextKind\(result\) \|\| selectedLoginContextKind/);
  assert.match(html, /\.access-panel \{ order: -1; \}/);
});

test('login permite solicitar y verificar email MFA sin reemplazar TOTP ni recovery', () => {
  const html = parseInlineScripts('login.html');
  assert.match(html, /<div class="email-mfa-card">[\s\S]+id="requestEmailMfaButton"[^>]*>Recibir un código nuevo por correo<\/button>/);
  assert.match(html, /Los códigos de correos anteriores no sirven en otra sesión/);
  assert.match(html, /id="mfaInputLabel">Código de la aplicación autenticadora<\/label>/);
  assert.match(html, /No pegues aquí un código recibido por correo/);
  assert.match(html, /emailMfaRequestKey = emailMfaRequestKey \|\| commandKey\(\)/);
  assert.match(html, /var ambiguousRequest = error && \['IDENTITY_TIMEOUT', 'IDENTITY_GATEWAY_UNAVAILABLE'\]\.includes\(error\.code\)/);
  assert.match(html, /if \(!ambiguousRequest\) emailMfaRequestKey = null/);
  assert.match(html, /\['IDENTITY_EMAIL_MFA_COOLDOWN', 'IDENTITY_RATE_LIMITED'\]\.includes\(error\.code\)[\s\S]+Math\.max\(45, retrySeconds\)/);
  assert.match(html, /ambiguousRequest \|\| \(error && error\.code === 'IDENTITY_MFA_EMAIL_DELIVERY_UNAVAILABLE'\)/);
  assert.match(html, /Number\(result\.retryAfterSeconds \|\| response\.headers\.get\('Retry-After'\)\)/);
  assert.match(html, /error\.retryAfterSeconds = retryAfterSeconds/);
  assert.match(html, /id="useAuthenticatorButton" hidden>Usar la aplicación autenticadora<\/button>/);
  assert.match(html, /id="emailMfaStatus" role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(html, /id="mfaInput"[^>]+inputmode="numeric"[^>]+autocomplete="one-time-code"/);
  assert.match(html, /response\.status === 202 && result\.code === 'EMAIL_MFA_ACCEPTED'/);
  assert.match(html, /El servicio aceptó el envío a ' \+ challenge\.maskedDestination \+ '; revisá bandeja y spam/);
  assert.doesNotMatch(html, /Código enviado a ' \+ challenge\.maskedDestination/);
  assert.match(html, /identityRequest\('request_email_mfa', \{ flowToken: loginFlow\.token \}, \{ expectedVersion: loginFlow\.version, idempotencyKey: emailMfaRequestKey \}\)/);
  assert.match(html, /identityRequest\('verify_email_mfa', \{ flowToken: loginFlow\.token, emailChallengeId: emailMfaChallenge\.id, code: emailMfaValue \}, \{ expectedVersion: emailMfaChallenge\.expectedVersion, idempotencyKey: commandKey\(\) \}\)/);
  assert.match(html, /maskedDestination/);
  assert.match(html, /Math\.max\(45, retryAfterSeconds\)/);
  assert.match(html, /window\.setInterval\([\s\S]+1000\)/);
  assert.match(html, /emailMfaChallenge\.expectedVersion = error\.expectedVersion/);
  assert.match(html, /loginFlow\.version = error\.expectedVersion/);
  assert.match(html, /error\.code === 'IDENTITY_EMAIL_MFA_INVALID'[\s\S]+Ese código de correo no es válido para este acceso o ya venció/);
  assert.match(html, /error\.code === 'IDENTITY_MFA_INVALID'[\s\S]+El código de la aplicación autenticadora no es válido/);
  assert.match(html, /error\.code === 'IDENTITY_FLOW_INVALID_OR_EXPIRED'[\s\S]+El acceso venció/);
  assert.match(html, /mfaInputLabel'\)\.textContent = 'Código de la aplicación autenticadora'/);
  assert.match(html, /mfaHelp'\)\.textContent = 'Ingresá el código vigente de tu aplicación autenticadora\. No pegues aquí un código recibido por correo\./);
  assert.match(html, /selectMfaMethod\('totp'\)/);
  assert.match(html, /selectMfaMethod\('recovery'\)/);
  assert.match(html, /verify_mfa/);
  assert.match(html, /recover_mfa/);
  const openMfaStep = html.match(/function openMfaStep\([\s\S]*?\n    function openLoginEnrollment/);
  assert.ok(openMfaStep, 'falta el paso MFA');
  assert.match(openMfaStep[0], /selectMfaMethod\('totp'\)[\s\S]+requestEmailMfaButton'\)\.focus\(\)/);
  assert.doesNotMatch(openMfaStep[0], /requestEmailMfa\(|request_email_mfa/);
  assert.doesNotMatch(html, /request_email_mfa', \{[^}]*\b(?:email|destination|to)\b/i);
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

test('administración ofrece un cambio explícito y versionado desde tenant a Plataforma', () => {
  const html = parseInlineScripts('administracion-plataforma.html');
  assert.match(html, /id="switchToPlatformButton"/);
  assert.match(html, /Cambiar a Administración de plataforma/);
  assert.match(html, /login\.html\?next=administracion-plataforma\.html/);
  assert.match(html, /IDENTITY_URL \+ '\?resource=bootstrap'/);
  assert.match(html, /postIdentityCommand\('switch_context', \{ context: \{ kind: 'platform' \} \}, access\.sessionVersion, commandKey\(\)\)/);
  assert.match(html, /sessionVersion: authorityVersion\(session\.version, access\.sessionVersion, root\.sessionVersion\)/);
  assert.match(html, /canAdminPlatform: capabilities\.some/);

  const authenticate = html.match(/async function authenticate\(\) \{([\s\S]*?)\n    function bindEvents/);
  assert.ok(authenticate, 'falta compuerta de autenticación administrativa');
  assert.match(authenticate[1], /state\.identityAccess\.tenantContext/);
  assert.match(authenticate[1], /platformContextActions\.hidden = false/);
  assert.doesNotMatch(authenticate[1], /postIdentityCommand\('switch_context'/);
});

test('administración vuelve a una operación tenant antes de abrir herramientas municipales', () => {
  const html = parseInlineScripts('administracion-plataforma.html');
  assert.match(html, /data-operation-target="internal-dashboard\.html#inicio"/);
  assert.match(html, /data-operation-target="centro-acciones\.html"/);
  assert.match(html, /Entrar a operación/);
  assert.match(html, /function operationalTenantCandidate\(\)/);
  assert.match(html, /candidates\.length === 1/);
  assert.match(html, /postIdentityCommand\([\s\S]*?'switch_context',[\s\S]*?\{ context: \{ kind: 'tenant', tenantId: tenantId \} \},[\s\S]*?access\.sessionVersion/);
  assert.match(html, /OPERATION_TARGETS\.includes\(target\)/);
  assert.match(html, /window\.location\.assign\(target\)/);
  assert.match(html, /Elegí primero el gobierno operativo/);

  const source = extractFunction(html, 'normalizeIdentityAccess');
  const normalizeIdentityAccess = new Function(
    'roots', 'firstObject', 'list', 'text', 'first', 'authorityVersion', 'PLATFORM_ADMIN_CAPABILITIES',
    `${source}; return normalizeIdentityAccess;`,
  )(
    (payload) => [payload],
    (...values) => values.find((value) => value && typeof value === 'object' && !Array.isArray(value)) || {},
    (value) => Array.isArray(value) ? value : [],
    (value) => value == null ? '' : String(value).trim(),
    (...values) => values.find((value) => value !== undefined && value !== null && value !== ''),
    (...values) => {
      const value = values.map(Number).find((candidate) => Number.isSafeInteger(candidate) && candidate >= 1);
      return value === undefined ? null : value;
    },
    ['platform.tenants.manage'],
  );
  const access = normalizeIdentityAccess({
    ok: true,
    access: {
      authorized: true,
      tenant: null,
      platform: { capabilities: ['platform.tenants.manage'] },
      session: { version: 7, authLevel: 'recovery' },
    },
  });
  assert.equal(access.platformContext, true);
  assert.equal(access.mfa, true, 'email MFA recovery también es segundo factor vigente');
  assert.equal(access.sessionVersion, 7);
  assert.equal(access.canAdminPlatform, true);
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
