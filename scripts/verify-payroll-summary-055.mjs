/** Real legajo UI; every API response is synthetic, including in published-asset mode. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {syntheticEmployee as employee, syntheticSummaries} from './payroll-summary-synthetic.mjs';

const live=process.env.SUMMARY_LIVE_ASSETS==='1';
const origin=live?'https://municipio-junin-friendly.vercel.app':(process.env.SUMMARY_TEST_ORIGIN||'https://municontrol.test');
const root=path.resolve(process.env.SUMMARY_ROOT||'public'),out=path.resolve('verification/summary-055'+(live?'-published':''));
fs.mkdirSync(out,{recursive:true});
const items=syntheticSummaries(),requests=[],checks=[],errors=[];
let drift=false,denied=false,slow=false,downloads=0,slowResponse=null,releaseSlowResponse=null;
const operational={version:'workforce-operational.v1',selectedStatus:'administrative_active',totalContracts:1,totalPeople:1,activeContracts:1,activePeople:1,payrollIncluded:1,activeOutsidePayroll:0,inactiveContracts:0,stateErrorContracts:0,unknownContracts:0,multipleActiveContracts:0,multipleActivePeople:0,lastClosedContracts:1,lastClosedMonth:'2026-07-01',sourceCutoffFrom:'2026-08-06T18:15:21Z',sourceCutoffTo:'2026-08-06T18:15:21Z',snapshotFrom:'2026-08-31',snapshotTo:'2026-08-31'};
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
try {
  const context=await browser.newContext({viewport:{width:1240,height:960},acceptDownloads:true,serviceWorkers:'block'});
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==origin)return route.abort();
    if(!url.pathname.startsWith('/api/')) {
      if(live)return route.continue();
      const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
      if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
      return route.fulfill({contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'application/octet-stream',body:fs.readFileSync(file)});
    }
    const resource=url.searchParams.get('resource');
    let payload={ok:true,data:[]};
    if(url.pathname==='/api/internal-auth')payload={ok:true,authenticated:true,user:{name:'Operador sintético QA',email:'qa@example.invalid',role:'ADMIN_INTERNO'},access:{tenantCapabilities:['workforce.employee.read','workforce.summary.read','payroll.read'],platformCapabilities:[],platformRoles:[]}};
    else if(resource==='employees')payload={ok:true,data:[employee],pagination:{page:1,limit:25,total:1,pages:1},scope:{totalContracts:1,totalPeople:1,matched:1,ambiguous:0,unmatched:0},operational,facets:{sectors:[],organizations:[],agreements:[]}};
    else if(resource==='employee')payload={ok:true,data:{...employee,employmentHistory:[],ausencias:[],licencias:[],familiares:[],movements:[],personas:{available:false}},meta:{}};
    else if(resource==='employeepayroll') {
      const query=Object.fromEntries(url.searchParams);requests.push(query);
      assert.equal(query.contractId,employee.contractId);
      if(slow)await slowResponse;
      else if(query.year==='2024')await new Promise(resolve=>setTimeout(resolve,350));
      if(denied)return route.fulfill({status:403,json:{ok:false,error:'La sesión ya no tiene permiso de consulta de nómina.'}});
      const year=url.searchParams.get('year'),page=Number(query.page||1),limit=Number(query.limit||12);
      const filtered=items.filter(i=>!year||String(i.sourcePeriod)===year);
      payload={ok:true,data:{items:filtered.slice((page-1)*limit,page*limit).map(i=>({...i,...(drift?{netPayable:'940.00'}:{})}))},meta:{pagination:{total:filtered.length,page,pages:Math.max(1,Math.ceil(filtered.length/limit))}}};
    }
    return route.fulfill({status:200,json:payload});
  });
  const page=await context.newPage();page.setDefaultTimeout(20000);
  page.on('pageerror',error=>errors.push(error.message));page.on('download',()=>downloads++);
  await page.goto(origin+'/internal-dashboard.html#legajos');
  await page.locator('#employeeRows button').first().click();
  await page.getByRole('button',{name:'Ver liquidaciones',exact:true}).click();
  const history=page.locator('#employeePayrollHistory'),cards=history.locator('.payroll-card');
  await cards.first().waitFor();assert.equal(await cards.count(),12);
  assert.match(await history.locator('.payroll-history-meta').innerText(),/12 de 25/);
  checks.push('real API nombre shape renders the legajo without fictitious name alias');
  assert.match(await cards.first().innerText(),/No informado/);
  const before=requests.length;
  let download=page.waitForEvent('download');await cards.first().locator('[data-payroll-summary-download]').click();
  const file=await download;assert.match(file.suggestedFilename(),/legajo-0057-2026-08-31-M\.pdf$/);
  await file.saveAs(path.join(out,'summary-missing-qa.pdf'));assert.equal(await file.failure(),null);
  assert.ok(fs.readFileSync(path.join(out,'summary-missing-qa.pdf')).subarray(0,8).toString().startsWith('%PDF-1.4'));
  assert.equal(requests.length,before+1);assert.match(await cards.first().locator('.payroll-summary-status').innerText(),/generado.*no informados/);
  checks.push('reported null-amount case downloads a real PDF after a new authorized read');
  const action=await cards.first().locator('[data-payroll-summary-download]').boundingBox();
  const status=await cards.first().locator('.payroll-summary-status').boundingBox();
  assert.ok(action.width>=180,'desktop button not compressed');assert.ok(status.y>=action.y+action.height-1);assert.ok(status.width>=action.width*2.5);
  assert.equal(await cards.first().locator('[data-payroll-summary-download]').getAttribute('aria-busy'),null);
  checks.push('actions have useful widths; status is a separate full-width row; loading state clears');
  for(const [index,name] of [[1,'summary-complete-qa.pdf'],[2,'summary-difference-qa.pdf']]){
    download=page.waitForEvent('download');await cards.nth(index).locator('[data-payroll-summary-download]').click();await(await download).saveAs(path.join(out,name));
  }
  checks.push('complete and mismatched closed source summaries also download');
  await cards.first().scrollIntoViewIfNeeded();
  await page.locator('#employeeDialog').screenshot({path:path.join(out,'history-desktop-qa.png')});
  const prior=downloads;drift=true;
  await cards.first().locator('[data-payroll-summary-download]').click();
  await page.waitForFunction(()=>document.querySelector('.payroll-summary-status[data-error=true]')?.textContent.includes('cambiaron'));
  assert.equal(downloads,prior);drift=false;checks.push('changed amounts cancel the export rather than downloading stale data');
  denied=true;await cards.first().locator('[data-payroll-summary-download]').click();
  await page.waitForFunction(()=>document.querySelector('.payroll-summary-status[data-error=true]')?.textContent.includes('permiso'));
  assert.equal(downloads,prior);denied=false;checks.push('permission loss blocks download and exposes a readable error');
  const year=history.getByRole('spinbutton',{name:'Año del historial'});
  await year.fill('2025');await history.getByRole('button',{name:'Buscar año',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.payroll-history-meta')?.textContent.includes('en 2025'));
  assert.equal(requests.at(-1).year,'2025');assert.equal(requests.at(-1).page,'1');assert.equal(await cards.count(),12);
  assert.match(await cards.first().innerText(),/diciembre de 2025/);
  checks.push('year search queries the complete server history and resets pagination');
  await year.fill('1999');await history.getByRole('button',{name:'Buscar año',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.payroll-history-meta')?.textContent.includes('0 de 0'));
  assert.equal(await cards.count(),0);assert.match(await history.innerText(),/No hay liquidaciones.*1999/);
  checks.push('empty years do not silently restore another period');
  await year.fill('2024');await history.getByRole('button',{name:'Buscar año',exact:true}).click();
  await year.fill('2026');await history.getByRole('button',{name:'Buscar año',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.payroll-history-meta')?.textContent.includes('en 2026'));
  await page.waitForTimeout(500);assert.equal(await cards.count(),8);assert.match(await cards.first().innerText(),/agosto de 2026/);
  checks.push('late responses cannot replace a newly selected year');
  await history.getByRole('button',{name:'Ver todo el historial',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.payroll-history-meta')?.textContent.includes('12 de 25'));
  await history.getByRole('button',{name:'Ver períodos anteriores',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.payroll-history-meta')?.textContent.includes('24 de 25'));
  assert.equal(requests.at(-1).page,'2');assert.equal(await cards.count(),24);
  checks.push('reset and load-more preserve the actual scope and loaded count');
  await history.getByRole('button',{name:'Ver todo el historial',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.payroll-history-meta')?.textContent.includes('12 de 25'));
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  await cards.first().scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.ok(await page.locator('#employeeDialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  download=page.waitForEvent('download');await cards.first().locator('[data-payroll-summary-download]').click();await(await download).saveAs(path.join(out,'summary-mobile-qa.pdf'));
  await page.locator('#employeeDialog').screenshot({path:path.join(out,'history-mobile-qa.png')});
  checks.push('mobile download works with bounded dialog, stacked buttons and reduced motion');
  const previousDownloads=downloads;slow=true;
  slowResponse=new Promise(resolve=>{releaseSlowResponse=resolve;});
  const request=page.waitForRequest(r=>r.url().includes('resource=employeepayroll'));
  await cards.first().locator('[data-payroll-summary-download]').click();await request;
  await page.getByRole('button',{name:'Cerrar ficha',exact:true}).click();
  assert.equal(await page.locator('#employeeDialog').isVisible(),false);
  releaseSlowResponse();await page.waitForTimeout(600);
  assert.equal(downloads,previousDownloads);assert.equal(await page.locator('#employeeDialog').isVisible(),false);
  checks.push('closing the legajo during revalidation cancels its download');
  assert.deepEqual(errors,[]);
  const result={checksPassed:checks.length,checks,errors,downloads,historyRequests:requests.length,syntheticApiOnly:true,realMunicipalSessionTested:false,publishedAssets:live,browser:browser.version()};
  fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
} catch(error) {
  fs.writeFileSync(path.join(out,'error.txt'),String(error.stack));throw error;
} finally {await browser.close();}
