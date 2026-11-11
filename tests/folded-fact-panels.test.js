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

// Revisión de una propuesta (10/11): quien revisaba no encontraba el tilde «Revisé…» (quedaba debajo de la
// comparación) y un Enter o un espacio al final del fundamento hacían que «Comparar decisión» no hiciera nada: el
// motivo se escribía arriba de todo, fuera de la vista.
const REVIEW = [...PANELS, {file: 'own-contract-family-payroll-facts-panel', prefix: 'family-facts', host: 'own-family-facts'}];
for (const p of REVIEW) test(p.file + ': el tilde y el botón de confirmar viajan juntos en una barra que queda a la vista', () => {
 const js = read(p.file + '.js'), css = read(p.file + '.css');
 assert.match(js, new RegExp(`</section></div>\\s*<div class="${p.prefix}-actions"><label class="${p.prefix}-check" data-${p.prefix}-confirm-row hidden><input type="checkbox" data-${p.prefix}-confirm>Revisé `), 'el tilde está en la barra de acciones, no al final de la comparación');
 assert.ok(js.includes("$('confirm-row').hidden=$('send').hidden=!prepared||!!attempt||!!receipt;"), 'el tilde aparece exactamente cuando aparece el botón que habilita');
 assert.ok(js.includes("$('send').disabled=busy||!$('confirm').checked||"), 'sin tilde no se confirma');
 assert.ok(css.includes(`.${p.host} .${p.prefix}-actions:has(>:not([hidden])){position:sticky;bottom:0;`));
 assert.match(css, new RegExp(`@media print\\{\\.${p.host} \\.${p.prefix}-actions\\{position:static`));
});

for (const p of REVIEW) test(p.file + ': los avisos de la decisión salen al lado del botón y el fundamento se limpia solo', () => {
 const js = read(p.file + '.js');
 assert.ok(js.includes(`<button type="button" data-${p.prefix}-review>Comparar decisión</button><p class="${p.prefix}-next" data-${p.prefix}-review-note role="status" aria-live="polite">Al comparar se abre la revisión completa.`));
 assert.ok(js.includes("const tidy=input=>{const value=input.value.normalize('NFC').replace(/[\\u0000-\\u001f\\u007f]+/g,' ').trim();if(value!==input.value)input.value=value;return value;};"));
 assert.ok(js.includes("const reason=tidy($('decision-reason'));if(/[<>]/.test(reason)){note('El fundamento no admite los signos < ni >.');return;}if(reason.length<10){note('Escribí el fundamento de la decisión: al menos 10 caracteres.');return;}"));
 assert.ok(js.includes("if(!$('decision').value){note('Elegí primero la decisión.');return;}"));
 assert.ok(js.includes("if(!prepared&&!attempt)note($('status').textContent);"), 'si la comparación no se abre, el motivo se repite al lado del botón');
 assert.ok(js.includes("note(open?'Cambiaste la decisión o el fundamento. Apretá «Comparar decisión» otra vez.':'');"));
 assert.ok(js.includes("tidy($('reason')))") && js.includes("reference=tidy($('common-reference'));"), 'el fundamento de la preparación y la constancia común se limpian igual');
 assert.ok(js.includes("$('decision').addEventListener('change',redo);$('decision-reason').addEventListener('input',redo);"));
 // El tilde nunca se marca solo y la confirmación sigue siendo un acto de la persona.
 assert.ok(!/\$\('confirm'\)\.checked=true/.test(js));
});

for (const p of REVIEW) test(p.file + ': el fundamento trae un ejemplo en gris y un botón que lo carga listo', () => {
 const js = read(p.file + '.js'), css = read(p.file + '.css');
 assert.ok(js.includes(`data-${p.prefix}-decision-reason placeholder="Elegí la decisión: acá vas a ver un ejemplo que podés usar."></textarea></label><p class="${p.prefix}-example"><button type="button" data-${p.prefix}-example>Usar el ejemplo</button>`));
 assert.match(js, /const example=\(\)=>\$\('decision'\)\.value==='approve'\?'Aprobado por revisión independiente de [^']+ de '\+month\(\):\$\('decision'\)\.value==='reject'\?'Rechazado por revisión independiente: corregir [^']+ de '\+month\(\)\+' y volver a presentar':'';/);
 assert.ok(js.includes("$('decision-reason').placeholder=example()?'Ejemplo: '+example():"), 'el ejemplo en gris es el mismo que carga el botón');
 assert.ok(js.includes("if(!example()){note('Elegí primero la decisión.');return;}$('decision-reason').value=example();redo();note();"), 'cargar el ejemplo cierra una comparación abierta: hay que volver a comparar');
 assert.match(js, new RegExp(`data-${p.prefix}-reason placeholder="De dónde salen [^"]+ Ejemplo: [^"]+"></textarea>`), 'la preparación también muestra un ejemplo');
 // El ejemplo nunca se envía solo: sólo entra al campo cuando la persona aprieta el botón.
 assert.equal(js.split("$('decision-reason').value=example()").length - 1, 1);
 assert.ok(css.includes(`.${p.host} textarea::placeholder{color:#6b7f83;`));
});

for (const p of REVIEW) test(p.file + ': quien revisa abre la propuesta pendiente con un botón y su contenido no desaparece al decidir', () => {
 const js = read(p.file + '.js'), css = read(p.file + '.css');
 assert.ok(js.includes(`<div data-${p.prefix}-content hidden><div class="${p.prefix}-pending" data-${p.prefix}-pending hidden><p data-${p.prefix}-pending-text></p><button type="button" data-${p.prefix}-pending-open>Revisar ahora</button></div>`));
 assert.ok(js.includes("const waiting=boot?.permissions.canReview?boot.proposals.filter(x=>x.status==='pending'&&x.canReview):[];$('pending').hidden=!waiting.length;"), 'sólo se avisa lo que esta cuenta puede revisar');
 assert.ok(js.includes("$('proposal').value=waiting[0].id;$('proposal').dispatchEvent(new Event('change',{bubbles:true}));$('open').click();"), 'el botón recorre el mismo camino que la persona: elegir y abrir');
 assert.ok(js.includes("(value.proposal.canReview&&boot.permissions.canReview?$('decision-fields'):$('comparison')).scrollIntoView({block:'start'});"), 'al abrir, queda a la vista dónde se decide');
 assert.ok(js.includes(' function reshow(){if(!detail||attempt)return;changes=') && js.includes('invalidate();reshow();if(!attempt)note('));
 assert.match(js, /prepared=null;\$\('pending'\)\.hidden=true;/, 'una vez registrada la decisión, el aviso se retira');
 // El botón no decide nada: no elige la decisión, no escribe el fundamento y no tilda.
 const handler = js.slice(js.indexOf("$('pending-open').addEventListener"), js.indexOf("$('pending-open').addEventListener") + 420);
 assert.ok(!/\$\('decision'\)\.value=|\$\('decision-reason'\)\.value=|checked=/.test(handler));
 assert.ok(css.includes(`.${p.host} .${p.prefix}-pending{display:flex;`));
});
