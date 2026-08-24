import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTION_CAPABILITIES,
  actionReadAccessMode,
  authorizeAction,
  capabilitiesForRole,
  loadTenantActionPrincipal,
  publicPrincipal,
} from '../lib/internal-rbac.js';
import { serializeActionCaseSummary } from '../lib/internal-leave-workflow.js';

const SELF_CONTRACT = '11111111-1111-4111-8111-111111111111';
const OTHER_CONTRACT = '22222222-2222-4222-8222-222222222222';
const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MEMBERSHIP_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const BINDING_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

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
    areaScopes: [],
    ...overrides,
  };
}

function record(overrides = {}) {
  return {
    beneficiaryContractId: OTHER_CONTRACT,
    tenantId: TENANT_ID,
    sourceBindingId: BINDING_ID,
    companyId: 1,
    organizationUnitSourceId: 'org-1',
    sectorSourceId: 'sector-1',
    status: 'submitted',
    confidentiality: 'standard',
    ...overrides,
  };
}

test('principal se resuelve por membership tenant y nunca recarga internal_users.role', async () => {
  const statements = [];
  const sql = {
    async query(statement, values) {
      statements.push(statement);
      assert.deepEqual(values, ['rrhh@junin.gob.ar', TENANT_ID, MEMBERSHIP_ID]);
      return [{ result: {
        email: 'rrhh@junin.gob.ar', displayName: 'RRHH', roleKey: 'JUNIN_RRHH_APROBADOR',
        tenantId: TENANT_ID, membershipId: MEMBERSHIP_ID, sourceBindingId: BINDING_ID,
        sourceCompanyId: 1, sourceDatabase: 'grh_junin', employmentContractId: SELF_CONTRACT,
        capabilities: ['actions.read', ACTION_CAPABILITIES.AREA_READ, ACTION_CAPABILITIES.AREA_DECIDE],
        areaScopes: [{
          id: 'scope-1', capabilityKey: ACTION_CAPABILITIES.AREA_DECIDE,
          scopeLevel: 'sector', companyId: 1,
          organizationUnitSourceId: 'org-1', sectorSourceId: 'sector-1',
        }],
      } }];
    },
  };
  const loaded = await loadTenantActionPrincipal(sql, {
    user: { email: 'rrhh@junin.gob.ar' },
    platform: { roles: ['PLATFORM_OWNER'] },
    tenant: { id: TENANT_ID, membershipId: MEMBERSHIP_ID, source: 'membership' },
  });

  assert.equal(loaded.role, 'JUNIN_RRHH_APROBADOR');
  assert.equal(loaded.employmentContractId, SELF_CONTRACT);
  assert.equal(loaded.areaScopes.length, 1);
  assert.equal(loaded.capabilities.has(ACTION_CAPABILITIES.AREA_DECIDE), true);
  assert.equal(statements.length, 1);
  assert.match(statements[0], /action_center_resolve_tenant_principal/);
  assert.doesNotMatch(statements[0], /internal_users|\.role\b/);
});

test('principal operativo exige actions.read revalidado en DB', async () => {
  const sql = {
    async query() {
      return [{ result: {
        email: 'rrhh@junin.gob.ar', displayName: 'RRHH', roleKey: 'JUNIN_RRHH_OPERADOR',
        tenantId: TENANT_ID, membershipId: MEMBERSHIP_ID, sourceBindingId: BINDING_ID,
        sourceCompanyId: 1, sourceDatabase: 'grh_junin', employmentContractId: SELF_CONTRACT,
        capabilities: [ACTION_CAPABILITIES.AREA_CREATE], areaScopes: [],
      } }];
    },
  };
  const loaded = await loadTenantActionPrincipal(sql, {
    user: { email: 'rrhh@junin.gob.ar' },
    tenant: { id: TENANT_ID, membershipId: MEMBERSHIP_ID, source: 'membership' },
  });
  assert.equal(loaded, null);
});

test('contexto platform o legacy falla cerrado antes de SQL', async () => {
  let calls = 0;
  const sql = { async query() { calls += 1; return []; } };
  for (const tenant of [null, { id: TENANT_ID, membershipId: MEMBERSHIP_ID, source: 'legacy_explicit' }]) {
    const loaded = await loadTenantActionPrincipal(sql, { user: { email: 'baja@junin.gob.ar' }, tenant });
    assert.equal(loaded, null);
  }
  assert.equal(calls, 0);
});

test('administrador sin vínculo conserva lectura y publica mutaciones no decisorias por ámbito', () => {
  const scopedCapabilities = [
    ACTION_CAPABILITIES.AREA_CREATE,
    ACTION_CAPABILITIES.AREA_UPDATE,
    ACTION_CAPABILITIES.AREA_SUBMIT,
    ACTION_CAPABILITIES.AREA_CANCEL_PENDING,
  ];
  const exposed = publicPrincipal(principal('ADMIN_INTERNO', {
    employmentContractId: null,
    areaScopes: scopedCapabilities.map((capabilityKey) => ({
      capabilityKey,
      scopeLevel: 'company',
      companyId: 1,
    })),
  }));
  assert.equal(exposed.hasEmployeeLink, false);
  assert.equal(exposed.capabilities.includes(ACTION_CAPABILITIES.ALL_READ), true);
  assert.equal(exposed.capabilities.includes(ACTION_CAPABILITIES.RESTRICTED_READ), true);
  for (const capability of scopedCapabilities) {
    assert.equal(exposed.capabilities.includes(capability), true, capability);
  }
  for (const capability of [
    ACTION_CAPABILITIES.SELF_CREATE,
    ACTION_CAPABILITIES.AREA_DECIDE,
    ACTION_CAPABILITIES.ALL_MANAGE,
    ACTION_CAPABILITIES.RESTRICTED_DECIDE,
  ]) {
    assert.equal(exposed.capabilities.includes(capability), false, capability);
  }
});

test('principal público no anuncia botones de área sin un scope activo equivalente', () => {
  const exposed = publicPrincipal(principal('ADMIN_INTERNO', {
    employmentContractId: null,
    areaScopes: [],
  }));
  for (const capability of [
    ACTION_CAPABILITIES.AREA_CREATE,
    ACTION_CAPABILITIES.AREA_READ,
    ACTION_CAPABILITIES.AREA_UPDATE,
    ACTION_CAPABILITIES.AREA_SUBMIT,
    ACTION_CAPABILITIES.AREA_CANCEL_PENDING,
  ]) {
    assert.equal(exposed.capabilities.includes(capability), false, capability);
  }
});

test('empleado sólo opera su contrato y un scope de sector no cruza áreas', () => {
  const employee = principal('EMPLEADO');
  assert.equal(authorizeAction(employee, 'read', record({ beneficiaryContractId: SELF_CONTRACT })), true);
  assert.equal(authorizeAction(employee, 'read', record()), false);

  const operator = principal('RRHH_OPERADOR', {
    areaScopes: [{
      capabilityKey: ACTION_CAPABILITIES.AREA_UPDATE,
      scopeLevel: 'sector', companyId: 1,
      organizationUnitSourceId: 'org-1', sectorSourceId: 'sector-1',
    }],
  });
  assert.equal(authorizeAction(operator, 'update_draft', record({ status: 'draft' })), true);
  assert.equal(authorizeAction(operator, 'update_draft', record({ status: 'draft', sectorSourceId: 'sector-2' })), false);
  assert.equal(authorizeAction(operator, 'update_draft', record({ status: 'draft', organizationUnitSourceId: 'org-2' })), false);
  assert.equal(authorizeAction(operator, 'update_draft', record({ status: 'draft', confidentiality: 'restricted' })), false);
  const unsafeSectorScope = principal('RRHH_OPERADOR', {
    areaScopes: [{ capabilityKey: ACTION_CAPABILITIES.AREA_UPDATE, scopeLevel: 'sector', companyId: 1, organizationUnitSourceId: null, sectorSourceId: 'sector-1' }],
  });
  assert.equal(authorizeAction(unsafeSectorScope, 'update_draft', record({ status: 'draft' })), false);
});

test('jefe no decide; aprobador decide sólo en su área y restricted exige permiso separado', () => {
  const scope = [{ capabilityKey: ACTION_CAPABILITIES.AREA_DECIDE, scopeLevel: 'company', companyId: 1 }];
  assert.equal(authorizeAction(principal('JEFE_AREA', { areaScopes: scope }), 'approve', record()), false);
  assert.equal(authorizeAction(principal('RRHH_APROBADOR', { areaScopes: scope }), 'approve', record()), true);
  assert.equal(authorizeAction(
    principal('RRHH_APROBADOR', { areaScopes: scope }),
    'approve',
    record({ confidentiality: 'restricted' }),
  ), true);
  assert.equal(authorizeAction(
    principal('RRHH_APROBADOR', { areaScopes: scope }),
    'approve',
    record({ companyId: 2 }),
  ), false);
});

test('scope de lectura no se reutiliza para decidir y tenant/binding distintos son IDOR', () => {
  const approver = principal('RRHH_APROBADOR', {
    areaScopes: [{
      capabilityKey: ACTION_CAPABILITIES.AREA_READ,
      scopeLevel: 'company', companyId: 1,
    }],
  });
  assert.equal(authorizeAction(approver, 'read', record()), true);
  assert.equal(authorizeAction(approver, 'approve', record()), false);
  assert.equal(authorizeAction(approver, 'read', record({
    tenantId: '99999999-9999-4999-8999-999999999999',
  })), false);
  assert.equal(authorizeAction(approver, 'read', record({
    sourceBindingId: '88888888-8888-4888-8888-888888888888',
  })), false);
});

test('autoridades sólo tienen futura lectura agregada y auditor no accede nominal restringido', () => {
  for (const role of ['INTENDENTE', 'GOBERNADOR']) {
    const capabilities = capabilitiesForRole(role);
    assert.equal(capabilities.has(ACTION_CAPABILITIES.AGGREGATE_READ), true);
    assert.equal(capabilities.has(ACTION_CAPABILITIES.ALL_READ), false);
    assert.equal(authorizeAction(principal(role), 'read', record()), false);
  }
  const auditor = principal('AUDITOR');
  assert.equal(authorizeAction(auditor, 'read', record()), true);
  assert.equal(authorizeAction(auditor, 'read', record({ confidentiality: 'restricted' })), false);
});

test('contador y tesorería reciben resumen de nómina sin sujeto, contrato, actores ni notas', () => {
  const payroll = principal('CONTADOR');
  const source = {
    ...record({ status: 'approved' }),
    id: 'case-1', caseNumber: '18', caseType: 'leave_request',
    policyVersionId: 'mendoza-ley-5811-title-vi.v1',
    payload: {
      reasonCode: '19', startsOn: '2026-09-01', endsOn: '2026-09-02',
      durationUnit: 'calendar_day', employeeNote: 'no debe salir',
    },
    evidenceStatus: 'verified', updatedAt: '2026-08-20T10:00:00Z', version: 3,
    subjectDisplayName: 'Persona', subjectLegajo: '7', subjectSector: 'Tesorería',
    createdBy: 'creador@junin.gob.ar', decisionReason: 'fundamento',
  };
  const summary = serializeActionCaseSummary(source, payroll, 'payroll');

  assert.equal(authorizeAction(payroll, 'read', source), true);
  assert.equal(Object.hasOwn(summary, 'beneficiaryContractId'), false);
  assert.equal(Object.hasOwn(summary, 'subject'), false);
  assert.equal(Object.hasOwn(summary.payload, 'employeeNote'), false);
  assert.equal(Object.hasOwn(summary, 'actors'), false);
  assert.equal(Object.hasOwn(summary, 'decision'), false);
});

test('PAYROLL_READ nunca amplía lectura nominal ni confidencialidad', () => {
  const ownPayroll = principal('EMPLEADO', {
    capabilities: new Set([
      ...capabilitiesForRole('EMPLEADO'),
      ACTION_CAPABILITIES.PAYROLL_READ,
    ]),
  });
  assert.equal(actionReadAccessMode(ownPayroll, record({
    beneficiaryContractId: SELF_CONTRACT, status: 'approved',
  })), 'nominal');
  assert.equal(actionReadAccessMode(ownPayroll, record({
    beneficiaryContractId: '22222222-2222-4222-8222-222222222222', status: 'approved',
  })), 'payroll');

  const payrollRestricted = principal('CONTADOR', {
    capabilities: new Set([
      ACTION_CAPABILITIES.PAYROLL_READ,
      ACTION_CAPABILITIES.RESTRICTED_READ,
    ]),
  });
  assert.equal(actionReadAccessMode(payrollRestricted, record({
    status: 'approved', confidentiality: 'restricted',
  })), null);
  assert.equal(actionReadAccessMode(payrollRestricted, record({ status: 'submitted' })), null);
});
