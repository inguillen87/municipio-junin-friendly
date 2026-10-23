// PRIVATE SOURCE CANDIDATE (R4: v2 cec38556… + withdrawal negatives for P). Never imported, parsed or executed by its author.
// Composed against public 590fd904 sources (tail sha256 2f5e1d8b…, run-panel cc00a75b…).
// Negatives use ONLY the same synthetic authenticated sessions of the host190:
// hiding the page, changing task, a client capability event, and a late
// response after the presented session lost prepare. No new operation,
// capture, schema, grant or role; SQL-level revocation stays in the tail probes.
// INDIVIDUAL124 annul → cross-user preparation on the SAME canonical190 host,
// invoked by the209 native tail: reviewer R annuls (in the real Confirmar y
// anular panel) a subset she already confirmed of a run REALLY created by P;
// P opens the opaque run+decision link with her own cookie and rebuilds the
// exact unconfirmed draft from ONE authenticated detail read; the receipt and
// its key never leave R. No fixture, schema, IAM grant or foundation here; no
// calculation, no loss simulation, no automatic recalculation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createOwnLiquidationHandler} from '../../api/internal-own-payroll-liquidation.js';
import {createOwnRunHandler} from '../../api/internal-own-payroll-run.js';
import {createEmploymentCatalogHandler} from '../../api/internal-employment-catalog.js';
import {createOwnProgramHandler} from '../../api/internal-own-payroll-program.js';
import {createInternalDataHandler} from '../../api/internal-data.js';
import {OWN_RUN_PREPARE,OWN_RUN_TYPES} from '../../assets/own-payroll-run-workspace-model.js';
import {OWN_LIQ_READ,OWN_LIQ_REVIEW,verifiedOwnLiquidationReceipt} from '../../assets/own-payroll-liquidation-model.js';
import {ownLiquidationDecisionLink} from '../../assets/own-payroll-annulment-preparation-link.js';
import {createCanonical190BrowserHost,calculationPanelReads,PUBLIC_ROOT} from './own-payroll-canonical190-browser-host-qa.mjs';

const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sorted=value=>[...value].sort();
const exact=(value,keys)=>assert.deepEqual(Reflect.ownKeys(value).sort(),sorted(keys));
const LIQUIDATION='/api/internal-own-payroll-liquidation';
const DECISION_RPC=/^SELECT public\.own_liquidation_command_v1\(/;
const CALCULATION_RPC=/^SELECT public\.own_run_capture_v1\(/;
const MUTATING_RPC=/^SELECT public\.own_(?:run_capture|run_complete(?:_full)?|liquidation_command|annul_command(?:_full)?|close_command(?:_full)?)_v\d\(/;
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);

export async function verifyOwnLiquidationDecision124BrowserOn190(context,fixture){
 exact(context,['h','db','qa','readSnapshot','synthetic']);
 const {h,db,qa,readSnapshot}=context;
 assert.strictEqual(h.qa,qa);assert.ok([17,18].includes(h.major));assert.match(h.sourceCommit,/^[a-f0-9]{40}$/);assert.equal(context.synthetic,true);
 assert.equal(typeof readSnapshot,'function');assert.equal(typeof db.query,'function');assert.equal(typeof db.run,'function');
 assert.ok(['handoff','blocked'].includes(fixture?.phase),'DECISION124_BROWSER_PHASE');
 const phase=fixture.phase;
 exact(fixture,['run','contractIds','actors','reason','phase',...(phase==='blocked'?['decisionId']:[])]);
 const {run,contractIds,reason}=fixture;
 assert.ok(uuid(run?.id)&&run.saved&&Array.isArray(run.saved.input?.employees)&&run.saved.result,'DECISION124_BROWSER_RUN_CAPTURE');
 assert.ok(Array.isArray(contractIds)&&contractIds.length>0&&new Set(contractIds).size===contractIds.length);
 const people=new Map(run.saved.input.employees.map(row=>[row.contractId,row]));
 for(const id of contractIds)assert.ok(people.has(id),'DECISION124_BROWSER_CONTRACT_OUTSIDE_RUN');
 assert.ok(typeof reason==='string'&&reason.trim()===reason&&reason.length>=10&&reason.length<=500);
 exact(fixture.actors,['reviewer','creator','receiver']);
 const {reviewer,creator,receiver}=fixture.actors;
 for(const actor of[reviewer,creator,receiver]){exact(actor,['principal','session','raw','roleKey']);assert.equal(actor.principal.authorized,true);assert.equal(actor.principal.session.mfa,true);}
 assert.equal(new Set([reviewer,creator,receiver].map(actor=>actor.raw.membershipId)).size,3);
 assert.equal(new Set([reviewer,creator,receiver].map(actor=>actor.session.id)).size,3);
 const reviewerCaps=reviewer.principal.tenant.effectiveCapabilities,creatorCaps=creator.principal.tenant.effectiveCapabilities,receiverCaps=receiver.principal.tenant.effectiveCapabilities;
 assert.ok(OWN_LIQ_REVIEW.every(cap=>reviewerCaps.includes(cap)));assert.ok(!reviewerCaps.includes('payroll.calculation.prepare'),'DECISION124_REVIEWER_MUST_NOT_GAIN_PREPARE');
 for(const[name,caps]of[['creator',creatorCaps],['receiver',receiverCaps]]){assert.ok(OWN_RUN_PREPARE.every(cap=>caps.includes(cap)),'DECISION124_'+name+'_PREPARE');for(const forbidden of['payroll.calculation.approve','payroll.calculation.close'])assert.ok(!caps.includes(forbidden),'DECISION124_'+name+'_MUST_NOT_GAIN_'+forbidden);}
 // The run must really belong to P: SQL124 authorises P's detail read as its
 // creator, and R's annul as an independent reviewer. Receiver is neither.
 assert.equal(run.body?.period&&run.body.liquidationType&&Object.hasOwn(OWN_RUN_TYPES,run.body.liquidationType),true);
 const expectedNumbers=sorted(contractIds.map(id=>people.get(id).employeeNumber));assert.equal(new Set(expectedNumbers).size,expectedNumbers.length);
 const sourceBookend=[];
 for(const file of['own-payroll-liquidation-panel.js','own-payroll-liquidation-model.js','own-payroll-run-panel.js','own-payroll-run-workspace-model.js',
  'own-payroll-annulment-preparation-link.js','payroll-navigation.js','own-payroll-readiness-model.js','own-payroll-response.js','native-salary-catalog-model.js','own-payroll-run-model.js','own-payroll-run-date.js','own-payroll-individual-panel.js']){
  const relative='assets/'+file,source=fs.readFileSync(path.join(PUBLIC_ROOT,relative));
  assert.deepEqual(fs.readFileSync(path.join(PUBLIC_ROOT,'public',relative)),source,'DECISION124_BUILT_SOURCE_MISMATCH:'+relative);
  sourceBookend.push({path:relative,sha256:createHash('sha256').update(source).digest('hex')});
 }
 const checks=[],decisionPosts=[],pagePosts=[],detailReads=[],attemptReads=[],readFailures=[],detailRequests=[],rosterReads=[],negatives=[];
 let calculationPosts=0,mutations=0,creatorCapsOverride=null,reviewerCapsOverride=null;
 const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
 const instrumentedDb={query:async(statement,values)=>{
  if(CALCULATION_RPC.test(statement))calculationPosts++;
  if(MUTATING_RPC.test(statement))mutations++;
  if(!DECISION_RPC.test(statement))return db.query(statement,values);
  const entry={key:values[2],body:JSON.parse(values[1]),receipt:null};decisionPosts.push(entry);
  const result=await db.query(statement,values);entry.receipt=result?.[0]?.result??null;return result;
 }};
 const actors=new Map([['reviewer',reviewer],['creator',creator],['receiver',receiver]]);
 const reads=calculationPanelReads(db,qa.schema);
 // identity narrows ONLY what the presented session shows to the client (never
 // the principal SQL authorises), which is the fixture's way to withdraw prepare.
 const host=await createCanonical190BrowserHost({h,actors,getSql:async()=>instrumentedDb,outputName:'liquidation-decision-124-browser-'+phase,
  identity:(name,actor)=>name==='creator'&&creatorCapsOverride?{caps:creatorCapsOverride}:name==='reviewer'&&reviewerCapsOverride?{caps:reviewerCapsOverride}:{},
  handlers:deps=>new Map([
   [LIQUIDATION,createOwnLiquidationHandler(deps)],
   ['/api/internal-own-payroll-run',createOwnRunHandler(deps)],
   ['/api/internal-employment-catalog',createEmploymentCatalogHandler({...deps,getSql:async()=>reads})],
   ['/api/internal-own-payroll-program',createOwnProgramHandler({...deps,getSql:async()=>reads})],
   ['/api/internal-data',createInternalDataHandler({env:deps.env,requireCompatibleInternalAccess:deps.requireAccess,actionMutationSession:deps.sessionFor,getInternalSql:async()=>reads,getActionCenterSql:async()=>reads,reportReadFailure:error=>readFailures.push(String(error?.message??error))})]
  ])});
 const {origin,output,evidence}=host;
 const observe=(page,actorName)=>{
  page.on('request',request=>{const url=new URL(request.url());if(url.origin!==origin)return;if(request.method()==='POST'&&url.pathname.startsWith('/api/'))pagePosts.push({actor:actorName,path:url.pathname});if(request.method()==='GET'&&url.pathname===LIQUIDATION&&url.searchParams.get('resource')==='detail')detailRequests.push({actor:actorName,id:url.searchParams.get('id')});});
  page.on('response',response=>{const request=response.request(),url=new URL(response.url());if(request.method()!=='GET'||url.origin!==origin)return;if(url.pathname==='/api/internal-data'&&url.searchParams.get('resource')==='nativeroster'){rosterReads.push({actor:actorName,status:response.status()});return;}if(url.pathname!==LIQUIDATION)return;const row={actor:actorName,resource:url.searchParams.get('resource'),id:url.searchParams.get('id'),status:response.status()};if(row.resource==='detail')detailReads.push(row);if(row.resource==='attempt')attemptReads.push(row);});
 };
 const runPanel=page=>{
  const $=key=>page.locator('[data-own-'+key+']');
  return{$,settled:()=>page.waitForFunction(()=>document.querySelector('[data-own-status]')?.closest('.own-run')?.getAttribute('aria-busy')==='false',{}, {timeout:45000}),
   chips:()=>$('chips').locator('span > span').evaluateAll(nodes=>nodes.map(node=>node.textContent.trim().replace(/^Legajo /,'').replace(/ · .*$/,''))),
   hide:()=>page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));}),
   show:()=>page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));}),
   task:id=>page.evaluate(id=>document.dispatchEvent(new CustomEvent('taskchange',{detail:{id}})),id),
   capabilities:caps=>page.evaluate(next=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:next}})),caps),
   // Holds the page's own detail read BEFORE it reaches the network, so a
   // withdrawal can happen while that read is pending; nothing is replayed.
   holdDetail:async()=>{let release;const gate=new Promise(resolve=>release=resolve);const match=url=>url.origin===origin&&url.pathname===LIQUIDATION&&url.searchParams.get('resource')==='detail';const handler=async route=>{await gate;await route.continue().catch(()=>{});};await page.route(match,handler);const issued=page.waitForRequest(request=>match(new URL(request.url())),{timeout:45000});return{issued,release:async()=>{release();await page.unroute(match,handler);}};}};
 };
 let failure,result,receipt=null,decisionId=fixture.decisionId??null;
 const link=()=>origin+ownLiquidationDecisionLink(run.id,decisionId);
 try{
  const baseline=readSnapshot();
  if(phase==='handoff'){
   // 1. R annuls the already confirmed subset in the real panel of her own
   //    session; the product emits the opaque link; R still cannot prepare.
   const r=await host.open('reviewer');observe(r.page,'reviewer');
   const $=key=>r.page.locator('[data-liq-'+key+']');
   const settled=()=>r.page.waitForFunction(()=>document.querySelector('[data-liq-status]')?.closest('.own-liquidation')?.getAttribute('aria-busy')==='false',{}, {timeout:45000});
   await r.page.goto(origin+'/nomina-control.html#decisiones');await $('history').locator('button[data-liq-run-id="'+run.id+'"]').waitFor({state:'visible'});await settled();
   await $('history').locator('button[data-liq-run-id="'+run.id+'"]').click();await $('detail').waitFor({state:'visible'});await settled();
   check((await $('summary').innerText()).includes(run.saved.result.employeeCount+' legajos'),'reviewer consults the complete real run created by P');
   await $('command').selectOption('annul');await $('kind').selectOption('contracts');await $('values').selectOption([...contractIds]);
   await $('reason').fill(reason);await $('confirm').check();
   check(!await $('send').isDisabled()&&(await $('review-summary').innerText()).includes('Anular · '+contractIds.length+' legajos afectados'),'the reviewed scope is exactly the confirmed subset');
   await $('send').click();await settled();
   assert.equal(decisionPosts.length,1);assert.ok(decisionPosts[0].receipt,'DECISION124_RECEIPT_RECORDED');
   receipt=await verifiedOwnLiquidationReceipt(decisionPosts[0].receipt);
   assert.equal(receipt.runId,run.id);assert.equal(receipt.body.command,'annul');assert.deepEqual(sorted(receipt.affected.map(row=>row.contractId)),sorted(contractIds));assert.ok(receipt.affected.every(row=>row.state==='annulled'));
   decisionId=receipt.id;
   check((await $('status').innerText()).includes('Anular: '+contractIds.length+' legajos registrados'),'one real124 annul decision is registered from the panel');
   check(!await $('handoff').isHidden()&&await $('decision-link').inputValue()===link(),'the panel hands over only run and decision ids');
   check(!/key|accessKey|actor|legajo/i.test(await $('decision-link').inputValue())&&!(await $('decision-link').inputValue()).includes(receipt.key),'the link never carries the reviewer key or any identity');
   check(await $('recalculate').isDisabled(),'the reviewer herself still cannot prepare');
   const replay=await r.request(LIQUIDATION+'?resource=attempt&key='+receipt.key);
   assert.equal(replay.response.status(),200);assert.deepEqual(await verifiedOwnLiquidationReceipt(replay.body.data),{...receipt,replayed:true});
   check(true,'the receipt stays recoverable by its own reviewer only');
   // N0 (UI regression on the producer). After the single real send, the SAME
   // session is presented with READ-only access (same user id and access key,
   // no capabilities event). Refreshing must hide the handoff and empty its
   // field without any new send: a retirement rule of the panel. The ids carry
   // no authority; receipt and attempt stay in memory. Restoring the presented
   // access only completes the scenario from the retained receipt.
   {const postsBefore=pagePosts.length,mutationsBefore=mutations;reviewerCapsOverride=[...OWN_LIQ_READ];
    await $('refresh').click();await settled();
    check(await $('handoff').isHidden()&&await $('decision-link').inputValue()===''&&await $('copy-link').isDisabled(),'a READ-only presented session hides the handoff and empties its field on refresh, without a capabilities event');
    check(await $('recalculate').isDisabled()&&await $('next-decision').isDisabled(),'READ-only presented access keeps every decision control disabled');
    assert.equal(pagePosts.length,postsBefore,'DECISION124_READONLY_REFRESH_SENT_NOTHING');assert.equal(mutations,mutationsBefore);
    reviewerCapsOverride=null;await $('refresh').click();await settled();
    check(!await $('handoff').isHidden()&&await $('decision-link').inputValue()===link()&&!await $('copy-link').isDisabled(),'restoring the presented access shows the handoff again from the retained receipt without resending');
    assert.equal(pagePosts.length,postsBefore);assert.equal(mutations,mutationsBefore);
    negatives.push({name:'reviewer-read-only-refresh',retired:true,detailReadsDuring:0,newPosts:0});}
   await r.close();
  }
  // 2. P opens the link with her own cookie: one authenticated detail read of
  //    her run, the exact unconfirmed draft (handoff) or the blocking (blocked).
  const beforeP=readSnapshot(),beforeMutations=mutations,beforeDetail=detailReads.length,beforePosts=pagePosts.length;
  const p=await host.open('creator');observe(p.page,'creator');const panel=runPanel(p.page);
  const firstDetail=p.page.waitForResponse(response=>{const url=new URL(response.url());return url.pathname===LIQUIDATION&&url.searchParams.get('resource')==='detail';});
  await p.page.goto(link());const detailResponse=await firstDetail;await panel.settled();
  assert.equal(detailResponse.status(),200);
  assert.equal(detailReads.length-beforeDetail,1);assert.deepEqual(detailReads.at(-1),{actor:'creator',resource:'detail',id:run.id,status:200});
  check(attemptReads.length===0,'P never reads any attempt: the reviewer key is not part of the route');
  if(phase==='handoff'){
   assert.deepEqual(sorted(await panel.chips()),expectedNumbers);
   assert.equal(await panel.$('period').inputValue(),run.body.period);assert.equal(await panel.$('type').inputValue(),run.body.liquidationType);assert.equal(await panel.$('kind').inputValue(),'contracts');
   assert.equal(await panel.$('date').inputValue(),run.body.liquidationDate??'');
   assert.ok((await panel.$('status').innerText()).includes('Se prepararon los '+contractIds.length+' legajos exactos de la anulación'));
   check(!await panel.$('confirm').isChecked()&&await panel.$('send').isDisabled()&&await panel.$('login').isHidden(),'the draft is exact, unconfirmed and belongs to P\'s own session');
   // ---- Withdrawal negatives on P's own authorised session (reads only) ----
   // clearViews() empties the chip, totals, rows and history nodes and the date
   // and consent (run-panel clearViews); kind/period are not nominal and stay.
   const retired=async label=>{const chips=await panel.chips();assert.equal(chips.length,0,label+': chips');assert.equal((await panel.$('chips').innerText()).trim(),'',label+': retired chip text');assert.equal(await panel.$('date').inputValue(),'',label+': date');assert.equal(await panel.$('confirm').isChecked(),false,label+': consent');assert.ok(await panel.$('send').isDisabled(),label+': send');assert.equal(await panel.$('result').isHidden(),true,label+': result');const body=await p.page.locator('body').innerText();for(const number of expectedNumbers)assert.ok(!new RegExp('Legajo '+number.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?!\\d)').test(body),label+': retired legajo text '+number);};
   const unchanged=(label,marks)=>{assert.equal(pagePosts.length,marks.posts,label+': no new page POST');assert.equal(mutations,marks.mutations,label+': no new mutating RPC');assert.equal(calculationPosts,0,label+': no calculation');assert.deepEqual(readSnapshot(),beforeP,label+': snapshot');};
   const marks=()=>({posts:pagePosts.length,mutations,reads:detailReads.filter(row=>row.actor==='creator'&&row.status===200).length,requests:detailRequests.filter(row=>row.actor==='creator').length,roster:rosterReads.filter(row=>row.actor==='creator').length});
   const restored=async(label,before)=>{await panel.settled();assert.deepEqual(sorted(await panel.chips()),expectedNumbers,label+': draft rebuilt');assert.equal(await panel.$('confirm').isChecked(),false,label+': consent stays off');const after=marks();assert.equal(after.reads-before.reads,1,label+': exactly one fresh authenticated detail read');unchanged(label,before);return after;};
   // N1. Hiding AFTER the draft retires every chip; returning performs only the
   //     metadata refresh (no detail read). Any restoration comes from a fresh
   //     authorised roster read of this same session, never from retained DOM.
   {const before=marks();await panel.hide();await retired('hide-after-draft');assert.ok((await panel.$('status').innerText()).includes('Se retiraron los datos al ocultar la página'));await panel.show();await panel.settled();const after=marks();assert.equal(after.reads,before.reads,'hide-after-draft: no detail read on return');unchanged('hide-after-draft',before);const chips=await panel.chips();if(chips.length)assert.deepEqual(sorted(chips),expectedNumbers);if(chips.length)assert.ok(after.roster>before.roster,'hide-after-draft: a restored draft needs a fresh roster read');negatives.push({name:'hide-after-draft',retired:true,restoredFromFreshRosterRead:chips.length>0,detailReadsDuring:0,newPosts:0});check(true,'hiding after the draft retires every chip and returning reads nothing nominal from the run');}
   // N2. Hiding while the first detail read is still pending: the late response
   //     never produces a draft; the reference survives; an explicit refresh rebuilds.
   {const before=marks();const hold=await panel.holdDetail();await p.page.goto(link());await hold.issued;await panel.hide();await hold.release();await panel.settled();await retired('hide-pending');assert.ok((await panel.$('status').innerText()).includes('Se retiraron los datos al ocultar la página'));await panel.show();await panel.settled();await retired('hide-pending-return');assert.ok((await panel.$('status').innerText()).includes('Se conserva la referencia de la decisión anulada'),'hide-pending: reference kept without reading');const during=marks();assert.equal(during.reads,before.reads,'hide-pending: the held read never completed');unchanged('hide-pending',before);await panel.$('refresh').click();const after=await restored('hide-pending-restore',during);negatives.push({name:'hide-pending',retired:true,detailReadsDuring:during.reads-before.reads,restoreReads:after.reads-during.reads,newPosts:0});check(true,'a detail response arriving after the page was hidden never becomes a draft; the reference is kept and rebuilt only by an explicit authorised refresh');}
   // N3. Changing task while the read is pending retires everything; coming back
   //     to Calcular rebuilds from one fresh read.
   {const before=marks();const hold=await panel.holdDetail();await p.page.goto(link());await hold.issued;await panel.task('decisiones');await hold.release();await panel.settled();await retired('task-change');assert.ok((await panel.$('status').innerText()).includes('Se retiraron los datos al cambiar de tarea'));const during=marks();assert.equal(during.reads,before.reads,'task-change: the held read never completed');unchanged('task-change',before);await panel.task('calculo');const after=await restored('task-change-return',during);negatives.push({name:'task-change',retired:true,detailReadsDuring:during.reads-before.reads,restoreReads:after.reads-during.reads,newPosts:0});check(true,'changing task retires the pending handoff; returning to Calcular rebuilds it from one fresh authorised read');}
   // N4. Client capability event withdrawing nominal access while the read is
   //     pending, with the presented session narrowed the same way: nothing is
   //     shown and nothing is read until the session presents full access again.
   {const before=marks();const narrowed=creatorCaps.filter(cap=>!['payroll.calculation.nominal.read','payroll.calculation.prepare'].includes(cap));const hold=await panel.holdDetail();await p.page.goto(link());await hold.issued;creatorCapsOverride=narrowed;await panel.capabilities(narrowed);await hold.release();await panel.settled();await retired('capability-withdrawal');assert.ok((await panel.$('status').innerText()).includes('Se retiraron los datos por un cambio de permisos'));await panel.$('refresh').click();await panel.settled();await retired('capability-withdrawal-refresh');const during=marks();assert.equal(during.reads,before.reads,'capability-withdrawal: no detail read without prepare');unchanged('capability-withdrawal',before);creatorCapsOverride=null;await panel.$('refresh').click();const after=await restored('capability-withdrawal-restore',during);negatives.push({name:'capability-withdrawal',retired:true,detailReadsDuring:during.reads-before.reads,restoreReads:after.reads-during.reads,newPosts:0});check(true,'withdrawing nominal access retires the pending handoff and blocks every read until the same session presents full access again');}
   // N5. Late response: the detail read completes AFTER the presented session
   //     lost prepare (no client event). The product rechecks the session before
   //     applying and refuses the draft; the reference is kept.
   {const before=marks();const hold=await panel.holdDetail();await p.page.goto(link());await hold.issued;creatorCapsOverride=creatorCaps.filter(cap=>cap!=='payroll.calculation.prepare');await hold.release();await panel.settled();await retired('late-response-after-withdrawal');const status=await panel.$('status').innerText();assert.ok(status.includes('Tu cuenta no permite esta operación sobre la nómina'),'late-response: the post-read session check refused the draft: '+status);const during=marks();assert.equal(during.reads-before.reads,1,'late-response: the read itself completed');unchanged('late-response-after-withdrawal',before);creatorCapsOverride=null;await panel.$('refresh').click();const after=await restored('late-response-restore',during);negatives.push({name:'late-response-after-withdrawal',retired:true,detailReadsDuring:1,restoreReads:after.reads-during.reads,newPosts:0});check(true,'a detail response that lands after prepare was withdrawn from the presented session never becomes a draft; the reference survives and the restored session rebuilds it');}
   assert.equal(pagePosts.length,beforePosts,'DECISION124_NEGATIVES_SENT_NOTHING');assert.equal(attemptReads.length,0);
  }else{
   const status=await panel.$('status').innerText();
   check(status.includes('otra liquidación confirmada')&&(await panel.chips()).length===0&&await panel.$('kind').inputValue()==='','a confirmed liquidation elsewhere rejects the whole decision without a partial draft');
  }
  check(pagePosts.length===beforePosts&&mutations===beforeMutations&&calculationPosts===0,'opening the link sends no command and creates no capture');
  assert.deepEqual(readSnapshot(),beforeP);
  // Oracle probe, not a product path: the key is scoped to its actor in SQL124.
  if(receipt){const foreign=await p.request(LIQUIDATION+'?resource=attempt&key='+receipt.key);assert.equal(foreign.response.status(),404);assert.equal(foreign.body.code,'OWN_LIQ_NOT_FOUND');check(true,'even with the key, another actor cannot recover the reviewer receipt');}
  for(const width of[1366,390,320]){await p.page.setViewportSize({width,height:1100});check(await p.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no whole-page overflow at '+width);await p.page.screenshot({path:path.join(output,'creator-'+width+'.png'),fullPage:true});}
  await p.close();
  // 3. A third preparer who did not create the run keeps her 403; nothing nominal.
  const t=await host.open('receiver');observe(t.page,'receiver');const third=runPanel(t.page);
  await t.page.goto(link());await third.settled();
  const forbidden=detailReads.filter(row=>row.actor==='receiver');assert.equal(forbidden.length,1);assert.equal(forbidden[0].status,403);
  const thirdStatus=await third.$('status').innerText();
  check(thirdStatus.includes('sólo quien la creó o quien tiene acceso de revisión')&&thirdStatus.includes('Se conserva la referencia')&&!thirdStatus.includes('intento')&&(await third.chips()).length===0&&await third.$('login').isHidden(),'a non-creator preparer without review access gets 403, keeps the reference and has nothing to prepare');
  const direct=await t.request(LIQUIDATION+'?resource=detail&id='+run.id);assert.equal(direct.response.status(),403);assert.equal(direct.body.code,'OWN_LIQ_FORBIDDEN');
  check(pagePosts.length===beforePosts&&mutations===beforeMutations,'the forbidden handoff sends nothing');
  assert.deepEqual(readSnapshot(),beforeP);
  await t.close();
  assert.deepEqual(evidence.pageErrors,[]);assert.deepEqual(evidence.serverErrors,[]);assert.deepEqual(evidence.external,[]);assert.deepEqual(readFailures,[]);
  if(phase==='handoff')assert.notDeepEqual(readSnapshot(),baseline,'DECISION124_ANNUL_EVENT_RECORDED');else assert.deepEqual(readSnapshot(),baseline,'DECISION124_BLOCKED_PHASE_IS_READ_ONLY');
  // Page POSTs: exactly the reviewer's single real send in handoff, none in blocked;
  // context.request oracle probes are not page traffic and never POST.
  assert.equal(pagePosts.length,phase==='handoff'?1:0,'DECISION124_PAGE_POST_TOTAL');assert.ok(pagePosts.every(row=>row.actor==='reviewer'&&row.path===LIQUIDATION));assert.equal(calculationPosts,0);
  assert.ok(evidence.httpEvidence.every(row=>row.method==='GET'),'DECISION124_ORACLE_PROBES_ARE_GET_ONLY');
  result={version:'own-liquidation-decision124-live190-native-browser.v1',phase,passed:true,sourceCommit:h.sourceCommit,major:h.major,
   runIdJsonSha256:sha(run.id),decisionIdJsonSha256:sha(decisionId),receiptKeyJsonSha256:receipt?sha(receipt.key):null,affected:contractIds.length,
   checks,sourceBookend,httpEvidence:evidence.httpEvidence,detailReads,attemptReads,detailRequests:detailRequests.length,rosterReads:rosterReads.length,negatives,pagePosts:pagePosts.length,decisionPosts:decisionPosts.length,calculationPosts,mutations,
   reportFingerprintAlgorithm:'SHA256 of UTF8 JSON.stringify; distinct from canonical DTO and SQL digests',
   actualSql:true,actualHttp:true,actualBrowser:true,individualDecisionBrowserProven:phase==='handoff',blockedDecisionBrowserProven:phase==='blocked',
   reviewerAnnulledInRealPanel:phase==='handoff',creatorDraftFromOwnDetailRead:phase==='handoff',receiverForbidden:true,foreignAttemptNotFound:!!receipt,
   authenticationFixture:true,completeAuthenticationHandler:false,sourceMode:'public_build_with_twelve_handoff_modules_byte_checked',fullBuildValidation:false,
   withdrawalNegatives:negatives.length,sqlLevelRevocation:false,lossSimulation:false,automaticRecalculation:false,receiptLinkedRecalculationExecuted:false,pending:['reviewer confirm via panel','loss/recover of the annul send','non-creator preparer projection','SQL-level revocation in the browser (proven in-process by the tail probes)'],
   synthetic:true,productionWrites:0,paymentExecuted:false,municipalAcceptance:false};
 }catch(error){
  failure=error;
  fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({passed:false,phase,sourceCommit:h.sourceCommit,major:h.major,message:error.message,checks,negatives,detailReads,attemptReads,pagePosts:pagePosts.length,decisionPosts:decisionPosts.length,calculationPosts,mutations,pageErrors:evidence.pageErrors,serverErrors:evidence.serverErrors,external:evidence.external,synthetic:true},null,2)+'\n',{flag:'wx'});
 }finally{
  try{await host.close();}catch(error){if(!failure)failure=error;}
 }
 if(failure)throw failure;
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 return Object.freeze({...result,receipt});
}
