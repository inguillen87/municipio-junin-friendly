import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTION_CENTER_CONTRACT,
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

test('update oculta IDOR antes de validar payload y preserva versión normativa/confidencialidad', async () => {
  const hiddenSql = { async query() { return [caseRecord({ beneficiaryContractId: OTHER_CONTRACT })]; } };
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
      if (statement.includes('FROM action_case action')) return [caseRecord({ confidentiality: 'restricted' })];
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

  const replayHashes = [];
  for (const confidentiality of ['standard', 'restricted']) {
    const replaySql = {
      async query(statement, values) {
        if (statement.includes('FROM action_case action')) return [caseRecord({ confidentiality })];
        replayHashes.push(values[11]);
        return [{ caseId: CASE_ID, caseNumber: '14', status: 'draft', version: 2, replayed: true }];
      },
    };
    await updateLeaveDraft(
      replaySql,
      principal('EMPLEADO'),
      CASE_ID,
      {
        reasonCode: '19', policyRuleId: 'annual-ordinary',
        startsOn: '2026-11-01', endsOn: '2026-11-02', durationUnit: 'calendar_day',
      },
      1,
      IDEMPOTENCY_KEY,
      ACTION_SESSION,
    );
  }
  assert.equal(replayHashes[0], replayHashes[1]);
});

test('detail devuelve timeline append-only y no ofrece decidir sin vínculo o con SoD', async () => {
  const submitted = caseRecord({
    beneficiaryContractId: OTHER_CONTRACT,
    status: 'submitted',
    submittedBy: 'empleado@junin.gob.ar',
    submittedAt: '2026-08-20T09:30:00Z',
    version: 2,
  });
  const sql = {
    async query(statement) {
      if (statement.includes('FROM action_case action')) return [submitted];
      return [{
        id: '1', caseVersion: 1, eventType: 'created', fromStatus: null, toStatus: 'draft',
        actorEmail: 'empleado@junin.gob.ar', actorRole: 'EMPLEADO', metadata: { command: 'create' },
        occurredAt: '2026-08-20T09:00:00Z',
      }];
    },
  };
  const scope = [
    { capabilityKey: 'leave.request.area.read', scopeLevel: 'company', companyId: 1 },
    { capabilityKey: 'leave.request.area.decide', scopeLevel: 'company', companyId: 1 },
  ];
  const approver = principal('RRHH_APROBADOR', { areaScopes: scope });
  const detail = await readLeaveCase(sql, approver, CASE_ID);
  assert.equal(detail.data.subject.contractId, OTHER_CONTRACT);
  assert.equal(detail.timeline.length, 1);
  assert.deepEqual(detail.allowedCommands, ['approve', 'reject']);

  const unlinked = principal('RRHH_APROBADOR', { areaScopes: scope, employmentContractId: null });
  assert.deepEqual(allowedCommandsForCase(unlinked, submitted), []);
  const creator = principal('ADMIN_INTERNO', { email: submitted.createdBy });
  assert.equal(allowedCommandsForCase(creator, submitted).includes('approve'), false);
});

test('detail reautoriza el registro completo y corta un cambio standard a restricted antes del timeline', async () => {
  let timelineQueries = 0;
  const sql = {
    async query(statement) {
      if (statement.includes('FROM action_case action') && !statement.includes('JOIN employment_contract')) {
        return [caseRecord({ beneficiaryContractId: OTHER_CONTRACT, confidentiality: 'standard' })];
      }
      if (statement.includes('FROM action_case action') && statement.includes('JOIN employment_contract')) {
        return [caseRecord({ beneficiaryContractId: OTHER_CONTRACT, confidentiality: 'restricted' })];
      }
      timelineQueries += 1;
      return [];
    },
  };
  const operator = principal('RRHH_OPERADOR', {
    areaScopes: [{ capabilityKey: 'leave.request.area.read', scopeLevel: 'company', companyId: 1 }],
  });

  await assert.rejects(
    readLeaveCase(sql, operator, CASE_ID),
    (error) => error.code === 'ACTION_CASE_NOT_FOUND' && error.status === 404,
  );
  assert.equal(timelineQueries, 0);
});

test('detail por PAYROLL_READ usa proyección mínima y nunca consulta detalle nominal ni timeline', async () => {
  const statements = [];
  const routing = caseRecord({ beneficiaryContractId: OTHER_CONTRACT, status: 'approved' });
  const payroll = {
    id: CASE_ID, caseNumber: '14', tenantId: TENANT_ID, sourceBindingId: BINDING_ID,
    caseType: 'leave_request', companyId: 1, status: 'approved', confidentiality: 'standard',
    policyVersionId: POLICY_VERSION, payload: annualPayload(), evidenceStatus: 'verified',
    version: 3, createdAt: '2026-08-20T09:00:00Z', updatedAt: '2026-08-20T10:00:00Z',
    decidedAt: '2026-08-20T10:00:00Z',
  };
  const sql = {
    async query(statement) {
      statements.push(statement);
      if (statement.includes("action.status = 'approved'")) return [payroll];
      return [routing];
    },
  };
  const detail = await readLeaveCase(sql, principal('CONTADOR'), CASE_ID);
  assert.equal(statements.length, 2);
  assert.equal(statements.some((statement) => statement.includes('JOIN employment_contract')), false);
  assert.equal(statements.some((statement) => statement.includes('FROM action_case_event')), false);
  assert.deepEqual(detail.timeline, []);
  assert.deepEqual(detail.allowedCommands, []);
  assert.equal(Object.hasOwn(detail.data, 'subject'), false);
  assert.equal(Object.hasOwn(detail.data, 'beneficiaryContractId'), false);
  assert.equal(Object.hasOwn(detail.data, 'actors'), false);
});

test('bootstrap sólo expone sujetos autorizados y motivos gobernados sin DNI/CUIL', async () => {
  const statements = [];
  const sql = {
    async query(statement) {
      statements.push(statement);
      if (statement.includes('FROM employment_contract contract')) {
        return [
          {
            beneficiaryContractId: SELF_CONTRACT,
            companyId: 1,
            organizationUnitSourceId: 'org-1',
            sectorSourceId: 'sector-1',
            displayName: 'Empleado Ejemplo',
            legajo: '100',
            sector: 'Administración',
            dni: 'no-debe-salir',
          },
          {
            beneficiaryContractId: OTHER_CONTRACT,
            companyId: 2,
            organizationUnitSourceId: 'org-2',
            sectorSourceId: 'sector-2',
            displayName: 'Fuera de alcance',
            legajo: '200',
            sector: 'Otra',
          },
        ];
      }
      if (statement.includes('FROM source_import_batch')) {
        assert.match(statement, /source_system = 'GRH'/);
        assert.doesNotMatch(statement, /source_system = 'PERSONAS'/);
        return [{ cutoff: '2026-08-19T23:00:00Z' }];
      }
      return [
        { sourceKey: '19', label: 'Días adeudados' },
        { sourceKey: '4', label: 'Matrimonio' },
        { sourceKey: '999', label: 'Sin mapa' },
      ];
    },
  };
  const result = await getActionBootstrap(sql, principal('EMPLEADO'));

  assert.equal(result.options.subjects.length, 1);
  assert.deepEqual(result.options.subjects[0].allowedConfidentialities, ['standard', 'restricted']);
  assert.equal(Object.hasOwn(result.options.subjects[0], 'dni'), false);
  assert.equal(Object.hasOwn(result.options.subjects[0], 'cuil'), false);
  assert.deepEqual(result.options.reasons.map((reason) => reason.reasonCode), ['19', '4']);
  assert.equal(result.options.reasons[1].confidentiality, 'restricted');
  assert.deepEqual(result.source, {
    label: 'GRH canónica', cutoff: '2026-08-19T23:00:00Z', version: 'snapshot publicado',
  });
  assert.equal(statements.some((statement) => /contract\.id = \$1::uuid/.test(statement)), true);
  const subjectQuery = statements.find((statement) => statement.includes('FROM employment_contract contract'));
  assert.match(subjectQuery, /contract\.source_system = 'GRH'/);
  assert.match(subjectQuery, /batch\.id = contract\.source_batch_id/);
  assert.match(subjectQuery, /batch\.source_system = 'GRH'/);
  assert.match(subjectQuery, /batch\.source_database = \$2/);
  assert.match(subjectQuery, /batch\.validation_state = 'published'/);
  const reasonQuery = statements.find((statement) => statement.includes('FROM grh_catalog_rows'));
  assert.match(reasonQuery, /source_key::jsonb\s*->>\s*'reasonCode'/);

  let executiveQueries = 0;
  const executive = await getActionBootstrap({
    async query() { executiveQueries += 1; return []; },
  }, principal('INTENDENTE', { employmentContractId: null }));
  assert.equal(executiveQueries, 1);
  assert.deepEqual(executive.options.subjects, []);
  assert.deepEqual(executive.options.reasons, []);
});

test('list usa alias seguros y devuelve summary sin notas ni correos', async () => {
  const statements = [];
  const sql = {
    async query(statement) {
      statements.push(statement);
      if (statement.includes('count(*)')) return [{ total: 1 }];
      return [caseRecord({
        beneficiaryContractId: OTHER_CONTRACT,
        payload: { ...annualPayload(), employeeNote: 'privada' },
      })];
    },
  };
  const result = await listLeaveCases(sql, principal('AUDITOR'), { page: 1, limit: 20 });
  assert.equal(result.data.length, 1);
  assert.equal(Object.hasOwn(result.data[0].payload, 'employeeNote'), false);
  assert.equal(Object.hasOwn(result.data[0], 'actors'), false);
  assert.match(statements[0], /FROM action_case action/);
  assert.match(statements[1], /FROM action_case action[\s\S]+action\.case_type/);
  assert.match(statements[1], /action\.payload - 'employeeNote' AS payload/);
  assert.doesNotMatch(statements[1], /created_by_user_email|decision_reason|cancellation_reason/);
});

test('list mixta proyecta nominal por registro y minimiza los casos accesibles sólo por nómina', async () => {
  const statements = [];
  const sql = {
    async query(statement) {
      statements.push(statement);
      if (statement.includes('count(*)')) return [{ total: 2 }];
      return [
        caseRecord({ beneficiaryContractId: SELF_CONTRACT, status: 'approved', nominalProjection: true }),
        caseRecord({ beneficiaryContractId: null, status: 'approved', nominalProjection: false,
          subjectDisplayName: null, subjectLegajo: null, subjectSector: null }),
      ];
    },
  };
  const actor = principal('EMPLEADO', {
    capabilities: new Set([
      ...capabilitiesForRole('EMPLEADO'),
      'leave.request.payroll.read',
    ]),
  });
  const result = await listLeaveCases(sql, actor, { view: 'authorized' });
  assert.equal(Object.hasOwn(result.data[0], 'subject'), true);
  assert.equal(Object.hasOwn(result.data[1], 'subject'), false);
  assert.equal(Object.hasOwn(result.data[1], 'beneficiaryContractId'), false);
  assert.match(statements[1], /AS "nominalProjection"/);
  assert.match(statements[1], /CASE WHEN/);
});

test('list aplica vistas mine, area, authorized y closed con predicados parametrizados', async () => {
  async function run(actor, options) {
    const calls = [];
    const sql = {
      async query(statement, values) {
        calls.push({ statement, values });
        return statement.includes('count(*)') ? [{ total: 0 }] : [];
      },
    };
    const result = await listLeaveCases(sql, actor, options);
    return { calls, result };
  }

  const mine = await run(principal('EMPLEADO'), {
    view: 'mine', caseType: 'leave_request', page: 2, limit: 10,
  });
  assert.match(mine.calls[0].statement, /action\.beneficiary_contract_id = \$4::uuid/);
  assert.deepEqual(mine.calls[0].values, ['leave_request', TENANT_ID, BINDING_ID, SELF_CONTRACT]);
  assert.equal(mine.result.pagination.mode, 'page');
  assert.equal(mine.result.facets.view.selected, 'mine');
  assert.equal(mine.result.capabilities.pagination.cursor, false);
  assert.equal(mine.result.capabilities.fields.assignedTo.supported, false);

  const area = await run(principal('JEFE_AREA', {
    sourceCompanyId: 7,
    areaScopes: [{ capabilityKey: 'leave.request.area.read', scopeLevel: 'sector', companyId: 7, organizationUnitSourceId: 'org-7', sectorSourceId: 'sector-7' }],
  }), { view: 'area' });
  assert.match(area.calls[0].statement, /action\.company_id = \$4::bigint/);
  assert.match(area.calls[0].statement, /action\.sector_source_id = \$5/);
  assert.match(area.calls[0].statement, /action\.organization_unit_source_id = \$6/);
  assert.match(area.calls[0].statement, /action\.confidentiality = 'standard'/);
  assert.deepEqual(area.calls[0].values, ['leave_request', TENANT_ID, BINDING_ID, 7, 'sector-7', 'org-7']);

  const authorized = await run(principal('AUDITOR'), { view: 'authorized' });
  assert.match(authorized.calls[0].statement, /action\.confidentiality = 'standard'/);
  assert.equal(authorized.result.facets.view.selected, 'authorized');

  const closed = await run(principal('AUDITOR'), { view: 'closed' });
  assert.match(closed.calls[0].statement, /action\.status IN \('rejected', 'cancelled'\)/);
  assert.deepEqual(closed.result.facets.status.available, ['rejected', 'cancelled']);
  assert.equal(closed.result.facets.due.supported, false);
  assert.equal(closed.result.facets.assignee.supported, false);
});

test('list falla cerrado para vista, tipo, due y cursor no soportados', async () => {
  let queries = 0;
  const sql = { async query() { queries += 1; return []; } };
  await assert.rejects(
    listLeaveCases(sql, principal('EMPLEADO'), { view: 'authorized' }),
    (error) => error.code === 'ACTION_VIEW_FORBIDDEN' && error.status === 403,
  );
  await assert.rejects(
    listLeaveCases(sql, principal('EMPLEADO'), { view: 'invented' }),
    (error) => error.code === 'ACTION_VIEW_INVALID' && error.status === 400,
  );
  await assert.rejects(
    listLeaveCases(sql, principal('EMPLEADO'), { caseType: 'payroll_change' }),
    (error) => error.code === 'ACTION_CASE_TYPE_INVALID' && error.status === 400,
  );
  await assert.rejects(
    listLeaveCases(sql, principal('EMPLEADO'), { due: 'today' }),
    (error) => error.code === 'ACTION_DUE_FILTER_UNSUPPORTED' && error.status === 400,
  );
  await assert.rejects(
    listLeaveCases(sql, principal('EMPLEADO'), { cursor: 'opaque' }),
    (error) => error.code === 'ACTION_CURSOR_UNSUPPORTED' && error.status === 400,
  );
  assert.equal(queries, 0);
});

test('administrador sin vínculo no recibe sujetos ni comandos mutantes', async () => {
  let queries = 0;
  const actor = principal('ADMIN_INTERNO', { employmentContractId: null });
  const bootstrap = await getActionBootstrap({
    async query(statement) {
      queries += 1;
      if (statement.includes('FROM source_import_batch')) return [{ cutoff: '2026-08-20T00:00:00Z' }];
      return [];
    },
  }, actor);
  assert.equal(queries, 1);
  assert.deepEqual(bootstrap.options.subjects, []);
  assert.deepEqual(bootstrap.options.reasons, []);
  assert.equal(bootstrap.options.defaultView, 'mine');
  assert.equal(bootstrap.options.listCapabilities.filters.due.supported, false);
  assert.equal(bootstrap.options.listCapabilities.fields.assignedTo.supported, false);
  assert.deepEqual(allowedCommandsForCase(actor, caseRecord({ status: 'submitted' })), []);
});
