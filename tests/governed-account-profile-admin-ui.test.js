import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

import {
  ACCOUNT_PROFILE_ADMIN_VIEW_MIGRATION_VERSION,
  ACCOUNT_PROFILE_ADMIN_VIEW_SIGNATURE,
  accountProfileAdminViewFingerprint,
  validateAccountProfileAdminViewEvidence,
  validateAccountProfileAdminViewMigrationSql,
} from '../scripts/apply-governed-account-profile-admin-view-schema.mjs';
import { splitPostgresStatements } from '../scripts/lib/sql-statements.mjs';

const migration = await readFile(new URL(
  '../scripts/migrations/030-governed-account-profile-admin-view.sql', import.meta.url,
), 'utf8');
const applier = await readFile(new URL(
  '../scripts/apply-governed-account-profile-admin-view-schema.mjs', import.meta.url,
), 'utf8');
const html = await readFile(new URL('../administracion-plataforma.html', import.meta.url), 'utf8');
const vercelIgnore = await readFile(new URL('../.vercelignore', import.meta.url), 'utf8');
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

function functionDefinition(source, name) {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION ${name}`);
  assert.ok(start >= 0, `funcion ${name} ausente`);
  const end = source.indexOf('\n$$;', start);
  assert.ok(end > start, `cierre ${name} ausente`);
  return source.slice(start, end + 4);
}

function parseInlineScripts() {
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(match[1])) {
      assert.doesNotThrow(() => new vm.Script(match[2], {
        filename: 'administracion-plataforma.html',
      }));
    }
  }
}

test('030 expone identityVersion por fachada y no muta identidad ni GRH', () => {
  assert.equal(ACCOUNT_PROFILE_ADMIN_VIEW_MIGRATION_VERSION,
    '030-governed-account-profile-admin-view');
  assert.equal(validateAccountProfileAdminViewMigrationSql(migration), true);
  assert.match(accountProfileAdminViewFingerprint(migration), /^[a-f0-9]{64}$/);
  assert.equal(splitPostgresStatements(migration).length, 4);
  const view = functionDefinition(migration, 'tenant_iam_admin_view_v4');
  assert.match(view, /tenant_iam_admin_view_v3\(/);
  assert.match(view, /jsonb_build_object\('identityVersion', account\.identity_version\)/);
  assert.match(view, /LEFT JOIN internal_users account[\s\S]+lower\(item\.value->>'email'\)/);
  assert.match(view, /tenant\.status = 'active'/);
  assert.match(view, /policy\.tenant_data_plane_ready IS TRUE/);
  assert.match(view, /policy\.certified_release_sha = p_release_sha/);
  assert.match(view, /binding\.source_system = 'GRH'[\s\S]+binding\.verified IS TRUE/);
  assert.match(view, /jsonb_build_array\('update_account_profile'\)/);
  assert.doesNotMatch(view, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
});

test('evidencia 030 exige una unica fachada runtime sin grant option', () => {
  assert.equal(validateAccountProfileAdminViewEvidence({
    function: {
      signature: ACCOUNT_PROFILE_ADMIN_VIEW_SIGNATURE,
      securityDefiner: true,
      ownedByCurrentUser: true,
      ownerIsRuntime: false,
      publicExecuteRevoked: true,
      runtimeCanExecute: true,
      runtimeExecuteGrantable: false,
      nonOwnerExecuteGrantees: ['municontrol_actions_runtime_app'],
      config: ['search_path=public, pg_temp'],
      sourceBody: functionDefinition(migration, 'tenant_iam_admin_view_v4'),
    },
  }), true);
  assert.throws(() => validateAccountProfileAdminViewEvidence({
    function: {
      signature: ACCOUNT_PROFILE_ADMIN_VIEW_SIGNATURE,
      securityDefiner: true,
      ownedByCurrentUser: true,
      ownerIsRuntime: false,
      publicExecuteRevoked: true,
      runtimeCanExecute: true,
      runtimeExecuteGrantable: true,
      nonOwnerExecuteGrantees: ['municontrol_actions_runtime_app'],
      config: ['search_path=public, pg_temp'],
      sourceBody: functionDefinition(migration, 'tenant_iam_admin_view_v4'),
    },
  }), /fuera de contrato/);
});

test('aplicador 030 es ledgered, transaccional, fijado a Neon y depende de 028', () => {
  for (const pattern of [
    /028-governed-account-profile\.sql/,
    /SELECT checksum_sha256 FROM schema_migrations/,
    /resolvePinnedNeonTarget/,
    /verifyPinnedNeonConnectedTarget/,
    /pg_advisory_xact_lock/,
    /await client\.query\('BEGIN'\)/,
    /await client\.query\('COMMIT'\)/,
    /await client\.query\('ROLLBACK'\)/,
    /verifyNoUnledgeredObjects\(client\)/,
    /verifyAccountProfileAdminViewFinalState\(client\)/,
  ]) assert.match(applier, pattern);
  assert.equal(packageJson.scripts['db:identity:account-profile-view:schema'],
    'node --env-file=.env.local scripts/apply-governed-account-profile-admin-view-schema.mjs --confirm-isolated-branch');
  assert.match(vercelIgnore,
    /!scripts\/migrations\/030-governed-account-profile-admin-view\.sql/);
});

test('Usuarios y roles corrige solo el nombre con version de identidad y confirmacion revocatoria', () => {
  parseInlineScripts();
  assert.match(html, /id="accountProfileTitle">Nombre visible de la cuenta/);
  assert.match(html, /id="profileDisplayName"[^>]+minlength="3"[^>]+maxlength="120"[^>]+disabled/);
  assert.match(html, /id="profileReason"[^>]+minlength="3"[^>]+maxlength="500"[^>]+required[^>]+disabled/);
  assert.match(html, /revoca todas las sesiones activas de esta cuenta/i);
  assert.match(html, /identityVersion: authorityVersion\(first\(row\.identityVersion, firstObject\(row\.identity\)\.version\)\)/);

  const gate = html.match(/function updateAccountProfileGate\(\) \{([\s\S]*?)\n    \}\n\n    function administrativeOnlyRole/);
  assert.ok(gate, 'falta la compuerta de perfil');
  assert.match(gate[1], /platformCapabilityAllowed\(\['platform\.users\.manage'\]\)/);
  assert.match(gate[1], /displayName\.length >= 3/);
  assert.match(gate[1], /mutationAllowed\('update_account_profile', false\)/);
  assert.match(gate[1], /state\.context\.tenantId === user\.tenantId/);
  assert.match(gate[1], /normalizeUserStatus\(user\.status\) === 'active'/);
  assert.match(gate[1], /Number\(user\.identityVersion\)/);
  assert.match(gate[1], /no se usará la versión de membresía/i);

  const handler = html.match(/el\.updateProfileButton\.addEventListener\('click', function \(\) \{([\s\S]*?)\n      \}\);/);
  assert.ok(handler, 'falta el handler de correccion de perfil');
  assert.match(handler[1], /window\.confirm\(confirmation\)/);
  assert.match(handler[1], /revocará todas las sesiones activas de la cuenta/i);
  assert.match(handler[1], /runCommand\('update_account_profile'/);
  assert.match(handler[1], /tenantId: user\.tenantId/);
  assert.match(handler[1], /targetEmail: user\.email/);
  assert.match(handler[1], /reason: el\.profileReason\.value\.trim\(\)/);
  assert.match(handler[1], /Number\(user\.identityVersion\)/);
  assert.doesNotMatch(handler[1], /Number\(user\.version\)/);
});
