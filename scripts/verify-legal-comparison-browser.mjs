// Published/compiled React, real GET handler, synthetic authorization and SQL only.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {chromium} from 'playwright';import {verifyLegalRegistryPublication} from './verify-legal-registry-publication.mjs';
import {createLegalRegistryHandler} from '../api/internal-legal-registry.js';
import {record,ID,bootstrap,list,access,session} from '../tests/fixtures/legal-registry-synthetic.js';
import '../assets/app-routes.js';
const published=process.argv.includes('--published'),origin=published?'https://municipio-junin-friendly.vercel.app':'https://comparison.test';
const root=path.resolve('public'),out='verification/legal-comparison-'+(published?'published':'local');fs.mkdirSync(out,{recursive:true});
if(published)await verifyLegalRegistryPublication(out);
const snapshots=new Map([1,2,3].map(v=>[v,record(v,3)]));
const item=(label,text)=>({label,text,page:1});
snapshots.get(1).metadata.articles=[item('Artículo 1','El porcentaje se fija en 25%.'),item('Artículo 2','Texto anterior de referencia.'),item('Artículo 3','Texto conservado.')];
snapshots.get(2).metadata.articles=[item('Artículo 1','El porcentaje se fija en 50%.'),item('Artículo 3','Texto conservado.'),item('Artículo 4','Contenido incorporado.')];
snapshots.get(3).metadata=structuredClone(snapshots.get(2).metadata);
snapshots.get(3).reason='Revisión de procedencia sin cambios en el texto';
let readonly=false,denied=false,wrongVersion=false,delay=0,failed=false;
const calls=[],errors=[],checks=[];
const handler=createLegalRegistryHandler({env:{IDENTITY_APP_ORIGIN:origin,NODE_ENV:'production'},
 authorize:async(_req,res)=>{if(denied){res.status(403).json({ok:false,code:'LEGAL_FORBIDDEN',error:'Acceso revocado'});return null;}return access(readonly?['legal.norm.read']:['legal.norm.read','legal.norm.register']);},
 getSql:async()=>({query:async(_query,args)=>{const [,op,json]=args,data=JSON.parse(json);let result;
  if(op==='bootstrap')result=bootstrap(!readonly,1);
  else if(op==='list'){result=list();result.rows[0].current_version=3;result.rows[0].title=snapshots.get(3).metadata.title;}
  else if(op==='detail'){if(data.id!==ID)throw Error('LEGAL_NOT_FOUND');const v=wrongVersion?3:data.version||3;result={version:'legal-registry.v1',record:structuredClone(snapshots.get(v))};}
  else throw Error('UNEXPECTED_NONREAD_OPERATION');return[{result}];}})});
const browser=await chromium.launch({headless:true,...(process.env.QA_CHROMIUM?{executablePath:process.env.QA_CHROMIUM}:{})});let page;
try{
 const context=await browser.newContext({viewport:{width:1440,height:1050},serviceWorkers:'block',locale:'es-AR'});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.abort();
  if(u.pathname.startsWith('/api/')){
   assert.equal(req.method(),'GET','Comparison must never send a mutation');calls.push({path:u.pathname,resource:u.searchParams.get('resource'),version:u.searchParams.get('version')});
   if(u.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,user:{name:'Revisor sintético',email:session.email,role:'MUNICIPIO_ADMIN_OPERATIVO'},access:{tenantCapabilities:['legal.norm.read',...(readonly?[]:['legal.norm.register'])],platformCapabilities:[],platformRoles:[]}}});
   assert.equal(u.pathname,'/api/internal-legal-registry');
   if(delay&&u.searchParams.get('resource')==='detail')await new Promise(r=>setTimeout(r,delay));
   if(failed)return route.fulfill({status:503,json:{ok:false,error:'Servicio de ensayo no disponible'}});
   const res={statusCode:200,headers:{},value:null,setHeader(k,v){this.headers[k]=String(v);},status(n){this.statusCode=n;return this;},json(v){this.value=v;return this;}};
   await handler({method:'GET',url:u.pathname+u.search,query:Object.fromEntries(u.searchParams),headers:req.headers()},res);
   return route.fulfill({status:res.statusCode,headers:res.headers,body:JSON.stringify(res.value)});
  }
  if(published)return route.continue();const resolved=globalThis.MuniControlRoutes.resolve(u.href,u.href),f=path.resolve(root,resolved?.file||'.'+decodeURIComponent(u.pathname));
  if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile())return route.fulfill({status:404,body:''});
  return route.fulfill({body:fs.readFileSync(f),contentType:f.endsWith('.html')?'text/html':f.endsWith('.js')||f.endsWith('.mjs')?'application/javascript':f.endsWith('.css')?'text/css':f.endsWith('.svg')?'image/svg+xml':'application/octet-stream'});
 });
 page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 const app=page.locator('#legalRegistryRoot'),panel=app.locator('.lc-workspace');
 const ready=async()=>{await page.waitForFunction(()=>document.querySelector('.legal-workspace>[role=status]')?.textContent.includes('Registro municipal disponible'));await app.locator('#lrRecordTitle').waitFor();};
 const open=async()=>{await app.getByRole('button',{name:'Comparar versiones',exact:true}).click();await panel.waitFor();};
 const choose=async(a,b)=>{await panel.locator('[name=compareFrom]').selectOption(String(a));await panel.locator('[name=compareTo]').selectOption(String(b));};
 const compare=async()=>{await panel.getByRole('button',{name:'Comparar seleccionadas',exact:true}).click();await panel.locator('.lc-results').waitFor();};
 await page.goto(origin+'/juridica?norma='+ID+'&version=3');await ready();const before=calls.length;await open();
 assert.equal(calls.length,before);assert.equal(await panel.locator('#lcTitle').evaluate(n=>n===document.activeElement),true);
 assert.equal(await panel.locator('[name=compareFrom]').inputValue(),'2');assert.equal(await panel.locator('[name=compareTo]').inputValue(),'3');
 await compare();assert.match(await panel.innerText(),/No hay diferencias/);assert.equal(calls.length,before+2);
 assert.ok(calls.slice(-2).every(c=>['2','3'].includes(c.version)&&c.resource==='detail'));
 checks.push('comparison is on demand and requests two exact saved versions; unchanged documentary content remains unchanged');
 await choose(3,1);const requestsBeforeInvalid=calls.length;await panel.getByRole('button',{name:'Comparar seleccionadas'}).click();assert.match(await panel.getByRole('status').innerText(),/inicial debe ser anterior/);assert.equal(calls.length,requestsBeforeInvalid);
 await choose(1,2);await compare();assert.match(await panel.locator('.lc-version-bar').innerText(),/Versión 1 → Versión 2/);
 assert.equal(await panel.locator('.lc-article').count(),3);assert.equal(await panel.locator('.lc-changed').count(),1);assert.equal(await panel.locator('.lc-added').count(),1);assert.equal(await panel.locator('.lc-removed').count(),1);
 assert.equal(await panel.locator('.lc-changed del').innerText(),'25');assert.equal(await panel.locator('.lc-changed ins').innerText(),'50');
 await panel.locator('[name=compareFilter]').selectOption('all');assert.equal(await panel.locator('.lc-article').count(),4);await panel.locator('[name=compareFilter]').selectOption('unchanged');assert.equal(await panel.locator('.lc-article').count(),1);await panel.locator('[name=compareFilter]').selectOption('changes');
 const altered=panel.locator('.lc-changed');await altered.locator('.lc-citation').first().locator('summary').click();assert.equal(await altered.locator('a').first().getAttribute('href'),'/juridica?norma='+ID+'&version=1#articulo-1');
 checks.push('strict version ordering, article additions/removals, exact 25→50 highlight, filters and source-version citations');
 await panel.screenshot({path:out+'/comparison-desktop.png'});
 for(const width of [390,320]){await page.setViewportSize({width,height:844});await page.emulateMedia({reducedMotion:'reduce'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no overflow '+width);await panel.screenshot({path:out+'/comparison-'+width+'.png'});}
 checks.push('readable before/after blocks at desktop, 390px and 320px without horizontal page overflow');
 await page.setViewportSize({width:1440,height:1050});await choose(1,3);assert.equal(await panel.locator('.lc-results').count(),0);assert.match(await panel.getByRole('status').innerText(),/Selección modificada/);
 wrongVersion=true;await panel.getByRole('button',{name:'Comparar seleccionadas'}).click();await page.waitForFunction(()=>document.querySelector('.lc-workspace [role=status]')?.textContent.includes('versión solicitada'));assert.equal(await panel.locator('.lc-results').count(),0);wrongVersion=false;
 failed=true;await panel.getByRole('button',{name:'Comparar seleccionadas'}).click();await page.waitForFunction(()=>document.querySelector('.lc-workspace [role=status]')?.textContent.includes('Servicio de ensayo'));assert.equal(await panel.locator('.lc-results').count(),0);failed=false;
 checks.push('changing selectors clears stale results; wrong versions and service errors never masquerade as valid comparisons');
 delay=350;await panel.getByRole('button',{name:'Comparar seleccionadas'}).click();await panel.locator('[name=compareTo]').selectOption('2');await page.waitForTimeout(550);assert.equal(await panel.locator('.lc-results').count(),0);assert.equal(await panel.getByRole('button',{name:'Comparar seleccionadas'}).isEnabled(),true);
 await panel.getByRole('button',{name:'Comparar seleccionadas'}).click();await panel.getByRole('button',{name:'Volver a la ficha'}).click();await page.waitForTimeout(550);assert.equal(await panel.count(),0);assert.equal(await app.locator('#lrRecordTitle').evaluate(n=>n===document.activeElement),true);delay=0;
 checks.push('cancelled/stale queries do not reopen comparison or overwrite selection; closing restores focus');
 readonly=true;await page.reload();await ready();assert.equal(await app.getByRole('button',{name:'Crear nueva versión'}).count(),0);await open();await choose(1,2);await compare();
 await panel.locator('.lc-changed .lc-citation').first().locator('summary').click();await panel.locator('.lc-changed a').first().click();await ready();assert.match(page.url(),/version=1#articulo-1$/);assert.match(await app.locator('#articulo-1').innerText(),/25%/);assert.equal(await app.getByRole('button',{name:'Crear nueva versión'}).count(),0);
 checks.push('read-only role can compare and navigate to original article with immutable version; no edit capability required');
 await open();await choose(1,2);denied=true;await panel.getByRole('button',{name:'Comparar seleccionadas'}).click();await app.getByRole('heading',{name:'Acceso no disponible'}).waitFor();assert.equal(await panel.count(),0);assert.equal(await app.locator('.lr-record').count(),0);
 checks.push('server permission denial clears comparison, source records and version history');
 denied=false;await page.reload();await ready();await open();await choose(1,2);delay=350;await panel.getByRole('button',{name:'Comparar seleccionadas'}).click();
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:new Set(),platformCapabilities:new Set(),platformRoles:new Set()}})));
 await app.getByRole('heading',{name:'Acceso no disponible'}).waitFor();await page.waitForTimeout(550);assert.equal(await panel.count(),0);assert.equal(await app.locator('#lrRecordTitle').count(),0);checks.push('permission revocation during in-flight reads prevents late private data from rendering');
 assert.deepEqual(errors,[]);const result={ok:true,checksPassed:checks.length,checks,mode:published?'published-ui':'compiled-ui',realReadHandler:true,authenticationAndSqlSynthetic:true,municipalSessionTested:false,realMunicipalWrites:0};fs.writeFileSync(out+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){fs.writeFileSync(out+'/error.txt',String(error.stack));console.error(JSON.stringify({checks,errors,url:page?.url()}));if(page)await page.screenshot({path:out+'/failure.png'}).catch(()=>{});throw error;}finally{await browser.close();}
