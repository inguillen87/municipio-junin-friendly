// Built screens, actual handlers and disposable PostgreSQL. No real session.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {OWN_ART_READ,prepareOwnArtReport,verifiedOwnArtSource} from '../../assets/own-art-report-model.js';
import {ownArtXlsx} from '../../assets/own-art-report-export.js';

export async function verifyOwnArtBrowser({handlers,env,actors,setActor,people,period,output,check,browserName='chromium',source,prepare,approve}) {
 assert.ok(['chrome','chromium'].includes(browserName));
 const root=fs.realpathSync(new URL('../../public',import.meta.url)),origin='http://127.0.0.1:4367';
 const caps=[...new Set([...OWN_ART_READ,'payroll.parameter.prepare','payroll.parameter.approve','payroll.parameter.audit.read'])],writes=[],reads=[],errors=[],downloads=[];
 let current=actors.maker,allowed=true,drop=false,page;
 const actor=a=>{current=a;setActor(a);};actor(current);env.INTERNAL_APP_ORIGIN=origin;
 const browser=await chromium.launch({headless:true,...(browserName==='chrome'?{channel:'chrome'}:{})});
 try {
  const context=await browser.newContext({viewport:{width:1440,height:1100},locale:'es-AR',serviceWorkers:'block'});
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.abort();
   const kind=u.pathname==='/api/internal-own-art-days'?'artDays':u.pathname==='/api/internal-own-art-report'?'art':u.pathname==='/api/internal-data'&&u.searchParams.get('resource')==='employees'?'directory':null;
   if(kind){let status=200,payload;const headers={};await handlers[kind]({method:req.method(),url:u.pathname+u.search,query:Object.fromEntries(u.searchParams),headers:req.headers(),body:req.postData()},{setHeader(k,v){headers[k]=String(v);},status(n){status=n;return this;},json(v){payload=v;return this;}});
    if(req.method()==='POST'){writes.push({kind,status,key:req.headers()['idempotency-key'],body:JSON.parse(req.postData()).payload,receipt:payload?.data});if(drop&&payload?.ok){drop=false;return route.fulfill({status:503,json:{ok:false,error:'Respuesta sintética interrumpida después de conservar la propuesta.'}});}}
    else reads.push({kind,resource:u.searchParams.get('resource')});return route.fulfill({status,headers,json:payload});
   }
   if(u.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,sessionVersion:2,user:{id:current.actorSessionId,email:current.actorEmail},access:{context:'tenant',tenant:{id:current.tenantId,roleKey:'QA'},tenantCapabilities:allowed?caps:[],platformCapabilities:[],platformRoles:[]},expiresAt:new Date(Date.now()+3600000).toISOString()}});
   if(u.pathname==='/api/internal-payroll-parameters')return route.fulfill({json:{ok:true,flags:{grhMutation:false,payrollCalculated:false,payrollPosted:false,currentCatalogVerified:false,proposalApproved:false},principal:{tenantId:current.tenantId,membershipId:current.membershipId,certifiedBindingId:current.bindingId,employmentLinked:false,capabilities:caps},proposals:[],total:0}});
   if(u.pathname==='/api/internal-data')return route.fulfill({json:{ok:true,status:'ready',sourcePolicy:{label:'QA SINTÉTICA'},latestClosed:{},currentOpen:{},runs:[],quality:{},limitations:[]}});
   if(u.pathname.startsWith('/api/'))return route.fulfill({status:403,json:{ok:false,error:'API ajena a la prueba sintética.'}});
   const file=path.resolve(root,u.pathname==='/nomina'?'nomina-control.html':'.'+u.pathname);
   if(req.method()!=='GET'||!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
   return route.fulfill({contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]??'application/octet-stream',body:fs.readFileSync(file)});
  });
  page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('download',d=>downloads.push(d));
  const r=k=>page.locator('.own-art [data-art-'+k+']'),d=k=>page.locator('.own-art-days [data-art-days-'+k+']');
  const idle=selector=>page.waitForFunction(s=>document.querySelector(s)?.getAttribute('aria-busy')==='false',selector);
  const fresh=async task=>{await page.goto('about:blank');await page.goto(origin+'/nomina#'+task);const control=task==='art'?'[data-art-consult]':'[data-art-days-picker]';await page.locator(control).waitFor({state:'visible'});await page.waitForFunction(s=>document.querySelector(s)?.disabled===false,control);await idle(task==='art'?'.own-art':'.own-art-days');};
  const consult=async()=>{await r('period').fill(period);await r('consult').click();await idle('.own-art');await r('view').waitFor({state:'visible'});};
  const select=async p=>{await d('picker').click();const picker=page.locator('#salaryArtDaysPicker');await picker.getByLabel('Nombre, apellido o legajo').fill(p.employeeNumber);await picker.getByRole('button',{name:'Buscar',exact:true}).click();await picker.locator('input[value="'+p.contractId+'"]').check();await picker.getByRole('button',{name:'Usar este legajo',exact:true}).click();await d('period').fill(period);await d('refresh').click();await idle('.own-art-days');await d('content').waitFor({state:'visible'});};
  await fresh('art');await consult();
  check((await r('count').innerText()).startsWith(people.length+' agentes')&&await r('rows').locator('article').count()===25,'ART built UI reads every own closed agent and shows the first page without issuing writes');assert.equal(writes.length,0);
  await r('next').click();check(await r('rows').locator('article').count()===people.length-25,'ART last page retains the rest of the complete closed population');
  await r('search').fill(people[0].employeeNumber);check(await r('rows').locator('article').count()===1&&(await r('page').innerText()).includes('/ '+people.length+' totales'),'ART search only filters the screen and leaves the full export scope explicit');
  const expected=ownArtXlsx(prepareOwnArtReport(await verifiedOwnArtSource(await source()))),downloadEvent=page.waitForEvent('download');await r('xlsx').click();const downloaded=await downloadEvent;await idle('.own-art');
  const xlsxPath=path.join(output,'art-complete-synthetic.xlsx');await downloaded.saveAs(xlsxPath);assert.deepEqual(new Uint8Array(fs.readFileSync(xlsxPath)),expected);check(true,'filtered built UI downloads the exact full-source Excel of all agents, including explicit zero and every cent');
  for(const width of[390,320]){await page.setViewportSize({width,height:1000});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'ART has no body overflow at '+width+'px');check(await r('xlsx').evaluate(e=>e.getBoundingClientRect().height>=44),'ART download has an accessible touch target at '+width+'px');await page.locator('.own-art').screenshot({path:path.join(output,'art-mobile-'+width+'.png')});}
  await page.setViewportSize({width:1440,height:1100});await r('period').fill(period.slice(0,4)+'-12');check(await r('view').isHidden()&&await r('xlsx').isDisabled(),'changing ART period invalidates its whole verified nominal preview');
  await r('consult').click();await idle('.own-art');check((await r('count').innerText()).startsWith('0 agentes')&&(await r('download-note').innerText()).includes('No se inventaron observaciones')&&await r('xlsx').isDisabled(),'empty own closed scope reports no agents and no invented observations or nominal artifact');
  await consult();await r('types').locator('input[value="sac"]').check();check(await r('view').isHidden(),'changing selected liquidation types invalidates ART');await r('types').locator('input[value="sac"]').uncheck();await consult();
  // Use the real new day writer to stale a previously verified ART source.
  await approve(await prepare(people[1],'22'));actor(actors.maker);const beforeDownloads=downloads.length;await r('xlsx').click();await idle('.own-art');
  check(downloads.length===beforeDownloads&&(await r('status').innerText()).includes('Cambió la fuente'),'day correction refreshes the entire ART source and requires another voluntary download');
  await approve(await prepare(people.at(-1),null));actor(actors.maker);await r('xlsx').click();await idle('.own-art');check(downloads.length===beforeDownloads&&await r('xlsx').isDisabled()&&(await r('count').innerText()).includes('observaciones'),'unknown days on the last page withdraw the complete download after fresh source verification');
  await approve(await prepare(people.at(-1),'23'));actor(actors.maker);await consult();
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  check(await r('view').isHidden()&&await r('rows').innerText()===''&&await r('period').inputValue()==='','hiding ART removes all nominal data and the previous period');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await r('access').click();await idle('.own-art');await consult();
  allowed=false;await page.evaluate(()=>document.dispatchEvent(new Event('municontrol:capabilities-ready')));await r('access').click();await idle('.own-art');check(await r('view').isHidden()&&await r('xlsx').isDisabled()&&downloads.length===beforeDownloads,'revoked access clears ART and cannot produce another file');
  allowed=true;await fresh('dias-art');await select(people[0]);check(await d('workedDays').inputValue()==='0','built day screen reads explicit approved zero without substituting 30');
  for(const width of[390,320]){await page.setViewportSize({width,height:1000});check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'ART days has no body overflow at '+width+'px');check(await d('picker').evaluate(e=>e.getBoundingClientRect().height>=44),'ART days picker is accessible at '+width+'px');await page.locator('.own-art-days').screenshot({path:path.join(output,'art-days-mobile-'+width+'.png')});}
  await page.setViewportSize({width:1440,height:1100});await d('workedDays').fill('32');await d('reason').fill('Borrador exclusivamente sintético QA');await d('prepare').click();check(await d('comparison').isHidden()&&writes.length===0,'invalid ART days block preparation and issue no POST');
  await d('workedDays').fill('1');await d('prepare').click();await d('comparison').waitFor({state:'visible'});check((await d('before').innerText()).includes('0')&&(await d('after').innerText()).includes('1'),'ART day correction displays complete before and after before voluntary recording');
  await d('workedDays').fill('2');check(await d('comparison').isHidden()&&await d('send').isHidden(),'editing reviewed ART days invalidates confirmation');await d('prepare').click();await d('confirm').check();drop=true;await d('send').click();await idle('.own-art-days');
  assert.equal(writes.length,1);const pending=structuredClone(writes[0]);assert.equal(pending.status,201);check(await d('recover').isVisible()&&await d('picker').isDisabled()&&await d('period').isDisabled(),'uncertain ART-day response keeps its immutable body/key and prevents retargeting');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});check(await d('content').isHidden()&&await d('workedDays').inputValue()===''&&await d('subject').innerText()==='No hay un legajo seleccionado.','hiding a pending ART declaration removes nominal views and preserves only the original attempt');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});allowed=false;await d('access').click();await idle('.own-art-days');check(await d('recover').isDisabled()&&await d('picker').isDisabled(),'revoked access prevents consulting or resending the same pending declaration');
  allowed=true;await d('access').click();await idle('.own-art-days');await d('recover').click();await idle('.own-art-days');check(writes.length===1&&await d('receipt').isVisible()&&reads.some(r=>r.kind==='artDays'&&r.resource==='attempt'),'ART-day read-only recovery retrieves the original stored request without another POST');assert.deepEqual(writes[0],pending);
  actor(actors.checker);await fresh('dias-art');await select(people[0]);await page.locator('.own-art-days').getByText('Propuestas y decisiones anteriores',{exact:true}).click();await d('proposal').selectOption(pending.receipt.proposalId);await d('open').click();await idle('.own-art-days');
  check(await d('review').isEnabled()&&(await d('after').innerText()).includes('2'),'another person reviews the exact ART days proposal independently');await d('search').fill('no existe esta búsqueda');check(await d('review').isDisabled()&&await d('comparison').isHidden(),'history filter cannot retain a decision for a hidden ART proposal');await d('search').fill('');await d('proposal').selectOption(pending.receipt.proposalId);await d('open').click();await idle('.own-art-days');
  await d('decision').selectOption('approve');await d('decision-reason').fill('Revisión independiente exclusivamente sintética QA');await d('review').click();await d('confirm').check();await d('send').click();await idle('.own-art-days');assert.equal(writes.length,2);assert.equal(writes[1].receipt.body.command,'approve');check(await d('receipt').isVisible(),'built ART days screen stores the independent decision and immutable receipt');
  actor(actors.maker);await fresh('art');await consult();check(await r('xlsx').isEnabled(),'new ART consultation incorporates the independently approved day correction');
  assert.deepEqual(errors,[]);check(true,'built ART and documented days finish without JavaScript errors');
  fs.writeFileSync(path.join(output,'art-browser-proof.json'),JSON.stringify({ok:true,browser:browserName,actualHandlers:true,actualSql:true,syntheticAuth:true,syntheticOnly:true,productiveBusinessWrites:0,writeCount:writes.length,readCount:reads.length,downloads:downloads.length,errors},null,2)+'\n');
 } catch(e){if(page&&!page.isClosed())await page.screenshot({path:path.join(output,'art-browser-failure.png'),fullPage:true});throw e;}
 finally{allowed=true;actor(actors.maker);await browser.close();}
}
