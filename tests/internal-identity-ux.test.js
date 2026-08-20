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

test('shell de identidad conserva controles táctiles y layout móvil institucional', () => {
  const css = read('assets/identity-security.css');
  assert.match(css, /\.button\s*\{[\s\S]*?min-height:\s*46px/);
  assert.match(css, /\.input\s*\{[\s\S]*?min-height:\s*48px/);
  assert.match(css, /@media \(max-width:\s*560px\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(css, /@import|https?:\/\//);
});
