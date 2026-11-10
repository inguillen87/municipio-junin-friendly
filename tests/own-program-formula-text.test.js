import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { programFormulaText } from '../assets/own-program-formula-text.js';
import { expressionSize, PROGRAM_OPERATIONS } from '../assets/own-payroll-program-workspace-model.js';
import { exactProgram } from './fixtures/own-payroll-exact-program-synthetic.js';

const input = (key, unit = 'money') => ({ op: 'input', key, unit });
const literal = (value, unit = 'coefficient') => ({ op: 'literal', value, unit });

test('la fórmula se lee en una línea, con paréntesis explícitos y sin completar lo que falta', () => {
  const basic = { op: 'choose',
    condition: { op: 'compare', operator: 'ne', left: input('clase', 'units'), right: literal('18', 'units') },
    then: { op: 'multiply', left: { op: 'divide', left: input('sueldoConvenio'), right: literal('180', 'hours') }, right: input('horasContrato', 'hours') },
    else: literal('0', 'money') };
  assert.equal(programFormulaText(basic), 'si clase ≠ 18 → (sueldoConvenio ÷ 180) × horasContrato; si no → 0');
  assert.equal(programFormulaText({ op: 'subtract', left: { op: 'add', left: input('a'), right: input('b') }, right: literal('2.5') }), '(a + b) − 2,5');
  assert.equal(programFormulaText({ op: 'max', left: { op: 'concept', code: '1', stage: 'exact' }, right: { op: 'auxiliary', code: '88', stage: 'exact' } }), 'el mayor entre concepto 1 y auxiliar 88');
  assert.equal(programFormulaText({ op: 'round', rounding: { precision: 2, mode: 'half_up' }, value: { op: 'multiply', left: input('base'), right: literal('0.02') } }), 'redondeo de (base × 0,02) a 2 decimales');
  assert.equal(programFormulaText({ op: 'convert', unit: 'hours', factor: '6', conversionReference: 'Respaldo QA', value: input('dias', 'days') }), 'dias en horas (factor 6)');
  assert.equal(programFormulaText({ op: 'match', key: 'unhealthyWork', type: 'boolean', operator: 'eq', value: true }), 'unhealthyWork = sí');
  assert.equal(programFormulaText({ op: 'match', key: 'titleCode', type: 'code', operator: 'ne', value: '50' }), 'titleCode ≠ 50');
  // Lo incompleto se dice; no se inventa un valor ni un cero.
  assert.equal(programFormulaText({ op: 'add', left: input(''), right: literal('') }), 'entrada sin nombre + valor pendiente');
  assert.equal(programFormulaText({ op: 'match', key: '', type: 'code', operator: 'eq', value: '' }), 'condición sin nombre = valor pendiente');
  assert.equal(programFormulaText({ op: 'concept', code: '', stage: 'exact' }), 'concepto sin código');
  assert.equal(programFormulaText(null), 'paso pendiente');
  assert.equal(programFormulaText({ op: 'operación-desconocida' }), 'paso pendiente');
  assert.doesNotMatch(programFormulaText({ op: 'divide', left: input('x'), right: literal('') }), /\b0\b/);
});

test('cubre todas las operaciones del editor y las reglas del programa sintético completo', () => {
  const source = fs.readFileSync(new URL('../assets/own-program-formula-text.js', import.meta.url), 'utf8');
  for (const operation of [...Object.keys(PROGRAM_OPERATIONS), 'match']) assert.ok(source.includes("case '" + operation + "'"), 'operación ' + operation);
  assert.doesNotMatch(source, /fetch\s*\(|innerHTML|localStorage|Math\.round|toFixed|Number\(/); // sólo texto: no calcula ni redondea
  const program = exactProgram();
  assert.ok(program.rules.length > 0);
  for (const rule of program.rules) {
    const text = programFormulaText(rule.expression);
    assert.ok(text.length > 0 && !text.includes('paso pendiente') && !text.includes('undefined'), 'regla ' + rule.conceptCode + ': ' + text);
    assert.ok(text.split(/[()+−×÷→;]| y | entre /).length >= 1);
    expressionSize(rule.expression); // el árbol sigue siendo el mismo que valida el editor
  }
  // Una fórmula enorme no produce un texto sin fin.
  let deep = input('x'); for (let i = 0; i < 400; i += 1) deep = { op: 'add', left: deep, right: literal('1') };
  assert.ok(programFormulaText(deep).includes('…'));
});

test('el editor muestra la fórmula en una línea y la mantiene al día', () => {
  const panel = fs.readFileSync(new URL('../assets/own-payroll-program-panel.js', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../assets/own-payroll-program-panel.css', import.meta.url), 'utf8');
  assert.match(panel, /import \{programFormulaText\} from '\.\/own-program-formula-text\.js';/);
  assert.match(panel, /const say=\(\)=>\{said\.textContent=programFormulaText\(rule\.expression,\{names:catalogName\}\);\};say\(\);area\.addEventListener\('input',say\);area\.addEventListener\('change',say\);/);
  assert.ok(panel.includes("const catalogName=(kind,code)=>boot?.salaryCatalog.items.find(i=>i.active&&i.agreementCode===rule.agreementCode&&i.code===code"), 'los nombres salen del maestro aprobado del mismo convenio');
  assert.match(panel, /Fórmula: \$\{size\.nodes\} operaciones\. Las unidades y conversiones se declaran expresamente\./); // la leyenda anterior se conserva
  assert.match(css, /\.own-program \.own-program-expression-node\{[^}]*grid-template-columns:minmax\(210px,\.9fr\) minmax\(0,2fr\)/);
  assert.match(css, /\.own-program \.own-program-expression-node :is\(select,input\)\{min-height:44px/); // objetivo táctil intacto
  assert.match(css, /@media\(max-width:820px\)\{\.own-program \.own-program-expression-node\{grid-template-columns:minmax\(0,1fr\);margin-left:0!important\}\}/);
  assert.ok(fs.readFileSync(new URL('../scripts/build-friendly.mjs', import.meta.url), 'utf8').includes("'assets/own-program-formula-text.js'"));
});

test('con el maestro a mano la fórmula nombra cada concepto y auxiliar; sin nombre conserva el código', () => {
  const expression = { op: 'multiply', left: { op: 'add', left: { op: 'concept', code: '100' }, right: { op: 'concept', code: '110' } }, right: { op: 'auxiliary', code: '27' } };
  const names = (kind, code) => ({ 'concept:100': 'Sueldo básico', 'auxiliary:27': ' Valor hora ' })[kind + ':' + code] ?? null;
  assert.equal(programFormulaText(expression, { names }), '(Sueldo básico (100) + concepto 110) × Valor hora (aux. 27)');
  assert.equal(programFormulaText(expression), '(concepto 100 + concepto 110) × auxiliar 27');
  assert.equal(programFormulaText(expression, { names: () => '' }), '(concepto 100 + concepto 110) × auxiliar 27');
  assert.equal(programFormulaText({ op: 'concept', code: '' }, { names }), 'concepto sin código');
  assert.equal(programFormulaText({ op: 'concept', code: '100' }, { names: 'no es función' }), 'concepto 100');
});
