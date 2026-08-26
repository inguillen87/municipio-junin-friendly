import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  TIME_SOURCE_CASE_TYPE,
  TIME_SOURCE_DOMAINS,
  TIME_SOURCE_OWNER_AUTHORITIES,
  TIME_SOURCE_REGISTRY_CONTRACT,
  applyTimeSourceCommand,
  getTimeSourceBootstrap,
  listTimeSources,
  normalizeTimeSourceCommand,
  readTimeSource,
} from '../lib/internal-time-source-registry.js';

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MEMBERSHIP_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BINDING_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PERSON_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SESSION_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const CONTRACT_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const IDEMPOTENCY_KEY = '22222222-2222-4222-8222-222222222222';
const RELEASE_SHA = 'a'.repeat(40);

function identity(overrides = {}) {
  return {
    user: { email: 'actor@junin.gob.ar' },
    tenant: {
      id: TENANT_ID,
      membershipId: MEMBERSHIP_ID,
      source: 'membership',
    },
    ...overrides,
  };
}

function session(overrides = {}) {
  return {
    id: SESSION_ID,
    email: 'actor@junin.gob.ar',
    version: 4,
    releaseSha: RELEASE_SHA,
    ...overrides,
  };
}

function governedPrincipal(capabilities = ['time.source.read']) {
  return {
    email: 'actor@junin.gob.ar',
    tenantId: TENANT_ID,
    membershipId: MEMBERSHIP_ID,
    certifiedBindingId: BINDING_ID,
    actorPersonId: PERSON_ID,
    capabilities,
  };
}

function metadata(overrides = {}) {
  return {
    domain: 'shift_assignment',
    ownerAuthority: 'municipal_human_resources',
    format: 'postgres_relation',
    schemaVersion: 'v1.0',
    artifactSha256: 'b'.repeat(64),
    cutAt: '2026-08-20T23:00:00Z',
    coverageFrom: '2026-08-01',
    coverageTo: '2026-08-31',
    timezone: 'America/Argentina/Mendoza',
    grain: 'employee_shift_day',
    identityKeyKind: 'employment_contract_id',
    recordCount: 1200,
    reasonCode: 'source_onboarding',
    reason: 'Fuente certificada por Recursos Humanos',
    ...overrides,
  };
}

function command(commandName = 'create_draft', overrides = {}) {
  const creating = commandName === 'create_draft';
  const updating = commandName === 'update_draft';
  const reasons = {
    submit: 'ready_for_review',
    approve: 'evidence_verified',
    reject: 'insufficient_evidence',
    retire: 'source_retired',
    cancel: 'withdrawn',
  };
  return {
    caseType: TIME_SOURCE_CASE_TYPE,
    command: commandName,
    expectedVersion: creating ? 0 : 1,
    ...(creating ? {} : { contractId: CONTRACT_ID }),
    payload: creating || updating
      ? metadata({
        reasonCode: creating ? 'source_onboarding' : 'metadata_correction',
        reason: creating ? 'Fuente certificada por Recursos Humanos' : 'Corrección documentada',
      })
      : { reasonCode: reasons[commandName], reason: 'Decisión humana documentada' },
    ...overrides,
  };
}

function record(overrides = {}) {
  return {
    id: CONTRACT_ID,
    domain: 'shift_assignment',
    ownerAuthority: 'municipal_human_resources',
    format: 'postgres_relation',
    schemaVersion: 'v1.0',
    artifactSha256: 'b'.repeat(64),
    cutAt: '2026-08-20T23:00:00Z',
    coverageFrom: '2026-08-01',
    coverageTo: '2026-08-31',
    timezone: 'America/Argentina/Mendoza',
    grain: 'employee_shift_day',
    identityKeyKind: 'employment_contract_id',
    recordCount: 1200,
    status: 'draft',
    governanceStatus: 'draft',
    bindingState: 'current',
    version: 1,
    reasonCode: 'source_onboarding',
    timestamps: {
      createdAt: '2026-08-21T10:00:00Z',
      updatedAt: '2026-08-21T10:00:00Z',
    },
    // Las fachadas no deben propagar coordenadas internas aunque una fila defectuosa las agregue.
    ownerCode: 'juan.perez',
    systemLocator: 'registry.ffffffff-ffff-4fff-8fff-ffffffffffff',
    tenantId: TENANT_ID,
    certifiedBindingId: BINDING_ID,
    proposerPersonId: PERSON_ID,
    proposerMembershipId: MEMBERSHIP_ID,
    ...overrides,
  };
}

function readiness({ approved = false, maliciousTruth = false } = {}) {
  const rows = [
    ['shiftAssignment', 'shift_assignment'],
    ['timePunches', 'time_punch'],
    ['holidayCalendar', 'holiday_calendar'],
    ['municipalRuleProfile', 'municipal_rule_profile'],
    ['administrativeEvents', 'administrative_event'],
  ];
  return {
    catalogApproved: approved,
    evaluationReady: maliciousTruth,
    attendanceReconciled: maliciousTruth,
    payrollCalculated: maliciousTruth,
    payrollPosted: maliciousTruth,
    grhMutation: maliciousTruth,
    requirements: rows.map(([key, domain], index) => ({
      key,
      domain,
      label: TIME_SOURCE_DOMAINS[domain].label,
      requiredForCatalog: index < 4,
      governanceStatus: approved ? 'approved' : 'missing',
      readinessState: approved
        ? (index === 4 ? 'partial_reference' : 'registered_metadata')
        : 'missing',
      approvedMetadata: approved,
      metadata: approved ? {
        ownerAuthority: 'municipal_human_resources',
        format: 'postgres_relation',
        schemaVersion: 'v1.0',
        cutAt: '2026-08-20T23:00:00Z',
        coverageFrom: '2026-08-01',
        coverageTo: '2026-08-31',
        timezone: 'America/Argentina/Mendoza',
        grain: TIME_SOURCE_DOMAINS[domain].grain,
      } : undefined,
    })),
  };
}

function bootstrapEnvelope(capabilities = ['time.source.read'], readinessValue = readiness()) {
  return {
    principal: governedPrincipal(capabilities),
    readiness: readinessValue,
    allowedCommands: ['create_draft', 'approve', 'unexpected'],
  };
}

function sqlMock(handler) {
  const calls = [];
  return {
    calls,
    async query(statement, values) {
      calls.push({ statement, values });
      return { rows: await handler(statement, values, calls.length) };
    },
  };
}

function throwsCode(fn, code, status) {
  assert.throws(fn, (error) => error?.code === code && error?.status === status);
}

test('contrato temporal enumera dominios y autoridad cerrada sin habilitar cálculo ni GRH', () => {
  assert.equal(TIME_SOURCE_REGISTRY_CONTRACT.caseType, 'time_source_contract');
  assert.equal(TIME_SOURCE_REGISTRY_CONTRACT.timezone, 'America/Argentina/Mendoza');
  assert.deepEqual(Object.keys(TIME_SOURCE_DOMAINS), [
    'shift_assignment', 'time_punch', 'holiday_calendar', 'municipal_rule_profile',
    'administrative_event', 'employment_master_reference',
  ]);
  assert.deepEqual(Object.keys(TIME_SOURCE_OWNER_AUTHORITIES), [
    'municipal_human_resources', 'municipal_it', 'municipal_payroll',
    'provincial_authority', 'national_authority', 'certified_external_provider',
  ]);
  assert.deepEqual(
    TIME_SOURCE_REGISTRY_CONTRACT.ownerAuthorities.map(({ key }) => key),
    Object.keys(TIME_SOURCE_OWNER_AUTHORITIES),
  );
  for (const flag of [
    'evaluationReady', 'attendanceReconciled', 'payrollCalculated', 'payrollPosted', 'grhMutation',
  ]) assert.equal(TIME_SOURCE_REGISTRY_CONTRACT[flag], false, flag);
  assert.deepEqual(TIME_SOURCE_REGISTRY_CONTRACT.transitions, {
    draft: ['submitted', 'cancelled'],
    submitted: ['approved', 'rejected', 'cancelled'],
    approved: ['retired'],
    rejected: [],
    retired: [],
    cancelled: [],
  });
});

test('normalización conserva sólo metadatos gobernados y hashea el fundamento', () => {
  const normalized = normalizeTimeSourceCommand(command());
  assert.equal(normalized.command, 'create_draft');
  assert.equal(normalized.contractId, null);
  assert.equal(normalized.expectedVersion, 0);
  assert.equal(normalized.metadata.ownerAuthority, 'municipal_human_resources');
  assert.equal(Object.hasOwn(normalized.metadata, 'ownerCode'), false);
  assert.equal(Object.hasOwn(normalized.metadata, 'systemLocator'), false);
  assert.equal(normalized.reasonCode, 'source_onboarding');
  assert.equal(
    normalized.reasonHash,
    createHash('sha256').update('Fuente certificada por Recursos Humanos').digest('hex'),
  );
  assert.equal(Object.hasOwn(normalized, 'reason'), false);
  assert.equal(Object.hasOwn(normalized.metadata, 'reason'), false);
  assert.equal(Object.hasOwn(normalized.metadata, 'reasonCode'), false);
});

test('ownerAuthority rechaza texto libre, PII y categorías no homologadas', () => {
  for (const ownerAuthority of [
    'Dirección de Recursos Humanos',
    'Juan Pérez',
    'rrhh@junin.gob.ar',
    'municipal_human_resources/secret',
    'municipal_finance',
    '',
  ]) {
    throwsCode(
      () => normalizeTimeSourceCommand(command('create_draft', {
        payload: metadata({ ownerAuthority }),
      })),
      'TIME_SOURCE_METADATA_INVALID',
      422,
    );
  }
});

test('payload rechaza ownerCode/systemLocator aun si parecen códigos o contienen PII', () => {
  for (const [field, value] of [
    ['ownerCode', 'municipal_human_resources'],
    ['ownerCode', 'juan.perez'],
    ['ownerCode', 'legajo.12345'],
    ['systemLocator', 'registry.11111111-1111-4111-8111-111111111111'],
    ['systemLocator', '20301234567'],
    ['systemLocator', 'rrhh@junin.gob.ar'],
  ]) {
    throwsCode(
      () => normalizeTimeSourceCommand(command('create_draft', {
        payload: metadata({ [field]: value }),
      })),
      'TIME_SOURCE_METADATA_INVALID',
      400,
    );
  }
});

test('metadatos validan corte UTC exacto, cobertura, grano, clave, SHA y cardinalidad', () => {
  const corruptions = [
    { cutAt: '2026-08-20T23:00:00.000Z' },
    { cutAt: '2026-08-20T23:00:00-03:00' },
    { cutAt: '2026-08-20 23:00:00Z' },
    { cutAt: '2026-02-30T23:00:00Z' },
    { coverageFrom: '2026-02-30' },
    { coverageFrom: '2026-09-01', coverageTo: '2026-08-31' },
    { timezone: 'America/Argentina/Buenos_Aires' },
    { grain: 'employee_punch_event' },
    { identityKeyKind: 'calendar_date' },
    { artifactSha256: 'A'.repeat(64) + 'x' },
    { recordCount: -1 },
    { recordCount: 1.5 },
    { schemaVersion: 'versión 1' },
    { schemaVersion: 'juan.perez' },
    { schemaVersion: 'v0' },
    { schemaVersion: 'V1' },
    { schemaVersion: 'v1.2.3.4' },
    { schemaVersion: 'v20301234567' },
    { schemaVersion: `v${'1'.repeat(40)}` },
    { schemaVersion: 'v12345' },
    { schemaVersion: 'v1.12345' },
  ];
  for (const corruption of corruptions) {
    throwsCode(
      () => normalizeTimeSourceCommand(command('create_draft', {
        payload: metadata(corruption),
      })),
      'TIME_SOURCE_METADATA_INVALID',
      422,
    );
  }
});

test('comandos usan forma, versión y reasonCode exactos por transición', () => {
  for (const name of ['create_draft', 'update_draft', 'submit', 'approve', 'reject', 'retire', 'cancel']) {
    assert.equal(normalizeTimeSourceCommand(command(name)).command, name);
  }
  for (const invalid of [
    { ...command(), extra: true },
    { ...command(), expectedVersion: 1 },
    { ...command('submit'), expectedVersion: 0 },
    { ...command('submit'), contractId: 'not-a-uuid' },
    { ...command('approve'), payload: { reasonCode: 'ready_for_review', reason: 'Incorrecto' } },
    { ...command('cancel'), payload: { reasonCode: 'withdrawn', reason: 'ab' } },
    { ...command('approve'), payload: { reasonCode: 'evidence_verified', reason: 'Correcto', note: 'PII' } },
  ]) {
    assert.throws(() => normalizeTimeSourceCommand(invalid));
  }
});

test('bootstrap revalida principal DB, filtra comandos y mantiene el motor cerrado', async () => {
  const sql = sqlMock(async () => [{ result: bootstrapEnvelope(
    ['time.source.read', 'time.source.propose', 'time.source.approve', 'time.source.audit.read'],
    readiness({ approved: true }),
  ) }]);
  const result = await getTimeSourceBootstrap(sql, identity(), session());
  assert.equal(result.feature.canPropose, true);
  assert.equal(result.feature.canApprove, true);
  assert.equal(result.feature.canAudit, true);
  assert.equal(result.feature.catalogApproved, true);
  assert.deepEqual(result.allowedCommands, ['create_draft']);
  for (const flag of [
    'evaluationReady', 'attendanceReconciled', 'payrollCalculated', 'payrollPosted', 'grhMutation',
  ]) assert.equal(result.feature[flag], false, flag);
  assert.equal(result.readiness.at(-1).readinessState, 'partial_reference');
  assert.equal(result.readiness.at(-1).requiredForCatalog, false);
  assert.match(sql.calls[0].statement, /time_source_registry_bootstrap_v1/);
});

test('lectura temporal admite membresía operativa sin inventar vínculo laboral', async () => {
  const principal = {
    ...governedPrincipal(['time.source.read', 'time.source.propose', 'time.source.audit.read']),
    actorPersonId: null,
  };
  const sql = sqlMock(async (statement) => [{ result: statement.includes('_bootstrap_')
    ? { ...bootstrapEnvelope(), principal, allowedCommands: ['create_draft'] }
    : { principal, records: [], total: 0 } }]);

  const bootstrap = await getTimeSourceBootstrap(sql, identity(), session());
  const listing = await listTimeSources(sql, identity(), {}, session());

  assert.equal(bootstrap.principal.actorPersonId, null);
  assert.equal(bootstrap.feature.canPropose, false);
  assert.equal(bootstrap.feature.canApprove, false);
  assert.equal(bootstrap.feature.canAudit, true);
  assert.deepEqual(bootstrap.allowedCommands, []);
  assert.deepEqual(listing.data, []);
  assert.equal(sql.calls.length, 2);
});

test('readiness maliciosa no puede declarar evaluación, asistencia, nómina ni mutación GRH', async () => {
  const sql = sqlMock(async () => [{ result: bootstrapEnvelope(
    ['time.source.read'], readiness({ approved: true, maliciousTruth: true }),
  ) }]);
  await assert.rejects(
    getTimeSourceBootstrap(sql, identity(), session()),
    (error) => error?.code === 'TIME_SOURCE_CONTRACT_DRIFT' && error?.status === 503,
  );
});

test('principal de otra membresía o tenant falla cerrado antes de exponer registros', async () => {
  for (const drift of [
    { membershipId: '33333333-3333-4333-8333-333333333333' },
    { tenantId: '44444444-4444-4444-8444-444444444444' },
    { email: 'otro@junin.gob.ar' },
    { certifiedBindingId: 'not-a-uuid' },
  ]) {
    const sql = sqlMock(async () => [{ result: {
      principal: { ...governedPrincipal(), ...drift },
      records: [record()],
      total: 1,
    } }]);
    await assert.rejects(
      listTimeSources(sql, identity(), {}, session()),
      (error) => error?.code === 'TIME_SOURCE_AUTHORITY_REQUIRED' && error?.status === 403,
    );
  }
});

test('listado limita filtros y paginación antes de tocar SQL', async () => {
  const sql = sqlMock(async () => [{
    result: { principal: governedPrincipal(), records: [], total: 0 },
  }]);
  for (const options of [
    { domain: 'payroll' }, { status: 'pending' }, { page: 0 }, { page: '01' },
    { page: 201 }, { limit: 51 }, { limit: 1.5 },
  ]) {
    await assert.rejects(listTimeSources(sql, identity(), options, session()));
  }
  assert.equal(sql.calls.length, 0);
});

test('detalle convierte IDOR en not-found y no filtra coordenadas internas', async () => {
  const missing = sqlMock(async () => [{ result: {
    principal: governedPrincipal(), record: null, timeline: [], allowedCommands: [],
  } }]);
  await assert.rejects(
    readTimeSource(missing, identity(), CONTRACT_ID, session()),
    (error) => error?.code === 'TIME_SOURCE_NOT_FOUND' && error?.status === 404,
  );

  const found = sqlMock(async () => [{ result: {
    principal: governedPrincipal(),
    record: record(),
    timeline: [{
      id: EVENT_ID,
      command: 'create_draft',
      expectedVersion: 0,
      resultingVersion: 1,
      reasonCode: 'source_onboarding',
      reasonHash: 'c'.repeat(64),
      occurredAt: '2026-08-21T10:00:00Z',
      actorPersonId: PERSON_ID,
      actorMembershipId: MEMBERSHIP_ID,
    }],
    auditAvailable: true,
    allowedCommands: ['update_draft', 'submit', 'delete', 'approve'],
  } }]);
  const result = await readTimeSource(found, identity(), CONTRACT_ID, session());
  for (const forbidden of [
    'tenantId', 'certifiedBindingId', 'proposerPersonId', 'proposerMembershipId',
    'ownerCode', 'systemLocator',
  ]) assert.equal(Object.hasOwn(result.data, forbidden), false, forbidden);
  assert.equal(Object.hasOwn(result.timeline[0], 'actorPersonId'), false);
  assert.equal(Object.hasOwn(result.timeline[0], 'actorMembershipId'), false);
  assert.equal(Object.hasOwn(result.timeline[0], 'id'), false);
  assert.equal(Object.hasOwn(result.timeline[0], 'reasonHash'), false);
  assert.deepEqual(result.allowedCommands, ['update_draft', 'submit', 'approve']);
});

test('mutación exige capacidad específica además de read y nunca envía el fundamento', async () => {
  for (const [name, capability] of [
    ['create_draft', 'time.source.propose'],
    ['update_draft', 'time.source.propose'],
    ['submit', 'time.source.propose'],
    ['cancel', 'time.source.propose'],
    ['approve', 'time.source.approve'],
    ['reject', 'time.source.approve'],
    ['retire', 'time.source.approve'],
  ]) {
    const sql = sqlMock(async () => [{ result: bootstrapEnvelope(['time.source.read']) }]);
    await assert.rejects(
      applyTimeSourceCommand(sql, identity(), session(), command(name), IDEMPOTENCY_KEY),
      (error) => error?.code === 'TIME_SOURCE_CAPABILITY_REQUIRED' && error?.status === 403,
      capability,
    );
    assert.equal(sql.calls.length, 1, `no debe invocar apply sin ${capability}`);
  }
});

test('membresía sin vínculo conserva lectura pero no puede mutar fuentes', async () => {
  const principal = {
    ...governedPrincipal(['time.source.read', 'time.source.propose']),
    actorPersonId: null,
  };
  const sql = sqlMock(async () => [{ result: {
    ...bootstrapEnvelope(), principal, allowedCommands: ['create_draft'],
  } }]);
  await assert.rejects(
    applyTimeSourceCommand(sql, identity(), session(), command('create_draft'), IDEMPOTENCY_KEY),
    (error) => error?.code === 'TIME_SOURCE_EMPLOYMENT_REQUIRED' && error?.status === 403,
  );
  assert.equal(sql.calls.length, 1, 'la mutación debe cerrarse antes de invocar apply');
});

test('apply liga hash a SID, versión, release, actor y binding; devuelve replay histórico', async () => {
  const reason = 'Fuente certificada por Recursos Humanos';
  const sql = sqlMock(async (statement) => {
    if (statement.includes('time_source_registry_bootstrap_v1')) {
      return [{ result: bootstrapEnvelope(['time.source.read', 'time.source.propose']) }];
    }
    return [{ result: {
      data: record({ status: 'submitted', governanceStatus: 'submitted', version: 2 }),
      replayed: true,
      historical: true,
    } }];
  });
  const result = await applyTimeSourceCommand(
    sql, identity(), session(), command('create_draft'), IDEMPOTENCY_KEY,
  );
  assert.equal(result.replayed, true);
  assert.equal(result.historical, true);
  assert.equal(result.data.evaluationReady, false);
  assert.equal(sql.calls.length, 2);
  const values = sql.calls[1].values;
  assert.deepEqual(values.slice(0, 11), [
    'actor@junin.gob.ar', SESSION_ID, 4, RELEASE_SHA, TENANT_ID, MEMBERSHIP_ID,
    'create_draft', null, 0, IDEMPOTENCY_KEY, values[10],
  ]);
  assert.match(values[10], /^[a-f0-9]{64}$/);
  assert.equal(values[13], createHash('sha256').update(reason).digest('hex'));
  assert.equal(JSON.stringify(values).includes(reason), false);
  assert.equal(JSON.parse(values[11]).reason, undefined);
  assert.equal(JSON.parse(values[11]).reasonCode, undefined);
});

test('Idempotency-Key debe ser UUIDv4 y errores DB de replay/SoD/IDOR se mapean sin detalle SQL', async () => {
  const invalid = sqlMock(async () => [{
    result: bootstrapEnvelope(['time.source.read', 'time.source.propose']),
  }]);
  await assert.rejects(
    applyTimeSourceCommand(invalid, identity(), session(), command(), '11111111-1111-1111-1111-111111111111'),
    (error) => error?.code === 'IDEMPOTENCY_KEY_INVALID' && error?.status === 400,
  );
  assert.equal(invalid.calls.length, 1);

  for (const [databaseCode, publicCode, status] of [
    ['TIME_SOURCE_IDEMPOTENCY_REUSED', 'TIME_SOURCE_IDEMPOTENCY_REUSED', 409],
    ['TIME_SOURCE_SEPARATION_OF_DUTIES', 'TIME_SOURCE_SEPARATION_OF_DUTIES', 409],
    ['TENANT_IAM_SOD_CONFLICT', 'TENANT_IAM_SOD_CONFLICT', 409],
    ['TIME_SOURCE_NOT_FOUND', 'TIME_SOURCE_NOT_FOUND', 404],
  ]) {
    const sql = sqlMock(async (statement) => {
      if (statement.includes('time_source_registry_bootstrap_v1')) {
        return [{ result: bootstrapEnvelope(['time.source.read', 'time.source.approve']) }];
      }
      throw new Error(`${databaseCode}: private database detail`);
    });
    await assert.rejects(
      applyTimeSourceCommand(sql, identity(), session(), command('approve'), IDEMPOTENCY_KEY),
      (error) => error?.code === publicCode
        && error?.status === status
        && !error.message.includes('private database detail'),
    );
  }
});
