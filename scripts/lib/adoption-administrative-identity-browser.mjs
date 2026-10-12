// Real product component, API handler and SQL; isolated fictional authentication.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {chromium} from 'playwright';
export async function verifyAdoptionAdministrativeBrowser({handler,review,actor,revoke,restore,output,browserName,check}){
 assert.ok(['chrome','chromium'].includes(browserName));const root=fs.realpathSync(new URL('../..',import.meta.url)),origin='https://adoption-admin-qa.example',posts=[],errors=[];
 const browser=await chromium.launch({headless:true,...(browserName==='chrome'?{channel:'chrome'}:{})});let page;
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'es-AR',serviceWorkers:'block'});
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();
   if(url.pathname==='/api/internal-employment-adoption'){
    if(req.method()==='POST')posts.push(req.postData());const response={headers:{},setHeader(k,v){this.headers[k]=String(v);},status(n){this.statusCode=n;return this;},json(v){this.payload=v;return this;}};
    await handler({method:req.method(),url:url.pathname+url.search,query:Object.fromEntries(url.searchParams),headers:req.headers(),body:req.postData()},response);
    return route.fulfill({status:response.statusCode,headers:response.headers,json:response.payload});
   }
   if(url.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,user:{email:actor.actorEmail},access:{tenantCapabilities:['workforce.employee.read','employee.record.propose']}}});
   if(url.pathname==='/qa.html')return route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/employment-adoption-review.css"></head><body><section class="adoption-review"><div class="ar-body"><div data-ar-preparation></div></div></section><script type="module">import{mountAdoptionPreparation}from'/assets/employment-adoption-preparation-ui.js';import{verifiedAdoptionReview}from'/assets/employment-adoption-review-model.js';const c=mountAdoptionPreparation(document.querySelector('[data-ar-preparation]'),{isLive:()=>true});c.setReview(await verifiedAdoptionReview(${JSON.stringify(review).replaceAll('<','\\u003c')}));document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:new Set(['workforce.employee.read','employee.record.propose'])}}));</script></body></html>`});
   const file=path.resolve(root,'.'+url.pathname);if(req.method()!=='GET'||!url.pathname.startsWith('/assets/')||!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
   return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.css')?'text/css':'text/javascript'});
  });
  page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/qa.html');
  const panel=page.locator('[data-ar-preparation]'),ready=()=>page.waitForFunction(()=>document.querySelector('[data-ar-preparation]').getAttribute('aria-busy')==='false');
  await panel.locator('[data-ap-open]').click();await panel.locator('[data-ap-load]').click();await ready();
  assert.ok(await panel.locator('[data-ap-form]').isVisible());assert.ok(await panel.locator('[data-ap-reference]').isEnabled());check(true,'real product form enables the archived administrative author after actual API and SQL validation');
  await panel.locator('[data-ap-reference]').fill('Documento exclusivamente ficticio; no se guarda');await panel.locator('[data-ap-reason]').fill('Borrador sintético de prueba que no se envía');
  for(const width of[1440,390,320]){await page.setViewportSize({width,height:1000});assert.ok(await panel.evaluate(n=>n.scrollWidth<=n.clientWidth+1));assert.ok(await panel.locator('[data-ap-send]').evaluate(n=>n.getBoundingClientRect().height>=44));await page.screenshot({path:path.join(output,'adoption-admin-'+width+'.png')});check(true,'actual administrative preparation fits '+width+'px and preserves accessible controls');}
  await revoke();try{await panel.locator('[data-ap-load]').click();await ready();assert.ok(await panel.locator('[data-ap-form]').isHidden());assert.match(await panel.locator('[data-ap-status]').innerText(),/consultar, pero no preparar/);check(true,'database identity revocation withdraws preparation in the real component despite stale client capabilities');}finally{await restore();}
  assert.deepEqual(posts,[]);assert.deepEqual(errors,[]);check(true,'browser drafts, reads and revocation generate no POST or JavaScript error');
  fs.writeFileSync(path.join(output,'administrative-browser.json'),JSON.stringify({passed:true,browser:browserName,actualSql:true,actualHandler:true,syntheticAuthentication:true,posts:0,errors},null,2)+'\n',{flag:'wx'});
 }catch(e){fs.writeFileSync(path.join(output,'administrative-browser-failure.json'),JSON.stringify({error:e.message,errors,dom:page?await page.evaluate(()=>({hidden:document.hidden,status:document.querySelector('[data-ap-status]')?.textContent,openDisabled:document.querySelector('[data-ap-open]')?.disabled})).catch(()=>null):null},null,2)+'\n',{flag:'wx'});throw e;}finally{await browser.close();}
}
