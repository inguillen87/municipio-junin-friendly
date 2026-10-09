// Real product page + real HTTP handlers + committed isolated PostgreSQL.
// Auth gateway, directory projection and historical dashboard response are QA fixtures.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {chromium} from 'playwright';
import {buildOwnPayrollDurableQa,qaLiteral as q} from './lib/own-payroll-durable-qa.mjs';
import {createOwnPayrollPsqlQa} from './lib/own-payroll-psql-qa.mjs';
import {createOwnRunHandler} from '../api/internal-own-payroll-run.js';
import {createEmploymentCatalogHandler} from '../api/internal-employment-catalog.js';
import {RUN_CALCULATE,ownRunHash} from '../lib/internal-own-payroll-run.js';
const root=path.resolve(import.meta.dirname,'..'),execute=promisify(execFile),args={};
for(const arg of process.argv.slice(2)){if(arg==='--ci'||arg==='--built'){args[arg.slice(2)]=true;continue;}const m=/^--(major|psql|output|browser)=(.+)$/.exec(arg);assert.ok(m);assert.equal(args[m[1]],undefined);args[m[1]]=m[2];}
assert.equal(args.ci,true);const major=Number(args.major);assert.ok([17,18].includes(major));assert.ok(['chrome','chromium','msedge'].includes(args.browser));
const pageRoot=args.built?path.join(root,'public'):root;
const output=path.resolve(args.output);assert.ok(output.startsWith(path.join(root,'verification')+path.sep)&&!fs.existsSync(output));
const prefix=output.replace(/\.json$/,''),qa=buildOwnPayrollDurableQa(major,{declaredDate:true}),executable=args.psql??'psql';
const db=createOwnPayrollPsqlQa({executable,major,port:55400+major,schema:qa.schema,pins:qa.pins});
const seed=prefix+'-seed.sql';assert.ok(!fs.existsSync(seed));fs.writeFileSync(seed,qa.sql,{flag:'wx'});
let installed=false,server,browser,testPage,held=null,delay=false,lose=false,denyAuth=false,expireAuth=false,otherSession=false,checks=0,posts=0;
const writes=[],sqlDiagnostics=[],check=(value,label)=>{assert.ok(value,label);checks++;};
let report;
try{
  const seeded=await execute(executable,[...db.args,'-f',seed],{timeout:90000,maxBuffer:4*1024*1024,windowsHide:true});installed=true;fs.writeFileSync(prefix+'-seed.log',seeded.stdout+seeded.stderr);
  const sources=await db.run("SELECT jsonb_build_object('contractId',(SELECT contract_id FROM native_employee_registration),'period',greatest('2026-10',to_char(clock_timestamp() AT TIME ZONE 'America/Argentina/Mendoza','YYYY-MM')))");
  const actor=qa.actors.maker,principal={user:{email:actor.actorEmail},tenant:{source:'membership',id:actor.tenantId,membershipId:actor.membershipId,effectiveCapabilities:[...RUN_CALCULATE,'payroll.read']}},session={email:actor.actorEmail,id:actor.actorSessionId,version:actor.actorSessionVersion,releaseSha:actor.releaseSha},env={};
  const deps={env,requireAccess:async()=>({mode:'managed',principal}),sessionFor:()=>session,getSql:async()=>({query:async(query,values)=>{
    try{
      if(query.includes('own_run_capture_v1'))writes.push({key:values[2],body:JSON.parse(values[1])});
      const rows=await db.query(query,values);
      if(lose&&query.includes('own_run_complete_v1')){lose=false;throw Error('QA_LOST_RESULT_ACK_AFTER_COMMIT');}
      return rows;
    }catch(e){sqlDiagnostics.push({message:e.message});throw e;}
  }})};
  const runHandler=createOwnRunHandler(deps);
  const catalogHandler=createEmploymentCatalogHandler({...deps,getSql:async()=>({query:async(query,values)=>{
    assert.equal(query,'SELECT public.native_employment_catalog_bootstrap_v1($1::jsonb) AS result');
    return [{result:await db.run(query.replace('public.native_employment_catalog_',qa.schema+'.native_employment_catalog_').replace('$1',q(values[0])),true)}];
  }})});
  server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://local.invalid');res.setHeader('Cache-Control','no-store');
    const json=(status,value)=>res.writeHead(status,{'Content-Type':'application/json'}).end(JSON.stringify(value));
    if(req.method==='GET'&&url.pathname==='/api/internal-auth'){
      if(denyAuth){json(401,{ok:false});return;}
      json(200,{ok:true,authenticated:true,sessionVersion:2,user:{id:otherSession?qa.ids.checker:actor.actorSessionId,email:actor.actorEmail},access:{context:'tenant',tenant:{id:actor.tenantId,roleKey:'QA'},tenantCapabilities:principal.tenant.effectiveCapabilities,platformCapabilities:[],platformRoles:[]},expiresAt:new Date(Date.now()+(expireAuth?-3600000:3600000)).toISOString()});return;
    }
    if(req.method==='GET'&&url.pathname==='/api/internal-data'){
      if(url.searchParams.get('resource')==='employees'){
        const page=Number(url.searchParams.get('page')),rows=page===1?[{contractId:sources.contractId,legajo:'19041',nombre:'Corrida propia QA',sector:'20',convenio:'1',activo:true,statusSnapshotDate:null,recordOrigin:'MUNICONTROL'}]:[];
        json(200,{ok:true,version:'employee-picker.v1',data:rows,pagination:{page,limit:20,total:1,pages:1},scope:{status:'administrative_active',payrollEligibilityCertified:false,sourceCutoffFrom:null,sourceCutoffTo:null}});return;
      }
      json(503,{ok:false,error:'Synthetic historical dashboard unavailable'});return;
    }
    if(url.pathname==='/api/internal-own-payroll-run'||url.pathname==='/api/internal-employment-catalog'){
      req.query=Object.fromEntries(url.searchParams);res.status=n=>{res.statusCode=n;return res;};
      res.json=value=>{res.setHeader('Content-Type','application/json');if(delay&&req.method==='GET'&&url.searchParams.get('resource')==='attempt'){delay=false;held=()=>{if(!res.destroyed)res.end(JSON.stringify(value));};}else res.end(JSON.stringify(value));return res;};
      if(req.method==='POST')posts++;
      (url.pathname==='/api/internal-own-payroll-run'?runHandler:catalogHandler)(req,res).catch(e=>json(500,{ok:false,error:e.message}));return;
    }
    if(req.method!=='GET'){json(405,{ok:false});return;}
    let file=url.pathname==='/nomina-control.html'?path.join(pageRoot,'nomina-control.html'):path.resolve(pageRoot,'.'+decodeURIComponent(url.pathname));
    if(!(url.pathname==='/nomina-control.html'||file.startsWith(path.join(pageRoot,'assets')+path.sep)&&/\.(?:js|css|png|svg|webp)$/.test(file))||!fs.existsSync(file)){res.writeHead(404).end();return;}
    const mime=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'image/svg+xml';
    res.writeHead(200,{'Content-Type':mime}).end(fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;env.INTERNAL_APP_ORIGIN=origin;
  browser=await chromium.launch({headless:true,...(args.browser==='chromium'?{}:{channel:args.browser})});
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage(),errors=[];
  testPage=page;
  page.on('pageerror',e=>errors.push(e.message));
  const scope=page.locator('.own-run'),select=key=>page.locator('[data-own-'+key+']');
  const settled=()=>page.waitForFunction(()=>document.querySelector('.own-run')?.getAttribute('aria-busy')==='false'&&!document.querySelector('[data-own-fields]').disabled,{},{timeout:20000});
  await page.goto(origin+'/nomina-control.html#calculo');await settled();
  check(posts===0,'opening actual product page never executes payroll');
  check(await scope.locator('h2').innerText()==='Calcular nómina','product tab opens own calculation');
  async function prepare(kind){await select('period').fill(sources.period);await select('period-end').click();await select('type').selectOption('monthly');await select('kind').selectOption(kind);}
  async function calculate(){await select('confirm').check();await select('send').click();await select('result').waitFor({state:'visible',timeout:20000});await page.waitForFunction(()=>document.querySelector('.own-run').getAttribute('aria-busy')==='false');}
  await prepare('all');await calculate();
  check((await select('rows').locator('tr').count())===6,'actual saved CPU result renders all concepts');
  check((await select('totals').innerText()).includes('19041'),'totals use actual own employee reference');
  const zeroReviewPosts=posts;await select('source-review-button').click();await select('source-report').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('.own-run').getAttribute('aria-busy')==='false');
  check((await select('source-summary').innerText()).includes('2 novedades')&&(await select('source-summary').innerText()).includes('0 registros')&&await select('source-rows').locator('tr').count()===0,'complete successful capture reports no source observations without inventing errors');
  const zeroDownloadPromise=page.waitForEvent('download');await select('source-download').click();const zeroCsv=fs.readFileSync(await (await zeroDownloadPromise).path(),'utf8');check(zeroCsv.trim().split('\r\n').length===1&&posts===zeroReviewPosts,'zero-observation CSV contains only its schema and never recalculates');
  await select('search').fill('120');check((await select('rows').locator('tr').count())===1,'result search covers the complete model');
  const downloadPromise=page.waitForEvent('download');await select('download').click();const download=await downloadPromise,downloadPath=await download.path(),csv=fs.readFileSync(downloadPath,'utf8');
  check(csv.trim().split('\r\n').length===7&&csv.includes('19041'),'voluntary CSV contains all six rows despite active filter');
  check(!csv.includes(sources.contractId),'CSV does not expose contract UUID');
  await select('new').click();await settled();await prepare('contracts');await select('picker').click();
  await page.locator('#ownRunPickerSearch').fill('19041');await page.locator('#ownRunPicker [data-picker-form] button').click();
  await page.locator('#ownRunPicker [data-picker-results] input').check();await page.locator('#ownRunPicker [data-picker-apply]').click();
  check(posts===1,'directory selection never executes payroll');await calculate();
  check(writes.at(-1).body.selection.kind==='contracts'&&writes.at(-1).body.selection.values[0]===sources.contractId,'selected legajo is sent as verified own contract');
  await select('new').click();await settled();await prepare('departments');await select('codes').selectOption('20');
  check((await select('codes').locator('option').count())>0,'repartition options come from actual catalog facade');
  lose=true;await select('confirm').check();await select('send').click();await page.waitForFunction(()=>document.querySelector('.own-run').getAttribute('aria-busy')==='false');
  check(!(await select('result').isVisible())&&(await select('recover').isVisible()),'lost committed ack remains uncertain with original attempt');
  const lost=structuredClone(writes.at(-1));await select('period').evaluate(el=>{el.value='2026-11';el.dispatchEvent(new Event('change',{bubbles:true}));});
  await select('send').click();await select('result').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('.own-run').getAttribute('aria-busy')==='false');
  assert.deepEqual(writes.at(-1),lost);checks++;
  check((await select('period').inputValue())===sources.period,'retry renders original persisted period');
  const counts=await db.run("SELECT jsonb_build_object('captures',(SELECT count(*) FROM own_payroll_run_capture),'results',(SELECT count(*) FROM own_payroll_run_result))");
  check(counts.captures===3&&counts.results===3,'four POSTs produce three runs after lost ack replay');
  const beforeHide=posts;
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  check((await select('rows').locator('tr').count())===0&&!(await scope.innerText()).includes('19041'),'visibility change withdraws every nominal view');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
  await select('refresh').click();await page.waitForFunction(()=>document.querySelector('.own-run').getAttribute('aria-busy')==='false');await select('recover').click();await select('result').waitFor({state:'visible'});
  check(posts===beforeHide,'visibility recovery uses GET without recalculating');
  delay=true;await select('recover').click();const deadline=Date.now()+20000;while(!held&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20));assert.ok(held);
  await page.getByRole('tab',{name:'Resumen',exact:true}).click();held();held=null;
  check((await select('rows').locator('tr').count())===0,'late response cannot repopulate a closed task');
  await page.getByRole('tab',{name:'Calcular',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.own-run').getAttribute('aria-busy')==='false');
  await select('recover').click();await select('result').waitFor({state:'visible'});await select('search').fill('');
  await scope.screenshot({path:prefix+'-desktop.png'});
  await page.screenshot({path:prefix+'-desktop-viewport.png'});
  const mobileContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),mobile=await mobileContext.newPage();
  await mobile.goto(origin+'/nomina-control.html#calculo');await mobile.waitForFunction(()=>document.querySelector('.own-run')?.getAttribute('aria-busy')==='false'&&!document.querySelector('[data-own-fields]').disabled);
  check(await mobile.locator('.own-run').evaluate(el=>el.getBoundingClientRect().width<=window.innerWidth),'mobile panel fits viewport');
  await mobile.locator('[data-own-history] button').first().click();await mobile.locator('[data-own-result]').waitFor({state:'visible'});
  check(await mobile.locator('[data-own-rows] tr').count()===6,'mobile recovers complete saved concepts without POST');
  await mobile.locator('.own-run').screenshot({path:prefix+'-mobile.png'});
  await mobile.screenshot({path:prefix+'-mobile-viewport.png'});
  check(posts===beforeHide,'desktop and mobile consultation never add a run');
  expireAuth=true;await select('refresh').click();await page.waitForFunction(()=>document.querySelector('.own-run').getAttribute('aria-busy')==='false');
  check((await select('rows').locator('tr').count())===0&&(await select('download').isDisabled())&&await select('login').isVisible(),'expired HTTP 200 session withdraws nominal data and provides re-entry');
  expireAuth=false;await select('refresh').click();await page.waitForFunction(()=>document.querySelector('.own-run').getAttribute('aria-busy')==='false');await select('recover').click();await select('result').waitFor({state:'visible'});
  await db.run("DELETE FROM capabilities WHERE membership_id="+q(qa.ids.maker)+"::uuid AND capability_key='payroll.calculation.nominal.read'");
  await select('recover').click();await page.waitForFunction(()=>document.querySelector('.own-run').getAttribute('aria-busy')==='false');
  check((await select('rows').locator('tr').count())===0&&(await select('download').isDisabled()),'real SQL revocation withdraws result and download despite stale HTTP fixture');
  otherSession=true;await select('refresh').click();await page.waitForFunction(()=>document.querySelector('.own-run').getAttribute('aria-busy')==='false');
  check((await select('send').isDisabled())&&(await select('status').innerText()).includes('Cambió la sesión'),'another session cannot resend original attempt');
  denyAuth=true;await select('refresh').click();await page.waitForFunction(()=>document.querySelector('.own-run').getAttribute('aria-busy')==='false');
  check(await select('login').isVisible(),'expired session provides safe re-entry path');
  check(errors.length===0,'product page has no unhandled browser errors: '+errors.join(';'));
  const stored=await db.run("SELECT jsonb_build_object('results',(SELECT count(*) FROM own_payroll_run_result),'captures',(SELECT count(*) FROM own_payroll_run_capture),'validFlags',(SELECT bool_and((result->>'payrollPosted')::boolean=false AND (result->>'paymentExecuted')::boolean=false AND (result->>'municipalApprovalVerified')::boolean=false) FROM own_payroll_run_result))");
  check(stored.results===3&&stored.captures===3&&stored.validFlags,'all stored results remain technical and unchanged');
  check(await page.evaluate(()=>![...Object.values(localStorage),...Object.values(sessionStorage)].some(v=>v.includes('19041')||v.includes('own-payroll-result'))),'nominal data are not persisted in browser storage');
  // Independent, synthetic source review after retaining every original check.
  otherSession=false;denyAuth=false;expireAuth=false;
  const actorJson=value=>q(JSON.stringify(value))+'::jsonb';
  await db.run(`DO $review_seed$ DECLARE maker jsonb:=${actorJson(qa.actors.maker)};checker jsonb:=${actorJson(qa.actors.checker)};boot jsonb;body jsonb;receipt jsonb;subject jsonb;definition jsonb;BEGIN
    INSERT INTO capabilities VALUES(${q(qa.ids.maker)}::uuid,'payroll.calculation.nominal.read');
    boot:=own_program_bootstrap_v1(maker);definition:=boot#>'{program,definition}';
    definition:=jsonb_set(definition,'{bindings}',(SELECT jsonb_agg(CASE WHEN b->>'key'='addition' THEN jsonb_set(b,'{combine}','"single"'::jsonb) ELSE b END ORDER BY b->>'key') FROM jsonb_array_elements(definition->'bindings') b));
    body:=jsonb_build_object('command','propose','scopeVersion',boot->>'scopeVersion','baseVersion',boot#>>'{program,version}','salaryVersion',boot#>>'{salaryCatalog,version}','proposalId',NULL,'proposalSha256',NULL,'program',definition,'reason','Synthetic review requires a single declared source','reviewConfirmed',false);
    receipt:=own_program_command_v1(maker,body,gen_random_uuid());boot:=own_program_bootstrap_v1(checker);
    body:=jsonb_build_object('command','approve','scopeVersion',boot->>'scopeVersion','baseVersion',boot#>>'{program,version}','salaryVersion',boot#>>'{salaryCatalog,version}','proposalId',receipt->>'proposalId','proposalSha256',receipt->>'requestSha256','program',NULL,'reason','Independent synthetic source review approval','reviewConfirmed',true);
    PERFORM own_program_command_v1(checker,body,gen_random_uuid());
    subject:=payroll_fixed_registry_employee_by_contract_v1(maker,${q(sources.contractId)}::uuid)->'subject';
    FOR n IN 1..29 LOOP
      receipt:=payroll_novelty_prepare_v2(maker,'individual',${q(sources.period+'-01')}::date,'monthly',jsonb_build_array(jsonb_build_object('rowOrdinal',1,'legajo','19041','contractId',${q(sources.contractId)},'identityToken',subject->>'identityToken','conceptSourceId','120','costCenterSourceId',NULL,'adjustmentMonth',NULL,'quantityDecimal',NULL,'amountCents',(12345+n)::text,'movementType',NULL,'legalInstrument','Synthetic review instrument','observation',NULL,'forced',false)),gen_random_uuid(),repeat('a',64));
      PERFORM payroll_novelty_transition_v2(maker,(receipt#>>'{data,id}')::uuid,'submit',1,'ready_for_review',NULL,gen_random_uuid(),repeat('b',64));
      PERFORM payroll_novelty_transition_v2(checker,(receipt#>>'{data,id}')::uuid,'approve',2,'validated_for_export',NULL,gen_random_uuid(),repeat('b',64));
    END LOOP;
  END $review_seed$; SELECT jsonb_build_object('approved',(SELECT count(*) FROM payroll_novelty_batch WHERE status='approved'))`);
  const reviewContext=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),reviewPage=await reviewContext.newPage();testPage=reviewPage;reviewPage.on('pageerror',e=>errors.push(e.message));
  const rs=k=>reviewPage.locator('[data-own-'+k+']'),idle=()=>reviewPage.waitForFunction(()=>document.querySelector('.own-run')?.getAttribute('aria-busy')==='false');
  await reviewPage.goto(origin+'/nomina-control.html#calculo');await reviewPage.waitForFunction(()=>!document.querySelector('[data-own-fields]').disabled);
  await rs('period').fill(sources.period);await rs('period-end').click();await rs('type').selectOption('monthly');await rs('kind').selectOption('all');await rs('confirm').check();
  const failedResponsePromise=reviewPage.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/internal-own-payroll-run');await rs('send').click();const failedResponse=await failedResponsePromise;await idle();
  const failed=structuredClone(writes.at(-1)),reviewPosts=posts;
  check(failedResponse.status()===422&&(await failedResponse.json()).code==='OWN_RUN_SOURCE_AMBIGUOUS'&&!(await rs('result').isVisible()),'actual adapter rejects repeated unique sources without a fake result');
  await rs('recover').click();await idle();check(await rs('source-review-button').isVisible()&&!(await rs('result').isVisible()),'original persisted capture is recovered without fake result');
  await rs('source-review-button').click();await rs('source-report').waitFor({state:'visible'});await idle();
  check((await rs('source-summary').innerText()).includes('31 novedades')&&(await rs('source-summary').innerText()).includes('31 registros'),'source review inspects all 31 actual approved SQL novelties');
  check(await rs('source-rows').locator('tr').count()===25,'first source review page contains 25 actual records');await rs('source-next').click();check(await rs('source-rows').locator('tr').count()===6,'second page contains every remaining record');
  await rs('source-search').fill('999999999');check(await rs('source-rows').locator('tr').count()===0,'search filters display only');
  const reviewDownload=reviewPage.waitForEvent('download');await rs('source-download').click();const reviewCsv=fs.readFileSync(await (await reviewDownload).path(),'utf8');await idle();
  check(reviewCsv.trim().split('\r\n').length===32&&['19041','12345',sources.contractId,failed.key,'Synthetic review instrument'].every(v=>!reviewCsv.includes(v)),'voluntary CSV includes all pages without legajo, amount, UUID or free text');
  check(posts===reviewPosts,'review, paging, filter and download execute zero calculation POSTs');
  check(await reviewPage.evaluate(()=>document.activeElement.id==='ownSourceReportTitle'),'review restores accessible focus');
  await reviewPage.locator('.own-run').screenshot({path:prefix+'-source-review-desktop.png'});
  for(const width of [390,320]){await reviewPage.setViewportSize({width,height:844});check(await reviewPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'source review has no page overflow at '+width);check(await rs('source-review-button').evaluate(el=>el.getBoundingClientRect().height>=44),'source review controls have accessible targets at '+width);check(await rs('source-rows').locator('tr').first().locator('td').nth(5).evaluate(el=>{const r=el.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth&&getComputedStyle(el).display==='grid';}),'mobile suggested action is readable without horizontal table scroll at '+width);await rs('source-rows').locator('tr').first().scrollIntoViewIfNeeded();await reviewPage.screenshot({path:prefix+'-source-review-mobile-'+width+'-viewport.png'});await reviewPage.locator('.own-run').screenshot({path:prefix+'-source-review-mobile-'+width+'.png'});}
  await reviewPage.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  check(!(await rs('source-report').isVisible())&&await rs('source-rows').locator('tr').count()===0&&!(await reviewPage.locator('.own-run').innerText()).includes('19041'),'hide clears all review data');
  await reviewPage.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});await rs('refresh').click();await idle();await rs('recover').click();await idle();await rs('source-review-button').click();await rs('source-report').waitFor({state:'visible'});await idle();
  delay=true;await rs('source-review-button').click();const reviewDeadline=Date.now()+20000;while(!held&&Date.now()<reviewDeadline)await new Promise(r=>setTimeout(r,20));assert.ok(held);await reviewPage.getByRole('tab',{name:'Resumen',exact:true}).click();held();held=null;
  check(!(await rs('source-report').isVisible())&&await rs('source-rows').locator('tr').count()===0,'late review response cannot repopulate a closed task');
  await reviewPage.getByRole('tab',{name:'Calcular',exact:true}).click();await idle();await rs('recover').click();await idle();await rs('source-review-button').click();await rs('source-report').waitFor({state:'visible'});await idle();
  await db.run("DELETE FROM capabilities WHERE membership_id="+q(qa.ids.maker)+"::uuid AND capability_key='payroll.calculation.nominal.read'");await rs('source-download').click();await idle();
  check(!(await rs('source-report').isVisible())&&await rs('source-rows').locator('tr').count()===0&&await rs('source-download').isDisabled(),'actual SQL revocation clears review and prevents download');
  await db.run("INSERT INTO capabilities VALUES("+q(qa.ids.maker)+"::uuid,'payroll.calculation.nominal.read')");await rs('refresh').click();await idle();await rs('send').click();await idle();assert.deepEqual(writes.at(-1),failed);checks++;
  const reviewStored=await db.run("SELECT jsonb_build_object('captures',(SELECT count(*) FROM own_payroll_run_capture),'results',(SELECT count(*) FROM own_payroll_run_result))");
  check(reviewStored.captures===4&&reviewStored.results===3&&posts===reviewPosts+1,'review preserves exact retry and never creates an extra capture or result');
  check(await reviewPage.evaluate(()=>![...Object.values(localStorage),...Object.values(sessionStorage)].some(v=>v.includes('19041')||v.includes('own-run-source-review'))),'source review is not persisted in browser storage');check(errors.length===0,'source review has no browser errors');
  report={passed:true,checks,serverMajor:major,productUiVerified:true,builtPackage:!!args.built,synthetic:true,committed:true,realHttpAndSql:true,actualProgramAndMonthlySources:true,sourceReviewVerified:true,sourceReviewRecords:31,sourceReviewStored:reviewStored,authenticationGatewayFixture:true,directoryProjectionFixture:true,historicalDashboardUnavailableFixture:true,runtime:args.browser,posts,stored,immutableReplayBodySha256:ownRunHash(lost.body),sourceReviewReplayBodySha256:ownRunHash(failed.body),municipalApprovalVerified:false,productiveInstallation:false,paymentExecuted:false};
}catch(e){report={passed:false,checks,message:e.message,sqlDiagnostics,synthetic:true,productiveInstallation:false};if(testPage){report.browserDiagnostic=await testPage.evaluate(()=>{const link=document.querySelector('[data-own-login]');return {url:location.pathname+location.hash,status:document.querySelector('[data-own-status]')?.textContent,loginHidden:link?.hidden,loginMarkup:link?.outerHTML,loginStyle:link?getComputedStyle(link).display:null,busy:document.querySelector('.own-run')?.getAttribute('aria-busy'),documentHidden:document.hidden};}).catch(()=>null);await testPage.screenshot({path:prefix+'-failure.png',fullPage:true}).catch(()=>{});}process.exitCode=1;}
finally{
  held?.();await browser?.close();if(server)await new Promise(r=>server.close(r));
  if(installed){try{await db.run('DROP SCHEMA '+qa.schema+' CASCADE');const state=await db.run("SELECT jsonb_build_object('removed',to_regnamespace("+q(qa.schema)+") IS NULL)");assert.equal(state.removed,true);report.syntheticSchemaRemoved=true;}catch(e){report.cleanupError=e.message;process.exitCode=1;}}
  fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
