// Isolated fictional preparation QA. No SQL transport, production or command.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {launchOwnSyntheticBrowser} from './lib/own-synthetic-browser.mjs';
import {OWN_RUN_READ,OWN_RUN_PREPARE} from '../assets/own-payroll-run-workspace-model.js';
import {ownPayrollReadiness,OWN_PAYROLL_READINESS_ROSTER_URL} from '../assets/own-payroll-readiness-model.js';
import {bootstrap,program,uid,hash} from '../tests/fixtures/own-payroll-program-synthetic.js';
import {roster} from '../tests/fixtures/native-roster-synthetic.js';
import {catalog as classification} from '../tests/fixtures/native-employee-synthetic.js';
import {CATALOG_VERSION} from '../assets/native-employment-catalog-model.js';

const root=path.resolve(import.meta.dirname,'..');
export const preparationProgramUrl='/api/internal-own-payroll-program?resource=bootstrap';
export const deferred=()=>Promise.withResolvers();
export function preparationFixture(){
 const directory=roster(1);directory.version='native-roster.v2';directory.counts.unknown=0;directory.rows=directory.rows.map(row=>({...row,recordKind:'hire'}));
 return {tenantId:directory.scope.tenantId,run:{version:'own-payroll-bootstrap.v2',scopeVersion:hash('a'),programVersion:hash('b'),canCalculate:true,runs:[],complete:true},program:bootstrap({program:{version:hash('b'),revision:1,definition:program(),salaryVersion:hash('c'),proposalId:uid(1),approvalId:uid(2)}}),roster:directory};
}
// This executes the exact trusted repository function, with controlled I/O.
// No source substitutions or supplied expressions are evaluated by the probe.
export function preparationProbe({request,session,tenantId,accessKey='synthetic-access',source=fs.readFileSync(path.join(root,'assets/own-payroll-run-panel.js'),'utf8')}){
 const start='  async function verifyPreparation(',end='  function openIndividual(',parts=source.split(start);assert.equal(parts.length,2,'Preparation function must remain unique');
 const tail=parts[1].split(end);assert.equal(tail.length,2,'Preparation boundary changed');
 const exactFunction='async function verifyPreparation('+tail[0];
 const factory=new Function('request','session','accessTenantId','access','OWN_RUN_READ','OWN_PAYROLL_READINESS_ROSTER_URL','ownPayrollReadiness','let readiness=null,readinessAccessKey=null;'+exactFunction+';return {verify:verifyPreparation,state:()=>({readiness,readinessAccessKey})};');
 return factory(request,session,tenantId,{key:accessKey},OWN_RUN_READ,OWN_PAYROLL_READINESS_ROSTER_URL,ownPayrollReadiness);
}

function json(res,status,payload){const bytes=Buffer.from(JSON.stringify(payload));res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Length':String(bytes.length),'X-Municontrol-Json-Bytes':String(bytes.length)});res.end(bytes);}
export async function verifyPreparationSequencing({output,browserMode='chromium'}){
 assert.ok(['chromium','chrome'].includes(browserMode));
 const destination=path.resolve(output);assert.ok(destination.startsWith(path.join(root,'verification')+path.sep)&&!fs.existsSync(destination),'Use a new verification result path');fs.mkdirSync(path.dirname(destination),{recursive:true});
 const fixture=preparationFixture(),capabilities=[...new Set([...OWN_RUN_PREPARE,'workforce.structure.read'])],programEntered=deferred(),programRelease=deferred();
 const requests=[],clientRequests=[],failures=[],errors=[],pending=new Set(),changed=new Set();let browser,server,origin,programActive=false,report,sequence=0,checks=0;
 const check=(value,label)=>{assert.ok(value,label);checks++;};
 const catalog={version:CATALOG_VERSION,scopeVersion:hash('a'),catalog:{items:classification.items.map((item,i)=>({...item,key:'fictional-'+i,agreementCode:item.agreementCode??null})),version:hash('d'),origin:'GRH',revision:0,publishedAt:null},permissions:{canPropose:true,canReview:true},proposals:[],historyTruncated:false};
 const csp="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'";
 async function serve(req,res){
  const url=new URL(req.url,origin??'http://127.0.0.1');res.setHeader('Content-Security-Policy',csp);
  if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
  if(url.pathname==='/qa.html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Preparación ficticia aislada</title><main id="qa"></main><script type="module">import {mountOwnPayrollRun} from "/assets/own-payroll-run-panel.js";mountOwnPayrollRun(document.getElementById("qa"));document.dispatchEvent(new CustomEvent("taskchange",{detail:{id:"calculo"}}));</script></html>');return;}
  if(url.pathname.startsWith('/api/')){
   const event={id:++sequence,method:req.method,path:url.pathname,resource:url.searchParams.get('resource'),programActive};requests.push(event);
   if(req.method!=='GET'){event.status=405;json(res,405,{ok:false,code:'QA_COMMAND_FORBIDDEN'});return;}
   if(url.pathname==='/api/internal-auth'){json(res,200,{ok:true,authenticated:true,sessionVersion:2,user:{id:uid(30),email:'fictional-preparation@example.invalid'},access:{context:'tenant',tenant:{id:fixture.tenantId,roleKey:'QA'},tenantCapabilities:capabilities},expiresAt:new Date(Date.now()+3600000).toISOString()});return;}
   if(url.pathname==='/api/internal-own-payroll-run'&&event.resource==='bootstrap'){json(res,200,{ok:true,data:fixture.run});return;}
   if(url.pathname==='/api/internal-employment-catalog'&&event.resource==='bootstrap'){json(res,200,{ok:true,data:catalog});return;}
   if(url.pathname==='/api/internal-own-payroll-program'&&event.resource==='bootstrap'){programActive=true;programEntered.resolve();await programRelease.promise;programActive=false;event.status=200;json(res,200,{ok:true,data:fixture.program});return;}
   if(url.pathname==='/api/internal-data'&&event.resource==='nativeroster'){
    assert.equal(url.pathname+url.search,OWN_PAYROLL_READINESS_ROSTER_URL,'Full canonical own roster query must remain unchanged');
    event.status=programActive?503:200;json(res,event.status,programActive?{ok:false,code:'INTERNAL_DATA_UNAVAILABLE',retryable:true,error:'Contención ficticia: el bootstrap sigue pendiente'}:{ok:true,data:fixture.roster});return;
   }
   errors.push('Unexpected API '+url.pathname);json(res,400,{ok:false,code:'QA_UNEXPECTED_READ'});return;
  }
  const assets=path.join(root,'assets'),file=path.resolve(root,'.'+url.pathname);
  if(req.method!=='GET'||!file.startsWith(assets+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()||!['.js','.css','.svg','.png'].includes(path.extname(file))){errors.push('Unexpected asset '+url.pathname);res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':{'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'}[path.extname(file)]});res.end(fs.readFileSync(file));
 }
 const notify=()=>{for(const resolve of [...changed])resolve();};
 async function drain(){const deadline=Date.now()+10000;while(pending.size){const remaining=deadline-Date.now();assert.ok(remaining>0,'Browser transport did not drain');await new Promise(resolve=>{let timer;const done=()=>{clearTimeout(timer);changed.delete(done);resolve();};changed.add(done);timer=setTimeout(done,remaining);});}}
 try{
  server=http.createServer((req,res)=>{serve(req,res).catch(error=>{errors.push(error.message);if(!res.headersSent)json(res,500,{ok:false,code:'QA_SERVER_FAILED'});else res.destroy(error);});});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
  browser=browserMode==='chrome'?await chromium.launch({channel:'chrome',headless:true}):(await launchOwnSyntheticBrowser()).browser;
  const context=await browser.newContext({viewport:{width:1366,height:1000},serviceWorkers:'block'}),page=await context.newPage();page.setDefaultTimeout(10000);
  page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{pending.add(request);const url=new URL(request.url());if(url.origin!==origin)errors.push('Non-loopback request');if(url.pathname.startsWith('/api/'))clientRequests.push({id:++sequence,path:url.pathname,resource:url.searchParams.get('resource')});notify();});page.on('requestfinished',request=>{pending.delete(request);notify();});page.on('requestfailed',request=>{pending.delete(request);failures.push({path:new URL(request.url()).pathname,error:request.failure()?.errorText});notify();});
  await page.goto(origin+'/qa.html');
  // The pending programme response is a controlled I/O gate, not a timer or a
  // database lock. One renderer task boundary exposes Promise.all's second GET.
  await Promise.race([programEntered.promise,page.waitForFunction(()=>document.querySelector('.own-run')?.getAttribute('aria-busy')==='false').then(()=>{throw Error('Programme read was never reached');})]);
  await page.evaluate(()=>document.readyState);const rosterStartedWhileProgramPending=clientRequests.some(event=>event.path==='/api/internal-data'&&event.resource==='nativeroster');
  programRelease.resolve();await page.waitForFunction(()=>document.querySelector('.own-run')?.getAttribute('aria-busy')==='false');await drain();
  report={synthetic:true,sqlExecuted:false,actualPanel:true,sourceSha256:createHash('sha256').update(fs.readFileSync(path.join(root,'assets/own-payroll-run-panel.js'))).digest('hex'),rosterStartedWhileProgramPending,requests,clientRequests,failures,errors};
  check(!rosterStartedWhileProgramPending,'Roster GET must wait until the programme read resolves');
  check(requests.filter(event=>event.path==='/api/internal-data').every(event=>!event.programActive&&event.status===200),'No readiness roster read enters the fictional busy window');
  check(await page.locator('[data-own-readiness]').getAttribute('data-state')==='success'&&await page.locator('[data-own-fields]').evaluate(element=>!element.disabled),'Actual panel enables preparation after both canonical complete reads');
  check(requests.every(event=>event.method==='GET'),'Preparation performs zero POSTs or automatic calculations');
  check(requests.filter(event=>event.path==='/api/internal-auth').length>=2,'Panel reauthorizes after reading programme and roster');
  for(const width of [1366,390,320]){await page.setViewportSize({width,height:1000});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Actual preparation fits '+width+'px');}
  assert.deepEqual(failures,[]);assert.deepEqual(errors,[]);report.passed=true;report.checks=checks;
 }catch(error){report={...report,passed:false,checks,message:error.message,synthetic:true,sqlExecuted:false,requests,clientRequests,failures,errors};}
 finally{programRelease.resolve();await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));fs.writeFileSync(destination,JSON.stringify(report,null,2));}
 return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args={};for(const value of process.argv.slice(2)){const match=/^--(output|browser)=(.+)$/.exec(value);assert.ok(match&&!Object.hasOwn(args,match[1]));args[match[1]]=match[2];}assert.ok(args.output);const result=await verifyPreparationSequencing({output:args.output,browserMode:args.browser??'chromium'});console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
}
