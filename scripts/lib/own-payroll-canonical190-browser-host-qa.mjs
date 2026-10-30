// PRIVATE SOURCE CANDIDATE. Never imported, parsed or executed by its author.
// Shared loopback host for canonical190 browser continuations: the built public
// product, real API handlers over the SAME db adapter, and an explicit auth
// FIXTURE keyed by each browser context's own cookie, so two sessions never
// share a principal. It creates no fixture, schema, IAM grant or foundation and
// serves nothing outside public/. Extracted from the shape of the208/209
// browser modules so later continuations stop duplicating it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {noeliaCircuitRosterRead} from './noelia-payroll-circuit-qa.mjs';
import {principalHasCapabilities} from '../../lib/internal-resource-access.js';
import {ownerDecisionQaLiteral as q} from './municipal-owner-adoption-decision-qa.mjs';

export const PUBLIC_ROOT=fileURLToPath(new URL('../../',import.meta.url));

// The Calcular panel refresh reads the employment catalogue, the approved
// programme, the directory snapshot and the complete own roster. canonical190's
// finite RPC contract does not list those reads; this adapter relocates EXACTLY
// these four read-only statements (as createOwnPayrollReadinessSql does on the
// 146 hosts) and admits nothing else and no write.
export function calculationPanelReads(db,schema){
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 const functions=new Map([
  ['SELECT public.native_employment_catalog_bootstrap_v1($1::jsonb) AS result','native_employment_catalog_bootstrap_v1'],
  ['SELECT public.native_employee_directory_snapshot_v1($1::jsonb) AS result','native_employee_directory_snapshot_v1'],
  ['SELECT public.own_program_bootstrap_v1($1::jsonb) AS result','own_program_bootstrap_v1']
 ]);
 return{query:async(text,values)=>{
  const roster=noeliaCircuitRosterRead(text,values,schema);
  if(roster)return db.run('SELECT ('+roster+')',false,{readCommitted:true});
  const name=functions.get(text);assert.ok(name,'CANONICAL190_BROWSER_READ_NOT_ALLOWED');
  assert.ok(Array.isArray(values)&&values.length===1&&typeof values[0]==='string','CANONICAL190_BROWSER_READ_ARITY');
  const context=JSON.parse(values[0]);assert.ok(context&&typeof context==='object'&&!Array.isArray(context));
  return[{result:await db.run('SELECT '+name+'('+q(values[0])+'::jsonb)',true)}];
 }};
}

// actors: Map name → {principal,session,raw,roleKey}. identity(name,actor) may
// narrow capabilities or change the presented user id for a probe; it never
// widens anything, because SQL still authorises the actor's real session.
export async function createCanonical190BrowserHost({h,actors,getSql,handlers,outputName,identity=null,pages={},receiptSelfPage=false}){
 assert.equal(typeof receiptSelfPage,'boolean');assert.ok(actors instanceof Map&&actors.size>0);assert.equal(typeof getSql,'function');assert.equal(typeof handlers,'function');
 for(const[name,actor]of actors){assert.match(name,/^[a-z]+$/);for(const key of['principal','session','raw','roleKey'])assert.ok(Object.hasOwn(actor,key),'CANONICAL190_BROWSER_ACTOR_'+key+':'+name);assert.equal(actor.principal.authorized,true);assert.equal(actor.session.id,actor.raw.actorSessionId);assert.equal(actor.principal.tenant.membershipId,actor.raw.membershipId);}
 assert.ok(pages&&typeof pages==='object'&&!Array.isArray(pages)&&Reflect.ownKeys(pages).every(key=>typeof key==='string'),'CANONICAL190_BROWSER_PAGES');
 const pageFiles=new Map([['/nomina','nomina-control.html']]);
 for(const [route,file]of Object.entries(pages)){
  assert.ok(route==='/nomina'&&file==='nomina-control.html'||route==='/acciones'&&file==='centro-acciones.html'||route==='/estructura.html'&&file==='estructura.html'||route==='/internal-dashboard.html'&&file==='internal-dashboard.html','CANONICAL190_BROWSER_PAGE_NOT_ALLOWED');
  pageFiles.set(route,file);
 }
 const env={},evidence={httpEvidence:[],external:[],pageErrors:[],serverErrors:[],loginTargets:[]};
 let server=null,browser=null,closing=null;const contexts=[];
 // Cleanup is available before the first resource is acquired. A failed
 // constructor/open rethrows its original error even if teardown also fails.
 const close=()=>{
  if(closing)return closing;
  closing=(async()=>{
   const errors=[];
   for(const context of contexts){try{await context.close();}catch(error){errors.push(error);}}
   if(browser){try{await browser.close();}catch(error){errors.push(error);}}
   if(server){
    try{server.closeAllConnections();}catch(error){errors.push(error);}
    try{await new Promise((resolve,reject)=>server.close(error=>error&&error.code!=='ERR_SERVER_NOT_RUNNING'?reject(error):resolve()));}catch(error){errors.push(error);}
   }
   if(errors.length)throw errors[0];
  })();
  return closing;
 };
 try{
 const actorOf=req=>{const match=String(req.headers?.cookie??'').match(/(?:^|;\s*)qa_actor=([a-z]+)(?:;|$)/);return match?actors.get(match[1])??null:null;};
 const byMembership=principal=>[...actors.values()].find(actor=>actor.principal.tenant.membershipId===principal?.tenant?.membershipId)??null;
 const presented=(name,actor)=>{const base={userId:actor.raw.actorSessionId,caps:actor.principal.tenant.effectiveCapabilities};return identity?{...base,...identity(name,actor)}:base;};
 const deps={env,
  requireAccess:async(req,res,options={})=>{const actor=actorOf(req);if(!actor){res.status(401).json({ok:false,code:'QA_UNAUTHENTICATED',error:'Sesión sintética ausente.'});return null;}if(!principalHasCapabilities(actor.principal,options.requiredCapabilities??[],options.capabilityMode??'all')){res.status(403).json({ok:false,code:'QA_CAPABILITY_REQUIRED',error:'La sesión sintética no tiene la capacidad requerida.'});return null;}return{mode:'managed',principal:actor.principal};},
  sessionFor:access=>{const actor=byMembership(access.principal);assert.ok(actor,'CANONICAL190_BROWSER_FOREIGN_PRINCIPAL');return actor.session;},
  getSql};
 const routes=handlers(deps);assert.ok(routes instanceof Map);
 const output=path.resolve(h.destination,outputName);assert.ok(output.startsWith(path.resolve(h.destination)+path.sep));fs.mkdirSync(output,{recursive:false});
 server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://qa.invalid');res.setHeader('Cache-Control','no-store');
  const json=(status,value)=>{if(res.headersSent){res.destroy();return;}res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
  if(url.pathname==='/api/internal-auth'){
   const actor=actorOf(req);if(!actor){json(401,{ok:false,code:'QA_UNAUTHENTICATED',error:'Sesión sintética ausente.'});return;}
   const name=[...actors].find(([,value])=>value===actor)[0],shown=presented(name,actor);
   json(200,{ok:true,authenticated:true,sessionVersion:2,user:{id:shown.userId,email:actor.raw.actorEmail},
    access:{context:'tenant',tenant:{id:actor.raw.tenantId,roleKey:actor.roleKey},tenantCapabilities:shown.caps,platformCapabilities:[],platformRoles:[]},
    expiresAt:new Date(Date.now()+3600000).toISOString()});return;
  }
  const handler=routes.get(url.pathname);
  if(handler){
   req.query=Object.fromEntries(url.searchParams);res.status=value=>{res.statusCode=value;return res;};
   res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return res;};
   Promise.resolve(handler(req,res)).catch(error=>{evidence.serverErrors.push(error.message);json(500,{ok:false,error:'QA_HANDLER_REJECTED'});});return;
  }
  if(url.pathname.startsWith('/api/')){json(503,{ok:false,error:'Unrelated QA service is outside this continuation'});return;}
  // Same rewrite as the published product: /nomina serves nomina-control.html.
  const publicRoot=path.join(PUBLIC_ROOT,'public');let file;
  try{const selected=pageFiles.get(url.pathname);file=path.resolve(publicRoot,'.'+(selected?'/'+selected:decodeURIComponent(url.pathname)));}catch{res.writeHead(400).end();return;}
  const allowed=[...pageFiles.values()].some(name=>file===path.join(publicRoot,name))||receiptSelfPage&&file===path.join(publicRoot,'centro-acciones.html')||file.startsWith(path.join(publicRoot,'assets')+path.sep)&&/\.(js|css|png|svg|webp|woff2?)$/.test(file);
  if(req.method!=='GET'||!allowed||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  const type=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':file.endsWith('.svg')?'image/svg+xml':'application/octet-stream';
  res.writeHead(200,{'Content-Type':type});res.end(fs.readFileSync(file));
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const origin='http://127.0.0.1:'+server.address().port;env.INTERNAL_APP_ORIGIN=origin;
 const executable=process.env.OWN_LIQ_QA_HEADLESS_EXECUTABLE;
 if(executable)assert.ok(path.isAbsolute(executable)&&fs.existsSync(executable)&&/^chrome-headless-shell(?:\.exe)?$/.test(path.basename(executable)));
 browser=await chromium.launch({headless:true,...(executable?{executablePath:executable}:{})});
 // open(actorName|null): a separate browser context with that actor's cookie,
 // every external origin blocked and the login page replaced by a destination
 // probe (nothing is signed in from here). page.on hooks are the caller's.
 const open=async actorName=>{
  try{
   assert.ok(actorName===null||actors.has(actorName),'CANONICAL190_BROWSER_UNKNOWN_ACTOR');
   const browserContext=await browser.newContext({viewport:{width:1366,height:1100},serviceWorkers:'block'});contexts.push(browserContext);
   if(actorName)await browserContext.addCookies([{name:'qa_actor',value:actorName,url:origin}]);
   await browserContext.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin!==origin){evidence.external.push(route.request().url());return route.abort('blockedbyclient');}
    if(url.pathname==='/acceso'){evidence.loginTargets.push(url.searchParams.get('next'));return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>QA acceso</title>'});}
    return route.continue();
   });
   const page=await browserContext.newPage();page.on('pageerror',error=>evidence.pageErrors.push(error.message));
   const request=async(relative,options={})=>{
    const response=await browserContext.request.fetch(origin+relative,{...options,headers:{Accept:'application/json',Origin:origin,...options.headers}});
    const body=await response.body();evidence.httpEvidence.push({actor:actorName,path:new URL(relative,origin).pathname,method:options.method??'GET',status:response.status(),bytes:body.length});
    return{response,body:JSON.parse(body.toString('utf8'))};
   };
   return{actorName,browserContext,page,request,close:()=>browserContext.close()};
  }catch(error){
   try{await close();}catch{}
   throw error;
  }
 };
 return Object.freeze({origin,env,output,evidence,open,close});
 }catch(error){
  try{await close();}catch{}
  throw error;
 }
}
