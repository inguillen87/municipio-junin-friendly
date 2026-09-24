// Real built pages, synthetic API responses. Optional public asset-byte verification is credential-free.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {absenceWorkspaceAnalytics,absenceWorkspaceEvents} from '../tests/fixtures/absence-workspace-synthetic.js';
import {clockDashboardFixture} from '../tests/fixtures/clock-dashboard-v3-synthetic.js';
import {continuousWorkdayFixture} from '../tests/fixtures/continuous-workdays-synthetic.js';
const live=process.env.TIME_WORKSPACE_ORIGIN;if(live!==undefined)assert.equal(live,'https://municipio-junin-friendly.vercel.app');
const origin=live||'https://time-workspace.test',base=path.resolve('public'),out=path.resolve('verification/time-absence-workspace');fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CLOCK_BROWSER_CHANNEL?{channel:process.env.CLOCK_BROWSER_CHANNEL}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1050},locale:'es-AR',serviceWorkers:'block'});
const calls=[],checks=[],errors=[],assets=new Set();let delayAnalytics=true,releaseAnalytics=null,eventsMode='ok';
await context.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url()),q=url.searchParams,resource=(q.get('resource')||'').toLowerCase();
 if(url.origin!==origin)return route.abort();
 assert.equal(req.method(),'GET','No business mutations allowed in this QA');
 if(!url.pathname.startsWith('/api/')){
  const file=path.resolve(base,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
  const expected=fs.readFileSync(file);let body=expected;
  if(live){let r=await fetch(url.href,{credentials:'omit',cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(20000)});
   const redirects={'/ausentismo-control.html':'/ausentismo','/relojes-marcaciones.html':'/relojes'};
   if(r.status===307&&redirects[url.pathname]){assert.equal(r.headers.get('location'),redirects[url.pathname]);await r.body?.cancel();r=await fetch(origin+redirects[url.pathname],{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(20000)});}
   assert.equal(r.status,200,url.pathname);body=Buffer.from(await r.arrayBuffer());assert.ok(body.equals(expected),'Published bytes mismatch: '+url.pathname);assets.add(url.pathname);
  }
  return route.fulfill({status:200,body,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream'});
 }
 calls.push({path:url.pathname,resource,query:new URLSearchParams(q)});
 const send=(data,status=200)=>route.fulfill({status,json:data,headers:{'Cache-Control':'private, no-store'}}).catch(()=>{});
 if(resource==='absenceanalytics'){if(delayAnalytics)await new Promise(resolve=>releaseAnalytics=resolve);return send(absenceWorkspaceAnalytics(q));}
 if(resource==='absenceevents')return send(eventsMode==='ok'?absenceWorkspaceEvents(q):{ok:false,code:'SYNTHETIC_ERROR'},eventsMode==='denied'?403:eventsMode==='fail'?503:200);
 if(url.pathname==='/api/internal-auth')return send({ok:true,authenticated:true,sessionVersion:2,user:{id:'synthetic-user',name:'Usuario de prueba',email:'qa@example.invalid'},access:{tenant:{id:'synthetic-tenant'},tenantCapabilities:['attendance.read','workforce.employee.read','absence.analytics.read','absence.nominal.read','lineage.read'],platformRoles:[],platformCapabilities:[]}});
 if(resource==='clock-dashboard')return send(clockDashboardFixture(q,{nominal:true}));
 if(resource==='clock-workdays-v2')return send(await continuousWorkdayFixture(q));
 if(resource==='bootstrap')return send({ok:true,capabilities:['attendance.read'],summary:{siteCount:1,deviceCount:1,punchCount:153,rawEventCount:153,pendingReviewCount:153,unmatchedPunchCount:3},features:{}});
 return send({ok:true,resource,data:[],pagination:{page:1,pageSize:25,total:0,pages:0}});
});
try{
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/ausentismo-control.html?from=2026-08-01&to=2026-09-10');
 await page.getByRole('button',{name:'Ver ausencia de Agente de prueba 1',exact:true}).waitFor();
 assert.equal(await page.locator('#mainContent').isVisible(),true);assert.equal(await page.locator('#eventsValue').textContent(),'—');
 assert.equal(await page.locator('#filterPanel button[type=submit]').isEnabled(),true);
 checks.push('The event list and filters remain usable while the independent analytics request is delayed.');
 await page.locator('#fromInput').fill('2026-08-05');
 delayAnalytics=false;releaseAnalytics();await page.waitForFunction(()=>document.getElementById('eventsValue').textContent==='52');
 assert.equal(await page.locator('#fromInput').inputValue(),'2026-08-05');assert.equal(await page.locator('#toInput').inputValue(),'2026-09-10');await page.locator('#fromInput').fill('2026-08-01');
 checks.push('Late analytics preserves edited dates while filling untouched defaults.');
 assert.doesNotMatch(await page.locator('#eventsChange').innerText(),/0%/);
 checks.push('A zero prior baseline is not displayed as zero percent variation.');
 const before=calls.length,url=page.url();await page.getByRole('button',{name:'Ver ausencia de Agente de prueba 1',exact:true}).click();
 assert.equal(page.url(),url);assert.equal(calls.length,before);assert.match(await page.locator('.absence-case-row').first().innerText(),/366 días/);
 assert.equal(await page.getByRole('link',{name:'Abrir legajo completo',exact:true}).count(),1);
 checks.push('The case expands in place from its already-authorized row, preserves context and flags the 2033 end date without modifying it.');
 await page.screenshot({path:path.join(out,'absence-case-desktop.png'),fullPage:true});
 const analyticsBefore=calls.filter(c=>c.resource==='absenceanalytics').length;await page.locator('#nextPage').click();
 await page.getByRole('button',{name:'Ver ausencia de Agente de prueba 26',exact:true}).waitFor();
 assert.equal(calls.filter(c=>c.resource==='absenceanalytics').length,analyticsBefore);
 checks.push('Pagination queries only the nominal detail, without recalculating facets, quality or charts.');
 await page.locator('#eventSearch').fill('QA 9099');await page.getByRole('button',{name:'Buscar eventos',exact:true}).click();
 await page.getByRole('button',{name:'Ver ausencia de Resultado de prueba filtrado',exact:true}).waitFor();
 assert.equal(calls.filter(c=>c.resource==='absenceanalytics').length,analyticsBefore);assert.ok(calls.some(c=>c.resource==='absenceevents'&&c.query.get('search')==='QA 9099'));assert.ok(!page.url().includes('9099'));
 checks.push('Search covers the full filtered event list via the server and never places the person query in browser history.');
 await page.locator('#eventSearchClear').click();await page.getByRole('button',{name:'Ver ausencia de Agente de prueba 1',exact:true}).waitFor();
 await page.locator('#reasonSelect').selectOption('20');await page.locator('#filterPanel button[type=submit]').click();
 await page.locator('#absenceEmpty').waitFor();assert.equal(await page.locator('#summaryBadge').textContent(),'Sin coincidencias');assert.match(await page.locator('#filterSummary').innerText(),/Inasistencias/);
 await page.locator('#removeReason').click();await page.waitForFunction(()=>document.getElementById('eventsValue').textContent==='52');
 assert.equal(new URL(page.url()).searchParams.get('from'),'2026-08-01');assert.equal(new URL(page.url()).searchParams.get('reasonCode'),null);
 checks.push('Empty results identify the active reason and removing it keeps the date range.');
 eventsMode='fail';await page.locator('#refreshButton').click();await page.locator('#eventsRetry').waitFor();assert.equal(await page.locator('#mainContent').isVisible(),true);
 await page.waitForFunction(()=>document.getElementById('eventsValue').textContent==='52');eventsMode='ok';await page.locator('#eventsRetry').click();await page.getByRole('button',{name:'Ver ausencia de Agente de prueba 1',exact:true}).waitFor();
 checks.push('A failed event request can be retried without blanking available analytics.');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(out,'absence-mobile.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 checks.push('The operational absence page fits a narrow viewport.');
 await page.setViewportSize({width:1440,height:1050});await page.getByRole('button',{name:'Ver ausencia de Agente de prueba 1',exact:true}).click();
 eventsMode='denied';await page.locator('#refreshButton').click();await page.locator('#errorHost').waitFor();assert.equal(await page.locator('.absence-case-row').count(),0);assert.equal(await page.locator('#mainContent').isVisible(),false);
 checks.push('Denied access clears the previous nominal case and does not leave stale personnel visible.');
 const clock=await context.newPage();clock.on('pageerror',e=>errors.push(e.message));await clock.goto(origin+'/relojes-marcaciones.html');
 await clock.waitForFunction(()=>document.getElementById('clockOperations')?.dataset.state==='ready'&&document.getElementById('clockOperations').getAttribute('aria-busy')==='false');
 assert.equal(await clock.locator('#clockOverview').isVisible(),true);assert.equal(await clock.locator('#clockHourly button').count(),24);
 assert.match(await clock.locator('#clockCodeDistribution').innerText(),/102/);assert.match(await clock.locator('#clockCodeDistribution').innerText(),/51/);
 checks.push('The clock workspace opens on real-filter charts and reconciled declared entry/exit code counts, not a hidden analytics tab.');
 await clock.getByRole('button',{name:'Jornadas y cálculos',exact:true}).click();try{await clock.locator('#wdRows button').first().waitFor({timeout:10000});}catch(e){console.log(JSON.stringify({errors,status:await clock.locator('#wdStatus').textContent(),error:await clock.locator('#wdError').textContent(),workdayCalls:calls.filter(c=>c.resource.includes('workday')).map(c=>Object.fromEntries(c.query))}));throw e;}
 assert.equal(await clock.locator('[data-wd-time-bars]').count(),1);assert.match(await clock.locator('[data-wd-time-bars]').innerText(),/todo el filtro/);
 await clock.getByRole('button',{name:'Ver jornada',exact:true}).first().click();const comparison=clock.locator('#wdRows [data-workday-reference]').filter({has:clock.getByRole('heading',{name:'Comparación rápida de tiempo'})});
 const countBefore=calls.length;await comparison.getByRole('textbox').fill('08:00');await comparison.getByRole('button',{name:'Comparar tiempos',exact:true}).click();
 assert.match(await comparison.getByRole('status').innerText(),/Diferencia por debajo/);assert.match(await comparison.getByRole('status').innerText(),/No determina tiempo pagable/);assert.equal(calls.length,countBefore);
 await comparison.getByRole('textbox').fill('06:00');await comparison.getByRole('button',{name:'Comparar tiempos',exact:true}).click();assert.match(await comparison.getByRole('status').innerText(),/Excedente observado/);
 checks.push('A selected complete workday compares net intervals minus pauses with an entered duration, without a new request or salary mutation.');
 await clock.locator('#clockOperations').screenshot({path:path.join(out,'clock-time-desktop.png')});
 await clock.locator('#wdState').selectOption('review');await clock.waitForFunction(()=>document.getElementById('clockWorkdays').getAttribute('aria-busy')==='false'&&document.getElementById('wdRows').textContent.includes('107'));
 await clock.getByRole('button',{name:'Ver jornada',exact:true}).first().click();assert.equal(await clock.locator('#wdRows').getByRole('button',{name:'Comparar tiempos',exact:true}).count(),0);
 checks.push('A workday missing a punch is reviewed instead of being converted into a deficit or payable overtime.');
 await clock.setViewportSize({width:390,height:844});await clock.locator('#clockOperations').screenshot({path:path.join(out,'clock-time-mobile.png')});assert.ok(await clock.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 checks.push('Clock time details remain inside a responsive workspace on mobile.');
 assert.deepEqual(errors,[]);const report={version:'time-absence-workspace-qa.v1',checkedAt:new Date().toISOString(),mode:live?'published_bytes_synthetic_api':'local_build_synthetic_api',checksPassed:checks.length,checks,apiRequests:calls.length,publishedAssets:[...assets].sort(),errors,municipalSessionTested:false,businessWrites:0};
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await context.close();await browser.close();}
