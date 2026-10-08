// Compiled UI, actual HTTP handler, synthetic scoped SQL. No municipal calls or records.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {createInternalPayrollNoveltiesHandler} from '../api/internal-payroll-novelties.js';
import {fixture,principal,session} from '../tests/fixtures/grh-import-synthetic.js';
import {GRH_GUARDED_PREPARE_SQL} from '../lib/grh-import-prepare-sql.js';

const root=path.resolve('public'),out=path.resolve('verification/grh-import-login-recovery-browser');
fs.mkdirSync(out,{recursive:true});
let origin,mode='normal',authExpired=false,f,p,s,handler,commands=[],loginVisits=0;
const checks=[],errors=[],external=[];
function initialize(){
 f=fixture(12);p=principal();s=session();p.tenant.certifiedReleaseSha=s.releaseSha;
 mode='normal';authExpired=false;commands=[];loginVisits=0;
 const receipts=new Map(),base=f.runtime.query;
 f.runtime.query=async(sql,args)=>{
  if(sql!==GRH_GUARDED_PREPARE_SQL)return base(sql,args);
  if(receipts.has(args[5])){const result=structuredClone(receipts.get(args[5]));result[0].result.receipt.replayed=true;return result;}
  const result=await base(sql,args);receipts.set(args[5],structuredClone(result));return result;
 };
 handler=createInternalPayrollNoveltiesHandler({env:{NODE_ENV:'production',IDENTITY_APP_ORIGIN:origin,INTERNAL_CERTIFIED_DATA_CONTRACT_SHA:s.releaseSha},getInternalSql:async()=>f.runtime,getGrhReadSql:async()=>f.readSql,requireCompatibleInternalAccess:async(req,res)=>{
  if(['expired','revoked'].includes(mode)){res.status(mode==='expired'?401:403).json({ok:false,code:mode==='expired'?'SESSION_INVALID':'PAYROLL_NOVELTY_CAPABILITY_REQUIRED'});return null;}
  return{mode:'managed',principal:p,session:s};
 }});
}
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,origin);
 if(url.pathname==='/api/internal-payroll-novelties'){
  let body='';for await(const part of req){body+=part;if(body.length>600000){res.writeHead(413);res.end();return;}}
  req.query=Object.fromEntries(url.searchParams);if(body){req.body=JSON.parse(body);commands.push({command:req.body.command,key:req.headers['idempotency-key'],sha256:createHash('sha256').update(body).digest('hex')});}
  res.status=n=>{res.statusCode=n;return res;};res.json=data=>{
   res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','private, no-store');
   if(mode==='uncertain'&&req.body?.command==='grhPrepare'&&data.ok){mode='normal';data={...data,data:{...data.data,savedRows:0}};}
   res.end(JSON.stringify(data));return res;
  };
  try{await handler(req,res);}catch(error){res.status(500).json({ok:false});}return;
 }
 if(req.method!=='GET'){res.writeHead(405);res.end();return;}
 if(url.pathname==='/api/internal-auth'){
  res.writeHead(authExpired?401:200,{'Content-Type':'application/json','Cache-Control':'private, no-store'});
  res.end(JSON.stringify(authExpired?{ok:false}:{ok:true,authenticated:true,access:{tenantCapabilities:p.tenant.effectiveCapabilities,platformCapabilities:[],platformRoles:[]}}));return;
 }
 if(url.pathname==='/acceso'){
  assert.equal(url.search,'');loginVisits++;
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  res.end('<!doctype html><html lang="es"><title>Ingreso sintético</title><p>Destino de ingreso de QA. No se autentica a ninguna persona.</p></html>');return;
 }
 const file=path.resolve(root,url.pathname.slice(1));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'})[path.extname(file)]??'application/octet-stream');res.end(fs.readFileSync(file));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
let browser,page;
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.MUNICONTROL_QA_BROWSER_EXECUTABLE||undefined});
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'es-AR'});
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();external.push('unexpected_external_request');return route.abort();});
 page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
 async function setup({expired=false,gateExpired=false}={}){
  initialize();mode=expired?'expired':'normal';authExpired=gateExpired;
  await page.goto(origin+'/importar-novedades-grh.html');
  await page.locator('#accessStatus').filter({hasText:expired?'La sesión':'Acceso verificado'}).waitFor();
 }
 async function retired(){
  assert.equal(await page.locator('#intake').isVisible(),false);
  assert.equal(await page.locator('#rows>tr').count(),0);assert.equal(await page.locator('#file').inputValue(),'');
  assert.equal(await page.locator('#downloadIncidents').isDisabled(),true);assert.equal(await page.locator('#saveButton').isDisabled(),true);
 }
 const login=page.locator('#accessLogin');
 await setup({expired:true});await retired();assert.equal(await login.isVisible(),true);assert.equal(commands.length,0);assert.equal(loginVisits,0);
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:1000});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  for(const id of ['accessLogin','recheckAccess']){assert.ok((await page.locator('#'+id).boundingBox()).height>=44);await page.locator('#'+id).focus();assert.equal(await page.locator('#'+id).evaluate(el=>el===document.activeElement),true);}
  await page.screenshot({path:path.join(out,'expired-'+width+'.png'),fullPage:true});
 }
 checks.push('Sesión401: ingreso voluntario, controles accesibles de44px a1440/390/320px, sin recorte ni escrituras.');
 assert.equal(await login.getAttribute('href'),'/acceso');
 assert.equal(await login.getAttribute('target'),'_blank');assert.equal(await login.getAttribute('rel'),'noopener noreferrer');
 const popupPromise=context.waitForEvent('page');await login.click();const popup=await popupPromise;await popup.waitForLoadState();
 assert.equal(await popup.evaluate(()=>window.opener),null);assert.equal(loginVisits,1);
 assert.equal(page.url(),origin+'/importar-novedades-grh.html');assert.equal(commands.length,0);await popup.close();await page.bringToFront();
 mode='normal';await page.locator('#recheckAccess').click();await page.locator('#accessStatus').filter({hasText:'Acceso comprobado'}).waitFor();
 assert.equal(await login.isVisible(),false);assert.equal(commands.length,0);
 checks.push('El enlace abre sólo el ingreso local en otra pestaña, sin opener ni envío; volver requiere comprobar explícitamente el acceso.');
 await setup();await page.locator('#concept').fill('614');await page.locator('#period').fill('2026-08');
 await page.locator('#file').setInputFiles({name:'QA-sintetico.txt',mimeType:'text/plain',buffer:Buffer.from(f.payload.contentBase64,'base64')});
 await page.locator('#previewButton').click();await page.locator('#progress').filter({hasText:'Revisión completada'}).waitFor();
 mode='uncertain';await page.locator('#saveButton').click();await page.locator('#writeMessage').filter({hasText:'puede haberse guardado'}).waitFor();
 const original=structuredClone(commands.filter(c=>c.command==='grhPrepare'));assert.equal(original.length,1);assert.equal(f.state.writes,1);
 mode='expired';await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'hidden',{value:false,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
 await page.locator('#recheckAccess').click();await page.locator('#accessStatus').filter({hasText:'La sesión venció'}).waitFor();await retired();assert.equal(await login.isVisible(),true);
 mode='normal';await page.locator('#recheckAccess').click();await page.locator('#writeMessage').filter({hasText:'contenido y clave originales'}).waitFor();
 assert.deepEqual(commands.filter(c=>c.command==='grhPrepare'),original);assert.equal(await page.locator('#concept').isDisabled(),true);
 await page.locator('#retryButton').click();await page.locator('#writeMessage').filter({hasText:'Se recuperó el recibo'}).waitFor();
 assert.deepEqual(commands.filter(c=>c.command==='grhPrepare'),[original[0],original[0]]);assert.equal(f.state.writes,1);
 checks.push('Guardado incierto401: previa retirada, mismo cuerpo/clave al único reintento voluntario y un solo lote sintético.');
 await setup({expired:true});mode='revoked';await page.locator('#recheckAccess').click();await page.locator('#accessStatus').filter({hasText:'Se retiraron'}).waitFor();assert.equal(await login.isVisible(),false);await retired();assert.equal(commands.length,0);
 checks.push('Revocación403 retira el enlace de sesión vencida y mantiene el acceso bloqueado.');
 initialize();mode='expired';authExpired=true;await page.goto(origin+'/importar-novedades-grh.html');await page.locator('#accessRecovery').waitFor();
 await page.locator('#recheckAccess').click();await page.locator('#accessStatus').filter({hasText:'La sesión venció'}).waitFor();assert.equal(await login.isVisible(),true);await retired();
 checks.push('Gate real sin sesión: la comprobación del servidor clasifica401 y ofrece ingreso sin conceder capacidades.');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
 const report={ok:true,checksPassed:checks.length,checks,errors,external,municipalRecordsUsed:false,municipalWrites:0,authenticationAutomated:false,sqlStubbed:true};
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({ok:false,checks,errors,code:error.name},null,2));await page?.screenshot({path:path.join(out,'failure.png'),fullPage:true});throw error;}
finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
