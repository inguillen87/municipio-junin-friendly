import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const stage=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let canonical=stage;while(!fs.existsSync(path.join(canonical,'package.json'))&&path.dirname(canonical)!==canonical)canonical=path.dirname(canonical);
assert.ok(fs.existsSync(path.join(canonical,'assets/payroll-f931-workbench.js')));
const {launchOwnSyntheticBrowser}=await import(pathToFileURL(path.join(canonical,'scripts/lib/own-synthetic-browser.mjs')));
const output=path.resolve(process.env.F931_PHYSICAL_BROWSER_OUTPUT??path.join(stage,'verification/f931-physical-browser'));fs.mkdirSync(output,{recursive:true});
const checks=[],errors=[],requests=[];let browser,page;
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json; charset=utf-8'};
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;requests.push({method:req.method,path:pathname});
 if(pathname==='/favicon.ico'){res.writeHead(204).end();return;}
 if(pathname==='/api/internal-auth'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify({ok:true,authenticated:true,sessionVersion:2,user:{id:'qa-physical-user'},expiresAt:new Date(Date.now()+3600000).toISOString(),access:{tenant:{id:'qa-physical-tenant',membershipId:'qa-physical-membership',roleKey:'qa-reader'},tenantCapabilities:['workforce.summary.read'],platformCapabilities:[],platformRoles:[]}}));return;}
 if(req.method!=='GET'){res.writeHead(405).end();return;}
 let file;for(const root of [stage,canonical]){const target=path.resolve(root,'.'+decodeURIComponent(pathname));if(target.startsWith(root+path.sep)&&fs.existsSync(target)&&fs.statSync(target).isFile()){file=target;break;}}
 if(!file){res.writeHead(404,{'Content-Type':'text/plain'}).end('Not found');return;}
 res.writeHead(200,{'Content-Type':mime[path.extname(file)]??'application/octet-stream','Cache-Control':'no-store'});if(pathname==='/reportes-rrhh.html'){let html=fs.readFileSync(file,'utf8');if(!html.includes('internal-capability-gate.js'))html=html.replace('</head>','<script src="/assets/internal-capability-gate.js"></script></head>');res.end(html);return;}fs.createReadStream(file).pipe(res);
});
const check=(name,value)=>{assert.ok(value,name);checks.push(name);};
const row=(id,width=499)=>Buffer.from(('PERSONA-PRIVADA-QA-'+String(id).padStart(5,'0')+' ').padEnd(width,'X'),'ascii');
const fixture=(rows,ending='\r\n')=>Buffer.concat(rows.flatMap(r=>[r,Buffer.from(ending)]));
const general=Array.from({length:759},(_,i)=>row(i)),fixtures={general:fixture([...general,general[0]]),jurisdiction_42:fixture([...general.slice(0,731),general[5]]),jurisdiction_55:fixture(general.slice(600))};
async function selectFiles(target,values=fixtures){for(const [scope,buffer]of Object.entries(values))await target.locator('[data-fp-scope="'+scope+'"]').setInputFiles({name:'NOMBRE-PRIVADO-'+scope+'.txt',mimeType:'text/plain',buffer});}
const done=async target=>{await target.locator('[data-fp-result]').waitFor({state:'visible'});await target.getByRole('button',{name:'Comparar archivos completos',exact:true}).waitFor();await page.waitForFunction(el=>el.getAttribute('aria-busy')==='false',await target.elementHandle());};
async function compare(target){await target.locator('[data-fp-review]').click();await done(target);}

try{
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const origin='http://127.0.0.1:'+server.address().port,launched=await launchOwnSyntheticBrowser();browser=launched.browser;
 for(const width of [1366,390,320]){
  const context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true,serviceWorkers:'block'});page=await context.newPage();
  page.on('pageerror',e=>errors.push({width,message:e.message}));page.on('request',r=>{if(new URL(r.url()).origin!==origin)errors.push({width,externalRequest:r.url()});});
  await page.goto(origin+'/reportes-rrhh.html#f931');await page.locator('#reportContent').waitFor({state:'visible'});const target=page.locator('[data-f931-physical]');await target.waitFor({state:'visible'});
  check(width+': fiscal generation remains disabled',await page.locator('[data-f931-generate]').isDisabled());check(width+': fiscal submission remains disabled',await page.locator('[data-f931-submit]').isDisabled());
  await target.locator('[data-fp-period]').fill('2026-08');await selectFiles(target);await compare(target);
  check(width+': all1651physicalrows counted',(await target.locator('[data-fp-total]').innerText()).startsWith('1651 filas físicas'));
  const generalText=await target.locator('[data-fp-artifact="general"]').innerText();check(width+': all760Generalrows and oneextra repetition',/Filas físicas\s+760/.test(generalText)&&/Repeticiones adicionales de filas idénticas\s+1/.test(generalText));
  await target.locator('[data-fp-artifact="general"] summary').click();check(width+':499bytes accepted without fiscal validation',/Anchos de fila \(bytes\)\s+499 a 499/.test(await target.locator('[data-fp-artifact="general"]').innerText()));await target.locator('[data-fp-artifact="general"] summary').click();
  const visible=await target.innerText();check(width+': no source values or filenames visible',!/PERSONA-PRIVADA|NOMBRE-PRIVADO/.test(visible));check(width+': no fiscal interpretation promised',visible.includes('No indican personas duplicadas ni errores fiscales'));
  const event=page.waitForEvent('download');await target.locator('[data-fp-csv]').click();const download=await event;const file=path.join(output,'control-'+width+'.csv');await download.saveAs(file);await done(target);const csv=fs.readFileSync(file,'utf8');
  check(width+': complete53CSVlines and no source content',csv.split('\r\n').length===53&&!/PERSONA-PRIVADA|NOMBRE-PRIVADO|sha256|[a-f0-9]{64}/i.test(csv));check(width+':CSVretainsall759distinctGeneralrows',csv.includes('"General";"Filas distintas por bytes";"759"'));
  const geometry=await target.evaluate(el=>({documentWidth:document.documentElement.scrollWidth,viewport:innerWidth,controls:[...el.querySelectorAll('button,label.fp-file-label,input[type=month]')].filter(n=>n.getClientRects().length).map(n=>n.getBoundingClientRect().height)}));
  check(width+': no horizontal overflow',geometry.documentWidth<=width);check(width+':44pxcontrols',geometry.controls.every(h=>h>=44));await target.screenshot({path:path.join(output,'physical-'+width+'.png')});
  await target.locator('[data-fp-period]').fill('2026-09');check(width+':periodchange withdraws result',!await target.locator('[data-fp-result]').isVisible()&&!await target.locator('[data-fp-csv]').isVisible());await compare(target);
  await target.locator('[data-fp-scope="general"]').setInputFiles({name:'CAMBIADO-PRIVADO.txt',mimeType:'text/plain',buffer:fixture([...general.slice(1),row(999),row(999)])});check(width+':filechange withdraws result',!await target.locator('[data-fp-result]').isVisible());await compare(target);
  if(width===1366){
   await page.evaluate(()=>document.documentElement.setAttribute('data-mc-capability-state','denied'));await page.waitForFunction(()=>!document.querySelector('[data-fp-scope="general"]').files.length);
   check('accessrevocation: result withdrawn, files erased, controls disabled',!await target.locator('[data-fp-result]').isVisible()&&await target.locator('[data-fp-review]').isDisabled());
   await page.evaluate(()=>document.documentElement.setAttribute('data-mc-capability-state','ready'));await page.waitForFunction(()=>!document.querySelector('[data-fp-review]').disabled);await selectFiles(target);await compare(target);
   await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:new Set()}})));check('capabilitychange: result and CSV withdrawn',!await target.locator('[data-fp-result]').isVisible()&&!await target.locator('[data-fp-csv]').isVisible());
   check('capabilityrevocation: empty capabilities stay denied whileDOMready',await target.locator('[data-fp-review]').isDisabled()&&await target.locator('[data-fp-scope="general"]').isDisabled()&&await page.evaluate(()=>document.documentElement.getAttribute('data-mc-capability-state')==='ready'));
   await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:new Set(['payroll.read'])}})));check('capabilityrevocation: unrelated capability cannot enable Reportes',await target.locator('[data-fp-review]').isDisabled());
   await page.evaluate(()=>document.dispatchEvent(new CustomEvent('municontrol:capabilities-ready',{detail:{tenantCapabilities:new Set(['workforce.summary.read'])}})));check('capabilityrestored: existing Reportes authority can re-enable empty form',!await target.locator('[data-fp-review]').isDisabled());
   await selectFiles(target);await compare(target);await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
   check('visibilitychange: result and files erased',!await target.locator('[data-fp-result]').isVisible()&&await target.locator('[data-fp-scope="general"]').evaluate(el=>el.files.length===0));await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
   await selectFiles(target);await compare(target);await page.evaluate(()=>document.querySelector('#f931').hidden=true);await page.waitForFunction(()=>document.querySelector('[data-fp-scope="general"]').files.length===0);await page.evaluate(()=>document.querySelector('#f931').hidden=false);
   check('hiddenancestor: review withdrawn',!await target.locator('[data-fp-result]').isVisible());
   await page.evaluate(async()=>{
    const {mountF931PhysicalPackage}=await import('/assets/payroll-f931-physical-package-panel.js');const container=document.createElement('div');container.id='pending-fixture';document.body.append(container);
    let release;const gate=new Promise(resolve=>release=resolve);window.__releasePhysicalRead=release;mountF931PhysicalPackage(container,{readFile:async file=>{await gate;return file.arrayBuffer();}});
   });
   const pending=page.locator('#pending-fixture [data-f931-physical]');await pending.locator('[data-fp-period]').fill('2026-08');await selectFiles(pending);await pending.locator('[data-fp-review]').click();await page.waitForFunction(()=>document.querySelector('#pending-fixture [data-f931-physical]').getAttribute('aria-busy')==='true');
   await page.evaluate(()=>{document.querySelector('#pending-fixture').hidden=true;});await page.waitForFunction(()=>document.querySelector('#pending-fixture [data-fp-scope]').files.length===0);await page.evaluate(()=>window.__releasePhysicalRead());await page.waitForTimeout(100);await page.evaluate(()=>document.querySelector('#pending-fixture').hidden=false);
   check('pendingread: hidden operation cannot restore result',!await pending.locator('[data-fp-result]').isVisible()&&!await pending.locator('[data-fp-csv]').isVisible());
   // A reader can change bytes without changing the File object; download must
   // re-read and compare complete-file proofs, even with identical row counts.
   await page.evaluate(async()=>{
    const {mountF931PhysicalPackage}=await import('/assets/payroll-f931-physical-package-panel.js');const container=document.createElement('div');container.id='changed-fixture';document.body.append(container);let reads=0;window.__physicalDownloads=0;
    mountF931PhysicalPackage(container,{readFile:async file=>{const b=new Uint8Array(await file.arrayBuffer());if(++reads>3)b[0]=b[0]===65?66:65;return b.buffer;},download:()=>window.__physicalDownloads++});
   });
   const changed=page.locator('#changed-fixture [data-f931-physical]');await changed.locator('[data-fp-period]').fill('2026-08');await selectFiles(changed);await compare(changed);await changed.locator('[data-fp-csv]').click();await changed.locator('[data-fp-status]').filter({hasText:'Cambió un archivo.'}).waitFor();check('download: same-count differentbytes require fresh review',await page.evaluate(()=>window.__physicalDownloads===0));
  }
  check(width+': noF931storage',await page.evaluate(()=>![...Object.keys(localStorage),...Object.keys(sessionStorage)].some(key=>/f931|physical/i.test(key))));await context.close();page=null;
 }
 check('localGETonly: no request body or write',requests.every(r=>r.method==='GET'));check('browser: no page errors or egress',errors.length===0);
 const sourceFiles=['assets/payroll-f931-physical-package-model.js','assets/payroll-f931-physical-package-panel.js','assets/payroll-f931-physical-package.css','assets/payroll-f931-workbench.js'];
 const proof={passed:true,checks:checks.length,results:checks,viewports:[1366,390,320],browserVersion:browser.version(),syntheticOnly:true,sourceMode:'real existing report HTML and private-stage asset overrides',sql:false,authenticationFixture:true,actualExistingCapabilityGate:true,visibilityEventSynthetic:true,requestMethods:[...new Set(requests.map(r=>r.method))],errors,sourceHashes:Object.fromEntries(sourceFiles.map(f=>[f,createHash('sha256').update(fs.readFileSync(path.join(stage,f))).digest('hex')]))};fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(proof,null,2)+'\n');process.stdout.write(JSON.stringify({passed:true,checks:checks.length,output})+'\n');
}catch(error){await page?.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({message:error.message,checks,errors,requests},null,2)+'\n');throw error;}
finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
