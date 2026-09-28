// Real report route, client catalogue filters, synthetic session and data only.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {chromium} from 'playwright';
import {batchFixture,batchPreview,BATCH_TENANT} from '../tests/fixtures/payroll-document-selection-synthetic.js';
import {publishedBuildVerification} from './lib/published-build-verification.mjs';
const live=process.argv.includes('--published'),origin=live?'https://municipio-junin-friendly.vercel.app':'https://document-filter.test',root=path.resolve('public'),out='verification/document-filters';fs.mkdirSync(out,{recursive:true});
const localRelease=JSON.parse(fs.readFileSync(path.join(root,'release-info.json'),'utf8'));
const build=publishedBuildVerification({origin,release:localRelease.commitSha??'manual',root});
const id=n=>'55555555-5555-4555-8555-'+String(n).padStart(12,'0'),fixtures=new Map(),catalogue=[];
for(const [n,date,type,state]of [[1,'2026-08-31','M','closed'],[2,'2026-08-31','P','open'],[3,'2025-12-31','M','closed'],[4,'2026-08-31','M','unknown']]){
 const f=batchFixture();Object.assign(f.metadata,{id:id(n),date,period:Number(date.slice(0,4)),month:Number(date.slice(5,7)),type,closureStatus:state});Object.assign(f.roster,{datasetId:id(n),date,type,closureStatus:state});fixtures.set(id(n),f);
 catalogue.push({datasetId:id(n),date,type,closureStatus:state,statementCount:62,lineCount:682,payloadHash:f.metadata.payloadHash,sourceLabel:'Fuente sintética '+n});
}
let omitted=false,truncated=false,denied=false,hold=false,releasePending;const calls=[],errors=[],assets=new Set(),checks=[];
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:1100},locale:'es-AR',serviceWorkers:'block'});
await context.route('**/*',async route=>{
 const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.abort();assert.equal(req.method(),'GET');
 if(!u.pathname.startsWith('/api/')){
  const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});let body=fs.readFileSync(file);
  if(live){const r=await build.fetchFile(u.pathname.slice(1));assert.equal(r.status,200);const bytes=Buffer.from(await r.arrayBuffer());assert.ok(bytes.equals(body),'Published bytes differ: '+u.pathname);body=bytes;assets.add(u.pathname);}
  return route.fulfill({status:200,body,contentType:file.endsWith('.html')?'text/html':/\.(m?js)$/.test(file)?'application/javascript':file.endsWith('.css')?'text/css':'application/json'});
 }
 const q=Object.fromEntries(u.searchParams);calls.push(q);const send=(data,status=200)=>route.fulfill({status,json:data,headers:{'Cache-Control':'private, no-store'}}).catch(()=>{});
 if(u.pathname==='/api/internal-auth')return send({ok:true,authenticated:true,sessionVersion:2,expiresAt:new Date(Date.now()+240000).toISOString(),user:{id:'fixture-user',name:'Operador QA',email:'qa@example.invalid'},access:{tenant:{id:BATCH_TENANT},tenantCapabilities:['payroll.read','workforce.employee.read'],platformRoles:[],platformCapabilities:[]}});
 if(q.resource==='payrollsourcereport'){const items=catalogue.filter(x=>!omitted||x.date.startsWith('2025'));return send({ok:true,data:{version:'payroll-source-report.v1',mode:'catalog',official:false,total:truncated?300:items.length,truncated,items}});}
 if(q.resource==='payrolldocumentbatch'){if(hold)await new Promise(r=>releasePending=r);if(denied)return send({ok:false,error:'Denied synthetic'},403);const f=fixtures.get(q.datasetId);assert.ok(f);const r=await batchPreview(q,f);return send(r.payload,r.status);}
 return send({ok:true,data:[]});
});
try{
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 if(live){assert.equal(localRelease.sourceState,'committed');const r=await build.fetchFile('release-info.json');assert.ok(Buffer.from(await r.arrayBuffer()).equals(fs.readFileSync(path.join(root,'release-info.json'))));}
 await page.goto(origin+'/reportes-rrhh.html');await page.locator('#reportContent:not([hidden])').waitFor();await page.locator('a[href="#seleccion-documental"]').click();
 const panel=page.locator('#seleccion-documental'),month=panel.getByLabel('Mes de liquidación',{exact:true}),type=panel.getByLabel('Tipo de liquidación',{exact:true}),dataset=panel.getByLabel('Liquidación documental',{exact:true});
 const load=()=>panel.getByRole('button',{name:'Consultar liquidaciones',exact:true}).click(),apply=()=>panel.getByRole('button',{name:'Aplicar selección',exact:true}).click();
 const status=panel.locator('[data-batch-status]'),catalogStatus=panel.locator('[data-batch-catalog-status]');
 assert.equal(await month.isDisabled(),true);await load();await month.locator('option[value="2026-08"]').waitFor({state:'attached'});
 assert.deepEqual(await month.locator('option').evaluateAll(options=>options.map(o=>o.value)),['all','2026-08','2025-12']);assert.equal(await dataset.locator('option').count(),5);
 assert.equal(calls.filter(q=>q.resource==='payrolldocumentbatch').length,0);checks.push('Carga el catálogo y habilita filtros sin consultar automáticamente legajos.');
 await month.selectOption('2026-08');await type.selectOption('M');assert.equal(await dataset.locator('option').count(),3);
 const labels=await dataset.locator('option').allTextContents();assert.ok(labels.some(x=>x.includes('00000001'))&&labels.some(x=>x.includes('00000004')));assert.match(await catalogStatus.innerText(),/más de una versión/);
 assert.ok(labels.some(x=>x.includes('Cierre no informado')));assert.equal(await dataset.inputValue(),'');checks.push('Filtra mes y tipo conjuntamente, mantiene versiones separadas y exige elegir la corrida exacta.');
 await dataset.selectOption(id(1));assert.match(await panel.locator('[data-batch-run-reference]').innerText(),/000000000001/);await panel.locator('[name=fromNumber]').fill('0020');await panel.locator('[name=toNumber]').fill('0040');await panel.locator('[name=fromSector]').fill('02');await apply();await status.filter({hasText:'Selección verificada: 21'}).waitFor();
 assert.equal(await panel.locator('[data-batch-rows]>tr').count(),21);assert.equal(calls.filter(q=>q.resource==='payrolldocumentbatch').at(-1).datasetId,id(1));checks.push('Aplica los rangos al dataset elegido sin cambiar la interpretación del mes o la fuente.');
 const nominalBefore=calls.filter(q=>q.resource==='payrolldocumentbatch').length;await month.selectOption('2025-12');await type.selectOption('P');
 assert.equal(await panel.locator('[data-batch-rows]').count(),0);assert.equal(await dataset.locator('option').count(),1);assert.match(await catalogStatus.innerText(),/No hay coincidencias/);
 assert.equal(await panel.getByRole('button',{name:'Aplicar selección',exact:true}).isDisabled(),true);assert.equal(calls.filter(q=>q.resource==='payrolldocumentbatch').length,nominalBefore);checks.push('Cero coincidencias conserva los filtros y retira el resultado anterior, sin ampliar la búsqueda.');
 await panel.getByRole('button',{name:'Limpiar mes y tipo',exact:true}).click();assert.equal(await month.inputValue(),'all');assert.equal(await type.inputValue(),'all');assert.equal(await panel.locator('[name=fromNumber]').inputValue(),'0020');assert.equal(await dataset.inputValue(),'');assert.equal(await month.evaluate(e=>e===document.activeElement),true);checks.push('Limpiar mes y tipo no borra los rangos y devuelve el foco al primer filtro.');
 await month.selectOption('2026-08');await type.selectOption('M');omitted=true;await load();await catalogStatus.filter({hasText:'0 de 1'}).waitFor();
 assert.equal(await month.inputValue(),'2026-08');assert.match(await month.locator('option:checked').innerText(),/no disponible/);assert.equal(await dataset.inputValue(),'');checks.push('Un mes retirado del nuevo catálogo queda señalado, no se cambia silenciosamente a otro.');
 omitted=false;truncated=true;await load();await catalogStatus.filter({hasText:'Catálogo limitado'}).waitFor();assert.match(await catalogStatus.innerText(),/no representa todo el histórico/);checks.push('Un catálogo limitado se identifica como consulta parcial, no como histórico completo.');
 await dataset.selectOption(id(4));await apply();await status.filter({hasText:'Selección verificada: 21'}).waitFor();assert.match(await panel.locator('.pdb-badge').innerText(),/Cierre no informado/);checks.push('El cierre desconocido sigue siendo desconocido al aplicar la versión elegida.');
 await panel.screenshot({path:out+'/desktop.png'});for(const width of [390,320]){
  await page.setViewportSize({width,height:900});await page.emulateMedia({reducedMotion:'reduce'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  for(const control of [month,type,panel.getByRole('button',{name:'Limpiar mes y tipo',exact:true})])assert.ok((await control.boundingBox()).height>=44);
  await panel.screenshot({path:out+'/mobile-'+width+'.png'});
 }checks.push('Mes, tipo y selección utilizables a 320/390 píxeles, con controles de 44 píxeles y sin desbordamiento.');
 hold=true;await apply();await panel.getByRole('button',{name:'Cancelar consulta',exact:true}).click();hold=false;releasePending?.();await page.waitForTimeout(200);
 assert.equal(await panel.locator('[data-batch-rows]').count(),0);assert.equal(await month.inputValue(),'2026-08');assert.equal(await type.inputValue(),'M');checks.push('Cancelar una consulta conserva los filtros y descarta el resultado tardío.');
 await apply();await status.filter({hasText:'Selección verificada: 21'}).waitFor();denied=true;await apply();await status.filter({hasText:'no habilita'}).waitFor();
 assert.equal(await panel.locator('[data-batch-rows]').count(),0);assert.equal(await month.isDisabled(),true);assert.equal(await type.isDisabled(),true);checks.push('La denegación de acceso conserva la retirada del detalle y deshabilita los filtros.');
 assert.deepEqual(errors,[]);if(live){const r=await build.fetchFile('release-info.json');assert.ok(Buffer.from(await r.arrayBuffer()).equals(fs.readFileSync(path.join(root,'release-info.json'))));}
 const result={ok:true,commit:localRelease.commitSha,mode:live?'published_assets_synthetic_api':'local_build_synthetic_api',checksPassed:checks.length,checks,errors,assets:[...assets],municipalSessionTested:false,privateRequestsForwarded:0,businessWrites:0};
 fs.writeFileSync(out+(live?'/published.json':'/result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{releasePending?.();await context.close();await browser.close();}
