import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TemporaryEmailRoutingError,
  assertTemporaryEmailRoutingConfiguration,
  resolveTemporaryEmailRoute,
} from '../lib/internal-temporary-email-routing.js';

const NOW = new Date('2026-08-24T01:30:00.000Z');
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const CONFIG = Object.freeze({
  recipient: 'shared@example.test',
  expiresAt: '2026-08-26T01:30:00.000Z',
  routes: [
    {
      identityEmail: 'owner@example.test', context: 'platform',
      identityLabel: 'Marcelo', roleLabel: 'Administrador de plataforma',
      tenantLabel: 'Administracion global',
    },
    {
      identityEmail: 'hugo@example.test', context: TENANT_ID,
      identityLabel: 'Hugo', roleLabel: 'Aprobador final de RRHH',
      tenantLabel: 'Municipalidad de Junin',
    },
  ],
});
function envFor(config = CONFIG, enabled = 'true') {
  return {
    IDENTITY_TEMPORARY_SHARED_INBOX_ENABLED: enabled,
    IDENTITY_TEMPORARY_SHARED_INBOX_CONFIG: JSON.stringify(config),
  };
}

test('enruta solamente la identidad y el contexto incluidos en la allowlist temporal', () => {
  const env = envFor();
  const platform = resolveTemporaryEmailRoute({
    env, now: NOW, logicalRecipient: 'owner@institution.example',
    identityEmail: 'OWNER@example.test', tenantId: null,
  });
  assert.deepEqual(platform, {
    recipient: 'shared@example.test',
    maskedRecipient: 's••••d@example.test',
    temporarySharedInbox: true,
    temporaryRouteExpiresAt: CONFIG.expiresAt,
    identityEmail: 'owner@example.test',
    context: 'platform',
    identityLabel: 'Marcelo',
    roleLabel: 'Administrador de plataforma',
    tenantLabel: 'Administracion global',
  });

  const wrongContext = resolveTemporaryEmailRoute({
    env, now: NOW, logicalRecipient: 'owner@institution.example',
    identityEmail: 'owner@example.test', tenantId: TENANT_ID,
  });
  assert.equal(wrongContext.temporarySharedInbox, false);
  assert.equal(wrongContext.recipient, 'owner@institution.example');

  const notAllowed = resolveTemporaryEmailRoute({
    env, now: NOW, logicalRecipient: 'other@institution.example',
    identityEmail: 'other@example.test', tenantId: TENANT_ID,
  });
  assert.equal(notAllowed.temporarySharedInbox, false);
  assert.equal(notAllowed.recipient, 'other@institution.example');
});

test('la bandera apagada conserva el destinatario normal aunque exista configuracion', () => {
  const route = resolveTemporaryEmailRoute({
    env: envFor(CONFIG, 'false'), now: NOW,
    logicalRecipient: 'owner@institution.example', identityEmail: 'owner@example.test',
  });
  assert.equal(route.temporarySharedInbox, false);
  assert.equal(route.recipient, 'owner@institution.example');
});

test('una ruta allowlisted vencida falla cerrado y nunca vuelve silenciosamente al correo logico', () => {
  const expired = { ...CONFIG, expiresAt: '2026-08-24T01:29:59.000Z' };
  assert.throws(() => resolveTemporaryEmailRoute({
    env: envFor(expired), now: NOW,
    logicalRecipient: 'owner@institution.example', identityEmail: 'owner@example.test',
  }), (error) => error instanceof TemporaryEmailRoutingError
    && error.reason === 'TEMPORARY_ROUTE_EXPIRED');
});

test('rechaza ventana mayor a siete dias, duplicados, campos extra y flag ambiguo', () => {
  const invalidConfigurations = [
    envFor({ ...CONFIG, expiresAt: '2026-08-31T01:30:00.001Z' }),
    envFor({ ...CONFIG, routes: [...CONFIG.routes, CONFIG.routes[0]] }),
    envFor({ ...CONFIG, extra: true }),
    envFor({ ...CONFIG, recipient: 'shared@localhost' }),
    envFor({ ...CONFIG, routes: [{ ...CONFIG.routes[0], roleLabel: 'Admin\nBcc: attacker' }] }),
    envFor(CONFIG, '1'),
  ];
  for (const env of invalidConfigurations) {
    assert.throws(
      () => assertTemporaryEmailRoutingConfiguration({ env, now: NOW }),
      TemporaryEmailRoutingError,
    );
  }
});
