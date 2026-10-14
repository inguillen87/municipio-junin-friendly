// The built calculation screen consumes the real loopback streamed handler.
// Only authentication is synthetic; catalogue data comes from the QA SQL.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {launchOwnSyntheticBrowser} from './own-synthetic-browser.mjs';
import {RUN_CALCULATE} from '../../lib/internal-own-payroll-run.js';
import {ownRunWorkspaceCsv} from '../../assets/own-payroll-run-workspace-model.js';
export async function verifyFullPayrollBrowser({origin,actor,catalogue,run,output,check,revoke,restore,deniedRead}){
 const root=fs.realpathSync(new URL('../../public',import.meta.url)),errors=[];let writes=0,reads=0,allowed=true,page,browser;
 try{
  ({browser}=await launchOwnSyntheticBrowser());
  const context=await browser.newContext({viewport:{width:1440,height:1100},locale:'es-AR',serviceWorkers:'block'});
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.abort();
   if(u.pathname==='/api/internal-own-payroll-run'){if(req.method()==='POST')writes++;else reads++;return route.continue();}
   if(u.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,sessionVersion:2,user:{id:actor.actorSessionId,email:actor.actorEmail},expiresAt:new Date(Date.now()+3600000).toISOString(),access:{context:'tenant',tenant:{id:actor.tenantId,roleKey:'QA'},tenantCapabilities:allowed?RUN_CALCULATE:RUN_CALCULATE.filter(c=>c!=='payroll.calculation.nominal.read')}}});
   if(u.pathname==='/api/internal-employment-catalog')return route.fulfill({json:{ok:true,data:catalogue}});
   if(u.pathname==='/qa.html')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cálculo completo sintético QA</title><style>body{margin:16px;font-family:system-ui}main{max-width:1100px;margin:auto;min-width:0}</style><main id="qa"></main><script type="module">import {mountOwnPayrollRun} from "/assets/own-payroll-run-panel.js";mountOwnPayrollRun(document.getElementById("qa"));document.dispatchEvent(new CustomEvent("taskchange",{detail:{id:"calculo"}}));</script></html>'});
   if(u.pathname.startsWith('/api/'))return route.fulfill({status:403,json:{ok:false,error:'API ajena a este recorrido sintético.'}});
   const file=path.resolve(root,'.'+u.pathname);if(req.method()!=='GET'||!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
   return route.fulfill({contentType:{'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]??'application/octet-stream',body:fs.readFileSync(file)});
  });
  page=await context.newPage();page.setDefaultTimeout(25000);page.on('pageerror',e=>errors.push(e.message));const $=k=>page.locator('[data-own-'+k+']');
  const idle=()=>page.waitForFunction(()=>document.querySelector('.own-run')?.getAttribute('aria-busy')==='false');
  const open=async()=>{await page.goto(origin+'/qa.html');await page.locator('[data-own-open="'+run.key+'"]').waitFor({state:'visible'});await idle();await page.locator('[data-own-open="'+run.key+'"]').click();await idle();await $('result').waitFor({state:'visible'});};
  await open();assert.ok((await $('result-summary').innerText()).includes('855 legajos'));assert.ok((await $('result-summary').innerText()).includes('2565 conceptos'));assert.equal(await $('totals').locator('tr').count(),855);assert.equal(await $('rows').locator('tr').count(),25);assert.equal(writes,0);
  check(true,'built calculation screen reads the complete streamed855-person result and verifies all sources/hashes before displaying every employee total');
  await $('next').click();assert.ok((await $('page').innerText()).includes('Página 2'));await $('search').fill('esta búsqueda no existe');assert.equal(await $('rows').locator('tr').count(),0);
  const pendingDownload=page.waitForEvent('download');await $('download').click();const download=await pendingDownload,file=path.join(output,'full-payroll-browser-synthetic.csv');await download.saveAs(file);await idle();assert.equal(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''),ownRunWorkspaceCsv(run).replace(/^\uFEFF/,''));assert.equal(writes,0);
  check(true,'result search and pagination preserve the complete2565-row CSV and do not activate another calculation');
  for(const width of[1440,390,320]){await page.setViewportSize({width,height:1100});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'full calculation screen fits '+width+'px');check(await $('download').evaluate(e=>e.getBoundingClientRect().height>=44),'complete export has a44px target at '+width+'px');await $('result-summary').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'full-payroll-result-'+width+'.png')});}
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});assert.ok(await $('result').isHidden());assert.equal(await $('totals').innerText(),'');assert.equal(writes,0);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
  allowed=false;await revoke();await deniedRead();await $('refresh').click();await idle();assert.ok(await $('result').isHidden());assert.ok(await $('download').isDisabled());assert.equal(writes,0);
  allowed=true;await restore();await open();assert.equal(await $('totals').locator('tr').count(),855);assert.equal(writes,0);assert.deepEqual(errors,[]);
  check(true,'hiding and actual nominal-read revocation clear the full result; restored access retrieves the same stored result without a new POST');
  fs.writeFileSync(path.join(output,'full-payroll-product-browser-proof.json'),JSON.stringify({ok:true,syntheticOnly:true,syntheticAuth:true,actualRunHttp:true,actualRunSql:true,catalogueFromActualSql:true,employees:855,rows:2565,writes,reads,widths:[1440,390,320],errors,productiveBusinessWrites:0},null,2)+'\n');
 }catch(e){if(page&&!page.isClosed())await page.screenshot({path:path.join(output,'full-payroll-product-browser-failure.png'),fullPage:true});throw e;}
 finally{await restore();await browser?.close();}
}
