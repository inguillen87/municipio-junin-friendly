import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../presupuesto-control.html', import.meta.url), 'utf8');

test('Presupuesto dibuja proporciones de importes publicados, sin agregar cifras ni porcentajes', () => {
  // La figura arranca oculta y sólo se muestra con recursos y financiamiento válidos.
  assert.match(html, /<figure class="funding-bar" id="fundingBar" hidden aria-labelledby="fundingBarCaption">/);
  assert.match(html, /var ok = Boolean\(a && b\) && Number\(a\) > 0 && Number\(b\) >= 0;\s+figure\.hidden = !ok;\s+if \(!ok\) return;/);
  const funding = html.slice(html.indexOf('function renderFundingBar'), html.indexOf('function coverageText'));
  assert.doesNotMatch(funding, /%|toFixed|Math\.round|textContent/); // no escribe números propios: sólo anchos y la etiqueta accesible con los importes exactos
  assert.match(funding, /setAttribute\('aria-label', 'Recursos estimados ' \+ formatMoney\(resources\) \+ ' y financiamiento estimado ' \+ formatMoney\(financing\) \+ '\.'\)/);
  // Renglones: barra relativa al mayor del mismo bloque, sólo si todos los importes son válidos y hay más de uno.
  const rows = html.slice(html.indexOf('function renderBreakdownRows'), html.indexOf('function renderFundingBar'));
  assert.match(rows, /amounts\.every\(function \(value\) \{ return Number\.isFinite\(value\) && value >= 0; \}\) \? Math\.max\.apply\(null, amounts\) : 0/);
  assert.match(rows, /if \(largest > 0 && rows\.length > 1\) \{/);
  assert.match(rows, /bar\.setAttribute\('aria-hidden', 'true'\)/); // el importe exacto sigue en su columna; la barra es decorativa
  assert.match(rows, /create\('div', 'breakdown-amount', formatMoney\(row\.amount\)\)/);
  assert.match(html, /Ayuda visual: cada tramo es proporcional a su importe\. Los importes exactos son los de arriba\./);
  assert.match(html, /@media \(prefers-reduced-motion: reduce\) \{ \.funding-bar-part, \.breakdown-bar i \{ animation: none; \} \}/);
  // El aviso de la pantalla sobre ejecución sigue intacto.
  assert.match(html, /No se calculan porcentajes de ejecución/);
});
