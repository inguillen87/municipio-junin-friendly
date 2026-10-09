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
  report={passed:true,checks,serverMajor:major,productUiVerified:true,builtPackage:!!args.built,synthetic:true,committed:true,realHttpAndSql:true,actualProgramAndMonthlySources:true,authenticationGatewayFixture:true,directoryProjectionFixture:true,historicalDashboardUnavailableFixture:true,runtime:args.browser,posts,stored,immutableReplayBodySha256:ownRunHash(lost.body),municipalApprovalVerified:false,productiveInstallation:false,paymentExecuted:false};
}catch(e){report={passed:false,checks,message:e.message,sqlDiagnostics,synthetic:true,productiveInstallation:false};if(testPage){report.browserDiagnostic=await testPage.evaluate(()=>{const link=document.querySelector('[data-own-login]');return {url:location.pathname+location.hash,status:document.querySelector('[data-own-status]')?.textContent,loginHidden:link?.hidden,loginMarkup:link?.outerHTML,loginStyle:link?getComputedStyle(link).display:null,busy:document.querySelector('.own-run')?.getAttribute('aria-busy'),documentHidden:document.hidden};}).catch(()=>null);await testPage.screenshot({path:prefix+'-failure.png',fullPage:true}).catch(()=>{});}process.exitCode=1;}
finally{
  held?.();await browser?.close();if(server)await new Promise(r=>server.close(r));
  if(installed){try{await db.run('DROP SCHEMA '+qa.schema+' CASCADE');const state=await db.run("SELECT jsonb_build_object('removed',to_regnamespace("+q(qa.schema)+") IS NULL)");assert.equal(state.removed,true);report.syntheticSchemaRemoved=true;}catch(e){report.cleanupError=e.message;process.exitCode=1;}}
  fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
