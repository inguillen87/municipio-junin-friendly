// PRIVATE SOURCE CANDIDATE. No application, constructor, parser or browser was executed.
// Port of legacy liquidation-ui annul/agreements + loss-before-SQL recovery.
// Runs only after the existing SAME190 285-person capture is wholly confirmed.
// Adds ONE actual liquidation decision; caller explicitly reconfirms afterward.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createOwnLiquidationHandler} from '../../api/internal-own-payroll-liquidation.js';
import {OWN_LIQ_REVIEW,verifiedOwnLiquidationDetail,verifiedOwnLiquidationReceipt} from '../../assets/own-payroll-liquidation-model.js';
import {OWN_RUN_FULL_JSON} from '../../assets/own-payroll-response.js';
import {createCanonical190BrowserHost,PUBLIC_ROOT} from './own-payroll-canonical190-browser-host-qa.mjs';
const ENDPOINT='/api/internal-own-payroll-liquidation';
const COMMAND='SELECT public.own_liquidation_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result';
const sorted=values=>[...values].sort(),sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rawSha=bytes=>createHash('sha256').update(bytes).digest('hex');
const exact=(value,keys)=>assert.deepEqual(Reflect.ownKeys(value).sort(),sorted(keys));
const assets=Object.freeze(['own-payroll-liquidation-panel.js','own-payroll-liquidation-model.js','own-payroll-run-workspace-model.js','own-payroll-run-model.js','own-payroll-response.js','own-payroll-individual-panel.js','native-salary-catalog-model.js']);
function sourceBookend(){
 const pins=assets.map(file=>{const relative='assets/'+file,bytes=fs.readFileSync(path.join(PUBLIC_ROOT,relative));assert.deepEqual(fs.readFileSync(path.join(PUBLIC_ROOT,'public',relative)),bytes,'AGREEMENT190_BUILT_SOURCE_CHANGED:'+relative);return{path:relative,sha256:rawSha(bytes)};});
 return{pins,after:()=>{for(const pin of pins){const bytes=fs.readFileSync(path.join(PUBLIC_ROOT,pin.path));assert.equal(rawSha(bytes),pin.sha256);assert.deepEqual(fs.readFileSync(path.join(PUBLIC_ROOT,'public',pin.path)),bytes);}}};
}
export async function verifyOwnAgreementAnnulmentRecoveryOn190(context,fixture){
 exact(context,['h','db','qa','readSnapshot','readLedger','synthetic']);
 const{h,db,qa,readSnapshot,readLedger}=context;assert.strictEqual(h.qa,qa);assert.ok([17,18].includes(h.major));assert.match(h.sourceCommit,/^[a-f0-9]{40}$/);assert.equal(qa.operationalPairBaseline,'published107');assert.equal(context.synthetic,true);
 for(const value of[db.query,db.run,readSnapshot,readLedger])assert.equal(typeof value,'function');
 exact(fixture,['run','detailBefore','actors','reason']);exact(fixture.actors,['reviewer','creator']);
 const{run,detailBefore,actors,reason}=fixture;assert.ok(typeof reason==='string'&&reason.length>=10);
 for(const actor of Object.values(actors)){exact(actor,['principal','session','raw','roleKey']);assert.equal(actor.principal.authorized,true);assert.equal(actor.principal.session.mfa,true);assert.equal(actor.session.id,actor.raw.actorSessionId);assert.equal(actor.principal.tenant.membershipId,actor.raw.membershipId);}
 assert.ok(OWN_LIQ_REVIEW.every(cap=>actors.reviewer.principal.tenant.effectiveCapabilities.includes(cap)));assert.ok(!actors.reviewer.principal.tenant.effectiveCapabilities.includes('payroll.calculation.prepare'));
 assert.notEqual(actors.reviewer.raw.membershipId,actors.creator.raw.membershipId);assert.equal(run.saved.result.employeeCount,285);assert.equal(run.saved.result.rowCount,5700);assert.equal(run.saved.input.rules.length,20);
 assert.equal(run.body.period,'2026-10');assert.equal(run.body.liquidationType,'monthly');assert.equal(run.body.liquidationDate,'2026-10-15');
 const people=new Map(run.saved.input.employees.map(row=>[row.contractId,row]));assert.equal(people.size,285);assert.ok([...people.values()].every(row=>row.agreementCode==='1'&&row.departmentCode==='1'));
 await verifiedOwnLiquidationDetail(detailBefore);assert.equal(detailBefore.id,run.id);assert.deepEqual(detailBefore.capture.saved,run.saved);assert.equal(detailBefore.employees.length,285);
 assert.deepEqual(sorted(detailBefore.employees.map(row=>row.contractId)),sorted([...people.keys()]));
 assert.ok(detailBefore.employees.every(row=>row.state==='confirmed'&&row.blockedBy===null&&row.allowedCommands.includes('annul')),'AGREEMENT190_REQUIRES_ENTIRE_CONFIRMED_UNCLOSED_CAPTURE');
 const priorById=new Map(detailBefore.employees.map(row=>[row.contractId,structuredClone(row)]));
 for(const total of run.saved.result.employeeTotals)assert.deepEqual({gross:total.gross,deduction:total.deduction,net:total.net},{gross:'118.20',deduction:'0.00',net:'118.20'});
 const source=sourceBookend(),checks=[],posts=[],pagePosts=[],attemptReads=[];let loseBefore=false;
 const check=(condition,label)=>{assert.ok(condition,label);checks.push(label);};
 const sql={query:async(statement,values)=>{
  if(statement!==COMMAND){if(/^SELECT public\.own_(?:run_capture|run_complete|annul_command|close_command)/.test(statement))throw Error('AGREEMENT190_UNEXPECTED_WRITE');return db.query(statement,values);}
  const post={key:values[2],body:JSON.parse(values[1]),reachedSql:false,receipt:null};posts.push(post);
  assert.equal(post.body.command,'annul');assert.equal(post.body.runId,run.id);assert.deepEqual(post.body.selection,{kind:'agreements',values:['1']});
  if(loseBefore){loseBefore=false;throw Error('QA_AGREEMENT190_UNSENT_BEFORE_SQL');}
  post.reachedSql=true;const response=await db.query(statement,values);post.receipt=structuredClone(response?.[0]?.result);return response;
 }};
 const host=await createCanonical190BrowserHost({h,actors:new Map(Object.entries(actors)),getSql:async()=>sql,outputName:'liquidation190-positive-agreement-loss-before-browser',handlers:deps=>new Map([[ENDPOINT,createOwnLiquidationHandler(deps)]])});
 const{origin,output,evidence}=host;let result,failure,receipt;
 try{
  const before=readSnapshot(),beforeLedger=await readLedger();assert.equal(beforeLedger.captures,17);assert.equal(beforeLedger.saved,15);assert.equal(beforeLedger.creators,3);
  const r=await host.open('reviewer'),page=r.page,$=key=>page.locator('[data-liq-'+key+']');
  const settled=()=>page.waitForFunction(()=>document.querySelector('[data-liq-status]')?.closest('.own-liquidation')?.getAttribute('aria-busy')==='false',{}, {timeout:45000});
  page.on('request',request=>{const url=new URL(request.url());if(url.origin===origin&&request.method()==='POST'&&url.pathname.startsWith('/api/'))pagePosts.push(url.pathname);});
  page.on('response',response=>{const url=new URL(response.url());if(url.origin===origin&&url.pathname===ENDPOINT&&url.searchParams.get('resource')==='attempt')attemptReads.push({status:response.status(),keySha256:sha(url.searchParams.get('key'))});});
  const get=async relative=>r.request(relative,{headers:{Accept:OWN_RUN_FULL_JSON}});
  await page.goto(origin+'/nomina-control.html#decisiones');await $('history').locator('[data-liq-run-id="'+run.id+'"]').waitFor({state:'visible'});await settled();await $('history').locator('[data-liq-run-id="'+run.id+'"]').click();await $('detail').waitFor({state:'visible'});await settled();
  const detailResponse=await get(ENDPOINT+'?resource=detail&id='+run.id);assert.equal(detailResponse.response.status(),200);assert.equal(detailResponse.body.ok,true);assert.deepEqual(await verifiedOwnLiquidationDetail(detailResponse.body.data),detailBefore);
  assert.ok((await $('summary').innerText()).includes('285 legajos'));assert.ok((await $('summary').innerText()).includes('5700 conceptos calculados'));assert.deepEqual(readSnapshot(),before);assert.deepEqual(await readLedger(),beforeLedger);assert.equal(posts.length,0);
  await $('command').selectOption('annul');await $('kind').selectOption('agreements');assert.deepEqual(await $('values').locator('option').evaluateAll(options=>options.map(option=>option.value)),['1']);await $('values').selectOption(['1']);await $('reason').fill(reason);
  assert.equal(await $('confirm').isChecked(),false);assert.equal(await $('send').isDisabled(),true);assert.ok((await $('scope').innerText()).includes('285 legajos del alcance completo. Todos admiten esta decisión.'));
  const reviewPeople=detailBefore.employees.map(row=>people.get(row.contractId)),seen=[];
  for(let n=0;n<12;n++){
   const expected=reviewPeople.slice(n*25,(n+1)*25).map(row=>[row.employeeNumber,'1','1','Confirmada','$ 118,20','$ 0,00','$ 118,20','Admite la decisión']);
   assert.equal((await $('review-page').innerText()).trim(),(n+1)+' / 12');const actual=await $('review-rows').locator('tr').evaluateAll(rows=>rows.map(row=>[...row.cells].map(cell=>cell.textContent)));assert.deepEqual(actual,expected);seen.push(...actual.map(row=>row[0]));if(n<11)await $('review-next').click();else assert.equal(await $('review-next').isDisabled(),true);
  }
  assert.equal(seen.length,285);assert.equal(new Set(seen).size,285);assert.deepEqual(sorted(seen),sorted([...people.values()].map(row=>row.employeeNumber)));
  const totals=await $('review-totals').innerText();assert.ok(totals.includes('$ 33.687,00'));await $('review-search').fill('no-agreement-person-match');assert.equal(await $('review-rows').locator('tr').count(),1);assert.ok((await $('review-range').innerText()).includes('285 afectados'));assert.equal(await $('review-totals').innerText(),totals);await $('review-search').fill('');
  await $('confirm').check();loseBefore=true;await $('send').click();await settled();assert.equal(posts.length,1);assert.equal(posts[0].reachedSql,false);assert.equal(posts[0].receipt,null);const frozen=structuredClone({key:posts[0].key,body:posts[0].body});
  assert.deepEqual(frozen.body,{runId:detailBefore.id,resultSha256:run.saved.resultSha256,scopeVersion:detailBefore.scopeVersion,stateVersion:detailBefore.stateVersion,command:'annul',selection:{kind:'agreements',values:['1']},reason,reviewConfirmed:true});
  assert.deepEqual(readSnapshot(),before);assert.deepEqual(await readLedger(),beforeLedger);assert.equal(await $('recover').isVisible(),true);
  const missing=await get(ENDPOINT+'?resource=attempt&key='+frozen.key);assert.equal(missing.response.status(),404);assert.equal(missing.body.code,'OWN_LIQ_NOT_FOUND');assert.deepEqual(readSnapshot(),before);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});assert.equal(await $('detail').isHidden(),true);assert.equal(await $('totals').innerText(),'');assert.equal(await $('review-rows').locator('tr').count(),0);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});await $('refresh').click();await settled();await $('recover').click();await settled();assert.equal(await $('revise').isVisible(),true);assert.equal(await $('send').isEnabled(),true);assert.deepEqual(readSnapshot(),before);assert.deepEqual(await readLedger(),beforeLedger);
  await $('reason').evaluate(element=>{element.value='DOM edit cannot replace the original agreement annulment reason';element.dispatchEvent(new Event('input',{bubbles:true}));});
  await $('send').click();await settled();assert.equal(posts.length,2);assert.equal(posts[1].reachedSql,true);assert.deepEqual({key:posts[1].key,body:posts[1].body},frozen);
  receipt=await verifiedOwnLiquidationReceipt(posts[1].receipt);assert.equal(receipt.replayed,false);assert.equal(receipt.key,frozen.key);assert.deepEqual(receipt.body,frozen.body);assert.equal(receipt.runId,run.id);assert.equal(receipt.resultSha256,run.saved.resultSha256);assert.equal(receipt.affected.length,285);assert.deepEqual(sorted(receipt.affected.map(row=>row.contractId)),sorted([...people.keys()]));
  for(const row of receipt.affected){const prior=priorById.get(row.contractId);assert.equal(row.state,'annulled');assert.equal(row.version,prior.version+1);assert.equal(row.liquidationVersion,prior.liquidationVersion);}
  const committed=readSnapshot(),afterLedger=await readLedger();assert.deepEqual(afterLedger,{...beforeLedger,liquidationEvents:beforeLedger.liquidationEvents+1});assert.notDeepEqual(committed,before);assert.ok((await $('status').innerText()).includes('285 legajos registrados'));
  const recovery=await get(ENDPOINT+'?resource=attempt&key='+frozen.key);assert.equal(recovery.response.status(),200);assert.equal(recovery.body.ok,true);assert.deepEqual(await verifiedOwnLiquidationReceipt(recovery.body.data),{...receipt,replayed:true});assert.deepEqual(readSnapshot(),committed);assert.deepEqual(await readLedger(),afterLedger);
  const afterDetail=await get(ENDPOINT+'?resource=detail&id='+run.id);assert.equal(afterDetail.response.status(),200);const checked=await verifiedOwnLiquidationDetail(afterDetail.body.data);assert.deepEqual(checked.capture.saved,run.saved);assert.ok(checked.employees.every(row=>row.state==='annulled'));for(const row of checked.employees){const event=receipt.affected.find(value=>value.contractId===row.contractId);assert.equal(row.version,event.version);assert.equal(row.liquidationVersion,event.liquidationVersion);}
  assert.deepEqual(pagePosts,[ENDPOINT,ENDPOINT]);assert.equal(posts.filter(post=>post.reachedSql).length,1);assert.ok(attemptReads.some(row=>row.status===404));
  for(const width of[390,320]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await $('next-decision').scrollIntoViewIfNeeded();assert.ok((await $('next-decision').boundingBox())?.height>=44);await page.screenshot({path:path.join(output,'agreement-after-'+width+'.png'),fullPage:true});}
  assert.deepEqual(evidence.pageErrors,[]);assert.deepEqual(evidence.serverErrors,[]);assert.deepEqual(evidence.external,[]);source.after();check(true,'the complete confirmed agreement285/5700 annuls after a proven absent pre-SQL attempt; hide/restore and DOM edits preserve the original key/body, and GET adds no event');
  result={version:'own-agreement-annulment-loss-before-live190-browser.v1',passed:true,sourceCommit:h.sourceCommit,major:h.major,checks,sourceBookend:source.pins,httpEvidence:evidence.httpEvidence,runIdSha256:sha(run.id),captureReference:{id:run.id,bodySha256:run.bodySha256,payloadSha256:run.payloadSha256,inputSha256:run.saved.inputSha256,resultSha256:run.saved.resultSha256,employeeCount:285,rowCount:5700},decisionReference:{id:receipt.id,bodySha256:receipt.bodySha256,runId:receipt.runId,resultSha256:receipt.resultSha256,affectedCount:receipt.affected.length},population:285,conceptRows:5700,agreementCode:'1',reviewPages:12,reviewedUniqueEmployees:285,pagePosts:2,decisionRpcAttempts:2,decisionRpcReachedSql:1,addedCaptures:0,addedSavedResults:0,addedLiquidationDecisions:1,addedConsolidatedAnnulments:0,addedCloseEvents:0,before:beforeLedger,after:afterLedger,positiveAgreementAnnulmentProven:true,lostBeforeSqlRecovered:true,originalBodyAndKeyRetained:true,hiddenNominalDataCleared:true,recoveryAddedRows:0,reviewerPrepareGranted:false,allLegacyDecisionUiCasesCovered:false,actualSql:true,actualApiHandler:true,actualHttp:true,actualBrowser:true,authenticationFixture:true,completeAuthenticationHandler:false,synthetic:true,productionWrites:0,paymentExecuted:false,municipalAcceptance:false};
 }catch(error){failure=error;fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({passed:false,message:error.message,checks,pagePosts,decisionRpcAttempts:posts.length,decisionRpcReachedSql:posts.filter(post=>post.reachedSql).length,pageErrors:evidence.pageErrors,serverErrors:evidence.serverErrors,synthetic:true},null,2)+'\n',{flag:'wx'});}
 finally{try{await host.close();}catch(error){if(!failure)failure=error;}}
 if(failure)throw failure;fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});return Object.freeze({...result,receipt});
}