import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {clockDashboardFixture,CONTINUOUS_CUT,HISTORICAL_CAPTURE} from '../tests/fixtures/clock-dashboard-v3-synthetic.js';
import {summarizeWorkdays,WORKDAY_RULES,CONTINUOUS_WORKDAY_RULES} from '../lib/attendance-workdays.js';

const base=path.resolve('public'),out=path.resolve('verification/clock-dashboard-v3');
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((request,response)=>{
 let file;try{file=path.resolve(base,'.'+decodeURIComponent(new URL(request.url,'http://localhost').pathname))}catch{return response.writeHead(400).end()}
 if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return response.writeHead(404).end();
 response.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');
 response.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const checks=[],errors=[],requests=[],downloads=[];
let browser,mode='ok',cut=CONTINUOUS_CUT,deferred=null,nominal=true;
const nextCut='aaaaaaab-aaaa-5aaa-8aaa-aaaaaaaaaaaa';
const receipt={ok:true,version:'pm10-status.v1',checkedAt:'2026-09-14T15:00:00Z',connectorState:'active',baselineRecords:150,
 summary:{receipts:1,newMarks:3,knownRecords:150,observations:0,lastReceivedAt:'2026-09-14T14:59:00Z',lastCapturedAt:'2026-09-14T14:58:00Z'},
 records:[],nominalReadAllowed:false,physicalClockVerified:false,payrollModified:false};
try{
 browser=await chromium.launch({headless:true,...(process.env.CLOCK_BROWSER_CHANNEL?{channel:process.env.CLOCK_BROWSER_CHANNEL}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1050},acceptDownloads:true});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url()),q=url.searchParams,resource=q.get('resource');
  if(url.origin!==origin)return route.abort();
  if(!url.pathname.startsWith('/api/'))return route.continue();
  requests.push({resource,method:request.method(),query:new URLSearchParams(q)});
  let result;
  if(resource==='clock-dashboard'){
   if(mode==='wait')await new Promise(resolve=>deferred=resolve);
   if(mode==='network')return route.abort();
   if(mode==='denied')return route.fulfill({status:403,json:{ok:false}});
   if(mode==='export-conflict'&&q.get('pageSize')==='100'&&q.get('page')==='2')cut=nextCut;
   if(q.get('source')==='continuous'&&q.has('snapshot')&&q.get('snapshot')!==cut)return route.fulfill({status:409,json:{ok:false,code:'ATTENDANCE_CAPTURE_CHANGED'}});
   result=clockDashboardFixture(q,{nominal,cut:q.get('source')==='continuous'?cut:undefined});
   if(mode==='no-historical'&&q.get('source')==='historical'){
    result.dashboard.historicalSnapshotId=null;result.collection.status='no_data';result.collection.importComplete=false;
    result.summary={marks:0,people:0,mappedMarks:0,unmappedMarks:0,sourceRows:0,observedRows:0,latestMarkAt:null};
    result.records=[];result.daily=[];result.hourly=[];result.pagination.total=0;result.pagination.pages=0;
   }
  }else if(url.pathname==='/api/internal-auth')result={ok:true,authenticated:true,access:{tenantCapabilities:['attendance.read','workforce.employee.read'],platformCapabilities:[],platformRoles:[]}};
  else if(resource==='bootstrap')result={ok:true,capabilities:['attendance.read'],summary:{siteCount:1,deviceCount:1,punchCount:153,rawEventCount:153,pendingReviewCount:153,unmatchedPunchCount:3},features:{}};
  else if(resource==='pm10-reception')result=receipt;
  else if(resource==='reported-inventory')result={data:[]};
  else if(['clock-workdays','clock-workdays-v2'].includes(resource)){
   const v2=resource==='clock-workdays-v2';
   result={ok:true,version:v2?'clock-workdays.v2':'clock-workdays.v1',snapshotId:v2?'cccccccc-cccc-5ccc-8ccc-cccccccccccc':q.get('snapshot'),payrollEligible:false,
    site:{key:'pm-10',label:'Punto de prueba'},timezone:'America/Argentina/Mendoza',nominalReadAllowed:nominal,
    filters:{from:q.get('from'),to:q.get('to'),search:q.get('search'),status:q.get('status')},rows:[],summary:summarizeWorkdays([]),periodSummary:summarizeWorkdays([]),
    pagination:{total:0,page:Number(q.get('page')),pages:0,pageSize:Number(q.get('pageSize'))},rules:{...(v2?CONTINUOUS_WORKDAY_RULES:WORKDAY_RULES),profileSupported:false},
    ...(v2?{sourceMode:'continuous',collection:{sourceComplete:true},coverageCertified:false,homologationStatus:'unverified',approvalStatus:'not_approved',
     observations:[],observationSummary:{unplaced:0,placed:0,returned:0,hasMore:false,scope:'context_including_undated'}}:{})};
  }
  else result={ok:true,resource,data:[],pagination:{page:1,pageSize:25,total:0,pages:0}};
  return route.fulfill({status:200,json:result}).catch(()=>{});
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('download',download=>downloads.push(download));
 await page.clock.install();
 await page.goto(origin+'/relojes-marcaciones.html');
 const root=page.locator('#clockOperations'),value=id=>page.locator('#clock'+id);
 async function ready(){await page.waitForFunction(()=>document.getElementById('clockOperations').dataset.state==='ready'&&document.getElementById('clockOperations').getAttribute('aria-busy')==='false')}
 async function refresh(){await value('Refresh').click();await ready()}
 await ready();assert.equal(await value('Marks').textContent(),'153');assert.equal(await value('Source').inputValue(),'continuous');
 const ids=await page.locator('[id^="clock"]').evaluateAll(elements=>elements.map(element=>element.id));assert.equal(new Set(ids).size,ids.length);
 assert.ok(await value('TabWorkdays').isEnabled());assert.equal(requests.filter(r=>r.resource==='clock-workdays').length,0);
 checks.push('continuous source selected with 153 synthetic marks; workdays are available without querying while their panel is hidden');
 assert.match(await value('Attempt').textContent(),/No informado/);assert.match(await value('Backlog').textContent(),/No informado/);
 assert.match(await value('Latency').textContent(),/60 segundos/);checks.push('missing collector telemetry is not zero; measured receipt delay is separate');

 await value('Next').click();await ready();
 let last=requests.filter(r=>r.resource==='clock-dashboard').at(-1);
 assert.equal(last.query.get('snapshot'),cut);assert.equal(last.query.get('from'),'2026-09-10');assert.equal(last.query.get('page'),'2');
 checks.push('normal page navigation pins the source revision and resolved dates');
 cut=nextCut;await value('Next').click();await value('Error').filter({hasText:'Cambió la fuente'}).waitFor();
 assert.equal(await value('Marks').textContent(),'—');assert.equal(await value('Rows').textContent(),'');assert.ok(await value('ExportAll').isDisabled());
 await refresh();assert.match(await value('Page').textContent(),/Página 1/);checks.push('new receipt invalidates pagination and refresh explicitly opens a new cut');

 await value('Search').fill('prueba 47');await value('SearchApply').click();await ready();
 assert.equal(await value('Marks').textContent(),'3');assert.equal(await value('Rows').locator('tr').count(),3);
 await value('Search').fill('');await value('SearchApply').click();await ready();checks.push('filter, totals and table use the same source');
 const download=page.waitForEvent('download');await value('ExportAll').click();const csv=await download;
 await csv.saveAs(path.join(out,'synthetic-continuous.csv'));
 const csvText=fs.readFileSync(path.join(out,'synthetic-continuous.csv'),'utf8');
 assert.equal(csvText.trim().split(/\r?\n/).length,154);assert.ok(csvText.includes(cut));
 assert.match(csvText,/Histórico y recepciones confirmadas/);checks.push('complete CSV preserves all 153 events including repeated source ordinals');
 await page.waitForFunction(()=>document.getElementById('clockOperations').getAttribute('aria-busy')==='false');
 cut=CONTINUOUS_CUT;await refresh();mode='export-conflict';const before=downloads.length;
 await value('ExportAll').click();await value('ExportStatus').filter({hasText:'Cambió la fuente'}).waitFor();
 assert.equal(downloads.length,before);checks.push('receipt during export produces no partial download');mode='ok';await refresh();

 await value('From').fill('2026-09-09');await value('To').fill('2026-09-11');await value('Apply').click();await ready();
 await value('TabWorkdays').click();await ready();assert.equal(await value('Source').inputValue(),'continuous');
 await page.waitForFunction(()=>document.getElementById('clockWorkdays').getAttribute('aria-busy')==='false');
 assert.equal(requests.filter(r=>r.resource==='clock-workdays-v2').at(-1).query.has('snapshot'),false);
 assert.ok(await value('Workdays').isVisible());
 await value('Source').selectOption('historical');await ready();assert.equal(await value('Marks').textContent(),'150');
 assert.equal(await value('Source').inputValue(),'historical');assert.ok(await value('Workdays').isVisible());
 last=requests.filter(r=>r.resource==='clock-dashboard').at(-1);
 assert.equal(last.query.get('source'),'historical');assert.equal(last.query.get('site'),'pm-10');assert.equal(last.query.get('from'),'2026-09-09');assert.equal(last.query.get('to'),'2026-09-11');assert.equal(last.query.has('snapshot'),false);
 await page.waitForFunction(()=>document.getElementById('clockWorkdays').getAttribute('aria-busy')==='false');
 const workdayQuery=requests.filter(r=>r.resource==='clock-workdays').at(-1).query;
 assert.equal(workdayQuery.get('snapshot'),HISTORICAL_CAPTURE);assert.equal(workdayQuery.get('from'),'2026-09-09');assert.equal(workdayQuery.get('to'),'2026-09-11');
 assert.match(await value('SourceKind').textContent(),/Captura histórica/);assert.match(await value('WorkdaysNote').textContent(),/Se conserva el punto y período/);
 assert.ok(await value('TabWorkdays').isEnabled());checks.push('workdays retain continuous source and begin without dashboard revision; explicit historical selection preserves dates and loads the physical capture');
 await value('Source').selectOption('continuous');await ready();assert.ok(await value('Workdays').isHidden());
 const workdaysBeforeMissing=requests.filter(r=>r.resource==='clock-workdays').length;
 mode='no-historical';await value('Source').selectOption('historical');await ready();
 assert.ok(await value('Workdays').isVisible());assert.match(await value('WorkdaysNote').textContent(),/No hay una captura histórica/);assert.match(await value('WorkdaysNote').textContent(),/recepciones confirmadas/);
 assert.equal(requests.filter(r=>r.resource==='clock-workdays').length,workdaysBeforeMissing);assert.equal(await page.locator('#wdRows').textContent(),'');assert.ok(await page.locator('#wdXlsx').isDisabled());
 mode='ok';await value('Refresh').click();await ready();
 await page.waitForFunction(()=>document.getElementById('clockWorkdays').getAttribute('aria-busy')==='false');
 assert.ok(requests.filter(r=>r.resource==='clock-workdays').length>workdaysBeforeMissing);
 checks.push('missing historical capture explains how to recover, clears old workdays and disables export without inventing a workday request; refresh recovers');
 await value('Source').selectOption('continuous');await ready();
 await value('TabRecords').focus();await page.keyboard.press('Home');await ready();assert.equal(await value('TabWorkdays').getAttribute('aria-selected'),'true');assert.equal(await value('Source').inputValue(),'continuous');
 await page.keyboard.press('End');assert.equal(await value('TabIssues').getAttribute('aria-selected'),'true');
 checks.push('keyboard navigation reaches workdays without changing the selected source');
 await value('Source').selectOption('continuous');await ready();

 await value('TabRecords').click();await value('Search').fill('unsubmitted');
 const countBefore=requests.filter(r=>r.resource==='clock-dashboard').length;
 await page.clock.fastForward(60001);assert.equal(requests.filter(r=>r.resource==='clock-dashboard').length,countBefore);
 assert.equal(await value('Search').inputValue(),'unsubmitted');assert.ok(await value('Search').evaluate(e=>e===document.activeElement));
 checks.push('automatic refresh preserves focused fields and unsent search');
 await value('Search').fill('');await page.evaluate(()=>document.activeElement.blur());
 await page.clock.fastForward(60001);await ready();assert.ok(requests.filter(r=>r.resource==='clock-dashboard').length>countBefore);
 checks.push('visible idle first page refreshes without overlapping requests');
 const visibleCount=requests.filter(r=>r.resource==='clock-dashboard').length;
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))});
 await page.clock.fastForward(60001);assert.equal(requests.filter(r=>r.resource==='clock-dashboard').length,visibleCount);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))});
 await ready();assert.ok(requests.filter(r=>r.resource==='clock-dashboard').length>visibleCount);
 checks.push('hidden page pauses requests and resumes on visibility');

 mode='network';await value('Refresh').click();await value('Error').waitFor({state:'visible'});
 assert.equal(await value('Checked').textContent(),'—');assert.equal(await value('Rows').textContent(),'');assert.match(await value('Mode').textContent(),/Sin confirmación/);
 mode='ok';await refresh();checks.push('network failure clears former results and query time; manual retry recovers');
 assert.equal(await value('ExportStatus').textContent(),'');
 nominal=false;await refresh();assert.ok(await value('Search').isDisabled());assert.doesNotMatch(await value('Rows').textContent(),/Agente de prueba|Legajo/);
 checks.push('non-nominal response disables search and renders pseudonyms only');

 await page.addStyleTag({content:'body:after{content:"QA · DATOS SINTÉTICOS";position:fixed;right:12px;bottom:8px;z-index:9999;background:#123247;color:white;padding:8px;font:11px sans-serif}'});
 await root.screenshot({path:path.join(out,'desktop-synthetic.png')});
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await root.screenshot({path:path.join(out,'mobile-synthetic.png')});checks.push('desktop and mobile screenshots use synthetic data; no horizontal page overflow');

 mode='denied';await value('Refresh').click();await value('Error').filter({hasText:'Acceso no disponible'}).waitFor();
 assert.equal(await value('Rows').textContent(),'');assert.ok(await value('Refresh').isDisabled());
 const deniedCount=requests.filter(r=>r.resource==='clock-dashboard').length;
 await page.evaluate(()=>document.activeElement.blur());await page.clock.fastForward(120001);
 assert.equal(requests.filter(r=>r.resource==='clock-dashboard').length,deniedCount);checks.push('403 clears the dashboard and stops periodic requests');
 mode='ok';await page.reload();await ready();mode='wait';await value('Refresh').click();
 await page.waitForFunction(()=>document.getElementById('clockOperations').getAttribute('aria-busy')==='true');
 await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));mode='ok';deferred?.();
 await page.waitForTimeout(50);assert.ok(await root.isHidden());assert.equal(await value('Rows').textContent(),'');
 checks.push('late response cannot repopulate after pagehide');
 assert.ok(requests.every(r=>r.method==='GET'));assert.deepEqual(errors,[]);
 const report={checksPassed:checks.length,checks,errors,syntheticApi:true,municipalSessionTested:false,backendWrites:false,browser:browser.version()};
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve))}
