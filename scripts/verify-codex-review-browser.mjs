// Compiled local pages with synthetic API/SQL only. This does not replace the
// existing published-route gate or certify a municipal session or calculation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {batch,bootstrap} from '../tests/fixtures/novelty-saved-review-synthetic.js';
import {correctionPreparte} from '../tests/fixtures/preparte-correction-synthetic.js';
import {fixture,caps,id,principal,session} from '../tests/fixtures/grh-import-synthetic.js';
import {reviewGrhImport} from '../lib/internal-grh-import.js';

const origin='https://codex-review.test',root=path.resolve('public'),out='verification/codex-review-browser';
fs.mkdirSync(out,{recursive:true});
const checks=[],errors=[],posts=[],dialogs=[];
let saved=batch(),access=bootstrap(),population=await correctionPreparte(),changed=false,denied=false,importing=false;
let f=fixture(125);f.state.records=[];
const browser=await chromium.launch({headless:true});let page;
try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'es-AR',acceptDownloads:true,serviceWorkers:'block'});
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==origin)return route.abort();
    if(url.pathname.startsWith('/api/')){
      const json=data=>route.fulfill({headers:{'Cache-Control':'private, no-store'},json:data});
      if(url.pathname==='/api/internal-auth')return json({ok:true,authenticated:true,user:{email:'qa@example.invalid',name:'QA',role:'ADMIN_INTERNO'},access:{tenantCapabilities:importing?caps:access.principal.capabilities,platformCapabilities:[],platformRoles:[]}});
      if(url.pathname==='/api/internal-attendance')return json(population);
      if(url.pathname==='/api/internal-payroll-novelties'){
        if(denied)return route.fulfill({status:403,headers:{'Cache-Control':'private, no-store'},json:{ok:false,code:'PAYROLL_NOVELTY_CAPABILITY_REQUIRED'}});
        if(request.method()==='GET'){
          if(importing)return json({ok:true,principal:{tenantId:id(1),membershipId:id(2),certifiedBindingId:id(4),capabilities:caps}});
          if(url.searchParams.get('resource')==='detail'){
            const detail=structuredClone(saved);if(changed)detail.rows[59].amountCents='0';
            return json({ok:true,data:detail});
          }
          return json({ok:true,...access,sourceFeatures:{attendancePreparte:true}});
        }
        const body=request.postDataJSON();posts.push({body,key:request.headers()['idempotency-key']});
        if(importing){assert.equal(body.command,'grhPreview','CSV checks may only review, never save');return json({ok:true,replayed:false,...await reviewGrhImport(f.readSql,f.runtime,principal(),session(),body.payload)});}
        assert.equal(body.command,'submit');saved={...saved,status:'submitted',version:2,allowedCommands:['approve','reject']};return json({ok:true,data:saved});
      }
      return json({ok:true,data:[]});
    }
    assert.equal(request.method(),'GET');
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
    const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'};
    return route.fulfill({contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
  });
  page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.accept();});
  await page.goto(origin+'/novedades-nomina.html?batchId='+saved.id);
  await page.locator('#savedReviewPanel:visible').waitFor();
  assert.equal(await page.locator('#detailRows tr').count(),25);
  await page.locator('#savedReviewNext').click();await page.locator('#savedReviewNext').click();
  assert.match(await page.locator('#savedReviewRange').innerText(),/51–60 de 60/);
  await page.locator('#savedReviewSearch').fill('1060');assert.equal(await page.locator('#detailRows tr').count(),1);
  assert.match(await page.locator('#savedReviewScope').innerText(),/60 filas/);
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:1000});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.locator('#savedReviewPanel').screenshot({path:out+'/saved-'+width+'.png'});
  }
  checks.push('saved 60-row review reaches all pages; search keeps full scope; desktop and mobile fit');
  changed=true;await page.getByRole('button',{name:'Enviar a aprobación',exact:true}).click();
  await page.locator('#messageHost').filter({hasText:'El lote cambió'}).waitFor();
  assert.equal(posts.length,0);assert.equal(dialogs.length,0);
  changed=false;await page.locator('#refreshButton').click();await page.locator('#savedReviewPanel:visible').waitFor();
  await page.locator('#savedReviewSearch').fill('1060');
  await page.getByRole('button',{name:'Enviar a aprobación',exact:true}).click();
  await page.locator('#messageHost').filter({hasText:'Operación confirmada'}).waitFor();
  assert.equal(posts.length,1);assert.equal(posts[0].body.payload.expectedVersion,1);
  assert.match(dialogs[0],/60 filas, incluidos los registros fuera del filtro/);
  checks.push('changed last row blocks the decision; fresh whole-batch review confirms all 60 despite a filter');
  access.principal.capabilities=access.principal.capabilities.filter(cap=>cap!=='payroll.novelty.nominal.read');
  await page.locator('#refreshButton').click();await page.locator('#savedReviewPanel').waitFor({state:'hidden'});
  assert.equal(await page.locator('#detailRows tr').count(),0);assert.equal(posts.length,1);
  checks.push('nominal permission revocation retires every saved row and prevents another decision');

  access=bootstrap();await page.goto(origin+'/novedades-nomina.html');
  await page.locator('#preflightButton:enabled').waitFor();await page.locator('#periodMonth').fill('2026-09');
  const panel=page.locator('#attendancePreparte');await panel.locator('summary').click();await panel.locator('[data-ap-load]').click();
  await panel.locator('[data-ap-result]:visible').waitFor();
  for(let p=0;p<3;p++){
    for(const row of await panel.locator('tr[data-ap-key]').all()){
      await row.locator('[type=checkbox]').check();await row.locator('[data-ap-field=cap]').fill('2');await row.locator('[data-ap-field=percent]').fill('3');
    }
    if(p<2)await panel.locator('[data-ap-next]').click();
  }
  await panel.locator('[data-ap-reference]').fill('Listado sintético QA, versión 1');await panel.locator('[data-ap-reviewed]').check();
  await panel.locator('[data-ap-search]').fill('99000');await panel.locator('[data-ap-check]').click();
  assert.equal(await panel.locator('[data-ap-correction-list] li').count(),60);
  assert.match(await panel.locator('[data-ap-correction-count]').innerText(),/60 filas seleccionadas/);
  const last=panel.locator('[data-ap-correction-key="'+population.rows[59].key+'"]');await last.click();
  assert.equal(await panel.locator('[data-ap-search]').inputValue(),'');assert.match(await panel.locator('[data-ap-count]').innerText(),/Página 3 de 3/);
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.apField),'percent');
  await panel.locator('tr[data-ap-key="'+population.rows[59].key+'"] [data-ap-field=cap]').fill('3');
  assert.equal(await panel.locator('[data-ap-reviewed]').isChecked(),false);
  assert.equal(await panel.locator('[data-ap-correction-list] li').count(),60,'59 row issues plus renewed document review');
  await panel.locator('[data-ap-use]').click();assert.equal(await page.locator('[data-sheet-row]').count(),0);assert.equal(posts.length,1);
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert.ok((await panel.locator('[data-ap-check]').boundingBox()).height>=44);
    await panel.locator('[data-ap-corrections]').screenshot({path:out+'/corrections-'+width+'.png'});
  }
  checks.push('60 selected row corrections survive filtering and pages; correction focuses the last row; edits renew review and block partial transfer');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(await panel.locator('[data-ap-correction-list] li').count(),0);assert.equal(await panel.locator('tr[data-ap-key]').count(),0);
  checks.push('hiding the page withdraws preparte rows, corrections and documentary confirmation');

  importing=true;await page.goto(origin+'/importar-novedades-grh.html');
  await page.locator('#accessStatus').filter({hasText:'Acceso verificado'}).waitFor();
  await page.locator('#concept').fill('614');await page.locator('#period').fill('2026-08');
  await page.locator('#file').setInputFiles({name:'sintetico.txt',mimeType:'text/plain',buffer:Buffer.from(f.payload.contentBase64,'base64')});
  await page.locator('#previewButton').click();await page.locator('#previewPanel:visible').waitFor();
  assert.equal(await page.locator('#rows>tr').count(),50);await page.locator('#next').click();await page.locator('#next').click();
  assert.equal(await page.locator('#rows>tr').count(),25);assert.equal(await page.locator('#pageLabel').innerText(),'Página 3 de 3');
  assert.equal(await page.locator('#rows>tr').last().locator('td').first().innerText(),'125');
  assert.ok((await page.locator('#downloadIncidents').boundingBox()).height>=44);await page.locator('#search').fill('sin-coincidencias');
  const downloading=page.waitForEvent('download');await page.locator('#downloadIncidents').click();const download=await downloading;
  await download.saveAs(out+'/incidencias-sinteticas.csv');const csv=fs.readFileSync(out+'/incidencias-sinteticas.csv','utf8');
  assert.equal(csv.trimEnd().split('\r\n').length,126);assert.match(csv,/"125","Vínculo no encontrado"/);
  assert.doesNotMatch(csv,/99000001|Persona QA|12345|11111111-/);assert.equal(f.state.writes,0);
  checks.push('CSV downloads all 125 source rows despite an empty filter, three safe columns and no nominal values or save');
  await page.locator('#concept').fill('638');assert.equal(await page.locator('#downloadIncidents').isDisabled(),true);
  await page.locator('#concept').fill('614');await page.locator('#previewButton').click();await page.locator('#previewPanel:visible').waitFor();
  let laterDownloads=0;page.on('download',()=>laterDownloads++);denied=true;await page.locator('#downloadIncidents').click();
  await page.locator('#intake').waitFor({state:'hidden'});assert.equal(laterDownloads,0);assert.equal(await page.locator('#rows>tr').count(),0);assert.equal(f.state.writes,0);
  checks.push('concept invalidation and fresh server revocation prevent the report and clear the private preview');
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
  const result={ok:true,mode:'compiled-local',checksPassed:checks.length,checks,errors,syntheticApiOnly:true,municipalWrites:0,interceptedDecisions:1,importWrites:f.state.writes,publishedRouteGateReplaced:false};
  fs.writeFileSync(out+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){fs.writeFileSync(out+'/error.txt',String(error.stack));await page?.screenshot({path:out+'/failure.png',fullPage:true});throw error;}
finally{await browser.close();}
