// Isolated browser, synthetic read fixtures, local built assets only.
// This is UI/transport regression QA, not municipal fiscal acceptance.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {OWN_CLOSE_NOMINAL} from '../assets/own-payroll-close-model.js';
import {reportFixture} from '../tests/fixtures/own-payroll-report-synthetic.js';
import {fiscalFactsHash} from '../assets/own-fiscal-facts-model.js';
const root=fs.realpathSync(new URL('../public',import.meta.url)),output=path.resolve(process.env.OWN_F931_QA_OUTPUT??'verification/own-f931-browser-20261011');
assert.ok(output.startsWith(fs.realpathSync(new URL('..',import.meta.url))+path.sep));fs.mkdirSync(output,{recursive:true});
const origin='http://127.0.0.1:4373',checks=[],errors=[],writes=[],downloads=[];
const check=(condition,message)=>{assert.ok(condition,message);checks.push(message);};
const browser=await chromium.launch({headless:true});
async function inspect(viewport,label){
 let fixture=reportFixture(61),allowed=true,corrupt=false;
 const context=await browser.newContext({viewport,locale:'es-AR',serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.abort();
  if(req.method()!=='GET')writes.push({method:req.method(),path:u.pathname});
  if(u.pathname==='/api/internal-auth')return route.fulfill({json:{ok:true,authenticated:true,sessionVersion:2,user:{id:'f931-synthetic-user',email:'f931-qa@example.invalid'},access:{context:'tenant',tenant:{id:'10000000-0000-4000-8000-000000009991',roleKey:'QA'},tenantCapabilities:allowed?OWN_CLOSE_NOMINAL:[],platformCapabilities:[],platformRoles:[]},expiresAt:new Date(Date.now()+3600000).toISOString()}});
  if(u.pathname==='/api/internal-own-fiscal-facts'){
   if(!allowed)return route.fulfill({status:403,json:{ok:false,error:'Synthetic access revoked'}});
   assert.equal(u.searchParams.get('resource'),'census');return route.fulfill({json:{ok:true,data:{version:'own-fiscal-census.v1',period:u.searchParams.get('period'),scopeVersion:'b'.repeat(64),stateVersion:await fiscalFactsHash([]),rows:[],complete:true,payrollCalculated:false,payrollPosted:false}}});
  }
  if(u.pathname==='/api/internal-own-payroll-close'){
   if(!allowed)return route.fulfill({status:403,json:{ok:false,error:'Synthetic access revoked'}});
   const q=u.searchParams,data=q.get('resource')==='detail'?structuredClone(fixture.details[0]):structuredClone(fixture.receipts[0]);
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
 const $=k=>page.locator('.own-f931 [data-own-f931-'+k+']');
 const idle=()=>page.waitForFunction(()=>document.querySelector('.own-f931')?.getAttribute('aria-busy')==='false');
 const populate=async()=>{$('period');await $('period').fill(fixture.query.from);await $('date').fill('2026-10-31');await $('consult').click();await idle();};
 try{
  await page.goto(origin+'/nomina#f931',{waitUntil:'domcontentloaded'});await $('consult').waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('[data-own-f931-target]')?.disabled);
  check(await $('period').inputValue()===''&&await $('date').inputValue()==='',label+': period/presentation are explicit, without date defaults');
  await populate();check(await $('view').isVisible(),label+': complete own closed preparation visible');check((await $('count').innerText()).includes('61 participaciones'),label+': all 61 closed participations included');await page.locator('.own-f931 summary',{hasText:'Ver totales exactos de nómina'}).click();check((await $('totals').innerText()).includes('Bruto'),label+': exact payroll totals identified separately from fiscal bases');
  check((await $('rule').innerText()).includes('RG 5907/2026 modificada por RG 5915/2026'),label+': amended version rule identifies both resolutions');
  check(await $('rule').getAttribute('href')==='https://biblioteca.arca.gob.ar/search/query/norma.aspx?p=t%3ARAG%7Cn%3A5915%7Co%3A9%7Ca%3A2026%7Cf%3A22%2F10%2F2026',label+': version rule links to the current official amendment');
  const referenceDetails=page.locator('.own-f931 details').filter({hasText:'Consultar los 60 campos'});await referenceDetails.locator('summary').click();
  check(await $('fields').locator('article').count()===20,label+': fields paginated accessibly');await $('next').click();await $('next').click();check((await $('fields').innerText()).includes('Campo 60'),label+': final page includes field60');
  await $('search').fill('remuneración');check((await $('fields').innerText()).includes('Remuneración'),label+': search works');
  const event=page.waitForEvent('download');await $('csv').click();const d=await event;await idle();const csv=fs.readFileSync(await d.path(),'utf8');check((csv.match(/"Campo \d+ ·/g)??[]).length===60,label+': CSV includes all fields despite search/page');check(!csv.includes(fixture.receipts[0].groupId)&&!csv.includes(fixture.receipts[0].body.reason)&&!csv.includes(fixture.receipts[0].snapshotSha256),label+': CSV has no UUID/free text/source hash');check((await $('status').innerText()).includes('No es un TXT fiscal'),label+': download clearly describes preparation only');
  const before=downloads.length;fixture.details[0].stateVersion='c'.repeat(64);await $('csv').click();await idle();check(downloads.length===before&&(await $('status').innerText()).includes('Cambió la fuente'),label+': changed source replaces review without download');
  await $('date').fill('2026-11-30');check(!(await $('view').isVisible())&&await $('csv').isDisabled(),label+': changed November presentation invalidates old review');await $('consult').click();await idle();const beforeCutoff=await $('version').innerText();check(!beforeCutoff.includes('versión 48')&&beforeCutoff.includes('versión 47.5'),label+': old period presented November30 stays before the amended V48 cutoff');
  await $('date').fill('2026-12-01');check(!(await $('view').isVisible())&&await $('csv').isDisabled(),label+': changed December presentation invalidates old review');await $('consult').click();await idle();check((await $('version').innerText()).includes('versión 48'),label+': old period presented after cutoff requires48');
  check(await page.locator('.own-f931 button:visible').evaluateAll(nodes=>nodes.every(n=>n.getBoundingClientRect().height>=43)),label+': touch controls at least44px');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),label+': no horizontal overflow');
  await page.screenshot({path:path.join(output,label+'.png'),fullPage:false});
  allowed=false;await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready')));await idle();check(!(await $('view').isVisible())&&await $('csv').isDisabled(),label+': permission revocation clears sensitive review and download');
  allowed=true;await $('access').click();await idle();await populate();
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  check(!(await $('view').isVisible())&&await $('csv').isDisabled()&&await $('period').inputValue()==='',label+': hidden page clears values and download');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await $('access').click();await idle();corrupt=true;await populate();check(!(await $('view').isVisible())&&await $('csv').isDisabled(),label+': invalid source hash blocks entire preparation');
  check(await page.evaluate(()=>!Object.keys(localStorage).some(k=>/f931/i.test(k))),label+': no F931 localStorage state');
 }finally{await context.close();}
}
try{await inspect({width:1440,height:1000},'desktop');await inspect({width:390,height:844},'mobile');assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);check(true,'read-only synthetic transport; no writes or browser pageerrors');
 fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({ok:true,scope:'built UI plus synthetic GET fixture transport; not real SQL/session/municipal acceptance',checks:checks.length,proofs:checks,errors,writes},null,2)+'\n');console.log(JSON.stringify({ok:true,checks:checks.length,output}));
}finally{await browser.close();}
