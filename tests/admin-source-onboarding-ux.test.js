import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = fs.readFileSync(
  new URL('../administracion-plataforma.html', import.meta.url),
  'utf8',
);

function functionSource(name) {
  const match = html.match(new RegExp(`function ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n    \\}`));
  assert.ok(match, `falta función ${name}`);
  return match[0];
}

test('onboarding GRH administrativo conserva sintaxis, accesibilidad y layout móvil', () => {
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(match[1])) {
      assert.doesNotThrow(() => new vm.Script(match[2], { filename: 'administracion-plataforma.html' }));
    }
  }

  const panel = html.match(/<section class="panel" id="sourceOnboardingPanel"[\s\S]*?<\/section>\s*<\/section>/);
  assert.ok(panel, 'falta panel de onboarding de fuente');
  assert.match(panel[0], /id="sourceOnboardingPanel"[^>]+hidden/);
  assert.match(panel[0], /role="status" aria-live="polite"/);
  assert.match(panel[0], /id="sourceSystem"[^>]+value="GRH"[^>]+readonly/);
  for (const id of [
    'sourceDatabase', 'sourceCompanyId', 'sourceBindReason', 'sourceBindSubmit',
    'sourceEvidenceCutoff', 'sourceEvidenceState', 'sourceEvidenceCount',
    'sourceCertifyReason', 'sourceCertifySubmit',
  ]) assert.match(panel[0], new RegExp(`id="${id}"`), `falta control ${id}`);
  assert.match(panel[0], /Vincular fuente GRH/);
  assert.match(panel[0], /Certificar plano de datos/);
  assert.match(panel[0], /no habilita invitaciones ni canales de entrega/i);
  assert.match(html, /@media \(max-width: 1180px\)[\s\S]*?\.source-onboarding-grid \{ grid-template-columns: 1fr; \}/);
});

test('panel aparece sólo con contexto tenant y autoridad plataforma MFA explícita', () => {
  const authorization = functionSource('sourceAuthorizationReady');
  for (const contract of [
    "state.context.mode === 'tenant'",
    'UUID_PATTERN.test(state.context.tenantId)',
    'state.identityAccess.authorized === true',
    'state.identityAccess.platformContext === true',
    'state.identityAccess.mfa === true',
    "state.identityAccess.capabilities.includes('platform.tenants.manage')",
  ]) assert.match(authorization, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  const render = functionSource('renderSourceOnboarding');
  assert.match(render, /sourceOnboardingPanel\.hidden = !authorized/);
  assert.match(render, /sourcePolicyReady\(\)/);
  assert.match(render, /sourceOnboarding\.commands\.has\('bind_source'\)/);
  assert.match(render, /sourceOnboarding\.commands\.has\('certify_data_plane'\)/);
  assert.match(render, /currentCommandReady = alreadyCertified \|\| \(bindingReady \? certifyCommandReady : bindCommandReady\)/);
  assert.match(render, /sourceBindSubmit\.disabled = !bindReady/);
  assert.match(render, /sourceCertifySubmit\.disabled = !certifyReady/);

  const bootstrap = functionSource('normalizeBootstrap');
  assert.match(bootstrap, /identityPolicy: normalizeIdentityPolicy\(payload\)/);
  assert.match(html, /state\.identityPolicy = normalized\.identityPolicy/);
  assert.match(html, /IDENTITY_URL \+ '\?resource=bootstrap'/);
  assert.match(html, /resource=source_onboarding&tenantId=/);
  assert.match(html, /normalizeSourceOnboardingView\(onboardingPayload, tenantId\)/);
  assert.match(html, /state\.sourceOnboarding\.commands = new Set\(onboarding\.commands\)/);
  assert.match(html, /state\.sourceOnboarding\.commands = new Set\(\['certify_data_plane'\]\)/);
  assert.match(html, /state\.sourceOnboarding\.commands = new Set\(\)/);
  assert.doesNotMatch(html, /onboarding\.commands\.forEach[\s\S]+state\.allowedCommands\.add\(command\)/);
  assert.match(html, /state\.sourceOnboarding\.error = error\.message/);
  assert.match(render, /Onboarding no disponible/);
  assert.match(html, /state\.identityPolicy = Object\.assign\(\{\}, state\.identityPolicy/);
});

test('vinculación usa contrato exacto, UUIDv4 y versión del bootstrap sin hardcodes municipales', () => {
  const submit = functionSource('submitSourceBinding');
  assert.match(submit, /tenantId: state\.context\.tenantId/);
  assert.match(submit, /sourceSystem: 'GRH'/);
  assert.match(submit, /sourceDatabase: el\.sourceDatabase\.value\.trim\(\)/);
  assert.match(submit, /sourceCompanyId: Number\(el\.sourceCompanyId\.value\)/);
  assert.match(submit, /reason: el\.sourceBindReason\.value\.trim\(\)/);
  assert.match(submit, /expectedVersion = state\.identityPolicy\.version/);
  assert.match(submit, /state\.sourceOnboarding\.bindIdempotencyKey = commandKey\(\)/);
  assert.match(submit, /postIdentityCommand\([\s\S]*?'bind_source',[\s\S]*?expectedVersion,[\s\S]*?bindIdempotencyKey/);
  assert.equal((submit.match(/bindIdempotencyKey = ''/g) || []).length, 1, 'la clave sólo se descarta tras éxito verificable');
  assert.match(submit, /sourceDatabase\.value = ''[\s\S]*sourceCompanyId\.value = ''[\s\S]*sourceBindReason\.value = ''/);
  assert.match(functionSource('commandKey'), /window\.crypto\.randomUUID\(\)/);

  assert.doesNotMatch(html, /grh_junin/i);
  assert.doesNotMatch(html, /sourceCompanyId\s*:\s*101\b/);
  assert.doesNotMatch(html, /id="source(?:Password|User|Host|Url)"/i);
});

test('certificación exige evidencia agregada, versión actualizada y acción humana separada', () => {
  const evidence = functionSource('sourceEvidenceReady');
  assert.match(evidence, /binding\.tenantId === state\.context\.tenantId/);
  assert.match(evidence, /binding\.sourceSystem === 'GRH'/);
  assert.match(evidence, /binding\.verified === true/);
  assert.match(evidence, /evidence\.validationState === 'published'/);
  assert.match(evidence, /evidence\.contractCount > 0/);

  const submit = functionSource('submitDataPlaneCertification');
  assert.match(submit, /window\.confirm\(/);
  assert.match(submit, /tenantId: state\.context\.tenantId/);
  assert.match(submit, /sourceBindingId: state\.sourceOnboarding\.binding\.id/);
  assert.match(submit, /reason: el\.sourceCertifyReason\.value\.trim\(\)/);
  assert.match(submit, /expectedVersion = state\.identityPolicy\.version/);
  assert.match(submit, /state\.sourceOnboarding\.certifyIdempotencyKey = commandKey\(\)/);
  assert.match(submit, /postIdentityCommand\([\s\S]*?'certify_data_plane',[\s\S]*?expectedVersion,[\s\S]*?certifyIdempotencyKey/);
  assert.equal((submit.match(/certifyIdempotencyKey = ''/g) || []).length, 1, 'la clave sólo se descarta tras éxito verificable');
  assert.doesNotMatch(submit, /set_delivery_ready|invitationDeliveryReady\s*=\s*true/);

  const resumable = functionSource('normalizeSourceOnboardingView');
  assert.match(resumable, /normalized\.binding\.tenantId === normalizedTenantId/);
  assert.match(resumable, /normalized\.evidence\.validationState === 'published'/);
  assert.match(resumable, /normalized\.evidence\.contractCount > 0/);
  assert.doesNotMatch(resumable, /sourceDatabase|sourceCompanyId|\.displayName|\.legajo/);

  const normalizer = functionSource('normalizeSourceBindingResult');
  for (const aggregate of ['sourceCutoff', 'validationState', 'contractCount']) {
    assert.match(normalizer, new RegExp(aggregate));
  }
  assert.doesNotMatch(normalizer, /\.displayName|\.name\b|\.legajo|employeeNumber/);
  const render = functionSource('renderSourceOnboarding');
  assert.match(render, /sourceEvidenceCutoff\.textContent/);
  assert.match(render, /sourceEvidenceState\.textContent = 'Publicada'/);
  assert.match(render, /sourceEvidenceCount\.textContent/);
  assert.doesNotMatch(render, /\.displayName|\.legajo|employeeNumber/);
});
