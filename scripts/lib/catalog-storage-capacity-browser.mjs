// Compiled Personas product, actual isolated HTTP handler and synthetic data only.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {chromium} from 'playwright';
export async function verifyCatalogCapacityBrowser(h){
 const{handlers,env,qa,ok:check,destination:output,request}=h,root=fs.realpathSync(new URL('../../public',import.meta.url)),origin='http://127.0.0.1:4371',oldOrigin=env.INTERNAL_APP_ORIGIN;
 assert.ok(['chrome','chromium'].includes(h.browserName));const actor=qa.actors.maker,caps=['workforce.employee.read','employee.catalog.propose','employee.catalog.approve','payroll.read'];
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:h.browserName==='chrome'?{channel:'chrome'}:{})});
 let fault='capacity';const posts=[],errors=[],external=[];env.INTERNAL_APP_ORIGIN=origin;
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'es-AR',serviceWorkers:'block'});
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());if(u.origin!==origin){external.push(u.origin);return route.abort();}
   if(u.pathname==='/api/internal-employment-catalog'){
    if(req.method()==='POST'){posts.push({key:req.headers()['idempotency-key'],bytes:req.postData()});if(fault){const code=fault==='capacity'?'NATIVE_EMPLOYMENT_CATALOG_CAPACITY_LIMIT':'NATIVE_EMPLOYMENT_CATALOG_BUSY';fault=null;return route.fulfill({status:409,json:{ok:false,code}});}}
    let status=200,payload;const headers={};await handlers.catalog({method:req.method(),url:u.pathname+u.search,query:Object.fromEntries(u.searchParams),headers:req.headers(),body:req.postData()},{setHeader(k,v){headers[k]=String(v);},status(n){status=n;return this;},json(v){payload=v;return this;}});return route.fulfill({status,headers,json:payload});
   }
   if(u.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,sessionVersion:2,user:{id:actor.actorSessionId,email:actor.actorEmail,role:'municipality_admin'},access:{context:'tenant',tenant:{id:actor.tenantId,roleKey:'MUNICIPIO_ADMIN_OPERATIVO'},tenantCapabilities:caps,platformCapabilities:[],platformRoles:[]},expiresAt:new Date(Date.now()+3600000).toISOString()}});
   if(u.pathname==='/api/internal-data')return route.fulfill({json:{ok:true,status:'ready',sourcePolicy:{label:'QA SINTÉTICA'},latestClosed:{},currentOpen:{},runs:[],quality:{},limitations:[]}});
   if(u.pathname.startsWith('/api/'))return route.fulfill({status:403,json:{ok:false,error:'API fuera del recorrido sintético.'}});
   const file=path.resolve(root,u.pathname==='/personal'?'internal-dashboard.html':'.'+u.pathname);if(req.method()!=='GET'||!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
   return route.fulfill({contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]??'application/octet-stream',body:fs.readFileSync(file)});
  });
  const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/personal#legajos');await page.locator('[data-employment-catalog]').click();
  const dialog=page.getByRole('dialog',{name:'Catálogo de encuadres',exact:true});await dialog.getByRole('button',{name:'Preparar cambios',exact:true}).click();
  const label=dialog.locator('[data-ec-rows] input').nth(1);await label.fill('Descripción cambiada exclusivamente sintética QA');await label.dispatchEvent('input');
  const reason='Revisión completa exclusivamente sintética QA';await dialog.locator('[data-ec-reason]').fill(reason);await dialog.getByRole('button',{name:'Enviar a revisión',exact:true}).click();
  await dialog.locator('[data-ec-status]').filter({hasText:'No hay espacio suficiente'}).waitFor();assert.equal(await dialog.locator('[data-ec-reason]').inputValue(),reason);assert.equal(await label.inputValue(),'Descripción cambiada exclusivamente sintética QA');assert.doesNotMatch(await dialog.locator('[data-ec-status]').innerText(),/catálogo.*cambió/i);
  check(posts.length===1,'capacity message is accurate, preserves the complete draft/reason and triggers no automatic second POST');
  for(const width of[390,320]){await page.setViewportSize({width,height:900});assert.equal(await dialog.locator('[data-ec-reason]').inputValue(),reason);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await dialog.evaluate(n=>{n.scrollTop=0;});await dialog.locator('[data-ec-status]').scrollIntoViewIfNeeded();await dialog.screenshot({path:path.join(output,'catalog-capacity-'+width+'.png')});}
  check(true,'capacity recovery draft and actionable message remain accessible at 390 and 320 pixels');await page.setViewportSize({width:1440,height:1000});
  fault='busy';await dialog.getByRole('button',{name:'Enviar a revisión',exact:true}).click();await dialog.locator('[data-ec-status]').filter({hasText:'Hay otra operación en curso'}).waitFor();
  assert.ok(await dialog.locator('[data-ec-send]').isDisabled());assert.ok(await dialog.locator('[data-ec-reason]').isDisabled());assert.equal(posts.length,2);const busy=structuredClone(posts[1]);
  check(true,'BUSY locks new preparations and retains one voluntary recoverable attempt');
  await dialog.getByRole('button',{name:'Consultar confirmación',exact:true}).click();await dialog.getByRole('button',{name:'Reenviar el mismo intento',exact:true}).waitFor({state:'visible'});await dialog.getByRole('button',{name:'Reenviar el mismo intento',exact:true}).click();
  await dialog.locator('[data-ec-status]').filter({hasText:'Propuesta enviada a revisión'}).waitFor();assert.equal(posts.length,3);assert.deepEqual(posts[2],busy);
  const stored=(await request('catalog')).proposals.filter(p=>p.reason===reason);assert.equal(stored.length,1);check(true,'404 recovery followed by explicit resend reuses exact body/key and stores exactly one proposal');
  await dialog.screenshot({path:path.join(output,'catalog-capacity-desktop.png')});assert.deepEqual(errors,[]);assert.deepEqual(external,[]);check(true,'compiled browser has no page errors or external data traffic');
  const result={version:'catalog-capacity-browser.v1',syntheticOnly:true,posts:posts.length,sameAttemptBodyAndKey:true,capacityDraftPreserved:true,automaticRetries:0,storedProposals:1,widths:[1440,390,320],pageErrors:0,externalRequests:0};fs.writeFileSync(path.join(output,'catalog-capacity-browser-proof.json'),JSON.stringify(result,null,2)+'\n');await context.close();return result;
 }finally{env.INTERNAL_APP_ORIGIN=oldOrigin;await browser.close();}
}
