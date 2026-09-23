/** Browser regression, synthetic records only. Never loads production or credentials. */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {build} from 'esbuild';
import {syntheticDetail} from './payroll-detail-synthetic.mjs';

const root=process.cwd(),out=path.join(root,'verification/document-library-pagination');
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/'){
  res.setHeader('Content-Type','text/html');
  return res.end('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/assets/payroll-document-library.css"><link rel="stylesheet" href="/assets/payroll-detail-panel.css"><body style="margin:12px;font-family:Arial"><h1>MuniControl · QA sintético</h1><button id="opener">Abrir biblioteca de prueba</button><div id="host"></div></body></html>');
 }
 const file=path.resolve(root,'.'+pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;return res.end()}
 res.setHeader('Content-Type',pathname.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
const checks=[],errors=[],downloads=[];
const check=name=>checks.push(name);
try{
 const page=await browser.newPage({viewport:{width:1100,height:950},acceptDownloads:true});
 page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));page.on('download',d=>downloads.push(d.suggestedFilename()));
 if(process.env.MC_BROWSER_IN_MEMORY==='1'){
  // Offline environments can render the same module without opening a network port.
  await page.setContent('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="margin:12px;font-family:Arial"><h1>MuniControl · QA sintético</h1><button id="opener">Abrir biblioteca de prueba</button><div id="host"></div></body></html>');
  for(const name of ['payroll-document-library','payroll-detail-panel'])await page.addStyleTag({content:fs.readFileSync('assets/'+name+'.css','utf8')});
  const bundle=await build({entryPoints:['assets/payroll-document-library.js'],bundle:true,write:false,format:'iife',globalName:'MuniControlLibraryQA'});
  await page.addScriptTag({content:bundle.outputFiles[0].text});
 }else await page.goto('http://127.0.0.1:'+server.address().port+'/');
 await page.evaluate(async detail=>{
  window.qaDetail=detail;window.qaAllowed=true;window.qaCalls=[];window.qaSlow=false;window.qaFail=false;window.qaPending=[];window.qaDrift=false;
  window.qaItems=Array.from({length:1000},(_,i)=>{
   const d=new Date(Date.UTC(1940,i,1));return {datasetId:`11111111-1111-4111-8111-${String(i).padStart(12,'0')}`,payrollDate:d.toISOString().slice(0,10),sourcePeriod:d.getUTCFullYear(),sourceMonth:d.getUTCMonth()+1,payrollType:i%2?'M':'V',closureStatus:'closed',sourceLabel:'Fuente sintética',importedAt:'2026-09-22T12:00:00Z',conceptCount:detail.lines.length,versionsAvailable:1,historySummaryAvailable:i%3===0};
  });
  const {openPayrollDocumentLibrary}=window.MuniControlLibraryQA||await import('/assets/payroll-document-library.js');
  window.qaRequest=async(url,{signal}={})=>{
   const q=new URL(url,'https://synthetic.test').searchParams;window.qaCalls.push(Object.fromEntries(q));
   if(q.get('resource')==='employeepayrolldocuments'){
    if(window.qaFail)throw Error('Synthetic failure');
    return {ok:true,data:{version:'payroll-document-library.v1',found:true,items:structuredClone(window.qaItems),total:window.qaTotal??window.qaItems.length,truncated:(window.qaTotal??window.qaItems.length)>1000,officialReceipt:false,signatureApplied:false}};
   }
   const item=window.qaItems.find(x=>x.payrollDate===q.get('date')&&x.payrollType===q.get('type'));
   // This request intentionally ignores abort to emulate a late/uncooperative transport.
   if(window.qaSlow)await new Promise(resolve=>window.qaPending.push({resolve,signal}));
   return {ok:true,data:{...window.qaDetail,datasetId:window.qaDrift?'99999999-9999-4999-8999-999999999999':item.datasetId,payrollDate:item.payrollDate,sourcePeriod:item.sourcePeriod,sourceMonth:item.sourceMonth,payrollType:item.payrollType,closureStatus:item.closureStatus}};
  };
  window.openQa=async()=>{document.querySelector('#opener').focus();window.qaLibrary=await openPayrollDocumentLibrary({host:document.querySelector('#host'),employee:{contractId:'44444444-4444-4444-8444-444444444444',name:'PERSONA SINTÉTICA QA',legajo:'0012'},request:window.qaRequest,canRead:()=>window.qaAllowed})};
  await window.openQa();
 },syntheticDetail());
 assert.equal(await page.locator('.pdl-card').count(),24);assert.match(await page.locator('.pdl-page-position').innerText(),/1 de 42/);check('1000 source records render only 24 cards on first page');
 await page.locator('[data-document-page]').selectOption('21');
 assert.match(await page.locator('.pdl-page-position').innerText(),/21 de 42/);
 assert.match(await page.locator('.pdl-body > .pdl-status').innerText(),/481–504/);
 await page.getByRole('button',{name:'Primera página',exact:true}).click();
 check('page selector jumps directly to a chosen page and preserves exact ranges');
 await page.screenshot({path:path.join(out,'first-page-desktop.png'),fullPage:false});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.getByRole('navigation',{name:'Páginas de liquidaciones del legajo'}).screenshot({path:path.join(out,'pagination-mobile.png')});
 await page.setViewportSize({width:1100,height:950});
 const initialRequests=await page.evaluate(()=>window.qaCalls.length);
 const allKeys=[];
 for(let n=1;n<=42;n++){
  allKeys.push(...await page.locator('.pdl-card').evaluateAll(cards=>cards.map(c=>c.dataset.documentKey)));
  if(n<42)await page.getByRole('button',{name:'Página siguiente',exact:true}).click();
 }
 assert.equal(allKeys.length,1000);assert.equal(new Set(allKeys).size,1000);assert.equal(await page.evaluate(()=>window.qaCalls.length),initialRequests);check('all 42 pages visit 1000 unique documents with zero additional API requests');
 assert.match(await page.locator('.pdl-body > .pdl-status').innerText(),/985–1000/);assert.equal(await page.locator('.pdl-card').count(),16);assert.equal(await page.getByRole('button',{name:'Página siguiente',exact:true}).isDisabled(),true);check('last page has exact range, 16 items, and disabled next button');
 assert.equal(await page.evaluate(()=>document.activeElement.className),'pdl-status');check('keyboard focus returns to accessible result count on page changes');
 await page.locator('[data-document-filter="year"]').selectOption('1940');
 await page.locator('[data-document-filter="month"]').selectOption('1');
 await page.locator('[data-document-filter="type"]').selectOption('V');
 assert.equal(await page.locator('.pdl-card').count(),1);assert.match(await page.locator('.pdl-card h4').innerText(),/Enero de 1940/);assert.equal(await page.evaluate(()=>window.qaCalls.length),1);check('filters search the entire received index, not the current page');
 await page.getByRole('button',{name:'Actualizar biblioteca',exact:true}).click();
 assert.equal(await page.locator('[data-document-filter="year"]').inputValue(),'1940');assert.equal(await page.locator('[data-document-filter="month"]').inputValue(),'1');assert.equal(await page.locator('[data-document-filter="type"]').inputValue(),'V');assert.equal(await page.locator('.pdl-card').count(),1);check('authorized refresh preserves year, month and type without broadening scope');
 await page.getByRole('button',{name:/Ver conceptos y exportar · Enero de 1940/}).click();await page.locator('.pd-table').first().waitFor();
 await page.getByRole('button',{name:'Cerrar detalle',exact:true}).click();assert.match(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),/Enero de 1940/);check('closing a detail returns focus to its original document button');
 await page.evaluate(()=>window.qaSlow=true);await page.getByRole('button',{name:/Ver conceptos y exportar · Enero de 1940/}).click();
 await page.waitForFunction(()=>window.qaPending.length===1);
 await page.locator('[data-document-filter="month"]').selectOption('3');
 await page.evaluate(()=>{window.qaPending.splice(0).forEach(p=>p.resolve());window.qaSlow=false});
 await page.waitForFunction(()=>document.querySelector('.pdl-card > button:not(:disabled)'));
 assert.equal(await page.locator('[data-payroll-detail-panel]').count(),0);check('late detail response cannot reappear after a filter change');
 await page.evaluate(()=>window.qaDrift=true);await page.getByRole('button',{name:/Ver conceptos y exportar · Marzo/}).click();await page.getByText(/Hay una versión distinta de esta liquidación/).waitFor();assert.equal(await page.getByRole('button',{name:'Descargar detalle · PDF',exact:true}).count(),0);check('dataset version drift blocks detail and PDF export');
 await page.evaluate(()=>window.qaDrift=false);await page.getByRole('button',{name:/Ver conceptos y exportar · Marzo/}).click();await page.locator('.pd-table').first().waitFor();
 await page.evaluate(()=>window.qaSlow=true);await page.getByRole('button',{name:'Descargar detalle · PDF',exact:true}).click();await page.waitForFunction(()=>window.qaPending.length===1);
 await page.getByRole('button',{name:'Limpiar filtros',exact:true}).click();await page.evaluate(()=>{window.qaPending.splice(0).forEach(p=>p.resolve());window.qaSlow=false});
 await page.waitForTimeout(100);assert.equal(downloads.length,0);assert.equal(await page.locator('[data-payroll-detail-panel]').count(),0);check('changing selection during reauthorization cancels the old export');
 await page.getByRole('button',{name:'Página siguiente',exact:true}).click();await page.getByRole('button',{name:'Actualizar biblioteca',exact:true}).click();assert.match(await page.locator('.pdl-page-position').innerText(),/2 de 42/);check('refresh preserves the selected page when it still exists');
 await page.evaluate(()=>window.qaItems=window.qaItems.slice(0,12));await page.getByRole('button',{name:'Actualizar biblioteca',exact:true}).click();assert.equal(await page.locator('.pdl-card').count(),12);assert.equal(await page.getByRole('navigation',{name:'Páginas de liquidaciones del legajo'}).isVisible(),false);check('smaller source clamps the page without showing stale records');
 await page.locator('[data-document-filter="year"]').selectOption('1940');await page.evaluate(()=>window.qaItems=[]);await page.getByRole('button',{name:'Actualizar biblioteca',exact:true}).click();await page.getByText(/Todavía no hay liquidaciones detalladas incorporadas/).waitFor();assert.equal(await page.getByRole('button',{name:'Actualizar biblioteca',exact:true}).isVisible(),true);check('empty source retains a retry/update action');
 // Restore data with a different year: a prior filter must produce zero, not all data.
 await page.evaluate(()=>window.qaItems=[{datasetId:'11111111-1111-4111-8111-000000000001',payrollDate:'2026-09-01',sourcePeriod:2026,sourceMonth:9,payrollType:'M',closureStatus:'open',sourceLabel:'Fuente sintética',importedAt:'2026-09-22T12:00:00Z',conceptCount:window.qaDetail.lines.length,versionsAvailable:1,historySummaryAvailable:false}]);
 await page.getByRole('button',{name:'Actualizar biblioteca',exact:true}).click();assert.equal(await page.locator('[data-document-filter="year"]').inputValue(),'1940');assert.equal(await page.locator('.pdl-card').count(),0);check('disappeared filter values stay explicit instead of silently widening the result');
 await page.getByRole('button',{name:'Limpiar filtros',exact:true}).click();await page.locator('[data-document-filter="year"]').selectOption('2026');await page.evaluate(()=>window.qaFail=true);await page.getByRole('button',{name:'Actualizar biblioteca',exact:true}).click();await page.getByRole('button',{name:'Reintentar biblioteca',exact:true}).waitFor();assert.equal(await page.locator('.pdl-card').count(),0);
 await page.evaluate(()=>window.qaFail=false);await page.getByRole('button',{name:'Reintentar biblioteca',exact:true}).click();assert.equal(await page.locator('[data-document-filter="year"]').inputValue(),'2026');check('failed refresh removes old data, retry retains filters');
 await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});check('390px viewport has no horizontal overflow');
 await page.getByRole('button',{name:'Cerrar biblioteca',exact:true}).click();assert.equal(await page.evaluate(()=>document.activeElement.id),'opener');check('closing library restores its invoking control');
 await page.evaluate(async()=>{window.qaAllowed=false;await window.openQa()});assert.equal(await page.locator('[data-payroll-document-library]').count(),0);check('lost access cannot mount a new library');
 assert.deepEqual(errors,[]);check('no unhandled browser exceptions');
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({checksPassed:checks.length,checks,errors,syntheticOnly:true,municipalSessionTested:false,maximumRenderedCards:24,availableMetadata:1000,fullIndexRequests:initialRequests,extraPageRequests:0},null,2));console.log(JSON.stringify({checksPassed:checks.length,errors}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
