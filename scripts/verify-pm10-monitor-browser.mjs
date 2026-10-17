// Component integration with synthetic HTTP. No clock, database or municipal login.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {chromium} from 'playwright';
const base=path.resolve(process.env.PM10_MONITOR_SOURCE_ROOT||'public');
const out=path.resolve('verification/pm10-monitor');fs.mkdirSync(out,{recursive:true});
const assets=['assets/pm10-reception.js','assets/pm10-reception.css'];
const digest=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const file of assets)assert.equal(digest(path.join(base,file)),digest(file),'served component differs from reviewed source');
const fragment=fs.readFileSync(path.join(base,'relojes-marcaciones.html'),'utf8').match(/<section id="pm10Reception"[\s\S]*?<\/section>/)?.[0];
assert.ok(fragment,'real PM10 component required');
const markup=`<!doctype html><html lang="es-AR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Monitor PM10 · QA sintética</title><link rel="stylesheet" href="/assets/pm10-reception.css"><style>*{box-sizing:border-box}body{margin:0;padding:20px;background:#f0f5f3;font:14px system-ui;color:#173e51}main{max-width:1200px;margin:auto}header.qa{display:flex;align-items:center;gap:16px}header.qa img{width:160px;height:40px}header.qa small{margin-left:auto}button{font:inherit}[hidden]{display:none!important}@media(max-width:700px){body{padding:8px}header.qa{flex-wrap:wrap}header.qa small{margin:0}}</style><main><header class="qa"><img src="/assets/brand/logo-horizontal.svg" alt="MuniControl"><small>QA · API SINTÉTICA · SIN DATOS MUNICIPALES</small></header><div id="appShell">${fragment}</div><button id="logoutButton">Salir de QA</button></main><script type="module" src="/assets/pm10-reception.js"></script></html>`;
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end(markup);}
 const file=path.resolve(base,'.'+pathname);
 if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();
 res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'application/octet-stream');res.end(fs.readFileSync(file));
});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const checks=[],errors=[],requests=[];let mode='ok',pending=null;
let source={ok:true,version:'pm10-status.v1',checkedAt:'2026-09-15T12:00:00Z',connectorState:'active',baselineRecords:100,
 summary:{receipts:2,newMarks:3,knownRecords:100,observations:1,lastReceivedAt:'2026-09-15T11:59:00Z',lastCapturedAt:'2026-09-14T09:00:00Z'},
 nominalReadAllowed:true,physicalClockVerified:false,payrollModified:false,
 records:[{personLabel:'PERSONA PRIVADA QA',legajo:'00123',occurredAt:'2026-09-14T08:00:00Z',receivedAt:'2026-09-15T11:59:00Z',state:'mapped'}]};
let browser;const check=name=>checks.push(name);
try{
 browser=await chromium.launch({headless:true,...(process.env.PM10_MONITOR_BROWSER_EXECUTABLE?{executablePath:process.env.PM10_MONITOR_BROWSER_EXECUTABLE}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1100},locale:'es-AR',acceptDownloads:true});
 await context.route('**/api/**',async route=>{
  requests.push({method:route.request().method(),url:new URL(route.request().url()).pathname});
  if(mode==='wait')await new Promise(r=>pending=r);
  if(mode==='network')return route.abort();
  if(mode==='denied')return route.fulfill({status:403,json:{ok:false}});
  return route.fulfill({status:200,json:structuredClone(source)}).catch(()=>{});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2035-01-01T00:00:00Z')});
 const monitor=k=>page.locator(`[data-pm10-monitor="${k}"]`),v=k=>page.locator(`[data-pm10="${k}"]`);
 const ready=async()=>page.waitForFunction(()=>document.getElementById('pm10Reception').getAttribute('aria-busy')==='false'&&document.querySelector('[data-pm10="new"]').textContent!=='—');
 const refresh=async()=>{await v('refresh').click();await page.waitForFunction(()=>document.getElementById('pm10Reception').getAttribute('aria-busy')==='false');};
 await page.goto(origin);await ready();
 assert.equal(await monitor('status').textContent(),'Acuse reciente');assert.equal(await v('state').getAttribute('data-tone'),'confirmed');check('recent database receipt distinguished from physical heartbeat');
 assert.match(await monitor('receipt').textContent(),/Hace 1 min/);assert.match(await monitor('capture').textContent(),/Hace 1 d 3 h/);check('separate ages follow server time not client wall clock');
 const downloaded=page.waitForEvent('download');await monitor('export').click();const download=await downloaded;
 const saved=path.join(out,'diagnostic-synthetic.json');await download.saveAs(saved);const json=fs.readFileSync(saved,'utf8'),diagnostic=JSON.parse(json);
 assert.equal(diagnostic.schema,'pm10-reception-diagnostic.v1');assert.doesNotMatch(json,/PERSONA PRIVADA|00123/);assert.equal(diagnostic.queueDepth,null);assert.equal(diagnostic.autonomyVerified,false);check('download contains only allowlisted technical evidence without nominal rows');
 await monitor('pause').click();assert.equal(await monitor('pause').getAttribute('aria-pressed'),'true');assert.equal(await monitor('query').textContent(),'Actualización pausada');assert.equal(await v('state').getAttribute('data-tone'),'pending');check('pause removes current confirmation without changing connector state');
 const count=requests.length;await page.clock.runFor(61000);assert.equal(requests.length,count);check('paused monitor does not poll after a full 61-second refresh interval');
 await v('refresh').click();await ready();assert.equal(await monitor('pause').getAttribute('aria-pressed'),'true');check('explicit refresh works while automatic polling remains paused');
 await monitor('pause').click();await ready();check('resume revalidates through HTTP');
 source.summary.lastReceivedAt='2026-09-14T12:00:00Z';await refresh();assert.equal(await monitor('status').textContent(),'Sin acuse reciente');assert.equal(await v('state').getAttribute('data-tone'),'pending');check('old receipts do not paint an active connector green');
 assert.match(await page.locator('.pm10-monitor-note').textContent(),/puede no haber fichadas nuevas/);check('no recent receipt never asserts disconnection');
 await page.locator('#pm10Reception').screenshot({path:path.join(out,'desktop-synthetic.png')});
 for(const width of [390,320]){
  await page.setViewportSize({width,height:960});await page.emulateMedia({reducedMotion:'reduce'});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  for(const key of ['receipt','capture','query','pause','export']){const bounds=await monitor(key).boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1);}
  assert.equal(await monitor('pause').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
  await page.locator('#pm10Reception').screenshot({path:path.join(out,`mobile-${width}-synthetic.png`)});check(`mobile ${width}px keeps controls and all ages in bounds with reduced motion`);
 }
 await monitor('pause').focus();await page.keyboard.press('Enter');assert.equal(await monitor('pause').getAttribute('aria-pressed'),'true');await page.keyboard.press('Enter');await ready();check('polling control works from the keyboard');
 source.summary.lastCapturedAt='2026-09-15T12:10:00Z';await refresh();assert.equal(await monitor('status').textContent(),'Fechas o acuses por revisar');assert.equal(await monitor('capture').textContent(),'Fecha por revisar');check('future source times are not reported as current');
 source.summary.lastCapturedAt='2026-09-14T09:00:00Z';mode='network';await refresh();assert.equal(await v('new').textContent(),'—');assert.equal(await v('rows').textContent(),'');assert.equal(await monitor('export').isDisabled(),true);check('failed reads purge nominal rows and disable diagnosis export');
 mode='ok';await refresh();await ready();
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));assert.equal(await page.locator('#pm10Reception').isHidden(),true);assert.equal(await v('rows').textContent(),'');
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await ready();assert.equal(await page.locator('#pm10Reception').isVisible(),true);check('back-forward restoration performs a new authorized read instead of freezing the panel');
 mode='wait';await v('refresh').click();await page.waitForFunction(()=>document.getElementById('pm10Reception').getAttribute('aria-busy')==='true');
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));mode='ok';pending?.();await page.waitForTimeout(100);assert.equal(await v('rows').textContent(),'');check('late response after navigation cannot repopulate cleared data');
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await ready();
 mode='denied';await refresh();assert.equal(await monitor('export').isDisabled(),true);assert.equal(await monitor('pause').isDisabled(),true);assert.equal(await v('refresh').isDisabled(),true);assert.equal(await v('rows').textContent(),'');check('permission revocation stops polling and exports and clears rows');
 assert.ok(requests.every(r=>r.method==='GET'));check('monitor and controls never write to APIs or clocks');assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({checksPassed:checks.length,checks,errors,componentOnly:true,assetMode:process.env.PM10_MONITOR_SOURCE_ROOT?'source-components':'built-components',assetHashes:Object.fromEntries(assets.map(p=>[p,digest(p)])),syntheticApi:true,realMunicipalSessionTested:false,clockContacted:false,backendWrites:false,browser:browser.version()},null,2));console.log(JSON.stringify({checksPassed:checks.length,errors}));
}finally{await browser?.close();await new Promise(r=>server.close(r));}
