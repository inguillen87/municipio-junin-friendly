import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTION_CAPABILITIES,
  authorizeAction,
  capabilitiesForRole,
  loadInternalPrincipal,
  publicPrincipal,
} from '../lib/internal-rbac.js';
import { serializeActionCaseSummary } from '../lib/internal-leave-workflow.js';

const SELF_CONTRACT = '11111111-1111-4111-8111-111111111111';
const OTHER_CONTRACT = '22222222-2222-4222-8222-222222222222';

function principal(role, overrides = {}) {
  return {
    email: 'actor@junin.gob.ar',
    role,
    capabilities: capabilitiesForRole(role),
    employmentContractId: SELF_CONTRACT,
    areaScopes: [],
    ...overrides,
  };
}

function record(overrides = {}) {
  return {
    beneficiaryContractId: OTHER_CONTRACT,
    companyId: 1,
    organizationUnitSourceId: 'org-1',
    sectorSourceId: 'sector-1',
    status: 'submitted',
    confidentiality: 'standard',
    ...overrides,
  };
}

test('principal recarga rol, vínculo y scopes desde DB e ignora el rol de la cookie', async () => {
  const statements = [];
  const sql = {
    async query(statement) {
      statements.push(statement);
      if (statement.includes('FROM internal_users')) {
        return [{ email: 'rrhh@junin.gob.ar', displayName: 'RRHH', role: 'RRHH_APROBADOR', active: true }];
      }
      if (statement.includes('FROM internal_user_employment_link')) {
        return [{ employmentContractId: SELF_CONTRACT }];
      }
      if (statement.includes('FROM internal_user_area_scope')) {
        return [{
          scopeLevel: 'sector',
          companyId: 1,
          organizationUnitSourceId: 'org-1',
          sectorSourceId: 'sector-1',
        }];
      }
      return [];
    },
  };
  const loaded = await loadInternalPrincipal(sql, {
    id: 'cookie-id', email: 'rrhh@junin.gob.ar', role: 'ADMIN_INTERNO',
  });

  assert.equal(loaded.role, 'RRHH_APROBADOR');
  assert.equal(loaded.employmentContractId, SELF_CONTRACT);
  assert.equal(loaded.areaScopes.length, 1);
  assert.equal(loaded.capabilities.has(ACTION_CAPABILITIES.AREA_DECIDE), true);
  assert.equal(statements.length, 3);
});

test('cuenta inactiva falla cerrada antes de cargar vínculos', async () => {
  let calls = 0;
  const loaded = await loadInternalPrincipal({
    async query() { calls += 1; return [{ active: false }]; },
  }, { email: 'baja@junin.gob.ar' });
  assert.equal(loaded, null);
  assert.equal(calls, 1);
});

test('administrador sin vínculo conserva lectura pero no publica capacidades mutantes', () => {
  const exposed = publicPrincipal(principal('ADMIN_INTERNO', { employmentContractId: null }));
  assert.equal(exposed.hasEmployeeLink, false);
  assert.equal(exposed.capabilities.includes(ACTION_CAPABILITIES.ALL_READ), true);
  assert.equal(exposed.capabilities.includes(ACTION_CAPABILITIES.RESTRICTED_READ), true);
  for (const capability of [
    ACTION_CAPABILITIES.SELF_CREATE,
    ACTION_CAPABILITIES.AREA_CREATE,
    ACTION_CAPABILITIES.AREA_DECIDE,
    ACTION_CAPABILITIES.ALL_MANAGE,
    ACTION_CAPABILITIES.RESTRICTED_DECIDE,
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
      scopeLevel: 'sector', companyId: 1,
      organizationUnitSourceId: 'org-1', sectorSourceId: 'sector-1',
    }],
  });
  assert.equal(authorizeAction(operator, 'update_draft', record({ status: 'draft' })), true);
  assert.equal(authorizeAction(operator, 'update_draft', record({ status: 'draft', sectorSourceId: 'sector-2' })), false);
  assert.equal(authorizeAction(operator, 'update_draft', record({ status: 'draft', organizationUnitSourceId: 'org-2' })), false);
  assert.equal(authorizeAction(operator, 'update_draft', record({ status: 'draft', confidentiality: 'restricted' })), false);
  const unsafeSectorScope = principal('RRHH_OPERADOR', {
    areaScopes: [{ scopeLevel: 'sector', companyId: 1, organizationUnitSourceId: null, sectorSourceId: 'sector-1' }],
  });
  assert.equal(authorizeAction(unsafeSectorScope, 'update_draft', record({ status: 'draft' })), false);
});

test('jefe no decide; aprobador decide sólo en su área y restricted exige permiso separado', () => {
  const scope = [{ scopeLevel: 'company', companyId: 1 }];
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
  const summary = serializeActionCaseSummary(source, payroll);

  assert.equal(authorizeAction(payroll, 'read', source), true);
  assert.equal(Object.hasOwn(summary, 'beneficiaryContractId'), false);
  assert.equal(Object.hasOwn(summary, 'subject'), false);
  assert.equal(Object.hasOwn(summary.payload, 'employeeNote'), false);
  assert.equal(Object.hasOwn(summary, 'actors'), false);
  assert.equal(Object.hasOwn(summary, 'decision'), false);
});
