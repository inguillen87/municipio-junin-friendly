import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OVERTIME_ACTION_CONTRACT,
  createOvertimeCase,
  getOvertimeBootstrap,
  listOvertimeCases,
  normalizeOvertimePayload,
  normalizeOvertimeTransition,
  readOvertimeCase,
  transitionOvertimeCase,
  updateOvertimeDraft,
} from '../lib/internal-overtime-workflow.js';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MEMBERSHIP = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BINDING = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CONTRACT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CASE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const SESSION = '11111111-1111-4111-8111-111111111111';
const KEY = '22222222-2222-4222-8222-222222222222';
const SHA = 'a'.repeat(40);

const identity = {
  user: { email: 'tesoreria@junin.gob.ar' },
  tenant: { id: TENANT, membershipId: MEMBERSHIP, source: 'membership' },
};
const principal = {
  email: 'tesoreria@junin.gob.ar', tenantId: TENANT, membershipId: MEMBERSHIP,
  sourceBindingId: BINDING,
};
const session = { id: SESSION, email: principal.email, version: 4, releaseSha: SHA };
const facadePrincipal = {
  email: principal.email, tenantId: TENANT, membershipId: MEMBERSHIP,
  roleKey: 'JUNIN_TESORERIA_CARGA', sourceBindingId: BINDING,
  sourceCompanyId: 101, sourceDatabase: 'grh_junin', employmentContractId: CONTRACT,
  actorPersonId: '33333333-3333-4333-8333-333333333333',
  displayName: 'Tesorería', capabilities: ['actions.read', 'time.overtime.read'], areaScopes: [],
};

function sqlReturning(row) {
  const calls = [];
  return {
    calls,
    async query(statement, values) { calls.push({ statement, values }); return { rows: [row] }; },
  };
}

test('contrato declara intake sin cálculo ni posting y pending_time_rules terminal', () => {
  assert.equal(OVERTIME_ACTION_CONTRACT.caseType, 'overtime_entry');
  assert.equal(OVERTIME_ACTION_CONTRACT.calculated, false);
  assert.equal(OVERTIME_ACTION_CONTRACT.posted, false);
  assert.deepEqual(OVERTIME_ACTION_CONTRACT.transitions.pending_time_rules, []);
});

test('payload sólo admite fecha, minutos enteros 1..1440, motivo gobernado y beneficiario create-only', () => {
  const normalized = normalizeOvertimePayload({
    beneficiaryContractId: CONTRACT, workDate: '2026-08-20', declaredMinutes: 73,
    reasonCode: 'service_continuity',
  }, { create: true });
  assert.deepEqual(normalized.casePayload, {
    workDate: '2026-08-20', declaredMinutes: 73, reasonCode: 'service_continuity',
  });
  assert.throws(() => normalizeOvertimePayload({
    beneficiaryContractId: CONTRACT, workDate: '2026-08-20', declaredMinutes: 15,
    reasonCode: 'service_continuity', amount: 100,
  }, { create: true }), /Campo no permitido/);
  assert.throws(() => normalizeOvertimePayload({
    workDate: '2026-02-30', declaredMinutes: 15, reasonCode: 'service_continuity',
  }), /fecha/);
  assert.throws(() => normalizeOvertimePayload({
    workDate: '2026-08-20', declaredMinutes: 1441, reasonCode: 'service_continuity',
  }), /1440/);
  assert.throws(() => normalizeOvertimePayload({
    beneficiaryContractId: CONTRACT, workDate: '2026-08-20', declaredMinutes: 15,
    reasonCode: 'service_continuity',
  }), /Campo no permitido/);
});

test('transiciones tienen shape exacto y aprobación sólo verified + confirmación humana', () => {
  assert.deepEqual(normalizeOvertimeTransition('submit', {
    caseType: 'overtime_entry', command: 'submit', caseId: CASE, expectedVersion: 2,
  }), { expectedVersion: 2, decisionReasonCode: null, evidenceStatus: null, manualValidationConfirmed: false });
  assert.throws(() => normalizeOvertimeTransition('submit', {
    caseType: 'overtime_entry', command: 'submit', caseId: CASE, expectedVersion: 2, reason: 'libre',
  }), /Campo no permitido/);
  assert.throws(() => normalizeOvertimeTransition('approve', {
    caseType: 'overtime_entry', command: 'approve', caseId: CASE, expectedVersion: 2,
    decisionReasonCode: 'validated_documentation', evidenceStatus: 'not_required', manualValidationConfirmed: true,
  }), /evidencia verificada/);
  assert.equal(normalizeOvertimeTransition('approve', {
    caseType: 'overtime_entry', command: 'approve', caseId: CASE, expectedVersion: 2,
    decisionReasonCode: 'validated_documentation', evidenceStatus: 'verified', manualValidationConfirmed: true,
  }).decisionReasonCode, 'validated_documentation');
});

test('create llama sólo facade overtime y hash vincula tenant membership binding SID y SHA', async () => {
  const sql = sqlReturning({ caseId: CASE, caseNumber: '81', status: 'draft', version: 1, replayed: false });
  const result = await createOvertimeCase(sql, principal, {
    beneficiaryContractId: CONTRACT, workDate: '2026-08-20', declaredMinutes: 73,
    reasonCode: 'service_continuity', policyVersionId: 'junin-mayor-esfuerzo-intake.v1',
  }, KEY, session);
  assert.match(sql.calls[0].statement, /action_center_apply_overtime_command_v1/);
  assert.equal(sql.calls[0].values[4], TENANT);
  assert.equal(sql.calls[0].values[5], MEMBERSHIP);
  assert.equal(sql.calls[0].values[10].length, 64);
  assert.equal(result.data.payrollImpact.calculated, false);
});

test('update no acepta cambiar beneficiario y exige versión', async () => {
  await assert.rejects(() => updateOvertimeDraft(sqlReturning({}), principal, CASE, {
    beneficiaryContractId: CONTRACT, workDate: '2026-08-20', declaredMinutes: 20,
    reasonCode: 'service_continuity',
  }, 1, KEY, session), /Campo no permitido/);
  await assert.rejects(() => updateOvertimeDraft(sqlReturning({}), principal, CASE, {
    workDate: '2026-08-20', declaredMinutes: 20, reasonCode: 'service_continuity',
  }, 0, KEY, session), /expectedVersion/);
});

test('approve pasa sólo código gobernado, verified y true; recibo nunca simula liquidación', async () => {
  const sql = sqlReturning({ caseId: CASE, caseNumber: '82', status: 'pending_time_rules', version: 3, replayed: false });
  const result = await transitionOvertimeCase(sql, principal, 'approve', CASE, {
    caseType: 'overtime_entry', command: 'approve', caseId: CASE, expectedVersion: 2,
    decisionReasonCode: 'validated_documentation', evidenceStatus: 'verified', manualValidationConfirmed: true,
  }, KEY, session);
  assert.equal(sql.calls[0].values[14], 'validated_documentation');
  assert.equal(sql.calls[0].values[15], 'verified');
  assert.equal(sql.calls[0].values[16], true);
  assert.equal(result.data.status, 'pending_time_rules');
  assert.equal(result.data.payrollImpact.posted, false);
});

test('bootstrap usa facade session-bound, búsqueda efímera y catálogo provisional', async () => {
  const sql = sqlReturning({ result: {
    principal: facadePrincipal, source: { label: 'GRH canónica' },
    feature: { canEnter: true, canDecide: false, calculated: false, posted: false, internalPolicy: 'secret' },
    subjects: [{ contractId: CONTRACT, displayName: 'Persona', legajo: '10', sector: 'Tesorería', cuil: 'secret' }],
    subjectsTruncated: false,
    reasonRows: [{ reasonCode: 'service_continuity', label: 'Continuidad', governanceStatus: 'operational_provisional' }],
    decisionReasonRows: [],
  } });
  const result = await getOvertimeBootstrap(sql, identity, session, 'tesorería');
  assert.match(sql.calls[0].statement, /action_center_overtime_bootstrap_v1/);
  assert.equal(sql.calls[0].values.at(-1), 'tesorería');
  assert.equal(result.feature.canEnter, true);
  assert.equal(result.options.reasons[0].governanceStatus, 'operational_provisional');
  assert.equal(JSON.stringify(result).includes('internalPolicy'), false);
  assert.equal(JSON.stringify(result).includes('cuil'), false);
});

test('list valida paginación canónica y conserva proyección sin monto', async () => {
  await assert.rejects(
    () => listOvertimeCases(sqlReturning({}), identity, { limit: '51' }, session),
    (error) => error.code === 'ACTION_PAGINATION_INVALID',
  );
  const sql = sqlReturning({ result: {
    principal: facadePrincipal, total: 1, records: [{ id: CASE, caseNumber: '83', status: 'submitted',
      policyVersionId: 'junin-mayor-esfuerzo-intake.v1', payload: { workDate: '2026-08-20', declaredMinutes: 17, reasonCode: 'exceptional_demand' }, version: 2 }],
  } });
  const result = await listOvertimeCases(sql, identity, { page: '1', limit: '20' }, session);
  assert.equal(result.data[0].payrollImpact.amount, null);
  assert.equal(result.data[0].payrollImpact.posted, false);
});

test('detail confía comandos sólo a facade y timeline no agrega actor/session/SHA', async () => {
  const sql = sqlReturning({ result: {
    principal: facadePrincipal,
    record: { id: CASE, caseNumber: '84', beneficiaryContractId: CONTRACT, status: 'draft',
      subject: { contractId: CONTRACT, displayName: 'Persona', legajo: '10', sector: 'Tesorería', diagnosis: 'secret' },
      policyVersionId: 'junin-mayor-esfuerzo-intake.v1', payload: { workDate: '2026-08-20', declaredMinutes: 17, reasonCode: 'exceptional_demand', employeeNote: 'secret' }, version: 1 },
    timeline: [{ id: 1, eventType: 'created', actorEmail: 'secret@example.com',
      metadata: { command: 'create', payrollPosted: false, actorSessionId: SESSION } }],
    allowedCommands: ['update_draft', 'submit', 'cancel', 'create', 'delete'],
  } });
  const result = await readOvertimeCase(sql, identity, CASE, session);
  assert.deepEqual(result.allowedCommands, ['update_draft', 'submit', 'cancel']);
  assert.equal(JSON.stringify(result.timeline).includes('actorSessionId'), false);
  assert.equal(JSON.stringify(result).includes('secret'), false);
  assert.equal(result.data.payrollImpact.rate, null);
});

test('errores SQL de exclusividad y duplicado se traducen sin filtrar detalles', async () => {
  const exclusiveSql = { query: async () => { throw new Error('OVERTIME_EXCLUSIVE_REQUIRED'); } };
  await assert.rejects(() => createOvertimeCase(exclusiveSql, principal, {
    beneficiaryContractId: CONTRACT, workDate: '2026-08-20', declaredMinutes: 9,
    reasonCode: 'service_continuity',
  }, KEY, session), (error) => error.code === 'OVERTIME_EXCLUSIVE_REQUIRED' && error.status === 403);
  const duplicateSql = { query: async () => { throw new Error('violates action_case_overtime_active_entry_uk'); } };
  await assert.rejects(() => createOvertimeCase(duplicateSql, principal, {
    beneficiaryContractId: CONTRACT, workDate: '2026-08-20', declaredMinutes: 9,
    reasonCode: 'service_continuity',
  }, KEY, session), (error) => error.code === 'OVERTIME_DUPLICATE_ACTIVE' && error.status === 409);
});
