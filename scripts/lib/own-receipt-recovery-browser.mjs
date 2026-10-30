// Built product, actual receipt handler and owned loopback PostgreSQL supplied
// by the parent QA harness. Authentication and the issuer are fictional QA.
// Only the first command's source hash is altered, deliberately, before the
// real handler: PostgreSQL must reject it and prove its key was never saved.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {launchOwnSyntheticBrowser} from './own-synthetic-browser.mjs';
import {ownReceiptParams} from '../../assets/own-payroll-receipt-model.js';
import {formatOwnRunDecimal,OWN_RUN_TYPES} from '../../assets/own-payroll-run-workspace-model.js';
import {selectNoeliaReceiptTypes} from './noelia-payroll-circuit-browser.mjs';
import {captureOwnReceiptRecoveryResponse} from './own-receipt-recovery-response-qa.mjs';

const receiptRecoveryControls=Object.freeze(['period',...Object.keys(OWN_RUN_TYPES).map(type=>'type-'+type),'scope','departmentFrom','departmentTo','date','legend','all','consult','reason','confirm','contracts','prepare']);
export async function assertOwnReceiptRecoveryControls(p,locked){
 assert.equal(typeof p,'function');assert.equal(typeof locked,'boolean');const fields=p('fields');
 // Playwright's isDisabled applies to form controls, not the FIELDSET itself.
 // Verify its actual native lock and every editable payload/control used by
 // this department-scoped drill, including the separate decision fieldset.
 assert.equal(await fields.evaluate(el=>el.tagName),'FIELDSET');
 assert.equal(await fields.evaluate(el=>el.disabled),locked,'receipt fieldset native lock');
 assert.equal((await fields.getAttribute('disabled'))!==null,locked,'receipt fieldset disabled attribute');
 const types=p('types');assert.equal(await types.evaluate(el=>el.tagName),'FIELDSET');
 assert.equal(await types.locator('input[data-receipt-type]').count(),Object.keys(OWN_RUN_TYPES).length,'receipt type checkbox count');
 for(const type of Object.keys(OWN_RUN_TYPES)){const checkbox=p('type-'+type);assert.equal(await checkbox.getAttribute('type'),'checkbox','receipt type checkbox kind: '+type);assert.equal(await checkbox.getAttribute('data-receipt-type'),type,'receipt type checkbox code: '+type);}
 for(const key of receiptRecoveryControls)assert.equal(await p(key).isDisabled(),locked,'receipt effective control lock: '+key);
}

export async function verifyOwnReceiptRecoveryBrowser({handler,env,actor,setActor,auth,params,expectedRecords,eventCount,preserved,output,check,browserName='chromium'}){
 assert.equal(browserName,'chromium');assert.equal(typeof handler,'function');assert.equal(typeof auth,'function');assert.equal(typeof eventCount,'function');assert.equal(typeof preserved,'function');
 const declared=ownReceiptParams(params);assert.ok(expectedRecords.length>0);assert.ok(expectedRecords.every(r=>r.departmentCode===declared.filters.departmentFrom));
 const originalOrigin=env.INTERNAL_APP_ORIGIN,root=fs.realpathSync(new URL('../../public',import.meta.url)),origin='http://127.0.0.1:4380';
 const errors=[],requests=[],commands=[],previews=[],routeFailures=[];let rejectFirst=true,page;
 const before=await preserved(),initialEvents=await eventCount();setActor(actor);env.INTERNAL_APP_ORIGIN=origin;
 const {browser}=await launchOwnSyntheticBrowser();
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1100},locale:'es-AR',serviceWorkers:'block'});
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();
   try{
    if(url.pathname==='/api/internal-auth')return route.fulfill({json:await auth()});
    if(url.pathname==='/api/internal-own-payroll-receipts'){
     const packet=req.method()==='POST'?JSON.parse(req.postData()):null,original=packet?.operation==='command'?structuredClone(packet.payload):null,key=req.headers()['idempotency-key'];
     let submitted=packet;
     if(original&&rejectFirst){rejectFirst=false;submitted={operation:'command',payload:{...original,sourceVersion:'0'.repeat(64)}};}
     const {status,headers,body,payload}=await captureOwnReceiptRecoveryResponse(handler,{method:req.method(),url:url.pathname+url.search,query:Object.fromEntries(url.searchParams),headers:req.headers(),body:submitted?JSON.stringify(submitted):undefined});
     requests.push({method:req.method(),resource:url.searchParams.get('resource'),attemptKey:url.searchParams.get('key'),operation:packet?.operation,key,status});
     if(packet?.operation==='preview'&&payload?.ok)previews.push(structuredClone(payload.data));
     if(original)commands.push({key,original,submitted:structuredClone(submitted.payload),status,response:structuredClone(payload)});
     return route.fulfill({status,headers,body});
    }
    // These ancillary panels are outside this test. They receive no nominal
    // records, and none of their responses stand in for the receipt handler.
    if(url.pathname==='/api/internal-data')return route.fulfill({json:{ok:true,status:'ready',sourcePolicy:{label:'QA SINTÉTICA'},latestClosed:{},currentOpen:{},runs:[],quality:{},limitations:[]}});
    if(url.pathname==='/api/internal-payroll-parameters')return route.fulfill({status:403,json:{ok:false,error:'Panel ajeno a la prueba sintética de recibos.'}});
    if(url.pathname.startsWith('/api/'))return route.fulfill({status:403,json:{ok:false,error:'API ajena a la prueba sintética de recibos.'}});
    const file=path.resolve(root,url.pathname==='/nomina'?'nomina-control.html':'.'+url.pathname);
    if(req.method()!=='GET'||!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
    return route.fulfill({contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]??'application/octet-stream',body:fs.readFileSync(file)});
   }catch(error){routeFailures.push(error.message);return route.fulfill({status:500,json:{ok:false,error:'Falló el transporte exclusivamente sintético de recibos.'}});}
  });
  page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  const p=k=>page.locator('[data-receipt-'+k+']'),idle=()=>page.waitForFunction(()=>document.querySelector('.own-receipt')?.getAttribute('aria-busy')==='false');
  await page.goto(origin+'/nomina#recibos');await p('period').waitFor({state:'visible'});await idle();await p('issuerProfile').waitFor({state:'visible'});
  for(const [field,value]of Object.entries(declared.issuer))assert.equal(await p({name:'issuerName',taxId:'issuerTaxId',address:'issuerAddress'}[field]).inputValue(),value);
  assert.ok(await p('issuerProfile').locator('input').evaluateAll(fields=>fields.length===3&&fields.every(el=>el.readOnly)));
  await p('period').fill(declared.period);await selectNoeliaReceiptTypes(page,declared.types);await p('scope').selectOption('department');await p('departmentFrom').fill(declared.filters.departmentFrom);await p('departmentTo').fill(declared.filters.departmentTo);
  await p('date').fill(declared.paymentDate);await p('legend').fill(declared.legend);await p('consult').click();await idle();await p('result').waitFor({state:'visible'});
  assert.deepEqual(previews.at(-1).snapshot.params,declared);assert.deepEqual(previews.at(-1).snapshot.records,expectedRecords);
  check(commands.length===0,'receipt browser queries the actual closed department and autocompletes all institutional fields without a command');
  const reason='Preparación exclusivamente sintética de recuperación de recibos QA177';await p('reason').fill(reason);await p('prepare').click();await idle();
  assert.equal(commands.length,1);const original=structuredClone(commands[0]);assert.equal(original.status,409);assert.equal(original.response.code,'OWN_RECEIPT_STATE_CHANGED');assert.notEqual(original.submitted.sourceVersion,original.original.sourceVersion);
  assert.deepEqual({...original.submitted,sourceVersion:original.original.sourceVersion},original.original);assert.deepEqual(original.original.params,declared);
  await assertOwnReceiptRecoveryControls(p,true);assert.ok(await p('correct').isHidden());assert.ok(await p('recover').isVisible());assert.equal(await eventCount(),initialEvents);assert.deepEqual(await preserved(),before);
  await p('recover').click();await idle();assert.equal(commands.length,1);
  const absence=requests.filter(r=>r.resource==='attempt'&&r.attemptKey===original.key).at(-1);assert.ok(absence);assert.equal(absence.status,404);
  assert.ok(await p('correct').isVisible());await assertOwnReceiptRecoveryControls(p,true);
  check(true,'real SQL409 and same-key404 expose explicit correction while preserving the original attempt and all business records');
  const readStart=requests.length;await p('correct').click();await idle();assert.equal(commands.length,1);assert.deepEqual(commands[0],original);
  const revalidated=requests.slice(readStart);assert.ok(revalidated.some(r=>r.resource==='issuer'&&r.status===200));assert.ok(revalidated.some(r=>r.operation==='preview'&&r.status===200));assert.ok(revalidated.some(r=>r.resource==='attempt'&&r.attemptKey===original.key&&r.status===404));
  await assertOwnReceiptRecoveryControls(p,false);assert.ok(await p('result').isVisible());assert.ok(await p('correct').isHidden());assert.ok(await p('recover').isHidden());assert.ok(await p('retry').isHidden());assert.ok(await p('previous').isVisible());
  assert.ok((await p('previous').innerText()).includes(original.key));assert.equal(await p('reason').inputValue(),reason);assert.equal(await p('period').inputValue(),declared.period);assert.equal(await p('scope').inputValue(),'department');assert.equal(await p('departmentFrom').inputValue(),declared.filters.departmentFrom);assert.equal(await p('departmentTo').inputValue(),declared.filters.departmentTo);assert.equal(await p('date').inputValue(),declared.paymentDate);assert.equal(await p('legend').inputValue(),declared.legend);assert.equal(await p('confirm').isChecked(),false);
  assert.deepEqual(previews.at(-1).snapshot.params,declared);assert.deepEqual(previews.at(-1).snapshot.records,expectedRecords);
  for(const record of expectedRecords)assert.ok((await p('rows').innerText()).includes(formatOwnRunDecimal(record.totals.net)));
  assert.equal(await eventCount(),initialEvents);assert.deepEqual(await preserved(),before);
  check(true,'explicit correction revalidates real issuer, source and absence, restores the exact draft and centavos, and issues no automatic command');
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
   const layout=await page.evaluate(()=>{const a=document.querySelector('[data-receipt-date]').getBoundingClientRect(),b=document.querySelector('[data-receipt-legend]').getBoundingClientRect();return{date:a.top,legend:b.top,dateBottom:a.bottom};});
   if(width===1440)assert.ok(Math.abs(layout.date-layout.legend)<=1);else assert.ok(layout.legend>=layout.dateBottom);
   assert.ok(await p('prepare').evaluate(el=>el.getBoundingClientRect().height>=44));await page.locator('.own-receipt').screenshot({path:path.join(output,'receipt-recovery-'+width+'.png')});
  }
  check(true,'receipt correction and aligned date/legend remain usable at desktop,390px and320px');
  await p('prepare').click();await idle();assert.equal(commands.length,2);const next=commands[1];assert.equal(next.status,201);assert.notEqual(next.key,original.key);assert.deepEqual(next.original,original.original);assert.deepEqual(next.submitted,next.original);assert.deepEqual(commands[0],original);assert.equal(await eventCount(),initialEvents+1);
  assert.ok((await p('state').innerText()).includes('pendiente de revisión'));assert.ok(await p('approve').isDisabled());assert.ok(next.response.ok);assert.equal(next.response.data.body.command,'prepare');
  const after=await preserved();assert.deepEqual({...after,receipts:before.receipts},before);assert.deepEqual(errors,[]);assert.deepEqual(routeFailures,[]);
  check(true,'only a later explicit preparation obtains a new key and saves one pending receipt event; source, identities, captures, results and close remain unchanged');
  const proof={ok:true,browser:browserName,actualHandler:true,actualSql:true,syntheticAuth:true,syntheticIssuer:true,syntheticOnly:true,firstCommandSourceHashAltered:true,realDeterministicRejection:original.response.code,realAttemptNotFound:true,readOnlyCorrection:true,exactDraftPreserved:true,exactRecordsPreserved:true,nativeFieldsetLockVerified:true,effectiveControlLocksVerified:[...receiptRecoveryControls],explicitCorrectionUnlockVerified:true,newExplicitPreparation:true,commandPosts:commands.length,receiptEventsAdded:1,recordCount:expectedRecords.length,productiveBusinessWrites:0,errors};
  fs.writeFileSync(path.join(output,'receipt-recovery-browser-proof.json'),JSON.stringify(proof,null,2)+'\n');return proof;
 }catch(error){if(page&&!page.isClosed())await page.screenshot({path:path.join(output,'receipt-recovery-browser-failure.png'),fullPage:true});throw error;}
 finally{setActor(actor);if(originalOrigin===undefined)delete env.INTERNAL_APP_ORIGIN;else env.INTERNAL_APP_ORIGIN=originalOrigin;await browser.close();}
}
