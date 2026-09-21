/** Actual compiled UI. Every private API and POST is synthetic and intercepted. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {unzipSync,strFromU8} from 'fflate';
import {publishedBuildVerification} from './lib/published-build-verification.mjs';
import {fixedFixture,fixedUuid,fixedSubject,fixedValues,fixedApprovedRecord,fixedPayrollTypes} from '../tests/fixtures/payroll-fixed-novelties-synthetic.js';
import '../assets/app-routes.js';

const live=process.env.FIXED_NOVELTIES_PUBLISHED_ORIGIN;
if(live!==undefined)assert.equal(live,'https://municipio-junin-friendly.vercel.app');
const origin=live || 'https://municontrol.test',base=path.resolve('public'),out=path.resolve('verification/fixed-novelties-browser'+(live?'-published':''));
const build=publishedBuildVerification({origin,root:base,release:process.env.GITHUB_SHA || 'manual'});
fs.mkdirSync(out,{recursive:true});
const fixture=fixedFixture(),{state}=fixture,checks=[],errors=[],posts=[],publishedAssets=new Set(),failedAssets=[];
let dropAck=false,failNext=null,hideAttempt=false,denyResource=null,changeOnExport=false,holdAck=null;
const envelope=data=>({ok:true,data});
const browser=await chromium.launch({headless:true,...(process.env.FIXED_NOVELTIES_BROWSER_CHANNEL?{channel:process.env.FIXED_NOVELTIES_BROWSER_CHANNEL}:{})});
let page;
try{
  const context=await browser.newContext({viewport:{width:1440,height:1050},locale:'es-AR',acceptDownloads:true,serviceWorkers:'block'});
  await context.route('**/*',async route=>{
    const request=route.request(),u=new URL(request.url());
    if(u.origin!==origin)return route.abort();
    if(!u.pathname.startsWith('/api/')){
      if(request.method()!=='GET')return route.abort();
      const known=globalThis.MuniControlRoutes.resolve(u.href,origin),relative=known?.file || u.pathname.slice(1),file=path.resolve(base,relative);
      if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
      const expected=fs.readFileSync(file);let body=expected;
      if(live){
        try{const response=await build.fetchFile(relative,20000);assert.equal(response.status,200);body=Buffer.from(await response.arrayBuffer());assert.ok(body.equals(expected),'PUBLISHED_BYTES_MISMATCH:'+relative);publishedAssets.add(relative);}
        catch(error){failedAssets.push({file:relative,error:error.message});return route.abort();}
      }
      return route.fulfill({status:200,contentType:file.endsWith('.js')||file.endsWith('.mjs')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':file.endsWith('.json')?'application/json':'application/octet-stream',body});
    }
    if(u.pathname==='/api/internal-payroll-fixed-novelties'){
      const resource=u.searchParams.get('resource') || 'bootstrap';
      if(state.denied||resource===denyResource)return route.fulfill({status:403,json:{ok:false,code:'PAYROLL_FIXED_CAPABILITY_REQUIRED',error:'Acceso revocado sintético'}});
      if(request.method()==='POST'){
        const body=request.postDataJSON(),key=request.headers()['idempotency-key'];posts.push({body:structuredClone(body),key});
        if(failNext){const failure=failNext;failNext=null;return route.fulfill({status:failure.status,json:{ok:false,code:failure.code,error:'Conflicto sintético controlado'}});}
        const result=fixture.mutate(body.command,body.payload,key);
        if(holdAck){const wait=holdAck;holdAck=null;await wait;}
        if(dropAck&&result.data){dropAck=false;return route.abort('timedout');}
        return route.fulfill({status:result.status,json:result.data?envelope(result.data):{ok:false,code:result.code,error:'Error sintético controlado'}});
      }
      const month=u.searchParams.get('periodMonth');let data;
      if(resource==='bootstrap')data=fixture.bootstrap();
      else if(resource==='employee')data={version:'payroll-fixed-employee.v1',subject:fixedSubject(u.searchParams.get('legajo'))};
      else if(resource==='list')data=fixture.list(month);
      else if(resource==='detail')data=fixture.detail(u.searchParams.get('recordId'));
      else if(resource==='attempt')data=hideAttempt?null:state.attempts.get(state.role+':'+u.searchParams.get('command')+':'+u.searchParams.get('key'))?.receipt;
      else if(resource==='export'){
        if(changeOnExport){state.epoch++;changeOnExport=false;}
        if(u.searchParams.get('snapshotToken')!==fixture.token(month))return route.fulfill({status:409,json:{ok:false,code:'PAYROLL_FIXED_SNAPSHOT_CHANGED',error:'La consulta cambió'}});
        data=fixture.exporter(month);
      }
      else throw Error('Unexpected fixed API resource:'+resource);
      return route.fulfill({status:data?200:404,json:data?envelope(data):{ok:false,code:'PAYROLL_FIXED_NOT_FOUND',error:'No se encontró el intento sintético'}});
    }
    if(u.pathname==='/api/internal-payroll-novelties')return route.fulfill({status:200,json:{ok:true,principal:{email:state.role+'@example.invalid',...fixture.principal(),capabilities:fixture.cap().filter(cap=>cap.startsWith('payroll.novelty.'))},limits:{contractVersion:'payroll-novelty-batch.v1',approvalEffect:'export_only',grhMutation:false,payrollCalculated:false,payrollPosted:false,maxRows:500,payrollTypes:fixedPayrollTypes},batches:[]}});
    if(u.pathname==='/api/internal-auth')return route.fulfill({status:200,json:{ok:true,authenticated:true,user:{email:state.role+'@example.invalid',name:'OPERADOR SINTÉTICO',role:'ADMIN_INTERNO'},access:{tenantCapabilities:['payroll.read',...fixture.cap()],platformCapabilities:[],platformRoles:[]}}});
    return route.fulfill({status:200,json:{ok:true,data:[]}});
  });
  page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
  const host=page.locator('[data-fixed-host]'),field=name=>host.locator(`[data-fn-field="${name}"]`);
  const refresh=async()=>{await host.locator('[data-fn-refresh]').click();await host.locator('[data-fn-refresh]:enabled').waitFor();};
  const openRecord=async id=>{await host.locator(`[data-fn-record="${id}"] [data-fn-open]`).click();await host.locator('[data-fn-history]').waitFor();};
  const fill=async(legajo='1001')=>{
    await host.locator('[data-fn-new]').click();await field('legajo').fill(legajo);await host.locator('[data-fn-lookup]').click();await host.locator('[data-fn-subject]').filter({hasText:'AGENTE SINTÉTICO '+legajo}).waitFor();
    await field('conceptSourceId').fill('80');await field('payrollType').selectOption('monthly');await field('quantityDecimal').fill('1');await field('validFrom').fill('2026-09-15');await field('validTo').fill('2026-12-31');await field('legalInstrument').fill('Acto administrativo sintético QA');await field('reason').fill('Alta revisable de responsabilidad QA');
  };
  const save=async()=>{await host.locator('[data-fn-preview]').click();await host.locator('[data-fn-save]:enabled').waitFor();await host.locator('[data-fn-save]').click();await host.locator('[data-fn-refresh]:enabled').waitFor();};
  const role=async name=>{state.role=name;await refresh();await refresh();};
  const review=async(id,decision='approve')=>{await openRecord(id);await host.locator(`[data-fn-${decision}]`).click();await host.locator('[data-fn-decision-reason]').fill('Revisión independiente de evidencia sintética');await host.locator('[data-fn-decision-save]').click();await host.locator('[data-fn-refresh]:enabled').waitFor();};
  await page.goto(origin+'/novedades-nomina.html');await page.locator('#fixedNovelties > summary').click();await host.locator('[data-fn-new]:enabled').waitFor();
  assert.equal(posts.length,0);assert.equal(state.records.length,0);checks.push('actual monthly workbench exposes a lazy fixed-novelty workspace without writing or inventing employees');
  await fill();assert.equal(await field('amountArs').inputValue(),'');assert.equal(await field('forced').isChecked(),false);checks.push('exact employee lookup pins contract identity; amount absent and force disabled remain explicit');
  await save();await host.locator('[data-fn-record]').first().waitFor();assert.equal(state.records.length,1);
  const id=state.records[0].id;assert.equal(posts[0].body.payload.values.amountCents,null);assert.equal(posts[0].body.payload.values.validFrom,'2026-09-15');assert.equal(posts[0].body.payload.values.validTo,'2026-12-31');assert.equal(state.records[0].approved,null);checks.push('proposal preserves entered dates and null amount and creates no approved payroll or monthly lot');
  await openRecord(id);assert.equal(await host.locator('[data-fn-approve]:visible').count(),0);checks.push('preparer cannot approve the same proposal in the published user flow');
  await role('reviewer');await review(id);assert.equal(state.records[0].approved?.review?.decision,'approve');checks.push('independent review keeps proposer and reviewer in immutable history');
  await role('preparer');await openRecord(id);await host.locator('[data-fn-correct]').click();await field('quantityDecimal').fill('2');await field('reason').fill('Corrección documentada de cantidad QA');await save();
  await host.locator('[data-fn-record]').first().waitFor();assert.equal(state.records[0].approved.values.quantityDecimal,'1');assert.equal(state.records[0].pending.values.quantityDecimal,'2');checks.push('pending correction leaves the approved version unchanged');
  await role('reviewer');await review(id,'reject');assert.equal(state.records[0].approved.values.quantityDecimal,'1');assert.equal(state.records[0].pending,null);assert.equal(state.records[0].latest.review.decision,'reject');checks.push('rejection preserves original approved values and recorded correction history');
  await role('preparer');await openRecord(id);await host.locator('[data-fn-correct]').click();await field('quantityDecimal').fill('2');await field('reason').fill('Propuesta local que conserva su contenido');
  const current=state.records.find(r=>r.id===id),external={recordId:id,expectedVersion:current.version,contractId:current.subject.contractId,legajo:current.subject.legajo,identityToken:current.subject.identityToken,operation:'set',values:fixedValues({quantityDecimal:'3'}),reason:'Corrección externa sintética autorizada'};
  fixture.mutate('propose',external,fixedUuid(81001));state.role='reviewer';fixture.mutate('review',{recordId:id,proposalId:current.pending.id,expectedVersion:current.version,decision:'approve',reason:'Revisión externa sintética autorizada'},fixedUuid(81002));state.role='preparer';
  await save();assert.equal(await field('quantityDecimal').inputValue(),'2');assert.equal(current.pending,null);await refresh();await host.locator('[data-fn-confirm-version]').click();assert.equal(await field('quantityDecimal').inputValue(),'2');await save();assert.equal(current.pending.values.quantityDecimal,'2');assert.equal(current.approved.values.quantityDecimal,'3');checks.push('concurrent approval rejects a stale version and requires explicit comparison while preserving the local proposal');
  await role('reviewer');await review(id,'reject');await role('preparer');await openRecord(id);await host.locator('[data-fn-annul]').click();await field('reason').fill('Anulación administrativa de ensayo revisable');await save();assert.equal(current.pending.operation,'annul');assert.equal(current.approved.operation,'set');checks.push('proposed annulment leaves the approved values active until an independent decision');
  await role('reviewer');await review(id);assert.equal(current.approved.operation,'annul');assert.equal(current.approved.values,null);assert.ok(state.histories.get(id).length>=5);checks.push('approved administrative annulment retains every original proposal and decision without payroll reversal');
  await role('preparer');state.employmentLinked=false;await refresh();assert.equal(await host.locator('[data-fn-new]:visible:enabled').count(),0);assert.match(await host.innerText(),/vínculo laboral/);state.employmentLinked=true;await refresh();checks.push('an operator without verified employment identity can consult but cannot propose or review');
  await role('preparer');await fill('1002');dropAck=true;hideAttempt=true;await save();await host.locator('[data-fn-retry]').waitFor();
  const uncertain=posts.at(-1);assert.equal(state.records.length,2);assert.equal(await field('quantityDecimal').isDisabled(),true);checks.push('lost acknowledgement locks the exact submitted draft and idempotency key');
  await refresh();await host.locator('[data-fn-retry]').waitFor();assert.equal(await field('quantityDecimal').isDisabled(),true);hideAttempt=false;
  await refresh();await host.locator('[data-fn-record]').first().waitFor();assert.equal(state.records.length,2);
  for(const attempt of posts.filter(p=>p.key===uncertain.key))assert.deepEqual(attempt.body,uncertain.body);
  checks.push('an unconfirmed attempt never permits editing or a new key; receipt recovery cannot duplicate the proposal');
  await fill('1003');dropAck=true;await save();await host.locator('[data-fn-retry]').waitFor();const retried=posts.at(-1),beforeRetry=state.records.length;await host.locator('[data-fn-retry]').click();await host.locator('[data-fn-refresh]:enabled').waitFor();assert.equal(state.records.length,beforeRetry);assert.equal(posts.at(-1).key,retried.key);assert.deepEqual(posts.at(-1).body,retried.body);checks.push('explicit retry after a lost acknowledgement sends exactly the same body and key');
  await fill('1004');let releaseAck;holdAck=new Promise(resolve=>{releaseAck=resolve;});await host.locator('[data-fn-preview]').click();await host.locator('[data-fn-save]').click();await page.locator('#fixedNovelties > summary').click();releaseAck();await page.waitForTimeout(120);await page.locator('#fixedNovelties > summary').click();
  if(await host.locator('[data-fn-retry]:visible').count()){
    failNext={status:403,code:'PAYROLL_FIXED_CAPABILITY_REQUIRED'};await host.locator('[data-fn-retry]').click();await host.locator('[data-fn-refresh]:enabled').waitFor();assert.equal(await host.locator('[data-fn-cancel]').isDisabled(),true);assert.equal(await field('quantityDecimal').isDisabled(),true);await refresh();
  }
  await host.locator('[data-fn-record]').first().waitFor();assert.equal(state.records.filter(r=>r.subject.legajo==='1004').length,1);checks.push('closing during a POST cannot turn an ignored acknowledgement into permission for a new payload or duplicate');
  await role('reader');assert.equal(await host.locator('[data-fn-new]:visible:enabled').count(),0);assert.equal(await host.locator('[data-fn-csv]:visible:enabled').count(),0);checks.push('read-only operator sees records without prepare, review or export controls');
  await role('preparer');await openRecord(id);denyResource='detail';await host.locator('[data-fn-refresh]').click();await page.waitForTimeout(150);denyResource=null;
  state.denied=true;await host.locator('[data-fn-refresh]').click();await page.waitForTimeout(150);assert.doesNotMatch(await host.innerText(),/AGENTE SINTÉTICO|Acto administrativo sintético|preparer@example\.invalid/);checks.push('revoked read authority removes consulted names, values and historical actors from the DOM');
  state.denied=false;await refresh();state.records=Array.from({length:61},(_,i)=>fixedApprovedRecord(i,{amountCents:i===0?'0':null,legalInstrument:i===60?'=QA fórmula prohibida':'Acto administrativo sintético QA'}));for(const row of state.records)state.histories.set(row.id,[row.latest]);
  await refresh();await host.locator('[data-fn-period]').fill('2026-09');await host.locator('[data-fn-period]').dispatchEvent('change');await refresh();
  await host.locator('[data-fn-search]').fill('1061');await host.locator('[data-fn-record]').first().waitFor();assert.equal(await host.locator('[data-fn-record]:visible').count(),1);checks.push('search includes records outside the first page without changing the source list');
  await host.locator('[data-fn-search]').fill('');
  const excelEvent=page.waitForEvent('download');await host.locator('[data-fn-xlsx]').click();const excel=await excelEvent,excelPath=path.join(out,'fixed-novelties-synthetic.xlsx');await excel.saveAs(excelPath);
  const workbook=unzipSync(fs.readFileSync(excelPath)),sheets=Object.entries(workbook).filter(([name])=>/^xl\/worksheets\/sheet\d+\.xml$/.test(name)).map(([,bytes])=>strFromU8(bytes));
  assert.ok(sheets.some(s=>s.includes('1061')));assert.ok(sheets.every(s=>!/<f[ >]/.test(s)));checks.push('complete Excel contains all approved control rows including the last page and no executable formulas');
  assert.ok(sheets.some(s=>s.includes('Vigencia parcial')));assert.match(sheets[0],/<c r="I2"[^>]*><is><t[^>]*>0<\/t>/);assert.match(sheets[0],/<c r="I3"[^>]*><is><t[^>]*>Sin informar<\/t>/);checks.push('control workbook distinguishes partial civil-date coverage, explicit zero and unknown amounts without prorating');
  const csvEvent=page.waitForEvent('download');await host.locator('[data-fn-csv]').click();const csv=await csvEvent,csvPath=path.join(out,'fixed-novelties-synthetic.csv');await csv.saveAs(csvPath);const csvText=fs.readFileSync(csvPath,'utf8');assert.ok(csvText.includes('1061'));assert.ok(csvText.includes("'=QA fórmula prohibida"));checks.push('CSV protects formula-like references and exports the complete approved control scope');
  changeOnExport=true;let staleDownloads=0;const track=()=>staleDownloads++;page.on('download',track);await host.locator('[data-fn-xlsx]').click();await page.waitForTimeout(200);page.off('download',track);assert.equal(staleDownloads,0);checks.push('server snapshot change blocks stale export and requires a fresh consultation');
  await refresh();
  for(const width of [1440,390,320]){await page.setViewportSize({width,height:width===1440?1050:844});await page.emulateMedia({reducedMotion:'reduce'});await page.addStyleTag({content:'body:after{content:"QA · DATOS SINTÉTICOS";position:fixed;bottom:5px;right:5px;z-index:99999;background:#123649;color:white;padding:6px;font:11px sans-serif}'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await host.screenshot({path:path.join(out,'fixed-list-'+width+'-qa.png')});}
  checks.push('desktop and 390/320px mobile keep the real list and primary controls inside the viewport');
  await page.setViewportSize({width:390,height:844});await fill('2001');await host.locator('[data-fn-editor]').screenshot({path:path.join(out,'fixed-editor-390-qa.png')});
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));assert.doesNotMatch(await host.innerText(),/AGENTE SINTÉTICO 2001/);checks.push('pagehide clears private in-memory subject and form state without persistent browser storage');
  assert.deepEqual(failedAssets,[]);assert.deepEqual(errors,[]);
  const result={commit:process.env.GITHUB_SHA || 'manual',checkedAt:new Date().toISOString(),mode:live?'published_assets_with_synthetic_api':'local_build_with_synthetic_api',checksPassed:checks.length,checks,errors,publishedAssetsMatch:live?true:null,publishedAssets:[...publishedAssets].sort(),syntheticDataOnly:true,realMunicipalSessionTested:false,backendWrites:false};
  fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({checksPassed:checks.length,errors,mode:result.mode,publishedAssetsMatch:result.publishedAssetsMatch}));
}catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({checksPassed:checks.length,checks,failedAssets,errors,error:String(error.stack)},null,2));if(page)await page.screenshot({path:path.join(out,'failure-qa.png'),fullPage:true}).catch(()=>{});throw error;}finally{await browser.close();}
