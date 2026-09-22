// Real compiled UI, all API calls synthetic; never sends municipal data or writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
import {chromium} from 'playwright';
import {draft,bootstrap,receipt,CONTRACT} from '../tests/fixtures/native-employee-synthetic.js';
import {nativeEmployeeDetail} from '../lib/native-employee-directory.js';
const published=process.argv.includes('--published'),origin=published?'https://municipio-junin-friendly.vercel.app':'http://127.0.0.1:4319',root=path.resolve('public');
fs.mkdirSync('verification',{recursive:true});
let created=false,postMode='normal',accessMode='write',posts=[],reads=[],errors=[];
const row={recordOrigin:'MUNICONTROL',contractId:CONTRACT,canonicalPersonId:'77777777-7777-4777-8777-777777777777',companyId:7,legajo:receipt.legajo,nombre:receipt.name,dni:'99999990',cuil:'20999999906',fechaNacimiento:'1990-01-01',fechaIngreso:'2026-10-01',sexo:null,activo:false,administrativeStatus:'pending_start',liquidable:false,payrollStatus:'not_liquidated',controlState:'alta_nativa_sin_liquidar',crosswalkStatus:'not_loaded',organizacion:'Repartición QA',sector:'Sector QA',convenio:'Convenio QA 1',categoria:'6-D',rawFields:{employment:{agreementName:'Convenio QA 1',categoryName:'6-D',organizationName:'Repartición QA',sectorName:'Sector QA'},native:{legalReference:'Resolución sintética QA',createdAt:receipt.createdAt}}};
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{}),args:['--no-sandbox']});
const checks=[];let observedPage;
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.abort();
  if(u.pathname.startsWith('/api/')){
   const resource=u.searchParams.get('resource');
   if(u.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,user:{name:'Operador sintético QA',email:'qa@example.invalid',role:'ADMIN_INTERNO'},access:{tenantCapabilities:['workforce.employee.read','workforce.summary.read',...(accessMode==='write'?['employee.record.create']:[])],platformCapabilities:[],platformRoles:[]}}});
   if(u.pathname==='/api/internal-native-employees'){
    if(accessMode==='denied')return route.fulfill({status:403,json:{ok:false,code:'NATIVE_EMPLOYEE_FORBIDDEN',error:'Sesión QA denegada'}});
    if(req.method()==='POST'){
     posts.push({body:req.postDataJSON(),key:req.headers()['idempotency-key']});
     if(postMode==='duplicate')return route.fulfill({status:409,json:{ok:false,code:'NATIVE_EMPLOYEE_IDENTITY_EXISTS',error:'Ya existe una identidad con ese DNI o CUIL.'}});
     created=true;if(postMode==='lost')return route.abort();return route.fulfill({status:201,json:{ok:true,data:receipt}});
    }
    reads.push(resource);return route.fulfill({json:{ok:true,data:resource==='bootstrap'?{...bootstrap,canCreate:accessMode==='write'}:{...receipt,replayed:true}}});
   }
   if(resource==='employees'){
    const rows=created&&u.searchParams.get('status')==='all'?[row]:[];
    return route.fulfill({json:{ok:true,data:rows,pagination:{page:1,limit:25,total:rows.length,pages:1},scope:{totalContracts:rows.length,totalPeople:rows.length,matched:0,ambiguous:0,unmatched:0},operational:{version:'workforce-operational.v1',selectedStatus:u.searchParams.get('status'),activeContracts:0,activePeople:0,currentCensusCertified:false},facets:{sectors:[],organizations:[],agreements:[]}}});
   }
   if(resource==='employee')return route.fulfill({json:nativeEmployeeDetail(row).payload});
   return route.fulfill({json:{ok:true,data:[]}});
  }
  if(req.method()!=='GET')return route.abort();
  const pagePath=['/personal','/internal-dashboard.html'].includes(u.pathname)?'/internal-dashboard.html':u.pathname;
  if(published){if(pagePath==='/internal-dashboard.html'||u.pathname.startsWith('/assets/')||['/friendly-data.json','/manifest.webmanifest'].includes(u.pathname))return route.continue();return route.abort();}
  const file=path.resolve(root,'.'+decodeURIComponent(pagePath));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
  const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};return route.fulfill({contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
 });
 const page=await context.newPage();observedPage=page;page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/personal#legajos');
 const button=page.getByRole('button',{name:'Nuevo legajo',exact:true});await button.waitFor();assert.equal(posts.length,0);assert.equal(reads.length,0);
 const dialog=page.locator('dialog.native-employee-dialog'),f=dialog.locator('form');
 async function open(){await button.click();await dialog.locator('input[name="fullName"]:enabled').waitFor();await page.waitForFunction(()=>document.querySelector('dialog.native-employee-dialog .ne-feedback')?.textContent.startsWith('Completá los datos'));}
 async function fill(patch={}){const v=draft(patch);for(const name of ['fullName','dni','cuil','birthDate','legajo','startDate','jobTitle','legalReference'])await f.locator(`[name="${name}"]`).fill(v[name]);await f.locator('[name="agreementCode"]').selectOption(v.agreementCode);await f.locator('[name="categoryCode"]').selectOption(v.categoryCode);await f.locator('[name="organizationId"]').selectOption(v.organizationId);await f.locator('[name="sectorCode"]').selectOption(v.sectorCode);}
 await open();assert.equal(await f.locator('[name="fullName"]').evaluate(n=>n===document.activeElement),true);await fill();await dialog.getByRole('button',{name:'Revisar alta',exact:true}).click();assert.equal(posts.length,0);await dialog.getByRole('button',{name:'Volver a editar'}).click();await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();assert.equal(posts.length,0);checks.push('authorized CTA, initial focus, review and cancel without writing');
 await open();await fill({cuil:'20999999907'});await dialog.getByRole('button',{name:'Revisar alta',exact:true}).click();assert.match(await dialog.getByRole('status').innerText(),/CUIL/);assert.equal(posts.length,0);
 await f.locator('[name="agreementCode"]').selectOption('2');assert.deepEqual(await f.locator('[name="categoryCode"] option').evaluateAll(ns=>ns.map(n=>n.value)),['','13']);await fill();
 await dialog.getByRole('button',{name:'Revisar alta',exact:true}).click();await dialog.getByRole('button',{name:'Confirmar y crear legajo'}).click();await dialog.locator('[data-ne-success]:not([hidden])').waitFor();assert.equal(posts.length,1);assert.equal(posts[0].body.draft.legajo,'');assert.equal(posts[0].body.catalogVersion,bootstrap.catalog.version);assert.match(posts[0].key,/^[a-f0-9-]{36}$/);assert.match(await dialog.locator('[data-ne-open]').getAttribute('href'),/\/personal\?contractId=/);
 assert.equal(await dialog.locator('[data-ne-fixed]').getAttribute('href'),'/novedades?fixedContractId='+CONTRACT+'#fixedNovelties');checks.push('saved registration exposes a next-step link carrying only its canonical contract, without creating a novelty');
 await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#employeeRows').textContent.includes('Alta propia'));assert.equal(await page.locator('#statusFilter').inputValue(),'all');await page.locator('#employeeRows').getByRole('button',{name:'Ver ficha',exact:true}).click();await page.locator('#employeeDialog').waitFor();await page.waitForFunction(()=>document.querySelector('#dialogSubtitle')?.textContent.includes('Alta propia de MuniControl'));assert.match(await page.locator('#dialogSubtitle').innerText(),/Alta propia de MuniControl/);assert.match(await page.locator('#dialogBody').innerText(),/Resolución sintética QA/);assert.doesNotMatch(await page.locator('#dialogSubtitle').innerText(),/fuente laboral GRH/);const detailPage=page.locator('#employeeDialog'),index=detailPage.getByRole('navigation',{name:'Navegación de la ficha'});await index.waitFor();
 const navigationWrites=posts.length,navigationReads=reads.length,originalUrl=page.url();
 assert.deepEqual(await index.locator('option').allTextContents(),['Datos personales','Vínculo laboral','Registro del alta']);
 await index.getByRole('combobox',{name:'Ir a una sección'}).selectOption({label:'Vínculo laboral'});await index.getByRole('button',{name:'Ir a la sección',exact:true}).click();
 assert.equal(await page.evaluate(()=>document.activeElement?.textContent),'Vínculo laboral');assert.equal(page.url(),originalUrl);assert.equal(posts.length,navigationWrites);assert.equal(reads.length,navigationReads);
 for(const width of [390,320]){await page.setViewportSize({width,height:844});await page.locator('#dialogBody').evaluate(el=>el.scrollTop=0);assert.ok(await detailPage.evaluate(n=>n.scrollWidth<=n.clientWidth+1));await detailPage.screenshot({path:'verification/employee-detail-navigation-'+width+'.png'});}
 await page.setViewportSize({width:1440,height:1000});await page.locator('#dialogBody').evaluate(el=>el.scrollTop=0);await detailPage.screenshot({path:'verification/employee-detail-navigation-desktop.png'});
 checks.push('detail index uses present sections, moves keyboard focus without URL change, extra reads or writes, and fits mobile');
 await page.keyboard.press('Escape');checks.push('validates CUIL/category, one explicit create, refreshes directory and opens native detail');
 await open();await fill();postMode='lost';await dialog.getByRole('button',{name:'Revisar alta',exact:true}).click();await dialog.getByRole('button',{name:'Confirmar y crear legajo'}).click();await dialog.getByRole('button',{name:'Consultar este intento'}).waitFor();await page.waitForFunction(()=>!document.querySelector('[data-ne-recover]').disabled);const count=posts.length;await dialog.getByRole('button',{name:'Consultar este intento'}).click();await dialog.locator('[data-ne-success]:not([hidden])').waitFor();assert.equal(posts.length,count);assert.equal(reads.at(-1),'attempt');await dialog.getByRole('button',{name:'Cerrar',exact:true}).click();checks.push('lost response recovers original receipt without a second creation');
 postMode='duplicate';await open();await fill();await dialog.getByRole('button',{name:'Revisar alta',exact:true}).click();await dialog.getByRole('button',{name:'Confirmar y crear legajo'}).click();await dialog.locator('form:not([hidden])').waitFor();await page.waitForFunction(()=>document.querySelector('dialog.native-employee-dialog .ne-feedback')?.textContent.includes('Ya existe'));assert.match(await dialog.getByRole('status').innerText(),/Ya existe/);assert.equal(await f.locator('[name="fullName"]').inputValue(),draft().fullName);
 await page.screenshot({path:'verification/native-employee-desktop.png'});
 for(const width of [320,390]){await page.setViewportSize({width,height:844});await page.emulateMedia({reducedMotion:'reduce'});assert.ok(await dialog.evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&n.scrollWidth<=n.clientWidth+1;}));await page.screenshot({path:`verification/native-employee-mobile-${width}.png`});}
 checks.push('duplicate refusal retains form; desktop and 320/390px layouts without overflow');
 await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();accessMode='denied';await button.click();await page.waitForFunction(()=>document.querySelector('.ne-feedback').textContent.includes('Tu sesión'));assert.equal(await f.locator('[name="fullName"]').inputValue(),'');assert.equal(await f.locator('fieldset').evaluate(n=>n.disabled),true);assert.equal(await f.locator('[name="fullName"]').isDisabled(),true);assert.equal(await dialog.getByRole('button',{name:'Cerrar alta'}).isDisabled(),false);await dialog.getByRole('button',{name:'Cerrar alta'}).click();checks.push('session denial clears identity data and leaves a usable close action');
 accessMode='read';await page.reload();await page.locator('#appShell').waitFor();assert.equal(await button.isVisible(),false);checks.push('read-only account cannot see the creation action');
 const localIndex=await page.evaluate(async()=>{const {mountEmployeeDetailNavigation}=await import('/assets/employee-detail-navigation.js');const c=document.createElement('div');c.id='qa-local-section-index';document.body.append(c);c.innerHTML='<section><h3>Identidad de ensayo</h3></section><details><summary><strong>Historial de ensayo</strong></summary><p>Lectura explícita</p></details><section hidden><h3>No disponible</h3></section>';
 mountEmployeeDetailNavigation(c);mountEmployeeDetailNavigation(c);const nav=c.querySelector('nav'),select=nav.querySelector('select');select.value='1';nav.querySelector('button').click();const result={count:c.querySelectorAll('nav').length,options:select.options.length,detailsOpen:c.querySelector('details').open,focus:document.activeElement===c.querySelector('summary')};c.remove();nav.querySelector('button').click();return result;});
 assert.deepEqual(localIndex,{count:1,options:2,detailsOpen:false,focus:true});checks.push('local index does not expose hidden sections, open lazy history, duplicate itself or act on removed content');
 assert.deepEqual(errors,[]);const result={ok:true,checksPassed:checks.length,checks,mode:published?'published-static':'compiled-local',apiResponsesSynthetic:true,municipalEmployeesCreated:0,realApiCallsSent:0};fs.writeFileSync('verification/native-employee-browser.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(e){console.error('SYNTHETIC_UI_DIAGNOSTIC',JSON.stringify({checks,postCount:posts.length,reads,errors,postMode,accessMode,url:observedPage?.url(),state:observedPage?await observedPage.evaluate(()=>({dialogOpen:document.querySelector('dialog.native-employee-dialog')?.open,message:document.querySelector('.ne-feedback')?.textContent,formHidden:document.querySelector('#nativeEmployeeForm')?.hidden,successHidden:document.querySelector('[data-ne-success]')?.hidden,pendingHidden:document.querySelector('[data-ne-pending]')?.hidden,createDialogs:document.querySelectorAll('dialog.native-employee-dialog').length})).catch(()=>null):null}));throw e;}finally{await browser.close();}
