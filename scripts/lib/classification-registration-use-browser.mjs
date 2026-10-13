// Compiled product, real HTTP facades and isolated PostgreSQL; no municipal data.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {catalogFilePlan} from '../../assets/native-employment-catalog-file-model.js';
import {catalogDeclareRegistration} from '../../assets/native-employment-catalog-model.js';
import {qaLiteral as q} from './own-payroll-durable-qa.mjs';

export async function verifyClassificationUseBrowser(h){
 const {handlers,env,qa,ok:check,destination:output,sql,request,browserName}=h;
 assert.ok(['chrome','chromium'].includes(browserName));
 const root=fs.realpathSync(new URL('../../public',import.meta.url)),origin='http://127.0.0.1:4369';
 const errors=[],external=[],posts=[],reads=[],actor=qa.actors.maker;
 const caps=['workforce.employee.read','employee.record.create','employee.catalog.propose','employee.catalog.approve','payroll.read'];
 const expected=(await request('catalog')).catalog.items;
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:browserName==='chrome'?{channel:'chrome'}:{})});
 env.INTERNAL_APP_ORIGIN=origin;let page,revoked=false;
 const restore=async()=>{if(revoked){await sql('UPDATE tenant_action_employment_link SET active=true,revoked_at=NULL WHERE membership_id='+q(actor.membershipId)+'::uuid');revoked=false;}};
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1100},locale:'es-AR',serviceWorkers:'block',acceptDownloads:true});
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());
   if(u.origin!==origin){external.push(u.origin);return route.abort();}
   const kind=u.pathname==='/api/internal-employment-catalog'?'catalog':u.pathname==='/api/internal-native-employees'?'employee':null;
   if(kind){let status=200,payload;const headers={};await handlers[kind]({method:req.method(),url:u.pathname+u.search,query:Object.fromEntries(u.searchParams),headers:req.headers(),body:req.postData()},{setHeader(k,v){headers[k]=String(v);},status(n){status=n;return this;},json(v){payload=v;return this;}});(req.method()==='POST'?posts:reads).push({kind,status,query:Object.fromEntries(u.searchParams),code:payload?.code});return route.fulfill({status,headers,json:payload});}
   if(u.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,sessionVersion:2,user:{id:actor.actorSessionId,email:actor.actorEmail,role:'municipality_admin'},access:{context:'tenant',tenant:{id:actor.tenantId,roleKey:'MUNICIPIO_ADMIN_OPERATIVO'},tenantCapabilities:caps,platformCapabilities:[],platformRoles:[]},expiresAt:new Date(Date.now()+3600000).toISOString()}});
   if(u.pathname==='/api/internal-data')return route.fulfill({json:{ok:true,status:'ready',sourcePolicy:{label:'QA SINTÉTICA'},latestClosed:{},currentOpen:{},runs:[],quality:{},limitations:[]}});
   if(u.pathname.startsWith('/api/'))return route.fulfill({status:403,json:{ok:false,error:'API fuera del recorrido sintético de encuadres.'}});
   const file=path.resolve(root,u.pathname==='/personal'?'internal-dashboard.html':'.'+u.pathname);
   if(req.method()!=='GET'||!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
   return route.fulfill({contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]??'application/octet-stream',body:fs.readFileSync(file)});
  });
  page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/personal#legajos');await page.locator('[data-employment-catalog]').click();
  const dialog=page.getByRole('dialog',{name:'Catálogo de encuadres',exact:true});
  await dialog.getByRole('button',{name:'Preparar cambios',exact:true}).waitFor();
  check(await dialog.getByText('Sólo contratos existentes',{exact:true}).count()>0,'compiled catalog retains the restricted existing encuadre as visible municipal classification');
  await dialog.getByRole('button',{name:'Preparar cambios',exact:true}).click();
  await dialog.getByRole('button',{name:'Sectores',exact:true}).click();
  assert.equal(await dialog.locator('[data-ec-rows] tr').count(),50);
  await dialog.getByRole('button',{name:'Siguiente',exact:true}).click();
  assert.ok(await dialog.locator('[data-ec-rows] tr').count()>0);
  await dialog.getByLabel('Buscar código o descripción',{exact:true}).fill('10059');
  assert.equal(await dialog.locator('[data-ec-rows] tr').count(),1);
  await dialog.locator('[data-ec-file]>summary').click();
  const downloadEvent=page.waitForEvent('download');await dialog.getByRole('button',{name:'Descargar borrador completo',exact:true}).click();
  const downloaded=await downloadEvent,csv=fs.readFileSync(await downloaded.path(),'utf8');
  const filePlan=catalogFilePlan(expected,csv);
  assert.deepEqual(filePlan.items,catalogDeclareRegistration(expected));assert.equal(filePlan.changes.length,0);
  assert.ok(csv.includes("'=SUM(1;2)"));
  check(true,'CSV includes every kind and every page despite the active search; formula-looking label remains literal and roundtrips');
  const input=dialog.getByLabel('Archivo CSV de encuadres',{exact:true}),compare=dialog.getByRole('button',{name:'Comparar archivo completo',exact:true}),apply=dialog.getByRole('button',{name:'Usar comparación en el borrador',exact:true});
  await input.setInputFiles({name:'encuadres-exclusivamente-sinteticos.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
  await compare.click();await apply.waitFor();await page.waitForFunction(()=>document.querySelector('[data-ec-file-apply]')?.disabled===false);
  assert.match(await dialog.locator('[data-ec-file-status]').innerText(),new RegExp(expected.length+' opciones comparadas · 0 cambios'));
  await dialog.locator('[data-ec-field="label"]').fill('Descripción local exclusivamente QA');assert.equal(await apply.isDisabled(),true);
  check((await dialog.locator('[data-ec-file-status]').innerText()).includes('El borrador cambió'),'editing after comparison invalidates the entire file plan before any local application');
  await compare.click();await page.waitForFunction(()=>document.querySelector('[data-ec-file-apply]')?.disabled===false);await apply.click();
  assert.equal(await input.inputValue(),'');check(true,'using the complete comparison changes only the local draft and clears the selected file');
  await input.setInputFiles({name:'columnas-invalidas.csv',mimeType:'text/csv',buffer:Buffer.from(csv.replace('"nuevas_altas"','"importe"'))});await compare.click();
  await dialog.getByText('La cabecera no coincide. No se admiten columnas de empleados, importes o fórmulas.',{exact:true}).waitFor();assert.equal(await apply.isDisabled(),true);
  await input.setInputFiles({name:'encuadres-exclusivamente-sinteticos.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await compare.click();await page.waitForFunction(()=>document.querySelector('[data-ec-file-apply]')?.disabled===false);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(await input.inputValue(),'');assert.equal(await apply.isDisabled(),true);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  check(true,'hidden document withdraws the file and verified comparison without issuing a save');
  await dialog.getByLabel('Buscar código o descripción',{exact:true}).fill('10059');
  for(const width of[1440,390,320]){
   await page.setViewportSize({width,height:1100});const use=dialog.locator('.ec-use');
   await use.scrollIntoViewIfNeeded();const box=await use.boundingBox();assert.ok(box&&box.height>=44&&box.x>=0&&box.x+box.width<=width);
   const checkbox=use.locator('input');await checkbox.focus();assert.equal(await checkbox.evaluate(e=>e===document.activeElement),true);
   check(true,'registration declaration has a visible 44px label and keyboard focus at '+width+'px');
   await page.screenshot({path:path.join(output,'classification-use-'+width+'.png'),fullPage:false});
  }
  await dialog.getByRole('button',{name:'Cerrar catálogo',exact:true}).click();await page.locator('[data-employee-create]').click();
  const hire=page.getByRole('dialog',{name:'Nuevo legajo municipal',exact:true});
  await page.waitForFunction(()=>document.querySelector('.native-employee-dialog .ne-fields')?.disabled===false);
  assert.equal(await hire.locator('select[name="agreementCode"] option[value="9"]').count(),0);
  check(true,'compiled new-hire selector omits the restricted encuadre while the full classification retained it');
  await hire.getByRole('button',{name:'Cerrar alta',exact:true}).click();await page.locator('[data-employment-catalog]').click();
  await page.waitForFunction(()=>document.querySelector('[data-ec-refresh]')?.disabled===false);
  if(await dialog.getByRole('button',{name:'Preparar cambios',exact:true}).isVisible())await dialog.getByRole('button',{name:'Preparar cambios',exact:true}).click();
  if(!await dialog.locator('[data-ec-file]').evaluate(e=>e.open))await dialog.locator('[data-ec-file]>summary').click();
  await input.setInputFiles({name:'encuadres-exclusivamente-sinteticos.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await compare.click();await page.waitForFunction(()=>document.querySelector('[data-ec-file-apply]')?.disabled===false);
  await sql('UPDATE tenant_action_employment_link SET active=false,revoked_at=clock_timestamp() WHERE membership_id='+q(actor.membershipId)+'::uuid');revoked=true;
  await dialog.getByRole('button',{name:'Actualizar consulta',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-ec-file]')?.hidden===true);
  assert.equal(await input.inputValue(),'');assert.equal(await dialog.locator('[data-ec-file-apply]').isDisabled(),true);
  check(true,'real SQL revocation clears the catalog draft, file and comparison after an authoritative refresh');
  await restore();assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(posts,[]);
  fs.writeFileSync(path.join(output,'classification-use-browser-proof.json'),JSON.stringify({version:'classification-registration-use-browser.v1',compiledProduct:true,actualHandlers:true,actualSql:true,syntheticOnly:true,productionRequests:0,fullOptions:expected.length,widths:[1440,390,320],posts,external,errors,reads},null,2)+'\n');
 }catch(e){fs.writeFileSync(path.join(output,'classification-use-browser-failure.json'),JSON.stringify({message:e.message,url:page?.url(),reads,posts,errors,external},null,2)+'\n');if(page)await page.screenshot({path:path.join(output,'classification-use-browser-failure.png'),fullPage:false}).catch(()=>{});throw e;}
 finally{await restore();await browser.close();}
}
