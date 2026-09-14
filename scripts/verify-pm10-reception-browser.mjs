import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import {chromium} from 'playwright';import {historicalData} from './pm10-reception-synthetic.mjs';
import {upgradeClockFixture} from '../tests/fixtures/clock-dashboard-v3-synthetic.js';
const out=path.resolve('verification'),base=path.resolve('public');fs.mkdirSync(out,{recursive:true});
const live=process.env.PM10_LIVE_ASSETS==='1';let server,browser;const checks=[],errors=[],requests=[];
let origin='https://municipio-junin-friendly.vercel.app';
if(!live){server=http.createServer((req,res)=>{let p;try{p=path.resolve(base,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));}catch{return res.writeHead(400).end();}if(!p.startsWith(base+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile())return res.writeHead(404).end();res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':p.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(p));});await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;}
function initial(){return{ok:true,version:'pm10-status.v1',checkedAt:'2026-09-13T13:00:00Z',connectorState:'suspended',baselineRecords:111,summary:{receipts:0,newMarks:0,knownRecords:0,observations:0,lastReceivedAt:null,lastCapturedAt:null},records:[],nominalReadAllowed:true,physicalClockVerified:false,payrollModified:false};}
let source=initial(),mode='ok',deferred=null,gateDenied=false,recentReceipt=false;const check=(text)=>checks.push(text);
try{
 browser=await chromium.launch({headless:true,...(process.env.CLOCK_BROWSER_CHANNEL?{channel:process.env.CLOCK_BROWSER_CHANNEL}:{})});const ctx=await browser.newContext({viewport:{width:1440,height:1050}});
 await ctx.route('**/*',async route=>{const request=route.request(),u=new URL(request.url());if(u.origin!==origin)return route.abort();if(!u.pathname.startsWith('/api/'))return route.continue();requests.push({path:u.pathname,resource:u.searchParams.get('resource'),method:request.method()});
  const resource=u.searchParams.get('resource');if(gateDenied&&resource==='bootstrap')return route.fulfill({status:403,json:{ok:false,error:'Sin permiso de QA'}});
  if(resource==='pm10-reception'){
   if(mode==='wait')await new Promise(r=>deferred=r);
   if(mode==='network')return route.abort();if(mode==='denied')return route.fulfill({status:403,json:{ok:false}});
   return route.fulfill({status:200,json:structuredClone(source)}).catch(()=>{});
  }
  let p;if(u.pathname==='/api/internal-auth')p={ok:true,authenticated:true,access:{tenantCapabilities:['attendance.read','workforce.employee.read'],platformCapabilities:[],platformRoles:[]}};
  else if(resource==='bootstrap')p={ok:true,capabilities:['attendance.read'],summary:{siteCount:1,deviceCount:1,punchCount:150,rawEventCount:150,pendingReviewCount:150,unmatchedPunchCount:3},features:recentReceipt===null?{}:{hardwareConnected:recentReceipt}};
  else if(resource==='clock-dashboard')p=upgradeClockFixture(historicalData(u.searchParams),u.searchParams);
  else if(resource==='reported-inventory')p={data:[{code:'PM-10',name:'Edificio QA',address:'Domicilio sintético',model:'K20',reportedExtraction:'Red',latitude:-33.14,longitude:-68.48}]};
  else p={ok:true,resource,data:[],pagination:{page:1,pageSize:25,total:0,pages:0}};
  return route.fulfill({status:200,json:p});
 });
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/relojes-marcaciones.html');const panel=page.locator('#pm10Reception'),v=k=>panel.locator('[data-pm10="'+k+'"]');
 await v('state').filter({hasText:'Conector suspendido'}).waitFor();check('full application starts through normal session/bootstrap gates');
 assert.equal(await v('new').textContent(),'0');assert.match(await v('received').textContent(),/Sin registro/);check('suspended connector with no receipts does not imply online data');
 assert.match(await v('baseline').textContent(),/111 registros/);assert.equal(await page.locator('#clockMarks').textContent(),'150');check('manual history and reception remain separate sources');
 await panel.locator('summary').click();assert.match(await v('rows').textContent(),/Todavía no/);check('empty receipt state has actionable explanation');
 async function refresh(){await v('refresh').click();await page.waitForFunction(()=>document.getElementById('pm10Reception').getAttribute('aria-busy')==='false');}
 source.connectorState='active';await refresh();assert.match(await v('state').textContent(),/Habilitado para recibir/);assert.match(await v('explanation').textContent(),/no demuestra/);check('active configuration is not called physical connectivity');
 source.summary={receipts:2,newMarks:3,knownRecords:2,observations:1,lastReceivedAt:'2026-09-13T13:00:00Z',lastCapturedAt:'2026-09-12T12:00:00Z'};
 source.records=[{occurredAt:'2026-09-12T11:00:00Z',receivedAt:'2026-09-13T13:00:00Z',personLabel:'PERSONA QA',legajo:'0012',state:'mapped',issueCodes:[],punchCode:0,verificationCode:1},{occurredAt:null,receivedAt:'2026-09-13T13:00:00Z',personLabel:'Identidad reservada',legajo:null,state:'observed',issueCodes:['timestamp_invalid'],punchCode:0,verificationCode:1}];await refresh();
 assert.equal(await v('new').textContent(),'3');assert.equal(await v('parts').textContent(),'2');assert.equal(await v('known').textContent(),'2');assert.equal(await v('observed').textContent(),'1');check('receipt metrics distinguish new, known, observed and parts');
 assert.notEqual(await v('received').textContent(),await v('captured').textContent());check('source timestamp is distinct from database arrival');
 recentReceipt=true;await page.locator('#refreshButton').click();await page.waitForFunction(()=>document.getElementById('truthTitle').textContent==='Recepción reciente confirmada');
 assert.match(await page.locator('#truthCopy').textContent(),/captura anterior pendiente de envío/);
 assert.match(await page.locator('#truthCopy').textContent(),/no verifica conexión física, captura automática ni que la cola esté vacía/);
 assert.match(await page.locator('#hardwareState').textContent(),/Acuse confirmado en la última consulta/);
 assert.equal(await page.locator('#clockBacklog').textContent(),'No informado por el colector');
 assert.notEqual(await v('received').textContent(),await v('captured').textContent());
 check('recent acknowledgment of an older queued capture never implies physical connectivity, autonomous capture or empty backlog');
 const truthStrip=page.locator('.truth-strip');
 await truthStrip.evaluate(section=>{section.closest('details').open=true;const label=document.createElement('small');label.textContent='QA · DATOS SINTÉTICOS · captura anterior / acuse posterior';section.querySelector('div').prepend(label);});
 await truthStrip.screenshot({path:path.join(out,'pm10-reception-evidence-desktop-qa.png')});
 await page.setViewportSize({width:390,height:844});await truthStrip.scrollIntoViewIfNeeded();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await truthStrip.screenshot({path:path.join(out,'pm10-reception-evidence-mobile-qa.png')});
 await page.setViewportSize({width:1440,height:1050});
 check('reception evidence header remains legible on desktop and mobile with synthetic labels');
 recentReceipt=false;await page.locator('#refreshButton').click();await page.locator('#hardwareState').filter({hasText:'Sin acuse reciente confirmado'}).waitFor({state:'attached'});
 assert.match(await page.locator('#truthCopy').textContent(),/no permite saber si el reloj está conectado/);
 check('without a recent acknowledgment the page does not declare the clock disconnected');
 recentReceipt=null;await page.locator('#refreshButton').click();await page.waitForFunction(()=>!document.getElementById('refreshButton').disabled);
 assert.equal(await page.locator('#hardwareFeature').textContent(),'No confirmada');
 assert.equal(await page.locator('#clockBacklog').textContent(),'No informado por el colector');
 check('an omitted receipt flag preserves unknown connectivity and unknown queue depth');
 assert.match(await v('rows').textContent(),/revisión laboral pendiente/);assert.match(await v('rows').textContent(),/Registro observado/);check('mapped is not payroll approved and invalid timestamp is retained');
 source.records[0].personLabel='<img src=x onerror="window.injected=true">';await refresh();assert.equal(await panel.locator('tbody img').count(),0);assert.equal(await page.evaluate(()=>window.injected),undefined);check('source labels rendered as text, never HTML');
 source.records[0].personLabel='PERSONA QA';await refresh();await page.addStyleTag({content:'body:after{content:"QA · DATOS SINTÉTICOS";position:fixed;right:12px;bottom:8px;z-index:9999;background:#123247;color:white;padding:8px;font:11px sans-serif}'});await panel.screenshot({path:path.join(out,'pm10-reception-desktop-qa.png')});check('desktop panel screenshot');
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await panel.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.equal(await v('state').evaluate(e=>getComputedStyle(e).animationName),'none');await panel.screenshot({path:path.join(out,'pm10-reception-mobile-qa.png')});check('mobile layout bounded with internal table scrolling and reduced motion');
 source.nominalReadAllowed=false;source.records[0].personLabel='Identidad reservada';source.records[0].legajo=null;await refresh();assert.doesNotMatch(await v('rows').textContent(),/PERSONA QA|0012/);check('non-nominal response shows neither name nor legajo');
 source.nominalReadAllowed=true;source.records[0].personLabel='PERSONA QA';source.records[0].legajo='0012';mode='network';await refresh();assert.equal(await v('new').textContent(),'—');assert.equal(await v('rows').textContent(),'');assert.ok(await v('error').isVisible());check('network error clears previously displayed values');
 mode='ok';await refresh();assert.equal(await v('new').textContent(),'3');check('manual retry recovers without a write');
 source.physicalClockVerified=true;await refresh();assert.equal(await v('new').textContent(),'—');check('unsupported claim of physical verification rejected');source.physicalClockVerified=false;await refresh();
 mode='denied';await refresh();assert.equal(await v('new').textContent(),'—');assert.ok(await v('refresh').isDisabled());check('permission loss clears data and stops refresh');
 mode='ok';await page.reload();await v('new').filter({hasText:'3'}).waitFor();await panel.locator('summary').click();check('new session bootstrap can restore authorized receipt reads');
 mode='wait';await v('refresh').click();await page.waitForFunction(()=>document.getElementById('pm10Reception').getAttribute('aria-busy')==='true');assert.ok(await v('refresh').isDisabled());check('concurrent refresh disabled while fetching');
 await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));mode='ok';deferred?.();await page.waitForTimeout(100);assert.ok(await panel.isHidden());assert.equal(await v('rows').textContent(),'');check('late response cannot repopulate after leaving page');
 gateDenied=true;await page.reload();await page.locator('#retryAuth').waitFor({state:'visible'});assert.ok(await panel.isHidden());check('denied bootstrap never opens receipt panel');
 assert.ok(requests.every(r=>r.method==='GET'));check('all test actions are reads, never clock capture or ingestion');assert.deepEqual(errors,[]);check('no JavaScript page errors');
 fs.writeFileSync(path.join(out,'pm10-reception-browser.json'),JSON.stringify({checksPassed:checks.length,checks,errors,liveAssets:live,syntheticApi:true,realMunicipalSessionTested:false,backendWrites:false,browser:browser.version()},null,2));console.log(JSON.stringify({checksPassed:checks.length,errors,liveAssets:live}));
}finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));}
