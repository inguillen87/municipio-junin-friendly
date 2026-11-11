import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {planProgramSteps, mountProgramSteps, PROGRAM_STEPS, ALL_STEPS} from '../assets/own-program-steps.js';

// Bloques mínimos: `is` responde a matches() y `has` a querySelector(), igual que los usa el reparto.
const block = ({is = [], has = []} = {}) => ({matches: sel => is.some(tag => sel.includes(tag)), querySelector: sel => (has.some(key => sel === '[data-program-' + key + ']') ? {} : null)});
const template = () => [
 block({is: ['legend']}), block(),
 block({is: ['section']}),
 block({has: ['namespaces']}), block(), block({has: ['seniority']}), block(), block({has: ['precision']}),
 block({is: ['[data-program-scale-helper]']}), block({is: ['[data-program-copy]']}), block({has: ['add-rule', 'add-binding']}), block({has: ['rule-select']}), block({is: ['[data-program-rule-editor]']}),
 block({has: ['binding-select']}), block({is: ['[data-program-binding-editor]']}),
 block({has: ['reason']}), block({is: ['[data-program-prepare]']}),
];

test('cada bloque del formulario cae en su paso y la introducción queda siempre a la vista', () => {
 assert.deepEqual(planProgramSteps(template()), [null, null, 'archivo', 'fuentes', 'fuentes', 'fuentes', 'fuentes', 'fuentes', 'reglas', 'reglas', 'reglas', 'reglas', 'reglas', 'entradas', 'entradas', 'enviar', 'enviar']);
 assert.deepEqual(PROGRAM_STEPS.map(step => step.id), ['archivo', 'fuentes', 'reglas', 'entradas', 'enviar']);
 assert.ok(!PROGRAM_STEPS.some(step => step.id === ALL_STEPS));
});

test('si la plantilla cambia y falta una marca, no se reparte nada', () => {
 const withoutReason = template().slice(0, -2);
 assert.equal(planProgramSteps(withoutReason), null);
 const outOfOrder = template(); [outOfOrder[2], outOfOrder[8]] = [outOfOrder[8], outOfOrder[2]];
 assert.equal(planProgramSteps(outOfOrder), null);
 assert.equal(planProgramSteps([]), null);
 assert.equal(planProgramSteps([{}]), null, 'un nodo sin matches() no es un formulario real');
});

test('sin un formulario real no se monta ni se toca nada', () => {
 assert.equal(mountProgramSteps(null), null);
 assert.equal(mountProgramSteps({children: []}), null);
 const fake = {children: [], querySelector: () => ({}), before() { throw new Error('no debe insertar'); }};
 assert.equal(mountProgramSteps(fake), null);
});

test('el panel monta los pasos una vez y la hoja de estilos sólo oculta con la clase propia', () => {
 const panel = fs.readFileSync('assets/own-payroll-program-panel.js', 'utf8'), css = fs.readFileSync('assets/own-payroll-program-panel.css', 'utf8'), steps = fs.readFileSync('assets/own-program-steps.js', 'utf8');
 assert.equal(panel.split("mountProgramSteps($('fields'))").length - 1, 1);
 assert.match(css, /\.own-program \.own-program-step-off\{display:none!important\}/);
 assert.match(css, /@media print\{\.own-program \.own-program-step-off\{display:revert!important\}/);
 assert.ok(!/\.hidden\s*=/.test(steps.replace(/foot\.hidden|prev\.hidden|next\.hidden/g, '')), 'los bloques del formulario nunca se ocultan con hidden');
 assert.ok(fs.readFileSync('scripts/build-friendly.mjs', 'utf8').includes("'assets/own-program-steps.js'"));
});
