import { payrollRequire as require } from './own-payroll-exact.js';
import { ownProgramRuleKey } from './own-payroll-program-model.js';
import { salarySerialized } from './native-salary-catalog-model.js';
import { participationRules } from './own-period-participation-program.js';

// Municipal rounding policy (owner decision 2026-11-05, GRH parity; migration 192): a new rule keeps
// every stage exact, or declares commercial rounding to cents (half_up, precision 2) for its result and
// for any explicit round node. References may use the rounded stage of another concept, as GRH chains
// concepts on their rounded amounts. Call after structural validation. Reading history and replaying an
// existing request retain their original policies; this only examines new rule content.
export const OWN_PROGRAM_ROUNDING_POLICIES = Object.freeze([{ mode: 'exact' }, { mode: 'half_up', precision: 2 }]);
export const roundingPolicyAllowed = r => !!r && (r.mode === 'exact' || r.mode === 'half_up' && r.precision === 2);
export function requireExactProgramChanges(before, after) {
  const previous = new Map((before ? participationRules(before) : []).map(r => [ownProgramRuleKey(r, after.namespaceVersion), r]));
  const sameExceptEnd = (a, b) => {
    const { validUntil: aEnd, ...aRest } = a, { validUntil: bEnd, ...bRest } = b;
    return salarySerialized(aRest) === salarySerialized(bRest)
      && (aEnd === bEnd || aEnd !== null && (bEnd === null || aEnd <= bEnd));
  };
  const exactNode = n => {
    if (n.op === 'round' && !roundingPolicyAllowed(n.rounding)) return false;
    return ['left', 'right', 'value', 'condition', 'then', 'else']
      .every(k => !n[k] || typeof n[k] !== 'object' || exactNode(n[k]));
  };
  for (const r of participationRules(after)) {
    const old = previous.get(ownProgramRuleKey(r, after.namespaceVersion));
    if (old && sameExceptEnd(r, old)) continue;
    require(roundingPolicyAllowed(r.rounding) && exactNode(r.expression),
      'PROGRAM_PRECISION_REQUIRED',
      `Convenio ${r.agreementCode}, concepto ${r.code}: la regla nueva debe ser exacta en todas las etapas o declarar el redondeo municipal a centavos (half_up, 2 decimales), también en cada redondeo explícito. La carga se conserva.`);
  }
  return after;
}
