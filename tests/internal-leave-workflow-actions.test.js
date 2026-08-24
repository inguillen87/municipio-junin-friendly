import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTION_CENTER_CONTRACT,
  actionDefaultViewForPrincipal,
  actionListCapabilitiesForPrincipal,
  allowedCommandsForCase,
  createLeaveCase,
  getActionBootstrap,
  listLeaveCases,
  normalizeIdempotencyKey,
  normalizeLeavePayload,
  normalizeTransition,
  readLeaveCase,
  transitionLeaveCase,
  updateLeaveDraft,
} from '../lib/internal-leave-workflow.js';
import { capabilitiesForRole } from '../lib/internal-rbac.js';

const CASE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SELF_CONTRACT = '11111111-1111-4111-8111-111111111111';
const OTHER_CONTRACT = '22222222-2222-4222-8222-222222222222';
const IDEMPOTENCY_KEY = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const POLICY_VERSION = 'mendoza-ley-5811-title-vi.v1';
const TENANT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const MEMBERSHIP_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const BINDING_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ACTION_SESSION = Object.freeze({
  id: '99999999-9999-4999-8999-999999999999',
  email: 'actor@junin.gob.ar',
  version: 3,
  releaseSha: 'a'.repeat(40),
});

function principal(role, overrides = {}) {
  return {
    email: 'actor@junin.gob.ar',
    role,
    capabilities: capabilitiesForRole(role),
    employmentContractId: SELF_CONTRACT,
    tenantId: TENANT_ID,
    membershipId: MEMBERSHIP_ID,
    sourceBindingId: BINDING_ID,
    sourceCompanyId: 1,
    sourceDatabase: 'grh_junin',
    areaScopes: [],
    ...overrides,
  };
}

function identityFor(actor) {
  return {
    user: { email: actor.email },
    tenant: {
      id: actor.tenantId,
      membershipId: actor.membershipId,
      source: 'membership',
    },
  };
}

function facadePrincipal(actor) {
  return {
    email: actor.email,
    displayName: actor.displayName || actor.email,
    roleKey: actor.role,
    tenantId: actor.tenantId,
    membershipId: actor.membershipId,
    sourceBindingId: actor.sourceBindingId,
    sourceCompanyId: actor.sourceCompanyId,
    sourceDatabase: actor.sourceDatabase,
    employmentContractId: actor.employmentContractId,
    capabilities: [...actor.capabilities, 'actions.read'],
    areaScopes: actor.areaScopes,
  };
}

function annualPayload(overrides = {}) {
  return {
    beneficiaryContractId: SELF_CONTRACT,
    reasonCode: '19',
    policyVersionId: POLICY_VERSION,
    policyRuleId: 'annual-ordinary',
    startsOn: '2026-09-01',
    endsOn: '2026-09-02',
    durationUnit: 'calendar_day',
    confidentiality: 'standard',
    ...overrides,
  };
}

function caseRecord(overrides = {}) {
  return {
    id: CASE_ID,
    caseNumber: '14',
    caseType: 'leave_request',
    beneficiaryContractId: SELF_CONTRACT,
    tenantId: TENANT_ID,
    sourceBindingId: BINDING_ID,
    sourceBatchId: '33333333-3333-4333-8333-333333333333',
    companyId: 1,
    organizationUnitSourceId: 'org-1',
    sectorSourceId: 'sector-1',
    status: 'draft',
    confidentiality: 'standard',
    policyVersionId: POLICY_VERSION,
    payload: annualPayload(),
    evidenceStatus: 'pending',
    createdBy: 'empleado@junin.gob.ar',
    submittedBy: null,
    decidedBy: null,
    cancelledBy: null,
    decisionReason: null,
    cancellationReason: null,
    manualValidationConfirmed: false,
    version: 1,
    createdAt: '2026-08-20T09:00:00Z',
    updatedAt: '2026-08-20T09:00:00Z',
    subjectDisplayName: 'Empleado Ejemplo',
    subjectLegajo: '100',
    subjectSector: 'Administración',
    ...overrides,
  };
}

test('motivo desconocido y regla de otra licencia fallan cerrado antes de SQL', () => {
  assert.throws(
    () => normalizeLeavePayload(annualPayload({ reasonCode: '999', policyRuleId: null })),
    (error) => error.code === 'LEAVE_REASON_NOT_SUPPORTED' && error.status === 422,
  );
  assert.throws(
    () => normalizeLeavePayload(annualPayload({ policyRuleId: 'health-under-5-family' })),
    (error) => error.code === 'LEAVE_POLICY_RULE_MISMATCH' && error.status === 422,
  );
  assert.throws(
    () => normalizeLeavePayload(annualPayload({ diagnosis: 'no permitido' })),
    (error) => error.code === 'LEAVE_PAYLOAD_FIELD_UNKNOWN',
  );
  assert.throws(
    () => normalizeLeavePayload(annualPayload({
      durationUnit: 'minute', startsOn: '2026-09-01', endsOn: '2026-09-01',
      startsAtLocal: '08:00', endsAtLocal: '09:00',
    })),
    (error) => error.code === 'LEAVE_MINUTE_REASON_INVALID',
  );
});

test('IDs canónicos md5 de PostgreSQL son válidos, pero idempotency conserva UUID v4 RFC', () => {
  const canonicalContractId = 'f053a628-a6ed-f704-501e-771164fb0edc';
  const normalized = normalizeLeavePayload(annualPayload({
    beneficiaryContractId: canonicalContractId,
  }));
  assert.equal(normalized.beneficiaryContractId, canonicalContractId);
  assert.throws(
    () => normalizeIdempotencyKey(canonicalContractId),
    (error) => error.code === 'IDEMPOTENCY_KEY_INVALID',
  );
  assert.equal(normalizeIdempotencyKey(IDEMPOTENCY_KEY), IDEMPOTENCY_KEY);
});

test('mapeo no inequívocamente estándar exige restricted y prohíbe nota sensible general', () => {
  const marriage = annualPayload({
    reasonCode: '4', policyRuleId: 'marriage', confidentiality: 'standard',
  });
  assert.throws(
    () => normalizeLeavePayload(marriage),
    (error) => error.code === 'LEAVE_RESTRICTED_REQUIRED',
  );
  assert.throws(
    () => normalizeLeavePayload({ ...marriage, confidentiality: 'restricted', employeeNote: 'dato sensible' }),
    (error) => error.code === 'LEAVE_RESTRICTED_NOTE_NOT_ALLOWED',
  );
  const normalized = normalizeLeavePayload({ ...marriage, confidentiality: 'restricted' });
  assert.equal(normalized.confidentiality, 'restricted');
  assert.equal(Object.hasOwn(normalized.casePayload, 'employeeNote'), false);
});

test('aprobación nunca es automática: exige fundamento, evidencia y confirmación humana', () => {
  assert.throws(
    () => normalizeTransition('approve', { expectedVersion: 2, reason: 'válida', evidenceStatus: 'verified' }),
    (error) => error.code === 'ACTION_MANUAL_VALIDATION_REQUIRED',
  );
  const result = normalizeTransition('approve', {
    expectedVersion: 2,
    reason: 'Documentación verificada por RRHH',
    evidenceStatus: 'verified',
    manualValidationConfirmed: true,
  });
  assert.equal(result.manualValidationConfirmed, true);
  assert.equal(result.evidenceStatus, 'verified');
  assert.deepEqual(ACTION_CENTER_CONTRACT.approvalEvidenceByConfidentiality.restricted, ['verified']);
});

test('índice de duplicado activo se traduce a conflicto operativo estable', async () => {
  const sql = {
    async query() {
      throw new Error('duplicate key value violates unique constraint "action_case_leave_active_request_uk"');
    },
  };
  await assert.rejects(
    createLeaveCase(sql, principal('EMPLEADO'), annualPayload(), IDEMPOTENCY_KEY, ACTION_SESSION),
    (error) => error.code === 'ACTION_DUPLICATE_ACTIVE' && error.status === 409,
  );
});

test('replay de submit usa el recibo original y no preautoriza contra el estado actual', async () => {
  const calls = [];
  const sql = {
    async query(statement, values) {
      calls.push({ statement, values });
      return [{
        caseId: CASE_ID,
        caseNumber: '14',
        status: 'submitted',
        version: 2,
        replayed: true,
      }];
    },
  };
  const result = await transitionLeaveCase(
    sql,
    principal('EMPLEADO'),
    'submit',
    CASE_ID,
    { expectedVersion: 1 },
    IDEMPOTENCY_KEY,
    ACTION_SESSION,
  );

  assert.equal(calls.length, 1);
  assert.match(calls[0].statement, /action_center_apply_tenant_command/);
  assert.deepEqual(result, {
    data: {
      id: CASE_ID, caseNumber: '14', caseType: 'leave_request', status: 'submitted', version: 2,
    },
    replayed: true,
  });
  assert.equal(calls[0].values.length, 19);
  assert.deepEqual(calls[0].values.slice(1, 6), [
    ACTION_SESSION.id, ACTION_SESSION.version, ACTION_SESSION.releaseSha,
    TENANT_ID, MEMBERSHIP_ID,
  ]);
});

test('SID, versión de sesión y release forman parte de la idempotencia de mutación', async () => {
  const hashes = [];
  const sql = {
    async query(_statement, values) {
      hashes.push(values[11]);
      return [{ caseId: CASE_ID, caseNumber: '14', status: 'submitted', version: 2, replayed: true }];
    },
  };
  const sessions = [
    ACTION_SESSION,
    { ...ACTION_SESSION, id: '88888888-8888-4888-8888-888888888888' },
    { ...ACTION_SESSION, version: 4 },
    { ...ACTION_SESSION, releaseSha: 'b'.repeat(40) },
  ];
  for (const session of sessions) {
    await transitionLeaveCase(
      sql, principal('EMPLEADO'), 'submit', CASE_ID,
      { expectedVersion: 1 }, IDEMPOTENCY_KEY, session,
    );
  }
  assert.equal(new Set(hashes).size, sessions.length);
});

test('update usa routing facade IDOR-safe y preserva versión normativa/confidencialidad', async () => {
  const actor = principal('EMPLEADO');
  const hiddenSql = { async query() { return [{ result: { principal: facadePrincipal(actor), routing: null } }]; } };
  await assert.rejects(
    updateLeaveDraft(
      hiddenSql,
      principal('EMPLEADO'),
      CASE_ID,
      {},
      1,
      IDEMPOTENCY_KEY,
      ACTION_SESSION,
    ),
    (error) => error.code === 'ACTION_CASE_NOT_FOUND' && error.status === 404,
  );

  const calls = [];
  const updateSql = {
    async query(statement, values) {
      calls.push({ statement, values });
      if (statement.includes('action_center_tenant_routing_v2')) return [{ result: {
        principal: facadePrincipal(actor),
        routing: caseRecord({ confidentiality: 'restricted' }),
      } }];
      return [{ caseId: CASE_ID, caseNumber: '14', status: 'draft', version: 2, replayed: false }];
    },
  };
  const result = await updateLeaveDraft(
    updateSql,
    principal('EMPLEADO'),
    CASE_ID,
    {
      reasonCode: '4', policyRuleId: 'marriage', startsOn: '2026-10-01', endsOn: '2026-10-10',
      durationUnit: 'calendar_day',
    },
    1,
    IDEMPOTENCY_KEY,
    ACTION_SESSION,
  );
  assert.equal(result.data.version, 2);
  assert.equal(calls[1].values[14], POLICY_VERSION);
  assert.equal(calls[1].values[15], 'restricted');

  assert.match(calls[0].statement, /action_center_tenant_routing_v2/);
  assert.equal(calls[0].values[1], ACTION_SESSION.id);
});

test('detail consume una única facade, timeline allowlisted y comandos gobernados', async () => {
  const submitted = caseRecord({
    beneficiaryContractId: OTHER_CONTRACT,
    status: 'submitted',
    submittedBy: 'empleado@junin.gob.ar',
    submittedAt: '2026-08-20T09:30:00Z',
    version: 2,
  });
  const sql = {
    async query(statement, values) {
      assert.match(statement, /action_center_tenant_detail_v2/);
      assert.deepEqual(values.slice(1, 6), [ACTION_SESSION.id, 3, ACTION_SESSION.releaseSha, TENANT_ID, MEMBERSHIP_ID]);
      return [{ result: {
        principal: facadePrincipal(approver),
        record: { ...submitted, projection: 'nominal' },
        timeline: [{
          id: '1', caseVersion: 1, eventType: 'created', fromStatus: null, toStatus: 'draft',
          actorEmail: 'empleado@junin.gob.ar', actorRole: 'EMPLEADO',
          metadata: { command: 'create', reasonPresent: false },
          occurredAt: '2026-08-20T09:00:00Z',
        }],
        allowedCommands: ['approve', 'reject'],
      } }];
    },
  };
  const scope = [
    { capabilityKey: 'leave.request.area.read', scopeLevel: 'company', companyId: 1 },
    { capabilityKey: 'leave.request.area.decide', scopeLevel: 'company', companyId: 1 },
  ];
  const approver = principal('RRHH_APROBADOR', { areaScopes: scope });
  const detail = await readLeaveCase(sql, identityFor(approver), CASE_ID, ACTION_SESSION);
  assert.equal(detail.data.subject.contractId, OTHER_CONTRACT);
  assert.equal(detail.timeline.length, 1);
  assert.deepEqual(detail.allowedCommands, ['approve', 'reject']);

  const unlinked = principal('RRHH_APROBADOR', { areaScopes: scope, employmentContractId: null });
  assert.deepEqual(allowedCommandsForCase(unlinked, submitted), []);

  const unlinkedOperator = principal('RRHH_OPERADOR', {
    employmentContractId: null,
    areaScopes: [
      { capabilityKey: 'leave.request.area.update', scopeLevel: 'company', companyId: 1 },
      { capabilityKey: 'leave.request.area.submit', scopeLevel: 'company', companyId: 1 },
      { capabilityKey: 'leave.request.area.cancel_pending', scopeLevel: 'company', companyId: 1 },
    ],
  });
  assert.deepEqual(
    allowedCommandsForCase(unlinkedOperator, caseRecord({
      beneficiaryContractId: OTHER_CONTRACT,
      status: 'draft',
    })),
    ['update_draft', 'submit', 'cancel'],
  );
  const creator = principal('ADMIN_INTERNO', { email: submitted.createdBy });
  assert.equal(allowedCommandsForCase(creator, submitted).includes('approve'), false);
});

test('detail IDOR devuelve 404 sin serializar principal', async () => {
  const operator = principal('RRHH_OPERADOR', {
    areaScopes: [{ capabilityKey: 'leave.request.area.read', scopeLevel: 'company', companyId: 1 }],
  });
  await assert.rejects(
    readLeaveCase({
      async query() {
        return [{ result: { principal: facadePrincipal(operator), record: null, timeline: [], allowedCommands: [] } }];
      },
    }, identityFor(operator), CASE_ID, ACTION_SESSION),
    (error) => error.code === 'ACTION_CASE_NOT_FOUND' && error.status === 404,
  );
});

test('detail PAYROLL_READ conserva proyección mínima sin sujeto, actores, nota ni timeline', async () => {
  const statements = [];
  const accountant = principal('CONTADOR');
  const payroll = {
    id: CASE_ID, caseNumber: '14', caseType: 'leave_request', status: 'approved',
    confidentiality: 'standard', policyVersionId: POLICY_VERSION,
    payload: { reasonCode: '19', startsOn: '2026-09-01', endsOn: '2026-09-02', durationUnit: 'calendar_day' },
    evidenceStatus: 'verified', version: 3, updatedAt: '2026-08-20T10:00:00Z',
    decidedAt: '2026-08-20T10:00:00Z', projection: 'payroll',
  };
  const sql = {
    async query(statement) {
      statements.push(statement);
      return [{ result: {
        principal: facadePrincipal(accountant), record: payroll,
        timeline: [], allowedCommands: [],
      } }];
    },
  };
  const detail = await readLeaveCase(sql, identityFor(accountant), CASE_ID, ACTION_SESSION);
  assert.equal(statements.length, 1);
  assert.match(statements[0], /action_center_tenant_detail_v2/);
  assert.deepEqual(detail.timeline, []);
  assert.deepEqual(detail.allowedCommands, []);
  assert.equal(Object.hasOwn(detail.data, 'subject'), false);
  assert.equal(Object.hasOwn(detail.data, 'beneficiaryContractId'), false);
  assert.equal(Object.hasOwn(detail.data, 'actors'), false);
  assert.equal(Object.hasOwn(detail.data.payload, 'employeeNote'), false);
  assert.equal(detail.data.projection, 'payroll');
});

test('bootstrap usa facade session-bound, máximo 50 y no expone DNI/CUIL', async () => {
  const actor = principal('EMPLEADO');
  const sql = {
    async query(statement, values) {
      assert.match(statement, /action_center_tenant_bootstrap_v2/);
      assert.equal(values[6], null);
      return [{ result: {
        principal: facadePrincipal(actor),
        source: { label: 'GRH canónica', cutoff: '2026-08-19T23:00:00Z', version: 'snapshot publicado' },
        subjects: [{
          contractId: SELF_CONTRACT, displayName: 'Empleado Ejemplo', legajo: '100',
          sector: 'Administración', allowedConfidentialities: ['standard', 'restricted'], accessBasis: 'self',
        }],
        subjectsTruncated: false,
        reasonRows: [
          { sourceKey: '19', label: 'Días adeudados' },
          { sourceKey: '4', label: 'Matrimonio' },
          { sourceKey: '999', label: 'Sin mapa' },
        ],
      } }];
    },
  };
  const result = await getActionBootstrap(sql, identityFor(actor), ACTION_SESSION);

  assert.equal(result.options.subjects.length, 1);
  assert.deepEqual(result.options.subjects[0].allowedConfidentialities, ['standard', 'restricted']);
  assert.equal(Object.hasOwn(result.options.subjects[0], 'dni'), false);
  assert.equal(Object.hasOwn(result.options.subjects[0], 'cuil'), false);
  assert.deepEqual(result.options.reasons.map((reason) => reason.reasonCode), ['19', '4']);
  assert.equal(result.options.reasons[1].confidentiality, 'restricted');
  assert.deepEqual(result.source, {
    label: 'GRH canónica', cutoff: '2026-08-19T23:00:00Z', version: 'snapshot publicado',
  });
  await assert.rejects(
    getActionBootstrap(sql, identityFor(actor), ACTION_SESSION, 'x'),
    (error) => error.code === 'ACTION_SUBJECT_QUERY_INVALID',
  );
});

test('bandeja inicial siempre corresponde a un alcance real del principal', () => {
  const linkedEmployee = principal('EMPLEADO');
  assert.equal(actionDefaultViewForPrincipal(linkedEmployee), 'mine');
  assert.equal(actionListCapabilitiesForPrincipal(linkedEmployee).defaultView, 'mine');

  const globalReader = principal('ADMIN_INTERNO', { employmentContractId: null });
  const globalViews = actionListCapabilitiesForPrincipal(globalReader);
  assert.equal(globalViews.defaultView, 'authorized');
  assert.equal(globalViews.views.some((view) => view.id === 'mine'), false);
  assert.equal(globalViews.views.some((view) => view.id === 'authorized'), true);

  const areaOperator = principal('RRHH_OPERADOR', {
    employmentContractId: null,
    areaScopes: [{
      capabilityKey: 'leave.request.area.read',
      scopeLevel: 'company',
      companyId: 1,
    }],
  });
  const areaViews = actionListCapabilitiesForPrincipal(areaOperator);
  assert.equal(areaViews.defaultView, 'area');
  assert.equal(areaViews.views.some((view) => view.id === 'area'), true);

  for (const result of [
    actionListCapabilitiesForPrincipal(linkedEmployee), globalViews, areaViews,
  ]) {
    assert.equal(result.views.some((view) => view.id === result.defaultView), true);
  }
});

test('lock NOWAIT se mapea como contención reintentable y no como sesión inválida', async () => {
  const actor = principal('EMPLEADO');
  const sql = {
    async query() { throw new Error('P0001: ACTION_SESSION_BUSY'); },
  };
  await assert.rejects(
    getActionBootstrap(sql, identityFor(actor), ACTION_SESSION),
    (error) => error.code === 'ACTION_SESSION_BUSY' && error.status === 409,
  );
});

test('list consume un envelope único, proyecta nominal/payroll y no devuelve notas', async () => {
  const actor = principal('EMPLEADO', {
    capabilities: new Set([...capabilitiesForRole('EMPLEADO'), 'leave.request.payroll.read']),
  });
  const sql = {
    async query(statement) {
      assert.match(statement, /action_center_tenant_list_v2/);
      return [{ result: {
        principal: facadePrincipal(actor), total: 2, page: 1, limit: 20,
        records: [
          { ...caseRecord(), projection: 'nominal', nominalProjection: true },
          {
            id: OTHER_CONTRACT, caseNumber: '15', caseType: 'leave_request', status: 'approved',
            confidentiality: 'standard', policyVersionId: POLICY_VERSION,
            payload: { reasonCode: '19', startsOn: '2026-10-01', endsOn: '2026-10-02', durationUnit: 'calendar_day' },
            evidenceStatus: 'verified', updatedAt: '2026-08-20T10:00:00Z', version: 3,
            projection: 'payroll', nominalProjection: false,
          },
        ],
      } }];
    },
  };
  const result = await listLeaveCases(sql, identityFor(actor), { view: 'authorized' }, ACTION_SESSION);
  assert.equal(result.data.length, 2);
  assert.equal(Object.hasOwn(result.data[0].payload, 'employeeNote'), false);
  assert.equal(result.data[0].projection, 'nominal');
  assert.equal(Object.hasOwn(result.data[1], 'subject'), false);
  assert.equal(Object.hasOwn(result.data[1], 'beneficiaryContractId'), false);
  assert.equal(result.data[1].projection, 'payroll');
  assert.equal(result.pagination.total, 2);
});

test('list falla antes de SQL para filtros y paginación no canónicos', async () => {
  let queries = 0;
  const sql = { async query() { queries += 1; return []; } };
  const actor = principal('EMPLEADO');
  await assert.rejects(
    listLeaveCases(sql, identityFor(actor), { view: 'invented' }, ACTION_SESSION),
    (error) => error.code === 'ACTION_VIEW_INVALID' && error.status === 400,
  );
  await assert.rejects(
    listLeaveCases(sql, identityFor(actor), { caseType: 'payroll_change' }, ACTION_SESSION),
    (error) => error.code === 'ACTION_CASE_TYPE_INVALID' && error.status === 400,
  );
  await assert.rejects(
    listLeaveCases(sql, identityFor(actor), { due: 'today' }, ACTION_SESSION),
    (error) => error.code === 'ACTION_DUE_FILTER_UNSUPPORTED' && error.status === 400,
  );
  await assert.rejects(
    listLeaveCases(sql, identityFor(actor), { cursor: 'opaque' }, ACTION_SESSION),
    (error) => error.code === 'ACTION_CURSOR_UNSUPPORTED' && error.status === 400,
  );
  for (const options of [{ limit: '51' }, { limit: '1.5' }, { page: '0' }, { page: '201' }, { page: '01' }]) {
    await assert.rejects(
      listLeaveCases(sql, identityFor(actor), options, ACTION_SESSION),
      (error) => error.code === 'ACTION_PAGINATION_INVALID' && error.status === 400,
    );
  }
  assert.equal(queries, 0);
});
