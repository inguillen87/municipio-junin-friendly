// Built UI, real HTTP handlers, fictional source/receipt adapter; no municipal API.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {createEmploymentAdoptionHandler} from '../api/internal-employment-adoption.js';import {createInternalDataHandler} from '../api/internal-data.js';import {ADOPTION_REVIEW_SQL} from '../lib/internal-employment-adoption-review.js';
import {registryPendingRaw} from '../tests/fixtures/registry-original-facts-synthetic.js';
import {finalAdoptionRaw,finalAdoptionSource} from '../tests/fixtures/final-contract-adoption-synthetic.js';import {reviewRaw} from '../tests/fixtures/employment-adoption-review-synthetic.js';import {principal,session,catalogVersion,preparationEnvelope} from '../tests/fixtures/employment-adoption-preparation-synthetic.js';
assert.equal(process.argv.length,3);const active=true;const count=active?869:57;assert.match(process.argv[2],/^--output-prefix=verification\/[a-zA-Z0-9_-]+$/);const prefix=process.argv[2].slice(16),out=s=>{const name=prefix+'-'+s;assert.ok(!fs.existsSync(name));return name;};
const origin='https://municontrol.test',root=path.resolve('public'),checks=[],errors=[],posts=[],queries=[],saved=new Map(),previews=[];let caps=['workforce.employee.read','employee.record.propose'],available=true,observation=true,lose=false,adopted=false;
const finalRaw=()=>registryPendingRaw();
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
    const post=req.method()==='POST',bytes=post?req.postData():null,key=req.headers()['idempotency-key'];if(post)(key?posts:previews).push({key,bytes});
    const handler=createEmploymentAdoptionHandler({env:{INTERNAL_APP_ORIGIN:origin},requireAccess:access,sessionFor:()=>session,getSql:async()=>({query:async(sql,args)=>{
     queries.push(sql);
     if(sql.includes('final_available')){const raw=finalRaw();return[{result:{version:'employment-adoption-final-sources.v1',scope:raw.scope,total:available?1:0,rows:available?[{revisionId:finalAdoptionSource.revisionId,packageSha256:finalAdoptionSource.packageSha256,cutoff:finalAdoptionSource.cutoff}]:[]}}];}
     if(sql.includes('declared_bootstrap')){
      assert.equal(args.length,6);assert.equal(args[1],finalAdoptionSource.revisionId);assert.equal(args[2],finalAdoptionSource.packageSha256);const declared=JSON.parse(args[5]),raw=finalRaw();assert.equal(declared.length,1);assert.equal(declared[0].contractId,raw.rows.at(-1).contractId);Object.assign(raw.rows.at(-1),declared[0].values,{sourceIssues:[]});raw.source.municipalDeclarations={version:'municipal-source-declarations.v1',rows:declared};return[{result:{version:'employment-adoption-preparation.v5',rawReview:raw,catalogVersion,canPrepare:true,applicationAvailable:false,attempts:[...saved.values()]}}];
     }
     if(sql.includes('bootstrap')){
      const registry=/registry_bootstrap/.test(sql),final=/(?:final|active|registry)_bootstrap/.test(sql);if(final){assert.equal(adopted,false,'completed attempts must not rebuild the imported final cohort');assert.deepEqual(args.slice(1),[finalAdoptionSource.revisionId,finalAdoptionSource.packageSha256]);}
      return[{result:{version:registry?'employment-adoption-preparation.v6':final?(active?'employment-adoption-preparation.v4':'employment-adoption-preparation.v3'):'employment-adoption-preparation.v2',rawReview:final?finalRaw():reviewRaw(adopted?0:57),catalogVersion,canPrepare:caps.includes('employee.record.propose'),applicationAvailable:false,attempts:[...saved.values()].map(a=>({...a,receipt:{...a.receipt,replayed:true}}))}}];
     }
     if(sql.includes('attempt')){const a=saved.get(args[1]);if(!a)throw Error('EMPLOYMENT_ADOPTION_NOT_FOUND');return[{result:{...a,receipt:{...a.receipt,replayed:true}}}];}
     assert.ok(sql.includes('propose'));const body=JSON.parse(args[1]);assert.equal(body.version,'employment-adoption-input.v6');assert.equal(body.sourceFactsPolicy,'preserve-original-pending.v1');assert.equal(body.rows.length,869);assert.equal(body.rows[0].jurisdictionCode,null);assert.ok(!body.declarations);assert.equal(body.finalSource.packageSha256,finalAdoptionSource.packageSha256);
     const prior=saved.get(args[2]);if(prior)return[{result:{...prior,receipt:{...prior.receipt,replayed:true}}}];const a=await preparationEnvelope(body,args[2]);saved.set(args[2],a);return[{result:a}];
    }})});
    await handler({method:req.method(),url:url.pathname+url.search,query,headers:req.headers(),body:bytes},res);
    if(post&&key&&lose){lose=false;adopted=true;return route.abort('connectionfailed');}return route.fulfill({status:res.code,json:res.body,headers:res.headers});
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
 await ready();assert.equal(queries.length,0);assert.equal(posts.length,0);
 await panel.locator('[data-ar-cuts-panel] > summary').click();await panel.locator('[data-ar-cuts]').click();await ready();
 const choose=async()=>{await panel.locator('[data-ar-cut-options] > button').click();await ready();};await choose();
 assert.match(await panel.locator('[data-ar-counts]').innerText(),/869 contratos activos.*1583 inactivos.*2452 contratos/);
 while(await panel.locator('[data-ar-next]').first().isEnabled())await panel.locator('[data-ar-next]').first().click();assert.equal(await panel.locator('[data-ar-rows] tr').count(),19);
 await panel.locator('[data-ar-search]').fill('001');
 const event=page.waitForEvent('download');await panel.locator('[data-ar-download]').click();const download=await event,csv=fs.readFileSync(await download.path(),'utf8');
 for(const row of finalRaw().rows)for(const value of [row.contractId,row.legajo,row.name])if(value)assert.ok(!csv.includes(value));await download.saveAs(out('observations.csv'));checks.push('35 pages and filtering preserve the full original non nominal observations report');
 await panel.locator('[data-ap-open]').click();await panel.locator('[data-ap-load]').click();await apReady();assert.equal(await panel.locator('[data-ap-fact]').count(),14);assert.ok(await panel.locator('[data-ap-send]').isDisabled());assert.equal(posts.length,0);
 await panel.locator('[data-ap-fact]').first().locator('summary').click();await panel.locator('[data-ap-fact-field="reference"]').first().fill('Antecedente municipal ficticio que debe conservarse');
 await panel.locator('[data-ap-policy]').selectOption('original');await apReady();assert.equal(await panel.locator('[data-ap-policy]').inputValue(),'complete');assert.equal(await panel.locator('[data-ap-fact-field="reference"]').first().inputValue(),'Antecedente municipal ficticio que debe conservarse');assert.equal(posts.length,0);checks.push('changing treatment never discards entered declarations or starts a save');
 await panel.locator('[data-ap-open]').click();await panel.locator('[data-ap-open]').click();await panel.locator('[data-ap-load]').click();await apReady();
 await panel.locator('[data-ap-policy]').selectOption('original');await apReady();assert.ok(queries.some(s=>s.includes('registry_bootstrap')));assert.equal(posts.length,0);assert.equal(previews.length,0);assert.ok(await panel.locator('[data-ap-facts]').isHidden());assert.ok(await panel.locator('[data-ap-jurisdiction]').isHidden());
 assert.match(await panel.locator('[data-ap-original-status]').innerText(),/869 activos.*14 contratos.*14 fechas de ingreso, 2 encuadres y 1 jurisdicciones.*superponen.*no autoriza calcular/);assert.equal(await panel.locator('[data-ap-facts] :required:enabled').count(),0);checks.push('voluntary original-facts review displays overlapping pending quantities and disables manual inputs without inventing a salary input');
 await panel.locator('[data-ap-reference]').fill('Respaldo completo exclusivamente sintético');await panel.locator('[data-ap-reason]').fill('Registro original completo exclusivamente sintético');await panel.locator('[data-ap-confirm]').check();assert.ok(await panel.locator('[data-ap-send]').isDisabled());await panel.locator('[data-ap-original-ack]').check();assert.ok(await panel.locator('[data-ap-send]').isEnabled());checks.push('saving requires explicit acknowledgement of original missing facts and the complete review');
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:1050});assert.ok(await panel.evaluate(n=>n.scrollWidth<=n.clientWidth+1));assert.ok(await panel.locator('[data-ap-send]').evaluate(n=>n.getBoundingClientRect().height>=44));await panel.locator('[data-ap-original-status]').scrollIntoViewIfNeeded();await page.screenshot({path:out(width+'.png')});}checks.push('original-facts controls fit desktop and mobile with accessible labels and touch targets');
 lose=true;await panel.locator('[data-ap-send]').click();await apReady();assert.equal(posts.length,1);assert.ok(await panel.locator('[data-ap-pending]').isVisible());const sent=structuredClone(posts[0]),reads=queries.filter(q=>/(?:final|active|registry)_bootstrap/.test(q)).length;
 await panel.locator('[data-ap-recover]').click();await apReady();assert.match(await panel.locator('[data-ap-status]').innerText(),/Propuesta completa guardada: 869/);assert.equal(posts.length,1);assert.deepEqual(posts[0],sent);assert.equal(queries.filter(q=>/(?:final|active|registry)_bootstrap/.test(q)).length,reads);checks.push('lost acknowledgement recovers the original v6 body and key without a new save or rebuilding the cohort');
 adopted=false;await choose();await panel.locator('[data-ap-load]').click();await apReady();await panel.locator('[data-ap-policy]').selectOption('original');await apReady();await panel.locator('[data-ap-original-ack]').check();
 caps=['workforce.employee.read'];await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:new Set(['workforce.employee.read'])}})));assert.equal(await panel.locator('[data-ap-original-ack]').isChecked(),false);assert.ok(await panel.locator('[data-ap-form]').isHidden());assert.equal(posts.length,1);checks.push('prepare permission revocation withdraws original-facts acknowledgement without a write');
 caps=['workforce.employee.read','employee.record.propose'];await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:new Set(['workforce.employee.read','employee.record.propose'])}})));await panel.locator('[data-ap-load]').click();await apReady();await panel.locator('[data-ap-policy]').selectOption('original');await apReady();await panel.locator('[data-ap-original-ack]').check();
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});assert.equal(await panel.locator('[data-ap-original-ack]').isChecked(),false);assert.equal(await panel.locator('[data-ar-rows] tr').count(),0);assert.ok(await panel.locator('[data-ap-form]').isHidden());checks.push('hiding the page invalidates the complete review and the original-facts acknowledgement');
 assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>Object.keys(localStorage).length),0);checks.push('no browser exception, external API, localStorage persistence or production write');
 fs.writeFileSync(out('result.json'),JSON.stringify({version:'registry-original-facts-browser.v1',syntheticContracts:869,checksPassed:checks.length,checks,syntheticOnly:true,sqlAdapter:'fictional; durable SQL tested separately',productionWrites:0},null,2),{flag:'wx'});console.log(JSON.stringify({checksPassed:checks.length,syntheticOnly:true}));
}catch(e){fs.writeFileSync(out('failure.json'),JSON.stringify({errors,message:e.message,syntheticOnly:true},null,2),{flag:'wx'});throw e;}finally{await browser.close();}
