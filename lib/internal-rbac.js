const ROLE_ALIASES = Object.freeze({
  INTERNAL_ADMIN: 'ADMIN_INTERNO',
});

export const ACTION_CAPABILITIES = Object.freeze({
  SELF_CREATE: 'leave.request.self.create',
  SELF_READ: 'leave.request.self.read',
  SELF_UPDATE: 'leave.request.self.update',
  SELF_SUBMIT: 'leave.request.self.submit',
  SELF_CANCEL: 'leave.request.self.cancel',
  AREA_CREATE: 'leave.request.area.create',
  AREA_READ: 'leave.request.area.read',
  AREA_UPDATE: 'leave.request.area.update',
  AREA_SUBMIT: 'leave.request.area.submit',
  AREA_CANCEL_PENDING: 'leave.request.area.cancel_pending',
  AREA_DECIDE: 'leave.request.area.decide',
  AREA_CANCEL_APPROVED: 'leave.request.area.cancel_approved',
  ALL_MANAGE: 'leave.request.all.manage',
  ALL_READ: 'leave.request.all.read',
  AGGREGATE_READ: 'leave.request.aggregate.read',
  AUDIT_READ: 'leave.request.audit.read',
  RESTRICTED_READ: 'leave.request.restricted.read',
  RESTRICTED_DECIDE: 'leave.request.restricted.decide',
  PAYROLL_READ: 'leave.request.payroll.read',
});

const C = ACTION_CAPABILITIES;

export const ROLE_CAPABILITIES = Object.freeze({
  EMPLEADO: Object.freeze([
    C.SELF_CREATE, C.SELF_READ, C.SELF_UPDATE, C.SELF_SUBMIT, C.SELF_CANCEL,
  ]),
  JEFE_AREA: Object.freeze([
    C.SELF_CREATE, C.SELF_READ, C.SELF_UPDATE, C.SELF_SUBMIT, C.SELF_CANCEL,
    C.AREA_READ, C.AREA_SUBMIT, C.AREA_CANCEL_PENDING,
  ]),
  RRHH_OPERADOR: Object.freeze([
    C.SELF_CREATE, C.SELF_READ, C.SELF_UPDATE, C.SELF_SUBMIT, C.SELF_CANCEL,
    C.AREA_CREATE, C.AREA_READ, C.AREA_UPDATE, C.AREA_SUBMIT, C.AREA_CANCEL_PENDING,
  ]),
  RRHH_APROBADOR: Object.freeze([
    C.SELF_CREATE, C.SELF_READ, C.SELF_UPDATE, C.SELF_SUBMIT, C.SELF_CANCEL,
    C.AREA_READ, C.AREA_DECIDE, C.AREA_CANCEL_APPROVED,
    C.RESTRICTED_READ, C.RESTRICTED_DECIDE, C.AUDIT_READ,
  ]),
  ADMIN_INTERNO: Object.freeze([
    ...Object.values(C),
  ]),
  INTENDENTE: Object.freeze([C.AGGREGATE_READ]),
  GOBERNADOR: Object.freeze([C.AGGREGATE_READ]),
  AUDITOR: Object.freeze([C.ALL_READ, C.AUDIT_READ]),
  CONTADOR: Object.freeze([C.PAYROLL_READ]),
  TESORERIA: Object.freeze([C.PAYROLL_READ]),
});

function normalizedRole(value) {
  const role = String(value ?? '').trim().toUpperCase();
  return ROLE_ALIASES[role] || role;
}

function normalizedEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function resultRows(result) {
  return Array.isArray(result) ? result : (Array.isArray(result?.rows) ? result.rows : []);
}

async function queryRows(sql, statement, values = []) {
  if (!sql || typeof sql.query !== 'function') throw new TypeError('conexion SQL requerida');
  return resultRows(await sql.query(statement, values));
}

export function capabilitiesForRole(role) {
  return new Set(ROLE_CAPABILITIES[normalizedRole(role)] || []);
}

export function hasActionCapability(principal, capability) {
  return Boolean(principal?.capabilities instanceof Set && principal.capabilities.has(capability));
}

export async function loadTenantActionPrincipal(sql, identityPrincipal) {
  const email = normalizedEmail(identityPrincipal?.user?.email);
  const tenant = identityPrincipal?.tenant;
  const tenantId = String(tenant?.id || '').trim().toLowerCase();
  const membershipId = String(tenant?.membershipId || '').trim().toLowerCase();
  if (!email || tenant?.source !== 'membership' || !UUID.test(tenantId) || !UUID.test(membershipId)) {
    return null;
  }

  const result = await queryRows(sql, `
    SELECT action_center_resolve_tenant_principal($1, $2::uuid, $3::uuid) AS result
  `, [email, tenantId, membershipId]);
  const resolved = result[0]?.result;
  return tenantActionPrincipalFromFacade(resolved, identityPrincipal);
}

export function tenantActionPrincipalFromFacade(resolved, identityPrincipal) {
  const email = normalizedEmail(identityPrincipal?.user?.email);
  const tenant = identityPrincipal?.tenant;
  const tenantId = String(tenant?.id || '').trim().toLowerCase();
  const membershipId = String(tenant?.membershipId || '').trim().toLowerCase();
  if (!resolved || typeof resolved !== 'object'
      || normalizedEmail(resolved.email) !== email
      || String(resolved.tenantId || '').toLowerCase() !== tenantId
      || String(resolved.membershipId || '').toLowerCase() !== membershipId
      || !Array.isArray(resolved.capabilities)
      || !Array.isArray(resolved.areaScopes)) {
    return null;
  }

  const sourceCompanyId = Number(resolved.sourceCompanyId);
  const sourceBindingId = String(resolved.sourceBindingId || '').trim().toLowerCase();
  if (!Number.isSafeInteger(sourceCompanyId) || sourceCompanyId < 1 || !UUID.test(sourceBindingId)) return null;
  const capabilities = new Set(resolved.capabilities.map(String));
  if (!capabilities.has('actions.read')) return null;
  const areaScopes = resolved.areaScopes.flatMap((scope) => {
    const companyId = Number(scope?.companyId);
    const scopeLevel = String(scope?.scopeLevel || '');
    const capabilityKey = String(scope?.capabilityKey || '');
    if (!Number.isSafeInteger(companyId) || companyId !== sourceCompanyId
        || !capabilities.has(capabilityKey)
        || !['company', 'organization', 'sector'].includes(scopeLevel)) return [];
    const organizationUnitSourceId = scope.organizationUnitSourceId || null;
    const sectorSourceId = scope.sectorSourceId || null;
    if ((scopeLevel === 'company' && (organizationUnitSourceId || sectorSourceId))
        || (scopeLevel === 'organization' && (!organizationUnitSourceId || sectorSourceId))
        || (scopeLevel === 'sector' && (!organizationUnitSourceId || !sectorSourceId))) return [];
    return [Object.freeze({
      scopeLevel,
      capabilityKey,
      companyId,
      organizationUnitSourceId,
      sectorSourceId,
    })];
  });

  return Object.freeze({
    id: membershipId,
    email,
    displayName: String(resolved.displayName || email).trim(),
    role: String(resolved.roleKey || '').trim().toUpperCase(),
    capabilities,
    tenantId,
    membershipId,
    sourceCompanyId,
    sourceBindingId,
    sourceDatabase: String(resolved.sourceDatabase || '').trim(),
    employmentContractId: resolved.employmentContractId || null,
    areaScopes: Object.freeze(areaScopes),
  });
}

export function actionScopeMatches(scope, record, capability) {
  if (!scope || !record || scope.capabilityKey !== capability
      || Number(scope.companyId) !== Number(record.companyId)) return false;
  if (scope.scopeLevel === 'company') return true;
  if (scope.scopeLevel === 'organization') {
    return Boolean(scope.organizationUnitSourceId)
      && String(scope.organizationUnitSourceId) === String(record.organizationUnitSourceId || '');
  }
  if (scope.scopeLevel === 'sector') {
    return Boolean(scope.organizationUnitSourceId && scope.sectorSourceId)
      && String(scope.sectorSourceId) === String(record.sectorSourceId || '')
      && String(scope.organizationUnitSourceId) === String(record.organizationUnitSourceId || '');
  }
  return false;
}

export function isSelfAction(principal, record) {
  return Boolean(
    principal?.employmentContractId
    && record?.beneficiaryContractId
    && String(principal.employmentContractId) === String(record.beneficiaryContractId),
  );
}

export function hasAreaScope(principal, record, capability) {
  return Array.isArray(principal?.areaScopes)
    && principal.areaScopes.some((scope) => actionScopeMatches(scope, record, capability));
}

function restrictedAllowed(principal, operation, self, status) {
  if (self && ['create', 'read', 'update_draft', 'submit', 'cancel'].includes(operation)) return true;
  if (['approve', 'reject'].includes(operation)
      || (operation === 'cancel' && status === 'approved')) {
    return hasActionCapability(principal, C.RESTRICTED_DECIDE);
  }
  return hasActionCapability(principal, C.RESTRICTED_READ);
}

export function actionReadAccessMode(principal, record = {}) {
  if (!principal?.capabilities || !(principal.capabilities instanceof Set)) return null;
  if (String(record.tenantId || '') !== String(principal.tenantId || '')
      || String(record.sourceBindingId || '') !== String(principal.sourceBindingId || '')
      || Number(record.companyId) !== Number(principal.sourceCompanyId)) return null;

  const self = isSelfAction(principal, record);
  const restricted = record.confidentiality === 'restricted';
  const nominalConfidentialityAllowed = !restricted
    || restrictedAllowed(principal, 'read', self, record.status);
  const nominal = nominalConfidentialityAllowed && (
    hasActionCapability(principal, C.ALL_MANAGE)
    || (self && hasActionCapability(principal, C.SELF_READ))
    || (hasAreaScope(principal, record, C.AREA_READ)
      && hasActionCapability(principal, C.AREA_READ))
    || hasActionCapability(principal, C.ALL_READ)
  );
  if (nominal) return 'nominal';

  if (record.status === 'approved'
      && record.confidentiality === 'standard'
      && hasActionCapability(principal, C.PAYROLL_READ)) return 'payroll';
  return null;
}

export function authorizeAction(principal, operation, record = {}) {
  if (!principal?.capabilities || !(principal.capabilities instanceof Set)) return false;
  if (String(record.tenantId || '') !== String(principal.tenantId || '')
      || String(record.sourceBindingId || '') !== String(principal.sourceBindingId || '')
      || Number(record.companyId) !== Number(principal.sourceCompanyId)) return false;
  const self = isSelfAction(principal, record);
  const restricted = record.confidentiality === 'restricted';
  if (restricted && !restrictedAllowed(principal, operation, self, record.status)) return false;

  if (operation === 'create') {
    return hasActionCapability(principal, C.ALL_MANAGE)
      || (self && hasActionCapability(principal, C.SELF_CREATE))
      || (hasAreaScope(principal, record, C.AREA_CREATE)
        && hasActionCapability(principal, C.AREA_CREATE));
  }
  if (operation === 'read') {
    return actionReadAccessMode(principal, record) !== null;
  }
  if (operation === 'update_draft') {
    return record.status === 'draft' && (
      hasActionCapability(principal, C.ALL_MANAGE)
      || (self && hasActionCapability(principal, C.SELF_UPDATE))
      || (hasAreaScope(principal, record, C.AREA_UPDATE)
        && hasActionCapability(principal, C.AREA_UPDATE))
    );
  }
  if (operation === 'submit') {
    return record.status === 'draft' && (
      hasActionCapability(principal, C.ALL_MANAGE)
      || (self && hasActionCapability(principal, C.SELF_SUBMIT))
      || (hasAreaScope(principal, record, C.AREA_SUBMIT)
        && hasActionCapability(principal, C.AREA_SUBMIT))
    );
  }
  if (operation === 'approve' || operation === 'reject') {
    return record.status === 'submitted'
      && (
        hasActionCapability(principal, C.ALL_MANAGE)
        || (hasAreaScope(principal, record, C.AREA_DECIDE)
          && hasActionCapability(principal, C.AREA_DECIDE))
      );
  }
  if (operation === 'cancel') {
    if (record.status === 'approved') {
      return hasActionCapability(principal, C.ALL_MANAGE)
        || (hasAreaScope(principal, record, C.AREA_CANCEL_APPROVED)
          && hasActionCapability(principal, C.AREA_CANCEL_APPROVED));
    }
    if (!['draft', 'submitted'].includes(record.status)) return false;
    return hasActionCapability(principal, C.ALL_MANAGE)
      || (self && hasActionCapability(principal, C.SELF_CANCEL))
      || (hasAreaScope(principal, record, C.AREA_CANCEL_PENDING)
        && hasActionCapability(principal, C.AREA_CANCEL_PENDING));
  }
  if (operation === 'audit') return hasActionCapability(principal, C.AUDIT_READ);
  if (operation === 'payroll_read') {
    return record.status === 'approved'
      && record.confidentiality === 'standard'
      && hasActionCapability(principal, C.PAYROLL_READ);
  }
  return false;
}

export function publicPrincipal(principal) {
  const capabilities = [...principal.capabilities]
    .filter((capability) => principal.employmentContractId || ![
      C.SELF_CREATE, C.SELF_UPDATE, C.SELF_SUBMIT, C.SELF_CANCEL,
      C.AREA_CREATE, C.AREA_UPDATE, C.AREA_SUBMIT, C.AREA_CANCEL_PENDING,
      C.AREA_DECIDE, C.AREA_CANCEL_APPROVED, C.ALL_MANAGE, C.RESTRICTED_DECIDE,
    ].includes(capability))
    .sort();
  return {
    email: principal.email,
    displayName: principal.displayName,
    role: principal.role,
    capabilities,
    hasEmployeeLink: Boolean(principal.employmentContractId),
    areaScopeCount: principal.areaScopes.length,
  };
}
