// Isolated loopback UI and canonical HTTP handler. The SQL transport and all
// people are synthetic; this never opens a municipal session or database.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {launchOwnSyntheticBrowser} from './lib/own-synthetic-browser.mjs';
import {createInternalDataHandler} from '../api/internal-data.js';
import {collectionFixture} from '../tests/fixtures/payroll-collection-synthetic.js';
import {BATCH_DATASET,BATCH_SNAPSHOT,BATCH_TENANT} from '../tests/fixtures/payroll-document-selection-synthetic.js';
import {collectPayrollDocuments} from '../assets/payroll-document-collection.js';
import {createPayrollDocumentSetPdf} from '../assets/payroll-document-set-pdf.js';
const root=path.resolve(import.meta.dirname,'..'),args={};
for(const arg of process.argv.slice(2)){const m=/^--(output|browser)=(.+)$/.exec(arg);assert.ok(m&&!Object.hasOwn(args,m[1]));args[m[1]]=m[2];}
const output=path.resolve(args.output),browserName=args.browser??'chromium';assert.ok(['chrome','chromium'].includes(browserName));
assert.ok(output.startsWith(path.join(root,'verification')+path.sep)&&!fs.existsSync(output));fs.mkdirSync(output);
const email='contention-qa@example.invalid',id='44444444-4444-4444-8444-444444444444';
const principal={user:{email},tenant:{source:'membership',id:BATCH_TENANT,membershipId:id,effectiveCapabilities:['payroll.read','workforce.employee.read']}};
const session={email,id,version:1,releaseSha:'a'.repeat(40)},env={FRIENDLY_GRH_SOURCE_DATABASE:'grh_qa',FRIENDLY_GRH_COMPANY_ID:'101'};
let fixture,mode,reads,activeReads=0,maxReads=0,busyResponses=0,detailResponses=0,server,browser,page,report;const checks=[],errors=[],downloads=[],methods=[];
const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
const fail=code=>{throw Object.assign(Error(code),{code:code==='ACTION_SESSION_BUSY'?'P0001':code});};
const payrollSql={query:async(query,values)=>{
 if(query.includes('payroll_source_report_v1('))return[{result:fixture.catalogue().data}];
 if(query.includes('payroll_export_roster_v1(')){
  const {documentaryDirectory}=await fixture.fixture.readRoster();
  return[{result:{...structuredClone(fixture.fixture.roster),documentaryDirectory}}];
 }
 assert.ok(query.includes('employee_payroll_detail_v1('),'Unexpected synthetic payroll SQL');
 const url='/api/internal-data?'+new URLSearchParams({resource:'employeepayrolldetail',contractId:values[6],date:values[7],type:values[8],period:String(values[9]),month:String(values[10])});
 const count=(reads.get(url)??0)+1;reads.set(url,count);activeReads++;maxReads=Math.max(maxReads,activeReads);
 try{
  await new Promise(resolve=>setTimeout(resolve,8));
  if(mode==='busy-always'||mode==='cancel'||mode==='busy-once'&&count===1){busyResponses++;fail('ACTION_SESSION_BUSY');}
  if(mode==='forbidden')fail('EMPLOYEE_PAYROLL_CAPABILITY_REQUIRED');if(mode==='unauthenticated')fail('ACTION_SESSION_INVALID');if(mode==='source-changed')fail('GRH_SOURCE_CHANGED');
  detailResponses++;return[{result:(await fixture.request(url)).data}];
 }finally{activeReads--;}
}};
const directorySql={query:async(query,values)=>query.includes('effective-source:snapshot')?[{token:BATCH_SNAPSHOT}]:fixture.fixture.sql.query(query,values)};
const handler=createInternalDataHandler({env,requireCompatibleInternalAccess:async()=>({mode:'managed',principal}),actionMutationSession:()=>session,getInternalSql:async()=>directorySql,getActionCenterSql:async()=>payrollSql,reportReadFailure:diagnostic=>{assert.ok(['ACTION_SESSION_BUSY','EMPLOYEE_PAYROLL_CAPABILITY_REQUIRED','ACTION_SESSION_INVALID','GRH_SOURCE_CHANGED'].includes(diagnostic.code));}});
const html='<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/payroll-document-batch.css"><style>body{margin:16px;font-family:Arial,sans-serif}main{max-width:1200px;margin:auto}</style><main id="qa"></main><script type="module">window.MuniControlCapabilityGate={ready:Promise.resolve({tenantCapabilities:["payroll.read","workforce.employee.read"]})};const {mountPayrollDocumentBatch}=await import("/assets/payroll-document-batch-panel.js");window.qaUi=mountPayrollDocumentBatch(document.querySelector("#qa"));</script></html>';
try{
 server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://qa.invalid');methods.push(req.method);res.setHeader('Cache-Control','private, no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; worker-src 'none'");
  if(req.method!=='GET'){res.writeHead(405).end();return;}
  if(url.pathname==='/api/internal-data'){
   req.query=Object.fromEntries(url.searchParams);res.status=n=>{res.statusCode=n;return res;};res.json=value=>{const bytes=Buffer.from(JSON.stringify(value));res.setHeader('Content-Type','application/json');res.setHeader('Content-Length',bytes.length);res.end(bytes);return res;};
   handler(req,res).catch(error=>{errors.push(error.message);res.status(500).json({ok:false});});return;
  }
  if(url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'}).end(html);return;}
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(path.join(root,'assets')+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream'}).end(fs.readFileSync(file));
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 let driverName;if(browserName==='chrome'){browser=await chromium.launch({headless:true,channel:'chrome'});driverName='repository Playwright Chrome';}else({browser,driverName}=await launchOwnSyntheticBrowser());
 page=await browser.newPage({viewport:{width:1366,height:1000},acceptDownloads:true});page.on('pageerror',error=>errors.push(error.message));page.on('download',download=>downloads.push(download));page.on('request',request=>{assert.equal(new URL(request.url()).origin,origin,'Unexpected external request');});
 const box=()=>page.locator('[data-document-package]'),status=()=>box().locator('[role=status]'),start=()=>box().getByRole('button',{name:'Preparar y descargar PDF conjunto',exact:true}).click();
 async function prepare(nextMode,size=3){
  fixture=collectionFixture(size);mode=nextMode;reads=new Map();busyResponses=detailResponses=activeReads=maxReads=0;
  await page.goto(origin);await page.getByRole('button',{name:'Consultar liquidaciones',exact:true}).click();await page.getByLabel('Liquidación documental').selectOption(BATCH_DATASET);await page.getByRole('button',{name:'Aplicar selección',exact:true}).click();await page.locator('[data-batch-status]').filter({hasText:'Selección verificada'}).waitFor();
 }
 await prepare('busy-once',55);const download=page.waitForEvent('download');await start();const saved=await download,file=path.join(output,'complete-55.pdf');await saved.saveAs(file);await status().filter({hasText:'PDF conjunto descargado'}).waitFor();
 check(reads.size===55&&[...reads.values()].every(count=>count===3)&&busyResponses===55&&detailResponses===110,'55 initial SQL-busy conflicts retry the same URLs; every one of55 documents is then reread');
 check(fixture.perPerson.size===55&&[...fixture.perPerson.values()].every(count=>count===2)&&maxReads===3,'all55 documents retain both successful reads and the existing three-reader concurrency');
 const expectedFixture=collectionFixture(55),expected=createPayrollDocumentSetPdf(await collectPayrollDocuments({preview:await expectedFixture.preview(),request:expectedFixture.request,signal:new AbortController().signal}));
 check(fs.readFileSync(file).equals(Buffer.from(expected.bytes)),'downloaded55-document PDF is byte-identical to the complete canonical collection without contention');
 check((await status().innerText()).includes('55 documentos · 605 conceptos'),'UI reports every document and concept, including all pages');
 for(const width of [1366,390,320]){await page.setViewportSize({width,height:1000});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no document overflow at'+width);await box().screenshot({path:path.join(output,'complete-'+width+'.png')});}
 await prepare('busy-always');const beforeBusy=downloads.length;await start();await status().filter({hasText:'Otra consulta mantiene ocupada'}).waitFor();await page.waitForFunction(()=>document.querySelector('[data-document-package]')?.getAttribute('aria-busy')==='false');
 check(downloads.length===beforeBusy&&[...reads.values()].every(count=>count<=4)&&Math.max(...reads.values())===4,'persistent real-handler409 conflicts stop at four attempts per GET without any partial download');
 for(const rejection of ['forbidden','unauthenticated','source-changed']){
  await prepare(rejection);const before=downloads.length;await start();
  if(rejection==='source-changed')await status().filter({hasText:'Cambió la selección o su fuente'}).waitFor();else await page.locator('[data-batch-status]').filter({hasText:'Tu sesión no habilita'}).waitFor();
  check(downloads.length===before&&[...reads.values()].every(count=>count===1),'canonical HTTP '+rejection+' is terminal and never retried or downloaded');
 }
 await prepare('cancel');const cancelled=downloads.length,nextBusy=page.waitForResponse(response=>response.url().includes('resource=employeepayrolldetail')&&response.status()===409);await start();await nextBusy;await box().getByRole('button',{name:'Cancelar preparación',exact:true}).click();const afterCancel=[...reads.values()].reduce((sum,n)=>sum+n,0);await new Promise(resolve=>setTimeout(resolve,220));
 check(downloads.length===cancelled&&[...reads.values()].reduce((sum,n)=>sum+n,0)===afterCancel,'cancelling during real HTTP retry backoff prevents later reads and downloads');
 check(methods.every(method=>method==='GET')&&errors.length===0,'entire browser circuit uses only GET and has no unhandled product or handler error');
 report={passed:true,checks,driverName,actualHttpHandler:true,actualReader:true,actualPostgreSql:false,sqlTransportFixture:true,municipalSessions:0,municipalBusinessWrites:0,externalRequests:0,completeDocuments:55,completeConcepts:605,downloadedBytes:fs.statSync(file).size,retryPolicy:{maximumAttempts:4,delaysMs:[150,450,900],readDeadlineMs:25000,collectionDeadlineMs:300000},errors};
}catch(error){report={passed:false,checks,message:error.message,stack:error.stack,errors};if(page)await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});process.exitCode=1;}
finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
