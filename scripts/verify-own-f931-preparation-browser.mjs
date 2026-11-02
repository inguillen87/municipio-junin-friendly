import {openQaPayrollSidebarTask} from './lib/qa-payroll-sidebar-navigation.mjs';
// Isolated browser, synthetic read fixtures, local built assets only.
// This is UI/transport regression QA, not municipal fiscal acceptance.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {OWN_CLOSE_NOMINAL} from '../assets/own-payroll-close-model.js';
import {reportFixture} from '../tests/fixtures/own-payroll-report-synthetic.js';
import {fiscalFactsHash} from '../assets/own-fiscal-facts-model.js';
import {jurisdictionFixture} from '../tests/fixtures/own-payroll-jurisdiction-synthetic.js';
import {sharedJurisdictionFixture} from '../tests/fixtures/own-f931-jurisdiction-synthetic.js';
const root=fs.realpathSync(new URL('../public',import.meta.url)),output=path.resolve(process.env.OWN_F931_QA_OUTPUT??'verification/own-f931-browser-20261011');
assert.ok(output.startsWith(fs.realpathSync(new URL('..',import.meta.url))+path.sep));fs.mkdirSync(output,{recursive:true});
const origin='http://127.0.0.1:4373',checks=[],errors=[],writes=[],downloads=[];
const check=(condition,message)=>{assert.ok(condition,message);checks.push(message);};
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
async function inspect(viewport,label,{shellAdmitted=true}={}){
 const pageCaps=Object.freeze([...OWN_CLOSE_NOMINAL,...(shellAdmitted?['payroll.read']:[])]);
 let fixture=reportFixture(61),allowed=true,corrupt=false,fiscalDrift=false,fiscalReads=0,fiscalDriftStart=null,authStatus=200;const closeQueries=[],fiscalQueries=[];
 const context=await browser.newContext({viewport,locale:'es-AR',serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.abort();
  if(req.method()!=='GET')writes.push({method:req.method(),path:u.pathname});
  if(u.pathname==='/api/internal-auth'&&authStatus===401)return route.fulfill({status:401,json:{ok:false,error:'Synthetic session expired'}});
  if(u.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,sessionVersion:2,user:{id:'f931-synthetic-user',email:'f931-qa@example.invalid'},access:{context:'tenant',tenant:{id:'10000000-0000-4000-8000-000000009991',roleKey:'QA'},tenantCapabilities:allowed?pageCaps:[],platformCapabilities:[],platformRoles:[]},expiresAt:new Date(Date.now()+3600000).toISOString()}});
  if(u.pathname==='/api/internal-own-fiscal-facts'){
   if(!allowed)return route.fulfill({status:403,json:{ok:false,error:'Synthetic access revoked'}});
   assert.equal(u.searchParams.get('resource'),'census');fiscalQueries.push([...u.searchParams.keys()]);fiscalReads++;return route.fulfill({json:{ok:true,data:{version:'own-fiscal-census.v1',period:u.searchParams.get('period'),scopeVersion:'b'.repeat(64),stateVersion:fiscalDrift&&fiscalReads===fiscalDriftStart+2?'c'.repeat(64):await fiscalFactsHash([]),rows:[],complete:true,payrollCalculated:false,payrollPosted:false}}});
  }
  if(u.pathname==='/api/internal-own-payroll-close'){
   if(!allowed)return route.fulfill({status:403,json:{ok:false,error:'Synthetic access revoked'}});
   const q=u.searchParams;closeQueries.push([...q.keys()]);const source=q.get('resource')==='detail'?fixture.details.find(d=>d.liquidationType===q.get('liquidationType'))??fixture.details[0]:fixture.receipts.find(r=>r.id===q.get('id'))??fixture.receipts[0],data=structuredClone(source);
   if(corrupt&&q.get('resource')==='group')data.snapshotSha256='e'.repeat(64);
   return route.fulfill({json:{ok:true,data}});
  }
  if(u.pathname==='/api/internal-data')return route.fulfill({json:{ok:true,status:'ready',sourcePolicy:{label:'QA SINTÉTICA'},latestClosed:{},currentOpen:{},runs:[],quality:{},limitations:[]}});
  if(u.pathname.startsWith('/api/'))return route.fulfill({status:403,json:{ok:false,error:'Outside synthetic test scope'}});
  const file=path.resolve(root,u.pathname==='/nomina'?'nomina-control.html':'.'+u.pathname);
  if(req.method()!=='GET'||!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
  return route.fulfill({contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'}[path.extname(file)]??'application/octet-stream',body:fs.readFileSync(file)});
 });
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('download',d=>downloads.push(d));
 await page.addInitScript(()=>{const state={created:[],revoked:[],timers:[],armed:false};window.__f931Urls=state;const createObjectURL=URL.createObjectURL.bind(URL),revokeObjectURL=URL.revokeObjectURL.bind(URL),realSetTimeout=window.setTimeout.bind(window);URL.createObjectURL=blob=>{const url=createObjectURL(blob);state.created.push(url);state.armed=true;return url;};URL.revokeObjectURL=url=>{state.revoked.push(url);return revokeObjectURL(url);};window.setTimeout=(fn,ms,...args)=>{if(state.armed&&ms===1000&&typeof fn==='function'){state.armed=false;const id=realSetTimeout(()=>{},0);state.timers.push({id,fn,fired:false});return id;}return realSetTimeout(fn,ms,...args);};});
 const $=k=>page.locator('.own-f931 [data-own-f931-'+k+']');
 const idle=()=>page.waitForFunction(()=>document.querySelector('.own-f931')?.getAttribute('aria-busy')==='false');
 const populate=async()=>{$('period');await $('period').fill(fixture.query.from);await $('date').fill('2026-10-31');await $('consult').click();await idle();};
 try{
  await page.goto(origin+'/nomina#f931',{waitUntil:'domcontentloaded'});
  if(!shellAdmitted){await page.evaluate(async()=>{await window.MuniControlCapabilityGate.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});check(!pageCaps.includes('payroll.read')&&await page.locator('#mainContent').isHidden()&&await page.locator('.own-f931').isHidden()&&!await $('consult').isVisible(),label+': nominal fiscal capabilities alone do not bypass payroll page admission');return;}
  await openQaPayrollSidebarTask(page,{profile:'payroll-sidebar',task:'f931'});await $('consult').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('[data-own-f931-target]')?.disabled);
  check(await $('period').inputValue()===''&&await $('date').inputValue()==='',label+': period/presentation are explicit, without date defaults');
  await populate();check(await $('view').isVisible(),label+': complete own closed preparation visible');check((await $('count').innerText()).includes('61 participaciones'),label+': all 61 closed participations included');await page.locator('.own-f931 summary',{hasText:'Ver totales exactos de nómina'}).click();check((await $('totals').innerText()).includes('Bruto'),label+': exact payroll totals identified separately from fiscal bases');
  const referenceDetails=page.locator('.own-f931 details').filter({hasText:'Consultar los 60 campos'});await referenceDetails.locator('summary').click();
  check(await $('fields').locator('article').count()===20,label+': fields paginated accessibly');await $('next').click();await $('next').click();check((await $('fields').innerText()).includes('Campo 60'),label+': final page includes field60');
  await $('search').fill('remuneración');check((await $('fields').innerText()).includes('Remuneración'),label+': search works');
  const event=page.waitForEvent('download');await $('csv').click();const d=await event;await idle();const csv=fs.readFileSync(await d.path(),'utf8');check((csv.match(/"Campo \d+ ·/g)??[]).length===60,label+': CSV includes all fields despite search/page');check(!csv.includes(fixture.receipts[0].groupId)&&!csv.includes(fixture.receipts[0].body.reason)&&!csv.includes(fixture.receipts[0].snapshotSha256),label+': CSV has no UUID/free text/source hash');check((await $('status').innerText()).includes('No es un TXT fiscal'),label+': download clearly describes preparation only');
  const before=downloads.length;fixture.details[0].stateVersion='c'.repeat(64);await $('csv').click();await idle();check(downloads.length===before&&(await $('status').innerText()).includes('Cambió la fuente'),label+': changed source replaces review without download');
  await $('date').fill('2026-11-01');check(!(await $('view').isVisible())&&await $('csv').isDisabled(),label+': changed presentation invalidates old review');await $('consult').click();await idle();check((await $('version').innerText()).includes('versión 48'),label+': old period presented after cutoff requires48');
  // Jurisdicción conservada: selector dentro de la consulta, reconsulta GET completa sin F5, filtro nunca en la API.
  const urlState=()=>page.evaluate(()=>({created:[...window.__f931Urls.created],revoked:[...window.__f931Urls.revoked],timers:window.__f931Urls.timers.length}));
  const fireTimer=index=>page.evaluate(i=>{const t=window.__f931Urls.timers[i];if(!t||t.fired)return false;t.fired=true;t.fn();return true;},index);
  const revokedCount=async url=>(await urlState()).revoked.filter(u=>u===url).length;
  const consult=async()=>{const closeBefore=closeQueries.length,fiscalBefore=fiscalReads,url=page.url();await $('consult').click();await idle();if(await $('view').isVisible()&&!(await $('contracts').evaluate(n=>n.open)))await $('contracts').locator('summary').click();return {closeCalls:closeQueries.length-closeBefore,fiscalCalls:fiscalReads-fiscalBefore,sameUrl:page.url()===url};};
  const downloadCsv=async()=>{const event=page.waitForEvent('download');await $('csv').click();const d=await event;await idle();return d;};
  check((await $('jurisdiction').locator('option').allTextContents()).join('|')==='Todas las jurisdicciones|Jurisdicción 42|Jurisdicción 55',label+': jurisdiction selector offers exactly Todas / 42 / 55');
  check((await $('coverage').innerText()).includes('No capturada en el cálculo: 61'),label+': v1 closes show every participation as not captured');
  const periodBefore=await $('period').inputValue();await $('jurisdiction').selectOption('42');
  check(!(await $('view').isVisible())&&await $('csv').isDisabled()&&(await $('status').innerText()).includes('jurisdicción')&&await $('period').inputValue()===periodBefore,label+': changing the jurisdiction invalidates the review, keeps the form and requires a complete reconsultation');
  const refused=await consult();check(refused.sameUrl&&!(await $('view').isVisible())&&(await $('status').innerText()).includes('No capturada en el cálculo: 61'),label+': 42 is refused for a scope with not-captured jurisdictions, with explicit counts and without reload');
  fixture=jurisdictionFixture(61);
  await $('jurisdiction').selectOption('all');const allRun=await consult();check((await $('count').innerText()).includes('61 participaciones')&&(await $('coverage').innerText()).includes('42: 31 · 55: 30')&&allRun.fiscalCalls===2&&allRun.closeCalls===3,label+': Todas keeps the complete census, reads the fiscal census twice and shows the conserved distribution');
  await $('jurisdiction').selectOption('42');const scopedRun=await consult();check((await $('count').innerText()).includes('31 participaciones en Jurisdicción 42 de 61 del alcance completo')&&(await $('contract-count').innerText()).includes('31 en la jurisdicción elegida')&&scopedRun.fiscalCalls===2&&scopedRun.closeCalls===3,label+': 42 shows the selected view against the complete scope with the same complete GET census');
  await $('jurisdiction').selectOption('55');await consult();check((await $('count').innerText()).includes('30 participaciones en Jurisdicción 55 de 61 del alcance completo'),label+': 55 shows its own selected view');
  check(closeQueries.every(keys=>!keys.includes('jurisdiction'))&&fiscalQueries.every(keys=>!keys.includes('jurisdiction')),label+': the jurisdiction never reaches the close or fiscal APIs');
  await $('jurisdiction').selectOption('42');await consult();const scopedDownload=await downloadCsv();const scopedCsv=fs.readFileSync(await scopedDownload.path(),'utf8');
  check(scopedDownload.suggestedFilename().endsWith('_jur42.csv')&&scopedCsv.includes('"Jurisdicción elegida";"Jurisdicción 42"')&&scopedCsv.includes('"42: 31 · 55: 30"')&&(scopedCsv.match(/"Campo \d+ ·/g)??[]).length===60&&!scopedCsv.includes(fixture.receipts[0].snapshotSha256),label+': scoped CSV names its jurisdiction, keeps the complete distribution, all 60 fields and no source hash');
  // Contrato compartido: 42 en mensual y 55 en suplementaria (capturas no conservadas), con censo fiscal leído.
  fixture=sharedJurisdictionFixture();await page.locator('.own-f931 [data-own-f931-types] input[value="supplementary"]').check();await $('jurisdiction').selectOption('all');const sharedAll=await consult();
  check((await $('count').innerText()).includes('2 grupos cerrados · 6 participaciones · 4 contratos distintos')&&(await $('coverage').innerText()).includes('Contratos con más de una jurisdicción: 2')&&(await $('coverage').innerText()).includes('2 sin identidad capturada')&&(await $('issues').innerText()).includes('no se suman entre jurisdicciones')&&sharedAll.closeCalls===6&&sharedAll.fiscalCalls===2,label+': shared contract scenario shows the complete universe, the mixed-jurisdiction notice and the global fiscal identity state');
  await $('jurisdiction').selectOption('42');await consult();check((await $('count').innerText()).includes('4 participaciones en Jurisdicción 42 de 6 del alcance completo')&&(await $('count').innerText()).includes('4 contratos distintos de 4 del alcance completo')&&(await $('coverage').innerText()).includes('2 sin identidad capturada'),label+': 42 lists the four contracts while fiscal identity state stays global');
  await $('jurisdiction').selectOption('55');await consult();check((await $('count').innerText()).includes('2 participaciones en Jurisdicción 55 de 6 del alcance completo')&&(await $('count').innerText()).includes('2 contratos distintos de 4 del alcance completo')&&(await $('coverage').innerText()).includes('Universo completo; 2 de 4 contratos en la jurisdicción elegida')&&(await $('contract-rows').locator('article[data-fiscal-state="identity_not_captured"]').count())===2,label+': 55 lists only the two shared contracts, both without captured identity, against the complete universe');
  await page.locator('.own-f931 [data-own-f931-types] input[value="supplementary"]').uncheck();
  // Universo conocido 42 consultado como 55: selección vacía rotulada, universo y totales completos conservados.
  fixture=jurisdictionFixture(61,()=>'42');await $('jurisdiction').selectOption('55');await consult();
  check(await $('view').isVisible()&&(await $('status').innerText()).includes('No hay participaciones propias cerradas con la jurisdicción elegida')&&(await $('count').innerText()).includes('0 participaciones en Jurisdicción 55 de 61 del alcance completo')&&(await $('totals').textContent()).includes('Sin participaciones elegidas')&&(await $('totals').textContent()).includes('alcance completo:')&&(await $('contract-rows').textContent()).includes('Sin participaciones elegidas en esta jurisdicción'),label+': an empty selection over a known universe is labelled as such and keeps the complete totals');
  // Retiro de URLs: cada descarga conserva su propio temporizador; clear() retira pendientes exactamente una vez.
  fixture=jurisdictionFixture(61);await $('jurisdiction').selectOption('all');await consult();
  const base=(await urlState()).created.length;
  await downloadCsv();const afterA=await urlState(),urlA=afterA.created[base];check(afterA.created.length===base+1&&afterA.timers===base+1&&await revokedCount(urlA)===0,label+': a download leaves one pending URL with its own captured timer');
  allowed=false;await $('csv').click();await idle();check(await revokedCount(urlA)===1&&!(await $('view').isVisible())&&await $('csv').isDisabled(),label+': a 403 while a URL is pending retires it exactly once through clear()');
  check(await fireTimer(base)===true&&await revokedCount(urlA)===1,label+': the late timer of a retired URL does not revoke it again');
  allowed=true;await $('access').click();await idle();await consult();
  await downloadCsv();const after401=await urlState(),url401=after401.created.at(-1),before401Reads=closeQueries.length+fiscalQueries.length;authStatus=401;await $('csv').click();await idle();authStatus=200;
  check(await revokedCount(url401)===1&&!(await $('view').isVisible())&&await $('csv').isDisabled()&&await $('login').isVisible()&&(await $('status').innerText()).includes('La sesión venció')&&closeQueries.length+fiscalQueries.length===before401Reads,label+': actual HTTP401 retires pending URL, review and access before any close/fiscal GET');
  check(await fireTimer(after401.timers-1)===true&&await revokedCount(url401)===1,label+': late timer after HTTP401 never revokes twice');
  await $('access').click();await idle();await consult();
  await downloadCsv();const afterB=await urlState(),urlB=afterB.created.at(-1);fixture.details[0].stateVersion='c'.repeat(64);await $('csv').click();await idle();
  check((await $('status').innerText()).includes('Cambió la fuente')&&await revokedCount(urlB)===1&&await $('view').isVisible(),label+': replacing the review by a new proof retires the pending URL once and keeps the fresh review');
  check(await fireTimer(afterB.timers-1)===true&&await revokedCount(urlB)===1,label+': the late timer after a proof replacement does not revoke twice');
  await downloadCsv();await downloadCsv();const afterCD=await urlState(),[urlC,urlD]=afterCD.created.slice(-2);check(urlC!==urlD&&await revokedCount(urlC)===0&&await revokedCount(urlD)===0,label+': two rapid downloads keep two distinct pending URLs');
  check(await fireTimer(afterCD.timers-2)===true&&await revokedCount(urlC)===1&&await revokedCount(urlD)===0,label+': the first timer revokes only its own URL');
  check(await fireTimer(afterCD.timers-1)===true&&await revokedCount(urlD)===1&&await revokedCount(urlC)===1,label+': the second timer revokes only the newer URL, once');
  await downloadCsv();const afterE=await urlState(),urlE=afterE.created.at(-1);const driftReadBefore=fiscalReads;fiscalDriftStart=fiscalReads;fiscalDrift=true;await $('csv').click();await idle();fiscalDrift=false;check(fiscalReads-driftReadBefore===2,label+': changed fiscal census is exercised on the second complete GET');
  check(await revokedCount(urlE)===1&&!(await $('view').isVisible())&&await fireTimer(afterE.timers-1)===true&&await revokedCount(urlE)===1,label+': a changed fiscal census during download retires the pending URL once, without a second revocation from its timer');
  await consult();
  check(await page.locator('.own-f931 button:visible, .own-f931 select:visible').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().height>=43)),label+': touch controls at least44px');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),label+': no horizontal overflow');
  await page.screenshot({path:path.join(output,label+'.png'),fullPage:false});
  allowed=false;await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready')));await idle();check(!(await $('view').isVisible())&&await $('csv').isDisabled(),label+': permission revocation clears sensitive review and download');
  allowed=true;
  const restorationTraffic=[],watch=request=>{const u=new URL(request.url());if(u.pathname.startsWith('/api/'))restorationTraffic.push({origin:u.origin,path:u.pathname,method:request.method()});},beforeRestoreWrites=writes.length;
  page.on('request',watch);
  try{
   const fresh=await page.evaluate(async()=>{const r=await fetch('/api/internal-auth',{method:'GET',credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});if(!r.ok)throw Error('QA_F931_GLOBAL_SESSION_HTTP_REQUIRED');return r.json();});
   assert.equal(fresh.ok,true);assert.equal(fresh.authenticated,true);assert.equal(fresh.sessionVersion,2);assert.equal(fresh.user.id,'f931-synthetic-user');assert.equal(fresh.user.email,'f931-qa@example.invalid');assert.equal(fresh.access.context,'tenant');assert.equal(fresh.access.tenant.id,'10000000-0000-4000-8000-000000009991');assert.ok(Date.parse(fresh.expiresAt)>Date.now());assert.ok(Array.isArray(fresh.access.tenantCapabilities));assert.deepEqual([...fresh.access.tenantCapabilities].sort(),[...pageCaps].sort());assert.deepEqual(fresh.access.platformCapabilities,[]);assert.deepEqual(fresh.access.platformRoles,[]);
   await page.evaluate(access=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:access})),fresh.access);await idle();
   check(restorationTraffic.length>0&&restorationTraffic.every(r=>r.origin===origin&&r.path==='/api/internal-auth'&&r.method==='GET')&&writes.length===beforeRestoreWrites,label+': verified global fixture recovery makes only auth GETs and no fiscal query or write');
  }finally{page.off('request',watch);}
  await populate();
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  check(!(await $('view').isVisible())&&await $('csv').isDisabled()&&await $('period').inputValue()==='',label+': hidden page clears values and download');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await $('access').click();await idle();corrupt=true;await populate();check(!(await $('view').isVisible())&&await $('csv').isDisabled(),label+': invalid source hash blocks entire preparation');
  check(await page.evaluate(()=>!Object.keys(localStorage).some(k=>/f931/i.test(k))),label+': no F931 localStorage state');
  corrupt=false;await populate();await downloadCsv();const afterHide=await urlState(),urlHide=afterHide.created.at(-1);
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  check(await revokedCount(urlHide)===1&&!(await $('view').isVisible())&&await $('csv').isDisabled(),label+': pagehide before the timer retires the pending URL exactly once');
  check(await fireTimer(afterHide.timers-1)===true&&await revokedCount(urlHide)===1,label+': the late timer after pagehide does not revoke twice');
 }finally{await context.close();}
}
try{await inspect({width:1440,height:1000},'narrow-route',{shellAdmitted:false});await inspect({width:1440,height:1000},'desktop');await inspect({width:390,height:844},'mobile');await inspect({width:320,height:812},'mobile320');assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);check(true,'read-only synthetic transport; no writes or browser pageerrors');
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:true,scope:'built UI plus synthetic GET fixture transport; not real SQL/session/municipal acceptance',checks:checks.length,proofs:checks,errors,writes},null,2)+'\n');console.log(JSON.stringify({ok:true,checks:checks.length,output}));
}finally{await browser.close();}
