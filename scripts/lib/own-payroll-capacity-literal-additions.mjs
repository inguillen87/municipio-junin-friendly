// Invented literal QA only. Exact1.00 adds no inferred municipal rounding rule.
import {rule, lit} from '../../tests/fixtures/own-payroll-synthetic.js';

export function ownCapacityLiteralAdditions() {
  return Array.from({length: 18}, (_, n) => rule(String(700 + n), lit('1.00', 'money'), {
    rounding: {precision: 2, mode: 'exact'},
    ruleReference: 'Caso inventado M7 ' + String(n + 1) + ': regla literal de un peso, sin norma municipal; conserva la referencia por concepto y empleado para cotejar captura, decisiones, cierre y reapertura completos.'
  }));
}
