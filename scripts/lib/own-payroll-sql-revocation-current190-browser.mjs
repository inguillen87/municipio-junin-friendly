// Private source candidate only: never imported, constructed or executed by its author.
// Same canonical190 h/db/actors and first855 capture; no alternate fixture/role.
// TWO existing override rows are temporarily denied, one at a time, then restored
// exactly. No calculation/decision/annul/close is sent by this browser phase.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createOwnLiquidationHandler} from '../../api/internal-own-payroll-liquidation.js';
import {employeeContext} from '../../lib/internal-native-employees.js';
import {OWN_LIQ_REVIEW,verifiedOwnLiquidationDetail} from '../../assets/own-payroll-liquidation-model.js';
import {OWN_RUN_FULL_JSON} from '../../assets/own-payroll-response.js';
import {ownerDecisionQaLiteral as q} from './municipal-owner-adoption-decision-qa.mjs';
import {performancePreservationSnapshot} from '../verify-documentary-roster-performance.mjs';
import {createCanonical190BrowserHost,PUBLIC_ROOT} from './own-payroll-canonical190-browser-host-qa.mjs';

const LIQ='/api/internal-own-payroll-liquidation';
const BOOT='SELECT public.own_liquidation_bootstrap_v1($1::jsonb) AS result';
const DETAIL='SELECT public.own_liquidation_detail_full_v1($1::jsonb,$2::uuid) AS result';
const CASES=Object.freeze([
 {caseId:'855-revocation-approval',capability:'payroll.calculation.approve',nativeCode:'OWN_LIQ_FORBIDDEN'},
 {caseId:'855-revocation-nominal',capability:'payroll.calculation.nominal.read',nativeCode:'OWN_RUN_FORBIDDEN'}
]);
const ASSETS=Object.freeze(['own-payroll-liquidation-panel.js','own-payroll-liquidation-model.js',
 'own-payroll-individual-panel.js','own-payroll-response.js','own-payroll-run-workspace-model.js',
 'native-salary-catalog-model.js','payroll-navigation.js']);
const sha=value=>createHash('sha256').update(value).digest('hex');
const exact=(value,keys)=>assert.deepEqual(Reflect.ownKeys(value).sort(),[...keys].sort());

export async function verifyOwnSqlRevocationBrowserOn190(context){
 exact(context,['version','h','db','qa','maker','reviewer','capture','readSnapshot']);
 assert.equal(context.version,'own-sql-revocation-live190-context.v1');
 const {h,db,qa,maker,reviewer,capture,readSnapshot}=context;
 assert.strictEqual(h.qa,qa);assert.ok([17,18].includes(h.major));
 assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.match(h.sourceCommit,/^[a-f0-9]{40}$/);
 assert.equal(qa.operationalPairBaseline,'published107');
 assert.equal(capture.saved.result.employeeCount,855);assert.equal(capture.saved.result.rowCount,17100);
 assert.equal(capture.saved.input.rules.length,20);assert.equal(typeof readSnapshot,'function');
 assert.equal(typeof db.query,'function');assert.equal(typeof db.run,'function');assert.equal(typeof db.expectQueryError,'function');
 assert.equal(reviewer.principal.authorized,true);assert.equal(reviewer.principal.session.mfa,true);
 assert.equal(reviewer.session.id,qa.checker.actorSessionId);assert.equal(maker.session.id,qa.actor.actorSessionId);
 assert.equal(reviewer.principal.tenant.membershipId,qa.checker.membershipId);
 assert.notEqual(qa.actor.membershipId,qa.checker.membershipId);
 assert.ok(OWN_LIQ_REVIEW.every(cap=>reviewer.principal.tenant.effectiveCapabilities.includes(cap)));
 assert.ok(!reviewer.principal.tenant.effectiveCapabilities.includes('payroll.calculation.prepare'));
 const stalePrincipal=structuredClone(reviewer.principal),staleSession=structuredClone(reviewer.session),reviewerContext=JSON.stringify(employeeContext(reviewer.principal,reviewer.session));
 const sameClient=()=>{assert.deepEqual(reviewer.principal,stalePrincipal);assert.deepEqual(reviewer.session,staleSession);};
 const schema=qa.schema,overrideTable=schema+'.tenant_membership_capability_override';
 const readRow=capability=>h.json([`SELECT to_jsonb(o) FROM ${overrideTable} o WHERE membership_id=${q(qa.checker.membershipId)}::uuid AND capability_key=${q(capability)}`],{readOnly:true});
 const audit=()=>h.json([performancePreservationSnapshot(),`SELECT jsonb_build_object(
  'snapshot',current_setting('municontrol_documentary_install.after')::jsonb,
  'overrides',(SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY membership_id,capability_key COLLATE "C"),'[]'::jsonb) FROM ${overrideTable} o),
  'effective',(SELECT coalesce(jsonb_agg(jsonb_build_object('membershipId',m.id,'capabilities',coalesce((SELECT jsonb_agg(capability_key ORDER BY capability_key COLLATE "C") FROM ${schema}.tenant_iam_effective_capabilities(m.id)),'[]'::jsonb)) ORDER BY m.id),'[]'::jsonb) FROM ${schema}.tenant_membership m),
  'reviewerRole',(SELECT role_key FROM ${schema}.tenant_membership WHERE id=${q(qa.checker.membershipId)}::uuid))`],{readOnly:true,fullJson:true});
 const before=readSnapshot(),beforeAudit=audit();
 assert.ok(typeof beforeAudit.reviewerRole==='string'&&beforeAudit.reviewerRole.length>0);
 // Mask ONLY the row digest of this ONE existing override table during denial.
 // Its count/meta and every other table, role, session, function and security
 // object remain compared. Full overrides/effective sets below prove the row delta.
 const withoutOverrideDigest=value=>{
  const clone=structuredClone(value),tables=clone.tables.filter(row=>row.schema===schema&&row.name==='tenant_membership_capability_override');
  assert.equal(tables.length,1);assert.match(tables[0].rowsSha256,/^[a-f0-9]{64}$/);
  tables[0].rowsSha256='EXPLICIT_ONE_EXISTING_OVERRIDE_ROW_CHANGE';return clone;
 };
 const rowKey=row=>row.membership_id+':'+row.capability_key;
 const knownRows=new Map();
 for(const {capability}of CASES){
  const row=readRow(capability);assert.ok(row);assert.equal(row.membership_id,qa.checker.membershipId);
  assert.equal(row.capability_key,capability);assert.equal(row.allow_override,true);assert.equal(row.deny_override,false);
  assert.deepEqual(beforeAudit.overrides.find(value=>rowKey(value)===rowKey(row)),row);knownRows.set(capability,row);
 }
 let iamWriteCalls=0;
 const changeExisting=(expected,next)=>{
  assert.ok(CASES.some(row=>row.capability===expected.capability_key));
  assert.equal(expected.membership_id,qa.checker.membershipId);
  assert.equal(typeof next.allow_override,'boolean');assert.equal(typeof next.deny_override,'boolean');assert.notEqual(next.allow_override,next.deny_override);
  const where=`membership_id=${q(expected.membership_id)}::uuid AND capability_key=${q(expected.capability_key)}`;
  iamWriteCalls++;
  return h.json([`DO $revocation190$ DECLARE current_row jsonb;changed integer;BEGIN
   SELECT to_jsonb(o) INTO current_row FROM ${overrideTable} o WHERE ${where} FOR UPDATE;
   IF current_row IS DISTINCT FROM ${q(JSON.stringify(expected))}::jsonb THEN RAISE EXCEPTION 'REVOCATION190_OVERRIDE_CHANGED';END IF;
   UPDATE ${overrideTable} SET allow_override=${next.allow_override?'true':'false'},deny_override=${next.deny_override?'true':'false'} WHERE ${where};
   GET DIAGNOSTICS changed=ROW_COUNT;IF changed<>1 THEN RAISE EXCEPTION 'REVOCATION190_EXACT_ROW_REQUIRED';END IF;
   END $revocation190$;SELECT to_jsonb(o) FROM ${overrideTable} o WHERE ${where}`],{command:true});
 };
 const sourceBookend=ASSETS.map(file=>{const relative='assets/'+file,bytes=fs.readFileSync(path.join(PUBLIC_ROOT,relative));assert.deepEqual(fs.readFileSync(path.join(PUBLIC_ROOT,'public',relative)),bytes);return{path:relative,sha256:sha(bytes)};});
 const sourceAfter=()=>{for(const pin of sourceBookend){const bytes=fs.readFileSync(path.join(PUBLIC_ROOT,pin.path));assert.equal(sha(bytes),pin.sha256);assert.deepEqual(fs.readFileSync(path.join(PUBLIC_ROOT,'public',pin.path)),bytes);}};
 const detailCalls=[],httpWrites=[],nativeDenials=[],cases=[],checks=[];let activeCase=null;
 const sql={query:async(statement,values)=>{
  assert.ok(statement===BOOT||statement===DETAIL,'REVOCATION190_NON_READ_RPC_REFUSED');
  if(statement===DETAIL)detailCalls.push({case:activeCase?.capability??null,runId:values[1]});
  try{return await db.query(statement,values);}catch(error){
   if(activeCase&&statement===DETAIL){assert.match(String(error?.message??error),new RegExp('\\b'+activeCase.nativeCode+'\\b'));nativeDenials.push({capability:activeCase.capability,nativeCode:activeCase.nativeCode,runId:values[1]});}
   throw error;
  }
 }};
 const host=await createCanonical190BrowserHost({h,
  actors:new Map([['reviewer',{...reviewer,raw:qa.checker,roleKey:beforeAudit.reviewerRole}]]),getSql:async()=>sql,
  outputName:'liquidation124-actual-sql-revocation-browser',handlers:deps=>{const handler=createOwnLiquidationHandler(deps);return new Map([[LIQ,(req,res)=>{assert.equal(req.method,'GET','REVOCATION190_HTTP_WRITE_REFUSED');return handler(req,res);}]])}});
 const {origin,output,evidence}=host;let failure,result;
 try{
  const r=await host.open('reviewer'),page=r.page,$=key=>page.locator('[data-liq-'+key+']');
  page.on('request',request=>{const url=new URL(request.url());if(url.origin===origin&&url.pathname.startsWith('/api/')&&request.method()!=='GET')httpWrites.push({path:url.pathname,method:request.method()});});
  const settled=()=>page.waitForFunction(()=>document.querySelector('.own-liquidation')?.getAttribute('aria-busy')==='false',{},{timeout:45000});
  const loaded=async()=>{
   await page.goto(origin+'/nomina#decisiones');await $('history').locator('[data-liq-run-id="'+capture.id+'"]').waitFor({state:'visible'});await settled();
   await $('history').locator('[data-liq-run-id="'+capture.id+'"]').click();await $('detail').waitFor({state:'visible'});await settled();
   const oracle=await r.request(LIQ+'?resource=detail&id='+capture.id,{headers:{Accept:OWN_RUN_FULL_JSON}});assert.equal(oracle.response.status(),200);
   const detail=await verifiedOwnLiquidationDetail(oracle.body.data);assert.equal(detail.reviewAccessRequired,true);assert.deepEqual(detail.capture.saved,capture.saved);
   assert.equal(detail.employees.length,855);assert.ok(detail.employees.every(row=>row.state==='calculated'));
   assert.equal(await $('totals').locator('tr').count(),855);assert.equal(await $('rows').locator('tr').count(),25);
   await $('command').selectOption('confirm');await $('kind').selectOption('all');assert.equal(await $('confirm').isChecked(),false);
   assert.ok((await $('review-summary').innerText()).includes('855 legajos afectados'));assert.equal(await $('review-rows').locator('tr').count(),25);assert.ok((await $('review-totals').innerText()).includes('$ 101.061,00'));
   if(!await $('totals').evaluate(el=>el.closest('details').open))await page.getByText('Ver estados y totales de todos los legajos',{exact:true}).click();
   const contractId=capture.saved.input.employees[0].contractId;await $('totals').locator('[data-liq-individual-open="'+contractId+'"]').click();await settled();
   assert.equal(await $('individual').locator('[data-individual-concepts] li').count(),20);assert.ok((await $('individual').innerText()).includes('$ 118,20'));
   assert.equal(await $('send').isDisabled(),true);sameClient();assert.deepEqual(readSnapshot(),before);assert.deepEqual(audit(),beforeAudit);
  };
  for(const probe of CASES){
   await loaded();const original=knownRows.get(probe.capability),denied={...original,allow_override:false,deny_override:true};
   let caseFailure=null,restoreFailure=null,restoreRequired=false;
   try{
    activeCase=probe;const nativeBefore=nativeDenials.length;
    // Observe rejection immediately so a failed IAM write cannot leave an
    // unhandled response waiter. The success path still MUST await and rethrow
    // its error; no timeout/rejection is converted into a passing probe.
    const response=page.waitForResponse(value=>{const url=new URL(value.url());return url.origin===origin&&url.pathname===LIQ&&url.searchParams.get('resource')==='detail'&&url.searchParams.get('id')===capture.id&&value.status()===403;}).then(value=>({value}),error=>({error}));
    // Mark cleanup BEFORE issuing the write: even an uncertain acknowledgement
    // requires an exact read/restore check, never a blind second denial/retry.
    restoreRequired=true;assert.deepEqual(changeExisting(original,denied),denied);sameClient();
    const revoked=audit();assert.deepEqual(withoutOverrideDigest(revoked.snapshot),withoutOverrideDigest(beforeAudit.snapshot));
    assert.deepEqual(revoked.overrides,beforeAudit.overrides.map(row=>rowKey(row)===rowKey(original)?denied:row));
    const expectedEffective=beforeAudit.effective.map(row=>row.membershipId===qa.checker.membershipId?{...row,capabilities:row.capabilities.filter(cap=>cap!==probe.capability)}:row);
    assert.deepEqual(revoked.effective,expectedEffective);assert.equal(revoked.reviewerRole,beforeAudit.reviewerRole);
    const detailBefore=detailCalls.length;
    await db.expectQueryError({caseId:probe.caseId,nativeCode:probe.nativeCode,text:DETAIL,values:[reviewerContext,capture.id]},async()=>{
     await $('history').locator('[data-liq-run-id="'+capture.id+'"]').click();const observed=await response;if(observed.error)throw observed.error;const forbidden=observed.value;assert.equal((await forbidden.json()).code,'OWN_LIQ_FORBIDDEN');await settled();
     assert.equal(nativeDenials.length,nativeBefore+1);assert.equal(detailCalls.length,detailBefore+1);
     assert.ok(nativeDenials.slice(nativeBefore).every(row=>row.capability===probe.capability&&row.nativeCode===probe.nativeCode&&row.runId===capture.id));
    });
    assert.equal(await $('detail').isHidden(),true);assert.equal(await $('review').isHidden(),true);assert.equal(await $('individual').isHidden(),true);
    for(const key of ['history','totals','rows','trace','values','review-rows','review-totals','individual','summary','range','page','review-summary','review-range','review-page'])assert.equal((await $(key).innerText()).trim(),'','REVOCATION190_NOMINAL_VIEW_RETAINED:'+key);
    for(const key of ['command','kind','reason'])assert.equal(await $(key).inputValue(),'');assert.equal(await $('confirm').isChecked(),false);
     // Playwright's isDisabled() excludes FIELDSET itself. Check native HTML
     // state and every interactive descendant rather than an inapplicable predicate.
     const fieldsState=await $('fields').evaluate(fieldset=>({tag:fieldset.tagName,disabled:fieldset.disabled,nativeDisabled:fieldset.matches(':disabled'),controls:[...fieldset.querySelectorAll('input,select,textarea,button')].map(control=>control.matches(':disabled'))}));
     assert.equal(fieldsState.tag,'FIELDSET');assert.equal(fieldsState.disabled,true);assert.equal(fieldsState.nativeDisabled,true);assert.ok(fieldsState.controls.length>0);assert.ok(fieldsState.controls.every(value=>value===true));
     assert.equal(await $('send').isDisabled(),true);sameClient();assert.deepEqual(httpWrites,[]);
    assert.deepEqual(audit(),revoked,'failed current-authority read cannot alter rows, metadata or the temporary IAM state');
    cases.push({capability:probe.capability,nativeCode:probe.nativeCode,httpStatus:403,loadedPopulation:855,loadedConcepts:17100,individualConcepts:20,clientPrincipalPreserved:true,sessionPreserved:true,nominalViewsWithdrawn:true,businessHttpPosts:0});
   }catch(error){caseFailure=error;}
   finally{
    activeCase=null;
    if(restoreRequired){try{
     const current=readRow(probe.capability);
     if(JSON.stringify(current)===JSON.stringify(original)){/* denial never committed: no restoration write */}
     else{assert.deepEqual(current,denied,'REVOCATION190_RESTORE_REFUSES_FOREIGN_ROW');assert.deepEqual(changeExisting(denied,original),original);}
     assert.deepEqual(readRow(probe.capability),original);assert.deepEqual(audit(),beforeAudit);assert.deepEqual(readSnapshot(),before);sameClient();
    }catch(error){restoreFailure=error;}}
   }
   if(caseFailure&&restoreFailure)throw new AggregateError([caseFailure,restoreFailure],'REVOCATION190_PROBE_AND_EXACT_RESTORE_FAILED');
   if(caseFailure)throw caseFailure;if(restoreFailure)throw restoreFailure;
   checks.push('actual SQL '+probe.capability+' denial defeats the unchanged auth principal and withdraws previously loaded nominal detail; exact existing override restored');
  }
  await loaded();assert.equal(cases.length,2);assert.equal(iamWriteCalls,4);assert.deepEqual(httpWrites,[]);
  assert.deepEqual(evidence.pageErrors,[]);assert.deepEqual(evidence.serverErrors,[]);assert.deepEqual(evidence.external,[]);sourceAfter();
  result={version:'own-actual-sql-revocation-live190-browser.v1',passed:true,sourceCommit:h.sourceCommit,major:h.major,
   checks,cases,sourceBookend,httpEvidence:evidence.httpEvidence,captureReference:{id:capture.id,keyJsonSha256:sha(JSON.stringify(capture.key)),bodySha256:capture.bodySha256,payloadSha256:capture.payloadSha256,algorithmSha256:capture.algorithmSha256,inputSha256:capture.saved.inputSha256,resultSha256:capture.saved.resultSha256,employeeCount:capture.saved.result.employeeCount,conceptRowCount:capture.saved.result.rowCount},sqlLevelRevocationProven:true,realSqlDenials:nativeDenials.length,
   staleClientPrincipalPreserved:true,sessionVersionsPreserved:true,existingOverrideRowsRestored:2,temporaryIamWriteCalls:4,
   addedCaptures:0,addedSavedResults:0,addedLiquidationDecisions:0,addedAnnulments:0,addedCloseEvents:0,businessHttpPosts:0,
   newRoles:0,newGrants:0,newSessions:0,newIdentities:0,newRpcDescriptors:0,originalRowsAndMetadataRestored:true,
   actualSql:true,actualApiHandler:true,actualHttp:true,actualBrowser:true,authenticationFixture:true,completeAuthenticationHandler:false,
   allLegacyDecisionUiCasesCovered:false,synthetic:true,productionWrites:0,paymentExecuted:false,municipalAcceptance:false};
 }catch(error){failure=error;fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({passed:false,message:error.message,checks,cases,httpWrites,detailCalls,nativeDenials,iamWriteCalls,pageErrors:evidence.pageErrors,serverErrors:evidence.serverErrors,synthetic:true},null,2)+'\n',{flag:'wx'});}
 finally{try{await host.close();}catch(error){if(!failure)failure=error;}}
 if(failure)throw failure;
 assert.deepEqual(readSnapshot(),before);assert.deepEqual(audit(),beforeAudit);sameClient();sourceAfter();
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});return Object.freeze({...result,capture});
}
