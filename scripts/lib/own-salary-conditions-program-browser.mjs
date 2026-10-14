// Built programme editor, actual handlers and disposable loopback SQL only.
// Authentication and all employees are synthetic; no external requests.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {launchOwnSyntheticBrowser} from './own-synthetic-browser.mjs';

export async function verifyConditionsProgramBrowser({handlers,env,actors,setActor,bootstrap,output,check,revoke,restore,diagnoseProgram,revokedRead}){
 const root=fs.realpathSync(new URL('../../public',import.meta.url)),origin='http://127.0.0.1:4371',oldOrigin=env.INTERNAL_APP_ORIGIN;
 const errors=[],writes=[],reads=[],caps=['workforce.employee.read','payroll.parameter.read','payroll.parameter.prepare','payroll.parameter.approve'];
 let current=actors.maker,allowed=true,lose=false,page,initial=null,browser;
 const actor=a=>{current=a;setActor(a);};actor(current);env.INTERNAL_APP_ORIGIN=origin;
 let driverName;
 try{
  ({browser,driverName}=await launchOwnSyntheticBrowser());
  const context=await browser.newContext({viewport:{width:1440,height:1100},locale:'es-AR',serviceWorkers:'block'});
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.abort();
   if(u.pathname==='/api/internal-own-payroll-program'){
    let status=200,payload;const headers={};
    await handlers.program({method:req.method(),url:u.pathname+u.search,query:Object.fromEntries(u.searchParams),headers:req.headers(),body:req.postData()},
     {setHeader(k,v){headers[k]=String(v);},status(n){status=n;return this;},json(v){payload=v;return this;}});
    if(req.method()==='POST'){
     writes.push({status,key:req.headers()['idempotency-key'],body:JSON.parse(req.postData()).payload,...(payload?.data?{receipt:payload.data}:{error:payload})});
     if(lose&&payload?.ok){lose=false;return route.fulfill({status:503,json:{ok:false,error:'Acuse sintético interrumpido después del guardado.'}});}
    }else reads.push({resource:u.searchParams.get('resource'),status});
    return route.fulfill({status,headers,json:payload});
   }
   if(u.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,sessionVersion:2,
    user:{id:current.actorSessionId,email:current.actorEmail},access:{context:'tenant',tenant:{id:current.tenantId,roleKey:'QA'},tenantCapabilities:allowed?caps:[],platformCapabilities:[],platformRoles:[]},expiresAt:new Date(Date.now()+3600000).toISOString()}});
   if(u.pathname==='/qa.html')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Programa sintético de condiciones QA</title><style>body{margin:16px;font-family:system-ui}main{max-width:960px;margin:auto;min-width:0}</style><main id="qa"></main><script type="module">import {mountOwnPayrollProgram} from "/assets/own-payroll-program-panel.js";mountOwnPayrollProgram(document.getElementById("qa"));document.dispatchEvent(new CustomEvent("taskchange",{detail:{id:"reglas"}}));</script></html>'});
   if(u.pathname.startsWith('/api/'))return route.fulfill({status:403,json:{ok:false,error:'API ajena al caso sintético.'}});
   const file=path.resolve(root,'.'+u.pathname);
   if(req.method()!=='GET'||!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
   return route.fulfill({contentType:{'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]??'application/octet-stream',body:fs.readFileSync(file)});
  });
  page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  const $=key=>page.locator('[data-program-'+key+']'),field=key=>page.locator('[data-program-field="'+key+'"]');
  const idle=()=>page.waitForFunction(()=>document.querySelector('.own-program')?.getAttribute('aria-busy')==='false');
  const fresh=async()=>{await page.goto(origin+'/qa.html');await $('content').waitFor({state:'visible'});await idle();};
  initial=await bootstrap();const definition=initial.program.definition;
  const ruleIndex=definition.rules.findIndex(r=>r.code==='9874'),bindingIndex=definition.bindings.findIndex(b=>b.key==='qaUnhealthy');
  assert.ok(ruleIndex>=0&&bindingIndex>=0);await fresh();assert.equal(writes.length,0);
  assert.ok(await $('conditions').isChecked());assert.ok(await $('conditions').isDisabled());
  await $('rule-select').selectOption(String(ruleIndex));
  const title='expression-then-then-condition',unhealthy='expression-then-then-then-condition';
  assert.equal(await field(title+'-value').inputValue(),'0056');assert.equal(await field(unhealthy+'-value').inputValue(),'false');
  await field(title+'-value').fill('056');await field(title+'-value').fill('0056');
  await field(unhealthy+'-type').selectOption('code');await field(unhealthy+'-type').selectOption('boolean');
  assert.equal(await field(unhealthy+'-value').inputValue(),'');await field(unhealthy+'-value').selectOption('false');
  await $('binding-select').selectOption(String(bindingIndex));await field('binding-condition').selectOption('titleCode');
  assert.equal(await field('binding-unit').inputValue(),'code');await field('binding-condition').selectOption('unhealthyWork');
  assert.equal(await field('binding-unit').inputValue(),'boolean');assert.equal(await field('binding-missing').inputValue(),'error');
  check(true,'built typed editor preserves0056 and explicit false; changing a condition never invents a value or numeric unit');
  for(const width of[1440,390,320]){
   await page.setViewportSize({width,height:1000});assert.equal(await $('conditions').isChecked(),true);
   check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'typed programme editor fits '+width+'px');
   check(await $('prepare').evaluate(e=>e.getBoundingClientRect().height>=44),'typed programme review has a44px target at '+width+'px');
   await field('binding-condition').focus();assert.ok(await field('binding-condition').evaluate(e=>document.activeElement===e));
   await field('binding-condition').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,'conditions-program-'+width+'.png')});
  }
  await $('reason').fill('Programa completo exclusivamente sintético revisado en navegador QA');await $('prepare').click();await idle();
  assert.ok(await $('send-box').isHidden());assert.ok((await $('status').innerText()).includes('igual al aprobado'));assert.equal(writes.length,0);
  check(true,'unchanged complete programme is explained before creating a request or calling the write API');
  const expectedDefinition=structuredClone(definition);expectedDefinition.rules[ruleIndex].ruleReference='Respaldo exclusivamente sintético QA revisado en navegador';
  await field('ruleReference').fill(expectedDefinition.rules[ruleIndex].ruleReference);await $('prepare').click();await idle();
  await $('send-box').waitFor({state:'visible'});assert.equal(writes.length,0);await $('confirm').check();lose=true;await $('send').click();await idle();
  assert.equal(writes.length,1);assert.deepEqual(writes[0].body.program,expectedDefinition);assert.equal(writes[0].status,201,JSON.stringify(writes[0].error));
  const pending=structuredClone(writes[0]);assert.ok(await $('recover').isVisible());
  check(true,'voluntary built review sends one whole genuinely modified typed programme and freezes its exact body/key after a lost receipt');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  assert.ok(await $('content').isHidden());assert.equal(await $('rule-editor').innerText(),'');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
  allowed=false;await revoke();if(revokedRead)await revokedRead();await $('refresh').click();await idle();assert.ok(await $('recover').isDisabled());assert.equal(writes.length,1);
  allowed=true;await restore();await $('refresh').click();await idle();await $('recover').click();await idle();
  assert.ok(await $('receipt').isVisible());assert.equal(writes.length,1);assert.deepEqual(writes[0],pending);
  check(true,'visibility and actual SQL read revocation remove the editor; renewal recovers the original whole request without another POST');
  actor(actors.checker);await fresh();await $('review-tab').click();await $('proposal-select').selectOption(pending.receipt.proposalId);
  await $('decision').selectOption('approve');await $('decision-reason').fill('Decisión independiente exclusivamente sintética de navegador QA');
  await $('review-decision').click();await idle();await $('confirm').check();await $('send').click();await idle();
  assert.equal(writes.length,2);assert.equal(writes[1].status,201);assert.equal(writes[1].body.command,'approve');assert.ok(await $('receipt').isVisible());
  actor(actors.maker);assert.deepEqual((await bootstrap()).program.definition,expectedDefinition);assert.deepEqual(errors,[]);
  assert.ok(await page.evaluate(()=>![...Object.values(localStorage),...Object.values(sessionStorage)].some(v=>v.includes('qaUnhealthy')||v.includes('salary_condition_fact'))));
  check(true,'independent built approval conserves the entire typed programme in actual SQL without browser storage or JavaScript errors');
  fs.writeFileSync(path.join(output,'conditions-program-browser-proof.json'),JSON.stringify({ok:true,browserDriver:driverName,browserVersion:browser.version(),actualHandlers:true,actualSql:true,syntheticAuth:true,syntheticOnly:true,productiveBusinessWrites:0,writes:writes.length,reads:reads.length,widths:[1440,390,320],errors},null,2)+'\n');
 }catch(e){
  const failed=writes.find(w=>w.status>=400),diagnostic=failed&&diagnoseProgram?await diagnoseProgram(failed.body.program):null;
  fs.writeFileSync(path.join(output,'conditions-program-browser-debug.json'),JSON.stringify({syntheticOnly:true,initial,writes,diagnostic,error:e.message},null,2)+'\n');
  if(page&&!page.isClosed())await page.screenshot({path:path.join(output,'conditions-program-browser-failure.png'),fullPage:true});throw e;
 }
 finally{allowed=true;await restore();actor(actors.maker);env.INTERNAL_APP_ORIGIN=oldOrigin;await browser?.close();}
}
