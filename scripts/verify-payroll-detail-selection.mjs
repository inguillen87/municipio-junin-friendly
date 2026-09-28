// Synthetic acceptance of exact selected runs. No payroll API is called.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'playwright';import {syntheticDetail} from './payroll-detail-synthetic.mjs';
import {publishedBuildVerification} from './lib/published-build-verification.mjs';
const root=path.resolve('public'),out=path.resolve('verification/payroll-detail-selection');fs.mkdirSync(out,{recursive:true});
const files=['assets/payroll-detail-panel.js','assets/payroll-detail-model.js','assets/payroll-detail-selection.js','assets/civil-date.js','assets/payroll-detail-export.js','assets/payroll-detail-panel.css'];
const published=process.argv.includes('--published'),overrides=new Map(),checked=[];
let commit=null;
if(published){
 const release=JSON.parse(fs.readFileSync(path.join(root,'release-info.json'),'utf8'));assert.equal(release.sourceState,'committed');commit=release.commitSha;
 const build=publishedBuildVerification({origin:'https://municipio-junin-friendly.vercel.app',release:commit});
 for(const file of ['release-info.json',...files,'release-info.json']){const r=await build.fetchFile(file);assert.equal(r.status,200);const bytes=Buffer.from(await r.arrayBuffer());assert.ok(bytes.equals(fs.readFileSync(path.join(root,file))),'Published bytes differ: '+file);overrides.set(file,bytes);if(!checked.includes(file))checked.push(file);}
}
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(req.method!=='GET'||pathname.startsWith('/api/')){res.writeHead(405);return res.end();}
 if(pathname==='/'){res.setHeader('content-type','text/html; charset=utf-8');return res.end('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/assets/payroll-detail-panel.css"><body style="font-family:Arial;margin:16px"><h1>Detalle de prueba</h1><div id="host"></div></body></html>');}
 const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
 res.setHeader('content-type',pathname.endsWith('.css')?'text/css':'application/javascript');res.end(overrides.get(pathname.slice(1))??fs.readFileSync(file));
});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});const checks=[],errors=[],downloads=[];
try{
 const page=await browser.newPage({viewport:{width:1180,height:900},locale:'es-AR',acceptDownloads:true});page.setDefaultTimeout(10000);
 page.on('pageerror',e=>errors.push(e.message));page.on('download',d=>downloads.push(d));
 await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());await page.goto(origin);
 const panel=page.locator('[data-payroll-detail-panel]'),status=panel.locator('.pd-status').first();
 const data=syntheticDetail(),expected={datasetId:data.datasetId,payrollDate:data.payrollDate,payrollType:data.payrollType,sourcePeriod:data.sourcePeriod,sourceMonth:data.sourceMonth};
 async function open(raw=data,selected=expected){
  await page.evaluate(async({raw,selected})=>{
   window.qaData=raw;window.qaItem=selected;window.qaCalls=[];
   const {openPayrollDetail}=await import('/assets/payroll-detail-panel.js');
   await openPayrollDetail({host:document.querySelector('#host'),employee:{name:'Agente sintético',legajo:'0012',contractId:'11111111-1111-4111-8111-111111111111'},item:qaItem,request:async url=>{qaCalls.push(url);return{ok:true,data:qaData};},canRead:()=>true});
  },{raw,selected});
 }
 for(const [field,value]of [['payrollDate','2025-06-30'],['payrollType','V'],['sourcePeriod',2025],['sourceMonth',6],['sourceMonth',null],['payrollDate','2026-02-30']]){
  await open({...data,[field]:value});assert.match(await status.innerText(),/no corresponde/);
  assert.equal(await panel.locator('.pd-card,.pd-actions,.pd-table').count(),0);assert.doesNotMatch(await panel.innerText(),/Agente sintético|1\.025,00/);
  checks.push('Respuesta con '+field+' diferente: no muestra conceptos, identidad o importes ni habilita exportaciones.');
 }
 await open({...data,datasetId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'});assert.match(await status.innerText(),/versión distinta/);assert.equal(await panel.locator('.pd-actions').count(),0);checks.push('Una versión de fuente distinta conserva la denegación existente.');
 const historical={...expected};delete historical.datasetId;
 await open({...data,payrollType:'V'},historical);assert.match(await status.innerText(),/no corresponde/);assert.equal(await panel.locator('.pd-actions').count(),0);checks.push('El acceso desde resumen histórico, sin dataset fijado, también valida la corrida completa.');
 for(const selected of [{...expected,payrollDate:'2026-07-31junk'},{...expected,payrollType:'monthly'},{...expected,sourcePeriod:null},{...expected,sourceMonth:13}]){
  await open(data,selected);assert.equal(await page.evaluate(()=>qaCalls.length),0);assert.equal(await panel.locator('.pd-actions').count(),0);checks.push('Selección inválida rechazada antes de consultar: '+JSON.stringify(selected));
 }
 await open(data,{...historical,payrollDate:'2026-07-31T23:30:00-03:00',sourcePeriod:'2026',sourceMonth:'7'});
 assert.equal(await panel.locator('.pd-actions button').count(),2);
 const url=new URL(await page.evaluate(()=>qaCalls[0]),origin);assert.equal(url.searchParams.get('date'),'2026-07-31');assert.equal(url.searchParams.get('period'),'2026');assert.equal(url.searchParams.get('month'),'7');assert.equal(url.searchParams.get('type'),'M');
 checks.push('Mantiene el día civil de la fuente y admite los números canónicos del selector.');
 for(const [field,value]of [['payrollDate','2026-07-30'],['payrollType','O'],['sourcePeriod',2025],['sourceMonth',8],['datasetId','aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa']]){
  await open(data,historical);await page.evaluate(({field,value})=>{qaData[field]=value;},{field,value});const count=downloads.length;
  await panel.getByRole('button',{name:'Descargar detalle · PDF',exact:true}).click();await panel.locator('.pd-actions + .pd-status').filter({hasText:/no corresponde|cambió/}).waitFor();
  assert.equal(downloads.length,count);checks.push('Reconsulta de exportación con '+field+' diferente: ninguna descarga, incluso sin dataset inicial.');
 }
 await open(data);assert.equal(await panel.locator('.pd-table').first().locator('tbody tr').count(),2);
 for(const [label,extension]of [['PDF','pdf'],['Excel','xlsx']]){
  const waiting=page.waitForEvent('download');await panel.getByRole('button',{name:'Descargar detalle · '+label,exact:true}).click();await(await waiting).saveAs(path.join(out,'verified-detail.'+extension));
 }
 assert.equal(await page.evaluate(()=>qaCalls.length),3);assert.match(await panel.locator('.pd-actions + .pd-status').innerText(),/11 conceptos/);
 checks.push('Corrida correcta: PDF y Excel se reconsultan y conservan los once conceptos aunque la pantalla muestre descuentos.');
 await open({version:'payroll-detail.v1',found:true,available:false,lines:[]});assert.match(await status.innerText(),/Todavía no hay líneas/);assert.equal(await panel.locator('.pd-actions').count(),0);checks.push('Ausencia de detalle conserva su mensaje sin inventar conceptos o permitir exportaciones.');
 await open({...data,payrollType:'V'});for(const width of [390,320]){
  await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await panel.screenshot({path:path.join(out,'rejected-'+width+'.png')});
 }
 await open(data);assert.equal(await panel.locator('.pd-actions button').count(),2);await panel.screenshot({path:path.join(out,'accepted-320.png')});checks.push('Rechazo legible a 320/390px y reapertura correcta sin bloquear una corrida válida.');
 assert.deepEqual(errors,[]);assert.equal(downloads.length,2);
 const result={ok:true,mode:published?'published_assets_synthetic_api':'local_build_synthetic_api',commit,checkedFiles:checked,checksPassed:checks.length,checks,errors,municipalSessionTested:false,privateApiRequests:0,businessWrites:0};
 fs.writeFileSync(path.join(out,published?'published.json':'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
