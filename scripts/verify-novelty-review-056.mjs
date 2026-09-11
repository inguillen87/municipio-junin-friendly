/** Full workbench. All API requests, including POSTs, are intercepted with synthetic QA data. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { NOVELTY_CSV_HEADER } from '../assets/payroll-novelty-review.js';
const live = process.env.NOVELTY_LIVE_ASSETS === '1';
const origin = live ? 'https://municipio-junin-friendly.vercel.app' : 'https://municontrol.test';
const root = path.resolve('public'), out = 'verification/novelty-056' + (live ? '-published' : '');
fs.mkdirSync(out, { recursive:true });
const checks = [], errors = [], posts = [];
let canPrepare = true, deny = false, rejectNext = false;
const csv = rows => NOVELTY_CSV_HEADER.join(';') + '\r\n' + rows.map(r=>r.map(c=>'"'+String(c).replaceAll('"','""')+'"').join(';')).join('\r\n') + '\r\n';
const values = (legajo='1001', amount='', observation='Fundamento sintético de QA') => [legajo,'44','','','1',amount,'standard','Acta QA',observation,'NO'];
const bulk = Array.from({length:60},(_,i)=>values(String(100001+i), i%3===0?'0':'', i===59?'Última fila; dos líneas\n<script>window.__injected = true</script>':'Fundamento sintético de QA'));
const bootstrap = () => ({
  ok:true, principal:{email:'qa@example.invalid',membershipId:'00000000-0000-4000-8000-000000000001',tenantId:'00000000-0000-4000-8000-000000000002',capabilities:canPrepare?['payroll.novelty.prepare']:[]},
  limits:{contractVersion:'payroll-novelty-batch.v1',approvalEffect:'export_only',grhMutation:false,payrollCalculated:false,payrollPosted:false,maxRows:500,payrollTypes:['monthly','first_fortnight','sac','vacation','supplementary','final','other']},batches:[],
});
const browser = await chromium.launch({headless:true});
try {
  const context = await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,serviceWorkers:'block'});
  await context.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.origin !== origin) return route.abort();
    if (u.pathname.startsWith('/api/')) {
      if (u.pathname === '/api/internal-payroll-novelties') {
        if (deny) return route.fulfill({status:401,json:{ok:false,error:'Sesión sintética vencida'}});
        if (route.request().method() === 'POST') {
          posts.push({body:route.request().postDataJSON(),key:route.request().headers()['idempotency-key']});
          if (rejectNext) { rejectNext=false; return route.fulfill({status:503,json:{ok:false,error:'Reintento sintético QA'}}); }
          return route.fulfill({status:200,json:{ok:true,data:{id:'00000000-0000-4000-8000-000000000003'}}});
        }
        return route.fulfill({status:200,json:bootstrap()});
      }
      if (u.pathname === '/api/internal-auth') return route.fulfill({status:200,json:{ok:true,authenticated:true,user:{name:'QA',email:'qa@example.invalid',role:'ADMIN_INTERNO'},access:{tenantCapabilities:['payroll.read'],platformCapabilities:[],platformRoles:[]}}});
      return route.fulfill({status:200,json:{ok:true,data:[]}});
    }
    if (live) return route.continue();
    const file = path.resolve(root,'.'+decodeURIComponent(u.pathname));
    if (!file.startsWith(root+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({status:404,body:''});
    return route.fulfill({status:200,contentType:file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'application/octet-stream',body:fs.readFileSync(file)});
  });
  const page=await context.newPage(); page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/novedades-nomina.html');await page.locator('#entrySection:visible').waitFor();await page.locator('#preflightButton:enabled').waitFor();
  await page.locator('#periodMonth').fill('2026-09');
  await page.locator('#legajo').fill('1001');await page.locator('#conceptSourceId').fill('44');await page.locator('#quantityDecimal').fill('1');await page.locator('#preflightButton').click();
  await page.locator('#previewPanel:visible').waitFor();assert.match(await page.locator('#previewRows').innerText(),/No informado/);assert.equal(posts.length,0);checks.push('individual optional amount is null, not zero; validation sends nothing');
  await page.locator('[name=sourceMode][value=agile]').check();await page.locator('#agileAddButton').click();await page.locator('#legajo').fill('1002');await page.locator('#agileAddButton').click();await page.locator('#preflightButton').click();
  assert.equal(await page.locator('[data-review-row]').count(),2);assert.equal(await page.locator('#periodMonth').isDisabled(),true);checks.push('agile two-legajo template and locking preserved in complete review');
  await page.locator('#agileClearButton').click();await page.locator('[name=sourceMode][value=bulk]').check();
  const validate=async text=>{await page.locator('#bulkSource').fill(text);await page.locator('#preflightButton').click();};
  await validate(csv(bulk));assert.equal(await page.locator('[data-review-row]').count(),25);assert.match(await page.locator('#reviewRange').innerText(),/1–25 de 60/);checks.push('60-row input starts on first 25-row page; full batch count visible');
  await page.locator('#reviewNext').click();assert.equal(await page.locator('[data-review-row]').first().getAttribute('data-review-row'),'26');
  await page.locator('#reviewNext').click();assert.equal(await page.locator('[data-review-row]').last().getAttribute('data-review-row'),'60');assert.equal(await page.locator('#reviewNext').isDisabled(),true);checks.push('all pages and final row accessible; next disabled at boundary');
  await page.locator('#reviewSearch').fill('100060');assert.equal(await page.locator('[data-review-row]').count(),1);assert.equal(await page.locator('#prepareButton').isEnabled(),true);
  await page.locator('[data-review-row="60"] summary').click();assert.match(await page.locator('.novelty-row-fields').innerText(),/Última fila; dos líneas/);assert.equal(await page.evaluate(()=>window.__injected),undefined);checks.push('search preserves draft; all hidden source fields readable without HTML injection');
  await page.locator('#reviewReset').click();await page.locator('#reviewKind').selectOption('missing');assert.match(await page.locator('#reviewRange').innerText(),/de 40/);
  await page.locator('#reviewKind').selectOption('manual');assert.equal(await page.locator('[data-review-row]').count(),20);assert.match(await page.locator('#previewRows').innerText(),/\$ 0,00/);checks.push('missing-amount filter excludes explicit zeros; manual filter retains them');
  await page.locator('#reviewSearch').fill('absent-qa');assert.equal(await page.locator('[data-review-row]').count(),0);assert.match(await page.locator('#reviewScope').innerText(),/60 filas/);assert.equal(await page.locator('#prepareButton').isEnabled(),true);checks.push('empty view never changes the 60-row save scope');
  await page.locator('#reviewReset').click();await page.locator('#reviewPageSize').selectOption('100');assert.equal(await page.locator('[data-review-row]').count(),60);checks.push('page-size controls expose whole small batch and keep validation');
  await page.locator('#reviewPageSize').selectOption('25');await page.locator('#reviewNext').click();
  await page.locator('#previewPanel').screenshot({path:out+'/review-desktop-qa.png'});
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  const overflow=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,nodes:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>innerWidth+1&&!e.closest('.table-wrap')}).map(e=>({tag:e.tagName,id:e.id,class:e.className,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width})).slice(0,30)}));
  fs.writeFileSync(out+'/mobile-layout.json',JSON.stringify(overflow,null,2));
  await page.locator('#previewPanel').screenshot({path:out+'/review-mobile-qa.png'});
  assert.ok(overflow.width<=overflow.viewport+1,JSON.stringify(overflow));
  checks.push('mobile viewport contains review and retains all controls');await page.setViewportSize({width:1440,height:1000});
  await page.locator('#reviewSearch').fill('100060');rejectNext=true;await page.locator('#prepareButton').click();await page.locator('#messageHost').filter({hasText:'No se pudo preparar'}).waitFor();
  await page.locator('#prepareButton:enabled').waitFor();await page.locator('#prepareButton').click();await page.locator('#messageHost').filter({hasText:'Lote creado y auditado'}).waitFor();
  assert.equal(posts.length,2);assert.equal(posts[0].key,posts[1].key);assert.equal(posts[0].body.payload.rows.length,60);assert.equal(posts[1].body.payload.rows[59].observation,bulk[59][8]);
  assert.equal(posts[1].body.payload.rows[0].amountCents,'0');assert.equal(posts[1].body.payload.rows[1].amountCents,null);assert.equal(posts[1].body.command,'prepare');checks.push('intercepted save sends all 60 original rows; retries preserve same idempotency key');
  const bad=[values('x'),values('1001'),values('1001','90'),values('1004','1.234,50')];await validate(csv(bad));await page.locator('#noveltyIssuesPanel:visible').waitFor();
  assert.equal(await page.locator('#noveltyIssueRows tr').count(),3);assert.equal(await page.locator('#prepareButton').isDisabled(),true);assert.equal(await page.locator('#previewRows tr').count(),0);assert.equal(posts.length,2);checks.push('all three invalid/duplicate rows shown together; no partial save or stale preview');
  const download=page.waitForEvent('download');await page.locator('#noveltyIssuesDownload').click();await(await download).saveAs(out+'/incidencias-qa.csv');
  assert.match(fs.readFileSync(out+'/incidencias-qa.csv','utf8'),/Duplica la fila 2/);await page.locator('#noveltyIssuesPanel').screenshot({path:out+'/issues-desktop-qa.png'});checks.push('error CSV downloads complete incidence list, without creating a batch');
  await validate(csv(bulk));await page.locator('#bulkSource').fill(csv([values()]));assert.equal(await page.locator('#prepareButton').isDisabled(),true);assert.equal(await page.locator('[data-review-row]').count(),0);checks.push('editing input removes validated snapshot and nominal DOM rows immediately');
  await page.locator('#bulkFile').setInputFiles({name:'qa.csv',mimeType:'text/csv',buffer:Buffer.from('\ufeff'+csv([values()]))});await page.locator('#messageHost').filter({hasText:'Archivo leído, sin guardar'}).waitFor();await page.locator('#preflightButton').click();assert.equal(await page.locator('[data-review-row]').count(),1);checks.push('real FileReader decodes valid UTF-8 BOM without corrupting data');
  await page.locator('#bulkFile').setInputFiles({name:'too-big.csv',mimeType:'text/csv',buffer:Buffer.alloc(480*1024+1,65)});assert.equal(await page.locator('#prepareButton').isDisabled(),true);assert.equal(await page.locator('#bulkSource').inputValue(),'');assert.equal(await page.locator('[data-review-row]').count(),0);checks.push('rejected oversized file invalidates prior review instead of leaving Save enabled');
  await page.locator('#bulkFile').setInputFiles({name:'bad-utf8.csv',mimeType:'text/csv',buffer:Buffer.from([255,254,65,66])});await page.locator('#messageHost').filter({hasText:'Codificación no válida'}).waitFor();assert.equal(await page.locator('#bulkSource').inputValue(),'');checks.push('invalid UTF-8 rejected, no replacement characters silently imported');
  await page.evaluate(()=>{
    window.__readers=[];
    window.FileReader=class extends EventTarget {
      readyState=0;result=null;
      readAsArrayBuffer(blob){this.readyState=1;window.__readers.push(this);blob.arrayBuffer().then(b=>{this.buffer=b;});}
      abort(){this.readyState=2;this.dispatchEvent(new Event('abort'));}
      finish(){this.result=this.buffer;this.readyState=2;this.dispatchEvent(new Event('load'));}
    };
  });
  await page.locator('#bulkFile').setInputFiles({name:'slow.csv',mimeType:'text/csv',buffer:Buffer.from(csv([values('8001')]))});await page.waitForFunction(()=>window.__readers[0]?.buffer);
  await page.locator('#bulkSource').fill(csv([values('8002')]));await page.evaluate(()=>window.__readers[0].finish());assert.match(await page.locator('#bulkSource').inputValue(),/8002/);checks.push('late file load cannot overwrite a newer manual edit');
  await page.locator('#bulkFile').setInputFiles({name:'slow-old.csv',mimeType:'text/csv',buffer:Buffer.from(csv([values('8003')]))});
  await page.locator('#bulkFile').setInputFiles({name:'slow-new.csv',mimeType:'text/csv',buffer:Buffer.from(csv([values('8004')]))});await page.waitForFunction(()=>window.__readers[2]?.buffer);
  await page.evaluate(()=>{window.__readers[1].finish();window.__readers[2].finish();});assert.match(await page.locator('#bulkSource').inputValue(),/8004/);checks.push('superseded FileReader response cannot replace newest selected file');
  await page.locator('#preflightButton').click();canPrepare=false;await page.locator('#refreshButton').click();await page.locator('#readOnlySection:visible').waitFor();assert.equal(await page.locator('[data-review-row]').count(),0);assert.equal(await page.locator('#prepareButton').isDisabled(),true);checks.push('permission revocation clears bulk and individual prepared snapshots, not only agile');
  canPrepare=true;await page.locator('#refreshButton').click();await page.locator('#entrySection:visible').waitFor();deny=true;await page.locator('#refreshButton').click();await page.waitForURL('**/login.html?next=novedades-nomina.html');checks.push('expired session redirects to login without a backend bypass');
  assert.deepEqual(errors,[]);checks.push('no unhandled browser JavaScript errors');
  fs.writeFileSync(out+'/browser.json',JSON.stringify({checksPassed:checks.length,checks,errors,apiResponsesSynthetic:true,postRequestsIntercepted:posts.length,productionApiWrites:0,realMunicipalSessionTested:false,liveAssets:live},null,2));
  console.log(JSON.stringify({checksPassed:checks.length,errors,liveAssets:live}));
} catch(e) { fs.writeFileSync(out+'/error.txt',String(e.stack));throw e; } finally { await browser.close(); }
