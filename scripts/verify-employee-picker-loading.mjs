/** Deterministic browser regression. Only synthetic responses; no municipal network or writes. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const root=path.resolve(process.env.PICKER_LOADING_ROOT||'.');
const out=path.resolve('verification/employee-picker-loading');
fs.mkdirSync(out,{recursive:true});
const modelUrl='data:text/javascript;base64,'+fs.readFileSync(path.join(root,'assets/employee-picker-model.js')).toString('base64');
const source=fs.readFileSync(path.join(root,'assets/employee-picker.js'),'utf8');
assert.equal(source.split("from './employee-picker-model.js'").length,2,'known single model import');
const moduleUrl='data:text/javascript;base64,'+Buffer.from(source.replace("from './employee-picker-model.js'","from '"+modelUrl+"'")).toString('base64');
const checks=[],errors=[];
const employee=(n=1)=>({contractId:'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),legajo:String(1000+n),nombre:'Persona sintética '+n,sector:'Sector de prueba',convenio:'Convenio de prueba',activo:true,statusSnapshotDate:'2026-09-10'});
const payload=(n=1,cutoff='2026-09-10')=>({ok:true,version:'employee-picker.v1',data:[employee(n)],pagination:{page:1,limit:20,total:1,pages:1},scope:{status:'administrative_active',payrollEligibilityCertified:false,sourceCutoffFrom:cutoff,sourceCutoffTo:cutoff}});
const html=`<!doctype html><html lang="es"><meta charset="utf-8"><title>Selector — prueba sintética</title><button id="open">Abrir</button><script type="module">
import {createEmployeePicker} from '${moduleUrl}';
window.allowed=true;window.invalidated=0;window.used=[];
window.picker=createEmployeePicker({canUse:()=>window.allowed,onDirectoryInvalidated:()=>window.invalidated++});
document.querySelector('#open').onclick=()=>window.picker.open({multiple:true,maximum:5,onUse:rows=>window.used.push(rows)});
window.ready=true;
</script></html>`;
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
async function scenario(name,run){
 const context=await browser.newContext({serviceWorkers:'block'});
 try{
  await context.route('**/*',route=>{errors.push('Unexpected network request');return route.abort();});
  const installSyntheticFetch=()=>{
   const original=window.fetch.bind(window);window.reads=[];
   // Deliberately do not settle on abort: late responses must be ignored even
   // when an intermediary completes a canceled request or its body later.
   window.fetch=(url,init={})=>{
    if(!String(url).startsWith('/api/'))return original(url,init);
    if(!String(url).startsWith('/api/internal-data?')||(init.method&&init.method!=='GET'))throw Error('Unexpected API');
    return new Promise((resolve,reject)=>window.reads.push({url:String(url),init,resolve,reject,bodyRequested:false}));
   };
   window.deliver=(i,data,status=200)=>window.reads[i].resolve({ok:status>=200&&status<300,status,json:async()=>{window.reads[i].bodyRequested=true;return data;}});
   window.headers=i=>window.reads[i].resolve({ok:true,status:200,json:()=>{window.reads[i].bodyRequested=true;return new Promise(resolve=>{window.reads[i].body=resolve;});}});
  };
  const page=await context.newPage();page.setDefaultTimeout(5000);page.on('pageerror',error=>errors.push(error.message));
  await page.evaluate(installSyntheticFetch);await page.setContent(html);await page.waitForFunction(()=>window.ready);await page.locator('#open').click();
  const dialog=page.locator('#employeePicker'),form=dialog.locator('[data-picker-form]'),input=dialog.locator('input[type=search]'),button=form.locator('button'),state=dialog.locator('[data-picker-state]'),source=dialog.locator('[data-picker-source]'),rows=dialog.locator('.picker-row'),apply=dialog.locator('[data-picker-apply]');
  const submit=()=>form.evaluate(n=>n.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  const search=async(text='Persona')=>{await input.fill(text);await submit();};
  const deliver=async(i,data=payload(),status=200)=>{await page.evaluate(({i,data,status})=>window.deliver(i,data,status),{i,data,status});};
  const settled=()=>page.waitForFunction(()=>document.querySelector('[data-picker-form]').getAttribute('aria-busy')==='false');
  const count=()=>page.evaluate(()=>window.reads.length);
  await run({page,dialog,form,input,button,state,source,rows,apply,submit,search,deliver,settled,count});
  checks.push(name);
 }finally{await context.close();}
}
try{
 await scenario('Repeated submit and Enter reuse one pending read; later explicit refresh is fresh',async t=>{
  assert.equal(await t.count(),0);await t.search();
  await t.form.evaluate(form=>{for(let i=0;i<20;i++)form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  await t.input.press('Enter');assert.equal(await t.count(),1);
  assert.equal(await t.button.isDisabled(),true);assert.equal(await t.button.innerText(),'Buscando…');assert.equal(await t.form.getAttribute('aria-busy'),'true');
  assert.equal(await t.page.evaluate(()=>window.reads[0].init.signal.aborted),false);
  assert.deepEqual(await t.page.evaluate(()=>{const r=window.reads[0];return {credentials:r.init.credentials,cache:r.init.cache,params:Object.fromEntries(new URL(r.url,'https://picker-loading.test').searchParams)};}),{credentials:'same-origin',cache:'no-store',params:{resource:'employees',view:'novelty-selector',search:'Persona',status:'administrative_active',includeFacets:'0',limit:'20',page:'1'}});
  await t.deliver(0);await t.settled();assert.equal(await t.rows.count(),1);assert.equal(await t.button.isEnabled(),true);
  await t.submit();assert.equal(await t.count(),2);await t.deliver(1);await t.settled();
 });
 await scenario('Changing query cancels the old read; its late 403 cannot erase newer results',async t=>{
  await t.search('Anterior');await t.search('Nueva');assert.equal(await t.count(),2);
  assert.equal(await t.page.evaluate(()=>window.reads[0].init.signal.aborted),true);
  await t.deliver(1,payload(2));await t.settled();await t.deliver(0,{ok:false},403);
  assert.match(await t.rows.innerText(),/sintética 2/);assert.equal(await t.page.evaluate(()=>window.invalidated),0);
 });
 await scenario('Typing cancels without an automatic search or a late disclosure',async t=>{
  await t.search();await t.input.fill('Otra consulta');assert.equal(await t.count(),1);assert.equal(await t.button.isEnabled(),true);
  await t.deliver(0);assert.equal(await t.rows.count(),0);assert.equal(await t.source.isVisible(),false);assert.match(await t.state.innerText(),/Presioná Buscar/);
 });
 await scenario('Failure hides previous source and selection; retry is enabled and reads again',async t=>{
  await t.search();await t.deliver(0);await t.settled();await t.rows.locator('input').check();assert.equal(await t.apply.isEnabled(),true);assert.equal(await t.source.isVisible(),true);
  await t.submit();assert.equal(await t.source.isVisible(),false);assert.equal(await t.source.textContent(),'');assert.equal(await t.apply.isDisabled(),true);
  await t.deliver(1,{ok:false},503);await t.settled();assert.equal(await t.rows.count(),0);assert.equal(await t.apply.isDisabled(),true);assert.equal(await t.button.isEnabled(),true);assert.equal(await t.source.textContent(),'');
  await t.submit();assert.equal(await t.count(),3);await t.deliver(2);await t.settled();assert.equal(await t.rows.count(),1);
 });
 await scenario('Incomplete successful response is not presented as a complete or empty directory',async t=>{
  await t.search();await t.deliver(0);await t.settled();await t.submit();const bad=payload();bad.data=[];await t.deliver(1,bad);await t.settled();
  assert.equal(await t.rows.count(),0);assert.equal(await t.source.isVisible(),false);assert.match(await t.state.innerText(),/incompletos/);
 });
 for(const status of [401,403])await scenario(`HTTP ${status} clears private choices and preserves the authentication boundary`,async t=>{
  await t.search();await t.deliver(0);await t.settled();await t.rows.locator('input').check();await t.submit();await t.deliver(1,{ok:false},status);await t.settled();
  assert.equal(await t.rows.count(),0);assert.equal(await t.apply.isDisabled(),true);assert.equal(await t.source.textContent(),'');assert.equal(await t.page.evaluate(()=>window.invalidated),1);assert.equal(await t.dialog.locator('[data-picker-login]').isVisible(),status===401);
 });
 await scenario('Same-source selection survives a new query; changed source invalidates it',async t=>{
  await t.search();await t.deliver(0);await t.settled();await t.rows.locator('input').check();await t.search('Otra');await t.deliver(1,payload(2));await t.settled();assert.equal(await t.apply.isEnabled(),true);
  await t.submit();await t.deliver(2,payload(2,'2026-09-11'));await t.settled();assert.equal(await t.apply.isDisabled(),true);assert.match(await t.state.innerText(),/Cambió el corte/);
 });
 await scenario('Local permission loss before headers prevents consuming and rendering the body',async t=>{
  await t.search();await t.page.evaluate(()=>window.allowed=false);await t.deliver(0);await t.settled();
  assert.equal(await t.page.evaluate(()=>window.reads[0].bodyRequested),false);assert.equal(await t.rows.count(),0);assert.equal(await t.button.isDisabled(),true);assert.equal(await t.page.evaluate(()=>window.invalidated),1);assert.match(await t.state.innerText(),/acceso a esta carga cambió/);
 });
 await scenario('Local permission loss while decoding the body prevents late private rows',async t=>{
  await t.search();await t.page.evaluate(()=>window.headers(0));await t.page.waitForFunction(()=>window.reads[0].bodyRequested);
  await t.page.evaluate(data=>{window.allowed=false;window.reads[0].body(data);},payload());await t.settled();assert.equal(await t.rows.count(),0);assert.equal(await t.apply.isDisabled(),true);assert.equal(await t.page.evaluate(()=>window.invalidated),1);
 });
 for(const bodyPending of [false,true])await scenario(`Expired read cannot publish a late ${bodyPending?'body':'response'}`,async t=>{
  await t.page.clock.install();await t.search();
  if(bodyPending){await t.page.evaluate(()=>window.headers(0));await t.page.waitForFunction(()=>window.reads[0].bodyRequested);}
  await t.page.clock.fastForward(20001);assert.equal(await t.page.evaluate(()=>window.reads[0].init.signal.aborted),true);
  if(bodyPending)await t.page.evaluate(data=>window.reads[0].body(data),payload());else await t.deliver(0);
  await t.settled();assert.equal(await t.rows.count(),0);assert.equal(await t.button.isEnabled(),true);assert.match(await t.state.innerText(),/demoró demasiado/);
 });
 await scenario('Network failure clears old source and returns an actionable retry state',async t=>{
  await t.search();await t.page.evaluate(()=>window.reads[0].reject(new TypeError('Synthetic network failure')));await t.settled();assert.equal(await t.rows.count(),0);assert.equal(await t.source.textContent(),'');assert.equal(await t.button.isEnabled(),true);assert.match(await t.state.innerText(),/conexión y reintentá/);
 });
 await scenario('Close and reopen restore keyboard focus and reject the previous response',async t=>{
  await t.search();await t.input.press('Escape');assert.equal(await t.dialog.isVisible(),false);assert.equal(await t.page.locator('#open').evaluate(n=>n===document.activeElement),true);
  await t.page.locator('#open').click();await t.search();await t.deliver(0,payload(1));assert.equal(await t.rows.count(),0);await t.deliver(1,payload(2));await t.settled();assert.match(await t.rows.innerText(),/sintética 2/);
 });
 await scenario('Page hide clears results, chosen names and source even after a late body',async t=>{
  await t.search();await t.deliver(0);await t.settled();await t.rows.locator('input').check();await t.submit();await t.page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await t.deliver(1);
  assert.equal(await t.dialog.isVisible(),false);assert.equal(await t.rows.count(),0);assert.equal(await t.dialog.locator('[data-picker-chips]').textContent(),'');assert.equal(await t.source.textContent(),'');
 });
 await scenario('Pagination retains its query/page and duplicate submit deduplicates only the same page',async t=>{
  const data=payload();data.data=Array.from({length:20},(_,i)=>employee(i+1));data.pagination={page:1,limit:20,total:21,pages:2};
  await t.search();await t.deliver(0,data);await t.settled();await t.dialog.locator('[data-picker-next]').click();
  assert.equal(await t.page.evaluate(()=>new URL(window.reads[1].url,'https://picker-loading.test').searchParams.get('page')),'2');
  // An explicit form submission during page 2 is a new page-1 read, not a reuse.
  await t.submit();assert.equal(await t.count(),3);assert.equal(await t.page.evaluate(()=>window.reads[1].init.signal.aborted),true);
  await t.submit();assert.equal(await t.count(),3);await t.deliver(2,data);await t.settled();
 });
 assert.deepEqual(errors,[]);
 const result={checksPassed:checks.length,checks,errors,apiDataSynthetic:true,realMunicipalSessionTested:false,municipalBackendWrites:false};
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}catch(error){fs.writeFileSync(path.join(out,'error.txt'),String(error.stack));throw error;}finally{await browser.close();}
