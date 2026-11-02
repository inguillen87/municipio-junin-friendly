// Built product and real handlers backed by the same disposable SQL fixture.
import {openQaPayrollSidebarTask} from './qa-payroll-sidebar-navigation.mjs';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {chromium} from 'playwright';
export async function verifySalaryDayUnitsBrowser({handlers,env,actor,output,browserName,check}){
 assert.ok(['chrome','chromium'].includes(browserName));
 const root=fs.realpathSync(new URL('../../public',import.meta.url)),origin='http://127.0.0.1:4368',errors=[],posts=[],external=[],reads=[];
 const caps=['workforce.employee.read','payroll.read','payroll.parameter.read','payroll.parameter.prepare','payroll.parameter.approve','payroll.parameter.audit.read'];
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:browserName==='chrome'?{channel:'chrome'}:{})});
 env.INTERNAL_APP_ORIGIN=origin;let page;
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1100},locale:'es-AR',serviceWorkers:'block'});
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());if(u.origin!==origin){external.push(u.origin);return route.abort();}
   const handler=u.pathname==='/api/internal-native-salary'?handlers.salary:u.pathname==='/api/internal-own-payroll-program'?handlers.program:null;
   if(handler){let status=200,payload;const headers={};await handler({method:req.method(),url:u.pathname+u.search,query:Object.fromEntries(u.searchParams),headers:req.headers(),body:req.postData()},{setHeader(k,v){headers[k]=String(v);},status(n){status=n;return this;},json(v){payload=v;return this;}});if(req.method()==='POST')posts.push({path:u.pathname,status});else reads.push({path:u.pathname,query:Object.fromEntries(u.searchParams),status,code:payload?.code});return route.fulfill({status,headers,json:payload});}
   if(u.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,sessionVersion:2,user:{id:actor.actorSessionId,email:actor.actorEmail,role:'municipality_admin'},access:{context:'tenant',tenant:{id:actor.tenantId,roleKey:'MUNICIPIO_ADMIN_OPERATIVO'},tenantCapabilities:caps,platformCapabilities:[],platformRoles:[]},expiresAt:new Date(Date.now()+3600000).toISOString()}});
   if(u.pathname==='/api/internal-payroll-parameters')return route.fulfill({json:{ok:true,flags:{grhMutation:false,payrollCalculated:false,payrollPosted:false,currentCatalogVerified:false,proposalApproved:false},principal:{tenantId:actor.tenantId,membershipId:actor.membershipId,certifiedBindingId:actor.bindingId,employmentLinked:false,capabilities:caps},proposals:[],total:0}});
   if(u.pathname==='/api/internal-data')return route.fulfill({json:{ok:true,status:'ready',sourcePolicy:{label:'QA SINTÉTICA'},latestClosed:{},currentOpen:{},runs:[],quality:{},limitations:[]}});
   if(u.pathname.startsWith('/api/'))return route.fulfill({status:403,json:{ok:false,error:'API ajena al recorrido sintético de unidades.'}});
   const file=path.resolve(root,u.pathname==='/nomina'?'nomina-control.html':'.'+u.pathname);
   if(req.method()!=='GET'||!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
   return route.fulfill({contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]??'application/octet-stream',body:fs.readFileSync(file)});
  });
  page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  const master=page.locator('[data-native-salary]'),file=master.locator('[data-salary-file]'),program=page.getByRole('region',{name:'Reglas propias de cálculo',exact:true});
  await page.goto(origin+'/nomina#resumen');await openQaPayrollSidebarTask(page,{profile:'payroll-sidebar',task:'parametros'});
  await master.getByRole('button',{name:'Consultar maestro propio',exact:true}).click();await master.getByRole('button',{name:'Preparar nueva versión',exact:true}).waitFor();await master.getByRole('button',{name:'Preparar nueva versión',exact:true}).click();
  await master.getByLabel('Unidad',{exact:true}).selectOption('days');
  check(await master.getByLabel('Unidad',{exact:true}).locator('option:checked').textContent()==='Días','built individual definition editor exposes a distinct accessible Días option');
  await master.locator('[data-salary-file-loader]>summary').click();await file.getByLabel('CSV del maestro salarial',{exact:true}).waitFor();
  await file.locator('details>summary').click();check(await file.getByText(/Días, horas y minutos son cantidades distintas/).count()===1,'compiled CSV guidance explains declared days without an implicit conversion');
  const event=page.waitForEvent('download');await file.getByRole('button',{name:'Descargar borrador completo',exact:true}).click();const download=await event,csv=fs.readFileSync(await download.path(),'utf8');
  check(csv.includes('dias')&&csv.includes('1.50000000'),'download preserves declared days and fractional quantity in the complete CSV');
  await file.getByLabel('CSV del maestro salarial',{exact:true}).setInputFiles({name:'dias-exclusivamente-sinteticos.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
  await file.locator('[data-salary-file-impact]').waitFor();check(await file.getByText('El archivo coincide con el borrador. No hay cambios para incorporar.',{exact:true}).count()===1,'the complete reimport keeps all values without inventing changes');
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:1100});const box=await master.getByLabel('Unidad',{exact:true}).boundingBox();check(box&&box.width>0&&box.x>=0&&box.x+box.width<=width,'Días selector remains usable at'+width+'px');
   await master.getByLabel('Unidad',{exact:true}).focus();check(await master.getByLabel('Unidad',{exact:true}).evaluate(el=>el===document.activeElement),'Días selector accepts keyboard focus at'+width+'px');
   await page.screenshot({path:path.join(output,'day-units-master-'+width+'.png'),fullPage:false});
  }
  await openQaPayrollSidebarTask(page,{profile:'payroll-sidebar',task:'reglas'});await program.locator('[data-program-content]').waitFor({state:'visible'});await program.getByRole('button',{name:'Preparar reglas',exact:true}).click();
  const selector=program.locator('[data-program-binding-select]'),value=await selector.locator('option').evaluateAll(options=>options.find(o=>o.textContent.includes('declaredDays'))?.value);assert.ok(value!==undefined);await selector.selectOption(value);
  const unit=program.getByLabel('Unidad de la entrada',{exact:true});check(await unit.inputValue()==='days','approved days binding loads the same unit in the built program editor');
  check(await unit.locator('option:checked').textContent()==='Días','program editor names the preserved unit Días');
  await unit.focus();check(await unit.evaluate(el=>el===document.activeElement),'program days input is keyboard accessible');
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.equal(posts.length,0);check(true,'browser only reads SQL-backed synthetic state and edits local drafts; no production, extra writes or external request');
  const proof={version:'salary-day-units-browser.v1',compiledProduct:true,actualHandlers:true,syntheticOnly:true,productionRequests:0,posts,external,errors,widths:[1440,390,320]};fs.writeFileSync(path.join(output,'day-units-browser-proof.json'),JSON.stringify(proof,null,2)+'\n');
 }catch(error){
  fs.writeFileSync(path.join(output,'day-units-browser-failure.json'),JSON.stringify({message:error.message,url:page?await page.url():null,reads,posts,errors,external,status:page?await page.locator('[data-native-salary] [role=status]').allTextContents():[]},null,2)+'\n');
  if(page)await page.screenshot({path:path.join(output,'day-units-browser-failure.png'),fullPage:false}).catch(()=>{});
  throw error;
 }finally{await browser.close();}
}
