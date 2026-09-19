/** Isolated browser QA: verified build by default; explicit WIP overlay is separately reported. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {unzipSync,strFromU8} from 'fflate';
import {clockDashboardFixture} from '../tests/fixtures/clock-dashboard-v3-synthetic.js';
import {historicalWorkdayFixture,WORKDAY_CAPTURE} from '../tests/fixtures/continuous-workdays-synthetic.js';
import {reviewFixture,REVIEW_CUT} from '../tests/fixtures/workday-review-synthetic.js';

const workspace=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base=path.resolve(process.env.BROWSER_SOURCE_ROOT||path.join(workspace,'public'));
const published=process.argv.includes('--published');
const out=path.join(workspace,'verification/workday-review'+(published?'-published':''));fs.mkdirSync(out,{recursive:true});
const workdayAssets=['assets/workday-panel.js','assets/workday-panel-model.js','assets/workday-panel.css','assets/workday-export.js','assets/workday-review-causes.js'];
const useWipOverlay=process.env.WORKDAY_REVIEW_WIP_OVERLAY==='1';
const assetMode=useWipOverlay?'explicit-wip-overlay':'built-files-verified';
const assetEvidence={},assetBytes=new Map();
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const origin=published?'https://municipio-junin-friendly.vercel.app':'https://municontrol.test';
const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5l8AAAAASUVORK5CYII=','base64');
const checks=[],errors=[],requests=[],downloads=[];
let browser,mode='ok',nominal=true,externalBlocked=0;
try{
 for(const file of workdayAssets){
  const sourceSha256=sha256(fs.readFileSync(path.join(workspace,file)));
  const servedPath=path.join(useWipOverlay?workspace:base,file),bytes=fs.readFileSync(servedPath),servedSha256=sha256(bytes);
  assetEvidence[file]={sourceSha256,servedSha256,servedPath};
  if(!useWipOverlay)assert.equal(servedSha256,sourceSha256,'Build/source mismatch for '+file+'; rebuild the artifact before verifying it');
  assetBytes.set(file,bytes);
 }
 if(published){assert.equal(useWipOverlay,false);for(const file of [...workdayAssets,'relojes-marcaciones.html']){const response=await fetch(origin+'/'+file,{cache:'no-store',signal:AbortSignal.timeout(20000)});assert.equal(response.status,200);assert.equal(sha256(Buffer.from(await response.arrayBuffer())),sha256(fs.readFileSync(path.join(base,file))),'Published artifact mismatch '+file)}const response=await fetch(origin+'/api/internal-attendance?resource=clock-workdays-v2&source=continuous&site=pm-10&cause=all',{signal:AbortSignal.timeout(20000)});assert.equal(response.status,401);checks.push('published artifacts match the local build and anonymous attendance access is rejected')}
 browser=await chromium.launch({headless:true,...(process.env.WORKDAY_BROWSER_CHANNEL?{channel:process.env.WORKDAY_BROWSER_CHANNEL}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1050},locale:'es-AR',reducedMotion:'reduce',acceptDownloads:true,serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url()),q=url.searchParams,resource=q.get('resource');
  if(/(?:^|\.)tile\.openstreetmap\.org$/.test(url.hostname)||url.pathname.includes('/map-tiles/'))return route.fulfill({status:200,contentType:'image/png',body:pixel});
  if(url.origin!==origin){externalBlocked++;return route.abort()}
  if(!url.pathname.startsWith('/api/')){
   if(published)return route.continue();
   let relative;try{relative=decodeURIComponent(url.pathname).slice(1)}catch{return route.fulfill({status:400,body:''})}
   const dir=useWipOverlay&&workdayAssets.includes(relative)?workspace:base,file=path.resolve(dir,relative);
   if(!file.startsWith(dir+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
   return route.fulfill({status:200,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream',body:assetBytes.get(relative)??fs.readFileSync(file)});
  }
  requests.push({resource,method:request.method(),query:new URLSearchParams(q)});
  if(request.method()!=='GET'){errors.push('Unexpected mutation');return route.abort()}
  if(mode==='expired')return route.fulfill({status:401,json:{ok:false,code:'ATTENDANCE_SESSION_INVALID'}});
  try{
   let data;
   if(resource==='clock-workdays-v2'){
    const laterExport=q.get('pageSize')==='100'&&q.get('page')==='2';
    if(mode==='conflict'&&laterExport)return route.fulfill({status:409,json:{ok:false,code:'ATTENDANCE_CAPTURE_CHANGED'}});
    if(mode==='denied'&&laterExport)return route.fulfill({status:403,json:{ok:false,code:'ATTENDANCE_CAPABILITY_REQUIRED'}});
    if(mode==='partial')return route.fulfill({status:409,json:{ok:false,code:'ATTENDANCE_WORKDAY_SOURCE_INCOMPLETE'}});
    data=await reviewFixture(q,{nominal});
    if(mode==='facet-drift'&&laterExport)data.reviewFacets.counts.source++;
    if(mode==='bad-facet')data.reviewFacets.counts.boundaries='not-a-count';
   }else if(resource==='clock-workdays')data=historicalWorkdayFixture(q,{nominal});
   else if(resource==='clock-dashboard'){data=clockDashboardFixture(q,{nominal});data.dashboard.historicalSnapshotId=WORKDAY_CAPTURE}
   else if(url.pathname==='/api/internal-auth')data={ok:true,authenticated:true,access:{tenantCapabilities:['attendance.read','workforce.employee.read'],platformCapabilities:[],platformRoles:[]}};
   else if(resource==='bootstrap')data={ok:true,capabilities:['attendance.read'],summary:{siteCount:1,deviceCount:1,punchCount:150,rawEventCount:150,pendingReviewCount:150,unmatchedPunchCount:0},features:{}};
   else if(resource==='reported-inventory')data={data:[]};
   else if(resource==='pm10-reception')data={ok:true,version:'pm10-status.v1',checkedAt:'2026-09-15T10:00:00Z',connectorState:'active',baselineRecords:150,summary:{receipts:1,newMarks:3,knownRecords:150,observations:0,lastReceivedAt:'2026-09-15T09:59:00Z',lastCapturedAt:'2026-09-15T09:58:00Z'},records:[],nominalReadAllowed:false,physicalClockVerified:false,payrollModified:false};
   else data={ok:true,resource,data:[],pagination:{page:1,pageSize:25,total:0,pages:0}};
   return route.fulfill({status:200,json:data});
  }catch(error){errors.push(error.message);return route.fulfill({status:500,json:{ok:false,code:'SYNTHETIC_FIXTURE_FAILURE'}})}
 });
 const page=await context.newPage();page.setDefaultTimeout(15000);
 page.on('pageerror',e=>errors.push(e.message));page.on('download',d=>downloads.push(d));
 const el=name=>page.locator('#wd'+name);
 const ready=total=>page.waitForFunction(n=>document.getElementById('clockWorkdays')?.getAttribute('aria-busy')==='false'&&document.getElementById('wdPage')?.textContent.includes(n+' personas/días'),total);
 async function filter(status,search,total){await el('Search').fill(search);await el('State').selectOption(status);await ready(total);assert.ok(await el('Error').isHidden())}
 async function refresh(total){await el('Refresh').click();await ready(total)}
 await page.goto(origin+'/relojes-marcaciones.html');await page.locator('#clockTabWorkdays').click();await ready(114);
 assert.equal(await page.evaluate(()=>navigator.language),'es-AR');
 assert.equal(await el('State').locator('[value="extra_open"]').textContent(),'Marcas extra sin tramo completo');
 checks.push('v2 exposes the new filter in an isolated Spanish-locale context');
 assert.equal(await el('ReviewCounts').locator('button').count(),7);assert.equal(await el('ReviewCounts').locator('[data-wd-cause=all] strong').innerText(),'114');assert.equal(await el('ReviewCounts').locator('[data-wd-cause=boundaries] strong').innerText(),'110');assert.equal(await el('ReviewCounts').locator('[data-wd-cause=pauses] strong').innerText(),'1');checks.push('cause counts cover the whole applied scope before selecting a cause, not the first page');
 await el('ReviewCounts').locator('[data-wd-cause=pauses]').click();await ready(1);assert.match(await el('Rows').innerText(),/Caso pausa incompleta/);await el('Rows').locator('button').click();assert.match(await page.locator('.wd-review-guidance').innerText(),/No completes el regreso/);assert.match(await el('ReviewNotice').innerText(),/111 de 114/);checks.push('a cause opens matching evidence and an explicit next step, without changing times or approvals');
 await el('ReviewCounts').locator('[data-wd-cause=boundaries]').click();await ready(110);const causeDownload=page.waitForEvent('download');await el('Csv').click();const causeFile=await causeDownload;await causeFile.saveAs(path.join(out,'cause-boundaries-synthetic.csv'));const causeCsv=fs.readFileSync(path.join(out,'cause-boundaries-synthetic.csv'),'utf8');assert.equal(causeCsv.trim().split(/\r?\n/).length,111);assert.match(causeCsv,/Causa seleccionada/);assert.match(causeCsv,/no permite completar horas ni presumir una ausencia/);checks.push('cause export includes all 110 matching person-days and guidance on one verified cut');
 mode='facet-drift';const beforeFacet=downloads.length;await el('Csv').click();await el('Status').filter({hasText:'Cambió el corte'}).waitFor();assert.equal(downloads.length,beforeFacet);mode='ok';await refresh(110);checks.push('changed cause counts on page two prevent any partial export');
 mode='bad-facet';await el('Refresh').click();await el('Error').waitFor();assert.equal(await el('ReviewCounts').locator('button').count(),0);assert.equal(await el('Rows').innerText(),'');mode='ok';await refresh(110);checks.push('malformed cause metadata removes previous counters and rows rather than showing misleading results');
 await el('ReviewCounts').locator('[data-wd-cause=all]').click();await ready(114);
 await el('Review').screenshot({path:path.join(out,'review-causes-desktop-synthetic.png')});for(const width of [390,320]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.ok(await el('ReviewCounts').locator('button').first().evaluate(n=>n.getBoundingClientRect().height>=44));await el('Review').screenshot({path:path.join(out,'review-causes-'+width+'-synthetic.png')});}await page.setViewportSize({width:1440,height:1050});checks.push('cause cards remain readable and actionable at 390 and 320 pixels without page overflow');



 await filter('extra_open','',110);await el('Next').click();await ready(110);
 assert.match(await el('Rows').innerText(),/Agente abierto 026/);
 assert.match(await el('Metrics').innerText(),/02:00:00/);
 const second=requests.filter(r=>r.resource==='clock-workdays-v2').at(-1);
 assert.equal(second.query.get('status'),'extra_open');assert.equal(second.query.get('page'),'2');assert.equal(second.query.get('snapshot'),REVIEW_CUT);
 checks.push('whole-period open-extra filter and summary are preserved on page two');

 await filter('extra_open','Agente abierto',107);
 assert.match(await el('Metrics').innerText(),/No reconstruido/);assert.doesNotMatch(await el('Rows').innerText(),/00:00:00/);
 const firstButton=el('Rows').locator('button').first();await firstButton.focus();await page.keyboard.press('Enter');
 assert.equal(await firstButton.getAttribute('aria-expanded'),'true');
 assert.ok(await page.locator('.wd-sequence').first().isVisible());assert.match(await page.locator('.wd-sequence').first().innerText(),/Entrada de tiempo extra.*Marca por revisar/s);
 checks.push('isolated code4 is visible without claiming zero hours; keyboard reveals its event immediately');

 const extraExportStart=requests.length;
 let pending=page.waitForEvent('download');await el('Csv').click();let download=await pending;
 const csvPath=path.join(out,'extra-open-synthetic.csv');await download.saveAs(csvPath);
 const csv=fs.readFileSync(csvPath,'utf8');assert.equal(csv.trim().split(/\r?\n/).length,108);assert.match(csv,/No reconstruido/);assert.ok(csv.includes(REVIEW_CUT));
 pending=page.waitForEvent('download');await el('Xlsx').click();download=await pending;
 const xlsxPath=path.join(out,'extra-open-synthetic.xlsx');await download.saveAs(xlsxPath);
 const zipped=unzipSync(fs.readFileSync(xlsxPath));assert.equal((strFromU8(zipped['xl/worksheets/sheet1.xml']).match(/<row r=/g)||[]).length,108);
 assert.match(strFromU8(zipped['xl/worksheets/sheet3.xml']),/Marcas extra sin tramo completo/);
 assert.ok(requests.slice(extraExportStart).filter(r=>r.query.get('pageSize')==='100').every(r=>r.query.get('status')==='extra_open'&&r.query.get('snapshot')===REVIEW_CUT));
 checks.push('CSV and Excel export all 107 filtered rows on one cut with unknown durations as text');

 await filter('extra_open','Caso mixto',1);assert.match(await el('Rows').innerText(),/02:00:00/);assert.match(await el('Rows').innerText(),/1 marca sin tramo completo/);
 await el('Rows').locator('button').click();assert.equal(await page.locator('.wd-sequence .wd-calculated').count(),2);assert.equal(await page.locator('.wd-sequence .wd-pending').count(),1);
 checks.push('a calculated extra interval and an unmatched later entry remain visibly separate');
 await filter('extra_open','Caso salida aislada',1);await el('Rows').locator('button').click();
 assert.match(await page.locator('.wd-sequence').innerText(),/Salida de tiempo extra/);assert.match(await page.locator('.wd-detail').innerText(),/Salida sin entrada asociada/);
 checks.push('orphan code5 is described as a missing entry rather than a missing exit');
 await filter('extra_open','Caso pausa incompleta',1);assert.match(await el('Rows').innerText(),/No reconstruido/);await el('Rows').locator('button').click();
 assert.match(await page.locator('.wd-detail').innerText(),/Pausa sin regreso registrado/);assert.equal(await page.locator('.wd-sequence li').count(),3);
 checks.push('incomplete pause retains all three events and produces no reconstructed duration');
 await filter('all','Caso sin pausa',1);await el('Rows').locator('button').click();assert.match(await page.locator('.wd-detail').innerText(),/pausa 00:00:00/);
 checks.push('a genuine zero pause in a calculated interval remains zero');

 await filter('all','Caso secuencia completa',1);await el('Rows').locator('button').click();
 const sequence=page.locator('.wd-sequence');assert.equal(await sequence.locator('li').count(),6);
 assert.match(await sequence.innerText(),/10:00:00.*Salida a pausa.*10:15:00.*Regreso de pausa/s);
 assert.equal(await page.locator('.wd-detail details').getAttribute('open'),null);
 assert.match(await el('Status').innerText(),/Referencia no homologada · sin aprobación salarial/);
 checks.push('entry, pause start/end, ordinary exit and extra boundaries are visible without expanding technical evidence');
 await page.addStyleTag({content:'body:after{content:"QA · DATOS SINTÉTICOS";position:fixed;right:10px;bottom:10px;z-index:9999;background:#123649;color:white;padding:8px;font:11px sans-serif}'});
 async function frame(filename){await page.evaluate(()=>{const detail=document.querySelector('.wd-detail'),bar=document.querySelector('.topbar');window.scrollBy({top:detail.getBoundingClientRect().top-(bar?.getBoundingClientRect().height||0)-40,behavior:'instant'})});await page.screenshot({path:path.join(out,filename)})}
 await frame('desktop-synthetic.png');await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.ok(await page.locator('.wd-detail').evaluate(node=>{const a=node.getBoundingClientRect(),b=node.closest('.ck-table-scroll').getBoundingClientRect();return a.width<=b.width+1&&a.left>=b.left-1&&a.right<=b.right+1}));
 await frame('mobile-synthetic.png');checks.push('Spanish desktop/mobile sequence is bounded, readable and keyboard-accessible');

 await page.locator('#clockSource').selectOption('historical');await ready(107);assert.equal(await el('State').locator('[value="extra_open"]').count(),0);
 assert.equal(requests.filter(r=>r.resource==='clock-workdays').at(-1).query.get('status'),'all');
 await page.locator('#clockSource').selectOption('continuous');await page.locator('#clockTabWorkdays').click();await ready(114);checks.push('historical v1 removes the v2-only filter and returning to continuous resets it');
 await filter('extra_open','Agente abierto',107);mode='conflict';const before=downloads.length;await el('Csv').click();
 await el('Status').filter({hasText:/corte cambió|Cambió el corte/}).waitFor();assert.equal(downloads.length,before);
 mode='ok';await refresh(107);checks.push('revision conflict on export page two produces no partial file');
 mode='partial';await el('Refresh').click();await el('Error').filter({hasText:'Recepción en curso'}).waitFor();assert.equal(await el('Rows').innerText(),'');
 mode='ok';await refresh(107);checks.push('incomplete receipt clears the calculation without changing source');
 mode='denied';await el('Csv').click();await el('Status').filter({hasText:'perfil ya no permite'}).waitFor();assert.equal(downloads.length,before);assert.equal(await el('Rows').innerText(),'');
 checks.push('revocation on export page two removes nominal rows and downloads nothing');
 mode='ok';nominal=false;await page.locator('#clockRefresh').click();await ready(114);assert.ok(await el('Search').isDisabled());assert.doesNotMatch(await el('Rows').innerText(),/Agente abierto|Caso |Legajo/);
 await el('State').selectOption('extra_open');await ready(110);checks.push('non-nominal access retains the evidence filter without exposing identities');
 mode='expired';await el('Refresh').click();await page.waitForURL(url=>url.origin===origin&&url.pathname===(published?'/acceso':'/login.html')&&url.searchParams.get('next')==='relojes-marcaciones.html');checks.push('expired session clears the panel and redirects to login');
 assert.deepEqual(errors,[]);
 const report={checksPassed:checks.length,checks,errors,syntheticApi:true,syntheticTiles:true,municipalSessionTested:false,productionAssetsTested:published,privateApisIntercepted:true,backendWrites:false,base,
  assetMode,wipOverlayEnabled:useWipOverlay,assets:assetEvidence,locale:'es-AR',externalRequestsBlocked:externalBlocked,
  browserChannel:process.env.WORKDAY_BROWSER_CHANNEL||'chromium',browser:browser.version()};
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');fs.rmSync(path.join(out,'failure.json'),{force:true});console.log(JSON.stringify(report,null,2));
}catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({checks,errors,base,assetMode,wipOverlayEnabled:useWipOverlay,assets:assetEvidence,message:error.message},null,2));throw error}
finally{await browser?.close()}
