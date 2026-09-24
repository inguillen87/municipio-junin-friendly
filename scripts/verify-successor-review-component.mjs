// Isolated presentation QA. Synthetic aggregates only; not the installed page or municipal login.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {chromium} from 'playwright';import {successorFixture} from '../tests/fixtures/grh-successor-panel-synthetic.js';
const origin='https://review-component.test',output='verification/successor-review-component';fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CATALOG_BROWSER_CHANNEL?{channel:process.env.CATALOG_BROWSER_CHANNEL}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1050},reducedMotion:'reduce',serviceWorkers:'block'});
const errors=[],unexpected=[],checks=[];const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
const permitted=new Set(['/assets/grh-successor-review-model.js','/assets/grh-successor-review-ui.js','/assets/grh-core-review-model.js','/assets/civil-date.js','/assets/grh-backup-review.css']);
const html=`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QA aislada de revisión</title>
<link rel="stylesheet" href="/assets/grh-backup-review.css"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:#f3f5f4;color:#18252d}main{max-width:1280px;margin:auto}h1{padding:24px 32px 0}:focus-visible{outline:3px solid #1476a2;outline-offset:2px}[hidden]{display:none!important}</style>
<main><h1>QA · Revisión de fuente sucesora</h1><section class="backup-review" id="fixture"><p class="br-status" data-br-status role="status"></p>
<section data-br-result hidden><p class="br-verdict" data-br-verdict></p><div class="br-sources"><article><h3>Base comparada</h3><p data-br-baseline></p><small>No acredita la fuente operativa.</small></article><article><h3>Candidato</h3><p data-br-candidate></p><small>Datos sintéticos, sin consulta municipal.</small></article></div>
<div class="br-counts"><div><span data-br-added-label></span><strong data-br-added></strong></div><div><span data-br-removed-label></span><strong data-br-removed></strong></div><div><span data-br-changed-label></span><strong data-br-changed></strong></div></div>
<p class="br-notice" data-br-core-corrections hidden></p><div class="br-table-wrap" data-br-table-region role="region" tabindex="0"><table><caption data-br-caption></caption><thead><tr><th data-br-domain-label></th><th>Base</th><th>Candidato</th><th>Sin cambios</th><th>Nuevos</th><th>Ausentes</th><th>Modificados</th></tr></thead><tbody data-br-domains></tbody></table></div>
<details class="br-details" open><summary>Cambios que requieren revisión</summary><p data-br-issues-help></p><ul data-br-issues></ul></details>
<details class="br-details"><summary>Fuentes y huellas</summary><div data-br-trace></div><p>La huella identifica el informe local; no acredita autenticidad ni incorporación.</p></details><p class="br-limit" data-br-limit></p></section></section></main>
<script type="module">import {successorReviewData} from '/assets/grh-successor-review-model.js';import {renderSuccessorReview} from '/assets/grh-successor-review-ui.js';globalThis.renderFixture=value=>renderSuccessorReview(document.querySelector('#fixture'),successorReviewData(value),'f'.repeat(64));</script></html>`;
await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(request.method()!=='GET'||url.origin!==origin||url.search){unexpected.push({method:request.method(),path:url.pathname});return route.abort();}
 if(url.pathname==='/')return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html});
 if(!permitted.has(url.pathname)){unexpected.push({method:request.method(),path:url.pathname});return route.abort();}
 return route.fulfill({status:200,contentType:url.pathname.endsWith('.css')?'text/css; charset=utf-8':'application/javascript; charset=utf-8',body:fs.readFileSync(path.join(process.cwd(),url.pathname))});
});
try{
 await page.goto(origin);await page.waitForFunction(()=>typeof globalThis.renderFixture==='function');
 await page.evaluate(value=>globalThis.renderFixture(value),successorFixture());
 assert.equal(await page.locator('[data-br-domains] tr').count(),5);assert.equal(await page.locator('[data-br-added]').innerText(),'5');
 assert.equal(await page.locator('[data-br-removed]').innerText(),'1');assert.equal(await page.locator('[data-br-changed]').innerText(),'5');
 checks.push('Five complete aggregate domains retain consistent changes without summing employee headcounts.');
 assert.match(await page.locator('[data-br-core-corrections]').innerText(),/4 para 3 contratos/);
 assert.match(await page.locator('[data-br-issues]').innerText(),/3 asignaciones conservan/);
 checks.push('Repeated source identities are evidence changes, while four assignments belong to three contracts.');
 const runRows=page.locator('[data-br-successor] tbody tr');assert.equal(await runRows.count(),7);
 assert.equal(await page.locator('[data-br-successor] tbody td').filter({hasText:/^Cerrada$/}).count(),1);
 assert.equal(await page.locator('[data-br-successor] tbody td').filter({hasText:/^Abierta$/}).count(),6);
 assert.match(await page.locator('[data-br-successor] .br-notice').innerText(),/base 2026-08-31 · candidato 2026-08-31/);
 checks.push('The one closed vacation run does not close monthly payroll; both monthly closures remain in August.');
 assert.match(await page.locator('[data-br-verdict]').innerText(),/No se incorporaron/);
 assert.match(await page.locator('[data-br-limit]').innerText(),/No se contrastó la base operativa/);
 assert.equal(await page.locator('form,button,input').count(),0);
 checks.push('The isolated presenter provides no approval, upload or data mutation controls.');
 await page.screenshot({path:output+'/desktop.png',fullPage:true});
 await page.evaluate(value=>globalThis.renderFixture(value),successorFixture());assert.equal(await page.locator('[data-br-successor]').count(),1);
 assert.equal(await page.locator('[data-br-successor] tbody tr').count(),7);checks.push('Rendering again replaces content and does not duplicate evidence or tables.');
 const unknown=successorFixture();delete unknown.runEvidence.candidate.latestClosedByType.M;await page.evaluate(value=>globalThis.renderFixture(value),unknown);
 assert.match(await page.locator('[data-br-successor] .br-notice').innerText(),/candidato no informada/);checks.push('An unreported monthly closure stays unreported rather than copying another type.');
 await page.evaluate(value=>globalThis.renderFixture(value),successorFixture());await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 const region=page.getByRole('region',{name:'Cierres declarados, desplazable'});await region.focus();assert.equal(await region.evaluate(el=>el===document.activeElement),true);
 assert.ok(await region.evaluate(el=>el.scrollWidth>el.clientWidth));await page.screenshot({path:output+'/mobile.png',fullPage:true});
 checks.push('On mobile, tables scroll inside their focusable regions without widening the document.');
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);checks.push('No API calls, private requests, external resources or browser exceptions.');
 const result={version:'successor-panel-component-qa.v1',checkedAt:new Date().toISOString(),checksPassed:checks.length,checks,errors,unexpected,
  syntheticOnly:true,installedIntegrationTested:false,municipalSessionTested:false,sourcePromoted:false,databaseWrites:0,productionModified:false};
 fs.writeFileSync(output+'/result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}finally{await context.close();await browser.close();}
