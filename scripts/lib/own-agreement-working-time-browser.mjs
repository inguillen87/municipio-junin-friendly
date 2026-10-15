// Built UI, real loopback HTTP, actual handlers and disposable PostgreSQL only.
// Authentication principals and every source row are explicit synthetic data.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {launchOwnSyntheticBrowser} from './own-synthetic-browser.mjs';
import {agreementTimeDraft,agreementTimeCsv,agreementTimeFile} from '../../assets/own-agreement-working-time-workspace.js';
import {AGREEMENT_WORKING_TIME_MAX_BYTES} from '../../assets/own-agreement-working-time-model.js';

// Forward the original paused IncomingMessage. The actual API owns raw-body
// consumption after authorization; even an audit data listener would start flow.
export async function forwardAgreementQaHttp(req,url,handler) {
  req.query=Object.fromEntries(url.searchParams);
  let status=200,payload;const headers={};
  await handler(req,{setHeader(k,v){headers[k]=String(v);},status(n){status=n;return this;},json(v){payload=v;return this;}});
  return{status,payload,headers};
}

// The observer uses Playwright's client-side copy, never the server's stream.
export function observeAgreementQaPost(request,origin) {
  const url=new URL(request.url());
  if(request.method()!=='POST'||url.origin!==origin||url.pathname!=='/api/internal-own-agreement-working-time')return null;
  assert.equal(url.search,'','AGREEMENT_QA_POST_QUERY_CHANGED');
  const bytes=request.postDataBuffer(),key=request.headers()['idempotency-key'];
  assert.ok(Buffer.isBuffer(bytes)&&bytes.length<=AGREEMENT_WORKING_TIME_MAX_BYTES,'AGREEMENT_QA_OBSERVED_BODY_INVALID');
  assert.ok(typeof key==='string'&&key.length>0,'AGREEMENT_QA_OBSERVED_KEY_MISSING');
  return{key,body:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)).payload,matched:false};
}

export function agreementQaHttpTasks({timeoutMs=30000}={}) {
  assert.ok(Number.isSafeInteger(timeoutMs)&&timeoutMs>0&&timeoutMs<=60000);
  const pending=new Set();
  return{
    get count(){return pending.size;},
    run(work){const task=Promise.resolve().then(work);pending.add(task);task.then(()=>pending.delete(task),()=>pending.delete(task));return task;},
    async drain(){
      const deadline=performance.now()+timeoutMs;
      while(pending.size){
        const left=deadline-performance.now();assert.ok(left>0,'AGREEMENT_QA_HTTP_DRAIN_TIMEOUT: '+pending.size+' handlers remain');
        let timer;try{await Promise.race([Promise.allSettled([...pending]),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('AGREEMENT_QA_HTTP_DRAIN_TIMEOUT: '+pending.size+' handlers remain')),left);})]);}finally{clearTimeout(timer);}
      }
    }
  };
}

export async function verifyAgreementWorkingTimeBrowser({handlers,env,actors,setActor,period,output,check,bootstrap,revoke,restore,browserName='chromium'}) {
  assert.equal(browserName,'chromium');
  const root=fs.realpathSync(new URL('../../public',import.meta.url)),errors=[],writes=[],reads=[],observedPosts=[],inFlight=agreementQaHttpTasks();
  const caps=['workforce.employee.read','payroll.parameter.read','payroll.parameter.prepare','payroll.parameter.approve','payroll.calculation.read','payroll.calculation.nominal.read'];
  let current=actors.maker,allowed=true,drop=false,page,origin;
  setActor(current);
  const oldOrigin=env.INTERNAL_APP_ORIGIN;
  const server=http.createServer((req,res)=>{void inFlight.run(async()=>{
    const send=(status,value,headers={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...headers});res.end(JSON.stringify(value));};
    try {
      const url=new URL(req.url,origin);
      if(['/api/internal-own-agreement-working-time','/api/internal-own-payroll-program'].includes(url.pathname)) {
        const handler=url.pathname.includes('agreement-working-time')?handlers.agreementWorkingTime:handlers.program;
        const {status,payload,headers}=await forwardAgreementQaHttp(req,url,handler);
        if(url.pathname.includes('agreement-working-time')){
          if(req.method==='POST') {
            const observed=observedPosts.find(value=>!value.matched&&value.key===req.headers['idempotency-key']);
            assert.ok(observed,'AGREEMENT_QA_POST_NOT_OBSERVED');observed.matched=true;
            writes.push({status,key:observed.key,body:structuredClone(observed.body),receipt:payload?.data});
            if(drop&&payload?.ok){drop=false;return send(503,{ok:false,error:'Respuesta sintética interrumpida después de conservar la propuesta.'});}
          }else reads.push({resource:url.searchParams.get('resource')});
        }
        return send(status,payload,headers);
      }
      if(url.pathname==='/api/internal-auth')return send(200,{ok:true,authenticated:true,sessionVersion:2,user:{id:current.actorSessionId,email:current.actorEmail},access:{context:'tenant',tenant:{id:current.tenantId,roleKey:'QA'},tenantCapabilities:allowed?caps:[],platformCapabilities:[],platformRoles:[]},expiresAt:new Date(Date.now()+3600000).toISOString()});
      if(url.pathname==='/api/internal-payroll-parameters')return send(200,{ok:true,flags:{grhMutation:false,payrollCalculated:false,payrollPosted:false,currentCatalogVerified:false,proposalApproved:false},principal:{tenantId:current.tenantId,membershipId:current.membershipId,certifiedBindingId:current.bindingId,employmentLinked:false,capabilities:caps},proposals:[],total:0});
      if(url.pathname==='/api/internal-data')return send(200,{ok:true,status:'ready',sourcePolicy:{label:'QA SINTÉTICA'},latestClosed:{},currentOpen:{},runs:[],quality:{},limitations:[]});
      if(url.pathname.startsWith('/api/'))return send(403,{ok:false,error:'API ajena a esta prueba sintética.'});
      const file=path.resolve(root,url.pathname==='/nomina'?'nomina-control.html':'.'+url.pathname);
      if(req.method!=='GET'||!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return send(404,{ok:false});
      res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]??'application/octet-stream','Cache-Control':'no-store'});res.end(fs.readFileSync(file));
    }catch(error){errors.push('HTTP QA: '+error.message);if(!res.headersSent)send(500,{ok:false,error:'Synthetic HTTP QA failure'});else res.end();}
  }).catch(error=>errors.push('HTTP QA handler: '+error.message));
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  origin='http://127.0.0.1:'+server.address().port;env.INTERNAL_APP_ORIGIN=origin;
  const {browser}=await launchOwnSyntheticBrowser();
  try {
    const context=await browser.newContext({viewport:{width:1440,height:1100},locale:'es-AR',serviceWorkers:'block'});
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
    page.on('request',request=>{try{const observed=observeAgreementQaPost(request,origin);if(observed)observedPosts.push(observed);}catch(error){errors.push('HTTP QA observation: '+error.message);}});
    const s=key=>page.locator('[data-agreement-time-'+key+']'),panel=page.getByRole('region',{name:'Horas mensuales por convenio',exact:true});
    const idle=()=>page.waitForFunction(()=>document.querySelector('.own-agreement-time')?.getAttribute('aria-busy')==='false');
    const park=async()=>{await inFlight.drain();await page.goto('about:blank');await inFlight.drain();};
    const actor=async value=>{await park();current=value;setActor(value);};
    const fresh=async()=>{await park();await page.goto(origin+'/nomina#horas-convenio');await page.waitForFunction(()=>document.querySelector('[data-agreement-time-period]')?.closest('fieldset')?.disabled===false);await idle();await inFlight.drain();};
    const consult=async()=>{await s('period').fill(period);await s('refresh').click();await idle();await s('content').waitFor({state:'visible'});await inFlight.drain();};
    const complete=await bootstrap(),count=complete.source.agreements.length;assert.ok(count>61);await fresh();await consult();assert.equal(writes.length,0);
    check((await s('count').innerText()).includes(count+' convenios')&&await s('rows').locator('article').count()===25,'built agreement-hours UI opens all approved own agreements across pages over actual HTTP and SQL');
    for(const width of[390,320]) {
      await page.setViewportSize({width,height:1000});
      check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'agreement-hours screen has no page overflow at '+width+'px');
      check(await s('refresh').evaluate(e=>e.getBoundingClientRect().height>=44),'complete-query control has a44px accessible target at '+width+'px');
      await panel.screenshot({path:path.join(output,'agreement-hours-mobile-'+width+'.png')});
    }
    await page.setViewportSize({width:1440,height:1100});
    await panel.getByText('Usar una constancia común para todos los convenios',{exact:true}).click();
    await s('common-date').fill(period+'-01');await s('common-reference').fill('Constancia común exclusivamente sintética QA');await s('evidence').click();
    await s('search').fill('ningún convenio coincide con esta búsqueda');assert.equal(await s('rows').locator('article').count(),0);
    await panel.getByText('Trabajar con una planilla completa',{exact:true}).click();
    const downloading=page.waitForEvent('download');await s('download').click();const downloaded=await downloading,filename=path.join(output,'agreement-hours-all-synthetic.csv');await downloaded.saveAs(filename);await idle();
    const draft=agreementTimeDraft(complete);for(const r of draft){r.definition.asOfDate=period+'-01';r.definition.documentReference='Constancia común exclusivamente sintética QA';}
    assert.deepEqual(agreementTimeFile(complete,fs.readFileSync(filename,'utf8')),draft);assert.equal(writes.length,0);
    check(true,'voluntary download conserves every retained and unknown agreement while search displays zero rows and sends no proposal');
    const changed=structuredClone(draft);changed.at(-1).definition.monthlyHours='0.00000000';
    const edited=path.join(output,'agreement-hours-edited-synthetic.csv');fs.writeFileSync(edited,agreementTimeCsv(complete,changed));
    await s('file').setInputFiles(edited);await s('import').click();await idle();assert.equal(writes.length,0);
    await s('reason').fill('Cambio completo exclusivamente sintético de navegador QA');await s('prepare').click();await idle();await s('comparison').waitFor({state:'visible'});
    await s('confirm').check();drop=true;await s('send').click();await idle();assert.equal(writes.length,1);
    const pending=structuredClone(writes[0]);assert.equal(pending.body.items.length,count);assert.deepEqual(pending.body.items,changed);assert.equal(pending.status,201);assert.ok(await s('recover').isVisible());assert.ok(await s('retry').isHidden());
    check(true,'actual HTTP interruption after commit preserves all rows including last-page zero and does not automatically replay POST');
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
    assert.ok(await s('content').isHidden());assert.equal(await s('rows').innerText(),'');
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
    await inFlight.drain();allowed=false;await revoke();await s('access').click();await idle();await inFlight.drain();assert.ok(await s('recover').isDisabled());assert.equal(writes.length,1);
    check(true,'hiding and real SQL linkage revocation clear all visible preparation and block pending replay without changing original body/key');
    await inFlight.drain();allowed=true;await restore();await s('access').click();await idle();await s('recover').click();await idle();await inFlight.drain();assert.ok(await s('receipt').isVisible());assert.equal(writes.length,1);assert.deepEqual(writes[0],pending);assert.ok(reads.some(r=>r.resource==='attempt'));
    check(true,'read-only HTTP attempt recovery confirms the original stored proposal after access renewal');
    await actor(actors.checker);await fresh();await consult();await panel.getByText('Propuestas y decisiones anteriores',{exact:true}).click();await s('proposal').selectOption(pending.receipt.proposalId);await s('open').click();await idle();assert.ok(await s('review').isEnabled());
    await s('decision').selectOption('approve');await s('decision-reason').fill('Revisión independiente completa exclusivamente sintética QA');await s('review').click();await idle();await s('confirm').check();await s('send').click();await idle();assert.equal(writes.length,2);assert.equal(writes[1].receipt.body.command,'approve');assert.ok(await s('receipt').isVisible());
    check(true,'independent actual SQL reviewer opens and approves the whole unchanged proposal through the built UI');
    await actor(actors.maker);await fresh();await consult();assert.deepEqual((await bootstrap()).configuration.items,changed);await panel.screenshot({path:path.join(output,'agreement-hours-desktop.png')});
    await inFlight.drain();await page.goto(origin+'/nomina#reglas');await page.locator('[data-program-content]').waitFor({state:'visible'});await inFlight.drain();
    const agreementFlag=page.locator('[data-program-agreement-time]');assert.ok(await agreementFlag.isChecked());assert.ok(await agreementFlag.isDisabled());
    await page.locator('[data-program-add-binding]').click();
    await page.locator('[data-program-field=binding-source]').selectOption('agreement_time_fact');
    await page.locator('[data-program-field=binding-agreement-time]').selectOption('monthlyHours');
    assert.deepEqual(await page.locator('[data-program-field=binding-unit] option').allTextContents(),['Elegir…','Horas declaradas']);
    assert.deepEqual(await page.locator('[data-program-field=binding-missing] option').allTextContents(),['Elegir…','Bloquear si no está informado y aprobado']);
    assert.deepEqual(await page.locator('[data-program-field=binding-combine] option').allTextContents(),['Elegir…','Un componente reconocido y aprobado']);
    assert.equal(writes.length,2);
    check(true,'rule editor exposes the separate monthly agreement source with hours, required approval and single value; existing approved opt-in cannot be removed');
    await inFlight.drain();assert.equal(inFlight.count,0);assert.equal(observedPosts.length,2);assert.ok(observedPosts.every(value=>value.matched));assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(output,'agreement-hours-browser-proof.json'),JSON.stringify({ok:true,browser:browserName,actualHttp:true,actualHandlers:true,actualSql:true,rawIncomingMessage:true,bodyAuditedFromClientOnly:true,handlerDrainBeforeActorChange:true,pendingHandlers:inFlight.count,observedPosts:observedPosts.length,syntheticAuth:true,syntheticOnly:true,productiveBusinessWrites:0,agreements:count,writes:writes.length,reads:reads.length,errors},null,2)+'\n');
  }catch(e){if(page&&!page.isClosed())await page.screenshot({path:path.join(output,'agreement-hours-browser-failure.png'),fullPage:true});throw e;}
  finally{
    try{await inFlight.drain();}finally{
      try{await browser.close();await inFlight.drain();allowed=true;await restore();current=actors.maker;setActor(current);}
      finally{env.INTERNAL_APP_ORIGIN=oldOrigin;await new Promise(resolve=>server.close(resolve));}
    }
  }
}
