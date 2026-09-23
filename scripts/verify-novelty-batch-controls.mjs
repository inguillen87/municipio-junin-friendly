/** Real workbench and draft parser; all private requests, including POSTs, use synthetic fixtures. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium} from 'playwright';
import {NOVELTY_CSV_HEADER, noveltyBatchControl} from '../assets/payroll-novelty-review.js';
import {publishedBuildVerification} from './lib/published-build-verification.mjs';
const live=process.argv.includes('--published');
const origin=live?'https://municipio-junin-friendly.vercel.app':'https://municontrol.test';
const root=path.resolve('public'),out='verification/novelty-batch-controls-'+(live?'published':'local');
fs.mkdirSync(out,{recursive:true});
const checks=[],errors=[],posts=[],assetFailures=[];
const build=publishedBuildVerification({origin,root,release:process.env.GITHUB_SHA||'batch-controls'});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
// Pin the actual page and its literal dependency closure, not only the review
// widget that can remain unchanged while the bootstrap contract advances.
const expected=new Map(),queue=['novedades-nomina.html'];
while(queue.length){
 const file=queue.shift();if(expected.has(file))continue;
 assert.ok(expected.size<96,'Unexpected page dependency count');
 const bytes=fs.readFileSync(path.join(root,file));expected.set(file,hash(bytes));
 const source=bytes.toString('utf8'),refs=[];
 if(file.endsWith('.html'))for(const tag of source.matchAll(/<(?:script|link|img)\b[^>]*>/gi)){
  const ref=/\b(?:src|href)=["']([^"']+)["']/i.exec(tag[0])?.[1];if(ref)refs.push(ref);
 }
 if(file.endsWith('.js'))for(const match of source.matchAll(/\b(?:import|export)\s+(?:[^;]*?\s+from\s*)?["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']/g))refs.push(match[1]||match[2]);
 if(file.endsWith('.css'))for(const match of source.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)|@import\s+["']([^"']+)["']/g))refs.push(match[1]||match[2]);
 for(const ref of refs){
  if(ref.startsWith('data:')||ref.startsWith('#'))continue;
  const target=new URL(ref,origin+'/'+file);assert.equal(target.origin,origin,'External page dependency');
  const next=decodeURIComponent(target.pathname).slice(1);assert.ok(/^[a-zA-Z0-9_./-]+$/.test(next)&&!next.split('/').includes('..'),'Unsafe dependency');queue.push(next);
 }
}
for(const file of ['assets/payroll-novelty-workbench.js','assets/payroll-native-monthly-model.js','assets/internal-capability-gate.js'])assert.ok(expected.has(file),'Required page dependency missing: '+file);
const publication={comparison:'exact-bytes',assets:Object.fromEntries(expected),attempts:0,matched:!live};
if(live){
 for(let i=0;i<90;i++){
  const failures=[];
  await Promise.all([...expected].map(async([file,sha256])=>{
   try{const response=await build.fetchFile(file,15000);const actual=hash(Buffer.from(await response.arrayBuffer()));if(response.status!==200||actual!==sha256)failures.push({file,status:response.status,expectedSha256:sha256,actualSha256:actual});}
   catch{failures.push({file,error:'PUBLICATION_GET_FAILED'});}
  }));
  publication.attempts=i+1;publication.matched=failures.length===0;publication.failures=failures;
  fs.writeFileSync(out+'/publication.json',JSON.stringify(publication,null,2));
  if(publication.matched)break;if(i<89)await sleep(5000);
 }
 assert.ok(publication.matched,'Published page and dependencies must match the tested revision; see publication.json');
 const response=await fetch(origin+'/api/internal-payroll-novelties?resource=bootstrap&version=2',{redirect:'error',signal:AbortSignal.timeout(15000)});
 assert.equal(response.status,401);checks.push('published page and complete dependency bytes match; anonymous v2 novelty API is rejected');
}
let canPrepare=true,rejectNext=false;
const bootstrap=()=>({ok:true,principal:{email:'qa@example.invalid',membershipId:'00000000-0000-4000-8000-000000000001',tenantId:'00000000-0000-4000-8000-000000000002',certifiedBindingId:'00000000-0000-4000-8000-000000000004',capabilities:canPrepare?['payroll.novelty.prepare']:[]},
  feature:{contractVersion:'payroll-novelty-batch.v2',approvalEffect:'export_only'},limits:{contractVersion:'payroll-novelty-batch.v2',sourceModes:['individual','bulk'],native:{maxRows:1,sourceModes:['individual'],payrollTypes:['monthly']},approvalEffect:'export_only',grhMutation:false,payrollCalculated:false,payrollPosted:false,maxRows:500,payrollTypes:['monthly','first_fortnight','sac','vacation','supplementary','final','other']},batches:[]});
const values=Array.from({length:60},(_,i)=>[String(6001+i%30),i<30?'44':'144','',i%5===0?'2026-08':'','1',['','0','-2,50','100,01'][i%4],'standard','Acta sintética QA','Fundamento sintético para revisión',i%4===3?'SI':'NO']);
const csv=NOVELTY_CSV_HEADER.join(';')+'\r\n'+values.map(row=>row.map(v=>'"'+v.replaceAll('"','""')+'"').join(';')).join('\r\n')+'\r\n';
const browser=await chromium.launch({headless:true});let page;
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,serviceWorkers:'block',locale:'es-AR'});
 await context.route('**/*',async route=>{
  const request=route.request(),u=new URL(request.url());if(u.origin!==origin)return route.abort();
  if(u.pathname.startsWith('/api/')){
   if(u.pathname==='/api/internal-payroll-novelties'){
    if(request.method()==='POST'){
     assert.ok(canPrepare,'Revoked prepare must not POST');posts.push({body:request.postDataJSON(),key:request.headers()['idempotency-key']});
     if(rejectNext){rejectNext=false;return route.fulfill({status:503,json:{ok:false,error:'Respuesta sintética perdida'}});}
     return route.fulfill({json:{ok:true,data:{...posts.at(-1).body.payload,id:'00000000-0000-4000-8000-000000000003',contractVersion:'payroll-novelty-batch.v1',status:'draft',version:1,rowCount:posts.at(-1).body.payload.rows.length,exportable:false,grhMutation:false,payrollCalculated:false,payrollPosted:false}}});
    }
    return route.fulfill({json:bootstrap()});
   }
   if(u.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,user:{name:'QA sintética',email:'qa@example.invalid',role:'ADMIN_INTERNO'},access:{tenantCapabilities:['payroll.read','payroll.novelty.read','payroll.novelty.nominal.read','payroll.novelty.prepare'],platformCapabilities:[],platformRoles:[]}}});
   return route.fulfill({json:{ok:true,data:[]}});
  }
  if(live){
   if(request.method()!=='GET')return route.abort();
   const file=u.pathname===build.url('novedades-nomina.html').pathname?'novedades-nomina.html':u.pathname.slice(1);
   if(!expected.has(file))return route.continue();
   try{const response=await route.fetch({maxRedirects:0}),body=await response.body(),actualSha256=hash(body);
    if(response.status()!==200||actualSha256!==expected.get(file)){assetFailures.push({file,status:response.status(),expectedSha256:expected.get(file),actualSha256});return route.abort();}
    return route.fulfill({response,body});
   }catch{assetFailures.push({file,error:'BROWSER_ASSET_GET_FAILED'});return route.abort();}
  }
  const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
  return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'application/octet-stream'});
 });
 page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 const preview=page.locator('#previewPanel'),table=page.locator('#previewRows');
 await page.goto(live?build.url('novedades-nomina.html').href:origin+'/novedades-nomina.html');await page.locator('#preflightButton:enabled').waitFor();
 await page.locator('#periodMonth').fill('2026-09');await page.locator('[name=sourceMode][value=bulk]').check();
 const validate=async()=>{await page.locator('#bulkSource').fill(csv);await page.locator('#preflightButton').click();await preview.waitFor({state:'visible'});};
 await validate();assert.equal(posts.length,0);assert.equal(await table.locator('[data-review-row]').count(),25);
 assert.match(await page.locator('#reviewValuation').innerText(),/60 filas.*1\.462,65.*15 filas sin importe/);
 await page.locator('#reviewConceptControl > summary').click();assert.equal(await page.locator('#reviewConceptRows tr').count(),2);
 checks.push('complete 60-row control preserves null, signed amounts and two concepts without a request to save');
 await page.getByRole('button',{name:'Ver filas del concepto 44',exact:true}).click();assert.equal(await page.locator('#reviewConcept').inputValue(),'44');assert.match(await page.locator('#reviewRange').innerText(),/de 30/);
 assert.equal(await page.locator('#prepareButton').isEnabled(),true);assert.match(await page.locator('#reviewValuation').innerText(),/60 filas/);
 for(const [kind,count]of [['zero',8],['negative',7],['adjustment',6]]){await page.locator('#reviewKind').selectOption(kind);assert.equal(await table.locator('[data-review-row]').count(),count);}
 checks.push('exact concept selection and zero/negative/adjustment filters never change the whole-draft counts or save scope');
 const pending=page.waitForEvent('download');await page.locator('#reviewControlDownload').click();const download=await pending;await download.saveAs(out+'/control-synthetic.csv');
 const downloaded=fs.readFileSync(out+'/control-synthetic.csv','utf8');assert.match(downloaded,/"LOTE";"Todos";"60";"30"/);assert.match(downloaded,/"CONCEPTO";"144";"30"/);assert.doesNotMatch(downloaded,/6001|Fundamento sintético/);
 assert.equal(posts.length,0);checks.push('CSV export covers all concepts despite the active filter and contains no nominal identities or free text');
 await page.locator('#reviewReset').click();await page.locator('#reviewConcept').selectOption('144');await page.locator('#reviewKind').selectOption('missing');assert.equal(await table.locator('[data-review-row]').count(),7);
 checks.push('concept 44 never matches 144 and missing amounts do not include explicit zero');
 await page.locator('#reviewReset').click();
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:width>700?1000:844});await page.emulateMedia({reducedMotion:'reduce'});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page overflow at '+width);
  assert.ok(await page.locator('#reviewControlDownload').evaluate(n=>n.getBoundingClientRect().height>=44));
  await preview.screenshot({path:out+'/control-'+width+'-synthetic.png'});
 }checks.push('desktop, 390px and 320px keep the summary, table region and touch controls usable');
 await page.locator('#reviewSearch').fill('no-result-qa');assert.equal(await table.locator('[data-review-row]').count(),0);assert.equal(await page.locator('#prepareButton').isEnabled(),true);
 rejectNext=true;await page.locator('#prepareButton').click();await page.locator('#messageHost').filter({hasText:'La confirmación del envío está pendiente'}).waitFor();await page.locator('#nativeMonthlyRetry:enabled').waitFor();assert.equal(await page.locator('#prepareButton').isDisabled(),true);
 await page.locator('#nativeMonthlyRetry').click();await page.locator('#messageHost').filter({hasText:'Lote creado y auditado'}).waitFor();
 assert.equal(posts.length,2);assert.equal(posts[0].key,posts[1].key);assert.deepEqual(posts[0].body,posts[1].body);assert.equal(posts[1].body.payload.rows.length,60);assert.equal(posts[1].body.command,'prepare');
 const summary=noveltyBatchControl(posts[1].body.payload.rows);assert.equal(summary.knownAmountCents,'146265');assert.equal(summary.missing,15);assert.equal(summary.forced,15);
 checks.push('empty filtered view still saves the original 60 rows once per idempotency key, with no amount rewriting');
 await validate();await page.locator('#bulkSource').fill('invalid');assert.equal(await page.locator('#reviewConceptRows tr').count(),0);assert.equal(await page.locator('#reviewValuation').innerText(),'');assert.equal(await page.locator('#reviewConcept option').count(),0);
 checks.push('editing the source purges summary, concept choices and the previous validated snapshot');
 await validate();canPrepare=false;await page.locator('#refreshButton').click();await page.locator('#readOnlySection:visible').waitFor();assert.equal(await page.locator('#reviewConceptRows tr').count(),0);assert.equal(await page.locator('#reviewValuation').innerText(),'');assert.equal(await page.locator('#prepareButton').isDisabled(),true);
 checks.push('revoking preparation rights clears the controls together with the existing draft');assert.deepEqual(errors,[]);assert.deepEqual(assetFailures,[]);
 const report={ok:true,checksPassed:checks.length,checks,liveAssets:live,publication,apiResponsesSynthetic:true,postRequestsIntercepted:posts.length,realMunicipalWrites:0,realMunicipalSessionTested:false};
 fs.writeFileSync(out+'/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(e){const diagnostic={checks,errors,assetFailures,publication,page:page?await page.evaluate(()=>({path:location.pathname,entryHidden:document.getElementById('entrySection')?.hidden,message:document.getElementById('messageHost')?.textContent})).catch(()=>null):null};fs.writeFileSync(out+'/failure.json',JSON.stringify(diagnostic,null,2));fs.writeFileSync(out+'/error.txt',String(e.stack));if(page)await page.screenshot({path:out+'/failure.png'}).catch(()=>{});throw e;}
finally{await browser.close();}
