// Built product page + real read handler + synthetic SQL responses. No live API.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {createOwnProgramHandler} from '../api/internal-own-payroll-program.js';
import {bootstrap,uid,hash,definitions} from '../tests/fixtures/own-payroll-program-synthetic.js';
import {exactProgram} from '../tests/fixtures/own-payroll-exact-program-synthetic.js';
import {salarySerialized} from '../assets/native-salary-catalog-model.js';

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
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'es-AR',serviceWorkers:'block'});
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
 check(await page.getByRole('tab',{name:'Parámetros',exact:true}).getAttribute('aria-selected')==='true','keyboard action opens existing salary task');
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
 await page.getByRole('tab',{name:'Resumen',exact:true}).click();check(await $('content').isHidden(),'changing task withdraws the verified guidance');
 await page.getByRole('tab',{name:'Reglas de cálculo',exact:true}).click();await $('content').waitFor({state:'visible'});
 // A held read cannot restore the view after revocation.
 const heldReceived=new Promise(resolve=>{holdReady=resolve;});hold=true;await $('refresh').click();await heldReceived;
 await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:[]}})));
 held();held=null;await $('content').waitFor({state:'hidden'});
 check(await $('guidance-title').innerText()==='','revocation clears content before a late response');
 denied=true;await refresh();check(await $('content').isHidden(),'fresh rejected access does not recreate guidance');
 await load(bootstrap());malformed=true;await refresh();check((await $('status').innerText()).includes('No se pudo verificar'),'invalid bootstrap is rejected');malformed=false;
 // Real handler, synthetic lost acknowledgment: added navigation must not
 // unlock a second operation or modify the stored body/key.
 await load(bootstrap({program:approved()}));await $('reason').fill('Revisión sintética de fuentes completas QA');await $('prepare').click();await $('confirm').check();lose=true;await $('send').click();
 await page.waitForFunction(()=>document.querySelector('.own-program')?.getAttribute('aria-busy')==='false');
 const original=structuredClone(writes[0]);check(posts===1&&writes.length===1,'only explicitly submitted synthetic command writes');
 check(await $('catalog-link').isHidden()&&await $('pending-link').isDisabled(),'uncertain attempt prevents guidance navigation from opening another operation');
 await $('recover').click();await $('receipt').waitFor({state:'visible'});check(writes.length===1&&JSON.stringify(writes[0])===JSON.stringify(original),'receipt recovery keeps original body and key');
 check(await page.evaluate(()=>localStorage.length===0&&sessionStorage.length===0),'no private browser storage');
 check(errors.length===0,'no page errors');
 report={passed:true,checks:checks.length,labels:checks,layoutMeasurements,builtProductPage:true,realReadHandler:true,sqlResponsesSynthetic:true,posts,reads,productiveWrites:0,externalRequests:0,mobileWidths:[390,320],acceptanceCertified:false};
}catch(e){process.exitCode=1;report={passed:false,message:e.message,checks:checks.length,labels:checks,layoutMeasurements,errors,posts};if(page)await page.screenshot({path:output.replace(/\.json$/,'')+'-failure.png',fullPage:true}).catch(()=>{});}
finally{held?.();await browser?.close();fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
