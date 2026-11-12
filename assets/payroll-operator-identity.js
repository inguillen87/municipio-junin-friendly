// Read-only identity evidence from authenticated payroll facades. It never
// grants a capability or changes the employee's employment state.
export function payrollOperatorIdentity(principal, { required = false } = {}) {
  if (!principal || typeof principal !== 'object' || Array.isArray(principal)) throw Error('PAYROLL_OPERATOR_IDENTITY_INVALID');
  const hasVerified = Object.hasOwn(principal, 'actorIdentityVerified');
  const hasBasis = Object.hasOwn(principal, 'actorIdentityBasis');
  if (!hasVerified && !hasBasis && !required) {
    return Object.freeze({ verified: principal.employmentLinked === true, basis: principal.employmentLinked === true ? 'active_employment' : null });
  }
  const verified = principal.actorIdentityVerified, basis = principal.actorIdentityBasis;
  if (!hasVerified || !hasBasis || typeof principal.employmentLinked !== 'boolean' || typeof verified !== 'boolean'
    || (principal.employmentLinked ? !verified || basis !== 'active_employment'
      : verified ? basis !== 'certified_platform_owner' : basis !== null)) throw Error('PAYROLL_OPERATOR_IDENTITY_INVALID');
  return Object.freeze({ verified, basis });
}
