// Real editor and HTTP handler; intercepted SQL responses and invented data only.
// This verifier never connects to PostgreSQL or a live municipal service.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createOwnProgramHandler} from '../api/internal-own-payroll-program.js';
import {launchOwnSyntheticBrowser} from './lib/own-synthetic-browser.mjs';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {ownProgramCommand,ownProgramDefinition} from '../assets/own-payroll-program-model.js';
import {monthlyDayWorkspaceBootstrap,monthlyDayWorkspaceProgram,monthlyDayWorkspaceApproved,monthlyDayWorkspacePolicy,uid,hash} from '../tests/fixtures/own-monthly-day-program-workspace-synthetic.js';

const root=path.resolve(import.meta.dirname,'..');
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const match=/^--(output)=(.+)$/.exec(arg);assert.ok(match,'Only --output is accepted');return[match[1],match[2]];}));
const output=path.resolve(args.output??path.join(root,'verification/own-monthly-day-program-ui.json'));
assert.ok(output.startsWith(path.join(root,'verification')+path.sep)&&!fs.existsSync(output),'Use a new verification result inside the candidate stage');
fs.mkdirSync(path.dirname(output),{recursive:true});
const origin='http://127.0.0.1:4392',caps=['workforce.employee.read','payroll.parameter.read','payroll.parameter.prepare','payroll.parameter.approve'];
const session={email:'monthly-editor@example.invalid',id:uid(3),version:2,releaseSha:'d'.repeat(40)};
const principal=()=>({user:{email:session.email},tenant:{source:'membership',id:uid(1),membershipId:uid(2),effectiveCapabilities:denied?[]:caps}});
const sha=value=>createHash('sha256').update(salarySerialized(value)).digest('hex');
let boot=monthlyDayWorkspaceBootstrap(),denied=false,lose=false,receipt=null,posts=0,reads=0,recoveries=0,externalRequests=0;
const writes=[],sqlCalls=[],errors=[],checks=[],layouts=[];
const handler=createOwnProgramHandler({env:{INTERNAL_APP_ORIGIN:origin},requireAccess:async()=>({mode:'managed',principal:principal()}),sessionFor:()=>session,getSql:async()=>({query:async(query,values)=>{
 const context=JSON.parse(values[0]);assert.equal(context.tenantId,uid(1));assert.equal(context.membershipId,uid(2));assert.equal(context.actorEmail,session.email);
 sqlCalls.push(query);
 if(query==='SELECT public.own_program_bootstrap_v1($1::jsonb) AS result'){assert.equal(values.length,1);reads++;return[{result:structuredClone(boot)}];}
 if(query==='SELECT public.own_program_attempt_v1($1::jsonb,$2::uuid) AS result'){assert.equal(values.length,2);assert.ok(receipt);assert.equal(values[1],receipt.requestKey);recoveries++;return[{result:{...structuredClone(receipt),replayed:true}}];}
 assert.equal(query,'SELECT public.own_program_command_v1($1::jsonb,$2::jsonb,$3::uuid) AS result');assert.equal(values.length,3);
 const body=ownProgramCommand(JSON.parse(values[1]));assert.equal(body.command,'propose');assert.equal(body.baseVersion,boot.program.version);assert.equal(body.scopeVersion,boot.scopeVersion);assert.equal(body.salaryVersion,boot.salaryCatalog.version);
 ownProgramDefinition(body.program,boot.salaryCatalog.items);
 writes.push({body:structuredClone(body),key:values[2]});
 receipt={version:'own-payroll-program.v1',eventId:uid(901),proposalId:uid(901),requestKey:values[2],requestSha256:sha(body),body,status:'pending',revision:boot.program.revision,programVersion:body.baseVersion,replayed:false,payrollCalculated:false,payrollPosted:false};
 if(lose){lose=false;throw Error('SYNTHETIC_ACK_LOST');}return[{result:structuredClone(receipt)}];
}})});
const harness=`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Editor mensual — QA sintética</title><style>body{margin:0;font:16px system-ui,sans-serif;background:#f4f7f6}main{max-width:1200px;margin:0 auto;padding:12px;box-sizing:border-box}main>*{min-width:0}</style><main></main><script type="module">import {mountOwnPayrollProgram} from '/assets/own-payroll-program-panel.js';mountOwnPayrollProgram(document.querySelector('main'));document.dispatchEvent(new CustomEvent('taskchange',{detail:{id:'reglas'}}));</script></html>`;
let browser,page,driverName,report;
const check=(condition,label)=>{assert.ok(condition,label);checks.push(label);};
try{
 ({browser,driverName}=await launchOwnSyntheticBrowser());
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'es-AR',serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin!==origin){externalRequests++;return route.abort();}
  if(url.pathname==='/nomina')return route.fulfill({contentType:'text/html',body:harness});
  if(url.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,sessionVersion:2,user:{id:'monthly-editor-synthetic',email:session.email,role:'QA'},expiresAt:new Date(Date.now()+3600000).toISOString(),access:{context:'tenant',tenant:{id:uid(1),roleKey:'QA'},tenantCapabilities:denied?[]:caps,platformCapabilities:[],platformRoles:[]}}});
  if(url.pathname==='/api/internal-own-payroll-program'){
   if(req.method()==='POST')posts++;
   let status=200,payload;await handler({method:req.method(),url:url.pathname+url.search,query:Object.fromEntries(url.searchParams),headers:req.headers(),body:req.postData()},{setHeader(){},status(value){status=value;return this;},json(value){payload=value;return this;}});
   return route.fulfill({status,json:payload});
  }
  if(url.pathname.startsWith('/api/'))return route.fulfill({status:403,json:{ok:false,error:'Only the synthetic programme handler is admitted'}});
  if(req.method()!=='GET'||!url.pathname.startsWith('/assets/'))return route.abort();
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(path.join(root,'assets')+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
  return route.fulfill({contentType:{'.js':'text/javascript','.css':'text/css'}[path.extname(file)]??'application/octet-stream',body:fs.readFileSync(file)});
 });
 page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
 const panel=page.locator('.own-program'),$=key=>panel.locator('[data-program-'+key+']'),field=key=>panel.locator('[data-program-field="'+key+'"]');
 const ready=()=>page.waitForFunction(()=>document.querySelector('.own-program')?.getAttribute('aria-busy')==='false');
 async function load(value=monthlyDayWorkspaceBootstrap()){
  boot=structuredClone(value);denied=false;receipt=null;await page.goto(origin+'/nomina?case='+checks.length+'#reglas');await $('content').waitFor({state:'visible'});await ready();
  await page.waitForFunction(()=>document.querySelector('link[data-own-program-style]')?.sheet);check(await $('fields').getAttribute('disabled')===null&&await $('add-rule').isEnabled(),'approved synthetic catalogue permits the editor');
 }
 async function fillExpression(expression,steps=[]){
  const op=panel.locator('[data-program-expression-path="'+steps.join('.')+'"]');await op.selectOption(expression.op);
  const prefix='expression-'+(steps.join('-')||'root');
  if(['input','literal'].includes(expression.op))await field(prefix+'-unit').selectOption(expression.unit);
  if(expression.op==='input')await field(prefix+'-key').fill(expression.key);
  if(expression.op==='literal')await field(prefix+'-value').fill(expression.value);
  for(const child of ['left','right','value','condition','then','else'])if(expression[child]&&typeof expression[child]==='object')await fillExpression(expression[child],[...steps,child]);
 }
 async function addBinding(binding){
  await $('add-binding').click();await field('binding-agreement').fill(binding.agreementCode);await field('binding-key').fill(binding.key);await field('binding-source').selectOption(binding.sourceKind);
  await field(binding.sourceKind==='monthly_day_fact'?'binding-monthly-days':'binding-period').selectOption(binding.sourceField);
  await field('binding-unit').selectOption(binding.unit);await field('binding-missing').selectOption(binding.onMissing);await field('binding-combine').selectOption(binding.combine);await field('binding-reference').fill(binding.ruleReference);
 }
 async function prepareNormalDraft(){
  const fixture=monthlyDayWorkspaceProgram();
  await $('namespaces').check();check(await $('monthly-days').isDisabled(),'monthly days require participation as well as namespaces');
  await $('participation').check();await $('fixed-validity').selectOption('reject');check(await $('monthly-days').isEnabled(),'explicit namespaces and participation enable monthly opt-in');
  await $('monthly-days').check();check(await $('monthly-days-panel').isVisible(),'opting in shows the whole monthly policy');
  check(await $('monthly-days-reference').inputValue()==='','a policy reference is never invented');
  check((await $('monthly-days-panel').innerText()).includes('30'),'the fixed full-month basis is visible');
  await $('monthly-days-reference').fill(fixture.monthlyDaysPolicy.reference);await $('precision').selectOption('2');
  for(const binding of fixture.bindings)await addBinding(binding);
  const rule=fixture.rules[0];await $('add-rule').click();
  for(const [key,value,select] of [['agreementCode',rule.agreementCode,false],['code',rule.code,false],['nature',rule.nature,true],['unit',rule.unit,true],['validFrom',rule.validFrom,false],['ruleReference',rule.ruleReference,false]]){if(select)await field(key).selectOption(value);else await field(key).fill(value);}
  await panel.locator('[data-program-type="monthly"]').check();await field('result-precision').selectOption('2');await field('result-rounding').selectOption('exact');
  await field('period-treatment').selectOption('declared_formula');await field('period-reference').fill(fixture.periodParticipation.treatments[0].reference);
  await fillExpression(rule.expression);await $('reason').fill('Conjunto aritmético sintético completo para revisión QA');
  return fixture;
 }
 async function review(){await $('prepare').click();await ready();}
 await load();check(await $('monthly-days').isDisabled()&&await $('monthly-days-panel').isHidden(),'programme zero does not silently enable a monthly policy');
 await $('add-binding').click();check(await field('binding-source').locator('option[value="monthly_day_fact"]').count()===0,'legacy draft has no implicit monthly-day source');
 await panel.getByRole('button',{name:'Retirar esta entrada de la preparación',exact:true}).click();
 const fixture=await prepareNormalDraft();
 await $('monthly-days-reference').fill('');await review();check(await $('send-box').isHidden()&&posts===0,'blank policy reference rejects before any POST');
 await $('monthly-days-reference').fill(fixture.monthlyDaysPolicy.reference);
 await $('binding-select').selectOption('0');await field('binding-monthly-days').selectOption('');await review();check(await $('send-box').isHidden()&&posts===0,'missing day component rejects before any POST');
 await field('binding-monthly-days').selectOption(fixture.bindings[0].sourceField);
 await panel.locator('[data-program-type="sac"]').check();await $('rule-select').selectOption('0');await field('period-treatment').selectOption('declared_formula');await field('period-reference').fill(fixture.periodParticipation.treatments[0].reference);
 await review();check(await $('send-box').isHidden()&&posts===0&&(await $('status').innerText()).includes('Sólo una regla mensual'),'mixed monthly and SAC is specifically rejected before any POST');
 await panel.locator('[data-program-type="sac"]').uncheck();
 // Re-render the rule so its treatment identity follows the explicit type list.
 await $('rule-select').selectOption('0');await field('period-treatment').selectOption('declared_formula');await field('period-reference').fill(fixture.periodParticipation.treatments[0].reference);
 for(const sourceField of ['recognizedUnits','baseUnits'])await addBinding({agreementCode:'1',key:sourceField,sourceKind:'period_fact',sourceField,unit:'units',onMissing:'error',combine:'single',ruleReference:'Componente inventado de participación QA'});
 await field('period-treatment').selectOption('fraction');await review();check(await $('send-box').isHidden()&&posts===0&&(await $('status').innerText()).includes('otra fracción'),'double fraction is rejected specifically before any POST');
 await field('period-treatment').selectOption('declared_formula');
 for(let i=0;i<2;i++){await $('binding-select').selectOption(String(fixture.bindings.length));await panel.getByRole('button',{name:'Retirar esta entrada de la preparación',exact:true}).click();}
 await review();await $('send-box').waitFor({state:'visible'});check(posts===0,'a complete normal editor draft reaches review without a write');
 const comparison=await panel.locator('[data-program-monthly-days-comparison]').innerText();
 check(comparison.includes(fixture.monthlyDaysPolicy.reference)&&comparison.includes(fixture.monthlyDaysVersion)&&comparison.includes(fixture.monthlyDaysPolicy.version)&&comparison.includes('30'),'comparison preserves policy, facts version and policy version');
 await $('confirm').check();await $('monthly-days-reference').fill('Referencia modificada expresamente en QA');
 check(await $('send-box').isHidden()&&!(await $('confirm').isChecked())&&await $('send').isDisabled(),'changing only the policy reference invalidates review and acknowledgment');
 check(await field('code').inputValue()==='9100'&&await $('reason').inputValue()==='Conjunto aritmético sintético completo para revisión QA','policy change preserves rule and reason drafts');
 await $('monthly-days-reference').fill(fixture.monthlyDaysPolicy.reference);await review();await $('confirm').check();
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:1000});await page.evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
  const measurements=await $('monthly-days-reference').evaluate(element=>{const rect=element.getBoundingClientRect();return {height:rect.height,left:rect.left,right:rect.right};});layouts.push({width,...measurements});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'editor fits viewport '+width);check(measurements.height>=44&&measurements.left>=0&&measurements.right<=width,'policy reference is accessible at '+width);
  await $('monthly-days-panel').screenshot({path:output.replace(/\.json$/,'')+'-'+width+'.png'});
 }
 await page.setViewportSize({width:1440,height:1000});lose=true;await $('send').click();await ready();
 check(posts===1&&writes.length===1,'only an explicit complete proposal sends one synthetic POST');
 const original=structuredClone(writes[0]);check(salarySerialized(original.body.program)===salarySerialized(fixture),'handler receives the whole explicitly authored programme');
 check(salarySerialized(original.body.program.monthlyDaysPolicy)===salarySerialized(monthlyDayWorkspacePolicy())&&original.body.program.rules[0].liquidationTypes.join('|')==='monthly','normal proposal preserves policy, source fields and monthly-only rule');
 check(await $('fields').getAttribute('disabled')!==null&&await $('monthly-days-reference').isDisabled()&&await $('monthly-days').isDisabled()&&await $('recover').isVisible(),'uncertain response locks policy and original draft');
 await $('recover').click();await $('receipt').waitFor({state:'visible'});
 check(recoveries===1&&posts===1&&writes.length===1&&salarySerialized(writes[0])===salarySerialized(original),'recovery uses the same key and body without a second POST');
 await load(monthlyDayWorkspaceBootstrap({program:monthlyDayWorkspaceApproved()}));
 check(await $('monthly-days').isChecked()&&await $('monthly-days').isDisabled(),'an approved monthly policy cannot be removed from the editor');
 check(await $('monthly-days-reference').inputValue()===monthlyDayWorkspacePolicy().reference,'approved policy is shown without replacing its reference');
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:[]}})));
 check(await $('content').isHidden()&&await $('monthly-days-reference').inputValue()===''&&await $('fields').getAttribute('disabled')!==null,'revocation clears monthly policy, proposal view and edit authority');
 check(externalRequests===0&&await page.evaluate(()=>localStorage.length===0&&sessionStorage.length===0),'no external request or private browser persistence');
 check(errors.length===0,'no browser page errors');
 report={passed:true,checks:checks.length,labels:checks,layouts,driverName,actualEditor:true,realApiHandler:true,sqlExecution:false,sqlResponsesSynthetic:true,sqlCalls:sqlCalls.length,posts,reads,recoveries,externalRequests,productiveWrites:0,municipalApprovalVerified:false,payrollCalculated:false,payrollPosted:false,limitations:['SQL responses are stubs; no PostgreSQL was opened','The result is synthetic browser QA, not municipal formula approval or production acceptance']};
}catch(error){process.exitCode=1;report={passed:false,message:error.message,checks:checks.length,labels:checks,layouts,driverName,errors,posts,reads,recoveries,externalRequests,sqlExecution:false,productiveWrites:0};if(page)await page.screenshot({path:output.replace(/\.json$/,'')+'-failure.png',fullPage:true}).catch(()=>{});}
finally{await browser?.close();fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
