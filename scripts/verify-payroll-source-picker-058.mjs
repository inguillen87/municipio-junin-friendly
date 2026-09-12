/** Full production-shell exercises with all API responses intercepted inside the test browser. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import readXlsxFile from 'read-excel-file/node';
import {sourcePickerFixtures,SOURCE_IDS} from './payroll-source-picker-synthetic.mjs';
const live=process.env.SOURCE_PICKER_LIVE_ASSETS==='1';
const origin=live?'https://municipio-junin-friendly.vercel.app':'https://municontrol.test';
const root=path.resolve('public'),out='verification/source-picker-058';fs.mkdirSync(out,{recursive:true});
const checks=[],errors=[],calls=[],downloads=[];let mode='',catalogMode='',hold=false,waiting=[];
function release(){hold=false;const old=waiting;waiting=[];old.forEach(fn=>fn());}
async function until(test){const end=Date.now()+15000;while(!test()){if(Date.now()>end)throw Error('QA condition timeout');await new Promise(r=>setTimeout(r,20));}}
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true,serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.abort();
  if(u.pathname.startsWith('/api/')){
   assert.equal(req.method(),'GET','This read-only task must not issue a backend write');
   if(u.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,user:{name:'QA sintético',email:'qa@example.invalid',role:'ADMIN_INTERNO'},access:{tenantCapabilities:['payroll.read','workforce.employee.read'],platformCapabilities:[],platformRoles:[]}}});
   if(u.searchParams.get('resource')==='payrollsourcereport'){
    calls.push(Object.fromEntries(u.searchParams));const snapshotMode=mode,{reports,catalog}=sourcePickerFixtures(),id=u.searchParams.get('datasetId');
    if(hold)await new Promise(r=>waiting.push(r));
    if(snapshotMode==='401'||snapshotMode==='403')return route.fulfill({status:Number(snapshotMode),json:{ok:false}}).catch(()=>{});
    if(snapshotMode==='network')return route.abort().catch(()=>{});
    if(!id){if(catalogMode==='empty'){catalog.items=[];catalog.total=0;}if(catalogMode==='truncated'){catalog.total=300;catalog.truncated=true;}return route.fulfill({json:{ok:true,data:catalog}}).catch(()=>{});}
    const data=reports.find(r=>r.datasetId===id);assert.ok(data,'Unexpected fixture id');
    if(snapshotMode==='content')data.rows[0].amount='9999.99';
    if(snapshotMode==='closure')data.closureStatus=data.closureStatus==='closed'?'open':'closed';
    if(snapshotMode==='label')data.sourceLabel='Otro corte SINTÉTICO';
    if(snapshotMode==='id')data.datasetId=SOURCE_IDS[5];
    if(snapshotMode==='hash')data.reportHash='f'.repeat(64);
    if(snapshotMode==='malformed')data.lineCount++;
    return route.fulfill({json:{ok:true,data}}).catch(()=>{});
   }
   return route.fulfill({json:{ok:true,data:[],status:'ready',runs:[],limitations:['QA sintético']}});
  }
  if(live)return route.continue();
  const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
  return route.fulfill({contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'application/octet-stream',body:fs.readFileSync(file)});
 });
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',err=>errors.push(err.message));page.on('download',event=>downloads.push(event));
 let task='haberes';const $=s=>page.locator('#task-'+task+' .ps-workbench '+s);
 async function idle(){await page.waitForFunction(id=>document.querySelector('#task-'+id+' .ps-workbench')?.getAttribute('aria-busy')==='false',task);}
 async function catalog(){await $('[data-catalog]').click();await idle();await $('[data-catalog-panel]').waitFor();}
 async function view(id=SOURCE_IDS[0]){await $('[data-dataset]').selectOption(id);await $('[data-view-report]').click();await $('[data-result]').waitFor();await idle();}
 async function fresh(){release();mode='';catalogMode='';await catalog();await view();}
 const rowCount=()=>$('[data-source-rows] tr').count();
 await page.goto(origin+'/reportes-rrhh.html#haberes');await $('[data-catalog]').waitFor();assert.equal(calls.length,0);assert.equal(await page.locator('input[type=file]:visible').count(),0);checks.push('Direct task has no file upload or automatic payroll reads');
 await catalog();assert.equal(await $('[data-dataset] option').count(),6);assert.match(await $('[data-catalog-coverage]').innerText(),/6 cargadas de 6/);
 const labels=await $('[data-dataset] option').allTextContents();assert.notEqual(labels[0],labels[1]);await $('[data-selection] summary').click();assert.match(await $('[data-selection-fields]').innerText(),new RegExp(SOURCE_IDS[0]));checks.push('Same-period sources remain distinct and disclose exact source identifier and metadata');
 await $('[data-source-year]').selectOption('2025');assert.equal(await $('[data-dataset] option').count(),1);assert.match(await $('[data-dataset]').innerText(),/Tipo X \(origen\)/);
 await $('[data-source-month]').selectOption('08');assert.equal(await $('[data-dataset] option').count(),0);assert.equal(await $('[data-view-report]').isDisabled(),true);assert.equal(await $('[data-source-empty]').isVisible(),true);checks.push('Combined filters return honest empty state without substituting a different payroll source');
 await $('[data-source-reset]').click();await $('[data-source-type]').selectOption('S');assert.equal(await $('[data-dataset] option').count(),1);assert.match(await $('[data-dataset]').innerText(),/Sueldo anual complementario/);checks.push('Payroll type S uses canonical SAC terminology rather than supplementary payroll');
 await $('[data-source-reset]').click();await $('[data-source-search]').fill('sintetico agosto');assert.equal(await $('[data-dataset] option').count(),2);await $('[data-source-closure]').selectOption('unknown');assert.equal(await $('[data-dataset] option').count(),1);checks.push('Accent-insensitive source search combines with closure filters');
 await view();assert.equal(await rowCount(),3);assert.equal(await $('[data-missing-count]').innerText(),'1');assert.equal(await $('[data-source-count]').innerText(),'2');assert.match(await $('[data-source-rows]').innerText(),/No informado/);assert.equal(await $('[data-roster-load]').isDisabled(),false);checks.push('Concept completeness and source population are separate, roster still receives the selected dataset');
 await page.screenshot({path:out+'/haberes-source-desktop-qa.png',fullPage:true});
 await $('[data-group]').selectOption('discounts');assert.equal(await rowCount(),1);assert.equal(await $('[data-missing-count]').innerText(),'0');const n=calls.length;
 for(const ext of ['pdf','xlsx','csv']){const event=page.waitForEvent('download');await $('[data-format='+ext+']').click();const download=await event;assert.ok(download.suggestedFilename().includes(SOURCE_IDS[0]));await download.saveAs(out+'/descuentos-sinteticos.'+ext);await idle();}
 assert.equal(calls.length,n+3);assert.ok(fs.readFileSync(out+'/descuentos-sinteticos.pdf').subarray(0,4).toString()==='%PDF');const sheets=await readXlsxFile(out+'/descuentos-sinteticos.xlsx');const data=sheets.find(s=>s.sheet==='Datos')?.data,control=sheets.find(s=>s.sheet==='Control')?.data;assert.equal(data.length,2);assert.equal(data[1][4],20.05);assert.ok(control.some(r=>r[0]==='Identificador de conjunto'&&r[1]===SOURCE_IDS[0]));assert.ok(!fs.readFileSync(out+'/descuentos-sinteticos.csv','utf8').includes('Haber sintético'));checks.push('PDF, numeric XLSX and CSV download the exact filter after authenticated reread; filenames distinguish sources');
 await $('[data-group]').selectOption('all');await $('[data-search]').fill('imposible-qa');assert.equal(await rowCount(),0);await $('[data-search]').fill('');checks.push('Empty concept filter remains empty, clearing restores the same queried source');
 const count=downloads.length;hold=true;await $('[data-format=pdf]').click();await until(()=>waiting.length===1);await $('[data-group]').selectOption('discounts');release();await idle();await page.waitForTimeout(120);assert.equal(downloads.length,count);assert.equal(await rowCount(),1);assert.match(await $('[data-state]').innerText(),/Filtro actualizado/);checks.push('Changing concept filters cancels in-flight export without stale errors overriding the new selection');
 await $('[data-source-reset]').click();await view();hold=true;await $('[data-format=pdf]').click();await until(()=>waiting.length===1);await $('[data-dataset]').selectOption(SOURCE_IDS[1]);release();await idle();await page.waitForTimeout(120);assert.equal(downloads.length,count);assert.equal(await $('[data-result]').isVisible(),false);assert.equal(await $('[data-roster-load]').isDisabled(),true);checks.push('Changing source cancels export, clears concept data and invalidates the linked roster');
 await view(SOURCE_IDS[1]);hold=true;await $('[data-format=pdf]').click();await until(()=>waiting.length===1);await $('[data-source-cancel]').click();release();await idle();assert.equal(await $('[data-result]').isVisible(),false);checks.push('Explicit cancellation leaves no automatic retry or download');
 for(const failure of ['content','closure','label','hash']){await fresh();mode=failure;const before=downloads.length;await $('[data-format=pdf]').click();await idle();assert.equal(downloads.length,before);assert.equal(await $('[data-result]').isVisible(),false);assert.match(await $('[data-state]').innerText(),/fuente cambió/);checks.push('Guarded export rejects '+failure+' drift, even when hashes do not change');}
 for(const failure of ['id','malformed','network']){await fresh();mode=failure;await $('[data-format=pdf]').click();await idle();assert.equal(await $('[data-result]').isVisible(),false);checks.push('Invalid or unavailable source fails closed: '+failure);}
 for(const denial of ['401','403']){await fresh();mode=denial;await $('[data-format=pdf]').click();await idle();assert.equal(await $('[data-result]').isVisible(),false);assert.equal(await $('[data-dataset] option').count(),0);assert.equal(await $('[data-login]').isVisible(),true);assert.match(await $('[data-login]').getAttribute('href'),/reportes-rrhh.html%23haberes/);checks.push('Session '+denial+' removes source metadata and offers correct report login return');}
 mode='';catalogMode='truncated';await catalog();assert.match(await $('[data-catalog-coverage]').innerText(),/6 cargadas de 300/);assert.match(await $('[data-catalog-coverage]').innerText(),/no consultan las fuentes anteriores/);catalogMode='empty';await catalog();assert.equal(await $('[data-view-report]').isDisabled(),true);assert.equal(await $('[data-source-empty]').isVisible(),true);checks.push('Truncated and empty catalogues explicitly report coverage and never claim full history');
 await fresh();await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:out+'/haberes-source-mobile-qa.png',fullPage:true});checks.push('Mobile workbench stays within viewport and uses existing reduced-motion support');
 await page.setViewportSize({width:1440,height:1050});await page.getByRole('tab',{name:'Biblioteca',exact:true}).click();assert.equal(await $('[data-dataset] option').count(),0);await page.getByRole('tab',{name:'Haberes y descuentos',exact:true}).click();assert.equal(await $('[data-result]').isVisible(),false);checks.push('Leaving the task clears in-memory source and returning never revives a cached report');
 task='reportes';await page.goto(origin+'/nomina-control.html#reportes');await $('[data-catalog]').waitFor();await fresh();assert.equal(await rowCount(),3);await page.screenshot({path:out+'/nomina-source-desktop-qa.png',fullPage:true});mode='403';await $('[data-format=pdf]').click();await idle();assert.match(await $('[data-login]').getAttribute('href'),/nomina-control.html%23reportes/);checks.push('Nómina shares the source selector and its login returns to the correct payroll task');
 const storage=await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}));assert.ok(!storage.includes(SOURCE_IDS[0]));assert.ok(!storage.includes('Corte SINTÉTICO'));assert.deepEqual(errors,[]);checks.push('No financial source persisted in browser storage and no unhandled JavaScript exceptions');
 fs.writeFileSync(out+'/browser.json',JSON.stringify({checksPassed:checks.length,checks,downloads:downloads.length,errors,liveAssets:live,financialDataSynthetic:true,realMunicipalSessionTested:false,backendWrites:false},null,2));console.log(JSON.stringify({checksPassed:checks.length,downloads:downloads.length,errors,liveAssets:live}));
}catch(error){fs.writeFileSync(out+'/error.txt',String(error.stack));throw error;}finally{release();await browser.close();}
