// Entire browser/API fixture is synthetic. No municipal reads, writes or messages.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {unzipSync,strFromU8} from 'fflate';
import {nativeSchoolingFixture,nativeFamilyRow,syntheticAdministrativeCertificate,syntheticUuid} from '../tests/fixtures/native-family-schooling-synthetic.js';
const origin='https://schooling-review.test',base=path.resolve('public'),out=path.resolve('verification/family-schooling-review');fs.mkdirSync(out,{recursive:true});
const checks=[],errors=[],writes=[],downloads=[];let dataset,denied=false,delay=null,reads=0;
function fixture(){const p=nativeSchoolingFixture({mixed:false,children:false});for(let i=0;i<76;i++){
 const c=syntheticAdministrativeCertificate({id:syntheticUuid(81000+i)});c.expiresOn=i===75?'2026-10-03':i%3===0?'2026-10-01':null;c.schoolYear=i%5===0?2025:2026;
 const row=nativeFamilyRow({certificate:c});Object.assign(row,{familyRef:{kind:'own',id:syntheticUuid(82000+i)},familyName:'Hijo sintético '+String(i+1).padStart(3,'0'),identityToken:'a'.repeat(64)});row.effectiveDates={origin:'manual',presentedOn:c.presentedOn,expiresOn:c.expiresOn};p.data.rows.push(row);
 }return p;}
dataset=fixture();
for(const asset of ['family-schooling.js','family-schooling-review.js','family-schooling-review-model.js','family-schooling-review-export.js','family-schooling.css'])assert.ok(fs.readFileSync('assets/'+asset).equals(fs.readFileSync(path.join(base,'assets',asset))),'STALE_BUILD '+asset);
const browser=await chromium.launch({headless:true,...(process.env.SCHOOLING_BROWSER_CHANNEL?{channel:process.env.SCHOOLING_BROWSER_CHANNEL}:{})});
let page;
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,serviceWorkers:'block',locale:'es-AR'});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.abort();
  if(!u.pathname.startsWith('/api/')){const file=path.resolve(base,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});return route.fulfill({status:200,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});}
  assert.equal(req.method(),'GET');if(req.method()!=='GET')writes.push(req.url());
  if(u.pathname==='/api/internal-family-certificates'){
   assert.equal(u.searchParams.get('resource'),'report');assert.equal(u.searchParams.get('version'),'5');reads++;if(delay){const wait=delay;delay=null;await wait;}
   return route.fulfill(denied?{status:403,json:{ok:false,code:'SCHOOL_CERTIFICATE_CAPABILITY_REQUIRED'}}:{status:200,json:dataset});
  }
  return route.fulfill({status:200,json:{ok:true,authenticated:true,user:{email:'schooling-qa@example.invalid',name:'Operador sintético'},access:{tenantCapabilities:['workforce.employee.read','workforce.summary.read'],platformCapabilities:[],platformRoles:[]},data:[]}});
 });
 page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('download',d=>downloads.push(d));
 await page.goto(origin+'/reportes-rrhh.html#certificados-escolares');
 const report=page.locator('#certificados-escolares'),panel=report.locator('[data-fs-review-panel]');
 const consulted=async()=>{await report.locator('[data-fs-consult]').click();await panel.waitFor();await report.locator('[data-fs-consult]').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('[data-fs-consult]')?.disabled===false);};
 const run=async()=>{await panel.locator('summary').click();await panel.locator('[data-fs-review-criteria=asOf]').fill('2026-10-03');await panel.locator('[data-fs-review-criteria=through]').fill('2026-11-02');await panel.locator('[data-fs-review-criteria=schoolYear]').fill('2026');await panel.locator('[data-fs-review-run]').click();await panel.locator('[data-fs-review-output]').waitFor();};
 await consulted();await report.locator('[data-fs-search]').fill('does-not-match');assert.equal(await report.locator('[data-fs-rows] tr').count(),1);await run();assert.equal(await panel.locator('[data-fs-review-row]').count(),25);assert.match(await panel.locator('.fs-source').innerText(),/76 registros/);checks.push('review uses all76 records independently of the principal filter');
 await panel.locator('[data-fs-review-next]').click();assert.match(await panel.locator('nav').innerText(),/Página 2 de 4/);
 const event=page.waitForEvent('download');await panel.locator('[data-fs-review-export]').click();const download=await event;const file=path.join(out,'review-complete-synthetic.xlsx');await download.saveAs(file);const book=unzipSync(fs.readFileSync(file));assert.equal((strFromU8(book['xl/worksheets/sheet1.xml']).match(/<row /g)||[]).length,77);assert.match(strFromU8(book['xl/worksheets/sheet2.xml']),/2026-11-02/);assert.equal(reads,2);checks.push('download from second page rechecks access and carries all76 rows with declared criteria');
 await panel.locator('[data-fs-review-search]').fill('076');assert.equal(await panel.locator('[data-fs-review-row]').count(),1);assert.match(await panel.innerText(),/Vencimiento informado próximo/);const href=await panel.locator('[data-fs-review-row] a').getAttribute('href');assert.ok(href.includes(encodeURIComponent(dataset.data.rows[75].familyRef.id)));checks.push('search reaches last page and link targets exact own child without a GRH identity');
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});await panel.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await panel.locator('[data-fs-review-export]').evaluate(e=>e.getBoundingClientRect().height>=44));await page.screenshot({path:path.join(out,'review-'+width+'-synthetic.png'),fullPage:true});}checks.push('desktop and390/320 widths preserve accessible44px controls without overflow');
 await panel.locator('[data-fs-review-criteria=schoolYear]').fill('2025');assert.equal(await panel.locator('[data-fs-review-row]').count(),0);assert.equal(await panel.locator('[data-fs-review-export]').isDisabled(),true);await panel.locator('[data-fs-review-run]').click();await panel.locator('[data-fs-review-filter]').selectOption('cycle');assert.match(await panel.locator('.fs-source').innerText(),/60 registros/);checks.push('criteria change withdraws review, explicit rerun applies new cycle over whole report');
 const count=downloads.length;dataset.data.rows[0].certificate.course='Nueva versión sintética';await panel.locator('[data-fs-review-export]').click();await page.waitForFunction(()=>document.querySelector('[data-fs-status]')?.textContent.includes('registro escolar cambió'));assert.equal(await panel.count(),0);assert.equal(downloads.length,count);checks.push('concurrent certificate change blocks stale export and removes both consulted views');
 await consulted();await run();denied=true;await panel.locator('[data-fs-review-export]').click();await page.waitForFunction(()=>document.querySelector('[data-fs-status]')?.textContent.includes('Cambió el acceso'));assert.equal(await panel.count(),0);denied=false;assert.equal(downloads.length,count);checks.push('403 fresh access revocation removes all review and report metadata without download');
 await consulted();await run();await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:[]}})));assert.equal(await panel.count(),0);checks.push('capability event removes review immediately');
 await page.reload();await consulted();await run();let release;delay=new Promise(resolve=>release=resolve);await panel.locator('[data-fs-review-export]').click();await page.waitForFunction(()=>document.querySelector('[data-fs-review-status]')?.textContent.includes('Comprobando'));await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});release();await page.waitForFunction(()=>document.querySelector('[data-fs-review-panel]')===null);assert.equal(downloads.length,count);checks.push('hidden page discards complete review and in-flight read, late response cannot download');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});dataset.data.rows=[];await consulted();await run();assert.match(await panel.innerText(),/No hay registros/);assert.equal(await panel.locator('[data-fs-review-export]').isDisabled(),true);checks.push('empty report is a clean zero result, no fabricated errors or download');
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:true,checks,syntheticOnly:true,municipalWrites:0},null,2));console.log(JSON.stringify({ok:true,checks:checks.length,municipalWrites:0}));
}catch(error){if(page)await page.screenshot({path:path.join(out,'failure-synthetic.png'),fullPage:true}).catch(()=>{});fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({ok:false,error:error.message,checks,errors},null,2));throw error;}finally{await browser.close();}
