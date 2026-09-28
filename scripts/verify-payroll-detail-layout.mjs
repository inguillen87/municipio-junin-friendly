// Browser acceptance for document readability. Synthetic data only; no municipal sessions.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'playwright';import {syntheticDetail} from './payroll-detail-synthetic.mjs';
import {publishedBuildVerification} from './lib/published-build-verification.mjs';
const root=path.resolve('public'),out=path.resolve('verification/payroll-detail-layout');fs.mkdirSync(out,{recursive:true});
const published=process.argv.includes('--published'),files=['assets/payroll-detail-panel.js','assets/payroll-detail-model.js','assets/payroll-detail-export.js','assets/payroll-detail-panel.css'],verified=[];
const overrides=new Map();
if(published){
 const release=JSON.parse(fs.readFileSync(path.join(root,'release-info.json'),'utf8'));assert.equal(release.sourceState,'committed');
 const build=publishedBuildVerification({origin:'https://municipio-junin-friendly.vercel.app',release:release.commitSha});
 for(const file of ['release-info.json',...files,'release-info.json']){
  const r=await build.fetchFile(file);assert.equal(r.status,200);const bytes=Buffer.from(await r.arrayBuffer());
  assert.ok(bytes.equals(fs.readFileSync(path.join(root,file))),'Published bytes differ: '+file);overrides.set(file,bytes);if(!verified.includes(file))verified.push(file);
 }
}
const server=http.createServer((req,res)=>{
 const p=new URL(req.url,'http://localhost').pathname;
 if(p==='/'){res.setHeader('content-type','text/html');return res.end('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/assets/payroll-detail-panel.css"><body style="margin:12px;font-family:Arial"><main><h1>Documento de prueba</h1><button id="origin">Abrir documento</button><div id="host"></div></main></body></html>');}
 if(req.method!=='GET'||p.startsWith('/api/')){res.writeHead(405);return res.end();}
 const file=path.resolve(root,'.'+p);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
 res.setHeader('content-type',p.endsWith('.css')?'text/css':p.endsWith('.json')?'application/json':'application/javascript');res.end(overrides.get(p.slice(1))??fs.readFileSync(file));
});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});const checks=[],errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true,locale:'es-AR',reducedMotion:'reduce'});
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());await page.goto(origin);
 const panel=page.locator('[data-payroll-detail-panel]');
 async function open(long=false){
  const data=syntheticDetail();if(long){data.sourceLabel='FUENTE_'+('R'.repeat(225));data.lines[2].description='CONCEPTO_'+('C'.repeat(180));data.lines[2].quantity='9999999999999.99';data.lines[2].amount='9999999999900.00';}
  await page.evaluate(async ({data,long})=>{
   const {openPayrollDetail}=await import('/assets/payroll-detail-panel.js');window.qaCalls=0;
   await openPayrollDetail({host:document.querySelector('#host'),employee:{name:long?'PERSONA_'+('N'.repeat(130)):'Persona de prueba',legajo:'0012',contractId:'11111111-1111-4111-8111-111111111111'},item:{datasetId:data.datasetId,payrollDate:data.payrollDate,payrollType:data.payrollType,sourcePeriod:data.sourcePeriod,sourceMonth:data.sourceMonth},request:async()=>{qaCalls++;return{ok:true,data};},canRead:()=>true,onClose:()=>document.querySelector('#origin').focus()});
  },{data,long});return data;
 }
 for(const long of [false,true]){
  const data=await open(long);
  for(const width of [1440,768,390,320]){
   await page.setViewportSize({width,height:1000});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page overflow at '+width);
   assert.equal(await panel.locator('.pd-context').first().innerText(),(long?'PERSONA_'+('N'.repeat(130)):'Persona de prueba')+' · Legajo 0012');
   assert.ok((await panel.locator('.pd-status').first().innerText()).startsWith(data.sourceLabel),await panel.locator('.pd-status').first().innerText());
   for(const b of await panel.locator('button').all())assert.ok((await b.boundingBox()).height>=44);
   const source=await panel.locator('.pd-status').first().evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));assert.ok(source.scroll<=source.width+1);
   assert.equal(await panel.locator('th:not([scope="col"])').count(),0);
   checks.push((long?'Texto extenso y valores máximos':'Contenido habitual')+' sin desbordar la página a '+width+' px.');
  }
  const region=panel.getByRole('region',{name:'Conceptos del documento, tabla desplazable'});
  await region.focus();await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>document.querySelector('.payroll-detail>.pd-table-wrap').scrollLeft>0);
  const outlined=await region.evaluate(e=>getComputedStyle(e).outlineStyle);assert.notEqual(outlined,'none');
  await panel.getByRole('button',{name:'Todos los conceptos',exact:true}).click();assert.equal(await region.locator('tbody tr').count(),data.lines.length);
  assert.ok((await region.innerText()).includes(data.lines[2].description));
  await region.evaluate(el=>{el.scrollLeft=el.scrollWidth;});
  const clipped=await region.locator('td.pd-number').evaluateAll(cells=>cells.filter(e=>e.scrollWidth>e.clientWidth+1).length);assert.equal(clipped,0,'Numeric values exceed their own cell');
  checks.push((long?'Valores máximos':'Valores habituales')+': tabla accesible con teclado, importes completos y todos los conceptos conservados.');
  await panel.locator('.pd-controls>summary').click();const control=panel.getByRole('region',{name:'Conciliación de importes, tabla desplazable'});await control.focus();await page.keyboard.press('ArrowRight');await page.waitForFunction(()=>document.querySelector('.pd-controls .pd-table-wrap').scrollLeft>0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks.push('Conciliación accesible sin ampliar la página.');
 }
 await page.setViewportSize({width:390,height:950});await open(false);
 await panel.screenshot({path:path.join(out,'mobile-390.png')});await page.setViewportSize({width:320,height:950});await panel.screenshot({path:path.join(out,'mobile-320.png')});
 await page.setViewportSize({width:1440,height:1000});await panel.screenshot({path:path.join(out,'desktop.png')});
 for(const [label,extension] of [['PDF','pdf'],['Excel','xlsx']]){
  const next=page.waitForEvent('download');await panel.getByRole('button',{name:'Descargar detalle · '+label,exact:true}).click();await(await next).saveAs(path.join(out,'detalle.'+extension));
 }
 assert.equal(await page.evaluate(()=>qaCalls),3);checks.push('PDF y Excel mantienen reconsulta y exportación completa aunque se muestre sólo Descuentos.');
 await panel.getByRole('button',{name:'Cerrar detalle',exact:true}).click();assert.equal(await panel.count(),0);assert.equal(await page.locator('#origin').evaluate(e=>e===document.activeElement),true);checks.push('Cerrar conserva la devolución del foco al control de origen.');
 await page.setViewportSize({width:320,height:950});await open(true);await panel.screenshot({path:path.join(out,'long-text-320.png')});
 assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);assert.deepEqual(errors,[]);
 const result={ok:true,mode:published?'published_assets_synthetic_api':'local_build_synthetic_api',checkedFiles:verified,checksPassed:checks.length,checks,errors,municipalSessionTested:false,businessWrites:0};
 fs.writeFileSync(path.join(out,published?'published.json':'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
