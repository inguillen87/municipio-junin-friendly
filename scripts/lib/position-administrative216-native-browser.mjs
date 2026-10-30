// Private complete source candidate. Author executed no import, test, SQL or browser.
// Same h/db/schema, existing maker4/checker5; no identities, grants or new seed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {createAnnualBudgetHandler} from '../../api/internal-annual-position-budget.js';
import {createPositionAssignmentHandler} from '../../api/internal-position-assignment.js';
import {createPositionComparisonHandler} from '../../api/internal-position-comparison.js';
import {createEmploymentLifecycleHandler} from '../../api/internal-employment-lifecycle.js';
import {createInternalDataHandler} from '../../api/internal-data.js';
import {employeeContext} from '../../lib/internal-native-employees.js';
import {readNativeEmployee} from '../../lib/internal-native-employee-read.js';
import {employmentLifecycleOperation} from '../../lib/internal-employment-lifecycle.js';
import {annualBudgetOperation} from '../../lib/internal-annual-position-budget.js';
import {positionOperation} from '../../lib/internal-position-assignment.js';
import {annualBudgetCommand,budgetHash} from '../../assets/annual-position-budget-model.js';
import {COMPARISON_READ,verifiedPositionComparison,positionComparisonDocument,positionComparisonVisible,positionComparisonDetails} from '../../assets/position-comparison-model.js';
import {reportPdf} from '../../assets/report-document.js';
import {positionCommand} from '../../assets/position-assignment-model.js';
import {lifecycleProposalInput,lifecycleReviewInput} from '../../assets/native-employment-lifecycle-model.js';
import {lifecycleFixture} from '../../tests/fixtures/native-employment-lifecycle-synthetic.js';
import {source as positionSyntheticSource} from '../../tests/fixtures/position-assignment-synthetic.js';
import {assertPositions210Admission,createPositions210Sql,positions210Rpc,readPositions210Comparison} from './positions210-same190-native-continuation.mjs';
import {verifyPositionAdministrative216Epoch} from './position-administrative-identity216-same190-installation.mjs';
import {own190ExpectedNativeRpcError} from './own-payroll-expected-native-rpc.mjs';
import {performancePreservationSnapshot} from '../verify-documentary-roster-performance.mjs';
import {createCanonical190BrowserHost,PUBLIC_ROOT} from './own-payroll-canonical190-browser-host-qa.mjs';
import {splitPostgresStatements} from './sql-statements.mjs';
import {friendlyPwaIdentityVersion,transformFriendlyShellSource} from './friendly-shell-page.mjs';
import {ADMIN216_BUSINESS_TABLES,admin216Quote as q,admin216Hash as hash,admin216NextSyntheticDefinition,
 assertAdmin216BusinessDelta,assertAdmin216Prefix,admin216ProbeMutation,bindAdmin216ReadParameters} from './position-administrative216-browser-contract.mjs';
import '../../assets/app-routes.js';

const ANNUAL='/api/internal-annual-position-budget',POSITION='/api/internal-position-assignment',COMPARISON='/api/internal-position-comparison';
const ANNUAL_BOOT='SELECT public.annual_budget_bootstrap_v1($1::jsonb,$2::integer) AS result';
const ANNUAL_COMMAND='SELECT public.annual_budget_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result';
const POSITION_COMMAND='SELECT public.position_assignment_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result';
const DIR=new Map([
 ['SELECT public.native_employee_directory_snapshot_v1($1::jsonb) AS result',['native_employee_directory_snapshot_v1',['jsonb']]],
 ['SELECT public.native_employee_read_projection_v1($1::jsonb,$2::uuid) AS result',['native_employee_read_projection_v1',['jsonb','uuid']]],
 ['SELECT public.employment_adoption_history_read_v1($1::jsonb,$2::uuid) AS result',['employment_adoption_history_read_v1',['jsonb','uuid']]]
]);
const ROOT_ENTRIES=Object.freeze(['estructura.html','internal-dashboard.html','api/internal-annual-position-budget.js','api/internal-position-assignment.js','api/internal-position-comparison.js','api/internal-employment-lifecycle.js','api/internal-data.js']);
const ASSETS=Object.freeze(['assets/annual-position-budget-panel.js','assets/annual-position-budget-model.js','assets/annual-position-budget.css',
 'assets/position-assignment-panel.js','assets/position-assignment-client.js','assets/position-assignment-model.js','assets/position-assignment.css',
 'assets/native-salary-catalog-model.js','assets/native-employment-lifecycle.js','assets/native-employment-lifecycle-model.js','assets/employee-detail-navigation.js','assets/app-routes.js',
 'assets/position-comparison-panel.js','assets/position-comparison-model.js','assets/position-comparison.css','assets/report-document.js','assets/report-pdf-text.js']);
export const ADMIN216_BROWSER_ROOT_ENTRIES=ROOT_ENTRIES;
export const ADMIN216_BROWSER_ENTRIES=Object.freeze([
 'scripts/verify-position-administrative216-same190.mjs',
 'scripts/lib/position-administrative216-native-browser.mjs','scripts/lib/position-administrative216-browser-contract.mjs',
 'scripts/lib/own-payroll-canonical190-browser-host-qa.mjs','scripts/lib/position-administrative-identity216-same190-installation.mjs',
 'scripts/lib/positions210-same190-native-continuation.mjs','scripts/lib/own-payroll-expected-native-rpc.mjs',
 'scripts/lib/sql-statements.mjs','scripts/verify-documentary-roster-performance.mjs','scripts/lib/friendly-shell-page.mjs',
 'tests/position-administrative216-browser-contract.test.js','tests/fixtures/native-employment-lifecycle-synthetic.js',
 'tests/fixtures/position-assignment-synthetic.js','lib/internal-native-employee-read.js','lib/internal-employment-adoption-history.js',
 'lib/workforce-operational-scope.js','lib/native-directory-sql.js',...ASSETS
]);
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const exact=(value,keys)=>assert.deepEqual(Reflect.ownKeys(value).sort(),[...keys].sort());
const ctxOf=actor=>JSON.stringify(employeeContext(actor.principal,actor.session));
const snapshot=h=>h.json([performancePreservationSnapshot(),"SELECT current_setting('municontrol_documentary_install.after')::jsonb"],{readOnly:true,fullJson:true});
function prefix(h){return h.json([`DO $admin216_prefix$ DECLARE name text;rows_value jsonb;result jsonb:='[]';BEGIN
 FOREACH name IN ARRAY ARRAY[${ADMIN216_BUSINESS_TABLES.map(q).join(',')}] LOOP
 EXECUTE format('SELECT coalesce(jsonb_agg(jsonb_build_object(''sha256'',v.sha,''count'',v.n) ORDER BY v.sha),''[]''::jsonb) FROM(SELECT encode(public.digest(to_jsonb(r)::text,''sha256''),''hex'') sha,count(*) n FROM %I.%I r GROUP BY 1)v',${q(h.qa.schema)},name) INTO rows_value;
 result:=result||jsonb_build_array(jsonb_build_object('name',name,'rows',rows_value));END LOOP;
 PERFORM set_config('municontrol_admin216.prefix',result::text,true);END $admin216_prefix$;SELECT current_setting('municontrol_admin216.prefix')::jsonb`],{readOnly:true,fullJson:true});}
function sourceBookend(h){
 const pins=[];for(const file of ASSETS){const source=fs.readFileSync(path.join(PUBLIC_ROOT,file));assert.equal(source.toString('utf8').replace(/\r\n?/g,'\n'),h.read(file));assert.deepEqual(fs.readFileSync(path.join(PUBLIC_ROOT,'public',file)),source,'ADMIN216_BUILT_ASSET:'+file);pins.push({path:file,sha256:hash(source)});}
 const identity=friendlyPwaIdentityVersion(file=>fs.readFileSync(path.join(PUBLIC_ROOT,file)));
 for(const file of ['estructura.html','internal-dashboard.html']){const source=fs.readFileSync(path.join(PUBLIC_ROOT,file));assert.equal(source.toString('utf8').replace(/\r\n?/g,'\n'),h.read(file));const built=Buffer.from(transformFriendlyShellSource(source.toString('utf8'),file,identity,globalThis.MuniControlRoutes));assert.deepEqual(fs.readFileSync(path.join(PUBLIC_ROOT,'public',file)),built,'ADMIN216_BUILT_PAGE:'+file);pins.push({path:file,sha256:hash(source),builtSha256:hash(built),derived:true});}
 return()=>{for(const pin of pins)assert.equal(hash(fs.readFileSync(path.join(PUBLIC_ROOT,pin.path))),pin.sha256);return pins;};
}
function annualPanel(page){const host=page.locator('[data-annual-position-budget] .annual-budget');return{host,field:key=>host.locator('[data-annual-'+key+']'),idle:()=>host.waitFor({state:'visible'}).then(()=>page.waitForFunction(()=>document.querySelector('.annual-budget')?.getAttribute('aria-busy')==='false',null,{timeout:45000}))};}
function positionPanel(page){const host=page.locator('#employeeDialog .position-assignment');return{host,field:key=>host.locator('[data-position-'+key+']'),idle:()=>host.waitFor({state:'visible'}).then(()=>page.waitForFunction(()=>document.querySelector('#employeeDialog .position-assignment')?.getAttribute('aria-busy')==='false',null,{timeout:45000}))};}
async function reveal(locator){await locator.evaluate(element=>{for(let parent=element.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;});await locator.scrollIntoViewIfNeeded();}
async function mobile(page,host,output,label){
 for(const width of [390,320]){await page.setViewportSize({width,height:1000});await host.scrollIntoViewIfNeeded();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'ADMIN216_VIEWPORT_OVERFLOW:'+label+':'+width);await page.screenshot({path:path.join(output,label+'-'+width+'.png'),fullPage:true});}
 await page.setViewportSize({width:1366,height:1100});
}
async function annualLoad(session,year){const P=annualPanel(session.page);await session.page.goto(session.origin+'/estructura.html');await P.host.waitFor({state:'visible'});await P.field('year').fill(String(year));await P.field('query').locator('button').click();await P.idle();await P.field('content').waitFor({state:'visible'});return P;}
async function positionLoad(session,id,year){const P=positionPanel(session.page);await session.page.goto(session.origin+'/internal-dashboard.html?contractId='+id);await P.host.waitFor({state:'visible'});await reveal(P.host);await P.field('year').fill(String(year));await P.field('query').locator('button').click();await P.idle();await P.field('content').waitFor({state:'visible'});return P;}
const post=(session,api,body,key)=>session.request(api,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key,'Sec-Fetch-Site':'same-origin'},data:JSON.stringify({operation:'command',payload:body})});

// Source-only addition to the existing216 host. Same checker/session, native
// transport and closed runs; no seed, mutation, alternate response or v1 fallback.
async function verifyAdmin216NativeComparisonPdf({h,db,admission,session,host,trace}){
 assert.equal(session.actorName,'checker');
 const actor=admission.pair.actors.checker;
 for(const capability of COMPARISON_READ)assert.ok(actor.principal.tenant.effectiveCapabilities.includes(capability),'ADMIN216_COMPARISON_CAPABILITY_MISSING:'+capability);
 const before=h.readFullSnapshot(),writesBefore=trace.filter(row=>/_command(?:_|\b)/.test(row.text)).length;
 const query={year:admission.year,revision:admission.annual.catalog.revision,period:admission.period,liquidationType:'monthly'};
 const original=await readPositions210Comparison({h,db,admission,revision:query.revision});
 await verifiedPositionComparison(original,query);
 assert.equal(original.version,'own-position-comparison.v2');
 assert.ok(original.groups.length>0,'ADMIN216_NATIVE_CLOSED_GROUP_REQUIRED');
 assert.equal(original.employees.length,admission.registrations,'ADMIN216_NATIVE_CLOSED_POPULATION_REQUIRED');
 assert.ok(original.groups.every(group=>group.populationComplete),'ADMIN216_NATIVE_CLOSED_SCOPE_INCOMPLETE');
 const liquidatedPositions=positionComparisonDetails(original);
 assert.ok(liquidatedPositions.some(row=>row.assignmentStatus==='assigned'&&row.coverage==='full'&&row.budgetRevision===query.revision),'ADMIN216_CAPTURED_LIQUIDATED_POSITION_REQUIRED');
 for(const capture of original.captures)assert.equal(capture.populationProof.version,'own-position-population-proof.v1');
 const qs=new URLSearchParams({resource:'detail-v2',year:String(query.year),revision:String(query.revision),period:query.period,liquidationType:query.liquidationType});
 const api=await session.request(COMPARISON+'?'+qs);assert.equal(api.response.status(),200);assert.equal(api.body.ok,true);assert.deepEqual(api.body.data,original,'ADMIN216_HTTP_NATIVE_DTO_CHANGED');
 const fingerprint=await budgetHash(original),filters={active:'all',order:'number',view:'detailed'},document=positionComparisonDocument(original,filters,fingerprint);
 assert.ok(document.positionAnnualSummary,'ADMIN216_ANNUAL_PDF_DELTA_REQUIRED');
 assert.ok(document.rows.length>=original.employees.length,'ADMIN216_PDF_COMPLETE_DETAIL_REQUIRED');
 const page=session.page,panel=page.locator('[data-position-comparison] .position-comparison'),field=key=>panel.locator('[data-comparison-'+key+']'),responses=[];
 const record=response=>{const url=new URL(response.url());if(url.pathname===COMPARISON&&url.searchParams.get('resource')==='detail-v2')responses.push(response);};
 page.on('response',record);
 try{
  await page.goto(host.origin+'/estructura.html');await panel.waitFor({state:'visible'});
  await field('year').fill(String(query.year));await field('annual').click();
  await field('revision').locator('option[value="'+query.revision+'"]').waitFor({state:'attached'});
  await field('revision').selectOption(String(query.revision));await field('period').fill(query.period);await field('type').selectOption(query.liquidationType);
  await field('query').locator('button[type=submit]').click();await field('content').waitFor({state:'visible'});
  await field('active').selectOption(filters.active);await field('order').selectOption(filters.order);await field('view').selectOption(filters.view);
  const search=original.employees[0].employeeNumber;await field('search').fill(search);
  const visible=positionComparisonVisible(document,search,1);assert.equal(await field('rows').locator('tr').count(),visible.rows.length);assert.equal(visible.total,document.rows.length);
  const downloadPromise=page.waitForEvent('download',{timeout:45000});await field('pdf').click();const download=await downloadPromise;
  assert.equal(download.suggestedFilename(),document.filename+'.pdf');const file=await download.path();assert.ok(file,'ADMIN216_NATIVE_PDF_DOWNLOAD_REQUIRED');
  const bytes=fs.readFileSync(file),expected=Buffer.from(reportPdf(document));assert.deepEqual(bytes,expected,'ADMIN216_NATIVE_DTO_PDF_BYTES_CHANGED');
  const snippets=[...bytes.toString('ascii').matchAll(/<([0-9a-f]+)> Tj/gi)].map(match=>new TextDecoder('windows-1252').decode(Buffer.from(match[1],'hex')));
  const normalize=value=>String(value).replace(/\s+/g,''),joined=snippets.join('').replace(/\s+/g,'');
  const cells=new Set([...document.rows.flat(),...document.positionAnnualSummary.rows.flat()].filter(value=>value!==null).map(normalize));
  for(const value of cells)assert.ok(joined.includes(value),'ADMIN216_NATIVE_PDF_CELL_OMITTED');
  const pages=(bytes.toString('ascii').match(/\/Type \/Page\b/g)||[]).length;assert.ok(pages>0);
  assert.equal(snippets.filter(value=>value==='Consulta SHA-256: '+fingerprint).length,pages);
  const normSha=document.metadata.find(([key])=>key==='SHA-256 norma')[1];assert.equal(snippets.filter(value=>value==='Norma SHA-256: '+normSha).length,pages);
  assert.ok(responses.length>=3,'ADMIN216_NATIVE_HTTP_REVALIDATION_REQUIRED');
  for(const response of responses){assert.equal(response.request().method(),'GET');assert.equal(response.status(),200);const body=await response.json();assert.equal(body.ok,true);assert.deepEqual(body.data,original,'ADMIN216_BROWSER_NATIVE_DTO_CHANGED');}
  fs.writeFileSync(path.join(host.output,'native-comparison-detailed.pdf'),bytes,{flag:'wx'});
  await page.setViewportSize({width:1366,height:1100});await page.screenshot({path:path.join(host.output,'native-comparison-detailed-desktop.png'),fullPage:true});
  await mobile(page,panel,host.output,'native-comparison-detailed');
  assert.equal(trace.filter(row=>/_command(?:_|\b)/.test(row.text)).length,writesBefore,'ADMIN216_COMPARISON_SQL_WRITE');
  assert.deepEqual(h.readFullSnapshot(),before,'ADMIN216_COMPARISON_CHANGED_GLOBAL_STATE');
  const facade='SELECT public.position_comparison_detail_v2($1::jsonb,$2::integer,$3::integer,$4::text,$5::text) AS result';
  const calls=trace.filter(row=>row.text===facade);assert.ok(calls.length>=4,'ADMIN216_REAL_COMPARISON_RPC_REQUIRED');
  for(const call of calls)assert.deepEqual(call.values,[ctxOf(actor),query.year,query.revision,query.period,query.liquidationType]);
  return{version:'position-administrative216-native-comparison-pdf.v1',passed:true,sourceCommit:h.sourceCommit,actualSql:true,actualApiHandler:true,actualHttp:true,actualBrowser:true,query,
   dtoVersion:original.version,dtoSha256:fingerprint,closedGroups:original.groups.length,closedEmployees:original.employees.length,captures:original.captures.length,
   detailRows:document.rows.length,annualRows:document.positionAnnualSummary.rows.length,allNativeDtoCompared:true,allPdfCellsCompared:true,nativeDtoPdfBytesEqual:true,
   originalNormativeRevisionPreserved:true,searchDoesNotCrop:true,pdfPages:pages,pdfBytes:bytes.length,pdfSha256:createHash('sha256').update(bytes).digest('hex'),
   realComparisonRpcCalls:calls.length,readOnlyBusiness:true,wholeStatePreserved:true,desktopAnd390And320:true,syntheticNativePopulation:true,municipalNormInstalled:false,
   personalNoeliaSessionTested:false,productionWrites:0,paymentExecuted:false,digitalSignatureExecuted:false,municipalAcceptance:false};
 }finally{page.off('response',record);}
}

export async function verifyPositionAdministrative216BrowserOn190({h,db,qa,admission,contracts,lifecycle212,family195Business}){
 assertPositions210Admission({h,db,admission});assert.strictEqual(qa,h.qa);assert.equal(h.sourceCustody.sourceCommit,h.sourceCommit);
 assert.equal(contracts.length,855);assert.equal(new Set(contracts).size,855);assert.equal(lifecycle212.passed,true);assert.equal(lifecycle212.sourceCommit,h.sourceCommit);assert.equal(lifecycle212.proposals,100);
 assert.equal(family195Business.version,'native-family195-live190-business.v1');assert.equal(family195Business.passed,true);assert.equal(family195Business.sourceCommit,h.sourceCommit);assert.equal(family195Business.productionWrites,0);
 assert.ok(admission.administrative216,'ADMIN216_REAL_INSTALLATION_REQUIRED');verifyPositionAdministrative216Epoch(h,admission.administrative216);
 const maker=admission.pair.actors.maker,checker=admission.pair.actors.checker,target=contracts[9],makerContract=contracts[4],year=admission.year;
 assert.equal(maker.contractId,makerContract);assert.equal(checker.contractId,contracts[5]);assert.notEqual(target,makerContract);assert.notEqual(target,checker.contractId);assert.notEqual(target,lifecycle212.target);
 for(const actor of [maker,checker]){assert.deepEqual(employeeContext(actor.principal,actor.session),actor.raw);assert.equal(actor.principal.session.mfa,true);assert.equal(actor.session.id,actor.raw.actorSessionId);}
 for(const key of ['membershipId','actorEmail','actorSessionId'])assert.notEqual(maker.raw[key],checker.raw[key]);
 const deadline=Math.min(Date.parse(maker.principal.session.expiresAt),Date.parse(checker.principal.session.expiresAt));assert.ok(deadline>Date.now(),'ADMIN216_SESSION_WINDOW');
 const originalActors=structuredClone({maker:maker.raw,checker:checker.raw,principals:[maker.principal,checker.principal],sessions:[maker.session,checker.session]});
 const baseSql=createPositions210Sql({h,db}),trace=[],nativeProbes=[];let activeProbe=null;
 const contextValues=new Map([maker,checker].map(actor=>[actor.raw.membershipId,ctxOf(actor)]));
 const sql={query:async(text,values)=>{
  trace.push({text,values:[...values]});
  if(activeProbe&&text===activeProbe.text&&JSON.stringify(values)===JSON.stringify(activeProbe.values)){
   assert.equal(activeProbe.calls++,0,'ADMIN216_EXTRA_PROBE_CALL');
   const actual=h.expectRollback(activeProbe.statements,activeProbe.nativeCode,{command:true});
   activeProbe.validated=true;throw own190ExpectedNativeRpcError(actual,{nativeCode:activeProbe.nativeCode});
  }
  return baseSql.query(text,values);
 }};
 const directorySql={query:async(text,values)=>{
  const item=DIR.get(text);assert.ok(item,'ADMIN216_DIRECTORY_RPC_CLOSED');assert.ok(Array.isArray(values)&&values.length===item[1].length);
  const context=JSON.parse(values[0]);assert.equal(contextValues.get(context.membershipId),values[0]);if(values.length===2){assert.match(values[1],UUID);assert.ok([target,makerContract].includes(values[1]));}
  const statement='SELECT '+qa.schema+'.'+item[0]+'('+values.map((value,index)=>q(value)+'::'+item[1][index]).join(',')+')';
  if(item[0]==='employment_adoption_history_read_v1'){
   // Both targets are existing native hires, verified below. The genuine
   // not-found selects the handler's native-projection fallback, with a real
   // expected-error ROLLBACK rather than an unadmitted native failure.
   const error=h.expectRollback(['SET LOCAL ROLE municontrol_actions_runtime_app',statement],'EMPLOYMENT_ADOPTION_HISTORY_NOT_FOUND',{command:true});throw own190ExpectedNativeRpcError(error,{nativeCode:'EMPLOYMENT_ADOPTION_HISTORY_NOT_FOUND'});
  }
  return[{result:await db.run(statement,true)}];
 }};
 const nativeTarget=await readNativeEmployee(directorySql,maker.principal,maker.session,target),nativeMaker=await readNativeEmployee(directorySql,maker.principal,maker.session,makerContract);
 assert.equal(nativeTarget.contract.recordKind,'hire');assert.equal(nativeMaker.contract.recordKind,'hire');assert.equal(nativeTarget.contract.status,'active');assert.equal(nativeMaker.contract.status,'active');
 const wholeBefore=snapshot(h),oldPrefix=prefix(h),bookend=sourceBookend(h),checkPhase=phase=>{assertAdmin216BusinessDelta(wholeBefore,snapshot(h),qa.schema,phase);assertAdmin216Prefix(oldPrefix,prefix(h));};
 const life=(actor,operation,input)=>employmentLifecycleOperation(sql,actor.principal,actor.session,operation,{...input,current:true});
 h.setPhase('administrative216-existing-maker-approved-termination');
 const first=await life(maker,'bootstrap',{contractId:makerContract}),fixture=lifecycleFixture('propose','approve','terminate').body.payload;
 assert.equal(first.employment.status,'active');assert.deepEqual(first.employment.intervals,[{startDate:'2026-10-01',endDate:null}]);assert.ok(first.employment.today>'2026-10-01');
 const proposalBody=lifecycleProposalInput({...fixture,contractId:makerContract,identityToken:first.subject.identityToken,scopeVersion:first.scopeVersion,baseVersion:first.employment.version});
 const proposed=await life(maker,'propose',{body:proposalBody,key:randomUUID()}),review=await life(checker,'bootstrap',{contractId:makerContract});
 const reviewBody=lifecycleReviewInput({...lifecycleFixture('review','approve','terminate').body.payload,contractId:makerContract,proposalId:proposed.proposalId,scopeVersion:review.scopeVersion});
 const terminated=await life(checker,'review',{body:reviewBody,key:randomUUID()});assert.equal(terminated.status,'approved');assert.equal(terminated.payrollModified,false);
 const effective=await life(checker,'bootstrap',{contractId:makerContract});assert.equal(effective.employment.status,'inactive');assert.equal(effective.employment.revision,first.employment.revision+1);checkPhase('lifecycle');
 const auditActor=h.json([`SELECT jsonb_build_object('person',(SELECT person_id FROM ${qa.schema}.employment_contract WHERE id=${q(makerContract)}::uuid),'context',${qa.schema}.position_administrative_context_v1(${q(ctxOf(maker))}::jsonb),'linkCount',(SELECT count(*) FROM ${qa.schema}.tenant_action_employment_link WHERE membership_id=${q(maker.raw.membershipId)}::uuid AND active AND revoked_at IS NULL))`],{command:true});
 assert.equal(auditActor.context.actorPersonId,auditActor.person);assert.equal(auditActor.context.positionActorVerified,true);assert.equal(auditActor.context.employmentContractId,null);assert.equal(auditActor.linkCount,1);
 const beforeAnnual=await annualBudgetOperation(sql,maker.principal,maker.session,'bootstrap',{year});assert.equal(beforeAnnual.permissions.canPropose,true);assert.deepEqual(beforeAnnual.catalog.definition,admission.normative);
 const nextDefinition=admin216NextSyntheticDefinition(beforeAnnual.catalog.definition);
 const ownerReads={query:async(text,values=[])=>{
  const parsed=splitPostgresStatements(text);assert.equal(parsed.length,1,'ADMIN216_DATA_SINGLE_SELECT');const head=parsed[0].replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/,'');assert.match(head,/^(?:SELECT|WITH)\b/i);
  const statement=bindAdmin216ReadParameters(qa.normalized(text),values);
  // Actual internal-data SELECTs may use native read facades with FOR SHARE.
  // Owner transport is RW/RC for those locks; no write statement is accepted.
  return h.json(["SET LOCAL standard_conforming_strings=on",'SELECT coalesce(jsonb_agg(admin216_row),\'[]\'::jsonb) FROM (\n'+statement+'\n) admin216_row'],{command:true,fullJson:true});
 }};
 const diagnostics=[],actors=new Map([['maker',maker],['checker',checker]]);
 const host=await createCanonical190BrowserHost({h,actors,getSql:async()=>sql,outputName:'position-administrative216-browser',
  pages:{'/estructura.html':'estructura.html','/internal-dashboard.html':'internal-dashboard.html'},handlers:deps=>{
   Object.assign(deps.env,{FRIENDLY_GRH_SOURCE_DATABASE:nativeTarget.scope.database,FRIENDLY_GRH_COMPANY_ID:String(nativeTarget.scope.companyId)});
   const data=createInternalDataHandler({env:deps.env,requireCompatibleInternalAccess:deps.requireAccess,getInternalSql:async()=>ownerReads,getActionCenterSql:async()=>directorySql,actionMutationSession:deps.sessionFor,reportReadFailure:()=>diagnostics.push('internal-data-read-failed')});
   return new Map([[ANNUAL,createAnnualBudgetHandler(deps)],[POSITION,createPositionAssignmentHandler(deps)],[COMPARISON,createPositionComparisonHandler(deps)],['/api/internal-employment-lifecycle',createEmploymentLifecycleHandler(deps)],
    ['/api/internal-data',(req,res)=>{if(req.method!=='GET'||!['structure','summary','employees','employee'].includes(req.query.resource)||req.query.resource==='employee'&&![target,makerContract].includes(req.query.contractId)){return res.status(400).json({ok:false,error:'Fuera del recorrido administrativo216.'});}return data(req,res);}]]);
  }});
 let failure,result;const uiPosts=[],screens=[];
 try{
  const M=await host.open('maker'),C=await host.open('checker');M.origin=C.origin=host.origin;
  for(const session of[M,C])session.page.on('request',request=>{if(request.method()==='POST'&&[ANNUAL,POSITION].includes(new URL(request.url()).pathname))uiPosts.push({actor:session.actorName,path:new URL(request.url()).pathname,key:request.headers()['idempotency-key'],body:request.postData()});});
  const A=await annualLoad(M,year);assert.ok((await A.field('current').innerText()).includes('versión aprobada 1'));
  await reveal(A.field('edit'));await A.field('reference').fill(nextDefinition.source.reference);await A.field('reason').fill('Nueva referencia exclusivamente sintética administrativa216, con filas y cantidades intactas');
  let dropped=0;const acknowledged=[];
  await M.page.route('**/api/internal-annual-position-budget',async route=>{if(route.request().method()!=='POST'||dropped>=2)return route.continue();const response=await route.fetch(),payload=await response.json();assert.equal(payload.ok,true);acknowledged.push(payload.data);dropped++;return route.abort('failed');});
  h.setPhase('administrative216-ui-annual-lost-ack-original-key');
  await A.field('form').locator('button[type=submit]').click();await A.idle();await A.field('recover').waitFor({state:'visible'});assert.equal(await A.field('retry').isEnabled(),true);checkPhase('annualProposal');
  await mobile(M.page,A.host,host.output,'annual-pending');screens.push('annual-pending');
  await A.field('retry').click();await A.idle();assert.equal(dropped,2);assert.equal(acknowledged[0].replayed,false);assert.equal(acknowledged[1].replayed,true);checkPhase('annualProposal');
  const originalPosts=uiPosts.filter(value=>value.path===ANNUAL);assert.equal(originalPosts.length,2);assert.equal(originalPosts[0].key,originalPosts[1].key);assert.equal(originalPosts[0].body,originalPosts[1].body);
  await A.field('recover').click();await A.idle();assert.equal(await A.field('recover').isVisible(),false);assert.equal(uiPosts.filter(value=>value.path===ANNUAL).length,2);checkPhase('annualProposal');
  const annualReceipt=acknowledged[0],pending=(await M.request(ANNUAL+'?resource=bootstrap&year='+year)).body.data.proposals.find(value=>value.id===annualReceipt.proposalId);assert.ok(pending);assert.equal(pending.canReview,false);
  await reveal(A.field('review'));await A.field('proposals').selectOption(pending.id);assert.equal(await A.field('approve').isEnabled(),false);
  const ownReview=annualBudgetCommand({command:'approve',year,scopeVersion:pending.body.scopeVersion,baseVersion:pending.body.baseVersion,proposalId:pending.id,proposalSha256:pending.requestSha256,definition:null,reason:'Revisión propia prohibida exclusivamente sintética216',reviewConfirmed:true});
  const beforeSod=h.readFullSnapshot(),deniedOwn=await post(M,ANNUAL,ownReview,randomUUID());assert.equal(deniedOwn.response.status(),403);assert.deepEqual(h.readFullSnapshot(),beforeSod);
  const AC=await annualLoad(C,year);await reveal(AC.field('review'));await AC.field('proposals').selectOption(pending.id);assert.equal(await AC.field('proposal').locator('tbody tr').count(),nextDefinition.rows.length);await AC.field('confirm').check();await AC.field('decision-reason').fill('Revisión independiente exclusivamente sintética216 de todas las filas y su referencia');await AC.field('approve').click();await AC.idle();checkPhase('annualApproved');
  const approvedAnnual=(await M.request(ANNUAL+'?resource=bootstrap&year='+year)).body.data;assert.equal(approvedAnnual.catalog.revision,2);assert.deepEqual(approvedAnnual.catalog.definition,nextDefinition);
  await mobile(C.page,AC.host,host.output,'annual-approved');screens.push('annual-approved');
  h.setPhase('administrative216-ui-active-beneficiary-assignment');
  const P=await positionLoad(M,target,year),positionInitial=(await M.request(POSITION+'?resource=bootstrap&contractId='+target+'&year='+year)).body.data;
  assert.equal(positionInitial.state.revision,0);assert.deepEqual(positionInitial.state.allocations,[]);assert.equal(positionInitial.permissions.canPropose,true);
  const row=approvedAnnual.catalog.definition.rows.find(value=>value.code==='QA0002');assert.equal(row.unit,'contracted_staff');assert.equal(row.quantity,'1');
  await reveal(P.field('edit'));await P.field('add').click();await P.host.locator('[data-position-norm]').selectOption('2:'+row.code);
  const allocationSource=positionSyntheticSource();for(const[key,value]of Object.entries({validFrom:'2026-10-01',validTo:'2026-10-31',quantity:row.quantity,...allocationSource}))await P.host.locator('[data-position-field="'+key+'"]').fill(value);
  await P.field('reason').fill('Asignación exclusivamente sintética216 a otro beneficiario vigente, sin cambio de unidades');await P.field('form').locator('button[type=submit]').click();await P.idle();checkPhase('positionProposal');
  const assignmentPending=(await M.request(POSITION+'?resource=bootstrap&contractId='+target+'&year='+year)).body.data.proposals.find(value=>value.status==='pending');assert.ok(assignmentPending);assert.equal(assignmentPending.canReview,false);
  const PC=await positionLoad(C,target,year);await reveal(PC.field('proposals'));await PC.field('proposals').selectOption(assignmentPending.id);assert.equal(await PC.field('proposal').locator('table').count(),2);await PC.field('confirm').check();await PC.field('decision-reason').fill('Revisión independiente sintética216 de norma, beneficiario, cantidad y vigencias');await PC.field('approve').click();await PC.idle();checkPhase('complete');
  const durablePosition=(await M.request(POSITION+'?resource=bootstrap&contractId='+target+'&year='+year)).body.data;assert.equal(durablePosition.state.revision,1);assert.equal(durablePosition.state.allocations.length,1);assert.equal(durablePosition.state.allocations[0].quantity,row.quantity);assert.equal(durablePosition.state.allocations[0].rowCode,row.code);
  await P.field('query').locator('button').click();await P.idle();assert.ok((await P.field('summary').innerText()).includes('versión aprobada 1'));
  await mobile(M.page,P.host,host.output,'position-preparer');await mobile(C.page,PC.host,host.output,'position-approved');screens.push('position-preparer','position-approved');
  // Same actor stays linked/session-valid although employment is inactive.
  // Negative beneficiary uses a new interval entirely AFTER the approved baja.
  const inactive=(await M.request(POSITION+'?resource=bootstrap&contractId='+makerContract+'&year='+year)).body.data;assert.equal(inactive.contractId,makerContract);
  const badBody=positionCommand({command:'propose',contractId:makerContract,year,scopeVersion:inactive.scopeVersion,baseVersion:inactive.state.version,annualVersion:inactive.annual.catalog.version,reason:'Negativa sintética216: beneficiario dado de baja no cubre el intervalo',reviewConfirmed:false,allocations:[{id:randomUUID(),budgetRevision:2,definitionSha256:approvedAnnual.catalog.definitionSha256,rowCode:row.code,validFrom:'2026-10-02',validTo:'2026-10-31',quantity:row.quantity,source:allocationSource}]}),badKey=randomUUID(),badValues=[ctxOf(maker),JSON.stringify(badBody),badKey],badStatement=positions210Rpc(POSITION_COMMAND,badValues,qa.schema),beforeInactive=h.readFullSnapshot();
  await db.expectRunError({caseId:'216-inactive-beneficiary',nativeCode:'POSITION_ASSIGNMENT_DATES_OUTSIDE_EMPLOYMENT',statement:badStatement,runtime:true},async()=>{const response=await post(M,POSITION,badBody,badKey);assert.equal(response.response.status(),422);assert.equal(response.body.code,'POSITION_ASSIGNMENT_DATES_OUTSIDE_EMPLOYMENT');});assert.deepEqual(h.readFullSnapshot(),beforeInactive);
  async function rollbackProbe(kind,text,values,action,httpStatus,httpCode,nativeCode){
   assert.equal(activeProbe,null);const before=h.readFullSnapshot();let row;
   if(kind==='capability')row=h.json([`SELECT to_jsonb(r) FROM ${qa.schema}.iam_role_capability r WHERE role_key=${q(maker.roleKey)} AND capability_key='workforce.structure.read'`],{readOnly:true});
   else if(kind==='session')row=h.json([`SELECT to_jsonb(r) FROM ${qa.schema}.tenant_identity_session r WHERE id=${q(maker.raw.actorSessionId)}::uuid`],{readOnly:true});
   else row=h.json([`SELECT to_jsonb(r) FROM ${qa.schema}.tenant_action_employment_link r WHERE membership_id=${q(maker.raw.membershipId)}::uuid AND employment_contract_id=${q(makerContract)}::uuid`],{readOnly:true});
   const mutation=admin216ProbeMutation({schema:qa.schema,kind,actor:maker.raw,roleKey:maker.roleKey,contractId:makerContract,expectedRow:row}),statement=positions210Rpc(text,values,qa.schema);
   const probe={text,values,nativeCode,calls:0,validated:false,statements:[mutation,'SET LOCAL ROLE municontrol_actions_runtime_app',statement]};
   h.setPhase('administrative216-native-'+kind+'-rollback');activeProbe=probe;
   try{const response=await action();if(response){assert.equal(response.response.status(),httpStatus);assert.equal(response.body.code,httpCode);}assert.equal(probe.calls,1);assert.equal(probe.validated,true);}finally{activeProbe=null;}
   assert.deepEqual(h.readFullSnapshot(),before,'ADMIN216_PROBE_NOT_ROLLED_BACK:'+kind);nativeProbes.push({kind,nativeCode,httpStatus,httpCode,rowsTemporarilyChanged:1,rollbackValidated:true,wholeStateRestored:true});
  }
  const nowAnnual=(await M.request(ANNUAL+'?resource=bootstrap&year='+year)).body.data,unlinkedBody=annualBudgetCommand({command:'propose',year,scopeVersion:nowAnnual.scopeVersion,baseVersion:nowAnnual.catalog.version,proposalId:null,proposalSha256:null,definition:admin216NextSyntheticDefinition(nowAnnual.catalog.definition,{negative:true}),reason:'Negativa exclusivamente sintética216 sin asociación verificable',reviewConfirmed:false}),unlinkedKey=randomUUID();
  await rollbackProbe('unlinked',ANNUAL_COMMAND,[ctxOf(maker),JSON.stringify(unlinkedBody),unlinkedKey],()=>post(M,ANNUAL,unlinkedBody,unlinkedKey),403,'ANNUAL_BUDGET_EMPLOYMENT_REQUIRED','ANNUAL_BUDGET_EMPLOYMENT_REQUIRED');
  for(const spec of [{kind:'capability',status:403,http:'ANNUAL_BUDGET_FORBIDDEN',native:'ANNUAL_BUDGET_FORBIDDEN'},{kind:'session',status:401,http:'ANNUAL_BUDGET_SESSION_INVALID',native:'ACTION_SESSION_INVALID'}]){
   const loaded=await annualLoad(M,year);assert.equal(await loaded.field('content').isVisible(),true);
   const responses=[];const listener=response=>{if(new URL(response.url()).pathname===ANNUAL&&response.request().method()==='GET')responses.push(response);};M.page.on('response',listener);
   await rollbackProbe(spec.kind,ANNUAL_BOOT,[ctxOf(maker),year],async()=>{await loaded.field('query').locator('button').click();await loaded.idle();assert.equal(await loaded.field('content').isVisible(),false);assert.equal(responses.at(-1).status(),spec.status);const data=await responses.at(-1).json();assert.equal(data.code,spec.http);return null;},spec.status,spec.http,spec.native);M.page.off('response',listener);
  }
  const recovered=await annualLoad(M,year);assert.equal(await recovered.field('content').isVisible(),true);assert.equal(await recovered.field('fields').isEnabled(),true);checkPhase('complete');
  const nativeComparisonPdf=await verifyAdmin216NativeComparisonPdf({h,db,admission,session:C,host,trace});checkPhase('complete');
  assert.deepEqual({maker:maker.raw,checker:checker.raw,principals:[maker.principal,checker.principal],sessions:[maker.session,checker.session]},originalActors);assert.ok(Date.now()<deadline);
  verifyPositionAdministrative216Epoch(h,admission.administrative216);const sources=bookend();assert.equal(diagnostics.length,0,'ADMIN216_REAL_INTERNAL_DATA_FAILURE');assert.equal(host.evidence.external.length,0);assert.equal(host.evidence.pageErrors.length,0);assert.equal(host.evidence.serverErrors.length,0);
  result={version:'position-administrative216-same190-browser.v1',passed:true,sourceCommit:h.sourceCommit,major:h.major,sameCanonical190:true,actualSql:true,actualHttp:true,actualBrowser:true,
   sourceBookend:sources,approvedExistingMakerTermination:true,actorRemainsVerifiedLinked:true,actorEmploymentInactive:true,activeBeneficiaryRequired:true,annualRevision:2,assignmentRevision:1,
   independentReview:true,ownApprovalDenied:true,originalBodyKeyPostReplay:true,lostAcknowledgements:2,recoveryGetSameKey:true,confirmedBusinessRowsAdded:6,expectedDelta:{lifecycleProposals:1,lifecycleReviews:1,annualEvents:2,assignmentEvents:2},
   sqlRollbackProbes:nativeProbes,nativeComparisonPdf,inactiveBeneficiaryNativeDenied:true,desktopAnd390And320:true,mobileStates:screens,noeliaAdministrativeFlowProven:true,personalNoeliaSessionTested:false,
   authenticationFixture:true,authenticationProviderFlowProven:false,newIdentities:0,newCapabilities:0,newGrants:0,newDatabase:0,payrollCalculatedByThisPhase:false,productionWrites:0,paymentExecuted:false,digitalSignatureExecuted:false,municipalAcceptance:false,nominalRowsReturned:0};
  fs.writeFileSync(path.join(host.output,'report.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});h.check('same190 administrative actor with approved baja retains verified identity and operates annual/active-beneficiary UI; real rollback revocations, independent review and original-key recovery are proven');
 }catch(error){failure=error;throw error;}finally{try{await host.close();}catch(error){if(!failure)throw error;}}
 return result;
}
