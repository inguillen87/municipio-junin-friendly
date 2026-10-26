// Source candidate only. No foundation, install, identity, IAM grant or new capture.
// This browser supplies the ONE confirmation already scheduled by the209 tail.
// Its real receipt feeds the unchanged subsequent124 annul/handoff scenario.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createOwnLiquidationHandler} from '../../api/internal-own-payroll-liquidation.js';
import {employeeContext} from '../../lib/internal-native-employees.js';
import {OWN_LIQ_REVIEW,verifiedOwnLiquidationDetail,verifiedOwnLiquidationReceipt} from '../../assets/own-payroll-liquidation-model.js';
import {OWN_RUN_FULL_JSON} from '../../assets/own-payroll-response.js';
import {createCanonical190BrowserHost,PUBLIC_ROOT} from './own-payroll-canonical190-browser-host-qa.mjs';

const ENDPOINT='/api/internal-own-payroll-liquidation';
const COMMAND='SELECT public.own_liquidation_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result';
const FULL_DETAIL='SELECT public.own_liquidation_detail_full_v1($1::jsonb,$2::uuid) AS result';
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const decisionReference=receipt=>Object.freeze({id:receipt.id,keyJsonSha256:sha(receipt.key),runId:receipt.runId,resultSha256:receipt.resultSha256,bodySha256:receipt.bodySha256,command:receipt.body.command,affectedCount:receipt.affected.length,affectedJsonSha256:sha(receipt.affected)});
const sorted=values=>[...values].sort();
const exact=(value,keys)=>assert.deepEqual(Reflect.ownKeys(value).sort(),sorted(keys));
const bytes=value=>Buffer.byteLength(JSON.stringify({ok:true,data:value}),'utf8');
const FOUR=4*1024*1024,FULL=32*1024*1024;

// Literal oracles for the EXISTING approved20-rule canonical190 programme.
// Captured metadata is independently compared with these source literals.
// No formatter/model used by the product constructs the screen oracle.
function literalConcept(row){
 if(row.conceptCode==='1'){
  assert.equal(row.nature,'remuneration');assert.equal(row.unit,'money');assert.equal(row.amount,'100.20');
  return{label:'Básico exclusivamente sintético',nature:'Remunerativo',value:'$ 100,20',kind:'concept'};
 }
 if(row.conceptCode==='101'){
  assert.equal(row.nature,'auxiliary');assert.equal(row.unit,'units');assert.equal(row.amount,'10');
  return{label:'Mes exclusivamente sintético',nature:'Auxiliar',value:'10 · Unidades',kind:'auxiliary'};
 }
 assert.match(row.conceptCode,/^7(?:0[0-9]|1[0-7])$/);
 assert.equal(row.nature,'remuneration');assert.equal(row.unit,'money');assert.equal(row.amount,'1.00');
 return{label:'Concepto exclusivamente sintético M7 '+row.conceptCode,nature:'Remunerativo',value:'$ 1,00',kind:'concept'};
}
function expectedRow(row,items){
 const literal=literalConcept(row),definitions=items.filter(item=>item.kind===literal.kind&&item.agreementCode===row.agreementCode&&item.code===row.conceptCode);
 assert.equal(definitions.length,1);assert.equal(definitions[0].label,literal.label);assert.equal(definitions[0].unit,row.unit);assert.equal(definitions[0].nature,row.nature);
 return[row.employeeNumber,row.conceptCode+' · '+literal.label,literal.nature,literal.value,row.ruleReference];
}

export async function verifyOwnLiquidationCurrent190Regressions(context,fixture){
 exact(context,['h','db','qa','readSnapshot','readLedger','synthetic']);
 const {h,db,qa,readSnapshot,readLedger}=context;
 assert.strictEqual(h.qa,qa);assert.ok([17,18].includes(h.major));assert.equal(qa.operationalPairBaseline,'published107');assert.equal(context.synthetic,true);assert.match(h.sourceCommit,/^[a-f0-9]{40}$/);
 assert.equal(typeof db.query,'function');assert.equal(typeof db.run,'function');assert.equal(typeof readSnapshot,'function');assert.equal(typeof readLedger,'function');
 exact(fixture,['run','contractIds','detailBefore','actors','reason']);
 const {run,contractIds,detailBefore,reason}=fixture;
 assert.equal(run.saved.result.employeeCount,855);assert.equal(run.saved.result.rowCount,17100);assert.equal(run.saved.input.rules.length,20);assert.equal(run.body.period,'2026-10');
 assert.equal(contractIds.length,10);assert.equal(new Set(contractIds).size,10);
 await verifiedOwnLiquidationDetail(detailBefore);assert.equal(detailBefore.id,run.id);assert.deepEqual(detailBefore.capture.saved,run.saved);
 const originalEmployees=new Map(detailBefore.employees.map(employee=>[employee.contractId,structuredClone(employee)]));
 for(const id of contractIds){const employee=originalEmployees.get(id);assert.ok(employee);assert.equal(employee.state,'calculated');assert.equal(employee.blockedBy,null);assert.ok(employee.allowedCommands.includes('confirm'));}
 assert.equal(detailBefore.employees.filter(employee=>employee.state==='confirmed').length,0);assert.equal(detailBefore.employees.filter(employee=>employee.state==='annulled').length,285);assert.equal(detailBefore.employees.filter(employee=>employee.state==='calculated').length,570);
 const extraCalculated=detailBefore.employees.find(employee=>employee.state==='calculated'&&employee.blockedBy===null&&!contractIds.includes(employee.contractId));assert.ok(extraCalculated);
 exact(fixture.actors,['reviewer','creator','receiver']);
 const {reviewer,creator,receiver}=fixture.actors;
 const reviewerNativeContext=JSON.stringify(employeeContext(reviewer.principal,reviewer.session));
 for(const actor of[reviewer,creator,receiver]){assert.equal(actor.principal.authorized,true);assert.equal(actor.principal.session.mfa,true);assert.equal(actor.session.id,actor.raw.actorSessionId);}
 assert.ok(OWN_LIQ_REVIEW.every(cap=>reviewer.principal.tenant.effectiveCapabilities.includes(cap)));
 assert.ok(!reviewer.principal.tenant.effectiveCapabilities.includes('payroll.calculation.prepare'));
 assert.equal(new Set([reviewer,creator,receiver].map(actor=>actor.raw.membershipId)).size,3);
 const sourceBookend=[];
 for(const file of['own-payroll-liquidation-panel.js','own-payroll-liquidation-model.js','own-payroll-run-workspace-model.js','own-payroll-run-model.js','own-payroll-response.js','own-payroll-individual-panel.js','native-salary-catalog-model.js']){
  const relative='assets/'+file,source=fs.readFileSync(path.join(PUBLIC_ROOT,relative));assert.deepEqual(fs.readFileSync(path.join(PUBLIC_ROOT,'public',relative)),source,'DECISION124_CURRENT_BUILT_SOURCE_MISMATCH:'+relative);
  sourceBookend.push({path:relative,sha256:createHash('sha256').update(source).digest('hex')});
 }
 const sourceAfter=()=>{for(const item of sourceBookend){const source=fs.readFileSync(path.join(PUBLIC_ROOT,item.path));assert.equal(createHash('sha256').update(source).digest('hex'),item.sha256);assert.deepEqual(fs.readFileSync(path.join(PUBLIC_ROOT,'public',item.path)),source);}};
 const ledger=()=>readLedger(); // The exact scoped census already used by the209 caller.
 const checks=[],posts=[],pagePosts=[],detailCalls=[],unexpectedWrites=[],attemptReads=[];
 let loss=null,calculationPosts=0,committedReceipt=null;
 const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
 const instrumentedDb={query:async(statement,values)=>{
  if(statement===FULL_DETAIL)detailCalls.push({runIdJsonSha256:sha(values[1])});
  if(statement!==COMMAND){
   if(/^SELECT public\.own_(?:run_capture|run_complete(?:_full)?|annul_command(?:_full)?|close_command(?:_full)?)_v\d\(/.test(statement)){unexpectedWrites.push(statement);throw Error('DECISION124_CURRENT_UNEXPECTED_MUTATING_RPC');}
   return db.query(statement,values);
  }
  const entry={key:values[2],body:JSON.parse(values[1]),reachedSql:false,replayed:null};posts.push(entry);
  if(loss==='before'){loss=null;throw Error('QA_DECISION124_UNSENT_BEFORE_SQL');}
  entry.reachedSql=true;const result=await db.query(statement,values),receipt=result?.[0]?.result;assert.ok(receipt);entry.replayed=receipt.replayed;
  if(loss==='after'){loss=null;committedReceipt=structuredClone(receipt);throw Error('QA_DECISION124_ACK_WITHHELD_AFTER_COMMIT');}
  return result;
 }};
 const host=await createCanonical190BrowserHost({h,actors:new Map([['reviewer',reviewer],['creator',creator],['receiver',receiver]]),getSql:async()=>instrumentedDb,outputName:'liquidation124-current-regressions-browser',handlers:deps=>new Map([[ENDPOINT,createOwnLiquidationHandler(deps)]])});
 const {origin,output,evidence}=host;
 let failure,result,page;
 try{
  const before=readSnapshot(),beforeLedger=await ledger();
  assert.equal(beforeLedger.captures,12);assert.equal(beforeLedger.saved,12); // Before the two unsaved and two recalculated captures.
  const r=await host.open('reviewer');page=r.page;
  page.on('request',request=>{const url=new URL(request.url());if(url.origin===origin&&request.method()==='POST'&&url.pathname.startsWith('/api/')){pagePosts.push(url.pathname);if(url.pathname==='/api/internal-own-payroll-run')calculationPosts++;}});
  page.on('response',response=>{const url=new URL(response.url());if(url.origin===origin&&url.pathname===ENDPOINT&&url.searchParams.get('resource')==='attempt')attemptReads.push({status:response.status(),keyJsonSha256:sha(url.searchParams.get('key'))});});
  const $=key=>page.locator('[data-liq-'+key+']');
  const settled=()=>page.waitForFunction(()=>document.querySelector('[data-liq-status]')?.closest('.own-liquidation')?.getAttribute('aria-busy')==='false',{}, {timeout:45000});
  const open=async()=>{await $('history').locator('[data-liq-run-id="'+run.id+'"]').click();await $('detail').waitFor({state:'visible'});await settled();};
  const tableCells=()=> $('rows').locator('tr').evaluateAll(rows=>rows.map(row=>[...row.cells].map(cell=>cell.textContent)));
  const decide=async(command,values)=>{await $('command').selectOption(command);await $('kind').selectOption('contracts');await $('values').selectOption(values);await $('reason').fill(reason);await $('confirm').check();};
  const request=async(relative)=>{const answer=await r.request(relative,{headers:{Accept:OWN_RUN_FULL_JSON}});assert.equal(answer.response.status(),200);assert.equal(answer.body.ok,true);assert.equal(answer.response.headers()['content-type'].split(';')[0],OWN_RUN_FULL_JSON);assert.equal(Number(answer.response.headers()['x-municontrol-json-bytes']),Buffer.byteLength(JSON.stringify(answer.body),'utf8'));return answer.body.data;};
  await page.goto(origin+'/nomina-control.html#decisiones');await $('history').locator('[data-liq-run-id="'+run.id+'"]').waitFor({state:'visible'});await settled();await open();
  assert.ok((await $('summary').innerText()).includes('855 legajos'));assert.ok((await $('summary').innerText()).includes('17100 conceptos calculados'));
  const realDetail=await verifiedOwnLiquidationDetail(await request(ENDPOINT+'?resource=detail&id='+run.id));assert.deepEqual(realDetail,detailBefore);assert.ok(bytes(realDetail)>FOUR&&bytes(realDetail)<=FULL);assert.ok(detailCalls.length>=2);
  await page.getByText('Ver estados y totales de todos los legajos',{exact:true}).click();assert.equal(await $('totals').locator('tr').count(),855);
  await page.getByText('Revisar conceptos y versiones del cálculo',{exact:true}).click();
  const rows=run.saved.result.rows,items=run.payload.programState.salaryCatalog.items,pages=Math.ceil(rows.length/25),seen=[];
  assert.equal(pages,684);
  for(let n=0;n<pages;n++){
   assert.equal((await $('page').innerText()).trim(),(n+1)+' / '+pages);
   const actual=await tableCells(),expected=rows.slice(n*25,(n+1)*25).map(row=>expectedRow(row,items));
   assert.deepEqual(actual,expected,'DECISION124_CURRENT_CONCEPT_PAGE:'+n);seen.push(...rows.slice(n*25,(n+1)*25).map(row=>row.contractId+'|'+row.nature+'|'+row.conceptCode));
   if(n<pages-1){assert.equal(await $('next').isDisabled(),false);await $('next').click();}else assert.equal(await $('next').isDisabled(),true);
  }
  assert.equal(seen.length,17100);assert.equal(new Set(seen).size,17100);
  check(true,'all17100 captured concepts on684 complete pages retain literal descriptions, nature, exact money/unit labels and references');
  const selectedPerson=run.saved.input.employees.find(employee=>employee.contractId===contractIds[0]);assert.ok(selectedPerson);
  await $('search').fill(selectedPerson.employeeNumber);
  const filtered=rows.filter(row=>row.employeeNumber.includes(selectedPerson.employeeNumber)||row.conceptCode.includes(selectedPerson.employeeNumber));
  assert.deepEqual(await tableCells(),filtered.slice(0,25).map(row=>expectedRow(row,items)));
  await $('search').fill('no-current190-concept-matches');assert.equal(await $('rows').locator('tr').count(),0);
  await $('totals').locator('[data-liq-individual-open="'+contractIds[0]+'"]').click();await settled();
  const individual=$('individual'),ownRows=rows.filter(row=>row.contractId===contractIds[0]),entries=individual.locator('[data-individual-concepts] li');
  assert.equal(ownRows.length,20);assert.equal(await entries.count(),20);
  for(const [n,row]of ownRows.entries()){const literal=literalConcept(row);assert.equal(await entries.nth(n).locator('h5').textContent(),'Concepto '+row.conceptCode+' · '+literal.label);assert.equal(await entries.nth(n).locator('.own-individual-amount').textContent(),literal.value);assert.equal(await entries.nth(n).locator('details p').textContent(),row.ruleReference);}
  assert.equal(await individual.locator('[data-individual-concepts] img,[data-individual-concepts] script').count(),0);
  assert.equal((await individual.locator('[data-individual-amount="net"]').innerText()).trim(),'$ 118,20');
  check((await individual.locator('[data-individual-state]').innerText()).includes('Pendiente de confirmación'),'a blank run search never trims the individual20-concept summary or its literal118.20 net');
  await individual.locator('[data-individual-close]').click();
  await decide('confirm',contractIds);
  assert.ok((await $('review-summary').innerText()).includes('Confirmar · 10 legajos afectados'));assert.equal(await $('review-rows').locator('tr').count(),10);assert.equal(await $('send').isDisabled(),false);
  const expectedNumbers=sorted(contractIds.map(id=>run.saved.input.employees.find(employee=>employee.contractId===id).employeeNumber));
  assert.deepEqual(sorted(await $('review-rows').locator('tr').evaluateAll(nodes=>nodes.map(node=>node.cells[0].textContent))),expectedNumbers);
  const frozenReviewTotals=await $('review-totals').innerText();await $('review-search').fill('no-current190-review-match');
  assert.equal(await $('review-rows').locator('tr').count(),1);assert.ok((await $('review-range').innerText()).includes('10 afectados'));assert.equal(await $('review-totals').innerText(),frozenReviewTotals);
  await $('review-search').fill('');
  for(const width of[390,320]){await page.setViewportSize({width,height:1100});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);const box=await $('send').boundingBox();assert.ok(box&&box.height>=44);assert.equal(await $('send').getAttribute('type'),'submit');await page.screenshot({path:path.join(output,'mobile-'+width+'.png'),fullPage:false});}
  await page.setViewportSize({width:1366,height:1100});
  assert.deepEqual(readSnapshot(),before);assert.deepEqual(await ledger(),beforeLedger);assert.equal(pagePosts.length,0);
  check(true,'complete855 review and narrowed10-contract confirmation remain untrimmed under searches, both mobile widths and explicit consent without a write');
  // First explicit send is withheld before the adapter; GET proves absence.
  loss='before';await $('send').click();await settled();assert.equal(posts.length,1);assert.equal(posts[0].reachedSql,false);assert.equal(await $('recover').isVisible(),true);
  const frozen={key:posts[0].key,body:structuredClone(posts[0].body)};
  assert.equal(frozen.body.command,'confirm');assert.deepEqual(frozen.body.selection,{kind:'contracts',values:sorted(contractIds)});
  assert.deepEqual(readSnapshot(),before);assert.deepEqual(await ledger(),beforeLedger);
  await $('reason').evaluate(element=>{element.value='DOM cannot replace the original pending reason';element.dispatchEvent(new Event('input',{bubbles:true}));});
  const attemptsBeforeMissing=attemptReads.length;
  await db.expectQueryError({caseId:'855-browser-liquidation-unsent-recover',nativeCode:'OWN_LIQ_NOT_FOUND',text:'SELECT public.own_liquidation_attempt_v1($1::jsonb,$2::uuid) AS result',values:[reviewerNativeContext,frozen.key]},async()=>{
   await $('recover').click();await settled();assert.equal(await $('revise').isVisible(),true);assert.equal(attemptReads.length,attemptsBeforeMissing+1);assert.deepEqual(attemptReads.at(-1),{status:404,keyJsonSha256:sha(frozen.key)});assert.equal(posts.length,1);assert.deepEqual(readSnapshot(),before);assert.deepEqual(await ledger(),beforeLedger);
  });
  assert.deepEqual(readSnapshot(),before);assert.deepEqual(await ledger(),beforeLedger);
  // Same explicit pending send reaches124 exactly once; only its ACK is lost.
  loss='after';await $('send').click();await settled();assert.equal(posts.length,2);assert.equal(posts[1].reachedSql,true);assert.equal(posts[1].replayed,false);assert.ok(committedReceipt);assert.equal(await $('recover').isVisible(),true);
  const receipt=await verifiedOwnLiquidationReceipt(committedReceipt);assert.equal(receipt.replayed,false);assert.equal(receipt.key,frozen.key);assert.deepEqual(receipt.body,frozen.body);assert.equal(receipt.resultSha256,run.saved.resultSha256);assert.equal(receipt.body.command,'confirm');assert.equal(receipt.runId,run.id);assert.deepEqual(sorted(receipt.affected.map(row=>row.contractId)),sorted(contractIds));
  const afterCommit=readSnapshot(),afterLedger=await ledger();assert.deepEqual(afterLedger,{...beforeLedger,liquidationEvents:beforeLedger.liquidationEvents+1});
  assert.deepEqual({key:posts[1].key,body:posts[1].body},frozen);
  await $('send').click();await settled();assert.equal(posts.length,3);assert.equal(posts[2].reachedSql,true);assert.equal(posts[2].replayed,true);assert.deepEqual({key:posts[2].key,body:posts[2].body},frozen);assert.deepEqual(readSnapshot(),afterCommit);assert.deepEqual(await ledger(),afterLedger);
  assert.ok((await $('status').innerText()).includes('Confirmar: 10 legajos registrados'));
  const replay=await verifiedOwnLiquidationReceipt(await request(ENDPOINT+'?resource=attempt&key='+receipt.key));assert.deepEqual(replay,{...receipt,replayed:true});assert.deepEqual(await ledger(),afterLedger);
  const after=await verifiedOwnLiquidationDetail(await request(ENDPOINT+'?resource=detail&id='+run.id));assert.deepEqual(after.capture.saved,run.saved);
  const changed=new Set(contractIds);for(const employee of after.employees){const old=originalEmployees.get(employee.contractId);if(changed.has(employee.contractId)){const affected=receipt.affected.find(row=>row.contractId===employee.contractId);assert.equal(employee.state,'confirmed');assert.equal(employee.version,old.version+1);assert.equal(employee.liquidationVersion,affected.liquidationVersion);}else assert.deepEqual(employee,old);}
  check(true,'before-send loss,404 recovery and after-commit loss preserve the exact key/body; explicit replay yields one real confirmation and zero new captures');
  // A fresh decision must refuse the whole11-row mixed selection, not drop10.
  await $('next-decision').click();await settled();await open();
  await decide('confirm',[...contractIds,extraCalculated.contractId]);
  assert.ok((await $('review-summary').innerText()).includes('11 legajos afectados'));assert.equal(await $('review-rows').locator('tr').count(),11);assert.equal(await $('send').isDisabled(),true);assert.ok((await $('scope').innerText()).includes('No se omitirán legajos'));
  assert.equal(posts.length,3);assert.deepEqual(readSnapshot(),afterCommit);
  // Department scope is consulted in full, but CANNOT be confirmed in this
  // phase: that single department also contains the285 previously annulled.
  await $('kind').selectOption('departments');
  const departments=sorted(new Set(run.saved.input.employees.map(employee=>employee.departmentCode)));assert.equal(departments.length,1);await $('values').selectOption(departments);await $('confirm').check();
  assert.ok((await $('review-summary').innerText()).includes('855 legajos afectados'));assert.equal(await $('send').isDisabled(),true);
  check(true,'mixed11 and complete855 department review refuse every incompatible state instead of silently omitting an employee');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(await $('detail').isHidden(),true);assert.equal(await $('totals').locator('tr').count(),0);assert.equal(await $('rows').locator('tr').count(),0);assert.equal(await $('review-rows').locator('tr').count(),0);assert.equal(await $('individual').isHidden(),true);
  assert.deepEqual(readSnapshot(),afterCommit);assert.deepEqual(await ledger(),afterLedger);assert.equal(pagePosts.length,3);assert.ok(pagePosts.every(value=>value===ENDPOINT));assert.equal(calculationPosts,0);assert.deepEqual(unexpectedWrites,[]);
  assert.deepEqual(evidence.pageErrors,[]);assert.deepEqual(evidence.serverErrors,[]);assert.deepEqual(evidence.external,[]);sourceAfter();
  result={version:'own-liquidation-current190-regressions-browser.v1',passed:true,sourceCommit:h.sourceCommit,major:h.major,population:855,conceptRows:17100,conceptPages:684,individualConcepts:20,affected:10,decisionReference:decisionReference(committedReceipt),checks,sourceBookend,httpEvidence:evidence.httpEvidence,fullDetailReads:detailCalls.length,pagePosts:pagePosts.length,commandAttempts:posts.map(post=>({keyJsonSha256:sha(post.key),bodyJsonSha256:sha(post.body),reachedSql:post.reachedSql,replayed:post.replayed})),addedCaptures:0,addedSavedResults:0,addedLiquidationDecisions:1,addedAnnulments:0,addedCloseEvents:0,before:beforeLedger,after:afterLedger,firstConfirmationBrowserProven:true,immutableDecisionRetryBrowserProven:true,mixedSelectionRejected:true,allConceptPagesCompared:true,capturedDescriptionsCompared:true,unitLabelsCompared:true,individualSummaryComplete:true,mobileWidths:[390,320],positiveDepartmentConfirmationProven:false,subsequentAnnulmentProven:false,calculationContinuationProven:false,allLegacyDecisionUiCasesCovered:false,pending:['positive confirmation by department requires a wholly calculated department without changing the source209 receipt','subsequent annulment and cross-user preparation stay in the unchanged following124 browser','explicit recalculation and lost calculation acknowledgement are outside this no-new-capture phase','SQL-level permission revocation is not simulated by narrowing a browser identity'],actualSql:true,actualHttp:true,actualBrowser:true,authenticationFixture:true,fullBuildValidation:false,synthetic:true,productionWrites:0,paymentExecuted:false,municipalAcceptance:false};
  await r.close();
 }catch(error){failure=error;fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({passed:false,sourceCommit:h.sourceCommit,major:h.major,message:error.message,checks,commandAttempts:posts.map(post=>({keyJsonSha256:sha(post.key),reachedSql:post.reachedSql,replayed:post.replayed})),pagePosts:pagePosts.length,pageErrors:evidence.pageErrors,serverErrors:evidence.serverErrors,synthetic:true},null,2)+'\n',{flag:'wx'});}
 finally{try{await host.close();}catch(error){if(!failure)failure=error;}}
 if(failure)throw failure;
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 return Object.freeze({...result,receipt:committedReceipt});
}
