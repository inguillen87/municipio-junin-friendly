/** Synthetic module-level checks: no production, database, messages or legal decisions. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const out='verification/legal-read-safety';fs.mkdirSync(out,{recursive:true});
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const alertRows=Array.from({length:31},(_,i)=>({sourceType:'followup',itemId:uuid(i+1),itemVersion:1,title:'Seguimiento sintético '+i,dueDate:'2026-09-23',status:'open',responsibleLabel:'',sourceId:uuid(100),sourceVersion:1,sourceKind:'ordenanza',sourceNumber:'QA',sourceYear:2026,sourceTitle:'Fuente sintética',recordedAt:'2026-09-23T12:00:00Z',responsibleId:null,responsibleEligible:null,nextAction:'',coordinationRevision:0,coordinationFollowupVersion:0,owningArea:''}));
const agendaRows=Array.from({length:31},(_,i)=>({id:uuid(i+1),sequence:1,status:'open',obligationType:'milestone',title:'Hito sintético '+i,clauseLocator:'Cláusula QA',sourcePage:1,dueDate:'2026-09-23',dueBasis:'Fecha registrada',currency:'NONE',amountMinor:null,unit:'',responsibleLabel:'Responsable sintético',evidenceDocumentId:null,recordedAt:'2026-09-23T12:00:00Z',contractId:uuid(100),contractNumber:'QA-01',contractYear:2026,contractType:'servicio',contractRevision:1,contractState:'active',contractTitle:'Contrato sintético'}));
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
const checks=[],errors=[];
try{
 for(const kind of ['alerts','agenda']){
  const isAlert=kind==='alerts',id=isAlert?'legalAlertRoot':'contractAgendaRoot',cls=isAlert?'lac':'lga';
  const payload={ok:true,data:{version:isAlert?'legal-alert-center.v2':'legal-contract-agenda.v1',today:'2026-09-23',timezone:'America/Argentina/Mendoza',limit:isAlert?1500:1000,population:31,revision:'a'.repeat(64),rows:isAlert?alertRows:agendaRows}};
  const bundle=await build({entryPoints:['assets/'+(isAlert?'legal-alert-center':'legal-contract-agenda')+'-ui.js'],bundle:true,write:false,format:'iife'});
  const page=await browser.newPage({viewport:{width:1000,height:850}});page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body><main id="'+id+'"></main></body></html>');
  await page.addStyleTag({content:fs.readFileSync('assets/'+(isAlert?'legal-alert-center':'legal-contract-agenda')+'.css','utf8')});
  await page.evaluate(payload=>{
   window.MuniControlCapabilityGate={ready:Promise.resolve({tenantCapabilities:new Set(['legal.norm.read'])})};
   window.qaPayload=payload;window.qaCalls=0;window.qaDelay=false;window.qaFail=false;window.qaWaiters=[];window.qaSignals=[];
   window.fetch=async(url,options)=>{window.qaCalls++;window.qaSignals.push(options.signal);if(window.qaDelay)await new Promise(r=>window.qaWaiters.push(r));if(window.qaFail)throw Error('PRIVATE SERVER INFORMATION');return {ok:true,status:200,json:async()=>structuredClone(window.qaPayload)}};
  },payload);
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  const cards=page.locator('article.'+cls+'-card'),refresh=page.getByRole('button',{name:isAlert?'Actualizar alertas':'Actualizar agenda',exact:true});
  await page.waitForFunction(cls=>document.querySelectorAll('article.'+cls+'-card').length===25,cls);assert.equal(await cards.count(),25);checks.push(kind+': 31 authorized synthetic records use 25-card pages');
  await page.getByRole('searchbox').fill(isAlert?'sintético 30':'sintético 30');await page.getByRole('button',{name:isAlert?'Aplicar':'Aplicar búsqueda',exact:true}).click();assert.equal(await cards.count(),1);
  await page.evaluate(()=>window.qaDelay=true);const before=await page.evaluate(()=>window.qaCalls);
  await refresh.click();await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'))});
  await page.waitForFunction(()=>window.qaWaiters.length===1);assert.equal(await page.evaluate(()=>window.qaCalls),before+1);assert.equal(await cards.count(),0);
  await page.evaluate(()=>{window.qaDelay=false;window.qaWaiters.splice(0).forEach(r=>r())});await page.waitForFunction(cls=>document.querySelectorAll('article.'+cls+'-card').length===1,cls);
  assert.equal(await page.getByRole('searchbox').inputValue(),'sintético 30');checks.push(kind+': refresh, focus and visibility share one request and preserve the filter');
  await page.evaluate(()=>window.qaFail=true);await refresh.click();await page.getByRole('button',{name:'Reintentar',exact:true}).waitFor();assert.equal(await cards.count(),0);assert.doesNotMatch(await page.locator('#'+id).innerText(),/PRIVATE SERVER/);
  await page.evaluate(()=>window.qaFail=false);await page.getByRole('button',{name:'Reintentar',exact:true}).click();await page.waitForFunction(cls=>document.querySelectorAll('article.'+cls+'-card').length===1,cls);
  assert.equal(await page.getByRole('searchbox').inputValue(),'sintético 30');checks.push(kind+': an error scrubs records, then retry restores the same search without raw exception details');
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:out+'/'+kind+'-mobile.png',fullPage:true});checks.push(kind+': 390px layout does not overflow');
  await page.evaluate(()=>window.qaDelay=true);await refresh.click();await page.waitForFunction(()=>window.qaWaiters.length===1);
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:new Set(['legal.norm.read'])}})));
  assert.equal(await cards.count(),0);assert.equal(await refresh.count(),0);assert.equal(await page.evaluate(()=>window.qaSignals.at(-1).aborted),true);
  await page.evaluate(()=>window.qaWaiters.splice(0).forEach(r=>r()));await page.waitForTimeout(30);assert.equal(await cards.count(),0);
  checks.push(kind+': any new capability context aborts the old read, including a different context with the same capability');
  await page.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(out+'/result.json',JSON.stringify({checksPassed:checks.length,checks,errors,syntheticOnly:true,databaseWrites:0,messagesSent:0},null,2));console.log(JSON.stringify({checksPassed:checks.length,errors}));
}finally{await browser.close()}
