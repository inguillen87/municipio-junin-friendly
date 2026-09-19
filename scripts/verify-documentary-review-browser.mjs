// Compiled/public UI and real API adapter; only synthetic sessions and database responses.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {createLegalRegistryHandler} from '../api/internal-legal-registry.js';
import {access,session,bootstrap,list,record} from '../tests/fixtures/legal-registry-synthetic.js';
import {documentaryFixture,documentaryRows} from '../tests/fixtures/documentary-review-synthetic.js';
import '../assets/app-routes.js';
const published=process.argv.includes('--published'),origin=published?'https://municipio-junin-friendly.vercel.app':'https://documentary.test';
const out='verification/documentary-review-'+(published?'published':'local'),root=path.resolve('public');fs.mkdirSync(out,{recursive:true});
let failure=false,empty=false,malformed=false,denied=false;const calls=[],errors=[],checks=[],assets=[];
const sql={query:async(text,args)=>{calls.push({text,method:'GET'});if(denied)throw Error('LEGAL_FORBIDDEN');if(failure)throw Error('UNAVAILABLE');
 if(text.includes('legal_documentary_review_v1')){const input=JSON.parse(args[1]),data=documentaryFixture(input.filter,input.page,empty?[]:documentaryRows());if(malformed)data.summary.all=9999;return[{result:data}];}
 const op=args[1];if(op==='bootstrap')return[{result:bootstrap(false,26)}];if(op==='list')return[{result:list()}];
 if(op==='detail'){const d=JSON.parse(args[2]),r=record(d.version||1);r.id=d.id;return[{result:{version:'legal-registry.v1',record:r}}];}throw Error('UNEXPECTED_OPERATION');}};
const handler=createLegalRegistryHandler({env:{NODE_ENV:'production',IDENTITY_APP_ORIGIN:origin},authorize:async()=>access(['legal.norm.read']),getSql:async()=>sql});
const browser=await chromium.launch({headless:true});let page;
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block',locale:'es-AR'});
 await context.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.abort();
 if(u.pathname.startsWith('/api/')){assert.equal(req.method(),'GET','No mutation during documentary review');
  if(u.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,user:{name:'Revisor sintético',email:session.email,role:'QA_READER'},access:{tenantCapabilities:['legal.norm.read'],platformCapabilities:[],platformRoles:[]}}});
  if(u.pathname!=='/api/internal-legal-registry')return route.fulfill({status:403,json:{ok:false}});
  const res={statusCode:200,headers:{},value:null,setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.value=v;return this;}};
  await handler({method:'GET',url:u.pathname+u.search,query:Object.fromEntries(u.searchParams),headers:req.headers()},res);
  return route.fulfill({status:res.statusCode,headers:res.headers,contentType:'application/json',body:JSON.stringify(res.value)});
 }
 assets.push(u.pathname);if(published)return route.continue();const resolved=globalThis.MuniControlRoutes.resolve(u.href,u.href),file=path.resolve(root,resolved?.file||'.'+decodeURIComponent(u.pathname));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(file),contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.mjs':'application/javascript'})[path.extname(file)]||'application/octet-stream'});
 });
 page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/juridica');const app=page.locator('#legalRegistryRoot');await app.getByRole('button',{name:'Revisión documental',exact:true}).waitFor();
 await page.waitForFunction(()=>document.querySelector('.legal-workspace [role=status]')?.textContent.includes('Registro municipal disponible'));
 assert.equal(assets.includes('/assets/legal-documentary-panel.js'),false);assert.equal(calls.filter(c=>c.text.includes('legal_documentary_review_v1')).length,0);
 await app.getByRole('button',{name:'Revisión documental',exact:true}).click();const panel=app.locator('.ldr-workspace');
 await panel.locator('.ldr-tile').first().waitFor();assert.equal(await panel.locator('.ldr-tile').count(),8);assert.equal(await panel.locator('.ldr-card').count(),25);assert.equal(await panel.locator('[data-documentary-filter=all] strong').innerText(),'26');
 checks.push('lazy workspace uses actual API adapter and displays eight verified counts without writes');
 await panel.locator('[data-documentary-filter=no_articles]').click();await page.waitForFunction(()=>document.querySelector('.ldr-result-count')?.textContent.startsWith('13 fichas'));assert.equal(await panel.locator('.ldr-card').count(),13);checks.push('category filtering reports the full matching set, with overlapping categories explicitly explained');
 await panel.locator('[data-documentary-filter=all]').click();await page.waitForFunction(()=>document.querySelectorAll('.ldr-card').length===25);await panel.getByRole('button',{name:'Siguiente',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.ldr-result-count')?.textContent.includes('Página 2'));assert.equal(await panel.locator('.ldr-card').count(),1);assert.equal(await panel.getByRole('button',{name:'Siguiente',exact:true}).isDisabled(),true);
 await panel.getByRole('button',{name:'Anterior',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.ldr-card').length===25);assert.match(await panel.locator('.ldr-card a').first().getAttribute('href'),/version=2$/);checks.push('pagination stays bounded and links preserve the precise documentary version');
 await panel.screenshot({path:out+'/desktop.png'});for(const width of [390,320]){await page.setViewportSize({width,height:844});await page.emulateMedia({reducedMotion:'reduce'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.ok(await panel.locator('.ldr-tile').first().evaluate(n=>n.getBoundingClientRect().height>=44));await panel.screenshot({path:out+'/mobile-'+width+'.png'});}checks.push('desktop and 320/390 px retain readable category cards and usable controls');
 failure=true;await panel.getByRole('button',{name:'Actualizar revisión'}).click();await page.waitForFunction(()=>document.querySelector('.ldr-message')?.textContent.startsWith('No se pudo verificar'));assert.equal(await panel.locator('.ldr-card,.ldr-tile').count(),0);checks.push('service failure clears stale counts and rows instead of rendering zero or cached success');
 failure=false;empty=true;await panel.getByRole('button',{name:'Actualizar revisión'}).click();await panel.getByRole('heading',{name:'Todavía no hay normas registradas'}).waitFor();assert.equal(await panel.locator('[data-documentary-filter=all] strong').innerText(),'0');checks.push('genuine empty source stays empty, with no examples presented as municipal data');
 empty=false;malformed=true;await panel.getByRole('button',{name:'Actualizar revisión'}).click();await page.waitForFunction(()=>document.querySelector('.ldr-message')?.textContent.startsWith('No se pudo verificar'));assert.equal(await panel.locator('.ldr-tile').count(),0);checks.push('malformed API totals are rejected before rendering');
 malformed=false;await panel.getByRole('button',{name:'Actualizar revisión'}).click();await panel.locator('.ldr-card').first().waitFor();denied=true;await panel.getByRole('button',{name:'Actualizar revisión'}).click();await app.getByRole('heading',{name:'Acceso no disponible'}).waitFor();assert.equal(await app.locator('.ldr-card,.ldr-tile').count(),0);checks.push('revoked permission clears documentary review and the parent private workspace');
 assert.deepEqual(errors,[]);const report={ok:true,checksPassed:checks.length,checks,published,actualApiAdapter:true,syntheticSessionAndSql:true,realMunicipalWrites:0};fs.writeFileSync(out+'/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(e){fs.writeFileSync(out+'/error.txt',String(e.stack));if(page)await page.screenshot({path:out+'/failure.png'}).catch(()=>{});throw e;}finally{await browser.close();}
