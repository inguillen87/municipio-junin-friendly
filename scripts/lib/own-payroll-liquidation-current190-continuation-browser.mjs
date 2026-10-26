// PRIVATE SOURCE SUCCESSOR. No import, constructor, QA or browser was executed
// by this proposal's author. SAME canonical190 transport/managed actors only.
// Phase A adds exactly ONE10-person/200-concept saved capture after an explicit
// creator action. Phase B substitutes ONE existing285-person confirmation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createOwnLiquidationHandler} from '../../api/internal-own-payroll-liquidation.js';
import {createOwnRunHandler} from '../../api/internal-own-payroll-run.js';
import {createEmploymentCatalogHandler} from '../../api/internal-employment-catalog.js';
import {createOwnProgramHandler} from '../../api/internal-own-payroll-program.js';
import {createInternalDataHandler} from '../../api/internal-data.js';
import {OWN_RUN_PREPARE,verifiedWorkspaceCapture} from '../../assets/own-payroll-run-workspace-model.js';
import {OWN_LIQ_REVIEW,verifiedOwnLiquidationDetail,verifiedOwnLiquidationReceipt} from '../../assets/own-payroll-liquidation-model.js';
import {OWN_RUN_FULL_JSON} from '../../assets/own-payroll-response.js';
import {ownLiquidationDecisionLink} from '../../assets/own-payroll-annulment-preparation-link.js';
import {createCanonical190BrowserHost,calculationPanelReads,PUBLIC_ROOT} from './own-payroll-canonical190-browser-host-qa.mjs';
const RUN='/api/internal-own-payroll-run',LIQ='/api/internal-own-payroll-liquidation';
const CAPTURE='SELECT public.own_run_capture_v1($1::jsonb,$2::jsonb,$3::uuid,$4::text) AS result';
const COMPLETE='SELECT public.own_run_complete_full_v1($1::jsonb,$2::uuid,$3::jsonb,$4::jsonb,$5::text) AS result';
const COMMAND='SELECT public.own_liquidation_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result';
const sorted=values=>[...values].sort(),sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const exact=(value,keys)=>assert.deepEqual(Reflect.ownKeys(value).sort(),sorted(keys));
const decisionReference=receipt=>Object.freeze({id:receipt.id,keyJsonSha256:sha(receipt.key),runId:receipt.runId,resultSha256:receipt.resultSha256,bodySha256:receipt.bodySha256,command:receipt.body.command,affectedCount:receipt.affected.length,affectedJsonSha256:sha(receipt.affected)});
const captureReference=capture=>Object.freeze({id:capture.id,keyJsonSha256:sha(capture.key),bodySha256:capture.bodySha256,payloadSha256:capture.payloadSha256,algorithmSha256:capture.algorithmSha256,inputSha256:capture.saved.inputSha256,resultSha256:capture.saved.resultSha256,employeeCount:capture.saved.result.employeeCount,conceptRowCount:capture.saved.result.rowCount});
const rawSha=bytes=>createHash('sha256').update(bytes).digest('hex');
const bytes=value=>Buffer.byteLength(JSON.stringify({ok:true,data:value}),'utf8');
const FULL=32*1024*1024;
const assets=Object.freeze(['own-payroll-liquidation-panel.js','own-payroll-liquidation-model.js','own-payroll-run-panel.js','own-payroll-run-workspace-model.js','own-payroll-annulment-preparation-link.js','payroll-navigation.js','own-payroll-readiness-model.js','own-payroll-response.js','native-salary-catalog-model.js','own-payroll-run-model.js','own-payroll-run-date.js','own-payroll-individual-panel.js']);
function bookend(){
 const pins=assets.map(file=>{const relative='assets/'+file,source=fs.readFileSync(path.join(PUBLIC_ROOT,relative));assert.deepEqual(fs.readFileSync(path.join(PUBLIC_ROOT,'public',relative)),source,'DECISION124_R2_BUILT_BYTES:'+relative);return{path:relative,sha256:rawSha(source)};});
 return{pins,after:()=>{for(const pin of pins){const source=fs.readFileSync(path.join(PUBLIC_ROOT,pin.path));assert.equal(rawSha(source),pin.sha256);assert.deepEqual(fs.readFileSync(path.join(PUBLIC_ROOT,'public',pin.path)),source);}}};
}
function base(context){
 exact(context,['h','db','qa','readSnapshot','readLedger','synthetic']);const{h,db,qa,readSnapshot,readLedger}=context;
 assert.strictEqual(h.qa,qa);assert.ok([17,18].includes(h.major));assert.match(h.sourceCommit,/^[a-f0-9]{40}$/);assert.equal(qa.operationalPairBaseline,'published107');assert.equal(context.synthetic,true);
 for(const value of[db.query,db.run,readSnapshot,readLedger])assert.equal(typeof value,'function');
}
function actor(value,required){
 exact(value,['principal','session','raw','roleKey']);assert.equal(value.principal.authorized,true);assert.equal(value.principal.session.mfa,true);assert.equal(value.session.id,value.raw.actorSessionId);assert.equal(value.principal.tenant.membershipId,value.raw.membershipId);assert.ok(required.every(cap=>value.principal.tenant.effectiveCapabilities.includes(cap)));
}
// Literal oracles for the unchanged, already approved20-rule190 programme.
// These are NOT constructed by product formatters or read from browser output.
function concept(row,items){
 let label,nature,value,kind;
 if(row.conceptCode==='1'){assert.equal(row.nature,'remuneration');assert.equal(row.unit,'money');assert.equal(row.amount,'100.20');label='Básico exclusivamente sintético posterior QA190';nature='Remunerativo';value='$ 100,20';kind='concept';}
 else if(row.conceptCode==='101'){assert.equal(row.nature,'auxiliary');assert.equal(row.unit,'units');assert.equal(row.amount,'10');label='Mes exclusivamente sintético posterior QA190';nature='Auxiliar';value='10 · Unidades';kind='auxiliary';}
 else{assert.match(row.conceptCode,/^7(?:0[0-9]|1[0-7])$/);assert.equal(row.nature,'remuneration');assert.equal(row.unit,'money');assert.equal(row.amount,'1.00');label='Concepto exclusivamente sintético M7 '+row.conceptCode;nature='Remunerativo';value='$ 1,00';kind='concept';}
 const definitions=items.filter(item=>item.kind===kind&&item.agreementCode===row.agreementCode&&item.code===row.conceptCode);assert.equal(definitions.length,1);assert.equal(definitions[0].label,label);assert.equal(definitions[0].nature,row.nature);assert.equal(definitions[0].unit,row.unit);
 return{label,value,cells:[row.employeeNumber,row.conceptCode+' · '+label,nature,value,row.ruleReference]};
}
function safeReport(context,version){return{version,passed:true,sourceCommit:context.h.sourceCommit,major:context.h.major,actualSql:true,actualApiHandler:true,actualHttp:true,actualBrowser:true,authenticationFixture:true,completeAuthenticationHandler:false,synthetic:true,productionWrites:0,paymentExecuted:false,municipalAcceptance:false};}
function noErrors(evidence){assert.deepEqual(evidence.pageErrors,[]);assert.deepEqual(evidence.serverErrors,[]);assert.deepEqual(evidence.external,[]);}

export async function verifyOwnDecision124CalculationRecoveryOn190(context,fixture){
 base(context);exact(fixture,['run','decision','contractIds','actors','reason']);exact(fixture.actors,['reviewer','creator','receiver']);
 const{h,db,qa,readSnapshot,readLedger}=context,{run,decision,contractIds,actors}=fixture;
 assert.equal(run.saved.result.employeeCount,855);assert.equal(run.saved.result.rowCount,17100);assert.equal(run.saved.input.rules.length,20);assert.equal(contractIds.length,10);assert.equal(new Set(contractIds).size,10);
 await verifiedOwnLiquidationReceipt(decision);assert.equal(decision.body.command,'annul');assert.equal(decision.runId,run.id);assert.equal(decision.resultSha256,run.saved.resultSha256);assert.deepEqual(sorted(decision.affected.map(row=>row.contractId)),sorted(contractIds));assert.ok(decision.affected.every(row=>row.state==='annulled'));
 actor(actors.creator,OWN_RUN_PREPARE);actor(actors.reviewer,OWN_LIQ_REVIEW);actor(actors.receiver,OWN_RUN_PREPARE);assert.ok(!actors.reviewer.principal.tenant.effectiveCapabilities.includes('payroll.calculation.prepare'));for(const cap of['payroll.calculation.approve','payroll.calculation.close'])assert.ok(!actors.creator.principal.tenant.effectiveCapabilities.includes(cap));
 assert.equal(new Set(Object.values(actors).map(row=>row.raw.membershipId)).size,3);
 const source=bookend(),checks=[],captureCalls=[],completeCalls=[],pagePosts=[],runAttempts=[],readFailures=[];let loss=false,completed=null,captured=null;
 const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
 const sql={query:async(statement,values)=>{
  if(statement===CAPTURE){const entry={key:values[2],body:JSON.parse(values[1])};captureCalls.push(entry);const result=await db.query(statement,values);captured=structuredClone(result?.[0]?.result);assert.ok(captured);return result;}
  if(statement===COMPLETE){completeCalls.push({captureId:values[1]});const result=await db.query(statement,values);completed=structuredClone(result?.[0]?.result);assert.ok(completed);if(loss){loss=false;throw Error('QA_DECISION124_CALCULATION_ACK_WITHHELD_AFTER_REAL_COMMIT');}return result;}
  // The finite db mapper is unchanged. This is only a narrower observation gate.
  if(/^SELECT public\.own_(?:run_capture|run_complete|liquidation_command|annul_command|close_command)/.test(statement))throw Error('DECISION124_R2_UNEXPECTED_WRITE');
  return db.query(statement,values);
 }};
 const reads=calculationPanelReads(db,qa.schema);
 const host=await createCanonical190BrowserHost({h,actors:new Map(Object.entries(actors)),getSql:async()=>sql,outputName:'liquidation124-calculation-recovery-browser',handlers:deps=>new Map([
  [LIQ,createOwnLiquidationHandler(deps)],[RUN,createOwnRunHandler(deps)],
  ['/api/internal-employment-catalog',createEmploymentCatalogHandler({...deps,getSql:async()=>reads})],
  ['/api/internal-own-payroll-program',createOwnProgramHandler({...deps,getSql:async()=>reads})],
  ['/api/internal-data',createInternalDataHandler({env:deps.env,requireCompatibleInternalAccess:deps.requireAccess,actionMutationSession:deps.sessionFor,getInternalSql:async()=>reads,getActionCenterSql:async()=>reads,reportReadFailure:error=>readFailures.push(String(error?.message??error))})]
 ])});
 const{origin,output,evidence}=host;let failure,result,recoveredCapture;
 try{
  const before=readSnapshot(),beforeLedger=await readLedger();assert.equal(beforeLedger.captures,12);assert.equal(beforeLedger.saved,12);assert.equal(beforeLedger.creators,2);
  const p=await host.open('creator'),page=p.page,$=key=>page.locator('[data-own-'+key+']'),liq=key=>page.locator('[data-liq-'+key+']');
  const settled=()=>page.waitForFunction(()=>document.querySelector('[data-own-status]')?.closest('.own-run')?.getAttribute('aria-busy')==='false',{}, {timeout:45000});
  const liqSettled=()=>page.waitForFunction(()=>document.querySelector('[data-liq-status]')?.closest('.own-liquidation')?.getAttribute('aria-busy')==='false',{}, {timeout:45000});
  page.on('request',request=>{const url=new URL(request.url());if(url.origin===origin&&request.method()==='POST'&&url.pathname.startsWith('/api/'))pagePosts.push({path:url.pathname,key:request.headers()['idempotency-key'],body:request.postDataJSON()});});
  page.on('response',response=>{const url=new URL(response.url());if(url.origin===origin&&url.pathname===RUN&&url.searchParams.get('resource')==='attempt')runAttempts.push({status:response.status(),key:url.searchParams.get('key')});});
  const firstDetail=page.waitForResponse(response=>{const url=new URL(response.url());return url.origin===origin&&url.pathname===LIQ&&url.searchParams.get('resource')==='detail'&&url.searchParams.get('id')===run.id;});
  const link=origin+ownLiquidationDecisionLink(run.id,decision.id);assert.ok(!link.includes(decision.key));await page.goto(link);assert.equal((await firstDetail).status(),200);await settled();
  const people=run.saved.input.employees.filter(row=>contractIds.includes(row.contractId)),expectedNumbers=sorted(people.map(row=>row.employeeNumber));
  assert.equal(people.length,10);assert.deepEqual(sorted(await $('chips').locator('span > span').evaluateAll(nodes=>nodes.map(node=>node.textContent.trim().replace(/^Legajo /,'').replace(/ · .*$/,'')))),expectedNumbers);
  for(const[field,value]of[['period',run.body.period],['date',run.body.liquidationDate],['type','monthly'],['kind','contracts']])assert.equal(await $(field).inputValue(),value);
  assert.equal(await $('readiness').getAttribute('data-state'),'success');assert.ok((await $('readiness-facts').innerText()).includes('855 legajos propios'));assert.equal(await $('confirm').isChecked(),false);assert.equal(await $('send').isDisabled(),true);
  assert.deepEqual(readSnapshot(),before);assert.deepEqual(await readLedger(),beforeLedger);assert.equal(pagePosts.length,0);assert.equal(captureCalls.length,0);
  check(true,'creator obtains the exact10-person unconfirmed draft from the opaque124 decision with her own session and no write');
  // Preserve legacy date-shortcut behaviour with a real date, then choose the
  // original date again explicitly. Neither act grants consent or writes.
  await $('period-end').click();assert.equal(await $('date').inputValue(),'2026-10-31');assert.equal(await $('confirm').isChecked(),false);
  assert.ok(await $('period-end').evaluate(el=>el.getBoundingClientRect().height>=44));assert.equal(await $('date').evaluate(el=>el.labels.length===1&&el.getAttribute('aria-describedby')==='ownRunDateHelp'),true);
  await $('date').fill(run.body.liquidationDate);assert.equal(await $('confirm').isChecked(),false);assert.deepEqual(readSnapshot(),before);
  const postResponse=page.waitForResponse(response=>response.request().method()==='POST'&&response.url()===origin+RUN);loss=true;await $('confirm').check();assert.equal(await $('send').isDisabled(),false);await $('send').click();assert.equal((await postResponse).status(),503);await settled();
  assert.equal(loss,false);assert.equal(captureCalls.length,1);assert.equal(completeCalls.length,1);assert.equal(pagePosts.length,1);assert.equal(pagePosts[0].path,RUN);assert.equal(pagePosts[0].key,captureCalls[0].key);assert.deepEqual(pagePosts[0].body,{operation:'calculate',payload:captureCalls[0].body});
  const pending=structuredClone(captureCalls[0]);assert.equal(pending.body.version,'own-payroll-run-command.v2');assert.equal(pending.body.populationDomain,'native_registered');assert.equal(pending.body.liquidationDate,run.body.liquidationDate);assert.equal(pending.body.period,run.body.period);assert.equal(pending.body.liquidationType,'monthly');assert.deepEqual(pending.body.selection,{kind:'contracts',values:sorted(contractIds)});assert.equal(Object.hasOwn(pending.body,'sourceReference'),false);assert.notEqual(pending.key,decision.key);assert.notEqual(pending.key,run.key);
  assert.equal(captured.key,pending.key);assert.equal(completed.input.employees.length,10);assert.equal(completed.result.rowCount,200);
  assert.equal(await $('result').isHidden(),true);assert.equal(await $('recover').isVisible(),true);assert.equal(await $('fields').isDisabled(),true);
  const committedSnapshot=readSnapshot(),committedLedger=await readLedger();assert.deepEqual(committedLedger,{...beforeLedger,captures:13,saved:13});assert.notDeepEqual(committedSnapshot,before);
  check(true,'one explicit real calculate stores exactly one10-person capture/result before withholding its completion acknowledgement');
  // A tampered DOM date cannot replace the attempt. Navigating to the old run
  // and back preserves the pending calculation and sends no second POST.
  const changedDate=run.body.liquidationDate==='2026-10-15'?'2026-10-20':'2026-10-15';await $('date').evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));},changedDate);
  await page.getByRole('tab',{name:'Confirmar y anular',exact:true}).click();await liq('history').locator('[data-liq-run-id="'+run.id+'"]').waitFor({state:'visible'});await liqSettled();await liq('history').locator('[data-liq-run-id="'+run.id+'"]').click();await liq('detail').waitFor({state:'visible'});await liqSettled();
  // With creator-only rights the reviewer receipt is intentionally unavailable;
  // navigation back to Calcular must retain the original pending body and key.
  await page.getByRole('tab',{name:'Calcular',exact:true}).click();await settled();assert.equal(await $('result').isHidden(),true);assert.equal(await $('fields').isDisabled(),true);assert.equal(pagePosts.length,1);assert.equal(captureCalls.length,1);assert.equal(completeCalls.length,1);
  const recoveryResponse=page.waitForResponse(response=>{const url=new URL(response.url());return url.origin===origin&&url.pathname===RUN&&url.searchParams.get('resource')==='attempt'&&url.searchParams.get('key')===pending.key;});await $('recover').click();assert.equal((await recoveryResponse).status(),200);await $('result').waitFor({state:'visible'});await settled();
  assert.equal(await $('date').inputValue(),pending.body.liquidationDate);assert.equal(await $('send').isHidden(),true);assert.equal(pagePosts.length,1);assert.deepEqual(captureCalls,[pending]);assert.equal(completeCalls.length,1);assert.deepEqual(readSnapshot(),committedSnapshot);assert.deepEqual(await readLedger(),committedLedger);assert.ok(runAttempts.some(row=>row.status===200&&row.key===pending.key));
  const response=await p.request(RUN+'?resource=attempt&key='+pending.key,{headers:{Accept:OWN_RUN_FULL_JSON}});assert.equal(response.response.status(),200);assert.equal(response.response.headers()['content-type'].split(';')[0],OWN_RUN_FULL_JSON);assert.equal(Number(response.response.headers()['x-municontrol-json-bytes']),Buffer.byteLength(JSON.stringify(response.body),'utf8'));
  recoveredCapture=await verifiedWorkspaceCapture(response.body.data,{key:pending.key,body:pending.body});assert.equal(recoveredCapture.replayed,true);assert.equal(recoveredCapture.id,captured.id);assert.deepEqual(recoveredCapture.body,pending.body);assert.deepEqual(recoveredCapture.saved,completed);assert.ok(bytes(recoveredCapture)<=FULL);
  const selected=new Set(contractIds);assert.deepEqual(recoveredCapture.saved.result.rows,run.saved.result.rows.filter(row=>selected.has(row.contractId)));assert.deepEqual(recoveredCapture.saved.result.employeeTotals,run.saved.result.employeeTotals.filter(row=>selected.has(row.contractId)));assert.deepEqual(recoveredCapture.saved.input.rules,run.saved.input.rules);assert.deepEqual(sorted(recoveredCapture.saved.input.employees.map(row=>row.contractId)),sorted(contractIds));
  check(true,'GET of the original key recovers identical stored hashes/date/body/result without another calculation or duplicate rows');
  // Compare all200 concept rows (8 complete pages) with literal descriptions,
  // units, exact amounts and source references despite a filter with no match.
  assert.equal(await $('totals').locator('tr').count(),10);const resultRows=recoveredCapture.saved.result.rows,items=recoveredCapture.payload.programState.salaryCatalog.items;
  for(let n=0;n<8;n++){assert.equal((await $('page').innerText()).trim(),'Página '+(n+1)+' de 8');assert.deepEqual(await $('rows').locator('tr').evaluateAll(rows=>rows.map(row=>[...row.cells].map(cell=>cell.textContent))),resultRows.slice(n*25,(n+1)*25).map(row=>concept(row,items).cells));if(n<7)await $('next').click();else assert.equal(await $('next').isDisabled(),true);}
  await $('search').fill('no-recovered-concept-match');assert.equal(await $('rows').locator('tr').count(),0);const contractId=contractIds[0];await $('totals').locator('[data-own-individual-open="'+contractId+'"]').click();await settled();
  const individual=$('individual'),ownRows=resultRows.filter(row=>row.contractId===contractId),entries=individual.locator('[data-individual-concepts] li');assert.equal(await entries.count(),20);
  for(const[n,row]of ownRows.entries()){const literal=concept(row,items);assert.equal(await entries.nth(n).locator('h5').textContent(),'Concepto '+row.conceptCode+' · '+literal.label);assert.equal(await entries.nth(n).locator('.own-individual-amount').textContent(),literal.value);assert.equal(await entries.nth(n).locator('details p').textContent(),row.ruleReference);}
  assert.ok((await individual.locator('[data-individual-state]').innerText()).includes('Pendiente de confirmación'));assert.equal((await individual.locator('[data-individual-amount="net"]').innerText()).trim(),'$ 118,20');
  const reviewResponse=page.waitForResponse(response=>{const url=new URL(response.url());return url.origin===origin&&url.pathname===LIQ&&url.searchParams.get('resource')==='detail'&&url.searchParams.get('id')===recoveredCapture.id;});await $('review').click();assert.equal((await reviewResponse).status(),200);await liq('detail').waitFor({state:'visible'});await liqSettled();assert.deepEqual(await liq('values').locator('option:checked').evaluateAll(options=>options.map(option=>option.value)),[contractId]);assert.ok((await liq('individual').locator('[data-individual-state]').innerText()).includes('Pendiente de confirmación'));
  for(const width of[1366,390,320]){await page.setViewportSize({width,height:1100});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(output,'recovered-'+width+'.png'),fullPage:true});}
  if(!await liq('totals').evaluate(el=>el.closest('details').open))await page.getByText('Ver estados y totales de todos los legajos',{exact:true}).click();
  const close=liq('individual').locator('[data-individual-close]');await close.focus();await page.keyboard.press('Escape');assert.equal(await liq('individual').isHidden(),true);assert.equal(await page.locator(':focus').getAttribute('data-liq-individual-open'),contractId);
  await liq('totals').locator('[data-liq-individual-open="'+contractId+'"]').click();await liqSettled();await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:[]}})));assert.equal(await liq('individual').isHidden(),true);assert.equal(await liq('individual').innerText(),'');
  assert.equal(pagePosts.length,1);assert.deepEqual(captureCalls,[pending]);assert.equal(completeCalls.length,1);assert.deepEqual(readSnapshot(),committedSnapshot);assert.deepEqual(await readLedger(),committedLedger);assert.deepEqual(readFailures,[]);noErrors(evidence);source.after();
  check(true,'recovered partial capture remains pending, keeps all200 descriptions and can be reviewed without a new decision; mobile and withdrawal retire nominal detail');
  result={...safeReport(context,'own-decision124-calculation-recovery-live190-browser.v1'),checks,sourceBookend:source.pins,httpEvidence:evidence.httpEvidence,affected:10,captureReference:captureReference(recoveredCapture),conceptRows:200,conceptPages:8,pagePosts:1,captureRpcCalls:1,completionRpcCalls:1,addedCaptures:1,addedSavedResults:1,addedLiquidationDecisions:0,addedCloseEvents:0,before:beforeLedger,after:committedLedger,calculationContinuationProven:true,lostCalculationAcknowledgementProven:true,pendingAttemptSurvivesTaskChange:true,originalDateRestored:true,recoveryAddedRows:0,sourceReferenceStored:false,atomicGetToCalculation:false,durableReceiptLinkCreated:false,automaticRecalculation:false,allLegacyDecisionUiCasesCovered:false,sqlLevelRevocation:false};
 }catch(error){failure=error;fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({passed:false,message:error.message,checks,pagePosts,captureCalls,completionCalls:completeCalls.length,lossStillArmed:loss,pageErrors:evidence.pageErrors,serverErrors:evidence.serverErrors,readFailures,synthetic:true},null,2)+'\n',{flag:'wx'});}
 finally{try{await host.close();}catch(error){if(!failure)failure=error;}}
 if(failure)throw failure;fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});return Object.freeze({...result,capture:recoveredCapture});
}

export async function verifyOwnDepartmentConfirmationOn190(context,fixture){
 base(context);exact(fixture,['run','actors','reason']);exact(fixture.actors,['reviewer','creator']);const{h,db,readSnapshot,readLedger}=context,{run,actors,reason}=fixture;
 actor(actors.reviewer,OWN_LIQ_REVIEW);actor(actors.creator,OWN_RUN_PREPARE);assert.notEqual(actors.creator.raw.membershipId,actors.reviewer.raw.membershipId);assert.ok(!actors.reviewer.principal.tenant.effectiveCapabilities.includes('payroll.calculation.prepare'));
 assert.equal(run.saved.result.employeeCount,285);assert.equal(run.saved.result.rowCount,5700);assert.ok(run.saved.input.employees.every(row=>row.departmentCode==='1'));assert.equal(run.saved.input.rules.length,20);
 const source=bookend(),checks=[],posts=[],pagePosts=[];let receipt=null;const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
 const sql={query:async(statement,values)=>{if(statement!==COMMAND){if(/^SELECT public\.own_(?:run_capture|run_complete|annul_command|close_command)/.test(statement))throw Error('DEPARTMENT190_UNEXPECTED_WRITE');return db.query(statement,values);}const result=await db.query(statement,values);posts.push({key:values[2],body:JSON.parse(values[1]),receipt:result?.[0]?.result});return result;}};
 const host=await createCanonical190BrowserHost({h,actors:new Map(Object.entries(actors)),getSql:async()=>sql,outputName:'liquidation124-positive-department-browser',handlers:deps=>new Map([[LIQ,createOwnLiquidationHandler(deps)]])});
 const{origin,output,evidence}=host;let result,failure;
 try{
  const before=readSnapshot(),beforeLedger=await readLedger(),r=await host.open('reviewer'),page=r.page,$=key=>page.locator('[data-liq-'+key+']');const settled=()=>page.waitForFunction(()=>document.querySelector('[data-liq-status]')?.closest('.own-liquidation')?.getAttribute('aria-busy')==='false',{}, {timeout:45000});
  page.on('request',request=>{const url=new URL(request.url());if(url.origin===origin&&request.method()==='POST'&&url.pathname.startsWith('/api/'))pagePosts.push(url.pathname);});
  const read=async(relative)=>{const response=await r.request(relative,{headers:{Accept:OWN_RUN_FULL_JSON}});assert.equal(response.response.status(),200);return response.body.data;};
  const detail=await verifiedOwnLiquidationDetail(await read(LIQ+'?resource=detail&id='+run.id));assert.deepEqual(detail.capture.saved,run.saved);assert.equal(detail.employees.length,285);assert.ok(detail.employees.every(row=>row.state==='calculated'&&row.blockedBy===null&&row.allowedCommands.includes('confirm')));
  await page.goto(origin+'/nomina-control.html#decisiones');await $('history').locator('[data-liq-run-id="'+run.id+'"]').waitFor({state:'visible'});await settled();await $('history').locator('[data-liq-run-id="'+run.id+'"]').click();await $('detail').waitFor({state:'visible'});await settled();
  await $('command').selectOption('confirm');await $('kind').selectOption('departments');assert.deepEqual(await $('values').locator('option').evaluateAll(options=>options.map(option=>[option.value,option.textContent])),[['1','Repartición 1']]);await $('values').selectOption('1');await $('reason').fill(reason);
  assert.equal(await $('confirm').isChecked(),false);assert.equal(await $('send').isDisabled(),true);assert.ok((await $('scope').innerText()).includes('285 legajos del alcance completo. Todos admiten esta decisión.'));
  const people=new Map(run.saved.input.employees.map(row=>[row.contractId,row])),reviewPeople=detail.employees.map(row=>people.get(row.contractId)),seen=[];
  for(let n=0;n<12;n++){const expected=reviewPeople.slice(n*25,(n+1)*25).map(row=>[row.employeeNumber,row.agreementCode,'1','Pendiente de confirmación','$ 118,20','$ 0,00','$ 118,20','Admite la decisión']);assert.equal((await $('review-page').innerText()).trim(),(n+1)+' / 12');const actual=await $('review-rows').locator('tr').evaluateAll(rows=>rows.map(row=>[...row.cells].map(cell=>cell.textContent)));assert.deepEqual(actual,expected);seen.push(...actual.map(row=>row[0]));if(n<11)await $('review-next').click();else assert.equal(await $('review-next').isDisabled(),true);}
  assert.equal(seen.length,285);assert.equal(new Set(seen).size,285);const originalTotals=await $('review-totals').innerText();assert.ok(originalTotals.includes('$ 33.687,00'));await $('review-search').fill('no-department-row-match');assert.equal(await $('review-rows').locator('tr').count(),1);assert.equal(await $('review-totals').innerText(),originalTotals);assert.ok((await $('review-range').innerText()).includes('285 afectados'));
  assert.deepEqual(readSnapshot(),before);assert.deepEqual(await readLedger(),beforeLedger);assert.equal(pagePosts.length,0);assert.equal(posts.length,0);await $('confirm').check();assert.equal(await $('send').isDisabled(),false);
  const response=page.waitForResponse(value=>value.request().method()==='POST'&&value.url()===origin+LIQ);await $('send').click();assert.equal((await response).status(),201);await settled();assert.equal(pagePosts.length,1);assert.deepEqual(pagePosts,[LIQ]);assert.equal(posts.length,1);
  receipt=await verifiedOwnLiquidationReceipt(posts[0].receipt);assert.equal(receipt.replayed,false);assert.equal(receipt.body.command,'confirm');assert.deepEqual(receipt.body.selection,{kind:'departments',values:['1']});assert.equal(receipt.runId,run.id);assert.equal(receipt.resultSha256,run.saved.resultSha256);assert.equal(receipt.affected.length,285);assert.deepEqual(sorted(receipt.affected.map(row=>row.contractId)),sorted([...people.keys()]));assert.ok(receipt.affected.every(row=>row.state==='confirmed'));
  assert.ok((await $('status').innerText()).includes('Confirmar: 285 legajos registrados'));const committed=readSnapshot(),afterLedger=await readLedger();assert.deepEqual(afterLedger,{...beforeLedger,liquidationEvents:beforeLedger.liquidationEvents+1});
  const current=await verifiedOwnLiquidationDetail(await read(LIQ+'?resource=detail&id='+run.id));assert.deepEqual(current.capture.saved,run.saved);assert.ok(current.employees.every(row=>row.state==='confirmed'));const affected=new Map(receipt.affected.map(row=>[row.contractId,row]));for(const row of current.employees){assert.equal(row.version,affected.get(row.contractId).version);assert.equal(row.liquidationVersion,affected.get(row.contractId).liquidationVersion);}
  await $('recover').click();await settled();const replay=await verifiedOwnLiquidationReceipt(await read(LIQ+'?resource=attempt&key='+receipt.key));assert.deepEqual(replay,{...receipt,replayed:true});assert.deepEqual(readSnapshot(),committed);assert.deepEqual(await readLedger(),afterLedger);assert.equal(pagePosts.length,1);assert.equal(posts.length,1);assert.equal(await $('recalculate').isDisabled(),true);
  noErrors(evidence);source.after();check(true,'legitimate complete department285/5700 confirms from12 fully compared review pages with one event and exact GET recovery');
  result={...safeReport(context,'own-department-confirmation-live190-browser.v1'),checks,sourceBookend:source.pins,httpEvidence:evidence.httpEvidence,runIdJsonSha256:sha(run.id),decisionReference:decisionReference(receipt),population:285,conceptRows:5700,reviewPages:12,pagePosts:1,decisionRpcCalls:1,addedCaptures:0,addedSavedResults:0,addedLiquidationDecisions:1,addedCloseEvents:0,before:beforeLedger,after:afterLedger,positiveDepartmentConfirmationProven:true,recoveryAddedRows:0,reviewerPrepareGranted:false,allLegacyDecisionUiCasesCovered:false};
 }catch(error){failure=error;fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({passed:false,message:error.message,checks,pagePosts,decisionRpcCalls:posts.length,pageErrors:evidence.pageErrors,serverErrors:evidence.serverErrors,synthetic:true},null,2)+'\n',{flag:'wx'});}
 finally{try{await host.close();}catch(error){if(!failure)failure=error;}}
 if(failure)throw failure;fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});return Object.freeze({...result,receipt});
}
