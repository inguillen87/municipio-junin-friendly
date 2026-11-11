import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// «Calcular» empieza por lo que la persona vino a hacer: período, fecha, tipo y a quiénes. Lo que falta para poder
// calcular y cómo se prepara un mes nuevo quedan debajo del botón, no antes del formulario.
test('Calcular shows its form first; what is missing and the month preparation come after the button', () => {
  const panel = fs.readFileSync('assets/own-payroll-run-panel.js', 'utf8');
  const start = panel.indexOf('innerHTML=`'), template = panel.slice(start, panel.indexOf('`;', start));
  const at = marker => { const i = template.indexOf(marker); assert.ok(i >= 0, marker); assert.equal(template.indexOf(marker, i + 1), -1, marker + ' once'); return i; };
  const order = ['data-own-status>', '<form data-own-form>', 'data-own-send ', '</form>', 'data-own-coverage hidden', 'data-own-unsectored hidden', 'data-own-login hidden', 'data-own-readiness aria-labelledby', 'data-own-prerequisites>'].map(at);
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.match(template, /<p>Elegí el período, la fecha, el tipo y a quiénes liquidar\.<\/p>/);
  assert.match(panel, /'Faltan las fórmulas de este mes: hasta que estén aprobadas, calcular no da resultado\. Pasos, en orden:'/);
  assert.match(panel, /'Cálculo sin terminar: se preparó y no llegó a calcular'/);
  assert.doesNotMatch(panel, /Captura pendiente de cálculo|El cálculo se detendría sin resultado\. Faltan estos pasos/);
});

test('Reglas de cálculo never shows a warning without words', () => {
  const panel = fs.readFileSync('assets/own-payroll-program-panel.js', 'utf8');
  assert.match(panel, /const status=\(message,state='neutral'\)=>\{\$\('status'\)\.textContent=typeof message==='string'&&message\.trim\(\)\?message:'No pudimos completar la consulta de reglas\. Tocá «Actualizar consulta» para reintentar\.';/);
});
