// Automated, offline Chromium regression. New ephemeral context. No account, no real DB or domain session.
// From a packaged directory set MC_QA_PRODUCT to source root; optional MC_QA_BROWSER_MODULE and
// MC_QA_LOCAL_CHART / MC_QA_LOGO point to local test dependencies, never a browser profile.
import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.MC_QA_BROWSER_MODULE||'playwright');
const src=path.resolve(process.env.MC_QA_PRODUCT||fileURLToPath(new URL('..',import.meta.url)));
const screenshots=process.env.MC_QA_SCREENSHOTS;
const chart=process.env.MC_QA_LOCAL_CHART;
const logo=process.env.MC_QA_LOGO;
const token='a'.repeat(64),token2='b'.repeat(64);
// The metadata is parsed from the actual immutable product case registry (no synthetic labels on the screen).
const modelPath=path.join(src,'lib/developer-homologation-trials.js');
const modelSource=await fs.readFile(modelPath,'utf8');
const cases=[...modelSource.matchAll(/^  \['([a-z][a-z0-9-]+)','(preparation|review|control)','([^']+)','([^']+)',[A-Za-z]+\],?$/gm)].map(([,id,role,label,description])=>({id,role,label,description}));
assert(cases.length>=9 && new Set(cases.map(c=>c.id)).size===cases.length);
const outputs=[];const checks=[];
const browser=await chromium.launch({headless:true,args:['--disable-background-networking']});
try{
 for(const [tag,viewport] of [['desktop',{width:1365,height:960}],['mobile',{width:360,height:800}]]){
  const ctx=await browser.newContext({viewport,locale:'es-AR',timezoneId:'America/Argentina/Buenos_Aires',reducedMotion:'reduce',serviceWorkers:'block'});
  const page=await ctx.newPage();let active=false,scope=token,force409=false,trialWrites=0,loadChart=true,liveChecks=0;
  let practice={state:'empty',revision:0,amount:null,lastStep:null};const seen=[];const pageErrors=[];
  page.on('pageerror',err=>pageErrors.push(String(err)));
  const exp=()=>new Date(Date.now()+3600e3).toISOString();
  const state=()=>({ok:true,active,scopeToken:scope,expiresAt:active?exp():null,operatorLabel:'Operador de pruebas'});
  await ctx.route('**/*',async route=>{
   const request=route.request(), url=new URL(request.url()),pathname=url.pathname;
   if(url.origin!=='https://homologacion-qa.invalid')throw Error('Unexpected external request '+url.origin);
   if(pathname==='/api/internal-developer-homologation'){
    const op=url.searchParams.get('op'),json=v=>route.fulfill({json:v,headers:{'Cache-Control':'no-store'}});
    const post=request.method()==='POST';const body=post?request.postDataJSON():null;seen.push({op,post});
    if(post){assert.equal(request.headers()['x-homologation-scope'],scope);assert.match(request.headers()['content-type'],/^application\/json/);}
    if(op==='status')return json(state());
    if(op==='start'){assert.deepEqual(body,{reviewed:true});active=true;scope=token2;return json(state());}
    if(op==='workspace'){liveChecks++;return json({...state(),cases,readiness:{period:url.searchParams.get('period')||'2026-10',registered:29,masterItems:37,activeScales:7,activeConcepts:10,activeAuxiliaries:1,monthlyRules:0,programRevision:1,masterRevision:2,captures:1,results:0,registeredAfterPeriod:null,diagnosis:['Ejemplo de prueba: no hay reglas vigentes para este mes.'],complete:false}});}
    if(op==='trial'){trialWrites++;if(force409)return route.fulfill({status:409,json:{ok:false,code:'SCOPE_CHANGED'}});assert(cases.some(c=>c.id===body.caseId));return json({...state(),result:{id:body.caseId,status:'passed',detail:'Validación de interfaz con respuesta de ejemplo.',checks:[{label:'El modelo confirmó el caso pedido',passed:true}]}});}
    if(op==='practice'){
      if(post){assert.equal(body.expectedRevision,practice.revision);
       practice={state:{draft:'pending',approve:'approved',reject:'rejected',reset:'empty'}[body.step],revision:practice.revision+1,amount:body.step==='draft'?body.amount:body.step==='reset'?null:practice.amount,lastStep:body.step};}
      return json({...state(),practice});
    }
    if(op==='stop'){assert.deepEqual(body,{});active=false;scope=token;return json(state());}
    throw Error('Unexpected op '+op);
   }
   if(pathname==='/homologacion')return route.fulfill({path:path.join(src,'homologacion-desarrollo.html'),contentType:'text/html'});
   if(pathname==='/assets/mc-charts.js' && chart && loadChart)return route.fulfill({path:chart,contentType:'text/javascript'});
   if(pathname==='/assets/brand/logo-horizontal-inverse.svg'&&logo)return route.fulfill({path:logo,contentType:'image/svg+xml'});
   if(/^\/assets\/developer-homologation[-a-z]*\.(css|js)$/.test(pathname))return route.fulfill({path:path.join(src,pathname.slice(1)),contentType:pathname.endsWith('css')?'text/css':'text/javascript'});
   return route.fulfill({status:404,body:''});
  });
  const textIs=async(id,str)=>{await page.locator('#'+id).filter({hasText:str}).waitFor();};
  await page.goto('https://homologacion-qa.invalid/homologacion');await page.locator('#qa-intro').waitFor();
  assert(await page.locator('#qa-start').isDisabled());checks.push(tag+': inicio requiere confirmación');
  await page.check('#qa-reviewed');await page.click('#qa-start');await page.locator('#qa-role:not(:disabled)').waitFor();await page.getByRole('button',{name:'Preparar novedad',exact:true}).waitFor();
  const run=async id=>{const c=cases.find(v=>v.id===id);await page.selectOption('#qa-function','all');await page.selectOption('#qa-role',c.role);await page.getByRole('button',{name:'Ejecutar control: '+c.label,exact:true}).click();await textIs('qa-notice','Verificado');};
  await run('alta-preparar');await run('novedad-revisar');assert.equal(trialWrites,2);
  await textIs('qa-progress-copy','2 de '+cases.length);assert(await page.locator('#qa-history-title').evaluate(e=>e===document.activeElement));checks.push(tag+': ejecución por rol, foco y progreso exacto');
  if(chart){await page.locator('#qa-chart canvas').waitFor();checks.push(tag+': ECharts local representa estados');}
  await page.locator('#qa-stat-details summary').click();await textIs('qa-stats','Novedades: 1 verificados');await page.locator('#qa-stat-details summary').click();
  await page.fill('#qa-month','2026-09');await page.click('#qa-read');await textIs('qa-readiness','Datos registrados · 2026-09');assert((await page.locator('#qa-readiness').innerText()).includes('No disponible'));assert(liveChecks>=2);
  await page.fill('#qa-manual-importe','0,00');await page.getByRole('button',{name:'Preparar novedad',exact:true}).click();await page.getByRole('button',{name:'Aprobar en el ensayo'}).click();await textIs('qa-manual-novelty','Aprobada en el ensayo');checks.push(tag+': interacción manual y consulta mensual');
  const download=page.waitForEvent('download');await page.click('#qa-export');const result=await download;const bytes=await fs.readFile(await result.path(),'utf8');assert(!bytes.includes(token)&&!bytes.includes(token2)&&!bytes.includes('Operador de pruebas'));const report=JSON.parse(bytes);assert.equal(report.controlesEnInforme,2);assert.equal(report.datosDePeriodo.period,'2026-09');checks.push(tag+': descarga JSON filtrada sin actor ni tokens');
  await page.selectOption('#qa-role','all');await page.evaluate(()=>window.scrollTo(0,0));await page.waitForFunction(()=>document.documentElement.scrollWidth<=window.innerWidth);
  if(screenshots){await fs.mkdir(screenshots,{recursive:true});for(const [kind,selector] of [['vista',null],['funciones','#qa-cases-title']]){
   if(selector)await page.locator(selector).evaluate(e=>window.scrollTo(0,e.getBoundingClientRect().top+scrollY-82));
   const name='HOMOLOGACION_'+tag+'_'+kind+'.png';const bytes=await page.screenshot({path:path.join(screenshots,name),animations:'disabled'});outputs.push({name,sha256:createHash('sha256').update(bytes).digest('hex')});}}
  checks.push(tag+': sin desplazamiento horizontal a ancho '+viewport.width);
  force409=true;await page.selectOption('#qa-role','review');await page.getByRole('button',{name:'Ejecutar control: '+cases.find(c=>c.id==='baja-revisar').label}).click();await page.locator('#qa-recovery').waitFor();assert(await page.locator('#qa-workspace').isHidden());assert.equal(trialWrites,3);await page.waitForTimeout(120);assert.equal(trialWrites,3);checks.push(tag+': cambio de alcance despeja y no reenvía el POST');
  force409=false;loadChart=false;await page.click('#qa-refresh');await page.locator('#qa-workspace').waitFor();await textIs('qa-progress-copy','0 de '+cases.length);
  await page.click('#qa-stop');await page.click('#qa-stop-no');assert(active);await page.click('#qa-stop');await page.click('#qa-stop-yes');await page.locator('#qa-intro').waitFor();assert(!active);assert(await page.locator('#qa-workspace').isHidden());checks.push(tag+': cancelar y revocar requieren acciones distintas');
  // Exercise optional chart loading failure on a new page. Counts and actions must still work.
  loadChart=false;await page.reload();await page.locator('#qa-intro').waitFor();await page.check('#qa-reviewed');await page.click('#qa-start');
  await page.locator('#qa-role:not(:disabled)').waitFor();await run('alta-preparar');await textIs('qa-progress-copy','1 de '+cases.length);
  assert(await page.locator('#qa-chart-wrap').isHidden());await page.locator('#qa-stat-details summary').click();await textIs('qa-stats','Altas: 1 verificados');
  checks.push(tag+': gráfico local ausente conserva conteo, desglose y controles');
  assert.deepEqual(pageErrors,[]);await ctx.close();
 }
 if(screenshots)await fs.writeFile(path.join(screenshots,'RECIBO_QA_VISUAL.json'),JSON.stringify({alcance:'Respuestas simuladas; Chromium aislado, sin acceso a usuarios o base real.',at:new Date().toISOString(),versionBrowser:browser.version(),chartIncluded:Boolean(chart),checks,outputs},null,2));
 console.log(JSON.stringify({checks,outputs,chartIncluded:Boolean(chart)}));
}finally{await browser.close();}
