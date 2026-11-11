// Built product page + real read handler + synthetic SQL responses. No live API.
import {openQaPayrollSidebarTask} from './lib/qa-payroll-sidebar-navigation.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {createOwnProgramHandler} from '../api/internal-own-payroll-program.js';
import {bootstrap,uid,hash,definitions} from '../tests/fixtures/own-payroll-program-synthetic.js';
import {exactProgram} from '../tests/fixtures/own-payroll-exact-program-synthetic.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';
import {preparedProgramFixture} from '../tests/fixtures/own-payroll-program-prepared-synthetic.js';

const root=path.resolve(import.meta.dirname,'..'),built=path.join(root,'public');
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const m=/^--(output|executable)=(.+)$/.exec(a);assert.ok(m);return[m[1],m[2]];}));
const output=path.resolve(args.output??'verification/own-program-guidance-ui.json');
assert.ok(output.startsWith(path.join(root,'verification')+path.sep)&&!fs.existsSync(output));
fs.mkdirSync(path.dirname(output),{recursive:true});
const origin='http://127.0.0.1:4356',caps=['workforce.employee.read','payroll.read','payroll.parameter.read','payroll.parameter.prepare','payroll.parameter.approve'];
const principal={user:{email:'qa@example.invalid'},tenant:{source:'membership',id:uid(1),membershipId:uid(2),effectiveCapabilities:caps}};
const session={email:principal.user.email,id:uid(3),version:2,releaseSha:'d'.repeat(40)};
const approved=()=>({version:hash('b'),revision:1,definition:exactProgram(),salaryVersion:hash('c'),proposalId:uid(80),approvalId:uid(81)});
const proposal=i=>({id:uid(100+i),requestSha256:hash('d'),baseVersion:hash('b'),salaryVersion:hash('c'),salaryItems:definitions(),baseDefinition:null,definition:exactProgram(),reason:'Propuesta sintética completa QA',createdAt:'2026-10-10T12:00:00Z',authorLabel:'Operador sintético QA',canReview:i!==1,status:'pending',decision:null});
let boot=bootstrap(),denied=false,malformed=false,held=null,holdReady=null,hold=false,lose=false,receipt=null,posts=0,reads=0;
let preparedSalary=null;
const writes=[],errors=[],checks=[],layoutMeasurements=[];
const sha=v=>createHash('sha256').update(salarySerialized(v)).digest('hex');
const handler=createOwnProgramHandler({env:{INTERNAL_APP_ORIGIN:origin},requireAccess:async()=>({mode:'managed',principal}),sessionFor:()=>session,getSql:async()=>({query:async(query,values)=>{
 if(query.includes('bootstrap')){reads++;return[{result:boot}];}
 if(query.includes('attempt'))return[{result:{...receipt,replayed:true}}];
 assert.ok(query.includes('command'));const body=JSON.parse(values[1]);writes.push({body,key:values[2]});
 receipt={version:'own-payroll-program.v1',eventId:uid(901),proposalId:uid(901),requestKey:values[2],requestSha256:sha(body),body,status:'pending',revision:1,programVersion:body.baseVersion,replayed:false,payrollCalculated:false,payrollPosted:false};
 if(lose){lose=false;throw Error('SYNTHETIC_ACK_LOST');}return[{result:receipt}];
}})});
let browser,page,report;
const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
try{
 browser=await chromium.launch({headless:true,...(args.executable?{executablePath:args.executable}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'es-AR',serviceWorkers:'block'});/* Reglas: formulario completo a la vista («Ver todo junto»); el paso a paso se verifica aparte. */await context.addInitScript(()=>{try{localStorage.setItem('mc.nomina.reglas.paso','todo')}catch{}});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.abort();
  if(u.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,sessionVersion:2,user:{id:'guidance-qa',email:session.email,role:'QA'},expiresAt:new Date(Date.now()+3600000).toISOString(),access:{context:'tenant',tenant:{id:uid(1),roleKey:'QA'},tenantCapabilities:denied?[]:caps,platformCapabilities:[],platformRoles:[]}}});
  if(u.pathname==='/api/internal-own-payroll-program'){
   if(req.method()==='POST')posts++;
   let status=200,payload;await handler({method:req.method(),url:u.pathname+u.search,query:Object.fromEntries(u.searchParams),headers:req.headers(),body:req.postData()},{setHeader(){},status(n){status=n;return this;},json(v){payload=v;return this;}});
   if(malformed)payload={ok:true,data:{version:'own-payroll-program.v1'}};
   if(hold){hold=false;await new Promise(resolve=>{held=resolve;holdReady?.();});}
   return route.fulfill({status,json:payload}).catch(()=>{});
  }
  if(u.pathname==='/api/internal-native-salary'&&preparedSalary){
   if(req.method()!=='GET'||u.searchParams.get('resource')!=='stream')return route.fulfill({status:405,json:{ok:false}});
   const bytes=Buffer.from(JSON.stringify(preparedSalary)),snapshotSha256=createHash('sha256').update(bytes).digest('hex'),pageBytes=256*1024,index=Number(u.searchParams.get('page')),pageCount=Math.ceil(bytes.length/pageBytes);
   if(!Number.isSafeInteger(index)||index<0||index>=pageCount||index>0&&u.searchParams.get('snapshot')!==snapshotSha256)return route.fulfill({status:409,json:{ok:false,code:'SOURCE_CHANGED'}});
   return route.fulfill({json:{ok:true,data:{version:'native-salary-stream.v1',scopeVersion:preparedSalary.scopeVersion,snapshotSha256,totalBytes:bytes.length,pageBytes,pageCount,pageIndex:index,hex:bytes.subarray(index*pageBytes,(index+1)*pageBytes).toString('hex')}}});
  }
  if(u.pathname==='/api/internal-data')return route.fulfill({json:{ok:true,status:'ready',sourcePolicy:{label:'QA SINTÉTICA'},latestClosed:{},currentOpen:{},runs:[],quality:{},limitations:[]}});
  if(u.pathname.startsWith('/api/'))return route.fulfill({status:403,json:{ok:false,error:'Sólo fixtures sintéticos'}});
  if(req.method()!=='GET')return route.abort();
  const file=path.resolve(built,u.pathname==='/nomina'?'nomina-control.html':'.'+u.pathname);
  if(!file.startsWith(built+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
  return route.fulfill({contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'}[path.extname(file)]??'application/octet-stream',body:fs.readFileSync(file)});
 });
 page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 const panel=page.locator('.own-program'),$=key=>panel.locator('[data-program-'+key+']');
 const preparationDisabled=async()=>await $('fields').getAttribute('disabled')!==null&&await $('add-rule').isDisabled()&&await $('add-binding').isDisabled();
 async function load(value){boot=value;denied=false;malformed=false;await page.goto(origin+'/nomina?case='+checks.length+'#reglas');await $('content').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('.own-program')?.getAttribute('aria-busy')==='false');await page.waitForFunction(()=>document.querySelector('link[data-own-program-style]')?.sheet&&getComputedStyle(document.querySelector('[data-program-catalog-link]')).minHeight==='44px');}
 async function refresh(){await $('refresh').click();await page.waitForFunction(()=>document.querySelector('.own-program')?.getAttribute('aria-busy')==='false');}
 await load(bootstrap({salaryCatalog:{version:hash('c'),revision:0,items:[]}}));
 check(await $('guidance-title').innerText()==='Primero: aprobar el maestro salarial propio','initial prerequisite identifies the missing approval');
 check(await preparationDisabled(),'unapproved catalogue blocks futile preparation even with permission');
 check(await $('preparation-access').innerText()!=='','preparation authority is explained separately');
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:900});
  // The enclosing task enters with a translation. Measure its final layout,
  // including loaded fonts, without disabling motion or lowering the target.
  await page.evaluate(async()=>{
   await document.fonts.ready;
   const target=document.querySelector('[data-program-catalog-link]');
   const ancestors=new Set();for(let el=target;el;el=el.parentElement)ancestors.add(el);
   await Promise.all(document.getAnimations().filter(a=>ancestors.has(a.effect?.target)).map(a=>a.finished.catch(()=>{})));
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  });
  const target=await $('catalog-link').evaluate(e=>({height:e.getBoundingClientRect().height,minHeight:getComputedStyle(e).minHeight}));
  layoutMeasurements.push({width,...target});
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page fits '+width);
  check(target.height>=44&&parseFloat(target.minHeight)>=44,'action target accessible at '+width);
  await page.screenshot({path:output.replace(/\.json$/,'')+'-'+width+'.png',fullPage:true});
 }
 await $('catalog-link').focus();await page.keyboard.press('Enter');
 const parametersTab=page.locator('#task-tab-parametros');check(await parametersTab.getAttribute('aria-selected')==='true'&&await parametersTab.getAttribute('aria-controls')==='task-parametros'&&new URL(page.url()).hash==='#parametros'&&await page.locator('#task-parametros').isVisible(),'keyboard action opens existing salary task');
 check(posts===0,'guidance navigation never writes');
 await page.setViewportSize({width:1440,height:1000});
 await load(bootstrap({permissions:{canPropose:false,canReview:true}}));
 check(await $('guidance-title').innerText()==='Siguiente paso: preparar y revisar las reglas','approved catalogue is distinct from missing program');
 check(await preparationDisabled()&&(await $('preparation-access').innerText()).includes('vínculo municipal verificado'),'consultation does not claim preparation authority');
 await load(bootstrap());check(await $('add-rule').isEnabled()&&await $('add-binding').isEnabled(),'eligible operator can prepare from approved catalogue');
 await load(bootstrap({program:approved(),salaryCatalog:{version:hash('e'),revision:2,items:definitions()}}));
 check(await $('guidance-title').innerText()==='Revisar las reglas con el maestro actualizado','updated catalogue requires reviewing existing sources');
 await load(bootstrap({program:approved()}));
 check(await $('guidance-title').innerText()==='Programa y maestro vinculados','same-version status stops short of payroll eligibility');
 const proposals=Array.from({length:71},(_,i)=>proposal(i));proposals[70].salaryVersion=hash('f');
 const decided={...proposal(72),status:'approved',canReview:false,decision:{command:'approve',reason:'Decisión sintética completa QA',actorLabel:'Otra persona QA',recordedAt:'2026-10-10T13:00:00Z',revision:1}};
 await load(bootstrap({proposals:[decided,...proposals],permissions:{canPropose:true,canReview:true}}));
 check((await $('pending-summary').innerText()).includes('71 propuestas pendientes')&&(await $('pending-summary').innerText()).includes('69 compatibles'),'all proposals counted with independence and versions');
 await $('pending-link').click();check(await $('proposals').isVisible()&&await $('proposal-select').locator('option').count()===72&&await $('proposal-select').inputValue()===proposals[0].id,'shortcut opens a pending proposal and keeps complete decision history');
 await openQaPayrollSidebarTask(page,{profile:'payroll-sidebar',task:'resumen'});check(await $('content').isHidden(),'changing task withdraws the verified guidance');
 await openQaPayrollSidebarTask(page,{profile:'payroll-sidebar',task:'reglas'});await $('content').waitFor({state:'visible'});
 // A held read cannot restore the view after revocation.
 const heldReceived=new Promise(resolve=>{holdReady=resolve;});hold=true;await $('refresh').click();await heldReceived;
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:[]}})));
 held();held=null;await $('content').waitFor({state:'hidden'});
 check(await $('guidance-title').innerText()==='','revocation clears content before a late response');
 denied=true;await refresh();check(await $('content').isHidden(),'fresh rejected access does not recreate guidance');
 await load(bootstrap());malformed=true;await refresh();check((await $('status').innerText()).includes('No se pudo verificar'),'invalid bootstrap is rejected');malformed=false;
 // Complete approved-code coverage through the existing handler; no writes.
 const coverage=panel.locator('[data-program-coverage]'),c=key=>coverage.locator('[data-coverage-'+key+']');
 const many=bootstrap({program:approved()});const first=definitions().find(r=>r.code==='100');many.salaryCatalog.items.push(...Array.from({length:71},(_,i)=>({...first,code:String(4000+i),label:'=HYPERLINK("https://example.invalid")',ruleReference:'Nombre privado ficticio 12345678'})));
 async function coverageReview(){await c('period').fill('2026-10');await c('type').selectOption('monthly');await c('review').click();await c('result').waitFor({state:'visible'});}
 await load(many);await coverage.locator('summary').focus();await page.keyboard.press('Enter');check(await coverage.evaluate(e=>e.open),'keyboard opens the complete-code cotejo');await coverageReview();
 check((await c('summary').innerText()).includes('78 definiciones')&&await c('table').locator('tbody tr').count()===25,'coverage uses all approved definitions and paginates only the view');
 for(let i=0;i<3;i++)await c('next').click();check((await c('table').innerText()).includes('4070'),'last-page code remains reachable');
 await c('search').fill('4070');check(await c('table').locator('tbody tr').count()===1,'search filters the visible coverage only');
 const downloading=page.waitForEvent('download');await c('download').click();const download=await downloading,csv=fs.readFileSync(await download.path(),'utf8');
 check(csv.split('\r\n').length===80&&csv.includes('"4000"')&&csv.includes('"4070"'),'filtered last-page download retains all 78 definitions');
 const downloadingAgain=page.waitForEvent('download');await c('download').click();const downloadedAgain=await downloadingAgain;check(fs.readFileSync(await downloadedAgain.path(),'utf8')===csv,'a second voluntary download preserves the same complete snapshot');
 check(!['HYPERLINK','12345678',hash('c'),uid(80)].some(v=>csv.includes(v)),'CSV excludes free text, private labels and identities');
 for(const width of[1440,390,320]){await page.setViewportSize({width,height:900});await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'coverage fits '+width);check(await c('download').evaluate(e=>e.getBoundingClientRect().height>=44),'coverage download is accessible at '+width);if(width<640){check(await coverage.locator('.own-coverage-cards').isVisible()&&(await coverage.locator('.own-coverage-cards').innerText()).includes('Definir el tratamiento municipal'),'mobile displays status and action without horizontal scrolling at '+width);}await coverage.screenshot({path:output.replace(/\.json$/,'')+'-coverage-'+width+'.png'});}
 await c('period').fill('2026-11');await c('type').selectOption('supplementary');check(await c('result').isHidden()&&await c('download').isDisabled(),'period or type changes invalidate the full download');
 await coverageReview();malformed=true;await refresh();check(await c('result').isHidden()&&await c('review').isDisabled(),'a rejected refresh cannot reuse prior coverage');malformed=false;
 await load(many);await coverage.locator('summary').click();await coverageReview();await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:[]}})));check(await c('result').isHidden()&&await c('period').inputValue()===''&&await c('table').innerText()==='','revocation clears source, scope, rows and download');
 await load(many);await coverage.locator('summary').click();await coverageReview();await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});check(await c('result').isHidden()&&await c('download').isDisabled(),'hiding the page withdraws approved-code coverage');await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,value:false}));
 await load(many);await coverage.locator('summary').click();await coverageReview();const coverageHeld=new Promise(resolve=>{holdReady=resolve;});hold=true;await $('refresh').click();await coverageHeld;await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:[]}})));held();held=null;await $('content').waitFor({state:'hidden'});check(await c('review').isDisabled()&&await c('table').innerText()==='','a late bootstrap cannot restore coverage after revocation');
 // Real handler, synthetic lost acknowledgment: added navigation must not
 // unlock a second operation or modify the stored body/key.
 await load(bootstrap({program:approved()}));await $('reason').fill('Revisión sintética de fuentes completas QA');await $('prepare').click();
 check(await $('confirm').isDisabled()&&await $('send').isDisabled()&&posts===0,'an identical approved programme cannot open a futile confirmation or create a request');
 await $('binding-select').selectOption('0');await page.locator('[data-program-field="binding-reference"]').fill('Respaldo actualizado exclusivamente sintético de recuperación QA');
 await $('prepare').click();await $('confirm').check();lose=true;await $('send').click();
 await page.waitForFunction(()=>document.querySelector('.own-program')?.getAttribute('aria-busy')==='false');
 const original=structuredClone(writes[0]);check(posts===1&&writes.length===1,'only explicitly submitted synthetic command writes');
 check(original.body.program.bindings[0].ruleReference==='Respaldo actualizado exclusivamente sintético de recuperación QA','the positive recovery case submits the complete programme with an actual reviewed change');
 check(await $('catalog-link').isHidden()&&await $('pending-link').isDisabled(),'uncertain attempt prevents guidance navigation from opening another operation');
 check(await c('review').isDisabled()&&await c('download').isDisabled(),'coverage cannot reopen or export during an uncertain command');
 await $('recover').click();await $('receipt').waitFor({state:'visible'});check(writes.length===1&&JSON.stringify(writes[0])===JSON.stringify(original),'receipt recovery keeps original body and key');
 // A prepared file enters the SAME editor and command/recovery path. No
 // monetary authority comes from a self-declared source hash.
 const asFile=(text,name='preparacion-completa.json')=>({name,mimeType:'application/json',buffer:Buffer.from(text)});
 async function settled(){await page.waitForFunction(()=>document.querySelector('.own-program')?.getAttribute('aria-busy')==='false');}
 async function previewFile(f,text=f.text){
  await $('file-input').setInputFiles(asFile(text));await $('file-review').click();await $('file-result').waitFor({state:'visible'});await settled();
 }
 for(const version of ['v1','v2']){
  const f=preparedProgramFixture({version,prior:true});preparedSalary=f.salary;await load(f.programme);
  const beforePosts=posts,beforeWrites=writes.length;
  await previewFile(f);check(posts===beforePosts&&writes.length===beforeWrites,version+' file review makes no proposal POST');
  check((await $('file-summary').innerText()).includes('definiciones completas')&&await $('file-comparison').locator('tbody tr').count()>=f.preparation.draft.programme.rules.length,version+' whole comparison retains new and historical rules');
  check(await $('rule-select').locator('option').count()===1,version+' preview leaves original historical draft unchanged');
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:1000});await page.evaluate(()=>document.fonts.ready);
   const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,apply:document.querySelector('[data-program-file-apply]').getBoundingClientRect().height}));
   check(layout.scroll<=layout.width+1&&layout.apply>=44,version+' complete-file controls usable at '+width);layoutMeasurements.push({version,...layout});
   await page.screenshot({path:output.replace(/\.json$/,'')+'-'+version+'-'+width+'.png',fullPage:true});
  }
  await page.setViewportSize({width:1440,height:1000});
  await $('file-confirm').check();await $('file-apply').click();await settled();
  check(posts===beforePosts&&writes.length===beforeWrites,version+' applying the file only changes the local draft');
  check(await $('rule-select').locator('option').count()===f.preparation.draft.programme.rules.length&&await $('binding-select').locator('option').count()===f.preparation.draft.programme.bindings.length,version+' all rules and inputs reach existing editor');
  check(await $('file-result').isHidden()&&await $('file-input').inputValue()==='',version+' applied private file and preview are retired');
  await $('reason').fill('Propuesta completa exclusivamente sintética del archivo revisado');await $('prepare').click();await $('confirm').check();
  lose=version==='v2';await $('send').click();await settled();
  check(posts===beforePosts+1&&writes.length===beforeWrites+1,version+' existing handler receives one explicit complete proposal');
  const sent=structuredClone(writes.at(-1));check(salarySerialized(sent.body.program)===salarySerialized(f.preparation.draft.programme),version+' submitted program matches complete prepared program exactly');
  if(version==='v2'){
   check(await $('file-input').isDisabled()&&await $('file-review').isDisabled()&&await $('file-apply').isDisabled(),'uncertain file proposal locks all alternative loading');
   await $('file-input').dispatchEvent('change');await $('recover').click();await $('receipt').waitFor({state:'visible'});
   check(writes.length===beforeWrites+1&&salarySerialized(writes.at(-1))===salarySerialized(sent),'file proposal recovery preserves original full body and idempotency key');
  }else await $('receipt').waitFor({state:'visible'});
 }
 const f=preparedProgramFixture({version:'v2',prior:true});preparedSalary=f.salary;await load(f.programme);
 const untouched=await $('rule-editor').innerText(),beforeRejects=posts;
 for(const bad of ['{',f.text.slice(0,-1),f.text.replace('"approved":false','"approved":true')]){
  await $('file-input').setInputFiles(asFile(bad));await $('file-review').click();await settled();
  check(await $('file-result').isHidden()&&await $('rule-editor').innerText()===untouched&&posts===beforeRejects,'invalid file preserves current work and never proposes');
 }
 await $('file-input').setInputFiles({name:'bytes-invalidos.json',mimeType:'application/json',buffer:Buffer.from([255,254])});await $('file-review').click();await settled();
 check((await $('status').innerText()).includes('UTF-8')&&await $('rule-editor').innerText()===untouched,'invalid UTF8 is rejected without coercion or draft loss');
 await previewFile(f);boot=structuredClone(f.programme);boot.program.version=hash('e');await $('file-confirm').check();await $('file-apply').click();await settled();
 check(await $('file-result').isHidden()&&await $('rule-editor').innerText()===untouched&&posts===beforeRejects,'fresh changed program rejects apply and retains original draft');
 preparedSalary=f.salary;await load(f.programme);await previewFile(f);preparedSalary=structuredClone(f.salary);preparedSalary.classification.version=hash('e');await $('file-confirm').check();await $('file-apply').click();await settled();
 check(await $('file-result').isHidden()&&await $('rule-editor').innerText()===untouched&&posts===beforeRejects,'fresh changed classification rejects apply and retains original draft');
 preparedSalary=f.salary;await load(f.programme);await previewFile(f);
 await $('reason').fill('Cambio local del fundamento después de revisar archivo');
 check(await $('file-result').isHidden()&&await $('file-input').inputValue()==='','manual editing retires the prepared-file review');
 await previewFile(f);await openQaPayrollSidebarTask(page,{profile:'payroll-sidebar',task:'resumen'});
 check(await $('file-result').isHidden()&&await $('file-input').inputValue()==='','leaving the task withdraws the file and review');
 await openQaPayrollSidebarTask(page,{profile:'payroll-sidebar',task:'reglas'});await $('content').waitFor({state:'visible'});await settled();
 await $('file-input').setInputFiles(asFile(f.text));
 await page.evaluate(()=>{
  const original=File.prototype.arrayBuffer;
  File.prototype.arrayBuffer=function(){const file=this;return new Promise((resolve,reject)=>{window.finishPreparedFile=()=>{File.prototype.arrayBuffer=original;return original.call(file).then(resolve,reject);};});};
 });
 await $('file-review').click();await page.waitForFunction(()=>typeof window.finishPreparedFile==='function');
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:[]}})));
 await $('content').waitFor({state:'hidden'});await page.evaluate(()=>window.finishPreparedFile());await page.waitForTimeout(50);
 check(await $('content').isHidden()&&await $('file-result').isHidden()&&await $('file-input').inputValue()===''&&posts===beforeRejects,'late file read cannot restore data or propose after revocation');
 preparedSalary=null;

 check(await page.evaluate(()=>localStorage.length===0&&sessionStorage.length===0),'no private browser storage');
 check(errors.length===0,'no page errors');
 report={passed:true,checks:checks.length,labels:checks,layoutMeasurements,builtProductPage:true,realReadHandler:true,sqlResponsesSynthetic:true,posts,reads,productiveWrites:0,externalRequests:0,mobileWidths:[390,320],acceptanceCertified:false};
}catch(e){process.exitCode=1;report={passed:false,message:e.message,checks:checks.length,labels:checks,layoutMeasurements,errors,posts};if(page)await page.screenshot({path:output.replace(/\.json$/,'')+'-failure.png',fullPage:true}).catch(()=>{});}
finally{held?.();await browser?.close();fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
