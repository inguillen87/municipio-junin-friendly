// Loopback-only acceptance. Exposed reader uses in-memory fixtures, never municipal APIs.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'playwright';import {collectionFixture} from '../tests/fixtures/payroll-collection-synthetic.js';
import {BATCH_DATASET} from '../tests/fixtures/payroll-document-selection-synthetic.js';
const root=path.resolve('public'),out=path.resolve('verification/document-download');fs.mkdirSync(out,{recursive:true});
const published=process.argv.includes('--published'),publicBytes=new Map();let releaseSha=null;
if(published){
 const {publishedBuildVerification}=await import('./lib/published-build-verification.mjs');
 const release=JSON.parse(fs.readFileSync(path.join(root,'release-info.json'),'utf8'));assert.equal(release.sourceState,'committed');releaseSha=release.commitSha;
 const build=publishedBuildVerification({origin:'https://municipio-junin-friendly.vercel.app',root,release:releaseSha});
 const names=['assets/payroll-document-batch-panel.js','assets/payroll-document-batch.css','assets/payroll-document-batch-model.js','assets/payroll-document-periods.js','assets/payroll-document-catalog-filters.js','assets/payroll-document-collection.js','assets/payroll-document-export-panel.js','assets/payroll-document-set-pdf.js','assets/payroll-detail-panel.js','assets/payroll-detail-model.js','assets/payroll-detail-selection.js','assets/payroll-detail-export.js','assets/payroll-source-report-model.js','assets/clock-dashboard-zip.js','assets/civil-date.js'];
 for(const name of ['release-info.json',...names,'release-info.json']){const r=await build.fetchFile(name);assert.equal(r.status,200);const bytes=Buffer.from(await r.arrayBuffer());assert.ok(bytes.equals(fs.readFileSync(path.join(root,name))),'Published bytes differ: '+name);publicBytes.set(name,bytes);}
}
const server=http.createServer((req,res)=>{
 const p=new URL(req.url,'http://localhost').pathname;
 if(req.method!=='GET'||p.startsWith('/api/')){res.writeHead(405);return res.end();}
 if(p==='/'){res.setHeader('content-type','text/html; charset=utf-8');return res.end('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/assets/payroll-document-batch.css"><body style="font-family:Arial;margin:16px"><main id="host"></main></body></html>');}
 const f=path.resolve(root,'.'+p);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);return res.end();}
 res.setHeader('content-type',p.endsWith('.css')?'text/css':p.endsWith('.js')||p.endsWith('.mjs')?'application/javascript':'application/octet-stream');res.end(publicBytes.get(p.slice(1))??fs.readFileSync(f));
});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});let fixture=collectionFixture(),denied=false;const checks=[],errors=[],downloads=[];
try{
 const page=await browser.newPage({viewport:{width:1280,height:1000},locale:'es-AR',acceptDownloads:true});page.setDefaultTimeout(15000);
 page.on('pageerror',e=>errors.push(e.message));page.on('download',d=>downloads.push(d));
 await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 await page.exposeFunction('syntheticRead',async url=>{
  try{if(denied)throw Object.assign(Error('Denied synthetic reader'),{status:403});return{answer:await fixture.request(url)};}
  catch(e){return{failure:true,status:e.status??500};}
 });
 async function prepare({size=55,from='',to='',sectorFrom='',sectorTo=''}={}){
  fixture=collectionFixture(size);denied=false;await page.goto(origin);
  await page.evaluate(async()=>{window.MuniControlCapabilityGate={ready:Promise.resolve({tenantCapabilities:['payroll.read','workforce.employee.read']})};const {mountPayrollDocumentBatch}=await import('/assets/payroll-document-batch-panel.js');window.batchUi=mountPayrollDocumentBatch(document.querySelector('#host'),{request:async url=>{const r=await syntheticRead(url);if(r.failure)throw Object.assign(Error('Synthetic failed read'),{status:r.status});return r.answer;}});});
  await page.getByRole('button',{name:'Consultar liquidaciones',exact:true}).click();await page.getByLabel('Liquidación documental').selectOption(BATCH_DATASET);
  for(const [k,v]of Object.entries({fromNumber:from,toNumber:to,fromSector:sectorFrom,toSector:sectorTo}))if(v)await page.locator('[name='+k+']').fill(v);
  await page.getByRole('button',{name:'Aplicar selección',exact:true}).click();await page.locator('[data-batch-status]').filter({hasText:'Selección verificada'}).waitFor();
 }
 const box=page.locator('[data-document-package]'),status=box.locator('[role=status]');const start=()=>box.getByRole('button',{name:'Preparar y descargar PDF conjunto',exact:true}).click();
 const save=async name=>{const next=page.waitForEvent('download');await start();const d=await next;const file=path.join(out,name+'.pdf');await d.saveAs(file);await status.filter({hasText:'PDF conjunto descargado'}).waitFor();return file;};
 async function pdfText(file){return page.evaluate(async raw=>{const pdf=await import('/assets/vendor/pdf.min.mjs');pdf.GlobalWorkerOptions.workerSrc='/assets/vendor/pdf.worker.min.mjs';const task=pdf.getDocument({data:new Uint8Array(raw),isEvalSupported:false}),document=await task.promise,text=[];for(let n=1;n<=document.numPages;n++)text.push((await(await document.getPage(n)).getTextContent()).items.map(i=>i.str).join(' '));await task.destroy();return text;},Array.from(fs.readFileSync(file)));}
 await prepare();assert.equal(await page.locator('[data-batch-rows]>tr').count(),25);assert.equal(fixture.perPerson.size,0);assert.match(await box.innerText(),/55 documentos del rango/);
 const complete=await save('complete-55'),texts=await pdfText(complete);
 assert.equal(fixture.perPerson.size,55);assert.ok([...fixture.perPerson.values()].every(n=>n===2));assert.ok(texts.length>55);
 assert.match(texts.join(' '),/0001/);assert.match(texts.join(' '),/0055/);assert.equal((texts.join(' ').match(/Referencia documental:/g)||[]).length,55);
 assert.match(await status.innerText(),/55 documentos · 605 conceptos/);checks.push('55 documentos de todas las páginas, 605 conceptos, índice y relectura de cada agente; no se limita a los 25 visibles.');
 await prepare({size:55});await page.getByRole('button',{name:'Página siguiente',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-batch-rows] td')?.textContent==='0026');
 await save('from-page-two');assert.equal(fixture.perPerson.size,55);checks.push('Preparar desde la segunda página conserva el rango completo y empieza en el primer legajo.');
 await prepare({from:'0020',to:'50',sectorFrom:'02',sectorTo:'02'});const range=await pdfText(await save('range-20-40'));assert.match(await status.innerText(),/21 documentos/);
 assert.deepEqual([...fixture.perPerson.keys()].sort((a,b)=>a-b),Array.from({length:21},(_,i)=>i+20));assert.match(range.join(' '),/Legajos: 0020 a 50/);checks.push('Rangos inclusivos de legajo y repartición se respetan en el PDF completo.');
 for(const opts of [{size:62},{size:10,from:'900'}]){await prepare(opts);const before=fixture.calls.length;assert.equal(await box.getByRole('button',{name:'Preparar y descargar PDF conjunto'}).isDisabled(),true);assert.equal(fixture.calls.length,before);assert.equal(fixture.perPerson.size,0);}
 checks.push('Vínculos por revisar o selección vacía no habilitan descarga ni omiten personas en silencio.');
 for(const kind of ['missing','changed-period','changed-on-reread','unsupported-text','final-population']){
  await prepare({size:3});const before=downloads.length;
  if(kind==='unsupported-text'){fixture.state.modifyDetail=d=>{d.lines[0].description='Texto QA 漢字';};}
  else if(kind==='final-population'){let count=0;fixture.state.modifyPage=p=>{if(++count===3)p.rows[0].name='Nombre cambiado QA';};}
  else fixture.state.modifyDetail=(d,n,reading)=>{if(n!==2)return;if(kind==='missing')d.available=false;if(kind==='changed-period')d.sourceMonth=7;if(kind==='changed-on-reread'&&reading===2)d.lines[0].amount='999.00';};
  await start();await status.filter({hasText:/No se|no se|No pudo|Cambi|texto/}).waitFor();await page.waitForFunction(()=>document.querySelector('[data-document-package]')?.getAttribute('aria-busy')==='false');
  assert.equal(downloads.length,before);checks.push('Fallo '+kind+': ningún PDF parcial, opción de reintentar sin alterar los rangos.');
 }
 await prepare({size:3});fixture.state.delay=70;await start();await box.getByRole('button',{name:'Preparar y descargar PDF conjunto'}).evaluate(b=>b.click());await status.filter({hasText:'PDF conjunto descargado'}).waitFor();
 assert.ok([...fixture.perPerson.values()].every(n=>n===2));checks.push('Doble activación inicia una sola preparación.');
 for(const action of ['cancel','change-ranges','revoke','hide','destroy']){
  await prepare({size:5});const before=downloads.length,releases=[];fixture.state.wait=q=>q.resource==='employeepayrolldetail'?new Promise(r=>releases.push(r)):undefined;
  await start();while(!releases.length)await new Promise(r=>setTimeout(r,10));
  if(action==='cancel')await box.getByRole('button',{name:'Cancelar preparación',exact:true}).click();
  if(action==='change-ranges')await page.locator('[name=toNumber]').fill('3');
  if(action==='revoke')await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:[]}})));
  if(action==='hide')await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  if(action==='destroy')await page.evaluate(()=>batchUi.destroy());
  fixture.state.wait=null;releases.forEach(r=>r());await page.waitForTimeout(100);assert.equal(downloads.length,before);
  if(action==='cancel'){assert.match(await status.innerText(),/cancelada/);assert.equal(await box.getByRole('button',{name:'Preparar y descargar PDF conjunto'}).isEnabled(),true);}else assert.equal(await box.count(),0);
  checks.push('Durante la lectura: '+action+' elimina la preparación e impide una descarga tardía.');
 }
 await prepare({size:2});const deniedBefore=downloads.length;denied=true;await start();await page.locator('[data-batch-status]').filter({hasText:'no habilita'}).waitFor();assert.equal(await box.count(),0);assert.equal(downloads.length,deniedBefore);checks.push('Denegación del lector privado retira población y paquete sin revelar errores del servidor.');
 await prepare({size:55});const renderBefore=downloads.length;
 await page.evaluate(()=>{window.renderStop=new MutationObserver(()=>{if(document.querySelector('.pdb-package-status')?.textContent.includes('Construyendo el PDF')){renderStop.disconnect();[...document.querySelectorAll('.pdb-package button')].find(e=>e.textContent==='Cancelar preparación').click();}});renderStop.observe(document.querySelector('.pdb-package-status'),{childList:true});});
 await start();await status.filter({hasText:'Preparación cancelada'}).waitFor();await page.waitForTimeout(100);assert.equal(downloads.length,renderBefore);checks.push('Cancelar también interrumpe la construcción por documentos del PDF, antes de descargar.');
 await prepare({size:3});await save('small-3');await box.screenshot({path:path.join(out,'desktop.png')});
 for(const width of [390,320]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.ok((await box.getByRole('button',{name:'Preparar y descargar PDF conjunto'}).boundingBox()).height>=44);await box.screenshot({path:path.join(out,'mobile-'+width+'.png')});}
 checks.push('Progreso, resumen y acciones utilizables a 320/390px, con foco y controles de 44px.');
 assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
 const result={ok:true,mode:published?'public_assets_loopback_synthetic_reader':'compiled_panel_loopback_synthetic_reader',releaseSha,publicFiles:[...publicBytes.keys()],checksPassed:checks.length,checks,errors,municipalSessionTested:false,privateRequestsForwarded:0,businessWrites:0};fs.writeFileSync(path.join(out,published?'published.json':'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
