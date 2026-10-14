// Built desktop/mobile UI, actual HTTP handlers and actual loopback SQL.
// No production sessions, municipal identities or external traffic are used.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {launchOwnSyntheticBrowser} from './own-synthetic-browser.mjs';
import {conditionsDraft,conditionsCsv,conditionsFile} from '../../assets/own-contract-salary-conditions-workspace.js';
export async function verifySalaryConditionsBrowser({handlers,env,actors,setActor,period,output,check,bootstrap,revoke,restore,browserName='chromium'}){
 assert.equal(browserName,'chromium');const root=fs.realpathSync(new URL('../../public',import.meta.url)),origin='http://127.0.0.1:4371',errors=[],writes=[],reads=[];
 const caps=['workforce.employee.read','payroll.parameter.read','payroll.parameter.prepare','payroll.parameter.approve','payroll.calculation.nominal.read'];
 let current=actors.maker,allowed=true,drop=false,page;const actor=a=>{current=a;setActor(a);};actor(current);env.INTERNAL_APP_ORIGIN=origin;
 const{browser}=await launchOwnSyntheticBrowser();
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1100},locale:'es-AR',serviceWorkers:'block'});
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.abort();
   if(u.pathname==='/api/internal-own-contract-salary-conditions'){
    let status=200,payload;const headers={};await handlers.salaryConditions({method:req.method(),url:u.pathname+u.search,query:Object.fromEntries(u.searchParams),headers:req.headers(),body:req.postData()},{setHeader(k,v){headers[k]=String(v);},status(n){status=n;return this;},json(v){payload=v;return this;}});
    if(req.method()==='POST'){writes.push({status,key:req.headers()['idempotency-key'],body:JSON.parse(req.postData()).payload,receipt:payload?.data});if(drop&&payload?.ok){drop=false;return route.fulfill({status:503,json:{ok:false,error:'Respuesta sintética interrumpida después de conservar la propuesta.'}});}}
    else reads.push({resource:u.searchParams.get('resource')});return route.fulfill({status,headers,json:payload});
   }
   if(u.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,sessionVersion:2,user:{id:current.actorSessionId,email:current.actorEmail},access:{context:'tenant',tenant:{id:current.tenantId,roleKey:'QA'},tenantCapabilities:allowed?caps:[],platformCapabilities:[],platformRoles:[]},expiresAt:new Date(Date.now()+3600000).toISOString()}});
   if(u.pathname==='/api/internal-payroll-parameters')return route.fulfill({json:{ok:true,flags:{grhMutation:false,payrollCalculated:false,payrollPosted:false,currentCatalogVerified:false,proposalApproved:false},principal:{tenantId:current.tenantId,membershipId:current.membershipId,certifiedBindingId:current.bindingId,employmentLinked:false,capabilities:caps},proposals:[],total:0}});
   if(u.pathname==='/api/internal-data')return route.fulfill({json:{ok:true,status:'ready',sourcePolicy:{label:'QA SINTÉTICA'},latestClosed:{},currentOpen:{},runs:[],quality:{},limitations:[]}});
   if(u.pathname.startsWith('/api/'))return route.fulfill({status:403,json:{ok:false,error:'API ajena a esta prueba sintética.'}});
   const file=path.resolve(root,u.pathname==='/nomina'?'nomina-control.html':'.'+u.pathname);
   if(req.method()!=='GET'||!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
   return route.fulfill({contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]??'application/octet-stream',body:fs.readFileSync(file)});
  });
  page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));const s=k=>page.locator('[data-conditions-'+k+']'),panel=page.getByRole('region',{name:'Condiciones salariales propias',exact:true});
  const idle=()=>page.waitForFunction(()=>document.querySelector('.own-salary-conditions')?.getAttribute('aria-busy')==='false');
  const fresh=async()=>{await page.goto('about:blank');await page.goto(origin+'/nomina#condiciones');await page.waitForFunction(()=>document.querySelector('[data-conditions-period]')?.closest('fieldset')?.disabled===false);await idle();};
  const consult=async()=>{await s('period').fill(period);await s('refresh').click();await idle();await s('content').waitFor({state:'visible'});};
  const complete=await bootstrap(),count=complete.source.subjects.length;assert.ok(count>855);await fresh();await consult();assert.equal(writes.length,0);
  check((await s('count').innerText()).includes(count+' contratos')&&await s('rows').locator('article').count()===25,'built UI opens the entire actual native-only SQL source while displaying25 editable rows');
  for(const width of[390,320]){await page.setViewportSize({width,height:1000});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'salary conditions have no page overflow at '+width+'px');check(await s('refresh').evaluate(e=>e.getBoundingClientRect().height>=44),'complete-query mobile control has a44px target at '+width+'px');await panel.screenshot({path:path.join(output,'salary-conditions-mobile-'+width+'.png')});}
  await page.setViewportSize({width:1440,height:1100});await panel.getByText('Usar una constancia común para todas las filas',{exact:true}).click();await s('common-date').fill(period+'-01');await s('common-reference').fill('Constancia común exclusivamente sintética de navegador QA');await s('evidence').click();
  await s('search').fill('esta búsqueda no existe');assert.equal(await s('rows').locator('article').count(),0);await panel.getByText('Trabajar con una planilla completa',{exact:true}).click();
  const download=page.waitForEvent('download');await s('download').click();const downloaded=await download;const filename=path.join(output,'salary-conditions-full-synthetic.csv');await downloaded.saveAs(filename);await idle();
  const csv=fs.readFileSync(filename,'utf8'),draft=conditionsDraft(complete);for(const row of draft){row.definition.asOfDate=period+'-01';row.definition.documentReference='Constancia común exclusivamente sintética de navegador QA';}
  assert.deepEqual(conditionsFile(complete,csv),draft);check(writes.length===0&&conditionsFile(complete,csv).length===count,'voluntary CSV includes every row despite an empty visible search and issues no save');
  const changed=structuredClone(draft);changed.at(-1).definition.partialSeniorityYears='2';changed.at(-1).definition.title={status:'declared',code:'0056',percentage:'12.00000001'};changed.at(-1).definition.unhealthyWork=false;
  const edited=path.join(output,'salary-conditions-edited-synthetic.csv');fs.writeFileSync(edited,conditionsCsv(complete,changed));await s('file').setInputFiles(edited);await s('import').click();await idle();assert.equal(writes.length,0);
  await s('reason').fill('Corrección completa exclusivamente sintética de navegador QA');await s('prepare').click();await idle();await s('comparison').waitFor({state:'visible'});await s('confirm').check();drop=true;await s('send').click();await idle();
  assert.equal(writes.length,1);const pending=structuredClone(writes[0]);assert.equal(pending.body.items.length,count);assert.deepEqual(pending.body.items,changed);assert.equal(pending.status,201);assert.ok(await s('recover').isVisible());assert.ok(await s('retry').isHidden());
  check(true,'built complete review conserves the last-row exact percentage and unknown outcome without an automatic retry');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});assert.ok(await s('content').isHidden());assert.equal(await s('rows').innerText(),'');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
  allowed=false;await revoke();await s('access').click();await idle();assert.ok(await s('recover').isDisabled());assert.equal(writes.length,1);check(true,'hiding and actual nominal-right revocation scrub all rows and prevent resend without changing the pending body/key');
  allowed=true;await restore();await s('access').click();await idle();await s('recover').click();await idle();assert.ok(await s('receipt').isVisible());assert.equal(writes.length,1);assert.deepEqual(writes[0],pending);check(reads.some(r=>r.resource==='attempt'),'read-only recovery confirms the same complete saved attempt after access renewal');
  actor(actors.checker);await fresh();await consult();await panel.getByText('Propuestas y decisiones anteriores',{exact:true}).click();await s('proposal').selectOption(pending.receipt.proposalId);await s('open').click();await idle();assert.ok(await s('review').isEnabled());
  await s('decision').selectOption('approve');await s('decision-reason').fill('Revisión independiente completa exclusivamente sintética QA');await s('review').click();await idle();await s('confirm').check();await s('send').click();await idle();assert.equal(writes.length,2);assert.equal(writes[1].receipt.body.command,'approve');assert.ok(await s('receipt').isVisible());
  check(true,'independent reviewer opens the whole immutable proposal and records the exact full-set decision through the built UI');
  actor(actors.maker);await fresh();await consult();const latest=await bootstrap();assert.deepEqual(latest.configuration.items,changed);await panel.screenshot({path:path.join(output,'salary-conditions-desktop.png')});assert.deepEqual(errors,[]);
  check(true,'new full consultation shows every independently approved value without JavaScript errors');
  fs.writeFileSync(path.join(output,'salary-conditions-browser-proof.json'),JSON.stringify({ok:true,browser:browserName,actualHandlers:true,actualSql:true,syntheticAuth:true,syntheticOnly:true,productiveBusinessWrites:0,rows:count,writes:writes.length,reads:reads.length,errors},null,2)+'\n');
 }catch(e){if(page&&!page.isClosed())await page.screenshot({path:path.join(output,'salary-conditions-browser-failure.png'),fullPage:true});throw e;}
 finally{allowed=true;await restore();actor(actors.maker);await browser.close();}
}
