// Date annotation acceptance on the compiled panel; all payroll readers are synthetic.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'playwright';import {collectionFixture} from '../tests/fixtures/payroll-collection-synthetic.js';import {BATCH_DATASET} from '../tests/fixtures/payroll-document-selection-synthetic.js';
const root=path.resolve('public'),out=path.resolve('verification/document-payment-date');fs.mkdirSync(out,{recursive:true});const published=process.argv.includes('--published'),bytes=new Map();let commit=null;
if(published){
 const {publishedBuildVerification}=await import('./lib/published-build-verification.mjs');const release=JSON.parse(fs.readFileSync(path.join(root,'release-info.json'),'utf8'));assert.equal(release.sourceState,'committed');commit=release.commitSha;
 const build=publishedBuildVerification({origin:'https://municipio-junin-friendly.vercel.app',root,release:commit});
 const files=['assets/payroll-document-batch-panel.js','assets/payroll-document-batch.css','assets/payroll-document-batch-model.js','assets/payroll-document-periods.js','assets/payroll-document-catalog-filters.js','assets/payroll-document-collection.js','assets/payroll-document-export-panel.js','assets/payroll-document-set-pdf.js','assets/payroll-document-payment-date.js','assets/payroll-document-payment-field.js','assets/payroll-detail-panel.js','assets/payroll-detail-model.js','assets/payroll-detail-selection.js','assets/payroll-detail-export.js','assets/payroll-source-report-model.js','assets/clock-dashboard-zip.js','assets/civil-date.js'];
 for(const file of ['release-info.json',...files,'release-info.json']){const r=await build.fetchFile(file);assert.equal(r.status,200);const b=Buffer.from(await r.arrayBuffer());assert.ok(b.equals(fs.readFileSync(path.join(root,file))),'Published mismatch: '+file);bytes.set(file,b);}
}
const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://localhost').pathname;if(req.method!=='GET'||p.startsWith('/api/')){res.writeHead(405);return res.end();}
 if(p==='/'){res.setHeader('content-type','text/html; charset=utf-8');return res.end('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/assets/payroll-document-batch.css"><body style="font-family:Arial;margin:16px"><main id="host"></main></body></html>');}
 const f=path.resolve(root,'.'+p);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);return res.end();}res.setHeader('content-type',p.endsWith('.css')?'text/css':/\.(m?js)$/.test(p)?'application/javascript':'application/octet-stream');res.end(bytes.get(p.slice(1))??fs.readFileSync(f));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});let fixture=collectionFixture(3);const checks=[],errors=[],downloads=[];
try{
 const page=await browser.newPage({viewport:{width:1280,height:1000},locale:'es-AR',acceptDownloads:true});page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('download',d=>downloads.push(d));
 await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 await page.exposeFunction('syntheticRead',async url=>{try{return{answer:await fixture.request(url)};}catch(e){return{failed:true,status:e.status??500};}});
 const box=page.locator('[data-document-package]'),field=box.locator('[data-document-payment-date]'),kind=field.getByLabel('Dato de acreditación o pago'),date=field.getByLabel('Fecha de acreditación o pago declarada');
 const status=box.locator('[role=status]'),start=()=>box.getByRole('button',{name:'Preparar y descargar PDF conjunto',exact:true}).click();
 async function prepare(size=3){fixture=collectionFixture(size);await page.goto(origin);await page.evaluate(async()=>{
  window.MuniControlCapabilityGate={ready:Promise.resolve({tenantCapabilities:['payroll.read','workforce.employee.read']})};const {mountPayrollDocumentBatch}=await import('/assets/payroll-document-batch-panel.js');window.ui=mountPayrollDocumentBatch(document.querySelector('#host'),{request:async(url)=>{const r=await syntheticRead(url);if(r.failed)throw Object.assign(Error('SYNTHETIC_PRIVATE_ERROR'),{status:r.status});return r.answer;}});
 });await page.getByRole('button',{name:'Consultar liquidaciones',exact:true}).click();await page.getByLabel('Liquidación documental').selectOption(BATCH_DATASET);await page.getByRole('button',{name:'Aplicar selección',exact:true}).click();await page.locator('[data-batch-status]').filter({hasText:'Selección verificada'}).waitFor();}
 async function readPdf(file,visual=false){
  const result=await page.evaluate(async({raw,visual})=>{
   const pdf=await import('/assets/vendor/pdf.min.mjs');pdf.GlobalWorkerOptions.workerSrc='/assets/vendor/pdf.worker.min.mjs';
   const task=pdf.getDocument({data:new Uint8Array(raw),isEvalSupported:false}),document=await task.promise,pages=[],images=[];let outside=0;
   for(let i=1;i<=document.numPages;i++){
    const p=await document.getPage(i),content=await p.getTextContent(),viewport=p.getViewport({scale:1});pages.push(content.items.map(x=>x.str).join(' '));
    for(const item of content.items)if(item.str?.trim()&&(item.transform[4]<-1||item.transform[4]+item.width>viewport.width+1||item.transform[5]<-1||item.transform[5]+item.height>viewport.height+1))outside++;
    if(visual&&[1,2,document.numPages].includes(i)){const v=p.getViewport({scale:1.4}),canvas=globalThis.document.createElement('canvas');canvas.width=Math.ceil(v.width);canvas.height=Math.ceil(v.height);await p.render({canvasContext:canvas.getContext('2d'),viewport:v}).promise;images.push({page:i,png:canvas.toDataURL('image/png').split(',')[1]});}
   }
   await task.destroy();return{pages,images,outside};
  },{raw:Array.from(fs.readFileSync(file)),visual});
  assert.equal(result.outside,0,'Text outside PDF page: '+path.basename(file));
  for(const image of result.images)fs.writeFileSync(path.join(out,'date-pdf-page-'+image.page+'.png'),Buffer.from(image.png,'base64'));
  return result.pages;
 }

 async function save(name){const pending=page.waitForEvent('download');await start();const d=await pending,file=path.join(out,name+'.pdf');await d.saveAs(file);await status.filter({hasText:'PDF conjunto descargado'}).waitFor();return{pages:await readPdf(file,name==='mobile-acceptance'),filename:d.suggestedFilename()};}
 await prepare();assert.equal(await kind.inputValue(),'not_informed');assert.equal(await date.inputValue(),'');assert.equal(await date.isDisabled(),true);
 const none=await save('no-date');assert.match(none.pages[0],/Fecha de pago: no informada/);assert.doesNotMatch(none.pages.join(' '),/declarada:/);checks.push('Sin declaración no se inventa la fecha actual ni se cambia la salida anterior.');
 for(const choice of ['payment','credit']){
  await prepare();await kind.selectOption(choice);const before=fixture.calls.length;await start();await status.filter({hasText:'ingresá una fecha válida'}).waitFor();assert.equal(fixture.calls.length,before);assert.equal(await date.getAttribute('aria-invalid'),'true');assert.equal(await date.evaluate(e=>e===document.activeElement),true);
  await date.fill('2026-09-04');assert.match(await field.locator('.pdb-payment-preview').innerText(),/4 de septiembre de 2026/);const source=JSON.stringify(fixture.fixture.metadata),result=await save(choice);const expected=choice==='payment'?'Fecha de pago declarada: 04/09/2026':'Fecha de acreditación declarada: 04/09/2026';
  assert.ok(result.pages.every(p=>p.includes(expected)));assert.ok(result.pages.every(p=>p.includes('no verificado contra banco')));assert.match(result.pages[0],/Fecha de pago en la fuente: no informada/);
  assert.match(result.filename,/_declarado_2026-09-04\.pdf$/);assert.equal(JSON.stringify(fixture.fixture.metadata),source);assert.ok([...fixture.perPerson.values()].every(v=>v===2));
  for(const q of fixture.calls)assert.ok(Object.keys(q).every(k=>!(/payment|credit|declaration/i).test(k)));
  checks.push('Fecha '+choice+': requerida si se elige informar, presente con procedencia en portada y todas las páginas; no se envía a la API ni cambia nómina.');
 }
 await field.getByRole('button',{name:'Quitar fecha declarada'}).click();assert.equal(await kind.inputValue(),'not_informed');assert.equal(await date.inputValue(),'');assert.equal(await kind.evaluate(e=>e===document.activeElement),true);
 const removed=await save('date-removed');assert.match(removed.pages[0],/Fecha de pago: no informada/);assert.doesNotMatch(removed.pages.join(' '),/04\/09\/2026/);checks.push('Quitar fecha retira la declaración del PDF y devuelve el foco; no reutiliza la descarga anterior.');
 for(const invalid of ['1899-12-31','2100-01-01']){
  await prepare();await kind.selectOption('payment');await date.fill(invalid);const before=fixture.calls.length;await start();await status.filter({hasText:'fecha válida'}).waitFor();assert.equal(fixture.calls.length,before);assert.equal(await date.getAttribute('aria-invalid'),'true');
 }
 checks.push('Fechas fuera de rango son rechazadas antes de leer documentos.');
 for(const action of ['edit-date','edit-kind','remove-date','cancel']){
  await prepare(5);await kind.selectOption('payment');await date.fill('2026-09-04');const count=downloads.length,releases=[];fixture.state.wait=q=>q.resource==='employeepayrolldetail'?new Promise(r=>releases.push(r)):undefined;
  await start();await page.waitForFunction(()=>document.querySelector('.pdb-package-status')?.textContent.includes('Leyendo documentos'));while(!releases.length)await new Promise(r=>setTimeout(r,10));
  if(action==='edit-date')await date.fill('2026-09-05');if(action==='edit-kind')await kind.selectOption('credit');if(action==='remove-date')await field.getByRole('button',{name:'Quitar fecha declarada'}).click();if(action==='cancel')await box.getByRole('button',{name:'Cancelar preparación'}).click();
  fixture.state.wait=null;releases.forEach(r=>r());await page.waitForTimeout(100);assert.equal(downloads.length,count);assert.equal(await box.getByRole('button',{name:'Preparar y descargar PDF conjunto'}).isEnabled(),true);
  const result=await save(action+'-retry');if(action==='edit-date')assert.ok(result.pages.every(p=>p.includes('05/09/2026')));if(action==='edit-kind')assert.ok(result.pages.every(p=>p.includes('acreditación declarada')));if(action==='remove-date')assert.doesNotMatch(result.pages.join(' '),/declarada:/);if(action==='cancel')assert.ok(result.pages.every(p=>p.includes('04/09/2026')));
  checks.push('Durante la lectura: '+action+' descarta el archivo pendiente; el reintento respeta la nueva declaración sin reenviar automáticamente.');
 }
 await prepare(20);await kind.selectOption('credit');await date.fill('2026-09-04');const renderBefore=downloads.length;
 await page.evaluate(()=>{window.stopOnRender=new MutationObserver(()=>{if(document.querySelector('.pdb-package-status')?.textContent.includes('Construyendo el PDF')){stopOnRender.disconnect();const date=document.querySelector('[data-document-payment-date] input');date.value='2026-09-05';date.dispatchEvent(new Event('input',{bubbles:true}));}});stopOnRender.observe(document.querySelector('.pdb-package-status'),{childList:true});});
 await start();await status.filter({hasText:'Fecha declarada modificada'}).waitFor();await page.waitForTimeout(100);assert.equal(downloads.length,renderBefore);checks.push('Editar la fecha durante el renderer evita descargar el PDF ya desactualizado.');
 for(const action of ['range','permissions','hide','destroy']){
  await prepare();await kind.selectOption('payment');await date.fill('2026-09-04');
  if(action==='range'){await page.locator('[name=toNumber]').fill('2');assert.equal(await field.count(),0);await page.getByRole('button',{name:'Aplicar selección'}).click();await field.waitFor();assert.equal(await kind.inputValue(),'not_informed');assert.equal(await date.inputValue(),'');}
  if(action==='permissions')await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:[]}})));
  if(action==='hide')await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  if(action==='destroy')await page.evaluate(()=>ui.destroy());
  if(action!=='range')assert.equal(await field.count(),0);checks.push('Cambio de '+action+' retira la declaración; no se traslada a otro contexto.');
 }
 await prepare();await kind.selectOption('credit');await date.fill('2026-09-04');fixture.state.denied=true;await start();await page.locator('[data-batch-status]').filter({hasText:'no habilita'}).waitFor();assert.equal(await field.count(),0);checks.push('Un 403 del lector retira fecha, población y preparación sin mostrar valores privados.');
 await prepare();await kind.selectOption('credit');await date.fill('2026-09-04');const preview=await save('mobile-acceptance');assert.equal(preview.pages.filter(p=>p.includes('Referencia documental:')).length,3);
 const primary=box.getByRole('button',{name:'Preparar y descargar PDF conjunto'});await primary.hover();assert.equal(await primary.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(6, 101, 95)');assert.equal(await primary.evaluate(el=>getComputedStyle(el).color),'rgb(255, 255, 255)');
 await box.screenshot({path:path.join(out,'desktop.png')});
 for(const width of [390,320]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));for(const el of [kind,date,field.getByRole('button',{name:'Quitar fecha declarada'})])assert.ok((await el.boundingBox()).height>=44);await box.screenshot({path:path.join(out,'mobile-'+width+'.png')});}
 checks.push('Fecha, tipo, procedencia y acciones legibles a 320/390px; controles de al menos 44px.');
 assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
 const report={ok:true,commit,mode:published?'public_assets_loopback_synthetic_reader':'compiled_panel_loopback_synthetic_reader',publicFiles:[...bytes.keys()],checksPassed:checks.length,checks,errors,municipalSessionTested:false,paymentDataWritten:false,businessWrites:0};
 fs.writeFileSync(path.join(out,published?'published.json':'result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
