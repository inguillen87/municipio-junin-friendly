// El verificador de Calcular comprueba que el adaptador real rechaza fuentes repetidas con 422 OWN_RUN_SOURCE_AMBIGUOUS.
// Calcular lee sus respuestas por stream, y Chromium informa como abortada una respuesta «no-store» leída así aunque la
// página la recibió entera; el navegador ya no guarda ese cuerpo, y pedírselo fallaba en más de la mitad de las corridas.
// El estado lo da el navegador; el JSON, el servidor de la prueba, que anota lo que escribió el manejador real.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../scripts/verify-own-payroll-run-ui.mjs',import.meta.url),'utf8');

test('el verificador de Calcular no le pide al navegador el cuerpo de una respuesta leída por stream',()=>{
 assert.doesNotMatch(source,/waitForResponse\([^\n]*\)\.then\(\s*(?:qaBrowserJsonSnapshot|r\s*=>\s*r\.(?:json|text|body)\(\))/);
 assert.doesNotMatch(source,/qaBrowserJsonSnapshot/);
});

test('el rechazo se comprueba con el estado que recibió el navegador y el JSON que escribió el manejador para ese mismo POST',()=>{
 assert.match(source,/const post=req\.method==='POST'\?posts\+1:null;/);
 assert.match(source,/res\.json=value=>\{if\(post!==null&&url\.pathname==='\/api\/internal-own-payroll-run'\)runReplies\.push\(\{post,status:res\.statusCode,body:structuredClone\(value\)\}\);/);
 assert.match(source,/const failedStatusPromise=reviewPage\.waitForResponse\(r=>r\.request\(\)\.method\(\)==='POST'&&new URL\(r\.url\(\)\)\.pathname==='\/api\/internal-own-payroll-run'\)\.then\(r=>r\.status\(\)\);/);
 assert.match(source,/check\(failedStatus===422&&failedReply\?\.post===reviewPosts&&failedReply\.status===422&&failedReply\.body\.code==='OWN_RUN_SOURCE_AMBIGUOUS'&&!\(await rs\('result'\)\.isVisible\(\)\),'actual adapter rejects repeated unique sources without a fake result'\);/);
});
