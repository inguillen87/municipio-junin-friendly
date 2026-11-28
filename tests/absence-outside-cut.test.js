import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Ausentismo, período fuera del corte de la fuente. La API responde 422 con el rango que sí tiene. Antes la pantalla mostraba
// un texto genérico y dejaba «Consultando cobertura», «Fuente interna · verificando» y «Consultando eventos…» hasta la
// próxima consulta válida: la persona no sabía hasta qué fecha había datos. El recorrido en navegador está en
// scripts/verify-time-absence-workspace-browser.mjs; estas guardas fijan las dos mitades para que no se separen.
const page=await readFile(new URL('../ausentismo-control.html',import.meta.url),'utf8');
const api=await readFile(new URL('../api/internal-data.js',import.meta.url),'utf8');

test('la API informa el rango disponible cuando el período pedido no toca los datos',()=>{
 const start=api.indexOf("code: 'ABSENCE_RANGE_OUTSIDE_SOURCE'");assert.ok(start>0);
 const answer=api.slice(api.lastIndexOf('status: 422',start),start+420);
 assert.match(answer,/status: 422/);assert.match(answer,/requested: \{ from: requestedFrom, to: requestedTo \}/);assert.match(answer,/available: \{ from: ABSENCE_MIN_DATE, to: source\.cutoff \}/);
});

test('la pantalla dice hasta qué fecha hay datos, con la fecha real de la fuente y no con el piso técnico',()=>{
 assert.match(page,/payload\.code === 'ABSENCE_RANGE_OUTSIDE_SOURCE' && payload\.range && payload\.range\.available/);
 assert.match(page,/'El período elegido empieza después del último dato disponible, que es del ' \+ safeDate\(available\.to\) \+ '\. Elegí fechas hasta ese día\.'/);
 assert.match(page,/'El período elegido termina antes del primer dato disponible, que es del ' \+ safeDate\(available\.from\) \+ '\. Elegí fechas desde ese día\.'/);
 // Sólo se confía en fechas con forma de fecha: un cuerpo inesperado conserva el mensaje general.
 assert.match(page,/\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(String\(available\.from\)\) && \/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(String\(available\.to\)\)/);
 assert.match(page,/response\.status === 422 \? 'El período está fuera del corte disponible\. Ajustá las fechas\.'/);
});

test('una lectura que falla no deja ningún cartel en «Consultando» ni «verificando»',()=>{
 const start=page.indexOf('function settleWithoutData(error, part)');assert.ok(start>0);
 const body=page.slice(start,page.indexOf('var tasks = [];',start));
 for(const id of['summaryBadge','comparisonBadge','qualityBadge','overallTitle','overallDetail','sourceChip','resultCount'])assert.ok(body.includes("'"+id+"'"),id);
 assert.doesNotMatch(body,/[Cc]onsultando|[Vv]erificando/);
 assert.match(body,/'Fuente interna · corte ' \+ safeDate\(range\.to\)/);assert.match(body,/'Fuente interna · sin lectura'/);
 // Se llama en el mismo lugar donde se muestra el mensaje y el botón de reintento, nunca para un 403 (ese camino retira todo).
 const failed=page.slice(page.indexOf('function failed(error, part)'),start);
 assert.match(failed,/byId\(part \+ 'Retry'\)\.hidden = false;\s*settleWithoutData\(error, part\);/);
 assert.ok(failed.indexOf('error.status === 403')<failed.indexOf('settleWithoutData(error, part)'));
});
