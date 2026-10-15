// Real source UI and WebCrypto over isolated loopback HTTP. Invented API
// fixtures only: no PostgreSQL, authenticated user Chrome or municipal action.
import fs from'node:fs';import path from'node:path';import http from'node:http';import assert from'node:assert/strict';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';
import{launchOwnSyntheticBrowser}from'./lib/own-synthetic-browser.mjs';
import{auxiliarySources}from'../tests/fixtures/own-payroll-auxiliary-synthetic.js';
import{periodContextSources,periodContextCaptureFixture}from'../tests/fixtures/own-payroll-period-context-synthetic.js';
import{OWN_RUN_PREPARE}from'../assets/own-payroll-run-workspace-model.js';
import{uid}from'../tests/fixtures/own-payroll-program-synthetic.js';
const root=fs.realpathSync(new URL('..',import.meta.url)),sha=v=>createHash('sha256').update(v).digest('hex');
export async function verifyPeriodContextBrowser({output}){
 assert.match(output,/^verification[\\/][A-Za-z0-9_.-]+$/);assert.ok(!fs.existsSync(path.join(root,output)),'PERIOD_CONTEXT_BROWSER_OUTPUT_EXISTS');fs.mkdirSync(path.join(root,output));
 const directory=path.join(root,output),checks=[],errors=[],failed=[],inflight=new Set(),reads=[],commands=[];let scenario='legacy',browser;
 const check=(condition,name)=>{assert.ok(condition,name);checks.push(name);};
 const serve=(res,status,contentType,body)=>{const bytes=Buffer.from(body);res.writeHead(status,{'Content-Type':contentType,'Content-Length':bytes.length,'Cache-Control':'no-store','Connection':'close'});res.end(bytes);};
 const html='<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mes del período: fixture sintético</title><style>body{margin:16px;font-family:system-ui}main{max-width:960px;margin:auto;min-width:0}</style><main id="qa"></main><script type="module">import{mountOwnPayrollProgram}from"/assets/own-payroll-program-panel.js";mountOwnPayrollProgram(document.getElementById("qa"));document.dispatchEvent(new CustomEvent("taskchange",{detail:{id:"reglas"}}));</script></html>';
 const server=http.createServer((req,res)=>{try{
  const url=new URL(req.url,'http://127.0.0.1');if(req.method!=='GET'){commands.push({method:req.method,path:url.pathname});return serve(res,405,'application/json','{"ok":false}');}
  if(url.pathname.startsWith('/api/')){
   reads.push(url.pathname+url.search);let payload;
   if(url.pathname==='/api/internal-auth')payload={ok:true,authenticated:true,sessionVersion:2,user:{id:uid(1),email:'qa@example.invalid'},access:{context:'tenant',tenant:{id:uid(2),roleKey:'SYNTHETIC'},tenantCapabilities:[...new Set([...OWN_RUN_PREPARE,'payroll.parameter.prepare','payroll.parameter.approve'])]},expiresAt:new Date(Date.now()+3600000).toISOString()};
   else if(url.pathname==='/api/internal-own-payroll-program'&&url.searchParams.get('resource')==='bootstrap')payload={ok:true,data:(scenario==='legacy'?auxiliarySources():periodContextSources()).programState};
   else return serve(res,404,'application/json','{"ok":false}');
   return serve(res,200,'application/json',JSON.stringify(payload));
  }
  if(url.pathname==='/qa.html')return serve(res,200,'text/html; charset=utf-8',html);
  if(url.pathname==='/favicon.ico')return serve(res,204,'image/x-icon','');
  if(url.pathname==='/qa-captures.json')return serve(res,200,'application/json',JSON.stringify(['2026-09','2026-12','2028-02'].map(period=>periodContextCaptureFixture(period,'2099-01-01'))));
  const file=path.resolve(root,'.'+url.pathname);if(!url.pathname.startsWith('/assets/')||!file.startsWith(path.join(root,'assets')+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return serve(res,404,'text/plain','');
  serve(res,200,{'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[path.extname(file)]??'application/octet-stream',fs.readFileSync(file));
 }catch(e){errors.push(e.stack);serve(res,500,'application/json','{"ok":false}');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 try{
  const launched=await launchOwnSyntheticBrowser();browser=launched.browser;const context=await browser.newContext({locale:'es-AR',viewport:{width:1366,height:1100},serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());const page=await context.newPage();page.setDefaultTimeout(15000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>inflight.add(r));page.on('requestfinished',r=>inflight.delete(r));page.on('requestfailed',r=>{inflight.delete(r);failed.push({url:r.url(),error:r.failure()?.errorText});});
  const p=key=>page.locator('[data-program-'+key+']'),f=key=>page.locator('[data-program-field="'+key+'"]');
  const idle=()=>page.waitForFunction(()=>document.querySelector('.own-program')?.getAttribute('aria-busy')==='false');
  const fresh=async()=>{await page.goto(origin+'/qa.html');await p('content').waitFor({state:'visible'});await idle();};
  await fresh();check(!await p('period-context').isChecked(),'ordinary programme has no implicit period-context opt-in');check(!await p('period-context').isDisabled(),'preparer can explicitly select the source in a draft');
  check((await p('period-context').locator('..').innerText()).trim()==='Mes del período','checkbox uses the municipal label');check(await page.getByText('Usa el mes que elegís para liquidar, aunque la fecha sea de otro mes.').isVisible(),'help explains declared period independently of date');
  check(!await f('binding-source').locator('option[value="period_context_fact"]').count(),'month source unavailable before explicit opt-in');
  await p('period-context').check();check(await f('binding-source').locator('option[value="period_context_fact"]').count()===1,'explicit draft opt-in makes the native month source available');
  check(await p('send-box').isHidden()&&commands.length===0,'selecting the option neither approves nor submits the programme');
  await f('binding-source').selectOption('period_context_fact');await f('binding-period-context').selectOption('monthNumber');
  check(await f('binding-unit').inputValue()==='units'&&await f('binding-missing').inputValue()==='error'&&await f('binding-combine').inputValue()==='single','month binding preserves exact units, single value and required source');
  check(await f('binding-unit').locator('option:checked').innerText()==='Mes','month unit is named in Spanish');
  scenario='approved';await fresh();check(await p('period-context').isChecked()&&await p('period-context').isDisabled(),'approved explicit source cannot be silently retired');
  const data=periodContextSources(),index=data.programState.program.definition.bindings.findIndex(b=>b.sourceKind==='period_context_fact');await p('binding-select').selectOption(String(index));
  check(await f('binding-period-context').inputValue()==='monthNumber','editor restores the approved month binding');
  const verified=await page.evaluate(async()=>{const{verifiedWorkspaceCapture}=await import('/assets/own-payroll-run-workspace-model.js');const values=await(await fetch('/qa-captures.json',{cache:'no-store'})).json();const rows=[];for(const c of values){await verifiedWorkspaceCapture(c);rows.push({period:c.body.period,liquidationDate:c.body.liquidationDate,month:c.payload.periodContext.monthNumber,value:c.saved.input.employees[0].inputs.find(i=>i.key==='periodMonth').value,amount:c.saved.result.rows.find(r=>r.conceptCode==='95').amount});}return rows;});
  check(JSON.stringify(verified.map(r=>[r.period,r.month,r.value,r.amount]))===JSON.stringify([['2026-09','9','9','1.11'],['2026-12','12','12','2.22'],['2028-02','2','2','2.22']]),'browser WebCrypto validates captured source and exact saved results for three declared months');
  check(verified.every(r=>r.liquidationDate==='2099-01-01'),'different declared liquidation date never supplies the month');
  for(const width of[1366,390,320]){await page.setViewportSize({width,height:1000});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'source editor fits '+width+'px');check(await p('prepare').evaluate(e=>e.getBoundingClientRect().height>=44),'review target remains44px at '+width+'px');await f('binding-period-context').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(directory,'period-context-'+width+'.png'),fullPage:true});}
  check(!await page.evaluate(()=>Object.values({...localStorage,...sessionStorage}).some(v=>v.includes('periodMonth')||v.includes('periodContextVersion'))),'source and programme are not stored in browser storage');
  await page.waitForFunction(()=>document.querySelector('.own-program')?.getAttribute('aria-busy')==='false');const deadline=performance.now()+5000;while(inflight.size&&performance.now()<deadline)await new Promise(r=>setTimeout(r,10));
  check(inflight.size===0,'all real HTTP requests drained before closing');check(commands.length===0,'synthetic fixture issues zero business commands');assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  const proof={version:'own-payroll-period-context-browser.v1',ok:true,sourceMode:'workspace_source_assets',syntheticApiOnly:true,realSql:false,municipalAcceptance:false,driver:launched.driverName,checksPassed:checks.length,checks,commands:0,errors,failed,pendingRequests:inflight.size,reads:reads.length,sourceContextSha256:sha(fs.readFileSync(path.join(root,'assets/own-payroll-period-context.js'))),screenshots:[1366,390,320].map(w=>'period-context-'+w+'.png')};
  fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(proof,null,2)+'\n');return proof;
 }catch(e){fs.writeFileSync(path.join(directory,'failure.json'),JSON.stringify({ok:false,error:e.stack,checks,errors,failed,commands,pendingRequests:inflight.size},null,2)+'\n');throw e;}
 finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===fs.realpathSync(process.argv[1])){const match=/^--output=(verification[\\/][A-Za-z0-9_.-]+)$/.exec(process.argv[2]??'');assert.ok(match&&process.argv.length===3);try{console.log(JSON.stringify(await verifyPeriodContextBrowser({output:match[1]})));}catch(e){console.error(e.stack);process.exitCode=1;}}
