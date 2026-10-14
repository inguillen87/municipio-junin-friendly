// Built UI with actual application handlers and loopback PostgreSQL supplied by
// the owned synthetic QA foundation. No production session or business writes.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { launchOwnSyntheticBrowser } from './own-synthetic-browser.mjs';
import { periodClassificationDefinition, preparePeriodClassification } from '../../assets/own-period-classification-model.js';

export async function verifyOwnPeriodClassificationBrowser({handlers,env,actors,setActor,period,contractId,employeeNumber,definition,bootstrap,output,check,browserName='chromium'}){
 assert.equal(browserName,'chromium');
 assert.equal(typeof handlers.classification,'function');assert.equal(typeof handlers.directory,'function');
 assert.equal(typeof employeeNumber,'string');assert.ok(employeeNumber.length>=2);
 const declaration=periodClassificationDefinition(definition,period),originalOrigin=env.INTERNAL_APP_ORIGIN;
 const root=fs.realpathSync(new URL('../../public',import.meta.url)),origin='http://127.0.0.1:4379',errors=[],writes=[],reads=[];
 const caps=['workforce.employee.read','payroll.read','payroll.parameter.read','payroll.parameter.prepare','payroll.parameter.approve','payroll.parameter.audit.read'];
 let current=actors.maker,allowed=true,drop=false,page,holding=null;
 const actor=a=>{current=a;setActor(a);};actor(current);env.INTERNAL_APP_ORIGIN=origin;
 const {browser}=await launchOwnSyntheticBrowser();
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1100},locale:'es-AR',serviceWorkers:'block'});
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();
   const kind=url.pathname==='/api/internal-own-period-classification'?'classification':url.pathname==='/api/internal-data'&&url.searchParams.get('resource')==='employees'?'directory':null;
   if(kind){
    let status=200,payload;const headers={};
    await handlers[kind]({method:req.method(),url:url.pathname+url.search,query:Object.fromEntries(url.searchParams),headers:req.headers(),body:req.postData()},{setHeader(k,v){headers[k]=String(v);},status(n){status=n;return this;},json(v){payload=v;return this;}});
    if(req.method()==='POST'){
     writes.push({status,key:req.headers()['idempotency-key'],body:JSON.parse(req.postData()).payload,receipt:payload?.data});
     if(drop&&payload?.ok){drop=false;return route.fulfill({status:503,json:{ok:false,error:'Respuesta exclusivamente sintética interrumpida después de guardar.'}});}
    }else reads.push({kind,resource:url.searchParams.get('resource')});
    const held=holding&&kind==='classification'&&req.method()==='GET'&&url.searchParams.get('resource')===holding.resource;
    if(held){holding.started();await holding.promise;}
    try{return await route.fulfill({status,headers,json:payload});}catch(error){if(held&&req.failure()?.errorText?.includes('ERR_ABORTED'))return;throw error;}
   }
   if(url.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,sessionVersion:2,user:{id:current.actorSessionId,email:current.actorEmail},access:{context:'tenant',tenant:{id:current.tenantId,roleKey:'QA'},tenantCapabilities:allowed?caps:[],platformCapabilities:[],platformRoles:[]},expiresAt:new Date(Date.now()+3600000).toISOString()}});
   if(url.pathname==='/api/internal-payroll-parameters')return route.fulfill({json:{ok:true,flags:{grhMutation:false,payrollCalculated:false,payrollPosted:false,currentCatalogVerified:false,proposalApproved:false},principal:{tenantId:current.tenantId,membershipId:current.membershipId,certifiedBindingId:current.bindingId,employmentLinked:false,capabilities:caps},proposals:[],total:0}});
   if(url.pathname==='/api/internal-data')return route.fulfill({json:{ok:true,status:'ready',sourcePolicy:{label:'QA SINTÉTICA'},latestClosed:{},currentOpen:{},runs:[],quality:{},limitations:[]}});
   if(url.pathname.startsWith('/api/'))return route.fulfill({status:403,json:{ok:false,error:'API ajena a la prueba sintética.'}});
   const file=path.resolve(root,url.pathname==='/nomina'?'nomina-control.html':'.'+url.pathname);
   if(req.method()!=='GET'||!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
   return route.fulfill({contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]??'application/octet-stream',body:fs.readFileSync(file)});
  });
  page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  const s=key=>page.locator('[data-classification-'+key+']'),panel=page.getByRole('region',{name:'Encuadre por período',exact:true});
  const idle=()=>page.waitForFunction(()=>document.querySelector('.own-period-classification')?.getAttribute('aria-busy')==='false');
  const fresh=async()=>{await page.goto('about:blank');await page.goto(origin+'/nomina#encuadre');await s('picker').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('[data-classification-target]')?.disabled===false);await idle();};
  const select=async()=>{
   await s('picker').click();const picker=page.locator('#periodClassificationPicker');
   await picker.getByLabel('Nombre, apellido o legajo').fill(employeeNumber);await picker.getByRole('button',{name:'Buscar',exact:true}).click();
   await picker.locator('input[value="'+contractId+'"]').check();await picker.getByRole('button',{name:'Usar este legajo',exact:true}).click();
   await s('period').fill(period);await s('refresh').click();await idle();await s('content').waitFor({state:'visible'});
  };
  const hidden=async value=>page.evaluate(v=>{Object.defineProperty(document,'hidden',{configurable:true,value:v});document.dispatchEvent(new Event('visibilitychange'));},value);
  const hold=resource=>{let start,release;const started=new Promise(resolve=>start=resolve),promise=new Promise(resolve=>release=resolve);holding={resource,started:start,promise,release};return {started,release:()=>{release();holding=null;}};};
  const fill=async()=>{for(const [key,value]of Object.entries(declaration))if(['agreementCode','categoryCode','organizationId','sectorCode','jurisdictionCode'].includes(key))await s(key).selectOption(value??'');else await s(key).fill(value??'');await s('reason').fill('Encuadre del mes exclusivamente sintético de navegador QA');};
  const before=await bootstrap();assert.equal(before.preparation.contractId,contractId);assert.equal(before.preparation.period,period);
  await fresh();await select();assert.equal(writes.length,0);
  for(const key of Object.keys(declaration))assert.equal(await s(key).inputValue(),'');
  check(true,'built classification query keeps every code and date blank and issues zero writes');
  check((await s('provenance').innerText()).includes(before.preparation.source.provenance.registrationId),'built panel shows the immutable own provenance separately from the explicit declaration');
  for(const width of [390,320]){
   await page.setViewportSize({width,height:1000});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'classification panel has no page overflow at '+width+'px');
   check(await s('picker').evaluate(e=>e.getBoundingClientRect().height>=44),'classification legajo picker has a44px mobile target at '+width+'px');
   await panel.screenshot({path:path.join(output,'period-classification-mobile-'+width+'.png')});
  }
  await page.setViewportSize({width:1440,height:1100});await fill();
  const late=hold('bootstrap');await s('refresh').click();await late.started;await hidden(true);late.release();await idle();
  assert.ok(await s('content').isHidden());assert.equal(await s('subject').innerText(),'No hay un legajo seleccionado.');assert.equal(await s('provenance').innerText(),'');
  await hidden(false);await s('access').click();await idle();await s('refresh').click();await idle();
  for(const [key,value]of Object.entries(declaration))assert.equal(await s(key).inputValue(),value??'');
  check(writes.length===0,'late hidden-page source responses cannot restore nominal views; exact draft returns only after the same context is rechecked');
  await s('prepare').click();await idle();await s('comparison').waitFor({state:'visible'});
  assert.ok((await s('operation').innerText()).includes('requiere una decisión de otra persona'));
  await s('confirm').check();drop=true;await s('send').click();await idle();assert.equal(writes.length,1);
  const pending=structuredClone(writes[0]);assert.ok([200,201].includes(pending.status));
  assert.deepEqual(pending.body,preparePeriodClassification(before.preparation,declaration,'Encuadre del mes exclusivamente sintético de navegador QA'));
  assert.ok(await s('recover').isVisible());assert.ok(await s('period').isDisabled());assert.ok(await s('retry').isHidden());
  await hidden(true);assert.ok(await s('content').isHidden());assert.equal(await s('startDate').inputValue(),'');await hidden(false);
  allowed=false;await s('access').click();await idle();assert.ok(await s('recover').isDisabled());assert.equal(writes.length,1);
  allowed=true;await s('access').click();await idle();await s('recover').click();await idle();assert.ok(await s('receipt').isVisible());assert.equal(writes.length,1);assert.deepEqual(writes[0],pending);
  check(reads.some(r=>r.resource==='attempt'),'read-only attempt recovery preserves the exact original proposal body and key after simulated access withdrawal');
  actor(actors.maker);await fresh();await select();await panel.getByText('Propuestas y decisiones anteriores',{exact:true}).click();
  await s('proposal').selectOption(pending.receipt.proposalId);await s('open').click();await idle();assert.ok(await s('review').isDisabled());
  check(writes.length===1,'the actual preparer cannot review its own saved classification proposal');
  actor(actors.checker);await fresh();await select();await panel.getByText('Propuestas y decisiones anteriores',{exact:true}).click();
  await s('proposal').selectOption(pending.receipt.proposalId);const lateDetail=hold('detail');await s('open').click();await lateDetail.started;
  allowed=false;await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready')));lateDetail.release();await idle();
  assert.ok(await s('content').isHidden());assert.equal(await s('detail').innerText(),'');assert.equal(await s('categoryCode').locator('option').count(),1);assert.ok(await s('send').isHidden());assert.equal(writes.length,1);
  check(true,'a late decision-detail response after access withdrawal cannot repopulate nominal fields, catalogue choices or decision controls');
  allowed=true;await fresh();await select();await panel.getByText('Propuestas y decisiones anteriores',{exact:true}).click();
  await s('proposal').selectOption(pending.receipt.proposalId);await s('open').click();await idle();assert.ok(await s('review').isEnabled());
  await s('search').fill('búsqueda sintética sin coincidencias');assert.ok(await s('review').isDisabled());assert.ok(await s('comparison').isHidden());
  await s('search').fill('');await s('proposal').selectOption(pending.receipt.proposalId);await s('open').click();await idle();
  await s('decision').selectOption('approve');await s('decision-reason').fill('Revisión independiente exclusivamente sintética de navegador QA');await s('review').click();await idle();
  await s('confirm').check();await s('send').click();await idle();assert.equal(writes.length,2);assert.equal(writes[1].body.command,'approve');
  assert.equal(writes[1].body.proposalId,pending.receipt.proposalId);assert.equal(writes[1].body.proposalSha256,pending.receipt.requestSha256);assert.equal(writes[1].body.definition,null);assert.equal(writes[1].body.provenance,null);assert.ok(await s('receipt').isVisible());
  check(true,'independent built review stores only the references to the original complete classification and records no payroll calculation');
  actor(actors.maker);await fresh();await select();const latest=await bootstrap();assert.deepEqual(latest.configuration.definition,declaration);
  for(const key of Object.keys(declaration))assert.equal(await s(key).inputValue(),'');
  assert.ok((await s('approved').innerText()).includes(declaration.documentReference));await panel.screenshot({path:path.join(output,'period-classification-desktop.png')});
  assert.deepEqual(errors,[]);check(true,'new verified consultation displays the approved declaration separately and never autocompletes a new draft');
  fs.writeFileSync(path.join(output,'period-classification-browser-proof.json'),JSON.stringify({ok:true,browser:browserName,actualHandlers:true,actualSql:true,syntheticAuth:true,syntheticOnly:true,productiveBusinessWrites:0,writes:writes.length,reads:reads.length,errors},null,2)+'\n');
 }catch(error){if(page&&!page.isClosed())await page.screenshot({path:path.join(output,'period-classification-browser-failure.png'),fullPage:true});throw error;}
 finally{holding?.release();allowed=true;actor(actors.maker);if(originalOrigin===undefined)delete env.INTERNAL_APP_ORIGIN;else env.INTERNAL_APP_ORIGIN=originalOrigin;await browser.close();}
}
