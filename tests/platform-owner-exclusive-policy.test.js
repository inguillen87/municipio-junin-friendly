import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  hasEffectivePlatformOwnerAuthority,
  hasEffectivePlatformOwnerContext,
} from '../lib/internal-platform-owner-policy.js';

const owner = {
  authorized: true,
  platform: {
    roles: ['PLATFORM_OWNER'],
    capabilities: ['platform.tenants.manage', 'platform.users.invite'],
  },
  tenant: null,
};

test('autoridad propietaria exige simultáneamente rol y capacidad efectiva', () => {
  assert.equal(hasEffectivePlatformOwnerAuthority(owner, ['platform.tenants.manage']), true);
  assert.equal(hasEffectivePlatformOwnerAuthority({ ...owner, authorized: false }, [
    'platform.tenants.manage',
  ]), false);
  assert.equal(hasEffectivePlatformOwnerAuthority({
    ...owner, platform: { ...owner.platform, roles: [] },
  }, ['platform.tenants.manage']), false);
  assert.equal(hasEffectivePlatformOwnerAuthority({
    ...owner, platform: { ...owner.platform, capabilities: [] },
  }, ['platform.tenants.manage']), false);
  assert.equal(hasEffectivePlatformOwnerAuthority(owner, ['capacidad inválida']), false);
});

test('contexto global no se infiere desde una sesión municipal', () => {
  assert.equal(hasEffectivePlatformOwnerContext(owner, ['platform.users.invite']), true);
  assert.equal(hasEffectivePlatformOwnerContext({ ...owner, tenant: { id: 'tenant' } }, [
    'platform.users.invite',
  ]), false);
});

test('la política no identifica propietarios por correo o nombre personal', async () => {
  const source = await readFile(new URL('../lib/internal-platform-owner-policy.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /marcelo|hugo|admin@|junin\.com/i);
  assert.match(source, /PLATFORM_OWNER/);
  assert.match(source, /platform\?\.capabilities/);
});
