// La fórmula de una regla en una sola línea legible, para entenderla de un vistazo antes de editarla paso a paso.
// Sólo presentación: lee el mismo árbol que el editor y no decide, valida ni redondea nada. Lo incompleto se dice
// («entrada sin nombre», «valor pendiente»); nunca se completa con un valor supuesto.
const SIGN = Object.freeze({ add: '+', subtract: '−', multiply: '×', divide: '÷' });
const COMPARE = Object.freeze({ lt: '<', le: '≤', eq: '=', ne: '≠', ge: '≥', gt: '>' });
const UNIT = Object.freeze({ money: 'pesos', hours: 'horas', minutes: 'minutos', days: 'días', percent: 'porcentaje', units: 'unidades', coefficient: 'coeficiente' });
const filled = value => typeof value === 'string' ? value.trim() !== '' : value !== null && value !== undefined;

// names(kind, code) → nombre del concepto o auxiliar en el maestro aprobado, o nada si no figura. Con nombre se lee
// «Sueldo básico (100)»; sin nombre queda «concepto 100». El nombre es sólo una etiqueta: no cambia la referencia.
export function programFormulaText(expression, { limit = 256, names = null } = {}) {
  let count = 0;
  const named = (kind, word, code) => {
    if (!filled(code)) return word + ' sin código';
    const label = typeof names === 'function' ? names(kind, String(code)) : null;
    return typeof label === 'string' && label.trim() ? label.trim() + ' (' + (kind === 'auxiliary' ? 'aux. ' : '') + code + ')' : word + ' ' + code;
  };
  const show = (node, top = false) => {
    if (!node || typeof node !== 'object') return 'paso pendiente';
    if (++count > limit) return '…';
    const wrap = text => top ? text : '(' + text + ')';
    switch (node.op) {
      case 'input': return filled(node.key) ? String(node.key) : 'entrada sin nombre';
      case 'literal': return filled(node.value) ? String(node.value).replace('.', ',') : 'valor pendiente';
      case 'concept': return named('concept', 'concepto', node.code);
      case 'auxiliary': return named('auxiliary', 'auxiliar', node.code);
      case 'match': return (filled(node.key) ? node.key : 'condición sin nombre') + ' ' + (node.operator === 'ne' ? '≠' : '=') + ' '
        + (typeof node.value === 'boolean' ? (node.value ? 'sí' : 'no') : filled(node.value) ? node.value : 'valor pendiente');
      case 'compare': return wrap(show(node.left) + ' ' + (COMPARE[node.operator] ?? '?') + ' ' + show(node.right));
      case 'add': case 'subtract': case 'multiply': case 'divide': return wrap(show(node.left) + ' ' + SIGN[node.op] + ' ' + show(node.right));
      case 'min': case 'max': return 'el ' + (node.op === 'min' ? 'menor' : 'mayor') + ' entre ' + show(node.left) + ' y ' + show(node.right);
      case 'round': return 'redondeo de ' + show(node.value) + (Number.isInteger(node.rounding?.precision) ? ' a ' + node.rounding.precision + ' decimales' : '');
      case 'convert': return show(node.value) + ' en ' + (UNIT[node.unit] ?? 'unidad pendiente') + (filled(node.factor) ? ' (factor ' + String(node.factor).replace('.', ',') + ')' : '');
      case 'choose': return wrap('si ' + show(node.condition, true) + ' → ' + show(node.then, true) + '; si no → ' + show(node.else, true));
      default: return 'paso pendiente';
    }
  };
  return show(expression, true);
}
