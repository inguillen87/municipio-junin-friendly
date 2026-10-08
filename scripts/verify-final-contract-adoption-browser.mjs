// Built UI, real HTTP handlers, fictional source/receipt adapter; no municipal API.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {createEmploymentAdoptionHandler} from '../api/internal-employment-adoption.js';import {createInternalDataHandler} from '../api/internal-data.js';import {ADOPTION_REVIEW_SQL} from '../lib/internal-employment-adoption-review.js';
import {finalAdoptionRaw,finalAdoptionSource} from '../tests/fixtures/final-contract-adoption-synthetic.js';import {reviewRaw} from '../tests/fixtures/employment-adoption-review-synthetic.js';import {principal,session,catalogVersion,preparationEnvelope} from '../tests/fixtures/employment-adoption-preparation-synthetic.js';
assert.equal(process.argv.length,3);assert.match(process.argv[2],/^--output-prefix=verification\/[a-zA-Z0-9_-]+$/);const prefix=process.argv[2].slice(16),out=s=>{const name=prefix+'-'+s;assert.ok(!fs.existsSync(name));return name;};
const origin='https://municontrol.test',root=path.resolve('public'),checks=[],errors=[],posts=[],queries=[],saved=new Map();let caps=['workforce.employee.read','employee.record.propose'],available=true,observation=true,lose=false,adopted=false;
const finalRaw=()=>{const r=finalAdoptionRaw();if(observation)r.rows[56].sourceIssues=['PERSON_FACTS_CHANGED'];return r;};
const currentPrincipal=()=>({...principal,tenant:{...principal.tenant,effectiveCapabilities:caps}});
const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;}});
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:process.env.CLOCK_BROWSER_CHANNEL?{channel:process.env.CLOCK_BROWSER_CHANNEL}:{})});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1050},serviceWorkers:'block',acceptDownloads:true}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();
  if(url.pathname.startsWith('/api/')){
   if(url.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,user:{email:session.email,name:'Operador sintético QA',role:'ADMIN_INTERNO'},access:{tenantCapabilities:caps,platformCapabilities:[],platformRoles:[]}}});
   const query=Object.fromEntries(url.searchParams),res=response(),access=async()=>({mode:'managed',principal:currentPrincipal()});
   if(url.pathname==='/api/internal-employment-adoption'){
    const post=req.method()==='POST',bytes=post?req.postData():null,key=req.headers()['idempotency-key'];if(post)posts.push({key,bytes});
    const handler=createEmploymentAdoptionHandler({env:{INTERNAL_APP_ORIGIN:origin},requireAccess:access,sessionFor:()=>session,getSql:async()=>({query:async(sql,args)=>{
     queries.push(sql);
     if(sql.includes('final_available')){const raw=finalRaw();return[{result:{version:'employment-adoption-final-sources.v1',scope:raw.scope,total:available?1:0,rows:available?[{revisionId:finalAdoptionSource.revisionId,packageSha256:finalAdoptionSource.packageSha256,cutoff:finalAdoptionSource.cutoff}]:[]}}];}
     if(sql.includes('bootstrap')){
      const final=sql.includes('final_bootstrap');if(final){assert.equal(adopted,false,'completed attempts must not rebuild the imported final cohort');assert.deepEqual(args.slice(1),[finalAdoptionSource.revisionId,finalAdoptionSource.packageSha256]);}
      return[{result:{version:final?'employment-adoption-preparation.v3':'employment-adoption-preparation.v2',rawReview:final?finalRaw():reviewRaw(adopted?0:57),catalogVersion,canPrepare:caps.includes('employee.record.propose'),applicationAvailable:false,attempts:[...saved.values()].map(a=>({...a,receipt:{...a.receipt,replayed:true}}))}}];
     }
     if(sql.includes('attempt')){const a=saved.get(args[1]);if(!a)throw Error('EMPLOYMENT_ADOPTION_NOT_FOUND');return[{result:{...a,receipt:{...a.receipt,replayed:true}}}];}
     assert.ok(sql.includes('propose'));const body=JSON.parse(args[1]);assert.equal(body.version,'employment-adoption-input.v3');assert.equal(body.rows.length,57);assert.equal(body.finalSource.packageSha256,finalAdoptionSource.packageSha256);
     const prior=saved.get(args[2]);if(prior)return[{result:{...prior,receipt:{...prior.receipt,replayed:true}}}];const a=await preparationEnvelope(body,args[2]);saved.set(args[2],a);return[{result:a}];
    }})});
    await handler({method:req.method(),url:url.pathname+url.search,query,headers:req.headers(),body:bytes},res);
    if(post&&lose){lose=false;adopted=true;return route.abort('connectionfailed');}return route.fulfill({status:res.code,json:res.body,headers:res.headers});
   }
   assert.equal(req.method(),'GET','only the explicit adoption preparation may write in this synthetic browser');
   if(query.resource==='employmentadoptionreview'){
    const handler=createInternalDataHandler({env:{},requireCompatibleInternalAccess:access,actionMutationSession:()=>session,getInternalSql:async()=>({query:async sql=>{assert.equal(sql,ADOPTION_REVIEW_SQL);return[{result:reviewRaw(adopted?0:57)}];}})});await handler({method:'GET',query},res);return route.fulfill({status:res.code,json:res.body,headers:res.headers});
   }
   return route.fulfill({json:{ok:true,data:[],pagination:{page:1,limit:25,total:0,pages:1},facets:{}}});
  }
  const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream'});
 });
 await page.goto(origin+'/internal-dashboard.html#legajos');const panel=page.locator('[data-adoption-review]');await panel.locator(':scope > summary').click();
 const ready=()=>page.waitForFunction(()=>!document.querySelector('[data-ar-consult]').disabled),apReady=()=>page.waitForFunction(()=>document.querySelector('[data-ar-preparation]').getAttribute('aria-busy')==='false');
 await ready();assert.equal(queries.length,0);assert.equal(posts.length,0);checks.push('opening the panel does not read the final source or write a proposal');
 await panel.locator('[data-ar-cuts-panel] > summary').click();available=false;await panel.locator('[data-ar-cuts]').click();await ready();assert.equal(await panel.locator('[data-ar-cut-options] button').count(),0);assert.match(await panel.locator('[data-ar-status]').innerText(),/No hay respaldos finales/);checks.push('no final source reports zero without inventing a revision or employee errors');
 available=true;await panel.locator('[data-ar-cuts]').click();await ready();assert.equal(queries.filter(q=>q.includes('final_bootstrap')).length,0);const choose=async()=>{await panel.locator('[data-ar-cut-options] button').click();await ready();};await choose();
 assert.match(await panel.locator('[data-ar-source]').innerText(),/2026-10-01.*Antecedentes instalados/);assert.equal(await panel.locator('[data-ar-rows] details').count(),25);await panel.locator('[data-ar-rows] details').first().locator('summary').click();assert.match(await panel.locator('[data-ar-rows] details').first().innerText(),/2010-01-01 → 2012-02-03/);checks.push('explicit cut selection shows parent and final dates with verified before and proposed facts');
 await panel.locator('[data-ar-next]').first().click();await panel.locator('[data-ar-next]').last().click();assert.equal(await panel.locator('[data-ar-rows] tr').count(),7);await panel.locator('[data-ar-search]').fill('001');
 const event=page.waitForEvent('download');await panel.locator('[data-ar-download]').click();const download=await event;const csv=fs.readFileSync(await download.path(),'utf8');assert.match(csv,/"57";/);for(const row of finalRaw().rows)for(const value of [row.contractId,row.legajo,row.name])if(value)assert.ok(!csv.includes(value),'CSV must omit nominal values');assert.doesNotMatch(csv,/2012-02-03|PERSON_FACTS_CHANGED/);await download.saveAs(out('observations.csv'));checks.push('three-page search never truncates the complete non nominal CSV');
 await panel.locator('[data-ap-open]').click();await panel.locator('[data-ap-load]').click();await apReady();await panel.locator('[data-ap-reference]').fill('Documento exclusivamente sintético QA');await panel.locator('[data-ap-reason]').fill('Revisión del corte completo exclusivamente sintético');await panel.locator('[data-ap-confirm]').check();await panel.locator('[data-ap-send]').click();await apReady();assert.equal(posts.length,0);assert.match(await panel.locator('[data-ap-status]').innerText(),/incidencias pendientes/);checks.push('an unresolved final incidence blocks the whole proposal without a partial write');
 observation=false;await choose();await panel.locator('[data-ap-load]').click();await apReady();await panel.locator('[data-ap-reference]').fill('Documento exclusivamente sintético QA');await panel.locator('[data-ap-reason]').fill('Revisión del corte completo exclusivamente sintético');
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:1050});assert.ok(await panel.evaluate(n=>n.scrollWidth<=n.clientWidth+1));assert.ok(await panel.locator('[data-ap-send]').evaluate(n=>n.getBoundingClientRect().height>=44));await panel.locator('[data-ar-source]').scrollIntoViewIfNeeded();await page.screenshot({path:out(width+'.png')});}checks.push('final review and preparation fit 1440/390/320px with accessible voluntary controls');
 await panel.locator('[data-ap-confirm]').check();lose=true;await panel.locator('[data-ap-send]').click();await apReady();assert.equal(posts.length,1);assert.ok(await panel.locator('[data-ap-pending]').isVisible());const sent=structuredClone(posts[0]),sourceReads=queries.filter(q=>q.includes('final_bootstrap')).length;
 await panel.locator('[data-ap-recover]').click();await apReady();assert.match(await panel.locator('[data-ap-status]').innerText(),/Propuesta completa guardada: 57/);assert.equal(posts.length,1);assert.deepEqual(posts[0],sent);assert.equal(queries.filter(q=>q.includes('final_bootstrap')).length,sourceReads);checks.push('lost acknowledgement after independent adoption recovers the original body/key by GET without rebuilding the final cohort or resending');
 adopted=false;await choose();await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});assert.equal(await panel.locator('[data-ar-rows] tr').count(),0);assert.equal(await panel.locator('[data-ar-cut-options] button').count(),0);checks.push('hiding withdraws the whole final review and its source selection');
 await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});caps=[];await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:new Set()}})));assert.ok(await panel.locator('[data-ar-cuts]').isDisabled());assert.equal(await panel.locator('[data-ar-result]').isVisible(),false);assert.equal(posts.length,1);checks.push('revocation disables both sources and final actions without a new write');
 assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>Object.keys(localStorage).length),0);checks.push('no browser exceptions or localStorage persistence');
 fs.writeFileSync(out('result.json'),JSON.stringify({version:'final-contract-adoption-browser.v1',checksPassed:checks.length,checks,syntheticOnly:true,sqlAdapter:'fictional; durable SQL tested separately',productionWrites:0},null,2),{flag:'wx'});
 console.log(JSON.stringify({checksPassed:checks.length,syntheticOnly:true}));
}finally{await browser.close();}
