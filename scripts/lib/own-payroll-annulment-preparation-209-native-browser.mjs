// PRIVATE SOURCE CANDIDATE. Never imported, parsed or executed by its author.
// Cross-user209 handoff on the SAME canonical190 host, invoked by the209 native
// tail AFTER its in-process projection proof and BEFORE any reconfirmation.
// No fixture, schema, IAM grant, transport, browser fallback or foundation is
// created here. Opening, consulting and applying a draft never calculates.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {createOwnAnnulHandler} from '../../api/internal-own-payroll-annulment.js';
import {createOwnLiquidationHandler} from '../../api/internal-own-payroll-liquidation.js';
import {createOwnRunHandler} from '../../api/internal-own-payroll-run.js';
import {createOwnAnnulPreparationHandler} from '../../api/internal-own-payroll-annulment-preparation.js';
import {createEmploymentCatalogHandler} from '../../api/internal-employment-catalog.js';
import {createOwnProgramHandler} from '../../api/internal-own-payroll-program.js';
import {createInternalDataHandler} from '../../api/internal-data.js';
import {noeliaCircuitRosterRead} from './noelia-payroll-circuit-qa.mjs';
import {ownerDecisionQaLiteral as q} from './municipal-owner-adoption-decision-qa.mjs';
import {OWN_RUN_PREPARE,OWN_RUN_TYPES} from '../../assets/own-payroll-run-workspace-model.js';
import {OWN_ANNUL_ACCESS} from '../../assets/own-payroll-annulment-model.js';
import {ownAnnulPreparationLink} from '../../assets/own-payroll-annulment-preparation-link.js';
import {verifiedOwnAnnulPreparation,ownAnnulPreparationDates,assertSameOwnAnnulPreparation} from '../../assets/own-payroll-annulment-preparation-model.js';
import {ownRunDateLabel} from '../../assets/own-payroll-run-date.js';

const root=fileURLToPath(new URL('../../',import.meta.url));
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sorted=value=>[...value].sort();
const exact=(value,keys)=>assert.deepEqual(Reflect.ownKeys(value).sort(),sorted(keys));
const PREPARATION='/api/internal-own-payroll-annulment-preparation';
const CALCULATION_RPC=/^SELECT public\.own_run_capture_v1\(/;
const MUTATING_RPC=/^SELECT public\.own_(?:run_capture|run_complete(?:_full)?|liquidation_command|annul_command(?:_full)?|close_command(?:_full)?)_v\d\(/;

// The Calcular panel refresh reads the employment catalogue, the approved
// programme, the directory snapshot and the complete own roster (readiness).
// canonical190's finite RPC contract does not list those reads, so this adapter
// relocates EXACTLY these four read-only statements to the same host, the way
// createOwnPayrollReadinessSql does on the146 hosts. It admits nothing else and
// no write; the three function reads keep the host's runtime-role convention.
function calculationPanelReads(db,schema){
 assert.match(schema,/^mc_qa_fixed_092_[a-f0-9]{32}$/);
 const functions=new Map([
  ['SELECT public.native_employment_catalog_bootstrap_v1($1::jsonb) AS result','native_employment_catalog_bootstrap_v1'],
  ['SELECT public.native_employee_directory_snapshot_v1($1::jsonb) AS result','native_employee_directory_snapshot_v1'],
  ['SELECT public.own_program_bootstrap_v1($1::jsonb) AS result','own_program_bootstrap_v1']
 ]);
 return{query:async(text,values)=>{
  const roster=noeliaCircuitRosterRead(text,values,schema);
  if(roster)return db.run('SELECT ('+roster+')');
  const name=functions.get(text);assert.ok(name,'ANNUL209_BROWSER_READ_NOT_ALLOWED');
  assert.ok(Array.isArray(values)&&values.length===1&&typeof values[0]==='string','ANNUL209_BROWSER_READ_ARITY');
  const context=JSON.parse(values[0]);assert.ok(context&&typeof context==='object'&&!Array.isArray(context));
  return[{result:await db.run('SELECT '+name+'('+q(values[0])+'::jsonb)',true)}];
 }};
}

export async function verifyOwnAnnulPreparation209BrowserOn190(context,fixture){
 exact(context,['h','db','qa','readSnapshot','synthetic']);
 exact(fixture,['sourceId','projection','expectedGroups','draftDate','actors','phase']);
 const {h,db,qa,readSnapshot}=context;
 assert.strictEqual(h.qa,qa);assert.ok([17,18].includes(h.major));assert.match(h.sourceCommit,/^[a-f0-9]{40}$/);
 assert.equal(context.synthetic,true);assert.equal(typeof readSnapshot,'function');assert.equal(typeof db.query,'function');assert.equal(typeof db.run,'function');
 assert.ok(['handoff','current-state-changed'].includes(fixture.phase),'ANNUL209_BROWSER_PHASE');
 const phase=fixture.phase,sourceId=fixture.sourceId;
 assert.match(sourceId,/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
 exact(fixture.actors,['reviewer','receiver']);
 for(const name of['reviewer','receiver']){const actor=fixture.actors[name];exact(actor,['principal','session','raw','roleKey']);assert.equal(actor.principal.authorized,true);assert.equal(actor.principal.session.mfa,true);assert.equal(actor.session.id,actor.raw.actorSessionId);assert.equal(actor.principal.tenant.membershipId,actor.raw.membershipId);assert.equal(actor.principal.user.email,actor.raw.actorEmail);}
 const {reviewer,receiver}=fixture.actors;
 assert.notEqual(reviewer.raw.membershipId,receiver.raw.membershipId);assert.notEqual(reviewer.raw.actorEmail,receiver.raw.actorEmail);assert.notEqual(reviewer.session.id,receiver.session.id);
 const reviewerCaps=reviewer.principal.tenant.effectiveCapabilities,receiverCaps=receiver.principal.tenant.effectiveCapabilities;
 assert.ok(OWN_ANNUL_ACCESS.every(cap=>reviewerCaps.includes(cap)));assert.ok(!reviewerCaps.includes('payroll.calculation.prepare'),'ANNUL209_REVIEWER_MUST_NOT_GAIN_PREPARE');
 assert.ok(OWN_RUN_PREPARE.every(cap=>receiverCaps.includes(cap)));
 for(const forbidden of['payroll.calculation.approve','payroll.calculation.close'])assert.ok(!receiverCaps.includes(forbidden),'ANNUL209_RECEIVER_MUST_NOT_GAIN_'+forbidden);
 // The in-process projection is the oracle; the browser must read the same
 // complete census under the receiver's own session before any date filter.
 const projection=fixture.projection;
 assert.equal(projection.source.id,sourceId);assert.ok(projection.affected.length>0);assert.ok(projection.runs.length>=2,'ANNUL209_BROWSER_NEEDS_TWO_RUNS');
 const expectedGroups=ownAnnulPreparationDates(projection);assert.deepEqual(expectedGroups,fixture.expectedGroups);assert.ok(expectedGroups.length>=2);
 assert.ok(expectedGroups.some(group=>group.liquidationDate===fixture.draftDate),'ANNUL209_BROWSER_DRAFT_DATE_REQUIRED');
 const draftRows=projection.affected.filter(row=>row.liquidationDate===fixture.draftDate),draftNumbers=sorted(draftRows.map(row=>row.employeeNumber));
 assert.equal(draftNumbers.length,expectedGroups.find(group=>group.liquidationDate===fixture.draftDate).count);
 const allNumbers=projection.affected.map(row=>row.employeeNumber);assert.equal(new Set(allNumbers).size,allNumbers.length);
 const link=new URL(ownAnnulPreparationLink(sourceId),'http://qa.invalid');
 assert.equal(link.pathname,'/nomina');assert.equal(link.hash,'#calculo');assert.deepEqual([...link.searchParams],[['anulacion',sourceId]]);
 const sourceBookend=[];
 for(const file of['own-payroll-run-panel.js','own-payroll-run-workspace-model.js','own-payroll-annulment-preparation-model.js','own-payroll-annulment-preparation-link.js',
  'payroll-navigation.js','own-payroll-readiness-model.js','own-payroll-annulment-panel.js','own-payroll-annulment-review-model.js','own-payroll-response.js','native-salary-catalog-model.js','own-payroll-run-model.js','own-payroll-run-date.js']){
  const relative='assets/'+file,source=fs.readFileSync(path.join(root,relative));
  assert.deepEqual(fs.readFileSync(path.join(root,'public',relative)),source,'ANNUL209_BUILT_SOURCE_MISMATCH:'+relative);
  sourceBookend.push({path:relative,sha256:createHash('sha256').update(source).digest('hex')});
 }
 const baseline=readSnapshot(),checks=[],httpEvidence=[],external=[],pageErrors=[],serverErrors=[],pagePosts=[],purposeReads=[],loginTargets=[];
 let server,browser,calculationPosts=0,mutations=0,withdrawn=false,receiverSessionSuffix='';
 const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
 const instrumentedDb={query:async(statement,values)=>{
  if(CALCULATION_RPC.test(statement))calculationPosts++;
  if(MUTATING_RPC.test(statement))mutations++;
  return db.query(statement,values);
 }};
 const actors=new Map([['reviewer',reviewer],['receiver',receiver]]);
 const actorOf=req=>{const match=String(req.headers?.cookie??'').match(/(?:^|;\s*)qa_actor=([a-z]+)(?:;|$)/);return match?actors.get(match[1])??null:null;};
 const byMembership=principal=>[...actors.values()].find(actor=>actor.principal.tenant.membershipId===principal?.tenant?.membershipId)??null;
 const effectiveCaps=actor=>actor===receiver&&withdrawn?receiverCaps.filter(cap=>cap!=='payroll.calculation.prepare'):actor.principal.tenant.effectiveCapabilities;
 const env={};
 // Auth is explicitly a fixture reflecting canonical IAM, keyed by the browser
 // context's own cookie so the two sessions never share a principal. Every
 // business RPC still runs with that actor's real session context in SQL.
 const deps={env,
  requireAccess:async(req,res)=>{const actor=actorOf(req);if(!actor){res.status(401).json({ok:false,code:'QA_UNAUTHENTICATED',error:'Sesión sintética ausente.'});return null;}return{mode:'managed',principal:actor.principal};},
  sessionFor:access=>{const actor=byMembership(access.principal);assert.ok(actor,'ANNUL209_BROWSER_FOREIGN_PRINCIPAL');return actor.session;},
  getSql:async()=>instrumentedDb};
 const reads=calculationPanelReads(db,qa.schema);
 const handlers=new Map([
  ['/api/internal-own-payroll-annulment',createOwnAnnulHandler(deps)],
  ['/api/internal-own-payroll-liquidation',createOwnLiquidationHandler(deps)],
  ['/api/internal-own-payroll-run',createOwnRunHandler(deps)],
  [PREPARATION,createOwnAnnulPreparationHandler(deps)],
  ['/api/internal-employment-catalog',createEmploymentCatalogHandler({...deps,getSql:async()=>reads})],
  ['/api/internal-own-payroll-program',createOwnProgramHandler({...deps,getSql:async()=>reads})],
  ['/api/internal-data',createInternalDataHandler({env,requireCompatibleInternalAccess:deps.requireAccess,actionMutationSession:deps.sessionFor,getInternalSql:async()=>reads,getActionCenterSql:async()=>reads,reportReadFailure:error=>serverErrors.push(String(error?.message??error))})]
 ]);
 const output=path.resolve(h.destination,'annulment-preparation-209-browser-'+phase);
 assert.ok(output.startsWith(path.resolve(h.destination)+path.sep));
 fs.mkdirSync(output,{recursive:false});
 let failure,result;
 try{
  server=http.createServer((req,res)=>{
   const url=new URL(req.url,'http://qa.invalid');res.setHeader('Cache-Control','no-store');
   const json=(status,value)=>{if(res.headersSent){res.destroy();return;}res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
   if(url.pathname==='/api/internal-auth'){
    const actor=actorOf(req);if(!actor){json(401,{ok:false,code:'QA_UNAUTHENTICATED',error:'Sesión sintética ausente.'});return;}
    json(200,{ok:true,authenticated:true,sessionVersion:2,
     user:{id:actor.raw.actorSessionId+(actor===receiver?receiverSessionSuffix:''),email:actor.raw.actorEmail},
     access:{context:'tenant',tenant:{id:actor.raw.tenantId,roleKey:actor.roleKey},tenantCapabilities:effectiveCaps(actor),platformCapabilities:[],platformRoles:[]},
     expiresAt:new Date(Date.now()+3600000).toISOString()});return;
   }
   const handler=handlers.get(url.pathname);
   if(handler){
    req.query=Object.fromEntries(url.searchParams);res.status=value=>{res.statusCode=value;return res;};
    res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return res;};
    Promise.resolve(handler(req,res)).catch(error=>{serverErrors.push(error.message);json(500,{ok:false,error:'QA_HANDLER_REJECTED'});});return;
   }
   if(url.pathname.startsWith('/api/')){json(503,{ok:false,error:'Unrelated QA service is outside this continuation'});return;}
   // Same rewrite as the published product: /nomina serves nomina-control.html.
   const publicRoot=path.join(root,'public');let file;
   try{file=path.resolve(publicRoot,'.'+(url.pathname==='/nomina'?'/nomina-control.html':decodeURIComponent(url.pathname)));}catch{res.writeHead(400).end();return;}
   const allowed=file===path.join(publicRoot,'nomina-control.html')||
    file.startsWith(path.join(publicRoot,'assets')+path.sep)&&/\.(js|css|png|svg|webp|woff2?)$/.test(file);
   if(req.method!=='GET'||!allowed||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
   const type=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':file.endsWith('.svg')?'image/svg+xml':'application/octet-stream';
   res.writeHead(200,{'Content-Type':type});res.end(fs.readFileSync(file));
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin='http://127.0.0.1:'+server.address().port;env.INTERNAL_APP_ORIGIN=origin;
  const handoffLink=origin+link.pathname+link.search+link.hash;
  const executable=process.env.OWN_LIQ_QA_HEADLESS_EXECUTABLE;
  if(executable)assert.ok(path.isAbsolute(executable)&&fs.existsSync(executable)&&/^chrome-headless-shell(?:\.exe)?$/.test(path.basename(executable)));
  browser=await chromium.launch({headless:true,...(executable?{executablePath:executable}:{})});
  const contexts=[];
  const open=async actorName=>{
   const browserContext=await browser.newContext({viewport:{width:1366,height:1100},serviceWorkers:'block'});contexts.push(browserContext);
   if(actorName)await browserContext.addCookies([{name:'qa_actor',value:actorName,url:origin}]);
   await browserContext.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.origin!==origin){external.push(route.request().url());return route.abort('blockedbyclient');}
    // The login page itself is outside this continuation; only its destination
    // contract is observed. Nothing is signed in from here.
    if(url.pathname==='/acceso'){loginTargets.push(url.searchParams.get('next'));return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>QA acceso</title>'});}
    return route.continue();
   });
   const page=await browserContext.newPage();page.on('pageerror',error=>pageErrors.push(error.message));
   page.on('request',request=>{const url=new URL(request.url());if(request.method()==='POST'&&url.origin===origin&&url.pathname.startsWith('/api/'))pagePosts.push({actor:actorName,path:url.pathname});});
   page.on('response',response=>{const request=response.request(),url=new URL(response.url());if(request.method()==='GET'&&url.origin===origin&&url.pathname===PREPARATION)purposeReads.push({actor:actorName,query:[...url.searchParams],status:response.status()});});
   const $=key=>page.locator('[data-own-'+key+']');
   const settled=()=>page.waitForFunction(()=>document.querySelector('[data-own-status]')?.closest('.own-run')?.getAttribute('aria-busy')==='false',{}, {timeout:45000});
   const chips=()=>$('chips').locator('span > span').evaluateAll(nodes=>nodes.map(node=>node.textContent.trim()));
   const options=()=>$('projected-date').locator('option').evaluateAll(nodes=>nodes.map(node=>[node.value,node.textContent.trim()]));
   const request=async(relative,options={})=>{
    const response=await browserContext.request.fetch(origin+relative,{...options,headers:{Accept:'application/json',Origin:origin,...options.headers}});
    const body=await response.body();httpEvidence.push({actor:actorName,path:new URL(relative,origin).pathname,method:options.method??'GET',status:response.status(),bytes:body.length});
    return{response,body:JSON.parse(body.toString('utf8'))};
   };
   return{browserContext,page,$,settled,chips,options,request};
  };
  const purposeCount=()=>purposeReads.length;
  // 1. No session: the reference survives the login destination without any
  //    actor, key or consent, and nothing nominal was read.
  {
   const anonymous=await open(null);
   await anonymous.page.goto(handoffLink);await anonymous.$('login').waitFor({state:'visible'});await anonymous.settled();
   check(purposeCount()===0&&pagePosts.length===0,'an unauthenticated link open reads no projection and sends nothing');
   await anonymous.$('login').click();
   await anonymous.page.waitForFunction(()=>location.pathname==='/acceso',{}, {timeout:15000});
   assert.equal(loginTargets.length,1);const target=new URL(loginTargets[0],origin);
   assert.equal(target.pathname,'/nomina');assert.equal(target.hash,'#calculo');assert.deepEqual([...target.searchParams],[['anulacion',sourceId]]);
   check(!/key|accessKey|actor|scopeVersion|consent/i.test(loginTargets[0]),'login destination keeps only the opaque source reference');
   await anonymous.browserContext.close();
  }
  // 2. The reviewer who annulled holds the link but never gains prepare: the
  //    product keeps the client gate closed and the real handler answers 403.
  {
   const checker=await open('reviewer');
   await checker.page.goto(handoffLink);await checker.$('projected-preparation').waitFor({state:'visible'});await checker.settled();
   check(purposeCount()===0&&await checker.$('projected-load').isDisabled()&&(await checker.options()).length===1,'reviewer without prepare cannot consult the projection from the real panel');
   const forbidden=await checker.request(PREPARATION+'?resource=detail&id='+sourceId);
   assert.equal(forbidden.response.status(),403);assert.equal(forbidden.body.ok,false);assert.equal(forbidden.body.code,'OWN_ANNUL_PREPARATION_FORBIDDEN');
   check(pagePosts.length===0&&calculationPosts===0,'reviewer handoff attempt is rejected before SQL and never calculates');
   await checker.browserContext.close();
  }
  if(phase==='current-state-changed'){
   // A later real confirmation in the annulled scope: the receiver sees the
   // actual cause, keeps the reference and no draft or calculation appears.
   const receiverPage=await open('receiver');
   await receiverPage.page.goto(handoffLink);await receiverPage.$('projected-preparation').waitFor({state:'visible'});await receiverPage.settled();
   assert.equal(purposeCount(),1);assert.equal(purposeReads[0].status,409);
   const status=await receiverPage.$('status').innerText();
   check(status.includes('Cambió una liquidación del alcance anulado')&&!status.includes('intento'),'current-state rejection is reported as such in the real panel');
   check((await receiverPage.options()).length===1&&(await receiverPage.chips()).length===0&&!await receiverPage.$('confirm').isChecked()&&!await receiverPage.$('projected-preparation').isHidden()&&!await receiverPage.$('projected-load').isDisabled(),'rejected209 keeps the reference without any draft rows');
   check(pagePosts.length===0&&calculationPosts===0&&mutations===0,'rejected209 sends nothing');
   assert.deepEqual(readSnapshot(),baseline);
   await receiverPage.browserContext.close();
   result={version:'own-annul-preparation209-live190-native-browser.v1',phase,passed:true,sourceCommit:h.sourceCommit,major:h.major,sourceIdJsonSha256:sha(sourceId),checks,httpEvidence,sourceBookend,purposeReads,loginTargets:loginTargets.length,pagePosts:pagePosts.length,calculationPosts,mutations,actualSql:true,actualHttp:true,actualBrowser:true,receiptToPreparationBrowserProven:false,currentStateRejectionBrowserProven:true,synthetic:true,productionWrites:0,paymentExecuted:false,municipalAcceptance:false};
  }else{
   // 3. The receiver's own session opens the same link: the complete census and
   //    both runs are read and verified before any date, no group is preselected.
   const receiverPage=await open('receiver');
   const firstRead=receiverPage.page.waitForResponse(response=>new URL(response.url()).pathname===PREPARATION);
   await receiverPage.page.goto(handoffLink);
   const response=await firstRead;assert.equal(response.status(),200);
   const wire=JSON.parse(await response.text());assert.equal(wire.ok,true);
   const projected=await verifiedOwnAnnulPreparation(wire.data,{scopeVersion:projection.scopeVersion,sourceId});
   assertSameOwnAnnulPreparation(projection,projected);
   check(projected.affected.length===projection.affected.length&&projected.runs.length===projection.runs.length,'receiver reads every affected contract of both runs before any date filter');
   await receiverPage.settled();
   assert.equal(purposeCount(),1);assert.deepEqual(purposeReads[0].query,[['resource','detail'],['id',sourceId]]);
   const options=await receiverPage.options();
   assert.deepEqual(options,[['','Elegí el grupo de fecha'],...expectedGroups.map(group=>[group.liquidationDate??'legacy',ownRunDateLabel(group.liquidationDate)+' · '+group.count+' legajos'])]);
   check(await receiverPage.$('projected-date').inputValue()===''&&await receiverPage.$('projected-use').isDisabled(),'both date groups are offered after a placeholder and none is selected automatically');
   assert.ok((await receiverPage.$('projected-description').innerText()).includes(projection.affected.length+' legajos verificados en '+expectedGroups.length+' grupos'));
   check((await receiverPage.chips()).length===0&&!await receiverPage.$('confirm').isChecked()&&await receiverPage.$('date').inputValue()===''&&await receiverPage.$('kind').inputValue()==='','consulting the projection changes no draft field');
   check(await receiverPage.$('login').isHidden()&&await receiverPage.$('send').isDisabled(),'receiver session is its own and calculation stays unavailable');
   // 4. One explicit date group becomes an exact unconfirmed draft.
   await receiverPage.$('projected-date').selectOption(fixture.draftDate);await receiverPage.$('projected-use').click();await receiverPage.settled();
   assert.equal(purposeCount(),2);assert.equal(purposeReads[1].status,200);
   const draftChips=await receiverPage.chips();
   assert.deepEqual(sorted(draftChips.map(text=>text.replace(/^Legajo /,'').replace(/ · .*$/,''))),draftNumbers);
   assert.ok(draftChips.every(text=>text.endsWith(' · Nombre no informado')));
   assert.equal(await receiverPage.$('period').inputValue(),projection.period);assert.equal(await receiverPage.$('date').inputValue(),fixture.draftDate);
   assert.equal(await receiverPage.$('type').inputValue(),projection.liquidationType);assert.ok(Object.hasOwn(OWN_RUN_TYPES,projection.liquidationType));assert.equal(await receiverPage.$('kind').inputValue(),'contracts');
   assert.ok((await receiverPage.$('status').innerText()).includes('Se prepararon los '+draftNumbers.length+' legajos exactos de la anulación'));
   check(!await receiverPage.$('confirm').isChecked()&&await receiverPage.$('send').isDisabled()&&await receiverPage.$('projected-preparation').isHidden(),'chosen group is an exact unconfirmed draft and the reference is consumed');
   check(pagePosts.length===0&&calculationPosts===0&&mutations===0,'opening, consulting and applying the draft send no command and create no capture');
   assert.deepEqual(readSnapshot(),baseline);
   for(const width of[1366,390,320]){
    await receiverPage.page.setViewportSize({width,height:1100});await receiverPage.$('chips').scrollIntoViewIfNeeded();
    check(await receiverPage.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no whole-page overflow at '+width);
    await receiverPage.page.screenshot({path:path.join(output,'draft-'+width+'.png'),fullPage:true});
   }
   await receiverPage.page.setViewportSize({width:1366,height:1100});
   // 5. Hiding the page retires the nominal draft; nothing is sent to restore it.
   await receiverPage.page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
   check((await receiverPage.chips()).length===0&&!await receiverPage.$('confirm').isChecked(),'hiding the page clears every nominal chip and consent');
   await receiverPage.page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
   await receiverPage.settled();
   check(pagePosts.length===0&&calculationPosts===0,'returning to the page sends nothing');
   // 6. Withdrawing prepare while the verified projection is on screen retires
   //    it, keeps the opaque reference and blocks any reload without prepare.
   const beforeWithdrawal=purposeCount();
   await receiverPage.page.goto(handoffLink);await receiverPage.$('projected-preparation').waitFor({state:'visible'});await receiverPage.settled();
   assert.equal(purposeCount(),beforeWithdrawal+1);assert.equal((await receiverPage.options()).length,expectedGroups.length+1);
   withdrawn=true;
   await receiverPage.page.evaluate(next=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:next}})),receiverCaps.filter(cap=>cap!=='payroll.calculation.prepare'));
   check((await receiverPage.options()).length===1&&(await receiverPage.chips()).length===0&&!await receiverPage.$('confirm').isChecked()&&!await receiverPage.$('projected-preparation').isHidden()&&(await receiverPage.$('status').innerText()).includes('Se retiraron los datos por un cambio de permisos'),'capability withdrawal retires the verified projection and keeps only the reference');
   await receiverPage.$('refresh').click();await receiverPage.settled();
   check((await receiverPage.options()).length===1&&await receiverPage.$('projected-load').isDisabled()&&purposeCount()===beforeWithdrawal+1,'without prepare the real session cannot reload the projection');
   withdrawn=false;
   // 7. Another session behind the same cookie is refused and clears rows.
   await receiverPage.page.goto(handoffLink);await receiverPage.$('projected-preparation').waitFor({state:'visible'});await receiverPage.settled();
   await receiverPage.$('projected-date').selectOption(fixture.draftDate);await receiverPage.$('projected-use').click();await receiverPage.settled();
   assert.equal((await receiverPage.chips()).length,draftNumbers.length);
   receiverSessionSuffix='-qa-other-session';
   await receiverPage.$('refresh').click();await receiverPage.settled();
   check((await receiverPage.chips()).length===0&&(await receiverPage.$('status').innerText()).includes('Cambió la sesión'),'a changed session clears the nominal draft instead of carrying it over');
   receiverSessionSuffix='';
   check(pagePosts.length===0&&calculationPosts===0&&mutations===0,'no phase of the handoff sent a command or created a capture');
   assert.deepEqual(readSnapshot(),baseline);
   await receiverPage.browserContext.close();
   result={version:'own-annul-preparation209-live190-native-browser.v1',phase,passed:true,sourceCommit:h.sourceCommit,major:h.major,sourceIdJsonSha256:sha(sourceId),
    affected:projection.affected.length,projectedRuns:projection.runs.length,dateGroups:expectedGroups,draftDate:fixture.draftDate,draftCount:draftNumbers.length,
    checks,httpEvidence,sourceBookend,purposeReads,loginTargets:loginTargets.length,pagePosts:pagePosts.length,calculationPosts,mutations,
    reportFingerprintAlgorithm:'SHA256 of UTF8 JSON.stringify; distinct from canonical DTO and SQL digests',
    actualSql:true,actualHttp:true,actualBrowser:true,receiptToPreparationBrowserProven:true,crossRoleHandoffProven:true,loginKeepsReference:true,checkerForbiddenHttp:true,
    authenticationFixture:true,completeAuthenticationHandler:false,sourceMode:'public_build_with_twelve_handoff_modules_byte_checked',fullBuildValidation:false,
    pending:['separate29/2 scope','monthly business cases','actual login page'],synthetic:true,productionWrites:0,paymentExecuted:false,municipalAcceptance:false};
  }
  for(const browserContext of contexts)await browserContext.close().catch(()=>{});
  assert.deepEqual(pageErrors,[]);assert.deepEqual(serverErrors,[]);assert.deepEqual(external,[]);
 }catch(error){
  failure=error;
  fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({passed:false,phase,sourceCommit:h.sourceCommit,major:h.major,message:error.message,checks,purposeReads,pagePosts:pagePosts.length,calculationPosts,mutations,pageErrors,serverErrors,external,actualHttpStarted:!!server,synthetic:true},null,2)+'\n',{flag:'wx'});
 }finally{
  const cleanupErrors=[];
  for(const close of[()=>browser?.close(),async()=>{if(server){server.closeAllConnections();await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}}]){try{await close();}catch(error){cleanupErrors.push(error);}}
  if(!failure&&cleanupErrors.length)failure=cleanupErrors[0];
 }
 if(failure)throw failure;
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 return Object.freeze(result);
}
