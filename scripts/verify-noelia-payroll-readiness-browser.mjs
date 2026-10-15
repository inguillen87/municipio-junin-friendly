// Built product panels over isolated loopback HTTP and fictional fixtures only.
// This checks browser behavior, never municipal data or human acceptance.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {chromium} from 'playwright';
import {launchOwnSyntheticBrowser} from './lib/own-synthetic-browser.mjs';
import {OWN_RUN_PREPARE} from '../assets/own-payroll-run-workspace-model.js';
import {OWN_RECEIPT_PREPARE,OWN_RECEIPT_APPROVE,ownReceiptParams} from '../assets/own-payroll-receipt-model.js';
import {OWN_CLOSE_WRITE} from '../assets/own-payroll-close-model.js';
import {CATALOG_VERSION} from '../assets/native-employment-catalog-model.js';
import {bootstrap,program,uid,hash} from '../tests/fixtures/own-payroll-program-synthetic.js';
import {roster} from '../tests/fixtures/native-roster-synthetic.js';
import {catalog as classification} from '../tests/fixtures/native-employee-synthetic.js';
import {capture,saved} from '../tests/fixtures/own-payroll-run-synthetic.js';
import {receiptPreview,receiptBatch} from '../tests/fixtures/own-payroll-receipt-synthetic.js';
import {closeDetail} from '../tests/fixtures/own-payroll-close-synthetic.js';
import {ownRunHash} from '../lib/internal-own-payroll-run.js';
import {municipalDocumentIssuerProfile} from '../lib/municipal-document-issuer.js';
import {createOwnReceiptPdf} from '../assets/own-payroll-receipt-pdf.js';

const build=path.resolve('public'),argument=process.argv.find(a=>a.startsWith('--output=')),browserArgument=process.argv.find(a=>a.startsWith('--browser='));
assert.ok(process.argv.slice(2).every(a=>a===argument||a===browserArgument)&&process.argv.filter(a=>a.startsWith('--output=')).length<=1&&process.argv.filter(a=>a.startsWith('--browser=')).length<=1,'Only --output= and --browser= are supported; this verifier never uses live browser or published APIs.');
const browserMode=browserArgument?.slice('--browser='.length)??'chromium';assert.ok(['chrome','chromium'].includes(browserMode),'Browser must be chrome or chromium.');
const output=path.resolve(argument?.slice('--output='.length)||'verification/noelia-payroll-readiness-browser-'+new Date().toISOString().replace(/[^0-9]/g,''));
assert.ok(!fs.existsSync(path.join(output,'result.json')),'Use a new output directory to preserve prior evidence.');
fs.mkdirSync(output,{recursive:true});
const files=['assets/own-payroll-run-panel.js','assets/own-payroll-readiness-model.js','assets/own-payroll-program-panel.js','assets/own-payroll-receipt-panel.js','assets/own-payroll-receipt-panel.css','assets/own-payroll-receipt-pdf.js','assets/own-payroll-close-panel.js','assets/own-payroll-close-panel.css','assets/own-payroll-run-panel.css'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),assets=files.map(file=>{assert.ok(fs.existsSync(path.join(build,file)),'Build missing '+file);return {file,sha256:sha(fs.readFileSync(path.join(build,file)))};});
const release=fs.existsSync(path.join(build,'release-info.json'))?JSON.parse(fs.readFileSync(path.join(build,'release-info.json'),'utf8')):null;
const capabilities=[...new Set([...OWN_RUN_PREPARE,...OWN_RECEIPT_PREPARE,...OWN_RECEIPT_APPROVE,...OWN_CLOSE_WRITE,'workforce.structure.read'])];
const tenantId=roster(1).scope.tenantId;
const approved=()=>({version:hash('b'),revision:1,definition:program(),salaryVersion:hash('c'),proposalId:uid(1),approvalId:uid(2)});
const ownRoster=count=>{const n=roster(count);n.version='native-roster.v2';n.counts.unknown=0;n.rows=n.rows.map(r=>({...r,recordKind:'hire'}));return n;};
const ownCatalog={version:CATALOG_VERSION,scopeVersion:hash('a'),catalog:{items:classification.items.map((r,i)=>({...r,key:'synthetic-'+i,agreementCode:r.agreementCode??null})),version:hash('d'),origin:'GRH',revision:0,publishedAt:null},permissions:{canPropose:true,canReview:true},proposals:[],historyTruncated:false};
const issuer=municipalDocumentIssuerProfile({tenantId},new Map([[tenantId,{id:'synthetic-browser-municipality',revision:1,issuer:{name:'Municipio de ensayo sintético',taxId:'30990000001',address:'Domicilio inventado 123'},source:{kind:'municipal_official_backup',label:'Respaldo ficticio para prueba local',cutoff:'2026-10-01T15:00:00',validityDeclared:false}}]]));
const calculated=capture();calculated.saved=saved(calculated);const conservedCapture=structuredClone(calculated);
const emptyClose={...closeDetail(1),rows:[],captures:[],groups:[],canWrite:true};
const state={programme:bootstrap({program:approved()}),roster:ownRoster(1),rosterError:false,showCapture:false,receiptCount:0,lastPreview:null,batch:receiptBatch(2),close:emptyClose};
const requests=[],checks=[],screenshots=[],errors=[],unexpectedRequests=[],requestFailures=[],downloads=[],requestDiagnostics=[],serverDiagnostics=[],transportDrains=[];let browser,page,driverName,origin,server,egressGuard;
const verifierSha256=sha(fs.readFileSync(new URL(import.meta.url)));
const pendingApiRequests=new Map(),pendingResponseCompletions=new Map(),transportWaiters=new Set();let transportPhase='initial',idleSequence=0;
function transportChanged(){for(const resolve of [...transportWaiters])resolve();}
function transportPending(){return {requests:[...pendingApiRequests.values()],responseCompletions:[...pendingResponseCompletions.values()]};}
async function drainApi(phase){
 transportPhase=phase;const startedAt=new Date().toISOString(),deadline=Date.now()+15000;
 while(pendingApiRequests.size||pendingResponseCompletions.size){
  const remaining=deadline-Date.now();assert.ok(remaining>0,'Synthetic API transport did not drain in '+phase+': '+JSON.stringify(transportPending()));
  await new Promise(resolve=>{let timer;const done=()=>{clearTimeout(timer);transportWaiters.delete(done);resolve();};transportWaiters.add(done);timer=setTimeout(done,remaining);});
 }
 const completedAt=new Date().toISOString(),failedCompletions=requestDiagnostics.filter(event=>event.event==='response-completion'&&event.completionError!==null);transportDrains.push({phase,startedAt,completedAt,requestsStarted:diagnosticSequence,requestFailures:requestFailures.length,failedResponseCompletions:failedCompletions.length,pendingRequests:pendingApiRequests.size,pendingResponseCompletions:pendingResponseCompletions.size});
 assert.deepEqual(requestFailures,[],'Synthetic request failure before completing '+phase);
 assert.deepEqual(failedCompletions,[],'Synthetic response body did not complete before '+phase);
}
const syntheticCsp="default-src 'self'; connect-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; worker-src 'none'";
const requestIds=new WeakMap();let diagnosticSequence=0,serverSequence=0;
function requestDiagnostic(request,event,detail={}){const url=new URL(request.url());if(!url.pathname.startsWith('/api/'))return null;if(!requestIds.has(request))requestIds.set(request,++diagnosticSequence);const value={id:requestIds.get(request),event,phase:transportPhase,at:new Date().toISOString(),method:request.method(),pathname:url.pathname,query:Object.fromEntries(url.searchParams),resourceType:request.resourceType(),documentUrl:request.frame()?.url()??null,...detail};requestDiagnostics.push(value);return value;}
function check(valid,label){assert.ok(valid,label);checks.push(label);}
// Frame the exact synthetic UTF-8 body before sending it. The real product
// reader verifies the announced byte count; no fetch/stream monkeypatch or
// request-failure exception is used to make transport diagnostics pass.
function json(res,status,payload){const bytes=Buffer.from(JSON.stringify(payload),'utf8');res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Length':String(bytes.length),'X-Municontrol-Json-Bytes':String(bytes.length)});res.end(bytes);}
const html=panel=>`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ensayo ficticio de preparación de nómina</title><style>html{font-size:16px}body{margin:16px;font-family:Arial,sans-serif;color:#17333c}main{max-width:1200px;margin:auto;min-width:0}</style><main id="qa"></main><script type="module">const host=document.getElementById('qa');const mode=${JSON.stringify(panel)};if(mode==='calculation'){const {mountOwnPayrollRun}=await import('/assets/own-payroll-run-panel.js');mountOwnPayrollRun(host);}else if(mode==='receipt'){const {mountOwnPayrollReceipts}=await import('/assets/own-payroll-receipt-panel.js');mountOwnPayrollReceipts(host);}else{const {mountOwnPayrollClose}=await import('/assets/own-payroll-close-panel.js');mountOwnPayrollClose(host);}document.dispatchEvent(new CustomEvent('taskchange',{detail:{id:mode==='calculation'?'calculo':mode==='receipt'?'recibos':'cierre'}}));</script></html>`;
async function handler(req,res){
 const url=new URL(req.url,'http://127.0.0.1'),pathname=url.pathname,method=req.method;
 if(pathname==='/favicon.ico'){res.writeHead(204);return res.end();}
 if(pathname==='/qa-egress-probe.html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end('<!doctype html><html lang="es"><title>Ensayo ficticio de bloqueo de egreso</title><p>Sin datos municipales.</p></html>');}
 if(pathname==='/qa.html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(html(url.searchParams.get('panel')));}
 if(pathname.startsWith('/api/')){
  const serverId=++serverSequence,diagnostic={serverId,pathname,method,query:Object.fromEntries(url.searchParams)};res.setHeader('X-Noelia-QA-Request-Id',String(serverId));serverDiagnostics.push({...diagnostic,event:'received',at:new Date().toISOString()});req.once('aborted',()=>serverDiagnostics.push({...diagnostic,event:'request-aborted',at:new Date().toISOString()}));res.once('finish',()=>serverDiagnostics.push({...diagnostic,event:'response-finished',at:new Date().toISOString(),status:res.statusCode,writableFinished:res.writableFinished}));res.once('close',()=>serverDiagnostics.push({...diagnostic,event:'response-closed',at:new Date().toISOString(),status:res.statusCode,writableFinished:res.writableFinished}));
  let bytes='';for await(const chunk of req)bytes+=chunk;const body=bytes?JSON.parse(bytes):null;
  requests.push({serverId,pathname,method,query:Object.fromEntries(url.searchParams),operation:body?.operation??null,key:req.headers['idempotency-key']??null,expectedUnavailableRead:pathname==='/api/internal-data'&&state.rosterError});
  if(pathname==='/api/internal-auth'&&method==='GET')return json(res,200,{ok:true,authenticated:true,sessionVersion:2,user:{id:uid(30),email:'synthetic-browser@example.invalid'},access:{context:'tenant',tenant:{id:tenantId,roleKey:'QA'},tenantCapabilities:capabilities},expiresAt:new Date(Date.now()+3600000).toISOString()});
  if(pathname==='/api/internal-employment-catalog'&&method==='GET')return json(res,200,{ok:true,data:ownCatalog});
  if(pathname==='/api/internal-own-payroll-program'&&method==='GET'&&url.searchParams.get('resource')==='bootstrap')return json(res,200,{ok:true,data:state.programme});
  if(pathname==='/api/internal-data'&&method==='GET'&&url.searchParams.get('resource')==='nativeroster')return state.rosterError?json(res,503,{ok:false,code:'SYNTHETIC_ROSTER_UNAVAILABLE',error:'Ensayo ficticio de respuesta no disponible'}):json(res,200,{ok:true,data:state.roster});
  if(pathname==='/api/internal-own-payroll-run'&&method==='GET'){
   if(url.searchParams.get('resource')==='attempt'&&url.searchParams.get('key')===calculated.key)return json(res,200,{ok:true,data:calculated});
   if(url.searchParams.get('resource')==='bootstrap')return json(res,200,{ok:true,data:{version:'own-payroll-bootstrap.v2',scopeVersion:hash('a'),programVersion:hash('b'),canCalculate:true,runs:state.showCapture?[{id:calculated.id,key:calculated.key,period:calculated.body.period,liquidationType:calculated.body.liquidationType,liquidationDate:null,selectionKind:calculated.body.selection.kind,selectionValueCount:calculated.body.selection.values.length,createdAt:calculated.createdAt,state:'calculated',inputSha256:calculated.saved.inputSha256,resultSha256:calculated.saved.resultSha256}]:[],complete:true}});
  }
  if(pathname==='/api/internal-own-payroll-receipts'){
   const resource=url.searchParams.get('resource');
   if(method==='GET'&&resource==='issuer')return json(res,200,{ok:true,data:issuer});
   if(method==='POST'&&body?.operation==='preview'){
    const value=receiptPreview(Math.max(1,state.receiptCount));value.snapshot.params=ownReceiptParams(body.params);
    if(state.receiptCount===0)Object.assign(value.snapshot,{records:[],sources:[],recordCount:0,conceptCount:0});
    value.snapshotSha256=ownRunHash(value.snapshot);state.lastPreview=structuredClone(value);return json(res,200,{ok:true,data:value});
   }
   if(method==='GET'&&resource==='list')return json(res,200,{ok:true,data:{version:'own-receipt-list.v1',scopeVersion:hash('a'),period:url.searchParams.get('period'),items:[{id:state.batch.id,preparedAt:state.batch.preparedAt,preparedBy:state.batch.preparedBy,recordCount:state.batch.snapshot.recordCount,types:state.batch.snapshot.params.types}]}});
   if(method==='GET'&&resource==='batch'&&url.searchParams.get('id')===state.batch.id)return json(res,200,{ok:true,data:state.batch});
  }
  if(pathname==='/api/internal-own-payroll-close'&&method==='GET'&&url.searchParams.get('resource')==='detail')return json(res,200,{ok:true,data:state.close});
  unexpectedRequests.push({pathname,method,operation:body?.operation??null});return json(res,400,{ok:false,error:'Operación no incluida en este ensayo ficticio'});
 }
 const file=path.resolve(build,'.'+pathname);
 if(method!=='GET'||!file.startsWith(build+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){unexpectedRequests.push({pathname,method});res.writeHead(404);return res.end();}
 res.writeHead(200,{'Content-Type':{'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'}[path.extname(file)]??'application/octet-stream'});res.end(fs.readFileSync(file));
}
server=http.createServer((req,res)=>{res.setHeader('Content-Security-Policy',syntheticCsp);return handler(req,res).catch(error=>{errors.push('Synthetic server: '+error.message);json(res,500,{ok:false,error:'Fallo del ensayo ficticio'});});});
const idle=async selector=>{await page.locator(selector).waitFor({state:'attached'});await page.waitForFunction(s=>document.querySelector(s)?.getAttribute('aria-busy')==='false',selector);await drainApi('idle-'+(++idleSequence)+':'+selector);};
const c=key=>page.locator('[data-own-'+key+']'),r=key=>page.locator('[data-receipt-'+key+']'),l=key=>page.locator('[data-close-'+key+']');
async function open(panel){await drainApi('before-navigation:'+panel);transportPhase='navigation:'+panel;await page.goto(origin+'/qa.html?panel='+panel);await idle({calculation:'.own-run',receipt:'.own-receipt',close:'.own-close'}[panel]);}
async function responsive(scenario){
 for(const width of [1366,390,320]){
  await page.setViewportSize({width,height:1000});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),scenario+' fits '+width+'px without document overflow');
  const targets=await page.locator('#qa .button,#qa input:not([type=checkbox]),#qa select').evaluateAll(elements=>elements.filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden').map(e=>({label:e.textContent?.trim().slice(0,80)||e.getAttribute('aria-label')||e.id,tag:e.tagName,height:e.getBoundingClientRect().height})));
  for(const target of targets)assert.ok(target.height>=43.9,scenario+' '+width+'px target below44px: '+JSON.stringify(target));
  check(targets.length>0,scenario+' has '+targets.length+' visible targets of at least44px at '+width+'px');
  const file=scenario+'-'+width+'.png';await page.screenshot({path:path.join(output,file),fullPage:true});screenshots.push(file);
 }
}
let outcome;
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 if(browserMode==='chrome'){browser=await chromium.launch({channel:'chrome',headless:true});driverName='repository Playwright '+createRequire(import.meta.url)('playwright/package.json').version+' / isolated headless Chrome channel';}else ({browser,driverName}=await launchOwnSyntheticBrowser());
 const context=await browser.newContext({viewport:{width:1366,height:1000},locale:'es-AR',serviceWorkers:'block',acceptDownloads:true});
 // No routing interception: Playwright turns predicate routes into a global
 // CDP interception pattern. This isolated server instead constrains resource
 // and connection origins with browser-enforced CSP, verified before the UI.
 const probePage=await context.newPage(),probeExternalResponses=[];probePage.on('response',response=>{if(new URL(response.url()).origin!==origin)probeExternalResponses.push(response.url());});
 const probeResponse=await probePage.goto(origin+'/qa-egress-probe.html');assert.equal(probeResponse.headers()['content-security-policy'],syntheticCsp);
 const probe=await probePage.evaluate(()=>new Promise(resolve=>{const timer=setTimeout(()=>resolve({blocked:false,error:'No CSP violation was observed'}),5000);document.addEventListener('securitypolicyviolation',event=>{if(event.effectiveDirective==='connect-src'){clearTimeout(timer);resolve({blocked:true,directive:event.effectiveDirective,blockedUri:event.blockedURI,disposition:event.disposition});}},{once:true});fetch('https://synthetic-egress.invalid/noelia-qa-egress-probe').catch(()=>{});}));
 assert.deepEqual(probeExternalResponses,[]);check(probe.blocked===true&&probe.directive==='connect-src'&&probe.disposition==='enforce'&&new URL(probe.blockedUri).origin==='https://synthetic-egress.invalid','Synthetic CSP blocks an external connection before transport without intercepting local API requests');egressGuard={mode:'browser_enforced_csp',policy:syntheticCsp,probe,externalResponses:probeExternalResponses};await probePage.close();
 page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(new URL(request.url()).origin!==origin)errors.push('Unexpected non-loopback browser request: '+request.url());const diagnostic=requestDiagnostic(request,'request-started');if(diagnostic)pendingApiRequests.set(diagnostic.id,diagnostic);transportChanged();});page.on('requestfinished',request=>{const diagnostic=requestDiagnostic(request,'request-finished');if(diagnostic)pendingApiRequests.delete(diagnostic.id);transportChanged();});page.on('response',response=>{
  const headers=response.headers(),request=response.request(),diagnostic=requestDiagnostic(request,'response-received',{status:response.status(),serverId:headers['x-noelia-qa-request-id']??null,contentLength:headers['content-length']??null,announcedJsonBytes:headers['x-municontrol-json-bytes']??null});
  if(diagnostic){pendingResponseCompletions.set(diagnostic.id,diagnostic);response.finished().then(error=>requestDiagnostic(request,'response-completion',{completionError:error?.message??null})).catch(error=>requestDiagnostic(request,'response-completion',{completionError:error.message})).finally(()=>{pendingResponseCompletions.delete(diagnostic.id);transportChanged();});}
 });page.on('requestfailed',request=>{const diagnostic=requestDiagnostic(request,'request-failed',{error:request.failure()?.errorText});if(diagnostic)pendingApiRequests.delete(diagnostic.id);requestFailures.push({url:new URL(request.url()).pathname,error:request.failure()?.errorText});transportChanged();});page.on('download',download=>downloads.push(download));

 state.roster=ownRoster(0);state.programme=bootstrap({salaryCatalog:{version:hash('c'),revision:0,items:[]}});await open('calculation');
 check(await c('fields').evaluate(e=>e.disabled)&&await c('send').isDisabled(),'New calculation fields and command are locked despite prepare permission when own roster is zero');
 check(await c('readiness-link').getAttribute('href')==='/personal#legajos','Zero complete own roster directs the operator to existing Personas route');
 check((await c('readiness-facts').innerText()).includes('0 legajos propios'),'Zero shown only from verified unfiltered complete own roster');
 await responsive('calculation-own-roster-empty');

 state.roster=ownRoster(1);await c('refresh').click();await idle('.own-run');check(await c('readiness-link').getAttribute('href')==='/nomina#parametros'&&await c('send').isDisabled(),'Unapproved salary catalogue directs to Parameters without a new capture');
 state.programme=bootstrap();await c('refresh').click();await idle('.own-run');check(await c('readiness-link').getAttribute('href')==='/nomina#reglas'&&await c('send').isDisabled(),'Unapproved programme directs to Rules without treating a proposal as approval');
 state.rosterError=true;await c('refresh').click();await idle('.own-run');check(/sin verificar/.test(await c('readiness-facts').innerText())&&!/0 legajos/.test(await c('readiness-facts').innerText())&&await c('fields').evaluate(e=>e.disabled),'HTTP503 yields unverified prerequisites, never zero population');
 check(await c('readiness-check').isVisible()&&await c('readiness-link').isHidden(),'Unavailable preparation offers a fresh verification, not a false adoption action');
 state.rosterError=false;state.programme=bootstrap({program:approved()});await c('refresh').click();await idle('.own-run');
 await c('period').fill('2026-10');await c('date').fill('2026-10-31');await c('type').selectOption('monthly');await c('kind').selectOption('all');await c('confirm').check();
 const beforeReads=requests.filter(q=>q.pathname==='/api/internal-data').length;state.roster.snapshot=hash('e');await c('send').click();await idle('.own-run');
 check(requests.filter(q=>q.pathname==='/api/internal-data').length===beforeReads+1&&!await c('confirm').isChecked(),'New command re-reads sources and changed roster requires another explicit review before creating an attempt');
 check(await c('recover').isHidden()&&requests.filter(q=>q.pathname==='/api/internal-own-payroll-run'&&q.method==='POST').length===0,'Changed preparation produces no request key or new payroll capture');
 state.showCapture=true;state.roster=ownRoster(0);state.programme=bootstrap();await c('refresh').click();await idle('.own-run');await page.locator('[data-own-open="'+calculated.key+'"]').click();await idle('.own-run');
 check(await c('result').isVisible()&&!await c('download').isDisabled(),'An existing conserved result remains recoverable even when new calculation prerequisites are absent');
 check(requests.some(q=>q.pathname==='/api/internal-own-payroll-run'&&q.query.resource==='attempt'&&q.query.key===calculated.key),'Recovery consults exactly the original request key');assert.deepEqual(calculated,conservedCapture);

 state.receiptCount=0;await open('receipt');check(await r('empty').isHidden()&&await r('signature').isHidden(),'Unconsulted receipt scope claims neither zero documents nor a signature problem');
 await r('period').fill('2026-10');await r('types').selectOption(['monthly']);await r('scope').selectOption('all');await r('consult').click();await idle('.own-receipt');
 check(await r('empty').isVisible()&&await r('result').isHidden()&&await r('pdf').isDisabled()&&await r('prepare').isDisabled(),'Verified empty receipt preview has no PDF or persistence command');
 check(await r('empty').locator('a.primary').getAttribute('href')==='/nomina#cierre'&&await r('signature').isHidden(),'Missing own closed results lead to closure; signature information is hidden for zero documents');
 check(/no son recibos propios/.test(await r('empty').innerText()),'Backup documentary consultation stays distinct from own receipt issuance');await responsive('receipt-own-closed-results-empty');

 state.receiptCount=2;await r('consult').click();await idle('.own-receipt');check(await r('empty').isHidden()&&await r('signature').isVisible()&&!await r('pdf').isDisabled(),'Nonempty unsigned preview preserves the real review-PDF action');
 check(/no requiere firma digital/.test(await r('signature').innerText()),'Signature guidance explains an unsigned review copy rather than blocking it');
 await page.setViewportSize({width:1366,height:1000});check(await page.evaluate(()=>Math.abs(document.querySelector('[data-receipt-date]').getBoundingClientRect().top-document.querySelector('[data-receipt-legend]').getBoundingClientRect().top)<=1),'Payment-date and legend input boxes are aligned on desktop');
 const downloading=page.waitForEvent('download');await r('pdf').click();const downloaded=await downloading;const pdfFile=path.join(output,'synthetic-unsigned-receipts.pdf');await downloaded.saveAs(pdfFile);await idle('.own-receipt');
 const pdf=await createOwnReceiptPdf(state.lastPreview.snapshot,{preview:true}),bytes=fs.readFileSync(pdfFile);assert.ok(bytes.equals(Buffer.from(pdf.bytes)),'Built browser PDF matches the canonical complete fixture PDF byte for byte');
 check(bytes.subarray(0,5).toString()==='%PDF-'&&pdf.recordCount===2,'Unsigned browser download contains the complete two-record canonical review PDF');await responsive('receipt-unsigned-preview');
 await r('history').click();await idle('.own-receipt');await r('list').locator('button').first().click();await idle('.own-receipt');check(!await r('pdf').isDisabled()&&await r('signature').isVisible(),'Conserved unsigned fixture batch retains its approved download authority');
 state.batch.sourceCurrent=false;state.batch.permissions.canDownload=false;await r('history').click();await idle('.own-receipt');await r('list').locator('button').first().click();await idle('.own-receipt');check(await r('pdf').isDisabled(),'Changed conserved receipt source continues to block download regardless of signature guidance');

 await open('close');await l('period').fill('2026-10');await l('type').selectOption('monthly');await l('consult').click();await idle('.own-close');
 check(await l('empty').isVisible()&&await l('detail').isHidden()&&await l('send').isDisabled(),'Empty complete closing period cannot register a municipal close decision');
 check(await l('empty').locator('a.primary').getAttribute('href')==='/nomina#calculo','Empty closing period guides back to actual calculation prerequisites');await responsive('close-own-period-empty');

 const rosterReads=requests.filter(q=>q.pathname==='/api/internal-data');check(rosterReads.every(q=>q.query.resource==='nativeroster'&&q.query.schema==='2'&&q.query.status==='all'&&['search','jurisdiction','organization','sector','agreement'].every(k=>q.query[k]==='')),'Every readiness roster read is explicit v2, complete and unfiltered');
 const businessCommands=requests.filter(q=>q.method!=='GET'&&!(q.pathname==='/api/internal-own-payroll-receipts'&&q.operation==='preview'));check(businessCommands.length===0,'No calculation, confirmation, annulment, closure, receipt conservation or approval commands were executed');
  await drainApi('final-proof');check(downloads.length===1,'Exactly one explicitly requested synthetic unsigned PDF was downloaded');assert.deepEqual(errors,[]);assert.deepEqual(unexpectedRequests,[]);assert.deepEqual(requestFailures,[]);
 const programmeReads=requestDiagnostics.filter(q=>q.event==='request-started'&&q.pathname==='/api/internal-own-payroll-program');
 for(const q of programmeReads){const events=requestDiagnostics.filter(e=>e.id===q.id),response=events.find(e=>e.event==='response-received');assert.equal(response?.status,200,'Programme bootstrap returned its complete synthetic JSON');assert.ok(/^[1-9][0-9]*$/.test(response.contentLength)&&response.contentLength===response.announcedJsonBytes,'Programme bootstrap used explicit matching UTF-8 body framing');assert.ok(events.some(e=>e.event==='request-finished')&&events.some(e=>e.event==='response-completion'&&e.completionError===null),'Programme bootstrap completed without a discarded network failure');assert.ok(serverDiagnostics.some(e=>String(e.serverId)===response.serverId&&e.event==='response-finished'&&e.status===200&&e.writableFinished),'Programme bootstrap retained its matching finished server response');}
 check(programmeReads.length>0,'Every programme read completed with exact body framing, native product parsing and no request-failure exception');
 for(const asset of assets)assert.equal(sha(fs.readFileSync(path.join(build,asset.file))),asset.sha256,'Built asset changed during browser verification: '+asset.file);
  outcome={ok:true,mode:'local_built_assets_synthetic_http',syntheticOnly:true,syntheticAuth:true,syntheticAPI:true,actualBuiltPanels:true,actualSql:false,municipalSessionTested:false,municipalAcceptance:false,privateApiRequests:0,productiveBusinessWrites:0,businessCommandCount:0,receiptPreviewRequests:requests.filter(q=>q.operation==='preview').length,apiGetRequests:requests.filter(q=>q.method==='GET').length,expectedUnavailableReads:rosterReads.filter(q=>q.expectedUnavailableRead).length,programmeReadsCompleted:programmeReads.length,nativeFetchUnmodified:true,routingInterception:false,egressGuard,driverName,verifierSha256,transportDrains,transportPending:transportPending(),buildRelease:release,assets,checksPassed:checks.length,checks,widths:[1366,390,320],screenshots,pdf:{file:path.basename(pdfFile),recordCount:pdf.recordCount,pageCount:pdf.pageCount,sha256:sha(bytes),unsigned:true,byteIdenticalToCanonicalFixture:true},errors,unexpectedRequests,requestFailures,requestDiagnostics,serverDiagnostics};
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(outcome,null,2)+'\n');console.log(JSON.stringify({ok:true,output,checksPassed:checks.length,businessCommandCount:0,productiveBusinessWrites:0,pdf:outcome.pdf},null,2));
}catch(error){
 if(page&&!page.isClosed())await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});
  fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({ok:false,syntheticOnly:true,error:error.message,checksPassed:checks.length,checks,assets,errors,unexpectedRequests,requestFailures,requestDiagnostics,serverDiagnostics,egressGuard,driverName:driverName??null,verifierSha256,transportDrains,transportPending:transportPending(),businessCommandCount:requests.filter(q=>q.method!=='GET'&&!(q.pathname==='/api/internal-own-payroll-receipts'&&q.operation==='preview')).length,productiveBusinessWrites:0},null,2)+'\n');throw error;
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
