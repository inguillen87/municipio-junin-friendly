// Isolated browser, synthetic read fixtures, local built assets only.
// This is UI/transport regression QA, not municipal fiscal acceptance.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {OWN_CLOSE_NOMINAL} from '../assets/own-payroll-close-model.js';
import {historicalF931BrowserFixture,historicalF931BrowserReopen,historicalF931BrowserLiquidation,historicalF931BrowserFullResponse} from '../tests/fixtures/own-f931-historical-browser-synthetic.js';
import {OWN_RUN_FULL_JSON} from '../assets/own-payroll-response.js';
import {fiscalFactsHash} from '../assets/own-fiscal-facts-model.js';
const root=fs.realpathSync(new URL('../public',import.meta.url)),output=path.resolve(process.env.OWN_F931_QA_OUTPUT??'verification/own-f931-browser-20261011');
assert.ok(output.startsWith(fs.realpathSync(new URL('..',import.meta.url))+path.sep));assert.ok(!fs.existsSync(output),'Preserve prior QA output; choose a new output');fs.mkdirSync(output,{recursive:true});
const origin='http://127.0.0.1:4373',checks=[],errors=[],writes=[],downloads=[],fiscalRequestCounts=[];
const check=(condition,message)=>{assert.ok(condition,message);checks.push(message);};
const browser=await chromium.launch({headless:true});
async function inspect(viewport,label){
 let fixture=historicalF931BrowserFixture(),allowed=true,corrupt=false,fiscalUnavailable=false,fiscalReads=0,fiscalFailures=0;
 const historicalReads=[],fiscalUnavailableError='No se confirmó la operación. Consultá el mismo intento antes de iniciar otro.';
 const context=await browser.newContext({viewport,locale:'es-AR',serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.abort();
  if(req.method()!=='GET')writes.push({method:req.method(),path:u.pathname});
  if(u.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,sessionVersion:2,user:{id:'f931-synthetic-user',email:'f931-qa@example.invalid'},access:{context:'tenant',tenant:{id:'10000000-0000-4000-8000-000000009991',roleKey:'QA'},tenantCapabilities:allowed?OWN_CLOSE_NOMINAL:[],platformCapabilities:[],platformRoles:[]},expiresAt:new Date(Date.now()+3600000).toISOString()}});
  if(u.pathname==='/api/internal-own-fiscal-facts'){
   fiscalReads++;assert.equal(req.method(),'GET','Fiscal preparation must remain GET-only');assert.equal(u.searchParams.get('resource'),'census');
   if(fiscalUnavailable&&allowed){fiscalFailures++;return route.fulfill({status:503,json:{ok:false,code:'FISCAL_FACTS_UNAVAILABLE',error:fiscalUnavailableError}});}
   if(!allowed)return route.fulfill({status:403,json:{ok:false,error:'Synthetic access revoked'}});
   assert.equal(u.searchParams.get('resource'),'census');return route.fulfill({json:{ok:true,data:{version:'own-fiscal-census.v1',period:u.searchParams.get('period'),scopeVersion:'b'.repeat(64),stateVersion:await fiscalFactsHash([]),rows:[],complete:true,payrollCalculated:false,payrollPosted:false}}});
  }
  if(u.pathname==='/api/internal-own-payroll-close'){
   if(!allowed)return route.fulfill({status:403,json:{ok:false,error:'Synthetic access revoked'}});
   assert.equal(req.headers().accept,OWN_RUN_FULL_JSON,'Historical reads negotiate the complete response');
   const q=u.searchParams,resource=q.get('resource');
   historicalReads.push({resource,period:q.get('period'),liquidationType:q.get('liquidationType'),id:q.get('id')});
   assert.ok(['report-census','group'].includes(resource),'Operational close-detail fallback is forbidden');
   const data=resource==='report-census'?structuredClone(fixture.censuses.find(c=>c.period===q.get('period')&&c.liquidationType===q.get('liquidationType'))):structuredClone(fixture.receipts.find(r=>r.groupId===q.get('id')));
   assert.ok(data,'Every complete historical source must be explicitly present');
   if(corrupt&&resource==='group')data.snapshotSha256='e'.repeat(64);
   return route.fulfill(historicalF931BrowserFullResponse(data));
  }
  if(u.pathname==='/api/internal-own-payroll-liquidation'){
   if(!allowed)return route.fulfill({status:403,json:{ok:false,error:'Synthetic access revoked'}});
   assert.equal(req.headers().accept,OWN_RUN_FULL_JSON);assert.equal(u.searchParams.get('resource'),'detail');
   historicalReads.push({resource:'capture',id:u.searchParams.get('id')});
   return route.fulfill(historicalF931BrowserFullResponse(historicalF931BrowserLiquidation(fixture.captures.find(c=>c.id===u.searchParams.get('id')))));
  }
  if(u.pathname==='/api/internal-data')return route.fulfill({json:{ok:true,status:'ready',sourcePolicy:{label:'QA SINTÉTICA'},latestClosed:{},currentOpen:{},runs:[],quality:{},limitations:[]}});
  if(u.pathname.startsWith('/api/'))return route.fulfill({status:403,json:{ok:false,error:'Outside synthetic test scope'}});
  const file=path.resolve(root,u.pathname==='/nomina'?'nomina-control.html':'.'+u.pathname);
  if(req.method()!=='GET'||!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
  return route.fulfill({contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'}[path.extname(file)]??'application/octet-stream',body:fs.readFileSync(file)});
 });
 const page=await context.newPage();let navigations=0;page.on('framenavigated',f=>{if(f===page.mainFrame())navigations++;});page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('download',d=>downloads.push(d));
 const $=k=>page.locator('.own-f931 [data-own-f931-'+k+']');
 const idle=()=>page.waitForFunction(()=>document.querySelector('.own-f931')?.getAttribute('aria-busy')==='false');
 const populate=async()=>{$('period');await $('period').fill(fixture.query.from);await $('date').fill('2026-10-31');await $('consult').click();await idle();};
 const withdrawn=async()=>await $('view').isHidden()&&await $('csv').isDisabled()&&(await Promise.all(['count','version','coverage','totals','requirements','issues','fields','contract-count','contract-page','contract-rows'].map(k=>$(k).textContent()))).every(text=>text==='');
 const completeHistorySince=(mark,action)=>{
  const reads=historicalReads.slice(mark),keys=rows=>rows.map(r=>r.period+':'+r.liquidationType).sort();
  assert.deepEqual(keys(reads.filter(r=>r.resource==='report-census')),keys([...fixture.censuses,...fixture.censuses]),action+': census plus complete source bookend');
  assert.deepEqual(reads.filter(r=>r.resource==='group').map(r=>r.id).sort(),fixture.receipts.map(r=>r.groupId).sort(),action+': every complete closed group');
  assert.deepEqual(reads.filter(r=>r.resource==='capture').map(r=>r.id).sort(),fixture.captures.map(c=>c.id).sort(),action+': every original saved capture');
  assert.equal(reads.length,fixture.censuses.length*2+fixture.receipts.length+fixture.captures.length,action+': no operational fallback or extra source');
  check(true,label+': '+action+' rereads every FULL original group/capture and the whole historical census twice');
 };
 try{
  await page.goto(origin+'/nomina#f931',{waitUntil:'domcontentloaded'});await $('consult').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('[data-own-f931-target]')?.disabled);
  check(await $('period').inputValue()===''&&await $('date').inputValue()==='',label+': period/presentation are explicit, without date defaults');
  check(await $('fiscal').isChecked(),label+': fiscal registry consultation remains explicitly checked by default');
  await populate();check(fiscalReads===2&&await $('view').isVisible()&&(await $('count').innerText()).includes('61 participaciones'),label+': unchanged default consults the fiscal census and its source bookend');
  fiscalUnavailable=true;let fiscalBefore=fiscalReads;const beforeUnavailable=downloads.length;
  await $('consult').click();await idle();
  check(fiscalReads===fiscalBefore+1&&await withdrawn()&&await $('fiscal').isChecked()&&(await $('status').innerText()).startsWith(fiscalUnavailableError)&&downloads.length===beforeUnavailable,label+': fiscal503 withdraws every prior result, row and download without automatic historical fallback');
  fiscalUnavailable=false;fiscalBefore=fiscalReads;await $('consult').click();await idle();
  check(fiscalReads===fiscalBefore+2&&await $('view').isVisible(),label+': independent fiscal recovery restores a visible review before testing explicit invalidation');
  fiscalUnavailable=true;
  fiscalBefore=fiscalReads;await $('fiscal').uncheck();
  check(await withdrawn()&&(await $('status').innerText()).includes('consulta fiscal')&&fiscalReads===fiscalBefore,label+': explicit unchecked choice invalidates the prior preparation without issuing an implicit GET');
  let historyStart=historicalReads.length;await $('consult').click();await idle();
  completeHistorySince(historyStart,'unchecked review');
  check(fiscalReads===fiscalBefore&&!await $('fiscal').isChecked()&&await $('view').isVisible()&&(await $('count').innerText()).includes('61 participaciones')&&(await $('status').innerText()).includes('sin consultar el registro de datos fiscales'),label+': explicit historical review is complete while the fiscal endpoint stays unavailable and receives no GET');
  const fiscalCard=$('coverage').locator('article').filter({has:page.getByRole('heading',{name:'Datos fiscales del universo sin consultar',exact:true})});
  const fiscalCardText=await fiscalCard.innerText();
  check(await fiscalCard.count()===1&&fiscalCardText.includes('61 contratos sin consultar. No se verificó la existencia de revisiones fiscales')&&!/0 de 61|0 contratos revisados|0 sin revisión/.test(fiscalCardText),label+': the fiscal coverage card states not queried, never zero reviewed or a verified absence');
  await $('contracts').locator('summary').click();const unqueriedRows=[];
  for(let n=1;n<=4;n++){
   const rows=await $('contract-rows').locator('article').evaluateAll(nodes=>nodes.map(n=>({state:n.dataset.fiscalState,title:n.querySelector('h4')?.textContent,text:n.textContent})));
   check(rows.length===(n<4?20:1)&&rows.every(r=>r.state==='not_queried'&&r.text.includes('Datos fiscales sin consultar')&&!/Sin revisión fiscal|datos documentados|0 de 27/.test(r.text)),label+': unchecked contract page'+n+' states not queried without fabricated zeroes');
   unqueriedRows.push(...rows);if(n<4)await $('contract-next').click();
  }
  check(unqueriedRows.length===61&&new Set(unqueriedRows.map(r=>r.title)).size===61&&(await $('contract-count').innerText()).includes('61 contratos distintos'),label+': all61 distinct original contracts remain reachable beyond the visible page');
  historyStart=historicalReads.length;fiscalBefore=fiscalReads;const unqueriedDownload=page.waitForEvent('download');await $('csv').click();const unqueriedFile=await unqueriedDownload;await idle();
  completeHistorySince(historyStart,'unchecked CSV');
  const unqueriedCsv=fs.readFileSync(await unqueriedFile.path(),'utf8');
  check(fiscalReads===fiscalBefore&&!await $('fiscal').isChecked()&&(await $('status').innerText()).includes('Preparación completa descargada'),label+': voluntary CSV keeps the reviewed unchecked mode and never calls the fiscal endpoint');
  check(unqueriedCsv.includes('Datos fiscales sin consultar')&&unqueriedCsv.includes('61 contratos sin consultar')&&!/contratos revisados vigentes|0 de 61|0 contratos revisados/.test(unqueriedCsv)&&(unqueriedCsv.match(/"Campo \d+ ·/g)??[]).length===60,label+': unchecked CSV includes all60 fields and explicit not-queried coverage instead of zero fiscal data');
  check(!unqueriedCsv.includes(fixture.receipts[0].groupId)&&!unqueriedCsv.includes(fixture.receipts[0].body.reason)&&!unqueriedCsv.includes(fixture.receipts[0].snapshotSha256),label+': unchecked CSV retains the original no UUID/free-text/source-hash boundary');
  fiscalBefore=fiscalReads;await $('fiscal').check();
  check(await withdrawn()&&fiscalReads===fiscalBefore,label+': checking fiscal consultation again withdraws the unchecked review before any new request');
  await $('consult').click();await idle();
  check(fiscalReads===fiscalBefore+1&&await withdrawn()&&await $('fiscal').isChecked()&&(await $('status').innerText()).startsWith(fiscalUnavailableError),label+': rechecked fiscal503 remains a visible full failure with no automatic fallback');
  fiscalUnavailable=false;const beforeFiscalRestored=fiscalReads;
  await populate();check(await $('view').isVisible(),label+': complete own closed preparation visible');check((await $('count').innerText()).includes('61 participaciones'),label+': all 61 closed participations included');await page.locator('.own-f931 summary',{hasText:'Ver totales exactos de nómina'}).click();check((await $('totals').innerText()).includes('Bruto'),label+': exact payroll totals identified separately from fiscal bases');
  check(await $('fiscal').isChecked()&&fiscalReads===beforeFiscalRestored+2,label+': restored normal fiscal mode requires both fiscal GETs before every original historical check continues');
  check((await $('rule').innerText()).includes('RG 5907/2026 modificada por RG 5915/2026'),label+': amended version rule identifies both resolutions');
  check(await $('rule').getAttribute('href')==='https://biblioteca.arca.gob.ar/search/query/norma.aspx?p=t%3ARAG%7Cn%3A5915%7Co%3A9%7Ca%3A2026%7Cf%3A22%2F10%2F2026',label+': version rule links to the current official amendment');
  const referenceDetails=page.locator('.own-f931 details').filter({hasText:'Consultar los 60 campos'});await referenceDetails.locator('summary').click();
  check(await $('fields').locator('article').count()===20,label+': fields paginated accessibly');await $('next').click();await $('next').click();check((await $('fields').innerText()).includes('Campo 60'),label+': final page includes field60');
  await $('search').fill('remuneración');check((await $('fields').innerText()).includes('Remuneración'),label+': search works');
  const event=page.waitForEvent('download');await $('csv').click();const d=await event;await idle();const csv=fs.readFileSync(await d.path(),'utf8');check((csv.match(/"Campo \d+ ·/g)??[]).length===60,label+': CSV includes all fields despite search/page');check(!csv.includes(fixture.receipts[0].groupId)&&!csv.includes(fixture.receipts[0].body.reason)&&!csv.includes(fixture.receipts[0].snapshotSha256),label+': CSV has no UUID/free text/source hash');check((await $('status').innerText()).includes('No es un TXT fiscal'),label+': download clearly describes preparation only');
  const before=downloads.length;historicalF931BrowserReopen(fixture);await $('csv').click();await idle();check(downloads.length===before&&(await $('status').innerText()).includes('Cambió la fuente'),label+': changed source replaces review without download');
  fixture=historicalF931BrowserFixture(); // Restore original manufactured closed history for the following independent checks.
  await $('date').fill('2026-11-30');check(!(await $('view').isVisible())&&await $('csv').isDisabled(),label+': changed November presentation invalidates old review');await $('consult').click();await idle();const beforeCutoff=await $('version').innerText();check(!beforeCutoff.includes('versión 48')&&beforeCutoff.includes('versión 47.5'),label+': old period presented November30 stays before the amended V48 cutoff');
  await $('date').fill('2026-12-01');check(!(await $('view').isVisible())&&await $('csv').isDisabled(),label+': changed December presentation invalidates old review');await $('consult').click();await idle();check((await $('version').innerText()).includes('versión 48'),label+': old period presented after cutoff requires48');
  fixture=historicalF931BrowserFixture({period:'2026-10',count:35});await populate();check((await $('count').innerText()).includes('35 participaciones'),label+': October has its own complete captured population');
  fixture=historicalF931BrowserFixture();await populate();check((await $('count').innerText()).includes('61 participaciones')&&navigations===1,label+': September to October to September preserves original populations without reload');
  for(const[choice,count]of [['42',31],['55',30]]){await $('jurisdiction').selectOption(choice);check(!await $('view').isVisible()&&await $('csv').isDisabled(),label+': jurisdiction change invalidates the previous preparation');await $('consult').click();await idle();const text=await $('count').innerText();check(text.includes(count+' participaciones')&&text.includes('Universo verificado: 1 grupos · 61 participaciones'),label+': exact '+choice+' closed scope retains the full universe');}
  await $('jurisdiction').selectOption('all');await $('consult').click();await idle();check((await $('count').innerText()).includes('61 participaciones'),label+': Todas restores the complete closed scope');
  check(await page.locator('.own-f931 button:visible').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().height>=43)),label+': touch controls at least44px');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),label+': no horizontal overflow');
  await page.screenshot({path:path.join(output,label+'.png'),fullPage:false});
  allowed=false;await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready')));await idle();check(!(await $('view').isVisible())&&await $('csv').isDisabled(),label+': permission revocation clears sensitive review and download');
  allowed=true;await $('access').click();await idle();await populate();
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  check(!(await $('view').isVisible())&&await $('csv').isDisabled()&&await $('period').inputValue()==='',label+': hidden page clears values and download');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await $('access').click();await idle();corrupt=true;await populate();check(!(await $('view').isVisible())&&await $('csv').isDisabled(),label+': invalid source hash blocks entire preparation');
  check(await page.evaluate(()=>!Object.keys(localStorage).some(k=>/f931/i.test(k))),label+': no F931 localStorage state');
 }finally{fiscalRequestCounts.push({viewport:label,total:fiscalReads,synthetic503:fiscalFailures});await context.close();}
}
try{await inspect({width:1440,height:1000},'desktop');await inspect({width:390,height:844},'mobile');await inspect({width:320,height:740},'mobile320');assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);check(true,'read-only synthetic transport; no writes or browser pageerrors');
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:true,scope:'built UI plus synthetic GET fixture transport; not real SQL/session/municipal acceptance',checks:checks.length,proofs:checks,errors,writes,fiscalRequestCounts},null,2)+'\n');console.log(JSON.stringify({ok:true,checks:checks.length,output}));
}finally{await browser.close();}
