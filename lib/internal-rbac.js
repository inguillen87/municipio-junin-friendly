const ROLE_ALIASES = Object.freeze({
  INTERNAL_ADMIN: 'ADMIN_INTERNO',
});

export const ACTION_CAPABILITIES = Object.freeze({
  SELF_CREATE: 'action.self.create',
  SELF_READ: 'action.self.read',
  SELF_UPDATE: 'action.self.update',
  SELF_SUBMIT: 'action.self.submit',
  SELF_CANCEL: 'action.self.cancel',
  AREA_CREATE: 'action.area.create',
  AREA_READ: 'action.area.read',
  AREA_UPDATE: 'action.area.update',
  AREA_SUBMIT: 'action.area.submit',
  AREA_CANCEL_PENDING: 'action.area.cancel_pending',
  AREA_DECIDE: 'action.area.decide',
  AREA_CANCEL_APPROVED: 'action.area.cancel_approved',
  ALL_MANAGE: 'action.all.manage',
  ALL_READ: 'action.all.read',
  AGGREGATE_READ: 'action.aggregate.read',
  AUDIT_READ: 'action.audit.read',
  RESTRICTED_READ: 'action.restricted.read',
  RESTRICTED_DECIDE: 'action.restricted.decide',
  PAYROLL_READ: 'action.payroll.read',
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

export async function loadInternalPrincipal(sql, session) {
  const sessionEmail = normalizedEmail(session?.email);
  if (!sessionEmail) return null;

  const users = await queryRows(sql, `
    SELECT email, display_name AS "displayName", role, active
    FROM internal_users
    WHERE lower(email) = lower($1)
    LIMIT 1
  `, [sessionEmail]);
  const user = users[0];
  if (!user?.active) return null;

  const [links, scopes] = await Promise.all([
    queryRows(sql, `
      SELECT employment_contract_id::text AS "employmentContractId"
      FROM internal_user_employment_link
      WHERE lower(user_email) = lower($1) AND active IS TRUE
      LIMIT 1
    `, [user.email]),
    queryRows(sql, `
      SELECT scope_level AS "scopeLevel", company_id AS "companyId",
             organization_unit_source_id AS "organizationUnitSourceId",
             sector_source_id AS "sectorSourceId"
      FROM internal_user_area_scope
      WHERE lower(user_email) = lower($1) AND active IS TRUE
      ORDER BY scope_level, company_id, organization_unit_source_id, sector_source_id
    `, [user.email]),
  ]);

  const role = normalizedRole(user.role);
  return Object.freeze({
    id: String(session?.id || user.email),
    email: normalizedEmail(user.email),
    displayName: String(user.displayName || user.email).trim(),
    role,
    capabilities: capabilitiesForRole(role),
    employmentContractId: links[0]?.employmentContractId || null,
    areaScopes: Object.freeze(scopes.map((scope) => Object.freeze({
      scopeLevel: String(scope.scopeLevel),
      companyId: Number(scope.companyId),
      organizationUnitSourceId: scope.organizationUnitSourceId || null,
      sectorSourceId: scope.sectorSourceId || null,
    }))),
  });
}

export function actionScopeMatches(scope, record) {
  if (!scope || !record || Number(scope.companyId) !== Number(record.companyId)) return false;
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

export function hasAreaScope(principal, record) {
  return Array.isArray(principal?.areaScopes)
    && principal.areaScopes.some((scope) => actionScopeMatches(scope, record));
}

function restrictedAllowed(principal, operation, self) {
  if (self && ['create', 'read', 'update_draft', 'submit', 'cancel'].includes(operation)) return true;
  if (['approve', 'reject'].includes(operation)) {
    return hasActionCapability(principal, C.RESTRICTED_DECIDE);
  }
  return hasActionCapability(principal, C.RESTRICTED_READ)
    || hasActionCapability(principal, C.ALL_MANAGE);
}

export function authorizeAction(principal, operation, record = {}) {
  if (!principal || !ROLE_CAPABILITIES[principal.role]) return false;
  const self = isSelfAction(principal, record);
  const inArea = hasAreaScope(principal, record);
  const restricted = record.confidentiality === 'restricted';
  if (restricted && !restrictedAllowed(principal, operation, self)) return false;

  if (operation === 'create') {
    return hasActionCapability(principal, C.ALL_MANAGE)
      || (self && hasActionCapability(principal, C.SELF_CREATE))
      || (inArea && hasActionCapability(principal, C.AREA_CREATE));
  }
  if (operation === 'read') {
    return hasActionCapability(principal, C.ALL_MANAGE)
      || (self && hasActionCapability(principal, C.SELF_READ))
      || (inArea && hasActionCapability(principal, C.AREA_READ))
      || hasActionCapability(principal, C.ALL_READ)
      || (record.status === 'approved' && hasActionCapability(principal, C.PAYROLL_READ));
  }
  if (operation === 'update_draft') {
    return record.status === 'draft' && (
      hasActionCapability(principal, C.ALL_MANAGE)
      || (self && hasActionCapability(principal, C.SELF_UPDATE))
      || (inArea && hasActionCapability(principal, C.AREA_UPDATE))
    );
  }
  if (operation === 'submit') {
    return record.status === 'draft' && (
      hasActionCapability(principal, C.ALL_MANAGE)
      || (self && hasActionCapability(principal, C.SELF_SUBMIT))
      || (inArea && hasActionCapability(principal, C.AREA_SUBMIT))
    );
  }
  if (operation === 'approve' || operation === 'reject') {
    return record.status === 'submitted'
      && (
        hasActionCapability(principal, C.ALL_MANAGE)
        || (inArea && hasActionCapability(principal, C.AREA_DECIDE))
      );
  }
  if (operation === 'cancel') {
    if (record.status === 'approved') {
      return hasActionCapability(principal, C.ALL_MANAGE)
        || (inArea && hasActionCapability(principal, C.AREA_CANCEL_APPROVED));
    }
    if (!['draft', 'submitted'].includes(record.status)) return false;
    return hasActionCapability(principal, C.ALL_MANAGE)
      || (self && hasActionCapability(principal, C.SELF_CANCEL))
      || (inArea && hasActionCapability(principal, C.AREA_CANCEL_PENDING));
  }
  if (operation === 'audit') return hasActionCapability(principal, C.AUDIT_READ);
  if (operation === 'payroll_read') {
    return record.status === 'approved' && hasActionCapability(principal, C.PAYROLL_READ);
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
