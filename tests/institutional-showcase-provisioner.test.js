import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  SHOWCASE_PROVISION_CONFIRMATION,
  SHOWCASE_OWNER_TENANT_ROLE,
  expectedShowcaseMigrationLedger,
  institutionalShowcaseConfiguration,
  prepareShowcaseProvisionMaterials,
  provisionInstitutionalShowcaseUsers,
  validateShowcaseFinalEvidence,
  validateShowcaseRoleContracts,
} from '../scripts/provision-institutional-showcase-users.mjs';
import {
  CONSULTA_INTEGRAL_ROLE,
  HUGO_APROBADOR_INTEGRAL_CAPABILITIES,
  HUGO_APROBADOR_INTEGRAL_ROLE,
  INSTITUTIONAL_READ_CAPABILITIES,
} from '../scripts/apply-institutional-access-profiles-schema.mjs';
import {
  PLATFORM_OWNER_OPERATIONAL_INTEGRAL_CAPABILITIES,
  PLATFORM_OWNER_OPERATIONAL_INTEGRAL_ROLE,
} from '../scripts/apply-platform-owner-operational-integral-schema.mjs';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const BINDING_ID = '22222222-2222-4222-8222-222222222222';
const CONTRACT_ID = '33333333-3333-4333-8333-333333333333';
const OPERATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MEMBERSHIPS = Object.freeze({
  'owner@example.test': '44444444-4444-4444-8444-444444444444',
  'approver@example.test': '55555555-5555-4555-8555-555555555555',
  'reader@example.test': '66666666-6666-4666-8666-666666666666',
});
const DESTINATION_HASH = 'a'.repeat(64);
const SOURCE_COMPANY_ID = 23;
const SOURCE_DATABASE = 'grh_source';
const RELEASE_SHA = 'b'.repeat(40);

const PLATFORM_OWNER_CAPABILITIES = Object.freeze([
  'platform.tenants.read', 'platform.tenants.manage',
  'platform.crm.read', 'platform.crm.manage',
  'platform.users.read', 'platform.users.invite', 'platform.users.manage',
  'platform.roles.read', 'platform.roles.manage', 'platform.audit.read',
]);
const OWNER_SCOPES = Object.freeze([
  'leave.request.area.create', 'leave.request.area.read',
  'leave.request.area.update', 'leave.request.area.submit',
  'leave.request.area.cancel_pending',
]);
const APPROVER_SCOPES = Object.freeze([
  'leave.request.area.read', 'leave.request.area.decide',
  'leave.request.area.cancel_approved',
]);

function env(overrides = {}) {
  return {
    SHOWCASE_PROVISION_CONFIRM: SHOWCASE_PROVISION_CONFIRMATION,
    SHOWCASE_PROVISION_COMMAND_PEPPER: 'command-pepper-for-tests-only-32-bytes',
    SHOWCASE_PROVISION_OPERATION_ID: OPERATION_ID,
    SHOWCASE_PROVISION_REASON: 'Preparacion institucional controlada',
    SHOWCASE_TENANT_SLUG: 'tenant-prueba',
    SHOWCASE_OWNER_EMAIL: 'owner@example.test',
    SHOWCASE_OWNER_DISPLAY_NAME: 'Owner de prueba',
    SHOWCASE_OWNER_PASSWORD: 'owner-pass-123',
    SHOWCASE_APPROVER_EMAIL: 'approver@example.test',
    SHOWCASE_APPROVER_DISPLAY_NAME: 'Aprobador de prueba',
    SHOWCASE_APPROVER_PASSWORD: 'approver-pass-456',
    SHOWCASE_READER_EMAIL: 'reader@example.test',
    SHOWCASE_READER_DISPLAY_NAME: 'Consulta de prueba',
    SHOWCASE_READER_PASSWORD: 'reader-pass-789',
    SHOWCASE_SHARED_MFA_DESTINATION_EMAIL: 'shared-inbox@example.test',
    SHOWCASE_APPROVER_COMPANY_ID: String(SOURCE_COMPANY_ID),
    SHOWCASE_APPROVER_LEGAJO: 'L-100',
    DATABASE_URL_UNPOOLED: 'postgresql://user:secret@ep-isolated.us-east-2.aws.neon.tech/db',
    CANONICAL_QA_BRANCH_ID: 'br-showcase-tests',
    CANONICAL_QA_HOST: 'ep-isolated.us-east-2.aws.neon.tech',
    CANONICAL_QA_DATABASE: 'db',
    ...overrides,
  };
}

function result(rows = []) {
  return { rows, rowCount: rows.length };
}

function roleRows() {
  return [
    {
      roleKey: 'PLATFORM_OWNER', scopeKind: 'platform', systemManaged: true,
      capabilities: [...PLATFORM_OWNER_CAPABILITIES].sort(),
    },
    {
      roleKey: PLATFORM_OWNER_OPERATIONAL_INTEGRAL_ROLE,
      scopeKind: 'tenant', systemManaged: true,
      capabilities: [...PLATFORM_OWNER_OPERATIONAL_INTEGRAL_CAPABILITIES].sort(),
    },
    {
      roleKey: HUGO_APROBADOR_INTEGRAL_ROLE, scopeKind: 'tenant', systemManaged: true,
      capabilities: [...HUGO_APROBADOR_INTEGRAL_CAPABILITIES].sort(),
    },
    {
      roleKey: CONSULTA_INTEGRAL_ROLE, scopeKind: 'tenant', systemManaged: true,
      capabilities: [...INSTITUTIONAL_READ_CAPABILITIES].sort(),
    },
  ].sort((left, right) => left.roleKey.localeCompare(right.roleKey));
}

function materialFactory(configuration) {
  return {
    userEmail: configuration.userEmail,
    destinationCiphertext: `ciphertext:${configuration.userEmail}`,
    destinationHash: DESTINATION_HASH,
    reasonHash: 'b'.repeat(64),
    idempotencyKey: configuration.userEmail.startsWith('owner')
      ? '77777777-7777-4777-8777-777777777777'
      : configuration.userEmail.startsWith('approver')
        ? '88888888-8888-4888-8888-888888888888'
        : '99999999-9999-4999-8999-999999999999',
  };
}

class FakeClient {
  constructor(ledger, options = {}) {
    this.ledger = ledger;
    this.options = options;
    this.queries = [];
    this.connected = false;
    this.ended = false;
    this.factorCount = 0;
    this.memberships = new Map();
    if (options.preprovisioned === true) {
      this.memberships.set('owner@example.test', {
        membershipId: MEMBERSHIPS['owner@example.test'],
        roleKey: options.ownerRoleKey ?? SHOWCASE_OWNER_TENANT_ROLE,
      });
      this.memberships.set('approver@example.test', {
        membershipId: MEMBERSHIPS['approver@example.test'],
        roleKey: HUGO_APROBADOR_INTEGRAL_ROLE,
      });
      this.memberships.set('reader@example.test', {
        membershipId: MEMBERSHIPS['reader@example.test'],
        roleKey: CONSULTA_INTEGRAL_ROLE,
      });
    }
  }

  async connect() { this.connected = true; }

  async end() { this.ended = true; }

  async query(statement, parameters = []) {
    const text = String(statement);
    this.queries.push({ text, parameters });
    if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK'
        || text.includes('pg_advisory_xact_lock')) return result();
    if (text.includes('showcase:migration-ledger')) return result(this.ledger);
    if (text.includes('showcase:role-contracts')) return result(roleRows());
    if (text.includes('showcase:role-conflicts')) return result();
    if (text.includes('showcase:tenant-scope')) return result([{
      tenantId: TENANT_ID,
      tenantSlug: 'tenant-prueba',
      sourceBindingId: BINDING_ID,
      sourceDatabase: SOURCE_DATABASE,
      sourceCompanyId: SOURCE_COMPANY_ID,
      certifiedReleaseSha: RELEASE_SHA,
    }]);
    if (text.includes('showcase:operation-replay')) {
      return this.options.replay ? result([this.options.replay]) : result();
    }
    if (text.includes('showcase:approver-employment')) {
      if (this.options.employmentRows) return result(this.options.employmentRows);
      return result([{ employmentContractId: CONTRACT_ID, sourceCompanyId: SOURCE_COMPANY_ID }]);
    }
    if (text.includes('showcase:user-lock')) return result();
    if (text.includes('showcase:user-insert')) {
      return result([{ email: parameters[0], identityVersion: 1 }]);
    }
    if (text.includes('showcase:credential-upsert')) return result([{ version: 1 }]);
    if (text.includes('showcase:session-revoke')) return result();
    if (text.includes('showcase:owner-role-lock')) return result();
    if (text.includes('showcase:membership-lock')) return result();
    if (text.includes('showcase:membership-insert')) {
      const membershipId = MEMBERSHIPS[parameters[1]];
      this.memberships.set(parameters[1], { membershipId, roleKey: parameters[2] });
      return result([{ id: membershipId, version: 1 }]);
    }
    if (text.includes('showcase:employment-link-lock')) return result();
    if (text.includes('showcase:scope-lock')) return result();
    if (text.includes('showcase:email-factor-provision')) {
      this.factorCount += 1;
      const id = [
        '77777777-7777-4777-8777-777777777777',
        '88888888-8888-4888-8888-888888888888',
        '99999999-9999-4999-8999-999999999999',
      ][this.factorCount - 1];
      return result([{ result: { id, status: 'pending', version: 1, replayed: false } }]);
    }
    if (text.includes('showcase:final-users')) {
      const profileByEmail = new Map([
        ['owner@example.test', { displayName: 'Owner de prueba', legacyRole: 'ADMIN_INTERNO' }],
        ['approver@example.test', { displayName: 'Aprobador de prueba', legacyRole: 'RRHH_APROBADOR' }],
        ['reader@example.test', { displayName: 'Consulta de prueba', legacyRole: 'AUDITOR' }],
      ]);
      return result(Object.keys(MEMBERSHIPS).map((email) => ({
        email,
        ...profileByEmail.get(email),
        active: true,
        authMode: 'managed',
        legacyPasswordHash: null,
        identityVersion: 1,
        managedPasswordHash: `scrypt$16384$8$1$salt$${createSafeDigest(
          env()[email.startsWith('owner')
            ? 'SHOWCASE_OWNER_PASSWORD'
            : email.startsWith('approver')
              ? 'SHOWCASE_APPROVER_PASSWORD'
              : 'SHOWCASE_READER_PASSWORD'],
        )}`,
        credentialVersion: 1,
      })));
    }
    if (text.includes('showcase:final-platform-roles')) {
      return result([{ email: 'owner@example.test', roleKey: 'PLATFORM_OWNER' }]);
    }
    if (text.includes('showcase:final-memberships')) {
      return result([...this.memberships.entries()].map(([email, membership]) => ({
        email,
        membershipId: membership.membershipId,
        roleKey: membership.roleKey,
        status: 'active',
      })));
    }
    if (text.includes('showcase:final-overrides')) return result([{ count: 0 }]);
    if (text.includes('showcase:final-employment')) {
      return result([{
        email: 'approver@example.test',
        employmentContractId: this.options.finalEmploymentContractId ?? CONTRACT_ID,
      }]);
    }
    if (text.includes('showcase:final-scopes')) {
      return result([
        ...OWNER_SCOPES.map((capabilityKey) => ({
          email: 'owner@example.test', capabilityKey, scopeLevel: 'company',
          sourceBindingId: BINDING_ID, companyId: SOURCE_COMPANY_ID,
        })),
        ...APPROVER_SCOPES.map((capabilityKey) => ({
          email: 'approver@example.test', capabilityKey, scopeLevel: 'company',
          sourceBindingId: BINDING_ID, companyId: SOURCE_COMPANY_ID,
        })),
      ]);
    }
    if (text.includes('showcase:final-email-factors')) {
      return result(Object.keys(MEMBERSHIPS).map((email) => ({
        email, destinationHash: DESTINATION_HASH, status: 'pending',
      })));
    }
    if (text.includes('showcase:final-active-sessions')) {
      return result([{ count: this.options.activeSessionCount ?? 0 }]);
    }
    if (text.includes('showcase:audit-event')) return result([{ id: 1 }]);
    return result();
  }
}

test('config exige tres identidades, passwords distintos y empleo inequivoco', () => {
  const config = institutionalShowcaseConfiguration(env());
  assert.equal(config.profiles.length, 3);
  assert.equal(config.profiles.find((profile) => profile.key === 'reader').legacyRole, 'AUDITOR');
  assert.equal(config.employment.kind, 'legacy_key');
  assert.equal(config.employment.companyId, SOURCE_COMPANY_ID);
  assert.throws(() => institutionalShowcaseConfiguration(env({
    SHOWCASE_READER_EMAIL: 'owner@example.test',
  })), /identidades de acceso deben usar emails distintos/);
  assert.throws(() => institutionalShowcaseConfiguration(env({
    SHOWCASE_READER_PASSWORD: 'owner-pass-123',
  })), /contrasenas distintas/);
  assert.throws(() => institutionalShowcaseConfiguration(env({
    SHOWCASE_APPROVER_COMPANY_ID: '', SHOWCASE_APPROVER_LEGAJO: '',
  })), /vinculo inequivoco/);
  assert.throws(() => institutionalShowcaseConfiguration(env({
    SHOWCASE_APPROVER_EMPLOYMENT_CONTRACT_ID: CONTRACT_ID,
  })), /no ambos/);
  const byContract = institutionalShowcaseConfiguration(env({
    SHOWCASE_APPROVER_COMPANY_ID: '', SHOWCASE_APPROVER_LEGAJO: '',
    SHOWCASE_APPROVER_EMPLOYMENT_CONTRACT_ID: CONTRACT_ID,
  }));
  assert.deepEqual(byContract.employment, { kind: 'contract_id', contractId: CONTRACT_ID });
  const canonicalV7 = '12345678-1234-7abc-cdef-1234567890ab';
  const byCanonicalV7Contract = institutionalShowcaseConfiguration(env({
    SHOWCASE_APPROVER_COMPANY_ID: '', SHOWCASE_APPROVER_LEGAJO: '',
    SHOWCASE_APPROVER_EMPLOYMENT_CONTRACT_ID: canonicalV7,
  }));
  assert.deepEqual(byCanonicalV7Contract.employment, {
    kind: 'contract_id', contractId: canonicalV7,
  });
  assert.throws(() => institutionalShowcaseConfiguration(env({
    SHOWCASE_APPROVER_COMPANY_ID: '', SHOWCASE_APPROVER_LEGAJO: '',
    SHOWCASE_APPROVER_EMPLOYMENT_CONTRACT_ID: '12345678-1234-7abc-cdef-1234567890',
  })), /EMPLOYMENT_CONTRACT_ID invalido/);
});

test('provisionador exige un pepper dedicado para ligar el comando sin abrir DB', async () => {
  let clientFactoryCalls = 0;
  await assert.rejects(() => provisionInstitutionalShowcaseUsers({
    argv: ['node', 'script', '--confirm-isolated-branch'],
    env: env({ SHOWCASE_PROVISION_COMMAND_PEPPER: '' }),
    clientFactory: () => { clientFactoryCalls += 1; return new FakeClient([]); },
  }), /SHOWCASE_PROVISION_COMMAND_PEPPER/);
  await assert.rejects(() => provisionInstitutionalShowcaseUsers({
    argv: ['node', 'script', '--confirm-isolated-branch'],
    env: env({ SHOWCASE_PROVISION_COMMAND_PEPPER: 'short' }),
    clientFactory: () => { clientFactoryCalls += 1; return new FakeClient([]); },
  }), /al menos 32 bytes/);
  assert.equal(clientFactoryCalls, 0);
});

test('provisionador exige pines QA corroborados antes de crear el cliente', async () => {
  let clientFactoryCalls = 0;
  const options = {
    argv: ['node', 'script', '--confirm-isolated-branch'],
    clientFactory: () => { clientFactoryCalls += 1; return new FakeClient([]); },
    secrets: {},
  };
  for (const variableName of [
    'CANONICAL_QA_BRANCH_ID',
    'CANONICAL_QA_HOST',
    'CANONICAL_QA_DATABASE',
  ]) {
    await assert.rejects(() => provisionInstitutionalShowcaseUsers({
      ...options,
      env: env({ [variableName]: '' }),
    }), new RegExp(`Falta ${variableName}`));
  }
  await assert.rejects(() => provisionInstitutionalShowcaseUsers({
    ...options,
    env: env({ CANONICAL_QA_HOST: 'ep-other.us-east-2.aws.neon.tech' }),
  }), /no coincide con CANONICAL_QA_HOST/);
  assert.equal(clientFactoryCalls, 0);
});

test('materiales convierten passwords a scrypt y no conservan password ni mailbox en claro', async () => {
  const config = institutionalShowcaseConfiguration(env());
  const inputs = [];
  const materials = await prepareShowcaseProvisionMaterials(config, env(), {
    secrets: {},
    hashPassword: async (value) => {
      inputs.push(value);
      return `scrypt$16384$8$1$salt$${'d'.repeat(64)}`;
    },
    factorMaterial: materialFactory,
  });
  assert.equal(inputs.length, 3);
  const serialized = JSON.stringify(materials);
  for (const secret of [
    config.profiles[0].password,
    config.profiles[1].password,
    config.profiles[2].password,
    config.sharedMfaDestination,
  ]) assert.ok(!serialized.includes(secret));
  assert.ok(materials.every((profile) => profile.passwordHash.startsWith('scrypt$')));
  assert.ok(materials.every((profile) => profile.emailFactor.destinationHash === DESTINATION_HASH));
});

test('factor compartido usa el cifrado existente sin exigir secretos ajenos al email', async () => {
  const secretEnv = env({
    IDENTITY_EMAIL_MFA_PEPPER: 'p'.repeat(32),
    IDENTITY_EMAIL_MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64url'),
  });
  const config = institutionalShowcaseConfiguration(secretEnv);
  const materials = await prepareShowcaseProvisionMaterials(config, secretEnv, {
    hashPassword: async (value) => `scrypt$16384$8$1$salt$${createSafeDigest(value)}`,
  });
  const serialized = JSON.stringify(materials);
  assert.ok(materials.every((profile) => profile.emailFactor.destinationCiphertext.startsWith('v1.')));
  assert.equal(new Set(materials.map((profile) => profile.emailFactor.destinationHash)).size, 1);
  assert.ok(!serialized.includes(config.sharedMfaDestination));
  for (const profile of config.profiles) assert.ok(!serialized.includes(profile.password));
});

test('contratos de roles son exactos y rechazan drift o SoD', () => {
  assert.equal(validateShowcaseRoleContracts(roleRows(), []), true);
  assert.throws(() => validateShowcaseRoleContracts(roleRows().map((row) => (
    row.roleKey === CONSULTA_INTEGRAL_ROLE
      ? { ...row, capabilities: [...row.capabilities, 'leave.approve'] }
      : row
  )), []), /capacidades CONSULTA_INTEGRAL/);
  assert.throws(() => validateShowcaseRoleContracts(roleRows(), [{ roleKey: 'x' }]), /conflicto SoD/);
});

test('provisionador fake usa target directo, transaccion, hashes, factor cifrado y auditoria segura', async () => {
  const expected = await expectedShowcaseMigrationLedger();
  const client = new FakeClient(expected.map((entry) => ({
    version: entry.version, checksum: entry.checksum,
  })));
  const verifyCalls = [];
  const provisioned = await provisionInstitutionalShowcaseUsers({
    argv: ['node', 'script', '--confirm-isolated-branch'],
    env: env(),
    clientFactory: () => client,
    verifyProfiles: async () => { verifyCalls.push('profiles'); },
    verifyMfaAcl: async () => { verifyCalls.push('mfa'); },
    verifyEmailFirstFactor: async () => { verifyCalls.push('email-first'); },
    verifyOwnerOperationalIntegral: async () => { verifyCalls.push('owner-integral'); },
    secrets: {},
    hashPassword: async (value) => `scrypt$16384$8$1$salt$${createSafeDigest(value)}`,
    factorMaterial: materialFactory,
  });
  assert.equal(provisioned.profileCount, 3);
  assert.equal(provisioned.membershipCount, 3);
  assert.equal(provisioned.approverEmploymentLinked, true);
  assert.equal(provisioned.readerReadOnly, true);
  assert.equal(provisioned.targetMode, 'isolated');
  assert.deepEqual(verifyCalls, [
    'profiles', 'mfa', 'email-first', 'owner-integral',
    'profiles', 'mfa', 'email-first', 'owner-integral',
  ]);
  assert.equal(client.connected, true);
  assert.equal(client.ended, true);
  assert.ok(client.queries.some((query) => query.text === 'BEGIN'));
  assert.ok(client.queries.some((query) => query.text === 'COMMIT'));
  assert.ok(!client.queries.some((query) => query.text === 'ROLLBACK'));
  assert.equal(client.queries.filter(
    (query) => query.text.includes('showcase:email-factor-provision'),
  ).length, 3);
  assert.equal(client.queries.filter(
    (query) => query.text.includes('showcase:audit-event'),
  ).length, 1);
  assert.equal(client.queries.filter(
    (query) => query.text.includes('showcase:owner-extra-platform-revoke'),
  ).length, 1);

  const queryPayload = JSON.stringify(client.queries);
  const config = institutionalShowcaseConfiguration(env());
  for (const secret of [
    config.profiles[0].password,
    config.profiles[1].password,
    config.profiles[2].password,
    config.sharedMfaDestination,
    env().SHOWCASE_PROVISION_COMMAND_PEPPER,
  ]) assert.ok(!queryPayload.includes(secret));
  const audit = client.queries.find((query) => query.text.includes('showcase:audit-event'));
  const auditResult = JSON.parse(audit.parameters[7]);
  assert.deepEqual(Object.keys(auditResult).sort(), [
    'approverEmploymentLinked', 'approverScopeCount', 'credentialsManaged',
    'emailFactorsPrepared', 'emailFirstFactorReady', 'membershipCount',
    'ownerOperationalScopeCount',
    'platformOwnerReady', 'profileCount', 'readerReadOnly', 'replayed',
  ].sort());
});

function createSafeDigest(value) {
  return Buffer.from(String(value)).toString('hex').padEnd(64, '0').slice(0, 64);
}

function fakeVerifyPassword(value, hash) {
  return String(hash || '').endsWith(`$${createSafeDigest(value)}`);
}

test('replay revalida credenciales, roles, factores, empleo y sesiones actuales', async () => {
  const expected = await expectedShowcaseMigrationLedger();
  const ledger = expected.map((entry) => ({
    version: entry.version, checksum: entry.checksum,
  }));
  const common = {
    argv: ['node', 'script', '--confirm-isolated-branch'],
    env: env(),
    verifyProfiles: async () => undefined,
    verifyMfaAcl: async () => undefined,
    verifyEmailFirstFactor: async () => undefined,
    verifyOwnerOperationalIntegral: async () => undefined,
    secrets: {},
    hashPassword: async (value) => `scrypt$16384$8$1$salt$${createSafeDigest(value)}`,
    factorMaterial: materialFactory,
    verifyPassword: fakeVerifyPassword,
  };
  const freshClient = new FakeClient(ledger);
  const fresh = await provisionInstitutionalShowcaseUsers({
    ...common, clientFactory: () => freshClient,
  });
  const audit = freshClient.queries.find((query) => query.text.includes('showcase:audit-event'));
  const replayRecord = {
    command: audit.parameters[3],
    commandHash: audit.parameters[6],
    result: JSON.parse(audit.parameters[7]),
  };

  const replayClient = new FakeClient(ledger, { replay: replayRecord, preprovisioned: true });
  const replayed = await provisionInstitutionalShowcaseUsers({
    ...common, clientFactory: () => replayClient,
  });
  assert.equal(fresh.replayed, false);
  assert.equal(replayed.replayed, true);
  assert.ok(replayClient.queries.some((query) => query.text.includes('showcase:final-users')));
  assert.ok(replayClient.queries.some((query) => query.text.includes('showcase:final-memberships')));
  assert.ok(replayClient.queries.some((query) => query.text.includes('showcase:final-email-factors')));
  assert.ok(replayClient.queries.some((query) => query.text.includes('showcase:final-active-sessions')));
  assert.ok(!replayClient.queries.some((query) => query.text.includes('showcase:user-insert')));

  const staleClient = new FakeClient(ledger, {
    replay: replayRecord, preprovisioned: true, activeSessionCount: 1,
  });
  await assert.rejects(() => provisionInstitutionalShowcaseUsers({
    ...common, clientFactory: () => staleClient,
  }), /sesiones activas previas/);
  assert.ok(staleClient.queries.some((query) => query.text === 'ROLLBACK'));
  assert.ok(!staleClient.queries.some((query) => query.text === 'COMMIT'));

  const reassignedEmploymentClient = new FakeClient(ledger, {
    replay: replayRecord,
    preprovisioned: true,
    finalEmploymentContractId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  });
  await assert.rejects(() => provisionInstitutionalShowcaseUsers({
    ...common, clientFactory: () => reassignedEmploymentClient,
  }), /vinculo laboral del aprobador no quedo exacto/);
  assert.ok(reassignedEmploymentClient.queries.some((query) => query.text === 'ROLLBACK'));

  const changedPasswordClient = new FakeClient(ledger, {
    replay: replayRecord, preprovisioned: true,
  });
  await assert.rejects(() => provisionInstitutionalShowcaseUsers({
    ...common,
    env: env({ SHOWCASE_OWNER_PASSWORD: 'owner-pass-rotated' }),
    clientFactory: () => changedPasswordClient,
  }), /reutilizado con otro contenido/);
  assert.ok(!changedPasswordClient.queries.some(
    (query) => query.text.includes('showcase:final-users'),
  ));

  const changedNameClient = new FakeClient(ledger, {
    replay: replayRecord, preprovisioned: true,
  });
  await assert.rejects(() => provisionInstitutionalShowcaseUsers({
    ...common,
    env: env({ SHOWCASE_OWNER_DISPLAY_NAME: 'Owner renombrado' }),
    clientFactory: () => changedNameClient,
  }), /reutilizado con otro contenido/);
  assert.ok(!changedNameClient.queries.some(
    (query) => query.text.includes('showcase:final-users'),
  ));
});

test('empleo ambiguo aborta y hace rollback antes de hashear credenciales', async () => {
  const expected = await expectedShowcaseMigrationLedger();
  const client = new FakeClient(expected.map((entry) => ({
    version: entry.version, checksum: entry.checksum,
  })), {
    employmentRows: [
      { employmentContractId: CONTRACT_ID, sourceCompanyId: SOURCE_COMPANY_ID },
      {
        employmentContractId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        sourceCompanyId: SOURCE_COMPANY_ID,
      },
    ],
  });
  let hashCalls = 0;
  await assert.rejects(() => provisionInstitutionalShowcaseUsers({
    argv: ['node', 'script', '--confirm-isolated-branch'],
    env: env(),
    clientFactory: () => client,
    verifyProfiles: async () => undefined,
    verifyMfaAcl: async () => undefined,
    verifyEmailFirstFactor: async () => undefined,
    verifyOwnerOperationalIntegral: async () => undefined,
    secrets: {},
    hashPassword: async () => { hashCalls += 1; return `scrypt$${'d'.repeat(80)}`; },
    factorMaterial: materialFactory,
  }), /vinculo laboral del aprobador no es unico/);
  assert.equal(hashCalls, 0);
  assert.ok(client.queries.some((query) => query.text === 'ROLLBACK'));
  assert.ok(!client.queries.some((query) => query.text === 'COMMIT'));
});

test('script y documentacion no hardcodean identidades ni destinos reales', async () => {
  const [script, runbook] = await Promise.all([
    readFile(
      new URL('../scripts/provision-institutional-showcase-users.mjs', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../docs/INSTITUTIONAL_SHOWCASE_USERS_RUNBOOK.md', import.meta.url),
      'utf8',
    ),
  ]);
  for (const source of [script, runbook]) {
    assert.doesNotMatch(source, /gmail\.com|@junin\.com/i);
    assert.doesNotMatch(source, /(?:marce|hugo|admin)123/i);
  }
  assert.doesNotMatch(script, /console\.(?:log|error)\([^\n]*(?:password|destinationEmail)/i);
  assert.match(script, /hashInternalPassword/);
  assert.match(script, /password_hash = NULL/);
  assert.match(script, /pg_advisory_xact_lock/);
  assert.match(script, /SHOWCASE_APPROVER_EMPLOYMENT_CONTRACT_ID/);
  assert.match(script, /tenant_identity_provision_email_factor_v1/);
});

test('validador final rechaza sesiones previas, credencial stale o destino distinto', () => {
  const config = institutionalShowcaseConfiguration(env());
  const profiles = config.profiles.map((profile) => ({
    ...profile,
    passwordHash: `scrypt$valid-${profile.key}`,
    emailFactor: { destinationHash: DESTINATION_HASH },
  }));
  const tenant = {
    tenantId: TENANT_ID, sourceBindingId: BINDING_ID,
    sourceCompanyId: SOURCE_COMPANY_ID,
  };
  const evidence = {
    users: profiles.map((profile) => ({
      email: profile.email, displayName: profile.displayName, legacyRole: profile.legacyRole,
      active: true, authMode: 'managed', legacyPasswordHash: null,
      managedPasswordHash: `scrypt$valid-${profile.key}`,
      identityVersion: 1, credentialVersion: 1,
    })),
    platformRoles: [{ email: profiles[0].email, roleKey: 'PLATFORM_OWNER' }],
    memberships: profiles.map((profile) => ({
      email: profile.email, roleKey: profile.tenantRole, status: 'active',
    })),
    overrides: 0,
    links: [{ email: profiles[1].email, employmentContractId: CONTRACT_ID }],
    scopes: [
      ...OWNER_SCOPES.map((capabilityKey) => ({
        email: profiles[0].email, capabilityKey, scopeLevel: 'company',
        sourceBindingId: BINDING_ID, companyId: SOURCE_COMPANY_ID,
      })),
      ...APPROVER_SCOPES.map((capabilityKey) => ({
        email: profiles[1].email, capabilityKey, scopeLevel: 'company',
        sourceBindingId: BINDING_ID, companyId: SOURCE_COMPANY_ID,
      })),
    ],
    factors: profiles.map((profile) => ({
      email: profile.email, destinationHash: DESTINATION_HASH, status: 'pending',
    })),
    activeSessions: 1,
    employment: { employmentContractId: CONTRACT_ID },
  };
  assert.throws(
    () => validateShowcaseFinalEvidence(evidence, tenant, profiles),
    /sesiones activas previas/,
  );
  evidence.activeSessions = 0;
  evidence.users[0].managedPasswordHash = 'scrypt$stale';
  assert.throws(
    () => validateShowcaseFinalEvidence(evidence, tenant, profiles),
    /credencial managed/,
  );
  evidence.users[0].managedPasswordHash = profiles[0].passwordHash;
  evidence.factors = profiles.map((profile) => ({
    email: profile.email, destinationHash: 'f'.repeat(64), status: 'pending',
  }));
  assert.throws(
    () => validateShowcaseFinalEvidence(evidence, tenant, profiles),
    /factores email no comparten/,
  );
  evidence.factors = profiles.map((profile) => ({
    email: profile.email, destinationHash: DESTINATION_HASH, status: 'pending',
  }));
  evidence.platformRoles.push({
    email: profiles[0].email, roleKey: 'PLATFORM_SUPPORT',
  });
  assert.throws(
    () => validateShowcaseFinalEvidence(evidence, tenant, profiles),
    /autoridad global del owner/,
  );
});
