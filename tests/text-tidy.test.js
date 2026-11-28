// Un espacio o un Enter al final de un fundamento hacía que la aprobación «no hiciera nada» (10/11). Al salir del
// campo se quitan los sobrantes de los extremos, en todas las tareas de Liquidaciones.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {tidyEdges, tidyOnLeave} from '../assets/text-tidy.js';

test('se quitan sólo los sobrantes de los extremos; el contenido queda igual', () => {
 assert.equal(tidyEdges('Aprobado por revisión independiente \n'), 'Aprobado por revisión independiente');
 assert.equal(tidyEdges('\t  dos líneas\nque siguen juntas  '), 'dos líneas\nque siguen juntas');
 assert.equal(tidyEdges('sin cambios'), 'sin cambios');
 assert.equal(tidyEdges(''), ''); assert.equal(tidyEdges('   '), ''); assert.equal(tidyEdges(null), null);
});

const field = (value, {matches = true, inTask = true, readOnly = false, disabled = false} = {}) => {
 const events = [];
 return {value, readOnly, disabled, events, matches: () => matches, closest: selector => inTask && selector === '.task-panel' ? {} : null, dispatchEvent: e => { events.push(e.type); return true; }};
};
test('al salir de un campo de una tarea, el valor queda limpio y la pantalla se entera', () => {
 const reason = field('Aprobado por revisión independiente \n');
 assert.equal(tidyOnLeave({target: reason}), true);
 assert.equal(reason.value, 'Aprobado por revisión independiente'); assert.deepEqual(reason.events, ['input', 'change']);
 const clean = field('Aprobado'); assert.equal(tidyOnLeave({target: clean}), false); assert.deepEqual(clean.events, []);
});
test('no toca campos ajenos a las tareas, de sólo lectura, deshabilitados ni de otro tipo', () => {
 for (const other of [field('x ', {inTask: false}), field('x ', {matches: false}), field('x ', {readOnly: true}), field('x ', {disabled: true})]) {
  assert.equal(tidyOnLeave({target: other}), false); assert.equal(other.value, 'x '); assert.deepEqual(other.events, []);
 }
 assert.equal(tidyOnLeave({}), false); assert.equal(tidyOnLeave(undefined), false);
});
test('Liquidaciones lo carga una sola vez y el armado lo publica', () => {
 const page = fs.readFileSync('nomina-control.html', 'utf8'), build = fs.readFileSync('scripts/build-friendly.mjs', 'utf8'), source = fs.readFileSync('assets/text-tidy.js', 'utf8');
 assert.equal(page.split('<script type="module" src="assets/text-tidy.js"></script>').length - 1, 1);
 assert.ok(build.includes("'assets/text-tidy.js'"));
 assert.ok(source.includes("document.addEventListener('focusout', tidyOnLeave, true);") && source.includes('dataset.mcTextTidy'));
 // Sólo campos de texto libre: nunca contraseñas, números, fechas ni archivos.
 assert.ok(source.includes(`const FIELDS = 'textarea, input[type="text"], input:not([type])';`));
});
