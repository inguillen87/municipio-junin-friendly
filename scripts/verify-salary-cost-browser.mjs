// Real report component, synthetic responses only; no login, SQL or municipal writes.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {syntheticCostReport} from './salary-cost-synthetic.mjs';
const {chromium} = process.env.PLAYWRIGHT_LOCAL_MODULE ? await import(pathToFileURL(process.env.PLAYWRIGHT_LOCAL_MODULE)) : await import('playwright');
const root=path.resolve(process.env.SALARY_COST_SOURCE_ROOT || 'public');
const out=path.resolve('verification/salary-cost');fs.mkdirSync(out,{recursive:true});
const origin='https://salary-cost.invalid';
const pageHtml=`<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/report-centre.css"><style>*{box-sizing:border-box}body{margin:0;background:#f1f5f3;font:14px system-ui;color:#153b4c}main{max-width:1100px;margin:24px auto;padding:20px;background:#fff;border-radius:14px}.qa{display:flex;justify-content:space-between;align-items:center;gap:10px;border-bottom:1px solid #dde5e7;padding:15px;margin-bottom:15px}.qa img{width:160px}.qa small{font-size:11px}label{display:grid;gap:7px}input,select{min-height:44px;max-width:100%;padding:8px;border:1px solid #b9cdd4;border-radius:6px;font:inherit}.rc-filter{flex-wrap:wrap}button{font:inherit}#panel{min-width:0}[hidden]{display:none!important}@media(max-width:600px){main{margin:0;padding:12px}.qa{flex-wrap:wrap}}</style></head><body><main><header class="qa"><img alt="MuniControl" src="/assets/brand/logo-horizontal.svg"><small>PRUEBA SINTÉTICA · SIN DATOS MUNICIPALES</small></header><section id="panel"></section></main><script type="module">import {mountSourceReports} from '/assets/payroll-source-reports.js';mountSourceReports(document.getElementById('panel'));</script></body></html>`;
let source=syntheticCostReport(),mode='ok',pending=null,calls=0,downloads=0;
const checks=[],errors=[];
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1040},locale:'es-AR',acceptDownloads:true});
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();
  if(u.pathname.startsWith('/api/')){
   assert.equal(route.request().method(),'GET');calls++;
   if(mode==='wait')await new Promise(r=>pending=r);
   if(mode==='denied')return route.fulfill({status:403,json:{ok:false}});
   if(mode==='network')return route.abort();
   const data=u.searchParams.has('datasetId')?structuredClone(source):{version:source.version,official:false,mode:'catalog',total:1,truncated:false,items:[source]};
   return route.fulfill({status:200,json:{ok:true,data}});
  }
  if(u.pathname==='/')return route.fulfill({status:200,contentType:'text/html',body:pageHtml});
  const f=path.resolve(root,'.'+u.pathname);
  if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile())return route.fulfill({status:404,body:''});
  return route.fulfill({status:200,contentType:f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'image/svg+xml',body:fs.readFileSync(f)});
 });
 const p=await context.newPage();p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));p.on('download',()=>downloads++);
 await p.goto(origin);await p.locator('[data-catalog]').click();await p.locator('[data-query]:not([hidden])').waitFor();
 const load=async()=>{await p.locator('[data-query] button').click();await p.locator('[data-result]:not([hidden])').waitFor();};
 await load();assert.equal(await p.locator('[data-cost-total]').textContent(),'$ 1.245,00');checks.push('visible cost uses exactly the five required concepts');
 await p.locator('.rc-cost-detail summary').click();assert.equal(await p.locator('.rc-cost-detail dl>div').count(),5);
 assert.match(await p.locator('.rc-cost-checks').innerText(),/0,08/);assert.match(await p.locator('.rc-cost-checks').innerText(),/1,00/);checks.push('breakdown and discrepancies visible without correcting source');
 await p.locator('[data-group]').selectOption('discounts');assert.equal(await p.locator('[data-result]>.rc-table-wrap tbody tr').count(),0);assert.equal(await p.locator('[data-cost-total]').textContent(),'$ 1.245,00');checks.push('empty detail filter does not silently change cost scope');
 await p.locator('[data-group]').selectOption('all');const n=calls;
 for(const ext of ['pdf','xlsx','csv']){const event=p.waitForEvent('download');await p.locator(`[data-format="${ext}"]`).click();await(await event).saveAs(path.join(out,'concepts-synthetic.'+ext));}
 assert.equal(calls,n+3);checks.push('three exports revalidate the authenticated dataset before download');
 await p.locator('[data-salary-cost]').screenshot({path:path.join(out,'cost-desktop-synthetic.png')});
 for(const width of [390,320]){await p.setViewportSize({width,height:1000});await p.locator('[data-salary-cost]').scrollIntoViewIfNeeded();assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.locator('[data-salary-cost]').screenshot({path:path.join(out,`cost-mobile-${width}-synthetic.png`)});checks.push('mobile '+width+'px has no horizontal page overflow');}
 const wasOpen=await p.locator('.rc-cost-detail').getAttribute('open');await p.locator('.rc-cost-detail summary').focus();await p.keyboard.press('Enter');assert.notEqual(await p.locator('.rc-cost-detail').getAttribute('open'),wasOpen);checks.push('cost details keyboard control');
 mode='wait';const before=downloads;await p.locator('[data-format=pdf]').click();await p.waitForFunction(()=>document.querySelector('[data-state]').textContent.startsWith('Verificando'));
 await p.locator('[data-search]').fill('Concepto de control');mode='ok';pending?.();await p.waitForFunction(()=>!document.querySelector('[data-format=pdf]').disabled);assert.equal(downloads,before);assert.match(await p.locator('[data-state]').textContent(),/cancelada/);checks.push('filter change during revalidation cancels stale download');
 source.rows.find(r=>r.code==='994').amount=null;source.rows.find(r=>r.code==='994').missingAmounts=1;await load();assert.equal(await p.locator('[data-cost-total]').textContent(),'No calculable');assert.match(await p.locator('[data-salary-cost]').innerText(),/994/);checks.push('missing cost component is explicit, never an invented zero');
 source=syntheticCostReport();await load();source.reportHash='c'.repeat(64);await p.locator('[data-format=xlsx]').click();await p.locator('[data-result][hidden]').waitFor({state:'attached'});checks.push('source drift cancels export and clears cost');
 await load();mode='denied';await p.locator('[data-format=pdf]').click();await p.locator('[data-result][hidden]').waitFor({state:'attached'});assert.equal(await p.locator('[data-salary-cost]').textContent(),'');checks.push('permission revocation clears the cost and prevents export');
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({checksPassed:checks.length,checks,errors,downloads,browser:browser.version(),syntheticApi:true,componentOnly:true,realMunicipalSessionTested:false,backendWrites:false,assetRoot:root},null,2));
 console.log(JSON.stringify({checksPassed:checks.length,downloads,errors}));
}finally{await browser.close();}
