// Compiled local/public UI; every private read and write is intercepted with
// synthetic records. No municipal session or mutation reaches a real API.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {PARAMETER_CONTRACT,PARAMETER_SOURCE_SHA,parameterPreview} from '../lib/payroll-parameter-contract.js';
import {CATALOG_CONTRACT} from '../lib/payroll-catalog-contract.js';
const published=process.argv.includes('--published');
const origin=published?'https://municipio-junin-friendly.vercel.app':'http://127.0.0.1:4328';
const root=path.resolve('public'),out=path.resolve('verification/catalog-activation-'+(published?'published':'local'));
fs.mkdirSync(out,{recursive:true});
const uid=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const capabilities=['payroll.read','payroll.parameter.read','payroll.parameter.approve','payroll.parameter.audit.read'];
const initialActor={tenantId:uid(1),membershipId:uid(2),certifiedBindingId:uid(3),employmentLinked:true,capabilities};
const flags={grhMutation:false,payrollCalculated:false,payrollPosted:false,currentCatalogVerified:false,proposalApproved:false};
function proposal(id=uid(4)){
 const draft={ruleId:'aux88-class13i-150',baseAmountCents:'10001',validFrom:'2026-10',sourceReference:'ESCALA SINTÉTICA QA · sin vigencia municipal',rounding:'nearest_cent',agreementIds:[2,7,11]};
 return {id,contractVersion:PARAMETER_CONTRACT,version:3,status:'approved',draft:{...draft,rows:parameterPreview(draft),sourceSha256:PARAMETER_SOURCE_SHA,applied:false,currentCatalogVerified:false},allowedCommands:[],updatedAt:'2026-10-01T12:00:00.123456Z',timeline:[]};
}
const envelope={contractVersion:CATALOG_CONTRACT,payrollCalculated:false,payrollPosted:false};
let state,releasePost,scenario=0;
const checks=[],errors=[],writes=[],privateCalls=[];
function reset(){state={actor:structuredClone(initialActor),denied:false,mode:'ok',proposal:proposal(),receipts:new Map(),freshRevision:7,previewCalls:0,changeOnConfirm:false,holdPost:false};}
function preview(p=state.proposal){return {...envelope,preview:{proposalId:p.id,proposalVersion:p.version,catalogRevision:state.freshRevision,validFrom:p.draft.validFrom,sourceReference:p.draft.sourceReference,canActivate:true,blockedReason:null,changes:p.draft.rows.map((row,i)=>({...row,previousValueCents:i===0?null:'10000',previousActivationRevision:i===0?null:2,previousValidFrom:i===0?null:'2026-09'}))}};}
function receipt(){const p=state.proposal,a={id:uid(6),revision:8,proposalId:p.id,proposalVersion:p.version,validFrom:p.draft.validFrom,activatedAt:'2026-10-01T12:00:00.123456Z'};return {ok:true,...envelope,currentRevision:8,replayed:false,activation:a,catalog:{period:a.validFrom,revision:8,rows:p.draft.rows.map(row=>({...row,activationId:a.id,activationRevision:8,proposalId:p.id,proposalVersion:p.version,validFrom:a.validFrom,sourceReference:p.draft.sourceReference,ruleId:p.draft.ruleId,sourceSha256:PARAMETER_SOURCE_SHA,activatedAt:a.activatedAt}))}};}
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'es-AR',serviceWorkers:'block',acceptDownloads:true});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.abort();
  if(u.pathname.startsWith('/api/')){
   privateCalls.push({path:u.pathname,resource:u.searchParams.get('resource'),method:req.method()});
   if(u.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,user:{name:'OPERADOR SINTÉTICO QA'},access:{tenantCapabilities:capabilities,platformRoles:[],platformCapabilities:[]}}});
   if(u.pathname==='/api/internal-data')return route.fulfill({json:{ok:true,status:'ready',sourcePolicy:{label:'QA SINTÉTICA'},latestClosed:{},currentOpen:{},runs:[],quality:{},limitations:[]}});
   if(!['/api/internal-payroll-catalog','/api/internal-payroll-parameters'].includes(u.pathname))return route.fulfill({status:403,json:{ok:false,error:'Sin permiso sintético'}});
   if(state.denied)return route.fulfill({status:403,json:{ok:false,code:'PAYROLL_CATALOG_ACCESS_REVOKED',error:'Acceso sintético retirado'}});
   const resource=u.searchParams.get('resource');
   if(u.pathname==='/api/internal-payroll-parameters'){
    assert.equal(req.method(),'GET','no parameter mutations in this catalog sprint');
    if(resource==='bootstrap')return route.fulfill({json:{ok:true,flags,principal:state.actor,limits:{contractVersion:PARAMETER_CONTRACT,sourceSha256:PARAMETER_SOURCE_SHA}}});
    if(resource==='list')return route.fulfill({json:{ok:true,flags,proposals:[state.proposal,proposal(uid(5))],total:2}});
    if(resource==='detail')return route.fulfill({json:{ok:true,flags,proposal:u.searchParams.get('id')===uid(5)?proposal(uid(5)):state.proposal}});
    throw Error('Unexpected parameter read');
   }
   if(req.method()==='GET'){
    if(resource==='preview'){state.previewCalls++;if(state.changeOnConfirm&&state.previewCalls>1)state.freshRevision=8;return route.fulfill({json:{ok:true,...preview()}});}
    if(resource==='attempt'){
     const r=state.receipts.get(u.searchParams.get('key'));return route.fulfill({status:r?200:404,json:r?{...r,replayed:true}:{ok:false,code:'PAYROLL_CATALOG_ATTEMPT_NOT_FOUND',error:'Sin acuse sintético'}});
    }
    if(resource==='catalog'){const r=receipt();delete r.activation;delete r.replayed;return route.fulfill({json:r});}
    throw Error('Unexpected catalog read');
   }
   assert.equal(req.method(),'POST');const body=req.postDataJSON(),key=req.headers()['idempotency-key'],scope=req.headers()['x-municontrol-catalog-scope'];
   assert.equal(scope,[initialActor.tenantId,initialActor.membershipId,initialActor.certifiedBindingId].join('|'));
   assert.deepEqual(body,{command:'activate',payload:{proposalId:uid(4),proposalVersion:3,catalogRevision:7}});
   writes.push({body:req.postData(),key,scope});
   const r=receipt();state.receipts.set(key,structuredClone(r));
   if(state.holdPost)await new Promise(resolve=>{releasePost=resolve;});
   if(state.mode==='lost')return route.fulfill({status:503,json:{ok:false,error:'Confirmación sintética perdida'}});
   if(state.mode==='conflict'){state.receipts.delete(key);return route.fulfill({status:409,json:{ok:false,code:'PAYROLL_CATALOG_VERSION_CONFLICT',error:'Conflicto sintético sin acuse'}});}
   if(state.mode==='revoke-after-post')state.denied=true;
   if(state.mode==='scope-after-post')state.actor.membershipId=uid(9);
   if(state.mode==='wrong-proposal'){r.activation.proposalId=uid(9);r.catalog.rows.forEach(row=>row.proposalId=uid(9));}
   if(state.mode==='wrong-version'){r.activation.proposalVersion=4;r.catalog.rows.forEach(row=>row.proposalVersion=4);}
   if(state.mode==='wrong-revision'){r.activation.revision=9;r.catalog.revision=9;r.currentRevision=9;r.catalog.rows.forEach(row=>row.activationRevision=9);}
   if(state.mode==='missing-agreement')r.catalog.rows.pop();
   if(state.mode==='wrong-value')r.catalog.rows[1].newValueCents='15003';
   if(state.mode==='wrong-reference')r.catalog.rows[1].sourceReference='OTRA ESCALA SINTÉTICA';
   if(state.mode==='wrong-timestamp')r.catalog.rows[1].activatedAt='2026-10-01T12:00:00.123Z';
   return route.fulfill({json:r});
  }
  if(req.method()!=='GET')return route.abort();
  if(!(u.pathname==='/nomina'||u.pathname==='/nomina-control.html'||u.pathname.startsWith('/assets/')||['/friendly-data.json','/manifest.webmanifest'].includes(u.pathname)))return route.abort();
  if(published)return route.continue();
  const file=path.resolve(root,u.pathname==='/nomina'?'nomina-control.html':'.'+u.pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
 });
 const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 const w=page.locator('[data-parameter-workspace]'),c=page.locator('[data-payroll-catalog]'),d=c.locator('dialog');
 async function load(){reset();await page.goto(origin+'/nomina?qa-catalog-case='+(++scenario)+'#resumen');await page.getByRole('tab',{name:'Parámetros',exact:true}).click();await w.getByText('Parámetros disponibles.',{exact:false}).waitFor();await w.locator('.pp-record').first().click();await c.getByRole('button',{name:'Revisar impacto de activación'}).waitFor();}
 async function review(){await c.getByRole('button',{name:'Revisar impacto de activación'}).click();await c.getByRole('button',{name:'Activar valores desde 2026-10'}).click();await d.getByRole('heading',{name:'Confirmar activación de auxiliares'}).waitFor();}
 async function confirm(){await d.getByLabel('Revisé todos los convenios, valores y la vigencia').check();await d.getByRole('button',{name:'Confirmar activación',exact:true}).click();}
 async function pending(){await c.getByRole('heading',{name:'Activación sin confirmación'}).waitFor();await page.waitForFunction(()=>Array.from(document.querySelectorAll('[data-payroll-catalog] button')).some(el=>el.textContent==='Consultar activación pendiente'&&!el.disabled));}
 async function success(){await c.getByText('Valores activados desde 2026-10',{exact:false}).waitFor();assert.equal(await c.getByRole('heading',{name:'Activación sin confirmación'}).count(),0);}
 await load();await review();assert.equal(await d.locator('.pc-impact-row').count(),3);assert.equal(await d.locator('.pc-impact-row strong').first().innerText(),'$ 150,02');
 assert.ok((await d.innerText()).includes('Sin valor activado'));assert.ok((await d.innerText()).includes('revisión 2'));assert.ok((await d.innerText()).includes('Básico de la escala: $ 100,01'));
 assert.equal(await d.getByRole('button',{name:'Confirmar activación',exact:true}).isDisabled(),true);
 await d.getByRole('button',{name:'Volver sin activar'}).click();assert.equal(writes.length,0);
 await c.getByRole('button',{name:'Activar valores desde 2026-10'}).click();await d.getByLabel('Revisé todos los convenios, valores y la vigencia').check();await page.keyboard.press('Escape');await d.waitFor({state:'hidden'});assert.equal(writes.length,0);
 checks.push('complete confirmation: all three agreements, null separate from zero, previous revision, base, exact half-cent and rounding; cancel and Escape send no POST');
 await c.getByRole('button',{name:'Activar valores desde 2026-10'}).click();
 for(const width of [390,320]){await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});assert.ok(await d.evaluate(el=>el.getBoundingClientRect().left>=0&&el.getBoundingClientRect().right<=innerWidth+1&&el.scrollWidth<=el.clientWidth+1));assert.ok(await d.locator('button').evaluateAll(items=>items.every(el=>el.getBoundingClientRect().height>=44)));assert.ok(await d.getByLabel('Revisé todos los convenios, valores y la vigencia').evaluate(el=>el.closest('label').getBoundingClientRect().height>=44));await page.screenshot({path:path.join(out,'confirmation-'+width+'.png')});}
 await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:path.join(out,'confirmation-desktop.png')});checks.push('320/390px confirmation fits screen, labeled checkbox and 44px touch controls');
 await confirm();await success();assert.equal(writes.length,1);assert.equal(state.previewCalls,2);checks.push('first activation rechecks authority, saved proposal and full preview, then verifies complete receipt');
 for(const [label,ext] of [['Excel','xlsx'],['PDF','pdf'],['CSV','csv']]){const event=page.waitForEvent('download');await c.getByRole('button',{name:'Exportar catálogo '+label,exact:true}).click();const download=await event;await download.saveAs(path.join(out,'synthetic-catalog.'+ext));assert.ok(fs.statSync(path.join(out,'synthetic-catalog.'+ext)).size>100);}
 checks.push('catalog Excel/PDF/CSV exports remain available and reconsult exact stored revision');
 await load();await review();state.changeOnConfirm=true;const beforeChange=writes.length;await confirm();await c.getByText('Cambió la propuesta o el catálogo.',{exact:false}).waitFor();assert.equal(writes.length,beforeChange);assert.equal(await d.isVisible(),false);checks.push('changed preview blocks first POST and withdraws confirmation');
 for(const field of ['tenantId','membershipId','certifiedBindingId']){await load();await review();const before=writes.length;state.actor[field]=uid(9);await confirm();await c.getByText('Cambió el municipio, la membresía o la fuente certificada.',{exact:false}).waitFor();assert.equal(writes.length,before);checks.push('changed '+field+' blocks first activation');}
 for(const mode of ['wrong-proposal','wrong-version','wrong-revision','missing-agreement','wrong-value','wrong-reference','wrong-timestamp']){await load();await review();state.mode=mode;const before=writes.length;await confirm();await pending();await c.getByText('La confirmación del catálogo no corresponde',{exact:false}).waitFor();assert.equal(writes.length,before+1);assert.equal(await c.locator('.pc-value').count(),0);await c.getByRole('button',{name:'Consultar activación pendiente'}).click();await success();assert.equal(writes.length,before+1);checks.push(mode+' receipt never certifies activation; original valid receipt resolves without POST');}
 await load();await review();state.mode='lost';await confirm();await pending();await c.getByText('Confirmación sintética perdida',{exact:true}).waitFor();const original=writes.at(-1),beforeRecovery=writes.length;await w.locator('.pp-record').last().click();assert.ok((await c.innerText()).includes(original.key));await c.getByRole('button',{name:'Consultar activación pendiente'}).click();await success();assert.equal(writes.length,beforeRecovery);checks.push('lost receipt survives selecting another proposal and recovers original attempt without a new POST');
 await load();await review();state.mode='conflict';await confirm();await pending();await c.getByText('Conflicto sintético sin acuse',{exact:true}).waitFor();const conflictAttempt=writes.at(-1);await c.getByRole('button',{name:'Consultar activación pendiente'}).click();await c.getByText('Todavía no hay acuse.',{exact:false}).waitFor();state.mode='ok';await c.getByRole('button',{name:'Reenviar activación original'}).click();await success();assert.deepEqual(writes.at(-1),conflictAttempt);checks.push('409 and missing receipt retain immutable body/key/scope; explicit resend uses exactly the original attempt');
 await load();await review();state.mode='revoke-after-post';await confirm();await c.getByRole('button',{name:'Comprobar acceso al catálogo'}).waitFor();assert.equal(await c.getByRole('heading',{name:'Activación sin confirmación'}).count(),1);assert.equal(await c.getByRole('button',{name:'Consultar activación pendiente'}).isDisabled(),true);assert.equal(await c.locator('.pc-value').count(),0);const revokedBefore=writes.length;state.denied=false;await c.getByRole('button',{name:'Comprobar acceso al catálogo'}).click();await c.getByRole('button',{name:'Consultar activación pendiente'}).click();await success();assert.equal(writes.length,revokedBefore);checks.push('revocation clears private catalog but keeps pending attempt mounted; restored same scope permits read-only recovery');
 await load();await review();state.mode='scope-after-post';await confirm();await pending();await c.getByText('Cambió el municipio, la membresía o la fuente certificada.',{exact:false}).waitFor();const changedBefore=writes.length,attemptReads=privateCalls.filter(q=>q.resource==='attempt').length;await c.getByRole('button',{name:'Consultar activación pendiente'}).click();await c.getByText('Cambió el municipio, la membresía o la fuente certificada.',{exact:false}).waitFor();assert.equal(privateCalls.filter(q=>q.resource==='attempt').length,attemptReads);assert.equal(writes.length,changedBefore);state.actor=structuredClone(initialActor);await c.getByRole('button',{name:'Consultar activación pendiente'}).click();await success();checks.push('receipt and recovery never switch a pending activation to another membership');
 await load();await review();const hiddenBefore=writes.length;await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await d.waitFor({state:'hidden'});assert.equal(writes.length,hiddenBefore);assert.equal(await c.locator('.pc-impact-row').count(),0);checks.push('pagehide invalidates reviewed confirmation without a mutation');
 await load();await review();state.holdPost=true;await confirm();await page.waitForFunction(()=>!!document.querySelector('[data-payroll-catalog] .pc-impact h4')||!!document.querySelector('[data-payroll-catalog] .pc-impact h4'));
 for(let i=0;i<100&&!releasePost;i++)await new Promise(resolve=>setTimeout(resolve,20));assert.ok(releasePost);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 releasePost();releasePost=null;await c.getByRole('button',{name:'Comprobar acceso al catálogo'}).waitFor();await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('[data-payroll-catalog] button')).some(el=>el.textContent==='Comprobar acceso al catálogo'&&!el.disabled));
 await c.getByRole('button',{name:'Comprobar acceso al catálogo'}).click();await c.getByRole('button',{name:'Consultar activación pendiente'}).click();await success();checks.push('hidden page rejects a late POST receipt; original attempt remains recoverable after explicit access check');
 assert.deepEqual(errors,[]);
 const result={ok:true,checksPassed:checks.length,checks,errors,uiSource:published?'Vercel production static assets':'compiled local files',browserApiMode:'synthetic-only',privateRequestsForwarded:0,actualWritesSent:0,municipalSessionTested:false};
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));await context.close();
}finally{await browser.close();}
