/** Synthetic PDF and session only. No municipal record, database write or external request. */
import fs from 'node:fs';import http from 'node:http';import path from 'node:path';import assert from 'node:assert/strict';
import {chromium} from 'playwright';import {syntheticStructurePdf} from './budget-structure-synthetic.mjs';
const root=process.cwd(),out='verification/budget-structure';fs.mkdirSync(out,{recursive:true});
const entry=fs.readFileSync('public/estructura.html','utf8').match(/<section class="structure-task"[\s\S]*?<\/section>/)?.[0];assert.ok(entry,'BUILT_NOMINAL_ENTRY_REQUIRED');
const session=()=>({ok:true,authenticated:true,sessionVersion:2,user:{id:'synthetic-user'},access:{tenant:{id:'synthetic-tenant',roleKey:'QA'},tenantCapabilities:['workforce.structure.read','workforce.employee.read']},expiresAt:new Date(Date.now()+120000).toISOString()});
let auth=session(),delay=0,denied=false;const requests=[],errors=[],checks=[];
const server=http.createServer(async(req,res)=>{
 const name=new URL(req.url,'http://localhost').pathname;requests.push({method:req.method,path:name});
 if(req.method!=='GET'){res.writeHead(405);return res.end()}
 if(name==='/api/internal-auth'){if(delay)await new Promise(r=>setTimeout(r,delay));res.writeHead(denied?403:200,{'content-type':'application/json','cache-control':'no-store'});return res.end(JSON.stringify(auth))}
 if(name==='/'){res.setHeader('content-type','text/html');return res.end('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/assets/budget-structure.css"><link rel="stylesheet" href="/assets/structure-task-entry.css"><body style="margin:16px;font-family:Arial">'+entry+'<main></main><script>window.MuniControlCapabilityGate={ready:Promise.resolve({tenantCapabilities:new Set(["workforce.structure.read","workforce.employee.read"])})}</script><script type="module">import {mountAuthorizedBudgetStructure} from "/assets/budget-structure-workbench.js";mountAuthorizedBudgetStructure(document.querySelector("main"))</script></body></html>')}
 const file=name.startsWith('/assets/vendor/pdf')?path.join(root,'node_modules/pdfjs-dist/build',path.basename(name)):path.resolve(root,'.'+name);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end()}
 res.setHeader('content-type',name.endsWith('.css')?'text/css':'application/javascript');res.end(fs.readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
try{
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1180,height:850}});page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 const origin='http://127.0.0.1:'+server.address().port;await page.goto(origin);const input=page.getByLabel('Reporte PDF de estructura',{exact:true});
 await input.waitFor();const linkTarget=new URL(await page.getByRole('link',{name:'Abrir detalle nominal de cargos'}).getAttribute('href'),origin);assert.equal(linkTarget.pathname,'/reportes');assert.equal(linkTarget.hash,'#estructura-presupuestaria');checks.push('La entrada nominal usa la página de reportes y su sección documental, no un ancla local de la vista agregada.');
 await page.locator('.structure-task').screenshot({path:out+'/nominal-entry-desktop.png'});
 const upload=()=>input.setInputFiles({name:'synthetic-structure.pdf',mimeType:'application/pdf',buffer:syntheticStructurePdf()});
 const ready=()=>page.getByRole('status').filter({hasText:'Reporte leído completo'}).waitFor();
 await upload();await ready();assert.equal(await page.locator('.bs-card').count(),5);assert.equal(await page.locator('.bs-card').first().locator('tbody tr').count(),25);checks.push('real nested PDF worker reads a complete three-page synthetic report with cross-page members');
 await page.getByRole('button',{name:'Legajos siguientes',exact:true}).click();assert.equal(await page.locator('.bs-card').first().locator('tbody tr').count(),5);
 const before=requests.length;await page.getByRole('button',{name:'Estructuras siguientes',exact:true}).click();assert.equal(await page.locator('.bs-card').count(),2);assert.equal(requests.length,before);checks.push('local pagination bounds structure and member DOM without fetching other records');
 await page.getByRole('searchbox').fill('qa 029');assert.equal(await page.locator('.bs-card').count(),1);assert.match(await page.locator('.bs-metrics').innerText(),/30/);checks.push('a member match retains the complete 30-member structure and unchanged quantity');
 for(const mode of ['simple','detailed']){
  await page.getByLabel('Vista',{exact:true}).selectOption(mode);const next=page.waitForEvent('download');await page.getByRole('button',{name:'Exportar PDF',exact:true}).click();const download=await next;const file=path.join(out,mode+'-synthetic.pdf');await download.saveAs(file);
  const text=await page.evaluate(async bytes=>{const p=await import('/assets/vendor/pdf.min.mjs');p.GlobalWorkerOptions.workerSrc='/assets/vendor/pdf.worker.min.mjs';const task=p.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,enableXfa:false});const doc=await task.promise;let text='';for(let n=1;n<=doc.numPages;n++)text+=(await(await doc.getPage(n)).getTextContent()).items.map(i=>i.str).join(' ')+' ';await task.destroy();return text},Array.from(fs.readFileSync(file)));
  assert.match(text,/Sin firma ni homologación presupuestaria/);assert.match(text,/1 de 7 estructuras/);if(mode==='detailed'){assert.match(text,/PERSONA QA 001/);assert.match(text,/PERSONA QA 030/)}else assert.doesNotMatch(text,/PERSONA QA 001/);
 }
 checks.push('PDF is parsed back: simple excludes names, detailed includes all selected members across pages and source scope');
 await page.getByRole('searchbox').fill('');await page.getByLabel('Vista',{exact:true}).selectOption('detailed');await page.screenshot({path:out+'/desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.locator('.structure-task').screenshot({path:out+'/nominal-entry-mobile.png'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:out+'/mobile.png'});checks.push('390px viewport retains readable controls and has no horizontal overflow');
 await page.getByRole('button',{name:'Limpiar / cancelar',exact:true}).click();assert.equal(await page.locator('.bs-card').count(),0);assert.equal(await input.inputValue(),'');checks.push('clear removes the selected file and nominal view');
 delay=300;await upload();await page.getByRole('button',{name:'Limpiar / cancelar',exact:true}).click();await page.waitForTimeout(350);assert.equal(await page.locator('.bs-card').count(),0);delay=0;checks.push('cancel during authorization prevents a delayed parse from restoring data');
 await upload();await ready();auth={...session(),access:{...session().access,tenant:{id:'different-synthetic-tenant',roleKey:'QA'}}};await page.getByRole('button',{name:'Exportar PDF',exact:true}).click();await page.getByRole('status').filter({hasText:'institución de la sesión cambió'}).waitFor();assert.equal(await page.locator('.bs-card').count(),0);checks.push('same capability in another tenant cannot export a previously opened source');
 auth=session();await page.reload();await upload();await ready();denied=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.getByRole('status').filter({hasText:'institución de la sesión cambió'}).waitFor();assert.equal(await page.locator('.bs-card').count(),0);checks.push('lost session on focus removes visible nominal data');
 denied=false;await page.reload();await input.setInputFiles({name:'wrong.pdf',mimeType:'application/pdf',buffer:Buffer.from('not a PDF')});await page.getByRole('status').filter({hasText:'No se pudo verificar'}).waitFor();assert.equal(await page.locator('.bs-card').count(),0);checks.push('malformed source does not produce partial or fabricated results');
 assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);assert.ok(requests.every(r=>r.method==='GET'));assert.deepEqual(errors,[]);checks.push('no uncaught errors, browser-storage persistence, uploads or mutation requests');
 const result={ok:true,checksPassed:checks.length,checks,syntheticOnly:true,databaseWrites:0,filesUploaded:0,realMunicipalSessionTested:false};fs.writeFileSync(out+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();await new Promise(r=>server.close(r))}
