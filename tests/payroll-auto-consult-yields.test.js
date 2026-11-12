// Liquidaciones consulta sola el mes anterior al abrir Anular, Cerrar, Imputación, Asientos y Conciliación, y al volver a la
// pestaña. Esa consulta espera a que el panel verifique el acceso: puede llegar hasta varios segundos después. Si mientras
// tanto la persona consultó por su cuenta, la automática ya no hace falta; cuando llegaba igual, vaciaba la pantalla que la
// persona estaba mirando (en Anular, la lista de fechas del comprobante quedaba vacía un instante y se perdía el alcance elegido).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../assets/payroll-navigation.js',import.meta.url),'utf8');

test('la consulta que hace la persona da por hecha la automática que estaba esperando',()=>{
 assert.match(source,/for\(const task of Object\.values\(periodTasks\)\)if\(task\.load\)task\.root\.querySelector\(task\.load\)\?\.addEventListener\('click',\(\)=>\{task\.loaded=true;\}\);/);
});

test('la consulta automática sólo sale si nadie consultó desde que se pidió, y se anota antes de salir',()=>{
 assert.match(source,/else if\(task\.load&&!task\.loaded&&period\?\.value&&\(!task\.type\|\|type\?\.value\)\)\{const button=enabled\(task\.root,task\.load\);if\(button\)\{task\.loaded=true;button\.click\(\);\}else if\(retries-->0\)setTimeout\(preload,700\);\}/);
});

test('sólo abrir la tarea, volver a la pestaña o un cambio hecho por la persona vuelven a pedir la consulta automática',()=>{
 const resets=[...source.matchAll(/task\.loaded=false/g)].length;
 assert.equal(resets,3);
 assert.match(source,/addEventListener\('change',event=>\{if\(!event\.isTrusted\)return;task\.loaded=false;schedule\(\);\}\)/);
 assert.match(source,/document\.addEventListener\('taskchange',event=>\{if\(event\.detail\?\.id!==workspaceHost\.dataset\.activeTask\)return;for\(const task of Object\.values\(periodTasks\)\)task\.loaded=false;schedule\(\);\}\)/);
 assert.match(source,/document\.addEventListener\('visibilitychange',\(\)=>\{if\(!document\.hidden\)\{for\(const task of Object\.values\(periodTasks\)\)task\.loaded=false;schedule\(\);\}\}\)/);
});

test('cada tarea con consulta automática declara su botón, y Recibos sigue sin recibir clics desde la navegación',()=>{
 const tasks=[...source.matchAll(/(anulacion|cierre|imputacion|asientos|conciliacion|recibos):\{root:[a-zA-Z]+,period:'[^']+',type:(?:'[^']+'|null),load:('[^']+'|null)\}/g)].map(m=>[m[1],m[2]]);
 assert.deepEqual(tasks,[['anulacion',"'[data-annul-load]'"],['cierre',"'[data-close-consult]'"],['imputacion',"'[data-imputation-consult]'"],['asientos',"'[data-journal-consult]'"],['conciliacion',"'[data-rec-consult]'"],['recibos','null']]);
});
