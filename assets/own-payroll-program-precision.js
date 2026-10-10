import { payrollRequire as require } from './own-payroll-exact.js';
import { ownProgramRuleKey } from './own-payroll-program-model.js';
import { salarySerialized } from './native-salary-catalog-model.js';

// Call after structural validation. Reading history and replaying an existing
// request retain their original policies; this only examines new rule content.
export function requireExactProgramChanges(before, after) {
  const previous = new Map((before?.rules ?? []).map(r => [ownProgramRuleKey(r, after.namespaceVersion), r]));
  const sameExceptEnd = (a, b) => {
    const { validUntil: aEnd, ...aRest } = a, { validUntil: bEnd, ...bRest } = b;
    return salarySerialized(aRest) === salarySerialized(bRest)
      && (aEnd === bEnd || aEnd !== null && (bEnd === null || aEnd <= bEnd));
  };
  const exactNode = n => {
    if (n.op === 'round' && n.rounding.mode !== 'exact') return false;
    if (['concept', 'auxiliary'].includes(n.op) && n.stage !== 'exact') return false;
    return ['left', 'right', 'value', 'condition', 'then', 'else']
      .every(k => !n[k] || typeof n[k] !== 'object' || exactNode(n[k]));
  };
  for (const r of after.rules) {
    const old = previous.get(ownProgramRuleKey(r, after.namespaceVersion));
    if (old && sameExceptEnd(r, old)) continue;
    require(r.rounding.mode === 'exact' && exactNode(r.expression),
      'PROGRAM_PRECISION_REQUIRED',
      `Convenio ${r.agreementCode}, concepto ${r.code}: la regla nueva debe conservar el resultado exacto en todas las etapas. Elegí precisión exacta y referencias antes del redondeo. La carga se conserva.`);
  }
  return after;
}
