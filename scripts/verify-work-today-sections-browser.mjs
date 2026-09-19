// Real built page; all private APIs use synthetic responses and no municipal sessions.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {createHash} from 'node:crypto';import {setTimeout as sleep} from 'node:timers/promises';
const published=process.argv.includes('--published'),origin=published?'https://municipio-junin-friendly.vercel.app':'https://tasks.test',root=path.resolve('public');
const out='verification/work-today-'+(published?'published':'local');fs.mkdirSync(out,{recursive:true});const checks=[],errors=[],requests=[];
const all=['workforce.summary.read','workforce.employee.read','actions.read','leave.request.area.create','leave.request.area.decide','payroll.novelty.read','payroll.novelty.prepare','payroll.novelty.approve','payroll.read','payroll.monthly_close.prepare','payroll.monthly_close.approve','legal.norm.read','legal.norm.register','attendance.read'];let caps=all;
if(published){const hash=b=>createHash('sha256').update(b).digest('hex');const files=['assets/internal-work-today.js','assets/internal-work-today-sections.css','internal-dashboard.html'];for(let attempt=0;;attempt++){try{for(const f of files){const r=await fetch(origin+'/'+f,{cache:'no-store',signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);assert.equal(hash(Buffer.from(await r.arrayBuffer())),hash(fs.readFileSync('public/'+f)));}break;}catch(e){if(attempt===24)throw e;await sleep(6000);}}const r=await fetch(origin+'/api/internal-data?resource=employees',{redirect:'error',signal:AbortSignal.timeout(15000)});assert.equal(r.status,401);fs.writeFileSync(out+'/publication.json',JSON.stringify({ok:true,anonymousStatus:401,checkedAt:new Date().toISOString(),files}));}
const browser=await chromium.launch({headless:true,...(process.env.QA_CHROMIUM?{executablePath:process.env.QA_CHROMIUM}:{})});let page;
try{
 const context=await browser.newContext({viewport:{width:1440,height:1080},serviceWorkers:'block'});
 await context.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();
  if(url.pathname.startsWith('/api/')){requests.push({method:req.method(),path:url.pathname});assert.equal(req.method(),'GET');
   if(url.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,user:{name:'Operador de prueba',email:'qa@example.invalid',role:'ADMIN_INTERNO'},access:{tenantCapabilities:caps,platformCapabilities:[],platformRoles:[]}}});
   return route.fulfill({json:{ok:true,data:[]}});
  }
  if(published)return route.continue();
  const pathname=['/personal','/internal-dashboard.html'].includes(url.pathname)?'/internal-dashboard.html':url.pathname;
  const file=path.resolve(root,'.'+decodeURIComponent(pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
  const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'};return route.fulfill({body:fs.readFileSync(file),contentType:types[path.extname(file)]||'application/octet-stream'});
 });
 page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/personal#inicio');const panel=page.locator('#workToday');await panel.waitFor();
 assert.equal(await panel.getAttribute('data-mode'),'prepare');assert.equal(await panel.locator('[data-work-today-other-modes] details').count(),2);
 const review=panel.locator('[data-work-today-mode=decide]'),consult=panel.locator('[data-work-today-mode=consult]');
 assert.equal(await review.locator('a').count(),3);const before=requests.length;
 await review.locator('summary').click();assert.equal(await review.locator('a:visible').count(),3);await consult.locator('summary').click();
 assert.equal(await panel.locator('[data-work-today-other-modes] a[href="/juridica"]:visible').count(),1);
 assert.equal(await consult.locator('a[href="/relojes"]:visible').count(),1);assert.match(await panel.innerText(),/no trámites pendientes/);
 assert.equal(requests.length,before);checks.push('mixed permissions expose preparation, review and consultation without new API requests');
 await review.locator('summary').focus();await page.keyboard.press('Enter');assert.equal(await review.getAttribute('open'),null);await page.keyboard.press('Space');assert.equal(await review.getAttribute('open'),'');
 await panel.screenshot({path:out+'/desktop.png'});checks.push('native disclosure supports Enter, Space and keyboard focus');
 for(const width of [390,320]){await page.setViewportSize({width,height:844});await page.emulateMedia({reducedMotion:'reduce'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.ok(await review.locator('summary').evaluate(n=>n.getBoundingClientRect().height>=44));await panel.screenshot({path:out+'/mobile-'+width+'.png'});}
 checks.push('320 and 390 px preserve readable actions and touch targets');
 await page.evaluate(base=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:new Set([...base,'payroll.parameter.read','payroll.parameter.prepare','payroll.parameter.approve','budget.approved.read']),platformCapabilities:new Set(['platform.users.manage']),platformRoles:new Set(['PLATFORM_OWNER'])}})),all);
 await panel.locator('[data-work-today-list] [data-work-today-card=parameters]').waitFor();
 assert.equal(await panel.locator('[data-work-today-mode=decide] [data-work-today-card=parameters]').count(),1);
 assert.equal(await panel.locator('[data-work-today-card=administration]').count(),1);assert.equal(await panel.locator('[data-work-today-card=budget]').count(),1);
 checks.push('parameter preparation and approval, approved budget and platform administration remain explicitly permission-bound');
 await page.evaluate(base=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:new Set(base),platformCapabilities:new Set(['platform.users.manage']),platformRoles:new Set()}})),all);
 assert.equal(await panel.locator('[data-work-today-card=administration]').count(),0);assert.equal(await panel.locator('[data-work-today-card=parameters]').count(),0);
 checks.push('revoking platform owner and parameter rights removes those links immediately');

 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:new Set(['workforce.employee.read','legal.norm.read']),platformCapabilities:new Set(),platformRoles:new Set()}})));
 assert.equal(await panel.getAttribute('data-mode'),'consult');assert.equal(await panel.locator('[data-work-today-other-modes] a').count(),0);assert.equal(await panel.locator('a').count(),2);assert.equal(await panel.locator('a[href="/nomina"],a[href="/novedades"]').count(),0);checks.push('capability downgrade removes old preparation and review links from DOM');
 await page.evaluate(()=>{document.documentElement.dataset.mcCapabilityState='denied';});await panel.waitFor({state:'hidden'});assert.equal(await panel.locator('a').count(),0);checks.push('denied session clears rather than merely covering previous task cards');
 caps=['workforce.summary.read','legal.norm.read','legal.norm.register'];await page.reload();await panel.waitFor();assert.equal(await panel.getAttribute('data-mode'),'prepare');assert.equal(await panel.locator('[data-work-today-list]>a').count(),1);assert.equal(await panel.locator('[data-work-today-list]>a').getAttribute('href'),'/juridica');assert.equal(await panel.locator('[data-work-today-mode=decide]').count(),0);checks.push('legal operator gets document work without fabricated salary actions');
 caps=['workforce.summary.read','payroll.novelty.prepare'];await page.reload();await panel.waitFor();assert.equal(await panel.getAttribute('data-mode'),'consult');assert.equal(await panel.locator('a[href="/novedades"]').count(),0);checks.push('action permission alone does not expose an inaccessible destination');
 assert.deepEqual(errors,[]);const result={ok:true,checksPassed:checks.length,checks,published,syntheticApis:true,realWrites:0,municipalSessionTested:false};fs.writeFileSync(out+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){fs.writeFileSync(out+'/error.txt',String(error.stack));if(page)await page.screenshot({path:out+'/error.png'}).catch(()=>{});throw error;}finally{await browser.close();}
