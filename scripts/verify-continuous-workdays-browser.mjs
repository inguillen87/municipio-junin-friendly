/** Browser acceptance: fresh headless context, synthetic APIs/tiles, no outbound requests. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {chromium} from 'playwright';
import {clockDashboardFixture,CONTINUOUS_CUT} from '../tests/fixtures/clock-dashboard-v3-synthetic.js';
import {continuousWorkdayFixture,historicalWorkdayFixture,WORKDAY_CUT,WORKDAY_NEXT_CUT,WORKDAY_CAPTURE} from '../tests/fixtures/continuous-workdays-synthetic.js';

const base=path.resolve(process.env.BROWSER_SOURCE_ROOT || 'public');
const out=path.resolve('verification/continuous-workdays');fs.mkdirSync(out,{recursive:true});
const origin='https://municontrol.test';
const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5l8AAAAASUVORK5CYII=','base64');
const checks=[],errors=[],requests=[],downloads=[];
let browser,mode='ok',cut=WORKDAY_CUT,nominal=true,unplaced=false,externalBlocked=0,releaseDelayed,enteredDelay;
const workRequests=()=>requests.filter(r=>r.resource==='clock-workdays-v2');
try {
 browser=await chromium.launch({headless:true,...(process.env.WORKDAY_BROWSER_CHANNEL?{channel:process.env.WORKDAY_BROWSER_CHANNEL}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true,serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url()),q=url.searchParams,resource=q.get('resource');
  if(/(?:^|\.)tile\.openstreetmap\.org$/.test(url.hostname) || /map-tiles/.test(url.pathname))
   return route.fulfill({status:200,contentType:'image/png',body:pixel});
  if(url.origin!==origin){externalBlocked++;return route.abort()}
  if(!url.pathname.startsWith('/api/')){
   let file;try{file=path.resolve(base,'.'+decodeURIComponent(url.pathname))}catch{return route.fulfill({status:400,body:''})}
   if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
   return route.fulfill({status:200,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream',body:fs.readFileSync(file)});
  }
  requests.push({resource,method:request.method(),query:new URLSearchParams(q)});
  if(request.method()!=='GET'){errors.push('Unexpected API mutation');return route.abort()}
  if(mode==='expired')return route.fulfill({status:401,json:{ok:false,code:'ATTENDANCE_SESSION_INVALID'}});
  let data;
  try {
   if(resource==='clock-workdays-v2'){
    if(mode==='export-wait' && q.get('pageSize')==='100' && q.get('page')==='2'){
     const delayed=new Promise(resolve=>releaseDelayed=resolve);enteredDelay?.();await delayed;
    }
    if(mode==='partial')return route.fulfill({status:409,json:{ok:false,code:'ATTENDANCE_WORKDAY_SOURCE_INCOMPLETE'}});
    if(mode==='denied' || mode==='export-denied' && q.get('pageSize')==='100' && q.get('page')==='2')
     return route.fulfill({status:403,json:{ok:false,code:'ATTENDANCE_CAPABILITY_REQUIRED'}});
    if(mode==='export-conflict' && q.get('pageSize')==='100' && q.get('page')==='2')cut=WORKDAY_NEXT_CUT;
    if(q.has('snapshot') && q.get('snapshot')!==cut)return route.fulfill({status:409,json:{ok:false,code:'ATTENDANCE_CAPTURE_CHANGED'}});
    data=await continuousWorkdayFixture(q,{nominal,cut,unplaced});
   } else if(resource==='clock-workdays')data=historicalWorkdayFixture(q,{nominal});
   else if(resource==='clock-dashboard'){
    data=clockDashboardFixture(q,{nominal});data.dashboard.historicalSnapshotId=WORKDAY_CAPTURE;
   } else if(url.pathname==='/api/internal-auth')data={ok:true,authenticated:true,access:{tenantCapabilities:['attendance.read','workforce.employee.read'],platformCapabilities:[],platformRoles:[]}};
   else if(resource==='bootstrap')data={ok:true,capabilities:['attendance.read'],summary:{siteCount:1,deviceCount:1,punchCount:153,rawEventCount:153,pendingReviewCount:153,unmatchedPunchCount:3},features:{}};
   else if(resource==='reported-inventory')data={data:[]};
   else if(resource==='pm10-reception')data={ok:true,version:'pm10-status.v1',checkedAt:'2026-09-15T10:00:00Z',connectorState:'active',baselineRecords:150,summary:{receipts:1,newMarks:3,knownRecords:150,observations:0,lastReceivedAt:'2026-09-15T09:59:00Z',lastCapturedAt:'2026-09-15T09:58:00Z'},records:[],nominalReadAllowed:false,physicalClockVerified:false,payrollModified:false};
   else data={ok:true,resource,data:[],pagination:{page:1,pageSize:25,total:0,pages:0}};
   return route.fulfill({status:200,json:data});
  } catch(error){errors.push('Synthetic fixture: '+error.message);return route.fulfill({status:500,json:{ok:false,code:'SYNTHETIC_FIXTURE_FAILURE'}})}
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('download',download=>downloads.push(download));
 page.setDefaultTimeout(12000);
 const value=id=>page.locator('#wd'+id);
 async function ready(total=107){await page.waitForFunction(n=>document.getElementById('wdPage')?.textContent.includes(n+' personas/días') && document.getElementById('clockWorkdays')?.getAttribute('aria-busy')==='false',total)}
 async function openWorkdays(){await page.locator('#clockTabWorkdays').click();await ready()}
 async function refresh(total=107){await value('Refresh').click();await ready(total);assert.ok(await value('Error').isHidden())}
 async function filter(state,search='',total=107){await value('Search').fill(search);await value('State').selectOption(state);await value('SearchButton').click();await ready(total)}
 await page.goto(origin+'/relojes-marcaciones.html');await page.locator('#clockTabWorkdays').waitFor({state:'visible'});await openWorkdays();
 assert.equal(workRequests()[0].query.has('snapshot'),false);assert.equal(workRequests()[0].query.get('source'),'continuous');
 assert.notEqual(WORKDAY_CUT,CONTINUOUS_CUT);checks.push('first continuous workday read does not reuse dashboard revision');
 assert.match(await value('Status').innerText(),/Referencia no homologada · sin aprobación salarial/);
 await value('Next').click();await page.waitForFunction(()=>document.getElementById('wdPage').textContent.startsWith('Página 2'));
 assert.equal(workRequests().at(-1).query.get('snapshot'),WORKDAY_CUT);await value('Prev').click();await ready();
 checks.push('subsequent pages use the workday revision');

 await value('Rows').locator('button').first().click();const detail=page.locator('.wd-detail').first();
 assert.match(await detail.innerText(),/pausa 00:15:00/);assert.match(await detail.innerText(),/Tiempo extra.*15:00:00/);
 assert.match(await detail.innerText(),/Referencias/);await detail.locator('summary').click();
 assert.match(await detail.innerText(),/Captura histórica/);assert.match(await detail.innerText(),/Recepción/);
 checks.push('detail explains ordinary intervals, pauses and extra through stable event references');

 let pending=page.waitForEvent('download');await value('Csv').click();let download=await pending;
 await download.saveAs(path.join(out,'continuous-synthetic.csv'));
 const csv=fs.readFileSync(path.join(out,'continuous-synthetic.csv'),'utf8');
 assert.equal(csv.trim().split(/\r?\n/).length,108);assert.ok(csv.includes(WORKDAY_CUT));
 assert.ok(workRequests().filter(r=>r.query.get('pageSize')==='100').every(r=>r.query.get('snapshot')===WORKDAY_CUT));
 pending=page.waitForEvent('download');await value('Xlsx').click();download=await pending;
 await download.saveAs(path.join(out,'continuous-synthetic.xlsx'));
 const zipped=unzipSync(fs.readFileSync(path.join(out,'continuous-synthetic.xlsx')));
 assert.equal((strFromU8(zipped['xl/worksheets/sheet1.xml']).match(/<row r=/g)||[]).length,108);
 assert.equal((strFromU8(zipped['xl/worksheets/sheet4.xml']).match(/<row r=/g)||[]).length,218);
 checks.push('CSV and five-sheet XLSX export all 107 person-days and 217 events on one workday revision');

 mode='export-wait';const beforeCancel=downloads.length,reachedDelay=new Promise(resolve=>enteredDelay=resolve);
 await value('Csv').click();await reachedDelay;await page.locator('#clockTabOverview').click();
 assert.ok(await page.locator('#clockWorkdays').isHidden());mode='ok';releaseDelayed();
 await page.waitForFunction(()=>document.getElementById('clockWorkdays').getAttribute('aria-busy')==='false');
 assert.equal(downloads.length,beforeCancel);await openWorkdays();
 checks.push('leaving Jornadas cancels an in-flight export and ignores its late response');

 mode='export-conflict';const beforeConflict=downloads.length;await value('Csv').click();
 await value('Status').filter({hasText:/corte cambió|Cambió el corte/}).waitFor();
 assert.equal(downloads.length,beforeConflict);mode='ok';const requestsBefore=workRequests().length;await refresh();
 assert.equal(workRequests()[requestsBefore].query.has('snapshot'),false);
 checks.push('a new receipt invalidates export without a partial file; refresh acquires a new revision');

 mode='partial';await value('Refresh').click();await value('Error').filter({hasText:'Recepción en curso'}).waitFor();
 assert.equal(await value('Rows').innerText(),'');assert.equal(await value('Metrics').innerText(),'');assert.ok(await value('Csv').isDisabled());
 assert.equal(requests.filter(r=>r.resource==='clock-workdays').length,0);mode='ok';await refresh();
 checks.push('incomplete batch clears the continuous calculation without historical fallback');

 await filter('review','',1);assert.match(await value('Rows').innerText(),/prueba 107/);
 await filter('extra','',1);assert.match(await value('Rows').innerText(),/02:00:00/);
 await filter('all','9106',1);assert.match(await value('Rows').innerText(),/prueba 106/);
 await filter('all','',107);await page.locator('#clockTabWorkdays').focus();await page.keyboard.press('ArrowRight');
 assert.ok(await page.locator('#clockOverview').isVisible());await page.keyboard.press('ArrowLeft');assert.ok(await page.locator('#clockWorkdays').isVisible());
 assert.equal(await page.locator('#clockSource').inputValue(),'continuous');
 checks.push('whole-period search, sequence filters and keyboard tabs preserve continuous source');

 await page.locator('#clockSource').selectOption('historical');await ready();
 const legacy=requests.filter(r=>r.resource==='clock-workdays').at(-1);assert.ok(legacy);assert.equal(legacy.query.get('snapshot'),WORKDAY_CAPTURE);
 await value('Rows').locator('button').first().click();assert.match(await page.locator('.wd-detail').first().innerText(),/Filas /);
 await page.locator('#clockSource').selectOption('continuous');await openWorkdays();
 assert.equal(workRequests().at(-1).query.has('snapshot'),false);checks.push('historical v1 keeps capture UUID and ordinals; returning to continuous creates a fresh workday read');

 unplaced=true;cut='dddddddd-dddd-5ddd-8ddd-dddddddddddf';await refresh(108);
 assert.match(await value('Status').innerText(),/1 registros de contexto/);await filter('review','',2);
 assert.match(await value('Rows').innerText(),/prueba 108/);
 const blocked=value('Rows').locator('tr').filter({hasText:'Agente de prueba 108'}).first();assert.match(await blocked.innerText(),/00:00:00/);
 checks.push('unplaceable source records are visible and do not produce hours for the affected device');

 await filter('all','',108);await page.addStyleTag({content:'body:after{content:"QA · DATOS SINTÉTICOS";position:fixed;right:12px;bottom:10px;z-index:9999;color:white;background:#123649;padding:8px;font:11px sans-serif}'});
 async function frame(selector,filename){
  await page.evaluate(target=>{const item=document.querySelector(target),bar=document.querySelector('.topbar');
   window.scrollBy({top:item.getBoundingClientRect().top-((bar?.getBoundingClientRect().height||0)+80),behavior:'instant'});
  },selector);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.screenshot({path:path.join(out,filename)});
 }
 await value('Rows').locator('button').first().click();
 await frame('#clockWorkdays','desktop-synthetic.png');
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
 await page.locator('.wd-detail').first().locator('summary').click();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.ok(await page.locator('.wd-detail').first().evaluate(element=>{
  const detail=element.getBoundingClientRect(),visible=element.closest('.ck-table-scroll').getBoundingClientRect();
  return detail.width<=visible.width+1 && detail.left>=visible.left-1 && detail.right<=visible.right+1;
 }),'Mobile workday detail must fit the visible table scroller, including full timestamps and references');
 await frame('#clockWorkdays','mobile-overview-synthetic.png');
 await frame('.wd-detail','mobile-synthetic.png');
 checks.push('desktop and mobile details stay bounded with reduced motion');

 mode='export-denied';const beforeDenied=downloads.length;await value('Csv').click();
 await value('Status').filter({hasText:/perfil ya no permite/}).waitFor();assert.equal(downloads.length,beforeDenied);
 assert.equal(await value('Rows').innerText(),'');assert.ok(await value('Csv').isDisabled());
 checks.push('nominal access revoked during export clears cached rows and produces no download');
 mode='ok';nominal=false;await page.locator('#clockRefresh').click();await ready(108);
 assert.ok(await value('Search').isDisabled());assert.doesNotMatch(await value('Rows').innerText(),/Agente de prueba|Legajo /);
 checks.push('anonymous response disables nominal search and renders pseudonyms only');
 mode='expired';await value('Refresh').click();await page.waitForURL('**/login.html?**');
 checks.push('expired session clears the panel and redirects to login');
 assert.deepEqual(errors,[]);assert.ok(requests.every(r=>r.method==='GET'));
 const report={checksPassed:checks.length,checks,errors,syntheticApi:true,syntheticTiles:true,
  municipalSessionTested:false,backendWrites:false,externalRequestsBlocked:externalBlocked,browser:browser.version()};
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');
 fs.rmSync(path.join(out,'failure.json'),{force:true});console.log(JSON.stringify(report,null,2));
} catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({checks,errors,message:error.message},null,2));throw error}
finally{if(browser)await browser.close()}
