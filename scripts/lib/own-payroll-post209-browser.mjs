// SOURCE CANDIDATE ONLY. Intended destination: scripts/lib/own-payroll-post209-browser.mjs.
// Not imported or executed by its author. No new foundation, actors, grants or transport.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createOwnRunHandler} from '../../api/internal-own-payroll-run.js';
import {createOwnLiquidationHandler} from '../../api/internal-own-payroll-liquidation.js';
import {createOwnCloseHandler} from '../../api/internal-own-payroll-close.js';
import {createOwnAnnulHandler} from '../../api/internal-own-payroll-annulment.js';
import {createOwnAnnulPreparationHandler} from '../../api/internal-own-payroll-annulment-preparation.js';
import {createEmploymentCatalogHandler} from '../../api/internal-employment-catalog.js';
import {createOwnProgramHandler} from '../../api/internal-own-payroll-program.js';
import {createInternalDataHandler} from '../../api/internal-data.js';
import {OWN_RUN_PREPARE,verifiedWorkspaceCapture} from '../../assets/own-payroll-run-workspace-model.js';
import {OWN_LIQ_REVIEW,verifiedOwnLiquidationDetail,verifiedOwnLiquidationReceipt} from '../../assets/own-payroll-liquidation-model.js';
import {OWN_CLOSE_WRITE,verifiedOwnCloseDetail,verifiedOwnCloseReceipt} from '../../assets/own-payroll-close-model.js';
import {OWN_RUN_FULL_JSON} from '../../assets/own-payroll-response.js';
import {verifiedOwnAnnulPreparation,assertSameOwnAnnulPreparation} from '../../assets/own-payroll-annulment-preparation-model.js';
import {ownAnnulPreparationLink,ownLiquidationDecisionLink} from '../../assets/own-payroll-annulment-preparation-link.js';
import {createCanonical190BrowserHost,calculationPanelReads,PUBLIC_ROOT} from './own-payroll-canonical190-browser-host-qa.mjs';

const RUN='/api/internal-own-payroll-run',LIQ='/api/internal-own-payroll-liquidation',CLOSE='/api/internal-own-payroll-close',ANNUL='/api/internal-own-payroll-annulment',PREPARATION='/api/internal-own-payroll-annulment-preparation';
const CAPTURE='SELECT public.own_run_capture_v1($1::jsonb,$2::jsonb,$3::uuid,$4::text) AS result';
const COMPLETE='SELECT public.own_run_complete_full_v1($1::jsonb,$2::uuid,$3::jsonb,$4::jsonb,$5::text) AS result';
const CONFIRM='SELECT public.own_liquidation_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result';
const CLOSE_COMMAND='SELECT public.own_close_command_full_v1($1::jsonb,$2::jsonb,$3::uuid) AS result';
const sorted=values=>[...values].sort(),sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),rawSha=value=>createHash('sha256').update(value).digest('hex');
const exact=(value,keys)=>assert.deepEqual(Reflect.ownKeys(value).sort(),sorted(keys));
const uuid=value=>assert.match(value,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const FULL=32*1024*1024;
const phaseNames=Object.freeze({'projected-first':'post209-calculate285-browser','projected-second':'post209-calculate570-browser','agreement-replacement':'post209-replacement285-browser','confirm-second':'post209-confirm570-browser','confirm-replacement':'post209-confirm-replacement285-browser','close-union':'post209-close855-browser'});
const assets=Object.freeze(['own-payroll-run-panel.js','own-payroll-run-workspace-model.js','own-payroll-run-model.js','own-payroll-run-date.js','own-payroll-liquidation-panel.js','own-payroll-liquidation-model.js','own-payroll-close-panel.js','own-payroll-close-model.js','own-payroll-annulment-preparation-model.js','own-payroll-annulment-preparation-link.js','own-payroll-readiness-model.js','own-payroll-response.js','native-salary-catalog-model.js','payroll-navigation.js','own-payroll-individual-panel.js']);
function bookend(){
 const pins=assets.map(file=>{const relative='assets/'+file,source=fs.readFileSync(path.join(PUBLIC_ROOT,relative));assert.deepEqual(fs.readFileSync(path.join(PUBLIC_ROOT,'public',relative)),source,'POST209_BUILT_BYTES:'+relative);return{path:relative,bytes:source.length,sha256:rawSha(source)};});
 return{pins,after(){for(const pin of pins){const source=fs.readFileSync(path.join(PUBLIC_ROOT,pin.path));assert.equal(source.length,pin.bytes);assert.equal(rawSha(source),pin.sha256);assert.deepEqual(fs.readFileSync(path.join(PUBLIC_ROOT,'public',pin.path)),source);}}};
}
function base(context,actors,phase){
 exact(context,['h','db','qa','readSnapshot','readLedger','synthetic']);assert.ok(Object.hasOwn(phaseNames,phase));
 const{h,db,qa,readSnapshot,readLedger}=context;assert.strictEqual(h.qa,qa);assert.equal(qa.operationalPairBaseline,'published107');assert.equal(context.synthetic,true);assert.ok([17,18].includes(h.major));assert.match(h.sourceCommit,/^[0-9a-f]{40}$/);
 for(const fn of[db.query,db.run,readSnapshot,readLedger])assert.equal(typeof fn,'function');exact(actors,['reviewer','creator']);
 for(const actor of Object.values(actors)){exact(actor,['principal','session','raw','roleKey']);assert.equal(actor.principal.authorized,true);assert.equal(actor.principal.session.mfa,true);assert.equal(actor.session.id,actor.raw.actorSessionId);assert.equal(actor.principal.tenant.membershipId,actor.raw.membershipId);}
 assert.notEqual(actors.reviewer.raw.membershipId,actors.creator.raw.membershipId);assert.notEqual(actors.reviewer.raw.actorSessionId,actors.creator.raw.actorSessionId);assert.notEqual(actors.reviewer.raw.actorEmail,actors.creator.raw.actorEmail);
 for(const cap of OWN_RUN_PREPARE)assert.ok(actors.creator.principal.tenant.effectiveCapabilities.includes(cap));
 for(const cap of OWN_LIQ_REVIEW)assert.ok(actors.reviewer.principal.tenant.effectiveCapabilities.includes(cap));
 assert.ok(!actors.reviewer.principal.tenant.effectiveCapabilities.includes('payroll.calculation.prepare'));
 for(const cap of['payroll.calculation.approve','payroll.calculation.close'])assert.ok(!actors.creator.principal.tenant.effectiveCapabilities.includes(cap));
}
const historicalReference=row=>({id:row.id,bodySha256:row.bodySha256,payloadSha256:row.payloadSha256,inputSha256:row.inputSha256,resultSha256:row.resultSha256,algorithmSha256:row.algorithmSha256,employeeCount:row.employeeCount,conceptRowCount:row.conceptRowCount,totalsPrecision:row.totalsPrecision,createdAt:row.createdAt,liquidationDate:row.liquidationDate,states:row.states,confirmedContractIds:row.confirmedContractIds});
function references(index,ids){assert.equal(ids.length,13);assert.equal(new Set(ids).size,13);const result=ids.map(id=>{uuid(id);const matches=index.index.filter(row=>row.id===id);assert.equal(matches.length,1);return historicalReference(matches[0]);});return result.sort((a,b)=>a.id.localeCompare(b.id));}
async function wire(session,relative,options={},status=200){
 const result=await session.request(relative,{...options,headers:{Accept:OWN_RUN_FULL_JSON,...options.headers}});assert.equal(result.response.status(),status);assert.equal(result.body.ok,true);
 const headers=result.response.headers();assert.equal(headers['content-type'].split(';')[0],OWN_RUN_FULL_JSON);const size=Buffer.byteLength(JSON.stringify(result.body),'utf8');assert.ok(size<=FULL);assert.equal(Number(headers['x-municontrol-json-bytes']),size);return result.body.data;
}
async function history(session,query,ids){return references(await wire(session,ANNUL+'?'+new URLSearchParams({resource:'review',...query})),ids);}
function replayIdentity(value,original){assert.deepEqual(value,{...original,replayed:true});}
const cells=async locator=>locator.locator('tr').evaluateAll(rows=>rows.map(row=>[...row.cells].map(cell=>cell.textContent)));
const settled=(page,prefix,cls)=>page.waitForFunction(({prefix,cls})=>document.querySelector('[data-'+prefix+'-status]')?.closest('.'+cls)?.getAttribute('aria-busy')==='false',{prefix,cls},{timeout:45000});
const pageWait=(page,origin,endpoint,resource=null)=>page.waitForResponse(response=>{const url=new URL(response.url());return url.origin===origin&&url.pathname===endpoint&&(resource===null?response.request().method()==='POST':url.searchParams.get('resource')===resource);},{timeout:45000});
async function pageWire(response,status){assert.equal(response.status(),status);const body=JSON.parse(await response.text());assert.equal(body.ok,true);assert.ok(Buffer.byteLength(JSON.stringify(body),'utf8')<=FULL);return body.data;}
function pagePosts(page,origin){const entries=[];page.on('request',request=>{const url=new URL(request.url());if(url.origin===origin&&request.method()==='POST'&&url.pathname.startsWith('/api/'))entries.push({path:url.pathname,key:request.headers()['idempotency-key'],body:request.postDataJSON()});});return entries;}
async function screens(page,output,stem){for(const width of[1366,390,320]){await page.setViewportSize({width,height:1100});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(output,stem+'-'+width+'.png'),fullPage:true});}}
// Independent literal oracle for the already installed synthetic190 programme;
// no product formatter/adapter supplies a description, amount or unit here.
function concept(row,items){
 let label,nature,value,kind;
 if(row.conceptCode==='1'){assert.equal(row.nature,'remuneration');assert.equal(row.unit,'money');assert.equal(row.amount,'100.20');label='Básico exclusivamente sintético posterior QA190';nature='Remunerativo';value='$ 100,20';kind='concept';}
 else if(row.conceptCode==='101'){assert.equal(row.nature,'auxiliary');assert.equal(row.unit,'units');assert.equal(row.amount,'10');label='Mes exclusivamente sintético posterior QA190';nature='Auxiliar';value='10 · Unidades';kind='auxiliary';}
 else{assert.match(row.conceptCode,/^7(?:0[0-9]|1[0-7])$/);assert.equal(row.nature,'remuneration');assert.equal(row.unit,'money');assert.equal(row.amount,'1.00');label='Concepto exclusivamente sintético M7 '+row.conceptCode;nature='Remunerativo';value='$ 1,00';kind='concept';}
 const definitions=items.filter(item=>item.kind===kind&&item.agreementCode===row.agreementCode&&item.code===row.conceptCode);assert.equal(definitions.length,1);assert.equal(definitions[0].label,label);assert.equal(definitions[0].nature,row.nature);assert.equal(definitions[0].unit,row.unit);return[row.employeeNumber,row.conceptCode+' · '+label,nature,value,row.ruleReference];
}
function safe(context,phase){return{version:'own-post209-browser.v1',phase,passed:true,sourceCommit:context.h.sourceCommit,major:context.h.major,actualSql:true,actualApiHandler:true,actualHttp:true,actualBrowser:true,authenticationFixture:true,completeAuthenticationHandler:false,allLegacyDecisionUiCasesCovered:false,synthetic:true,productionWrites:0,paymentExecuted:false,municipalAcceptance:false};}
function noErrors(host,readFailures){assert.deepEqual(readFailures,[]);for(const name of['external','pageErrors','serverErrors'])assert.deepEqual(host.evidence[name],[]);}
async function closeHost(host,failure){try{await host.close();}catch(error){if(!failure)throw error;}}
function save(host,name,value){fs.writeFileSync(path.join(host.output,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});}

// This gate observes exact calls on the canonical db.query binder. It neither
// interpolates SQL nor changes the actor/context/values, and delegates unchanged.
// A second command is admitted only as the exact original replay. Completion is
// admitted once, and never during confirmation/close. There is no retry loop.
async function hostFor(context,fixture,mode){
 const{h,db,qa}=context,readFailures=[],calls={capture:[],complete:[],command:[]},source=bookend();let originalCall=null;
 const command=mode==='calculation'?CAPTURE:mode==='confirmation'?CONFIRM:CLOSE_COMMAND;
 const sql={query:async(statement,values)=>{
  if(statement===command){
   assert.ok(calls[mode==='calculation'?'capture':'command'].length<2,'POST209_MORE_THAN_ORIGINAL_AND_REPLAY');
   const body=JSON.parse(values[1]);if(mode==='calculation'||mode==='close')assert.deepEqual(body,fixture.expectedBody);
   if(mode==='confirmation'){assert.equal(body.command,'confirm');assert.equal(body.runId,fixture.run.id);assert.equal(body.resultSha256,fixture.run.saved.resultSha256);assert.deepEqual(body.selection,{kind:'contracts',values:sorted(fixture.contractIds)});assert.equal(body.reason,fixture.reason);assert.equal(body.reviewConfirmed,true);}
   uuid(values[2]);if(originalCall)assert.deepEqual(values,originalCall);else originalCall=structuredClone(values);
   const result=await db.query(statement,values);calls[mode==='calculation'?'capture':'command'].push({key:values[2],body,receipt:result?.[0]?.result});return result;
  }
  if(mode==='calculation'&&statement===COMPLETE){assert.equal(calls.capture.length,1);assert.equal(calls.complete.length,0);assert.equal(values[1],calls.capture[0].receipt.id);const result=await db.query(statement,values);calls.complete.push({id:values[1],saved:result?.[0]?.result});return result;}
  if(/^SELECT public\.own_(?:run_capture|run_complete|liquidation_command|annul_command|close_command)/.test(statement))throw Error('POST209_UNEXPECTED_WRITE:'+mode);
  return db.query(statement,values);
 }};
 const reads=mode==='calculation'?calculationPanelReads(db,qa.schema):null;
 const host=await createCanonical190BrowserHost({h,actors:new Map(Object.entries(fixture.actors)),getSql:async()=>sql,outputName:phaseNames[fixture.phase],handlers:deps=>{
  const routes=new Map([[LIQ,createOwnLiquidationHandler(deps)],[ANNUL,createOwnAnnulHandler(deps)]]);
  if(mode==='calculation'){
   routes.set(RUN,createOwnRunHandler(deps));routes.set(PREPARATION,createOwnAnnulPreparationHandler(deps));
   routes.set('/api/internal-employment-catalog',createEmploymentCatalogHandler({...deps,getSql:async()=>reads}));
   routes.set('/api/internal-own-payroll-program',createOwnProgramHandler({...deps,getSql:async()=>reads}));
   routes.set('/api/internal-data',createInternalDataHandler({env:deps.env,requireCompatibleInternalAccess:deps.requireAccess,actionMutationSession:deps.sessionFor,getInternalSql:async()=>reads,getActionCenterSql:async()=>reads,reportReadFailure:error=>readFailures.push(String(error?.message??error))}));
  }
  if(mode==='close')routes.set(CLOSE,createOwnCloseHandler(deps));
  const mutation=mode==='calculation'?RUN:mode==='confirmation'?LIQ:CLOSE;
  for(const[endpoint,handler]of routes)routes.set(endpoint,async(req,res)=>{assert.ok(req.method==='GET'||req.method==='POST'&&endpoint===mutation,'POST209_ROUTE_MUTATION_OUTSIDE_PHASE');return handler(req,res);});
  return routes;
 }});
 return{host,source,calls,readFailures};
}

export async function verifyPost209CalculationBrowserOn190(context,fixture){
 exact(fixture,['phase','source','projection','expectedBody','expectedSaved','contractIds','historicalRunIds','actors']);base(context,fixture.actors,fixture.phase);
 const{phase,source:reference,projection,expectedBody,expectedSaved,contractIds,historicalRunIds}=fixture;
 assert.ok(['projected-first','projected-second','agreement-replacement'].includes(phase));const count=phase==='projected-second'?570:285;assert.equal(contractIds.length,count);assert.equal(new Set(contractIds).size,count);assert.deepEqual(expectedBody.selection,{kind:'contracts',values:sorted(contractIds)});assert.equal(expectedBody.version,'own-payroll-run-command.v2');assert.equal(expectedBody.populationDomain,'native_registered');assert.equal(expectedBody.liquidationType,'monthly');assert.equal(Object.hasOwn(expectedBody,'sourceReference'),false);assert.equal(Object.hasOwn(expectedBody,'reviewConfirmed'),false);
 if(phase==='agreement-replacement'){exact(reference,['kind','runId','decisionId']);assert.equal(reference.kind,'decision');uuid(reference.runId);uuid(reference.decisionId);assert.equal(projection,null);}
 else{exact(reference,['kind','id']);assert.equal(reference.kind,'projection');uuid(reference.id);assert.equal(projection.source.id,reference.id);await verifiedOwnAnnulPreparation(projection,{scopeVersion:projection.scopeVersion,sourceId:reference.id});}
 const{host,source,calls,readFailures}=await hostFor(context,fixture,'calculation');let failure,result,capture;
 try{
  const reviewer=await host.open('reviewer'),creator=await host.open('creator'),page=creator.page,$=key=>page.locator('[data-own-'+key+']'),posts=pagePosts(page,host.origin);
  const query={period:expectedBody.period,liquidationType:expectedBody.liquidationType},historicalBefore=await history(reviewer,query,historicalRunIds),before=context.readSnapshot(),beforeLedger=await context.readLedger();
  const link=reference.kind==='projection'?ownAnnulPreparationLink(reference.id):ownLiquidationDecisionLink(reference.runId,reference.decisionId);
  const first=pageWait(page,host.origin,reference.kind==='projection'?PREPARATION:LIQ,'detail');await page.goto(host.origin+link);const firstData=await pageWire(await first,200);
  if(reference.kind==='projection'){
   const checked=await verifiedOwnAnnulPreparation(firstData,{scopeVersion:projection.scopeVersion,sourceId:reference.id});assertSameOwnAnnulPreparation(projection,checked);
   await $('projected-date').locator('option[value="'+expectedBody.liquidationDate+'"]').waitFor();await settled(page,'own','own-run');
   assert.equal(await $('projected-date').inputValue(),'');assert.equal(await $('projected-use').isDisabled(),true);assert.equal(await $('confirm').isChecked(),false);assert.equal(await $('chips').locator('span > span').count(),0);
   await $('projected-date').selectOption(expectedBody.liquidationDate);const refresh=pageWait(page,host.origin,PREPARATION,'detail');await $('projected-use').click();assertSameOwnAnnulPreparation(projection,await verifiedOwnAnnulPreparation(await pageWire(await refresh,200),{scopeVersion:projection.scopeVersion,sourceId:reference.id}));
  }else{const detail=await verifiedOwnLiquidationDetail(firstData);assert.equal(detail.id,reference.runId);}
  await $('chips').locator('span > span').nth(count-1).waitFor();await settled(page,'own','own-run');
  const selected=new Set(contractIds),people=expectedSaved.input.employees.filter(row=>selected.has(row.contractId));assert.equal(people.length,count);
  const chips=await $('chips').locator('span > span').allTextContents();assert.deepEqual(sorted(chips.map(text=>text.trim().replace(/^Legajo /,'').replace(/ · .*$/,''))),sorted(people.map(row=>row.employeeNumber)));assert.ok(chips.every(text=>text.trim().endsWith(' · Nombre no informado')));
  for(const[field,value]of[['period',expectedBody.period],['date',expectedBody.liquidationDate],['type','monthly'],['kind','contracts']])assert.equal(await $(field).inputValue(),value);
  assert.equal(await $('readiness').getAttribute('data-state'),'success');assert.equal(await $('confirm').isChecked(),false);assert.equal(await $('send').isDisabled(),true);assert.equal(posts.length,0);assert.equal(calls.capture.length,0);assert.equal(calls.complete.length,0);assert.deepEqual(context.readSnapshot(),before);assert.deepEqual(await context.readLedger(),beforeLedger);
  await screens(page,host.output,'unconfirmed');
  await $('confirm').check();assert.equal(await $('send').isDisabled(),false);const submitted=pageWait(page,host.origin,RUN);await $('send').click();capture=await verifiedWorkspaceCapture(await pageWire(await submitted,201));
  await $('result').waitFor({state:'visible'});await settled(page,'own','own-run');assert.equal(capture.replayed,false);assert.deepEqual(capture.body,expectedBody);assert.equal(calls.capture.length,1);assert.equal(calls.complete.length,1);assert.deepEqual(capture.saved,calls.complete[0].saved);assert.deepEqual(posts,[{path:RUN,key:capture.key,body:{operation:'calculate',payload:expectedBody}}]);
  assert.equal(capture.saved.result.employeeCount,count);assert.equal(capture.saved.result.rowCount,count*20);assert.equal(capture.saved.result.payrollCalculated,true);assert.equal(capture.saved.result.paymentExecuted,false);assert.deepEqual(sorted(capture.saved.input.employees.map(row=>row.contractId)),sorted(contractIds));assert.deepEqual(capture.saved.input.rules,expectedSaved.input.rules);assert.deepEqual(capture.saved.result.rows,expectedSaved.result.rows.filter(row=>selected.has(row.contractId)));assert.deepEqual(capture.saved.result.employeeTotals,expectedSaved.result.employeeTotals.filter(row=>selected.has(row.contractId)));
  const after=context.readSnapshot(),afterLedger=await context.readLedger();assert.deepEqual(afterLedger,{...beforeLedger,captures:beforeLedger.captures+1,saved:beforeLedger.saved+1});
  const recovering=pageWait(page,host.origin,RUN,'attempt');await $('recover').click();const recovered=await verifiedWorkspaceCapture(await pageWire(await recovering,200),{key:capture.key,body:expectedBody});replayIdentity(recovered,capture);await settled(page,'own','own-run');
  replayIdentity(await verifiedWorkspaceCapture(await wire(creator,RUN+'?resource=attempt&key='+capture.key),{key:capture.key,body:expectedBody}),capture);
  const replayed=await verifiedWorkspaceCapture(await wire(creator,RUN,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':capture.key},data:{operation:'calculate',payload:expectedBody}}),{key:capture.key,body:expectedBody});replayIdentity(replayed,capture);assert.equal(calls.capture.length,2);assert.equal(calls.complete.length,1);assert.equal(posts.length,1);assert.deepEqual(context.readSnapshot(),after);assert.deepEqual(await context.readLedger(),afterLedger);
  const rows=capture.saved.result.rows,pages=rows.length/25,items=capture.payload.programState.salaryCatalog.items;assert.ok(Number.isInteger(pages));assert.equal(await $('totals').locator('tr').count(),count);
  for(let n=0;n<pages;n++){assert.equal((await $('page').innerText()).trim(),'Página '+(n+1)+' de '+pages);assert.deepEqual(await cells($('rows')),rows.slice(n*25,(n+1)*25).map(row=>concept(row,items)));if(n<pages-1)await $('next').click();else assert.equal(await $('next').isDisabled(),true);}
  await $('search').fill('no-post209-concept-match');assert.equal(await $('rows').locator('tr').count(),0);assert.equal(await $('totals').locator('tr').count(),count);
  const individualId=contractIds[0];await $('totals').locator('[data-own-individual-open="'+individualId+'"]').click();await settled(page,'own','own-run');const individual=$('individual'),entries=individual.locator('[data-individual-concepts] li'),individualRows=rows.filter(row=>row.contractId===individualId);assert.equal(await entries.count(),20);
  for(const[n,row]of individualRows.entries()){const oracle=concept(row,items);assert.equal(await entries.nth(n).locator('h5').textContent(),'Concepto '+row.conceptCode+' · '+oracle[1].slice(row.conceptCode.length+3));assert.equal(await entries.nth(n).locator('.own-individual-amount').textContent(),oracle[3]);assert.equal(await entries.nth(n).locator('details p').textContent(),row.ruleReference);}
  await screens(page,host.output,'calculated');assert.deepEqual(await history(reviewer,query,historicalRunIds),historicalBefore);noErrors(host,readFailures);source.after();
  result={...safe(context,phase),sourceBookend:source.pins,httpEvidence:host.evidence.httpEvidence,population:count,conceptRows:count*20,conceptPages:pages,pagePosts:1,httpCalculatePosts:2,captureRpcCalls:2,completionRpcCalls:1,addedCaptures:1,addedSavedResults:1,addedLiquidationDecisions:0,addedCloseEvents:0,before:beforeLedger,after:afterLedger,captureId:capture.id,keyJsonSha256:sha(capture.key),bodySha256:capture.bodySha256,inputSha256:capture.saved.inputSha256,resultSha256:capture.saved.resultSha256,originalRecoveryAndReplay:true,recoveryAndReplayAddedRows:0,historicalThirteenPreserved:true,sourceReferenceStored:false,atomicGetToCalculation:false,durableReceiptLinkCreated:false,automaticRecalculation:false};
 }catch(error){failure=error;save(host,'failure.json',{passed:false,phase,message:error.message,callCounts:Object.fromEntries(Object.entries(calls).map(([key,value])=>[key,value.length])),synthetic:true});}
 finally{await closeHost(host,failure);}
 if(failure)throw failure;save(host,'report.json',result);return Object.freeze({...result,capture});
}

export async function verifyPost209ConfirmationBrowserOn190(context,fixture){
 exact(fixture,['phase','run','contractIds','historicalRunIds','actors','reason']);base(context,fixture.actors,fixture.phase);assert.ok(['confirm-second','confirm-replacement'].includes(fixture.phase));const{run,contractIds,historicalRunIds,phase,reason}=fixture,count=phase==='confirm-second'?570:285;assert.equal(contractIds.length,count);assert.deepEqual(sorted(run.saved.input.employees.map(row=>row.contractId)),sorted(contractIds));assert.equal(run.saved.result.employeeCount,count);assert.equal(run.saved.result.rowCount,count*20);assert.equal(run.saved.input.rules.length,20);
 const{host,source,calls,readFailures}=await hostFor(context,fixture,'confirmation');let failure,result,receipt;
 try{
  const reviewer=await host.open('reviewer'),page=reviewer.page,$=key=>page.locator('[data-liq-'+key+']'),posts=pagePosts(page,host.origin),query={period:run.body.period,liquidationType:run.body.liquidationType},historicalBefore=await history(reviewer,query,historicalRunIds),before=context.readSnapshot(),beforeLedger=await context.readLedger();
  const detail=await verifiedOwnLiquidationDetail(await wire(reviewer,LIQ+'?resource=detail&id='+run.id));assert.deepEqual(detail.capture.saved,run.saved);assert.ok(detail.employees.every(row=>row.state==='calculated'&&row.blockedBy===null&&row.allowedCommands.includes('confirm')));
  await page.goto(host.origin+'/nomina#decisiones');const button=$('history').locator('[data-liq-run-id="'+run.id+'"]');await button.waitFor({state:'visible'});await settled(page,'liq','own-liquidation');const reading=pageWait(page,host.origin,LIQ,'detail');await button.click();assert.deepEqual((await verifiedOwnLiquidationDetail(await pageWire(await reading,200))).capture.saved,run.saved);await $('detail').waitFor({state:'visible'});await settled(page,'liq','own-liquidation');
  await $('command').selectOption('confirm');await $('kind').selectOption('contracts');assert.deepEqual(sorted(await $('values').locator('option').evaluateAll(options=>options.map(option=>option.value))),sorted(contractIds));await $('values').selectOption(contractIds);await $('reason').fill(reason);assert.equal(await $('confirm').isChecked(),false);assert.equal(await $('send').isDisabled(),true);assert.ok((await $('scope').innerText()).includes(count+' legajos del alcance completo. Todos admiten esta decisión.'));
  const people=new Map(run.saved.input.employees.map(row=>[row.contractId,row])),reviewPeople=detail.employees.map(row=>people.get(row.contractId)),pages=Math.ceil(count/25),seen=[];
  for(let n=0;n<pages;n++){assert.equal((await $('review-page').innerText()).trim(),(n+1)+' / '+pages);const expected=reviewPeople.slice(n*25,(n+1)*25).map(row=>[row.employeeNumber,row.agreementCode,row.departmentCode,'Pendiente de confirmación','$ 118,20','$ 0,00','$ 118,20','Admite la decisión']);const actual=await cells($('review-rows'));assert.deepEqual(actual,expected);seen.push(...actual.map(row=>row[0]));if(n<pages-1)await $('review-next').click();else assert.equal(await $('review-next').isDisabled(),true);}
  assert.equal(seen.length,count);assert.equal(new Set(seen).size,count);const total=await $('review-totals').innerText();assert.ok(total.includes(count===285?'$ 33.687,00':'$ 67.374,00'));await $('review-search').fill('no-post209-person-match');assert.equal(await $('review-rows').locator('tr').count(),1);assert.equal(await $('review-totals').innerText(),total);assert.ok((await $('review-range').innerText()).includes(count+' afectados'));await screens(page,host.output,'review');assert.equal(posts.length,0);assert.equal(calls.command.length,0);assert.deepEqual(context.readSnapshot(),before);assert.deepEqual(await context.readLedger(),beforeLedger);
  await $('confirm').check();assert.equal(await $('send').isDisabled(),false);const sent=pageWait(page,host.origin,LIQ);await $('send').click();receipt=await verifiedOwnLiquidationReceipt(await pageWire(await sent,201));await settled(page,'liq','own-liquidation');assert.equal(receipt.replayed,false);assert.equal(calls.command.length,1);assert.deepEqual(posts,[{path:LIQ,key:receipt.key,body:{operation:'command',payload:receipt.body}}]);assert.deepEqual(sorted(receipt.affected.map(row=>row.contractId)),sorted(contractIds));assert.ok(receipt.affected.every(row=>row.state==='confirmed'));
  const after=context.readSnapshot(),afterLedger=await context.readLedger();assert.deepEqual(afterLedger,{...beforeLedger,liquidationEvents:beforeLedger.liquidationEvents+1});const readingAttempt=pageWait(page,host.origin,LIQ,'attempt');await $('recover').click();replayIdentity(await verifiedOwnLiquidationReceipt(await pageWire(await readingAttempt,200)),receipt);await settled(page,'liq','own-liquidation');
  replayIdentity(await verifiedOwnLiquidationReceipt(await wire(reviewer,LIQ+'?resource=attempt&key='+receipt.key)),receipt);replayIdentity(await verifiedOwnLiquidationReceipt(await wire(reviewer,LIQ,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':receipt.key},data:{operation:'command',payload:receipt.body}})),receipt);assert.equal(calls.command.length,2);assert.equal(posts.length,1);assert.deepEqual(context.readSnapshot(),after);assert.deepEqual(await context.readLedger(),afterLedger);
  const current=await verifiedOwnLiquidationDetail(await wire(reviewer,LIQ+'?resource=detail&id='+run.id));assert.deepEqual(current.capture.saved,run.saved);for(const employee of current.employees){const decided=receipt.affected.find(row=>row.contractId===employee.contractId);assert.ok(decided);assert.equal(employee.state,'confirmed');assert.equal(employee.version,decided.version);assert.equal(employee.liquidationVersion,decided.liquidationVersion);}assert.deepEqual(await history(reviewer,query,historicalRunIds),historicalBefore);noErrors(host,readFailures);source.after();
  result={...safe(context,phase),sourceBookend:source.pins,httpEvidence:host.evidence.httpEvidence,population:count,conceptRows:count*20,reviewPages:pages,pagePosts:1,httpDecisionPosts:2,decisionRpcCalls:2,addedCaptures:0,addedSavedResults:0,addedLiquidationDecisions:1,addedCloseEvents:0,before:beforeLedger,after:afterLedger,receiptId:receipt.id,bodySha256:receipt.bodySha256,originalRecoveryAndReplay:true,recoveryAndReplayAddedRows:0,historicalThirteenPreserved:true,reviewerPrepareGranted:false};
 }catch(error){failure=error;save(host,'failure.json',{passed:false,phase,message:error.message,commandCalls:calls.command.length,synthetic:true});}
 finally{await closeHost(host,failure);}
 if(failure)throw failure;save(host,'report.json',result);return Object.freeze({...result,receipt});
}

export async function verifyPost209CloseBrowserOn190(context,fixture){
 exact(fixture,['phase','expectedBody','captures','confirmations','historicalRunIds','actors']);base(context,fixture.actors,fixture.phase);assert.equal(fixture.phase,'close-union');const{phase,expectedBody,captures,confirmations,historicalRunIds}=fixture;for(const cap of OWN_CLOSE_WRITE)assert.ok(fixture.actors.reviewer.principal.tenant.effectiveCapabilities.includes(cap));assert.equal(captures.length,2);assert.deepEqual(captures.map(row=>row.saved.result.employeeCount),[285,570]);assert.equal(confirmations.length,2);
 const allIds=sorted(captures.flatMap(row=>row.saved.input.employees.map(person=>person.contractId)));assert.equal(allIds.length,855);assert.equal(new Set(allIds).size,855);assert.deepEqual(expectedBody.selection,{kind:'contracts',values:allIds});assert.equal(expectedBody.command,'close');assert.equal(expectedBody.groupId,null);assert.equal(expectedBody.reviewConfirmed,true);
 const{host,source,calls,readFailures}=await hostFor(context,fixture,'close');let failure,result,receipt;
 try{
  const reviewer=await host.open('reviewer'),page=reviewer.page,$=key=>page.locator('[data-close-'+key+']'),posts=pagePosts(page,host.origin),query={period:expectedBody.period,liquidationType:expectedBody.liquidationType},historicalBefore=await history(reviewer,query,historicalRunIds),before=context.readSnapshot(),beforeLedger=await context.readLedger();
  const detail=await verifiedOwnCloseDetail(await wire(reviewer,CLOSE+'?'+new URLSearchParams({resource:'detail',...query})));assert.equal(detail.rows.length,855);assert.deepEqual(sorted(detail.rows.map(row=>row.contractId)),allIds);const byContract=new Map(captures.flatMap(run=>run.saved.input.employees.map(person=>[person.contractId,run]))),confirmed=new Map(confirmations.flatMap(decision=>decision.affected.map(row=>[row.contractId,row])));assert.equal(confirmed.size,855);
  for(const row of detail.rows){const run=byContract.get(row.contractId),decision=confirmed.get(row.contractId);assert.equal(row.state,'confirmed');assert.equal(row.canClose,true);assert.equal(row.runId,run.id);assert.equal(row.resultSha256,run.saved.resultSha256);assert.equal(row.liquidationVersion,decision.liquidationVersion);assert.deepEqual(detail.captures.find(value=>value.id===run.id).saved,run.saved);}
  await page.goto(host.origin+'/nomina#cierre');await $('consult').waitFor({state:'visible'});await settled(page,'close','own-close');await $('period').fill(query.period);await $('type').selectOption(query.liquidationType);const reading=pageWait(page,host.origin,CLOSE,'detail');await $('consult').click();assert.deepEqual(await verifiedOwnCloseDetail(await pageWire(await reading,200)),detail);await $('detail').waitFor({state:'visible'});await settled(page,'close','own-close');
  const pages=Math.ceil(855/25),seen=[];for(let n=0;n<pages;n++){assert.equal((await $('page').innerText()).trim(),(n+1)+' / '+pages);const expected=detail.rows.slice(n*25,(n+1)*25).map(row=>[row.employeeNumber,row.agreementCode,row.departmentCode,'Confirmada',String(row.liquidationVersion),'Admite cierre']);const actual=await cells($('rows'));assert.deepEqual(actual,expected);seen.push(...actual.map(row=>row[0]));if(n<pages-1)await $('next').click();else assert.equal(await $('next').isDisabled(),true);}assert.equal(seen.length,855);assert.equal(new Set(seen).size,855);
  await $('command').selectOption('close');await $('kind').selectOption('contracts');assert.deepEqual(sorted(await $('values').locator('option').evaluateAll(options=>options.map(option=>option.value))),allIds);await $('values').selectOption(allIds);await $('reason').fill(expectedBody.reason);assert.equal(await $('confirm').isChecked(),false);assert.equal(await $('send').isDisabled(),true);assert.ok((await $('scope').innerText()).includes('855 de 855'));assert.ok((await $('preview').innerText()).includes('$ 101.061,00'));const preview=await $('preview').innerText();await $('search').fill('no-post209-close-match');assert.equal(await $('rows').locator('tr').count(),0);assert.equal(await $('preview').innerText(),preview);assert.ok((await $('scope').innerText()).includes('855 de 855'));await screens(page,host.output,'review');assert.deepEqual(context.readSnapshot(),before);assert.deepEqual(await context.readLedger(),beforeLedger);assert.equal(posts.length,0);assert.equal(calls.command.length,0);
  await $('confirm').check();assert.equal(await $('send').isDisabled(),false);const sent=pageWait(page,host.origin,CLOSE);await $('send').click();receipt=await verifiedOwnCloseReceipt(await pageWire(await sent,201));await $('historic').waitFor({state:'visible'});await settled(page,'close','own-close');assert.equal(receipt.replayed,false);assert.deepEqual(receipt.body,expectedBody);assert.deepEqual(posts,[{path:CLOSE,key:receipt.key,body:{operation:'command',payload:expectedBody}}]);assert.equal(calls.command.length,1);
  const snapshot=receipt.snapshot;assert.equal(snapshot.employeeCount,855);assert.equal(snapshot.populationCount,855);assert.equal(snapshot.populationComplete,true);assert.equal(snapshot.conceptCount,17100);assert.equal(snapshot.payrollCalculated,true);assert.equal(snapshot.payrollPosted,false);assert.equal(snapshot.paymentExecuted,false);assert.deepEqual(sorted(snapshot.employees.map(row=>row.contractId)),allIds);assert.deepEqual(sorted([...new Set(snapshot.employees.map(row=>row.runId))]),sorted(captures.map(row=>row.id)));
  assert.deepEqual(snapshot.concepts,allIds.flatMap(id=>byContract.get(id).saved.result.rows.filter(row=>row.contractId===id)));for(const employee of snapshot.employees){const run=byContract.get(employee.contractId),total=run.saved.result.employeeTotals.find(row=>row.contractId===employee.contractId);assert.equal(employee.runId,run.id);assert.equal(employee.inputSha256,run.saved.inputSha256);assert.equal(employee.resultSha256,run.saved.resultSha256);assert.equal(employee.liquidationVersion,confirmed.get(employee.contractId).liquidationVersion);assert.deepEqual(employee.totals,total);}
  assert.equal(await $('historic-rows').locator('tr').count(),855);for(const row of await cells($('historic-rows'))){assert.equal(row[2],'$ 118,20');assert.equal(row[3],'$ 0,00');assert.equal(row[4],'$ 118,20');}await screens(page,host.output,'closed');
  const after=context.readSnapshot(),afterLedger=await context.readLedger();assert.deepEqual(afterLedger,{...beforeLedger,closeEvents:beforeLedger.closeEvents+1});const recovering=pageWait(page,host.origin,CLOSE,'attempt');await $('recover').click();replayIdentity(await verifiedOwnCloseReceipt(await pageWire(await recovering,200)),receipt);await settled(page,'close','own-close');
  replayIdentity(await verifiedOwnCloseReceipt(await wire(reviewer,CLOSE+'?resource=group&id='+receipt.groupId)),receipt);replayIdentity(await verifiedOwnCloseReceipt(await wire(reviewer,CLOSE+'?resource=attempt&key='+receipt.key)),receipt);replayIdentity(await verifiedOwnCloseReceipt(await wire(reviewer,CLOSE,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':receipt.key},data:{operation:'command',payload:expectedBody}})),receipt);assert.equal(calls.command.length,2);assert.equal(posts.length,1);assert.deepEqual(context.readSnapshot(),after);assert.deepEqual(await context.readLedger(),afterLedger);assert.deepEqual(await history(reviewer,query,historicalRunIds),historicalBefore);noErrors(host,readFailures);source.after();
  result={...safe(context,phase),sourceBookend:source.pins,httpEvidence:host.evidence.httpEvidence,population:855,conceptRows:17100,reviewPages:pages,pagePosts:1,httpClosePosts:2,closeRpcCalls:2,addedCaptures:0,addedSavedResults:0,addedLiquidationDecisions:0,addedCloseEvents:1,before:beforeLedger,after:afterLedger,closedGroupId:receipt.groupId,bodySha256:receipt.bodySha256,snapshotSha256:receipt.snapshotSha256,sourceRuns:sorted(captures.map(row=>row.id)),originalRecoveryAndReplay:true,recoveryAndReplayAddedRows:0,historicalThirteenPreserved:true};
 }catch(error){failure=error;save(host,'failure.json',{passed:false,phase,message:error.message,commandCalls:calls.command.length,synthetic:true});}
 finally{await closeHost(host,failure);}
 if(failure)throw failure;save(host,'report.json',result);return Object.freeze({...result,receipt});
}
