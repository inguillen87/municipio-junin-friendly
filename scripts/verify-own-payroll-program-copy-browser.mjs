// Actual built copy UI and native model; authentication/API responses are synthetic.
// PostgreSQL governance and approval-to-calculation are tested by the existing UI suite.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {copyFixture} from '../tests/fixtures/own-payroll-program-copy-synthetic.js';
import {uid,hash} from '../tests/fixtures/own-payroll-program-synthetic.js';
import {ownProgramCommand,ownProgramRuleKey} from '../assets/own-payroll-program-model.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {PROGRAM_READ} from '../assets/own-payroll-program-workspace-model.js';

const root=path.resolve(import.meta.dirname,'..'),opts={};
for(const arg of process.argv.slice(2)){const m=/^--(output|browser)=(.+)$/.exec(arg);assert.ok(m);assert.equal(opts[m[1]],undefined);opts[m[1]]=m[2];}
assert.ok(['chrome','chromium'].includes(opts.browser));const output=path.resolve(opts.output);assert.ok(output.startsWith(path.join(root,'verification')+path.sep)&&!fs.existsSync(output));
const base=path.join(root,'public'),targets=Array.from({length:61},(_,i)=>String(i+2)),fixture=copyFixture(targets);
let boot=structuredClone(fixture.boot),revoked=false,lose=false,held=null,hold=false,requests=0,checks=0,report,browser;
const posts=[],committed=new Map(),errors=[],check=(value,label)=>{assert.ok(value,label);checks++;};
const sha=v=>createHash('sha256').update(salarySerialized(v)).digest('hex');
const auth=()=>({ok:true,authenticated:true,sessionVersion:2,user:{id:'qa-source',email:'qa@example.invalid'},expiresAt:new Date(Date.now()+3600000).toISOString(),access:{context:'tenant',tenant:{id:uid(1),roleKey:'COPY_QA'},tenantCapabilities:[...PROGRAM_READ,'payroll.parameter.prepare']}});
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost'),json=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 try {
  if(url.pathname==='/api/internal-auth'){requests++;json(200,auth());return;}
  if(url.pathname==='/api/internal-own-payroll-program'){
   if(revoked){json(403,{ok:false});return;}
   if(req.method==='POST'){
    let raw='';for await(const chunk of req)raw+=chunk;const parsed=JSON.parse(raw);assert.equal(parsed.operation,'command');const body=ownProgramCommand(parsed.payload,boot.salaryCatalog.items),key=req.headers['idempotency-key'];
    posts.push({key,raw});const existing=committed.get(key);if(existing)assert.equal(existing.requestSha256,sha(body));
    const receipt=existing??{version:'own-payroll-program.v1',eventId:uid(88),proposalId:uid(88),requestKey:key,requestSha256:sha(body),body,status:'pending',revision:1,programVersion:body.baseVersion,replayed:false,payrollCalculated:false,payrollPosted:false};committed.set(key,receipt);
    if(lose){lose=false;json(503,{ok:false});return;}json(200,{ok:true,data:{...receipt,replayed:!!existing}});return;
   }
   if(url.searchParams.get('resource')==='attempt'){const value=committed.get(url.searchParams.get('key'));json(value?200:404,value?{ok:true,data:value}:{ok:false,code:'OWN_PROGRAM_NOT_FOUND'});return;}
   assert.equal(url.searchParams.get('resource'),'bootstrap');if(hold){hold=false;await new Promise(resolve=>{held=resolve;});}json(200,{ok:true,data:boot});return;
  }
  if(url.pathname==='/qa.html'){
   res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fixture sintético de copia</title><style>body{margin:16px;font-family:system-ui}main{max-width:960px;margin:auto;min-width:0}</style><main id="qa"></main><script type="module">import {mountOwnPayrollProgram} from "/assets/own-payroll-program-panel.js";mountOwnPayrollProgram(document.getElementById("qa"));document.dispatchEvent(new CustomEvent("taskchange",{detail:{id:"reglas"}}));</script></html>');return;
  }
  const file=path.resolve(base,'.'+url.pathname);assert.ok(file.startsWith(base+path.sep));res.writeHead(200,{'Content-Type':file.endsWith('.css')?'text/css':'application/javascript'});fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
 }catch(error){errors.push(error.message);json(500,{ok:false});}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
try {
 browser=await chromium.launch({...(opts.browser==='chrome'?{channel:'chrome'}:{}),headless:true});const context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const $=key=>page.locator('[data-program-'+key+']');
 const settled=()=>page.waitForFunction(()=>document.querySelector('.own-program')?.getAttribute('aria-busy')==='false');
 const load=async()=>{await page.goto(origin+'/qa.html');await $('content').waitFor({state:'visible'});await settled();await $('copy').locator('summary').click();};
 const configure=async(agreements=targets,mode='add')=>{
  await $('copy-source').selectOption(fixture.intent.sourceKey);for(const agreement of agreements)await page.locator('[data-program-copy-target="'+agreement+'"]').check();
  await $('copy-from').fill('2026-10');await $('copy-mode').selectOption(mode);await $('copy-reference').fill('Cambio explícito sintético QA');
 };
 const preview=async()=>{await $('copy-preview').click();await settled();await $('copy-review').waitFor({state:'visible'});};
 await load();await configure();await preview();
 check(await $('copy-comparison').locator('tbody tr').count()===62,'review includes source and every one of 61 targets without pagination loss');
 check(posts.length===0&&await $('copy-apply').isDisabled(),'review sends no writes and requires explicit confirmation');
 await $('copy-from').fill('2026-11');check(await $('copy-review').isHidden(),'changing declared period invalidates the complete plan');await $('copy-from').fill('2026-10');await preview();
 await $('copy-confirm').check();await $('copy-apply').click();await settled();check(await $('rule-select').locator('option').count()===62&&posts.length===0,'apply changes only the full draft without saving or approving');
 check(await $('copy-review').isHidden()&&await $('send').isHidden(),'apply requires ordinary complete program review');
 await $('reason').fill('Propuesta sintética de todos los convenios');await $('prepare').click();check(await $('impact-table').locator('tbody tr').count()===62,'ordinary governance reviews all copied rules');
 await $('confirm').check();lose=true;await $('send').click();await settled();check(await $('fields').evaluate(el=>el.disabled)&&await $('copy-apply').isDisabled(),'lost response locks copy and preserves original attempt');
 await page.evaluate(()=>{document.querySelector('[data-program-copy-reference]').value='Cambio forzado posterior';});await $('send').click();await $('receipt').waitFor({state:'visible'});
 check(posts.length===2&&posts[0].key===posts[1].key&&posts[0].raw===posts[1].raw&&committed.size===1,'retry sends exact original body/key and produces one synthetic event');
 check(committed.values().next().value.body.program.rules.length===62,'existing command carries full copied program');
 boot=structuredClone(fixture.boot);await load();await configure(['2']);await preview();await $('copy-confirm').check();boot.salaryCatalog.version=hash('d');await $('copy-apply').click();await settled();
 check(await $('rule-select').locator('option').count()===1&&await $('copy-review').isHidden()&&(await $('status').innerText()).includes('Cambió'),'new catalog invalidates review without applying a partial copy');
 boot=structuredClone(fixture.boot);await load();await configure(['2']);await preview();await $('copy-confirm').check();boot.permissions.canPropose=false;await $('copy-apply').click();await settled();
 check(await $('rule-select').locator('option').count()===1&&await $('copy-review').isHidden(),'authoritative proposal permission revocation blocks applying');
 boot=structuredClone(fixture.boot);await load();await configure(['2']);await preview();revoked=true;await $('copy-confirm').check();await $('copy-apply').click();await settled();
 check(await $('content').isHidden()&&await $('copy-review').isHidden(),'API revocation clears all rules and the reviewed plan');revoked=false;
 boot=structuredClone(fixture.boot);await load();await configure(['2']);await preview();
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:[]}})));
 check(await $('content').isHidden()&&await $('copy-review').isHidden(),'permission event withdraws copy and private views');
 await load();await configure(['2']);hold=true;await $('copy-preview').click();await page.waitForFunction(()=>document.querySelector('.own-program').getAttribute('aria-busy')==='true');
 for(let n=0;!held&&n<60;n++)await new Promise(resolve=>setTimeout(resolve,20));assert.ok(held);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});held();held=null;
 await page.waitForTimeout(100);check(await $('content').isHidden()&&await $('copy-review').isHidden(),'hidden page cancels delayed review without repopulating');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
 boot=structuredClone(fixture.boot);boot.program.definition.rules.push({...structuredClone(boot.program.definition.rules[0]),agreementCode:'2'});await load();await configure(['2'],'replace');await preview();
 check((await $('copy-comparison').innerText()).includes('2026-09')&&await $('copy-comparison').locator('tbody tr').count()===3,'replacement review shows old closure and new rule beside original source');
 await $('copy-confirm').check();await $('copy-apply').click();await settled();check(await $('rule-select').locator('option').count()===3,'replacement preserves historical rule and adds new period');
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'copy fits '+width+'px');check(await page.locator('.own-program button:visible,.own-program summary:visible').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().height>=44)),'accessible control targets at '+width+'px');}
 await page.screenshot({path:output.replace(/\.json$/,'-mobile.png')});
 check(await page.evaluate(()=>![...Object.values(localStorage),...Object.values(sessionStorage)].some(v=>v.includes('606')||v.includes('own-payroll'))),'programs are not persisted in browser storage');
 check(posts.length===2&&errors.length===0,'no additional writes or browser/server exceptions');
 report={passed:true,checks,source:'actual built native copy UI',syntheticAuthentication:true,syntheticApi:true,actualPostgreSQL:false,parentPageVerifiedByExistingSuite:true,targets:61,reviewRows:62,posts:2,events:1,exactRetry:true,mobileWidths:[1440,390,320],municipalApproval:false,productionWrites:false,requests};await context.close();
}catch(error){report={passed:false,checks,error:error.message,errors,posts:posts.length};throw error;}
finally{held?.();await browser?.close();await new Promise(resolve=>server.close(resolve));fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(report));}
