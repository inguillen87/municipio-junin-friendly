// Private source candidate. The author did not import, construct or run it.
// Insert only after canonical190's existing IAM/201/programme/855 registration
// and before its FIRST capture. Every browser request here is read-only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createOwnLiquidationHandler} from '../../api/internal-own-payroll-liquidation.js';
import {createOwnRunHandler} from '../../api/internal-own-payroll-run.js';
import {createEmploymentCatalogHandler} from '../../api/internal-employment-catalog.js';
import {createOwnProgramHandler} from '../../api/internal-own-payroll-program.js';
import {createInternalDataHandler} from '../../api/internal-data.js';
import {ownLiquidationBootstrap,OWN_LIQ_REVIEW} from '../../assets/own-payroll-liquidation-model.js';
import {ownRunBootstrap} from '../../assets/own-payroll-run-model.js';
import {OWN_RUN_PREPARE} from '../../assets/own-payroll-run-workspace-model.js';
import {nativeRoster} from '../../assets/native-roster-model.js';
import {OWN_PAYROLL_READINESS_FILTERS,OWN_PAYROLL_READINESS_ROSTER_URL} from '../../assets/own-payroll-readiness-model.js';
import {OWN_RUN_FULL_JSON} from '../../assets/own-payroll-response.js';
import {ownerDecisionQaLiteral as q} from './municipal-owner-adoption-decision-qa.mjs';
import {createCanonical190BrowserHost,calculationPanelReads,PUBLIC_ROOT} from './own-payroll-canonical190-browser-host-qa.mjs';

const RUN='/api/internal-own-payroll-run',LIQ='/api/internal-own-payroll-liquidation';
const BOOTSTRAPS=new Set([
 'SELECT public.own_run_bootstrap_v1($1::jsonb) AS result',
 'SELECT public.own_run_bootstrap_v2($1::jsonb) AS result',
 'SELECT public.own_liquidation_bootstrap_v1($1::jsonb) AS result'
]);
const ASSETS=Object.freeze([
 'own-payroll-liquidation-panel.js','own-payroll-liquidation-model.js',
 'own-payroll-run-panel.js','own-payroll-run-workspace-model.js',
 'own-payroll-annulment-preparation-link.js','payroll-navigation.js',
 'own-payroll-readiness-model.js','own-payroll-response.js',
 'native-salary-catalog-model.js','own-payroll-run-model.js',
 'own-payroll-run-date.js','own-payroll-individual-panel.js'
]);
const rawSha=value=>createHash('sha256').update(value).digest('hex');
const exact=(value,keys)=>assert.deepEqual(Reflect.ownKeys(value).sort(),[...keys].sort());

export async function verifyOwnInitialEmptyBrowserOn190(context){
 exact(context,['version','h','db','qa','maker','reviewer','contracts','readSnapshot']);
 assert.equal(context.version,'own-initial-empty-live190-context.v1');
 const {h,db,qa,maker,reviewer,contracts,readSnapshot}=context;
 assert.strictEqual(h.qa,qa);assert.ok([17,18].includes(h.major));
 assert.match(qa.schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);assert.match(h.sourceCommit,/^[a-f0-9]{40}$/);
 assert.equal(qa.operationalPairBaseline,'published107');
 assert.equal(contracts.length,855);assert.equal(new Set(contracts).size,855);
 assert.deepEqual(contracts,[...contracts].sort());
 assert.equal(typeof db.query,'function');assert.equal(typeof db.run,'function');
 assert.equal(typeof readSnapshot,'function');
 for(const [access,raw,caps]of [[maker,qa.actor,OWN_RUN_PREPARE],[reviewer,qa.checker,OWN_LIQ_REVIEW]]){
  assert.equal(access.principal.authorized,true);assert.equal(access.principal.session.mfa,true);
  assert.equal(access.session.id,raw.actorSessionId);
  assert.equal(access.principal.tenant.membershipId,raw.membershipId);
  assert.ok(caps.every(cap=>access.principal.tenant.effectiveCapabilities.includes(cap)));
 }
 assert.notEqual(qa.actor.membershipId,qa.checker.membershipId);
 assert.ok(!reviewer.principal.tenant.effectiveCapabilities.includes('payroll.calculation.prepare'));
 // Aggregate audit through the SAME already guarded h.json, never a new RPC,
 // adapter, seed or alternate database. The UI itself uses genuine own sessions.
 const census=()=>h.json([`SELECT jsonb_build_object(
 'captures',(SELECT count(*)::integer FROM ${qa.schema}.own_payroll_run_capture),
 'saved',(SELECT count(*)::integer FROM ${qa.schema}.own_payroll_run_result),
 'liquidationEvents',(SELECT count(*)::integer FROM ${qa.schema}.own_payroll_liquidation_event),
 'annulEvents',(SELECT count(*)::integer FROM ${qa.schema}.own_payroll_annul_event),
 'closeEvents',(SELECT count(*)::integer FROM ${qa.schema}.own_payroll_close_event),
 'nativeRegistered',(SELECT count(*)::integer FROM ${qa.schema}.native_employee_registration),
 'makerRole',(SELECT role_key FROM ${qa.schema}.tenant_membership WHERE id=${q(qa.actor.membershipId)}::uuid),
 'reviewerRole',(SELECT role_key FROM ${qa.schema}.tenant_membership WHERE id=${q(qa.checker.membershipId)}::uuid))`],{readOnly:true});
 const before=readSnapshot(),beforeCensus=census();
 for(const key of ['captures','saved','liquidationEvents','annulEvents','closeEvents'])assert.equal(beforeCensus[key],0,'INITIAL190_NOT_EMPTY:'+key);
 assert.equal(beforeCensus.nativeRegistered,855);
 for(const key of ['makerRole','reviewerRole'])assert.ok(typeof beforeCensus[key]==='string'&&beforeCensus[key].length>0);
 const sourceBookend=ASSETS.map(file=>{
  const relative='assets/'+file,bytes=fs.readFileSync(path.join(PUBLIC_ROOT,relative));
  assert.deepEqual(fs.readFileSync(path.join(PUBLIC_ROOT,'public',relative)),bytes,'INITIAL190_BUILT_BYTES:'+relative);
  return{path:relative,sha256:rawSha(bytes)};
 });
 const sourceAfter=()=>{for(const pin of sourceBookend){const bytes=fs.readFileSync(path.join(PUBLIC_ROOT,pin.path));assert.equal(rawSha(bytes),pin.sha256);assert.deepEqual(fs.readFileSync(path.join(PUBLIC_ROOT,'public',pin.path)),bytes);}};
 const sqlReads=[],httpWrites=[],readFailures=[],responses=[];
 const sql={query:async(statement,values)=>{
  assert.ok(BOOTSTRAPS.has(statement),'INITIAL190_NON_BOOTSTRAP_RPC_REFUSED:'+statement);
  sqlReads.push(statement);return db.query(statement,values);
 }};
 const reads=calculationPanelReads(db,qa.schema);
 const onlyGet=handler=>(req,res)=>{assert.equal(req.method,'GET','INITIAL190_HTTP_WRITE_REFUSED');return handler(req,res);};
 const actors=new Map([
  ['maker',{...maker,raw:qa.actor,roleKey:beforeCensus.makerRole}],
  ['reviewer',{...reviewer,raw:qa.checker,roleKey:beforeCensus.reviewerRole}]
 ]);
 const host=await createCanonical190BrowserHost({h,actors,getSql:async()=>sql,
  outputName:'liquidation124-initial-verified-empty-browser',handlers:deps=>new Map([
   [LIQ,onlyGet(createOwnLiquidationHandler(deps))],[RUN,onlyGet(createOwnRunHandler(deps))],
   ['/api/internal-employment-catalog',onlyGet(createEmploymentCatalogHandler({...deps,getSql:async()=>reads}))],
   ['/api/internal-own-payroll-program',onlyGet(createOwnProgramHandler({...deps,getSql:async()=>reads}))],
   ['/api/internal-data',onlyGet(createInternalDataHandler({env:deps.env,requireCompatibleInternalAccess:deps.requireAccess,
    actionMutationSession:deps.sessionFor,getInternalSql:async()=>reads,getActionCenterSql:async()=>reads,
    reportReadFailure:error=>readFailures.push(String(error?.message??error))}))]
  ])});
 const {origin,output,evidence}=host;const checks=[];let result,failure;
 const observe=page=>{
  page.on('request',request=>{const url=new URL(request.url());if(url.origin===origin&&url.pathname.startsWith('/api/')&&request.method()!=='GET')httpWrites.push({path:url.pathname,method:request.method()});});
  page.on('response',response=>{const url=new URL(response.url());if(url.origin===origin&&url.pathname.startsWith('/api/'))responses.push({path:url.pathname,resource:url.searchParams.get('resource'),status:response.status()});});
 };
 const preserved=()=>{assert.deepEqual(census(),beforeCensus);assert.deepEqual(readSnapshot(),before);assert.deepEqual(httpWrites,[]);};
 try{
  const r=await host.open('reviewer'),page=r.page,$=key=>page.locator('[data-liq-'+key+']');observe(page);
  const settled=()=>page.waitForFunction(()=>document.querySelector('.own-liquidation')?.getAttribute('aria-busy')==='false',{},{timeout:45000});
  const bootstrapResponse=page.waitForResponse(response=>{const url=new URL(response.url());return url.origin===origin&&url.pathname===LIQ&&url.searchParams.get('resource')==='bootstrap';});
  await page.goto(origin+'/nomina#decisiones');assert.equal((await bootstrapResponse).status(),200);await $('empty').waitFor({state:'visible'});await settled();
  assert.equal(await $('history').locator('[data-liq-run-id]').count(),0);
  assert.equal(await $('detail').isHidden(),true);assert.equal(await $('review').isHidden(),true);
  assert.equal(await $('totals').locator('tr').count(),0);assert.equal(await $('rows').locator('tr').count(),0);
  assert.equal(await $('individual').innerText(),'');
  assert.ok((await $('empty').innerText()).includes('Todavía no hay resultados propios para confirmar o anular.'));
  assert.equal(await $('empty').getByRole('link',{name:'Ir a Calcular',exact:true}).getAttribute('href'),'/nomina#calculo');
  assert.equal(await $('send').isDisabled(),true);
  const emptyOracle=await r.request(LIQ+'?resource=bootstrap',{headers:{Accept:OWN_RUN_FULL_JSON}});
  assert.equal(emptyOracle.response.status(),200);assert.deepEqual(ownLiquidationBootstrap(emptyOracle.body.data).runs,[]);preserved();
  checks.push('actual authenticated reviewer bootstrap has zero calculated runs and the product shows only its verified-empty guidance');
  // Invalidating the active consultation must withdraw the claim of emptiness.
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(await $('empty').isHidden(),true);assert.equal(await $('detail').isHidden(),true);preserved();
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
  await $('refresh').click();await $('empty').waitFor({state:'visible'});await settled();preserved();
  checks.push('hidden/invalidated consultation is not mislabeled as verified empty; explicit fresh authenticated consultation restores the actual empty state');
  for(const width of [1366,390,320]){await page.setViewportSize({width,height:1100});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(output,'empty-review-'+width+'.png'),fullPage:true});}
  // The preparer opens the same public destination with HER OWN existing session.
  // No reviewer principal/key is transferred and no link automatically calculates.
  const m=await host.open('maker'),makerPage=m.page,calc=key=>makerPage.locator('[data-own-'+key+']');observe(makerPage);
  const calcSettled=()=>makerPage.waitForFunction(()=>document.querySelector('.own-run')?.getAttribute('aria-busy')==='false',{},{timeout:45000});
  const rosterResponse=makerPage.waitForResponse(response=>{const url=new URL(response.url());return url.origin===origin&&url.pathname==='/api/internal-data'&&url.searchParams.get('resource')==='nativeroster';});
  await makerPage.goto(origin+'/nomina#calculo');assert.equal((await rosterResponse).status(),200);await calcSettled();
  assert.equal(await calc('readiness').getAttribute('data-state'),'success');
  assert.ok((await calc('readiness-facts').innerText()).startsWith('855 legajos propios en la consulta completa · maestro aprobado, revisión '));
  assert.ok((await calc('readiness-facts').innerText()).includes(' · programa aprobado, revisión '));
  assert.equal(await calc('fields').isDisabled(),false);assert.equal(await calc('confirm').isChecked(),false);assert.equal(await calc('send').isDisabled(),true);
  assert.equal(await calc('date').inputValue(),'');assert.equal(await calc('kind').inputValue(),'');
  assert.equal(await calc('result').isHidden(),true);assert.equal(await calc('recover').isHidden(),true);
  assert.equal(await calc('history').locator('[data-own-open]').count(),0);assert.equal((await calc('history').innerText()).trim(),'No hay cálculos propios guardados para esta cuenta.');
  assert.equal(await calc('totals').locator('tr').count(),0);assert.equal(await calc('rows').locator('tr').count(),0);assert.equal(await calc('individual').innerText(),'');
  const runOracle=await m.request(RUN+'?resource=bootstrap&contractVersion=2',{headers:{Accept:OWN_RUN_FULL_JSON}});
  assert.equal(runOracle.response.status(),200);const boot=ownRunBootstrap(runOracle.body.data);assert.equal(boot.version,'own-payroll-bootstrap.v2');assert.equal(boot.canCalculate,true);assert.deepEqual(boot.runs,[]);
  const rosterOracle=await m.request(OWN_PAYROLL_READINESS_ROSTER_URL);assert.equal(rosterOracle.response.status(),200);
  const roster=nativeRoster(rosterOracle.body.data,OWN_PAYROLL_READINESS_FILTERS);assert.equal(roster.version,'native-roster.v2');assert.equal(roster.total,855);assert.equal(roster.complete,true);assert.deepEqual(roster.rows.map(row=>row.contractId).sort(),contracts);
  assert.ok(!((await calc('status').innerText())+' '+(await calc('history').innerText())).includes('Pendiente de confirmación'));
  preserved();checks.push('own complete855 roster and approved programme enable preparation while zero captures/results produce no fabricated pending liquidation');
  for(const width of [1366,390,320]){await makerPage.setViewportSize({width,height:1100});assert.ok(await makerPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await makerPage.screenshot({path:path.join(output,'empty-calculation-'+width+'.png'),fullPage:true});}
  assert.ok(responses.some(row=>row.path==='/api/internal-auth'&&row.status===200));
  assert.ok(sqlReads.includes('SELECT public.own_liquidation_bootstrap_v1($1::jsonb) AS result'));
  assert.ok(sqlReads.includes('SELECT public.own_run_bootstrap_v2($1::jsonb) AS result'));
  assert.deepEqual(evidence.pageErrors,[]);assert.deepEqual(evidence.serverErrors,[]);assert.deepEqual(evidence.external,[]);assert.deepEqual(readFailures,[]);
  preserved();sourceAfter();
  result={version:'own-initial-verified-empty-live190-browser.v1',passed:true,sourceCommit:h.sourceCommit,major:h.major,
   actualSql:true,actualApiHandler:true,actualHttp:true,actualBrowser:true,authenticationFixture:true,completeAuthenticationHandler:false,
   checks,sourceBookend,httpEvidence:evidence.httpEvidence,initialVerifiedEmptyBrowserProven:true,ownRosterComplete:855,
   initialCaptures:0,initialSavedResults:0,initialLiquidationEvents:0,initialAnnulEvents:0,initialCloseEvents:0,
   httpWrites:0,addedCaptures:0,addedSavedResults:0,addedLiquidationDecisions:0,addedAnnulments:0,addedCloseEvents:0,
   invalidatedEmptyStateWithdrawn:true,preparationReadyWithoutCalculation:true,fabricatedPendingState:false,
   originalRowsAndIamPreserved:true,newRoles:0,newGrants:0,newIdentities:0,newRpcDescriptors:0,
   allLegacyDecisionUiCasesCovered:false,before:beforeCensus,after:census(),synthetic:true,productionWrites:0,
   paymentExecuted:false,municipalAcceptance:false};
 }catch(error){failure=error;fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({passed:false,message:error.message,checks,httpWrites,sqlReads,responses,readFailures,pageErrors:evidence.pageErrors,serverErrors:evidence.serverErrors,synthetic:true},null,2)+'\n',{flag:'wx'});}
 finally{try{await host.close();}catch(error){if(!failure)failure=error;}}
 if(failure)throw failure;
 preserved();sourceAfter();fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});return Object.freeze(result);
}
