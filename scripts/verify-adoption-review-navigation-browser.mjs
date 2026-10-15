// Independent navigation QA: real frontend modules, loopback HTTP, invented
// sealed fixtures. No SQL, real accounts, production APIs or municipal decisions.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {launchOwnSyntheticBrowser} from './lib/own-synthetic-browser.mjs';
import {sealAdoptionReview,adoptionReviewHash} from '../assets/employment-adoption-review-model.js';
import {adoptionPreparationPayload} from '../assets/employment-adoption-preparation-model.js';
import {municipalAdoptionQueue,municipalAdoptionDetail,municipalAdoptionCommand,municipalAdoptionAttempt} from '../assets/municipal-adoption-operator-model.js';
import {activeAdoptionRaw} from '../tests/fixtures/active-contract-adoption-synthetic.js';
import {reviewId} from '../tests/fixtures/employment-adoption-review-synthetic.js';

const root=path.resolve(import.meta.dirname,'..'),args=process.argv.slice(2);
assert.ok(args.length<=1&&args.every(v=>v.startsWith('--output=')),'Only --output= is supported.');
const output=path.resolve(args[0]?.slice(9)??path.join(root,'verification','adoption-review-navigation-browser-'+new Date().toISOString().replace(/\D/g,'')));
assert.ok(output.startsWith(path.join(root,'verification')+path.sep)&&!fs.existsSync(output),'Preserve prior evidence; use a new verification directory.');
fs.mkdirSync(output,{recursive:true});
const sha=v=>createHash('sha256').update(v).digest('hex'),clone=v=>structuredClone(v),version='municipal-adoption-operator.v1';
const caps=['workforce.employee.read','employee.record.approve'],email='independent-reviewer@example.invalid';
const fixtureIds={first:reviewId(91001),second:reviewId(91002),own:reviewId(91003),decided:reviewId(91004),absent:reviewId(91005)};
const href=id=>'/personal?adopcion='+id+'#legajos',pendingHref='/personal?adopcion=pendientes#legajos';
const checks=[],requests=[],posts=[],errors=[],unexpected=[],failures=[],transport=[],served=new Map();
let server,browser,page,origin,driverName,phase='initial';
const check=(condition,label)=>{assert.ok(condition,label);checks.push(label);};
const fixtures=new Map();
async function fixture(id,count,{current=true,status='pending'}={}){
 const raw=activeAdoptionRaw(count),review=await sealAdoptionReview(raw),body=await adoptionPreparationPayload(review,'c'.repeat(64),'42','Documento exclusivamente ficticio QA','Antecedentes inventados para revisar navegación completa');
 const proposal={version:'employment-adoption.v1',operation:status==='pending'?'propose':'review',proposalId:id,proposalVersion:await adoptionReviewHash({id,kind:'fictional-proposal'}),sourceContextVersion:body.sourceContextVersion,catalogVersion:body.catalogVersion,status,total:count,replayed:false,decidedAt:status==='pending'?null:'2026-01-03T12:00:00Z',effects:{identitiesCreated:0,contractsCreated:0,contractsAdopted:status==='approved'?count:0,sourceHistoryRetained:true,payrollCalculated:false,payrollPosted:false,paymentsExecuted:false}};
 const detail={version,scope:clone(review.scope),proposal,body,review,reviewVersion:await adoptionReviewHash({id,current,kind:'fictional-review'}),current,applicationAvailable:true};
 await municipalAdoptionDetail(clone(detail));fixtures.set(id,detail);return detail;
}
const first=await fixture(fixtureIds.first,855),second=await fixture(fixtureIds.second,855),own=await fixture(fixtureIds.own,57),decided=await fixture(fixtureIds.decided,57,{status:'approved'});
const scope=clone(first.scope),row=(d,independent=true)=>({proposal:clone(d.proposal),independent});
const state={authenticated:true,email,capabilities:[...caps],rows:[row(first)],detailOverrides:new Map(),loseBefore:false,attempts:new Map()};
const queue=()=>municipalAdoptionQueue({version,scope:clone(scope),total:state.rows.length,rows:clone(state.rows)});
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(value));};
const policy="default-src 'self'; connect-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; worker-src 'none'";
const html=login=>`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Adopción · prueba exclusivamente sintética</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/assets/employment-adoption-review.css"><style>*,*::before,*::after{box-sizing:border-box}body{margin:0;padding:12px;font:16px/1.5 system-ui;color:#173d4c}main{max-width:1100px;margin:auto;min-width:0}h1{font-size:22px}button,a,input,select,textarea{font:inherit}.button{display:inline-flex;align-items:center;justify-content:center;padding:10px 14px;border:1px solid #78999c;border-radius:7px;background:#fff;color:inherit;max-width:100%;text-decoration:none}.primary{background:#087e74;color:#fff}button:disabled{opacity:.6}a,button{overflow-wrap:anywhere}</style><script src="/assets/app-routes.js"></script><main><h1>Prueba de navegación con datos ficticios</h1>${login?'<p>Ingreso simulado: no autentica cuentas ni solicita credenciales.</p><button class="button" data-qa-login>Continuar con sesión ficticia</button><script>document.querySelector("[data-qa-login]").addEventListener("click",()=>location.assign(MuniControlRoutes.safeDestination(new URL(location.href).searchParams.get("next"),["internal-dashboard.html"],"internal-dashboard.html")));</script>':'<details class="adoption-review" data-adoption-review></details><button class="button" id="logoutButton">Salir de la prueba</button><script type="module">const response=await fetch("/api/internal-auth",{cache:"no-store"});const auth=await response.json();if(!auth.authenticated){location.replace(MuniControlRoutes.loginHref(location.href,location.href));}else{window.MuniControlCapabilityGate={ready:Promise.resolve({tenantCapabilities:new Set(auth.access.tenantCapabilities)})};await import("/assets/employment-adoption-review-ui.js");window.__qaMounted=true;}</script>'}</main></html>`;
const apiInFlight=new Set(),completionInFlight=new Set();
async function drain(label){
 const deadline=Date.now()+20000;
 while(apiInFlight.size||completionInFlight.size){assert.ok(Date.now()<deadline,'API did not finish before '+label);assert.deepEqual(failures,[],'API transport failure before '+label);await new Promise(r=>setTimeout(r,20));}
 assert.deepEqual(failures,[],'All requests finish '+label);transport.push({phase:label,pendingRequests:0,pendingResponses:0});
}
const apiRequests=()=>requests.filter(r=>r.path.startsWith('/api/internal-municipal-adoption'));
const reviews=()=>apiRequests().filter(r=>r.resource==='review');
const $=key=>page.locator('[data-ao-'+key+']');
async function settle(){await page.waitForFunction(()=>document.querySelector('[data-ar-operator]')?.getAttribute('aria-busy')==='false');await drain(phase);}
async function go(url,rows=[row(first)],options={}){
 await drain('before '+options.label);state.authenticated=options.authenticated??true;state.email=email;state.capabilities=options.capabilities??[...caps];state.rows=rows;state.detailOverrides=new Map(options.overrides??[]);state.loseBefore=false;state.attempts.clear();phase=options.label??url;requests.length=0;posts.length=0;
 // Each scenario gets a new document, even when its exact path/query/hash is
 // identical to the prior scenario. Chromium may treat that goto as same-document.
 await page.goto('about:blank');await page.goto(origin+url);if(state.authenticated){await page.waitForFunction(()=>window.__qaMounted===true);await settle();}else await page.locator('[data-qa-login]').waitFor();
}
async function openOrdinary(){await page.locator('[data-adoption-review] > summary').click();await $('open').click();}
async function assertPurged(label){check(!await $('detail').isVisible()&&await $('rows').locator('tr').count()===0&&await $('decision-reason').inputValue()==='',label);}
async function fill(){await $('decision').selectOption('reject');await $('decision-reason').fill('Rechazo exclusivamente sintético para comprobar la recuperación');await $('confirm').check();}
async function layout(width){
 await page.setViewportSize({width,height:1000});
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'document fits '+width);
 check(await page.locator('[data-ar-operator]').evaluate(n=>n.scrollWidth<=n.clientWidth+1),'operator fits '+width);
 for(const key of ['load','next','send'])check(await $(key).evaluate(n=>n.getBoundingClientRect().height>=44),'touch control '+key+' '+width);
 await $('decision').focus();await page.keyboard.press('Tab');check(await $('decision-reason').evaluate(n=>document.activeElement===n),'keyboard order '+width);
 check(await $('decision-reason').evaluate(n=>getComputedStyle(n).outlineStyle!=='none'),'visible focus '+width);
 await $('form').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'navigation-'+width+'.png'),fullPage:false});
}
try{
 server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',policy);
  const url=new URL(req.url,'http://loopback.invalid');requests.push({phase,method:req.method,path:url.pathname,resource:url.searchParams.get('resource'),id:url.searchParams.get('id'),key:url.searchParams.get('key')});
  try{
   if(url.pathname==='/api/internal-auth')return json(res,200,{ok:true,authenticated:state.authenticated,user:{email:state.email,name:'Persona ficticia de pruebas'},access:{tenantCapabilities:state.capabilities}});
   if(url.pathname==='/api/internal-municipal-adoption'){
    if(req.method==='GET'&&url.searchParams.get('resource')==='queue')return json(res,200,{ok:true,data:queue()});
    if(req.method==='GET'&&url.searchParams.get('resource')==='review'){
     const id=url.searchParams.get('id'),detail=state.detailOverrides.get(id)??fixtures.get(id);assert.ok(detail,'Unknown fictional review');return json(res,200,{ok:true,data:clone(detail)});
    }
    if(req.method==='GET'&&url.searchParams.get('resource')==='attempt'){
     const result=state.attempts.get(url.searchParams.get('key'));return result?json(res,200,{ok:true,data:result}):json(res,404,{ok:false,error:'Intento ficticio no encontrado.'});
    }
    if(req.method==='POST'){
     let bytes='';for await(const chunk of req)bytes+=chunk;assert.ok(bytes.length<10000);const input=JSON.parse(bytes);assert.deepEqual(Object.keys(input).sort(),['operation','payload']);assert.equal(input.operation,'command');const body=municipalAdoptionCommand(input.payload),key=req.headers['idempotency-key'];assert.ok(typeof key==='string');posts.push({key,bytes});
     if(state.loseBefore){state.loseBefore=false;return json(res,503,{ok:false,error:'Interrupción ficticia antes de guardar. Consultá el mismo intento.'});}
     const detail=fixtures.get(body.review.proposalId);assert.ok(detail);const status=body.review.decision==='approve'?'approved':'rejected',receipt={...clone(detail.proposal),operation:'review',status,decidedAt:'2026-01-03T12:00:00Z',effects:{...clone(detail.proposal.effects),contractsAdopted:status==='approved'?detail.proposal.total:0}};
     const result={version,scope:clone(scope),requestKey:key,bodySha256:await adoptionReviewHash(body),receipt};await municipalAdoptionAttempt(clone(result),{key,body});state.attempts.set(key,result);return json(res,200,{ok:true,data:result});
    }
    return json(res,400,{ok:false,error:'Unrecognized synthetic route'});
   }
   if(url.pathname.startsWith('/api/'))throw Error('Unexpected API '+url.pathname);
   if(url.pathname==='/acceso')return res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(html(true));
   if(['/personal','/internal-dashboard.html','/rrhh'].includes(url.pathname))return res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(html(false));
   if(req.method==='GET'&&url.pathname.startsWith('/assets/')){
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));assert.ok(file.startsWith(path.join(root,'assets')+path.sep)&&fs.statSync(file).isFile());assert.ok(/\.(js|css)$/.test(file));const bytes=fs.readFileSync(file);served.set(path.relative(root,file).replaceAll('\\','/'),sha(bytes));return res.writeHead(200,{'Content-Type':file.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8'}).end(bytes);
   }
   return res.writeHead(404).end();
  }catch(e){errors.push('Fixture: '+e.message);if(!res.headersSent)json(res,500,{ok:false,error:'Synthetic fixture failed'});else res.end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 ({browser,driverName}=await launchOwnSyntheticBrowser());const context=await browser.newContext({viewport:{width:1366,height:1000},locale:'es-AR',serviceWorkers:'block'});page=await context.newPage();page.setDefaultTimeout(30000);
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).origin!==origin)unexpected.push(r.url());if(new URL(r.url()).pathname.startsWith('/api/'))apiInFlight.add(r);});
 page.on('requestfinished',r=>apiInFlight.delete(r));page.on('requestfailed',r=>{apiInFlight.delete(r);failures.push({phase,url:r.url(),failure:r.failure()});});
 page.on('response',r=>{if(!new URL(r.url()).pathname.startsWith('/api/'))return;const completion=r.finished().then(error=>{if(error)failures.push({phase,url:r.url(),responseFinished:error.message});}).finally(()=>completionInFlight.delete(completion));completionInFlight.add(completion);});

 await go('/personal#legajos',[row(first)],{label:'ordinary'});
 check(apiRequests().length===0,'ordinary page does not auto-load adoption data');await openOrdinary();await settle();check(apiRequests().length===0,'ordinary panel opening still requires explicit consultation');
 await $('load').click();await settle();check(apiRequests().length===1&&reviews().length===0&&posts.length===0,'ordinary explicit consultation only reads queue');

 await go(pendingHref,[row(first)],{label:'untrusted',capabilities:[]});
 check(apiRequests().length===0&&!await $('detail').isVisible()&&posts.length===0,'navigation without capabilities does not consult or decide');
 for(const invalid of ['/personal?adopcion=invalid#legajos','/personal?adopcion=pendientes&adopcion=pendientes#legajos','/personal?adopcion=pendientes&contractId='+reviewId(92100)+'#legajos']){
  await go(invalid,[row(first)],{label:'invalid-url'});check(apiRequests().length===0&&!await $('detail').isVisible()&&posts.length===0,'invalid or ambiguous URL does not consult: '+invalid);
 }

 await go(pendingHref,[row(own,false),row(decided),row(first)],{label:'unique-pending'});
 await $('detail').waitFor({state:'visible'});await settle();check(reviews().length===1&&reviews()[0].id===fixtureIds.first,'one independent pending proposal opens exactly that trusted id');check(await page.locator('[data-adoption-review]').evaluate(n=>n.open)&&await $('panel').isVisible(),'direct navigation opens both review panels');
 check(page.url()===origin+href(fixtureIds.first),'unique pending route becomes its exact verified proposal URL');
 check((await $('counts').innerText()).includes('855 contratos completos')&&await $('rows').locator('tr').count()===25,'all 855 contracts are retained behind pagination');
 check(await page.locator('[data-ar-operator]').evaluate(n=>n.contains(document.activeElement)),'direct navigation transfers focus into review operator');
 check(await $('decision').inputValue()===''&&!await $('confirm').isChecked()&&await $('send').isDisabled()&&posts.length===0,'opening review never chooses or sends a decision');
 await $('search').fill('PERSONA SINTÉTICA 855');check(await $('rows').locator('tr').count()===1&&(await $('counts').innerText()).includes('855 contratos completos'),'visual search never reduces decision scope');await $('search').fill('');
 for(const width of [1366,390,320])await layout(width);await page.setViewportSize({width:1366,height:1000});

 await go(pendingHref,[row(first),row(second)],{label:'ambiguous-pending'});await settle();
 check(reviews().length===0&&!await $('detail').isVisible()&&await $('queue').locator('li').count()===2,'two independent proposals of 855 are listed without silent selection');
 const links=await $('queue').locator('[data-ao-link]').evaluateAll(ns=>ns.map(n=>n.getAttribute('href')));check(links.includes(href(fixtureIds.first))&&links.includes(href(fixtureIds.second)),'ambiguous proposals expose exact shareable ids');

 await go(href(fixtureIds.second),[row(first),row(second)],{label:'exact-id'});await $('detail').waitFor({state:'visible'});await settle();check(reviews().length===1&&reviews()[0].id===fixtureIds.second,'direct UUID selects second proposal independently of count and order');
 await go(href(fixtureIds.absent),[row(first),row(second)],{label:'missing-id'});await settle();check(reviews().length===0&&!await $('detail').isVisible()&&posts.length===0,'unknown id cannot fall back to a proposal with matching count');
 await go(href(fixtureIds.decided),[row(decided)],{label:'decided'});await $('detail').waitFor({state:'visible'});await settle();check(!await $('form').isVisible()&&posts.length===0&&(await $('summary').innerText()).includes('Decisión registrada'),'decided proposal opens conserved read-only evidence without a new decision');

 await go(href(fixtureIds.own),[row(own,false)],{label:'own-proposal'});await settle();check(reviews().length===0&&!await $('detail').isVisible()&&posts.length===0,'own proposal cannot load independent review or POST');check(await page.locator(`[data-ao-proposal="${fixtureIds.own}"]`).isDisabled()&&!await $('form').isVisible(),'own proposal decision controls remain unavailable');check(!/autor|preparad[oa] por|creator@example|Noelia|Marcelo/.test(await $('queue').innerText()),'own copy does not invent author identity');

 const foreign=clone(first);foreign.scope.membershipId=reviewId(92001);
 await go(href(fixtureIds.first),[row(first)],{label:'cross-scope',overrides:[[fixtureIds.first,foreign]]});await settle();await assertPurged('cross-scope review removes all visible detail');check(posts.length===0,'cross-scope response sends no decision');

 const stale=clone(first);stale.current=false;
 await go(href(fixtureIds.first),[row(first)],{label:'stale',overrides:[[fixtureIds.first,stale]]});await $('detail').waitFor({state:'visible'});await settle();check(await $('decision').locator('option[value="approve"]').evaluate(n=>n.disabled),'stale review disables approval');await $('decision').evaluate(n=>{n.value='approve';n.dispatchEvent(new Event('input',{bubbles:true}));});await $('confirm').check();check(await $('send').isDisabled()&&posts.length===0,'forcing stale approval still cannot send');

 await go(href(fixtureIds.first),[row(first)],{label:'changed-before-send'});await $('detail').waitFor({state:'visible'});await settle();await fill();const changed=clone(first);changed.reviewVersion='f'.repeat(64);state.detailOverrides.set(fixtureIds.first,changed);await $('send').click();await settle();check(posts.length===0&&!await $('confirm').isChecked()&&await $('send').isDisabled(),'fresh review drift withdraws confirmation before POST');

 await go(href(fixtureIds.first),[row(first)],{label:'account-changed'});await $('detail').waitFor({state:'visible'});await settle();await fill();state.email='another-reviewer@example.invalid';await $('send').click();await settle();await assertPurged('changed account purges the prior review');check(posts.length===0,'changed account sends no command under prior actor');
 await go(href(fixtureIds.first),[row(first)],{label:'hide-and-revoke'});await $('detail').waitFor({state:'visible'});await settle();await fill();await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await assertPurged('hidden page purges rows and editable decision');check(posts.length===0,'hiding never sends a decision');await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await settle();check(reviews().length===1,'showing page does not automatically reload withdrawn review');
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:new Set()}})));await settle();check(await $('open').isDisabled()&&posts.length===0,'revocation disables further review and never sends');

 await go(href(fixtureIds.first),[row(first)],{label:'pending-recovery'});await $('detail').waitFor({state:'visible'});await settle();await fill();state.loseBefore=true;await $('send').click();await settle();check(posts.length===1&&await $('pending').isVisible()&&await $('send').isDisabled(),'uncertain acknowledgement retains original pending command');const original=clone(posts[0]);
 const pendingReads=reviews().length;await page.evaluate(url=>{history.replaceState(null,'',url);dispatchEvent(new PopStateEvent('popstate'));},href(fixtureIds.second));await settle();check(posts.length===1&&reviews().length===pendingReads&&await $('load').isDisabled(),'new URL while pending does not consume another proposal or replace the attempt');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await assertPurged('pending hidden page clears visible private details');await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await settle();check(posts.length===1&&await $('pending').isVisible()&&await $('recover').isEnabled(),'show restores explicit recovery without POST replay');
 await $('recover').click();await settle();check(posts.length===1&&await $('retry').isEnabled(),'not-found recovery permits only explicit same retry');await $('retry').click();await settle();check(posts.length===2&&posts[1].key===original.key&&posts[1].bytes===original.bytes,'retry preserves exact frozen key and bytes');check((await $('status').innerText()).includes('Rechazo confirmado')&&!await $('pending').isVisible(),'authentic recovered receipt closes pending decision');
 check(await page.evaluate(()=>!Object.keys(localStorage).some(k=>/adop/i.test(k))&&!Object.keys(sessionStorage).some(k=>/adop/i.test(k))),'review and pending command are not persisted to browser storage');

 await go(href(fixtureIds.second),[row(first),row(second)],{label:'simulated-login-return',authenticated:false});check(new URL(page.url()).pathname==='/acceso'&&new URL(page.url()).searchParams.get('next')===href(fixtureIds.second),'sessionless link preserves exact destination through real loginHref');check(apiRequests().length===0&&posts.length===0,'sessionless transition reads no adoption queue');state.authenticated=true;await page.locator('[data-qa-login]').click();await page.waitForFunction(()=>window.__qaMounted===true);await $('detail').waitFor({state:'visible'});await settle();check(page.url()===origin+href(fixtureIds.second)&&reviews().length===1&&reviews()[0].id===fixtureIds.second&&posts.length===0,'simulated successful login uses real safeDestination and returns to exact proposal without mutation');

 await drain('final');check(errors.length===0&&unexpected.length===0&&failures.length===0,'no browser exceptions, external traffic or failed requests');
 for(const[file,digest]of served)assert.equal(sha(fs.readFileSync(path.join(root,file))),digest,'Frontend changed during QA: '+file);
 const report={passed:true,checks:checks.length,assertions:checks,synthetic:true,actualFrontend:true,loopbackHttp:true,apiFixture:true,actualSql:false,authenticationTransitionSimulated:true,realAccountSessionTested:false,productionWrites:false,productionConnections:false,browser:{driverName,version:browser.version()},viewports:[1366,390,320],fixtures:{completeContracts:855,ambiguousCompleteProposals:2},assets:Object.fromEntries([...served].sort()),verifierSha256:sha(fs.readFileSync(new URL(import.meta.url))),transport,errors,unexpectedRequests:unexpected,requestFailures:failures};
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify({passed:true,checks:checks.length,synthetic:true,actualSql:false,productionConnections:false,output}));
}catch(e){fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({message:e.message,phase,checks,requests,posts:posts.map(p=>({key:p.key,bodySha256:sha(p.bytes)})),errors,unexpected,failures,transport},null,2),{flag:'wx'});if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});throw e;}
finally{await browser?.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}}
