// Página real; APIs administrativas interceptadas con fixtures. Ninguna escritura municipal.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { buildAdminMembershipAuthFixture, buildAdminMembershipIdentityFixture,
  buildAdminMembershipBootstrapFixture, buildAdminMembershipPlatformOwnersFixture } from './verify-admin-membership-governance-browser.mjs';
import { verifyRelease } from '../assets/release-status-model.js';
const live = process.env.RELEASE_STATUS_ORIGIN;
if (live !== undefined) assert.equal(live, 'https://municipio-junin-friendly.vercel.app');
const origin = live || 'https://release-status.test', base = path.resolve('public');
const output = path.resolve('verification/release-status'); fs.mkdirSync(output, {recursive:true});
const loaded = verifyRelease(JSON.parse(fs.readFileSync(path.join(base, 'release-info.json'), 'utf8')));
if (live) assert.equal(loaded.sourceState, 'committed');
const checks=[],errors=[],assets=new Set(),apiCalls=[];let releaseRequests=0,mode='same',releasePending;
const browser=await chromium.launch({headless:true,...(process.env.CLOCK_BROWSER_CHANNEL?{channel:process.env.CLOCK_BROWSER_CHANNEL}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'es-AR',serviceWorkers:'block'});
await context.addCookies([{name:'synthetic_session',value:'QA_PRIVATE_COOKIE',url:origin}]);
await context.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__releaseDiagnostic=text;}}});});
await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin)return route.abort();assert.equal(request.method(),'GET');
  const json=(value,status=200)=>route.fulfill({status,json:value,headers:{'Cache-Control':'no-store'}}).catch(()=>{});
  if(url.pathname==='/release-info.json'){
    releaseRequests++;assert.equal(request.headers().cookie,undefined);
    const responseMode=mode;
    if(responseMode==='delay')await new Promise(resolve=>releasePending=resolve);
    if(responseMode==='fail')return json({error:'PRIVATE_NOT_FOR_DISPLAY'},503);
    if(responseMode==='invalid')return json({...loaded,userName:'PRIVATE_NOT_FOR_DISPLAY'});
    let value={...loaded};if(responseMode==='other')value={...value,commitSha:'e'.repeat(40),sourceState:'committed'};
    if(responseMode==='artifact')value.adminUiSha256='f'.repeat(64);
    if(live&&responseMode==='same'){
      const response=await fetch(origin+'/release-info.json',{credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
      assert.equal(response.status,200);assert.match(response.headers.get('cache-control')||'',/no-store/);
      assert.deepEqual(verifyRelease(await response.json()),loaded);assets.add('/release-info.json');
    }
    return json(value);
  }
  if(url.pathname.startsWith('/api/')){
    apiCalls.push(url.pathname+url.search);const resource=url.searchParams.get('resource');
    if(url.pathname==='/api/internal-auth')return json(buildAdminMembershipAuthFixture());
    if(url.pathname==='/api/internal-identity')return json(resource==='bootstrap'?buildAdminMembershipIdentityFixture():{ok:true,allowedCommands:[],invitations:[]});
    if(url.pathname==='/api/internal-admin'){
      if(resource==='bootstrap')return json(buildAdminMembershipBootstrapFixture());
      if(resource==='platform_owners')return json(buildAdminMembershipPlatformOwnersFixture());
      if(resource==='users')return json({ok:true,users:[],source:{cutoff:'2099-01-01T00:00:00.000Z'}});
      if(resource==='audit')return json({ok:true,events:[]});
    }
    return json({ok:false},403);
  }
  const file=path.resolve(base,'.'+url.pathname);
  if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
  let bytes=fs.readFileSync(file);
  if(live){const target=url.pathname==='/administracion-plataforma.html'?origin+'/administracion':url.href;
    const response=await fetch(target,{credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
    assert.equal(response.status,200,url.pathname);const body=Buffer.from(await response.arrayBuffer());
    assert.ok(body.equals(bytes),'Published asset differs: '+url.pathname);bytes=body;assets.add(url.pathname);
  }
  const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
  return route.fulfill({status:200,body:bytes,contentType:mime[path.extname(file)]||'application/octet-stream'});
});
try{
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/administracion-plataforma.html');await page.locator('#platformAdminShell:not([hidden])').waitFor();
  const host=page.locator('#releaseStatus'),status=host.locator('[data-release-status]');
  await host.locator(':scope > summary').click();assert.equal(releaseRequests,0);
  const check=host.locator('.release-buttons button').first();
  await page.locator('#tenantSearch').fill('BORRADOR_QA_NO_PERSISTIDO');const url=page.url(),apiCount=apiCalls.length;
  await check.click();const expected=loaded.sourceState==='committed'?'same':'unverified';
  await page.waitForFunction(value=>document.getElementById('releaseStatus').dataset.result===value,expected);
  assert.equal(page.url(),url);assert.equal(await page.locator('#tenantSearch').inputValue(),'BORRADOR_QA_NO_PERSISTIDO');
  assert.equal(apiCalls.length,apiCount);assert.equal(releaseRequests,1);
  checks.push('Consulta manual y anónima: conserva el borrador y no consulta nuevamente ninguna API municipal.');
  mode='other';await check.click();await page.waitForFunction(value=>document.getElementById('releaseStatus').dataset.result===value,loaded.sourceState==='committed'?'different_commit':'unverified');
  assert.equal(await host.locator('[data-release-published]').textContent(),'eeeeeee');assert.equal(page.url(),url);
  checks.push('Un commit diferente se presenta como otra publicación, no como una recarga obligatoria ni una versión necesariamente más nueva.');
  mode='artifact';await check.click();await page.waitForFunction(value=>document.getElementById('releaseStatus').dataset.result===value,loaded.sourceState==='committed'?'different_artifact':'unverified');
  checks.push('Mismo commit con compilación de administración diferente no se declara coincidencia.');
  await host.getByRole('button',{name:'Copiar diagnóstico técnico'}).click();
  const report=JSON.parse(await page.evaluate(()=>window.__releaseDiagnostic));assert.equal(report.dataFreshnessVerified,false);
  assert.equal(report.loaded.adminUiSha256,loaded.adminUiSha256);assert.doesNotMatch(JSON.stringify(report),/BORRADOR_QA|QA_PRIVATE_COOKIE|Checker|tenantId|token|correo/i);
  checks.push('Diagnóstico copiable con commit y huella, sin consultas nominales, texto del formulario ni cookies.');
  for(const fault of ['fail','invalid']){mode=fault;await check.click();await page.waitForFunction(()=>document.getElementById('releaseStatus').dataset.result==='unavailable');
    assert.doesNotMatch(await host.innerText(),/PRIVATE_NOT_FOR_DISPLAY/);assert.equal(await host.locator('[data-release-published]').textContent(),'Sin consultar');}
  checks.push('Fallo de lectura o metadatos ajenos al contrato retiran la coincidencia anterior y no exponen mensajes crudos.');
  mode='delay';const before=releaseRequests;await check.click();await page.waitForFunction(()=>document.querySelector('#releaseStatus button').disabled);
  await check.evaluate(node=>node.click());assert.equal(releaseRequests,before+1);
  await page.evaluate(()=>document.getElementById('platformAdminShell').hidden=true);
  await page.waitForFunction(()=>document.getElementById('releaseStatus').dataset.result==='not_checked');
  releasePending();await page.waitForTimeout(80);assert.equal(await host.getAttribute('data-result'),'not_checked');
  await page.evaluate(()=>document.getElementById('platformAdminShell').hidden=false);
  assert.equal(releaseRequests,before+1);checks.push('Consulta única y cancelación al cerrar el ámbito: la respuesta tardía no restaura una coincidencia vieja.');
  mode='same';await check.click();await page.waitForFunction(value=>document.getElementById('releaseStatus').dataset.result===value,expected);
  await host.screenshot({path:path.join(output,'desktop.png')});
  await page.setViewportSize({width:390,height:844});await host.screenshot({path:path.join(output,'mobile.png')});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.equal(await page.locator('#tenantSearch').inputValue(),'BORRADOR_QA_NO_PERSISTIDO');
  checks.push('Panel legible en 390 píxeles sin perder el trabajo del formulario administrativo.');
  assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);assert.deepEqual(errors,[]);
  const result={version:'release-status-browser.v1',checkedAt:new Date().toISOString(),mode:live?'published_bytes_synthetic_admin':'local_build_synthetic_admin',
    checksPassed:checks.length,checks,loaded,metadataRequests:releaseRequests,publishedAssets:[...assets].sort(),errors,
    realMunicipalSessionTested:false,municipalWrites:0,dataFreshnessVerified:false};
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await context.close();await browser.close();}
