// Condiciones salariales y Horas por convenio: con datos cargados las pantallas eran una página interminable
// (12,5 y 5,6 pantallas medidas en producción). Los renglones van plegados y la comparación reemplaza al listado.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = name => fs.readFileSync(new URL('../assets/' + name, import.meta.url), 'utf8');
const PANELS = [
 {file: 'own-contract-salary-conditions-panel', prefix: 'conditions', host: 'own-salary-conditions', rowClass: 'conditions-row', fold: 'conditions-fold', view: "conditionsView(boot,draft,$('search').value,page)"},
 {file: 'own-agreement-working-time-panel', prefix: 'agreement-time', host: 'own-agreement-time', rowClass: 'agreement-time-row', fold: 'agreement-time-fold', view: "agreementTimeView(boot,draft,$('search').value,page)"},
];

for (const p of PANELS) test(p.file + ': renglones plegados dentro del mismo <article>, sin cambiar cuántos se muestran', () => {
 const js = read(p.file + '.js'), css = read(p.file + '.css');
 assert.ok(js.includes(p.view), 'la página sigue pidiendo la misma cantidad de renglones');
 assert.ok(js.includes(`const card=node('article');card.className='${p.rowClass}';`), 'cada renglón sigue siendo un <article>');
 assert.ok(js.includes(`fold=node('details'),summary=node('summary'),state=node('span',brief(d));fold.className='${p.fold}';fold.open=openRows.has(id);`));
 assert.ok(js.includes('fold.append(fields);card.append(fold);'), 'los campos viven dentro del plegado');
 assert.ok(js.includes('openRows.clear();'), 'cambiar de consulta olvida qué renglones estaban abiertos');
 assert.match(css, new RegExp(`\\.${p.host} \\.${p.fold}>summary\\{display:flex`));
});

for (const p of PANELS) test(p.file + ': la comparación lista sólo lo que cambia y reemplaza al listado mientras se revisa', () => {
 const js = read(p.file + '.js'), css = read(p.file + '.css');
 assert.ok(js.includes("describe(pair,'Antes',r.before,r.after);describe(pair,'Propuesto',r.after,r.before);"));
 assert.ok(js.includes("if(other?read(other.definition)===value:value===null)continue;"));
 assert.ok(js.includes("node('dd',value===null?'Sin informar':value)"), 'un dato ausente se dice, no se convierte');
 assert.ok(js.includes(`<button type="button" data-${p.prefix}-back>Cerrar la comparación y volver</button>`));
 assert.ok(js.includes("$('back').addEventListener('click',()=>{if(attempt||busy)return;invalidate();"), 'no se puede volver con un envío retenido');
 assert.ok(js.includes("$('back').disabled=busy||!!attempt;"));
 assert.ok(css.includes(`.${p.host}:has([data-${p.prefix}-comparison]:not([hidden])) :is([data-${p.prefix}-rows],[data-${p.prefix}-count],label:has(>[data-${p.prefix}-search]),.${p.prefix}-pages:has(>[data-${p.prefix}-prev])){display:none}`));
 assert.ok(!/\$\('rows'\)\.hidden\s*=/.test(js), 'el listado no se oculta con hidden: sólo con la regla de presentación');
});

test('los textos y controles que usan las verificaciones existentes siguen en su lugar', () => {
 const conditions = read('own-contract-salary-conditions-panel.js'), agreements = read('own-agreement-working-time-panel.js');
 for (const text of ['Trabajar con una planilla completa', 'Usar una constancia común para todas las filas', 'Propuestas y decisiones anteriores']) assert.ok(conditions.includes('<summary>' + text + '</summary>'), text);
 for (const text of ['Trabajar con una planilla completa', 'Propuestas y decisiones anteriores']) assert.ok(agreements.includes('<summary>' + text + '</summary>'), text);
 for (const key of ['period', 'refresh', 'content', 'count', 'rows', 'common-date', 'common-reference', 'evidence', 'search', 'download', 'file', 'import', 'reason', 'prepare', 'comparison', 'confirm', 'send', 'recover', 'retry', 'access', 'receipt', 'proposal', 'open', 'review', 'decision', 'decision-reason']) {
  assert.ok(conditions.includes('data-conditions-' + key), 'condiciones: ' + key); assert.ok(agreements.includes('data-agreement-time-' + key), 'horas: ' + key);
 }
});
