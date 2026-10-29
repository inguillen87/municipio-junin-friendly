// Compiled/published navigation; synthetic sessions and APIs. No municipal writes.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {verifyWorkAreaPublication} from './verify-work-area-publication.mjs';
import {chromium} from 'playwright';import '../assets/app-routes.js';
const published=process.argv.includes('--published'),origin=published?'https://municipio-junin-friendly.vercel.app':'https://areas.test';
const outputArgs=process.argv.slice(2).filter(a=>a.startsWith('--output='));assert.ok(outputArgs.length<=1,'one output path required');
const root=path.resolve('public'),out=outputArgs.length?path.resolve(outputArgs[0].slice(9)):'verification/work-areas-'+(published?'published':'local');
if(outputArgs.length){assert.ok(out.startsWith(path.resolve('verification')+path.sep),'output must be inside verification');assert.ok(!fs.existsSync(out),'preserve existing evidence; choose a new output');}
fs.mkdirSync(out,{recursive:true});
if(published)await verifyWorkAreaPublication(out);
const all=['workforce.summary.read','workforce.employee.read','workforce.structure.read','actions.read','time.source.read','time.catalog.read','attendance.read','payroll.read','payroll.novelty.read','lineage.read','assistant.use','management.analytics.read','budget.approved.read','absence.analytics.read','absence.nominal.read','leave.policy.read','leave.preview.read','quality.read','employee.record.create'];
const pages=['internal-dashboard.html','nomina-control.html','novedades-nomina.html','centro-acciones.html','asistente.html','ausentismo-control.html','calidad-operativa.html','centro-ayuda.html','estructura.html','fuentes-tiempo.html','gestion-comparativa.html','integracion-datos.html','licencias-control.html','presupuesto-control.html','relojes-marcaciones.html'];
const checks=[],errors=[],calls=[];let caps=all,full=false,holdAuth=null;const raw=new Map();
async function htmlFor(file){if(!raw.has(file)){if(published){const r=await fetch(origin+'/'+file,{signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);raw.set(file,await r.text());}else raw.set(file,fs.readFileSync(path.join(root,file),'utf8'));}return raw.get(file);}
const browser=await chromium.launch({headless:true,...(process.env.QA_CHROMIUM?{executablePath:process.env.QA_CHROMIUM}:{})});let page;
try{
 const context=await browser.newContext({viewport:{width:1440,height:1100},serviceWorkers:'block',locale:'es-AR'});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.abort();
  if(u.pathname.startsWith('/api/')){calls.push({method:req.method(),path:u.pathname,resource:u.searchParams.get('resource')});assert.equal(req.method(),'GET','Navigation must never mutate');
   if(u.pathname==='/api/internal-auth'&&holdAuth)await holdAuth;
   if(u.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,user:{email:'navigation@example.invalid',name:'Operador QA',role:'ADMIN_INTERNO'},access:{tenantCapabilities:caps,platformCapabilities:[],platformRoles:[]}}});
   if(u.searchParams.get('resource')==='employees')return route.fulfill({json:{ok:true,data:[],pagination:{page:1,limit:25,total:0,pages:1},scope:{totalContracts:0,totalPeople:0},operational:{version:'workforce-operational.v1',selectedStatus:'active',activeContracts:0,activePeople:0,currentCensusCertified:false},facets:{sectors:[],organizations:[],agreements:[]}}});
   return route.fulfill({json:{ok:true,data:[]}});
  }
  const resolved=globalThis.MuniControlRoutes.resolve(u.href,u.href),file=resolved?.file;
  if(file&&pages.includes(file)){
   const html=await htmlFor(file);assert.ok(html.includes('src="/assets/work-area-menu.js"'));
   if(full)return route.fulfill({contentType:'text/html',body:html});
   const aside=html.match(/<aside\b[^>]*class="[^"]*sidebar[^"]*"[\s\S]*?<\/aside>/)?.[0];assert.ok(aside);
   const styles=[...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map(x=>x[0]).join('');
   const head='<script src="/assets/app-routes.js"></script><script src="/assets/internal-capability-gate.js"></script><link rel="stylesheet" href="/assets/municontrol-enterprise.css"><link rel="stylesheet" href="/assets/liquidaciones-menu.css"><link rel="stylesheet" href="/assets/work-area-menu.css"><script type="module" src="/assets/liquidaciones-menu.js"></script><script type="module" src="/assets/work-area-menu.js"></script>';
   const capture='<script>window.originalNavigationNodes=[...document.querySelectorAll("aside.sidebar a[href],aside.sidebar button[data-view]")];</script>';
   return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${styles}${head}<style>body{margin:0}aside.sidebar{max-width:100%;box-sizing:border-box}body>.workspace{min-width:0}[hidden]{display:none!important}</style></head><body><div class="app-shell">${aside}<main class="workspace"><h1>Áreas de trabajo</h1><p>Verificación de navegación con sesión sintética</p><button id="logoutButton">Salir</button></main></div>${capture}</body></html>`});
  }
  if(req.method()!=='GET')return route.abort();if(published)return route.continue();
  const f=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile())return route.fulfill({status:404});
  return route.fulfill({body:fs.readFileSync(f),contentType:f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.svg')?'image/svg+xml':'application/octet-stream'});
 });
 page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 const visit=async url=>{if(page.url()===url)await page.reload();else await page.goto(url);};
 for(const file of pages){
  const href=globalThis.MuniControlRoutes.canonicalHref('/'+file);await visit(origin+href);await page.locator('[data-work-area-nav]').waitFor();
  assert.equal(await page.locator('[data-work-area-nav]').count(),1);assert.ok(await page.evaluate(()=>window.originalNavigationNodes.every(n=>n.isConnected)),'original nodes preserved '+file);
  assert.equal(await page.locator('[data-work-area=liquidaciones]').count(),1);assert.equal(await page.locator('[data-work-area-nav] a[href="/administracion"]:visible').count(),0);
  assert.equal(await page.locator('[data-work-area-nav] [data-work-area=juridica]').isHidden(),true);
  await page.locator('#mcWorkAreaSearch').fill('liquidaciones');assert.ok(await page.locator('[data-work-area=liquidaciones] a:visible').count()>=1);
  await page.locator('#mcWorkAreaSearch').fill('');checks.push('preserves routes, nodes and capability boundaries '+file);
 }
 await visit(origin+'/personal#legajos');const nav=page.locator('[data-work-area-nav]');await nav.waitFor();
 await page.locator('#mcWorkAreaSearch').fill('PARAMETROS SALARIALES');assert.equal(await nav.locator('a:visible').count(),1);assert.equal(await nav.locator('a:visible').getAttribute('href'),'/nomina#parametros');
 await page.keyboard.press('Escape');assert.equal(await page.locator('#mcWorkAreaSearch').inputValue(),'');
 await page.locator('#mcWorkAreaSearch').fill('zz-sin-coincidencia');assert.match(await nav.getByRole('status').innerText(),/No hay accesos/);
 await page.locator('.mc-work-clear').click();await page.keyboard.press('Alt+m');assert.equal(await page.locator('#mcWorkAreaSearch').evaluate(n=>n===document.activeElement),true);
 await page.locator('[data-work-area=asistencia]>summary').click();await page.waitForFunction(()=>document.querySelectorAll('[data-work-area][open]').length===1);
 await nav.screenshot({path:out+'/desktop.png'});checks.push('accent-insensitive search, explicit no results, keyboard focus and single open accordion');
 await page.locator('[data-work-area=liquidaciones]>summary').click();await nav.locator('a[href="/nomina#reportes"]').click();
 await page.locator('[data-work-area=liquidaciones][open]').waitFor();assert.match(page.url(),/\/nomina#reportes$/);
 await nav.locator('a[href="/nomina#comparar"]').click();await page.goBack();await page.waitForURL('**/nomina#reportes');checks.push('existing payroll anchors and browser back preserved');
 await page.evaluate(async()=>{const m=await import('/assets/work-area-menu.js');await m.mountWorkAreaMenu();await m.mountWorkAreaMenu();});assert.equal(await nav.count(),1);checks.push('repeated mount does not duplicate controls');
 for(const width of [390,320]){
  await page.setViewportSize({width,height:844});await page.emulateMedia({reducedMotion:'reduce'});await visit(origin+'/personal#legajos');await nav.waitFor();
  assert.equal(await page.locator('.mc-work-toggle').getAttribute('aria-expanded'),'false');assert.equal(await page.locator('#mcWorkAreaBody').isHidden(),true);
  await page.locator('.mc-work-toggle').click();await page.locator('#mcWorkAreaSearch').fill('reportes');assert.ok(await nav.locator('a:visible').count()>0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'viewport '+width);
  await nav.screenshot({path:out+'/mobile-'+width+'.png'});checks.push('compact touch navigation and reduced motion '+width+'px');
 }
 await page.setViewportSize({width:1440,height:1100});caps=['workforce.employee.read'];await visit(origin+'/personal#legajos');await nav.waitFor();
 for(const denied of ['liquidaciones','hacienda','asistencia'])assert.equal(await page.locator('[data-work-area='+denied+']').isHidden(),true);
 await page.locator('#mcWorkAreaSearch').fill('nomina');assert.equal(await nav.locator('a:visible,button[data-view]:visible').count(),0);checks.push('restricted session neither displays nor searches financial tasks');
 caps=all;await visit(origin+'/personal#legajos');await nav.waitFor();
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:new Set(['workforce.employee.read']),platformCapabilities:new Set(),platformRoles:new Set()}})));
 assert.equal(await page.locator('[data-work-area=liquidaciones]').isHidden(),true);assert.equal(await page.locator('[data-work-area=hacienda]').isHidden(),true);
 await page.locator('#logoutButton').click();assert.equal(await nav.isHidden(),true);await page.keyboard.press('Alt+m');assert.equal(await nav.isHidden(),true);checks.push('permission refresh and logout do not reveal stale navigation');
 full=true;caps=all;await visit(origin+'/personal#legajos');await page.locator('#appShell').waitFor();await nav.waitFor();
 await page.locator('[data-work-area=personas]>summary').click();await page.locator('#mcWorkAreaSearch').fill('Personas');
 await nav.locator('button[data-view=legajos]').click();await page.locator('#view-legajos').waitFor();await page.locator('#employeeSearch').fill('QA SIN PERSONAS');
 await page.locator('#mcWorkAreaSearch').fill('');await nav.locator('button[data-view=inicio]').click();await page.locator('#view-inicio').waitFor();
 await page.locator('[data-work-area=personas]>summary').click();await nav.locator('button[data-view=legajos]').click();await page.locator('#view-legajos').waitFor();
 assert.equal(await page.locator('#employeeSearch').inputValue(),'QA SIN PERSONAS');assert.equal(await page.locator('button[data-employee-create]').isVisible(),true);
 checks.push('full Personas page keeps original view handlers, search state and Nuevo legajo');
 full=false; // Return from the full Personas page to the explicit synthetic-panel navigation fixture.
 // Vertical payroll menu on /nomina: the real sidebar modules adopt a workspace built with the real sections and task
 // ids of payroll-navigation.js (synthetic panels, no payroll API). Both mount orders, 29 destinations, keyboard,
 // search, mobile, no horizontal bar in the page, capability refresh and logout.
 const navSource=published?await (await fetch(origin+'/assets/payroll-navigation.js',{signal:AbortSignal.timeout(15000)})).text():fs.readFileSync(path.join(root,'assets/payroll-navigation.js'),'utf8');
 const sectionsLiteral=/PAYROLL_TASK_SECTIONS=Object\.freeze\((\[[^\n]*\])\);/.exec(navSource)?.[1];assert.ok(sectionsLiteral,'payroll-navigation declares its sidebar sections');
 const sections=JSON.parse(sectionsLiteral.replace(/'/g,'"').replace(/([{,])(label|tasks):/g,'$1"$2":')),taskList=[...navSource.matchAll(/\{id:'([a-z0-9-]+)',label:'([^']+)'/g)].map(m=>[m[1],m[2]]);assert.equal(taskList.length,29);
 const mountPayrollWorkspace=()=>page.evaluate(async({sections,taskList})=>{const main=document.createElement('div');main.id='mainContent';main.setAttribute('data-requires-any-capability','payroll.read payroll.calculation.read');document.querySelector('main.workspace').append(main);const host=document.createElement('div');host.id='payrollTaskWorkspace';main.append(host);const {taskWorkspace}=await import('/assets/task-workspace.js');window.qaWorkspace=taskWorkspace({host,initial:'resumen',menu:'liquidaciones',sections,groups:taskList.map(([id,label])=>{const node=document.createElement('p');node.className='qa-panel';node.textContent='Panel '+label;return{id,label,nodes:[node]};})});},{sections,taskList});
 const tasks=page.locator('[data-liquidaciones-menu] .mc-liquidaciones-tasks'),nomina=origin+'/nomina';
 const verifyVerticalMenu=async label=>{
  await tasks.waitFor();assert.equal(await tasks.locator('[role=tab]').count(),29,label);assert.equal(await page.locator('#payrollTaskWorkspace .task-tabs').count(),0,label+': no horizontal bar in the page');
  assert.equal(await page.locator('[data-liquidaciones-menu] .task-tabs').count(),1,label);const labels=await tasks.locator('[role=tab]').allInnerTexts();assert.ok(labels.indexOf('Anular período')<labels.indexOf('Confirmar y anular'),label+': Anular período precedes Confirmar y anular');
  assert.equal(await page.locator('[data-liquidaciones-menu] a[href="/nomina#calculo"]').isVisible(),false,label+': default link is a hidden duplicate');assert.equal(await page.locator('[data-liquidaciones-menu] a[href="/novedades"]').isVisible(),true,label);
  assert.equal(await page.locator('[data-liquidaciones-menu][open]').count(),1,label);assert.equal(await page.locator('#task-resumen').isVisible(),true,label);assert.equal(await page.locator('#payrollTaskWorkspace .task-panel:visible').count(),1,label);
 };
 caps=[...all,'payroll.calculation.read'];await page.setViewportSize({width:1440,height:1100});
 await visit(nomina+'#resumen');await nav.waitFor();await mountPayrollWorkspace();await verifyVerticalMenu('sidebar-first');checks.push('vertical payroll menu adopts a workspace registered after the sidebar mount');
 let releaseAuth;holdAuth=new Promise(resolve=>{releaseAuth=resolve;});await visit(nomina+'#resumen');await mountPayrollWorkspace();
 assert.equal(await page.locator('#payrollTaskWorkspace .task-tabs').count(),1,'navigation stays in the page until a sidebar adopts it');releaseAuth();holdAuth=null;await nav.waitFor();await verifyVerticalMenu('workspace-first');checks.push('vertical payroll menu adopts a workspace registered before the sidebar mount');
 for(const [id] of taskList){await tasks.locator('[data-task="'+id+'"]').click();await page.waitForURL('**/nomina#'+id);assert.equal(await page.locator('#task-'+id).isVisible(),true,id);assert.equal(await tasks.locator('[data-task="'+id+'"]').getAttribute('aria-selected'),'true',id);}
 assert.equal(await page.locator('#payrollTaskWorkspace .task-panel:visible').count(),1);assert.equal(await page.evaluate(()=>window.qaWorkspace.panels.size),29,'same workspace, no reload');checks.push('all 29 payroll destinations activate the existing workspace from the sidebar without reload');
 await page.goBack();await page.waitForURL('**/nomina#'+taskList.at(-2)[0]);assert.equal(await tasks.locator('[data-task="'+taskList.at(-2)[0]+'"]').getAttribute('aria-selected'),'true');checks.push('browser back restores the previous payroll task from the sidebar');
 await tasks.locator('[data-task="calculo"]').focus();await page.keyboard.press('ArrowDown');assert.equal(await page.evaluate(()=>document.activeElement?.dataset.task),'anulacion');await page.keyboard.press('ArrowUp');assert.equal(await page.evaluate(()=>document.activeElement?.dataset.task),'calculo');await page.keyboard.press('End');assert.equal(await page.evaluate(()=>document.activeElement?.dataset.task),'cierre');checks.push('vertical keyboard navigation stays inside the process section');
 await page.locator('#mcWorkAreaSearch').fill('anular');assert.deepEqual(await tasks.locator('[role=tab]:visible').allInnerTexts(),['Anular período','Confirmar y anular']);await page.locator('.mc-work-clear').click();assert.equal(await tasks.locator('[role=tab]:visible').count(),29);checks.push('work-area search filters the adopted payroll tasks');
 await nav.screenshot({path:out+'/payroll-vertical-desktop.png'});
 for(const width of [390,320]){
  await page.setViewportSize({width,height:844});await visit(nomina+'#banco');await nav.waitFor();await mountPayrollWorkspace();await tasks.waitFor({state:'attached'});
  assert.equal(await tasks.locator('details.task-section[open]').count(),1,'mobile opens only the active process');assert.equal(await page.locator('.mc-work-toggle').getAttribute('aria-expanded'),'false');
  await page.locator('.mc-work-toggle').click();assert.equal(await tasks.locator('[data-task="banco"]').isVisible(),true);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'viewport '+width);
  await nav.screenshot({path:out+'/payroll-vertical-mobile-'+width+'.png'});await tasks.locator('[data-task="resumen"]').click();await page.waitForURL('**/nomina#resumen');assert.equal(await page.locator('#mcWorkAreaBody').isHidden(),true,'menu closes after choosing a task');assert.equal(await page.locator('#task-resumen').isVisible(),true);
  checks.push('vertical payroll menu on touch viewport '+width+'px');
 }
 await page.setViewportSize({width:1440,height:1100});await visit(nomina+'#resumen');await nav.waitFor();await mountPayrollWorkspace();await tasks.waitFor();
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:new Set(['payroll.read']),platformCapabilities:new Set(),platformRoles:new Set()}})));
 assert.equal(await tasks.locator('[role=tab]:visible').count(),29,'read-only keeps all29 original page-gated tasks');
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:new Set(['payroll.calculation.read']),platformCapabilities:new Set(),platformRoles:new Set()}})));assert.equal(await tasks.locator('[role=tab]:visible').count(),29,'calculation-read-only keeps all29 original page-gated tasks');
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:new Set(),platformCapabilities:new Set(),platformRoles:new Set()}})));assert.equal(await tasks.locator('[role=tab]:visible').count(),0,'withdrawal hides every adopted task');
 await page.locator('#logoutButton').click();assert.equal(await page.locator('[data-liquidaciones-menu]').isHidden(),true);checks.push('vertical payroll menu follows capability refresh and logout');
 caps=all;
 assert.deepEqual(errors,[]);assert.ok(calls.every(x=>x.method==='GET'));
 const result={ok:true,checksPassed:checks.length,checks,mode:published?'published-ui':'compiled-ui',syntheticApi:true,realMunicipalSessionTested:false,realApiWrites:0};
 fs.writeFileSync(out+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(e){fs.writeFileSync(out+'/error.txt',String(e.stack));console.error(JSON.stringify({url:page?.url(),checks,errors}));if(page)await page.screenshot({path:out+'/failure.png'}).catch(()=>{});throw e;}finally{await browser.close();}
