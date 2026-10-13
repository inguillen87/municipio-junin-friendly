// Compiled product, actual handler and disposable PostgreSQL. Synthetic identity;
// no production request, real employee or real salary is admitted by this fixture.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {salaryItems,salarySerialized} from '../../assets/native-salary-catalog-model.js';
import {salaryFileExport,salaryFilePlan} from '../../assets/native-salary-file-model.js';

export async function verifyNativeSalaryCapacityBrowser({handler,env,actor,output,check,all,classification,browserName='chromium',setReadRevoked,eventCount}){
 assert.ok(['chrome','chromium'].includes(browserName));
 const root=fs.realpathSync(new URL('../../public',import.meta.url)),origin='http://127.0.0.1:4359';
 const errors=[],posts=[],reads=[],external=[],checks=[],durations=[];
 const ok=(value,message)=>{assert.ok(value,message);checks.push(message);check(true,message);};
 const caps=['workforce.employee.read','payroll.read','payroll.parameter.read','payroll.parameter.prepare','payroll.parameter.approve','payroll.parameter.audit.read'];
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:browserName==='chrome'?{channel:'chrome'}:{})});
 env.INTERNAL_APP_ORIGIN=origin;let page,holdPage=null,releasePage=null,lostAck=false;
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'es-AR',serviceWorkers:'block'});
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());
   if(u.origin!==origin){external.push(u.origin);return route.abort();}
   if(u.pathname==='/api/internal-native-salary'){
    const query=Object.fromEntries(u.searchParams),write=req.method()==='POST';
    if(query.resource==='stream'&&query.page===holdPage){holdPage=null;await new Promise(resolve=>{releasePage=resolve;});}
    let status=200,payload;const headers={},start=performance.now();
    await handler({method:req.method(),url:u.pathname+u.search,query,headers:req.headers(),body:req.postData()},{setHeader(k,v){headers[k]=String(v);},status(n){status=n;return this;},json(v){payload=v;return this;}});
    durations.push({resource:write?'command':query.resource,status,ms:performance.now()-start});
    if(write){posts.push({body:JSON.parse(req.postData()).payload,key:req.headers()['idempotency-key'],status});if(lostAck){lostAck=false;return route.abort('failed');}}
    else reads.push({resource:query.resource,page:query.page,status,bytes:Buffer.byteLength(JSON.stringify(payload)),snapshot:payload?.data?.snapshotSha256,pages:payload?.data?.pageCount});
    return route.fulfill({status,headers,json:payload});
   }
   if(u.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,sessionVersion:2,user:{id:actor.actorSessionId,email:actor.actorEmail,role:'municipality_admin'},access:{context:'tenant',tenant:{id:actor.tenantId,roleKey:'MUNICIPIO_ADMIN_OPERATIVO'},tenantCapabilities:caps,platformCapabilities:[],platformRoles:[]},expiresAt:new Date(Date.now()+3600000).toISOString()}});
   if(u.pathname==='/api/internal-payroll-parameters')return route.fulfill({json:{ok:true,flags:{grhMutation:false,payrollCalculated:false,payrollPosted:false,currentCatalogVerified:false,proposalApproved:false},principal:{tenantId:actor.tenantId,membershipId:actor.membershipId,certifiedBindingId:actor.bindingId,employmentLinked:false,capabilities:caps},proposals:[],total:0}});
   if(u.pathname==='/api/internal-data')return route.fulfill({json:{ok:true,status:'ready',sourcePolicy:{label:'QA SINTÉTICA'},latestClosed:{},currentOpen:{},runs:[],quality:{},limitations:[]}});
   if(u.pathname.startsWith('/api/'))return route.fulfill({status:403,json:{ok:false,error:'API fuera de esta prueba sintética.'}});
   const file=path.resolve(root,u.pathname==='/nomina'?'nomina-control.html':'.'+u.pathname);
   if(req.method()!=='GET'||!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
   return route.fulfill({contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]??'application/octet-stream',body:fs.readFileSync(file)});
  });
  page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  const master=page.locator('[data-native-salary]'),search=master.getByLabel('Buscar código, convenio, clase o descripción'),pendingProposals=()=>master.getByRole('button',{name:new RegExp('^Pendiente · .* · '+all.length+' definiciones$')});
  const complete=()=>master.getByRole('status').filter({hasText:all.length+' definiciones propias'}).waitFor({timeout:180000});
  let navigation=0;const open=async()=>{await page.goto(origin+'/nomina?qa-capacity='+(++navigation)+'#resumen');await page.getByRole('tab',{name:'Parámetros',exact:true}).click();};
  const refresh=async()=>{const start=performance.now();await master.getByRole('button',{name:'Consultar maestro propio',exact:true}).click();await complete();durations.push({resource:'complete-browser-read',ms:performance.now()-start});};
  const initialEvents=await eventCount();await open();const firstRead=reads.length;await refresh();
  const frames=reads.slice(firstRead).filter(r=>r.resource==='stream');
  ok(frames.length===frames[0].pages&&frames.length>1&&frames.every((r,i)=>Number(r.page)===i&&r.status===200&&r.snapshot===frames[0].snapshot&&r.bytes<600000),'compiled browser verifies all real SQL blocks in order under the response budget');
  ok(await master.locator('.sc-list').first().locator('li').count()===20&&await pendingProposals().count()===2,'complete3291 master uses20-row display pages while preserving all pending proposals');
  await master.getByRole('button',{name:'Siguiente',exact:true}).click();ok(await master.locator('.sc-list').first().locator('li').count()===20,'next display page remains available after full transport');
  await search.fill('ninguna-fila-sintetica-coincide');ok(await master.locator('.sc-list').first().locator('li').count()===0&&await pendingProposals().count()===2,'zero-result search does not crop complete independent proposal history');
  await pendingProposals().first().click();
  const comparison=master.locator('section').filter({has:page.getByRole('heading',{name:'Comparación de la propuesta',exact:true})});
  ok(await comparison.locator('[data-sc-comparison]>details').count()===all.length,'actual full pending comparison retains every change despite a zero-result search');
  await comparison.getByText('Ver todas las definiciones propuestas',{exact:true}).click();ok(await comparison.locator('details>div').count()===all.length,'every proposed definition remains inspectable beyond any display page');
  // Reopen to remove the expanded comparison before editing; no write.
  await open();await refresh();await master.getByRole('button',{name:'Preparar nueva versión',exact:true}).click();
  await master.locator('[data-salary-file-loader]>summary').click();const file=master.locator('[data-salary-file]');await file.getByLabel('CSV del maestro salarial',{exact:true}).waitFor();
  await search.fill('ninguna-fila-sintetica-coincide');const download=page.waitForEvent('download');await file.getByRole('button',{name:'Descargar borrador completo',exact:true}).click();const downloaded=await download;const csv=fs.readFileSync(await downloaded.path(),'utf8');
  // The exported file re-enters the same parser and retains exact decimal/null data.
  const parsed=salaryFilePlan([],csv,classification);
  assert.deepEqual(parsed.items,all);ok(true,'voluntary CSV includes every definition and exact decimal/null value despite the display filter');
  ok(posts.length===0&&await eventCount()===initialEvents,'full inspection, pagination, filtering and complete download issue no salary write');
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:1000});await file.getByRole('button',{name:'Descargar borrador completo',exact:true}).focus();
   const layout=await master.evaluate(element=>({width:innerWidth,scroll:document.documentElement.scrollWidth,heights:[...element.querySelectorAll('button,input,select,textarea')].filter(e=>e.getClientRects().length).map(e=>(e.type==='checkbox'?e.closest('label')??e:e).getBoundingClientRect().height),focused:element.contains(document.activeElement)}));
   fs.writeFileSync(path.join(output,'capacity-browser-layout-'+width+'.json'),JSON.stringify(layout,null,2)+'\n');
   ok(layout.scroll<=layout.width+2&&layout.heights.every(h=>h>=44)&&layout.focused,'full-volume draft supports keyboard and44px controls without overflow at'+width+'px');
   await master.screenshot({path:path.join(output,'capacity-browser-'+width+'.png')});
  }
  await page.setViewportSize({width:1440,height:1000});
  const changed=salaryItems(all.map((r,i)=>i===0?{...r,label:'=QA ficticia: conservar texto literal'}:r));
  await file.getByLabel('CSV del maestro salarial',{exact:true}).setInputFiles({name:'maestro-completo-sintetico.csv',mimeType:'text/csv',buffer:Buffer.from(salaryFileExport(changed))});
  await file.locator('[data-salary-file-impact]').waitFor();ok(await file.locator('.sc-file-changes>li').count()===1,'complete CSV compares one real change without losing3290 unchanged definitions');
  await file.getByRole('checkbox',{name:'Revisé todos los cambios del CSV. Incorporarlos sólo modifica el borrador.',exact:true}).check();await file.getByRole('button',{name:'Incorporar CSV revisado al borrador',exact:true}).click();
  await master.getByLabel('Motivo de la versión',{exact:true}).fill('Versión completa exclusivamente sintética para verificar recuperación');await master.getByRole('button',{name:'Revisar versión completa',exact:true}).click();
  lostAck=true;await master.locator('dialog').getByRole('button',{name:'Confirmar envío',exact:true}).click();await master.getByRole('heading',{name:'Envío pendiente de confirmación',exact:true}).waitFor({timeout:180000});
  await master.getByRole('button',{name:'Consultar confirmación',exact:true}).waitFor({state:'visible'});await page.waitForFunction(()=>![...document.querySelectorAll('[data-native-salary] button')].find(b=>b.textContent==='Consultar confirmación')?.disabled,{timeout:180000});
  assert.equal(posts.length,1);const pending=structuredClone(posts[0]);assert.deepEqual(pending.body.items,changed);assert.equal(pending.status,201);assert.equal(await eventCount(),initialEvents+1);
  await master.getByRole('button',{name:'Consultar confirmación',exact:true}).click();await master.getByText('Se recuperó la confirmación del mismo envío.',{exact:true}).waitFor({timeout:240000});
  assert.equal(posts.length,1);assert.equal(salarySerialized(posts[0]),salarySerialized(pending));assert.equal(await eventCount(),initialEvents+1);ok(true,'actual SQL lost-ACK recovery preserves all3291 rows and the same body/key without another POST');
  // Hold an actual next block, withdraw the local page, then release it.
  holdPage='1';const beforeHide=reads.length;await master.getByRole('button',{name:'Consultar maestro propio',exact:true}).click();
  for(let n=0;!releasePage&&n<2400;n++)await new Promise(resolve=>setTimeout(resolve,25));assert.ok(releasePage,'SECOND_BLOCK_NOT_REACHED');
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));const resume=releasePage;releasePage=null;resume();
  await master.getByText('La sesión terminó.',{exact:false}).waitFor();await page.waitForFunction(()=>![...document.querySelectorAll('[data-native-salary] button')].find(b=>b.textContent==='Consultar maestro propio')?.disabled,{timeout:60000});
  ok(await master.getByRole('button',{name:'Preparar nueva versión',exact:true}).count()===0&&reads.slice(beforeHide).filter(r=>r.resource==='stream').length===2,'pagehide during real multipage reading clears the master and stops before a third block');
  await open();holdPage='1';await master.getByRole('button',{name:'Consultar maestro propio',exact:true}).click();
  for(let n=0;!releasePage&&n<2400;n++)await new Promise(resolve=>setTimeout(resolve,25));assert.ok(releasePage,'SECOND_BLOCK_NOT_REACHED');setReadRevoked(true);const resumeRevoked=releasePage;releasePage=null;
  const revokedResponse=page.waitForResponse(r=>r.url().includes('resource=stream&page=1')&&r.status()===403,{timeout:60000});resumeRevoked();await revokedResponse;
  await page.waitForFunction(()=>![...document.querySelectorAll('[data-native-salary] button')].find(b=>b.textContent==='Consultar maestro propio')?.disabled,{timeout:60000});
  ok(await master.locator('.sc-list').count()===0&&await master.getByRole('button',{name:'Preparar nueva versión',exact:true}).count()===0&&await eventCount()===initialEvents+1,'actual handler read revocation between blocks removes all data without a new event');setReadRevoked(false);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);ok(true,'full-volume compiled product completes with no JavaScript errors or external/private requests');
  fs.writeFileSync(path.join(output,'capacity-browser-proof.json'),JSON.stringify({ok:true,actualSql:true,syntheticIdentity:true,definitions:all.length,checks:checks.length,results:checks,posts:posts.length,sourceFrames:frames.length,errors,external,municipalWrites:0,durations},null,2)+'\n');await context.close();
 }catch(error){if(page&&!page.isClosed()){await page.screenshot({path:path.join(output,'capacity-browser-failure.png')}).catch(()=>{});fs.writeFileSync(path.join(output,'capacity-browser-failure.json'),JSON.stringify({message:error.message,body:(await page.locator('body').innerText()).slice(0,5000),reads:reads.length,posts:posts.map(p=>({key:p.key,rows:p.body.items?.length,status:p.status})),errors},null,2)+'\n');}throw error;
 }finally{setReadRevoked(false);if(releasePage)releasePage();await browser.close();}
}
