// Full built page and real modules, synthetic APIs only. --published verifies served bytes without a municipal session.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {workspaceFixture} from '../tests/fixtures/clock-workspace-synthetic.js';
import {clockDashboardFixture} from '../tests/fixtures/clock-dashboard-v3-synthetic.js';
import {continuousWorkdayFixture} from '../tests/fixtures/continuous-workdays-synthetic.js';
const published=process.argv.includes('--published'),origin=published?'https://municipio-junin-friendly.vercel.app':'https://clock-workspace.test',root=path.resolve('public'),out=path.resolve('verification/clock-workspace');fs.mkdirSync(out,{recursive:true});
const checks=[],errors=[],calls=[],verified=new Set();let mode='ok',held=null,release=null,browser,page;
const send=(route,body,status=200)=>route.fulfill({status,json:body,headers:{'Cache-Control':'private, no-store'}}).catch(()=>{});
try{
 browser=await chromium.launch({headless:true,...(process.env.CLOCK_BROWSER_CHANNEL?{channel:process.env.CLOCK_BROWSER_CHANNEL}:{})});const context=await browser.newContext({viewport:{width:1440,height:1050},locale:'es-AR',serviceWorkers:'block',acceptDownloads:true});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url()),q=u.searchParams;assert.equal(req.method(),'GET','No municipal writes in browser QA');
  if(u.origin==='https://unpkg.com'&&u.pathname.startsWith('/leaflet@1.9.4/dist/')){const file='node_modules/leaflet/dist/'+path.basename(u.pathname);return route.fulfill({contentType:file.endsWith('.css')?'text/css':'application/javascript',headers:{'access-control-allow-origin':'*'},body:fs.readFileSync(file)});}
  if(u.origin!==origin)return route.abort();
  if(u.pathname.startsWith('/api/')){
   calls.push({path:u.pathname,view:q.get('view'),resource:q.get('resource'),site:q.get('site')});
   if(u.pathname==='/api/internal-clock-source'&&q.get('view')==='workspace'){
    if(mode==='wait')await held;if(mode==='error')return send(route,{ok:false},503);if(mode==='denied')return send(route,{ok:false},403);
    const v=workspaceFixture({unavailable:mode==='partial'});if(mode==='mismatch')v.archive.devices[0].siteKey='pm-99';return send(route,{ok:true,...v});
   }
   if(u.pathname==='/api/internal-auth')return send(route,{ok:true,authenticated:true,user:{name:'Operador QA',email:'qa@example.invalid'},access:{tenantCapabilities:['attendance.read','workforce.employee.read'],platformCapabilities:[],platformRoles:[]}});
   const resource=q.get('resource');if(resource==='bootstrap')return send(route,{ok:true,capabilities:['attendance.read'],summary:{siteCount:6,deviceCount:6,punchCount:990},features:{}});
   if(resource==='clock-dashboard')return send(route,clockDashboardFixture(q,{nominal:true}));
   if(resource==='clock-workdays-v2')return send(route,await continuousWorkdayFixture(q));
   if(resource==='reported-inventory')return send(route,{ok:true,data:[],source:{kind:'qa-fixture',mappingVersion:'qa',recordCount:0}});
   return send(route,{ok:true,resource,data:[],pagination:{page:1,pageSize:25,total:0,pages:0}});
  }
  const pathname=u.pathname==='/relojes'?'/relojes-marcaciones.html':u.pathname,file=path.resolve(root,'.'+decodeURIComponent(pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404});
  const expected=fs.readFileSync(file);let body=expected;
  if(published){let r=await fetch(u.href,{credentials:'omit',redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(20000)});if(r.status===307&&u.pathname==='/relojes-marcaciones.html'){const canonical='/relojes'+u.search;assert.equal(r.headers.get('location'),canonical);await r.body?.cancel();r=await fetch(origin+canonical,{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(20000)});}assert.equal(r.status,200,u.pathname);body=Buffer.from(await r.arrayBuffer());assert.ok(expected.equals(body),'Published mismatch: '+pathname);verified.add(pathname);}
  return route.fulfill({body,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':file.endsWith('.svg')?'image/svg+xml':'application/octet-stream'});
 });
 page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date('2026-09-24T10:00:00Z')});await page.goto(origin+'/relojes');
 const panel=page.locator('#clockFleetReception'),v=k=>panel.locator('[data-workspace="'+k+'"]'),reads=()=>calls.filter(c=>c.path==='/api/internal-clock-source'&&c.view==='workspace').length;
 async function ready(){await v('devices').filter({hasText:'6'}).waitFor();await page.waitForFunction(()=>document.getElementById('clockFleetReception').getAttribute('aria-busy')==='false');}
 async function refresh(){await page.clock.runFor(3100);await v('refresh').click();}
 await ready();assert.equal(await panel.locator('.workspace-card').count(),6);assert.equal(await v('archiveReceived').textContent(),'3');assert.equal(await v('consultable').textContent(),'1');assert.equal(calls.filter(c=>c.path==='/api/internal-clock-fleet').length,0);assert.equal(reads(),1);
 checks.push('One authorized workspace request renders six exact device identities; no second legacy fleet request.');
 const pm10=panel.locator('[data-stage="consultable"]');assert.match(await pm10.innerText(),/PM-10/);assert.match(await pm10.innerText(),/990/);assert.equal(await pm10.getByRole('button',{name:'Ver marcaciones'}).count(),1);const pending=panel.locator('[data-stage="source_pending"]');assert.match(await pending.innerText(),/PM-02/);assert.match(await pending.innerText(),/802/);assert.equal(await pending.getByRole('button',{name:'Ver marcaciones'}).count(),0);
 checks.push('PM10 history remains consultable without a duplicate archive; stored-only PM02 never pretends to have calculated attendance.');
 let before=reads();await panel.locator('[data-workspace-stage="source_pending"]').click();assert.equal(await panel.locator('.workspace-card').count(),1);assert.equal(await v('devices').textContent(),'6');await v('filter').selectOption('all');await v('search').fill('GALPON');await panel.getByRole('button',{name:'Aplicar búsqueda'}).click();assert.equal(await panel.locator('.workspace-card').count(),1);assert.equal(reads(),before);await panel.getByRole('button',{name:'Limpiar',exact:true}).click();
 checks.push('Stage charts and accent-insensitive search filter the entire park locally without extra queries or changing global totals.');
 await v('view').click();assert.equal(await v('table').isVisible(),true);assert.equal(await v('table').locator('tbody tr').count(),6);await v('view').click();
 checks.push('Cards and the accessible matrix show the same six devices, independent of pagination.');
 await panel.screenshot({path:path.join(out,'fleet-desktop.png')});
 for(const width of [390,320]){await page.setViewportSize({width,height:844});await page.emulateMedia({reducedMotion:'reduce'});await panel.screenshot({path:path.join(out,'fleet-'+width+'.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await v('view').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await v('view').click();}
 checks.push('Cards, filters and scrollable matrix fit both 390px and 320px viewports.');await page.setViewportSize({width:1440,height:1050});
 await v('filter').selectOption('source_pending');await page.clock.runFor(3100);const download=page.waitForEvent('download');await v('export').click();const saved=await download,csv=fs.readFileSync(await saved.path(),'utf8');assert.equal(csv.trim().split('\r\n').length,2);assert.match(csv,/Consulta archivo UTC/);assert.match(csv,/802/);assert.doesNotMatch(csv,/Operador QA|qa@example/);await ready();await v('filter').selectOption('all');
 checks.push('Export revalidates the server and emits exactly the filtered equipment rows with both cuts, never employee records.');
 mode='partial';await refresh();await ready();assert.equal(await v('archiveReceived').textContent(),'Sin verificar');assert.equal(await v('consultable').textContent(),'1');assert.equal(await v('partial').isVisible(),true);assert.equal(await panel.locator('[data-stage="unavailable"]').count(),4);
 checks.push('An unavailable archive stays unknown while the verified canonical history is usable; it is not converted into zero.');
 mode='mismatch';await refresh();await v('error').waitFor();assert.equal(await panel.locator('.workspace-card').count(),0);assert.equal(await v('devices').textContent(),'—');
 checks.push('A mismatched source point clears the combined read rather than joining on labels.');
 mode='ok';await refresh();await ready();await panel.locator('[data-stage="consultable"]').getByRole('button',{name:'Ver marcaciones'}).click();await page.waitForFunction(()=>document.getElementById('clockOperations').dataset.state==='ready');assert.ok(calls.some(c=>c.resource==='clock-dashboard'&&c.site==='pm-10'));
 checks.push('The exact device card opens its point in the existing workday/mark workspace.');
 await panel.scrollIntoViewIfNeeded();before=reads();await page.clock.runFor(61000);assert.equal(reads(),before);await v('auto').check();await v('search').fill('Sin aplicar');await page.evaluate(()=>document.activeElement.blur());await page.clock.runFor(61000);assert.equal(reads(),before);await v('search').fill('');await page.evaluate(()=>document.activeElement.blur());await page.clock.runFor(61000);await ready();assert.ok(reads()>before);await v('auto').uncheck();
 checks.push('Polling is opt-in and pauses for unapplied edits, avoiding overlap and surprise filter changes.');
 mode='wait';held=new Promise(resolve=>release=resolve);await refresh();await page.waitForFunction(()=>document.getElementById('clockFleetReception').getAttribute('aria-busy')==='true');await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));release();await page.waitForTimeout(70);assert.equal(await panel.isVisible(),false);assert.equal(await v('devices').textContent(),'—');
 checks.push('Late responses cannot restore a departed page.');
 mode='ok';await page.reload();await ready();mode='denied';await refresh();await v('error').waitFor();assert.equal(await v('devices').textContent(),'—');assert.equal(await v('refresh').isDisabled(),true);assert.equal(await v('auto').isChecked(),false);
 checks.push('Revoked permission clears both stages and prevents further polling.');
 assert.deepEqual(errors,[]);const result={version:'clock-workspace-browser.v1',checkedAt:new Date().toISOString(),ok:true,checks:checks.length,labels:checks,publishedAssets:[...verified].sort(),syntheticApi:true,realMunicipalSessionTested:false,municipalWrites:0,requests:calls.length};fs.writeFileSync(path.join(out,published?'production.json':'browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}catch(e){console.error(JSON.stringify({checks,errors}));if(page)await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});throw e;}finally{await browser?.close();}
