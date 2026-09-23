// Real compiled component and exporters; every API response is synthetic and intercepted.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {syntheticCostReport} from './salary-cost-synthetic.mjs';
const {chromium}=process.env.PLAYWRIGHT_LOCAL_MODULE?await import(pathToFileURL(process.env.PLAYWRIGHT_LOCAL_MODULE)):await import('playwright');
assert.ok(process.argv.slice(2).length===0||(process.argv.length===3&&process.argv[2]==='--published'),'Only --published is supported');
const published=process.argv.includes('--published');
const root=path.resolve(process.env.SOURCE_REPORT_FILTERS_ROOT||'public');
const out=path.resolve('verification/source-report-filters'+(published?'-published':''));fs.mkdirSync(out,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const pins={};
for(const name of ['payroll-source-reports.js','payroll-source-report-model.js','report-document.js','report-centre.css']){
 const file='assets/'+name,bytes=fs.readFileSync(path.join(root,file));
 assert.equal(sha(bytes),sha(fs.readFileSync(file)),'Rebuild public before testing: '+file);pins['/'+file]=sha(bytes);
}
const {sourceReportDocument}=await import(pathToFileURL(path.join(root,'assets/payroll-source-report-model.js')));
const {reportCsv,reportPdf,reportXlsx}=await import(pathToFileURL(path.join(root,'assets/report-document.js')));
const specs=[['2026-09-30','M'],['2026-09-15','M'],['2026-09-20','V'],['2026-09-21','F'],['2026-09-22','O'],['2026-09-15','P'],['2026-08-31','S'],['2026-07-31','Z']];
const reports=specs.map(([date,type],i)=>{
 const d=syntheticCostReport(),n=i+1;
 d.datasetId='00000000-0000-4000-8000-'+String(n).padStart(12,'0');d.date=date;d.type=type;
 d.payloadHash=sha('synthetic-payload-'+n);d.reportHash=sha('synthetic-report-'+n);
 d.sourceLabel='Fuente QA '+n+' · sin datos municipales';
 d.rows=d.rows.filter(r=>Number(r.code)>=700);
 d.rows.unshift({code:'42',description:'QA-DATASET-'+n+'-ONLY',totalGroup:'996',amount:n+'.25',sourceRows:2,missingAmounts:0,unit:null});
 d.lineCount=d.rows.reduce((s,r)=>s+r.sourceRows,0);return d;
});
const catalog=()=>({version:'payroll-source-report.v1',official:false,mode:'catalog',total:reports.length,truncated:false,items:reports.map(({rows,reportHash,found,mode,...d})=>d)});
const origin=published?'https://municipio-junin-friendly.vercel.app':'https://source-report-filters.invalid';
const html=`<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/report-centre.css"><style>*{box-sizing:border-box}body{margin:0;background:#f1f5f3;font:14px system-ui;color:#153b4c}main{max-width:1100px;margin:24px auto;padding:20px;background:white;border-radius:14px}.qa{display:flex;justify-content:space-between;align-items:center;gap:10px;border-bottom:1px solid #dde5e7;padding:15px;margin-bottom:15px}.qa img{width:160px}.qa small{font-size:11px}label{display:grid;gap:7px}input,select{min-height:44px;max-width:100%;padding:8px;border:1px solid #b9cdd4;border-radius:6px;font:inherit}.rc-filter{flex-wrap:wrap}button{font:inherit}#panel{min-width:0}[hidden]{display:none!important}@media(max-width:600px){main{margin:0;padding:12px}.qa{flex-wrap:wrap}}</style></head><body><main><header class="qa"><img alt="MuniControl" src="/assets/brand/logo-horizontal.svg"><small>PRUEBA SINTÉTICA · SIN DATOS MUNICIPALES</small></header><section id="panel"></section></main><script type="module">import {mountSourceReports} from '/assets/payroll-source-reports.js';mountSourceReports(document.getElementById('panel'));</script></body></html>`;
let hold=null,deny=0,wrong=false,empty=false,downloads=0;
const calls=[],checks=[],errors=[],unexpected=[],exports=[],assets={},held=new Set();
function holdNext(kind){
 let entered,release,finished;
 const h={kind,entered:new Promise(r=>entered=r),wait:new Promise(r=>release=r),finished:new Promise(r=>finished=r),signal:()=>entered(),release:()=>release(),finish:()=>{held.delete(h);finished();}};hold=h;held.add(h);return h;
}
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
let page;
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'es-AR',acceptDownloads:true,serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin!==origin){unexpected.push('outside-origin');return route.abort();}
  if(url.pathname.startsWith('/api/')){
   if(req.method()!=='GET'||url.pathname!=='/api/internal-data'||url.searchParams.get('resource')!=='payrollsourcereport'||[...url.searchParams.keys()].some(k=>!['resource','datasetId'].includes(k))){unexpected.push('unapproved-api');return route.abort();}
   const id=url.searchParams.get('datasetId'),kind=id?'report':'catalog';calls.push({method:req.method(),kind,datasetId:id});
   const status=deny||200;
   let data=id?structuredClone(reports.find(d=>d.datasetId===id)):catalog();
   assert.ok(data,'Unexpected synthetic dataset request');
   if(id&&wrong)data=structuredClone(reports.find(d=>d.datasetId!==id));
   if(!id&&empty)data={...catalog(),items:[],total:0};
   const h=hold?.kind===kind?hold:null;if(h){hold=null;h.signal();await h.wait;}
   try{await route.fulfill({status,json:status===200?{ok:true,data}:{ok:false}});}finally{h?.finish();}
   return;
  }
  if(url.pathname==='/')return route.fulfill({status:200,contentType:'text/html',body:html});
  const file=path.resolve(root,'.'+url.pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){unexpected.push('missing-asset:'+url.pathname);return route.fulfill({status:404,body:''});}
  let bytes=fs.readFileSync(file);
  if(published){
   // Public assets only: no cookies, tokens, API forwarding or mutable requests.
   assert.equal(req.method(),'GET');assert.ok(url.pathname.startsWith('/assets/'));
   const response=await fetch(origin+url.pathname,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000)});
   assert.equal(response.status,200,'Published asset status: '+url.pathname);
   const live=Buffer.from(await response.arrayBuffer());assert.deepEqual(live,bytes,'Published asset drift: '+url.pathname);bytes=live;
  }
  assets[url.pathname]=sha(bytes);
  return route.fulfill({status:200,contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'image/svg+xml',body:bytes});
 });
 await context.routeWebSocket('**/*',socket=>{unexpected.push('websocket');socket.close();});
 page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));page.on('download',()=>downloads++);
 const $=s=>page.locator(s),values=selector=>$(selector+' option').evaluateAll(nodes=>nodes.map(n=>n.value));
 const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 async function query(id){if(id)await $('[data-dataset]').selectOption(id);await $('[data-query] button').click();await $('[data-result]:not([hidden])').waitFor();}
 async function choose(month,type){await $('[data-catalog-month]').selectOption(month);await $('[data-catalog-type]').selectOption(type);}
 async function refresh(){await $('[data-catalog]').click();await $('[data-query]:not([hidden])').waitFor();await page.waitForFunction(()=>!document.querySelector('[data-state]').textContent.startsWith('Consultando'));}
 const assertCleared=async()=>{
  assert.equal(await $('[data-result]').isVisible(),false);assert.equal(await $('[data-query]').isVisible(),false);
  assert.equal(await $('[data-dataset] option').count(),0);
  assert.doesNotMatch(await $('[data-result]').textContent(),/QA-DATASET-|Fuente QA/,'Revocation must remove consulted source and rows, even hidden');
 };
 await page.goto(origin);await refresh();
 assert.deepEqual(await values('[data-catalog-month]'),['all','2026-09','2026-08','2026-07']);
 assert.equal((await values('[data-dataset]')).length,8);checks.push('complete catalog preserves all eight synthetic runs and date-month choices');
 assert.equal(await $('[data-catalog-type] option[value=S]').textContent(),'SAC (S)');
 assert.equal(await $('[data-catalog-type] option[value=Z]').textContent(),'Tipo de origen Z (Z)');
 assert.equal(await $('[data-catalog-type] option[value=O]').textContent(),'Otros conceptos (O)');checks.push('GRH S is SAC, O is other concepts and an unknown code stays explicit');
 await choose('2026-09','M');assert.deepEqual(await values('[data-dataset]'),reports.slice(0,2).map(d=>d.datasetId));
 const bothDates=await $('[data-dataset]').textContent();assert.match(bothDates,/30\/09\/2026/);assert.match(bothDates,/15\/09\/2026/);checks.push('two monthly runs in the same month remain individually selectable by date and UUID');
 await query(reports[1].datasetId);assert.match(await $('[data-source]').textContent(),/15\/09\/2026.*Mes \(M\)/);assert.match(await $('[data-result] tbody').first().textContent(),/QA-DATASET-2-ONLY/);
 await refresh();assert.equal(await $('[data-catalog-month]').inputValue(),'2026-09');assert.equal(await $('[data-catalog-type]').inputValue(),'M');assert.equal(await $('[data-dataset]').inputValue(),reports[1].datasetId);checks.push('catalog refresh preserves the chosen month, type and exact run');
 await choose('all','V');assert.deepEqual(await values('[data-dataset]'),[reports[2].datasetId]);
 await choose('2026-08','all');assert.deepEqual(await values('[data-dataset]'),[reports[6].datasetId]);await query();assert.match(await $('[data-source]').textContent(),/SAC \(S\)/);
 await choose('2026-07','all');await query();assert.match(await $('[data-source]').textContent(),/Tipo de origen Z \(Z\)/);
 await choose('all','all');assert.equal((await values('[data-dataset]')).length,8);checks.push('month, type and both all choices retain only their stated scope');
 await choose('2026-08','M');assert.equal(await $('[data-dataset] option').count(),0);assert.equal(await $('[data-dataset]').isDisabled(),true);assert.equal(await $('[data-query] button').isDisabled(),true);assert.equal(await $('[data-result]').isVisible(),false);assert.match(await $('[data-state]').textContent(),/No hay liquidaciones/);
 const emptyCalls=calls.length;await page.evaluate(()=>document.querySelector('[data-query]').requestSubmit());await settle();assert.equal(calls.length,emptyCalls);checks.push('empty month and type intersection never falls back to another run');
 await choose('2026-09','M');await $('[data-dataset]').selectOption(reports[1].datasetId);
 const loading=holdNext('report');await $('[data-query] button').click();await loading.entered;await $('[data-catalog-type]').selectOption('V');loading.release();await loading.finished;await settle();
 assert.equal(await $('[data-result]').isVisible(),false);assert.equal(await $('[data-dataset]').inputValue(),reports[2].datasetId);assert.doesNotMatch(await $('[data-source]').textContent(),/Fuente QA 2/);checks.push('a filter change while a run is loading discards its late result');
 await query();
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:1000});await page.evaluate(()=>scrollTo(0,0));await settle();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal page overflow at '+width);
  for(const selector of ['[data-catalog-month]','[data-catalog-type]','[data-dataset]']){
   const b=await $(selector).boundingBox();assert.ok(b&&b.width>=80&&b.height>=40&&b.x>=0&&b.x+b.width<=width+1,'Unusable filter at '+width);
   assert.ok(await $(selector).evaluate(el=>el.labels.length===1&&el.labels[0].textContent.trim().length>0));
  }
  await page.screenshot({path:path.join(out,'filters-'+width+'-synthetic.png'),fullPage:true});checks.push('full-screen filters and selected result remain legible without overflow at '+width+'px');
 }
 await $('[data-group]').selectOption('discounts');const selected=reports[2],doc=sourceReportDocument(selected,{group:'discounts',search:''});
 assert.equal(doc.rows.length,1);assert.equal(doc.rows[0][1],'QA-DATASET-3-ONLY');assert.equal(await $('[data-result]>.rc-table-wrap tbody tr').count(),1);
 for(const [ext,encode]of [['pdf',reportPdf],['xlsx',reportXlsx],['csv',reportCsv]]){
  const before=calls.length,event=page.waitForEvent('download');await $(`[data-format=${ext}]`).click();const download=await event;
  assert.equal(download.suggestedFilename(),doc.filename+'.'+ext);const file=path.join(out,'selected-vacation.'+ext);await download.saveAs(file);
  const bytes=fs.readFileSync(file),expected=Buffer.from(encode(doc));assert.deepEqual(bytes,expected,'Wrong selected export bytes for '+ext);
  assert.equal(calls.length,before+1);assert.equal(calls.at(-1).datasetId,selected.datasetId);
  if(ext==='csv'){const text=bytes.toString('utf8');assert.match(text,/QA-DATASET-3-ONLY/);assert.doesNotMatch(text,/QA-DATASET-(?:1|2|4|5|6|7|8)-ONLY/);assert.equal(text.trim().split('\r\n').length,2);}
  exports.push({format:ext,datasetId:selected.datasetId,rows:doc.rows.length,bytes:bytes.length,sha256:sha(bytes)});
 }
 checks.push('PDF, Excel and CSV revalidate and export exactly the selected run and concept filter, byte for byte');
 const exporting=holdNext('report'),beforeDownloads=downloads;await $('[data-format=xlsx]').click();await exporting.entered;await $('[data-catalog-type]').selectOption('M');exporting.release();await exporting.finished;
 await page.waitForFunction(()=>document.querySelector('[data-state]').textContent.includes('cancelada'));assert.equal(downloads,beforeDownloads);assert.equal(await $('[data-result]').isVisible(),false);checks.push('catalog filter changes during export cancel the old download');
 await query(reports[0].datasetId);const conceptExport=holdNext('report');await $('[data-format=pdf]').click();await conceptExport.entered;await $('[data-search]').fill('does-not-match');conceptExport.release();await conceptExport.finished;
 await page.waitForFunction(()=>document.querySelector('[data-state]').textContent.includes('cancelada'));assert.equal(downloads,beforeDownloads);checks.push('concept filter changes during export cancel the old download');
 await $('[data-search]').fill('');wrong=true;await $('[data-query] button').click();await page.waitForFunction(()=>document.querySelector('[data-state]').textContent.includes('no corresponde'));assert.equal(await $('[data-result]').isVisible(),false);wrong=false;checks.push('a response for a different dataset UUID is rejected');
 await query();wrong=true;await $('[data-format=csv]').click();await page.waitForFunction(()=>document.querySelector('[data-state]').textContent.includes('fuente cambió'));assert.equal(downloads,beforeDownloads);assert.equal(await $('[data-result]').isVisible(),false);wrong=false;checks.push('an export revalidation returning another run cannot download');
 for(const status of [401,403]){
  await refresh();await query();deny=status;await $('[data-format=csv]').click();await $('[data-login]:not([hidden])').waitFor();await assertCleared();assert.equal(downloads,beforeDownloads);deny=0;checks.push(status+' revocation removes the report and catalog and blocks export');
 }
 empty=true;await $('[data-catalog]').click();await page.waitForFunction(()=>document.querySelector('[data-state]').textContent.includes('Todavía no hay'));assert.equal(await $('[data-query]').isVisible(),false);assert.equal(await $('[data-dataset] option').count(),0);checks.push('an empty server catalog does not restore earlier runs');
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);for(const [file,digest]of Object.entries(pins))assert.equal(assets[file],digest);
 const result={ok:true,checksPassed:checks.length,checks,exports,downloads,apiGetRequests:calls.length,apiResponsesSynthetic:true,privateApisIntercepted:true,realApiCallsSent:0,municipalWrites:0,componentOnly:true,publishedAssets:published,realMunicipalSessionTested:false,assetRoot:root,assets,browser:browser.version()};
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({...result,assets:Object.keys(assets)}));
}catch(error){
 const diagnostic={ok:false,checksPassed:checks.length,checks,error:String(error.message),errors,unexpected,calls,downloads,state:page?await page.locator('[data-state]').textContent().catch(()=>null):null};
 fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify(diagnostic,null,2)+'\n');console.error(JSON.stringify(diagnostic));throw error;
}finally{for(const h of held)h.release();await browser.close();}
