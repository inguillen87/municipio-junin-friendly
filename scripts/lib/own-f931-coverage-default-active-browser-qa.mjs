// Actual built /nomina shell, default-active F4. Synthetic GET transport only.
// The legacy 63/61 fixture cannot qualify historical originals; it is a rejection case here.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {OWN_CLOSE_NOMINAL} from '../../assets/own-payroll-close-model.js';
import {OWN_RUN_FULL_JSON} from '../../assets/own-payroll-response.js';
import {fiscalFactsHash} from '../../assets/own-fiscal-facts-model.js';
import {fiscalCoverageFixture,addHistoricalFiscalType} from '../../tests/fixtures/own-f931-fiscal-coverage-synthetic.js';
import {jurisdictionFixture} from '../../tests/fixtures/own-payroll-jurisdiction-synthetic.js';
import {reportCensusFixture,liquidationDetailFor} from '../../tests/fixtures/own-payroll-report-census-synthetic.js';
import {openQaPayrollSidebarTask} from './qa-payroll-sidebar-navigation.mjs';

export async function verifyOwnF931CoverageDefaultActiveBrowser({browser,origin,root,output,check,errors,writes,requests,downloads}){
 const summary=[];
 async function inspect(viewport,label,historical){
  const facts=historical?addHistoricalFiscalType(await fiscalCoverageFixture()):await fiscalCoverageFixture();
  const report=historical?facts.report:jurisdictionFixture(61),period=report.query.from;
  const types=historical?facts.params.types:['monthly'];
  assert.equal(facts.census.period,period,'qualified synthetic coverage and originals must refer to the same period');
  // Only originals actually present in the existing fixture. Never synthesize missing history.
  const originals=new Map();for(const detail of report.details)for(const capture of detail.captures){assert.ok(!originals.has(capture.id),'original capture ids must be unique');originals.set(capture.id,capture);}
  assert.equal(originals.size,2,'existing fixture retains both complete original captures');
  let allowed=true;const traffic=[],fullResponses=[],context=await browser.newContext({viewport,locale:'es-AR',serviceWorkers:'block'});
  const full=async(route,data)=>{const body=Buffer.from(JSON.stringify({ok:true,data}),'utf8');fullResponses.push({actual:body.length,announced:body.length});return route.fulfill({status:200,contentType:OWN_RUN_FULL_JSON+'; charset=utf-8',headers:{'x-municontrol-json-bytes':String(body.length),'cache-control':'private, no-store'},body});};
  await context.route('**/*',async route=>{try{
   const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.abort();
   requests.push({method:req.method(),path:u.pathname,query:u.search});if(req.method()!=='GET')writes.push({method:req.method(),path:u.pathname});
   if(u.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,sessionVersion:2,user:{id:'f931-coverage-active-user',email:'f931-coverage-active@example.invalid'},access:{context:'tenant',tenant:{id:'10000000-0000-4000-8000-000000009991',roleKey:'QA'},tenantCapabilities:allowed?[...OWN_CLOSE_NOMINAL,'payroll.read']:[],platformCapabilities:[],platformRoles:[]},expiresAt:new Date(Date.now()+3600000).toISOString()}});
   if(u.pathname==='/api/internal-own-fiscal-facts'){
    if(!allowed)return route.fulfill({status:403,json:{ok:false,error:'Synthetic fiscal access revoked'}});
    assert.equal(req.method(),'GET');assert.deepEqual([...u.searchParams.keys()].sort(),['period','resource']);assert.equal(u.searchParams.get('resource'),'census');assert.equal(u.searchParams.get('period'),period);
    traffic.push({kind:'fiscal'});return route.fulfill({json:{ok:true,data:structuredClone(facts.census)}});
   }
   if(['/api/internal-own-payroll-close','/api/internal-own-payroll-liquidation'].includes(u.pathname)){
    if(!allowed)return route.fulfill({status:403,json:{ok:false,error:'Synthetic historical access revoked'}});
    const q=u.searchParams,resource=q.get('resource'),capture=u.pathname.endsWith('-liquidation');
    assert.equal(req.method(),'GET');assert.equal(req.headers().accept,OWN_RUN_FULL_JSON);
    assert.deepEqual([...q.keys()].sort(),capture||resource==='group'?['id','resource']:['liquidationType','period','resource']);
    traffic.push({kind:capture?'capture':resource,id:q.get('id'),accept:req.headers().accept});
    if(capture){assert.equal(resource,'detail');const original=originals.get(q.get('id'));if(!original)return route.fulfill({status:404,json:{ok:false,code:'OWN_LIQ_SOURCE_NOT_FOUND',error:'No se encontró la captura original.'}});return full(route,liquidationDetailFor(structuredClone(original)));}
    assert.ok(['report-census','group'].includes(resource),'default-active coverage must never fall back to operational detail');
    if(resource==='report-census'){assert.equal(q.get('period'),period);assert.ok(types.includes(q.get('liquidationType')));return full(route,reportCensusFixture(report,{period,liquidationType:q.get('liquidationType')}));}
    const receipt=report.receipts.find(r=>r.groupId===q.get('id'));assert.ok(receipt,'only original synthetic closed groups are available');return full(route,structuredClone(receipt));
   }
   if(u.pathname==='/api/internal-data')return route.fulfill({json:{ok:true,status:'ready',sourcePolicy:{label:'QA SINTÉTICA'},latestClosed:{},currentOpen:{},runs:[],quality:{},limitations:[]}});
   if(u.pathname.startsWith('/api/'))return route.fulfill({status:403,json:{ok:false,error:'Outside synthetic coverage scope'}});
   const file=path.resolve(root,u.pathname==='/nomina'?'nomina-control.html':'.'+u.pathname);if(req.method()!=='GET'||!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});return route.fulfill({contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'}[path.extname(file)]??'application/octet-stream',body:fs.readFileSync(file)});
  }catch(e){errors.push(label+': '+e.message);return route.fulfill({status:500,json:{ok:false,error:'Synthetic coverage transport failed'}});}});
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(label+': '+e.message));page.on('download',d=>downloads.push(d));
  const $=key=>page.locator('.own-f931 [data-own-f931-'+key+']'),idle=()=>page.waitForFunction(()=>document.querySelector('.own-f931')?.getAttribute('aria-busy')==='false');
  const openTechnical=async()=>{if(!(await $('technical').evaluate(n=>n.open)))await $('technical').locator('summary').click();};
  const withdrawn=async()=>await $('view').isHidden()&&await $('csv').isDisabled()&&await $('contract-rows').textContent()===''&&await $('contract-search').inputValue()==='';
  const populate=async()=>{await $('period').fill(period);await $('date').fill(facts.params.presentationDate);for(const type of types)await page.locator('.own-f931 input[type=checkbox][value='+type+']').check();await $('consult').click();await idle();};
  try{
   await page.goto(origin+'/nomina#f931',{waitUntil:'domcontentloaded'});await openQaPayrollSidebarTask(page,{profile:'payroll-sidebar',task:'f931'});await $('consult').waitFor({state:'visible'});await idle();
   check(await page.evaluate(async()=>{const m=await import('/assets/own-f931-history-admission.js');return m.ownF931HistoryAdmission(m.OWN_F931_HISTORY_ADMISSION).activated===true;}),label+': actual served default F4 remains active, without a component admission override');
   const start=traffic.length,beforeDownloads=downloads.length;await populate();const initial=traffic.slice(start);
   check(initial.filter(r=>r.kind==='report-census').length===2&&initial.filter(r=>r.kind==='group').length===(historical?2:1)&&initial.filter(r=>r.kind==='capture').length===2&&new Set(initial.filter(r=>r.kind==='capture').map(r=>r.id)).size===2,label+': whole closed census, original groups and both existing original captures are actually requested');
   check(initial.filter(r=>r.kind==='fiscal').length===(historical?1:2),label+': fiscal census is complete and successful F4 preparation rechecks its unchanged source');
   check(initial.filter(r=>r.kind!=='fiscal').every(r=>r.accept===OWN_RUN_FULL_JSON)&&fullResponses.every(r=>r.actual===r.announced),label+': historical GET sources preserve FULL negotiation and complete exact UTF8 response bytes');
   if(historical){
    check(await withdrawn()&&(await $('status').innerText()).includes('La captura guardada no corresponde a los conceptos, importes e identidad del cierre original.'),label+': the legacy supplementary close is rejected because its existing originals do not match its preserved close');
    check(downloads.length===beforeDownloads,label+': incompatible historical originals cannot produce an export');
    check(report.details[1].captures.length===0&&report.receipts[1].snapshot.employees[0].employeeNumber==='HIST-001',label+': missing historical captures and original historical legajo remain unmodified');
   }else{
    check(await $('technical').getAttribute('open')===null,label+': technical references start closed for complete fiscal coverage');await openTechnical();check(await $('fields').locator('tbody tr').count()===60,label+': complete fiscal coverage retains all60 manual reference rows');
    await $('contracts').locator('summary').click();
    check(await $('view').isVisible()&&(await $('count').innerText()).includes('61 participaciones')&&(await $('contract-count').innerText()).includes('61 contratos distintos')&&(await $('basis').innerText()).includes('censo completo de cierres conservados'),label+': default F4 renders all61 original contracts and participations with the historical reading basis');
    check(await $('contract-rows').locator('article').count()===20&&await $('contract-rows').locator('[data-fiscal-state=identity_not_captured]').count()===0&&!(await $('contract-rows').innerText()).includes('ACTUAL-'),label+': complete originals provide their own identities and preserve20-row private pagination without current-directory substitution');
    await $('contract-next').click();await $('contract-next').click();await $('contract-next').click();check(await $('contract-rows').locator('article').count()===1&&(await $('contract-rows').innerText()).includes('1061'),label+': last page retains original contract61');
    const atFilters=traffic.length;await $('contract-search').fill('1003');check((await $('contract-rows').innerText()).includes('2 de 27')&&(await $('contract-rows').innerText()).includes('25 sin informar'),label+': F4 preserves explicit zero separately from unknown fiscal values');
    await $('contract-search').fill('');await $('contract-state').selectOption('documented');check(await $('contract-rows').locator('article').count()===15,label+': F4 retains15 fully documented fiscal configurations');await $('contract-state').selectOption('pending');check((await $('contract-page').innerText()).includes('46 contratos en esta búsqueda / 61 totales'),label+': pending coverage retains all46 original contracts');await $('contract-search').fill('1061');check(traffic.length===atFilters,label+': private filters never replace or reload the complete evidence');
    const event=page.waitForEvent('download');await $('csv').click();const download=await event;await idle();const csv=fs.readFileSync(await download.path(),'utf8');
    check((csv.match(/"Campo \d+ ·/g)??[]).length===60&&csv.includes('61')&&!csv.includes('ACTUAL-')&&!csv.includes('0002')&&!csv.includes(report.receipts[0].snapshot.employees[0].contractId)&&!csv.includes('Constancia exclusivamente'),label+': default F4 CSV preserves every aggregate field and contract despite filters while excluding nominal and fiscal literal data');
    const beforeChanged=downloads.length;facts.census.rows.at(-1).configuration.version='c'.repeat(64);facts.census.stateVersion=await fiscalFactsHash(facts.census.rows);await $('csv').click();await idle();check(downloads.length===beforeChanged&&(await $('status').innerText()).includes('Cambió la fuente'),label+': changed fiscal evidence blocks download and updates the complete active review');check(await $('technical').getAttribute('open')===null,label+': changed fiscal proof resets technical disclosure to closed');
    await $('period').fill('2026-11');check(await withdrawn(),label+': changing active period withdraws the original evidence');await populate();
    await page.screenshot({path:path.join(output,label+'.png'),fullPage:false});
   }
   check(!traffic.some(r=>r.kind==='detail')&&!requests.some(r=>r.path==='/api/internal-data'&&/[?&]resource=(employees|nativeroster)(?:&|$)/.test(r.query)),label+': neither rejection nor success borrows operational details or current roster identities');
   allowed=false;await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready')));await idle();check(await withdrawn(),label+': permission revocation withdraws all nominal rows, search and voluntary export');
   check(!requests.some(r=>r.query.includes('HIST-001')||r.query.includes('ACTUAL-')||r.query.includes('Nombre%20actual')),label+': nominal search and current-directory values never enter request URLs');
   check(await page.evaluate(()=>!Object.keys(localStorage).some(k=>/f931|fiscal.coverage/i.test(k))),label+': default F4 fiscal coverage remains outside localStorage');
   check(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),label+': default-active full shell has no horizontal overflow');
   summary.push({label,scope:'built-default-active-F4-synthetic-GET',historicalFixtureRejected:historical,originalCaptures:originals.size,actualSql:false,sdkDestinationTested:false});
  }finally{await context.close();}
 }
 for(const [viewport,label]of [[{width:1440,height:1000},'desktop'],[{width:390,height:844},'mobile390'],[{width:320,height:780},'mobile320']]){
  await inspect(viewport,'default-active-coverage-'+label,false);await inspect(viewport,'default-active-historical-rejection-'+label,true);
 }
 return summary;
}
