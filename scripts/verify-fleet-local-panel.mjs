import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { fleetOverview } from '../local-agents/clock-fleet/overview.mjs';

const sourceRoot=fileURLToPath(new URL('../local-agents/pm10/',import.meta.url));
export function verifyPm10Manifest(root=sourceRoot){
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'SHA256SUMS.json'),'utf8'));
 assert.ok(manifest&&typeof manifest==='object'&&!Array.isArray(manifest),'PM10_MANIFEST_INVALID');
 const names=Object.keys(manifest).sort();assert.ok(names.length>0,'PM10_MANIFEST_EMPTY');
 const actual=[];
 for(const entry of fs.readdirSync(root,{recursive:true})){
  const file=path.join(root,entry),stat=fs.lstatSync(file);assert.ok(!stat.isSymbolicLink(),'PM10_SOURCE_LINK');
  if(stat.isDirectory())continue;
  assert.ok(stat.isFile(),'PM10_SOURCE_TYPE');
  const name=entry.split(path.sep).join('/');if(name!=='SHA256SUMS.json')actual.push(name);
 }
 assert.deepEqual(names,actual.sort(),'PM10_MANIFEST_COVERAGE');
 for(const name of names){
  assert.match(name,/^[A-Za-z0-9_./-]+$/,'PM10_MANIFEST_PATH');
  assert.ok(!name.startsWith('/')&&!name.split('/').some(p=>!p||p==='.'||p==='..'),'PM10_MANIFEST_PATH');
  assert.match(manifest[name],/^[a-f0-9]{64}$/,'PM10_MANIFEST_HASH');
  assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex'),manifest[name],'PM10_SOURCE_MISMATCH '+name);
 }
 return{files:names.length};
}

export async function main(args=process.argv.slice(2)){
 assert.ok(args.length===0||(args.length===1&&args[0]==='--manifest-only'),'ARGUMENT_INVALID');
 const manifest=verifyPm10Manifest();
 if(args[0]==='--manifest-only'){const result={ok:true,manifestFiles:manifest.files,networkRequests:0};console.log(JSON.stringify(result));return result;}
 const out='verification/fleet-local-panel';fs.mkdirSync(out,{recursive:true});
 const config={clocks:[{clockId:'qa-a',label:'PM-14 · Edificio Nuevo',enabled:true},{clockId:'qa-b',label:'PM-02 · Compras y Suministros',enabled:true},{clockId:'qa-c',label:'PM-05 · Delegación La Colonia',enabled:true}]};
 const time='2026-09-18T14:00:00.000Z';
 const summary={updatedAt:time,clocks:[{clockId:'qa-a',status:'captured_locally',lastAttemptAt:time,lastCaptureAt:time,uniqueLocalRecords:1200,nextPollAt:'2026-09-18T14:15:00Z'},{clockId:'qa-b',status:'retry_wait',blocked:false,connectionFailureCount:8,lastAttemptAt:time,lastError:'CONNECT_TIMEOUT',nextPollAt:'2026-09-18T14:15:00Z'},{clockId:'qa-c',status:'blocked',blocked:true,lastAttemptAt:time,lastError:'AUTH_NOT_ACCEPTED'}]};
 const browser=await chromium.launch({headless:true,...(process.env.QA_CHROMIUM?{executablePath:process.env.QA_CHROMIUM}:{})});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));let requests=0;
  await context.route('**/*',route=>{requests++;return route.abort();});
  await context.routeWebSocket('**/*',socket=>{requests++;socket.close();});
  const metrics=async expected=>{for(const [key,value]of Object.entries(expected))assert.equal(await page.locator(`[data-metric="${key}"] strong`).innerText(),String(value));};
  const card=label=>page.locator('article.clock-card').filter({has:page.getByRole('heading',{name:label,exact:true})});
  await page.setContent(fleetOverview(config,summary,{desired:'running',pm10:{lastCaptureAt:time,lastReceiptAt:time,confirmedRecords:456}}));
  await metrics({configured:4,captured:2,withReceipt:1,needsReview:1});
  assert.equal(await page.locator('article').count(),4);assert.equal(await page.locator('article.clock-card').count(),4);
  assert.match(await card('PM-14 · Edificio Nuevo').innerText(),/Captura guardada/);
  assert.match(await card('PM-02 · Compras y Suministros').innerText(),/Reintento de captura programado/);
  assert.match(await card('PM-02 · Compras y Suministros').innerText(),/Hay un reintento programado/);
  assert.match(await card('PM-05 · Delegación La Colonia').innerText(),/Captura detenida para revisión/);
  assert.match(await card('PM-05 · Delegación La Colonia').innerText(),/No se prueban otras claves/);
  assert.match(await card('PM-10 · Edificio Viejo').innerText(),/Acuse guardado/);
  assert.match(await card('PM-10 · Edificio Viejo').innerText(),/456/);
  assert.equal(await page.getByText('Recepción no consultada',{exact:true}).count(),3);
  assert.doesNotMatch(await page.locator('body').innerText(),/Recepción en Neon: no configurada|14 conectados|adicional|separad|especial/i);
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.screenshot({path:out+'/panel-'+width+'.png',fullPage:true});
  }
  const delivery={state:'queue_confirmed',enabled:true,scope:'canonical',checkedAt:time,lastReceiptAt:time,confirmedRecords:456,pendingParts:0,nextAttemptAt:null,evidenceState:'verified'};
  await page.setContent(fleetOverview(config,summary,{desired:'running',pm10:{capture:{state:'blocked',blocked:true,lastError:'LAYOUT_NOT_CONFIRMED',lastAttemptAt:time,lastCaptureAt:time,records:456,evidenceState:'verified'},delivery}}));
  await metrics({configured:4,captured:2,withReceipt:1,needsReview:2});
  assert.match(await card('PM-10 · Edificio Viejo').innerText(),/Captura detenida para revisión/);
  assert.match(await card('PM-10 · Edificio Viejo').innerText(),/Acuse guardado/);
  assert.match(await card('PM-10 · Edificio Viejo').innerText(),/Se conservan la cola y sus comprobantes/);
  await page.setContent(fleetOverview(config,summary,{desired:'running',pm10:{capture:{state:'waiting',blocked:false,lastAttemptAt:null,lastCaptureAt:null,records:null,evidenceState:'missing'},delivery}}));
  await metrics({configured:4,captured:1,withReceipt:1,needsReview:1});
  assert.match(await card('PM-10 · Edificio Viejo').innerText(),/Esperando primera captura/);
  assert.match(await card('PM-10 · Edificio Viejo').innerText(),/Acuse guardado/);
  assert.equal(requests,0);assert.deepEqual(errors,[]);
  const result={ok:true,checks:10,manifestFiles:manifest.files,syntheticStatus:true,networkRequests:0,hardwareConnections:0,mobileWidths:[390,320]};
  fs.writeFileSync(out+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));return result;
 }finally{await browser.close();}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)await main();
