// Interfaz real; identidades y respuestas de directorio sintéticas. Ninguna sesión municipal.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {chromium} from 'playwright';
const published=process.argv.includes('--published'),origin=published?'https://municipio-junin-friendly.vercel.app':'http://127.0.0.1:4339';
const root=path.resolve('public'),out=path.resolve('verification/structure-people-'+(published?'published':'local'));fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CLOCK_BROWSER_CHANNEL?{channel:process.env.CLOCK_BROWSER_CHANNEL}:{})});
const checks=[],errors=[],requests=[],assets=new Map();let canRead=true,denied=0,delay=false,releaseRead=null;
const people=Array.from({length:31},(_,i)=>({contractId:String(i+1).padStart(8,'0')+'-1111-4111-8111-111111111111',legajo:String(9001+i),nombre:'Persona de prueba '+(i+1),cargo:'Administrativo',administrativeStatus:i<28?'active':'inactive'}));
const group='Administración de prueba';
const structure={ok:true,coverage:{historicalRecords:31,activeRecords:28,inactiveRecords:3,withOrganization:31,withSector:31,withRole:31,organizationsObserved:1,sectorsObserved:1},hierarchy:{reason:'Fuente sintética sin jerarquía.',catalogRows:1,parentLinks:0},source:{status:'completed',name:'ENSAYO',cutoff:'2026-09-10T15:00:00Z',importedAt:'2026-09-11T15:00:00Z',sha256:'a'.repeat(64)},definitions:{grain:'Un vínculo por legajo'},organizations:[{label:group,assigned:true,organizationIds:['1'],historical:31,active:28,inactive:3,sectorCount:1}],sectors:[{label:'Sector de prueba',assigned:true,sectorCodes:['1'],historical:31,active:28,inactive:3,organizationCount:1}],catalogs:{summary:[],jobRoles:[],organizations:[],sectors:[]}};
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'es-AR',serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.abort();
  if(u.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,user:{name:'Operador de prueba',email:'operador@example.invalid'},access:{tenantCapabilities:['workforce.structure.read',...(canRead?['workforce.employee.read']:[])],platformCapabilities:[],platformRoles:[]}}});
  if(u.pathname==='/api/internal-data'){
   if(u.searchParams.get('resource')==='structure')return route.fulfill({json:structure});
   if(u.searchParams.get('resource')==='employees'){
    requests.push(Object.fromEntries(u.searchParams));if(delay)await new Promise(resolve=>releaseRead=resolve);
    if(denied)return route.fulfill({status:denied,json:{ok:false}}).catch(()=>{});
    const p=u.searchParams,page=Number(p.get('page')),search=p.get('search').toLowerCase(),status=p.get('status');
    const rows=people.filter(r=>(!search||(r.nombre+' '+r.legajo).toLowerCase().includes(search))&&(status==='all'||r.administrativeStatus===(status==='inactive'?'inactive':'active')));
    return route.fulfill({json:{ok:true,data:rows.slice((page-1)*25,page*25),pagination:{page,limit:25,total:rows.length,pages:Math.max(1,Math.ceil(rows.length/25))}}}).catch(()=>{});
   }
   return route.fulfill({status:403,json:{ok:false}});
  }
  if(u.pathname.startsWith('/api/'))return route.fulfill({status:403,json:{ok:false}});
  let rel=u.pathname==='/'?'index.html':u.pathname.slice(1);if(!path.extname(rel))rel+='.html';
  const file=path.resolve(root,rel);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:'Not found'});
  const expected=fs.readFileSync(file);
  if(published){const response=await route.fetch();assert.equal(response.status(),200,rel);const bytes=await response.body();assert.equal(sha(bytes),sha(expected),'Published bytes: '+rel);assets.set(rel,sha(bytes));return route.fulfill({response,body:bytes});}
  assets.set(rel,sha(expected));return route.fulfill({body:expected,contentType:mime[path.extname(file)]||'application/octet-stream'});
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(origin+'/estructura');
 const open=page.locator('#organizationRows [data-sp-open]');await open.waitFor();assert.equal(requests.length,0);assert.equal(assets.has('assets/structure-people.js'),false);
 await page.locator('#searchInput').fill('Administración');await open.click();const dialog=page.locator('#structurePeopleDialog');await dialog.locator('[data-sp-rows] tr').first().waitFor();
 assert.equal(await dialog.locator('[data-sp-rows] tr').count(),25);assert.match(await dialog.getByRole('status').innerText(),/31 legajos/);
 assert.equal(requests[0].organization,group);assert.equal(requests[0].includeFacets,'0');assert.equal(requests[0].limit,'25');
 checks.push('Organización exacta, 25 filas, total 31 y módulo cargado sólo al abrir.');
 await dialog.getByRole('button',{name:'Siguiente',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-sp-rows] tr').length===6);assert.match(await dialog.innerText(),/9031/);
 await dialog.getByLabel('Nombre o legajo').fill('9030');await dialog.getByRole('button',{name:'Consultar',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-sp-rows] tr').length===1);assert.match(await dialog.innerText(),/Persona de prueba 30/);
 assert.equal(requests.at(-1).page,'1');checks.push('Paginación completa y búsqueda que vuelve a la primera página.');
 await dialog.getByLabel('Nombre o legajo').fill('');await dialog.getByLabel('Situación',{exact:true}).selectOption('inactive');await dialog.getByRole('button',{name:'Consultar',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('[data-sp-rows] tr').length===3);assert.equal(requests.at(-1).status,'inactive');
 await dialog.screenshot({path:path.join(out,'desktop.png')});
 await page.setViewportSize({width:390,height:844});await dialog.screenshot({path:path.join(out,'mobile.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks.push('Filtro de inactivos y vista móvil de 390 píxeles sin desbordamiento de la página.');
 await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});assert.equal(await page.locator('#searchInput').inputValue(),'Administración');checks.push('Escape cierra el listado y conserva la búsqueda de Estructura.');
 await page.setViewportSize({width:1440,height:1000});await page.locator('#tab-sectors').click();await page.locator('#searchInput').fill('');await page.locator('#sectorRows [data-sp-open]').click();await dialog.locator('[data-sp-rows] tr').first().waitFor();assert.equal(requests.at(-1).sector,'Sector de prueba');checks.push('El mismo detalle funciona por sector sin confundir el filtro de organización.');
 denied=403;await dialog.getByRole('button',{name:'Siguiente',exact:true}).click();await dialog.getByRole('status').filter({hasText:'Tu perfil no tiene acceso'}).waitFor();assert.equal(await dialog.locator('[data-sp-rows] tr').count(),0);assert.doesNotMatch(await dialog.innerText(),/Persona de prueba/);checks.push('Una denegación retira los datos anteriores y permite reintentar, sin mostrarlos como vigentes.');
 denied=0;await dialog.getByRole('button',{name:'Reintentar listado'}).click();await dialog.locator('[data-sp-rows] tr').first().waitFor();await dialog.getByRole('button',{name:'Cerrar listado'}).click();
 delay=true;await page.locator('#sectorRows [data-sp-open]').click();for(let i=0;i<100&&!releaseRead;i++)await new Promise(resolve=>setTimeout(resolve,20));assert.ok(releaseRead);await page.keyboard.press('Escape');releaseRead();releaseRead=null;delay=false;await page.waitForTimeout(100);assert.equal(await dialog.count(),0);checks.push('Cerrar durante una respuesta lenta cancela la consulta y no reabre el listado.');
 canRead=false;const before=requests.length;await page.reload();await page.locator('#organizationRows tr').waitFor();assert.equal(await page.locator('[data-sp-open]').count(),0);assert.equal(requests.length,before);checks.push('Sin permiso nominal no se ofrecen acciones ni se consulta el directorio.');
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:true,published,checks,assets:[...assets.keys()],requestCount:requests.length,errors,syntheticIdentities:true,realMunicipalSessionTested:false},null,2));console.log(JSON.stringify({ok:true,checks:checks.length,assets:assets.size,errors,published,realMunicipalSessionTested:false}));
}catch(error){console.error(error);process.exitCode=1;}finally{if(releaseRead)releaseRead();await browser.close();}
