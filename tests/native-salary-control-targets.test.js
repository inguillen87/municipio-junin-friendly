// Every control of the salary master keeps the 44 px minimum of its workspace: the grid of 5/11 had lowered its own
// buttons (export 38 px, sort headers 40 px, «Editar» 34 px). Measured end to end, with the complete 3291-definition master
// at 1440, 390 and 320 px, by scripts/lib/native-salary-capacity-browser.mjs; this guard keeps the style sheet from
// drifting again in a change that never runs that browser verifier.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../src/islands/NativeSalaryCatalog.jsx', import.meta.url), 'utf8');
const css = src.match(/\nconst css=`([^`]+)`;/)?.[1];
const rules = [...(css ?? '').matchAll(/([^{}@]+)\{([^{}]*)\}/g)].map(match => ({ selector: match[1].trim(), body: match[2] }));

test('la hoja de estilos del maestro se puede leer regla por regla', () => {
  assert.ok(css, 'la hoja de estilos sigue en una sola plantilla');
  assert.ok(rules.length > 30);
});

test('todos los controles del maestro parten de 44 px de alto', () => {
  const base = rules.find(rule => rule.selector === '.sc-workspace input,.sc-workspace select,.sc-workspace textarea,.sc-workspace button');
  assert.ok(base, 'la regla común de controles');
  assert.match(base.body, /(?:^|;)min-height:44px(?:;|$)/);
});

test('ninguna regla baja ese mínimo: ni los encabezados para ordenar, ni «Editar», ni los botones de exportación', () => {
  for (const { selector, body } of rules) {
    for (const [, property, pixels] of body.matchAll(/(?:^|;)\s*((?:min-|max-)?height):(\d+(?:\.\d+)?)px/g)) {
      assert.ok(Number(pixels) >= 44, `${selector} declara ${property}:${pixels}px`);
    }
  }
  // The three places that had their own lower height still exist and now declare the same 44 px themselves.
  for (const selector of ['.sc-filters .sc-export button', '.sc-grid .sc-sort', '.sc-grid td button']) {
    const own = rules.filter(rule => rule.selector === selector);
    assert.equal(own.length, 1, selector);
    assert.match(own[0].body, /(?:^|;)min-height:44px(?:;|$)/, selector);
  }
});
