// Built components with authentic synthetic PostgreSQL snapshots. Transport is
// intercepted; this is not a municipal session or a whole-product-page check.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {readAdoptedCloseSqlFixture} from './verify-adopted-own-payroll-close-contract.mjs';
import {OWN_CLOSE_WRITE} from '../assets/own-payroll-close-model.js';import {ownReportDocument} from '../assets/own-payroll-report-model.js';import {reportCsv} from '../assets/report-document.js';
const args={};for(const a of process.argv.slice(2)){const m=/^--(fixture|output)=(.+)$/.exec(a);assert.ok(m);assert.equal(args[m[1]],undefined);args[m[1]]=m[2];}
const root=fs.realpathSync(new URL('../public/',import.meta.url)),outRoot=fs.realpathSync(new URL('../verification/',import.meta.url)),output=path.resolve(args.output),relative=path.relative(outRoot,fs.realpathSync(path.dirname(output)));
assert.ok(!relative.startsWith('..')&&!path.isAbsolute(relative)&&!fs.existsSync(output));fs.mkdirSync(output);
const {fixture,bundle,report:sqlReport}=await readAdoptedCloseSqlFixture(args.fixture);assert.ok(fixture.partialBefore&&fixture.actor);
const style=fs.readFileSync(path.join(root,'nomina-control.html'),'utf8').match(/<style>([\s\S]*?)<\/style>/);assert.ok(style);
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}),context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1100}});
let page,checks=0,denied=false,stale=false,closeRecovered=false,downloads=0;const errors=[],posts=[];const check=(v,label)=>{assert.ok(v,label);checks++;};
try{
 await context.addInitScript(key=>{crypto.randomUUID=()=>key;},fixture.partial.key);
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url()),json=(value,status=200)=>route.fulfill({status,json:value});
  if(url.pathname==='/qa.html'){
   const close=url.searchParams.get('task')==='cierre',mount=close?'mountOwnPayrollClose':'mountOwnPayrollReports',file=close?'own-payroll-close-panel':'own-payroll-report-panel',task=close?'cierre':'reportes';
   return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QA sintética de cierre e informes propios</title><style>${style[1]}</style><link rel="stylesheet" href="/assets/municontrol-enterprise.css"><main style="padding:12px;max-width:1200px;margin:auto"><section id="qa"></section></main><script type="module">import{${mount}}from"/assets/${file}.js";${mount}(document.getElementById('qa'));document.dispatchEvent(new CustomEvent('taskchange',{detail:{id:'${task}'}}));</script></html>`});
  }
  if(url.pathname==='/api/internal-auth')return json(denied?{ok:false,code:'FORBIDDEN'}:{ok:true,authenticated:true,sessionVersion:2,user:{id:fixture.actor.actorSessionId,email:fixture.actor.actorEmail},access:{context:'tenant',tenant:{id:fixture.actor.tenantId,roleKey:'QA'},tenantCapabilities:OWN_CLOSE_WRITE},expiresAt:new Date(Date.now()+3600000).toISOString()},denied?403:200);
  if(url.pathname==='/api/internal-own-payroll-close'){
   if(request.method()==='POST'){posts.push({body:request.postDataJSON(),key:request.headers()['idempotency-key']});assert.deepEqual(posts.at(-1),{body:{operation:'command',payload:fixture.partial.body},key:fixture.partial.key});return json({ok:false,error:'Acuse sintético perdido después del cierre'},503);}
   const resource=url.searchParams.get('resource');
   if(resource==='attempt'){assert.equal(url.searchParams.get('key'),fixture.partial.key);closeRecovered=true;return json({ok:true,data:{...fixture.partial,replayed:true}});}
   if(resource==='detail')return json({ok:true,data:page.url().includes('task=cierre')&&!closeRecovered?fixture.partialBefore:stale?fixture.partialBefore:fixture.detail});
   if(resource==='group'){assert.equal(url.searchParams.get('id'),fixture.receipt.groupId);return json({ok:true,data:fixture.receipt});}
   throw Error('Unreviewed synthetic resource');
  }
  if(url.pathname.startsWith('/assets/')){const file=path.resolve(root,'.'+url.pathname),r=path.relative(root,file);assert.ok(!r.startsWith('..')&&!path.isAbsolute(r)&&fs.existsSync(file));return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'image/svg+xml',body:fs.readFileSync(file)});}
  throw Error('Unexpected network request: '+url.pathname);
 });
 page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('download',()=>downloads++);
 const report=k=>page.locator('[data-report-'+k+']'),close=k=>page.locator('[data-close-'+k+']');
 const settled=selector=>page.waitForFunction(s=>document.querySelector(s)?.getAttribute('aria-busy')==='false',selector,{timeout:15000});
 const consult=async()=>{await report('from').fill(fixture.detail.period);await report('to').fill(fixture.detail.period);await report('types').selectOption('monthly');await report('consult').click();await settled('.own-report');await report('result').waitFor({state:'visible'});};
 const csv=async name=>{const wait=page.waitForEvent('download');await report('csv').click();const d=await wait,file=path.join(output,name+'.csv');await d.saveAs(file);await settled('.own-report');return fs.readFileSync(file,'utf8');};
 await page.goto('https://municontrol.test/qa.html?task=reportes');await report('status').waitFor();await consult();
 check(await report('rows').locator('tr').count()===25,'first page displays 25 of 29 real SQL participants');check(posts.length===0,'consultation performs no write');
 await report('next').click();check(await report('rows').locator('tr').count()===4,'second page retains remaining participants');
 await report('search').fill('A/3501');check(await report('rows').locator('tr').count()===1,'search only changes the view');
 assert.equal(await csv('complete-with-search'),reportCsv(ownReportDocument(bundle)));checks++;
 await report('ranges').locator('summary').click();await report('contracts').selectOption(fixture.partial.body.selection.values);
 check(await report('rows').locator('tr').count()===1,'exact opaque selection keeps its UUID destination');
 const one=await csv('exact-opaque');check(one.split('\r\n').length===3&&one.includes('A/3501'),'CSV contains exact selected participation, independent of search');
 for(const format of ['pdf','xlsx']){const wait=page.waitForEvent('download');await report(format).click();const d=await wait;await d.saveAs(path.join(output,'exact-opaque.'+format));await settled('.own-report');check(fs.statSync(path.join(output,'exact-opaque.'+format)).size>100,'voluntary exact '+format+' export');}
 await report('clear-contracts').click();await report('employeeFrom').fill('1');check(await report('csv').isDisabled()&&(await report('status').textContent()).includes('No se omitieron filas'),'numeric range refuses opaque population globally');
 await report('employeeFrom').fill('');check(await report('csv').isEnabled(),'clearing incompatible numeric range restores complete report');
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});await report('csv').scrollIntoViewIfNeeded();check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'report fits '+width+'px');const box=await report('csv').boundingBox();check(box.height>=44,'accessible report action '+width+'px');check(await report('rows').locator('tr').first().locator('td').nth(2).evaluate(cell=>{const range=document.createRange();range.selectNodeContents(cell);return range.getClientRects().length===1;}),'exact identifier stays readable on one line '+width+'px');await page.screenshot({path:path.join(output,'report-'+width+'.png')});}
 const beforeStale=downloads;stale=true;await report('csv').click();await settled('.own-report');check(downloads===beforeStale&&await report('result').isHidden(),'changed original closed census invalidates download');stale=false;await consult();
 await report('to').fill('2026-12');check(await report('result').isHidden()&&await report('contracts').locator('option').count()===0,'changed period removes nominal choices and report');await consult();
 denied=true;const beforeDenied=downloads;await report('csv').click();await settled('.own-report');check(downloads===beforeDenied&&await report('result').isHidden()&&await report('contracts').locator('option').count()===0,'fresh revocation removes all nominal sources before download');denied=false;
 await page.goto('https://municontrol.test/qa.html?task=cierre');await close('status').waitFor();await settled('.own-close');await close('period').fill(fixture.detail.period);await close('type').selectOption('monthly');await close('consult').click();await settled('.own-close');await close('detail').waitFor({state:'visible'});
 check(await close('rows').locator('tr').count()===25,'close review spans full real SQL roster');await close('search').fill('A/3501');check(await close('rows').locator('tr').count()===1,'close search retains exact adopted source identifier');
 await close('kind').selectOption('contracts');await close('values').selectOption(fixture.partial.body.selection.values);await close('reason').fill(fixture.partial.body.reason);await close('confirm').check();await close('send').click();await settled('.own-close');
 check(posts.length===1,'voluntary close issues one exact original command');check(await close('fields').evaluate(f=>f.disabled)&&await close('period').isDisabled(),'lost acknowledgement freezes original body and key');
 await close('recover').click();await settled('.own-close');await close('historic').waitFor({state:'visible'});check((await close('historic-rows').textContent()).includes('A/3501'),'GET recovery verifies actual original SQL opaque close snapshot');check(posts.length===1,'recovery never initiates another close');
 for(const width of [390,320]){await page.setViewportSize({width,height:1000});await close('historic').scrollIntoViewIfNeeded();check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'close fits '+width+'px');await page.screenshot({path:path.join(output,'close-'+width+'.png')});}
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:[]}})));check(await close('detail').isHidden()&&await close('historic').isHidden(),'revocation purges current and historic nominal close data');
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));check(await close('historic-rows').locator('tr').count()===0,'hidden/closed page retains no historical rows');check(errors.length===0,'no unhandled component errors');
 const result={ok:true,checksPassed:checks,sqlChecks:sqlReport.sqlChecks,sqlPopulation:29,componentUi:true,completeProductPageVerified:false,syntheticTransport:true,resultFromActualPostgres:true,interceptedPosts:posts.length,municipalWrites:0,municipalSessionVerified:false};
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(e){fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({checks,errors,posts:posts.length,error:e.stack},null,2));if(page)await page.screenshot({path:path.join(output,'failure-synthetic.png')});throw e;}
finally{await browser.close();}
