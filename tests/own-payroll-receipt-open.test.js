import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const read=file=>fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
const panel=read('assets/own-payroll-receipt-panel.js'),navigation=read('assets/payroll-navigation.js');

// Behaviour is exercised end to end by scripts/verify-own-payroll-receipt-ui.mjs (real SQL, real browser, 76 checks). These
// guards keep the two halves of that contract from drifting apart in a refactor that never runs the browser verifier.
test('la navegación sólo le pone el mes a Recibos; no le manda un clic diferido',()=>{
 assert.match(navigation,/recibos:\{root:receipts,period:'\[data-receipt-period\]',type:null,load:null\}/);
 assert.match(navigation,/else if\(task\.load&&!task\.loaded&&period\?\.value/,'una tarea sin botón de consulta no recibe clic');
 assert.doesNotMatch(navigation,/data-receipt-history/);
});

test('abrir Recibos es una sola operación del panel: datos del municipio y, una vez, las emisiones del mes',()=>{
 const open=/const openTask=\(\)=>\{if\(attempt\|\|!active\|\|stopped\)return;perform\(async valid=>\{if\(!issuerProfile&&\(!await loadIssuer\(valid\)\|\|!valid\(\)\)\)return;issuerStatus\(\);if\(autoHistory&&\$\('period'\)\.value&&!preview&&!batch\)\{autoHistory=false;await history\(\);\}\}\);\};/;
 assert.match(panel,open);
 // Becoming the active task arms the single automatic history; staying active does not re-arm it.
 assert.match(panel,/const was=active;active=e\.detail\?\.id==='recibos';[^;]*;else\{if\(!was\)autoHistory=true;controls\(\);if\(!issuerProfile\|\|autoHistory\)openTask\(\);\}/);
});

test('un mes preseleccionado reinicia la apertura; lo que escribe la persona apaga la consulta automática',()=>{
 assert.match(panel,/if\(e\.isTrusted\)autoHistory=false;invalidate\('Cambió el alcance o un dato declarado\. Revisá nuevamente\.'\);if\(!issuerProfile\|\|autoHistory\)openTask\(\);/);
 // Scope and type changes cancel a pending load too: without municipal data they ask for it again.
 assert.match(panel,/autoHistory=false;invalidate\('Cambió el alcance\. Revisá nuevamente los recibos elegidos\.'\);if\(!issuerProfile\)openTask\(\);/);
 assert.match(panel,/autoHistory=false;invalidate\('Tipos actualizados\. Revisá los recibos con esta selección\.',\{state:'neutral'\}\);if\(!issuerProfile\)openTask\(\);/);
 // «Revisar recibos completos» still needs the municipal data; the fix is to load it, not to drop the requirement.
 assert.match(panel,/\$\('consult'\)\.disabled=locked\|\|!!attempt\|\|!issuerProfile;/);
});
