// Built UI, actual HTTP handlers and loopback SQL; all identities are synthetic.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
export async function verifyOwnContractWorkingTimeBrowser({handlers,env,actors,setActor,people,period,output,check,revoke,restore,browserName='chrome'}) {
 assert.ok(['chrome','chromium'].includes(browserName));
 const root=fs.realpathSync(new URL('../../public',import.meta.url)),origin='http://127.0.0.1:4367',errors=[],writes=[],reads=[];
 const caps=['workforce.employee.read','payroll.read','payroll.parameter.read','payroll.parameter.prepare','payroll.parameter.approve','payroll.parameter.audit.read'];
 let current=actors.maker,allowed=true,drop=false;
 const actor=a=>{current=a;setActor(a);};actor(current);env.INTERNAL_APP_ORIGIN=origin;
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:browserName==='chrome'?{channel:'chrome'}:{})});
 let page;
 try {
  const context=await browser.newContext({viewport:{width:1440,height:1100},locale:'es-AR',serviceWorkers:'block'});
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.abort();
   const kind=u.pathname==='/api/internal-own-contract-working-time'?'workingTime':u.pathname==='/api/internal-own-payroll-program'?'program':u.pathname==='/api/internal-data'&&u.searchParams.get('resource')==='employees'?'directory':null;
   if(kind){let status=200,payload;const headers={};await handlers[kind]({method:req.method(),url:u.pathname+u.search,query:Object.fromEntries(u.searchParams),headers:req.headers(),body:req.postData()},{setHeader(k,v){headers[k]=String(v);},status(n){status=n;return this;},json(v){payload=v;return this;}});
    if(req.method()==='POST'){writes.push({kind,status,key:req.headers()['idempotency-key'],body:JSON.parse(req.postData()).payload,receipt:payload?.data});if(drop&&payload?.ok){drop=false;return route.fulfill({status:503,json:{ok:false,error:'Respuesta sintética interrumpida después de conservar la propuesta.'}});}}
    else reads.push({kind,resource:u.searchParams.get('resource')});
    return route.fulfill({status,headers,json:payload});
   }
   if(u.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,sessionVersion:2,user:{id:current.actorSessionId,email:current.actorEmail},access:{context:'tenant',tenant:{id:current.tenantId,roleKey:'QA'},tenantCapabilities:allowed?caps:[],platformCapabilities:[],platformRoles:[]},expiresAt:new Date(Date.now()+3600000).toISOString()}});
   if(u.pathname==='/api/internal-payroll-parameters')return route.fulfill({json:{ok:true,flags:{grhMutation:false,payrollCalculated:false,payrollPosted:false,currentCatalogVerified:false,proposalApproved:false},principal:{tenantId:current.tenantId,membershipId:current.membershipId,certifiedBindingId:current.bindingId,employmentLinked:false,capabilities:caps},proposals:[],total:0}});
   if(u.pathname==='/api/internal-data')return route.fulfill({json:{ok:true,status:'ready',sourcePolicy:{label:'QA SINTÉTICA'},latestClosed:{},currentOpen:{},runs:[],quality:{},limitations:[]}});
   if(u.pathname.startsWith('/api/'))return route.fulfill({status:403,json:{ok:false,error:'API ajena a la prueba sintética.'}});
   const file=path.resolve(root,u.pathname==='/nomina'?'nomina-control.html':'.'+u.pathname);
   if(req.method()!=='GET'||!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
   return route.fulfill({contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]??'application/octet-stream',body:fs.readFileSync(file)});
  });
  page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  const s=key=>page.locator('[data-working-time-'+key+']'),panel=page.getByRole('region',{name:'Jornada contractual propia',exact:true});
  const idle=()=>page.waitForFunction(()=>document.querySelector('.own-working-time')?.getAttribute('aria-busy')==='false');
  const fresh=async()=>{await page.goto('about:blank');await page.goto(origin+'/nomina#jornada');await s('picker').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('[data-working-time-picker]')?.disabled===false);await idle();};
  const select=async employee=>{
   await s('picker').click();const d=page.locator('#salaryWorkingTimePicker');await d.getByLabel('Nombre, apellido o legajo').fill(employee.employeeNumber);await d.getByRole('button',{name:'Buscar',exact:true}).click();
   await d.locator('input[value="'+employee.contractId+'"]').check();await d.getByRole('button',{name:'Usar este legajo',exact:true}).click();
   await s('period').fill(period);await s('refresh').click();await idle();await s('content').waitFor({state:'visible'});
  };
  await fresh();await select(people[0]);
  check(await s('dailyHours').inputValue()==='0.00'&&await s('monthlyHours').inputValue()==='0','built panel reads the exact approved independent exact daily and monthly hour declarations');
  assert.equal(writes.length,0);
  for(const width of[390,320]){
   await page.setViewportSize({width,height:1000});
   check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'workingTime panel has no body overflow at '+width+'px');
   check(await s('picker').evaluate(e=>e.getBoundingClientRect().height>=44),'legajo selection is an accessible mobile control at '+width+'px');
   await panel.screenshot({path:path.join(output,'working-time-mobile-'+width+'.png')});
  }
  await page.setViewportSize({width:1440,height:1100});
  await s('dailyHours').fill('1.234567891');await s('reason').fill('Borrador exclusivamente sintético QA');await s('prepare').click();
  check(await s('comparison').isHidden()&&writes.length===0,'invalid excess precision in hours block review and issue no write');
  await s('dailyHours').fill('9');await s('prepare').click();await s('comparison').waitFor({state:'visible'});
  check((await s('before').innerText()).includes('0.00')&&(await s('after').innerText()).includes('9'),'full before and after are visible before voluntary recording');
  await s('dailyHours').fill('10');check(await s('comparison').isHidden()&&await s('send').isHidden(),'editing a reviewed component invalidates its confirmation');
  await s('period').fill(period.slice(0,4)+'-12');
  check(await s('content').isHidden()&&await s('dailyHours').inputValue()==='','changing month withdraws the old nominal declaration and reviewed draft');
  await s('period').fill(period);await s('refresh').click();await idle();
  await select(people[1]);check(await s('dailyHours').inputValue()==='7.50000001','selecting another contract replaces the entire verified declaration');
  await select(people[0]);await s('dailyHours').fill('9');await s('reason').fill('Nueva constancia exclusivamente sintética QA');await s('prepare').click();await s('confirm').check();
  drop=true;await s('send').click();await idle();
  assert.equal(writes.length,1);const pending=structuredClone(writes[0]);assert.equal(pending.status,201);
  check(await s('recover').isVisible()&&await s('picker').isDisabled()&&await s('period').isDisabled(),'lost response keeps one immutable attempt and prevents retargeting');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  check(await s('content').isHidden()&&await s('dailyHours').inputValue()===''&&await s('subject').innerText()==='No hay un legajo seleccionado.','hiding the page clears nominal views and editable fields');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  allowed=false;await revoke();await s('access').click();await idle();
  check(await s('recover').isDisabled()&&await s('picker').isDisabled()&&await s('period').isDisabled(),'revocation prevents consultation or re-send of the pending attempt');
  allowed=true;await restore();await s('access').click();await idle();await s('recover').click();await idle();
  check(writes.length===1&&await s('receipt').isVisible()&&reads.some(r=>r.kind==='workingTime'&&r.resource==='attempt'),'read-only recovery after visibility and access renewal confirms the same saved attempt');
  assert.deepEqual(writes[0],pending);
  actor(actors.checker);await fresh();await select(people[0]);
  await panel.getByText('Propuestas y decisiones anteriores',{exact:true}).click();
  const originalOptions=await s('proposal').locator('option').count();await s('search').fill('no existe esta búsqueda');check(await s('proposal').locator('option').count()===1&&await s('dailyHours').inputValue()==='0.00','history filter changes visible proposals without replacing approved facts');
  await s('search').fill('');assert.equal(await s('proposal').locator('option').count(),originalOptions);
  await s('proposal').selectOption(pending.receipt.proposalId);await s('open').click();await idle();
  check(await s('review').isEnabled()&&(await s('after').innerText()).includes('9'),'independent reviewer opens the exact full proposal and its comparison');
  await s('search').fill('no existe esta búsqueda');
  check(await s('review').isDisabled()&&await s('comparison').isHidden(),'filtering away the opened proposal withdraws its decision and confirmation');
  await s('search').fill('');await s('proposal').selectOption(pending.receipt.proposalId);await s('open').click();await idle();
  await s('decision').selectOption('approve');await s('decision-reason').fill('Revisión independiente exclusivamente sintética QA');await s('review').click();await s('confirm').check();await s('send').click();await idle();
  assert.equal(writes.length,2);assert.equal(writes[1].receipt.body.command,'approve');
  check(await s('receipt').isVisible(),'built UI stores an independent decision with the exact reviewed body');
  actor(actors.maker);await fresh();await select(people[0]);check(await s('dailyHours').inputValue()==='9','new verified consultation shows the independently approved correction');
  await page.getByRole('tab',{name:'Reglas de cálculo',exact:true}).click();
  const program=page.getByRole('region',{name:'Reglas propias de cálculo',exact:true});await program.locator('[data-program-content]').waitFor({state:'visible'});
  check(await program.locator('[data-program-working-time]').isChecked()&&await program.locator('[data-program-working-time]').isDisabled(),'approved programme explicitly opts into recognized facts and cannot silently downgrade');
  await program.locator('[data-program-binding-select]').selectOption({label:(await program.locator('[data-program-binding-select] option').allTextContents()).find(t=>t.includes('contractDailyHours'))});
  check(await program.getByLabel('Componente de la jornada',{exact:true}).inputValue()==='dailyHours','built programme editor identifies the declared hourly component without a fake concept code');
  await program.getByLabel('Componente de la jornada',{exact:true}).selectOption('monthlyHours');
  check(writes.length===2,'editing a programme component remains a draft and issues no new save');
  assert.deepEqual(errors,[]);check(true,'built workingTime and programme paths complete without JavaScript errors');
  fs.writeFileSync(path.join(output,'working-time-browser-proof.json'),JSON.stringify({ok:true,browser:browserName,actualHandlers:true,actualSql:true,syntheticAuth:true,syntheticOnly:true,productiveBusinessWrites:0,writeCount:writes.length,readCount:reads.length,errors},null,2)+'\n');
 } catch(e) { if(page&&!page.isClosed())await page.screenshot({path:path.join(output,'working-time-browser-failure.png'),fullPage:true});throw e; }
 finally {allowed=true;await restore();actor(actors.maker);await browser.close();}
}
