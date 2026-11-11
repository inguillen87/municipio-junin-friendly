// Full built /nomina shell, default active F4, synthetic GET transport only.
// This does not connect to SQL or the SDK and cannot certify municipal access.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {OWN_CLOSE_NOMINAL} from '../../assets/own-payroll-close-model.js';
import {OWN_RUN_FULL_JSON} from '../../assets/own-payroll-response.js';
import {fiscalFactsHash} from '../../assets/own-fiscal-facts-model.js';
import {jurisdictionFixture} from '../../tests/fixtures/own-payroll-jurisdiction-synthetic.js';
import {reportCensusFixture,liquidationDetailFor} from '../../tests/fixtures/own-payroll-report-census-synthetic.js';
import {syntheticLedgerSlices} from '../../tests/fixtures/own-f931-current-state-ledger-synthetic.js';
import {openQaPayrollSidebarTask} from './qa-payroll-sidebar-navigation.mjs';

export async function verifyOwnF931DefaultActiveBrowser({browser,origin,root,output,check,errors,writes,downloads}){
 const ledger=syntheticLedgerSlices();
 assert.equal(ledger.reduce((n,s)=>n+s.census.eventCount,0),26,'original synthetic ledger must retain all26 events');
 async function inspect(viewport,label){
  let fixture=jurisdictionFixture(61),reopened=[],allowed=true,authStatus=200,fiscalReads=0;
  let fullFault=null,missingCapture=false,corrupt=false,unavailable=false,heldAuth=null;
  const traffic=[],fullResponses=[],caps=Object.freeze([...OWN_CLOSE_NOMINAL,'payroll.read']);
  const context=await browser.newContext({viewport,locale:'es-AR',serviceWorkers:'block'});
   await context.addInitScript(()=>{
    const original=window.setInterval.bind(window),state={count:0,run:null,done:false,error:null};window.__f931QaInterval=state;
    window.setInterval=(fn,ms,...args)=>{
     if(ms===20000&&typeof fn==='function'&&String(new Error().stack).includes('/assets/own-f931-preparation-panel.js')){
      state.count++;state.run=()=>{state.done=false;state.error=null;Promise.resolve().then(()=>fn(...args)).then(()=>{state.done=true;},e=>{state.error=String(e?.message??e);state.done=true;});};
      return original(()=>{},ms);
     }
     return original(fn,ms,...args);
    };
   });
  const full=async(route,data)=>{
   const bytes=Buffer.from(JSON.stringify({ok:true,data}),'utf8');
   const body=fullFault==='utf8'?Buffer.from([0xc3,0x28]):bytes;
   const announced=String(body.length+(fullFault==='bytes'?1:0));
   fullResponses.push({actual:body.length,announced:Number(announced),fault:fullFault});
   return route.fulfill({status:200,contentType:fullFault==='mime'?'application/json':OWN_RUN_FULL_JSON+'; charset=utf-8',headers:{'x-municontrol-json-bytes':announced,'cache-control':'private, no-store'},body});
  };
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());if(url.origin!==origin)return route.abort();
   if(req.method()!=='GET')writes.push({method:req.method(),path:url.pathname});
   if(url.pathname==='/api/internal-auth'){
     const hold=heldAuth;if(hold){heldAuth=null;hold.entered();await hold.wait;}
    if(authStatus===401)return route.fulfill({status:401,json:{ok:false,error:'Synthetic session expired'}});
    return route.fulfill({json:{ok:true,authenticated:true,sessionVersion:2,user:{id:'f931-synthetic-user',email:'f931-qa@example.invalid'},access:{context:'tenant',tenant:{id:'10000000-0000-4000-8000-000000009991',roleKey:'QA'},tenantCapabilities:allowed?caps:[],platformCapabilities:[],platformRoles:[]},expiresAt:new Date(Date.now()+3600000).toISOString()}});
   }
   if(url.pathname==='/api/internal-own-fiscal-facts'){
    if(!allowed)return route.fulfill({status:403,json:{ok:false,error:'Synthetic fiscal access revoked'}});
    assert.equal(req.method(),'GET');assert.deepEqual([...url.searchParams.keys()].sort(),['period','resource']);assert.equal(url.searchParams.get('resource'),'census');
    assert.equal(url.searchParams.get('period'),fixture.query.from);fiscalReads++;
    traffic.push({kind:'fiscal',keys:[...url.searchParams.keys()],accept:req.headers().accept});
    return route.fulfill({json:{ok:true,data:{version:'own-fiscal-census.v1',period:fixture.query.from,scopeVersion:'b'.repeat(64),stateVersion:await fiscalFactsHash([]),rows:[],complete:true,payrollCalculated:false,payrollPosted:false}}});
   }
   if(['/api/internal-own-payroll-close','/api/internal-own-payroll-liquidation'].includes(url.pathname)){
    if(!allowed)return route.fulfill({status:403,json:{ok:false,error:'Synthetic historical access revoked'}});
    assert.equal(req.method(),'GET');assert.equal(req.headers().accept,OWN_RUN_FULL_JSON,'default active routes require FULL');
    const query=url.searchParams,resource=query.get('resource'),capture=url.pathname.endsWith('-liquidation');
    assert.deepEqual([...query.keys()].sort(),capture||resource==='group'?['id','resource']:['liquidationType','period','resource']);
    traffic.push({kind:capture?'capture':resource,keys:[...query.keys()],accept:req.headers().accept,id:query.get('id')});
    if(unavailable)return route.fulfill({status:503,json:{ok:false,code:'OWN_CLOSE_CONTRACT_INVALID',error:'No se verificó el resultado histórico contra todas sus fuentes guardadas.'}});
    if(capture){
     assert.equal(resource,'detail');
     const original=fixture.details.flatMap(d=>d.captures).find(c=>c.id===query.get('id'));
     if(missingCapture||!original)return route.fulfill({status:404,json:{ok:false,code:'OWN_LIQ_SOURCE_NOT_FOUND',error:'No se encontró la captura original.'}});
     return full(route,liquidationDetailFor(structuredClone(original)));
    }
    assert.ok(['report-census','group'].includes(resource),'operational close-detail fallback is forbidden');
    if(resource==='report-census'){
     assert.equal(query.get('period'),fixture.query.from);assert.ok(fixture.query.types.includes(query.get('liquidationType')));
     return full(route,reportCensusFixture(fixture,{period:query.get('period'),liquidationType:query.get('liquidationType'),reopened}));
    }
    const receipt=fixture.receipts.find(r=>r.groupId===query.get('id'));
    if(!receipt)return route.fulfill({status:404,json:{ok:false,error:'Original synthetic group not found'}});
    const data=structuredClone(receipt);if(corrupt)data.snapshotSha256='e'.repeat(64);
    return full(route,data);
   }
   if(url.pathname==='/api/internal-data')return route.fulfill({json:{ok:true,status:'ready',sourcePolicy:{label:'QA SINTÉTICA'},latestClosed:{},currentOpen:{},runs:[],quality:{},limitations:[]}});
   if(url.pathname.startsWith('/api/'))return route.fulfill({status:403,json:{ok:false,error:'Outside synthetic test scope'}});
   const file=path.resolve(root,url.pathname==='/nomina'?'nomina-control.html':'.'+url.pathname);
   if(req.method()!=='GET'||!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
   return route.fulfill({contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'}[path.extname(file)]??'application/octet-stream',body:fs.readFileSync(file)});
  });
  const page=await context.newPage();page.setDefaultTimeout(15000);
  page.on('pageerror',e=>errors.push(e.message));page.on('download',d=>downloads.push(d));
  let navigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
  const $=key=>page.locator('.own-f931 [data-own-f931-'+key+']');
  const idle=()=>page.waitForFunction(()=>document.querySelector('.own-f931')?.getAttribute('aria-busy')==='false');
  const openTechnical=async()=>{if(!(await $('technical').evaluate(n=>n.open)))await $('technical').locator('summary').click();await $('technical').evaluate(n=>new Promise(r=>{const ok=()=>[...n.children].filter(c=>c.tagName!=='SUMMARY').every(c=>c.checkVisibility());if(ok())return r();const t0=performance.now();const tick=()=>ok()||performance.now()-t0>2000?r():requestAnimationFrame(tick);tick();}));};/* sections open with a short animation: read once rendered */
  const consult=async()=>{await $('consult').click();await idle();};
  const populate=async()=>{await $('period').fill(fixture.query.from);await $('date').fill('2026-10-31');await consult();};
  const hidden=async()=>await $('view').isHidden()&&await $('csv').isDisabled();
  const download=async()=>{const event=page.waitForEvent('download');await $('csv').click();const d=await event;await idle();return {d,csv:fs.readFileSync(await d.path(),'utf8')};};
  // Same legitimate publication used by gate.start(): verified auth GET, product apply,
  // then its normalized return in the normal event. No new UI refresh feature is claimed.
  const publishVerifiedGlobalSession=async expectedCaps=>{
   const observed=await page.evaluate(async()=>{
    const response=await fetch('/api/internal-auth',{method:'GET',credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json','Cache-Control':'no-store'}});
    return {status:response.status,ok:response.ok,payload:await response.json()};
   });
   assert.equal(observed.status,200);assert.equal(observed.ok,true);const fresh=observed.payload;
   assert.equal(fresh.ok,true);assert.equal(fresh.authenticated,true);assert.equal(fresh.sessionVersion,2);
   assert.equal(fresh.user.id,'f931-synthetic-user');assert.equal(fresh.user.email,'f931-qa@example.invalid');
   assert.equal(fresh.access.context,'tenant');assert.equal(fresh.access.tenant.id,'10000000-0000-4000-8000-000000009991');assert.equal(fresh.access.tenant.roleKey,'QA');
   assert.ok(Date.parse(fresh.expiresAt)>Date.now());assert.ok(Array.isArray(fresh.access.tenantCapabilities));
   assert.deepEqual([...fresh.access.tenantCapabilities].sort(),[...expectedCaps].sort());
   assert.deepEqual(fresh.access.platformCapabilities,[]);assert.deepEqual(fresh.access.platformRoles,[]);
   await page.evaluate(access=>{
    if(typeof window.MuniControlCapabilityGate?.apply!=='function')throw Error('Product capability gate API unavailable');
    const applied=window.MuniControlCapabilityGate.apply(document,access,location.href);
    document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:applied}));
   },fresh.access);await idle();
  };
  try{
   await page.goto(origin+'/nomina#f931',{waitUntil:'domcontentloaded'});
   await openQaPayrollSidebarTask(page,{profile:'payroll-sidebar',task:'f931'});await $('consult').waitFor({state:'visible'});
   await idle();
   check(await page.evaluate(async()=>{const m=await import('/assets/own-f931-history-admission.js');return m.ownF931HistoryAdmission(m.OWN_F931_HISTORY_ADMISSION).activated===true;}),label+': actual built default F4 stays active without an admission override');
   check(/^(?:|\d{4}-\d{2})$/.test(await $('period').inputValue())&&await $('date').inputValue()==='',label+': presentation has no automatic default; the month may come preselected (owner decision edc012a6)');
   const start=traffic.length;await populate();const initial=traffic.slice(start);
   check(await $('technical').getAttribute('open')===null,label+': technical references start closed after a complete historical review');await openTechnical();
   await $('basis').filter({hasText:'censo completo de cierres conservados'}).waitFor().catch(()=>{});/* sections open with a short animation */check(await $('view').isVisible()&&(await $('count').innerText()).includes('61 participaciones')&&(await $('basis').innerText()).includes('censo completo de cierres conservados'),label+': real full shell renders61 original participations from the historical census');
   check(initial.filter(q=>q.kind==='report-census').length===2&&initial.filter(q=>q.kind==='group').length===1&&initial.filter(q=>q.kind==='capture').length===2&&new Set(initial.filter(q=>q.kind==='capture').map(q=>q.id)).size===2&&initial.filter(q=>q.kind==='fiscal').length===2,label+': full census bookend, original group, both distinct captures and fiscal bookend are complete');
   check(initial.filter(q=>q.kind!=='fiscal').every(q=>q.accept===OWN_RUN_FULL_JSON)&&fullResponses.every(r=>r.actual===r.announced),label+': all historical sources negotiate FULL with exact announced UTF8 bytes');
   await $('contracts').locator('summary').click();check(await $('contract-rows').locator('article').count()===20,label+': first page contains20 of61 original contracts');
   await $('contract-next').click();await $('contract-next').click();await $('contract-next').click();check(await $('contract-rows').locator('article').count()===1,label+': the final original contract remains accessible');
   // Exercise the panel's original20s callback, not an equivalent test implementation.
   check(await page.evaluate(()=>window.__f931QaInterval?.count===1&&typeof window.__f931QaInterval.run==='function'),label+': captures exactly the actual panel session interval');
   await $('search').focus();
   await page.evaluate(()=>{
    const q=key=>document.querySelector('[data-own-f931-'+key+']'),p={search:q('search'),table:q('fields').querySelector('table'),rows:[...q('contract-rows').children],controls:['target','search','contract-search','contract-state','csv'].map(q),disabledSeen:false,liveWrites:0};window.__f931QaPollProbe=p;
    p.controlsObserver=new MutationObserver(records=>{if(records.some(r=>r.oldValue!==null||r.target.disabled))p.disabledSeen=true;});for(const n of p.controls)p.controlsObserver.observe(n,{attributes:true,attributeOldValue:true,attributeFilter:['disabled']});
    p.liveObserver=new MutationObserver(records=>{p.liveWrites+=records.length;});for(const key of ['status','page','contract-count','contract-page'])p.liveObserver.observe(q(key),{subtree:true,childList:true,characterData:true});
    p.snapshot=()=>({focus:document.activeElement===p.search,table:q('fields').querySelector('table')===p.table,rows:q('contract-rows').children.length===p.rows.length&&p.rows.every((row,i)=>q('contract-rows').children[i]===row),disabled:p.disabledSeen||p.controls.some(n=>n.disabled||n.matches(':disabled')),liveWrites:p.liveWrites,busy:document.querySelector('.own-f931').getAttribute('aria-busy')});
   });
   let releaseAuth,authEntered,gateDeadline;const entered=new Promise(resolve=>{authEntered=resolve;}),wait=new Promise(resolve=>{releaseAuth=resolve;});heldAuth={entered:authEntered,wait};
   try{
    await page.evaluate(()=>{window.__f931QaInterval.run();});await Promise.race([entered,new Promise((_,reject)=>{gateDeadline=setTimeout(()=>reject(Error('Synthetic session poll did not request auth')),15000);})]);clearTimeout(gateDeadline);
    const during=await page.evaluate(()=>window.__f931QaPollProbe.snapshot());check(during.focus&&during.table&&during.rows&&!during.disabled&&during.liveWrites===0&&during.busy==='false',label+': a pending same-session poll preserves real focus, exact table/legajo nodes and live regions without disabling controls');
    releaseAuth();await page.waitForFunction(()=>window.__f931QaInterval.done);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const after=await page.evaluate(()=>window.__f931QaPollProbe.snapshot());check(after.focus&&after.table&&after.rows&&!after.disabled&&after.liveWrites===0&&after.busy==='false'&&await page.evaluate(()=>window.__f931QaInterval.error===null),label+': identical session success leaves focus, nodes, controls and announcements intact');
   }finally{clearTimeout(gateDeadline);heldAuth=null;releaseAuth();await page.evaluate(()=>{window.__f931QaPollProbe.controlsObserver.disconnect();window.__f931QaPollProbe.liveObserver.disconnect();});}
   const beforePoll401=traffic.length;authStatus=401;await page.evaluate(()=>{window.__f931QaInterval.run();});await page.waitForFunction(()=>document.querySelector('[data-own-f931-view]').hidden&&document.querySelector('[data-own-f931-csv]').disabled);
   check(await hidden()&&await $('login').isVisible()&&traffic.length===beforePoll401,label+': the same background poll retires the complete review on401 before any historical/fiscal query');authStatus=200;await $('access').click();await idle();await consult();check(await $('view').isVisible()&&navigations===1,label+': explicit access recovery after poll401 keeps the original document and complete-source consultation');
   await $('jurisdiction').selectOption('42');await consult();check((await $('count').innerText()).includes('31 participaciones en Jurisdicción 42 de 61 del alcance completo'),label+':42 is a view of the conserved complete61-participation scope');
   await $('jurisdiction').selectOption('55');await consult();check((await $('count').innerText()).includes('30 participaciones en Jurisdicción 55 de 61 del alcance completo'),label+':55 recovers its conserved view without F5');
   await $('jurisdiction').selectOption('all');await consult();
   check(await $('technical').getAttribute('open')===null,label+': a new jurisdiction review keeps technical references closed');await openTechnical();check(await $('fields').locator('tbody tr').count()===60&&(await $('fields').locator('tbody th[scope="row"]').last().innerText()).startsWith('60 ·')&&await $('prev').count()===0&&await $('next').count()===0,label+': default-active manual table retains all60 fields without pagination');
   check(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),label+': open60-field reference table creates no body overflow');await $('fields').locator('tbody tr').last().scrollIntoViewIfNeeded();
   check(await $('fields').evaluate(wrap=>{const last=wrap.querySelector('tbody tr:last-child'),region=wrap.getBoundingClientRect(),row=last?.getBoundingClientRect();return wrap.scrollTop>0&&wrap.scrollHeight>wrap.clientHeight&&!!row&&row.top>=region.top-1&&row.bottom<=region.bottom+1;}),label+': internal reference-table scrolling reaches the complete field60 row');await page.screenshot({path:path.join(output,label+'-manual-reference-field60.png'),fullPage:false});await $('search').fill('remuneración');
   const exported=await download();check((exported.csv.match(/"Campo \d+ ·/g)??[]).length===60&&!exported.csv.includes(fixture.receipts[0].groupId)&&!exported.csv.includes(fixture.receipts[0].body.reason),label+': voluntary CSV keeps all60 fields despite search and excludes identifiers/free text');
   check(traffic.every(q=>!q.keys.includes('jurisdiction')&&!q.keys.includes('target')&&!q.keys.includes('tenantId')),label+': no jurisdiction, destination or tenant override reaches a historical API');
   await $('date').fill('2026-11-30');await consult();await openTechnical();check(!(await $('version').innerText()).includes('Requiere versión 48')&&(await $('version').innerText()).includes('Debe verificarse el diseño aplicable'),label+': November30 does not select V48 or claim an earlier layout homologated');
   await $('date').fill('2026-12-01');await consult();await openTechnical();check((await $('version').innerText()).includes('Requiere versión 48'),label+': December1 requires V48 for the earlier period without reload');
   const dataBefore401=traffic.length;authStatus=401;await $('csv').click();await idle();
   check(await hidden()&&await $('login').isVisible()&&traffic.length===dataBefore401,label+': HTTP401 withdraws the review before any historical or fiscal GET');
   authStatus=200;await $('access').click();await idle();await consult();check(await $('view').isVisible()&&navigations===1,label+': authenticated source recovery keeps one document navigation');
   allowed=false;await $('csv').click();await idle();check(await hidden(),label+':403 permission withdrawal retires the complete review and voluntary download');
   allowed=true;await $('access').click();await idle();await consult();
   missingCapture=true;await consult();check(await hidden()&&await $('period').inputValue()===fixture.query.from,label+': an absent original capture rejects the whole review and preserves the entered period');
   missingCapture=false;await consult();check(await $('view').isVisible()&&navigations===1,label+': an explicit reconsultation recovers the original capture without F5');
   corrupt=true;await consult();check(await hidden(),label+': an altered group snapshot hash cannot become a partial preparation');corrupt=false;await consult();
   for(const fault of ['mime','bytes','utf8']){
    fullFault=fault;const before=downloads.length;await consult();check(await hidden()&&downloads.length===before,label+': malformed FULL '+fault+' retires all data and prevents CSV');
    fullFault=null;await consult();check(await $('view').isVisible()&&navigations===1,label+': FULL '+fault+' recovers only through a new complete consultation');
   }
   unavailable=true;await consult();check(await hidden()&&await $('period').inputValue()===fixture.query.from&&await $('date').inputValue()==='2026-12-01',label+':503 history error preserves period/date and exposes no partial preparation');
   unavailable=false;await consult();
   check(await page.locator('.own-f931 input:visible, .own-f931 select:visible').evaluateAll(nodes=>nodes.every(n=>n.labels?.length>0||n.hasAttribute('aria-label'))),label+': default active form keeps accessible labels');
   check(await page.locator('.own-f931 button:visible, .own-f931 select:visible').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().height>=44)),label+': default active touch controls are at least44px');
   check(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),label+': the real active shell has no horizontal overflow');
   check(await page.evaluate(()=>!Object.keys(localStorage).some(k=>/f931/i.test(k))),label+': no historical fiscal source is stored in localStorage');
   // Exact R9 slices: do not invent captures for the v1/retyped closures whose originals were not kept.
   const formBeforeGlobal={period:await $('period').inputValue(),date:await $('date').inputValue()},dataBeforeGlobal=traffic.length,globalRequests=[];
   const watchGlobal=request=>{const u=new URL(request.url());if(u.pathname.startsWith('/api/'))globalRequests.push({origin:u.origin,path:u.pathname,method:request.method()});};
   page.on('request',watchGlobal);
   try{
    allowed=false;await publishVerifiedGlobalSession([]);
    check(await page.locator('#mainContent').isHidden()&&await hidden()&&await $('count').textContent()===''&&await $('contract-rows').textContent()==='',label+': verified global revocation hides the real parent and retires the nominal review');
    allowed=true;await publishVerifiedGlobalSession(caps);
    check(await page.locator('#mainContent').isVisible()&&await hidden()&&await $('count').textContent()===''&&await $('contract-rows').textContent()===''&&await $('period').inputValue()===formBeforeGlobal.period&&await $('date').inputValue()===formBeforeGlobal.date&&traffic.length===dataBeforeGlobal&&globalRequests.length>0&&globalRequests.every(r=>r.origin===origin&&r.path==='/api/internal-auth'&&r.method==='GET'),label+': verified global restoration reveals the parent with only auth GETs and keeps the old review withdrawn');
   }finally{page.off('request',watchGlobal);}
   const afterGlobalMark=traffic.length;await consult();const afterGlobal=traffic.slice(afterGlobalMark);
   await $('basis').filter({hasText:'censo completo de cierres conservados'}).waitFor().catch(()=>{});/* sections open with a short animation */check(await $('view').isVisible()&&(await $('count').innerText()).includes('61 participaciones')&&afterGlobal.filter(q=>q.kind==='report-census').length===2&&afterGlobal.filter(q=>q.kind==='group').length===1&&afterGlobal.filter(q=>q.kind==='capture').length===2&&afterGlobal.filter(q=>q.kind==='fiscal').length===2&&navigations===1,label+': after global restoration a new complete consultation recovers all original sources without F5');
   const reopenedSlice=ledger.find(s=>s.label==='v1-reopened');fixture=reopenedSlice.fixture;reopened=reopenedSlice.reopened;await populate();
   check(await $('view').isVisible()&&await $('empty').isVisible()&&await $('populated').isHidden()&&(await $('empty-copy').innerText()).includes('Hay 1 grupo reabierto excluido'),label+': a conserved reopened v1 group contributes no currently closed participation and is named in the empty result');check(await $('technical').getAttribute('open')===null,label+': an empty reopened review also starts with technical references closed');check(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),label+': the empty reopened result has no body overflow');await $('empty').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,label+'-empty-reopened.png'),fullPage:false});await openTechnical();check((await $('coverage').innerText()).includes('1 grupos reabiertos excluidos'),label+': the complete technical coverage retains the reopened-group count');
   const absentSlice=ledger.find(s=>s.label==='v1-historical');fixture=absentSlice.fixture;reopened=[];await populate();
   check(await hidden()&&await $('period').inputValue()===fixture.query.from,label+': old closure with no original capture fails closed without borrowing a current run');
   const completeSlice=ledger.find(s=>s.label==='v2-complete');fixture=completeSlice.fixture;reopened=[];await populate();
   check(await $('view').isVisible()&&(await $('count').innerText()).includes('4 participaciones')&&navigations===1,label+': another complete slice of the original26-event fixture recovers without F5');
   check(traffic.every(q=>q.kind!=='detail'),label+': every consultation avoided the operational close-detail fallback');
   await page.screenshot({path:path.join(output,label+'.png'),fullPage:false});
   await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));check(await hidden(),label+': pagehide retires the active historical review and CSV');
  }finally{await context.close();}
 }
 await inspect({width:1366,height:900},'active-desktop');
 await inspect({width:390,height:844},'active-mobile390');
 await inspect({width:320,height:812},'active-mobile320');
 return {scope:'actual built /nomina shell default active F4; synthetic GET fixtures; no SQL/SDK/session acceptance',ledgerFixtureEvents:26};
}
